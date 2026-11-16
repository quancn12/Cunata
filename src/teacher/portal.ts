/// <reference lib="dom" />

/**
 * Cunata Web — Teacher Portal (src/teacher/portal.ts)
 * Conforms to WEB-contract.md §17.4, §18.1 and Shared Product Contract v2.0.
 *
 * Implements:
 * - #teacherLogin: password input (#teacherPassword), login button (#btnTeacherLogin),
 *   error container (#teacherLoginError), and unconfigured state notice.
 * - #teacherPanel: lists exams from deps.listAllExams() as .teacher-exam-row[data-exam-id].
 * - .btn-teacher-edit: loads full exam via entry.load() and calls deps.openBuilder(exam, { onPublish }).
 * - .btn-teacher-unpublish (for teacher source): calls client.unpublishExam(password, id) and refreshes list.
 * - #btnTeacherNewExam: calls deps.openBuilder(null, { onPublish }).
 * - onPublish: calls client.publishExam(password, exam) and returns AsResult.
 * - Password strictly kept in sessionStorage ('cunata_teacher_pw'); never in localStorage, never in URL.
 * - Accessible modal dialog: role="dialog", aria-modal="true", Esc key dismiss, focus trap, and return focus.
 */

import { trapFocus } from "../ui/index.ts";

export type AsResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; details?: unknown };

export interface PublishedExamMeta {
  id: string;
  title: string;
  subject: string;
  grade: number | null;
  durationMinutes: number | null;
  questionCount: number;
  group: string;
  revision: number;
  updatedAt: string;
}

export interface AppsScriptClient {
  readonly configured: boolean;
  listExams(): Promise<AsResult<PublishedExamMeta[]>>;
  getExam(id: string): Promise<AsResult<unknown>>;
  teacherLogin(password: string): Promise<AsResult<true>>;
  publishExam(password: string, exam: unknown): Promise<AsResult<{ examId: string; revision: number }>>;
  unpublishExam(password: string, examId: string): Promise<AsResult<true>>;
}

export interface TeacherExamEntry {
  id: string;
  title: string;
  source: 'static' | 'teacher';
  load(): Promise<unknown>;
  questionCount?: number;
  durationMinutes?: number;
}

export interface TeacherPortalDeps {
  client: AppsScriptClient;
  listAllExams(): Promise<Array<{ id: string; title: string; source: 'static' | 'teacher'; load(): Promise<unknown> }>>;
  openBuilder(
    exam: unknown | null,
    opts: {
      onPublish(exam: unknown): Promise<AsResult<{ examId: string; revision: number }>>;
    }
  ): void;
}

export interface TeacherPortalController {
  open(): void;
  close(): void;
  refreshList(): Promise<void>;
  dispose(): void;
}

export const TEACHER_SESSION_PW_KEY = 'cunata_teacher_pw';

export function getStoredTeacherPassword(): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(TEACHER_SESSION_PW_KEY);
    }
  } catch {
    // Ignore storage availability errors
  }
  return null;
}

export function setStoredTeacherPassword(pw: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TEACHER_SESSION_PW_KEY, pw);
    }
  } catch {
    // Ignore storage availability errors
  }
}

export function clearStoredTeacherPassword(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(TEACHER_SESSION_PW_KEY);
    }
  } catch {
    // Ignore storage availability errors
  }
}

interface PortalElements {
  modal: HTMLElement;
  loginSection: HTMLElement;
  panelSection: HTMLElement;
  examListContainer: HTMLElement;
  closeBtn: HTMLElement | null;
  newExamBtn: HTMLElement | null;
}

function clearElementChildren(el: HTMLElement): void {
  el.textContent = '';
  while (el.childNodes && el.childNodes.length > 0) {
    const first = el.childNodes[0];
    if (!first) break;
    el.removeChild(first);
  }
}

