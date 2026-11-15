import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// --- Domain imports through barrel ---
import {
  scoreAttempt,
  toFractionString,
  scoreResultToDTO,
  scoreResultFromDTO,
  rational,
  ZERO,
  ONE,
  equals,
  type ExamVersion,
  type AttemptResponses,
  type ScoreResult,
} from '../../src/domain/index.ts';

// --- Schema imports ---
import type {
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  AttemptRecord,
  AttemptKey,
  Result,
  WebError,
} from '../../src/schema/types.ts';
import { toDomainExam } from '../../src/schema/index.ts';

// --- Teacher & Bank imports ---
import {
  createDraft,
  editDraft,
  publishDraft,
  duplicateQuestion,
  saveQuestionToBank,
  type ExamDraft,
  type StoragePort,
  type BankEntry,
} from '../../src/teacher/index.ts';
import { TeacherController, mount as mountTeacher } from '../../src/teacher/view.ts';
import {
  queryBank,
  saveBankEntry,
  addToDraft,
  validateBankEntry,
} from '../../src/bank/index.ts';
import {
  importBankTransfer,
  exportBankTransfer,
  parseBankTransfer,
  deleteBankEntryConfirmed,
} from '../../src/bank/transfer.ts';
import { mount as mountBank } from '../../src/bank/view.ts';

// --- Collect & Outbox imports ---
import {
  enqueue,
  drainOutbox,
  validateReceipt,
  computePayloadHash,
  type OutboxRecord,
  type Receipt,
  type CollectorPort,
} from '../../src/collect/index.ts';
import {
  neutralizeFormula,
  isFormulaDangerous,
  escapeCsvCell,
  serializeResultsCsv,
  serializeResultsJson,
  buildWebResultPayload,
  CSV_HEADERS,
} from '../../src/collect/export.ts';

// --- Report imports ---
import {
  buildReport,
  renderReportHtml,
  downloadReport,
  inspectDownloadBytes,
  type ReportModel,
} from '../../src/report/index.ts';

// --- UI imports ---
import {
  sanitizeUrl,
  isSafeUrl,
  isSafeSvg,
  renderText,
  renderBlocks,
  createCompositionGuard,
  createStatusAnnouncer,
  isRoutineTimerTick,
  enforceTouchTarget,
  createSubmitConfirmDialog,
  createPromptDialog,
} from '../../src/ui/index.ts';

// --- DOM Mock helper ---
import {
  MockDocument,
  MockElement,
  MockEvent,
  MockKeyboardEvent,
} from '../ui/core/dom-mock.ts';

// --- Test in-memory storage implementation ---
class TestStorage implements StoragePort {
  public bank = new Map<string, { revision: number; value: unknown }>();
  public exams = new Map<string, { revision: number; value: unknown }>();
  public imports = new Map<string, { revision: number; value: unknown }>();
  public attempts = new Map<string, AttemptRecord>();
  public outbox = new Map<string, OutboxRecord>();

  public failOnPutBank: string | null = null; // code to fail with

  private keyStr(key: AttemptKey): string {
    return `${key.examId}:${key.examVersionId}:${key.attemptId}`;
  }

  async load(key: AttemptKey): Promise<Result<AttemptRecord | null>> {
    const k = this.keyStr(key);
    const rec = this.attempts.get(k);
    return { ok: true, value: rec ? structuredClone(rec) : null };
  }

  async create(record: AttemptRecord): Promise<Result<AttemptRecord>> {
    const k = this.keyStr(record);
    if (this.attempts.has(k)) {
      return { ok: false, error: { code: 'STORAGE_CONFLICT', path: k, message: 'Exists', recoverable: false } };
    }
    this.attempts.set(k, structuredClone(record));
    return { ok: true, value: structuredClone(record) };
  }

  async saveDraft(record: AttemptRecord, expectedRevision: number): Promise<Result<AttemptRecord>> {
    const k = this.keyStr(record);
    const cur = this.attempts.get(k);
    if (!cur || cur.revision !== expectedRevision) {
      return { ok: false, error: { code: 'STORAGE_CONFLICT', path: k, message: 'Conflict', recoverable: true } };
    }
    const next = { ...structuredClone(record), revision: cur.revision + 1 };
    this.attempts.set(k, next);
    return { ok: true, value: next };
  }

  async finalize(record: AttemptRecord, expectedRevision: number): Promise<Result<AttemptRecord>> {
    const k = this.keyStr(record);
    const cur = this.attempts.get(k);
    if (!cur || cur.revision !== expectedRevision) {
      return { ok: false, error: { code: 'STORAGE_CONFLICT', path: k, message: 'Conflict', recoverable: true } };
    }
    const next: AttemptRecord = { ...structuredClone(record), revision: cur.revision + 1, phase: 'final' };
    this.attempts.set(k, next);
    return { ok: true, value: next };
  }

