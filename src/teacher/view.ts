/// <reference lib="dom" />

/**
 * Cunata Web M3: Teacher Exam Builder, Preview and Explicit Settings View.
 * Conforms to WEB-contract.md §4, §5, §9, §12 and Shared Product Contract v2.0.
 *
 * Implements accessible builder forms around W1 draft APIs:
 * - Subject / grade / taxonomy / content / options / statements / raw key / explanation
 * - Independent section toggles and live score preview via domain computeExamMax
 * - Question reordering, duplication with key remapping, and removal
 * - Explicit settings (durationMinutes, maxAttempts, releasePolicy, shuffles)
 * - Accessible path validation and focusable error summary
 * - Candidate preview mode before explicit publish
 * - JSON import and export through schema with strict copy isolation
 * - AC: No fake authentication and no hidden-key guarantee while D08 remains open
 */

import {
  computeExamMax,
  rational,
  toFractionString,
  checkShortAnswer,
  validateExamVersion,
} from "../domain/index.ts";
import type {
  ExamMax,
  Rational,
  ValidationIssue,
  ExamVersion,
} from "../domain/index.ts";

import {
  exportExam,
  parseExam,
  toDomainExam,
} from "../schema/index.ts";
import type {
  WebExam,
  WebQuestion,
  WebOption,
  WebStatement,
  ExamSettings,
  Section,
  Result,
  WebError,
  Taxonomy,
  Block,
  Asset,
} from "../schema/index.ts";

import {
  createDraft,
  editDraft,
  publishDraft,
  computeDraftMax,
  getDraftSections,
  toggleSection,
  reorderQuestions,
  reorderQuestionsById,
  duplicateQuestion,
  addQuestionToDraft,
  removeQuestionFromDraft,
  updateQuestionInDraft,
} from "./index.ts";
import type {
  ExamDraft,
  StoragePort,
} from "./types.ts";

import {
  createCompositionGuard,
  renderBlocks,
  renderText,
  createStatusAnnouncer,
} from "../ui/index.ts";

// ============================================================================
// Types
// ============================================================================

export interface TeacherViewModel {
  readonly draft: ExamDraft;
  readonly viewMode?: "edit" | "preview";
  readonly activeSection?: "all" | Section;
  readonly selectedQuestionId?: string | null;
  readonly validationErrors?: Readonly<Record<string, string>>;
  readonly statusMessage?: string | null;
  readonly storage?: StoragePort;
  readonly publishVersionId?: string;
  readonly isPublishing?: boolean;
  readonly publishedExam?: WebExam | null;
}

export type TeacherActionFn = (value: any) => void;

export interface TeacherViewActions {
  readonly onDraftChange?: (draft: ExamDraft) => void;
  readonly onPublish?: (exam: WebExam) => void;
  readonly onExport?: (json: string) => void;
  readonly onImport?: (draft: ExamDraft) => void;
  readonly onError?: (error: WebError) => void;
  readonly onStatus?: (status: string) => void;
  readonly onModeChange?: (mode: "edit" | "preview") => void;
  readonly [key: string]: TeacherActionFn | undefined;
}

export interface TeacherViewOptions {
  readonly initialExam?: WebExam;
  readonly initialDraft?: ExamDraft;
  readonly storage?: StoragePort;
  readonly actions?: TeacherViewActions;
  readonly idGenerator?: () => string;
}

export interface ValidationReport {
  readonly valid: boolean;
  readonly errors: Readonly<Record<string, string>>;
  readonly issues: readonly ValidationIssue[];
}

// ============================================================================
// Default Fixtures & Factories
// ============================================================================

export function createDefaultWebExam(): WebExam {
  return Object.freeze({
    schemaVersion: "web-exam-v1",
    examId: `exam-${Date.now()}`,
    examVersionId: "v1.0.0",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    title: "Đề thi GDPT 2018",
    subject: "Toán",
    grade: 12,
    settings: Object.freeze({
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
    }),
    questions: Object.freeze([]),
    assets: Object.freeze([]),
  });
}

let nextIdCounter = 0;
function defaultIdGen(): string {
  return `q-${Date.now()}-${++nextIdCounter}`;
}

export function createBlankQuestion(kind: Section, idGen: () => string = defaultIdGen): WebQuestion {
  const versionId = idGen();
  if (kind === "I") {
    const opt1 = `${versionId}-opt-1`;
    const opt2 = `${versionId}-opt-2`;
    const opt3 = `${versionId}-opt-3`;
    const opt4 = `${versionId}-opt-4`;
    return Object.freeze({
      kind: "I",
      questionVersionId: versionId,
      title: "Câu hỏi trắc nghiệm mới",
      content: "Nội dung câu hỏi trắc nghiệm bốn lựa chọn...",
      topic: "Chủ đề 1",
      lesson: "Bài 1",
      difficulty: "Nhận biết",
      options: Object.freeze([
        Object.freeze({ optionId: opt1, text: "Lựa chọn A", label: "A" }),
        Object.freeze({ optionId: opt2, text: "Lựa chọn B", label: "B" }),
        Object.freeze({ optionId: opt3, text: "Lựa chọn C", label: "C" }),
        Object.freeze({ optionId: opt4, text: "Lựa chọn D", label: "D" }),
      ]),
      correctOptionId: opt1,
    });
  } else if (kind === "II") {
    return Object.freeze({
      kind: "II",
      questionVersionId: versionId,
      title: "Câu hỏi Đúng/Sai mới",
      content: "Cho các phát biểu sau đây:",
      topic: "Chủ đề 1",
      lesson: "Bài 1",
      difficulty: "Thông hiểu",
      statements: Object.freeze([
        Object.freeze({ statementId: `${versionId}-stmt-1`, text: "Ý a)", answer: true, label: "a" }),
        Object.freeze({ statementId: `${versionId}-stmt-2`, text: "Ý b)", answer: false, label: "b" }),
        Object.freeze({ statementId: `${versionId}-stmt-3`, text: "Ý c)", answer: true, label: "c" }),
        Object.freeze({ statementId: `${versionId}-stmt-4`, text: "Ý d)", answer: false, label: "d" }),
      ]),
    });
  } else {
    // Kind III
    return Object.freeze({
      kind: "III",
      questionVersionId: versionId,
      title: "Câu hỏi trả lời ngắn mới",
      content: "Nhập giá trị cần tìm (tối đa 4 ký tự):",
      topic: "Chủ đề 1",
      lesson: "Bài 1",
      difficulty: "Vận dụng",
      answerKey: "1,5",
    });
  }
}

// ============================================================================
// Accessible Path Validation
// ============================================================================

