/**
 * Cunata Web M2-M6 — Teacher Authoring & Question Bank
 * Conforms to WEB-contract.md §2, §8, §14 and Shared Product Contract v2.0.
 */

import type { WebExam, WebQuestion } from '../schema/index.ts';
import type { AsResult } from '../collect/appsScript.ts';
import {
  validateExamVersion,
  toFractionString,
} from '../domain/index.ts';
import {
  computeExamMaxFromQuestions,
  formatRationalScore,
} from './legacy.ts';
import { importDocx } from '../import/docx/index.ts';
import { mount as mountPreview } from '../import/preview/view.ts';

export interface AuthoringOptions {
  readonly getExam: () => WebExam | null;
  readonly onPublish: (exam: WebExam) => void;
  readonly idGen?: () => string;
  readonly getAppsScriptUrl?: () => string;
  readonly getTeacherPassword?: () => string | null;
  readonly onPublishedToWeb?: (exam: WebExam) => void;
}

export interface AuthoringController {
  openBuilder(
    exam: unknown | null,
    opts?: {
      onPublish?: (exam: unknown) => Promise<AsResult<{ examId: string; revision: number }>>;
    }
  ): void;
  dispose(): void;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initAuthoring(root: HTMLElement, options: AuthoringOptions): AuthoringController & (() => void) {
  const doc = root.ownerDocument || document;

  let activeOnPublish: ((exam: unknown) => Promise<AsResult<{ examId: string; revision: number }>>) | null = null;

  // Builder draft state
  let builderExamState: any = {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-custom-01',
    examVersionId: 'v1.0.0',
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề Thi Tùy Chỉnh GDPT 2018',
    subject: 'Toán học',
    grade: 12,
    durationMinutes: 50,
    settings: {
      durationMinutes: 50,
      maxAttempts: 0,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions: [] as any[],
  };

  let editingQuestionIdx = -1;
  let builderLastFocus: Element | null = null;
  let bankLastFocus: Element | null = null;

  // Question bank state
  let questionBank: any[] = [];
  try {
    const raw = localStorage.getItem('cunata:question_bank');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) questionBank = parsed;
    }
  } catch (_) {}

  const saveBankToStorage = () => {
    try {
      localStorage.setItem('cunata:question_bank', JSON.stringify(questionBank));
    } catch (_) {}
  };

  // DOM Elements
  const builderModal = root.querySelector('#builderModal') as HTMLElement | null;
  const bankModal = root.querySelector('#bankModal') as HTMLElement | null;

  const btnOpenBuilder = root.querySelector('#btnOpenBuilder') as HTMLButtonElement | null;
  const btnCloseBuilder = root.querySelector('#btnCloseBuilder') as HTMLButtonElement | null;
  const btnCancelBuilder = root.querySelector('#btnCancelBuilder') as HTMLButtonElement | null;
  const btnPublishToRunner = root.querySelector('#btnPublishToRunner') as HTMLButtonElement | null;
  const btnExportExamJson = root.querySelector('#btnExportExamJson') as HTMLButtonElement | null;
  const builderFileInput = root.querySelector('#builderFileInput') as HTMLInputElement | null;

  const btnAddPartI = root.querySelector('#btnAddPartI') as HTMLButtonElement | null;
  const btnAddPartII = root.querySelector('#btnAddPartII') as HTMLButtonElement | null;
  const btnAddPartIII = root.querySelector('#btnAddPartIII') as HTMLButtonElement | null;

  const btnOpenBank = root.querySelector('#btnOpenBank') as HTMLButtonElement | null;
  const btnCloseBank = root.querySelector('#btnCloseBank') as HTMLButtonElement | null;
  const btnCancelBank = root.querySelector('#btnCancelBank') as HTMLButtonElement | null;
  const btnSeedBankSample = root.querySelector('#btnSeedBankSample') as HTMLButtonElement | null;
  const btnClearBank = root.querySelector('#btnClearBank') as HTMLButtonElement | null;
  const btnExportBankJson = root.querySelector('#btnExportBankJson') as HTMLButtonElement | null;
  const btnImportBankJson = root.querySelector('#btnImportBankJson') as HTMLButtonElement | null;
  const bankFileInput = root.querySelector('#bankFileInput') as HTMLInputElement | null;
  const bankSearchInput = root.querySelector('#bankSearchInput') as HTMLInputElement | null;

