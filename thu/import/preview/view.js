/// <reference lib="dom" />
/**
 * Cunata Web M5: Import Preview, Correction and Explicit Confirmation View.
 * Conforms to WEB-contract.md §4, §5, §8-§9, §11-§12, and Shared Product Contract v2.0 §6.
 *
 * Implements accessible preview and correction interface:
 * - Preview of text / tables / images / math / source flags
 * - Inline and form-based correction of kind / options / key / explanation / taxonomy
 * - Missing key, unsupported OMML, and manual PDF review warnings kept until resolved
 * - Transfer of confirmed valid questions only into ExamDraft via callback, no direct bank writes
 * - Cancel, fail, and partial confirm workflows
 * - AC: No guessed answers or automatic publication
 */
import { checkShortAnswer, } from "../../domain/index.js";
import { renderBlocks, renderText, createCompositionGuard, } from "../../ui/index.js";
import { PREVIEW_FLAGS } from "./types.js";
import { editImport, confirmImport, cancelImport, confirmAllValidDrafts, getDraftWarnings, isDraftValid, isDraftMissingKey, } from "./core.js";
const PREVIEW_STYLE_ID = "cunata-import-preview-styles";
export function ensurePreviewStyles(doc) {
    if (doc.getElementById(PREVIEW_STYLE_ID))
        return;
    const styleEl = doc.createElement("style");
    styleEl.id = PREVIEW_STYLE_ID;
    styleEl.textContent = `
    .import-preview-root {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1f2937;
      background: #f9fafb;
      padding: 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
      line-height: 1.5;
    }
    .preview-header {
      background: #ffffff;
      padding: 1.25rem 1.5rem;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      margin-bottom: 1rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .preview-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .preview-title {
      font-size: 1.25rem;
      font-weight: 700;
      color: #111827;
      margin: 0;
    }
    .preview-stats-row {
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-top: 0.75rem;
    }
    .preview-stat-badge {
      font-size: 0.8125rem;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-weight: 500;
      background: #f3f4f6;
      color: #374151;
    }
    .stat-badge-confirmed { background: #d1fae5; color: #065f46; }
    .stat-badge-missing { background: #fee2e2; color: #991b1b; }
    .stat-badge-warning { background: #fef3c7; color: #92400e; }
    .stat-badge-total { background: #e0e7ff; color: #3730a3; }

    .preview-warning-banner {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      padding: 1rem;
      border-radius: 4px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      color: #92400e;
    }
    .warning-banner-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.25rem;
    }

    .preview-toolbar {
      background: #ffffff;
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      margin-bottom: 1rem;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
      justify-content: space-between;
    }
    .preview-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
    .preview-filter-select, .preview-search-input {
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #ffffff;
      color: #374151;
    }
    .preview-search-input {
      min-width: 200px;
    }
    .preview-btn {
      padding: 0.375rem 0.875rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 6px;
      border: 1px solid transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      transition: background-color 0.15s, border-color 0.15s;
    }
    .btn-secondary { background: #f3f4f6; color: #374151; border-color: #d1d5db; }
    .btn-secondary:hover { background: #e5e7eb; }
    .btn-primary { background: #2563eb; color: #ffffff; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-danger { background: #dc2626; color: #ffffff; }
    .btn-danger:hover { background: #b91c1c; }
    .btn-success { background: #16a34a; color: #ffffff; }
    .btn-success:hover { background: #15803d; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }

    .preview-draft-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .preview-draft-card {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.25rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      position: relative;
    }
    .draft-card-unconfirmed {
      border-left: 4px solid #9ca3af;
    }
    .draft-card-confirmed {
      border-left: 4px solid #16a34a;
    }
    .draft-card-missing-key {
      border-left: 4px solid #dc2626;
      background: #fffcfc;
    }

    .draft-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #f3f4f6;
    }
    .draft-header-left {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      flex-wrap: wrap;
    }
    .draft-checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .kind-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.125rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .kind-badge-I { background: #dbeafe; color: #1e40af; }
    .kind-badge-II { background: #fef3c7; color: #92400e; }
    .kind-badge-III { background: #e0e7ff; color: #4338ca; }

    .prov-text {
      font-size: 0.75rem;
      color: #6b7280;
    }
    .draft-warning-tags {
      display: flex;
      gap: 0.375rem;
      flex-wrap: wrap;
    }
    .draft-warning-tag {
      font-size: 0.6875rem;
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .tag-missing-key { background: #fee2e2; color: #991b1b; }
    .tag-omml { background: #ffedd5; color: #c2410c; }
    .tag-pdf { background: #fef9c3; color: #854d0e; }
    .tag-hostile { background: #7f1d1d; color: #ffffff; }

    .draft-content-area {
      margin-bottom: 1rem;
      font-size: 0.9375rem;
    }
    .draft-blocks-area {
      margin-top: 0.5rem;
      padding: 0.5rem;
      background: #f9fafb;
      border-radius: 4px;
      border: 1px dashed #e5e7eb;
    }

    .draft-options-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0.75rem 0;
    }
    .draft-option-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
      cursor: pointer;
    }
    .draft-option-correct {
      border-color: #16a34a;
      background: #f0fdf4;
      font-weight: 500;
    }
    .draft-option-radio {
      cursor: pointer;
    }

    .draft-statements-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 0.75rem 0;
    }
    .draft-stmt-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .draft-stmt-toggles {
      display: flex;
      gap: 0.25rem;
    }
    .stmt-toggle-btn {
      padding: 0.125rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      border-radius: 4px;
      border: 1px solid #d1d5db;
      background: #ffffff;
      cursor: pointer;
    }
    .stmt-toggle-btn.active-true {
      background: #16a34a;
      color: #ffffff;
      border-color: #16a34a;
    }
    .stmt-toggle-btn.active-false {
      background: #dc2626;
      color: #ffffff;
      border-color: #dc2626;
    }

    .draft-sa-box {
      margin: 0.75rem 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .draft-sa-input {
      font-family: monospace;
      font-size: 1rem;
      font-weight: bold;
      width: 100px;
      padding: 0.375rem 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      text-align: center;
    }

    .draft-explanation-area {
      font-size: 0.8125rem;
      color: #4b5563;
      background: #f3f4f6;
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      margin-top: 0.5rem;
    }

    .draft-edit-form {
      margin-top: 1rem;
      padding: 1rem;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
    }
    .form-grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .form-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #475569;
    }
    .form-input, .form-textarea, .form-select {
      font-size: 0.875rem;
      padding: 0.375rem 0.5rem;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #ffffff;
    }
    .form-textarea {
      min-height: 60px;
      resize: vertical;
    }

    .preview-action-footer {
      background: #ffffff;
      padding: 1.25rem 1.5rem;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      position: sticky;
      bottom: 1rem;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .footer-left {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: #4b5563;
    }
    .footer-right {
      display: flex;
      gap: 0.75rem;
    }
  `;
    doc.head.appendChild(styleEl);
}
/**
 * Normalizes view model from unknown input.
 */