export function validateDraftForView(draft: ExamDraft): ValidationReport {
  const errors: Record<string, string> = {};
  const issues: ValidationIssue[] = [];

  const addError = (path: string, code: string, message: string) => {
    errors[path] = message;
    issues.push({ path, code, message });
  };

  const exam = draft.exam;

  // Title
  if (typeof exam.title !== "string" || exam.title.trim() === "") {
    addError("title", "TITLE_EMPTY", "Tiêu đề đề thi không được để trống.");
  }

  // Subject
  if (typeof exam.subject !== "string" || exam.subject.trim() === "") {
    addError("subject", "SUBJECT_EMPTY", "Môn học không được để trống.");
  }

  // Grade
  if (exam.grade !== 10 && exam.grade !== 11 && exam.grade !== 12) {
    addError("grade", "GRADE_INVALID", "Khối lớp phải là 10, 11 hoặc 12.");
  }

  // Settings
  const settings = exam.settings;
  if (!settings || typeof settings !== "object") {
    addError("settings", "SETTINGS_MISSING", "Cài đặt đề thi chưa được xác định rõ ràng.");
  } else {
    if (
      typeof settings.durationMinutes !== "number" ||
      !Number.isSafeInteger(settings.durationMinutes) ||
      settings.durationMinutes <= 0
    ) {
      addError("settings.durationMinutes", "DURATION_INVALID", "Thời gian làm bài phải là số nguyên phút dương (> 0).");
    }
    if (
      settings.maxAttempts !== null &&
      (typeof settings.maxAttempts !== "number" ||
        !Number.isSafeInteger(settings.maxAttempts) ||
        settings.maxAttempts < 1)
    ) {
      addError("settings.maxAttempts", "MAX_ATTEMPTS_INVALID", "Số lượt làm bài tối đa phải là số nguyên >= 1 hoặc để trống (không giới hạn).");
    }
    if (settings.releasePolicy !== "immediate" && settings.releasePolicy !== "after_deadline") {
      addError("settings.releasePolicy", "RELEASE_POLICY_INVALID", 'Chính sách công bố đáp án phải là "immediate" hoặc "after_deadline".');
    }
  }

  // Questions presence & limits
  const questions = exam.questions ?? [];
  if (questions.length === 0) {
    addError("questions", "EXAM_EMPTY", "Đề thi phải có ít nhất 1 câu hỏi để xuất bản.");
  }

  const seenQIds = new Set<string>();

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]!;
    const qPath = `questions[${i}]`;

    if (!q.questionVersionId || typeof q.questionVersionId !== "string" || q.questionVersionId.trim() === "") {
      addError(`${qPath}.questionVersionId`, "ID_EMPTY", `Câu hỏi số ${i + 1} thiếu mã định danh (questionVersionId).`);
    } else if (seenQIds.has(q.questionVersionId)) {
      addError(`${qPath}.questionVersionId`, "ID_DUPLICATE", `Mã định danh "${q.questionVersionId}" bị trùng lặp.`);
    } else {
      seenQIds.add(q.questionVersionId);
    }

    if (q.kind === "I") {
      const qI = q as Extract<WebQuestion, { kind: "I" }>;
      if (!Array.isArray(qI.options) || qI.options.length !== 4) {
        addError(`${qPath}.options`, "I_OPTION_COUNT", `Câu hỏi ${i + 1} (Phần I) phải có đúng 4 lựa chọn.`);
      } else {
        const optIds = new Set<string>();
        for (let j = 0; j < qI.options.length; j++) {
          const opt = qI.options[j]!;
          if (!opt.optionId) {
            addError(`${qPath}.options[${j}].optionId`, "ID_EMPTY", `Lựa chọn ${j + 1} của câu ${i + 1} thiếu optionId.`);
          } else if (optIds.has(opt.optionId)) {
            addError(`${qPath}.options[${j}].optionId`, "ID_DUPLICATE", `Lựa chọn ${j + 1} của câu ${i + 1} bị trùng optionId.`);
          } else {
            optIds.add(opt.optionId);
          }
          if (typeof opt.text !== "string" || opt.text.trim() === "") {
            addError(`${qPath}.options[${j}].text`, "OPTION_TEXT_EMPTY", `Nội dung lựa chọn ${j + 1} của câu ${i + 1} không được để trống.`);
          }
        }
        if (!qI.correctOptionId || !optIds.has(qI.correctOptionId)) {
          addError(`${qPath}.correctOptionId`, "I_KEY_INVALID", `Câu ${i + 1} chưa chọn đáp án đúng hợp lệ trong 4 lựa chọn.`);
        }
      }
    } else if (q.kind === "II") {
      const qII = q as Extract<WebQuestion, { kind: "II" }>;
      if (!Array.isArray(qII.statements) || qII.statements.length !== 4) {
        addError(`${qPath}.statements`, "II_STATEMENT_COUNT", `Câu hỏi ${i + 1} (Phần II) phải có đúng 4 ý Đúng/Sai.`);
      } else {
        const stmtIds = new Set<string>();
        for (let j = 0; j < qII.statements.length; j++) {
          const stmt = qII.statements[j]!;
          if (!stmt.statementId) {
            addError(`${qPath}.statements[${j}].statementId`, "ID_EMPTY", `Ý ${j + 1} của câu ${i + 1} thiếu statementId.`);
          } else if (stmtIds.has(stmt.statementId)) {
            addError(`${qPath}.statements[${j}].statementId`, "ID_DUPLICATE", `Ý ${j + 1} của câu ${i + 1} bị trùng statementId.`);
          } else {
            stmtIds.add(stmt.statementId);
          }
          if (typeof stmt.text !== "string" || stmt.text.trim() === "") {
            addError(`${qPath}.statements[${j}].text`, "STATEMENT_TEXT_EMPTY", `Nội dung ý ${j + 1} của câu ${i + 1} không được để trống.`);
          }
          if (typeof stmt.answer !== "boolean") {
            addError(`${qPath}.statements[${j}].answer`, "II_ANSWER_INVALID", `Ý ${j + 1} của câu ${i + 1} phải được gán giá trị Đúng hoặc Sai.`);
          }
        }
      }
    } else if (q.kind === "III") {
      const qIII = q as Extract<WebQuestion, { kind: "III" }>;
      if (typeof qIII.answerKey !== "string") {
        addError(`${qPath}.answerKey`, "III_KEY_MISSING", `Câu ${i + 1} (Phần III) chưa có chuỗi đáp án chuẩn.`);
      } else {
        const keyIssues = checkShortAnswer(qIII.answerKey);
        if (keyIssues.includes("empty")) {
          addError(`${qPath}.answerKey`, "III_KEY_EMPTY", `Đáp án chuẩn câu ${i + 1} không được để trống.`);
        } else if (keyIssues.includes("too_long")) {
          addError(`${qPath}.answerKey`, "III_KEY_TOO_LONG", `Đáp án chuẩn câu ${i + 1} vượt quá độ dài tối đa 4 ký tự (chuỗi hiện tại dài ${qIII.answerKey.length}).`);
        } else if (keyIssues.includes("bad_char")) {
          addError(`${qPath}.answerKey`, "III_KEY_BAD_CHAR", `Đáp án chuẩn câu ${i + 1} chứa ký tự không hợp lệ. Chỉ cho phép các chữ số 0-9, dấu trừ (-) và dấu phẩy (,).`);
        }
      }
    }
  }

  // Domain validateExamVersion check if no syntactic errors preventing conversion
  if (questions.length > 0 && Object.keys(errors).length === 0) {
    try {
      const domainExam = toDomainExam(exam);
      const domainValidation = validateExamVersion(domainExam);
      if (!domainValidation.ok) {
        for (const issue of domainValidation.issues) {
          addError(issue.path, issue.code, issue.message);
        }
      }
    } catch (err) {
      addError("schema", "CONVERSION_ERROR", `Lỗi chuyển đổi cấu trúc đề: ${String(err)}`);
    }
  }

  return Object.freeze({
    valid: Object.keys(errors).length === 0,
    errors: Object.freeze(errors),
    issues: Object.freeze(issues),
  });
}

// ============================================================================
// TeacherController (State & User Action Transitions)
// ============================================================================

export class TeacherController {
  private _draft: ExamDraft;
  private _viewMode: "edit" | "preview" = "edit";
  private _activeSection: "all" | Section = "all";
  private _selectedQuestionId: string | null = null;
  private _publishVersionId: string = "";
  private _validationErrors: Record<string, string> = {};
  private _statusMessage: string | null = null;
  private _storage: StoragePort | null = null;
  private _actions: TeacherViewActions;
  private _idGen: () => string;
  private _listeners = new Set<() => void>();

  constructor(options: TeacherViewOptions = {}) {
    this._idGen = options.idGenerator ?? defaultIdGen;
    this._actions = options.actions ?? {};
    this._storage = options.storage ?? null;

    if (options.initialDraft) {
      this._draft = options.initialDraft;
    } else if (options.initialExam) {
      this._draft = createDraft(options.initialExam, `draft-${Date.now()}`);
    } else {
      this._draft = createDraft(createDefaultWebExam(), `draft-${Date.now()}`);
    }

    // Default target publish version is draft's version with a bump or suffix
    const currentVer = this._draft.exam.examVersionId;
    this._publishVersionId = currentVer.includes(".0")
      ? currentVer.replace(/(\d+)$/, (m) => String(Number(m) + 1))
      : `${currentVer}.1`;

    // Select first question if exists
    if ((this._draft.exam.questions?.length ?? 0) > 0) {
      this._selectedQuestionId = this._draft.exam.questions[0]!.questionVersionId;
    }
  }

  public getDraft(): ExamDraft {
    return this._draft;
  }

  public getViewMode(): "edit" | "preview" {
    return this._viewMode;
  }

  public setViewMode(mode: "edit" | "preview"): void {
    if (this._viewMode !== mode) {
      this._viewMode = mode;
      if (mode === "preview") {
        const report = validateDraftForView(this._draft);
        this._validationErrors = { ...report.errors };
      }
      this._actions.onModeChange?.(mode);
      this._notify();
    }
  }

  public getActiveSection(): "all" | Section {
    return this._activeSection;
  }

  public setActiveSection(section: "all" | Section): void {
    if (this._activeSection !== section) {
      this._activeSection = section;
      this._notify();
    }
  }

  public getSelectedQuestionId(): string | null {
    return this._selectedQuestionId;
  }

  public setSelectedQuestionId(id: string | null): void {
    if (this._selectedQuestionId !== id) {
      this._selectedQuestionId = id;
      this._notify();
    }
  }

  public getValidationErrors(): Readonly<Record<string, string>> {
    return this._validationErrors;
  }

  public getStatusMessage(): string | null {
    return this._statusMessage;
  }

  public setStatusMessage(msg: string | null): void {
    this._statusMessage = msg;
    if (msg) {
      this._actions.onStatus?.(msg);
    }
    this._notify();
  }

  public getPublishVersionId(): string {
    return this._publishVersionId;
  }

  public setPublishVersionId(v: string): void {
    this._publishVersionId = v;
    this._notify();
  }

  public setStorage(storage: StoragePort): void {
    this._storage = storage;
  }

  public setActions(actions: TeacherViewActions): void {
    this._actions = actions;
  }

  public getStorage(): StoragePort | null {
    return this._storage;
  }

  public getComputedMax(): ExamMax {
    return computeDraftMax(this._draft);
  }

  public getDraftSections(): readonly Section[] {
    return getDraftSections(this._draft);
  }

  public subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private _notify(): void {
    for (const listener of Array.from(this._listeners)) {
      listener();
    }
  }

  private _applyDraftResult(res: Result<ExamDraft>): Result<ExamDraft> {
    if (res.ok) {
      this._draft = res.value;
      // Clear or recompute validation
      if (Object.keys(this._validationErrors).length > 0) {
        this.validate();
      }
      this._actions.onDraftChange?.(this._draft);
      this._notify();
    } else {
      this._actions.onError?.(res.error);
    }
    return res;
  }

  // --- Exam Metadata Transitions ---

  public updateTitle(title: string): Result<ExamDraft> {
    return this._applyDraftResult(editDraft(this._draft, { action: "set_title", title }));
  }

  public updateSubject(subject: string): Result<ExamDraft> {
    return this._applyDraftResult(editDraft(this._draft, { action: "set_subject", subject }));
  }

  public updateGrade(grade: 10 | 11 | 12): Result<ExamDraft> {
    return this._applyDraftResult(editDraft(this._draft, { action: "set_grade", grade }));
  }

  public updateSettings(settings: Partial<ExamSettings>): Result<ExamDraft> {
    return this._applyDraftResult(editDraft(this._draft, { action: "set_settings", settings }));
  }

  // --- Section Toggles ---

  public toggleSection(section: Section, enabled: boolean): Result<ExamDraft> {
    return this._applyDraftResult(toggleSection(this._draft, section, enabled));
  }

  // --- Question Manipulation ---