  // Helper to sync builder inputs to state
  const syncInputsToState = () => {
    const titleEl = root.querySelector('#builderExamTitle') as HTMLInputElement | null;
    const idEl = root.querySelector('#builderExamId') as HTMLInputElement | null;
    const durEl = root.querySelector('#builderDuration') as HTMLInputElement | null;

    if (titleEl && titleEl.value.trim()) builderExamState.title = titleEl.value.trim();
    if (idEl && idEl.value.trim()) builderExamState.examId = idEl.value.trim();
    if (durEl) {
      const dur = parseInt(durEl.value, 10) || 50;
      builderExamState.durationMinutes = dur;
      if (builderExamState.settings) builderExamState.settings.durationMinutes = dur;
    }
  };

  // Render question cards in builder modal
  const renderBuilderForm = () => {
    const countEl = root.querySelector('#builderQuestionCount') as HTMLElement | null;
    if (countEl) countEl.textContent = String(builderExamState.questions.length);

    const titleEl = root.querySelector('#builderExamTitle') as HTMLInputElement | null;
    if (titleEl) titleEl.value = builderExamState.title || '';

    const idEl = root.querySelector('#builderExamId') as HTMLInputElement | null;
    if (idEl) idEl.value = builderExamState.examId || '';

    const durEl = root.querySelector('#builderDuration') as HTMLInputElement | null;
    if (durEl) durEl.value = String(builderExamState.durationMinutes || 50);

    // Summary calculation
    const summaryEl = root.querySelector('#builderScoreSummary') as HTMLElement | null;
    if (summaryEl) {
      const maxObj = computeExamMaxFromQuestions(builderExamState.questions);
      summaryEl.innerHTML = `
        <div class="builder-score-card"><div class="label">Phần I</div><div class="value">${maxObj.n1} câu · ${formatRationalScore(toFractionString(maxObj.maxI))}đ</div></div>
        <div class="builder-score-card"><div class="label">Phần II</div><div class="value">${maxObj.n2} câu · ${formatRationalScore(toFractionString(maxObj.maxII))}đ</div></div>
        <div class="builder-score-card"><div class="label">Phần III</div><div class="value">${maxObj.n3} câu · ${formatRationalScore(toFractionString(maxObj.maxIII))}đ</div></div>
        <div class="builder-score-card" style="border-color: var(--primary); background: var(--primary-light);"><div class="label" style="color: var(--primary);">Tổng tối đa</div><div class="value" style="color: var(--primary);">${formatRationalScore(toFractionString(maxObj.maxTotal))} điểm</div></div>
      `;
    }

    const container = root.querySelector('#builderQuestionsContainer') as HTMLElement | null;
    if (!container) return;

    if (builderExamState.questions.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--gray-500); padding: 1.5rem; font-style: italic;">Chưa có câu hỏi nào trong đề thi. Nhấp vào các nút bên trên để thêm câu hỏi.</div>';
      return;
    }