function normalizeModel(model) {
    if (!model || typeof model !== "object") {
        return {
            job: {
                jobId: "empty-job",
                sourceId: "untitled",
                format: "docx",
                state: "preview",
                blocks: [],
                drafts: [],
                flags: [],
            },
            filterKind: "all",
            filterStatus: "all",
            searchTerm: "",
        };
    }
    const rec = model;
    if (Array.isArray(rec.drafts) && typeof rec.jobId === "string") {
        // Model is directly an ImportJob
        return {
            job: model,
            filterKind: "all",
            filterStatus: "all",
            searchTerm: "",
        };
    }
    // Model is ImportPreviewViewModel
    const job = rec.job ?? {
        jobId: "job-default",
        sourceId: "untitled",
        format: "docx",
        state: "preview",
        blocks: [],
        drafts: [],
        flags: [],
    };
    return {
        job,
        selectedDraftId: typeof rec.selectedDraftId === "string" ? rec.selectedDraftId : null,
        filterKind: rec.filterKind ?? "all",
        filterStatus: rec.filterStatus ?? "all",
        searchTerm: typeof rec.searchTerm === "string" ? rec.searchTerm : "",
        targetExamDraft: rec.targetExamDraft ?? null,
        statusMessage: typeof rec.statusMessage === "string" ? rec.statusMessage : null,
        errorMessage: typeof rec.errorMessage === "string" ? rec.errorMessage : null,
    };
}
/**
 * Mounts the Import Preview view into an HTMLElement root.
 * Conforms to the standard mount convention:
 * `export function mount(root: HTMLElement, model: unknown, actions: Readonly<Record<string,(value:unknown)=>void>>): () => void;`
 */
