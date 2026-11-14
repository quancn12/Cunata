import type {
  Id,
  Response,
  ResponseI,
  ResponseII,
  ResponseIII,
  ValidationIssue,
} from "./model.ts";
import type { Rational } from "./rational.ts";
import { ZERO, ONE, add } from "./rational.ts";
import type { ShortAnswerIssue } from "./shortAnswer.ts";
import { checkShortAnswer } from "./shortAnswer.ts";
import { validateExamVersion, validateAttemptResponses } from "./validate.ts";
import { judgeI, judgeII, judgeIII } from "./judge.ts";
import { POINT_I, PART2_POINTS, computeExamMax } from "./examMax.ts";

export const ENGINE_VERSION = "m1-1.0.0";

export type QuestionStatus = "full" | "partial" | "wrong" | "unanswered" | "invalid";

export interface QuestionResult {
  readonly questionVersionId: Id;
  readonly kind: "I" | "II" | "III";
  readonly status: QuestionStatus;
  readonly points: Rational;
  readonly maxPoints: Rational;
  readonly correctCount?: number;
  readonly inputIssues?: readonly ShortAnswerIssue[];
}

export interface SectionResult {
  readonly questionCount: number;
  readonly score: Rational;
  readonly max: Rational;
}

export interface ScoreResult {
  readonly attemptId: Id;
  readonly examVersionId: Id;
  readonly ruleSetId: "custom-v1";
  readonly inputPolicyId: "sa-charset-v1";
  readonly engineVersion: string;
  readonly sections: {
    readonly I: SectionResult;
    readonly II: SectionResult;
    readonly III: SectionResult;
  };
  readonly total: Rational;
  readonly maxTotal: Rational;
  readonly questions: readonly QuestionResult[];
}

export class ScoringInputError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(issues: readonly ValidationIssue[]) {
    super(`Scoring validation failed with ${issues.length} issue(s)`);
    this.name = "ScoringInputError";
    this.issues = Object.freeze([...issues]);
  }
}

export function scoreAttempt(exam: unknown, attempt: unknown): ScoreResult {
  const examValidation = validateExamVersion(exam);
  if (!examValidation.ok) {
    throw new ScoringInputError(examValidation.issues);
  }
  const examVersion = examValidation.value;

  const attemptValidation = validateAttemptResponses(examVersion, attempt);
  if (!attemptValidation.ok) {
    throw new ScoringInputError(attemptValidation.issues);
  }
  const attemptResponses = attemptValidation.value;

  let n1 = 0;
  let n2 = 0;
  let n3 = 0;
  for (const q of examVersion.questions) {
    if (q.kind === "I") n1++;
    else if (q.kind === "II") n2++;
    else if (q.kind === "III") n3++;
  }

  const examMax = computeExamMax({ n1, n2, n3 });

  const responseMap = new Map<Id, Response>();
  for (const r of attemptResponses.responses) {
    responseMap.set(r.questionVersionId, r);
  }

  const questionResults: QuestionResult[] = [];
  let scoreI = ZERO;
  let scoreII = ZERO;
  let scoreIII = ZERO;

  for (const q of examVersion.questions) {
    const resp = responseMap.get(q.questionVersionId);

    if (q.kind === "I") {
      const r = resp as ResponseI | undefined;
      const j = judgeI(q, r);
      let status: QuestionStatus;
      let points: Rational;

      if (j === "correct") {
        status = "full";
        points = POINT_I;
      } else if (j === "wrong") {
        status = "wrong";
        points = ZERO;
      } else if (j === "unanswered") {
        status = "unanswered";
        points = ZERO;
      } else {
        status = "invalid";
        points = ZERO;
      }

      scoreI = add(scoreI, points);
      questionResults.push(
        Object.freeze({
          questionVersionId: q.questionVersionId,
          kind: "I",
          status,
          points,
          maxPoints: POINT_I,
        }),
      );
    } else if (q.kind === "II") {
      const r = resp as ResponseII | undefined;
      const j = judgeII(q, r);
      const k = j.correctCount;
      const points = PART2_POINTS[k] ?? ZERO;
      let status: QuestionStatus;

      if (k === 4) {
        status = "full";
      } else if (k >= 1 && k <= 3) {
        status = "partial";
      } else {
        const anyAnswered = j.perStatement.some((s) => s.state !== "unanswered");
        status = anyAnswered ? "wrong" : "unanswered";
      }

      scoreII = add(scoreII, points);
      questionResults.push(
        Object.freeze({
          questionVersionId: q.questionVersionId,
          kind: "II",
          status,
          points,
          maxPoints: ONE,
          correctCount: k,
        }),
      );
    } else {
      const r = resp as ResponseIII | undefined;
      let status: QuestionStatus;
      let points: Rational;
      let inputIssues: readonly ShortAnswerIssue[] | undefined = undefined;

      if (r === undefined || r.raw === null || r.raw === "") {
        status = "unanswered";
        points = ZERO;
      } else {
        const issues = checkShortAnswer(r.raw);
        if (issues.length > 0) {
          status = "invalid";
          points = ZERO;
          inputIssues = Object.freeze([...issues]);
        } else {
          const j = judgeIII(q, r);
          if (j === "correct") {
            status = "full";
            points = examMax.pointIII;
          } else {
            status = "wrong";
            points = ZERO;
          }
        }
      }

      scoreIII = add(scoreIII, points);
      const qRes: QuestionResult = {
        questionVersionId: q.questionVersionId,
        kind: "III",
        status,
        points,
        maxPoints: examMax.pointIII,
        ...(inputIssues !== undefined ? { inputIssues } : {}),
      };
      questionResults.push(Object.freeze(qRes));
    }
  }

  const sectionI: SectionResult = Object.freeze({
    questionCount: n1,
    score: scoreI,
    max: examMax.maxI,
  });
  const sectionII: SectionResult = Object.freeze({
    questionCount: n2,
    score: scoreII,
    max: examMax.maxII,
  });
  const sectionIII: SectionResult = Object.freeze({
    questionCount: n3,
    score: scoreIII,
    max: examMax.maxIII,
  });

  const total = add(add(scoreI, scoreII), scoreIII);

  return Object.freeze({
    attemptId: attemptResponses.attemptId,
    examVersionId: examVersion.examVersionId,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    engineVersion: ENGINE_VERSION,
    sections: Object.freeze({
      I: sectionI,
      II: sectionII,
      III: sectionIII,
    }),
    total,
    maxTotal: examMax.maxTotal,
    questions: Object.freeze(questionResults),
  });
}
