import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createPresentationOrder,
  validatePresentationOrder,
  type ShuffleSettings,
  type PresentationOrder,
} from "../../src/domain/shuffle.ts";
import type { ExamVersion } from "../../src/domain/model.ts";

// Helper to construct mock ExamVersion objects
function makeSampleExam() {
  return {
    examId: "exam-001",
    examVersionId: "ev-001",
    ruleSetId: "custom-v1" as const,
    inputPolicyId: "sa-charset-v1" as const,
    questions: [
      // Part I
      {
        kind: "I" as const,
        questionVersionId: "qI-1",
        options: [
          { optionId: "opt-1-A" },
          { optionId: "opt-1-B" },
          { optionId: "opt-1-C" },
          { optionId: "opt-1-D" },
        ],
        correctOptionId: "opt-1-A",
      },
      {
        kind: "I" as const,
        questionVersionId: "qI-2",
        options: [
          { optionId: "opt-2-A" },
          { optionId: "opt-2-B" },
          { optionId: "opt-2-C" },
          { optionId: "opt-2-D" },
        ],
        correctOptionId: "opt-2-C",
      },
      {
        kind: "I" as const,
        questionVersionId: "qI-3",
        options: [
          { optionId: "opt-3-A" },
          { optionId: "opt-3-B" },
          { optionId: "opt-3-C" },
          { optionId: "opt-3-D" },
        ],
        correctOptionId: "opt-3-B",
      },
      {
        kind: "I" as const,
        questionVersionId: "qI-4",
        options: [
          { optionId: "opt-4-A" },
          { optionId: "opt-4-B" },
          { optionId: "opt-4-C" },
          { optionId: "opt-4-D" },
        ],
        correctOptionId: "opt-4-D",
      },
      // Part II
      {
        kind: "II" as const,
        questionVersionId: "qII-1",
        statements: [
          { statementId: "st-1-a", answer: true },
          { statementId: "st-1-b", answer: false },
          { statementId: "st-1-c", answer: true },
          { statementId: "st-1-d", answer: false },
        ],
      },
      {
        kind: "II" as const,
        questionVersionId: "qII-2",
        statements: [
          { statementId: "st-2-a", answer: false },
          { statementId: "st-2-b", answer: true },
          { statementId: "st-2-c", answer: false },
          { statementId: "st-2-d", answer: true },
        ],
      },
      // Part III
      {
        kind: "III" as const,
        questionVersionId: "qIII-1",
        answerKey: "1,5",
      },
      {
        kind: "III" as const,
        questionVersionId: "qIII-2",
        answerKey: "-0,5",
      },
      {
        kind: "III" as const,
        questionVersionId: "qIII-3",
        answerKey: "42",
      },
    ],
  };
}

// Deep freeze helper to guarantee immutability
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

describe("createPresentationOrder - Determinism and Seed Properties", () => {
  it("produces identical results for the exact same (exam, settings, seed)", () => {
    const exam = makeSampleExam();
    const settings: ShuffleSettings = { shuffleQuestions: true, shuffleOptions: true };
    const seed = "stable-seed-20261114";

    const order1 = createPresentationOrder(exam, settings, seed);
    const order2 = createPresentationOrder(exam, settings, seed);

    assert.deepEqual(order1, order2);
  });

  it("produces different permutations when seeds are different", () => {
    const exam = makeSampleExam();
    const settings: ShuffleSettings = { shuffleQuestions: true, shuffleOptions: true };

    const order1 = createPresentationOrder(exam, settings, "seed-alpha");
    const order2 = createPresentationOrder(exam, settings, "seed-beta");

    // Seeds are stored in result
    assert.equal(order1.seed, "seed-alpha");
    assert.equal(order2.seed, "seed-beta");

    // At least question order or option order should differ between different seeds
    const sameQuestionOrder =
      JSON.stringify(order1.questionOrder) === JSON.stringify(order2.questionOrder);
    const sameOptionOrder =
      JSON.stringify(order1.optionOrder) === JSON.stringify(order2.optionOrder);

    assert.equal(sameQuestionOrder && sameOptionOrder, false);
  });

  it("handles empty seed, numeric seed string, and unicode seeds gracefully", () => {
    const exam = makeSampleExam();
    const settings: ShuffleSettings = { shuffleQuestions: true, shuffleOptions: true };

    for (const seed of ["", "0", "12345", "tiếng Việt có dấu - Đề thi GDPT 2018", "🎲✨"]) {
      const order = createPresentationOrder(exam, settings, seed);
      assert.equal(order.seed, seed);
      const issues = validatePresentationOrder(exam, order);
      assert.deepEqual(issues, []);
    }
  });
});

