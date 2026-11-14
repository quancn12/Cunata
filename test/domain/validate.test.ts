import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  MAX_QUESTIONS_PER_EXAM,
  validateExamVersion,
  validateAttemptResponses,
} from "../../src/domain/validate.ts";
import type {
  ExamVersion,
  AttemptResponses,
  QuestionI,
  QuestionII,
  QuestionIII,
} from "../../src/domain/model.ts";

function createValidQuestionI(id = "q-I-1"): QuestionI {
  return {
    kind: "I",
    questionVersionId: id,
    options: [
      { optionId: `${id}:opt-1` },
      { optionId: `${id}:opt-2` },
      { optionId: `${id}:opt-3` },
      { optionId: `${id}:opt-4` },
    ],
    correctOptionId: `${id}:opt-1`,
  };
}

function createValidQuestionII(id = "q-II-1"): QuestionII {
  return {
    kind: "II",
    questionVersionId: id,
    statements: [
      { statementId: `${id}:s-1`, answer: true },
      { statementId: `${id}:s-2`, answer: false },
      { statementId: `${id}:s-3`, answer: true },
      { statementId: `${id}:s-4`, answer: false },
    ],
  };
}

function createValidQuestionIII(id = "q-III-1", key = "1,5"): QuestionIII {
  return {
    kind: "III",
    questionVersionId: id,
    answerKey: key,
  };
}

function createValidExam(
  questions = [createValidQuestionI(), createValidQuestionII(), createValidQuestionIII()]
): ExamVersion {
  return {
    examId: "exam-001",
    examVersionId: "ver-001",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions,
  };
}

