/**
 * Core functional logic for M5 Import Preview, Correction and Confirmation.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8-§9, §11-§12,
 * and Shared Product Contract v2.0 §6.
 */

import {
  checkShortAnswer,
} from "../../domain/index.ts";

import {
  validateImportDraft,
  isHostilePath,
  isHostileDataUriOrContent,
  deepFreeze,
} from "../../schema/index.ts";

import type {
  ImportJob,
  ImportDraft,
  DraftPatch,
  ConfirmImportOptions,
  Result,
  WebError,
  WebQuestion,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
  WebOption,
  WebStatement,
  ExamDraft,
  Provenance,
  Block,
  Section,
} from "./types.ts";

import { PREVIEW_FLAGS } from "./types.ts";

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

let idCounter = 0;
function defaultIdGen(prefix: string = "imported"): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Checks if a question has any hostile image, asset or content references.
 */
export function checkHostileRefs(
  image?: string,
  blocks?: readonly Block[],
): { isHostile: boolean; reason?: string } {
  if (typeof image === "string" && image.trim() !== "") {
    if (isHostilePath(image)) {
      return { isHostile: true, reason: `Hostile image path detected: "${image}"` };
    }
    if (isHostileDataUriOrContent("image/png", image)) {
      return { isHostile: true, reason: `Hostile image data URI detected: "${image.slice(0, 40)}..."` };
    }
  }

  if (Array.isArray(blocks)) {
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "image") {
        if (typeof b.assetId === "string" && isHostilePath(b.assetId)) {
          return { isHostile: true, reason: `Hostile block image assetId: "${b.assetId}"` };
        }
      }
    }
  }

  return { isHostile: false };
}

/**
 * Checks whether an ImportDraft has a missing answer key.
 */
export function isDraftMissingKey(draft: ImportDraft): boolean {
  const q = draft.question;
  if (!q || !q.kind) return true;

  if (q.kind === "I") {
    const q1 = q as Partial<WebQuestionI>;
    if (!q1.correctOptionId || typeof q1.correctOptionId !== "string" || q1.correctOptionId.trim() === "") {
      return true;
    }
    const options = q1.options ?? [];
    if (options.length !== 4) return true;
    return !options.some((o) => o.optionId === q1.correctOptionId);
  }

  if (q.kind === "II") {
    const q2 = q as Partial<WebQuestionII>;
    const stmts = q2.statements ?? [];
    if (stmts.length !== 4) return true;
    for (const s of stmts) {
      if (typeof s.answer !== "boolean") {
        return true;
      }
    }
    return false;
  }

  if (q.kind === "III") {
    const q3 = q as Partial<WebQuestionIII>;
    if (!q3.answerKey || typeof q3.answerKey !== "string" || q3.answerKey.trim() === "") {
      return true;
    }
    const saIssues = checkShortAnswer(q3.answerKey);
    return saIssues.length > 0;
  }

  return true;
}

/**
 * Collects all active warning codes/flags for a draft.
 * Missing key, unsupported OMML, and manual PDF warnings remain until resolved.
 */
export function getDraftWarnings(draft: ImportDraft): readonly string[] {
  const warnings = new Set<string>();

  // 1. Missing key warning
  if (isDraftMissingKey(draft)) {
    warnings.add(PREVIEW_FLAGS.KEY_MISSING);
  }

  // 2. Flags already present on provenance
  const provFlags = draft.provenance?.flags ?? [];
  for (const flag of provFlags) {
    if (
      flag === PREVIEW_FLAGS.KEY_MISSING ||
      flag === "KEY_MISSING" ||
      flag === PREVIEW_FLAGS.OMML_UNSUPPORTED ||
      flag === PREVIEW_FLAGS.PDF_MANUAL_REVIEW_REQUIRED ||
      flag === PREVIEW_FLAGS.PDF_OCR_UNAVAILABLE ||
      flag === PREVIEW_FLAGS.PDF_MANUAL_INPUT ||
      flag === PREVIEW_FLAGS.ASSET_UNSAFE ||
      flag === PREVIEW_FLAGS.DUPLICATE_SOURCE
    ) {
      warnings.add(flag);
    }
  }

  // 3. Blocks inspection for unverified OMML
  const blocks = draft.question?.blocks ?? [];
  for (const block of blocks) {
    if (block.type === "math" && block.format === "omml" && !block.verified) {
      warnings.add(PREVIEW_FLAGS.OMML_UNSUPPORTED);
      break;
    }
  }

  // 4. Hostile refs
  const hostile = checkHostileRefs(draft.question?.image, draft.question?.blocks);
  if (hostile.isHostile) {
    warnings.add(PREVIEW_FLAGS.ASSET_UNSAFE);
  }

  // If key is present and valid, remove missing key warning
  if (!isDraftMissingKey(draft)) {
    warnings.delete(PREVIEW_FLAGS.KEY_MISSING);
    warnings.delete("KEY_MISSING");
  }

  return Object.freeze(Array.from(warnings));
}

