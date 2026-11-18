/**
 * Public entrypoint for PDF import and manual IR fallback.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11-§12, D06, D07,
 * and Shared Product Contract v2.0 §6.
 */
export { PROPOSED_PDF_LIMITS, PDF_FLAGS, PDF_ERROR_CODES, } from "./types.js";
export { inspectPdf, } from "./inspector.js";
export { checkNativePdfViewerSupport, createPdfPreviewSession, revokePdfPreviewSession, revokeAllPdfPreviewSessions, getActivePreviewSessionCount, } from "./preview.js";
export { createManualDraft, addManualDraftToJob, addManualRegionToJob, addManualBlockToJob, buildManualPartI, buildManualPartII, buildManualPartIII, } from "./manual.js";
export { importPdf, } from "./importer.js";
