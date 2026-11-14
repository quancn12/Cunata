import test from "node:test";
import assert from "node:assert/strict";

import {
  createDraft,
  editDraft,
  publishDraft,
  computeDraftMax,
  toggleSection,
  duplicateQuestion,
  addQuestionToDraft,
  removeQuestionFromDraft,
  addBankEntryToDraft,
  createBankEntryFromQuestion,
  saveQuestionToBank,
  rollbackPublishedExam,
  resolveDraftCollisions,
} from "../../../src/teacher/index.ts";
import type {
  ExamDraft,
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  Taxonomy,
  StoragePort,
  AttemptRecord,
  Result,
} from "../../../src/teacher/types.ts";

import {
  mount,
  TeacherController,
  createDefaultWebExam,
} from "../../../src/teacher/view.ts";

import {
  saveBankEntry,
  deleteBankEntry,
  createNewVersion,
  queryBank,
} from "../../../src/bank/index.ts";
import type { BankEntry } from "../../../src/bank/types.ts";
import {
  exportBankTransferJson,
  parseBankTransfer,
  importBankTransfer,
  deleteBankEntryConfirmed,
} from "../../../src/bank/transfer.ts";

import {
  toFractionString,
  rational,
} from "../../../src/domain/index.ts";
import type { Validated } from "../../../src/domain/index.ts";

import { exportExam, parseExam } from "../../../src/schema/index.ts";
import { InMemoryStoragePort } from "../../bank/core/testStorage.ts";
import { createTestDocument } from "../view/dom-helper.ts";

function assertOk<T>(res: Result<T>, msg?: string): asserts res is { readonly ok: true; readonly value: T } {
  assert.equal(res.ok, true, msg ?? (!res.ok ? JSON.stringify((res as any).error) : undefined));
}

function assertValidated<T>(res: Validated<T>, msg?: string): asserts res is { readonly ok: true; readonly value: T } {
  assert.equal(res.ok, true, msg ?? (!res.ok ? JSON.stringify((res as any).issues) : undefined));
}

// ============================================================================
// Fixtures & Helpers
// ============================================================================

function createBankQuestion(
  qId: string,
  vId: string,
  kind: "I" | "II" | "III" = "I",
): BankEntry {
  const tax: Taxonomy = {
    subject: "Toán học",
    grade: 12,
    topic: "Hàm số",
    lesson: "Khảo sát hàm số",
    difficulty: "Nhận biết",
  };

  if (kind === "I") {
    return {
      questionId: qId,
      questionVersionId: vId,
      revision: 0,
      taxonomy: tax,
      question: {
        kind: "I",
        questionVersionId: vId,
        questionId: qId,
        title: `Câu hỏi ${qId}`,
        content: `Nội dung câu hỏi ${qId}`,
        options: [
          { optionId: `${vId}-opt-A`, label: "A", text: "Đáp án A" },
          { optionId: `${vId}-opt-B`, label: "B", text: "Đáp án B" },
          { optionId: `${vId}-opt-C`, label: "C", text: "Đáp án C" },
          { optionId: `${vId}-opt-D`, label: "D", text: "Đáp án D" },
        ],
        correctOptionId: `${vId}-opt-A`,
      },
    };
  } else if (kind === "II") {
    return {
      questionId: qId,
      questionVersionId: vId,
      revision: 0,
      taxonomy: tax,
      question: {
        kind: "II",
        questionVersionId: vId,
        questionId: qId,
        title: `Câu hỏi Đúng/Sai ${qId}`,
        content: `Nội dung phát biểu ${qId}`,
        statements: [
          { statementId: `${vId}-st-1`, label: "a", text: "Ý 1", answer: true },
          { statementId: `${vId}-st-2`, label: "b", text: "Ý 2", answer: false },
          { statementId: `${vId}-st-3`, label: "c", text: "Ý 3", answer: true },
          { statementId: `${vId}-st-4`, label: "d", text: "Ý 4", answer: false },
        ],
      },
    };
  } else {
    return {
      questionId: qId,
      questionVersionId: vId,
      revision: 0,
      taxonomy: tax,
      question: {
        kind: "III",
        questionVersionId: vId,
        questionId: qId,
        title: `Câu hỏi trả lời ngắn ${qId}`,
        content: `Tính giá trị ${qId}`,
        answerKey: "1,5",
      },
    };
  }
}

function createBaseExam(id: string = "exam-int-1", vId: string = "v1.0.0"): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: id,
    examVersionId: vId,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    title: "Đề thi tích hợp thử nghiệm",
    subject: "Toán học",
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions: [],
    assets: [],
  };
}

class FaultyStoragePort extends InMemoryStoragePort {
  override async putObject(): Promise<Result<number>> {
    return {
      ok: false,
      error: { code: "STORAGE_FAILED", path: "exams", message: "Disk full simulation", recoverable: true },
    };
  }
}

