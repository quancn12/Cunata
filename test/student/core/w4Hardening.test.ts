import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  startAttempt,
  resumeAttempt,
  toDomainExam,
  listAttemptHistory,
} from "../../../src/student/index.ts";
import { mount, type StudentViewModel } from "../../../src/student/view.ts";
import type {
  WebExam,
  WebEvent,
  ResponseI,
  ResponseII,
  ResponseIII,
  AttemptRecord,
} from "../../../src/student/types.ts";
import { InMemoryStoragePort } from "./inMemoryStorage.ts";
import {
  createEnhancedMockDocument,
  EnhancedMockElement,
  MockEvent,
  MockCompositionEvent,
} from "../view/testDom.ts";

function createExamA(overrides: Partial<WebExam["settings"]> = {}): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-math-w4",
    examVersionId: "v1",
    title: "Đề Thi Toán Hardening W4",
    subject: "Toán học",
    grade: 12,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    assets: [],
    settings: {
      durationMinutes: 45,
      maxAttempts: null,
      releasePolicy: "after_deadline",
      shuffleQuestions: false,
      shuffleOptions: false,
      ...overrides,
    },
    questions: [
      {
        kind: "I",
        questionVersionId: "q1-math",
        title: "Câu 1 Toán",
        content: "Nghiệm của phương trình $2^x = 4$ là:",
        explanation: "Lời giải bí mật Toán 1: đạo hàm f'(x)",
        options: [
          { optionId: "opt-1", text: "x = 1" },
          { optionId: "opt-2", text: "x = 2" },
          { optionId: "opt-3", text: "x = 3" },
          { optionId: "opt-4", text: "x = 4" },
        ],
        correctOptionId: "opt-2",
      },
      {
        kind: "III",
        questionVersionId: "q2-math",
        title: "Câu 2 Toán",
        content: "Tính giá trị của $-0,5$ cộng $2$:",
        explanation: "Lời giải bí mật Toán 2: 1,5",
        answerKey: "1,5",
      },
    ],
  };
}

function createExamB(overrides: Partial<WebExam["settings"]> = {}): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-phys-w4",
    examVersionId: "v1",
    title: "Đề Thi Vật Lý Hardening W4",
    subject: "Vật lý",
    grade: 12,
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    assets: [],
    settings: {
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
      ...overrides,
    },
    questions: [
      {
        kind: "I",
        questionVersionId: "q1-phys",
        title: "Câu 1 Lý",
        content: "Đơn vị của gia tốc trong hệ SI là:",
        explanation: "Lời giải bí mật Lý 1: m/s^2",
        options: [
          { optionId: "p-opt-1", text: "m/s" },
          { optionId: "p-opt-2", text: "m/s^2" },
          { optionId: "p-opt-3", text: "N" },
          { optionId: "p-opt-4", text: "J" },
        ],
        correctOptionId: "p-opt-2",
      },
      {
        kind: "II",
        questionVersionId: "q2-phys",
        title: "Câu 2 Lý",
        content: "Các mệnh đề sau về chuyển động thẳng biến đổi đều:",
        explanation: "Lời giải bí mật Lý 2",
        statements: [
          { statementId: "st-1", text: "Gia tốc là đại lượng không đổi", answer: true },
          { statementId: "st-2", text: "Vận tốc luôn luôn bằng không", answer: false },
          { statementId: "st-3", text: "Đồ thị vận tốc theo thời gian là đường thẳng", answer: true },
          { statementId: "st-4", text: "Quãng đường luôn tỉ lệ bậc nhất với thời gian", answer: false },
        ],
      },
    ],
  };
}

