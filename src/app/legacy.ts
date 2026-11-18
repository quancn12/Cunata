/**
 * Cunata Web M2-M6 — Legacy Compatibility Bridge & File-Open Fallback
 * Conforms to WEB-contract.md §2, §10 and tasks.json (WEB-W4-GLUE).
 *
 * Responsibilities:
 * - Bridges legacy scoring and data structures to the official domain engine.
 * - Imports all scoring, validation, rational and shuffle APIs strictly through src/domain/index.ts.
 * - Guarantees that no handwritten second scorer exists: all scoring delegates to scoreAttempt.
 * - Provides bidirectional response conversion between legacy Record and domain AttemptResponses.
 * - Exposes a compatibility harness for VM runners and browser environments.
 * - Enforces cutover gating: preserves root legacy when D03 remains unapproved (NEED_DECISION).
 */

import type {
  Id,
  Rational,
  QuestionI,
  QuestionII,
  QuestionIII,
  Question,
  ExamVersion,
  ResponseI,
  ResponseII,
  ResponseIII,
  Response,
  AttemptResponses,
  ValidationIssue,
  ShortAnswerIssue,
  ScoreResult,
  QuestionResult,
  QuestionStatus,
  PresentationOrder,
  ShuffleSettings,
} from '../domain/index.ts';

import {
  rational,
  ZERO,
  ONE,
  add,
  sub,
  mul,
  div,
  compare,
  equals,
  toFractionString,
  parseFractionString,
  toDecimalString,
  checkShortAnswer,
  validateExamVersion,
  validateAttemptResponses,
  createPresentationOrder,
  validatePresentationOrder,
  computeExamMax,
  scoreAttempt,
  scoreResultToDTO,
  scoreResultFromDTO,
  ENGINE_VERSION,
  POINT_I,
  PART2_POINTS,
} from '../domain/index.ts';

// ---------------------------------------------------------------------------
// 1. Rational Arithmetic Legacy Bridge
// ---------------------------------------------------------------------------

export { rational };

export function ratAdd(a: Rational, b: Rational): Rational {
  return add(a, b);
}

export function ratSub(a: Rational, b: Rational): Rational {
  return sub(a, b);
}

export function ratMul(a: Rational, b: Rational): Rational {
  return mul(a, b);
}

export function ratDiv(a: Rational, b: Rational): Rational {
  return div(a, b);
}

export function ratCompare(a: Rational, b: Rational): number {
  return compare(a, b);
}

export function ratEquals(a: Rational, b: Rational): boolean {
  return equals(a, b);
}

export function ratToNumber(r: Rational): number {
  return Number(r.num) / Number(r.den);
}

export function ratToFractionString(r: Rational): string {
  return toFractionString(r);
}

export function parseCanonicalFraction(s: string): Rational | null {
  try {
    return parseFractionString(s);
  } catch {
    return null;
  }
}

export function isValidCanonicalFraction(s: string): boolean {
  try {
    parseFractionString(s);
    return true;
  } catch {
    return false;
  }
}

export function formatRationalScore(val: string): string {
  let r: Rational;
  try {
    r = parseFractionString(val);
  } catch {
    return val;
  }
  if (!r) return val;
  if (r.den === 1n || r.num % r.den === 0n) return (r.num / r.den).toString();
  const isNeg = (r.num < 0n) !== (r.den < 0n);
  const absNum = r.num < 0n ? -r.num : r.num;
  const absDen = r.den < 0n ? -r.den : r.den;
  const scaled = absNum * 100n;
  let q = scaled / absDen;
  const rem = scaled % absDen;
  if (rem * 2n >= absDen) q += 1n;
  const intPart = q / 100n;
  const decPart = (q % 100n).toString().padStart(2, '0');
  return (isNeg ? '-' : '') + intPart.toString() + ',' + decPart;
}

// ---------------------------------------------------------------------------
// 2. Short Answer & Exam Max Legacy Bridge
// ---------------------------------------------------------------------------

export function legacyCheckShortAnswer(raw: string): readonly ShortAnswerIssue[] {
  return checkShortAnswer(raw);
}

