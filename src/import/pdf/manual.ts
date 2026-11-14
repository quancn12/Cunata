/**
 * Manual IR fallback and provenance management for PDF documents.
 * Allows teachers and users to manually supply text, regions, blocks, and draft questions
 * into the intermediate representation (IR) without automated extraction or inferred answer keys.
 *
 * Conforms to docs/contracts/WEB-contract.md §8 and Shared Product Contract v2.0 §6.
 */

import type {
  ImportJob,
  ImportDraft,
  ManualDraftInput,
  ManualRegion,
  Block,
  WebQuestion,
  WebOption,
  WebStatement,
  Result,
  WebError,
} from "./types.ts";
import { PDF_FLAGS } from "./types.ts";

let manualDraftCounter = 0;

function makeError(code: string, path: string, message: string, recoverable = false): Result<never> {
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
 * Creates a single ImportDraft from manual user input with provenance.
 * Guarantees:
 * 1. Provenance contains sourceId, exact location, confidence: null (unless explicit), and manual flags.
 * 2. Confirmed is ALWAYS false (human confirmation required before publish).
 * 3. Never infers or invents an answer key if not provided by the user.
 */
export function createManualDraft(sourceId: string, input: ManualDraftInput): ImportDraft {
  manualDraftCounter++;
  const draftId =
    input.draftId && input.draftId.trim() !== ""
      ? input.draftId
      : `draft-manual-${Date.now().toString(36)}-${manualDraftCounter}`;

  const flags: string[] = [PDF_FLAGS.MANUAL_INPUT, PDF_FLAGS.MANUAL_REVIEW_REQUIRED];
  if (input.flags) {
    for (const f of input.flags) {
      if (!flags.includes(f)) {
        flags.push(f);
      }
    }
  }

  const provenance = {
    sourceId,
    location: input.location || "manual-input",
    confidence: input.confidence !== undefined ? input.confidence : null,
    flags: Object.freeze(flags),
  };

  return {
    draftId,
    question: input.question,
    provenance,
    confirmed: false,
  };
}

/**
 * Appends a user-supplied manual draft question into an existing ImportJob.
 */
export function addManualDraftToJob(job: ImportJob, input: ManualDraftInput): Result<ImportJob> {
  if (job.state === "confirmed") {
    return makeError(
      "IMPORT_LOCKED",
      "state",
      "Không thể thêm câu hỏi vào gói nhập đã được xác nhận hoàn tất."
    );
  }

  const draft = createManualDraft(job.sourceId, input);
  const updatedDrafts = Object.freeze([...job.drafts, draft]);

  const updatedJob: ImportJob = {
    ...job,
    drafts: updatedDrafts,
  };

  return { ok: true, value: updatedJob };
}

/**
 * Converts a selected manual region (bounding box / page text slice) into an ImportDraft
 * and appends it to the ImportJob.
 */
export function addManualRegionToJob(job: ImportJob, region: ManualRegion): Result<ImportJob> {
  if (job.state === "confirmed") {
    return makeError(
      "IMPORT_LOCKED",
      "state",
      "Không thể thêm vùng chọn vào gói nhập đã được xác nhận hoàn tất."
    );
  }

  let location = `Trang ${region.pageNumber}`;
  if (region.rect) {
    location += ` [${region.rect.x0}, ${region.rect.y0}, ${region.rect.x1}, ${region.rect.y1}]`;
  }
  if (region.label) {
    location += ` - ${region.label}`;
  }

  const question: Partial<WebQuestion> = {
    content: region.rawText,
    explanation: region.notes,
  };

  const draft = createManualDraft(job.sourceId, {
    question,
    location,
    confidence: null,
    flags: [PDF_FLAGS.MANUAL_INPUT, PDF_FLAGS.MANUAL_REVIEW_REQUIRED],
  });

  const updatedJob: ImportJob = {
    ...job,
    drafts: Object.freeze([...job.drafts, draft]),
  };

  return { ok: true, value: updatedJob };
}

/**
 * Appends a manual block (text, math, image crop, or table) to the ImportJob's blocks array.
 */
export function addManualBlockToJob(job: ImportJob, block: Block): Result<ImportJob> {
  if (job.state === "confirmed") {
    return makeError(
      "IMPORT_LOCKED",
      "state",
      "Không thể thêm khối nội dung vào gói nhập đã được xác nhận hoàn tất."
    );
  }

  const updatedJob: ImportJob = {
    ...job,
    blocks: Object.freeze([...job.blocks, block]),
  };

  return { ok: true, value: updatedJob };
}

/**
 * Builder helper for Part I manual questions.
 * Does NOT infer or guess correctOptionId if not provided.
 */
export function buildManualPartI(options: {
  readonly questionVersionId?: string;
  readonly title?: string;
  readonly content: string;
  readonly choiceTexts: readonly string[];
  readonly correctOptionId?: string;
}): Partial<WebQuestion> {
  const choiceOptions: WebOption[] = options.choiceTexts.map((text, idx) => {
    const letters = ["A", "B", "C", "D"];
    const label = letters[idx] ?? `Option ${idx + 1}`;
    const optionId = `opt-${idx + 1}`;
    return {
      optionId,
      label,
      text,
    };
  });

  const q: Record<string, unknown> = {
    kind: "I",
    questionVersionId: options.questionVersionId || `qv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: options.title,
    content: options.content,
    options: Object.freeze(choiceOptions),
  };

  // Only assign correctOptionId if explicitly provided by user
  if (options.correctOptionId !== undefined) {
    q["correctOptionId"] = options.correctOptionId;
  }

  return q as unknown as Partial<WebQuestion>;
}

/**
 * Builder helper for Part II manual questions (True/False 4 statements).
 * Does NOT guess statement answers if omitted.
 */
export function buildManualPartII(options: {
  readonly questionVersionId?: string;
  readonly title?: string;
  readonly content: string;
  readonly statementItems: readonly { readonly text: string; readonly answer?: boolean; readonly label?: string }[];
}): Partial<WebQuestion> {
  const letters = ["a", "b", "c", "d"];
  const statements: WebStatement[] = options.statementItems.map((item, idx) => {
    return {
      statementId: `stmt-${idx + 1}`,
      label: item.label ?? letters[idx] ?? `${idx + 1}`,
      text: item.text,
      answer: item.answer ?? false,
    };
  });

  const q: Record<string, unknown> = {
    kind: "II",
    questionVersionId: options.questionVersionId || `qv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: options.title,
    content: options.content,
    statements: Object.freeze(statements),
  };

  return q as unknown as Partial<WebQuestion>;
}

/**
 * Builder helper for Part III manual questions (Short answer string <= 4 characters).
 * Preserves exact raw string, does NOT normalize or infer.
 */
export function buildManualPartIII(options: {
  readonly questionVersionId?: string;
  readonly title?: string;
  readonly content: string;
  readonly answerKey?: string;
}): Partial<WebQuestion> {
  const q: Record<string, unknown> = {
    kind: "III",
    questionVersionId: options.questionVersionId || `qv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title: options.title,
    content: options.content,
  };

  // Only set answerKey if explicitly given by user
  if (options.answerKey !== undefined) {
    q["answerKey"] = options.answerKey;
  }

  return q as unknown as Partial<WebQuestion>;
}