  public addQuestion(kind: Section, customData?: Partial<WebQuestion>): Result<ExamDraft> {
    const blank = createBlankQuestion(kind, this._idGen);
    const question = customData ? ({ ...blank, ...customData } as WebQuestion) : blank;
    const res = addQuestionToDraft(this._draft, question);
    if (res.ok) {
      this._selectedQuestionId = question.questionVersionId;
      return this._applyDraftResult(res);
    }
    return res;
  }

  public removeQuestion(questionVersionId: string): Result<ExamDraft> {
    const res = removeQuestionFromDraft(this._draft, questionVersionId);
    if (res.ok) {
      if (this._selectedQuestionId === questionVersionId) {
        const remaining = res.value.exam.questions;
        this._selectedQuestionId = remaining.length > 0 ? remaining[0]!.questionVersionId : null;
      }
      return this._applyDraftResult(res);
    }
    return res;
  }

  public updateQuestion(questionVersionId: string, patch: Partial<WebQuestion>): Result<ExamDraft> {
    return this._applyDraftResult(updateQuestionInDraft(this._draft, questionVersionId, patch));
  }

  public reorderQuestion(fromIndex: number, toIndex: number): Result<ExamDraft> {
    return this._applyDraftResult(reorderQuestions(this._draft, fromIndex, toIndex));
  }

  public reorderQuestionsById(order: readonly string[]): Result<ExamDraft> {
    return this._applyDraftResult(reorderQuestionsById(this._draft, order));
  }

  public duplicateQuestion(questionVersionId: string): Result<ExamDraft> {
    const res = duplicateQuestion(this._draft, questionVersionId, this._idGen);
    if (res.ok) {
      // Find the duplicated question (inserted right after questionVersionId)
      const qs = res.value.exam.questions;
      const originalIdx = qs.findIndex((q) => q.questionVersionId === questionVersionId);
      if (originalIdx !== -1 && originalIdx + 1 < qs.length) {
        this._selectedQuestionId = qs[originalIdx + 1]!.questionVersionId;
      }
      return this._applyDraftResult(res);
    }
    return res;
  }

  // --- Validation ---

  public validate(): boolean {
    const report = validateDraftForView(this._draft);
    this._validationErrors = { ...report.errors };
    this._notify();
    return report.valid;
  }

  // --- Publish ---

  public async publish(overrideStorage?: StoragePort): Promise<Result<WebExam>> {
    const targetStorage = overrideStorage ?? this._storage;
    if (!targetStorage) {
      const err: WebError = {
        code: "STORAGE_UNAVAILABLE",
        path: "storage",
        message: "Không tìm thấy bộ nhớ lưu trữ StoragePort để xuất bản đề thi.",
        recoverable: false,
      };
      this._actions.onError?.(err);
      return { ok: false, error: err };
    }

    // Must validate first
    const report = validateDraftForView(this._draft);
    if (!report.valid) {
      this._validationErrors = { ...report.errors };
      this._notify();
      const firstIssue = report.issues[0];
      const err: WebError = {
        code: firstIssue?.code ?? "VALIDATION_FAILED",
        path: firstIssue?.path ?? "draft",
        message: `Đề thi chưa hợp lệ để xuất bản: ${firstIssue?.message ?? "lỗi không xác định"}`,
        recoverable: true,
      };
      this._actions.onError?.(err);
      return { ok: false, error: err };
    }

    const versionToPublish = this._publishVersionId.trim();
    if (!versionToPublish) {
      const err: WebError = {
        code: "VERSION_INVALID",
        path: "examVersionId",
        message: "Phiên bản xuất bản mới (versionId) không được để trống.",
        recoverable: true,
      };
      this._validationErrors["examVersionId"] = err.message;
      this._actions.onError?.(err);
      this._notify();
      return { ok: false, error: err };
    }

    if (versionToPublish === this._draft.exam.examVersionId) {
      const err: WebError = {
        code: "VERSION_CONFLICT",
        path: "examVersionId",
        message: `Phiên bản mới phải khác phiên bản hiện tại ("${versionToPublish}").`,
        recoverable: true,
      };
      this._validationErrors["examVersionId"] = err.message;
      this._actions.onError?.(err);
      this._notify();
      return { ok: false, error: err };
    }

    const pubRes = await publishDraft(this._draft, versionToPublish, targetStorage);
    if (pubRes.ok) {
      this._statusMessage = `Đã xuất bản thành công phiên bản ${pubRes.value.examVersionId}!`;
      // Update draft to reflect newly published exam
      this._draft = createDraft(pubRes.value, `draft-${Date.now()}`);
      this._publishVersionId = `${pubRes.value.examVersionId}.1`;
      this._actions.onPublish?.(pubRes.value);
      this._actions.onStatus?.(this._statusMessage);
      this._notify();
    } else {
      this._actions.onError?.(pubRes.error);
      this._statusMessage = `Xuất bản thất bại: ${pubRes.error.message}`;
      this._notify();
    }

    return pubRes;
  }

  // --- JSON Import & Export ---

  public exportJson(): Result<string> {
    try {
      const json = exportExam(this._draft.exam);
      this._actions.onExport?.(json);
      return { ok: true, value: json };
    } catch (err) {
      const error: WebError = {
        code: "EXPORT_FAILED",
        path: "draft",
        message: `Lỗi xuất dữ liệu JSON: ${String(err)}`,
        recoverable: true,
      };
      this._actions.onError?.(error);
      return { ok: false, error };
    }
  }

  public importJson(jsonString: string): Result<ExamDraft> {
    try {
      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(jsonString);
      } catch (parseErr) {
        const error: WebError = {
          code: "JSON_PARSE_ERROR",
          path: "",
          message: `Dữ liệu không đúng định dạng cú pháp JSON: ${String(parseErr)}`,
          recoverable: true,
        };
        this._actions.onError?.(error);
        return { ok: false, error };
      }

      const validatedRes = parseExam(parsedRaw);
      if (!validatedRes.ok) {
        const firstIssue = validatedRes.issues[0];
        const error: WebError = {
          code: firstIssue?.code ?? "SCHEMA_INVALID",
          path: firstIssue?.path ?? "",
          message: `Lỗi xác thực cấu trúc đề: ${firstIssue?.message ?? "không hợp lệ"}`,
          recoverable: true,
        };
        this._actions.onError?.(error);
        return { ok: false, error };
      }

      // Create new draft with copy isolation (never mutates active exam)
      const importedDraft = createDraft(validatedRes.value, `draft-import-${Date.now()}`);
      this._draft = importedDraft;
      this._selectedQuestionId = importedDraft.exam.questions[0]?.questionVersionId ?? null;
      this._validationErrors = {};
      this._statusMessage = `Đã nhập thành công đề thi "${importedDraft.exam.title}"!`;
      this._actions.onImport?.(importedDraft);
      this._actions.onDraftChange?.(importedDraft);
      this._notify();
      return { ok: true, value: importedDraft };
    } catch (err) {
      const error: WebError = {
        code: "IMPORT_FAILED",
        path: "",
        message: `Lỗi nhập đề thi JSON: ${String(err)}`,
        recoverable: true,
      };
      this._actions.onError?.(error);
      return { ok: false, error };
    }
  }

  public dispose(): void {
    this._listeners.clear();
  }
}

export function createTeacherView(options: TeacherViewOptions = {}): TeacherController {
  return new TeacherController(options);
}

// ============================================================================
// Styles Injector Helper
// ============================================================================

export function ensureTeacherViewStyles(doc: Document): void {
  if (doc.getElementById("cunata-teacher-view-styles")) {
    return;
  }
  const style = doc.createElement("style");
  style.id = "cunata-teacher-view-styles";
  // Fallback inline basic rules if link tag not loaded
  style.textContent = `
    .cunata-teacher-view { font-family: system-ui, sans-serif; padding: 1rem; }
    .cunata-btn { min-height: 44px; min-width: 44px; padding: 0.5rem 1rem; cursor: pointer; }
    .cunata-input, .cunata-select, .cunata-textarea { min-height: 44px; padding: 0.5rem; width: 100%; box-sizing: border-box; }
    .cunata-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem; }
    .cunata-auth-badge { display: inline-block; padding: 0.25rem 0.5rem; font-size: 0.75rem; background: #d1fae5; color: #065f46; border-radius: 9999px; }
    .cunata-d08-banner { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.875rem; color: #92400e; }
  `;
  if (doc.head) {
    doc.head.appendChild(style);
  }
}

// ============================================================================
// Canonical Mount Function
// Conforms to WEB-contract.md §5:
// export function mount(root: HTMLElement, model: unknown, actions: Readonly<Record<string,(value:unknown)=>void>>): () => void;
// ============================================================================

