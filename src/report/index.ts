/// <reference lib="dom" />

import type {
  ExamVersion,
  Question,
  Response,
  AttemptResponses,
  ScoreResult,
  Rational,
} from "../domain/index.ts";
import {
  ZERO,
  scoreAttempt,
  scoreResultToDTO,
  scoreResultFromDTO,
  toFractionString,
  toDecimalString,
  equals,
} from "../domain/index.ts";
import type {
  Section,
  ReleasePolicy,
  Block,
  Cell,
  Asset,
  AttemptKey,
  AttemptRecord,
  WebExam,
  WebQuestion,
  WebError,
  Result,
  ReportQuestion,
  ReleasedReportQuestion,
  ReportBase,
  ReportModel,
  DisplayPolicy,
  BuildReportOptions,
  RenderHtmlOptions,
} from "./types.ts";

export type {
  Section,
  ReleasePolicy,
  Block,
  Cell,
  Asset,
  AttemptKey,
  AttemptRecord,
  WebExam,
  WebQuestion,
  WebError,
  Result,
  ReportQuestion,
  ReleasedReportQuestion,
  ReportBase,
  ReportModel,
  DisplayPolicy,
  BuildReportOptions,
  RenderHtmlOptions,
};

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

export function buildReport(
  final: AttemptRecord,
  now: number,
  options?: BuildReportOptions
): Result<ReportModel> {
  if (final.phase !== "final" || final.submittedAt === null) {
    return {
      ok: false,
      error: {
        code: "ATTEMPT_NOT_FINAL",
        path: "phase",
        message: "Bài làm chưa hoàn tất nộp bài không thể tạo báo cáo kết quả.",
        recoverable: true,
      },
    };
  }

  // Construct domain exam from snapshot for deterministic recomputation
  const domainQuestions: Question[] = final.examSnapshot.questions.map((q) => {
    if (q.kind === "I") {
      return {
        kind: "I",
        questionVersionId: q.questionVersionId,
        options: q.options.map((o) => ({ optionId: o.optionId })),
        correctOptionId: q.correctOptionId,
      };
    } else if (q.kind === "II") {
      return {
        kind: "II",
        questionVersionId: q.questionVersionId,
        statements: q.statements.map((s) => ({
          statementId: s.statementId,
          answer: s.answer,
        })),
      };
    } else {
      return {
        kind: "III",
        questionVersionId: q.questionVersionId,
        answerKey: q.answerKey,
      };
    }
  });

  const domainExam: ExamVersion = {
    examId: final.examSnapshot.examId,
    examVersionId: final.examSnapshot.examVersionId,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions: domainQuestions,
  };

  let recomputedScore: ScoreResult;
  try {
    recomputedScore = scoreAttempt(domainExam, final.responses);
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "SCORING_ERROR",
        path: "responses",
        message: err instanceof Error ? err.message : "Lỗi chấm điểm từ domain engine.",
        recoverable: false,
      },
    };
  }

  const recomputedDTO = scoreResultToDTO(recomputedScore);

  // If a stored scoreDTO exists, strictly verify it against the recomputed result
  if (final.scoreDTO !== null && final.scoreDTO !== undefined) {
    let storedParsed: ScoreResult;
    try {
      storedParsed = scoreResultFromDTO(final.scoreDTO);
    } catch {
      return {
        ok: false,
        error: {
          code: "SCORE_MISMATCH",
          path: "scoreDTO",
          message: "Điểm lưu trữ không đúng định dạng DTO hợp lệ.",
          recoverable: false,
        },
      };
    }

    if (
      !equals(storedParsed.total, recomputedScore.total) ||
      !equals(storedParsed.maxTotal, recomputedScore.maxTotal) ||
      !equals(storedParsed.sections.I.score, recomputedScore.sections.I.score) ||
      !equals(storedParsed.sections.I.max, recomputedScore.sections.I.max) ||
      !equals(storedParsed.sections.II.score, recomputedScore.sections.II.score) ||
      !equals(storedParsed.sections.II.max, recomputedScore.sections.II.max) ||
      !equals(storedParsed.sections.III.score, recomputedScore.sections.III.score) ||
      !equals(storedParsed.sections.III.max, recomputedScore.sections.III.max) ||
      storedParsed.questions.length !== recomputedScore.questions.length
    ) {
      return {
        ok: false,
        error: {
          code: "SCORE_MISMATCH",
          path: "scoreDTO",
          message: "Điểm lưu trữ không khớp với kết quả tính toán lại từ domain.",
          recoverable: false,
        },
      };
    }

    for (let i = 0; i < storedParsed.questions.length; i++) {
      const sq = storedParsed.questions[i]!;
      const rq = recomputedScore.questions[i]!;
      if (
        sq.questionVersionId !== rq.questionVersionId ||
        sq.kind !== rq.kind ||
        sq.status !== rq.status ||
        !equals(sq.points, rq.points) ||
        !equals(sq.maxPoints, rq.maxPoints)
      ) {
        return {
          ok: false,
          error: {
            code: "SCORE_MISMATCH",
            path: `scoreDTO.questions[${i}]`,
            message: "Điểm câu hỏi lưu trữ không khớp với kết quả tính toán lại.",
            recoverable: false,
          },
        };
      }
    }
  }

  // Determine answer/explanation release status
  const releasePolicy: ReleasePolicy = final.examSnapshot.settings?.releasePolicy ?? "immediate";
  const released = releasePolicy === "immediate" || now >= final.deadline;

  const questionResultMap = new Map<string, (typeof recomputedScore.questions)[number]>(
    recomputedScore.questions.map((qr) => [qr.questionVersionId, qr])
  );
  const responseMap = new Map<string, Response>(
    final.responses.responses.map((resp) => [resp.questionVersionId, resp])
  );

  const snapshotQuestions = final.examSnapshot.questions;
  const qMap = new Map<string, WebQuestion>(snapshotQuestions.map((q) => [q.questionVersionId, q]));

  const orderedQuestions: WebQuestion[] = [];
  if (final.presentationOrder?.questionOrder?.length) {
    for (const qId of final.presentationOrder.questionOrder) {
      const q = qMap.get(qId);
      if (q) orderedQuestions.push(q);
    }
    for (const q of snapshotQuestions) {
      if (!orderedQuestions.some((oq) => oq.questionVersionId === q.questionVersionId)) {
        orderedQuestions.push(q);
      }
    }
  } else {
    orderedQuestions.push(...snapshotQuestions);
  }

  const formatPoints = (r: Rational, maxR: Rational): { points: string; maxPoints: string } => {
    if (options?.displayPolicy && typeof options.displayPolicy === "object") {
      if (options.displayPolicy.mode === "decimal") {
        return {
          points: toDecimalString(r, options.displayPolicy.fractionDigits, "half-up"),
          maxPoints: toDecimalString(maxR, options.displayPolicy.fractionDigits, "half-up"),
        };
      } else if (options.displayPolicy.mode === "custom") {
        return {
          points: options.displayPolicy.format(r, maxR),
          maxPoints: toFractionString(maxR),
        };
      }
    }
    return {
      points: toFractionString(r),
      maxPoints: toFractionString(maxR),
    };
  };

  const reportQuestions: (ReportQuestion | ReleasedReportQuestion)[] = [];

  for (const q of orderedQuestions) {
    const qRes = questionResultMap.get(q.questionVersionId);
    const resp = responseMap.get(q.questionVersionId) ?? null;
    const { points, maxPoints } = formatPoints(
      qRes ? qRes.points : ZERO,
      qRes ? qRes.maxPoints : ZERO
    );
    const status = qRes ? qRes.status : "unanswered";

    let blocks: readonly Block[];
    if (q.blocks && q.blocks.length > 0) {
      blocks = q.blocks;
    } else {
      const bList: Block[] = [];
      if (q.content) {
        bList.push({ type: "text", text: q.content });
      }
      if (q.image) {
        bList.push({ type: "image", assetId: q.image, alt: q.title ?? "" });
      }
      blocks = bList;
    }

    const baseQ: ReportQuestion = {
      questionVersionId: q.questionVersionId,
      kind: q.kind,
      title: q.title ?? q.questionVersionId,
      blocks: Object.freeze(blocks),
      response: resp ? Object.freeze({ ...resp }) : null,
      status,
      points,
      maxPoints,
    };

    if (!released) {
      // Unreleased projection: strict exclusion of answer and explanation
      reportQuestions.push(Object.freeze(baseQ));
    } else {
      // Released projection: includes correct answer key and explanation blocks
      let answer: string | readonly { readonly statementId: string; readonly answer: boolean }[];
      if (q.kind === "I") {
        answer = q.correctOptionId;
      } else if (q.kind === "II") {
        answer = Object.freeze(
          q.statements.map((s) =>
            Object.freeze({
              statementId: s.statementId,
              answer: s.answer,
            })
          )
        );
      } else {
        answer = q.answerKey;
      }

      const expBlocks: Block[] = [];
      if (q.explanation) {
        expBlocks.push({ type: "text", text: q.explanation });
      }
      if (q.kind === "II") {
        for (const st of q.statements) {
          if (st.explanation) {
            expBlocks.push({
              type: "text",
              text: `${st.label ?? st.statementId}: ${st.explanation}`,
            });
          }
        }
      }

      const relQ: ReleasedReportQuestion = {
        ...baseQ,
        answer,
        explanation: Object.freeze(expBlocks),
      };
      reportQuestions.push(Object.freeze(relQ));
    }
  }

  const reportBase: ReportBase = {
    attempt: {
      examId: final.examId,
      examVersionId: final.examVersionId,
      attemptId: final.attemptId,
    },
    candidateName: final.candidateName,
    startedAt: final.startedAt,
    submittedAt: final.submittedAt,
    scoreDTO: recomputedDTO,
    assets: final.examSnapshot.assets ?? [],
  };

  let model: ReportModel;
  if (released) {
    model = Object.freeze({
      ...reportBase,
      released: true,
      questions: Object.freeze(reportQuestions as ReleasedReportQuestion[]),
    });
  } else {
    model = Object.freeze({
      ...reportBase,
      released: false,
      questions: Object.freeze(reportQuestions as ReportQuestion[]),
    });
  }

  return { ok: true, value: model };
}

