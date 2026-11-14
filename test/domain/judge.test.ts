import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  StatementAnswer,
  QuestionI,
  QuestionII,
  QuestionIII,
} from "../../src/domain/model.ts";
import { judgeI, judgeII, judgeIII } from "../../src/domain/judge.ts";

describe("judgeI - Multiple choice (Phần I)", () => {
  const sampleQuestion = {
    kind: "I" as const,
    questionVersionId: "q1",
    options: [
      { optionId: "opt-a" },
      { optionId: "opt-b" },
      { optionId: "opt-c" },
      { optionId: "opt-d" },
    ],
    correctOptionId: "opt-b",
  };

  it("returns 'correct' when selectedOptionId matches correctOptionId", () => {
    const res = judgeI(sampleQuestion, {
      kind: "I",
      questionVersionId: "q1",
      selectedOptionId: "opt-b",
    });
    assert.equal(res, "correct");
  });

  it("returns 'wrong' when selectedOptionId is another valid option", () => {
    for (const wrongOpt of ["opt-a", "opt-c", "opt-d"]) {
      const res = judgeI(sampleQuestion, {
        kind: "I",
        questionVersionId: "q1",
        selectedOptionId: wrongOpt,
      });
      assert.equal(res, "wrong");
    }
  });

  it("returns 'unanswered' when selectedOptionId is null", () => {
    const res = judgeI(sampleQuestion, {
      kind: "I",
      questionVersionId: "q1",
      selectedOptionId: null,
    });
    assert.equal(res, "unanswered");
  });

  it("returns 'unanswered' when response is undefined", () => {
    const res = judgeI(sampleQuestion, undefined);
    assert.equal(res, "unanswered");
  });

  it("returns 'invalid' when selectedOptionId is not in options", () => {
    const resUnknown = judgeI(sampleQuestion, {
      kind: "I",
      questionVersionId: "q1",
      selectedOptionId: "opt-unknown",
    });
    assert.equal(resUnknown, "invalid");

    const resEmpty = judgeI(sampleQuestion, {
      kind: "I",
      questionVersionId: "q1",
      selectedOptionId: "",
    });
    assert.equal(resEmpty, "invalid");
  });
});