// ============================================================================
// Suite 1: Callbacks and Ports Connection between Teacher and Bank
// ============================================================================

test("Teacher-Bank Integration: controller.openBank triggers onOpenBank and onSelectFromBank", () => {
  let openBankCalled = false;
  let selectFromBankCalled = false;

  const controller = new TeacherController({
    actions: {
      onOpenBank: () => {
        openBankCalled = true;
      },
      onSelectFromBank: () => {
        selectFromBankCalled = true;
      },
    },
  });

  controller.openBank();
  assert.equal(openBankCalled, true);
  assert.equal(selectFromBankCalled, true);
});

test("Teacher-Bank Integration: controller.addFromBank reuses question from bank into draft", () => {
  let draftChangeNotification: ExamDraft | undefined;
  let addFromBankNotification: BankEntry | undefined;

  const initialExam = createBaseExam();
  const controller = new TeacherController({
    initialExam,
    actions: {
      onDraftChange: (d) => {
        draftChangeNotification = d;
      },
      onAddFromBank: (entry) => {
        addFromBankNotification = entry;
      },
    },
  });

  const bankEntry = createBankQuestion("q-bank-01", "q-bank-01-v1", "I");
  const res = controller.addFromBank(bankEntry);

  assertOk(res);
  assert.equal(controller.getDraft().exam.questions.length, 1);
  assert.equal(controller.getDraft().exam.questions[0]!.questionVersionId, "q-bank-01-v1");
  assert.equal(controller.getSelectedQuestionId(), "q-bank-01-v1");

  assert.ok(draftChangeNotification);
  const dNotif: ExamDraft = draftChangeNotification;
  assert.equal(dNotif.exam.questions.length, 1);
  assert.ok(addFromBankNotification);
  const aNotif: BankEntry = addFromBankNotification;
  assert.equal(aNotif.questionId, "q-bank-01");
});

test("Teacher-Bank Integration: editDraft with action 'add_from_bank' successfully integrates bank entry", () => {
  const draft = createDraft(createBaseExam(), "draft-edit-bank");
  const bankEntry = createBankQuestion("q-bank-02", "q-bank-02-v1", "II");

  const res = editDraft(draft, {
    action: "add_from_bank",
    entry: bankEntry,
  });

  assertOk(res);
  assert.equal(res.value.exam.questions.length, 1);
  assert.equal(res.value.exam.questions[0]!.kind, "II");
  assert.equal(res.value.exam.questions[0]!.questionVersionId, "q-bank-02-v1");
});

test("Teacher-Bank Integration: controller.saveQuestionToBank saves drafted question to bank storage", async () => {
  const storage = new InMemoryStoragePort();
  let savedNotification: BankEntry | undefined;

  const baseExam = createBaseExam();
  const qBank = createBankQuestion("q-initial", "q-initial-v1", "I").question;
  const examWithQ: WebExam = {
    ...baseExam,
    questions: [qBank],
  };

  const controller = new TeacherController({
    initialExam: examWithQ,
    storage,
    actions: {
      onSaveToBank: (entry) => {
        savedNotification = entry;
      },
    },
  });

  const res = await controller.saveQuestionToBank("q-initial-v1", {
    topic: "Chủ đề tích hợp",
    lesson: "Bài học mới",
  });

  assertOk(res);
  assert.equal(res.value.questionVersionId, "q-initial-v1");
  assert.equal(res.value.taxonomy.topic, "Chủ đề tích hợp");
  assert.equal(res.value.taxonomy.lesson, "Bài học mới");

  // Verify stored in storage
  const loaded = await storage.getObject("bank", "q-initial-v1");
  assertOk(loaded);
  assert.ok(loaded.value !== null);
  const stored = loaded.value as BankEntry;
  assert.equal(stored.questionId, "q-initial");
  assert.ok(savedNotification);
});

test("Teacher-Bank Integration: DOM UI mounts '#btn-open-bank' and '#btn-save-bank-${qId}' buttons", async () => {
  const storage = new InMemoryStoragePort();
  const doc = createTestDocument();
  const root = doc.createElement("div");
  doc.body.appendChild(root);

  let openBankTriggered = false;
  const initialExam = createBaseExam();
  const q1 = createBankQuestion("q-ui-1", "q-ui-1-v1", "I").question;
  const examWithQ: WebExam = {
    ...initialExam,
    questions: [q1],
  };

  const unmount = mount(
    root as unknown as HTMLElement,
    { draft: createDraft(examWithQ, "draft-ui"), storage },
    {
      onOpenBank: () => {
        openBankTriggered = true;
      },
    },
  );

  const btnOpenBank = root.querySelector<any>("#btn-open-bank");
  assert.ok(btnOpenBank, "Button '#btn-open-bank' must be rendered in DOM");
  btnOpenBank.onclick();
  assert.equal(openBankTriggered, true);

  const btnSaveBank = root.querySelector<any>("#btn-save-bank-q-ui-1-v1");
  assert.ok(btnSaveBank, "Button '#btn-save-bank-q-ui-1-v1' must be rendered in DOM");
  await btnSaveBank.onclick();

  // Verify saved into storage bank store
  const stored = await storage.getObject("bank", "q-ui-1-v1");
  assertOk(stored);
  assert.ok(stored.value !== null);

  unmount();
});