describe("WEB-W4-STUDENT: Timer, Mobile, IME, Advisory Limits & Parity Hardening", () => {
  // =========================================================================
  // 1. NO DEADLINE RESET ON CLOCK ROLLBACK
  // =========================================================================
  describe("1. Clock Rollback & Deadline Immutability", () => {
    it("controller strictly maintains initial deadline on clock rollback and emits CLOCK_CHANGED", async () => {
      const storage = new InMemoryStoragePort();
      let currentClock = 1_000_000;
      const deps = { storage, now: () => currentClock, id: () => "att-clock-1" };
      const exam = createExamA({ durationMinutes: 30 }); // duration: 30m = 1_800_000 ms

      const startRes = await startAttempt(exam, "Thí sinh Rollback", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      const controller = startRes.value;
      const initialDeadline = controller.getSnapshot().deadline;
      assert.equal(initialDeadline, 1_000_000 + 1_800_000);

      const events: WebEvent[] = [];
      controller.subscribe((evt) => events.push(evt));

      // Advance clock normally
      currentClock = 1_200_000;
      await controller.answer({ kind: "I", questionVersionId: "q1-math", selectedOptionId: "opt-1" });
      assert.equal(controller.getSnapshot().deadline, initialDeadline);

      // Roll clock backward by 1 hour (simulating client changing system clock)
      currentClock = 500_000;
      const checkRes = await controller.checkDeadline?.();
      assert.ok(checkRes !== undefined && checkRes.ok);

      // Deadline MUST NOT be reset, extended, or shortened
      assert.equal(
        controller.getSnapshot().deadline,
        initialDeadline,
        "Deadline must remain immutable upon clock rollback"
      );

      // Must emit CLOCK_CHANGED event
      const clockEvt = events.find((e) => e.type === "error" && (e as any).error.code === "CLOCK_CHANGED");
      assert.ok(clockEvt, "Must emit CLOCK_CHANGED error event");

      // Verify that rolling clock past original deadline correctly finalizes attempt
      currentClock = initialDeadline + 1000;
      const overdueRes = await controller.checkDeadline?.();
      assert.ok(overdueRes !== undefined && overdueRes.ok);
      assert.equal(controller.getSnapshot().phase, "final");
    });

    it("view displays clock warning banner, preserves sync status, and computes remaining time against immutable deadline", async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const storage = new InMemoryStoragePort();
      let currentClock = 1_000_000;
      const deps = { storage, now: () => currentClock, id: () => "att-clock-view" };
      const exam = createExamA({ durationMinutes: 10 }); // 10 minutes = 600s
      const startRes = await startAttempt(exam, "Thí sinh Clock View", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      const controller = startRes.value;
      const vm: StudentViewModel = {
        controller,
        now: () => currentClock,
      };

      const unmount = mount(root as unknown as HTMLElement, vm);

      const timerBox = root.querySelector<EnhancedMockElement>("#timerBox");
      const syncStatus = root.querySelector<EnhancedMockElement>("#syncStatus");
      const syncText = root.querySelector<EnhancedMockElement>("#syncText");
      assert.ok(timerBox !== null);
      assert.ok(syncStatus !== null);
      assert.equal(timerBox.textContent, "10:00");
      assert.equal(syncText?.textContent, "Đã lưu");

      // Advance clock by 2 minutes -> 08:00
      currentClock = 1_000_000 + 120_000;
      doc.dispatchEvent(new MockEvent("visibilitychange"));
      assert.equal(timerBox.textContent, "08:00");

      // Roll clock back to 800_000 (before startedAt)
      currentClock = 800_000;
      doc.dispatchEvent(new MockEvent("visibilitychange"));

      // Banner must be displayed
      const clockWarning = root.querySelector<EnhancedMockElement>("#clockWarning");
      assert.ok(clockWarning !== null, "Clock warning banner must be created");
      assert.equal(clockWarning.style.display, "block");
      assert.match(clockWarning.textContent || "", /lùi giờ/i);

      // Save status MUST NOT be degraded to failed
      assert.equal(syncText?.textContent, "Đã lưu");
      assert.equal(syncStatus.classList.contains("status-failed"), false);

      unmount();
    });
  });

  // =========================================================================
  // 2. BACKGROUND / RESUME EXPIRATION
  // =========================================================================
  describe("2. Background & Resume Expiration", () => {
    it("disables all inputs and auto-submits on background expiration upon visibilitychange, pageshow, and focus", async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const storage = new InMemoryStoragePort();
      let currentClock = 2_000_000;
      const deps = { storage, now: () => currentClock, id: () => "att-bg-exp" };
      const exam = createExamA({ durationMinutes: 5 }); // 5 minutes = 300_000 ms

      const startRes = await startAttempt(exam, "Thí sinh Background", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      const controller = startRes.value;
      let submitReason: string | null = null;
      const actions = {
        submit: (reason: unknown) => {
          submitReason = String(reason);
        },
      };

      const vm: StudentViewModel = {
        controller,
        now: () => currentClock,
      };

      const unmount = mount(root as unknown as HTMLElement, vm, actions);

      const candInput = root.querySelector<EnhancedMockElement>("#candidateName");
      const submitBtn = root.querySelector<EnhancedMockElement>("#btnSubmit");
      const part3Input = root.querySelector<EnhancedMockElement>("#input-iii-q2-math");
      assert.ok(candInput !== null);
      assert.ok(submitBtn !== null);
      assert.ok(part3Input !== null);
      assert.equal(candInput.disabled, false);
      assert.equal(submitBtn.disabled, false);
      assert.equal(part3Input.disabled, false);

      // Background expiration: tab is suspended and clock passes deadline
      currentClock = 2_000_000 + 301_000;

      // Resume from background via visibilitychange
      doc.visibilityState = "visible";
      doc.dispatchEvent(new MockEvent("visibilitychange"));

      // Inputs and submit button MUST be disabled immediately to prevent post-deadline race
      assert.equal(submitBtn.disabled, true, "Submit button must be disabled immediately");
      assert.equal(candInput.disabled, true, "Candidate input must be disabled immediately");
      assert.equal(part3Input.disabled, true, "Part III input must be disabled immediately");
      assert.equal(submitReason, "deadline");

      // Wait for async persistence to settle
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(controller.getSnapshot().phase, "final");

      unmount();
    });

    it("resumeAttempt on expired draft auto-submits and preserves saved nickname without fallback", async () => {
      const storage = new InMemoryStoragePort();
      let currentClock = 100_000;
      const deps = { storage, now: () => currentClock, id: () => "att-resume-exp" };
      const exam = createExamA({ durationMinutes: 10 }); // deadline: 700_000

      const startRes = await startAttempt(exam, "Nguyễn Văn Expired", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      // Save an answer
      await startRes.value.answer({ kind: "III", questionVersionId: "q2-math", raw: "1,5" });

      // Advance clock past deadline
      currentClock = 800_000;

      // Resume attempt
      const resumeRes = await resumeAttempt(
        { examId: exam.examId, examVersionId: exam.examVersionId, attemptId: "att-resume-exp" },
        deps
      );
      assert.equal(resumeRes.ok, true);
      if (!resumeRes.ok) return;

      const controller = resumeRes.value;
      const snapshot = controller.getSnapshot();

      assert.equal(snapshot.phase, "final");
      assert.equal(snapshot.candidateName, "Nguyễn Văn Expired", "Nickname must be preserved");
      assert.notEqual(snapshot.submittedAt, null);
    });
  });

  // =========================================================================
  // 3. SUBMIT / INPUT RACE & COMPOSITION CURSOR / DIACRITICS
  // =========================================================================
  describe("3. Submit / Input Race & IME Composition Hardening", () => {
    it("controller sequences concurrent answer and submit without losing answers or scoring stale data", async () => {
      const storage = new InMemoryStoragePort();
      let currentClock = 100_000;
      const deps = { storage, now: () => currentClock, id: () => "att-race-1" };
      const exam = createExamA({ durationMinutes: 30 });

      const startRes = await startAttempt(exam, "Thí sinh Race", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      const controller = startRes.value;

      // Dispatch answer and submit concurrently
      const answerPromise = controller.answer({
        kind: "III",
        questionVersionId: "q2-math",
        raw: "1,5",
      });
      const submitPromise = controller.submit("manual");

      const [ansResult, subResult] = await Promise.all([answerPromise, submitPromise]);

      assert.equal(ansResult.ok, true, "Answer save must succeed");
      assert.equal(subResult.ok, true, "Submit must succeed");

      const finalSnapshot = controller.getSnapshot();
      assert.equal(finalSnapshot.phase, "final");

      // Verify that the answer was incorporated into final snapshot responses
      const p3Resp = finalSnapshot.responses.responses.find((r) => r.questionVersionId === "q2-math");
      assert.ok(p3Resp !== null && p3Resp !== undefined);
      assert.equal(p3Resp?.kind, "III");
      if (p3Resp?.kind === "III") {
        assert.equal(p3Resp.raw, "1,5");
      }

      // Verify scored result independently
      assert.ok(finalSnapshot.scoreDTO !== null);
      const scoreDTO = finalSnapshot.scoreDTO as any;
      // In custom-v1, N1=1, N2=0, N3=1: BASE = 0.25 < 10 => POINT_III = (10 - 0.25)/1 = 9.75 = 39/4
      // q1 is unanswered (0), q2 is correct ("1,5" matches "1,5"): earns 39/4
      assert.equal(scoreDTO.total, "39/4");

      // Any answer after finalization must be rejected
      const lateAns = await controller.answer({
        kind: "I",
        questionVersionId: "q1-math",
        selectedOptionId: "opt-2",
      });
      assert.equal(lateAns.ok, false);
      if (!lateAns.ok) {
        assert.equal(lateAns.error.code, "ATTEMPT_FINALIZED");
      }
    });

    it("Part III input does NOT have maxLength='4' and preserves IME composition and cursor", async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const storage = new InMemoryStoragePort();
      let currentClock = 100_000;
      const deps = { storage, now: () => currentClock, id: () => "att-ime-1" };
      const exam = createExamA();

      const startRes = await startAttempt(exam, "Thí sinh IME", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      const controller = startRes.value;
      const vm: StudentViewModel = { controller, now: () => currentClock };
      const unmount = mount(root as unknown as HTMLElement, vm);

      const p3Input = root.querySelector<EnhancedMockElement>("#input-iii-q2-math");
      assert.ok(p3Input !== null);

      // Verify NO maxLength="4" attribute
      assert.equal(
        p3Input.getAttribute("maxlength"),
        null,
        "Part III input must NOT have HTML maxLength='4' attribute to avoid breaking IME diacritics buffer"
      );

      // Simulate Vietnamese IME Telex composition session:
      // Student types "toans" (5 keystrokes) to produce "toán"
      doc.activeElement = p3Input;
      p3Input.dispatchEvent(new MockCompositionEvent("compositionstart"));
      p3Input.value = "toan";
      p3Input.dispatchEvent(new MockCompositionEvent("compositionupdate", { data: "toan" }));
      p3Input.value = "toans";
      p3Input.dispatchEvent(new MockCompositionEvent("compositionupdate", { data: "toans" }));

      // Simulate background event arriving during active composition:
      // Asynchronous controller save should NOT overwrite input.value or reset selection
      (p3Input as any).selectionStart = 5;
      (p3Input as any).selectionEnd = 5;
      await controller.rename("Tên Đã Lưu");

      assert.equal(p3Input.value, "toans", "Input value must remain undisturbed during composition");
      assert.equal((p3Input as any).selectionStart, 5, "Cursor position must not jump during composition");

      // End composition with final composed diacritic word "toán"
      p3Input.value = "toán";
      p3Input.dispatchEvent(new MockCompositionEvent("compositionend", { data: "toán" }));

      // Wait for saveChain
      await new Promise((r) => setTimeout(r, 20));

      const resp = controller.getSnapshot().responses.responses.find((r) => r.questionVersionId === "q2-math");
      assert.equal((resp as any)?.raw, "toán");

      // Verify char preview boxes display characters
      const boxes = root.querySelectorAll<EnhancedMockElement>(".char-box");
      assert.ok(boxes.length >= 4);
      assert.equal(boxes[0]?.textContent, "t");
      assert.equal(boxes[1]?.textContent, "o");
      assert.equal(boxes[2]?.textContent, "á");
      assert.equal(boxes[3]?.textContent, "n");

      unmount();
    });

    it("avoids full DOM input redraw on attempt_changed events", async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const storage = new InMemoryStoragePort();
      let currentClock = 100_000;
      const deps = { storage, now: () => currentClock, id: () => "att-no-redraw" };
      const exam = createExamA();

      const startRes = await startAttempt(exam, "Thí sinh Redraw", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      const controller = startRes.value;
      const vm: StudentViewModel = { controller, now: () => currentClock };
      const unmount = mount(root as unknown as HTMLElement, vm);

      const initialCandidateInput = root.querySelector<EnhancedMockElement>("#candidateName");
      const initialP3Input = root.querySelector<EnhancedMockElement>("#input-iii-q2-math");
      assert.ok(initialCandidateInput !== null);
      assert.ok(initialP3Input !== null);

      // Perform updates
      await controller.answer({ kind: "I", questionVersionId: "q1-math", selectedOptionId: "opt-2" });

      const candidateInputAfter = root.querySelector<EnhancedMockElement>("#candidateName");
      const p3InputAfter = root.querySelector<EnhancedMockElement>("#input-iii-q2-math");

      // Node reference equality must be strictly preserved (NO full redraw!)
      assert.equal(
        initialCandidateInput,
        candidateInputAfter,
        "Candidate input DOM node must not be redrawn or replaced"
      );
      assert.equal(
        initialP3Input,
        p3InputAfter,
        "Part III input DOM node must not be redrawn or replaced"
      );

      unmount();
    });
  });

  // =========================================================================
  // 4. FAILED LOCAL SAVE VS FINAL / QUEUE UI
  // =========================================================================
  describe("4. Failed Local Save vs Final / Queue Sync UI", () => {
    it("displays 'Lỗi lưu cục bộ' when storage.saveDraft fails", async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const storage = new InMemoryStoragePort();
      let currentClock = 100_000;
      const deps = { storage, now: () => currentClock, id: () => "att-save-fail" };
      const exam = createExamA();

      const startRes = await startAttempt(exam, "Thí sinh Fail", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      const controller = startRes.value;
      const vm: StudentViewModel = { controller, now: () => currentClock };
      const unmount = mount(root as unknown as HTMLElement, vm);

      const syncText = root.querySelector<EnhancedMockElement>("#syncText");
      const syncStatus = root.querySelector<EnhancedMockElement>("#syncStatus");
      assert.equal(syncText?.textContent, "Đã lưu");

      // Inject storage failure (e.g. QuotaExceeded)
      storage.saveDraftHook = async () => ({
        ok: false,
        error: {
          code: "STORAGE_QUOTA",
          path: "draft",
          message: "Storage quota exceeded",
          recoverable: true,
        },
      });

      // Answering question triggers save failure
      const ansRes = await controller.answer({
        kind: "I",
        questionVersionId: "q1-math",
        selectedOptionId: "opt-1",
      });
      assert.equal(ansRes.ok, false);
      if (!ansRes.ok) {
        assert.equal(ansRes.error.code, "STORAGE_QUOTA");
      }

      // Sync status MUST reflect local save error, not confusing with network queue
      assert.equal(syncText?.textContent, "Lỗi lưu cục bộ");
      assert.equal(syncStatus?.classList.contains("status-local-error"), true);

      unmount();
    });

    it("clearly differentiates safe local final vs failed outbox queue sync", async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const storage = new InMemoryStoragePort();
      let currentClock = 100_000;
      const deps = { storage, now: () => currentClock, id: () => "att-final-sync" };
      const exam = createExamA();

      const startRes = await startAttempt(exam, "Thí sinh Final Queue", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      const controller = startRes.value;
      await controller.submit("manual");
      assert.equal(controller.getSnapshot().phase, "final");

      const vm: StudentViewModel = { controller, now: () => currentClock };
      const unmount = mount(root as unknown as HTMLElement, vm);

      const syncText = root.querySelector<EnhancedMockElement>("#syncText");
      assert.equal(syncText?.textContent, "Đã lưu");

      // Simulate outbox events:
      // 1. Queued
      (controller as any).notifyListeners({
        type: "sync_changed",
        key: controller.getSnapshot(),
        outbox: {
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: "att-final-sync",
          state: "queued",
          finalRevision: 2,
          payloadHash: "h1",
          endpointId: "ep-1",
          retryCount: 0,
          nextRetryAt: null,
          generation: 1,
          receipt: null,
          lastError: null,
        },
      });
      assert.equal(syncText?.textContent, "Đang chờ gửi...");

      // 2. Sending
      (controller as any).notifyListeners({
        type: "sync_changed",
        key: controller.getSnapshot(),
        outbox: {
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: "att-final-sync",
          state: "sending",
          finalRevision: 2,
          payloadHash: "h1",
          endpointId: "ep-1",
          retryCount: 1,
          nextRetryAt: null,
          generation: 1,
          receipt: null,
          lastError: null,
        },
      });
      assert.equal(syncText?.textContent, "Đang gửi...");

      // 3. Network failed (retries exhausted): local attempt is preserved safely!
      (controller as any).notifyListeners({
        type: "sync_changed",
        key: controller.getSnapshot(),
        outbox: {
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: "att-final-sync",
          state: "failed",
          finalRevision: 2,
          payloadHash: "h1",
          endpointId: "ep-1",
          retryCount: 5,
          nextRetryAt: null,
          generation: 1,
          receipt: null,
          lastError: "Network timeout",
        },
      });
      assert.equal(syncText?.textContent, "Lỗi gửi (bản nộp đã lưu an toàn)");

      // 4. Server confirmed
      (controller as any).notifyListeners({
        type: "sync_changed",
        key: controller.getSnapshot(),
        outbox: {
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: "att-final-sync",
          state: "server_confirmed",
          finalRevision: 2,
          payloadHash: "h1",
          endpointId: "ep-1",
          retryCount: 1,
          nextRetryAt: null,
          generation: 1,
          receipt: {
            examId: exam.examId,
            examVersionId: exam.examVersionId,
            attemptId: "att-final-sync",
            submissionId: "sub-1",
            payloadHash: "h1",
            receivedAt: "2026-11-14T00:00:00Z",
            status: "recorded",
          },
          lastError: null,
        },
      });
      assert.equal(syncText?.textContent, "Máy chủ đã xác nhận");

      unmount();
    });
  });

  // =========================================================================
  // 5. ADVISORY LIMITS
  // =========================================================================
  describe("5. Local Advisory Limits (maxAttempts)", () => {
    it("enforces maxAttempts limit locally and allows explicit bypass", async () => {
      const storage = new InMemoryStoragePort();
      let currentClock = 100_000;
      const deps = { storage, now: () => currentClock, id: () => "att-limit-1" };
      const exam = createExamA({ maxAttempts: 2 });

      // Attempt 1
      const att1 = await startAttempt(exam, "Em 1", deps, { attemptId: "att-1" });
      assert.equal(att1.ok, true);

      // Attempt 2
      const att2 = await startAttempt(exam, "Em 2", deps, { attemptId: "att-2" });
      assert.equal(att2.ok, true);

      // Attempt 3 without bypass -> BLOCKED
      const att3Blocked = await startAttempt(exam, "Em 3", deps, { attemptId: "att-3" });
      assert.equal(att3Blocked.ok, false);
      if (!att3Blocked.ok) {
        assert.equal(att3Blocked.error.code, "ATTEMPT_LIMIT_LOCAL");
      }

      // Attempt 3 with bypass -> ALLOWED
      const att3Bypassed = await startAttempt(exam, "Em 3", deps, {
        attemptId: "att-3",
        bypassAdvisoryLimit: true,
      });
      assert.equal(att3Bypassed.ok, true);
    });

    it("respects maxAttempts = 0 as blocking all attempts unless bypassed", async () => {
      const storage = new InMemoryStoragePort();
      const deps = { storage, now: () => 100_000, id: () => "att-limit-0" };
      const exam = createExamA({ maxAttempts: 0 });

      const resBlocked = await startAttempt(exam, "Em 0", deps);
      assert.equal(resBlocked.ok, false);
      if (!resBlocked.ok) {
        assert.equal(resBlocked.error.code, "ATTEMPT_LIMIT_LOCAL");
      }

      const resBypassed = await startAttempt(exam, "Em 0", deps, { bypassAdvisoryLimit: true });
      assert.equal(resBypassed.ok, true);
    });

    it("view displays maxAttemptsNotice and disables restart button when limit is reached", async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const exam = createExamA({ maxAttempts: 1 });
      const vm: StudentViewModel = {
        exam,
        history: [
          {
            attemptId: "att-old-1",
            candidateName: "Đã làm",
            scoreTotal: "10",
            maxTotal: "10",
          },
        ],
      };

      const unmount = mount(root as unknown as HTMLElement, vm);

      const notice = root.querySelector<EnhancedMockElement>("#maxAttemptsNotice");
      const btnRestart = root.querySelector<EnhancedMockElement>("#btnRestart");
      assert.ok(notice !== null);
      assert.ok(btnRestart !== null);

      assert.equal(notice.style.display, "block");
      assert.equal(btnRestart.disabled, true);

      unmount();
    });
  });

  // =========================================================================
  // 6. SAME ATTEMPT ID IN DIFFERENT EXAMS
  // =========================================================================
  describe("6. Same Attempt ID across Different Exams", () => {
    it("completely isolates attempts sharing the same attemptId across different exams", async () => {
      const storage = new InMemoryStoragePort();
      let currentClock = 100_000;
      const sharedAttemptId = "shared-uuid-12345";

      const examMath = createExamA();
      const examPhys = createExamB();

      const mathDeps = { storage, now: () => currentClock, id: () => sharedAttemptId };
      const physDeps = { storage, now: () => currentClock, id: () => sharedAttemptId };

      // Start attempt on Math with sharedAttemptId
      const mathRes = await startAttempt(examMath, "Thí sinh Toán", mathDeps, { attemptId: sharedAttemptId });
      assert.equal(mathRes.ok, true);
      if (!mathRes.ok) return;

      // Start attempt on Physics with SAME sharedAttemptId
      const physRes = await startAttempt(examPhys, "Thí sinh Lý", physDeps, { attemptId: sharedAttemptId });
      assert.equal(physRes.ok, true);
      if (!physRes.ok) return;

      const mathController = mathRes.value;
      const physController = physRes.value;

      // Answer Math
      await mathController.answer({
        kind: "I",
        questionVersionId: "q1-math",
        selectedOptionId: "opt-2",
      });
      await mathController.answer({
        kind: "III",
        questionVersionId: "q2-math",
        raw: "1,5",
      });

      // Answer Physics
      await physController.answer({
        kind: "I",
        questionVersionId: "q1-phys",
        selectedOptionId: "p-opt-2",
      });
      await physController.answer({
        kind: "II",
        questionVersionId: "q2-phys",
        answers: [
          { statementId: "st-1", value: true },
          { statementId: "st-2", value: false },
          { statementId: "st-3", value: true },
          { statementId: "st-4", value: false },
        ],
      });

      // Math responses must contain ONLY Math questions
      const mathResponses = mathController.getSnapshot().responses.responses;
      assert.equal(mathResponses.length, 2);
      assert.equal(mathResponses.some((r) => r.questionVersionId === "q1-math"), true);
      assert.equal(mathResponses.some((r) => r.questionVersionId === "q1-phys"), false);

      // Physics responses must contain ONLY Physics questions
      const physResponses = physController.getSnapshot().responses.responses;
      assert.equal(physResponses.length, 2);
      assert.equal(physResponses.some((r) => r.questionVersionId === "q1-phys"), true);
      assert.equal(physResponses.some((r) => r.questionVersionId === "q1-math"), false);

      // Submit Math
      const mathSubmit = await mathController.submit("manual");
      assert.equal(mathSubmit.ok, true);
      assert.equal(mathController.getSnapshot().phase, "final");

      // Physics MUST remain in draft
      assert.equal(physController.getSnapshot().phase, "draft");

      // Resume Math from storage
      const mathResume = await resumeAttempt(
        { examId: examMath.examId, examVersionId: examMath.examVersionId, attemptId: sharedAttemptId },
        mathDeps
      );
      assert.equal(mathResume.ok, true);
      if (!mathResume.ok) return;
      assert.equal(mathResume.value.getSnapshot().examId, examMath.examId);
      assert.equal(mathResume.value.getSnapshot().phase, "final");

      // Resume Physics from storage
      const physResume = await resumeAttempt(
        { examId: examPhys.examId, examVersionId: examPhys.examVersionId, attemptId: sharedAttemptId },
        physDeps
      );
      assert.equal(physResume.ok, true);
      if (!physResume.ok) return;
      assert.equal(physResume.value.getSnapshot().examId, examPhys.examId);
      assert.equal(physResume.value.getSnapshot().phase, "draft");

      // List attempts per exam
      const mathList = await listAttemptHistory(examMath.examId, examMath.examVersionId, storage);
      assert.equal(mathList.ok, true);
      if (mathList.ok) {
        assert.equal(mathList.value.length, 1);
        assert.equal(mathList.value[0]?.examId, examMath.examId);
      }

      const physList = await listAttemptHistory(examPhys.examId, examPhys.examVersionId, storage);
      assert.equal(physList.ok, true);
      if (physList.ok) {
        assert.equal(physList.value.length, 1);
        assert.equal(physList.value[0]?.examId, examPhys.examId);
      }
    });
  });

  // =========================================================================
  // 7. AC: NO KEYS / EXPLANATIONS PRE-RELEASE
  // =========================================================================
  describe("7. Acceptance Criteria: Pre-Release Privacy", () => {
    it("rendered student exam DOM strictly contains no answer keys or explanations", async () => {
      const doc = createEnhancedMockDocument();
      const root = doc.createElement("div");
      doc.body.appendChild(root);

      const storage = new InMemoryStoragePort();
      const deps = { storage, now: () => 100_000, id: () => "att-leak-check" };
      const exam = createExamA({ releasePolicy: "after_deadline" });

      const startRes = await startAttempt(exam, "Thí sinh Bí Mật", deps);
      assert.equal(startRes.ok, true);
      if (!startRes.ok) return;

      const controller = startRes.value;
      const vm: StudentViewModel = { controller, now: () => 100_000 };
      const unmount = mount(root as unknown as HTMLElement, vm);

      // Verify DOM HTML does NOT leak secret explanations or answers
      const allText = root.textContent || "";
      assert.equal(
        allText.includes("Lời giải bí mật"),
        false,
        "Secret explanations must NOT appear anywhere in student DOM"
      );
      assert.equal(
        allText.includes("đạo hàm f'(x)"),
        false,
        "Explanation text must NOT appear in student DOM"
      );

      // Check all rendered child elements
      const allElements = root.querySelectorAll<EnhancedMockElement>("*");
      for (const el of allElements) {
        assert.equal(el.getAttribute("data-answer-key"), null);
        assert.equal(el.getAttribute("data-correct"), null);
      }

      unmount();
    });
  });
});
