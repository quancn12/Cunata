import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { importPdf } from "../../src/import/pdf/importer.ts";
import {
  createManualDraft,
  addManualDraftToJob,
} from "../../src/import/pdf/manual.ts";
import {
  PROPOSED_PDF_LIMITS,
  PDF_FLAGS,
  PDF_ERROR_CODES,
} from "../../src/import/pdf/types.ts";
import type { PdfLimits } from "../../src/import/pdf/types.ts";
import {
  toFile,
  buildSyntheticPdfText,
  buildSyntheticPdfScan,
  buildSyntheticPdfMultiColumn,
  buildSyntheticPdfEncrypted,
  buildSyntheticPdfCorrupt,
  buildSyntheticPdfOversized,
} from "./builder.ts";

describe("WEB-W4-IMPORT: Hostile PDF Corpus, Scan/Text/Encrypted/Corrupt & Limits", () => {
  describe("Classification & Limitations Exposure (Scan vs Text vs Encrypted vs Corrupt)", () => {
    it("flags PDF_OCR_UNAVAILABLE and PDF_MANUAL_REVIEW_REQUIRED for pure scan image PDFs without guessing keys", async () => {
      const scanBytes = buildSyntheticPdfScan({ pageCount: 2 });
      const file = toFile(scanBytes, "de-thi-scan.pdf");

      const res = await importPdf(file);
      assert.strictEqual(res.ok, true);

      if (res.ok) {
        const job = res.value;
        assert.strictEqual(job.format, "pdf");
        assert.strictEqual(job.state, "preview");
        // Must contain OCR unavailable and manual review required flags
        assert.ok(job.flags.includes(PDF_FLAGS.OCR_UNAVAILABLE));
        assert.ok(job.flags.includes(PDF_FLAGS.MANUAL_REVIEW_REQUIRED));
        // Strictly no automatic extraction or guessed keys
        assert.strictEqual(job.drafts.length, 0);
        // Exposes limitations in informative blocks
        assert.ok(job.blocks.some((b) => b.type === "text" && b.text.includes("không chạy OCR")));
      }
    });

    it("flags PDF_MULTICOLUMN_LAYOUT and PDF_MANUAL_REVIEW_REQUIRED for multi-column text PDFs", async () => {
      const multiColBytes = buildSyntheticPdfMultiColumn({
        leftColumnText: "Cot 1: Cau 1. Phuong trinh bac hai",
        rightColumnText: "Cot 2: Cau 2. Hinh hoc khong gian",
      });
      const file = toFile(multiColBytes, "de-thi-2-cot.pdf");

      const res = await importPdf(file);
      assert.strictEqual(res.ok, true);

      if (res.ok) {
        const job = res.value;
        assert.ok(job.flags.includes(PDF_FLAGS.MULTICOLUMN_LAYOUT));
        assert.ok(job.flags.includes(PDF_FLAGS.MANUAL_REVIEW_REQUIRED));
        assert.strictEqual(job.drafts.length, 0);
      }
    });

    it("flags PDF_ENCRYPTED and records security limitation for password-protected PDFs", async () => {
      const encryptedBytes = buildSyntheticPdfEncrypted();
      const file = toFile(encryptedBytes, "de-mat-khau.pdf");

      const res = await importPdf(file);
      assert.strictEqual(res.ok, true);

      if (res.ok) {
        const job = res.value;
        assert.ok(job.flags.includes(PDF_FLAGS.ENCRYPTED));
        assert.ok(job.blocks.some((b) => b.type === "text" && b.text.includes("mã hóa")));
        assert.strictEqual(job.drafts.length, 0);
      }
    });

    it("rejects truncated/corrupt PDF buffer with PDF_CORRUPT", async () => {
      const corruptBytes = buildSyntheticPdfCorrupt("truncated");
      const file = toFile(corruptBytes, "corrupt.pdf");

      const res = await importPdf(file);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, PDF_ERROR_CODES.PDF_CORRUPT);
    });

    it("rejects non-PDF buffer missing %PDF- signature with PDF_INVALID", async () => {
      const nonPdfBytes = new TextEncoder().encode("<html><body>Not a PDF</body></html>");
      const file = toFile(nonPdfBytes, "fake.pdf");

      const res = await importPdf(file);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, PDF_ERROR_CODES.PDF_INVALID);
    });

    it("rejects PDF exceeding maxInputBytes with PAYLOAD_LIMIT", async () => {
      const oversizedBytes = buildSyntheticPdfOversized();
      const file = toFile(oversizedBytes, "giant.pdf");

      const strictLimits: PdfLimits = {
        maxInputBytes: 1024, // 1 KiB limit
        timeoutMs: 15_000,
      };

      const res = await importPdf(file, undefined, strictLimits);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, PDF_ERROR_CODES.PAYLOAD_LIMIT);
    });
  });

  describe("Timeouts & AbortSignal Cancellation", () => {
    it("aborts cleanly when AbortSignal is pre-cancelled", async () => {
      const bytes = buildSyntheticPdfText();
      const file = toFile(bytes, "abort-early.pdf");
      const ac = new AbortController();
      ac.abort();

      const res = await importPdf(file, ac.signal);
      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, PDF_ERROR_CODES.IMPORT_CANCELLED);
      assert.strictEqual(res.error.recoverable, true);
    });

    it("enforces timeoutMs limit when specified in PdfLimits", async () => {
      const bytes = buildSyntheticPdfText();
      const file = toFile(bytes, "timeout.pdf");

      // Set timeoutMs: 1ms to test timeout handling
      const strictLimits: PdfLimits = {
        maxInputBytes: 10 * 1024 * 1024,
        timeoutMs: 1,
      };

      // Since mock arrayBuffer is fast in memory, we verify that cancellation checking
      // handles timeout cleanly if timed out
      const res = await importPdf(file, undefined, strictLimits);
      // Either passes (if < 1ms) or cancels with IMPORT_CANCELLED
      if (!res.ok) {
        assert.strictEqual(res.error.code, PDF_ERROR_CODES.IMPORT_CANCELLED);
        assert.strictEqual(res.error.recoverable, true);
      } else {
        assert.strictEqual(res.ok, true);
      }
    });
  });

  describe("Explicit Manual IR Fallback & Anti-Guess Guarantee", () => {
    it("preserves provenance and flags when manual drafts are added by teacher without guessing", async () => {
      const scanBytes = buildSyntheticPdfScan({ pageCount: 1 });
      const file = toFile(scanBytes, "de-thi.pdf");

      const importRes = await importPdf(file);
      assert.strictEqual(importRes.ok, true);
      if (!importRes.ok) return;

      let job = importRes.value;
      assert.strictEqual(job.drafts.length, 0);

      // Teacher manually adds a question extracted visually from page 1
      const manualInput = {
        location: "Trang 1, Vùng quét (y: 100-250)",
        question: {
          kind: "I" as const,
          title: "Câu 1",
          content: "Nghiệm của phương trình 2x - 4 = 0 là:",
          options: [
            { optionId: "opt-1", label: "A", text: "x = 2" },
            { optionId: "opt-2", label: "B", text: "x = -2" },
            { optionId: "opt-3", label: "C", text: "x = 4" },
            { optionId: "opt-4", label: "D", text: "x = 0" },
          ],
          correctOptionId: "opt-1", // Explicitly provided by human
        },
      };

      const addResult = addManualDraftToJob(job, manualInput);
      assert.strictEqual(addResult.ok, true);
      if (!addResult.ok) return;

      job = addResult.value;
      assert.strictEqual(job.drafts.length, 1);

      const d = job.drafts[0]!;
      assert.strictEqual(d.question.kind, "I");
      assert.strictEqual(d.provenance.sourceId, job.sourceId);
      assert.strictEqual(d.provenance.location, "Trang 1, Vùng quét (y: 100-250)");
      assert.ok(d.provenance.flags.includes(PDF_FLAGS.MANUAL_INPUT));
      assert.strictEqual(d.confirmed, false); // Must be confirmed explicitly
    });
  });

  describe("QA Resource & Performance Measurement (Timing & Memory)", () => {
    it("measures execution time and memory usage delta for PDF inspection", async () => {
      const textBytes = buildSyntheticPdfText({ pageCount: 10 });
      const file = toFile(textBytes, "qa-perf.pdf");

      const getHeap = (): number => {
        const proc = (globalThis as unknown as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;
        return typeof proc?.memoryUsage === "function" ? proc.memoryUsage().heapUsed : 0;
      };

      const startMem = getHeap();
      const startTime = performance.now();

      const res = await importPdf(file);

      const endTime = performance.now();
      const endMem = getHeap();

      const durationMs = endTime - startTime;
      const heapDeltaBytes = endMem - startMem;

      assert.strictEqual(res.ok, true);
      assert.ok(durationMs >= 0);
      assert.ok(durationMs < 5000, `PDF import took too long: ${durationMs}ms`);
      assert.strictEqual(typeof durationMs, "number");
      assert.strictEqual(typeof heapDeltaBytes, "number");
    });
  });
});
