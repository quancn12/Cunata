import type {
  ExamVersion,
  QuestionI,
  QuestionII,
  QuestionIII,
  ValidationIssue,
  ExamMax,
  SectionCounts,
} from "../domain/index.ts";
import {
  computeExamMax,
  validateExamVersion,
  checkShortAnswer,
  MAX_QUESTIONS_PER_EXAM,
  rational,
} from "../domain/index.ts";
import type {
  ExamDraft,
  DraftPatch,
  DraftAction,
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamSettings,
  Section,
  ReleasePolicy,
  Taxonomy,
  Block,
  Cell,
  Asset,
  Provenance,
  QuestionContent,
  StoragePort,
  WebError,
  Result,
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
} from "./types.ts";

export type {
  ExamDraft,
  DraftPatch,
  DraftAction,
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamSettings,
  Section,
  ReleasePolicy,
  Taxonomy,
  Block,
  Cell,
  Asset,
  Provenance,
  QuestionContent,
  StoragePort,
  WebError,
  Result,
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
};

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function deepClone<T>(val: T): T {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => deepClone(item)) as unknown as T;
  }
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val)) {
    copy[k] = deepClone(v);
  }
  return copy as T;
}

function deepFreeze<T>(val: T): T {
  if (val === null || typeof val !== "object") {
    return val;
  }
  if (Object.isFrozen(val)) {
    return val;
  }
  Object.freeze(val);
  if (Array.isArray(val)) {
    for (const item of val) {
      deepFreeze(item);
    }
  } else {
    for (const v of Object.values(val as Record<string, unknown>)) {
      deepFreeze(v);
    }
  }
  return val;
}

/**
 * Creates an editable ExamDraft from a WebExam.
 * Preserves source-edit isolation by deep cloning the incoming exam.
 */
export function createDraft(exam: WebExam, draftId: string): ExamDraft {
  const safeId = typeof draftId === "string" && draftId.length > 0 ? draftId : `draft-${Date.now()}`;
  return Object.freeze({
    draftId: safeId,
    revision: 1,
    exam: deepFreeze(deepClone(exam)),
  });
}

/**
 * Computes maximum possible scores for the draft using domain computeExamMax.
 * Returns zeros if exam has no questions without throwing.
 */
export function computeDraftMax(draft: ExamDraft): ExamMax {
  const questions = draft.exam.questions ?? [];
  let n1 = 0;
  let n2 = 0;
  let n3 = 0;
  for (const q of questions) {
    if (q.kind === "I") n1++;
    else if (q.kind === "II") n2++;
    else if (q.kind === "III") n3++;
  }
  if (n1 + n2 + n3 === 0) {
    return Object.freeze({
      maxI: rational(0),
      maxII: rational(0),
      pointIII: rational(0),
      maxIII: rational(0),
      maxTotal: rational(0),
    });
  }
  return computeExamMax({ n1, n2, n3 });
}

/**
 * Returns distinct active sections present in the draft, sorted ['I', 'II', 'III'].
 */
export function getDraftSections(draft: ExamDraft): readonly Section[] {
  const present = new Set<Section>();
  for (const q of draft.exam.questions ?? []) {
    if (q.kind === "I" || q.kind === "II" || q.kind === "III") {
      present.add(q.kind);
    }
  }
  const ordered: Section[] = [];
  if (present.has("I")) ordered.push("I");
  if (present.has("II")) ordered.push("II");
  if (present.has("III")) ordered.push("III");
  return Object.freeze(ordered);
}

/**
 * Independent section toggle.
 * When enabled is false, removes all questions belonging to that section.
 */
