import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type {
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
  Receipt,
  Result,
  StoragePort,
  CollectorPort,
  WebExam,
  WebError,
} from '../../../src/collect/types.ts';

import {
  enqueue,
  drainOutbox,
  validateReceipt,
  computePayloadHash,
  canonicalJson,
  createDisabledCollectorPort,
  DisabledCollectorPort,
  CollectorError,
  COLLECTOR_MAX_TOTAL_ATTEMPTS,
  COLLECTOR_BACKOFF_STEPS_MS,
  COLLECTOR_DEFAULT_TIMEOUT_MS,
} from '../../../src/collect/index.ts';

function assertOk<T>(res: Result<T>, message?: string): T {
  assert.equal(res.ok, true, message || (res.ok ? '' : (res as any).error?.message));
  if (!res.ok) throw new Error('Expected ok');
  return res.value;
}

function assertErr<T>(res: Result<T>, expectedCode?: string, message?: string): WebError {
  assert.equal(res.ok, false, message || 'Expected error');
  if (res.ok) throw new Error('Expected error');
  if (expectedCode) {
    assert.equal(res.error.code, expectedCode);
  }
  return res.error;
}

function createDummyExam(): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-sample-01',
    examVersionId: 'v1.0.0',
    title: 'Đề thi thử nghiệm',
    subject: 'Toán',
    grade: 12,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    settings: {
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q-01',
        title: 'Câu 1',
        content: 'Nội dung câu 1',
        options: [
          { optionId: 'opt-a', label: 'A', text: 'Đáp án A' },
          { optionId: 'opt-b', label: 'B', text: 'Đáp án B' },
          { optionId: 'opt-c', label: 'C', text: 'Đáp án C' },
          { optionId: 'opt-d', label: 'D', text: 'Đáp án D' },
        ],
        correctOptionId: 'opt-a',
      },
    ],
    assets: [],
  };
}

function createSampleAttempt(
  attemptId: string,
  overrides?: Partial<AttemptRecord>
): AttemptRecord {
  return {
    schemaVersion: 'web-attempt-v1',
    examId: 'exam-sample-01',
    examVersionId: 'v1.0.0',
    attemptId,
    revision: 1,
    candidateName: 'Nguyễn Văn A',
    examSnapshot: createDummyExam(),
    presentationOrder: {
      seed: 'seed-01',
      questionOrder: ['q-01'],
      optionOrder: [{ questionVersionId: 'q-01', optionIds: ['opt-a', 'opt-b', 'opt-c', 'opt-d'] }],
    },
    responses: {
      attemptId,
      examVersionId: 'v1.0.0',
      responses: [{ kind: 'I', questionVersionId: 'q-01', selectedOptionId: 'opt-a' }],
    },
    startedAt: 1700000000000,
    deadline: 1700003000000,
    phase: 'final',
    submittedAt: 1700002500000,
    scoreDTO: { totalFraction: '1/4', maxTotalFraction: '1/4' },
    ...overrides,
  };
}

class InMemoryStorage implements StoragePort {
  attempts = new Map<string, AttemptRecord>();
  outbox = new Map<string, OutboxRecord>();
  outboxHistory: OutboxRecord[] = [];
  failNextUpdate = false;
  failNextLoad = false;

  private keyStr(k: AttemptKey): string {
    return `${k.examId}::${k.examVersionId}::${k.attemptId}`;
  }

  async load(key: AttemptKey): Promise<Result<AttemptRecord | null>> {
    if (this.failNextLoad) {
      this.failNextLoad = false;
      return {
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', path: 'load', message: 'Storage load failed', recoverable: true },
      };
    }
    const rec = this.attempts.get(this.keyStr(key)) ?? null;
    return { ok: true, value: rec ? JSON.parse(JSON.stringify(rec)) : null };
  }

  async create(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    this.attempts.set(this.keyStr(record), JSON.parse(JSON.stringify(record)));
    return { ok: true, value: record };
  }

