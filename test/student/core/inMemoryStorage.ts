import type {
  StoragePort,
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
  Result,
} from "../../../src/student/types.ts";

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export class InMemoryStoragePort implements StoragePort {
  readonly attempts = new Map<string, AttemptRecord>();
  readonly outbox = new Map<string, OutboxRecord>();
  saveDraftCalls = 0;
  finalizeCalls = 0;
  createCalls = 0;
  loadCalls = 0;

  saveDraftHook?: (record: AttemptRecord, expectedRevision: number) => Promise<Result<AttemptRecord> | null>;
  finalizeHook?: (record: AttemptRecord, expectedRevision: number) => Promise<Result<AttemptRecord> | null>;

  private keyToString(key: AttemptKey): string {
    return `${key.examId}:${key.examVersionId}:${key.attemptId}`;
  }

  async load(key: AttemptKey): Promise<Result<AttemptRecord | null>> {
    this.loadCalls++;
    const k = this.keyToString(key);
    const rec = this.attempts.get(k);
    if (!rec) {
      return { ok: true, value: null };
    }
    return { ok: true, value: clone(rec) };
  }

  async create(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    this.createCalls++;
    const k = this.keyToString(record);
    if (this.attempts.has(k)) {
      return {
        ok: false,
        error: { code: "STORAGE_CONFLICT", path: k, message: "Attempt already exists", recoverable: false },
      };
    }
    const cloned = clone(record);
    this.attempts.set(k, cloned);
    return { ok: true, value: clone(cloned) };
  }

  async saveDraft(record: AttemptRecord, expectedRevision: number): Promise<Result<AttemptRecord>> {
    this.saveDraftCalls++;
    if (this.saveDraftHook) {
      const hooked = await this.saveDraftHook(record, expectedRevision);
      if (hooked) return hooked;
    }
    const k = this.keyToString(record);
    const current = this.attempts.get(k);
    if (!current || current.revision !== expectedRevision) {
      return {
        ok: false,
        error: { code: "STORAGE_CONFLICT", path: k, message: "Revision conflict on saveDraft", recoverable: true },
      };
    }
    const updated: AttemptRecord = { ...clone(record), revision: current.revision + 1 };
    this.attempts.set(k, updated);
    return { ok: true, value: clone(updated) };
  }

  async finalize(record: AttemptRecord, expectedRevision: number): Promise<Result<AttemptRecord>> {
    this.finalizeCalls++;
    if (this.finalizeHook) {
      const hooked = await this.finalizeHook(record, expectedRevision);
      if (hooked) return hooked;
    }
    const k = this.keyToString(record);
    const current = this.attempts.get(k);
    if (!current || current.revision !== expectedRevision) {
      return {
        ok: false,
        error: { code: "STORAGE_CONFLICT", path: k, message: "Revision conflict on finalize", recoverable: true },
      };
    }
    const finalized: AttemptRecord = { ...clone(record), revision: current.revision + 1, phase: "final" };
    this.attempts.set(k, finalized);
    return { ok: true, value: clone(finalized) };
  }

  async listAttempts(examId: string, examVersionId: string): Promise<Result<readonly AttemptRecord[]>> {
    const res: AttemptRecord[] = [];
    for (const rec of this.attempts.values()) {
      if (rec.examId === examId && rec.examVersionId === examVersionId) {
        res.push(clone(rec));
      }
    }
    return { ok: true, value: res };
  }

  async getObject(_store: "bank" | "exams" | "imports", _id: string): Promise<Result<unknown | null>> {
    return { ok: true, value: null };
  }
  async putObject(_store: "bank" | "exams" | "imports", _id: string, _value: unknown, _expectedRevision: number | null): Promise<Result<number>> {
    return { ok: true, value: 1 };
  }
  async deleteObject(_store: "bank" | "exams" | "imports", _id: string, _expectedRevision: number): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }
  async getOutbox(_key: AttemptKey): Promise<Result<OutboxRecord | null>> {
    return { ok: true, value: null };
  }
  async updateOutbox(value: OutboxRecord, _expectedGeneration: number | null): Promise<Result<OutboxRecord>> {
    return { ok: true, value };
  }
  async exportBackup(): Promise<Result<Blob>> {
    return { ok: false, error: { code: "NOT_SUPPORTED", path: "backup", message: "Not supported in mock", recoverable: false } };
  }
  async importBackup(_input: unknown): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }
  async clearAll(_confirmed: boolean): Promise<Result<void>> {
    this.attempts.clear();
    return { ok: true, value: undefined };
  }
}
