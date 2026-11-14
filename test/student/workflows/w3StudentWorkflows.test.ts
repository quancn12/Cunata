/// <reference lib="dom" />

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  startAttempt,
  resumeAttempt,
  listAttemptHistory,
  toDomainExam,
} from "../../../src/student/index.ts";
import { mount } from "../../../src/student/view.ts";
import type { StudentViewModel } from "../../../src/student/view.ts";
import type {
  WebExam,
  Response,
  ResponseIII,
  AttemptRecord,
  WebEvent,
} from "../../../src/student/types.ts";
import { InMemoryStoragePort } from "../core/inMemoryStorage.ts";
import {
  createEnhancedMockDocument,
  EnhancedMockElement,
  MockEvent,
} from "../view/testDom.ts";

function createExamA(settingsOverrides: Partial<WebExam["settings"]> = {}): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-toan-w3",
    examVersionId: "v1.0.0",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    title: "Đề Khảo Sát Toán W3",
    subject: "Toán",
    grade: 12,
    settings: {
      durationMinutes: 45,
      maxAttempts: null,
      releasePolicy: "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
      ...settingsOverrides,
    },
    assets: [],
    questions: [
      {
        kind: "I",
        questionVersionId: "q1-toan",
        title: "Câu 1",
        content: "Chọn đáp án đúng",
        correctOptionId: "opt-1a",
        options: [
          { optionId: "opt-1a", label: "A", text: "Phương án A" },
          { optionId: "opt-1b", label: "B", text: "Phương án B" },
          { optionId: "opt-1c", label: "C", text: "Phương án C" },
          { optionId: "opt-1d", label: "D", text: "Phương án D" },
        ],
      },
      {
        kind: "II",
        questionVersionId: "q2-toan",
        title: "Câu 2",
        content: "Xét đúng sai",
        statements: [
          { statementId: "st-2a", label: "a", text: "Ý a", answer: true },
          { statementId: "st-2b", label: "b", text: "Ý b", answer: false },
          { statementId: "st-2c", label: "c", text: "Ý c", answer: true },
          { statementId: "st-2d", label: "d", text: "Ý d", answer: false },
        ],
      },
      {
        kind: "III",
        questionVersionId: "q3-toan",
        title: "Câu 3",
        content: "Trả lời ngắn (ví dụ 1,5)",
        answerKey: "1,5",
      },
    ],
  };
}

function createExamB(): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-ly-w3",
    examVersionId: "v2.0.0",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    title: "Đề Khảo Sát Vật Lý W3",
    subject: "Vật lý",
    grade: 12,
    settings: {
      durationMinutes: 30,
      maxAttempts: 1,
      releasePolicy: "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    assets: [],
    questions: [
      {
        kind: "I",
        questionVersionId: "q1-ly",
        title: "Câu 1 Lý",
        content: "Vận tốc ánh sáng trong chân không",
        correctOptionId: "opt-ly-a",
        options: [
          { optionId: "opt-ly-a", label: "A", text: "3.10^8 m/s" },
          { optionId: "opt-ly-b", label: "B", text: "3.10^6 m/s" },
          { optionId: "opt-ly-c", label: "C", text: "3.10^5 km/s" },
          { optionId: "opt-ly-d", label: "D", text: "Không đổi" },
        ],
      },
    ],
  };
}