describe("createPresentationOrder - Flag Independence (4 combinations)", () => {
  it("satisfies the 4 independent combinations of (shuffleQuestions, shuffleOptions)", () => {
    const exam = makeSampleExam();
    const seed = "fixed-seed-matrix";

    const orderFF = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      seed,
    );
    const orderFT = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: true },
      seed,
    );
    const orderTF = createPresentationOrder(
      exam,
      { shuffleQuestions: true, shuffleOptions: false },
      seed,
    );
    const orderTT = createPresentationOrder(
      exam,
      { shuffleQuestions: true, shuffleOptions: true },
      seed,
    );

    // 1. questionOrder is identical when shuffleQuestions has the same value, regardless of shuffleOptions
    assert.deepEqual(orderFF.questionOrder, orderFT.questionOrder);
    assert.deepEqual(orderTF.questionOrder, orderTT.questionOrder);

    // 2. optionOrder is identical when shuffleOptions has the same value, regardless of shuffleQuestions
    assert.deepEqual(orderFF.optionOrder, orderTF.optionOrder);
    assert.deepEqual(orderFT.optionOrder, orderTT.optionOrder);

    // 3. Turning off shuffleQuestions preserves original question order
    const originalQuestionIds = exam.questions.map((q) => q.questionVersionId);
    assert.deepEqual(orderFF.questionOrder, originalQuestionIds);
    assert.deepEqual(orderFT.questionOrder, originalQuestionIds);

    // 4. Turning off shuffleOptions preserves original option order for each Part I question
    for (const entry of orderFF.optionOrder) {
      const originalQ = exam.questions.find((q) => q.questionVersionId === entry.questionVersionId)!;
      if (originalQ.kind === "I") {
        assert.deepEqual(
          entry.optionIds,
          originalQ.options.map((o) => o.optionId),
        );
      }
    }
    for (const entry of orderTF.optionOrder) {
      const originalQ = exam.questions.find((q) => q.questionVersionId === entry.questionVersionId)!;
      if (originalQ.kind === "I") {
        assert.deepEqual(
          entry.optionIds,
          originalQ.options.map((o) => o.optionId),
        );
      }
    }

    // 5. When enabled, order actually shuffles (for a sufficiently non-trivial exam)
    const shuffledQuestionIds = orderTF.questionOrder;
    assert.notDeepEqual(shuffledQuestionIds, originalQuestionIds);
  });
});

