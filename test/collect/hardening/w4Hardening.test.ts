import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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
  resumeOutbox,
  resetOutboxForRetry,
  getOutboxStatus,
  validateReceipt,
  computePayloadHash,
  CollectorError,
  DisabledCollectorPort,
  COLLECTOR_MAX_TOTAL_ATTEMPTS,
  COLLECTOR_BACKOFF_STEPS_MS,
  exportResults,
  serializeResultsCsv,
  serializeResultsJson,
  CSV_HEADERS,
  HttpCollectorTransport,
  createHttpTransport,
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

/**
 * Independent RFC 4180 CSV parser for testing formula-safety across all fields.
 */
function parseCsvRfc4180(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;

  while (i < csvText.length) {
    const ch = csvText[i]!;
    const next = i + 1 < csvText.length ? csvText[i + 1]! : '';

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += ch;
        i++;
        continue;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (ch === ',') {
        currentRow.push(currentCell);
        currentCell = '';
        i++;
        continue;
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i += 2;
        continue;
      } else if (ch === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        i++;
        continue;
      } else {
        currentCell += ch;
        i++;
        continue;
      }
    }
  }

  if (currentRow.length > 0 || currentCell.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

function createDummyExam(examId: string = 'exam-sample-01', examVersionId: string = 'v1.0.0'): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId,
    examVersionId,
    title: 'Đề kiểm tra trắc nghiệm',
    subject: 'Toán học',
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
      {
        kind: 'II',
        questionVersionId: 'q-02',
        title: 'Câu 2',
        content: 'Nội dung câu 2',
        statements: [
          { statementId: 'stmt-1', label: 'a', text: 'Ý a', answer: true },
          { statementId: 'stmt-2', label: 'b', text: 'Ý b', answer: false },
          { statementId: 'stmt-3', label: 'c', text: 'Ý c', answer: true },
          { statementId: 'stmt-4', label: 'd', text: 'Ý d', answer: false },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'q-03',
        title: 'Câu 3',
        content: 'Nội dung câu 3',
        answerKey: '-0,5',
      },
    ],
    assets: [],
  };
}

function createSampleAttempt(
  attemptId: string,
  overrides?: Partial<AttemptRecord>
): AttemptRecord {
  const exam = overrides?.examSnapshot ?? createDummyExam();
  return {
    schemaVersion: 'web-attempt-v1',
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    attemptId,
    revision: 1,
    candidateName: 'Thí sinh Thử nghiệm',
    examSnapshot: exam,
    presentationOrder: {
      seed: 'seed-01',
      questionOrder: ['q-01', 'q-02', 'q-03'],
      optionOrder: [{ questionVersionId: 'q-01', optionIds: ['opt-a', 'opt-b', 'opt-c', 'opt-d'] }],
    },
    responses: {
      attemptId,
      examVersionId: exam.examVersionId,
      responses: [
        { kind: 'I', questionVersionId: 'q-01', selectedOptionId: 'opt-a' },
        {
          kind: 'II',
          questionVersionId: 'q-02',
          answers: [
            { statementId: 'stmt-1', value: true },
            { statementId: 'stmt-2', value: false },
            { statementId: 'stmt-3', value: true },
            { statementId: 'stmt-4', value: false },
          ],
        },
        { kind: 'III', questionVersionId: 'q-03', raw: '-0,5' },
      ],
    },
    startedAt: 1731571200000,
    deadline: 1731574200000,
    phase: 'final',
    submittedAt: 1731573900000,
    scoreDTO: null,
    ...overrides,
  };
}

class InMemoryStorage implements StoragePort {
  attempts = new Map<string, AttemptRecord>();
  outbox = new Map<string, OutboxRecord>();
  outboxHistory: OutboxRecord[] = [];
  failNextUpdate = false;

  private keyStr(k: AttemptKey): string {
    return `${k.examId}::${k.examVersionId}::${k.attemptId}`;
  }

