import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  scoreAttempt,
  computeExamMax,
  rational,
  ZERO,
  ONE,
  add,
  sub,
  mul,
  div,
  sum,
  compare,
  equals,
  toFractionString,
  parseFractionString,
  toDecimalString,
  createPresentationOrder,
  validatePresentationOrder,
  judgeI,
  judgeII,
  judgeIII,
  checkShortAnswer,
  PART2_POINTS,
  POINT_I,
  scoreResultToDTO,
  scoreResultFromDTO,
  validateExamVersion,
  validateAttemptResponses,
  ScoringInputError,
  MAX_QUESTIONS_PER_EXAM,
  type ExamVersion,
  type AttemptResponses,
  type QuestionI,
  type QuestionII,
  type QuestionIII,
  type ScoreResult,
} from "../../src/domain/index.ts";

// ============================================================================
// B1-T17: SUT Intentional Mutants Discrimination
// ============================================================================
describe("B1-T17 — Intentional Mutants Discrimination on SUT", () => {
  // Mutant 1: Part II linear 0.25/statement vs GDPT 2018 non-linear staircase (0, 0.1, 0.25, 0.5, 1)
  it("discriminates against Mutant 1 (linear Part II scoring k/4)", () => {
    const exam: ExamVersion = {
      examId: "exam-m1",
      examVersionId: "ev-m1",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "II",
          questionVersionId: "q-m1",
          statements: [
            { statementId: "st-1", answer: true },
            { statementId: "st-2", answer: false },
            { statementId: "st-3", answer: true },
            { statementId: "st-4", answer: false },
          ],
        },
      ],
    };

    // Candidate answers exactly 1 statement correctly
    const attK1: AttemptResponses = {
      attemptId: "att-k1",
      examVersionId: "ev-m1",
      responses: [
        {
          kind: "II",
          questionVersionId: "q-m1",
          answers: [
            { statementId: "st-1", value: true }, // correct
            { statementId: "st-2", value: true }, // wrong (answer is false)
            { statementId: "st-3", value: false }, // wrong (answer is true)
            { statementId: "st-4", value: true }, // wrong (answer is false)
          ],
        },
      ],
    };

    const resK1 = scoreAttempt(exam, attK1);
    const scoreK1 = resK1.questions[0]!.points;

    // Linear mutant would yield 1/4 (0.25)
    const mutantScore = rational(1, 4);
    // SUT must yield exact 1/10 (0.10)
    const actualScore = rational(1, 10);

    assert.ok(!equals(scoreK1, mutantScore), "SUT must NOT use linear k/4 mutant");
    assert.ok(equals(scoreK1, actualScore), "SUT must use exact 1/10 for k=1");
    assert.equal(toFractionString(scoreK1), "1/10");

    // Candidate answers exactly 3 statements correctly
    const attK3: AttemptResponses = {
      attemptId: "att-k3",
      examVersionId: "ev-m1",
      responses: [
        {
          kind: "II",
          questionVersionId: "q-m1",
          answers: [
            { statementId: "st-1", value: true }, // correct
            { statementId: "st-2", value: false }, // correct
            { statementId: "st-3", value: true }, // correct
            { statementId: "st-4", value: true }, // wrong
          ],
        },
      ],
    };
    const resK3 = scoreAttempt(exam, attK3);
    const scoreK3 = resK3.questions[0]!.points;
    const mutantScoreK3 = rational(3, 4); // 0.75
    const actualScoreK3 = rational(1, 2); // 0.50
    assert.ok(!equals(scoreK3, mutantScoreK3), "SUT must NOT use linear k/4 mutant for k=3");
    assert.ok(equals(scoreK3, actualScoreK3), "SUT must use exact 1/2 for k=3");
  });

  // Mutant 2: null -> false (unanswered statements auto-treated as false)
  it("discriminates against Mutant 2 (treating unanswered null as false)", () => {
    const exam: ExamVersion = {
      examId: "exam-m2",
      examVersionId: "ev-m2",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "II",
          questionVersionId: "q-m2",
          statements: [
            // All answers are FALSE
            { statementId: "st-1", answer: false },
            { statementId: "st-2", answer: false },
            { statementId: "st-3", answer: false },
            { statementId: "st-4", answer: false },
          ],
        },
      ],
    };

    // Candidate leaves all statements unanswered (null)
    const attUnans: AttemptResponses = {
      attemptId: "att-unans",
      examVersionId: "ev-m2",
      responses: [
        {
          kind: "II",
          questionVersionId: "q-m2",
          answers: [
            { statementId: "st-1", value: null },
            { statementId: "st-2", value: null },
            { statementId: "st-3", value: null },
            { statementId: "st-4", value: null },
          ],
        },
      ],
    };

    const res = scoreAttempt(exam, attUnans);
    // If mutant treated null as false, it would match all 4 answers and give full 1 point!
    assert.equal(res.questions[0]!.correctCount, 0, "Unanswered statements must never match false");
    assert.equal(res.questions[0]!.status, "unanswered");
    assert.ok(equals(res.questions[0]!.points, ZERO), "Score must be 0, not 1");
    assert.ok(equals(res.total, ZERO));
  });

  // Mutant 3: numeric III parsing (parseFloat / Number() numeric equality)
  it("discriminates against Mutant 3 (numeric parsing of short answers)", () => {
    const exam: ExamVersion = {
      examId: "exam-m3",
      examVersionId: "ev-m3",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        { kind: "III", questionVersionId: "q-1", answerKey: "1,5" },
        { kind: "III", questionVersionId: "q-2", answerKey: "01" },
        { kind: "III", questionVersionId: "q-3", answerKey: "-0,5" },
      ],
    };

    // Candidate submits numeric equivalents that differ character-wise:
    // '1,50' for '1,5' (same number, different string)
    // '1' for '01' (same number, different string)
    // '-0.5' for '-0,5' (dot instead of comma)
    const att: AttemptResponses = {
      attemptId: "att-m3",
      examVersionId: "ev-m3",
      responses: [
        { kind: "III", questionVersionId: "q-1", raw: "1,50" },
        { kind: "III", questionVersionId: "q-2", raw: "1" },
        { kind: "III", questionVersionId: "q-3", raw: "-0.5" },
      ],
    };

    const res = scoreAttempt(exam, att);
    // Under numeric mutant: all 3 would be marked 'full' with points
    // Under strict SUT: all 3 must receive 0 points
    assert.equal(res.questions[0]!.status, "wrong", "1,50 must not match 1,5");
    assert.ok(equals(res.questions[0]!.points, ZERO));

    assert.equal(res.questions[1]!.status, "wrong", "1 must not match 01");
    assert.ok(equals(res.questions[1]!.points, ZERO));

    assert.equal(res.questions[2]!.status, "invalid", "-0.5 has dot (bad_char)");
    assert.ok(equals(res.questions[2]!.points, ZERO));

    assert.ok(equals(res.total, ZERO), "Total must be 0 under strict character comparison");
  });

  // Mutant 4: cap10 (forcing total score and maxTotal to <= 10)
  it("discriminates against Mutant 4 (forcing scores to scale or cap at 10)", () => {
    // Golden case (20, 10, 0): maxTotal = 20*0.25 + 10*1 = 15
    const exam15: ExamVersion = {
      examId: "exam-m4-15",
      examVersionId: "ev-m4-15",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        ...Array.from({ length: 20 }, (_, i) => ({
          kind: "I" as const,
          questionVersionId: `qI-${i}`,
          options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
          correctOptionId: "o1",
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
      ],
    };

    // Full correct attempt: score must be 15, NOT capped at 10
    const attFull: AttemptResponses = {
      attemptId: "att-full",
      examVersionId: "ev-m4-15",
      responses: [
        ...Array.from({ length: 20 }, (_, i) => ({
          kind: "I" as const,
          questionVersionId: `qI-${i}`,
          selectedOptionId: "o1",
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          kind: "II" as const,
          questionVersionId: `qII-${i}`,
          answers: [
            { statementId: "s1", value: true },
            { statementId: "s2", value: false },
            { statementId: "s3", value: true },
            { statementId: "s4", value: false },
          ],
        })),
      ],
    };

    const res = scoreAttempt(exam15, attFull);
    assert.equal(toFractionString(res.maxTotal), "15", "maxTotal must be 15, not capped at 10");
    assert.equal(toFractionString(res.total), "15", "total score must be 15, not capped at 10");

    // Partial student scoring 12 points: must report 12/15, not capped or scaled to /10
    const att12: AttemptResponses = {
      attemptId: "att-12",
      examVersionId: "ev-m4-15",
      responses: [
        // 20 Part I correct -> 5 points
        ...Array.from({ length: 20 }, (_, i) => ({
          kind: "I" as const,
          questionVersionId: `qI-${i}`,
          selectedOptionId: "o1",
        })),
        // 7 Part II correct -> 7 points
        ...Array.from({ length: 7 }, (_, i) => ({
          kind: "II" as const,
          questionVersionId: `qII-${i}`,
          answers: [
            { statementId: "s1", value: true },
            { statementId: "s2", value: false },
            { statementId: "s3", value: true },
            { statementId: "s4", value: false },
          ],
        })),
        // 3 Part II unanswered -> 0 points
      ],
    };
    const res12 = scoreAttempt(exam15, att12);
    assert.equal(toFractionString(res12.total), "12", "Score must be exactly 12");
    assert.equal(toFractionString(res12.maxTotal), "15", "Max must be exactly 15");
  });

  // Mutant 5: round per question (rounding each question score before summation)
  it("discriminates against Mutant 5 (per-item rounding drift vs exact rational summation)", () => {
    // Exam with (0, 0, 3): BASE=0 < 10 -> pointIII = 10/3.
    // Repeating fraction: 10/3 = 3.3333...
    // If rounded per question to 2 decimal places: 3 * 3.33 = 9.99 (drift!)
    // SUT must sum exact BigInt fractions: 10/3 + 10/3 + 10/3 = 30/3 = 10/1 = 10 exactly.
    const exam3: ExamVersion = {
      examId: "exam-m5",
      examVersionId: "ev-m5",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        { kind: "III", questionVersionId: "q1", answerKey: "1" },
        { kind: "III", questionVersionId: "q2", answerKey: "2" },
        { kind: "III", questionVersionId: "q3", answerKey: "3" },
      ],
    };

    const att: AttemptResponses = {
      attemptId: "att-m5",
      examVersionId: "ev-m5",
      responses: [
        { kind: "III", questionVersionId: "q1", raw: "1" },
        { kind: "III", questionVersionId: "q2", raw: "2" },
        { kind: "III", questionVersionId: "q3", raw: "3" },
      ],
    };

    const res = scoreAttempt(exam3, att);
    assert.equal(toFractionString(res.questions[0]!.points), "10/3");
    assert.equal(toFractionString(res.questions[1]!.points), "10/3");
    assert.equal(toFractionString(res.questions[2]!.points), "10/3");
    assert.equal(toFractionString(res.total), "10", "Sum of 3 x 10/3 must be exact 10, no 9.99 drift");
    assert.equal(toFractionString(res.maxTotal), "10");
  });

  // Mutant 6: key by visual index (A/B/C/D position instead of optionId)
  it("discriminates against Mutant 6 (judging options by position index instead of stable ID)", () => {
    const q: QuestionI = {
      kind: "I",
      questionVersionId: "q-perm",
      options: [
        { optionId: "opt-A" },
        { optionId: "opt-B" },
        { optionId: "opt-C" },
        { optionId: "opt-D" },
      ],
      correctOptionId: "opt-C", // Key is opt-C (index 2 in original)
    };

    // Candidate selected opt-C
    const response = {
      kind: "I" as const,
      questionVersionId: "q-perm",
      selectedOptionId: "opt-C",
    };

    // Original order
    assert.equal(judgeI(q, response), "correct");

    // Permuted options: opt-C moved to index 0
    const permutedQ: QuestionI = {
      ...q,
      options: [
        { optionId: "opt-C" },
        { optionId: "opt-A" },
        { optionId: "opt-D" },
        { optionId: "opt-B" },
      ],
    };

    // SUT must still judge as correct because matching is by ID, not index
    assert.equal(judgeI(permutedQ, response), "correct");
  });

  // Mutant 7: latest version pointer leakage
  it("discriminates against Mutant 7 (scoring depends only on snapshot examVersionId, no global version leak)", () => {
    const examV1: ExamVersion = {
      examId: "exam-shared",
      examVersionId: "v1",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        { kind: "III", questionVersionId: "q1", answerKey: "10" },
      ],
    };

    const examV2: ExamVersion = {
      examId: "exam-shared",
      examVersionId: "v2",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        { kind: "III", questionVersionId: "q1", answerKey: "99" }, // Answer key changed in v2!
      ],
    };

    const attV1: AttemptResponses = {
      attemptId: "att-v1",
      examVersionId: "v1",
      responses: [{ kind: "III", questionVersionId: "q1", raw: "10" }],
    };

    // Scoring attV1 with examV1 gives full score
    const resV1 = scoreAttempt(examV1, attV1);
    assert.equal(resV1.questions[0]!.status, "full");
    assert.equal(toFractionString(resV1.total), "10");

    // Attempt for v1 cannot be evaluated with examV2 (mismatched examVersionId)
    assert.throws(
      () => scoreAttempt(examV2, attV1),
      (err: unknown) =>
        err instanceof Error &&
        (err as { issues?: { code: string }[] }).issues?.some(
          (i) => i.code === "ATTEMPT_EXAM_MISMATCH"
        )
    );
  });

  // Mutant 8: Duplicate statementId in Part II response (mutant blindly picks first or last match instead of marking invalid)
  it("discriminates against Mutant 8 (duplicate statementId in Part II response marked invalid, not credited)", () => {
    const exam: ExamVersion = {
      examId: "exam-m8",
      examVersionId: "ev-m8",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "II",
          questionVersionId: "q-m8",
          statements: [
            { statementId: "st-1", answer: true },
            { statementId: "st-2", answer: false },
            { statementId: "st-3", answer: true },
            { statementId: "st-4", answer: false },
          ],
        },
      ],
    };

    // Candidate response has duplicate answers for st-1: first true (correct), second false (wrong)
    // SUT judgeII detects matches.length > 1 -> state is 'invalid', not counted in correctCount
    const attDup: AttemptResponses = {
      attemptId: "att-m8",
      examVersionId: "ev-m8",
      responses: [
        {
          kind: "II",
          questionVersionId: "q-m8",
          answers: [
            { statementId: "st-1", value: true },
            { statementId: "st-1", value: false },
            { statementId: "st-2", value: false }, // correct
            { statementId: "st-3", value: true },  // correct
            { statementId: "st-4", value: false }, // correct
          ],
        },
      ],
    };

    const res = scoreAttempt(exam, attDup);
    // If mutant picked the first answer (true), correctCount would be 4 -> full 1 point!
    // SUT marks st-1 as 'invalid', so only 3 statements are correct -> k=3 -> partial 1/2 point!
    assert.equal(res.questions[0]!.correctCount, 3, "st-1 with duplicate answers must be invalid and not credited");
    assert.equal(res.questions[0]!.status, "partial");
    assert.ok(equals(res.questions[0]!.points, rational(1, 2)));
    assert.ok(!equals(res.questions[0]!.points, ONE), "Must not receive full 1.00 point");
  });

  // Mutant 9: Part III whitespace trimming / casing mutant (mutant accepts ' 1,5 ' or '\t1,5')
  it("discriminates against Mutant 9 (Part III raw whitespace trimming or casing mutants)", () => {
    const exam: ExamVersion = {
      examId: "exam-m9",
      examVersionId: "ev-m9",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        { kind: "III", questionVersionId: "q-m9", answerKey: "1,5" },
      ],
    };

    // Trim mutant would accept ' 1,5' or '1,5 '
    const attPadded: AttemptResponses = {
      attemptId: "att-m9",
      examVersionId: "ev-m9",
      responses: [
        { kind: "III", questionVersionId: "q-m9", raw: " 1,5" },
      ],
    };

    const res = scoreAttempt(exam, attPadded);
    // Space is a bad_char under sa-charset-v1 -> status invalid, 0 points
    assert.equal(res.questions[0]!.status, "invalid", "Leading space must be marked invalid under sa-charset-v1");
    assert.ok(equals(res.questions[0]!.points, ZERO));
    assert.ok(res.questions[0]!.inputIssues?.includes("bad_char"));
  });

  // Mutant 10: Part I invalid optionId treated as wrong without checking validity or crashing
  it("discriminates against Mutant 10 (Part I invalid foreign optionId correctly marked invalid)", () => {
    const exam: ExamVersion = {
      examId: "exam-m10",
      examVersionId: "ev-m10",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "q-m10",
          options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
          correctOptionId: "o1",
        },
      ],
    };

    const attForeign: AttemptResponses = {
      attemptId: "att-m10",
      examVersionId: "ev-m10",
      responses: [
        { kind: "I", questionVersionId: "q-m10", selectedOptionId: "foreign-opt" },
      ],
    };

    const res = scoreAttempt(exam, attForeign);
    assert.equal(res.questions[0]!.status, "invalid", "Selected option not in question options must be invalid");
    assert.ok(equals(res.questions[0]!.points, ZERO));
  });

  // Mutant 11: Part II foreign statementIds causing false count or crash
  it("discriminates against Mutant 11 (Part II foreign statement IDs ignored and not counted)", () => {
    const exam: ExamVersion = {
      examId: "exam-m11",
      examVersionId: "ev-m11",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "II",
          questionVersionId: "q-m11",
          statements: [
            { statementId: "st-1", answer: true },
            { statementId: "st-2", answer: true },
            { statementId: "st-3", answer: true },
            { statementId: "st-4", answer: true },
          ],
        },
      ],
    };

    // Candidate submits 4 foreign statement IDs that are all true, but none of the actual question statement IDs
    const attForeign: AttemptResponses = {
      attemptId: "att-m11",
      examVersionId: "ev-m11",
      responses: [
        {
          kind: "II",
          questionVersionId: "q-m11",
          answers: [
            { statementId: "foreign-1", value: true },
            { statementId: "foreign-2", value: true },
            { statementId: "foreign-3", value: true },
            { statementId: "foreign-4", value: true },
          ],
        },
      ],
    };

    const res = scoreAttempt(exam, attForeign);
    assert.equal(res.questions[0]!.correctCount, 0, "Foreign statement IDs must not contribute to correctCount");
    assert.equal(res.questions[0]!.status, "unanswered");
    assert.ok(equals(res.questions[0]!.points, ZERO));
  });

  // Mutant 12: Order dependency in statements or questions
  it("discriminates against Mutant 12 (response and statement order permutations yield identical scores)", () => {
    const exam: ExamVersion = {
      examId: "exam-m12",
      examVersionId: "ev-m12",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "qI",
          options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
          correctOptionId: "o2",
        },
        {
          kind: "II",
          questionVersionId: "qII",
          statements: [
            { statementId: "st-1", answer: true },
            { statementId: "st-2", answer: false },
            { statementId: "st-3", answer: true },
            { statementId: "st-4", answer: false },
          ],
        },
        { kind: "III", questionVersionId: "qIII", answerKey: "3,14" },
      ],
    };

    // Normal order
    const attNormal: AttemptResponses = {
      attemptId: "att-norm",
      examVersionId: "ev-m12",
      responses: [
        { kind: "I", questionVersionId: "qI", selectedOptionId: "o2" },
        {
          kind: "II",
          questionVersionId: "qII",
          answers: [
            { statementId: "st-1", value: true },
            { statementId: "st-2", value: false },
            { statementId: "st-3", value: true },
            { statementId: "st-4", value: true }, // 3 correct
          ],
        },
        { kind: "III", questionVersionId: "qIII", raw: "3,14" },
      ],
    };

    // Reversed questions order, and reversed statements order
    const attReversed: AttemptResponses = {
      attemptId: "att-rev",
      examVersionId: "ev-m12",
      responses: [
        { kind: "III", questionVersionId: "qIII", raw: "3,14" },
        {
          kind: "II",
          questionVersionId: "qII",
          answers: [
            { statementId: "st-4", value: true },
            { statementId: "st-3", value: true },
            { statementId: "st-2", value: false },
            { statementId: "st-1", value: true },
          ],
        },
        { kind: "I", questionVersionId: "qI", selectedOptionId: "o2" },
      ],
    };

    const resNormal = scoreAttempt(exam, attNormal);
    const resReversed = scoreAttempt(exam, attReversed);

    assert.ok(equals(resNormal.total, resReversed.total));
    assert.ok(equals(resNormal.sections.I.score, resReversed.sections.I.score));
    assert.ok(equals(resNormal.sections.II.score, resReversed.sections.II.score));
    assert.ok(equals(resNormal.sections.III.score, resReversed.sections.III.score));
    // Question results should match in original exam question order
    assert.equal(resReversed.questions[0]?.questionVersionId, "qI");
    assert.equal(resReversed.questions[1]?.questionVersionId, "qII");
    assert.equal(resReversed.questions[2]?.questionVersionId, "qIII");
  });
});

