/**
 * Type definitions for PDF import and manual IR fallback.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11-§12 and Shared Product Contract v2.0 §6.
 */
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
};
/**
 * Error codes used during PDF import.
 * WEB-contract.md §11.
 */
export const PDF_ERROR_CODES = {
    PAYLOAD_LIMIT: "PAYLOAD_LIMIT",
    PDF_INVALID: "PDF_INVALID",
    PDF_CORRUPT: "PDF_CORRUPT",
    IMPORT_CANCELLED: "IMPORT_CANCELLED",
};
/**
 * Proposed default technical caps per WEB-contract.md §8:
 * - maxInputBytes: 10 MiB (10 * 1024 * 1024 bytes)
 * - timeoutMs: 15,000 ms (15 seconds)
 * Note: D07 remains pending Product Owner decision.
 */
export const PROPOSED_PDF_LIMITS = {
    maxInputBytes: 10 * 1024 * 1024,
    timeoutMs: 15_000,
};