export function mount(
  root: HTMLElement,
  model: unknown,
  actions: Readonly<Record<string, (value: unknown) => void>> = {},
): () => void {
  if (!root) {
    throw new Error("Root HTMLElement must be provided to mount()");
  }

  const doc = root.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc) {
    throw new Error("DOM Document is required for mount()");
  }

  ensureTeacherViewStyles(doc);

  // Normalize controller from model
  let controller: TeacherController;
  if (model instanceof TeacherController) {
    controller = model;
    if (actions && Object.keys(actions).length > 0) {
      controller.setActions(actions);
    }
  } else if (model && typeof model === "object" && "draft" in model && (model as { draft: unknown }).draft) {
    const vm = model as TeacherViewModel;
    controller = new TeacherController({
      initialDraft: vm.draft,
      storage: vm.storage,
      actions,
    });
    if (vm.viewMode) controller.setViewMode(vm.viewMode);
    if (vm.activeSection) controller.setActiveSection(vm.activeSection);
    if (vm.selectedQuestionId !== undefined) controller.setSelectedQuestionId(vm.selectedQuestionId);
    if (vm.publishVersionId) controller.setPublishVersionId(vm.publishVersionId);
  } else if (model && typeof model === "object" && (model as { schemaVersion?: string }).schemaVersion === "web-exam-v1") {
    controller = new TeacherController({
      initialExam: model as WebExam,
      actions,
    });
  } else {
    controller = new TeacherController({ actions });
  }

  const cleanups: (() => void)[] = [];

  // Main UI rendering function
  const render = () => {
    // Clean root and apply base classes
    root.textContent = "";
    if (!root.classList.contains("cunata-teacher-view")) {
      root.classList.add("cunata-teacher-view");
    }
    if (!root.classList.contains("cunata-ui")) {
      root.classList.add("cunata-ui");
    }
    root.setAttribute("role", "main");
    root.setAttribute("aria-label", "Trình soạn thảo đề thi GDPT 2018");

    const draft = controller.getDraft();
    const exam = draft.exam;
    const viewMode = controller.getViewMode();
    const errors = controller.getValidationErrors();
    const computedMax = controller.getComputedMax();

    // 1. Top Badges & AC Notices
    const badgeBar = doc.createElement("div");
    badgeBar.style.marginBottom = "0.75rem";

    const authBadge = doc.createElement("span");
    authBadge.className = "cunata-auth-badge";
    authBadge.setAttribute("role", "status");
    authBadge.textContent = "Công cụ soạn đề cục bộ (Chưa đăng nhập / Không phân quyền người dùng)";
    badgeBar.appendChild(authBadge);

    const d08Banner = doc.createElement("div");
    d08Banner.className = "cunata-d08-banner";
    d08Banner.setAttribute("role", "note");
    d08Banner.textContent =
      "Lưu ý bảo mật (D08): Đề thi tĩnh chạy hoàn toàn trên trình duyệt. Lựa chọn công bố đáp án \"sau thời hạn\" (after_deadline) chỉ cung cấp trải nghiệm UX cho học sinh, không thể cam kết giấu đáp án tuyệt đối trước khi có dịch vụ chấm điểm độc lập (D08 đang chờ quyết định).";
    badgeBar.appendChild(d08Banner);

    root.appendChild(badgeBar);

    // 2. Header & Action Toolbar
    const header = doc.createElement("header");
    header.className = "cunata-header";

    const titleEl = doc.createElement("h1");
    titleEl.className = "cunata-header-title";
    titleEl.textContent = `Soạn đề: ${exam.title || "(Chưa đặt tiêu đề)"}`;
    header.appendChild(titleEl);

    const toolbar = doc.createElement("div");
    toolbar.className = "cunata-toolbar";

    // Mode Switchers
    const btnEdit = doc.createElement("button");
    btnEdit.type = "button";
    btnEdit.className = "cunata-btn";
    btnEdit.id = "btn-mode-edit";
    btnEdit.setAttribute("aria-pressed", viewMode === "edit" ? "true" : "false");
    btnEdit.textContent = "Chỉnh sửa";
    btnEdit.onclick = () => controller.setViewMode("edit");
    toolbar.appendChild(btnEdit);

    const btnPreview = doc.createElement("button");
    btnPreview.type = "button";
    btnPreview.className = "cunata-btn";
    btnPreview.id = "btn-mode-preview";
    btnPreview.setAttribute("aria-pressed", viewMode === "preview" ? "true" : "false");
    btnPreview.textContent = "Xem trước";
    btnPreview.onclick = () => controller.setViewMode("preview");
    toolbar.appendChild(btnPreview);

    // JSON Export
    const btnExport = doc.createElement("button");
    btnExport.type = "button";
    btnExport.className = "cunata-btn";
    btnExport.id = "btn-export-json";
    btnExport.textContent = "Xuất JSON";
    btnExport.onclick = () => {
      const expRes = controller.exportJson();
      if (expRes.ok) {
        controller.setStatusMessage("Đã xuất đề thi ra JSON thành công!");
      }
    };
    toolbar.appendChild(btnExport);

    // JSON Import
    const btnImport = doc.createElement("button");
    btnImport.type = "button";
    btnImport.className = "cunata-btn";
    btnImport.id = "btn-import-json";
    btnImport.textContent = "Nhập JSON";
    btnImport.onclick = () => {
      // In browser or mock, prompt for JSON or handle import action
      const jsonPrompt = typeof window !== "undefined" && typeof window.prompt === "function"
        ? window.prompt("Dán nội dung JSON của đề thi:")
        : null;
      if (jsonPrompt) {
        controller.importJson(jsonPrompt);
      }
    };
    toolbar.appendChild(btnImport);

    header.appendChild(toolbar);
    root.appendChild(header);

    // 3. Status Announcer
    const statusMsg = controller.getStatusMessage();
    if (statusMsg) {
      const announcerEl = doc.createElement("div");
      announcerEl.className = "cunata-status-announcer";
      announcerEl.setAttribute("role", "status");
      announcerEl.setAttribute("aria-live", "polite");
      announcerEl.textContent = statusMsg;
      root.appendChild(announcerEl);
    }

    // 4. Accessible Validation Summary (role="alert")
    const errorEntries = Object.entries(errors);
    if (errorEntries.length > 0) {
      const summaryCard = doc.createElement("div");
      summaryCard.className = "cunata-validation-summary";
      summaryCard.setAttribute("role", "alert");
      summaryCard.setAttribute("aria-live", "assertive");
      summaryCard.id = "validation-summary";

      const sumTitle = doc.createElement("h2");
      sumTitle.className = "cunata-validation-title";
      sumTitle.textContent = `Cần hoàn thiện ${errorEntries.length} thông tin trước khi xuất bản:`;
      summaryCard.appendChild(sumTitle);

      const sumList = doc.createElement("ul");
      sumList.className = "cunata-validation-list";
      for (const [path, msg] of errorEntries) {
        const li = doc.createElement("li");
        li.textContent = `[${path}]: ${msg}`;
        sumList.appendChild(li);
      }
      summaryCard.appendChild(sumList);
      root.appendChild(summaryCard);
    }

    // 5. Render based on active viewMode
    if (viewMode === "preview") {
      renderPreviewMode(root, doc, controller, exam, computedMax);
    } else {
      renderEditMode(root, doc, controller, exam, computedMax, errors, cleanups);
    }
  };

  const unsubscribe = controller.subscribe(render);
  render();

  return () => {
    unsubscribe();
    for (const c of cleanups) {
      c();
    }
    controller.dispose();
    root.textContent = "";
  };
}

// ============================================================================
// Edit Mode Rendering Subsystem
// ============================================================================

