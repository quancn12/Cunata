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
  WebOption,
  WebStatement,
  WebError,
  Result,
  ReportQuestion,
  ReleasedReportQuestion,
  ReportBase,
  ReportModel,
  DisplayPolicy,
  BuildReportOptions,
  RenderHtmlOptions,
  AttemptHistoryItem,
  DownloadReportOptions,
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
  WebOption,
  WebStatement,
  WebError,
  Result,
  ReportQuestion,
  ReleasedReportQuestion,
  ReportBase,
  ReportModel,
  DisplayPolicy,
  BuildReportOptions,
  RenderHtmlOptions,
  AttemptHistoryItem,
  DownloadReportOptions,
};

export {
  downloadReport,
  renderReportHtml,
  inspectDownloadBytes,
  type DownloadByteInspection,
} from "./download.ts";

function escapeHtml(str: string): string {
  if (typeof str !== "string") {
    str = String(str ?? "");
  }
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

  // Validate snapshot presence and identity integrity
  if (
    !final.examSnapshot ||
    typeof final.examSnapshot !== "object" ||
    !Array.isArray(final.examSnapshot.questions)
  ) {
    return {
      ok: false,
      error: {
        code: "SNAPSHOT_INVALID",
        path: "examSnapshot",
        message: "Dữ liệu snapshot đề thi trong bài làm không hợp lệ hoặc bị thiếu.",
        recoverable: false,
      },
    };
  }

  if (
    final.examSnapshot.examId !== final.examId ||
    final.examSnapshot.examVersionId !== final.examVersionId
  ) {
    return {
      ok: false,
      error: {
        code: "SCORE_MISMATCH",
        path: "examSnapshot",
        message: "Snapshot đề thi không khớp với mã đề thi hoặc phiên bản đề của bài làm.",
        recoverable: false,
      },
    };
  }

  if (
    !final.responses ||
    typeof final.responses !== "object" ||
    !Array.isArray(final.responses.responses)
  ) {
    return {
      ok: false,
      error: {
        code: "RESPONSES_INVALID",
        path: "responses",
        message: "Dữ liệu câu trả lời trong bài làm không hợp lệ hoặc bị thiếu.",
        recoverable: false,
      },
    };
  }

  if (
    final.responses.attemptId !== final.attemptId ||
    final.responses.examVersionId !== final.examVersionId
  ) {
    return {
      ok: false,
      error: {
        code: "SCORE_MISMATCH",
        path: "responses",
        message: "Dữ liệu trả lời không khớp với mã bài làm hoặc phiên bản đề của bài làm.",
        recoverable: false,
      },
    };
  }

  // Construct domain exam from snapshot for deterministic recomputation
  const domainQuestions: Question[] = (final.examSnapshot.questions as readonly WebQuestion[]).map((q: WebQuestion): Question => {
    if (q.kind === "I") {
      return {
        kind: "I",
        questionVersionId: q.questionVersionId,
        options: q.options.map((o: WebOption) => ({ optionId: o.optionId })),
        correctOptionId: q.correctOptionId,
      };
    } else if (q.kind === "II") {
      return {
        kind: "II",
        questionVersionId: q.questionVersionId,
        statements: q.statements.map((s: WebStatement) => ({
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
      storedParsed.attemptId !== final.attemptId ||
      storedParsed.examVersionId !== final.examVersionId ||
      storedParsed.ruleSetId !== recomputedScore.ruleSetId ||
      storedParsed.inputPolicyId !== recomputedScore.inputPolicyId ||
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

    let orderedOptions: readonly WebOption[] | undefined;
    if (q.kind === "I" && q.options) {
      const qOptOrder = final.presentationOrder?.optionOrder?.find(
        (oo) => oo.questionVersionId === q.questionVersionId
      );
      if (qOptOrder && Array.isArray(qOptOrder.optionIds) && qOptOrder.optionIds.length > 0) {
        const optMap = new Map<string, WebOption>();
        for (const o of q.options) optMap.set(o.optionId, o);
        const list: WebOption[] = [];
        for (const id of qOptOrder.optionIds) {
          const opt = optMap.get(id);
          if (opt) list.push(opt);
        }
        for (const o of q.options) {
          if (!list.some((x) => x.optionId === o.optionId)) list.push(o);
        }
        orderedOptions = Object.freeze(list);
      } else {
        orderedOptions = Object.freeze([...q.options]);
      }
    }

    let unreleasedStatements: readonly WebStatement[] | undefined;
    if (q.kind === "II" && q.statements) {
      unreleasedStatements = Object.freeze(
        q.statements.map((s) =>
          Object.freeze({
            statementId: s.statementId,
            label: s.label,
            text: s.text,
            answer: false,
          })
        )
      );
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
      ...(q.content ? { content: q.content } : {}),
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
        ...(orderedOptions ? { options: orderedOptions } : {}),
        ...(q.kind === "I" ? { correctOptionId: q.correctOptionId } : {}),
        ...(q.kind === "III" ? { rawAnswerKey: q.answerKey } : {}),
        ...(q.kind === "II" && q.statements ? { statements: Object.freeze([...q.statements]) } : {}),
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
    examTitle: final.examSnapshot.title,
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
