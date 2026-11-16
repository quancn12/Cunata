/**
 * Cunata Web M2-M6 — Public Exam Selection & Manifest Loader
 * Conforms to WEB-contract.md §15, §16, §17 and Shared Product Contract v2.0.
 */

import type { WebExam } from '../schema/index.ts';
import { validateExamVersion } from '../domain/index.ts';

export interface ManifestEntry {
  readonly id: string;
  readonly title: string;
  readonly subject: string;
  readonly grade: number;
  readonly durationMinutes: number;
  readonly questionCount: number;
  readonly group: string;
  readonly url: string;
}

export interface ExamManifest {
  readonly version: number;
  readonly exams: readonly ManifestEntry[];
}

export interface MergedExamEntry {
  readonly id: string;
  readonly title: string;
  readonly subject: string;
  readonly grade: number;
  readonly durationMinutes: number;
  readonly questionCount: number;
  readonly group: string;
  readonly url?: string;
  readonly source: 'static' | 'teacher';
}

export interface ExamListOptions {
  readonly onSelectExam: (exam: WebExam) => void;
  readonly hasUnsavedProgress?: () => boolean;
  readonly appsScriptUrl?: string;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function fetchAndMergeExams(appsScriptUrl?: string): Promise<{ exams: MergedExamEntry[]; error?: string; teacherError?: string }> {
  let staticExams: MergedExamEntry[] = [];
  let teacherExams: MergedExamEntry[] = [];
  let mainError: string | undefined;
  let teacherError: string | undefined;

  try {
    const res = await fetch('public/exams/index.json');
    if (res.ok) {
      const manifest: ExamManifest = await res.json();
      if (manifest && Array.isArray(manifest.exams)) {
        staticExams = manifest.exams.map((e) => ({
          id: String(e.id || ''),
          title: String(e.title || ''),
          subject: String(e.subject || ''),
          grade: Number(e.grade) || 12,
          durationMinutes: Number(e.durationMinutes) || 50,
          questionCount: Number(e.questionCount) || 0,
          group: String(e.group || 'Đề thi'),
          url: String(e.url || ''),
          source: 'static' as const,
        }));
      }
    } else {
      mainError = `HTTP ${res.status}: Không thể tải danh sách đề thi`;
    }
  } catch (err: any) {
    mainError = err?.message || String(err);
  }

  if (appsScriptUrl && appsScriptUrl.trim()) {
    try {
      const separator = appsScriptUrl.includes('?') ? '&' : '?';
      const res = await fetch(appsScriptUrl + separator + 'action=listExams');
      if (res.ok) {
        const data = await res.json();
        if (data && data.success && Array.isArray(data.exams)) {
          teacherExams = data.exams.map((e: any) => ({
            id: String(e.id || ''),
            title: String(e.title || ''),
            subject: String(e.subject || ''),
            grade: Number(e.grade) || 12,
            durationMinutes: Number(e.durationMinutes) || 50,
            questionCount: Number(e.questionCount) || 0,
            group: String(e.group || 'Đề giáo viên xuất bản'),
            source: 'teacher' as const,
          }));
        }
      } else {
        teacherError = 'chưa tải được đề của giáo viên';
      }
    } catch (_) {
      teacherError = 'chưa tải được đề của giáo viên';
    }
  }

  // Merge: if duplicate id, teacher published exam WINS!
  const teacherMap = new Map<string, MergedExamEntry>();
  for (const te of teacherExams) {
    if (te.id) teacherMap.set(te.id, te);
  }

  const merged: MergedExamEntry[] = [];
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

  return { exams: merged, error: mainError, teacherError };
}

export async function fetchExamData(entry: MergedExamEntry, appsScriptUrl?: string): Promise<WebExam> {
  if (entry.source === 'teacher' && appsScriptUrl) {
    const separator = appsScriptUrl.includes('?') ? '&' : '?';
    const res = await fetch(appsScriptUrl + separator + 'action=getExam&id=' + encodeURIComponent(entry.id));
    if (!res.ok) throw new Error(`HTTP ${res.status}: Không thể tải đề từ Apps Script`);
    const data = await res.json();
    if (!data || !data.success || !data.exam) {
      throw new Error(data?.message || 'Không tìm thấy đề thi trên máy chủ');
    }
    const v = validateExamVersion(data.exam);
    if (!v.ok) {
      throw new Error('Dữ liệu đề thi không hợp lệ: ' + v.issues.map((i: any) => i.code + ': ' + i.message).join('; '));
    }
    return data.exam as WebExam;
  } else if (entry.url) {
    const res = await fetch(entry.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Không thể tải file đề thi`);
    const data = await res.json();
    const v = validateExamVersion(data);
    if (!v.ok) {
      throw new Error('Dữ liệu đề thi không hợp lệ: ' + v.issues.map((i: any) => i.code + ': ' + i.message).join('; '));
    }
    return data as WebExam;
  }
  throw new Error('Đề thi không có nguồn hợp lệ');
}

export function renderExamItemsHtml(exams: readonly MergedExamEntry[], selectedId?: string): string {
  const groups = new Map<string, MergedExamEntry[]>();
  for (const e of exams) {
    const g = e.group || 'Đề thi';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(e);
  }

  let html = '';
  for (const [groupTitle, groupExams] of groups.entries()) {
    html += `<div class="exam-group" style="margin-bottom: 1rem;">`;
    html += `<div class="exam-group-title" style="font-size: 0.875rem; font-weight: 700; color: var(--gray-600); margin-bottom: 0.5rem; text-transform: uppercase;">${escapeHtml(groupTitle)}</div>`;
    html += `<div class="exam-group-items" style="display: flex; flex-direction: column; gap: 0.5rem;">`;
    for (const e of groupExams) {
      const isSelected = selectedId && (e.id === selectedId || e.url === selectedId);
      const urlAttr = e.url ? ` data-exam-url="${escapeHtml(e.url)}"` : '';
      const srcAttr = e.source === 'teacher' ? ` data-exam-source="teacher"` : '';
      const pressedAttr = isSelected ? ` aria-pressed="true" class="exam-list-item btn-secondary selected"` : ` aria-pressed="false" class="exam-list-item btn-secondary"`;
      html += `
        <button type="button"${pressedAttr} data-exam-id="${escapeHtml(e.id)}"${urlAttr}${srcAttr} style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 0.75rem 1rem; width: 100%; border-radius: 6px; cursor: pointer;">
          <strong style="font-size: 0.9375rem; color: var(--gray-900);">${escapeHtml(e.title)}</strong>
          <span style="font-size: 0.8125rem; color: var(--gray-600); margin-top: 0.25rem;">(${e.questionCount} câu · ${e.durationMinutes} phút · ${escapeHtml(e.subject)})</span>
        </button>
      `;
    }
    html += `</div></div>`;
  }
  return html;
}

export function initExamList(root: HTMLElement, options: ExamListOptions): () => void {
  const doc = root.ownerDocument || document;

  // 1. Ensure #btnOpenExamList exists in DOM
  let btnOpen = root.querySelector('#btnOpenExamList') as HTMLButtonElement | null;
  if (!btnOpen) {
    const headerActions = root.querySelector('.header-actions');
    if (headerActions) {
      btnOpen = doc.createElement('button');
      btnOpen.type = 'button';
      btnOpen.className = 'btn-secondary';
      btnOpen.id = 'btnOpenExamList';
      btnOpen.style.padding = '0.4rem 0.75rem';
      btnOpen.style.fontSize = '0.875rem';
      btnOpen.textContent = '📋 Chọn đề';
      headerActions.insertBefore(btnOpen, headerActions.firstChild);
    }
  }

  // 2. Ensure #examListModal exists in DOM
  let modal = root.querySelector('#examListModal') as HTMLElement | null;
  if (!modal) {
    modal = doc.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'examListModal';
    modal.style.display = 'none';
    if (typeof modal.setAttribute === 'function') {
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'examListModalTitle');
    }

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 640px; width: 90%;">
        <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h2 id="examListModalTitle" style="font-size: 1.125rem; font-weight: 700; margin: 0;">Danh Sách Đề Thi Công Khai</h2>
          <button type="button" class="btn-close" id="btnCloseExamList" aria-label="Đóng" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">&times;</button>
        </div>
        <div id="examListContainer" class="exam-list-container">
          <div style="text-align: center; color: var(--gray-500); padding: 1rem;">Đang tải danh sách đề thi...</div>
        </div>
        <div class="modal-actions" style="margin-top: 1rem; display: flex; justify-content: flex-end;">
          <button type="button" class="btn-secondary" id="btnCancelExamList">Đóng</button>
        </div>
      </div>
    `;
    root.appendChild(modal);
  }

  const container = modal.querySelector('#examListContainer') as HTMLElement | null;
  const btnClose = modal.querySelector('#btnCloseExamList') as HTMLButtonElement | null;
  const btnCancel = modal.querySelector('#btnCancelExamList') as HTMLButtonElement | null;

  let lastFocus: Element | null = null;

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
    if (lastFocus && typeof (lastFocus as HTMLElement).focus === 'function') {
      (lastFocus as HTMLElement).focus();
    }
  };

  const loadExamFromEntry = async (entry: MergedExamEntry) => {
    if (options.hasUnsavedProgress?.()) {
      if (typeof confirm === 'function') {
        const ok = confirm('Bạn có bài làm dở. Chuyển sang đề mới sẽ bỏ bài dở này. Tiếp tục?');
        if (!ok) return;
      }
    }

    try {
      const examData = await fetchExamData(entry, options.appsScriptUrl);
      options.onSelectExam(examData);
      closeModal();
    } catch (err: any) {
      if (container) {
        container.innerHTML = `<div style="color: var(--danger); padding: 1rem; text-align: center;">Lỗi tải đề thi: ${escapeHtml(err?.message || String(err))}</div>`;
      } else if (typeof alert === 'function') {
        alert('Lỗi tải đề thi: ' + (err?.message || String(err)));
      }
    }
  };

  const openModal = async () => {
    lastFocus = doc.activeElement;
    if (modal) modal.style.display = 'flex';
    if (container) {
      container.innerHTML = '<div style="text-align: center; color: var(--gray-500); padding: 1rem;">Đang tải danh sách đề thi...</div>';
    }

    try {
      const { exams, error, teacherError } = await fetchAndMergeExams(options.appsScriptUrl);
      if (error && exams.length === 0) {
        if (container) {
          container.innerHTML = `<div style="color: var(--danger); padding: 1rem; text-align: center;">Lỗi tải danh sách đề thi: ${escapeHtml(error)}</div>`;
        }
        return;
      }
      if (exams.length === 0) {
        if (container) {
          container.innerHTML = '<div style="text-align: center; color: var(--gray-500); padding: 1rem;">Hiện chưa có đề thi nào trong danh sách.</div>';
        }
        return;
      }

      let noticeHtml = '';
      if (teacherError) {
        noticeHtml = `<div style="padding: 0.5rem; margin-bottom: 0.5rem; background: #fffbeb; color: #b45309; border-radius: 4px; font-size: 0.8125rem;">Lưu ý: ${escapeHtml(teacherError)}</div>`;
      }

      if (container) {
        container.innerHTML = noticeHtml + renderExamItemsHtml(exams);
        const items = container.querySelectorAll('.exam-list-item');
        items.forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-exam-id');
            const entry = exams.find((e) => e.id === id);
            if (entry) loadExamFromEntry(entry);
          });
        });

