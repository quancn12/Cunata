import type {
  AttemptKey,
  AttemptRecord,
  SaveState,
  Receipt,
  OutboxRecord,
  WebError,
  Result,
  WebExam,
} from '../schema/types.ts';

export type {
  AttemptKey,
  AttemptRecord,
  SaveState,
  Receipt,
  OutboxRecord,
  WebError,
  Result,
  WebExam,
};

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
  listOutbox?(): Promise<Result<readonly OutboxRecord[]>>;
  exportBackup(): Promise<Result<Blob>>;
  importBackup(input: unknown): Promise<Result<void>>;
  clearAll(confirmed: boolean): Promise<Result<void>>;
}

export interface CollectorPort {
  send(final: AttemptRecord, signal: AbortSignal): Promise<unknown>;
}

export interface DrainDeps {
  readonly storage: StoragePort;
  readonly transport: CollectorPort;
  readonly now: () => number;
  readonly timeoutMs?: number;
}