/**
 * Checks if a draft is completely valid and ready for confirmation into an exam.
 */
export function isDraftValid(draft: ImportDraft): boolean {
  const issues = validateImportDraft(draft);
  if (issues.length > 0) return false;
  if (isDraftMissingKey(draft)) return false;
  const hostile = checkHostileRefs(draft.question?.image, draft.question?.blocks);
  if (hostile.isHostile) return false;
  return true;
}

/**
 * Edits an ImportDraft within an ImportJob.
 * Allows correction of kind, options, key, explanation, taxonomy, blocks, image, and flags.
 * Preserves missing key / unsupported OMML / manual PDF warnings until resolved.
 *
 * @param job The existing ImportJob
 * @param draftId ID of the draft to edit
 * @param patch Partial changes to apply
 * @returns Result with updated ImportJob
 */
export function editImport(
  job: ImportJob,
  draftId: string,
  patch: unknown,
): Result<ImportJob> {
  if (!isRecord(job) || !Array.isArray(job.drafts)) {
    return {
      ok: false,
      error: {
        code: "IMPORT_INVALID",
        path: "job",
        message: "Invalid ImportJob object",
        recoverable: false,
      },
    };
  }

  if (typeof draftId !== "string" || draftId.trim() === "") {
    return {
      ok: false,
      error: {
        code: "DRAFT_NOT_FOUND",
        path: "draftId",
        message: "draftId must be a non-empty string",
        recoverable: true,
      },
    };
  }

  if (!isRecord(patch)) {
    return {
      ok: false,
      error: {
        code: "PATCH_INVALID",
        path: "patch",
        message: "Patch must be a non-null object",
        recoverable: true,
      },
    };
  }

  const draftIndex = job.drafts.findIndex((d) => d.draftId === draftId);
  if (draftIndex === -1) {
    return {
      ok: false,
      error: {
        code: "DRAFT_NOT_FOUND",
        path: "draftId",
        message: `Import draft "${draftId}" not found in job`,
        recoverable: true,
      },
    };
  }

  const existingDraft = job.drafts[draftIndex]!;
  const existingQ = existingDraft.question ?? {};
  const typedPatch = patch as DraftPatch;

  // 1. Hostile asset check on patch
  const candidateImage = typedPatch.image !== undefined ? typedPatch.image : existingQ.image;
  const candidateBlocks = typedPatch.blocks !== undefined ? typedPatch.blocks : existingQ.blocks;
  const hostile = checkHostileRefs(candidateImage, candidateBlocks);
  if (hostile.isHostile) {
    return {
      ok: false,
      error: {
        code: "ASSET_UNSAFE",
        path: "question.image",
        message: hostile.reason ?? "Hostile image reference detected in patch",
        recoverable: true,
      },
    };
  }

  // 2. Determine target kind
  const targetKind: Section = typedPatch.kind ?? existingQ.kind ?? "I";
  if (targetKind !== "I" && targetKind !== "II" && targetKind !== "III") {
    return {
      ok: false,
      error: {
        code: "QUESTION_KIND_UNKNOWN",
        path: "kind",
        message: `Unknown question kind: "${String(targetKind)}"`,
        recoverable: true,
      },
    };
  }

  // 3. Clone and assemble question
  const updatedQ: Record<string, unknown> = deepClone(existingQ);
  updatedQ.kind = targetKind;

  // Common properties
  if (typedPatch.title !== undefined) updatedQ.title = typedPatch.title;
  if (typedPatch.content !== undefined) updatedQ.content = typedPatch.content;
  if (typedPatch.image !== undefined) updatedQ.image = typedPatch.image;
  if (typedPatch.explanation !== undefined) updatedQ.explanation = typedPatch.explanation;
  if (typedPatch.blocks !== undefined) updatedQ.blocks = deepClone(typedPatch.blocks);

  // Taxonomy correction
  if (typedPatch.taxonomy && isRecord(typedPatch.taxonomy)) {
    if (typedPatch.taxonomy.subject !== undefined) updatedQ.subject = typedPatch.taxonomy.subject;
    if (typedPatch.taxonomy.grade !== undefined) updatedQ.grade = typedPatch.taxonomy.grade;
    if (typedPatch.taxonomy.topic !== undefined) updatedQ.topic = typedPatch.taxonomy.topic;
    if (typedPatch.taxonomy.lesson !== undefined) updatedQ.lesson = typedPatch.taxonomy.lesson;
    if (typedPatch.taxonomy.difficulty !== undefined) updatedQ.difficulty = typedPatch.taxonomy.difficulty;
  }
  if (typedPatch.subject !== undefined) updatedQ.subject = typedPatch.subject;
  if (typedPatch.grade !== undefined) updatedQ.grade = typedPatch.grade;
  if (typedPatch.topic !== undefined) updatedQ.topic = typedPatch.topic;
  if (typedPatch.lesson !== undefined) updatedQ.lesson = typedPatch.lesson;
  if (typedPatch.difficulty !== undefined) updatedQ.difficulty = typedPatch.difficulty;

  // Kind-specific logic & key mapping
  if (targetKind === "I") {
    delete updatedQ.statements;
    delete updatedQ.answerKey;

    let options: WebOption[];
    if (Array.isArray(typedPatch.options)) {
      options = deepClone(typedPatch.options);
    } else if (Array.isArray(existingQ.options) && existingQ.kind === "I") {
      options = deepClone(existingQ.options);
    } else {
      // Transitioning from other kind: create 4 default options
      const labels = ["A", "B", "C", "D"];
      options = labels.map((lbl) => ({
        optionId: defaultIdGen("opt"),
        label: lbl,
        text: `Lựa chọn ${lbl}`,
      }));
    }
    updatedQ.options = options;

    // Handle key / correctOptionId correction
    let correctOptionId: string | undefined = undefined;
    if (typeof typedPatch.correctOptionId === "string") {
      correctOptionId = typedPatch.correctOptionId;
    } else if (typeof typedPatch.key === "string") {
      const keyVal = typedPatch.key.trim();
      // Check if matches label 'A'|'B'|'C'|'D'
      const matchedByLabel = options.find(
        (o) => (o.label && o.label.toUpperCase() === keyVal.toUpperCase()) || o.optionId === keyVal,
      );
      if (matchedByLabel) {
        correctOptionId = matchedByLabel.optionId;
      } else {
        correctOptionId = keyVal;
      }
    } else if (typeof existingQ.correctOptionId === "string" && existingQ.kind === "I") {
      correctOptionId = existingQ.correctOptionId;
    }

    if (correctOptionId !== undefined) {
      updatedQ.correctOptionId = correctOptionId;
    }
  } else if (targetKind === "II") {
    delete updatedQ.options;
    delete updatedQ.correctOptionId;
    delete updatedQ.answerKey;

    let statements: WebStatement[];
    if (Array.isArray(typedPatch.statements)) {
      statements = deepClone(typedPatch.statements);
    } else if (Array.isArray(existingQ.statements) && existingQ.kind === "II") {
      statements = deepClone(existingQ.statements);
    } else {
      // Transitioning from other kind: create 4 default statements
      const labels = ["a", "b", "c", "d"];
      statements = labels.map((lbl) => ({
        statementId: defaultIdGen("stmt"),
        label: lbl,
        text: `Ý ${lbl}`,
        answer: undefined as unknown as boolean,
      }));
    }
    updatedQ.statements = statements;
  } else if (targetKind === "III") {
    delete updatedQ.options;
    delete updatedQ.correctOptionId;
    delete updatedQ.statements;

    let answerKey: string = "";
    if (typeof typedPatch.answerKey === "string") {
      answerKey = typedPatch.answerKey;
    } else if (typeof typedPatch.key === "string") {
      answerKey = typedPatch.key;
    } else if (typeof existingQ.answerKey === "string" && existingQ.kind === "III") {
      answerKey = existingQ.answerKey;
    }
    updatedQ.answerKey = answerKey;
  }

  // 4. Update provenance and flags
  const existingProv = existingDraft.provenance ?? {
    sourceId: job.sourceId,
    location: "unknown",
    confidence: null,
    flags: [],
  };
  const updatedProv: Provenance = {
    sourceId: typedPatch.provenance?.sourceId ?? existingProv.sourceId,
    location: typedPatch.provenance?.location ?? existingProv.location,
    confidence: typedPatch.provenance?.confidence !== undefined
      ? typedPatch.provenance.confidence
      : existingProv.confidence,
    flags: [...existingProv.flags],
  };

  const flagsSet = new Set<string>(updatedProv.flags);

  // Apply explicit addFlags/removeFlags
  if (Array.isArray(typedPatch.removeFlags)) {
    for (const f of typedPatch.removeFlags) flagsSet.delete(f);
  }
  if (Array.isArray(typedPatch.addFlags)) {
    for (const f of typedPatch.addFlags) flagsSet.add(f);
  }

  // 5. Update confirmation status
  const confirmed = typedPatch.confirmed !== undefined
    ? Boolean(typedPatch.confirmed)
    : existingDraft.confirmed;

  const candidateDraft: ImportDraft = {
    draftId: existingDraft.draftId,
    question: updatedQ as Partial<WebQuestion>,
    provenance: {
      ...updatedProv,
      flags: Array.from(flagsSet),
    },
    confirmed,
  };

  // 6. Keep or resolve missing key warning
  if (isDraftMissingKey(candidateDraft)) {
    flagsSet.add(PREVIEW_FLAGS.KEY_MISSING);
  } else {
    flagsSet.delete(PREVIEW_FLAGS.KEY_MISSING);
    flagsSet.delete("KEY_MISSING");
  }

  // Final updated draft
  const finalDraft: ImportDraft = {
    ...candidateDraft,
    provenance: {
      ...candidateDraft.provenance,
      flags: Object.freeze(Array.from(flagsSet)),
    },
  };

  // 7. Update job drafts
  const newDrafts = [...job.drafts];
  newDrafts[draftIndex] = finalDraft;

  const updatedJob: ImportJob = {
    ...job,
    drafts: Object.freeze(newDrafts),
  };

  return {
    ok: true,
    value: deepFreeze(deepClone(updatedJob)),
  };
}

