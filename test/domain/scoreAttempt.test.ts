import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  scoreAttempt,
  ScoringInputError,
  ENGINE_VERSION,
  type ScoreResult,
} from "../../src/domain/scoreAttempt.ts";
import { toFractionString, equals, ZERO } from "../../src/domain/rational.ts";
import type { ExamVersion, AttemptResponses } from "../../src/domain/model.ts";

interface FixtureCase {
  id: string;
  exam: ExamVersion;
  attempt: AttemptResponses;
  expected: {
    sections: {
      I: { score: string; max: string };
      II: { score: string; max: string };
      III: { score: string; max: string };
    };
    total: string;
    maxTotal: string;
  };
}

interface FixtureFile {
  schema: string;
  cases: FixtureCase[];
}

describe("scoreAttempt - Oracle Fixtures Integration", () => {
  const fixturesDir = join(process.cwd(), "test", "oracle", "fixtures");
  const files = readdirSync(fixturesDir).filter((f: string) => f.endsWith(".json"));

  let totalCases = 0;

  for (const file of files) {
    const fullPath = join(fixturesDir, file);
    const content = JSON.parse(readFileSync(fullPath, "utf-8")) as FixtureFile;

    it(`verifies all ${content.cases.length} cases in ${file}`, () => {
      for (const c of content.cases) {
        totalCases++;
        const res: ScoreResult = scoreAttempt(c.exam, c.attempt);

        assert.equal(
          toFractionString(res.sections.I.score),
          c.expected.sections.I.score,
          `Case ${c.id}: Section I score mismatch`,
        );
        assert.equal(
          toFractionString(res.sections.I.max),
          c.expected.sections.I.max,
          `Case ${c.id}: Section I max mismatch`,
        );
        assert.equal(
          toFractionString(res.sections.II.score),
          c.expected.sections.II.score,
          `Case ${c.id}: Section II score mismatch`,
        );
        assert.equal(
          toFractionString(res.sections.II.max),
          c.expected.sections.II.max,
          `Case ${c.id}: Section II max mismatch`,
        );
        assert.equal(
          toFractionString(res.sections.III.score),
          c.expected.sections.III.score,
          `Case ${c.id}: Section III score mismatch`,
        );
        assert.equal(
          toFractionString(res.sections.III.max),
          c.expected.sections.III.max,
          `Case ${c.id}: Section III max mismatch`,
        );
        assert.equal(
          toFractionString(res.total),
          c.expected.total,
          `Case ${c.id}: Total score mismatch`,
        );
        assert.equal(
          toFractionString(res.maxTotal),
          c.expected.maxTotal,
          `Case ${c.id}: Max total mismatch`,
        );
      }
    });
  }

  it("verifies oracle test suite covered at least 1600 cases", () => {
    assert.ok(totalCases >= 1600, `Expected >= 1600 cases, got ${totalCases}`);
  });
});

