import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseExam, toDomainExam } from "../../src/schema/exam.ts";
import {
  computeExamMax,
  scoreAttempt,
  validateExamVersion,
  toFractionString,
  rational,
  equals,
} from "../../src/domain/index.ts";
import type { AttemptResponses, ResponseI, ResponseII, ResponseIII } from "../../src/domain/index.ts";

describe("Subject Fixtures & Golden Maxima Verification", () => {
  // 1. Math Full Fixture
  describe("public/exams/toan-full.json", () => {
    const filePath = path.resolve("public/exams/toan-full.json");
    const rawText = fs.readFileSync(filePath, "utf8");
    const parseRes = parseExam(rawText);

    it("parses valid canonical WebExam schema", () => {
      assert.equal(parseRes.ok, true, `Parse failed: ${parseRes.ok ? "" : JSON.stringify(parseRes.issues)}`);
      if (!parseRes.ok) return;
      assert.equal(parseRes.value.schemaVersion, "web-exam-v1");
      assert.equal(parseRes.value.ruleSetId, "custom-v1");
      assert.equal(parseRes.value.inputPolicyId, "sa-charset-v1");
      // Must be illustrative, not official preset
      assert.ok(parseRes.value.title.includes("Tùy Chỉnh Minh Họa"));
      assert.ok(!parseRes.value.title.includes("chuẩn Bộ"));
    });

    it("independently derives expected maxima: N1=4, N2=2, N3=2 -> total=10", () => {
      if (!parseRes.ok) return;
      const counts = { n1: 4, n2: 2, n3: 2 };
      const maxRes = computeExamMax(counts);

      // MAX_I = 4 * 0.25 = 1
      assert.equal(toFractionString(maxRes.maxI), "1");
      // MAX_II = 2 * 1 = 2
      assert.equal(toFractionString(maxRes.maxII), "2");
      // BASE = 1 + 2 = 3 < 10 -> POINT_III = (10 - 3) / 2 = 7/2 = 3.5
      assert.equal(toFractionString(maxRes.pointIII), "7/2");
      // MAX_III = 2 * (7/2) = 7
      assert.equal(toFractionString(maxRes.maxIII), "7");
      // MAX_TOTAL = 1 + 2 + 7 = 10
      assert.equal(toFractionString(maxRes.maxTotal), "10");
    });

    it("simulates full score attempt on toan-full.json", () => {
      if (!parseRes.ok) return;
      const domainExam = toDomainExam(parseRes.value);
      const responses: AttemptResponses = {
        attemptId: "att-toan-full-1",
        examVersionId: domainExam.examVersionId,
        responses: [
          { kind: "I", questionVersionId: "toan-q01-i-ham-so", selectedOptionId: "opt-1a" },
          { kind: "I", questionVersionId: "toan-q02-i-tich-phan", selectedOptionId: "opt-2a" },
          { kind: "I", questionVersionId: "toan-q03-i-oxyz", selectedOptionId: "opt-3c" },
          { kind: "I", questionVersionId: "toan-q04-i-xac-suat", selectedOptionId: "opt-4d" },
          {
            kind: "II",
            questionVersionId: "toan-q05-ii-khao-sat-ham",
            answers: [
              { statementId: "st-5a", value: true },
              { statementId: "st-5b", value: false },
              { statementId: "st-5c", value: true },
              { statementId: "st-5d", value: true },
            ],
          },
          {
            kind: "II",
            questionVersionId: "toan-q06-ii-oxyz-mat-cau",
            answers: [
              { statementId: "st-6a", value: false },
              { statementId: "st-6b", value: true },
              { statementId: "st-6c", value: false },
              { statementId: "st-6d", value: true },
            ],
          },
          { kind: "III", questionVersionId: "toan-q07-iii-gia-tri-nho-nhat", raw: "-0,5" },
          { kind: "III", questionVersionId: "toan-q08-iii-ung-dung-thuc-te", raw: "1,5" },
        ],
      };

      const result = scoreAttempt(domainExam, responses);
      assert.equal(toFractionString(result.total), "10");
      assert.equal(toFractionString(result.maxTotal), "10");
    });
  });

  // 2. Physics Part I Fixture
  describe("public/exams/ly-part-I.json", () => {
    const filePath = path.resolve("public/exams/ly-part-I.json");
    const rawText = fs.readFileSync(filePath, "utf8");
    const parseRes = parseExam(rawText);

    it("parses valid canonical WebExam schema", () => {
      assert.equal(parseRes.ok, true, `Parse failed: ${parseRes.ok ? "" : JSON.stringify(parseRes.issues)}`);
      if (!parseRes.ok) return;
      assert.equal(parseRes.value.schemaVersion, "web-exam-v1");
      assert.equal(parseRes.value.subject, "Vật lí");
      assert.equal(parseRes.value.questions.length, 20);
      assert.ok(parseRes.value.title.includes("Tùy Chỉnh Minh Họa"));
      assert.ok(!parseRes.value.title.includes("chuẩn Bộ"));
    });

    it("independently derives expected maxima: N1=20, N2=0, N3=0 -> total=5", () => {
      if (!parseRes.ok) return;
      const maxRes = computeExamMax({ n1: 20, n2: 0, n3: 0 });

      // MAX_I = 20 * 0.25 = 5
      assert.equal(toFractionString(maxRes.maxI), "5");
      assert.equal(toFractionString(maxRes.maxII), "0");
      assert.equal(toFractionString(maxRes.maxIII), "0");
      assert.equal(toFractionString(maxRes.maxTotal), "5");
    });

    it("independently verifies answers for all 20 physics questions", () => {
      if (!parseRes.ok) return;
      const qs = parseRes.value.questions;
      assert.equal(qs.length, 20);

      // Verify each question is Part I with 4 options and valid correctOptionId
      for (let i = 0; i < 20; i++) {
        const q = qs[i];
        assert.ok(q);
        if (q.kind !== "I") throw new Error("q must be kind I");
        assert.equal(q.options.length, 4);
        assert.ok(q.correctOptionId);
        assert.ok(q.options.some((o) => o.optionId === q.correctOptionId));
        assert.ok(q.explanation && q.explanation.length > 5);
      }

      // Check specific questions:
      // Q1: 27 C = 300.15 K
      const q1 = qs[0]!;
      assert.ok(q1.kind === "I" && q1.correctOptionId === "opt-1a");
      // Q2: Boyle
      const q2 = qs[1]!;
      assert.ok(q2.kind === "I" && q2.correctOptionId === "opt-2b");
      // Q14: t=24, T=8 -> 1/8
      const q14 = qs[13]!;
      assert.ok(q14.kind === "I" && q14.correctOptionId === "opt-14b");
      // Q19: I = 2 A
      const q19 = qs[18]!;
      assert.ok(q19.kind === "I" && q19.correctOptionId === "opt-19c");
      // Q20: 3i - 2.5i = 0.5i
      const q20 = qs[19]!;
      assert.ok(q20.kind === "I" && q20.correctOptionId === "opt-20d");
    });

    it("simulates full score attempt (20/20) yielding exactly 5/5", () => {
      if (!parseRes.ok) return;
      const domainExam = toDomainExam(parseRes.value);
      const responses: AttemptResponses = {
        attemptId: "att-ly-1",
        examVersionId: domainExam.examVersionId,
        responses: parseRes.value.questions.map((q) => {
          assert.equal(q.kind, "I");
          const qI = q as Extract<typeof q, { kind: "I" }>;
          return {
            kind: "I",
            questionVersionId: qI.questionVersionId,
            selectedOptionId: qI.correctOptionId,
          };
        }),
      };

      const result = scoreAttempt(domainExam, responses);
      assert.equal(toFractionString(result.total), "5");
      assert.equal(toFractionString(result.maxTotal), "5");
      assert.equal(toFractionString(result.sections.I.score), "5");
    });

    it("simulates 10/20 correct attempt yielding 2.5 (5/2)", () => {
      if (!parseRes.ok) return;
      const domainExam = toDomainExam(parseRes.value);
      const responses: AttemptResponses = {
        attemptId: "att-ly-2",
        examVersionId: domainExam.examVersionId,
        responses: parseRes.value.questions.map((q, idx) => {
          assert.equal(q.kind, "I");
          const qI = q as Extract<typeof q, { kind: "I" }>;
          return {
            kind: "I",
            questionVersionId: qI.questionVersionId,
            selectedOptionId: idx < 10 ? qI.correctOptionId : null,
          };
        }),
      };

      const result = scoreAttempt(domainExam, responses);
      assert.equal(toFractionString(result.total), "5/2");
      assert.equal(toFractionString(result.maxTotal), "5");
    });
  });

  // 3. Chemistry Part III Fixture
  describe("public/exams/hoa-repeating.json", () => {
    const filePath = path.resolve("public/exams/hoa-repeating.json");
    const rawText = fs.readFileSync(filePath, "utf8");
    const parseRes = parseExam(rawText);

    it("parses valid canonical WebExam schema", () => {
      assert.equal(parseRes.ok, true, `Parse failed: ${parseRes.ok ? "" : JSON.stringify(parseRes.issues)}`);
      if (!parseRes.ok) return;
      assert.equal(parseRes.value.schemaVersion, "web-exam-v1");
      assert.equal(parseRes.value.subject, "Hóa học");
      assert.equal(parseRes.value.questions.length, 3);
      assert.ok(parseRes.value.title.includes("Tùy Chỉnh Minh Họa"));
      assert.ok(!parseRes.value.title.includes("chuẩn Bộ"));
    });

    it("independently derives expected repeating decimal maxima: N1=0, N2=0, N3=3 -> point=10/3, total=10", () => {
      if (!parseRes.ok) return;
      const maxRes = computeExamMax({ n1: 0, n2: 0, n3: 3 });

      // BASE = 0 < 10 -> POINT_III = (10 - 0) / 3 = 10/3
      assert.equal(toFractionString(maxRes.pointIII), "10/3");
      // MAX_III = 3 * (10/3) = 10
      assert.equal(toFractionString(maxRes.maxIII), "10");
      assert.equal(toFractionString(maxRes.maxTotal), "10");
    });

    it("verifies chemical questions and answers independently", () => {
      if (!parseRes.ok) return;
      const qs = parseRes.value.questions;
      assert.equal(qs.length, 3);

      // Q1: C4H8O2 ester isomers = 4
      const q1 = qs[0];
      assert.ok(q1 && q1.kind === "III");
      assert.equal(q1.answerKey, "4");

      // Q2: Gly-Ala-Val peptide bonds = 2
      const q2 = qs[1];
      assert.ok(q2 && q2.kind === "III");
      assert.equal(q2.answerKey, "2");

      // Q3: 0.03 mol / 0.02 L = 1,5 M
      const q3 = qs[2];
      assert.ok(q3 && q3.kind === "III");
      assert.equal(q3.answerKey, "1,5");
    });

    it("scores attempts with exact rational arithmetic (10/3 per question)", () => {
      if (!parseRes.ok) return;
      const domainExam = toDomainExam(parseRes.value);

      // Attempt 1: 1 correct -> score 10/3
      const resp1: AttemptResponses = {
        attemptId: "att-hoa-1",
        examVersionId: domainExam.examVersionId,
        responses: [
          { kind: "III", questionVersionId: "hoa-q01-dong-phan-ester", raw: "4" },
          { kind: "III", questionVersionId: "hoa-q02-tripeptide", raw: "99" }, // wrong
          { kind: "III", questionVersionId: "hoa-q03-nong-do-mol", raw: null }, // unanswered
        ],
      };
      const res1 = scoreAttempt(domainExam, resp1);
      assert.equal(toFractionString(res1.total), "10/3");
      assert.equal(toFractionString(res1.maxTotal), "10");

      // Attempt 2: 2 correct -> score 20/3
      const resp2: AttemptResponses = {
        attemptId: "att-hoa-2",
        examVersionId: domainExam.examVersionId,
        responses: [
          { kind: "III", questionVersionId: "hoa-q01-dong-phan-ester", raw: "4" },
          { kind: "III", questionVersionId: "hoa-q02-tripeptide", raw: "2" },
          { kind: "III", questionVersionId: "hoa-q03-nong-do-mol", raw: "wrong" },
        ],
      };
      const res2 = scoreAttempt(domainExam, resp2);
      assert.equal(toFractionString(res2.total), "20/3");
      assert.equal(toFractionString(res2.maxTotal), "10");

      // Attempt 3: 3 correct -> score 10/1
      const resp3: AttemptResponses = {
        attemptId: "att-hoa-3",
        examVersionId: domainExam.examVersionId,
        responses: [
          { kind: "III", questionVersionId: "hoa-q01-dong-phan-ester", raw: "4" },
          { kind: "III", questionVersionId: "hoa-q02-tripeptide", raw: "2" },
          { kind: "III", questionVersionId: "hoa-q03-nong-do-mol", raw: "1,5" },
        ],
      };
      const res3 = scoreAttempt(domainExam, resp3);
      assert.equal(toFractionString(res3.total), "10");
      assert.equal(toFractionString(res3.maxTotal), "10");
    });

    it("strictly differentiates Part III exact strings: 1,5 vs 1.5 vs 1,50", () => {
      if (!parseRes.ok) return;
      const domainExam = toDomainExam(parseRes.value);

      // '1.5' (period instead of comma -> bad_char issue) must be graded invalid (points 0)
      const respPeriod: AttemptResponses = {
        attemptId: "att-hoa-period",
        examVersionId: domainExam.examVersionId,
        responses: [
          { kind: "III", questionVersionId: "hoa-q03-nong-do-mol", raw: "1.5" },
        ],
      };
      const resPeriod = scoreAttempt(domainExam, respPeriod);
      const q3Res = resPeriod.questions.find((q) => q.questionVersionId === "hoa-q03-nong-do-mol");
      assert.equal(q3Res?.status, "invalid");
      assert.equal(toFractionString(resPeriod.total), "0");

      // '1,50' (extra trailing zero, valid charset) must be graded wrong
      const respZero: AttemptResponses = {
        attemptId: "att-hoa-zero",
        examVersionId: domainExam.examVersionId,
        responses: [
          { kind: "III", questionVersionId: "hoa-q03-nong-do-mol", raw: "1,50" },
        ],
      };
      const resZero = scoreAttempt(domainExam, respZero);
      const q3ResZero = resZero.questions.find((q) => q.questionVersionId === "hoa-q03-nong-do-mol");
      assert.equal(q3ResZero?.status, "wrong");
      assert.equal(toFractionString(resZero.total), "0");

      // Leading space ' 1,5' must be graded invalid/wrong (points 0)
      const respSpace: AttemptResponses = {
        attemptId: "att-hoa-space",
        examVersionId: domainExam.examVersionId,
        responses: [
          { kind: "III", questionVersionId: "hoa-q03-nong-do-mol", raw: " 1,5" },
        ],
      };
      const resSpace = scoreAttempt(domainExam, respSpace);
      const q3ResSpace = resSpace.questions.find((q) => q.questionVersionId === "hoa-q03-nong-do-mol");
      assert.equal(q3ResSpace?.status, "invalid");
      assert.equal(toFractionString(resSpace.total), "0");
    });
  });

  // 4. Golden Anchor Maxima
  describe("Golden Maxima Anchors", () => {
    it("anchors (20, 10, 0) -> max 15", () => {
      const res = computeExamMax({ n1: 20, n2: 10, n3: 0 });
      assert.equal(toFractionString(res.maxI), "5");
      assert.equal(toFractionString(res.maxII), "10");
      assert.equal(toFractionString(res.maxIII), "0");
      assert.equal(toFractionString(res.maxTotal), "15");
    });

    it("anchors (20, 10, 4) -> max 16 (BASE >= 10 -> POINT_III = 0.25)", () => {
      const res = computeExamMax({ n1: 20, n2: 10, n3: 4 });
      assert.equal(toFractionString(res.maxI), "5");
      assert.equal(toFractionString(res.maxII), "10");
      assert.equal(toFractionString(res.pointIII), "1/4");
      assert.equal(toFractionString(res.maxIII), "1");
      assert.equal(toFractionString(res.maxTotal), "16");
    });

    it("anchors (12, 4, 6) -> max 10 (point 0.5 each)", () => {
      const res = computeExamMax({ n1: 12, n2: 4, n3: 6 });
      assert.equal(toFractionString(res.maxI), "3");
      assert.equal(toFractionString(res.maxII), "4");
      // BASE = 3 + 4 = 7 < 10 -> POINT_III = (10 - 7) / 6 = 3/6 = 1/2
      assert.equal(toFractionString(res.pointIII), "1/2");
      assert.equal(toFractionString(res.maxIII), "3");
      assert.equal(toFractionString(res.maxTotal), "10");
    });

    it("anchors (0, 0, 7) -> point 10/7, max 10", () => {
      const res = computeExamMax({ n1: 0, n2: 0, n3: 7 });
      assert.equal(toFractionString(res.pointIII), "10/7");
      assert.equal(toFractionString(res.maxIII), "10");
      assert.equal(toFractionString(res.maxTotal), "10");
    });
  });
});
