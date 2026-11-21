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
  ValidationIssue,
  Validated,
  PresentationOrder,
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

export interface WebOption extends ChoiceOption {
  readonly label?: string;
  readonly text: string;
}

export interface WebStatement extends StatementII {
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
  | (Omit<QuestionI, "options"> & QuestionContent & { readonly options: readonly WebOption[] })
  | (Omit<QuestionII, "statements"> & QuestionContent & { readonly statements: readonly WebStatement[] })
  | (QuestionIII & QuestionContent);

export type WebQuestionI = Extract<WebQuestion, { kind: "I" }>;
export type WebQuestionII = Extract<WebQuestion, { kind: "II" }>;
export type WebQuestionIII = Extract<WebQuestion, { kind: "III" }>;

export interface ExamSettings {
  readonly durationMinutes: number;
  readonly maxAttempts: number | null;
  readonly releasePolicy: ReleasePolicy;
  readonly shuffleQuestions: boolean;
  readonly shuffleOptions: boolean;
}

export interface WebExam extends Omit<ExamVersion, "questions"> {
  readonly schemaVersion: "web-exam-v1";
  readonly title: string;
  readonly subject: string;
  readonly grade: 10 | 11 | 12;
  readonly settings: ExamSettings;
  readonly questions: readonly WebQuestion[];
  readonly assets: readonly Asset[];
}

export interface AttemptKey {
  readonly examId: string;
  readonly examVersionId: string;
  readonly attemptId: string;
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
  readonly class_code?: string;
  readonly assignment_id?: string;
  readonly classCode?: string;
  readonly assignmentId?: string;
  readonly student_id?: string;
  readonly studentId?: string;
  readonly openAt?: string;
  readonly dueAt?: string;
  readonly open_at?: string;
  readonly due_at?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type SaveState = "local_saved" | "queued" | "sending" | "server_confirmed" | "failed";

export interface Receipt extends AttemptKey {
  readonly submissionId: string;
  readonly payloadHash: string;
  readonly receivedAt: string;
  readonly status: "recorded" | "already_recorded";
}

export interface OutboxRecord extends AttemptKey {
  readonly state: SaveState;
  readonly finalRevision: number;
  readonly payloadHash: string;
  readonly endpointId: string | null;
  readonly retryCount: number;
  readonly nextRetryAt: number | null;
  readonly generation: number;
  readonly receipt: Receipt | null;
  readonly lastError: string | null;
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

export interface ImportJob {
  readonly jobId: string;
  readonly sourceId: string;
  readonly format: "docx" | "pdf";
  readonly state: "reading" | "preview" | "confirmed" | "failed";
  readonly blocks: readonly Block[];
  readonly drafts: readonly ImportDraft[];
  readonly flags: readonly string[];
}

export interface ImportDraft {
  readonly draftId: string;
  readonly question: Partial<WebQuestion>;
  readonly provenance: Provenance;
  readonly confirmed: boolean;
}

export type WebEvent =
  | { readonly type: "attempt_changed"; readonly record: AttemptRecord }
  | { readonly type: "attempt_finalized"; readonly record: AttemptRecord }
  | { readonly type: "sync_changed"; readonly key: AttemptKey; readonly outbox: OutboxRecord }
  | { readonly type: "storage_conflict"; readonly key: AttemptKey; readonly revision: number }
  | { readonly type: "error"; readonly error: WebError };
