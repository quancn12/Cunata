import type { AttemptRecord } from '../schema/types.ts';
import type {
  AttemptResponses,
  Response,
  ResponseI,
  ResponseII,
  ResponseIII,
  StatementAnswer,
} from '../domain/index.ts';
import {
  scoreAttempt,
  scoreResultToDTO,
  ENGINE_VERSION,
} from '../domain/index.ts';
import { toDomainExam } from '../schema/index.ts';

/**
 * Standard 17 headers for Cunata GDPT 2018 exam collection & CSV export.
 * Exactly matches Google Sheets collector column specification (A-Q).
 */
export const CSV_HEADERS: readonly string[] = [
  'attempt_id',
  'exam_id',
  'exam_version_id',
  'candidate_display',
  'started_at',
  'submitted_at',
  'duration_seconds',
  'score_p1',
  'max_p1',
  'score_p2',
  'max_p2',
  'score_p3',
  'max_p3',
  'total_score',
  'max_total',
  'policy_version',
  'raw_answers_json',
] as const;

/**
 * Characters and prefixes that can trigger spreadsheet formula execution (CWE-1236):
 * - Standard prefixes: '=', '+', '-', '@', '|'
 * - Fullwidth equivalents: '＝' (\uFF1D), '＋' (\uFF0B), '－' (\uFF0D), '＠' (\uFF20), '｜' (\uFF5C)
 * - Leading whitespace, single quotes, or control characters preceding dangerous triggers
 * - Any string starting with control characters (\x00-\x1f, \x7f-\x9f)
 */
const DANGEROUS_TRIGGER_PREFIX_REGEX = /^['\s\x00-\x1f\x7f-\x9f\uFEFF\u200B-\u200D\u3000]*[=+\-@|＝＋－＠｜]/u;
const CONTROL_CHAR_START_REGEX = /^[\x00-\x1f\x7f-\x9f]/u;

/**
 * Determines whether a string value contains a dangerous formula trigger prefix.
 */
export function isFormulaDangerous(str: string): boolean {
  return DANGEROUS_TRIGGER_PREFIX_REGEX.test(str) || CONTROL_CHAR_START_REGEX.test(str);
}

/**
 * Neutralizes spreadsheet formula injection (CWE-1236) by prepending an apostrophe (').
 * Google Sheets and Excel treat the leading apostrophe as a plain-text directive,
 * rendering the raw value safely without evaluating formula code.
 *
 * If the input does not start with a dangerous trigger, it is returned as-is.
 */
export function neutralizeFormula(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }
  const str = String(input);
  if (str.length === 0) {
    return '';
  }
  if (isFormulaDangerous(str)) {
    return "'" + str;
  }
  return str;
}

/**
 * Escapes a cell value for standard RFC 4180 CSV export:
 * 1. Neutralizes any spreadsheet formula trigger prefixes.
 * 2. Doubles internal double-quotes (" -> "").
 * 3. Encloses the entire cell in double-quotes ("...").
 */