        const first = container.querySelector('.exam-list-item') as HTMLElement | null;
        if (first && typeof first.focus === 'function') first.focus();
      }
    } catch (err: any) {
      if (container) {
        container.innerHTML = `<div style="color: var(--danger); padding: 1rem; text-align: center;">Lỗi tải danh sách đề thi: ${escapeHtml(err?.message || String(err))}</div>`;
      }
    }
  };

  if (btnOpen) btnOpen.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);

  const onKeyDown = (e: KeyboardEvent) => {
    if (modal && modal.style.display === 'flex') {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      }
    }
  };
  if (typeof doc.addEventListener === 'function') {
    doc.addEventListener('keydown', onKeyDown);
  }

  return () => {
    if (btnOpen) btnOpen.removeEventListener('click', openModal);
    if (btnClose) btnClose.removeEventListener('click', closeModal);
    if (btnCancel) btnCancel.removeEventListener('click', closeModal);
    if (typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('keydown', onKeyDown);
    }
  };
}

export interface StartScreenOptions {
  readonly onStartExam: (exam: WebExam, candidateName: string) => void;
  readonly appsScriptUrl?: string;
  readonly initialExamId?: string | null;
  readonly onOpenTeacher?: () => void;
}

export interface StartScreenController {
  readonly refreshList: () => Promise<void>;
  readonly selectExamId: (id: string) => void;
  readonly dispose: () => void;
}