    container.innerHTML = builderExamState.questions.map((q: any, idx: number) => {
      const badgeClass = q.kind === 'I' ? 'badge-part-i' : (q.kind === 'II' ? 'badge-part-ii' : 'badge-part-iii');
      const kindText = q.kind === 'I' ? 'Phần I' : (q.kind === 'II' ? 'Phần II' : 'Phần III');

      if (idx === editingQuestionIdx) {
        let editBody = '';
        if (q.kind === 'I') {
          const opts = q.options || [];
          editBody = `
            <div style="margin-top: 0.5rem;">
              <div style="font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.35rem;">4 Lựa chọn (Chọn nút tròn để chỉ định đáp án đúng):</div>
              ${opts.map((opt: any, oIdx: number) => {
                const isChecked = opt.optionId === q.correctOptionId || opt.optionId === `opt-${oIdx + 1}` ? 'checked' : '';
                return `
                  <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                    <input type="radio" id="editCorrectOpt_${idx}_${oIdx}" name="editCorrectOpt_${idx}" value="${escapeHtml(opt.optionId)}" ${isChecked} />
                    <strong>${escapeHtml(opt.label || String.fromCharCode(65 + oIdx))}.</strong>
                    <input type="text" id="editOptText_${idx}_${oIdx}" class="form-input" style="flex: 1;" value="${escapeHtml(opt.text || opt.content || '')}" />
                  </div>
                `;
              }).join('')}
            </div>
          `;
        } else if (q.kind === 'II') {
          const stmts = q.statements || [];
          editBody = `
            <div style="margin-top: 0.5rem;">
              <div style="font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.35rem;">4 Mệnh đề (Chọn Đúng hoặc Sai):</div>
              ${stmts.map((st: any, sIdx: number) => {
                const isTrue = st.answer === true;
                return `
                  <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                    <strong>${escapeHtml(st.label || String.fromCharCode(97 + sIdx))})</strong>
                    <input type="text" id="editStText_${idx}_${sIdx}" class="form-input" style="flex: 1;" value="${escapeHtml(st.text || st.content || '')}" />
                    <select id="editStAns_${idx}_${sIdx}" class="form-input" style="width: 85px;">
                      <option value="true" ${isTrue ? 'selected' : ''}>Đúng</option>
                      <option value="false" ${!isTrue ? 'selected' : ''}>Sai</option>
                    </select>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        } else if (q.kind === 'III') {
          editBody = `
            <div style="margin-top: 0.5rem;">
              <div style="font-size: 0.8125rem; font-weight: 600; margin-bottom: 0.35rem;">Đáp án chuẩn (tối đa 4 ký tự):</div>
              <input type="text" id="editQAnswerKey_${idx}" class="form-input" maxlength="4" style="width: 150px;" value="${escapeHtml(q.answerKey || '')}" />
            </div>
          `;
        }

        return `
          <div class="builder-q-card" data-q-idx="${idx}" style="border: 2px solid var(--primary); background: #fdfefe; padding: 1rem; margin-bottom: 0.75rem; border-radius: 6px;">
            <div class="builder-q-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="builder-q-badge ${badgeClass}">${kindText}</span>
                <strong>Chỉnh sửa câu #${idx + 1}</strong>
              </div>
              <div style="display: flex; gap: 0.35rem;">
                <button type="button" class="btn-submit btn-q-save-edit" data-idx="${idx}">💾 Lưu</button>
                <button type="button" class="btn-secondary btn-q-cancel-edit" data-idx="${idx}">Hủy</button>
              </div>
            </div>
            <div>
              <label style="font-size: 0.75rem; font-weight: 600;">Nội dung câu hỏi:</label>
              <textarea id="editQContent_${idx}" class="form-input" rows="3" style="width: 100%; resize: vertical;">${escapeHtml(q.content || '')}</textarea>
            </div>
            ${editBody}
          </div>
        `;
      }

      return `
        <div class="builder-q-card" data-q-idx="${idx}" style="border: 1px solid var(--gray-300); background: #fff; padding: 0.75rem 1rem; margin-bottom: 0.75rem; border-radius: 6px;">
          <div class="builder-q-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="builder-q-badge ${badgeClass}">${kindText}</span>
              <strong>${escapeHtml(q.title || `Câu ${idx + 1}`)}</strong>
            </div>
            <div style="display: flex; gap: 0.35rem;">
              <button type="button" class="btn-secondary btn-q-edit" data-idx="${idx}">✏️ Sửa</button>
              <button type="button" class="btn-secondary btn-q-delete" data-idx="${idx}">🗑️ Xóa</button>
            </div>
          </div>
          <div style="font-size: 0.875rem; color: var(--gray-800);">${escapeHtml(q.content || '')}</div>
        </div>
      `;
    }).join('');

    // Attach listeners to question card buttons
    container.querySelectorAll('.btn-q-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncInputsToState();
        const idx = parseInt(btn.getAttribute('data-idx') || '-1', 10);
        if (idx >= 0) {
          editingQuestionIdx = idx;
          renderBuilderForm();
        }
      });
    });

    container.querySelectorAll('.btn-q-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncInputsToState();
        const idx = parseInt(btn.getAttribute('data-idx') || '-1', 10);
        if (idx >= 0) {
          builderExamState.questions.splice(idx, 1);
          if (editingQuestionIdx === idx) editingQuestionIdx = -1;
          else if (editingQuestionIdx > idx) editingQuestionIdx--;
          renderBuilderForm();
        }
      });
    });

    container.querySelectorAll('.btn-q-save-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        syncInputsToState();
        const idx = parseInt(btn.getAttribute('data-idx') || '-1', 10);
        if (idx < 0 || idx >= builderExamState.questions.length) return;

        const q = builderExamState.questions[idx];
        const contentEl = root.querySelector(`#editQContent_${idx}`) as HTMLTextAreaElement | null;
        if (contentEl) q.content = contentEl.value;

        if (q.kind === 'I') {
          q.options = (q.options || []).map((opt: any, oIdx: number) => {
            const textEl = root.querySelector(`#editOptText_${idx}_${oIdx}`) as HTMLInputElement | null;
            return {
              ...opt,
              text: textEl ? textEl.value : opt.text,
            };
          });
          const rad = root.querySelector(`input[name="editCorrectOpt_${idx}"]:checked`) as HTMLInputElement | null;
          if (rad && rad.value) {
            q.correctOptionId = rad.value;
          }
        } else if (q.kind === 'II') {
          q.statements = (q.statements || []).map((st: any, sIdx: number) => {
            const textEl = root.querySelector(`#editStText_${idx}_${sIdx}`) as HTMLInputElement | null;
            const ansEl = root.querySelector(`#editStAns_${idx}_${sIdx}`) as HTMLSelectElement | null;
            return {
              ...st,
              text: textEl ? textEl.value : st.text,
              answer: ansEl ? ansEl.value === 'true' : st.answer,
            };
          });
        } else if (q.kind === 'III') {
          const keyEl = root.querySelector(`#editQAnswerKey_${idx}`) as HTMLInputElement | null;
          const keyVal = keyEl ? keyEl.value.trim() : '';
          // BLANK Part III KEY CHECK: Must prevent save and keep editor input in DOM
          if (!keyVal) {
            alert('Đáp án Phần III không được để trống!');
            return; // Leave editingQuestionIdx intact so input remains in DOM
          }
          q.answerKey = keyVal;
        }

        editingQuestionIdx = -1;
        renderBuilderForm();
      });
    });

    container.querySelectorAll('.btn-q-cancel-edit').forEach((btn) => {
      btn.addEventListener('click', () => {
        editingQuestionIdx = -1;
        renderBuilderForm();
      });
    });
  };

  // Add question to builder
  const addQuestion = (kind: 'I' | 'II' | 'III') => {
    syncInputsToState();
    const count = builderExamState.questions.length + 1;
    const qId = `q${String(count).padStart(2, '0')}-${kind.toLowerCase()}-${Date.now().toString(36).slice(-4)}`;

    if (kind === 'I') {
      builderExamState.questions.push({
        kind: 'I',
        questionVersionId: qId,
        title: `Câu ${count} (Phần I)`,
        content: `Nội dung câu hỏi ${count}...`,
        options: [
          { optionId: `${qId}-opt-a`, label: 'A', text: 'Lựa chọn A' },
          { optionId: `${qId}-opt-b`, label: 'B', text: 'Lựa chọn B' },
          { optionId: `${qId}-opt-c`, label: 'C', text: 'Lựa chọn C' },
          { optionId: `${qId}-opt-d`, label: 'D', text: 'Lựa chọn D' },
        ],
        correctOptionId: `${qId}-opt-a`,
      });
    } else if (kind === 'II') {
      builderExamState.questions.push({
        kind: 'II',
        questionVersionId: qId,
        title: `Câu ${count} (Phần II)`,
        content: `Nội dung câu hỏi ${count}...`,
        statements: [
          { statementId: `${qId}-st-a`, label: 'a', text: 'Mệnh đề a', answer: true },
          { statementId: `${qId}-st-b`, label: 'b', text: 'Mệnh đề b', answer: false },
          { statementId: `${qId}-st-c`, label: 'c', text: 'Mệnh đề c', answer: true },
          { statementId: `${qId}-st-d`, label: 'd', text: 'Mệnh đề d', answer: false },
        ],
      });
    } else if (kind === 'III') {
      builderExamState.questions.push({
        kind: 'III',
        questionVersionId: qId,
        title: `Câu ${count} (Phần III)`,
        content: `Nội dung câu hỏi ${count}...`,
        answerKey: '1,5',
      });
    }

    renderBuilderForm();
  };

  // Export draft validator (ND-01 check)
  const exportDraft = (): WebExam | null => {
    syncInputsToState();
    if (editingQuestionIdx >= 0) {
      alert('ND-01: Có câu hỏi đang sửa dở. Hãy bấm Lưu hoặc Hủy chỉnh sửa trước khi xuất bản!');
      throw new Error('ND-01: Có câu hỏi đang sửa dở');
    }

    const val = validateExamVersion(builderExamState);
    if (!val.ok) {
      const msg = val.issues.map((i: any) => `${i.code}: ${i.message}`).join('\n');
      alert(`Đề thi không hợp lệ:\n${msg}`);
      throw new Error(`Đề thi không hợp lệ:\n${msg}`);
    }

    return JSON.parse(JSON.stringify(builderExamState));
  };

  // Modal Open/Close
  const openBuilder = () => {
    builderLastFocus = doc.activeElement;
    if (builderModal) builderModal.style.display = 'flex';
    renderBuilderForm();
  };

  const closeBuilder = () => {
    if (builderModal) builderModal.style.display = 'none';
    if (builderLastFocus && typeof (builderLastFocus as HTMLElement).focus === 'function') {
      (builderLastFocus as HTMLElement).focus();
    }
  };

  // Render question bank list
  let bankActiveFilter = 'all';
  let bankActiveSearch = '';

  const renderBankList = () => {
    const container = root.querySelector('#bankQuestionsContainer') as HTMLElement | null;
    if (!container) return;

    let filtered = questionBank;
    if (bankActiveFilter !== 'all') {
      filtered = filtered.filter((q) => q.kind === bankActiveFilter);
    }
    if (bankActiveSearch.trim()) {
      const kw = bankActiveSearch.trim().toLowerCase();
      filtered = filtered.filter((q) =>
        (q.content || '').toLowerCase().includes(kw) ||
        (q.title || '').toLowerCase().includes(kw)
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--gray-500); padding: 1.5rem; font-style: italic;">Không tìm thấy câu hỏi nào.</div>';
      return;
    }

    container.innerHTML = filtered.map((q: any, idx: number) => {
      const badgeClass = q.kind === 'I' ? 'badge-part-i' : (q.kind === 'II' ? 'badge-part-ii' : 'badge-part-iii');
      const kindText = q.kind === 'I' ? 'Phần I' : (q.kind === 'II' ? 'Phần II' : 'Phần III');

      return `
        <div class="builder-q-card" style="border: 1px solid var(--gray-300); background: #fff; padding: 0.75rem 1rem; margin-bottom: 0.5rem; border-radius: 6px;">
          <div class="builder-q-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="builder-q-badge ${badgeClass}">${kindText}</span>
              <strong>${escapeHtml(q.title || `Câu ${idx + 1}`)}</strong>
            </div>
            <button type="button" class="btn-secondary btn-bank-add-to-exam" data-qid="${escapeHtml(q.questionVersionId || '')}">+ Thêm vào đề</button>
          </div>
          <div style="font-size: 0.875rem; color: var(--gray-800);">${escapeHtml(q.content || '')}</div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-bank-add-to-exam').forEach((btn) => {
      btn.addEventListener('click', () => {
        const qid = btn.getAttribute('data-qid');
        const match = questionBank.find((q) => q.questionVersionId === qid);
        if (match) {
          // Detached copy
          const copy = JSON.parse(JSON.stringify(match));
          // Remap IDs if needed
          const count = builderExamState.questions.length + 1;
          copy.questionVersionId = `q${String(count).padStart(2, '0')}-${copy.kind.toLowerCase()}-${Date.now().toString(36).slice(-4)}`;
          builderExamState.questions.push(copy);
          renderBuilderForm();
        }
      });
    });
  };

  const seedSampleBank = () => {
    const exam = options.getExam();
    const sourceQuestions = exam?.questions || [
      {
        kind: 'I',
        questionVersionId: 'bank-q1-i',
        title: 'Câu 1 (Phần I)',
        content: 'Cho hàm số bậc ba $y = f(x)$...',
        options: [
          { optionId: 'opt-a', label: 'A', text: 'Khoảng $(-\\infty; -1)$' },
          { optionId: 'opt-b', label: 'B', text: 'Khoảng $(-1; 1)$' },
          { optionId: 'opt-c', label: 'C', text: 'Khoảng $(0; 2)$' },
          { optionId: 'opt-d', label: 'D', text: 'Khoảng $(0; 1)$' },
        ],
        correctOptionId: 'opt-a',
      },
      {
        kind: 'II',
        questionVersionId: 'bank-q2-ii',
        title: 'Câu 2 (Phần II)',
        content: 'Cho hình chóp $S.ABCD$...',
        statements: [
          { statementId: 'st-a', label: 'a', text: 'Thể tích khối chóp...', answer: true },
          { statementId: 'st-b', label: 'b', text: 'Góc giữa hai mặt phẳng...', answer: false },
          { statementId: 'st-c', label: 'c', text: 'Khoảng cách từ A...', answer: true },
          { statementId: 'st-d', label: 'd', text: 'Bán kính mặt cầu...', answer: false },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'bank-q3-iii',
        title: 'Câu 3 (Phần III)',
        content: 'Tìm giá trị lớn nhất của hàm số...',
        answerKey: '4,5',
      },
    ];

    questionBank = JSON.parse(JSON.stringify(sourceQuestions));
    saveBankToStorage();
    renderBankList();
  };

  const openBank = () => {
    bankLastFocus = doc.activeElement;
    if (bankModal) bankModal.style.display = 'flex';
    if (questionBank.length === 0) seedSampleBank();
    renderBankList();
  };

  const closeBank = () => {
    if (bankModal) bankModal.style.display = 'none';
    if (bankLastFocus && typeof (bankLastFocus as HTMLElement).focus === 'function') {
      (bankLastFocus as HTMLElement).focus();
    }
  };

  // Wire event listeners
  if (btnOpenBuilder) btnOpenBuilder.addEventListener('click', openBuilder);
  if (btnCloseBuilder) btnCloseBuilder.addEventListener('click', closeBuilder);
  if (btnCancelBuilder) btnCancelBuilder.addEventListener('click', closeBuilder);

  if (btnAddPartI) btnAddPartI.addEventListener('click', () => addQuestion('I'));
  if (btnAddPartII) btnAddPartII.addEventListener('click', () => addQuestion('II'));
  if (btnAddPartIII) btnAddPartIII.addEventListener('click', () => addQuestion('III'));

  const btnPublishExam = root.querySelector('#btnPublishExam') as HTMLButtonElement | null;
  const teacherPublishStatus = root.querySelector('#teacherPublishStatus') as HTMLElement | null;

  const titleEl = root.querySelector('#builderExamTitle') as HTMLInputElement | null;
  if (titleEl) {
    const onTitleChange = () => {
      if (titleEl.value.trim()) {
        builderExamState.title = titleEl.value.trim();
      }
    };
    titleEl.addEventListener('input', onTitleChange);
    titleEl.addEventListener('change', onTitleChange);
  }

  const openAuthoringBuilder = (
    exam: unknown | null,
    opts?: {
      onPublish?: (exam: unknown) => Promise<AsResult<{ examId: string; revision: number }>>;
    }
  ) => {
    activeOnPublish = opts?.onPublish || null;
    if (exam && typeof exam === 'object') {
      builderExamState = JSON.parse(JSON.stringify(exam));
    } else {
      builderExamState = {
        schemaVersion: 'web-exam-v1',
        examId: 'exam-' + (options.idGen ? options.idGen() : Date.now().toString(36)),
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        title: 'Đề thi mới',
        subject: 'Toán học',
        grade: 12,
        durationMinutes: 50,
        settings: {
          durationMinutes: 50,
          maxAttempts: null,
          releasePolicy: 'immediate',
          shuffleQuestions: false,
          shuffleOptions: false,
        },
        assets: [],
        questions: [],
      };
    }
    editingQuestionIdx = -1;
    if (titleEl) titleEl.value = builderExamState.title || '';
    const idEl = root.querySelector('#builderExamId') as HTMLInputElement | null;
    if (idEl) idEl.value = builderExamState.examId || '';
    const durEl = root.querySelector('#builderDuration') as HTMLInputElement | null;
    if (durEl) durEl.value = String(builderExamState.settings?.durationMinutes || builderExamState.durationMinutes || 50);
    if (teacherPublishStatus) teacherPublishStatus.textContent = '';
    if (btnPublishExam) btnPublishExam.style.display = 'inline-block';
    renderBuilderForm();
    openBuilder();
  };

  (root as any).__cunata_loadBuilderExam = openAuthoringBuilder;

  if (btnPublishExam) {
    btnPublishExam.addEventListener('click', async () => {
      try {
        syncInputsToState();
        if (editingQuestionIdx >= 0) {
          if (teacherPublishStatus) {
            teacherPublishStatus.textContent = 'ND-01: Có câu hỏi đang sửa dở. Hãy bấm Lưu hoặc Hủy chỉnh sửa trước khi xuất bản!';
          }
          return;
        }

        const val = validateExamVersion(builderExamState);
        if (!val.ok) {
          const issuesMsg = val.issues.map((i: any) => `${i.code}: ${i.message}`).join(', ');
          if (teacherPublishStatus) {
            teacherPublishStatus.textContent = 'Lỗi INVALID_EXAM: ' + issuesMsg;
          }
          return;
        }

        const draft = JSON.parse(JSON.stringify(builderExamState));
        if (teacherPublishStatus) teacherPublishStatus.textContent = 'Đang xuất bản...';

        if (activeOnPublish) {
          const res = await activeOnPublish(draft);
          if (res.ok) {
            if (teacherPublishStatus) {
              teacherPublishStatus.textContent = 'Đã xuất bản (revision ' + (res.value.revision || 1) + ')';
            }
            if (options.onPublishedToWeb) {
              options.onPublishedToWeb(draft);
            }
          } else {
            let errMsg = res.message || res.code || 'Lỗi xuất bản';
            if (res.code === 'INVALID_EXAM' && (res as any).details) {
              const details = (res as any).details;
              if (Array.isArray(details)) {
                errMsg += ': ' + details.map((d: any) => typeof d === 'string' ? d : `${d.code}: ${d.message}`).join('; ');
              } else if (typeof details === 'object') {
                errMsg += ': ' + JSON.stringify(details);
              }
            }
            if (teacherPublishStatus) teacherPublishStatus.textContent = 'Lỗi xuất bản: ' + errMsg;
          }
          return;
        }

        const appsScriptUrl = options.getAppsScriptUrl ? options.getAppsScriptUrl() : '';
        const password = options.getTeacherPassword ? options.getTeacherPassword() : null;
        if (!appsScriptUrl || !password) {
          if (teacherPublishStatus) teacherPublishStatus.textContent = 'Chưa cấu hình hoặc chưa đăng nhập giáo viên';
          return;
        }

        const res = await fetch(appsScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: 'publishExam',
            password,
            exam: draft,
          }),
        });
        const data = await res.json();
        if (data && data.success) {
          if (teacherPublishStatus) teacherPublishStatus.textContent = 'Đã xuất bản (revision ' + (data.revision || 1) + ')';
          if (options.onPublishedToWeb) {
            options.onPublishedToWeb(draft);
          }
        } else {
          let errDetail = data?.message || data?.error || 'Không hợp lệ';
          if (data?.errors && Array.isArray(data.errors)) {
            errDetail += ': ' + data.errors.join('; ');
          }
          if (teacherPublishStatus) teacherPublishStatus.textContent = 'Lỗi xuất bản: ' + errDetail;
        }
      } catch (err: any) {
        if (teacherPublishStatus) teacherPublishStatus.textContent = 'Lỗi xuất bản: ' + (err?.message || String(err));
      }
    });
  }

  if (btnPublishToRunner) {
    btnPublishToRunner.addEventListener('click', () => {
      try {
        const draft = exportDraft();
        if (draft) {
          options.onPublish(draft);
          closeBuilder();
        }
      } catch (_) {}
    });
  }

  if (btnExportExamJson) {
    btnExportExamJson.addEventListener('click', () => {
      try {
        const draft = exportDraft();
        if (draft) {
          const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = doc.createElement('a');
          a.href = url;
          a.download = `${draft.examId || 'exam'}.json`;
          doc.body.appendChild(a);
          a.click();
          doc.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (_) {}
    });
  }

  if (builderFileInput) {
    builderFileInput.addEventListener('change', (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result;
          if (typeof text !== 'string') return;
          const parsed = JSON.parse(text);
          const val = validateExamVersion(parsed);
          if (!val.ok) {
            const msg = val.issues.map((i: any) => `${i.code}: ${i.message}`).join('\n');
            alert(`Lỗi nạp file đề thi:\n${msg}`);
            return; // Retain valid draft!
          }
          builderExamState = val.value;
          editingQuestionIdx = -1;
          renderBuilderForm();
        } catch (err: any) {
          alert(`Lỗi: ${err?.message || String(err)}`);
        }
      };
      reader.readAsText(file);
      builderFileInput.value = '';
    });
  }

  // Question Bank events
  if (btnOpenBank) btnOpenBank.addEventListener('click', openBank);
  if (btnCloseBank) btnCloseBank.addEventListener('click', closeBank);
  if (btnCancelBank) btnCancelBank.addEventListener('click', closeBank);
  if (btnSeedBankSample) btnSeedBankSample.addEventListener('click', seedSampleBank);
  if (btnClearBank) {
    btnClearBank.addEventListener('click', () => {
      questionBank = [];
      saveBankToStorage();
      renderBankList();
    });
  }

  if (btnExportBankJson) {
    btnExportBankJson.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(questionBank, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = 'bank-backup.json';
      doc.body.appendChild(a);
      a.click();
      doc.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  if (btnImportBankJson && bankFileInput) {
    btnImportBankJson.addEventListener('click', () => bankFileInput.click());
    bankFileInput.addEventListener('change', (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result;
          if (typeof text !== 'string') return;
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            questionBank = parsed;
            saveBankToStorage();
            renderBankList();
          }
        } catch (err: any) {
          alert(`Lỗi: ${err?.message || String(err)}`);
        }
      };
      reader.readAsText(file);
      bankFileInput.value = '';
    });
  }

  // Bank filters
  root.querySelectorAll('.bank-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.bank-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      bankActiveFilter = btn.getAttribute('data-filter') || 'all';
      renderBankList();
    });
  });

  if (bankSearchInput) {
    bankSearchInput.addEventListener('input', () => {
      bankActiveSearch = bankSearchInput.value;
      renderBankList();
    });
  }

  // DOCX Import File Chooser
  let docxInput = root.querySelector('#docxFileInput') as HTMLInputElement | null;
  const btnImportDocx = root.querySelector('#btnImportDocx') as HTMLButtonElement | null;
  if (!docxInput) {
    docxInput = doc.createElement('input');
    docxInput.type = 'file';
    docxInput.id = 'docxFileInput';
    docxInput.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    docxInput.style.display = 'none';
    if (builderModal) {
      builderModal.appendChild(docxInput);
    } else {
      root.appendChild(docxInput);
    }
  }

  if (btnImportDocx && docxInput) {
    btnImportDocx.addEventListener('click', () => {
      if (docxInput) {
        docxInput.value = '';
        docxInput.click();
      }
    });
  }

  docxInput.addEventListener('change', async (e: any) => {
    const file = e.target?.files?.[0];
    if (!file) return;

    try {
      const res = await importDocx(file, new AbortController().signal);
      if (!res.ok) {
        alert(`Lỗi nhập DOCX: ${res.error.message}`);
        return;
      }

      let previewModal = doc.getElementById('previewModal');
      if (!previewModal) {
        previewModal = doc.createElement('div');
        previewModal.id = 'previewModal';
        previewModal.className = 'modal-overlay';
        previewModal.style.zIndex = '1100';
        doc.body.appendChild(previewModal);
      }
      previewModal.style.display = 'flex';

      mountPreview(previewModal, {
        job: res.value,
        targetExamDraft: {
          draftId: 'builder-draft',
          revision: 1,
          exam: builderExamState,
        },
      }, {
        onConfirm: (confirmedDraft: any) => {
          if (previewModal) {
            previewModal.style.display = 'none';
            previewModal.innerHTML = '';
          }
          if (confirmedDraft && confirmedDraft.exam) {
            builderExamState = confirmedDraft.exam;
            renderBuilderForm();
          }
        },
        onCancel: () => {
          if (previewModal) {
            previewModal.style.display = 'none';
            previewModal.innerHTML = '';
          }
        },
      });
    } catch (err: any) {
      alert(`Lỗi: ${err?.message || String(err)}`);
    }
    docxInput.value = '';
  });

  const dispose = () => {
    // Teardown
  };

  const ctrl: AuthoringController & (() => void) = Object.assign(dispose, {
    openBuilder: openAuthoringBuilder,
    dispose,
  });

  return ctrl;
}
