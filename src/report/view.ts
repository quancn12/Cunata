/// <reference lib="dom" />

import type { Rational } from "../domain/index.ts";
import {
  toFractionString,
  toDecimalString,
  parseFractionString,
} from "../domain/index.ts";
import type {
  ReportModel,
  ReportQuestion,
  ReleasedReportQuestion,
  Block,
  Asset,
  AttemptRecord,
  WebError,
  DisplayPolicy,
} from "./types.ts";
import { downloadReport } from "./index.ts";
import { renderBlocks } from "../ui/index.ts";

export interface AttemptHistoryItem {
  readonly attemptId: string;
  readonly submittedAt: string | number;
  readonly candidateName?: string;
  readonly scoreI?: string;
  readonly scoreII?: string;
  readonly scoreIII?: string;
  readonly total?: string;
  readonly maxTotal?: string;
  readonly serverConfirmed?: boolean;
  readonly status?: string;
}

export interface ReportViewState {
  readonly report?: ReportModel | null;
  readonly history?: readonly (AttemptHistoryItem | AttemptRecord | unknown)[];
  readonly currentAttemptId?: string;
  readonly maxAttempts?: number | null;
  readonly error?: WebError | string | null;
  readonly nonfinal?: boolean;
  readonly displayPolicy?: DisplayPolicy;
}

interface ParsedScoreDTO {
  readonly total: string;
  readonly maxTotal: string;
  readonly sections: {
    readonly I: { readonly score: string; readonly max: string; readonly questionCount?: number };
    readonly II: { readonly score: string; readonly max: string; readonly questionCount?: number };
    readonly III: { readonly score: string; readonly max: string; readonly questionCount?: number };
  };
}

function formatValueWithPolicy(fracStr: string, policy?: DisplayPolicy): string {
  if (!policy || policy === "exact") {
    return fracStr;
  }
  try {
    const r: Rational = parseFractionString(fracStr);
    if (typeof policy === "object" && policy !== null) {
      if (policy.mode === "decimal") {
        return toDecimalString(r, policy.fractionDigits, "half-up");
      }
      if (policy.mode === "custom" && typeof policy.format === "function") {
        return policy.format(r, r);
      }
    }
  } catch {
    // If not a parseable rational string, retain original
  }
  return fracStr;
}

function formatTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString("vi-VN");
  } catch {
    return String(timestamp);
  }
}