  async listAttempts(_examId: string, _examVersionId: string): Promise<Result<readonly AttemptRecord[]>> {
    return { ok: true, value: Array.from(this.attempts.values()).map((v) => structuredClone(v)) };
  }

  async getObject(store: 'bank' | 'exams' | 'imports', id: string): Promise<Result<unknown | null>> {
    const m = store === 'bank' ? this.bank : store === 'exams' ? this.exams : this.imports;
    const entry = m.get(id);
    return { ok: true, value: entry ? structuredClone(entry.value) : null };
  }

  async putObject(store: 'bank' | 'exams' | 'imports', id: string, value: unknown, expectedRevision: number | null): Promise<Result<number>> {
    if (store === 'bank' && this.failOnPutBank) {
      return {
        ok: false,
        error: {
          code: this.failOnPutBank,
          path: `bank.${id}`,
          message: `Storage write failed with ${this.failOnPutBank}`,
          recoverable: true,
        },
      };
    }
    const m = store === 'bank' ? this.bank : store === 'exams' ? this.exams : this.imports;
    const cur = m.get(id);
    if (expectedRevision === null) {
      if (cur) {
        return { ok: false, error: { code: 'STORAGE_CONFLICT', path: id, message: 'Already exists', recoverable: true } };
      }
      m.set(id, { revision: 1, value: structuredClone(value) });
      return { ok: true, value: 1 };
    }
    if (!cur || cur.revision !== expectedRevision) {
      return { ok: false, error: { code: 'STORAGE_CONFLICT', path: id, message: 'Revision conflict', recoverable: true } };
    }
    const nextRev = cur.revision + 1;
    m.set(id, { revision: nextRev, value: structuredClone(value) });
    return { ok: true, value: nextRev };
  }

  async deleteObject(store: 'bank' | 'exams' | 'imports', id: string, expectedRevision: number): Promise<Result<void>> {
    const m = store === 'bank' ? this.bank : store === 'exams' ? this.exams : this.imports;
    const cur = m.get(id);
    if (!cur || cur.revision !== expectedRevision) {
      return { ok: false, error: { code: 'STORAGE_CONFLICT', path: id, message: 'Revision conflict', recoverable: true } };
    }
    m.delete(id);
    return { ok: true, value: undefined };
  }

  async getOutbox(key: AttemptKey): Promise<Result<OutboxRecord | null>> {
    const k = this.keyStr(key);
    const rec = this.outbox.get(k);
    return { ok: true, value: rec ? structuredClone(rec) : null };
  }

  async updateOutbox(value: OutboxRecord, expectedGeneration: number | null): Promise<Result<OutboxRecord>> {
    const k = this.keyStr(value);
    const cur = this.outbox.get(k);
    if (expectedGeneration === null) {
      if (cur) {
        return { ok: false, error: { code: 'STORAGE_CONFLICT', path: k, message: 'Outbox already exists', recoverable: false } };
      }
      this.outbox.set(k, structuredClone(value));
      return { ok: true, value: structuredClone(value) };
    }
    if (!cur || cur.generation !== expectedGeneration) {
      return { ok: false, error: { code: 'STORAGE_CONFLICT', path: k, message: 'Generation conflict', recoverable: true } };
    }
    this.outbox.set(k, structuredClone(value));
    return { ok: true, value: structuredClone(value) };
  }

  async exportBackup(): Promise<Result<Blob>> {
    const all = {
      bank: Array.from(this.bank.values()).map((v) => v.value),
      exams: Array.from(this.exams.values()).map((v) => v.value),
    };
    return { ok: true, value: new Blob([JSON.stringify(all)], { type: 'application/json' }) };
  }

  async importBackup(_input: unknown): Promise<Result<void>> {
    return { ok: true, value: undefined };
  }

  async clearAll(confirmed: boolean): Promise<Result<void>> {
    if (!confirmed) {
      return { ok: false, error: { code: 'CONFIRMATION_REQUIRED', path: 'confirmed', message: 'Confirmed required', recoverable: true } };
    }
    this.bank.clear();
    this.exams.clear();
    this.imports.clear();
    this.attempts.clear();
    this.outbox.clear();
    return { ok: true, value: undefined };
  }
}

