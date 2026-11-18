/**
 * Public entrypoint for M5 Import Preview, Correction and Explicit Confirmation.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8-§9, §11-§12,
 * and Shared Product Contract v2.0 §6.
 */
export { PREVIEW_FLAGS } from "./types.js";
export { editImport, confirmImport, cancelImport, failImport, toggleDraftConfirmed, confirmAllValidDrafts, getDraftWarnings, isDraftValid, isDraftMissingKey, checkDuplicateProvenance, deduplicateDraftsByProvenance, checkHostileRefs, } from "./core.js";
export { mount, ensurePreviewStyles, } from "./view.js";