// ============================================================================
// Suite 2: Option and Key Collision Handling
// ============================================================================

test("Option/Key Collisions: adding bank question with colliding optionId remaps options and correctOptionId", () => {
  const existingQ: WebQuestion = {
    kind: "I",
    questionVersionId: "q-existing-v1",
    title: "Câu hỏi có sẵn",
    content: "Nội dung",
    options: [
      { optionId: "opt-dup", label: "A", text: "Lựa chọn 1" },
      { optionId: "opt-2", label: "B", text: "Lựa chọn 2" },
      { optionId: "opt-3", label: "C", text: "Lựa chọn 3" },
      { optionId: "opt-4", label: "D", text: "Lựa chọn 4" },
    ],
    correctOptionId: "opt-dup",
  };

  const draft = createDraft({ ...createBaseExam(), questions: [existingQ] }, "draft-col-1");

  const bankEntry: BankEntry = {
    questionId: "q-bank-col",
    questionVersionId: "q-bank-col-v1",
    revision: 0,
    taxonomy: { subject: "Toán", grade: 12, topic: "T1", lesson: "L1", difficulty: "Nhận biết" },
    question: {
      kind: "I",
      questionVersionId: "q-bank-col-v1",
      title: "Câu từ ngân hàng có option trùng",
      content: "Nội dung ngân hàng",
      options: [
        { optionId: "opt-dup", label: "A", text: "Trùng ID với câu 1" },
        { optionId: "opt-b2", label: "B", text: "Khác" },
        { optionId: "opt-b3", label: "C", text: "Khác" },
        { optionId: "opt-b4", label: "D", text: "Khác" },
      ],
      correctOptionId: "opt-dup",
    },
  };

  let idCounter = 100;
  const idGen = () => `remap-${++idCounter}`;

  const res = addBankEntryToDraft(draft, bankEntry, idGen);
  assertOk(res);
  const questions = res.value.exam.questions;
  assert.equal(questions.length, 2);

  const addedQ = questions[1] as Extract<WebQuestion, { kind: "I" }>;
  assert.ok(addedQ);

  const addedOptIds = addedQ.options.map((o) => o.optionId);
  assert.equal(addedOptIds.includes("opt-dup"), false, "opt-dup must have been remapped");
  assert.equal(addedQ.correctOptionId, addedOptIds[0], "correctOptionId must match remapped optionId");
});

test("Option/Key Collisions: adding bank question with duplicate versionId remaps version and options", () => {
  const existingQ: WebQuestion = {
    kind: "I",
    questionVersionId: "q-shared-v1",
    title: "Câu đã có",
    content: "Nội dung",
    options: [
      { optionId: "opt-1", text: "1" },
      { optionId: "opt-2", text: "2" },
      { optionId: "opt-3", text: "3" },
      { optionId: "opt-4", text: "4" },
    ],
    correctOptionId: "opt-1",
  };

  const draft = createDraft({ ...createBaseExam(), questions: [existingQ] }, "draft-col-2");
  const bankEntry = createBankQuestion("q-shared", "q-shared-v1", "I");

  let idCounter = 200;
  const idGen = () => `safe-id-${++idCounter}`;

  const res = addBankEntryToDraft(draft, bankEntry, idGen);
  assertOk(res);
  const qs = res.value.exam.questions;
  assert.equal(qs.length, 2);
  assert.notEqual(qs[0]!.questionVersionId, qs[1]!.questionVersionId);
  assert.equal(qs[1]!.questionVersionId, "safe-id-201");
});

test("Option/Key Collisions: prototype property names in option IDs are safely handled", () => {
  const bankEntry: BankEntry = {
    questionId: "q-proto",
    questionVersionId: "q-proto-v1",
    revision: 0,
    taxonomy: { subject: "Toán", grade: 12, topic: "T", lesson: "L", difficulty: "Nhận biết" },
    question: {
      kind: "I",
      questionVersionId: "q-proto-v1",
      title: "Proto test",
      content: "Nội dung",
      options: [
        { optionId: "toString", label: "A", text: "Proto toString" },
        { optionId: "valueOf", label: "B", text: "Proto valueOf" },
        { optionId: "constructor", label: "C", text: "Proto constructor" },
        { optionId: "__proto__", label: "D", text: "Proto __proto__" },
      ],
      correctOptionId: "toString",
    },
  };

  const draft = createDraft(createBaseExam(), "draft-proto");
  let counter = 0;
  const res = addBankEntryToDraft(draft, bankEntry, () => `id-${++counter}`);
  assertOk(res);
  const q = res.value.exam.questions[0] as Extract<WebQuestion, { kind: "I" }>;
  assert.equal(q.options.length, 4);
  assert.equal(q.correctOptionId, "toString");
});

