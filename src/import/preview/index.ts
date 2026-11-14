/**
 * Public entrypoint for M5 Import Preview, Correction and Explicit Confirmation.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8-§9, §11-§12,
 * and Shared Product Contract v2.0 §6.
 */

export type {
  Section,
  Taxonomy,
  Block,
  Cell,
  Provenance,
  Asset,
  WebOption,
  WebStatement,
  QuestionContent,
  WebQuestion,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
  WebExam,
  ImportJob,
  ImportDraft,
  WebError,
  Result,
  ExamDraft,
  StoragePort,
  DraftPatch,
  ConfirmImportOptions,
  ImportPreviewFilterStatus,
  ImportPreviewViewModel,
  ImportPreviewActions,
} from "./types.ts";

export { PREVIEW_FLAGS } from "./types.ts";

export {
  editImport,
  confirmImport,
  cancelImport,
  failImport,
  toggleDraftConfirmed,
  confirmAllValidDrafts,
  getDraftWarnings,
  isDraftValid,
  isDraftMissingKey,
  checkDuplicateProvenance,
  deduplicateDraftsByProvenance,
  checkHostileRefs,
} from "./core.ts";

export {
  mount,
  ensurePreviewStyles,
} from "./view.ts";