export function initStartScreen(root: HTMLElement, options: StartScreenOptions): StartScreenController {
  const startScreen = root.querySelector('#startScreen') as HTMLElement | null;
  const startNameInput = root.querySelector('#startName') as HTMLInputElement | null;
  const startExamListContainer = root.querySelector('#startExamListContainer') as HTMLElement | null;
  const btnStartExam = root.querySelector('#btnStartExam') as HTMLButtonElement | null;
  const btnTeacher = root.querySelector('#btnTeacher') as HTMLButtonElement | null;

  let loadedExams: MergedExamEntry[] = [];
  let selectedEntry: MergedExamEntry | null = null;

  if (startNameInput && typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem('cunata:candidate_name') || localStorage.getItem('cunata:last_candidate_name');
      if (saved && !startNameInput.value) {
        startNameInput.value = saved;
      }
    } catch (_) {}
  }

  const updateBtnStartExam = () => {
    if (!btnStartExam) return;
    const hasName = !!(startNameInput && startNameInput.value.trim().length > 0);
    const hasSelected = !!selectedEntry;
    btnStartExam.disabled = !(hasName && hasSelected);
  };

  const loadAndRenderList = async () => {
    if (!startExamListContainer) return;
    startExamListContainer.innerHTML = '<div style="text-align: center; color: var(--gray-500, #6b7280); padding: 1rem;">Đang tải danh sách đề thi...</div>';
    try {
      const { exams, error, teacherError } = await fetchAndMergeExams(options.appsScriptUrl);
      loadedExams = exams;
      if (error && exams.length === 0) {
        startExamListContainer.innerHTML = `<div style="color: var(--danger, #ef4444); padding: 1rem; text-align: center;">Lỗi tải danh sách đề thi: ${escapeHtml(error)}</div>`;
        return;
      }
      if (exams.length === 0) {
        startExamListContainer.innerHTML = '<div style="text-align: center; color: var(--gray-500, #6b7280); padding: 1rem;">Hiện chưa có đề thi nào trong danh sách.</div>';
        return;
      }

      let noticeHtml = '';
      if (teacherError) {
        noticeHtml = `<div style="padding: 0.5rem; margin-bottom: 0.5rem; background: #fffbeb; color: #b45309; border-radius: 4px; font-size: 0.8125rem;">Lưu ý: ${escapeHtml(teacherError)}</div>`;
      }

      const targetId = options.initialExamId || (selectedEntry ? selectedEntry.id : null);
      startExamListContainer.innerHTML = noticeHtml + renderExamItemsHtml(exams, targetId || undefined);

      const items = startExamListContainer.querySelectorAll('.exam-list-item');
      items.forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-exam-id');
          const entry = loadedExams.find((e) => e.id === id);
          if (entry) {
            selectedEntry = entry;
            items.forEach((b) => {
              b.setAttribute('aria-pressed', 'false');
              b.classList.remove('selected');
            });
            btn.setAttribute('aria-pressed', 'true');
            btn.classList.add('selected');
            updateBtnStartExam();
          }
        });
      });

      if (targetId) {
        const match = exams.find((e) => e.id === targetId || e.url === targetId);
        if (match) {
          selectedEntry = match;
          const targetBtn = startExamListContainer.querySelector(`.exam-list-item[data-exam-id="${targetId}"]`) as HTMLElement | null;
          if (targetBtn) {
            targetBtn.setAttribute('aria-pressed', 'true');
            targetBtn.classList.add('selected');
          }
        }
      }
      updateBtnStartExam();
    } catch (err: any) {
      if (startExamListContainer) {
        startExamListContainer.innerHTML = `<div style="color: var(--danger, #ef4444); padding: 1rem; text-align: center;">Lỗi tải danh sách đề thi: ${escapeHtml(err?.message || String(err))}</div>`;
      }
    }
  };

  const onNameInput = () => updateBtnStartExam();
  if (startNameInput) {
    startNameInput.addEventListener('input', onNameInput);
    startNameInput.addEventListener('change', onNameInput);
    startNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && btnStartExam && !btnStartExam.disabled) {
        e.preventDefault();
        btnStartExam.click();
      }
    });
  }

  const onStartClick = async () => {
    if (!selectedEntry || !startNameInput) return;
    const name = startNameInput.value.trim();
    if (!name) return;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('cunata:candidate_name', name);
      } catch (_) {}
    }
    if (btnStartExam) {
      btnStartExam.disabled = true;
      btnStartExam.textContent = 'Đang nạp đề...';
    }
    try {
      const examData = await fetchExamData(selectedEntry, options.appsScriptUrl);
      if (startScreen) startScreen.style.display = 'none';
      options.onStartExam(examData, name);
    } catch (err: any) {
      alert('Lỗi nạp đề thi: ' + (err?.message || String(err)));
    } finally {
      if (btnStartExam) {
        btnStartExam.disabled = false;
        btnStartExam.textContent = 'Bắt đầu làm bài';
      }
    }
  };
  if (btnStartExam) btnStartExam.addEventListener('click', onStartClick);

  const onTeacherClick = () => {
    options.onOpenTeacher?.();
  };
  if (btnTeacher) btnTeacher.addEventListener('click', onTeacherClick);

  loadAndRenderList();

  return {
    refreshList: loadAndRenderList,
    selectExamId: (id: string) => {
      if (!startExamListContainer) return;
      const match = loadedExams.find((e) => e.id === id || e.url === id);
      if (match) {
        selectedEntry = match;
        const items = startExamListContainer.querySelectorAll('.exam-list-item');
        items.forEach((b) => {
          if (b.getAttribute('data-exam-id') === id) {
            b.setAttribute('aria-pressed', 'true');
            b.classList.add('selected');
          } else {
            b.setAttribute('aria-pressed', 'false');
            b.classList.remove('selected');
          }
        });
        updateBtnStartExam();
      }
    },
    dispose: () => {
      if (startNameInput) {
        startNameInput.removeEventListener('input', onNameInput);
        startNameInput.removeEventListener('change', onNameInput);
      }
      if (btnStartExam) btnStartExam.removeEventListener('click', onStartClick);
      if (btnTeacher) btnTeacher.removeEventListener('click', onTeacherClick);
    },
  };
}

