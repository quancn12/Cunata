import test from 'node:test';
import assert from 'node:assert/strict';
import { addToDraft } from '../../../src/bank/index.ts';
import type { BankEntry, ExamDraft, WebExam } from '../../../src/bank/types.ts';
import { MAX_QUESTIONS_PER_EXAM } from '../../../src/domain/index.ts';

function createMockDraft(questions: WebExam['questions'] = []): ExamDraft {
  const exam: WebExam = {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-01',
    examVersionId: 'exam-01-v1',
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề thi thử',
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

  return {
    draftId: 'draft-01',
    revision: 1,
    exam,
  };
}

const sampleEntryI: BankEntry = {
  questionId: 'q-bank-01',
  questionVersionId: 'q-bank-01-v1',
  revision: 1,
  taxonomy: {
    subject: 'Toán học',
    grade: 12,
    topic: 'Khảo sát hàm số',
    lesson: 'Tính đơn điệu',
    difficulty: 'Nhận biết',
  },
  question: {
    kind: 'I',
    questionVersionId: 'q-bank-01-v1',
    title: 'Câu hỏi hàm số',
    content: 'Nội dung câu 1',
    options: [
      { optionId: 'opt-a', label: 'A', text: 'Đáp án A' },
      { optionId: 'opt-b', label: 'B', text: 'Đáp án B' },
      { optionId: 'opt-c', label: 'C', text: 'Đáp án C' },
      { optionId: 'opt-d', label: 'D', text: 'Đáp án D' },
    ],
    correctOptionId: 'opt-b', // Index 1 is correct
  },
};

const sampleEntryII: BankEntry = {
  questionId: 'q-bank-02',
  questionVersionId: 'q-bank-02-v1',
  revision: 1,
  taxonomy: {
    subject: 'Toán học',
    grade: 12,
    topic: 'Tích phân',
    lesson: 'Ứng dụng tích phân',
    difficulty: 'Thông hiểu',
  },
  question: {
    kind: 'II',
    questionVersionId: 'q-bank-02-v1',
    title: 'Câu hỏi đúng sai',
    content: 'Nội dung câu 2',
    statements: [
      { statementId: 'st-1', label: 'a', text: 'Ý 1', answer: true },
      { statementId: 'st-2', label: 'b', text: 'Ý 2', answer: false },
      { statementId: 'st-3', label: 'c', text: 'Ý 3', answer: true },
      { statementId: 'st-4', label: 'd', text: 'Ý 4', answer: false },
    ],
  },
};

const sampleEntryIII: BankEntry = {
  questionId: 'q-bank-03',
  questionVersionId: 'q-bank-03-v1',
  revision: 1,
  taxonomy: {
    subject: 'Toán học',
    grade: 12,
    topic: 'Hình học',
    lesson: 'Khoảng cách',
    difficulty: 'Vận dụng',
  },
  question: {
    kind: 'III',
    questionVersionId: 'q-bank-03-v1',
    title: 'Câu hỏi trả lời ngắn',
    content: 'Nội dung câu 3',
    answerKey: '-0,5',
  },
};

test('addToDraft: adds a non-colliding question, preserving version and option identity', () => {
  const draft = createMockDraft([]);
  let counter = 0;
  const idGen = () => `id-${++counter}`;

  const res = addToDraft(draft, sampleEntryI, idGen);
  assert.ok(res.ok);
  assert.equal(res.value.revision, 2); // revision incremented
  assert.equal(res.value.exam.questions.length, 1);

  const addedQ = res.value.exam.questions[0];
  assert.ok(addedQ);
  assert.equal(addedQ.questionVersionId, 'q-bank-01-v1'); // Preserved version identity
  assert.equal(addedQ.kind, 'I');
  if (addedQ.kind === 'I') {
    assert.equal(addedQ.correctOptionId, 'opt-b'); // Preserved option identity
    assert.equal(addedQ.options[0]?.optionId, 'opt-a');
    assert.equal(addedQ.options[1]?.optionId, 'opt-b');
  }

  // ID generator was not needed for remapping
  assert.equal(counter, 0);
});

test('addToDraft: duplicate question remapping (Part I) remaps questionVersionId and option IDs consistently', () => {
  // Draft already contains sampleEntryI
  const draft = createMockDraft([sampleEntryI.question]);

  let idCounter = 100;
  const idGen = () => `gen-${++idCounter}`;

  // Add the same entry again
  const res = addToDraft(draft, sampleEntryI, idGen);
  assert.ok(res.ok);
  assert.equal(res.value.revision, 2);
  assert.equal(res.value.exam.questions.length, 2);

  const firstQ = res.value.exam.questions[0];
  const secondQ = res.value.exam.questions[1];

  assert.equal(firstQ?.questionVersionId, 'q-bank-01-v1');
  assert.equal(secondQ?.questionVersionId, 'gen-101'); // Remapped question version ID

  assert.equal(secondQ?.kind, 'I');
  if (secondQ?.kind === 'I') {
    // 4 options were generated: gen-102, gen-103, gen-104, gen-105
    assert.equal(secondQ.options[0]?.optionId, 'gen-102');
    assert.equal(secondQ.options[1]?.optionId, 'gen-103');
    assert.equal(secondQ.options[2]?.optionId, 'gen-104');
    assert.equal(secondQ.options[3]?.optionId, 'gen-105');

    // Original correct was opt-b at index 1 -> new correctOptionId must be gen-103!
    assert.equal(secondQ.correctOptionId, 'gen-103');
  }
});

test('addToDraft: duplicate question remapping (Part II) remaps questionVersionId and statement IDs, preserving answers', () => {
  const draft = createMockDraft([sampleEntryII.question]);

  let idCounter = 200;
  const idGen = () => `gen-${++idCounter}`;

  const res = addToDraft(draft, sampleEntryII, idGen);
  assert.ok(res.ok);
  assert.equal(res.value.exam.questions.length, 2);

  const secondQ = res.value.exam.questions[1];
  assert.equal(secondQ?.questionVersionId, 'gen-201');
  assert.equal(secondQ?.kind, 'II');

  if (secondQ?.kind === 'II') {
    assert.equal(secondQ.statements[0]?.statementId, 'gen-202');
    assert.equal(secondQ.statements[0]?.answer, true);
    assert.equal(secondQ.statements[1]?.statementId, 'gen-203');
    assert.equal(secondQ.statements[1]?.answer, false);
    assert.equal(secondQ.statements[2]?.statementId, 'gen-204');
    assert.equal(secondQ.statements[2]?.answer, true);
    assert.equal(secondQ.statements[3]?.statementId, 'gen-205');
    assert.equal(secondQ.statements[3]?.answer, false);
  }
});

test('addToDraft: duplicate question remapping (Part III) remaps version ID and preserves answerKey', () => {
  const draft = createMockDraft([sampleEntryIII.question]);

  let idCounter = 300;
  const idGen = () => `gen-${++idCounter}`;

  const res = addToDraft(draft, sampleEntryIII, idGen);
  assert.ok(res.ok);
  assert.equal(res.value.exam.questions.length, 2);

  const secondQ = res.value.exam.questions[1];
  assert.equal(secondQ?.questionVersionId, 'gen-301');
  assert.equal(secondQ?.kind, 'III');
  if (secondQ?.kind === 'III') {
    assert.equal(secondQ.answerKey, '-0,5');
  }
});

test('addToDraft: cross-question option ID collision triggers option remapping even with different versionId', () => {
  // Draft has a question with option 'opt-a'
  const draft = createMockDraft([sampleEntryI.question]);

  // Different entry but shares optionId 'opt-a'
  const collidingEntry: BankEntry = {
    ...sampleEntryI,
    questionId: 'q-diff-id',
    questionVersionId: 'q-diff-version', // different questionVersionId
    question: {
      kind: 'I',
      questionVersionId: 'q-diff-version',
      title: 'Different question',
      options: [
        { optionId: 'opt-a', text: 'Colliding opt' }, // Collides with sampleEntryI
        { optionId: 'opt-diff-2', text: 'B' },
        { optionId: 'opt-diff-3', text: 'C' },
        { optionId: 'opt-diff-4', text: 'D' },
      ],
      correctOptionId: 'opt-diff-3', // Index 2
    },
  };

  let idCounter = 400;
  const idGen = () => `remap-${++idCounter}`;

  const res = addToDraft(draft, collidingEntry, idGen);
  assert.ok(res.ok);
  const added = res.value.exam.questions[1];
  assert.equal(added?.kind, 'I');
  if (added?.kind === 'I') {
    assert.equal(added.options[0]?.optionId, 'remap-401');
    assert.equal(added.options[1]?.optionId, 'remap-402');
    assert.equal(added.options[2]?.optionId, 'remap-403');
    assert.equal(added.options[3]?.optionId, 'remap-404');
    assert.equal(added.correctOptionId, 'remap-403');
  }
});

test('addToDraft: special prototype property names in option IDs are safely handled', () => {
  const draft = createMockDraft();

  const protoEntry: BankEntry = {
    questionId: 'q-proto',
    questionVersionId: 'q-proto-v1',
    revision: 1,
    taxonomy: sampleEntryI.taxonomy,
    question: {
      kind: 'I',
      questionVersionId: 'q-proto-v1',
      title: 'Prototype testing',
      options: [
        { optionId: '__proto__', text: 'Proto' },
        { optionId: 'constructor', text: 'Constructor' },
        { optionId: 'toString', text: 'ToString' },
        { optionId: 'valueOf', text: 'ValueOf' },
      ],
      correctOptionId: 'toString',
    },
  };

  const idGen = () => 'unused';
  const res1 = addToDraft(draft, protoEntry, idGen);
  assert.ok(res1.ok);

  // Now add again to trigger remapping
  let idCounter = 500;
  const gen2 = () => `safe-${++idCounter}`;
  const res2 = addToDraft(res1.value, protoEntry, gen2);
  assert.ok(res2.ok);

  const remapped = res2.value.exam.questions[1];
  assert.equal(remapped?.kind, 'I');
  if (remapped?.kind === 'I') {
    // Index 2 had 'toString' -> correctOptionId must be remapped to safe-504
    assert.equal(remapped.correctOptionId, 'safe-504');
    assert.equal(remapped.options[2]?.optionId, 'safe-504');
  }
});

test('addToDraft: rejects adding beyond MAX_QUESTIONS_PER_EXAM', () => {
  const bigQuestionsList: WebExam['questions'] = new Array(MAX_QUESTIONS_PER_EXAM).fill(sampleEntryI.question);
  const draft = createMockDraft(bigQuestionsList);

  const res = addToDraft(draft, sampleEntryI, () => 'q-extra');
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'PAYLOAD_LIMIT');
  }
});