describe("validate - validateExamVersion", () => {
  it("exports MAX_QUESTIONS_PER_EXAM equal to 1000", () => {
    assert.equal(MAX_QUESTIONS_PER_EXAM, 1000);
  });

  describe("valid exams: required sections combinations", () => {
    it("accepts exam with only part I questions", () => {
      const exam = createValidExam([createValidQuestionI("q1"), createValidQuestionI("q2")]);
      const res = validateExamVersion(exam);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.questions.length, 2);
      }
    });

    it("accepts exam with only part II questions", () => {
      const exam = createValidExam([createValidQuestionII("q1"), createValidQuestionII("q2")]);
      const res = validateExamVersion(exam);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.questions.length, 2);
      }
    });

    it("accepts exam with only part III questions", () => {
      const exam = createValidExam([
        createValidQuestionIII("q1", "1,5"),
        createValidQuestionIII("q2", "-0,5"),
        createValidQuestionIII("q3", "1,50"),
      ]);
      const res = validateExamVersion(exam);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.questions.length, 3);
      }
    });

    it("accepts combined exam with part I, II, and III questions", () => {
      const exam = createValidExam([
        createValidQuestionI("q1"),
        createValidQuestionII("q2"),
        createValidQuestionIII("q3", "1,5"),
      ]);
      const res = validateExamVersion(exam);
      assert.equal(res.ok, true);
    });

    it("accepts valid exams with distinct prototype property IDs (__proto__, constructor, toString, valueOf)", () => {
      const validProtoOptQ: QuestionI = {
        kind: "I",
        questionVersionId: "__proto__",
        options: [
          { optionId: "__proto__" },
          { optionId: "constructor" },
          { optionId: "toString" },
          { optionId: "valueOf" },
        ],
        correctOptionId: "__proto__",
      };
      const validProtoStmtQ: QuestionII = {
        kind: "II",
        questionVersionId: "constructor",
        statements: [
          { statementId: "__proto__", answer: true },
          { statementId: "constructor", answer: false },
          { statementId: "toString", answer: true },
          { statementId: "valueOf", answer: false },
        ],
      };
      const validProtoShortQ: QuestionIII = {
        kind: "III",
        questionVersionId: "toString",
        answerKey: "1,5",
      };
      const exam = createValidExam([validProtoOptQ, validProtoStmtQ, validProtoShortQ]);
      const res = validateExamVersion(exam);
      assert.equal(res.ok, true);
    });
  });

  describe("input shapes, missing fields, type errors, prototypes", () => {
    it("rejects non-object inputs with TYPE_MISMATCH", () => {
      for (const bad of [null, undefined, 42, "hello", true, Symbol("x")]) {
        const res = validateExamVersion(bad);
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.ok(res.issues.some((i) => i.code === "TYPE_MISMATCH"));
        }
      }
    });

    it("rejects array inputs with TYPE_MISMATCH", () => {
      const res = validateExamVersion([]);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "TYPE_MISMATCH"));
      }
    });

    it("rejects missing top-level fields with TYPE_MISMATCH", () => {
      const base = createValidExam();
      for (const field of ["examId", "examVersionId", "ruleSetId", "inputPolicyId", "questions"] as const) {
        const copy = { ...base };
        delete copy[field];
        const res = validateExamVersion(copy);
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.ok(res.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === field));
        }
      }
    });

    it("rejects wrong top-level field types with TYPE_MISMATCH", () => {
      const base = createValidExam();
      assert.equal(validateExamVersion({ ...base, examId: 123 }).ok, false);
      assert.equal(validateExamVersion({ ...base, examVersionId: true }).ok, false);
      assert.equal(validateExamVersion({ ...base, ruleSetId: 999 }).ok, false);
      assert.equal(validateExamVersion({ ...base, inputPolicyId: null }).ok, false);
      assert.equal(validateExamVersion({ ...base, questions: "not an array" }).ok, false);
    });

    it("rejects inherited properties from prototype (__proto__/constructor)", () => {
      // Prototype pollution attempt: object with properties on prototype only
      const protoObj = Object.create({
        examId: "inherited-exam",
        examVersionId: "inherited-version",
        ruleSetId: "custom-v1",
        inputPolicyId: "sa-charset-v1",
        questions: [createValidQuestionI()],
      });
      const res = validateExamVersion(protoObj);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "TYPE_MISMATCH"));
      }
    });

    it("handles objects with constructor property or __proto__: null safely", () => {
      const cleanObj = Object.assign(Object.create(null), createValidExam());
      const res1 = validateExamVersion(cleanObj);
      assert.equal(res1.ok, true);

      const objWithConstructor = { ...createValidExam(), constructor: "not a function" };
      const res2 = validateExamVersion(objWithConstructor);
      assert.equal(res2.ok, true);
    });
  });

  describe("all 13 exam error codes coverage", () => {
    it("reports EXAM_EMPTY when questions array is empty", () => {
      const exam = createValidExam([]);
      const res = validateExamVersion(exam);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "EXAM_EMPTY" && i.path === "questions"));
      }
    });

    it("reports LIMIT_EXCEEDED when questions length exceeds MAX_QUESTIONS_PER_EXAM", () => {
      const questions: QuestionI[] = [];
      for (let i = 0; i <= MAX_QUESTIONS_PER_EXAM; i++) {
        questions.push(createValidQuestionI(`q-${i}`));
      }
      const exam = createValidExam(questions);
      const res = validateExamVersion(exam);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "LIMIT_EXCEEDED" && i.path === "questions"));
      }
    });

    it("reports ID_EMPTY when IDs are empty strings", () => {
      // Empty examId
      const res1 = validateExamVersion({ ...createValidExam(), examId: "" });
      assert.equal(res1.ok, false);
      if (!res1.ok) assert.ok(res1.issues.some((i) => i.code === "ID_EMPTY" && i.path === "examId"));

      // Empty examVersionId
      const res2 = validateExamVersion({ ...createValidExam(), examVersionId: "" });
      assert.equal(res2.ok, false);
      if (!res2.ok) assert.ok(res2.issues.some((i) => i.code === "ID_EMPTY" && i.path === "examVersionId"));

      // Empty questionVersionId
      const badQ1 = { ...createValidQuestionI(), questionVersionId: "" };
      const res3 = validateExamVersion(createValidExam([badQ1]));
      assert.equal(res3.ok, false);
      if (!res3.ok) assert.ok(res3.issues.some((i) => i.code === "ID_EMPTY" && i.path === "questions[0].questionVersionId"));

      // Empty optionId in QuestionI
      const badQOpt = {
        ...createValidQuestionI(),
        options: [
          { optionId: "" },
          { optionId: "opt-2" },
          { optionId: "opt-3" },
          { optionId: "opt-4" },
        ],
        correctOptionId: "opt-2",
      };
      const res4 = validateExamVersion(createValidExam([badQOpt]));
      assert.equal(res4.ok, false);
      if (!res4.ok) assert.ok(res4.issues.some((i) => i.code === "ID_EMPTY" && i.path === "questions[0].options[0].optionId"));

      // Empty correctOptionId in QuestionI
      const badQCorrect = { ...createValidQuestionI(), correctOptionId: "" };
      const res5 = validateExamVersion(createValidExam([badQCorrect]));
      assert.equal(res5.ok, false);
      if (!res5.ok) assert.ok(res5.issues.some((i) => i.code === "ID_EMPTY" && i.path === "questions[0].correctOptionId"));

      // Empty statementId in QuestionII
      const badQStmt = {
        ...createValidQuestionII(),
        statements: [
          { statementId: "", answer: true },
          { statementId: "s2", answer: false },
          { statementId: "s3", answer: true },
          { statementId: "s4", answer: false },
        ],
      };
      const res6 = validateExamVersion(createValidExam([badQStmt]));
      assert.equal(res6.ok, false);
      if (!res6.ok) assert.ok(res6.issues.some((i) => i.code === "ID_EMPTY" && i.path === "questions[0].statements[0].statementId"));
    });

    it("reports ID_DUPLICATE for duplicated questionVersionId, optionId, or statementId", () => {
      // Duplicate questionVersionId in exam
      const res1 = validateExamVersion(createValidExam([createValidQuestionI("same-id"), createValidQuestionI("same-id")]));
      assert.equal(res1.ok, false);
      if (!res1.ok) assert.ok(res1.issues.some((i) => i.code === "ID_DUPLICATE" && i.path === "questions[1].questionVersionId"));

      // Duplicate optionId in QuestionI
      const dupOptQ: QuestionI = {
        kind: "I",
        questionVersionId: "q1",
        options: [
          { optionId: "opt-dup" },
          { optionId: "opt-dup" },
          { optionId: "opt-3" },
          { optionId: "opt-4" },
        ],
        correctOptionId: "opt-3",
      };
      const res2 = validateExamVersion(createValidExam([dupOptQ]));
      assert.equal(res2.ok, false);
      if (!res2.ok) assert.ok(res2.issues.some((i) => i.code === "ID_DUPLICATE" && i.path === "questions[0].options[1].optionId"));

      // Duplicate statementId in QuestionII
      const dupStmtQ: QuestionII = {
        kind: "II",
        questionVersionId: "q2",
        statements: [
          { statementId: "stmt-dup", answer: true },
          { statementId: "stmt-dup", answer: false },
          { statementId: "s-3", answer: true },
          { statementId: "s-4", answer: false },
        ],
      };
      const res3 = validateExamVersion(createValidExam([dupStmtQ]));
      assert.equal(res3.ok, false);
      if (!res3.ok) assert.ok(res3.issues.some((i) => i.code === "ID_DUPLICATE" && i.path === "questions[0].statements[1].statementId"));

      // Cross-kind duplicate questionVersionId in exam (e.g. kind I and kind II)
      const crossKindDupExam = createValidExam([
        createValidQuestionI("shared-id"),
        createValidQuestionII("shared-id"),
      ]);
      const resCross = validateExamVersion(crossKindDupExam);
      assert.equal(resCross.ok, false);
      if (!resCross.ok) assert.ok(resCross.issues.some((i) => i.code === "ID_DUPLICATE" && i.path === "questions[1].questionVersionId"));

      // Prototype property IDs (__proto__, constructor) duplicate detection
      const protoDupOptQ: QuestionI = {
        kind: "I",
        questionVersionId: "q-proto-dup",
        options: [
          { optionId: "__proto__" },
          { optionId: "__proto__" },
          { optionId: "constructor" },
          { optionId: "toString" },
        ],
        correctOptionId: "__proto__",
      };
      const resProtoDup = validateExamVersion(createValidExam([protoDupOptQ]));
      assert.equal(resProtoDup.ok, false);
      if (!resProtoDup.ok) assert.ok(resProtoDup.issues.some((i) => i.code === "ID_DUPLICATE" && i.path === "questions[0].options[1].optionId"));

      // Prototype property IDs (__proto__, constructor) duplicate detection in QuestionII statements
      const protoDupStmtQ: QuestionII = {
        kind: "II",
        questionVersionId: "q-proto-stmt-dup",
        statements: [
          { statementId: "__proto__", answer: true },
          { statementId: "__proto__", answer: false },
          { statementId: "constructor", answer: true },
          { statementId: "toString", answer: false },
        ],
      };
      const resProtoStmtDup = validateExamVersion(createValidExam([protoDupStmtQ]));
      assert.equal(resProtoStmtDup.ok, false);
      if (!resProtoStmtDup.ok) {
        assert.ok(
          resProtoStmtDup.issues.some(
            (i) => i.code === "ID_DUPLICATE" && i.path === "questions[0].statements[1].statementId"
          )
        );
      }
    });

    it("reports QUESTION_KIND_UNKNOWN when kind is not I, II, or III", () => {
      const badKindQ = { ...createValidQuestionI(), kind: "IV" };
      const res = validateExamVersion(createValidExam([badKindQ as unknown as QuestionI]));
      assert.equal(res.ok, false);
      if (!res.ok) assert.ok(res.issues.some((i) => i.code === "QUESTION_KIND_UNKNOWN" && i.path === "questions[0].kind"));
    });

    it("reports RULESET_UNKNOWN when ruleSetId is not custom-v1", () => {
      const res = validateExamVersion({ ...createValidExam(), ruleSetId: "standard-2025" });
      assert.equal(res.ok, false);
      if (!res.ok) assert.ok(res.issues.some((i) => i.code === "RULESET_UNKNOWN" && i.path === "ruleSetId"));
    });

    it("reports INPUT_POLICY_UNKNOWN when inputPolicyId is not sa-charset-v1", () => {
      const res = validateExamVersion({ ...createValidExam(), inputPolicyId: "utf8-full" });
      assert.equal(res.ok, false);
      if (!res.ok) assert.ok(res.issues.some((i) => i.code === "INPUT_POLICY_UNKNOWN" && i.path === "inputPolicyId"));
    });

    it("reports I_OPTION_COUNT when QuestionI does not have exactly 4 options", () => {
      const q3 = { ...createValidQuestionI(), options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }] };
      const res1 = validateExamVersion(createValidExam([q3 as QuestionI]));
      assert.equal(res1.ok, false);
      if (!res1.ok) assert.ok(res1.issues.some((i) => i.code === "I_OPTION_COUNT" && i.path === "questions[0].options"));

      const q5 = {
        ...createValidQuestionI(),
        options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }, { optionId: "o5" }],
      };
      const res2 = validateExamVersion(createValidExam([q5 as QuestionI]));
      assert.equal(res2.ok, false);
      if (!res2.ok) assert.ok(res2.issues.some((i) => i.code === "I_OPTION_COUNT" && i.path === "questions[0].options"));
    });

    it("reports I_KEY_NOT_IN_OPTIONS when QuestionI correctOptionId is not in options", () => {
      const q = { ...createValidQuestionI(), correctOptionId: "non-existent-option" };
      const res = validateExamVersion(createValidExam([q]));
      assert.equal(res.ok, false);
      if (!res.ok) assert.ok(res.issues.some((i) => i.code === "I_KEY_NOT_IN_OPTIONS" && i.path === "questions[0].correctOptionId"));
    });

    it("reports II_STATEMENT_COUNT when QuestionII does not have exactly 4 statements", () => {
      const q3 = {
        ...createValidQuestionII(),
        statements: [
          { statementId: "s1", answer: true },
          { statementId: "s2", answer: false },
          { statementId: "s3", answer: true },
        ],
      };
      const res = validateExamVersion(createValidExam([q3 as QuestionII]));
      assert.equal(res.ok, false);
      if (!res.ok) assert.ok(res.issues.some((i) => i.code === "II_STATEMENT_COUNT" && i.path === "questions[0].statements"));
    });

    it("reports II_ANSWER_NOT_BOOLEAN and rejects implicit coercion", () => {
      for (const nonBool of ["true", "false", 1, 0, null, undefined]) {
        const q = {
          kind: "II" as const,
          questionVersionId: "q-bool",
          statements: [
            { statementId: "s1", answer: nonBool as unknown as boolean },
            { statementId: "s2", answer: false },
            { statementId: "s3", answer: true },
            { statementId: "s4", answer: false },
          ],
        };
        const res = validateExamVersion(createValidExam([q]));
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.ok(res.issues.some((i) => i.code === "II_ANSWER_NOT_BOOLEAN" && i.path === "questions[0].statements[0].answer"));
        }
      }
    });

    it("reports III_KEY_INVALID on invalid answerKey values", () => {
      const invalidKeys = [
        "1.5",        // period
        "",           // empty
        "12345",      // 5 chars
        " 1,5",       // leading space
        "1,5 ",       // trailing space
        "1\u00A05",   // NBSP
        "\u22120,5",  // U+2212 minus
        "\uFF11\uFF12", // fullwidth
        "12😀",       // emoji
      ];

      for (const key of invalidKeys) {
        const q = createValidQuestionIII("q-invalid-key", key);
        const res = validateExamVersion(createValidExam([q]));
        assert.equal(res.ok, false, `Expected failure for key: ${JSON.stringify(key)}`);
        if (!res.ok) {
          assert.ok(
            res.issues.some((i) => i.code === "III_KEY_INVALID" && i.path === "questions[0].answerKey"),
            `Missing III_KEY_INVALID for key: ${JSON.stringify(key)}`
          );
        }
      }
    });
  });

  describe("robustness and non-mutation", () => {
    it("never modifies input exam", () => {
      const exam = Object.freeze(createValidExam([
        Object.freeze(createValidQuestionI()),
        Object.freeze(createValidQuestionII()),
        Object.freeze(createValidQuestionIII()),
      ]));
      const res = validateExamVersion(exam);
      assert.equal(res.ok, true);
    });

    it("handles throwing getters safely without throwing exceptions", () => {
      const evil = {
        get examId(): string {
          throw new Error("malicious getter");
        },
      };
      const res = validateExamVersion(evil);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "TYPE_MISMATCH"));
      }
    });
  });
});

