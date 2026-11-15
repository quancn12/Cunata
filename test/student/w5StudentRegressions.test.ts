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

  it('scores 8-8-2 exam correctly: BASE >= 10 gives 0,25 per Part III question, total 10,5 / 10,5 without normalizing to 10', async () => {
    const adapter = new MemoryTransactionAdapter();
    const storage = createStoragePort(adapter);
    const now = () => 1000;
    const id = () => 'att-882-scoring';

    const p2Statements = [true, false, true, false];
    const exam882: WebExam = {
      schemaVersion: 'web-exam-v1',
      examId: 'exam-8-8-2',
      examVersionId: 'v1.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'Đề kiểm tra 8-8-2',
      subject: 'Vật lí',
      grade: 12,
      settings: {
        durationMinutes: 50,
        maxAttempts: null,
        releasePolicy: 'immediate',
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      questions: [
        ...Array.from({ length: 8 }, (_, i) => ({
          kind: 'I' as const,
          questionVersionId: `qI-${i + 1}`,
          title: `Câu I.${i + 1}`,
          options: [
            { optionId: `qI-${i + 1}-opt-a`, text: 'A' },
            { optionId: `qI-${i + 1}-opt-b`, text: 'B' },
            { optionId: `qI-${i + 1}-opt-c`, text: 'C' },
            { optionId: `qI-${i + 1}-opt-d`, text: 'D' },
          ],
          correctOptionId: `qI-${i + 1}-opt-a`,
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          kind: 'II' as const,
          questionVersionId: `qII-${i + 1}`,
          title: `Câu II.${i + 1}`,
          statements: p2Statements.map((val, idx) => ({
            statementId: `qII-${i + 1}-s${idx + 1}`,
            text: `Ý ${idx + 1}`,
            answer: val,
          })),
        })),
        {
          kind: 'III' as const,
          questionVersionId: 'qIII-1',
          title: 'Câu III.1',
          answerKey: '1',
        },
        {
          kind: 'III' as const,
          questionVersionId: 'qIII-2',
          title: 'Câu III.2',
          answerKey: '2',
        },
      ],
      assets: [],
    };

    const startRes = await startAttempt(exam882, 'Thí sinh 882', { storage, now, id });
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;
    const controller = startRes.value;

    // Answer all 8 Part I correctly
    for (let i = 0; i < 8; i++) {
      await controller.answer({
        kind: 'I',
        questionVersionId: `qI-${i + 1}`,
        selectedOptionId: `qI-${i + 1}-opt-a`,
      });
    }

    // Answer all 8 Part II correctly (all 4 statements correct per question -> 1 pt each)
    for (let i = 0; i < 8; i++) {
      await controller.answer({
        kind: 'II',
        questionVersionId: `qII-${i + 1}`,
        answers: p2Statements.map((val, idx) => ({
          statementId: `qII-${i + 1}-s${idx + 1}`,
          value: val,
        })),
      });
    }

    // Answer both Part III questions correctly
    await controller.answer({
      kind: 'III',
      questionVersionId: 'qIII-1',
      raw: '1',
    });
    await controller.answer({
      kind: 'III',
      questionVersionId: 'qIII-2',
      raw: '2',
    });

    const submitRes = await controller.submit('manual');
    assert.equal(submitRes.ok, true);
    if (!submitRes.ok) return;

    const finalSnap = controller.getSnapshot();
    assert.equal(finalSnap.phase, 'final');
    assert.ok(finalSnap.scoreDTO !== null);

    const dto = finalSnap.scoreDTO as any;
    // Section I: 8 * 0.25 = 2 / 2
    assert.equal(dto.sections.I.score, '2');
    assert.equal(dto.sections.I.max, '2');
    // Section II: 8 * 1 = 8 / 8
    assert.equal(dto.sections.II.score, '8');
    assert.equal(dto.sections.II.max, '8');
    // Section III: BASE = 10, POINT_III = 0.25 -> 2 * 0.25 = 0.5 / 0.5
    assert.equal(dto.sections.III.score, '1/2');
    assert.equal(dto.sections.III.max, '1/2');
    // Total: 2 + 8 + 0.5 = 10.5 / 10.5
    assert.equal(dto.total, '21/2');
    assert.equal(dto.maxTotal, '21/2');
  });
});