test("Option/Key Collisions: duplicateQuestion Part I remaps version, options, and correctOptionId", () => {
  const q1: WebQuestion = {
    kind: "I",
    questionVersionId: "q-orig-v1",
    title: "Gốc",
    content: "Nội dung",
    options: [
      { optionId: "opt-a", label: "A", text: "A" },
      { optionId: "opt-b", label: "B", text: "B" },
      { optionId: "opt-c", label: "C", text: "C" },
      { optionId: "opt-d", label: "D", text: "D" },
    ],
    correctOptionId: "opt-c",
  };

  const draft = createDraft({ ...createBaseExam(), questions: [q1] }, "draft-dup-1");
  let genCount = 0;
  const res = duplicateQuestion(draft, "q-orig-v1", () => `dup-${++genCount}`);

  assertOk(res);
  const qs = res.value.exam.questions;
  assert.equal(qs.length, 2);

  const dupQ = qs[1] as Extract<WebQuestion, { kind: "I" }>;
  assert.equal(dupQ.questionVersionId, "dup-1");
  assert.equal(dupQ.options[0]!.optionId, "dup-2");
  assert.equal(dupQ.options[1]!.optionId, "dup-3");
  assert.equal(dupQ.options[2]!.optionId, "dup-4");
  assert.equal(dupQ.options[3]!.optionId, "dup-5");
  assert.equal(dupQ.correctOptionId, "dup-4");
});

test("Option/Key Collisions: duplicateQuestion Part II and III preserves boolean answers and raw key", () => {
  const qII: WebQuestion = createBankQuestion("q-ii", "q-ii-v1", "II").question;
  const qIII: WebQuestion = createBankQuestion("q-iii", "q-iii-v1", "III").question;

  let draft = createDraft({ ...createBaseExam(), questions: [qII, qIII] }, "draft-dup-2");
  const dupIIRes = duplicateQuestion(draft, "q-ii-v1", () => "dup-ii");
  assertOk(dupIIRes);
  draft = dupIIRes.value;

  const dupIIIRes = duplicateQuestion(draft, "q-iii-v1", () => "dup-iii");
  assertOk(dupIIIRes);
  draft = dupIIIRes.value;

  const qs = draft.exam.questions;
  assert.equal(qs.length, 4);

  const dupII = qs.find((q) => q.questionVersionId === "dup-ii") as Extract<WebQuestion, { kind: "II" }>;
  assert.ok(dupII);
  assert.equal(dupII.statements[0]!.answer, true);
  assert.equal(dupII.statements[1]!.answer, false);
  assert.equal(dupII.statements[2]!.answer, true);
  assert.equal(dupII.statements[3]!.answer, false);

  const dupIII = qs.find((q) => q.questionVersionId === "dup-iii") as Extract<WebQuestion, { kind: "III" }>;
  assert.ok(dupIII);
  assert.equal(dupIII.answerKey, "1,5");
});

test("Option/Key Collisions: resolveDraftCollisions eliminates all duplicate IDs across whole draft", () => {
  const draft: ExamDraft = {
    draftId: "draft-dirty",
    revision: 1,
    exam: {
      ...createBaseExam(),
      questions: [
        {
          kind: "I",
          questionVersionId: "q-same",
          options: [
            { optionId: "opt-same", text: "A" },
            { optionId: "opt-2", text: "B" },
            { optionId: "opt-3", text: "C" },
            { optionId: "opt-4", text: "D" },
          ],
          correctOptionId: "opt-same",
        },
        {
          kind: "I",
          questionVersionId: "q-same",
          options: [
            { optionId: "opt-same", text: "A2" },
            { optionId: "opt-6", text: "B2" },
            { optionId: "opt-7", text: "C2" },
            { optionId: "opt-8", text: "D2" },
          ],
          correctOptionId: "opt-same",
        },
      ],
    },
  };

  let counter = 0;
  const clean = resolveDraftCollisions(draft, () => `clean-${++counter}`);
  const qs = clean.exam.questions;

  assert.equal(qs.length, 2);
  assert.notEqual(qs[0]!.questionVersionId, qs[1]!.questionVersionId);

  const allOpts = [
    ...(qs[0] as Extract<WebQuestion, { kind: "I" }>).options.map((o) => o.optionId),
    ...(qs[1] as Extract<WebQuestion, { kind: "I" }>).options.map((o) => o.optionId),
  ];
  const uniqueOpts = new Set(allOpts);
  assert.equal(uniqueOpts.size, 8, "All 8 optionIds across the two questions must be unique");
});

