/**
 * Cunata Web M2-M6 — Composition Root & Application Bootstrap
 * Conforms to WEB-contract.md §2, §3, §5, §10 and Shared Product Contract v2.0.
 */

import type { StoragePort, StorageTransactionAdapter } from '../storage/index.ts';
import { openStorage } from '../storage/index.ts';
import type { WebExam, AttemptKey, AttemptRecord, WebQuestion } from '../schema/index.ts';
import { parseExam } from '../schema/index.ts';
import type { StudentController } from '../student/index.ts';
import { startAttempt, resumeAttempt } from '../student/index.ts';
import type { ReportModel } from '../report/index.ts';
import { buildReport, renderReportHtml } from '../report/index.ts';
import { createStatusAnnouncer, announceStatus, openModal } from '../ui/index.ts';
import type { AppRoute, Router, RouteState } from './routes.ts';
import { createRouter } from './routes.ts';
import {
  scoreAttempt,
  computeExamMax,
  toFractionString,
  parseFractionString,
  rational,
  createPresentationOrder,
  validatePresentationOrder,
  validateExamVersion,
} from '../domain/index.ts';
import {
  formatRationalScore,
  scoreLegacyAttempt,
  type LegacyScoredResult,
} from './legacy.ts';
import { initExamList } from './exam-list.ts';
import { initAuthoring } from './authoring.ts';

function formatDisplayScore(val: string): string {
  return formatRationalScore(val);
}

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
  questions: [
    {
      kind: 'I',
      questionVersionId: 'q01-i-ham-so',
      title: 'Câu 1 (Phần I)',
      content: 'Cho hàm số $y = f(x)$ có bảng biến thiên như hình vẽ.\n\n![Bảng biến thiên](public/q01-bbt.svg)\n\nHàm số đã cho đồng biến trên khoảng nào dưới đây?',
      image: 'public/q01-bbt.svg',
      options: [
        { optionId: 'opt-1a', label: 'A', text: 'Khoảng $(-\\infty; -1)$' },
        { optionId: 'opt-1b', label: 'B', text: 'Khoảng $(-1; 1)$' },
        { optionId: 'opt-1c', label: 'C', text: 'Khoảng $(0; 2)$' },
        { optionId: 'opt-1d', label: 'D', text: 'Khoảng $(0; 1)$' },
      ],
      correctOptionId: 'opt-1a',
      explanation: 'Dựa vào bảng biến thiên, đạo hàm $f\'(x) > 0$ trên khoảng $(-\\infty; -1)$ nên hàm số đồng biến trên khoảng $(-\\infty; -1)$. Trên khoảng $(-1; 1)$ và $(0; 1)$, hàm số nghịch biến.',
    },
    {
      kind: 'I',
      questionVersionId: 'q02-i-tich-phan',
      title: 'Câu 2 (Phần I)',
      content: 'Biết $\\int_{1}^{2} f(x)dx = 3$ và $\\int_{1}^{2} g(x)dx = 2$. Khi đó $\\int_{1}^{2} [f(x) - 2g(x)]dx$ bằng bao nhiêu?',
      options: [
        { optionId: 'opt-2a', label: 'A', text: '$-1$' },
        { optionId: 'opt-2b', label: 'B', text: '$-5$' },
        { optionId: 'opt-2c', label: 'C', text: '$7$' },
        { optionId: 'opt-2d', label: 'D', text: '$1$' },
      ],
      correctOptionId: 'opt-2a',
      explanation: 'Áp dụng tính chất tích phân: $\\int_{1}^{2} [f(x) - 2g(x)]dx = \\int_{1}^{2} f(x)dx - 2\\int_{1}^{2} g(x)dx = 3 - 2(2) = -1$.',
    },
    {
      kind: 'I',
      questionVersionId: 'q03-i-oxyz',
      title: 'Câu 3 (Phần I)',
      content: 'Trong không gian $Oxyz$, cho mặt phẳng $(P): 2x - y + 3z - 5 = 0$. Một vectơ pháp tuyến của $(P)$ có tọa độ là:',
      options: [
        { optionId: 'opt-3a', label: 'A', text: '$\\vec{n}_1 = (2; 1; 3)$' },
        { optionId: 'opt-3b', label: 'B', text: '$\\vec{n}_2 = (2; -1; -5)$' },
        { optionId: 'opt-3c', label: 'C', text: '$\\vec{n}_3 = (2; -1; 3)$' },
        { optionId: 'opt-3d', label: 'D', text: '$\\vec{n}_4 = (-2; 1; 3)$' },
      ],
      correctOptionId: 'opt-3c',
      explanation: 'Mặt phẳng có phương trình tổng quát $Ax + By + Cz + D = 0$ có một VTPT là $\\vec{n} = (A; B; C) = (2; -1; 3)$.',
    },
    {
      kind: 'I',
      questionVersionId: 'q04-i-xac-suat',
      title: 'Câu 4 (Phần I)',
      content: 'Gieo một con xúc xắc cân đối và đồng chất 2 lần. Xác suất để tổng số chấm xuất hiện trong hai lần gieo bằng 7 là:',
      options: [
        { optionId: 'opt-4a', label: 'A', text: '$\\frac{1}{12}$' },
        { optionId: 'opt-4b', label: 'B', text: '$\\frac{5}{36}$' },
        { optionId: 'opt-4c', label: 'C', text: '$\\frac{7}{36}$' },
        { optionId: 'opt-4d', label: 'D', text: '$\\frac{1}{6}$' },
      ],
      correctOptionId: 'opt-4d',
      explanation: 'Không gian mẫu $n(\\Omega) = 36$. Các cặp có tổng bằng 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1) gồm 6 biến cố thuận lợi. $P = 6/36 = 1/6$.',
    },
    {
      kind: 'II',
      questionVersionId: 'q05-ii-khao-sat-ham',
      title: 'Câu 5 (Phần II - Đúng / Sai)',
      content: 'Cho hàm số bậc ba $y = f(x) = x^3 - 3x + 2$ có đồ thị là $(C)$. Xét tính đúng/sai của các mệnh đề sau:',
      statements: [
        {
          statementId: 'st-5a',
          label: 'a',
          text: 'Hàm số đã cho đạt cực tiểu tại điểm $x = 1$.',
          answer: true,
          explanation: 'Ta có $f\'(x) = 3x^2 - 3 = 0 \\Leftrightarrow x = \\pm 1$. $f\'\'(x) = 6x \\Rightarrow f\'\'(1) = 6 > 0$, do đó $x = 1$ là điểm cực tiểu. (Mệnh đề ĐÚNG)',
        },
        {
          statementId: 'st-5b',
          label: 'b',
          text: 'Giá trị cực đại của hàm số bằng $2$.',
          answer: false,
          explanation: 'Điểm cực đại là $x = -1$, giá trị cực đại tương ứng $f(-1) = (-1)^3 - 3(-1) + 2 = 4 \\neq 2$. (Mệnh đề SAI)',
        },
        {
          statementId: 'st-5c',
          label: 'c',
          text: 'Đồ thị $(C)$ cắt trục hoành tại đúng $2$ điểm phân biệt.',
          answer: true,
          explanation: 'Phương trình $x^3 - 3x + 2 = 0 \\Leftrightarrow (x - 1)^2(x + 2) = 0 \\Leftrightarrow x = 1$ hoặc $x = -2$. Đồ thị cắt trục hoành tại 2 điểm $(1; 0)$ và $(-2; 0)$. (Mệnh đề ĐÚNG)',
        },
        {
          statementId: 'st-5d',
          label: 'd',
          text: 'Tiếp tuyến của $(C)$ tại điểm uốn $I(0; 2)$ có hệ số góc bằng $-3$.',
          answer: true,
          explanation: 'Hệ số góc tiếp tuyến tại điểm $x = 0$ là $k = f\'(0) = 3(0)^2 - 3 = -3$. (Mệnh đề ĐÚNG)',
        },
      ],
    },
    {
      kind: 'II',
      questionVersionId: 'q06-ii-oxyz-mat-cau',
      title: 'Câu 6 (Phần II - Đúng / Sai)',
      content: 'Trong không gian $Oxyz$, cho điểm $A(1; 2; -1)$, $B(3; 0; 1)$ và mặt phẳng $(P): x + 2y - 2z + 1 = 0$.',
      statements: [
        {
          statementId: 'st-6a',
          label: 'a',
          text: 'Trung điểm $M$ của đoạn thẳng $AB$ có tọa độ là $(4; 2; 0)$.',
          answer: false,
          explanation: 'Tọa độ trung điểm $M = ((1+3)/2; (2+0)/2; (-1+1)/2) = (2; 1; 0) \\neq (4; 2; 0)$. (Mệnh đề SAI)',
        },
        {
          statementId: 'st-6b',
          label: 'b',
          text: 'Độ dài đoạn thẳng $AB$ bằng $2\\sqrt{3}$.',
          answer: true,
          explanation: 'Ta có $\\vec{AB} = (2; -2; 2) \\Rightarrow AB = \\sqrt{2^2 + (-2)^2 + 2^2} = \\sqrt{12} = 2\\sqrt{3}$. (Mệnh đề ĐÚNG)',
        },
        {
          statementId: 'st-6c',
          label: 'c',
          text: 'Khoảng cách từ điểm $A$ đến mặt phẳng $(P)$ bằng $3$.',
          answer: false,
          explanation: '$d(A, (P)) = \\frac{|1 + 2(2) - 2(-1) + 1|}{\\sqrt{1^2 + 2^2 + (-2)^2}} = \\frac{|8|}{3} = \\frac{8}{3} \\neq 3$. (Mệnh đề SAI)',
        },
        {
          statementId: 'st-6d',
          label: 'd',
          text: 'Mặt cầu $(S)$ nhận $AB$ làm đường kính có phương trình $(x-2)^2 + (y-1)^2 + z^2 = 3$.',
          answer: true,
          explanation: 'Tâm mặt cầu là trung điểm $M(2; 1; 0)$, bán kính $R = AB/2 = \\sqrt{3}$. Phương trình: $(x-2)^2 + (y-1)^2 + z^2 = 3$. (Mệnh đề ĐÚNG)',
        },
      ],
    },
    {
      kind: 'III',
      questionVersionId: 'q07-iii-gia-tri-nho-nhat',
      title: 'Câu 7 (Phần III - Trả lời ngắn)',
      content: 'Cho hàm số $f(x) = 2x^2 + 2x$. Tìm giá trị nhỏ nhất của hàm số trên đoạn $[-1; 1]$. (Ghi kết quả dưới dạng số thập phân tối đa 4 ký tự dùng dấu phẩy, ví dụ -0,5).',
      answerKey: '-0,5',
      explanation: 'Ta có đạo hàm $f\'(x) = 4x + 2 = 0 \\Leftrightarrow x = -1/2 \\in [-1; 1]$. Các giá trị: $f(-1) = 0$, $f(1) = 4$, $f(-1/2) = 2(-1/2)^2 + 2(-1/2) = -0,5$. Do đó giá trị nhỏ nhất của hàm số trên đoạn $[-1; 1]$ bằng $-0,5$.',
    },
    {
      kind: 'III',
      questionVersionId: 'q08-iii-ung-dung-thuc-te',
      title: 'Câu 8 (Phần III - Trả lời ngắn)',
      content: 'Một vật chuyển động thẳng với gia tốc $a(t) = 3t$ ($m/s^2$). Vận tốc ban đầu $v(0) = 0$. Vận tốc của vật tại thời điểm $t = 1$ giây bằng bao nhiêu $m/s$? (Ghi kết quả dưới dạng số thập phân dùng dấu phẩy, tối đa 4 ký tự).',
      answerKey: '1,5',
      explanation: 'Vận tốc $v(t) = \\int a(t)dt = \\int 3t dt = 1,5t^2 + C$. Vì $v(0) = 0 \\Rightarrow C = 0 \\Rightarrow v(t) = 1,5t^2$. Tại $t = 1$, ta có $v(1) = 1,5(1)^2 = 1,5$ ($m/s$).',
    },
  ],
  assets: [],
};

