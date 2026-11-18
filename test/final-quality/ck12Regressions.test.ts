import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore
import rawHttp from 'node:http';
// @ts-ignore
import rawFs from 'node:fs';
// @ts-ignore
import rawPath from 'node:path';

const http = rawHttp as any;
const fs = rawFs as any;
const path = rawPath as any;

import type { AttemptRecord, WebExam } from '../../src/schema/types.ts';
import { openStorage, MemoryTransactionAdapter } from '../../src/storage/index.ts';
import { bootstrap } from '../../src/app/main.ts';
import { createMockDocument, MockElement, MockEvent } from '../ui/core/dom-mock.ts';
import { toDomainExam } from '../../src/student/index.ts';
import { scoreAttempt, scoreResultToDTO } from '../../src/domain/index.ts';
import { CdpClient } from '../browser/cdp-client.ts';
import { detectCapabilities } from '../browser/capabilities.ts';

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

function createMockWindow() {
  const listeners = new Map<string, Set<Function>>();
  return {
    location: { hash: '' },
    addEventListener(event: string, fn: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    removeEventListener(event: string, fn: Function) {
      listeners.get(event)?.delete(fn);
    },
    dispatchEvent(event: any) {
      const set = listeners.get(event.type);
      if (set) {
        for (const fn of set) fn(event);
      }
      return true;
    },
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
    const mockWin = createMockWindow();
    (globalThis as any).window = mockWin;
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
      scoreDTO: null,
    };
    const domainExam = toDomainExam(SAMPLE_EXAM);
    const calculatedScore = scoreAttempt(domainExam, finalRecord.responses);
    const validDTO = scoreResultToDTO(calculatedScore);
    const fullFinalRecord = { ...finalRecord, scoreDTO: validDTO };

    const draftRecord: AttemptRecord = {
      ...fullFinalRecord,
      revision: 1,
      phase: 'draft',
      submittedAt: null,
      scoreDTO: null,
    };
    await storage.create(draftRecord);
    await storage.finalize(fullFinalRecord, 1);

    const doc = createMockDocument();
    (doc as any).createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
    (doc as any).getElementById = (id: string) => (doc as any).querySelector ? (doc as any).querySelector('#' + id) : null;
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
    mockWin.dispatchEvent(new MockEvent('storage', { key: finalKey, newValue: corruptPayload }) as any);

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
    (globalThis as any).window = createMockWindow();

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
    (doc as any).createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
    (doc as any).getElementById = (id: string) => (doc as any).querySelector ? (doc as any).querySelector('#' + id) : null;
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
    (optCard as any).dispatchEvent(new MockEvent('click'));

    // Submit exam
    const btnSubmit = root.querySelector('#btnSubmit');
    assert.ok(btnSubmit);
    (btnSubmit as any).dispatchEvent(new MockEvent('click'));

    const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit');
    assert.ok(btnConfirmSubmit);
    await (btnConfirmSubmit as any).dispatchEvent(new MockEvent('click'));

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
    (globalThis as any).window = createMockWindow();
    (globalThis as any).FileReader = MockFileReader;

    const doc = createMockDocument();
    (doc as any).createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
    (doc as any).getElementById = (id: string) => (doc as any).querySelector ? (doc as any).querySelector('#' + id) : null;
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
    (optCard as any).dispatchEvent(new MockEvent('click'));

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
    (globalThis as any).window = createMockWindow();

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
      scoreDTO: null,
    };
    const domainExam = toDomainExam(SAMPLE_EXAM);
    const calculatedScore = scoreAttempt(domainExam, tamperedRecord.responses);
    const validDTO = scoreResultToDTO(calculatedScore);
    const tamperedDTO = {
      ...(validDTO as Record<string, unknown>),
      total: '0', // Tampered: total is '0' instead of recomputed '1/4'
    };
    const fullTamperedRecord = { ...tamperedRecord, scoreDTO: tamperedDTO };

    const draftRecord: AttemptRecord = {
      ...fullTamperedRecord,
      revision: 1,
      phase: 'draft',
      submittedAt: null,
      scoreDTO: null,
    };
    await storage.create(draftRecord);
    await storage.finalize(fullTamperedRecord, 1);

    const doc = createMockDocument();
    (doc as any).createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
    (doc as any).getElementById = (id: string) => (doc as any).querySelector ? (doc as any).querySelector('#' + id) : null;
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

  it('CK14-F01: Integrity error on exam A does not destroy report shell DOM, allowing subsequent valid exam B to report and download', async () => {
    const mockStorage = createMockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    const mockWin = createMockWindow();
    (globalThis as any).window = mockWin;
    (globalThis as any).FileReader = MockFileReader;

    const adapter = new MemoryTransactionAdapter();
    const storageRes = await openStorage({ adapter, approveD03: true });
    assert.equal(storageRes.ok, true);
    if (!storageRes.ok) throw new Error('Storage open failed');
    const storage = storageRes.value;

    const attemptIdA = 'att-ck14-f01-tampered';
    const tamperedRecordA: AttemptRecord = {
      schemaVersion: 'web-attempt-v1',
      examId: SAMPLE_EXAM.examId,
      examVersionId: SAMPLE_EXAM.examVersionId,
      attemptId: attemptIdA,
      revision: 2,
      candidateName: 'Thí sinh A',
      examSnapshot: SAMPLE_EXAM,
      presentationOrder: {
        questionOrder: ['q01', 'q02'],
        optionOrder: [],
        seed: 'original',
      },
      responses: {
        attemptId: attemptIdA,
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
      scoreDTO: null,
    };
    const domainExamA = toDomainExam(SAMPLE_EXAM);
    const calculatedScoreA = scoreAttempt(domainExamA, tamperedRecordA.responses);
    const validDTOA = scoreResultToDTO(calculatedScoreA);
    const tamperedDTOA = {
      ...(validDTOA as Record<string, unknown>),
      total: '0', // Tampered!
    };
    const fullTamperedRecordA = { ...tamperedRecordA, scoreDTO: tamperedDTOA };

    const draftRecordA: AttemptRecord = {
      ...fullTamperedRecordA,
      revision: 1,
      phase: 'draft',
      submittedAt: null,
      scoreDTO: null,
    };
    await storage.create(draftRecordA);
    await storage.finalize(fullTamperedRecordA, 1);

    const doc = createMockDocument();
    (doc as any).createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
    (doc as any).getElementById = (id: string) => (doc as any).querySelector ? (doc as any).querySelector('#' + id) : null;
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup = await bootstrap(root, {
      storageAdapter: adapter,
      initialExam: SAMPLE_EXAM,
    });

    // Verify integrity error for exam A
    const syncText = root.querySelector('#syncText');
    assert.ok(syncText?.textContent?.includes('SCORE_MISMATCH'), 'syncText must show SCORE_MISMATCH error');
    assert.ok(root.querySelector('#integrityErrorBanner'), 'Integrity banner must be present for Exam A');

    // Switch to valid Exam B via #examFileInput
    const examFileInput = root.querySelector('#examFileInput') as any;
    assert.ok(examFileInput, '#examFileInput must exist');

    const mockFileB = {
      name: 'exam-b.json',
      text: async () => JSON.stringify(NEW_EXAM),
    };
    examFileInput.files = [mockFileB];
    examFileInput.dispatchEvent(new MockEvent('change', { target: examFileInput }));

    // Wait for FileReader
    await new Promise((resolve) => setTimeout(resolve, 50));

    // After switching to Exam B, integrity error banner must be cleared
    assert.equal(root.querySelector('#integrityErrorBanner'), null, 'Integrity banner must be cleared on exam switch');

    // Answer Question 1 of Exam B correctly
    const optB = root.querySelector('[data-qid="qnew-01"][data-option-id="opt-na"]');
    assert.ok(optB, 'Option opt-na of Exam B must be in DOM');
    (optB as any).dispatchEvent(new MockEvent('click'));

    // Submit Exam B
    const btnSubmit = root.querySelector('#btnSubmit');
    assert.ok(btnSubmit);
    (btnSubmit as any).dispatchEvent(new MockEvent('click'));

    const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit');
    assert.ok(btnConfirmSubmit);
    (btnConfirmSubmit as any).dispatchEvent(new MockEvent('click'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify Report view of Exam B is fully functional
    assert.equal(root.querySelector('#integrityErrorBanner'), null, 'Integrity banner must not remain on Exam B report');
    const scoreTotal = root.querySelector('#scoreTotal');
    assert.ok(scoreTotal, '#scoreTotal must still exist in DOM (not destroyed by Exam A)');
    assert.ok(scoreTotal?.textContent?.includes('0,25 / 0,25'), 'Exam B score must be rendered');

    const btnDownloadHtml = root.querySelector('#btnDownloadReportHtml');
    assert.ok(btnDownloadHtml, '#btnDownloadReportHtml must still exist in DOM');

    const btnDownloadJson = root.querySelector('#btnDownloadResultJson');
    assert.ok(btnDownloadJson, '#btnDownloadResultJson must still exist in DOM');

    assert.equal(syncText?.textContent, 'Đã nộp & lưu cục bộ');

    cleanup();
  });

  it('CK14-F02: Exported result JSON and CSV record immutable submittedAt and durationSeconds regardless of download delay', async () => {
    let mockTime = 1000000;
    const nowFn = () => mockTime;

    const mockStorage = createMockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).window = createMockWindow();

    const adapter = new MemoryTransactionAdapter();
    const doc = createMockDocument();
    (doc as any).createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
    (doc as any).getElementById = (id: string) => (doc as any).querySelector ? (doc as any).querySelector('#' + id) : null;
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup = await bootstrap(root, {
      storageAdapter: adapter,
      initialExam: SAMPLE_EXAM,
      now: nowFn,
    });

    // Started at t=1000000
    // Answer question 1
    const opt = root.querySelector('[data-qid="q01"][data-option-id="opt-1a"]');
    assert.ok(opt);
    (opt as any).dispatchEvent(new MockEvent('click'));

    // Advance time by 60 seconds (duration = 60s)
    mockTime += 60000; // t = 1060000

    // Submit exam at t = 1060000
    const btnSubmit = root.querySelector('#btnSubmit');
    (btnSubmit as any).dispatchEvent(new MockEvent('click'));
    const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit');
    (btnConfirmSubmit as any).dispatchEvent(new MockEvent('click'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Now advance time by another 10 seconds before downloading (t = 1070000)
    mockTime += 10000;

    let interceptedContent = '';
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (blob: any) => {
      if (typeof blob?.text === 'function') {
        blob.text().then((t: string) => { interceptedContent = t; });
      }
      return 'blob:mock-download';
    };

    // Download JSON at t = 1070000
    const btnDownloadJson = root.querySelector('#btnDownloadResultJson') as any;
    assert.ok(btnDownloadJson);
    btnDownloadJson.dispatchEvent(new MockEvent('click'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const json1 = JSON.parse(interceptedContent);
    assert.equal(json1.submittedAt, 1060000, 'JSON submittedAt must match submit timestamp (1060000), not download time');
    assert.equal(json1.durationSeconds, 60, 'durationSeconds must be 60s, not 70s');

    // Advance time by another 30 seconds (t = 1100000) and download JSON again
    mockTime += 30000;
    btnDownloadJson.dispatchEvent(new MockEvent('click'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const json2 = JSON.parse(interceptedContent);
    assert.equal(json2.submittedAt, 1060000, 'JSON submittedAt must remain immutable (1060000) across subsequent downloads');
    assert.equal(json2.durationSeconds, 60, 'durationSeconds must remain immutable (60s)');

    // Download CSV at t = 1100000
    const btnDownloadCsv = root.querySelector('#btnDownloadResultCsv') as any;
    assert.ok(btnDownloadCsv);
    btnDownloadCsv.dispatchEvent(new MockEvent('click'));
    await new Promise((resolve) => setTimeout(resolve, 20));

    const csvLines = interceptedContent.split('\r\n');
    assert.ok(csvLines.length >= 2, 'CSV must have header and data row');
    const dataRow = csvLines[1]!;
    assert.ok(dataRow.includes(new Date(1060000).toISOString()), 'CSV submitted_at must match submit timestamp');
    assert.ok(dataRow.includes('"60"'), 'CSV duration_seconds must be 60');

    URL.createObjectURL = origCreateObjectURL;
    cleanup();
  });

  async function enterExamIfRoleChooser(c: CdpClient) {
    const alreadyInExam = await c.evaluate<boolean>(`Boolean(document.querySelectorAll('.question-card').length > 0)`);
    if (alreadyInExam) return;
    await c.waitForSelector('#roleChooser, #startScreen, #studentNameGate, .question-card', 10000);
    const inExamNow = await c.evaluate<boolean>(`Boolean(document.querySelectorAll('.question-card').length > 0)`);
    if (inExamNow) return;
    const isChooser = await c.evaluate<boolean>(`Boolean(document.getElementById('roleChooser') && !document.getElementById('roleChooser').hidden && document.getElementById('roleChooser').style.display !== 'none')`);
    if (isChooser) {
      await c.click('#btnRoleStudent');
      await new Promise((r) => setTimeout(r, 200));
    }
    const isGate = await c.evaluate<boolean>(`Boolean(document.getElementById('studentNameGate') && document.getElementById('studentNameGate').style.display !== 'none')`);
    if (isGate) {
      await c.type('#startName', 'Thí sinh kiểm định');
      await c.click('#btnNameContinue');
      await new Promise((r) => setTimeout(r, 200));
    }
    const isPreview = await c.evaluate<boolean>(`Boolean(document.getElementById('examPreview') && document.getElementById('examPreview').style.display !== 'none')`);
    if (isPreview) {
      await c.waitForSelector('#btnStartExam:not([disabled])', 8000);
      await c.click('#btnStartExam');
    } else {
      const isStartScreen = await c.evaluate<boolean>(`Boolean(document.getElementById('startScreen') && document.getElementById('startScreen').style.display !== 'none')`);
      if (isStartScreen) {
        const examParam = await c.evaluate<string | null>(`new URLSearchParams(window.location.search).get('exam')`);
        const itemSelector = examParam
          ? `#startScreen .exam-list-item[data-exam-id="${examParam}"]`
          : '#startScreen .exam-list-item';
        const hasItem = await c.evaluate<boolean>(`Boolean(document.querySelector('${itemSelector}'))`);
        if (hasItem) {
          await c.waitForSelector(itemSelector, 10000);
          await c.click(itemSelector);
          await c.waitForSelector('#btnStartExam:not([disabled])', 8000);
          await c.click('#btnStartExam');
        } else {
          // §21: no public exams on #startScreen; load sample exam via hidden #examFileInput
          const { root } = await c.send('DOM.getDocument', { depth: 0 });
          const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#examFileInput' });
          if (nodeId) {
            let sampleFile = path.resolve('public/exams/samples/sample-toan.json');
            if (examParam) {
              if (examParam.includes('de-11') && fs.existsSync(path.resolve('public/exams/ly12/de11.json'))) {
                sampleFile = path.resolve('public/exams/ly12/de11.json');
              } else if (fs.existsSync(path.resolve('public/exams', examParam + '.json'))) {
                sampleFile = path.resolve('public/exams', examParam + '.json');
              }
            } else if (!fs.existsSync(sampleFile)) {
              sampleFile = path.resolve('public/exams/toan-full.json');
            }
            await c.send('DOM.setFileInputFiles', { nodeId, files: [sampleFile] });
            await c.evaluate(`document.getElementById('examFileInput')?.dispatchEvent(new Event('change', { bubbles: true }))`);
            await c.waitForSelector('.question-card', 10000);
          }
        }
      }
    }
  }

  it('CK15-F01: Service Worker version upgrade in real browser cleanly transitions release A to release B, preserving draft and offline capabilities', { timeout: 60000 }, async (t) => {
    const caps = detectCapabilities();
    if (!caps.preferredBrowserPath || !caps.tools.cdp) {
      t.skip('Headless browser unavailable');
      return;
    }

    const distDir = path.resolve('dist');
    if (!fs.existsSync(distDir)) {
      t.skip('dist directory does not exist');
      return;
    }

    // Prepare Release A and Release B payloads
    let serverRelease: 'A' | 'B' = 'A';
    const mainJsHead = fs.readFileSync(path.join(distDir, 'app/main.js'), 'utf8');
    const swHead = fs.readFileSync(path.join(distDir, 'service-worker.js'), 'utf8');

    const mainJsA = '/* RELEASE_A_MARKER */\n' + mainJsHead;
    const swA = swHead
      .replace(/cunata-cache-v-[a-f0-9]+/g, 'cunata-cache-v-release-a')
      .replace(/v-[a-f0-9]+/g, 'v-release-a');

    const server = http.createServer((req: any, res: any) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let pathname = decodeURIComponent(reqUrl.pathname);

        if (pathname.startsWith('/Cunata/')) {
          pathname = pathname.slice('/Cunata'.length);
        }
        if (pathname === '/' || pathname === '') {
          pathname = '/index.html';
        }

        const safeRel = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.join(distDir, safeRel);

        // Intercept service-worker.js and app/main.js depending on release version
        if (safeRel.endsWith('service-worker.js')) {
          res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(serverRelease === 'A' ? swA : swHead);
          return;
        }

        if (safeRel.endsWith('app/main.js') || safeRel.endsWith('app\\main.js')) {
          res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(serverRelease === 'A' ? mainJsA : mainJsHead);
          return;
        }

        if (fs.existsSync(fullPath)) {
          const ext = path.extname(fullPath).toLowerCase();
          const mime = ext === '.html' ? 'text/html; charset=utf-8'
            : ext === '.js' ? 'text/javascript; charset=utf-8'
            : ext === '.css' ? 'text/css; charset=utf-8'
            : ext === '.json' ? 'application/json; charset=utf-8'
            : ext === '.svg' ? 'image/svg+xml'
            : 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
          res.end(fs.readFileSync(fullPath));
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;
    const origin = `http://127.0.0.1:${port}`;

    let client: CdpClient | null = null;
    try {
      client = await CdpClient.launch({ width: 1280, height: 800 });

      // Step 1: Boot Release A
      console.log('CK15: Step 1 Boot Release A');
      await client.navigate(`${origin}/Cunata/`);
      await enterExamIfRoleChooser(client);
      const hasCards = await client.waitForSelector('.question-card', 10000);
      assert.ok(hasCards, 'App must boot and render cards for Release A');

      // Wait for service worker to activate
      console.log('CK15: Wait for SW A activate');
      await client.evaluate(`new Promise(resolve => {
        if (navigator.serviceWorker.controller) return resolve(true);
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true });
        setTimeout(() => resolve(false), 5000);
      })`);

      // Reload once to ensure worker caches Release A
      console.log('CK15: Reload once');
      await client.navigate(`${origin}/Cunata/`);
      await enterExamIfRoleChooser(client);
      await client.waitForSelector('.question-card', 10000);

      // Verify that browser fetch returns Release A
      console.log('CK15: Verify fetch Release A');
      const textA = await client.evaluate<string>(`fetch('./app/main.js').then(r => r.text())`);
      assert.ok(textA.includes('RELEASE_A_MARKER'), 'Browser fetch must initially return Release A module');

      // Candidate answers a question in Release A
      console.log('CK15: Candidate answers question');
      await client.type('#candidateName', 'Thí sinh kiểm định F01');
      const selectedOptionA = await client.evaluate<{ qid: string; optionId: string } | null>(`(() => {
        const opt = document.querySelector('.question-card [role="radio"]');
        if (opt) {
          opt.click();
          return {
            qid: opt.getAttribute('data-qid') || '',
            optionId: opt.getAttribute('data-option-id') || '',
          };
        }
        return null;
      })()`);
      assert.ok(selectedOptionA && selectedOptionA.qid && selectedOptionA.optionId, 'Must find and click a valid radio option');

      // Wait for local save using predicate on IndexedDB
      console.log('CK15: Wait for IDB save');
      const startPollA = Date.now();
      let draftRecordA: any = null;
      while (Date.now() - startPollA < 5000) {
        draftRecordA = await client.evaluate<any>(`new Promise((resolve, reject) => {
          const req = indexedDB.open('cunata-web');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('attempts', 'readonly');
            const store = tx.objectStore('attempts');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => resolve(getAllReq.result[0] || null);
            getAllReq.onerror = () => reject(getAllReq.error);
          };
        })`);
        const respList = draftRecordA?.responses?.responses;
        if (
          Array.isArray(respList) &&
          respList.some(
            (r: any) =>
              r.kind === 'I' &&
              r.questionVersionId === selectedOptionA.qid &&
              r.selectedOptionId === selectedOptionA.optionId
          )
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      assert.ok(draftRecordA, 'Draft record must exist in IndexedDB before upgrade');
      assert.equal(draftRecordA.candidateName, 'Thí sinh kiểm định F01');
      assert.equal(draftRecordA.phase, 'draft');
      assert.ok(draftRecordA.attemptId, 'Draft must have valid attemptId');
      assert.ok(draftRecordA.examVersionId, 'Draft must have valid examVersionId');
      assert.ok(Array.isArray(draftRecordA.responses?.responses), 'Draft responses array must exist');
      assert.ok(draftRecordA.responses.responses.length > 0, 'Draft responses array must not be empty');
      const respA = draftRecordA.responses.responses.find(
        (r: any) => r.kind === 'I' && r.questionVersionId === selectedOptionA.qid
      );
      assert.ok(respA, 'Draft responses must contain answered question');
      assert.equal(respA.selectedOptionId, selectedOptionA.optionId, 'Draft response must match selected option ID');

      // Step 2: Switch server to Release B and update worker
      console.log('CK15: Step 2 Switch server to B');
      serverRelease = 'B';
      const waitingReached = await client.evaluate<any>(`new Promise(resolve => {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (!reg) return resolve({ ok: false, reason: 'no-reg' });
          if (reg.waiting) return resolve({ ok: true, reason: 'already-waiting' });

          const log = [];
          const checkWorker = (w) => {
            if (!w) return;
            log.push('worker state: ' + w.state);
            if (w.state === 'installed') return resolve({ ok: true, reason: 'installed', log });
            w.addEventListener('statechange', () => {
              log.push('statechange: ' + w.state);
              if (w.state === 'installed' || reg.waiting) resolve({ ok: true, reason: 'statechange-installed', log });
              if (w.state === 'redundant') resolve({ ok: false, reason: 'redundant', log });
            });
          };

          if (reg.installing) {
            checkWorker(reg.installing);
          }

          reg.addEventListener('updatefound', () => {
            log.push('updatefound fired');
            checkWorker(reg.installing);
          });

          reg.update().then(() => log.push('reg.update resolved')).catch((e) => log.push('reg.update err: ' + e));

          const interval = setInterval(() => {
            if (reg.waiting || (reg.installing && reg.installing.state === 'installed')) {
              clearInterval(interval);
              resolve({ ok: true, reason: 'interval-waiting', log });
            }
          }, 100);

          setTimeout(() => {
            clearInterval(interval);
            resolve({ ok: !!reg.waiting, reason: 'timeout', waiting: !!reg.waiting, installing: reg.installing?.state, active: reg.active?.state, log });
          }, 15000);
        });
      })`);
      console.log('CK15 waitingReached debug:', JSON.stringify(waitingReached));
      assert.ok(waitingReached && waitingReached.ok, 'Release B Service Worker must download and install into waiting state');

      // Verify that while exam is in progress, old cache still exists
      console.log('CK15: Verify old cache retained');
      const currentCacheStillA = await client.evaluate<boolean>(`caches.has('cunata-cache-v-release-a')`);
      assert.ok(currentCacheStillA, 'Old cache cunata-cache-v-release-a must be retained while exam is in progress');

      // Assert draft record is intact while Release B is waiting
      console.log('CK15: Assert draft intact');
      const draftRecordWhileWaiting = await client.evaluate<any>(`new Promise((resolve, reject) => {
        const req = indexedDB.open('cunata-web');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('attempts', 'readonly');
          const store = tx.objectStore('attempts');
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => resolve(getAllReq.result[0] || null);
          getAllReq.onerror = () => reject(getAllReq.error);
        };
      })`);
      assert.deepEqual(draftRecordWhileWaiting.responses, draftRecordA.responses, 'Draft responses must remain intact while Release B is waiting');
      assert.equal(draftRecordWhileWaiting.candidateName, 'Thí sinh kiểm định F01');
      assert.equal(draftRecordWhileWaiting.attemptId, draftRecordA.attemptId, 'Attempt ID must remain unchanged');
      assert.equal(draftRecordWhileWaiting.examVersionId, draftRecordA.examVersionId, 'Exam version ID must remain unchanged');
      assert.equal(draftRecordWhileWaiting.deadline, draftRecordA.deadline, 'Deadline must remain unchanged');
      assert.deepEqual(draftRecordWhileWaiting.presentationOrder, draftRecordA.presentationOrder, 'Presentation order must remain unchanged');

      // Step 3: Complete exam
      console.log('CK15: Step 3 Complete exam');
      await client.click('#btnSubmit');
      await client.waitForSelector('#btnConfirmSubmit');
      await client.click('#btnConfirmSubmit');
      await client.waitForVisible('#reportWrapper', 10000);

      // Assert final record in IDB preserves responses
      console.log('CK15: Assert final record IDB');
      let finalRecord: any = null;
      const startFinalPoll = Date.now();
      while (Date.now() - startFinalPoll < 5000) {
        finalRecord = await client.evaluate<any>(`new Promise((resolve, reject) => {
          const req = indexedDB.open('cunata-web');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('attempts', 'readonly');
            const store = tx.objectStore('attempts');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => resolve(getAllReq.result[0] || null);
            getAllReq.onerror = () => reject(getAllReq.error);
          };
        })`);
        if (finalRecord?.phase === 'final') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(finalRecord, 'Final record must exist in IndexedDB');
      assert.equal(finalRecord.phase, 'final');
      assert.deepEqual(finalRecord.responses, draftRecordA.responses, 'Final record must preserve responses from draft');
      assert.equal(finalRecord.attemptId, draftRecordA.attemptId, 'Final record must preserve attemptId');
      assert.equal(finalRecord.examVersionId, draftRecordA.examVersionId, 'Final record must preserve examVersionId');

      // Step 4: Stop server IMMEDIATELY before reloading into Release B (test true offline cold boot)
      console.log('CK15: Step 4 Stop server');
      await new Promise<void>((resolve) => {
        (server as any).closeAllConnections?.();
        server.close(() => resolve());
      });

      // Step 5: Reload while server is down (full cold offline)
      console.log('CK15: Step 5 Reload offline');
      await client.navigate(`${origin}/Cunata/`);
      const pageInfo = await client.evaluate<any>(`({
        url: location.href,
        title: document.title,
        bodyHtml: document.body ? document.body.innerHTML.slice(0, 300) : '',
        swController: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.state : null,
      })`);
      console.log('PAGE INFO ON OFFLINE LOAD:', pageInfo);
      const offlineLoaded = await client.waitForVisible('#reportWrapper, .question-card, #startScreen, #roleChooser', 10000);
      assert.ok(offlineLoaded, 'Release B must cleanly boot cold offline without online reload first');

      // Verify that browser offline fetch returns Release B module from cache
      const textB = await client.evaluate<string>(`fetch('./app/main.js').then(r => r.text())`);
      assert.ok(!textB.includes('RELEASE_A_MARKER'), 'Browser offline fetch must return Release B module from cache');
    } finally {
      if (client) await client.close();
      await new Promise<void>((resolve) => {
        (server as any).closeAllConnections?.();
        server.close(() => resolve());
      });
    }
  });

  it('CK16-F01: Multi-tab exam isolation: Submitting tab A does not activate new Service Worker on in-progress tab B', { timeout: 60000 }, async (t) => {
    const caps = detectCapabilities();
    if (!caps.preferredBrowserPath || !caps.tools.cdp) {
      t.skip('Headless browser unavailable');
      return;
    }

    const distDir = path.resolve('dist');
    if (!fs.existsSync(distDir)) {
      t.skip('dist directory does not exist');
      return;
    }

    let serverRelease: 'A' | 'B' = 'A';
    const mainJsHead = fs.readFileSync(path.join(distDir, 'app/main.js'), 'utf8');
    const swHead = fs.readFileSync(path.join(distDir, 'service-worker.js'), 'utf8');

    const mainJsA = '/* RELEASE_A_MARKER */\n' + mainJsHead;
    const swA = swHead
      .replace(/cunata-cache-v-[a-f0-9]+/g, 'cunata-cache-v-release-a')
      .replace(/v-[a-f0-9]+/g, 'v-release-a');

    const server = http.createServer((req: any, res: any) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        let pathname = decodeURIComponent(reqUrl.pathname);

        if (pathname.startsWith('/Cunata/')) {
          pathname = pathname.slice('/Cunata'.length);
        }
        if (pathname === '/' || pathname === '') {
          pathname = '/index.html';
        }

        const safeRel = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
        const fullPath = path.join(distDir, safeRel);

        if (safeRel.endsWith('service-worker.js')) {
          res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(serverRelease === 'A' ? swA : swHead);
          return;
        }

        if (safeRel.endsWith('app/main.js') || safeRel.endsWith('app\\main.js')) {
          res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
          res.end(serverRelease === 'A' ? mainJsA : mainJsHead);
          return;
        }

        if (fs.existsSync(fullPath)) {
          const ext = path.extname(fullPath).toLowerCase();
          const mime = ext === '.html' ? 'text/html; charset=utf-8'
            : ext === '.js' ? 'text/javascript; charset=utf-8'
            : ext === '.css' ? 'text/css; charset=utf-8'
            : ext === '.json' ? 'application/json; charset=utf-8'
            : ext === '.svg' ? 'image/svg+xml'
            : 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' });
          res.end(fs.readFileSync(fullPath));
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;
    const origin = `http://127.0.0.1:${port}`;

    let clientA: CdpClient | null = null;
    let clientB: CdpClient | null = null;
    try {
      clientA = await CdpClient.launch({ width: 1280, height: 800 });

      // Tab A: Opens sample exam under Release A
      await clientA.navigate(`${origin}/Cunata/`);
      await enterExamIfRoleChooser(clientA);
      await clientA.waitForSelector('.question-card', 10000);

      // Wait for service worker to activate
      await clientA.evaluate(`new Promise(resolve => {
        if (navigator.serviceWorker.controller) return resolve(true);
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(true), { once: true });
        setTimeout(() => resolve(false), 5000);
      })`);

      // Reload Tab A to ensure Release A worker controls it
      await clientA.navigate(`${origin}/Cunata/`);
      await enterExamIfRoleChooser(clientA);
      await clientA.waitForSelector('.question-card', 10000);

      // Tab A: Fill name and answer
      await clientA.type('#candidateName', 'Thí sinh Tab A');
      const selectedA = await clientA.evaluate<{ qid: string; optionId: string } | null>(`(() => {
        const opt = document.querySelector('.question-card [role="radio"]');
        if (opt) {
          opt.click();
          return {
            qid: opt.getAttribute('data-qid') || '',
            optionId: opt.getAttribute('data-option-id') || '',
          };
        }
        return null;
      })()`);
      assert.ok(selectedA && selectedA.qid && selectedA.optionId, 'Tab A must click radio option');
      await new Promise((r) => setTimeout(r, 500));

      // Tab B: Open second tab in the SAME browser instance with a different exam
      clientB = await clientA.createTab();
      await clientB.navigate(`${origin}/Cunata/?exam=ly12-hang-tuan-de-11`);
      await enterExamIfRoleChooser(clientB);
      await clientB.waitForSelector('.question-card', 10000);

      // Tab B: Fill name and answer
      await clientB.type('#candidateName', 'Thí sinh Tab B');
      const selectedB = await clientB.evaluate<{ qid: string; optionId: string } | null>(`(() => {
        const opt = document.querySelector('.question-card [role="radio"]');
        if (opt) {
          opt.click();
          return {
            qid: opt.getAttribute('data-qid') || '',
            optionId: opt.getAttribute('data-option-id') || '',
          };
        }
        return null;
      })()`);
      assert.ok(selectedB && selectedB.qid && selectedB.optionId, 'Tab B must click radio option');

      // Track controller changes on Tab B
      await clientB.evaluate(`(() => {
        window.__controllerChanges = 0;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.__controllerChanges++;
        });
      })()`);

      // Verify IDB has two drafts (one for each exam) with actual non-empty responses
      const startDraftsPoll = Date.now();
      let allDrafts: any[] = [];
      let draftBInitial: any = null;
      while (Date.now() - startDraftsPoll < 5000) {
        allDrafts = await clientB.evaluate<any[]>(`new Promise((resolve, reject) => {
          const req = indexedDB.open('cunata-web');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('attempts', 'readonly');
            const store = tx.objectStore('attempts');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => resolve(getAllReq.result || []);
            getAllReq.onerror = () => reject(getAllReq.error);
          };
        })`);
        draftBInitial = allDrafts.find((d: any) => d.candidateName === 'Thí sinh Tab B');
        const bResp = draftBInitial?.responses?.responses;
        if (
          allDrafts.length >= 2 &&
          Array.isArray(bResp) &&
          bResp.some(
            (r: any) =>
              r.kind === 'I' &&
              r.questionVersionId === selectedB.qid &&
              r.selectedOptionId === selectedB.optionId
          )
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.equal(allDrafts.length, 2, 'IndexedDB must contain two separate attempt records for Tab A and Tab B');
      assert.ok(draftBInitial, 'Draft B must exist in IndexedDB');
      assert.equal(draftBInitial.phase, 'draft');
      assert.ok(Array.isArray(draftBInitial.responses?.responses), 'Draft B responses must be an array');
      assert.ok(draftBInitial.responses.responses.length > 0, 'Draft B responses must not be empty');
      const bRespEntry = draftBInitial.responses.responses.find(
        (r: any) => r.kind === 'I' && r.questionVersionId === selectedB.qid
      );
      assert.ok(bRespEntry, 'Draft B must contain answered question');
      assert.equal(bRespEntry.selectedOptionId, selectedB.optionId, 'Draft B response must match clicked option ID');

      // Switch server to Release B and trigger Service Worker update
      serverRelease = 'B';
      const waitingReached = await clientA.evaluate<boolean>(`new Promise(resolve => {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (!reg) return resolve(false);
          if (reg.waiting) return resolve(true);

          const checkWorker = (w) => {
            if (!w) return;
            if (w.state === 'installed') return resolve(true);
            w.addEventListener('statechange', () => {
              if (w.state === 'installed' || reg.waiting) resolve(true);
            });
          };

          if (reg.installing) checkWorker(reg.installing);
          reg.addEventListener('updatefound', () => checkWorker(reg.installing));
          reg.update().catch(() => {});

          const interval = setInterval(() => {
            if (reg.waiting || (reg.installing && reg.installing.state === 'installed')) {
              clearInterval(interval);
              resolve(true);
            }
          }, 100);

          setTimeout(() => {
            clearInterval(interval);
            resolve(!!reg.waiting);
          }, 8000);
        });
      })`);
      assert.ok(waitingReached, 'Release B worker must be installed into waiting state');

      // Now SUBMIT Tab A ONLY! Tab B is STILL in progress!
      await clientA.click('#btnSubmit');
      await clientA.waitForSelector('#btnConfirmSubmit');
      await clientA.click('#btnConfirmSubmit');
      await clientA.waitForVisible('#reportWrapper', 10000);

      // Wait a moment for any message exchanges to settle
      await new Promise((r) => setTimeout(r, 600));

      // Assert Tab B status:
      // 1. Controller must NOT change on Tab B!
      const controllerChangesOnB = await clientB.evaluate<number>(`window.__controllerChanges`);
      assert.equal(controllerChangesOnB, 0, 'Tab B must NOT experience controllerchange when Tab A submits');

      // 2. Release A cache must NOT be deleted while Tab B is active!
      const cacheAExists = await clientB.evaluate<boolean>(`caches.has('cunata-cache-v-release-a')`);
      assert.ok(cacheAExists, 'Old cache cunata-cache-v-release-a must be retained while Tab B is in progress');

      // 3. Tab B draft in IndexedDB must remain untouched
      const draftBAfterSubmitA = await clientB.evaluate<any>(`new Promise((resolve, reject) => {
        const req = indexedDB.open('cunata-web');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('attempts', 'readonly');
          const store = tx.objectStore('attempts');
          const getAllReq = store.getAll();
          getAllReq.onsuccess = () => resolve(getAllReq.result.find((d) => d.candidateName === 'Thí sinh Tab B') || null);
          getAllReq.onerror = () => reject(getAllReq.error);
        };
      })`);
      assert.ok(draftBAfterSubmitA, 'Draft B must still exist in IndexedDB');
      assert.equal(draftBAfterSubmitA.phase, 'draft');
      assert.deepEqual(draftBAfterSubmitA.responses, draftBInitial.responses, 'Draft B responses must remain identical');
      assert.equal(draftBAfterSubmitA.deadline, draftBInitial.deadline, 'Draft B deadline must remain identical');
      assert.equal(draftBAfterSubmitA.attemptId, draftBInitial.attemptId, 'Draft B attemptId must remain identical');
      assert.equal(draftBAfterSubmitA.examVersionId, draftBInitial.examVersionId, 'Draft B examVersionId must remain identical');

      // Now SUBMIT Tab B as well
      await clientB.click('#btnSubmit');
      await clientB.waitForSelector('#btnConfirmSubmit');
      await clientB.click('#btnConfirmSubmit');
      await clientB.waitForVisible('#reportWrapper', 10000);

      // Verify Tab B final record in IDB is durable
      let finalBRecord: any = null;
      const startFinalBPoll = Date.now();
      while (Date.now() - startFinalBPoll < 5000) {
        finalBRecord = await clientB.evaluate<any>(`new Promise((resolve, reject) => {
          const req = indexedDB.open('cunata-web');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('attempts', 'readonly');
            const store = tx.objectStore('attempts');
            const getAllReq = store.getAll();
            getAllReq.onsuccess = () => resolve(getAllReq.result.find((d) => d.candidateName === 'Thí sinh Tab B') || null);
            getAllReq.onerror = () => reject(getAllReq.error);
          };
        })`);
        if (finalBRecord?.phase === 'final') break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(finalBRecord, 'Final record for Tab B must exist in IndexedDB');
      assert.equal(finalBRecord.phase, 'final');
      assert.deepEqual(finalBRecord.responses, draftBInitial.responses, 'Tab B final record must preserve responses');

      // Now that BOTH tabs are submitted, Release B worker can activate safely.
      // Poll with deadline (up to 15s) for worker activation and cache update
      const startActivationWait = Date.now();
      let activated = false;
      while (Date.now() - startActivationWait < 15000) {
        const swState = await clientA.evaluate<{ waiting: boolean; activeState: string | null }>(`new Promise(resolve => {
          navigator.serviceWorker.getRegistration().then(reg => {
            if (!reg) return resolve({ waiting: false, activeState: null });
            resolve({
              waiting: !!reg.waiting,
              activeState: reg.active ? reg.active.state : null,
            });
          });
        })`);
        if (!swState.waiting && swState.activeState === 'activated') {
          activated = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.ok(activated, 'Release B worker must cleanly activate once all tabs finish their exams');

      // Also verify that Release B cache is created
      const cacheKeys = await clientA.evaluate<string[]>(`caches.keys()`);
      const hasNewCache = cacheKeys.some((k) => k.startsWith('cunata-cache-v-') && k !== 'cunata-cache-v-release-a');
      assert.ok(hasNewCache, 'New cache must exist after activation');
    } finally {
      if (clientB) await clientB.close();
      if (clientA) await clientA.close();
      await new Promise<void>((resolve) => {
        (server as any).closeAllConnections?.();
        server.close(() => resolve());
      });
    }
  });

  it('CK16-F03: CdpClient.evaluate throws on browser JavaScript SyntaxError and exceptionDetails', async (t) => {
    const caps = detectCapabilities();
    if (!caps.preferredBrowserPath || !caps.tools.cdp) {
      t.skip('Headless browser unavailable');
      return;
    }

    let client: CdpClient | null = null;
    try {
      client = await CdpClient.launch({ width: 800, height: 600 });

      // Test 1: SyntaxError with 'as' TypeScript identifier must throw Error
      let threwSyntax = false;
      try {
        await client.evaluate(`(() => { const x = 1 as any; return x; })()`);
      } catch (err: any) {
        threwSyntax = true;
        assert.ok(
          err.message.includes('SyntaxError') || err.message.includes('Unexpected identifier'),
          `Error message must mention SyntaxError or unexpected identifier: ${err.message}`
        );
      }
      assert.ok(threwSyntax, 'client.evaluate must throw when evaluated code contains SyntaxError');

      // Test 2: Valid expression returning undefined must resolve to undefined without error
      const undefinedVal = await client.evaluate<any>(`(() => { const a = 1; })()`);
      assert.equal(undefinedVal, undefined);

      // Test 3: Valid expression returning value
      const sum = await client.evaluate<number>(`2 + 3`);
      assert.equal(sum, 5);
    } finally {
      if (client) await client.close();
    }
  });

  it('CK18-F01: Negative control verifies that draft assertion strictly fails when candidate answers are disabled or empty', async () => {
    // Envelope with empty responses (simulates candidate not answering or save disabled)
    const blankEnvelope = {
      attemptId: 'attempt-test-f01',
      examVersionId: 'v1.0.0',
      responses: [],
    };

    // 1. The old flawed assertion: Object.keys(draftRecordA.responses || {}).length > 0 was passing even for responses: []
    const oldFlawedCheck = Object.keys(blankEnvelope || {}).length > 0;
    assert.equal(oldFlawedCheck, true, 'Old check was flawed because Object.keys on envelope was > 0 even when empty');

    // 2. The corrected assertion: must verify array existence and non-zero length of responses
    const correctedCheck = Array.isArray(blankEnvelope.responses) && blankEnvelope.responses.length > 0;
    assert.equal(correctedCheck, false, 'Corrected check must return false for blank response envelope');

    // 3. Negative control assertion throws AssertionError if empty
    assert.throws(
      () => {
        assert.ok(
          Array.isArray(blankEnvelope.responses) && blankEnvelope.responses.length > 0,
          'Draft responses array must not be empty'
        );
      },
      /Draft responses array must not be empty/
    );

    // 4. Positive control: populated envelope with valid question response
    const validEnvelope = {
      attemptId: 'attempt-test-f01',
      examVersionId: 'v1.0.0',
      responses: [
        { kind: 'I', questionVersionId: 'q-test-1', selectedOptionId: 'opt-a' },
      ],
    };
    assert.ok(
      Array.isArray(validEnvelope.responses) && validEnvelope.responses.length > 0,
      'Populated envelope must pass non-empty assertion'
    );
    const resp = validEnvelope.responses.find(
      (r: any) => r.kind === 'I' && r.questionVersionId === 'q-test-1'
    );
    assert.ok(resp, 'Must find matching question response');
    assert.equal(resp.selectedOptionId, 'opt-a');
  });

  it('CK37-F01 regression: past due assignment A does not corrupt draft creation in storage for practice exam B in bootstrap', async () => {
    const mockStorage = createMockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).window = createMockWindow();
    (globalThis as any).FileReader = MockFileReader;

    const adapter = new MemoryTransactionAdapter();
    const storageRes = await openStorage({ adapter, approveD03: true });
    assert.ok(storageRes.ok);
    const storage = storageRes.value;

    let currentTime = 1700000000000;
    const now = () => currentTime;

    const openTime = new Date(currentTime - 60000).toISOString();
    const dueTime = new Date(currentTime + 12000).toISOString();

    const examA: WebExam = {
      ...SAMPLE_EXAM,
      examId: 'exam-ck37-A',
      examVersionId: 'v1.0.0',
      title: 'Đề bài giao A',
      classCode: '12A1',
      assignmentId: 'asg-A',
      openAt: openTime,
      dueAt: dueTime,
    } as any;

    const examB: WebExam = {
      ...SAMPLE_EXAM,
      examId: 'exam-ck37-B',
      examVersionId: 'v1.0.0',
      title: 'Đề luyện tập B',
      questions: [
        {
          kind: 'III',
          questionVersionId: 'q-b3',
          title: 'Câu 1',
          content: 'Nhập đáp án',
          answerKey: '1,5',
        },
      ],
    };

    // 1. Mount UI and bootstrap directly with assigned Exam A
    const doc = createMockDocument();
    (doc as any).createElementNS = (_ns: string, tag: string) => doc.createElement(tag);
    (doc as any).getElementById = (id: string) => (doc as any).querySelector ? (doc as any).querySelector('#' + id) : null;
    const root = doc.createElement('div') as unknown as HTMLElement;
    doc.body.appendChild(root as unknown as MockElement);

    const cleanup = await bootstrap(root, {
      storageAdapter: adapter,
      initialExam: examA,
      now,
    });

    try {
      // 2. Answer question 1 and submit Exam A through real UI controls
      const optCard = root.querySelector('[data-qid="q01"][data-option-id="opt-1a"]');
      assert.ok(optCard, 'Exam A option opt-1a must exist in DOM');
      (optCard as any).dispatchEvent(new MockEvent('click'));

      const btnSubmit = root.querySelector('#btnSubmit');
      assert.ok(btnSubmit, '#btnSubmit must exist');
      (btnSubmit as any).dispatchEvent(new MockEvent('click'));

      const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit');
      assert.ok(btnConfirmSubmit, '#btnConfirmSubmit must exist');
      (btnConfirmSubmit as any).dispatchEvent(new MockEvent('click'));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Exam A is finalized; finalRecord is present in closure
      const listA = await storage.listAttempts(examA.examId, examA.examVersionId);
      assert.ok(listA.ok);
      const finalsA = listA.value.filter((a) => a.phase === 'final');
      assert.equal(finalsA.length, 1, 'Exam A must be finalized in storage');

      // 3. Advance clock past dueAt of assignment A (+ 15 seconds)
      currentTime += 15000;

      // 4. Switch to practice exam B in the same bootstrap session via #examFileInput
      const examFileInput = root.querySelector('#examFileInput') as any;
      assert.ok(examFileInput, '#examFileInput must exist in DOM');

      const mockFile = {
        name: 'practice-b.json',
        text: async () => JSON.stringify(examB),
      };
      examFileInput.files = [mockFile];
      examFileInput.dispatchEvent(new MockEvent('change', { target: examFileInput }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 5. Input '1,5' into Exam B short answer field
      const inputIII = root.querySelector('.short-answer-input') as any;
      assert.ok(inputIII, 'Exam B Part III input must exist in DOM');
      inputIII.value = '1,5';
      inputIII.dispatchEvent(new MockEvent('input', { target: inputIII }));
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 6. Check IndexedDB attempts store for exam B draft created before reload
      const listRes = await storage.listAttempts(examB.examId, examB.examVersionId);
      assert.ok(listRes.ok);
      const draftsB = listRes.value.filter((a) => a.phase === 'draft');
      assert.equal(draftsB.length, 1, 'Durable draft for Exam B must be created in storage before reload');
      const draft0 = draftsB[0];
      assert.ok(draft0);
      assert.equal(draft0.phase, 'draft');
      assert.equal(draft0.dueAt, undefined, 'Exam B draft must not inherit Exam A dueAt');
      assert.equal(draft0.assignmentId, undefined, 'Exam B draft must not inherit Exam A assignmentId');
      const resp = draft0.responses.responses[0] as any;
      assert.ok(resp, 'Exam B draft must have responses');
      assert.equal(resp.raw, '1,5', 'Exam B draft must store raw input 1,5');
    } finally {
      cleanup();
    }
  });

  it('CK38-F01 regression: Apps Script 8-hour session lifetime, cache-miss fallback from PropertiesService, and credential revocation', async () => {
    const { makeGas } = await (Function('return import("../claude-check/gas-fake.mjs")')() as Promise<any>);
    const g = makeGas();

    // 1. Admin login and verify advertised 8-hour expiration
    const adminLogin = g.post({ action: 'adminLogin', password: 'Admin-Cunata-2026' });
    assert.equal(adminLogin.success, true, 'Admin login must succeed');
    const advertisedMs = Date.parse(adminLogin.expiresAt) - Date.now();
    assert.ok(Math.abs(advertisedMs - 8 * 3600 * 1000) < 5000, 'Session must advertise 8 hours lifetime');

    // 2. Create teacher and teacher login
    g.post({
      action: 'adminCreateTeacher',
      token: adminLogin.token,
      name: 'Cô Lan',
      username: 'colan',
      password: 'MatKhau-Lan-01',
    });
    const teacherLogin = g.post({
      action: 'teacherLogin',
      username: 'colan',
      password: 'MatKhau-Lan-01',
    });
    assert.equal(teacherLogin.success, true, 'Teacher login must succeed');

    // 3. Time probe: 0h, 5.999h, 6h + 1s (cache miss), 7.99h (near expiry), 8h + 1s (expired)
    const realNow = Date.now;
    try {
      // 0h: both valid
      Date.now = () => realNow();
      assert.equal(g.post({ action: 'adminStats', token: adminLogin.token }).success, true);
      assert.equal(g.post({ action: 'listMyClasses', token: teacherLogin.token }).success, true);

      // 5.999h: both valid
      Date.now = () => realNow() + 5.999 * 3600 * 1000;
      assert.equal(g.post({ action: 'adminStats', token: adminLogin.token }).success, true);
      assert.equal(g.post({ action: 'listMyClasses', token: teacherLogin.token }).success, true);

      // 6h + 1s: beyond CacheService TTL (21600s), restored from PropertiesService
      Date.now = () => realNow() + (6 * 3600 + 1) * 1000;
      assert.equal(g.post({ action: 'adminStats', token: adminLogin.token }).success, true, 'Admin session must remain valid after 6h via durable session record');
      assert.equal(g.post({ action: 'listMyClasses', token: teacherLogin.token }).success, true, 'Teacher session must remain valid after 6h via durable session record');

      // 7h 59m: both valid before 8h
      Date.now = () => realNow() + (7 * 3600 + 59 * 60) * 1000;
      assert.equal(g.post({ action: 'adminStats', token: adminLogin.token }).success, true);
      assert.equal(g.post({ action: 'listMyClasses', token: teacherLogin.token }).success, true);

      // 8h + 1s: rejected as UNAUTHORIZED at expiresAt
      Date.now = () => realNow() + (8 * 3600 + 1) * 1000;
      assert.equal(g.post({ action: 'adminStats', token: adminLogin.token }).error, 'UNAUTHORIZED', 'Admin session must be rejected at expiresAt');
      assert.equal(g.post({ action: 'listMyClasses', token: teacherLogin.token }).error, 'UNAUTHORIZED', 'Teacher session must be rejected at expiresAt');
    } finally {
      Date.now = realNow;
    }

    // 4. Cache wipe before expiresAt restores valid session from PropertiesService
    const freshTeacherLogin = g.post({
      action: 'teacherLogin',
      username: 'colan',
      password: 'MatKhau-Lan-01',
    });
    assert.equal(freshTeacherLogin.success, true);
    g.cache.clear();
    assert.equal(g.cache.size, 0);
    const teacherClasses = g.post({ action: 'listMyClasses', token: freshTeacherLogin.token });
    assert.equal(teacherClasses.success, true, 'Wiping cache must restore valid session from PropertiesService');
    assert.ok(g.cache.has('session:' + freshTeacherLogin.token), 'Cache must be repopulated after restore');

    // 5. Credential changes revoke active session immediately
    // 5a. Password reset
    g.post({
      action: 'adminResetPassword',
      token: adminLogin.token,
      username: 'colan',
      password: 'MatKhau-Moi-Lan-02',
    });
    assert.equal(g.post({ action: 'listMyClasses', token: freshTeacherLogin.token }).error, 'UNAUTHORIZED', 'Password reset must revoke session token');

    // 5b. Account lock
    const login3 = g.post({
      action: 'teacherLogin',
      username: 'colan',
      password: 'MatKhau-Moi-Lan-02',
    });
    assert.equal(login3.success, true);
    g.post({ action: 'adminSetTeacherActive', token: adminLogin.token, username: 'colan', active: false });
    assert.equal(g.post({ action: 'listMyClasses', token: login3.token }).error, 'UNAUTHORIZED', 'Account lock must revoke session token');

    // 5c. Admin password change
    const adminLogin2 = g.post({ action: 'adminLogin', password: 'Admin-Cunata-2026' });
    assert.equal(adminLogin2.success, true);
    g.props.set('ADMIN_PASSWORD', 'New-Admin-Password-2026');
    assert.equal(g.post({ action: 'adminStats', token: adminLogin2.token }).error, 'UNAUTHORIZED', 'Admin password change must revoke admin session token');
  });
});