// ============================================================================
// Suite 3: Section Toggles and Domain ComputeExamMax Maxima Calculation
// ============================================================================

test("Section Toggles & Maxima: independent domain score calculations", () => {
  const emptyDraft = createDraft(createBaseExam(), "draft-empty");
  const emptyMax = computeDraftMax(emptyDraft);
  assert.equal(toFractionString(emptyMax.maxTotal), "0");

  const qIs: WebQuestion[] = Array.from({ length: 20 }, (_, i) =>
    createBankQuestion(`q-i-${i}`, `v-i-${i}`, "I").question,
  );
  const onlyIDraft = createDraft({ ...createBaseExam(), questions: qIs }, "draft-only-I");
  const maxI = computeDraftMax(onlyIDraft);
  assert.equal(toFractionString(maxI.maxI), "5");
  assert.equal(toFractionString(maxI.maxII), "0");
  assert.equal(toFractionString(maxI.maxIII), "0");
  assert.equal(toFractionString(maxI.maxTotal), "5");

  const qIIs: WebQuestion[] = Array.from({ length: 4 }, (_, i) =>
    createBankQuestion(`q-ii-${i}`, `v-ii-${i}`, "II").question,
  );
  const onlyIIDraft = createDraft({ ...createBaseExam(), questions: qIIs }, "draft-only-II");
  const maxII = computeDraftMax(onlyIIDraft);
  assert.equal(toFractionString(maxII.maxI), "0");
  assert.equal(toFractionString(maxII.maxII), "4");
  assert.equal(toFractionString(maxII.maxTotal), "4");

  const qIIIs: WebQuestion[] = Array.from({ length: 3 }, (_, i) =>
    createBankQuestion(`q-iii-${i}`, `v-iii-${i}`, "III").question,
  );
  const onlyIIIDraft = createDraft({ ...createBaseExam(), questions: qIIIs }, "draft-only-III");
  const maxIII = computeDraftMax(onlyIIIDraft);
  assert.equal(toFractionString(maxIII.pointIII), "10/3");
  assert.equal(toFractionString(maxIII.maxTotal), "10");

  const qIIs10: WebQuestion[] = Array.from({ length: 10 }, (_, i) =>
    createBankQuestion(`q-ii-10-${i}`, `v-ii-10-${i}`, "II").question,
  );
  const max15Draft = createDraft({ ...createBaseExam(), questions: [...qIs, ...qIIs10] }, "draft-max15");
  const max15 = computeDraftMax(max15Draft);
  assert.equal(toFractionString(max15.maxTotal), "15");

  const qIIIs4: WebQuestion[] = Array.from({ length: 4 }, (_, i) =>
    createBankQuestion(`q-iii-4-${i}`, `v-iii-4-${i}`, "III").question,
  );
  const max16Draft = createDraft(
    { ...createBaseExam(), questions: [...qIs, ...qIIs10, ...qIIIs4] },
    "draft-max16",
  );
  const max16 = computeDraftMax(max16Draft);
  assert.equal(toFractionString(max16.pointIII), "1/4");
  assert.equal(toFractionString(max16.maxIII), "1");
  assert.equal(toFractionString(max16.maxTotal), "16");
});

test("Section Toggles & Maxima: toggling section removes questions and updates maxima dynamically", () => {
  const qIs: WebQuestion[] = Array.from({ length: 20 }, (_, i) =>
    createBankQuestion(`q-i-${i}`, `v-i-${i}`, "I").question,
  );
  const qIIs: WebQuestion[] = Array.from({ length: 10 }, (_, i) =>
    createBankQuestion(`q-ii-${i}`, `v-ii-${i}`, "II").question,
  );
  const qIIIs: WebQuestion[] = Array.from({ length: 4 }, (_, i) =>
    createBankQuestion(`q-iii-${i}`, `v-iii-${i}`, "III").question,
  );

  let draft = createDraft(
    { ...createBaseExam(), questions: [...qIs, ...qIIs, ...qIIIs] },
    "draft-toggle",
  );
  assert.equal(toFractionString(computeDraftMax(draft).maxTotal), "16");

  const t1 = toggleSection(draft, "III", false);
  assertOk(t1);
  draft = t1.value;
  assert.equal(draft.exam.questions.length, 30);
  assert.equal(toFractionString(computeDraftMax(draft).maxTotal), "15");

  const t2 = toggleSection(draft, "II", false);
  assertOk(t2);
  draft = t2.value;
  assert.equal(draft.exam.questions.length, 20);
  assert.equal(toFractionString(computeDraftMax(draft).maxTotal), "5");
});

