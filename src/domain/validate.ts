import type {
  ExamVersion,
  AttemptResponses,
  ValidationIssue,
  Question,
} from "./model.ts";
import { checkShortAnswer } from "./shortAnswer.ts";

export const MAX_QUESTIONS_PER_EXAM = 1000;

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeErrorMessage(err: unknown): string {
  try {
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const msg = (err as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
    return String(err);
  } catch {
    return "Unexpected error";
  }
}

export function validateExamVersion(input: unknown): Validated<ExamVersion> {
  try {
    const issues: ValidationIssue[] = [];

    if (!isRecord(input)) {
      return {
        ok: false,
        issues: [{ code: "TYPE_MISMATCH", path: "", message: "ExamVersion must be an object" }],
      };
    }

    // examId
    if (!Object.hasOwn(input, "examId") || typeof input.examId !== "string") {
      issues.push({ code: "TYPE_MISMATCH", path: "examId", message: "examId must be a string" });
    } else if (input.examId === "") {
      issues.push({ code: "ID_EMPTY", path: "examId", message: "examId must not be empty" });
    }

    // examVersionId
    if (!Object.hasOwn(input, "examVersionId") || typeof input.examVersionId !== "string") {
      issues.push({ code: "TYPE_MISMATCH", path: "examVersionId", message: "examVersionId must be a string" });
    } else if (input.examVersionId === "") {
      issues.push({ code: "ID_EMPTY", path: "examVersionId", message: "examVersionId must not be empty" });
    }

    // ruleSetId
    if (!Object.hasOwn(input, "ruleSetId") || typeof input.ruleSetId !== "string") {
      issues.push({ code: "TYPE_MISMATCH", path: "ruleSetId", message: "ruleSetId must be a string" });
    } else if (input.ruleSetId !== "custom-v1") {
      issues.push({ code: "RULESET_UNKNOWN", path: "ruleSetId", message: `Unknown ruleSetId: "${input.ruleSetId}"` });
    }

    // inputPolicyId
    if (!Object.hasOwn(input, "inputPolicyId") || typeof input.inputPolicyId !== "string") {
      issues.push({ code: "TYPE_MISMATCH", path: "inputPolicyId", message: "inputPolicyId must be a string" });
    } else if (input.inputPolicyId !== "sa-charset-v1") {
      issues.push({ code: "INPUT_POLICY_UNKNOWN", path: "inputPolicyId", message: `Unknown inputPolicyId: "${input.inputPolicyId}"` });
    }

    // questions
    if (!Object.hasOwn(input, "questions") || !Array.isArray(input.questions)) {
      issues.push({ code: "TYPE_MISMATCH", path: "questions", message: "questions must be an array" });
    } else {
      if (input.questions.length === 0) {
        issues.push({ code: "EXAM_EMPTY", path: "questions", message: "questions must not be empty" });
      }
      if (input.questions.length > MAX_QUESTIONS_PER_EXAM) {
        issues.push({
          code: "LIMIT_EXCEEDED",
          path: "questions",
          message: `questions length (${input.questions.length}) exceeds maximum (${MAX_QUESTIONS_PER_EXAM})`,
        });
      }

      const seenQuestionVersionIds = new Set<string>();

      for (let i = 0; i < input.questions.length; i++) {
        const q = input.questions[i];
        const qPath = `questions[${i}]`;

        if (!isRecord(q)) {
          issues.push({ code: "TYPE_MISMATCH", path: qPath, message: "Question must be an object" });
          continue;
        }

        // questionVersionId
        if (!Object.hasOwn(q, "questionVersionId") || typeof q.questionVersionId !== "string") {
          issues.push({ code: "TYPE_MISMATCH", path: `${qPath}.questionVersionId`, message: "questionVersionId must be a string" });
        } else if (q.questionVersionId === "") {
          issues.push({ code: "ID_EMPTY", path: `${qPath}.questionVersionId`, message: "questionVersionId must not be empty" });
        } else if (seenQuestionVersionIds.has(q.questionVersionId)) {
          issues.push({ code: "ID_DUPLICATE", path: `${qPath}.questionVersionId`, message: `Duplicate questionVersionId: "${q.questionVersionId}"` });
        } else {
          seenQuestionVersionIds.add(q.questionVersionId);
        }

        // kind
        if (!Object.hasOwn(q, "kind") || typeof q.kind !== "string") {
          issues.push({ code: "TYPE_MISMATCH", path: `${qPath}.kind`, message: "kind must be a string" });
        } else if (q.kind !== "I" && q.kind !== "II" && q.kind !== "III") {
          issues.push({ code: "QUESTION_KIND_UNKNOWN", path: `${qPath}.kind`, message: `Unknown question kind: "${q.kind}"` });
        } else if (q.kind === "I") {
          // QuestionI validation
          if (!Object.hasOwn(q, "options") || !Array.isArray(q.options)) {
            issues.push({ code: "TYPE_MISMATCH", path: `${qPath}.options`, message: "options must be an array" });
          } else {
            if (q.options.length !== 4) {
              issues.push({ code: "I_OPTION_COUNT", path: `${qPath}.options`, message: `Part I question must have exactly 4 options, found ${q.options.length}` });
            }

            const seenOptionIds = new Set<string>();
            for (let j = 0; j < q.options.length; j++) {
              const opt = q.options[j];
              const optPath = `${qPath}.options[${j}]`;

              if (!isRecord(opt)) {
                issues.push({ code: "TYPE_MISMATCH", path: optPath, message: "Option must be an object" });
              } else {
                if (!Object.hasOwn(opt, "optionId") || typeof opt.optionId !== "string") {
                  issues.push({ code: "TYPE_MISMATCH", path: `${optPath}.optionId`, message: "optionId must be a string" });
                } else if (opt.optionId === "") {
                  issues.push({ code: "ID_EMPTY", path: `${optPath}.optionId`, message: "optionId must not be empty" });
                } else if (seenOptionIds.has(opt.optionId)) {
                  issues.push({ code: "ID_DUPLICATE", path: `${optPath}.optionId`, message: `Duplicate optionId: "${opt.optionId}"` });
                } else {
                  seenOptionIds.add(opt.optionId);
                }
              }
            }

            // correctOptionId
            if (!Object.hasOwn(q, "correctOptionId") || typeof q.correctOptionId !== "string") {
              issues.push({ code: "TYPE_MISMATCH", path: `${qPath}.correctOptionId`, message: "correctOptionId must be a string" });
            } else if (q.correctOptionId === "") {
              issues.push({ code: "ID_EMPTY", path: `${qPath}.correctOptionId`, message: "correctOptionId must not be empty" });
            } else if (!seenOptionIds.has(q.correctOptionId)) {
              issues.push({
                code: "I_KEY_NOT_IN_OPTIONS",
                path: `${qPath}.correctOptionId`,
                message: `correctOptionId "${q.correctOptionId}" not found in options`,
              });
            }
          }
        } else if (q.kind === "II") {
          // QuestionII validation
          if (!Object.hasOwn(q, "statements") || !Array.isArray(q.statements)) {
            issues.push({ code: "TYPE_MISMATCH", path: `${qPath}.statements`, message: "statements must be an array" });
          } else {
            if (q.statements.length !== 4) {
              issues.push({ code: "II_STATEMENT_COUNT", path: `${qPath}.statements`, message: `Part II question must have exactly 4 statements, found ${q.statements.length}` });
            }

            const seenStatementIds = new Set<string>();
            for (let j = 0; j < q.statements.length; j++) {
              const stmt = q.statements[j];
              const stmtPath = `${qPath}.statements[${j}]`;

              if (!isRecord(stmt)) {
                issues.push({ code: "TYPE_MISMATCH", path: stmtPath, message: "Statement must be an object" });
              } else {
                if (!Object.hasOwn(stmt, "statementId") || typeof stmt.statementId !== "string") {
                  issues.push({ code: "TYPE_MISMATCH", path: `${stmtPath}.statementId`, message: "statementId must be a string" });
                } else if (stmt.statementId === "") {
                  issues.push({ code: "ID_EMPTY", path: `${stmtPath}.statementId`, message: "statementId must not be empty" });
                } else if (seenStatementIds.has(stmt.statementId)) {
                  issues.push({ code: "ID_DUPLICATE", path: `${stmtPath}.statementId`, message: `Duplicate statementId: "${stmt.statementId}"` });
                } else {
                  seenStatementIds.add(stmt.statementId);
                }

                if (!Object.hasOwn(stmt, "answer") || typeof stmt.answer !== "boolean") {
                  issues.push({
                    code: "II_ANSWER_NOT_BOOLEAN",
                    path: `${stmtPath}.answer`,
                    message: "Statement answer must be a boolean (true or false)",
                  });
                }
              }
            }
          }
        } else if (q.kind === "III") {
          // QuestionIII validation
          if (!Object.hasOwn(q, "answerKey") || typeof q.answerKey !== "string") {
            issues.push({ code: "TYPE_MISMATCH", path: `${qPath}.answerKey`, message: "answerKey must be a string" });
          } else {
            const saIssues = checkShortAnswer(q.answerKey);
            if (saIssues.length > 0) {
              issues.push({
                code: "III_KEY_INVALID",
                path: `${qPath}.answerKey`,
                message: `Invalid answerKey: issues [${saIssues.join(", ")}]`,
              });
            }
          }
        }
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    return { ok: true, value: input as unknown as ExamVersion };
  } catch (err) {
    return {
      ok: false,
      issues: [{
        code: "TYPE_MISMATCH",
        path: "",
        message: safeErrorMessage(err),
      }],
    };
  }
}

export function validateAttemptResponses(
  exam: ExamVersion,
  input: unknown
): Validated<AttemptResponses> {
  try {
    const issues: ValidationIssue[] = [];

    if (!isRecord(input)) {
      return {
        ok: false,
        issues: [{ code: "TYPE_MISMATCH", path: "", message: "AttemptResponses must be an object" }],
      };
    }

    // attemptId
    if (!Object.hasOwn(input, "attemptId") || typeof input.attemptId !== "string" || input.attemptId === "") {
      issues.push({ code: "TYPE_MISMATCH", path: "attemptId", message: "attemptId must be a non-empty string" });
    }

    // examVersionId
    const expectedExamVersionId = isRecord(exam) && typeof exam.examVersionId === "string" ? exam.examVersionId : undefined;
    if (!Object.hasOwn(input, "examVersionId") || typeof input.examVersionId !== "string") {
      issues.push({ code: "TYPE_MISMATCH", path: "examVersionId", message: "examVersionId must be a string" });
    } else if (expectedExamVersionId !== undefined && input.examVersionId !== expectedExamVersionId) {
      issues.push({
        code: "ATTEMPT_EXAM_MISMATCH",
        path: "examVersionId",
        message: `Attempt examVersionId "${input.examVersionId}" does not match exam "${expectedExamVersionId}"`,
      });
    }

    // responses
    if (!Object.hasOwn(input, "responses") || !Array.isArray(input.responses)) {
      issues.push({ code: "TYPE_MISMATCH", path: "responses", message: "responses must be an array" });
    } else {
      const examQuestions = new Map<string, Question>();
      if (isRecord(exam) && Array.isArray(exam.questions)) {
        for (const eq of exam.questions) {
          if (isRecord(eq) && typeof eq.questionVersionId === "string") {
            examQuestions.set(eq.questionVersionId, eq as unknown as Question);
          }
        }
      }

      const seenResponseQuestionIds = new Set<string>();

      for (let i = 0; i < input.responses.length; i++) {
        const r = input.responses[i];
        const rPath = `responses[${i}]`;

        if (!isRecord(r)) {
          issues.push({ code: "TYPE_MISMATCH", path: rPath, message: "Response must be an object" });
          continue;
        }

        // questionVersionId
        if (!Object.hasOwn(r, "questionVersionId") || typeof r.questionVersionId !== "string") {
          issues.push({ code: "TYPE_MISMATCH", path: `${rPath}.questionVersionId`, message: "questionVersionId must be a string" });
          continue;
        }

        const qid = r.questionVersionId;
        if (seenResponseQuestionIds.has(qid)) {
          issues.push({
            code: "RESPONSE_DUPLICATE",
            path: `${rPath}.questionVersionId`,
            message: `Duplicate response for questionVersionId: "${qid}"`,
          });
        } else {
          seenResponseQuestionIds.add(qid);
        }

        const eq = examQuestions.get(qid);
        if (!eq) {
          issues.push({
            code: "RESPONSE_UNKNOWN_QUESTION",
            path: `${rPath}.questionVersionId`,
            message: `Response questionVersionId "${qid}" does not exist in exam`,
          });
        }

        // kind
        if (!Object.hasOwn(r, "kind") || typeof r.kind !== "string") {
          issues.push({ code: "TYPE_MISMATCH", path: `${rPath}.kind`, message: "kind must be a string" });
          continue;
        }

        if (eq && r.kind !== eq.kind) {
          issues.push({
            code: "RESPONSE_KIND_MISMATCH",
            path: `${rPath}.kind`,
            message: `Response kind "${r.kind}" does not match question kind "${eq.kind}"`,
          });
        }

        // Payload per kind
        if (r.kind === "I") {
          if (
            !Object.hasOwn(r, "selectedOptionId") ||
            (typeof r.selectedOptionId !== "string" && r.selectedOptionId !== null)
          ) {
            issues.push({
              code: "TYPE_MISMATCH",
              path: `${rPath}.selectedOptionId`,
              message: "selectedOptionId must be a string or null",
            });
          }
        } else if (r.kind === "II") {
          if (!Object.hasOwn(r, "answers") || !Array.isArray(r.answers)) {
            issues.push({
              code: "TYPE_MISMATCH",
              path: `${rPath}.answers`,
              message: "answers must be an array",
            });
          } else {
            for (let j = 0; j < r.answers.length; j++) {
              const a = r.answers[j];
              const aPath = `${rPath}.answers[${j}]`;

              if (!isRecord(a)) {
                issues.push({ code: "TYPE_MISMATCH", path: aPath, message: "StatementAnswer must be an object" });
              } else {
                if (!Object.hasOwn(a, "statementId") || typeof a.statementId !== "string") {
                  issues.push({
                    code: "TYPE_MISMATCH",
                    path: `${aPath}.statementId`,
                    message: "statementId must be a string",
                  });
                }
                if (!Object.hasOwn(a, "value") || (typeof a.value !== "boolean" && a.value !== null)) {
                  issues.push({
                    code: "TYPE_MISMATCH",
                    path: `${aPath}.value`,
                    message: "value must be a boolean or null",
                  });
                }
              }
            }
          }
        } else if (r.kind === "III") {
          if (!Object.hasOwn(r, "raw") || (typeof r.raw !== "string" && r.raw !== null)) {
            issues.push({
              code: "TYPE_MISMATCH",
              path: `${rPath}.raw`,
              message: "raw must be a string or null",
            });
          }
        } else if (!eq) {
          // If question is unknown and kind is not I, II, III
          issues.push({
            code: "TYPE_MISMATCH",
            path: `${rPath}.kind`,
            message: `Unknown kind "${r.kind}" in response`,
          });
        }
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    return { ok: true, value: input as unknown as AttemptResponses };
  } catch (err) {
    return {
      ok: false,
      issues: [{
        code: "TYPE_MISMATCH",
        path: "",
        message: safeErrorMessage(err),
      }],
    };
  }
}
