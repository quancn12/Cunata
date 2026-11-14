import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreResultToDTO,
  scoreResultFromDTO,
} from "../../src/domain/serialize.ts";
import { scoreAttempt, type ScoreResult } from "../../src/domain/scoreAttempt.ts";
import { equals } from "../../src/domain/rational.ts";
import type { ExamVersion, AttemptResponses } from "../../src/domain/model.ts";

describe("serialize - scoreResultToDTO and scoreResultFromDTO", () => {
  const makeExamAndAttempt = (): { exam: ExamVersion; attempt: AttemptResponses } => {
    const exam: ExamVersion = {
      examId: "exam-ser",
      examVersionId: "ev-ser",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "qI-1",
          options: [
            { optionId: "opt-1" },
            { optionId: "opt-2" },
            { optionId: "opt-3" },
            { optionId: "opt-4" },
          ],
          correctOptionId: "opt-1",
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
    };

    const attempt: AttemptResponses = {
      attemptId: "att-ser",
      examVersionId: "ev-ser",
      responses: [
        { kind: "I", questionVersionId: "qI-1", selectedOptionId: "opt-1" },
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
        { kind: "III", questionVersionId: "qIII-1", raw: "1,5" },
      ],
    };

    return { exam, attempt };
  };

  it("performs flawless JSON round-trip: scoreResultFromDTO(JSON.parse(JSON.stringify(scoreResultToDTO(r)))) === r", () => {
    const { exam, attempt } = makeExamAndAttempt();
    const r = scoreAttempt(exam, attempt);

    const dto = scoreResultToDTO(r);
    const jsonString = JSON.stringify(dto);
    const parsedDto = JSON.parse(jsonString) as unknown;
    const restored = scoreResultFromDTO(parsedDto);

    // Metadata
    assert.equal(restored.attemptId, r.attemptId);
    assert.equal(restored.examVersionId, r.examVersionId);
    assert.equal(restored.ruleSetId, r.ruleSetId);
    assert.equal(restored.inputPolicyId, r.inputPolicyId);
    assert.equal(restored.engineVersion, r.engineVersion);

    // Totals
    assert.ok(equals(restored.total, r.total));
    assert.ok(equals(restored.maxTotal, r.maxTotal));

    // Sections
    for (const sec of ["I", "II", "III"] as const) {
      assert.equal(restored.sections[sec].questionCount, r.sections[sec].questionCount);
      assert.ok(equals(restored.sections[sec].score, r.sections[sec].score));
      assert.ok(equals(restored.sections[sec].max, r.sections[sec].max));
    }

    // Questions
    assert.equal(restored.questions.length, r.questions.length);
    for (let i = 0; i < r.questions.length; i++) {
      const qOrig = r.questions[i]!;
      const qRest = restored.questions[i]!;
      assert.equal(qRest.questionVersionId, qOrig.questionVersionId);
      assert.equal(qRest.kind, qOrig.kind);
      assert.equal(qRest.status, qOrig.status);
      assert.ok(equals(qRest.points, qOrig.points));
      assert.ok(equals(qRest.maxPoints, qOrig.maxPoints));
      assert.equal(qRest.correctCount, qOrig.correctCount);
      assert.deepEqual(qRest.inputIssues, qOrig.inputIssues);
    }

    assert.ok(Object.isFrozen(restored));
    assert.ok(Object.isFrozen(restored.sections));
    assert.ok(Object.isFrozen(restored.questions));
  });

  it("handles optional fields round-trip: inputIssues in Part III and correctCount in Part II", () => {
    const { exam } = makeExamAndAttempt();
    const attemptWithIssues: AttemptResponses = {
      attemptId: "att-issues",
      examVersionId: "ev-ser",
      responses: [
        { kind: "III", questionVersionId: "qIII-1", raw: "12345" }, // too long
      ],
    };
    const r = scoreAttempt(exam, attemptWithIssues);
    const dto = scoreResultToDTO(r);
    const restored = scoreResultFromDTO(JSON.parse(JSON.stringify(dto)));

    const q3 = restored.questions.find((q) => q.questionVersionId === "qIII-1");
    assert.ok(q3);
    assert.equal(q3.status, "invalid");
    assert.deepEqual(q3.inputIssues, ["too_long"]);
  });

  it("rejects non-object inputs in scoreResultFromDTO with SyntaxError", () => {
    assert.throws(() => scoreResultFromDTO(null), SyntaxError);
    assert.throws(() => scoreResultFromDTO(undefined), SyntaxError);
    assert.throws(() => scoreResultFromDTO("string"), SyntaxError);
    assert.throws(() => scoreResultFromDTO(123), SyntaxError);
    assert.throws(() => scoreResultFromDTO([]), SyntaxError);
  });

  it("rejects JSON Numbers for score, max, total, and maxTotal with SyntaxError", () => {
    const { exam, attempt } = makeExamAndAttempt();
    const r = scoreAttempt(exam, attempt);
    const validDto = scoreResultToDTO(r) as Record<string, unknown>;

    // total is a number instead of string
    const badTotal = { ...validDto, total: 10 };
    assert.throws(() => scoreResultFromDTO(badTotal), SyntaxError);

    // maxTotal is a number
    const badMaxTotal = { ...validDto, maxTotal: 10 };
    assert.throws(() => scoreResultFromDTO(badMaxTotal), SyntaxError);

    // section score is a number
    const badSec = {
      ...validDto,
      sections: {
        ...(validDto.sections as Record<string, unknown>),
        I: {
          ...((validDto.sections as Record<string, unknown>)["I"] as Record<string, unknown>),
          score: 1.5,
        },
      },
    };
    assert.throws(() => scoreResultFromDTO(badSec), SyntaxError);

    // question points is a number
    const badQ = {
      ...validDto,
      questions: [
        {
          ...((validDto.questions as Record<string, unknown>[])[0] as Record<string, unknown>),
          points: 0.25,
        },
      ],
    };
    assert.throws(() => scoreResultFromDTO(badQ), SyntaxError);
  });

  it("rejects unreduced or invalid fraction strings with SyntaxError", () => {
    const { exam, attempt } = makeExamAndAttempt();
    const r = scoreAttempt(exam, attempt);
    const validDto = scoreResultToDTO(r) as Record<string, unknown>;

    // "2/4" is not canonical
    const unreducedDto = { ...validDto, total: "2/4" };
    assert.throws(() => scoreResultFromDTO(unreducedDto), SyntaxError);

    // "1.5" is not a fraction string
    const decimalDto = { ...validDto, total: "1.5" };
    assert.throws(() => scoreResultFromDTO(decimalDto), SyntaxError);
  });

  it("rejects invalid metadata and section values with SyntaxError", () => {
    const { exam, attempt } = makeExamAndAttempt();
    const r = scoreAttempt(exam, attempt);
    const validDto = scoreResultToDTO(r) as Record<string, unknown>;

    // bad ruleSetId
    assert.throws(() => scoreResultFromDTO({ ...validDto, ruleSetId: "unknown-rule" }), SyntaxError);

    // bad inputPolicyId
    assert.throws(() => scoreResultFromDTO({ ...validDto, inputPolicyId: "unknown-policy" }), SyntaxError);

    // empty attemptId
    assert.throws(() => scoreResultFromDTO({ ...validDto, attemptId: "" }), SyntaxError);

    // negative questionCount
    const negCountDto = {
      ...validDto,
      sections: {
        ...(validDto.sections as Record<string, unknown>),
        I: {
          ...((validDto.sections as Record<string, unknown>)["I"] as Record<string, unknown>),
          questionCount: -1,
        },
      },
    };
    assert.throws(() => scoreResultFromDTO(negCountDto), SyntaxError);
  });

  it("rejects misplaced fields in questions with SyntaxError", () => {
    const { exam, attempt } = makeExamAndAttempt();
    const r = scoreAttempt(exam, attempt);
    const validDto = scoreResultToDTO(r) as Record<string, unknown>;

    // correctCount placed on Part I
    const badQ1 = {
      ...validDto,
      questions: [
        {
          ...((validDto.questions as Record<string, unknown>[])[0] as Record<string, unknown>),
          correctCount: 2,
        },
      ],
    };
    assert.throws(() => scoreResultFromDTO(badQ1), SyntaxError);

    // inputIssues placed on Part II
    const badQ2 = {
      ...validDto,
      questions: [
        {
          ...((validDto.questions as Record<string, unknown>[])[1] as Record<string, unknown>),
          inputIssues: ["bad_char"],
        },
      ],
    };
    assert.throws(() => scoreResultFromDTO(badQ2), SyntaxError);
  });

  it("LC10-F06 regression: rejects null-prototype objects, throwing getters/proxies with SyntaxError", () => {
    // Null-prototype object in ruleSetId
    assert.throws(
      () =>
        scoreResultFromDTO({
          attemptId: "a",
          examVersionId: "e",
          ruleSetId: Object.create(null),
        }),
      SyntaxError
    );

    // Null-prototype object in inputPolicyId
    assert.throws(
      () =>
        scoreResultFromDTO({
          attemptId: "a",
          examVersionId: "e",
          ruleSetId: "custom-v1",
          inputPolicyId: Object.create(null),
        }),
      SyntaxError
    );

    // Object with throwing Symbol.toPrimitive
    const throwingPrimitive = {
      [Symbol.toPrimitive]() {
        throw new Error("Cannot coerce");
      },
    };
    assert.throws(
      () =>
        scoreResultFromDTO({
          attemptId: "a",
          examVersionId: "e",
          ruleSetId: throwingPrimitive,
        }),
      SyntaxError
    );

    // Throwing getter on a field
    const throwingGetterObj = {
      attemptId: "a",
      examVersionId: "e",
      get ruleSetId(): string {
        throw new TypeError("Getter failure");
      },
    };
    assert.throws(() => scoreResultFromDTO(throwingGetterObj), SyntaxError);

    // Throwing proxy
    const throwingProxy = new Proxy(
      {},
      {
        get() {
          throw new RangeError("Proxy trap error");
        },
      }
    );
    assert.throws(() => scoreResultFromDTO(throwingProxy), SyntaxError);
  });

  it("L06-domain regression: rejects relational and mathematical inconsistencies in ScoreResult DTO", () => {
    const { exam, attempt } = makeExamAndAttempt();
    const r = scoreAttempt(exam, attempt);
    const validDto = scoreResultToDTO(r) as Record<string, unknown>;

    // 1. total does not match sum of sections
    assert.throws(
      () => scoreResultFromDTO({ ...validDto, total: "999" }),
      /total does not match sum of section scores/,
    );

    // 2. maxTotal does not match sum of section maximums
    assert.throws(
      () => scoreResultFromDTO({ ...validDto, maxTotal: "999" }),
      /maxTotal does not match sum of section maximums/,
    );

    // 3. duplicate questionVersionId in questions
    const qList = validDto.questions as Record<string, unknown>[];
    assert.throws(
      () =>
        scoreResultFromDTO({
          ...validDto,
          questions: [...qList, { ...qList[0] }],
        }),
      /duplicated/,
    );

    // 4. section questionCount mismatch
    const badSecCount = {
      ...validDto,
      sections: {
        ...(validDto.sections as Record<string, unknown>),
        I: {
          ...((validDto.sections as Record<string, unknown>)["I"] as Record<string, unknown>),
          questionCount: 5,
        },
      },
    };
    assert.throws(() => scoreResultFromDTO(badSecCount), /questionCount/);

    // 5. section score does not match sum of question points
    const badSecScore = {
      ...validDto,
      sections: {
        ...(validDto.sections as Record<string, unknown>),
        I: {
          ...((validDto.sections as Record<string, unknown>)["I"] as Record<string, unknown>),
          score: "1",
        },
      },
      total: "10", // 1 + 1/4 + 35/4 = 10, so total matches section sums, but section I score won't match its question points
    };
    assert.throws(() => scoreResultFromDTO(badSecScore), /section I score does not match/);

    // 6. question status "full" but points is 0
    const badQStatus = {
      ...validDto,
      questions: [
        { ...qList[0], status: "wrong" }, // qList[0] has points 1/4, so wrong is inconsistent
        qList[1],
        qList[2],
      ],
    };
    assert.throws(() => scoreResultFromDTO(badQStatus), /has status "wrong" but points/);

    // 7. Part I maxPoints not 1/4
    const badQPartIMax = {
      ...validDto,
      questions: [
        { ...qList[0], maxPoints: "1", points: "1" },
        qList[1],
        qList[2],
      ],
    };
    assert.throws(() => scoreResultFromDTO(badQPartIMax), /maxPoints must be 1\/4 for Part I/);

    // 8. Part II points does not match correctCount
    const badQPartIIPoints = {
      ...validDto,
      questions: [
        qList[0],
        { ...qList[1], points: "1/2", correctCount: 2 }, // correctCount 2 should be 1/4
        qList[2],
      ],
    };
    assert.throws(() => scoreResultFromDTO(badQPartIIPoints), /points does not match correctCount/);
  });

  it("LC23-F01 regression: rejects points, status, and maximums contradicting custom-v1 and engine version", () => {
    // 1. Two controls from Codex probe
    // Control A: reject wrong III max
    const exIII: ExamVersion = {
      examId: "e-ctrl",
      examVersionId: "v-ctrl",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [{ kind: "III", questionVersionId: "q1", answerKey: "1" }],
    };
    const atIII: AttemptResponses = {
      attemptId: "a-ctrl",
      examVersionId: "v-ctrl",
      responses: [{ kind: "III", questionVersionId: "q1", raw: "1" }],
    };
    const rIII = scoreAttempt(exIII, atIII);
    const dIII = scoreResultToDTO(rIII) as Record<string, any>;

    // Valid roundtrip control
    assert.deepEqual(scoreResultFromDTO(JSON.parse(JSON.stringify(dIII))), rIII);

    // Tampering III points and maxima to 1 (when formula requires 10)
    dIII.questions[0].points = "1";
    dIII.questions[0].maxPoints = "1";
    dIII.sections.III.score = "1";
    dIII.sections.III.max = "1";
    dIII.total = "1";
    dIII.maxTotal = "1";
    assert.throws(() => scoreResultFromDTO(dIII), SyntaxError);

    // Control B: reject Part I partial
    const exI: ExamVersion = {
      examId: "e-ctrl-i",
      examVersionId: "v-ctrl-i",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "qI",
          options: ["a", "b", "c", "d"].map((optionId) => ({ optionId })),
          correctOptionId: "a",
        },
      ],
    };
    const atI: AttemptResponses = {
      attemptId: "a-ctrl-i",
      examVersionId: "v-ctrl-i",
      responses: [],
    };
    const rI = scoreAttempt(exI, atI);
    const dI = scoreResultToDTO(rI) as Record<string, any>;
    dI.questions[0].status = "partial";
    dI.questions[0].points = "1/10";
    dI.sections.I.score = "1/10";
    dI.total = "1/10";
    assert.throws(() => scoreResultFromDTO(dI), SyntaxError);

    // 2. Part III max different and both wrong
    const exIII2: ExamVersion = {
      examId: "e-iii2",
      examVersionId: "v-iii2",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        { kind: "III", questionVersionId: "q3-1", answerKey: "1" },
        { kind: "III", questionVersionId: "q3-2", answerKey: "2" },
      ],
    };
    const atIII2: AttemptResponses = {
      attemptId: "a-iii2",
      examVersionId: "v-iii2",
      responses: [
        { kind: "III", questionVersionId: "q3-1", raw: "1" },
        { kind: "III", questionVersionId: "q3-2", raw: "2" },
      ],
    };
    const rIII2 = scoreAttempt(exIII2, atIII2); // n3=2 -> pointIII = 5, maxIII = 10, maxTotal = 10
    const dIII2_diff = scoreResultToDTO(rIII2) as Record<string, any>;
    // Different maxPoints
    dIII2_diff.questions[0].maxPoints = "5";
    dIII2_diff.questions[1].maxPoints = "5/2";
    assert.throws(() => scoreResultFromDTO(dIII2_diff), SyntaxError);

    // Same maxPoints but wrong formula value (both 1 instead of 5)
    const dIII2_sameWrong = scoreResultToDTO(rIII2) as Record<string, any>;
    dIII2_sameWrong.questions[0].points = "1";
    dIII2_sameWrong.questions[0].maxPoints = "1";
    dIII2_sameWrong.questions[1].points = "1";
    dIII2_sameWrong.questions[1].maxPoints = "1";
    dIII2_sameWrong.sections.III.score = "2";
    dIII2_sameWrong.sections.III.max = "2";
    dIII2_sameWrong.total = "2";
    dIII2_sameWrong.maxTotal = "2";
    assert.throws(() => scoreResultFromDTO(dIII2_sameWrong), SyntaxError);

    // 3. Formula checks for different BASE configurations:
    // BASE < 10 (12 Part I, 4 Part II, 6 Part III -> pointIII = 1/2, maxIII = 3, maxTotal = 10)
    const exBaseLt10: ExamVersion = {
      examId: "e-lt10",
      examVersionId: "v-lt10",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        ...Array.from({ length: 12 }, (_, i) => ({
          kind: "I" as const,
          questionVersionId: `qI-${i}`,
          options: ["a", "b", "c", "d"].map((optionId) => ({ optionId })),
          correctOptionId: "a",
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          kind: "II" as const,
          questionVersionId: `qII-${i}`,
          statements: [
            { statementId: "s1", answer: true },
            { statementId: "s2", answer: false },
            { statementId: "s3", answer: true },
            { statementId: "s4", answer: false },
          ],
        })),
        ...Array.from({ length: 6 }, (_, i) => ({
          kind: "III" as const,
          questionVersionId: `qIII-${i}`,
          answerKey: "1",
        })),
      ],
    };
    const rBaseLt10 = scoreAttempt(exBaseLt10, {
      attemptId: "a-lt10",
      examVersionId: "v-lt10",
      responses: [],
    });
    const dBaseLt10 = scoreResultToDTO(rBaseLt10) as Record<string, any>;
    // Change section III max to 4 instead of 3
    dBaseLt10.sections.III.max = "4";
    dBaseLt10.maxTotal = "11";
    assert.throws(() => scoreResultFromDTO(dBaseLt10), SyntaxError);

    // BASE = 10 (20 Part I, 5 Part II, 4 Part III -> pointIII = 1/4, maxIII = 1, maxTotal = 11)
    const exBaseEq10: ExamVersion = {
      examId: "e-eq10",
      examVersionId: "v-eq10",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        ...Array.from({ length: 20 }, (_, i) => ({
          kind: "I" as const,
          questionVersionId: `qI-${i}`,
          options: ["a", "b", "c", "d"].map((optionId) => ({ optionId })),
          correctOptionId: "a",
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          kind: "II" as const,
          questionVersionId: `qII-${i}`,
          statements: [
            { statementId: "s1", answer: true },
            { statementId: "s2", answer: false },
            { statementId: "s3", answer: true },
            { statementId: "s4", answer: false },
          ],
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          kind: "III" as const,
          questionVersionId: `qIII-${i}`,
          answerKey: "1",
        })),
      ],
    };
    const rBaseEq10 = scoreAttempt(exBaseEq10, {
      attemptId: "a-eq10",
      examVersionId: "v-eq10",
      responses: [],
    });
    const dBaseEq10 = scoreResultToDTO(rBaseEq10) as Record<string, any>;
    dBaseEq10.sections.III.max = "2";
    dBaseEq10.maxTotal = "12";
    assert.throws(() => scoreResultFromDTO(dBaseEq10), SyntaxError);

    // BASE > 10 (20 Part I, 10 Part II, 4 Part III -> pointIII = 1/4, maxIII = 1, maxTotal = 16)
    const exBaseGt10: ExamVersion = {
      examId: "e-gt10",
      examVersionId: "v-gt10",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        ...Array.from({ length: 20 }, (_, i) => ({
          kind: "I" as const,
          questionVersionId: `qI-${i}`,
          options: ["a", "b", "c", "d"].map((optionId) => ({ optionId })),
          correctOptionId: "a",
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          kind: "II" as const,
          questionVersionId: `qII-${i}`,
          statements: [
            { statementId: "s1", answer: true },
            { statementId: "s2", answer: false },
            { statementId: "s3", answer: true },
            { statementId: "s4", answer: false },
          ],
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          kind: "III" as const,
          questionVersionId: `qIII-${i}`,
          answerKey: "1",
        })),
      ],
    };
    const rBaseGt10 = scoreAttempt(exBaseGt10, {
      attemptId: "a-gt10",
      examVersionId: "v-gt10",
      responses: [],
    });
    const dBaseGt10 = scoreResultToDTO(rBaseGt10) as Record<string, any>;
    dBaseGt10.sections.III.max = "2";
    dBaseGt10.maxTotal = "17";
    assert.throws(() => scoreResultFromDTO(dBaseGt10), SyntaxError);

    // N3 = 3 repeating fraction (pointIII = 10/3, maxTotal = 10)
    const exN3_3: ExamVersion = {
      examId: "e-n3-3",
      examVersionId: "v-n3-3",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: Array.from({ length: 3 }, (_, i) => ({
        kind: "III" as const,
        questionVersionId: `qIII-${i}`,
        answerKey: "1",
      })),
    };
    const rN3_3 = scoreAttempt(exN3_3, {
      attemptId: "a-n3-3",
      examVersionId: "v-n3-3",
      responses: [],
    });
    const dN3_3 = scoreResultToDTO(rN3_3) as Record<string, any>;
    dN3_3.questions[0].maxPoints = "3";
    dN3_3.questions[1].maxPoints = "3";
    dN3_3.questions[2].maxPoints = "4";
    assert.throws(() => scoreResultFromDTO(dN3_3), SyntaxError);

    // N3 = 7 repeating fraction (pointIII = 10/7, maxTotal = 10)
    const exN3_7: ExamVersion = {
      examId: "e-n3-7",
      examVersionId: "v-n3-7",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: Array.from({ length: 7 }, (_, i) => ({
        kind: "III" as const,
        questionVersionId: `qIII-${i}`,
        answerKey: "1",
      })),
    };
    const rN3_7 = scoreAttempt(exN3_7, {
      attemptId: "a-n3-7",
      examVersionId: "v-n3-7",
      responses: [],
    });
    const dN3_7 = scoreResultToDTO(rN3_7) as Record<string, any>;
    dN3_7.sections.III.max = "9";
    dN3_7.maxTotal = "9";
    assert.throws(() => scoreResultFromDTO(dN3_7), SyntaxError);

    // 4. Disallowed statuses
    // Part III cannot have status "partial"
    const dIII_partial = scoreResultToDTO(rIII) as Record<string, any>;
    dIII_partial.questions[0].status = "partial";
    dIII_partial.questions[0].points = "5";
    dIII_partial.sections.III.score = "5";
    dIII_partial.total = "5";
    assert.throws(() => scoreResultFromDTO(dIII_partial), /Part III cannot have status "partial"/);

    // Part II cannot have status "invalid"
    const { exam: exam2, attempt: att2 } = makeExamAndAttempt();
    const r2 = scoreAttempt(exam2, att2);
    const d2_inv = scoreResultToDTO(r2) as Record<string, any>;
    d2_inv.questions[1].status = "invalid";
    d2_inv.questions[1].points = "0";
    assert.throws(() => scoreResultFromDTO(d2_inv), /Part II cannot have status "invalid"/);

    // 5. Part II count / status contradictions
    // correctCount 4 with status partial
    const d2_k4_partial = scoreResultToDTO(r2) as Record<string, any>;
    d2_k4_partial.questions[1].correctCount = 4;
    d2_k4_partial.questions[1].status = "partial";
    d2_k4_partial.questions[1].points = "1/2";
    assert.throws(() => scoreResultFromDTO(d2_k4_partial), SyntaxError);

    // correctCount 2 with status full
    const d2_k2_full = scoreResultToDTO(r2) as Record<string, any>;
    d2_k2_full.questions[1].correctCount = 2;
    d2_k2_full.questions[1].status = "full";
    d2_k2_full.questions[1].points = "1";
    assert.throws(() => scoreResultFromDTO(d2_k2_full), SyntaxError);

    // correctCount 0 with status partial
    const d2_k0_partial = scoreResultToDTO(r2) as Record<string, any>;
    d2_k0_partial.questions[1].correctCount = 0;
    d2_k0_partial.questions[1].status = "partial";
    d2_k0_partial.questions[1].points = "1/10";
    assert.throws(() => scoreResultFromDTO(d2_k0_partial), SyntaxError);

    // correctCount missing on Part II
    const d2_no_cc = scoreResultToDTO(r2) as Record<string, any>;
    delete d2_no_cc.questions[1].correctCount;
    assert.throws(() => scoreResultFromDTO(d2_no_cc), /correctCount must be an integer between 0 and 4/);

    // correctCount out of bounds (5)
    const d2_cc5 = scoreResultToDTO(r2) as Record<string, any>;
    d2_cc5.questions[1].correctCount = 5;
    assert.throws(() => scoreResultFromDTO(d2_cc5), /correctCount must be an integer between 0 and 4/);

    // 6. Part III inputIssues / status
    // status "invalid" but inputIssues missing
    const dIII_inv_noIssues = scoreResultToDTO(rIII) as Record<string, any>;
    dIII_inv_noIssues.questions[0].status = "invalid";
    dIII_inv_noIssues.questions[0].points = "0";
    dIII_inv_noIssues.sections.III.score = "0";
    dIII_inv_noIssues.total = "0";
    assert.throws(() => scoreResultFromDTO(dIII_inv_noIssues), /inputIssues must be a non-empty array/);

    // status "invalid" but inputIssues empty
    const dIII_inv_emptyIssues = {
      ...dIII_inv_noIssues,
      questions: [
        {
          ...dIII_inv_noIssues.questions[0],
          inputIssues: [],
        },
      ],
    };
    assert.throws(() => scoreResultFromDTO(dIII_inv_emptyIssues), /inputIssues must be a non-empty array/);

    // status "invalid" with invalid issue code
    const dIII_inv_badIssue = {
      ...dIII_inv_noIssues,
      questions: [
        {
          ...dIII_inv_noIssues.questions[0],
          inputIssues: ["unknown_code"],
        },
      ],
    };
    assert.throws(() => scoreResultFromDTO(dIII_inv_badIssue), /inputIssues contains invalid issue/);

    // status "full" with inputIssues present
    const dIII_full_issues = scoreResultToDTO(rIII) as Record<string, any>;
    dIII_full_issues.questions[0].inputIssues = ["bad_char"];
    assert.throws(() => scoreResultFromDTO(dIII_full_issues), /inputIssues is not allowed when status is "full"/);

    // 7. Empty DTO exam
    assert.throws(
      () =>
        scoreResultFromDTO({
          attemptId: "att-empty",
          examVersionId: "ev-empty",
          ruleSetId: "custom-v1",
          inputPolicyId: "sa-charset-v1",
          engineVersion: "m1-1.0.0",
          sections: {
            I: { questionCount: 0, score: "0", max: "0" },
            II: { questionCount: 0, score: "0", max: "0" },
            III: { questionCount: 0, score: "0", max: "0" },
          },
          total: "0",
          maxTotal: "0",
          questions: [],
        }),
      /Exam must have at least one question/,
    );
  });

  it("handles DTO roundtrip with prototype property string IDs (__proto__, constructor, toString) cleanly", () => {
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
          questionVersionId: "toString",
          statements: [
            { statementId: "__proto__", answer: true },
            { statementId: "constructor", answer: false },
            { statementId: "toString", answer: true },
            { statementId: "valueOf", answer: false },
          ],
        },
        {
          kind: "III",
          questionVersionId: "valueOf",
          answerKey: "-1,5",
        },
      ],
    };

    const attempt: AttemptResponses = {
      attemptId: "__proto__",
      examVersionId: "constructor",
      responses: [
        { kind: "I", questionVersionId: "__proto__", selectedOptionId: "__proto__" },
        {
          kind: "II",
          questionVersionId: "toString",
          answers: [
            { statementId: "__proto__", value: true },
            { statementId: "constructor", value: false },
            { statementId: "toString", value: true },
            { statementId: "valueOf", value: false },
          ],
        },
        { kind: "III", questionVersionId: "valueOf", raw: "-1,5" },
      ],
    };

    const res = scoreAttempt(exam, attempt);
    const dto = scoreResultToDTO(res);
    const jsonStr = JSON.stringify(dto);
    const parsedDto = JSON.parse(jsonStr);
    const restored = scoreResultFromDTO(parsedDto);

    assert.equal(restored.attemptId, "__proto__");
    assert.equal(restored.examVersionId, "constructor");
    assert.equal(restored.questions[0]?.questionVersionId, "__proto__");
    assert.equal(restored.questions[1]?.questionVersionId, "toString");
    assert.equal(restored.questions[2]?.questionVersionId, "valueOf");
    assert.deepEqual(restored, res);

    // Verify global Object prototype was not polluted
    assert.equal(Object.hasOwn(Object.prototype, "__polluted_dto__"), false);
  });

  describe("serialize - DTO malformed error handling and defensive checks", () => {
    it("scoreResultToDTO rejects null or non-object inputs with TypeError", () => {
      assert.throws(() => scoreResultToDTO(null as any), TypeError);
      assert.throws(() => scoreResultToDTO(undefined as any), TypeError);
      assert.throws(() => scoreResultToDTO("string" as any), TypeError);
      assert.throws(() => scoreResultToDTO(123 as any), TypeError);
    });

    it("scoreResultFromDTO rejects non-object or non-Record inputs with SyntaxError", () => {
      assert.throws(() => scoreResultFromDTO(null), SyntaxError);
      assert.throws(() => scoreResultFromDTO(undefined), SyntaxError);
      assert.throws(() => scoreResultFromDTO("invalid"), SyntaxError);
      assert.throws(() => scoreResultFromDTO(123), SyntaxError);
      assert.throws(() => scoreResultFromDTO([]), SyntaxError);
    });

    it("scoreResultFromDTO rejects missing or invalid header fields", () => {
      const { exam, attempt } = makeExamAndAttempt();
      const baseDto = scoreResultToDTO(scoreAttempt(exam, attempt)) as Record<string, unknown>;

      // attemptId invalid
      assert.throws(() => scoreResultFromDTO({ ...baseDto, attemptId: "" }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, attemptId: 123 }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, attemptId: null }), SyntaxError);

      // examVersionId invalid
      assert.throws(() => scoreResultFromDTO({ ...baseDto, examVersionId: "" }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, examVersionId: 456 }), SyntaxError);

      // ruleSetId invalid
      assert.throws(() => scoreResultFromDTO({ ...baseDto, ruleSetId: "unknown-v1" }), SyntaxError);

      // inputPolicyId invalid
      assert.throws(() => scoreResultFromDTO({ ...baseDto, inputPolicyId: "unknown-charset" }), SyntaxError);

      // engineVersion invalid
      assert.throws(() => scoreResultFromDTO({ ...baseDto, engineVersion: "" }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, engineVersion: 789 }), SyntaxError);
    });

    it("scoreResultFromDTO rejects malformed total and maxTotal", () => {
      const { exam, attempt } = makeExamAndAttempt();
      const baseDto = scoreResultToDTO(scoreAttempt(exam, attempt)) as Record<string, unknown>;

      // Non-string total
      assert.throws(() => scoreResultFromDTO({ ...baseDto, total: 10 }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, total: true }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, total: {} }), SyntaxError);

      // Non-string maxTotal
      assert.throws(() => scoreResultFromDTO({ ...baseDto, maxTotal: 10 }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, maxTotal: null }), SyntaxError);
    });

    it("scoreResultFromDTO rejects malformed sections container or section entries", () => {
      const { exam, attempt } = makeExamAndAttempt();
      const baseDto = scoreResultToDTO(scoreAttempt(exam, attempt)) as Record<string, any>;

      assert.throws(() => scoreResultFromDTO({ ...baseDto, sections: null }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, sections: "invalid" }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, sections: [] }), SyntaxError);

      // sections.I not an object
      assert.throws(() => scoreResultFromDTO({ ...baseDto, sections: { ...baseDto.sections, I: null } }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, sections: { ...baseDto.sections, I: [] } }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, sections: { ...baseDto.sections, I: 123 } }), SyntaxError);

      // questionCount not a safe non-negative integer
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        sections: { ...baseDto.sections, I: { ...baseDto.sections.I, questionCount: -1 } },
      }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        sections: { ...baseDto.sections, I: { ...baseDto.sections.I, questionCount: 1.5 } },
      }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        sections: { ...baseDto.sections, I: { ...baseDto.sections.I, questionCount: "1" } },
      }), SyntaxError);
    });

    it("scoreResultFromDTO rejects malformed questions array or question entries", () => {
      const { exam, attempt } = makeExamAndAttempt();
      const baseDto = scoreResultToDTO(scoreAttempt(exam, attempt)) as Record<string, any>;

      // questions not an array
      assert.throws(() => scoreResultFromDTO({ ...baseDto, questions: null }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, questions: {} }), SyntaxError);

      // question entry not an object or null
      assert.throws(() => scoreResultFromDTO({ ...baseDto, questions: [null] }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({ ...baseDto, questions: ["invalid"] }), SyntaxError);

      // invalid questionVersionId
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], questionVersionId: "" }, ...baseDto.questions.slice(1)],
      }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], questionVersionId: 99 }, ...baseDto.questions.slice(1)],
      }), SyntaxError);

      // invalid kind
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], kind: "IV" }, ...baseDto.questions.slice(1)],
      }), SyntaxError);

      // invalid status
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], status: "bogus" }, ...baseDto.questions.slice(1)],
      }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], status: 123 }, ...baseDto.questions.slice(1)],
      }), SyntaxError);

      // negative points
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], points: "-1/4" }, ...baseDto.questions.slice(1)],
      }), SyntaxError);

      // points exceeds maxPoints
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], points: "1/2" }, ...baseDto.questions.slice(1)],
      }), SyntaxError);

      // Part I with forbidden correctCount or inputIssues
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], correctCount: 1 }, ...baseDto.questions.slice(1)],
      }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], inputIssues: ["empty"] }, ...baseDto.questions.slice(1)],
      }), SyntaxError);

      // Part II with status invalid or maxPoints not 1 or correctCount invalid
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], { ...baseDto.questions[1], status: "invalid" }, baseDto.questions[2]],
      }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], { ...baseDto.questions[1], maxPoints: "2" }, baseDto.questions[2]],
      }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], { ...baseDto.questions[1], correctCount: 5 }, baseDto.questions[2]],
      }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], { ...baseDto.questions[1], correctCount: -1 }, baseDto.questions[2]],
      }), SyntaxError);
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], { ...baseDto.questions[1], correctCount: "4" }, baseDto.questions[2]],
      }), SyntaxError);

      // Part III with correctCount
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], baseDto.questions[1], { ...baseDto.questions[2], correctCount: 1 }],
      }), SyntaxError);

      // Part III with status partial
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], baseDto.questions[1], { ...baseDto.questions[2], status: "partial", points: "1" }],
      }), SyntaxError);

      // Part III status invalid but missing or empty inputIssues
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], baseDto.questions[1], { ...baseDto.questions[2], status: "invalid", points: "0", inputIssues: [] }],
      }), SyntaxError);

      // Status full but points !== maxPoints
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [{ ...baseDto.questions[0], status: "full", points: "0" }, ...baseDto.questions.slice(1)],
      }), SyntaxError);

      // Status partial but points is 0
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], { ...baseDto.questions[1], status: "partial", points: "0" }, baseDto.questions[2]],
      }), SyntaxError);

      // Part II correctCount 4 but status is partial
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], { ...baseDto.questions[1], correctCount: 4, status: "partial", points: "1/2" }, baseDto.questions[2]],
      }), SyntaxError);

      // Part II correctCount 2 but status is wrong
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], { ...baseDto.questions[1], correctCount: 2, status: "wrong", points: "0" }, baseDto.questions[2]],
      }), SyntaxError);

      // Part II points does not match PART2_POINTS[correctCount]
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        questions: [baseDto.questions[0], { ...baseDto.questions[1], correctCount: 2, status: "partial", points: "1/10" }, baseDto.questions[2]],
      }), SyntaxError);

      // Section I score mismatch with sum of question points
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        sections: { ...baseDto.sections, I: { ...baseDto.sections.I, score: "0" } },
      }), SyntaxError);

      // Section I max mismatch with sum of question maxPoints
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        sections: { ...baseDto.sections, I: { ...baseDto.sections.I, max: "1/2" } },
      }), SyntaxError);

      // Total mismatch with sum of section scores
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        total: "0",
      }), SyntaxError);

      // maxTotal mismatch with computeExamMax
      assert.throws(() => scoreResultFromDTO({
        ...baseDto,
        maxTotal: "15",
      }), SyntaxError);
    });
  });
});