// ============================================================================
// Suite 4: Explicit Confirmation and Valid Settings/Keys Validation
// ============================================================================

test("Validation: rejects publication when settings are missing, implicit, or invalid", async () => {
  const storage = new InMemoryStoragePort();
  const q1 = createBankQuestion("q1", "v1", "I").question;

  const invalidDurationDraft = createDraft(
    {
      ...createBaseExam(),
      settings: { ...createBaseExam().settings, durationMinutes: 0 },
      questions: [q1],
    },
    "d-inv-1",
  );
  const res1 = await publishDraft(invalidDurationDraft, "v1.1.0", storage);
  assert.equal(res1.ok, false);
  if (!res1.ok) assert.equal(res1.error.code, "EXAM_SETTINGS_INVALID");

  const invalidMaxAttDraft = createDraft(
    {
      ...createBaseExam(),
      settings: { ...createBaseExam().settings, maxAttempts: 0 },
      questions: [q1],
    },
    "d-inv-2",
  );
  const res2 = await publishDraft(invalidMaxAttDraft, "v1.1.0", storage);
  assert.equal(res2.ok, false);
  if (!res2.ok) assert.equal(res2.error.code, "EXAM_SETTINGS_INVALID");

  const invalidReleaseDraft = createDraft(
    {
      ...createBaseExam(),
      settings: { ...createBaseExam().settings, releasePolicy: "invalid" as any },
      questions: [q1],
    },
    "d-inv-3",
  );
  const res3 = await publishDraft(invalidReleaseDraft, "v1.1.0", storage);
  assert.equal(res3.ok, false);
  if (!res3.ok) assert.equal(res3.error.code, "EXAM_SETTINGS_INVALID");
});

test("Validation: rejects publication when question keys are invalid across Parts I, II, III", async () => {
  const storage = new InMemoryStoragePort();

  const badQI: WebQuestion = {
    kind: "I",
    questionVersionId: "bad-qi-v1",
    options: [
      { optionId: "opt-1", text: "1" },
      { optionId: "opt-2", text: "2" },
      { optionId: "opt-3", text: "3" },
      { optionId: "opt-4", text: "4" },
    ],
    correctOptionId: "opt-nonexistent",
  };
  const dI = createDraft({ ...createBaseExam(), questions: [badQI] }, "d-bad-i");
  const rI = await publishDraft(dI, "v1.1.0", storage);
  assert.equal(rI.ok, false);
  if (!rI.ok) assert.equal(rI.error.code, "I_KEY_NOT_IN_OPTIONS");

  const badQII: WebQuestion = {
    kind: "II",
    questionVersionId: "bad-qii-v1",
    statements: [
      { statementId: "st-1", text: "1", answer: true },
      { statementId: "st-2", text: "2", answer: false },
      { statementId: "st-3", text: "3", answer: true },
      { statementId: "st-4", text: "4", answer: "invalid" as any },
    ],
  };
  const dII = createDraft({ ...createBaseExam(), questions: [badQII] }, "d-bad-ii");
  const rII = await publishDraft(dII, "v1.1.0", storage);
  assert.equal(rII.ok, false);
  if (!rII.ok) assert.equal(rII.error.code, "II_ANSWER_NOT_BOOLEAN");

  const badQIII: WebQuestion = {
    kind: "III",
    questionVersionId: "bad-qiii-v1",
    answerKey: "12345",
  };
  const dIII = createDraft({ ...createBaseExam(), questions: [badQIII] }, "d-bad-iii");
  const rIII = await publishDraft(dIII, "v1.1.0", storage);
  assert.equal(rIII.ok, false);
  if (!rIII.ok) assert.equal(rIII.error.code, "III_KEY_INVALID");
});

test("Validation: storage duplicate check prevents overwriting historical snapshots", async () => {
  const storage = new InMemoryStoragePort();
  const q1 = createBankQuestion("q1", "v1", "I").question;
  const draft = createDraft({ ...createBaseExam(), questions: [q1] }, "draft-dup-ver");

  const r1 = await publishDraft(draft, "v1.1.0", storage);
  assertOk(r1);

  const r2 = await publishDraft(draft, "v1.1.0", storage);
  assert.equal(r2.ok, false);
  if (!r2.ok) {
    assert.equal(r2.error.code, "EXAM_VERSION_EXISTS");
  }
});

// ============================================================================
// Suite 5: Failed Publish Rollback
// ============================================================================

