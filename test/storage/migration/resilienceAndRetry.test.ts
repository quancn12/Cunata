import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateLegacyStorage,
  buildDraftKey,
  buildFinalKey,
  buildSnapshotKey,
  type StorageLike,
} from '../../../src/storage/migrate.ts';
import {
  MemoryTransactionAdapter,
  createStoragePort,
} from '../../../src/storage/index.ts';
import type { WebExam } from '../../../src/schema/index.ts';

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

function createSampleExam(examId = 'exam-resilience-01', examVersionId = 'v1.0.0'): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId,
    examVersionId,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề kiểm tra phục hồi',
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

describe('Migration — Resilience, Idempotence, Interruption & Quota', () => {
  it('idempotence: multiple runs produce identical state without duplicate records', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();
    const exam = createSampleExam();

    ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

    const draftKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-idem-01');
    ls.setItem(
      draftKey,
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-idem-01',
        candidateName: 'Nguyễn Idempotent',
        startedAt: 1700000000000,
        deadline: 1700003000000,
        responses: { 'q1-v1': 'opt-a' },
        submitted: false,
      })
    );

    const finalKey = buildFinalKey(exam.examId, exam.examVersionId, 'att-idem-final-01');
    ls.setItem(
      finalKey,
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-idem-final-01',
        candidateName: 'Trần Terminal',
        startedAt: 1700000000000,
        deadline: 1700003000000,
        submittedAt: 1700002000000,
        responses: { 'q1-v1': 'opt-a' },
        submitted: true,
      })
    );

    // Run 1
    const res1 = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });
    assert.ok(res1.ok);
    assert.equal(res1.value.migratedAttempts, 2);

    const list1 = await storage.listAttempts(exam.examId, exam.examVersionId);
    assert.ok(list1.ok);
    assert.equal(list1.value.length, 2);

    // Run 2 (Retry immediately)
    const res2 = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });
    assert.ok(res2.ok);
    assert.equal(res2.value.migratedAttempts, 2);

    // Must still have exactly 2 attempts, no duplicates
    const list2 = await storage.listAttempts(exam.examId, exam.examVersionId);
    assert.ok(list2.ok);
    assert.equal(list2.value.length, 2);

    // Run 3 (Retry again)
    const res3 = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });
    assert.ok(res3.ok);
    assert.equal(res3.value.migratedAttempts, 2);

    const list3 = await storage.listAttempts(exam.examId, exam.examVersionId);
    assert.ok(list3.ok);
    assert.equal(list3.value.length, 2);
  });

  it('interruption and resumption: resumes cleanly from partial migration', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();
    const exam = createSampleExam();

    ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

    // Batch 1 of keys
    ls.setItem(
      buildDraftKey(exam.examId, exam.examVersionId, 'att-part-1'),
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-part-1',
        candidateName: 'Học sinh 1',
        responses: {},
        submitted: false,
      })
    );

    // First partial run
    const res1 = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });
    assert.ok(res1.ok);
    assert.equal(res1.value.migratedAttempts, 1);

    // Now user had added more attempts or more attempts were written
    ls.setItem(
      buildFinalKey(exam.examId, exam.examVersionId, 'att-part-2'),
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-part-2',
        candidateName: 'Học sinh 2',
        responses: { 'q1-v1': 'opt-a' },
        submitted: true,
      })
    );

    // Second run (resumption)
    const res2 = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });
    assert.ok(res2.ok);
    assert.equal(res2.value.migratedAttempts, 2);

    const list = await storage.listAttempts(exam.examId, exam.examVersionId);
    assert.ok(list.ok);
    assert.equal(list.value.length, 2);
  });

  it('quota error handling: handles storage quota exhaustion without corrupting source', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();
    const exam = createSampleExam();

    ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));
    ls.setItem(
      buildFinalKey(exam.examId, exam.examVersionId, 'att-quota-01'),
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-quota-01',
        candidateName: 'Thí sinh Quota',
        responses: { 'q1-v1': 'opt-a' },
        submitted: true,
      })
    );

    // Trigger quota exceeded in storage adapter
    mem.setQuotaExceeded(true);

    const res = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'STORAGE_QUOTA');
    }

    // Source in localStorage is untouched!
    assert.ok(ls.getItem(buildFinalKey(exam.examId, exam.examVersionId, 'att-quota-01')));
  });
});
