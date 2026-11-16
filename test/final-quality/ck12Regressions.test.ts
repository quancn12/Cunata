import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AttemptRecord, WebExam } from '../../src/schema/types.ts';
import { openStorage, MemoryTransactionAdapter } from '../../src/storage/index.ts';
import { bootstrap } from '../../src/app/main.ts';
import { createMockDocument, MockElement, MockEvent } from '../ui/core/dom-mock.ts';

const SAMPLE_EXAM: WebExam = {
  schemaVersion: 'web-exam-v1',
  ruleSetId: 'custom-v1',
  inputPolicyId: 'sa-charset-v1',
  examId: 'exam-ck12-regression',
  examVersionId: 'v1.0.0',
  title: 'Đề kiểm định CK12',
  subject: 'Vật lí',
  grade: 12,
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
      questionVersionId: 'q01',
      title: 'Câu 1',
      content: 'Nội dung câu 1',
      options: [
        { optionId: 'opt-1a', label: 'A', text: 'Đáp án A' },
        { optionId: 'opt-1b', label: 'B', text: 'Đáp án B' },
        { optionId: 'opt-1c', label: 'C', text: 'Đáp án C' },
        { optionId: 'opt-1d', label: 'D', text: 'Đáp án D' },
      ],
      correctOptionId: 'opt-1a',
    },
    {
      kind: 'I',
      questionVersionId: 'q02',
      title: 'Câu 2',
      content: 'Nội dung câu 2',
      options: [
        { optionId: 'opt-2a', label: 'A', text: 'Đáp án A' },
        { optionId: 'opt-2b', label: 'B', text: 'Đáp án B' },
        { optionId: 'opt-2c', label: 'C', text: 'Đáp án C' },
        { optionId: 'opt-2d', label: 'D', text: 'Đáp án D' },
      ],
      correctOptionId: 'opt-2c',
    },
  ],
  assets: [],
};

const NEW_EXAM: WebExam = {
  schemaVersion: 'web-exam-v1',
  ruleSetId: 'custom-v1',
  inputPolicyId: 'sa-charset-v1',
  examId: 'exam-new-switch',
  examVersionId: 'v1.0.0',
  title: 'Đề thi mới chuyển đổi',
  subject: 'Vật lí',
  grade: 12,
  settings: {
    durationMinutes: 45,
    maxAttempts: null,
    releasePolicy: 'immediate',
    shuffleQuestions: false,
    shuffleOptions: false,
  },
  questions: [
    {
      kind: 'I',
      questionVersionId: 'qnew-01',
      title: 'Câu mới 1',
      content: 'Nội dung câu mới',
      options: [
        { optionId: 'opt-na', label: 'A', text: 'Đáp án NA' },
        { optionId: 'opt-nb', label: 'B', text: 'Đáp án NB' },
        { optionId: 'opt-nc', label: 'C', text: 'Đáp án NC' },
        { optionId: 'opt-nd', label: 'D', text: 'Đáp án ND' },
      ],
      correctOptionId: 'opt-na',
    },
  ],
  assets: [],
};

function createMockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    get length(): number {
      return store.size;
    },
    _raw: store,
  };
}

class MockFileReader {
  public onload: ((e: any) => void) | null = null;
  public result: string | null = null;
  readAsText(file: any) {
    Promise.resolve().then(async () => {
      const text = typeof file?.text === 'function' ? await file.text() : String(file);
      this.result = text;
      if (this.onload) this.onload({ target: { result: text } });
    });
  }
}