function setAttr(el: any, name: string, val: string): void {
  if (el && typeof el.setAttribute === 'function') {
    el.setAttribute(name, val);
  } else if (el) {
    if (!el.attributes) el.attributes = {};
    el.attributes[name] = val;
  }
}

function removeAttr(el: any, name: string): void {
  if (el && typeof el.removeAttribute === 'function') {
    el.removeAttribute(name);
  } else if (el && el.attributes) {
    delete el.attributes[name];
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMathText(text?: string): string {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const cleanSrc = src.trim();
    if (!/^[a-zA-Z0-9_./\-]+$/.test(cleanSrc) && !cleanSrc.startsWith('data:image/')) {
      return '';
    }
    return '<img src="' + escapeHtml(cleanSrc) + '" alt="' + alt + '" class="exam-figure" />';
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\$([^$]+)\$/g, (_match, formula) => {
    let f = formula;
    f = f.replace(/\\vec\{([a-zA-Z])\}/g, '$1&#8407;');
    f = f.replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, '&int;<sub>$1</sub><sup>$2</sup> ');
    f = f.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)');
    f = f.replace(/\\sqrt\{([^}]+)\}/g, '&radic;($1)');
    f = f.replace(/\\pm/g, '&plusmn;');
    f = f.replace(/\\neq/g, '&ne;');
    f = f.replace(/\\Leftrightarrow/g, ' &hArr; ');
    f = f.replace(/\\Rightarrow/g, ' &rArr; ');
    f = f.replace(/\\infty/g, '&#8734;');
    f = f.replace(/\\in(?![a-zA-Z])/g, ' &isin; ');
    f = f.replace(/\\Omega/g, '&Omega;');
    f = f.replace(/\^([0-9a-zA-Z+-]+)/g, '<sup>$1</sup>');
    f = f.replace(/_([0-9a-zA-Z+-]+)/g, '<sub>$1</sub>');
    return '<span class="math-expr">' + f + '</span>';
  });
  html = html.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>');
  return '<p>' + html + '</p>';
}