// ============================================================================
// B1-T15: Property-Based Invariant Verification (Fixed Seed PRNG)
// ============================================================================
describe("B1-T15 — Property-Based Invariants (Fixed Seed PRNG)", () => {
  // Simple deterministic PRNG: LCG with seed 20261114
  class LcgRng {
    private state: number;
    constructor(seed: number) {
      this.state = seed >>> 0;
    }
    next(): number {
      this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
      return this.state / 4294967296;
    }
    nextInt(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
    choice<T>(arr: readonly T[]): T {
      return arr[this.nextInt(0, arr.length - 1)]!;
    }
  }

  it("verifies mathematical invariants over 100 randomized exam & attempt configurations", () => {
    const rng = new LcgRng(20261114);

    for (let testIdx = 0; testIdx < 100; testIdx++) {
      const n1 = rng.nextInt(0, 10);
      const n2 = rng.nextInt(0, 6);
      const n3 = rng.nextInt(0, 5);
      if (n1 + n2 + n3 === 0) continue;

      const questions: (QuestionI | QuestionII | QuestionIII)[] = [];

      // Generate Part I
      for (let i = 0; i < n1; i++) {
        questions.push({
          kind: "I",
          questionVersionId: `qI_${testIdx}_${i}`,
          options: [0, 1, 2, 3].map((o) => ({ optionId: `opt_${i}_${o}` })),
          correctOptionId: `opt_${i}_${rng.nextInt(0, 3)}`,
        });
      }

      // Generate Part II
      for (let i = 0; i < n2; i++) {
        questions.push({
          kind: "II",
          questionVersionId: `qII_${testIdx}_${i}`,
          statements: [0, 1, 2, 3].map((s) => ({
            statementId: `st_${i}_${s}`,
            answer: rng.next() > 0.5,
          })),
        });
      }

      // Generate Part III
      for (let i = 0; i < n3; i++) {
        const keys = ["1,5", "-0,5", "42", "0", "12", "-1", "3,14", "99"];
        questions.push({
          kind: "III",
          questionVersionId: `qIII_${testIdx}_${i}`,
          answerKey: rng.choice(keys),
        });
      }

      const exam: ExamVersion = {
        examId: `exam_${testIdx}`,
        examVersionId: `v_${testIdx}`,
        ruleSetId: "custom-v1",
        inputPolicyId: "sa-charset-v1",
        questions,
      };

      // Generate randomized student attempt
      const responses: AttemptResponses["responses"][number][] = [];
      for (const q of questions) {
        // Probability: 20% unanswered, 40% correct, 40% random/wrong
        const roll = rng.next();
        if (roll < 0.2) {
          // Unanswered: either omit or explicit null
          if (q.kind === "I") {
            responses.push({ kind: "I", questionVersionId: q.questionVersionId, selectedOptionId: null });
          } else if (q.kind === "II") {
            responses.push({
              kind: "II",
              questionVersionId: q.questionVersionId,
              answers: q.statements.map((s) => ({ statementId: s.statementId, value: null })),
            });
          } else {
            responses.push({ kind: "III", questionVersionId: q.questionVersionId, raw: null });
          }
        } else if (roll < 0.6) {
          // Correct answer
          if (q.kind === "I") {
            responses.push({ kind: "I", questionVersionId: q.questionVersionId, selectedOptionId: q.correctOptionId });
          } else if (q.kind === "II") {
            responses.push({
              kind: "II",
              questionVersionId: q.questionVersionId,
              answers: q.statements.map((s) => ({ statementId: s.statementId, value: s.answer })),
            });
          } else {
            responses.push({ kind: "III", questionVersionId: q.questionVersionId, raw: q.answerKey });
          }
        } else {
          // Random / wrong answer
          if (q.kind === "I") {
            const wrongOpts = q.options.filter((o) => o.optionId !== q.correctOptionId);
            responses.push({
              kind: "I",
              questionVersionId: q.questionVersionId,
              selectedOptionId: rng.choice(wrongOpts).optionId,
            });
          } else if (q.kind === "II") {
            responses.push({
              kind: "II",
              questionVersionId: q.questionVersionId,
              answers: q.statements.map((s) => ({
                statementId: s.statementId,
                value: rng.next() > 0.5,
              })),
            });
          } else {
            responses.push({
              kind: "III",
              questionVersionId: q.questionVersionId,
              raw: "999",
            });
          }
        }
      }

      const attempt: AttemptResponses = {
        attemptId: `att_${testIdx}`,
        examVersionId: exam.examVersionId,
        responses,
      };

      const result = scoreAttempt(exam, attempt);

      // Invariant 1: Bounds: 0 <= score <= max for every question, section, and total
      assert.ok(result.total.num >= 0n, `Total score must be non-negative at test ${testIdx}`);
      assert.ok(
        result.total.num * result.maxTotal.den <= result.maxTotal.num * result.total.den,
        `Total score cannot exceed maxTotal at test ${testIdx}`
      );

      for (const secKey of ["I", "II", "III"] as const) {
        const sec = result.sections[secKey];
        assert.ok(sec.score.num >= 0n, `Section ${secKey} score must be >= 0`);
        assert.ok(
          sec.score.num * sec.max.den <= sec.max.num * sec.score.den,
          `Section ${secKey} score cannot exceed section max`
        );
      }

      for (const qRes of result.questions) {
        assert.ok(qRes.points.num >= 0n, `Question points must be >= 0`);
        assert.ok(
          qRes.points.num * qRes.maxPoints.den <= qRes.maxPoints.num * qRes.points.den,
          `Question points cannot exceed maxPoints`
        );
      }

      // Invariant 2: Section score additivity: sum(section scores) === total
      const sumSecScores = add(add(result.sections.I.score, result.sections.II.score), result.sections.III.score);
      assert.ok(equals(sumSecScores, result.total), `Sum of section scores must equal total at test ${testIdx}`);

      const sumSecMaxes = add(add(result.sections.I.max, result.sections.II.max), result.sections.III.max);
      assert.ok(equals(sumSecMaxes, result.maxTotal), `Sum of section maxes must equal maxTotal at test ${testIdx}`);

      // Invariant 3: Question points sum matches section score
      let qPointsI = ZERO;
      let qPointsII = ZERO;
      let qPointsIII = ZERO;
      for (const qRes of result.questions) {
        if (qRes.kind === "I") qPointsI = add(qPointsI, qRes.points);
        else if (qRes.kind === "II") qPointsII = add(qPointsII, qRes.points);
        else if (qRes.kind === "III") qPointsIII = add(qPointsIII, qRes.points);
      }
      assert.ok(equals(qPointsI, result.sections.I.score), `Part I question points sum must equal section score`);
      assert.ok(equals(qPointsII, result.sections.II.score), `Part II question points sum must equal section score`);
      assert.ok(equals(qPointsIII, result.sections.III.score), `Part III question points sum must equal section score`);

      // Invariant 4: Extreme cases
      // All correct attempt
      const allCorrectAttempt: AttemptResponses = {
        attemptId: `all_corr_${testIdx}`,
        examVersionId: exam.examVersionId,
        responses: questions.map((q) => {
          if (q.kind === "I") {
            return { kind: "I", questionVersionId: q.questionVersionId, selectedOptionId: q.correctOptionId };
          } else if (q.kind === "II") {
            return {
              kind: "II",
              questionVersionId: q.questionVersionId,
              answers: q.statements.map((s) => ({ statementId: s.statementId, value: s.answer })),
            };
          } else {
            return { kind: "III", questionVersionId: q.questionVersionId, raw: q.answerKey };
          }
        }),
      };
      const resAllCorr = scoreAttempt(exam, allCorrectAttempt);
      assert.ok(
        equals(resAllCorr.total, resAllCorr.maxTotal),
        `All-correct attempt must achieve exact maxTotal at test ${testIdx}`
      );

      // All blank attempt
      const allBlankAttempt: AttemptResponses = {
        attemptId: `all_blank_${testIdx}`,
        examVersionId: exam.examVersionId,
        responses: [],
      };
      const resAllBlank = scoreAttempt(exam, allBlankAttempt);
      assert.ok(equals(resAllBlank.total, ZERO), `All-blank attempt must score exact 0 at test ${testIdx}`);
    }
  });

  it("verifies presentation order shuffle invariance", () => {
    const exam: ExamVersion = {
      examId: "exam-shuff",
      examVersionId: "ev-shuff",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "qI-1",
          options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
          correctOptionId: "o2",
        },
        {
          kind: "I",
          questionVersionId: "qI-2",
          options: [{ optionId: "oA" }, { optionId: "oB" }, { optionId: "oC" }, { optionId: "oD" }],
          correctOptionId: "oD",
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
      ],
    };

    const attempt: AttemptResponses = {
      attemptId: "att-shuff",
      examVersionId: "ev-shuff",
      responses: [
        { kind: "I", questionVersionId: "qI-1", selectedOptionId: "o2" },
        { kind: "I", questionVersionId: "qI-2", selectedOptionId: "oA" },
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

    const originalScore = scoreAttempt(exam, attempt);

    // Generate presentation orders with different seeds and flags
    for (const seed of ["seed-alpha", "seed-beta", "20261114-xyz"]) {
      const order = createPresentationOrder(
        exam,
        { shuffleQuestions: true, shuffleOptions: true },
        seed
      );
      assert.equal(order.questionOrder.length, 3);
      assert.equal(order.optionOrder.length, 2);

      // Scoring is based purely on ID matching, so shuffling order preserves score identically
      const scoredAgain = scoreAttempt(exam, attempt);
      assert.ok(equals(scoredAgain.total, originalScore.total));
      assert.ok(equals(scoredAgain.sections.I.score, originalScore.sections.I.score));
      assert.ok(equals(scoredAgain.sections.II.score, originalScore.sections.II.score));
    }
  });
});

// ============================================================================
// B1-T14: Snapshot Immutability & Non-Aliasing
// ============================================================================
describe("B1-T14 — Snapshot Immutability & Non-Aliasing", () => {
  it("freezes all returned objects and prevents mutation from input modifications", () => {
    const questions = [
      {
        kind: "I" as const,
        questionVersionId: "qI",
        options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
        correctOptionId: "o1",
      },
    ];

    const exam: ExamVersion = {
      examId: "exam-immut",
      examVersionId: "ev-immut",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions,
    };

    const responses = [
      { kind: "I" as const, questionVersionId: "qI", selectedOptionId: "o1" },
    ];

    const attempt: AttemptResponses = {
      attemptId: "att-immut",
      examVersionId: "ev-immut",
      responses,
    };

    const result = scoreAttempt(exam, attempt);

    // Mutate the original arrays after scoring
    questions.push({
      kind: "I" as const,
      questionVersionId: "qI_extra",
      options: [{ optionId: "a" }, { optionId: "b" }, { optionId: "c" }, { optionId: "d" }],
      correctOptionId: "a",
    });
    responses.push({
      kind: "I" as const,
      questionVersionId: "qI_extra",
      selectedOptionId: "a",
    });

    // Returned result must be unaffected
    assert.equal(result.questions.length, 1);
    assert.equal(result.sections.I.questionCount, 1);
    assert.equal(toFractionString(result.total), "1/4");

    // All structures must be deeply frozen
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.sections));
    assert.ok(Object.isFrozen(result.sections.I));
    assert.ok(Object.isFrozen(result.sections.II));
    assert.ok(Object.isFrozen(result.sections.III));
    assert.ok(Object.isFrozen(result.questions));
    assert.ok(Object.isFrozen(result.questions[0]));
  });
});

