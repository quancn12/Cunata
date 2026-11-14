import test from "node:test";
import assert from "node:assert/strict";

import {
  saveBankEntry,
  deleteBankEntry,
  createNewVersion,
  queryBank,
  addToDraft,
} from "../../../src/bank/index.ts";
import type { BankEntry, ExamDraft } from "../../../src/bank/types.ts";
import {
  exportBankTransferJson,
  parseBankTransfer,
  importBankTransfer,
  deleteBankEntryConfirmed,
  clearAllConfirmed,
} from "../../../src/bank/transfer.ts";

import {
  mount,
} from "../../../src/bank/view.ts";

import {
  createDraft,
  computeDraftMax,
} from "../../../src/teacher/index.ts";
import type { WebExam, Result } from "../../../src/teacher/types.ts";

import { toFractionString } from "../../../src/domain/index.ts";
import { InMemoryStoragePort } from "../core/testStorage.ts";
import { createTestDocument } from "../../teacher/view/dom-helper.ts";

function assertOk<T>(res: Result<T>, msg?: string): asserts res is { readonly ok: true; readonly value: T } {
  assert.equal(res.ok, true, msg ?? (!res.ok ? JSON.stringify((res as any).error) : undefined));
}

function createBankQuestion(
  qId: string,
  vId: string,
  kind: "I" | "II" | "III" = "I",
): BankEntry {
  return {
    questionId: qId,
    questionVersionId: vId,
    revision: 0,
    taxonomy: {
      subject: "Vật lí",
      grade: 11,
      topic: "Điện tích - Điện trường",
      lesson: "Định luật Coulomb",
      difficulty: "Thông hiểu",
    },
    question:
      kind === "I"
        ? {
            kind: "I",
            questionVersionId: vId,
            questionId: qId,
            title: `Câu hỏi Vật lí ${qId}`,
            content: `Nội dung câu hỏi ${qId}`,
            options: [
              { optionId: `${vId}-opt-1`, label: "A", text: "F = k|q1q2|/r^2" },
              { optionId: `${vId}-opt-2`, label: "B", text: "F = k|q1q2|/r" },
              { optionId: `${vId}-opt-3`, label: "C", text: "F = k|q1q2|/r^3" },
              { optionId: `${vId}-opt-4`, label: "D", text: "F = 2k|q1q2|/r^2" },
            ],
            correctOptionId: `${vId}-opt-1`,
          }
        : kind === "II"
        ? {
            kind: "II",
            questionVersionId: vId,
            questionId: qId,
            title: `Câu hỏi Đúng/Sai Vật lí ${qId}`,
            content: `Xét hai điện tích điểm:`,
            statements: [
              { statementId: `${vId}-st-1`, label: "a", text: "Lực tỉ lệ nghịch với bình phương khoảng cách", answer: true },
              { statementId: `${vId}-st-2`, label: "b", text: "Lực tỉ lệ thuận với tích độ lớn", answer: true },
              { statementId: `${vId}-st-3`, label: "c", text: "Lực luôn là lực hút", answer: false },
              { statementId: `${vId}-st-4`, label: "d", text: "Trong chân không hằng số k = 9.10^9", answer: true },
            ],
          }
        : {
            kind: "III",
            questionVersionId: vId,
            questionId: qId,
            title: `Câu hỏi ngắn Vật lí ${qId}`,
            content: `Tính độ lớn lực (N):`,
            answerKey: "9,0",
          },
  };
}

function createBaseExam(): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-bank-reuse-1",
    examVersionId: "v1.0.0",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    title: "Đề thi Vật lí 11",
    subject: "Vật lí",
    grade: 11,
    settings: {
      durationMinutes: 45,
      maxAttempts: null,
      releasePolicy: "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions: [],
    assets: [],
  };
}

test("Bank Reuse Integration: sequential reuse of Part I, II, and III questions into draft", () => {
  let draft = createDraft(createBaseExam(), "draft-seq-1");
  assert.equal(toFractionString(computeDraftMax(draft).maxTotal), "0");

  // Step 1: Add Part I question
  const bI = createBankQuestion("q-phy-1", "q-phy-1-v1", "I");
  const res1 = addToDraft(draft, bI, () => "id-1");
  assertOk(res1);
  draft = res1.value;
  assert.equal(draft.exam.questions.length, 1);
  assert.equal(toFractionString(computeDraftMax(draft).maxTotal), "1/4");

  // Step 2: Add Part II question
  const bII = createBankQuestion("q-phy-2", "q-phy-2-v1", "II");
  const res2 = addToDraft(draft, bII, () => "id-2");
  assertOk(res2);
  draft = res2.value;
  assert.equal(draft.exam.questions.length, 2);
  assert.equal(toFractionString(computeDraftMax(draft).maxTotal), "5/4");

  // Step 3: Add Part III question
  const bIII = createBankQuestion("q-phy-3", "q-phy-3-v1", "III");
  const res3 = addToDraft(draft, bIII, () => "id-3");
  assertOk(res3);
  draft = res3.value;
  assert.equal(draft.exam.questions.length, 3);
  assert.equal(toFractionString(computeDraftMax(draft).maxTotal), "10");
});