// --- Sample Exam Builder Helper ---
function buildSampleExam(): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-fq-01',
    examVersionId: 'v1.0.0',
    title: 'Đề thi chất lượng cuối đợt',
    subject: 'Toán',
    grade: 12,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    settings: {
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q-fq-1',
        title: 'Câu 1',
        content: 'Một cộng một bằng mấy?',
        options: [
          { optionId: 'opt-1', label: 'A', text: '2' },
          { optionId: 'opt-2', label: 'B', text: '3' },
          { optionId: 'opt-3', label: 'C', text: '4' },
          { optionId: 'opt-4', label: 'D', text: '5' },
        ],
        correctOptionId: 'opt-1',
        explanation: '1 + 1 = 2 theo số học cơ bản',
      },
      {
        kind: 'II',
        questionVersionId: 'q-fq-2',
        title: 'Câu 2',
        content: 'Xét tính đúng sai của các mệnh đề:',
        statements: [
          { statementId: 'st-1', label: 'a', text: 'Số 2 là số nguyên tố chẵn duy nhất', answer: true, explanation: 'Đúng' },
          { statementId: 'st-2', label: 'b', text: 'Số 1 là số nguyên tố', answer: false, explanation: '1 không phải nguyên tố' },
          { statementId: 'st-3', label: 'c', text: 'Số 0 là số tự nhiên', answer: true, explanation: '0 thuộc N' },
          { statementId: 'st-4', label: 'd', text: 'Mọi số chẵn đều chia hết cho 4', answer: false, explanation: '6 không chia hết cho 4' },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'q-fq-3',
        title: 'Câu 3',
        content: 'Nhiệt độ âm nửa độ C viết là:',
        answerKey: '-0,5',
        explanation: 'Chuỗi chính xác 4 ký tự -0,5',
      },
    ],
    assets: [],
  };
}

function buildSampleAttempt(exam: WebExam, responses?: AttemptResponses): AttemptRecord {
  // By default, student chooses opt-2 (incorrect) so opt-1 remains hidden if unreleased
  const resp: AttemptResponses = responses ?? {
    attemptId: 'att-fq-01',
    examVersionId: exam.examVersionId,
    responses: [
      { kind: 'I', questionVersionId: 'q-fq-1', selectedOptionId: 'opt-2' },
      {
        kind: 'II',
        questionVersionId: 'q-fq-2',
        answers: [
          { statementId: 'st-1', value: false },
          { statementId: 'st-2', value: false },
          { statementId: 'st-3', value: false },
          { statementId: 'st-4', value: false },
        ],
      },
      { kind: 'III', questionVersionId: 'q-fq-3', raw: '2,5' },
    ],
  };

  const domainExam = toDomainExam(exam);
  const scoreRes = scoreAttempt(domainExam, resp);
  const scoreDTO = scoreResultToDTO(scoreRes);

  return {
    schemaVersion: 'web-attempt-v1',
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    attemptId: resp.attemptId,
    revision: 1,
    candidateName: 'Nguyễn Văn Final',
    examSnapshot: exam,
    presentationOrder: {
      seed: 'seed-fq-01',
      questionOrder: ['q-fq-1', 'q-fq-2', 'q-fq-3'],
      optionOrder: [
        { questionVersionId: 'q-fq-1', optionIds: ['opt-1', 'opt-2', 'opt-3', 'opt-4'] },
      ],
    },
    responses: resp,
    startedAt: 1700000000000,
    deadline: 1700003000000,
    phase: 'final',
    submittedAt: 1700002500000,
    scoreDTO,
  };
}