export function toggleSection(
  draft: ExamDraft,
  section: Section,
  enabled: boolean,
): Result<ExamDraft> {
  if (section !== "I" && section !== "II" && section !== "III") {
    return {
      ok: false,
      error: {
        code: "SECTION_UNKNOWN",
        path: "section",
        message: `Unknown section: ${String(section)}`,
        recoverable: true,
      },
    };
  }

  const currentQuestions = draft.exam.questions ?? [];
  let updatedQuestions: readonly WebQuestion[];
  if (!enabled) {
    updatedQuestions = currentQuestions.filter((q) => q.kind !== section);
  } else {
    updatedQuestions = [...currentQuestions];
  }

  const updatedExam: WebExam = {
    ...draft.exam,
    questions: updatedQuestions,
  };

  return {
    ok: true,
    value: Object.freeze({
      draftId: draft.draftId,
      revision: draft.revision + 1,
      exam: deepFreeze(deepClone(updatedExam)),
    }),
  };
}

/**
 * Reorders questions within the draft by moving a question from fromIndex to toIndex.
 */
export function reorderQuestions(
  draft: ExamDraft,
  fromIndex: number,
  toIndex: number,
): Result<ExamDraft> {
  const questions = [...(draft.exam.questions ?? [])];
  if (
    !Number.isSafeInteger(fromIndex) ||
    !Number.isSafeInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= questions.length ||
    toIndex < 0 ||
    toIndex >= questions.length
  ) {
    return {
      ok: false,
      error: {
        code: "INDEX_OUT_OF_BOUNDS",
        path: "questions",
        message: `Invalid reorder indices: fromIndex=${fromIndex}, toIndex=${toIndex}, length=${questions.length}`,
        recoverable: true,
      },
    };
  }

  const [moved] = questions.splice(fromIndex, 1);
  if (!moved) {
    return {
      ok: false,
      error: {
        code: "INDEX_OUT_OF_BOUNDS",
        path: "questions",
        message: "Question to move was undefined",
        recoverable: true,
      },
    };
  }
  questions.splice(toIndex, 0, moved);

  const updatedExam: WebExam = {
    ...draft.exam,
    questions,
  };

  return {
    ok: true,
    value: Object.freeze({
      draftId: draft.draftId,
      revision: draft.revision + 1,
      exam: deepFreeze(deepClone(updatedExam)),
    }),
  };
}

/**
 * Reorders questions by a list of questionVersionIds.
 */
export function reorderQuestionsById(
  draft: ExamDraft,
  order: readonly string[],
): Result<ExamDraft> {
  const currentQuestions = draft.exam.questions ?? [];
  const map = new Map<string, WebQuestion>();
  for (const q of currentQuestions) {
    map.set(q.questionVersionId, q);
  }

  if (order.length !== currentQuestions.length) {
    return {
      ok: false,
      error: {
        code: "ORDER_MISMATCH",
        path: "questions",
        message: `Order array length (${order.length}) does not match draft questions length (${currentQuestions.length})`,
        recoverable: true,
      },
    };
  }

  const newQuestions: WebQuestion[] = [];
  for (const id of order) {
    const q = map.get(id);
    if (!q) {
      return {
        ok: false,
        error: {
          code: "QUESTION_NOT_FOUND",
          path: "questions",
          message: `Question id "${id}" in order array not found in draft`,
          recoverable: true,
        },
      };
    }
    newQuestions.push(q);
  }

  const updatedExam: WebExam = {
    ...draft.exam,
    questions: newQuestions,
  };

  return {
    ok: true,
    value: Object.freeze({
      draftId: draft.draftId,
      revision: draft.revision + 1,
      exam: deepFreeze(deepClone(updatedExam)),
    }),
  };
}

/**
 * Duplicates a question in the draft with full ID and key remapping.
 * Part I: Generates new optionIds and remaps correctOptionId to the new ID.
 * Part II: Generates new statementIds while preserving boolean answers.
 * Part III: Generates new questionVersionId while preserving answerKey.
 */
