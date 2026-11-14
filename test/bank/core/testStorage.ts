import type {
  StoragePort,
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
  Result,
} from '../../../src/bank/types.ts';

function clone<T>(val: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val)) as T;
}

export class InMemoryStoragePort implements StoragePort {
  private bankStore = new Map<string, { revision: number; value: unknown }>();
  private examsStore = new Map<string, { revision: number; value: unknown }>();
  private importsStore = new Map<string, { revision: number; value: unknown }>();
  private attemptsStore = new Map<string, { revision: number; record: AttemptRecord }>();
  private outboxStore = new Map<string, OutboxRecord>();

  private getStore(store: 'bank' | 'exams' | 'imports') {
    if (store === 'bank') return this.bankStore;
    if (store === 'exams') return this.examsStore;
    return this.importsStore;
  }

  private attemptKeyToString(key: AttemptKey): string {
    return `${key.examId}:${key.examVersionId}:${key.attemptId}`;
  }

  async load(key: AttemptKey): Promise<Result<AttemptRecord | null>> {
    const k = this.attemptKeyToString(key);
    const entry = this.attemptsStore.get(k);
    if (!entry) return { ok: true, value: null };
    return { ok: true, value: clone(entry.record) };
  }

  async create(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    const k = this.attemptKeyToString(record);
    if (this.attemptsStore.has(k)) {
      return {
        ok: false,
        error: { code: 'STORAGE_CONFLICT', path: k, message: 'Attempt already exists', recoverable: false },
      };
    }
    const cloned = clone(record);
    this.attemptsStore.set(k, { revision: cloned.revision, record: cloned });
    return { ok: true, value: clone(cloned) };
  }

  async saveDraft(record: AttemptRecord, expectedRevision: number): Promise<Result<AttemptRecord>> {
    const k = this.attemptKeyToString(record);
    const current = this.attemptsStore.get(k);
    if (!current || current.revision !== expectedRevision) {
      return {
        ok: false,
        error: { code: 'STORAGE_CONFLICT', path: k, message: 'Revision conflict on saveDraft', recoverable: true },
      };
    }
    const nextRevision = current.revision + 1;
    const updated: AttemptRecord = { ...clone(record), revision: nextRevision };
    this.attemptsStore.set(k, { revision: nextRevision, record: updated });
    return { ok: true, value: clone(updated) };
  }

  async finalize(record: AttemptRecord, expectedRevision: number): Promise<Result<AttemptRecord>> {
    const k = this.attemptKeyToString(record);
    const current = this.attemptsStore.get(k);
    if (!current || current.revision !== expectedRevision) {
      return {
        ok: false,
        error: { code: 'STORAGE_CONFLICT', path: k, message: 'Revision conflict on finalize', recoverable: true },
      };
    }
    const nextRevision = current.revision + 1;
    const finalized: AttemptRecord = { ...clone(record), revision: nextRevision, phase: 'final' };
    this.attemptsStore.set(k, { revision: nextRevision, record: finalized });
    return { ok: true, value: clone(finalized) };
  }

  async listAttempts(examId: string, examVersionId: string): Promise<Result<readonly AttemptRecord[]>> {
    const list: AttemptRecord[] = [];
    for (const entry of this.attemptsStore.values()) {
      if (entry.record.examId === examId && entry.record.examVersionId === examVersionId) {
        list.push(clone(entry.record));
      }
    }
    return { ok: true, value: list };
  }

  async getObject(store: 'bank' | 'exams' | 'imports', id: string): Promise<Result<unknown | null>> {
    const s = this.getStore(store);
    const entry = s.get(id);
    if (!entry) return { ok: true, value: null };
    return { ok: true, value: clone(entry.value) };
  }

