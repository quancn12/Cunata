import test from "node:test";
import assert from "node:assert/strict";

import {
  createDraft,
  editDraft,
  publishDraft,
  computeDraftMax,
  duplicateQuestion,
  reorderQuestions,
  reorderQuestionsById,
  removeQuestionFromDraft,
  addBankEntryToDraft,
  resolveDraftCollisions,
  rollbackPublishedExam,
} from "../../../src/teacher/index.ts";
import type {
  ExamDraft,
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  Taxonomy,
  AttemptRecord,
  Result,
} from "../../../src/teacher/types.ts";

import {
  saveBankEntry,
  deleteBankEntry,
  createNewVersion,
} from "../../../src/bank/index.ts";
import type { BankEntry } from "../../../src/bank/types.ts";
import { deleteBankEntryConfirmed } from "../../../src/bank/transfer.ts";

import {
  scoreAttempt,
  computeExamMax,
  createPresentationOrder,
  rational,
  toFractionString,
  equals,
} from "../../../src/domain/index.ts";
import type { AttemptResponses, Response } from "../../../src/domain/index.ts";

import { toDomainExam, parseExam, exportExam } from "../../../src/schema/index.ts";
import { InMemoryStoragePort } from "../../bank/core/testStorage.ts";

function assertOk<T>(res: Result<T>, msg?: string): asserts res is { readonly ok: true; readonly value: T } {
  assert.equal(res.ok, true, msg ?? (!res.ok ? JSON.stringify((res as { error: unknown }).error) : undefined));
}

function createBaseExam(id = "w4-exam-1", vId = "v1.0.0"): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: id,
    examVersionId: vId,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    title: "Đề thi Hardening Wave 4 GDPT 2018",
    subject: "Toán học",
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: "immediate",
      shuffleQuestions: true,
      shuffleOptions: true,
    },
    questions: [],
    assets: [],
  };
}

function createBankQuestion(qId: string, vId: string, kind: "I" | "II" | "III"): BankEntry {
  const taxonomy: Taxonomy = {
    subject: "Toán học",
    grade: 12,
    topic: "Nguyên hàm - Tích phân",
    lesson: "Tích phân xác định",
    difficulty: "Vận dụng",
  };

  if (kind === "I") {
    return {
      questionId: qId,
      questionVersionId: vId,
      revision: 0,
      taxonomy,
      question: {
        kind: "I",
        questionVersionId: vId,
        questionId: qId,
        title: `Câu hỏi I ${qId}`,
        content: `Nội dung câu hỏi I ${qId}`,
        options: [
          { optionId: `${vId}-opt-A`, label: "A", text: "Giá trị 1" },
          { optionId: `${vId}-opt-B`, label: "B", text: "Giá trị 2" },
          { optionId: `${vId}-opt-C`, label: "C", text: "Giá trị 3" },
          { optionId: `${vId}-opt-D`, label: "D", text: "Giá trị 4" },
        ],
        correctOptionId: `${vId}-opt-B`,
      },
    };
  } else if (kind === "II") {
    return {
      questionId: qId,
      questionVersionId: vId,
      revision: 0,
      taxonomy,
      question: {
        kind: "II",
        questionVersionId: vId,
        questionId: qId,
        title: `Câu hỏi II ${qId}`,
        content: `Nội dung câu hỏi II ${qId}`,
        statements: [
          { statementId: `${vId}-st-1`, label: "a", text: "Khẳng định 1 đúng", answer: true },
          { statementId: `${vId}-st-2`, label: "b", text: "Khẳng định 2 sai", answer: false },
          { statementId: `${vId}-st-3`, label: "c", text: "Khẳng định 3 đúng", answer: true },
          { statementId: `${vId}-st-4`, label: "d", text: "Khẳng định 4 sai", answer: false },
        ],
      },
    };
  } else {
    return {
      questionId: qId,
      questionVersionId: vId,
      revision: 0,
      taxonomy,
      question: {
        kind: "III",
        questionVersionId: vId,
        questionId: qId,
        title: `Câu hỏi III ${qId}`,
        content: `Tính tích phân ${qId}`,
        answerKey: "-0,5",
      },
    };
  }
}