describe("createPresentationOrder - Section Grouping and Permutation Integrity", () => {
  it("keeps questions strictly grouped in sections I -> II -> III even when shuffled", () => {
    const exam = makeSampleExam();
    const seeds = ["seed-1", "seed-42", "seed-999", "seed-gdpt2018"];

    for (const seed of seeds) {
      const order = createPresentationOrder(
        exam,
        { shuffleQuestions: true, shuffleOptions: true },
        seed,
      );

      const examMap = new Map(exam.questions.map((q) => [q.questionVersionId, q]));
      let currentSectionRank = 1;

      for (const qId of order.questionOrder) {
        const q = examMap.get(qId)!;
        const rank = q.kind === "I" ? 1 : q.kind === "II" ? 2 : 3;
        assert.ok(
          rank >= currentSectionRank,
          `Section ordering violated: question ${qId} of kind ${q.kind} (rank ${rank}) appeared after rank ${currentSectionRank}`,
        );
        currentSectionRank = rank;
      }
    }
  });

  it("always yields a valid bijection (permutation) of all question IDs", () => {
    const exam = makeSampleExam();
    const order = createPresentationOrder(
      exam,
      { shuffleQuestions: true, shuffleOptions: true },
      "test-seed",
    );

    const originalIds = exam.questions.map((q) => q.questionVersionId);
    assert.equal(order.questionOrder.length, originalIds.length);
    assert.deepEqual([...order.questionOrder].sort(), [...originalIds].sort());

    // No duplicate IDs
    const uniqueIds = new Set(order.questionOrder);
    assert.equal(uniqueIds.size, originalIds.length);
  });

  it("always yields a valid bijection of options for every Part I question", () => {
    const exam = makeSampleExam();
    const order = createPresentationOrder(
      exam,
      { shuffleQuestions: true, shuffleOptions: true },
      "test-seed",
    );

    const partIQuestions = exam.questions.filter((q) => q.kind === "I");
    assert.equal(order.optionOrder.length, partIQuestions.length);

    for (const entry of order.optionOrder) {
      const q = exam.questions.find((x) => x.questionVersionId === entry.questionVersionId);
      if (!q || q.kind !== "I") {
        throw new Error("Expected question to be found and have kind 'I'");
      }
      const originalOptionIds = q.options.map((o) => o.optionId);
      assert.equal(entry.optionIds.length, originalOptionIds.length);
      assert.deepEqual([...entry.optionIds].sort(), [...originalOptionIds].sort());
      assert.equal(new Set(entry.optionIds).size, originalOptionIds.length);
    }
  });

  it("gives each Part I question its own distinct permutation, not a single shared permutation", () => {
    // Construct an exam with 12 Part I questions that all have identically named option IDs
    const questions = Array.from({ length: 12 }, (_, i) => ({
      kind: "I" as const,
      questionVersionId: `q-part1-${i + 1}`,
      options: [
        { optionId: "opt-A" },
        { optionId: "opt-B" },
        { optionId: "opt-C" },
        { optionId: "opt-D" },
      ],
      correctOptionId: "opt-A",
    }));

    const exam = {
      examId: "exam-many-part1",
      examVersionId: "ev-many-part1",
      ruleSetId: "custom-v1" as const,
      inputPolicyId: "sa-charset-v1" as const,
      questions,
    };

    const order = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: true },
      "seed-diverse-permutations",
    );

    const serializedPermutations = order.optionOrder.map((o) => o.optionIds.join(","));
    const distinctPermutations = new Set(serializedPermutations);

    // With 12 questions and 24 possible permutations, independent seeds should produce multiple distinct permutations
    assert.ok(
      distinctPermutations.size > 1,
      `Expected multiple distinct permutations across Part I questions, but got only ${distinctPermutations.size}`,
    );
  });
});

describe("Purity and Immutability", () => {
  it("never invokes Math.random or Date.now", () => {
    const originalMathRandom = Math.random;
    const originalDateNow = Date.now;

    Math.random = () => {
      throw new Error("Forbidden call to Math.random");
    };
    Date.now = () => {
      throw new Error("Forbidden call to Date.now");
    };

    try {
      const exam = makeSampleExam();
      const settings: ShuffleSettings = { shuffleQuestions: true, shuffleOptions: true };
      const order = createPresentationOrder(exam, settings, "pure-seed");
      const issues = validatePresentationOrder(exam, order);
      assert.deepEqual(issues, []);
    } finally {
      Math.random = originalMathRandom;
      Date.now = originalDateNow;
    }
  });

  it("does not mutate input exam, settings, or order objects (deep freeze test)", () => {
    const exam = deepFreeze(makeSampleExam());
    const settings = deepFreeze<ShuffleSettings>({
      shuffleQuestions: true,
      shuffleOptions: true,
    });
    const seed = "immutable-test-seed";

    const order = createPresentationOrder(exam, settings, seed);
    deepFreeze(order);

    const issues = validatePresentationOrder(exam, order);
    assert.deepEqual(issues, []);
  });
});