test("Failed Publish Rollback: storage failure leaves draft intact and uncorrupted", async () => {
  const faultyStorage = new FaultyStoragePort();

  const q1 = createBankQuestion("q1", "v1", "I").question;
  const controller = new TeacherController({
    initialExam: { ...createBaseExam(), questions: [q1] },
    storage: faultyStorage,
  });

  controller.setPublishVersionId("v2.0.0");
  const res = await controller.publish();

  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, "STORAGE_FAILED");
  }

  assert.equal(controller.getDraft().exam.questions.length, 1);
  assert.equal(controller.getDraft().exam.questions[0]!.questionVersionId, "v1");
  assert.equal(controller.getPublishVersionId(), "v2.0.0");
});

test("Failed Publish Rollback: rollbackPublishedExam cleans up storage if publish is reverted", async () => {
  const storage = new InMemoryStoragePort();
  const q1 = createBankQuestion("q1", "v1", "I").question;
  const draft = createDraft({ ...createBaseExam(), questions: [q1] }, "draft-rb");

  const pubRes = await publishDraft(draft, "v1.0.1", storage);
  assertOk(pubRes);

  const inStore = await storage.getObject("exams", "exam-int-1:v1.0.1");
  assertOk(inStore);
  assert.ok(inStore.value !== null);

  const rbRes = await rollbackPublishedExam("exam-int-1", "v1.0.1", storage);
  assertOk(rbRes);

  const afterRb = await storage.getObject("exams", "exam-int-1:v1.0.1");
  assertOk(afterRb);
  assert.equal(afterRb.value, null, "Published exam must be removed after rollback");
});

// ============================================================================
// Suite 6: Editing and Deleting Bank Question After Publication (Snapshot Immutability)
// ============================================================================

test("AC Snapshot Immutability: editing or deleting a bank question after publication does not affect published exam or attempts", async () => {
  const storage = new InMemoryStoragePort();

  const b1 = createBankQuestion("q-source-1", "q-source-1-v1", "I");
  const bSave = await saveBankEntry(b1, null, storage);
  assertOk(bSave);

  const draft = createDraft(createBaseExam("exam-imm-1", "v0.9.0"), "draft-imm");
  const addRes = addBankEntryToDraft(draft, b1);
  assertOk(addRes);
  const pubRes = await publishDraft(addRes.value, "v1.0.0", storage);
  assertOk(pubRes);
  const publishedExam = pubRes.value;

  const activeAttempt: AttemptRecord = {
    schemaVersion: "web-attempt-v1",
    examId: publishedExam.examId,
    examVersionId: publishedExam.examVersionId,
    attemptId: "att-active-1",
    revision: 1,
    candidateName: "Học sinh 1",
    examSnapshot: publishedExam,
    presentationOrder: { seed: "seed-1", questionOrder: ["q-source-1-v1"], optionOrder: [] },
    responses: { attemptId: "att-active-1", examVersionId: publishedExam.examVersionId, responses: [] },
    startedAt: 1700000000000,
    deadline: 1700003000000,
    phase: "draft",
    submittedAt: null,
    scoreDTO: null,
  };
  await storage.create(activeAttempt);

  const finalAttempt: AttemptRecord = {
    ...activeAttempt,
    attemptId: "att-final-1",
    phase: "final",
    submittedAt: 1700001000000,
    scoreDTO: { totalScore: "1/4", maxScore: "1/4" },
  };
  await storage.create(finalAttempt);

  const editedB1: BankEntry = {
    ...bSave.value,
    question: {
      ...bSave.value.question,
      title: "TIÊU ĐỀ BỊ SỬA TRONG NGÂN HÀNG",
      content: "NỘI DUNG BỊ SỬA",
    },
  };
  const bUpdate = await saveBankEntry(editedB1, 1, storage);
  assertOk(bUpdate);

  const b1V2 = createNewVersion(editedB1, "q-source-1-v2", { title: "Phiên bản 2 hoàn toàn mới" });
  assertOk(b1V2);
  await saveBankEntry(b1V2.value, null, storage);

  const bDelete = await deleteBankEntryConfirmed("q-source-1-v1", 2, storage, { confirmed: true });
  assertOk(bDelete);

  // Check 1: Published exam in exams store is 100% UNCHANGED
  const examCheck = await storage.getObject("exams", "exam-imm-1:v1.0.0");
  assertOk(examCheck);
  assert.ok(examCheck.value !== null);
  const loadedExam = examCheck.value as WebExam;
  assert.equal(loadedExam.questions[0]!.title, "Câu hỏi q-source-1", "Published question title must remain original");
  assert.equal(loadedExam.questions[0]!.content, "Nội dung câu hỏi q-source-1", "Published question content must remain original");

  // Check 2: Active attempt snapshot is 100% UNCHANGED
  const activeCheck = await storage.load({ examId: "exam-imm-1", examVersionId: "v1.0.0", attemptId: "att-active-1" });
  assertOk(activeCheck);
  assert.ok(activeCheck.value !== null);
  assert.equal(activeCheck.value.examSnapshot.questions[0]!.title, "Câu hỏi q-source-1");

  // Check 3: Finalized attempt score and snapshot are 100% UNCHANGED
  const finalCheck = await storage.load({ examId: "exam-imm-1", examVersionId: "v1.0.0", attemptId: "att-final-1" });
  assertOk(finalCheck);
  assert.ok(finalCheck.value !== null);
  assert.equal(finalCheck.value.examSnapshot.questions[0]!.title, "Câu hỏi q-source-1");
  assert.deepEqual(finalCheck.value.scoreDTO, { totalScore: "1/4", maxScore: "1/4" });
});