export function duplicateQuestion(
  draft: ExamDraft,
  questionVersionId: string,
  idGenerator?: () => string,
): Result<ExamDraft> {
  const questions = [...(draft.exam.questions ?? [])];
  const index = questions.findIndex((q) => q.questionVersionId === questionVersionId);
  if (index === -1) {
    return {
      ok: false,
      error: {
        code: "QUESTION_NOT_FOUND",
        path: "questions",
        message: `Question "${questionVersionId}" not found in draft`,
        recoverable: true,
      },
    };
  }

  const original = questions[index]!;
  let genCounter = 0;
  const genId = idGenerator ?? (() => `${questionVersionId}-dup-${++genCounter}-${Math.random().toString(36).slice(2, 7)}`);

  let duplicated: WebQuestion;

  if (original.kind === "I") {
    const newVersionId = genId();
    const idMap = new Map<string, string>();
    const newOptions: WebOption[] = original.options.map((opt) => {
      const newOptId = genId();
      idMap.set(opt.optionId, newOptId);
      return {
        ...opt,
        optionId: newOptId,
      };
    });

    const newCorrectId = idMap.get(original.correctOptionId) ?? original.correctOptionId;
    duplicated = {
      ...original,
      questionVersionId: newVersionId,
      options: newOptions,
      correctOptionId: newCorrectId,
    };
  } else if (original.kind === "II") {
    const newVersionId = genId();
    const newStatements: WebStatement[] = original.statements.map((stmt) => {
      const newStmtId = genId();
      return {
        ...stmt,
        statementId: newStmtId,
      };
    });
    duplicated = {
      ...original,
      questionVersionId: newVersionId,
      statements: newStatements,
    };
  } else {
    // Kind III
    const newVersionId = genId();
    duplicated = {
      ...original,
      questionVersionId: newVersionId,
    };
  }

  questions.splice(index + 1, 0, duplicated);

  const updatedExam: WebExam = {
    ...draft.exam,
    questions,
  };

  return {
    ok: true,
    value: Object.freeze({
      draftId: draft.draftId,
      revision: draft.revision + 1,
      exam: deepFreeze(deepClone(updatedExam)),
    }),
  };
}

/**
 * Appends a question to the draft.
 */
export function addQuestionToDraft(
  draft: ExamDraft,
  question: WebQuestion,
): Result<ExamDraft> {
  if (!isRecord(question) || typeof question.kind !== "string") {
    return {
      ok: false,
      error: {
        code: "QUESTION_INVALID",
        path: "question",
        message: "Question must be a valid WebQuestion object",
        recoverable: true,
      },
    };
  }
  const questions = [...(draft.exam.questions ?? []), deepClone(question)];
  const updatedExam: WebExam = {
    ...draft.exam,
    questions,
  };
  return {
    ok: true,
    value: Object.freeze({
      draftId: draft.draftId,
      revision: draft.revision + 1,
      exam: deepFreeze(deepClone(updatedExam)),
    }),
  };
}

/**
 * Removes a question from the draft by questionVersionId.
 */
export function removeQuestionFromDraft(
  draft: ExamDraft,
  questionVersionId: string,
): Result<ExamDraft> {
  const current = draft.exam.questions ?? [];
  const filtered = current.filter((q) => q.questionVersionId !== questionVersionId);
  if (filtered.length === current.length) {
    return {
      ok: false,
      error: {
        code: "QUESTION_NOT_FOUND",
        path: "questions",
        message: `Question "${questionVersionId}" not found in draft`,
        recoverable: true,
      },
    };
  }
  const updatedExam: WebExam = {
    ...draft.exam,
    questions: filtered,
  };
  return {
    ok: true,
    value: Object.freeze({
      draftId: draft.draftId,
      revision: draft.revision + 1,
      exam: deepFreeze(deepClone(updatedExam)),
    }),
  };
}

/**
 * Updates a specific question in the draft.
 */