describe("scoreAttempt - Question status, points, and behavior", () => {
  const makeBaseExam = (): ExamVersion => ({
    examId: "exam-1",
    examVersionId: "ev-1",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions: [
      {
        kind: "I",
        questionVersionId: "qI-1",
        options: [
          { optionId: "opt-A" },
          { optionId: "opt-B" },
          { optionId: "opt-C" },
          { optionId: "opt-D" },
        ],
        correctOptionId: "opt-A",
      },
      {
        kind: "II",
        questionVersionId: "qII-1",
        statements: [
          { statementId: "st-1", answer: true },
          { statementId: "st-2", answer: false },
          { statementId: "st-3", answer: true },
          { statementId: "st-4", answer: false },
        ],
      },
      {
        kind: "III",
        questionVersionId: "qIII-1",
        answerKey: "1,5",
      },
    ],
  });

  it("produces correct metadata and frozen structures", () => {
    const exam = makeBaseExam();
    const attempt: AttemptResponses = {
      attemptId: "att-1",
      examVersionId: "ev-1",
      responses: [],
    };

    const res = scoreAttempt(exam, attempt);
    assert.equal(res.engineVersion, ENGINE_VERSION);
    assert.equal(res.ruleSetId, "custom-v1");
    assert.equal(res.inputPolicyId, "sa-charset-v1");
    assert.equal(res.attemptId, "att-1");
    assert.equal(res.examVersionId, "ev-1");
    assert.ok(Object.isFrozen(res));
    assert.ok(Object.isFrozen(res.sections));
    assert.ok(Object.isFrozen(res.sections.I));
    assert.ok(Object.isFrozen(res.sections.II));
    assert.ok(Object.isFrozen(res.sections.III));
    assert.ok(Object.isFrozen(res.questions));
  });

  it("handles Part I statuses: full, wrong, unanswered, invalid", () => {
    const exam = makeBaseExam();

    // 1. Full
    const attFull: AttemptResponses = {
      attemptId: "att-full",
      examVersionId: "ev-1",
      responses: [{ kind: "I", questionVersionId: "qI-1", selectedOptionId: "opt-A" }],
    };
    const resFull = scoreAttempt(exam, attFull);
    assert.equal(resFull.questions[0]?.status, "full");
    assert.equal(toFractionString(resFull.questions[0]!.points), "1/4");

    // 2. Wrong
    const attWrong: AttemptResponses = {
      attemptId: "att-wrong",
      examVersionId: "ev-1",
      responses: [{ kind: "I", questionVersionId: "qI-1", selectedOptionId: "opt-B" }],
    };
    const resWrong = scoreAttempt(exam, attWrong);
    assert.equal(resWrong.questions[0]?.status, "wrong");
    assert.equal(toFractionString(resWrong.questions[0]!.points), "0");

    // 3. Unanswered (null selectedOptionId)
    const attUnans: AttemptResponses = {
      attemptId: "att-unans",
      examVersionId: "ev-1",
      responses: [{ kind: "I", questionVersionId: "qI-1", selectedOptionId: null }],
    };
    const resUnans = scoreAttempt(exam, attUnans);
    assert.equal(resUnans.questions[0]?.status, "unanswered");
    assert.equal(toFractionString(resUnans.questions[0]!.points), "0");

    // 4. Invalid option id (not in options list)
    const attInvalid: AttemptResponses = {
      attemptId: "att-inv",
      examVersionId: "ev-1",
      responses: [{ kind: "I", questionVersionId: "qI-1", selectedOptionId: "foreign-opt" }],
    };
    const resInvalid = scoreAttempt(exam, attInvalid);
    assert.equal(resInvalid.questions[0]?.status, "invalid");
    assert.equal(toFractionString(resInvalid.questions[0]!.points), "0");
  });

  it("handles Part II statuses: full (4), partial (1..3), wrong (0 with response), unanswered (0 blank)", () => {
    const exam = makeBaseExam();

    // 4 correct -> full
    const att4: AttemptResponses = {
      attemptId: "att-4",
      examVersionId: "ev-1",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [
            { statementId: "st-1", value: true },
            { statementId: "st-2", value: false },
            { statementId: "st-3", value: true },
            { statementId: "st-4", value: false },
          ],
        },
      ],
    };
    const res4 = scoreAttempt(exam, att4);
    assert.equal(res4.questions[1]?.status, "full");
    assert.equal(res4.questions[1]?.correctCount, 4);
    assert.equal(toFractionString(res4.questions[1]!.points), "1");

    // 2 correct -> partial
    const att2: AttemptResponses = {
      attemptId: "att-2",
      examVersionId: "ev-1",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [
            { statementId: "st-1", value: true },
            { statementId: "st-2", value: false },
            { statementId: "st-3", value: false },
            { statementId: "st-4", value: true },
          ],
        },
      ],
    };
    const res2 = scoreAttempt(exam, att2);
    assert.equal(res2.questions[1]?.status, "partial");
    assert.equal(res2.questions[1]?.correctCount, 2);
    assert.equal(toFractionString(res2.questions[1]!.points), "1/4");

    // 0 correct with at least one answered statement -> wrong
    const att0Wrong: AttemptResponses = {
      attemptId: "att-0-wrong",
      examVersionId: "ev-1",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [{ statementId: "st-1", value: false }],
        },
      ],
    };
    const res0Wrong = scoreAttempt(exam, att0Wrong);
    assert.equal(res0Wrong.questions[1]?.status, "wrong");
    assert.equal(res0Wrong.questions[1]?.correctCount, 0);
    assert.equal(toFractionString(res0Wrong.questions[1]!.points), "0");

    // 0 answered (empty answers array) -> unanswered
    const att0Unans: AttemptResponses = {
      attemptId: "att-0-unans",
      examVersionId: "ev-1",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [],
        },
      ],
    };
    const res0Unans = scoreAttempt(exam, att0Unans);
    assert.equal(res0Unans.questions[1]?.status, "unanswered");
    assert.equal(res0Unans.questions[1]?.correctCount, 0);
    assert.equal(toFractionString(res0Unans.questions[1]!.points), "0");

    // 0 answered (all statements explicit null) -> unanswered
    const attAllNull: AttemptResponses = {
      attemptId: "att-all-null",
      examVersionId: "ev-1",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [
            { statementId: "st-1", value: null },
            { statementId: "st-2", value: null },
            { statementId: "st-3", value: null },
            { statementId: "st-4", value: null },
          ],
        },
      ],
    };
    const resAllNull = scoreAttempt(exam, attAllNull);
    assert.equal(resAllNull.questions[1]?.status, "unanswered");
    assert.equal(resAllNull.questions[1]?.correctCount, 0);
    assert.equal(toFractionString(resAllNull.questions[1]!.points), "0");

    // completely omitted Part II response from attempt -> unanswered
    const attOmitted: AttemptResponses = {
      attemptId: "att-omitted",
      examVersionId: "ev-1",
      responses: [],
    };
    const resOmitted = scoreAttempt(exam, attOmitted);
    assert.equal(resOmitted.questions[1]?.status, "unanswered");
    assert.equal(resOmitted.questions[1]?.correctCount, 0);
    assert.equal(toFractionString(resOmitted.questions[1]!.points), "0");

    // 1 correct statement and remaining null -> partial (1/10)
    const att1Corr3Null: AttemptResponses = {
      attemptId: "att-1-corr-3-null",
      examVersionId: "ev-1",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [
            { statementId: "st-1", value: true }, // correct (answer is true)
            { statementId: "st-2", value: null }, // answer is false, but null != false
            { statementId: "st-3", value: null },
            { statementId: "st-4", value: null },
          ],
        },
      ],
    };
    const res1Corr3Null = scoreAttempt(exam, att1Corr3Null);
    assert.equal(res1Corr3Null.questions[1]?.status, "partial");
    assert.equal(res1Corr3Null.questions[1]?.correctCount, 1);
    assert.equal(toFractionString(res1Corr3Null.questions[1]!.points), "1/10");

    // answers: [] (empty array of answers) -> unanswered
    const attEmptyAnswers: AttemptResponses = {
      attemptId: "att-empty-answers",
      examVersionId: "ev-1",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [],
        },
      ],
    };
    const resEmptyAnswers = scoreAttempt(exam, attEmptyAnswers);
    assert.equal(resEmptyAnswers.questions[1]?.status, "unanswered");
    assert.equal(resEmptyAnswers.questions[1]?.correctCount, 0);
    assert.equal(toFractionString(resEmptyAnswers.questions[1]!.points), "0");

    // all 4 statements answered wrongly -> status "wrong", correctCount 0, points 0
    const attAllWrong: AttemptResponses = {
      attemptId: "att-all-wrong",
      examVersionId: "ev-1",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [
            { statementId: "st-1", value: false }, // key is true
            { statementId: "st-2", value: true },  // key is false
            { statementId: "st-3", value: false }, // key is true
            { statementId: "st-4", value: true },  // key is false
          ],
        },
      ],
    };
    const resAllWrong = scoreAttempt(exam, attAllWrong);
    assert.equal(resAllWrong.questions[1]?.status, "wrong");
    assert.equal(resAllWrong.questions[1]?.correctCount, 0);
    assert.equal(toFractionString(resAllWrong.questions[1]!.points), "0");

    // Part II with unknown statement IDs only -> unanswered
    const attOnlyUnknown: AttemptResponses = {
      attemptId: "att-only-unknown",
      examVersionId: "ev-1",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [
            { statementId: "unknown-1", value: true },
            { statementId: "unknown-2", value: false },
          ],
        },
      ],
    };
    const resOnlyUnknown = scoreAttempt(exam, attOnlyUnknown);
    assert.equal(resOnlyUnknown.questions[1]?.status, "unanswered");
    assert.equal(resOnlyUnknown.questions[1]?.correctCount, 0);
    assert.equal(toFractionString(resOnlyUnknown.questions[1]!.points), "0");
  });

  it("handles Part III statuses: exact string equality, invalid raw, and unanswered", () => {
    const exam = makeBaseExam();

    // 1. Correct exact string
    const attCorrect: AttemptResponses = {
      attemptId: "att-c",
      examVersionId: "ev-1",
      responses: [{ kind: "III", questionVersionId: "qIII-1", raw: "1,5" }],
    };
    const resCorrect = scoreAttempt(exam, attCorrect);
    assert.equal(resCorrect.questions[2]?.status, "full");
    assert.equal(resCorrect.questions[2]?.inputIssues, undefined);

    // 2. Strict inequality with wrong raw answers
    // "1,50" is valid charset but different string -> wrong
    const attWrongVal: AttemptResponses = {
      attemptId: "att-w-val",
      examVersionId: "ev-1",
      responses: [{ kind: "III", questionVersionId: "qIII-1", raw: "1,50" }],
    };
    const resWrongVal = scoreAttempt(exam, attWrongVal);
    assert.equal(resWrongVal.questions[2]?.status, "wrong");
    assert.equal(resWrongVal.questions[2]?.inputIssues, undefined);
    assert.ok(equals(resWrongVal.questions[2]!.points, ZERO));

    // "1.5" has dot (not in sa-charset-v1) and " 1,5" has space -> invalid with inputIssues
    for (const badCharRaw of ["1.5", " 1,5"]) {
      const attBad: AttemptResponses = {
        attemptId: "att-bad",
        examVersionId: "ev-1",
        responses: [{ kind: "III", questionVersionId: "qIII-1", raw: badCharRaw }],
      };
      const resBad = scoreAttempt(exam, attBad);
      assert.equal(resBad.questions[2]?.status, "invalid");
      assert.ok(resBad.questions[2]?.inputIssues?.includes("bad_char"));
      assert.ok(equals(resBad.questions[2]!.points, ZERO));
    }

    // 3. Negative number '-0,5'
    const examNeg: ExamVersion = {
      ...exam,
      questions: [{ kind: "III", questionVersionId: "q-neg", answerKey: "-0,5" }],
    };
    const attNeg: AttemptResponses = {
      attemptId: "att-neg",
      examVersionId: "ev-1",
      responses: [{ kind: "III", questionVersionId: "q-neg", raw: "-0,5" }],
    };
    const resNeg = scoreAttempt(examNeg, attNeg);
    assert.equal(resNeg.questions[0]?.status, "full");

    // 4. Invalid raw: too long or bad char
    const attTooLong: AttemptResponses = {
      attemptId: "att-tl",
      examVersionId: "ev-1",
      responses: [{ kind: "III", questionVersionId: "qIII-1", raw: "12345" }],
    };
    const resTooLong = scoreAttempt(exam, attTooLong);
    assert.equal(resTooLong.questions[2]?.status, "invalid");
    assert.deepEqual(resTooLong.questions[2]?.inputIssues, ["too_long"]);

    // 5. Unanswered: raw null or empty string
    for (const emptyVal of [null, ""]) {
      const attEmpty: AttemptResponses = {
        attemptId: "att-empty",
        examVersionId: "ev-1",
        responses: [{ kind: "III", questionVersionId: "qIII-1", raw: emptyVal }],
      };
      const resEmpty = scoreAttempt(exam, attEmpty);
      assert.equal(resEmpty.questions[2]?.status, "unanswered");
      assert.equal(resEmpty.questions[2]?.inputIssues, undefined);
    }
  });

  it("is invariant to the order of attempt responses and answers", () => {
    const exam = makeBaseExam();
    const respI = { kind: "I" as const, questionVersionId: "qI-1", selectedOptionId: "opt-A" };
    const respII = {
      kind: "II" as const,
      questionVersionId: "qII-1",
      answers: [
        { statementId: "st-1", value: true },
        { statementId: "st-2", value: false },
        { statementId: "st-3", value: true },
        { statementId: "st-4", value: false },
      ],
    };
    const respIII = { kind: "III" as const, questionVersionId: "qIII-1", raw: "1,5" };

    const att1: AttemptResponses = {
      attemptId: "att-ord-1",
      examVersionId: "ev-1",
      responses: [respI, respII, respIII],
    };

    const att2: AttemptResponses = {
      attemptId: "att-ord-2",
      examVersionId: "ev-1",
      responses: [
        respIII,
        {
          ...respII,
          answers: [...respII.answers].reverse(),
        },
        respI,
      ],
    };

    const res1 = scoreAttempt(exam, att1);
    const res2 = scoreAttempt(exam, att2);

    assert.equal(toFractionString(res1.total), toFractionString(res2.total));
    assert.equal(res1.questions.length, res2.questions.length);
    for (let i = 0; i < res1.questions.length; i++) {
      assert.equal(res1.questions[i]?.questionVersionId, res2.questions[i]?.questionVersionId);
      assert.equal(res1.questions[i]?.status, res2.questions[i]?.status);
      assert.ok(equals(res1.questions[i]!.points, res2.questions[i]!.points));
    }
  });

  it("does not mutate exam or attempt objects", () => {
    const exam = makeBaseExam();
    const examSnapshot = JSON.stringify(exam);
    const attempt: AttemptResponses = {
      attemptId: "att-mut",
      examVersionId: "ev-1",
      responses: [{ kind: "I", questionVersionId: "qI-1", selectedOptionId: "opt-A" }],
    };
    const attemptSnapshot = JSON.stringify(attempt);

    scoreAttempt(exam, attempt);

    assert.equal(JSON.stringify(exam), examSnapshot);
    assert.equal(JSON.stringify(attempt), attemptSnapshot);
  });

  it("throws ScoringInputError with issues when input validation fails", () => {
    // Bad exam
    assert.throws(
      () => scoreAttempt({ bad: true }, { attemptId: "1", examVersionId: "ev-1", responses: [] }),
      (err: unknown) => err instanceof ScoringInputError && err.issues.length > 0,
    );

    // Bad attempt (mismatched examVersionId)
    const exam = makeBaseExam();
    assert.throws(
      () => scoreAttempt(exam, { attemptId: "1", examVersionId: "mismatch", responses: [] }),
      (err: unknown) => err instanceof ScoringInputError && err.issues.length > 0,
    );
  });

  it("strictly throws ScoringInputError when Part I or Part III has non-string/non-null raw payload", () => {
    const exam = makeBaseExam();
    const invalidValues = [7, true, false, {}, [], [1, 2], { foo: "bar" }];
    for (const val of invalidValues) {
      // Part I invalid selectedOptionId
      const badAttemptI = {
        attemptId: "att-bad-i",
        examVersionId: exam.examVersionId,
        responses: [{ kind: "I" as const, questionVersionId: "qI-1", selectedOptionId: val as unknown as string }],
      };
      assert.throws(
        () => scoreAttempt(exam, badAttemptI),
        (err: unknown) =>
          err instanceof ScoringInputError &&
          err.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].selectedOptionId"),
      );

      // Part III invalid raw
      const badAttemptIII = {
        attemptId: "att-bad-iii",
        examVersionId: exam.examVersionId,
        responses: [{ kind: "III" as const, questionVersionId: "qIII-1", raw: val as unknown as string }],
      };
      assert.throws(
        () => scoreAttempt(exam, badAttemptIII),
        (err: unknown) =>
          err instanceof ScoringInputError &&
          err.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].raw"),
      );
    }
  });

  it("strictly throws ScoringInputError when Part II has non-object statement answers or invalid statement values", () => {
    const exam = makeBaseExam();
    const invalidStatements = [42, "true", true, false, null, [1, 2]];
    for (const val of invalidStatements) {
      const badAttempt = {
        attemptId: "att-bad-ii-elem",
        examVersionId: exam.examVersionId,
        responses: [
          {
            kind: "II" as const,
            questionVersionId: "qII-1",
            answers: [val as unknown as { statementId: string; value: boolean | null }],
          },
        ],
      };
      assert.throws(
        () => scoreAttempt(exam, badAttempt),
        (err: unknown) =>
          err instanceof ScoringInputError &&
          err.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].answers[0]"),
      );
    }

    const invalidValues = [0, 1, "true", "false", {}, [true]];
    for (const badVal of invalidValues) {
      const badAttempt = {
        attemptId: "att-bad-ii-val",
        examVersionId: exam.examVersionId,
        responses: [
          {
            kind: "II" as const,
            questionVersionId: "qII-1",
            answers: [{ statementId: "st-1", value: badVal as unknown as boolean }],
          },
        ],
      };
      assert.throws(
        () => scoreAttempt(exam, badAttempt),
        (err: unknown) =>
          err instanceof ScoringInputError &&
          err.issues.some((i) => i.code === "TYPE_MISMATCH" && i.path === "responses[0].answers[0].value"),
      );
    }
  });
});