// ============================================================================
// SUITE 1: LC43-F04 Regression & Bank Storage Quota Handling
// ============================================================================
describe('SUITE 1: LC43-F04 Regression & Bank Storage Quota Handling', () => {
  it('LC43-F04: TeacherController.saveQuestionToBank reports error on STORAGE_QUOTA without swallowing or claiming success', async () => {
    const storage = new TestStorage();
    storage.failOnPutBank = 'STORAGE_QUOTA'; // simulate quota exceeded

    const exam = buildSampleExam();
    const draft = createDraft(exam, 'draft-test-1');
    let reportedError: WebError | null = null;

    const controller = new TeacherController({
      initialDraft: draft,
      storage,
      actions: {
        onError: (err) => {
          reportedError = err;
        },
      },
    });

    const res = await controller.saveQuestionToBank('q-fq-1');
    assert.equal(res.ok, false, 'Expected save to bank to fail');
    if (!res.ok) {
      assert.equal(res.error.code, 'STORAGE_QUOTA');
    }

    // Verify error notification
    assert.ok(reportedError);
    assert.equal((reportedError as WebError).code, 'STORAGE_QUOTA');

    // Verify status message reflects failure
    const statusMsg = controller.getStatusMessage();
    assert.ok(statusMsg && statusMsg.includes('thất bại'), `Status message must declare failure, got: ${statusMsg}`);
    assert.ok(statusMsg && statusMsg.includes('STORAGE_QUOTA'));

    // Verify question content in draft was NOT lost
    const qInDraft = controller.getDraft().exam.questions.find((x) => x.questionVersionId === 'q-fq-1');
    assert.ok(qInDraft);
    assert.equal(qInDraft?.title, 'Câu 1');
  });

  it('LC43-F04: Teacher View DOM mounts status announcer with error role="alert" and assertive live region on quota error', async () => {
    const storage = new TestStorage();
    storage.failOnPutBank = 'STORAGE_QUOTA';

    const exam = buildSampleExam();
    const draft = createDraft(exam, 'draft-test-2');
    const controller = new TeacherController({ initialDraft: draft, storage });

    const mockDoc = new MockDocument();
    const mockRoot = mockDoc.createElement('div');
    const origDoc = globalThis.document;
    (globalThis as any).document = mockDoc;

    try {
      const unmount = mountTeacher(mockRoot as any, controller);

      // Trigger save that fails with quota
      await controller.saveQuestionToBank('q-fq-1');

      // Check rendered DOM for alert status announcer
      const announcer = mockRoot.querySelector('.cunata-status-announcer');
      assert.ok(announcer, 'Expected .cunata-status-announcer to be mounted');
      assert.ok(announcer.classList.contains('cunata-status-error'), 'Expected error styling class');
      assert.equal(announcer.getAttribute('role'), 'alert', 'Error status must have role="alert"');
      assert.equal(announcer.getAttribute('aria-live'), 'assertive', 'Error status must have aria-live="assertive"');

      unmount();
    } finally {
      (globalThis as any).document = origDoc;
    }
  });

  it('LC43-F04: Bank View import does NOT claim success when import fails with STORAGE_QUOTA', async () => {
    const storage = new TestStorage();
    storage.failOnPutBank = 'STORAGE_QUOTA';

    const mockDoc = new MockDocument();
    const mockRoot = mockDoc.createElement('div');
    const origDoc = globalThis.document;
    (globalThis as any).document = mockDoc;

    try {
      mountBank(mockRoot as any, { entries: [], storage });

      // Find file input and trigger import with valid JSON
      const inputs = mockRoot.querySelectorAll('input');
      const fileInput = inputs.find((i: any) => i.type === 'file') || inputs[0];
      assert.ok(fileInput, 'File input must exist in Bank View');

      const transferPayload = {
        schemaVersion: 'cunata-bank-transfer-v1',
        exportedAt: new Date().toISOString(),
        generator: 'test',
        count: 1,
        entries: [
          {
            questionId: 'q-new-1',
            questionVersionId: 'q-new-1-v1',
            revision: 0,
            taxonomy: {
              subject: 'Toán',
              grade: 12,
              topic: 'Hàm số',
              lesson: 'Đơn điệu',
              difficulty: 'Nhận biết',
            },
            question: {
              kind: 'I',
              questionVersionId: 'q-new-1-v1',
              title: 'Câu mới',
              content: 'Nội dung',
              options: [
                { optionId: 'o1', label: 'A', text: '1' },
                { optionId: 'o2', label: 'B', text: '2' },
                { optionId: 'o3', label: 'C', text: '3' },
                { optionId: 'o4', label: 'D', text: '4' },
              ],
              correctOptionId: 'o1',
            },
          },
        ],
      };

      const mockFile = {
        text: async () => JSON.stringify(transferPayload),
      };
      (fileInput as any).files = [mockFile];

      // Dispatch change event
      await (fileInput as any).onchange();

      // Check status element
      const statusBanner = mockRoot.querySelector('.cunata-bank-status');
      assert.ok(statusBanner, 'Expected status banner to be rendered');
      assert.ok(statusBanner.classList.contains('error'), `Expected error class, got: ${statusBanner.classList.value}`);
      assert.ok(!statusBanner.classList.contains('success'), 'Must NOT report success on quota failure');
      assert.ok(statusBanner.textContent.includes('Nhập thất bại do lỗi lưu trữ'), `Expected failure message, got: ${statusBanner.textContent}`);
      assert.ok(statusBanner.textContent.includes('STORAGE_QUOTA'));
    } finally {
      (globalThis as any).document = origDoc;
    }
  });
});