export function mount(root, model, actions = {}) {
    if (!root) {
        throw new Error("Root HTMLElement must be provided to mount()");
    }
    const doc = root.ownerDocument || (typeof document !== "undefined" ? document : null);
    if (!doc) {
        throw new Error("DOM Document is required for mount()");
    }
    ensurePreviewStyles(doc);
    // Normalized mutable state
    const vm = normalizeModel(model);
    let currentJob = vm.job;
    let targetExamDraft = vm.targetExamDraft ?? null;
    let filterKind = vm.filterKind ?? "all";
    let filterStatus = vm.filterStatus ?? "all";
    let searchTerm = vm.searchTerm ?? "";
    let editingDraftId = vm.selectedDraftId ?? null;
    let statusMessage = vm.statusMessage ?? null;
    let errorMessage = vm.errorMessage ?? null;
    const cleanupFns = [];
    function attachListener(el, event, handler) {
        el.addEventListener(event, handler);
        cleanupFns.push(() => {
            try {
                el.removeEventListener(event, handler);
            }
            catch {
                // ignore
            }
        });
    }
    function notifyJobChange(job) {
        currentJob = job;
        if (typeof actions.onJobChange === "function") {
            actions.onJobChange(job);
        }
        render();
    }
    function render() {
        // Clear root
        while (root.firstChild) {
            root.removeChild(root.firstChild);
        }
        const container = doc.createElement("div");
        container.className = "import-preview-root";
        container.setAttribute("role", "region");
        container.setAttribute("aria-label", "Import Preview and Correction");
        // 1. Header & Summary Stats
        const totalCount = currentJob.drafts.length;
        let confirmedCount = 0;
        let missingKeyCount = 0;
        let warningCount = 0;
        for (const d of currentJob.drafts) {
            if (d.confirmed)
                confirmedCount += 1;
            if (isDraftMissingKey(d))
                missingKeyCount += 1;
            const warnings = getDraftWarnings(d);
            if (warnings.length > 0)
                warningCount += 1;
        }
        const header = doc.createElement("header");
        header.className = "preview-header";
        const titleRow = doc.createElement("div");
        titleRow.className = "preview-title-row";
        const titleH2 = doc.createElement("h2");
        titleH2.className = "preview-title";
        titleH2.textContent = `Xem trước & Hiệu đính đề nhập: ${currentJob.sourceId} (${currentJob.format.toUpperCase()})`;
        titleRow.appendChild(titleH2);
        header.appendChild(titleRow);
        const statsRow = doc.createElement("div");
        statsRow.className = "preview-stats-row";
        const badgeTotal = doc.createElement("span");
        badgeTotal.className = "preview-stat-badge stat-badge-total";
        badgeTotal.textContent = `Tổng câu: ${totalCount}`;
        statsRow.appendChild(badgeTotal);
        const badgeConfirmed = doc.createElement("span");
        badgeConfirmed.className = "preview-stat-badge stat-badge-confirmed";
        badgeConfirmed.textContent = `Đã xác nhận: ${confirmedCount}/${totalCount}`;
        statsRow.appendChild(badgeConfirmed);
        if (missingKeyCount > 0) {
            const badgeMissing = doc.createElement("span");
            badgeMissing.className = "preview-stat-badge stat-badge-missing";
            badgeMissing.textContent = `Thiếu đáp án chuẩn: ${missingKeyCount}`;
            statsRow.appendChild(badgeMissing);
        }
        if (warningCount > 0) {
            const badgeWarn = doc.createElement("span");
            badgeWarn.className = "preview-stat-badge stat-badge-warning";
            badgeWarn.textContent = `Có cảnh báo: ${warningCount}`;
            statsRow.appendChild(badgeWarn);
        }
        header.appendChild(statsRow);
        container.appendChild(header);
        // 2. Global Warning / Alert Banners
        if (errorMessage) {
            const errBanner = doc.createElement("div");
            errBanner.className = "preview-warning-banner";
            errBanner.style.backgroundColor = "#fee2e2";
            errBanner.style.borderColor = "#dc2626";
            errBanner.style.color = "#991b1b";
            errBanner.setAttribute("role", "alert");
            errBanner.textContent = `Lỗi: ${errorMessage}`;
            container.appendChild(errBanner);
        }
        if (statusMessage) {
            const statusBanner = doc.createElement("div");
            statusBanner.className = "preview-warning-banner";
            statusBanner.style.backgroundColor = "#d1fae5";
            statusBanner.style.borderColor = "#16a34a";
            statusBanner.style.color = "#065f46";
            statusBanner.textContent = statusMessage;
            container.appendChild(statusBanner);
        }
        if (missingKeyCount > 0 || warningCount > 0) {
            const warnBanner = doc.createElement("div");
            warnBanner.className = "preview-warning-banner";
            warnBanner.setAttribute("role", "alert");
            const warnTitle = doc.createElement("strong");
            warnTitle.textContent = "Lưu ý kiểm tra trước khi xác nhận nhập:";
            warnBanner.appendChild(warnTitle);
            if (missingKeyCount > 0) {
                const item1 = doc.createElement("div");
                item1.className = "warning-banner-item";
                item1.textContent = `• Có ${missingKeyCount} câu hỏi chưa có đáp án chuẩn. Hệ thống KHÔNG tự đoán đáp án; vui lòng bổ sung đáp án trước khi nhập vào đề.`;
                warnBanner.appendChild(item1);
            }
            const hasOmml = currentJob.drafts.some((d) => d.provenance?.flags?.includes(PREVIEW_FLAGS.OMML_UNSUPPORTED));
            if (hasOmml) {
                const item2 = doc.createElement("div");
                item2.className = "warning-banner-item";
                item2.textContent = "• Một số công thức OMML chưa được chuyển đổi tự động hoàn toàn sang LaTeX và đã được lưu trữ mã nguồn gốc an toàn.";
                warnBanner.appendChild(item2);
            }
            const hasPdfManual = currentJob.drafts.some((d) => d.provenance?.flags?.includes(PREVIEW_FLAGS.PDF_MANUAL_REVIEW_REQUIRED));
            if (hasPdfManual) {
                const item3 = doc.createElement("div");
                item3.className = "warning-banner-item";
                item3.textContent = "• Tài liệu PDF cần người dùng rà soát nội dung thủ công để bảo đảm tính chuẩn xác của các cột và biểu thức.";
                warnBanner.appendChild(item3);
            }
            container.appendChild(warnBanner);
        }
        // 3. Toolbar: Filters & Batch Actions
        const toolbar = doc.createElement("div");
        toolbar.className = "preview-toolbar";
        const filtersDiv = doc.createElement("div");
        filtersDiv.className = "preview-filters";
        // Section filter
        const sectionSelect = doc.createElement("select");
        sectionSelect.className = "preview-filter-select";
        sectionSelect.setAttribute("aria-label", "Lọc theo phần");
        const sectionOpts = [
            { val: "all", label: "Tất cả các phần" },
            { val: "I", label: "Phần I (Trắc nghiệm 4 lựa chọn)" },
            { val: "II", label: "Phần II (Đúng / Sai 4 ý)" },
            { val: "III", label: "Phần III (Trả lời ngắn)" },
        ];
        for (const opt of sectionOpts) {
            const el = doc.createElement("option");
            el.value = opt.val;
            el.textContent = opt.label;
            if (opt.val === filterKind)
                el.selected = true;
            sectionSelect.appendChild(el);
        }
        attachListener(sectionSelect, "change", () => {
            filterKind = sectionSelect.value;
            render();
        });
        filtersDiv.appendChild(sectionSelect);
        // Status filter
        const statusSelect = doc.createElement("select");
        statusSelect.className = "preview-filter-select";
        statusSelect.setAttribute("aria-label", "Lọc theo trạng thái");
        const statusOpts = [
            { val: "all", label: "Mọi trạng thái" },
            { val: "confirmed", label: "Đã xác nhận" },
            { val: "unconfirmed", label: "Chưa xác nhận" },
            { val: "missing_key", label: "Thiếu đáp án chuẩn" },
            { val: "has_warnings", label: "Có cảnh báo" },
        ];
        for (const opt of statusOpts) {
            const el = doc.createElement("option");
            el.value = opt.val;
            el.textContent = opt.label;
            if (opt.val === filterStatus)
                el.selected = true;
            statusSelect.appendChild(el);
        }
        attachListener(statusSelect, "change", () => {
            filterStatus = statusSelect.value;
            render();
        });
        filtersDiv.appendChild(statusSelect);
        // Search input
        const searchInput = doc.createElement("input");
        searchInput.type = "text";
        searchInput.className = "preview-search-input";
        searchInput.placeholder = "Tìm kiếm nội dung...";
        searchInput.value = searchTerm;
        searchInput.setAttribute("aria-label", "Tìm kiếm câu hỏi");
        attachListener(searchInput, "input", () => {
            searchTerm = searchInput.value;
            render();
        });
        filtersDiv.appendChild(searchInput);
        toolbar.appendChild(filtersDiv);
        // Batch Action Buttons
        const batchActions = doc.createElement("div");
        batchActions.className = "preview-filters";
        const btnConfirmAllValid = doc.createElement("button");
        btnConfirmAllValid.type = "button";
        btnConfirmAllValid.className = "preview-btn btn-secondary";
        btnConfirmAllValid.textContent = "Xác nhận tất cả hợp lệ";
        attachListener(btnConfirmAllValid, "click", () => {
            const res = confirmAllValidDrafts(currentJob);
            if (res.ok) {
                statusMessage = "Đã xác nhận toàn bộ câu hỏi hợp lệ.";
                errorMessage = null;
                notifyJobChange(res.value);
            }
        });
        batchActions.appendChild(btnConfirmAllValid);
        const btnUnconfirmAll = doc.createElement("button");
        btnUnconfirmAll.type = "button";
        btnUnconfirmAll.className = "preview-btn btn-secondary";
        btnUnconfirmAll.textContent = "Bỏ xác nhận tất cả";
        attachListener(btnUnconfirmAll, "click", () => {
            const updatedDrafts = currentJob.drafts.map((d) => ({ ...d, confirmed: false }));
            const updatedJob = { ...currentJob, drafts: Object.freeze(updatedDrafts) };
            statusMessage = "Đã hủy xác nhận toàn bộ câu hỏi.";
            errorMessage = null;
            notifyJobChange(updatedJob);
        });
        batchActions.appendChild(btnUnconfirmAll);
        toolbar.appendChild(batchActions);
        container.appendChild(toolbar);
        // 4. Draft Questions List
        const draftList = doc.createElement("div");
        draftList.className = "preview-draft-list";
        const filteredDrafts = currentJob.drafts.filter((draft) => {
            const q = draft.question ?? {};
            // Filter kind
            if (filterKind !== "all" && q.kind !== filterKind)
                return false;
            // Filter status
            if (filterStatus === "confirmed" && !draft.confirmed)
                return false;
            if (filterStatus === "unconfirmed" && draft.confirmed)
                return false;
            if (filterStatus === "missing_key" && !isDraftMissingKey(draft))
                return false;
            if (filterStatus === "has_warnings" && getDraftWarnings(draft).length === 0)
                return false;
            // Search term
            if (searchTerm.trim() !== "") {
                const query = searchTerm.toLowerCase();
                const text = [
                    q.title ?? "",
                    q.content ?? "",
                    q.explanation ?? "",
                    q.subject ?? "",
                    q.topic ?? "",
                ].join(" ").toLowerCase();
                if (!text.includes(query))
                    return false;
            }
            return true;
        });
        if (filteredDrafts.length === 0) {
            const emptyDiv = doc.createElement("div");
            emptyDiv.style.textAlign = "center";
            emptyDiv.style.padding = "2rem";
            emptyDiv.style.color = "#6b7280";
            emptyDiv.textContent = "Không tìm thấy câu hỏi phù hợp với bộ lọc.";
            draftList.appendChild(emptyDiv);
        }
        filteredDrafts.forEach((draft, index) => {
            const q = draft.question ?? {};
            const kind = q.kind ?? "I";
            const warnings = getDraftWarnings(draft);
            const isMissingKey = isDraftMissingKey(draft);
            const card = doc.createElement("div");
            card.className = "preview-draft-card";
            card.setAttribute("data-draft-id", draft.draftId);
            if (card.dataset) {
                card.dataset.draftId = draft.draftId;
            }
            if (isMissingKey) {
                card.classList.add("draft-card-missing-key");
            }
            else if (draft.confirmed) {
                card.classList.add("draft-card-confirmed");
            }
            else {
                card.classList.add("draft-card-unconfirmed");
            }
            // Card Header
            const cardHeader = doc.createElement("div");
            cardHeader.className = "draft-card-header";
            const headerLeft = doc.createElement("div");
            headerLeft.className = "draft-header-left";
            const isFailedOrCancelled = currentJob.state === "failed" ||
                (currentJob.flags && currentJob.flags.includes(PREVIEW_FLAGS.IMPORT_CANCELLED));
            // Confirmed Checkbox
            const checkLabel = doc.createElement("label");
            checkLabel.className = "draft-checkbox-label";
            const chk = doc.createElement("input");
            chk.type = "checkbox";
            chk.className = "draft-checkbox-input";
            chk.checked = draft.confirmed;
            chk.disabled = Boolean(isFailedOrCancelled);
            chk.setAttribute("aria-label", `Xác nhận câu ${index + 1}`);
            attachListener(chk, "change", () => {
                if (isFailedOrCancelled)
                    return;
                const res = editImport(currentJob, draft.draftId, { confirmed: chk.checked });
                if (res.ok) {
                    notifyJobChange(res.value);
                }
            });
            checkLabel.appendChild(chk);
            const titleSpan = doc.createElement("span");
            titleSpan.textContent = `Câu ${index + 1}: ${q.title ?? `Bản thảo ${draft.draftId}`}`;
            checkLabel.appendChild(titleSpan);
            headerLeft.appendChild(checkLabel);
            // Kind badge
            const kindBadge = doc.createElement("span");
            kindBadge.className = `kind-badge kind-badge-${kind}`;
            kindBadge.textContent = `Phần ${kind}`;
            headerLeft.appendChild(kindBadge);
            // Provenance text
            if (draft.provenance) {
                const provSpan = doc.createElement("span");
                provSpan.className = "prov-text";
                provSpan.textContent = `[${draft.provenance.sourceId}: ${draft.provenance.location}]`;
                headerLeft.appendChild(provSpan);
            }
            cardHeader.appendChild(headerLeft);
            // Right header: warning tags and edit toggle button
            const headerRight = doc.createElement("div");
            headerRight.style.display = "flex";
            headerRight.style.alignItems = "center";
            headerRight.style.gap = "0.5rem";
            const warningTags = doc.createElement("div");
            warningTags.className = "draft-warning-tags";
            if (isMissingKey) {
                const tag = doc.createElement("span");
                tag.className = "draft-warning-tag tag-missing-key";
                tag.textContent = "Thiếu đáp án";
                warningTags.appendChild(tag);
            }
            if (warnings.includes(PREVIEW_FLAGS.OMML_UNSUPPORTED)) {
                const tag = doc.createElement("span");
                tag.className = "draft-warning-tag tag-omml";
                tag.textContent = "OMML chưa hỗ trợ";
                warningTags.appendChild(tag);
            }
            if (warnings.includes(PREVIEW_FLAGS.PDF_MANUAL_REVIEW_REQUIRED)) {
                const tag = doc.createElement("span");
                tag.className = "draft-warning-tag tag-pdf";
                tag.textContent = "Cần rà soát PDF";
                warningTags.appendChild(tag);
            }
            headerRight.appendChild(warningTags);
            const btnEdit = doc.createElement("button");
            btnEdit.type = "button";
            btnEdit.className = "preview-btn btn-secondary btn-sm";
            btnEdit.textContent = editingDraftId === draft.draftId ? "Đóng hiệu đính" : "Hiệu đính";
            attachListener(btnEdit, "click", () => {
                editingDraftId = editingDraftId === draft.draftId ? null : draft.draftId;
                render();
            });
            headerRight.appendChild(btnEdit);
            cardHeader.appendChild(headerRight);
            card.appendChild(cardHeader);
            // Question Content Area
            const contentArea = doc.createElement("div");
            contentArea.className = "draft-content-area";
            if (q.content) {
                const p = doc.createElement("div");
                p.appendChild(renderText(q.content, { document: doc }));
                contentArea.appendChild(p);
            }
            // Blocks rendering (tables, math, images)
            if (Array.isArray(q.blocks) && q.blocks.length > 0) {
                const blocksArea = doc.createElement("div");
                blocksArea.className = "draft-blocks-area";
                blocksArea.appendChild(renderBlocks(q.blocks, { document: doc, assets: currentJob.assets }));
                const previewImgs = blocksArea.querySelectorAll("img");
                previewImgs.forEach((img) => {
                    img.loading = "eager";
                    img.decoding = "sync";
                });
                contentArea.appendChild(blocksArea);
            }
            // Image
            if (q.image) {
                const img = doc.createElement("img");
                img.src = q.image;
                img.alt = "Hình ảnh minh họa câu hỏi";
                img.loading = "eager";
                img.decoding = "sync";
                img.style.maxWidth = "100%";
                img.style.maxHeight = "250px";
                img.style.borderRadius = "4px";
                img.style.marginTop = "0.5rem";
                contentArea.appendChild(img);
            }
            card.appendChild(contentArea);
            // Kind-Specific Interactive Preview & Correction
            if (kind === "I") {
                const q1 = q;
                const optionsList = doc.createElement("div");
                optionsList.className = "draft-options-list";
                const options = q1.options ?? [];
                options.forEach((opt) => {
                    const isCorrect = opt.optionId === q1.correctOptionId;
                    const optItem = doc.createElement("div");
                    optItem.className = `draft-option-item ${isCorrect ? "draft-option-correct" : ""}`;
                    const radio = doc.createElement("input");
                    radio.type = "radio";
                    radio.className = "draft-option-radio";
                    radio.name = `correct-opt-${draft.draftId}`;
                    radio.value = opt.optionId;
                    radio.checked = isCorrect;
                    radio.setAttribute("aria-label", `Chọn đáp án đúng ${opt.label ?? opt.optionId}`);
                    attachListener(radio, "change", () => {
                        const res = editImport(currentJob, draft.draftId, { correctOptionId: opt.optionId });
                        if (res.ok)
                            notifyJobChange(res.value);
                    });
                    optItem.appendChild(radio);
                    const lbl = doc.createElement("strong");
                    lbl.textContent = opt.label ? `${opt.label}. ` : "";
                    optItem.appendChild(lbl);
                    const txt = doc.createElement("span");
                    txt.textContent = opt.text;
                    optItem.appendChild(txt);
                    attachListener(optItem, "click", (e) => {
                        if (e.target !== radio) {
                            radio.checked = true;
                            radio.dispatchEvent(new Event("change"));
                        }
                    });
                    optionsList.appendChild(optItem);
                });
                card.appendChild(optionsList);
            }
            else if (kind === "II") {
                const q2 = q;
                const stmtsList = doc.createElement("div");
                stmtsList.className = "draft-statements-list";
                const statements = q2.statements ?? [];
                statements.forEach((stmt, sIdx) => {
                    const stmtItem = doc.createElement("div");
                    stmtItem.className = "draft-stmt-item";
                    const textSpan = doc.createElement("div");
                    const lbl = doc.createElement("strong");
                    lbl.textContent = stmt.label ? `${stmt.label}) ` : `${sIdx + 1}) `;
                    textSpan.appendChild(lbl);
                    const txt = doc.createElement("span");
                    txt.textContent = stmt.text;
                    textSpan.appendChild(txt);
                    stmtItem.appendChild(textSpan);
                    // True / False Toggles
                    const toggles = doc.createElement("div");
                    toggles.className = "draft-stmt-toggles";
                    const btnTrue = doc.createElement("button");
                    btnTrue.type = "button";
                    btnTrue.className = `stmt-toggle-btn ${stmt.answer === true ? "active-true" : ""}`;
                    btnTrue.textContent = "Đúng";
                    attachListener(btnTrue, "click", () => {
                        const updatedStmts = [...statements];
                        updatedStmts[sIdx] = { ...stmt, answer: true };
                        const res = editImport(currentJob, draft.draftId, { statements: updatedStmts });
                        if (res.ok)
                            notifyJobChange(res.value);
                    });
                    toggles.appendChild(btnTrue);
                    const btnFalse = doc.createElement("button");
                    btnFalse.type = "button";
                    btnFalse.className = `stmt-toggle-btn ${stmt.answer === false ? "active-false" : ""}`;
                    btnFalse.textContent = "Sai";
                    attachListener(btnFalse, "click", () => {
                        const updatedStmts = [...statements];
                        updatedStmts[sIdx] = { ...stmt, answer: false };
                        const res = editImport(currentJob, draft.draftId, { statements: updatedStmts });
                        if (res.ok)
                            notifyJobChange(res.value);
                    });
                    toggles.appendChild(btnFalse);
                    stmtItem.appendChild(toggles);
                    stmtsList.appendChild(stmtItem);
                });
                card.appendChild(stmtsList);
            }
            else if (kind === "III") {
                const q3 = q;
                const saBox = doc.createElement("div");
                saBox.className = "draft-sa-box";
                const label = doc.createElement("label");
                label.textContent = "Đáp án chuẩn (tối đa 4 ký tự): ";
                label.setAttribute("for", `sa-input-${draft.draftId}`);
                saBox.appendChild(label);
                const saInput = doc.createElement("input");
                saInput.id = `sa-input-${draft.draftId}`;
                saInput.type = "text";
                saInput.maxLength = 4;
                saInput.className = "draft-sa-input";
                saInput.value = q3.answerKey ?? "";
                saInput.placeholder = "Ví dụ: 1,5";
                const guard = createCompositionGuard({
                    element: saInput,
                    onCommit: (val) => {
                        const res = editImport(currentJob, draft.draftId, { answerKey: val });
                        if (res.ok)
                            notifyJobChange(res.value);
                    },
                });
                cleanupFns.push(() => guard.dispose());
                attachListener(saInput, "change", () => {
                    const res = editImport(currentJob, draft.draftId, { answerKey: saInput.value });
                    if (res.ok)
                        notifyJobChange(res.value);
                });
                saBox.appendChild(saInput);
                card.appendChild(saBox);
            }
            // Explanation
            if (q.explanation) {
                const expDiv = doc.createElement("div");
                expDiv.className = "draft-explanation-area";
                const strong = doc.createElement("strong");
                strong.textContent = "Lời giải: ";
                expDiv.appendChild(strong);
                const expSpan = doc.createElement("span");
                expSpan.textContent = q.explanation;
                expDiv.appendChild(expSpan);
                card.appendChild(expDiv);
            }
            // Inline Correction Form (when editingDraftId === draft.draftId)
            if (editingDraftId === draft.draftId) {
                const editForm = doc.createElement("div");
                editForm.className = "draft-edit-form";
                const formTitle = doc.createElement("h4");
                formTitle.style.margin = "0 0 0.75rem 0";
                formTitle.style.fontSize = "0.875rem";
                formTitle.style.fontWeight = "700";
                formTitle.textContent = "Hiệu đính chi tiết câu hỏi";
                editForm.appendChild(formTitle);
                const grid1 = doc.createElement("div");
                grid1.className = "form-grid-2";
                // Kind selection
                const grpKind = doc.createElement("div");
                grpKind.className = "form-group";
                const lblKind = doc.createElement("label");
                lblKind.className = "form-label";
                lblKind.textContent = "Loại câu hỏi";
                grpKind.appendChild(lblKind);
                const selKind = doc.createElement("select");
                selKind.className = "form-select";
                for (const k of ["I", "II", "III"]) {
                    const opt = doc.createElement("option");
                    opt.value = k;
                    opt.textContent = `Phần ${k}`;
                    if (k === kind) {
                        opt.selected = true;
                        selKind.value = k;
                    }
                    selKind.appendChild(opt);
                }
                if (!selKind.value)
                    selKind.value = kind;
                grpKind.appendChild(selKind);
                grid1.appendChild(grpKind);
                // Subject selection
                const grpSubj = doc.createElement("div");
                grpSubj.className = "form-group";
                const lblSubj = doc.createElement("label");
                lblSubj.className = "form-label";
                lblSubj.textContent = "Môn học";
                grpSubj.appendChild(lblSubj);
                const inpSubj = doc.createElement("input");
                inpSubj.type = "text";
                inpSubj.className = "form-input";
                inpSubj.value = q.subject ?? "";
                grpSubj.appendChild(inpSubj);
                grid1.appendChild(grpSubj);
                // Grade selection
                const grpGrade = doc.createElement("div");
                grpGrade.className = "form-group";
                const lblGrade = doc.createElement("label");
                lblGrade.className = "form-label";
                lblGrade.textContent = "Khối lớp";
                grpGrade.appendChild(lblGrade);
                const selGrade = doc.createElement("select");
                selGrade.className = "form-select";
                for (const g of [10, 11, 12]) {
                    const opt = doc.createElement("option");
                    opt.value = String(g);
                    opt.textContent = `Lớp ${g}`;
                    if (g === q.grade) {
                        opt.selected = true;
                        selGrade.value = String(g);
                    }
                    selGrade.appendChild(opt);
                }
                if (!selGrade.value)
                    selGrade.value = String(q.grade ?? 12);
                grpGrade.appendChild(selGrade);
                grid1.appendChild(grpGrade);
                // Difficulty selection
                const grpDiff = doc.createElement("div");
                grpDiff.className = "form-group";
                const lblDiff = doc.createElement("label");
                lblDiff.className = "form-label";
                lblDiff.textContent = "Mức độ";
                grpDiff.appendChild(lblDiff);
                const selDiff = doc.createElement("select");
                selDiff.className = "form-select";
                for (const d of ["Nhận biết", "Thông hiểu", "Vận dụng"]) {
                    const opt = doc.createElement("option");
                    opt.value = d;
                    opt.textContent = d;
                    if (d === q.difficulty) {
                        opt.selected = true;
                        selDiff.value = d;
                    }
                    selDiff.appendChild(opt);
                }
                if (!selDiff.value)
                    selDiff.value = q.difficulty ?? "Thông hiểu";
                grpDiff.appendChild(selDiff);
                grid1.appendChild(grpDiff);
                editForm.appendChild(grid1);
                // Content textarea
                const grpContent = doc.createElement("div");
                grpContent.className = "form-group";
                grpContent.style.marginBottom = "0.75rem";
                const lblContent = doc.createElement("label");
                lblContent.className = "form-label";
                lblContent.textContent = "Nội dung câu hỏi";
                grpContent.appendChild(lblContent);
                const txtContent = doc.createElement("textarea");
                txtContent.className = "form-textarea";
                txtContent.value = q.content ?? "";
                grpContent.appendChild(txtContent);
                editForm.appendChild(grpContent);
                // Explanation textarea
                const grpExp = doc.createElement("div");
                grpExp.className = "form-group";
                grpExp.style.marginBottom = "0.75rem";
                const lblExp = doc.createElement("label");
                lblExp.className = "form-label";
                lblExp.textContent = "Lời giải chi tiết";
                grpExp.appendChild(lblExp);
                const txtExp = doc.createElement("textarea");
                txtExp.className = "form-textarea";
                txtExp.value = q.explanation ?? "";
                grpExp.appendChild(txtExp);
                editForm.appendChild(grpExp);
                // Save button
                const btnSaveForm = doc.createElement("button");
                btnSaveForm.type = "button";
                btnSaveForm.className = "preview-btn btn-primary btn-sm";
                btnSaveForm.textContent = "Lưu thay đổi";
                attachListener(btnSaveForm, "click", () => {
                    const patch = {
                        kind: (selKind.value || kind),
                        subject: inpSubj.value,
                        grade: Number(selGrade.value || q.grade || 12),
                        difficulty: (selDiff.value || q.difficulty || "Thông hiểu"),
                        content: txtContent.value,
                        explanation: txtExp.value,
                    };
                    const res = editImport(currentJob, draft.draftId, patch);
                    if (res.ok) {
                        editingDraftId = null;
                        notifyJobChange(res.value);
                    }
                    else {
                        errorMessage = res.error.message;
                        render();
                    }
                });
                editForm.appendChild(btnSaveForm);
                card.appendChild(editForm);
            }
            draftList.appendChild(card);
        });
        container.appendChild(draftList);
        // 5. Action Footer
        const isJobFailedOrCancelled = currentJob.state === "failed" ||
            (currentJob.flags && currentJob.flags.includes(PREVIEW_FLAGS.IMPORT_CANCELLED));
        const footer = doc.createElement("footer");
        footer.className = "preview-action-footer";
        const footerLeft = doc.createElement("div");
        footerLeft.className = "footer-left";
        footerLeft.textContent = isJobFailedOrCancelled
            ? (currentJob.flags?.includes(PREVIEW_FLAGS.IMPORT_CANCELLED)
                ? "Tác vụ nhập đề đã bị hủy. Không thể xác nhận vào đề thi."
                : "Tác vụ nhập đề ở trạng thái thất bại. Không thể xác nhận vào đề thi.")
            : `Sẵn sàng nhập: ${confirmedCount} câu hỏi đã xác nhận / ${totalCount} tổng số.`;
        footer.appendChild(footerLeft);
        const footerRight = doc.createElement("div");
        footerRight.className = "footer-right";
        const btnCancel = doc.createElement("button");
        btnCancel.type = "button";
        btnCancel.className = "preview-btn btn-danger";
        btnCancel.textContent = "Hủy nhập";
        btnCancel.disabled = Boolean(isJobFailedOrCancelled);
        attachListener(btnCancel, "click", () => {
            if (isJobFailedOrCancelled)
                return;
            const cancelRes = cancelImport(currentJob);
            if (cancelRes.ok) {
                currentJob = cancelRes.value;
                statusMessage = "Đã hủy tác vụ nhập đề.";
                errorMessage = null;
                if (typeof actions.onCancel === "function") {
                    actions.onCancel(currentJob);
                }
                render();
            }
        });
        footerRight.appendChild(btnCancel);
        const btnConfirm = doc.createElement("button");
        btnConfirm.type = "button";
        btnConfirm.className = "preview-btn btn-success";
        btnConfirm.textContent = "Xác nhận nhập vào đề";
        btnConfirm.disabled = Boolean(isJobFailedOrCancelled || confirmedCount === 0);
        attachListener(btnConfirm, "click", () => {
            if (isJobFailedOrCancelled) {
                errorMessage = currentJob.flags?.includes(PREVIEW_FLAGS.IMPORT_CANCELLED)
                    ? "Tác vụ import đã bị hủy, không thể xác nhận vào đề thi."
                    : "Tác vụ import ở trạng thái thất bại, không thể xác nhận.";
                render();
                return;
            }
            if (!targetExamDraft) {
                // Create an empty dummy target exam draft if none provided
                targetExamDraft = {
                    draftId: "imported-draft",
                    revision: 1,
                    exam: {
                        schemaVersion: "web-exam-v1",
                        examId: `exam-${Date.now()}`,
                        examVersionId: "v1",
                        ruleSetId: "custom-v1",
                        inputPolicyId: "sa-charset-v1",
                        title: `Đề nhập từ ${currentJob.sourceId}`,
                        subject: "Toán",
                        grade: 12,
                        settings: {
                            durationMinutes: 50,
                            maxAttempts: null,
                            releasePolicy: "immediate",
                            shuffleQuestions: false,
                            shuffleOptions: false,
                        },
                        questions: [],
                        assets: [],
                    },
                };
            }
            const res = confirmImport(currentJob, targetExamDraft);
            if (res.ok) {
                targetExamDraft = res.value;
                statusMessage = `Đã nhập thành công ${res.value.exam.questions.length} câu hỏi vào đề thi!`;
                errorMessage = null;
                if (typeof actions.onConfirm === "function") {
                    actions.onConfirm(res.value);
                }
                render();
            }
            else {
                errorMessage = res.error.message;
                if (typeof actions.onError === "function") {
                    actions.onError(res.error);
                }
                render();
            }
        });
        footerRight.appendChild(btnConfirm);
        footer.appendChild(footerRight);
        container.appendChild(footer);
        root.appendChild(container);
    }
    // Initial render
    render();
    // Return teardown function
    return () => {
        for (const cleanup of cleanupFns) {
            cleanup();
        }
        while (root.firstChild) {
            root.removeChild(root.firstChild);
        }
    };
}