// ============================================================================
// 1. HARDEN INVALID SCHEMAS & MISSING KEY CANNOT PUBLISH
// ============================================================================

test("W4 Hardening: publishDraft strictly rejects draft missing option text in Part I", async () => {
  const storage = new InMemoryStoragePort();
  const qI: WebQuestion = {
    kind: "I",
    questionVersionId: "q-bad-opt-text",
    options: [
      { optionId: "opt-1", text: "Hợp lệ" },
      { optionId: "opt-2" } as unknown as WebOption, // missing text
      { optionId: "opt-3", text: "Hợp lệ" },
      { optionId: "opt-4", text: "Hợp lệ" },
    ],
    correctOptionId: "opt-1",
  };
  const draft = createDraft({ ...createBaseExam(), questions: [qI] }, "draft-bad-opt");
  const pubRes = await publishDraft(draft, "v2.0.0", storage);
  assert.equal(pubRes.ok, false);
  if (!pubRes.ok) {
    assert.equal(pubRes.error.code, "OPTION_TEXT_INVALID");
    assert.equal(pubRes.error.path, "questions[0].options[1].text");
  }
});

test("W4 Hardening: publishDraft strictly rejects draft missing statement text in Part II", async () => {
  const storage = new InMemoryStoragePort();
  const qII: WebQuestion = {
    kind: "II",
    questionVersionId: "q-bad-st-text",
    statements: [
      { statementId: "st-1", text: "Hợp lệ", answer: true },
      { statementId: "st-2", answer: false } as unknown as WebStatement, // missing text
      { statementId: "st-3", text: "Hợp lệ", answer: true },
      { statementId: "st-4", text: "Hợp lệ", answer: false },
    ],
  };
  const draft = createDraft({ ...createBaseExam(), questions: [qII] }, "draft-bad-st");
  const pubRes = await publishDraft(draft, "v2.0.0", storage);
  assert.equal(pubRes.ok, false);
  if (!pubRes.ok) {
    assert.equal(pubRes.error.code, "STATEMENT_TEXT_INVALID");
    assert.equal(pubRes.error.path, "questions[0].statements[1].text");
  }
});

test("W4 Hardening: publishDraft rejects Part III missing key, empty string, whitespace, too long, or bad char", async () => {
  const storage = new InMemoryStoragePort();

  const cases = [
    { key: "", expectedCode: "III_KEY_INVALID" },
    { key: "   ", expectedCode: "III_KEY_INVALID" },
    { key: "12345", expectedCode: "III_KEY_INVALID" }, // >4 chars
    { key: "1.5", expectedCode: "III_KEY_INVALID" }, // dot illegal
    { key: "abc", expectedCode: "III_KEY_INVALID" }, // non-digit
  ];

  for (const c of cases) {
    const qIII: WebQuestion = {
      kind: "III",
      questionVersionId: `q-bad-key-${c.key}`,
      answerKey: c.key,
    };
    const draft = createDraft({ ...createBaseExam(), questions: [qIII] }, `draft-${c.key}`);
    const pubRes = await publishDraft(draft, "v2.0.0", storage);
    assert.equal(pubRes.ok, false, `Key "${c.key}" must be rejected`);
    if (!pubRes.ok) {
      assert.equal(pubRes.error.code, c.expectedCode);
      assert.equal(pubRes.error.path, "questions[0].answerKey");
    }
  }
});

