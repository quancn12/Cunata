import type {
  ExamVersion,
  ValidationIssue,
  Validated,
} from "../domain/index.ts";
import {
  MAX_QUESTIONS_PER_EXAM,
  validateExamVersion,
  checkShortAnswer,
} from "../domain/index.ts";
import type {
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamSettings,
  Asset,
  ReleasePolicy,
  QuestionContent,
  ImportDraft,
} from "./types.ts";

export const WHITELISTED_ASSET_MIMES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
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

export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Object.isFrozen(obj)) {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === "object") {
      deepFreeze(val);
    }
  }
  return obj;
}

export function isHostilePath(pathStr: string): boolean {
  const lower = pathStr.toLowerCase().trim();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:")) {
    return true;
  }
  if (
    pathStr.includes("..") &&
    (pathStr.includes("../") ||
      pathStr.includes("..\\") ||
      pathStr === ".." ||
      pathStr.endsWith("/..") ||
      pathStr.endsWith("\\.."))
  ) {
    return true;
  }
  return false;
}

export function isHostileDataUriOrContent(mime: string, data: string): boolean {
  const lower = data.toLowerCase();
  if (
    lower.includes("javascript:") ||
    lower.includes("vbscript:") ||
    lower.includes("data:text/html")
  ) {
    return true;
  }
  if (mime === "image/svg+xml") {
    if (lower.includes("<script") || /on[a-z]+\s*=/i.test(lower)) {
      return true;
    }
  }
  return false;
}

function extractContent(q: Record<string, unknown>): QuestionContent {
  const content: Record<string, unknown> = {};
  if (typeof q.questionId === "string") content.questionId = q.questionId;
  if (typeof q.title === "string") content.title = q.title;
  if (typeof q.content === "string") content.content = q.content;
  if (typeof q.image === "string") content.image = q.image;
  if (typeof q.explanation === "string") content.explanation = q.explanation;
  if (typeof q.subject === "string") content.subject = q.subject;
  if (q.grade === 10 || q.grade === 11 || q.grade === 12) content.grade = q.grade;
  if (typeof q.topic === "string") content.topic = q.topic;
  if (typeof q.lesson === "string") content.lesson = q.lesson;
  if (
    q.difficulty === "Nhận biết" ||
    q.difficulty === "Thông hiểu" ||
    q.difficulty === "Vận dụng"
  ) {
    content.difficulty = q.difficulty;
  }
  if (Array.isArray(q.blocks)) content.blocks = q.blocks;
  if (isRecord(q.provenance)) content.provenance = q.provenance;
  return content as QuestionContent;
}