function renderEditMode(
  root: HTMLElement,
  doc: Document,
  controller: TeacherController,
  exam: WebExam,
  computedMax: ExamMax,
  errors: Readonly<Record<string, string>>,
  cleanups: (() => void)[],
): void {
  // --- Card 1: Exam General Information & Explicit Settings ---
  const metaCard = doc.createElement("section");
  metaCard.className = "cunata-card";
  metaCard.setAttribute("aria-labelledby", "heading-exam-meta");

  const metaTitle = doc.createElement("h2");
  metaTitle.className = "cunata-card-title";
  metaTitle.id = "heading-exam-meta";
  metaTitle.textContent = "1. Thông tin chung & Cài đặt đề thi";
  metaCard.appendChild(metaTitle);

  const formGrid = doc.createElement("div");
  formGrid.className = "cunata-form-grid";

  // Title Field
  const titleGroup = createFormGroup(doc, "title", "Tiêu đề đề thi", errors["title"]);
  const titleInput = doc.createElement("input");
  titleInput.type = "text";
  titleInput.id = "field-title";
  titleInput.name = "title";
  titleInput.className = "cunata-input";
  titleInput.value = exam.title;
  titleInput.setAttribute("aria-required", "true");
  if (errors["title"]) {
    titleInput.setAttribute("aria-invalid", "true");
    titleInput.setAttribute("aria-describedby", "error-title");
  }
  const titleGuard = createCompositionGuard({
    element: titleInput,
    onCommit: (val) => controller.updateTitle(val),
  });
  cleanups.push(() => titleGuard.dispose());
  titleGroup.appendChild(titleInput);
  formGrid.appendChild(titleGroup);

  // Subject Field
  const subjGroup = createFormGroup(doc, "subject", "Môn học", errors["subject"]);
  const subjInput = doc.createElement("input");
  subjInput.type = "text";
  subjInput.id = "field-subject";
  subjInput.name = "subject";
  subjInput.className = "cunata-input";
  subjInput.value = exam.subject;
  subjInput.setAttribute("aria-required", "true");
  if (errors["subject"]) {
    subjInput.setAttribute("aria-invalid", "true");
    subjInput.setAttribute("aria-describedby", "error-subject");
  }
  const subjGuard = createCompositionGuard({
    element: subjInput,
    onCommit: (val) => controller.updateSubject(val),
  });
  cleanups.push(() => subjGuard.dispose());
  subjGroup.appendChild(subjInput);
  formGrid.appendChild(subjGroup);

  // Grade Field
  const gradeGroup = createFormGroup(doc, "grade", "Khối lớp", errors["grade"]);
  const gradeSelect = doc.createElement("select");
  gradeSelect.id = "field-grade";
  gradeSelect.name = "grade";
  gradeSelect.className = "cunata-select";
  if (errors["grade"]) {
    gradeSelect.setAttribute("aria-invalid", "true");
    gradeSelect.setAttribute("aria-describedby", "error-grade");
  }
  for (const g of [10, 11, 12] as const) {
    const opt = doc.createElement("option");
    opt.value = String(g);
    opt.textContent = `Lớp ${g}`;
    if (exam.grade === g) opt.selected = true;
    gradeSelect.appendChild(opt);
  }
  gradeSelect.onchange = () => {
    const val = Number(gradeSelect.value) as 10 | 11 | 12;
    controller.updateGrade(val);
  };
  gradeGroup.appendChild(gradeSelect);
  formGrid.appendChild(gradeGroup);

  // Duration Minutes Field
  const durGroup = createFormGroup(doc, "durationMinutes", "Thời gian làm bài (phút)", errors["settings.durationMinutes"]);
  const durInput = doc.createElement("input");
  durInput.type = "number";
  durInput.id = "field-duration";
  durInput.name = "durationMinutes";
  durInput.className = "cunata-input";
  durInput.min = "1";
  durInput.step = "1";
  durInput.value = String(exam.settings?.durationMinutes ?? 50);
  if (errors["settings.durationMinutes"]) {
    durInput.setAttribute("aria-invalid", "true");
    durInput.setAttribute("aria-describedby", "error-durationMinutes");
  }
  durInput.onchange = () => {
    const dur = Number(durInput.value);
    if (Number.isSafeInteger(dur) && dur > 0) {
      controller.updateSettings({ durationMinutes: dur });
    }
  };
  durGroup.appendChild(durInput);
  formGrid.appendChild(durGroup);

  // Max Attempts Field
  const maxAttGroup = createFormGroup(
    doc,
    "maxAttempts",
    "Số lượt làm tối đa",
    errors["settings.maxAttempts"],
    "(Ghi chú: chỉ là khuyến nghị cục bộ, không xác thực danh tính)",
  );
  const maxAttInput = doc.createElement("input");
  maxAttInput.type = "number";
  maxAttInput.id = "field-max-attempts";
  maxAttInput.name = "maxAttempts";
  maxAttInput.className = "cunata-input";
  maxAttInput.min = "1";
  maxAttInput.placeholder = "Không giới hạn (để trống)";
  maxAttInput.value = exam.settings?.maxAttempts !== null ? String(exam.settings?.maxAttempts) : "";
  if (errors["settings.maxAttempts"]) {
    maxAttInput.setAttribute("aria-invalid", "true");
    maxAttInput.setAttribute("aria-describedby", "error-maxAttempts");
  }
  maxAttInput.onchange = () => {
    const rawVal = maxAttInput.value.trim();
    if (rawVal === "") {
      controller.updateSettings({ maxAttempts: null });
    } else {
      const num = Number(rawVal);
      if (Number.isSafeInteger(num) && num >= 1) {
        controller.updateSettings({ maxAttempts: num });
      }
    }
  };
  maxAttGroup.appendChild(maxAttInput);
  formGrid.appendChild(maxAttGroup);

  // Release Policy Field
  const releaseGroup = createFormGroup(
    doc,
    "releasePolicy",
    "Chính sách công bố đáp án",
    errors["settings.releasePolicy"],
    "Sau thời hạn chỉ là giao diện UX cho đến khi có dịch vụ chấm điểm (D08).",
  );
  const releaseSelect = doc.createElement("select");
  releaseSelect.id = "field-release-policy";
  releaseSelect.name = "releasePolicy";
  releaseSelect.className = "cunata-select";
  if (errors["settings.releasePolicy"]) {
    releaseSelect.setAttribute("aria-invalid", "true");
    releaseSelect.setAttribute("aria-describedby", "error-releasePolicy");
  }

  const optImm = doc.createElement("option");
  optImm.value = "immediate";
  optImm.textContent = "Công bố đáp án ngay sau khi nộp (immediate)";
  if (exam.settings?.releasePolicy === "immediate") optImm.selected = true;
  releaseSelect.appendChild(optImm);

  const optAft = doc.createElement("option");
  optAft.value = "after_deadline";
  optAft.textContent = "Chỉ công bố đáp án sau khi hết giờ (after_deadline)";
  if (exam.settings?.releasePolicy === "after_deadline") optAft.selected = true;
  releaseSelect.appendChild(optAft);

  releaseSelect.onchange = () => {
    controller.updateSettings({
      releasePolicy: releaseSelect.value as "immediate" | "after_deadline",
    });
  };
  releaseGroup.appendChild(releaseSelect);
  formGrid.appendChild(releaseGroup);

  // Shuffle Questions Checkbox
  const shuffleQGroup = doc.createElement("div");
  shuffleQGroup.className = "cunata-form-group";
  const shuffleQLabel = doc.createElement("label");
  shuffleQLabel.className = "cunata-toggle-item";
  const shuffleQCheck = doc.createElement("input");
  shuffleQCheck.type = "checkbox";
  shuffleQCheck.id = "field-shuffle-questions";
  shuffleQCheck.name = "shuffleQuestions";
  shuffleQCheck.checked = Boolean(exam.settings?.shuffleQuestions);
  shuffleQCheck.onchange = () => {
    controller.updateSettings({ shuffleQuestions: shuffleQCheck.checked });
  };
  shuffleQLabel.appendChild(shuffleQCheck);
  const shuffleQText = doc.createElement("span");
  shuffleQText.textContent = "Trộn thứ tự câu hỏi khi làm bài";
  shuffleQLabel.appendChild(shuffleQText);
  shuffleQGroup.appendChild(shuffleQLabel);
  formGrid.appendChild(shuffleQGroup);

  // Shuffle Options Checkbox
  const shuffleOGroup = doc.createElement("div");
  shuffleOGroup.className = "cunata-form-group";
  const shuffleOLabel = doc.createElement("label");
  shuffleOLabel.className = "cunata-toggle-item";
  const shuffleOCheck = doc.createElement("input");
  shuffleOCheck.type = "checkbox";
  shuffleOCheck.id = "field-shuffle-options";
  shuffleOCheck.name = "shuffleOptions";
  shuffleOCheck.checked = Boolean(exam.settings?.shuffleOptions);
  shuffleOCheck.onchange = () => {
    controller.updateSettings({ shuffleOptions: shuffleOCheck.checked });
  };
  shuffleOLabel.appendChild(shuffleOCheck);
  const shuffleOText = doc.createElement("span");
  shuffleOText.textContent = "Trộn thứ tự lựa chọn (Phần I & II)";
  shuffleOLabel.appendChild(shuffleOText);
  shuffleOGroup.appendChild(shuffleOLabel);
  formGrid.appendChild(shuffleOGroup);

  metaCard.appendChild(formGrid);
  root.appendChild(metaCard);

  // --- Card 2: Independent Section Toggles & Maximum Score Calculation ---
  const sectionCard = doc.createElement("section");
  sectionCard.className = "cunata-card";
  sectionCard.setAttribute("aria-labelledby", "heading-sections-score");

  const secTitle = doc.createElement("h2");
  secTitle.className = "cunata-card-title";
  secTitle.id = "heading-sections-score";
  secTitle.textContent = "2. Các phần thi & Điểm tối đa tự động (Domain Scorer)";
  sectionCard.appendChild(secTitle);

  const secDesc = doc.createElement("p");
  secDesc.style.margin = "0 0 1rem 0";
  secDesc.style.fontSize = "0.875rem";
  secDesc.style.color = "#4b5563";
  secDesc.textContent =
    "Đề có thể bật/tắt độc lập từng phần. Điểm tối đa tính bằng số học phân số chính xác theo công thức chế độ tùy chỉnh GDPT 2018 (không ép tổng 10).";
  sectionCard.appendChild(secDesc);

  const activeSecs = new Set(controller.getDraftSections());
  const questions = exam.questions ?? [];
  const n1 = questions.filter((q) => q.kind === "I").length;
  const n2 = questions.filter((q) => q.kind === "II").length;
  const n3 = questions.filter((q) => q.kind === "III").length;

  const togglesBar = doc.createElement("div");
  togglesBar.className = "cunata-section-toggles";

  // Section I Toggle
  togglesBar.appendChild(
    createSectionToggle(doc, "I", "Phần I (4 lựa chọn)", n1, activeSecs.has("I"), (enabled) => {
      controller.toggleSection("I", enabled);
    }),
  );

  // Section II Toggle
  togglesBar.appendChild(
    createSectionToggle(doc, "II", "Phần II (Đúng/Sai)", n2, activeSecs.has("II"), (enabled) => {
      controller.toggleSection("II", enabled);
    }),
  );

  // Section III Toggle
  togglesBar.appendChild(
    createSectionToggle(doc, "III", "Phần III (Trả lời ngắn)", n3, activeSecs.has("III"), (enabled) => {
      controller.toggleSection("III", enabled);
    }),
  );

  sectionCard.appendChild(togglesBar);

  // Score Grid Display
  const scoreGrid = doc.createElement("div");
  scoreGrid.className = "cunata-score-grid";

  scoreGrid.appendChild(
    createScoreCard(doc, "Phần I", `${toFractionString(computedMax.maxI)} điểm`, `(${n1} câu × 0,25)`),
  );
  scoreGrid.appendChild(
    createScoreCard(doc, "Phần II", `${toFractionString(computedMax.maxII)} điểm`, `(${n2} câu × 1,00)`),
  );
  scoreGrid.appendChild(
    createScoreCard(
      doc,
      "Phần III",
      `${toFractionString(computedMax.maxIII)} điểm`,
      n3 > 0 ? `(${n3} câu × ${toFractionString(computedMax.pointIII)})` : "(0 câu)",
    ),
  );
  scoreGrid.appendChild(
    createScoreCard(
      doc,
      "TỔNG ĐIỂM TỐI ĐA",
      `${toFractionString(computedMax.maxTotal)} điểm`,
      `Tổng số câu: ${n1 + n2 + n3}`,
      true,
    ),
  );

  sectionCard.appendChild(scoreGrid);
  root.appendChild(sectionCard);

  // --- Card 3: Questions List & Reorder / Duplicate / Delete ---
  const qManagerCard = doc.createElement("section");
  qManagerCard.className = "cunata-card";
  qManagerCard.setAttribute("aria-labelledby", "heading-questions-manager");

  const qTitle = doc.createElement("h2");
  qTitle.className = "cunata-card-title";
  qTitle.id = "heading-questions-manager";
  qTitle.textContent = `3. Danh sách câu hỏi (${questions.length} câu)`;
  qManagerCard.appendChild(qTitle);

  // Action Bar: Add Question & Filter
  const qActionBar = doc.createElement("div");
  qActionBar.className = "cunata-header";
  qActionBar.style.borderBottom = "none";
  qActionBar.style.paddingBottom = "0";

  const addBtns = doc.createElement("div");
  addBtns.className = "cunata-toolbar";

  const btnAddI = doc.createElement("button");
  btnAddI.type = "button";
  btnAddI.className = "cunata-btn cunata-btn-primary";
  btnAddI.id = "btn-add-q-I";
  btnAddI.textContent = "+ Thêm câu Phần I";
  btnAddI.onclick = () => controller.addQuestion("I");
  addBtns.appendChild(btnAddI);

  const btnAddII = doc.createElement("button");
  btnAddII.type = "button";
  btnAddII.className = "cunata-btn cunata-btn-primary";
  btnAddII.id = "btn-add-q-II";
  btnAddII.textContent = "+ Thêm câu Phần II";
  btnAddII.onclick = () => controller.addQuestion("II");
  addBtns.appendChild(btnAddII);

  const btnAddIII = doc.createElement("button");
  btnAddIII.type = "button";
  btnAddIII.className = "cunata-btn cunata-btn-primary";
  btnAddIII.id = "btn-add-q-III";
  btnAddIII.textContent = "+ Thêm câu Phần III";
  btnAddIII.onclick = () => controller.addQuestion("III");
  addBtns.appendChild(btnAddIII);

  qActionBar.appendChild(addBtns);

  // Filter Buttons
  const filterBtns = doc.createElement("div");
  filterBtns.className = "cunata-question-filters";
  const activeSectionFilter = controller.getActiveSection();

  for (const filterOpt of ["all", "I", "II", "III"] as const) {
    const fBtn = doc.createElement("button");
    fBtn.type = "button";
    fBtn.className = "cunata-btn";
    fBtn.setAttribute("aria-pressed", activeSectionFilter === filterOpt ? "true" : "false");
    fBtn.textContent = filterOpt === "all" ? "Tất cả" : `Phần ${filterOpt}`;
    fBtn.onclick = () => controller.setActiveSection(filterOpt);
    filterBtns.appendChild(fBtn);
  }
  qActionBar.appendChild(filterBtns);

  qManagerCard.appendChild(qActionBar);

  // Question List Items
  const qListEl = doc.createElement("div");
  qListEl.className = "cunata-question-list";

  const filteredQuestions: { question: WebQuestion; originalIndex: number }[] = [];
  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx]!;
    if (activeSectionFilter === "all" || q.kind === activeSectionFilter) {
      filteredQuestions.push({ question: q, originalIndex: idx });
    }
  }

  if (filteredQuestions.length === 0) {
    const emptyMsg = doc.createElement("p");
    emptyMsg.style.color = "#6b7280";
    emptyMsg.style.fontStyle = "italic";
    emptyMsg.textContent = "Chưa có câu hỏi nào trong phần này. Hãy bấm các nút thêm câu ở trên.";
    qListEl.appendChild(emptyMsg);
  } else {
    for (let fIdx = 0; fIdx < filteredQuestions.length; fIdx++) {
      const item = filteredQuestions[fIdx]!;
      const q = item.question;
      const origIdx = item.originalIndex;
      const isSelected = controller.getSelectedQuestionId() === q.questionVersionId;

      const qRow = doc.createElement("div");
      qRow.className = `cunata-question-item ${isSelected ? "selected" : ""}`;
      qRow.id = `q-item-${q.questionVersionId}`;

      const metaPart = doc.createElement("div");
      metaPart.className = "cunata-question-meta";

      const numBadge = doc.createElement("span");
      numBadge.style.fontWeight = "700";
      numBadge.textContent = `Câu ${origIdx + 1}.`;
      metaPart.appendChild(numBadge);

      const kindBadge = doc.createElement("span");
      kindBadge.className = `cunata-badge cunata-badge-section-${q.kind}`;
      kindBadge.textContent = `Phần ${q.kind}`;
      metaPart.appendChild(kindBadge);

      if (q.difficulty) {
        const diffBadge = doc.createElement("span");
        diffBadge.className = "cunata-badge";
        diffBadge.textContent = q.difficulty;
        metaPart.appendChild(diffBadge);
      }

      const snippet = doc.createElement("span");
      snippet.className = "cunata-question-title-preview";
      snippet.textContent = q.content || q.title || "(Chưa có nội dung)";
      metaPart.appendChild(snippet);

      qRow.appendChild(metaPart);

      // Question Action Buttons
      const actionsDiv = doc.createElement("div");
      actionsDiv.className = "cunata-question-actions";

      // Move Up
      const btnUp = doc.createElement("button");
      btnUp.type = "button";
      btnUp.className = "cunata-btn";
      btnUp.title = "Di chuyển lên trên";
      btnUp.textContent = "↑ Lên";
      btnUp.disabled = origIdx === 0;
      btnUp.onclick = () => controller.reorderQuestion(origIdx, origIdx - 1);
      actionsDiv.appendChild(btnUp);

      // Move Down
      const btnDown = doc.createElement("button");
      btnDown.type = "button";
      btnDown.className = "cunata-btn";
      btnDown.title = "Di chuyển xuống dưới";
      btnDown.textContent = "↓ Xuống";
      btnDown.disabled = origIdx === questions.length - 1;
      btnDown.onclick = () => controller.reorderQuestion(origIdx, origIdx + 1);
      actionsDiv.appendChild(btnDown);

      // Duplicate
      const btnDup = doc.createElement("button");
      btnDup.type = "button";
      btnDup.className = "cunata-btn";
      btnDup.title = "Nhân bản câu hỏi (sinh mã mới và ánh xạ lại khóa)";
      btnDup.textContent = "Nhân bản";
      btnDup.onclick = () => controller.duplicateQuestion(q.questionVersionId);
      actionsDiv.appendChild(btnDup);

      // Delete
      const btnDel = doc.createElement("button");
      btnDel.type = "button";
      btnDel.className = "cunata-btn cunata-btn-danger";
      btnDel.title = "Xóa câu hỏi khỏi đề thi";
      btnDel.textContent = "Xóa";
      btnDel.onclick = () => controller.removeQuestion(q.questionVersionId);
      actionsDiv.appendChild(btnDel);

      // Edit / Select
      const btnSelect = doc.createElement("button");
      btnSelect.type = "button";
      btnSelect.className = isSelected ? "cunata-btn cunata-btn-primary" : "cunata-btn";
      btnSelect.textContent = isSelected ? "Đang sửa" : "Chỉnh sửa";
      btnSelect.onclick = () => controller.setSelectedQuestionId(q.questionVersionId);
      actionsDiv.appendChild(btnSelect);

      qRow.appendChild(actionsDiv);
      qListEl.appendChild(qRow);
    }
  }

  qManagerCard.appendChild(qListEl);
  root.appendChild(qManagerCard);

  // --- Card 4: Active Question Editor Form ---
  const selectedQId = controller.getSelectedQuestionId();
  const selectedQuestion = questions.find((q) => q.questionVersionId === selectedQId);

  if (selectedQuestion) {
    const editorCard = doc.createElement("section");
    editorCard.className = "cunata-card";
    editorCard.setAttribute("aria-labelledby", "heading-question-editor");

    const edTitle = doc.createElement("h2");
    edTitle.className = "cunata-card-title";
    edTitle.id = "heading-question-editor";
    edTitle.textContent = `4. Soạn thảo chi tiết câu hỏi (Phần ${selectedQuestion.kind} - ID: ${selectedQuestion.questionVersionId})`;
    editorCard.appendChild(edTitle);

    renderQuestionForm(editorCard, doc, controller, selectedQuestion, cleanups);
    root.appendChild(editorCard);
  }
}