test("W4 Hardening: publishDraft rejects invalid title, subject, grade, or schemaVersion", async () => {
  const storage = new InMemoryStoragePort();
  const qValid = createBankQuestion("q1", "v1", "I").question;

  // Empty title
  const badTitle = createDraft({ ...createBaseExam(), title: "   ", questions: [qValid] }, "d-title");
  const resTitle = await publishDraft(badTitle, "v2.0.0", storage);
  assert.equal(resTitle.ok, false);
  if (!resTitle.ok) assert.equal(resTitle.error.code, "EXAM_METADATA_INVALID");

  // Invalid grade
  const badGrade = createDraft({ ...createBaseExam(), grade: 9 as unknown as 12, questions: [qValid] }, "d-grade");
  const resGrade = await publishDraft(badGrade, "v2.0.0", storage);
  assert.equal(resGrade.ok, false);
  if (!resGrade.ok) assert.equal(resGrade.error.code, "EXAM_METADATA_INVALID");

  // Unsupported schemaVersion
  const badSchema = createDraft({ ...createBaseExam(), schemaVersion: "web-exam-v999" as unknown as "web-exam-v1", questions: [qValid] }, "d-schema");
  const resSchema = await publishDraft(badSchema, "v2.0.0", storage);
  assert.equal(resSchema.ok, false);
  if (!resSchema.ok) assert.equal(resSchema.error.code, "EXAM_SCHEMA_UNSUPPORTED");
});

// ============================================================================
// 2. MALFORMED DRAFTS & COLLISIONS
// ============================================================================

test("W4 Hardening: editDraft gracefully rejects invalid inputs with recoverable error", () => {
  const validDraft = createDraft(createBaseExam(), "draft-edit");

  // Null draft
  const resNullDraft = editDraft(null as unknown as ExamDraft, {});
  assert.equal(resNullDraft.ok, false);
  if (!resNullDraft.ok) assert.equal(resNullDraft.error.code, "DRAFT_INVALID");

  // Non-object patch
  const resBadPatch = editDraft(validDraft, "not-an-object");
  assert.equal(resBadPatch.ok, false);
  if (!resBadPatch.ok) assert.equal(resBadPatch.error.code, "DRAFT_EDIT_INVALID");

  // Unknown action
  const resUnknownAct = editDraft(validDraft, { action: "unsupported_action" });
  assert.equal(resUnknownAct.ok, false);
  if (!resUnknownAct.ok) assert.equal(resUnknownAct.error.code, "DRAFT_EDIT_INVALID");

  // Reorder out of bounds
  const resReorder = reorderQuestions(validDraft, 0, 5);
  assert.equal(resReorder.ok, false);
  if (!resReorder.ok) assert.equal(resReorder.error.code, "INDEX_OUT_OF_BOUNDS");

  // Reorder by ID length mismatch
  const resReorderId = reorderQuestionsById(validDraft, ["ghost-id"]);
  assert.equal(resReorderId.ok, false);
  if (!resReorderId.ok) assert.equal(resReorderId.error.code, "ORDER_MISMATCH");

  // Remove non-existent question
  const resRemove = removeQuestionFromDraft(validDraft, "non-existent-id");
  assert.equal(resRemove.ok, false);
  if (!resRemove.ok) assert.equal(resRemove.error.code, "QUESTION_NOT_FOUND");
});