describe('CK12 & CK13 Audit Findings Regressions', () => {
  it('CK12-F01: Durable StoragePort final record cannot be mutated by corrupted localStorage mirror', async () => {
    const mockStorage = createMockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).window = globalThis;
    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = () => 'blob:mock-url';
      URL.revokeObjectURL = () => {};
    }

    const adapter = new MemoryTransactionAdapter();
    const storageRes = await openStorage({ adapter, approveD03: true });
    assert.equal(storageRes.ok, true);
    if (!storageRes.ok) throw new Error('openStorage failed');
    const storage = storageRes.value;

    const attemptId = 'att-ck12-f01';
    const finalRecord: AttemptRecord = {
      schemaVersion: 'web-attempt-v1',
      examId: SAMPLE_EXAM.examId,
      examVersionId: SAMPLE_EXAM.examVersionId,
      attemptId,
      revision: 2,
      candidateName: 'Thí sinh A',
      examSnapshot: SAMPLE_EXAM,
      presentationOrder: {
        questionOrder: ['q01', 'q02'],
        optionOrder: [],
        seed: 'original',
      },
      responses: {
        attemptId,
        examVersionId: SAMPLE_EXAM.examVersionId,
        responses: [
          { kind: 'I', questionVersionId: 'q01', selectedOptionId: 'opt-1a' },
          { kind: 'I', questionVersionId: 'q02', selectedOptionId: 'opt-2b' }, // wrong answer
        ],
      },
      startedAt: Date.now() - 60000,
      deadline: Date.now() + 2940000,
      phase: 'final',
      submittedAt: Date.now() - 1000,
      scoreDTO: {
        attemptId,
        examVersionId: SAMPLE_EXAM.examVersionId,
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        total: '1/4',
        maxTotal: '1/2',
        sections: {
          I: { score: '1/4', max: '1/2' },
          II: { score: '0', max: '0' },
          III: { score: '0', max: '0' },
        },
        questionScores: [
          { questionVersionId: 'q01', score: '1/4', max: '1/4' },
          { questionVersionId: 'q02', score: '0', max: '1/4' },
        ],
      },
    };
    await storage.create(finalRecord);

    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup = await bootstrap(root, {
      storageAdapter: adapter,
      initialExam: SAMPLE_EXAM,
    });

    // Check DOM score and badge
    const syncText = root.querySelector('#syncText');
    assert.equal(syncText?.textContent, 'Đã nộp & lưu cục bộ');
    const scoreTotal = root.querySelector('#scoreTotal');
    assert.ok(scoreTotal?.textContent?.includes('0,25 / 0,50'));

    // Corrupt localStorage mirror with tampered responses/name
    const finalKey = `cunata:final:${encodeURIComponent(SAMPLE_EXAM.examId)}:${encodeURIComponent(SAMPLE_EXAM.examVersionId)}:${encodeURIComponent(attemptId)}`;
    const corruptPayload = JSON.stringify({
      ...finalRecord,
      candidateName: 'Kẻ phá hoại',
      responses: {
        attemptId,
        examVersionId: SAMPLE_EXAM.examVersionId,
        responses: [
          { kind: 'I', questionVersionId: 'q01', selectedOptionId: 'opt-1b' },
          { kind: 'I', questionVersionId: 'q02', selectedOptionId: 'opt-2c' },
        ],
      },
      scoreDTO: { total: '1/2', maxTotal: '1/2' },
    });
    mockStorage.setItem(finalKey, corruptPayload);

    // Emit storage event
    window.dispatchEvent(new MockEvent('storage', { key: finalKey, newValue: corruptPayload }));

    // Verify DOM still has original score and candidate name
    assert.ok(scoreTotal?.textContent?.includes('0,25 / 0,50'));
    const reportSubtitle = root.querySelector('#reportSubtitle');
    assert.ok(reportSubtitle?.textContent?.includes('Thí sinh A'));
    assert.ok(!reportSubtitle?.textContent?.includes('Kẻ phá hoại'));

    // Verify durable storage is unchanged
    const loaded = await storage.load({
      examId: SAMPLE_EXAM.examId,
      examVersionId: SAMPLE_EXAM.examVersionId,
      attemptId,
    });
    assert.equal(loaded.ok, true);
    if (!loaded.ok) throw new Error('load failed');
    assert.equal(loaded.value?.phase, 'final');
    assert.equal(loaded.value?.candidateName, 'Thí sinh A');
    const r0 = loaded.value?.responses.responses[0];
    assert.ok(r0 && r0.kind === 'I');
    assert.equal(r0.selectedOptionId, 'opt-1a');

    cleanup();
  });

  it('CK12-F02: When IDB open fails, openStorage returns STORAGE_UNAVAILABLE and UI shows honest non-saved status through submit and reload', async () => {
    const mockStorage = createMockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).window = globalThis;

    const failingAdapter = {
      isAvailable: async () => false,
      openTransaction: async () => {
        throw new DOMException('Audit unavailable', 'SecurityError');
      },
    };

    const storageRes = await openStorage({
      adapter: failingAdapter as any,
      approveD03: true,
    });
    assert.equal(storageRes.ok, false);
    if (!storageRes.ok) {
      assert.equal(storageRes.error.code, 'STORAGE_UNAVAILABLE');
    }

    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup1 = await bootstrap(root, {
      storageAdapter: failingAdapter as any,
      initialExam: SAMPLE_EXAM,
    });

    const syncText = root.querySelector('#syncText');
    assert.equal(syncText?.textContent, 'Chưa lưu');
    const banner = root.querySelector('#storageWarningBanner');
    assert.ok(banner, 'Storage warning banner must be displayed');
    const btnEmergency = root.querySelector('#btnEmergencyExport');
    assert.ok(btnEmergency, 'Emergency export button must be present in banner');

    // Answer question 1
    const optCard = root.querySelector('[data-qid="q01"][data-option-id="opt-1a"]');
    assert.ok(optCard, 'Option card opt-1a must exist');
    optCard.dispatchEvent(new MockEvent('click'));

    // Submit exam
    const btnSubmit = root.querySelector('#btnSubmit');
    assert.ok(btnSubmit);
    btnSubmit.dispatchEvent(new MockEvent('click'));

    const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit');
    assert.ok(btnConfirmSubmit);
    await btnConfirmSubmit.dispatchEvent(new MockEvent('click'));

    // After submit: durable finalize failed because IDB is unavailable
    // syncText must remain 'Chưa lưu'!
    assert.equal(syncText?.textContent, 'Chưa lưu');
    assert.notEqual(syncText?.textContent, 'Đã nộp & lưu cục bộ');

    // Emergency export button and banner must remain visible
    const bannerAfter = root.querySelector('#storageWarningBanner');
    assert.ok(bannerAfter, 'Storage warning banner must remain after failed durable submit');

    // Report score displays calculated score 0,25 / 0,50
    const scoreTotal = root.querySelector('#scoreTotal');
    assert.ok(scoreTotal?.textContent?.includes('0,25 / 0,50'));

    cleanup1();

    // Now simulate RELOAD with IDB still unavailable! (Tests CK13-F01 fix)
    const root2 = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root2 as unknown as MockElement);

    const cleanup2 = await bootstrap(root2, {
      storageAdapter: failingAdapter as any,
      initialExam: SAMPLE_EXAM,
    });

    const syncText2 = root2.querySelector('#syncText');
    // Critical CK13-F01 assertion: After reload with failing IDB, badge must NOT become 'Đã nộp & lưu cục bộ'!
    assert.equal(syncText2?.textContent, 'Chưa lưu');
    assert.notEqual(syncText2?.textContent, 'Đã nộp & lưu cục bộ');

    const banner2 = root2.querySelector('#storageWarningBanner');
    assert.ok(banner2, 'Storage warning banner must persist across reload when IDB is unavailable');

    const scoreTotal2 = root2.querySelector('#scoreTotal');
    assert.ok(scoreTotal2?.textContent?.includes('0,25 / 0,50'));

    cleanup2();
  });

  it('CK12-F03: In-progress attempt with responses prompts confirmation before switching exam', async () => {
    const mockStorage = createMockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).window = globalThis;
    (globalThis as any).FileReader = MockFileReader;

    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    let confirmCalled = 0;
    let confirmReturnValue = false;
    const origConfirm = (globalThis as any).confirm;
    (globalThis as any).confirm = (_msg: string) => {
      confirmCalled++;
      return confirmReturnValue;
    };

    const cleanup = await bootstrap(root, {
      initialExam: SAMPLE_EXAM,
    });

    const title = root.querySelector('#examTitle');
    assert.ok(title?.textContent?.includes('Đề kiểm định CK12'));

    // Answer question 1
    const optCard = root.querySelector('[data-qid="q01"][data-option-id="opt-1a"]');
    assert.ok(optCard);
    optCard.dispatchEvent(new MockEvent('click'));

    // User attempts to switch exam via file upload, but CANCELS confirmation
    confirmReturnValue = false;
    const examFileInput = root.querySelector('#examFileInput') as any;
    assert.ok(examFileInput);

    const mockFile = {
      name: 'new-exam.json',
      text: async () => JSON.stringify(NEW_EXAM),
    };
    examFileInput.files = [mockFile];
    examFileInput.dispatchEvent(new MockEvent('change', { target: examFileInput }));

    // Wait a tick for async FileReader
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Confirm must have been called
    assert.equal(confirmCalled, 1, 'confirm dialog must be prompted when unsaved attempt exists');
    // Exam must NOT have changed because user cancelled
    assert.ok(title?.textContent?.includes('Đề kiểm định CK12'), 'Exam title must remain unchanged after cancel');

    // Now user attempts to switch exam and ACCEPTS confirmation
    confirmReturnValue = true;
    examFileInput.files = [mockFile];
    examFileInput.dispatchEvent(new MockEvent('change', { target: examFileInput }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(confirmCalled, 2, 'confirm dialog must be prompted on second switch attempt');
    assert.ok(title?.textContent?.includes('Đề thi mới chuyển đổi'), 'Exam title must update to new exam after accept');

    (globalThis as any).confirm = origConfirm;
    cleanup();
  });

  it('CK13-F03: Tampered scoreDTO triggers SCORE_MISMATCH integrity error in UI instead of normal report', async () => {
    const mockStorage = createMockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).window = globalThis;

    const adapter = new MemoryTransactionAdapter();
    const storageRes = await openStorage({ adapter, approveD03: true });
    assert.equal(storageRes.ok, true);
    if (!storageRes.ok) throw new Error('openStorage failed');
    const storage = storageRes.value;

    const attemptId = 'att-ck13-f03-tampered';
    // Create record where responses has q01 correct (score 1/4), but scoreDTO has total '0' (tampered!)
    const tamperedRecord: AttemptRecord = {
      schemaVersion: 'web-attempt-v1',
      examId: SAMPLE_EXAM.examId,
      examVersionId: SAMPLE_EXAM.examVersionId,
      attemptId,
      revision: 2,
      candidateName: 'Thí sinh Thử Nghiệm',
      examSnapshot: SAMPLE_EXAM,
      presentationOrder: {
        questionOrder: ['q01', 'q02'],
        optionOrder: [],
        seed: 'original',
      },
      responses: {
        attemptId,
        examVersionId: SAMPLE_EXAM.examVersionId,
        responses: [
          { kind: 'I', questionVersionId: 'q01', selectedOptionId: 'opt-1a' },
          { kind: 'I', questionVersionId: 'q02', selectedOptionId: 'opt-2b' },
        ],
      },
      startedAt: Date.now() - 60000,
      deadline: Date.now() + 2940000,
      phase: 'final',
      submittedAt: Date.now() - 1000,
      // Tampered: total is '0' instead of recomputed '1/4'
      scoreDTO: {
        attemptId,
        examVersionId: SAMPLE_EXAM.examVersionId,
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        total: '0',
        maxTotal: '1/2',
        sections: {
          I: { score: '0', max: '1/2' },
          II: { score: '0', max: '0' },
          III: { score: '0', max: '0' },
        },
        questionScores: [
          { questionVersionId: 'q01', score: '0', max: '1/4' },
          { questionVersionId: 'q02', score: '0', max: '1/4' },
        ],
      },
    };
    await storage.create(tamperedRecord);

    const doc = createMockDocument();
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup = await bootstrap(root, {
      storageAdapter: adapter,
      initialExam: SAMPLE_EXAM,
    });

    // Check that UI detects and displays SCORE_MISMATCH error
    const syncText = root.querySelector('#syncText');
    assert.ok(syncText?.textContent?.includes('SCORE_MISMATCH'), 'syncText must report SCORE_MISMATCH error');

    const errBanner = root.querySelector('#integrityErrorBanner');
    assert.ok(errBanner, '#integrityErrorBanner must be rendered in DOM');
    assert.ok(errBanner?.textContent?.includes('SCORE_MISMATCH'), 'Integrity banner must contain SCORE_MISMATCH');

    const btnQuarantine = root.querySelector('#btnExportQuarantine');
    assert.ok(btnQuarantine, 'Quarantine export button must be present for data recovery');

    // Normal summary cards should be hidden
    const summaryGrid = root.querySelector('.summary-cards-grid') as HTMLElement;
    assert.equal(summaryGrid?.style?.display, 'none', 'Normal summary cards must not be displayed on SCORE_MISMATCH');

    cleanup();
  });
});
