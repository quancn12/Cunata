import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { importPdf } from "../../src/import/pdf/importer.ts";
import { PROPOSED_PDF_LIMITS, PDF_ERROR_CODES } from "../../src/import/pdf/types.ts";
import {
  toFile,
  buildSyntheticPdfText,
  buildSyntheticPdfCorrupt,
  buildSyntheticPdfOversized,
} from "./builder.ts";

describe("PDF Import: Signature and Header Validation", () => {
  it("accepts valid PDF 1.4 header and signature", async () => {
    const bytes = buildSyntheticPdfText({ version: "1.4" });
    const file = toFile(bytes, "math-1.4.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.format, "pdf");
    assert.equal(res.value.sourceId, "math-1.4.pdf");
    assert.equal(res.value.state, "preview");
  });

  it("accepts valid PDF 1.7 header and signature", async () => {
    const bytes = buildSyntheticPdfText({ version: "1.7" });
    const file = toFile(bytes, "physics-1.7.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.format, "pdf");
    assert.equal(res.value.sourceId, "physics-1.7.pdf");
  });

  it("accepts valid PDF 2.0 header and signature", async () => {
    const bytes = buildSyntheticPdfText({ version: "2.0" });
    const file = toFile(bytes, "chem-2.0.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.value.format, "pdf");
    assert.equal(res.value.sourceId, "chem-2.0.pdf");
  });

  it("rejects file with missing %PDF- signature", async () => {
    const bytes = buildSyntheticPdfCorrupt("no_signature");
    const file = toFile(bytes, "not-a-pdf.txt", "text/plain");

    const res = await importPdf(file);
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.error.code, PDF_ERROR_CODES.PDF_INVALID);
    assert.equal(res.error.path, "signature");
    assert.equal(typeof res.error.message, "string");
  });

  it("rejects empty file (0 bytes)", async () => {
    const bytes = buildSyntheticPdfCorrupt("empty_bytes");
    const file = toFile(bytes, "empty.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.error.code, PDF_ERROR_CODES.PDF_INVALID);
  });

  it("rejects short file (< 5 bytes)", async () => {
    const bytes = new TextEncoder().encode("%PD");
    const file = toFile(bytes, "short.pdf");

    const res = await importPdf(file);
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.error.code, PDF_ERROR_CODES.PDF_INVALID);
  });

  it("rejects garbage binary buffer", async () => {
    const bytes = buildSyntheticPdfCorrupt("garbage_bytes");
    const file = toFile(bytes, "random.bin", "application/octet-stream");

    const res = await importPdf(file);
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.error.code, PDF_ERROR_CODES.PDF_INVALID);
  });
});

describe("PDF Import: File Size Caps (D07 Technical Limit)", () => {
  it("rejects file exceeding default 10 MiB limit with PAYLOAD_LIMIT", async () => {
    // 10 MiB + 1 KiB
    const oversizedBytes = buildSyntheticPdfOversized(10 * 1024 * 1024 + 1024);
    const file = toFile(oversizedBytes, "oversized.pdf");

    assert.equal(file.size > PROPOSED_PDF_LIMITS.maxInputBytes, true);

    const res = await importPdf(file);
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.error.code, PDF_ERROR_CODES.PAYLOAD_LIMIT);
    assert.equal(res.error.path, "file.size");
    assert.equal(res.error.recoverable, false);
  });

  it("respects custom size limits passed via limits parameter", async () => {
    // File size ~500 bytes
    const bytes = buildSyntheticPdfText();
    const file = toFile(bytes, "test.pdf");

    // Custom limit of 100 bytes
    const customLimits = {
      maxInputBytes: 100,
      timeoutMs: 5000,
    };

    const res = await importPdf(file, undefined, customLimits);
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.error.code, PDF_ERROR_CODES.PAYLOAD_LIMIT);
    assert.equal(res.error.path, "file.size");
  });

  it("accepts file strictly within the size cap", async () => {
    const bytes = buildSyntheticPdfText();
    const file = toFile(bytes, "within-cap.pdf");

    const customLimits = {
      maxInputBytes: bytes.length + 100,
      timeoutMs: 5000,
    };

    const res = await importPdf(file, undefined, customLimits);
    assert.equal(res.ok, true);
  });
});

describe("PDF Import: AbortSignal and Cancellation", () => {
  it("cancels immediately when signal is already aborted prior to import", async () => {
    const bytes = buildSyntheticPdfText();
    const file = toFile(bytes, "test.pdf");

    const controller = new AbortController();
    controller.abort();

    const res = await importPdf(file, controller.signal);
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.error.code, PDF_ERROR_CODES.IMPORT_CANCELLED);
    assert.equal(res.error.path, "pdf");
    assert.equal(res.error.recoverable, true);
  });

  it("cancels when abort signal fires during arrayBuffer read", async () => {
    const controller = new AbortController();

    // Mock a file whose arrayBuffer delays until abort
    const bytes = buildSyntheticPdfText();
    const mockFile = {
      name: "delayed.pdf",
      size: bytes.length,
      async arrayBuffer(): Promise<ArrayBuffer> {
        return new Promise((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      },
    } as unknown as File;

    const importPromise = importPdf(mockFile, controller.signal);
    controller.abort();

    const res = await importPromise;
    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.equal(res.error.code, PDF_ERROR_CODES.IMPORT_CANCELLED);
    assert.equal(res.error.recoverable, true);
  });
});
