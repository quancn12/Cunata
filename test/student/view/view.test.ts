/// <reference lib="dom" />

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mount } from "../../../src/student/view.ts";
import type { StudentViewModel, StudentHistoryItem } from "../../../src/student/view.ts";
import { startAttempt } from "../../../src/student/index.ts";
import type { WebExam, Response } from "../../../src/student/types.ts";
import { InMemoryStoragePort } from "../core/inMemoryStorage.ts";
import {
  createEnhancedMockDocument,
  EnhancedMockElement,
  MockEvent,
  MockKeyboardEvent,
  MockCompositionEvent,
} from "./testDom.ts";

function createTestExam(overrides: Partial<WebExam["settings"]> = {}): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-view-test",
    examVersionId: "v1.0.0",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    title: "Đề thi khảo sát chất lượng Toán 12",
    subject: "Toán",
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: 2,
      releasePolicy: "immediate",
      shuffleQuestions: false,
      shuffleOptions: false,
      ...overrides,
    },
    assets: [],
    questions: [
      {
        kind: "I",
        questionVersionId: "q1-i",
        title: "Câu 1",
        content: "Chọn khẳng định đúng về hàm số bậc bốn trùng phương.",
        correctOptionId: "opt-1b",
        options: [
          { optionId: "opt-1a", label: "A", text: "Hàm số luôn có 3 điểm cực trị" },
          { optionId: "opt-1b", label: "B", text: "Hàm số có đồ thị nhận trục tung làm trục đối xứng" },
          { optionId: "opt-1c", label: "C", text: "Hàm số không có cực trị" },
          { optionId: "opt-1d", label: "D", text: "Hàm số đồng biến trên R" },
        ],
      },
      {
        kind: "II",
        questionVersionId: "q2-ii",
        title: "Câu 2",
        content: "Cho hàm số f(x). Xét tính đúng sai của các mệnh đề sau:",
        statements: [
          { statementId: "st-2a", label: "a", text: "Hàm số f(x) liên tục tại x = 0", answer: true },
          { statementId: "st-2b", label: "b", text: "Đạo hàm f'(0) = 1", answer: false },
          { statementId: "st-2c", label: "c", text: "f(x) đạt cực tiểu tại x = 0", answer: true },
          { statementId: "st-2d", label: "d", text: "Phương trình f(x) = 0 có đúng 3 nghiệm phân biệt", answer: false },
        ],
      },
      {
        kind: "III",
        questionVersionId: "q3-iii",
        title: "Câu 3",
        content: "Tính giá trị của tích phân I. Kết quả là số thập phân (ví dụ 1,5):",
        answerKey: "1,5",
      },
      {
        kind: "III",
        questionVersionId: "q4-iii",
        title: "Câu 4",
        content: "Tìm hoành độ giao điểm âm nhỏ nhất (ví dụ -0,5):",
        answerKey: "-0,5",
      },
    ],
  };
}

