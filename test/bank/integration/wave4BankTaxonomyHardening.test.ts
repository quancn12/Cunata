import test from "node:test";
import assert from "node:assert/strict";

import {
  saveBankEntry,
  loadBankEntry,
  deleteBankEntry,
  createNewVersion,
  queryBank,
  validateBankEntry,
} from "../../../src/bank/index.ts";
import type {
  BankEntry,
  BankFilter,
  Taxonomy,
  WebQuestion,
  WebOption,
  WebStatement,
  Result,
} from "../../../src/bank/types.ts";

import {
  exportBankTransferJson,
  exportBankTransfer,
  parseBankTransfer,
  importBankTransfer,
  deleteBankEntryConfirmed,
  clearAllConfirmed,
  loadAllBankEntriesFromStorage,
  exportBankViaStorage,
} from "../../../src/bank/transfer.ts";

import { InMemoryStoragePort } from "../core/testStorage.ts";

function assertOk<T>(res: Result<T>, msg?: string): asserts res is { readonly ok: true; readonly value: T } {
  assert.equal(res.ok, true, msg ?? (!res.ok ? JSON.stringify((res as { error: unknown }).error) : undefined));
}

function makeEntry(
  qId: string,
  vId: string,
  tax: {
    subject: string;
    grade: 10 | 11 | 12;
    topic: string;
    lesson: string;
    difficulty: "Nhận biết" | "Thông hiểu" | "Vận dụng";
  },
  kind: "I" | "II" | "III" = "I",
  contentExtra = "",
): BankEntry {
  const taxonomy: Taxonomy = {
    subject: tax.subject,
    grade: tax.grade,
    topic: tax.topic,
    lesson: tax.lesson,
    difficulty: tax.difficulty,
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
        title: `Tiêu đề ${qId}`,
        content: `Nội dung ${qId} ${contentExtra}`,
        explanation: `Lời giải chi tiết ${qId}`,
        options: [
          { optionId: `${vId}-A`, label: "A", text: `Đáp án A ${contentExtra}` },
          { optionId: `${vId}-B`, label: "B", text: `Đáp án B` },
          { optionId: `${vId}-C`, label: "C", text: `Đáp án C` },
          { optionId: `${vId}-D`, label: "D", text: `Đáp án D` },
        ],
        correctOptionId: `${vId}-A`,
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
        title: `Tiêu đề đúng sai ${qId}`,
        content: `Nội dung đúng sai ${qId} ${contentExtra}`,
        statements: [
          { statementId: `${vId}-s1`, label: "a", text: `Ý 1 ${contentExtra}`, answer: true },
          { statementId: `${vId}-s2`, label: "b", text: `Ý 2`, answer: false },
          { statementId: `${vId}-s3`, label: "c", text: `Ý 3`, answer: true },
          { statementId: `${vId}-s4`, label: "d", text: `Ý 4`, answer: false },
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
        title: `Tiêu đề trả lời ngắn ${qId}`,
        content: `Nội dung trả lời ngắn ${qId} ${contentExtra}`,
        answerKey: "1,5",
      },
    };
  }
}

// ============================================================================
// 1. FIVE-LEVEL TAXONOMY CONCURRENT FILTERS
// ============================================================================