// ============================================================================
// Suite 7: Portable Roundtrip (Draft & Bank Transfer)
// ============================================================================

test("Portable Roundtrip: exam draft export to JSON and parseExam import roundtrip", () => {
  const qI = createBankQuestion("q-rt-1", "v-rt-1", "I").question;
  const qII = createBankQuestion("q-rt-2", "v-rt-2", "II").question;
  const qIII = createBankQuestion("q-rt-3", "v-rt-3", "III").question;

  const originalExam: WebExam = {
    ...createBaseExam("exam-rt-1", "v1.0.0"),
    title: "Đề thi kiểm tra Roundtrip Tiếng Việt có công thức $\\int_0^1 x dx$",
    questions: [qI, qII, qIII],
  };

  const jsonStr = exportExam(originalExam);
  assert.ok(jsonStr.includes("web-exam-v1"));
  assert.ok(jsonStr.includes("exam-rt-1"));

  const parsedRes = parseExam(jsonStr);
  assertValidated(parsedRes);
  const roundtripExam = parsedRes.value;
  assert.equal(roundtripExam.examId, originalExam.examId);
  assert.equal(roundtripExam.examVersionId, originalExam.examVersionId);
  assert.equal(roundtripExam.title, originalExam.title);
  assert.equal(roundtripExam.questions.length, 3);
  assert.equal(roundtripExam.questions[0]!.questionVersionId, "v-rt-1");
  assert.equal(roundtripExam.questions[1]!.questionVersionId, "v-rt-2");
  assert.equal(roundtripExam.questions[2]!.questionVersionId, "v-rt-3");
});

test("Portable Roundtrip: bank transfer export and parseBankTransfer import roundtrip", () => {
  const b1 = createBankQuestion("b-rt-1", "b-rt-1-v1", "I");
  const b2 = createBankQuestion("b-rt-2", "b-rt-2-v1", "II");
  const b3 = createBankQuestion("b-rt-3", "b-rt-3-v1", "III");

  const jsonStr = exportBankTransferJson([b1, b2, b3], {
    title: "Bộ ngân hàng Toán 12 GDPT 2018",
    description: "Bộ câu hỏi trắc nghiệm minh họa",
  });

  const parseRes = parseBankTransfer(jsonStr);
  assertOk(parseRes);
  const payload = parseRes.value;
  assert.equal(payload.schemaVersion, "cunata-bank-transfer-v1");
  assert.equal(payload.count, 3);
  assert.equal(payload.entries.length, 3);
  assert.equal(payload.entries[0]!.questionId, "b-rt-1");
  assert.equal(payload.entries[1]!.questionId, "b-rt-2");
  assert.equal(payload.entries[2]!.questionId, "b-rt-3");
  assert.equal(payload.metadata?.title, "Bộ ngân hàng Toán 12 GDPT 2018");
});

// ============================================================================
// Suite 8: AC Verification
// ============================================================================

test("AC Verification: local authoring tools honestly state role without fake admin/auth", () => {
  const doc = createTestDocument();
  const root = doc.createElement("div");
  doc.body.appendChild(root);

  const controller = new TeacherController();
  const unmount = mount(root as unknown as HTMLElement, controller);

  const textContent = root.textContent || "";
  assert.ok(textContent.includes("Không phân quyền người dùng"), "Must state no fake user/admin auth");
  assert.ok(textContent.includes("D08"), "Must reference D08 security notice");

  unmount();
});

test("AC Verification: ruleSetId is always 'custom-v1' and never labeled official THPT preset", async () => {
  const storage = new InMemoryStoragePort();
  const q1 = createBankQuestion("q1", "v1", "I").question;
  const draft = createDraft({ ...createBaseExam("exam-preset-1", "v0.9.0"), questions: [q1] }, "draft-preset");

  const pubRes = await publishDraft(draft, "v1.0.0", storage);
  assertOk(pubRes);
  assert.equal(pubRes.value.ruleSetId, "custom-v1", "RuleSet must always be custom-v1");
  assert.equal(pubRes.value.inputPolicyId, "sa-charset-v1", "InputPolicy must always be sa-charset-v1");
  assert.notEqual(pubRes.value.ruleSetId, "thpt-official", "Must never claim approved-standard preset");
});
