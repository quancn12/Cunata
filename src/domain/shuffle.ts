import type {
  Id,
  ExamVersion,
  Question,
  QuestionI,
  ValidationIssue,
} from "./model.ts";

export interface ShuffleSettings {
  readonly shuffleQuestions: boolean;
  readonly shuffleOptions: boolean;
}

export interface PresentationOrder {
  readonly seed: string;
  readonly questionOrder: readonly Id[];
  readonly optionOrder: readonly {
    readonly questionVersionId: Id;
    readonly optionIds: readonly Id[];
  }[];
}

/**
 * 32-bit MurmurHash3 (murmur3_32)
 * Pure deterministic hash function mapping a string key and optional seed
 * to a 32-bit unsigned integer [0, 2^32 - 1].
 */
function murmurHash3(key: string, seed: number = 0): number {
  let h = seed >>> 0;
  for (let i = 0; i < key.length; i++) {
    let k = key.charCodeAt(i);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);

    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
  }
  h ^= key.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * SplitMix32 Pseudo-Random Number Generator
 * High-quality deterministic 32-bit PRNG. Non-cryptographic.
 */
class SplitMix32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextUint32(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  }

  /**
   * Generates a random integer in range [0, bound - 1] without modulo bias.
   */
  nextInt(bound: number): number {
    if (bound <= 1) return 0;
    const max = 4294967296; // 2^32
    const threshold = max - (max % bound);
    while (true) {
      const r = this.nextUint32();
      if (r < threshold) {
        return r % bound;
      }
    }
  }
}

/**
 * Fisher-Yates shuffle algorithm.
 * Returns a new shuffled array without mutating the input array.
 */
function shuffleArray<T>(items: readonly T[], rng: SplitMix32): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1); // 0 <= j <= i
    if (i !== j) {
      const temp = result[i]!;
      result[i] = result[j]!;
      result[j] = temp;
    }
  }
  return result;
}

/**
 * Creates presentation order for exam questions and options based on seed and settings.
 * Deterministic for any (exam, settings, seed).
 * Independent flags:
 * - shuffleQuestions: questions stay grouped in sections I -> II -> III, shuffled within each section.
 * - shuffleOptions: each Part I question gets its own independent option permutation.
 * Turning off either flag preserves the original order.
 */
export function createPresentationOrder(
  exam: ExamVersion,
  settings: ShuffleSettings,
  seed: string,
): PresentationOrder {
  // 1. Determine questionOrder
  let questionOrder: Id[];
  if (!settings.shuffleQuestions) {
    questionOrder = exam.questions.map((q) => q.questionVersionId);
  } else {
    const questionsI = exam.questions.filter((q) => q.kind === "I");
    const questionsII = exam.questions.filter((q) => q.kind === "II");
    const questionsIII = exam.questions.filter((q) => q.kind === "III");

    const rngI = new SplitMix32(murmurHash3(`${seed}:questions:I`));
    const rngII = new SplitMix32(murmurHash3(`${seed}:questions:II`));
    const rngIII = new SplitMix32(murmurHash3(`${seed}:questions:III`));

    const shuffledI = shuffleArray(questionsI, rngI);
    const shuffledII = shuffleArray(questionsII, rngII);
    const shuffledIII = shuffleArray(questionsIII, rngIII);

    questionOrder = [
      ...shuffledI.map((q) => q.questionVersionId),
      ...shuffledII.map((q) => q.questionVersionId),
      ...shuffledIII.map((q) => q.questionVersionId),
    ];
  }

  // 2. Determine optionOrder for all Part I questions
  const partIQuestions = exam.questions.filter((q): q is QuestionI => q.kind === "I");
  const optionOrder = partIQuestions.map((q) => {
    let optionIds: Id[];
    if (!settings.shuffleOptions) {
      optionIds = q.options.map((opt) => opt.optionId);
    } else {
      const rngOpt = new SplitMix32(murmurHash3(`${seed}:options:${q.questionVersionId}`));
      optionIds = shuffleArray(
        q.options.map((opt) => opt.optionId),
        rngOpt,
      );
    }
    return {
      questionVersionId: q.questionVersionId,
      optionIds,
    };
  });

  return {
    seed,
    questionOrder,
    optionOrder,
  };
}