function ensurePortalElements(root: HTMLElement): PortalElements {
  const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) {
    throw new Error('DOM Document is required to mount teacher portal');
  }

  // Look for #teacherModal in root or root's owner document
  let modal = root.querySelector('#teacherModal') as HTMLElement | null;
  if (!modal && root.id === 'teacherModal') {
    modal = root;
  }
  if (!modal && doc.getElementById) {
    modal = doc.getElementById('teacherModal');
  }

  if (!modal) {
    modal = doc.createElement('div');
    modal.id = 'teacherModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'teacherModalTitle');
    modal.setAttribute('tabindex', '-1');

    const content = doc.createElement('div');
    content.className = 'modal-content';
    content.style.maxWidth = '680px';
    content.style.width = '92%';

    const header = doc.createElement('div');
    header.className = 'modal-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '1rem';

    const title = doc.createElement('h2');
    title.id = 'teacherModalTitle';
    title.style.fontSize = '1.25rem';
    title.style.fontWeight = '700';
    title.style.margin = '0';
    title.textContent = 'Khu Vực Giáo Viên';

    const closeBtn = doc.createElement('button') as HTMLButtonElement;
    closeBtn.type = 'button';
    closeBtn.className = 'btn-close';
    closeBtn.id = 'btnCloseTeacherModal';
    closeBtn.setAttribute('aria-label', 'Đóng');
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '1.5rem';
    closeBtn.style.cursor = 'pointer';
    closeBtn.textContent = '×';

    header.appendChild(title);
    header.appendChild(closeBtn);
    content.appendChild(header);

    const loginSec = doc.createElement('div');
    loginSec.id = 'teacherLogin';
    loginSec.style.padding = '0.5rem 0';
    content.appendChild(loginSec);

    const panelSec = doc.createElement('div');
    panelSec.id = 'teacherPanel';
    panelSec.style.display = 'none';

    const panelHeader = doc.createElement('div');
    panelHeader.style.display = 'flex';
    panelHeader.style.justifyContent = 'space-between';
    panelHeader.style.alignItems = 'center';
    panelHeader.style.marginBottom = '1rem';
    panelHeader.style.flexWrap = 'wrap';
    panelHeader.style.gap = '0.5rem';

    const panelTitle = doc.createElement('h3');
    panelTitle.style.margin = '0';
    panelTitle.style.fontSize = '1rem';
    panelTitle.style.fontWeight = '600';
    panelTitle.textContent = 'Quản lý kho đề thi';

    const newBtn = doc.createElement('button') as HTMLButtonElement;
    newBtn.type = 'button';
    newBtn.className = 'btn-primary';
    newBtn.id = 'btnTeacherNewExam';
    newBtn.style.fontSize = '0.875rem';
    newBtn.style.padding = '0.4rem 0.75rem';
    newBtn.textContent = '+ Soạn đề mới';

    panelHeader.appendChild(panelTitle);
    panelHeader.appendChild(newBtn);
    panelSec.appendChild(panelHeader);

    const examListDiv = doc.createElement('div');
    examListDiv.id = 'teacherExamList';
    examListDiv.style.maxHeight = '400px';
    examListDiv.style.overflowY = 'auto';
    examListDiv.style.display = 'flex';
    examListDiv.style.flexDirection = 'column';
    examListDiv.style.gap = '0.5rem';
    panelSec.appendChild(examListDiv);

    content.appendChild(panelSec);
    modal.appendChild(content);
    root.appendChild(modal);
  }

  // Ensure modal accessibility attributes
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  if (!modal.hasAttribute('aria-labelledby') && !modal.hasAttribute('aria-label')) {
    modal.setAttribute('aria-labelledby', 'teacherModalTitle');
  }
  if (!modal.hasAttribute('tabindex')) {
    modal.setAttribute('tabindex', '-1');
  }

  let loginSection = modal.querySelector('#teacherLogin') as HTMLElement | null;
  if (!loginSection) {
    loginSection = doc.createElement('div');
    loginSection.id = 'teacherLogin';
    loginSection.style.padding = '0.5rem 0';
    const content = modal.querySelector('.modal-content') || modal;
    content.appendChild(loginSection);
  }

  let panelSection = modal.querySelector('#teacherPanel') as HTMLElement | null;
  if (!panelSection) {
    panelSection = doc.createElement('div');
    panelSection.id = 'teacherPanel';
    panelSection.style.display = 'none';
    const content = modal.querySelector('.modal-content') || modal;
    content.appendChild(panelSection);
  }

  let examListContainer = panelSection.querySelector('#teacherExamList') as HTMLElement | null;
  if (!examListContainer) {
    examListContainer = doc.createElement('div');
    examListContainer.id = 'teacherExamList';
    examListContainer.style.maxHeight = '400px';
    examListContainer.style.overflowY = 'auto';
    examListContainer.style.display = 'flex';
    examListContainer.style.flexDirection = 'column';
    examListContainer.style.gap = '0.5rem';
    panelSection.appendChild(examListContainer);
  }

  let newExamBtn = panelSection.querySelector('#btnTeacherNewExam') as HTMLElement | null;
  if (!newExamBtn) {
    const btn = doc.createElement('button') as HTMLButtonElement;
    btn.type = 'button';
    btn.className = 'btn-primary';
    btn.id = 'btnTeacherNewExam';
    btn.textContent = '+ Soạn đề mới';
    if (typeof (panelSection as any).insertBefore === 'function') {
      panelSection.insertBefore(btn, examListContainer);
    } else {
      panelSection.appendChild(btn);
    }
    newExamBtn = btn;
  }

  const closeBtn = modal.querySelector('#btnCloseTeacherModal') as HTMLElement | null;

  return {
    modal,
    loginSection,
    panelSection,
    examListContainer,
    closeBtn,
    newExamBtn,
  };
}