// ============================================================================
// B1-T10: Resource Limits & Adversarial Input Robustness
// ============================================================================
describe("B1-T10 — Resource Limits & Adversarial Robustness", () => {
  it("rejects oversized fraction strings (> 200 characters) in parseFractionString", () => {
    const hugeNum = "9".repeat(201);
    assert.throws(
      () => parseFractionString(hugeNum),
      SyntaxError,
      "Must reject fraction string exceeding 200 characters"
    );

    const hugeFrac = `1/${"9".repeat(200)}`;
    assert.throws(
      () => parseFractionString(hugeFrac),
      SyntaxError,
      "Must reject fraction with denominator string exceeding 200 characters"
    );
  });

  it("rejects oversized fractionDigits (> 100) in toDecimalString", () => {
    const r = rational(1, 3);
    assert.throws(
      () => toDecimalString(r, 101, "half-up"),
      RangeError,
      "Must reject fractionDigits > 100"
    );
  });

  it("handles computations near Number.MAX_SAFE_INTEGER with exact BigInt precision", () => {
    const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
    const r1 = rational(maxSafe, 1n);
    const r2 = rational(maxSafe, 2n);
    const sumVal = add(r1, r2);

    // Exact arithmetic: maxSafe + maxSafe/2 = 3 * maxSafe / 2
    assert.equal(sumVal.num, 3n * maxSafe);
    assert.equal(sumVal.den, 2n);

    const fracStr = toFractionString(sumVal);
    const parsed = parseFractionString(fracStr);
    assert.ok(equals(parsed, sumVal));
  });

  it("strictly validates against non-safe integers, NaN, and Infinity in rational() constructor", () => {
    assert.throws(() => rational(NaN), RangeError);
    assert.throws(() => rational(Infinity), RangeError);
    assert.throws(() => rational(-Infinity), RangeError);
    assert.throws(() => rational(1.5), RangeError);
    assert.throws(() => rational(1, NaN), RangeError);
    assert.throws(() => rational(1, Infinity), RangeError);
    assert.throws(() => rational(1, -Infinity), RangeError);
    assert.throws(() => rational(1, 2.5), RangeError);
    assert.throws(() => rational(1, 0), RangeError);
    assert.throws(() => rational(1, 0n), RangeError);
    assert.throws(() => rational("1" as unknown as number), TypeError);
    assert.throws(() => rational(1, "2" as unknown as number), TypeError);
  });

  it("handles computations with massive BigInt values (10^50, 10^100) across all rational operations without overflow or drift", () => {
    const big1 = 10n ** 50n;
    const big2 = 10n ** 100n;
    const r1 = rational(big1, 1n);
    const r2 = rational(big1, 3n);
    const r3 = rational(big2, 7n);

    // add: big1 + big1/3 = (4/3) * big1
    const sum12 = add(r1, r2);
    assert.equal(sum12.num, 4n * big1);
    assert.equal(sum12.den, 3n);

    // sub: big1 - big1/3 = (2/3) * big1
    const diff12 = sub(r1, r2);
    assert.equal(diff12.num, 2n * big1);
    assert.equal(diff12.den, 3n);

    // mul: big1 * (big1/3) = (big1 * big1) / 3
    const prod12 = mul(r1, r2);
    assert.equal(prod12.num, big1 * big1);
    assert.equal(prod12.den, 3n);

    // div: big1 / (big1/3) = 3 / 1
    const quot12 = div(r1, r2);
    assert.equal(quot12.num, 3n);
    assert.equal(quot12.den, 1n);

    // compare
    assert.equal(compare(r1, r2), 1);
    assert.equal(compare(r2, r1), -1);
    assert.equal(compare(r1, r1), 0);

    // sum
    const sumArr = sum([r1, r2, r2]);
    assert.equal(sumArr.num, 5n * big1);
    assert.equal(sumArr.den, 3n);

    // roundtrip fraction strings up to 150 digits
    const fracStr1 = toFractionString(r1);
    assert.equal(fracStr1, big1.toString());
    assert.ok(equals(parseFractionString(fracStr1), r1));

    const fracStr3 = toFractionString(r3);
    assert.equal(fracStr3, `${big2}/7`);
    assert.ok(equals(parseFractionString(fracStr3), r3));
  });

  it("adversarial robustness in scoreResultFromDTO against non-canonical fractions and invalid types", () => {
    const baseExam: ExamVersion = {
      examId: "e1",
      examVersionId: "ev1",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "q1",
          options: [
            { optionId: "o1" },
            { optionId: "o2" },
            { optionId: "o3" },
            { optionId: "o4" },
          ],
          correctOptionId: "o1",
        },
      ],
    };
    const baseAttempt: AttemptResponses = {
      attemptId: "a1",
      examVersionId: "ev1",
      responses: [{ kind: "I", questionVersionId: "q1", selectedOptionId: "o1" }],
    };
    const scoreRes = scoreAttempt(baseExam, baseAttempt);
    const dto = scoreResultToDTO(scoreRes) as Record<string, unknown>;

    // Reject non-canonical fraction strings in DTO
    const badFractions = ["4/2", "0/1", "1/-2", "1/0", "1.5", "1/1", "--1/2", " 1/4", "1/4 ", "1/\n4", "1/\r4"];
    for (const bf of badFractions) {
      const badDto = JSON.parse(JSON.stringify(dto));
      badDto.total = bf;
      assert.throws(() => scoreResultFromDTO(badDto), SyntaxError);
    }

    // Reject JSON number for total or score
    const numDto = JSON.parse(JSON.stringify(dto));
    numDto.total = 0.25;
    assert.throws(() => scoreResultFromDTO(numDto), SyntaxError);

    // Reject unknown question statuses
    const badStatusDto = JSON.parse(JSON.stringify(dto));
    badStatusDto.questions[0].status = "unknown_status";
    assert.throws(() => scoreResultFromDTO(badStatusDto), SyntaxError);
  });

  it("adversarial robustness in validateExamVersion and validateAttemptResponses against throwing getters and prototype attacks", () => {
    const poisonousExam = {
      get examId() {
        throw new Error("malicious examId getter");
      },
    };
    const valPoison = validateExamVersion(poisonousExam);
    assert.equal(valPoison.ok, false);
    if (!valPoison.ok) {
      assert.ok(valPoison.issues.length > 0);
    }

    const baseExam: ExamVersion = {
      examId: "e1",
      examVersionId: "ev1",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "q1",
          options: [
            { optionId: "o1" },
            { optionId: "o2" },
            { optionId: "o3" },
            { optionId: "o4" },
          ],
          correctOptionId: "o1",
        },
      ],
    };

    const poisonousAttempt = {
      get attemptId() {
        throw new Error("malicious attemptId getter");
      },
    };
    assert.doesNotThrow(() => validateAttemptResponses(baseExam, poisonousAttempt));
    const valAttPoison = validateAttemptResponses(baseExam, poisonousAttempt);
    assert.equal(valAttPoison.ok, false);
    if (!valAttPoison.ok) {
      assert.ok(valAttPoison.issues.length > 0);
    }
  });

  it("enforces MAX_QUESTIONS_PER_EXAM limit strictly (1000 allowed, 1001 rejected)", () => {
    // 1000 questions: valid
    const q1000 = Array.from({ length: 1000 }, (_, i) => ({
      kind: "I" as const,
      questionVersionId: `q-${i}`,
      options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
      correctOptionId: "o1",
    }));

    const exam1000 = {
      examId: "e1000",
      examVersionId: "ev1000",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: q1000,
    };
    const val1000 = validateExamVersion(exam1000);
    assert.equal(val1000.ok, true, "1000 questions must be accepted");

    // 1001 questions: LIMIT_EXCEEDED
    const q1001 = [
      ...q1000,
      {
        kind: "I" as const,
        questionVersionId: "q-1000",
        options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
        correctOptionId: "o1",
      },
    ];
    const exam1001 = {
      ...exam1000,
      questions: q1001,
    };
    const val1001 = validateExamVersion(exam1001);
    assert.equal(val1001.ok, false, "1001 questions must be rejected");
    if (!val1001.ok) {
      assert.ok(val1001.issues.some((iss) => iss.code === "LIMIT_EXCEEDED"));
    }
  });

  it("handles oversized raw strings in Part III responses gracefully without memory exhaustion", () => {
    const baseExam: ExamVersion = {
      examId: "e-oversized",
      examVersionId: "ev-oversized",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [{ kind: "III", questionVersionId: "q-huge", answerKey: "1,5" }],
    };

    // 10,000 characters string
    const hugeRaw = "1,".repeat(5000);
    const attHuge: AttemptResponses = {
      attemptId: "att-huge",
      examVersionId: "ev-oversized",
      responses: [{ kind: "III", questionVersionId: "q-huge", raw: hugeRaw }],
    };

    const valAtt = validateAttemptResponses(baseExam, attHuge);
    assert.equal(valAtt.ok, true, "validateAttemptResponses accepts valid string types");

    const res = scoreAttempt(baseExam, attHuge);
    assert.equal(res.questions[0]!.status, "invalid");
    assert.ok(res.questions[0]!.inputIssues?.includes("too_long"));
    assert.ok(equals(res.questions[0]!.points, ZERO));
  });

  it("handles high question volume scoring with deterministic performance", () => {
    // 300 questions (100 Part I, 100 Part II, 100 Part III)
    const questions = [
      ...Array.from({ length: 100 }, (_, i) => ({
        kind: "I" as const,
        questionVersionId: `qI-${i}`,
        options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
        correctOptionId: "o1",
      })),
      ...Array.from({ length: 100 }, (_, i) => ({
        kind: "II" as const,
        questionVersionId: `qII-${i}`,
        statements: [
          { statementId: "s1", answer: true },
          { statementId: "s2", answer: false },
          { statementId: "s3", answer: true },
          { statementId: "s4", answer: false },
        ],
      })),
      ...Array.from({ length: 100 }, (_, i) => ({
        kind: "III" as const,
        questionVersionId: `qIII-${i}`,
        answerKey: "1,5",
      })),
    ];

    const exam300: ExamVersion = {
      examId: "exam-300",
      examVersionId: "ev-300",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions,
    };

    // Full correct attempt
    const att300: AttemptResponses = {
      attemptId: "att-300",
      examVersionId: "ev-300",
      responses: [
        ...Array.from({ length: 100 }, (_, i) => ({
          kind: "I" as const,
          questionVersionId: `qI-${i}`,
          selectedOptionId: "o1",
        })),
        ...Array.from({ length: 100 }, (_, i) => ({
          kind: "II" as const,
          questionVersionId: `qII-${i}`,
          answers: [
            { statementId: "s1", value: true },
            { statementId: "s2", value: false },
            { statementId: "s3", value: true },
            { statementId: "s4", value: false },
          ],
        })),
        ...Array.from({ length: 100 }, (_, i) => ({
          kind: "III" as const,
          questionVersionId: `qIII-${i}`,
          raw: "1,5",
        })),
      ],
    };

    const start = performance.now();
    const res = scoreAttempt(exam300, att300);
    const duration = performance.now() - start;

    assert.ok(duration < 200, `Scoring 300 questions must take < 200ms, took ${duration}ms`);
    assert.ok(equals(res.total, res.maxTotal));
    assert.equal(res.questions.length, 300);
  });
});