/**
 * Checks duplicate provenance within a job and against an existing exam.
 */
export function checkDuplicateProvenance(
  job: ImportJob,
  exam?: ExamDraft,
): readonly { draftId: string; sourceId: string; location: string }[] {
  const duplicates: { draftId: string; sourceId: string; location: string }[] = [];
  const seen = new Set<string>();

  // Internal job provenance duplicates
  for (const draft of job.drafts) {
    const prov = draft.provenance;
    if (!prov) continue;
    const key = `${prov.sourceId}::${prov.location}`;
    if (seen.has(key)) {
      duplicates.push({ draftId: draft.draftId, sourceId: prov.sourceId, location: prov.location });
    } else {
      seen.add(key);
    }
  }

  // Duplicates against destination exam
  if (exam && Array.isArray(exam.exam.questions)) {
    for (const draft of job.drafts) {
      const prov = draft.provenance;
      if (!prov) continue;
      const key = `${prov.sourceId}::${prov.location}`;
      for (const eq of exam.exam.questions) {
        if (eq.provenance && `${eq.provenance.sourceId}::${eq.provenance.location}` === key) {
          duplicates.push({ draftId: draft.draftId, sourceId: prov.sourceId, location: prov.location });
          break;
        }
      }
    }
  }

  return Object.freeze(duplicates);
}

