/// <reference lib="dom" />

import type { Rational } from "../domain/index.ts";
import {
  toFractionString,
  toDecimalString,
  parseFractionString,
} from "../domain/index.ts";
import type {
  Block,
  Cell,
  Asset,
  AttemptRecord,
  ReportQuestion,
  ReleasedReportQuestion,
  ReportModel,
  DisplayPolicy,
  AttemptHistoryItem,
  DownloadReportOptions,
} from "./types.ts";

export type { DownloadReportOptions };

export interface DownloadByteInspection {
  readonly totalBytes: number;
  readonly isUtf8: boolean;
  readonly hasExternalRequests: boolean;
  readonly externalUrlsFound: readonly string[];
  readonly hasHostileScripts: boolean;
  readonly hostileMatchesFound: readonly string[];
  readonly hasUnreleasedKeys: boolean;
  readonly unreleasedKeysFound: readonly string[];
  readonly hasMissingAssets: boolean;
  readonly missingAssetPlaceholdersFound: readonly string[];
  readonly exactScoresPreserved: boolean;
  readonly historyTableRendered: boolean;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("vbscript:") ||
    trimmed.startsWith("data:text/html")
  ) {
    return "";
  }
  return url;
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

function formatScoreWithPolicy(
  fracStr: string,
  maxStr: string,
  policy?: DisplayPolicy
): { score: string; max: string } {
  if (!policy || policy === "exact") {
    return { score: fracStr, max: maxStr };
  }
  try {
    const rScore: Rational = parseFractionString(fracStr);
    const rMax: Rational = parseFractionString(maxStr);

    if (typeof policy === "object" && policy !== null) {
      if (policy.mode === "decimal") {
        return {
          score: toDecimalString(rScore, policy.fractionDigits, "half-up"),
          max: toDecimalString(rMax, policy.fractionDigits, "half-up"),
        };
      }
      if (policy.mode === "custom" && typeof policy.format === "function") {
        return {
          score: policy.format(rScore, rMax),
          max: toFractionString(rMax),
        };
      }
    }
  } catch {
    // If not parseable as a rational, retain original strings
  }
  return { score: fracStr, max: maxStr };
}

interface NormalizedHistoryEntry {
  readonly attemptId: string;
  readonly submittedAt: string;
  readonly candidateName: string;
  readonly scoreI: string;
  readonly scoreII: string;
  readonly scoreIII: string;
  readonly total: string;
  readonly maxTotal: string;
  readonly serverConfirmed: boolean;
  readonly status: string;
}

function normalizeHistoryEntry(
  item: unknown,
  policy?: DisplayPolicy
): NormalizedHistoryEntry | null {
  if (!item || typeof item !== "object") return null;

  const rec = item as Record<string, unknown>;
  const attemptId = String(rec.attemptId ?? "unknown");
  let submittedAt = "—";
  if (typeof rec.submittedAt === "number") {
    submittedAt = new Date(rec.submittedAt).toLocaleString("vi-VN");
  } else if (typeof rec.submittedAt === "string" && rec.submittedAt.trim() !== "") {
    submittedAt = rec.submittedAt;
  }

  const candidateName = String(rec.candidateName ?? "Thí sinh");
  let scoreI = "—";
  let scoreII = "—";
  let scoreIII = "—";
  let total = "—";
  let maxTotal = "—";
  let serverConfirmed = Boolean(rec.serverConfirmed);
  let status = String(rec.status ?? "Hoàn tất");

  if (rec.scoreDTO && typeof rec.scoreDTO === "object") {
    const dto = rec.scoreDTO as ParsedScoreDTO;
    if (dto.sections) {
      if (dto.sections.I) {
        const formatted = formatScoreWithPolicy(
          dto.sections.I.score,
          dto.sections.I.max,
          policy
        );
        scoreI = `${formatted.score} / ${formatted.max}`;
      }
      if (dto.sections.II) {
        const formatted = formatScoreWithPolicy(
          dto.sections.II.score,
          dto.sections.II.max,
          policy
        );
        scoreII = `${formatted.score} / ${formatted.max}`;
      }
      if (dto.sections.III) {
        const formatted = formatScoreWithPolicy(
          dto.sections.III.score,
          dto.sections.III.max,
          policy
        );
        scoreIII = `${formatted.score} / ${formatted.max}`;
      }
    }
    if (dto.total && dto.maxTotal) {
      const formattedTotal = formatScoreWithPolicy(dto.total, dto.maxTotal, policy);
      total = formattedTotal.score;
      maxTotal = formattedTotal.max;
    }
  } else {
    if (typeof rec.scoreI === "string") scoreI = rec.scoreI;
    if (typeof rec.scoreII === "string") scoreII = rec.scoreII;
    if (typeof rec.scoreIII === "string") scoreIII = rec.scoreIII;
    if (typeof rec.total === "string") total = rec.total;
    if (typeof rec.maxTotal === "string") maxTotal = rec.maxTotal;
  }

  return {
    attemptId,
    submittedAt,
    candidateName,
    scoreI,
    scoreII,
    scoreIII,
    total,
    maxTotal,
    serverConfirmed,
    status,
  };
}

