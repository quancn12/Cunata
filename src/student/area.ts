/// <reference lib="dom" />

import type { WebExam, AttemptRecord } from '../schema/types.ts';
import { parseExam } from '../schema/index.ts';
import { parseFractionString, toDecimalString } from '../domain/index.ts';
import { Button, Input, Card, ExamCard, StatusBadge, Dialog, BottomSheet } from '../ui/components.ts';
import { Icon } from '../ui/icons.ts';
import type { ExamCardOptions, ExamStatus } from '../ui/components.ts';
import type { AppsScriptClient, PublishedExamMeta, AsResult } from '../collect/appsScript.ts';
import { createAppsScriptClient, loadAppConfig } from '../collect/appsScript.ts';

export interface StudentAreaExamEntry {
  id: string;
  title: string;
  subject: string;
  grade?: number;
  durationMinutes: number;
  questionCount: number;
  url?: string;
  source?: 'static' | 'teacher';
  description?: string;
  assignmentId?: string;
  openAt?: string;
  dueAt?: string;
}

export interface StudentAssignment {
  assignmentId: string;
  classCode: string;
  className: string;
  teacherName: string;
  examId: string;
  title: string;
  subject?: string;
  questionCount: number;
  durationMinutes: number;
  openAt: string;
  dueAt: string;
}

export interface JoinedClass {
  code: string;
  name: string;
  teacherName: string;
  assignments: StudentAssignment[];
}

export interface StudentAreaOptions {
  appsScriptUrl?: string;
  client?: AppsScriptClient;
  initialExamId?: string | null;
  onOpenTeacher?: () => void;
  onStartExam?: (
    exam: WebExam,
    candidateName: string,
    meta?: {
      assignmentId?: string;
      classCode?: string;
      openAt?: string;
      dueAt?: string;
      class_code?: string;
      assignment_id?: string;
      open_at?: string;
      due_at?: string;
    }
  ) => void;
  now?: () => number;
}

export interface StudentAreaController {
  refreshList(): Promise<void>;
  selectExamId(id: string): Promise<void>;
  joinClass(code: string): Promise<boolean>;
  setCandidateName(name: string): void;
  getCandidateName(): string;
  resetName(): void;
  dispose(): void;
}

const STORAGE_NAME_KEY = 'cunata:candidate_name';
const STORAGE_CLASSES_KEY = 'cunata:classes';
const STORAGE_ACTIVE_ASSIGNMENT_KEY = 'cunata:active_assignment';

function formatDateVi(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  } catch {
    return isoString;
  }
}

export function formatScoreD02(scoreVal: unknown): string {
  if (scoreVal === null || scoreVal === undefined || scoreVal === '') return '0';
  const str = String(scoreVal).trim();
  try {
    const r = parseFractionString(str);
    if (r.den === BigInt(1)) {
      return r.num.toString();
    }
    return toDecimalString(r, 2, 'half-up').replace('.', ',');
  } catch {
    const cleaned = str.replace(',', '.');
    const n = parseFloat(cleaned);
    if (Number.isFinite(n)) {
      if (Number.isInteger(n)) return String(n);
      return n.toFixed(2).replace('.', ',');
    }
    return str;
  }
}

interface LocalAttemptInfo {
  status: ExamStatus;
  score?: string;
  attemptId?: string;
  record?: AttemptRecord;
}

function getLocalAttemptInfo(examId: string): LocalAttemptInfo {
  if (typeof localStorage === 'undefined') return { status: 'not-started' };
  try {
    const finalPrefix = `cunata:final:${encodeURIComponent(examId)}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(finalPrefix)) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          const totalVal = parsed.scoreDTO?.total ?? parsed.scoreTotal;
          const score = totalVal !== undefined ? formatScoreD02(totalVal) : undefined;
          return { status: 'submitted', score, attemptId: parsed.attemptId, record: parsed };
        }
      }
    }

    const draftPrefix = `cunata:attempt:${encodeURIComponent(examId)}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(draftPrefix)) {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.phase === 'draft') {
            return { status: 'draft', attemptId: parsed.attemptId, record: parsed };
          }
        }
      }
    }
  } catch {
    // Graceful fallback
  }
  return { status: 'not-started' };
}

function appendChildren(parent: any, ...children: any[]): void {
  for (const c of children) {
    if (typeof c === 'string') {
      const doc = parent.ownerDocument || (typeof document !== 'undefined' ? document : null);
      if (doc) parent.appendChild(doc.createTextNode(c));
    } else if (c) {
      parent.appendChild(c);
    }
  }
}