export interface LegacyExamMax {
  readonly n1: number;
  readonly n2: number;
  readonly n3: number;
  readonly maxI: Rational;
  readonly maxII: Rational;
  readonly pointIII: Rational;
  readonly maxIII: Rational;
  readonly maxTotal: Rational;
}

export function computeExamMaxFromQuestions(questions: readonly Question[]): LegacyExamMax {
  let n1 = 0;
  let n2 = 0;
  let n3 = 0;
  if (Array.isArray(questions)) {
    for (const q of questions) {
      if (q.kind === 'I') n1++;
      else if (q.kind === 'II') n2++;
      else if (q.kind === 'III') n3++;
    }
  }
  if (n1 === 0 && n2 === 0 && n3 === 0) {
    return {
      n1: 0,
      n2: 0,
      n3: 0,
      maxI: ZERO,
      maxII: ZERO,
      pointIII: ZERO,
      maxIII: ZERO,
      maxTotal: ZERO,
    };
  }
  const domainMax = computeExamMax({ n1, n2, n3 });
  return {
    n1,
    n2,
    n3,
    maxI: domainMax.maxI,
    maxII: domainMax.maxII,
    pointIII: domainMax.pointIII,
    maxIII: domainMax.maxIII,
    maxTotal: domainMax.maxTotal,
  };
}

// ---------------------------------------------------------------------------
// 3. Bidirectional Response Conversion
// ---------------------------------------------------------------------------

export function convertLegacyResponsesToDomain(
  exam: ExamVersion,
  legacyResponses: Record<string, unknown>,
  attemptId = 'legacy-attempt'
): AttemptResponses {
  const responses: Response[] = [];

  for (const q of exam.questions) {
    const rawVal = Object.hasOwn(legacyResponses, q.questionVersionId)
      ? legacyResponses[q.questionVersionId]
      : undefined;

    if (q.kind === 'I') {
      const selectedOptionId = typeof rawVal === 'string' && rawVal.length > 0 ? rawVal : null;
      responses.push({
        kind: 'I',
        questionVersionId: q.questionVersionId,
        selectedOptionId,
      } as ResponseI);
    } else if (q.kind === 'II') {
      const statementAnswers: { statementId: Id; value: boolean | null }[] = [];
      const stObj = rawVal && typeof rawVal === 'object' ? (rawVal as Record<string, unknown>) : {};
      for (const st of q.statements) {
        let val: boolean | null = null;
        if (Object.hasOwn(stObj, st.statementId)) {
          const v = stObj[st.statementId];
          if (typeof v === 'boolean') {
            val = v;
          }
        }
        statementAnswers.push({
          statementId: st.statementId,
          value: val,
        });
      }
      responses.push({
        kind: 'II',
        questionVersionId: q.questionVersionId,
        answers: statementAnswers,
      } as ResponseII);
    } else if (q.kind === 'III') {
      const raw = typeof rawVal === 'string' ? rawVal : null;
      responses.push({
        kind: 'III',
        questionVersionId: q.questionVersionId,
        raw,
      } as ResponseIII);
    }
  }

  return {
    attemptId,
    examVersionId: exam.examVersionId,
    responses,
  };
}