  async load(key: AttemptKey): Promise<Result<AttemptRecord | null>> {
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

  async listAttempts(): Promise<Result<readonly AttemptRecord[]>> {
    return { ok: true, value: Array.from(this.attempts.values()) };
  }

  async getObject(): Promise<Result<unknown | null>> {
    return { ok: true, value: null };
  }

  async putObject(): Promise<Result<number>> {
    return { ok: true, value: 1 };
  }

  async deleteObject(): Promise<Result<void>> {
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

    // Terminal state protection: server_confirmed cannot be downgraded
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

  async importBackup(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async clearAll(): Promise<Result<void>> {
    this.attempts.clear();
    this.outbox.clear();
    this.outboxHistory = [];
    return { ok: true, value: undefined };
  }
}

function createPendingTransport() {
  let resolveFn: (val: any) => void = () => {};
  let rejectFn: (err: any) => void = () => {};
  let onStarted: () => void = () => {};
  const readyPromise = new Promise<void>((r) => { onStarted = r; });

  const transport: CollectorPort = {
    async send(_final: AttemptRecord, _signal: AbortSignal) {
      onStarted();
      return new Promise((resolve, reject) => {
        resolveFn = resolve;
        rejectFn = reject;
      });
    },
  };

  return {
    transport,
    waitUntilStarted: () => readyPromise,
    resolve: (val: any) => resolveFn(val),
    reject: (err: any) => rejectFn(err),
  };
}

class MockCollectorPort implements CollectorPort {
  dispatched: AttemptRecord[] = [];
  handler: (final: AttemptRecord, signal: AbortSignal) => Promise<unknown> = async () => null;

  async send(final: AttemptRecord, signal: AbortSignal): Promise<unknown> {
    this.dispatched.push(JSON.parse(JSON.stringify(final)));
    return await this.handler(final, signal);
  }
}

describe('M4/W4 Hardening: Per-Tuple Retry Isolation across Reload & Switch', () => {
  it('isolates 3 distinct attempts across different exams during backoff, exhaustion, and reload', async () => {
    const storage = new InMemoryStorage();

    // Attempt A: Math exam (exam-01)
    const examMath = createDummyExam('exam-toan', 'v1.0.0');
    const finalA = createSampleAttempt('att-A', { examSnapshot: examMath });

    // Attempt B: Physics exam (exam-02)
    const examPhysics = createDummyExam('exam-ly', 'v2.0.0');
    const finalB = createSampleAttempt('att-B', { examSnapshot: examPhysics });

    // Attempt C: Math exam another attempt (exam-01)
    const finalC = createSampleAttempt('att-C', { examSnapshot: examMath });

    await storage.create(finalA);
    await storage.create(finalB);
    await storage.create(finalC);

    const ENDPOINT = 'https://collector.example.com/api';
    await enqueue(finalA, storage, ENDPOINT);
    await enqueue(finalB, storage, ENDPOINT);
    await enqueue(finalC, storage, ENDPOINT);

    const keyA: AttemptKey = { examId: finalA.examId, examVersionId: finalA.examVersionId, attemptId: finalA.attemptId };
    const keyB: AttemptKey = { examId: finalB.examId, examVersionId: finalB.examVersionId, attemptId: finalB.attemptId };
    const keyC: AttemptKey = { examId: finalC.examId, examVersionId: finalC.examVersionId, attemptId: finalC.attemptId };

    const transport = new MockCollectorPort();
    transport.handler = async (final) => {
      if (final.attemptId === 'att-A') {
        throw new Error('temporary network blip on A');
      }
      if (final.attemptId === 'att-C') {
        throw new Error('permanent network failure on C');
      }
      // Attempt B succeeds!
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

    // 1. Attempt A fails attempt 1 -> backoff 1s (nextRetryAt = 2000)
    const resA1 = await drainOutbox(keyA, { storage, transport, now });
    assertErr(resA1, 'COLLECTOR_NETWORK');
    const outA1 = assertOk(await storage.getOutbox(keyA))!;
    assert.equal(outA1.retryCount, 1);
    assert.equal(outA1.nextRetryAt, 2000);

    // 2. Switch to Attempt B: drains immediately and confirms without being delayed by A's backoff!
    const resB = await drainOutbox(keyB, { storage, transport, now });
    const outB = assertOk(resB);
    assert.equal(outB.state, 'server_confirmed');
    assert.equal(outB.receipt?.submissionId, 'sub-B-success');

    // 3. Switch to Attempt C: fails all 5 attempts and exhausts retry budget
    for (let i = 0; i < COLLECTOR_MAX_TOTAL_ATTEMPTS; i++) {
      await drainOutbox(keyC, { storage, transport, now });
      clock += 10000;
    }
    const outC = assertOk(await storage.getOutbox(keyC))!;
    assert.equal(outC.state, 'failed');
    assert.equal(outC.retryCount, 5);

    // 4. Switch back to Attempt A at clock = 55000 (well past nextRetryAt = 2000):
    // Attempt A retries: its retryCount moves from 1 to 2; it was NOT starved or failed by C's failure!
    const resA2 = await drainOutbox(keyA, { storage, transport, now });
    assertErr(resA2, 'COLLECTOR_NETWORK');
    const outA2 = assertOk(await storage.getOutbox(keyA))!;
    assert.equal(outA2.retryCount, 2);
    // Backoff for attempt 2 is 2000ms: nextRetryAt = 51000 + 2000 = 53000
    assert.equal(outA2.nextRetryAt, 53000);

    // 5. Simulate page reload: restore storage from snapshot
    const reloadedStorage = new InMemoryStorage();
    await reloadedStorage.create(finalA);
    await reloadedStorage.create(finalB);
    await reloadedStorage.create(finalC);
    reloadedStorage.outbox.set(`${keyA.examId}::${keyA.examVersionId}::${keyA.attemptId}`, { ...outA2 });
    reloadedStorage.outbox.set(`${keyB.examId}::${keyB.examVersionId}::${keyB.attemptId}`, { ...outB });
    reloadedStorage.outbox.set(`${keyC.examId}::${keyC.examVersionId}::${keyC.attemptId}`, { ...outC });

    // Calling enqueue on Attempt C (failed) must keep it in 'failed' state!
    const enqC = await enqueue(finalC, reloadedStorage, ENDPOINT);
    assert.equal(assertOk(enqC).state, 'failed');

    // Calling enqueue on Attempt B (confirmed) must keep it in 'server_confirmed' state!
    const enqB = await enqueue(finalB, reloadedStorage, ENDPOINT);
    assert.equal(assertOk(enqB).state, 'server_confirmed');

    // Controlled manual reset on C: transitions to queued and resets retry budget
    const resetC = await resetOutboxForRetry(keyC, reloadedStorage);
    const outResetC = assertOk(resetC);
    assert.equal(outResetC.state, 'queued');
    assert.equal(outResetC.retryCount, 0);

    // Attempt B (server_confirmed) cannot be reset
    const resetB = await resetOutboxForRetry(keyB, reloadedStorage);
    assertErr(resetB, 'ATTEMPT_ALREADY_CONFIRMED');
  });
});

describe('M4/W4 Hardening: Late Sent-Attempt Receipt & Generation CAS', () => {
  it('rejects late receipt when generation has moved forward (STALE_GENERATION)', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-late-gen');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key: AttemptKey = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };

    const pending = createPendingTransport();

    // Dispatch Generation 1 (hangs in-flight)
    const drainPromise1 = drainOutbox(key, { storage, transport: pending.transport, now: () => 1000 });
    await pending.waitUntilStarted();

    // Generation 1 is now in 'sending' state
    const outGen1 = assertOk(await storage.getOutbox(key))!;
    assert.equal(outGen1.state, 'sending');
    assert.equal(outGen1.generation, 2);

    // Simulate page reload or user re-trigger bumping generation:
    // We update outbox generation to 3
    await storage.updateOutbox({ ...outGen1, generation: 3 }, outGen1.generation);

    // Now Generation 1's slow network call completes with a valid receipt:
    pending.resolve({
      examId: final.examId,
      examVersionId: final.examVersionId,
      attemptId: final.attemptId,
      submissionId: 'sub-late-gen-1',
      payloadHash: computePayloadHash(final),
      receivedAt: new Date().toISOString(),
      status: 'recorded',
    });

    const res1 = await drainPromise1;
    // Generation 1 MUST be rejected as STALE_GENERATION!
    assertErr(res1, 'STALE_GENERATION');

    // Storage record must NOT have been overwritten by Gen 1:
    const outCurrent = assertOk(await storage.getOutbox(key))!;
    assert.notEqual(outCurrent.state, 'server_confirmed');
    assert.equal(outCurrent.receipt, null);
  });

  it('accepts late receipt without conflict if outbox is already server_confirmed', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-late-confirmed');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key: AttemptKey = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };

    const pending = createPendingTransport();

    // Start dispatch 1
    const drainPromise1 = drainOutbox(key, { storage, transport: pending.transport, now: () => 1000 });
    await pending.waitUntilStarted();

    const out1 = assertOk(await storage.getOutbox(key))!;
    assert.equal(out1.state, 'sending');

    // Simulate concurrent worker marking it server_confirmed
    const confirmedRecord: OutboxRecord = {
      ...out1,
      state: 'server_confirmed',
      receipt: {
        examId: final.examId,
        examVersionId: final.examVersionId,
        attemptId: final.attemptId,
        submissionId: 'sub-concurrent-winner',
        payloadHash: computePayloadHash(final),
        receivedAt: new Date().toISOString(),
        status: 'recorded',
      },
    };
    await storage.updateOutbox(confirmedRecord, out1.generation);

    // Now late callback finishes
    pending.resolve({
      examId: final.examId,
      examVersionId: final.examVersionId,
      attemptId: final.attemptId,
      submissionId: 'sub-late-loser',
      payloadHash: computePayloadHash(final),
      receivedAt: new Date().toISOString(),
      status: 'already_recorded',
    });

    const res1 = await drainPromise1;
    // Must return the confirmed record cleanly
    const outFinal = assertOk(res1);
    assert.equal(outFinal.state, 'server_confirmed');
    assert.equal(outFinal.receipt?.submissionId, 'sub-concurrent-winner');
  });

  it('safely discards late network errors if newer generation or confirmation exists', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-late-error');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key: AttemptKey = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };

    const pending = createPendingTransport();

    // Start dispatch
    const drainPromise = drainOutbox(key, { storage, transport: pending.transport, now: () => 1000 });
    await pending.waitUntilStarted();

    const out = assertOk(await storage.getOutbox(key))!;
    // Bump generation
    await storage.updateOutbox({ ...out, generation: 3 }, out.generation);

    // Now late network error triggers
    pending.reject(new Error('COLLECTOR_NETWORK: offline'));

    const res = await drainPromise;
    // Error must be reported as STALE_GENERATION, NOT as an error that mutates storage
    assertErr(res, 'STALE_GENERATION');

    const current = assertOk(await storage.getOutbox(key))!;
    assert.equal(current.retryCount, 0, 'RetryCount must NOT be incremented by a stale error');
  });
});

describe('M4/W4 Hardening: Same Tuple/Hash Replay vs Different Hash Conflict', () => {
  it('handles client-side and server-side idempotent replay on matching tuple and hash', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-replay-ok');
    await storage.create(final);

    const ENDPOINT = 'https://collector.example.com/api';
    const enq1 = assertOk(await enqueue(final, storage, ENDPOINT));

    // Client replay: calling enqueue again returns same outbox record
    const enq2 = assertOk(await enqueue(final, storage, ENDPOINT));
    assert.equal(enq1.payloadHash, enq2.payloadHash);
    assert.equal(enq1.attemptId, enq2.attemptId);

    // Server-side Apps Script replay
    const sampleCode = fs.readFileSync(path.resolve('apps-script/sample/Code.js'), 'utf8');
    const moduleObj: Record<string, any> = { exports: {} };
    const rows: any[][] = [];
    const sandbox: Record<string, any> = {
      module: moduleObj,
      exports: moduleObj.exports,
      SpreadsheetApp: {
        getActiveSpreadsheet: () => ({
          getActiveSheet: () => ({
            getLastRow: () => rows.length,
            getRange: (startRow: number, startCol: number, numRows: number, numCols: number) => {
              const sCol = typeof startCol === 'number' && startCol > 0 ? startCol - 1 : 0;
              const nCols = typeof numCols === 'number' && numCols > 0 ? numCols : 1;
              const nRows = typeof numRows === 'number' && numRows > 0 ? numRows : 1;
              return {
                getValues: () =>
                  rows.slice(startRow - 1, startRow - 1 + nRows).map(r => r.slice(sCol, sCol + nCols)),
              };
            },
            appendRow: (row: any[]) => rows.push(row),
          }),
        }),
        flush: () => {},
      },
      LockService: {
        getScriptLock: () => ({
          tryLock: () => true,
          releaseLock: () => {},
        }),
      },
      ContentService: {
        MimeType: { JSON: 'application/json' },
        createTextOutput: (s: string) => ({ body: s, setMimeType: () => ({ body: s }) }),
      },
      console,
      Date,
      JSON,
      String,
      Math,
      BigInt,
    };
    vm.createContext(sandbox);
    vm.runInContext(sampleCode, sandbox);

    const payload = {
      attempt_id: final.attemptId,
      exam_id: final.examId,
      exam_version_id: final.examVersionId,
      candidate_display: final.candidateName,
      total_score: '10',
      max_total: '10',
      sections: {
        I: { score: '1/4', max: '1/4' },
        II: { score: '1', max: '1' },
        III: { score: '35/4', max: '35/4' },
      },
      policy_version: 'custom-v1',
      raw_answers_json: {},
      payloadHash: computePayloadHash(final),
    };

    // First POST: records
    const resPost1 = moduleObj.exports.doPost({ postData: { contents: JSON.stringify(payload) } });
    const data1 = JSON.parse(resPost1.body);
    assert.equal(data1.status, 'recorded');
    assert.equal(rows.length, 2); // Header + row 1

    // Second POST: same tuple and hash -> already_recorded, row count unchanged!
    const resPost2 = moduleObj.exports.doPost({ postData: { contents: JSON.stringify(payload) } });
    const data2 = JSON.parse(resPost2.body);
    assert.equal(data2.status, 'already_recorded');
    assert.equal(rows.length, 2, 'Idempotent replay must not append new row');
  });

  it('rejects same tuple with different payloadHash with PAYLOAD_CONFLICT', async () => {
    const storage = new InMemoryStorage();
    const final1 = createSampleAttempt('att-conflict-tuple');
    await storage.create(final1);
    await enqueue(final1, storage, 'https://collector.example.com');

    // Mutate attempt answers (causing different hash)
    const finalConflicting = createSampleAttempt('att-conflict-tuple', {
      candidateName: 'Changed Name',
      responses: {
        attemptId: 'att-conflict-tuple',
        examVersionId: 'v1.0.0',
        responses: [{ kind: 'I', questionVersionId: 'q-01', selectedOptionId: 'opt-b' }],
      },
    });

    // Enqueue must reject with PAYLOAD_CONFLICT
    const enqRes = await enqueue(finalConflicting, storage, 'https://collector.example.com');
    assertErr(enqRes, 'PAYLOAD_CONFLICT');

    // validateReceipt must also detect PAYLOAD_CONFLICT
    const expectedOutbox: OutboxRecord = {
      examId: final1.examId,
      examVersionId: final1.examVersionId,
      attemptId: final1.attemptId,
      state: 'sending',
      finalRevision: 1,
      payloadHash: computePayloadHash(final1),
      endpointId: 'https://collector.example.com',
      retryCount: 0,
      nextRetryAt: null,
      generation: 1,
      receipt: null,
      lastError: null,
    };

    const conflictingReceipt = {
      examId: final1.examId,
      examVersionId: final1.examVersionId,
      attemptId: final1.attemptId,
      submissionId: 'sub-01',
      payloadHash: 'different-hash-1234',
      receivedAt: new Date().toISOString(),
      status: 'recorded',
    };

    const valRes = validateReceipt(conflictingReceipt, expectedOutbox);
    assertErr(valRes, 'PAYLOAD_CONFLICT');
  });
});

