import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  exportBackup,
  importBackup,
  validateBackupPayload,
  deleteConfirmed,
  exportQuarantineRaw,
  exportQuarantineRawString,
} from '../../../src/storage/backup.ts';
import {
  MemoryTransactionAdapter,
  createStoragePort,
} from '../../../src/storage/index.ts';
import type { AttemptRecord, WebExam } from '../../../src/schema/index.ts';
import type { StorageLike, QuarantineEntry } from '../../../src/storage/migrate.ts';

class MockLocalStorage implements StorageLike {
  private items = new Map<string, string>();

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

function createSampleExam(): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-backup-01',
    examVersionId: 'v1.0.0',
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề thi sao lưu',
    subject: 'Toán học',
    grade: 12,
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
        questionVersionId: 'q1-v1',
        title: 'Câu 1',
        options: [
          { optionId: 'opt-a', text: 'A' },
          { optionId: 'opt-b', text: 'B' },
          { optionId: 'opt-c', text: 'C' },
          { optionId: 'opt-d', text: 'D' },
        ],
        correctOptionId: 'opt-a',
      },
    ],
    assets: [],
  };
}

describe('Migration — Backup roundtrip, validation & confirmed deletion', () => {
  it('validateBackupPayload validates correct payload and catches invalid shapes', () => {
    const valid = {
      schemaVersion: 'cunata-backup-v1',
      exportedAt: new Date().toISOString(),
      attempts: [],
      outbox: [],
      bank: [],
      exams: [],
      imports: [],
    };
    const vRes = validateBackupPayload(valid);
    assert.ok(vRes.ok);

    // Wrong schemaVersion
    assert.equal(validateBackupPayload({ ...valid, schemaVersion: 'v2' }).ok, false);

    // Missing exportedAt
    assert.equal(validateBackupPayload({ ...valid, exportedAt: 12345 }).ok, false);

    // attempts not array
    assert.equal(validateBackupPayload({ ...valid, attempts: 'not-array' }).ok, false);

    // null or primitive
    assert.equal(validateBackupPayload(null).ok, false);
    assert.equal(validateBackupPayload('string').ok, false);
  });

  it('backup roundtrip: export -> clear -> import restores attempts, outbox, bank & exams', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const exam = createSampleExam();

    // 1. Populate storage
    // Save exam in exams store
    await storage.putObject('exams', JSON.stringify([exam.examId, exam.examVersionId]), exam, null);

    // Save a question in bank store
    const bankItem = {
      questionId: 'q1-v1',
      questionVersionId: 'q1-v1',
      revision: 1,
      taxonomy: {
        subject: 'Toán học',
        grade: 12,
        topic: 'Đại số',
        lesson: 'Bài 1',
        difficulty: 'Thông hiểu',
      },
      question: exam.questions[0],
    };
    await storage.putObject('bank', 'q1-v1', bankItem, null);

    // Create a draft attempt
    const draftAttempt: AttemptRecord = {
      schemaVersion: 'web-attempt-v1',
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: 'att-draft-roundtrip',
      revision: 1,
      candidateName: 'Nguyễn Văn Roundtrip',
      examSnapshot: exam,
      presentationOrder: {
        seed: 'seed-rt',
        questionOrder: ['q1-v1'],
        optionOrder: [{ questionVersionId: 'q1-v1', optionIds: ['opt-a', 'opt-b', 'opt-c', 'opt-d'] }],
      },
      responses: {
        attemptId: 'att-draft-roundtrip',
        examVersionId: exam.examVersionId,
        responses: [{ kind: 'I', questionVersionId: 'q1-v1', selectedOptionId: 'opt-a' }],
      },
      startedAt: 1700000000000,
      deadline: 1700003000000,
      phase: 'draft',
      submittedAt: null,
      scoreDTO: null,
    };
    await storage.create(draftAttempt);

    // Finalize an attempt (creates both attempt record and outbox record)
    const finalAttempt: AttemptRecord = {
      ...draftAttempt,
      attemptId: 'att-final-roundtrip',
      candidateName: 'Trần Thị Final Roundtrip',
      phase: 'final',
      submittedAt: 1700002000000,
      scoreDTO: { total: '1/4', maxTotal: '1/4' },
    };
    await storage.finalize(finalAttempt, 0);

    // 2. Export backup
    const exportRes = await exportBackup(storage);
    assert.ok(exportRes.ok);
    const blob = exportRes.value;
    assert.ok(blob.size > 0);

    const backupJsonText = await blob.text();
    const parsedPayload = JSON.parse(backupJsonText);
    assert.equal(parsedPayload.schemaVersion, 'cunata-backup-v1');
    assert.equal(parsedPayload.attempts.length, 2);
    assert.equal(parsedPayload.outbox.length, 1);
    assert.equal(parsedPayload.bank.length, 1);
    assert.equal(parsedPayload.exams.length, 1);

    // 3. Purge storage completely
    const clearRes = await storage.clearAll(true);
    assert.ok(clearRes.ok);

    // Verify storage is completely empty
    const checkEmptyAttempts = await storage.listAttempts(exam.examId, exam.examVersionId);
    assert.ok(checkEmptyAttempts.ok);
    assert.equal(checkEmptyAttempts.value.length, 0);

    const checkEmptyBank = await storage.getObject('bank', 'q1-v1');
    assert.ok(checkEmptyBank.ok);
    assert.equal(checkEmptyBank.value, null);

    // 4. Restore from backup
    const importRes = await importBackup(storage, parsedPayload);
    assert.ok(importRes.ok);

    // 5. Verify restored data
    const restoredAttempts = await storage.listAttempts(exam.examId, exam.examVersionId);
    assert.ok(restoredAttempts.ok);
    assert.equal(restoredAttempts.value.length, 2);

    const restoredDraft = restoredAttempts.value.find((a) => a.attemptId === 'att-draft-roundtrip');
    assert.ok(restoredDraft);
    assert.equal(restoredDraft.candidateName, 'Nguyễn Văn Roundtrip');
    assert.equal(restoredDraft.phase, 'draft');

    const restoredFinal = restoredAttempts.value.find((a) => a.attemptId === 'att-final-roundtrip');
    assert.ok(restoredFinal);
    assert.equal(restoredFinal.candidateName, 'Trần Thị Final Roundtrip');
    assert.equal(restoredFinal.phase, 'final');
    assert.deepEqual(restoredFinal.scoreDTO, { total: '1/4', maxTotal: '1/4' });

    // Verify outbox
    const restoredOutbox = await storage.getOutbox({
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: 'att-final-roundtrip',
    });
    assert.ok(restoredOutbox.ok && restoredOutbox.value);
    assert.equal(restoredOutbox.value.state, 'local_saved');

    // Verify bank
    const restoredBank = await storage.getObject('bank', 'q1-v1');
    assert.ok(restoredBank.ok && restoredBank.value);
    assert.equal((restoredBank.value as any).questionId, 'q1-v1');
  });

  it('deleteConfirmed: requires explicit confirmation and purges both storage & localStorage keys', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();

    // Populate localStorage with Cunata keys and non-Cunata keys
    ls.setItem('cunata:attempt:exam-1:v1:att-1', 'data1');
    ls.setItem('cunata:final:exam-1:v1:att-1', 'data2');
    ls.setItem('cunata_exam_attempt_v1', 'data3');
    ls.setItem('cunata:question_bank', 'data4');
    ls.setItem('other_app_user_theme', 'dark'); // Non-Cunata key, must not be removed

    // Add object in storage
    await storage.putObject('exams', 'ex-1', { id: 'ex-1' }, null);

    // 1. Attempt delete without confirmation
    const unconfirmedRes = await deleteConfirmed({
      storage,
      localStorage: ls,
      confirmed: false,
    });
    assert.equal(unconfirmedRes.ok, false);
    if (!unconfirmedRes.ok) {
      assert.equal(unconfirmedRes.error.code, 'CONFIRMATION_REQUIRED');
    }

    // Verify nothing was deleted
    assert.equal(ls.length, 5);
    const checkExam = await storage.getObject('exams', 'ex-1');
    assert.ok(checkExam.ok && checkExam.value);

    // 2. Confirmed deletion with exportBackupFirst = true
    const confirmedRes = await deleteConfirmed({
      storage,
      localStorage: ls,
      confirmed: true,
      exportBackupFirst: true,
    });

    assert.ok(confirmedRes.ok);
    assert.ok(confirmedRes.value.backupBlob);
    assert.equal(confirmedRes.value.deletedLocalKeys, 4);
    assert.equal(confirmedRes.value.clearedStorage, true);

    // Verify Cunata keys removed from localStorage
    assert.equal(ls.getItem('cunata:attempt:exam-1:v1:att-1'), null);
    assert.equal(ls.getItem('cunata:final:exam-1:v1:att-1'), null);
    assert.equal(ls.getItem('cunata_exam_attempt_v1'), null);
    assert.equal(ls.getItem('cunata:question_bank'), null);

    // Non-Cunata key preserved!
    assert.equal(ls.getItem('other_app_user_theme'), 'dark');

    // Storage is cleared
    const checkCleared = await storage.getObject('exams', 'ex-1');
    assert.equal(checkCleared.ok && checkCleared.value, null);
  });

  it('exportQuarantineRaw outputs raw invalid data for user recovery', () => {
    const entries: QuarantineEntry[] = [
      {
        id: 'q-1',
        sourceKey: 'cunata:attempt:bad-1',
        rawValue: '{"corrupted": true}',
        reason: 'Missing exam snapshot',
        timestamp: 1700000000000,
      },
    ];

    const rawStr = exportQuarantineRawString(entries);
    assert.ok(rawStr.includes('cunata-quarantine-v1'));
    assert.ok(rawStr.includes('Missing exam snapshot'));
    const parsed = JSON.parse(rawStr);
    assert.equal(parsed.entries[0].rawValue, '{"corrupted": true}');

    const blob = exportQuarantineRaw(entries);
    assert.equal(blob.type, 'application/json');
    assert.ok(blob.size > 0);
  });
});