export function convertDomainResponsesToLegacy(
  responses: readonly Response[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const r of responses) {
    if (r.kind === 'I') {
      const rI = r as unknown as { selectedOptionId?: string | null; optionId?: string | null };
      result[r.questionVersionId] = rI.selectedOptionId ?? rI.optionId ?? null;
    } else if (r.kind === 'II') {
      const rII = r as unknown as {
        answers?: readonly { statementId: string; value?: boolean | null; answer?: boolean | null }[];
        statements?: readonly { statementId: string; answer?: boolean | null; value?: boolean | null }[];
      };
      const stObj: Record<string, boolean | null> = {};
      const items = rII.answers ?? rII.statements ?? [];
      for (const item of items) {
        stObj[item.statementId] =
          item.value !== undefined
            ? item.value
            : item.answer !== undefined
              ? item.answer
              : null;
      }
      result[r.questionVersionId] = stObj;
    } else if (r.kind === 'III') {
      const rIII = r as unknown as { raw?: string | null };
      result[r.questionVersionId] = rIII.raw ?? null;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 4. Domain-Backed Legacy Attempt Scorer (NO SECOND HANDWRITTEN SCORER)
// ---------------------------------------------------------------------------

export interface LegacyStatementDetail {
  readonly statementId: string;
  readonly label?: string;
  readonly text?: string;
  readonly userVal: string;
  readonly correctVal: string;
  readonly isMatch: boolean;
  readonly state: 'correct' | 'wrong' | 'unanswered';
}

export interface LegacyQuestionResult {
  readonly questionVersionId: string;
  readonly kind: 'I' | 'II' | 'III';
  readonly title?: string;
  readonly content?: string;
  readonly status: QuestionStatus;
  readonly points: number;
  readonly maxPoints: number;
  readonly pointsFraction: string;
  readonly maxPointsFraction: string;
  readonly options?: readonly { optionId: string; label?: string; text?: string }[];
  readonly userAnswer?: string;
  readonly correctAnswer?: string;
  readonly correctCount?: number;
  readonly stDetails?: readonly LegacyStatementDetail[];
  readonly inputIssues?: readonly ShortAnswerIssue[];
  readonly explanation?: string;
}

export interface LegacyScoredResult extends ScoreResult {
  readonly scoreI: number;
  readonly maxI: number;
  readonly scoreII: number;
  readonly maxII: number;
  readonly scoreIII: number;
  readonly maxIII: number;
  readonly totalScore: number;
  readonly maxTotalScore: number;

  readonly scoreIFraction: string;
  readonly maxIFraction: string;
  readonly scoreIIFraction: string;
  readonly maxIIFraction: string;
  readonly scoreIIIFraction: string;
  readonly maxIIIFraction: string;
  readonly totalFraction: string;
  readonly maxTotalFraction: string;
  readonly pointIIIFraction: string;

  readonly n1: number;
  readonly n2: number;
  readonly n3: number;

  readonly questionResults: readonly LegacyQuestionResult[];
}

export function scoreLegacyAttempt(
  examInput: unknown,
  responsesInput: unknown
): LegacyScoredResult {
  // 1. Validate exam version
  const examValidation = validateExamVersion(examInput);
  if (!examValidation.ok) {
    throw new Error('Exam validation failed: ' + examValidation.issues.map((i) => i.message).join('; '));
  }
  const exam = examValidation.value;

  // 2. Prepare domain AttemptResponses
  let domainAttempt: AttemptResponses;
  if (
    responsesInput &&
    typeof responsesInput === 'object' &&
    'responses' in responsesInput &&
    Array.isArray((responsesInput as { responses: unknown }).responses)
  ) {
    domainAttempt = responsesInput as AttemptResponses;
  } else if (responsesInput && typeof responsesInput === 'object') {
    const rawRecord = responsesInput as Record<string, unknown>;
    domainAttempt = convertLegacyResponsesToDomain(exam, rawRecord);
  } else {
    domainAttempt = {
      attemptId: 'legacy-attempt',
      examVersionId: exam.examVersionId,
      responses: [],
    };
  }

  // 3. Delegate to domain scoreAttempt (the single source of truth)
  const scoreRes = scoreAttempt(exam, domainAttempt);

  // 4. Construct legacy projection from the domain ScoreResult
  const legacyResponses = convertDomainResponsesToLegacy(domainAttempt.responses);

  let n1 = 0;
  let n2 = 0;
  let n3 = 0;
  for (const q of exam.questions) {
    if (q.kind === 'I') n1++;
    else if (q.kind === 'II') n2++;
    else if (q.kind === 'III') n3++;
  }
  const examMax = computeExamMax({ n1, n2, n3 });

  const questionResults: LegacyQuestionResult[] = [];
  for (let idx = 0; idx < exam.questions.length; idx++) {
    const q = exam.questions[idx]!;
    const qRes = scoreRes.questions[idx]!;

    if (q.kind === 'I') {
      const selected = (legacyResponses[q.questionVersionId] as string | null) || null;
      const opts = (q.options || []) as readonly { optionId: string; label?: string; text?: string }[];
      const userOpt = opts.find((o) => o.optionId === selected);
      const corrOpt = opts.find((o) => o.optionId === q.correctOptionId);

      questionResults.push({
        questionVersionId: q.questionVersionId,
        kind: 'I',
        title: (q as { title?: string }).title,
        content: (q as { content?: string }).content,
        status: qRes.status,
        points: ratToNumber(qRes.points),
        maxPoints: ratToNumber(qRes.maxPoints),
        pointsFraction: toFractionString(qRes.points),
        maxPointsFraction: toFractionString(qRes.maxPoints),
        options: opts.map((o) => ({ optionId: o.optionId, label: o.label || '', text: o.text || '' })),
        userAnswer: selected ? userOpt?.label || selected : 'Chưa chọn',
        correctAnswer: corrOpt?.label || q.correctOptionId,
        explanation: (q as { explanation?: string }).explanation,
      });
    } else if (q.kind === 'II') {
      const userSts = (legacyResponses[q.questionVersionId] as Record<string, boolean | null>) || {};
      const stDetails: LegacyStatementDetail[] = [];

      for (const st of q.statements) {
        const userVal = Object.hasOwn(userSts, st.statementId) ? userSts[st.statementId] : undefined;
        const isAnswered = typeof userVal === 'boolean';
        let state: 'correct' | 'wrong' | 'unanswered' = 'unanswered';
        let isMatch = false;

        if (isAnswered) {
          if (userVal === st.answer) {
            isMatch = true;
            state = 'correct';
          } else {
            state = 'wrong';
          }
        }

        stDetails.push({
          statementId: st.statementId,
          label: (st as { label?: string }).label,
          text: (st as { text?: string }).text || '',
          userVal: !isAnswered ? 'Chưa chọn' : userVal ? 'Đúng' : 'Sai',
          correctVal: st.answer ? 'Đúng' : 'Sai',
          isMatch,
          state,
        });
      }

      questionResults.push({
        questionVersionId: q.questionVersionId,
        kind: 'II',
        title: (q as { title?: string }).title,
        content: (q as { content?: string }).content,
        status: qRes.status,
        points: ratToNumber(qRes.points),
        maxPoints: ratToNumber(qRes.maxPoints),
        pointsFraction: toFractionString(qRes.points),
        maxPointsFraction: toFractionString(qRes.maxPoints),
        correctCount: qRes.correctCount,
        stDetails: Object.freeze(stDetails),
        explanation: ((q.statements || []) as readonly { label?: string; explanation?: string }[])
          .map((s) => `**${s.label || ''})** ${s.explanation || ''}`)
          .join('\n\n'),
      });
    } else if (q.kind === 'III') {
      const raw = (legacyResponses[q.questionVersionId] as string | null) || null;
      questionResults.push({
        questionVersionId: q.questionVersionId,
        kind: 'III',
        title: (q as { title?: string }).title,
        content: (q as { content?: string }).content,
        status: qRes.status,
        points: ratToNumber(qRes.points),
        maxPoints: ratToNumber(qRes.maxPoints),
        pointsFraction: toFractionString(qRes.points),
        maxPointsFraction: toFractionString(qRes.maxPoints),
        inputIssues: qRes.inputIssues,
        userAnswer: raw !== null && raw !== '' ? raw : 'Chưa điền',
        correctAnswer: q.answerKey,
        explanation: (q as { explanation?: string }).explanation,
      });
    }
  }

  return {
    ...scoreRes,
    scoreI: ratToNumber(scoreRes.sections.I.score),
    maxI: ratToNumber(scoreRes.sections.I.max),
    scoreII: ratToNumber(scoreRes.sections.II.score),
    maxII: ratToNumber(scoreRes.sections.II.max),
    scoreIII: ratToNumber(scoreRes.sections.III.score),
    maxIII: ratToNumber(scoreRes.sections.III.max),
    totalScore: ratToNumber(scoreRes.total),
    maxTotalScore: ratToNumber(scoreRes.maxTotal),

    scoreIFraction: toFractionString(scoreRes.sections.I.score),
    maxIFraction: toFractionString(scoreRes.sections.I.max),
    scoreIIFraction: toFractionString(scoreRes.sections.II.score),
    maxIIFraction: toFractionString(scoreRes.sections.II.max),
    scoreIIIFraction: toFractionString(scoreRes.sections.III.score),
    maxIIIFraction: toFractionString(scoreRes.sections.III.max),
    totalFraction: toFractionString(scoreRes.total),
    maxTotalFraction: toFractionString(scoreRes.maxTotal),
    pointIIIFraction: toFractionString(examMax.pointIII),

    n1,
    n2,
    n3,

    questionResults: Object.freeze(questionResults),
  };
}

// ---------------------------------------------------------------------------
// 5. Cutover Gating & Fallback Artifact Generator
// ---------------------------------------------------------------------------

export interface CutoverGateStatus {
  readonly canCutover: boolean;
  readonly preserveRootLegacy: boolean;
  readonly status: 'NEED_DECISION' | 'BLOCKED' | 'READY';
  readonly reason: string;
  readonly openDecisions: readonly string[];
}

export function checkCutoverGates(): CutoverGateStatus {
  return {
    canCutover: false,
    preserveRootLegacy: true,
    status: 'NEED_DECISION',
    reason:
      'D03 (Storage/report: Transactional IndexedDB storage migration and report cutover) remains an open Product Owner decision. Root legacy index.html is preserved to ensure direct file:// demo execution.',
    openDecisions: Object.freeze(['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08']),
  };
}

/**
 * Builds the fallback script that can be embedded into index.html for direct
 * file:// opening without requiring browser ES module CORS permissions.
 */
export function generateFileOpenFallback(): string {
  return `/* Cunata Web File-Open Fallback — Generated from domain engine */
(function(global) {
  'use strict';
  global.__CUNATA_FILE_FALLBACK__ = {
    version: 'wave-3-cutover-fallback',
    protocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown',
    isDirectFile: typeof window !== 'undefined' && window.location.protocol === 'file:',
    ready: true
  };
})(typeof window !== 'undefined' ? window : globalThis);`;
}

// ---------------------------------------------------------------------------
// 6. Compatibility Harness Provider
// ---------------------------------------------------------------------------

export function createLegacyCompatibilityHarness(
  targetContext: Record<string, unknown> = {}
): Record<string, unknown> {
  targetContext.rational = rational;
  targetContext.ratAdd = ratAdd;
  targetContext.ratSub = ratSub;
  targetContext.ratMul = ratMul;
  targetContext.ratDiv = ratDiv;
  targetContext.ratCompare = ratCompare;
  targetContext.ratEquals = ratEquals;
  targetContext.ratToNumber = ratToNumber;
  targetContext.ratToFractionString = ratToFractionString;
  targetContext.parseCanonicalFraction = parseCanonicalFraction;
  targetContext.isValidCanonicalFraction = isValidCanonicalFraction;
  targetContext.formatRationalScore = formatRationalScore;
  targetContext.checkShortAnswer = legacyCheckShortAnswer;
  targetContext.computeExamMaxFromQuestions = computeExamMaxFromQuestions;
  targetContext.validateExamVersion = validateExamVersion;
  targetContext.validateAttemptResponses = validateAttemptResponses;
  targetContext.createPresentationOrder = createPresentationOrder;
  targetContext.validatePresentationOrder = validatePresentationOrder;
  targetContext.scoreAttempt = scoreAttempt;
  targetContext.scoreLegacyAttempt = scoreLegacyAttempt;
  targetContext.scoreResultToDTO = scoreResultToDTO;
  targetContext.scoreResultFromDTO = scoreResultFromDTO;
  targetContext.ENGINE_VERSION = ENGINE_VERSION;
  targetContext.checkCutoverGates = checkCutoverGates;
  targetContext.convertLegacyResponsesToDomain = convertLegacyResponsesToDomain;
  targetContext.convertDomainResponsesToLegacy = convertDomainResponsesToLegacy;
  return targetContext;
}