// ============================================================================
// SUITE 2: Key Leaks & Release Policy Invariants
// ============================================================================
describe('SUITE 2: Key Leaks & Release Policy Invariants', () => {
  it('buildReport with released: false strictly excludes answer keys and explanations', () => {
    const exam = buildSampleExam();
    // Set release policy to after_deadline and test with now < deadline
    const lockedExam: WebExam = {
      ...exam,
      settings: {
        ...exam.settings,
        releasePolicy: 'after_deadline',
      },
    };

    // Candidate answered opt-2 (incorrect); opt-1 is the unreleased key
    const attempt = buildSampleAttempt(lockedExam);
    const now = attempt.startedAt + 1000; // before deadline

    const res = buildReport(attempt, now);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const model = res.value;
    assert.equal(model.released, false);

    // Verify questions have no answer or explanation properties
    for (const q of model.questions) {
      assert.equal((q as any).answer, undefined, `Question ${q.questionVersionId} must not contain answer`);
      assert.equal((q as any).explanation, undefined, `Question ${q.questionVersionId} must not contain explanation`);
    }

    // Verify HTML output contains 0 answers or explanation texts
    const html = renderReportHtml(model);
    assert.ok(!html.includes('opt-1'), 'HTML must not contain correct option ID opt-1');
    assert.ok(!html.includes('1 + 1 = 2 theo số học cơ bản'), 'HTML must not contain explanation text');
    assert.ok(!html.includes('Số 2 là số nguyên tố chẵn duy nhất: Đúng'), 'HTML must not contain statement answer key');
    assert.ok(!html.includes('-0,5'), 'HTML must not contain Part III answer key -0,5');

    // Verify downloadReport inspection verifies hasUnreleasedKeys === false
    const downloadBlob = downloadReport(model);
    assert.ok(downloadBlob);

    const inspection = inspectDownloadBytes(html);
    assert.equal(inspection.hasUnreleasedKeys, false);
    assert.equal(inspection.unreleasedKeysFound.length, 0);
  });

  it('buildReport strictly rejects stored scoreDTO tampering with SCORE_MISMATCH', () => {
    const exam = buildSampleExam();
    const attempt = buildSampleAttempt(exam);

    // Tamper with stored scoreDTO: change total from 0 to 10
    const tamperedDTO = {
      ...(attempt.scoreDTO as any),
      total: '10',
    };

    const tamperedAttempt: AttemptRecord = {
      ...attempt,
      scoreDTO: tamperedDTO,
    };

    const res = buildReport(tamperedAttempt, Date.now());
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'SCORE_MISMATCH');
    }
  });
});

// ============================================================================
// SUITE 3: Outbox Generation CAS, Stale Receipts & Idempotency
// ============================================================================
describe('SUITE 3: Outbox Generation CAS, Stale Receipts & Idempotency', () => {
  it('Outbox CAS generation prevents stale updates when record generation advances', async () => {
    const storage = new TestStorage();
    const exam = buildSampleExam();
    const attempt = buildSampleAttempt(exam);

    await storage.create(attempt);
    // Finalize attempt in storage (returns record with revision 2)
    const finRes1 = await storage.finalize(attempt, 1);
    assert.equal(finRes1.ok, true);
    if (!finRes1.ok) return;
    const finalized = finRes1.value;

    // Enqueue
    const enqRes = await enqueue(finalized, storage, 'https://example.invalid/collect');
    assert.equal(enqRes.ok, true);
    if (!enqRes.ok) return;

    const outbox = enqRes.value;
    assert.equal(outbox.generation, 1);

    // Drain with mock transport that delays and advances generation concurrently
    const mockTransport: CollectorPort = {
      async send(_f, _signal) {
        // Concurrently advance generation in storage behind transport's back
        const curRes = await storage.getOutbox(finalized);
        assert.equal(curRes.ok, true);
        if (!curRes.ok) throw new Error('Failed to get outbox');
        const current = curRes.value!;
        await storage.updateOutbox({ ...current, generation: current.generation + 1 }, current.generation);
        return {
          examId: finalized.examId,
          examVersionId: finalized.examVersionId,
          attemptId: finalized.attemptId,
          submissionId: 'sub-01',
          payloadHash: current.payloadHash,
          receivedAt: new Date().toISOString(),
          status: 'recorded',
        };
      },
    };

    const drainRes = await drainOutbox(finalized, {
      storage,
      transport: mockTransport,
      now: () => Date.now(),
    });

    assert.equal(drainRes.ok, false);
    if (!drainRes.ok) {
      assert.equal(drainRes.error.code, 'STALE_GENERATION');
    }
  });

  it('Terminal server_confirmed status cannot be regressed by late error or retries', async () => {
    const storage = new TestStorage();
    const exam = buildSampleExam();
    const attempt = buildSampleAttempt(exam);

    await storage.create(attempt);
    const finRes2 = await storage.finalize(attempt, 1);
    assert.equal(finRes2.ok, true);
    if (!finRes2.ok) return;
    const finalized = finRes2.value;

    const enqRes = await enqueue(finalized, storage, 'https://example.invalid/collect');
    assert.equal(enqRes.ok, true);
    if (!enqRes.ok) return;
    const outbox = enqRes.value;

    // Set to server_confirmed directly
    const confirmed: OutboxRecord = {
      ...outbox,
      state: 'server_confirmed',
      receipt: {
        examId: finalized.examId,
        examVersionId: finalized.examVersionId,
        attemptId: finalized.attemptId,
        submissionId: 'sub-confirmed',
        payloadHash: outbox.payloadHash,
        receivedAt: new Date().toISOString(),
        status: 'recorded',
      },
    };
    await storage.updateOutbox(confirmed, outbox.generation);

    // Calling enqueue again returns confirmed record without altering state
    const enq2 = await enqueue(finalized, storage, 'https://example.invalid/collect');
    assert.equal(enq2.ok, true);
    if (enq2.ok) {
      assert.equal(enq2.value.state, 'server_confirmed');
    }

    // Calling drainOutbox on confirmed record returns it immediately
    const drainRes = await drainOutbox(finalized, {
      storage,
      transport: { async send() { throw new Error('Should not be called'); } },
      now: () => Date.now(),
    });
    assert.equal(drainRes.ok, true);
    if (drainRes.ok) {
      assert.equal(drainRes.value.state, 'server_confirmed');
    }
  });

  it('Idempotency: conflicting payload hash returns PAYLOAD_CONFLICT', () => {
    const record: OutboxRecord = {
      examId: 'ex-1',
      examVersionId: 'v1',
      attemptId: 'att-1',
      state: 'sending',
      finalRevision: 1,
      payloadHash: 'hash-original',
      endpointId: 'ep-1',
      retryCount: 0,
      nextRetryAt: null,
      generation: 1,
      receipt: null,
      lastError: null,
    };

    const conflictingReceipt = {
      examId: 'ex-1',
      examVersionId: 'v1',
      attemptId: 'att-1',
      submissionId: 'sub-1',
      payloadHash: 'hash-CONFLICTING',
      receivedAt: new Date().toISOString(),
      status: 'recorded',
    };

    const res = validateReceipt(conflictingReceipt, record);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'PAYLOAD_CONFLICT');
    }
  });
});