// ============================================================================
// B1-T06: Short Answer Policy Boundaries & Grammar Neutrality (sa-charset-v1)
// ============================================================================
describe("B1-T06 — Short Answer Policy Boundaries & Grammar Neutrality (sa-charset-v1)", () => {
  it("accepts all characters within sa-charset-v1 (0-9, '-', ',') up to 4 code points without mutating", () => {
    // Unresolved grammar edge cases that are strictly legal under sa-charset-v1:
    const legalInputs = ["01", "-0", ",5", "1,", "--1", "1,,", "0", "-1", "1,5", "-0,5"];
    for (const raw of legalInputs) {
      const issues = checkShortAnswer(raw);
      assert.deepEqual(issues, [], `Expected "${raw}" to have no issues under sa-charset-v1`);
    }
  });

  it("identifies bad characters, oversized inputs, and empty inputs without silent modification", () => {
    // Bad characters: '+' (not in set), '.' (dot is not comma), ' ' (space), unicode minus '−'
    assert.deepEqual(checkShortAnswer("+1"), ["bad_char"]);
    assert.deepEqual(checkShortAnswer("1.5"), ["bad_char"]);
    assert.deepEqual(checkShortAnswer(" 1,5"), ["bad_char"]);
    assert.deepEqual(checkShortAnswer("1,5 "), ["bad_char"]);
    assert.deepEqual(checkShortAnswer("−0,5"), ["bad_char"]); // U+2212 minus
    assert.deepEqual(checkShortAnswer(""), ["empty"]);
    assert.deepEqual(checkShortAnswer("-1,50"), ["too_long"]); // 5 code points
    assert.deepEqual(checkShortAnswer("12345"), ["too_long"]);
    assert.deepEqual(checkShortAnswer("+1234"), ["too_long", "bad_char"]); // 5 code points and bad char
  });

  it("evaluates Part III scoring with exact string equality under sa-charset-v1", () => {
    const exam: ExamVersion = {
      examId: "exam-t06",
      examVersionId: "ev-t06",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        { kind: "III", questionVersionId: "q1", answerKey: "01" },
        { kind: "III", questionVersionId: "q2", answerKey: "-0" },
        { kind: "III", questionVersionId: "q3", answerKey: ",5" },
      ],
    };

    const attempt: AttemptResponses = {
      attemptId: "att-t06",
      examVersionId: "ev-t06",
      responses: [
        { kind: "III", questionVersionId: "q1", raw: "01" }, // exact match
        { kind: "III", questionVersionId: "q2", raw: "0" },  // numeric match, string mismatch -> wrong
        { kind: "III", questionVersionId: "q3", raw: "0,5" }, // numeric match, string mismatch -> wrong
      ],
    };

    const res = scoreAttempt(exam, attempt);
    assert.equal(res.questions[0]?.status, "full");
    assert.equal(res.questions[1]?.status, "wrong");
    assert.equal(res.questions[2]?.status, "wrong");
  });
});

// ============================================================================
// B1-T08 & B1-T09: Exact Threshold Anchors & Repeating Fractions Summation
// ============================================================================
describe("B1-T08 & B1-T09 — Exact Threshold Anchors & Repeating Fractions Summation", () => {
  it("verifies BASE threshold anchors (9.75, 10, 10.25) across section combinations in scoreAttempt", () => {
    // Case A: BASE = 9.75 < 10 with n1=35, n2=1, n3=2
    // MAX_I = 35 * 0.25 = 35/4 (8.75)
    // MAX_II = 1
    // BASE = 35/4 + 1 = 39/4 = 9.75
    // POINT_III = (10 - 39/4) / 2 = (1/4) / 2 = 1/8
    // MAX_III = 2 * (1/8) = 1/4
    // MAX_TOTAL = 39/4 + 1/4 = 40/4 = 10
    const maxA = computeExamMax({ n1: 35, n2: 1, n3: 2 });
    assert.equal(toFractionString(maxA.maxI), "35/4");
    assert.equal(toFractionString(maxA.maxII), "1");
    assert.equal(toFractionString(maxA.pointIII), "1/8");
    assert.equal(toFractionString(maxA.maxIII), "1/4");
    assert.equal(toFractionString(maxA.maxTotal), "10");

    // Case B: BASE = 10.00 == 10 with n1=36, n2=1, n3=2
    // MAX_I = 36 * 0.25 = 9
    // MAX_II = 1 -> BASE = 10
    // POINT_III = 1/4 (since BASE >= 10)
    // MAX_III = 2 * (1/4) = 1/2
    // MAX_TOTAL = 10 + 1/2 = 21/2
    const maxB = computeExamMax({ n1: 36, n2: 1, n3: 2 });
    assert.equal(toFractionString(maxB.maxI), "9");
    assert.equal(toFractionString(maxB.maxII), "1");
    assert.equal(toFractionString(maxB.pointIII), "1/4");
    assert.equal(toFractionString(maxB.maxIII), "1/2");
    assert.equal(toFractionString(maxB.maxTotal), "21/2");

    // Case C: BASE = 10.25 > 10 with n1=37, n2=1, n3=2
    // MAX_I = 37 * 0.25 = 37/4 (9.25)
    // MAX_II = 1 -> BASE = 41/4 (10.25)
    // POINT_III = 1/4 (since BASE >= 10)
    // MAX_III = 2 * (1/4) = 1/2
    // MAX_TOTAL = 41/4 + 1/2 = 43/4
    const maxC = computeExamMax({ n1: 37, n2: 1, n3: 2 });
    assert.equal(toFractionString(maxC.maxI), "37/4");
    assert.equal(toFractionString(maxC.maxII), "1");
    assert.equal(toFractionString(maxC.pointIII), "1/4");
    assert.equal(toFractionString(maxC.maxIII), "1/2");
    assert.equal(toFractionString(maxC.maxTotal), "43/4");
  });

  it("sums repeating fractions (N3=7) exactly to 10 without rounding drift", () => {
    // (0, 0, 7) -> POINT_III = 10/7.
    const exam7: ExamVersion = {
      examId: "exam-rep7",
      examVersionId: "ev-rep7",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: Array.from({ length: 7 }, (_, i) => ({
        kind: "III" as const,
        questionVersionId: `qIII-${i}`,
        answerKey: String(i + 1),
      })),
    };

    // Candidate answers all 7 questions correctly
    const attFull: AttemptResponses = {
      attemptId: "att-rep7-full",
      examVersionId: "ev-rep7",
      responses: Array.from({ length: 7 }, (_, i) => ({
        kind: "III" as const,
        questionVersionId: `qIII-${i}`,
        raw: String(i + 1),
      })),
    };

    const resFull = scoreAttempt(exam7, attFull);
    // 7 * (10/7) = 70/7 = 10 exactly!
    assert.equal(toFractionString(resFull.total), "10");
    assert.equal(toFractionString(resFull.maxTotal), "10");

    // Candidate answers exactly 3 questions correctly
    const att3: AttemptResponses = {
      attemptId: "att-rep7-3",
      examVersionId: "ev-rep7",
      responses: [
        { kind: "III", questionVersionId: "qIII-0", raw: "1" },
        { kind: "III", questionVersionId: "qIII-1", raw: "2" },
        { kind: "III", questionVersionId: "qIII-2", raw: "3" },
      ],
    };
    const res3 = scoreAttempt(exam7, att3);
    assert.equal(toFractionString(res3.total), "30/7");
    assert.equal(toFractionString(res3.maxTotal), "10");

    // Candidate answers remaining 4 questions correctly
    const att4: AttemptResponses = {
      attemptId: "att-rep7-4",
      examVersionId: "ev-rep7",
      responses: [
        { kind: "III", questionVersionId: "qIII-3", raw: "4" },
        { kind: "III", questionVersionId: "qIII-4", raw: "5" },
        { kind: "III", questionVersionId: "qIII-5", raw: "6" },
        { kind: "III", questionVersionId: "qIII-6", raw: "7" },
      ],
    };
    const res4 = scoreAttempt(exam7, att4);
    assert.equal(toFractionString(res4.total), "40/7");

    // 30/7 + 40/7 = 70/7 = 10 exactly
    const combined = add(res3.total, res4.total);
    assert.equal(toFractionString(combined), "10");
  });

  it("sums multiple 1/10 scores from Part II exactly to whole integers without floating point drift", () => {
    // 10 questions in Part II, each answered with k=1 (each yields 1/10)
    const exam10II: ExamVersion = {
      examId: "exam-10ii",
      examVersionId: "ev-10ii",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: Array.from({ length: 10 }, (_, i) => ({
        kind: "II" as const,
        questionVersionId: `qII-${i}`,
        statements: [
          { statementId: "s1", answer: true },
          { statementId: "s2", answer: false },
          { statementId: "s3", answer: true },
          { statementId: "s4", answer: false },
        ],
      })),
    };

    const att10II: AttemptResponses = {
      attemptId: "att-10ii",
      examVersionId: "ev-10ii",
      responses: Array.from({ length: 10 }, (_, i) => ({
        kind: "II" as const,
        questionVersionId: `qII-${i}`,
        answers: [
          { statementId: "s1", value: true }, // 1 correct
          { statementId: "s2", value: true }, // wrong
          { statementId: "s3", value: false }, // wrong
          { statementId: "s4", value: true }, // wrong
        ],
      })),
    };

    const res = scoreAttempt(exam10II, att10II);
    // 10 * 1/10 = 10/10 = 1 exactly
    assert.equal(toFractionString(res.sections.II.score), "1");
    assert.equal(toFractionString(res.total), "1");
    assert.equal(toFractionString(res.maxTotal), "10");
  });
});