describe("WEB-W2-STUDENT-VIEW: M2 Student Exam View Tests", () => {
  it("mounts exam selection and candidate name form with composition guard", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-1" };
    const exam = createTestExam();
    const startRes = await startAttempt(exam, "Trần Văn B", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    const actionsCalled: { action: string; val: unknown }[] = [];

    const actions = {
      updateCandidateName: (val: unknown) => actionsCalled.push({ action: "updateCandidateName", val }),
      rename: (val: unknown) => actionsCalled.push({ action: "rename", val }),
    };

    const unmount = mount(root as unknown as HTMLElement, controller, actions);

    // Root should have .cunata-student-view class
    assert.equal(root.classList.contains("cunata-student-view"), true);

    // Check Candidate Name input
    const nameInput = root.querySelector<EnhancedMockElement>("#candidateName");
    assert.ok(nameInput !== null);
    assert.equal(nameInput.value, "Trần Văn B");

    // Test IME composition: while composing, do not dispatch rename
    nameInput.dispatchEvent(new MockCompositionEvent("compositionstart"));
    nameInput.value = "Trần Văn ";
    nameInput.dispatchEvent(new MockEvent("input"));

    // Should not commit rename during composition
    assert.equal(actionsCalled.filter((a) => a.action === "rename").length, 0);

    // End composition
    nameInput.value = "Trần Văn C";
    nameInput.dispatchEvent(new MockCompositionEvent("compositionend"));

    // Rename should be committed
    const renameCalls = actionsCalled.filter((a) => a.action === "rename");
    assert.ok(renameCalls.length >= 1);
    assert.equal(renameCalls[renameCalls.length - 1]?.val, "Trần Văn C");

    // Controller snapshot should be updated
    assert.equal(controller.getSnapshot().candidateName, "Trần Văn C");

    unmount();
    assert.equal(root.textContent, "");
  });

  it("preserves native candidate input node and cursor during asynchronous controller saves", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-preserve" };
    const exam = createTestExam();
    const startRes = await startAttempt(exam, "Lê Thị D", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    const unmount = mount(root as unknown as HTMLElement, controller, {});

    const nameInput = root.querySelector<EnhancedMockElement>("#candidateName");
    assert.ok(nameInput !== null);

    // Simulate active focus on the input
    nameInput.focus();
    assert.equal(doc.activeElement, nameInput);

    // Trigger an answer change which executes an asynchronous save
    await controller.answer({
      kind: "I",
      questionVersionId: "q1-i",
      selectedOptionId: "opt-1b",
    });

    // The input DOM node must NOT have been destroyed or replaced
    const nameInputAfter = root.querySelector<EnhancedMockElement>("#candidateName");
    assert.strictEqual(nameInput, nameInputAfter);
    assert.equal(nameInput.value, "Lê Thị D");

    unmount();
  });

  it("handles invalid exam JSON by displaying error banner while strictly retaining prior active attempt", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-prior" };
    const exam = createTestExam();
    const startRes = await startAttempt(exam, "Thí sinh hiện tại", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    const unmount = mount(root as unknown as HTMLElement, controller, {});

    // Answer question 1 on prior attempt
    await controller.answer({
      kind: "I",
      questionVersionId: "q1-i",
      selectedOptionId: "opt-1a",
    });

    // Verify question 1 is rendered and answered
    const palBtn1 = root.querySelector<EnhancedMockElement>("#pal-btn-q1-i");
    assert.ok(palBtn1 !== null);
    assert.equal(palBtn1.classList.contains("answered"), true);

    // Simulate file input change with invalid exam JSON
    const fileInput = root.querySelector<EnhancedMockElement>("#examFileInput");
    assert.ok(fileInput !== null);

    // Mock FileReader on globalThis
    const originalFileReader = (globalThis as any).FileReader;
    (globalThis as any).FileReader = class {
      onload: any = null;
      readAsText() {
        setTimeout(() => {
          this.onload({ target: { result: JSON.stringify({ schemaVersion: "invalid-version", questions: [] }) } });
        }, 0);
      }
    };

    try {
      fileInput.dispatchEvent(new MockEvent("change", { target: { files: [{ name: "bad-exam.json" }] } }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Error banner should be visible
      const errBanner = root.querySelector<EnhancedMockElement>("#examLoadError");
      assert.ok(errBanner !== null);
      assert.equal(errBanner.style.display, "flex");
      assert.ok(errBanner.textContent?.includes("Không thể nạp đề thi"));

      // CRITICAL AC: Prior attempt must be retained!
      // Controller snapshot is unchanged, prior question 1 is still answered
      assert.equal(controller.getSnapshot().attemptId, "att-prior");
      assert.equal(controller.getSnapshot().candidateName, "Thí sinh hiện tại");
      assert.equal(palBtn1.classList.contains("answered"), true);

      // Questions are still interactive
      const opt1b = root.querySelector<EnhancedMockElement>('[data-option-id="opt-1b"]');
      assert.ok(opt1b !== null);
      opt1b.click();

      // Controller should record new answer
      const q1Resp = controller.getSnapshot().responses.responses.find((r) => r.questionVersionId === "q1-i");
      assert.equal(q1Resp?.kind, "I");
      if (q1Resp?.kind === "I") {
        assert.equal(q1Resp.selectedOptionId, "opt-1b");
      }
    } finally {
      (globalThis as any).FileReader = originalFileReader;
      unmount();
    }
  });

  it("renders Part I options with accessible radiogroup and handles click & keyboard selection", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-part1" };
    const exam = createTestExam();
    const startRes = await startAttempt(exam, "Thí sinh I", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    const answeredResponses: Response[] = [];
    const actions = {
      answer: (res: unknown) => answeredResponses.push(res as Response),
    };

    const unmount = mount(root as unknown as HTMLElement, controller, actions);

    // Radiogroup check
    const radiogroup = root.querySelector<EnhancedMockElement>('.options-grid[role="radiogroup"]');
    assert.ok(radiogroup !== null);

    const options = root.querySelectorAll<EnhancedMockElement>('.option-card[role="radio"]');
    assert.equal(options.length, 4);

    const optA = options[0]!;
    const optB = options[1]!;

    // Initial state: not selected
    assert.equal(optA.classList.contains("selected"), false);
    assert.equal(optA.getAttribute("aria-checked"), "false");

    // Click option A
    optA.click();

    // Verify option A selected
    assert.equal(optA.classList.contains("selected"), true);
    assert.equal(optA.getAttribute("aria-checked"), "true");
    assert.equal(optB.classList.contains("selected"), false);

    // Verify action called
    assert.equal(answeredResponses.length, 1);
    assert.equal(answeredResponses[0]?.kind, "I");
    if (answeredResponses[0]?.kind === "I") {
      assert.equal(answeredResponses[0].selectedOptionId, "opt-1a");
    }

    // Palette button 1 should now be answered
    const palBtn1 = root.querySelector<EnhancedMockElement>("#pal-btn-q1-i");
    assert.ok(palBtn1 !== null);
    assert.equal(palBtn1.classList.contains("answered"), true);

    // Test Keyboard navigation: ArrowDown from option A to option B
    optA.dispatchEvent(new MockKeyboardEvent("keydown", { key: "ArrowDown" }));

    assert.equal(optB.classList.contains("selected"), true);
    assert.equal(optB.getAttribute("aria-checked"), "true");
    assert.equal(optA.classList.contains("selected"), false);

    unmount();
  });

  it("handles Part II true/false/unanswered states with three-way toggling and palette partial/answered badges", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-part2" };
    const exam = createTestExam();
    const startRes = await startAttempt(exam, "Thí sinh II", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    const unmount = mount(root as unknown as HTMLElement, controller, {});

    const palBtn2 = root.querySelector<EnhancedMockElement>("#pal-btn-q2-ii");
    assert.ok(palBtn2 !== null);
    assert.equal(palBtn2.classList.contains("answered"), false);
    assert.equal(palBtn2.classList.contains("partial"), false);

    // Find row for statement 2a
    const row2a = root.querySelector<EnhancedMockElement>('[data-statement-id="st-2a"]');
    assert.ok(row2a !== null);

    const btnTrue2a = row2a.querySelector<EnhancedMockElement>('.tf-btn[data-val="true"]');
    const btnFalse2a = row2a.querySelector<EnhancedMockElement>('.tf-btn[data-val="false"]');
    assert.ok(btnTrue2a !== null);
    assert.ok(btnFalse2a !== null);

    // Initial: neither selected
    assert.equal(btnTrue2a.classList.contains("selected-true"), false);
    assert.equal(btnFalse2a.classList.contains("selected-false"), false);

    // 1. Click "Đúng" on 2a -> becomes true
    btnTrue2a.click();
    assert.equal(btnTrue2a.classList.contains("selected-true"), true);
    assert.equal(btnTrue2a.getAttribute("aria-pressed"), "true");
    assert.equal(btnFalse2a.classList.contains("selected-false"), false);

    // Palette should show "partial" because 1 of 4 is answered
    assert.equal(palBtn2.classList.contains("partial"), true);
    assert.equal(palBtn2.classList.contains("answered"), false);

    // 2. Click "Đúng" on 2a again -> TOGGLES BACK TO UNANSWERED (null)!
    btnTrue2a.click();
    assert.equal(btnTrue2a.classList.contains("selected-true"), false);
    assert.equal(btnTrue2a.getAttribute("aria-pressed"), "false");
    assert.equal(palBtn2.classList.contains("partial"), false);
    assert.equal(palBtn2.classList.contains("answered"), false);

    // 3. Click "Sai" on 2a -> becomes false
    btnFalse2a.click();
    assert.equal(btnFalse2a.classList.contains("selected-false"), true);
    assert.equal(btnFalse2a.getAttribute("aria-pressed"), "true");
    assert.equal(btnTrue2a.classList.contains("selected-true"), false);

    // 4. Click "Sai" on 2a again -> TOGGLES BACK TO UNANSWERED (null)!
    btnFalse2a.click();
    assert.equal(btnFalse2a.classList.contains("selected-false"), false);
    assert.equal(btnFalse2a.getAttribute("aria-pressed"), "false");

    // 5. Answer all 4 statements (2a: True, 2b: False, 2c: True, 2d: False)
    const row2b = root.querySelector<EnhancedMockElement>('[data-statement-id="st-2b"]');
    const row2c = root.querySelector<EnhancedMockElement>('[data-statement-id="st-2c"]');
    const row2d = root.querySelector<EnhancedMockElement>('[data-statement-id="st-2d"]');
    assert.ok(row2b !== null && row2c !== null && row2d !== null);

    btnTrue2a.click(); // 2a = True
    row2b.querySelector<EnhancedMockElement>('.tf-btn[data-val="false"]')?.click(); // 2b = False
    row2c.querySelector<EnhancedMockElement>('.tf-btn[data-val="true"]')?.click(); // 2c = True
    row2d.querySelector<EnhancedMockElement>('.tf-btn[data-val="false"]')?.click(); // 2d = False

    // Now all 4 are answered -> palette should show "answered" and NOT "partial"
    assert.equal(palBtn2.classList.contains("answered"), true);
    assert.equal(palBtn2.classList.contains("partial"), false);

    // Check controller snapshot answers
    const resp2 = controller.getSnapshot().responses.responses.find((r) => r.questionVersionId === "q2-ii");
    assert.equal(resp2?.kind, "II");
    if (resp2?.kind === "II") {
      assert.equal(resp2.answers.length, 4);
      assert.equal(resp2.answers.find((a) => a.statementId === "st-2a")?.value, true);
      assert.equal(resp2.answers.find((a) => a.statementId === "st-2b")?.value, false);
      assert.equal(resp2.answers.find((a) => a.statementId === "st-2c")?.value, true);
      assert.equal(resp2.answers.find((a) => a.statementId === "st-2d")?.value, false);
    }

    unmount();
  });

  it("handles Part III short-answer text with no raw coercion, 4-char preview boxes, and quick keys", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-part3" };
    const exam = createTestExam();
    const startRes = await startAttempt(exam, "Thí sinh III", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    const unmount = mount(root as unknown as HTMLElement, controller, {});

    const input3 = root.querySelector<EnhancedMockElement>("#input-iii-q3-iii");
    assert.ok(input3 !== null);

    const card3 = root.querySelector<EnhancedMockElement>("#qcard-q3-iii");
    assert.ok(card3 !== null);

    const charBoxes = card3.querySelectorAll<EnhancedMockElement>(".char-box");
    assert.equal(charBoxes.length, 4);

    // AC: No raw text coercion or silent paste correction
    // Paste or type string with comma and whitespace: " 1,5"
    input3.value = " 1,5";
    input3.dispatchEvent(new MockEvent("input"));

    // Check char boxes reflect exact string
    assert.equal(charBoxes[0]?.textContent, " ");
    assert.equal(charBoxes[1]?.textContent, "1");
    assert.equal(charBoxes[2]?.textContent, ",");
    assert.equal(charBoxes[3]?.textContent, "5");
    assert.equal(charBoxes[3]?.classList.contains("filled"), true);

    // Controller must preserve exact raw string (no trim, no coercion)
    let resp3 = controller.getSnapshot().responses.responses.find((r) => r.questionVersionId === "q3-iii");
    assert.equal(resp3?.kind, "III");
    if (resp3?.kind === "III") {
      assert.equal(resp3.raw, " 1,5");
    }

    // Palette button 3 should be answered
    const palBtn3 = root.querySelector<EnhancedMockElement>("#pal-btn-q3-iii");
    assert.ok(palBtn3 !== null);
    assert.equal(palBtn3.classList.contains("answered"), true);

    // Test Quick-keys for question 4 (e.g. typing "-0,5")
    const card4 = root.querySelector<EnhancedMockElement>("#qcard-q4-iii");
    assert.ok(card4 !== null);
    const input4 = root.querySelector<EnhancedMockElement>("#input-iii-q4-iii");
    assert.ok(input4 !== null);

    const btnMinus = card4.querySelector<EnhancedMockElement>('.quick-key-btn[data-char="-"]');
    const btnComma = card4.querySelector<EnhancedMockElement>('.quick-key-btn[data-char=","]');
    const btnClear = card4.querySelector<EnhancedMockElement>('.quick-key-btn[data-action="clear"]');
    assert.ok(btnMinus !== null && btnComma !== null && btnClear !== null);

    // Click Minus
    btnMinus.click();
    assert.equal(input4.value, "-");

    // Type "0"
    input4.value += "0";
    input4.dispatchEvent(new MockEvent("input"));

    // Click Comma
    btnComma.click();
    assert.equal(input4.value, "-0,");

    // Type "5"
    input4.value += "5";
    input4.dispatchEvent(new MockEvent("input"));
    assert.equal(input4.value, "-0,5");

    // Controller raw value
    let resp4 = controller.getSnapshot().responses.responses.find((r) => r.questionVersionId === "q4-iii");
    assert.equal(resp4?.kind, "III");
    if (resp4?.kind === "III") {
      assert.equal(resp4.raw, "-0,5");
    }

    // Click Clear
    btnClear.click();
    assert.equal(input4.value, "");
    resp4 = controller.getSnapshot().responses.responses.find((r) => r.questionVersionId === "q4-iii");
    assert.equal(resp4?.kind, "III");
    if (resp4?.kind === "III") {
      assert.equal(resp4.raw, "");
    }

    unmount();
  });

  it("handles review flags, palette navigation, and progress counter", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-flags" };
    const exam = createTestExam();
    const startRes = await startAttempt(exam, "Thí sinh Flags", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    const flagsToggled: string[] = [];
    const navigatedQuestions: string[] = [];

    const actions = {
      toggleFlag: (qId: unknown) => flagsToggled.push(String(qId)),
      navigateQuestion: (qId: unknown) => navigatedQuestions.push(String(qId)),
    };

    const unmount = mount(root as unknown as HTMLElement, controller, actions);

    const flagBtn1 = root.querySelector<EnhancedMockElement>("#flag-btn-q1-i");
    const palBtn1 = root.querySelector<EnhancedMockElement>("#pal-btn-q1-i");
    assert.ok(flagBtn1 !== null && palBtn1 !== null);

    // Initial state: not flagged
    assert.equal(flagBtn1.classList.contains("flagged"), false);
    assert.equal(palBtn1.classList.contains("flagged"), false);

    // Toggle flag on question 1
    flagBtn1.click();
    assert.equal(flagBtn1.classList.contains("flagged"), true);
    assert.equal(flagBtn1.textContent, "★ Đã đánh dấu");
    assert.equal(palBtn1.classList.contains("flagged"), true);
    assert.equal(flagsToggled.length, 1);
    assert.equal(flagsToggled[0], "q1-i");

    // Toggle flag off
    flagBtn1.click();
    assert.equal(flagBtn1.classList.contains("flagged"), false);
    assert.equal(flagBtn1.textContent, "★ Đã đánh dấu"); // text flips back
    assert.equal(palBtn1.classList.contains("flagged"), false);

    // Click palette button to navigate
    palBtn1.click();
    assert.equal(navigatedQuestions.length, 1);
    assert.equal(navigatedQuestions[0], "q1-i");

    // Check progress text
    const progressEl = root.querySelector<EnhancedMockElement>("#paletteProgress");
    assert.ok(progressEl !== null);
    assert.equal(progressEl.textContent, "Đã làm: 0/4 câu");

    // Answer Q1
    await controller.answer({ kind: "I", questionVersionId: "q1-i", selectedOptionId: "opt-1b" });
    assert.equal(progressEl.textContent, "Đã làm: 1/4 câu");

    unmount();
  });

  it("handles timer countdown, warning threshold, and deadline auto-submission", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let currentClock = 1000000;
    const deps = { storage, now: () => currentClock, id: () => "att-timer" };

    // Exam with 1 minute duration (60 seconds)
    const exam = createTestExam({ durationMinutes: 1 });
    const startRes = await startAttempt(exam, "Thí sinh Timer", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    let submittedReason: string | null = null;
    const actions = {
      submit: (reason: unknown) => {
        submittedReason = String(reason);
      },
    };

    const vm: StudentViewModel = {
      controller,
      now: () => currentClock,
    };

    const unmount = mount(root as unknown as HTMLElement, vm, actions);

    const timerBox = root.querySelector<EnhancedMockElement>("#timerBox");
    assert.ok(timerBox !== null);

    // Initial timer (60s) -> "01:00"
    assert.equal(timerBox.textContent, "01:00");
    // Since 60s <= 300s, it gets warning class
    assert.equal(timerBox.classList.contains("timer-warning"), true);

    // Advance clock past deadline
    currentClock = 1000000 + 61 * 1000;

    // Trigger timer update
    const submitBtn = root.querySelector<EnhancedMockElement>("#btnSubmit");
    assert.ok(submitBtn !== null);

    // Mount unmount helper triggers cleanup
    unmount();

    // Re-mount with expired time to test auto-submit on tick
    const unmount2 = mount(root as unknown as HTMLElement, vm, actions);
    const expiredTimerBox = root.querySelector<EnhancedMockElement>("#timerBox");
    assert.ok(expiredTimerBox !== null);
    assert.equal(expiredTimerBox.textContent, "00:00");
    assert.equal(expiredTimerBox.classList.contains("timer-expired"), true);
    assert.equal(submittedReason, "deadline");

    unmount2();
  });

  it("handles submit modal confirmation dialog, preventing double submission", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-modal" };
    const exam = createTestExam();
    const startRes = await startAttempt(exam, "Thí sinh Modal", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    let submitCount = 0;
    const actions = {
      submit: () => {
        submitCount++;
      },
    };

    const unmount = mount(root as unknown as HTMLElement, controller, actions);

    const submitBtn = root.querySelector<EnhancedMockElement>("#btnSubmit");
    const modal = root.querySelector<EnhancedMockElement>("#submitModal");
    const btnCancel = root.querySelector<EnhancedMockElement>("#btnCancelSubmit");
    const btnConfirm = root.querySelector<EnhancedMockElement>("#btnConfirmSubmit");

    assert.ok(submitBtn !== null && modal !== null && btnCancel !== null && btnConfirm !== null);

    // Initially modal is hidden
    assert.equal(modal.style.display, "none");

    // Click submit button -> modal opens
    submitBtn.click();
    assert.equal(modal.style.display, "flex");

    // Click cancel -> modal closes without submitting
    btnCancel.click();
    assert.equal(modal.style.display, "none");
    assert.equal(submitCount, 0);

    // Click submit button again -> open modal and confirm
    submitBtn.click();
    assert.equal(modal.style.display, "flex");

    btnConfirm.click();
    assert.equal(submitCount, 1);
    assert.equal(submitBtn.disabled, true);
    assert.equal(btnConfirm.disabled, true);

    // Verify double-click submit does not submit twice
    btnConfirm.click();
    assert.equal(submitCount, 1);

    unmount();
  });

  it("renders attempt history and enforces maxAttempts restriction", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const exam = createTestExam({ maxAttempts: 2 });
    let restartCalled = false;

    const history: StudentHistoryItem[] = [
      {
        attemptId: "att-hist-1",
        candidateName: "Nguyễn Thí Sinh",
        submittedAt: "10:30:00",
        scoreI: "1",
        maxI: "1",
        scoreII: "0,5",
        maxII: "1",
        scoreIII: "0,25",
        maxIII: "0,5",
        totalFraction: "7/4",
        maxTotalFraction: "10",
      },
      {
        attemptId: "att-hist-2",
        candidateName: "Nguyễn Thí Sinh",
        submittedAt: "11:30:00",
        scoreI: "1",
        maxI: "1",
        scoreII: "1",
        maxII: "1",
        scoreIII: "0,5",
        maxIII: "0,5",
        totalFraction: "5/2",
        maxTotalFraction: "10",
      },
    ];

    const vm: StudentViewModel = {
      exam,
      history,
    };

    const actions = {
      restart: () => {
        restartCalled = true;
      },
    };

    const unmount = mount(root as unknown as HTMLElement, vm, actions);

    // History table exists
    const historySection = root.querySelector<EnhancedMockElement>("#attemptHistorySection");
    assert.ok(historySection !== null);

    const rows = historySection.querySelectorAll<EnhancedMockElement>("tbody tr");
    assert.equal(rows.length, 2);

    // Since history.length (2) >= maxAttempts (2), max attempts notice must be shown
    const notice = root.querySelector<EnhancedMockElement>("#maxAttemptsNotice");
    assert.ok(notice !== null);
    assert.equal(notice.style.display, "block");
    assert.ok(notice.textContent?.includes("Bạn đã đạt số lượt làm bài tối đa"));

    // Restart button must be disabled
    const btnRestart = root.querySelector<EnhancedMockElement>("#btnRestart");
    assert.ok(btnRestart !== null);
    assert.equal(btnRestart.disabled, true);

    btnRestart.click();
    assert.equal(restartCalled, false);

    unmount();
  });

  it("disposes cleanly without leaks, clearing timer and controller subscriptions", async () => {
    const doc = createEnhancedMockDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    const deps = { storage, now: () => clock, id: () => "att-dispose" };
    const exam = createTestExam();
    const startRes = await startAttempt(exam, "Thí sinh Dispose", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const controller = startRes.value;
    const unmount = mount(root as unknown as HTMLElement, controller, {});

    // Elements exist
    assert.ok(root.querySelector("#candidateName") !== null);

    // Call unmount
    unmount();

    // Root should be cleaned
    assert.equal(root.textContent, "");

    // Controller operations after unmount should not throw or affect view
    await controller.answer({ kind: "I", questionVersionId: "q1-i", selectedOptionId: "opt-1a" });
  });
});