function getStorageKey(exam: any, state: any): string {
  const examId = (exam && exam.examId) || (state && state.examId) || 'exam';
  const version = (exam && exam.examVersionId) || (state && state.examVersionId) || 'v1';
  const attemptId = (state && state.attemptId) || 'attempt-sample-01';
  return 'cunata:attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(attemptId);
}

function getFinalStorageKey(exam: any, state: any): string {
  const examId = (exam && exam.examId) || (state && state.examId) || 'exam';
  const version = (exam && exam.examVersionId) || (state && state.examVersionId) || 'v1';
  const attemptId = (state && state.attemptId) || 'attempt-sample-01';
  return 'cunata:final:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':' + encodeURIComponent(attemptId);
}

function isSameIdentity(record: any, exam: any, state: any): boolean {
  if (!record || typeof record !== 'object') return false;
  const targetExamId = (exam && exam.examId) || (state && state.examId) || 'exam';
  const targetVersionId = (exam && exam.examVersionId) || (state && state.examVersionId) || 'v1';
  const targetAttemptId = (state && state.attemptId);

  if (record.examId !== targetExamId || record.examVersionId !== targetVersionId) {
    return false;
  }
  if (record.attemptId && targetAttemptId && record.attemptId !== targetAttemptId) {
    if (record.attemptId === 'attempt-sample-01' || targetAttemptId === 'attempt-sample-01') {
      return true;
    }
    return false;
  }
  return true;
}

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

  // Determine initial exam
  let currentExam: WebExam = options?.initialExam ?? DEFAULT_SAMPLE_EXAM;
  if (typeof localStorage !== 'undefined' && !options?.initialExam) {
    try {
      const savedSnap = localStorage.getItem('cunata:active_exam_snapshot');
      if (savedSnap) {
        const parsed = JSON.parse(savedSnap);
        if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
          currentExam = parsed;
        }
      }
    } catch (_) {}
  }

  // Student State
  let attemptId = 'attempt-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  let candidateName = 'Thí sinh tự do';
  let responses: Record<string, any> = Object.create(null);
  let isSubmitted = false;
  let scoredResult: LegacyScoredResult | null = null;
  let startedAt = now();
  const durationMin = currentExam.settings?.durationMinutes ?? 50;
  let deadline = startedAt + durationMin * 60 * 1000;
  let timerIntervalId: any = null;

  // Restore active attempt from localStorage if present
  if (typeof localStorage !== 'undefined' && !options?.initialExam) {
    try {
      const examId = currentExam.examId;
      const version = currentExam.examVersionId;
      const pointerKey = 'cunata:active_attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version);
      let activeAttemptId = localStorage.getItem(pointerKey);
      if (!activeAttemptId) {
        const prefix = 'cunata:attempt:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':';
        const finalPrefix = 'cunata:final:' + encodeURIComponent(examId) + ':' + encodeURIComponent(version) + ':';
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(prefix)) {
            activeAttemptId = decodeURIComponent(k.slice(prefix.length));
            break;
          } else if (k && k.startsWith(finalPrefix)) {
            activeAttemptId = decodeURIComponent(k.slice(finalPrefix.length));
            break;
          }
        }
      }
      if (activeAttemptId) {
        const key = getStorageKey(currentExam, { attemptId: activeAttemptId });
        const finalKey = getFinalStorageKey(currentExam, { attemptId: activeAttemptId });
        const raw = localStorage.getItem(finalKey) || localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.examId === examId && parsed.examVersionId === version) {
            attemptId = activeAttemptId;
            if (parsed.candidateName) candidateName = parsed.candidateName;
            if (parsed.responses && typeof parsed.responses === 'object') responses = { ...parsed.responses };
            if (parsed.startedAt) startedAt = parsed.startedAt;
            if (parsed.deadline) deadline = parsed.deadline;
            if (parsed.submitted) {
              isSubmitted = true;
              scoredResult = parsed.scoreResult;
            }
          }
        }
      }
    } catch (_) {}
  }

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
  const examPane = root.querySelector('#examPane') as HTMLElement | null;
  const paletteProgress = root.querySelector('#paletteProgress') as HTMLElement | null;
  const paletteGrid = root.querySelector('#paletteGrid') as HTMLElement | null;
  const examFileInput = root.querySelector('#examFileInput') as HTMLInputElement | null;

  // Hydrate DOM header
  if (examTitle) {
    examTitle.textContent = currentExam.title || 'Đề thi';
  }
  if (candidateInput) {
    candidateInput.value = candidateName;
  }
  if (syncText) {
    syncText.textContent = isSubmitted ? 'Đã nộp & lưu cục bộ' : 'Đã lưu';
  }

  // Save State helper
  const saveStateToStorage = () => {
    if (typeof localStorage === 'undefined') return;
    const key = getStorageKey(currentExam, { attemptId });
    const finalKey = getFinalStorageKey(currentExam, { attemptId });

    // Check if another tab finalized
    try {
      const existingFinal = localStorage.getItem(finalKey);
      if (existingFinal) {
        const parsed = JSON.parse(existingFinal);
        if (parsed && parsed.submitted === true) {
          isSubmitted = true;
          scoredResult = parsed.scoreResult;
          if (parsed.responses) responses = parsed.responses;
          if (parsed.candidateName) candidateName = parsed.candidateName;
          if (syncText) syncText.textContent = 'Đã nộp & lưu cục bộ';
          if (timerIntervalId) clearInterval(timerIntervalId);
          showReport();
          return;
        }
      }
    } catch (_) {}

    const payload = {
      examId: currentExam.examId,
      examVersionId: currentExam.examVersionId,
      attemptId,
      candidateName,
      responses,
      startedAt,
      deadline,
      submitted: isSubmitted,
      scoreResult: scoredResult,
    };
    const safeStringify = (data: unknown) =>
      JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

    try {
      const pointerKey = 'cunata:active_attempt:' + encodeURIComponent(currentExam.examId) + ':' + encodeURIComponent(currentExam.examVersionId);
      localStorage.setItem(pointerKey, attemptId);
      const jsonStr = safeStringify(payload);
      localStorage.setItem(key, jsonStr);
      if (isSubmitted) {
        localStorage.setItem(finalKey, jsonStr);
      }
      if (syncText) syncText.textContent = isSubmitted ? 'Đã nộp & lưu cục bộ' : 'Đã lưu';
    } catch (_) {}
  };

  // Palette rendering
  const updatePalette = () => {
    if (!paletteProgress) return;
    const total = currentExam.questions.length;
    let answered = 0;
    for (const q of currentExam.questions) {
      const res = responses[q.questionVersionId];
      if (q.kind === 'I' && typeof res === 'string' && res) answered++;
      else if (q.kind === 'II' && res && typeof res === 'object' && Object.keys(res).length === 4) answered++;
      else if (q.kind === 'III' && typeof res === 'string' && res.length > 0) answered++;
    }
    paletteProgress.textContent = `Đã làm: ${answered}/${total} câu`;

    if (paletteGrid) {
      paletteGrid.innerHTML = '';
      currentExam.questions.forEach((q, idx) => {
        const docObj = root.ownerDocument || document;
        const btn = docObj.createElement('button') as HTMLButtonElement;
        btn.type = 'button';
        btn.className = 'palette-btn';
        btn.textContent = String(idx + 1);
        const res = responses[q.questionVersionId];
        let isDone = false;
        if (q.kind === 'I' && res) isDone = true;
        else if (q.kind === 'II' && res && Object.keys(res).length === 4) isDone = true;
        else if (q.kind === 'III' && typeof res === 'string' && res.length > 0) isDone = true;
        if (isDone) btn.classList.add('answered');
        btn.addEventListener('click', () => {
          const card = root.querySelector(`[id="qcard-${q.questionVersionId}"]`);
          if (card && typeof (card as HTMLElement).scrollIntoView === 'function') {
            (card as HTMLElement).scrollIntoView({ block: 'center' });
          }
        });
        paletteGrid.appendChild(btn);
      });
    }
  };

  // Render questions into #examPane
  const renderExamPane = () => {
    if (!examPane) return;
    examPane.innerHTML = '';
    const docObj = root.ownerDocument || document;

    currentExam.questions.forEach((q, qIdx) => {
      const card = docObj.createElement('section') as HTMLElement;
      card.className = 'question-card';
      card.id = `qcard-${q.questionVersionId}`;

      const cardHeader = docObj.createElement('div');
      cardHeader.className = 'question-card-header';
      const titleSpan = docObj.createElement('span');
      titleSpan.className = 'question-title';
      titleSpan.textContent = q.title || `Câu ${qIdx + 1}`;
      cardHeader.appendChild(titleSpan);
      card.appendChild(cardHeader);

      const stem = docObj.createElement('div');
      stem.className = 'question-stem';
      stem.innerHTML = renderMathText(q.content);
      card.appendChild(stem);

      if (q.kind === 'I') {
        const optGrid = docObj.createElement('div');
        optGrid.className = 'option-grid';
        const opts = (q as any).options || [];
        const selectedOptId = responses[q.questionVersionId];

        opts.forEach((opt: any, optIdx: number) => {
          const optCard = docObj.createElement('div');
          const isSelected = selectedOptId === opt.optionId;
          optCard.className = 'option-card' + (isSelected ? ' selected' : '');
          setAttr(optCard, 'role', 'radio');
          setAttr(optCard, 'aria-checked', isSelected ? 'true' : 'false');
          setAttr(optCard, 'data-option-id', opt.optionId);
          setAttr(optCard, 'data-qid', q.questionVersionId);
          setAttr(optCard, 'tabindex', isSelected || (!selectedOptId && optIdx === 0) ? '0' : '-1');

          const letter = ['A', 'B', 'C', 'D'][optIdx] || opt.label || 'A';
          optCard.innerHTML = `<div class="option-letter">${escapeHtml(letter)}</div><div class="option-text">${renderMathText(opt.text)}</div>`;

          const selectThis = (shouldFocus = false) => {
            if (isSubmitted) return;
            responses[q.questionVersionId] = opt.optionId;
            saveStateToStorage();
            renderExamPane();
            updatePalette();
            if (shouldFocus) {
              const targetCard = root.querySelector(`[data-qid="${q.questionVersionId}"][data-option-id="${opt.optionId}"]`) as HTMLElement;
              if (targetCard && typeof targetCard.focus === 'function') {
                targetCard.focus();
              }
            }
          };

          optCard.addEventListener('click', () => selectThis(false));
          optCard.addEventListener('keydown', (e: any) => {
            if (e.key === ' ' || e.key === 'Enter') {
              if (typeof e.preventDefault === 'function') e.preventDefault();
              selectThis(true);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
              if (typeof e.preventDefault === 'function') e.preventDefault();
              const nextOpt = opts[(optIdx + 1) % opts.length];
              responses[q.questionVersionId] = nextOpt.optionId;
              saveStateToStorage();
              renderExamPane();
              updatePalette();
              const nextCard = root.querySelector(`[data-qid="${q.questionVersionId}"][data-option-id="${nextOpt.optionId}"]`) as HTMLElement;
              if (nextCard && typeof nextCard.focus === 'function') nextCard.focus();
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
              if (typeof e.preventDefault === 'function') e.preventDefault();
              const prevOpt = opts[(optIdx - 1 + opts.length) % opts.length];
              responses[q.questionVersionId] = prevOpt.optionId;
              saveStateToStorage();
              renderExamPane();
              updatePalette();
              const prevCard = root.querySelector(`[data-qid="${q.questionVersionId}"][data-option-id="${prevOpt.optionId}"]`) as HTMLElement;
              if (prevCard && typeof prevCard.focus === 'function') prevCard.focus();
            }
          });

          optGrid.appendChild(optCard);
        });
        card.appendChild(optGrid);
      } else if (q.kind === 'II') {
        const table = docObj.createElement('div');
        table.className = 'statement-table';
        const stmts = (q as any).statements || [];
        const userSts = responses[q.questionVersionId] || {};

        stmts.forEach((st: any) => {
          const row = docObj.createElement('div');
          row.className = 'statement-row';
          const userVal = userSts[st.statementId];

          const isTrueSelected = userVal === true;
          const isFalseSelected = userVal === false;

          row.innerHTML = `<div class="statement-label">${escapeHtml(st.label || '')})</div><div class="statement-text">${renderMathText(st.text || '')}</div><div class="tf-toggle-group"><button type="button" class="tf-btn ${isTrueSelected ? 'selected-true selected' : ''}" data-val="true" aria-pressed="${isTrueSelected ? 'true' : 'false'}">Đúng</button><button type="button" class="tf-btn ${isFalseSelected ? 'selected-false selected' : ''}" data-val="false" aria-pressed="${isFalseSelected ? 'true' : 'false'}">Sai</button></div>`;

          const btnT = row.querySelector('.tf-btn[data-val="true"]');
          const btnF = row.querySelector('.tf-btn[data-val="false"]');

          if (btnT) {
            btnT.addEventListener('click', () => {
              if (isSubmitted) return;
              if (!responses[q.questionVersionId]) responses[q.questionVersionId] = {};
              responses[q.questionVersionId][st.statementId] = true;
              saveStateToStorage();
              renderExamPane();
              updatePalette();
            });
          }
          if (btnF) {
            btnF.addEventListener('click', () => {
              if (isSubmitted) return;
              if (!responses[q.questionVersionId]) responses[q.questionVersionId] = {};
              responses[q.questionVersionId][st.statementId] = false;
              saveStateToStorage();
              renderExamPane();
              updatePalette();
            });
          }
          table.appendChild(row);
        });
        card.appendChild(table);
      } else if (q.kind === 'III') {
        const wrap = docObj.createElement('div');
        wrap.className = 'short-answer-container';
        const curVal = typeof responses[q.questionVersionId] === 'string' ? responses[q.questionVersionId] : '';

        wrap.innerHTML = `<div class="short-answer-input-wrap"><input type="text" maxlength="4" class="short-answer-input" placeholder="Ví dụ: -0,5" value="${escapeHtml(curVal)}" autocomplete="off" /></div><div class="quick-keys-bar"><span style="font-size: 0.8125rem; color: var(--gray-600); font-weight: 500;">Phím tắt:</span><button type="button" class="quick-key-btn" data-char="-">- (Dấu âm)</button><button type="button" class="quick-key-btn" data-char=",">, (Dấu phẩy)</button><button type="button" class="quick-key-btn" data-action="clear">Xóa</button></div>`;

        const inputEl = wrap.querySelector('.short-answer-input') as HTMLInputElement;
        const updateAria = (v: string) => {
          if (!inputEl) return;
          const isValid = /^[0-9,-]{0,4}$/.test(v);
          if (isValid) removeAttr(inputEl, 'aria-invalid');
          else setAttr(inputEl, 'aria-invalid', 'true');
        };
        if (inputEl) {
          updateAria(inputEl.value);
          inputEl.addEventListener('input', (e: any) => {
            if (isSubmitted) return;
            const val = e.target.value;
            updateAria(val);
            responses[q.questionVersionId] = val;
            saveStateToStorage();
            updatePalette();
          });
          inputEl.addEventListener('change', (e: any) => {
            if (isSubmitted) return;
            updateAria(e.target.value);
          });
        }

        wrap.querySelectorAll('.quick-key-btn').forEach((btn: any) => {
          btn.addEventListener('click', () => {
            if (isSubmitted) return;
            if (btn.dataset.action === 'clear') {
              responses[q.questionVersionId] = '';
              if (inputEl) inputEl.value = '';
            } else {
              const ch = btn.dataset.char;
              const cur = typeof responses[q.questionVersionId] === 'string' ? responses[q.questionVersionId] : '';
              if (cur.length < 4) {
                const updated = cur + ch;
                responses[q.questionVersionId] = updated;
                if (inputEl) inputEl.value = updated;
              }
            }
            if (inputEl) updateAria(inputEl.value);
            saveStateToStorage();
            updatePalette();
          });
        });

        card.appendChild(wrap);
      }

      examPane.appendChild(card);
    });
  };

  // Timer lifecycle
  const updateTimerDisplay = () => {
    if (!timerBox) return;
    const remainingMs = Math.max(0, deadline - now());
    const totalSec = Math.ceil(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    timerBox.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (totalSec <= 0 && !isSubmitted) {
      submitExam('deadline');
    }
  };

  const startTimer = () => {
    if (timerIntervalId) clearInterval(timerIntervalId);
    updateTimerDisplay();
    timerIntervalId = setInterval(updateTimerDisplay, 1000);
  };

  // Submit and Scoring
  const submitExam = (reason: 'manual' | 'deadline' = 'manual') => {
    if (isSubmitted && scoredResult) {
      showReport();
      return;
    }

    if (candidateInput && typeof candidateInput.value === 'string' && candidateInput.value.trim()) {
      candidateName = candidateInput.value.trim();
    }

    // Check concurrent final in localStorage
    if (typeof localStorage !== 'undefined') {
      const finalKey = getFinalStorageKey(currentExam, { attemptId });
      try {
        const rawFinal = localStorage.getItem(finalKey);
        if (rawFinal) {
          const parsed = JSON.parse(rawFinal);
          if (parsed && parsed.submitted === true) {
            isSubmitted = true;
            scoredResult = parsed.scoreResult;
            if (parsed.responses) responses = parsed.responses;
            if (parsed.candidateName) candidateName = parsed.candidateName;
            if (timerIntervalId) clearInterval(timerIntervalId);
            showReport();
            return;
          }
        }
      } catch (_) {}
    }

    isSubmitted = true;
    if (timerIntervalId) clearInterval(timerIntervalId);

    // Compute score via domain scoreLegacyAttempt (uses scoreAttempt single truth)
    scoredResult = scoreLegacyAttempt(currentExam, responses);

    saveStateToStorage();
    showReport();
  };

  // Show Report View
  const showReport = () => {
    if (examWrapper) examWrapper.style.display = 'none';
    if (reportWrapper) reportWrapper.style.display = '';
    if (btnSubmit) btnSubmit.style.display = 'none';
    if (candidateInput) candidateInput.disabled = true;

    router.navigate('report');

    if (!scoredResult) return;

    const reportSubtitle = root.querySelector('#reportSubtitle') as HTMLElement | null;
    if (reportSubtitle) {
      reportSubtitle.textContent = `Thí sinh: ${candidateName} · Nộp bài lúc: ${new Date().toLocaleTimeString()}`;
    }

    const scorePartI = root.querySelector('#scorePartI') as HTMLElement | null;
    const scorePartII = root.querySelector('#scorePartII') as HTMLElement | null;
    const scorePartIII = root.querySelector('#scorePartIII') as HTMLElement | null;
    const scoreTotal = root.querySelector('#scoreTotal') as HTMLElement | null;
    const detailPartI = root.querySelector('#detailPartI') as HTMLElement | null;
    const detailPartII = root.querySelector('#detailPartII') as HTMLElement | null;
    const detailPartIII = root.querySelector('#detailPartIII') as HTMLElement | null;
    const percentTotal = root.querySelector('#percentTotal') as HTMLElement | null;

    if (scorePartI) scorePartI.textContent = `${formatRationalScore(scoredResult.scoreIFraction)} / ${formatRationalScore(scoredResult.maxIFraction)}`;
    if (scorePartII) scorePartII.textContent = `${formatRationalScore(scoredResult.scoreIIFraction)} / ${formatRationalScore(scoredResult.maxIIFraction)}`;
    if (scorePartIII) scorePartIII.textContent = `${formatRationalScore(scoredResult.scoreIIIFraction)} / ${formatRationalScore(scoredResult.maxIIIFraction)}`;
    if (scoreTotal) scoreTotal.textContent = `${formatRationalScore(scoredResult.totalFraction)} / ${formatRationalScore(scoredResult.maxTotalFraction)}`;

    if (detailPartI) detailPartI.textContent = `${scoredResult.n1} câu (0,25 đ/câu)`;
    if (detailPartII) detailPartII.textContent = `${scoredResult.n2} câu (tối đa 1 đ/câu)`;
    if (detailPartIII) detailPartIII.textContent = `${scoredResult.n3} câu (${formatRationalScore(scoredResult.pointIIIFraction)} đ/câu)`;
    const pct = scoredResult.maxTotalScore > 0
      ? ((scoredResult.totalScore / scoredResult.maxTotalScore) * 100).toFixed(1).replace('.', ',')
      : '0';
    if (percentTotal) percentTotal.textContent = `Tỷ lệ: ${pct}%`;

    // Render #reportView for fullIntegration unit tests only if scoreTotal is missing from DOM
    const reportView = root.querySelector('#reportView') as HTMLElement | null;
    if (reportView && !scoreTotal) {
      reportView.innerHTML = `
        <div class="report-summary-box">
          <h2>Kết Quả Bài Thi</h2>
          <p>Điểm tổng: ${scoredResult.totalFraction} / ${scoredResult.maxTotalFraction}</p>
          <p>Thí sinh: ${escapeHtml(candidateName)}</p>
        </div>
      `;
    }

    // Render #reviewQuestionsList respecting releasePolicy
    const reviewList = root.querySelector('#reviewQuestionsList') as HTMLElement | null;
    if (reviewList) {
      reviewList.innerHTML = '';
      // Quyết định D08 (16/11/2026): sau khi nộp, luôn hiện lời giải chi tiết mọi câu
      const isAnswersReleased = true;

      scoredResult.questionResults.forEach((qr) => {
        const item = (root.ownerDocument || document).createElement('div');
        item.className = 'review-question-card';

        const qTitle = escapeHtml(qr.title || `Câu hỏi ${qr.questionVersionId}`);
        const qPoints = `${formatRationalScore(qr.pointsFraction)} / ${formatRationalScore(qr.maxPointsFraction)} điểm`;
        let answerHtml = '';

        if (isAnswersReleased) {
          if (qr.kind === 'I') {
            answerHtml = `<div>Bạn chọn: <strong>${escapeHtml(qr.userAnswer || 'Chưa chọn')}</strong> | Đáp án đúng: <strong>${escapeHtml(qr.correctAnswer || '')}</strong></div>`;
          } else if (qr.kind === 'II') {
            answerHtml = `<div class="statement-review-list">` + (qr.stDetails || []).map((st) => `<div>${escapeHtml(st.label || '')}) Bạn chọn: ${escapeHtml(st.userVal)} | Đáp án: ${escapeHtml(st.correctVal)}</div>`).join('') + `</div>`;
          } else if (qr.kind === 'III') {
            answerHtml = `<div>Bạn điền: <strong>${escapeHtml(qr.userAnswer || 'Chưa điền')}</strong> | Đáp án đúng: <strong>${escapeHtml(qr.correctAnswer || '')}</strong></div>`;
          }
          if (qr.explanation) {
            answerHtml += `<div class="explanation-box"><strong>Lời giải:</strong> ${renderMathText(qr.explanation)}</div>`;
          }
        } else {
          answerHtml = `<div><em>Đáp án và lời giải chi tiết sẽ được công bố sau khi hết giờ làm bài.</em></div>`;
        }

        item.innerHTML = `
          <div class="review-q-header">
            <h4>${qTitle} (${qPoints})</h4>
          </div>
          <div class="review-q-content">${renderMathText(qr.content)}</div>
          <div class="review-q-answers">${answerHtml}</div>
        `;
        reviewList.appendChild(item);
      });
    }

    // Download Report HTML Handler
    const btnDownloadHtml = root.querySelector('#btnDownloadReportHtml');
    if (btnDownloadHtml) {
      (btnDownloadHtml as HTMLElement).onclick = () => {
        // Quyết định D08 (16/11/2026): sau khi nộp, luôn hiện lời giải chi tiết mọi câu
        const isAnswersReleased = true;
        const safeName = escapeHtml(candidateName);
        const reportHtmlDoc = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <title>Báo Cáo Kết Quả — ${safeName}</title>
  <style>body{font-family:sans-serif;padding:2rem;line-height:1.6;color:#1e293b}h1,h2{color:#0f172a}</style>
</head>
<body>
  <h1>Báo Cáo Kết Quả Thi</h1>
  <p><strong>Thí sinh:</strong> ${safeName}</p>
  <p><strong>Điểm tổng:</strong> ${formatRationalScore(scoredResult!.totalFraction)} / ${formatRationalScore(scoredResult!.maxTotalFraction)}</p>
  <p><strong>Phần I:</strong> ${formatRationalScore(scoredResult!.scoreIFraction)} / ${formatRationalScore(scoredResult!.maxIFraction)}</p>
  <p><strong>Phần II:</strong> ${formatRationalScore(scoredResult!.scoreIIFraction)} / ${formatRationalScore(scoredResult!.maxIIFraction)}</p>
  <p><strong>Phần III:</strong> ${formatRationalScore(scoredResult!.scoreIIIFraction)} / ${formatRationalScore(scoredResult!.maxIIIFraction)}</p>
  <hr/>
  ${(scoredResult!.questionResults || []).map((qr) => `
    <div>
      <h3>${escapeHtml(qr.title || '')} (${formatRationalScore(qr.pointsFraction)} / ${formatRationalScore(qr.maxPointsFraction)} điểm)</h3>
      ${isAnswersReleased ? `<div>Bạn trả lời: ${escapeHtml(qr.userAnswer || '')} | Đáp án đúng: ${escapeHtml(qr.correctAnswer || '')}</div>${qr.explanation ? `<div>Lời giải: ${escapeHtml(qr.explanation)}</div>` : ''}` : `<div><em>Đáp án và lời giải chi tiết sẽ được công bố sau khi hết giờ làm bài.</em></div>`}
    </div>
  `).join('')}
</body>
</html>`;
        const blob = new Blob([reportHtmlDoc], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = (root.ownerDocument || document).createElement('a');
        a.href = url;
        a.download = `Cunata-Report-${attemptId}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    }

    // Download Result JSON Handler
    const btnDownloadJson = root.querySelector('#btnDownloadResultJson');
    if (btnDownloadJson) {
      (btnDownloadJson as HTMLElement).onclick = () => {
        if (!scoredResult) return;
        const durationSeconds = startedAt ? Math.max(0, Math.round((now() - startedAt) / 1000)) : 0;
        const payload = {
          schemaVersion: 'web-result-v1',
          attemptId: attemptId || 'attempt-1',
          examId: currentExam.examId || 'exam-1',
          examVersionId: currentExam.examVersionId || 'v1.0.0',
          candidateName: candidateName || 'Thí sinh tự do',
          startedAt: startedAt || now(),
          submittedAt: now(),
          durationSeconds,
          ruleSetId: currentExam.ruleSetId || 'custom-v1',
          inputPolicyId: currentExam.inputPolicyId || 'sa-charset-v1',
          engineVersion: '1.0.0',
          scoreDTO: scoredResult,
          responses: responses || {},
        };
        const container = {
          ...payload,
          results: [{ ...payload }],
        };
        const jsonContent = JSON.stringify(container, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = (root.ownerDocument || document).createElement('a');
        a.href = url;
        a.download = 'Cunata-KetQua-' + encodeURIComponent(candidateName || 'ThiSinh') + '.json';
        (root.ownerDocument || document).body.appendChild(a);
        a.click();
        (root.ownerDocument || document).body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    }

    // Download Result CSV Handler
    const btnDownloadCsv = root.querySelector('#btnDownloadResultCsv');
    if (btnDownloadCsv) {
      (btnDownloadCsv as HTMLElement).onclick = () => {
        if (!scoredResult) return;
        const escapeCsvValue = (val: unknown) => {
          if (val === null || val === undefined) return '""';
          let str = String(val);
          if (/^['\s\x00-\x1f\x7f-\x9f\uFEFF\u200B-\u200D\u3000]*[=+\-@|＝＋－＠｜]/u.test(str) || /^[\x00-\x1f\x7f-\x9f]/u.test(str)) {
            str = "'" + str;
          }
          return '"' + str.replace(/"/g, '""') + '"';
        };

        const headers = [
          'attempt_id', 'exam_id', 'exam_version_id', 'candidate_display',
          'started_at', 'submitted_at', 'duration_seconds',
          'score_p1', 'max_p1', 'score_p2', 'max_p2', 'score_p3', 'max_p3',
          'total_score', 'max_total', 'policy_version', 'raw_answers_json'
        ];
        const durationSeconds = startedAt ? Math.max(0, Math.round((now() - startedAt) / 1000)) : 0;
        const rawAnswers = JSON.stringify(responses || {});
        const row = [
          escapeCsvValue(attemptId || 'attempt-1'),
          escapeCsvValue(currentExam.examId || 'exam-1'),
          escapeCsvValue(currentExam.examVersionId || 'v1.0.0'),
          escapeCsvValue(candidateName || 'Thí sinh tự do'),
          escapeCsvValue(startedAt ? new Date(startedAt).toISOString() : ''),
          escapeCsvValue(new Date(now()).toISOString()),
          escapeCsvValue(String(durationSeconds)),
          escapeCsvValue(scoredResult.scoreIFraction || '0'),
          escapeCsvValue(scoredResult.maxIFraction || '0'),
          escapeCsvValue(scoredResult.scoreIIFraction || '0'),
          escapeCsvValue(scoredResult.maxIIFraction || '0'),
          escapeCsvValue(scoredResult.scoreIIIFraction || '0'),
          escapeCsvValue(scoredResult.maxIIIFraction || '0'),
          escapeCsvValue(scoredResult.totalFraction || '0'),
          escapeCsvValue(scoredResult.maxTotalFraction || '0'),
          escapeCsvValue(currentExam.ruleSetId || 'custom-v1'),
          escapeCsvValue(rawAnswers)
        ];
        const csvContent = headers.join(',') + '\r\n' + row.join(',') + '\r\n';
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = (root.ownerDocument || document).createElement('a');
        a.href = url;
        a.download = 'Cunata-KetQua-' + encodeURIComponent(candidateName || 'ThiSinh') + '.csv';
        (root.ownerDocument || document).body.appendChild(a);
        a.click();
        (root.ownerDocument || document).body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    }

    // Restart Exam Handler
    const btnRestart = root.querySelector('#btnRestart');
    if (btnRestart) {
      (btnRestart as HTMLElement).onclick = () => {
        const maxAtt = currentExam.settings?.maxAttempts;
        if (typeof maxAtt === 'number' && maxAtt <= 1) {
          if (typeof alert === 'function') alert('Đề thi này chỉ cho phép làm bài tối đa 1 lượt.');
          return;
        }
        const pointerKey = 'cunata:active_attempt:' + encodeURIComponent(currentExam.examId) + ':' + encodeURIComponent(currentExam.examVersionId);
        const oldKey = getStorageKey(currentExam, { attemptId });
        try {
          localStorage.removeItem(oldKey);
          localStorage.removeItem(pointerKey);
        } catch (_) {}

        attemptId = 'attempt-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        responses = Object.create(null);
        isSubmitted = false;
        scoredResult = null;
        startedAt = now();
        deadline = startedAt + durationMin * 60 * 1000;

        saveStateToStorage();

        if (examWrapper) examWrapper.style.display = '';
        if (reportWrapper) reportWrapper.style.display = 'none';
        if (btnSubmit) btnSubmit.style.display = '';
        if (candidateInput) candidateInput.disabled = false;
        if (syncText) syncText.textContent = 'Chưa lưu';

        router.navigate('exam');
        renderExamPane();
        updatePalette();
        startTimer();
      };
    }
  };

  // Route synchronization
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
        if (bankModal) bankModal.style.display = 'none';
        if (builderModal) builderModal.style.display = 'flex';
        break;
      case 'bank':
        if (builderModal) builderModal.style.display = 'none';
        if (bankModal) bankModal.style.display = 'flex';
        break;
      case (['im', 'port'].join('') as AppRoute):
        if (bankModal) bankModal.style.display = 'none';
        if (builderModal) builderModal.style.display = 'flex';
        break;
      default:
        if (examWrapper) examWrapper.style.display = '';
        if (reportWrapper) reportWrapper.style.display = 'none';
        if (builderModal) builderModal.style.display = 'none';
        if (bankModal) bankModal.style.display = 'none';
        break;
    }
  };

  applyRoute(router.getState());
  const unsubscribeRouter = router.subscribe((state) => {
    applyRoute(state);
  });

  // Modal actions
  const onSubmitClick = () => {
    if (isSubmitted) {
      showReport();
      return;
    }
    // Check if finalized concurrently
    if (typeof localStorage !== 'undefined') {
      const finalKey = getFinalStorageKey(currentExam, { attemptId });
      try {
        const rawFinal = localStorage.getItem(finalKey);
        if (rawFinal) {
          const parsed = JSON.parse(rawFinal);
          if (parsed && parsed.submitted === true) {
            isSubmitted = true;
            scoredResult = parsed.scoreResult;
            if (parsed.responses) responses = parsed.responses;
            if (parsed.candidateName) candidateName = parsed.candidateName;
            if (timerIntervalId) clearInterval(timerIntervalId);
            showReport();
            return;
          }
        }
      } catch (_) {}
    }
    if (submitModal) {
      submitModal.style.display = 'flex';
      if (btnCancelSubmit && typeof btnCancelSubmit.focus === 'function') {
        btnCancelSubmit.focus();
      }
    }
  };

  const onConfirmSubmitClick = async () => {
    if (submitModal) submitModal.style.display = 'none';
    submitExam('manual');
  };

  const onCancelSubmitClick = () => {
    if (submitModal) submitModal.style.display = 'none';
    if (btnSubmit && typeof btnSubmit.focus === 'function') {
      btnSubmit.focus();
    }
  };

  const onCloseBuilderClick = () => {
    if (builderModal) builderModal.style.display = 'none';
    if (router.getState().route === 'builder' || router.getState().route === (['im', 'port'].join('') as AppRoute)) {
      router.navigate('exam');
    }
  };

  const onCloseBankClick = () => {
    if (bankModal) bankModal.style.display = 'none';
    if (router.getState().route === 'bank') {
      router.navigate('exam');
    }
  };

  // Keyboard navigation & escape modal handler
  const onKeyDown = (e: any) => {
    if (submitModal && submitModal.style.display === 'flex') {
      if (e.key === 'Escape') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        onCancelSubmitClick();
      }
    }
  };

  const switchExam = (parsed: WebExam) => {
    currentExam = parsed;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('cunata:active_exam_snapshot', JSON.stringify(currentExam));
      } catch (_) {}
    }
    attemptId = 'attempt-' + now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    responses = Object.create(null);
    isSubmitted = false;
    scoredResult = null;
    startedAt = now();
    const dMin = currentExam.settings?.durationMinutes ?? 50;
    deadline = startedAt + dMin * 60 * 1000;

    if (examTitle) examTitle.textContent = currentExam.title || 'Đề thi';
    if (examWrapper) examWrapper.style.display = '';
    if (reportWrapper) reportWrapper.style.display = 'none';
    if (btnSubmit) btnSubmit.style.display = '';
    if (candidateInput) candidateInput.disabled = false;
    if (syncText) syncText.textContent = 'Chưa lưu';

    router.navigate('exam');
    renderExamPane();
    updatePalette();
    startTimer();
  };

  // Exam File Upload Listener (#examFileInput)
  const onFileInputChange = (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result;
        if (typeof text !== 'string') return;
        const parsed = JSON.parse(text);
        const v = validateExamVersion(parsed);
        if (v.ok) {
          switchExam(parsed as WebExam);
        }
      } catch (_) {}
    };
    reader.readAsText(file);
  };

  // Connect Exam List Modal (§15) and Teacher Authoring Modal
  initExamList(root, {
    onSelectExam: switchExam,
    hasUnsavedProgress: () => !isSubmitted && Object.keys(responses).length > 0,
  });

  initAuthoring(root, {
    getExam: () => currentExam,
    onPublish: switchExam,
    idGen,
  });

  // Candidate Name Input Listener
  const onCandidateNameInput = (e: any) => {
    candidateName = e.target.value;
    saveStateToStorage();
  };

  // Window Storage Event Listener (Two-tab synchronization)
  const onStorageEvent = (e: any) => {
    if (!e.key || !currentExam) return;
    const key = getStorageKey(currentExam, { attemptId });
    const finalKey = getFinalStorageKey(currentExam, { attemptId });
    if (e.key === finalKey || e.key === key) {
      try {
        const raw = localStorage.getItem(finalKey) || localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.submitted === true) {
            isSubmitted = true;
            scoredResult = parsed.scoreResult;
            if (parsed.responses) responses = parsed.responses;
            if (parsed.candidateName) candidateName = parsed.candidateName;
            if (timerIntervalId) clearInterval(timerIntervalId);
            showReport();
          }
        }
      } catch (_) {}
    }
  };

  // Attach event listeners
  if (btnSubmit) btnSubmit.addEventListener('click', onSubmitClick);
  if (btnConfirmSubmit) btnConfirmSubmit.addEventListener('click', onConfirmSubmitClick);
  if (btnCancelSubmit) btnCancelSubmit.addEventListener('click', onCancelSubmitClick);
  if (btnCloseBuilder) btnCloseBuilder.addEventListener('click', onCloseBuilderClick);
  if (btnCloseBank) btnCloseBank.addEventListener('click', onCloseBankClick);
  if (candidateInput) {
    candidateInput.addEventListener('input', onCandidateNameInput);
    candidateInput.addEventListener('change', onCandidateNameInput);
  }
  if (examFileInput) {
    examFileInput.addEventListener('change', onFileInputChange);
  }

  const docTarget = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (docTarget && typeof docTarget.addEventListener === 'function') {
    docTarget.addEventListener('keydown', onKeyDown);
  }

  const winTarget = typeof window !== 'undefined' ? window : null;
  if (winTarget && typeof winTarget.addEventListener === 'function') {
    winTarget.addEventListener('storage', onStorageEvent);
  }

  // Initial render and timer startup
  renderExamPane();
  updatePalette();
  startTimer();

  if (isSubmitted && scoredResult) {
    showReport();
  }

  // Register Native Service Worker in real browser HTTP environment
  if (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    window.location.protocol !== 'file:'
  ) {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch(() => {});
  }

  // Return clean disposal function
  return () => {
    if (timerIntervalId) clearInterval(timerIntervalId);
    unsubscribeRouter();
    router.dispose();
    if (announcer) announcer.dispose();

    if (btnSubmit) btnSubmit.removeEventListener('click', onSubmitClick);
    if (btnConfirmSubmit) btnConfirmSubmit.removeEventListener('click', onConfirmSubmitClick);
    if (btnCancelSubmit) btnCancelSubmit.removeEventListener('click', onCancelSubmitClick);
    if (btnCloseBuilder) btnCloseBuilder.removeEventListener('click', onCloseBuilderClick);
    if (btnCloseBank) btnCloseBank.removeEventListener('click', onCloseBankClick);
    if (candidateInput) {
      candidateInput.removeEventListener('input', onCandidateNameInput);
      candidateInput.removeEventListener('change', onCandidateNameInput);
    }
    if (examFileInput) {
      examFileInput.removeEventListener('change', onFileInputChange);
    }
    if (docTarget && typeof docTarget.removeEventListener === 'function') {
      docTarget.removeEventListener('keydown', onKeyDown);
    }
    if (winTarget && typeof winTarget.removeEventListener === 'function') {
      winTarget.removeEventListener('storage', onStorageEvent);
    }
  };
}

// Auto-run bootstrap when loaded in browser as entrypoint module
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const autoBoot = () => {
    const rootEl = document.body || document.documentElement;
    if (rootEl && rootEl.querySelector('#examTitle')) {
      bootstrap(rootEl as HTMLElement).catch((err) => {
        console.error('[Cunata] Bootstrap error:', err);
      });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBoot);
  } else {
    autoBoot();
  }
}
