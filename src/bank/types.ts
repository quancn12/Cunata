import type {
  ChoiceOption,
  StatementII,
  QuestionI,
  QuestionII,
  QuestionIII,
  ExamVersion,
  PresentationOrder,
  AttemptResponses,
} from '../domain/index.ts';

export type Section = 'I' | 'II' | 'III';
export type ReleasePolicy = 'immediate' | 'after_deadline';

export interface Taxonomy {
  readonly subject: string;
  readonly grade: 10 | 11 | 12;
  readonly topic: string;
  readonly lesson: string;
  readonly difficulty: 'Nhận biết' | 'Thông hiểu' | 'Vận dụng';
}

export type Block =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'math'; readonly source: string; readonly format: 'latex' | 'omml'; readonly verified: boolean }
  | { readonly type: 'image'; readonly assetId: string; readonly alt: string }
  | { readonly type: 'table'; readonly rows: readonly (readonly Cell[])[] };

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
  | (Omit<QuestionI, 'options'> & QuestionContent & { readonly options: readonly WebOption[] })
  | (Omit<QuestionII, 'statements'> & QuestionContent & { readonly statements: readonly WebStatement[] })
  | (QuestionIII & QuestionContent);

export interface ExamSettings {
  readonly durationMinutes: number;
  readonly maxAttempts: number | null;
  readonly releasePolicy: ReleasePolicy;
  readonly shuffleQuestions: boolean;
  readonly shuffleOptions: boolean;
}

export interface WebExam extends Omit<ExamVersion, 'questions'> {
  readonly schemaVersion: 'web-exam-v1';
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
  readonly schemaVersion: 'web-attempt-v1';
  readonly revision: number;
  readonly candidateName: string;
  readonly examSnapshot: WebExam;
  readonly presentationOrder: PresentationOrder;
  readonly responses: AttemptResponses;
  readonly startedAt: number;
  readonly deadline: number;
  readonly phase: 'draft' | 'final';
  readonly submittedAt: number | null;
  readonly scoreDTO: unknown | null;
}

export type SaveState = 'local_saved' | 'queued' | 'sending' | 'server_confirmed' | 'failed';

export interface Receipt extends AttemptKey {
  readonly submissionId: string;
  readonly payloadHash: string;
  readonly receivedAt: string;
  readonly status: 'recorded' | 'already_recorded';
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

export interface StoragePort {
  load(key: AttemptKey): Promise<Result<AttemptRecord | null>>;
  create(record: AttemptRecord): Promise<Result<AttemptRecord>>;
  saveDraft(record: AttemptRecord, expectedRevision: number): Promise<Result<AttemptRecord>>;
  finalize(record: AttemptRecord, expectedRevision: number): Promise<Result<AttemptRecord>>;
  listAttempts(examId: string, examVersionId: string): Promise<Result<readonly AttemptRecord[]>>;
  getObject(store: 'bank' | 'exams' | 'imports', id: string): Promise<Result<unknown | null>>;
  putObject(store: 'bank' | 'exams' | 'imports', id: string, value: unknown, expectedRevision: number | null): Promise<Result<number>>;
  deleteObject(store: 'bank' | 'exams' | 'imports', id: string, expectedRevision: number): Promise<Result<void>>;
  getOutbox(key: AttemptKey): Promise<Result<OutboxRecord | null>>;
  updateOutbox(value: OutboxRecord, expectedGeneration: number | null): Promise<Result<OutboxRecord>>;
  exportBackup(): Promise<Result<Blob>>;
  importBackup(input: unknown): Promise<Result<void>>;
  clearAll(confirmed: boolean): Promise<Result<void>>;
}

export interface ExamDraft {
  readonly draftId: string;
  readonly revision: number;
  readonly exam: WebExam;
}

export interface BankEntry {
  readonly questionId: string;
  readonly questionVersionId: string;
  readonly revision: number;
  readonly taxonomy: Taxonomy;
  readonly question: WebQuestion;
}

export type BankFilter = Partial<Taxonomy> & {
  text?: string;
  kind?: Section;
};
