import type {
  AttemptKey,
  AttemptRecord,
  SaveState,
  Receipt,
  OutboxRecord,
  WebError,
  Result,
  StoragePort,
  CollectorPort,
  DrainDeps,
} from './types.ts';

import {
  exportResults,
  serializeResultsJson,
  serializeResultsCsv,
  buildWebResultPayload,
  resolveScoreDTO,
  neutralizeFormula,
  isFormulaDangerous,
  escapeCsvCell,
  CSV_HEADERS,
  type WebResultV1,
} from './export.ts';

import {
  HttpCollectorTransport,
  createHttpTransport,
  type HttpTransportOptions,
} from './transport.ts';

import {
  loadAppConfig,
  createAppsScriptClient,
  createAppsScriptCollectorPort,
  type AppConfig,
  type PublishedExamMeta,
  type AsResult,
  type AppsScriptClient,
  type AppsScriptCollectorPort,
} from './appsScript.ts';

export type {
  AttemptKey,
  AttemptRecord,
  SaveState,
  Receipt,
  OutboxRecord,
  WebError,
  Result,
  StoragePort,
  CollectorPort,
  DrainDeps,
  WebResultV1,
  HttpTransportOptions,
  AppConfig,
  PublishedExamMeta,
  AsResult,
  AppsScriptClient,
  AppsScriptCollectorPort,
};

export {
  exportResults,
  serializeResultsJson,
  serializeResultsCsv,
  buildWebResultPayload,
  resolveScoreDTO,
  neutralizeFormula,
  isFormulaDangerous,
  escapeCsvCell,
  CSV_HEADERS,
  HttpCollectorTransport,
  createHttpTransport,
  loadAppConfig,
  createAppsScriptClient,
  createAppsScriptCollectorPort,
};

export const COLLECTOR_MAX_TOTAL_ATTEMPTS = 5;
export const COLLECTOR_BACKOFF_STEPS_MS = [1000, 2000, 4000, 8000] as const;
export const COLLECTOR_DEFAULT_TIMEOUT_MS = 10000;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(
  code: string,
  path: string,
  message: string,
  recoverable: boolean
): Result<T> {
  return { ok: false, error: { code, path, message, recoverable } };
}

export class CollectorError extends Error {
  readonly code: string;
  readonly path: string;
  readonly recoverable: boolean;
  readonly status?: number;

  constructor(code: string, path: string, message: string, recoverable: boolean, status?: number) {
    super(message);
    this.name = 'CollectorError';
    this.code = code;
    this.path = path;
    this.recoverable = recoverable;
    this.status = status;
  }
}

export class DisabledCollectorPort implements CollectorPort {
  async send(_final: AttemptRecord, _signal: AbortSignal): Promise<unknown> {
    throw new CollectorError(
      'COLLECTOR_DISABLED',
      'endpoint',
      'Collector endpoint is disabled by default',
      false
    );
  }
}

export function createDisabledCollectorPort(): CollectorPort {
  return new DisabledCollectorPort();
}

/**
 * Deterministic canonical stringification for objects.
 */
