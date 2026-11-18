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

  it('verifies StudentController scores oracle golden-20-10-4 Part III responses deterministically', async () => {
    const adapter = new MemoryTransactionAdapter();
    const storage = createStoragePort(adapter);
    let currentTime = 1000;
    const now = () => currentTime;
    let idCounter = 1;
    const id = () => `att-oracle-${idCounter++}`;

    const exam20104: WebExam = {
      schemaVersion: 'web-exam-v1',
      examId: 'exam:golden-20-10-4',
      examVersionId: 'version:golden-20-10-4',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'Đề Oracle golden-20-10-4',
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
        // 20 questions Part I (correctOptionId is opt-0)
        ...Array.from({ length: 20 }, (_, i) => ({
          kind: 'I' as const,
          questionVersionId: `golden-20-10-4:I:${i}`,
          title: `Câu I.${i + 1}`,
          options: [0, 1, 2, 3].map((optIdx) => ({
            optionId: `golden-20-10-4:I:${i}:option:${optIdx}`,
            text: `Phương án ${optIdx}`,
          })),
          correctOptionId: `golden-20-10-4:I:${i}:option:0`,
        })),
        // 10 questions Part II (all 4 statements true)
        ...Array.from({ length: 10 }, (_, i) => ({
          kind: 'II' as const,
          questionVersionId: `golden-20-10-4:II:${i}`,
          title: `Câu II.${i + 1}`,
          statements: [0, 1, 2, 3].map((stIdx) => ({
            statementId: `golden-20-10-4:II:${i}:statement:${stIdx}`,
            text: `Mệnh đề ${stIdx}`,
            answer: true,
          })),
        })),
        // 4 questions Part III
        { kind: 'III' as const, questionVersionId: 'golden-20-10-4:III:0', title: 'Câu III.1', answerKey: '1,5' },
        { kind: 'III' as const, questionVersionId: 'golden-20-10-4:III:1', title: 'Câu III.2', answerKey: '-0,5' },
        { kind: 'III' as const, questionVersionId: 'golden-20-10-4:III:2', title: 'Câu III.3', answerKey: '0' },
        { kind: 'III' as const, questionVersionId: 'golden-20-10-4:III:3', title: 'Câu III.4', answerKey: '1,50' },
      ],
      assets: [],
    };

    // Sub-case 1: Full Part III answers (all 4 correct)
    {
      const startRes = await startAttempt(exam20104, 'Thí sinh Full III', { storage, now, id });
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;
      const ctrl = startRes.value;

      await ctrl.answer({ kind: 'III', questionVersionId: 'golden-20-10-4:III:0', raw: '1,5' });
      await ctrl.answer({ kind: 'III', questionVersionId: 'golden-20-10-4:III:1', raw: '-0,5' });
      await ctrl.answer({ kind: 'III', questionVersionId: 'golden-20-10-4:III:2', raw: '0' });
      await ctrl.answer({ kind: 'III', questionVersionId: 'golden-20-10-4:III:3', raw: '1,50' });

      const subRes = await ctrl.submit('manual');
      assert.equal(subRes.ok, true);
      const dto = ctrl.getSnapshot().scoreDTO as any;
      // N1=20 (max 5), N2=10 (max 10) -> BASE=15 >= 10 -> POINT_III = 0.25
      // 4 correct * 0.25 = 1 / 1
      assert.equal(dto.sections.III.score, '1');
      assert.equal(dto.sections.III.max, '1');
    }

    // Sub-case 2: Single Part III answer (only III:0 correct, others unanswered)
    {
      const startRes = await startAttempt(exam20104, 'Thí sinh One III', { storage, now, id });
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;
      const ctrl = startRes.value;

      await ctrl.answer({ kind: 'III', questionVersionId: 'golden-20-10-4:III:0', raw: '1,5' });

      const subRes = await ctrl.submit('manual');
      assert.equal(subRes.ok, true);
      const dto = ctrl.getSnapshot().scoreDTO as any;
      // 1 correct * 0.25 = 1/4 / 1
      assert.equal(dto.sections.III.score, '1/4');
      assert.equal(dto.sections.III.max, '1');
    }
  });

  it('verifies StudentController handles oracle golden-39-0-3 (39 Part I, 0 Part II, 3 Part III) and one-III scoring', async () => {
    const adapter = new MemoryTransactionAdapter();
    const storage = createStoragePort(adapter);
    let currentTime = 1000;
    const now = () => currentTime;
    let idCounter = 1;
    const id = () => `att-golden-3903-${idCounter++}`;

    const exam3903: WebExam = {
      schemaVersion: 'web-exam-v1',
      examId: 'exam:golden-39-0-3',
      examVersionId: 'version:golden-39-0-3',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'Oracle golden-39-0-3',
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
        // 39 questions Part I
        ...Array.from({ length: 39 }, (_, i) => ({
          kind: 'I' as const,
          questionVersionId: `golden-39-0-3:I:${i}`,
          title: `Câu I.${i + 1}`,
          options: [0, 1, 2, 3].map((optIdx) => ({
            optionId: `golden-39-0-3:I:${i}:option:${optIdx}`,
            text: `Lựa chọn ${optIdx}`,
          })),
          correctOptionId: `golden-39-0-3:I:${i}:option:${i % 4}`,
        })),
        // 3 questions Part III
        { kind: 'III' as const, questionVersionId: 'golden-39-0-3:III:0', title: 'Câu III.1', answerKey: '1,5' },
        { kind: 'III' as const, questionVersionId: 'golden-39-0-3:III:1', title: 'Câu III.2', answerKey: '-0,5' },
        { kind: 'III' as const, questionVersionId: 'golden-39-0-3:III:2', title: 'Câu III.3', answerKey: '0' },
      ],
      assets: [],
    };

    assert.equal(exam3903.questions.length, 42);

    const startRes = await startAttempt(exam3903, 'Thí sinh golden-39-0-3', { storage, now, id });
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;
    const ctrl = startRes.value;

    // Answer only golden-39-0-3:III:0 with exact key '1,5'
    const ansRes = await ctrl.answer({ kind: 'III', questionVersionId: 'golden-39-0-3:III:0', raw: '1,5' });
    assert.equal(ansRes.ok, true);

    const subRes = await ctrl.submit('manual');
    assert.equal(subRes.ok, true);

    const dto = ctrl.getSnapshot().scoreDTO as any;
    // N1=39 (max 39/4 = 9.75), N2=0, N3=3 -> BASE=9.75 < 10 -> POINT_III = (10 - 9.75) / 3 = 1/12
    // MAX_III = 3 * (1/12) = 1/4
    // 1 correct in Part III -> score = 1/12
    assert.equal(dto.sections.I.score, '0');
    assert.equal(dto.sections.I.max, '39/4');
    assert.equal(dto.sections.II.score, '0');
    assert.equal(dto.sections.II.max, '0');
    assert.equal(dto.sections.III.score, '1/12');
    assert.equal(dto.sections.III.max, '1/4');
    assert.equal(dto.total, '1/12');
    assert.equal(dto.maxTotal, '10');
  });

  it('FX33-student regression: controller.rename updates candidateName and persists across reload and overdue autosubmit without resetting', async () => {
    const adapter = new MemoryTransactionAdapter();
    const storage = createStoragePort(adapter);
    let currentTime = 1000000;
    const now = () => currentTime;
    let nextId = 1;
    const id = () => `att-fx33-${nextId++}`;

    const exam = createSampleExam('exam-fx33-rename', 'v1.0');

    // 1. Start with initial name 'Học sinh kiểm định'
    const startRes = await startAttempt(exam, 'Học sinh kiểm định', { storage, now, id });
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;
    const ctrl1 = startRes.value;
    assert.equal(ctrl1.getSnapshot().candidateName, 'Học sinh kiểm định');

    // 2. Answer question 1
    const ansRes = await ctrl1.answer({
      kind: 'I',
      questionVersionId: 'q1-v1',
      selectedOptionId: 'opt-1c',
    });
    assert.equal(ansRes.ok, true);

    // 3. Rename to 'Trần Bình 0456'
    const renameRes = await ctrl1.rename('Trần Bình 0456');
    assert.equal(renameRes.ok, true);
    assert.equal(ctrl1.getSnapshot().candidateName, 'Trần Bình 0456');

    // 4. Resume attempt (simulate page reload)
    const resumeRes = await resumeAttempt(
      {
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: ctrl1.getSnapshot().attemptId,
      },
      { storage, now, id }
    );
    assert.equal(resumeRes.ok, true);
    if (!resumeRes.ok) return;
    const ctrl2 = resumeRes.value;
    assert.equal(ctrl2.getSnapshot().candidateName, 'Trần Bình 0456', 'reloaded attempt must preserve renamed candidateName');
    assert.equal(ctrl2.getSnapshot().responses.responses.length, 1);

    // 5. Simulate clock advancing past deadline (e.g. + 3 hours) and resume again (simulating return after deadline)
    currentTime += 3 * 3600 * 1000;
    const overdueResumeRes = await resumeAttempt(
      {
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: ctrl1.getSnapshot().attemptId,
      },
      { storage, now, id }
    );
    assert.equal(overdueResumeRes.ok, true);
    if (!overdueResumeRes.ok) return;
    const ctrl3 = overdueResumeRes.value;
    const finalSnap = ctrl3.getSnapshot();
    assert.equal(finalSnap.phase, 'final', 'overdue resume must auto-finalize');
    assert.equal(finalSnap.candidateName, 'Trần Bình 0456', 'auto-finalized attempt must keep renamed candidateName');
    assert.notEqual(finalSnap.candidateName, 'Học sinh kiểm định');
    assert.notEqual(finalSnap.candidateName, 'Thí sinh tự do');
  });

  it('CK36-F01 regression: startAttempt preserves dueAt/openAt in initial record and rejects when past dueAt', async () => {
    const adapter = new MemoryTransactionAdapter();
    const storage = createStoragePort(adapter);
    let currentTime = 1700000000000;
    const now = () => currentTime;
    let nextId = 1;
    const id = () => `att-ck36-${nextId++}`;

    const exam = createSampleExam('exam-ck36-due', 'v1.0');
    const openTime = new Date(currentTime - 60000).toISOString();
    const dueTime = new Date(currentTime + 12000).toISOString();

    // 1. Before dueAt: startAttempt succeeds and persists schedule
    const startRes1 = await startAttempt(
      exam,
      'Học sinh An',
      { storage, now, id },
      {
        assignmentId: 'asg-test-1',
        classCode: 'LOPHOC',
        openAt: openTime,
        dueAt: dueTime,
      }
    );
    assert.equal(startRes1.ok, true);
    if (!startRes1.ok) return;
    const snap1 = startRes1.value.getSnapshot();
    assert.equal(snap1.dueAt, dueTime);
    assert.equal(snap1.openAt, openTime);
    assert.equal(snap1.assignmentId, 'asg-test-1');
    assert.equal(snap1.classCode, 'LOPHOC');

    // Submit attempt 1
    const subRes = await startRes1.value.submit('manual');
    assert.equal(subRes.ok, true);

    // 2. Advance time past dueAt (+15 seconds)
    currentTime += 15000;

    // 3. Attempting to start a new attempt past dueAt MUST be rejected
    const startRes2 = await startAttempt(
      exam,
      'Học sinh An',
      { storage, now, id },
      {
        assignmentId: 'asg-test-1',
        classCode: 'LOPHOC',
        openAt: openTime,
        dueAt: dueTime,
      }
    );
    assert.equal(startRes2.ok, false, 'startAttempt past dueAt must be rejected');
    if (startRes2.ok) return;
    assert.equal(startRes2.error.code, 'ASSIGNMENT_PAST_DUE');

    // 4. Verify storage contains exactly 1 final and 0 new drafts
    const listRes = await storage.listAttempts(exam.examId, exam.examVersionId);
    assert.equal(listRes.ok, true);
    if (!listRes.ok) return;
    const finals = listRes.value.filter((a) => a.phase === 'final');
    const drafts = listRes.value.filter((a) => a.phase === 'draft');
    assert.equal(finals.length, 1, 'final attempt must be preserved');
    assert.equal(drafts.length, 0, 'no draft must be created past dueAt');

    // 5. Practice exam without dueAt can still start normally
    const practiceExam = createSampleExam('exam-practice', 'v1.0');
    const practiceStart = await startAttempt(practiceExam, 'Học sinh An', { storage, now, id });
    assert.equal(practiceStart.ok, true, 'practice exam without dueAt starts normally');
  });

  it('CK37-F01 regression: past due assignment A does not leak schedule or starve durable draft of practice exam B', async () => {
    const adapter = new MemoryTransactionAdapter();
    const storage = createStoragePort(adapter);
    let currentTime = 1700000000000;
    const now = () => currentTime;
    let nextId = 1;
    const id = () => `att-ck37-${nextId++}`;

    const examA = createSampleExam('exam-A-assigned', 'v1.0');
    const examB = createSampleExam('exam-B-practice', 'v1.0');
    const examBTeacher = createSampleExam('exam-B-teacher', 'v1.0');

    const openTime = new Date(currentTime - 60000).toISOString();
    const dueTime = new Date(currentTime + 12000).toISOString();

    // 1. Student takes assigned exam A
    const startA = await startAttempt(
      examA,
      'Học sinh Bình',
      { storage, now, id },
      {
        assignmentId: 'asg-A',
        classCode: '12A1',
        openAt: openTime,
        dueAt: dueTime,
      }
    );
    assert.equal(startA.ok, true);
    if (!startA.ok) return;

    // Answer and submit Exam A
    await startA.value.answer({
      kind: 'I',
      questionVersionId: 'q1-v1',
      selectedOptionId: 'opt-1a',
    });
    const submitA = await startA.value.submit('manual');
    assert.equal(submitA.ok, true);

    // 2. Advance time past Exam A dueAt (+15 seconds)
    currentTime += 15000;

    // 3. Start practice Exam B (has no assignment, no dueAt)
    // Verify that startAttempt on Exam B does NOT inherit Exam A dueAt or assignmentId
    const startB = await startAttempt(
      examB,
      'Học sinh Bình',
      { storage, now, id },
      {} // no assignment metadata
    );
    assert.equal(startB.ok, true, 'Exam B must start normally even when Exam A is past due');
    if (!startB.ok) return;

    const snapB = startB.value.getSnapshot();
    assert.equal(snapB.dueAt, undefined, 'Exam B must not inherit Exam A dueAt');
    assert.equal(snapB.openAt, undefined, 'Exam B must not inherit Exam A openAt');
    assert.equal(snapB.assignmentId, undefined, 'Exam B must not inherit Exam A assignmentId');
    assert.equal(snapB.classCode, undefined, 'Exam B must not inherit Exam A classCode');

    // Answer Exam B
    const ansB = await startB.value.answer({
      kind: 'III',
      questionVersionId: 'q3-v1',
      raw: '1,5',
    });
    assert.equal(ansB.ok, true, 'Must answer Exam B');

    // 4. Verify durable draft for Exam B exists in storage immediately before any reload
    const listB = await storage.listAttempts(examB.examId, examB.examVersionId);
    assert.equal(listB.ok, true);
    if (!listB.ok) return;
    const draftsB = listB.value.filter((a) => a.phase === 'draft');
    assert.equal(draftsB.length, 1, 'Exam B must have exactly 1 durable draft in storage');
    const draftB0 = draftsB[0];
    assert.ok(draftB0);
    assert.equal(draftB0.responses.responses.length, 1, 'Exam B draft must persist response');
    const respB = draftB0.responses.responses[0] as any;
    assert.equal(respB.raw, '1,5');
    assert.equal(draftB0.dueAt, undefined, 'Durable draft must not contain dueAt');

    // 5. Repeat for teacher published Exam B (without assignment)
    const startBTeacher = await startAttempt(
      examBTeacher,
      'Học sinh Bình',
      { storage, now, id },
      {}
    );
    assert.equal(startBTeacher.ok, true, 'Teacher published Exam B without assignment starts normally');
    if (!startBTeacher.ok) return;
    const snapBTeacher = startBTeacher.value.getSnapshot();
    assert.equal(snapBTeacher.dueAt, undefined);
    assert.equal(snapBTeacher.assignmentId, undefined);

    // 6. Test when Exam A is NOT yet past due: metadata still must not leak to Exam B
    currentTime -= 20000; // Back before Exam A dueAt
    const startB2 = await startAttempt(
      examB,
      'Học sinh Bình',
      { storage, now, id },
      {}
    );
    assert.equal(startB2.ok, true);
    if (!startB2.ok) return;
    assert.equal(startB2.value.getSnapshot().dueAt, undefined, 'Active non-expired assignment A must not leak dueAt to B');
    assert.equal(startB2.value.getSnapshot().assignmentId, undefined);

    // 7. Exam A past due: restart of Exam A past due must be rejected
    currentTime += 30000;
    const restartA = await startAttempt(
      examA,
      'Học sinh Bình',
      { storage, now, id },
      {
        assignmentId: 'asg-A',
        classCode: '12A1',
        openAt: openTime,
        dueAt: dueTime,
      }
    );
    assert.equal(restartA.ok, false, 'Restart of Exam A past due must be rejected');
    if (!restartA.ok) {
      assert.equal(restartA.error.code, 'ASSIGNMENT_PAST_DUE');
    }
  });
});
