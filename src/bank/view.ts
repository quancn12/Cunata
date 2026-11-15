/// <reference lib="dom" />

import type {
  BankEntry,
  BankFilter,
  ExamDraft,
  StoragePort,
  Taxonomy,
  Section,
  WebQuestion,
  Block,
  Cell,
} from './types.ts';
import {
  queryBank,
  addToDraft,
} from './index.ts';
import {
  exportBankTransfer,
  parseBankTransfer,
  importBankTransfer,
  deleteBankEntryConfirmed,
  clearAllConfirmed,
} from './transfer.ts';

export interface BankViewModel {
  readonly entries?: readonly BankEntry[];
  readonly storage?: StoragePort;
  readonly draft?: ExamDraft;
  readonly filter?: BankFilter;
  readonly statusMessage?: string;
  readonly statusType?: 'info' | 'success' | 'error';
  readonly previewEntryId?: string | null;
  readonly roleLabel?: string;
}

export type BankViewActions = Readonly<Record<string, (value: unknown) => void>>;

function deepClone<T>(val: T): T {
  if (val === undefined || val === null || typeof val !== 'object') {
    return val;
  }
  if (typeof structuredClone === 'function') {
    return structuredClone(val);
  }
  return JSON.parse(JSON.stringify(val)) as T;
}

function extractTextFromBlocks(blocks?: readonly Block[]): string {
  if (!blocks || !Array.isArray(blocks)) return '';
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    } else if (block.type === 'math' && typeof block.source === 'string') {
      parts.push(block.source);
    } else if (block.type === 'image' && typeof block.alt === 'string') {
      parts.push(block.alt);
    } else if (block.type === 'table' && Array.isArray(block.rows)) {
      for (const row of block.rows) {
        if (!Array.isArray(row)) continue;
        for (const cell of row as readonly Cell[]) {
          if (cell && Array.isArray(cell.blocks)) {
            parts.push(extractTextFromBlocks(cell.blocks));
          }
        }
      }
    }
  }
  return parts.join(' ');
}

/**
 * Canonical UI mount convention implementation for Cunata Bank View.
 * Conforms to WEB-contract.md §5:
 * export function mount(root: HTMLElement, model: unknown, actions: Readonly<Record<string,(value:unknown)=>void>>): () => void;
 */