describe("scoreAttempt & domain - prototype property string IDs resilience (__proto__, constructor, toString)", () => {
  it("preserves IDs and scores accurately when question, option, and statement IDs are prototype property names", () => {
    const exam: ExamVersion = {
      examId: "__proto__",
      examVersionId: "constructor",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
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
          answerKey: "-1,5",
        },
      ],
    };

    const attempt: AttemptResponses = {
      attemptId: "valueOf",
      examVersionId: "constructor",
      responses: [
        { kind: "I", questionVersionId: "__proto__", selectedOptionId: "__proto__" },
        {
          kind: "II",
          questionVersionId: "constructor",
          answers: [
            { statementId: "__proto__", value: true },
            { statementId: "constructor", value: false },
            { statementId: "toString", value: true },
            { statementId: "valueOf", value: false },
          ],
        },
        { kind: "III", questionVersionId: "toString", raw: "-1,5" },
      ],
    };

    const res = scoreAttempt(exam, attempt);

    // Assert Part I
    assert.equal(res.questions[0]?.questionVersionId, "__proto__");
    assert.equal(res.questions[0]?.status, "full");
    assert.equal(toFractionString(res.questions[0]!.points), "1/4");

    // Assert Part II
    assert.equal(res.questions[1]?.questionVersionId, "constructor");
    assert.equal(res.questions[1]?.status, "full");
    assert.equal(res.questions[1]?.correctCount, 4);
    assert.equal(toFractionString(res.questions[1]!.points), "1");

    // Assert Part III: BASE = 1/4 + 1 = 5/4 < 10 -> pointIII = (10 - 5/4)/1 = 35/4
    assert.equal(res.questions[2]?.questionVersionId, "toString");
    assert.equal(res.questions[2]?.status, "full");
    assert.equal(toFractionString(res.questions[2]!.points), "35/4");

    // Total must be 10
    assert.equal(toFractionString(res.total), "10");
    assert.equal(toFractionString(res.maxTotal), "10");

    // Verify global Object prototype is not polluted
    assert.equal(Object.hasOwn(Object.prototype, "valueOf"), true);
    assert.equal(Object.hasOwn(Object.prototype, "__polluted__"), false);
  });
});
