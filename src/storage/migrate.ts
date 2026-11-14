import type {
  Id,
  ValidationIssue,
  ExamVersion,
  AttemptResponses,
  Response,
  ResponseI,
  ResponseII,
  ResponseIII,
  StatementAnswer,
  PresentationOrder,
} from '../domain/index.ts';
import {
  validateExamVersion,
  validateAttemptResponses,
  validatePresentationOrder,
  createPresentationOrder,
  scoreAttempt,
  scoreResultToDTO,
} from '../domain/index.ts';

import type {
  WebExam,
  WebQuestion,
  AttemptRecord,
  Result,
  WebError,
} from '../schema/index.ts';
import { toDomainExam, parseExam } from '../schema/index.ts';

import type {
  StoragePort,
  StoredObjectEnvelope,
} from './types.ts';
import {
  attemptKeyToString,
} from './index.ts';

/**
 * StorageLike interface representing localStorage or an in-memory mock for testing.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear?(): void;
  readonly length: number;
  key(index: number): string | null;
}

/**
 * Legacy key types identified by prefix and structure in index.html.
 */
export type LegacyKeyType =
  | 'draft_attempt'
  | 'final_attempt'
  | 'active_pointer'
  | 'history'
  | 'snapshot'
  | 'active_snapshot'
  | 'active_exam_id'
  | 'bank'
  | 'legacy_root'
  | 'unknown';

export interface ParsedLegacyKey {
  readonly key: string;
  readonly type: LegacyKeyType;
  readonly examId?: string;
  readonly examVersionId?: string;
  readonly attemptId?: string;
}

/**
 * Key builders matching actual key construction in index.html.
 */
export function buildDraftKey(examId: string, version: string, attemptId: string): string {
  return 'cunata:attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(attemptId);
}

export function buildFinalKey(examId: string, version: string, attemptId: string): string {
  return 'cunata:final:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(attemptId);
}

export function buildPointerKey(examId: string, version: string): string {
  return 'cunata:active_attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version);
}

export function buildHistoryKey(examId: string, version: string): string {
  return 'cunata:history:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version);
}

export function buildSnapshotKey(examId: string, version: string): string {
  return 'cunata:snapshot:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version);
}

/**
 * Parse a legacy storage key with actual identity encoding.
 * Colons in IDs are percent-encoded via encodeURIComponent, so splitting by ':'
 * after the canonical prefix reliably extracts components without guessing delimiters.
 */