function formatDuration(startedAt: number, submittedAt: number): string {
  const diffMs = Math.max(0, submittedAt - startedAt);
  const totalSeconds = Math.round(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} phút ${seconds} giây`;
}

function ensureScopedStyles(doc: Document): void {
  const STYLE_ID = "cunata-report-view-styles";
  if (doc.getElementById(STYLE_ID)) return;

  const styleEl = doc.createElement("style");
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
    .cunata-report-view {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: var(--text, #111827);
      line-height: 1.5;
      max-width: 960px;
      margin: 0 auto;
      padding: 1.5rem 1rem;
    }
    .report-header {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .report-title {
      font-size: 1.5rem;
      font-weight: 700;
      color: #2563eb;
      margin: 0 0 0.5rem 0;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .report-subtitle {
      font-size: 0.95rem;
      color: #4b5563;
      text-align: center;
      margin-bottom: 1rem;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 0.75rem;
      padding: 0.75rem;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      font-size: 0.875rem;
      margin-bottom: 1.25rem;
    }
    .meta-item span { color: #6b7280; margin-right: 0.25rem; }
    .meta-item strong { color: #111827; }
    .summary-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      border-top: 1px solid #e5e7eb;
      padding-top: 1.25rem;
    }
    .summary-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 0.875rem;
      text-align: center;
    }
    .summary-card.total-card {
      background: #eff6ff;
      border-color: #bfdbfe;
    }
    .summary-card-label {
      font-size: 0.8125rem;
      font-weight: 700;
      color: #4b5563;
      text-transform: uppercase;
      margin-bottom: 0.25rem;
    }
    .summary-card-score {
      font-size: 1.5rem;
      font-weight: 800;
      color: #2563eb;
      margin-bottom: 0.25rem;
    }
    .summary-card.total-card .summary-card-score {
      color: #1d4ed8;
      font-size: 1.75rem;
    }
    .summary-card-detail {
      font-size: 0.8125rem;
      color: #6b7280;
    }
    .report-actions-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      padding: 0.75rem;
      background: #f3f4f6;
      border-radius: 6px;
    }
    .report-actions-bar button {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background-color 0.15s;
    }
    .btn-secondary {
      background: #ffffff;
      color: #374151;
      border-color: #d1d5db !important;
    }
    .btn-secondary:hover { background: #f9fafb; }
    .btn-submit {
      background: #2563eb;
      color: #ffffff;
    }
    .btn-submit:hover { background: #1d4ed8; }
    .btn-submit:disabled, .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .print-help-text {
      font-size: 0.75rem;
      color: #6b7280;
      width: 100%;
      margin-top: 0.25rem;
    }
    .report-section-heading {
      font-size: 1.125rem;
      font-weight: 700;
      color: #1f2937;
      margin: 1.5rem 0 0.75rem 0;
    }
    .history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 1.5rem;
    }
    .history-table th, .history-table td {
      padding: 0.625rem 0.75rem;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
    }
    .history-table th {
      background: #f9fafb;
      font-weight: 700;
      color: #374151;
    }
    .history-row-current {
      background-color: #f0fdf4 !important;
      font-weight: 600;
    }
    .current-badge {
      display: inline-block;
      font-size: 0.6875rem;
      background: #10b981;
      color: #ffffff;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      margin-left: 0.25rem;
    }
    .server-status-confirmed { color: #15803d; font-weight: 600; }
    .server-status-local { color: #6b7280; }
    .max-attempts-notice {
      background: #fffbeb;
      border: 1px solid #fef3c7;
      color: #92400e;
      padding: 0.75rem;
      border-radius: 6px;
      margin-bottom: 1.25rem;
      font-size: 0.875rem;
    }
    .review-question-item {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .review-item-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 0.75rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .q-title-group {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .q-index { font-weight: 700; color: #2563eb; }
    .q-kind {
      background: #e2e8f0;
      color: #475569;
      font-size: 0.75rem;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .q-title {
      font-size: 1rem;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }
    .q-score-group {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .status-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .status-badge.full { background: #dcfce7; color: #15803d; }
    .status-badge.partial { background: #fef3c7; color: #b45309; }
    .status-badge.wrong { background: #fee2e2; color: #b91c1c; }
    .status-badge.invalid { background: #f3e8ff; color: #7e22ce; }
    .status-badge.unanswered { background: #f3f4f6; color: #6b7280; }
    .q-points { font-weight: 700; font-size: 0.95rem; color: #1f2937; }
    .student-response-box {
      background: #f9fafb;
      border-left: 3px solid #2563eb;
      padding: 0.625rem 0.875rem;
      border-radius: 0 6px 6px 0;
      margin: 0.75rem 0;
      font-size: 0.9375rem;
    }
    .raw-response {
      font-family: Consolas, Monaco, monospace;
      font-size: 1rem;
      color: #111827;
    }
    .answer-key-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      margin-top: 0.75rem;
      font-size: 0.9375rem;
    }
    .key-line {
      font-weight: 600;
      color: #15803d;
      margin-bottom: 0.35rem;
    }
    .explanation-box {
      margin-top: 0.5rem;
      border-top: 1px dashed #bbf7d0;
      padding-top: 0.5rem;
      color: #14532d;
    }
    .explanation-title {
      font-size: 0.875rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
    }
    .unreleased-notice {
      background: #fffbeb;
      border: 1px dashed #fde68a;
      color: #92400e;
      padding: 0.625rem 0.875rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-style: italic;
      margin-top: 0.75rem;
    }
    .report-error-state {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
      margin: 2rem auto;
      max-width: 600px;
    }
    .report-error-title {
      color: #991b1b;
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .report-error-message {
      color: #b91c1c;
      font-size: 0.95rem;
      margin-bottom: 1rem;
    }
    .report-nonfinal-state {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 8px;
      padding: 1.5rem;
      text-align: center;
      margin: 2rem auto;
      max-width: 600px;
    }
    .report-nonfinal-title {
      color: #0369a1;
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }
    .report-nonfinal-message {
      color: #0c4a6e;
      font-size: 0.95rem;
      margin-bottom: 1rem;
    }
  `;
  (doc.head || doc.body || doc.documentElement).appendChild(styleEl);
}

/**
 * Renders an explicit error state view.
 */
function renderErrorView(
  root: HTMLElement,
  error: WebError | string,
  actions?: Readonly<Record<string, (value: unknown) => void>>
): () => void {
  const doc = root.ownerDocument || document;
  ensureScopedStyles(doc);

  const container = doc.createElement("div");
  container.className = "cunata-report-view";

  const errorBox = doc.createElement("div");
  errorBox.className = "report-error-state";
  errorBox.setAttribute("role", "alert");

  const titleEl = doc.createElement("h2");
  titleEl.className = "report-error-title";
  titleEl.textContent = "Không Thể Hiển Thị Báo Cáo Kết Quả";
  errorBox.appendChild(titleEl);

  const msgEl = doc.createElement("p");
  msgEl.className = "report-error-message";
  if (typeof error === "string") {
    msgEl.textContent = error;
  } else {
    msgEl.textContent = `[${error.code}] ${error.message}`;
  }
  errorBox.appendChild(msgEl);

  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "btn-secondary";
  btn.textContent = "Quay Lại";
  const handleClick = () => {
    if (actions && typeof actions.back === "function") {
      actions.back(error);
    } else if (actions && typeof actions.errorBack === "function") {
      actions.errorBack(error);
    }
  };
  btn.addEventListener("click", handleClick);
  errorBox.appendChild(btn);

  container.appendChild(errorBox);
  root.textContent = "";
  root.appendChild(container);

  return () => {
    btn.removeEventListener("click", handleClick);
    root.textContent = "";
  };
}