function renderUnconfiguredNotice(loginSection: HTMLElement, doc: Document): void {
  clearElementChildren(loginSection);

  const container = doc.createElement('div');
  container.className = 'teacher-unconfigured-notice';
  container.style.padding = '1.5rem';
  container.style.textAlign = 'center';
  container.style.color = 'var(--gray-700, #374151)';

  const titleP = doc.createElement('p');
  titleP.style.fontWeight = '600';
  titleP.style.fontSize = '1.05rem';
  titleP.style.marginBottom = '0.5rem';
  titleP.textContent = 'Chức năng máy chủ Google Apps Script chưa cấu hình.';

  const descP = doc.createElement('p');
  descP.style.fontSize = '0.875rem';
  descP.style.color = 'var(--gray-500, #6b7280)';
  descP.style.margin = '0';
  descP.textContent = 'Vui lòng thiết lập appsScriptUrl trong public/config.json để kích hoạt kho đề và tính năng giáo viên.';

  container.appendChild(titleP);
  container.appendChild(descP);
  loginSection.appendChild(container);
}

function renderLoginForm(loginSection: HTMLElement, doc: Document): {
  pwInput: HTMLInputElement;
  loginBtn: HTMLButtonElement;
  loginError: HTMLElement;
  cancelBtn: HTMLButtonElement | null;
} {
  let pwInput = loginSection.querySelector('#teacherPassword') as HTMLInputElement | null;
  let loginBtn = loginSection.querySelector('#btnTeacherLogin') as HTMLButtonElement | null;
  let loginError = loginSection.querySelector('#teacherLoginError') as HTMLElement | null;
  let cancelBtn = loginSection.querySelector('#btnCancelTeacherLogin') as HTMLButtonElement | null;

  if (!pwInput || !loginBtn || !loginError) {
    clearElementChildren(loginSection);

    const body = doc.createElement('div');
    body.id = 'teacherLoginBody';

    const fieldGroup = doc.createElement('div');
    fieldGroup.style.marginBottom = '1rem';

    const label = doc.createElement('label');
    label.setAttribute('for', 'teacherPassword');
    label.style.display = 'block';
    label.style.fontWeight = '600';
    label.style.marginBottom = '0.5rem';
    label.textContent = 'Mật khẩu giáo viên:';
    fieldGroup.appendChild(label);

    const input = doc.createElement('input') as HTMLInputElement;
    input.type = 'password';
    input.id = 'teacherPassword';
    input.placeholder = 'Nhập mật khẩu giáo viên...';
    input.style.width = '100%';
    input.style.padding = '0.625rem';
    input.style.border = '1px solid var(--border-color, #d1d5db)';
    input.style.borderRadius = '6px';
    input.style.boxSizing = 'border-box';
    input.setAttribute('autocomplete', 'current-password');
    fieldGroup.appendChild(input);
    body.appendChild(fieldGroup);

    loginError = doc.createElement('div');
    loginError.id = 'teacherLoginError';
    loginError.style.color = 'var(--danger, #ef4444)';
    loginError.style.marginBottom = '1rem';
    loginError.style.fontSize = '0.875rem';
    loginError.style.minHeight = '1.25rem';
    body.appendChild(loginError);

    const btnGroup = doc.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.justifyContent = 'flex-end';
    btnGroup.style.gap = '0.5rem';

    cancelBtn = doc.createElement('button') as HTMLButtonElement;
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-secondary';
    cancelBtn.id = 'btnCancelTeacherLogin';
    cancelBtn.textContent = 'Hủy';
    btnGroup.appendChild(cancelBtn);

    loginBtn = doc.createElement('button') as HTMLButtonElement;
    loginBtn.type = 'button';
    loginBtn.className = 'btn-primary';
    loginBtn.id = 'btnTeacherLogin';
    loginBtn.textContent = 'Đăng nhập';
    btnGroup.appendChild(loginBtn);

    body.appendChild(btnGroup);
    loginSection.appendChild(body);
    pwInput = input;
  }

  return { pwInput, loginBtn, loginError, cancelBtn };
}

