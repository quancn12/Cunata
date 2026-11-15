/**
 * Cunata Web M2-M6 — Public Exam Selection & Manifest Loader
 * Conforms to WEB-contract.md §15 and Shared Product Contract v2.0.
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

export interface ExamListOptions {
  readonly onSelectExam: (exam: WebExam) => void;
  readonly hasUnsavedProgress?: () => boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

  const loadExamFromUrl = async (url: string) => {
    if (options.hasUnsavedProgress?.()) {
      if (typeof confirm === 'function') {
        const ok = confirm('Bạn có bài làm dở. Chuyển sang đề mới sẽ bỏ bài dở này. Tiếp tục?');
        if (!ok) return;
      }
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Không thể tải file đề thi`);
      }
      const raw = await res.json();
      const v = validateExamVersion(raw);
      if (!v.ok) {
        throw new Error('Dữ liệu đề thi không hợp lệ: ' + v.issues.map((i: any) => i.code + ': ' + i.message).join('; '));
      }
      options.onSelectExam(raw as WebExam);
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
      const res = await fetch('public/exams/index.json');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Không thể tải danh sách đề thi`);
      }
      const manifest: ExamManifest = await res.json();
      if (!manifest.exams || !Array.isArray(manifest.exams) || manifest.exams.length === 0) {
        if (container) {
          container.innerHTML = '<div style="text-align: center; color: var(--gray-500); padding: 1rem;">Hiện chưa có đề thi nào trong danh sách.</div>';
        }
        return;
      }

      // Group exams by group field
      const groups = new Map<string, ManifestEntry[]>();
      for (const e of manifest.exams) {
        const g = e.group || 'Đề thi';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(e);
      }

      let html = '';
      for (const [groupTitle, exams] of groups.entries()) {
        html += `<div class="exam-group" style="margin-bottom: 1rem;">`;
        html += `<div class="exam-group-title" style="font-size: 0.875rem; font-weight: 700; color: var(--gray-600); margin-bottom: 0.5rem; text-transform: uppercase;">${escapeHtml(groupTitle)}</div>`;
        html += `<div class="exam-group-items" style="display: flex; flex-direction: column; gap: 0.5rem;">`;
        for (const e of exams) {
          html += `
            <button type="button" class="exam-list-item btn-secondary" data-exam-url="${escapeHtml(e.url)}" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 0.75rem 1rem; width: 100%; border-radius: 6px; cursor: pointer;">
              <strong style="font-size: 0.9375rem; color: var(--gray-900);">${escapeHtml(e.title)}</strong>
              <span style="font-size: 0.8125rem; color: var(--gray-600); margin-top: 0.25rem;">(${e.questionCount} câu · ${e.durationMinutes} phút · ${escapeHtml(e.subject)})</span>
            </button>
          `;
        }
        html += `</div></div>`;
      }

      if (container) {
        container.innerHTML = html;
        const items = container.querySelectorAll('.exam-list-item[data-exam-url]');
        items.forEach((btn) => {
          btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-exam-url');
            if (url) loadExamFromUrl(url);
          });
        });

        // Focus first item
        const first = container.querySelector('.exam-list-item') as HTMLElement | null;
        if (first && typeof first.focus === 'function') first.focus();
      }
    } catch (err: any) {
      if (container) {
        container.innerHTML = `<div style="color: var(--danger); padding: 1rem; text-align: center;">Lỗi tải danh sách đề thi: ${escapeHtml(err?.message || String(err))}</div>`;
      }
    }
  };

  // Event handlers
  if (btnOpen) {
    btnOpen.addEventListener('click', openModal);
  }
  if (btnClose) {
    btnClose.addEventListener('click', closeModal);
  }
  if (btnCancel) {
    btnCancel.addEventListener('click', closeModal);
  }

  // Escape key handler
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

  // Direct link query param: ?exam=<examId>
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    const params = new URLSearchParams(window.location.search);
    const queryExamId = params.get('exam');
    if (queryExamId) {
      fetch('public/exams/index.json')
        .then((r) => r.json())
        .then((manifest: ExamManifest) => {
          const match = manifest.exams?.find((e) => e.id === queryExamId);
          if (match && match.url) {
            return fetch(match.url)
              .then((r) => r.json())
              .then((examData: unknown) => {
                const v = validateExamVersion(examData);
                if (v.ok) {
                  options.onSelectExam(examData as WebExam);
                }
              });
          }
        })
        .catch((err) => {
          console.warn('[ExamList] Lỗi tải đề theo ?exam:', err);
        });
    }
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
