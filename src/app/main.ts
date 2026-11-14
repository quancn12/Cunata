/**
 * Cunata Web M2-M6 — Composition Root & Application Bootstrap
 * Conforms to WEB-contract.md §2, §3, §5, §10 and Shared Product Contract v2.0.
 */

import type { StoragePort, StorageTransactionAdapter } from '../storage/index.ts';
import { openStorage } from '../storage/index.ts';
import type { WebExam, AttemptKey, AttemptRecord } from '../schema/index.ts';
import { parseExam } from '../schema/index.ts';
import type { StudentController } from '../student/index.ts';
import { startAttempt, resumeAttempt } from '../student/index.ts';
import type { ReportModel } from '../report/index.ts';
import { buildReport, renderReportHtml } from '../report/index.ts';
import { createStatusAnnouncer, announceStatus, openModal } from '../ui/index.ts';
import type { AppRoute, Router, RouteState } from './routes.ts';
import { createRouter } from './routes.ts';

export interface BootstrapOptions {
  storageAdapter?: StorageTransactionAdapter;
  now?: () => number;
  id?: () => string;
  initialRoute?: AppRoute;
  initialExam?: WebExam;
}

export interface AppContext {
  storage: StoragePort;
  router: Router;
  now: () => number;
  id: () => string;
  controller: StudentController | null;
  currentExam: WebExam | null;
  activeReport: ReportModel | null;
  announcer: ReturnType<typeof createStatusAnnouncer> | null;
}

const DEFAULT_SAMPLE_EXAM: WebExam = {
  schemaVersion: 'web-exam-v1',
  examId: 'cunata-toan-gdpt-2018',
  examVersionId: 'v1.0.0',
  ruleSetId: 'custom-v1',
  inputPolicyId: 'sa-charset-v1',
  title: 'Đề Khảo Sát Năng Lực Môn Toán — GDPT 2018 (Minh Họa)',
  subject: 'Toán học',
  grade: 12,
  settings: {
    durationMinutes: 50,
    maxAttempts: null,
    releasePolicy: 'immediate',
    shuffleQuestions: false,
    shuffleOptions: false,
  },
  questions: [],
  assets: [],
};

function ensureShellStructure(root: HTMLElement): void {
  if (root.querySelector('#examTitle') && root.querySelector('#examPane')) {
    return;
  }

  const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;

  const createEl = (tag: string, id?: string, className?: string): HTMLElement => {
    const el = doc.createElement(tag) as HTMLElement;
    if (id) el.id = id;
    if (className) el.className = className;
    return el;
  };

  const header = createEl('header', undefined, 'app-header');
  const title = createEl('div', 'examTitle', 'exam-meta-title');
  title.textContent = 'Đang tải đề thi...';
  const candInput = createEl('input', 'candidateName', 'candidate-input') as HTMLInputElement;
  candInput.value = 'Thí sinh tự do';
  const syncStatus = createEl('div', 'syncStatus', 'sync-status-badge');
  const syncText = createEl('span', 'syncText');
  syncText.textContent = 'Chưa lưu';
  syncStatus.appendChild(syncText);
  const timerBox = createEl('div', 'timerBox', 'timer-box');
  timerBox.textContent = '50:00';
  const btnSubmit = createEl('button', 'btnSubmit', 'btn-submit');
  btnSubmit.textContent = 'Nộp bài';
  header.appendChild(title);
  header.appendChild(candInput);
  header.appendChild(syncStatus);
  header.appendChild(timerBox);
  header.appendChild(btnSubmit);

  const examWrapper = createEl('div', 'examWrapper', 'main-wrapper');
  const paletteProgress = createEl('div', 'paletteProgress');
  const paletteGrid = createEl('div', 'paletteGrid', 'palette-grid');
  const examPane = createEl('div', 'examPane', 'exam-pane');
  examWrapper.appendChild(paletteProgress);
  examWrapper.appendChild(paletteGrid);
  examWrapper.appendChild(examPane);

  const reportWrapper = createEl('div', 'reportWrapper', 'report-wrapper');
  reportWrapper.style.display = 'none';
  const reportView = createEl('div', 'reportView', 'report-container');
  reportWrapper.appendChild(reportView);

  const submitModal = createEl('div', 'submitModal', 'modal-overlay');
  submitModal.style.display = 'none';
  const btnConfirmSubmit = createEl('button', 'btnConfirmSubmit');
  const btnCancelSubmit = createEl('button', 'btnCancelSubmit');
  submitModal.appendChild(btnConfirmSubmit);
  submitModal.appendChild(btnCancelSubmit);

  const builderModal = createEl('div', 'builderModal', 'modal-overlay');
  builderModal.style.display = 'none';
  const btnCloseBuilder = createEl('button', 'btnCloseBuilder');
  builderModal.appendChild(btnCloseBuilder);

  const bankModal = createEl('div', 'bankModal', 'modal-overlay');
  bankModal.style.display = 'none';
  const btnCloseBank = createEl('button', 'btnCloseBank');
  bankModal.appendChild(btnCloseBank);

  root.appendChild(header);
  root.appendChild(examWrapper);
  root.appendChild(reportWrapper);
  root.appendChild(submitModal);
  root.appendChild(builderModal);
  root.appendChild(bankModal);
}