export function canonicalJson(data: unknown): string {
  if (data === null || typeof data !== 'object') {
    return JSON.stringify(data);
  }
  if (Array.isArray(data)) {
    return '[' + data.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(data).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalJson((data as Record<string, unknown>)[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes a deterministic 16-character hex hash matching storage.finalize.
 */
export function computePayloadHash(record: AttemptRecord): string {
  const canonical = JSON.stringify({
    examId: record.examId,
    examVersionId: record.examVersionId,
    attemptId: record.attemptId,
    revision: record.revision,
    candidateName: record.candidateName,
    startedAt: record.startedAt,
    submittedAt: record.submittedAt,
    responses: record.responses,
    scoreDTO: record.scoreDTO,
  });

  let h1 = 0x811c9dc5;
  let h2 = 0x9dc5811c;
  for (let i = 0; i < canonical.length; i++) {
    const ch = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619);
    h2 = Math.imul(h2 ^ (ch >>> 8), 16777619);
  }
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}`;
}

/**
 * Validates a server receipt against the expected outbox record.
 */
export function validateReceipt(input: unknown, expected: OutboxRecord): Result<Receipt> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return err('RECEIPT_INVALID', 'receipt', 'Receipt must be a non-null object', false);
  }

  const r = input as Record<string, unknown>;

  if (r.error === 'PAYLOAD_CONFLICT') {
    return err('PAYLOAD_CONFLICT', 'receipt.payloadHash', String(r.message || 'Receipt payloadHash conflicts with expected outbox record'), false);
  }

  if (typeof r.examId !== 'string' || r.examId !== expected.examId) {
    return err('RECEIPT_INVALID', 'receipt.examId', 'Receipt examId does not match expected attempt', false);
  }
  if (typeof r.examVersionId !== 'string' || r.examVersionId !== expected.examVersionId) {
    return err('RECEIPT_INVALID', 'receipt.examVersionId', 'Receipt examVersionId does not match expected attempt', false);
  }
  if (typeof r.attemptId !== 'string' || r.attemptId !== expected.attemptId) {
    return err('RECEIPT_INVALID', 'receipt.attemptId', 'Receipt attemptId does not match expected attempt', false);
  }

  if (typeof r.payloadHash !== 'string' || !r.payloadHash.trim()) {
    return err('RECEIPT_INVALID', 'receipt.payloadHash', 'Receipt payloadHash is missing or empty', false);
  }
  if (r.payloadHash !== expected.payloadHash) {
    return err('PAYLOAD_CONFLICT', 'receipt.payloadHash', 'Receipt payloadHash conflicts with expected outbox record', false);
  }

  if (typeof r.submissionId !== 'string' || !r.submissionId.trim()) {
    return err('RECEIPT_INVALID', 'receipt.submissionId', 'Receipt submissionId is missing or empty', false);
  }

  if (r.status !== 'recorded' && r.status !== 'already_recorded') {
    return err('RECEIPT_INVALID', 'receipt.status', 'Receipt status must be "recorded" or "already_recorded"', false);
  }

  if (typeof r.receivedAt !== 'string' || !r.receivedAt.trim() || isNaN(Date.parse(r.receivedAt))) {
    return err('RECEIPT_INVALID', 'receipt.receivedAt', 'Receipt receivedAt must be a valid ISO date string', false);
  }

  return ok<Receipt>({
    examId: r.examId,
    examVersionId: r.examVersionId,
    attemptId: r.attemptId,
    submissionId: r.submissionId,
    payloadHash: r.payloadHash,
    receivedAt: r.receivedAt,
    status: r.status,
  });
}

/**
 * Enqueues a finalized attempt into durable outbox.
 * Endpoint is disabled by default if endpointId is null, setting state to 'local_saved'.
 */
export async function enqueue(
  final: AttemptRecord,
  storage: StoragePort,
  endpointId: string | null
): Promise<Result<OutboxRecord>> {
  if (!final || typeof final !== 'object') {
    return err('ATTEMPT_INVALID', 'final', 'Attempt record is invalid', false);
  }
  if (final.phase !== 'final') {
    return err('ATTEMPT_NOT_FINAL', 'final.phase', 'Only finalized attempts can be enqueued', false);
  }
  if (!final.examId || !final.examVersionId || !final.attemptId) {
    return err('ATTEMPT_INVALID', 'final.key', 'Attempt key fields must be non-empty strings', false);
  }

  const key: AttemptKey = {
    examId: final.examId,
    examVersionId: final.examVersionId,
    attemptId: final.attemptId,
  };

  const existingRes = await storage.getOutbox(key);
  if (!existingRes.ok) {
    return existingRes;
  }
  const existing = existingRes.value;

  const payloadHash = computePayloadHash(final);

  if (existing) {
    if (existing.state === 'server_confirmed') {
      // Terminal confirmation: return confirmed outbox record immediately
      return ok(existing);
    }
    if (existing.payloadHash !== payloadHash) {
      return err('PAYLOAD_CONFLICT', 'payloadHash', 'Attempt payload hash conflicts with existing outbox record', false);
    }

    const targetState: SaveState =
      existing.state === 'failed'
        ? 'failed'
        : endpointId
          ? 'queued'
          : 'local_saved';
    const updated: OutboxRecord = {
      ...existing,
      state: targetState,
      endpointId,
      finalRevision: final.revision,
      generation: existing.generation + 1,
    };
    const updateRes = await storage.updateOutbox(updated, existing.generation);
    if (!updateRes.ok) {
      const recheck = await storage.getOutbox(key);
      if (recheck.ok && recheck.value && recheck.value.state === 'server_confirmed') {
        return ok(recheck.value);
      }
      return updateRes;
    }
    return updateRes;
  }

  const state: SaveState = endpointId ? 'queued' : 'local_saved';
  const newRecord: OutboxRecord = {
    examId: final.examId,
    examVersionId: final.examVersionId,
    attemptId: final.attemptId,
    state,
    finalRevision: final.revision,
    payloadHash,
    endpointId,
    retryCount: 0,
    nextRetryAt: null,
    generation: 1,
    receipt: null,
    lastError: null,
  };

  const createRes = await storage.updateOutbox(newRecord, null);
  if (!createRes.ok) {
    const recheck = await storage.getOutbox(key);
    if (recheck.ok && recheck.value) {
      if (recheck.value.payloadHash !== payloadHash) {
        return err('PAYLOAD_CONFLICT', 'payloadHash', 'Attempt payload hash conflicts with existing outbox record', false);
      }
      return ok(recheck.value);
    }
    return createRes;
  }
  return createRes;
}

/**
 * Drains an outbox record, managing state transitions across sending, backoff retries,
 * terminal confirmation, and budget exhaustion.
 */
export async function drainOutbox(
  key: AttemptKey,
  deps: DrainDeps
): Promise<Result<OutboxRecord>> {
  const outboxRes = await deps.storage.getOutbox(key);
  if (!outboxRes.ok) {
    return outboxRes;
  }
  const current = outboxRes.value;
  if (!current) {
    return err('OUTBOX_NOT_FOUND', 'key', 'Outbox record not found', false);
  }

  // 1. Terminal confirmation check
  if (current.state === 'server_confirmed') {
    return ok(current);
  }

  // 2. Disabled endpoint check
  if (!current.endpointId) {
    return err('COLLECTOR_DISABLED', 'endpointId', 'Collector endpoint is disabled by default', false);
  }

  // 3. Retry budget exhaustion check
  if (current.retryCount >= COLLECTOR_MAX_TOTAL_ATTEMPTS || current.state === 'failed') {
    return err('RETRY_EXHAUSTED', 'retryCount', 'Retry budget exhausted (5 total attempts)', false);
  }

  // 4. Backoff active check
  const now = deps.now();
  if (current.nextRetryAt !== null && now < current.nextRetryAt) {
    return err('RETRY_BACKOFF_ACTIVE', 'nextRetryAt', `Retry backoff active until ${current.nextRetryAt}`, true);
  }

  // 5. Load and verify attempt from durable storage
  const attemptRes = await deps.storage.load(key);
  if (!attemptRes.ok) {
    return attemptRes as Result<OutboxRecord>;
  }
  const final = attemptRes.value;
  if (!final) {
    return err('ATTEMPT_NOT_FOUND', 'attempt', 'Final attempt record not found in storage', false);
  }
  if (final.phase !== 'final') {
    return err('ATTEMPT_NOT_FINAL', 'final.phase', 'Attempt is not in final phase', false);
  }

  // 6. Verify payload hash integrity
  const hashCheck = computePayloadHash(final);
  if (hashCheck !== current.payloadHash) {
    return err('PAYLOAD_CONFLICT', 'payloadHash', 'Attempt payload hash does not match outbox payload hash', false);
  }

  // 7. CAS generation increment and transition to 'sending'
  const pinnedGeneration = current.generation + 1;
  const pinnedTuple: AttemptKey = {
    examId: current.examId,
    examVersionId: current.examVersionId,
    attemptId: current.attemptId,
  };
  const pinnedHash = current.payloadHash;

  const sendingRecord: OutboxRecord = {
    ...current,
    state: 'sending',
    generation: pinnedGeneration,
    lastError: null,
  };

  const updateSendingRes = await deps.storage.updateOutbox(sendingRecord, current.generation);
  if (!updateSendingRes.ok) {
    return updateSendingRes;
  }
  const sendingOutbox = updateSendingRes.value;
  const activeGeneration = sendingOutbox.generation;

  // 8. Execute transport send with timeout
  const timeoutMs = deps.timeoutMs ?? COLLECTOR_DEFAULT_TIMEOUT_MS;
  const abortController = new AbortController();
  let timerId: any = null;
  let didTimeout = false;

  timerId = setTimeout(() => {
    didTimeout = true;
    abortController.abort(new Error('COLLECTOR_TIMEOUT'));
  }, timeoutMs);

  let rawResponse: unknown = null;
  let sendError: unknown = null;

  try {
    rawResponse = await deps.transport.send(final, abortController.signal);
  } catch (err: any) {
    sendError = err;
  } finally {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
  }

  // 9. Inspect latest record in storage after async call
  const latestRes = await deps.storage.getOutbox(key);
  if (!latestRes.ok || !latestRes.value) {
    return latestRes as Result<OutboxRecord>;
  }
  const latest = latestRes.value;

  // Pin check: tuple and hash must match
  if (
    latest.examId !== pinnedTuple.examId ||
    latest.examVersionId !== pinnedTuple.examVersionId ||
    latest.attemptId !== pinnedTuple.attemptId ||
    latest.payloadHash !== pinnedHash
  ) {
    return err('PAYLOAD_CONFLICT', 'tuple', 'Outbox record changed during async dispatch', false);
  }

  // If already confirmed concurrently, return terminal record
  if (latest.state === 'server_confirmed') {
    return ok(latest);
  }

  // If generation changed, response is stale / superseded
  if (latest.generation !== activeGeneration) {
    return err('STALE_GENERATION', 'generation', 'Response superseded by newer generation', true);
  }

  // 10. Handle network response or error
  if (!sendError && rawResponse && typeof rawResponse === 'object') {
    const p = rawResponse as Record<string, unknown>;
    if (p.error === 'SERVER_BUSY' || p.status === 503) {
      sendError = new CollectorError(
        'COLLECTOR_HTTP',
        'response',
        String(p.message || 'Server busy; retry scheduled'),
        true,
        503
      );
    } else if (p.error === 'PAYLOAD_CONFLICT' || p.status === 409) {
      const failedRecord: OutboxRecord = {
        ...latest,
        state: 'failed',
        retryCount: COLLECTOR_MAX_TOTAL_ATTEMPTS,
        nextRetryAt: null,
        lastError: 'PAYLOAD_CONFLICT',
      };
      await deps.storage.updateOutbox(failedRecord, activeGeneration);
      return err('PAYLOAD_CONFLICT', 'receipt', String(p.message || 'Payload conflict'), false);
    } else if (p.error === 'SERVER_ERROR' || (typeof p.status === 'number' && p.status >= 500)) {
      sendError = new CollectorError(
        'COLLECTOR_HTTP',
        'response',
        String(p.message || 'Server error; retry scheduled'),
        true,
        typeof p.status === 'number' ? p.status : 500
      );
    }
  }

  if (!sendError) {
    // Validate receipt
    const receiptRes = validateReceipt(rawResponse, latest);
    if (receiptRes.ok) {
      const confirmedRecord: OutboxRecord = {
        ...latest,
        state: 'server_confirmed',
        receipt: receiptRes.value,
        nextRetryAt: null,
        lastError: null,
      };
      const updateRes = await deps.storage.updateOutbox(confirmedRecord, activeGeneration);
      if (!updateRes.ok) {
        const recheck = await deps.storage.getOutbox(key);
        if (recheck.ok && recheck.value && recheck.value.state === 'server_confirmed') {
          return ok(recheck.value);
        }
        return updateRes;
      }
      return updateRes;
    }

    // Invalid or opaque receipt: non-retryable per section 7!
    const failedRecord: OutboxRecord = {
      ...latest,
      state: 'failed',
      retryCount: COLLECTOR_MAX_TOTAL_ATTEMPTS,
      nextRetryAt: null,
      lastError: receiptRes.error.code,
    };
    const failUpdateRes = await deps.storage.updateOutbox(failedRecord, activeGeneration);
    if (!failUpdateRes.ok) {
      const recheck = await deps.storage.getOutbox(key);
      if (recheck.ok && recheck.value && recheck.value.state === 'server_confirmed') {
        return ok(recheck.value);
      }
    }
    return err(receiptRes.error.code, receiptRes.error.path, receiptRes.error.message, false);
  }

  // Process send error:
  const is4xx =
    typeof (sendError as any)?.status === 'number' &&
    (sendError as any).status >= 400 &&
    (sendError as any).status < 500;

  const isTimeout =
    didTimeout ||
    (sendError as any)?.code === 'COLLECTOR_TIMEOUT' ||
    (sendError as any)?.message?.includes('COLLECTOR_TIMEOUT') ||
    (sendError as any)?.name === 'TimeoutError' ||
    (sendError as any)?.name === 'AbortError';

  const errCode = isTimeout
    ? 'COLLECTOR_TIMEOUT'
    : is4xx
      ? 'COLLECTOR_HTTP'
      : typeof (sendError as any)?.status === 'number' && (sendError as any).status >= 500
        ? 'COLLECTOR_HTTP'
        : 'COLLECTOR_NETWORK';

  // If 4xx HTTP error: non-retryable!
  if (is4xx) {
    const failedRecord: OutboxRecord = {
      ...latest,
      state: 'failed',
      retryCount: COLLECTOR_MAX_TOTAL_ATTEMPTS,
      nextRetryAt: null,
      lastError: errCode,
    };
    const updateRes = await deps.storage.updateOutbox(failedRecord, activeGeneration);
    if (!updateRes.ok) {
      const recheck = await deps.storage.getOutbox(key);
      if (recheck.ok && recheck.value && recheck.value.state === 'server_confirmed') {
        return ok(recheck.value);
      }
    }
    return err(errCode, 'transport', `HTTP ${(sendError as any)?.status} client error (non-retryable)`, false);
  }

  // Retryable error: check attempt budget
  const newRetryCount = latest.retryCount + 1;
  if (newRetryCount >= COLLECTOR_MAX_TOTAL_ATTEMPTS) {
    // Budget exhausted after 5 total attempts
    const failedRecord: OutboxRecord = {
      ...latest,
      state: 'failed',
      retryCount: COLLECTOR_MAX_TOTAL_ATTEMPTS,
      nextRetryAt: null,
      lastError: 'RETRY_EXHAUSTED',
    };
    const updateRes = await deps.storage.updateOutbox(failedRecord, activeGeneration);
    if (!updateRes.ok) {
      const recheck = await deps.storage.getOutbox(key);
      if (recheck.ok && recheck.value && recheck.value.state === 'server_confirmed') {
        return ok(recheck.value);
      }
    }
    return err('RETRY_EXHAUSTED', 'retryCount', `Retry budget exhausted after 5 total attempts (${errCode})`, false);
  }

  // Schedule backoff: 1s, 2s, 4s, 8s
  const stepIdx = Math.min(latest.retryCount, COLLECTOR_BACKOFF_STEPS_MS.length - 1);
  const backoffMs = COLLECTOR_BACKOFF_STEPS_MS[stepIdx]!;
  const nextRetryAt = deps.now() + backoffMs;

  const queuedRecord: OutboxRecord = {
    ...latest,
    state: 'queued',
    retryCount: newRetryCount,
    nextRetryAt,
    lastError: errCode,
  };
  const updateRes = await deps.storage.updateOutbox(queuedRecord, activeGeneration);
  if (!updateRes.ok) {
    const recheck = await deps.storage.getOutbox(key);
    if (recheck.ok && recheck.value && recheck.value.state === 'server_confirmed') {
      return ok(recheck.value);
    }
  }
  return err(errCode, 'transport', `Attempt ${newRetryCount}/5 failed: ${errCode}; retry scheduled in ${backoffMs / 1000}s`, true);
}

/**
 * Resumes outbox processing after application restart, reload, or network reconnection.
 * - If server_confirmed: returns terminal record immediately.
 * - If local_saved: returns record as endpoint is disabled/not configured.
 * - If failed: returns RETRY_EXHAUSTED error indicating manual controlled retry is required.
 * - If retry backoff is still active: returns RETRY_BACKOFF_ACTIVE with remaining time.
 * - If queued or interrupted sending: executes drainOutbox.
 */
export async function resumeOutbox(
  key: AttemptKey,
  deps: DrainDeps
): Promise<Result<OutboxRecord>> {
  const outboxRes = await deps.storage.getOutbox(key);
  if (!outboxRes.ok) {
    return outboxRes;
  }
  const current = outboxRes.value;
  if (!current) {
    return err('OUTBOX_NOT_FOUND', 'key', 'Outbox record not found for resume', false);
  }

  // 1. Terminal confirmation check
  if (current.state === 'server_confirmed') {
    return ok(current);
  }

  // 2. Disabled endpoint check
  if (!current.endpointId) {
    return ok(current);
  }

  // 3. Failed / exhausted budget check
  if (current.state === 'failed' || current.retryCount >= COLLECTOR_MAX_TOTAL_ATTEMPTS) {
    return err(
      'RETRY_EXHAUSTED',
      'retryCount',
      `Outbox record is in failed state (attempts: ${current.retryCount}/${COLLECTOR_MAX_TOTAL_ATTEMPTS}). Use resetOutboxForRetry for controlled retry.`,
      false
    );
  }

  // 4. Backoff check
  const now = deps.now();
  if (current.nextRetryAt !== null && now < current.nextRetryAt) {
    return err(
      'RETRY_BACKOFF_ACTIVE',
      'nextRetryAt',
      `Retry backoff active until ${current.nextRetryAt} (remaining: ${Math.ceil((current.nextRetryAt - now) / 1000)}s)`,
      true
    );
  }

  // 5. Ready to drain
  return await drainOutbox(key, deps);
}

/**
 * Performs a controlled reset of an outbox record in 'failed' state, enabling manual retry.
 * In accordance with Section 7 ("failed sau lỗi/quá budget, giữ final/export/retry có kiểm soát"),
 * this allows the user/teacher to explicitly re-trigger collection after fixing endpoint/network.
 *
 * Rules:
 * - Terminal confirmed records CANNOT be reset.
 * - Non-terminal records have retryCount reset to 0, nextRetryAt to null, lastError to null,
 *   state transitioned to 'queued' (if endpointId is present) or 'local_saved'.
 */
export async function resetOutboxForRetry(
  key: AttemptKey,
  storage: StoragePort
): Promise<Result<OutboxRecord>> {
  const outboxRes = await storage.getOutbox(key);
  if (!outboxRes.ok) {
    return outboxRes;
  }
  const current = outboxRes.value;
  if (!current) {
    return err('OUTBOX_NOT_FOUND', 'key', 'Outbox record not found', false);
  }

  if (current.state === 'server_confirmed') {
    return err('ATTEMPT_ALREADY_CONFIRMED', 'state', 'Cannot reset terminal confirmed attempt', false);
  }

  const targetState: SaveState = current.endpointId ? 'queued' : 'local_saved';
  const resetRecord: OutboxRecord = {
    ...current,
    state: targetState,
    retryCount: 0,
    nextRetryAt: null,
    lastError: null,
  };

  return await storage.updateOutbox(resetRecord, current.generation);
}

/**
 * Returns a detailed status summary for an outbox record,
 * separating durable local storage status from network sync state.
 */
export async function getOutboxStatus(
  key: AttemptKey,
  storage: StoragePort
): Promise<Result<{
  state: SaveState;
  isConfirmed: boolean;
  isTerminal: boolean;
  isLocalSaved: boolean;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: number | null;
  lastError: string | null;
  receipt: Receipt | null;
  payloadHash: string;
}>> {
  const outboxRes = await storage.getOutbox(key);
  if (!outboxRes.ok) {
    return outboxRes as Result<any>;
  }
  const current = outboxRes.value;
  if (!current) {
    return err('OUTBOX_NOT_FOUND', 'key', 'Outbox record not found', false);
  }

  return ok({
    state: current.state,
    isConfirmed: current.state === 'server_confirmed',
    isTerminal: current.state === 'server_confirmed',
    isLocalSaved: current.state === 'local_saved',
    retryCount: current.retryCount,
    maxRetries: COLLECTOR_MAX_TOTAL_ATTEMPTS,
    nextRetryAt: current.nextRetryAt,
    lastError: current.lastError,
    receipt: current.receipt,
    payloadHash: current.payloadHash,
  });
}
