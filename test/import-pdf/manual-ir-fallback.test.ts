import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createManualDraft,
  addManualDraftToJob,
  addManualRegionToJob,
  addManualBlockToJob,
  buildManualPartI,
  buildManualPartII,
  buildManualPartIII,
} from "../../src/import/pdf/manual.ts";
import { importPdf } from "../../src/import/pdf/importer.ts";
import { PDF_FLAGS } from "../../src/import/pdf/types.ts";
import type { ImportJob, Block, WebQuestionI, WebQuestionII, WebQuestionIII } from "../../src/import/pdf/types.ts";
import { validateImportDraft } from "../../src/schema/index.ts";
import { toFile, buildSyntheticPdfText } from "./builder.ts";

describe("Manual IR Fallback: User-Supplied Questions & Regions", () => {
  async function createInitialJob(): Promise<ImportJob> {
    const bytes = buildSyntheticPdfText();
    const file = toFile(bytes, "test-de-thi.pdf");
    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("Failed to create initial job");
    return res.value;
  }

  it("creates a manual draft with exact provenance, confidence: null, and confirmed: false", () => {
    const draft = createManualDraft("test-de-thi.pdf", {
      location: "Trang 1, Cột 1",
      question: {
        content: "Nội dung câu hỏi nhập tay",
      },
    });

    assert.equal(draft.provenance.sourceId, "test-de-thi.pdf");
    assert.equal(draft.provenance.location, "Trang 1, Cột 1");
    // AC: confidence MUST be null when not measured, per WEB-contract.md §8
    assert.equal(draft.provenance.confidence, null);
    assert.equal(draft.provenance.flags.includes(PDF_FLAGS.MANUAL_INPUT), true);
    assert.equal(draft.provenance.flags.includes(PDF_FLAGS.MANUAL_REVIEW_REQUIRED), true);

    // AC: confirmed MUST be false (no auto publication)
    assert.equal(draft.confirmed, false);
  });

  it("adds Part I manual question with 4 options and optional user-supplied answer", async () => {
    const job = await createInitialJob();

    // User provides question without answer key (unknown)
    const q1 = buildManualPartI({
      content: "Cho hàm số y = f(x) có bảng biến thiên...",
      choiceTexts: ["1", "2", "3", "4"],
    }) as Partial<WebQuestionI>;

    // AC: correctOptionId must NOT be inferred or guessed
    assert.equal(q1.correctOptionId, undefined);

    const res1 = addManualDraftToJob(job, {
      question: q1,
      location: "Trang 1, Câu 1",
    });
    assert.equal(res1.ok, true);
    if (!res1.ok) return;

    assert.equal(res1.value.drafts.length, 1);
    const draft1Q = res1.value.drafts[0]!.question as Partial<WebQuestionI>;
    assert.equal(draft1Q.kind, "I");
    assert.equal(draft1Q.correctOptionId, undefined);

    // Schema validation check: draft is valid structure
    const issues = validateImportDraft(res1.value.drafts[0]!);
    // When correctOptionId is missing, validateImportDraft flags IMPORT_KEY_MISSING, which is expected
    const missingKeyIssue = issues.find((i) => i.code === "IMPORT_KEY_MISSING");
    assert.notEqual(missingKeyIssue, undefined);

    // Now test with explicit user-provided correct answer (opt-2 = B)
    const q2 = buildManualPartI({
      content: "Cho khối chóp có đáy diện tích B và chiều cao h...",
      choiceTexts: ["V = Bh", "V = 1/3 Bh", "V = 1/2 Bh", "V = 2Bh"],
      correctOptionId: "opt-2",
    }) as Partial<WebQuestionI>;
    assert.equal(q2.correctOptionId, "opt-2");

    const res2 = addManualDraftToJob(res1.value, {
      question: q2,
      location: "Trang 1, Câu 2",
    });
    assert.equal(res2.ok, true);
    if (!res2.ok) return;

    assert.equal(res2.value.drafts.length, 2);
    const draft2Q = res2.value.drafts[1]!.question as Partial<WebQuestionI>;
    assert.equal(draft2Q.correctOptionId, "opt-2");
  });

  it("adds Part II manual question with exactly 4 statements", async () => {
    const job = await createInitialJob();

    const q = buildManualPartII({
      content: "Cho hàm số f(x) = x^3 - 3x. Xét tính đúng sai của các khẳng định sau:",
      statementItems: [
        { text: "Hàm số đồng biến trên khoảng (1; +vô cùng)", answer: true },
        { text: "Hàm số nghịch biến trên khoảng (-1; 1)", answer: true },
        { text: "Giá trị cực đại của hàm số bằng -2", answer: false },
        { text: "Đồ thị hàm số đi qua gốc tọa độ O", answer: true },
      ],
    });

    const res = addManualDraftToJob(job, {
      question: q,
      location: "Trang 2, Câu 1 (Phần II)",
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.drafts.length, 1);
    const draft = res.value.drafts[0]!;
    const draftQ = draft.question as Partial<WebQuestionII>;
    assert.equal(draftQ.kind, "II");
    assert.equal(draftQ.statements?.length, 4);

    const issues = validateImportDraft(draft);
    assert.deepEqual(issues, []);
  });

  it("adds Part III manual question preserving raw string without normalization", async () => {
    const job = await createInitialJob();

    // Test raw string "-0,5" (4 chars, comma decimal, negative)
    const q = buildManualPartIII({
      content: "Tính giá trị của biểu thức A...",
      answerKey: "-0,5",
    }) as Partial<WebQuestionIII>;

    // AC: answerKey is exact raw string, not numeric
    assert.equal(q.answerKey, "-0,5");

    const res = addManualDraftToJob(job, {
      question: q,
      location: "Trang 3, Câu 1 (Phần III)",
    });
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.drafts.length, 1);
    const draft = res.value.drafts[0]!;
    const draftQ = draft.question as Partial<WebQuestionIII>;
    assert.equal(draftQ.kind, "III");
    assert.equal(draftQ.answerKey, "-0,5");

    const issues = validateImportDraft(draft);
    assert.deepEqual(issues, []);
  });

  it("adds a manual user-selected region with bounding box into IR provenance", async () => {
    const job = await createInitialJob();

    const region = {
      pageNumber: 2,
      rect: { x0: 50, y0: 100, x1: 300, y1: 250 },
      label: "Vùng khoanh tay Câu 4",
      rawText: "Câu 4. Tìm nguyên hàm của hàm số f(x) = 2x + 1",
      notes: "Lời giải tham khảo: F(x) = x^2 + x + C",
    };

    const res = addManualRegionToJob(job, region);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.drafts.length, 1);
    const draft = res.value.drafts[0]!;
    assert.equal(
      draft.provenance.location,
      "Trang 2 [50, 100, 300, 250] - Vùng khoanh tay Câu 4"
    );
    assert.equal(draft.provenance.confidence, null);
    assert.equal(draft.provenance.flags.includes(PDF_FLAGS.MANUAL_INPUT), true);
    assert.equal(draft.question.content, region.rawText);
    assert.equal(draft.question.explanation, region.notes);
    assert.equal(draft.confirmed, false);
  });

  it("adds manual blocks (text, math, image, table) to the ImportJob", async () => {
    const job = await createInitialJob();

    const mathBlock: Block = {
      type: "math",
      source: "\\int_{0}^{1} x^2 dx = \\frac{1}{3}",
      format: "latex",
      verified: true,
    };

    const res1 = addManualBlockToJob(job, mathBlock);
    assert.equal(res1.ok, true);
    if (!res1.ok) return;

    const initialBlockCount = job.blocks.length;
    assert.equal(res1.value.blocks.length, initialBlockCount + 1);
    assert.deepEqual(res1.value.blocks[initialBlockCount], mathBlock);

    // Immutability: original job blocks are unchanged
    assert.equal(job.blocks.length, initialBlockCount);
  });

  it("rejects modifying an already confirmed job", async () => {
    const job = await createInitialJob();
    const confirmedJob: ImportJob = {
      ...job,
      state: "confirmed",
    };

    const res = addManualDraftToJob(confirmedJob, {
      question: { content: "Test" },
      location: "manual",
    });
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.error.code, "IMPORT_LOCKED");
  });
});
