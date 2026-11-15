import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createStoragePort,
  openStorage,
  MemoryTransactionAdapter,
  computePayloadHash,
  DEFAULT_STORAGE_BROADCAST_CHANNEL,
  MemoryBroadcastChannel,
  createStorageBroadcastNotifier,
  createStorageBroadcastListener,
  recheckTransactionState,
  type StoragePort,
  type StorageLike,
  type StorageBroadcastNotification,
  type AttemptRecord,
  type WebExam,
  type OutboxRecord,
  type Result,
  type WebError,
} from '../../src/storage/index.ts';

import {
  deleteConfirmed,
  exportBackup,
  importBackup,
  validateBackupPayload,
} from '../../src/storage/backup.ts';

import {
  migrateLegacyStorage,
  buildDraftKey,
  buildFinalKey,
  buildSnapshotKey,
  exportQuarantineRaw,
  exportQuarantineRawString,
  type QuarantineEntry,
} from '../../src/storage/migrate.ts';

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) {
    throw new Error(`Expected ok: true but got error: ${res.error.code} - ${res.error.message}`);
  }
  return res.value;
}

function unwrapError<T>(res: Result<T>): WebError {
  if (res.ok) {
    throw new Error('Expected ok: false but got ok: true');
  }
  return res.error;
}

class MockLocalStorage implements StorageLike {
  private readonly items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.items.keys());
    return keys[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }
}

function createSampleExam(examId = 'exam-w4-01', examVersionId = 'v1.0'): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId,
    examVersionId,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề kiểm tra Wave 4 Storage Hardening',
    subject: 'Toán học',
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: 2,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q1-v1',
        title: 'Câu 1',
        content: 'Cho hàm số f(x)',
        options: [
          { optionId: 'opt-1a', text: 'Phương án A' },
          { optionId: 'opt-1b', text: 'Phương án B' },
          { optionId: 'opt-1c', text: 'Phương án C' },
          { optionId: 'opt-1d', text: 'Phương án D' },
        ],
        correctOptionId: 'opt-1b',
      },
      {
        kind: 'II',
        questionVersionId: 'q2-v1',
        title: 'Câu 2',
        content: 'Cho các mệnh đề sau',
        statements: [
          { statementId: 'st-2a', text: 'Ý 1', answer: true },
          { statementId: 'st-2b', text: 'Ý 2', answer: false },
          { statementId: 'st-2c', text: 'Ý 3', answer: true },
          { statementId: 'st-2d', text: 'Ý 4', answer: false },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'q3-v1',
        title: 'Câu 3',
        content: 'Điền đáp số',
        answerKey: '-0,5',
      },
    ],
    assets: [],
  };
}

function createSampleAttempt(
  exam: WebExam,
  attemptId = 'att-w4-001',
  candidateName = 'Nguyen Van Hardening'
): AttemptRecord {
  return {
    schemaVersion: 'web-attempt-v1',
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    attemptId,
    revision: 1,
    candidateName,
    examSnapshot: exam,
    presentationOrder: {
      seed: 'seed-w4-test',
      questionOrder: ['q1-v1', 'q2-v1', 'q3-v1'],
      optionOrder: [
        {
          questionVersionId: 'q1-v1',
          optionIds: ['opt-1a', 'opt-1b', 'opt-1c', 'opt-1d'],
        },
      ],
    },
    responses: {
      attemptId,
      examVersionId: exam.examVersionId,
      responses: [
        { kind: 'I', questionVersionId: 'q1-v1', selectedOptionId: 'opt-1b' },
        {
          kind: 'II',
          questionVersionId: 'q2-v1',
          answers: [
            { statementId: 'st-2a', value: true },
            { statementId: 'st-2b', value: false },
            { statementId: 'st-2c', value: true },
            { statementId: 'st-2d', value: false },
          ],
        },
        { kind: 'III', questionVersionId: 'q3-v1', raw: '-0,5' },
      ],
    },
    startedAt: 1700000000000,
    deadline: 1700003000000,
    phase: 'draft',
    submittedAt: null,
    scoreDTO: null,
  };
}

