import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveBankEntry,
  deleteBankEntry,
  createNewVersion,
} from '../../../src/bank/index.ts';
import type {
  BankEntry,
  WebExam,
  AttemptRecord,
} from '../../../src/bank/types.ts';
import { InMemoryStoragePort } from './testStorage.ts';

const baseQuestion: BankEntry = {
  questionId: 'q-ac-01',
  questionVersionId: 'q-ac-01-v1',
  revision: 0,
  taxonomy: {
    subject: 'Toán học',
    grade: 12,
    topic: 'Khảo sát hàm số',
    lesson: 'Cực trị',
    difficulty: 'Nhận biết',
  },
  question: {
    kind: 'I',
    questionVersionId: 'q-ac-01-v1',
    title: 'Hàm số đạt cực trị tại đâu?',
    content: 'Cho hàm số $y = x^2 - 2x$.',
    options: [
      { optionId: 'opt-1', label: 'A', text: '$x = 1$' },
      { optionId: 'opt-2', label: 'B', text: '$x = 0$' },
      { optionId: 'opt-3', label: 'C', text: '$x = 2$' },
      { optionId: 'opt-4', label: 'D', text: '$x = -1$' },
    ],
    correctOptionId: 'opt-1',
  },
};

function createMockPublishedExam(questions: WebExam['questions']): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-published-01',
    examVersionId: 'exam-published-01-v1',
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề thi đã phát hành',
    subject: 'Toán học',
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: 1,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    assets: [],
    questions,
  };
}

function createMockAttempt(
  examSnapshot: WebExam,
  phase: 'draft' | 'final',
): AttemptRecord {
  return {
    schemaVersion: 'web-attempt-v1',
    examId: examSnapshot.examId,
    examVersionId: examSnapshot.examVersionId,
    attemptId: `att-${phase}-01`,
    revision: 1,
    candidateName: 'Thí sinh A',
    examSnapshot,
    presentationOrder: {
      seed: 'seed-01',
      questionOrder: examSnapshot.questions.map(q => q.questionVersionId),
      optionOrder: [],
    },
    responses: {
      attemptId: `att-${phase}-01`,
      examVersionId: examSnapshot.examVersionId,
      responses: [
        { kind: 'I', questionVersionId: examSnapshot.questions[0]?.questionVersionId ?? '', selectedOptionId: 'opt-1' },
      ],
    },
    startedAt: 1700000000000,
    deadline: 1700003000000,
    phase,
    submittedAt: phase === 'final' ? 1700001500000 : null,
    scoreDTO: phase === 'final' ? { totalScore: '1/4', maxScore: '1/4' } : null,
  };
}

test('AC Isolation: bank edits or new versions cannot mutate published exams', async () => {
  const storage = new InMemoryStoragePort();

  // 1. Save question to bank
  const saveRes = await saveBankEntry(baseQuestion, null, storage);
  assert.ok(saveRes.ok);

  // 2. Publish an exam containing this question
  const publishedExam = createMockPublishedExam([baseQuestion.question]);
  const pubRes = await storage.putObject('exams', 'exam-published-01:v1', publishedExam, null);
  assert.ok(pubRes.ok);

  // 3. Teacher edits bank question -> updates revision 2
  const updatedBankEntry: BankEntry = {
    ...saveRes.value,
    question: {
      ...saveRes.value.question,
      title: 'Tiêu đề câu hỏi trong ngân hàng đã bị sửa hoàn toàn!',
      content: 'Nội dung mới trong ngân hàng',
    },
  };
  const updateRes = await saveBankEntry(updatedBankEntry, 1, storage);
  assert.ok(updateRes.ok);

  // 4. Teacher creates v2 of the question in bank
  const v2Draft = createNewVersion(updatedBankEntry, 'q-ac-01-v2', {
    title: 'Phiên bản 2 hoàn toàn mới',
  });
  assert.ok(v2Draft.ok);
  await saveBankEntry(v2Draft.value, null, storage);

  // 5. Verify published exam in storage has NOT been mutated
  const examInStorage = await storage.getObject('exams', 'exam-published-01:v1');
  assert.ok(examInStorage.ok);
  const loadedExam = examInStorage.value as WebExam;

  assert.equal(loadedExam.questions.length, 1);
  const qInExam = loadedExam.questions[0];
  assert.ok(qInExam);
  assert.equal(qInExam.questionVersionId, 'q-ac-01-v1');
  assert.equal(qInExam.title, 'Hàm số đạt cực trị tại đâu?'); // Untouched original title
  assert.equal(qInExam.content, 'Cho hàm số $y = x^2 - 2x$.'); // Untouched original content
});

