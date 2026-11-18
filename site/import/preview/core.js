/**
 * Core functional logic for M5 Import Preview, Correction and Confirmation.
 * Conforms to docs/contracts/WEB-contract.md §4-§5, §8-§9, §11-§12,
 * and Shared Product Contract v2.0 §6.
 */
import { checkShortAnswer, } from "../../domain/index.js";
import { validateImportDraft, isHostilePath, isHostileDataUriOrContent, WHITELISTED_ASSET_MIMES, deepFreeze, } from "../../schema/index.js";
import { PREVIEW_FLAGS } from "./types.js";
function isRecord(val) {
    return typeof val === "object" && val !== null && !Array.isArray(val);
}
function deepClone(val) {
    if (val === null || typeof val !== "object") {
        return val;
    }
    if (Array.isArray(val)) {
        return val.map((item) => deepClone(item));
    }
    const copy = {};
    for (const [k, v] of Object.entries(val)) {
        copy[k] = deepClone(v);
    }
    return copy;
}
let idCounter = 0;
function defaultIdGen(prefix = "imported") {
    idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}
/**
 * Recursively scans blocks (including nested table cells) for hostile asset paths.
 */
function scanBlocksForHostile(blocks) {
    for (const b of blocks) {
        if (!b || typeof b !== "object")
            continue;
        if (b.type === "image") {
            if (typeof b.assetId === "string" && isHostilePath(b.assetId)) {
                return { isHostile: true, reason: `Hostile block image assetId: "${b.assetId}"` };
            }
        }
        else if (b.type === "table" && Array.isArray(b.rows)) {
            for (const row of b.rows) {
                if (!Array.isArray(row))
                    continue;
                for (const cell of row) {
                    if (cell && Array.isArray(cell.blocks)) {
                        const nested = scanBlocksForHostile(cell.blocks);
                        if (nested)
                            return nested;
                    }
                }
            }
        }
    }
    return null;
}
/**
 * Checks if a question has any hostile image, asset or content references.
 */
export function checkHostileRefs(image, blocks) {
    if (typeof image === "string" && image.trim() !== "") {
        if (isHostilePath(image)) {
            return { isHostile: true, reason: `Hostile image path detected: "${image}"` };
        }
        if (isHostileDataUriOrContent("image/png", image)) {
            return { isHostile: true, reason: `Hostile image data URI detected: "${image.slice(0, 40)}..."` };
        }
    }
    if (Array.isArray(blocks)) {
        const hostileBlock = scanBlocksForHostile(blocks);
        if (hostileBlock) {
            return hostileBlock;
        }
    }
    return { isHostile: false };
}
/**
 * Recursively collects all image asset IDs referenced in a question's image and blocks (including tables).
 */
export function collectReferencedAssetIds(image, blocks) {
    const assetIds = [];
    if (typeof image === "string" && image.trim() !== "") {
        assetIds.push(image);
    }
    if (Array.isArray(blocks)) {
        const scan = (bl) => {
            for (const b of bl) {
                if (!b || typeof b !== "object")
                    continue;
                if (b.type === "image" && typeof b.assetId === "string" && b.assetId.trim() !== "") {
                    assetIds.push(b.assetId);
                }
                else if (b.type === "table" && Array.isArray(b.rows)) {
                    for (const row of b.rows) {
                        if (!Array.isArray(row))
                            continue;
                        for (const cell of row) {
                            if (cell && Array.isArray(cell.blocks)) {
                                scan(cell.blocks);
                            }
                        }
                    }
                }
            }
        };
        scan(blocks);
    }
    return Object.freeze(assetIds);
}
/**
 * Recursively remaps asset IDs in blocks (including nested table cells).
 */
export function remapBlocksAssets(blocks, remap) {
    return blocks.map((b) => {
        if (b.type === "image") {
            const newId = remap.get(b.assetId);
            if (newId && newId !== b.assetId) {
                return { ...b, assetId: newId };
            }
            return b;
        }
        if (b.type === "table" && Array.isArray(b.rows)) {
            return {
                ...b,
                rows: b.rows.map((row) => row.map((cell) => ({
                    ...cell,
                    blocks: remapBlocksAssets(cell.blocks, remap),
                }))),
            };
        }
        return b;
    });
}
/**
 * Checks whether an ImportDraft has a missing answer key.
 */
