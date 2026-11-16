import type {
  Id,
  Response,
  ResponseI,
  ResponseII,
  ResponseIII,
  StatementAnswer,
  ExamVersion,
} from "../domain/index.ts";

import {
  createPresentationOrder,
  validatePresentationOrder,
  scoreAttempt,
  scoreResultToDTO,
  validateExamVersion,
} from "../domain/index.ts";

import type {
  WebExam,
  AttemptKey,
  AttemptRecord,
  StoragePort,
  StudentController,
  StudentControllerDeps,
  StudentStartOptions,
  WebEvent,
  Result,
  WebError,
} from "./types.ts";

export type {
  StudentController,
  StudentControllerDeps,
  StudentStartOptions,
  AttemptKey,
  AttemptRecord,
  WebExam,
  StoragePort,
  WebEvent,
  Result,
  WebError,
} from "./types.ts";

function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepClone(item)) as unknown as T;
  }
  const cloned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    cloned[key] = deepClone(val);
  }
  return cloned as T;
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (!Object.isFrozen(obj)) {
    Object.freeze(obj);
  }
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export function toDomainExam(exam: WebExam): ExamVersion {
  return {
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    questions: exam.questions.map((q) => {
      if (q.kind === "I") {
        return {
          kind: "I",
          questionVersionId: q.questionVersionId,
          options: q.options.map((opt) => ({ optionId: opt.optionId })),
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
  };
}

class StudentControllerImpl implements StudentController {
  private currentRecord: AttemptRecord;
  private readonly deps: StudentControllerDeps;
  private readonly listeners = new Set<(event: WebEvent) => void>();
  private lastSeenTime: number;
  private isDisposed = false;
  private opChain: Promise<unknown> = Promise.resolve();
  private submitPromise: Promise<Result<AttemptRecord>> | null = null;

  constructor(initialRecord: AttemptRecord, deps: StudentControllerDeps) {
    this.currentRecord = deepFreeze(deepClone(initialRecord));
    this.deps = deps;
    this.lastSeenTime = deps.now();
  }

  private enqueueOp<T>(op: () => Promise<T>): Promise<T> {
    const run = () => op();
    const result = this.opChain.then(run, run);
    this.opChain = result.catch(() => {});
    return result;
  }

  getSnapshot(): AttemptRecord {
    return this.currentRecord;
  }

  subscribe(listener: (event: WebEvent) => void): () => void {
    if (this.isDisposed) {
      return () => {};
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.isDisposed = true;
    this.listeners.clear();
  }

  private notifyListeners(event: WebEvent): void {
    if (this.isDisposed) return;
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(event);
      } catch {
        // Ignore listener error
      }
    }
  }

  private checkClock(): void {
    const currentTime = this.deps.now();
    if (currentTime < this.lastSeenTime) {
      this.notifyListeners({
        type: "error",
        error: {
          code: "CLOCK_CHANGED",
          path: "clock",
          message: "Clock rollback detected",
          recoverable: true,
        },
      });
    } else {
      this.lastSeenTime = currentTime;
    }
  }

  async answer(response: Response): Promise<Result<AttemptRecord>> {
    return this.enqueueOp(async () => {
      if (this.isDisposed) {
        return {
          ok: false,
          error: {
            code: "CONTROLLER_DISPOSED",
            path: "controller",
            message: "Controller has been disposed",
            recoverable: false,
          },
        };
      }

      if (this.currentRecord.phase === "final") {
        return {
          ok: false,
          error: {
            code: "ATTEMPT_FINALIZED",
            path: "phase",
            message: "Attempt has already been finalized",
            recoverable: false,
          },
        };
      }

      this.checkClock();
      const currentTime = this.deps.now();

      // Check deadline
      if (currentTime >= this.currentRecord.deadline) {
        await this.internalSubmit("deadline");
        return {
          ok: false,
          error: {
            code: "ATTEMPT_FINALIZED",
            path: "deadline",
            message: "Deadline exceeded; attempt auto-submitted",
            recoverable: false,
          },
        };
      }

      // Validate question exists in exam snapshot
      const targetQuestion = this.currentRecord.examSnapshot.questions.find(
        (q) => q.questionVersionId === response.questionVersionId
      );
      if (!targetQuestion) {
        return {
          ok: false,
          error: {
            code: "QUESTION_NOT_FOUND",
            path: "response.questionVersionId",
            message: `Question "${response.questionVersionId}" not found in exam`,
            recoverable: false,
          },
        };
      }

      if (targetQuestion.kind !== response.kind) {
        return {
          ok: false,
          error: {
            code: "RESPONSE_KIND_MISMATCH",
            path: "response.kind",
            message: `Response kind "${response.kind}" does not match question kind "${targetQuestion.kind}"`,
            recoverable: false,
          },
        };
      }

      // Normalize response: preserve exact raw III without trimming, handle nulls for II
      let normalized: Response;
      if (response.kind === "I") {
        normalized = {
          kind: "I",
          questionVersionId: response.questionVersionId,
          selectedOptionId: response.selectedOptionId ?? null,
        };
      } else if (response.kind === "II") {
        const rawAnswers = (response as any).answers ?? (response as any).statements ?? [];
        const answers: StatementAnswer[] = rawAnswers.map((a: any) => ({
          statementId: a.statementId,
          value: a.value !== undefined ? a.value : (a.answer !== undefined ? a.answer : null),
        }));
        normalized = {
          kind: "II",
          questionVersionId: response.questionVersionId,
          answers,
        };
      } else {
        normalized = {
          kind: "III",
          questionVersionId: response.questionVersionId,
          raw: response.raw !== undefined ? response.raw : null,
        };
      }

      const currentResponses = [...this.currentRecord.responses.responses];
      const idx = currentResponses.findIndex(
        (r) => r.questionVersionId === normalized.questionVersionId
      );
      if (idx >= 0) {
        currentResponses[idx] = normalized;
      } else {
        currentResponses.push(normalized);
      }

      const nextRevision = this.currentRecord.revision + 1;
      const newRecord: AttemptRecord = deepFreeze({
        ...this.currentRecord,
        revision: nextRevision,
        responses: deepFreeze({
          attemptId: this.currentRecord.attemptId,
          examVersionId: this.currentRecord.examVersionId,
          responses: currentResponses,
        }),
      });

      const saveResult = await this.deps.storage.saveDraft(newRecord, this.currentRecord.revision);
      if (!saveResult.ok) {
        if (saveResult.error.code === "STORAGE_CONFLICT") {
          const latest = await this.deps.storage.load(this.currentRecord);
          if (latest.ok && latest.value && latest.value.phase === "final") {
            this.currentRecord = deepFreeze(latest.value);
            this.notifyListeners({ type: "attempt_finalized", record: this.currentRecord });
            return {
              ok: false,
              error: {
                code: "ATTEMPT_FINALIZED",
                path: "phase",
                message: "Attempt finalized by another session",
                recoverable: false,
              },
            };
          }
          this.notifyListeners({
            type: "storage_conflict",
            key: this.currentRecord,
            revision: latest.ok && latest.value ? latest.value.revision : this.currentRecord.revision,
          });
        } else {
          this.notifyListeners({
            type: "error",
            error: saveResult.error,
          });
        }
        return saveResult;
      }

      this.currentRecord = deepFreeze(saveResult.value);
      this.notifyListeners({ type: "attempt_changed", record: this.currentRecord });
      return { ok: true, value: this.currentRecord };
    });
  }

  async rename(raw: string): Promise<Result<AttemptRecord>> {
    return this.enqueueOp(async () => {
      if (this.isDisposed) {
        return {
          ok: false,
          error: {
            code: "CONTROLLER_DISPOSED",
            path: "controller",
            message: "Controller has been disposed",
            recoverable: false,
          },
        };
      }

      if (this.currentRecord.phase === "final") {
        return {
          ok: false,
          error: {
            code: "ATTEMPT_FINALIZED",
            path: "phase",
            message: "Attempt has already been finalized",
            recoverable: false,
          },
        };
      }

      this.checkClock();
      const currentTime = this.deps.now();

      if (currentTime >= this.currentRecord.deadline) {
        await this.internalSubmit("deadline");
        return {
          ok: false,
          error: {
            code: "ATTEMPT_FINALIZED",
            path: "deadline",
            message: "Deadline exceeded; attempt auto-submitted",
            recoverable: false,
          },
        };
      }

      const nextRevision = this.currentRecord.revision + 1;
      const newRecord: AttemptRecord = deepFreeze({
        ...this.currentRecord,
        revision: nextRevision,
        candidateName: raw,
      });

      const saveResult = await this.deps.storage.saveDraft(newRecord, this.currentRecord.revision);
      if (!saveResult.ok) {
        if (saveResult.error.code === "STORAGE_CONFLICT") {
          const latest = await this.deps.storage.load(this.currentRecord);
          if (latest.ok && latest.value && latest.value.phase === "final") {
            this.currentRecord = deepFreeze(latest.value);
            this.notifyListeners({ type: "attempt_finalized", record: this.currentRecord });
            return {
              ok: false,
              error: {
                code: "ATTEMPT_FINALIZED",
                path: "phase",
                message: "Attempt finalized by another session",
                recoverable: false,
              },
            };
          }
          this.notifyListeners({
            type: "storage_conflict",
            key: this.currentRecord,
            revision: latest.ok && latest.value ? latest.value.revision : this.currentRecord.revision,
          });
        } else {
          this.notifyListeners({
            type: "error",
            error: saveResult.error,
          });
        }
        return saveResult;
      }

      this.currentRecord = deepFreeze(saveResult.value);
      this.notifyListeners({ type: "attempt_changed", record: this.currentRecord });
      return { ok: true, value: this.currentRecord };
    });
  }

  async submit(reason: "manual" | "deadline"): Promise<Result<AttemptRecord>> {
    if (this.isDisposed) {
      return {
        ok: false,
        error: {
          code: "CONTROLLER_DISPOSED",
          path: "controller",
          message: "Controller has been disposed",
          recoverable: false,
        },
      };
    }
    if (this.currentRecord.phase === "final") {
      return { ok: true, value: this.currentRecord };
    }
    if (this.submitPromise) {
      return this.submitPromise;
    }
    return this.enqueueOp(() => this.internalSubmit(reason));
  }

  private async internalSubmit(reason: "manual" | "deadline"): Promise<Result<AttemptRecord>> {
    if (this.isDisposed) {
      return {
        ok: false,
        error: {
          code: "CONTROLLER_DISPOSED",
          path: "controller",
          message: "Controller has been disposed",
          recoverable: false,
        },
      };
    }

    if (this.currentRecord.phase === "final") {
      return { ok: true, value: this.currentRecord };
    }

    if (this.submitPromise) {
      return this.submitPromise;
    }

    this.submitPromise = (async () => {
      try {
        this.checkClock();
        const currentTime = this.deps.now();

        // Calculate score through domain barrel scoreAttempt
        const domainExam = toDomainExam(this.currentRecord.examSnapshot);
        let scoreDTO: unknown;
        try {
          const scoreResult = scoreAttempt(domainExam, this.currentRecord.responses);
          scoreDTO = scoreResultToDTO(scoreResult);
        } catch (err: unknown) {
          return {
            ok: false,
            error: {
              code: "SCORE_ERROR",
              path: "score",
              message: err instanceof Error ? err.message : String(err),
              recoverable: false,
            },
          };
        }

        const nextRevision = this.currentRecord.revision + 1;
        const finalRecord: AttemptRecord = deepFreeze({
          ...this.currentRecord,
          revision: nextRevision,
          phase: "final",
          submittedAt: currentTime,
          scoreDTO,
        });

        let finalizeResult = await this.deps.storage.finalize(
          finalRecord,
          this.currentRecord.revision
        );

        // Robust retry loop for draft/finalize races: adopt latest draft and retry finalize
        for (
          let attempt = 0;
          attempt < 3 && !finalizeResult.ok && finalizeResult.error.code === "STORAGE_CONFLICT";
          attempt++
        ) {
          const latest = await this.deps.storage.load(this.currentRecord);
          if (!latest.ok || !latest.value) break;
          if (latest.value.phase === "final") {
            this.currentRecord = deepFreeze(latest.value);
            this.notifyListeners({ type: "attempt_finalized", record: this.currentRecord });
            return { ok: true, value: this.currentRecord };
          }
          // Adopt latest draft state and retry finalize with fresh scoreDTO
          this.currentRecord = deepFreeze(latest.value);
          const retryDomainExam = toDomainExam(this.currentRecord.examSnapshot);
          let retryScoreDTO: unknown;
          try {
            const scoreResult = scoreAttempt(retryDomainExam, this.currentRecord.responses);
            retryScoreDTO = scoreResultToDTO(scoreResult);
          } catch (err: unknown) {
            return {
              ok: false,
              error: {
                code: "SCORE_ERROR",
                path: "score",
                message: err instanceof Error ? err.message : String(err),
                recoverable: false,
              },
            };
          }
          const retryFinalRecord: AttemptRecord = deepFreeze({
            ...this.currentRecord,
            revision: this.currentRecord.revision + 1,
            phase: "final",
            submittedAt: currentTime,
            scoreDTO: retryScoreDTO,
          });
          finalizeResult = await this.deps.storage.finalize(
            retryFinalRecord,
            this.currentRecord.revision
          );
        }

        if (!finalizeResult.ok) {
          if (finalizeResult.error.code === "STORAGE_CONFLICT") {
            const latest = await this.deps.storage.load(this.currentRecord);
            if (latest.ok && latest.value && latest.value.phase === "final") {
              this.currentRecord = deepFreeze(latest.value);
              this.notifyListeners({ type: "attempt_finalized", record: this.currentRecord });
              return { ok: true, value: this.currentRecord };
            }
            this.notifyListeners({
              type: "storage_conflict",
              key: this.currentRecord,
              revision: latest.ok && latest.value ? latest.value.revision : this.currentRecord.revision,
            });
          } else {
            this.notifyListeners({
              type: "error",
              error: finalizeResult.error,
            });
          }
          return finalizeResult;
        }

        this.currentRecord = deepFreeze(finalizeResult.value);
        this.notifyListeners({ type: "attempt_finalized", record: this.currentRecord });
        return { ok: true, value: this.currentRecord };
      } finally {
        this.submitPromise = null;
      }
    })();

    return this.submitPromise;
  }

  async checkDeadline(): Promise<Result<AttemptRecord>> {
    return this.enqueueOp(async () => {
      if (this.isDisposed) {
        return {
          ok: false,
          error: {
            code: "CONTROLLER_DISPOSED",
            path: "controller",
            message: "Controller has been disposed",
            recoverable: false,
          },
        };
      }
      if (this.currentRecord.phase === "final") {
        return { ok: true, value: this.currentRecord };
      }
      this.checkClock();
      if (this.deps.now() >= this.currentRecord.deadline) {
        return this.internalSubmit("deadline");
      }
      return { ok: true, value: this.currentRecord };
    });
  }

  async listHistory(): Promise<Result<readonly AttemptRecord[]>> {
    return this.deps.storage.listAttempts(
      this.currentRecord.examId,
      this.currentRecord.examVersionId
    );
  }
}

export async function listAttemptHistory(
  examId: string,
  examVersionId: string,
  storage: StoragePort
): Promise<Result<readonly AttemptRecord[]>> {
  return storage.listAttempts(examId, examVersionId);
}

export async function startAttempt(
  exam: WebExam,
  candidateName: string,
  deps: StudentControllerDeps,
  options?: StudentStartOptions
): Promise<Result<StudentController>> {
  const domainExam = toDomainExam(exam);
  const examValidation = validateExamVersion(domainExam);
  if (!examValidation.ok) {
    return {
      ok: false,
      error: {
        code: "EXAM_INVALID",
        path: "exam",
        message: `Invalid exam: ${examValidation.issues.map((i) => i.message).join("; ")}`,
        recoverable: false,
      },
    };
  }

  // Local advisory limit check (WEB-contract.md §6, §9, §11)
  const maxAttempts = exam.settings.maxAttempts;
  const bypassLimit = options?.bypassAdvisoryLimit ?? deps.bypassAdvisoryLimit ?? false;
  if (typeof maxAttempts === "number" && maxAttempts >= 0 && !bypassLimit) {
    const listRes = await deps.storage.listAttempts(exam.examId, exam.examVersionId);
    if (listRes.ok && listRes.value.length >= maxAttempts) {
      return {
        ok: false,
        error: {
          code: "ATTEMPT_LIMIT_LOCAL",
          path: "settings.maxAttempts",
          message: `Đã đạt giới hạn số lượt làm bài tối đa (${maxAttempts} lượt) cho đề thi này (advisory local).`,
          recoverable: false,
        },
      };
    }
  }

  const attemptId = options?.attemptId ?? deps.attemptId ?? deps.id();
  const order = createPresentationOrder(
    domainExam,
    {
      shuffleQuestions: exam.settings.shuffleQuestions,
      shuffleOptions: exam.settings.shuffleOptions,
    },
    attemptId
  );

  const orderIssues = validatePresentationOrder(domainExam, order);
  if (orderIssues.length > 0) {
    return {
      ok: false,
      error: {
        code: "ORDER_INVALID",
        path: "presentationOrder",
        message: `Generated presentation order is invalid: ${orderIssues.map((i) => i.message).join("; ")}`,
        recoverable: false,
      },
    };
  }

  const startedAt = deps.now();
  const durationMs = exam.settings.durationMinutes * 60 * 1000;
  const deadline = startedAt + durationMs;

  const initialRecord: AttemptRecord = deepFreeze({
    schemaVersion: "web-attempt-v1",
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    attemptId,
    revision: 1,
    candidateName,
    examSnapshot: deepFreeze(deepClone(exam)),
    presentationOrder: deepFreeze(deepClone(order)),
    responses: deepFreeze({
      attemptId,
      examVersionId: exam.examVersionId,
      responses: [],
    }),
    startedAt,
    deadline,
    phase: "draft",
    submittedAt: null,
    scoreDTO: null,
  });

  const createResult = await deps.storage.create(initialRecord);
  if (!createResult.ok) {
    return createResult;
  }

  const controller = new StudentControllerImpl(createResult.value, deps);
  return { ok: true, value: controller };
}

export async function resumeAttempt(
  key: AttemptKey,
  deps: { storage: StoragePort; now: () => number; id: () => string }
): Promise<Result<StudentController>> {
  const loadResult = await deps.storage.load(key);
  if (!loadResult.ok) {
    return loadResult;
  }
  if (!loadResult.value) {
    return {
      ok: false,
      error: {
        code: "ATTEMPT_NOT_FOUND",
        path: "key",
        message: "Attempt not found",
        recoverable: false,
      },
    };
  }

  const record = deepFreeze(loadResult.value);
  const domainExam = toDomainExam(record.examSnapshot);
  const orderIssues = validatePresentationOrder(domainExam, record.presentationOrder);
  if (orderIssues.length > 0) {
    return {
      ok: false,
      error: {
        code: "ORDER_INVALID",
        path: "presentationOrder",
        message: `Stored presentation order is invalid: ${orderIssues.map((i) => i.message).join("; ")}`,
        recoverable: false,
      },
    };
  }

  const controller = new StudentControllerImpl(record, deps);

  // LC28-F01: Hydrate saved nickname before overdue autosubmit
  if (record.phase === "draft" && deps.now() >= record.deadline) {
    const subResult = await controller.submit("deadline");
    if (!subResult.ok) {
      return subResult;
    }
  }

  return { ok: true, value: controller };
}

export * from "./area.ts";
export * from "./view.ts";