describe("validate - validateAttemptResponses", () => {
  const sampleExam = createValidExam([
    createValidQuestionI("q-I-1"),
    createValidQuestionII("q-II-1"),
    createValidQuestionIII("q-III-1", "1,5"),
  ]);

  function createValidAttempt(responses: AttemptResponses["responses"] = []): AttemptResponses {
    return {
      attemptId: "att-001",
      examVersionId: sampleExam.examVersionId,
      responses,
    };
  }

  describe("valid attempts", () => {
    it("accepts empty responses array (unanswered attempt)", () => {
      const res = validateAttemptResponses(sampleExam, createValidAttempt([]));
      assert.equal(res.ok, true);
    });

    it("accepts valid responses across part I, II, and III", () => {
      const attempt: AttemptResponses = {
        attemptId: "att-001",
        examVersionId: sampleExam.examVersionId,
        responses: [
          { kind: "I", questionVersionId: "q-I-1", selectedOptionId: "q-I-1:opt-1" },
          {
            kind: "II",
            questionVersionId: "q-II-1",
            answers: [
              { statementId: "q-II-1:s-1", value: true },
              { statementId: "q-II-1:s-2", value: false },
              { statementId: "q-II-1:s-3", value: null },
              { statementId: "q-II-1:s-4", value: true },
            ],
          },
          { kind: "III", questionVersionId: "q-III-1", raw: "1,5" },
        ],
      };
      const res = validateAttemptResponses(sampleExam, attempt);
      assert.equal(res.ok, true);
    });

    it("accepts null for unanswered questions / statements", () => {
      const attempt: AttemptResponses = {
        attemptId: "att-002",
        examVersionId: sampleExam.examVersionId,
        responses: [
          { kind: "I", questionVersionId: "q-I-1", selectedOptionId: null },
          { kind: "III", questionVersionId: "q-III-1", raw: null },
        ],
      };
      const res = validateAttemptResponses(sampleExam, attempt);
      assert.equal(res.ok, true);
    });

    it("accepts valid responses referencing questions and options with prototype property IDs", () => {
      const protoExam = createValidExam([
        {
          kind: "I",
          questionVersionId: "__proto__",
          options: [
            { optionId: "__proto__" },
            { optionId: "constructor" },
            { optionId: "toString" },
            { optionId: "valueOf" },
          ],
          correctOptionId: "__proto__",
        },
        {
          kind: "II",
          questionVersionId: "constructor",
          statements: [
            { statementId: "__proto__", answer: true },
            { statementId: "constructor", answer: false },
            { statementId: "toString", answer: true },
            { statementId: "valueOf", answer: false },
          ],
        },
        {
          kind: "III",
          questionVersionId: "toString",
          answerKey: "1,5",
        },
      ]);
      const protoAttempt: AttemptResponses = {
        attemptId: "att-proto",
        examVersionId: protoExam.examVersionId,
        responses: [
          { kind: "I", questionVersionId: "__proto__", selectedOptionId: "__proto__" },
          {
            kind: "II",
            questionVersionId: "constructor",
            answers: [
              { statementId: "__proto__", value: true },
              { statementId: "constructor", value: false },
            ],
          },
          { kind: "III", questionVersionId: "toString", raw: "1,5" },
        ],
      };
      const res = validateAttemptResponses(protoExam, protoAttempt);
      assert.equal(res.ok, true);
    });
  });

  describe("all 5 attempt error codes coverage", () => {
    it("reports TYPE_MISMATCH on non-objects, missing fields, or bad response payloads", () => {
      // Non-objects
      assert.equal(validateAttemptResponses(sampleExam, null).ok, false);
      assert.equal(validateAttemptResponses(sampleExam, 123).ok, false);
      assert.equal(validateAttemptResponses(sampleExam, []).ok, false);

      // Missing attemptId or empty attemptId
      const noAttId = { examVersionId: sampleExam.examVersionId, responses: [] };
      const res1 = validateAttemptResponses(sampleExam, noAttId);
      assert.equal(res1.ok, false);
      if (!res1.ok) assert.ok(res1.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "attemptId"));

      const emptyAttId = { attemptId: "", examVersionId: sampleExam.examVersionId, responses: [] };
      const res2 = validateAttemptResponses(sampleExam, emptyAttId);
      assert.equal(res2.ok, false);
      if (!res2.ok) assert.ok(res2.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "attemptId"));

      // Bad response I payload (number instead of string/null)
      const badI = createValidAttempt([
        { kind: "I", questionVersionId: "q-I-1", selectedOptionId: 123 as unknown as string },
      ]);
      const res3 = validateAttemptResponses(sampleExam, badI);
      assert.equal(res3.ok, false);
      if (!res3.ok) assert.ok(res3.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].selectedOptionId"));

      // Bad response II answers (not an array)
      const badII = createValidAttempt([
        { kind: "II", questionVersionId: "q-II-1", answers: "not array" as unknown as [] },
      ]);
      const res4 = validateAttemptResponses(sampleExam, badII);
      assert.equal(res4.ok, false);
      if (!res4.ok) assert.ok(res4.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].answers"));

      // Bad response II statement value (string "true" instead of boolean)
      const badIIVal = createValidAttempt([
        {
          kind: "II",
          questionVersionId: "q-II-1",
          answers: [{ statementId: "q-II-1:s-1", value: "true" as unknown as boolean }],
        },
      ]);
      const res5 = validateAttemptResponses(sampleExam, badIIVal);
      assert.equal(res5.ok, false);
      if (!res5.ok) assert.ok(res5.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].answers[0].value"));

      // Bad response III raw (number instead of string/null)
      const badIII = createValidAttempt([
        { kind: "III", questionVersionId: "q-III-1", raw: 1.5 as unknown as string },
      ]);
      const res6 = validateAttemptResponses(sampleExam, badIII);
      assert.equal(res6.ok, false);
      if (!res6.ok) assert.ok(res6.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].raw"));
    });

    it("strictly rejects non-string/non-null raw payloads for Part I and Part III (boolean, number, object, array)", () => {
      const invalidValues = [7, true, false, {}, [], [1, 2], { a: 1 }];
      for (const val of invalidValues) {
        // Part I selectedOptionId
        const badI = createValidAttempt([
          { kind: "I", questionVersionId: "q-I-1", selectedOptionId: val as unknown as string },
        ]);
        const resI = validateAttemptResponses(sampleExam, badI);
        assert.equal(resI.ok, false);
        if (!resI.ok) {
          assert.ok(
            resI.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].selectedOptionId"),
            `Expected TYPE_MISMATCH for Part I selectedOptionId with value ${JSON.stringify(val)}`,
          );
        }

        // Part III raw
        const badIII = createValidAttempt([
          { kind: "III", questionVersionId: "q-III-1", raw: val as unknown as string },
        ]);
        const resIII = validateAttemptResponses(sampleExam, badIII);
        assert.equal(resIII.ok, false);
        if (!resIII.ok) {
          assert.ok(
            resIII.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].raw"),
            `Expected TYPE_MISMATCH for Part III raw with value ${JSON.stringify(val)}`,
          );
        }
      }
    });

    it("strictly rejects non-object statement answers for Part II (numbers, strings, booleans, null, arrays)", () => {
      const invalidStatements = [42, "true", true, false, null, [1, 2], ["s-1", true]];
      for (const val of invalidStatements) {
        const badII = createValidAttempt([
          { kind: "II", questionVersionId: "q-II-1", answers: [val as unknown as { statementId: string; value: boolean | null }] },
        ]);
        const res = validateAttemptResponses(sampleExam, badII);
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.ok(
            res.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].answers[0]"),
            `Expected TYPE_MISMATCH at responses[0].answers[0] for ${JSON.stringify(val)}`,
          );
        }
      }
    });

    it("strictly rejects Part II statement answers with invalid statementId or value types", () => {
      // Non-string or missing statementId
      const invalidStatementIds = [123, true, false, null, {}, []];
      for (const badId of invalidStatementIds) {
        const badII = createValidAttempt([
          { kind: "II", questionVersionId: "q-II-1", answers: [{ statementId: badId as unknown as string, value: true }] },
        ]);
        const res = validateAttemptResponses(sampleExam, badII);
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.ok(
            res.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].answers[0].statementId"),
            `Expected TYPE_MISMATCH at statementId for ${JSON.stringify(badId)}`,
          );
        }
      }

      // Non-boolean and non-null value (numbers 0, 1, strings "true", "false", objects, arrays)
      const invalidValues = [0, 1, "true", "false", {}, [true]];
      for (const badVal of invalidValues) {
        const badII = createValidAttempt([
          { kind: "II", questionVersionId: "q-II-1", answers: [{ statementId: "q-II-1:s-1", value: badVal as unknown as boolean }] },
        ]);
        const res = validateAttemptResponses(sampleExam, badII);
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.ok(
            res.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].answers[0].value"),
            `Expected TYPE_MISMATCH at value for ${JSON.stringify(badVal)}`,
          );
        }
      }
    });

    it("reports ATTEMPT_EXAM_MISMATCH when examVersionId does not match exam", () => {
      const badAttempt = {
        attemptId: "att-001",
        examVersionId: "mismatched-version-id",
        responses: [],
      };
      const res = validateAttemptResponses(sampleExam, badAttempt);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "ATTEMPT_EXAM_MISMATCH" && i.path === "examVersionId"));
      }
    });

    it("reports RESPONSE_DUPLICATE when multiple responses exist for same questionVersionId", () => {
      const dupAttempt = createValidAttempt([
        { kind: "I", questionVersionId: "q-I-1", selectedOptionId: "q-I-1:opt-1" },
        { kind: "I", questionVersionId: "q-I-1", selectedOptionId: "q-I-1:opt-2" },
      ]);
      const res = validateAttemptResponses(sampleExam, dupAttempt);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "RESPONSE_DUPLICATE" && i.path === "responses[1].questionVersionId"));
      }

      // Cross-kind duplicate responses for same questionVersionId
      const crossKindDupAttempt = createValidAttempt([
        { kind: "I", questionVersionId: "q-I-1", selectedOptionId: "q-I-1:opt-1" },
        { kind: "II", questionVersionId: "q-I-1", answers: [] },
      ]);
      const resCrossAtt = validateAttemptResponses(sampleExam, crossKindDupAttempt);
      assert.equal(resCrossAtt.ok, false);
      if (!resCrossAtt.ok) {
        assert.ok(resCrossAtt.issues.some((i) => i.code === "RESPONSE_DUPLICATE" && i.path === "responses[1].questionVersionId"));
      }
    });

    it("reports RESPONSE_UNKNOWN_QUESTION when questionVersionId is not in exam", () => {
      const unknownAttempt = createValidAttempt([
        { kind: "I", questionVersionId: "q-unknown-999", selectedOptionId: null },
      ]);
      const res = validateAttemptResponses(sampleExam, unknownAttempt);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "RESPONSE_UNKNOWN_QUESTION" && i.path === "responses[0].questionVersionId"));
      }
    });

    it("reports RESPONSE_KIND_MISMATCH when response kind does not match exam question kind", () => {
      // q-I-1 is kind "I", but response specifies kind "II"
      const mismatchAttempt = createValidAttempt([
        { kind: "II", questionVersionId: "q-I-1", answers: [] },
      ]);
      const res = validateAttemptResponses(sampleExam, mismatchAttempt);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "RESPONSE_KIND_MISMATCH" && i.path === "responses[0].kind"));
      }
    });
  });

  describe("robustness and non-mutation", () => {
    it("never modifies attempt responses input", () => {
      const attempt = Object.freeze(createValidAttempt([
        Object.freeze({ kind: "I", questionVersionId: "q-I-1", selectedOptionId: "q-I-1:opt-1" }),
      ]));
      const res = validateAttemptResponses(sampleExam, attempt);
      assert.equal(res.ok, true);
    });

    it("handles throwing getters safely without throwing exceptions", () => {
      const evil = {
        get attemptId(): string {
          throw new Error("malicious attempt getter");
        },
      };
      const res = validateAttemptResponses(sampleExam, evil);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.ok(res.issues.some((i) => i.code === "TYPE_MISMATCH"));
      }
    });

    it("LC04-F04 regression: handles malicious error objects across exam and attempt validators without escaping exceptions", () => {
      const exam = {
        examId: "e",
        examVersionId: "v",
        ruleSetId: "custom-v1",
        inputPolicyId: "sa-charset-v1",
        questions: [{ kind: "III", questionVersionId: "q", answerKey: "1" }],
      };

      const errorFactories: [string, () => unknown][] = [
        ["normal", () => new Error("ordinary")],
        ["null-prototype", () => Object.create(null)],
        ["throwing-toString", () => ({ toString() { throw new Error("secondary toString"); } })],
        ["throwing-message", () => Object.defineProperty(new Error("x"), "message", { get() { throw new Error("secondary message"); } })],
        ["throwing-getPrototypeOf", () => new Proxy({}, { getPrototypeOf() { throw new Error("secondary getPrototypeOf"); } })],
      ];

      for (const [name, makeError] of errorFactories) {
        for (const kind of ["exam", "attempt"] as const) {
          const input = Object.defineProperty({}, kind === "exam" ? "examId" : "attemptId", {
            get() {
              throw makeError();
            },
          });
          const result = kind === "exam"
            ? validateExamVersion(input)
            : validateAttemptResponses(exam as any, input);
          assert.equal(result.ok, false, `${name}:${kind} expected ok === false`);
          if (!result.ok) {
            assert.equal(result.issues[0]?.code, "TYPE_MISMATCH", `${name}:${kind} expected TYPE_MISMATCH`);
          }
        }
      }
    });
  });
});

describe("validate - integration with oracle fixtures", () => {
  const fixturesDir = resolve("test/oracle/fixtures");
  const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));

  for (const file of fixtureFiles) {
    it(`validates all exam and attempt fixtures in ${file}`, () => {
      const filePath = resolve(fixturesDir, file);
      const content = readFileSync(filePath, "utf-8");
      const data = JSON.parse(content) as { cases: { id: string; exam: unknown; attempt: unknown }[] };

      for (const testCase of data.cases) {
        const examRes = validateExamVersion(testCase.exam);
        assert.equal(
          examRes.ok,
          true,
          `Fixture case ${testCase.id} exam failed validation: ${JSON.stringify(!examRes.ok ? examRes.issues : [])}`
        );

        if (examRes.ok) {
          const attemptRes = validateAttemptResponses(examRes.value, testCase.attempt);
          assert.equal(
            attemptRes.ok,
            true,
            `Fixture case ${testCase.id} attempt failed validation: ${JSON.stringify(!attemptRes.ok ? attemptRes.issues : [])}`
          );
        }
      }
    });
  }
});
