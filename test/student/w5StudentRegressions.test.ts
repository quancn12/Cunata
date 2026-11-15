import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  startAttempt,
  resumeAttempt,
  type StudentController,
  type AttemptRecord,
  type WebExam,
  type StoragePort,
} from '../../src/student/index.ts';

import { createStoragePort, MemoryTransactionAdapter } from '../../src/storage/index.ts';

function createSampleExam(examId = 'exam-w5-student', examVersionId = 'v1.0'): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId,
    examVersionId,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề kiểm tra Wave 5 Student Regressions',
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
        options: [
          { optionId: 'opt-1a', text: 'Phương án A' },
          { optionId: 'opt-1b', text: 'Phương án B' },
          { optionId: 'opt-1c', text: 'Phương án C' },
          { optionId: 'opt-1d', text: 'Phương án D' },
        ],
        correctOptionId: 'opt-1a',
      },
      {
        kind: 'III',
        questionVersionId: 'q3-v1',
        title: 'Câu 3',
        answerKey: '-0,5',
      },
    ],
    assets: [],
  };
}

describe('WEB-FINAL-STUDENT-STORAGE: Student Regressions', () => {
  it('handles multiple concurrent draft saves during submit without data loss (draft/finalize race loop)', async () => {
    const adapter = new MemoryTransactionAdapter();
    const storage = createStoragePort(adapter);
    let currentTime = 1000;
    const now = () => currentTime;
    let idCounter = 1;
    const id = () => `att-${idCounter++}`;

    const exam = createSampleExam();
    const startRes = await startAttempt(exam, 'Lê Thị Thu Thảo', { storage, now, id });
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;
    const controller = startRes.value;

    // 1. Initial answer for Question 1
    const ans1 = await controller.answer({
      kind: 'I',
      questionVersionId: 'q1-v1',
      selectedOptionId: 'opt-1a',
    });
    assert.equal(ans1.ok, true);
    assert.equal(controller.getSnapshot().revision, 2);

    // 2. Intercept finalize in storage: when finalize is first called, simulate another session
    // saving draft (updating revision 2 -> 3 with a new answer for Part III), causing STORAGE_CONFLICT
    let finalizeAttempts = 0;
    const originalFinalize = storage.finalize.bind(storage);
    storage.finalize = async (record: AttemptRecord, expectedRevision: number) => {
      finalizeAttempts++;
      if (finalizeAttempts === 1) {
        // Concurrently save a draft answer for q3-v1 in storage directly at revision 2 -> 3
        const loaded = await storage.load(record);
        assert.equal(loaded.ok, true);
        if (loaded.ok && loaded.value) {
          const concurrentDraft: AttemptRecord = {
            ...loaded.value,
            revision: 3,
            responses: {
              ...loaded.value.responses,
              responses: [
                ...loaded.value.responses.responses,
                {
                  kind: 'III',
                  questionVersionId: 'q3-v1',
                  raw: '-0,5',
                },
              ],
            },
          };
          await storage.saveDraft(concurrentDraft, 2);
        }
      }
      return originalFinalize(record, expectedRevision);
    };

    // 3. Call submit: controller should catch STORAGE_CONFLICT, adopt the latest draft revision 3,
    // re-score on the newest responses (q1-v1: opt-1a, q3-v1: -0,5), and finalize successfully
    const submitRes = await controller.submit('manual');
    assert.equal(submitRes.ok, true);
    if (!submitRes.ok) return;

    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.phase, 'final');
    assert.equal(snapshot.candidateName, 'Lê Thị Thu Thảo');

    // Both answers must be present without data loss!
    const responses = snapshot.responses.responses;
    assert.equal(responses.length, 2);
    const q1Resp = responses.find((r) => r.questionVersionId === 'q1-v1');
    assert.equal(q1Resp?.kind, 'I');
    assert.equal((q1Resp as any)?.selectedOptionId, 'opt-1a');

    const q3Resp = responses.find((r) => r.questionVersionId === 'q3-v1');
    assert.equal(q3Resp?.kind, 'III');
    assert.equal((q3Resp as any)?.raw, '-0,5');

    // Finalized in storage
    const stored = await storage.load(snapshot);
    assert.equal(stored.ok, true);
    assert.equal(stored.ok && stored.value?.phase, 'final');
    assert.equal(stored.ok && stored.value?.responses.responses.length, 2);
  });

  it('preserves saved candidateName on resume of overdue draft without resetting to default', async () => {
    const adapter = new MemoryTransactionAdapter();
    const storage = createStoragePort(adapter);
    let currentTime = 1000;
    const now = () => currentTime;
    const id = () => 'att-overdue-name';

    const exam = createSampleExam();
    const startRes = await startAttempt(exam, 'Nguyễn Thị Ánh Viên', { storage, now, id });
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;
    const controller = startRes.value;

    const initialSnap = controller.getSnapshot();
    assert.equal(initialSnap.candidateName, 'Nguyễn Thị Ánh Viên');
    assert.equal(initialSnap.phase, 'draft');

    // Simulate clock advancing past deadline (started at 1000 + 50 min = 3,001,000)
    currentTime = 3001000 + 1000; // Past deadline!

    // Resume the attempt
    const resumeRes = await resumeAttempt(initialSnap, { storage, now, id });
    assert.equal(resumeRes.ok, true);
    if (!resumeRes.ok) return;
    const resumedController = resumeRes.value;

    const finalSnap = resumedController.getSnapshot();
    assert.equal(finalSnap.phase, 'final', 'Overdue draft must be auto-submitted to final');
    assert.equal(
      finalSnap.candidateName,
      'Nguyễn Thị Ánh Viên',
      'Saved candidate nickname must be hydrated and strictly preserved, never defaulting to "Thí sinh tự do"'
    );
    assert.ok(finalSnap.submittedAt !== null, 'submittedAt must be populated');
  });

  it('strictly preserves exact Part III raw strings like -0,5 vs 1,5 vs 1,50', async () => {
    const adapter = new MemoryTransactionAdapter();
    const storage = createStoragePort(adapter);
    let currentTime = 1000;
    const now = () => currentTime;
    const id = () => 'att-part-iii-exact';

    const exam = createSampleExam();
    const startRes = await startAttempt(exam, 'Hoàng Minh', { storage, now, id });
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;
    const controller = startRes.value;

    // Answer Part III with exact string "-0,5"
    const ans1 = await controller.answer({
      kind: 'III',
      questionVersionId: 'q3-v1',
      raw: '-0,5',
    });
    assert.equal(ans1.ok, true);
    const snap1 = controller.getSnapshot();
    const r1 = snap1.responses.responses.find((r) => r.questionVersionId === 'q3-v1');
    assert.equal(r1?.kind, 'III');
    assert.equal((r1 as any)?.raw, '-0,5');

    // Answer Part III with "1,50" (must not be coerced to 1.5 or 1,5)
    const ans2 = await controller.answer({
      kind: 'III',
      questionVersionId: 'q3-v1',
      raw: '1,50',
    });
    assert.equal(ans2.ok, true);
    const snap2 = controller.getSnapshot();
    const r2 = snap2.responses.responses.find((r) => r.questionVersionId === 'q3-v1');
    assert.equal(r2?.kind, 'III');
    assert.equal((r2 as any)?.raw, '1,50');
    assert.notEqual((r2 as any)?.raw, '1,5');
    assert.notEqual((r2 as any)?.raw, '1.5');
  });
});