export function parseExam(input: unknown): Validated<WebExam> {
  try {
    let raw: unknown = input;
    if (typeof input === "string") {
      try {
        raw = JSON.parse(input);
      } catch (err) {
        return {
          ok: false,
          issues: [
            {
              code: "JSON_SYNTAX_ERROR",
              path: "",
              message: `Invalid JSON string: ${safeErrorMessage(err)}`,
            },
          ],
        };
      }
    }

    if (!isRecord(raw)) {
      return {
        ok: false,
        issues: [
          {
            code: "TYPE_MISMATCH",
            path: "",
            message: "Exam must be an object",
          },
        ],
      };
    }

    const issues: ValidationIssue[] = [];

    // schemaVersion: if present must be 'web-exam-v1', else legacy accepted
    if (Object.hasOwn(raw, "schemaVersion")) {
      if (typeof raw.schemaVersion !== "string") {
        issues.push({
          code: "TYPE_MISMATCH",
          path: "schemaVersion",
          message: "schemaVersion must be a string",
        });
      } else if (raw.schemaVersion !== "web-exam-v1") {
        issues.push({
          code: "EXAM_SCHEMA_UNSUPPORTED",
          path: "schemaVersion",
          message: `Unsupported schema version: "${raw.schemaVersion}". Expected "web-exam-v1".`,
        });
      }
    }

    // examId
    if (!Object.hasOwn(raw, "examId") || typeof raw.examId !== "string") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "examId",
        message: "examId must be a string",
      });
    } else if (raw.examId === "") {
      issues.push({
        code: "ID_EMPTY",
        path: "examId",
        message: "examId must not be empty",
      });
    }

    // examVersionId
    if (
      !Object.hasOwn(raw, "examVersionId") ||
      typeof raw.examVersionId !== "string"
    ) {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "examVersionId",
        message: "examVersionId must be a string",
      });
    } else if (raw.examVersionId === "") {
      issues.push({
        code: "ID_EMPTY",
        path: "examVersionId",
        message: "examVersionId must not be empty",
      });
    }

    // title
    if (!Object.hasOwn(raw, "title") || typeof raw.title !== "string") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "title",
        message: "title must be a string",
      });
    } else if (raw.title === "") {
      issues.push({
        code: "TITLE_EMPTY",
        path: "title",
        message: "title must not be empty",
      });
    }

    // subject
    if (!Object.hasOwn(raw, "subject") || typeof raw.subject !== "string") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "subject",
        message: "subject must be a string",
      });
    } else if (raw.subject === "") {
      issues.push({
        code: "SUBJECT_EMPTY",
        path: "subject",
        message: "subject must not be empty",
      });
    }

    // grade
    if (!Object.hasOwn(raw, "grade") || typeof raw.grade !== "number") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "grade",
        message: "grade must be a number",
      });
    } else if (raw.grade !== 10 && raw.grade !== 11 && raw.grade !== 12) {
      issues.push({
        code: "GRADE_INVALID",
        path: "grade",
        message: `grade must be 10, 11, or 12, found ${raw.grade}`,
      });
    }

    // ruleSetId
    if (!Object.hasOwn(raw, "ruleSetId") || typeof raw.ruleSetId !== "string") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "ruleSetId",
        message: "ruleSetId must be a string",
      });
    } else if (raw.ruleSetId !== "custom-v1") {
      issues.push({
        code: "RULESET_UNKNOWN",
        path: "ruleSetId",
        message: `Unknown ruleSetId: "${raw.ruleSetId}"`,
      });
    }

    // inputPolicyId
    if (
      !Object.hasOwn(raw, "inputPolicyId") ||
      typeof raw.inputPolicyId !== "string"
    ) {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "inputPolicyId",
        message: "inputPolicyId must be a string",
      });
    } else if (raw.inputPolicyId !== "sa-charset-v1") {
      issues.push({
        code: "INPUT_POLICY_UNKNOWN",
        path: "inputPolicyId",
        message: `Unknown inputPolicyId: "${raw.inputPolicyId}"`,
      });
    }

    // Settings & legacy adapter & conflict detection
    let finalSettings: ExamSettings | null = null;
    if (Object.hasOwn(raw, "settings")) {
      if (!isRecord(raw.settings)) {
        issues.push({
          code: "TYPE_MISMATCH",
          path: "settings",
          message: "settings must be an object",
        });
      } else {
        const s = raw.settings;
        if (
          !Object.hasOwn(s, "durationMinutes") ||
          typeof s.durationMinutes !== "number" ||
          !Number.isInteger(s.durationMinutes) ||
          s.durationMinutes <= 0
        ) {
          issues.push({
            code: "TYPE_MISMATCH",
            path: "settings.durationMinutes",
            message: "settings.durationMinutes must be a positive integer",
          });
        }
        if (
          Object.hasOwn(s, "maxAttempts") &&
          s.maxAttempts !== null &&
          (typeof s.maxAttempts !== "number" ||
            !Number.isInteger(s.maxAttempts) ||
            s.maxAttempts <= 0)
        ) {
          issues.push({
            code: "TYPE_MISMATCH",
            path: "settings.maxAttempts",
            message: "settings.maxAttempts must be null or a positive integer",
          });
        }
        if (
          !Object.hasOwn(s, "releasePolicy") ||
          (s.releasePolicy !== "immediate" &&
            s.releasePolicy !== "after_deadline")
        ) {
          issues.push({
            code: "TYPE_MISMATCH",
            path: "settings.releasePolicy",
            message: 'settings.releasePolicy must be "immediate" or "after_deadline"',
          });
        }
        if (
          !Object.hasOwn(s, "shuffleQuestions") ||
          typeof s.shuffleQuestions !== "boolean"
        ) {
          issues.push({
            code: "TYPE_MISMATCH",
            path: "settings.shuffleQuestions",
            message: "settings.shuffleQuestions must be a boolean",
          });
        }
        if (
          !Object.hasOwn(s, "shuffleOptions") ||
          typeof s.shuffleOptions !== "boolean"
        ) {
          issues.push({
            code: "TYPE_MISMATCH",
            path: "settings.shuffleOptions",
            message: "settings.shuffleOptions must be a boolean",
          });
        }

        // Conflict check with legacy top-level values
        if (
          Object.hasOwn(raw, "durationMinutes") &&
          typeof raw.durationMinutes === "number" &&
          raw.durationMinutes !== s.durationMinutes
        ) {
          issues.push({
            code: "EXAM_SETTINGS_CONFLICT",
            path: "durationMinutes",
            message: `Top-level durationMinutes (${raw.durationMinutes}) conflicts with settings.durationMinutes (${s.durationMinutes})`,
          });
        }
        if (
          Object.hasOwn(raw, "releasePolicy") &&
          typeof raw.releasePolicy === "string" &&
          raw.releasePolicy !== s.releasePolicy
        ) {
          issues.push({
            code: "EXAM_SETTINGS_CONFLICT",
            path: "releasePolicy",
            message: `Top-level releasePolicy (${raw.releasePolicy}) conflicts with settings.releasePolicy (${s.releasePolicy})`,
          });
        }
        if (
          Object.hasOwn(raw, "maxAttempts") &&
          raw.maxAttempts !== s.maxAttempts
        ) {
          issues.push({
            code: "EXAM_SETTINGS_CONFLICT",
            path: "maxAttempts",
            message: `Top-level maxAttempts (${raw.maxAttempts}) conflicts with settings.maxAttempts (${s.maxAttempts})`,
          });
        }
        if (
          Object.hasOwn(raw, "shuffleQuestions") &&
          typeof raw.shuffleQuestions === "boolean" &&
          raw.shuffleQuestions !== s.shuffleQuestions
        ) {
          issues.push({
            code: "EXAM_SETTINGS_CONFLICT",
            path: "shuffleQuestions",
            message: `Top-level shuffleQuestions (${raw.shuffleQuestions}) conflicts with settings.shuffleQuestions (${s.shuffleQuestions})`,
          });
        }
        if (
          Object.hasOwn(raw, "shuffleOptions") &&
          typeof raw.shuffleOptions === "boolean" &&
          raw.shuffleOptions !== s.shuffleOptions
        ) {
          issues.push({
            code: "EXAM_SETTINGS_CONFLICT",
            path: "shuffleOptions",
            message: `Top-level shuffleOptions (${raw.shuffleOptions}) conflicts with settings.shuffleOptions (${s.shuffleOptions})`,
          });
        }
        if (
          Object.hasOwn(raw, "shuffleSettings") &&
          isRecord(raw.shuffleSettings)
        ) {
          if (
            Object.hasOwn(raw.shuffleSettings, "questions") &&
            typeof raw.shuffleSettings.questions === "boolean" &&
            raw.shuffleSettings.questions !== s.shuffleQuestions
          ) {
            issues.push({
              code: "EXAM_SETTINGS_CONFLICT",
              path: "shuffleSettings.questions",
              message: `Top-level shuffleSettings.questions (${raw.shuffleSettings.questions}) conflicts with settings.shuffleQuestions (${s.shuffleQuestions})`,
            });
          }
          if (
            Object.hasOwn(raw.shuffleSettings, "options") &&
            typeof raw.shuffleSettings.options === "boolean" &&
            raw.shuffleSettings.options !== s.shuffleOptions
          ) {
            issues.push({
              code: "EXAM_SETTINGS_CONFLICT",
              path: "shuffleSettings.options",
              message: `Top-level shuffleSettings.options (${raw.shuffleSettings.options}) conflicts with settings.shuffleOptions (${s.shuffleOptions})`,
            });
          }
        }

        if (
          typeof s.durationMinutes === "number" &&
          Number.isInteger(s.durationMinutes) &&
          s.durationMinutes > 0 &&
          (s.releasePolicy === "immediate" ||
            s.releasePolicy === "after_deadline") &&
          typeof s.shuffleQuestions === "boolean" &&
          typeof s.shuffleOptions === "boolean"
        ) {
          finalSettings = {
            durationMinutes: s.durationMinutes,
            maxAttempts:
              typeof s.maxAttempts === "number" && s.maxAttempts > 0
                ? s.maxAttempts
                : null,
            releasePolicy: s.releasePolicy,
            shuffleQuestions: s.shuffleQuestions,
            shuffleOptions: s.shuffleOptions,
          };
        }
      }
    } else {
      // Legacy settings derivation
      let dur = 50;
      if (Object.hasOwn(raw, "durationMinutes")) {
        if (
          typeof raw.durationMinutes === "number" &&
          Number.isInteger(raw.durationMinutes) &&
          raw.durationMinutes > 0
        ) {
          dur = raw.durationMinutes;
        } else {
          issues.push({
            code: "TYPE_MISMATCH",
            path: "durationMinutes",
            message: "durationMinutes must be a positive integer",
          });
        }
      }
      let maxAtt: number | null = null;
      if (Object.hasOwn(raw, "maxAttempts")) {
        if (raw.maxAttempts === null) {
          maxAtt = null;
        } else if (
          typeof raw.maxAttempts === "number" &&
          Number.isInteger(raw.maxAttempts) &&
          raw.maxAttempts > 0
        ) {
          maxAtt = raw.maxAttempts;
        } else {
          issues.push({
            code: "TYPE_MISMATCH",
            path: "maxAttempts",
            message: "maxAttempts must be null or a positive integer",
          });
        }
      }
      let rel: ReleasePolicy = "immediate";
      if (Object.hasOwn(raw, "releasePolicy")) {
        if (
          raw.releasePolicy === "immediate" ||
          raw.releasePolicy === "after_deadline"
        ) {
          rel = raw.releasePolicy;
        } else {
          issues.push({
            code: "TYPE_MISMATCH",
            path: "releasePolicy",
            message: 'releasePolicy must be "immediate" or "after_deadline"',
          });
        }
      }
      let shufQ = false;
      let shufOpt = false;
      if (
        Object.hasOwn(raw, "shuffleQuestions") &&
        typeof raw.shuffleQuestions === "boolean"
      ) {
        shufQ = raw.shuffleQuestions;
      } else if (
        Object.hasOwn(raw, "shuffleSettings") &&
        isRecord(raw.shuffleSettings) &&
        typeof raw.shuffleSettings.questions === "boolean"
      ) {
        shufQ = raw.shuffleSettings.questions;
      }
      if (
        Object.hasOwn(raw, "shuffleOptions") &&
        typeof raw.shuffleOptions === "boolean"
      ) {
        shufOpt = raw.shuffleOptions;
      } else if (
        Object.hasOwn(raw, "shuffleSettings") &&
        isRecord(raw.shuffleSettings) &&
        typeof raw.shuffleSettings.options === "boolean"
      ) {
        shufOpt = raw.shuffleSettings.options;
      }
      finalSettings = {
        durationMinutes: dur,
        maxAttempts: maxAtt,
        releasePolicy: rel,
        shuffleQuestions: shufQ,
        shuffleOptions: shufOpt,
      };
    }

    // Assets handling
    const validatedAssets: Asset[] = [];
    if (Object.hasOwn(raw, "assets")) {
      if (!Array.isArray(raw.assets)) {
        issues.push({
          code: "TYPE_MISMATCH",
          path: "assets",
          message: "assets must be an array",
        });
      } else {
        const seenAssetIds = new Set<string>();
        for (let i = 0; i < raw.assets.length; i++) {
          const a = raw.assets[i];
          const aPath = `assets[${i}]`;
          if (!isRecord(a)) {
            issues.push({
              code: "TYPE_MISMATCH",
              path: aPath,
              message: "Asset must be an object",
            });
            continue;
          }
          if (typeof a.assetId !== "string" || a.assetId === "") {
            issues.push({
              code: "ID_EMPTY",
              path: `${aPath}.assetId`,
              message: "assetId must be a non-empty string",
            });
          } else if (seenAssetIds.has(a.assetId)) {
            issues.push({
              code: "ID_DUPLICATE",
              path: `${aPath}.assetId`,
              message: `Duplicate assetId: "${a.assetId}"`,
            });
          } else {
            seenAssetIds.add(a.assetId);
          }
          if (typeof a.mime !== "string") {
            issues.push({
              code: "TYPE_MISMATCH",
              path: `${aPath}.mime`,
              message: "mime must be a string",
            });
          } else if (!WHITELISTED_ASSET_MIMES.has(a.mime)) {
            issues.push({
              code: "ASSET_UNSAFE",
              path: `${aPath}.mime`,
              message: `MIME type "${a.mime}" is not in whitelist`,
            });
          }
          if (typeof a.data !== "string") {
            issues.push({
              code: "TYPE_MISMATCH",
              path: `${aPath}.data`,
              message: "data must be a string",
            });
          } else if (
            typeof a.mime === "string" &&
            isHostileDataUriOrContent(a.mime, a.data)
          ) {
            issues.push({
              code: "ASSET_UNSAFE",
              path: `${aPath}.data`,
              message: "Asset data contains hostile or executable script content",
            });
          }
          if (typeof a.alt !== "string") {
            issues.push({
              code: "TYPE_MISMATCH",
              path: `${aPath}.alt`,
              message: "alt must be a string",
            });
          }
          if (
            typeof a.assetId === "string" &&
            a.assetId !== "" &&
            typeof a.mime === "string" &&
            typeof a.data === "string" &&
            typeof a.alt === "string"
          ) {
            validatedAssets.push({
              assetId: a.assetId,
              mime: a.mime,
              data: a.data,
              alt: a.alt,
            });
          }
        }
      }
    }

    // Questions validation
    const validatedQuestions: WebQuestion[] = [];
    if (!Object.hasOwn(raw, "questions") || !Array.isArray(raw.questions)) {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "questions",
        message: "questions must be an array",
      });
    } else {
      if (raw.questions.length === 0) {
        issues.push({
          code: "EXAM_EMPTY",
          path: "questions",
          message: "questions must not be empty",
        });
      }
      if (raw.questions.length > MAX_QUESTIONS_PER_EXAM) {
        issues.push({
          code: "LIMIT_EXCEEDED",
          path: "questions",
          message: `questions length (${raw.questions.length}) exceeds maximum (${MAX_QUESTIONS_PER_EXAM})`,
        });
      }

      const seenQIds = new Set<string>();
      for (let i = 0; i < raw.questions.length; i++) {
        const q = raw.questions[i];
        const qPath = `questions[${i}]`;
        if (!isRecord(q)) {
          issues.push({
            code: "TYPE_MISMATCH",
            path: qPath,
            message: "Question must be an object",
          });
          continue;
        }

        // questionVersionId
        if (
          !Object.hasOwn(q, "questionVersionId") ||
          typeof q.questionVersionId !== "string"
        ) {
          issues.push({
            code: "TYPE_MISMATCH",
            path: `${qPath}.questionVersionId`,
            message: "questionVersionId must be a string",
          });
        } else if (q.questionVersionId === "") {
          issues.push({
            code: "ID_EMPTY",
            path: `${qPath}.questionVersionId`,
            message: "questionVersionId must not be empty",
          });
        } else if (seenQIds.has(q.questionVersionId)) {
          issues.push({
            code: "ID_DUPLICATE",
            path: `${qPath}.questionVersionId`,
            message: `Duplicate questionVersionId: "${q.questionVersionId}"`,
          });
        } else {
          seenQIds.add(q.questionVersionId);
        }

        // Hostile image path check
        if (typeof q.image === "string") {
          if (isHostilePath(q.image)) {
            issues.push({
              code: "ASSET_UNSAFE",
              path: `${qPath}.image`,
              message: `Hostile image path detected: "${q.image}"`,
            });
          }
        }
        if (typeof q.content === "string") {
          const match = q.content.match(/!\[.*?\]\((.*?)\)/);
          if (match && match[1] && isHostilePath(match[1])) {
            issues.push({
              code: "ASSET_UNSAFE",
              path: `${qPath}.content`,
              message: `Hostile image URL in content markdown: "${match[1]}"`,
            });
          }
        }

        // kind check
        if (!Object.hasOwn(q, "kind") || typeof q.kind !== "string") {
          issues.push({
            code: "TYPE_MISMATCH",
            path: `${qPath}.kind`,
            message: "kind must be a string",
          });
          continue;
        }
        if (q.kind !== "I" && q.kind !== "II" && q.kind !== "III") {
          issues.push({
            code: "QUESTION_KIND_UNKNOWN",
            path: `${qPath}.kind`,
            message: `Unknown question kind: "${q.kind}"`,
          });
          continue;
        }

        if (q.kind === "I") {
          if (!Object.hasOwn(q, "options") || !Array.isArray(q.options)) {
            issues.push({
              code: "TYPE_MISMATCH",
              path: `${qPath}.options`,
              message: "options must be an array",
            });
          } else {
            if (q.options.length !== 4) {
              issues.push({
                code: "I_OPTION_COUNT",
                path: `${qPath}.options`,
                message: `Part I question must have exactly 4 options, found ${q.options.length}`,
              });
            }
            const seenOptIds = new Set<string>();
            const validatedOptions: WebOption[] = [];
            for (let j = 0; j < q.options.length; j++) {
              const opt = q.options[j];
              const optPath = `${qPath}.options[${j}]`;
              if (!isRecord(opt)) {
                issues.push({
                  code: "TYPE_MISMATCH",
                  path: optPath,
                  message: "Option must be an object",
                });
                continue;
              }
              if (
                !Object.hasOwn(opt, "optionId") ||
                typeof opt.optionId !== "string"
              ) {
                issues.push({
                  code: "TYPE_MISMATCH",
                  path: `${optPath}.optionId`,
                  message: "optionId must be a string",
                });
              } else if (opt.optionId === "") {
                issues.push({
                  code: "ID_EMPTY",
                  path: `${optPath}.optionId`,
                  message: "optionId must not be empty",
                });
              } else if (seenOptIds.has(opt.optionId)) {
                issues.push({
                  code: "ID_DUPLICATE",
                  path: `${optPath}.optionId`,
                  message: `Duplicate optionId: "${opt.optionId}"`,
                });
              } else {
                seenOptIds.add(opt.optionId);
              }
              if (!Object.hasOwn(opt, "text") || typeof opt.text !== "string") {
                issues.push({
                  code: "TYPE_MISMATCH",
                  path: `${optPath}.text`,
                  message: "Option text must be a string",
                });
              }
              if (Object.hasOwn(opt, "label") && typeof opt.label !== "string") {
                issues.push({
                  code: "TYPE_MISMATCH",
                  path: `${optPath}.label`,
                  message: "Option label must be a string",
                });
              }
              if (
                typeof opt.optionId === "string" &&
                opt.optionId !== "" &&
                typeof opt.text === "string"
              ) {
                validatedOptions.push({
                  optionId: opt.optionId,
                  text: opt.text,
                  ...(typeof opt.label === "string" ? { label: opt.label } : {}),
                });
              }
            }
            if (
              !Object.hasOwn(q, "correctOptionId") ||
              typeof q.correctOptionId !== "string"
            ) {
              issues.push({
                code: "TYPE_MISMATCH",
                path: `${qPath}.correctOptionId`,
                message: "correctOptionId must be a string",
              });
            } else if (q.correctOptionId === "") {
              issues.push({
                code: "ID_EMPTY",
                path: `${qPath}.correctOptionId`,
                message: "correctOptionId must not be empty",
              });
            } else if (!seenOptIds.has(q.correctOptionId)) {
              issues.push({
                code: "I_KEY_NOT_IN_OPTIONS",
                path: `${qPath}.correctOptionId`,
                message: `correctOptionId "${q.correctOptionId}" not found in options`,
              });
            }

            if (
              typeof q.questionVersionId === "string" &&
              q.questionVersionId !== "" &&
              typeof q.correctOptionId === "string" &&
              validatedOptions.length === 4
            ) {
              const qObj: WebQuestion = {
                kind: "I",
                questionVersionId: q.questionVersionId,
                options: validatedOptions,
                correctOptionId: q.correctOptionId,
                ...extractContent(q),
              };
              validatedQuestions.push(qObj);
            }
          }
        } else if (q.kind === "II") {
          if (!Object.hasOwn(q, "statements") || !Array.isArray(q.statements)) {
            issues.push({
              code: "TYPE_MISMATCH",
              path: `${qPath}.statements`,
              message: "statements must be an array",
            });
          } else {
            if (q.statements.length !== 4) {
              issues.push({
                code: "II_STATEMENT_COUNT",
                path: `${qPath}.statements`,
                message: `Part II question must have exactly 4 statements, found ${q.statements.length}`,
              });
            }
            const seenStmtIds = new Set<string>();
            const validatedStatements: WebStatement[] = [];
            for (let j = 0; j < q.statements.length; j++) {
              const stmt = q.statements[j];
              const stmtPath = `${qPath}.statements[${j}]`;
              if (!isRecord(stmt)) {
                issues.push({
                  code: "TYPE_MISMATCH",
                  path: stmtPath,
                  message: "Statement must be an object",
                });
                continue;
              }
              if (
                !Object.hasOwn(stmt, "statementId") ||
                typeof stmt.statementId !== "string"
              ) {
                issues.push({
                  code: "TYPE_MISMATCH",
                  path: `${stmtPath}.statementId`,
                  message: "statementId must be a string",
                });
              } else if (stmt.statementId === "") {
                issues.push({
                  code: "ID_EMPTY",
                  path: `${stmtPath}.statementId`,
                  message: "statementId must not be empty",
                });
              } else if (seenStmtIds.has(stmt.statementId)) {
                issues.push({
                  code: "ID_DUPLICATE",
                  path: `${stmtPath}.statementId`,
                  message: `Duplicate statementId: "${stmt.statementId}"`,
                });
              } else {
                seenStmtIds.add(stmt.statementId);
              }
              if (!Object.hasOwn(stmt, "text") || typeof stmt.text !== "string") {
                issues.push({
                  code: "TYPE_MISMATCH",
                  path: `${stmtPath}.text`,
                  message: "Statement text must be a string",
                });
              }
              if (
                !Object.hasOwn(stmt, "answer") ||
                typeof stmt.answer !== "boolean"
              ) {
                issues.push({
                  code: "II_ANSWER_NOT_BOOLEAN",
                  path: `${stmtPath}.answer`,
                  message: "Statement answer must be a boolean (true or false)",
                });
              }
              if (Object.hasOwn(stmt, "label") && typeof stmt.label !== "string") {
                issues.push({
                  code: "TYPE_MISMATCH",
                  path: `${stmtPath}.label`,
                  message: "Statement label must be a string",
                });
              }
              if (
                Object.hasOwn(stmt, "explanation") &&
                typeof stmt.explanation !== "string"
              ) {
                issues.push({
                  code: "TYPE_MISMATCH",
                  path: `${stmtPath}.explanation`,
                  message: "Statement explanation must be a string",
                });
              }
              if (
                typeof stmt.statementId === "string" &&
                stmt.statementId !== "" &&
                typeof stmt.text === "string" &&
                typeof stmt.answer === "boolean"
              ) {
                validatedStatements.push({
                  statementId: stmt.statementId,
                  text: stmt.text,
                  answer: stmt.answer,
                  ...(typeof stmt.label === "string" ? { label: stmt.label } : {}),
                  ...(typeof stmt.explanation === "string"
                    ? { explanation: stmt.explanation }
                    : {}),
                });
              }
            }

            if (
              typeof q.questionVersionId === "string" &&
              q.questionVersionId !== "" &&
              validatedStatements.length === 4
            ) {
              const qObj: WebQuestion = {
                kind: "II",
                questionVersionId: q.questionVersionId,
                statements: validatedStatements,
                ...extractContent(q),
              };
              validatedQuestions.push(qObj);
            }
          }
        } else if (q.kind === "III") {
          if (
            !Object.hasOwn(q, "answerKey") ||
            typeof q.answerKey !== "string"
          ) {
            issues.push({
              code: "TYPE_MISMATCH",
              path: `${qPath}.answerKey`,
              message: "answerKey must be a string",
            });
          } else {
            const saIssues = checkShortAnswer(q.answerKey);
            if (saIssues.length > 0) {
              issues.push({
                code: "III_KEY_INVALID",
                path: `${qPath}.answerKey`,
                message: `Invalid answerKey: issues [${saIssues.join(", ")}]`,
              });
            }
            if (
              typeof q.questionVersionId === "string" &&
              q.questionVersionId !== ""
            ) {
              const qObj: WebQuestion = {
                kind: "III",
                questionVersionId: q.questionVersionId,
                answerKey: q.answerKey,
                ...extractContent(q),
              };
              validatedQuestions.push(qObj);
            }
          }
        }
      }
    }

    // Call validateExamVersion on domain projection
    if (
      finalSettings &&
      validatedQuestions.length ===
        (Array.isArray(raw.questions) ? raw.questions.length : -1) &&
      typeof raw.examId === "string" &&
      typeof raw.examVersionId === "string" &&
      typeof raw.ruleSetId === "string" &&
      typeof raw.inputPolicyId === "string"
    ) {
      const domainVal = validateExamVersion({
        examId: raw.examId,
        examVersionId: raw.examVersionId,
        ruleSetId: raw.ruleSetId,
        inputPolicyId: raw.inputPolicyId,
        questions: validatedQuestions.map((q) => {
          if (q.kind === "I") {
            return {
              kind: "I",
              questionVersionId: q.questionVersionId,
              options: q.options.map((o) => ({ optionId: o.optionId })),
              correctOptionId: q.correctOptionId,
            };
          }
          if (q.kind === "II") {
            return {
              kind: "II",
              questionVersionId: q.questionVersionId,
              statements: q.statements.map((s) => ({
                statementId: s.statementId,
                answer: s.answer,
              })),
            };
          }
          return {
            kind: "III",
            questionVersionId: q.questionVersionId,
            answerKey: q.answerKey,
          };
        }),
      });

      if (!domainVal.ok) {
        for (const iss of domainVal.issues) {
          if (!issues.some((x) => x.path === iss.path && x.code === iss.code)) {
            issues.push(iss);
          }
        }
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    const webExam: WebExam = {
      schemaVersion: "web-exam-v1",
      examId: raw.examId as string,
      examVersionId: raw.examVersionId as string,
      title: raw.title as string,
      subject: raw.subject as string,
      grade: raw.grade as 10 | 11 | 12,
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      settings: finalSettings!,
      questions: validatedQuestions,
      assets: validatedAssets,
    };

    return { ok: true, value: deepFreeze(webExam) };
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          code: "TYPE_MISMATCH",
          path: "",
          message: safeErrorMessage(err),
        },
      ],
    };
  }
}