describe("judgeII - True/False 4 statements (Phần II)", () => {
  const statementIds = ["s1", "s2", "s3", "s4"] as const;

  // Independent counting oracle function for 16 x 81 exhaustive check
  function independentJudge(
    statements: readonly { statementId: string; answer: boolean }[],
    answers: readonly { statementId: string; value: boolean | null }[]
  ) {
    let count = 0;
    const perStmt = statements.map((s) => {
      const match = answers.find((a) => a.statementId === s.statementId);
      if (!match || match.value === null) {
        return { statementId: s.statementId, state: "unanswered" as const };
      }
      if (match.value === s.answer) {
        count++;
        return { statementId: s.statementId, state: "correct" as const };
      }
      return { statementId: s.statementId, state: "wrong" as const };
    });
    return { count, perStmt };
  }

  it("exhaustively tests 16 answer keys x 81 response vectors (1296 combinations)", () => {
    const boolValues = [false, true];
    const responseValues = [true, false, null];

    // Generate 16 answer keys (2^4)
    const allAnswerKeys: boolean[][] = [];
    for (const a1 of boolValues) {
      for (const a2 of boolValues) {
        for (const a3 of boolValues) {
          for (const a4 of boolValues) {
            allAnswerKeys.push([a1, a2, a3, a4]);
          }
        }
      }
    }
    assert.equal(allAnswerKeys.length, 16);

    // Generate 81 response vectors (3^4)
    const allResponseVectors: Array<Array<boolean | null>> = [];
    for (const r1 of responseValues) {
      for (const r2 of responseValues) {
        for (const r3 of responseValues) {
          for (const r4 of responseValues) {
            allResponseVectors.push([r1, r2, r3, r4]);
          }
        }
      }
    }
    assert.equal(allResponseVectors.length, 81);

    let combinationsChecked = 0;
    for (const key of allAnswerKeys) {
      const question = {
        kind: "II" as const,
        questionVersionId: "q2",
        statements: statementIds.map((id, idx) => {
          const ans = key[idx];
          if (ans === undefined) throw new Error("Index out of bounds");
          return {
            statementId: id,
            answer: ans,
          };
        }),
      };

      for (const respVec of allResponseVectors) {
        const response = {
          kind: "II" as const,
          questionVersionId: "q2",
          answers: statementIds.map((id, idx) => {
            const val = respVec[idx];
            if (val === undefined) throw new Error("Index out of bounds");
            return {
              statementId: id,
              value: val,
            };
          }),
        };

        const actual = judgeII(question, response);
        const expected = independentJudge(question.statements, response.answers);

        assert.equal(
          actual.correctCount,
          expected.count,
          `correctCount mismatch for key ${JSON.stringify(key)} and resp ${JSON.stringify(respVec)}`
        );
        assert.deepEqual(
          actual.perStatement,
          expected.perStmt,
          `perStatement mismatch for key ${JSON.stringify(key)} and resp ${JSON.stringify(respVec)}`
        );
        assert.deepEqual(actual.unknownStatementIds, []);
        combinationsChecked++;
      }
    }

    assert.equal(combinationsChecked, 16 * 81);
  });

  it("handles undefined response or missing answers array", () => {
    const question = {
      kind: "II" as const,
      questionVersionId: "q2",
      statements: [
        { statementId: "s1", answer: true },
        { statementId: "s2", answer: false },
        { statementId: "s3", answer: true },
        { statementId: "s4", answer: false },
      ],
    };

    const resUndefined = judgeII(question, undefined);
    assert.equal(resUndefined.correctCount, 0);
    assert.deepEqual(resUndefined.unknownStatementIds, []);
    assert.deepEqual(resUndefined.perStatement, [
      { statementId: "s1", state: "unanswered" },
      { statementId: "s2", state: "unanswered" },
      { statementId: "s3", state: "unanswered" },
      { statementId: "s4", state: "unanswered" },
    ]);
  });

  it("reversing or shuffling answers order does not change results", () => {
    const question = {
      kind: "II" as const,
      questionVersionId: "q2",
      statements: [
        { statementId: "s1", answer: true },
        { statementId: "s2", answer: false },
        { statementId: "s3", answer: true },
        { statementId: "s4", answer: false },
      ],
    };

    const forwardAnswers: [StatementAnswer, StatementAnswer, StatementAnswer, StatementAnswer] = [
      { statementId: "s1", value: true },
      { statementId: "s2", value: false },
      { statementId: "s3", value: false },
      { statementId: "s4", value: null },
    ];

    const reversedAnswers = [...forwardAnswers].reverse();
    const shuffledAnswers = [
      forwardAnswers[2],
      forwardAnswers[0],
      forwardAnswers[3],
      forwardAnswers[1],
    ];

    const resForward = judgeII(question, {
      kind: "II",
      questionVersionId: "q2",
      answers: forwardAnswers,
    });
    const resReversed = judgeII(question, {
      kind: "II",
      questionVersionId: "q2",
      answers: reversedAnswers,
    });
    const resShuffled = judgeII(question, {
      kind: "II",
      questionVersionId: "q2",
      answers: shuffledAnswers,
    });

    assert.equal(resForward.correctCount, 2);
    assert.equal(resReversed.correctCount, 2);
    assert.equal(resShuffled.correctCount, 2);

    // perStatement must strictly preserve question.statements order
    assert.deepEqual(resForward.perStatement, resReversed.perStatement);
    assert.deepEqual(resForward.perStatement, resShuffled.perStatement);
  });

  it("null is never counted as correct even when the correct answer is false", () => {
    const question = {
      kind: "II" as const,
      questionVersionId: "q2",
      statements: [
        { statementId: "s1", answer: false },
        { statementId: "s2", answer: false },
        { statementId: "s3", answer: false },
        { statementId: "s4", answer: false },
      ],
    };

    const res = judgeII(question, {
      kind: "II",
      questionVersionId: "q2",
      answers: [
        { statementId: "s1", value: null },
        { statementId: "s2", value: null },
        { statementId: "s3", value: null },
        { statementId: "s4", value: null },
      ],
    });

    assert.equal(res.correctCount, 0);
    for (const stmt of res.perStatement) {
      assert.equal(stmt.state, "unanswered");
    }
  });

  it("duplicate statementId in response -> invalid and not counted as correct", () => {
    const question = {
      kind: "II" as const,
      questionVersionId: "q2",
      statements: [
        { statementId: "s1", answer: true },
        { statementId: "s2", answer: true },
        { statementId: "s3", answer: false },
        { statementId: "s4", answer: false },
      ],
    };

    // s1 duplicated with matching answer true, s2 duplicated with conflicting answers
    const res = judgeII(question, {
      kind: "II",
      questionVersionId: "q2",
      answers: [
        { statementId: "s1", value: true },
        { statementId: "s1", value: true },
        { statementId: "s2", value: true },
        { statementId: "s2", value: false },
        { statementId: "s3", value: false }, // correct
        { statementId: "s4", value: true },  // wrong
      ],
    });

    assert.equal(res.correctCount, 1); // only s3 is correct
    assert.deepEqual(res.perStatement, [
      { statementId: "s1", state: "invalid" },
      { statementId: "s2", state: "invalid" },
      { statementId: "s3", state: "correct" },
      { statementId: "s4", state: "wrong" },
    ]);
  });

  it("unknown statementId in response -> collected into unknownStatementIds and ignored", () => {
    const question = {
      kind: "II" as const,
      questionVersionId: "q2",
      statements: [
        { statementId: "s1", answer: true },
        { statementId: "s2", answer: true },
        { statementId: "s3", answer: true },
        { statementId: "s4", answer: true },
      ],
    };

    const res = judgeII(question, {
      kind: "II",
      questionVersionId: "q2",
      answers: [
        { statementId: "s1", value: true },
        { statementId: "ghost_1", value: true },
        { statementId: "s2", value: true },
        { statementId: "ghost_2", value: false },
        { statementId: "ghost_1", value: false }, // repeated unknown
        { statementId: "s3", value: null },
      ],
    });

    assert.equal(res.correctCount, 2); // s1 and s2
    assert.deepEqual(res.unknownStatementIds, ["ghost_1", "ghost_2"]);
    assert.deepEqual(res.perStatement, [
      { statementId: "s1", state: "correct" },
      { statementId: "s2", state: "correct" },
      { statementId: "s3", state: "unanswered" },
      { statementId: "s4", state: "unanswered" }, // absent from answers -> unanswered
    ]);
  });
});