  async putObject(
    store: 'bank' | 'exams' | 'imports',
    id: string,
    value: unknown,
    expectedRevision: number | null,
  ): Promise<Result<number>> {
    const s = this.getStore(store);
    const existing = s.get(id);

    if (expectedRevision === null) {
      if (existing !== undefined) {
        return {
          ok: false,
          error: {
            code: 'STORAGE_CONFLICT',
            path: `${store}/${id}`,
            message: `Bản ghi đã tồn tại với revision ${existing.revision}`,
            recoverable: true,
          },
        };
      }
      const newRev = 1;
      const v = typeof value === 'object' && value !== null ? { ...(value as object), revision: newRev } : value;
      s.set(id, { revision: newRev, value: clone(v) });
      return { ok: true, value: newRev };
    }

    if (!existing || existing.revision !== expectedRevision) {
      const actual = existing ? existing.revision : 'null';
      return {
        ok: false,
        error: {
          code: 'STORAGE_CONFLICT',
          path: `${store}/${id}`,
          message: `Xung đột revision: kỳ vọng ${expectedRevision}, thực tế ${actual}`,
          recoverable: true,
        },
      };
    }

    const nextRev = existing.revision + 1;
    const v = typeof value === 'object' && value !== null ? { ...(value as object), revision: nextRev } : value;
    s.set(id, { revision: nextRev, value: clone(v) });
    return { ok: true, value: nextRev };
  }

  async deleteObject(store: 'bank' | 'exams' | 'imports', id: string, expectedRevision: number): Promise<Result<void>> {
    const s = this.getStore(store);
    const existing = s.get(id);
    if (!existing || existing.revision !== expectedRevision) {
      const actual = existing ? existing.revision : 'null';
      return {
        ok: false,
        error: {
          code: 'STORAGE_CONFLICT',
          path: `${store}/${id}`,
          message: `Xung đột revision khi xóa: kỳ vọng ${expectedRevision}, thực tế ${actual}`,
          recoverable: true,
        },
      };
    }
    s.delete(id);
    return { ok: true, value: undefined };
  }

  async getOutbox(key: AttemptKey): Promise<Result<OutboxRecord | null>> {
    const k = this.attemptKeyToString(key);
    const entry = this.outboxStore.get(k);
    if (!entry) return { ok: true, value: null };
    return { ok: true, value: clone(entry) };
  }

  async updateOutbox(value: OutboxRecord, expectedGeneration: number | null): Promise<Result<OutboxRecord>> {
    const k = this.attemptKeyToString(value);
    const existing = this.outboxStore.get(k);
    if (expectedGeneration !== null) {
      if (!existing || existing.generation !== expectedGeneration) {
        return {
          ok: false,
          error: { code: 'STORAGE_CONFLICT', path: k, message: 'Generation conflict', recoverable: true },
        };
      }
    }
    const cloned = clone(value);
    this.outboxStore.set(k, cloned);
    return { ok: true, value: clone(cloned) };
  }

  async exportBackup(): Promise<Result<Blob>> {
    const data = {
      bank: Array.from(this.bankStore.entries()),
      exams: Array.from(this.examsStore.entries()),
      imports: Array.from(this.importsStore.entries()),
      attempts: Array.from(this.attemptsStore.entries()),
      outbox: Array.from(this.outboxStore.entries()),
    };
    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: 'application/json' });
    return { ok: true, value: blob };
  }

  async importBackup(input: unknown): Promise<Result<void>> {
    if (!input || typeof input !== 'object') {
      return {
        ok: false,
        error: { code: 'STORAGE_CORRUPT', path: 'backup', message: 'Dữ liệu backup không hợp lệ', recoverable: false },
      };
    }
    return { ok: true, value: undefined };
  }

  async clearAll(confirmed: boolean): Promise<Result<void>> {
    if (!confirmed) {
      return {
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE', path: 'clearAll', message: 'Chưa xác nhận xóa', recoverable: false },
      };
    }
    this.bankStore.clear();
    this.examsStore.clear();
    this.importsStore.clear();
    this.attemptsStore.clear();
    this.outboxStore.clear();
    return { ok: true, value: undefined };
  }
}