export function mount(
  root: HTMLElement,
  model: unknown,
  actions: BankViewActions = {},
): () => void {
  if (!root) {
    throw new Error('Root HTMLElement must be provided to mount()');
  }

  const doc = root.ownerDocument || document;
  const cleanupTasks: (() => void)[] = [];

  function attachEvent(el: HTMLElement, event: string, handler: (e?: any) => void) {
    el.addEventListener(event, handler);
    (el as any)[`on${event}`] = handler;
    cleanupTasks.push(() => {
      try {
        el.removeEventListener(event, handler);
        (el as any)[`on${event}`] = null;
      } catch {
        // ignore
      }
    });
  }

  // 1. Normalize model
  let vm: BankViewModel;
  if (!model || typeof model !== 'object') {
    vm = { entries: [] };
  } else if (Array.isArray(model)) {
    vm = { entries: model as readonly BankEntry[] };
  } else {
    vm = model as BankViewModel;
  }

  const allEntries: BankEntry[] = Array.isArray(vm.entries) ? [...vm.entries] : [];
  let currentFilter: BankFilter = vm.filter ? deepClone(vm.filter) : {};
  let currentPreviewEntry: BankEntry | null = null;

  if (vm.previewEntryId) {
    currentPreviewEntry = allEntries.find((e) => e.questionVersionId === vm.previewEntryId) || null;
  }

  // 2. Clear root and add base container
  root.textContent = '';
  const container = doc.createElement('div');
  container.className = 'cunata-bank-view';
  root.appendChild(container);

  // Status message container
  const statusEl = doc.createElement('div');
  statusEl.className = 'cunata-bank-status-container';
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  container.appendChild(statusEl);

  function showStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
    statusEl.textContent = '';
    statusEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
    statusEl.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    const banner = doc.createElement('div');
    banner.className = `cunata-bank-status ${type}`;
    banner.textContent = message;
    statusEl.appendChild(banner);
  }

  if (vm.statusMessage) {
    showStatus(vm.statusMessage, vm.statusType || 'info');
  }

  // 3. Honest Local-Tool Role Banner
  const roleBanner = doc.createElement('section');
  roleBanner.className = 'cunata-bank-role-banner';
  roleBanner.setAttribute('aria-label', 'Thông tin vai trò và giới hạn công cụ');

  const bannerTitle = doc.createElement('div');
  bannerTitle.className = 'banner-title';
  bannerTitle.textContent = '🛠️ CÔNG CỤ QUẢN LÝ NGÂN HÀNG CÂU HỎI (CỤC BỘ / OFFLINE)';
  roleBanner.appendChild(bannerTitle);

  const bannerDesc = doc.createElement('p');
  bannerDesc.className = 'banner-desc';
  bannerDesc.textContent =
    'Vai trò: Giáo viên / Soạn đề. Ứng dụng hoạt động cục bộ trên trình duyệt, không đăng nhập máy chủ từ xa và không có quyền quản trị giả lập. Mọi câu hỏi được lưu trong bộ nhớ trình duyệt (StoragePort).';
  roleBanner.appendChild(bannerDesc);

  const bannerWarn = doc.createElement('p');
  bannerWarn.className = 'banner-warning';
  bannerWarn.textContent =
    '⚠️ Lưu ý an toàn: Dữ liệu có thể bị xóa nếu bạn dọn dẹp bộ nhớ trình duyệt. Vui lòng định kỳ xuất tệp sao lưu (.json) để bảo toàn ngân hàng câu hỏi.';
  roleBanner.appendChild(bannerWarn);

  container.appendChild(roleBanner);

  // 4. Header & Top Toolbar
  const header = doc.createElement('header');
  header.className = 'cunata-bank-header';

  const titleGroup = doc.createElement('div');
  titleGroup.className = 'cunata-bank-title-group';

  const h1 = doc.createElement('h1');
  h1.textContent = 'Ngân hàng câu hỏi GDPT 2018';
  titleGroup.appendChild(h1);

  const sub = doc.createElement('p');
  sub.textContent = 'Phân loại 5 tầng: Môn > Lớp > Chủ đề > Bài học > Mức độ. Tìm kiếm Unicode & Tái sử dụng.';
  titleGroup.appendChild(sub);
  header.appendChild(titleGroup);

  const topActions = doc.createElement('div');
  topActions.className = 'cunata-bank-top-actions';

  // Export Button
  const exportBtn = doc.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'cunata-btn';
  exportBtn.textContent = '📥 Xuất ngân hàng (JSON)';
  exportBtn.setAttribute('aria-label', 'Xuất toàn bộ câu hỏi trong ngân hàng thành tệp JSON');
  attachEvent(exportBtn, 'click', () => {
    const filtered = queryBank(allEntries, currentFilter);
    const blob = exportBankTransfer(filtered, { title: 'Xuất ngân hàng câu hỏi Cunata' });

    if (typeof actions.exportBank === 'function') {
      actions.exportBank({ blob, entries: filtered });
    }

    // Trigger browser download if URL API is available
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = `cunata-bank-${new Date().toISOString().substring(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    showStatus(`Đã xuất ${filtered.length} câu hỏi thành công.`, 'success');
  });
  topActions.appendChild(exportBtn);

  // Hidden File Input for Import
  const fileInput = doc.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  attachEvent(fileInput, 'change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (typeof actions.importBank === 'function') {
        actions.importBank(text);
      } else if (vm.storage) {
        const importRes = await importBankTransfer(text, vm.storage, { dedupe: 'skip' });
        if (importRes.ok) {
          if (importRes.value.errors.length > 0) {
            if (importRes.value.imported === 0 && importRes.value.updated === 0 && importRes.value.forked === 0) {
              const firstErr = importRes.value.errors[0]?.error;
              showStatus(
                `Nhập thất bại do lỗi lưu trữ: ${firstErr?.message || 'STORAGE_QUOTA hoặc lỗi ghi'} (${importRes.value.errors.length} câu lỗi).`,
                'error',
              );
            } else {
              showStatus(
                `Nhập thành công ${importRes.value.imported} câu mới, nhưng có ${importRes.value.errors.length} câu thất bại do lỗi lưu trữ: ${importRes.value.errors[0]?.error.message}`,
                'error',
              );
            }
          } else {
            showStatus(
              `Nhập thành công: ${importRes.value.imported} câu mới, bỏ qua ${importRes.value.skipped} câu trùng lặp.`,
              'success',
            );
          }
        } else {
          showStatus(`Nhập thất bại: ${importRes.error.message}`, 'error');
        }
      } else {
        const parsed = parseBankTransfer(text);
        if (parsed.ok) {
          showStatus(`Đã đọc hợp lệ ${parsed.value.count} câu hỏi từ tệp.`, 'success');
        } else {
          showStatus(`Tệp chuyển giao không hợp lệ: ${parsed.error.message}`, 'error');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showStatus(`Lỗi đọc tệp: ${msg}`, 'error');
    } finally {
      fileInput.value = '';
    }
  });
  container.appendChild(fileInput);

  // Import Button
  const importBtn = doc.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'cunata-btn';
  importBtn.textContent = '📤 Nhập câu hỏi (JSON)';
  importBtn.setAttribute('aria-label', 'Nhập danh sách câu hỏi từ tệp JSON vào ngân hàng');
  attachEvent(importBtn, 'click', () => {
    fileInput.click();
  });
  topActions.appendChild(importBtn);

  // Backup Button
  const backupBtn = doc.createElement('button');
  backupBtn.type = 'button';
  backupBtn.className = 'cunata-btn';
  backupBtn.textContent = '💾 Sao lưu hệ thống';
  backupBtn.setAttribute('aria-label', 'Tạo bản sao lưu toàn diện hệ thống');
  attachEvent(backupBtn, 'click', async () => {
    if (typeof actions.exportBackup === 'function') {
      actions.exportBackup(null);
    } else if (vm.storage) {
      const res = await vm.storage.exportBackup();
      if (res.ok && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(res.value);
        const a = doc.createElement('a');
        a.href = url;
        a.download = `cunata-backup-${new Date().toISOString().substring(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showStatus('Đã sao lưu thành công toàn bộ hệ thống.', 'success');
      } else if (!res.ok) {
        showStatus(`Sao lưu thất bại: ${res.error.message}`, 'error');
      }
    } else {
      showStatus('Tính năng sao lưu yêu cầu StoragePort khả dụng.', 'info');
    }
  });
  topActions.appendChild(backupBtn);

  header.appendChild(topActions);
  container.appendChild(header);

  // 5. Five-Level Filter & Search Panel
  const filterPanel = doc.createElement('fieldset');
  filterPanel.className = 'cunata-bank-filters-panel';

  const legend = doc.createElement('legend');
  legend.textContent = '🔍 Bộ lọc đồng thời 5 tầng & Tìm kiếm';
  filterPanel.appendChild(legend);

  // Search Input Row
  const searchRow = doc.createElement('div');
  searchRow.className = 'cunata-bank-search-row';

  const searchInputWrap = doc.createElement('div');
  searchInputWrap.className = 'cunata-search-input-wrap';

  const searchInput = doc.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'cunata-search-input';
  searchInput.placeholder = 'Tìm kiếm từ khóa (tiêu đề, nội dung, đáp án, lời giải, công thức...)...';
  searchInput.value = currentFilter.text || '';
  searchInput.setAttribute('aria-label', 'Tìm kiếm từ khóa toàn diện');
  attachEvent(searchInput, 'input', () => {
    currentFilter = { ...currentFilter, text: searchInput.value };
    renderList();
    if (typeof actions.onFilterChange === 'function') {
      actions.onFilterChange(currentFilter);
    }
  });

  searchInputWrap.appendChild(searchInput);
  searchRow.appendChild(searchInputWrap);
  filterPanel.appendChild(searchRow);

  // Filter Grid
  const filterGrid = doc.createElement('div');
  filterGrid.className = 'cunata-filter-grid';

  // Level 1: Subject
  const subjectField = doc.createElement('div');
  subjectField.className = 'cunata-filter-field';
  const subjectLabel = doc.createElement('label');
  subjectLabel.textContent = '1. Môn học';
  subjectLabel.htmlFor = 'cunata-filter-subject';
  const subjectSelect = doc.createElement('select');
  subjectSelect.id = 'cunata-filter-subject';
  subjectSelect.className = 'cunata-filter-select';

  const subjects = ['all', 'Toán học', 'Vật lí', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lí', 'Tin học', 'Công nghệ', 'GDCD'];
  for (const s of subjects) {
    const opt = doc.createElement('option');
    opt.value = s;
    opt.textContent = s === 'all' ? '-- Tất cả môn học --' : s;
    if ((currentFilter.subject || 'all') === s) opt.selected = true;
    subjectSelect.appendChild(opt);
  }
  attachEvent(subjectSelect, 'change', () => {
    currentFilter = { ...currentFilter, subject: subjectSelect.value === 'all' ? undefined : subjectSelect.value };
    renderList();
    if (typeof actions.onFilterChange === 'function') actions.onFilterChange(currentFilter);
  });
  subjectField.appendChild(subjectLabel);
  subjectField.appendChild(subjectSelect);
  filterGrid.appendChild(subjectField);

  // Level 2: Grade
  const gradeField = doc.createElement('div');
  gradeField.className = 'cunata-filter-field';
  const gradeLabel = doc.createElement('label');
  gradeLabel.textContent = '2. Khối lớp';
  gradeLabel.htmlFor = 'cunata-filter-grade';
  const gradeSelect = doc.createElement('select');
  gradeSelect.id = 'cunata-filter-grade';
  gradeSelect.className = 'cunata-filter-select';

  const grades = [
    { val: 'all', label: '-- Tất cả các khối --' },
    { val: '10', label: 'Lớp 10' },
    { val: '11', label: 'Lớp 11' },
    { val: '12', label: 'Lớp 12' },
  ];
  for (const g of grades) {
    const opt = doc.createElement('option');
    opt.value = g.val;
    opt.textContent = g.label;
    if (currentFilter.grade !== undefined && String(currentFilter.grade) === g.val) {
      opt.selected = true;
    }
    gradeSelect.appendChild(opt);
  }
  attachEvent(gradeSelect, 'change', () => {
    const gVal = gradeSelect.value;
    currentFilter = {
      ...currentFilter,
      grade: gVal === 'all' ? undefined : (Number(gVal) as 10 | 11 | 12),
    };
    renderList();
    if (typeof actions.onFilterChange === 'function') actions.onFilterChange(currentFilter);
  });
  gradeField.appendChild(gradeLabel);
  gradeField.appendChild(gradeSelect);
  filterGrid.appendChild(gradeField);

  // Level 3: Topic
  const topicField = doc.createElement('div');
  topicField.className = 'cunata-filter-field';
  const topicLabel = doc.createElement('label');
  topicLabel.textContent = '3. Chủ đề / Chương';
  topicLabel.htmlFor = 'cunata-filter-topic';
  const topicInput = doc.createElement('input');
  topicInput.id = 'cunata-filter-topic';
  topicInput.type = 'text';
  topicInput.className = 'cunata-filter-text-input';
  topicInput.placeholder = 'Nhập tên chủ đề...';
  topicInput.value = currentFilter.topic || '';
  attachEvent(topicInput, 'input', () => {
    currentFilter = { ...currentFilter, topic: topicInput.value.trim() === '' ? undefined : topicInput.value.trim() };
    renderList();
    if (typeof actions.onFilterChange === 'function') actions.onFilterChange(currentFilter);
  });
  topicField.appendChild(topicLabel);
  topicField.appendChild(topicInput);
  filterGrid.appendChild(topicField);

  // Level 4: Lesson
  const lessonField = doc.createElement('div');
  lessonField.className = 'cunata-filter-field';
  const lessonLabel = doc.createElement('label');
  lessonLabel.textContent = '4. Bài học';
  lessonLabel.htmlFor = 'cunata-filter-lesson';
  const lessonInput = doc.createElement('input');
  lessonInput.id = 'cunata-filter-lesson';
  lessonInput.type = 'text';
  lessonInput.className = 'cunata-filter-text-input';
  lessonInput.placeholder = 'Nhập tên bài học...';
  lessonInput.value = currentFilter.lesson || '';
  attachEvent(lessonInput, 'input', () => {
    currentFilter = { ...currentFilter, lesson: lessonInput.value.trim() === '' ? undefined : lessonInput.value.trim() };
    renderList();
    if (typeof actions.onFilterChange === 'function') actions.onFilterChange(currentFilter);
  });
  lessonField.appendChild(lessonLabel);
  lessonField.appendChild(lessonInput);
  filterGrid.appendChild(lessonField);

  // Level 5: Difficulty
  const diffField = doc.createElement('div');
  diffField.className = 'cunata-filter-field';
  const diffLabel = doc.createElement('label');
  diffLabel.textContent = '5. Mức độ';
  diffLabel.htmlFor = 'cunata-filter-diff';
  const diffSelect = doc.createElement('select');
  diffSelect.id = 'cunata-filter-diff';
  diffSelect.className = 'cunata-filter-select';

  const diffs = ['all', 'Nhận biết', 'Thông hiểu', 'Vận dụng'];
  for (const d of diffs) {
    const opt = doc.createElement('option');
    opt.value = d;
    opt.textContent = d === 'all' ? '-- Tất cả mức độ --' : d;
    if ((currentFilter.difficulty || 'all') === d) opt.selected = true;
    diffSelect.appendChild(opt);
  }
  attachEvent(diffSelect, 'change', () => {
    currentFilter = {
      ...currentFilter,
      difficulty: diffSelect.value === 'all' ? undefined : (diffSelect.value as Taxonomy['difficulty']),
    };
    renderList();
    if (typeof actions.onFilterChange === 'function') actions.onFilterChange(currentFilter);
  });
  diffField.appendChild(diffLabel);
  diffField.appendChild(diffSelect);
  filterGrid.appendChild(diffField);

  // Extra filter: Section / Kind
  const kindField = doc.createElement('div');
  kindField.className = 'cunata-filter-field';
  const kindLabel = doc.createElement('label');
  kindLabel.textContent = 'Phần thi (Dạng câu)';
  kindLabel.htmlFor = 'cunata-filter-kind';
  const kindSelect = doc.createElement('select');
  kindSelect.id = 'cunata-filter-kind';
  kindSelect.className = 'cunata-filter-select';

  const kinds = [
    { val: 'all', label: '-- Tất cả các phần --' },
    { val: 'I', label: 'Phần I: 4 lựa chọn (A/B/C/D)' },
    { val: 'II', label: 'Phần II: Đúng/Sai 4 ý' },
    { val: 'III', label: 'Phần III: Trả lời ngắn' },
  ];
  for (const k of kinds) {
    const opt = doc.createElement('option');
    opt.value = k.val;
    opt.textContent = k.label;
    if ((currentFilter.kind || 'all') === k.val) opt.selected = true;
    kindSelect.appendChild(opt);
  }
  attachEvent(kindSelect, 'change', () => {
    currentFilter = {
      ...currentFilter,
      kind: kindSelect.value === 'all' ? undefined : (kindSelect.value as Section),
    };
    renderList();
    if (typeof actions.onFilterChange === 'function') actions.onFilterChange(currentFilter);
  });
  kindField.appendChild(kindLabel);
  kindField.appendChild(kindSelect);
  filterGrid.appendChild(kindField);

  filterPanel.appendChild(filterGrid);

  // Filter Reset Button
  const filterActions = doc.createElement('div');
  filterActions.className = 'cunata-filter-actions';

  const resetBtn = doc.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'cunata-btn cunata-btn-sm';
  resetBtn.textContent = '🔄 Đặt lại bộ lọc';
  attachEvent(resetBtn, 'click', () => {
    currentFilter = {};
    searchInput.value = '';
    subjectSelect.value = 'all';
    gradeSelect.value = 'all';
    topicInput.value = '';
    lessonInput.value = '';
    diffSelect.value = 'all';
    kindSelect.value = 'all';
    renderList();
    if (typeof actions.onFilterChange === 'function') actions.onFilterChange(currentFilter);
  });
  filterActions.appendChild(resetBtn);
  filterPanel.appendChild(filterActions);

  container.appendChild(filterPanel);

  // 6. Results Header & Count
  const resultsBar = doc.createElement('div');
  resultsBar.className = 'cunata-bank-results-bar';

  const countDisplay = doc.createElement('div');
  countDisplay.className = 'cunata-bank-results-count';
  resultsBar.appendChild(countDisplay);

  container.appendChild(resultsBar);

  // 7. Question List Container
  const listContainer = doc.createElement('div');
  listContainer.className = 'cunata-bank-list';
  container.appendChild(listContainer);

  // Modal Backdrop Container for Preview / Confirm Dialogs
  const modalContainer = doc.createElement('div');
  modalContainer.className = 'cunata-bank-modal-container';
  container.appendChild(modalContainer);

  function closeModal() {
    modalContainer.textContent = '';
  }

  // Preview Dialog Renderer
  function openPreviewModal(entry: BankEntry) {
    modalContainer.textContent = '';

    const backdrop = doc.createElement('div');
    backdrop.className = 'cunata-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'cunata-preview-title');

    const dialog = doc.createElement('div');
    dialog.className = 'cunata-modal-dialog';

    // Header
    const mHeader = doc.createElement('div');
    mHeader.className = 'cunata-modal-header';

    const mTitle = doc.createElement('h2');
    mTitle.id = 'cunata-preview-title';
    mTitle.textContent = entry.question.title || 'Chi tiết câu hỏi';
    mHeader.appendChild(mTitle);

    const closeBtnX = doc.createElement('button');
    closeBtnX.type = 'button';
    closeBtnX.className = 'cunata-btn cunata-btn-sm';
    closeBtnX.textContent = '✕';
    closeBtnX.setAttribute('aria-label', 'Đóng xem trước');
    attachEvent(closeBtnX, 'click', closeModal);
    mHeader.appendChild(closeBtnX);

    dialog.appendChild(mHeader);

    // Body
    const mBody = doc.createElement('div');
    mBody.className = 'cunata-modal-body';

    // Badges Row
    const badgesRow = doc.createElement('div');
    badgesRow.className = 'cunata-badges-row';
    badgesRow.style.marginBottom = '12px';

    const bSubject = doc.createElement('span');
    bSubject.className = 'cunata-badge cunata-badge-subject';
    bSubject.textContent = entry.taxonomy.subject;
    badgesRow.appendChild(bSubject);

    const bGrade = doc.createElement('span');
    bGrade.className = 'cunata-badge cunata-badge-grade';
    bGrade.textContent = `Lớp ${entry.taxonomy.grade}`;
    badgesRow.appendChild(bGrade);

    const bTopic = doc.createElement('span');
    bTopic.className = 'cunata-badge cunata-badge-grade';
    bTopic.textContent = entry.taxonomy.topic;
    badgesRow.appendChild(bTopic);

    const bLesson = doc.createElement('span');
    bLesson.className = 'cunata-badge cunata-badge-grade';
    bLesson.textContent = entry.taxonomy.lesson;
    badgesRow.appendChild(bLesson);

    const bDiff = doc.createElement('span');
    const diffClass =
      entry.taxonomy.difficulty === 'Nhận biết'
        ? 'cunata-badge-diff-nb'
        : entry.taxonomy.difficulty === 'Thông hiểu'
          ? 'cunata-badge-diff-th'
          : 'cunata-badge-diff-vd';
    bDiff.className = `cunata-badge ${diffClass}`;
    bDiff.textContent = entry.taxonomy.difficulty;
    badgesRow.appendChild(bDiff);

    const bKind = doc.createElement('span');
    bKind.className = 'cunata-badge cunata-badge-kind';
    bKind.textContent = `Phần ${entry.question.kind}`;
    badgesRow.appendChild(bKind);

    if (entry.question.provenance) {
      const bProv = doc.createElement('span');
      bProv.className = 'cunata-badge cunata-badge-provenance';
      bProv.textContent = `Nguồn: ${entry.question.provenance.sourceId || 'cục bộ'}`;
      badgesRow.appendChild(bProv);
    }

    mBody.appendChild(badgesRow);

    // Content Section
    if (entry.question.content) {
      const secContent = doc.createElement('div');
      secContent.className = 'cunata-preview-section';
      const cTitle = doc.createElement('div');
      cTitle.className = 'cunata-preview-section-title';
      cTitle.textContent = 'Nội dung câu hỏi';
      secContent.appendChild(cTitle);

      const cText = doc.createElement('div');
      cText.textContent = entry.question.content;
      secContent.appendChild(cText);
      mBody.appendChild(secContent);
    }

    // Blocks section if present
    if (entry.question.blocks && entry.question.blocks.length > 0) {
      const secBlocks = doc.createElement('div');
      secBlocks.className = 'cunata-preview-section';
      const bTitle = doc.createElement('div');
      bTitle.className = 'cunata-preview-section-title';
      bTitle.textContent = 'Các khối nội dung (Blocks)';
      secBlocks.appendChild(bTitle);

      for (const blk of entry.question.blocks) {
        const blkDiv = doc.createElement('div');
        blkDiv.style.margin = '6px 0';
        if (blk.type === 'text') {
          blkDiv.textContent = blk.text;
        } else if (blk.type === 'math') {
          blkDiv.textContent = `[Công thức ${blk.format}]: ${blk.source}`;
          blkDiv.style.fontFamily = 'monospace';
          blkDiv.style.backgroundColor = '#f1f5f9';
          blkDiv.style.padding = '4px 8px';
          blkDiv.style.borderRadius = '4px';
        } else if (blk.type === 'image') {
          blkDiv.textContent = `[Hình ảnh]: ${blk.alt} (Asset ID: ${blk.assetId})`;
          blkDiv.style.fontStyle = 'italic';
        } else if (blk.type === 'table') {
          blkDiv.textContent = `[Bảng dữ liệu: ${blk.rows.length} hàng]`;
        }
        secBlocks.appendChild(blkDiv);
      }
      mBody.appendChild(secBlocks);
    }

    // Kind Specific Details
    if (entry.question.kind === 'I') {
      const secOpts = doc.createElement('div');
      secOpts.className = 'cunata-preview-section';
      const oTitle = doc.createElement('div');
      oTitle.className = 'cunata-preview-section-title';
      oTitle.textContent = 'Các lựa chọn trắc nghiệm (Phần I)';
      secOpts.appendChild(oTitle);

      const optsList = doc.createElement('div');
      optsList.className = 'cunata-options-preview';

      for (let i = 0; i < entry.question.options.length; i++) {
        const opt = entry.question.options[i];
        if (!opt) continue;
        const isCorrect = opt.optionId === entry.question.correctOptionId;
        const optItem = doc.createElement('div');
        optItem.className = isCorrect ? 'cunata-option-item correct' : 'cunata-option-item';

        const labelSpan = doc.createElement('strong');
        labelSpan.textContent = opt.label || ['A', 'B', 'C', 'D'][i] || `${i + 1}`;
        optItem.appendChild(labelSpan);

        const textSpan = doc.createElement('span');
        textSpan.textContent = opt.text;
        optItem.appendChild(textSpan);

        if (isCorrect) {
          const badge = doc.createElement('span');
          badge.className = 'cunata-badge cunata-badge-diff-nb';
          badge.style.marginLeft = 'auto';
          badge.textContent = '✓ Đáp án đúng';
          optItem.appendChild(badge);
        }

        optsList.appendChild(optItem);
      }
      secOpts.appendChild(optsList);
      mBody.appendChild(secOpts);
    } else if (entry.question.kind === 'II') {
      const secStmts = doc.createElement('div');
      secStmts.className = 'cunata-preview-section';
      const sTitle = doc.createElement('div');
      sTitle.className = 'cunata-preview-section-title';
      sTitle.textContent = 'Bốn ý Đúng/Sai (Phần II)';
      secStmts.appendChild(sTitle);

      const stmtsList = doc.createElement('div');
      stmtsList.className = 'cunata-statements-preview';

      for (let i = 0; i < entry.question.statements.length; i++) {
        const st = entry.question.statements[i];
        if (!st) continue;
        const stItem = doc.createElement('div');
        stItem.className = 'cunata-statement-item';

        const row = doc.createElement('div');
        row.className = 'cunata-statement-row';

        const labelText = doc.createElement('span');
        labelText.textContent = `${st.label || ['a', 'b', 'c', 'd'][i] || `${i + 1}`}) ${st.text}`;
        row.appendChild(labelText);

        const ansBadge = doc.createElement('span');
        ansBadge.className = st.answer ? 'cunata-statement-ans-badge true' : 'cunata-statement-ans-badge false';
        ansBadge.textContent = st.answer ? 'ĐÚNG' : 'SAI';
        row.appendChild(ansBadge);

        stItem.appendChild(row);

        if (st.explanation) {
          const expl = doc.createElement('div');
          expl.className = 'cunata-statement-expl';
          expl.textContent = `Giải thích: ${st.explanation}`;
          stItem.appendChild(expl);
        }

        stmtsList.appendChild(stItem);
      }
      secStmts.appendChild(stmtsList);
      mBody.appendChild(secStmts);
    } else if (entry.question.kind === 'III') {
      const secShort = doc.createElement('div');
      secShort.className = 'cunata-preview-section';
      const kTitle = doc.createElement('div');
      kTitle.className = 'cunata-preview-section-title';
      kTitle.textContent = 'Đáp án ngắn chuẩn (Phần III)';
      secShort.appendChild(kTitle);

      const keyVal = doc.createElement('div');
      keyVal.className = 'cunata-short-answer-preview';
      keyVal.textContent = `Đáp án: "${entry.question.answerKey}" (Chính xác từng ký tự, <= 4 ký tự)`;
      secShort.appendChild(keyVal);
      mBody.appendChild(secShort);
    }

    // Explanation
    if (entry.question.explanation) {
      const secExpl = doc.createElement('div');
      secExpl.className = 'cunata-preview-section';
      const exTitle = doc.createElement('div');
      exTitle.className = 'cunata-preview-section-title';
      exTitle.textContent = 'Lời giải chi tiết';
      secExpl.appendChild(exTitle);

      const exText = doc.createElement('div');
      exText.textContent = entry.question.explanation;
      secExpl.appendChild(exText);
      mBody.appendChild(secExpl);
    }

    dialog.appendChild(mBody);

    // Footer
    const mFooter = doc.createElement('div');
    mFooter.className = 'cunata-modal-footer';

    const reuseBtn = doc.createElement('button');
    reuseBtn.type = 'button';
    reuseBtn.className = 'cunata-btn cunata-btn-primary';
    reuseBtn.textContent = '➕ Thêm vào đề thi';
    attachEvent(reuseBtn, 'click', () => {
      handleAddToDraft(entry);
      closeModal();
    });
    mFooter.appendChild(reuseBtn);

    const closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'cunata-btn';
    closeBtn.textContent = 'Đóng';
    attachEvent(closeBtn, 'click', closeModal);
    mFooter.appendChild(closeBtn);

    dialog.appendChild(mFooter);
    backdrop.appendChild(dialog);
    modalContainer.appendChild(backdrop);
  }

  // Confirmation Delete Dialog
  function openConfirmDeleteModal(entry: BankEntry) {
    modalContainer.textContent = '';

    const backdrop = doc.createElement('div');
    backdrop.className = 'cunata-modal-backdrop';
    backdrop.setAttribute('role', 'alertdialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'cunata-delete-title');

    const dialog = doc.createElement('div');
    dialog.className = 'cunata-modal-dialog';
    dialog.style.maxWidth = '480px';

    const mHeader = doc.createElement('div');
    mHeader.className = 'cunata-modal-header';

    const mTitle = doc.createElement('h2');
    mTitle.id = 'cunata-delete-title';
    mTitle.textContent = '⚠️ Xác nhận xóa câu hỏi';
    mHeader.appendChild(mTitle);
    dialog.appendChild(mHeader);

    const mBody = doc.createElement('div');
    mBody.className = 'cunata-modal-body';

    const msg = doc.createElement('p');
    msg.textContent = `Bạn có chắc chắn muốn xóa câu hỏi "${entry.question.title || entry.questionId}" (ID: ${entry.questionVersionId}) khỏi ngân hàng cục bộ?`;
    mBody.appendChild(msg);

    const note = doc.createElement('p');
    note.style.fontSize = '0.8125rem';
    note.style.color = '#b91c1c';
    note.textContent = 'Hành động này không thể hoàn tác. Các lượt thi cũ hoặc đề đã xuất bản sẽ không bị ảnh hưởng.';
    mBody.appendChild(note);

    dialog.appendChild(mBody);

    const mFooter = doc.createElement('div');
    mFooter.className = 'cunata-modal-footer';

    const cancelBtn = doc.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'cunata-btn';
    cancelBtn.textContent = 'Hủy bỏ';
    attachEvent(cancelBtn, 'click', closeModal);
    mFooter.appendChild(cancelBtn);

    const confirmBtn = doc.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'cunata-btn cunata-btn-danger';
    confirmBtn.textContent = 'Xác nhận xóa';
    attachEvent(confirmBtn, 'click', async () => {
      closeModal();
      if (typeof actions.deleteEntry === 'function') {
        actions.deleteEntry({
          questionVersionId: entry.questionVersionId,
          revision: entry.revision,
          confirmed: true,
        });
      } else if (vm.storage) {
        const delRes = await deleteBankEntryConfirmed(entry.questionVersionId, entry.revision, vm.storage, {
          confirmed: true,
        });
        if (delRes.ok) {
          const idx = allEntries.findIndex((e) => e.questionVersionId === entry.questionVersionId);
          if (idx >= 0) allEntries.splice(idx, 1);
          renderList();
          showStatus(`Đã xóa câu hỏi ${entry.questionVersionId} khỏi ngân hàng.`, 'success');
        } else {
          showStatus(`Lỗi khi xóa: ${delRes.error.message}`, 'error');
        }
      } else {
        const idx = allEntries.findIndex((e) => e.questionVersionId === entry.questionVersionId);
        if (idx >= 0) allEntries.splice(idx, 1);
        renderList();
        showStatus(`Đã xóa câu hỏi ${entry.questionVersionId}.`, 'success');
      }
    });
    mFooter.appendChild(confirmBtn);

    dialog.appendChild(mFooter);
    backdrop.appendChild(dialog);
    modalContainer.appendChild(backdrop);
  }

  // Handle Add To Draft Reuse Callback
  function handleAddToDraft(entry: BankEntry) {
    if (typeof actions.addToDraft === 'function') {
      actions.addToDraft(entry);
    } else if (vm.draft && (typeof actions.onDraftChange === 'function' || typeof actions.onDraftUpdated === 'function')) {
      const idGen = () => `id-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const res = addToDraft(vm.draft, entry, idGen);
      if (res.ok) {
        if (typeof actions.onDraftChange === 'function') {
          actions.onDraftChange(res.value);
        }
        if (typeof actions.onDraftUpdated === 'function') {
          actions.onDraftUpdated(res.value);
        }
        if (typeof actions.onAddFromBank === 'function') {
          actions.onAddFromBank(entry);
        }
        showStatus(`Đã thêm câu hỏi "${entry.question.title || entry.questionId}" vào đề nháp!`, 'success');
      } else {
        showStatus(`Không thể thêm vào đề: ${res.error.message}`, 'error');
      }
    } else if (typeof actions.onAddFromBank === 'function') {
      actions.onAddFromBank(entry);
    } else if (typeof actions.onSelectEntry === 'function') {
      actions.onSelectEntry(entry);
    } else if (typeof actions.onReuse === 'function') {
      actions.onReuse(entry);
    } else {
      showStatus(`Đã chọn câu hỏi "${entry.question.title || entry.questionId}" để sử dụng.`, 'info');
    }
  }

  // Render question card
  function renderCard(entry: BankEntry): HTMLElement {
    const card = doc.createElement('article');
    card.className = 'cunata-bank-card';
    card.setAttribute('aria-label', `Câu hỏi: ${entry.question.title || entry.questionId}`);

    // Card Header & Badges
    const cardHeader = doc.createElement('div');
    cardHeader.className = 'cunata-bank-card-header';

    const badgesRow = doc.createElement('div');
    badgesRow.className = 'cunata-badges-row';

    const bSubject = doc.createElement('span');
    bSubject.className = 'cunata-badge cunata-badge-subject';
    bSubject.textContent = entry.taxonomy.subject;
    badgesRow.appendChild(bSubject);

    const bGrade = doc.createElement('span');
    bGrade.className = 'cunata-badge cunata-badge-grade';
    bGrade.textContent = `Lớp ${entry.taxonomy.grade}`;
    badgesRow.appendChild(bGrade);

    const bTopic = doc.createElement('span');
    bTopic.className = 'cunata-badge cunata-badge-grade';
    bTopic.textContent = entry.taxonomy.topic;
    badgesRow.appendChild(bTopic);

    const bDiff = doc.createElement('span');
    const diffClass =
      entry.taxonomy.difficulty === 'Nhận biết'
        ? 'cunata-badge-diff-nb'
        : entry.taxonomy.difficulty === 'Thông hiểu'
          ? 'cunata-badge-diff-th'
          : 'cunata-badge-diff-vd';
    bDiff.className = `cunata-badge ${diffClass}`;
    bDiff.textContent = entry.taxonomy.difficulty;
    badgesRow.appendChild(bDiff);

    const bKind = doc.createElement('span');
    bKind.className = 'cunata-badge cunata-badge-kind';
    bKind.textContent = `Phần ${entry.question.kind}`;
    badgesRow.appendChild(bKind);

    cardHeader.appendChild(badgesRow);
    card.appendChild(cardHeader);

    // Title
    const titleEl = doc.createElement('h3');
    titleEl.className = 'cunata-bank-card-title';
    titleEl.textContent = entry.question.title || `Câu hỏi ${entry.questionId}`;
    card.appendChild(titleEl);

    // Content summary
    const contentEl = doc.createElement('div');
    contentEl.className = 'cunata-bank-card-content';
    let summaryText = entry.question.content || '';
    if (!summaryText && entry.question.blocks) {
      summaryText = extractTextFromBlocks(entry.question.blocks);
    }
    contentEl.textContent = summaryText || '(Chưa có nội dung xem trước)';
    card.appendChild(contentEl);

    // Footer & Actions
    const cardFooter = doc.createElement('div');
    cardFooter.className = 'cunata-bank-card-footer';

    const metaInfo = doc.createElement('div');
    metaInfo.className = 'cunata-card-meta';
    metaInfo.textContent = `ID: ${entry.questionVersionId} • Rev: ${entry.revision}`;
    cardFooter.appendChild(metaInfo);

    const cardActions = doc.createElement('div');
    cardActions.className = 'cunata-card-actions';

    // Preview Button
    const previewBtn = doc.createElement('button');
    previewBtn.type = 'button';
    previewBtn.className = 'cunata-btn cunata-btn-sm cunata-preview-btn';
    previewBtn.textContent = '👁️ Xem chi tiết';
    previewBtn.setAttribute('aria-label', `Xem chi tiết câu hỏi ${entry.questionId}`);
    attachEvent(previewBtn, 'click', () => openPreviewModal(entry));
    cardActions.appendChild(previewBtn);

    // Add to Draft (Reuse) Button
    const addDraftBtn = doc.createElement('button');
    addDraftBtn.type = 'button';
    addDraftBtn.className = 'cunata-btn cunata-btn-sm cunata-btn-primary cunata-reuse-btn';
    addDraftBtn.textContent = '➕ Thêm vào đề';
    addDraftBtn.setAttribute('aria-label', `Thêm câu hỏi ${entry.questionId} vào đề thi`);
    attachEvent(addDraftBtn, 'click', () => handleAddToDraft(entry));
    cardActions.appendChild(addDraftBtn);

    // Delete Button
    const deleteBtn = doc.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'cunata-btn cunata-btn-sm cunata-delete-btn';
    deleteBtn.style.color = '#dc2626';
    deleteBtn.textContent = '🗑️ Xóa';
    deleteBtn.setAttribute('aria-label', `Xóa câu hỏi ${entry.questionId}`);
    attachEvent(deleteBtn, 'click', () => openConfirmDeleteModal(entry));
    cardActions.appendChild(deleteBtn);

    cardFooter.appendChild(cardActions);
    card.appendChild(cardFooter);

    return card;
  }

  // Render question list
  function renderList() {
    listContainer.textContent = '';
    const filtered = queryBank(allEntries, currentFilter);

    countDisplay.textContent = `Hiển thị ${filtered.length} / ${allEntries.length} câu hỏi`;

    if (filtered.length === 0) {
      const emptyDiv = doc.createElement('div');
      emptyDiv.className = 'cunata-bank-empty';
      const emptyH = doc.createElement('h3');
      emptyH.textContent = 'Không tìm thấy câu hỏi phù hợp';
      emptyDiv.appendChild(emptyH);
      const emptyP = doc.createElement('p');
      emptyP.textContent = 'Vui lòng thay đổi từ khóa tìm kiếm hoặc đặt lại các tầng bộ lọc.';
      emptyDiv.appendChild(emptyP);

      const rBtn = doc.createElement('button');
      rBtn.type = 'button';
      rBtn.className = 'cunata-btn cunata-btn-sm cunata-reset-filter-btn';
      rBtn.textContent = 'Đặt lại bộ lọc';
      attachEvent(rBtn, 'click', () => {
        currentFilter = {};
        searchInput.value = '';
        subjectSelect.value = 'all';
        gradeSelect.value = 'all';
        topicInput.value = '';
        lessonInput.value = '';
        diffSelect.value = 'all';
        kindSelect.value = 'all';
        renderList();
      });
      emptyDiv.appendChild(rBtn);

      listContainer.appendChild(emptyDiv);
      return;
    }

    for (const entry of filtered) {
      listContainer.appendChild(renderCard(entry));
    }
  }

  // Initial render
  renderList();

  if (currentPreviewEntry) {
    openPreviewModal(currentPreviewEntry);
  }

  // 8. Return cleanup function
  return () => {
    for (const task of cleanupTasks) {
      try {
        task();
      } catch {
        // ignore errors during cleanup
      }
    }
    root.textContent = '';
  };
}
