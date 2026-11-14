import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  rational,
  ZERO,
  toFractionString,
  scoreAttempt,
  scoreResultToDTO,
} from "../../../src/domain/index.ts";
import {
  buildReport,
  downloadReport,
  renderReportHtml,
  inspectDownloadBytes,
  type ReportModel,
  type ReleasedReportQuestion,
  type AttemptRecord,
  type WebExam,
  type WebQuestion,
  type DisplayPolicy,
} from "../../../src/report/index.ts";

function createMockExam(
  questions: WebQuestion[],
  settings?: Partial<WebExam["settings"]>,
  assets?: WebExam["assets"]
): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-dl-01",
    examVersionId: "ver-dl-01",
    title: "Đề thi kiểm thử tải báo cáo offline",
    subject: "Toán",
    grade: 12,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    settings: {
      durationMinutes: 45,
      maxAttempts: 3,
      releasePolicy: "immediate",
      ...settings,
    },
    questions,
    assets: assets ?? [],
  };
}

describe("WEB-W3-REPORT-DOWNLOAD: Self-contained Offline HTML Report & Asset Policy", () => {
  describe("1. Self-contained Offline HTML Blob Generation & Print Styles", () => {
    it("generates a valid UTF-8 HTML Blob with print styles and no external requests", async () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q1",
        title: "Câu hỏi trắc nghiệm 1",
        content: "Nội dung câu hỏi 1",
        options: [
          { optionId: "opt-a", label: "A", text: "Lựa chọn A" },
          { optionId: "opt-b", label: "B", text: "Lựa chọn B" },
          { optionId: "opt-c", label: "C", text: "Lựa chọn C" },
          { optionId: "opt-d", label: "D", text: "Lựa chọn D" },
        ],
        correctOptionId: "opt-a",
        explanation: "Lời giải chi tiết câu 1",
      };

      const exam = createMockExam([q], { releasePolicy: "immediate" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-001",
        candidateName: "Nguyễn Văn A",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q1"] },
        responses: {
          attemptId: "att-001",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q1", selectedOptionId: "opt-a" }],
        },
        startedAt: 1700000000000,
        deadline: 1700002700000,
        phase: "final",
        submittedAt: 1700001500000,
        scoreDTO: null,
      };

      const res = buildReport(record, 1700001500000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const model = res.value;
      const blob = downloadReport(model);

      assert.strictEqual(blob.type, "text/html;charset=utf-8");
      assert.ok(blob.size > 0, "Blob must have positive byte length");

      const text = await blob.text();
      assert.ok(text.startsWith("<!DOCTYPE html>"), "Must be a complete HTML document");
      assert.ok(text.includes('<html lang="vi">'), "Must include vietnamese lang attribute");
      assert.ok(text.includes('<meta charset="utf-8" />'), "Must specify UTF-8 charset");
      assert.ok(text.includes("@media print"), "Must embed print stylesheet");
      assert.ok(text.includes("@page"), "Must include A4 page setup");
      assert.ok(text.includes('onclick="window.print()"'), "Must provide print action");

      // Verify disclaimer on programmatic PDF claim
      assert.ok(
        text.includes("hệ thống không tạo tệp PDF lập trình phía máy chủ") ||
          text.includes("Lưu dưới dạng PDF"),
        "Must clarify native browser print and make no false claim of programmatic PDF"
      );

      // Verify byte inspection helper
      const inspection = inspectDownloadBytes(text);
      assert.strictEqual(inspection.isUtf8, true, "Bytes must be valid UTF-8");
      assert.strictEqual(inspection.hasExternalRequests, false, "Must have ZERO external network requests");
      assert.strictEqual(inspection.hasHostileScripts, false, "Must have ZERO hostile scripts");
    });
  });

  describe("2. External Request Prohibition (Offline Integrity)", () => {
    it("strictly forbids external URLs, stylesheets, scripts and tracking pixels in output bytes", async () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q-offline",
        title: "Câu hỏi ngoại tuyến",
        content: "Nội dung không tải CDN",
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };

      const exam = createMockExam([q]);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-offline",
        candidateName: "Trần Thị B",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-offline"] },
        responses: {
          attemptId: "att-offline",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-offline", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const html = renderReportHtml(res.value);
      const inspection = inspectDownloadBytes(html);

      assert.strictEqual(inspection.hasExternalRequests, false);
      assert.deepStrictEqual(inspection.externalUrlsFound, []);
      assert.strictEqual(html.includes("http://"), false, "Must not contain http://");
      assert.strictEqual(html.includes("https://"), false, "Must not contain https://");
      assert.strictEqual(html.includes("//fonts.googleapis.com"), false, "No external fonts");
      assert.strictEqual(html.includes("//cdn.jsdelivr.net"), false, "No CDN script/style");
      assert.strictEqual(html.includes("<script src="), false, "No external script tag");
      assert.strictEqual(html.includes('<link rel="stylesheet"'), false, "No external link tag");
    });
  });

  describe("3. Pre-release Key Policy: Strict Omission in all DOM, Attributes, Scripts, Comments", () => {
    it("omits answer keys and explanations before release and informs student a new download is required", async () => {
      const qI: WebQuestion = {
        kind: "I",
        questionVersionId: "q-sec-I",
        title: "Câu I bí mật",
        content: "Nội dung câu I",
        options: [
          { optionId: "opt-secret-correct", text: "A" },
          { optionId: "opt-wrong-1", text: "B" },
          { optionId: "opt-wrong-2", text: "C" },
          { optionId: "opt-wrong-3", text: "D" },
        ],
        correctOptionId: "opt-secret-correct",
        explanation: "EXPLANATION_SECRET_I_DO_NOT_LEAK",
      };

      const qII: WebQuestion = {
        kind: "II",
        questionVersionId: "q-sec-II",
        title: "Câu II bí mật",
        content: "Nội dung câu II",
        statements: [
          { statementId: "st1", text: "Ý 1", answer: true, explanation: "EXP_ST1_SECRET" },
          { statementId: "st2", text: "Ý 2", answer: false, explanation: "EXP_ST2_SECRET" },
          { statementId: "st3", text: "Ý 3", answer: true, explanation: "EXP_ST3_SECRET" },
          { statementId: "st4", text: "Ý 4", answer: false, explanation: "EXP_ST4_SECRET" },
        ],
      };

      const qIII: WebQuestion = {
        kind: "III",
        questionVersionId: "q-sec-III",
        title: "Câu III bí mật",
        content: "Nội dung câu III",
        answerKey: "-0,5",
        explanation: "EXPLANATION_SECRET_III_RAW_KEY",
      };

      // Set releasePolicy: after_deadline, now < deadline
      const exam = createMockExam([qI, qII, qIII], { releasePolicy: "after_deadline" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-pre-release",
        candidateName: "Học sinh bảo mật",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-sec-I", "q-sec-II", "q-sec-III"] },
        responses: {
          attemptId: "att-pre-release",
          examVersionId: exam.examVersionId,
          responses: [
            { kind: "I", questionVersionId: "q-sec-I", selectedOptionId: "opt-wrong-1" },
            {
              kind: "II",
              questionVersionId: "q-sec-II",
              answers: [
                { statementId: "st1", value: true },
                { statementId: "st2", value: false },
                { statementId: "st3", value: true },
                { statementId: "st4", value: false },
              ],
            },
            { kind: "III", questionVersionId: "q-sec-III", raw: "1,23" },
          ],
        },
        startedAt: 1000,
        deadline: 100000,
        phase: "final",
        submittedAt: 5000,
        scoreDTO: null,
      };

      // now = 6000 < deadline 100000 -> NOT released
      const res = buildReport(record, 6000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const model = res.value;
      assert.strictEqual(model.released, false);

      const html = renderReportHtml(model);
      const blob = downloadReport(model);
      const blobText = await blob.text();

      // Inspect output bytes for unreleased keys
      const forbiddenKeys = [
        "opt-secret-correct",
        "EXPLANATION_SECRET_I_DO_NOT_LEAK",
        "EXP_ST1_SECRET",
        "EXP_ST2_SECRET",
        "EXP_ST3_SECRET",
        "EXP_ST4_SECRET",
        "EXPLANATION_SECRET_III_RAW_KEY",
        "-0,5",
      ];

      const inspection = inspectDownloadBytes(blobText, { forbiddenKeys });
      assert.strictEqual(
        inspection.hasUnreleasedKeys,
        false,
        `Unreleased keys leaked: ${inspection.unreleasedKeysFound.join(", ")}`
      );

      // Verify that no hidden timed-reveal scripts exist
      assert.strictEqual(html.includes("setTimeout"), false, "No timed reveal setTimeout");
      assert.strictEqual(html.includes("setInterval"), false, "No timed reveal setInterval");
      assert.strictEqual(html.includes("Date.now()"), false, "No timed reveal Date.now()");

      // Verify unreleased notice is shown
      assert.match(html, /chưa công bố/i);
      assert.ok(
        html.includes("tải lại bản báo cáo mới") || html.includes("tải lại tệp báo cáo"),
        "Must advise student to download new report file after deadline"
      );
    });

    it("post-deadline report includes all keys and explanations", async () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q-rel",
        title: "Câu phát hành",
        content: "Nội dung",
        options: [
          { optionId: "opt-correct", text: "Đáp án đúng" },
          { optionId: "opt-wrong-1", text: "Đáp án sai 1" },
          { optionId: "opt-wrong-2", text: "Đáp án sai 2" },
          { optionId: "opt-wrong-3", text: "Đáp án sai 3" },
        ],
        correctOptionId: "opt-correct",
        explanation: "Lời giải công khai sau hạn",
      };

      const exam = createMockExam([q], { releasePolicy: "after_deadline" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-post",
        candidateName: "Thí sinh nhận đáp án",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-rel"] },
        responses: {
          attemptId: "att-post",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-rel", selectedOptionId: "opt-correct" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 4000,
        scoreDTO: null,
      };

      // now = 5001 >= deadline (5000) -> RELEASED
      const res = buildReport(record, 5001);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const model = res.value;
      assert.strictEqual(model.released, true);

      const html = renderReportHtml(model);
      assert.ok(html.includes("opt-correct"), "Must include correct option ID after release");
      assert.ok(html.includes("Lời giải công khai sau hạn"), "Must include explanation after release");
    });
  });

  describe("4. Hostile Names & Injection Defense (XSS Security)", () => {
    it("safely escapes hostile script, img, svg tags in candidateName, titles, and responses", async () => {
      const hostileName = '<script>alert("hacked")</script>';
      const hostileTitle = 'Câu <img src=x onerror=alert("pwned")> độc hại';
      const hostileRaw = '"><svg onload=alert(1)>';

      const q: WebQuestion = {
        kind: "III",
        questionVersionId: "q-hostile",
        title: hostileTitle,
        content: "Nội dung kiểm tra XSS",
        answerKey: "1,5",
      };

      const exam = createMockExam([q]);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-xss",
        candidateName: hostileName,
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-hostile"] },
        responses: {
          attemptId: "att-xss",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "III", questionVersionId: "q-hostile", raw: hostileRaw }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const html = renderReportHtml(res.value);
      const inspection = inspectDownloadBytes(html);

      assert.strictEqual(
        inspection.hasHostileScripts,
        false,
        `Hostile script leaked in output bytes: ${inspection.hostileMatchesFound.join(", ")}`
      );

      // Verify character escaping
      assert.strictEqual(html.includes('<script>alert("hacked")</script>'), false);
      assert.ok(html.includes("&lt;script&gt;alert(&quot;hacked&quot;)&lt;/script&gt;"));
      assert.strictEqual(html.includes('onerror=alert("pwned")'), false);
      assert.ok(html.includes("&lt;img src=x onerror=alert(&quot;pwned&quot;)&gt;"));
      assert.strictEqual(html.includes("<svg onload=alert(1)>"), false);
      assert.ok(html.includes("&quot;&gt;&lt;svg onload=alert(1)&gt;"));
    });
  });

  describe("5. Asset Policy: Verified Images & Missing Asset Placeholder", () => {
    it("embeds verified data URI images and renders clean placeholders for missing assets without external requests", async () => {
      const safePngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const qWithImages: WebQuestion = {
        kind: "I",
        questionVersionId: "q-img",
        title: "Câu có ảnh nhúng",
        blocks: [
          { type: "text", text: "Xem hình bên dưới:" },
          { type: "image", assetId: "asset-diagram-safe", alt: "Sơ đồ an toàn" },
          { type: "image", assetId: "asset-missing-404", alt: "Sơ đồ thiếu" },
        ],
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };

      const exam = createMockExam(
        [qWithImages],
        {},
        [
          {
            assetId: "asset-diagram-safe",
            mime: "image/png",
            data: safePngBase64,
            alt: "Sơ đồ an toàn",
          },
        ]
      );

      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-img",
        candidateName: "Thí sinh có ảnh",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-img"] },
        responses: {
          attemptId: "att-img",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-img", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const html = renderReportHtml(res.value);
      const inspection = inspectDownloadBytes(html);

      assert.strictEqual(inspection.hasExternalRequests, false);
      assert.ok(html.includes("data:image/png;base64," + safePngBase64), "Safe image must be embedded as inline data URI");

      // Verify missing asset placeholder
      assert.strictEqual(inspection.hasMissingAssets, true);
      assert.ok(inspection.missingAssetPlaceholdersFound.includes("asset-missing-404"));
      assert.ok(html.includes("block-asset-missing"), "Must render missing asset placeholder");
      assert.ok(html.includes("Hình ảnh không khả dụng: <code>asset-missing-404</code>"));
      assert.strictEqual(html.includes('<img src="asset-missing-404"'), false, "Must not emit broken external img src");
    });

    it("rejects hostile protocols in assets and treats them as missing/unsafe", async () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q-hostile-asset",
        title: "Câu có tài sản độc hại",
        blocks: [
          { type: "image", assetId: "hostile-js-asset", alt: "Script asset" },
          { type: "image", assetId: "hostile-http-asset", alt: "Remote asset" },
        ],
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };

      const exam = createMockExam(
        [q],
        {},
        [
          {
            assetId: "hostile-js-asset",
            mime: "image/png",
            data: "javascript:alert(1)",
            alt: "Hostile JS",
          },
          {
            assetId: "hostile-http-asset",
            mime: "image/png",
            data: "http://malicious.com/tracker.png",
            alt: "Remote Tracker",
          },
        ]
      );

      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-hostile-asset",
        candidateName: "Thí sinh bảo vệ mạng",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-hostile-asset"] },
        responses: {
          attemptId: "att-hostile-asset",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-hostile-asset", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const html = renderReportHtml(res.value);
      const inspection = inspectDownloadBytes(html);

      assert.strictEqual(inspection.hasExternalRequests, false);
      assert.strictEqual(html.includes("javascript:alert(1)"), false);
      assert.strictEqual(html.includes("http://malicious.com"), false);
    });
  });

  describe("6. Score Configurations: Exact 12/15, 11/16, max5, and 10/3 Repeating Fraction", () => {
    it("preserves exact 12/15 score without floating point or rounding drift", () => {
      // 20 Part I (all correct -> 20 * 0.25 = 5/5)
      // 10 Part II (7 correct -> 7 * 1 = 7, 3 wrong -> 0; score 7/10)
      // 0 Part III -> maxTotal = 5 + 10 = 15; total = 5 + 7 = 12/15
      const questions: WebQuestion[] = [];
      const responses: AttemptRecord["responses"]["responses"] = [];

      for (let i = 1; i <= 20; i++) {
        const qId = `qI_${i}`;
        questions.push({
          kind: "I",
          questionVersionId: qId,
          title: `Câu I.${i}`,
          options: [
            { optionId: "a", text: "A" },
            { optionId: "b", text: "B" },
            { optionId: "c", text: "C" },
            { optionId: "d", text: "D" },
          ],
          correctOptionId: "a",
        });
        responses.push({ kind: "I", questionVersionId: qId, selectedOptionId: "a" });
      }

      for (let i = 1; i <= 10; i++) {
        const qId = `qII_${i}`;
        questions.push({
          kind: "II",
          questionVersionId: qId,
          title: `Câu II.${i}`,
          statements: [
            { statementId: "s1", answer: true },
            { statementId: "s2", answer: true },
            { statementId: "s3", answer: true },
            { statementId: "s4", answer: true },
          ],
        });
        // 7 correct, 3 wrong (0/4)
        const isCorrect = i <= 7;
        responses.push({
          kind: "II",
          questionVersionId: qId,
          answers: [
            { statementId: "s1", value: isCorrect },
            { statementId: "s2", value: isCorrect },
            { statementId: "s3", value: isCorrect },
            { statementId: "s4", value: isCorrect },
          ],
        });
      }

      const exam = createMockExam(questions);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-12-15",
        candidateName: "Thí sinh 12/15",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: questions.map((q) => q.questionVersionId) },
        responses: { attemptId: "att-12-15", examVersionId: exam.examVersionId, responses },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const html = renderReportHtml(res.value);
      const inspection = inspectDownloadBytes(html, { expectedScores: ["12 / 15", "5 / 5", "7 / 10"] });
      assert.strictEqual(inspection.exactScoresPreserved, true);
      assert.ok(html.includes("12 / 15"), "Must render 12 / 15 verbatim");
      assert.ok(html.includes("5 / 5"), "Part I score must be 5 / 5");
      assert.ok(html.includes("7 / 10"), "Part II score must be 7 / 10");
    });

    it("preserves exact 11/16 score and exact 10/3 repeating fraction", () => {
      // 3 Part III only -> N1=0, N2=0, N3=3 -> BASE=0 < 10 -> POINT_III = 10/3 -> MAX=10
      // 1 correct -> score 10/3 / 10
      const q1: WebQuestion = { kind: "III", questionVersionId: "q3_1", title: "C3.1", answerKey: "1,5" };
      const q2: WebQuestion = { kind: "III", questionVersionId: "q3_2", title: "C3.2", answerKey: "-0,5" };
      const q3: WebQuestion = { kind: "III", questionVersionId: "q3_3", title: "C3.3", answerKey: "2" };

      const exam = createMockExam([q1, q2, q3]);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-10-3",
        candidateName: "Thí sinh số lẻ tuần hoàn",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q3_1", "q3_2", "q3_3"] },
        responses: {
          attemptId: "att-10-3",
          examVersionId: exam.examVersionId,
          responses: [
            { kind: "III", questionVersionId: "q3_1", raw: "1,5" },
            { kind: "III", questionVersionId: "q3_2", raw: "99" },
            { kind: "III", questionVersionId: "q3_3", raw: "88" },
          ],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const html = renderReportHtml(res.value);
      const inspection = inspectDownloadBytes(html, { expectedScores: ["10/3 / 10"] });
      assert.strictEqual(inspection.exactScoresPreserved, true);
      assert.ok(html.includes("10/3 / 10"), "Repeating fraction 10/3 / 10 must be preserved verbatim");
    });

    it("supports displayPolicy decimal formatting when injected (D02)", () => {
      const q1: WebQuestion = { kind: "III", questionVersionId: "q1", title: "C1", answerKey: "1" };
      const q2: WebQuestion = { kind: "III", questionVersionId: "q2", title: "C2", answerKey: "2" };
      const q3: WebQuestion = { kind: "III", questionVersionId: "q3", title: "C3", answerKey: "3" };

      const exam = createMockExam([q1, q2, q3]);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-dec",
        candidateName: "Thí sinh thập phân",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q1", "q2", "q3"] },
        responses: {
          attemptId: "att-dec",
          examVersionId: exam.examVersionId,
          responses: [
            { kind: "III", questionVersionId: "q1", raw: "1" },
            { kind: "III", questionVersionId: "q2", raw: "wrong" },
            { kind: "III", questionVersionId: "q3", raw: "wrong" },
          ],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      // When injected with decimal display policy (2 decimal places)
      const decimalPolicy: DisplayPolicy = { mode: "decimal", fractionDigits: 2 };
      const htmlDecimal = renderReportHtml(res.value, { displayPolicy: decimalPolicy });
      assert.ok(htmlDecimal.includes("3.33 / 10.00"), "10/3 formatted to 2 decimals is 3.33 / 10.00");
    });
  });

  describe("7. Partial II Scoring Invariant", () => {
    it("never marks 1, 2, 3 correct statements as 'full' in downloaded report", () => {
      const q: WebQuestion = {
        kind: "II",
        questionVersionId: "q-part-II",
        title: "Câu II kiểm tra đúng một phần",
        statements: [
          { statementId: "s1", answer: true },
          { statementId: "s2", answer: true },
          { statementId: "s3", answer: true },
          { statementId: "s4", answer: true },
        ],
      };

      const exam = createMockExam([q]);
      // 3 correct statements -> 0.5 points, status 'partial'
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-partial-II",
        candidateName: "Thí sinh 3 ý",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-part-II"] },
        responses: {
          attemptId: "att-partial-II",
          examVersionId: exam.examVersionId,
          responses: [
            {
              kind: "II",
              questionVersionId: "q-part-II",
              answers: [
                { statementId: "s1", value: true },
                { statementId: "s2", value: true },
                { statementId: "s3", value: true },
                { statementId: "s4", value: false },
              ],
            },
          ],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const html = renderReportHtml(res.value);
      assert.ok(html.includes("badge-partial"), "Must render partial badge");
      assert.ok(html.includes("Đúng một phần"), "Must render Vietnamese label Đúng một phần");
      assert.strictEqual(html.includes('<span class="badge badge-full">'), false, "Must NEVER render badge-full for 3/4 statements");
    });
  });

  describe("8. Immutable Attempt History & Metadata Rendering", () => {
    it("renders immutable history table with current attempt highlight and server status", () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q1",
        title: "Câu 1",
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };

      const exam = createMockExam([q]);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-curr-02",
        candidateName: "Lê Hoàng C",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q1"] },
        responses: {
          attemptId: "att-curr-02",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q1", selectedOptionId: "a" }],
        },
        startedAt: 1700000000000,
        deadline: 1700003600000,
        phase: "final",
        submittedAt: 1700001800000,
        scoreDTO: null,
      };

      const res = buildReport(record, 1700001800000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const historyData = [
        {
          attemptId: "att-prev-01",
          submittedAt: "14:00 14/11/2026",
          candidateName: "Lê Hoàng C",
          scoreI: "1/4 / 1/4",
          scoreII: "0 / 0",
          scoreIII: "0 / 0",
          total: "1/4",
          maxTotal: "1/4",
          serverConfirmed: true,
          status: "Đã đồng bộ",
        },
        {
          attemptId: "att-curr-02",
          submittedAt: "14:30 14/11/2026",
          candidateName: "Lê Hoàng C",
          scoreI: "1/4 / 1/4",
          scoreII: "0 / 0",
          scoreIII: "0 / 0",
          total: "1/4",
          maxTotal: "1/4",
          serverConfirmed: false,
          status: "Lưu cục bộ",
        },
      ];

      const html = renderReportHtml(res.value, {
        history: historyData,
        currentAttemptId: "att-curr-02",
      });

      const inspection = inspectDownloadBytes(html);
      assert.strictEqual(inspection.historyTableRendered, true, "History table must be rendered");
      assert.ok(html.includes("Lịch Sử Các Lần Làm Bài"));
      assert.ok(html.includes("att-prev-01"));
      assert.ok(html.includes("att-curr-02"));
      assert.ok(html.includes("current-attempt"), "Current attempt must have highlighted CSS class");
      assert.ok(html.includes("Đã đồng bộ"));
      assert.ok(html.includes("Lưu cục bộ"));
    });
  });

  describe("9. Tables, Math Source, and Rich Blocks", () => {
    it("renders rich tables with rowspan/colspan and safe math source", () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q-rich",
        title: "Câu bảng và công thức",
        blocks: [
          {
            type: "math",
            source: "\\int_{0}^{1} x^2 dx = \\frac{1}{3}",
            format: "latex",
            verified: true,
          },
          {
            type: "table",
            rows: [
              [
                { blocks: [{ type: "text", text: "Ô gộp 2 hàng" }], rowSpan: 2, colSpan: 1 },
                { blocks: [{ type: "text", text: "Hàng 1 Cột 2" }], rowSpan: 1, colSpan: 1 },
              ],
              [
                { blocks: [{ type: "text", text: "Hàng 2 Cột 2" }], rowSpan: 1, colSpan: 1 },
              ],
            ],
          },
        ],
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };

      const exam = createMockExam([q]);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-rich",
        candidateName: "Thí sinh toán bảng",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-rich"] },
        responses: {
          attemptId: "att-rich",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-rich", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const html = renderReportHtml(res.value);
      assert.ok(html.includes('class="block-math"'));
      assert.ok(html.includes('data-format="latex"'));
      assert.ok(html.includes('\\int_{0}^{1} x^2 dx = \\frac{1}{3}'));
      assert.ok(html.includes('rowspan="2"'));
      assert.ok(html.includes("Ô gộp 2 hàng"));
    });
  });

  describe("10. AC: Recomputation from Immutable Final & Tamper Detection", () => {
    it("rejects stored DTO tamper with SCORE_MISMATCH and recomputes cleanly", () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q1",
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };
      const exam = createMockExam([q]);

      // Tampered scoreDTO: claims 10 points instead of 0.25 (1/4)
      const tamperedDTO = {
        total: "10",
        maxTotal: "1/4",
        sections: {
          I: { score: "10", max: "1/4", questionCount: 1 },
          II: { score: "0", max: "0", questionCount: 0 },
          III: { score: "0", max: "0", questionCount: 0 },
        },
        questions: [],
      };

      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-tampered",
        candidateName: "Thí sinh gian lận điểm",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q1"] },
        responses: {
          attemptId: "att-tampered",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q1", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: tamperedDTO,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "SCORE_MISMATCH");
      }
    });
  });
});