test("W4 Hardening: resolveDraftCollisions handles duplicate versions, duplicate options, and prototype names", () => {
  // Create a draft with intentionally colliding questionVersionId and optionIds, plus prototype name
  const q1: WebQuestion = {
    kind: "I",
    questionVersionId: "collision-q-version",
    options: [
      { optionId: "toString", label: "A", text: "Lựa chọn toString" },
      { optionId: "shared-opt", label: "B", text: "Lựa chọn shared" },
      { optionId: "opt-3", label: "C", text: "Lựa chọn 3" },
      { optionId: "opt-4", label: "D", text: "Lựa chọn 4" },
    ],
    correctOptionId: "toString",
  };

  const q2: WebQuestion = {
    kind: "I",
    questionVersionId: "collision-q-version", // Duplicate versionId!
    options: [
      { optionId: "shared-opt", label: "A", text: "Trùng opt-shared" }, // Colliding optionId!
      { optionId: "opt-x", label: "B", text: "Lựa chọn x" },
      { optionId: "opt-y", label: "C", text: "Lựa chọn y" },
      { optionId: "opt-z", label: "D", text: "Lựa chọn z" },
    ],
    correctOptionId: "shared-opt",
  };

  const q3: WebQuestion = {
    kind: "II",
    questionVersionId: "collision-q-version", // Duplicate versionId!
    statements: [
      { statementId: "valueOf", text: "Ý valueOf", answer: true },
      { statementId: "st-2", text: "Ý 2", answer: false },
      { statementId: "st-3", text: "Ý 3", answer: true },
      { statementId: "st-4", text: "Ý 4", answer: false },
    ],
  };

  const collidingDraft = createDraft(
    { ...createBaseExam(), questions: [q1, q2, q3] },
    "draft-colliding",
  );

  let idCounter = 0;
  const safeIdGen = () => `resolved-${++idCounter}`;

  const resolvedDraft = resolveDraftCollisions(collidingDraft, safeIdGen);
  assert.equal(resolvedDraft.exam.questions.length, 3);

  const resQ1 = resolvedDraft.exam.questions[0]!;
  const resQ2 = resolvedDraft.exam.questions[1]!;
  const resQ3 = resolvedDraft.exam.questions[2]!;

  // All questionVersionIds must now be distinct
  const vIds = new Set([resQ1.questionVersionId, resQ2.questionVersionId, resQ3.questionVersionId]);
  assert.equal(vIds.size, 3, "All questionVersionIds must be resolved to unique values");

  // All optionIds and statementIds must now be unique
  const allOptionIds = new Set<string>();
  if (resQ1.kind === "I") resQ1.options.forEach((o) => allOptionIds.add(o.optionId));
  if (resQ2.kind === "I") resQ2.options.forEach((o) => allOptionIds.add(o.optionId));
  assert.equal(allOptionIds.size, 8, "All 8 options across Q1 and Q2 must have unique IDs");

  // CorrectOptionId mappings must be preserved
  if (resQ1.kind === "I") {
    assert.ok(resQ1.options.some((o) => o.optionId === resQ1.correctOptionId));
  }
  if (resQ2.kind === "I") {
    assert.ok(resQ2.options.some((o) => o.optionId === resQ2.correctOptionId));
  }

  // Statements mappings must be preserved
  if (resQ3.kind === "II") {
    assert.equal(resQ3.statements[0]!.answer, true);
    assert.equal(resQ3.statements[1]!.answer, false);
  }
});

// ============================================================================
// 3. QUESTION-VERSION & KEY MAPPING AFTER DUPLICATE AND SHUFFLE
// ============================================================================

