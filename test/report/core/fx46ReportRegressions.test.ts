import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReport,
  renderReportHtml,
  downloadReport,
  type AttemptRecord,
  type WebExam,
  type WebQuestion,
} from "../../../src/report/index.ts";
import { parseMarkdownSegments } from "../../../src/report/table.ts";

function createExam(questions: WebQuestion[], settings?: Partial<WebExam["settings"]>): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-fx46",
    examVersionId: "v1.0.0",
    title: "Đề kiểm định xem lại bài mục 20",
    subject: "Vật lí",
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
      ...settings,
    },
    questions,
    assets: [],
  };
}

describe("FX46 Report Regressions: Section 20 & CX-C05 Markdown Tables", () => {
  it("CX-C05: parseMarkdownSegments correctly parses markdown tables and text", () => {
    const md =
      "Nhiệt hóa hơi riêng cho trong bảng sau:\n\n| Chất lỏng | Rượu | Nước |\n| --- | --- | --- |\n| L (J / kg) | $0,9 · 10^6$ | $2,3 · 10^6$ |\n\nChất nào có L lớn nhất?";
    const segments = parseMarkdownSegments(md);
    assert.strictEqual(segments.length, 3);
    assert.strictEqual(segments[0]!.type, "text");
    assert.strictEqual(segments[1]!.type, "table");
    assert.strictEqual(segments[2]!.type, "text");

    if (segments[1]!.type === "table") {
      assert.deepEqual(segments[1]!.table.headers, ["Chất lỏng", "Rượu", "Nước"]);
      assert.strictEqual(segments[1]!.table.rows.length, 1);
      assert.deepEqual(segments[1]!.table.rows[0], ["L (J / kg)", "$0,9 · 10^6$", "$2,3 · 10^6$"]);
    }
  });

  it("§20 & CX-C05: renderReportHtml produces review cards with full content, markdown tables, options, statements, and exam title", () => {
    const q1: WebQuestion = {
      kind: "I",
      questionVersionId: "q-1",
      title: "Câu 1",
      content:
        "Bảng số liệu:\n\n| Chất lỏng | Rượu | Nước |\n| --- | --- | --- |\n| L (J / kg) | 0,9 | 2,3 |\n\nChọn câu đúng.",
      options: [
        { optionId: "opt-1", label: "A", text: "Nước" },
        { optionId: "opt-2", label: "B", text: "Rượu" },
        { optionId: "opt-3", label: "C", text: "Thủy ngân" },
        { optionId: "opt-4", label: "D", text: "Dầu" },
      ],
      correctOptionId: "opt-1",
      explanation: "Nước có L lớn hơn",
    };

    const q2: WebQuestion = {
      kind: "II",
      questionVersionId: "q-2",
      title: "Câu 2",
      content: "Xét các mệnh đề sau:",
      statements: [
        { statementId: "st-1", label: "a", text: "Mệnh đề A", answer: true },
        { statementId: "st-2", label: "b", text: "Mệnh đề B", answer: false },
        { statementId: "st-3", label: "c", text: "Mệnh đề C", answer: true },
        { statementId: "st-4", label: "d", text: "Mệnh đề D", answer: false },
      ],
      explanation: "Giải thích mệnh đề",
    };

    const q3: WebQuestion = {
      kind: "III",
      questionVersionId: "q-3",
      title: "Câu 3",
      content: "Nhập giá trị vận tốc:",
      answerKey: "1,5",
      explanation: "Giải thích câu 3",
    };

    const exam = createExam([q1, q2, q3]);
    const record: AttemptRecord = {
      schemaVersion: "web-attempt-v1",
      revision: 1,
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: "att-fx46-review",
      candidateName: "Nguyễn Văn A",
      examSnapshot: exam,
      presentationOrder: { seed: "1", questionOrder: ["q-1", "q-2", "q-3"] },
      responses: {
        attemptId: "att-fx46-review",
        examVersionId: exam.examVersionId,
        responses: [
          { kind: "I", questionVersionId: "q-1", selectedOptionId: "opt-1" },
          {
            kind: "II",
            questionVersionId: "q-2",
            answers: [
              { statementId: "st-1", value: true },
              { statementId: "st-2", value: true },
              { statementId: "st-3", value: false },
              { statementId: "st-4", value: false },
            ],
          },
          { kind: "III", questionVersionId: "q-3", raw: "1,5" },
        ],
      },
      startedAt: 1000,
      deadline: 5000,
      phase: "final",
      submittedAt: 2000,
      scoreDTO: null,
    };

    const repRes = buildReport(record, 3000);
    assert.strictEqual(repRes.ok, true);
    if (!repRes.ok) return;

    const html = renderReportHtml(repRes.value);

    // Exam title in report title
    assert.match(html, /Đề kiểm định xem lại bài mục 20/);
    assert.ok(html.includes('class="report-title"'));

    // Question 1: review options & markdown table
    assert.ok(html.includes('class="review-option"'));
    assert.ok(html.includes('data-option-id="opt-1"'));
    assert.ok(html.includes('data-correct="true"'));
    assert.ok(html.includes('data-chosen="true"'));
    assert.ok(html.includes("Nước"));
    assert.ok(html.includes("Rượu"));
    assert.ok(html.includes('<table class="report-table">'));
    assert.ok(html.includes("<th>Chất lỏng</th>"));

    // Question 2: review statements
    assert.ok(html.includes('class="review-statement"'));
    assert.ok(html.includes('data-statement-id="st-1"'));
    assert.ok(html.includes('data-key="true"'));
    assert.ok(html.includes('data-chosen="true"'));
    assert.ok(html.includes('data-statement-id="st-2"'));
    assert.ok(html.includes('data-key="false"'));
    assert.ok(html.includes("Mệnh đề A"));
    assert.ok(html.includes("Mệnh đề B"));

    // Question 3: short answer
    assert.ok(html.includes('class="review-short-answer"'));
    assert.ok(html.includes("Bạn điền:"));
    assert.ok(html.includes("1,5"));

    // Blob generation
    const blob = downloadReport(repRes.value);
    assert.strictEqual(blob.type, "text/html;charset=utf-8");
    assert.ok(blob.size > 0);
  });

  it("Strict pre-deadline isolation: unreleased questions do not leak options, correct keys or explanations", () => {
    const q: WebQuestion = {
      kind: "I",
      questionVersionId: "q-secret",
      title: "Câu bí mật",
      content: "Nội dung",
      options: [
        { optionId: "opt-secret-key", text: "Đáp án bí mật" },
        { optionId: "opt-wrong", text: "Sai 1" },
        { optionId: "opt-wrong2", text: "Sai 2" },
        { optionId: "opt-wrong3", text: "Sai 3" },
      ],
      correctOptionId: "opt-secret-key",
      explanation: "SECRET_EXPLANATION_KEY_9999",
    };

    const exam = createExam([q], { releasePolicy: "after_deadline" });

    const record: AttemptRecord = {
      schemaVersion: "web-attempt-v1",
      revision: 1,
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: "att-pre-dl",
      candidateName: "Thí sinh",
      examSnapshot: exam,
      presentationOrder: { seed: "1", questionOrder: ["q-secret"] },
      responses: {
        attemptId: "att-pre-dl",
        examVersionId: exam.examVersionId,
        responses: [{ kind: "I", questionVersionId: "q-secret", selectedOptionId: "opt-wrong" }],
      },
      startedAt: 1000,
      deadline: 10000,
      phase: "final",
      submittedAt: 2000,
      scoreDTO: null,
    };

    // now = 3000 < deadline 10000 -> unreleased
    const repRes = buildReport(record, 3000);
    assert.strictEqual(repRes.ok, true);
    if (!repRes.ok) return;

    assert.strictEqual(repRes.value.released, false);
    const json = JSON.stringify(repRes.value);
    assert.strictEqual(json.includes("opt-secret-key"), false);
    assert.strictEqual(json.includes("SECRET_EXPLANATION_KEY_9999"), false);

    const html = renderReportHtml(repRes.value);
    assert.strictEqual(html.includes("opt-secret-key"), false);
    assert.strictEqual(html.includes("SECRET_EXPLANATION_KEY_9999"), false);
    assert.match(html, /chưa công bố/i);
  });
});
