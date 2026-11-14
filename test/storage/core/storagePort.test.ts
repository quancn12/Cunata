import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStoragePort,
  openStorage,
  MemoryTransactionAdapter,
  computePayloadHash,
  type StoragePort,
} from '../../../src/storage/index.ts';
import type {
  AttemptRecord,
  WebExam,
  OutboxRecord,
  Receipt,
  StorageBackupPayload,
} from '../../../src/storage/types.ts';

function createMockExam(): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-toan-01',
    examVersionId: 'v1',
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề minh họa Toán 2025',
    subject: 'Toán',
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: 3,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q1-v1',
        title: 'Câu 1',
        content: 'Nghiệm của phương trình',
        options: [
          { optionId: 'opt-a', text: 'x = 1' },
          { optionId: 'opt-b', text: 'x = 2' },
          { optionId: 'opt-c', text: 'x = 3' },
          { optionId: 'opt-d', text: 'x = 4' },
        ],
        correctOptionId: 'opt-b',
      },
      {
        kind: 'II',
        questionVersionId: 'q2-v1',
        title: 'Câu 2',
        content: 'Cho các mệnh đề sau',
        statements: [
          { statementId: 'st-1', text: 'Ý a đúng', answer: true },
          { statementId: 'st-2', text: 'Ý b sai', answer: false },
          { statementId: 'st-3', text: 'Ý c đúng', answer: true },
          { statementId: 'st-4', text: 'Ý d sai', answer: false },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'q3-v1',
        title: 'Câu 3',
        content: 'Tính giá trị',
        answerKey: '-0,5',
      },
    ],
    assets: [],
  };
}

