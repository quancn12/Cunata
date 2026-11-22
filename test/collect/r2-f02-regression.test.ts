import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAppsScriptCollectorPort,
  computePayloadHash,
  drainOutbox,
  validateReceipt,
  CollectorError,
} from '../../src/collect/index.ts';
import type { AttemptRecord, OutboxRecord, StoragePort } from '../../src/collect/types.ts';

function createFixture() {
  const final: AttemptRecord = {
    schemaVersion: 'web-attempt-v1',
    examId: 'audit-r2-receipt',
    examVersionId: 'v1.0.0',
    attemptId: 'audit-attempt',
    revision: 1,
    candidateName: 'Synthetic audit',
    examSnapshot: {
      schemaVersion: 'web-exam-v1',
      examId: 'audit-r2-receipt',
      examVersionId: 'v1.0.0',
      title: 'Đề kiểm tra',
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
      assets: [],
      questions: [],
    },
    presentationOrder: { seed: 'audit', questionOrder: [], optionOrder: [] },
    responses: { attemptId: 'audit-attempt', examVersionId: 'v1.0.0', responses: [] },
    startedAt: 1000,
    deadline: 100000,
    submittedAt: 2000,
    phase: 'final',
    scoreDTO: null,
  };

  const payloadHash = computePayloadHash(final);

  let out: OutboxRecord = {
    examId: final.examId,
    examVersionId: final.examVersionId,
    attemptId: final.attemptId,
    state: 'queued',
    finalRevision: 1,
    payloadHash,
    endpointId: '/api/rpc',
    retryCount: 0,
    nextRetryAt: null,
    generation: 0,
    receipt: null,
    lastError: null,
  };

  const storage: StoragePort = {
    load: async () => ({ ok: true, value: final }),
    create: async () => ({ ok: true, value: final }),
    saveDraft: async () => ({ ok: true, value: final }),
    finalize: async () => ({ ok: true, value: final }),
    listAttempts: async () => ({ ok: true, value: [final] }),
    getObject: async () => ({ ok: true, value: null }),
    putObject: async () => ({ ok: true, value: 1 }),
    deleteObject: async () => ({ ok: true, value: undefined }),
    getOutbox: async () => ({ ok: true, value: out }),
    updateOutbox: async (value) => {
      out = value;
      return { ok: true, value: out };
    },
    exportBackup: async () => ({ ok: true, value: new Blob() }),
    importBackup: async () => ({ ok: true, value: undefined }),
    clearAll: async () => ({ ok: true, value: undefined }),
  };

  return { final, storage, getOut: () => out };
}

test('R2-F02: collector rejects empty response and does not transition to server_confirmed', async () => {
  const { final, storage, getOut } = createFixture();
  const transport = createAppsScriptCollectorPort('/api/rpc', async () => Response.json({}), 'application/json');
  const result = await drainOutbox(final, { storage, transport, now: () => 5000 });

  assert.equal(result.ok, false, 'drainOutbox must fail on empty response');
  assert.notEqual(getOut().state, 'server_confirmed', 'Outbox must NOT transition to server_confirmed');
  assert.equal(getOut().receipt, null, 'Receipt must remain null');
});

test('R2-F02: collector rejects response with mismatched attempt_id', async () => {
  const { final, storage, getOut } = createFixture();
  const transport = createAppsScriptCollectorPort(
    '/api/rpc',
    async () =>
      Response.json({
        success: true,
        status: 'NEWLY_RECORDED',
        attempt_id: 'OTHER-ATTEMPT',
        recorded_at: '2026-11-23T00:00:00Z',
      }),
    'application/json'
  );
  const result = await drainOutbox(final, { storage, transport, now: () => 5000 });

  assert.equal(result.ok, false, 'drainOutbox must fail on mismatched attempt_id');
  assert.notEqual(getOut().state, 'server_confirmed', 'Outbox must NOT transition to server_confirmed');
  assert.equal(getOut().receipt, null, 'Receipt must remain null');
});

test('R2-F02: collector rejects response missing success:true', async () => {
  const { final, storage, getOut } = createFixture();
  const transport = createAppsScriptCollectorPort(
    '/api/rpc',
    async () =>
      Response.json({
        status: 'NEWLY_RECORDED',
        attempt_id: final.attemptId,
        recorded_at: '2026-11-23T00:00:00Z',
      }),
    'application/json'
  );
  const result = await drainOutbox(final, { storage, transport, now: () => 5000 });

  assert.equal(result.ok, false, 'Must fail when success:true is missing');
  assert.notEqual(getOut().state, 'server_confirmed');
});