export function parseLegacyStorageKey(key: string): ParsedLegacyKey {
  if (key === 'cunata_exam_attempt_v1') {
    return { key, type: 'legacy_root' };
  }
  if (key === 'cunata:active_exam_snapshot') {
    return { key, type: 'active_snapshot' };
  }
  if (key === 'cunata:active_exam_id') {
    return { key, type: 'active_exam_id' };
  }
  if (key === 'cunata:question_bank') {
    return { key, type: 'bank' };
  }

  const PREFIX_DRAFT = 'cunata:attempt:';
  if (key.startsWith(PREFIX_DRAFT)) {
    const rest = key.slice(PREFIX_DRAFT.length);
    const parts = rest.split(':');
    if (parts.length === 3 && parts[0] !== undefined && parts[1] !== undefined && parts[2] !== undefined) {
      try {
        return {
          key,
          type: 'draft_attempt',
          examId: decodeURIComponent(parts[0]),
          examVersionId: decodeURIComponent(parts[1]),
          attemptId: decodeURIComponent(parts[2]),
        };
      } catch {
        return { key, type: 'unknown' };
      }
    }
  }

  const PREFIX_FINAL = 'cunata:final:';
  if (key.startsWith(PREFIX_FINAL)) {
    const rest = key.slice(PREFIX_FINAL.length);
    const parts = rest.split(':');
    if (parts.length === 3 && parts[0] !== undefined && parts[1] !== undefined && parts[2] !== undefined) {
      try {
        return {
          key,
          type: 'final_attempt',
          examId: decodeURIComponent(parts[0]),
          examVersionId: decodeURIComponent(parts[1]),
          attemptId: decodeURIComponent(parts[2]),
        };
      } catch {
        return { key, type: 'unknown' };
      }
    }
  }

  const PREFIX_POINTER = 'cunata:active_attempt:';
  if (key.startsWith(PREFIX_POINTER)) {
    const rest = key.slice(PREFIX_POINTER.length);
    const parts = rest.split(':');
    if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
      try {
        return {
          key,
          type: 'active_pointer',
          examId: decodeURIComponent(parts[0]),
          examVersionId: decodeURIComponent(parts[1]),
        };
      } catch {
        return { key, type: 'unknown' };
      }
    }
  }

  const PREFIX_HISTORY = 'cunata:history:';
  if (key.startsWith(PREFIX_HISTORY)) {
    const rest = key.slice(PREFIX_HISTORY.length);
    const parts = rest.split(':');
    if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
      try {
        return {
          key,
          type: 'history',
          examId: decodeURIComponent(parts[0]),
          examVersionId: decodeURIComponent(parts[1]),
        };
      } catch {
        return { key, type: 'unknown' };
      }
    }
  }

  const PREFIX_SNAPSHOT = 'cunata:snapshot:';
  if (key.startsWith(PREFIX_SNAPSHOT)) {
    const rest = key.slice(PREFIX_SNAPSHOT.length);
    const parts = rest.split(':');
    if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
      try {
        return {
          key,
          type: 'snapshot',
          examId: decodeURIComponent(parts[0]),
          examVersionId: decodeURIComponent(parts[1]),
        };
      } catch {
        return { key, type: 'unknown' };
      }
    }
  }

  return { key, type: 'unknown' };
}

/**
 * Quarantine record structure for storing and exporting un-migratable or corrupted data.
 */
export interface QuarantineEntry {
  readonly id: string;
  readonly sourceKey: string;
  readonly rawValue: string;
  readonly reason: string;
  readonly issues?: readonly ValidationIssue[];
  readonly timestamp: number;
}

/**
 * Export raw quarantine entries to a JSON string.
 */
export function exportQuarantineRawString(quarantine: readonly QuarantineEntry[]): string {
  return JSON.stringify(
    {
      schemaVersion: 'cunata-quarantine-v1',
      exportedAt: new Date().toISOString(),
      count: quarantine.length,
      entries: quarantine,
    },
    null,
    2
  );
}

/**
 * Export raw quarantine entries to a Blob.
 */
export function exportQuarantineRaw(quarantine: readonly QuarantineEntry[]): Blob {
  const jsonStr = exportQuarantineRawString(quarantine);
  return new Blob([jsonStr], { type: 'application/json' });
}

export interface MapResponsesResult {
  readonly ok: boolean;
  readonly responses?: AttemptResponses;
  readonly issues?: readonly ValidationIssue[];
  readonly reason?: string;
}

/**
 * Map legacy studentState.responses object to domain AttemptResponses array.
 * Rules:
 * - Own special IDs mapped using Map / Object.hasOwn.
 * - Part I: selected option ID string or null. Unknown option -> Foreign option issue.
 * - Part II: 4 statements array. Missing statement in legacy record or explicit null remains null.
 *   Never force missing/null to false! Unknown statement -> Foreign statement issue.
 * - Part III: raw string or null.
 * - Unknown questions in legacy responses -> Foreign question issue.
 */