/**
 * Deduplicates drafts within an ImportJob by source provenance (keeps the first occurrence).
 */
export function deduplicateDraftsByProvenance(job: ImportJob): ImportJob {
  const seen = new Set<string>();
  const deduplicated: ImportDraft[] = [];

  for (const draft of job.drafts) {
    const prov = draft.provenance;
    const key = prov ? `${prov.sourceId}::${prov.location}` : draft.draftId;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicated.push(draft);
    }
  }

  return deepFreeze(deepClone({
    ...job,
    drafts: deduplicated,
  }));
}

/**
 * Confirms import of valid, confirmed drafts into an ExamDraft.
 * - Only transfers drafts with confirmed === true AND valid question structure/keys.
 * - Re-maps IDs to prevent collisions with existing questions.
 * - Checks and rejects hostile references.
 * - Applies duplicate provenance deduplication if requested.
 * - Never writes directly to question bank or storage.
 *
 * @param job The source ImportJob
 * @param exam The target ExamDraft
 * @param options Deduplication and ID generation options
 * @returns Result with updated ExamDraft
 */
export function confirmImport(
  job: ImportJob,
  exam: ExamDraft,
  options?: ConfirmImportOptions,
): Result<ExamDraft> {
  if (!isRecord(job) || !Array.isArray(job.drafts)) {
    return {
      ok: false,
      error: {
        code: "IMPORT_INVALID",
        path: "job",
        message: "Invalid ImportJob object",
        recoverable: false,
      },
    };
  }

  if (!isRecord(exam) || !isRecord(exam.exam) || !Array.isArray(exam.exam.questions)) {
    return {
      ok: false,
      error: {
        code: "DRAFT_INVALID",
        path: "exam",
        message: "Target ExamDraft must be a valid draft object with an exam.questions array",
        recoverable: false,
      },
    };
  }

  // 1. Filter drafts with confirmed === true
  const confirmedDrafts = job.drafts.filter((d) => d.confirmed === true);
  if (confirmedDrafts.length === 0) {
    return {
      ok: false,
      error: {
        code: "IMPORT_UNCONFIRMED",
        path: "drafts",
        message: "Chưa có câu hỏi nào được xác nhận để nhập vào đề thi",
        recoverable: true,
      },
    };
  }

  // 2. Filter valid drafts among confirmed
  const validConfirmedDrafts: ImportDraft[] = [];
  const invalidConfirmedDrafts: { draftId: string; issues: readonly string[] }[] = [];

  for (const draft of confirmedDrafts) {
    const issues = validateImportDraft(draft);
    const missingKey = isDraftMissingKey(draft);
    const hostile = checkHostileRefs(draft.question?.image, draft.question?.blocks);

    if (issues.length > 0 || missingKey || hostile.isHostile) {
      const errList = issues.map((i) => i.code);
      if (missingKey && !errList.includes(PREVIEW_FLAGS.KEY_MISSING)) {
        errList.push(PREVIEW_FLAGS.KEY_MISSING);
      }
      if (hostile.isHostile && !errList.includes(PREVIEW_FLAGS.ASSET_UNSAFE)) {
        errList.push(PREVIEW_FLAGS.ASSET_UNSAFE);
      }
      invalidConfirmedDrafts.push({ draftId: draft.draftId, issues: errList });
    } else {
      validConfirmedDrafts.push(draft);
    }
  }

  if (validConfirmedDrafts.length === 0) {
    return {
      ok: false,
      error: {
        code: "IMPORT_KEY_MISSING",
        path: "drafts",
        message: "Các câu hỏi được chọn xác nhận còn thiếu đáp án chuẩn hoặc chưa hợp lệ để nhập vào đề",
        recoverable: true,
      },
    };
  }

  // 3. Existing IDs in target exam to avoid collision
  const existingQuestionIds = new Set<string>();
  const existingOptionIds = new Set<string>();
  const existingStatementIds = new Set<string>();
  const existingProvenanceKeys = new Set<string>();

  for (const q of exam.exam.questions) {
    existingQuestionIds.add(q.questionVersionId);
    if (q.provenance) {
      existingProvenanceKeys.add(`${q.provenance.sourceId}::${q.provenance.location}`);
    }
    if (q.kind === "I" && Array.isArray((q as WebQuestionI).options)) {
      for (const opt of (q as WebQuestionI).options) {
        existingOptionIds.add(opt.optionId);
      }
    } else if (q.kind === "II" && Array.isArray((q as WebQuestionII).statements)) {
      for (const stmt of (q as WebQuestionII).statements) {
        existingStatementIds.add(stmt.statementId);
      }
    }
  }

  const idGen = options?.idGenerator ?? defaultIdGen;
  const dedupeProv = options?.dedupeDuplicateProvenance ?? false;

  // 4. Convert confirmed valid drafts into WebQuestion objects
  const questionsToAdd: WebQuestion[] = [];

  for (const draft of validConfirmedDrafts) {
    const prov = draft.provenance;
    const provKey = prov ? `${prov.sourceId}::${prov.location}` : "";

    // Deduplication by provenance if enabled
    if (dedupeProv && provKey && existingProvenanceKeys.has(provKey)) {
      continue; // Skip duplicate provenance
    }
    if (provKey) {
      existingProvenanceKeys.add(provKey);
    }

    const rawQ = draft.question;
    const kind = rawQ.kind as Section;

    // Unique questionVersionId
    let qVersionId = rawQ.questionVersionId;
    if (!qVersionId || existingQuestionIds.has(qVersionId)) {
      qVersionId = idGen("q");
    }
    existingQuestionIds.add(qVersionId);

    // Build WebQuestion according to kind
    if (kind === "I") {
      const q1 = rawQ as WebQuestionI;
      const idMap = new Map<string, string>();
      const newOptions: WebOption[] = [];

      for (const opt of q1.options) {
        let optId = opt.optionId;
        if (!optId || existingOptionIds.has(optId)) {
          optId = idGen("opt");
        }
        existingOptionIds.add(optId);
        idMap.set(opt.optionId, optId);
        newOptions.push({
          ...opt,
          optionId: optId,
        });
      }

      // Remap correctOptionId
      const newCorrectId = idMap.get(q1.correctOptionId) ?? q1.correctOptionId;

      const webQ: WebQuestionI = {
        kind: "I",
        questionVersionId: qVersionId,
        options: Object.freeze(newOptions),
        correctOptionId: newCorrectId,
        ...(q1.questionId ? { questionId: q1.questionId } : {}),
        ...(q1.title ? { title: q1.title } : {}),
        ...(q1.content ? { content: q1.content } : {}),
        ...(q1.image ? { image: q1.image } : {}),
        ...(q1.explanation ? { explanation: q1.explanation } : {}),
        ...(q1.blocks ? { blocks: q1.blocks } : {}),
        ...(q1.subject ? { subject: q1.subject } : {}),
        ...(q1.grade ? { grade: q1.grade } : {}),
        ...(q1.topic ? { topic: q1.topic } : {}),
        ...(q1.lesson ? { lesson: q1.lesson } : {}),
        ...(q1.difficulty ? { difficulty: q1.difficulty } : {}),
        provenance: draft.provenance,
      };

      questionsToAdd.push(webQ);
    } else if (kind === "II") {
      const q2 = rawQ as WebQuestionII;
      const newStatements: WebStatement[] = [];

      for (const stmt of q2.statements) {
        let stmtId = stmt.statementId;
        if (!stmtId || existingStatementIds.has(stmtId)) {
          stmtId = idGen("stmt");
        }
        existingStatementIds.add(stmtId);
        newStatements.push({
          ...stmt,
          statementId: stmtId,
        });
      }

      const webQ: WebQuestionII = {
        kind: "II",
        questionVersionId: qVersionId,
        statements: Object.freeze(newStatements),
        ...(q2.questionId ? { questionId: q2.questionId } : {}),
        ...(q2.title ? { title: q2.title } : {}),
        ...(q2.content ? { content: q2.content } : {}),
        ...(q2.image ? { image: q2.image } : {}),
        ...(q2.explanation ? { explanation: q2.explanation } : {}),
        ...(q2.blocks ? { blocks: q2.blocks } : {}),
        ...(q2.subject ? { subject: q2.subject } : {}),
        ...(q2.grade ? { grade: q2.grade } : {}),
        ...(q2.topic ? { topic: q2.topic } : {}),
        ...(q2.lesson ? { lesson: q2.lesson } : {}),
        ...(q2.difficulty ? { difficulty: q2.difficulty } : {}),
        provenance: draft.provenance,
      };

      questionsToAdd.push(webQ);
    } else if (kind === "III") {
      const q3 = rawQ as WebQuestionIII;

      const webQ: WebQuestionIII = {
        kind: "III",
        questionVersionId: qVersionId,
        answerKey: q3.answerKey,
        ...(q3.questionId ? { questionId: q3.questionId } : {}),
        ...(q3.title ? { title: q3.title } : {}),
        ...(q3.content ? { content: q3.content } : {}),
        ...(q3.image ? { image: q3.image } : {}),
        ...(q3.explanation ? { explanation: q3.explanation } : {}),
        ...(q3.blocks ? { blocks: q3.blocks } : {}),
        ...(q3.subject ? { subject: q3.subject } : {}),
        ...(q3.grade ? { grade: q3.grade } : {}),
        ...(q3.topic ? { topic: q3.topic } : {}),
        ...(q3.lesson ? { lesson: q3.lesson } : {}),
        ...(q3.difficulty ? { difficulty: q3.difficulty } : {}),
        provenance: draft.provenance,
      };

      questionsToAdd.push(webQ);
    }
  }

  // 5. Build updated ExamDraft with incremented revision
  const mergedQuestions = [...exam.exam.questions, ...questionsToAdd];
  const updatedDraft: ExamDraft = {
    draftId: exam.draftId,
    revision: exam.revision + 1,
    exam: deepFreeze(deepClone({
      ...exam.exam,
      questions: mergedQuestions,
    })),
  };

  return {
    ok: true,
    value: deepFreeze(updatedDraft),
  };
}