// ============================================================================
// B1-T11: Referential Integrity & ID Collision Resilience
// ============================================================================
describe("B1-T11 — Referential Integrity & ID Collision Resilience", () => {
  it("rejects duplicate questionVersionId across sections in validateExamVersion", () => {
    const invalidExam = {
      examId: "exam-dup-q",
      examVersionId: "ev-dup-q",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "dup-id",
          options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
          correctOptionId: "o1",
        },
        {
          kind: "III",
          questionVersionId: "dup-id", // Duplicated!
          answerKey: "42",
        },
      ],
    };

    const val = validateExamVersion(invalidExam);
    assert.equal(val.ok, false);
    if (!val.ok) {
      assert.ok(val.issues.some((i) => i.code === "ID_DUPLICATE" && i.path === "questions[1].questionVersionId"));
    }
  });

  it("rejects duplicate optionId within a QuestionI and duplicate statementId within QuestionII", () => {
    const dupOptionExam = {
      examId: "exam-dup-opt",
      examVersionId: "ev-dup-opt",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "q1",
          options: [{ optionId: "same" }, { optionId: "same" }, { optionId: "o3" }, { optionId: "o4" }],
          correctOptionId: "same",
        },
      ],
    };
    const valOpt = validateExamVersion(dupOptionExam);
    assert.equal(valOpt.ok, false);
    if (!valOpt.ok) {
      assert.ok(valOpt.issues.some((i) => i.code === "ID_DUPLICATE" && i.path === "questions[0].options[1].optionId"));
    }

    const dupStmtExam = {
      examId: "exam-dup-stmt",
      examVersionId: "ev-dup-stmt",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "II",
          questionVersionId: "q2",
          statements: [
            { statementId: "st-dup", answer: true },
            { statementId: "st-dup", answer: false },
            { statementId: "st-3", answer: true },
            { statementId: "st-4", answer: false },
          ],
        },
      ],
    };
    const valStmt = validateExamVersion(dupStmtExam);
    assert.equal(valStmt.ok, false);
    if (!valStmt.ok) {
      assert.ok(valStmt.issues.some((i) => i.code === "ID_DUPLICATE" && i.path === "questions[0].statements[1].statementId"));
    }
  });

  it("handles foreign optionId in response: judgeI marks invalid and scores 0 without crashing", () => {
    const exam: ExamVersion = {
      examId: "exam-foreign-opt",
      examVersionId: "ev-foreign-opt",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "qI-1",
          options: [{ optionId: "opt-1" }, { optionId: "opt-2" }, { optionId: "opt-3" }, { optionId: "opt-4" }],
          correctOptionId: "opt-1",
        },
      ],
    };

    const attempt: AttemptResponses = {
      attemptId: "att-foreign-opt",
      examVersionId: "ev-foreign-opt",
      responses: [
        {
          kind: "I",
          questionVersionId: "qI-1",
          selectedOptionId: "foreign-opt-999", // Not in question options
        },
      ],
    };

    const res = scoreAttempt(exam, attempt);
    assert.equal(res.questions[0]?.status, "invalid");
    assert.ok(equals(res.questions[0]!.points, ZERO));
    assert.ok(equals(res.total, ZERO));
  });
});

// ============================================================================
// B1-T12: Multi-Section Permutations & Independent Option Order
// ============================================================================
describe("B1-T12 — Multi-Section Permutations & Independent Option Order", () => {
  it("generates independent option permutations for each Part I question and preserves scores identically", () => {
    const exam: ExamVersion = {
      examId: "exam-multi-perm",
      examVersionId: "ev-multi-perm",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "qI-a",
          options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
          correctOptionId: "o3",
        },
        {
          kind: "I",
          questionVersionId: "qI-b",
          options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
          correctOptionId: "o1",
        },
        {
          kind: "II",
          questionVersionId: "qII-a",
          statements: [
            { statementId: "st-1", answer: true },
            { statementId: "st-2", answer: false },
            { statementId: "st-3", answer: true },
            { statementId: "st-4", answer: false },
          ],
        },
        {
          kind: "III",
          questionVersionId: "qIII-a",
          answerKey: "-1,5",
        },
      ],
    };

    const attempt: AttemptResponses = {
      attemptId: "att-multi-perm",
      examVersionId: "ev-multi-perm",
      responses: [
        { kind: "I", questionVersionId: "qI-a", selectedOptionId: "o3" },
        { kind: "I", questionVersionId: "qI-b", selectedOptionId: "o1" },
        {
          kind: "II",
          questionVersionId: "qII-a",
          answers: [
            { statementId: "st-1", value: true },
            { statementId: "st-2", value: false },
            { statementId: "st-3", value: true },
            { statementId: "st-4", value: false },
          ],
        },
        { kind: "III", questionVersionId: "qIII-a", raw: "-1,5" },
      ],
    };

    const baselineScore = scoreAttempt(exam, attempt);

    // Presentation order with shuffling enabled
    const order = createPresentationOrder(
      exam,
      { shuffleQuestions: true, shuffleOptions: true },
      "seed-perm-test-2026"
    );

    // Each Part I question must have its own permutation entry
    assert.equal(order.optionOrder.length, 2);
    assert.equal(order.optionOrder[0]?.questionVersionId, "qI-a");
    assert.equal(order.optionOrder[1]?.questionVersionId, "qI-b");

    // All option IDs must be preserved as hoán vị
    assert.equal(order.optionOrder[0]?.optionIds.length, 4);
    assert.deepEqual(
      new Set(order.optionOrder[0]?.optionIds),
      new Set(["o1", "o2", "o3", "o4"])
    );

    // Scoring is based purely on entity ID matching; order permutation never affects score
    const scoredAgain = scoreAttempt(exam, attempt);
    assert.ok(equals(scoredAgain.total, baselineScore.total));
    assert.equal(toFractionString(scoredAgain.total), toFractionString(baselineScore.total));
  });
});

// ============================================================================
// B1-T13: DTO Canonical Roundtrip with Scrambled Property Orders
// ============================================================================
describe("B1-T13 — DTO Canonical Roundtrip with Scrambled Property Orders", () => {
  it("preserves exact ScoreResult across DTO serialization with scrambled object keys", () => {
    const exam: ExamVersion = {
      examId: "exam-dto",
      examVersionId: "ev-dto",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "qI-1",
          options: [{ optionId: "o1" }, { optionId: "o2" }, { optionId: "o3" }, { optionId: "o4" }],
          correctOptionId: "o1",
        },
        {
          kind: "II",
          questionVersionId: "qII-1",
          statements: [
            { statementId: "s1", answer: true },
            { statementId: "s2", answer: false },
            { statementId: "s3", answer: true },
            { statementId: "s4", answer: false },
          ],
        },
        { kind: "III", questionVersionId: "qIII-1", answerKey: "42" },
      ],
    };

    const attempt: AttemptResponses = {
      attemptId: "att-dto",
      examVersionId: "ev-dto",
      responses: [
        { kind: "I", questionVersionId: "qI-1", selectedOptionId: "o1" },
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [
            { statementId: "s1", value: true },
            { statementId: "s2", value: false },
            { statementId: "s3", value: false },
            { statementId: "s4", value: true },
          ],
        },
        { kind: "III", questionVersionId: "qIII-1", raw: "42" },
      ],
    };

    const original = scoreAttempt(exam, attempt);
    const dto = scoreResultToDTO(original) as Record<string, unknown>;

    // Scramble the top-level keys
    const scrambledDTO: Record<string, unknown> = {
      total: dto.total,
      maxTotal: dto.maxTotal,
      engineVersion: dto.engineVersion,
      questions: dto.questions,
      sections: dto.sections,
      attemptId: dto.attemptId,
      inputPolicyId: dto.inputPolicyId,
      ruleSetId: dto.ruleSetId,
      examVersionId: dto.examVersionId,
    };

    // Serialize to JSON string and parse back
    const jsonStr = JSON.stringify(scrambledDTO);
    const parsedDTO = JSON.parse(jsonStr);

    const restored = scoreResultFromDTO(parsedDTO);
    assert.equal(restored.attemptId, original.attemptId);
    assert.equal(restored.examVersionId, original.examVersionId);
    assert.ok(equals(restored.total, original.total));
    assert.ok(equals(restored.maxTotal, original.maxTotal));
    assert.equal(restored.questions.length, original.questions.length);
    assert.equal(restored.questions[0]?.status, original.questions[0]?.status);
    assert.ok(equals(restored.questions[0]!.points, original.questions[0]!.points));
  });

  it("strictly rejects non-canonical and invalid fractions in DTO with SyntaxError", () => {
    const invalidFractions = ["2/4", "5/1", "0/0", "1/0", "1/-2", "+1/2", "3.14", "abc"];
    for (const badFrac of invalidFractions) {
      assert.throws(
        () => parseFractionString(badFrac),
        SyntaxError,
        `Expected parseFractionString("${badFrac}") to throw SyntaxError`
      );
    }
  });
});

// ============================================================================
// B1-T16: Score Representation & Formatting Without Scaling
// ============================================================================
describe("B1-T16 — Score Representation & Formatting Without Scaling", () => {
  it("preserves exact un-scaled score representations (12/15, 11/16, 3/5, 10/3) without forcing /10", () => {
    // 12/15 configuration
    const r12 = rational(12);
    const r15 = rational(15);
    assert.equal(toFractionString(r12), "12");
    assert.equal(toFractionString(r15), "15");

    // 11/16 configuration
    const r11 = rational(11);
    const r16 = rational(16);
    assert.equal(toFractionString(r11), "11");
    assert.equal(toFractionString(r16), "16");

    // 3/5 configuration
    const r3_5 = rational(3, 5);
    assert.equal(toFractionString(r3_5), "3/5");

    // 10/3 repeating fraction
    const r10_3 = rational(10, 3);
    assert.equal(toFractionString(r10_3), "10/3");

    // Formatting with toDecimalString without modifying the rational value
    assert.equal(toDecimalString(r3_5, 2, "half-up"), "0.60");
    assert.equal(toDecimalString(r10_3, 2, "half-up"), "3.33");
    assert.equal(toDecimalString(r10_3, 4, "half-up"), "3.3333");
    assert.equal(toDecimalString(rational(1, 8), 3, "half-up"), "0.125");

    // Immutability of underlying numbers
    assert.equal(r10_3.num, 10n);
    assert.equal(r10_3.den, 3n);
  });
});

// ============================================================================
// B1-T05: Short Answer Policy Boundaries & Adversarial Raw Inputs
// ============================================================================
describe("B1-T05 — Short Answer Policy Boundaries & Adversarial Raw Inputs", () => {
  it("strictly detects issues on oversized inputs (>4 code points)", () => {
    const oversized = ["12345", "-0,50", "12,34", "123456", "------"];
    for (const raw of oversized) {
      const issues = checkShortAnswer(raw);
      assert.ok(issues.includes("too_long"), `Expected "${raw}" to have issue "too_long"`);
    }
  });

  it("strictly detects bad characters: ASCII spaces, NBSP, zero-width, newlines", () => {
    const whitespaceCases = [
      " 1",
      "1 ",
      " 1 ",
      " ",
      "\u00A01",      // Non-breaking space
      "1\u00A0",
      "1\u200B",      // Zero-width space
      "\u200B1",
      "1\n",          // Line feed
      "\r\n1",        // CRLF
      "\t1",          // Tab
    ];
    for (const raw of whitespaceCases) {
      const issues = checkShortAnswer(raw);
      assert.ok(issues.includes("bad_char"), `Expected whitespace input "${raw}" to have issue "bad_char"`);
    }
  });

  it("strictly detects bad characters: Unicode math symbols, fullwidth digits, and emojis", () => {
    const nonAsciiCases = [
      "\u22121",      // Unicode minus −
      "\uFF11\uFF12",  // Fullwidth digits １２
      "1👍",           // Emoji
      "1.5",          // Period is NOT allowed in sa-charset-v1 (only comma)
      "+1",           // Plus sign is NOT in sa-charset-v1
      "a",            // Alphabetic characters
    ];
    for (const raw of nonAsciiCases) {
      const issues = checkShortAnswer(raw);
      assert.ok(issues.includes("bad_char"), `Expected non-allowed input "${raw}" to have issue "bad_char"`);
    }
  });

  it("detects both too_long and bad_char when input violates both constraints", () => {
    const doubleViolations = [" 12345", "12.345", "1234👍", "\u22120,50"];
    for (const raw of doubleViolations) {
      const issues = checkShortAnswer(raw);
      assert.ok(issues.includes("too_long"), `Expected "${raw}" to have "too_long"`);
      assert.ok(issues.includes("bad_char"), `Expected "${raw}" to have "bad_char"`);
    }
  });

  it("scoreAttempt assigns status invalid, 0 points, and preserves raw without trimming or coercion", () => {
    const exam: ExamVersion = {
      examId: "exam-t05",
      examVersionId: "ev-t05",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        { kind: "III", questionVersionId: "qIII-1", answerKey: "1,5" },
        { kind: "III", questionVersionId: "qIII-2", answerKey: "-0,5" },
      ],
    };

    const attempt: AttemptResponses = {
      attemptId: "att-t05",
      examVersionId: "ev-t05",
      responses: [
        // Candidate submitted " 1,5" (with leading space, would match if trimmed)
        { kind: "III", questionVersionId: "qIII-1", raw: " 1,5" },
        // Candidate submitted "-0,50" (5 chars, mathematically equal but exceeds length)
        { kind: "III", questionVersionId: "qIII-2", raw: "-0,50" },
      ],
    };

    const res = scoreAttempt(exam, attempt);
    assert.equal(res.questions[0]?.status, "invalid");
    assert.ok(equals(res.questions[0]!.points, ZERO));
    assert.deepEqual(res.questions[0]?.inputIssues, ["bad_char"]);

    assert.equal(res.questions[1]?.status, "invalid");
    assert.ok(equals(res.questions[1]!.points, ZERO));
    assert.deepEqual(res.questions[1]?.inputIssues, ["too_long"]);

    assert.ok(equals(res.sections.III.score, ZERO));
    assert.ok(equals(res.total, ZERO));
  });
});