test('AC Isolation: bank deletion cannot mutate published exams, active attempts, or historical results', async () => {
  const storage = new InMemoryStoragePort();

  // 1. Save question to bank
  const saveRes = await saveBankEntry(baseQuestion, null, storage);
  assert.ok(saveRes.ok);

  // 2. Publish exam
  const publishedExam = createMockPublishedExam([baseQuestion.question]);
  await storage.putObject('exams', 'exam-published-01:v1', publishedExam, null);

  // 3. Create active attempt (in progress)
  const activeAttempt = createMockAttempt(publishedExam, 'draft');
  await storage.create(activeAttempt);

  // 4. Create historical finalized attempt
  const historicalAttempt = createMockAttempt(publishedExam, 'final');
  await storage.create(historicalAttempt);

  // 5. Delete question from bank
  const delRes = await deleteBankEntry(baseQuestion.questionVersionId, 1, storage);
  assert.ok(delRes.ok);

  // Verify it is indeed gone from bank
  const bankCheck = await storage.getObject('bank', baseQuestion.questionVersionId);
  assert.ok(bankCheck.ok);
  assert.equal(bankCheck.value, null);

  // 6. Verify published exam is intact
  const examCheck = await storage.getObject('exams', 'exam-published-01:v1');
  assert.ok(examCheck.ok);
  const loadedExam = examCheck.value as WebExam;
  assert.equal(loadedExam.questions[0]?.title, 'Hàm số đạt cực trị tại đâu?');
  assert.equal(loadedExam.questions[0]?.questionVersionId, 'q-ac-01-v1');

  // 7. Verify active attempt is intact
  const activeCheck = await storage.load({
    examId: activeAttempt.examId,
    examVersionId: activeAttempt.examVersionId,
    attemptId: activeAttempt.attemptId,
  });
  assert.ok(activeCheck.ok);
  assert.ok(activeCheck.value);
  assert.equal(activeCheck.value.phase, 'draft');
  assert.equal(activeCheck.value.examSnapshot.questions[0]?.title, 'Hàm số đạt cực trị tại đâu?');

  // 8. Verify historical result is intact
  const histCheck = await storage.load({
    examId: historicalAttempt.examId,
    examVersionId: historicalAttempt.examVersionId,
    attemptId: historicalAttempt.attemptId,
  });
  assert.ok(histCheck.ok);
  assert.ok(histCheck.value);
  assert.equal(histCheck.value.phase, 'final');
  assert.deepEqual(histCheck.value.scoreDTO, { totalScore: '1/4', maxScore: '1/4' });
  assert.equal(histCheck.value.examSnapshot.questions[0]?.title, 'Hàm số đạt cực trị tại đâu?');
});

test('AC Isolation: authoring operations require no fake authorization tokens', async () => {
  const storage = new InMemoryStoragePort();

  // Pure port-based call: no session tokens, no dummy isAdmin headers, no fake auth mocks
  const saveRes = await saveBankEntry(baseQuestion, null, storage);
  assert.ok(saveRes.ok);

  const delRes = await deleteBankEntry(baseQuestion.questionVersionId, 1, storage);
  assert.ok(delRes.ok);
});