export function mountTeacherPortal(
  root: HTMLElement,
  deps: TeacherPortalDeps
): TeacherPortalController {
  const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc) {
    throw new Error('DOM Document is required to mount teacher portal');
  }

  const elems = ensurePortalElements(root);
  let isModalOpen = false;
  let returnFocusTo: HTMLElement | null = null;

  // onPublish callback passed to builder
  const onPublish = async (
    exam: unknown
  ): Promise<AsResult<{ examId: string; revision: number }>> => {
    const pw = getStoredTeacherPassword() || '';
    if (!pw) {
      return {
        ok: false,
        code: 'UNAUTHORIZED',
        message: 'Chưa đăng nhập giáo viên',
      };
    }
    const res = await deps.client.publishExam(pw, exam);
    if (res.ok) {
      void refreshList();
    }
    return res;
  };

  // Refresh exam list inside #teacherPanel
  const refreshList = async (): Promise<void> => {
    clearElementChildren(elems.examListContainer);
    const loadingDiv = doc.createElement('div');
    loadingDiv.style.textAlign = 'center';
    loadingDiv.style.color = 'var(--gray-500, #6b7280)';
    loadingDiv.style.padding = '1rem';
    loadingDiv.textContent = 'Đang tải danh sách đề thi...';
    elems.examListContainer.appendChild(loadingDiv);

    try {
      const exams = await deps.listAllExams();
      clearElementChildren(elems.examListContainer);

      if (exams.length === 0) {
        const emptyDiv = doc.createElement('div');
        emptyDiv.style.textAlign = 'center';
        emptyDiv.style.color = 'var(--gray-500, #6b7280)';
        emptyDiv.style.padding = '1rem';
        emptyDiv.textContent = 'Chưa có đề thi nào.';
        elems.examListContainer.appendChild(emptyDiv);
        return;
      }

      for (const entry of exams) {
        const isTeacher = entry.source === 'teacher';
        const row = doc.createElement('div');
        row.className = 'teacher-exam-row';
        row.setAttribute('data-exam-id', entry.id);
        if (isTeacher) {
          row.setAttribute('data-exam-source', 'teacher');
        }
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '0.625rem 0.75rem';
        row.style.border = '1px solid var(--border-color, #e5e7eb)';
        row.style.borderRadius = '6px';
        row.style.background = 'var(--card-bg, #fff)';
        row.style.gap = '0.5rem';

        const infoDiv = doc.createElement('div');
        infoDiv.style.flex = '1';
        infoDiv.style.minWidth = '0';

        const titleEl = doc.createElement('strong');
        titleEl.style.fontSize = '0.9375rem';
        titleEl.style.display = 'block';
        titleEl.style.whiteSpace = 'nowrap';
        titleEl.style.overflow = 'hidden';
        titleEl.style.textOverflow = 'ellipsis';
        titleEl.style.color = 'var(--gray-900, #111827)';
        titleEl.textContent = entry.title;
        infoDiv.appendChild(titleEl);

        const metaSpan = doc.createElement('span');
        metaSpan.style.fontSize = '0.8125rem';
        metaSpan.style.color = 'var(--gray-500, #6b7280)';
        const metaParts: string[] = [];
        const anyEntry = entry as { questionCount?: number; durationMinutes?: number };
        if (typeof anyEntry.questionCount === 'number') {
          metaParts.push(`${anyEntry.questionCount} câu`);
        }
        if (typeof anyEntry.durationMinutes === 'number') {
          metaParts.push(`${anyEntry.durationMinutes} phút`);
        }
        metaParts.push(isTeacher ? 'Đã xuất bản' : 'Đề tĩnh');
        metaSpan.textContent = metaParts.join(' · ');
        infoDiv.appendChild(metaSpan);

        row.appendChild(infoDiv);

        const actionsDiv = doc.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '0.375rem';
        actionsDiv.style.flexShrink = '0';

        const btnEdit = doc.createElement('button') as HTMLButtonElement;
        btnEdit.type = 'button';
        btnEdit.className = 'btn-secondary btn-teacher-edit';
        btnEdit.style.fontSize = '0.8125rem';
        btnEdit.style.padding = '0.3rem 0.6rem';
        btnEdit.textContent = 'Sửa';
        btnEdit.addEventListener('click', async () => {
          try {
            btnEdit.disabled = true;
            const examData = await entry.load();
            closeModal();
            deps.openBuilder(examData, { onPublish });
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (typeof alert === 'function') {
              alert('Lỗi nạp đề thi để sửa: ' + msg);
            }
          } finally {
            btnEdit.disabled = false;
          }
        });
        actionsDiv.appendChild(btnEdit);

        if (isTeacher) {
          const btnUnpub = doc.createElement('button') as HTMLButtonElement;
          btnUnpub.type = 'button';
          btnUnpub.className = 'btn-secondary btn-teacher-unpublish';
          btnUnpub.style.fontSize = '0.8125rem';
          btnUnpub.style.padding = '0.3rem 0.6rem';
          btnUnpub.style.color = 'var(--danger, #ef4444)';
          btnUnpub.style.borderColor = '#fca5a5';
          btnUnpub.textContent = 'Gỡ xuất bản';
          btnUnpub.addEventListener('click', async () => {
            const ok = typeof confirm === 'function' ? confirm(`Gỡ xuất bản đề "${entry.title}"?`) : true;
            if (!ok) return;
            try {
              btnUnpub.disabled = true;
              const pw = getStoredTeacherPassword() || '';
              const res = await deps.client.unpublishExam(pw, entry.id);
              if (res.ok) {
                await refreshList();
              } else {
                const msg = res.message || res.code || 'Không thể gỡ xuất bản';
                if (typeof alert === 'function') {
                  alert('Lỗi gỡ xuất bản: ' + msg);
                }
              }
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              if (typeof alert === 'function') {
                alert('Lỗi kết nối máy chủ: ' + msg);
              }
            } finally {
              btnUnpub.disabled = false;
            }
          });
          actionsDiv.appendChild(btnUnpub);
        }

        row.appendChild(actionsDiv);
        elems.examListContainer.appendChild(row);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      clearElementChildren(elems.examListContainer);
      const errDiv = doc.createElement('div');
      errDiv.style.color = 'var(--danger, #ef4444)';
      errDiv.style.padding = '1rem';
      errDiv.style.textAlign = 'center';
      errDiv.textContent = 'Lỗi tải danh sách đề: ' + msg;
      elems.examListContainer.appendChild(errDiv);
    }
  };

  const closeModal = (): void => {
    if (!isModalOpen) return;
    isModalOpen = false;
    elems.modal.style.display = 'none';

    if (returnFocusTo && typeof returnFocusTo.focus === 'function') {
      try {
        returnFocusTo.focus();
      } catch {
        // Silently catch if detached
      }
    }
  };

  const openModal = (): void => {
    returnFocusTo = doc.activeElement as HTMLElement | null;
    isModalOpen = true;
    elems.modal.style.display = 'flex';

    if (!deps.client.configured) {
      renderUnconfiguredNotice(elems.loginSection, doc);
      elems.loginSection.style.display = 'block';
      elems.panelSection.style.display = 'none';
      if (elems.closeBtn && typeof elems.closeBtn.focus === 'function') {
        elems.closeBtn.focus();
      } else if (typeof elems.modal.focus === 'function') {
        elems.modal.focus();
      }
      return;
    }

    const savedPw = getStoredTeacherPassword();
    if (savedPw) {
      elems.loginSection.style.display = 'none';
      elems.panelSection.style.display = 'block';
      void refreshList();
      if (elems.newExamBtn && typeof elems.newExamBtn.focus === 'function') {
        elems.newExamBtn.focus();
      }
      return;
    }

    // Not logged in: show login form
    elems.loginSection.style.display = 'block';
    elems.panelSection.style.display = 'none';
    const { pwInput, loginBtn, loginError, cancelBtn } = renderLoginForm(elems.loginSection, doc);
    pwInput.value = '';
    loginError.textContent = '';

    const handleLoginSubmit = async () => {
      const pw = pwInput.value;
      if (!pw) {
        loginError.textContent = 'Vui lòng nhập mật khẩu giáo viên';
        return;
      }
      loginError.textContent = 'Đang kiểm tra mật khẩu...';
      loginBtn.disabled = true;

      try {
        const res = await deps.client.teacherLogin(pw);
        if (res.ok) {
          setStoredTeacherPassword(pw);
          loginError.textContent = '';
          elems.loginSection.style.display = 'none';
          elems.panelSection.style.display = 'block';
          await refreshList();
          if (elems.newExamBtn && typeof elems.newExamBtn.focus === 'function') {
            elems.newExamBtn.focus();
          }
        } else {
          loginError.textContent = res.message || 'Mật khẩu giáo viên không chính xác';
          if (typeof pwInput.focus === 'function') {
            pwInput.focus();
            if (typeof pwInput.select === 'function') pwInput.select();
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        loginError.textContent = 'Lỗi kết nối máy chủ: ' + msg;
      } finally {
        loginBtn.disabled = false;
      }
    };

    loginBtn.onclick = () => {
      void handleLoginSubmit();
    };

    pwInput.onkeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void handleLoginSubmit();
      }
    };

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        closeModal();
      };
    }

    if (typeof pwInput.focus === 'function') {
      pwInput.focus();
    }
  };

  // Wire up top close button
  if (elems.closeBtn) {
    elems.closeBtn.addEventListener('click', closeModal);
  }

  // Wire up New Exam button
  if (elems.newExamBtn) {
    elems.newExamBtn.addEventListener('click', () => {
      closeModal();
      deps.openBuilder(null, { onPublish });
    });
  }

  // Accessible keyboard events: Escape to dismiss, Tab trap
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isModalOpen) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
      return;
    }
    if (e.key === 'Tab') {
      trapFocus(elems.modal, e);
    }
  };

  elems.modal.addEventListener('keydown', handleKeyDown as EventListener);
  if (typeof doc.addEventListener === 'function') {
    doc.addEventListener('keydown', handleKeyDown as EventListener);
  }

  // Click outside to dismiss
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === elems.modal) {
      closeModal();
    }
  };
  elems.modal.addEventListener('click', handleOverlayClick as EventListener);

  const dispose = (): void => {
    closeModal();
    elems.modal.removeEventListener('keydown', handleKeyDown as EventListener);
    if (typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('keydown', handleKeyDown as EventListener);
    }
    elems.modal.removeEventListener('click', handleOverlayClick as EventListener);
    if (elems.closeBtn) {
      elems.closeBtn.removeEventListener('click', closeModal);
    }
  };

  return {
    open: openModal,
    close: closeModal,
    refreshList,
    dispose,
  };
}