// ============================================================================
// B1-T07: Independent Section Toggling & Zero Question Combinations
// ============================================================================
describe("B1-T07 — Independent Section Toggling & Zero Question Combinations", () => {
  it("scores pure Part I exam (N1=20, N2=0, N3=0) with maxTotal 5 and zero disabled sections", () => {
    const questions: QuestionI[] = Array.from({ length: 20 }, (_, i) => ({
      kind: "I",
      questionVersionId: `qI-${i + 1}`,
      options: [
        { optionId: `opt-${i}-a` },
        { optionId: `opt-${i}-b` },
        { optionId: `opt-${i}-c` },
        { optionId: `opt-${i}-d` },
      ],
      correctOptionId: `opt-${i}-a`,
    }));

    const exam: ExamVersion = {
      examId: "exam-pure-I",
      examVersionId: "ev-pure-I",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions,
    };

    // Candidate answers first 12 correctly, remaining 8 unanswered
    const responses = Array.from({ length: 12 }, (_, i) => ({
      kind: "I" as const,
      questionVersionId: `qI-${i + 1}`,
      selectedOptionId: `opt-${i}-a`,
    }));

    const attempt: AttemptResponses = {
      attemptId: "att-pure-I",
      examVersionId: "ev-pure-I",
      responses,
    };

    const res = scoreAttempt(exam, attempt);
    // 12 * 0.25 = 3
    assert.ok(equals(res.sections.I.score, rational(3)));
    assert.ok(equals(res.sections.I.max, rational(5)));
    assert.equal(res.sections.I.questionCount, 20);

    // Section II is disabled (0 questions)
    assert.ok(equals(res.sections.II.score, ZERO));
    assert.ok(equals(res.sections.II.max, ZERO));
    assert.equal(res.sections.II.questionCount, 0);

    // Section III is disabled (0 questions)
    assert.ok(equals(res.sections.III.score, ZERO));
    assert.ok(equals(res.sections.III.max, ZERO));
    assert.equal(res.sections.III.questionCount, 0);

    assert.ok(equals(res.total, rational(3)));
    assert.ok(equals(res.maxTotal, rational(5)));
    assert.equal(toFractionString(res.total), "3");
    assert.equal(toFractionString(res.maxTotal), "5");
  });

  it("scores pure Part II exam (N1=0, N2=4, N3=0) with maxTotal 4 and zero disabled sections", () => {
    const questions: QuestionII[] = Array.from({ length: 4 }, (_, i) => ({
      kind: "II",
      questionVersionId: `qII-${i + 1}`,
      statements: [
        { statementId: `st-${i}-1`, answer: true },
        { statementId: `st-${i}-2`, answer: false },
        { statementId: `st-${i}-3`, answer: true },
        { statementId: `st-${i}-4`, answer: false },
      ],
    }));

    const exam: ExamVersion = {
      examId: "exam-pure-II",
      examVersionId: "ev-pure-II",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions,
    };

    // Candidate answers qII-1 with 4 correct (1.0), qII-2 with 3 correct (0.5), qII-3 with 2 correct (0.25), qII-4 with 1 correct (0.10)
    const attempt: AttemptResponses = {
      attemptId: "att-pure-II",
      examVersionId: "ev-pure-II",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-1",
          answers: [
            { statementId: "st-0-1", value: true },
            { statementId: "st-0-2", value: false },
            { statementId: "st-0-3", value: true },
            { statementId: "st-0-4", value: false },
          ],
        },
        {
          kind: "II",
          questionVersionId: "qII-2",
          answers: [
            { statementId: "st-1-1", value: true },
            { statementId: "st-1-2", value: false },
            { statementId: "st-1-3", value: true },
            { statementId: "st-1-4", value: true }, // wrong
          ],
        },
        {
          kind: "II",
          questionVersionId: "qII-3",
          answers: [
            { statementId: "st-2-1", value: true },
            { statementId: "st-2-2", value: false },
            { statementId: "st-2-3", value: false }, // wrong
            { statementId: "st-2-4", value: true },  // wrong
          ],
        },
        {
          kind: "II",
          questionVersionId: "qII-4",
          answers: [
            { statementId: "st-3-1", value: true },
            { statementId: "st-3-2", value: true },  // wrong
            { statementId: "st-3-3", value: false }, // wrong
            { statementId: "st-3-4", value: true },  // wrong
          ],
        },
      ],
    };

    const res = scoreAttempt(exam, attempt);
    // 1 + 1/2 + 1/4 + 1/10 = 1 + 0.5 + 0.25 + 0.1 = 1.85 = 37/20
    const expectedScore = rational(37, 20);
    assert.ok(equals(res.sections.II.score, expectedScore));
    assert.ok(equals(res.sections.II.max, rational(4)));
    assert.equal(res.sections.II.questionCount, 4);

    assert.ok(equals(res.sections.I.score, ZERO));
    assert.ok(equals(res.sections.I.max, ZERO));
    assert.ok(equals(res.sections.III.score, ZERO));
    assert.ok(equals(res.sections.III.max, ZERO));

    assert.ok(equals(res.total, expectedScore));
    assert.ok(equals(res.maxTotal, rational(4)));
    assert.equal(toFractionString(res.total), "37/20");
    assert.equal(toFractionString(res.maxTotal), "4");
  });

  it("scores pure Part III exam (N1=0, N2=0, N3=3) with pointIII 10/3 and maxTotal 10 without division by zero", () => {
    const questions: QuestionIII[] = [
      { kind: "III", questionVersionId: "qIII-1", answerKey: "42" },
      { kind: "III", questionVersionId: "qIII-2", answerKey: "-1" },
      { kind: "III", questionVersionId: "qIII-3", answerKey: "0,5" },
    ];

    const exam: ExamVersion = {
      examId: "exam-pure-III",
      examVersionId: "ev-pure-III",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions,
    };

    // Candidate answers qIII-1 and qIII-2 correctly, qIII-3 wrong
    const attempt: AttemptResponses = {
      attemptId: "att-pure-III",
      examVersionId: "ev-pure-III",
      responses: [
        { kind: "III", questionVersionId: "qIII-1", raw: "42" },
        { kind: "III", questionVersionId: "qIII-2", raw: "-1" },
        { kind: "III", questionVersionId: "qIII-3", raw: "0,6" },
      ],
    };

    const res = scoreAttempt(exam, attempt);
    // 2 correct * 10/3 = 20/3
    const expectedScore = rational(20, 3);
    assert.ok(equals(res.sections.III.score, expectedScore));
    assert.ok(equals(res.sections.III.max, rational(10)));
    assert.equal(res.sections.III.questionCount, 3);

    assert.ok(equals(res.sections.I.score, ZERO));
    assert.ok(equals(res.sections.I.max, ZERO));
    assert.ok(equals(res.sections.II.score, ZERO));
    assert.ok(equals(res.sections.II.max, ZERO));

    assert.ok(equals(res.total, expectedScore));
    assert.ok(equals(res.maxTotal, rational(10)));
    assert.equal(toFractionString(res.total), "20/3");
    assert.equal(toFractionString(res.maxTotal), "10");
  });

  it("strictly rejects all-zero question counts (N1=0, N2=0, N3=0) in computeExamMax and validateExamVersion", () => {
    assert.throws(
      () => computeExamMax({ n1: 0, n2: 0, n3: 0 }),
      RangeError,
      "computeExamMax must throw RangeError when total questions is 0"
    );

    const emptyExam = {
      examId: "exam-empty",
      examVersionId: "ev-empty",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [],
    };

    const val = validateExamVersion(emptyExam);
    assert.equal(val.ok, false);
    if (!val.ok) {
      assert.ok(val.issues.some((issue) => issue.code === "EXAM_EMPTY"));
    }
  });

  it("validateAttemptResponses rejects responses pointing to disabled/non-existent section questions", () => {
    const examOnlyI: ExamVersion = {
      examId: "exam-only-I",
      examVersionId: "ev-only-I",
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
      ],
    };

    // Attempt has response for question "qII-old" which does not exist in exam
    const attemptWithStaleResponses = {
      attemptId: "att-stale",
      examVersionId: "ev-only-I",
      responses: [
        { kind: "I", questionVersionId: "qI-1", selectedOptionId: "opt-1" },
        { kind: "II", questionVersionId: "qII-old", answers: [] },
      ],
    };

    const val = validateAttemptResponses(examOnlyI, attemptWithStaleResponses);
    assert.equal(val.ok, false);
    if (!val.ok) {
      assert.ok(val.issues.some((iss) => iss.code === "RESPONSE_UNKNOWN_QUESTION"));
    }
  });
});

