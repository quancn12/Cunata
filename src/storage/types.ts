import type {
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
  Result,
  WebError,
  SaveState,
  Receipt,
  WebExam,
} from '../schema/types.ts';

export type {
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
  Result,
  WebError,
  SaveState,
  Receipt,
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
  exportBackup(): Promise<Result<Blob>>;
  importBackup(input: unknown): Promise<Result<void>>;
  clearAll(confirmed: boolean): Promise<Result<void>>;
}

export type StoreName = 'attempts' | 'outbox' | 'bank' | 'exams' | 'imports' | 'meta';
export type TransactionMode = 'readonly' | 'readwrite';

export interface StoredObjectEnvelope {
  readonly id: string;
  readonly revision: number;
  readonly value: unknown;
  readonly updatedAt: number;
}

export interface TransactionContext {
  get(store: StoreName, key: string): Promise<unknown | null>;
  put(store: StoreName, key: string, value: unknown): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  getAll(store: StoreName): Promise<readonly unknown[]>;
  abort(): Promise<void>;
}

export interface StorageTransactionAdapter {
  runTransaction<T>(
    stores: readonly StoreName[],
    mode: TransactionMode,
    operation: (tx: TransactionContext) => Promise<T>
  ): Promise<T>;
  isAvailable(): Promise<boolean>;
  clearAll(): Promise<void>;
}

export interface StorageBackupPayload {
  readonly schemaVersion: 'cunata-backup-v1';
  readonly exportedAt: string;
  readonly attempts: readonly AttemptRecord[];
  readonly outbox: readonly OutboxRecord[];
  readonly bank: readonly StoredObjectEnvelope[];
  readonly exams: readonly StoredObjectEnvelope[];
  readonly imports: readonly StoredObjectEnvelope[];
}