describe('M4/W4 Hardening: Invalid, Opaque, and HTTP Receipts Handling', () => {
  it('rejects all variants of invalid receipts with RECEIPT_INVALID and transitions outbox to failed', async () => {
    const expected: OutboxRecord = {
      examId: 'exam-01',
      examVersionId: 'v1.0.0',
      attemptId: 'att-inv-01',
      state: 'sending',
      finalRevision: 1,
      payloadHash: 'hash-123456789012',
      endpointId: 'ep',
      retryCount: 0,
      nextRetryAt: null,
      generation: 1,
      receipt: null,
      lastError: null,
    };

    // 1. Primitive and empty values
    assertErr(validateReceipt(null, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt(undefined, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt(12345, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt('string receipt', expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt([], expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt({}, expected), 'RECEIPT_INVALID');

    // 2. Missing required fields
    assertErr(validateReceipt({ examId: 'exam-01' }, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt({ examId: 'exam-01', examVersionId: 'v1.0.0' }, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt({ examId: 'exam-01', examVersionId: 'v1.0.0', attemptId: 'att-inv-01' }, expected), 'RECEIPT_INVALID');

    // 3. Mismatched tuple fields
    assertErr(validateReceipt({ ...expected, submissionId: 's', receivedAt: new Date().toISOString(), status: 'recorded', examId: 'wrong-exam' }, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt({ ...expected, submissionId: 's', receivedAt: new Date().toISOString(), status: 'recorded', examVersionId: 'wrong-ver' }, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt({ ...expected, submissionId: 's', receivedAt: new Date().toISOString(), status: 'recorded', attemptId: 'wrong-att' }, expected), 'RECEIPT_INVALID');

    // 4. Invalid date
    assertErr(validateReceipt({ ...expected, submissionId: 's', receivedAt: 'not-a-date', status: 'recorded' }, expected), 'RECEIPT_INVALID');

    // 5. Invalid status string
    assertErr(validateReceipt({ ...expected, submissionId: 's', receivedAt: new Date().toISOString(), status: 'success' }, expected), 'RECEIPT_INVALID');
    assertErr(validateReceipt({ ...expected, submissionId: 's', receivedAt: new Date().toISOString(), status: 'ok' }, expected), 'RECEIPT_INVALID');
  });

  it('maps Apps Script SERVER_BUSY response to retryable backoff', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-server-busy');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key: AttemptKey = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };
    const transport = new MockCollectorPort();
    transport.handler = async () => ({
      success: false,
      error: 'SERVER_BUSY',
      message: 'Máy chủ đang bận xử lý bài thi khác, vui lòng thử lại sau giây lát',
      status: 503,
    });

    const res = await drainOutbox(key, { storage, transport, now: () => 1000 });
    const err = assertErr(res, 'COLLECTOR_HTTP');
    assert.equal(res.ok, false);
    assert.equal(err.recoverable, true, 'SERVER_BUSY must be retryable');

    // Verify backoff scheduled
    const out = assertOk(await storage.getOutbox(key))!;
    assert.equal(out.state, 'queued');
    assert.equal(out.retryCount, 1);
    assert.equal(out.nextRetryAt, 2000); // 1000 + 1000ms
  });

  it('maps Apps Script PAYLOAD_CONFLICT response to non-retryable failed state', async () => {
    const storage = new InMemoryStorage();
    const final = createSampleAttempt('att-server-conflict');
    await storage.create(final);
    await enqueue(final, storage, 'https://collector.example.com');

    const key: AttemptKey = { examId: final.examId, examVersionId: final.examVersionId, attemptId: final.attemptId };
    const transport = new MockCollectorPort();
    transport.handler = async () => ({
      success: false,
      error: 'PAYLOAD_CONFLICT',
      message: 'Xung đột dữ liệu',
      status: 409,
    });

    const res = await drainOutbox(key, { storage, transport, now: () => 1000 });
    const err = assertErr(res, 'PAYLOAD_CONFLICT');
    assert.equal(err.recoverable, false);

    const out = assertOk(await storage.getOutbox(key))!;
    assert.equal(out.state, 'failed');
    assert.equal(out.retryCount, COLLECTOR_MAX_TOTAL_ATTEMPTS);
  });
});

describe('M4/W4 Hardening: Independent CSV Formula-Safety Parsing across ALL 17 Fields', () => {
  it('neutralizes spreadsheet formula triggers across every single one of the 17 standard CSV columns', () => {
    // Construct an attempt record specifically loaded with hostile formula injection triggers in every single field:
    const examSnapshot = createDummyExam('+EXAM_FORMULA_INJECT', '-VER_FORMULA_INJECT');
    (examSnapshot as any).ruleSetId = '=RULESET_INJECT';

    const hostileAttempt: AttemptRecord = {
      schemaVersion: 'web-attempt-v1',
      examId: '+EXAM_FORMULA_INJECT',
      examVersionId: '-VER_FORMULA_INJECT',
      attemptId: '=ATTEMPT_FORMULA_INJECT',
      revision: 1,
      candidateName: '@CANDIDATE_FORMULA_INJECT',
      examSnapshot,
      presentationOrder: {
        seed: 'seed-01',
        questionOrder: ['q-01'],
        optionOrder: [{ questionVersionId: 'q-01', optionIds: ['opt-a'] }],
      },
      responses: {
        attemptId: '=ATTEMPT_FORMULA_INJECT',
        examVersionId: '-VER_FORMULA_INJECT',
        responses: [
          { kind: 'I', questionVersionId: '|Q1_INJECT', selectedOptionId: '=OPT_INJECT' },
          { kind: 'III', questionVersionId: '＝Q3_INJECT', raw: '-0,5' },
        ],
      },
      startedAt: 1731571200000,
      deadline: 1731574200000,
      phase: 'final',
      submittedAt: 1731573900000,
      scoreDTO: {
        total: '@TOTAL_INJECT',
        maxTotal: '|MAX_TOTAL_INJECT',
        ruleSetId: '=POLICY_INJECT',
        sections: {
          I: { score: '－SCORE_P1_INJECT', max: '＠MAX_P1_INJECT' },
          II: { score: '｜SCORE_P2_INJECT', max: '=MAX_P2_INJECT' },
          III: { score: '+SCORE_P3_INJECT', max: '-MAX_P3_INJECT' },
        },
      },
    };

    const csvText = serializeResultsCsv([hostileAttempt]);
    const parsed = parseCsvRfc4180(csvText);

    assert.equal(parsed.length, 2, 'CSV must have header row and exactly 1 data row');
    const headerRow = parsed[0]!;
    const dataRow = parsed[1]!;

    assert.equal(headerRow.length, 17, 'Must have exactly 17 headers');
    assert.equal(dataRow.length, 17, 'Data row must have exactly 17 cells');
    assert.deepEqual(headerRow, [...CSV_HEADERS]);

    // Test Col 1: attempt_id (originally '=ATTEMPT_FORMULA_INJECT')
    assert.equal(dataRow[0], "'=ATTEMPT_FORMULA_INJECT");

    // Test Col 2: exam_id (originally '+EXAM_FORMULA_INJECT')
    assert.equal(dataRow[1], "'+EXAM_FORMULA_INJECT");

    // Test Col 3: exam_version_id (originally '-VER_FORMULA_INJECT')
    assert.equal(dataRow[2], "'-VER_FORMULA_INJECT");

    // Test Col 4: candidate_display (originally '@CANDIDATE_FORMULA_INJECT')
    assert.equal(dataRow[3], "'@CANDIDATE_FORMULA_INJECT");

    // Test Col 5: started_at (ISO date string, safe)
    assert.ok(dataRow[4]!.startsWith('2024-') || dataRow[4]!.startsWith('2026-'));

    // Test Col 6: submitted_at (ISO date string, safe)
    assert.ok(dataRow[5]!.startsWith('2024-') || dataRow[5]!.startsWith('2026-'));

    // Test Col 7: duration_seconds (numeric string, safe)
    assert.equal(dataRow[6], '2700');

    // Test Col 8: score_p1 (originally '－SCORE_P1_INJECT' fullwidth minus)
    assert.equal(dataRow[7], "'－SCORE_P1_INJECT");

    // Test Col 9: max_p1 (originally '＠MAX_P1_INJECT' fullwidth at)
    assert.equal(dataRow[8], "'＠MAX_P1_INJECT");

    // Test Col 10: score_p2 (originally '｜SCORE_P2_INJECT' fullwidth pipe)
    assert.equal(dataRow[9], "'｜SCORE_P2_INJECT");

    // Test Col 11: max_p2 (originally '=MAX_P2_INJECT')
    assert.equal(dataRow[10], "'=MAX_P2_INJECT");

    // Test Col 12: score_p3 (originally '+SCORE_P3_INJECT')
    assert.equal(dataRow[11], "'+SCORE_P3_INJECT");

    // Test Col 13: max_p3 (originally '-MAX_P3_INJECT')
    assert.equal(dataRow[12], "'-MAX_P3_INJECT");

    // Test Col 14: total_score (originally '@TOTAL_INJECT')
    assert.equal(dataRow[13], "'@TOTAL_INJECT");

    // Test Col 15: max_total (originally '|MAX_TOTAL_INJECT')
    assert.equal(dataRow[14], "'|MAX_TOTAL_INJECT");

    // Test Col 16: policy_version (originally '=POLICY_INJECT')
    assert.equal(dataRow[15], "'=POLICY_INJECT");

    // Test Col 17: raw_answers_json
    const rawJsonStr = dataRow[16]!;
    const parsedRawJson = JSON.parse(rawJsonStr);
    assert.ok(Array.isArray(parsedRawJson));
    assert.equal(parsedRawJson[0].questionVersionId, "'|Q1_INJECT");
    assert.equal(parsedRawJson[0].selectedOptionId, "'=OPT_INJECT");
    assert.equal(parsedRawJson[1].questionVersionId, "'＝Q3_INJECT");
    assert.equal(parsedRawJson[1].raw, "'-0,5"); // Part III negative value safely neutralized

    // Crucial Invariant: JSON export MUST preserve exact raw values WITHOUT leading apostrophes!
    const jsonStr = serializeResultsJson([hostileAttempt]);
    const parsedJson = JSON.parse(jsonStr);

    assert.equal(parsedJson.attemptId, '=ATTEMPT_FORMULA_INJECT', 'JSON must NOT have apostrophe added to attemptId');
    assert.equal(parsedJson.candidateName, '@CANDIDATE_FORMULA_INJECT', 'JSON must NOT have apostrophe added to candidateName');
    assert.equal(parsedJson.responses.responses[1].raw, '-0,5', 'JSON must NOT have apostrophe added to Part III raw answer');
  });
});

describe('M4/W4 AC: Security Boundaries, Zero Credentials & Undeployed Integrity', () => {
  it('strictly adheres to zero credentials, disabled by default, and offline export usability', async () => {
    // 1. DisabledCollectorPort throws COLLECTOR_DISABLED
    const disabledPort = new DisabledCollectorPort();
    await assert.rejects(
      async () => disabledPort.send(createSampleAttempt('att-dis'), new AbortController().signal),
      (err: any) => err instanceof CollectorError && err.code === 'COLLECTOR_DISABLED'
    );

    // 2. Offline export remains completely usable
    const attempt = createSampleAttempt('att-offline-export');
    const jsonBlob = exportResults([attempt], 'json');
    const csvBlob = exportResults([attempt], 'csv');

    assert.equal(jsonBlob.type, 'application/json;charset=utf-8');
    assert.equal(csvBlob.type, 'text/csv;charset=utf-8');
    assert.ok(jsonBlob.size > 0);
    assert.ok(csvBlob.size > 0);

    // 3. Inspect apps-script/sample/README.md and Code.js for contract warnings
    const readme = fs.readFileSync(path.resolve('apps-script/sample/README.md'), 'utf8');
    const codeJs = fs.readFileSync(path.resolve('apps-script/sample/Code.js'), 'utf8');

    assert.ok(readme.includes('chưa triển khai, chưa kiểm CORS thật'));
    assert.ok(codeJs.includes('chưa triển khai, chưa kiểm CORS thật'));
    assert.ok(readme.includes('D04'));
    assert.ok(codeJs.includes('D04 / D08'));

    // 4. Verify no Google credentials exist in any scope file
    const scopeFiles = [
      'src/collect/index.ts',
      'src/collect/export.ts',
      'src/collect/transport.ts',
      'src/collect/types.ts',
      'apps-script/sample/Code.js',
      'apps-script/sample/appsscript.json',
      'apps-script/sample/README.md',
    ];

    for (const file of scopeFiles) {
      const content = fs.readFileSync(path.resolve(file), 'utf8');
      assert.ok(!content.includes('client_secret'), `Secret client_secret found in ${file}`);
      assert.ok(!content.includes('private_key_id'), `Secret private_key_id found in ${file}`);
      assert.ok(!content.includes('AIzaSy'), `Google API key pattern found in ${file}`);
    }
  });
});