test("W4 Bank Hardening: five-level taxonomy filter narrows results across all 5 levels + kind + text concurrently", () => {
  const corpus: BankEntry[] = [
    // Toán 12
    makeEntry("T12-H1", "v-T12-H1", { subject: "Toán học", grade: 12, topic: "Hàm số", lesson: "Cực trị", difficulty: "Nhận biết" }, "I", "đồ thị hàm bậc ba"),
    makeEntry("T12-H2", "v-T12-H2", { subject: "Toán học", grade: 12, topic: "Hàm số", lesson: "Cực trị", difficulty: "Vận dụng" }, "I", "tìm tham số m để cực trị"),
    makeEntry("T12-H3", "v-T12-H3", { subject: "Toán học", grade: 12, topic: "Hàm số", lesson: "Tiệm cận", difficulty: "Thông hiểu" }, "II", "tiệm cận đứng và tiệm cận ngang"),
    makeEntry("T12-TP1", "v-T12-TP1", { subject: "Toán học", grade: 12, topic: "Tích phân", lesson: "Diện tích hình phẳng", difficulty: "Vận dụng" }, "III", "tính diện tích"),

    // Toán 11
    makeEntry("T11-LG1", "v-T11-LG1", { subject: "Toán học", grade: 11, topic: "Lượng giác", lesson: "Phương trình lượng giác", difficulty: "Nhận biết" }, "I", "nghiệm phương trình sin"),
    makeEntry("T11-LG2", "v-T11-LG2", { subject: "Toán học", grade: 11, topic: "Lượng giác", lesson: "Phương trình lượng giác", difficulty: "Thông hiểu" }, "II", "nghiệm cos"),

    // Vật lí 12
    makeEntry("L12-DD1", "v-L12-DD1", { subject: "Vật lí", grade: 12, topic: "Dao động cơ", lesson: "Con lắc lò xo", difficulty: "Nhận biết" }, "I", "chu kỳ dao động con lắc"),
    makeEntry("L12-DD2", "v-L12-DD2", { subject: "Vật lí", grade: 12, topic: "Dao động cơ", lesson: "Con lắc đơn", difficulty: "Vận dụng" }, "I", "con lắc đơn trong thang máy"),
    makeEntry("L12-SC1", "v-L12-SC1", { subject: "Vật lí", grade: 12, topic: "Sóng cơ", lesson: "Giao thoa sóng", difficulty: "Thông hiểu" }, "II", "hai nguồn kết hợp cực đại"),

    // Hóa học 10
    makeEntry("H10-NT1", "v-H10-NT1", { subject: "Hóa học", grade: 10, topic: "Nguyên tử", lesson: "Cấu tạo vỏ nguyên tử", difficulty: "Nhận biết" }, "I", "số electron lớp ngoài cùng"),
  ];

  // 1. Filter by Level 1: Subject (case-insensitive & trimmed)
  const resSubject = queryBank(corpus, { subject: "  toán học  " });
  assert.equal(resSubject.length, 6);

  // 2. Filter by Level 2: Grade (both number and string handled)
  const resGradeNum = queryBank(corpus, { grade: 12 });
  assert.equal(resGradeNum.length, 7);

  const resSubjectGrade = queryBank(corpus, { subject: "Toán học", grade: 12 });
  assert.equal(resSubjectGrade.length, 4);

  // 3. Filter by Level 3: Topic
  const resTopic = queryBank(corpus, { subject: "Toán học", grade: 12, topic: "Hàm số" });
  assert.equal(resTopic.length, 3);

  // 4. Filter by Level 4: Lesson
  const resLesson = queryBank(corpus, { subject: "Toán học", grade: 12, topic: "Hàm số", lesson: "Cực trị" });
  assert.equal(resLesson.length, 2);

  // 5. Filter by ALL 5 LEVELS concurrently:
  // Subject: "Toán học", Grade: 12, Topic: "Hàm số", Lesson: "Cực trị", Difficulty: "Vận dụng"
  const res5Levels = queryBank(corpus, {
    subject: "Toán học",
    grade: 12,
    topic: "Hàm số",
    lesson: "Cực trị",
    difficulty: "Vận dụng",
  });
  assert.equal(res5Levels.length, 1);
  assert.equal(res5Levels[0]!.questionId, "T12-H2");

  // 6. Filter by ALL 5 LEVELS + Section kind + full text search
  const resAllPlus = queryBank(corpus, {
    subject: "Toán học",
    grade: 12,
    topic: "Hàm số",
    lesson: "Cực trị",
    difficulty: "Vận dụng",
    kind: "I",
    text: "tham số m",
  });
  assert.equal(resAllPlus.length, 1);
  assert.equal(resAllPlus[0]!.questionId, "T12-H2");

  // Non-matching text filter returns 0
  const resNoMatch = queryBank(corpus, {
    subject: "Toán học",
    grade: 12,
    topic: "Hàm số",
    lesson: "Cực trị",
    difficulty: "Vận dụng",
    text: "không tồn tại từ khóa này",
  });
  assert.equal(resNoMatch.length, 0);

  // 7. Verify "all" wildcard string in dropdown filters is ignored
  const resWildcards = queryBank(corpus, {
    subject: "all",
    grade: undefined,
    topic: "all",
    lesson: "all",
    difficulty: "all" as any,
    kind: "all" as any,
  });
  assert.equal(resWildcards.length, corpus.length, "All wildcard must return entire corpus");

  // 8. Verify input array immutability
  assert.equal(Object.isFrozen(res5Levels), true);
});