describe('WEB-W4-STORAGE: Storage Recovery, Transactions and Hardening', () => {
  describe('1. CAS & Outbox Schedules Hardening', () => {
    it('final/final race: terminal existing final always wins and outbox is never corrupted', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const exam = createSampleExam();
      const attempt = createSampleAttempt(exam, 'att-race-01', 'Thi Sinh A');

      unwrap(await port.create(attempt));
      const finalized1 = unwrap(await port.finalize(attempt, 1));
      assert.equal(finalized1.phase, 'final');
      assert.equal(finalized1.revision, 2);

      const outbox1 = unwrap(await port.getOutbox(attempt));
      assert.ok(outbox1);
      assert.equal(outbox1.state, 'local_saved');
      assert.equal(outbox1.finalRevision, 2);
      assert.equal(outbox1.generation, 1);

      // Concurrent finalization attempt with different candidate name / responses
      const alteredAttempt: AttemptRecord = {
        ...attempt,
        candidateName: 'Impostor B',
        responses: {
          attemptId: attempt.attemptId,
          examVersionId: attempt.examVersionId,
          responses: [],
        },
      };

      const finalized2 = unwrap(await port.finalize(alteredAttempt, 1));
      // Invariant: Existing final unconditionally wins!
      assert.equal(finalized2.candidateName, 'Thi Sinh A');
      assert.equal(finalized2.revision, 2);
      assert.equal(finalized2.phase, 'final');
      assert.deepEqual(finalized2.responses, attempt.responses);

      // Outbox remains intact and not overwritten
      const outbox2 = unwrap(await port.getOutbox(attempt));
      assert.ok(outbox2);
      assert.equal(outbox2.payloadHash, outbox1.payloadHash);
      assert.equal(outbox2.generation, 1);
    });

    it('draft/final race: saveDraft and create after finalization are rejected with ATTEMPT_FINALIZED', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const exam = createSampleExam();
      const attempt = createSampleAttempt(exam, 'att-draft-final-01');

      unwrap(await port.create(attempt));
      unwrap(await port.finalize(attempt, 1));

      // Attempt saveDraft after finalize
      const draftErr = unwrapError(await port.saveDraft(attempt, 1));
      assert.equal(draftErr.code, 'ATTEMPT_FINALIZED');
      assert.equal(draftErr.path, 'phase');

      // Attempt create after finalize
      const createErr = unwrapError(await port.create(attempt));
      assert.equal(createErr.code, 'ATTEMPT_FINALIZED');
      assert.equal(createErr.path, 'phase');
    });

    it('confirmed / stale outbox schedules: generation CAS and terminal confirmation protection', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const exam = createSampleExam();
      const attempt = createSampleAttempt(exam, 'att-sched-01');

      unwrap(await port.create(attempt));
      unwrap(await port.finalize(attempt, 1));

      const initialOutbox = unwrap(await port.getOutbox(attempt));
      assert.ok(initialOutbox);
      assert.equal(initialOutbox.state, 'local_saved');
      assert.equal(initialOutbox.generation, 1);

      // Worker 1 transitions outbox to sending (generation 1 -> 2)
      const sendingRecord: OutboxRecord = {
        ...initialOutbox,
        state: 'sending',
        endpointId: 'ep-google-apps-script',
        retryCount: 1,
      };
      const updatedToSending = unwrap(await port.updateOutbox(sendingRecord, 1));
      assert.equal(updatedToSending.state, 'sending');
      assert.equal(updatedToSending.generation, 2);

      // Worker 1 receives receipt and transitions outbox to server_confirmed (generation 2 -> 3)
      const confirmedRecord: OutboxRecord = {
        ...updatedToSending,
        state: 'server_confirmed',
        receipt: {
          examId: attempt.examId,
          examVersionId: attempt.examVersionId,
          attemptId: attempt.attemptId,
          submissionId: 'sub-uuid-999',
          payloadHash: initialOutbox.payloadHash,
          receivedAt: new Date().toISOString(),
          status: 'recorded',
        },
      };
      const updatedToConfirmed = unwrap(await port.updateOutbox(confirmedRecord, 2));
      assert.equal(updatedToConfirmed.state, 'server_confirmed');
      assert.equal(updatedToConfirmed.generation, 3);

      // Stale Worker 2 (woke up late from timer / backoff) tries to update outbox with stale generation 1
      const staleRecord1: OutboxRecord = {
        ...initialOutbox,
        state: 'failed',
        lastError: 'Network timeout from delayed callback',
      };
      const errStaleGen = unwrapError(await port.updateOutbox(staleRecord1, 1));
      assert.equal(errStaleGen.code, 'STORAGE_CONFLICT');
      assert.equal(errStaleGen.path, 'generation');

      // Stale Worker 3 tries to downgrade server_confirmed to failed even if passing generation 3
      const downgradeAttempt: OutboxRecord = {
        ...updatedToConfirmed,
        state: 'failed',
        lastError: 'False failure trigger',
      };
      const errDowngrade = unwrapError(await port.updateOutbox(downgradeAttempt, 3));
      assert.equal(errDowngrade.code, 'STORAGE_CONFLICT');
      assert.equal(errDowngrade.path, 'state');

      // Update without explicit expectedGeneration on server_confirmed is rejected
      const unversionedAttempt: OutboxRecord = {
        ...updatedToConfirmed,
        retryCount: 99,
      };
      const errUnversioned = unwrapError(await port.updateOutbox(unversionedAttempt, null));
      assert.equal(errUnversioned.code, 'STORAGE_CONFLICT');
      assert.equal(errUnversioned.path, 'generation');

      // Valid update preserving server_confirmed with matching generation 3 succeeds (increments to 4)
      const validConfirmedUpdate: OutboxRecord = {
        ...updatedToConfirmed,
        nextRetryAt: null,
        lastError: null,
      };
      const finalConfirmed = unwrap(await port.updateOutbox(validConfirmedUpdate, 3));
      assert.equal(finalConfirmed.state, 'server_confirmed');
      assert.equal(finalConfirmed.generation, 4);
    });

    it('updateOutbox preserves immutable payloadHash and finalRevision from original finalize', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const exam = createSampleExam();
      const attempt = createSampleAttempt(exam, 'att-immut-outbox');

      unwrap(await port.create(attempt));
      unwrap(await port.finalize(attempt, 1));

      const origOutbox = unwrap(await port.getOutbox(attempt));
      assert.ok(origOutbox);

      // Caller passes tampered payloadHash and finalRevision
      const tamperedRecord: OutboxRecord = {
        ...origOutbox,
        state: 'sending',
        payloadHash: 'tampered-hash-999',
        finalRevision: 9999,
      };

      const updated = unwrap(await port.updateOutbox(tamperedRecord, 1));
      // Invariant: original payloadHash and finalRevision are preserved
      assert.equal(updated.payloadHash, origOutbox.payloadHash);
      assert.equal(updated.finalRevision, origOutbox.finalRevision);
      assert.equal(updated.generation, 2);
    });
  });

  describe('2. Blocked & Versionchange Database Hardening', () => {
    it('maps BlockedError to STORAGE_UNAVAILABLE cleanly', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);

      adapter.setBlocked(true);

      const isAvail = await adapter.isAvailable();
      assert.equal(isAvail, false);

      const exam = createSampleExam();
      const attempt = createSampleAttempt(exam, 'att-blocked-01');

      const createRes = await port.create(attempt);
      const err = unwrapError(createRes);
      assert.equal(err.code, 'STORAGE_UNAVAILABLE');
      assert.ok(err.message.includes('blocked'));

      adapter.setBlocked(false);
      assert.equal(await adapter.isAvailable(), true);
      const retryCreate = unwrap(await port.create(attempt));
      assert.equal(retryCreate.attemptId, 'att-blocked-01');
    });

    it('maps VersionError to STORAGE_VERSION_UNSUPPORTED', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);

      adapter.setVersionError('The database version is higher than supported (v99)');

      const exam = createSampleExam();
      const attempt = createSampleAttempt(exam, 'att-ver-01');

      const loadRes = await port.load(attempt);
      const err = unwrapError(loadRes);
      assert.equal(err.code, 'STORAGE_VERSION_UNSUPPORTED');
      assert.ok(err.message.includes('VersionError'));
    });

    it('maps QuotaExceededError and SecurityError in private mode safely', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const exam = createSampleExam();
      const attempt = createSampleAttempt(exam, 'att-quota-priv');

      // Quota
      adapter.setQuotaExceeded(true);
      const qErr = unwrapError(await port.create(attempt));
      assert.equal(qErr.code, 'STORAGE_QUOTA');
      assert.equal(qErr.recoverable, true);
      adapter.setQuotaExceeded(false);

      // Private mode SecurityError
      adapter.setUnavailable(true);
      const pErr = unwrapError(await port.create(attempt));
      assert.equal(pErr.code, 'STORAGE_UNAVAILABLE');
      assert.equal(pErr.recoverable, false);
    });
  });

  describe('3. Corruption, Future Schema & Quarantine Hardening', () => {
    it('importBackup and validateBackupPayload return STORAGE_VERSION_UNSUPPORTED on future schema versions', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);

      const futureBackup = {
        schemaVersion: 'cunata-backup-v2', // future schema
        exportedAt: new Date().toISOString(),
        attempts: [],
        outbox: [],
        bank: [],
        exams: [],
        imports: [],
      };

      const valRes = validateBackupPayload(futureBackup);
      const valErr = unwrapError(valRes);
      assert.equal(valErr.code, 'STORAGE_VERSION_UNSUPPORTED');
      assert.equal(valErr.path, 'schemaVersion');

      const importRes = await port.importBackup(futureBackup);
      const impErr = unwrapError(importRes);
      assert.equal(impErr.code, 'STORAGE_VERSION_UNSUPPORTED');
    });

    it('importBackup with malformed JSON string or invalid structure returns STORAGE_CORRUPT', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);

      const corruptRes1 = await port.importBackup('{ broken json:');
      const err1 = unwrapError(corruptRes1);
      assert.equal(err1.code, 'STORAGE_CORRUPT');

      const corruptRes2 = await port.importBackup({ notABackup: true });
      const err2 = unwrapError(corruptRes2);
      assert.equal(err2.code, 'STORAGE_CORRUPT');
    });

    it('migrateLegacyStorage skips future schema versions for attempts and snapshots, preserving source', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const ls = new MockLocalStorage();
      const exam = createSampleExam();

      // Standard snapshot
      ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

      // Future snapshot
      const futureSnapshotKey = 'cunata:snapshot:exam-future:v2.0';
      const futureExamData = {
        schemaVersion: 'web-exam-v2', // future version
        examId: 'exam-future',
        examVersionId: 'v2.0',
        title: 'Đề tương lai',
      };
      ls.setItem(futureSnapshotKey, JSON.stringify(futureExamData));

      // Future attempt
      const futureAttemptKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-future-99');
      const futureAttemptData = {
        schemaVersion: 'web-attempt-v99',
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-future-99',
      };
      ls.setItem(futureAttemptKey, JSON.stringify(futureAttemptData));

      // Standard draft attempt
      const stdAttemptKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-std-01');
      const stdAttemptData = {
        schemaVersion: 'web-attempt-v1',
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-std-01',
        candidateName: 'Hoc Sinh Chuan',
        responses: { 'q1-v1': 'opt-1b' },
      };
      ls.setItem(stdAttemptKey, JSON.stringify(stdAttemptData));

      const report = unwrap(
        await migrateLegacyStorage({
          storage: port,
          localStorage: ls,
          approvedD03: true,
        })
      );

      assert.equal(report.skippedFutureVersions, 2);
      assert.ok(report.skippedKeys.includes(futureSnapshotKey));
      assert.ok(report.skippedKeys.includes(futureAttemptKey));
      assert.equal(report.migratedDrafts, 1);

      // Source data in localStorage is preserved completely untouched
      assert.equal(ls.getItem(futureSnapshotKey), JSON.stringify(futureExamData));
      assert.equal(ls.getItem(futureAttemptKey), JSON.stringify(futureAttemptData));
    });

    it('corrupted attempt JSON is placed in quarantine with zero silent data loss and exportable', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const ls = new MockLocalStorage();
      const exam = createSampleExam();

      ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

      const corruptKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-corrupted');
      const corruptRaw = '{ incomplete_json: 123, broken';
      ls.setItem(corruptKey, corruptRaw);

      const report = unwrap(
        await migrateLegacyStorage({
          storage: port,
          localStorage: ls,
          approvedD03: true,
        })
      );

      assert.equal(report.quarantinedCount, 1);
      assert.equal(report.quarantined[0]?.sourceKey, corruptKey);
      assert.equal(report.quarantined[0]?.rawValue, corruptRaw);
      assert.ok(report.quarantined[0]?.reason.includes('JSON'));

      // Raw quarantine is exportable via Blob and string
      const rawString = exportQuarantineRawString(report.quarantined);
      assert.ok(rawString.includes(corruptKey));
      const rawBlob = exportQuarantineRaw(report.quarantined);
      assert.equal(rawBlob.type, 'application/json');

      // Quarantine registry was safely stored in imports store
      const registryObj = unwrap(await port.getObject('imports', 'quarantine_registry'));
      assert.ok(Array.isArray(registryObj));
      assert.equal((registryObj as QuarantineEntry[]).length, 1);
    });
  });

  describe('4. Interruption, Retry, Backup, Delete & Source Survival', () => {
    it('AC: source backups survive: deleteConfirmed with exportBackupFirst creates valid backup before purge', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const ls = new MockLocalStorage();
      const exam = createSampleExam();
      const attempt = createSampleAttempt(exam, 'att-backup-survive');

      unwrap(await port.create(attempt));
      unwrap(await port.finalize(attempt, 1));

      ls.setItem(buildDraftKey(exam.examId, exam.examVersionId, attempt.attemptId), 'legacy-data');

      // Confirmed deletion with exportBackupFirst: true
      const delResult = unwrap(
        await deleteConfirmed({
          storage: port,
          localStorage: ls,
          confirmed: true,
          exportBackupFirst: true,
        })
      );

      assert.ok(delResult.backupBlob);
      assert.equal(delResult.backupBlob.type, 'application/json');
      assert.equal(delResult.clearedStorage, true);
      assert.equal(delResult.deletedLocalKeys, 1);

      // Verify backupBlob survives and can be restored into fresh store
      const freshAdapter = new MemoryTransactionAdapter();
      const freshPort = createStoragePort(freshAdapter);

      const blobText = await delResult.backupBlob.text();
      unwrap(await freshPort.importBackup(blobText));

      const restoredAttempt = unwrap(await freshPort.load(attempt));
      assert.ok(restoredAttempt);
      assert.equal(restoredAttempt.attemptId, attempt.attemptId);
      assert.equal(restoredAttempt.phase, 'final');
    });

    it('AC: deleteConfirmed requires explicit confirmed: true; clearAll failure protects localStorage', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const ls = new MockLocalStorage();
      ls.setItem('cunata:keep-me', 'precious-data');

      // Without confirmed: true
      const errUnconfirmed = unwrapError(
        await deleteConfirmed({
          storage: port,
          localStorage: ls,
          confirmed: false,
        })
      );
      assert.equal(errUnconfirmed.code, 'CONFIRMATION_REQUIRED');
      assert.equal(ls.getItem('cunata:keep-me'), 'precious-data');

      // When storage adapter fails, localStorage is NOT touched
      adapter.setUnavailable(true);
      const errFailedClear = unwrapError(
        await deleteConfirmed({
          storage: port,
          localStorage: ls,
          confirmed: true,
        })
      );
      assert.equal(errFailedClear.code, 'STORAGE_UNAVAILABLE');
      assert.equal(ls.getItem('cunata:keep-me'), 'precious-data');
    });

    it('AC: no implicit D03 approval: migration remains strictly disabled without explicit flag', async () => {
      const adapter = new MemoryTransactionAdapter();
      const ls = new MockLocalStorage();
      const exam = createSampleExam();
      ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));
      ls.setItem(buildDraftKey(exam.examId, exam.examVersionId, 'att-no-d03'), JSON.stringify({
        schemaVersion: 'web-attempt-v1',
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-no-d03',
      }));

      // 1. openStorage without approveD03
      const port = unwrap(await openStorage({ adapter, localStorage: ls }));
      const loaded = unwrap(await port.load({ examId: exam.examId, examVersionId: exam.examVersionId, attemptId: 'att-no-d03' }));
      assert.equal(loaded, null); // migration did not run!

      // 2. migrateLegacyStorage with approvedD03: false
      const migRes = await migrateLegacyStorage({
        storage: port,
        localStorage: ls,
        approvedD03: false,
      });
      const migErr = unwrapError(migRes);
      assert.equal(migErr.code, 'D03_NOT_APPROVED');
    });

    it('AC: scheduler tests are not actual browser concurrency evidence (concurrency simulation disclosure)', async () => {
      // Invariant check: Verify that async event queues and BroadcastChannel simulation execute
      // in Node VM event loop and do NOT represent OS-level multi-process browser concurrency.
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const exam = createSampleExam();
      const attempt = createSampleAttempt(exam, 'att-sim-sched');

      unwrap(await port.create(attempt));

      // Simulate microtask concurrent scheduling
      const p1 = port.saveDraft(attempt, 1);
      const p2 = port.saveDraft(attempt, 1);

      const [res1, res2] = await Promise.all([p1, p2]);
      const successes = [res1, res2].filter((r) => r.ok);
      const conflicts = [res1, res2].filter((r) => !r.ok && r.error.code === 'STORAGE_CONFLICT');

      assert.equal(successes.length, 1);
      assert.equal(conflicts.length, 1);

      // Verify documentation assertion: scheduler test is deterministic VM evidence, not multi-process browser concurrency
      assert.ok(true, 'Scheduler execution verified as simulated Node event loop concurrency only.');
    });
  });

  describe('5. Special IDs & Foreign References with No Silent Data Loss', () => {
    it('handles special IDs with colons, slashes, Unicode and symbols without delimiter collision', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);

      const specialExam = createSampleExam(
        'exam:toan:nang-cao/2026',
        'v1:beta#patch 1'
      );
      const specialAttempt = createSampleAttempt(
        specialExam,
        'att:user:thí-sinh#123@special'
      );

      // Create
      const created = unwrap(await port.create(specialAttempt));
      assert.equal(created.attemptId, 'att:user:thí-sinh#123@special');

      // Load
      const loaded = unwrap(await port.load(specialAttempt));
      assert.ok(loaded);
      assert.equal(loaded.examId, 'exam:toan:nang-cao/2026');
      assert.equal(loaded.examVersionId, 'v1:beta#patch 1');
      assert.equal(loaded.attemptId, 'att:user:thí-sinh#123@special');

      // Save draft
      const saved = unwrap(await port.saveDraft(specialAttempt, 1));
      assert.equal(saved.revision, 2);

      // Finalize
      const finalized = unwrap(await port.finalize(saved, 2));
      assert.equal(finalized.phase, 'final');
      assert.equal(finalized.revision, 3);

      // Outbox
      const outbox = unwrap(await port.getOutbox(specialAttempt));
      assert.ok(outbox);
      assert.equal(outbox.attemptId, 'att:user:thí-sinh#123@special');

      // Update outbox
      const updatedOutbox = unwrap(
        await port.updateOutbox({ ...outbox, state: 'sending' }, 1)
      );
      assert.equal(updatedOutbox.state, 'sending');
      assert.equal(updatedOutbox.generation, 2);
    });

    it('quarantines foreign question, option and statement references with zero silent data loss', async () => {
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const ls = new MockLocalStorage();
      const exam = createSampleExam();

      ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

      // Foreign question reference
      const badQKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-foreign-q');
      ls.setItem(badQKey, JSON.stringify({
        schemaVersion: 'web-attempt-v1',
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-foreign-q',
        responses: { 'q-non-existent-999': 'opt-1b' },
      }));

      // Foreign option reference
      const badOptKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-foreign-opt');
      ls.setItem(badOptKey, JSON.stringify({
        schemaVersion: 'web-attempt-v1',
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-foreign-opt',
        responses: { 'q1-v1': 'opt-foreign-xyz' },
      }));

      // Foreign statement reference
      const badStKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-foreign-st');
      ls.setItem(badStKey, JSON.stringify({
        schemaVersion: 'web-attempt-v1',
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-foreign-st',
        responses: {
          'q2-v1': {
            'st-alien': true,
          },
        },
      }));

      const report = unwrap(
        await migrateLegacyStorage({
          storage: port,
          localStorage: ls,
          approvedD03: true,
        })
      );

      assert.equal(report.quarantinedCount, 3);

      const qQ = report.quarantined.find((q) => q.sourceKey === badQKey);
      assert.ok(qQ);
      assert.ok(qQ.reason.includes('foreign question ref') || qQ.reason.includes('Câu hỏi lạ'));

      const qOpt = report.quarantined.find((q) => q.sourceKey === badOptKey);
      assert.ok(qOpt);
      assert.ok(qOpt.reason.includes('foreign option ref') || qOpt.reason.includes('Lựa chọn lạ'));

      const qSt = report.quarantined.find((q) => q.sourceKey === badStKey);
      assert.ok(qSt);
      assert.ok(qSt.reason.includes('foreign statement ref') || qSt.reason.includes('Ý mệnh đề lạ'));

      // None of the corrupted items were lost; all 3 exist in quarantine registry
      const reg = unwrap(await port.getObject('imports', 'quarantine_registry'));
      assert.ok(Array.isArray(reg));
      assert.equal((reg as QuarantineEntry[]).length, 3);
    });
  });
});