export function updateQuestionInDraft(
  draft: ExamDraft,
  questionVersionId: string,
  patch: Partial<WebQuestion>,
): Result<ExamDraft> {
  const questions = [...(draft.exam.questions ?? [])];
  const index = questions.findIndex((q) => q.questionVersionId === questionVersionId);
  if (index === -1) {
    return {
      ok: false,
      error: {
        code: "QUESTION_NOT_FOUND",
        path: "questions",
        message: `Question "${questionVersionId}" not found in draft`,
        recoverable: true,
      },
    };
  }
  const existing = questions[index]!;
  const merged = { ...existing, ...patch } as WebQuestion;
  questions[index] = merged;

  const updatedExam: WebExam = {
    ...draft.exam,
    questions,
  };
  return {
    ok: true,
    value: Object.freeze({
      draftId: draft.draftId,
      revision: draft.revision + 1,
      exam: deepFreeze(deepClone(updatedExam)),
    }),
  };
}

/**
 * Edits an ExamDraft with either an action object or partial properties.
 * Incomplete drafts are allowed during editing, allowing teachers to build exams incrementally.
 */
export function editDraft(draft: ExamDraft, patch: unknown): Result<ExamDraft> {
  if (!isRecord(draft) || !draft.exam) {
    return {
      ok: false,
      error: {
        code: "DRAFT_INVALID",
        path: "",
        message: "Invalid draft object",
        recoverable: false,
      },
    };
  }
  if (!isRecord(patch)) {
    return {
      ok: false,
      error: {
        code: "DRAFT_EDIT_INVALID",
        path: "",
        message: "Patch must be a non-null object",
        recoverable: true,
      },
    };
  }

  // Handle structured actions
  if (Object.hasOwn(patch, "action")) {
    const action = patch as DraftAction;
    switch (action.action) {
      case "set_title":
        if (typeof action.title !== "string") {
          return {
            ok: false,
            error: { code: "DRAFT_EDIT_INVALID", path: "title", message: "title must be a string", recoverable: true },
          };
        }
        return {
          ok: true,
          value: Object.freeze({
            draftId: draft.draftId,
            revision: draft.revision + 1,
            exam: deepFreeze(deepClone({ ...draft.exam, title: action.title })),
          }),
        };

      case "set_subject":
        if (typeof action.subject !== "string") {
          return {
            ok: false,
            error: { code: "DRAFT_EDIT_INVALID", path: "subject", message: "subject must be a string", recoverable: true },
          };
        }
        return {
          ok: true,
          value: Object.freeze({
            draftId: draft.draftId,
            revision: draft.revision + 1,
            exam: deepFreeze(deepClone({ ...draft.exam, subject: action.subject })),
          }),
        };

      case "set_grade":
        if (action.grade !== 10 && action.grade !== 11 && action.grade !== 12) {
          return {
            ok: false,
            error: { code: "DRAFT_EDIT_INVALID", path: "grade", message: "grade must be 10, 11, or 12", recoverable: true },
          };
        }
        return {
          ok: true,
          value: Object.freeze({
            draftId: draft.draftId,
            revision: draft.revision + 1,
            exam: deepFreeze(deepClone({ ...draft.exam, grade: action.grade })),
          }),
        };

      case "set_settings":
        if (!isRecord(action.settings)) {
          return {
            ok: false,
            error: { code: "DRAFT_EDIT_INVALID", path: "settings", message: "settings must be an object", recoverable: true },
          };
        }
        return {
          ok: true,
          value: Object.freeze({
            draftId: draft.draftId,
            revision: draft.revision + 1,
            exam: deepFreeze(deepClone({ ...draft.exam, settings: { ...draft.exam.settings, ...action.settings } })),
          }),
        };

      case "toggle_section":
        return toggleSection(draft, action.section, action.enabled);

      case "add_question":
        return addQuestionToDraft(draft, action.question);

      case "remove_question":
        return removeQuestionFromDraft(draft, action.questionVersionId);

      case "update_question":
        return updateQuestionInDraft(draft, action.questionVersionId, action.patch);

      case "reorder_questions":
        return reorderQuestions(draft, action.fromIndex, action.toIndex);

      case "reorder_questions_by_id":
        return reorderQuestionsById(draft, action.order);

      case "duplicate_question":
        return duplicateQuestion(draft, action.questionVersionId, action.idGenerator);

      default:
        return {
          ok: false,
          error: {
            code: "DRAFT_EDIT_INVALID",
            path: "action",
            message: `Unknown action: ${(action as { action: unknown }).action}`,
            recoverable: true,
          },
        };
    }
  }

  // Handle direct property patches
  const updatedExam: WebExam = { ...draft.exam };

  if (Object.hasOwn(patch, "title")) {
    if (typeof patch.title !== "string") {
      return {
        ok: false,
        error: { code: "DRAFT_EDIT_INVALID", path: "title", message: "title must be a string", recoverable: true },
      };
    }
    (updatedExam as { title: string }).title = patch.title;
  }

  if (Object.hasOwn(patch, "subject")) {
    if (typeof patch.subject !== "string") {
      return {
        ok: false,
        error: { code: "DRAFT_EDIT_INVALID", path: "subject", message: "subject must be a string", recoverable: true },
      };
    }
    (updatedExam as { subject: string }).subject = patch.subject;
  }

  if (Object.hasOwn(patch, "grade")) {
    if (patch.grade !== 10 && patch.grade !== 11 && patch.grade !== 12) {
      return {
        ok: false,
        error: { code: "DRAFT_EDIT_INVALID", path: "grade", message: "grade must be 10, 11, or 12", recoverable: true },
      };
    }
    (updatedExam as { grade: 10 | 11 | 12 }).grade = patch.grade;
  }

  if (Object.hasOwn(patch, "settings")) {
    if (!isRecord(patch.settings)) {
      return {
        ok: false,
        error: { code: "DRAFT_EDIT_INVALID", path: "settings", message: "settings must be an object", recoverable: true },
      };
    }
    (updatedExam as { settings: ExamSettings }).settings = {
      ...draft.exam.settings,
      ...patch.settings,
    };
  }

  if (Object.hasOwn(patch, "questions")) {
    if (!Array.isArray(patch.questions)) {
      return {
        ok: false,
        error: { code: "DRAFT_EDIT_INVALID", path: "questions", message: "questions must be an array", recoverable: true },
      };
    }
    (updatedExam as { questions: readonly WebQuestion[] }).questions = patch.questions as readonly WebQuestion[];
  }

  if (Object.hasOwn(patch, "assets")) {
    if (!Array.isArray(patch.assets)) {
      return {
        ok: false,
        error: { code: "DRAFT_EDIT_INVALID", path: "assets", message: "assets must be an array", recoverable: true },
      };
    }
    (updatedExam as { assets: readonly Asset[] }).assets = patch.assets as readonly Asset[];
  }

  return {
    ok: true,
    value: Object.freeze({
      draftId: draft.draftId,
      revision: draft.revision + 1,
      exam: deepFreeze(deepClone(updatedExam)),
    }),
  };
}