export interface TeacherModalOptions {
  readonly appsScriptUrl?: string;
  readonly onEditExam: (exam: WebExam) => void;
  readonly onNewExam?: () => void;
}

export interface TeacherModalController {
  readonly openModal: () => void;
  readonly closeModal: () => void;
  readonly refreshList: () => Promise<void>;
  readonly dispose: () => void;
}

export function initTeacherModal(root: HTMLElement, options: TeacherModalOptions): TeacherModalController {
  const teacherModal = root.querySelector('#teacherModal') as HTMLElement | null;
  const teacherLogin = root.querySelector('#teacherLogin') as HTMLElement | null;
  const teacherPassword = root.querySelector('#teacherPassword') as HTMLInputElement | null;
  const btnTeacherLogin = root.querySelector('#btnTeacherLogin') as HTMLButtonElement | null;
  const teacherLoginError = root.querySelector('#teacherLoginError') as HTMLElement | null;
  const btnCancelTeacherLogin = root.querySelector('#btnCancelTeacherLogin') as HTMLButtonElement | null;
  const btnCloseTeacherModal = root.querySelector('#btnCloseTeacherModal') as HTMLButtonElement | null;
  const teacherPanel = root.querySelector('#teacherPanel') as HTMLElement | null;
  const btnTeacherNewExam = root.querySelector('#btnTeacherNewExam') as HTMLButtonElement | null;
  const teacherExamList = root.querySelector('#teacherExamList') as HTMLElement | null;

  const closeModal = () => {
    if (teacherModal) teacherModal.style.display = 'none';
  };

  const renderTeacherPanelList = async () => {
    if (!teacherExamList) return;
    teacherExamList.innerHTML = '<div style="text-align: center; color: var(--gray-500, #6b7280); padding: 1rem;">Đang tải danh sách đề thi...</div>';
    try {
      const { exams } = await fetchAndMergeExams(options.appsScriptUrl);
      if (exams.length === 0) {
        teacherExamList.innerHTML = '<div style="text-align: center; color: var(--gray-500, #6b7280); padding: 1rem;">Chưa có đề thi nào.</div>';
        return;
      }
      let html = '';
      for (const e of exams) {
        const isTeacher = e.source === 'teacher';
        html += `
          <div class="teacher-exam-row" data-exam-id="${escapeHtml(e.id)}" style="display: flex; justify-content: space-between; align-items: center; padding: 0.625rem 0.75rem; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; background: var(--card-bg, #fff); gap: 0.5rem;">
            <div style="flex: 1; min-width: 0;">
              <strong style="font-size: 0.9375rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--gray-900, #111827);">${escapeHtml(e.title)}</strong>
              <span style="font-size: 0.8125rem; color: var(--gray-500, #6b7280);">${e.questionCount} câu · ${e.durationMinutes} phút · ${isTeacher ? '<span style="color: var(--primary, #2563eb); font-weight: 600;">Đã xuất bản</span>' : 'Đề tĩnh'}</span>
            </div>
            <div style="display: flex; gap: 0.375rem; flex-shrink: 0;">
              <button type="button" class="btn-secondary btn-teacher-edit" style="font-size: 0.8125rem; padding: 0.3rem 0.6rem;">Sửa</button>
              ${isTeacher ? '<button type="button" class="btn-secondary btn-teacher-unpublish" style="font-size: 0.8125rem; padding: 0.3rem 0.6rem; color: var(--danger, #ef4444); border-color: #fca5a5;">Gỡ xuất bản</button>' : ''}
            </div>
          </div>
        `;
      }
      teacherExamList.innerHTML = html;

      const rows = teacherExamList.querySelectorAll('.teacher-exam-row');
      rows.forEach((row) => {
        const id = row.getAttribute('data-exam-id');
        const entry = exams.find((e) => e.id === id);
        if (!entry) return;

        const btnEdit = row.querySelector('.btn-teacher-edit') as HTMLButtonElement | null;
        if (btnEdit) {
          btnEdit.addEventListener('click', async () => {
            try {
              btnEdit.disabled = true;
              const examData = await fetchExamData(entry, options.appsScriptUrl);
              closeModal();
              options.onEditExam(examData);
            } catch (err: any) {
              alert('Lỗi nạp đề thi để sửa: ' + (err?.message || String(err)));
            } finally {
              btnEdit.disabled = false;
            }
          });
        }

        const btnUnpub = row.querySelector('.btn-teacher-unpublish') as HTMLButtonElement | null;
        if (btnUnpub) {
          btnUnpub.addEventListener('click', async () => {
            const ok = confirm(`Gỡ xuất bản đề "${entry.title}"?`);
            if (!ok) return;
            try {
              btnUnpub.disabled = true;
              let pw = '';
              try { pw = sessionStorage.getItem('cunata_teacher_pw') || ''; } catch (_) {}
              const res = await fetch(options.appsScriptUrl!, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'unpublishExam', password: pw, examId: entry.id }),
              });
              const data = await res.json();
              if (data && data.success) {
                renderTeacherPanelList();
              } else {
                alert('Lỗi gỡ xuất bản: ' + (data?.message || data?.error || 'Không xác định'));
              }
            } catch (err: any) {
              alert('Lỗi kết nối máy chủ: ' + (err?.message || String(err)));
            } finally {
              btnUnpub.disabled = false;
            }
          });
        }
      });
    } catch (err: any) {
      if (teacherExamList) {
        teacherExamList.innerHTML = `<div style="color: var(--danger, #ef4444); padding: 1rem; text-align: center;">Lỗi tải danh sách đề: ${escapeHtml(err?.message || String(err))}</div>`;
      }
    }
  };

  const openModal = () => {
    if (teacherModal) teacherModal.style.display = 'flex';
    if (!options.appsScriptUrl || !options.appsScriptUrl.trim()) {
      if (teacherLogin) {
        teacherLogin.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--gray-700, #374151);"><p style="font-weight: 600; font-size: 1.05rem; margin-bottom: 0.5rem;">Chức năng máy chủ Google Apps Script chưa cấu hình.</p><p style="font-size: 0.875rem; color: var(--gray-500, #6b7280); margin: 0;">Vui lòng thiết lập appsScriptUrl trong public/config.json để kích hoạt kho đề và tính năng giáo viên.</p></div>';
        teacherLogin.style.display = 'block';
      }
      if (teacherPanel) teacherPanel.style.display = 'none';
      return;
    }

    let savedPw = '';
    try { savedPw = sessionStorage.getItem('cunata_teacher_pw') || ''; } catch (_) {}
    if (savedPw) {
      if (teacherLogin) teacherLogin.style.display = 'none';
      if (teacherPanel) teacherPanel.style.display = 'block';
      renderTeacherPanelList();
    } else {
      if (teacherLogin) teacherLogin.style.display = 'block';
      if (teacherPanel) teacherPanel.style.display = 'none';
      if (teacherPassword) {
        teacherPassword.value = '';
        teacherPassword.focus();
      }
      if (teacherLoginError) teacherLoginError.textContent = '';
    }
  };

  const onLoginClick = async () => {
    const pw = teacherPassword?.value || '';
    if (!pw) {
      if (teacherLoginError) teacherLoginError.textContent = 'Vui lòng nhập mật khẩu giáo viên';
      return;
    }
    if (teacherLoginError) teacherLoginError.textContent = 'Đang kiểm tra mật khẩu...';
    try {
      const res = await fetch(options.appsScriptUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'teacherLogin', password: pw }),
      });
      const data = await res.json();
      if (data && data.success) {
        try {
          sessionStorage.setItem('cunata_teacher_pw', pw);
        } catch (_) {}
        if (teacherLogin) teacherLogin.style.display = 'none';
        if (teacherPanel) teacherPanel.style.display = 'block';
        if (teacherLoginError) teacherLoginError.textContent = '';
        renderTeacherPanelList();
      } else {
        if (teacherLoginError) teacherLoginError.textContent = data?.message || 'Mật khẩu giáo viên không chính xác';
      }
    } catch (err: any) {
      if (teacherLoginError) teacherLoginError.textContent = 'Lỗi kết nối máy chủ: ' + (err?.message || String(err));
    }
  };

  if (btnTeacherLogin) btnTeacherLogin.addEventListener('click', onLoginClick);
  if (teacherPassword) {
    teacherPassword.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onLoginClick();
      }
    });
  }

  if (btnTeacherNewExam) {
    btnTeacherNewExam.addEventListener('click', () => {
      closeModal();
      if (options.onNewExam) options.onNewExam();
    });
  }

  if (btnCloseTeacherModal) btnCloseTeacherModal.addEventListener('click', closeModal);
  if (btnCancelTeacherLogin) btnCancelTeacherLogin.addEventListener('click', closeModal);

  return {
    openModal,
    closeModal,
    refreshList: renderTeacherPanelList,
    dispose: () => {
      if (btnTeacherLogin) btnTeacherLogin.removeEventListener('click', onLoginClick);
      if (btnCloseTeacherModal) btnCloseTeacherModal.removeEventListener('click', closeModal);
      if (btnCancelTeacherLogin) btnCancelTeacherLogin.removeEventListener('click', closeModal);
    },
  };
}
