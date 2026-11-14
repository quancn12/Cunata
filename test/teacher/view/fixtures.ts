import type {
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamSettings,
} from "../../../src/schema/types.ts";
import type { StoragePort, Result, AttemptKey, AttemptRecord, OutboxRecord } from "../../../src/storage/types.ts";
import { createDraft, type ExamDraft } from "../../../src/teacher/index.ts";

export function createTestOption(id: string, text: string, label?: string): WebOption {
  return {
    optionId: id,
    text,
    ...(label ? { label } : {}),
  };
}

export function createTestQuestionI(versionId: string, correctId: string = "opt-1"): WebQuestion {
  return {
    kind: "I",
    questionVersionId: versionId,
    title: "Câu hỏi trắc nghiệm I",
    content: "Nội dung câu trắc nghiệm 4 lựa chọn",
    topic: "Đại số",
    lesson: "Hàm số",
    difficulty: "Nhận biết",
    options: [
      createTestOption("opt-1", "Phương án A", "A"),
      createTestOption("opt-2", "Phương án B", "B"),
      createTestOption("opt-3", "Phương án C", "C"),
      createTestOption("opt-4", "Phương án D", "D"),
    ],
    correctOptionId: correctId,
  };
}

export function createTestQuestionII(versionId: string): WebQuestion {
  return {
    kind: "II",
    questionVersionId: versionId,
    title: "Câu hỏi Đúng/Sai II",
    content: "Nội dung câu Đúng/Sai 4 ý",
    topic: "Hình học",
    lesson: "Vector",
    difficulty: "Thông hiểu",
    statements: [
      { statementId: "stmt-1", text: "Phát biểu a", answer: true, label: "a" },
      { statementId: "stmt-2", text: "Phát biểu b", answer: false, label: "b" },
      { statementId: "stmt-3", text: "Phát biểu c", answer: true, label: "c" },
      { statementId: "stmt-4", text: "Phát biểu d", answer: false, label: "d" },
    ],
  };
}

export function createTestQuestionIII(versionId: string, answerKey: string = "1,5"): WebQuestion {
  return {
    kind: "III",
    questionVersionId: versionId,
    title: "Câu trả lời ngắn III",
    content: "Nội dung câu trả lời ngắn",
    topic: "Xác suất",
    lesson: "Biến cố",
    difficulty: "Vận dụng",
    answerKey,
  };
}

export function createTestSettings(partial?: Partial<ExamSettings>): ExamSettings {
  return {
    durationMinutes: 50,
    maxAttempts: null,
    releasePolicy: "immediate",
    shuffleQuestions: false,
    shuffleOptions: false,
    ...partial,
  };
}

export function createTestExam(
  examId: string = "exam-test-1",
  versionId: string = "v1.0.0",
  questions: readonly WebQuestion[] = [
    createTestQuestionI("q1"),
    createTestQuestionII("q2"),
    createTestQuestionIII("q3"),
  ],
): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId,
    examVersionId: versionId,
    title: "Đề thi thử Toán GDPT 2018",
    subject: "Toán",
    grade: 12,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    settings: createTestSettings(),
    questions,
    assets: [],
  };
}

export class MockStoragePort implements StoragePort {
  public objects = new Map<string, unknown>();
  public failPut: boolean = false;
  public failGet: boolean = false;

  async getObject(store: "bank" | "exams" | "imports", id: string): Promise<Result<unknown | null>> {
    if (this.failGet) {
      return { ok: false, error: { code: "STORAGE_FAILED", path: "storage", message: "Mock getObject failure", recoverable: true } };
    }
    const val = this.objects.get(`${store}:${id}`) ?? null;
    return { ok: true, value: val };
  }

  async putObject(store: "bank" | "exams" | "imports", id: string, value: unknown): Promise<Result<number>> {
    if (this.failPut) {
      return { ok: false, error: { code: "STORAGE_FAILED", path: "storage", message: "Mock putObject failure", recoverable: true } };
    }
    this.objects.set(`${store}:${id}`, value);
    return { ok: true, value: 1 };
  }

  async deleteObject(store: "bank" | "exams" | "imports", id: string): Promise<Result<void>> {
    this.objects.delete(`${store}:${id}`);
    return { ok: true, value: undefined };
  }

  async load(_key: AttemptKey): Promise<Result<AttemptRecord | null>> {
    return { ok: true, value: null };
  }
  async create(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    return { ok: true, value: record };
  }
  async saveDraft(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    return { ok: true, value: record };
  }
  async finalize(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    return { ok: true, value: record };
  }
  async listAttempts(): Promise<Result<readonly AttemptRecord[]>> {
    return { ok: true, value: [] };
  }
  async getOutbox(): Promise<Result<OutboxRecord | null>> {
    return { ok: true, value: null };
  }
  async updateOutbox(value: OutboxRecord): Promise<Result<OutboxRecord>> {
    return { ok: true, value: recordOutbox(value) };
  }
  async exportBackup(): Promise<Result<Blob>> {
    return { ok: true, value: new Blob([]) };
  }
  async importBackup(): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }
  async clearAll(): Promise<Result<void>> {
    this.objects.clear();
    return { ok: true, value: undefined };
  }
}

function recordOutbox(val: OutboxRecord): OutboxRecord {
  return val;
}