// ============================================================================
// SUITE 4: Spreadsheet Formula Injection (CWE-1236) & Safe Exports
// ============================================================================
describe('SUITE 4: Spreadsheet Formula Injection (CWE-1236) & Safe Exports', () => {
  it('neutralizeFormula detects standard and fullwidth formula triggers', () => {
    // Standard triggers
    assert.equal(isFormulaDangerous('=SUM(A1:A10)'), true);
    assert.equal(isFormulaDangerous('+123'), true);
    assert.equal(isFormulaDangerous('-0,5'), true);
    assert.equal(isFormulaDangerous('@HYPERLINK'), true);
    assert.equal(isFormulaDangerous('|calc'), true);
    assert.equal(isFormulaDangerous('   =CMD()'), true);
    assert.equal(isFormulaDangerous('\t-5'), true);

    // Fullwidth Unicode triggers
    assert.equal(isFormulaDangerous('＝1+1'), true);
    assert.equal(isFormulaDangerous('＋99'), true);
    assert.equal(isFormulaDangerous('－0,5'), true);
    assert.equal(isFormulaDangerous('＠ALERT'), true);
    assert.equal(isFormulaDangerous('｜SHELL'), true);

    // Neutralization prepends apostrophe
    assert.equal(neutralizeFormula('=SUM(1,2)'), "'=SUM(1,2)");
    assert.equal(neutralizeFormula('-0,5'), "'-0,5");
    assert.equal(neutralizeFormula('＝FULLWIDTH'), "'＝FULLWIDTH");

    // Safe text unmodified
    assert.equal(neutralizeFormula('Nguyễn Văn An'), 'Nguyễn Văn An');
    assert.equal(neutralizeFormula('1,5'), '1,5');
    assert.equal(neutralizeFormula(''), '');
  });

  it('serializeResultsCsv neutralizes untrusted candidate names and Part III raw values', () => {
    const exam = buildSampleExam();
    const hostileResp: AttemptResponses = {
      attemptId: '=ATTEMPT_INJECT()',
      examVersionId: exam.examVersionId,
      responses: [
        { kind: 'III', questionVersionId: 'q-fq-3', raw: '-0,5' },
      ],
    };

    const hostileAttempt: AttemptRecord = {
      ...buildSampleAttempt(exam, hostileResp),
      candidateName: '+84999999999',
    };

    const csv = serializeResultsCsv([hostileAttempt]);
    assert.ok(csv.includes("\"'+84999999999\""), 'Candidate name with plus trigger must be neutralized in CSV');
    assert.ok(csv.includes("\"'-0,5\""), 'Part III raw string -0,5 must be neutralized with apostrophe in CSV');

    // JSON export preserves raw exact string WITHOUT neutralization apostrophe
    const jsonStr = serializeResultsJson([hostileAttempt]);
    const parsedJson = JSON.parse(jsonStr);
    assert.equal(parsedJson.results[0].candidateName, '+84999999999');
    assert.equal(parsedJson.results[0].responses.responses[0].raw, '-0,5');
  });

  it('Independent CSV Parser parses RFC 4180 CSV without syntax corruption', () => {
    const exam = buildSampleExam();
    const attempt = buildSampleAttempt(exam);
    const csv = serializeResultsCsv([attempt]);

    const lines = csv.split('\r\n').filter((l) => l.trim().length > 0);
    assert.equal(lines.length, 2, 'Must have 1 header line and 1 data line');

    const headers = lines[0]!.split(',').map((c) => c.replace(/^"|"$/g, ''));
    assert.equal(headers.length, CSV_HEADERS.length);

    // Verify cell quotes and escaping
    const dataLine = lines[1]!;
    assert.ok(dataLine.startsWith('"att-fq-01"'));
  });
});

