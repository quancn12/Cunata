import type {
  AttemptKey,
  Result,
} from '../schema/types.ts';

import type {
  StoragePort,
  AttemptRecord,
  BroadcastChannelPort,
  StorageBroadcastType,
  StorageBroadcastNotification,
} from './types.ts';

export const DEFAULT_STORAGE_BROADCAST_CHANNEL = 'cunata-storage-sync';

export type {
  BroadcastChannelPort,
  StorageBroadcastType,
  StorageBroadcastNotification,
};

/**
 * Global in-memory broadcast bus registry for Node tests and environments
 * where isolated cross-tab simulation is needed.
 */
const memoryBuses = new Map<string, Set<MemoryBroadcastChannel>>();

/**
 * In-memory BroadcastChannel implementation strictly conforming to W3C BroadcastChannel semantics:
 * - Emits messages asynchronously to other instances on the same bus name (never to the sender itself).
 * - Messages are cloned upon dispatch to prevent object reference leakage between contexts.
 * - Supports both .onmessage callback and .addEventListener('message', ...).
 * - Safe disposal via .close().
 */
export class MemoryBroadcastChannel implements BroadcastChannelPort {
  readonly name: string;
  onmessage: ((event: any) => void) | null = null;
  private readonly listeners = new Set<(event: any) => void>();
  private closed = false;

  constructor(name: string = DEFAULT_STORAGE_BROADCAST_CHANNEL) {
    this.name = name;
    let bus = memoryBuses.get(name);
    if (!bus) {
      bus = new Set();
      memoryBuses.set(name, bus);
    }
    bus.add(this);
  }

  postMessage(message: unknown): void {
    if (this.closed) {
      throw new Error('InvalidStateError: BroadcastChannel is closed');
    }
    const bus = memoryBuses.get(this.name);
    if (!bus) return;

    // Deep-clone message payload to prevent cross-context mutation
    const cloned =
      typeof structuredClone === 'function'
        ? structuredClone(message)
        : JSON.parse(JSON.stringify(message));

    for (const peer of bus) {
      if (peer !== this && !peer.closed) {
        queueMicrotask(() => {
          if (peer.closed) return;
          const evt = { data: cloned };
          if (typeof peer.onmessage === 'function') {
            try {
              peer.onmessage(evt);
            } catch (_) {
              // Subscriber errors do not break broadcaster
            }
          }
          for (const listener of peer.listeners) {
            try {
              listener(evt);
            } catch (_) {
              // Subscriber errors do not break broadcaster
            }
          }
        });
      }
    }
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    if (type === 'message') {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    if (type === 'message') {
      this.listeners.delete(listener);
    }
  }

  close(): void {
    this.closed = true;
    const bus = memoryBuses.get(this.name);
    if (bus) {
      bus.delete(this);
      if (bus.size === 0) {
        memoryBuses.delete(this.name);
      }
    }
    this.listeners.clear();
    this.onmessage = null;
  }

  /**
   * Utility for testing: clears all active memory bus channels.
   */
  static clearAllBuses(): void {
    memoryBuses.clear();
  }
}

/**
 * Creates a broadcaster that sanitizes all messages:
 * Emits strictly key/revision/phase and NEVER candidateName, responses, or answer keys.
 * Broadcast is purely an advisory notification and NEVER acts as a lock.
 */
export function createStorageBroadcastNotifier(
  channel?: BroadcastChannelPort | null
): (type: StorageBroadcastType, key: AttemptKey, revision: number, phase?: 'draft' | 'final') => void {
  return (type: StorageBroadcastType, key: AttemptKey, revision: number, phase?: 'draft' | 'final'): void => {
    if (!channel) return;
    try {
      // Invariant: broadcast emits key/revision only, no candidateName, no responses, no answer key!
      const notification: StorageBroadcastNotification = {
        channelName: channel.name,
        type,
        key: {
          examId: key.examId,
          examVersionId: key.examVersionId,
          attemptId: key.attemptId,
        },
        revision,
        phase,
        timestamp: Date.now(),
      };
      channel.postMessage(notification);
    } catch (_) {
      // Advisory notification: channel failure must NEVER block or fail storage transactions
    }
  };
}

/**
 * Reader rechecks transaction state directly from durable storage.
 * Invariant: Readers NEVER use broadcast payload as source of truth.
 */
export async function recheckTransactionState(
  storage: StoragePort,
  key: AttemptKey
): Promise<Result<AttemptRecord | null>> {
  return storage.load(key);
}

/**
 * Listener helper for cross-tab notifications:
 * When a broadcast notification arrives, the reader rechecks transaction state by loading
 * the authentic record from StoragePort inside a durable read transaction.
 * Returns an unsubscribe / dispose callback.
 */
export function createStorageBroadcastListener(
  storage: StoragePort,
  channel: BroadcastChannelPort,
  onStateChecked: (notification: StorageBroadcastNotification, record: AttemptRecord | null) => void
): () => void {
  const handler = async (evt: { data: unknown }) => {
    const data = evt?.data as Partial<StorageBroadcastNotification> | undefined;
    if (
      !data ||
      typeof data !== 'object' ||
      !data.key ||
      typeof data.key.examId !== 'string' ||
      typeof data.key.attemptId !== 'string'
    ) {
      return;
    }

    const notification: StorageBroadcastNotification = {
      channelName: typeof data.channelName === 'string' ? data.channelName : channel.name,
      type: data.type ?? 'attempt_saved',
      key: {
        examId: data.key.examId,
        examVersionId: data.key.examVersionId,
        attemptId: data.key.attemptId,
      },
      revision: typeof data.revision === 'number' ? data.revision : 0,
      phase: data.phase,
      timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
    };

    // Readers recheck transaction state: read authentic record from storage
    const loadResult = await storage.load(notification.key);
    const authenticRecord = loadResult.ok ? loadResult.value : null;

    onStateChecked(notification, authenticRecord);
  };

  if (typeof channel.addEventListener === 'function') {
    channel.addEventListener('message', handler);
    return () => {
      if (typeof channel.removeEventListener === 'function') {
        channel.removeEventListener('message', handler);
      }
    };
  } else {
    const prev = channel.onmessage;
    channel.onmessage = handler;
    return () => {
      if (channel.onmessage === handler) {
        channel.onmessage = prev;
      }
    };
  }
}