test("W4 Hardening: question-version and key mapping after duplicate and deterministic shuffle", async () => {
  const storage = new InMemoryStoragePort();

  // Create an exam draft with 3 distinct questions: Part I, Part II, Part III
  const q1 = createBankQuestion("q-orig-1", "v-orig-1", "I");
  const q2 = createBankQuestion("q-orig-2", "v-orig-2", "II");
  const q3 = createBankQuestion("q-orig-3", "v-orig-3", "III");

  let draft = createDraft(createBaseExam("exam-shuffle-dup", "v1.0.0"), "draft-dup-shuffle");
  const a1 = addBankEntryToDraft(draft, q1);
  assertOk(a1);
  draft = a1.value;
  const a2 = addBankEntryToDraft(draft, q2);
  assertOk(a2);
  draft = a2.value;
  const a3 = addBankEntryToDraft(draft, q3);
  assertOk(a3);
  draft = a3.value;

  // Duplicate each of the 3 questions
  let genCount = 0;
  const genId = () => `dup-${++genCount}`;
  const dupQ1Res = duplicateQuestion(draft, "v-orig-1", genId);
  assertOk(dupQ1Res);
  draft = dupQ1Res.value;

  const dupQ2Res = duplicateQuestion(draft, "v-orig-2", genId);
  assertOk(dupQ2Res);
  draft = dupQ2Res.value;

  const dupQ3Res = duplicateQuestion(draft, "v-orig-3", genId);
  assertOk(dupQ3Res);
  draft = dupQ3Res.value;

  assert.equal(draft.exam.questions.length, 6, "Must contain 6 questions (3 original + 3 duplicated)");

  // Publish the draft
  const pubRes = await publishDraft(draft, "v2.0.0", storage);
  assertOk(pubRes);
  const publishedExam = pubRes.value;

  // Convert to domain exam and generate presentation order with shuffleQuestions=true, shuffleOptions=true
  const domainExam = toDomainExam(publishedExam);
  const orderAlpha = createPresentationOrder(
    domainExam,
    { shuffleQuestions: true, shuffleOptions: true },
    "seed-wave4-alpha",
  );

  // Verification 1: Section grouping is preserved (all Part I questions come first, then Part II, then Part III)
  assert.equal(orderAlpha.questionOrder.length, 6);
  const qMap = new Map(publishedExam.questions.map((q) => [q.questionVersionId, q]));
  const sectionKindsInOrder = orderAlpha.questionOrder.map((id) => qMap.get(id)!.kind);
  assert.deepEqual(
    sectionKindsInOrder,
    ["I", "I", "II", "II", "III", "III"],
    "Questions must remain strictly grouped by sections I -> II -> III after shuffle",
  );

  // Verification 2: Option order for original Q1 and duplicated Q1 are independent permutations
  const q1Orig = publishedExam.questions.find((q) => q.questionVersionId === "v-orig-1")!;
  const q1Dup = publishedExam.questions.find((q) => q.questionVersionId === "dup-1")!;
  assert.equal(q1Orig.kind, "I");
  assert.equal(q1Dup.kind, "I");

  // Options must be completely distinct sets of IDs
  const origOptIds = (q1Orig as Extract<WebQuestion, { kind: "I" }>).options.map((o) => o.optionId);
  const dupOptIds = (q1Dup as Extract<WebQuestion, { kind: "I" }>).options.map((o) => o.optionId);
  for (const id of origOptIds) {
    assert.equal(dupOptIds.includes(id), false, "Duplicated option IDs must not collide with original");
  }

  // Verification 3: Score Attempt with ALL correct responses
  // N1 = 2, maxI = 2 * 0.25 = 0.5 (1/2)
  // N2 = 2, maxII = 2 * 1 = 2 (2/1)
  // N3 = 2, BASE = 2.5 < 10, POINT_III = (10 - 2.5) / 2 = 7.5 / 2 = 3.75 (15/4)
  // MAX_III = 2 * 3.75 = 7.5 (15/2)
  // MAX_TOTAL = 0.5 + 2 + 7.5 = 10 (10/1)
  const q2Orig = publishedExam.questions.find((q) => q.questionVersionId === "v-orig-2")! as Extract<WebQuestion, { kind: "II" }>;
  const q2Dup = publishedExam.questions.find((q) => q.questionVersionId === "dup-6")! as Extract<WebQuestion, { kind: "II" }>;
  const q3Orig = publishedExam.questions.find((q) => q.questionVersionId === "v-orig-3")! as Extract<WebQuestion, { kind: "III" }>;
  const q3Dup = publishedExam.questions.find((q) => q.questionVersionId === "dup-11")! as Extract<WebQuestion, { kind: "III" }>;

  const correctResponses: Response[] = [
    { kind: "I", questionVersionId: q1Orig.questionVersionId, selectedOptionId: (q1Orig as any).correctOptionId },
    { kind: "I", questionVersionId: q1Dup.questionVersionId, selectedOptionId: (q1Dup as any).correctOptionId },
    {
      kind: "II",
      questionVersionId: q2Orig.questionVersionId,
      answers: q2Orig.statements.map((s) => ({ statementId: s.statementId, value: s.answer })),
    },
    {
      kind: "II",
      questionVersionId: q2Dup.questionVersionId,
      answers: q2Dup.statements.map((s) => ({ statementId: s.statementId, value: s.answer })),
    },
    { kind: "III", questionVersionId: q3Orig.questionVersionId, raw: q3Orig.answerKey },
    { kind: "III", questionVersionId: q3Dup.questionVersionId, raw: q3Dup.answerKey },
  ];

  const attempt1Responses: AttemptResponses = {
    attemptId: "att-all-correct",
    examVersionId: publishedExam.examVersionId,
    responses: correctResponses,
  };

  const scoreRes1 = scoreAttempt(domainExam, attempt1Responses);
  assert.equal(toFractionString(scoreRes1.total), "10", "Total score must be exactly 10/10");
  assert.equal(toFractionString(scoreRes1.maxTotal), "10");
  assert.equal(toFractionString(scoreRes1.sections.I.score), "1/2");
  assert.equal(toFractionString(scoreRes1.sections.II.score), "2");
  assert.equal(toFractionString(scoreRes1.sections.III.score), "15/2");

  // Verification 4: Cross-contamination isolation
  // Answer original Q1 correctly, but answer duplicated Q1 INCORRECTLY!
  const wrongOptIdForDup = (q1Dup as any).options.find((o: WebOption) => o.optionId !== (q1Dup as any).correctOptionId)!.optionId;
  const mixedResponses: Response[] = [
    { kind: "I", questionVersionId: q1Orig.questionVersionId, selectedOptionId: (q1Orig as any).correctOptionId }, // correct (0.25)
    { kind: "I", questionVersionId: q1Dup.questionVersionId, selectedOptionId: wrongOptIdForDup }, // WRONG (0)
    ...correctResponses.slice(2),
  ];

  const scoreRes2 = scoreAttempt(domainExam, {
    attemptId: "att-mixed",
    examVersionId: publishedExam.examVersionId,
    responses: mixedResponses,
  });

  // Expected score: 10 - 0.25 = 9.75 = 39/4
  assert.equal(toFractionString(scoreRes2.total), "39/4");
  assert.equal(toFractionString(scoreRes2.sections.I.score), "1/4"); // Only original Q1 scored
  const qMap1 = new Map(scoreRes2.questions.map((q) => [q.questionVersionId, q]));
  assert.equal(qMap1.get(q1Orig.questionVersionId)?.status, "full");
  assert.equal(qMap1.get(q1Dup.questionVersionId)?.status, "wrong");
});

