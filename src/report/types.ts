/// <reference lib="dom" />

import type {
  Id,
  Response,
  AttemptResponses,
  ScoreResult,
  Rational,
} from "../domain/index.ts";

export type Section = "I" | "II" | "III";
export type ReleasePolicy = "immediate" | "after_deadline";

export interface Taxonomy {
  readonly subject: string;
  readonly grade: 10 | 11 | 12;
  readonly topic: string;
  readonly lesson: string;
  readonly difficulty: "Nhận biết" | "Thông hiểu" | "Vận dụng";
}

export type Block =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "math"; readonly source: string; readonly format: "latex" | "omml"; readonly verified: boolean }
  | { readonly type: "image"; readonly assetId: string; readonly alt: string }
  | { readonly type: "table"; readonly rows: readonly (readonly Cell[])[] };

export interface Cell {
  readonly blocks: readonly Block[];
  readonly rowSpan: number;
  readonly colSpan: number;
}

export interface Provenance {
  readonly sourceId: string;
  readonly location: string;
  readonly confidence: number | null;
  readonly flags: readonly string[];
}

export interface Asset {
  readonly assetId: string;
  readonly mime: string;
  readonly data: string;
  readonly alt: string;
}

export interface WebOption {
  readonly optionId: string;
  readonly label?: string;
  readonly text: string;
}

export interface WebStatement {
  readonly statementId: string;
  readonly answer: boolean;
  readonly label?: string;
  readonly text: string;
  readonly explanation?: string;
}

export interface QuestionContent extends Partial<Taxonomy> {
  readonly questionId?: string;
  readonly title?: string;
  readonly content?: string;
  readonly image?: string;
  readonly explanation?: string;
  readonly blocks?: readonly Block[];
  readonly provenance?: Provenance;
}

export type WebQuestion =
  | ({ readonly kind: "I"; readonly questionVersionId: string; readonly options: readonly WebOption[]; readonly correctOptionId: string } & QuestionContent)
  | ({ readonly kind: "II"; readonly questionVersionId: string; readonly statements: readonly WebStatement[] } & QuestionContent)
  | ({ readonly kind: "III"; readonly questionVersionId: string; readonly answerKey: string } & QuestionContent);

export interface ExamSettings {
  readonly durationMinutes: number;
  readonly maxAttempts: number | null;
  readonly releasePolicy: ReleasePolicy;
  readonly shuffleQuestions: boolean;
  readonly shuffleOptions: boolean;
}

export interface WebExam {
  readonly schemaVersion: "web-exam-v1";
  readonly title: string;
  readonly subject: string;
  readonly grade: 10 | 11 | 12;
  readonly settings: ExamSettings;
  readonly questions: readonly WebQuestion[];
  readonly assets: readonly Asset[];
  readonly examId: string;
  readonly examVersionId: string;
  readonly ruleSetId?: "custom-v1";
  readonly inputPolicyId?: "sa-charset-v1";
}

export interface AttemptKey {
  readonly examId: string;
  readonly examVersionId: string;
  readonly attemptId: string;
}

export interface PresentationOrder {
  readonly seed: string;
  readonly questionOrder: readonly string[];
  readonly optionOrder?: readonly {
    readonly questionVersionId: string;
    readonly optionIds: readonly string[];
  }[];
}

export interface AttemptRecord extends AttemptKey {
  readonly schemaVersion: "web-attempt-v1";
  readonly revision: number;
  readonly candidateName: string;
  readonly examSnapshot: WebExam;
  readonly presentationOrder: PresentationOrder;
  readonly responses: AttemptResponses;
  readonly startedAt: number;
  readonly deadline: number;
  readonly phase: "draft" | "final";
  readonly submittedAt: number | null;
  readonly scoreDTO: unknown | null;
}

export interface WebError {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: WebError };

export interface ReportQuestion {
  readonly questionVersionId: string;
  readonly kind: Section;
  readonly title: string;
  readonly blocks: readonly Block[];
  readonly response: Response | null;
  readonly status: "full" | "partial" | "wrong" | "unanswered" | "invalid";
  readonly points: string;
  readonly maxPoints: string;
}

export interface ReleasedReportQuestion extends ReportQuestion {
  readonly answer: string | readonly { readonly statementId: string; readonly answer: boolean }[];
  readonly explanation: readonly Block[];
}

export interface ReportBase {
  readonly attempt: AttemptKey;
  readonly candidateName: string;
  readonly startedAt: number;
  readonly submittedAt: number;
  readonly scoreDTO: unknown;
  readonly assets: readonly Asset[];
}

export type ReportModel = ReportBase & (
  | { readonly released: false; readonly questions: readonly ReportQuestion[] }
  | { readonly released: true; readonly questions: readonly ReleasedReportQuestion[] }
);

export type DisplayPolicy =
  | "exact"
  | { readonly mode: "decimal"; readonly fractionDigits: number }
  | { readonly mode: "custom"; readonly format: (points: Rational, maxPoints: Rational) => string };

export interface BuildReportOptions {
  readonly displayPolicy?: DisplayPolicy;
}

export interface RenderHtmlOptions {
  readonly displayPolicy?: DisplayPolicy;
  readonly title?: string;
}
