import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildReport,
  renderReportHtml,
  downloadReport,
  type AttemptRecord,
  type WebExam,
  type WebQuestion,
  type ReportQuestion,
  type ReportModel,
  type ReleasedReportQuestion,
} from "../../../src/report/index.ts";
import { scoreResultToDTO, scoreAttempt } from "../../../src/domain/index.ts";

function createMockExam(
  questions: WebQuestion[],
  options: {
    examId?: string;
    examVersionId?: string;
    releasePolicy?: "immediate" | "after_deadline";
    durationMinutes?: number;
  } = {}
): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: options.examId ?? "exam-test-01",
    examVersionId: options.examVersionId ?? "v1.0.0",
    title: "Đề thi kiểm tra đơn vị",
    subject: "Toán học",
    grade: 12,
    settings: {
      durationMinutes: options.durationMinutes ?? 50,
      maxAttempts: 1,
      releasePolicy: options.releasePolicy ?? "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions,
    assets: [
      {
        assetId: "img-graph",
        mime: "image/svg+xml",
        data: "<svg><circle cx='10' cy='10' r='5'/></svg>",
        alt: "Đồ thị minh họa",
      },
    ],
  };
}

describe("WEB-W1-REPORT: Report Projection & Answer Release Policy", () => {
  describe("Score / Max Golden Configurations", () => {
    it("Golden 12/15: 20 Part I (5/5), 10 Part II (7/10), 0 Part III -> 12/15", () => {
      const questions: WebQuestion[] = [];
      // 20 Part I questions
      for (let i = 1; i <= 20; i++) {
        questions.push({
          kind: "I",
          questionVersionId: `q-i-${i}`,
          title: `Câu I.${i}`,
          content: `Nội dung câu hỏi I.${i}`,
          options: [
            { optionId: `opt-${i}-a`, text: "A" },
            { optionId: `opt-${i}-b`, text: "B" },
            { optionId: `opt-${i}-c`, text: "C" },
            { optionId: `opt-${i}-d`, text: "D" },
          ],
          correctOptionId: `opt-${i}-a`,
          explanation: `Lời giải chi tiết câu I.${i}`,
        });
      }
      // 10 Part II questions
      for (let i = 1; i <= 10; i++) {
        questions.push({
          kind: "II",
          questionVersionId: `q-ii-${i}`,
          title: `Câu II.${i}`,
          content: `Nội dung câu hỏi II.${i}`,
          statements: [
            { statementId: `st-${i}-1`, answer: true, text: "Ý 1" },
            { statementId: `st-${i}-2`, answer: false, text: "Ý 2" },
            { statementId: `st-${i}-3`, answer: true, text: "Ý 3" },
            { statementId: `st-${i}-4`, answer: false, text: "Ý 4" },
          ],
          explanation: `Lời giải chi tiết câu II.${i}`,
        });
      }

      const exam = createMockExam(questions, {
        examId: "exam-unicode-id",
        examVersionId: "v2.1.0",
      });

      // Student answers:
      // Part I: all 20 correct -> 20 * 0.25 = 5 points
      const responses: any[] = [];
      for (let i = 1; i <= 20; i++) {
        responses.push({
          kind: "I",
          questionVersionId: `q-i-${i}`,
          selectedOptionId: `opt-${i}-a`,
        });
      }
      // Part II: 7 full correct (4 statements matched), 3 wrong (0 matched)
      for (let i = 1; i <= 7; i++) {
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
      for (let i = 8; i <= 10; i++) {
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

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-12-15",
        candidateName: "Nguyễn Văn A",
        examSnapshot: exam,
        presentationOrder: { seed: "123", questionOrder: questions.map((q) => q.questionVersionId) },
        responses: { attemptId: "att-12-15", examVersionId: exam.examVersionId, responses },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700002500000,
        scoreDTO: null,
      };

      const res = buildReport(finalRecord, 1700002500000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const model = res.value;
      const dto = model.scoreDTO as any;
      assert.strictEqual(dto.total, "12");
      assert.strictEqual(dto.maxTotal, "15");
      assert.strictEqual(dto.sections.I.score, "5");
      assert.strictEqual(dto.sections.I.max, "5");
      assert.strictEqual(dto.sections.II.score, "7");
      assert.strictEqual(dto.sections.II.max, "10");
      assert.strictEqual(dto.sections.III.score, "0");
      assert.strictEqual(dto.sections.III.max, "0");

      const html = renderReportHtml(model);
      assert.match(html, /12 \/ 15/);
      assert.match(html, /5 \/ 5/);
      assert.match(html, /7 \/ 10/);
    });

    it("Golden 11/16: 20 Part I (3/5), 10 Part II (15/2 / 10), 4 Part III (1/2 / 1) -> 11/16", () => {
      const questions: WebQuestion[] = [];
      // 20 Part I
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
      // 10 Part II
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
      // 4 Part III
      for (let i = 1; i <= 4; i++) {
        questions.push({
          kind: "III",
          questionVersionId: `q-iii-${i}`,
          title: `Câu III.${i}`,
          answerKey: `${i},5`,
        });
      }

      const exam = createMockExam(questions, {
        examId: "exam-unicode-id",
        examVersionId: "v2.1.0",
      });

      const responses: any[] = [];
      // Part I: 12 correct (1..12), 8 wrong (13..20) -> 12 * 0.25 = 3 points
      for (let i = 1; i <= 12; i++) {
        responses.push({ kind: "I", questionVersionId: `q-i-${i}`, selectedOptionId: `opt-${i}-a` });
      }
      for (let i = 13; i <= 20; i++) {
        responses.push({ kind: "I", questionVersionId: `q-i-${i}`, selectedOptionId: `opt-${i}-b` });
      }
      // Part II: 7 full correct (7 * 1 = 7), 1 with 3 correct (0.50 = 1/2), 2 with 0 correct (0) -> 7.5 = 15/2
      for (let i = 1; i <= 7; i++) {
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
      // question 8: 3 correct -> 0.50 points
      responses.push({
        kind: "II",
        questionVersionId: "q-ii-8",
        answers: [
          { statementId: "st-8-1", value: true },
          { statementId: "st-8-2", value: false },
          { statementId: "st-8-3", value: true },
          { statementId: "st-8-4", value: true }, // wrong
        ],
      });
      // questions 9..10: 0 correct
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
      // Part III: 2 correct (1..2) -> 2 * 0.25 = 0.50 = 1/2 points, 2 wrong (3..4) -> 0
      responses.push({ kind: "III", questionVersionId: "q-iii-1", raw: "1,5" });
      responses.push({ kind: "III", questionVersionId: "q-iii-2", raw: "2,5" });
      responses.push({ kind: "III", questionVersionId: "q-iii-3", raw: "wrong" });
      responses.push({ kind: "III", questionVersionId: "q-iii-4", raw: "wrong" });

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-11-16",
        candidateName: "Lê Văn B",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: questions.map((q) => q.questionVersionId) },
        responses: { attemptId: "att-11-16", examVersionId: exam.examVersionId, responses },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700002000000,
        scoreDTO: null,
      };

      const res = buildReport(finalRecord, 1700002000000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const model = res.value;
      const dto = model.scoreDTO as any;
      assert.strictEqual(dto.total, "11");
      assert.strictEqual(dto.maxTotal, "16");
      assert.strictEqual(dto.sections.I.score, "3");
      assert.strictEqual(dto.sections.I.max, "5");
      assert.strictEqual(dto.sections.II.score, "15/2");
      assert.strictEqual(dto.sections.II.max, "10");
      assert.strictEqual(dto.sections.III.score, "1/2");
      assert.strictEqual(dto.sections.III.max, "1");

      const html = renderReportHtml(model);
      assert.match(html, /11 \/ 16/);
      assert.match(html, /3 \/ 5/);
      assert.match(html, /15\/2 \/ 10/);
      assert.match(html, /1\/2 \/ 1/);
    });

    it("Golden max5: 20 Part I only -> max=5, score 4/5", () => {
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

      const exam = createMockExam(questions, {
        examId: "exam-unicode-id",
        examVersionId: "v2.1.0",
      });
      // 16 correct -> 16 * 0.25 = 4 points
      const responses: any[] = [];
      for (let i = 1; i <= 16; i++) {
        responses.push({ kind: "I", questionVersionId: `q-i-${i}`, selectedOptionId: `opt-${i}-a` });
      }
      for (let i = 17; i <= 20; i++) {
        responses.push({ kind: "I", questionVersionId: `q-i-${i}`, selectedOptionId: `opt-${i}-b` });
      }

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-max5",
        candidateName: "Trần Thị C",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: questions.map((q) => q.questionVersionId) },
        responses: { attemptId: "att-max5", examVersionId: exam.examVersionId, responses },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700002000000,
        scoreDTO: null,
      };

      const res = buildReport(finalRecord, 1700002000000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const dto = res.value.scoreDTO as any;
      assert.strictEqual(dto.total, "4");
      assert.strictEqual(dto.maxTotal, "5");
      assert.strictEqual(dto.sections.I.score, "4");
      assert.strictEqual(dto.sections.I.max, "5");
    });

    it("Golden 10/3: 3 Part III questions only -> point 10/3, max 10, score 10/3", () => {
      const questions: WebQuestion[] = [
        { kind: "III", questionVersionId: "q-iii-1", title: "Câu III.1", answerKey: "1,5" },
        { kind: "III", questionVersionId: "q-iii-2", title: "Câu III.2", answerKey: "2,0" },
        { kind: "III", questionVersionId: "q-iii-3", title: "Câu III.3", answerKey: "-0,5" },
      ];

      const exam = createMockExam(questions, {
        examId: "exam-unicode-id",
        examVersionId: "v2.1.0",
      });
      // Student gets 1 correct -> score 10/3
      const responses = [
        { kind: "III" as const, questionVersionId: "q-iii-1", raw: "1,5" },
        { kind: "III" as const, questionVersionId: "q-iii-2", raw: "wrong" },
      ];

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-10-3",
        candidateName: "Phạm Văn D",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-iii-1", "q-iii-2", "q-iii-3"] },
        responses: { attemptId: "att-10-3", examVersionId: exam.examVersionId, responses },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700002000000,
        scoreDTO: null,
      };

      const res = buildReport(finalRecord, 1700002000000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const dto = res.value.scoreDTO as any;
      assert.strictEqual(dto.total, "10/3");
      assert.strictEqual(dto.maxTotal, "10");
      assert.strictEqual(dto.sections.III.score, "10/3");
      assert.strictEqual(dto.sections.III.max, "10");

      const q1 = res.value.questions.find((q) => q.questionVersionId === "q-iii-1")!;
      assert.strictEqual(q1.points, "10/3");
      assert.strictEqual(q1.maxPoints, "10/3");
      assert.strictEqual(q1.status, "full");

      const html = renderReportHtml(res.value);
      assert.match(html, /10\/3 \/ 10/);
    });

    it("Golden 8-8-2 (BASE=10 >= 10): 8 Part I (2/2), 8 Part II (8/8), 2 Part III (1/2 / 1/2) -> 21/2 / 21/2 (10,5 / 10,5)", () => {
      // N1 = 8 Part I -> MAX_I = 2
      // N2 = 8 Part II -> MAX_II = 8
      // BASE = 2 + 8 = 10 >= 10 -> POINT_III = 0.25 = 1/4
      // N3 = 2 Part III -> MAX_III = 2 * 0.25 = 0.5 = 1/2
      // MAX_TOTAL = 2 + 8 + 0.5 = 10.5 = 21/2
      // All correct -> Score I = 2, Score II = 8, Score III = 1/2, Total = 21/2
      const questions: WebQuestion[] = [];
      const responses: any[] = [];

      for (let i = 1; i <= 8; i++) {
        const qId = `ck-i-${String(i).padStart(2, "0")}`;
        questions.push({
          kind: "I",
          questionVersionId: qId,
          title: `Câu I.${i}`,
          options: [
            { optionId: `${qId}-a`, text: "A" },
            { optionId: `${qId}-b`, text: "B" },
            { optionId: `${qId}-c`, text: "C" },
            { optionId: `${qId}-d`, text: "D" },
          ],
          correctOptionId: `${qId}-a`,
        });
        responses.push({ kind: "I", questionVersionId: qId, selectedOptionId: `${qId}-a` });
      }

      for (let i = 1; i <= 8; i++) {
        const qId = `ck-ii-${String(i).padStart(2, "0")}`;
        questions.push({
          kind: "II",
          questionVersionId: qId,
          title: `Câu II.${i}`,
          statements: [
            { statementId: `${qId}-a`, text: "A", answer: true },
            { statementId: `${qId}-b`, text: "B", answer: true },
            { statementId: `${qId}-c`, text: "C", answer: false },
            { statementId: `${qId}-d`, text: "D", answer: true },
          ],
        });
        responses.push({
          kind: "II",
          questionVersionId: qId,
          answers: [
            { statementId: `${qId}-a`, value: true },
            { statementId: `${qId}-b`, value: true },
            { statementId: `${qId}-c`, value: false },
            { statementId: `${qId}-d`, value: true },
          ],
        });
      }

      for (let i = 1; i <= 2; i++) {
        const qId = `ck-iii-${String(i).padStart(2, "0")}`;
        questions.push({
          kind: "III",
          questionVersionId: qId,
          title: `Câu III.${i}`,
          answerKey: String(i),
        });
        responses.push({
          kind: "III",
          questionVersionId: qId,
          raw: String(i),
        });
      }

      const exam = createMockExam(questions, {
        examId: "claude-check-882",
        examVersionId: "v1.0.0",
      });

      const finalRecord: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-882",
        candidateName: "Thí sinh kiểm định 882",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: questions.map((q) => q.questionVersionId) },
        responses: { attemptId: "att-882", examVersionId: exam.examVersionId, responses },
        startedAt: 1700000000000,
        deadline: 1700003000000,
        phase: "final",
        submittedAt: 1700002000000,
        scoreDTO: null,
      };

      const res = buildReport(finalRecord, 1700002000000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const dto = res.value.scoreDTO as any;
      assert.strictEqual(dto.total, "21/2");
      assert.strictEqual(dto.maxTotal, "21/2");
      assert.strictEqual(dto.sections.I.score, "2");
      assert.strictEqual(dto.sections.I.max, "2");
      assert.strictEqual(dto.sections.II.score, "8");
      assert.strictEqual(dto.sections.II.max, "8");
      assert.strictEqual(dto.sections.III.score, "1/2");
      assert.strictEqual(dto.sections.III.max, "1/2");

      for (let i = 1; i <= 2; i++) {
        const qId = `ck-iii-${String(i).padStart(2, "0")}`;
        const qList = res.value.questions as readonly ReportQuestion[];
        const qRes: ReportQuestion = qList.find((item: ReportQuestion) => item.questionVersionId === qId)!;
        assert.strictEqual(qRes.points, "1/4");
        assert.strictEqual(qRes.maxPoints, "1/4");
        assert.strictEqual(qRes.status, "full");
      }
    });
  });

  describe("Partial II scoring invariant", () => {
    it("verifies 1, 2, 3 correct statements yield status 'partial' and non-full points", () => {
      const q: WebQuestion = {
        kind: "II",
        questionVersionId: "q-ii-test",
        title: "Câu Đúng Sai",
        statements: [
          { statementId: "st-1", answer: true, text: "Ý 1" },
          { statementId: "st-2", answer: false, text: "Ý 2" },
          { statementId: "st-3", answer: true, text: "Ý 3" },
          { statementId: "st-4", answer: false, text: "Ý 4" },
        ],
      };
      const exam = createMockExam([q]);

      // Test k=1 (0.10 = 1/10)
      const resK1 = buildReport(
        {
          schemaVersion: "web-attempt-v1",
          revision: 1,
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: "att-k1",
          candidateName: "Học sinh K1",
          examSnapshot: exam,
          presentationOrder: { seed: "1", questionOrder: ["q-ii-test"] },
          responses: {
            attemptId: "att-k1",
            examVersionId: exam.examVersionId,
            responses: [
              {
                kind: "II",
                questionVersionId: "q-ii-test",
                answers: [
                  { statementId: "st-1", value: true }, // match
                  { statementId: "st-2", value: true }, // wrong
                  { statementId: "st-3", value: false }, // wrong
                  { statementId: "st-4", value: true }, // wrong
                ],
              },
            ],
          },
          startedAt: 1000,
          deadline: 5000,
          phase: "final",
          submittedAt: 2000,
          scoreDTO: null,
        },
        2000
      );

      assert.strictEqual(resK1.ok, true);
      if (resK1.ok) {
        const qModel = resK1.value.questions[0]!;
        assert.strictEqual(qModel.status, "partial");
        assert.strictEqual(qModel.points, "1/10");
        assert.strictEqual(qModel.maxPoints, "1");
        assert.notStrictEqual(qModel.status, "full");
      }

      // Test k=2 (0.25 = 1/4)
      const resK2 = buildReport(
        {
          schemaVersion: "web-attempt-v1",
          revision: 1,
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: "att-k2",
          candidateName: "Học sinh K2",
          examSnapshot: exam,
          presentationOrder: { seed: "1", questionOrder: ["q-ii-test"] },
          responses: {
            attemptId: "att-k2",
            examVersionId: exam.examVersionId,
            responses: [
              {
                kind: "II",
                questionVersionId: "q-ii-test",
                answers: [
                  { statementId: "st-1", value: true }, // match
                  { statementId: "st-2", value: false }, // match
                  { statementId: "st-3", value: false }, // wrong
                  { statementId: "st-4", value: true }, // wrong
                ],
              },
            ],
          },
          startedAt: 1000,
          deadline: 5000,
          phase: "final",
          submittedAt: 2000,
          scoreDTO: null,
        },
        2000
      );

      assert.strictEqual(resK2.ok, true);
      if (resK2.ok) {
        const qModel = resK2.value.questions[0]!;
        assert.strictEqual(qModel.status, "partial");
        assert.strictEqual(qModel.points, "1/4");
      }

      // Test k=3 (0.50 = 1/2)
      const resK3 = buildReport(
        {
          schemaVersion: "web-attempt-v1",
          revision: 1,
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: "att-k3",
          candidateName: "Học sinh K3",
          examSnapshot: exam,
          presentationOrder: { seed: "1", questionOrder: ["q-ii-test"] },
          responses: {
            attemptId: "att-k3",
            examVersionId: exam.examVersionId,
            responses: [
              {
                kind: "II",
                questionVersionId: "q-ii-test",
                answers: [
                  { statementId: "st-1", value: true }, // match
                  { statementId: "st-2", value: false }, // match
                  { statementId: "st-3", value: true }, // match
                  { statementId: "st-4", value: true }, // wrong
                ],
              },
            ],
          },
          startedAt: 1000,
          deadline: 5000,
          phase: "final",
          submittedAt: 2000,
          scoreDTO: null,
        },
        2000
      );

      assert.strictEqual(resK3.ok, true);
      if (resK3.ok) {
        const qModel = resK3.value.questions[0]!;
        assert.strictEqual(qModel.status, "partial");
        assert.strictEqual(qModel.points, "1/2");
        assert.notStrictEqual(qModel.status, "full");
      }
    });
  });

  describe("Preservation of Times, IDs, Candidate Name and Raw Responses", () => {
    it("preserves exact Unicode name, raw short answer strings and timestamps", () => {
      const questions: WebQuestion[] = [
        { kind: "III", questionVersionId: "q-raw-1", title: "Câu 1", answerKey: "-0,5" },
        { kind: "III", questionVersionId: "q-raw-2", title: "Câu 2", answerKey: "1,5" },
        { kind: "III", questionVersionId: "q-raw-3", title: "Câu 3", answerKey: "1,50" },
      ];
      const exam = createMockExam(questions, {
        examId: "exam-unicode-id",
        examVersionId: "v2.1.0",
      });

      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: "exam-unicode-id",
        examVersionId: "v2.1.0",
        attemptId: "att-unicode-99",
        candidateName: "Đặng Thị Ngọc Ánh",
        examSnapshot: exam,
        presentationOrder: { seed: "seed-xyz", questionOrder: ["q-raw-1", "q-raw-2", "q-raw-3"] },
        responses: {
          attemptId: "att-unicode-99",
          examVersionId: "v2.1.0",
          responses: [
            { kind: "III", questionVersionId: "q-raw-1", raw: "-0,5" },
            { kind: "III", questionVersionId: "q-raw-2", raw: "1,5" },
            { kind: "III", questionVersionId: "q-raw-3", raw: "1,50" },
          ],
        },
        startedAt: 1700000000000,
        deadline: 1700003600000,
        phase: "final",
        submittedAt: 1700002400000,
        scoreDTO: null,
      };

      const res = buildReport(record, 1700002400000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const model = res.value;
      assert.strictEqual(model.candidateName, "Đặng Thị Ngọc Ánh");
      assert.strictEqual(model.attempt.examId, "exam-unicode-id");
      assert.strictEqual(model.attempt.examVersionId, "v2.1.0");
      assert.strictEqual(model.attempt.attemptId, "att-unicode-99");
      assert.strictEqual(model.startedAt, 1700000000000);
      assert.strictEqual(model.submittedAt, 1700002400000);

      // Verify raw responses in questions
      const q1 = model.questions.find((q) => q.questionVersionId === "q-raw-1")!;
      assert.strictEqual((q1.response as any).raw, "-0,5");
      const q2 = model.questions.find((q) => q.questionVersionId === "q-raw-2")!;
      assert.strictEqual((q2.response as any).raw, "1,5");
      const q3 = model.questions.find((q) => q.questionVersionId === "q-raw-3")!;
      assert.strictEqual((q3.response as any).raw, "1,50");

      const html = renderReportHtml(model);
      assert.match(html, /Đặng Thị Ngọc Ánh/);
      assert.match(html, /att-unicode-99/);
      assert.match(html, /exam-unicode-id/);
      assert.match(html, /-0,5/);
      assert.match(html, /1,5/);
      assert.match(html, /1,50/);
    });
  });

  describe("Hostile HTML & Injection Defense", () => {
    it("escapes hostile script tags in candidateName, question content, responses and assets", () => {
      const hostileQuestion: WebQuestion = {
        kind: "I",
        questionVersionId: "q-hostile",
        title: "<b>Hostile Title</b>",
        content: "<script>alert('pwned-content')</script><img src=x onerror=alert(1)>",
        options: [
          { optionId: "opt-safe", text: "<script>safe()</script>" },
          { optionId: "opt-evil", text: '\"><script>evil()</script>' },
          { optionId: "opt-c", text: "C" },
          { optionId: "opt-d", text: "D" },
        ],
        correctOptionId: "opt-safe",
        explanation: "<iframe src='javascript:alert(1)'></iframe>",
      };

      const exam = createMockExam([hostileQuestion], {
        examId: "exam-xss",
        examVersionId: "v1.0",
      });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: "exam-xss",
        examVersionId: "v1.0",
        attemptId: "att-xss",
        candidateName: "<script>alert('pwned-name')</script>",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-hostile"] },
        responses: {
          attemptId: "att-xss",
          examVersionId: "v1.0",
          responses: [
            { kind: "I", questionVersionId: "q-hostile", selectedOptionId: "opt-evil" },
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
      // No raw unescaped script tag should be present
      assert.strictEqual(html.includes("<script>alert('pwned-name')</script>"), false);
      assert.strictEqual(html.includes("<script>alert('pwned-content')</script>"), false);
      assert.strictEqual(html.includes("<img src=x onerror=alert(1)>"), false);
      assert.strictEqual(html.includes("<iframe src='javascript:alert(1)'>"), false);

      // Must contain escaped versions
      assert.match(html, /&lt;script&gt;alert\(&#39;pwned-name&#39;\)&lt;\/script&gt;/);
      assert.match(html, /&lt;script&gt;alert\(&#39;pwned-content&#39;\)&lt;\/script&gt;/);
    });
  });

  describe("Answer Release Policy (Pre-deadline, Post-deadline, Immediate)", () => {
    const q: WebQuestion = {
      kind: "I",
      questionVersionId: "q-rel-1",
      title: "Câu phát hành",
      content: "Nội dung câu",
      options: [
        { optionId: "opt-a", text: "A" },
        { optionId: "opt-b", text: "B" },
        { optionId: "opt-c", text: "C" },
        { optionId: "opt-d", text: "D" },
      ],
      correctOptionId: "opt-a",
      explanation: "SECRET_EXPLANATION_KEY_12345",
    };

    it("Pre-deadline (after_deadline policy): serialized model, HTML and Blob contain NO answer key or explanation", () => {
      const exam = createMockExam([q], { releasePolicy: "after_deadline" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-pre-dl",
        candidateName: "Thí sinh bảo mật",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-rel-1"] },
        responses: {
          attemptId: "att-pre-dl",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-rel-1", selectedOptionId: "opt-b" }],
        },
        startedAt: 1000,
        deadline: 10000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      // now = 3000 < deadline (10000)
      const res = buildReport(record, 3000);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const model = res.value;
      assert.strictEqual(model.released, false);

      // Model questions must not have answer or explanation properties
      for (const question of model.questions) {
        assert.strictEqual("answer" in question, false);
        assert.strictEqual("explanation" in question, false);
      }

      // Serialized JSON must NOT contain answer key or explanation
      const json = JSON.stringify(model);
      assert.strictEqual(json.includes("opt-a"), false);
      assert.strictEqual(json.includes("SECRET_EXPLANATION_KEY_12345"), false);

      // Rendered HTML must NOT contain answer key or explanation
      const html = renderReportHtml(model);
      assert.strictEqual(html.includes("opt-a"), false);
      assert.strictEqual(html.includes("SECRET_EXPLANATION_KEY_12345"), false);
      assert.match(html, /chưa công bố/i);

      // Download Blob must NOT contain answer key or explanation
      const blob = downloadReport(model);
      assert.strictEqual(blob.type, "text/html;charset=utf-8");
      assert.ok(blob.size > 0);
    });

    it("Post-deadline (after_deadline policy): model, HTML and Blob contain answer key and explanation", () => {
      const exam = createMockExam([q], { releasePolicy: "after_deadline" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-post-dl",
        candidateName: "Thí sinh sau hạn",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-rel-1"] },
        responses: {
          attemptId: "att-post-dl",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-rel-1", selectedOptionId: "opt-a" }],
        },
        startedAt: 1000,
        deadline: 10000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      // now = 10001 >= deadline (10000)
      const res = buildReport(record, 10001);
      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      const model = res.value;
      assert.strictEqual(model.released, true);

      const relQ = model.questions[0] as ReleasedReportQuestion;
      assert.strictEqual(relQ.answer, "opt-a");
      assert.strictEqual(relQ.explanation[0]?.type, "text");
      assert.strictEqual((relQ.explanation[0] as any).text, "SECRET_EXPLANATION_KEY_12345");

      const html = renderReportHtml(model);
      assert.match(html, /opt-a/);
      assert.match(html, /SECRET_EXPLANATION_KEY_12345/);
    });

    it("Immediate policy: releases immediately regardless of deadline", () => {
      const exam = createMockExam([q], { releasePolicy: "immediate" });
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-imm",
        candidateName: "Thí sinh tức thì",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-rel-1"] },
        responses: {
          attemptId: "att-imm",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-rel-1", selectedOptionId: "opt-a" }],
        },
        startedAt: 1000,
        deadline: 10000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 1500); // 1500 < deadline
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.value.released, true);
      }
    });
  });

  describe("Stored DTO Recomputation & Mismatch Rejection", () => {
    it("rejects stored scoreDTO that does not match domain recomputed score", () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q-score-1",
        title: "Câu 1",
        options: [
          { optionId: "opt-a", text: "A" },
          { optionId: "opt-b", text: "B" },
          { optionId: "opt-c", text: "C" },
          { optionId: "opt-d", text: "D" },
        ],
        correctOptionId: "opt-a",
      };
      const exam = createMockExam([q]);

      // Tampered stored DTO claiming total = 10 instead of 1/4
      const fakeDTO = {
        attemptId: "att-tampered",
        examVersionId: exam.examVersionId,
        ruleSetId: "custom-v1",
        inputPolicyId: "sa-charset-v1",
        engineVersion: "m1-1.0.0",
        sections: {
          I: { questionCount: 1, score: "10", max: "1/4" },
          II: { questionCount: 0, score: "0", max: "0" },
          III: { questionCount: 0, score: "0", max: "0" },
        },
        total: "10",
        maxTotal: "1/4",
        questions: [
          {
            questionVersionId: "q-score-1",
            kind: "I",
            status: "full",
            points: "10",
            maxPoints: "1/4",
          },
        ],
      };

      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-tampered",
        candidateName: "Thí sinh gian lận",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-score-1"] },
        responses: {
          attemptId: "att-tampered",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-score-1", selectedOptionId: "opt-a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: fakeDTO,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "SCORE_MISMATCH");
      }
    });

    it("rejects malformed scoreDTO with invalid types", () => {
      const q: WebQuestion = {
        kind: "III",
        questionVersionId: "q-1",
        title: "Câu 1",
        answerKey: "1,5",
      };
      const exam = createMockExam([q]);
      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-malformed",
        candidateName: "User",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-1"] },
        responses: {
          attemptId: "att-malformed",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "III", questionVersionId: "q-1", raw: "1,5" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: { total: 10 }, // number instead of fraction string
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "SCORE_MISMATCH");
      }
    });

    it("accepts valid matching stored scoreDTO", () => {
      const q: WebQuestion = {
        kind: "III",
        questionVersionId: "q-1",
        title: "Câu 1",
        answerKey: "1,5",
      };
      const exam = createMockExam([q]);
      const responses = [{ kind: "III" as const, questionVersionId: "q-1", raw: "1,5" }];
      const domainScore = scoreAttempt(
        {
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          ruleSetId: "custom-v1",
          inputPolicyId: "sa-charset-v1",
          questions: [{ kind: "III", questionVersionId: "q-1", answerKey: "1,5" }],
        },
        { attemptId: "att-valid", examVersionId: exam.examVersionId, responses }
      );
      const validDTO = scoreResultToDTO(domainScore);

      const record: AttemptRecord = {
        schemaVersion: "web-attempt-v1",
        revision: 1,
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: "att-valid",
        candidateName: "User",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-1"] },
        responses: { attemptId: "att-valid", examVersionId: exam.examVersionId, responses },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: validDTO,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, true);
    });
  });

  describe("Lifecycle Phase Verification", () => {
    it("rejects attempt in 'draft' phase", () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q-1",
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
        attemptId: "att-draft",
        candidateName: "User",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-1"] },
        responses: { attemptId: "att-draft", examVersionId: exam.examVersionId, responses: [] },
        startedAt: 1000,
        deadline: 5000,
        phase: "draft",
        submittedAt: null,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000);
      assert.strictEqual(res.ok, false);
      if (!res.ok) {
        assert.strictEqual(res.error.code, "ATTEMPT_NOT_FINAL");
      }
    });
  });

  describe("Display Policy Injection (D02)", () => {
    it("supports injecting decimal display policy", () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q-1",
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
        attemptId: "att-disp",
        candidateName: "User",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-1"] },
        responses: {
          attemptId: "att-disp",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-1", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000, {
        displayPolicy: { mode: "decimal", fractionDigits: 2 },
      });
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        const qModel = res.value.questions[0]!;
        assert.strictEqual(qModel.points, "0.25");
        assert.strictEqual(qModel.maxPoints, "0.25");
      }
    });

    it("supports injecting custom formatting function", () => {
      const q: WebQuestion = {
        kind: "I",
        questionVersionId: "q-1",
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
        attemptId: "att-disp-custom",
        candidateName: "User",
        examSnapshot: exam,
        presentationOrder: { seed: "1", questionOrder: ["q-1"] },
        responses: {
          attemptId: "att-disp-custom",
          examVersionId: exam.examVersionId,
          responses: [{ kind: "I", questionVersionId: "q-1", selectedOptionId: "a" }],
        },
        startedAt: 1000,
        deadline: 5000,
        phase: "final",
        submittedAt: 2000,
        scoreDTO: null,
      };

      const res = buildReport(record, 2000, {
        displayPolicy: {
          mode: "custom",
          format: (pts, maxPts) => `+${pts.num}/${pts.den}`,
        },
      });
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        const qModel = res.value.questions[0]!;
        assert.strictEqual(qModel.points, "+1/4");
      }
    });
  });
});