  async saveDraft(record: AttemptRecord, _expectedRevision: number): Promise<Result<AttemptRecord>> {
    this.attempts.set(this.keyStr(record), JSON.parse(JSON.stringify(record)));
    return { ok: true, value: record };
  }

  async finalize(record: AttemptRecord, _expectedRevision: number): Promise<Result<AttemptRecord>> {
    const finalRec: AttemptRecord = { ...record, phase: 'final' };
    this.attempts.set(this.keyStr(finalRec), JSON.parse(JSON.stringify(finalRec)));
    return { ok: true, value: finalRec };
  }

  async listAttempts(_examId: string, _examVersionId: string): Promise<Result<readonly AttemptRecord[]>> {
    return { ok: true, value: Array.from(this.attempts.values()) };
  }

  async getObject(_store: 'bank' | 'exams' | 'imports', _id: string): Promise<Result<unknown | null>> {
    return { ok: true, value: null };
  }

  async putObject(_store: 'bank' | 'exams' | 'imports', _id: string, _value: unknown, _expectedRevision: number | null): Promise<Result<number>> {
    return { ok: true, value: 1 };
  }

  async deleteObject(_store: 'bank' | 'exams' | 'imports', _id: string, _expectedRevision: number): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async getOutbox(key: AttemptKey): Promise<Result<OutboxRecord | null>> {
    const rec = this.outbox.get(this.keyStr(key)) ?? null;
    return { ok: true, value: rec ? JSON.parse(JSON.stringify(rec)) : null };
  }

  async updateOutbox(value: OutboxRecord, expectedGeneration: number | null): Promise<Result<OutboxRecord>> {
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      return {
        ok: false,
        error: { code: 'STORAGE_CONFLICT', path: 'outbox', message: 'Storage update failed simulated', recoverable: true },
      };
    }

    const k = this.keyStr(value);
    const existing = this.outbox.get(k);

    if (!existing) {
      if (expectedGeneration !== null) {
        return {
          ok: false,
          error: { code: 'STORAGE_CONFLICT', path: 'generation', message: 'Record not found for expected generation', recoverable: false },
        };
      }
      const initial: OutboxRecord = { ...JSON.parse(JSON.stringify(value)), generation: 1 };
      this.outbox.set(k, initial);
      this.outboxHistory.push(JSON.parse(JSON.stringify(initial)));
      return { ok: true, value: initial };
    }

    if (existing.state === 'server_confirmed' && value.state !== 'server_confirmed') {
      return {
        ok: false,
        error: { code: 'STORAGE_CONFLICT', path: 'state', message: 'Cannot downgrade confirmed state', recoverable: false },
      };
    }

    if (expectedGeneration !== null && existing.generation !== expectedGeneration) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_CONFLICT',
          path: 'generation',
          message: `CAS generation mismatch: expected ${expectedGeneration}, got ${existing.generation}`,
          recoverable: false,
        },
      };
    }

    const nextGen = existing.generation + 1;
    const updated: OutboxRecord = { ...JSON.parse(JSON.stringify(value)), generation: nextGen };
    this.outbox.set(k, updated);
    this.outboxHistory.push(JSON.parse(JSON.stringify(updated)));
    return { ok: true, value: updated };
  }

  async exportBackup(): Promise<Result<Blob>> {
    return { ok: true, value: new Blob([]) };
  }

  async importBackup(_input: unknown): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async clearAll(_confirmed: boolean): Promise<Result<void>> {
    this.attempts.clear();
    this.outbox.clear();
    this.outboxHistory = [];
    return { ok: true, value: undefined };
  }
}

class MockCollectorPort implements CollectorPort {
  dispatched: AttemptRecord[] = [];
  handler: (final: AttemptRecord, signal: AbortSignal) => Promise<unknown> = async () => null;

  async send(final: AttemptRecord, signal: AbortSignal): Promise<unknown> {
    this.dispatched.push(JSON.parse(JSON.stringify(final)));
    return await this.handler(final, signal);
  }
}