export function renderReportHtml(model: ReportModel, options?: RenderHtmlOptions): string {
  const assetMap = new Map<string, string>();
  for (const asset of model.assets) {
    let src = asset.data;
    if (!src.startsWith("data:") && asset.mime) {
      src = `data:${asset.mime};base64,${asset.data}`;
    }
    assetMap.set(asset.assetId, sanitizeUrl(src));
  }

  function renderBlock(b: Block): string {
    if (b.type === "text") {
      return `<p class="block-text">${escapeHtml(b.text)}</p>`;
    }
    if (b.type === "image") {
      const src = assetMap.get(b.assetId) ?? sanitizeUrl(b.assetId);
      return `<figure class="block-image"><img src="${escapeHtml(src)}" alt="${escapeHtml(b.alt)}" /></figure>`;
    }
    if (b.type === "math") {
      return `<div class="block-math" data-format="${escapeHtml(b.format)}"><code>${escapeHtml(b.source)}</code></div>`;
    }
    if (b.type === "table") {
      let rowsHtml = "";
      for (const row of b.rows) {
        rowsHtml += "<tr>";
        for (const cell of row) {
          const content = cell.blocks.map(renderBlock).join("");
          const rSpan = cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : "";
          const cSpan = cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : "";
          rowsHtml += `<td${rSpan}${cSpan}>${content}</td>`;
        }
        rowsHtml += "</tr>";
      }
      return `<div class="block-table"><table><tbody>${rowsHtml}</tbody></table></div>`;
    }
    return "";
  }

  const dto = model.scoreDTO as {
    total: string;
    maxTotal: string;
    sections: {
      I: { score: string; max: string; questionCount: number };
      II: { score: string; max: string; questionCount: number };
      III: { score: string; max: string; questionCount: number };
    };
  };

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
    const blocksHtml = q.blocks.map(renderBlock).join("");

    // Render student response
    let responseHtml = "";
    if (!q.response) {
      responseHtml = `<div class="response-line"><em>(Chưa trả lời)</em></div>`;
    } else if (q.response.kind === "I") {
      const selected = q.response.selectedOptionId;
      responseHtml = `<div class="response-line">Lựa chọn của thí sinh: <strong>${selected ? escapeHtml(selected) : "(Chưa chọn)"}</strong></div>`;
    } else if (q.response.kind === "II") {
      const ansList = q.response.answers
        .map((a) => {
          const valStr = a.value === true ? "Đúng" : a.value === false ? "Sai" : "(Chưa chọn)";
          return `<li>Ý <code>${escapeHtml(a.statementId)}</code>: <strong>${valStr}</strong></li>`;
        })
        .join("");
      responseHtml = `<div class="response-line">Câu trả lời các ý:<ul>${ansList}</ul></div>`;
    } else if (q.response.kind === "III") {
      const raw = q.response.raw;
      responseHtml = `<div class="response-line">Câu trả lời nhập: <strong class="raw-response">${raw !== null ? escapeHtml(raw) : "(Chưa trả lời)"}</strong></div>`;
    }

    // Release-gated answer key and explanation
    let releaseHtml = "";
    if (model.released) {
      const relQ = q as ReleasedReportQuestion;
      let ansStr = "";
      if (typeof relQ.answer === "string") {
        ansStr = `<code>${escapeHtml(relQ.answer)}</code>`;
      } else if (Array.isArray(relQ.answer)) {
        ansStr =
          "<ul>" +
          relQ.answer
            .map((st) => `<li>Ý <code>${escapeHtml(st.statementId)}</code>: <strong>${st.answer ? "Đúng" : "Sai"}</strong></li>`)
            .join("") +
          "</ul>";
      }

      let expHtml = "";
      if (relQ.explanation && relQ.explanation.length > 0) {
        expHtml = `<div class="explanation-box"><h4>Lời giải chi tiết:</h4>${relQ.explanation.map(renderBlock).join("")}</div>`;
      }

      releaseHtml = `
        <div class="answer-key-box">
          <div class="key-line">Đáp án chuẩn: ${ansStr}</div>
          ${expHtml}
        </div>
      `;
    } else {
      releaseHtml = `<div class="unreleased-notice">Đáp án và lời giải chưa công bố (chờ sau thời hạn nộp bài).</div>`;
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
            <span class="q-points">${escapeHtml(q.points)} / ${escapeHtml(q.maxPoints)} điểm</span>
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

  const pageTitle = options?.title ?? `Báo cáo kết quả — ${escapeHtml(model.candidateName)}`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageTitle}</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --primary: #2563eb;
      --success: #16a34a;
      --warning: #d97706;
      --danger: #dc2626;
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
      margin-bottom: 1rem;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.05em;
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
      justify-content: flex-end;
    }
    .btn-print {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 0.5rem 1.25rem;
      border-radius: 6px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-print:hover { background: #1d4ed8; }
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
    .block-image img { max-width: 100%; height: auto; border-radius: 4px; margin: 0.5rem 0; }
    .block-math { background: #f8fafc; border: 1px dashed var(--border); padding: 0.5rem; border-radius: 4px; font-family: monospace; overflow-x: auto; margin: 0.5rem 0; }
    .block-table table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.9rem; }
    .block-table td { border: 1px solid var(--border); padding: 0.4rem 0.6rem; }
    .student-response-box {
      background: #f8fafc;
      border-left: 3px solid var(--primary);
      padding: 0.6rem 0.75rem;
      border-radius: 0 4px 4px 0;
      margin-bottom: 0.75rem;
      font-size: 0.95rem;
    }
    .raw-response { font-family: monospace; font-size: 1.05rem; }
    .answer-key-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 0.75rem;
      font-size: 0.95rem;
    }
    .key-line { font-weight: 600; color: #15803d; margin-bottom: 0.4rem; }
    .explanation-box { margin-top: 0.5rem; border-top: 1px dashed #bbf7d0; padding-top: 0.5rem; color: #166534; }
    .explanation-box h4 { font-size: 0.9rem; margin-bottom: 0.25rem; }
    .unreleased-notice {
      background: #fffbeb;
      border: 1px dashed #fde68a;
      color: #92400e;
      padding: 0.5rem 0.75rem;
      border-radius: 4px;
      font-size: 0.85rem;
      font-style: italic;
    }
    @media print {
      body { background: #fff; color: #000; padding: 0; font-size: 11pt; }
      .container { max-width: 100%; }
      .no-print { display: none !important; }
      header.report-header { box-shadow: none; border-bottom: 2px solid #000; border-radius: 0; }
      .question-card { box-shadow: none; border: 1px solid #999; page-break-inside: avoid; break-inside: avoid; }
      .score-card { background: #fff; border: 1px solid #ccc; }
      .btn-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="actions-bar no-print">
      <button class="btn-print" onclick="window.print()">In báo cáo</button>
    </div>
    <header class="report-header">
      <h1 class="report-title">Báo Cáo Kết Quả Bài Làm</h1>
      <div class="meta-grid">
        <div class="meta-item"><span>Thí sinh:</span> <strong>${escapeHtml(model.candidateName)}</strong></div>
        <div class="meta-item"><span>Mã bài làm:</span> <strong>${escapeHtml(model.attempt.attemptId)}</strong></div>
        <div class="meta-item"><span>Đề thi:</span> <strong>${escapeHtml(model.attempt.examId)} (${escapeHtml(model.attempt.examVersionId)})</strong></div>
        <div class="meta-item"><span>Bắt đầu:</span> <strong>${escapeHtml(startDate)}</strong></div>
        <div class="meta-item"><span>Nộp bài:</span> <strong>${escapeHtml(submitDate)}</strong></div>
        <div class="meta-item"><span>Thời gian làm:</span> <strong>${escapeHtml(durationStr)}</strong></div>
      </div>
      <div class="scores-summary">
        <div class="score-card total">
          <div class="label">Tổng Điểm</div>
          <div class="val">${escapeHtml(dto.total)} / ${escapeHtml(dto.maxTotal)}</div>
        </div>
        <div class="score-card">
          <div class="label">Phần I</div>
          <div class="val">${escapeHtml(dto.sections.I.score)} / ${escapeHtml(dto.sections.I.max)}</div>
        </div>
        <div class="score-card">
          <div class="label">Phần II</div>
          <div class="val">${escapeHtml(dto.sections.II.score)} / ${escapeHtml(dto.sections.II.max)}</div>
        </div>
        <div class="score-card">
          <div class="label">Phần III</div>
          <div class="val">${escapeHtml(dto.sections.III.score)} / ${escapeHtml(dto.sections.III.max)}</div>
        </div>
      </div>
    </header>
    <main class="questions-list">
      ${questionsHtml}
    </main>
  </div>
</body>
</html>`;
}

export function downloadReport(model: ReportModel, options?: RenderHtmlOptions): Blob {
  const html = renderReportHtml(model, options);
  return new Blob([html], { type: "text/html;charset=utf-8" });
}