describe("validatePresentationOrder - Validation Rules and Error Detection", () => {
  it("returns [] for any valid presentation order generated by createPresentationOrder", () => {
    const exam = makeSampleExam();
    const settingsList: ShuffleSettings[] = [
      { shuffleQuestions: false, shuffleOptions: false },
      { shuffleQuestions: false, shuffleOptions: true },
      { shuffleQuestions: true, shuffleOptions: false },
      { shuffleQuestions: true, shuffleOptions: true },
    ];

    for (const settings of settingsList) {
      const order = createPresentationOrder(exam, settings, "valid-seed");
      const issues = validatePresentationOrder(exam, order);
      assert.deepEqual(issues, []);
    }
  });

  it("detects missing question IDs in questionOrder", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    // Omit question 'qI-2'
    const invalidOrder: PresentationOrder = {
      ...validOrder,
      questionOrder: validOrder.questionOrder.filter((id) => id !== "qI-2"),
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(issues.some((i) => i.code === "QUESTION_MISSING" && i.message.includes("qI-2")));
  });

  it("detects unknown / extra question IDs in questionOrder", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    const invalidOrder: PresentationOrder = {
      ...validOrder,
      questionOrder: [...validOrder.questionOrder, "ghost-question-id"],
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(
      issues.some((i) => i.code === "QUESTION_UNKNOWN" && i.message.includes("ghost-question-id")),
    );
  });

  it("detects duplicate question IDs in questionOrder", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    const invalidOrder: PresentationOrder = {
      ...validOrder,
      questionOrder: ["qI-1", ...validOrder.questionOrder],
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(issues.some((i) => i.code === "ID_DUPLICATE" && i.message.includes("qI-1")));
  });

  it("detects violation of section order I -> II -> III in questionOrder", () => {
    const exam = makeSampleExam();
    // Move part I question 'qI-1' to the very end (after Part III)
    const invalidQuestionOrder = [
      "qI-2",
      "qI-3",
      "qI-4",
      "qII-1",
      "qII-2",
      "qIII-1",
      "qIII-2",
      "qIII-3",
      "qI-1",
    ];

    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );
    const invalidOrder: PresentationOrder = {
      ...validOrder,
      questionOrder: invalidQuestionOrder,
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(
      issues.some(
        (i) => i.code === "SECTION_ORDER_INVALID" && i.message.includes("qI-1"),
      ),
    );
  });

  it("detects missing Part I question entries in optionOrder", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    // Remove entry for 'qI-3'
    const invalidOrder: PresentationOrder = {
      ...validOrder,
      optionOrder: validOrder.optionOrder.filter((o) => o.questionVersionId !== "qI-3"),
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(
      issues.some((i) => i.code === "OPTION_ORDER_MISSING" && i.message.includes("qI-3")),
    );
  });

  it("detects duplicate question entries in optionOrder", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    const firstEntry = validOrder.optionOrder[0]!;
    const invalidOrder: PresentationOrder = {
      ...validOrder,
      optionOrder: [...validOrder.optionOrder, firstEntry],
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(
      issues.some(
        (i) => i.code === "ID_DUPLICATE" && i.message.includes(firstEntry.questionVersionId),
      ),
    );
  });

  it("detects entries in optionOrder for non-Part-I questions", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    const invalidOrder: PresentationOrder = {
      ...validOrder,
      optionOrder: [
        ...validOrder.optionOrder,
        { questionVersionId: "qII-1", optionIds: ["opt-x"] },
      ],
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(
      issues.some(
        (i) => i.code === "QUESTION_KIND_MISMATCH" && i.message.includes("qII-1"),
      ),
    );
  });

  it("detects missing options in a Part I question's optionIds", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    // In qI-1, drop opt-1-D
    const invalidOptionOrder = validOrder.optionOrder.map((entry) => {
      if (entry.questionVersionId === "qI-1") {
        return {
          questionVersionId: "qI-1",
          optionIds: entry.optionIds.filter((id) => id !== "opt-1-D"),
        };
      }
      return entry;
    });

    const invalidOrder: PresentationOrder = {
      ...validOrder,
      optionOrder: invalidOptionOrder,
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(
      issues.some(
        (i) => i.code === "OPTION_MISSING" && i.message.includes("opt-1-D"),
      ),
    );
  });

  it("detects duplicate option IDs within optionIds", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    const invalidOptionOrder = validOrder.optionOrder.map((entry) => {
      if (entry.questionVersionId === "qI-1") {
        return {
          questionVersionId: "qI-1",
          optionIds: ["opt-1-A", "opt-1-A", "opt-1-B", "opt-1-C"],
        };
      }
      return entry;
    });

    const invalidOrder: PresentationOrder = {
      ...validOrder,
      optionOrder: invalidOptionOrder,
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(
      issues.some(
        (i) => i.code === "ID_DUPLICATE" && i.message.includes("opt-1-A"),
      ),
    );
  });

  it("detects foreign options belonging to another question ('option của câu khác')", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    // Replace opt-1-D in qI-1 with opt-2-A (which belongs to qI-2)
    const invalidOptionOrder = validOrder.optionOrder.map((entry) => {
      if (entry.questionVersionId === "qI-1") {
        return {
          questionVersionId: "qI-1",
          optionIds: ["opt-1-A", "opt-1-B", "opt-1-C", "opt-2-A"],
        };
      }
      return entry;
    });

    const invalidOrder: PresentationOrder = {
      ...validOrder,
      optionOrder: invalidOptionOrder,
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(
      issues.some(
        (i) =>
          (i.code === "OPTION_FOREIGN" || i.code === "OPTION_UNKNOWN") &&
          i.message.includes("opt-2-A"),
      ),
    );
  });

  it("detects completely unknown option IDs", () => {
    const exam = makeSampleExam();
    const validOrder = createPresentationOrder(
      exam,
      { shuffleQuestions: false, shuffleOptions: false },
      "seed",
    );

    const invalidOptionOrder = validOrder.optionOrder.map((entry) => {
      if (entry.questionVersionId === "qI-1") {
        return {
          questionVersionId: "qI-1",
          optionIds: ["opt-1-A", "opt-1-B", "opt-1-C", "opt-phantom"],
        };
      }
      return entry;
    });

    const invalidOrder: PresentationOrder = {
      ...validOrder,
      optionOrder: invalidOptionOrder,
    };

    const issues = validatePresentationOrder(exam, invalidOrder);
    assert.ok(
      issues.some(
        (i) => i.code === "OPTION_UNKNOWN" && i.message.includes("opt-phantom"),
      ),
    );
  });

  it("handles malformed inputs defensively (non-object, wrong types)", () => {
    const exam = makeSampleExam();

    assert.ok(
      validatePresentationOrder(exam, null as unknown as PresentationOrder).length > 0,
    );
    assert.ok(
      validatePresentationOrder(exam, "not-an-object" as unknown as PresentationOrder).length > 0,
    );
    assert.ok(
      validatePresentationOrder(exam, {
        seed: 1234 as unknown as string,
        questionOrder: "not-an-array" as unknown as string[],
        optionOrder: null as unknown as [],
      }).length > 0,
    );
  });
});