describe("judgeIII - Short answer (Phần III)", () => {
  it("strictly distinguishes '1,5' vs '1,50' vs '1.5'", () => {
    const question = {
      kind: "III" as const,
      questionVersionId: "q3",
      answerKey: "1,5",
    };

    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: "1,5" }),
      "correct"
    );
    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: "1,50" }),
      "wrong"
    );
    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: "1.5" }),
      "wrong"
    );
  });

  it("correctly judges negative decimal '-0,5'", () => {
    const question = {
      kind: "III" as const,
      questionVersionId: "q3",
      answerKey: "-0,5",
    };

    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: "-0,5" }),
      "correct"
    );
    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: "-0.5" }),
      "wrong"
    );
    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: "0,5" }),
      "wrong"
    );
  });

  it("treats empty string, null, and undefined response as 'unanswered'", () => {
    const question = {
      kind: "III" as const,
      questionVersionId: "q3",
      answerKey: "1,5",
    };

    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: "" }),
      "unanswered"
    );
    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: null }),
      "unanswered"
    );
    assert.equal(judgeIII(question, undefined), "unanswered");
  });

  it("does not trim whitespace (' 1,5' is wrong when key is '1,5')", () => {
    const question = {
      kind: "III" as const,
      questionVersionId: "q3",
      answerKey: "1,5",
    };

    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: " 1,5" }),
      "wrong"
    );
    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: "1,5 " }),
      "wrong"
    );
    assert.equal(
      judgeIII(question, { kind: "III", questionVersionId: "q3", raw: " 1,5 " }),
      "wrong"
    );
  });

  it("does not parse numbers ('01' ≠ '1')", () => {
    const q1 = {
      kind: "III" as const,
      questionVersionId: "q3_1",
      answerKey: "1",
    };

    assert.equal(
      judgeIII(q1, { kind: "III", questionVersionId: "q3_1", raw: "01" }),
      "wrong"
    );
    assert.equal(
      judgeIII(q1, { kind: "III", questionVersionId: "q3_1", raw: "1" }),
      "correct"
    );

    const q01 = {
      kind: "III" as const,
      questionVersionId: "q3_2",
      answerKey: "01",
    };

    assert.equal(
      judgeIII(q01, { kind: "III", questionVersionId: "q3_2", raw: "1" }),
      "wrong"
    );
    assert.equal(
      judgeIII(q01, { kind: "III", questionVersionId: "q3_2", raw: "01" }),
      "correct"
    );
  });

  it("handles prototype property string IDs (__proto__, constructor, toString, valueOf) cleanly across judgeI, judgeII, and judgeIII", () => {
    // judgeI with prototype IDs
    const q1: QuestionI = {
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
    assert.equal(
      judgeI(q1, { kind: "I", questionVersionId: "__proto__", selectedOptionId: "__proto__" }),
      "correct"
    );
    assert.equal(
      judgeI(q1, { kind: "I", questionVersionId: "__proto__", selectedOptionId: "constructor" }),
      "wrong"
    );
    assert.equal(
      judgeI(q1, { kind: "I", questionVersionId: "__proto__", selectedOptionId: "hasOwnProperty" }),
      "invalid"
    );
    assert.equal(
      judgeI(q1, { kind: "I", questionVersionId: "__proto__", selectedOptionId: null }),
      "unanswered"
    );

    // judgeII with prototype IDs
    const q2: QuestionII = {
      kind: "II",
      questionVersionId: "constructor",
      statements: [
        { statementId: "__proto__", answer: true },
        { statementId: "constructor", answer: false },
        { statementId: "toString", answer: true },
        { statementId: "valueOf", answer: false },
      ],
    };
    const res2 = judgeII(q2, {
      kind: "II",
      questionVersionId: "constructor",
      answers: [
        { statementId: "__proto__", value: true },
        { statementId: "constructor", value: false },
        { statementId: "toString", value: false },
        { statementId: "valueOf", value: null },
        { statementId: "hasOwnProperty", value: true },
      ],
    });
    assert.equal(res2.correctCount, 2);
    assert.deepEqual(res2.perStatement, [
      { statementId: "__proto__", state: "correct" },
      { statementId: "constructor", state: "correct" },
      { statementId: "toString", state: "wrong" },
      { statementId: "valueOf", state: "unanswered" },
    ]);
    assert.deepEqual(res2.unknownStatementIds, ["hasOwnProperty"]);

    // judgeII with duplicate prototype statementId
    const res2Dup = judgeII(q2, {
      kind: "II",
      questionVersionId: "constructor",
      answers: [
        { statementId: "__proto__", value: true },
        { statementId: "__proto__", value: false },
      ],
    });
    assert.equal(res2Dup.perStatement[0]?.state, "invalid");

    // judgeIII with prototype questionVersionId
    const q3: QuestionIII = {
      kind: "III",
      questionVersionId: "toString",
      answerKey: "1,5",
    };
    assert.equal(
      judgeIII(q3, { kind: "III", questionVersionId: "toString", raw: "1,5" }),
      "correct"
    );
    assert.equal(
      judgeIII(q3, { kind: "III", questionVersionId: "toString", raw: "1.5" }),
      "wrong"
    );
  });
});
