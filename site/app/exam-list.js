/**
 * Cunata Web M2-M6 — Public Exam Selection & Manifest Loader
 * Conforms to WEB-contract.md §15, §16, §17 and Shared Product Contract v2.0.
 */
import { parseExam } from '../schema/index.js';
import { createAppsScriptClient } from '../collect/appsScript.js';
export function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
export async function fetchAndMergeExams(appsScriptUrl, client) {
    let staticExams = [];
    let teacherExams = [];
    let mainError;
    let teacherError;
    try {
        const res = await fetch('public/exams/index.json', { cache: 'no-store' });
        if (res.ok) {
            const manifest = await res.json();
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
                    source: 'static',
                }));
            }
        }
        else {
            mainError = `HTTP ${res.status}: Không thể tải danh sách đề thi`;
        }
    }
    catch (err) {
        mainError = err?.message || String(err);
    }
    const asClient = client || (appsScriptUrl && appsScriptUrl.trim() ? createAppsScriptClient(appsScriptUrl) : null);
    if (asClient && asClient.configured) {
        try {
            const res = await asClient.listExams();
            if (res.ok && Array.isArray(res.value)) {
                teacherExams = res.value.map((e) => ({
                    id: String(e.id || ''),
                    title: String(e.title || ''),
                    subject: String(e.subject || ''),
                    grade: Number(e.grade) || 12,
                    durationMinutes: Number(e.durationMinutes) || 50,
                    questionCount: Number(e.questionCount) || 0,
                    group: String(e.group || 'Đề giáo viên xuất bản'),
                    source: 'teacher',
                    owner: e.owner ? String(e.owner) : undefined,
                }));
            }
            else {
                teacherError = 'chưa tải được đề của giáo viên';
            }
        }
        catch (_) {
            teacherError = 'chưa tải được đề của giáo viên';
        }
    }
    // Merge: if duplicate id, teacher published exam WINS!
    const teacherMap = new Map();
    for (const te of teacherExams) {
        if (te.id)
            teacherMap.set(te.id, te);
    }
    const merged = [];
    const handledIds = new Set();
    for (const se of staticExams) {
        if (teacherMap.has(se.id)) {
            merged.push(teacherMap.get(se.id));
            handledIds.add(se.id);
        }
        else {
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
export async function fetchExamData(entry, appsScriptUrl, client) {
    const asClient = client || (appsScriptUrl && appsScriptUrl.trim() ? createAppsScriptClient(appsScriptUrl) : null);
    if (entry.source === 'teacher' && asClient) {
        const res = await asClient.getExam(entry.id);
        if (!res.ok) {
            throw new Error(res.message || 'Không tìm thấy đề thi trên máy chủ');
        }
        const v = parseExam(res.value);
        if (!v.ok) {
            throw new Error('Dữ liệu đề thi không hợp lệ: ' + v.issues.map((i) => `${i.code}: ${i.message}`).join('; '));
        }
        return v.value;
    }
    else if (entry.url) {
        const res = await fetch(entry.url);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}: Không thể tải file đề thi`);
        const data = await res.json();
        const v = parseExam(data);
        if (!v.ok) {
            throw new Error('Dữ liệu đề thi không hợp lệ: ' + v.issues.map((i) => `${i.code}: ${i.message}`).join('; '));
        }
        return v.value;
    }
    throw new Error('Đề thi không có nguồn hợp lệ');
}
export function renderExamItemsHtml(exams, selectedId) {
    const groups = new Map();
    for (const e of exams) {
        const g = e.group || 'Đề thi';
        if (!groups.has(g))
            groups.set(g, []);
        groups.get(g).push(e);
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
export function initExamList(root, options) {
    const doc = root.ownerDocument || document;
    // 1. Ensure #btnOpenExamList exists in DOM
    let btnOpen = root.querySelector('#btnOpenExamList');
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
    let modal = root.querySelector('#examListModal');
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
    const container = modal.querySelector('#examListContainer');
    const btnClose = modal.querySelector('#btnCloseExamList');
    const btnCancel = modal.querySelector('#btnCancelExamList');
    let lastFocus = null;
    const closeModal = () => {
        if (modal)
            modal.style.display = 'none';
        if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus();
        }
    };
    const loadExamFromEntry = async (entry) => {
        if (options.hasUnsavedProgress?.()) {
            if (typeof confirm === 'function') {
                const ok = confirm('Bạn có bài làm dở. Chuyển sang đề mới sẽ bỏ bài dở này. Tiếp tục?');
                if (!ok)
                    return;
            }
        }
        try {
            const examData = await fetchExamData(entry, options.appsScriptUrl, options.client);
            options.onSelectExam(examData);
            closeModal();
        }
        catch (err) {
            if (container) {
                container.innerHTML = `<div style="color: var(--danger); padding: 1rem; text-align: center;">Lỗi tải đề thi: ${escapeHtml(err?.message || String(err))}</div>`;
            }
            else if (typeof alert === 'function') {
                alert('Lỗi tải đề thi: ' + (err?.message || String(err)));
            }
        }
    };
    const openModal = async () => {
        lastFocus = doc.activeElement;
        if (modal)
            modal.style.display = 'flex';
        if (container) {
            container.innerHTML = '<div style="text-align: center; color: var(--gray-500); padding: 1rem;">Đang tải danh sách đề thi...</div>';
        }
        try {
            const { exams, error, teacherError } = await fetchAndMergeExams(options.appsScriptUrl, options.client);
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
                noticeHtml = `<div style="padding: 0.5rem; margin-bottom: 0.5rem; background: var(--c-surface-2); color: var(--c-warning); border-radius: 4px; font-size: 0.8125rem;">Lưu ý: ${escapeHtml(teacherError)}</div>`;
            }
            if (container) {
                container.innerHTML = noticeHtml + renderExamItemsHtml(exams);
                const items = container.querySelectorAll('.exam-list-item');
                items.forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const id = btn.getAttribute('data-exam-id');
                        const entry = exams.find((e) => e.id === id);
                        if (entry)
                            loadExamFromEntry(entry);
                    });
                });
                const first = container.querySelector('.exam-list-item');
                if (first && typeof first.focus === 'function')
                    first.focus();
            }
        }
        catch (err) {
            if (container) {
                container.innerHTML = `<div style="color: var(--danger); padding: 1rem; text-align: center;">Lỗi tải danh sách đề thi: ${escapeHtml(err?.message || String(err))}</div>`;
            }
        }
    };
    if (btnOpen)
        btnOpen.addEventListener('click', openModal);
    if (btnClose)
        btnClose.addEventListener('click', closeModal);
    if (btnCancel)
        btnCancel.addEventListener('click', closeModal);
    const onKeyDown = (e) => {
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
        if (btnOpen)
            btnOpen.removeEventListener('click', openModal);
        if (btnClose)
            btnClose.removeEventListener('click', closeModal);
        if (btnCancel)
            btnCancel.removeEventListener('click', closeModal);
        if (typeof doc.removeEventListener === 'function') {
            doc.removeEventListener('keydown', onKeyDown);
        }
    };
}
export function initStartScreen(root, options) {
    const startScreen = root.querySelector('#startScreen');
    const startNameInput = root.querySelector('#startName');
    const startExamListContainer = root.querySelector('#startExamListContainer');
    const btnStartExam = root.querySelector('#btnStartExam');
    const btnTeacher = root.querySelector('#btnTeacher');
    let loadedExams = [];
    let selectedEntry = null;
    if (startNameInput && typeof localStorage !== 'undefined') {
        try {
            const saved = localStorage.getItem('cunata:candidate_name') || localStorage.getItem('cunata:last_candidate_name');
            if (saved && !startNameInput.value) {
                startNameInput.value = saved;
            }
        }
        catch (_) { }
    }
    const updateBtnStartExam = () => {
        if (!btnStartExam)
            return;
        const hasName = !!(startNameInput && startNameInput.value.trim().length > 0);
        const hasSelected = !!selectedEntry;
        btnStartExam.disabled = !(hasName && hasSelected);
    };
    const loadAndRenderList = async () => {
        if (!startExamListContainer)
            return;
        startExamListContainer.innerHTML = '<div style="text-align: center; color: var(--gray-500); padding: 1rem;">Đang tải danh sách đề thi...</div>';
        try {
            const { exams, error, teacherError } = await fetchAndMergeExams(options.appsScriptUrl, options.client);
            loadedExams = exams;
            if (error && exams.length === 0) {
                startExamListContainer.innerHTML = `<div style="color: var(--danger); padding: 1rem; text-align: center;">Lỗi tải danh sách đề thi: ${escapeHtml(error)}</div>`;
                return;
            }
            if (exams.length === 0) {
                startExamListContainer.innerHTML = '<div style="text-align: center; color: var(--gray-500); padding: 1rem;">Hiện chưa có đề thi nào trong danh sách.</div>';
                return;
            }
            let noticeHtml = '';
            if (teacherError) {
                noticeHtml = `<div style="padding: 0.5rem; margin-bottom: 0.5rem; background: var(--c-surface-2); color: var(--c-warning); border-radius: 4px; font-size: 0.8125rem;">Lưu ý: ${escapeHtml(teacherError)}</div>`;
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
                    const targetBtn = startExamListContainer.querySelector(`.exam-list-item[data-exam-id="${targetId}"]`);
                    if (targetBtn) {
                        targetBtn.setAttribute('aria-pressed', 'true');
                        targetBtn.classList.add('selected');
                    }
                }
            }
            updateBtnStartExam();
        }
        catch (err) {
            if (startExamListContainer) {
                startExamListContainer.innerHTML = `<div style="color: var(--danger); padding: 1rem; text-align: center;">Lỗi tải danh sách đề thi: ${escapeHtml(err?.message || String(err))}</div>`;
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
        if (!selectedEntry || !startNameInput)
            return;
        const name = startNameInput.value.trim();
        if (!name)
            return;
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('cunata:candidate_name', name);
            }
            catch (_) { }
        }
        if (btnStartExam) {
            btnStartExam.disabled = true;
            btnStartExam.textContent = 'Đang nạp đề...';
        }
        try {
            const examData = await fetchExamData(selectedEntry, options.appsScriptUrl, options.client);
            if (startScreen)
                startScreen.style.display = 'none';
            options.onStartExam(examData, name);
        }
        catch (err) {
            alert('Lỗi nạp đề thi: ' + (err?.message || String(err)));
        }
        finally {
            if (btnStartExam) {
                btnStartExam.disabled = false;
                btnStartExam.textContent = 'Bắt đầu làm bài';
            }
        }
    };
    if (btnStartExam)
        btnStartExam.addEventListener('click', onStartClick);
    const onTeacherClick = () => {
        options.onOpenTeacher?.();
    };
    if (btnTeacher)
        btnTeacher.addEventListener('click', onTeacherClick);
    loadAndRenderList();
    return {
        refreshList: loadAndRenderList,
        selectExamId: (id) => {
            if (!startExamListContainer)
                return;
            const match = loadedExams.find((e) => e.id === id || e.url === id);
            if (match) {
                selectedEntry = match;
                const items = startExamListContainer.querySelectorAll('.exam-list-item');
                items.forEach((b) => {
                    if (b.getAttribute('data-exam-id') === id) {
                        b.setAttribute('aria-pressed', 'true');
                        b.classList.add('selected');
                    }
                    else {
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
            if (btnStartExam)
                btnStartExam.removeEventListener('click', onStartClick);
            if (btnTeacher)
                btnTeacher.removeEventListener('click', onTeacherClick);
        },
    };
}