export function isDraftMissingKey(draft) {
    const q = draft.question;
    if (!q || !q.kind)
        return true;
    if (q.kind === "I") {
        const q1 = q;
        if (!q1.correctOptionId || typeof q1.correctOptionId !== "string" || q1.correctOptionId.trim() === "") {
            return true;
        }
        const options = q1.options ?? [];
        if (options.length !== 4)
            return true;
        return !options.some((o) => o.optionId === q1.correctOptionId);
    }
    if (q.kind === "II") {
        const q2 = q;
        const stmts = q2.statements ?? [];
        if (stmts.length !== 4)
            return true;
        for (const s of stmts) {
            if (typeof s.answer !== "boolean") {
                return true;
            }
        }
        return false;
    }
    if (q.kind === "III") {
        const q3 = q;
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
export function getDraftWarnings(draft) {
    const warnings = new Set();
    // 1. Missing key warning
    if (isDraftMissingKey(draft)) {
        warnings.add(PREVIEW_FLAGS.KEY_MISSING);
    }
    // 2. Flags already present on provenance
    const provFlags = draft.provenance?.flags ?? [];
    for (const flag of provFlags) {
        if (flag === PREVIEW_FLAGS.KEY_MISSING ||
            flag === "KEY_MISSING" ||
            flag === PREVIEW_FLAGS.OMML_UNSUPPORTED ||
            flag === PREVIEW_FLAGS.PDF_MANUAL_REVIEW_REQUIRED ||
            flag === PREVIEW_FLAGS.PDF_OCR_UNAVAILABLE ||
            flag === PREVIEW_FLAGS.PDF_MANUAL_INPUT ||
            flag === PREVIEW_FLAGS.ASSET_UNSAFE ||
            flag === PREVIEW_FLAGS.DUPLICATE_SOURCE) {
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
export function isDraftValid(draft) {
    const issues = validateImportDraft(draft);
    if (issues.length > 0)
        return false;
    if (isDraftMissingKey(draft))
        return false;
    const hostile = checkHostileRefs(draft.question?.image, draft.question?.blocks);
    if (hostile.isHostile)
        return false;
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
export function editImport(job, draftId, patch) {
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
    const existingDraft = job.drafts[draftIndex];
    const existingQ = existingDraft.question ?? {};
    const typedPatch = patch;
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
    const targetKind = typedPatch.kind ?? existingQ.kind ?? "I";
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
    const updatedQ = deepClone(existingQ);
    updatedQ.kind = targetKind;
    // Common properties
    if (typedPatch.title !== undefined)
        updatedQ.title = typedPatch.title;
    if (typedPatch.content !== undefined)
        updatedQ.content = typedPatch.content;
    if (typedPatch.image !== undefined)
        updatedQ.image = typedPatch.image;
    if (typedPatch.explanation !== undefined)
        updatedQ.explanation = typedPatch.explanation;
    if (typedPatch.blocks !== undefined)
        updatedQ.blocks = deepClone(typedPatch.blocks);
    // Taxonomy correction
    if (typedPatch.taxonomy && isRecord(typedPatch.taxonomy)) {
        if (typedPatch.taxonomy.subject !== undefined)
            updatedQ.subject = typedPatch.taxonomy.subject;
        if (typedPatch.taxonomy.grade !== undefined)
            updatedQ.grade = typedPatch.taxonomy.grade;
        if (typedPatch.taxonomy.topic !== undefined)
            updatedQ.topic = typedPatch.taxonomy.topic;
        if (typedPatch.taxonomy.lesson !== undefined)
            updatedQ.lesson = typedPatch.taxonomy.lesson;
        if (typedPatch.taxonomy.difficulty !== undefined)
            updatedQ.difficulty = typedPatch.taxonomy.difficulty;
    }
    if (typedPatch.subject !== undefined)
        updatedQ.subject = typedPatch.subject;
    if (typedPatch.grade !== undefined)
        updatedQ.grade = typedPatch.grade;
    if (typedPatch.topic !== undefined)
        updatedQ.topic = typedPatch.topic;
    if (typedPatch.lesson !== undefined)
        updatedQ.lesson = typedPatch.lesson;
    if (typedPatch.difficulty !== undefined)
        updatedQ.difficulty = typedPatch.difficulty;
    // Kind-specific logic & key mapping
    if (targetKind === "I") {
        delete updatedQ.statements;
        delete updatedQ.answerKey;
        let options;
        if (Array.isArray(typedPatch.options)) {
            options = deepClone(typedPatch.options);
        }
        else if (Array.isArray(existingQ.options) && existingQ.kind === "I") {
            options = deepClone(existingQ.options);
        }
        else {
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
        let correctOptionId = undefined;
        if (typeof typedPatch.correctOptionId === "string") {
            correctOptionId = typedPatch.correctOptionId;
        }
        else if (typeof typedPatch.key === "string") {
            const keyVal = typedPatch.key.trim();
            // Check if matches label 'A'|'B'|'C'|'D'
            const matchedByLabel = options.find((o) => (o.label && o.label.toUpperCase() === keyVal.toUpperCase()) || o.optionId === keyVal);
            if (matchedByLabel) {
                correctOptionId = matchedByLabel.optionId;
            }
            else {
                correctOptionId = keyVal;
            }
        }
        else if (typeof existingQ.correctOptionId === "string" && existingQ.kind === "I") {
            correctOptionId = existingQ.correctOptionId;
        }
        if (correctOptionId !== undefined) {
            updatedQ.correctOptionId = correctOptionId;
        }
    }
    else if (targetKind === "II") {
        delete updatedQ.options;
        delete updatedQ.correctOptionId;
        delete updatedQ.answerKey;
        let statements;
        if (Array.isArray(typedPatch.statements)) {
            statements = deepClone(typedPatch.statements);
        }
        else if (Array.isArray(existingQ.statements) && existingQ.kind === "II") {
            statements = deepClone(existingQ.statements);
        }
        else {
            // Transitioning from other kind: create 4 default statements
            const labels = ["a", "b", "c", "d"];
            statements = labels.map((lbl) => ({
                statementId: defaultIdGen("stmt"),
                label: lbl,
                text: `Ý ${lbl}`,
                answer: undefined,
            }));
        }
        updatedQ.statements = statements;
    }
    else if (targetKind === "III") {
        delete updatedQ.options;
        delete updatedQ.correctOptionId;
        delete updatedQ.statements;
        let answerKey = "";
        if (typeof typedPatch.answerKey === "string") {
            answerKey = typedPatch.answerKey;
        }
        else if (typeof typedPatch.key === "string") {
            answerKey = typedPatch.key;
        }
        else if (typeof existingQ.answerKey === "string" && existingQ.kind === "III") {
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
    const updatedProv = {
        sourceId: typedPatch.provenance?.sourceId ?? existingProv.sourceId,
        location: typedPatch.provenance?.location ?? existingProv.location,
        confidence: typedPatch.provenance?.confidence !== undefined
            ? typedPatch.provenance.confidence
            : existingProv.confidence,
        flags: [...existingProv.flags],
    };
    const flagsSet = new Set(updatedProv.flags);
    // Apply explicit addFlags/removeFlags
    if (Array.isArray(typedPatch.removeFlags)) {
        for (const f of typedPatch.removeFlags)
            flagsSet.delete(f);
    }
    if (Array.isArray(typedPatch.addFlags)) {
        for (const f of typedPatch.addFlags)
            flagsSet.add(f);
    }
    // 5. Update confirmation status
    const confirmed = typedPatch.confirmed !== undefined
        ? Boolean(typedPatch.confirmed)
        : existingDraft.confirmed;
    const candidateDraft = {
        draftId: existingDraft.draftId,
        question: updatedQ,
        provenance: {
            ...updatedProv,
            flags: Array.from(flagsSet),
        },
        confirmed,
    };
    // 6. Keep or resolve missing key warning
    if (isDraftMissingKey(candidateDraft)) {
        flagsSet.add(PREVIEW_FLAGS.KEY_MISSING);
    }
    else {
        flagsSet.delete(PREVIEW_FLAGS.KEY_MISSING);
        flagsSet.delete("KEY_MISSING");
    }
    // Final updated draft
    const finalDraft = {
        ...candidateDraft,
        provenance: {
            ...candidateDraft.provenance,
            flags: Object.freeze(Array.from(flagsSet)),
        },
    };
    // 7. Update job drafts
    const newDrafts = [...job.drafts];
    newDrafts[draftIndex] = finalDraft;
    const updatedJob = {
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
export function checkDuplicateProvenance(job, exam) {
    const duplicates = [];
    const seen = new Set();
    // Internal job provenance duplicates
    for (const draft of job.drafts) {
        const prov = draft.provenance;
        if (!prov)
            continue;
        const key = `${prov.sourceId}::${prov.location}`;
        if (seen.has(key)) {
            duplicates.push({ draftId: draft.draftId, sourceId: prov.sourceId, location: prov.location });
        }
        else {
            seen.add(key);
        }
    }
    // Duplicates against destination exam
    if (exam && Array.isArray(exam.exam.questions)) {
        for (const draft of job.drafts) {
            const prov = draft.provenance;
            if (!prov)
                continue;
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
export function deduplicateDraftsByProvenance(job) {
    const seen = new Set();
    const deduplicated = [];
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
export function confirmImport(job, exam, options) {
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
    // Lifecycle check: failed or cancelled jobs must never be confirmed into an exam draft
    if (job.state === "failed" || (job.flags && job.flags.includes(PREVIEW_FLAGS.IMPORT_CANCELLED))) {
        return {
            ok: false,
            error: {
                code: job.flags?.includes(PREVIEW_FLAGS.IMPORT_CANCELLED)
                    ? PREVIEW_FLAGS.IMPORT_CANCELLED
                    : "IMPORT_INVALID",
                path: "job.state",
                message: job.flags?.includes(PREVIEW_FLAGS.IMPORT_CANCELLED)
                    ? "Tác vụ import đã bị hủy, không thể xác nhận nhập vào đề thi"
                    : "Tác vụ import ở trạng thái thất bại, không thể xác nhận",
                recoverable: false,
            },
        };
    }
    if (job.state !== "preview" && job.state !== "confirmed") {
        return {
            ok: false,
            error: {
                code: "IMPORT_INVALID",
                path: "job.state",
                message: `Tác vụ import đang ở trạng thái "${job.state}", chưa sẵn sàng để xác nhận`,
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
    // 2. Prepare Asset maps from job and target exam
    const rawJobAssets = Array.isArray(job.assets)
        ? (job.assets)
        : [];
    const jobAssetMap = new Map();
    for (const asset of rawJobAssets) {
        if (asset && typeof asset === "object" && typeof asset.assetId === "string") {
            jobAssetMap.set(asset.assetId, asset);
        }
    }
    const existingExamAssets = Array.isArray(exam.exam.assets)
        ? exam.exam.assets
        : [];
    const existingAssetMap = new Map();
    for (const asset of existingExamAssets) {
        if (asset && typeof asset === "object" && typeof asset.assetId === "string") {
            existingAssetMap.set(asset.assetId, asset);
        }
    }
    // 3. Filter valid drafts among confirmed, validating answer keys and asset references
    const validConfirmedDrafts = [];
    const invalidConfirmedDrafts = [];
    for (const draft of confirmedDrafts) {
        const issues = validateImportDraft(draft);
        const missingKey = isDraftMissingKey(draft);
        const hostile = checkHostileRefs(draft.question?.image, draft.question?.blocks);
        // Validate asset references
        const referencedAssetIds = collectReferencedAssetIds(draft.question?.image, draft.question?.blocks);
        let assetUnsafe = false;
        for (const assetId of referencedAssetIds) {
            if (isHostilePath(assetId)) {
                assetUnsafe = true;
                break;
            }
            const jobAsset = jobAssetMap.get(assetId);
            if (jobAsset) {
                if (!WHITELISTED_ASSET_MIMES.has(jobAsset.mime) || isHostileDataUriOrContent(jobAsset.mime, jobAsset.data)) {
                    assetUnsafe = true;
                    break;
                }
            }
            else if (!existingAssetMap.has(assetId) && !assetId.startsWith("public/")) {
                // Missing asset reference
                assetUnsafe = true;
                break;
            }
        }
        if (issues.length > 0 || missingKey || hostile.isHostile || assetUnsafe) {
            const errList = issues.map((i) => i.code);
            if (missingKey && !errList.includes(PREVIEW_FLAGS.KEY_MISSING)) {
                errList.push(PREVIEW_FLAGS.KEY_MISSING);
            }
            if ((hostile.isHostile || assetUnsafe) && !errList.includes(PREVIEW_FLAGS.ASSET_UNSAFE)) {
                errList.push(PREVIEW_FLAGS.ASSET_UNSAFE);
            }
            invalidConfirmedDrafts.push({ draftId: draft.draftId, issues: errList });
        }
        else {
            validConfirmedDrafts.push(draft);
        }
    }
    if (validConfirmedDrafts.length === 0) {
        const hasAssetUnsafe = invalidConfirmedDrafts.some((d) => d.issues.includes(PREVIEW_FLAGS.ASSET_UNSAFE));
        return {
            ok: false,
            error: {
                code: hasAssetUnsafe ? "ASSET_UNSAFE" : "IMPORT_KEY_MISSING",
                path: "drafts",
                message: hasAssetUnsafe
                    ? "Các câu hỏi được chọn xác nhận chứa tham chiếu ảnh không hợp lệ, không an toàn hoặc thiếu ảnh gốc"
                    : "Các câu hỏi được chọn xác nhận còn thiếu đáp án chuẩn hoặc chưa hợp lệ để nhập vào đề",
                recoverable: true,
            },
        };
    }
    // 4. Existing IDs in target exam to avoid collision
    const existingQuestionIds = new Set();
    const existingOptionIds = new Set();
    const existingStatementIds = new Set();
    const existingProvenanceKeys = new Set();
    const existingAssetIds = new Set(existingAssetMap.keys());
    for (const q of exam.exam.questions) {
        existingQuestionIds.add(q.questionVersionId);
        if (q.provenance) {
            existingProvenanceKeys.add(`${q.provenance.sourceId}::${q.provenance.location}`);
        }
        if (q.kind === "I" && Array.isArray(q.options)) {
            for (const opt of q.options) {
                existingOptionIds.add(opt.optionId);
            }
        }
        else if (q.kind === "II" && Array.isArray(q.statements)) {
            for (const stmt of q.statements) {
                existingStatementIds.add(stmt.statementId);
            }
        }
    }
    const idGen = options?.idGenerator ?? defaultIdGen;
    const dedupeProv = options?.dedupeDuplicateProvenance ?? false;
    // Remap and collect referenced job assets to resolve ID collisions
    const jobAssetRemap = new Map();
    const assetsToAdd = [];
    for (const draft of validConfirmedDrafts) {
        const referencedAssetIds = collectReferencedAssetIds(draft.question?.image, draft.question?.blocks);
        for (const oldAssetId of referencedAssetIds) {
            if (jobAssetRemap.has(oldAssetId)) {
                continue;
            }
            const jobAsset = jobAssetMap.get(oldAssetId);
            if (jobAsset) {
                let targetAssetId = oldAssetId;
                if (existingAssetIds.has(oldAssetId)) {
                    // Collision: remap to unique ID
                    targetAssetId = idGen("asset");
                }
                existingAssetIds.add(targetAssetId);
                jobAssetRemap.set(oldAssetId, targetAssetId);
                assetsToAdd.push({
                    ...jobAsset,
                    assetId: targetAssetId,
                });
            }
            else if (existingAssetMap.has(oldAssetId)) {
                jobAssetRemap.set(oldAssetId, oldAssetId);
            }
        }
    }
    // 5. Convert confirmed valid drafts into WebQuestion objects
    const questionsToAdd = [];
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
        const kind = rawQ.kind;
        // Unique questionVersionId
        let qVersionId = rawQ.questionVersionId;
        if (!qVersionId || existingQuestionIds.has(qVersionId)) {
            qVersionId = idGen("q");
        }
        existingQuestionIds.add(qVersionId);
        // Remap assets in image and blocks
        const remappedBlocks = rawQ.blocks ? remapBlocksAssets(rawQ.blocks, jobAssetRemap) : undefined;
        const remappedImage = rawQ.image && jobAssetRemap.has(rawQ.image)
            ? jobAssetRemap.get(rawQ.image)
            : rawQ.image;
        // Build WebQuestion according to kind
        if (kind === "I") {
            const q1 = rawQ;
            const idMap = new Map();
            const newOptions = [];
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
            const webQ = {
                kind: "I",
                questionVersionId: qVersionId,
                options: Object.freeze(newOptions),
                correctOptionId: newCorrectId,
                ...(q1.questionId ? { questionId: q1.questionId } : {}),
                ...(q1.title ? { title: q1.title } : {}),
                ...(q1.content ? { content: q1.content } : {}),
                ...(remappedImage ? { image: remappedImage } : {}),
                ...(q1.explanation ? { explanation: q1.explanation } : {}),
                ...(remappedBlocks ? { blocks: Object.freeze(remappedBlocks) } : {}),
                ...(q1.subject ? { subject: q1.subject } : {}),
                ...(q1.grade ? { grade: q1.grade } : {}),
                ...(q1.topic ? { topic: q1.topic } : {}),
                ...(q1.lesson ? { lesson: q1.lesson } : {}),
                ...(q1.difficulty ? { difficulty: q1.difficulty } : {}),
                provenance: draft.provenance,
            };
            questionsToAdd.push(webQ);
        }
        else if (kind === "II") {
            const q2 = rawQ;
            const newStatements = [];
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
            const webQ = {
                kind: "II",
                questionVersionId: qVersionId,
                statements: Object.freeze(newStatements),
                ...(q2.questionId ? { questionId: q2.questionId } : {}),
                ...(q2.title ? { title: q2.title } : {}),
                ...(q2.content ? { content: q2.content } : {}),
                ...(remappedImage ? { image: remappedImage } : {}),
                ...(q2.explanation ? { explanation: q2.explanation } : {}),
                ...(remappedBlocks ? { blocks: Object.freeze(remappedBlocks) } : {}),
                ...(q2.subject ? { subject: q2.subject } : {}),
                ...(q2.grade ? { grade: q2.grade } : {}),
                ...(q2.topic ? { topic: q2.topic } : {}),
                ...(q2.lesson ? { lesson: q2.lesson } : {}),
                ...(q2.difficulty ? { difficulty: q2.difficulty } : {}),
                provenance: draft.provenance,
            };
            questionsToAdd.push(webQ);
        }
        else if (kind === "III") {
            const q3 = rawQ;
            const webQ = {
                kind: "III",
                questionVersionId: qVersionId,
                answerKey: q3.answerKey,
                ...(q3.questionId ? { questionId: q3.questionId } : {}),
                ...(q3.title ? { title: q3.title } : {}),
                ...(q3.content ? { content: q3.content } : {}),
                ...(remappedImage ? { image: remappedImage } : {}),
                ...(q3.explanation ? { explanation: q3.explanation } : {}),
                ...(remappedBlocks ? { blocks: Object.freeze(remappedBlocks) } : {}),
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
    // 6. Build updated ExamDraft with incremented revision and merged assets
    const mergedQuestions = [...exam.exam.questions, ...questionsToAdd];
    const mergedAssets = [...existingExamAssets, ...assetsToAdd];
    const updatedDraft = {
        draftId: exam.draftId,
        revision: exam.revision + 1,
        exam: deepFreeze(deepClone({
            ...exam.exam,
            questions: mergedQuestions,
            assets: mergedAssets,
        })),
    };
    return {
        ok: true,
        value: deepFreeze(updatedDraft),
    };
}
/**
 * Cancels an import job, setting its state to "failed" with the IMPORT_CANCELLED flag
 * and invalidating draft confirmation status.
 */
export function cancelImport(job) {
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
    const flags = new Set(job.flags ?? []);
    flags.add(PREVIEW_FLAGS.IMPORT_CANCELLED);
    // Invalidate confirmed drafts upon cancellation so they cannot be mistakenly confirmed
    const unconfirmedDrafts = Array.isArray(job.drafts)
        ? job.drafts.map((d) => ({
            ...d,
            confirmed: false,
        }))
        : [];
    const updatedJob = {
        ...job,
        state: "failed",
        drafts: Object.freeze(unconfirmedDrafts),
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
export function failImport(job, reason) {
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
    const flags = new Set(job.flags ?? []);
    flags.add(`FAILED: ${reason}`);
    const updatedJob = {
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
export function toggleDraftConfirmed(job, draftId, confirmed) {
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
    const existing = job.drafts[index];
    const newConfirmed = confirmed !== undefined ? Boolean(confirmed) : !existing.confirmed;
    return editImport(job, draftId, { confirmed: newConfirmed });
}
/**
 * Marks all valid drafts in the job as confirmed: true, and invalid drafts as confirmed: false.
 */
export function confirmAllValidDrafts(job) {
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
    const updatedJob = {
        ...job,
        drafts: Object.freeze(updatedDrafts),
    };
    return {
        ok: true,
        value: deepFreeze(deepClone(updatedJob)),
    };
}