export function toDomainExam(exam: WebExam): ExamVersion {
  const domainExam: ExamVersion = {
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions: exam.questions.map((q) => {
      if (q.kind === "I") {
        return {
          ...q,
          kind: "I",
          questionVersionId: q.questionVersionId,
          options: q.options.map((opt) => ({
            ...opt,
            optionId: opt.optionId,
          })),
          correctOptionId: q.correctOptionId,
        };
      }
      if (q.kind === "II") {
        return {
          ...q,
          kind: "II",
          questionVersionId: q.questionVersionId,
          statements: q.statements.map((stmt) => ({
            ...stmt,
            statementId: stmt.statementId,
            answer: stmt.answer,
          })),
        };
      }
      return {
        ...q,
        kind: "III",
        questionVersionId: q.questionVersionId,
        answerKey: q.answerKey,
      };
    }),
  };
  return deepFreeze(domainExam);
}

export function exportExam(exam: WebExam): string {
  const canonical = {
    schemaVersion: "web-exam-v1" as const,
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    title: exam.title,
    subject: exam.subject,
    grade: exam.grade,
    ruleSetId: "custom-v1" as const,
    inputPolicyId: "sa-charset-v1" as const,
    settings: {
      durationMinutes: exam.settings.durationMinutes,
      maxAttempts: exam.settings.maxAttempts,
      releasePolicy: exam.settings.releasePolicy,
      shuffleQuestions: exam.settings.shuffleQuestions,
      shuffleOptions: exam.settings.shuffleOptions,
    },
    questions: exam.questions.map((q) => {
      const common = {
        questionVersionId: q.questionVersionId,
        ...(q.questionId !== undefined ? { questionId: q.questionId } : {}),
        ...(q.title !== undefined ? { title: q.title } : {}),
        ...(q.content !== undefined ? { content: q.content } : {}),
        ...(q.image !== undefined ? { image: q.image } : {}),
        ...(q.explanation !== undefined ? { explanation: q.explanation } : {}),
        ...(q.subject !== undefined ? { subject: q.subject } : {}),
        ...(q.grade !== undefined ? { grade: q.grade } : {}),
        ...(q.topic !== undefined ? { topic: q.topic } : {}),
        ...(q.lesson !== undefined ? { lesson: q.lesson } : {}),
        ...(q.difficulty !== undefined ? { difficulty: q.difficulty } : {}),
        ...(q.blocks !== undefined ? { blocks: q.blocks } : {}),
        ...(q.provenance !== undefined ? { provenance: q.provenance } : {}),
      };
      if (q.kind === "I") {
        return {
          kind: "I" as const,
          ...common,
          options: q.options.map((opt) => ({
            optionId: opt.optionId,
            ...(opt.label !== undefined ? { label: opt.label } : {}),
            text: opt.text,
          })),
          correctOptionId: q.correctOptionId,
        };
      }
      if (q.kind === "II") {
        return {
          kind: "II" as const,
          ...common,
          statements: q.statements.map((stmt) => ({
            statementId: stmt.statementId,
            ...(stmt.label !== undefined ? { label: stmt.label } : {}),
            text: stmt.text,
            answer: stmt.answer,
            ...(stmt.explanation !== undefined
              ? { explanation: stmt.explanation }
              : {}),
          })),
        };
      }
      return {
        kind: "III" as const,
        ...common,
        answerKey: q.answerKey,
      };
    }),
    assets: exam.assets.map((a) => ({
      assetId: a.assetId,
      mime: a.mime,
      data: a.data,
      alt: a.alt,
    })),
  };
  return JSON.stringify(canonical, null, 2);
}