describe("createPresentationOrder & validatePresentationOrder - Edge Cases", () => {
  it("handles exam with only Part I questions", () => {
    const exam = {
      examId: "only-part-1",
      examVersionId: "ev-p1",
      ruleSetId: "custom-v1" as const,
      inputPolicyId: "sa-charset-v1" as const,
      questions: [
        {
          kind: "I" as const,
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

    const order = createPresentationOrder(
      exam,
      { shuffleQuestions: true, shuffleOptions: true },
      "seed-p1",
    );
    assert.deepEqual(order.questionOrder, ["q1"]);
    assert.equal(order.optionOrder.length, 1);
    assert.deepEqual(validatePresentationOrder(exam, order), []);
  });

  it("handles exam with only Part II and Part III questions (no Part I questions)", () => {
    const exam = {
      examId: "only-part-2-3",
      examVersionId: "ev-p23",
      ruleSetId: "custom-v1" as const,
      inputPolicyId: "sa-charset-v1" as const,
      questions: [
        {
          kind: "II" as const,
          questionVersionId: "q-ii-1",
          statements: [
            { statementId: "st-1", answer: true },
            { statementId: "st-2", answer: false },
            { statementId: "st-3", answer: true },
            { statementId: "st-4", answer: false },
          ],
        },
        {
          kind: "III" as const,
          questionVersionId: "q-iii-1",
          answerKey: "10",
        },
      ],
    };

    const order = createPresentationOrder(
      exam,
      { shuffleQuestions: true, shuffleOptions: true },
      "seed-p23",
    );
    assert.equal(order.optionOrder.length, 0); // No Part I questions
    assert.deepEqual(validatePresentationOrder(exam, order), []);
  });

  it("handles empty exam questions list", () => {
    const exam = {
      examId: "empty-exam",
      examVersionId: "ev-empty",
      ruleSetId: "custom-v1" as const,
      inputPolicyId: "sa-charset-v1" as const,
      questions: [],
    };

    const order = createPresentationOrder(
      exam,
      { shuffleQuestions: true, shuffleOptions: true },
      "seed-empty",
    );
    assert.deepEqual(order.questionOrder, []);
    assert.deepEqual(order.optionOrder, []);
    assert.deepEqual(validatePresentationOrder(exam, order), []);
  });

  it("scales efficiently to 100 questions without error or performance degradation", () => {
    const questions = [];
    for (let i = 0; i < 50; i++) {
      questions.push({
        kind: "I" as const,
        questionVersionId: `qI-${i}`,
        options: [
          { optionId: `opt-${i}-A` },
          { optionId: `opt-${i}-B` },
          { optionId: `opt-${i}-C` },
          { optionId: `opt-${i}-D` },
        ],
        correctOptionId: `opt-${i}-A`,
      });
    }
    for (let i = 0; i < 25; i++) {
      questions.push({
        kind: "II" as const,
        questionVersionId: `qII-${i}`,
        statements: [
          { statementId: `st-${i}-a`, answer: true },
          { statementId: `st-${i}-b`, answer: false },
          { statementId: `st-${i}-c`, answer: true },
          { statementId: `st-${i}-d`, answer: false },
        ],
      });
    }
    for (let i = 0; i < 25; i++) {
      questions.push({
        kind: "III" as const,
        questionVersionId: `qIII-${i}`,
        answerKey: `${i}`,
      });
    }

    const exam = {
      examId: "exam-100",
      examVersionId: "ev-100",
      ruleSetId: "custom-v1" as const,
      inputPolicyId: "sa-charset-v1" as const,
      questions,
    };

    const t0 = performance.now();
    const order = createPresentationOrder(
      exam,
      { shuffleQuestions: true, shuffleOptions: true },
      "seed-performance-100",
    );
    const issues = validatePresentationOrder(exam, order);
    const duration = performance.now() - t0;

    assert.deepEqual(issues, []);
    assert.equal(order.questionOrder.length, 100);
    assert.equal(order.optionOrder.length, 50);
    assert.ok(duration < 200, `Execution took ${duration}ms, expected < 200ms`);
  });

  describe("LC04-F03 regression: interleaved section questions in source exam", () => {
    it("handles III -> I -> II source exam with all 4 flag pairs and rejects malformed orders", () => {
      const exam = {
        examId: "exam-interleaved-1",
        examVersionId: "ev-interleaved-1",
        ruleSetId: "custom-v1" as const,
        inputPolicyId: "sa-charset-v1" as const,
        questions: [
          { kind: "III" as const, questionVersionId: "q3", answerKey: "1" },
          {
            kind: "I" as const,
            questionVersionId: "q1",
            options: [
              { optionId: "o1" },
              { optionId: "o2" },
              { optionId: "o3" },
              { optionId: "o4" },
            ],
            correctOptionId: "o1",
          },
          {
            kind: "II" as const,
            questionVersionId: "q2",
            statements: [
              { statementId: "s1", answer: true },
              { statementId: "s2", answer: false },
              { statementId: "s3", answer: true },
              { statementId: "s4", answer: false },
            ],
          },
        ],
      };

      for (const shuffleQuestions of [false, true]) {
        for (const shuffleOptions of [false, true]) {
          const order = createPresentationOrder(exam, { shuffleQuestions, shuffleOptions }, "seed-interleaved-1");
          const issues = validatePresentationOrder(exam, order);
          assert.equal(issues.length, 0, `Failed for flags { shuffleQuestions: ${shuffleQuestions}, shuffleOptions: ${shuffleOptions} }`);
          if (!shuffleQuestions) {
            assert.deepEqual(order.questionOrder, ["q3", "q1", "q2"]);
          } else {
            assert.deepEqual(order.questionOrder, ["q1", "q2", "q3"]);
          }
        }
      }

      // Negative controls on interleaved exam
      // 1. Scrambled order that is neither original nor section-grouped
      const scrambledOrder: PresentationOrder = {
        seed: "seed",
        questionOrder: ["q2", "q1", "q3"],
        optionOrder: [{ questionVersionId: "q1", optionIds: ["o1", "o2", "o3", "o4"] }],
      };
      const scrambledIssues = validatePresentationOrder(exam, scrambledOrder);
      assert.ok(scrambledIssues.some((i) => i.code === "SECTION_ORDER_INVALID"));

      // 2. Missing question
      const missingOrder: PresentationOrder = {
        seed: "seed",
        questionOrder: ["q3", "q1"],
        optionOrder: [{ questionVersionId: "q1", optionIds: ["o1", "o2", "o3", "o4"] }],
      };
      const missingIssues = validatePresentationOrder(exam, missingOrder);
      assert.ok(missingIssues.some((i) => i.code === "QUESTION_MISSING"));

      // 3. Duplicate question
      const dupOrder: PresentationOrder = {
        seed: "seed",
        questionOrder: ["q3", "q1", "q1"],
        optionOrder: [{ questionVersionId: "q1", optionIds: ["o1", "o2", "o3", "o4"] }],
      };
      const dupIssues = validatePresentationOrder(exam, dupOrder);
      assert.ok(dupIssues.some((i) => i.code === "ID_DUPLICATE"));

      // 4. Foreign question
      const foreignOrder: PresentationOrder = {
        seed: "seed",
        questionOrder: ["q3", "q1", "qForeign"],
        optionOrder: [{ questionVersionId: "q1", optionIds: ["o1", "o2", "o3", "o4"] }],
      };
      const foreignIssues = validatePresentationOrder(exam, foreignOrder);
      assert.ok(foreignIssues.some((i) => i.code === "QUESTION_UNKNOWN"));
    });

    it("handles I -> III -> I source exam across all 4 flag pairs", () => {
      const exam = {
        examId: "exam-interleaved-2",
        examVersionId: "ev-interleaved-2",
        ruleSetId: "custom-v1" as const,
        inputPolicyId: "sa-charset-v1" as const,
        questions: [
          {
            kind: "I" as const,
            questionVersionId: "q1a",
            options: [
              { optionId: "o1" },
              { optionId: "o2" },
              { optionId: "o3" },
              { optionId: "o4" },
            ],
            correctOptionId: "o1",
          },
          { kind: "III" as const, questionVersionId: "q3", answerKey: "1" },
          {
            kind: "I" as const,
            questionVersionId: "q1b",
            options: [
              { optionId: "o5" },
              { optionId: "o6" },
              { optionId: "o7" },
              { optionId: "o8" },
            ],
            correctOptionId: "o5",
          },
        ],
      };

      for (const shuffleQuestions of [false, true]) {
        for (const shuffleOptions of [false, true]) {
          const order = createPresentationOrder(exam, { shuffleQuestions, shuffleOptions }, "seed-interleaved-2");
          const issues = validatePresentationOrder(exam, order);
          assert.equal(issues.length, 0, `Failed for flags { shuffleQuestions: ${shuffleQuestions}, shuffleOptions: ${shuffleOptions} }`);
          if (!shuffleQuestions) {
            assert.deepEqual(order.questionOrder, ["q1a", "q3", "q1b"]);
          } else {
            // Part I questions come first, then Part III
            assert.equal(order.questionOrder[2], "q3");
            assert.ok(order.questionOrder.includes("q1a") && order.questionOrder.includes("q1b"));
          }
        }
      }
    });

    it("detects malformed types and empty strings in questionOrder and optionOrder", () => {
      const exam = makeSampleExam();
      const validOrder = createPresentationOrder(exam, { shuffleQuestions: false, shuffleOptions: false }, "seed-check");

      // 1. Non-string or empty questionId in questionOrder
      const badQOrder1: PresentationOrder = {
        ...validOrder,
        questionOrder: ["", ...validOrder.questionOrder.slice(1)],
      };
      const issues1 = validatePresentationOrder(exam, badQOrder1);
      assert.ok(issues1.some((i) => i.code === "TYPE_MISMATCH" && i.path === "order.questionOrder[0]"));

      const badQOrder2: PresentationOrder = {
        ...validOrder,
        questionOrder: [123 as any, ...validOrder.questionOrder.slice(1)],
      };
      const issues2 = validatePresentationOrder(exam, badQOrder2);
      assert.ok(issues2.some((i) => i.code === "TYPE_MISMATCH" && i.path === "order.questionOrder[0]"));

      // 2. Non-object entry in optionOrder
      const badOptOrder1: PresentationOrder = {
        ...validOrder,
        optionOrder: [null as any, ...validOrder.optionOrder.slice(1)],
      };
      const issuesOpt1 = validatePresentationOrder(exam, badOptOrder1);
      assert.ok(issuesOpt1.some((i) => i.code === "TYPE_MISMATCH" && i.path === "order.optionOrder[0]"));

      // 3. Non-string or empty questionVersionId in optionOrder entry
      const badOptOrder2: PresentationOrder = {
        ...validOrder,
        optionOrder: [{ questionVersionId: "", optionIds: ["opt-1-A", "opt-1-B", "opt-1-C", "opt-1-D"] }],
      };
      const issuesOpt2 = validatePresentationOrder(exam, badOptOrder2);
      assert.ok(issuesOpt2.some((i) => i.code === "TYPE_MISMATCH" && i.path.includes("questionVersionId")));

      // 4. Unknown questionVersionId in optionOrder entry
      const badOptOrder3: PresentationOrder = {
        ...validOrder,
        optionOrder: [{ questionVersionId: "unknown-q", optionIds: ["opt-1-A", "opt-1-B", "opt-1-C", "opt-1-D"] }],
      };
      const issuesOpt3 = validatePresentationOrder(exam, badOptOrder3);
      assert.ok(issuesOpt3.some((i) => i.code === "QUESTION_UNKNOWN" && i.path.includes("questionVersionId")));

      // 5. optionIds is not an array
      const badOptOrder4: PresentationOrder = {
        ...validOrder,
        optionOrder: [{ questionVersionId: "qI-1", optionIds: "not-an-array" as any }, ...validOrder.optionOrder.slice(1)],
      };
      const issuesOpt4 = validatePresentationOrder(exam, badOptOrder4);
      assert.ok(issuesOpt4.some((i) => i.code === "TYPE_MISMATCH" && i.path.includes("optionIds")));

      // 6. Non-string or empty optionId inside optionIds
      const badOptOrder5: PresentationOrder = {
        ...validOrder,
        optionOrder: [
          { questionVersionId: "qI-1", optionIds: ["", "opt-1-B", "opt-1-C", "opt-1-D"] },
          ...validOrder.optionOrder.slice(1),
        ],
      };
      const issuesOpt5 = validatePresentationOrder(exam, badOptOrder5);
      assert.ok(issuesOpt5.some((i) => i.code === "TYPE_MISMATCH" && i.path.includes("optionIds[0]")));

      const badOptOrder6: PresentationOrder = {
        ...validOrder,
        optionOrder: [
          { questionVersionId: "qI-1", optionIds: [999 as any, "opt-1-B", "opt-1-C", "opt-1-D"] },
          ...validOrder.optionOrder.slice(1),
        ],
      };
      const issuesOpt6 = validatePresentationOrder(exam, badOptOrder6);
      assert.ok(issuesOpt6.some((i) => i.code === "TYPE_MISMATCH" && i.path.includes("optionIds[0]")));
    });

    it("handles prototype property string IDs (__proto__, constructor, toString, valueOf) in shuffle creation and validation", () => {
      const protoExam: ExamVersion = {
        examId: "__proto__",
        examVersionId: "ev-proto",
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
            answerKey: "1,5",
          },
        ],
      };

      const order = createPresentationOrder(
        protoExam,
        { shuffleQuestions: true, shuffleOptions: true },
        "seed-proto-shuffle"
      );
      assert.equal(order.questionOrder.length, 3);
      assert.equal(order.optionOrder.length, 1);
      assert.equal(order.optionOrder[0]!.questionVersionId, "__proto__");
      assert.equal(order.optionOrder[0]!.optionIds.length, 4);

      const issues = validatePresentationOrder(protoExam, order);
      assert.deepEqual(issues, []);

      // Duplicate detection with prototype property IDs in questionOrder
      const dupQOrder: PresentationOrder = {
        ...order,
        questionOrder: ["__proto__", "__proto__", "toString"],
      };
      const dupQIssues = validatePresentationOrder(protoExam, dupQOrder);
      assert.ok(dupQIssues.some((i) => i.code === "ID_DUPLICATE" && i.path === "order.questionOrder[1]"));

      // Duplicate detection with prototype property IDs in optionIds
      const dupOptOrder: PresentationOrder = {
        ...order,
        optionOrder: [
          {
            questionVersionId: "__proto__",
            optionIds: ["__proto__", "__proto__", "toString", "valueOf"],
          },
        ],
      };
      const dupOptIssues = validatePresentationOrder(protoExam, dupOptOrder);
      assert.ok(
        dupOptIssues.some(
          (i) => i.code === "ID_DUPLICATE" && i.path === "order.optionOrder[0].optionIds[1]"
        )
      );
    });
  });
});