function createMockAttempt(attemptId = 'att-001', candidateName = 'Nguyen Van A'): AttemptRecord {
  const exam = createMockExam();
  return {
    schemaVersion: 'web-attempt-v1',
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    attemptId,
    revision: 1,
    candidateName,
    examSnapshot: exam,
    presentationOrder: {
      seed: 'seed-12345',
      questionOrder: ['q1-v1', 'q2-v1', 'q3-v1'],
      optionOrder: [
        {
          questionVersionId: 'q1-v1',
          optionIds: ['opt-a', 'opt-b', 'opt-c', 'opt-d'],
        },
      ],
    },
    responses: {
      attemptId,
      examVersionId: exam.examVersionId,
      responses: [
        { kind: 'I', questionVersionId: 'q1-v1', selectedOptionId: 'opt-b' },
        {
          kind: 'II',
          questionVersionId: 'q2-v1',
          answers: [
            { statementId: 'st-1', value: true },
            { statementId: 'st-2', value: false },
            { statementId: 'st-3', value: null },
            { statementId: 'st-4', value: false },
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

function setup(): { adapter: MemoryTransactionAdapter; storage: StoragePort } {
  const adapter = new MemoryTransactionAdapter();
  const storage = createStoragePort(adapter);
  return { adapter, storage };
}

describe('StoragePort & Transactional Stores', () => {
  describe('1. Basic lifecycle: create and load', () => {
    it('creates a draft attempt and loads it accurately', async () => {
      const { storage } = setup();
      const record = createMockAttempt('att-01');
      const createRes = await storage.create(record);

      assert.equal(createRes.ok, true);
      if (createRes.ok) {
        assert.equal(createRes.value.attemptId, 'att-01');
        assert.equal(createRes.value.revision, 1);
        assert.equal(createRes.value.phase, 'draft');
      }

      const loadRes = await storage.load({
        examId: record.examId,
        examVersionId: record.examVersionId,
        attemptId: 'att-01',
      });

      assert.equal(loadRes.ok, true);
      if (loadRes.ok) {
        assert.notEqual(loadRes.value, null);
        assert.equal(loadRes.value?.candidateName, 'Nguyen Van A');
        assert.equal(loadRes.value?.responses.responses.length, 3);
      }
    });

    it('rejects duplicate create for existing draft attempt', async () => {
      const { storage } = setup();
      const record = createMockAttempt('att-dup');
      const first = await storage.create(record);
      assert.equal(first.ok, true);

      const second = await storage.create(record);
      assert.equal(second.ok, false);
      if (!second.ok) {
        assert.equal(second.error.code, 'STORAGE_CONFLICT');
      }
    });

    it('returns null for nonexistent attempt key', async () => {
      const { storage } = setup();
      const res = await storage.load({
        examId: 'none',
        examVersionId: 'none',
        attemptId: 'none',
      });
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value, null);
      }
    });

    it('returns deep-cloned records so caller mutations do not leak into storage', async () => {
      const { storage } = setup();
      const record = createMockAttempt('att-immutable');
      await storage.create(record);

      const load1 = await storage.load(record);
      assert.equal(load1.ok, true);
      if (load1.ok && load1.value) {
        (load1.value as { candidateName: string }).candidateName = 'MUTATED';
      }

      const load2 = await storage.load(record);
      assert.equal(load2.ok, true);
      if (load2.ok) {
        assert.equal(load2.value?.candidateName, 'Nguyen Van A');
      }
    });
  });

  describe('2. Revision CAS in saveDraft', () => {
    it('increments revision when expectedRevision matches', async () => {
      const { storage } = setup();
      const record = createMockAttempt('att-draft-cas');
      await storage.create(record); // revision 1

      const updatedRecord: AttemptRecord = {
        ...record,
        candidateName: 'Nguyen Van A (updated)',
      };

      const saveRes = await storage.saveDraft(updatedRecord, 1);
      assert.equal(saveRes.ok, true);
      if (saveRes.ok) {
        assert.equal(saveRes.value.revision, 2);
        assert.equal(saveRes.value.candidateName, 'Nguyen Van A (updated)');
      }

      const loadRes = await storage.load(record);
      assert.equal(loadRes.ok, true);
      if (loadRes.ok) {
        assert.equal(loadRes.value?.revision, 2);
      }
    });

    it('rejects saveDraft with stale expectedRevision', async () => {
      const { storage } = setup();
      const record = createMockAttempt('att-stale');
      await storage.create(record); // rev 1

      await storage.saveDraft(record, 1);

      const staleSave = await storage.saveDraft(
        { ...record, candidateName: 'Stale update' },
        1
      );

      assert.equal(staleSave.ok, false);
      if (!staleSave.ok) {
        assert.equal(staleSave.error.code, 'STORAGE_CONFLICT');
      }

      const loadRes = await storage.load(record);
      assert.equal(loadRes.ok, true);
      if (loadRes.ok) {
        assert.equal(loadRes.value?.revision, 2);
      }
    });

    it('rejects saveDraft if attempt does not exist', async () => {
      const { storage } = setup();
      const record = createMockAttempt('att-nonexistent');
      const res = await storage.saveDraft(record, 1);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'STORAGE_CONFLICT');
      }
    });

    it('lists attempts for given examId and examVersionId sorted by startedAt', async () => {
      const { storage } = setup();
      const att1 = { ...createMockAttempt('att-1'), startedAt: 1000 };
      const att2 = { ...createMockAttempt('att-2'), startedAt: 3000 };
      const att3 = { ...createMockAttempt('att-3'), startedAt: 2000 };
      const otherExam = { ...createMockAttempt('att-other'), examId: 'other-exam' };

      await storage.create(att1);
      await storage.create(att2);
      await storage.create(att3);
      await storage.create(otherExam);

      const listRes = await storage.listAttempts('exam-toan-01', 'v1');
      assert.equal(listRes.ok, true);
      if (listRes.ok) {
        assert.equal(listRes.value.length, 3);
        assert.equal(listRes.value[0]?.attemptId, 'att-1');
        assert.equal(listRes.value[1]?.attemptId, 'att-3');
        assert.equal(listRes.value[2]?.attemptId, 'att-2');
      }
    });
  });

  describe('3. Atomic finalization and outbox local_saved', () => {
    it('atomically finalizes attempt and creates outbox record with local_saved', async () => {
      const { storage } = setup();
      const record = createMockAttempt('att-fin-1');
      await storage.create(record); // rev 1

      const toFinalize: AttemptRecord = {
        ...record,
        candidateName: 'Nguyen Van A Final',
        scoreDTO: { total: '9.25', sectionI: '1.75' },
      };

      const finRes = await storage.finalize(toFinalize, 1);
      assert.equal(finRes.ok, true);
      if (finRes.ok) {
        assert.equal(finRes.value.phase, 'final');
        assert.equal(finRes.value.revision, 2);
        assert.notEqual(finRes.value.submittedAt, null);
      }

      const outboxRes = await storage.getOutbox(record);
      assert.equal(outboxRes.ok, true);
      if (outboxRes.ok && outboxRes.value) {
        assert.equal(outboxRes.value.state, 'local_saved');
        assert.equal(outboxRes.value.finalRevision, 2);
        assert.equal(outboxRes.value.generation, 1);
        assert.equal(outboxRes.value.receipt, null);
        assert.equal(typeof outboxRes.value.payloadHash, 'string');
        assert.equal(outboxRes.value.payloadHash.length > 0, true);
      }
    });

    it('rejects finalize with stale expectedRevision and creates no outbox record', async () => {
      const { storage } = setup();
      const record = createMockAttempt('att-fin-stale');
      await storage.create(record); // rev 1
      await storage.saveDraft(record, 1); // rev 2

      const finStale = await storage.finalize(record, 1);
      assert.equal(finStale.ok, false);
      if (!finStale.ok) {
        assert.equal(finStale.error.code, 'STORAGE_CONFLICT');
      }

      const outbox = await storage.getOutbox(record);
      assert.equal(outbox.ok, true);
      if (outbox.ok) {
        assert.equal(outbox.value, null);
      }
    });
  });

  describe('4. Final/final and draft/final races: Terminal existing final & Immutability', () => {
    it('Terminal existing final wins in final/final race; preserves score, responses, metadata', async () => {
      const { storage } = setup();
      const base = createMockAttempt('att-race-ff');
      await storage.create(base); // rev 1

      const tab1Final: AttemptRecord = {
        ...base,
        candidateName: 'Tab 1 Winning Student',
        submittedAt: 1700001000000,
        scoreDTO: { total: '10/10', achieved: '10' },
      };

      const tab2Final: AttemptRecord = {
        ...base,
        candidateName: 'Tab 2 Losing Student',
        submittedAt: 1700002000000,
        scoreDTO: { total: '3/10', achieved: '3' },
      };

      const res1 = await storage.finalize(tab1Final, 1);
      assert.equal(res1.ok, true);

      const res2 = await storage.finalize(tab2Final, 1);
      assert.equal(res2.ok, true);

      if (res2.ok) {
        assert.equal(res2.value.candidateName, 'Tab 1 Winning Student');
        assert.deepEqual(res2.value.scoreDTO, { total: '10/10', achieved: '10' });
        assert.equal(res2.value.submittedAt, 1700001000000);
      }

      const loaded = await storage.load(base);
      assert.equal(loaded.ok, true);
      if (loaded.ok && loaded.value) {
        assert.equal(loaded.value.candidateName, 'Tab 1 Winning Student');
        assert.deepEqual(loaded.value.scoreDTO, { total: '10/10', achieved: '10' });
        assert.equal(loaded.value.submittedAt, 1700001000000);
        assert.equal(loaded.value.phase, 'final');
      }

      const outbox = await storage.getOutbox(base);
      assert.equal(outbox.ok, true);
      if (outbox.ok && outbox.value && res1.ok) {
        assert.equal(outbox.value.payloadHash, computePayloadHash(res1.value));
        assert.equal(outbox.value.finalRevision, 2);
      }
    });

    it('Draft/final race: saveDraft after finalize is rejected with ATTEMPT_FINALIZED', async () => {
      const { storage } = setup();
      const base = createMockAttempt('att-race-df');
      await storage.create(base); // rev 1

      const finalRecord: AttemptRecord = {
        ...base,
        candidateName: 'Finalized Candidate',
        submittedAt: 1700001500000,
        scoreDTO: { total: '8/10' },
      };
      const finRes = await storage.finalize(finalRecord, 1);
      assert.equal(finRes.ok, true);

      const draftRes = await storage.saveDraft(
        { ...base, candidateName: 'Late Draft Overwrite' },
        2
      );

      assert.equal(draftRes.ok, false);
      if (!draftRes.ok) {
        assert.equal(draftRes.error.code, 'ATTEMPT_FINALIZED');
      }

      const loaded = await storage.load(base);
      assert.equal(loaded.ok, true);
      if (loaded.ok && loaded.value) {
        assert.equal(loaded.value.phase, 'final');
        assert.equal(loaded.value.candidateName, 'Finalized Candidate');
        assert.deepEqual(loaded.value.scoreDTO, { total: '8/10' });
      }
    });

    it('create cannot overwrite an existing final attempt', async () => {
      const { storage } = setup();
      const base = createMockAttempt('att-fin-create');
      await storage.create(base);
      await storage.finalize(base, 1);

      const recreateRes = await storage.create(base);
      assert.equal(recreateRes.ok, false);
      if (!recreateRes.ok) {
        assert.equal(recreateRes.error.code, 'ATTEMPT_FINALIZED');
      }
    });
  });

  describe('5. Outbox state machine & Generation CAS', () => {
    it('updates outbox with generation CAS and terminal server_confirmed state', async () => {
      const { storage } = setup();
      const base = createMockAttempt('att-outbox-cas');
      await storage.create(base);
      await storage.finalize(base, 1);

      const outbox1 = await storage.getOutbox(base);
      assert.equal(outbox1.ok, true);
      assert.equal(outbox1.ok && outbox1.value?.state, 'local_saved');
      assert.equal(outbox1.ok && outbox1.value?.generation, 1);

      const initialOutbox = (outbox1 as { ok: true; value: OutboxRecord }).value;

      const queuedUpdate: OutboxRecord = {
        ...initialOutbox,
        state: 'queued',
        endpointId: 'https://collector.example.com/api',
      };
      const update1 = await storage.updateOutbox(queuedUpdate, 1);
      assert.equal(update1.ok, true);
      if (update1.ok) {
        assert.equal(update1.value.state, 'queued');
        assert.equal(update1.value.generation, 2);
      }

      const staleUpdate = await storage.updateOutbox(
        { ...queuedUpdate, state: 'sending' },
        1
      );
      assert.equal(staleUpdate.ok, false);
      if (!staleUpdate.ok) {
        assert.equal(staleUpdate.error.code, 'STORAGE_CONFLICT');
      }

      const sendingUpdate: OutboxRecord = {
        ...queuedUpdate,
        state: 'sending',
      };
      const update2 = await storage.updateOutbox(sendingUpdate, 2);
      assert.equal(update2.ok, true);
      if (update2.ok) {
        assert.equal(update2.value.state, 'sending');
        assert.equal(update2.value.generation, 3);
      }

      const receipt: Receipt = {
        examId: base.examId,
        examVersionId: base.examVersionId,
        attemptId: base.attemptId,
        submissionId: 'sub-999',
        payloadHash: initialOutbox.payloadHash,
        receivedAt: new Date().toISOString(),
        status: 'recorded',
      };
      const confirmedUpdate: OutboxRecord = {
        ...sendingUpdate,
        state: 'server_confirmed',
        receipt,
      };
      const update3 = await storage.updateOutbox(confirmedUpdate, 3);
      assert.ok(update3.ok);
      assert.equal(update3.value.state, 'server_confirmed');
      assert.equal(update3.value.generation, 4);
      assert.notEqual(update3.value.receipt, null);

      const confirmedValue = update3.value;
      const downgradeAttempt: OutboxRecord = {
        ...confirmedValue,
        state: 'sending',
      };
      const downgradeRes = await storage.updateOutbox(downgradeAttempt, 4);
      assert.equal(downgradeRes.ok, false);
      if (!downgradeRes.ok) {
        assert.equal(downgradeRes.error.code, 'STORAGE_CONFLICT');
      }

      const attemptCheck = await storage.load(base);
      assert.equal(attemptCheck.ok, true);
      if (attemptCheck.ok && attemptCheck.value) {
        assert.equal(attemptCheck.value.phase, 'final');
        assert.equal(attemptCheck.value.revision, 2);
      }
    });
  });

  describe('6. Generic object stores (bank, exams, imports)', () => {
    it('manages bank objects with revision CAS', async () => {
      const { storage } = setup();
      const question = { id: 'q-bank-01', text: 'Tìm x' };

      const put1 = await storage.putObject('bank', 'q-bank-01', question, null);
      assert.equal(put1.ok, true);
      if (put1.ok) {
        assert.equal(put1.value, 1);
      }

      const get1 = await storage.getObject('bank', 'q-bank-01');
      assert.equal(get1.ok, true);
      if (get1.ok) {
        assert.deepEqual(get1.value, question);
      }

      const put2 = await storage.putObject('bank', 'q-bank-01', { ...question, text: 'Tìm x và y' }, 1);
      assert.equal(put2.ok, true);
      if (put2.ok) {
        assert.equal(put2.value, 2);
      }

      const stalePut = await storage.putObject('bank', 'q-bank-01', { text: 'Stale' }, 1);
      assert.equal(stalePut.ok, false);
      if (!stalePut.ok) {
        assert.equal(stalePut.error.code, 'STORAGE_CONFLICT');
      }

      const delRes = await storage.deleteObject('bank', 'q-bank-01', 2);
      assert.equal(delRes.ok, true);

      const get2 = await storage.getObject('bank', 'q-bank-01');
      assert.equal(get2.ok, true);
      if (get2.ok) {
        assert.equal(get2.value, null);
      }
    });

    it('handles exams and imports stores with independent keys', async () => {
      const { storage } = setup();
      const examData = { examId: 'ex-01', title: 'Toan 12' };
      const importJob = { jobId: 'job-01', format: 'docx' };

      await storage.putObject('exams', 'ex-01', examData, null);
      await storage.putObject('imports', 'job-01', importJob, null);

      const ex = await storage.getObject('exams', 'ex-01');
      const imp = await storage.getObject('imports', 'job-01');

      assert.deepEqual(ex.ok && ex.value, examData);
      assert.deepEqual(imp.ok && imp.value, importJob);
    });
  });

  describe('7. Aborted transactions & No false local_saved', () => {
    it('aborts transaction cleanly with no partial state and no false local_saved', async () => {
      const { adapter, storage } = setup();
      const base = createMockAttempt('att-abort-test');
      await storage.create(base);

      let failOutbox = true;
      const failingAdapter: typeof adapter = Object.create(adapter);
      failingAdapter.runTransaction = async (stores, mode, op) => {
        return adapter.runTransaction(stores, mode, async (tx) => {
          const proxyTx: typeof tx = {
            ...tx,
            put: async (store, key, val) => {
              if (store === 'outbox' && failOutbox) {
                await tx.abort();
              }
              return tx.put(store, key, val);
            },
          };
          return op(proxyTx);
        });
      };

      const failingStorage = createStoragePort(failingAdapter);
      const finRes = await failingStorage.finalize(base, 1);

      assert.equal(finRes.ok, false);

      const outbox = await storage.getOutbox(base);
      assert.equal(outbox.ok, true);
      if (outbox.ok) {
        assert.equal(outbox.value, null);
      }

      const attempt = await storage.load(base);
      assert.equal(attempt.ok, true);
      if (attempt.ok && attempt.value) {
        assert.equal(attempt.value.phase, 'draft');
        assert.equal(attempt.value.revision, 1);
      }
    });
  });

  describe('8. Quota handling (STORAGE_QUOTA)', () => {
    it('returns STORAGE_QUOTA when storage quota is exceeded', async () => {
      const { adapter, storage } = setup();
      adapter.setQuotaExceeded(true);

      const record = createMockAttempt('att-quota');
      const res = await storage.create(record);

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'STORAGE_QUOTA');
        assert.equal(res.error.recoverable, true);
      }
    });
  });

  describe('9. Unavailable IDB & environment boundaries', () => {
    it('returns STORAGE_UNAVAILABLE when adapter is unavailable', async () => {
      const { adapter, storage } = setup();
      adapter.setUnavailable(true);

      const record = createMockAttempt('att-unavail');
      const res = await storage.create(record);

      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'STORAGE_UNAVAILABLE');
        assert.equal(res.error.recoverable, false);
      }
    });

    it('openStorage in Node environment without IDB runtime returns STORAGE_UNAVAILABLE safely', async () => {
      const res = await openStorage();
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'STORAGE_UNAVAILABLE');
      }
    });

    it('openStorage accepts injected adapter and returns functional StoragePort', async () => {
      const injectedAdapter = new MemoryTransactionAdapter();
      const openRes = await openStorage(injectedAdapter);
      assert.equal(openRes.ok, true);

      if (openRes.ok) {
        const port = openRes.value;
        const record = createMockAttempt('att-injected');
        const createRes = await port.create(record);
        assert.equal(createRes.ok, true);
      }
    });
  });

  describe('10. Backup export, import and confirmed deletion', () => {
    it('exports backup Blob and imports it into a fresh store', async () => {
      const { storage } = setup();
      const att = createMockAttempt('att-bak-1');
      await storage.create(att);
      await storage.finalize(att, 1);
      await storage.putObject('bank', 'q-bak', { content: 'test' }, null);

      const exportRes = await storage.exportBackup();
      assert.equal(exportRes.ok, true);
      if (exportRes.ok) {
        assert.equal(exportRes.value instanceof Blob, true);
        const text = await exportRes.value.text();
        const parsed = JSON.parse(text) as StorageBackupPayload;
        assert.equal(parsed.schemaVersion, 'cunata-backup-v1');
        assert.equal(parsed.attempts.length, 1);
        assert.equal(parsed.outbox.length, 1);
        assert.equal(parsed.bank.length, 1);
      }

      const freshAdapter = new MemoryTransactionAdapter();
      const freshStorage = createStoragePort(freshAdapter);

      const blobText = await (exportRes as { ok: true; value: Blob }).value.text();
      const importRes = await freshStorage.importBackup(blobText);
      assert.equal(importRes.ok, true);

      const restoredAtt = await freshStorage.load(att);
      assert.equal(restoredAtt.ok, true);
      assert.equal(restoredAtt.ok && restoredAtt.value?.attemptId, 'att-bak-1');

      const restoredOutbox = await freshStorage.getOutbox(att);
      assert.equal(restoredOutbox.ok, true);
      assert.equal(restoredOutbox.ok && restoredOutbox.value?.state, 'local_saved');

      const restoredBank = await freshStorage.getObject('bank', 'q-bak');
      assert.deepEqual(restoredBank.ok && restoredBank.value, { content: 'test' });
    });

    it('rejects clearAll without explicit confirmed: true', async () => {
      const { storage } = setup();
      const res = await storage.clearAll(false);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, 'CONFIRMATION_REQUIRED');
      }
    });

    it('clears all stores when confirmed: true', async () => {
      const { storage } = setup();
      const att = createMockAttempt('att-clear');
      await storage.create(att);

      const clearRes = await storage.clearAll(true);
      assert.equal(clearRes.ok, true);

      const loadRes = await storage.load(att);
      assert.equal(loadRes.ok, true);
      if (loadRes.ok) {
        assert.equal(loadRes.value, null);
      }
    });
  });
});
