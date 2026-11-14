import type {
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamSettings,
  StoragePort,
  Result,
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
} from "../../../src/teacher/index.ts";

export function createValidOption(id: string, text: string, label?: string): WebOption {
  return {
    optionId: id,
    text,
    ...(label ? { label } : {}),
  };
}

export function createValidQuestionI(
  versionId: string,
  correctId: string = "opt-1",
): WebQuestion {
  return {
    kind: "I",
    questionVersionId: versionId,
    content: "Nội dung câu hỏi phần I",
    options: [
      createValidOption("opt-1", "Lựa chọn 1", "A"),
      createValidOption("opt-2", "Lựa chọn 2", "B"),
      createValidOption("opt-3", "Lựa chọn 3", "C"),
      createValidOption("opt-4", "Lựa chọn 4", "D"),
    ],
    correctOptionId: correctId,
  };
}

export function createValidQuestionII(versionId: string): WebQuestion {
  return {
    kind: "II",
    questionVersionId: versionId,
    content: "Nội dung câu hỏi phần II",
    statements: [
      { statementId: "stmt-1", text: "Ý 1", answer: true },
      { statementId: "stmt-2", text: "Ý 2", answer: false },
      { statementId: "stmt-3", text: "Ý 3", answer: true },
      { statementId: "stmt-4", text: "Ý 4", answer: false },
    ],
  };
}

export function createValidQuestionIII(versionId: string, answerKey: string = "1,5"): WebQuestion {
  return {
    kind: "III",
    questionVersionId: versionId,
    content: "Nội dung câu hỏi phần III",
    answerKey,
  };
}

export function createValidSettings(): ExamSettings {
  return {
    durationMinutes: 50,
    maxAttempts: null,
    releasePolicy: "immediate",
    shuffleQuestions: false,
    shuffleOptions: false,
  };
}

export function createSampleExam(
  examId: string = "exam-test-1",
  versionId: string = "v1.0.0",
  questions: readonly WebQuestion[] = [
    createValidQuestionI("q1"),
    createValidQuestionII("q2"),
    createValidQuestionIII("q3"),
  ],
): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId,
    examVersionId: versionId,
    title: "Đề thi thử GDPT 2018",
    subject: "Toán",
    grade: 12,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    settings: createValidSettings(),
    questions,
    assets: [],
  };
}

export interface MockStorageOptions {
  existingObjects?: Record<string, unknown>;
  putFailure?: boolean;
  getFailure?: boolean;
}

export function createMockStorage(opts: MockStorageOptions = {}): StoragePort & {
  storedObjects: Map<string, unknown>;
  putLog: Array<{ store: string; id: string; value: unknown }>;
} {
  const storedObjects = new Map<string, unknown>();
  if (opts.existingObjects) {
    for (const [k, v] of Object.entries(opts.existingObjects)) {
      storedObjects.set(k, v);
    }
  }
  const putLog: Array<{ store: string; id: string; value: unknown }> = [];

  return {
    storedObjects,
    putLog,
    async load(_key: AttemptKey): Promise<Result<AttemptRecord | null>> {
      return { ok: true, value: null };
    },
    async create(record: AttemptRecord): Promise<Result<AttemptRecord>> {
      return { ok: true, value: record };
    },
    async saveDraft(record: AttemptRecord, _expectedRev: number): Promise<Result<AttemptRecord>> {
      return { ok: true, value: record };
    },
    async finalize(record: AttemptRecord, _expectedRev: number): Promise<Result<AttemptRecord>> {
      return { ok: true, value: record };
    },
    async listAttempts(_examId: string, _versionId: string): Promise<Result<readonly AttemptRecord[]>> {
      return { ok: true, value: [] };
    },
    async getObject(store: "bank" | "exams" | "imports", id: string): Promise<Result<unknown | null>> {
      if (opts.getFailure) {
        return {
          ok: false,
          error: {
            code: "STORAGE_FAILED",
            path: `getObject:${store}`,
            message: "Simulated getObject failure",
            recoverable: true,
          },
        };
      }
      const val = storedObjects.get(`${store}:${id}`) ?? storedObjects.get(id) ?? null;
      return { ok: true, value: val };
    },
    async putObject(
      store: "bank" | "exams" | "imports",
      id: string,
      value: unknown,
      _expectedRev: number | null,
    ): Promise<Result<number>> {
      if (opts.putFailure) {
        return {
          ok: false,
          error: {
            code: "STORAGE_FAILED",
            path: `putObject:${store}`,
            message: "Simulated putObject transaction failure",
            recoverable: true,
          },
        };
      }
      storedObjects.set(`${store}:${id}`, value);
      storedObjects.set(id, value);
      putLog.push({ store, id, value });
      return { ok: true, value: 1 };
    },
    async deleteObject(_store: "bank" | "exams" | "imports", _id: string, _expectedRev: number): Promise<Result<void>> {
      return { ok: true, value: undefined };
    },
    async getOutbox(_key: AttemptKey): Promise<Result<OutboxRecord | null>> {
      return { ok: true, value: null };
    },
    async updateOutbox(value: OutboxRecord, _expectedGen: number | null): Promise<Result<OutboxRecord>> {
      return { ok: true, value };
    },
    async exportBackup(): Promise<Result<Blob>> {
      return { ok: true, value: new Blob([]) };
    },
    async importBackup(_input: unknown): Promise<Result<void>> {
      return { ok: true, value: undefined };
    },
    async clearAll(_confirmed: boolean): Promise<Result<void>> {
      return { ok: true, value: undefined };
    },
  };
}
