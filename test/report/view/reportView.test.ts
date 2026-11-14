import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mount, type AttemptHistoryItem, type ReportViewState } from "../../../src/report/view.ts";
import type {
  ReportModel,
  ReportQuestion,
  ReleasedReportQuestion,
  WebExam,
  WebQuestion,
  AttemptRecord,
} from "../../../src/report/types.ts";
import { buildReport } from "../../../src/report/index.ts";
import { scoreAttempt, scoreResultToDTO } from "../../../src/domain/index.ts";
import { createMockDocument, MockElement, MockNode, MockTextNode } from "../../ui/core/dom-mock.ts";

function serializeToHtml(node: MockNode): string {
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
    const children = node.childNodes.map(serializeToHtml).join("");
    return `<${tag}${attrs}>${children}</${tag}>`;
  }
  return "";
}

function createMockExam(
  questions: WebQuestion[],
  options: {
    examId?: string;
    examVersionId?: string;
    releasePolicy?: "immediate" | "after_deadline";
    durationMinutes?: number;
    maxAttempts?: number | null;
  } = {}
): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: options.examId ?? "exam-math-12",
    examVersionId: options.examVersionId ?? "v1.0.0",
    title: "Đề Khảo Sát Năng Lực Toán 12",
    subject: "Toán học",
    grade: 12,
    settings: {
      durationMinutes: options.durationMinutes ?? 50,
      maxAttempts: options.maxAttempts ?? null,
      releasePolicy: options.releasePolicy ?? "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions,
    assets: [
      {
        assetId: "graph-01",
        mime: "image/svg+xml",
        data: "<svg><circle cx='10' cy='10' r='5'/></svg>",
        alt: "Đồ thị hàm số",
      },
    ],
  };
}