describe('M4 Collect: Outbox State Machine & Receipt Validation', () => {
  it('DisabledCollectorPort throws COLLECTOR_DISABLED', async () => {
    const port = createDisabledCollectorPort();
    assert.ok(port instanceof DisabledCollectorPort);
    const attempt = createSampleAttempt('att-01');
    const controller = new AbortController();

    await assert.rejects(
      async () => port.send(attempt, controller.signal),
      (err: any) => {
        assert.ok(err instanceof CollectorError);
        assert.equal(err.code, 'COLLECTOR_DISABLED');
        assert.equal(err.recoverable, false);
        return true;
      }
    );
  });

  it('computePayloadHash produces deterministic 16-character hex hash', () => {
    const attempt1 = createSampleAttempt('att-01');
    const attempt2 = createSampleAttempt('att-01');
    const hash1 = computePayloadHash(attempt1);
    const hash2 = computePayloadHash(attempt2);

    assert.equal(hash1, hash2, 'Identical records must yield identical hashes');
    assert.equal(hash1.length, 16, 'Hash must be 16 characters long');
    assert.match(hash1, /^[0-9a-f]{16}$/i);

    const attemptModified = createSampleAttempt('att-01', {
      responses: {
        attemptId: 'att-01',
        examVersionId: 'v1.0.0',
        responses: [{ kind: 'I', questionVersionId: 'q-01', selectedOptionId: 'opt-b' }],
      },
    });
    const hashMod = computePayloadHash(attemptModified);
    assert.notEqual(hash1, hashMod, 'Modified responses must yield a different hash');
  });

  it('canonicalJson sorts keys and structures recursively', () => {
    const objA = { b: 2, a: 1, c: { y: 'y', x: 'x' } };
    const objB = { a: 1, c: { x: 'x', y: 'y' }, b: 2 };
    assert.equal(canonicalJson(objA), canonicalJson(objB));
  });

  it('validateReceipt accepts valid recorded and already_recorded receipts', () => {
    const expectedOutbox: OutboxRecord = {
      examId: 'exam-01',
      examVersionId: 'v1.0.0',
      attemptId: 'att-01',
      state: 'sending',
      finalRevision: 1,
      payloadHash: 'a1b2c3d4e5f60718',
      endpointId: 'https://collector.example.com',
      retryCount: 0,
      nextRetryAt: null,
      generation: 2,
      receipt: null,
      lastError: null,
    };

    const validRecorded = {
      examId: 'exam-01',
      examVersionId: 'v1.0.0',
      attemptId: 'att-01',
      submissionId: 'sub-001',
      payloadHash: 'a1b2c3d4e5f60718',
      receivedAt: '2026-11-14T08:00:00.000Z',
      status: 'recorded',
    };
    const res1 = validateReceipt(validRecorded, expectedOutbox);
    const r1 = assertOk(res1);
    assert.equal(r1.status, 'recorded');
    assert.equal(r1.submissionId, 'sub-001');

    const validAlreadyRecorded = {
      ...validRecorded,
      status: 'already_recorded',
      submissionId: 'sub-002',
    };
    const res2 = validateReceipt(validAlreadyRecorded, expectedOutbox);
    const r2 = assertOk(res2);
    assert.equal(r2.status, 'already_recorded');
  });

  it('validateReceipt rejects opaque and invalid receipt objects with RECEIPT_INVALID', () => {
    const expected: OutboxRecord = {
      examId: 'exam-01',
      examVersionId: 'v1.0.0',
      attemptId: 'att-01',
      state: 'sending',
      finalRevision: 1,
      payloadHash: 'hash-001',
      endpointId: 'ep',
      retryCount: 0,
      nextRetryAt: null,
      generation: 1,
      receipt: null,
      lastError: null,
    };

    assertErr(validateReceipt(null, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt({}, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt({ status: 'recorded' }, expected), 'RECEIPT_INVALID');
    assertErr(
      validateReceipt(
        {
          examId: 'exam-01',
          examVersionId: 'v1.0.0',
          attemptId: 'att-01',
          submissionId: 's',
          payloadHash: 'hash-001',
          receivedAt: 'invalid-date',
          status: 'recorded',
        },
        expected
      ),
      'RECEIPT_INVALID'
    );
  });

  it('validateReceipt detects PAYLOAD_CONFLICT when payloadHash does not match', () => {
    const expected: OutboxRecord = {
      examId: 'exam-01',
      examVersionId: 'v1.0.0',
      attemptId: 'att-01',
      state: 'sending',
      finalRevision: 1,
      payloadHash: 'hash-original',
      endpointId: 'ep',
      retryCount: 0,
      nextRetryAt: null,
      generation: 1,
      receipt: null,
      lastError: null,
    };

    const input = {
      examId: 'exam-01',
      examVersionId: 'v1.0.0',
      attemptId: 'att-01',
      submissionId: 's-01',
      payloadHash: 'hash-different',
      receivedAt: '2026-11-14T08:00:00.000Z',
      status: 'recorded',
    };
    assertErr(validateReceipt(input, expected), 'PAYLOAD_CONFLICT');
  });

  it('enqueue sets local_saved when endpointId is null (endpoint disabled by default)', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-enq-01');
    await storage.create(final);

    const res = await enqueue(final, storage, null);
    const out = assertOk(res);
    assert.equal(out.state, 'local_saved');
    assert.equal(out.endpointId, null);
    assert.equal(out.retryCount, 0);
    assert.equal(out.generation, 1);
    assert.equal(out.payloadHash, computePayloadHash(final));
  });

  it('enqueue sets queued when endpointId is provided', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-enq-02');
    await storage.create(final);

    const res = await enqueue(final, storage, 'https://collector.example.com');
    const out = assertOk(res);
    assert.equal(out.state, 'queued');
    assert.equal(out.endpointId, 'https://collector.example.com');
    assert.equal(out.generation, 1);
  });

  it('enqueue is idempotent on server_confirmed attempt (terminal confirmation)', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-enq-term');
    await storage.create(final);

    // Initial enqueue
    const enqRes = await enqueue(final, storage, 'https://collector.example.com');
    const enqOut = assertOk(enqRes);

    // Simulate confirmation
    const confirmedRecord: OutboxRecord = {
      ...enqOut,
      state: 'server_confirmed',
      receipt: {
        examId: final.examId,
        examVersionId: final.examVersionId,
        attemptId: final.attemptId,
        submissionId: 'sub-terminal-1',
        payloadHash: enqOut.payloadHash,
        receivedAt: new Date().toISOString(),
        status: 'recorded',
      },
    };
    await storage.updateOutbox(confirmedRecord, enqOut.generation);

    // Call enqueue again: must return confirmed state and NOT revert to queued
    const secondEnq = await enqueue(final, storage, 'https://collector.example.com');
    const out2 = assertOk(secondEnq);
    assert.equal(out2.state, 'server_confirmed');
    assert.equal(out2.receipt?.submissionId, 'sub-terminal-1');
  });

  it('enqueue rejects non-final attempt records', async () => {
    const storage = new InMemoryStorage();
    const draft = createSampleAttempt('att-draft', { phase: 'draft' });
    const res = await enqueue(draft, storage, null);
    assertErr(res, 'ATTEMPT_NOT_FINAL');
  });

  it('drainOutbox returns COLLECTOR_DISABLED when endpointId is null', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-dis');
    await storage.create(final);
    await enqueue(final, storage, null); // endpointId: null

    const transport = new MockCollectorPort();
    const res = await drainOutbox(
      { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId },
      { storage, transport, now: () => 1000 }
    );

    assertErr(res, 'COLLECTOR_DISABLED');
    assert.equal(transport.dispatched.length, 0, 'Transport must not be invoked when endpoint is disabled');
  });

  it('AC: all five save/sync states reflect actual durable storage events', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-all-states');
    await storage.create(final);

    // 1. local_saved
    const enq1 = await enqueue(final, storage, null);
    assert.equal(assertOk(enq1).state, 'local_saved');

    // 2. queued
    const enq2 = await enqueue(final, storage, 'https://collector.example.com');
    assert.equal(assertOk(enq2).state, 'queued');

    // Setup transport that inspects intermediate state in storage during send
    let stateDuringSend: string | null = null;
    const transport = new MockCollectorPort();
    transport.handler = async () => {
      const current = await storage.getOutbox({
        examId: final.examId,
        examVersionId: final.examVersionId,
        attemptId: final.attemptId,
      });
      stateDuringSend = current.ok && current.value ? current.value.state : null;
      return {
        examId: final.examId,
        examVersionId: final.examVersionId,
        attemptId: final.attemptId,
        submissionId: 'sub-succ-1',
        payloadHash: computePayloadHash(final),
        receivedAt: new Date().toISOString(),
        status: 'recorded',
      };
    };

    // 3. sending & 4. server_confirmed
    const drainRes = await drainOutbox(
      { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId },
      { storage, transport, now: () => 1000 }
    );

    assert.equal(stateDuringSend, 'sending', 'Storage must record sending state while request is in-flight');
    const drainOut = assertOk(drainRes);
    assert.equal(drainOut.state, 'server_confirmed');

    // 5. failed state verification
    const finalFail = createSampleAttempt('att-fail-state');
    await storage.create(finalFail);
    await enqueue(finalFail, storage, 'https://collector.example.com');

    const failTransport = new MockCollectorPort();
    failTransport.handler = async () => {
      // Return invalid receipt (non-retryable error)
      return { invalid: true };
    };

    const failDrain = await drainOutbox(
      { examId: finalFail.examId, examVersionId: finalFail.examVersionId, attemptId: finalFail.attemptId },
      { storage, transport: failTransport, now: () => 1000 }
    );
    assert.equal(failDrain.ok, false);
    const failOutbox = assertOk(
      await storage.getOutbox({
        examId: finalFail.examId,
        examVersionId: finalFail.examVersionId,
        attemptId: finalFail.attemptId,
      })
    );
    assert.equal(failOutbox?.state, 'failed');

    // Confirm that all 5 states appeared in storage
    const recordedStates = new Set(storage.outboxHistory.map((r) => r.state));
    assert.ok(recordedStates.has('local_saved'));
    assert.ok(recordedStates.has('queued'));
    assert.ok(recordedStates.has('sending'));
    assert.ok(recordedStates.has('server_confirmed'));
    assert.ok(recordedStates.has('failed'));
  });

  it('drainOutbox enforces five-total-attempt retry budget with 1/2/4/8s backoff schedule', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-budget');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const transport = new MockCollectorPort();
    transport.handler = async () => {
      throw new Error('COLLECTOR_NETWORK: offline');
    };

    let clock = 1000;
    const now = () => clock;
    const key = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };

    // Attempt 1: retryCount 0 -> fails -> retryCount 1, backoff 1s (1000ms), nextRetryAt = 1000 + 1000 = 2000
    const r1 = await drainOutbox(key, { storage, transport, now });
    assertErr(r1, 'COLLECTOR_NETWORK');
    assert.equal(transport.dispatched.length, 1);
    let out = assertOk(await storage.getOutbox(key))!;
    assert.equal(out.state, 'queued');
    assert.equal(out.retryCount, 1);
    assert.equal(out.nextRetryAt, 2000);

    // Premature drain during backoff window must be rejected
    clock = 1500;
    const early = await drainOutbox(key, { storage, transport, now });
    assertErr(early, 'RETRY_BACKOFF_ACTIVE');
    assert.equal(transport.dispatched.length, 1, 'No network send during active backoff');

    // Attempt 2: at clock = 2000. retryCount 1 -> fails -> retryCount 2, backoff 2s (2000ms), nextRetryAt = 2000 + 2000 = 4000
    clock = 2000;
    const r2 = await drainOutbox(key, { storage, transport, now });
    assertErr(r2, 'COLLECTOR_NETWORK');
    assert.equal(transport.dispatched.length, 2);
    out = assertOk(await storage.getOutbox(key))!;
    assert.equal(out.retryCount, 2);
    assert.equal(out.nextRetryAt, 4000);

    // Attempt 3: at clock = 4000. retryCount 2 -> fails -> retryCount 3, backoff 4s (4000ms), nextRetryAt = 4000 + 4000 = 8000
    clock = 4000;
    const r3 = await drainOutbox(key, { storage, transport, now });
    assertErr(r3, 'COLLECTOR_NETWORK');
    assert.equal(transport.dispatched.length, 3);
    out = assertOk(await storage.getOutbox(key))!;
    assert.equal(out.retryCount, 3);
    assert.equal(out.nextRetryAt, 8000);

    // Attempt 4: at clock = 8000. retryCount 3 -> fails -> retryCount 4, backoff 8s (8000ms), nextRetryAt = 8000 + 8000 = 16000
    clock = 8000;
    const r4 = await drainOutbox(key, { storage, transport, now });
    assertErr(r4, 'COLLECTOR_NETWORK');
    assert.equal(transport.dispatched.length, 4);
    out = assertOk(await storage.getOutbox(key))!;
    assert.equal(out.retryCount, 4);
    assert.equal(out.nextRetryAt, 16000);

    // Attempt 5: at clock = 16000. retryCount 4 -> fails -> retryCount 5 (budget exhausted!), state = failed
    clock = 16000;
    const r5 = await drainOutbox(key, { storage, transport, now });
    assertErr(r5, 'RETRY_EXHAUSTED');
    assert.equal(transport.dispatched.length, 5, 'Exactly 5 total attempts executed');
    out = assertOk(await storage.getOutbox(key))!;
    assert.equal(out.state, 'failed');
    assert.equal(out.retryCount, 5);
    assert.equal(out.nextRetryAt, null);

    // Attempt 6 (post-exhaustion): rejected immediately
    clock = 20000;
    const r6 = await drainOutbox(key, { storage, transport, now });
    assertErr(r6, 'RETRY_EXHAUSTED');
    assert.equal(transport.dispatched.length, 5, 'No further sends after exhaustion');
  });

  it('exhausted attempt A does not starve attempt B of its retry budget', async () => {
    const storage = new InMemoryStorage();
    const finalA = createSampleAttempt('att-A');
    const finalB = createSampleAttempt('att-B');
    await storage.create(finalA);
    await storage.create(finalB);

    await enqueue(finalA, storage, 'https://collector.example.com');
    await enqueue(finalB, storage, 'https://collector.example.com');

    const keyA = { examId: finalA.examId, examVersionId: finalA.examVersionId, attemptId: finalA.attemptId };
    const keyB = { examId: finalB.examId, examVersionId: finalB.examVersionId, attemptId: finalB.attemptId };

    const transport = new MockCollectorPort();
    transport.handler = async (final) => {
      if (final.attemptId === 'att-A') {
        throw new Error('COLLECTOR_NETWORK: offline for A');
      }
      return {
        examId: final.examId,
        examVersionId: final.examVersionId,
        attemptId: final.attemptId,
        submissionId: 'sub-B-success',
        payloadHash: computePayloadHash(final),
        receivedAt: new Date().toISOString(),
        status: 'recorded',
      };
    };

    let clock = 1000;
    const now = () => clock;

    // Exhaust Attempt A across 5 dispatches
    for (let i = 0; i < COLLECTOR_MAX_TOTAL_ATTEMPTS; i++) {
      await drainOutbox(keyA, { storage, transport, now });
      clock += 10000;
    }
    const outA = assertOk(await storage.getOutbox(keyA))!;
    assert.equal(outA.state, 'failed');
    assert.equal(outA.retryCount, 5);

    // Drain Attempt B: it must have its fresh retry budget and succeed independently!
    const resB = await drainOutbox(keyB, { storage, transport, now });
    const outBVal = assertOk(resB);
    assert.equal(outBVal.state, 'server_confirmed');
    assert.equal(outBVal.receipt?.submissionId, 'sub-B-success');

    const outB = assertOk(await storage.getOutbox(keyB))!;
    assert.equal(outB.state, 'server_confirmed');
  });

  it('late A response does not update B or superseded generation', async () => {
    const storage = new InMemoryStorage();
    const finalA = createSampleAttempt('att-late-A');
    const finalB = createSampleAttempt('att-late-B');
    await storage.create(finalA);
    await storage.create(finalB);

    await enqueue(finalA, storage, 'https://collector.example.com');
    await enqueue(finalB, storage, 'https://collector.example.com');

    const keyA = { examId: finalA.examId, examVersionId: finalA.examVersionId, attemptId: finalA.attemptId };
    const keyB = { examId: finalB.examId, examVersionId: finalB.examVersionId, attemptId: finalB.attemptId };

    let resolveA: (val: any) => void = () => {};
    const transportA = new MockCollectorPort();
    transportA.handler = () => new Promise((resolve) => { resolveA = resolve; });

    // Begin draining A (async pending in-flight)
    const drainPromiseA = drainOutbox(keyA, { storage, transport: transportA, now: () => 1000 });

    // While A is in-flight, update Attempt B
    const transportB = new MockCollectorPort();
    transportB.handler = async (f) => ({
      examId: f.examId,
      examVersionId: f.examVersionId,
      attemptId: f.attemptId,
      submissionId: 'sub-B-instant',
      payloadHash: computePayloadHash(f),
      receivedAt: new Date().toISOString(),
      status: 'recorded',
    });
    await drainOutbox(keyB, { storage, transport: transportB, now: () => 1000 });

    // Also simulate A's generation getting superseded (e.g. concurrent cancellation or state bump)
    const outA = assertOk(await storage.getOutbox(keyA))!;
    await storage.updateOutbox({ ...outA, lastError: 'MANUAL_INTERRUPT' }, outA.generation);

    // Now let A's slow network callback finish
    resolveA({
      examId: finalA.examId,
      examVersionId: finalA.examVersionId,
      attemptId: finalA.attemptId,
      submissionId: 'sub-A-late',
      payloadHash: computePayloadHash(finalA),
      receivedAt: new Date().toISOString(),
      status: 'recorded',
    });

    const resultA = await drainPromiseA;
    assertErr(resultA, 'STALE_GENERATION', 'Late response must be rejected due to superseded generation');

    // Verify B's state was completely unmolested
    const outB = assertOk(await storage.getOutbox(keyB))!;
    assert.equal(outB.state, 'server_confirmed');
    assert.equal(outB.receipt?.submissionId, 'sub-B-instant');
  });

  it('handles timeout after server write: retry with immutable body and already_recorded confirmation', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-timeout-write');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };
    let dispatchCount = 0;
    const sentBodies: AttemptRecord[] = [];

    const transport = new MockCollectorPort();
    transport.handler = async (attempt, signal) => {
      dispatchCount++;
      sentBodies.push(JSON.parse(JSON.stringify(attempt)));

      if (dispatchCount === 1) {
        // Server writes data to backend, but connection hangs and times out
        await new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new Error('COLLECTOR_TIMEOUT'));
          });
        });
      }

      // On retry (dispatch 2), server returns already_recorded receipt
      return {
        examId: attempt.examId,
        examVersionId: attempt.examVersionId,
        attemptId: attempt.attemptId,
        submissionId: 'sub-server-idempotent-write',
        payloadHash: computePayloadHash(attempt),
        receivedAt: new Date().toISOString(),
        status: 'already_recorded',
      };
    };

    let clock = 1000;
    const now = () => clock;

    // Dispatch 1: Times out after 50ms
    const res1 = await drainOutbox(key, { storage, transport, now, timeoutMs: 50 });
    assertErr(res1, 'COLLECTOR_TIMEOUT');

    // Verify backoff scheduled
    const out1 = assertOk(await storage.getOutbox(key))!;
    assert.equal(out1.retryCount, 1);
    assert.equal(out1.state, 'queued');

    // Dispatch 2: Retries after backoff
    clock += 2000;
    const res2 = await drainOutbox(key, { storage, transport, now });
    const out2 = assertOk(res2);
    assert.equal(out2.state, 'server_confirmed');
    assert.equal(out2.receipt?.status, 'already_recorded');
    assert.equal(out2.receipt?.submissionId, 'sub-server-idempotent-write');

    // Verify immutable retry body across both attempts
    assert.equal(sentBodies.length, 2);
    assert.deepEqual(sentBodies[0], sentBodies[1], 'Sent attempt body must be completely immutable across retries');
  });

  it('rejects invalid and opaque receipts and transitions to failed without retrying', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-opaque');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };
    const transport = new MockCollectorPort();
    transport.handler = async () => {
      // Opaque HTML or empty success
      return '<!DOCTYPE html><html><body>Error</body></html>';
    };

    const res = await drainOutbox(key, { storage, transport, now: () => 1000 });
    assertErr(res, 'RECEIPT_INVALID');

    const out = assertOk(await storage.getOutbox(key))!;
    assert.equal(out.state, 'failed', 'Invalid receipt must mark outbox as failed immediately');
    assert.equal(out.retryCount, 5, 'Retry budget must be exhausted to prevent retrying invalid receipts');
    assert.equal(out.nextRetryAt, null);
  });

  it('rejects HTTP 4xx client errors without retrying', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-4xx');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };
    const transport = new MockCollectorPort();
    transport.handler = async () => {
      const err: any = new Error('Bad Request');
      err.status = 400;
      throw err;
    };

    const res = await drainOutbox(key, { storage, transport, now: () => 1000 });
    assertErr(res, 'COLLECTOR_HTTP');

    const out = assertOk(await storage.getOutbox(key))!;
    assert.equal(out.state, 'failed');
    assert.equal(out.retryCount, 5);
  });

  it('handles storage transaction failures gracefully during drainOutbox', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-tx-fail');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };
    const transport = new MockCollectorPort();

    // Trigger failure on next storage update (e.g. CAS conflict or storage unavailable)
    storage.failNextUpdate = true;
    const res = await drainOutbox(key, { storage, transport, now: () => 1000 });

    assertErr(res, 'STORAGE_CONFLICT');
    assert.equal(transport.dispatched.length, 0, 'Transport must not be invoked if storage transition to sending fails');
  });

  it('persists retry budget and state across simulated page reload without reset', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-reload');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };
    const transport = new MockCollectorPort();
    transport.handler = async () => {
      throw new Error('network down');
    };

    // Run 2 failed attempts
    await drainOutbox(key, { storage, transport, now: () => 1000 });
    // Attempt 1 failed at clock=1000: retryCount becomes 1, backoff is 1s (1000ms), nextRetryAt is 2000
    // Attempt 2 runs at clock=3000: retryCount was 1, so backoff is 2s (2000ms), nextRetryAt is 3000 + 2000 = 5000
    await drainOutbox(key, { storage, transport, now: () => 3000 });

    const outBeforeReload = assertOk(await storage.getOutbox(key))!;
    assert.equal(outBeforeReload.retryCount, 2);
    assert.equal(outBeforeReload.nextRetryAt, 3000 + 2000); // 5000

    // Simulate page reload: re-instantiate InMemoryStorage from saved durable state
    const reloadedStorage = new InMemoryStorage();
    await reloadedStorage.create(final);
    reloadedStorage.outbox.set(`${key.examId}::${key.examVersionId}::${key.attemptId}`, { ...outBeforeReload });

    const outAfterReload = assertOk(await reloadedStorage.getOutbox(key))!;
    assert.equal(outAfterReload.retryCount, 2, 'retryCount must be preserved after reload');
    assert.equal(outAfterReload.nextRetryAt, 5000, 'nextRetryAt must be preserved after reload');

    // Next attempt must resume from retryCount 2 -> 3 (at clock=5000)
    const res3 = await drainOutbox(key, { storage: reloadedStorage, transport, now: () => 5000 });
    assertErr(res3);
    const out3 = assertOk(await reloadedStorage.getOutbox(key))!;
    assert.equal(out3.retryCount, 3, 'Must increment to attempt 3/5 without resetting');
    // For retryCount 2, backoff is 4s (4000ms), so nextRetryAt is 5000 + 4000 = 9000
    assert.equal(out3.nextRetryAt, 9000);
  });
});
