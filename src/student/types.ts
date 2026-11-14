import type {
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
  PresentationOrder,
  ValidationIssue,
  Validated,
} from "../domain/index.ts";

import type {
  Section,
  ReleasePolicy,
  Taxonomy,
  Block,
  Cell,
  Provenance,
  Asset,
  WebOption,
  WebStatement,
  QuestionContent,
  WebQuestion,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
  ExamSettings,
  WebExam,
  AttemptKey,
  AttemptRecord,
  SaveState,
  Receipt,
  OutboxRecord,
  WebError,
  Result,
  WebEvent,
} from "../schema/types.ts";

import type { StoragePort } from "../storage/types.ts";

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
  PresentationOrder,
  ValidationIssue,
  Validated,
  Section,
  ReleasePolicy,
  Taxonomy,
  Block,
  Cell,
  Provenance,
  Asset,
  WebOption,
  WebStatement,
  QuestionContent,
  WebQuestion,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
  ExamSettings,
  WebExam,
  AttemptKey,
  AttemptRecord,
  SaveState,
  Receipt,
  OutboxRecord,
  WebError,
  Result,
  WebEvent,
  StoragePort,
};

export interface StudentControllerDeps {
  readonly storage: StoragePort;
  readonly now: () => number;
  readonly id: () => string;
}

export interface StudentController {
  getSnapshot(): AttemptRecord;
  answer(response: Response): Promise<Result<AttemptRecord>>;
  rename(raw: string): Promise<Result<AttemptRecord>>;
  submit(reason: "manual" | "deadline"): Promise<Result<AttemptRecord>>;
  subscribe(listener: (event: WebEvent) => void): () => void;
  dispose(): void;
}