// ============================================================================
// Question Form Editor
// ============================================================================

function renderQuestionForm(
  container: HTMLElement,
  doc: Document,
  controller: TeacherController,
  question: WebQuestion,
  cleanups: (() => void)[],
): void {
  const qId = question.questionVersionId;

  // Taxonomy & Metadata Grid
  const taxGrid = doc.createElement("div");
  taxGrid.className = "cunata-form-grid";

  // Topic
  const topicGroup = createFormGroup(doc, `topic-${qId}`, "Chủ đề / Chương");
  const topicInput = doc.createElement("input");
  topicInput.type = "text";
  topicInput.className = "cunata-input";
  topicInput.value = question.topic || "";
  const topicGuard = createCompositionGuard({
    element: topicInput,
    onCommit: (val) => controller.updateQuestion(qId, { topic: val }),
  });
  cleanups.push(() => topicGuard.dispose());
  topicGroup.appendChild(topicInput);
  taxGrid.appendChild(topicGroup);

  // Lesson
  const lessonGroup = createFormGroup(doc, `lesson-${qId}`, "Bài học");
  const lessonInput = doc.createElement("input");
  lessonInput.type = "text";
  lessonInput.className = "cunata-input";
  lessonInput.value = question.lesson || "";
  const lessonGuard = createCompositionGuard({
    element: lessonInput,
    onCommit: (val) => controller.updateQuestion(qId, { lesson: val }),
  });
  cleanups.push(() => lessonGuard.dispose());
  lessonGroup.appendChild(lessonInput);
  taxGrid.appendChild(lessonGroup);

  // Difficulty
  const diffGroup = createFormGroup(doc, `diff-${qId}`, "Mức độ nhận thức");
  const diffSelect = doc.createElement("select");
  diffSelect.className = "cunata-select";
  for (const diff of ["Nhận biết", "Thông hiểu", "Vận dụng"] as const) {
    const opt = doc.createElement("option");
    opt.value = diff;
    opt.textContent = diff;
    if (question.difficulty === diff) opt.selected = true;
    diffSelect.appendChild(opt);
  }
  diffSelect.onchange = () => {
    controller.updateQuestion(qId, {
      difficulty: diffSelect.value as "Nhận biết" | "Thông hiểu" | "Vận dụng",
    });
  };
  diffGroup.appendChild(diffSelect);
  taxGrid.appendChild(diffGroup);

  container.appendChild(taxGrid);

  // Content Textarea
  const contentGroup = createFormGroup(doc, `content-${qId}`, "Nội dung câu hỏi");
  const contentArea = doc.createElement("textarea");
  contentArea.className = "cunata-textarea";
  contentArea.rows = 4;
  contentArea.value = question.content || "";
  const contentGuard = createCompositionGuard({
    element: contentArea,
    onCommit: (val) => controller.updateQuestion(qId, { content: val }),
  });
  cleanups.push(() => contentGuard.dispose());
  contentGroup.appendChild(contentArea);
  container.appendChild(contentGroup);

  // Section-specific Sub-Forms
  if (question.kind === "I") {
    renderPartIEditor(container, doc, controller, question as Extract<WebQuestion, { kind: "I" }>, cleanups);
  } else if (question.kind === "II") {
    renderPartIIEditor(container, doc, controller, question as Extract<WebQuestion, { kind: "II" }>, cleanups);
  } else if (question.kind === "III") {
    renderPartIIIEditor(container, doc, controller, question as Extract<WebQuestion, { kind: "III" }>, cleanups);
  }

  // Explanation Textarea
  const expGroup = createFormGroup(doc, `exp-${qId}`, "Lời giải thích chi tiết (tùy chọn)");
  const expArea = doc.createElement("textarea");
  expArea.className = "cunata-textarea";
  expArea.rows = 3;
  expArea.value = question.explanation || "";
  const expGuard = createCompositionGuard({
    element: expArea,
    onCommit: (val) => controller.updateQuestion(qId, { explanation: val }),
  });
  cleanups.push(() => expGuard.dispose());
  expGroup.appendChild(expArea);
  container.appendChild(expGroup);
}