export function validateImportDraft(
  draft: ImportDraft
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(draft)) {
    return [
      {
        code: "TYPE_MISMATCH",
        path: "",
        message: "ImportDraft must be an object",
      },
    ];
  }

  // draftId
  if (!Object.hasOwn(draft, "draftId") || typeof draft.draftId !== "string") {
    issues.push({
      code: "TYPE_MISMATCH",
      path: "draftId",
      message: "draftId must be a string",
    });
  } else if (draft.draftId === "") {
    issues.push({
      code: "ID_EMPTY",
      path: "draftId",
      message: "draftId must not be empty",
    });
  }

  // provenance
  if (!Object.hasOwn(draft, "provenance") || !isRecord(draft.provenance)) {
    issues.push({
      code: "TYPE_MISMATCH",
      path: "provenance",
      message: "provenance must be an object",
    });
  } else {
    const prov = draft.provenance;
    if (typeof prov.sourceId !== "string" || prov.sourceId === "") {
      issues.push({
        code: "ID_EMPTY",
        path: "provenance.sourceId",
        message: "provenance.sourceId must be a non-empty string",
      });
    }
    if (typeof prov.location !== "string") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "provenance.location",
        message: "provenance.location must be a string",
      });
    }
    if (!Array.isArray(prov.flags)) {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "provenance.flags",
        message: "provenance.flags must be an array",
      });
    }
  }

  // question
  if (!Object.hasOwn(draft, "question") || !isRecord(draft.question)) {
    issues.push({
      code: "TYPE_MISMATCH",
      path: "question",
      message: "question must be an object",
    });
    return issues;
  }
  const q = draft.question;

  // questionVersionId
  if (Object.hasOwn(q, "questionVersionId")) {
    if (typeof q.questionVersionId !== "string") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "question.questionVersionId",
        message: "questionVersionId must be a string",
      });
    } else if (q.questionVersionId === "") {
      issues.push({
        code: "ID_EMPTY",
        path: "question.questionVersionId",
        message: "questionVersionId must not be empty",
      });
    }
  } else {
    issues.push({
      code: "TYPE_MISMATCH",
      path: "question.questionVersionId",
      message: "questionVersionId must be provided",
    });
  }

  // hostile image check
  if (typeof q.image === "string" && isHostilePath(q.image)) {
    issues.push({
      code: "ASSET_UNSAFE",
      path: "question.image",
      message: `Hostile image path detected: "${q.image}"`,
    });
  }

  // kind
  if (!Object.hasOwn(q, "kind") || typeof q.kind !== "string") {
    issues.push({
      code: "TYPE_MISMATCH",
      path: "question.kind",
      message: "kind must be a string",
    });
    return issues;
  }
  if (q.kind !== "I" && q.kind !== "II" && q.kind !== "III") {
    issues.push({
      code: "QUESTION_KIND_UNKNOWN",
      path: "question.kind",
      message: `Unknown question kind: "${q.kind}"`,
    });
    return issues;
  }

  if (q.kind === "I") {
    if (!Object.hasOwn(q, "options") || !Array.isArray(q.options)) {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "question.options",
        message: "options must be an array",
      });
    } else {
      if (q.options.length !== 4) {
        issues.push({
          code: "I_OPTION_COUNT",
          path: "question.options",
          message: `Part I question must have exactly 4 options, found ${q.options.length}`,
        });
      }
      const seenOptIds = new Set<string>();
      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        const optPath = `question.options[${j}]`;
        if (!isRecord(opt)) {
          issues.push({
            code: "TYPE_MISMATCH",
            path: optPath,
            message: "Option must be an object",
          });
          continue;
        }
        if (typeof opt.optionId !== "string" || opt.optionId === "") {
          issues.push({
            code: "ID_EMPTY",
            path: `${optPath}.optionId`,
            message: "optionId must be a non-empty string",
          });
        } else if (seenOptIds.has(opt.optionId)) {
          issues.push({
            code: "ID_DUPLICATE",
            path: `${optPath}.optionId`,
            message: `Duplicate optionId: "${opt.optionId}"`,
          });
        } else {
          seenOptIds.add(opt.optionId);
        }
        if (typeof opt.text !== "string") {
          issues.push({
            code: "TYPE_MISMATCH",
            path: `${optPath}.text`,
            message: "Option text must be a string",
          });
        }
      }
      if (
        !Object.hasOwn(q, "correctOptionId") ||
        q.correctOptionId === undefined ||
        q.correctOptionId === null ||
        q.correctOptionId === ""
      ) {
        issues.push({
          code: "IMPORT_KEY_MISSING",
          path: "question.correctOptionId",
          message: "Part I question is missing correctOptionId",
        });
      } else if (typeof q.correctOptionId !== "string") {
        issues.push({
          code: "TYPE_MISMATCH",
          path: "question.correctOptionId",
          message: "correctOptionId must be a string",
        });
      } else if (!seenOptIds.has(q.correctOptionId)) {
        issues.push({
          code: "I_KEY_NOT_IN_OPTIONS",
          path: "question.correctOptionId",
          message: `correctOptionId "${q.correctOptionId}" not found in options`,
        });
      }
    }
  } else if (q.kind === "II") {
    if (!Object.hasOwn(q, "statements") || !Array.isArray(q.statements)) {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "question.statements",
        message: "statements must be an array",
      });
    } else {
      if (q.statements.length !== 4) {
        issues.push({
          code: "II_STATEMENT_COUNT",
          path: "question.statements",
          message: `Part II question must have exactly 4 statements, found ${q.statements.length}`,
        });
      }
      const seenStmtIds = new Set<string>();
      for (let j = 0; j < q.statements.length; j++) {
        const stmt = q.statements[j];
        const stmtPath = `question.statements[${j}]`;
        if (!isRecord(stmt)) {
          issues.push({
            code: "TYPE_MISMATCH",
            path: stmtPath,
            message: "Statement must be an object",
          });
          continue;
        }
        if (typeof stmt.statementId !== "string" || stmt.statementId === "") {
          issues.push({
            code: "ID_EMPTY",
            path: `${stmtPath}.statementId`,
            message: "statementId must be a non-empty string",
          });
        } else if (seenStmtIds.has(stmt.statementId)) {
          issues.push({
            code: "ID_DUPLICATE",
            path: `${stmtPath}.statementId`,
            message: `Duplicate statementId: "${stmt.statementId}"`,
          });
        } else {
          seenStmtIds.add(stmt.statementId);
        }
        if (typeof stmt.text !== "string") {
          issues.push({
            code: "TYPE_MISMATCH",
            path: `${stmtPath}.text`,
            message: "Statement text must be a string",
          });
        }
        if (
          !Object.hasOwn(stmt, "answer") ||
          stmt.answer === undefined ||
          stmt.answer === null
        ) {
          issues.push({
            code: "IMPORT_KEY_MISSING",
            path: `${stmtPath}.answer`,
            message: "Statement is missing boolean answer key",
          });
        } else if (typeof stmt.answer !== "boolean") {
          issues.push({
            code: "II_ANSWER_NOT_BOOLEAN",
            path: `${stmtPath}.answer`,
            message: "Statement answer must be a boolean",
          });
        }
      }
    }
  } else if (q.kind === "III") {
    if (
      !Object.hasOwn(q, "answerKey") ||
      q.answerKey === undefined ||
      q.answerKey === null ||
      q.answerKey === ""
    ) {
      issues.push({
        code: "IMPORT_KEY_MISSING",
        path: "question.answerKey",
        message: "Part III question is missing answerKey",
      });
    } else if (typeof q.answerKey !== "string") {
      issues.push({
        code: "TYPE_MISMATCH",
        path: "question.answerKey",
        message: "answerKey must be a string",
      });
    } else {
      const saIssues = checkShortAnswer(q.answerKey);
      if (saIssues.length > 0) {
        issues.push({
          code: "III_KEY_INVALID",
          path: "question.answerKey",
          message: `Invalid answerKey: issues [${saIssues.join(", ")}]`,
        });
      }
    }
  }

  return issues;
}