// ============================================================================
// 4. CONCURRENT BANK EDITS VS PUBLICATION
// ============================================================================

test("W4 Hardening: concurrent bank edits/deletions during draft composition do not alter published exam", async () => {
  const storage = new InMemoryStoragePort();

  // 1. Initial bank question
  const b1 = createBankQuestion("q-concurrent-1", "v-concurrent-1", "I");
  const saveB1 = await saveBankEntry(b1, null, storage);
  assertOk(saveB1);

  // 2. Teacher adds b1 to draft
  const draft = createDraft(createBaseExam("exam-concurrent-1", "v0.9.0"), "draft-concurrent");
  const draftWithB1 = addBankEntryToDraft(draft, saveB1.value);
  assertOk(draftWithB1);

  // 3. Concurrently, someone edits b1 in the bank to new revision 2
  const editedB1: BankEntry = {
    ...saveB1.value,
    question: {
      ...saveB1.value.question,
      title: "TIÊU ĐỀ ĐÃ BỊ SỬA TRONG BANK BỞI NGƯỜI KHÁC",
      content: "NỘI DUNG MỚI TRONG BANK",
    },
  };
  const updateB1 = await saveBankEntry(editedB1, 1, storage);
  assertOk(updateB1);
  assert.equal(updateB1.value.revision, 2);

  // 4. Concurrently, someone deletes b1 from bank
  const deleteB1 = await deleteBankEntryConfirmed("v-concurrent-1", 2, storage, { confirmed: true });
  assertOk(deleteB1);

  // 5. Teacher publishes draft to "v1.0.0"
  const pubRes = await publishDraft(draftWithB1.value, "v1.0.0", storage);
  assertOk(pubRes);
  const publishedExam = pubRes.value;

  // 6. Verify published exam has original Q1 data intact
  assert.equal(publishedExam.questions[0]!.title, "Câu hỏi I q-concurrent-1", "Published title must remain original");
  assert.equal(publishedExam.questions[0]!.content, "Nội dung câu hỏi I q-concurrent-1", "Published content must remain original");

  // 7. Verify bank store no longer contains v-concurrent-1
  const bankCheck = await storage.getObject("bank", "v-concurrent-1");
  assertOk(bankCheck);
  assert.equal(bankCheck.value, null, "Bank entry was deleted");

  // 8. Verify published exam in storage is intact
  const examCheck = await storage.getObject("exams", "exam-concurrent-1:v1.0.0");
  assertOk(examCheck);
  assert.ok(examCheck.value !== null);
  const loadedExam = examCheck.value as WebExam;
  assert.equal(loadedExam.questions[0]!.title, "Câu hỏi I q-concurrent-1");
});

