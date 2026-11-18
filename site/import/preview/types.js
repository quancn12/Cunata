/**
 * Types for M5 Import Preview, Correction and Confirmation.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8-§9, §11-§12,
 * and Shared Product Contract v2.0 §6.
 */
/**
 * Warning flag constants.
 */
export const PREVIEW_FLAGS = {
    KEY_MISSING: "IMPORT_KEY_MISSING",
    OMML_UNSUPPORTED: "OMML_UNSUPPORTED",
    PDF_MANUAL_REVIEW_REQUIRED: "PDF_MANUAL_REVIEW_REQUIRED",
    PDF_OCR_UNAVAILABLE: "PDF_OCR_UNAVAILABLE",
    PDF_MANUAL_INPUT: "PDF_MANUAL_INPUT",
    IMPORT_CANCELLED: "IMPORT_CANCELLED",
    IMPORT_UNCONFIRMED: "IMPORT_UNCONFIRMED",
    ASSET_UNSAFE: "ASSET_UNSAFE",
    DUPLICATE_SOURCE: "DUPLICATE_SOURCE",
};