/**
 * Validates a PresentationOrder against the original ExamVersion.
 * Checks for missing, extra, duplicate IDs, foreign options from another question,
 * and section grouping I -> II -> III.
 * Returns empty array [] if valid. Does not mutate input.
 */
export function validatePresentationOrder(
  exam: ExamVersion,
  order: PresentationOrder,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (order === null || typeof order !== "object") {
    return [
      {
        code: "TYPE_MISMATCH",
        path: "order",
        message: "PresentationOrder must be an object",
      },
    ];
  }

  if (typeof order.seed !== "string") {
    issues.push({
      code: "TYPE_MISMATCH",
      path: "order.seed",
      message: "seed must be a string",
    });
  }

  if (!Array.isArray(order.questionOrder)) {
    issues.push({
      code: "TYPE_MISMATCH",
      path: "order.questionOrder",
      message: "questionOrder must be an array",
    });
  }

  if (!Array.isArray(order.optionOrder)) {
    issues.push({
      code: "TYPE_MISMATCH",
      path: "order.optionOrder",
      message: "optionOrder must be an array",
    });
  }

  if (issues.length > 0) {
    return issues;
  }

  // --- Validate questionOrder ---
  const examQuestionMap = new Map<Id, Question>();
  for (const q of exam.questions) {
    examQuestionMap.set(q.questionVersionId, q);
  }

  const seenQuestionIds = new Set<Id>();
  let lastSectionRank = 1; // 1 for I, 2 for II, 3 for III
  const isOriginalOrder =
    order.questionOrder.length === exam.questions.length &&
    exam.questions.every((q, idx) => q.questionVersionId === order.questionOrder[idx]);

  for (let i = 0; i < order.questionOrder.length; i++) {
    const qId = order.questionOrder[i];
    if (typeof qId !== "string" || qId === "") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: `order.questionOrder[${i}]`,
        message: `Question ID at index ${i} must be a non-empty string`,
      });
      continue;
    }

    if (seenQuestionIds.has(qId)) {
      issues.push({
        code: "ID_DUPLICATE",
        path: `order.questionOrder[${i}]`,
        message: `Duplicate question ID '${qId}' in questionOrder`,
      });
    } else {
      seenQuestionIds.add(qId);
    }

    const examQ = examQuestionMap.get(qId);
    if (!examQ) {
      issues.push({
        code: "QUESTION_UNKNOWN",
        path: `order.questionOrder[${i}]`,
        message: `Question ID '${qId}' not found in exam`,
      });
    } else if (!isOriginalOrder) {
      const rank = examQ.kind === "I" ? 1 : examQ.kind === "II" ? 2 : 3;
      if (rank < lastSectionRank) {
        issues.push({
          code: "SECTION_ORDER_INVALID",
          path: `order.questionOrder[${i}]`,
          message: `Question '${qId}' of kind '${examQ.kind}' violates section order I -> II -> III`,
        });
      } else {
        lastSectionRank = rank;
      }
    }
  }

  // Missing questions from questionOrder
  for (const q of exam.questions) {
    if (!seenQuestionIds.has(q.questionVersionId)) {
      issues.push({
        code: "QUESTION_MISSING",
        path: "order.questionOrder",
        message: `Question '${q.questionVersionId}' from exam is missing in questionOrder`,
      });
    }
  }

  // --- Validate optionOrder ---
  const partIQuestions = exam.questions.filter((q): q is QuestionI => q.kind === "I");

  // Track all option IDs across the entire exam to detect foreign options
  const allExamOptionOwners = new Map<Id, Id>(); // optionId -> questionVersionId
  for (const q of partIQuestions) {
    for (const opt of q.options) {
      allExamOptionOwners.set(opt.optionId, q.questionVersionId);
    }
  }

  const seenOptionOrderQIds = new Set<Id>();

  for (let i = 0; i < order.optionOrder.length; i++) {
    const entry = order.optionOrder[i];
    if (entry === null || typeof entry !== "object") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: `order.optionOrder[${i}]`,
        message: `optionOrder entry at index ${i} must be an object`,
      });
      continue;
    }

    const qId = entry.questionVersionId;
    if (typeof qId !== "string" || qId === "") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: `order.optionOrder[${i}].questionVersionId`,
        message: `questionVersionId at index ${i} must be a non-empty string`,
      });
      continue;
    }

    if (seenOptionOrderQIds.has(qId)) {
      issues.push({
        code: "ID_DUPLICATE",
        path: `order.optionOrder[${i}].questionVersionId`,
        message: `Duplicate question entry '${qId}' in optionOrder`,
      });
    } else {
      seenOptionOrderQIds.add(qId);
    }

    const examQ = examQuestionMap.get(qId);
    if (!examQ) {
      issues.push({
        code: "QUESTION_UNKNOWN",
        path: `order.optionOrder[${i}].questionVersionId`,
        message: `Question '${qId}' in optionOrder not found in exam`,
      });
      continue;
    }

    if (examQ.kind !== "I") {
      issues.push({
        code: "QUESTION_KIND_MISMATCH",
        path: `order.optionOrder[${i}].questionVersionId`,
        message: `Question '${qId}' in optionOrder is not a Part I question (kind: '${examQ.kind}')`,
      });
      continue;
    }

    if (!Array.isArray(entry.optionIds)) {
      issues.push({
        code: "TYPE_MISMATCH",
        path: `order.optionOrder[${i}].optionIds`,
        message: `optionIds for question '${qId}' must be an array`,
      });
      continue;
    }

    const targetOptSet = new Set(examQ.options.map((opt) => opt.optionId));
    const seenOptIds = new Set<Id>();

    for (let j = 0; j < entry.optionIds.length; j++) {
      const optId = entry.optionIds[j];
      if (typeof optId !== "string" || optId === "") {
        issues.push({
          code: "TYPE_MISMATCH",
          path: `order.optionOrder[${i}].optionIds[${j}]`,
          message: `Option ID at index ${j} for question '${qId}' must be a non-empty string`,
        });
        continue;
      }

      if (seenOptIds.has(optId)) {
        issues.push({
          code: "ID_DUPLICATE",
          path: `order.optionOrder[${i}].optionIds[${j}]`,
          message: `Duplicate option ID '${optId}' for question '${qId}' in optionOrder`,
        });
      } else {
        seenOptIds.add(optId);
      }

      if (!targetOptSet.has(optId)) {
        const ownerQId = allExamOptionOwners.get(optId);
        if (ownerQId && ownerQId !== qId) {
          issues.push({
            code: "OPTION_FOREIGN",
            path: `order.optionOrder[${i}].optionIds[${j}]`,
            message: `Option ID '${optId}' belongs to another question ('${ownerQId}'), not '${qId}'`,
          });
        } else {
          issues.push({
            code: "OPTION_UNKNOWN",
            path: `order.optionOrder[${i}].optionIds[${j}]`,
            message: `Option ID '${optId}' does not belong to question '${qId}'`,
          });
        }
      }
    }

    // Check missing options
    for (const expectedOpt of examQ.options) {
      if (!seenOptIds.has(expectedOpt.optionId)) {
        issues.push({
          code: "OPTION_MISSING",
          path: `order.optionOrder[${i}].optionIds`,
          message: `Option '${expectedOpt.optionId}' of question '${qId}' is missing in optionOrder`,
        });
      }
    }
  }

  // Check missing Part I questions in optionOrder
  for (const q of partIQuestions) {
    if (!seenOptionOrderQIds.has(q.questionVersionId)) {
      issues.push({
        code: "OPTION_ORDER_MISSING",
        path: "order.optionOrder",
        message: `Part I question '${q.questionVersionId}' is missing from optionOrder`,
      });
    }
  }

  return issues;
}