test("W4 Hardening: concurrent publishDraft calls with identical versionId reject duplicate without corruption", async () => {
  const storage = new InMemoryStoragePort();
  const q1 = createBankQuestion("q-race-1", "v-race-1", "I").question;
  const draft = createDraft({ ...createBaseExam("exam-race", "v0.9.0"), questions: [q1] }, "draft-race");

  // Call publishDraft twice concurrently with the SAME target version "v1.0.0"
  const [resA, resB] = await Promise.all([
    publishDraft(draft, "v1.0.0", storage),
    publishDraft(draft, "v1.0.0", storage),
  ]);

  // Exactly one must succeed, the other must fail with conflict/exists
  const successCount = (resA.ok ? 1 : 0) + (resB.ok ? 1 : 0);
  assert.equal(successCount, 1, "Exactly one concurrent publication must succeed");

  const failedRes = !resA.ok ? resA : resB;
  assert.equal(failedRes.ok, false);
  if (!failedRes.ok) {
    assert.ok(
      failedRes.error.code === "EXAM_VERSION_EXISTS" || failedRes.error.code === "STORAGE_CONFLICT",
      `Expected EXAM_VERSION_EXISTS or STORAGE_CONFLICT, got: ${failedRes.error.code}`,
    );
  }

  // Published exam remains valid in storage
  const examCheck = await storage.getObject("exams", "exam-race:v1.0.0");
  assertOk(examCheck);
  assert.ok(examCheck.value !== null);
  const exam = examCheck.value as WebExam;
  assert.equal(exam.examVersionId, "v1.0.0");
});

// ============================================================================
// 5. HISTORICAL RESULT ISOLATION
// ============================================================================

test("W4 Hardening: historical finalized and draft attempts are completely isolated from subsequent exam/bank changes", async () => {
  const storage = new InMemoryStoragePort();

  // 1. Create and publish initial exam v1.0.0 with 1 Part I question
  const q1 = createBankQuestion("q-hist-1", "v-hist-1", "I");
  const saveQ1 = await saveBankEntry(q1, null, storage);
  assertOk(saveQ1);

  const draftV1 = createDraft(createBaseExam("exam-hist", "v0.9.0"), "draft-hist-1");
  const draft1WithQ1 = addBankEntryToDraft(draftV1, saveQ1.value);
  assertOk(draft1WithQ1);

  const pubV1 = await publishDraft(draft1WithQ1.value, "v1.0.0", storage);
  assertOk(pubV1);
  const examV1 = pubV1.value;

  // 2. Student completes an attempt on v1.0.0
  const studentResponses: AttemptResponses = {
    attemptId: "att-student-hist-1",
    examVersionId: "v1.0.0",
    responses: [
      { kind: "I", questionVersionId: "v-hist-1", selectedOptionId: (examV1.questions[0] as any).correctOptionId },
    ],
  };
  const scoreV1 = scoreAttempt(toDomainExam(examV1), studentResponses);

  const finalAttemptRecord: AttemptRecord = {
    schemaVersion: "web-attempt-v1",
    examId: examV1.examId,
    examVersionId: examV1.examVersionId,
    attemptId: "att-student-hist-1",
    revision: 1,
    candidateName: "Nguyễn Văn A (Lịch sử)",
    examSnapshot: examV1,
    presentationOrder: { seed: "seed-1", questionOrder: ["v-hist-1"], optionOrder: [] },
    responses: studentResponses,
    startedAt: 1700000000000,
    deadline: 1700003000000,
    phase: "final",
    submittedAt: 1700001500000,
    scoreDTO: {
      totalScore: toFractionString(scoreV1.total),
      maxScore: toFractionString(scoreV1.maxTotal),
    },
  };
  await storage.create(finalAttemptRecord);

  // 3. Subversive changes happen:
  // a) Bank question is edited to have a different correctOptionId
  const bankMutated: BankEntry = {
    ...saveQ1.value,
    question: {
      ...saveQ1.value.question,
      options: [
        { optionId: "v-hist-1-opt-A", text: "Giá trị 1" },
        { optionId: "v-hist-1-opt-B", text: "Giá trị 2" },
        { optionId: "v-hist-1-opt-C", text: "Giá trị 3" },
        { optionId: "v-hist-1-opt-D", text: "Giá trị 4" },
      ],
      correctOptionId: "v-hist-1-opt-D", // Switched from opt-B to opt-D!
    } as any,
  };
  await saveBankEntry(bankMutated, 1, storage);

  // b) Teacher creates new version v2.0.0 with 20 questions and different settings
  const draftV2 = createDraft({ ...examV1, examVersionId: "v2.0.0", title: "Đề v2 thay đổi hoàn toàn" }, "draft-v2");
  await publishDraft(draftV2, "v2.0.0", storage);

  // c) Teacher rolls back v1.0.0 from published exams store
  await rollbackPublishedExam("exam-hist", "v1.0.0", storage);

  // 4. Verification: Historical attempt loaded from storage is 100% immune
  const loadedAttemptRes = await storage.load({
    examId: "exam-hist",
    examVersionId: "v1.0.0",
    attemptId: "att-student-hist-1",
  });
  assertOk(loadedAttemptRes);
  assert.ok(loadedAttemptRes.value !== null);

  const hist = loadedAttemptRes.value;
  assert.equal(hist.candidateName, "Nguyễn Văn A (Lịch sử)");
  assert.equal(hist.phase, "final");
  assert.deepEqual(hist.scoreDTO, { totalScore: "1/4", maxScore: "1/4" });

  // Re-scoring against historical snapshot gives the EXACT original score, unaffected by bank mutation!
  const rescore = scoreAttempt(toDomainExam(hist.examSnapshot), hist.responses);
  assert.equal(toFractionString(rescore.total), "1/4");
  assert.equal(toFractionString(rescore.maxTotal), "1/4");
  const qResMap = new Map(rescore.questions.map((q) => [q.questionVersionId, q]));
  assert.equal(qResMap.get("v-hist-1")?.status, "full");
});

