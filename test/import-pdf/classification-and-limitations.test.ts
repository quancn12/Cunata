import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { importPdf } from "../../src/import/pdf/importer.ts";
import { inspectPdf } from "../../src/import/pdf/inspector.ts";
import { PDF_FLAGS } from "../../src/import/pdf/types.ts";
import {
  toFile,
  buildSyntheticPdfText,
  buildSyntheticPdfScan,
  buildSyntheticPdfMultiColumn,
  buildSyntheticPdfEncrypted,
  buildSyntheticPdfCorrupt,
} from "./builder.ts";

describe("PDF Classification: Scans, Text-Layers, and Multicolumn Layouts", () => {
  it("detects text-layer PDF and assigns PDF_TEXT_LAYER_DETECTED and PDF_MANUAL_REVIEW_REQUIRED", async () => {
    const bytes = buildSyntheticPdfText({ text: "Cau hoi trac nghiem hoa hoc" });
    const file = toFile(bytes, "text-layer.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.flags.includes(PDF_FLAGS.TEXT_LAYER_DETECTED), true);
    assert.equal(res.value.flags.includes(PDF_FLAGS.MANUAL_REVIEW_REQUIRED), true);
    assert.equal(res.value.flags.includes(PDF_FLAGS.OCR_UNAVAILABLE), false);
    assert.equal(res.value.flags.includes(PDF_FLAGS.ENCRYPTED), false);
  });

  it("detects pure scanned image PDF and assigns PDF_OCR_UNAVAILABLE", async () => {
    const bytes = buildSyntheticPdfScan({ imageWidth: 800, imageHeight: 1200 });
    const file = toFile(bytes, "scan-de-thi.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.flags.includes(PDF_FLAGS.OCR_UNAVAILABLE), true);
    assert.equal(res.value.flags.includes(PDF_FLAGS.MANUAL_REVIEW_REQUIRED), true);
    assert.equal(res.value.flags.includes(PDF_FLAGS.TEXT_LAYER_DETECTED), false);

    // Verify limitation notice is communicated in blocks
    const hasOcrWarning = res.value.blocks.some(
      (b) => b.type === "text" && b.text.includes("OCR tự động chưa khả dụng")
    );
    assert.equal(hasOcrWarning, true);
  });

  it("detects multi-column PDF layout and assigns PDF_MULTICOLUMN_LAYOUT", async () => {
    const bytes = buildSyntheticPdfMultiColumn({
      leftColumnText: "Cot 1 Cau 1",
      rightColumnText: "Cot 2 Cau 2",
    });
    const file = toFile(bytes, "multicolumn.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.flags.includes(PDF_FLAGS.MULTICOLUMN_LAYOUT), true);
    assert.equal(res.value.flags.includes(PDF_FLAGS.MANUAL_REVIEW_REQUIRED), true);

    const hasColumnWarning = res.value.blocks.some(
      (b) => b.type === "text" && b.text.includes("bố cục đa cột")
    );
    assert.equal(hasColumnWarning, true);
  });

  it("detects password-protected/encrypted PDF and assigns PDF_ENCRYPTED", async () => {
    const bytes = buildSyntheticPdfEncrypted();
    const file = toFile(bytes, "protected.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.flags.includes(PDF_FLAGS.ENCRYPTED), true);
    assert.equal(res.value.flags.includes(PDF_FLAGS.MANUAL_REVIEW_REQUIRED), true);

    const hasEncryptedWarning = res.value.blocks.some(
      (b) => b.type === "text" && b.text.includes("mã hóa hoặc cài đặt mật khẩu")
    );
    assert.equal(hasEncryptedWarning, true);
  });

  it("detects corrupted/truncated PDF missing %%EOF", () => {
    const bytes = buildSyntheticPdfCorrupt("missing_eof");
    const inspection = inspectPdf(bytes);

    assert.equal(inspection.signatureValid, true);
    assert.equal(inspection.isCorrupt, true);
    assert.equal(inspection.flags.includes(PDF_FLAGS.CORRUPT), true);
    assert.equal(inspection.limitations.some((lim) => lim.includes("%%EOF")), true);
  });

  it("estimates page count accurately for multi-page documents", async () => {
    const bytes = buildSyntheticPdfText({ pageCount: 3 });
    const file = toFile(bytes, "three-pages.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const infoBlock = res.value.blocks.find(
      (b) => b.type === "text" && b.text.includes("Ước tính 3 trang")
    );
    assert.notEqual(infoBlock, undefined);
  });
});

describe("PDF Import: AC Guarantees & Constraints", () => {
  it("AC: produces NO automatic question extraction drafts upon import", async () => {
    const bytes = buildSyntheticPdfText({ text: "Cau 1: A. 1 B. 2 C. 3 D. 4" });
    const file = toFile(bytes, "exam.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    // AC: drafts MUST be completely empty, no automatic extraction promise
    assert.deepEqual(res.value.drafts, []);
  });

  it("AC: imports to 'preview' state, NEVER automatically published", async () => {
    const bytes = buildSyntheticPdfText();
    const file = toFile(bytes, "draft.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.state, "preview");
  });

  it("AC: flags PDF_MANUAL_REVIEW_REQUIRED unconditionally", async () => {
    const bytes = buildSyntheticPdfText();
    const file = toFile(bytes, "review-required.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.flags.includes(PDF_FLAGS.MANUAL_REVIEW_REQUIRED), true);
  });

  it("AC: flags PDF_NO_NATIVE_VIEWER when host environment lacks viewer", async () => {
    const bytes = buildSyntheticPdfText();
    const file = toFile(bytes, "headless.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    // In Node.js, navigator.pdfViewerEnabled is undefined/false, so flag must be present
    assert.equal(res.value.flags.includes(PDF_FLAGS.NO_NATIVE_VIEWER), true);
  });
});