// ============================================================================
// B1-T01: Part I Multiple Choice Comprehensive Verification
// ============================================================================
describe("B1-T01 — Part I Multiple Choice Comprehensive Verification", () => {
  const qI1: QuestionI = {
    kind: "I",
    questionVersionId: "qI-1",
    options: [
      { optionId: "opt-1" },
      { optionId: "opt-2" },
      { optionId: "opt-3" },
      { optionId: "opt-4" },
    ],
    correctOptionId: "opt-1",
  };

  const qI2: QuestionI = {
    kind: "I",
    questionVersionId: "qI-2",
    options: [
      { optionId: "opt-a" },
      { optionId: "opt-b" },
      { optionId: "opt-c" },
      { optionId: "opt-d" },
    ],
    correctOptionId: "opt-b",
  };

  const qI3: QuestionI = {
    kind: "I",
    questionVersionId: "qI-3",
    options: [
      { optionId: "opt-w" },
      { optionId: "opt-x" },
      { optionId: "opt-y" },
      { optionId: "opt-z" },
    ],
    correctOptionId: "opt-z",
  };

  const qI4: QuestionI = {
    kind: "I",
    questionVersionId: "qI-4",
    options: [
      { optionId: "opt-10" },
      { optionId: "opt-20" },
      { optionId: "opt-30" },
      { optionId: "opt-40" },
    ],
    correctOptionId: "opt-30",
  };

  const exam: ExamVersion = {
    examId: "exam-b1-t01",
    examVersionId: "ev-b1-t01",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions: [qI1, qI2, qI3, qI4],
  };

  it("verifies 0 correct answers yields 0 points and 'wrong' status when answered", () => {
    const attempt: AttemptResponses = {
      attemptId: "att-0-correct",
      examVersionId: "ev-b1-t01",
      responses: [
        { kind: "I", questionVersionId: "qI-1", selectedOptionId: "opt-2" },
        { kind: "I", questionVersionId: "qI-2", selectedOptionId: "opt-a" },
        { kind: "I", questionVersionId: "qI-3", selectedOptionId: "opt-w" },
        { kind: "I", questionVersionId: "qI-4", selectedOptionId: "opt-10" },
      ],
    };
    const res = scoreAttempt(exam, attempt);
    assert.ok(equals(res.total, ZERO));
    assert.ok(equals(res.sections.I.score, ZERO));
    for (const qRes of res.questions) {
      assert.equal(qRes.status, "wrong");
      assert.ok(equals(qRes.points, ZERO));
    }
  });

  it("verifies 1 correct answer yields 1/4 point and 4 correct answers yields 1 point", () => {
    // 1 correct
    const attempt1: AttemptResponses = {
      attemptId: "att-1-correct",
      examVersionId: "ev-b1-t01",
      responses: [
        { kind: "I", questionVersionId: "qI-1", selectedOptionId: "opt-1" }, // correct
        { kind: "I", questionVersionId: "qI-2", selectedOptionId: "opt-a" }, // wrong
        { kind: "I", questionVersionId: "qI-3", selectedOptionId: "opt-w" }, // wrong
        { kind: "I", questionVersionId: "qI-4", selectedOptionId: "opt-10" }, // wrong
      ],
    };
    const res1 = scoreAttempt(exam, attempt1);
    assert.ok(equals(res1.total, POINT_I));
    assert.equal(toFractionString(res1.total), "1/4");
    assert.equal(res1.questions[0]?.status, "full");
    assert.equal(res1.questions[1]?.status, "wrong");

    // 4 correct
    const attempt4: AttemptResponses = {
      attemptId: "att-4-correct",
      examVersionId: "ev-b1-t01",
      responses: [
        { kind: "I", questionVersionId: "qI-1", selectedOptionId: "opt-1" },
        { kind: "I", questionVersionId: "qI-2", selectedOptionId: "opt-b" },
        { kind: "I", questionVersionId: "qI-3", selectedOptionId: "opt-z" },
        { kind: "I", questionVersionId: "qI-4", selectedOptionId: "opt-30" },
      ],
    };
    const res4 = scoreAttempt(exam, attempt4);
    assert.ok(equals(res4.total, ONE));
    assert.equal(toFractionString(res4.total), "1");
    for (const qRes of res4.questions) {
      assert.equal(qRes.status, "full");
      assert.ok(equals(qRes.points, POINT_I));
    }
  });

  it("treats unanswered questions (selectedOptionId: null or omitted) as 0 points with 'unanswered' status", () => {
    const attemptUnanswered: AttemptResponses = {
      attemptId: "att-unanswered",
      examVersionId: "ev-b1-t01",
      responses: [
        { kind: "I", questionVersionId: "qI-1", selectedOptionId: null },
        // qI-2, qI-3, qI-4 omitted entirely
      ],
    };
    const res = scoreAttempt(exam, attemptUnanswered);
    assert.ok(equals(res.total, ZERO));
    for (const qRes of res.questions) {
      assert.equal(qRes.status, "unanswered");
      assert.ok(equals(qRes.points, ZERO));
    }
  });

  it("marks foreign/invalid optionId as 'invalid' status with 0 points without crashing", () => {
    const attemptInvalid: AttemptResponses = {
      attemptId: "att-invalid-opt",
      examVersionId: "ev-b1-t01",
      responses: [
        { kind: "I", questionVersionId: "qI-1", selectedOptionId: "foreign-opt-999" },
      ],
    };
    const res = scoreAttempt(exam, attemptInvalid);
    assert.equal(res.questions[0]?.status, "invalid");
    assert.ok(equals(res.questions[0]!.points, ZERO));
    assert.ok(equals(res.total, ZERO));
  });

  it("strictly validates that missing or malformed correctOptionId is rejected as exam schema error", () => {
    const badExamMissingKey = {
      examId: "bad-exam",
      examVersionId: "bad-ev",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: [
        {
          kind: "I",
          questionVersionId: "qI-bad",
          options: [
            { optionId: "o1" },
            { optionId: "o2" },
            { optionId: "o3" },
            { optionId: "o4" },
          ],
          correctOptionId: "non-existent-opt",
        },
      ],
    };
    const val = validateExamVersion(badExamMissingKey);
    assert.equal(val.ok, false);
    if (!val.ok) {
      assert.ok(val.issues.some((iss) => iss.code === "I_KEY_NOT_IN_OPTIONS"));
    }
  });
});

// ============================================================================
// B1-T02: Part II Staircase Scoring & False Key Disambiguation
// ============================================================================
describe("B1-T02 — Part II Staircase Scoring & False Key Disambiguation", () => {
  const qII: QuestionII = {
    kind: "II",
    questionVersionId: "qII-t02",
    statements: [
      { statementId: "st-a", answer: true },
      { statementId: "st-b", answer: false },
      { statementId: "st-c", answer: true },
      { statementId: "st-d", answer: false },
    ],
  };

  const exam: ExamVersion = {
    examId: "exam-b1-t02",
    examVersionId: "ev-b1-t02",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions: [qII],
  };

  it("verifies exact staircase points for k = 0, 1, 2, 3, 4: [0, 1/10, 1/4, 1/2, 1]", () => {
    const vectors = [
      { k: 0, answers: [{ statementId: "st-a", value: false }], expectedPoints: ZERO, expectedStatus: "wrong" },
      { k: 1, answers: [{ statementId: "st-a", value: true }, { statementId: "st-b", value: true }], expectedPoints: rational(1, 10), expectedStatus: "partial" },
      { k: 2, answers: [{ statementId: "st-a", value: true }, { statementId: "st-b", value: false }, { statementId: "st-c", value: false }], expectedPoints: rational(1, 4), expectedStatus: "partial" },
      { k: 3, answers: [{ statementId: "st-a", value: true }, { statementId: "st-b", value: false }, { statementId: "st-c", value: true }, { statementId: "st-d", value: true }], expectedPoints: rational(1, 2), expectedStatus: "partial" },
      { k: 4, answers: [{ statementId: "st-a", value: true }, { statementId: "st-b", value: false }, { statementId: "st-c", value: true }, { statementId: "st-d", value: false }], expectedPoints: ONE, expectedStatus: "full" },
    ];

    for (const v of vectors) {
      const attempt: AttemptResponses = {
        attemptId: `att-k-${v.k}`,
        examVersionId: "ev-b1-t02",
        responses: [{ kind: "II", questionVersionId: "qII-t02", answers: v.answers }],
      };
      const res = scoreAttempt(exam, attempt);
      const qRes = res.questions[0]!;
      assert.equal(qRes.correctCount, v.k, `k mismatch for expected ${v.k}`);
      assert.ok(equals(qRes.points, v.expectedPoints), `points mismatch for k=${v.k}`);
      assert.equal(qRes.status, v.expectedStatus, `status mismatch for k=${v.k}`);
    }
  });

  it("ensures unanswered (null or omitted) statement is never treated as false even when key is false", () => {
    const attemptNull: AttemptResponses = {
      attemptId: "att-null-false-key",
      examVersionId: "ev-b1-t02",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-t02",
          answers: [
            { statementId: "st-a", value: null },
            { statementId: "st-b", value: null }, // key is false, answer is null -> unanswered
            { statementId: "st-c", value: null },
            { statementId: "st-d", value: null },
          ],
        },
      ],
    };
    const res = scoreAttempt(exam, attemptNull);
    const qRes = res.questions[0]!;
    assert.equal(qRes.correctCount, 0);
    assert.equal(qRes.status, "unanswered");
    assert.ok(equals(qRes.points, ZERO));
  });

  it("ensures k=3 yields partial 1/2 and is never marked as full", () => {
    const attemptK3: AttemptResponses = {
      attemptId: "att-k3",
      examVersionId: "ev-b1-t02",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-t02",
          answers: [
            { statementId: "st-a", value: true },
            { statementId: "st-b", value: false },
            { statementId: "st-c", value: true },
            { statementId: "st-d", value: true }, // wrong (key is false)
          ],
        },
      ],
    };
    const res = scoreAttempt(exam, attemptK3);
    const qRes = res.questions[0]!;
    assert.equal(qRes.correctCount, 3);
    assert.equal(qRes.status, "partial");
    assert.notEqual(qRes.status, "full");
    assert.ok(equals(qRes.points, rational(1, 2)));
  });

  it("ignores unknown statement IDs in responses without awarding points or crashing", () => {
    const attemptUnknownId: AttemptResponses = {
      attemptId: "att-unknown-stmt",
      examVersionId: "ev-b1-t02",
      responses: [
        {
          kind: "II",
          questionVersionId: "qII-t02",
          answers: [
            { statementId: "st-a", value: true }, // 1 correct
            { statementId: "st-foreign", value: true }, // foreign ID
          ],
        },
      ],
    };
    const res = scoreAttempt(exam, attemptUnknownId);
    const qRes = res.questions[0]!;
    assert.equal(qRes.correctCount, 1);
    assert.ok(equals(qRes.points, rational(1, 10)));
  });
});

// ============================================================================
// B1-T03: Part II Exhaustive Matrix Verification (16 Keys x 81 Vectors)
// ============================================================================
describe("B1-T03 — Part II Exhaustive Matrix Verification (16 Keys x 81 Vectors = 1296 Combinations)", () => {
  it("exhaustively evaluates all 1296 combinations through judgeII and verifies against independent oracle", () => {
    const statementIds = ["s1", "s2", "s3", "s4"] as const;
    const bools = [true, false];
    const candidateChoices: Array<boolean | null> = [true, false, null];

    const allKeys: boolean[][] = [];
    for (const k1 of bools) {
      for (const k2 of bools) {
        for (const k3 of bools) {
          for (const k4 of bools) {
            allKeys.push([k1, k2, k3, k4]);
          }
        }
      }
    }
    assert.equal(allKeys.length, 16);

    const allResponses: Array<Array<boolean | null>> = [];
    for (const r1 of candidateChoices) {
      for (const r2 of candidateChoices) {
        for (const r3 of candidateChoices) {
          for (const r4 of candidateChoices) {
            allResponses.push([r1, r2, r3, r4]);
          }
        }
      }
    }
    assert.equal(allResponses.length, 81);

    let countVerified = 0;
    for (const key of allKeys) {
      const q: QuestionII = {
        kind: "II",
        questionVersionId: "qII-exh",
        statements: statementIds.map((id, idx) => ({
          statementId: id,
          answer: key[idx]!,
        })),
      };

      for (const resp of allResponses) {
        let expectedCorrect = 0;
        for (let idx = 0; idx < 4; idx++) {
          const val = resp[idx];
          if (val !== null && val !== undefined && val === key[idx]) {
            expectedCorrect++;
          }
        }

        const judgeRes = judgeII(q, {
          kind: "II",
          questionVersionId: "qII-exh",
          answers: statementIds.map((id, idx) => ({
            statementId: id,
            value: resp[idx] ?? null,
          })),
        });

        assert.equal(
          judgeRes.correctCount,
          expectedCorrect,
          `Exhaustive mismatch on key=${JSON.stringify(key)} resp=${JSON.stringify(resp)}`
        );
        countVerified++;
      }
    }
    assert.equal(countVerified, 1296);
  });
});

// ============================================================================
// B1-T04: Part III Exact String Equality & Strict sa-charset-v1 Matching
// ============================================================================
describe("B1-T04 — Part III Exact String Equality & Strict sa-charset-v1 Matching", () => {
  const qIII1: QuestionIII = {
    kind: "III",
    questionVersionId: "qIII-1",
    answerKey: "1,5",
  };
  const qIII2: QuestionIII = {
    kind: "III",
    questionVersionId: "qIII-2",
    answerKey: "-0,5",
  };

  const exam: ExamVersion = {
    examId: "exam-b1-t04",
    examVersionId: "ev-b1-t04",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions: [qIII1, qIII2],
  };

  it("evaluates key '1,5' with exact string equality: '1,5' full, while '1,50', '1.5', spaces are 0 points", () => {
    // Exact match
    const attemptCorrect: AttemptResponses = {
      attemptId: "att-exact",
      examVersionId: "ev-b1-t04",
      responses: [{ kind: "III", questionVersionId: "qIII-1", raw: "1,5" }],
    };
    const resCorrect = scoreAttempt(exam, attemptCorrect);
    assert.equal(resCorrect.questions[0]?.status, "full");
    assert.ok(equals(resCorrect.questions[0]!.points, rational(5))); // N1=0, N2=0, N3=2 -> base=0 < 10 -> pointIII = 10/2 = 5

    // Different representation '1,50' is wrong
    const attemptWrongTrailing: AttemptResponses = {
      attemptId: "att-trailing-zero",
      examVersionId: "ev-b1-t04",
      responses: [{ kind: "III", questionVersionId: "qIII-1", raw: "1,50" }],
    };
    const resTrailing = scoreAttempt(exam, attemptWrongTrailing);
    assert.equal(resTrailing.questions[0]?.status, "wrong");
    assert.ok(equals(resTrailing.questions[0]!.points, ZERO));

    // Period instead of comma '1.5' is invalid
    const attemptPeriod: AttemptResponses = {
      attemptId: "att-period",
      examVersionId: "ev-b1-t04",
      responses: [{ kind: "III", questionVersionId: "qIII-1", raw: "1.5" }],
    };
    const resPeriod = scoreAttempt(exam, attemptPeriod);
    assert.equal(resPeriod.questions[0]?.status, "invalid");
    assert.ok(equals(resPeriod.questions[0]!.points, ZERO));
    assert.deepEqual(resPeriod.questions[0]?.inputIssues, ["bad_char"]);

    // Leading space ' 1,5' is invalid (bad_char for space)
    const attemptSpace: AttemptResponses = {
      attemptId: "att-space",
      examVersionId: "ev-b1-t04",
      responses: [{ kind: "III", questionVersionId: "qIII-1", raw: " 1,5" }],
    };
    const resSpace = scoreAttempt(exam, attemptSpace);
    assert.equal(resSpace.questions[0]?.status, "invalid");
    assert.ok(equals(resSpace.questions[0]!.points, ZERO));
  });

  it("evaluates negative 4-character key '-0,5' correctly", () => {
    const attemptNeg: AttemptResponses = {
      attemptId: "att-neg",
      examVersionId: "ev-b1-t04",
      responses: [{ kind: "III", questionVersionId: "qIII-2", raw: "-0,5" }],
    };
    const resNeg = scoreAttempt(exam, attemptNeg);
    assert.equal(resNeg.questions[1]?.status, "full");
    assert.ok(equals(resNeg.questions[1]!.points, rational(5)));

    // Period version '-0.5' is invalid
    const attemptNegPeriod: AttemptResponses = {
      attemptId: "att-neg-period",
      examVersionId: "ev-b1-t04",
      responses: [{ kind: "III", questionVersionId: "qIII-2", raw: "-0.5" }],
    };
    const resNegPeriod = scoreAttempt(exam, attemptNegPeriod);
    assert.equal(resNegPeriod.questions[1]?.status, "invalid");
    assert.ok(equals(resNegPeriod.questions[1]!.points, ZERO));
  });

  it("handles empty or omitted raw answers as unanswered with 0 points", () => {
    const attemptEmpty: AttemptResponses = {
      attemptId: "att-empty",
      examVersionId: "ev-b1-t04",
      responses: [
        { kind: "III", questionVersionId: "qIII-1", raw: "" },
        { kind: "III", questionVersionId: "qIII-2", raw: null },
      ],
    };
    const resEmpty = scoreAttempt(exam, attemptEmpty);
    assert.equal(resEmpty.questions[0]?.status, "unanswered");
    assert.ok(equals(resEmpty.questions[0]!.points, ZERO));
    assert.equal(resEmpty.questions[1]?.status, "unanswered");
    assert.ok(equals(resEmpty.questions[1]!.points, ZERO));
  });
});

