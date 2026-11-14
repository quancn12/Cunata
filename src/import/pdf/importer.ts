/**
 * Main PDF importer implementation for Cunata.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11-§12, D06, D07,
 * and Shared Product Contract v2.0 §6.
 */

import type {
  ImportJob,
  Block,
  PdfLimits,
  Result,
  WebError,
} from "./types.ts";
import {
  PROPOSED_PDF_LIMITS,
  PDF_FLAGS,
  PDF_ERROR_CODES,
} from "./types.ts";
import { inspectPdf } from "./inspector.ts";
import { checkNativePdfViewerSupport } from "./preview.ts";

function makeError(
  code: string,
  path: string,
  message: string,
  recoverable = false
): Result<never> {
  return {
    ok: false,
    error: {
      code,
      path,
      message,
      recoverable,
    },
  };
}

/**
 * Imports a PDF file under the approved D06 Option A contract:
 * - Checks PDF signature (%PDF-) and file size against limits
 * - Structural analysis: flags scans (PDF_OCR_UNAVAILABLE), multi-column layout, encryption, corruption
 * - Flags PDF_MANUAL_REVIEW_REQUIRED for human-in-the-loop validation
 * - Checks native viewer support (flags PDF_NO_NATIVE_VIEWER when absent)
 * - Returns an ImportJob in 'preview' state with empty drafts (strictly NO automatic text extraction,
 *   NO OCR promises, NO inferred answer keys, and NO automatic publication).
 */
export async function importPdf(
  file: File,
  signal?: AbortSignal,
  limits: PdfLimits = PROPOSED_PDF_LIMITS
): Promise<Result<ImportJob>> {
  // 1. Check early cancellation
  if (signal?.aborted) {
    return makeError(
      PDF_ERROR_CODES.IMPORT_CANCELLED,
      "pdf",
      "Quá trình nhập PDF đã bị hủy theo yêu cầu.",
      true
    );
  }

  // 2. Validate file parameter
  if (!file || typeof file.arrayBuffer !== "function" || typeof file.size !== "number") {
    return makeError(
      PDF_ERROR_CODES.PDF_INVALID,
      "file",
      "Tham số tệp tin không hợp lệ hoặc thiếu phương thức đọc dữ liệu."
    );
  }

  // 3. Enforce file size limit (D07 technical cap proposal)
  if (file.size > limits.maxInputBytes) {
    return makeError(
      PDF_ERROR_CODES.PAYLOAD_LIMIT,
      "file.size",
      `Dung lượng tệp PDF (${file.size} bytes) vượt quá giới hạn tối đa cho phép (${limits.maxInputBytes} bytes).`
    );
  }

  // 4. Read byte buffer with AbortSignal support
  let arrayBuffer: ArrayBuffer;
  try {
    if (signal) {
      const abortPromise = new Promise<never>((_, reject) => {
        const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
      arrayBuffer = await Promise.race([file.arrayBuffer(), abortPromise]);
    } else {
      arrayBuffer = await file.arrayBuffer();
    }
  } catch (err: unknown) {
    if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      return makeError(
        PDF_ERROR_CODES.IMPORT_CANCELLED,
        "pdf",
        "Quá trình đọc tệp PDF đã bị hủy theo yêu cầu.",
        true
      );
    }
    return makeError(
      PDF_ERROR_CODES.PDF_CORRUPT,
      "file.read",
      `Lỗi khi đọc dữ liệu tệp tin PDF: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Check cancellation again after async read
  if (signal?.aborted) {
    return makeError(
      PDF_ERROR_CODES.IMPORT_CANCELLED,
      "pdf",
      "Quá trình nhập PDF đã bị hủy theo yêu cầu.",
      true
    );
  }

  const bytes = new Uint8Array(arrayBuffer);

  // 5. Inspect PDF structure
  const inspection = inspectPdf(bytes);

  // If signature is invalid, reject immediately
  if (!inspection.signatureValid) {
    return makeError(
      PDF_ERROR_CODES.PDF_INVALID,
      "signature",
      "Tệp tin không có chữ ký PDF hợp lệ (%PDF-) trong tiêu đề."
    );
  }

  // If file is severely truncated / corrupt (< 32 bytes)
  if (inspection.isCorrupt && bytes.length < 32) {
    return makeError(
      PDF_ERROR_CODES.PDF_CORRUPT,
      "buffer",
      "Tệp tin PDF bị hỏng hoặc dữ liệu không hoàn chỉnh."
    );
  }

  // 6. Aggregate flags
  const flags: string[] = [...inspection.flags];

  // Check native viewer capability
  const hasViewer = checkNativePdfViewerSupport();
  if (!hasViewer && !flags.includes(PDF_FLAGS.NO_NATIVE_VIEWER)) {
    flags.push(PDF_FLAGS.NO_NATIVE_VIEWER);
  }

  // 7. Construct initial informative blocks
  const blocks: Block[] = [
    {
      type: "text",
      text: `Tài liệu PDF: ${file.name || "tệp tin tải lên"} (Phiên bản PDF: ${
        inspection.pdfVersion ?? "Không rõ"
      }, Dung lượng: ${file.size} bytes${
        inspection.pageCountEstimate ? `, Ước tính ${inspection.pageCountEstimate} trang` : ""
      }).`,
    },
    {
      type: "text",
      text: "Lưu ý nhập PDF (Quyết định D06 - Phương án A): Hệ thống không tự động bóc tách văn bản, không chạy OCR quét ảnh và không tự suy đoán đáp án. Vui lòng mở trình xem trước hoặc tải tệp về để xem, sau đó nhập nội dung câu hỏi thủ công.",
    },
  ];

  if (inspection.limitations.length > 0) {
    for (const lim of inspection.limitations) {
      blocks.push({
        type: "text",
        text: `[Hạn chế] ${lim}`,
      });
    }
  }

  // 8. Create ImportJob
  const jobId = `pdf-job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceId = file.name && file.name.trim() !== "" ? file.name : "pdf-upload";

  const job: ImportJob = {
    jobId,
    sourceId,
    format: "pdf",
    state: "preview",
    blocks: Object.freeze(blocks),
    drafts: Object.freeze([]), // Strictly no auto extraction or inferred answer keys
    flags: Object.freeze(flags),
  };

  return { ok: true, value: job };
}