test('addToDraft: rejects invalid draft or invalid entry', () => {
  const draft = createMockDraft([]);

  const res1 = addToDraft(null as any, sampleEntryI, () => 'id');
  assert.equal(res1.ok, false);
  if (!res1.ok) {
    assert.equal(res1.error.code, 'INVALID_DRAFT');
  }

  const res2 = addToDraft(draft, null as any, () => 'id');
  assert.equal(res2.ok, false);
  if (!res2.ok) {
    assert.equal(res2.error.code, 'BANK_ENTRY_INVALID');
  }

  const res3 = addToDraft(draft, sampleEntryI, null as any);
  assert.equal(res3.ok, false);
  if (!res3.ok) {
    assert.equal(res3.error.code, 'INVALID_ID_GENERATOR');
  }
});

test('addToDraft: copy isolation ensures draft and bank entry do not leak mutations', () => {
  const draft = createMockDraft([]);
  const mutableEntry = JSON.parse(JSON.stringify(sampleEntryI));

  const res = addToDraft(draft, mutableEntry, () => 'unused');
  assert.ok(res.ok);

  // Mutate local mutableEntry
  mutableEntry.question.title = 'Tên bị đổi ngoài';
  mutableEntry.question.options[0].text = 'Đáp án đổi ngoài';

  // Question in draft must remain unchanged
  const draftQ = res.value.exam.questions[0];
  assert.equal(draftQ?.title, 'Câu hỏi hàm số');
  if (draftQ?.kind === 'I') {
    assert.equal(draftQ.options[0]?.text, 'Đáp án A');
  }

  // Original draft.exam.questions is untouched
  assert.equal(draft.exam.questions.length, 0);

  // Returned draft and questions array are frozen
  assert.ok(Object.isFrozen(res.value));
  assert.ok(Object.isFrozen(res.value.exam.questions));
});