describe("WEB-W3-STUDENT: Multi-Attempt History, Restore and Deadline Workflows", () => {
  it("explicit new attempt IDs: respects explicit attemptId via options or deps", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = {
      storage,
      now: () => clock,
      id: () => "auto-generated-id",
    };

    const exam = createExamA();

    // 1. Via options.attemptId
    const res1 = await startAttempt(exam, "Thí sinh 1", deps, {
      attemptId: "explicit-att-001",
    });
    assert.equal(res1.ok, true);
    if (!res1.ok) return;
    assert.equal(res1.value.getSnapshot().attemptId, "explicit-att-001");

    // 2. Via deps.attemptId
    const depsWithId = {
      storage,
      now: () => clock,
      id: () => "fallback-id",
      attemptId: "explicit-att-002",
    };
    const res2 = await startAttempt(exam, "Thí sinh 2", depsWithId);
    assert.equal(res2.ok, true);
    if (!res2.ok) return;
    assert.equal(res2.value.getSnapshot().attemptId, "explicit-att-002");

    // 3. Collision with existing attemptId returns STORAGE_CONFLICT
    const res3 = await startAttempt(exam, "Thí sinh 3", deps, {
      attemptId: "explicit-att-001",
    });
    assert.equal(res3.ok, false);
    if (res3.ok) return;
    assert.equal(res3.error.code, "STORAGE_CONFLICT");
  });

  it("local advisory limit: blocks startAttempt beyond maxAttempts unless bypassed", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    let idCounter = 1;
    const deps = {
      storage,
      now: () => clock,
      id: () => `att-limit-${idCounter++}`,
    };

    // maxAttempts: 2 (advisory local)
    const exam = createExamA({ maxAttempts: 2 });

    // Attempt 1: succeeds
    const att1 = await startAttempt(exam, "Học sinh A", deps);
    assert.equal(att1.ok, true);

    // Attempt 2: succeeds
    const att2 = await startAttempt(exam, "Học sinh A", deps);
    assert.equal(att2.ok, true);

    // Attempt 3: rejected with ATTEMPT_LIMIT_LOCAL
    const att3 = await startAttempt(exam, "Học sinh A", deps);
    assert.equal(att3.ok, false);
    if (att3.ok) return;
    assert.equal(att3.error.code, "ATTEMPT_LIMIT_LOCAL");
    assert.equal(att3.error.path, "settings.maxAttempts");

    // Attempt 3 with bypassAdvisoryLimit: true succeeds (advisory local property)
    const att3Bypassed = await startAttempt(exam, "Học sinh A", deps, {
      bypassAdvisoryLimit: true,
    });
    assert.equal(att3Bypassed.ok, true);
  });

  it("cross-exam resume from immutable snapshot: preserves original exam snapshot across changes and exams", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = {
      storage,
      now: () => clock,
      id: () => "att-math-1",
    };

    const examA = createExamA();
    const examB = createExamB();

    // Start Attempt on Exam A
    const resA = await startAttempt(examA, "Nguyễn Văn Toán", deps);
    assert.equal(resA.ok, true);
    if (!resA.ok) return;
    const keyA = {
      examId: examA.examId,
      examVersionId: examA.examVersionId,
      attemptId: "att-math-1",
    };

    // Answer Q1 on Exam A
    await resA.value.answer({
      kind: "I",
      questionVersionId: "q1-toan",
      selectedOptionId: "opt-1a",
    });

    // Start Attempt on Exam B with a different ID
    const resB = await startAttempt(examB, "Trần Văn Lý", {
      ...deps,
      id: () => "att-ly-1",
    });
    assert.equal(resB.ok, true);

    // Mutate the original examA in-memory (simulating teacher edit or bank rewrite)
    (examA.questions as any).splice(0, 2); // delete first 2 questions
    (examA as any).title = "ĐỀ ĐÃ BỊ BIẾN ĐỔI";

    // Resume Exam A attempt via resumeAttempt
    const resumedA = await resumeAttempt(keyA, deps);
    assert.equal(resumedA.ok, true);
    if (!resumedA.ok) return;

    const snapA = resumedA.value.getSnapshot();
    assert.equal(snapA.examSnapshot.title, "Đề Khảo Sát Toán W3");
    assert.equal(snapA.examSnapshot.questions.length, 3);
    assert.equal(snapA.candidateName, "Nguyễn Văn Toán");
    assert.equal(snapA.responses.responses.length, 1);
    assert.equal(snapA.responses.responses[0]?.questionVersionId, "q1-toan");

    // Now test mounting the view with this cross-exam record while viewmodel exam is Exam B
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const vm: StudentViewModel = {
      record: snapA,
      exam: examB, // Passing Exam B should NOT override snapA.examSnapshot
      now: () => clock,
    };

    const unmount = mount(root as unknown as HTMLElement, vm, {});

    // Heading should show Exam A's title from the immutable snapshot
    const headerTitle = root.querySelector<EnhancedMockElement>("#examTitle");
    assert.ok(headerTitle !== null);
    assert.equal(headerTitle.textContent, "Đề Khảo Sát Toán W3");

    // Palette should have 3 questions (from Exam A), not 1 (from Exam B)
    const palBtns = root.querySelectorAll<EnhancedMockElement>(".palette-btn");
    assert.equal(palBtns.length, 3);

    unmount();
  });

  it("back/refresh/visibility/background deadline: auto-submits on visibilitychange and pageshow", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let currentClock = 1000000;
    const deps = {
      storage,
      now: () => currentClock,
      id: () => "att-visibility-bg",
    };

    const exam = createExamA({ durationMinutes: 10 }); // deadline = 1000000 + 600000 = 1600000
    const startRes = await startAttempt(exam, "Thí sinh Background", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    let submittedReason: string | null = null;
    const actions = {
      submit: (reason: unknown) => {
        submittedReason = String(reason);
      },
    };

    const unmount = mount(root as unknown as HTMLElement, controller, {
      ...actions,
      now: () => currentClock,
    });

    const timerBox = root.querySelector<EnhancedMockElement>("#timerBox");
    assert.ok(timerBox !== null);
    assert.equal(timerBox.textContent, "10:00");

    // Simulate tab going to background and time passing past deadline
    currentClock = 1600000 + 5000; // 5s past deadline

    // Tab becomes visible again (visibilitychange)
    doc.visibilityState = "visible";
    doc.dispatchEvent(new MockEvent("visibilitychange"));

    assert.equal(timerBox.textContent, "00:00");
    assert.equal(timerBox.classList.contains("timer-expired"), true);
    assert.equal(submittedReason, "deadline");

    unmount();

    // Now test pageshow on win
    const doc2 = createEnhancedMockDocument();
    const root2 = doc2.createElement("div");
    doc2.body.appendChild(root2);

    let clock2 = 2000000;
    const startRes2 = await startAttempt(exam, "Thí sinh Pageshow", {
      storage,
      now: () => clock2,
      id: () => "att-pageshow",
    });
    assert.equal(startRes2.ok, true);
    if (!startRes2.ok) return;

    let submittedReason2: string | null = null;
    const unmount2 = mount(root2 as unknown as HTMLElement, startRes2.value, {
      submit: (r) => { submittedReason2 = String(r); },
      now: () => clock2,
    });

    // Advance clock past deadline
    clock2 = 2000000 + 600000 + 2000;
    doc2.defaultView.dispatchEvent(new MockEvent("pageshow"));

    assert.equal(submittedReason2, "deadline");
    unmount2();
  });

  it("LC28 active & expired nickname restore: restores saved candidateName without defaulting to 'Thí sinh tự do'", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = {
      storage,
      now: () => clock,
      id: () => "att-lc28",
    };

    const exam = createExamA({ durationMinutes: 10 });
    const startRes = await startAttempt(exam, "Võ Thị Sáu", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const key = {
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: "att-lc28",
    };

    // Case 1: Active draft refresh
    const resumedActive = await resumeAttempt(key, deps);
    assert.equal(resumedActive.ok, true);
    if (!resumedActive.ok) return;

    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const unmountActive = mount(root as unknown as HTMLElement, resumedActive.value, {});
    const candInput = root.querySelector<EnhancedMockElement>("#candidateName");
    assert.ok(candInput !== null);
    // LC28-F01 invariant: Must be restored to "Võ Thị Sáu", not "Thí sinh tự do"
    assert.equal(candInput.value, "Võ Thị Sáu");
    unmountActive();

    // Case 2: Expired draft refresh (LC28-F01 major regression test)
    // Advance clock past deadline (10 mins = 600s = 600000ms)
    clock = 1000000 + 600000 + 10000; // 10s overdue

    const resumedExpired = await resumeAttempt(key, deps);
    assert.equal(resumedExpired.ok, true);
    if (!resumedExpired.ok) return;

    const expiredSnap = resumedExpired.value.getSnapshot();
    assert.equal(expiredSnap.phase, "final");
    // Crucial: autosubmit on expired draft MUST keep the restored candidateName
    assert.equal(expiredSnap.candidateName, "Võ Thị Sáu");
    assert.notEqual(expiredSnap.candidateName, "Thí sinh tự do");
  });

  it("manual composition flush: flushes pending candidateName and Part III inputs before final submission", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = {
      storage,
      now: () => clock,
      id: () => "att-flush",
    };

    const exam = createExamA();
    const startRes = await startAttempt(exam, "Tên Cũ", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    let submittedRecord: AttemptRecord | null = null;
    const actions = {
      onAttemptFinalized: (rec: unknown) => {
        submittedRecord = rec as AttemptRecord;
      },
    };

    const unmount = mount(root as unknown as HTMLElement, controller, {
      ...actions,
      now: () => clock,
    });

    const candInput = root.querySelector<EnhancedMockElement>("#candidateName");
    const inputQ3 = root.querySelector<EnhancedMockElement>("#input-iii-q3-toan");
    const btnSubmit = root.querySelector<EnhancedMockElement>("#btnSubmit");
    const btnConfirm = root.querySelector<EnhancedMockElement>("#btnConfirmSubmit");

    assert.ok(candInput !== null && inputQ3 !== null && btnSubmit !== null && btnConfirm !== null);

    // Simulate student typing new name into input WITHOUT blurring (simulating uncommitted IME / input)
    candInput.value = "Nguyễn Văn Mới";

    // Simulate student typing into Part III input WITHOUT blurring
    inputQ3.value = "1,5";

    // Student clicks Submit button (opens modal)
    btnSubmit.click();

    // Confirm submission
    btnConfirm.click();

    // Allow saveChain to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    const finalSnap = controller.getSnapshot();
    assert.equal(finalSnap.phase, "final");
    assert.equal(finalSnap.candidateName, "Nguyễn Văn Mới");

    // The flushed Part III answer should be scored as full
    const q3Resp = finalSnap.responses.responses.find((r) => r.questionVersionId === "q3-toan");
    assert.ok(q3Resp);
    assert.equal((q3Resp as ResponseIII).raw, "1,5");

    const scoreDTO = finalSnap.scoreDTO as any;
    assert.ok(scoreDTO);
    const q3Score = scoreDTO.questions.find((q: any) => q.questionVersionId === "q3-toan");
    assert.equal(q3Score.status, "full");

    unmount();
  });

  it("same-tuple concurrent submit schedules: deduplicates submissions and achieves full final adoption", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = {
      storage,
      now: () => clock,
      id: () => "att-same-tuple",
    };

    const exam = createExamA();
    const startRes = await startAttempt(exam, "Thí sinh Concurrent", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;

    // 1. Concurrent double submit on same controller
    const [sub1, sub2] = await Promise.all([
      controller.submit("manual"),
      controller.submit("deadline"),
    ]);

    assert.equal(sub1.ok, true);
    assert.equal(sub2.ok, true);
    if (sub1.ok && sub2.ok) {
      assert.equal(sub1.value.phase, "final");
      assert.equal(sub2.value.phase, "final");
      assert.equal(sub1.value.revision, sub2.value.revision);
    }

    // 2. Cross-controller same-tuple concurrent submit (simulating two tabs on same attempt)
    // Create fresh attempt
    const depsTab = {
      storage,
      now: () => clock,
      id: () => "att-two-tabs",
    };
    const tab1Res = await startAttempt(exam, "Thí sinh Hai Tab", depsTab);
    assert.equal(tab1Res.ok, true);
    if (!tab1Res.ok) return;

    const key = {
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: "att-two-tabs",
    };
    const tab2Res = await resumeAttempt(key, depsTab);
    assert.equal(tab2Res.ok, true);
    if (!tab2Res.ok) return;

    const tab1 = tab1Res.value;
    const tab2 = tab2Res.value;

    let tab2FinalizedEvent: AttemptRecord | null = null;
    tab2.subscribe((e) => {
      if (e.type === "attempt_finalized") {
        tab2FinalizedEvent = e.record;
      }
    });

    // Both tabs submit concurrently
    const [resTab1, resTab2] = await Promise.all([
      tab1.submit("manual"),
      tab2.submit("deadline"),
    ]);

    assert.equal(resTab1.ok, true);
    assert.equal(resTab2.ok, true);

    if (resTab1.ok && resTab2.ok) {
      // Both tabs adopted the identical final record
      assert.equal(resTab1.value.phase, "final");
      assert.equal(resTab2.value.phase, "final");
      assert.equal(resTab1.value.attemptId, resTab2.value.attemptId);
      assert.equal(resTab1.value.submittedAt, resTab2.value.submittedAt);
      assert.ok(tab2FinalizedEvent !== null);
      assert.equal((tab2FinalizedEvent as AttemptRecord).phase, "final");
    }
  });

  it("finalized event lets app enqueue correct tuple; student does not own collector retries", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = {
      storage,
      now: () => clock,
      id: () => "att-enqueue-check",
    };

    const exam = createExamA();
    const startRes = await startAttempt(exam, "Thí sinh App Enqueue", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    let finalizedRecord: AttemptRecord | null = null;

    controller.subscribe((event: WebEvent) => {
      if (event.type === "attempt_finalized") {
        finalizedRecord = event.record;
      }
    });

    const subRes = await controller.submit("manual");
    assert.equal(subRes.ok, true);
    assert.ok(finalizedRecord !== null);

    // AC: finalized event contains the exact immutable tuple
    assert.equal((finalizedRecord as AttemptRecord).examId, "exam-toan-w3");
    assert.equal((finalizedRecord as AttemptRecord).examVersionId, "v1.0.0");
    assert.equal((finalizedRecord as AttemptRecord).attemptId, "att-enqueue-check");
    assert.equal((finalizedRecord as AttemptRecord).phase, "final");
    assert.ok((finalizedRecord as AttemptRecord).scoreDTO !== null);

    // Verify outbox was NOT touched by student controller (app owns collector/enqueue)
    assert.equal(storage.outbox.size, 0);
  });

  it("multi-attempt history: listAttemptHistory and history table with scoreDTO display", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const exam = createExamA({ maxAttempts: 3 });

    // Complete Attempt 1
    const att1 = await startAttempt(exam, "Thí sinh Một", { storage, now: () => clock, id: () => "att-h1" });
    assert.equal(att1.ok, true);
    if (att1.ok) {
      await att1.value.answer({ kind: "I", questionVersionId: "q1-toan", selectedOptionId: "opt-1a" });
      await att1.value.submit("manual");
    }

    // Complete Attempt 2
    clock += 100000;
    const att2 = await startAttempt(exam, "Thí sinh Hai", { storage, now: () => clock, id: () => "att-h2" });
    assert.equal(att2.ok, true);
    if (att2.ok) {
      await att2.value.answer({ kind: "III", questionVersionId: "q3-toan", raw: "1,5" });
      await att2.value.submit("manual");
    }

    // Query history via listAttemptHistory
    const histRes = await listAttemptHistory(exam.examId, exam.examVersionId, storage);
    assert.equal(histRes.ok, true);
    if (!histRes.ok) return;
    assert.equal(histRes.value.length, 2);

    // Query history via controller.listHistory
    const ctrlHistRes = await (att2 as any).value.listHistory();
    assert.equal(ctrlHistRes.ok, true);
    assert.equal(ctrlHistRes.value.length, 2);

    // Render history section in View with AttemptRecord[]
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    let selectedAttemptId: string | null = null;
    let resumedRecord: unknown = null;
    const actions = {
      selectHistoryAttempt: (id: unknown) => { selectedAttemptId = String(id); },
      resumeAttempt: (rec: unknown) => { resumedRecord = rec; },
    };

    const vm: StudentViewModel = {
      exam,
      history: histRes.value,
      now: () => clock,
    };

    const unmount = mount(root as unknown as HTMLElement, vm, actions);

    const historySection = root.querySelector<EnhancedMockElement>("#attemptHistorySection");
    assert.ok(historySection !== null);

    const rows = historySection.querySelectorAll<EnhancedMockElement>("tbody tr");
    assert.equal(rows.length, 2);

    // Click row 1
    rows[0]?.click();
    assert.equal(selectedAttemptId, "att-h1");
    assert.ok(resumedRecord !== null);

    unmount();
  });

  it("cleanup and disposal: tears down intervals, listeners, and rejects disposed operations", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-dispose" };
    const exam = createExamA();

    const startRes = await startAttempt(exam, "Thí sinh Cleanup", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;

    const unmount = mount(root as unknown as HTMLElement, controller, { now: () => clock });

    // Unmount view
    unmount();
    assert.equal(root.textContent, "");

    // Dispose controller
    controller.dispose();

    // Subsequent operations return CONTROLLER_DISPOSED
    const ansRes = await controller.answer({ kind: "I", questionVersionId: "q1-toan", selectedOptionId: "opt-1a" });
    assert.equal(ansRes.ok, false);
    if (!ansRes.ok) assert.equal(ansRes.error.code, "CONTROLLER_DISPOSED");

    const renRes = await controller.rename("Tên Sau Khi Dispose");
    assert.equal(renRes.ok, false);
    if (!renRes.ok) assert.equal(renRes.error.code, "CONTROLLER_DISPOSED");

    const subRes = await controller.submit("manual");
    assert.equal(subRes.ok, false);
    if (!subRes.ok) assert.equal(subRes.error.code, "CONTROLLER_DISPOSED");

    if (typeof controller.checkDeadline === "function") {
      const deadRes = await controller.checkDeadline();
      assert.equal(deadRes.ok, false);
      if (!deadRes.ok) assert.equal(deadRes.error.code, "CONTROLLER_DISPOSED");
    }
  });
});
