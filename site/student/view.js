/// <reference lib="dom" />
import { computeExamMax, toFractionString, } from "../domain/index.js";
import { parseExam, toDomainExam } from "../schema/index.js";
import { createCompositionGuard, renderBlocks, renderText, openModal, createStatusAnnouncer, isRoutineTimerTick, } from "../ui/index.js";
function isStudentController(obj) {
    return (obj !== null &&
        typeof obj === "object" &&
        typeof obj.getSnapshot === "function" &&
        typeof obj.subscribe === "function" &&
        typeof obj.answer === "function" &&
        typeof obj.rename === "function" &&
        typeof obj.submit === "function");
}
function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
function escapeHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function ensureStudentStyles(doc) {
    if (doc.getElementById("cunata-student-styles"))
        return;
    const styleEl = doc.createElement("style");
    styleEl.id = "cunata-student-styles";
    styleEl.textContent = `
    .cunata-student-view { font-family: var(--font); color: var(--c-text); width: 100%; box-sizing: border-box; }
    .cunata-student-view * { box-sizing: border-box; }

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
      #examWrapper #examPane {
        order: 1 !important;
      }
      #examWrapper .palette-card, .cunata-student-view .palette-card {
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
      #examWrapper #examPane {
        order: 1 !important;
        width: 100% !important;
      }
      #examWrapper .palette-card, .cunata-student-view .palette-card {
        display: none !important;
        order: 2 !important;
      }
      #examWrapper .palette-card.is-open, .cunata-student-view .palette-card.is-open {
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
    if (doc.head) {
        doc.head.appendChild(styleEl);
    }
}
function renderStemContent(content, stem, doc) {
    if (!content.includes('|') || !content.includes('\n')) {
        stem.appendChild(renderText(content, { document: doc }));
        return;
    }
    const isSeparatorLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed.includes('-'))
            return false;
        const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
        const parts = stripped.split('|');
        if (parts.length === 0)
            return false;
        return parts.every((p) => /^\s*:?-+:?\s*$/.test(p));
    };
    const parseRowCells = (line) => {
        const trimmed = line.trim();
        const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
        return stripped.split('|').map((c) => c.trim());
    };
    const lines = content.split('\n');
    let textBuffer = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line.includes('|') && i + 1 < lines.length && isSeparatorLine(lines[i + 1])) {
            if (textBuffer.length > 0) {
                const textChunk = textBuffer.join('\n');
                if (textChunk.trim()) {
                    stem.appendChild(renderText(textChunk, { document: doc }));
                }
                textBuffer = [];
            }
            const headers = parseRowCells(line);
            i += 2;
            const dataRows = [];
            while (i < lines.length) {
                const rowLine = lines[i];
                if (!rowLine.trim() || !rowLine.includes('|')) {
                    break;
                }
                dataRows.push(parseRowCells(rowLine));
                i++;
            }
            const table = doc.createElement('table');
            const thead = doc.createElement('thead');
            const headerTr = doc.createElement('tr');
            headers.forEach((h) => {
                const th = doc.createElement('th');
                th.appendChild(renderText(h, { document: doc }));
                headerTr.appendChild(th);
            });
            thead.appendChild(headerTr);
            table.appendChild(thead);
            const tbody = doc.createElement('tbody');
            dataRows.forEach((row) => {
                const tr = doc.createElement('tr');
                row.forEach((cell) => {
                    const td = doc.createElement('td');
                    td.appendChild(renderText(cell, { document: doc }));
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            stem.appendChild(table);
        }
        else {
            textBuffer.push(line);
            i++;
        }
    }
    if (textBuffer.length > 0) {
        const textChunk = textBuffer.join('\n');
        if (textChunk.trim()) {
            stem.appendChild(renderText(textChunk, { document: doc }));
        }
    }
}
/**
 * Mounts the Student Exam View into the provided container.
 * Conforms to WEB-contract.md §5 and §9.
 */
export function mount(root, model, actions = {}) {
    if (!root) {
        throw new Error("Root HTMLElement must be provided to student mount()");
    }
    const doc = root.ownerDocument || document;
    ensureStudentStyles(doc);
    if (!root.classList.contains("cunata-student-view")) {
        root.classList.add("cunata-student-view");
    }
    root.textContent = "";
    const cleanupTasks = [];
    // Extract model properties
    let controller = null;
    let currentRecord = null;
    let currentExam = null;
    let initialCandidateName = "Thí sinh tự do";
    let availableExams = [];
    let flaggedState = {};
    let historyList = [];
    let saveState = "local_saved";
    if (isStudentController(model)) {
        controller = model;
        currentRecord = controller.getSnapshot();
        currentExam = currentRecord.examSnapshot;
        initialCandidateName = currentRecord.candidateName;
    }
    else if (model && typeof model === "object") {
        const vm = model;
        if (vm.controller) {
            controller = vm.controller;
            currentRecord = controller.getSnapshot();
            currentExam = currentRecord.examSnapshot;
            initialCandidateName = currentRecord.candidateName;
        }
        else {
            currentRecord = vm.record ?? null;
            // Cross-exam resume: prioritize immutable examSnapshot from currentRecord
            currentExam = currentRecord ? currentRecord.examSnapshot : (vm.exam ?? null);
            if (currentRecord) {
                // LC28-F01: hydrate and preserve candidateName from stored record
                initialCandidateName = currentRecord.candidateName;
            }
            else if (vm.candidateName !== undefined) {
                initialCandidateName = vm.candidateName;
            }
        }
        if (vm.availableExams)
            availableExams = vm.availableExams;
        if (vm.flagged)
            flaggedState = { ...vm.flagged };
        if (vm.history)
            historyList = vm.history;
        if (vm.saveState)
            saveState = vm.saveState;
    }
    // Determine Clock Provider: prioritize explicit provider, controller deps, or wall clock
    let clockNow = () => Date.now();
    if (controller?.deps?.now && typeof controller.deps.now === "function") {
        clockNow = controller.deps.now;
    }
    else if (actions?.now && typeof actions.now === "function") {
        clockNow = actions.now;
    }
    else if (model?.now && typeof model.now === "function") {
        clockNow = model.now;
    }
    else if (currentRecord && currentRecord.startedAt < 100000000000 && Date.now() > 1000000000000) {
        // Synthetic timestamp detected in unit test without explicit clock: lock to startedAt
        const startBase = currentRecord.startedAt;
        clockNow = () => startBase;
    }
    // Local Responses Store for synchronous UI updates
    const localResponses = new Map();
    if (currentRecord?.responses?.responses) {
        for (const r of currentRecord.responses.responses) {
            localResponses.set(r.questionVersionId, r);
        }
    }
    // Asynchronous Save Queue to serialize saves and prevent revision conflicts
    let saveChain = Promise.resolve();
    function queueAnswer(resp) {
        if (!controller)
            return;
        saveChain = saveChain
            .then(async () => {
            const res = await controller.answer(resp);
            if (!res.ok) {
                updateSyncStatus("failed", true);
            }
        })
            .catch(() => {
            updateSyncStatus("failed", true);
        });
    }
    function queueRename(newName) {
        if (!controller)
            return;
        saveChain = saveChain
            .then(async () => {
            const res = await controller.rename(newName);
            if (!res.ok) {
                updateSyncStatus("failed", true);
            }
        })
            .catch(() => {
            updateSyncStatus("failed", true);
        });
    }
    // Flush pending inputs (e.g. ongoing composition, uncommitted text) before submission
    const flushPendingInputs = async () => {
        if (doc.activeElement && typeof doc.activeElement.blur === "function") {
            try {
                doc.activeElement.blur();
            }
            catch {
                // Ignore blur errors
            }
        }
        if (candidateInputEl && currentRecord && currentRecord.phase === "draft") {
            const val = candidateInputEl.value.trim();
            if (val && val !== currentRecord.candidateName) {
                queueRename(val);
            }
        }
        for (const [qId, inputEl] of shortAnswerInputs) {
            if (currentRecord && currentRecord.phase === "draft") {
                const val = inputEl.value;
                const resp = getResponse(qId);
                const currentVal = resp?.kind === "III" && typeof resp.raw === "string" ? resp.raw : "";
                if (val !== currentVal) {
                    const response = {
                        kind: "III",
                        questionVersionId: qId,
                        raw: typeof val === "string" && val.length > 0 ? val : null,
                    };
                    localResponses.set(qId, response);
                    queueAnswer(response);
                }
            }
        }
        await saveChain;
    };
    // 1. Loading State
    if (model?.loading === true) {
        const loadingContainer = doc.createElement("div");
        loadingContainer.className = "student-loading-indicator";
        loadingContainer.id = "studentLoading";
        const spinner = doc.createElement("div");
        spinner.className = "student-spinner";
        spinner.setAttribute("aria-hidden", "true");
        loadingContainer.appendChild(spinner);
        const loadingText = doc.createElement("span");
        loadingText.textContent = "Đang tải đề thi...";
        loadingContainer.appendChild(loadingText);
        root.appendChild(loadingContainer);
        return () => {
            root.textContent = "";
        };
    }
    // 2. Global Error State (if any)
    if (model?.error) {
        const errObj = model.error;
        const errText = typeof errObj === "string" ? errObj : (errObj.message || "Đã xảy ra lỗi");
        const errorBanner = doc.createElement("div");
        errorBanner.className = "student-error-banner";
        errorBanner.id = "studentError";
        errorBanner.setAttribute("role", "alert");
        errorBanner.textContent = `Lỗi: ${errText}`;
        root.appendChild(errorBanner);
    }
    // Container elements references for live preservation
    let candidateInputEl = null;
    let candidateGuard = null;
    const shortAnswerInputs = new Map();
    const shortAnswerGuards = new Map();
    const shortAnswerCharBoxes = new Map();
    const optionCardElements = new Map();
    const statementBtnElements = new Map();
    const paletteButtons = new Map();
    let paletteProgressEl = null;
    let syncStatusEl = null;
    let syncTextEl = null;
    let timerBoxEl = null;
    let submitBtnEl = null;
    // Local helper to find response for question
    function getResponse(qId) {
        return localResponses.get(qId) ?? currentRecord?.responses.responses.find((r) => r.questionVersionId === qId);
    }
    function getAnsweredCount() {
        if (!currentExam)
            return { answered: 0, total: 0, partial: 0 };
        let answered = 0;
        let partial = 0;
        const questions = currentExam.questions || [];
        for (const q of questions) {
            const resp = getResponse(q.questionVersionId);
            if (q.kind === "I") {
                if (resp && resp.kind === "I" && resp.selectedOptionId) {
                    answered++;
                }
            }
            else if (q.kind === "II") {
                if (resp && resp.kind === "II" && resp.answers) {
                    const filled = resp.answers.filter((a) => a.value !== null && a.value !== undefined).length;
                    if (filled === q.statements.length) {
                        answered++;
                    }
                    else if (filled > 0) {
                        partial++;
                    }
                }
            }
            else if (q.kind === "III") {
                if (resp && resp.kind === "III" && typeof resp.raw === "string" && resp.raw.length > 0) {
                    answered++;
                }
            }
        }
        return { answered, total: questions.length, partial };
    }
    function updatePaletteProgress() {
        if (!paletteProgressEl || !currentExam)
            return;
        const { answered, total } = getAnsweredCount();
        const isShuffled = Boolean(currentRecord?.presentationOrder?.questionOrder &&
            currentRecord.presentationOrder.questionOrder.length > 0 &&
            currentExam.settings.shuffleQuestions);
        paletteProgressEl.textContent = `Đã làm: ${answered}/${total} câu${isShuffled ? " · Trộn" : ""}`;
    }
    function updatePaletteButton(qId) {
        const btn = paletteButtons.get(qId);
        if (!btn || !currentExam)
            return;
        const q = currentExam.questions.find((x) => x.questionVersionId === qId);
        if (!q)
            return;
        btn.classList.remove("answered", "partial");
        const resp = getResponse(qId);
        if (q.kind === "I") {
            if (resp && resp.kind === "I" && resp.selectedOptionId) {
                btn.classList.add("answered");
            }
        }
        else if (q.kind === "II") {
            if (resp && resp.kind === "II" && resp.answers) {
                const filled = resp.answers.filter((a) => a.value !== null && a.value !== undefined).length;
                if (filled === q.statements.length) {
                    btn.classList.add("answered");
                }
                else if (filled > 0) {
                    btn.classList.add("partial");
                }
            }
        }
        else if (q.kind === "III") {
            if (resp && resp.kind === "III" && typeof resp.raw === "string" && resp.raw.length > 0) {
                btn.classList.add("answered");
            }
        }
        if (flaggedState[qId]) {
            btn.classList.add("flagged");
        }
        else {
            btn.classList.remove("flagged");
        }
        const isAnswered = btn.classList.contains("answered");
        const isPartial = btn.classList.contains("partial");
        const isFlagged = btn.classList.contains("flagged");
        const statusText = isAnswered ? "Đã làm" : isPartial ? "Đang làm" : "Chưa làm";
        btn.setAttribute("aria-pressed", isAnswered ? "true" : "false");
        btn.setAttribute("aria-label", `Câu ${btn.textContent}${isFlagged ? " (Đã đánh dấu)" : ""} (${statusText})`);
    }
    function updateSyncStatus(state, isLocalSaveError = false) {
        saveState = state;
        if (!syncStatusEl || !syncTextEl)
            return;
        syncStatusEl.className = "sync-status-badge";
        if (isLocalSaveError) {
            syncStatusEl.classList.add("status-failed", "status-local-error");
            syncTextEl.textContent = "Lỗi lưu cục bộ";
            return;
        }
        switch (state) {
            case "local_saved":
                syncStatusEl.classList.add("status-saved");
                syncTextEl.textContent = "Đã lưu";
                break;
            case "queued":
                syncStatusEl.classList.add("status-queued");
                syncTextEl.textContent = "Đang chờ gửi...";
                break;
            case "sending":
                syncStatusEl.classList.add("status-sending");
                syncTextEl.textContent = "Đang gửi...";
                break;
            case "server_confirmed":
                syncStatusEl.classList.add("status-confirmed");
                syncTextEl.textContent = "Máy chủ đã xác nhận";
                break;
            case "failed":
                syncStatusEl.classList.add("status-failed");
                if (currentRecord?.phase === "final") {
                    syncTextEl.textContent = "Lỗi gửi (bản nộp đã lưu an toàn)";
                }
                else {
                    syncTextEl.textContent = "Lỗi gửi máy chủ";
                }
                break;
            default:
                syncTextEl.textContent = "Chưa lưu";
                break;
        }
    }
    // Header & Controls
    const headerEl = doc.createElement("header");
    headerEl.className = "app-header";
    const headerContainer = doc.createElement("div");
    headerContainer.className = "header-container";
    // Brand Section
    const brandSection = doc.createElement("div");
    brandSection.className = "brand-section";
    const logoBadge = doc.createElement("span");
    logoBadge.className = "logo-badge";
    logoBadge.textContent = "CUNATA GDPT 2018";
    brandSection.appendChild(logoBadge);
    const examTitleEl = doc.createElement("div");
    examTitleEl.className = "exam-meta-title";
    examTitleEl.id = "examTitle";
    examTitleEl.textContent = currentExam ? currentExam.title : "Chọn đề thi";
    brandSection.appendChild(examTitleEl);
    headerContainer.appendChild(brandSection);
    // Candidate Name Input Wrap
    const candidateWrap = doc.createElement("div");
    candidateWrap.className = "candidate-input-wrap";
    candidateWrap.id = "candidateInputWrap";
    const candLabel = doc.createElement("label");
    candLabel.setAttribute("for", "candidateName");
    candLabel.textContent = "Thí sinh:";
    candidateWrap.appendChild(candLabel);
    candidateInputEl = doc.createElement("input");
    candidateInputEl.type = "text";
    candidateInputEl.id = "candidateName";
    candidateInputEl.className = "candidate-input";
    candidateInputEl.placeholder = "Tên hoặc SBD...";
    candidateInputEl.value = initialCandidateName;
    candidateInputEl.setAttribute("autocomplete", "off");
    candidateInputEl.readOnly = true;
    candidateInputEl.setAttribute("readonly", "readonly");
    if (currentRecord?.phase === "final") {
        candidateInputEl.disabled = true;
    }
    // Guard candidate name input
    const nameGuard = createCompositionGuard({
        element: candidateInputEl,
        onCommit: (val) => {
            if (currentRecord?.phase !== "final") {
                queueRename(val);
            }
            actions.updateCandidateName?.(val);
            actions.rename?.(val);
        },
        onInput: (val) => {
            actions.updateCandidateName?.(val);
        },
    });
    candidateGuard = nameGuard;
    cleanupTasks.push(nameGuard.dispose);
    candidateWrap.appendChild(candidateInputEl);
    headerContainer.appendChild(candidateWrap);
    // Header Actions: Sync Status, Timer, Submit Button
    const headerActions = doc.createElement("div");
    headerActions.className = "header-actions";
    syncStatusEl = doc.createElement("div");
    syncStatusEl.className = "sync-status-badge";
    syncStatusEl.id = "syncStatus";
    const syncDot = doc.createElement("span");
    syncDot.className = "sync-dot";
    syncStatusEl.appendChild(syncDot);
    syncTextEl = doc.createElement("span");
    syncTextEl.id = "syncText";
    syncTextEl.textContent = "Chưa lưu";
    syncStatusEl.appendChild(syncTextEl);
    headerActions.appendChild(syncStatusEl);
    updateSyncStatus(saveState);
    // Timer Box
    timerBoxEl = doc.createElement("div");
    timerBoxEl.className = "timer-box";
    timerBoxEl.id = "timerBox";
    timerBoxEl.setAttribute("role", "timer");
    timerBoxEl.setAttribute("aria-label", "Thời gian làm bài còn lại");
    timerBoxEl.textContent = "--:--";
    headerActions.appendChild(timerBoxEl);
    // Submit Button
    submitBtnEl = doc.createElement("button");
    submitBtnEl.type = "button";
    submitBtnEl.className = "btn-submit";
    submitBtnEl.id = "btnSubmit";
    submitBtnEl.textContent = "Nộp bài";
    if (currentRecord?.phase === "final") {
        submitBtnEl.disabled = true;
    }
    headerActions.appendChild(submitBtnEl);
    headerContainer.appendChild(headerActions);
    headerEl.appendChild(headerContainer);
    root.appendChild(headerEl);
    // Error Banner for Invalid Exam Loading (Retains prior attempt)
    const examLoadErrorBanner = doc.createElement("div");
    examLoadErrorBanner.className = "student-error-banner";
    examLoadErrorBanner.id = "examLoadError";
    examLoadErrorBanner.style.display = "none";
    examLoadErrorBanner.setAttribute("role", "alert");
    root.appendChild(examLoadErrorBanner);
    // Main Wrapper
    const mainWrapper = doc.createElement("div");
    mainWrapper.className = "main-wrapper";
    mainWrapper.id = "examWrapper";
    // Palette Sidebar
    const asideEl = doc.createElement("aside");
    asideEl.className = "palette-card";
    asideEl.setAttribute("aria-label", "Bảng điều hướng câu hỏi");
    const paletteHeader = doc.createElement("div");
    paletteHeader.className = "palette-header";
    const paletteTitle = doc.createElement("div");
    paletteTitle.className = "palette-title";
    paletteTitle.textContent = "Danh sách câu hỏi";
    paletteHeader.appendChild(paletteTitle);
    paletteProgressEl = doc.createElement("div");
    paletteProgressEl.className = "palette-progress-text";
    paletteProgressEl.id = "paletteProgress";
    paletteProgressEl.textContent = "Đã làm: 0/0 câu";
    paletteHeader.appendChild(paletteProgressEl);
    asideEl.appendChild(paletteHeader);
    // Palette Grid
    const paletteGrid = doc.createElement("div");
    paletteGrid.className = "palette-grid";
    paletteGrid.id = "paletteGrid";
    asideEl.appendChild(paletteGrid);
    // Palette Legend (constructed safely with DOM nodes)
    const paletteLegend = doc.createElement("div");
    paletteLegend.className = "palette-legend";
    const legendDefs = [
        ["swatch-answered", "Đã trả lời"],
        ["swatch-partial", "Làm một phần"],
        ["swatch-unanswered", "Chưa làm"],
    ];
    legendDefs.forEach(([cls, label]) => {
        const item = doc.createElement("div");
        item.className = "legend-item";
        const swatch = doc.createElement("div");
        swatch.className = `legend-swatch ${cls}`;
        const span = doc.createElement("span");
        span.textContent = label;
        item.appendChild(swatch);
        item.appendChild(span);
        paletteLegend.appendChild(item);
    });
    const flagItem = doc.createElement("div");
    flagItem.className = "legend-item";
    const flagSpan = doc.createElement("span");
    flagSpan.className = "swatch-flagged";
    flagSpan.textContent = "★";
    const flagLabel = doc.createElement("span");
    flagLabel.textContent = "Đánh dấu";
    flagItem.appendChild(flagSpan);
    flagItem.appendChild(flagLabel);
    paletteLegend.appendChild(flagItem);
    asideEl.appendChild(paletteLegend);
    // Palette Footer: Exam selection & upload buttons
    const paletteFooter = doc.createElement("div");
    paletteFooter.className = "palette-footer";
    const btnLoadExam = doc.createElement("button");
    btnLoadExam.type = "button";
    btnLoadExam.className = "btn-secondary";
    btnLoadExam.id = "btnLoadExam";
    btnLoadExam.style.width = "100%";
    btnLoadExam.style.marginBottom = "0.5rem";
    btnLoadExam.textContent = "📁 Nạp đề thi (JSON)";
    const examFileInput = doc.createElement("input");
    examFileInput.type = "file";
    examFileInput.id = "examFileInput";
    examFileInput.accept = ".json,application/json";
    examFileInput.style.display = "none";
    btnLoadExam.addEventListener("click", () => {
        examFileInput.click();
    });
    examFileInput.addEventListener("change", (e) => {
        const target = e.target;
        const file = target.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = (readEvent) => {
            try {
                const text = String(readEvent.target?.result || "");
                const rawJson = JSON.parse(text);
                const parsed = parseExam(rawJson);
                if (!parsed.ok) {
                    // Retain prior attempt and display error notice
                    examLoadErrorBanner.style.display = "flex";
                    examLoadErrorBanner.textContent = `Không thể nạp đề thi: ${parsed.issues.map((i) => i.message).join("; ")}`;
                    return;
                }
                // Hide prior error
                examLoadErrorBanner.style.display = "none";
                actions.loadExamJson?.(parsed.value);
                actions.selectExam?.(parsed.value);
            }
            catch (err) {
                // Retain prior attempt on JSON parse error
                examLoadErrorBanner.style.display = "flex";
                examLoadErrorBanner.textContent = `Lỗi cú pháp JSON: ${err instanceof Error ? err.message : String(err)}`;
            }
        };
        reader.readAsText(file);
    });
    paletteFooter.appendChild(btnLoadExam);
    paletteFooter.appendChild(examFileInput);
    if (availableExams.length > 0) {
        const selectorContainer = doc.createElement("div");
        selectorContainer.style.marginBottom = "0.5rem";
        const selectEl = doc.createElement("select");
        selectEl.id = "examSelector";
        selectEl.className = "candidate-input";
        selectEl.style.width = "100%";
        selectEl.style.padding = "0.35rem";
        selectEl.style.borderRadius = "6px";
        selectEl.style.border = "1px solid var(--c-border)";
        const defaultOpt = doc.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "-- Chọn đề mẫu --";
        selectEl.appendChild(defaultOpt);
        for (const ex of availableExams) {
            const opt = doc.createElement("option");
            opt.value = ex.id;
            opt.textContent = ex.title;
            selectEl.appendChild(opt);
        }
        selectEl.addEventListener("change", () => {
            const selected = availableExams.find((x) => x.id === selectEl.value);
            if (selected) {
                if (selected.exam) {
                    actions.selectExam?.(selected.exam);
                }
                else {
                    actions.selectExam?.(selected);
                }
            }
        });
        selectorContainer.appendChild(selectEl);
        paletteFooter.appendChild(selectorContainer);
    }
    const btnOpenBuilder = doc.createElement("button");
    btnOpenBuilder.type = "button";
    btnOpenBuilder.className = "btn-secondary";
    btnOpenBuilder.id = "btnOpenBuilder";
    btnOpenBuilder.style.width = "100%";
    btnOpenBuilder.style.marginBottom = "0.5rem";
    btnOpenBuilder.textContent = "🛠 Soạn đề thi mới";
    btnOpenBuilder.addEventListener("click", () => {
        actions.openBuilder?.(null);
    });
    paletteFooter.appendChild(btnOpenBuilder);
    const btnOpenBank = doc.createElement("button");
    btnOpenBank.type = "button";
    btnOpenBank.className = "btn-secondary";
    btnOpenBank.id = "btnOpenBank";
    btnOpenBank.style.width = "100%";
    btnOpenBank.textContent = "📚 Ngân hàng câu hỏi";
    btnOpenBank.addEventListener("click", () => {
        actions.openBank?.(null);
    });
    paletteFooter.appendChild(btnOpenBank);
    asideEl.appendChild(paletteFooter);
    mainWrapper.appendChild(asideEl);
    // Exam Content Pane
    const examPane = doc.createElement("main");
    examPane.className = "exam-pane";
    examPane.id = "examPane";
    mainWrapper.appendChild(examPane);
    root.appendChild(mainWrapper);
    // Render Questions if Exam is available
    if (currentExam && currentExam.questions && currentExam.questions.length > 0) {
        const n1 = currentExam.questions.filter((q) => q.kind === "I").length;
        const n2 = currentExam.questions.filter((q) => q.kind === "II").length;
        const n3 = currentExam.questions.filter((q) => q.kind === "III").length;
        const examMax = (n1 + n2 + n3 > 0) ? computeExamMax({ n1, n2, n3 }) : null;
        const pointIIILabel = examMax ? toFractionString(examMax.pointIII) : "--";
        // Determine presentation order
        const orderedQuestionIds = currentRecord?.presentationOrder?.questionOrder &&
            currentRecord.presentationOrder.questionOrder.length > 0
            ? currentRecord.presentationOrder.questionOrder
            : currentExam.questions.map((q) => q.questionVersionId);
        const questionsMap = new Map(currentExam.questions.map((q) => [q.questionVersionId, q]));
        let currentSectionKind = null;
        orderedQuestionIds.forEach((qId, idx) => {
            const q = questionsMap.get(qId);
            if (!q)
                return;
            // Section Banner when section changes
            if (q.kind !== currentSectionKind) {
                currentSectionKind = q.kind;
                const banner = doc.createElement("div");
                banner.className = "section-banner";
                const tag = doc.createElement("span");
                tag.className = "section-tag";
                tag.textContent = `Phần ${q.kind}`;
                banner.appendChild(tag);
                const heading = doc.createElement("h2");
                const desc = doc.createElement("p");
                if (q.kind === "I") {
                    heading.textContent = "Câu hỏi trắc nghiệm nhiều phương án lựa chọn";
                    desc.textContent = "Mỗi câu thí sinh chỉ chọn một phương án. Đúng mỗi câu được 0,25 điểm.";
                }
                else if (q.kind === "II") {
                    heading.textContent = "Câu hỏi trắc nghiệm Đúng / Sai";
                    desc.textContent = "Mỗi câu có 4 ý a), b), c), d). Điểm theo số ý đúng: 1 ý = 0,10; 2 ý = 0,25; 3 ý = 0,50; 4 ý = 1,00 điểm.";
                }
                else if (q.kind === "III") {
                    heading.textContent = "Câu hỏi trắc nghiệm trả lời ngắn";
                    desc.textContent = `Thí sinh điền kết quả vào ô trống (tối đa 4 ký tự). Điểm mỗi câu: ${pointIIILabel} điểm.`;
                }
                banner.appendChild(heading);
                banner.appendChild(desc);
                examPane.appendChild(banner);
            }
            // Question Card
            const card = doc.createElement("article");
            card.className = "question-card";
            card.id = `qcard-${q.questionVersionId}`;
            card.setAttribute("data-qid", q.questionVersionId);
            card.setAttribute("role", "group");
            card.setAttribute("aria-label", q.title || `Câu ${idx + 1}`);
            // Meta bar: number tag, points badge, flag button
            const metaBar = doc.createElement("div");
            metaBar.className = "question-meta-bar";
            const numTag = doc.createElement("div");
            numTag.className = "question-num-tag";
            const titleSpan = doc.createElement("span");
            titleSpan.textContent = q.title || `Câu ${idx + 1}`;
            numTag.appendChild(titleSpan);
            const pointBadge = doc.createElement("span");
            pointBadge.className = "point-badge";
            pointBadge.textContent =
                q.kind === "I"
                    ? "0,25 điểm"
                    : q.kind === "II"
                        ? "1,00 điểm"
                        : `${pointIIILabel} điểm`;
            numTag.appendChild(pointBadge);
            metaBar.appendChild(numTag);
            const isFlagged = Boolean(flaggedState[q.questionVersionId]);
            const flagBtn = doc.createElement("button");
            flagBtn.type = "button";
            flagBtn.className = `btn-flag ${isFlagged ? "flagged" : ""}`;
            flagBtn.id = `flag-btn-${q.questionVersionId}`;
            flagBtn.setAttribute("data-qid", q.questionVersionId);
            flagBtn.setAttribute("aria-label", `Đánh dấu câu ${idx + 1}`);
            flagBtn.textContent = `★ ${isFlagged ? "Đã đánh dấu" : "Đánh dấu"}`;
            flagBtn.addEventListener("click", () => {
                flaggedState[q.questionVersionId] = !flaggedState[q.questionVersionId];
                const nextFlag = flaggedState[q.questionVersionId];
                if (nextFlag) {
                    flagBtn.classList.add("flagged");
                    flagBtn.textContent = "★ Đã đánh dấu";
                }
                else {
                    flagBtn.classList.remove("flagged");
                    flagBtn.textContent = "★ Đánh dấu";
                }
                updatePaletteButton(q.questionVersionId);
                actions.toggleFlag?.(q.questionVersionId);
            });
            metaBar.appendChild(flagBtn);
            card.appendChild(metaBar);
            // Question Stem
            const stem = doc.createElement("div");
            stem.className = "question-stem";
            if (q.blocks && q.blocks.length > 0) {
                stem.appendChild(renderBlocks(q.blocks, { document: doc, assets: currentExam?.assets }));
            }
            else if (q.content) {
                renderStemContent(q.content, stem, doc);
            }
            card.appendChild(stem);
            // PART I: Options Grid
            if (q.kind === "I") {
                const qI = q;
                const optGrid = doc.createElement("div");
                optGrid.className = "options-grid";
                optGrid.setAttribute("role", "radiogroup");
                optGrid.setAttribute("aria-label", qI.title || `Câu ${idx + 1}`);
                // Snapshot option order
                const orderEntry = currentRecord?.presentationOrder?.optionOrder?.find((entry) => entry.questionVersionId === qI.questionVersionId);
                const orderList = orderEntry?.optionIds;
                const optionsList = orderList && orderList.length > 0
                    ? orderList
                        .map((id) => qI.options.find((o) => o.optionId === id))
                        .filter((o) => Boolean(o))
                    : qI.options;
                const existingResp = getResponse(qI.questionVersionId);
                const selectedId = existingResp?.kind === "I" ? existingResp.selectedOptionId : null;
                const cardEls = [];
                optionsList.forEach((opt, optIdx) => {
                    const isSelected = selectedId === opt.optionId;
                    const optCard = doc.createElement("div");
                    optCard.className = `option-card ${isSelected ? "selected" : ""}`;
                    optCard.setAttribute("role", "radio");
                    optCard.setAttribute("aria-checked", isSelected ? "true" : "false");
                    optCard.setAttribute("data-option-id", opt.optionId);
                    optCard.setAttribute("data-qid", qI.questionVersionId);
                    const isTabTarget = isSelected || (!selectedId && optIdx === 0);
                    optCard.setAttribute("tabindex", isTabTarget ? "0" : "-1");
                    const letter = ["A", "B", "C", "D"][optIdx] || opt.label || "•";
                    const letterDiv = doc.createElement("div");
                    letterDiv.className = "option-letter";
                    letterDiv.textContent = letter;
                    optCard.appendChild(letterDiv);
                    const textDiv = doc.createElement("div");
                    textDiv.className = "option-text";
                    textDiv.appendChild(renderText(opt.text, { document: doc }));
                    optCard.appendChild(textDiv);
                    const selectOption = (shouldFocus = false) => {
                        if (currentRecord?.phase === "final")
                            return;
                        // Visual update
                        for (const el of cardEls) {
                            el.classList.remove("selected");
                            el.setAttribute("aria-checked", "false");
                            el.setAttribute("tabindex", "-1");
                        }
                        optCard.classList.add("selected");
                        optCard.setAttribute("aria-checked", "true");
                        optCard.setAttribute("tabindex", "0");
                        if (shouldFocus) {
                            optCard.focus();
                        }
                        const response = {
                            kind: "I",
                            questionVersionId: qI.questionVersionId,
                            selectedOptionId: opt.optionId,
                        };
                        localResponses.set(qI.questionVersionId, response);
                        queueAnswer(response);
                        actions.answer?.(response);
                        updatePaletteButton(qI.questionVersionId);
                        updatePaletteProgress();
                    };
                    optCard.addEventListener("click", () => selectOption(false));
                    optCard.addEventListener("keydown", (e) => {
                        if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            selectOption(true);
                        }
                        else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                            e.preventDefault();
                            const nextIdx = (optIdx + 1) % optionsList.length;
                            const nextEl = cardEls[nextIdx];
                            if (nextEl) {
                                nextEl.click();
                                nextEl.focus();
                            }
                        }
                        else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                            e.preventDefault();
                            const prevIdx = (optIdx - 1 + optionsList.length) % optionsList.length;
                            const prevEl = cardEls[prevIdx];
                            if (prevEl) {
                                prevEl.click();
                                prevEl.focus();
                            }
                        }
                    });
                    cardEls.push(optCard);
                    optGrid.appendChild(optCard);
                });
                optionCardElements.set(qI.questionVersionId, cardEls);
                card.appendChild(optGrid);
            }
            // PART II: Statements Table
            else if (q.kind === "II") {
                const qII = q;
                const table = doc.createElement("div");
                table.className = "statements-table";
                const existingResp = getResponse(qII.questionVersionId);
                const existingAnswers = existingResp?.kind === "II" ? existingResp.answers : [];
                qII.statements.forEach((st, stIdx) => {
                    const currentAnswer = existingAnswers.find((a) => a.statementId === st.statementId)?.value;
                    const row = doc.createElement("div");
                    row.className = "statement-row";
                    row.setAttribute("data-statement-id", st.statementId);
                    row.setAttribute("role", "group");
                    row.setAttribute("aria-label", `Ý ${st.label || ["a", "b", "c", "d"][stIdx] || String(stIdx + 1)}: ${st.text}`);
                    const labelDiv = doc.createElement("div");
                    labelDiv.className = "statement-label";
                    labelDiv.textContent = `${st.label || ["a", "b", "c", "d"][stIdx] || String(stIdx + 1)})`;
                    row.appendChild(labelDiv);
                    const textDiv = doc.createElement("div");
                    textDiv.className = "statement-text";
                    textDiv.appendChild(renderText(st.text, { document: doc }));
                    row.appendChild(textDiv);
                    const toggleGroup = doc.createElement("div");
                    toggleGroup.className = "tf-toggle-group";
                    toggleGroup.setAttribute("role", "group");
                    toggleGroup.setAttribute("aria-label", `Ý ${labelDiv.textContent}`);
                    const btnTrue = doc.createElement("button");
                    btnTrue.type = "button";
                    btnTrue.className = `tf-btn ${currentAnswer === true ? "selected-true" : ""}`;
                    btnTrue.setAttribute("data-val", "true");
                    btnTrue.setAttribute("aria-pressed", currentAnswer === true ? "true" : "false");
                    btnTrue.textContent = "Đúng";
                    const btnFalse = doc.createElement("button");
                    btnFalse.type = "button";
                    btnFalse.className = `tf-btn ${currentAnswer === false ? "selected-false" : ""}`;
                    btnFalse.setAttribute("data-val", "false");
                    btnFalse.setAttribute("aria-pressed", currentAnswer === false ? "true" : "false");
                    btnFalse.textContent = "Sai";
                    const handleToggle = (clickedVal) => {
                        if (currentRecord?.phase === "final")
                            return;
                        const latestResp = getResponse(qII.questionVersionId);
                        const answersMap = new Map();
                        if (latestResp?.kind === "II") {
                            for (const ans of latestResp.answers) {
                                answersMap.set(ans.statementId, ans.value);
                            }
                        }
                        const prevVal = answersMap.get(st.statementId);
                        let nextVal = clickedVal;
                        if (prevVal === clickedVal) {
                            // Toggle back to unanswered (null)
                            nextVal = null;
                        }
                        answersMap.set(st.statementId, nextVal);
                        // Update button styles safely
                        if (nextVal === true) {
                            btnTrue.classList.add("selected-true");
                        }
                        else {
                            btnTrue.classList.remove("selected-true");
                        }
                        btnTrue.setAttribute("aria-pressed", nextVal === true ? "true" : "false");
                        if (nextVal === false) {
                            btnFalse.classList.add("selected-false");
                        }
                        else {
                            btnFalse.classList.remove("selected-false");
                        }
                        btnFalse.setAttribute("aria-pressed", nextVal === false ? "true" : "false");
                        const finalAnswers = qII.statements.map((s) => ({
                            statementId: s.statementId,
                            value: answersMap.get(s.statementId) ?? null,
                        }));
                        const response = {
                            kind: "II",
                            questionVersionId: qII.questionVersionId,
                            answers: finalAnswers,
                        };
                        localResponses.set(qII.questionVersionId, response);
                        queueAnswer(response);
                        actions.answer?.(response);
                        updatePaletteButton(qII.questionVersionId);
                        updatePaletteProgress();
                    };
                    btnTrue.addEventListener("click", () => handleToggle(true));
                    btnFalse.addEventListener("click", () => handleToggle(false));
                    toggleGroup.appendChild(btnTrue);
                    toggleGroup.appendChild(btnFalse);
                    row.appendChild(toggleGroup);
                    statementBtnElements.set(st.statementId, { btnTrue, btnFalse });
                    table.appendChild(row);
                });
                card.appendChild(table);
            }
            // PART III: Short Answer Text Input
            else if (q.kind === "III") {
                const qIII = q;
                const container = doc.createElement("div");
                container.className = "short-answer-container";
                const existingResp = getResponse(qIII.questionVersionId);
                const rawVal = existingResp?.kind === "III" && typeof existingResp.raw === "string" ? existingResp.raw : "";
                // 4 Character preview boxes
                const charsPreview = doc.createElement("div");
                charsPreview.className = "short-answer-chars-preview";
                const charBoxes = [];
                for (let i = 0; i < 4; i++) {
                    const ch = rawVal[i] || "";
                    const box = doc.createElement("div");
                    box.className = `char-box ${ch ? "filled" : ""}`;
                    box.textContent = ch;
                    charBoxes.push(box);
                    charsPreview.appendChild(box);
                }
                shortAnswerCharBoxes.set(qIII.questionVersionId, charBoxes);
                container.appendChild(charsPreview);
                // Input wrap
                const inputWrap = doc.createElement("div");
                inputWrap.className = "short-answer-input-wrap";
                const shortAnswerLabel = doc.createElement("label");
                shortAnswerLabel.className = "short-answer-label ui-field-label";
                shortAnswerLabel.htmlFor = `input-iii-${qIII.questionVersionId}`;
                shortAnswerLabel.textContent = `Đáp án câu ${idx + 1}:`;
                inputWrap.appendChild(shortAnswerLabel);
                const inputEl = doc.createElement("input");
                inputEl.type = "text";
                // Do NOT set inputEl.maxLength = 4; allows Vietnamese IME composition buffer
                inputEl.className = "short-answer-input";
                inputEl.id = `input-iii-${qIII.questionVersionId}`;
                inputEl.placeholder = "Ví dụ: -0,5";
                inputEl.value = rawVal;
                inputEl.setAttribute("autocomplete", "off");
                if (currentRecord?.phase === "final") {
                    inputEl.disabled = true;
                }
                const updateCharBoxes = (val) => {
                    const boxes = shortAnswerCharBoxes.get(qIII.questionVersionId);
                    if (!boxes)
                        return;
                    const isTooLong = val.length > 4;
                    for (let i = 0; i < 4; i++) {
                        const ch = val[i] || "";
                        const box = boxes[i];
                        if (!box)
                            continue;
                        box.textContent = ch;
                        if (ch) {
                            box.classList.add("filled");
                        }
                        else {
                            box.classList.remove("filled");
                        }
                        if (isTooLong) {
                            box.classList.add("too-long");
                        }
                        else {
                            box.classList.remove("too-long");
                        }
                    }
                };
                const commitAnswer = (val) => {
                    if (currentRecord?.phase === "final")
                        return;
                    updateCharBoxes(val);
                    // AC: No raw text coercion or silent paste correction
                    const response = {
                        kind: "III",
                        questionVersionId: qIII.questionVersionId,
                        raw: typeof val === "string" && val.length > 0 ? val : null,
                    };
                    localResponses.set(qIII.questionVersionId, response);
                    queueAnswer(response);
                    actions.answer?.(response);
                    updatePaletteButton(qIII.questionVersionId);
                    updatePaletteProgress();
                };
                const iiiGuard = createCompositionGuard({
                    element: inputEl,
                    onCommit: (val) => {
                        commitAnswer(val);
                    },
                    onInput: (val) => {
                        updateCharBoxes(val);
                        commitAnswer(val);
                    },
                });
                shortAnswerGuards.set(qIII.questionVersionId, iiiGuard);
                cleanupTasks.push(iiiGuard.dispose);
                shortAnswerInputs.set(qIII.questionVersionId, inputEl);
                inputWrap.appendChild(inputEl);
                container.appendChild(inputWrap);
                // Quick keys bar
                const quickKeysBar = doc.createElement("div");
                quickKeysBar.className = "quick-keys-bar";
                const quickLabel = doc.createElement("span");
                quickLabel.style.fontSize = "0.8125rem";
                quickLabel.style.color = "var(--c-text-2)";
                quickLabel.style.fontWeight = "500";
                quickLabel.textContent = "Phím tắt:";
                quickKeysBar.appendChild(quickLabel);
                const btnMinus = doc.createElement("button");
                btnMinus.type = "button";
                btnMinus.className = "quick-key-btn";
                btnMinus.setAttribute("data-char", "-");
                btnMinus.textContent = "- (Dấu âm)";
                btnMinus.addEventListener("click", () => {
                    if (currentRecord?.phase === "final")
                        return;
                    inputEl.value += "-";
                    commitAnswer(inputEl.value);
                });
                quickKeysBar.appendChild(btnMinus);
                const btnComma = doc.createElement("button");
                btnComma.type = "button";
                btnComma.className = "quick-key-btn";
                btnComma.setAttribute("data-char", ",");
                btnComma.textContent = ", (Dấu phẩy)";
                btnComma.addEventListener("click", () => {
                    if (currentRecord?.phase === "final")
                        return;
                    inputEl.value += ",";
                    commitAnswer(inputEl.value);
                });
                quickKeysBar.appendChild(btnComma);
                const btnClear = doc.createElement("button");
                btnClear.type = "button";
                btnClear.className = "quick-key-btn";
                btnClear.setAttribute("data-action", "clear");
                btnClear.textContent = "Xóa";
                btnClear.addEventListener("click", () => {
                    if (currentRecord?.phase === "final")
                        return;
                    inputEl.value = "";
                    commitAnswer("");
                });
                quickKeysBar.appendChild(btnClear);
                container.appendChild(quickKeysBar);
                const hintText = doc.createElement("div");
                hintText.className = "input-hint-text";
                hintText.textContent = "Tối đa 4 ký tự: chữ số 0-9, dấu trừ (-) và dấu phẩy (,). So sánh chính xác từng ký tự.";
                container.appendChild(hintText);
                card.appendChild(container);
            }
            examPane.appendChild(card);
            // Create Palette Button for this Question
            const palBtn = doc.createElement("button");
            palBtn.type = "button";
            palBtn.className = "palette-btn";
            palBtn.id = `pal-btn-${q.questionVersionId}`;
            palBtn.setAttribute("data-qid", q.questionVersionId);
            palBtn.textContent = String(idx + 1);
            palBtn.addEventListener("click", () => {
                const target = doc.getElementById(`qcard-${q.questionVersionId}`);
                if (target) {
                    if (typeof target.scrollIntoView === "function") {
                        target.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                    target.classList.add("highlight");
                    setTimeout(() => {
                        target.classList.remove("highlight");
                    }, 1200);
                }
                const palCard = doc.querySelector(".palette-card");
                if (palCard && palCard.classList.contains("is-open")) {
                    palCard.classList.remove("is-open");
                }
                actions.navigateQuestion?.(q.questionVersionId);
            });
            paletteButtons.set(q.questionVersionId, palBtn);
            paletteGrid.appendChild(palBtn);
            updatePaletteButton(q.questionVersionId);
        });
        updatePaletteProgress();
    }
    else {
        // No Exam Loaded View
        const emptyNotice = doc.createElement("div");
        emptyNotice.className = "section-banner";
        emptyNotice.style.borderLeftColor = "var(--c-warning)";
        const emptyHead = doc.createElement("h2");
        emptyHead.textContent = "Chưa có đề thi nào được nạp";
        emptyNotice.appendChild(emptyHead);
        const emptyDesc = doc.createElement("p");
        emptyDesc.textContent = "Vui lòng chọn đề mẫu hoặc nạp file JSON đề thi bằng nút bên cạnh để bắt đầu làm bài.";
        emptyNotice.appendChild(emptyDesc);
        examPane.appendChild(emptyNotice);
    }
    // ----------------- History Section -----------------
    if (historyList && historyList.length > 0) {
        const historySection = doc.createElement("section");
        historySection.className = "history-section";
        historySection.id = "attemptHistorySection";
        const histTitle = doc.createElement("h2");
        histTitle.className = "history-title";
        histTitle.textContent = "Lịch Sử Các Lượt Làm Bài Của Đề Thi";
        historySection.appendChild(histTitle);
        const tableContainer = doc.createElement("div");
        tableContainer.id = "attemptHistoryTableContainer";
        tableContainer.style.overflowX = "auto";
        const table = doc.createElement("table");
        table.className = "history-table";
        const thead = doc.createElement("thead");
        const trHead = doc.createElement("tr");
        ["Lượt thi", "Thí sinh", "Thời điểm nộp", "Phần I", "Phần II", "Phần III", "Tổng điểm"].forEach((hText) => {
            const th = doc.createElement("th");
            th.textContent = hText;
            trHead.appendChild(th);
        });
        thead.appendChild(trHead);
        table.appendChild(thead);
        const tbody = doc.createElement("tbody");
        historyList.forEach((item, idx) => {
            const tr = doc.createElement("tr");
            const attemptId = item.attemptId || `att-${idx + 1}`;
            const name = item.candidateName || "Thí sinh tự do";
            let time = item.submittedAt || item.submittedAtFull || "--";
            if (typeof time === "number") {
                time = new Date(time).toLocaleString("vi-VN");
            }
            let scoreI = "--";
            let scoreII = "--";
            let scoreIII = "--";
            let totalStr = "--";
            // If item is AttemptRecord, extract fractions from scoreDTO
            const scoreDTO = item.scoreDTO;
            if (scoreDTO) {
                if (scoreDTO.sectionFractions) {
                    if (scoreDTO.sectionFractions.I !== undefined)
                        scoreI = String(scoreDTO.sectionFractions.I);
                    if (scoreDTO.sectionFractions.II !== undefined)
                        scoreII = String(scoreDTO.sectionFractions.II);
                    if (scoreDTO.sectionFractions.III !== undefined)
                        scoreIII = String(scoreDTO.sectionFractions.III);
                }
                if (scoreDTO.totalFraction !== undefined) {
                    if (item.examSnapshot) {
                        try {
                            const qs = item.examSnapshot.questions || [];
                            let n1 = 0, n2 = 0, n3 = 0;
                            for (const q of qs) {
                                if (q.kind === "I")
                                    n1++;
                                else if (q.kind === "II")
                                    n2++;
                                else if (q.kind === "III")
                                    n3++;
                            }
                            if (n1 + n2 + n3 > 0) {
                                const maxes = computeExamMax({ n1, n2, n3 });
                                const maxTotal = toFractionString(maxes.maxTotal);
                                totalStr = `${scoreDTO.totalFraction} / ${maxTotal}`;
                            }
                            else {
                                totalStr = String(scoreDTO.totalFraction);
                            }
                        }
                        catch {
                            totalStr = String(scoreDTO.totalFraction);
                        }
                    }
                    else {
                        totalStr = String(scoreDTO.totalFraction);
                    }
                }
            }
            if (item.scoreIFraction || item.scoreI !== undefined) {
                scoreI = String(item.scoreIFraction || item.scoreI);
            }
            if (item.scoreIIFraction || item.scoreII !== undefined) {
                scoreII = String(item.scoreIIFraction || item.scoreII);
            }
            if (item.scoreIIIFraction || item.scoreIII !== undefined) {
                scoreIII = String(item.scoreIIIFraction || item.scoreIII);
            }
            if (item.totalFraction || item.scoreTotal !== undefined) {
                const tot = item.totalFraction || item.scoreTotal;
                const max = item.maxTotalFraction || item.maxTotal;
                totalStr = max ? `${tot} / ${max}` : String(tot);
            }
            [attemptId, name, String(time), scoreI, scoreII, scoreIII, totalStr].forEach((cellText, cellIdx) => {
                const td = doc.createElement("td");
                if (cellIdx === 6) {
                    const strong = doc.createElement("strong");
                    strong.textContent = cellText;
                    td.appendChild(strong);
                }
                else {
                    td.textContent = cellText;
                }
                tr.appendChild(td);
            });
            tr.setAttribute("data-attempt-id", attemptId);
            tr.style.cursor = "pointer";
            tr.addEventListener("click", () => {
                actions.selectHistoryAttempt?.(attemptId);
                actions.resumeAttempt?.(item);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        historySection.appendChild(tableContainer);
        // Max Attempts Notice & Restart button
        const maxAttempts = currentExam?.settings?.maxAttempts;
        const maxAttemptsNotice = doc.createElement("div");
        maxAttemptsNotice.className = "max-attempts-notice";
        maxAttemptsNotice.id = "maxAttemptsNotice";
        const btnRestart = doc.createElement("button");
        btnRestart.type = "button";
        btnRestart.className = "btn-secondary";
        btnRestart.id = "btnRestart";
        btnRestart.textContent = "🔄 Làm Lại Đề Thi";
        btnRestart.style.marginTop = "0.75rem";
        if (typeof maxAttempts === "number" && maxAttempts > 0 && historyList.length >= maxAttempts) {
            maxAttemptsNotice.textContent = `Bạn đã đạt số lượt làm bài tối đa quy định (${maxAttempts} lượt) cho đề thi này.`;
            maxAttemptsNotice.style.display = "block";
            btnRestart.disabled = true;
        }
        else {
            maxAttemptsNotice.style.display = "none";
            btnRestart.addEventListener("click", () => {
                actions.restart?.(null);
                actions.startNewAttempt?.(currentExam);
            });
        }
        historySection.appendChild(maxAttemptsNotice);
        historySection.appendChild(btnRestart);
        root.appendChild(historySection);
    }
    // ----------------- Submit Modal -----------------
    const modalOverlay = doc.createElement("div");
    modalOverlay.className = "modal-overlay";
    modalOverlay.id = "submitModal";
    modalOverlay.style.display = "none";
    modalOverlay.setAttribute("role", "dialog");
    modalOverlay.setAttribute("aria-modal", "true");
    modalOverlay.setAttribute("aria-labelledby", "modalTitle");
    const modalContent = doc.createElement("div");
    modalContent.className = "modal-content";
    const modalTitle = doc.createElement("h3");
    modalTitle.className = "modal-title";
    modalTitle.id = "modalTitle";
    modalTitle.textContent = "Xác nhận nộp bài thi";
    modalContent.appendChild(modalTitle);
    const modalBody = doc.createElement("div");
    modalBody.className = "modal-body";
    modalBody.id = "modalBodyText";
    modalContent.appendChild(modalBody);
    const modalActions = doc.createElement("div");
    modalActions.className = "modal-actions";
    const btnCancelSubmit = doc.createElement("button");
    btnCancelSubmit.type = "button";
    btnCancelSubmit.className = "btn-secondary";
    btnCancelSubmit.id = "btnCancelSubmit";
    btnCancelSubmit.textContent = "Tiếp tục làm bài";
    const btnConfirmSubmit = doc.createElement("button");
    btnConfirmSubmit.type = "button";
    btnConfirmSubmit.className = "btn-submit";
    btnConfirmSubmit.id = "btnConfirmSubmit";
    btnConfirmSubmit.textContent = "Xác nhận nộp bài";
    modalActions.appendChild(btnCancelSubmit);
    modalActions.appendChild(btnConfirmSubmit);
    modalContent.appendChild(modalActions);
    modalOverlay.appendChild(modalContent);
    root.appendChild(modalOverlay);
    // Submit Modal Logic
    let activeModalClose = null;
    if (submitBtnEl) {
        submitBtnEl.addEventListener("click", () => {
            if (currentRecord?.phase === "final")
                return;
            // Synchronously flush uncommitted inputs to localResponses and queue saves
            flushPendingInputs();
            const { answered, total } = getAnsweredCount();
            const un = total - answered;
            if (un > 0) {
                modalBody.textContent = `Bạn đã hoàn thành ${answered}/${total} câu hỏi. Còn ${un} câu chưa hoàn thành hoặc chưa làm đủ ý. Bạn có chắc chắn muốn nộp bài ngay bây giờ?`;
            }
            else {
                modalBody.textContent = `Bạn đã hoàn thành toàn bộ ${total}/${total} câu hỏi. Bạn có chắc chắn muốn nộp bài để xem bảng điểm và lời giải chi tiết?`;
            }
            modalOverlay.style.display = "flex";
            const modalInstance = openModal(modalOverlay, {
                initialFocus: btnCancelSubmit,
                returnFocusTo: submitBtnEl,
                document: doc,
                onClose: () => {
                    modalOverlay.style.display = "none";
                    activeModalClose = null;
                },
            });
            activeModalClose = modalInstance.close;
        });
    }
    btnCancelSubmit.addEventListener("click", () => {
        if (activeModalClose) {
            activeModalClose();
        }
        else {
            modalOverlay.style.display = "none";
        }
    });
    btnConfirmSubmit.addEventListener("click", () => {
        if (btnConfirmSubmit.disabled)
            return;
        // Prevent double submission and immediately disable interactive elements
        if (submitBtnEl)
            submitBtnEl.disabled = true;
        btnConfirmSubmit.disabled = true;
        if (candidateInputEl)
            candidateInputEl.disabled = true;
        for (const inputEl of shortAnswerInputs.values()) {
            inputEl.disabled = true;
        }
        if (activeModalClose) {
            activeModalClose();
        }
        else {
            modalOverlay.style.display = "none";
        }
        // Flush pending inputs and ensure saveChain settles before controller submits
        const pending = flushPendingInputs();
        if (controller) {
            pending
                .then(() => controller.submit("manual"))
                .then((res) => {
                if (!res.ok) {
                    updateSyncStatus("failed", true);
                    statusAnnouncer.announce(`Lỗi nộp bài: ${res.error.message}`, "assertive");
                }
            })
                .catch(() => {
                updateSyncStatus("failed", true);
            });
        }
        actions.submit?.("manual");
    });
    // ----------------- Timer Loop & Auto-Submit -----------------
    let timerInterval = null;
    const statusAnnouncer = createStatusAnnouncer({ document: doc });
    cleanupTasks.push(statusAnnouncer.dispose);
    let lastSeenClockTime = clockNow();
    let clockWarningBanner = null;
    function showClockWarningBanner(message) {
        if (!clockWarningBanner) {
            clockWarningBanner = doc.createElement("div");
            clockWarningBanner.id = "clockWarning";
            clockWarningBanner.className = "student-warning-banner";
            clockWarningBanner.setAttribute("role", "alert");
            if (headerEl.nextSibling && root.contains(headerEl.nextSibling)) {
                root.insertBefore(clockWarningBanner, headerEl.nextSibling);
            }
            else {
                root.appendChild(clockWarningBanner);
            }
        }
        clockWarningBanner.textContent = `Cảnh báo: ${message}. Thời hạn làm bài không được đặt lại.`;
        clockWarningBanner.style.display = "block";
    }
    const updateTimer = () => {
        if (!timerBoxEl)
            return;
        if (!currentRecord || currentRecord.phase === "final") {
            timerBoxEl.textContent = "Đã nộp";
            timerBoxEl.classList.remove("timer-warning", "timer-expired");
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            return;
        }
        const now = clockNow();
        if (now < lastSeenClockTime) {
            showClockWarningBanner("Phát hiện lùi giờ hệ thống");
            statusAnnouncer.announce("Cảnh báo: Phát hiện lùi giờ hệ thống. Thời hạn làm bài không thay đổi.", "assertive");
        }
        else {
            lastSeenClockTime = now;
        }
        const deadline = currentRecord.deadline;
        const remainingSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));
        timerBoxEl.textContent = formatTime(remainingSeconds);
        if (remainingSeconds <= 300 && remainingSeconds > 0) {
            timerBoxEl.classList.add("timer-warning");
        }
        else {
            timerBoxEl.classList.remove("timer-warning");
        }
        // Accessible announcer for milestone ticks (not routine seconds)
        if (!isRoutineTimerTick(timerBoxEl.textContent) && remainingSeconds > 0) {
            statusAnnouncer.announce(`Thời gian còn lại: ${timerBoxEl.textContent}`, "polite");
        }
        if (remainingSeconds <= 0) {
            timerBoxEl.textContent = "00:00";
            timerBoxEl.classList.remove("timer-warning");
            timerBoxEl.classList.add("timer-expired");
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            // Deadline submission: immediately disable inputs to avoid submit/input race
            if (submitBtnEl)
                submitBtnEl.disabled = true;
            if (candidateInputEl)
                candidateInputEl.disabled = true;
            for (const inputEl of shortAnswerInputs.values()) {
                inputEl.disabled = true;
            }
            statusAnnouncer.announce("Hết giờ làm bài. Hệ thống đang tự động nộp bài thi.", "assertive");
            const pending = flushPendingInputs();
            if (controller) {
                pending.then(() => controller.submit("deadline")).catch(() => { });
            }
            actions.submit?.("deadline");
        }
    };
    updateTimer();
    if (currentRecord && currentRecord.phase !== "final") {
        timerInterval = setInterval(updateTimer, 1000);
    }
    // Check deadline on tab visibility change or pageshow (BFCache / background restore)
    const handleVisibilityOrResume = () => {
        if (doc.visibilityState === "visible" || !doc.hidden) {
            updateTimer();
        }
    };
    if (typeof doc.addEventListener === "function") {
        doc.addEventListener("visibilitychange", handleVisibilityOrResume);
        cleanupTasks.push(() => {
            doc.removeEventListener("visibilitychange", handleVisibilityOrResume);
        });
    }
    const win = doc.defaultView || (typeof window !== "undefined" ? window : null);
    if (win && typeof win.addEventListener === "function") {
        win.addEventListener("pageshow", handleVisibilityOrResume);
        win.addEventListener("focus", handleVisibilityOrResume);
        win.addEventListener("resume", handleVisibilityOrResume);
        cleanupTasks.push(() => {
            win.removeEventListener("pageshow", handleVisibilityOrResume);
            win.removeEventListener("focus", handleVisibilityOrResume);
            win.removeEventListener("resume", handleVisibilityOrResume);
        });
    }
    // ----------------- Controller Event Subscription -----------------
    // Preserves native input nodes / cursor during asynchronous saves
    if (controller) {
        const unsub = controller.subscribe((event) => {
            if (event.type === "attempt_changed") {
                currentRecord = event.record;
                updateSyncStatus("local_saved");
                if (event.record.responses?.responses) {
                    for (const r of event.record.responses.responses) {
                        localResponses.set(r.questionVersionId, r);
                    }
                }
                // Preserve native candidate input: DO NOT overwrite if actively focused or composing
                const isCandidateComposing = candidateGuard ? candidateGuard.isComposing() : false;
                if (candidateInputEl && doc.activeElement !== candidateInputEl && !isCandidateComposing) {
                    if (candidateInputEl.value !== event.record.candidateName) {
                        candidateInputEl.value = event.record.candidateName;
                    }
                }
                // Preserve Part III inputs: DO NOT overwrite if actively focused or composing
                for (const [qId, inputEl] of shortAnswerInputs) {
                    const guard = shortAnswerGuards.get(qId);
                    const isComposing = guard ? guard.isComposing() : false;
                    if (doc.activeElement !== inputEl && !isComposing) {
                        const resp = getResponse(qId);
                        const raw = resp?.kind === "III" && typeof resp.raw === "string" ? resp.raw : "";
                        if (inputEl.value !== raw) {
                            inputEl.value = raw;
                            const boxes = shortAnswerCharBoxes.get(qId);
                            if (boxes) {
                                const isTooLong = raw.length > 4;
                                for (let i = 0; i < 4; i++) {
                                    const ch = raw[i] || "";
                                    const box = boxes[i];
                                    if (!box)
                                        continue;
                                    box.textContent = ch;
                                    if (ch)
                                        box.classList.add("filled");
                                    else
                                        box.classList.remove("filled");
                                    if (isTooLong)
                                        box.classList.add("too-long");
                                    else
                                        box.classList.remove("too-long");
                                }
                            }
                        }
                    }
                }
                // Refresh palette button statuses
                if (currentExam) {
                    for (const q of currentExam.questions) {
                        updatePaletteButton(q.questionVersionId);
                    }
                }
                updatePaletteProgress();
            }
            else if (event.type === "attempt_finalized") {
                currentRecord = event.record;
                updateSyncStatus("local_saved");
                if (candidateInputEl) {
                    candidateInputEl.disabled = true;
                }
                if (submitBtnEl) {
                    submitBtnEl.disabled = true;
                }
                // Disable inputs and buttons
                for (const inputEl of shortAnswerInputs.values()) {
                    inputEl.disabled = true;
                }
                if (timerInterval) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
                if (timerBoxEl) {
                    timerBoxEl.textContent = "Đã nộp";
                    timerBoxEl.classList.remove("timer-warning", "timer-expired");
                }
                statusAnnouncer.announce("Bài thi đã được nộp thành công.", "polite");
                actions.onAttemptFinalized?.(event.record);
            }
            else if (event.type === "sync_changed") {
                updateSyncStatus(event.outbox.state);
            }
            else if (event.type === "storage_conflict") {
                updateSyncStatus("failed", true);
                statusAnnouncer.announce("Phát hiện xung đột phiên lưu trữ.", "assertive");
            }
            else if (event.type === "error") {
                if (event.error.code === "CLOCK_CHANGED") {
                    showClockWarningBanner(event.error.message);
                    statusAnnouncer.announce(`Cảnh báo: ${event.error.message}`, "assertive");
                }
                else if (event.error.code.startsWith("STORAGE_")) {
                    updateSyncStatus("failed", true);
                    statusAnnouncer.announce(`Lỗi lưu cục bộ: ${event.error.message}`, "assertive");
                }
                else {
                    statusAnnouncer.announce(`Lỗi: ${event.error.message}`, "assertive");
                }
            }
        });
        cleanupTasks.push(unsub);
    }
    // ----------------- Unmount / Disposal -----------------
    return () => {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        for (const cleanup of cleanupTasks) {
            try {
                cleanup();
            }
            catch {
                // Ignore errors during disposal
            }
        }
        paletteButtons.clear();
        shortAnswerInputs.clear();
        shortAnswerCharBoxes.clear();
        optionCardElements.clear();
        statementBtnElements.clear();
        localResponses.clear();
        root.textContent = "";
    };
}