/**
 * Cancels an import job, setting its state to "failed" with the IMPORT_CANCELLED flag.
 */
export function cancelImport(job: ImportJob): Result<ImportJob> {
  if (!isRecord(job)) {
    return {
      ok: false,
      error: {
        code: "IMPORT_INVALID",
        path: "job",
        message: "Invalid ImportJob object",
        recoverable: false,
      },
    };
  }

  const flags = new Set<string>(job.flags ?? []);
  flags.add(PREVIEW_FLAGS.IMPORT_CANCELLED);

  const updatedJob: ImportJob = {
    ...job,
    state: "failed",
    flags: Object.freeze(Array.from(flags)),
  };

  return {
    ok: true,
    value: deepFreeze(deepClone(updatedJob)),
  };
}

/**
 * Fails an import job with an explicit error reason.
 */
export function failImport(job: ImportJob, reason: string): Result<ImportJob> {
  if (!isRecord(job)) {
    return {
      ok: false,
      error: {
        code: "IMPORT_INVALID",
        path: "job",
        message: "Invalid ImportJob object",
        recoverable: false,
      },
    };
  }

  const flags = new Set<string>(job.flags ?? []);
  flags.add(`FAILED: ${reason}`);

  const updatedJob: ImportJob = {
    ...job,
    state: "failed",
    flags: Object.freeze(Array.from(flags)),
  };

  return {
    ok: true,
    value: deepFreeze(deepClone(updatedJob)),
  };
}