export function mapLegacyResponsesToDomain(
  exam: WebExam,
  legacyResponses: unknown,
  attemptId: string
): MapResponsesResult {
  const domainExam = toDomainExam(exam);

  if (legacyResponses === null || legacyResponses === undefined) {
    const emptyResponses: AttemptResponses = {
      attemptId,
      examVersionId: exam.examVersionId,
      responses: [],
    };
    return { ok: true, responses: emptyResponses };
  }

  if (typeof legacyResponses !== 'object' || Array.isArray(legacyResponses)) {
    return {
      ok: false,
      reason: 'Responses legacy không phải là đối tượng key-value hợp lệ',
    };
  }

  const legacyRec = legacyResponses as Record<string, unknown>;
  const questionMap = new Map<string, WebQuestion>();
  for (const q of exam.questions) {
    questionMap.set(q.questionVersionId, q);
  }

  // Detect foreign questions in responses
  for (const qId of Object.keys(legacyRec)) {
    if (!questionMap.has(qId)) {
      return {
        ok: false,
        reason: `Câu hỏi lạ (foreign question ref) "${qId}" không tồn tại trong đề thi`,
        issues: [
          {
            code: 'RESPONSE_UNKNOWN_QUESTION',
            path: `responses.${qId}`,
            message: `Question '${qId}' is not in exam`,
          },
        ],
      };
    }
  }

  const mappedResponses: Response[] = [];

  for (const q of exam.questions) {
    if (!Object.hasOwn(legacyRec, q.questionVersionId)) {
      continue;
    }

    const rawVal = legacyRec[q.questionVersionId];

    if (q.kind === 'I') {
      const allowedOptionIds = new Set(q.options.map((o) => o.optionId));
      if (rawVal === null || rawVal === undefined || rawVal === '') {
        const respI: ResponseI = {
          kind: 'I',
          questionVersionId: q.questionVersionId,
          selectedOptionId: null,
        };
        mappedResponses.push(respI);
      } else if (typeof rawVal === 'string') {
        if (!allowedOptionIds.has(rawVal)) {
          return {
            ok: false,
            reason: `Lựa chọn lạ (foreign option ref) "${rawVal}" cho câu hỏi "${q.questionVersionId}"`,
            issues: [
              {
                code: 'OPTION_UNKNOWN',
                path: `responses.${q.questionVersionId}`,
                message: `Option ID '${rawVal}' does not belong to question '${q.questionVersionId}'`,
              },
            ],
          };
        }
        const respI: ResponseI = {
          kind: 'I',
          questionVersionId: q.questionVersionId,
          selectedOptionId: rawVal,
        };
        mappedResponses.push(respI);
      } else {
        return {
          ok: false,
          reason: `Giá trị trả lời không hợp lệ cho câu hỏi phần I "${q.questionVersionId}"`,
        };
      }
    } else if (q.kind === 'II') {
      const allowedStatementIds = new Set(q.statements.map((s) => s.statementId));

      if (rawVal === null || rawVal === undefined) {
        const answers: StatementAnswer[] = q.statements.map((s) => ({
          statementId: s.statementId,
          value: null,
        }));
        const respII: ResponseII = {
          kind: 'II',
          questionVersionId: q.questionVersionId,
          answers,
        };
        mappedResponses.push(respII);
      } else if (typeof rawVal === 'object' && !Array.isArray(rawVal)) {
        const stRec = rawVal as Record<string, unknown>;

        // Check foreign statement references
        for (const stKey of Object.keys(stRec)) {
          if (!allowedStatementIds.has(stKey)) {
            return {
              ok: false,
              reason: `Ý mệnh đề lạ (foreign statement ref) "${stKey}" cho câu hỏi "${q.questionVersionId}"`,
              issues: [
                {
                  code: 'STATEMENT_UNKNOWN',
                  path: `responses.${q.questionVersionId}.${stKey}`,
                  message: `Statement ID '${stKey}' does not belong to question '${q.questionVersionId}'`,
                },
              ],
            };
          }
        }

        const answers: StatementAnswer[] = [];
        for (const s of q.statements) {
          if (Object.hasOwn(stRec, s.statementId)) {
            const val = stRec[s.statementId];
            if (typeof val === 'boolean') {
              answers.push({ statementId: s.statementId, value: val });
            } else if (val === null || val === undefined) {
              answers.push({ statementId: s.statementId, value: null });
            } else {
              return {
                ok: false,
                reason: `Giá trị trả lời ý "${s.statementId}" không phải boolean hoặc null`,
              };
            }
          } else {
            // Missing statement in legacy record: preserve as null! NEVER force to false!
            answers.push({ statementId: s.statementId, value: null });
          }
        }

        const respII: ResponseII = {
          kind: 'II',
          questionVersionId: q.questionVersionId,
          answers,
        };
        mappedResponses.push(respII);
      } else {
        return {
          ok: false,
          reason: `Cấu trúc trả lời không hợp lệ cho câu hỏi phần II "${q.questionVersionId}"`,
        };
      }
    } else if (q.kind === 'III') {
      if (rawVal === null || rawVal === undefined) {
        const respIII: ResponseIII = {
          kind: 'III',
          questionVersionId: q.questionVersionId,
          raw: null,
        };
        mappedResponses.push(respIII);
      } else if (typeof rawVal === 'string') {
        const respIII: ResponseIII = {
          kind: 'III',
          questionVersionId: q.questionVersionId,
          raw: rawVal,
        };
        mappedResponses.push(respIII);
      } else {
        return {
          ok: false,
          reason: `Giá trị câu trả lời phần III phải là chuỗi hoặc null`,
        };
      }
    }
  }

  const attemptResponses: AttemptResponses = {
    attemptId,
    examVersionId: exam.examVersionId,
    responses: mappedResponses,
  };

  const valRes = validateAttemptResponses(domainExam, attemptResponses);
  if (!valRes.ok) {
    return {
      ok: false,
      reason: 'Validation domain AttemptResponses thất bại',
      issues: valRes.issues,
    };
  }

  return { ok: true, responses: attemptResponses };
}

