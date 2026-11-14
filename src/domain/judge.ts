import type {
  Id,
  QuestionI,
  ResponseI,
  QuestionII,
  ResponseII,
  QuestionIII,
  ResponseIII,
} from "./model.ts";

export type JudgeI = "correct" | "wrong" | "unanswered" | "invalid";

export function judgeI(q: QuestionI, r: ResponseI | undefined): JudgeI {
  if (r === undefined || r.selectedOptionId === null || r.selectedOptionId === undefined) {
    return "unanswered";
  }
  const isOptionValid = q.options.some((opt) => opt.optionId === r.selectedOptionId);
  if (!isOptionValid) {
    return "invalid";
  }
  return r.selectedOptionId === q.correctOptionId ? "correct" : "wrong";
}

export type StatementState = "correct" | "wrong" | "unanswered" | "invalid";

export interface JudgeIIResult {
  readonly correctCount: 0 | 1 | 2 | 3 | 4;
  readonly perStatement: readonly { readonly statementId: Id; readonly state: StatementState }[];
  readonly unknownStatementIds: readonly Id[];
}

export function judgeII(q: QuestionII, r: ResponseII | undefined): JudgeIIResult {
  const validStatementIdSet = new Set(q.statements.map((s) => s.statementId));

  if (r === undefined || r.answers === undefined) {
    return {
      correctCount: 0,
      perStatement: q.statements.map((s) => ({
        statementId: s.statementId,
        state: "unanswered",
      })),
      unknownStatementIds: [],
    };
  }

  const statementMatches = new Map<Id, Array<boolean | null>>();
  const unknownIds: Id[] = [];

  for (const a of r.answers) {
    if (validStatementIdSet.has(a.statementId)) {
      const existing = statementMatches.get(a.statementId);
      if (existing !== undefined) {
        existing.push(a.value);
      } else {
        statementMatches.set(a.statementId, [a.value]);
      }
    } else {
      if (!unknownIds.includes(a.statementId)) {
        unknownIds.push(a.statementId);
      }
    }
  }

  let correctCount = 0;
  const perStatement = q.statements.map((s) => {
    const matches = statementMatches.get(s.statementId);
    let state: StatementState;
    if (matches === undefined || matches.length === 0) {
      state = "unanswered";
    } else if (matches.length > 1) {
      state = "invalid";
    } else {
      const val = matches[0];
      if (val === null || val === undefined) {
        state = "unanswered";
      } else if (val === s.answer) {
        state = "correct";
      } else {
        state = "wrong";
      }
    }

    if (state === "correct") {
      correctCount++;
    }

    return {
      statementId: s.statementId,
      state,
    };
  });

  return {
    correctCount: correctCount as 0 | 1 | 2 | 3 | 4,
    perStatement,
    unknownStatementIds: unknownIds,
  };
}

export type JudgeIII = "correct" | "wrong" | "unanswered";

export function judgeIII(q: QuestionIII, r: ResponseIII | undefined): JudgeIII {
  if (r === undefined || r.raw === null || r.raw === undefined || r.raw === "") {
    return "unanswered";
  }
  return r.raw === q.answerKey ? "correct" : "wrong";
}