/**
 * Toggles or sets the confirmed status for a specific draft in an ImportJob.
 */
export function toggleDraftConfirmed(
  job: ImportJob,
  draftId: string,
  confirmed?: boolean,
): Result<ImportJob> {
  const index = job.drafts.findIndex((d) => d.draftId === draftId);
  if (index === -1) {
    return {
      ok: false,
      error: {
        code: "DRAFT_NOT_FOUND",
        path: "draftId",
        message: `Draft "${draftId}" not found`,
        recoverable: true,
      },
    };
  }

  const existing = job.drafts[index]!;
  const newConfirmed = confirmed !== undefined ? Boolean(confirmed) : !existing.confirmed;

  return editImport(job, draftId, { confirmed: newConfirmed });
}

/**
 * Marks all valid drafts in the job as confirmed: true, and invalid drafts as confirmed: false.
 */
export function confirmAllValidDrafts(job: ImportJob): Result<ImportJob> {
  if (!isRecord(job) || !Array.isArray(job.drafts)) {
    return {
      ok: false,
      error: {
        code: "IMPORT_INVALID",
        path: "job",
        message: "Invalid ImportJob object",
        recoverable: false,
      },
    };
  }

  const updatedDrafts = job.drafts.map((draft) => {
    const valid = isDraftValid(draft);
    return {
      ...draft,
      confirmed: valid,
    };
  });

  const updatedJob: ImportJob = {
    ...job,
    drafts: Object.freeze(updatedDrafts),
  };

  return {
    ok: true,
    value: deepFreeze(deepClone(updatedJob)),
  };
}
