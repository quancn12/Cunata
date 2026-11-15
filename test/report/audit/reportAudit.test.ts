import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  rational,
  ZERO,
  ONE,
  add,
  toFractionString,
  toDecimalString,
  scoreAttempt,
  scoreResultToDTO,
  type Response,
} from "../../../src/domain/index.ts";
import {
  buildReport,
  downloadReport,
  renderReportHtml,
  inspectDownloadBytes,
  type ReportModel,
  type ReportQuestion,
  type ReleasedReportQuestion,
  type AttemptRecord,
  type WebExam,
  type WebQuestion,
  type DisplayPolicy,
} from "../../../src/report/index.ts";
import { mount, type ReportViewState } from "../../../src/report/view.ts";
import { createMockDocument, MockElement, MockNode, MockTextNode } from "../../ui/core/dom-mock.ts";

function serializeMockToHtml(node: MockNode): string {
  if (node instanceof MockTextNode) {
    return node.textContent
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  if (node instanceof MockElement) {
    const tag = node.tagName.toLowerCase();
    let attrs = "";
    for (const [k, v] of node.attributes.entries()) {
      attrs += ` ${k}="${v.replace(/"/g, "&quot;")}"`;
    }
    const children = node.childNodes.map(serializeMockToHtml).join("");
    return `<${tag}${attrs}>${children}</${tag}>`;
  }
  return "";
}

function createAuditedExam(
  questions: WebQuestion[],
  options: {
    examId?: string;
    examVersionId?: string;
    releasePolicy?: "immediate" | "after_deadline";
    durationMinutes?: number;
    assets?: WebExam["assets"];
  } = {}
): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: options.examId ?? "exam-audit-01",
    examVersionId: options.examVersionId ?? "ver-audit-01",
    title: "Đề thi kiểm định toàn diện WEB-W4-REPORT",
    subject: "Toán học & Khoa học",
    grade: 12,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    settings: {
      durationMinutes: options.durationMinutes ?? 50,
      maxAttempts: 3,
      releasePolicy: options.releasePolicy ?? "after_deadline",
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions,
    assets: options.assets ?? [],
  };
}