/**
 * Validates and publishes a draft to immutable storage under a new examVersionId.
 * - Requires a new versionId distinct from the draft's versionId.
 * - Prevents overwriting historical snapshots in storage.
 * - Requires explicit settings and valid keys.
 * - Projects to domain ExamVersion and validates via validateExamVersion.
 */
export async function publishDraft(
  draft: ExamDraft,
  newVersionId: string,
  storage: StoragePort,
): Promise<Result<WebExam>> {
  // 1. Version validation
  if (typeof newVersionId !== "string" || newVersionId.trim() === "") {
    return {
      ok: false,
      error: {
        code: "VERSION_INVALID",
        path: "examVersionId",
        message: "newVersionId must be a non-empty string",
        recoverable: false,
      },
    };
  }

  if (newVersionId === draft.exam.examVersionId) {
    return {
      ok: false,
      error: {
        code: "VERSION_INVALID",
        path: "examVersionId",
        message: `newVersionId must be a new version, cannot be current version "${newVersionId}"`,
        recoverable: false,
      },
    };
  }

  // 2. Storage duplicate checks (AC: portable JSON cannot overwrite historical snapshots)
  const examKey = `${draft.exam.examId}:${newVersionId}`;
  try {
    const existingByKey = await storage.getObject("exams", examKey);
    if (!existingByKey.ok) {
      return existingByKey;
    }
    if (existingByKey.value !== null) {
      return {
        ok: false,
        error: {
          code: "EXAM_VERSION_EXISTS",
          path: "examVersionId",
          message: `Exam version "${newVersionId}" already exists and cannot overwrite historical snapshots`,
          recoverable: false,
        },
      };
    }

    if (examKey !== newVersionId) {
      const existingById = await storage.getObject("exams", newVersionId);
      if (!existingById.ok) {
        return existingById;
      }
      if (existingById.value !== null) {
        return {
          ok: false,
          error: {
            code: "EXAM_VERSION_EXISTS",
            path: "examVersionId",
            message: `Exam version "${newVersionId}" already exists and cannot overwrite historical snapshots`,
            recoverable: false,
          },
        };
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "STORAGE_FAILED",
        path: "storage",
        message: `Storage check failed: ${String(err)}`,
        recoverable: true,
      },
    };
  }

  // 3. Metadata validation
  if (typeof draft.exam.title !== "string" || draft.exam.title.trim() === "") {
    return {
      ok: false,
      error: {
        code: "EXAM_METADATA_INVALID",
        path: "title",
        message: "Exam title must be a non-empty string",
        recoverable: true,
      },
    };
  }

  if (typeof draft.exam.subject !== "string" || draft.exam.subject.trim() === "") {
    return {
      ok: false,
      error: {
        code: "EXAM_METADATA_INVALID",
        path: "subject",
        message: "Exam subject must be a non-empty string",
        recoverable: true,
      },
    };
  }

  if (draft.exam.grade !== 10 && draft.exam.grade !== 11 && draft.exam.grade !== 12) {
    return {
      ok: false,
      error: {
        code: "EXAM_METADATA_INVALID",
        path: "grade",
        message: "Exam grade must be 10, 11, or 12",
        recoverable: true,
      },
    };
  }

  if (draft.exam.schemaVersion !== "web-exam-v1") {
    return {
      ok: false,
      error: {
        code: "EXAM_SCHEMA_UNSUPPORTED",
        path: "schemaVersion",
        message: `Unsupported schemaVersion: "${String(draft.exam.schemaVersion)}"`,
        recoverable: false,
      },
    };
  }

  // 4. Explicit Settings validation (cannot rely on implicit defaults)
  const settings = draft.exam.settings;
  if (!isRecord(settings)) {
    return {
      ok: false,
      error: {
        code: "EXAM_SETTINGS_INVALID",
        path: "settings",
        message: "Explicit settings are required before publication",
        recoverable: true,
      },
    };
  }

  if (
    typeof settings.durationMinutes !== "number" ||
    !Number.isSafeInteger(settings.durationMinutes) ||
    settings.durationMinutes <= 0
  ) {
    return {
      ok: false,
      error: {
        code: "EXAM_SETTINGS_INVALID",
        path: "settings.durationMinutes",
        message: "settings.durationMinutes must be a positive safe integer",
        recoverable: true,
      },
    };
  }

  if (
    settings.maxAttempts !== null &&
    (typeof settings.maxAttempts !== "number" ||
      !Number.isSafeInteger(settings.maxAttempts) ||
      settings.maxAttempts < 1)
  ) {
    return {
      ok: false,
      error: {
        code: "EXAM_SETTINGS_INVALID",
        path: "settings.maxAttempts",
        message: "settings.maxAttempts must be null or an integer >= 1 (advisory local)",
        recoverable: true,
      },
    };
  }

  if (settings.releasePolicy !== "immediate" && settings.releasePolicy !== "after_deadline") {
    return {
      ok: false,
      error: {
        code: "EXAM_SETTINGS_INVALID",
        path: "settings.releasePolicy",
        message: 'settings.releasePolicy must be "immediate" or "after_deadline"',
        recoverable: true,
      },
    };
  }

  if (typeof settings.shuffleQuestions !== "boolean") {
    return {
      ok: false,
      error: {
        code: "EXAM_SETTINGS_INVALID",
        path: "settings.shuffleQuestions",
        message: "settings.shuffleQuestions must be boolean",
        recoverable: true,
      },
    };
  }

  if (typeof settings.shuffleOptions !== "boolean") {
    return {
      ok: false,
      error: {
        code: "EXAM_SETTINGS_INVALID",
        path: "settings.shuffleOptions",
        message: "settings.shuffleOptions must be boolean",
        recoverable: true,
      },
    };
  }

  // 5. Questions existence and bounds
  const questions = draft.exam.questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    return {
      ok: false,
      error: {
        code: "EXAM_EMPTY",
        path: "questions",
        message: "Cannot publish an exam with no questions",
        recoverable: true,
      },
    };
  }

  if (questions.length > MAX_QUESTIONS_PER_EXAM) {
    return {
      ok: false,
      error: {
        code: "LIMIT_EXCEEDED",
        path: "questions",
        message: `questions length exceeds maximum (${MAX_QUESTIONS_PER_EXAM})`,
        recoverable: true,
      },
    };
  }

  // 6. Keys and Question structure validation
  const seenQVersionIds = new Set<string>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    const qPath = `questions[${i}]`;

    if (!isRecord(q)) {
      return {
        ok: false,
        error: { code: "TYPE_MISMATCH", path: qPath, message: "Question must be an object", recoverable: true },
      };
    }

    if (typeof q.questionVersionId !== "string" || q.questionVersionId === "") {
      return {
        ok: false,
        error: { code: "ID_EMPTY", path: `${qPath}.questionVersionId`, message: "questionVersionId must not be empty", recoverable: true },
      };
    }

    if (seenQVersionIds.has(q.questionVersionId)) {
      return {
        ok: false,
        error: { code: "ID_DUPLICATE", path: `${qPath}.questionVersionId`, message: `Duplicate questionVersionId: "${q.questionVersionId}"`, recoverable: true },
      };
    }
    seenQVersionIds.add(q.questionVersionId);

    if (q.kind === "I") {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        return {
          ok: false,
          error: { code: "I_OPTION_COUNT", path: `${qPath}.options`, message: "Part I question must have exactly 4 options", recoverable: true },
        };
      }
      const optIds = new Set<string>();
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        if (!isRecord(opt) || typeof opt.optionId !== "string" || opt.optionId === "") {
          return {
            ok: false,
            error: { code: "ID_EMPTY", path: `${qPath}.options[${j}].optionId`, message: "optionId must not be empty", recoverable: true },
          };
        }
        if (optIds.has(opt.optionId)) {
          return {
            ok: false,
            error: { code: "ID_DUPLICATE", path: `${qPath}.options[${j}].optionId`, message: `Duplicate optionId: "${opt.optionId}"`, recoverable: true },
          };
        }
        optIds.add(opt.optionId);
      }
      if (typeof q.correctOptionId !== "string" || !optIds.has(q.correctOptionId)) {
        return {
          ok: false,
          error: {
            code: "I_KEY_NOT_IN_OPTIONS",
            path: `${qPath}.correctOptionId`,
            message: `correctOptionId "${String(q.correctOptionId)}" not found in options`,
            recoverable: true,
          },
        };
      }
    } else if (q.kind === "II") {
      if (!Array.isArray(q.statements) || q.statements.length !== 4) {
        return {
          ok: false,
          error: { code: "II_STATEMENT_COUNT", path: `${qPath}.statements`, message: "Part II question must have exactly 4 statements", recoverable: true },
        };
      }
      const stmtIds = new Set<string>();
      for (let j = 0; j < q.statements.length; j++) {
        const stmt = q.statements[j];
        if (!isRecord(stmt) || typeof stmt.statementId !== "string" || stmt.statementId === "") {
          return {
            ok: false,
            error: { code: "ID_EMPTY", path: `${qPath}.statements[${j}].statementId`, message: "statementId must not be empty", recoverable: true },
          };
        }
        if (stmtIds.has(stmt.statementId)) {
          return {
            ok: false,
            error: { code: "ID_DUPLICATE", path: `${qPath}.statements[${j}].statementId`, message: `Duplicate statementId: "${stmt.statementId}"`, recoverable: true },
          };
        }
        stmtIds.add(stmt.statementId);
        if (typeof stmt.answer !== "boolean") {
          return {
            ok: false,
            error: {
              code: "II_ANSWER_NOT_BOOLEAN",
              path: `${qPath}.statements[${j}].answer`,
              message: "Statement answer must be boolean",
              recoverable: true,
            },
          };
        }
      }
    } else if (q.kind === "III") {
      if (typeof q.answerKey !== "string") {
        return {
          ok: false,
          error: { code: "TYPE_MISMATCH", path: `${qPath}.answerKey`, message: "answerKey must be a string", recoverable: true },
        };
      }
      const issues = checkShortAnswer(q.answerKey);
      if (issues.length > 0) {
        return {
          ok: false,
          error: {
            code: "III_KEY_INVALID",
            path: `${qPath}.answerKey`,
            message: `Invalid Part III answerKey: ${issues[0] ?? "invalid"}`,
            recoverable: true,
          },
        };
      }
    } else {
      return {
        ok: false,
        error: { code: "QUESTION_KIND_UNKNOWN", path: `${qPath}.kind`, message: `Unknown question kind: ${String((q as { kind: unknown }).kind)}`, recoverable: true },
      };
    }
  }

  // 7. Domain validateExamVersion check
  const domainExam: ExamVersion = {
    examId: draft.exam.examId,
    examVersionId: newVersionId,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions: questions.map((q) => {
      if (q.kind === "I") {
        const qI = q as Extract<WebQuestion, { kind: "I" }>;
        return {
          kind: "I" as const,
          questionVersionId: qI.questionVersionId,
          options: qI.options.map((o: WebOption) => ({ optionId: o.optionId })),
          correctOptionId: qI.correctOptionId,
        };
      }
      if (q.kind === "II") {
        const qII = q as Extract<WebQuestion, { kind: "II" }>;
        return {
          kind: "II" as const,
          questionVersionId: qII.questionVersionId,
          statements: qII.statements.map((s: WebStatement) => ({ statementId: s.statementId, answer: s.answer })),
        };
      }
      return {
        kind: "III" as const,
        questionVersionId: q.questionVersionId,
        answerKey: q.answerKey,
      };
    }),
  };

  const domainValidation = validateExamVersion(domainExam);
  if (!domainValidation.ok) {
    const firstIssue: ValidationIssue = domainValidation.issues[0]!;
    return {
      ok: false,
      error: {
        code: firstIssue.code,
        path: firstIssue.path,
        message: firstIssue.message,
        recoverable: true,
      },
    };
  }

  // 8. Build immutable published WebExam
  const publishedExam: WebExam = deepFreeze({
    schemaVersion: "web-exam-v1",
    examId: draft.exam.examId,
    examVersionId: newVersionId,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    title: draft.exam.title,
    subject: draft.exam.subject,
    grade: draft.exam.grade,
    settings: deepFreeze(deepClone(draft.exam.settings)),
    questions: deepFreeze(deepClone(draft.exam.questions)),
    assets: deepFreeze(deepClone(draft.exam.assets ?? [])),
  });

  // 9. Store into exams store (handles transaction failure)
  try {
    const putRes = await storage.putObject("exams", examKey, publishedExam, null);
    if (!putRes.ok) {
      return {
        ok: false,
        error: putRes.error,
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "STORAGE_FAILED",
        path: "storage",
        message: `Failed to put published exam: ${String(err)}`,
        recoverable: true,
      },
    };
  }

  return {
    ok: true,
    value: publishedExam,
  };
}