export function escapeCsvCell(value: unknown): string {
  const sanitized = neutralizeFormula(value);
  const escaped = sanitized.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Resolves or recomputes the scoreDTO for an attempt record.
 * If scoreDTO is already present and valid, returns it; otherwise re-scores via domain engine.
 */
export function resolveScoreDTO(final: AttemptRecord): any {
  if (final.scoreDTO && typeof final.scoreDTO === 'object') {
    return final.scoreDTO;
  }
  try {
    const domainExam = toDomainExam(final.examSnapshot);
    const scoreResult = scoreAttempt(domainExam, final.responses);
    return scoreResultToDTO(scoreResult);
  } catch {
    return null;
  }
}

/**
 * Serializes raw student responses for CSV export.
 * Neutralizes formula triggers across untrusted fields (question IDs, selected option IDs,
 * statement IDs, and raw text answers in Part III such as '-0,5') while keeping valid JSON structure.
 */
export function serializeRawAnswersForCsv(responses: AttemptResponses): string {
  if (!responses || !Array.isArray(responses.responses)) {
    return '[]';
  }
  const safeResponses = responses.responses.map((r: Response) => {
    if (r.kind === 'I') {
      const respI = r as ResponseI;
      return {
        kind: 'I',
        questionVersionId: neutralizeFormula(respI.questionVersionId),
        selectedOptionId: respI.selectedOptionId !== null ? neutralizeFormula(respI.selectedOptionId) : null,
      };
    } else if (r.kind === 'II') {
      const respII = r as ResponseII;
      return {
        kind: 'II',
        questionVersionId: neutralizeFormula(respII.questionVersionId),
        answers: Array.isArray(respII.answers)
          ? respII.answers.map((a: StatementAnswer) => ({
              statementId: neutralizeFormula(a.statementId),
              value: a.value,
            }))
          : [],
      };
    } else if (r.kind === 'III') {
      const respIII = r as ResponseIII;
      return {
        kind: 'III',
        questionVersionId: neutralizeFormula(respIII.questionVersionId),
        raw: respIII.raw !== null ? neutralizeFormula(respIII.raw) : null,
      };
    }
    return r;
  });
  return JSON.stringify(safeResponses);
}

/**
 * Canonical web-result-v1 export item structure.
 */
export interface WebResultV1 {
  readonly schemaVersion: 'web-result-v1';
  readonly attemptId: string;
  readonly examId: string;
  readonly examVersionId: string;
  readonly candidateName: string;
  readonly startedAt: number;
  readonly submittedAt: number | null;
  readonly durationSeconds: number;
  readonly ruleSetId: string;
  readonly inputPolicyId: string;
  readonly engineVersion: string;
  readonly scoreDTO: unknown | null;
  readonly responses: AttemptResponses;
  readonly class_code?: string;
  readonly assignment_id?: string;
}

/**
 * Builds a single canonical web-result-v1 export payload from an AttemptRecord.
 * Raw responses and candidateName are preserved strictly without CSV formula neutralization.
 */
export function buildWebResultPayload(final: AttemptRecord): WebResultV1 {
  const scoreDTO = resolveScoreDTO(final);
  const durationSeconds =
    final.submittedAt !== null && typeof final.startedAt === 'number'
      ? Math.max(0, Math.round((final.submittedAt - final.startedAt) / 1000))
      : 0;

  let classCode =
    (final as any).class_code ??
    (final as any).classCode ??
    (final as any).metadata?.class_code ??
    (final as any).metadata?.classCode;
  let assignmentId =
    (final as any).assignment_id ??
    (final as any).assignmentId ??
    (final as any).metadata?.assignment_id ??
    (final as any).metadata?.assignmentId;

  if (!classCode || !assignmentId) {
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem('cunata:active_assignment') || sessionStorage.getItem('cunata_active_assignment');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!classCode && parsed?.classCode) classCode = parsed.classCode;
          if (!assignmentId && parsed?.assignmentId) assignmentId = parsed.assignmentId;
        }
      }
    } catch {}
  }

  return {
    schemaVersion: 'web-result-v1',
    attemptId: final.attemptId,
    examId: final.examId,
    examVersionId: final.examVersionId,
    candidateName: final.candidateName,
    startedAt: final.startedAt,
    submittedAt: final.submittedAt,
    durationSeconds,
    ruleSetId: (scoreDTO as any)?.ruleSetId ?? final.examSnapshot?.ruleSetId ?? 'custom-v1',
    inputPolicyId: (scoreDTO as any)?.inputPolicyId ?? final.examSnapshot?.inputPolicyId ?? 'sa-charset-v1',
    engineVersion: (scoreDTO as any)?.engineVersion ?? ENGINE_VERSION,
    scoreDTO: scoreDTO ?? null,
    responses: final.responses,
    ...(classCode ? { class_code: String(classCode).trim().toUpperCase() } : {}),
    ...(assignmentId ? { assignment_id: String(assignmentId).trim() } : {}),
  };
}