// ============================================================================
// 6. AC: NO FORCED TEN-POINT SCALE
// ============================================================================

test("W4 Hardening: AC - no forced ten-point scale across all custom configurations", () => {
  // Case 1: N1=20, N2=10, N3=0 -> MAX_TOTAL = 15
  const max1 = computeExamMax({ n1: 20, n2: 10, n3: 0 });
  assert.equal(toFractionString(max1.maxTotal), "15");
  assert.equal(toFractionString(max1.maxI), "5");
  assert.equal(toFractionString(max1.maxII), "10");
  assert.equal(toFractionString(max1.maxIII), "0");

  // Case 2: N1=20, N2=10, N3=4 -> BASE = 15 >= 10 -> POINT_III = 0.25 (1/4), MAX_TOTAL = 16
  const max2 = computeExamMax({ n1: 20, n2: 10, n3: 4 });
  assert.equal(toFractionString(max2.maxTotal), "16");
  assert.equal(toFractionString(max2.pointIII), "1/4");
  assert.equal(toFractionString(max2.maxIII), "1");

  // Case 3: N1=20, N2=0, N3=0 (Part I only) -> MAX_TOTAL = 5
  const max3 = computeExamMax({ n1: 20, n2: 0, n3: 0 });
  assert.equal(toFractionString(max3.maxTotal), "5");
  assert.equal(toFractionString(max3.maxI), "5");

  // Case 4: N1=0, N2=0, N3=3 (Part III only, 3 questions) -> POINT_III = 10/3, MAX_TOTAL = 10
  const max4 = computeExamMax({ n1: 0, n2: 0, n3: 3 });
  assert.equal(toFractionString(max4.maxTotal), "10");
  assert.equal(toFractionString(max4.pointIII), "10/3");
  assert.equal(toFractionString(max4.maxIII), "10");

  // Case 5: Empty exam
  const emptyDraft = createDraft(createBaseExam("e-empty", "v0"), "d-empty");
  const draftMax = computeDraftMax(emptyDraft);
  assert.equal(toFractionString(draftMax.maxTotal), "0");
});