function renderBlock(b: Block, assetMap: Map<string, string>): string {
  if (b.type === "text") {
    const escaped = escapeHtml(b.text);
    return `<p class="block-text">${escaped.replace(/\n\n+/g, "</p><p class=\"block-text\">").replace(/\n/g, "<br />")}</p>`;
  }
  if (b.type === "image") {
    const dataUri = assetMap.get(b.assetId);
    if (!dataUri) {
      // Missing asset placeholder: handles missing assets safely without external requests
      return `<div class="block-asset-missing" data-asset-id="${escapeHtml(b.assetId)}" role="note" aria-label="Hình ảnh không khả dụng"><span class="asset-missing-icon" aria-hidden="true">&#9888;</span> <span class="asset-missing-label">Hình ảnh không khả dụng: <code>${escapeHtml(b.assetId)}</code> (tài nguyên không tồn tại trong đề)</span></div>`;
    }
    const escapedAlt = escapeHtml(b.alt || "Hình ảnh câu hỏi");
    return `<figure class="block-image"><img src="${escapeHtml(dataUri)}" alt="${escapedAlt}" loading="lazy" />${b.alt ? `<figcaption class="image-caption">${escapedAlt}</figcaption>` : ""}</figure>`;
  }
  if (b.type === "math") {
    const escapedSource = escapeHtml(b.source);
    const escapedFormat = escapeHtml(b.format);
    const verifiedBadge = b.verified
      ? '<span class="math-verified-badge" title="Công thức đã kiểm định">&#10003;</span>'
      : "";
    return `<div class="block-math" data-format="${escapedFormat}" data-verified="${b.verified}"><span class="math-format-badge">${escapedFormat.toUpperCase()}</span>${verifiedBadge}<code class="math-source">${escapedSource}</code></div>`;
  }
  if (b.type === "table") {
    let rowsHtml = "";
    for (const row of b.rows) {
      rowsHtml += "<tr>";
      for (const cell of row) {
        const cellContent = cell.blocks.map((cb) => renderBlock(cb, assetMap)).join("");
        const rSpan = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";
        const cSpan = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
        rowsHtml += `<td${rSpan}${cSpan}>${cellContent}</td>`;
      }
      rowsHtml += "</tr>";
    }
    return `<div class="block-table"><table><tbody>${rowsHtml}</tbody></table></div>`;
  }
  return "";
}