/**
 * Renders an explicit nonfinal (draft / not submitted) state view.
 */
function renderNonfinalView(
  root: HTMLElement,
  actions?: Readonly<Record<string, (value: unknown) => void>>
): () => void {
  const doc = root.ownerDocument || document;
  ensureScopedStyles(doc);

  const container = doc.createElement("div");
  container.className = "cunata-report-view";

  const box = doc.createElement("div");
  box.className = "report-nonfinal-state";
  box.setAttribute("role", "status");

  const titleEl = doc.createElement("h2");
  titleEl.className = "report-nonfinal-title";
  titleEl.textContent = "Bài Thi Chưa Được Nộp";
  box.appendChild(titleEl);

  const msgEl = doc.createElement("p");
  msgEl.className = "report-nonfinal-message";
  msgEl.textContent =
    "Bài làm hiện tại đang ở trạng thái làm bài (chưa nộp). Báo cáo điểm số và đáp án chỉ hiển thị sau khi bài thi được nộp thành công.";
  box.appendChild(msgEl);

  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "btn-submit";
  btn.textContent = "Tiếp Tục Làm Bài";
  const handleClick = () => {
    if (actions && typeof actions.returnToExam === "function") {
      actions.returnToExam({ phase: "draft" });
    } else if (actions && typeof actions.back === "function") {
      actions.back({ phase: "draft" });
    }
  };
  btn.addEventListener("click", handleClick);
  box.appendChild(btn);

  container.appendChild(box);
  root.textContent = "";
  root.appendChild(container);

  return () => {
    btn.removeEventListener("click", handleClick);
    root.textContent = "";
  };
}

/**
 * Canonical view mount convention implementation for Report View.
 * Conforms to WEB-contract.md §5, §7, §9 and Shared Product Contract v2.0.
 *
 * CRITICAL INVARIANT:
 * No report view has an independent release check or scoring algorithm.
 * All points, max points, statuses, raw answers, and release keys/explanations
 * are projected STRICTLY and SOLELY from ReportModel.
 */
