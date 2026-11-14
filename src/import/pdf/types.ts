/**
 * Type definitions for PDF import and manual IR fallback.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11-§12 and Shared Product Contract v2.0 §6.
 */

import type {
  ImportJob,
  ImportDraft,
  Provenance,
  Block,
  Cell,
  WebQuestion,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
  WebOption,
  WebStatement,
  Section,
  WebError,
  Result,
} from "../../schema/types.ts";

export type {
  ImportJob,
  ImportDraft,
  Provenance,
  Block,
  Cell,
  WebQuestion,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
  WebOption,
  WebStatement,
  Section,
  WebError,
  Result,
};

/**
 * Standard flags for PDF processing in Cunata.
 * WEB-contract.md §8 and §11.
 */
export const PDF_FLAGS = {
  /** Flagged on every imported PDF: manual human review required before publishing */
  MANUAL_REVIEW_REQUIRED: "PDF_MANUAL_REVIEW_REQUIRED",
  /** Flagged when document is an image scan: OCR is unavailable in zero-dependency MVP */
  OCR_UNAVAILABLE: "PDF_OCR_UNAVAILABLE",
  /** Flagged when PDF is password-protected or encrypted */
  ENCRYPTED: "PDF_ENCRYPTED",
  /** Flagged when PDF structure is corrupt or truncated */
  CORRUPT: "PDF_CORRUPT",
  /** Flagged when native PDF viewer is not supported in the host environment */
  NO_NATIVE_VIEWER: "PDF_NO_NATIVE_VIEWER",
  /** Flagged when multi-column layout is detected: reading flow is not automatically altered */
  MULTICOLUMN_LAYOUT: "PDF_MULTICOLUMN_LAYOUT",
  /** Flagged when native text layer is detected */
  TEXT_LAYER_DETECTED: "PDF_TEXT_LAYER_DETECTED",
  /** Flagged on manual user-supplied questions and regions */
  MANUAL_INPUT: "PDF_MANUAL_INPUT",
} as const;

/**
 * Error codes used during PDF import.
 * WEB-contract.md §11.
 */
export const PDF_ERROR_CODES = {
  PAYLOAD_LIMIT: "PAYLOAD_LIMIT",
  PDF_INVALID: "PDF_INVALID",
  PDF_CORRUPT: "PDF_CORRUPT",
  IMPORT_CANCELLED: "IMPORT_CANCELLED",
} as const;

/**
 * Resource caps for PDF processing.
 * Proposed under D07 (WEB-contract.md §8 and §12).
 */
export interface PdfLimits {
  /** Maximum file size in bytes (default 10 MiB) */
  readonly maxInputBytes: number;
  /** Operation timeout in milliseconds (default 15,000 ms) */
  readonly timeoutMs: number;
}

/**
 * Proposed default technical caps per WEB-contract.md §8:
 * - maxInputBytes: 10 MiB (10 * 1024 * 1024 bytes)
 * - timeoutMs: 15,000 ms (15 seconds)
 * Note: D07 remains pending Product Owner decision.
 */
export const PROPOSED_PDF_LIMITS: PdfLimits = {
  maxInputBytes: 10 * 1024 * 1024,
  timeoutMs: 15_000,
};

/**
 * Structural inspection report of a PDF file.
 */
export interface PdfInspectionResult {
  readonly signatureValid: boolean;
  readonly pdfVersion: string | null;
  readonly isEncrypted: boolean;
  readonly isCorrupt: boolean;
  readonly isScanned: boolean;
  readonly hasTextLayer: boolean;
  readonly isMultiColumn: boolean;
  readonly pageCountEstimate: number | null;
  readonly flags: readonly string[];
  readonly limitations: readonly string[];
}

/**
 * Manages native preview URL and Blob URL lifecycle.
 */
export interface PdfPreviewSession {
  readonly sessionId: string;
  readonly blobUrl: string | null;
  readonly openDownloadUrl: string | null;
  readonly hasNativeViewer: boolean;
  readonly isRevoked: boolean;
  revoke(): void;
}

/**
 * User-supplied manual region in a PDF.
 */
export interface ManualRegion {
  readonly pageNumber: number;
  readonly rect?: {
    readonly x0: number;
    readonly y0: number;
    readonly x1: number;
    readonly y1: number;
  };
  readonly label?: string;
  readonly rawText: string;
  readonly notes?: string;
}

/**
 * Input for creating or appending a manual draft question.
 */
export interface ManualDraftInput {
  readonly draftId?: string;
  readonly question: Partial<WebQuestion>;
  readonly location: string;
  readonly confidence?: number | null;
  readonly flags?: readonly string[];
}
