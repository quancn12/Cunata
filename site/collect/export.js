import { scoreAttempt, scoreResultToDTO, ENGINE_VERSION, } from '../domain/index.js';
import { toDomainExam } from '../schema/index.js';
/**
 * Standard 17 headers for Cunata GDPT 2018 exam collection & CSV export.
 * Exactly matches Google Sheets collector column specification (A-Q).
 */
export const CSV_HEADERS = [
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
];
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
export function isFormulaDangerous(str) {
    return DANGEROUS_TRIGGER_PREFIX_REGEX.test(str) || CONTROL_CHAR_START_REGEX.test(str);
}
/**
 * Neutralizes spreadsheet formula injection (CWE-1236) by prepending an apostrophe (').
 * Google Sheets and Excel treat the leading apostrophe as a plain-text directive,
 * rendering the raw value safely without evaluating formula code.
 *
 * If the input does not start with a dangerous trigger, it is returned as-is.
 */
export function neutralizeFormula(input) {
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
export function escapeCsvCell(value) {
    const sanitized = neutralizeFormula(value);
    const escaped = sanitized.replace(/"/g, '""');
    return `"${escaped}"`;
}
/**
 * Resolves or recomputes the scoreDTO for an attempt record.
 * If scoreDTO is already present and valid, returns it; otherwise re-scores via domain engine.
 */
export function resolveScoreDTO(final) {
    if (final.scoreDTO && typeof final.scoreDTO === 'object') {
        return final.scoreDTO;
    }
    try {
        const domainExam = toDomainExam(final.examSnapshot);
        const scoreResult = scoreAttempt(domainExam, final.responses);
        return scoreResultToDTO(scoreResult);
    }
    catch {
        return null;
    }
}
/**
 * Serializes raw student responses for CSV export.
 * Neutralizes formula triggers across untrusted fields (question IDs, selected option IDs,
 * statement IDs, and raw text answers in Part III such as '-0,5') while keeping valid JSON structure.
 */
export function serializeRawAnswersForCsv(responses) {
    if (!responses || !Array.isArray(responses.responses)) {
        return '[]';
    }
    const safeResponses = responses.responses.map((r) => {
        if (r.kind === 'I') {
            const respI = r;
            return {
                kind: 'I',
                questionVersionId: neutralizeFormula(respI.questionVersionId),
                selectedOptionId: respI.selectedOptionId !== null ? neutralizeFormula(respI.selectedOptionId) : null,
            };
        }
        else if (r.kind === 'II') {
            const respII = r;
            return {
                kind: 'II',
                questionVersionId: neutralizeFormula(respII.questionVersionId),
                answers: Array.isArray(respII.answers)
                    ? respII.answers.map((a) => ({
                        statementId: neutralizeFormula(a.statementId),
                        value: a.value,
                    }))
                    : [],
            };
        }
        else if (r.kind === 'III') {
            const respIII = r;
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
 * Builds a single canonical web-result-v1 export payload from an AttemptRecord.
 * Raw responses and candidateName are preserved strictly without CSV formula neutralization.
 */
export function buildWebResultPayload(final) {
    const scoreDTO = resolveScoreDTO(final);
    const durationSeconds = final.submittedAt !== null && typeof final.startedAt === 'number'
        ? Math.max(0, Math.round((final.submittedAt - final.startedAt) / 1000))
        : 0;
    let classCode = final.class_code ??
        final.classCode ??
        final.metadata?.class_code ??
        final.metadata?.classCode;
    let assignmentId = final.assignment_id ??
        final.assignmentId ??
        final.metadata?.assignment_id ??
        final.metadata?.assignmentId;
    let studentId = final.student_id ??
        final.studentId ??
        final.metadata?.student_id ??
        final.metadata?.studentId;
    return {
        schemaVersion: 'web-result-v1',
        attemptId: final.attemptId,
        examId: final.examId,
        examVersionId: final.examVersionId,
        candidateName: final.candidateName,
        startedAt: final.startedAt,
        submittedAt: final.submittedAt,
        durationSeconds,
        ruleSetId: scoreDTO?.ruleSetId ?? final.examSnapshot?.ruleSetId ?? 'custom-v1',
        inputPolicyId: scoreDTO?.inputPolicyId ?? final.examSnapshot?.inputPolicyId ?? 'sa-charset-v1',
        engineVersion: scoreDTO?.engineVersion ?? ENGINE_VERSION,
        scoreDTO: scoreDTO ?? null,
        responses: final.responses,
        ...(classCode ? { class_code: String(classCode).trim().toUpperCase() } : {}),
        ...(assignmentId ? { assignment_id: String(assignmentId).trim() } : {}),
        ...(studentId ? { student_id: String(studentId).trim() } : {}),
    };
}
/**
 * Serializes finalized attempts into canonical web-result-v1 JSON format.
 * - Exact raw text is preserved for all fields (no formula prefix neutralization in JSON).
 * - Rational scores in scoreDTO remain exact fraction strings (e.g. '1/4', '10/3', '0').
 */
export function serializeResultsJson(finals) {
    const items = finals.map(buildWebResultPayload);
    let container;
    if (items.length === 1) {
        const single = items[0];
        container = {
            ...single,
            results: items,
        };
    }
    else {
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
export function serializeResultsCsv(finals) {
    const headerLine = CSV_HEADERS.map(h => `"${h}"`).join(',') + '\r\n';
    if (finals.length === 0) {
        return headerLine;
    }
    const dataLines = finals.map(final => {
        const scoreDTO = resolveScoreDTO(final);
        const durationSeconds = final.submittedAt !== null && typeof final.startedAt === 'number'
            ? Math.max(0, Math.round((final.submittedAt - final.startedAt) / 1000))
            : 0;
        const startedAtIso = typeof final.startedAt === 'number' && !isNaN(final.startedAt)
            ? new Date(final.startedAt).toISOString()
            : String(final.startedAt ?? '');
        const submittedAtIso = typeof final.submittedAt === 'number' && !isNaN(final.submittedAt)
            ? new Date(final.submittedAt).toISOString()
            : '';
        const rawAnswersJson = serializeRawAnswersForCsv(final.responses);
        const cells = [
            escapeCsvCell(final.attemptId),
            escapeCsvCell(final.examId),
            escapeCsvCell(final.examVersionId),
            escapeCsvCell(final.candidateName),
            escapeCsvCell(startedAtIso),
            escapeCsvCell(submittedAtIso),
            escapeCsvCell(String(durationSeconds)),
            escapeCsvCell(scoreDTO?.sections?.I?.score ?? '0'),
            escapeCsvCell(scoreDTO?.sections?.I?.max ?? '0'),
            escapeCsvCell(scoreDTO?.sections?.II?.score ?? '0'),
            escapeCsvCell(scoreDTO?.sections?.II?.max ?? '0'),
            escapeCsvCell(scoreDTO?.sections?.III?.score ?? '0'),
            escapeCsvCell(scoreDTO?.sections?.III?.max ?? '0'),
            escapeCsvCell(scoreDTO?.total ?? '0'),
            escapeCsvCell(scoreDTO?.maxTotal ?? '0'),
            escapeCsvCell(scoreDTO?.ruleSetId ?? final.examSnapshot?.ruleSetId ?? 'custom-v1'),
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
export function exportResults(finals, format) {
    if (format === 'json') {
        const jsonStr = serializeResultsJson(finals);
        return new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    }
    else if (format === 'csv') {
        const csvStr = serializeResultsCsv(finals);
        return new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
    }
    else {
        throw new TypeError(`Unsupported export format: ${String(format)}`);
    }
}