describe("WEB-W4-REPORT: Comprehensive Audit & Hardening Suite", () => {
  describe("1. Audit: Unreleased Key and Explanation Leaks (DOM, HTML, Print, History, Download)", () => {
    it("strictly omits answer keys and explanations from ReportModel when released=false", () => {
      const qI: WebQuestion = {
        kind: "I",
        questionVersionId: "qI-secret",
        title: "Câu I bí mật",
        options: [
          { optionId: "opt_correct_alpha", text: "Đáp án A" },
          { optionId: "opt_wrong_beta", text: "Đáp án B" },
          { optionId: "opt_c", text: "Đáp án C" },
          { optionId: "opt_d", text: "Đáp án D" },
        ],
        correctOptionId: "opt_correct_alpha",
        explanation: "Lời giải bí mật phần I",
      };

      const qII: WebQuestion = {
        kind: "II",
        questionVersionId: "qII-secret",
        title: "Câu II bí mật",
        statements: [
          { statementId: "st1", text: "Mệnh đề 1", answer: true, explanation: "Giải thích mệnh đề 1" },
          { statementId: "st2", text: "Mệnh đề 2", answer: false, explanation: "Giải thích mệnh đề 2" },
          { statementId: "st3", text: "Mệnh đề 3", answer: true, explanation: "Giải thích mệnh đề 3" },
          { statementId: "st4", text: "Mệnh đề 4", answer: false, explanation: "Giải thích mệnh đề 4" },
        ],
        explanation: "Lời giải chung câu II",
      };

      const qIII: WebQuestion = {
        kind: "III",
        questionVersionId: "qIII-secret",
        title: "Câu III bí mật",
        answerKey: "-0,5",
        explanation: "Lời giải phương trình ra -0,5",
      };

      const exam = createAuditedExam([qI, qII, qIII], { releasePolicy: "after_deadline" });

      const responses: Response[] = [
        { kind: "I", questionVersionId: "qI-secret", selectedOptionId: "opt_wrong_beta" },
        {
          kind: "II",
          questionVersionId: "qII-secret",
          answers: [
            { statementId: "st1", value: true },
            { statementId: "st2", value: true },
            { statementId: "st3", value: false },
            { statementId: "st4", value: false },
          ],
        },
        { kind: "III", questionVersionId: "qIII-secret", raw: "1,5" },
      ];

      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-leak-audit",
        candidateName: "Thí sinh kiểm định rò rỉ",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-audit", questionOrder: ["qI-secret", "qII-secret", "qIII-secret"] },
        responses: {
          attemptId: "att-leak-audit",
          examVersionId: exam.examVersionId,
          responses,
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 3000,
        scoreDTO: null,
      };

      // now = 4000 < deadline 5000 -> released is FALSE
      const repRes = buildReport(record, 4000);
      assert.strictEqual(repRes.ok, true);
      if (!repRes.ok) return;

      const model = repRes.value;
      assert.strictEqual(model.released, false);

      // Model verification: no answer or explanation properties on unreleased questions
      for (const q of model.questions) {
        assert.strictEqual("answer" in q, false, `Question ${q.questionVersionId} must not have 'answer' property`);
        assert.strictEqual("explanation" in q, false, `Question ${q.questionVersionId} must not have 'explanation' property`);
      }

      // HTML verification: inspect generated HTML string
      const html = renderReportHtml(model);
      assert.strictEqual(html.includes("opt_correct_alpha"), false, "HTML must not contain correctOptionId");
      assert.strictEqual(html.includes("Lời giải bí mật phần I"), false, "HTML must not contain Part I explanation");
      assert.strictEqual(html.includes("Giải thích mệnh đề 1"), false, "HTML must not contain statement explanation");
      assert.strictEqual(html.includes("Lời giải chung câu II"), false, "HTML must not contain Part II explanation");
      assert.strictEqual(html.includes("-0,5"), false, "HTML must not contain Part III answerKey");
      assert.strictEqual(html.includes("Lời giải phương trình ra -0,5"), false, "HTML must not contain Part III explanation");
      assert.strictEqual(html.includes("Đáp án và lời giải chi tiết chưa công bố"), true, "HTML must show unreleased notice");

      // DOM mount verification
      const doc = createMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);
      const unmount = mount(root as unknown as HTMLElement, model);

      const rootHtml = serializeMockToHtml(root);
      assert.strictEqual(rootHtml.includes("opt_correct_alpha"), false, "DOM must not contain correctOptionId");
      assert.strictEqual(rootHtml.includes("Lời giải bí mật"), false, "DOM must not contain explanation");
      assert.strictEqual(rootHtml.includes("-0,5"), false, "DOM must not contain Part III key");
      assert.strictEqual(rootHtml.includes("Chưa công bố"), true, "DOM must show 'Chưa công bố' in Part II correct column");

      // Download bytes inspection
      const forbiddenKeys = [
        "opt_correct_alpha",
        "Lời giải bí mật",
        "Giải thích mệnh đề",
        "-0,5",
      ];
      const inspection = inspectDownloadBytes(html, { forbiddenKeys });
      assert.strictEqual(inspection.isUtf8, true);
      assert.strictEqual(inspection.hasUnreleasedKeys, false);
      assert.strictEqual(inspection.unreleasedKeysFound.length, 0);
      assert.strictEqual(inspection.hasExternalRequests, false);

      unmount();
    });

    it("verifies history table and print mode do NOT leak answers or explanations", () => {
      const qIII: WebQuestion = {
        kind: "III",
        questionVersionId: "qIII-hist",
        title: "Câu III kiểm tra lịch sử",
        answerKey: "42",
        explanation: "Đáp án vũ trụ 42",
      };

      const exam = createAuditedExam([qIII], { releasePolicy: "after_deadline" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-hist-01",
        candidateName: "Thí sinh Lịch Sử",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-hist", questionOrder: ["qIII-hist"] },
        responses: {
          attemptId: "att-hist-01",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "III", questionVersionId: "qIII-hist", raw: "10" }],
        },
        startedAt: 1000,
        deadline: 60000,
        phase: "final",
        submittedAt: 5000,
        scoreDTO: null,
      };

      const repRes = buildReport(record, 10000);
      assert.strictEqual(repRes.ok, true);
      if (!repRes.ok) return;

      // Pass raw attempt records as history items
      const htmlWithHistory = renderReportHtml(repRes.value, {
        history: [record],
        currentAttemptId: "att-hist-01",
      });

      assert.strictEqual(htmlWithHistory.includes("class=\"history-table\""), true);
      // History table must not dump raw attemptSnapshot questions or answerKey
      assert.strictEqual(htmlWithHistory.includes("Đáp án vũ trụ 42"), false);
      assert.strictEqual(htmlWithHistory.includes("<code>42</code>"), false);

      // Verify print stylesheet rules do not reveal unreleased notices or answers
      assert.strictEqual(htmlWithHistory.includes("@media print"), true);
      assert.strictEqual(htmlWithHistory.includes("unreleased-notice"), true);
      assert.strictEqual(htmlWithHistory.includes("display: none !important"), true);
    });
  });

  describe("2. Audit: Unsafe HTML, Hostile Scripts & Hostile Assets", () => {
    it("safely escapes hostile script, img onerror, and svg onload in candidate names, titles, and responses", () => {
      const hostileName = "<script>alert('pwn-name')</script>Nguyễn Văn A";
      const hostileTitle = "<img src=x onerror=alert('pwn-title') />Câu hỏi độc hại";
      const hostileRaw = "<svg onload=alert('pwn-raw')>-0,5";

      const qIII: WebQuestion = {
        kind: "III",
        questionVersionId: "qIII-xss",
        title: hostileTitle,
        content: "Nội dung <b onmouseover=alert(1)>rê chuột</b>",
        answerKey: "42",
      };

      const exam = createAuditedExam([qIII], { releasePolicy: "immediate" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-xss-01",
        candidateName: hostileName,
        examSnapshot: exam,
        presentationOrder: { seed: "seed-xss", questionOrder: ["qIII-xss"] },
        responses: {
          attemptId: "att-xss-01",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "III", questionVersionId: "qIII-xss", raw: hostileRaw }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const repRes = buildReport(record, 2000);
      assert.strictEqual(repRes.ok, true);
      if (!repRes.ok) return;

      const html = renderReportHtml(repRes.value);
      // Ensure no unencoded hostile tags exist
      assert.strictEqual(html.includes("<script>alert("), false);
      assert.strictEqual(html.includes("<img src=x onerror="), false);
      assert.strictEqual(html.includes("<svg onload="), false);
      assert.strictEqual(html.includes("<b onmouseover="), false);

      // Verify inspectDownloadBytes flags zero hostile scripts
      const inspection = inspectDownloadBytes(html);
      assert.strictEqual(inspection.hasHostileScripts, false);
      assert.strictEqual(inspection.hostileMatchesFound.length, 0);
    });

    it("rejects hostile asset URLs (javascript:, data:text/html, http://) and displays safe missing placeholders", () => {
      const hostileAssets: WebExam["assets"] = [
        {
          assetId: "asset-js",
          mime: "image/png",
          data: "javascript:alert('pwn-asset')",
          alt: "Hostile JS asset",
        },
        {
          assetId: "asset-html",
          mime: "image/png",
          data: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
          alt: "Hostile HTML asset",
        },
        {
          assetId: "asset-remote",
          mime: "image/jpeg",
          data: "https://evil.example.com/tracker.jpg",
          alt: "Hostile remote asset",
        },
        {
          assetId: "asset-valid",
          mime: "image/png",
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          alt: "Safe transparent pixel",
        },
      ];

      const qI: WebQuestion = {
        kind: "I",
        questionVersionId: "qI-assets",
        title: "Câu hỏi chứa ảnh",
        blocks: [
          { type: "image", assetId: "asset-js", alt: "Ảnh JS" },
          { type: "image", assetId: "asset-remote", alt: "Ảnh Remote" },
          { type: "image", assetId: "asset-valid", alt: "Ảnh Hợp lệ" },
          { type: "image", assetId: "asset-nonexistent", alt: "Ảnh không tồn tại" },
        ],
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };

      const exam = createAuditedExam([qI], { assets: hostileAssets, releasePolicy: "immediate" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-asset-01",
        candidateName: "Thí sinh kiểm tra ảnh",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-asset", questionOrder: ["qI-assets"] },
        responses: {
          attemptId: "att-asset-01",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "qI-assets", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const repRes = buildReport(record, 2000);
      assert.strictEqual(repRes.ok, true);
      if (!repRes.ok) return;

      const html = renderReportHtml(repRes.value);
      // Hostile URLs must not be present
      assert.strictEqual(html.includes("javascript:alert"), false);
      assert.strictEqual(html.includes("data:text/html"), false);
      assert.strictEqual(html.includes("https://evil.example.com"), false);

      // Valid asset must be present
      assert.strictEqual(html.includes("data:image/png;base64,iVBORw0"), true);

      // Missing/unsafe placeholders must be rendered safely
      assert.strictEqual(html.includes('data-asset-id="asset-js"'), true);
      assert.strictEqual(html.includes('data-asset-id="asset-remote"'), true);
      assert.strictEqual(html.includes('data-asset-id="asset-nonexistent"'), true);

      const inspection = inspectDownloadBytes(html);
      assert.strictEqual(inspection.hasExternalRequests, false);
      assert.strictEqual(inspection.hasHostileScripts, false);
      assert.strictEqual(inspection.hasMissingAssets, true);
      assert.strictEqual(inspection.missingAssetPlaceholdersFound.length, 3);
    });
  });

  describe("3. Score Rational Consistency, Maxima Configurations & Repeating Fractions", () => {
    it("preserves exact Golden 12/15 without floating-point drift", () => {
      // Independently derived:
      // N1 = 20 Part I: each 0.25 pt -> MAX_I = 5/1
      // N2 = 10 Part II: each 1 pt -> MAX_II = 10/1
      // N3 = 0 Part III -> MAX_III = 0
      // BASE = 15 >= 10 -> MAX_TOTAL = 15/1
      // Candidate scores 20/20 on Part I -> scoreI = 5/1
      // Candidate scores 7 full (1 pt each), 3 wrong (0 pt each) on Part II -> scoreII = 7/1
      // Total score = 5 + 7 = 12/1. Display: 12/15.
      const questions: WebQuestion[] = [];
      const responses: Response[] = [];

      for (let i = 1; i <= 20; i++) {
        const qId = `g12_qI_${i}`;
        questions.push({
          kind: "I",
          questionVersionId: qId,
          options: [
            { optionId: "a", text: "A" },
            { optionId: "b", text: "B" },
            { optionId: "c", text: "C" },
            { optionId: "d", text: "D" },
          ],
          correctOptionId: "c",
        });
        responses.push({ kind: "I", questionVersionId: qId, selectedOptionId: "c" });
      }

      for (let i = 1; i <= 10; i++) {
        const qId = `g12_qII_${i}`;
        questions.push({
          kind: "II",
          questionVersionId: qId,
          statements: [
            { statementId: "s1", text: "S1", answer: true },
            { statementId: "s2", text: "S2", answer: true },
            { statementId: "s3", text: "S3", answer: true },
            { statementId: "s4", text: "S4", answer: true },
          ],
        });
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

      const exam = createAuditedExam(questions);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-golden-12-15",
        candidateName: "Thí sinh Golden 12/15",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-12-15", questionOrder: questions.map((q) => q.questionVersionId) },
        responses: { attemptId: "att-golden-12-15", examVersionId: exam.examVersionId, responses },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const repRes = buildReport(record, 2000);
      assert.strictEqual(repRes.ok, true);
      if (!repRes.ok) return;

      const model = repRes.value;
      const dto = model.scoreDTO as Record<string, unknown>;
      assert.strictEqual(dto.total, "12");
      assert.strictEqual(dto.maxTotal, "15");

      const html = renderReportHtml(model);
      assert.strictEqual(html.includes("12 / 15"), true, "HTML must display exact '12 / 15'");

      const inspection = inspectDownloadBytes(html, { expectedScores: ["12 / 15"] });
      assert.strictEqual(inspection.exactScoresPreserved, true);
    });

    it("preserves exact Golden 11/16 and exact 10/3 repeating fraction", () => {
      // Independently derived:
      // N1 = 20 Part I -> MAX_I = 5
      // N2 = 10 Part II -> MAX_II = 10
      // BASE = 15 >= 10 -> POINT_III = 0.25 = 1/4
      // N3 = 4 Part III -> MAX_III = 4 * 0.25 = 1
      // MAX_TOTAL = 5 + 10 + 1 = 16
      // Part I: 12 correct -> 12 * 0.25 = 3/5
      // Part II: 7 full (7 pts) + 1 with 3 correct statements (0.5 pt) + 2 wrong (0 pt) = 7.5 = 15/2. Max = 10.
      // Part III: 2 correct (0.5 pt) + 2 wrong = 0.5 = 1/2. Max = 1.
      // TOTAL = 3 + 7.5 + 0.5 = 11. Max = 16. Display: 11/16.
      const questions: WebQuestion[] = [];
      const responses: Response[] = [];

      for (let i = 1; i <= 20; i++) {
        const qId = `g16_qI_${i}`;
        questions.push({
          kind: "I",
          questionVersionId: qId,
          options: [
            { optionId: "a", text: "A" },
            { optionId: "b", text: "B" },
            { optionId: "c", text: "C" },
            { optionId: "d", text: "D" },
          ],
          correctOptionId: "a",
        });
        responses.push({ kind: "I", questionVersionId: qId, selectedOptionId: i <= 12 ? "a" : "b" });
      }

      for (let i = 1; i <= 10; i++) {
        const qId = `g16_qII_${i}`;
        questions.push({
          kind: "II",
          questionVersionId: qId,
          statements: [
            { statementId: "s1", text: "S1", answer: true },
            { statementId: "s2", text: "S2", answer: true },
            { statementId: "s3", text: "S3", answer: true },
            { statementId: "s4", text: "S4", answer: true },
          ],
        });
        if (i <= 7) {
          responses.push({
            kind: "II",
            questionVersionId: qId,
            answers: [
              { statementId: "s1", value: true },
              { statementId: "s2", value: true },
              { statementId: "s3", value: true },
              { statementId: "s4", value: true },
            ],
          });
        } else if (i === 8) {
          // 3 statements correct -> 0.5 pt (1/2 pt), status 'partial'
          responses.push({
            kind: "II",
            questionVersionId: qId,
            answers: [
              { statementId: "s1", value: true },
              { statementId: "s2", value: true },
              { statementId: "s3", value: true },
              { statementId: "s4", value: false },
            ],
          });
        } else {
          // 0 statements correct -> 0 pt, status 'wrong'
          responses.push({
            kind: "II",
            questionVersionId: qId,
            answers: [
              { statementId: "s1", value: false },
              { statementId: "s2", value: false },
              { statementId: "s3", value: false },
              { statementId: "s4", value: false },
            ],
          });
        }
      }

      for (let i = 1; i <= 4; i++) {
        const qId = `g16_qIII_${i}`;
        questions.push({ kind: "III", questionVersionId: qId, answerKey: "42" });
        responses.push({ kind: "III", questionVersionId: qId, raw: i <= 2 ? "42" : "0" });
      }

      const exam = createAuditedExam(questions);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-golden-11-16",
        candidateName: "Thí sinh Golden 11/16",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-11-16", questionOrder: questions.map((q) => q.questionVersionId) },
        responses: { attemptId: "att-golden-11-16", examVersionId: exam.examVersionId, responses },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const repRes = buildReport(record, 2000);
      assert.strictEqual(repRes.ok, true);
      if (!repRes.ok) return;

      const model = repRes.value;
      const dto = model.scoreDTO as Record<string, unknown>;
      assert.strictEqual(dto.total, "11");
      assert.strictEqual(dto.maxTotal, "16");

      const html = renderReportHtml(model);
      assert.strictEqual(html.includes("11 / 16"), true, "HTML must display exact '11 / 16'");
    });

    it("verifies N3=3 and N3=7 repeating fractions preserve exact Rational arithmetic", () => {
      // Case A: 3 Part III questions only
      // BASE = 0 < 10 -> POINT_III = 10/3. MAX_III = 3 * 10/3 = 10.
      // Candidate gets 1 correct -> score = 10/3.
      const q3: WebQuestion[] = [
        { kind: "III", questionVersionId: "q3_1", answerKey: "1,5" },
        { kind: "III", questionVersionId: "q3_2", answerKey: "-0,5" },
        { kind: "III", questionVersionId: "q3_3", answerKey: "100" },
      ];
      const examA = createAuditedExam(q3);
      const recA: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: examA.examId,
        examVersionId: examA.examVersionId,
        attemptId: "att-rep-3",
        candidateName: "Thí sinh Phân số lặp N3=3",
        examSnapshot: examA,
        presentationOrder: { seed: "seed-3", questionOrder: ["q3_1", "q3_2", "q3_3"] },
        responses: {
          attemptId: "att-rep-3",
          examVersionId: examA.examVersionId,
          responses: [
            { kind: "III", questionVersionId: "q3_1", raw: "1,5" }, // correct -> 10/3
            { kind: "III", questionVersionId: "q3_2", raw: "0" },   // wrong
            { kind: "III", questionVersionId: "q3_3", raw: "0" },   // wrong
          ],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const resA = buildReport(recA, 2000);
      assert.strictEqual(resA.ok, true);
      if (!resA.ok) return;

      const modelA = resA.value;
      const dtoA = modelA.scoreDTO as Record<string, unknown>;
      assert.strictEqual(dtoA.total, "10/3");
      assert.strictEqual(dtoA.maxTotal, "10");

      const htmlA = renderReportHtml(modelA);
      assert.strictEqual(htmlA.includes("10/3 / 10"), true, "HTML must display exact fraction '10/3 / 10'");

      // Case B: 7 Part III questions only
      // BASE = 0 < 10 -> POINT_III = 10/7. MAX_III = 7 * 10/7 = 10.
      // Candidate gets 2 correct -> score = 20/7.
      const q7: WebQuestion[] = [];
      const resp7: Response[] = [];
      for (let i = 1; i <= 7; i++) {
        const qId = `q7_${i}`;
        q7.push({ kind: "III", questionVersionId: qId, answerKey: "1" });
        resp7.push({ kind: "III", questionVersionId: qId, raw: i <= 2 ? "1" : "0" });
      }

      const examB = createAuditedExam(q7);
      const recB: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: examB.examId,
        examVersionId: examB.examVersionId,
        attemptId: "att-rep-7",
        candidateName: "Thí sinh Phân số lặp N3=7",
        examSnapshot: examB,
        presentationOrder: { seed: "seed-7", questionOrder: q7.map((q) => q.questionVersionId) },
        responses: { attemptId: "att-rep-7", examVersionId: examB.examVersionId, responses: resp7 },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const resB = buildReport(recB, 2000);
      assert.strictEqual(resB.ok, true);
      if (!resB.ok) return;

      const dtoB = resB.value.scoreDTO as Record<string, unknown>;
      assert.strictEqual(dtoB.total, "20/7");
      assert.strictEqual(dtoB.maxTotal, "10");

      const htmlB = renderReportHtml(resB.value);
      assert.strictEqual(htmlB.includes("20/7 / 10"), true, "HTML must display exact fraction '20/7 / 10'");
    });
  });

  describe("4. Audit: Full Final Adoption, Unicode Names & Malformed DTO / Snapshot Mismatch", () => {
    it("preserves full Unicode Vietnamese names across ReportModel, DOM, HTML, History, and Download", () => {
      const complexUnicodeName = "Trần Thị Ánh Dương (Học sinh Giỏi QG 2026 — SBD: 02049182 🌟)";
      const qI: WebQuestion = {
        kind: "I",
        questionVersionId: "qI-uni",
        title: "Câu hỏi Tiếng Việt chuẩn",
        options: [
          { optionId: "a", text: "Lựa chọn A" },
          { optionId: "b", text: "Lựa chọn B" },
          { optionId: "c", text: "Lựa chọn C" },
          { optionId: "d", text: "Lựa chọn D" },
        ],
        correctOptionId: "a",
      };

      const exam = createAuditedExam([qI], { releasePolicy: "immediate" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-unicode-full",
        candidateName: complexUnicodeName,
        examSnapshot: exam,
        presentationOrder: { seed: "seed-uni", questionOrder: ["qI-uni"] },
        responses: {
          attemptId: "att-unicode-full",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "qI-uni", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const repRes = buildReport(record, 2000);
      assert.strictEqual(repRes.ok, true);
      if (!repRes.ok) return;

      const model = repRes.value;
      assert.strictEqual(model.candidateName, complexUnicodeName);

      // DOM check
      const doc = createMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);
      const unmount = mount(root as unknown as HTMLElement, model);
      const domHtml = serializeMockToHtml(root);
      assert.strictEqual(domHtml.includes("Trần Thị Ánh Dương"), true);

      // HTML check
      const html = renderReportHtml(model);
      assert.strictEqual(html.includes("Trần Thị Ánh Dương"), true);

      // Download bytes UTF-8 check
      const inspection = inspectDownloadBytes(html);
      assert.strictEqual(inspection.isUtf8, true);

      unmount();
    });

    it("rejects malformed scoreDTO with SCORE_MISMATCH error", () => {
      const qI: WebQuestion = {
        kind: "I",
        questionVersionId: "qI-mal",
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };
      const exam = createAuditedExam([qI]);

      const baseRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-mal-dto",
        candidateName: "Thí sinh DTO lỗi",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-mal", questionOrder: ["qI-mal"] },
        responses: {
          attemptId: "att-mal-dto",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "qI-mal", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      // Case 1: scoreDTO is a string instead of object
      const recStringDTO = { ...baseRecord, scoreDTO: "corrupt_dto_string" };
      const res1 = buildReport(recStringDTO, 2000);
      assert.strictEqual(res1.ok, false);
      if (!res1.ok) {
        assert.strictEqual(res1.error.code, "SCORE_MISMATCH");
      }

      // Case 2: scoreDTO has corrupted total fraction
      const recCorruptFrac = {
        ...baseRecord,
        scoreDTO: {
          attemptId: "att-mal-dto",
          examVersionId: exam.examVersionId,
          ruleSetId: "custom-v1",
          inputPolicyId: "sa-charset-v1",
          engineVersion: "m1-1.0.0",
          total: "invalid_fraction",
          maxTotal: "1/4",
          sections: { I: { score: "1/4", max: "1/4" }, II: { score: "0", max: "0" }, III: { score: "0", max: "0" } },
          questions: [],
        },
      };
      const res2 = buildReport(recCorruptFrac, 2000);
      assert.strictEqual(res2.ok, false);
      if (!res2.ok) {
        assert.strictEqual(res2.error.code, "SCORE_MISMATCH");
      }

      // Case 3: tampered total score (actual is 1/4, stored claims 10)
      const recTampered = {
        ...baseRecord,
        scoreDTO: {
          attemptId: "att-mal-dto",
          examVersionId: exam.examVersionId,
          ruleSetId: "custom-v1",
          inputPolicyId: "sa-charset-v1",
          engineVersion: "m1-1.0.0",
          total: "10",
          maxTotal: "1/4",
          sections: { I: { score: "1/4", max: "1/4" }, II: { score: "0", max: "0" }, III: { score: "0", max: "0" } },
          questions: [
            { questionVersionId: "qI-mal", kind: "I", status: "full", points: "1/4", maxPoints: "1/4" },
          ],
        },
      };
      const res3 = buildReport(recTampered, 2000);
      assert.strictEqual(res3.ok, false);
      if (!res3.ok) {
        assert.strictEqual(res3.error.code, "SCORE_MISMATCH");
      }

      // Case 4: mismatched attemptId in scoreDTO
      const recMismatchedAttempt = {
        ...baseRecord,
        scoreDTO: {
          attemptId: "different-attempt-id",
          examVersionId: exam.examVersionId,
          ruleSetId: "custom-v1",
          inputPolicyId: "sa-charset-v1",
          engineVersion: "m1-1.0.0",
          total: "1/4",
          maxTotal: "1/4",
          sections: { I: { score: "1/4", max: "1/4" }, II: { score: "0", max: "0" }, III: { score: "0", max: "0" } },
          questions: [
            { questionVersionId: "qI-mal", kind: "I", status: "full", points: "1/4", maxPoints: "1/4" },
          ],
        },
      };
      const res4 = buildReport(recMismatchedAttempt, 2000);
      assert.strictEqual(res4.ok, false);
      if (!res4.ok) {
        assert.strictEqual(res4.error.code, "SCORE_MISMATCH");
      }
    });

    it("rejects snapshot mismatch between attempt record and exam snapshot or responses", () => {
      const qI: WebQuestion = {
        kind: "I",
        questionVersionId: "qI-snap",
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };
      const exam = createAuditedExam([qI], { examId: "exam-A", examVersionId: "ver-A" });

      const baseRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: "exam-A",
        examVersionId: "ver-A",
        attemptId: "att-snap-01",
        candidateName: "Thí sinh Mismatch Snapshot",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-snap", questionOrder: ["qI-snap"] },
        responses: {
          attemptId: "att-snap-01",
          examVersionId: "ver-A",
          responses: [{ kind: "I", questionVersionId: "qI-snap", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      // Case A: examSnapshot.examId differs from record.examId
      const recMismatchedExamId = {
        ...baseRecord,
        examSnapshot: { ...exam, examId: "tampered-exam-B" },
      };
      const resA = buildReport(recMismatchedExamId, 2000);
      assert.strictEqual(resA.ok, false);
      if (!resA.ok) {
        assert.strictEqual(resA.error.code, "SCORE_MISMATCH");
      }

      // Case B: responses.attemptId differs from record.attemptId
      const recMismatchedRespAtt = {
        ...baseRecord,
        responses: { ...baseRecord.responses, attemptId: "foreign-att-99" },
      };
      const resB = buildReport(recMismatchedRespAtt, 2000);
      assert.strictEqual(resB.ok, false);
      if (!resB.ok) {
        assert.strictEqual(resB.error.code, "SCORE_MISMATCH");
      }

      // Case C: malformed snapshot (questions is not an array)
      const recMalformedSnapshot = {
        ...baseRecord,
        examSnapshot: { ...exam, questions: "not_an_array" as unknown as readonly WebQuestion[] },
      };
      const resC = buildReport(recMalformedSnapshot, 2000);
      assert.strictEqual(resC.ok, false);
      if (!resC.ok) {
        assert.strictEqual(resC.error.code, "SNAPSHOT_INVALID");
      }
    });
  });

  describe("5. Acceptance Criteria: Print Engine Honesty & D02 Display Policy Gating", () => {
    it("AC: Print functionality is not advertised as a server-side PDF generator engine", () => {
      const qI: WebQuestion = {
        kind: "I",
        questionVersionId: "qI-pdf",
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };
      const exam = createAuditedExam([qI], { releasePolicy: "immediate" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-pdf-audit",
        candidateName: "Thí sinh In Báo Cáo",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-pdf", questionOrder: ["qI-pdf"] },
        responses: {
          attemptId: "att-pdf-audit",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "qI-pdf", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const repRes = buildReport(record, 2000);
      assert.strictEqual(repRes.ok, true);
      if (!repRes.ok) return;

      const html = renderReportHtml(repRes.value);
      // HTML footer explicitly clarifies no server-side programmatic PDF generation
      assert.strictEqual(
        html.includes("Tính năng lưu PDF sử dụng hộp thoại in của trình duyệt; hệ thống không tạo tệp PDF lập trình phía máy chủ."),
        true
      );
      assert.strictEqual(html.includes("onclick=\"window.print()\""), true);
      assert.strictEqual(html.includes("In báo cáo"), true);

      // Verify DOM view button
      const doc = createMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);
      const unmount = mount(root as unknown as HTMLElement, repRes.value);

      const btnPrint = doc.getElementById("btnPrintReport");
      assert.ok(btnPrint, "Print report button must exist in DOM");
      assert.strictEqual(btnPrint.textContent?.includes("In / Lưu Báo Cáo"), true);

      unmount();
    });

    it("AC: D02 display policy remains gated; exact rational is the ungated default", () => {
      const qIII: WebQuestion = {
        kind: "III",
        questionVersionId: "qIII-d02",
        answerKey: "1",
      };
      // 3 Part III questions -> each 10/3
      const exam = createAuditedExam([qIII, { ...qIII, questionVersionId: "qIII-d02-2" }, { ...qIII, questionVersionId: "qIII-d02-3" }], {
        releasePolicy: "immediate",
      });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-d02-audit",
        candidateName: "Thí sinh D02 Policy",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-d02", questionOrder: ["qIII-d02", "qIII-d02-2", "qIII-d02-3"] },
        responses: {
          attemptId: "att-d02-audit",
          examVersionId: exam.examVersionId,
          responses: [
            { kind: "III", questionVersionId: "qIII-d02", raw: "1" },
            { kind: "III", questionVersionId: "qIII-d02-2", raw: "0" },
            { kind: "III", questionVersionId: "qIII-d02-3", raw: "0" },
          ],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      // 1. Default without displayPolicy -> EXACT fraction "10/3"
      const resDefault = buildReport(record, 2000);
      assert.strictEqual(resDefault.ok, true);
      if (!resDefault.ok) return;

      const qDefault = resDefault.value.questions[0]!;
      assert.strictEqual(qDefault.points, "10/3");
      assert.strictEqual(qDefault.maxPoints, "10/3");

      const htmlDefault = renderReportHtml(resDefault.value);
      assert.strictEqual(htmlDefault.includes("10/3 / 10"), true);
      assert.strictEqual(htmlDefault.includes("3.33"), false);

      // 2. Explicitly gated decimal display policy injection (D02)
      const decimalPolicy: DisplayPolicy = { mode: "decimal", fractionDigits: 2 };
      const resDecimal = buildReport(record, 2000, { displayPolicy: decimalPolicy });
      assert.strictEqual(resDecimal.ok, true);
      if (!resDecimal.ok) return;

      const qDecimal = resDecimal.value.questions[0]!;
      assert.strictEqual(qDecimal.points, "3.33");
      assert.strictEqual(qDecimal.maxPoints, "3.33");

      const htmlDecimal = renderReportHtml(resDecimal.value, { displayPolicy: decimalPolicy });
      assert.strictEqual(htmlDecimal.includes("3.33 / 10.00"), true);
    });
  });
});