/**
 * Serializes finalized attempts into canonical web-result-v1 JSON format.
 * - Exact raw text is preserved for all fields (no formula prefix neutralization in JSON).
 * - Rational scores in scoreDTO remain exact fraction strings (e.g. '1/4', '10/3', '0').
 */
export function serializeResultsJson(finals: readonly AttemptRecord[]): string {
  const items = finals.map(buildWebResultPayload);
  let container: Record<string, unknown>;

  if (items.length === 1) {
    const single = items[0]!;
    container = {
      ...single,
      results: items,
    };
  } else {
    container = {
      schemaVersion: 'web-result-v1',
      count: items.length,
      results: items,
    };
  }

  return JSON.stringify(container, null, 2);
}

/**
 * Serializes finalized attempts into RFC 4180 compliant CSV format:
 * - Every cell is enclosed in double quotes.
 * - Internal quotes are escaped by doubling ("").
 * - Every row ends with CRLF (\r\n).
 * - Untrusted fields (candidate name, IDs, raw III answers, JSON responses) are neutralized against formula injection.
 */
export function serializeResultsCsv(finals: readonly AttemptRecord[]): string {
  const headerLine = CSV_HEADERS.map(h => `"${h}"`).join(',') + '\r\n';
  if (finals.length === 0) {
    return headerLine;
  }

  const dataLines = finals.map(final => {
    const scoreDTO = resolveScoreDTO(final);
    const durationSeconds =
      final.submittedAt !== null && typeof final.startedAt === 'number'
        ? Math.max(0, Math.round((final.submittedAt - final.startedAt) / 1000))
        : 0;

    const startedAtIso =
      typeof final.startedAt === 'number' && !isNaN(final.startedAt)
        ? new Date(final.startedAt).toISOString()
        : String(final.startedAt ?? '');

    const submittedAtIso =
      typeof final.submittedAt === 'number' && !isNaN(final.submittedAt)
        ? new Date(final.submittedAt).toISOString()
        : '';

    const rawAnswersJson = serializeRawAnswersForCsv(final.responses);

    const cells: string[] = [
      escapeCsvCell(final.attemptId),
      escapeCsvCell(final.examId),
      escapeCsvCell(final.examVersionId),
      escapeCsvCell(final.candidateName),
      escapeCsvCell(startedAtIso),
      escapeCsvCell(submittedAtIso),
      escapeCsvCell(String(durationSeconds)),
      escapeCsvCell((scoreDTO as any)?.sections?.I?.score ?? '0'),
      escapeCsvCell((scoreDTO as any)?.sections?.I?.max ?? '0'),
      escapeCsvCell((scoreDTO as any)?.sections?.II?.score ?? '0'),
      escapeCsvCell((scoreDTO as any)?.sections?.II?.max ?? '0'),
      escapeCsvCell((scoreDTO as any)?.sections?.III?.score ?? '0'),
      escapeCsvCell((scoreDTO as any)?.sections?.III?.max ?? '0'),
      escapeCsvCell((scoreDTO as any)?.total ?? '0'),
      escapeCsvCell((scoreDTO as any)?.maxTotal ?? '0'),
      escapeCsvCell((scoreDTO as any)?.ruleSetId ?? final.examSnapshot?.ruleSetId ?? 'custom-v1'),
      escapeCsvCell(rawAnswersJson),
    ];

    return cells.join(',') + '\r\n';
  });

  return headerLine + dataLines.join('');
}

/**
 * Exports finalized attempt records as a portable Blob.
 * Supported formats:
 * - 'json': MIME 'application/json;charset=utf-8', web-result-v1 with exact raw answers
 * - 'csv': MIME 'text/csv;charset=utf-8', quoted CRLF with CWE-1236 formula neutralization
 */
export function exportResults(
  finals: readonly AttemptRecord[],
  format: 'json' | 'csv'
): Blob {
  if (format === 'json') {
    const jsonStr = serializeResultsJson(finals);
    return new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  } else if (format === 'csv') {
    const csvStr = serializeResultsCsv(finals);
    return new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
  } else {
    throw new TypeError(`Unsupported export format: ${String(format)}`);
  }
}
