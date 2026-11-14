/**
 * Types for M5 Import Preview, Correction and Confirmation.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8-§9, §11-§12,
 * and Shared Product Contract v2.0 §6.
 */

import type {
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
} from "../../schema/types.ts";

import type {
  ExamDraft,
  StoragePort,
} from "../../teacher/types.ts";

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
};

/**
 * Patch payload for editing an ImportDraft.
 */
export interface DraftPatch {
  readonly kind?: Section;
  readonly taxonomy?: Partial<Taxonomy>;
  readonly subject?: string;
  readonly grade?: 10 | 11 | 12;
  readonly topic?: string;
  readonly lesson?: string;
  readonly difficulty?: "Nhận biết" | "Thông hiểu" | "Vận dụng";
  readonly title?: string;
  readonly content?: string;
  readonly image?: string;
  readonly explanation?: string;
  readonly blocks?: readonly Block[];
  readonly options?: readonly WebOption[];
  readonly correctOptionId?: string;
  readonly key?: string; // Convenience: can be optionId or label 'A'|'B'|'C'|'D'
  readonly statements?: readonly WebStatement[];
  readonly answerKey?: string;
  readonly confirmed?: boolean;
  readonly provenance?: Partial<Provenance>;
  readonly removeFlags?: readonly string[];
  readonly addFlags?: readonly string[];
}

/**
 * Options for confirming import into an ExamDraft.
 */
export interface ConfirmImportOptions {
  /**
   * When true, questions with duplicate source provenance (sourceId + location)
   * that already exist in the target exam are omitted from import.
   * Default: false (transfers questions, remapping IDs to prevent collisions).
   */
  readonly dedupeDuplicateProvenance?: boolean;
  /**
   * Custom ID generator for remapping questionVersionIds, optionIds, and statementIds.
   */
  readonly idGenerator?: () => string;
}

/**
 * Status and filter criteria for the preview view.
 */
export type ImportPreviewFilterStatus =
  | "all"
  | "confirmed"
  | "unconfirmed"
  | "has_warnings"
  | "missing_key";

/**
 * View model for mounting the import preview view.
 */
export interface ImportPreviewViewModel {
  readonly job: ImportJob;
  readonly selectedDraftId?: string | null;
  readonly filterKind?: Section | "all";
  readonly filterStatus?: ImportPreviewFilterStatus;
  readonly searchTerm?: string;
  readonly targetExamDraft?: ExamDraft | null;
  readonly statusMessage?: string | null;
  readonly errorMessage?: string | null;
}

/**
 * Action callbacks for the import preview view.
 */
export interface ImportPreviewActions {
  readonly onJobChange?: (job: ImportJob) => void;
  readonly onConfirm?: (exam: ExamDraft) => void;
  readonly onCancel?: () => void;
  readonly onSelectDraft?: (draftId: string | null) => void;
  readonly onError?: (error: WebError) => void;
}

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
} as const;