export function mount(
  root: HTMLElement,
  model: unknown,
  actions?: Readonly<Record<string, (value: unknown) => void>>
): () => void {
  if (!root) {
    throw new Error("Root HTMLElement must be provided to mount()");
  }

  const doc = root.ownerDocument || document;
  ensureScopedStyles(doc);

  if (model === null || model === undefined) {
    root.textContent = "";
    return () => {
      root.textContent = "";
    };
  }

  // Detect explicit error state
  if (typeof model === "object" && model !== null) {
    const raw = model as Record<string, unknown>;
    if ("error" in raw && raw.error) {
      return renderErrorView(root, raw.error as WebError | string, actions);
    }
    if ("nonfinal" in raw && raw.nonfinal === true) {
      return renderNonfinalView(root, actions);
    }
    if ("code" in raw && "message" in raw && typeof raw.code === "string" && typeof raw.message === "string") {
      return renderErrorView(root, raw as unknown as WebError, actions);
    }
  }

  // Extract ReportModel and ViewState options
  let report: ReportModel | null = null;
  let historyEntries: readonly (AttemptHistoryItem | AttemptRecord | unknown)[] = [];
  let currentAttemptId: string | undefined;
  let maxAttempts: number | null | undefined;
  let displayPolicy: DisplayPolicy | undefined;

  if (typeof model === "object" && model !== null) {
    const raw = model as Record<string, unknown>;
    if ("attempt" in raw && "questions" in raw && "scoreDTO" in raw && "released" in raw) {
      // Direct ReportModel
      report = raw as unknown as ReportModel;
      currentAttemptId = report.attempt.attemptId;
    } else if ("report" in raw && raw.report) {
      // ReportViewState envelope
      report = raw.report as ReportModel;
      if (Array.isArray(raw.history)) {
        historyEntries = raw.history;
      }
      currentAttemptId = typeof raw.currentAttemptId === "string" ? raw.currentAttemptId : report.attempt?.attemptId;
      maxAttempts = typeof raw.maxAttempts === "number" ? raw.maxAttempts : null;
      displayPolicy = raw.displayPolicy as DisplayPolicy | undefined;
    }
  }

  if (!report) {
    root.textContent = "";
    const emptyBox = doc.createElement("div");
    emptyBox.className = "cunata-report-view";
    const p = doc.createElement("p");
    p.textContent = "Không tìm thấy dữ liệu báo cáo kết quả bài làm.";
    emptyBox.appendChild(p);
    root.appendChild(emptyBox);
    return () => {
      root.textContent = "";
    };
  }

  // Main UI container
  const container = doc.createElement("div");
  container.className = "cunata-report-view report-view";
  container.id = "reportView";

  const cleanupFns: (() => void)[] = [];

  // 1. Header & Title
  const headerEl = doc.createElement("header");
  headerEl.className = "report-header";

  const titleEl = doc.createElement("h1");
  titleEl.className = "report-title";
  titleEl.id = "reportTitle";
  titleEl.textContent = `KẾT QUẢ KHẢO SÁT BÀI THI: ${report.attempt.examId}`;
  headerEl.appendChild(titleEl);

  const subTitleEl = doc.createElement("div");
  subTitleEl.className = "report-subtitle";
  subTitleEl.id = "reportSubtitle";
  // Safe DOM string assignment (no innerHTML with raw candidateName)
  subTitleEl.textContent = `Thí sinh: ${report.candidateName || "Thí sinh tự do"} · Nộp bài lúc: ${formatTime(report.submittedAt)}`;
  headerEl.appendChild(subTitleEl);

  // Metadata Grid
  const metaGrid = doc.createElement("div");
  metaGrid.className = "meta-grid";

  const addMetaItem = (label: string, value: string) => {
    const item = doc.createElement("div");
    item.className = "meta-item";
    const span = doc.createElement("span");
    span.textContent = label;
    const strong = doc.createElement("strong");
    strong.textContent = value;
    item.appendChild(span);
    item.appendChild(strong);
    metaGrid.appendChild(item);
  };

  addMetaItem("Thí sinh:", report.candidateName || "Thí sinh tự do");
  addMetaItem("Mã bài làm:", report.attempt.attemptId);
  addMetaItem("Mã đề thi:", `${report.attempt.examId} (${report.attempt.examVersionId})`);
  addMetaItem("Bắt đầu lúc:", formatTime(report.startedAt));
  addMetaItem("Nộp bài lúc:", formatTime(report.submittedAt));
  addMetaItem("Thời gian làm:", formatDuration(report.startedAt, report.submittedAt));

  headerEl.appendChild(metaGrid);

  // 2. Score Summary Cards Grid
  const dto = report.scoreDTO as ParsedScoreDTO;
  const summaryGrid = doc.createElement("div");
  summaryGrid.className = "summary-cards-grid";

  const createCard = (label: string, scoreVal: string, maxVal: string, detailText: string, isTotal = false) => {
    const card = doc.createElement("div");
    card.className = isTotal ? "summary-card total-card" : "summary-card";

    const labelEl = doc.createElement("div");
    labelEl.className = "summary-card-label";
    labelEl.textContent = label;
    card.appendChild(labelEl);

    const scoreEl = doc.createElement("div");
    scoreEl.className = "summary-card-score";
    const formattedScore = formatValueWithPolicy(scoreVal, displayPolicy);
    const formattedMax = formatValueWithPolicy(maxVal, displayPolicy);
    scoreEl.textContent = `${formattedScore} / ${formattedMax}`;
    if (isTotal) {
      scoreEl.id = "scoreTotal";
    }
    card.appendChild(scoreEl);

    const detailEl = doc.createElement("div");
    detailEl.className = "summary-card-detail";
    detailEl.textContent = detailText;
    if (isTotal) {
      detailEl.id = "percentTotal";
    }
    card.appendChild(detailEl);

    return card;
  };

  const secI = dto?.sections?.I;
  const secII = dto?.sections?.II;
  const secIII = dto?.sections?.III;

  const cardI = createCard(
    "Phần I (4 lựa chọn)",
    secI?.score ?? "0",
    secI?.max ?? "0",
    secI?.questionCount !== undefined ? `${secI.questionCount} câu (0,25 đ/câu)` : "--"
  );
  cardI.querySelector(".summary-card-score")!.id = "scorePartI";
  cardI.querySelector(".summary-card-detail")!.id = "detailPartI";
  summaryGrid.appendChild(cardI);

  const cardII = createCard(
    "Phần II (Đúng / Sai)",
    secII?.score ?? "0",
    secII?.max ?? "0",
    secII?.questionCount !== undefined ? `${secII.questionCount} câu (tối đa 1 đ/câu)` : "--"
  );
  cardII.querySelector(".summary-card-score")!.id = "scorePartII";
  cardII.querySelector(".summary-card-detail")!.id = "detailPartII";
  summaryGrid.appendChild(cardII);

  const cardIII = createCard(
    "Phần III (Trả lời ngắn)",
    secIII?.score ?? "0",
    secIII?.max ?? "0",
    secIII?.questionCount !== undefined ? `${secIII.questionCount} câu` : "--"
  );
  cardIII.querySelector(".summary-card-score")!.id = "scorePartIII";
  cardIII.querySelector(".summary-card-detail")!.id = "detailPartIII";
  summaryGrid.appendChild(cardIII);

  const cardTotal = createCard(
    "Tổng Điểm Đạt Được",
    dto?.total ?? "0",
    dto?.maxTotal ?? "0",
    "Thang điểm đề thi",
    true
  );
  summaryGrid.appendChild(cardTotal);

  headerEl.appendChild(summaryGrid);
  container.appendChild(headerEl);

  // 3. Actions Bar
  const actionsBar = doc.createElement("div");
  actionsBar.className = "report-actions-bar no-print";

  // Print Button
  const btnPrint = doc.createElement("button");
  btnPrint.type = "button";
  btnPrint.id = "btnPrintReport";
  btnPrint.className = "btn-secondary btn-print";
  btnPrint.textContent = "In / Lưu Báo Cáo (PDF)";
  btnPrint.setAttribute("title", "Sử dụng tính năng in của trình duyệt để in ra giấy hoặc lưu PDF (window.print)");

  const onPrintClick = () => {
    if (actions && typeof actions.print === "function") {
      actions.print({ report });
    } else if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  };
  btnPrint.addEventListener("click", onPrintClick);
  cleanupFns.push(() => btnPrint.removeEventListener("click", onPrintClick));
  actionsBar.appendChild(btnPrint);

  // Download HTML Button
  const btnDownload = doc.createElement("button");
  btnDownload.type = "button";
  btnDownload.id = "btnDownloadReportHtml";
  btnDownload.className = "btn-secondary btn-download-html";
  btnDownload.textContent = "Tải Báo Cáo Offline (.html)";

  const onDownloadClick = () => {
    if (actions && typeof actions.downloadHtml === "function") {
      actions.downloadHtml({ report });
    } else if (typeof window !== "undefined") {
      try {
        const blob = downloadReport(report);
        const url = URL.createObjectURL(blob);
        const a = doc.createElement("a");
        a.href = url;
        a.download = `bao-cao-${report.attempt.examId}-${report.attempt.attemptId}.html`;
        doc.body.appendChild(a);
        a.click();
        doc.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        // Fallback for non-standard environments
      }
    }
  };
  btnDownload.addEventListener("click", onDownloadClick);
  cleanupFns.push(() => btnDownload.removeEventListener("click", onDownloadClick));
  actionsBar.appendChild(btnDownload);

  // Restart Button
  const btnRestart = doc.createElement("button");
  btnRestart.type = "button";
  btnRestart.id = "btnRestart";
  btnRestart.className = "btn-submit btn-restart";
  btnRestart.textContent = "Làm Lại Đề Thi";

  const onRestartClick = () => {
    if (actions && typeof actions.restart === "function") {
      actions.restart({ examId: report.attempt.examId });
    }
  };
  btnRestart.addEventListener("click", onRestartClick);
  cleanupFns.push(() => btnRestart.removeEventListener("click", onRestartClick));
  actionsBar.appendChild(btnRestart);

  // Print helper explanation without programmatic PDF generation claim
  const printHelp = doc.createElement("div");
  printHelp.className = "print-help-text no-print";
  printHelp.textContent =
    "Ghi chú: Nút 'In / Lưu Báo Cáo' kích hoạt hộp thoại in tiêu chuẩn của trình duyệt (window.print). Để lưu file PDF, hãy chọn 'Save as PDF' (Lưu dưới dạng PDF) trong danh sách máy in của trình duyệt.";
  actionsBar.appendChild(printHelp);

  container.appendChild(actionsBar);

  // Max Attempts Notice
  if (typeof maxAttempts === "number" && maxAttempts > 0 && historyEntries.length >= maxAttempts) {
    btnRestart.disabled = true;
    const maxNotice = doc.createElement("div");
    maxNotice.className = "max-attempts-notice";
    maxNotice.id = "maxAttemptsNotice";
    maxNotice.textContent = `⚠️ Bạn đã hoàn thành ${historyEntries.length}/${maxAttempts} lượt làm bài quy định cho đề thi này.`;
    container.appendChild(maxNotice);
  }

  // 4. Immutable Attempt History Section
  if (historyEntries.length > 0) {
    const historySection = doc.createElement("div");
    historySection.id = "attemptHistorySection";

    const hTitle = doc.createElement("h2");
    hTitle.className = "report-section-heading";
    hTitle.textContent = "Lịch Sử Các Lượt Làm Bài Của Đề Thi";
    historySection.appendChild(hTitle);

    const tableWrap = doc.createElement("div");
    tableWrap.id = "attemptHistoryTableContainer";
    tableWrap.style.overflowX = "auto";

    const table = doc.createElement("table");
    table.className = "history-table";

    const thead = doc.createElement("thead");
    const trHead = doc.createElement("tr");
    const headers = [
      "Lượt",
      "Thời điểm nộp",
      "Thí sinh",
      "Phần I",
      "Phần II",
      "Phần III",
      "Tổng điểm",
      "Máy chủ",
    ];
    for (const text of headers) {
      const th = doc.createElement("th");
      th.textContent = text;
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = doc.createElement("tbody");
    historyEntries.forEach((entryRaw, idx) => {
      const tr = doc.createElement("tr");
      const e = entryRaw as Record<string, unknown>;

      const entryAttemptId = String(e.attemptId ?? "");
      const isCurrent = entryAttemptId && entryAttemptId === currentAttemptId;

      if (isCurrent) {
        tr.className = "history-row-current";
      }

      // Column 1: Index + Current Badge
      const tdIdx = doc.createElement("td");
      tdIdx.textContent = `#${idx + 1}`;
      if (isCurrent) {
        const badge = doc.createElement("span");
        badge.className = "current-badge";
        badge.textContent = "Hiện tại";
        tdIdx.appendChild(badge);
      }
      tr.appendChild(tdIdx);

      // Column 2: Submitted At
      const tdSub = doc.createElement("td");
      const subVal = e.submittedAt;
      tdSub.textContent = typeof subVal === "number" ? formatTime(subVal) : String(subVal ?? "");
      tr.appendChild(tdSub);

      // Column 3: Candidate Name
      const tdCand = doc.createElement("td");
      tdCand.textContent = String(e.candidateName ?? "Thí sinh tự do");
      tr.appendChild(tdCand);

      // Helper to extract scores
      let scoreI = "-";
      let scoreII = "-";
      let scoreIII = "-";
      let total = "-";
      let maxTotal = "-";

      if (e.scoreDTO && typeof e.scoreDTO === "object") {
        const d = e.scoreDTO as ParsedScoreDTO;
        scoreI = d.sections?.I?.score ?? "-";
        scoreII = d.sections?.II?.score ?? "-";
        scoreIII = d.sections?.III?.score ?? "-";
        total = d.total ?? "-";
        maxTotal = d.maxTotal ?? "-";
      } else {
        scoreI = String(e.scoreI ?? e.scoreIFraction ?? "-");
        scoreII = String(e.scoreII ?? e.scoreIIFraction ?? "-");
        scoreIII = String(e.scoreIII ?? e.scoreIIIFraction ?? "-");
        total = String(e.total ?? e.totalFraction ?? e.scoreTotal ?? "-");
        maxTotal = String(e.maxTotal ?? e.maxTotalFraction ?? "-");
      }

      const tdI = doc.createElement("td");
      tdI.textContent = formatValueWithPolicy(scoreI, displayPolicy);
      tr.appendChild(tdI);

      const tdII = doc.createElement("td");
      tdII.textContent = formatValueWithPolicy(scoreII, displayPolicy);
      tr.appendChild(tdII);

      const tdIII = doc.createElement("td");
      tdIII.textContent = formatValueWithPolicy(scoreIII, displayPolicy);
      tr.appendChild(tdIII);

      const tdTot = doc.createElement("td");
      const fTotal = formatValueWithPolicy(total, displayPolicy);
      const fMaxTotal = formatValueWithPolicy(maxTotal, displayPolicy);
      tdTot.textContent = `${fTotal} / ${fMaxTotal}`;
      tdTot.style.fontWeight = "700";
      tr.appendChild(tdTot);

      // Column 8: Server status
      const tdStatus = doc.createElement("td");
      if (e.serverConfirmed) {
        tdStatus.className = "server-status-confirmed";
        tdStatus.textContent = "✔ Đã xác nhận";
      } else {
        tdStatus.className = "server-status-local";
        tdStatus.textContent = "Cục bộ";
      }
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    historySection.appendChild(tableWrap);
    container.appendChild(historySection);
  }

  // 5. Detailed Question Review List
  const reviewHeading = doc.createElement("h2");
  reviewHeading.className = "report-section-heading";
  reviewHeading.textContent = "Chi Tiết Bài Làm & Lời Giải Từng Câu";
  container.appendChild(reviewHeading);

  const reviewList = doc.createElement("div");
  reviewList.id = "reviewQuestionsList";

  const statusLabelText = (status: string) => {
    switch (status) {
      case "full":
        return "Đúng hoàn toàn";
      case "partial":
        return "Đúng một phần";
      case "wrong":
        return "Sai";
      case "invalid":
        return "Không hợp lệ (0 điểm)";
      default:
        return "Chưa làm";
    }
  };

  report.questions.forEach((q: ReportQuestion | ReleasedReportQuestion, index: number) => {
    const item = doc.createElement("section");
    item.className = "review-question-item question-card";
    item.id = `q-${q.questionVersionId}`;

    // Header
    const header = doc.createElement("header");
    header.className = "review-item-header question-header";

    const titleGroup = doc.createElement("div");
    titleGroup.className = "q-title-group";

    const indexSpan = doc.createElement("span");
    indexSpan.className = "q-index";
    indexSpan.textContent = `Câu ${index + 1}`;
    titleGroup.appendChild(indexSpan);

    const kindSpan = doc.createElement("span");
    kindSpan.className = "q-kind";
    kindSpan.textContent = `Phần ${q.kind}`;
    titleGroup.appendChild(kindSpan);

    const titleH3 = doc.createElement("h3");
    titleH3.className = "q-title";
    titleH3.textContent = q.title || q.questionVersionId;
    titleGroup.appendChild(titleH3);

    header.appendChild(titleGroup);

    const scoreGroup = doc.createElement("div");
    scoreGroup.className = "q-score-group";

    const badge = doc.createElement("span");
    badge.className = `status-badge ${q.status}`;
    badge.textContent = statusLabelText(q.status);
    scoreGroup.appendChild(badge);

    const pointsSpan = doc.createElement("span");
    pointsSpan.className = "q-points";
    const formattedPoints = formatValueWithPolicy(q.points, displayPolicy);
    const formattedMax = formatValueWithPolicy(q.maxPoints, displayPolicy);
    pointsSpan.textContent = `${formattedPoints} / ${formattedMax} điểm`;
    scoreGroup.appendChild(pointsSpan);

    header.appendChild(scoreGroup);
    item.appendChild(header);

    // Question content blocks
    if (q.blocks && q.blocks.length > 0) {
      const blocksContainer = doc.createElement("div");
      blocksContainer.className = "blocks-container";
      try {
        const rendered = renderBlocks(q.blocks, { document: doc, assets: report.assets });
        blocksContainer.appendChild(rendered);
      } catch {
        // Fallback plain text if renderer throws
        for (const b of q.blocks) {
          if (b.type === "text") {
            const p = doc.createElement("p");
            p.textContent = b.text;
            blocksContainer.appendChild(p);
          }
        }
      }
      item.appendChild(blocksContainer);
    }

    // Student response box
    const responseBox = doc.createElement("div");
    responseBox.className = "student-response-box review-detail-grid";

    if (!q.response) {
      const em = doc.createElement("em");
      em.textContent = "Chưa trả lời";
      responseBox.appendChild(em);
    } else if (q.response.kind === "I") {
      const labelP = doc.createElement("p");
      labelP.textContent = "Lựa chọn của bạn: ";
      const strong = doc.createElement("strong");
      strong.textContent = q.response.selectedOptionId || "(Chưa chọn)";
      labelP.appendChild(strong);
      responseBox.appendChild(labelP);
    } else if (q.response.kind === "II") {
      const table = doc.createElement("table");
      table.style.width = "100%";
      table.style.fontSize = "0.875rem";
      table.style.borderCollapse = "collapse";

      const trH = doc.createElement("tr");
      const th1 = doc.createElement("th");
      th1.textContent = "Ý";
      th1.style.padding = "4px";
      const th2 = doc.createElement("th");
      th2.textContent = "Bạn chọn";
      th2.style.padding = "4px";
      const th3 = doc.createElement("th");
      th3.textContent = "Đáp án chuẩn";
      th3.style.padding = "4px";
      const th4 = doc.createElement("th");
      th4.textContent = "Kết quả";
      th4.style.padding = "4px";

      trH.appendChild(th1);
      trH.appendChild(th2);
      trH.appendChild(th3);
      trH.appendChild(th4);
      table.appendChild(trH);

      const relQ = report.released ? (q as ReleasedReportQuestion) : null;
      const statementAnswersMap = new Map<string, boolean>();
      if (relQ && Array.isArray(relQ.answer)) {
        for (const sa of relQ.answer) {
          statementAnswersMap.set(sa.statementId, sa.answer);
        }
      }

      for (const st of q.response.answers) {
        const tr = doc.createElement("tr");
        tr.style.borderBottom = "1px solid #f3f4f6";

        const tdLabel = doc.createElement("td");
        tdLabel.style.padding = "4px";
        tdLabel.style.fontWeight = "700";
        tdLabel.textContent = st.statementId;
        tr.appendChild(tdLabel);

        const tdUser = doc.createElement("td");
        tdUser.style.padding = "4px";
        tdUser.textContent = st.value === true ? "Đúng" : st.value === false ? "Sai" : "(Chưa chọn)";
        tr.appendChild(tdUser);

        const tdCorrect = doc.createElement("td");
        tdCorrect.style.padding = "4px";
        if (report.released && statementAnswersMap.has(st.statementId)) {
          const cVal = statementAnswersMap.get(st.statementId);
          tdCorrect.textContent = cVal === true ? "Đúng" : "Sai";
          tdCorrect.style.fontWeight = "600";
        } else {
          tdCorrect.textContent = "Chưa công bố";
          tdCorrect.style.color = "#6b7280";
          tdCorrect.style.fontStyle = "italic";
        }
        tr.appendChild(tdCorrect);

        const tdResult = doc.createElement("td");
        tdResult.style.padding = "4px";
        if (report.released && statementAnswersMap.has(st.statementId)) {
          const cVal = statementAnswersMap.get(st.statementId);
          if (st.value === null || st.value === undefined) {
            tdResult.textContent = "— Chưa làm";
            tdResult.style.color = "#6b7280";
          } else if (st.value === cVal) {
            tdResult.textContent = "✔ Đúng";
            tdResult.style.color = "#15803d";
            tdResult.style.fontWeight = "600";
          } else {
            tdResult.textContent = "✘ Sai";
            tdResult.style.color = "#b91c1c";
            tdResult.style.fontWeight = "600";
          }
        } else {
          tdResult.textContent = "—";
          tdResult.style.color = "#6b7280";
        }
        tr.appendChild(tdResult);

        table.appendChild(tr);
      }
      responseBox.appendChild(table);
    } else if (q.response.kind === "III") {
      const labelP = doc.createElement("p");
      labelP.textContent = "Câu trả lời của bạn: ";
      const code = doc.createElement("code");
      code.className = "raw-response";
      code.textContent = q.response.raw !== null ? q.response.raw : "(Chưa trả lời)";
      labelP.appendChild(code);
      responseBox.appendChild(labelP);
    }
    item.appendChild(responseBox);

    // Release-gated answer key and explanation
    if (report.released) {
      const relQ = q as ReleasedReportQuestion;
      const keyBox = doc.createElement("div");
      keyBox.className = "answer-key-box";

      const keyLine = doc.createElement("div");
      keyLine.className = "key-line";
      keyLine.textContent = "Đáp án chuẩn: ";

      if (typeof relQ.answer === "string") {
        const ansCode = doc.createElement("code");
        ansCode.textContent = relQ.answer;
        keyLine.appendChild(ansCode);
      } else if (Array.isArray(relQ.answer)) {
        const ul = doc.createElement("ul");
        ul.style.margin = "0.25rem 0 0 1rem";
        for (const sa of relQ.answer) {
          const li = doc.createElement("li");
          li.textContent = `Ý ${sa.statementId}: ${sa.answer ? "Đúng" : "Sai"}`;
          ul.appendChild(li);
        }
        keyLine.appendChild(ul);
      }
      keyBox.appendChild(keyLine);

      if (relQ.explanation && relQ.explanation.length > 0) {
        const expBox = doc.createElement("div");
        expBox.className = "explanation-box";

        const expTitle = doc.createElement("div");
        expTitle.className = "explanation-title";
        expTitle.textContent = "Lời giải chi tiết:";
        expBox.appendChild(expTitle);

        try {
          const expRendered = renderBlocks(relQ.explanation, { document: doc, assets: report.assets });
          expBox.appendChild(expRendered);
        } catch {
          for (const b of relQ.explanation) {
            if (b.type === "text") {
              const p = doc.createElement("p");
              p.textContent = b.text;
              expBox.appendChild(p);
            }
          }
        }
        keyBox.appendChild(expBox);
      }
      item.appendChild(keyBox);
    } else {
      const unreleasedNotice = doc.createElement("div");
      unreleasedNotice.className = "unreleased-notice answer-hidden-notice";
      unreleasedNotice.textContent =
        "🔒 Đáp án chuẩn và lời giải chi tiết chưa được công bố (sẽ hiển thị sau khi hết thời hạn làm bài).";
      item.appendChild(unreleasedNotice);
    }

    reviewList.appendChild(item);
  });

  container.appendChild(reviewList);

  root.textContent = "";
  root.appendChild(container);

  return () => {
    for (const fn of cleanupFns) {
      try {
        fn();
      } catch {
        // ignore
      }
    }
    root.textContent = "";
  };
}