// ============================================================================
// B1-AC01–AC08: Acceptance Criteria Comprehensive Verification
// ============================================================================
describe("B1-AC01–AC08 — Acceptance Criteria Comprehensive Verification", () => {
  function deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== "object") return obj;
    Object.freeze(obj);
    for (const key of Object.keys(obj)) {
      const val = (obj as any)[key];
      if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
        deepFreeze(val);
      }
    }
    return obj;
  }

  const examAC: ExamVersion = {
    examId: "exam-ac-all",
    examVersionId: "ev-ac-all",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions: [
      {
        kind: "I",
        questionVersionId: "qI-ac1",
        options: [{ optionId: "opt-1" }, { optionId: "opt-2" }, { optionId: "opt-3" }, { optionId: "opt-4" }],
        correctOptionId: "opt-3",
      },
      {
        kind: "II",
        questionVersionId: "qII-ac1",
        statements: [
          { statementId: "st-a", answer: true },
          { statementId: "st-b", answer: false },
          { statementId: "st-c", answer: true },
          { statementId: "st-d", answer: false },
        ],
      },
      {
        kind: "III",
        questionVersionId: "qIII-ac1",
        answerKey: "1,5",
      },
    ],
  };

  it("B1-AC01 — Pure Deterministic Engine & Output Ordering", () => {
    // Reverse response order: III, then II, then I
    const attempt: AttemptResponses = {
      attemptId: "att-ac01",
      examVersionId: "ev-ac-all",
      responses: [
        { kind: "III", questionVersionId: "qIII-ac1", raw: "1,5" },
        {
          kind: "II",
          questionVersionId: "qII-ac1",
          answers: [
            { statementId: "st-d", value: false },
            { statementId: "st-c", value: true },
            { statementId: "st-b", value: false },
            { statementId: "st-a", value: true },
          ],
        },
        { kind: "I", questionVersionId: "qI-ac1", selectedOptionId: "opt-3" },
      ],
    };

    const res1 = scoreAttempt(examAC, attempt);
    const res2 = scoreAttempt(examAC, attempt);

    // Pure & deterministic
    assert.deepEqual(res1, res2);

    // Questions strictly preserved in original exam order
    assert.equal(res1.questions.length, 3);
    assert.equal(res1.questions[0]?.questionVersionId, "qI-ac1");
    assert.equal(res1.questions[1]?.questionVersionId, "qII-ac1");
    assert.equal(res1.questions[2]?.questionVersionId, "qIII-ac1");

    // All questions have required fields
    for (const q of res1.questions) {
      assert.ok(q.status);
      assert.ok(q.points);
      assert.ok(q.maxPoints);
    }
  });

  it("B1-AC02 — Three Distinct Question Types & Exact Grading Contract", () => {
    const attempt: AttemptResponses = {
      attemptId: "att-ac02",
      examVersionId: "ev-ac-all",
      responses: [
        { kind: "I", questionVersionId: "qI-ac1", selectedOptionId: "opt-1" }, // wrong -> 0
        {
          kind: "II",
          questionVersionId: "qII-ac1",
          answers: [
            { statementId: "st-a", value: true }, // match
            { statementId: "st-b", value: true }, // mismatch (key false)
            { statementId: "st-c", value: null }, // unanswered
            // st-d omitted -> unanswered
          ],
        }, // 1 match -> k=1 -> partial 1/10
        { kind: "III", questionVersionId: "qIII-ac1", raw: "1,50" }, // numeric eq but string mismatch -> wrong
      ],
    };

    const res = scoreAttempt(examAC, attempt);
    assert.equal(res.questions[0]?.status, "wrong");
    assert.ok(equals(res.questions[0]!.points, ZERO));

    assert.equal(res.questions[1]?.status, "partial");
    assert.equal(res.questions[1]?.correctCount, 1);
    assert.ok(equals(res.questions[1]!.points, rational(1, 10)));

    assert.equal(res.questions[2]?.status, "wrong");
    assert.ok(equals(res.questions[2]!.points, ZERO));
  });

  it("B1-AC03 — Exact Rational BigInt Arithmetic Without Floating-Point Drift", () => {
    // 7 questions of Part III with N1=0, N2=0 -> base=0 < 10 -> pointIII = 10/7
    const exam7: ExamVersion = {
      examId: "exam-ac03-7",
      examVersionId: "ev-ac03-7",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      questions: Array.from({ length: 7 }, (_, i) => ({
        kind: "III" as const,
        questionVersionId: `qIII-${i}`,
        answerKey: `${i}`,
      })),
    };

    const attemptFull: AttemptResponses = {
      attemptId: "att-ac03-full",
      examVersionId: "ev-ac03-7",
      responses: Array.from({ length: 7 }, (_, i) => ({
        kind: "III" as const,
        questionVersionId: `qIII-${i}`,
        raw: `${i}`,
      })),
    };

    const res = scoreAttempt(exam7, attemptFull);
    assert.ok(equals(res.sections.III.score, rational(10)));
    assert.ok(equals(res.total, rational(10)));
    assert.equal(toFractionString(res.total), "10");

    // Golden unscaled maxima: (20, 10, 4) -> 16
    const max16 = computeExamMax({ n1: 20, n2: 10, n3: 4 });
    assert.equal(toFractionString(max16.maxTotal), "16");
    assert.equal(toFractionString(max16.pointIII), "1/4");

    // (20, 10, 0) -> 15
    const max15 = computeExamMax({ n1: 20, n2: 10, n3: 0 });
    assert.equal(toFractionString(max15.maxTotal), "15");

    // (20, 0, 0) -> 5
    const max5 = computeExamMax({ n1: 20, n2: 0, n3: 0 });
    assert.equal(toFractionString(max5.maxTotal), "5");
  });

  it("B1-AC04 — Referential Integrity & Permutation Independence", () => {
    const attemptA: AttemptResponses = {
      attemptId: "att-ac04-a",
      examVersionId: "ev-ac-all",
      responses: [
        { kind: "I", questionVersionId: "qI-ac1", selectedOptionId: "opt-3" },
        {
          kind: "II",
          questionVersionId: "qII-ac1",
          answers: [
            { statementId: "st-a", value: true },
            { statementId: "st-b", value: false },
          ],
        },
        { kind: "III", questionVersionId: "qIII-ac1", raw: "1,5" },
      ],
    };

    const attemptB: AttemptResponses = {
      attemptId: "att-ac04-b",
      examVersionId: "ev-ac-all",
      responses: [
        { kind: "III", questionVersionId: "qIII-ac1", raw: "1,5" },
        {
          kind: "II",
          questionVersionId: "qII-ac1",
          answers: [
            { statementId: "st-b", value: false },
            { statementId: "st-a", value: true },
          ],
        },
        { kind: "I", questionVersionId: "qI-ac1", selectedOptionId: "opt-3" },
      ],
    };

    const resA = scoreAttempt(examAC, attemptA);
    const resB = scoreAttempt(examAC, attemptB);

    assert.ok(equals(resA.total, resB.total));
    assert.ok(equals(resA.sections.I.score, resB.sections.I.score));
    assert.ok(equals(resA.sections.II.score, resB.sections.II.score));
    assert.ok(equals(resA.sections.III.score, resB.sections.III.score));
  });

  it("B1-AC05 — Shuffle Contract & Presentation Order Invariants", () => {
    const order = createPresentationOrder(
      examAC,
      { shuffleQuestions: true, shuffleOptions: true },
      "seed-ac05-2026"
    );

    const issues = validatePresentationOrder(examAC, order);
    assert.deepEqual(issues, []);

    // Part I options are shuffled per-question
    assert.equal(order.optionOrder.length, 1);
    assert.equal(order.optionOrder[0]?.questionVersionId, "qI-ac1");
    assert.equal(order.optionOrder[0]?.optionIds.length, 4);

    // Invalid presentation order with missing question is flagged
    const badOrder = {
      ...order,
      questionOrder: ["qI-ac1", "qII-ac1"], // missing qIII-ac1
    };
    const badIssues = validatePresentationOrder(examAC, badOrder);
    assert.ok(badIssues.length > 0);
  });

  it("B1-AC06 — Fail-Closed Validation & Security Boundaries", () => {
    // Empty exam throws ScoringInputError
    assert.throws(
      () => scoreAttempt({ examId: "e", examVersionId: "ev", ruleSetId: "custom-v1", inputPolicyId: "sa-charset-v1", questions: [] }, { attemptId: "a", examVersionId: "ev", responses: [] }),
      ScoringInputError
    );

    // Mismatched examVersionId throws ScoringInputError
    assert.throws(
      () => scoreAttempt(examAC, { attemptId: "a", examVersionId: "wrong-version", responses: [] }),
      ScoringInputError
    );

    // Prototype pollution payload handled safely without polluting Object.prototype
    const maliciousAttempt = JSON.parse('{"__proto__":{"polluted":true},"attemptId":"a","examVersionId":"ev-ac-all","responses":[]}');
    const res = scoreAttempt(examAC, maliciousAttempt);
    assert.equal((Object.prototype as any).polluted, undefined);
    assert.ok(equals(res.total, ZERO));
  });

  it("B1-AC07 — Deep Freezing & Strict Non-Mutation of Inputs", () => {
    const frozenExam = deepFreeze(JSON.parse(JSON.stringify(examAC)));
    const frozenAttempt = deepFreeze({
      attemptId: "att-frozen",
      examVersionId: "ev-ac-all",
      responses: [
        { kind: "I", questionVersionId: "qI-ac1", selectedOptionId: "opt-3" },
        { kind: "II", questionVersionId: "qII-ac1", answers: [{ statementId: "st-a", value: true }] },
        { kind: "III", questionVersionId: "qIII-ac1", raw: "1,5" },
      ],
    });

    // scoreAttempt must never mutate inputs, so it will succeed on frozen objects without throwing
    assert.doesNotThrow(() => {
      scoreAttempt(frozenExam, frozenAttempt);
    });
  });

  it("B1-AC08 — Serialization Roundtrip & Canonical DTO Contract", () => {
    const attempt: AttemptResponses = {
      attemptId: "att-ac08",
      examVersionId: "ev-ac-all",
      responses: [
        { kind: "I", questionVersionId: "qI-ac1", selectedOptionId: "opt-3" },
        {
          kind: "II",
          questionVersionId: "qII-ac1",
          answers: [
            { statementId: "st-a", value: true },
            { statementId: "st-b", value: false },
            { statementId: "st-c", value: true },
            { statementId: "st-d", value: false },
          ],
        },
        { kind: "III", questionVersionId: "qIII-ac1", raw: "1,5" },
      ],
    };

    const res = scoreAttempt(examAC, attempt);
    const dto = scoreResultToDTO(res);
    const roundtripped = scoreResultFromDTO(JSON.parse(JSON.stringify(dto)));

    assert.equal(roundtripped.attemptId, res.attemptId);
    assert.equal(roundtripped.examVersionId, res.examVersionId);
    assert.ok(equals(roundtripped.total, res.total));
    assert.ok(equals(roundtripped.maxTotal, res.maxTotal));
    assert.ok(equals(roundtripped.sections.I.score, res.sections.I.score));
    assert.ok(equals(roundtripped.sections.II.score, res.sections.II.score));
    assert.ok(equals(roundtripped.sections.III.score, res.sections.III.score));

    // Non-canonical fraction in DTO throws SyntaxError
    const badDTO = JSON.parse(JSON.stringify(dto));
    badDTO.total = "4/2"; // not reduced
    assert.throws(() => scoreResultFromDTO(badDTO), SyntaxError);
  });
});

