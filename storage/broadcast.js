export const DEFAULT_STORAGE_BROADCAST_CHANNEL = 'cunata-storage-sync';
/**
 * Global in-memory broadcast bus registry for Node tests and environments
 * where isolated cross-tab simulation is needed.
 */
const memoryBuses = new Map();
/**
 * In-memory BroadcastChannel implementation strictly conforming to W3C BroadcastChannel semantics:
 * - Emits messages asynchronously to other instances on the same bus name (never to the sender itself).
 * - Messages are cloned upon dispatch to prevent object reference leakage between contexts.
 * - Supports both .onmessage callback and .addEventListener('message', ...).
 * - Safe disposal via .close().
 */
export class MemoryBroadcastChannel {
    name;
    onmessage = null;
    listeners = new Set();
    closed = false;
    constructor(name = DEFAULT_STORAGE_BROADCAST_CHANNEL) {
        this.name = name;
        let bus = memoryBuses.get(name);
        if (!bus) {
            bus = new Set();
            memoryBuses.set(name, bus);
        }
        bus.add(this);
    }
    postMessage(message) {
        if (this.closed) {
            throw new Error('InvalidStateError: BroadcastChannel is closed');
        }
        const bus = memoryBuses.get(this.name);
        if (!bus)
            return;
        // Deep-clone message payload to prevent cross-context mutation
        const cloned = typeof structuredClone === 'function'
            ? structuredClone(message)
            : JSON.parse(JSON.stringify(message));
        for (const peer of bus) {
            if (peer !== this && !peer.closed) {
                queueMicrotask(() => {
                    if (peer.closed)
                        return;
                    const evt = { data: cloned };
                    if (typeof peer.onmessage === 'function') {
                        try {
                            peer.onmessage(evt);
                        }
                        catch (_) {
                            // Subscriber errors do not break broadcaster
                        }
                    }
                    for (const listener of peer.listeners) {
                        try {
                            listener(evt);
                        }
                        catch (_) {
                            // Subscriber errors do not break broadcaster
                        }
                    }
                });
            }
        }
    }
    addEventListener(type, listener) {
        if (type === 'message') {
            this.listeners.add(listener);
        }
    }
    removeEventListener(type, listener) {
        if (type === 'message') {
            this.listeners.delete(listener);
        }
    }
    close() {
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
    static clearAllBuses() {
        memoryBuses.clear();
    }
}
/**
 * Creates a broadcaster that sanitizes all messages:
 * Emits strictly key/revision/phase and NEVER candidateName, responses, or answer keys.
 * Broadcast is purely an advisory notification and NEVER acts as a lock.
 */
export function createStorageBroadcastNotifier(channel) {
    return (type, key, revision, phase) => {
        if (!channel)
            return;
        try {
            // Invariant: broadcast emits key/revision only, no candidateName, no responses, no answer key!
            const notification = {
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
        }
        catch (_) {
            // Advisory notification: channel failure must NEVER block or fail storage transactions
        }
    };
}
/**
 * Reader rechecks transaction state directly from durable storage.
 * Invariant: Readers NEVER use broadcast payload as source of truth.
 */
export async function recheckTransactionState(storage, key) {
    return storage.load(key);
}
/**
 * Listener helper for cross-tab notifications:
 * When a broadcast notification arrives, the reader rechecks transaction state by loading
 * the authentic record from StoragePort inside a durable read transaction.
 * Returns an unsubscribe / dispose callback.
 */
export function createStorageBroadcastListener(storage, channel, onStateChecked) {
    const handler = async (evt) => {
        const data = evt?.data;
        if (!data ||
            typeof data !== 'object' ||
            !data.key ||
            typeof data.key.examId !== 'string' ||
            typeof data.key.attemptId !== 'string') {
            return;
        }
        const notification = {
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
    }
    else {
        const prev = channel.onmessage;
        channel.onmessage = handler;
        return () => {
            if (channel.onmessage === handler) {
                channel.onmessage = prev;
            }
        };
    }
}