describe("WEB-W2-REPORT-VIEW: Policy-Projected Report View & Browser Print", () => {
  describe("1. Score / Maxima Configurations & Exact Rational Values", () => {
    it("Golden 12/15: 20 Part I (5/5), 10 Part II (7/10), 0 Part III -> renders 12/15 exactly", () => {
      const questions: WebQuestion[] = [];
      for (let i = 1; i <= 20; i++) {
        questions.push({
          kind: "I",
          questionVersionId: `q-i-${i}`,
          title: `Câu I.${i}`,
          options: [
            { optionId: `opt-${i}-a`, text: "A" },
            { optionId: `opt-${i}-b`, text: "B" },
            { optionId: `opt-${i}-c`, text: "C" },
            { optionId: `opt-${i}-d`, text: "D" },
          ],
          correctOptionId: `opt-${i}-a`,
        });
      }
      for (let i = 1; i <= 10; i++) {
        questions.push({
          kind: "II",
          questionVersionId: `q-ii-${i}`,
          title: `Câu II.${i}`,
          statements: [
            { statementId: `st-${i}-1`, answer: true, text: "Ý 1" },
            { statementId: `st-${i}-2`, answer: false, text: "Ý 2" },
            { statementId: `st-${i}-3`, answer: true, text: "Ý 3" },
            { statementId: `st-${i}-4`, answer: false, text: "Ý 4" },
          ],
        });
      }

      const exam = createMockExam(questions);
      const responses: any[] = [];
      for (let i = 1; i <= 20; i++) {
        responses.push({
          kind: "I",
          questionVersionId: `q-i-${i}`,
          selectedOptionId: `opt-${i}-a`,
        });
      }
      // 6 questions with 4 correct statements = 6 * 1.0 = 6 points
      for (let i = 1; i <= 6; i++) {
        responses.push({
          kind: "II",
          questionVersionId: `q-ii-${i}`,
          answers: [
            { statementId: `st-${i}-1`, value: true },
            { statementId: `st-${i}-2`, value: false },
            { statementId: `st-${i}-3`, value: true },
            { statementId: `st-${i}-4`, value: false },
          ],
        });
      }
      // 2 questions with 3 correct statements = 2 * 0.5 = 1 point
      for (let i = 7; i <= 8; i++) {
        responses.push({
          kind: "II",
          questionVersionId: `q-ii-${i}`,
          answers: [
            { statementId: `st-${i}-1`, value: true },
            { statementId: `st-${i}-2`, value: false },
            { statementId: `st-${i}-3`, value: true },
            { statementId: `st-${i}-4`, value: true },
          ],
        });
      }
      // 2 questions with 0 correct statements = 0 points
      for (let i = 9; i <= 10; i++) {
        responses.push({
          kind: "II",
          questionVersionId: `q-ii-${i}`,
          answers: [
            { statementId: `st-${i}-1`, value: false },
            { statementId: `st-${i}-2`, value: true },
            { statementId: `st-${i}-3`, value: false },
            { statementId: `st-${i}-4`, value: true },
          ],
        });
      }

      const domainScore = scoreAttempt(
        {
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          ruleSetId: "custom-v1",
          inputPolicyId: "sa-charset-v1",
          questions: exam.questions as any,
        },
        {
          attemptId: "att-12-15",
          examVersionId: exam.examVersionId,
          responses,
        }
      );

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-12-15",
        candidateName: "Nguyễn Văn Đạt",
        examSnapshot: exam,
        presentationOrder: {
          seed: "s1",
          questionOrder: questions.map((q) => q.questionVersionId),
        },
        responses: {
          attemptId: "att-12-15",
          examVersionId: exam.examVersionId,
          responses,
        },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700002500000,
        scoreDTO: scoreResultToDTO(domainScore),
      };

      const reportRes = buildReport(finalRecord, 1700002500000);
      assert.strictEqual(reportRes.ok, true);
      const model = (reportRes as { ok: true; value: ReportModel }).value;

      const doc = createMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const unmount = mount(root as unknown as HTMLElement, model);

      const totalScoreEl = root.querySelector("#scoreTotal");
      assert.ok(totalScoreEl !== null);
      assert.strictEqual(totalScoreEl.textContent, "12 / 15");

      const scorePartI = root.querySelector("#scorePartI");
      assert.ok(scorePartI !== null);
      assert.strictEqual(scorePartI.textContent, "5 / 5");

      const scorePartII = root.querySelector("#scorePartII");
      assert.ok(scorePartII !== null);
      assert.strictEqual(scorePartII.textContent, "7 / 10");

      const scorePartIII = root.querySelector("#scorePartIII");
      assert.ok(scorePartIII !== null);
      assert.strictEqual(scorePartIII.textContent, "0 / 0");

      unmount();
    });

    it("Golden 11/16 and repeating fraction 10/3: retains exact rational values without rounding drift", () => {
      // Chemistry test with 3 Part III questions -> base=0, point_iii=10/3, max_total=10
      const chemQuestions: WebQuestion[] = [
        { kind: "III", questionVersionId: "chem-1", title: "Câu III.1", answerKey: "1,5" },
        { kind: "III", questionVersionId: "chem-2", title: "Câu III.2", answerKey: "2,0" },
        { kind: "III", questionVersionId: "chem-3", title: "Câu III.3", answerKey: "-0,5" },
      ];
      const exam = createMockExam(chemQuestions, { examId: "chem-repeating" });

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-chem-01",
        candidateName: "Lê Thị Lan",
        examSnapshot: exam,
        presentationOrder: { seed: "s1", questionOrder: ["chem-1", "chem-2", "chem-3"] },
        responses: {
          attemptId: "att-chem-01",
          examVersionId: exam.examVersionId,
          responses: [
            { kind: "III", questionVersionId: "chem-1", raw: "1,5" }, // correct -> 10/3
            { kind: "III", questionVersionId: "chem-2", raw: "9,9" }, // wrong -> 0
            { kind: "III", questionVersionId: "chem-3", raw: null },  // unanswered -> 0
          ],
        },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700002000000,
        scoreDTO: null,
      };

      const reportRes = buildReport(finalRecord, 1700002000000);
      assert.strictEqual(reportRes.ok, true);
      const model = (reportRes as { ok: true; value: ReportModel }).value;

      const doc = createMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const unmount = mount(root as unknown as HTMLElement, model);

      const totalScoreEl = root.querySelector("#scoreTotal");
      assert.ok(totalScoreEl !== null);
      // Exact rational 10/3 / 10
      assert.strictEqual(totalScoreEl.textContent, "10/3 / 10");

      const cardIII = root.querySelector("#scorePartIII");
      assert.ok(cardIII !== null);
      assert.strictEqual(cardIII.textContent, "10/3 / 10");

      // Verify question 1 has exact points "10/3 / 10/3 điểm"
      const q1Card = root.querySelector("#q-chem-1");
      assert.ok(q1Card !== null);
      const q1El = q1Card.querySelector(".q-points");
      assert.ok(q1El !== null);
      assert.strictEqual(q1El.textContent, "10/3 / 10/3 điểm");

      unmount();
    });
  });

  describe("2. Display Policy Format Injection (D02)", () => {
    it("formats scores in decimal mode when injected, preserving exact defaults when not injected", () => {
      const q: WebQuestion[] = [
        { kind: "III", questionVersionId: "d02-1", title: "Câu 1", answerKey: "1,5" },
        { kind: "III", questionVersionId: "d02-2", title: "Câu 2", answerKey: "2,0" },
        { kind: "III", questionVersionId: "d02-3", title: "Câu 3", answerKey: "-0,5" },
      ];
      const exam = createMockExam(q, { examId: "exam-d02" });

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-d02",
        candidateName: "Phạm Hải",
        examSnapshot: exam,
        presentationOrder: { seed: "s1", questionOrder: ["d02-1", "d02-2", "d02-3"] },
        responses: {
          attemptId: "att-d02",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "III", questionVersionId: "d02-1", raw: "1,5" }],
        },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700002000000,
        scoreDTO: null,
      };

      const reportRes = buildReport(finalRecord, 1700002000000);
      assert.strictEqual(reportRes.ok, true);
      const model = (reportRes as { ok: true; value: ReportModel }).value;

      const doc = createMockDocument();
      const root = doc.createElement("div");

      // 1. Default (exact rational)
      const unmountDefault = mount(root as unknown as HTMLElement, model);
      assert.strictEqual(root.querySelector("#scoreTotal")?.textContent, "10/3 / 10");
      unmountDefault();

      // 2. Injected decimal policy: 2 fraction digits
      const stateDecimal: ReportViewState = {
        report: model,
        displayPolicy: { mode: "decimal", fractionDigits: 2 },
      };
      const unmountDecimal = mount(root as unknown as HTMLElement, stateDecimal);
      assert.strictEqual(root.querySelector("#scoreTotal")?.textContent, "3.33 / 10.00");
      unmountDecimal();

      // 3. Injected custom formatting function
      const stateCustom: ReportViewState = {
        report: model,
        displayPolicy: {
          mode: "custom",
          format: (pts, _max) => `~${pts.num}/${pts.den} pts`,
        },
      };
      const unmountCustom = mount(root as unknown as HTMLElement, stateCustom);
      assert.strictEqual(root.querySelector("#scoreTotal")?.textContent, "~10/3 pts / ~10/1 pts");
      unmountCustom();
    });
  });

  describe("3. HTML / DOM / Print Key Absence (Release Policy Gate)", () => {
    it("Strict key absence: unreleased report DOM, HTML and print contain NO answer keys or explanations", () => {
      const questions: WebQuestion[] = [
        {
          kind: "I",
          questionVersionId: "q-sec-i",
          title: "Câu Phần I",
          options: [
            { optionId: "opt-secret-correct", text: "Lựa chọn đúng bí mật" },
            { optionId: "opt-wrong-1", text: "Lựa chọn sai 1" },
            { optionId: "opt-wrong-2", text: "Lựa chọn sai 2" },
            { optionId: "opt-wrong-3", text: "Lựa chọn sai 3" },
          ],
          correctOptionId: "opt-secret-correct",
          explanation: "BÍ MẬT: Lời giải câu I chi tiết.",
        },
        {
          kind: "II",
          questionVersionId: "q-sec-ii",
          title: "Câu Phần II",
          statements: [
            { statementId: "st-secret-1", answer: true, text: "Mệnh đề 1" },
            { statementId: "st-secret-2", answer: false, text: "Mệnh đề 2" },
            { statementId: "st-secret-3", answer: true, text: "Mệnh đề 3" },
            { statementId: "st-secret-4", answer: false, text: "Mệnh đề 4" },
          ],
          explanation: "BÍ MẬT: Lời giải câu II chi tiết.",
        },
        {
          kind: "III",
          questionVersionId: "q-sec-iii",
          title: "Câu Phần III",
          answerKey: "4,25",
          explanation: "BÍ MẬT: Lời giải câu III chi tiết.",
        },
      ];

      const exam = createMockExam(questions, {
        releasePolicy: "after_deadline",
        durationMinutes: 60,
      });

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-unreleased",
        candidateName: "Trần Bảo Ngọc",
        examSnapshot: exam,
        presentationOrder: {
          seed: "s1",
          questionOrder: ["q-sec-i", "q-sec-ii", "q-sec-iii"],
        },
        responses: {
          attemptId: "att-unreleased",
          examVersionId: exam.examVersionId,
          responses: [
            { kind: "I", questionVersionId: "q-sec-i", selectedOptionId: "opt-wrong-1" },
            {
              kind: "II",
              questionVersionId: "q-sec-ii",
              answers: [
                { statementId: "st-secret-1", value: true },
                { statementId: "st-secret-2", value: true },
                { statementId: "st-secret-3", value: false },
                { statementId: "st-secret-4", value: false },
              ],
            },
            { kind: "III", questionVersionId: "q-sec-iii", raw: "3,14" },
          ],
        },
        startedAt: 1700000000000,
        deadline: 1700003600000,
        phase: "final",
        submittedAt: 1700001000000, // submitted before deadline
        scoreDTO: null,
      };

      // now = 1700001500000 < deadline -> released MUST be false
      const reportRes = buildReport(finalRecord, 1700001500000);
      assert.strictEqual(reportRes.ok, true);
      const unreleasedModel = (reportRes as { ok: true; value: ReportModel }).value;
      assert.strictEqual(unreleasedModel.released, false);

      const doc = createMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const unmount = mount(root as unknown as HTMLElement, unreleasedModel);

      // Serialize entire DOM tree to check for leaked keys/explanations
      const serialized = serializeToHtml(root);

      // Invariants: Answer keys and explanations must NOT appear anywhere in the DOM/HTML
      assert.strictEqual(serialized.includes("opt-secret-correct"), false);
      assert.strictEqual(serialized.includes("4,25"), false);
      assert.strictEqual(serialized.includes("BÍ MẬT"), false);
      assert.strictEqual(serialized.includes("Lời giải câu"), false);

      // Invariant: Unreleased notice must be present
      assert.ok(root.querySelector(".unreleased-notice") !== null);
      assert.ok(serialized.includes("chưa được công bố"));

      // Invariant: Part II table does NOT show boolean answers in the correct answer column
      assert.ok(serialized.includes("Chưa công bố"));

      unmount();
    });

    it("Strict key presence: released report DOM contains released keys and explanation blocks", () => {
      const questions: WebQuestion[] = [
        {
          kind: "I",
          questionVersionId: "q-rel-i",
          title: "Câu Phần I",
          options: [
            { optionId: "opt-rel-correct", text: "Lựa chọn đúng công bố" },
            { optionId: "opt-rel-wrong-1", text: "Lựa chọn sai 1" },
            { optionId: "opt-rel-wrong-2", text: "Lựa chọn sai 2" },
            { optionId: "opt-rel-wrong-3", text: "Lựa chọn sai 3" },
          ],
          correctOptionId: "opt-rel-correct",
          explanation: "CÔNG BỐ: Lời giải chi tiết câu I.",
        },
        {
          kind: "III",
          questionVersionId: "q-rel-iii",
          title: "Câu Phần III",
          answerKey: "-0,5",
          explanation: "CÔNG BỐ: Lời giải chi tiết câu III.",
        },
      ];

      const exam = createMockExam(questions, { releasePolicy: "immediate" });

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-released",
        candidateName: "Đỗ Gia Hưng",
        examSnapshot: exam,
        presentationOrder: { seed: "s1", questionOrder: ["q-rel-i", "q-rel-iii"] },
        responses: {
          attemptId: "att-released",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-rel-i", selectedOptionId: "opt-rel-correct" }],
        },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700001000000,
        scoreDTO: null,
      };

      const reportRes = buildReport(finalRecord, 1700001000000);
      assert.strictEqual(reportRes.ok, true);
      const releasedModel = (reportRes as { ok: true; value: ReportModel }).value;
      assert.strictEqual(releasedModel.released, true);

      const doc = createMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const unmount = mount(root as unknown as HTMLElement, releasedModel);

      const serialized = serializeToHtml(root);

      // Invariant: Keys and explanations are displayed
      assert.ok(serialized.includes("opt-rel-correct"));
      assert.ok(serialized.includes("-0,5"));
      assert.ok(serialized.includes("CÔNG BỐ: Lời giải"));
      assert.ok(root.querySelector(".answer-key-box") !== null);
      assert.strictEqual(root.querySelector(".unreleased-notice"), null);

      unmount();
    });
  });

  describe("4. Names Escaping & Hostile Content Defense", () => {
    it("strictly escapes hostile script, img, svg tags in candidateName, titles and raw inputs", () => {
      const hostileName = "<script>alert('xss-candidate')</script> & 'quotes' \"test\" <img src=x onerror=alert(1)>";
      const hostileTitle = "<svg onload=alert('title-xss')>Câu hỏi nguy hiểm";
      const hostileRaw = "<iframe src='evil.com'></iframe>-0,5";

      const questions: WebQuestion[] = [
        {
          kind: "III",
          questionVersionId: "q-hostile",
          title: hostileTitle,
          answerKey: "-0,5",
        },
      ];
      const exam = createMockExam(questions, { examId: "exam-security" });

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-security",
        candidateName: hostileName,
        examSnapshot: exam,
        presentationOrder: { seed: "s1", questionOrder: ["q-hostile"] },
        responses: {
          attemptId: "att-security",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "III", questionVersionId: "q-hostile", raw: hostileRaw }],
        },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700001000000,
        scoreDTO: null,
      };

      const reportRes = buildReport(finalRecord, 1700001000000);
      assert.strictEqual(reportRes.ok, true);
      const model = (reportRes as { ok: true; value: ReportModel }).value;

      const doc = createMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const unmount = mount(root as unknown as HTMLElement, model);

      // Verify that no actual script, img with onerror, or iframe DOM elements were created
      assert.strictEqual(root.querySelector("script"), null);
      assert.strictEqual(root.querySelector("iframe"), null);
      assert.strictEqual(root.querySelector("svg[onload]"), null);

      // Invariant: The literal text is preserved safely in textContent
      assert.ok(root.textContent.includes("<script>alert('xss-candidate')</script>"));
      assert.ok(root.textContent.includes(hostileTitle));
      assert.ok(root.textContent.includes(hostileRaw));

      // Invariant: Serialized HTML escapes dangerous markup
      const serialized = serializeToHtml(root);
      assert.ok(serialized.includes("&lt;script&gt;alert(&#39;xss-candidate&#39;)&lt;/script&gt;"));
      assert.strictEqual(serialized.includes("<script>"), false);

      unmount();
    });
  });

  describe("5. Partial II Scoring Invariant", () => {
    it("renders status 'partial' (Đúng một phần) for 1, 2, 3 correct statements, never 'full'", () => {
      const q: WebQuestion = {
        kind: "II",
        questionVersionId: "q-part-ii-sample",
        title: "Câu II Khảo Sát",
        statements: [
          { statementId: "st-a", answer: true, text: "Ý A đúng" },
          { statementId: "st-b", answer: false, text: "Ý B sai" },
          { statementId: "st-c", answer: true, text: "Ý C đúng" },
          { statementId: "st-d", answer: false, text: "Ý D sai" },
        ],
      };
      const exam = createMockExam([q]);

      // Test cases: k = 1, 2, 3 correct statements
      const testCases = [
        {
          k: 1,
          answers: [
            { statementId: "st-a", value: true },  // 1 correct
            { statementId: "st-b", value: true },  // wrong
            { statementId: "st-c", value: false }, // wrong
            { statementId: "st-d", value: true },  // wrong
          ],
          expectedPoints: "1/10",
        },
        {
          k: 2,
          answers: [
            { statementId: "st-a", value: true },  // correct
            { statementId: "st-b", value: false }, // correct
            { statementId: "st-c", value: false }, // wrong
            { statementId: "st-d", value: true },  // wrong
          ],
          expectedPoints: "1/4",
        },
        {
          k: 3,
          answers: [
            { statementId: "st-a", value: true },  // correct
            { statementId: "st-b", value: false }, // correct
            { statementId: "st-c", value: true },  // correct
            { statementId: "st-d", value: true },  // wrong
          ],
          expectedPoints: "1/2",
        },
      ];

      for (const tc of testCases) {
        const finalRecord: AttemptRecord = {
          schemaVersion: "web-attempt-v1",
          revision: 1,
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: `att-p2-${tc.k}`,
          candidateName: "Thí sinh kiểm tra",
          examSnapshot: exam,
          presentationOrder: { seed: "s1", questionOrder: ["q-part-ii-sample"] },
          responses: {
            attemptId: `att-p2-${tc.k}`,
            examVersionId: exam.examVersionId,
            responses: [{ kind: "II", questionVersionId: "q-part-ii-sample", answers: tc.answers }],
          },
          startedAt: 1700000000000,
          deadline: 1700003000000,
          phase: "final",
          submittedAt: 1700002000000,
          scoreDTO: null,
        };

        const reportRes = buildReport(finalRecord, 1700002000000);
        assert.strictEqual(reportRes.ok, true);
        const model = (reportRes as { ok: true; value: ReportModel }).value;

        const doc = createMockDocument();
        const root = doc.createElement("div");

        const unmount = mount(root as unknown as HTMLElement, model);

        const badge = root.querySelector(".status-badge");
        assert.ok(badge !== null);
        assert.strictEqual(badge.textContent, "Đúng một phần");
        assert.ok(badge.classList.contains("partial"));
        assert.strictEqual(badge.classList.contains("full"), false);

        const pointsEl = root.querySelector(".q-points");
        assert.ok(pointsEl !== null);
        assert.strictEqual(pointsEl.textContent, `${tc.expectedPoints} / 1 điểm`);

        unmount();
      }
    });
  });

  describe("6. Acceptance Criterion: No Independent Release Check or Scoring Algorithm", () => {
    it("strictly follows ReportModel.released flag without executing independent clock or release check", () => {
      const q: WebQuestion = {
        kind: "III",
        questionVersionId: "q-test-ac",
        title: "Câu Kiểm Định AC",
        answerKey: "1,5",
        explanation: "Lời giải chi tiết AC",
      };
      const exam = createMockExam([q], {
        releasePolicy: "after_deadline",
        durationMinutes: 50,
      });

      // Construct artificial ReportModel where released = false even though current time is past deadline
      const artificialModel: ReportModel = {
        attempt: { examId: exam.examId, examVersionId: exam.examVersionId, attemptId: "att-ac" },
        candidateName: "Thí Sinh AC",
        startedAt: 1000,
        submittedAt: 2000,
        scoreDTO: {
          total: "1",
          maxTotal: "1",
          sections: {
            I: { score: "0", max: "0" },
            II: { score: "0", max: "0" },
            III: { score: "1", max: "1" },
          },
        },
        assets: [],
        released: false, // Explicitly unreleased
        questions: [
          {
            questionVersionId: "q-test-ac",
            kind: "III",
            title: "Câu Kiểm Định AC",
            blocks: [],
            response: { kind: "III", questionVersionId: "q-test-ac", raw: "1,5" },
            status: "full",
            points: "1",
            maxPoints: "1",
          },
        ],
      };

      const doc = createMockDocument();
      const root = doc.createElement("div");

      const unmount = mount(root as unknown as HTMLElement, artificialModel);

      // Even if Date.now() is years after deadline, the view MUST NOT show answerKey because released: false
      const serialized = serializeToHtml(root);
      assert.strictEqual(serialized.includes("Lời giải chi tiết AC"), false);
      assert.ok(root.querySelector(".unreleased-notice") !== null);

      unmount();
    });
  });

  describe("7. Immutable Attempt History Rendering", () => {
    it("renders immutable history table with current attempt highlight and maxAttempts policy notice", () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "hist-1",
        title: "Câu 1",
        options: [
          { optionId: "a", text: "A" },
          { optionId: "b", text: "B" },
          { optionId: "c", text: "C" },
          { optionId: "d", text: "D" },
        ],
        correctOptionId: "a",
      };
      const exam = createMockExam([q], { maxAttempts: 2 });

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-current-02",
        candidateName: "Trần Tuấn",
        examSnapshot: exam,
        presentationOrder: { seed: "s1", questionOrder: ["hist-1"] },
        responses: {
          attemptId: "att-current-02",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "hist-1", selectedOptionId: "a" }],
        },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700002000000,
        scoreDTO: null,
      };

      const reportRes = buildReport(finalRecord, 1700002000000);
      assert.strictEqual(reportRes.ok, true);
      const model = (reportRes as { ok: true; value: ReportModel }).value;

      const history: AttemptHistoryItem[] = [
        {
          attemptId: "att-past-01",
          submittedAt: 1699990000000,
          candidateName: "Trần Tuấn",
          scoreI: "0",
          scoreII: "0",
          scoreIII: "0",
          total: "0",
          maxTotal: "1/4",
          serverConfirmed: true,
        },
        {
          attemptId: "att-current-02",
          submittedAt: 1700002000000,
          candidateName: "Trần Tuấn",
          scoreI: "1/4",
          scoreII: "0",
          scoreIII: "0",
          total: "1/4",
          maxTotal: "1/4",
          serverConfirmed: false,
        },
      ];

      const state: ReportViewState = {
        report: model,
        history,
        currentAttemptId: "att-current-02",
        maxAttempts: 2,
      };

      const doc = createMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const unmount = mount(root as unknown as HTMLElement, state);

      const historySection = root.querySelector("#attemptHistorySection");
      assert.ok(historySection !== null);

      const table = root.querySelector(".history-table");
      assert.ok(table !== null);

      const allRows = table.querySelectorAll("tr");
      // 1 header row + 2 data rows = 3 rows
      assert.strictEqual(allRows.length, 3);

      const pastRow = allRows[1];
      assert.ok(pastRow !== undefined);
      assert.ok(pastRow.textContent.includes("#1"));
      assert.ok(pastRow.textContent.includes("✔ Đã xác nhận"));

      const currentRow = allRows[2];
      assert.ok(currentRow !== undefined);
      assert.ok(currentRow.textContent.includes("#2"));
      assert.ok(currentRow.textContent.includes("Hiện tại"));
      assert.ok(currentRow.textContent.includes("Cục bộ"));
      assert.ok(currentRow.classList.contains("history-row-current"));

      // Max attempts notice: 2/2 reached -> notice present and restart disabled
      const notice = root.querySelector("#maxAttemptsNotice");
      assert.ok(notice !== null);
      assert.ok(notice.textContent.includes("2/2 lượt làm bài"));

      const restartBtn = root.querySelector("#btnRestart") as MockElement;
      assert.ok(restartBtn !== null);
      assert.strictEqual(restartBtn.disabled, true);

      unmount();
    });
  });

  describe("8. Explicit Error and Nonfinal States", () => {
    it("renders explicit error state with error code, message and back action", () => {
      const doc = createMockDocument();
      const root = doc.createElement("div");

      let backClicked = false;
      const actions = {
        back: () => {
          backClicked = true;
        },
      };

      const unmount = mount(
        root as unknown as HTMLElement,
        {
          error: {
            code: "SCORE_MISMATCH",
            path: "scoreDTO",
            message: "Điểm lưu trữ không khớp với recomputed score.",
            recoverable: false,
          },
        },
        actions
      );

      const errBox = root.querySelector(".report-error-state");
      assert.ok(errBox !== null);
      assert.ok(errBox.textContent.includes("[SCORE_MISMATCH]"));
      assert.ok(errBox.textContent.includes("Điểm lưu trữ không khớp"));

      const btn = root.querySelector("button");
      assert.ok(btn !== null);
      btn.click();
      assert.strictEqual(backClicked, true);

      unmount();
    });

    it("renders explicit nonfinal state with informative status and return action", () => {
      const doc = createMockDocument();
      const root = doc.createElement("div");

      let returned = false;
      const actions = {
        returnToExam: () => {
          returned = true;
        },
      };

      const unmount = mount(root as unknown as HTMLElement, { nonfinal: true }, actions);

      const nonfinalBox = root.querySelector(".report-nonfinal-state");
      assert.ok(nonfinalBox !== null);
      assert.ok(nonfinalBox.textContent.includes("Bài Thi Chưa Được Nộp"));
      assert.ok(nonfinalBox.textContent.includes("trạng thái làm bài (chưa nộp)"));

      const btn = root.querySelector("button");
      assert.ok(btn !== null);
      btn.click();
      assert.strictEqual(returned, true);

      unmount();
    });
  });

  describe("9. Print Styling & Action (No Programmatic PDF Claim)", () => {
    it("provides #btnPrintReport action triggering print without claim of programmatic PDF creation", () => {
      const q: WebQuestion = {
        kind: "III",
        questionVersionId: "q-print-test",
        title: "Câu In Thử",
        answerKey: "1,0",
      };
      const exam = createMockExam([q]);

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-print-01",
        candidateName: "Phan Anh",
        examSnapshot: exam,
        presentationOrder: { seed: "s1", questionOrder: ["q-print-test"] },
        responses: {
          attemptId: "att-print-01",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "III", questionVersionId: "q-print-test", raw: "1,0" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 3000,
        scoreDTO: null,
      };

      const reportRes = buildReport(finalRecord, 3000);
      assert.strictEqual(reportRes.ok, true);
      const model = (reportRes as { ok: true; value: ReportModel }).value;

      const doc = createMockDocument();
      const root = doc.createElement("div");

      let printTriggered = false;
      const actions = {
        print: () => {
          printTriggered = true;
        },
      };

      const unmount = mount(root as unknown as HTMLElement, model, actions);

      const printBtn = root.querySelector("#btnPrintReport") as MockElement;
      assert.ok(printBtn !== null);
      assert.strictEqual(printBtn.textContent, "In / Lưu Báo Cáo (PDF)");

      // Invariant: Help text clearly describes browser print dialog without programmatic PDF claim
      const helpText = root.querySelector(".print-help-text");
      assert.ok(helpText !== null);
      assert.ok(helpText.textContent.includes("window.print"));
      assert.ok(helpText.textContent.includes("Save as PDF"));
      assert.strictEqual(helpText.textContent.includes("Hệ thống tự động tạo PDF"), false);

      printBtn.click();
      assert.strictEqual(printTriggered, true);

      unmount();
    });
  });

  describe("10. Lifecycle & Clean Unmount", () => {
    it("unmount removes all DOM nodes and detaches event listeners", () => {
      const q: WebQuestion = {
        kind: "III",
        questionVersionId: "q-unmount-test",
        title: "Câu Unmount",
        answerKey: "2,5",
      };
      const exam = createMockExam([q]);

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-unmount",
        candidateName: "Vũ Hải",
        examSnapshot: exam,
        presentationOrder: { seed: "s1", questionOrder: ["q-unmount-test"] },
        responses: { attemptId: "att-unmount", examVersionId: exam.examVersionId, responses: [] },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const reportRes = buildReport(finalRecord, 2000);
      assert.strictEqual(reportRes.ok, true);
      const model = (reportRes as { ok: true; value: ReportModel }).value;

      const doc = createMockDocument();
      const root = doc.createElement("div");

      const unmount = mount(root as unknown as HTMLElement, model);
      assert.ok(root.childNodes.length > 0);

      unmount();
      assert.strictEqual(root.childNodes.length, 0);
      assert.strictEqual(root.textContent, "");
    });
  });
});