// --- Part I Editor (4 options, correctOptionId) ---
function renderPartIEditor(
  container: HTMLElement,
  doc: Document,
  controller: TeacherController,
  qI: Extract<WebQuestion, { kind: "I" }>,
  cleanups: (() => void)[],
): void {
  const sectionFieldset = doc.createElement("fieldset");
  sectionFieldset.style.border = "1px solid #e5e7eb";
  sectionFieldset.style.borderRadius = "0.375rem";
  sectionFieldset.style.padding = "1rem";
  sectionFieldset.style.marginBottom = "1rem";

  const legend = doc.createElement("legend");
  legend.style.fontWeight = "700";
  legend.style.padding = "0 0.5rem";
  legend.textContent = "Các lựa chọn A, B, C, D (chọn nút tròn để đặt đáp án đúng):";
  sectionFieldset.appendChild(legend);

  const options = qI.options ?? [];
  for (let idx = 0; idx < options.length; idx++) {
    const opt = options[idx]!;
    const row = doc.createElement("div");
    row.className = "cunata-option-row";

    // Radio button to select correct option
    const radio = doc.createElement("input");
    radio.type = "radio";
    radio.name = `correct-${qI.questionVersionId}`;
    radio.className = "cunata-radio-correct";
    radio.id = `radio-${opt.optionId}`;
    radio.checked = qI.correctOptionId === opt.optionId;
    radio.title = `Chọn ${opt.label || String.fromCharCode(65 + idx)} là đáp án đúng`;
    radio.onchange = () => {
      controller.updateQuestion(qI.questionVersionId, { correctOptionId: opt.optionId });
    };
    row.appendChild(radio);

    // Label
    const lbl = doc.createElement("span");
    lbl.className = "cunata-option-label";
    lbl.textContent = `${opt.label || String.fromCharCode(65 + idx)}.`;
    row.appendChild(lbl);

    // Input for option text
    const optInput = doc.createElement("input");
    optInput.type = "text";
    optInput.className = "cunata-input";
    optInput.value = opt.text;
    optInput.placeholder = `Nội dung lựa chọn ${opt.label || String.fromCharCode(65 + idx)}...`;
    const optGuard = createCompositionGuard({
      element: optInput,
      onCommit: (val) => {
        const newOptions = [...options];
        newOptions[idx] = { ...opt, text: val };
        controller.updateQuestion(qI.questionVersionId, { options: newOptions });
      },
    });
    cleanups.push(() => optGuard.dispose());
    row.appendChild(optInput);

    sectionFieldset.appendChild(row);
  }

  container.appendChild(sectionFieldset);
}

// --- Part II Editor (4 statements, True/False) ---
function renderPartIIEditor(
  container: HTMLElement,
  doc: Document,
  controller: TeacherController,
  qII: Extract<WebQuestion, { kind: "II" }>,
  cleanups: (() => void)[],
): void {
  const sectionFieldset = doc.createElement("fieldset");
  sectionFieldset.style.border = "1px solid #e5e7eb";
  sectionFieldset.style.borderRadius = "0.375rem";
  sectionFieldset.style.padding = "1rem";
  sectionFieldset.style.marginBottom = "1rem";

  const legend = doc.createElement("legend");
  legend.style.fontWeight = "700";
  legend.style.padding = "0 0.5rem";
  legend.textContent = "4 Ý Đúng/Sai (Đạt 0, 1, 2, 3, 4 ý đúng tương ứng 0 / 0,1 / 0,25 / 0,5 / 1,0 điểm):";
  sectionFieldset.appendChild(legend);

  const statements = qII.statements ?? [];
  for (let idx = 0; idx < statements.length; idx++) {
    const stmt = statements[idx]!;
    const row = doc.createElement("div");
    row.className = "cunata-statement-row";

    const lbl = doc.createElement("span");
    lbl.className = "cunata-option-label";
    lbl.textContent = `${stmt.label || String.fromCharCode(97 + idx)})`;
    row.appendChild(lbl);

    const stmtInput = doc.createElement("input");
    stmtInput.type = "text";
    stmtInput.className = "cunata-input";
    stmtInput.style.flex = "1";
    stmtInput.value = stmt.text;
    stmtInput.placeholder = `Nội dung phát biểu ${stmt.label || String.fromCharCode(97 + idx)}...`;
    const stmtGuard = createCompositionGuard({
      element: stmtInput,
      onCommit: (val) => {
        const newStmts = [...statements];
        newStmts[idx] = { ...stmt, text: val };
        controller.updateQuestion(qII.questionVersionId, { statements: newStmts });
      },
    });
    cleanups.push(() => stmtGuard.dispose());
    row.appendChild(stmtInput);

    // True/False Select
    const ansSelect = doc.createElement("select");
    ansSelect.className = "cunata-select";
    ansSelect.style.width = "120px";
    const optTrue = doc.createElement("option");
    optTrue.value = "true";
    optTrue.textContent = "ĐÚNG";
    if (stmt.answer === true) optTrue.selected = true;
    ansSelect.appendChild(optTrue);

    const optFalse = doc.createElement("option");
    optFalse.value = "false";
    optFalse.textContent = "SAI";
    if (stmt.answer === false) optFalse.selected = true;
    ansSelect.appendChild(optFalse);

    ansSelect.onchange = () => {
      const isTrue = ansSelect.value === "true";
      const newStmts = [...statements];
      newStmts[idx] = { ...stmt, answer: isTrue };
      controller.updateQuestion(qII.questionVersionId, { statements: newStmts });
    };
    row.appendChild(ansSelect);

    sectionFieldset.appendChild(row);
  }

  container.appendChild(sectionFieldset);
}

// --- Part III Editor (Raw answer key exactness) ---
function renderPartIIIEditor(
  container: HTMLElement,
  doc: Document,
  controller: TeacherController,
  qIII: Extract<WebQuestion, { kind: "III" }>,
  cleanups: (() => void)[],
): void {
  const keyGroup = createFormGroup(
    doc,
    `key-${qIII.questionVersionId}`,
    "Đáp án chuẩn (Tối đa 4 ký tự, đối chiếu ký tự chính xác):",
    undefined,
    "Quy chuẩn: Chỉ gồm các chữ số 0-9, dấu trừ (-) và dấu phẩy (,). '1,5' khác '1,50', '1,5' khác '1.5', '-0,5' chiếm 4 ký tự. Không tự động làm tròn hay đổi dấu.",
  );

  const keyInput = doc.createElement("input");
  keyInput.type = "text";
  keyInput.maxLength = 4;
  keyInput.id = `input-key-${qIII.questionVersionId}`;
  keyInput.className = "cunata-input";
  keyInput.style.maxWidth = "200px";
  keyInput.style.fontWeight = "700";
  keyInput.style.letterSpacing = "2px";
  keyInput.value = qIII.answerKey;

  // Immediate exactness validation feedback
  const issueMsg = doc.createElement("div");
  issueMsg.className = "cunata-field-error";
  const issues = checkShortAnswer(qIII.answerKey);
  if (issues.length > 0) {
    keyInput.setAttribute("aria-invalid", "true");
    issueMsg.textContent = `Lỗi ký tự: ${issues.join(", ")} (chỉ cho phép 0-9, '-', ',' tối đa 4 ký tự)`;
  }

  const keyGuard = createCompositionGuard({
    element: keyInput,
    onCommit: (val) => {
      // PRESERVE RAW EXACTNESS: Never trim, never coerce to number, never replace comma with dot
      controller.updateQuestion(qIII.questionVersionId, { answerKey: val });
    },
  });
  cleanups.push(() => keyGuard.dispose());

  keyGroup.appendChild(keyInput);
  keyGroup.appendChild(issueMsg);
  container.appendChild(keyGroup);
}

// ============================================================================
// Preview Mode Subsystem (Candidate View & Explicit Publish)
// ============================================================================