export function renderReportHtml(
  model: ReportModel,
  options?: DownloadReportOptions
): string {
  // Build safe asset map, rejecting hostile protocols and unapproved MIME types
  const assetMap = new Map<string, string>();
  const allowedMimes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
    "image/gif",
  ]);

  for (const asset of model.assets) {
    if (!asset.assetId) continue;
    const rawData = asset.data ? asset.data.trim() : "";
    if (!rawData) continue;

    const mime = (asset.mime || "").toLowerCase().trim();
    if (mime && !allowedMimes.has(mime)) {
      // Omit unapproved MIME to avoid hostile data types
      continue;
    }

    if (
      rawData.startsWith("javascript:") ||
      rawData.startsWith("vbscript:") ||
      rawData.startsWith("data:text/html") ||
      rawData.startsWith("http://") ||
      rawData.startsWith("https://") ||
      rawData.startsWith("//")
    ) {
      // Reject external protocols and script schemes
      continue;
    }

    if (rawData.startsWith("data:image/")) {
      assetMap.set(asset.assetId, sanitizeUrl(rawData));
    } else if (mime) {
      assetMap.set(asset.assetId, `data:${mime};base64,${rawData}`);
    }
  }

  const rawDto = model.scoreDTO as ParsedScoreDTO;
  const policy = options?.displayPolicy;
  const formattedTotal = formatScoreWithPolicy(rawDto.total, rawDto.maxTotal, policy);
  const formattedI = formatScoreWithPolicy(
    rawDto.sections.I.score,
    rawDto.sections.I.max,
    policy
  );
  const formattedII = formatScoreWithPolicy(
    rawDto.sections.II.score,
    rawDto.sections.II.max,
    policy
  );
  const formattedIII = formatScoreWithPolicy(
    rawDto.sections.III.score,
    rawDto.sections.III.max,
    policy
  );

  const durationSec = Math.max(0, Math.round((model.submittedAt - model.startedAt) / 1000));
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const durationStr = `${minutes} phút ${seconds} giây`;

  const startDate = new Date(model.startedAt).toLocaleString("vi-VN");
  const submitDate = new Date(model.submittedAt).toLocaleString("vi-VN");

  const statusLabel = (s: string) => {
    switch (s) {
      case "full":
        return `<span class="badge badge-full">Đúng hoàn toàn</span>`;
      case "partial":
        return `<span class="badge badge-partial">Đúng một phần</span>`;
      case "wrong":
        return `<span class="badge badge-wrong">Sai</span>`;
      case "invalid":
        return `<span class="badge badge-invalid">Không hợp lệ</span>`;
      default:
        return `<span class="badge badge-unanswered">Chưa làm</span>`;
    }
  };

  let questionsHtml = "";
  for (let i = 0; i < model.questions.length; i++) {
    const q = model.questions[i]!;
    const blocksHtml = q.blocks.map((b) => renderBlock(b, assetMap)).join("");

    // Render candidate response safely
    let responseHtml = "";
    if (!q.response) {
      responseHtml = `<div class="response-line"><em>(Chưa trả lời)</em></div>`;
    } else if (q.response.kind === "I") {
      const selected = q.response.selectedOptionId;
      responseHtml = `<div class="response-line">Lựa chọn của thí sinh: <strong>${
        selected ? escapeHtml(selected) : "(Chưa chọn)"
      }</strong></div>`;
    } else if (q.response.kind === "II") {
      const ansList = q.response.answers
        .map((a) => {
          const valStr =
            a.value === true ? "Đúng" : a.value === false ? "Sai" : "(Chưa chọn)";
          return `<li>Ý <code>${escapeHtml(a.statementId)}</code>: <strong>${valStr}</strong></li>`;
        })
        .join("");
      responseHtml = `<div class="response-line">Câu trả lời các ý:<ul class="statement-response-list">${ansList}</ul></div>`;
    } else if (q.response.kind === "III") {
      const raw = q.response.raw;
      responseHtml = `<div class="response-line">Câu trả lời nhập: <strong class="raw-response">${
        raw !== null ? escapeHtml(raw) : "(Chưa trả lời)"
      }</strong></div>`;
    }

    // Release-gated answer key and explanation
    let releaseHtml = "";
    if (model.released) {
      const relQ = q as ReleasedReportQuestion;
      let ansStr = "";
      if (typeof relQ.answer === "string") {
        ansStr = `<strong class="raw-key"><code>${escapeHtml(relQ.answer)}</code></strong>`;
      } else if (Array.isArray(relQ.answer)) {
        ansStr =
          '<ul class="statement-answer-list">' +
          relQ.answer
            .map(
              (st) =>
                `<li>Ý <code>${escapeHtml(st.statementId)}</code>: <strong>${
                  st.answer ? "Đúng" : "Sai"
                }</strong></li>`
            )
            .join("") +
          "</ul>";
      }

      let expHtml = "";
      if (relQ.explanation && relQ.explanation.length > 0) {
        const expBlocks = relQ.explanation
          .map((eb) => renderBlock(eb, assetMap))
          .join("");
        expHtml = `<div class="explanation-box"><h4>Lời giải chi tiết:</h4><div class="explanation-content">${expBlocks}</div></div>`;
      }

      releaseHtml = `
        <div class="answer-key-box">
          <div class="key-line">Đáp án chuẩn: ${ansStr}</div>
          ${expHtml}
        </div>
      `;
    } else {
      // Pre-release: strictly NO keys, NO explanations, NO timed-reveal scripts
      releaseHtml = `
        <div class="unreleased-notice">
          <span class="notice-icon" aria-hidden="true">&#128274;</span>
          <div class="notice-body">
            <strong>Đáp án và lời giải chi tiết chưa công bố</strong>
            <p>Đáp án và lời giải chưa công bố (chờ sau thời hạn nộp bài). Thí sinh vui lòng tải lại bản báo cáo mới sau thời điểm công bố để xem đáp án chuẩn.</p>
          </div>
        </div>
      `;
    }

    questionsHtml += `
      <section class="question-card" id="q-${escapeHtml(q.questionVersionId)}">
        <header class="question-header">
          <div class="q-title-group">
            <span class="q-index">Câu ${i + 1}</span>
            <span class="q-kind">Phần ${escapeHtml(q.kind)}</span>
            <h3 class="q-title">${escapeHtml(q.title)}</h3>
          </div>
          <div class="q-score-group">
            ${statusLabel(q.status)}
            <span class="q-points">${escapeHtml(q.points)} / ${escapeHtml(
      q.maxPoints
    )} điểm</span>
          </div>
        </header>
        <div class="question-body">
          <div class="blocks-container">${blocksHtml}</div>
          <div class="student-response-box">${responseHtml}</div>
          ${releaseHtml}
        </div>
      </section>
    `;
  }

  // Render optional history table
  let historyHtml = "";
  if (options?.history && options.history.length > 0) {
    const currentId = options.currentAttemptId ?? model.attempt.attemptId;
    let rowsHtml = "";
    let index = 1;
    for (const hItem of options.history) {
      const entry = normalizeHistoryEntry(hItem, policy);
      if (!entry) continue;

      const isCurrent = entry.attemptId === currentId;
      const rowClass = isCurrent ? ' class="current-attempt"' : "";
      const syncBadge = entry.serverConfirmed
        ? '<span class="sync-badge sync-confirmed">Đã đồng bộ</span>'
        : '<span class="sync-badge sync-local">Lưu cục bộ</span>';

      rowsHtml += `
        <tr${rowClass} data-attempt-id="${escapeHtml(entry.attemptId)}">
          <td>#${index++}</td>
          <td>${escapeHtml(entry.submittedAt)}</td>
          <td>${escapeHtml(entry.candidateName)}</td>
          <td>${escapeHtml(entry.scoreI)}</td>
          <td>${escapeHtml(entry.scoreII)}</td>
          <td>${escapeHtml(entry.scoreIII)}</td>
          <td><strong>${escapeHtml(entry.total)} / ${escapeHtml(entry.maxTotal)}</strong></td>
          <td>${syncBadge}</td>
        </tr>
      `;
    }

    if (rowsHtml.trim() !== "") {
      historyHtml = `
        <section class="history-section">
          <h2>Lịch Sử Các Lần Làm Bài</h2>
          <div class="history-table-wrapper">
            <table class="history-table">
              <thead>
                <tr>
                  <th>Lượt</th>
                  <th>Thời Điểm Nộp</th>
                  <th>Thí Sinh</th>
                  <th>Phần I</th>
                  <th>Phần II</th>
                  <th>Phần III</th>
                  <th>Tổng Điểm</th>
                  <th>Trạng Thái</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </section>
      `;
    }
  }

  const pageTitle =
    options?.title ?? `Báo cáo kết quả — ${escapeHtml(model.candidateName)}`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="generator" content="Cunata Offline Report Generator v1.0 (Self-contained HTML; native browser print-to-PDF ready)" />
  <title>${pageTitle}</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --primary: #2563eb;
      --primary-hover: #1d4ed8;
      --success: #16a34a;
      --warning: #d97706;
      --danger: #dc2626;
      --code-bg: #f1f5f9;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 1.5rem;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    header.report-header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    h1.report-title {
      font-size: 1.5rem;
      color: var(--primary);
      margin-bottom: 0.35rem;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .report-badge-offline {
      display: block;
      text-align: center;
      font-size: 0.8rem;
      color: var(--muted);
      margin-bottom: 1rem;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      font-size: 0.95rem;
    }
    .meta-item strong { color: var(--text); }
    .meta-item span { color: var(--muted); }
    .scores-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      border-top: 1px solid var(--border);
      padding-top: 1.25rem;
    }
    .score-card {
      background: #f1f5f9;
      border-radius: 6px;
      padding: 0.75rem;
      text-align: center;
    }
    .score-card.total {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
    }
    .score-card .label { font-size: 0.85rem; color: var(--muted); font-weight: 600; text-transform: uppercase; }
    .score-card .val { font-size: 1.5rem; font-weight: 700; color: var(--primary); margin-top: 0.25rem; }
    .score-card.total .val { color: #1d4ed8; font-size: 1.75rem; }
    .actions-bar {
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .print-instruction {
      font-size: 0.85rem;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.5rem 0.75rem;
      flex: 1;
    }
    .btn-print {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 0.6rem 1.35rem;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .btn-print:hover { background: var(--primary-hover); }
    .question-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-bottom: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .question-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.75rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .q-title-group { display: flex; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
    .q-index { font-weight: 700; color: var(--primary); }
    .q-kind { background: #e2e8f0; color: #475569; font-size: 0.75rem; padding: 0.15rem 0.4rem; border-radius: 4px; font-weight: 600; }
    .q-title { font-size: 1.05rem; font-weight: 600; }
    .q-score-group { display: flex; align-items: center; gap: 0.75rem; }
    .q-points { font-weight: 700; font-size: 0.95rem; }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .badge-full { background: #dcfce7; color: var(--success); }
    .badge-partial { background: #fef3c7; color: var(--warning); }
    .badge-wrong { background: #fee2e2; color: var(--danger); }
    .badge-invalid { background: #f3e8ff; color: #9333ea; }
    .badge-unanswered { background: #f1f5f9; color: var(--muted); }
    .blocks-container { margin-bottom: 0.75rem; }
    .block-text { margin-bottom: 0.5rem; }
    .block-image { margin: 0.75rem 0; text-align: center; }
    .block-image img { max-width: 100%; height: auto; border-radius: 4px; border: 1px solid var(--border); }
    .image-caption { font-size: 0.8rem; color: var(--muted); margin-top: 0.25rem; font-style: italic; }
    .block-asset-missing {
      background: #fff7ed;
      border: 1px dashed #fdba74;
      color: #c2410c;
      padding: 0.6rem 0.85rem;
      border-radius: 6px;
      margin: 0.5rem 0;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .asset-missing-icon { font-size: 1.1rem; }
    .block-math {
      background: #f8fafc;
      border: 1px dashed var(--border);
      padding: 0.6rem;
      border-radius: 4px;
      font-family: Consolas, Monaco, "Courier New", monospace;
      overflow-x: auto;
      margin: 0.5rem 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .math-format-badge {
      background: #e2e8f0;
      color: #334155;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.15rem 0.35rem;
      border-radius: 3px;
      text-transform: uppercase;
    }
    .math-verified-badge { color: #16a34a; font-weight: 700; }
    .math-source { font-size: 0.95rem; color: #0f172a; }
    .block-table { margin: 0.75rem 0; overflow-x: auto; }
    .block-table table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .block-table td { border: 1px solid var(--border); padding: 0.5rem 0.75rem; }
    .student-response-box {
      background: #f8fafc;
      border-left: 3px solid var(--primary);
      padding: 0.6rem 0.75rem;
      border-radius: 0 4px 4px 0;
      margin-bottom: 0.75rem;
      font-size: 0.95rem;
    }
    .raw-response { font-family: Consolas, Monaco, "Courier New", monospace; font-size: 1.05rem; }
    .statement-response-list { margin-left: 1.25rem; margin-top: 0.35rem; }
    .answer-key-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 0.75rem;
      font-size: 0.95rem;
    }
    .key-line { font-weight: 600; color: #15803d; margin-bottom: 0.4rem; }
    .raw-key { font-family: Consolas, Monaco, "Courier New", monospace; }
    .statement-answer-list { margin-left: 1.25rem; margin-top: 0.35rem; }
    .explanation-box { margin-top: 0.5rem; border-top: 1px dashed #bbf7d0; padding-top: 0.5rem; color: #166534; }
    .explanation-box h4 { font-size: 0.9rem; margin-bottom: 0.25rem; font-weight: 700; }
    .unreleased-notice {
      background: #fffbeb;
      border: 1px dashed #fde68a;
      color: #92400e;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      font-size: 0.9rem;
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
    }
    .notice-icon { font-size: 1.2rem; }
    .notice-body strong { display: block; margin-bottom: 0.2rem; }
    .history-section {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
      margin-top: 1.5rem;
      margin-bottom: 1.5rem;
    }
    .history-section h2 {
      font-size: 1.15rem;
      color: var(--text);
      margin-bottom: 0.75rem;
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.4rem;
    }
    .history-table-wrapper { overflow-x: auto; }
    .history-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .history-table th, .history-table td { border: 1px solid var(--border); padding: 0.45rem 0.6rem; text-align: left; }
    .history-table th { background: #f1f5f9; font-weight: 600; }
    .history-table tr.current-attempt { background: #eff6ff; font-weight: 600; }
    .sync-badge {
      font-size: 0.7rem;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      font-weight: 600;
    }
    .sync-confirmed { background: #dcfce7; color: #15803d; }
    .sync-local { background: #e0f2fe; color: #0369a1; }
    .report-footer {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      text-align: center;
      font-size: 0.8rem;
      color: var(--muted);
    }

    /* Embedded Print Stylesheet conforming to print.css and WEB-contract §5, §9 */
    @media print {
      @page {
        size: A4 portrait;
        margin: 15mm 15mm 20mm 15mm;
      }
      *, *::before, *::after {
        background: transparent !important;
        color: #000000 !important;
        box-shadow: none !important;
        text-shadow: none !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #111827 !important;
        font-size: 10pt;
        line-height: 1.45;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      .no-print, .actions-bar, .btn-print, .print-instruction {
        display: none !important;
        visibility: hidden !important;
      }
      .container { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
      header.report-header {
        border-bottom: 2pt solid #000000 !important;
        padding-bottom: 8pt !important;
        margin-bottom: 12pt !important;
        break-after: avoid;
        page-break-after: avoid;
        box-shadow: none !important;
        border-radius: 0 !important;
      }
      .report-title {
        font-size: 16pt !important;
        font-weight: 700 !important;
        text-align: center !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        margin-bottom: 4pt !important;
        color: #000000 !important;
      }
      .meta-grid {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 6pt !important;
        font-size: 8.5pt !important;
        border: 1pt solid #d1d5db !important;
        padding: 6pt !important;
        margin-bottom: 10pt !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .scores-summary {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 6pt !important;
        margin-bottom: 14pt !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .score-card {
        border: 1.5pt solid #1f2937 !important;
        border-radius: 4pt !important;
        padding: 6pt !important;
        text-align: center !important;
        background: #ffffff !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .score-card.total {
        border: 2pt solid #000000 !important;
        background: #f9fafb !important;
      }
      .score-card .val {
        font-size: 13pt !important;
        font-weight: 800 !important;
        color: #000000 !important;
      }
      .question-card {
        border: 1pt solid #9ca3af !important;
        border-radius: 4pt !important;
        padding: 8pt !important;
        margin-bottom: 10pt !important;
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        background: #ffffff !important;
        box-shadow: none !important;
      }
      .question-header {
        border-bottom: 1pt solid #e5e7eb !important;
        padding-bottom: 4pt !important;
        margin-bottom: 6pt !important;
        break-after: avoid;
        page-break-after: avoid;
      }
      .badge {
        border: 1pt solid #000000 !important;
        padding: 1pt 4pt !important;
        font-size: 7.5pt !important;
        font-weight: 700 !important;
        border-radius: 3pt !important;
        display: inline-block !important;
        text-transform: uppercase !important;
      }
      .student-response-box {
        border-left: 2pt solid #4b5563 !important;
        padding: 4pt 6pt !important;
        margin: 4pt 0 !important;
        background: #f9fafb !important;
        font-size: 8.5pt !important;
      }
      .answer-key-box {
        border: 1.5pt solid #15803d !important;
        border-radius: 3pt !important;
        padding: 4pt 6pt !important;
        margin-top: 6pt !important;
        font-size: 8.5pt !important;
        background: #f0fdf4 !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .unreleased-notice {
        border: 1pt dashed #d97706 !important;
        border-radius: 3pt !important;
        padding: 4pt 6pt !important;
        margin-top: 6pt !important;
        font-style: italic !important;
        font-size: 8pt !important;
        color: #92400e !important;
        background: #fffbeb !important;
      }
      .block-table table, .history-table {
        width: 100% !important;
        border-collapse: collapse !important;
        margin: 6pt 0 !important;
        font-size: 8pt !important;
      }
      .block-table td, .history-table th, .history-table td {
        border: 0.75pt solid #9ca3af !important;
        padding: 3pt 5pt !important;
      }
      tr { break-inside: avoid; page-break-inside: avoid; }
      img { max-width: 85% !important; height: auto !important; break-inside: avoid; page-break-inside: avoid; }
      .report-footer { font-size: 7.5pt !important; border-top: 1pt solid #999 !important; margin-top: 10pt !important; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="actions-bar no-print">
      <div class="print-instruction">
        <strong>In hoặc lưu PDF:</strong> Nhấn "In báo cáo" (hoặc Ctrl+P), chọn "Lưu dưới dạng PDF" (Save as PDF) trong hộp thoại in trình duyệt.
      </div>
      <button type="button" class="btn-print" onclick="window.print()">
        <span aria-hidden="true">&#128438;</span> In báo cáo
      </button>
    </div>
    <header class="report-header">
      <h1 class="report-title">Báo Cáo Kết Quả Bài Làm</h1>
      <span class="report-badge-offline">Tài liệu báo cáo độc lập (Offline Self-contained Report)</span>
      <div class="meta-grid">
        <div class="meta-item"><span>Thí sinh:</span> <strong>${escapeHtml(model.candidateName)}</strong></div>
        <div class="meta-item"><span>Mã bài làm:</span> <strong>${escapeHtml(model.attempt.attemptId)}</strong></div>
        <div class="meta-item"><span>Đề thi:</span> <strong>${escapeHtml(model.attempt.examId)} (${escapeHtml(model.attempt.examVersionId)})</strong></div>
        <div class="meta-item"><span>Thời điểm bắt đầu:</span> <strong>${escapeHtml(startDate)}</strong></div>
        <div class="meta-item"><span>Thời điểm nộp bài:</span> <strong>${escapeHtml(submitDate)}</strong></div>
        <div class="meta-item"><span>Thời gian làm bài:</span> <strong>${escapeHtml(durationStr)}</strong></div>
      </div>
      <div class="scores-summary">
        <div class="score-card total">
          <div class="label">Tổng Điểm</div>
          <div class="val">${escapeHtml(formattedTotal.score)} / ${escapeHtml(formattedTotal.max)}</div>
        </div>
        <div class="score-card">
          <div class="label">Phần I</div>
          <div class="val">${escapeHtml(formattedI.score)} / ${escapeHtml(formattedI.max)}</div>
        </div>
        <div class="score-card">
          <div class="label">Phần II</div>
          <div class="val">${escapeHtml(formattedII.score)} / ${escapeHtml(formattedII.max)}</div>
        </div>
        <div class="score-card">
          <div class="label">Phần III</div>
          <div class="val">${escapeHtml(formattedIII.score)} / ${escapeHtml(formattedIII.max)}</div>
        </div>
      </div>
    </header>
    <main class="questions-list">
      ${questionsHtml}
    </main>
    ${historyHtml}
    <footer class="report-footer">
      <p>Báo cáo được khởi tạo tự động bởi hệ thống Cunata Web. Tệp HTML độc lập hỗ trợ mở trực tiếp ngoại tuyến (offline) trên mọi trình duyệt mà không cần kết nối mạng. Tính năng lưu PDF sử dụng hộp thoại in của trình duyệt; hệ thống không tạo tệp PDF lập trình phía máy chủ.</p>
    </footer>
  </div>
</body>
</html>`;
}

export function downloadReport(
  model: ReportModel,
  options?: DownloadReportOptions
): Blob {
  const html = renderReportHtml(model, options);
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

export function inspectDownloadBytes(
  input: Uint8Array | ArrayBuffer | string,
  options?: {
    expectedScores?: readonly string[];
    forbiddenKeys?: readonly string[];
  }
): DownloadByteInspection {
  let text: string;
  let bytes: Uint8Array;
  if (typeof input === "string") {
    text = input;
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
    text = new TextDecoder("utf-8").decode(input);
  } else {
    bytes = new Uint8Array(input);
    text = new TextDecoder("utf-8").decode(bytes);
  }

  // 1. Verify UTF-8 validity
  let isUtf8 = true;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    decoder.decode(bytes);
  } catch {
    isUtf8 = false;
  }

  // 2. Check for external requests (http:, https:, //, @import)
  const externalUrlsFound: string[] = [];
  const externalPattern = /(?:href|src|url)\s*=\s*["'](https?:\/\/[^"']+|\/\/[^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = externalPattern.exec(text)) !== null) {
    if (match[1]) externalUrlsFound.push(match[1]);
  }

  const importPattern = /@import\s+(?:url\(['"]?(https?:\/\/[^"')]+)['"]?\)|['"](https?:\/\/[^'"]+)['"])/gi;
  while ((match = importPattern.exec(text)) !== null) {
    const found = match[1] || match[2];
    if (found) externalUrlsFound.push(found);
  }

  // 3. Hostile script check (unencoded <script, unencoded event handlers, unencoded javascript:)
  const hostileMatchesFound: string[] = [];
  const hostilePatterns = [
    /<script\b[^>]*>([\s\S]*?)<\/script>/gi,
    /<[a-z0-9]+\b[^>]*\bon[a-z]+\s*=[^>]*>/gi,
    /href\s*=\s*["']javascript:[^"']*["']/gi,
    /src\s*=\s*["']javascript:[^"']*["']/gi,
  ];

  for (const pat of hostilePatterns) {
    let hMatch: RegExpExecArray | null;
    while ((hMatch = pat.exec(text)) !== null) {
      if (hMatch[0].includes('onclick="window.print()"')) {
        continue;
      }
      hostileMatchesFound.push(hMatch[0]);
    }
  }

  // 4. Forbidden unreleased keys check
  const unreleasedKeysFound: string[] = [];
  if (options?.forbiddenKeys) {
    for (const key of options.forbiddenKeys) {
      if (key && text.includes(key)) {
        unreleasedKeysFound.push(key);
      }
    }
  }

  // 5. Missing asset placeholders check
  const missingAssetPlaceholdersFound: string[] = [];
  const missingAssetPattern = /class="block-asset-missing"[^>]*data-asset-id="([^"]+)"/gi;
  let maMatch: RegExpExecArray | null;
  while ((maMatch = missingAssetPattern.exec(text)) !== null) {
    if (maMatch[1]) missingAssetPlaceholdersFound.push(maMatch[1]);
  }

  // 6. Check expected exact scores
  let exactScoresPreserved = true;
  if (options?.expectedScores) {
    for (const score of options.expectedScores) {
      if (!text.includes(score)) {
        exactScoresPreserved = false;
        break;
      }
    }
  }

  // 7. History table check
  const historyTableRendered = text.includes('class="history-table"');

  return {
    totalBytes: bytes.byteLength,
    isUtf8,
    hasExternalRequests: externalUrlsFound.length > 0,
    externalUrlsFound,
    hasHostileScripts: hostileMatchesFound.length > 0,
    hostileMatchesFound,
    hasUnreleasedKeys: unreleasedKeysFound.length > 0,
    unreleasedKeysFound,
    hasMissingAssets: missingAssetPlaceholdersFound.length > 0,
    missingAssetPlaceholdersFound,
    exactScoresPreserved,
    historyTableRendered,
  };
}