// ============================================================================
// 2. BANK SOURCE DEDUPE & STRICT TRANSFER VALIDATION
// ============================================================================

test("W4 Bank Hardening: parseBankTransfer strictly rejects malformed schemas, missing options text, and duplicate versions", () => {
  // 1. Invalid JSON
  const resJson = parseBankTransfer("invalid-json{}}");
  assert.equal(resJson.ok, false);
  if (!resJson.ok) assert.equal(resJson.error.code, "BANK_TRANSFER_INVALID");

  // 2. Wrong schemaVersion
  const resSchema = parseBankTransfer({
    schemaVersion: "unsupported-schema",
    entries: [],
  });
  assert.equal(resSchema.ok, false);
  if (!resSchema.ok) assert.equal(resSchema.error.code, "BANK_TRANSFER_INVALID");

  // 3. Entries not array
  const resEntries = parseBankTransfer({
    schemaVersion: "cunata-bank-transfer-v1",
    entries: "not-an-array",
  });
  assert.equal(resEntries.ok, false);
  if (!resEntries.ok) assert.equal(resEntries.error.code, "BANK_TRANSFER_INVALID");

  // 4. Duplicate questionVersionId within payload
  const e1 = makeEntry("q1", "same-v-id", { subject: "Toán học", grade: 12, topic: "Hàm số", lesson: "Bài 1", difficulty: "Nhận biết" });
  const e2 = makeEntry("q2", "same-v-id", { subject: "Toán học", grade: 12, topic: "Hàm số", lesson: "Bài 1", difficulty: "Thông hiểu" });
  const resDupVersion = parseBankTransfer({
    schemaVersion: "cunata-bank-transfer-v1",
    entries: [e1, e2],
  });
  assert.equal(resDupVersion.ok, false);
  if (!resDupVersion.ok) assert.ok(resDupVersion.error.message.includes("trùng lặp"));

  // 5. Invalid question options (missing text)
  const badOptEntry = {
    ...e1,
    question: {
      ...e1.question,
      options: [
        { optionId: "opt-1", label: "A", text: "text" },
        { optionId: "opt-2", label: "B" }, // missing text!
        { optionId: "opt-3", label: "C", text: "text" },
        { optionId: "opt-4", label: "D", text: "text" },
      ],
    },
  };
  const resBadOpt = parseBankTransfer({
    schemaVersion: "cunata-bank-transfer-v1",
    entries: [badOptEntry],
  });
  assert.equal(resBadOpt.ok, false);
});

test("W4 Bank Hardening: importBankTransfer deduplication strategies (skip, overwrite, fork_new_version)", async () => {
  const storage = new InMemoryStoragePort();

  const originalEntry = makeEntry("q-dedupe-1", "v-dedupe-1", {
    subject: "Toán học",
    grade: 12,
    topic: "Hình học không gian",
    lesson: "Mặt phẳng",
    difficulty: "Nhận biết",
  });

  // Initial save into storage
  const initSave = await saveBankEntry(originalEntry, null, storage);
  assertOk(initSave);
  assert.equal(initSave.value.revision, 1);

  // Payload containing the same questionVersionId with altered content
  const payloadToImport = {
    schemaVersion: "cunata-bank-transfer-v1",
    exportedAt: new Date().toISOString(),
    generator: "test-runner",
    count: 1,
    entries: [
      {
        ...originalEntry,
        question: {
          ...originalEntry.question,
          title: "TIÊU ĐỀ ĐÃ BỊ THAY ĐỔI TRONG FILE IMPORT",
        },
      },
    ],
  };

  // 1. Strategy "skip": must not overwrite, skip count = 1
  const resSkip = await importBankTransfer(payloadToImport, storage, { dedupe: "skip" });
  assertOk(resSkip);
  assert.equal(resSkip.value.skipped, 1);
  assert.equal(resSkip.value.updated, 0);

  const checkSkip = await loadBankEntry("v-dedupe-1", storage);
  assertOk(checkSkip);
  assert.equal(checkSkip.value?.question.title, "Tiêu đề q-dedupe-1", "Title must remain unchanged under skip strategy");

  // 2. Strategy "overwrite": must update existing entry with advanced revision
  const resOverwrite = await importBankTransfer(payloadToImport, storage, { dedupe: "overwrite" });
  assertOk(resOverwrite);
  assert.equal(resOverwrite.value.updated, 1);

  const checkOverwrite = await loadBankEntry("v-dedupe-1", storage);
  assertOk(checkOverwrite);
  assert.equal(checkOverwrite.value?.question.title, "TIÊU ĐỀ ĐÃ BỊ THAY ĐỔI TRONG FILE IMPORT");
  assert.equal(checkOverwrite.value?.revision, 2);

  // 3. Strategy "fork_new_version": creates a new distinct versionId while preserving questionId
  let forkedIdCounter = 0;
  const idGen = () => `forked-v-${++forkedIdCounter}`;
  const resFork = await importBankTransfer(payloadToImport, storage, { dedupe: "fork_new_version", idGenerator: idGen });
  assertOk(resFork);
  assert.equal(resFork.value.forked, 1);
  assert.equal(resFork.value.entryIds[0], "forked-v-1");

  // Check that forked entry exists with questionId "q-dedupe-1" and new versionId "forked-v-1"
  const checkForked = await loadBankEntry("forked-v-1", storage);
  assertOk(checkForked);
  assert.equal(checkForked.value?.questionId, "q-dedupe-1");
  assert.equal(checkForked.value?.questionVersionId, "forked-v-1");

  // Original version remains intact
  const checkOriginal = await loadBankEntry("v-dedupe-1", storage);
  assertOk(checkOriginal);
  assert.equal(checkOriginal.value?.questionVersionId, "v-dedupe-1");
});

