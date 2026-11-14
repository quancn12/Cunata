// 3. Models
export type {
  Id,
  ChoiceOption,
  QuestionI,
  StatementII,
  QuestionII,
  QuestionIII,
  Question,
  ExamVersion,
  ResponseI,
  StatementAnswer,
  ResponseII,
  ResponseIII,
  Response,
  AttemptResponses,
  ValidationIssue,
} from "./model.ts";

// 4.1 Rational
export type { Rational } from "./rational.ts";
export {
  rational,
  ZERO,
  ONE,
  add,
  sub,
  mul,
  div,
  sum,
  compare,
  equals,
  toFractionString,
  parseFractionString,
  toDecimalString,
  MAX_FRACTION_STRING_LENGTH,
  MAX_FRACTION_DIGITS,
} from "./rational.ts";

// 4.2 Short Answer
export { SHORT_ANSWER_MAX_LENGTH, checkShortAnswer } from "./shortAnswer.ts";
export type { ShortAnswerIssue } from "./shortAnswer.ts";

// 4.3 Validation
export {
  MAX_QUESTIONS_PER_EXAM,
  validateExamVersion,
  validateAttemptResponses,
} from "./validate.ts";
export type { Validated } from "./validate.ts";

// 4.4 Judge
export { judgeI, judgeII, judgeIII } from "./judge.ts";
export type {
  JudgeI,
  StatementState,
  JudgeIIResult,
  JudgeIII,
} from "./judge.ts";

// 4.5 Shuffle
export {
  createPresentationOrder,
  validatePresentationOrder,
} from "./shuffle.ts";
export type {
  ShuffleSettings,
  PresentationOrder,
} from "./shuffle.ts";

// 4.6 Exam Max
export {
  POINT_I,
  PART2_POINTS,
  computeExamMax,
} from "./examMax.ts";
export type {
  SectionCounts,
  ExamMax,
} from "./examMax.ts";

// 4.7 Score Attempt
export {
  ENGINE_VERSION,
  ScoringInputError,
  scoreAttempt,
} from "./scoreAttempt.ts";
export type {
  QuestionStatus,
  QuestionResult,
  SectionResult,
  ScoreResult,
} from "./scoreAttempt.ts";

// 4.8 Serialize
export {
  scoreResultToDTO,
  scoreResultFromDTO,
} from "./serialize.ts";