// ============================================================================
// SUITE 5: XSS, Safe DOM & Asset Security
// ============================================================================
describe('SUITE 5: XSS, Safe DOM & Asset Security', () => {
  it('sanitizeUrl and isSafeUrl reject hostile javascript:, vbscript:, and data: URLs', () => {
    assert.equal(isSafeUrl('javascript:alert(1)'), false);
    assert.equal(isSafeUrl('vbscript:msgbox(1)'), false);
    assert.equal(isSafeUrl('data:text/html;base64,PHNjcmlwdD4='), false);
    // Remote external URLs blocked by Cunata static zero-fetch policy
    assert.equal(isSafeUrl('https://example.com/image.png'), false);
    // Local safe assets allowed
    assert.equal(isSafeUrl('public/images/diagram.png'), true);
    assert.equal(isSafeUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='), true);

    assert.equal(sanitizeUrl('javascript:evil()'), '');
  });

  it('isSafeSvg rejects SVG containing <script>, onload handlers, or foreignObject', () => {
    assert.equal(isSafeSvg('<svg><script>alert(1)</script></svg>'), false);
    assert.equal(isSafeSvg('<svg onload="alert(1)"></svg>'), false);
    assert.equal(isSafeSvg('<svg><foreignObject><body><div>bad</div></body></foreignObject></svg>'), false);
    assert.equal(isSafeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'), true);
  });

  it('renderText escapes HTML special characters', () => {
    const mockDoc = new MockDocument();
    const origDoc = globalThis.document;
    (globalThis as any).document = mockDoc;

    try {
      const el = renderText('<script>alert("XSS")</script> & "quotes"');
      assert.equal(el.textContent, '<script>alert("XSS")</script> & "quotes"');
    } finally {
      (globalThis as any).document = origDoc;
    }
  });
});

// ============================================================================
// SUITE 6: Versioning, Immutable Snapshots & Draft Lifecycle
// ============================================================================
describe('SUITE 6: Versioning, Immutable Snapshots & Draft Lifecycle', () => {
  it('publishDraft creates new immutable version and refuses to overwrite historical versions', async () => {
    const storage = new TestStorage();
    const exam = buildSampleExam();
    const draft = createDraft(exam, 'draft-pub-1');

    // First publication
    const pubRes = await publishDraft(draft, 'v1.1.0', storage);
    assert.equal(pubRes.ok, true);
    if (!pubRes.ok) return;

    assert.equal(pubRes.value.examVersionId, 'v1.1.0');
    assert.ok(Object.isFrozen(pubRes.value));

    // Attempting to publish again with same version id must be rejected
    const dupRes = await publishDraft(draft, 'v1.1.0', storage);
    assert.equal(dupRes.ok, false);
    if (!dupRes.ok) {
      assert.equal(dupRes.error.code, 'EXAM_VERSION_EXISTS');
    }
  });

  it('duplicateQuestion cleanly remaps option IDs and statement IDs without collision', () => {
    const exam = buildSampleExam();
    const draft = createDraft(exam, 'draft-dup-1');

    const dupRes = duplicateQuestion(draft, 'q-fq-1', () => 'new-uuid');
    assert.equal(dupRes.ok, true);
    if (!dupRes.ok) return;

    const newDraft = dupRes.value;
    assert.equal(newDraft.exam.questions.length, 4);

    const originalQ = newDraft.exam.questions[0] as Extract<WebQuestion, { kind: 'I' }>;
    const duplicatedQ = newDraft.exam.questions[1] as Extract<WebQuestion, { kind: 'I' }>;

    assert.notEqual(originalQ.questionVersionId, duplicatedQ.questionVersionId);
    for (let i = 0; i < 4; i++) {
      assert.notEqual(originalQ.options[i]!.optionId, duplicatedQ.options[i]!.optionId);
    }
    // Correct option mapping preserved
    assert.equal(duplicatedQ.correctOptionId, duplicatedQ.options[0]!.optionId);
  });
});

// ============================================================================
// SUITE 7: Accessibility (a11y), Focus Management & IME Protection
// ============================================================================
describe('SUITE 7: Accessibility (a11y), Focus Management & IME Protection', () => {
  it('enforceTouchTarget sets min 44px on interactive controls', () => {
    const mockDoc = new MockDocument();
    const el = mockDoc.createElement('button');
    enforceTouchTarget(el as any);

    assert.equal(el.style['minHeight'], '44px');
    assert.equal(el.style['minWidth'], '44px');
    assert.equal(el.style['touchAction'], 'manipulation');
    assert.ok(el.classList.contains('cunata-touch-target'));
  });

  it('isRoutineTimerTick accurately suppresses 1-second countdown spam from screen readers', () => {
    assert.equal(isRoutineTimerTick('00:49:59'), true);
    assert.equal(isRoutineTimerTick('15:30'), true);
    assert.equal(isRoutineTimerTick('Còn lại 49:58'), true);

    // Milestones and warnings are NOT routine
    assert.equal(isRoutineTimerTick('Cảnh báo: Còn 5 phút!'), false);
    assert.equal(isRoutineTimerTick('Hết giờ làm bài, hệ thống đang tự động nộp'), false);
    assert.equal(isRoutineTimerTick('Đã lưu bài làm vào bộ nhớ cục bộ'), false);
  });

  it('Vietnamese IME composition guard protects Enter key from triggering submit', () => {
    const mockDoc = new MockDocument();
    const el = mockDoc.createElement('input');
    el.value = 'Việt';
    let committedValue: string | null = null;

    const guard = createCompositionGuard({
      element: el as any,
      onCommit: (val) => {
        committedValue = val;
      },
    });

    // Simulate compositionstart
    el.dispatchEvent(new MockEvent('compositionstart'));
    assert.equal(guard.isComposing(), true);

    // Simulate Enter key while composing
    const enterWhileComposing = new MockKeyboardEvent('keydown', { key: 'Enter', isComposing: true });
    el.dispatchEvent(enterWhileComposing);
    assert.equal(committedValue, null, 'Enter key during IME composition must NOT trigger commit');

    // Simulate compositionend
    el.value = 'Việt Nam';
    el.dispatchEvent(new MockEvent('compositionend'));
    assert.equal(guard.isComposing(), false);
    assert.equal(committedValue, 'Việt Nam', 'compositionend must commit the composed text');

    guard.dispose();
  });
});

// ============================================================================
// SUITE 8: Port Integrations & Independent Oracle Comparison (1,632 Fixtures)
// ============================================================================
describe('SUITE 8: Port Integrations & Independent Oracle Comparison (1,632 Fixtures)', () => {
  const fixturesDir = path.join(path.resolve('.'), 'test', 'oracle', 'fixtures');
  const fixtureFiles = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.json')).sort();

  let totalCasesChecked = 0;

  for (const file of fixtureFiles) {
    it(`Oracle Comparison for ${file}`, () => {
      const fullPath = path.join(fixturesDir, file);
      const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

      for (const c of data.cases) {
        totalCasesChecked++;

        // 1. Pure domain scoring
        const domainResult = scoreAttempt(c.exam, c.attempt);

        // Verify Part I, II, III and Totals match oracle expected fractions
        assert.equal(
          toFractionString(domainResult.sections.I.score),
          c.expected.sections.I.score,
          `Case ${c.id}: Part I score mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.I.max),
          c.expected.sections.I.max,
          `Case ${c.id}: Part I max mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.II.score),
          c.expected.sections.II.score,
          `Case ${c.id}: Part II score mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.II.max),
          c.expected.sections.II.max,
          `Case ${c.id}: Part II max mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.III.score),
          c.expected.sections.III.score,
          `Case ${c.id}: Part III score mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.III.max),
          c.expected.sections.III.max,
          `Case ${c.id}: Part III max mismatch`
        );
        assert.equal(
          toFractionString(domainResult.total),
          c.expected.total,
          `Case ${c.id}: Total score mismatch`
        );
        assert.equal(
          toFractionString(domainResult.maxTotal),
          c.expected.maxTotal,
          `Case ${c.id}: MaxTotal mismatch`
        );
      }
    });
  }

  it('Verifies all 1,632 oracle fixtures were executed', () => {
    assert.equal(totalCasesChecked, 1632, 'Must execute exactly 1,632 oracle fixtures');
  });
});