// ============================================================================
// 3. CONFIRMED DELETION & CAS CONFLICTS
// ============================================================================

test("W4 Bank Hardening: deleteBankEntryConfirmed requires confirmed: true and handles revision CAS conflict", async () => {
  const storage = new InMemoryStoragePort();

  const entry = makeEntry("q-del-1", "v-del-1", {
    subject: "Toán học",
    grade: 12,
    topic: "Số phức",
    lesson: "Mô đun",
    difficulty: "Thông hiểu",
  });
  const saved = await saveBankEntry(entry, null, storage);
  assertOk(saved);
  assert.equal(saved.value.revision, 1);

  // 1. Deletion without confirmed: true must be rejected with CONFIRMATION_REQUIRED
  const unconfirmedRes = await deleteBankEntryConfirmed("v-del-1", 1, storage, { confirmed: false });
  assert.equal(unconfirmedRes.ok, false);
  if (!unconfirmedRes.ok) {
    assert.equal(unconfirmedRes.error.code, "CONFIRMATION_REQUIRED");
  }

  // 2. Deletion with stale revision must fail with STORAGE_CONFLICT
  const staleRes = await deleteBankEntryConfirmed("v-del-1", 99, storage, { confirmed: true });
  assert.equal(staleRes.ok, false);
  if (!staleRes.ok) {
    assert.equal(staleRes.error.code, "STORAGE_CONFLICT");
  }

  // 3. Confirmed deletion with matching revision succeeds
  const successRes = await deleteBankEntryConfirmed("v-del-1", 1, storage, { confirmed: true });
  assertOk(successRes);

  const checkDeleted = await loadBankEntry("v-del-1", storage);
  assertOk(checkDeleted);
  assert.equal(checkDeleted.value, null, "Deleted question version must no longer exist in storage");
});

test("W4 Bank Hardening: clearAllConfirmed requires confirmed: true and clears storage completely", async () => {
  const storage = new InMemoryStoragePort();

  const entry = makeEntry("q-clear-1", "v-clear-1", {
    subject: "Toán học",
    grade: 12,
    topic: "Tọa độ",
    lesson: "Mặt cầu",
    difficulty: "Nhận biết",
  });
  await saveBankEntry(entry, null, storage);

  // Unconfirmed call rejected
  const unconfirmed = await clearAllConfirmed(storage, { confirmed: false });
  assert.equal(unconfirmed.ok, false);
  if (!unconfirmed.ok) assert.equal(unconfirmed.error.code, "CONFIRMATION_REQUIRED");

  // Confirmed call succeeds
  const confirmed = await clearAllConfirmed(storage, { confirmed: true });
  assertOk(confirmed);

  const check = await loadBankEntry("v-clear-1", storage);
  assertOk(check);
  assert.equal(check.value, null);
});