test('R2-F02: collector rejects unknown status and missing timestamp', async () => {
  const { final, storage, getOut } = createFixture();

  // Status lạ
  const badStatusTransport = createAppsScriptCollectorPort(
    '/api/rpc',
    async () =>
      Response.json({
        success: true,
        status: 'WEIRD_STATUS',
        attempt_id: final.attemptId,
        recorded_at: '2026-11-23T00:00:00Z',
      }),
    'application/json'
  );
  const res1 = await drainOutbox(final, { storage, transport: badStatusTransport, now: () => 5000 });
  assert.equal(res1.ok, false, 'Must reject unknown status');
  assert.notEqual(getOut().state, 'server_confirmed');

  // Thiếu timestamp
  const noTimeTransport = createAppsScriptCollectorPort(
    '/api/rpc',
    async () =>
      Response.json({
        success: true,
        status: 'NEWLY_RECORDED',
        attempt_id: final.attemptId,
      }),
    'application/json'
  );
  const res2 = await drainOutbox(final, { storage, transport: noTimeTransport, now: () => 5000 });
  assert.equal(res2.ok, false, 'Must reject missing recorded_at');
  assert.notEqual(getOut().state, 'server_confirmed');

  // Sai timestamp
  const invalidTimeTransport = createAppsScriptCollectorPort(
    '/api/rpc',
    async () =>
      Response.json({
        success: true,
        status: 'NEWLY_RECORDED',
        attempt_id: final.attemptId,
        recorded_at: 'invalid-timestamp-string',
      }),
    'application/json'
  );
  const res3 = await drainOutbox(final, { storage, transport: invalidTimeTransport, now: () => 5000 });
  assert.equal(res3.ok, false, 'Must reject invalid timestamp');
  assert.notEqual(getOut().state, 'server_confirmed');
});

test('R2-F02: collector detects payloadHash conflict when server returns mismatched hash', async () => {
  const { final, storage, getOut } = createFixture();
  const transport = createAppsScriptCollectorPort(
    '/api/rpc',
    async () =>
      Response.json({
        success: true,
        status: 'NEWLY_RECORDED',
        attempt_id: final.attemptId,
        recorded_at: '2026-11-23T00:00:00Z',
        payloadHash: 'mismatched-server-hash-1234',
      }),
    'application/json'
  );
  const result = await drainOutbox(final, { storage, transport, now: () => 5000 });

  assert.equal(result.ok, false, 'Must fail on mismatched payloadHash');
  assert.notEqual(getOut().state, 'server_confirmed');
});

test('R2-F02: collector accepts valid Vercel API response and transitions to server_confirmed', async () => {
  const { final, storage, getOut } = createFixture();
  const transport = createAppsScriptCollectorPort(
    '/api/rpc',
    async () =>
      Response.json({
        success: true,
        status: 'NEWLY_RECORDED',
        attempt_id: final.attemptId,
        recorded_at: '2026-11-23T00:00:00Z',
        message: 'Ghi nhận kết quả bài thi thành công',
      }),
    'application/json'
  );
  const result = await drainOutbox(final, { storage, transport, now: () => 5000 });

  assert.equal(result.ok, true, 'Valid response must succeed');
  assert.equal(getOut().state, 'server_confirmed');
  assert.equal(getOut().receipt?.status, 'recorded');
  assert.equal(getOut().receipt?.attemptId, final.attemptId);
  assert.equal(getOut().receipt?.receivedAt, '2026-11-23T00:00:00Z');
});

test('R2-F02: collector accepts valid ALREADY_RECORDED response', async () => {
  const { final, storage, getOut } = createFixture();
  const transport = createAppsScriptCollectorPort(
    '/api/rpc',
    async () =>
      Response.json({
        success: true,
        status: 'ALREADY_RECORDED',
        attempt_id: final.attemptId,
        recorded_at: '2026-11-23T00:00:00Z',
        message: 'Kết quả bài thi đã được ghi nhận trước đó',
      }),
    'application/json'
  );
  const result = await drainOutbox(final, { storage, transport, now: () => 5000 });

  assert.equal(result.ok, true);
  assert.equal(getOut().state, 'server_confirmed');
  assert.equal(getOut().receipt?.status, 'already_recorded');
});

test('R2-F02: validateReceipt rejects input with mismatched attempt_id or hash', () => {
  const { final, getOut } = createFixture();
  const out = getOut();

  const badAttempt = validateReceipt(
    {
      success: true,
      examId: final.examId,
      examVersionId: final.examVersionId,
      attemptId: 'WRONG-ATTEMPT',
      attempt_id: 'WRONG-ATTEMPT',
      payloadHash: out.payloadHash,
      submissionId: 'sub-1',
      receivedAt: '2026-11-23T00:00:00Z',
      status: 'recorded',
    },
    out
  );
  assert.equal(badAttempt.ok, false);

  const badHash = validateReceipt(
    {
      success: true,
      examId: final.examId,
      examVersionId: final.examVersionId,
      attemptId: final.attemptId,
      payloadHash: 'wrong-hash',
      submissionId: 'sub-1',
      receivedAt: '2026-11-23T00:00:00Z',
      status: 'recorded',
    },
    out
  );
  assert.equal(badHash.ok, false);
});