function renderPreviewMode(
  root: HTMLElement,
  doc: Document,
  controller: TeacherController,
  exam: WebExam,
  computedMax: ExamMax,
): void {
  const previewContainer = doc.createElement("section");
  previewContainer.className = "cunata-preview-container";
  previewContainer.setAttribute("aria-label", "Xem trước đề thi hoàn chỉnh");

  // Header Summary
  const pHeader = doc.createElement("div");
  pHeader.className = "cunata-preview-header";

  const pTitle = doc.createElement("h2");
  pTitle.style.margin = "0 0 0.5rem 0";
  pTitle.textContent = exam.title;
  pHeader.appendChild(pTitle);

  const pMeta = doc.createElement("div");
  pMeta.style.color = "#4b5563";
  pMeta.style.fontSize = "0.9375rem";
  pMeta.textContent = `Môn: ${exam.subject} | Lớp: ${exam.grade} | Thời gian làm bài: ${exam.settings.durationMinutes} phút | Điểm tối đa: ${toFractionString(computedMax.maxTotal)} điểm`;
  pHeader.appendChild(pMeta);

  previewContainer.appendChild(pHeader);

  // Render All Questions
  const questions = exam.questions ?? [];
  for (let idx = 0; idx < questions.length; idx++) {
    const q = questions[idx]!;
    const qCard = doc.createElement("div");
    qCard.className = "cunata-preview-question";

    const qNum = doc.createElement("h3");
    qNum.style.fontSize = "1rem";
    qNum.style.margin = "0 0 0.5rem 0";
    qNum.textContent = `Câu ${idx + 1} [Phần ${q.kind}]: ${q.title || ""}`;
    qCard.appendChild(qNum);

    if (q.content) {
      const qContent = doc.createElement("div");
      qContent.style.marginBottom = "0.75rem";
      qContent.textContent = q.content;
      qCard.appendChild(qContent);
    }

    if (q.kind === "I") {
      const qI = q as Extract<WebQuestion, { kind: "I" }>;
      const optList = doc.createElement("div");
      optList.style.display = "flex";
      optList.style.flexDirection = "column";
      optList.style.gap = "0.5rem";

      for (let oIdx = 0; oIdx < qI.options.length; oIdx++) {
        const opt = qI.options[oIdx]!;
        const isCorrect = qI.correctOptionId === opt.optionId;
        const optLine = doc.createElement("div");
        optLine.style.padding = "0.375rem 0.5rem";
        optLine.style.borderRadius = "0.25rem";
        if (isCorrect) {
          optLine.style.backgroundColor = "#ecfdf5";
          optLine.style.border = "1px solid #a7f3d0";
        }
        optLine.textContent = `${opt.label || String.fromCharCode(65 + oIdx)}. ${opt.text}`;
        if (isCorrect) {
          const badge = doc.createElement("span");
          badge.className = "cunata-preview-correct-badge";
          badge.textContent = "Đáp án chuẩn";
          optLine.appendChild(badge);
        }
        optList.appendChild(optLine);
      }
      qCard.appendChild(optList);
    } else if (q.kind === "II") {
      const qII = q as Extract<WebQuestion, { kind: "II" }>;
      const stmtList = doc.createElement("div");
      stmtList.style.display = "flex";
      stmtList.style.flexDirection = "column";
      stmtList.style.gap = "0.5rem";

      for (let sIdx = 0; sIdx < qII.statements.length; sIdx++) {
        const stmt = qII.statements[sIdx]!;
        const stmtLine = doc.createElement("div");
        stmtLine.style.padding = "0.375rem 0.5rem";
        stmtLine.style.borderRadius = "0.25rem";
        stmtLine.style.backgroundColor = "#f9fafb";
        stmtLine.style.border = "1px solid #e5e7eb";

        stmtLine.textContent = `${stmt.label || String.fromCharCode(97 + sIdx)}) ${stmt.text}`;
        const ansTag = doc.createElement("span");
        ansTag.className = "cunata-badge";
        ansTag.style.marginLeft = "0.75rem";
        ansTag.textContent = stmt.answer ? "ĐÚNG" : "SAI";
        if (stmt.answer) {
          ansTag.style.backgroundColor = "#dcfce7";
          ansTag.style.color = "#166534";
        } else {
          ansTag.style.backgroundColor = "#fee2e2";
          ansTag.style.color = "#991b1b";
        }
        stmtLine.appendChild(ansTag);
        stmtList.appendChild(stmtLine);
      }
      qCard.appendChild(stmtList);
    } else if (q.kind === "III") {
      const qIII = q as Extract<WebQuestion, { kind: "III" }>;
      const keyLine = doc.createElement("div");
      keyLine.style.padding = "0.5rem";
      keyLine.style.backgroundColor = "#f0fdf4";
      keyLine.style.border = "1px solid #bbf7d0";
      keyLine.style.borderRadius = "0.25rem";
      keyLine.textContent = `Đáp án chuẩn (nguyên văn): [${qIII.answerKey}]`;
      qCard.appendChild(keyLine);
    }

    if (q.explanation) {
      const expBox = doc.createElement("div");
      expBox.style.marginTop = "0.5rem";
      expBox.style.fontSize = "0.875rem";
      expBox.style.color = "#4b5563";
      expBox.textContent = `Lời giải: ${q.explanation}`;
      qCard.appendChild(expBox);
    }

    previewContainer.appendChild(qCard);
  }

  // --- Publish Panel ---
  const pubPanel = doc.createElement("div");
  pubPanel.className = "cunata-publish-panel";

  const pubHeading = doc.createElement("h3");
  pubHeading.style.margin = "0 0 0.75rem 0";
  pubHeading.textContent = "Xác nhận xuất bản đề thi (Explicit Publish)";
  pubPanel.appendChild(pubHeading);

  const errors = controller.getValidationErrors();
  const isValid = Object.keys(errors).length === 0;

  if (!isValid) {
    const warn = doc.createElement("p");
    warn.style.color = "#dc2626";
    warn.style.fontWeight = "600";
    warn.textContent = "Đề thi còn một số lỗi chưa hoàn thiện. Vui lòng quay lại chế độ Chỉnh sửa để sửa trước khi xuất bản.";
    pubPanel.appendChild(warn);
  } else {
    const ready = doc.createElement("p");
    ready.style.color = "#16a34a";
    ready.style.fontWeight = "600";
    ready.textContent = "Đề thi đã đầy đủ thông tin hợp lệ và sẵn sàng xuất bản.";
    pubPanel.appendChild(ready);
  }

  const pubRow = doc.createElement("div");
  pubRow.className = "cunata-publish-row";

  const verGroup = doc.createElement("div");
  verGroup.style.flex = "1";
  verGroup.style.minWidth = "200px";

  const verLabel = doc.createElement("label");
  verLabel.className = "cunata-label";
  verLabel.textContent = "Mã phiên bản mới (versionId):";
  verGroup.appendChild(verLabel);

  const verInput = doc.createElement("input");
  verInput.type = "text";
  verInput.id = "field-publish-version";
  verInput.className = "cunata-input";
  verInput.value = controller.getPublishVersionId();
  verInput.placeholder = "Ví dụ: v1.1.0, v2.0.0...";
  verInput.oninput = () => controller.setPublishVersionId(verInput.value);
  verGroup.appendChild(verInput);
  pubRow.appendChild(verGroup);

  const btnPublish = doc.createElement("button");
  btnPublish.type = "button";
  btnPublish.className = "cunata-btn cunata-btn-primary";
  btnPublish.id = "btn-confirm-publish";
  btnPublish.textContent = "Xác nhận xuất bản (Publish)";
  btnPublish.disabled = !isValid;
  btnPublish.onclick = async () => {
    btnPublish.disabled = true;
    await controller.publish();
  };
  pubRow.appendChild(btnPublish);

  pubPanel.appendChild(pubRow);
  previewContainer.appendChild(pubPanel);

  root.appendChild(previewContainer);
}

// ============================================================================
// DOM Helper Utilities
// ============================================================================

function createFormGroup(
  doc: Document,
  name: string,
  label: string,
  error?: string,
  hint?: string,
): HTMLElement {
  const group = doc.createElement("div");
  group.className = "cunata-form-group";

  const lbl = doc.createElement("label");
  lbl.className = "cunata-label";
  lbl.htmlFor = `field-${name}`;
  lbl.textContent = label;
  group.appendChild(lbl);

  if (hint) {
    const hintEl = doc.createElement("span");
    hintEl.className = "cunata-field-hint";
    hintEl.textContent = hint;
    group.appendChild(hintEl);
  }

  if (error) {
    const errEl = doc.createElement("span");
    errEl.className = "cunata-field-error";
    errEl.id = `error-${name}`;
    errEl.textContent = error;
    group.appendChild(errEl);
  }

  return group;
}

function createSectionToggle(
  doc: Document,
  section: Section,
  label: string,
  count: number,
  checked: boolean,
  onChange: (enabled: boolean) => void,
): HTMLElement {
  const wrapper = doc.createElement("label");
  wrapper.className = "cunata-toggle-item";

  const cb = doc.createElement("input");
  cb.type = "checkbox";
  cb.id = `toggle-section-${section}`;
  cb.checked = checked;
  cb.onchange = () => onChange(cb.checked);
  wrapper.appendChild(cb);

  const txt = doc.createElement("span");
  txt.style.fontWeight = "600";
  txt.textContent = `${label} (${count} câu)`;
  wrapper.appendChild(txt);

  return wrapper;
}

function createScoreCard(
  doc: Document,
  title: string,
  score: string,
  subtitle: string,
  isTotal: boolean = false,
): HTMLElement {
  const card = doc.createElement("div");
  card.className = `cunata-score-card ${isTotal ? "cunata-score-total" : ""}`;

  const tEl = doc.createElement("div");
  tEl.className = "cunata-score-title";
  tEl.textContent = title;
  card.appendChild(tEl);

  const vEl = doc.createElement("div");
  vEl.className = "cunata-score-value";
  vEl.textContent = score;
  card.appendChild(vEl);

  const sEl = doc.createElement("div");
  sEl.style.fontSize = "0.75rem";
  sEl.style.color = "#6b7280";
  sEl.textContent = subtitle;
  card.appendChild(sEl);

  return card;
}