test("Bank Reuse Integration: dedupe strategies in importBankTransfer and draft reuse", async () => {
  const storage = new InMemoryStoragePort();

  const b1 = createBankQuestion("q-dup-1", "q-dup-1-v1", "I");
  const saveRes = await saveBankEntry(b1, null, storage);
  assertOk(saveRes);

  const payloadB1: BankEntry = {
    ...b1,
    question: {
      ...b1.question,
      title: "Tiêu đề đã được cập nhật từ file chuyển giao",
    },
  };

  const payloadJson = exportBankTransferJson([payloadB1]);

  // Strategy 1: 'skip'
  const skipRes = await importBankTransfer(payloadJson, storage, { dedupe: "skip" });
  assertOk(skipRes);
  assert.equal(skipRes.value.skipped, 1);
  assert.equal(skipRes.value.updated, 0);

  const loadedSkipRes = await storage.getObject("bank", "q-dup-1-v1");
  assertOk(loadedSkipRes);
  const loadedSkip = loadedSkipRes.value as BankEntry;
  assert.equal(loadedSkip.question.title, "Câu hỏi Vật lí q-dup-1", "Skip must retain original title");

  // Strategy 2: 'overwrite'
  const overwriteRes = await importBankTransfer(payloadJson, storage, { dedupe: "overwrite" });
  assertOk(overwriteRes);
  assert.equal(overwriteRes.value.updated, 1);

  const loadedOverwriteRes = await storage.getObject("bank", "q-dup-1-v1");
  assertOk(loadedOverwriteRes);
  const loadedOverwrite = loadedOverwriteRes.value as BankEntry;
  assert.equal(loadedOverwrite.question.title, "Tiêu đề đã được cập nhật từ file chuyển giao");

  // Strategy 3: 'fork_new_version'
  const forkRes = await importBankTransfer(payloadJson, storage, {
    dedupe: "fork_new_version",
    idGenerator: () => "q-dup-1-forked-v2",
  });
  assertOk(forkRes);
  assert.equal(forkRes.value.forked, 1);

  // Both original and forked versions exist in bank storage
  const originalInBank = await storage.getObject("bank", "q-dup-1-v1");
  const forkedInBank = await storage.getObject("bank", "q-dup-1-forked-v2");
  assertOk(originalInBank);
  assert.ok(originalInBank.value !== null);
  assertOk(forkedInBank);
  assert.ok(forkedInBank.value !== null);
});

test("Bank Reuse Integration: optimistic revision checks return STORAGE_CONFLICT on stale revision", async () => {
  const storage = new InMemoryStoragePort();
  const b1 = createBankQuestion("q-opt-1", "q-opt-1-v1", "I");

  const save1 = await saveBankEntry(b1, null, storage);
  assertOk(save1);
  assert.equal(save1.value.revision, 1);

  const staleUpdate = await saveBankEntry(save1.value, 0, storage);
  assert.equal(staleUpdate.ok, false);
  if (!staleUpdate.ok) {
    assert.equal(staleUpdate.error.code, "STORAGE_CONFLICT");
  }

  const staleDelete = await deleteBankEntryConfirmed("q-opt-1-v1", 0, storage, { confirmed: true });
  assert.equal(staleDelete.ok, false);
  if (!staleDelete.ok) {
    assert.equal(staleDelete.error.code, "STORAGE_CONFLICT");
  }
});

test("Bank Reuse Integration: confirmed deletion requires explicit { confirmed: true }", async () => {
  const storage = new InMemoryStoragePort();
  const b1 = createBankQuestion("q-del-1", "q-del-1-v1", "I");
  const saveRes = await saveBankEntry(b1, null, storage);
  assertOk(saveRes);

  const unconfirmedDelete = await deleteBankEntryConfirmed("q-del-1-v1", 1, storage, { confirmed: false });
  assert.equal(unconfirmedDelete.ok, false);
  if (!unconfirmedDelete.ok) {
    assert.equal(unconfirmedDelete.error.code, "CONFIRMATION_REQUIRED");
  }

  const unconfirmedClear = await clearAllConfirmed(storage, { confirmed: false });
  assert.equal(unconfirmedClear.ok, false);
  if (!unconfirmedClear.ok) {
    assert.equal(unconfirmedClear.error.code, "CONFIRMATION_REQUIRED");
  }
});

test("Bank Reuse Integration: Bank View mount triggers callbacks into Teacher draft", () => {
  const doc = createTestDocument();
  const root = doc.createElement("div");
  doc.body.appendChild(root);

  const b1 = createBankQuestion("q-bv-1", "q-bv-1-v1", "I");
  const initialDraft = createDraft(createBaseExam(), "draft-bv");

  let updatedDraft: ExamDraft | undefined;
  let addedEntry: BankEntry | undefined;

  const unmount = mount(
    root as unknown as HTMLElement,
    {
      entries: [b1],
      draft: initialDraft,
    },
    {
      onDraftChange: (d) => {
        updatedDraft = d as ExamDraft;
      },
      onAddFromBank: (entry) => {
        addedEntry = entry as BankEntry;
      },
    },
  );

  const reuseBtn = root.querySelector<any>(".cunata-reuse-btn");
  assert.ok(reuseBtn, "Reuse button 'Thêm vào đề' must exist");
  reuseBtn.onclick();

  assert.ok(updatedDraft, "onDraftChange callback must have been invoked with updated draft");
  const draftResult: ExamDraft = updatedDraft;
  assert.equal(draftResult.exam.questions.length, 1);
  assert.equal(draftResult.exam.questions[0]!.questionVersionId, "q-bv-1-v1");

  unmount();
});
