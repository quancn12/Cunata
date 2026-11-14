/**
 * Public entrypoint for PDF import and manual IR fallback.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8, §11-§12, D06, D07,
 * and Shared Product Contract v2.0 §6.
 */

export type {
  PdfLimits,
  PdfInspectionResult,
  PdfPreviewSession,
  ManualRegion,
  ManualDraftInput,
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
} from "./types.ts";

export {
  PROPOSED_PDF_LIMITS,
  PDF_FLAGS,
  PDF_ERROR_CODES,
} from "./types.ts";

export {
  inspectPdf,
} from "./inspector.ts";

export {
  checkNativePdfViewerSupport,
  createPdfPreviewSession,
  revokePdfPreviewSession,
  revokeAllPdfPreviewSessions,
  getActivePreviewSessionCount,
} from "./preview.ts";

export {
  createManualDraft,
  addManualDraftToJob,
  addManualRegionToJob,
  addManualBlockToJob,
  buildManualPartI,
  buildManualPartII,
  buildManualPartIII,
} from "./manual.ts";

export {
  importPdf,
} from "./importer.ts";