export function mountStudentArea(
  container: HTMLElement,
  options: StudentAreaOptions = {}
): StudentAreaController {
  const doc = container.ownerDocument || (typeof document !== 'undefined' ? document : (container as any).doc);
  if (!doc) throw new Error('Document not available');
  const nowFn = options.now || (() => Date.now());

  let candidateName = '';
  try {
    candidateName = localStorage.getItem(STORAGE_NAME_KEY) || localStorage.getItem('cunata:last_candidate_name') || '';
  } catch {
    candidateName = '';
  }

  let joinedClasses: JoinedClass[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_CLASSES_KEY);
    if (raw) joinedClasses = JSON.parse(raw);
  } catch {
    joinedClasses = [];
  }

  let publicExams: StudentAreaExamEntry[] = [];
  let currentPreviewExam: (StudentAreaExamEntry & { assignmentId?: string; classCode?: string; openAt?: string; dueAt?: string }) | null = null;
  let isDisposed = false;

  container.textContent = '';
  container.classList.add('student-area-root', 'ui-page', 'ui-stack');

  // Inject student typography and layout patch strictly adhering to tokens.css
  if (doc && doc.head && !doc.getElementById('cunata-student-typography')) {
    const styleEl = doc.createElement('style');
    styleEl.id = 'cunata-student-typography';
    styleEl.textContent = `
      .candidate-input-wrap label { font-size: var(--fs-xs) !important; }
      .timer-box { font-size: var(--fs-md) !important; }
      .palette-title { font-size: var(--fs-md) !important; }
      .palette-progress-text { font-size: var(--fs-xs) !important; }
      .option-letter { font-size: var(--fs-xs) !important; }
      .statement-label { font-size: var(--fs-md) !important; }
      .tf-btn { font-size: var(--fs-xs) !important; }
      .quick-keys-bar span { font-size: var(--fs-xs) !important; }

      #examWrapper[style*="display: none"], .cunata-student-view .main-wrapper[style*="display: none"] {
        display: none !important;
      }

      @media (min-width: 1024px) {
        #examWrapper:not([style*="display: none"]), .cunata-student-view .main-wrapper:not([style*="display: none"]) {
          display: grid !important;
          grid-template-columns: 1fr 280px !important;
          gap: var(--sp-4, 16px) !important;
          align-items: start !important;
        }
        #examPane, #examWrapper #examPane {
          order: 1 !important;
        }
        .palette-card, #examWrapper .palette-card {
          order: 2 !important;
          position: sticky !important;
          top: 5rem !important;
          display: block !important;
        }
        #btnPalette {
          display: none !important;
        }
      }

      @media (max-width: 1023px) {
        #examWrapper:not([style*="display: none"]), .cunata-student-view .main-wrapper:not([style*="display: none"]) {
          display: block !important;
          grid-template-columns: 1fr !important;
        }
        #examPane, #examWrapper #examPane {
          width: 100% !important;
          order: 1 !important;
        }
        .palette-card, #examWrapper .palette-card {
          display: none !important;
          order: 2 !important;
        }
        .palette-card.is-open, #examWrapper .palette-card.is-open {
          display: block !important;
          position: fixed !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          top: auto !important;
          width: 100% !important;
          max-height: 75vh !important;
          overflow-y: auto !important;
          z-index: 1000 !important;
          border-radius: var(--r-lg, 16px) var(--r-lg, 16px) 0 0 !important;
          box-shadow: var(--shadow-2) !important;
          background: var(--c-surface) !important;
          border: 1px solid var(--c-border) !important;
          padding: var(--sp-4, 16px) var(--sp-4, 16px) var(--sp-6, 32px) var(--sp-4, 16px) !important;
        }
        .header-actions {
          flex-wrap: wrap !important;
          gap: var(--sp-2, 8px) !important;
        }
        #btnOpenExamList, #btnSubmit {
          white-space: nowrap !important;
          height: var(--target, 44px) !important;
          min-height: var(--target, 44px) !important;
          max-height: var(--target, 44px) !important;
          padding: 0 var(--sp-3, 12px) !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: var(--fs-xs, 12px) !important;
          line-height: 20px !important;
        }
        .sync-status-badge {
          flex-shrink: 0 !important;
          white-space: nowrap !important;
          height: var(--target, 44px) !important;
          display: inline-flex !important;
          align-items: center !important;
          padding: 0 var(--sp-2, 8px) !important;
        }
        #timerBox {
          white-space: nowrap !important;
          height: var(--target, 44px) !important;
          display: inline-flex !important;
          align-items: center !important;
          line-height: 20px !important;
        }
        #btnPalette {
          white-space: nowrap !important;
          height: var(--target, 44px) !important;
          min-height: var(--target, 44px) !important;
          max-height: var(--target, 44px) !important;
          padding: 0 var(--sp-2, 8px) !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 4px !important;
          font-size: var(--fs-xs, 12px) !important;
          line-height: 20px !important;
        }
        #btnPalette * {
          font-size: var(--fs-xs, 12px) !important;
        }
      }
    `;
    doc.head.appendChild(styleEl);
  }

  function ensurePaletteToggle(): void {
    if (!doc || doc.getElementById('btnPalette')) return;
    const headerActions = doc.querySelector('.header-actions');
    if (!headerActions) return;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.id = 'btnPalette';
    btn.className = 'btn-secondary btn-palette';
    btn.setAttribute('aria-label', 'Bảng số câu');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg><span>Số câu</span>';
    btn.addEventListener('click', () => {
      const pal = doc.querySelector('.palette-card') as HTMLElement | null;
      if (pal) {
        const willOpen = !pal.classList.contains('is-open');
        pal.classList.toggle('is-open');
        if (willOpen) {
          pal.setAttribute('tabindex', '-1');
          const firstFocusable = pal.querySelector<HTMLElement>('button, [tabindex="0"], a');
          (firstFocusable || pal).focus();
        } else {
          btn.focus();
        }
      }
    });
    doc.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        const pal = doc.querySelector('.palette-card') as HTMLElement | null;
        if (pal && pal.classList.contains('is-open')) {
          ev.preventDefault();
          pal.classList.remove('is-open');
          btn.focus();
        }
      }
    });
    const submitBtn = doc.getElementById('btnSubmit');
    if (submitBtn) {
      headerActions.insertBefore(btn, submitBtn);
    } else {
      headerActions.appendChild(btn);
    }
  }

  ensurePaletteToggle();
  if (doc) {
    doc.addEventListener('click', (ev) => {
      const target = ev.target as HTMLElement | null;
      if (target && target.closest('.palette-btn')) {
        const pal = doc.querySelector('.palette-card');
        if (pal && pal.classList.contains('is-open')) {
          pal.classList.remove('is-open');
        }
      }
    });
  }

  // ================= 1. Cổng nhập tên (#studentNameGate) =================
  const nameGateCard = Card(undefined, doc);
  nameGateCard.id = 'studentNameGate';
  nameGateCard.className = 'ui-card student-name-gate';

  const nameGateHeader = doc.createElement('div');
  nameGateHeader.className = 'student-name-gate-header';
  const nameGateTitle = doc.createElement('h2');
  nameGateTitle.textContent = 'Chào mừng bạn đến với Cunata!';
  const nameGateDesc = doc.createElement('p');
  nameGateDesc.className = 'student-name-gate-desc';
  nameGateDesc.textContent = 'Vui lòng nhập họ và tên của bạn để bắt đầu làm bài và lưu kết quả.';
  appendChildren(nameGateHeader, nameGateTitle, nameGateDesc);

  const nameFieldWrap = doc.createElement('div');
  nameFieldWrap.className = 'ui-field';
  const nameLabel = doc.createElement('label');
  nameLabel.className = 'ui-field-label';
  nameLabel.htmlFor = 'startName';
  nameLabel.textContent = 'Họ và tên thí sinh';

  const nameInput = doc.createElement('input');
  nameInput.id = 'startName';
  nameInput.type = 'text';
  nameInput.className = 'ui-control';
  nameInput.placeholder = 'Nhập họ và tên hoặc mã dự thi...';
  nameInput.autocomplete = 'name';
  nameInput.value = candidateName;

  appendChildren(nameFieldWrap, nameLabel, nameInput);

  const btnNameContinue = Button({
    id: 'btnNameContinue',
    label: 'Tiếp tục',
    variant: 'primary',
    disabled: candidateName.trim().length === 0,
    onClick: () => {
      const val = nameInput.value.trim();
      if (!val) return;
      candidateName = val;
      try {
        localStorage.setItem(STORAGE_NAME_KEY, val);
        localStorage.setItem('cunata:candidate_name', val);
        localStorage.setItem('cunata:last_candidate_name', val);
      } catch {}
      syncNameState();
    },
  }, doc);

  appendChildren(nameGateCard, nameGateHeader, nameFieldWrap, btnNameContinue);
  container.appendChild(nameGateCard);

  nameInput.addEventListener('input', () => {
    btnNameContinue.disabled = nameInput.value.trim().length === 0;
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !btnNameContinue.disabled) {
      e.preventDefault();
      btnNameContinue.click();
    }
  });

  // ================= 2. Nội dung chính của học sinh (#studentMainArea) =================
  const mainArea = doc.createElement('div');
  mainArea.id = 'studentMainArea';
  mainArea.className = 'student-main-area ui-stack';
  container.appendChild(mainArea);

  // Top info bar in student content
  const studentTopBar = Card(undefined, doc);
  studentTopBar.className = 'ui-card student-profile-bar';
  const greetingEl = doc.createElement('div');
  greetingEl.className = 'student-greeting';
  const greetingName = doc.createElement('strong');
  greetingName.className = 'student-display-name';
  greetingName.textContent = candidateName;
  appendChildren(greetingEl, doc.createTextNode('Học sinh: '), greetingName);

  function resetName(): void {
    candidateName = '';
    try {
      localStorage.removeItem(STORAGE_NAME_KEY);
      localStorage.removeItem('cunata:candidate_name');
      localStorage.removeItem('cunata:student_name');
      localStorage.removeItem('cunata:last_candidate_name');
    } catch {}
    nameInput.value = '';
    btnNameContinue.disabled = true;
    syncNameState();
    container.style.display = '';
    const startScreen = doc.querySelector('#startScreen') as HTMLElement | null;
    if (startScreen) startScreen.style.display = '';
    const exWrapper = doc.querySelector('#examWrapper') as HTMLElement | null;
    if (exWrapper) exWrapper.style.display = 'none';
    const repWrapper = doc.querySelector('#reportWrapper') as HTMLElement | null;
    if (repWrapper) repWrapper.style.display = 'none';
    nameInput.focus();
  }

  const btnChangeName = Button({
    id: 'btnChangeName',
    label: 'Đổi tên',
    variant: 'ghost',
    onClick: () => {
      resetName();
    },
  }, doc);

  appendChildren(studentTopBar, greetingEl, btnChangeName);
  mainArea.appendChild(studentTopBar);

  // Vào lớp học bằng mã
  const joinClassCard = Card(undefined, doc);
  joinClassCard.className = 'ui-card student-join-class-card';
  const joinTitle = doc.createElement('h3');
  joinTitle.textContent = 'Vào lớp học bằng mã';
  const joinDesc = doc.createElement('p');
  joinDesc.className = 'student-section-desc';
  joinDesc.textContent = 'Nhập mã gồm 6 ký tự do giáo viên cung cấp để xem danh sách đề được giao.';

  const joinRow = doc.createElement('div');
  joinRow.className = 'student-join-row';

  const classCodeLabel = doc.createElement('label');
  classCodeLabel.htmlFor = 'classCodeInput';
  classCodeLabel.setAttribute('for', 'classCodeInput');
  classCodeLabel.className = 'ui-field-label class-code-label';
  classCodeLabel.textContent = 'Mã lớp học';

  const classCodeInput = doc.createElement('input');
  classCodeInput.id = 'classCodeInput';
  classCodeInput.type = 'text';
  classCodeInput.className = 'ui-control';
  classCodeInput.placeholder = 'Mã lớp (ví dụ: ABCDEF)...';
  classCodeInput.maxLength = 10;
  classCodeInput.autocomplete = 'off';

  const classCodeError = doc.createElement('div');
  classCodeError.id = 'classCodeError';
  classCodeError.className = 'ui-field-error class-code-error';
  classCodeError.setAttribute('aria-live', 'polite');

  const showClassCodeError = (msg: string) => {
    classCodeError.textContent = msg;
    classCodeInput.setAttribute('aria-invalid', 'true');
    classCodeInput.setAttribute('aria-describedby', 'classCodeError');
  };
  const clearClassCodeError = () => {
    classCodeError.textContent = '';
    classCodeInput.removeAttribute('aria-invalid');
  };

  const btnJoinClass = Button({
    id: 'btnJoinClass',
    label: 'Vào lớp',
    variant: 'primary',
    onClick: async () => {
      const code = classCodeInput.value.trim().toUpperCase();
      if (!code) {
        showClassCodeError('Vui lòng nhập mã lớp học.');
        return;
      }
      clearClassCodeError();
      btnJoinClass.setLoading(true);
      try {
        const ok = await joinClassByCode(code);
        if (ok) {
          classCodeInput.value = '';
          clearClassCodeError();
        }
      } finally {
        btnJoinClass.setLoading(false);
      }
    },
  }, doc);

  appendChildren(joinRow, classCodeInput, btnJoinClass);
  appendChildren(joinClassCard, joinTitle, joinDesc, classCodeLabel, joinRow, classCodeError);
  mainArea.appendChild(joinClassCard);

  classCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnJoinClass.click();
    }
  });
  classCodeInput.addEventListener('input', () => {
    clearClassCodeError();
  });

  // Mục "Lớp của em" (#myClasses)
  const myClassesWrapper = doc.createElement('div');
  myClassesWrapper.id = 'myClassesWrapper';
  myClassesWrapper.className = 'ui-stack';
  const myClassesTitle = doc.createElement('h3');
  myClassesTitle.textContent = 'Lớp học của em';
  const myClassesContainer = doc.createElement('div');
  myClassesContainer.id = 'myClasses';
  myClassesContainer.className = 'my-classes-container ui-stack';
  appendChildren(myClassesWrapper, myClassesTitle, myClassesContainer);
  mainArea.appendChild(myClassesWrapper);

  // Mục "Đề luyện tập" (#practiceExams) - Ẩn theo WEB-contract §21
  const practiceWrapper = doc.createElement('div');
  practiceWrapper.id = 'practiceWrapper';
  practiceWrapper.className = 'ui-stack';
  practiceWrapper.style.display = 'none';
  const practiceTitle = doc.createElement('h3');
  practiceTitle.textContent = 'Đề luyện tập';
  const practiceDesc = doc.createElement('p');
  practiceDesc.className = 'student-section-desc';
  practiceDesc.textContent = 'Kho đề khảo sát và rèn luyện năng lực theo cấu trúc đề thi GDPT 2018.';
  const practiceNotice = doc.createElement('div');
  practiceNotice.id = 'practiceNotice';
  practiceNotice.className = 'ui-alert ui-alert--warning';
  practiceNotice.style.display = 'none';
  const practiceGrid = doc.createElement('div');
  practiceGrid.id = 'practiceExams';
  practiceGrid.className = 'ui-exam-grid practice-exams-grid';
  practiceGrid.style.display = 'none';
  appendChildren(practiceWrapper, practiceTitle, practiceDesc, practiceNotice, practiceGrid);
  mainArea.appendChild(practiceWrapper);

  // ================= 3. Hộp thoại xem trước đề (#examPreview) =================
  const examPreviewModal = doc.createElement('div');
  examPreviewModal.id = 'examPreview';
  examPreviewModal.className = 'ui-dialog-backdrop exam-preview-backdrop';
  examPreviewModal.setAttribute('role', 'dialog');
  examPreviewModal.setAttribute('aria-modal', 'true');
  examPreviewModal.setAttribute('aria-labelledby', 'previewExamTitle');
  examPreviewModal.setAttribute('aria-label', 'Xem trước đề thi');
  examPreviewModal.style.display = 'none';
  let previewReturnFocus: HTMLElement | null = null;
  // Esc hoặc bấm ra vùng nền ngoài thẻ thì đóng hộp thoại.
  examPreviewModal.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); closePreview(); } });
  examPreviewModal.addEventListener('click', (ev) => { if (ev.target === examPreviewModal) closePreview(); });

  const previewCard = Card(undefined, doc);
  previewCard.className = 'ui-card exam-preview-card';

  const previewHeading = doc.createElement('div');
  previewHeading.className = 'exam-preview-header';
  const previewTitle = doc.createElement('h2');
  previewTitle.id = 'previewExamTitle';
  previewTitle.className = 'exam-preview-title';
  previewTitle.className = 'exam-preview-title';
  const btnClosePreview = Button({
    label: 'Đóng',
    icon: 'close',
    iconOnly: true,
    variant: 'ghost',
    onClick: () => closePreview(),
  }, doc);
  appendChildren(previewHeading, previewTitle, btnClosePreview);

  const previewDesc = doc.createElement('p');
  previewDesc.className = 'exam-preview-desc';

  const previewMeta = doc.createElement('div');
  previewMeta.className = 'exam-preview-meta';

  const previewDates = doc.createElement('div');
  previewDates.className = 'exam-preview-dates';

  const previewStatusWrap = doc.createElement('div');
  previewStatusWrap.className = 'exam-preview-status-wrap';

  const previewLockMsg = doc.createElement('div');
  previewLockMsg.className = 'exam-preview-lock-msg';

  const previewActions = doc.createElement('div');
  previewActions.className = 'ui-actions exam-preview-actions';

  const btnStartExam = Button({
    id: 'btnStartExam',
    label: 'Bắt đầu làm bài',
    variant: 'primary',
    onClick: async () => {
      if (!currentPreviewExam) return;
      await handleStartOrResumeExam(currentPreviewExam);
    },
  }, doc);

  const btnCancelPreview = Button({
    label: 'Quay lại',
    variant: 'secondary',
    onClick: () => closePreview(),
  }, doc);

  appendChildren(previewActions, btnCancelPreview, btnStartExam);
  appendChildren(previewCard, previewHeading, previewDesc, previewMeta, previewDates, previewStatusWrap, previewLockMsg, previewActions);
  examPreviewModal.appendChild(previewCard);
  container.appendChild(examPreviewModal);

  // ================= Helper logic & rendering =================

  function syncNameState(): void {
    const hasName = candidateName.trim().length > 0;
    nameGateCard.style.display = hasName ? 'none' : '';
    mainArea.style.display = hasName ? '' : 'none';
    greetingName.textContent = candidateName;

    const candidateNameInputs = doc.querySelectorAll<HTMLInputElement>('#candidateName');
    candidateNameInputs.forEach((inp) => {
      if (candidateName) {
        inp.value = candidateName;
      }
      inp.readOnly = true;
      inp.setAttribute('readonly', 'readonly');
      try {
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    });

    // Update TopBar person display
    const topBarPerson = doc.querySelector('.ui-topbar-person');
    if (topBarPerson) {
      topBarPerson.textContent = candidateName;
      topBarPerson.setAttribute('title', candidateName);
    }
  }

  function getEffectiveStatus(
    examId: string,
    openAt?: string,
    dueAt?: string
  ): { status: ExamStatus; score?: string; lockReason?: string; record?: AttemptRecord } {
    const attempt = getLocalAttemptInfo(examId);
    const now = nowFn();

    if (openAt) {
      const openTime = new Date(openAt).getTime();
      if (now < openTime && attempt.status !== 'submitted') {
        return {
          status: 'not-open',
          lockReason: `Đề thi chưa đến giờ mở (Giờ mở: ${formatDateVi(openAt)})`,
        };
      }
    }

    if (dueAt) {
      const dueTime = new Date(dueAt).getTime();
      if (now > dueTime && attempt.status !== 'submitted') {
        return {
          status: 'expired',
          lockReason: `Đề thi đã hết hạn nộp (Hạn: ${formatDateVi(dueAt)})`,
        };
      }
    }

    return attempt;
  }

  function openPreview(
    exam: StudentAreaExamEntry & { assignmentId?: string; classCode?: string; openAt?: string; dueAt?: string }
  ): void {
    if (!exam.url) {
      const pub = publicExams.find((p) => p.id === exam.id);
      if (pub && pub.url) exam.url = pub.url;
    }
    currentPreviewExam = exam;
    previewTitle.textContent = exam.title;
    previewDesc.textContent = exam.description || `Đề luyện tập ${exam.questionCount} câu theo cấu trúc tốt nghiệp THPT`;
    previewMeta.textContent = `${exam.questionCount} câu · ${exam.durationMinutes} phút`;

    previewDates.textContent = '';
    if (exam.openAt) {
      const openDiv = doc.createElement('div');
      openDiv.textContent = `Mở: ${formatDateVi(exam.openAt)}`;
      previewDates.appendChild(openDiv);
    }
    if (exam.dueAt) {
      const dueDiv = doc.createElement('div');
      dueDiv.textContent = `Hạn nộp: ${formatDateVi(exam.dueAt)}`;
      previewDates.appendChild(dueDiv);
    }

    const eff = getEffectiveStatus(exam.id, exam.openAt, exam.dueAt);
    previewStatusWrap.replaceChildren(StatusBadge({ status: eff.status, score: eff.score }, doc));

    if (eff.status === 'not-open') {
      previewLockMsg.textContent = eff.lockReason || 'Đề thi chưa đến giờ mở.';
      previewLockMsg.style.display = '';
      btnStartExam.disabled = true;
      btnStartExam.textContent = 'Chưa mở';
    } else if (eff.status === 'expired') {
      previewLockMsg.textContent = eff.lockReason || 'Đề thi đã hết hạn nộp.';
      previewLockMsg.style.display = '';
      btnStartExam.disabled = true;
      btnStartExam.textContent = 'Hết hạn';
    } else {
      previewLockMsg.textContent = '';
      previewLockMsg.style.display = 'none';
      btnStartExam.disabled = false;
      if (eff.status === 'submitted') {
        btnStartExam.textContent = 'Xem kết quả';
      } else if (eff.status === 'draft') {
        btnStartExam.textContent = 'Làm tiếp';
      } else {
        btnStartExam.textContent = 'Bắt đầu làm bài';
      }
    }

    const activeEl = doc.activeElement;
    previewReturnFocus = (typeof HTMLElement !== 'undefined' && activeEl instanceof HTMLElement)
      ? activeEl
      : (activeEl && typeof (activeEl as any).focus === 'function' ? (activeEl as any) : null);
    examPreviewModal.style.display = 'flex';
    // Hộp thoại phải nổi giữa khung nhìn và nhận focus (WEB-contract 19.1; lỗi thật 19/11/2026: rơi xuống cuối trang).
    (btnStartExam.disabled ? btnClosePreview : btnStartExam).focus();
  }

  function closePreview(): void {
    const wasOpen = examPreviewModal.style.display !== 'none';
    examPreviewModal.style.display = 'none';
    currentPreviewExam = null;
    if (wasOpen && previewReturnFocus && doc.contains(previewReturnFocus)) previewReturnFocus.focus();
    previewReturnFocus = null;
  }

  async function handleStartOrResumeExam(
    exam: StudentAreaExamEntry & { assignmentId?: string; classCode?: string; openAt?: string; dueAt?: string }
  ): Promise<void> {
    closePreview();
    ensurePaletteToggle();
    if (!candidateName.trim()) {
      syncNameState();
      return;
    }

    const eff = getEffectiveStatus(exam.id, exam.openAt, exam.dueAt);

    // Set active assignment metadata if any
    try {
      const win = doc.defaultView || (typeof window !== 'undefined' ? window : null);
      const sess = (win && (win as any).sessionStorage) || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
      const loc = (win && (win as any).localStorage) || (typeof localStorage !== 'undefined' ? localStorage : null);

      if (exam.assignmentId || exam.classCode) {
        const metaObj = {
          classCode: exam.classCode,
          assignmentId: exam.assignmentId,
          class_code: exam.classCode,
          assignment_id: exam.assignmentId,
          openAt: exam.openAt,
          dueAt: exam.dueAt,
          open_at: exam.openAt,
          due_at: exam.dueAt,
          examId: exam.id,
        };
        const metaStr = JSON.stringify(metaObj);
        sess?.setItem(STORAGE_ACTIVE_ASSIGNMENT_KEY, metaStr);
        sess?.setItem('cunata_active_assignment', metaStr);
        try {
          loc?.setItem(STORAGE_ACTIVE_ASSIGNMENT_KEY, metaStr);
          loc?.setItem('cunata_active_assignment', metaStr);
        } catch {}
      } else {
        sess?.removeItem(STORAGE_ACTIVE_ASSIGNMENT_KEY);
        sess?.removeItem('cunata_active_assignment');
        try {
          loc?.removeItem(STORAGE_ACTIVE_ASSIGNMENT_KEY);
          loc?.removeItem('cunata_active_assignment');
        } catch {}
      }
    } catch {}

    btnStartExam.setLoading(true);
    try {
      let fullExam: WebExam | null = null;
      if (eff.record?.examSnapshot) {
        fullExam = eff.record.examSnapshot;
      }
      let asClient = options.client;
      if (!asClient) {
        try {
          const cfg = await loadAppConfig();
          const url = options.appsScriptUrl || cfg.appsScriptUrl;
          if (url && url.trim()) {
            asClient = createAppsScriptClient(url.trim());
          }
        } catch {}
      }

      if (exam.source === 'teacher' && asClient && asClient.configured) {
        const res = await asClient.getExam(exam.id);
        if (res.ok) {
          const parsed = parseExam(res.value);
          if (parsed.ok) {
            fullExam = parsed.value;
          } else {
            throw new Error('Dữ liệu đề thi không hợp lệ: ' + parsed.issues.map((i: any) => `${i.code}: ${i.message}`).join('; '));
          }
        } else {
          throw new Error(res.message || 'Không tìm thấy đề thi trên máy chủ');
        }
      } else {
        let examUrl = exam.url;
        if (!examUrl) {
          if (publicExams.length === 0) {
            await loadPublicExams();
          }
          const pub = publicExams.find((p) => p.id === exam.id);
          if (pub && pub.url) examUrl = pub.url;
        }
        if (examUrl) {
          try {
            const res = await fetch(examUrl, { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              const parsed = parseExam(data);
              if (parsed.ok) fullExam = parsed.value;
            }
          } catch {}
        }
        if (!fullExam && asClient && asClient.configured) {
          try {
            const res = await asClient.getExam(exam.id);
            if (res.ok) {
              const parsed = parseExam(res.value);
              if (parsed.ok) fullExam = parsed.value;
            }
          } catch {}
        }
        if (!fullExam) {
          try {
            const res = await fetch(`public/exams/${exam.id}.json`, { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              const parsed = parseExam(data);
              if (parsed.ok) fullExam = parsed.value;
            }
          } catch {}
        }
      }

      if (options.onStartExam && fullExam) {
        container.style.display = 'none';
        const startExamPayload = (exam.assignmentId || exam.classCode)
          ? {
              ...fullExam,
              classCode: exam.classCode,
              assignmentId: exam.assignmentId,
              class_code: exam.classCode,
              assignment_id: exam.assignmentId,
              openAt: exam.openAt,
              dueAt: exam.dueAt,
              open_at: exam.openAt,
              due_at: exam.dueAt,
            }
          : fullExam;

        if (exam.assignmentId || exam.classCode) {
          options.onStartExam(startExamPayload, candidateName, {
            assignmentId: exam.assignmentId,
            classCode: exam.classCode,
            openAt: exam.openAt,
            dueAt: exam.dueAt,
            assignment_id: exam.assignmentId,
            class_code: exam.classCode,
            open_at: exam.openAt,
            due_at: exam.dueAt,
          });
        } else {
          options.onStartExam(startExamPayload, candidateName, undefined);
        }
      } else {
        if (eff.status === 'submitted') {
          const repWrapper = doc.querySelector('#reportWrapper') as HTMLElement | null;
          const exWrapper = doc.querySelector('#examWrapper') as HTMLElement | null;
          if (repWrapper) repWrapper.style.display = '';
          if (exWrapper) exWrapper.style.display = 'none';
          container.style.display = 'none';
        } else {
          // Fallback: trigger standard bootstrap start if global callback exists
          const exWrapper = doc.querySelector('#examWrapper') as HTMLElement | null;
          if (exWrapper) exWrapper.style.display = '';
          container.style.display = 'none';
        }
      }
    } catch (err: any) {
      if (typeof alert === 'function') {
        alert('Không thể tải nội dung đề thi: ' + (err?.message || String(err)));
      } else {
        console.error('Không thể tải nội dung đề thi:', err);
      }
    } finally {
      btnStartExam.setLoading(false);
    }
  }

  function renderClasses(): void {
    myClassesContainer.textContent = '';
    if (joinedClasses.length === 0) {
      myClassesWrapper.style.display = 'none';
      return;
    }
    myClassesWrapper.style.display = '';

    for (const c of joinedClasses) {
      const section = doc.createElement('section');
      section.className = 'class-section ui-card';
      section.dataset.classCode = c.code;

      const head = doc.createElement('div');
      head.className = 'class-section-header';
      const cTitle = doc.createElement('h4');
      cTitle.textContent = `${c.name} — Giáo viên: ${c.teacherName}`;
      const cCode = doc.createElement('span');
      cCode.className = 'class-code-badge';
      cCode.textContent = `Mã lớp: ${c.code}`;
      appendChildren(head, cTitle, cCode);
      section.appendChild(head);

      const grid = doc.createElement('div');
      grid.className = 'ui-exam-grid';

      if (!c.assignments || c.assignments.length === 0) {
        const emptyMsg = doc.createElement('p');
        emptyMsg.className = 'student-section-desc';
        emptyMsg.textContent = 'Chưa có đề thi nào được giao trong lớp này.';
        section.appendChild(emptyMsg);
      } else {
        for (const a of c.assignments) {
          const eff = getEffectiveStatus(a.examId, a.openAt, a.dueAt);
          const pub = publicExams.find((p) => p.id === a.examId);
          const resolvedUrl = pub?.url;
          const displayTitle = (a.title && a.title !== a.examId) ? a.title : (pub?.title || a.title || a.examId);
          const displaySubject = a.subject || pub?.subject || 'Đề thi';
          const displayCount = a.questionCount || pub?.questionCount || 0;
          const displayDuration = a.durationMinutes || pub?.durationMinutes || 50;
          const card = ExamCard(
            {
              id: a.examId,
              assignmentId: a.assignmentId,
              url: resolvedUrl,
              title: displayTitle,
              subject: displaySubject,
              questionCount: displayCount,
              durationMinutes: displayDuration,
              openAt: formatDateVi(a.openAt),
              dueAt: formatDateVi(a.dueAt),
              status: eff.status,
              score: eff.score,
              onClick: () => {
                openPreview({
                  id: a.examId,
                  assignmentId: a.assignmentId,
                  classCode: c.code,
                  url: resolvedUrl,
                  title: displayTitle,
                  subject: displaySubject,
                  questionCount: displayCount,
                  durationMinutes: displayDuration,
                  openAt: a.openAt,
                  dueAt: a.dueAt,
                });
              },
            },
            doc
          );
          grid.appendChild(card);
        }
        section.appendChild(grid);
      }

      myClassesContainer.appendChild(section);
    }
  }

  let teacherError = '';

  function renderPracticeExams(): void {
    if (teacherError) {
      practiceNotice.textContent = `Lưu ý: ${teacherError}`;
      practiceNotice.style.display = '';
    } else {
      practiceNotice.textContent = '';
      practiceNotice.style.display = 'none';
    }
    practiceWrapper.style.display = 'none';
    practiceGrid.style.display = 'none';
    practiceGrid.textContent = '';

    for (const exam of publicExams) {
      const eff = getEffectiveStatus(exam.id, exam.openAt, exam.dueAt);
      const card = ExamCard(
        {
          id: exam.id,
          assignmentId: exam.assignmentId,
          url: exam.url,
          title: exam.title || exam.id,
          subject: exam.subject || 'Đề thi',
          questionCount: exam.questionCount || 0,
          durationMinutes: exam.durationMinutes || 50,
          openAt: exam.openAt ? formatDateVi(exam.openAt) : undefined,
          dueAt: exam.dueAt ? formatDateVi(exam.dueAt) : undefined,
          status: eff.status,
          score: eff.score,
          onClick: () => {
            openPreview(exam);
          },
        },
        doc
      );
      practiceGrid.appendChild(card);
    }
  }

  async function loadPublicExams(): Promise<void> {
    let staticExams: StudentAreaExamEntry[] = [];
    let teacherExams: StudentAreaExamEntry[] = [];
    teacherError = '';

    try {
      const res = await fetch('public/exams/index.json', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.exams)) {
          staticExams = data.exams.map((e: any) => ({
            id: String(e.id || ''),
            title: String(e.title || ''),
            subject: String(e.subject || ''),
            grade: Number(e.grade) || 12,
            durationMinutes: Number(e.durationMinutes) || 50,
            questionCount: Number(e.questionCount) || 0,
            url: String(e.url || ''),
            source: 'static' as const,
            description: e.description || `Đề luyện tập ${Number(e.questionCount) || 0} câu theo cấu trúc tốt nghiệp THPT`,
          }));
        }
      }
    } catch {
      staticExams = [];
    }

    let asClient = options.client;
    if (!asClient) {
      try {
        const cfg = await loadAppConfig();
        const url = options.appsScriptUrl || cfg.appsScriptUrl;
        if (url && url.trim()) {
          asClient = createAppsScriptClient(url.trim());
        }
      } catch {}
    }

    if (asClient && asClient.configured) {
      try {
        const res = await asClient.listExams();
        if (res.ok && Array.isArray(res.value)) {
          teacherExams = res.value.map((e: any) => ({
            id: String(e.id || ''),
            title: String(e.title || ''),
            subject: String(e.subject || ''),
            grade: Number(e.grade) || 12,
            durationMinutes: Number(e.durationMinutes) || 50,
            questionCount: Number(e.questionCount) || 0,
            source: 'teacher' as const,
            description: e.description || `Đề giáo viên xuất bản · ${Number(e.questionCount) || 0} câu`,
          }));
        } else {
          teacherError = (res as any)?.error?.message || (res as any)?.message || 'Không thể tải danh sách đề từ giáo viên';
        }
      } catch (err: any) {
        teacherError = err?.message || 'Không thể tải danh sách đề từ giáo viên';
      }
    }

    const teacherMap = new Map<string, StudentAreaExamEntry>();
    for (const te of teacherExams) {
      if (te.id) teacherMap.set(te.id, te);
    }

    const merged: StudentAreaExamEntry[] = [];
    const handledIds = new Set<string>();

    for (const se of staticExams) {
      if (teacherMap.has(se.id)) {
        merged.push(teacherMap.get(se.id)!);
        handledIds.add(se.id);
      } else {
        merged.push(se);
        handledIds.add(se.id);
      }
    }

    for (const te of teacherExams) {
      if (!handledIds.has(te.id)) {
        merged.push(te);
        handledIds.add(te.id);
      }
    }

    publicExams = merged;
  }

  async function joinClassByCode(code: string): Promise<boolean> {
    try {
      let data: any = null;
      if (options.client && options.client.configured) {
        const res = await options.client.getClass(code);
        if (res.ok) {
          data = { success: true, class: (res.value as any).class || res.value, assignments: (res.value as any).assignments || [] };
        } else {
          showClassCodeError(res.message || 'Mã lớp không chính xác hoặc không tồn tại.');
          return false;
        }
      } else {
        const config = await loadAppConfig();
        const url = options.appsScriptUrl || config.appsScriptUrl;
        if (!url) {
          showClassCodeError('Chức năng máy chủ Google Apps Script chưa cấu hình.');
          return false;
        }
        const reqUrl = `${url}?action=getClass&code=${encodeURIComponent(code)}&_t=${Date.now()}`;
        const res = await fetch(reqUrl, { cache: 'no-store' });
        if (!res.ok) {
          showClassCodeError('Lỗi kết nối máy chủ.');
          return false;
        }
        data = await res.json();
      }
      if (!data || !data.success || !data.class) {
        showClassCodeError(data?.message || 'Mã lớp không chính xác hoặc không tồn tại.');
        return false;
      }

      const newCls: JoinedClass = {
        code: data.class.code,
        name: data.class.name,
        teacherName: data.class.teacherName,
        assignments: (data.assignments || []).map((a: any) => ({
          assignmentId: a.assignmentId,
          classCode: data.class.code,
          className: data.class.name,
          teacherName: data.class.teacherName,
          examId: a.examId,
          title: a.title,
          subject: a.subject,
          questionCount: Number(a.questionCount) || 0,
          durationMinutes: Number(a.durationMinutes) || 50,
          openAt: a.openAt,
          dueAt: a.dueAt,
        })),
      };

      joinedClasses = joinedClasses.filter((c) => c.code !== newCls.code).concat(newCls);
      try {
        localStorage.setItem(STORAGE_CLASSES_KEY, JSON.stringify(joinedClasses));
      } catch {}

      renderClasses();
      return true;
    } catch (err: any) {
      showClassCodeError('Lỗi kết nối: ' + (err?.message || String(err)));
      return false;
    }
  }

  async function refreshClasses(): Promise<void> {
    if (joinedClasses.length === 0) return;
    const config = await loadAppConfig();
    const url = options.appsScriptUrl || config.appsScriptUrl;
    if (!url) return;

    let updated = false;
    await Promise.all(
      joinedClasses.map(async (cls, idx) => {
        try {
          const reqUrl = `${url}?action=getClass&code=${encodeURIComponent(cls.code)}&_t=${Date.now()}`;
          const res = await fetch(reqUrl, { cache: 'no-store' });
          if (!res.ok) return;
          const data = await res.json();
          if (data && data.success && data.class) {
            joinedClasses[idx] = {
              code: data.class.code,
              name: data.class.name,
              teacherName: data.class.teacherName,
              assignments: (data.assignments || []).map((a: any) => ({
                assignmentId: a.assignmentId,
                classCode: data.class.code,
                className: data.class.name,
                teacherName: data.class.teacherName,
                examId: a.examId,
                title: a.title,
                subject: a.subject,
                questionCount: Number(a.questionCount) || 0,
                durationMinutes: Number(a.durationMinutes) || 50,
                openAt: a.openAt,
                dueAt: a.dueAt,
              })),
            };
            updated = true;
          }
        } catch {}
      })
    );

    if (updated) {
      try {
        localStorage.setItem(STORAGE_CLASSES_KEY, JSON.stringify(joinedClasses));
      } catch {}
      renderClasses();
    }
  }

  async function refreshList(): Promise<void> {
    await loadPublicExams();
    renderClasses();
    renderPracticeExams();
    await refreshClasses();
  }

  // Global listener for change name button (e.g. in TopBar)
  const onDocClick = (e: Event) => {
    const target = (e.target as HTMLElement | null)?.closest?.('#btnChangeName');
    if (target) {
      resetName();
    }
  };
  doc.addEventListener('click', onDocClick);

  // Initial setup
  syncNameState();
  void refreshList().then(() => {
    if (typeof window !== 'undefined') {
      const getParam = (key: string): string | null => {
        try {
          const sParams = new URLSearchParams(window.location.search);
          if (sParams.has(key)) return sParams.get(key);
          const hash = window.location.hash || '';
          const qIdx = hash.indexOf('?');
          if (qIdx !== -1) {
            const hParams = new URLSearchParams(hash.slice(qIdx));
            if (hParams.has(key)) return hParams.get(key);
          }
        } catch {}
        return null;
      };

      const qExam = options.initialExamId || getParam('exam');
      if (qExam) {
        // WEB-contract §21: Mở ?exam= KHÔNG mở #examPreview hay bài thi;
        // vào khu học sinh và hiện thông báo có chữ "giáo viên giao"
        let noticeEl = doc.querySelector('#examNotAllowedNotice') as HTMLElement | null;
        if (!noticeEl) {
          noticeEl = doc.createElement('div');
          noticeEl.id = 'examNotAllowedNotice';
          noticeEl.className = 'ui-alert ui-alert--info student-exam-notice';
          noticeEl.textContent = 'Đề này chỉ làm được khi giáo viên giao cho lớp của em.';
          mainArea.prepend(noticeEl);
        }
      }

      const qLop = getParam('lop');
      if (qLop) {
        classCodeInput.value = qLop;
        void joinClassByCode(qLop);
      }
    }
  });

  return {
    async refreshList() {
      await refreshList();
    },
    async selectExamId(id: string) {
      const found = publicExams.find((e) => e.id === id || e.url === id);
      if (found) {
        openPreview(found);
      }
    },
    async joinClass(code: string) {
      return joinClassByCode(code);
    },
    setCandidateName(name: string) {
      candidateName = name;
      try {
        if (!name) {
          localStorage.removeItem(STORAGE_NAME_KEY);
          localStorage.removeItem('cunata:candidate_name');
          localStorage.removeItem('cunata:student_name');
          localStorage.removeItem('cunata:last_candidate_name');
        } else {
          localStorage.setItem(STORAGE_NAME_KEY, name);
          localStorage.setItem('cunata:candidate_name', name);
        }
      } catch {}
      nameInput.value = name;
      btnNameContinue.disabled = !name.trim();
      syncNameState();
    },
    getCandidateName() {
      return candidateName;
    },
    resetName() {
      resetName();
    },
    dispose() {
      isDisposed = true;
      doc.removeEventListener('click', onDocClick);
      closePreview();
    },
  };
}

export function initStartScreen(
  root: HTMLElement,
  options: any
): StudentAreaController {
  const container = (root.querySelector('#startScreen') as HTMLElement) || root;
  return mountStudentArea(container, options);
}