/**
 * Recompute old numeric score using domain scoreAttempt engine and convert to canonical DTO.
 * Legacy floating-point numbers are NEVER trusted.
 */
export function recomputeLegacyScore(
  domainExam: ExamVersion,
  responses: AttemptResponses
): { ok: true; scoreDTO: unknown } | { ok: false; error: string } {
  try {
    const scoreResult = scoreAttempt(domainExam, responses);
    const dto = scoreResultToDTO(scoreResult);
    return { ok: true, scoreDTO: dto };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export interface MigrationOptions {
  readonly storage: StoragePort;
  readonly localStorage?: StorageLike;
  readonly approvedD03?: boolean;
  readonly activeExamSnapshot?: WebExam | null;
  readonly skipBank?: boolean;
}

export interface MigrationReport {
  readonly status: 'success' | 'partial' | 'unapproved';
  readonly migratedAttempts: number;
  readonly migratedDrafts: number;
  readonly migratedFinals: number;
  readonly migratedBankQuestions: number;
  readonly migratedSnapshots: number;
  readonly quarantinedCount: number;
  readonly quarantined: readonly QuarantineEntry[];
  readonly skippedFutureVersions: number;
  readonly skippedKeys: readonly string[];
}

/**
 * Normalize bank question difficulty to official Vietnamese labels.
 */
function normalizeDifficulty(diff: unknown): 'Nhận biết' | 'Thông hiểu' | 'Vận dụng' {
  if (typeof diff === 'string') {
    const d = diff.trim().toLowerCase();
    if (d === 'nhan_biet' || d === 'nhận biết') return 'Nhận biết';
    if (d === 'thong_hieu' || d === 'thông hiểu') return 'Thông hiểu';
    if (d === 'van_dung' || d === 'vận dụng') return 'Vận dụng';
  }
  return 'Thông hiểu';
}

/**
 * Migrate legacy data from localStorage to StoragePort.
 * Invariants:
 * 1. AC: Migration NEVER auto-activates without explicit D03 approval (approvedD03 === true).
 * 2. AC: Source data in localStorage is NEVER destroyed during migration or rollback.
 * 3. Idempotent: Can be retried cleanly after interruption without corrupting or duplicating records.
 * 4. Conflicting main/final: Final submitted record always wins over draft.
 * 5. Corrupted/invalid data or foreign refs are safely placed in quarantine with raw export available.
 * 6. Preserves candidateName, presentationOrder, startedAt, deadline.
 */
export async function migrateLegacyStorage(
  options: MigrationOptions
): Promise<Result<MigrationReport>> {
  if (options.approvedD03 !== true) {
    return {
      ok: false,
      error: {
        code: 'D03_NOT_APPROVED',
        path: 'approvedD03',
        message: 'Di trú lưu trữ yêu cầu phê duyệt D03 chính thức từ Trưởng phòng (Product Owner).',
        recoverable: true,
      },
    };
  }

  const ls: StorageLike | undefined =
    options.localStorage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);

  if (!ls) {
    return {
      ok: false,
      error: {
        code: 'STORAGE_UNAVAILABLE',
        path: 'localStorage',
        message: 'Không tìm thấy localStorage để thực hiện di trú.',
        recoverable: false,
      },
    };
  }

  const storage = options.storage;
  const quarantined: QuarantineEntry[] = [];
  let migratedDrafts = 0;
  let migratedFinals = 0;
  let migratedBankQuestions = 0;
  let migratedSnapshots = 0;
  let skippedFutureVersions = 0;
  const skippedKeys: string[] = [];

  const addQuarantine = (sourceKey: string, rawValue: string, reason: string, issues?: readonly ValidationIssue[]) => {
    quarantined.push({
      id: `quarantine-${quarantined.length + 1}-${Date.now()}`,
      sourceKey,
      rawValue,
      reason,
      issues,
      timestamp: Date.now(),
    });
  };

  // 1. Collect all keys from localStorage
  const allKeys: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k) allKeys.push(k);
  }

  // 2. Discover and index all Exam Snapshots
  const knownSnapshots = new Map<string, WebExam>();

  if (options.activeExamSnapshot) {
    const key = `${options.activeExamSnapshot.examId}::${options.activeExamSnapshot.examVersionId}`;
    knownSnapshots.set(key, options.activeExamSnapshot);
  }

  for (const k of allKeys) {
    const parsedKey = parseLegacyStorageKey(k);
    if (parsedKey.type === 'snapshot' || parsedKey.type === 'active_snapshot') {
      const raw = ls.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const valRes = parseExam(parsed);
        if (valRes.ok) {
          const exam = valRes.value;
          const sKey = `${exam.examId}::${exam.examVersionId}`;
          knownSnapshots.set(sKey, exam);
          const examPutRes = await storage.putObject('exams', JSON.stringify([exam.examId, exam.examVersionId]), exam, null);
          if (!examPutRes.ok) {
            if (examPutRes.error.code === 'STORAGE_QUOTA') {
              return examPutRes;
            }
          } else {
            migratedSnapshots++;
          }
        } else {
          addQuarantine(k, raw, `Snapshot đề thi không hợp lệ: ${valRes.issues.map((i) => i.message).join('; ')}`, valRes.issues);
        }
      } catch (err) {
        addQuarantine(k, raw, `Lỗi cú pháp JSON snapshot đề thi: ${String(err)}`);
      }
    }
  }

  // 3. Migrate Question Bank (cunata:question_bank)
  if (!options.skipBank) {
    const rawBank = ls.getItem('cunata:question_bank');
    if (rawBank) {
      try {
        const parsedBank = JSON.parse(rawBank);
        if (Array.isArray(parsedBank)) {
          for (let bIdx = 0; bIdx < parsedBank.length; bIdx++) {
            const q = parsedBank[bIdx];
            if (!q || typeof q !== 'object' || !q.questionVersionId || !q.kind) {
              addQuarantine('cunata:question_bank', JSON.stringify(q), `Câu hỏi ngân hàng thứ ${bIdx} thiếu questionVersionId hoặc kind`);
              continue;
            }

            const subject = typeof q.subject === 'string' && q.subject.trim() ? q.subject.trim() : 'Toán học';
            const grade = q.grade === 10 || q.grade === 11 || q.grade === 12 ? q.grade : 12;
            const topic = typeof q.topic === 'string' && q.topic.trim() ? q.topic.trim() : 'Chủ đề mặc định';
            const lesson = typeof q.lesson === 'string' && q.lesson.trim() ? q.lesson.trim() : 'Bài học mặc định';
            const difficulty = normalizeDifficulty(q.difficulty);

            const bankEntry = {
              questionId: typeof q.questionId === 'string' && q.questionId.trim() ? q.questionId.trim() : q.questionVersionId,
              questionVersionId: q.questionVersionId,
              revision: 1,
              taxonomy: { subject, grade, topic, lesson, difficulty },
              question: q,
            };

            const bankPutRes = await storage.putObject('bank', q.questionVersionId, bankEntry, null);
            if (!bankPutRes.ok) {
              if (bankPutRes.error.code === 'STORAGE_QUOTA') {
                return bankPutRes;
              }
              addQuarantine('cunata:question_bank', JSON.stringify(q), `Lỗi khi lưu vào ngân hàng câu hỏi: ${bankPutRes.error.message}`);
            } else {
              migratedBankQuestions++;
            }
          }
        } else {
          addQuarantine('cunata:question_bank', rawBank, 'Dữ liệu cunata:question_bank không phải mảng');
        }
      } catch (err) {
        addQuarantine('cunata:question_bank', rawBank, `Lỗi JSON parse cunata:question_bank: ${String(err)}`);
      }
    }
  }

  // 4. Group Attempt Keys & Handle Conflicting Main/Final
  interface AttemptSourceCandidate {
    finalKey?: string;
    draftKey?: string;
    legacyRootKey?: string;
  }
  const attemptGroups = new Map<string, AttemptSourceCandidate>();

  for (const k of allKeys) {
    const pk = parseLegacyStorageKey(k);
    if (pk.type === 'final_attempt') {
      const tupleKey = `${pk.examId}::${pk.examVersionId}::${pk.attemptId}`;
      const group = attemptGroups.get(tupleKey) ?? {};
      group.finalKey = k;
      attemptGroups.set(tupleKey, group);
    } else if (pk.type === 'draft_attempt') {
      const tupleKey = `${pk.examId}::${pk.examVersionId}::${pk.attemptId}`;
      const group = attemptGroups.get(tupleKey) ?? {};
      group.draftKey = k;
      attemptGroups.set(tupleKey, group);
    } else if (pk.type === 'legacy_root') {
      const raw = ls.getItem(k);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const examId = parsed.examId || 'exam-thpt-toan-demo-01';
          const version = parsed.examVersionId || 'v1.0.0';
          const attemptId = parsed.attemptId || 'attempt-legacy-v1';
          const tupleKey = `${examId}::${version}::${attemptId}`;
          const group = attemptGroups.get(tupleKey) ?? {};
          group.legacyRootKey = k;
          attemptGroups.set(tupleKey, group);
        } catch {
          addQuarantine(k, raw, 'Lỗi JSON parse cunata_exam_attempt_v1');
        }
      }
    }
  }

  // 5. Migrate Attempts
  for (const [tupleKey, candidate] of attemptGroups.entries()) {
    const parts = tupleKey.split('::');
    const examId = parts[0] ?? '';
    const examVersionId = parts[1] ?? '';
    const attemptId = parts[2] ?? '';
    if (!examId || !examVersionId || !attemptId) continue;

    let sourceKey: string;
    let chosenRaw: string | null = null;
    let isFinalCandidate = false;

    // Conflicting main/final resolution: Existing final ALWAYS wins!
    if (candidate.finalKey) {
      sourceKey = candidate.finalKey;
      chosenRaw = ls.getItem(candidate.finalKey);
      isFinalCandidate = true;
    } else if (candidate.draftKey) {
      sourceKey = candidate.draftKey;
      chosenRaw = ls.getItem(candidate.draftKey);
    } else if (candidate.legacyRootKey) {
      sourceKey = candidate.legacyRootKey;
      chosenRaw = ls.getItem(candidate.legacyRootKey);
    } else {
      continue;
    }

    if (!chosenRaw) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(chosenRaw);
    } catch (err) {
      addQuarantine(sourceKey, chosenRaw, `Cú pháp JSON bài làm không hợp lệ: ${String(err)}`);
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      addQuarantine(sourceKey, chosenRaw, 'Dữ liệu bài làm không phải đối tượng JSON hợp lệ');
      continue;
    }

    // Future version check: unknown future schemas must be kept untouched
    if (typeof parsed.schemaVersion === 'string' && parsed.schemaVersion !== 'web-attempt-v1') {
      skippedFutureVersions++;
      skippedKeys.push(sourceKey);
      continue;
    }

    // Check if draft key was actually a submitted final
    if (parsed.submitted === true) {
      isFinalCandidate = true;
    }

    // Resolve Exam Snapshot
    let examSnapshot: WebExam | null = null;
    if (parsed.examSnapshot && typeof parsed.examSnapshot === 'object') {
      const snapVal = parseExam(parsed.examSnapshot);
      if (snapVal.ok) {
        examSnapshot = snapVal.value;
        const sKey = `${examSnapshot.examId}::${examSnapshot.examVersionId}`;
        if (!knownSnapshots.has(sKey)) {
          knownSnapshots.set(sKey, examSnapshot);
        }
      }
    }

    if (!examSnapshot) {
      const sKey = `${examId}::${examVersionId}`;
      const found = knownSnapshots.get(sKey);
      if (found) {
        examSnapshot = found;
      }
    }

    if (!examSnapshot) {
      addQuarantine(sourceKey, chosenRaw, `Không tìm thấy snapshot đề thi hợp lệ cho [${examId}, ${examVersionId}]`);
      continue;
    }

    const domainExam = toDomainExam(examSnapshot);

    // Resolve Presentation Order
    let presentationOrder: PresentationOrder;
    if (parsed.presentationOrder && typeof parsed.presentationOrder === 'object') {
      const oIssues = validatePresentationOrder(domainExam, parsed.presentationOrder as PresentationOrder);
      if (oIssues.length === 0) {
        presentationOrder = parsed.presentationOrder as PresentationOrder;
      } else {
        addQuarantine(sourceKey, chosenRaw, `PresentationOrder không hợp lệ: ${oIssues.map((i) => i.message).join('; ')}`, oIssues);
        continue;
      }
    } else {
      // Synthesize canonical unshuffled presentation order
      presentationOrder = createPresentationOrder(
        domainExam,
        { shuffleQuestions: false, shuffleOptions: false },
        'legacy-unshuffled'
      );
    }

    // Map responses & preserve Part II missing/null
    const mapRes = mapLegacyResponsesToDomain(examSnapshot, parsed.responses, attemptId);
    if (!mapRes.ok || !mapRes.responses) {
      addQuarantine(sourceKey, chosenRaw, mapRes.reason || 'Lỗi ánh xạ câu trả lời legacy', mapRes.issues);
      continue;
    }

    // Score Recomputation for Final attempts
    let scoreDTO: unknown | null = null;
    let submittedAt: number | null = null;

    if (isFinalCandidate) {
      const scoreRes = recomputeLegacyScore(domainExam, mapRes.responses);
      if (!scoreRes.ok) {
        addQuarantine(sourceKey, chosenRaw, `Lỗi tính lại điểm (recompute): ${scoreRes.error}`);
        continue;
      }
      scoreDTO = scoreRes.scoreDTO;

      if (typeof parsed.submittedAt === 'number') {
        submittedAt = parsed.submittedAt;
      } else if (typeof parsed.submittedAtFull === 'string') {
        const parsedTime = new Date(parsed.submittedAtFull).getTime();
        submittedAt = !isNaN(parsedTime) ? parsedTime : Date.now();
      } else if (typeof parsed.deadline === 'number') {
        submittedAt = parsed.deadline;
      } else {
        submittedAt = Date.now();
      }
    }

    const candidateName =
      typeof parsed.candidateName === 'string' && parsed.candidateName.trim() !== ''
        ? parsed.candidateName.trim()
        : 'Thí sinh tự do';

    const startedAt = typeof parsed.startedAt === 'number' ? parsed.startedAt : Date.now();
    const durationSeconds = typeof parsed.durationSeconds === 'number' ? parsed.durationSeconds : 50 * 60;
    const deadline = typeof parsed.deadline === 'number' ? parsed.deadline : startedAt + durationSeconds * 1000;
    const revision = typeof parsed.revision === 'number' && parsed.revision > 0 ? parsed.revision : 1;

    const attemptRecord: AttemptRecord = {
      schemaVersion: 'web-attempt-v1',
      examId,
      examVersionId,
      attemptId,
      revision,
      candidateName,
      examSnapshot,
      presentationOrder,
      responses: mapRes.responses,
      startedAt,
      deadline,
      phase: isFinalCandidate ? 'final' : 'draft',
      submittedAt,
      scoreDTO,
    };

    try {
      // Check existing in StoragePort
      const loadRes = await storage.load(attemptRecord);
      if (!loadRes.ok && loadRes.error.code === 'STORAGE_QUOTA') {
        return loadRes;
      }
      const existing = loadRes.ok ? loadRes.value : null;

      if (existing && existing.phase === 'final') {
        // Existing final in storage is terminal; keep it
        migratedFinals++;
      } else if (attemptRecord.phase === 'final') {
        const expectedRev = existing ? existing.revision : 0;
        const finRes = await storage.finalize(attemptRecord, expectedRev);
        if (finRes.ok) {
          migratedFinals++;
        } else {
          if (finRes.error.code === 'STORAGE_QUOTA') {
            return finRes;
          }
          addQuarantine(sourceKey, chosenRaw, `Lỗi finalize lượt thi: ${finRes.error.message}`);
        }
      } else {
        // Draft
        if (!existing) {
          const createRes = await storage.create(attemptRecord);
          if (createRes.ok) {
            migratedDrafts++;
          } else {
            if (createRes.error.code === 'STORAGE_QUOTA') {
              return createRes;
            }
            addQuarantine(sourceKey, chosenRaw, `Lỗi create lượt thi draft: ${createRes.error.message}`);
          }
        } else {
          migratedDrafts++;
        }
      }
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'STORAGE_QUOTA') {
        return {
          ok: false,
          error: {
            code: 'STORAGE_QUOTA',
            path: 'storage',
            message: 'Bộ nhớ lưu trữ đã đầy trong quá trình di trú lượt thi',
            recoverable: true,
          },
        };
      }
      addQuarantine(sourceKey, chosenRaw, `Lỗi ngoại lệ khi lưu trữ lượt thi: ${String(err)}`);
    }
  }

  // 6. Save Quarantine registry to storage imports store if any invalid items
  if (quarantined.length > 0) {
    try {
      await storage.putObject('imports', 'quarantine_registry', quarantined, null);
    } catch (_) {
      // non-fatal
    }
  }

  // 7. Mark migration status in localStorage without deleting source
  try {
    ls.setItem(
      'cunata:migration:v1:status',
      JSON.stringify({
        status: 'completed',
        migratedAt: Date.now(),
        migratedAttempts: migratedDrafts + migratedFinals,
        quarantinedCount: quarantined.length,
      })
    );
  } catch (_) {}

  const report: MigrationReport = {
    status: quarantined.length > 0 ? 'partial' : 'success',
    migratedAttempts: migratedDrafts + migratedFinals,
    migratedDrafts,
    migratedFinals,
    migratedBankQuestions,
    migratedSnapshots,
    quarantinedCount: quarantined.length,
    quarantined,
    skippedFutureVersions,
    skippedKeys,
  };

  return { ok: true, value: report };
}