export async function bootstrap(
  root: HTMLElement,
  options?: BootstrapOptions
): Promise<() => void> {
  if (!root || (typeof HTMLElement !== 'undefined' && !(root instanceof HTMLElement)) || typeof root.querySelector !== 'function') {
    throw new Error('Root element must be a valid HTMLElement');
  }

  ensureShellStructure(root);

  const now = options?.now ?? (() => Date.now());
  const idGen = options?.id ?? (() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'id-' + Math.random().toString(36).slice(2, 10);
  });

  const storageRes = await openStorage(options?.storageAdapter);
  if (!storageRes.ok && options?.storageAdapter) {
    console.warn('[Bootstrap] Injected storage unavailable, operating with in-memory fallback:', storageRes.error);
  }
  const storage: StoragePort = storageRes.ok
    ? storageRes.value
    : {
        async load() { return { ok: true, value: null }; },
        async create(rec) { return { ok: true, value: rec }; },
        async saveDraft(rec) { return { ok: true, value: rec }; },
        async finalize(rec) { return { ok: true, value: rec }; },
        async listAttempts() { return { ok: true, value: [] }; },
        async getObject() { return { ok: true, value: null }; },
        async putObject() { return { ok: true, value: 1 }; },
        async deleteObject() { return { ok: true, value: undefined }; },
        async getOutbox() { return { ok: true, value: null }; },
        async updateOutbox(val) { return { ok: true, value: val }; },
        async exportBackup() { return { ok: true, value: new Blob([]) }; },
        async importBackup() { return { ok: true, value: undefined }; },
        async clearAll() { return { ok: true, value: undefined }; },
      };

  const router = createRouter(options?.initialRoute ?? 'exam');
  const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  let announcer: ReturnType<typeof createStatusAnnouncer> | null = null;
  if (doc) {
    try {
      announcer = createStatusAnnouncer({ document: doc as Document });
    } catch {
      announcer = null;
    }
  }

  const ctx: AppContext = {
    storage,
    router,
    now,
    id: idGen,
    controller: null,
    currentExam: options?.initialExam ?? DEFAULT_SAMPLE_EXAM,
    activeReport: null,
    announcer,
  };

  const examWrapper = root.querySelector('#examWrapper') as HTMLElement | null;
  const reportWrapper = root.querySelector('#reportWrapper') as HTMLElement | null;
  const builderModal = root.querySelector('#builderModal') as HTMLElement | null;
  const bankModal = root.querySelector('#bankModal') as HTMLElement | null;
  const submitModal = root.querySelector('#submitModal') as HTMLElement | null;
  const examTitle = root.querySelector('#examTitle') as HTMLElement | null;
  const candidateInput = root.querySelector('#candidateName') as HTMLInputElement | null;
  const syncStatus = root.querySelector('#syncStatus') as HTMLElement | null;
  const syncText = root.querySelector('#syncText') as HTMLElement | null;
  const timerBox = root.querySelector('#timerBox') as HTMLElement | null;
  const btnSubmit = root.querySelector('#btnSubmit') as HTMLButtonElement | null;
  const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit') as HTMLButtonElement | null;
  const btnCancelSubmit = root.querySelector('#btnCancelSubmit') as HTMLButtonElement | null;
  const btnCloseBuilder = root.querySelector('#btnCloseBuilder') as HTMLButtonElement | null;
  const btnCloseBank = root.querySelector('#btnCloseBank') as HTMLButtonElement | null;

  if (examTitle && ctx.currentExam) {
    examTitle.textContent = ctx.currentExam.title;
  }

  const applyRoute = (state: RouteState) => {
    switch (state.route) {
      case 'exam':
        if (examWrapper) examWrapper.style.display = '';
        if (reportWrapper) reportWrapper.style.display = 'none';
        if (builderModal) builderModal.style.display = 'none';
        if (bankModal) bankModal.style.display = 'none';
        break;
      case 'report':
        if (examWrapper) examWrapper.style.display = 'none';
        if (reportWrapper) reportWrapper.style.display = '';
        if (builderModal) builderModal.style.display = 'none';
        if (bankModal) bankModal.style.display = 'none';
        break;
      case 'builder':
        if (builderModal) builderModal.style.display = 'flex';
        break;
      case 'bank':
        if (bankModal) bankModal.style.display = 'flex';
        break;
      case 'import':
        if (builderModal) builderModal.style.display = 'flex';
        break;
      default:
        if (examWrapper) examWrapper.style.display = '';
        if (reportWrapper) reportWrapper.style.display = 'none';
        break;
    }
  };

  applyRoute(router.getState());
  const unsubscribeRouter = router.subscribe((state) => {
    applyRoute(state);
  });

  const onSubmitClick = () => {
    if (submitModal) {
      submitModal.style.display = 'flex';
    }
  };

  const onConfirmSubmitClick = async () => {
    if (submitModal) submitModal.style.display = 'none';
    if (ctx.controller) {
      const res = await ctx.controller.submit('manual');
      if (res.ok) {
        const repRes = buildReport(res.value, ctx.now());
        if (repRes.ok) {
          ctx.activeReport = repRes.value;
          const reportView = root.querySelector('#reportView');
          if (reportView) {
            reportView.innerHTML = renderReportHtml(repRes.value);
          }
          router.navigate('report');
        }
      }
    }
  };

  const onCancelSubmitClick = () => {
    if (submitModal) submitModal.style.display = 'none';
  };

  const onCloseBuilderClick = () => {
    if (builderModal) builderModal.style.display = 'none';
    if (router.getState().route === 'builder' || router.getState().route === 'import') {
      router.navigate('exam');
    }
  };

  const onCloseBankClick = () => {
    if (bankModal) bankModal.style.display = 'none';
    if (router.getState().route === 'bank') {
      router.navigate('exam');
    }
  };

  if (btnSubmit) btnSubmit.addEventListener('click', onSubmitClick);
  if (btnConfirmSubmit) btnConfirmSubmit.addEventListener('click', onConfirmSubmitClick);
  if (btnCancelSubmit) btnCancelSubmit.addEventListener('click', onCancelSubmitClick);
  if (btnCloseBuilder) btnCloseBuilder.addEventListener('click', onCloseBuilderClick);
  if (btnCloseBank) btnCloseBank.addEventListener('click', onCloseBankClick);

  // Initialize startAttempt if currentExam has questions
  if (ctx.currentExam && ctx.currentExam.questions.length > 0) {
    const candidateName = candidateInput?.value || 'Thí sinh tự do';
    const startRes = await startAttempt(ctx.currentExam, candidateName, {
      storage: ctx.storage,
      now: ctx.now,
      id: ctx.id,
    });
    if (startRes.ok) {
      ctx.controller = startRes.value;
    }
  }

  // Return clean disposal function
  return () => {
    unsubscribeRouter();
    router.dispose();
    if (announcer) announcer.dispose();
    if (ctx.controller) ctx.controller.dispose();

    if (btnSubmit) btnSubmit.removeEventListener('click', onSubmitClick);
    if (btnConfirmSubmit) btnConfirmSubmit.removeEventListener('click', onConfirmSubmitClick);
    if (btnCancelSubmit) btnCancelSubmit.removeEventListener('click', onCancelSubmitClick);
    if (btnCloseBuilder) btnCloseBuilder.removeEventListener('click', onCloseBuilderClick);
    if (btnCloseBank) btnCloseBank.removeEventListener('click', onCloseBankClick);
  };
}
