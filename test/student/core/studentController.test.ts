import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  startAttempt,
  resumeAttempt,
  toDomainExam,
} from "../../../src/student/index.ts";
import type {
  WebExam,
  WebEvent,
  Response,
} from "../../../src/student/types.ts";
import { InMemoryStoragePort } from "./inMemoryStorage.ts";

function createSampleExam(settingsOverrides: Partial<WebExam["settings"]> = {}): WebExam {
  return {
    schemaVersion: "web-exam-v1",
    examId: "exam-thpt-2026",
    examVersionId: "v1.0.0",
    ruleSetId: "custom-v1",
    inputPolicyId: "sa-charset-v1",
    title: "Đề thi thử THPT Quốc Gia 2026",
    subject: "Toán",
    grade: 12,
    settings: {
      durationMinutes: 50,
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
        questionVersionId: "q1-i",
        title: "Câu 1",
        content: "Chọn khẳng định đúng",
        correctOptionId: "opt-1b",
        options: [
          { optionId: "opt-1a", label: "A", text: "Lựa chọn A" },
          { optionId: "opt-1b", label: "B", text: "Lựa chọn B" },
          { optionId: "opt-1c", label: "C", text: "Lựa chọn C" },
          { optionId: "opt-1d", label: "D", text: "Lựa chọn D" },
        ],
      },
      {
        kind: "II",
        questionVersionId: "q2-ii",
        title: "Câu 2",
        content: "Xét tính đúng sai của các mệnh đề sau",
        statements: [
          { statementId: "st-2a", label: "a", text: "Mệnh đề a", answer: true },
          { statementId: "st-2b", label: "b", text: "Mệnh đề b", answer: false },
          { statementId: "st-2c", label: "c", text: "Mệnh đề c", answer: true },
          { statementId: "st-2d", label: "d", text: "Mệnh đề d", answer: false },
        ],
      },
      {
        kind: "III",
        questionVersionId: "q3-iii",
        title: "Câu 3",
        content: "Tính giá trị của biểu thức (ví dụ 1,5)",
        answerKey: "1,5",
      },
      {
        kind: "III",
        questionVersionId: "q4-iii",
        title: "Câu 4",
        content: "Tính nghiệm âm (ví dụ -0,5)",
        answerKey: "-0,5",
      },
    ],
  };
}

describe("StudentController Core Tests", () => {
  it("starts attempt, creates frozen snapshot, and validates domain presentation order", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000000;
    let idCounter = 1;
    const deps = {
      storage,
      now: () => clock,
      id: () => `att-${idCounter++}`,
    };

    const exam = createSampleExam();
    const res = await startAttempt(exam, "Nguyễn Văn A", deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const controller = res.value;
    const snapshot = controller.getSnapshot();

    assert.equal(snapshot.attemptId, "att-1");
    assert.equal(snapshot.examId, "exam-thpt-2026");
    assert.equal(snapshot.examVersionId, "v1.0.0");
    assert.equal(snapshot.candidateName, "Nguyễn Văn A");
    assert.equal(snapshot.phase, "draft");
    assert.equal(snapshot.startedAt, 1000000);
    assert.equal(snapshot.deadline, 1000000 + 50 * 60 * 1000);
    assert.equal(snapshot.revision, 1);

    // Freeze snapshots check
    assert.ok(Object.isFrozen(snapshot), "Snapshot must be frozen");
    assert.ok(Object.isFrozen(snapshot.examSnapshot), "examSnapshot must be frozen");
    assert.ok(Object.isFrozen(snapshot.presentationOrder), "presentationOrder must be frozen");
    assert.ok(Object.isFrozen(snapshot.responses), "responses must be frozen");

    // Mutation immunity
    (exam.questions as any)[0].title = "MUTATED TITLE";
    assert.equal(snapshot.examSnapshot.questions[0]!.title, "Câu 1", "Snapshot immune to external mutation");
  });

  it("handles exact Part III strings: 1,5 vs 1,50 vs 1.5 and -0,5 without normalization", async () => {
    // Test 1: Exact match "1,5" -> full score
    {
      const storage = new InMemoryStoragePort();
      let clock = 1000;
      const deps = { storage, now: () => clock, id: () => "att-iii-1" };
      const exam = createSampleExam();
      const res = await startAttempt(exam, "Học sinh 1", deps);
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const controller = res.value;
      const ansRes = await controller.answer({
        kind: "III",
        questionVersionId: "q3-iii",
        raw: "1,5",
      });
      assert.equal(ansRes.ok, true);
      assert.equal(controller.getSnapshot().responses.responses[0]!.kind, "III");
      assert.equal((controller.getSnapshot().responses.responses[0] as any).raw, "1,5");

      const subRes = await controller.submit("manual");
      assert.equal(subRes.ok, true);
      const scoreDTO = subRes.ok ? (subRes.value.scoreDTO as any) : null;
      assert.ok(scoreDTO);
      const q3Result = scoreDTO.questions.find((q: any) => q.questionVersionId === "q3-iii");
      assert.equal(q3Result.status, "full");
      assert.notEqual(q3Result.points, "0");
    }

    // Test 2: "1,50" does NOT match "1,5"
    {
      const storage = new InMemoryStoragePort();
      let clock = 1000;
      const deps = { storage, now: () => clock, id: () => "att-iii-2" };
      const exam = createSampleExam();
      const res = await startAttempt(exam, "Học sinh 2", deps);
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const controller = res.value;
      await controller.answer({
        kind: "III",
        questionVersionId: "q3-iii",
        raw: "1,50",
      });
      assert.equal((controller.getSnapshot().responses.responses[0] as any).raw, "1,50");

      const subRes = await controller.submit("manual");
      assert.equal(subRes.ok, true);
      const scoreDTO = subRes.ok ? (subRes.value.scoreDTO as any) : null;
      const q3Result = scoreDTO.questions.find((q: any) => q.questionVersionId === "q3-iii");
      assert.equal(q3Result.status, "wrong");
      assert.equal(q3Result.points, "0");
    }

    // Test 3: "1.5" (dot instead of comma) contains non-allowed char '.'
    // Per M1 checkShortAnswer, dot is bad_char -> status 'invalid', points 0
    {
      const storage = new InMemoryStoragePort();
      let clock = 1000;
      const deps = { storage, now: () => clock, id: () => "att-iii-3" };
      const exam = createSampleExam();
      const res = await startAttempt(exam, "Học sinh 3", deps);
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const controller = res.value;
      await controller.answer({
        kind: "III",
        questionVersionId: "q3-iii",
        raw: "1.5",
      });
      assert.equal((controller.getSnapshot().responses.responses[0] as any).raw, "1.5");

      const subRes = await controller.submit("manual");
      assert.equal(subRes.ok, true);
      const scoreDTO = subRes.ok ? (subRes.value.scoreDTO as any) : null;
      const q3Result = scoreDTO.questions.find((q: any) => q.questionVersionId === "q3-iii");
      assert.equal(q3Result.status, "invalid");
      assert.equal(q3Result.points, "0");
      assert.ok(q3Result.inputIssues.includes("bad_char"));
    }

    // Test 3b: Valid charset but wrong answer "1,4" vs "1,5" -> status 'wrong', points 0
    {
      const storage = new InMemoryStoragePort();
      let clock = 1000;
      const deps = { storage, now: () => clock, id: () => "att-iii-3b" };
      const exam = createSampleExam();
      const res = await startAttempt(exam, "Học sinh 3b", deps);
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const controller = res.value;
      await controller.answer({
        kind: "III",
        questionVersionId: "q3-iii",
        raw: "1,4",
      });
      assert.equal((controller.getSnapshot().responses.responses[0] as any).raw, "1,4");

      const subRes = await controller.submit("manual");
      assert.equal(subRes.ok, true);
      const scoreDTO = subRes.ok ? (subRes.value.scoreDTO as any) : null;
      const q3Result = scoreDTO.questions.find((q: any) => q.questionVersionId === "q3-iii");
      assert.equal(q3Result.status, "wrong");
      assert.equal(q3Result.points, "0");
    }

    // Test 4: "-0,5" matches "-0,5"
    {
      const storage = new InMemoryStoragePort();
      let clock = 1000;
      const deps = { storage, now: () => clock, id: () => "att-iii-4" };
      const exam = createSampleExam();
      const res = await startAttempt(exam, "Học sinh 4", deps);
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const controller = res.value;
      await controller.answer({
        kind: "III",
        questionVersionId: "q4-iii",
        raw: "-0,5",
      });
      assert.equal((controller.getSnapshot().responses.responses[0] as any).raw, "-0,5");

      const subRes = await controller.submit("manual");
      assert.equal(subRes.ok, true);
      const scoreDTO = subRes.ok ? (subRes.value.scoreDTO as any) : null;
      const q4Result = scoreDTO.questions.find((q: any) => q.questionVersionId === "q4-iii");
      assert.equal(q4Result.status, "full");
      assert.notEqual(q4Result.points, "0");
    }
  });

  it("preserves Unicode, whitespace, and pasted strings without truncation", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000;
    const deps = { storage, now: () => clock, id: () => "att-paste" };
    const exam = createSampleExam();
    const res = await startAttempt(exam, "Học sinh Paste", deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const controller = res.value;
    const longPastedString = "   1,5000000000   ";
    const unicodeString = "１,５ (toàn giác)";

    // Answer with long whitespace string
    await controller.answer({
      kind: "III",
      questionVersionId: "q3-iii",
      raw: longPastedString,
    });

    // Answer with unicode string
    await controller.answer({
      kind: "III",
      questionVersionId: "q4-iii",
      raw: unicodeString,
    });

    const snapshot = controller.getSnapshot();
    const q3 = snapshot.responses.responses.find((r) => r.questionVersionId === "q3-iii") as any;
    const q4 = snapshot.responses.responses.find((r) => r.questionVersionId === "q4-iii") as any;

    assert.equal(q3.raw, longPastedString, "Must preserve whitespace without trim or truncation");
    assert.equal(q4.raw, unicodeString, "Must preserve unicode without truncation");

    // Submit and score: scoring should mark issues without crashing
    const subRes = await controller.submit("manual");
    assert.equal(subRes.ok, true);
    const scoreDTO = subRes.ok ? (subRes.value.scoreDTO as any) : null;
    assert.ok(scoreDTO);

    const q3Score = scoreDTO.questions.find((q: any) => q.questionVersionId === "q3-iii");
    assert.equal(q3Score.status, "invalid");
    assert.ok(q3Score.inputIssues.includes("too_long") || q3Score.inputIssues.includes("bad_char"));
  });

  it("handles Part II with null statements and does NOT coerce null to false", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000;
    const deps = { storage, now: () => clock, id: () => "att-part2-null" };
    const exam = createSampleExam();
    const res = await startAttempt(exam, "Học sinh II", deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const controller = res.value;

    // Statements:
    // a: true (correct, answer is true)
    // b: false (correct, answer is false)
    // c: null (unanswered, answer is true)
    // d: null (unanswered, answer is false)
    // If null were coerced to false, statement d would become correct!
    // But with null, exactly 2 statements (a, b) are correct -> 0.25 points!
    await controller.answer({
      kind: "II",
      questionVersionId: "q2-ii",
      answers: [
        { statementId: "st-2a", value: true },
        { statementId: "st-2b", value: false },
        { statementId: "st-2c", value: null },
        { statementId: "st-2d", value: null },
      ],
    });

    const snapshot = controller.getSnapshot();
    const respII = snapshot.responses.responses.find((r) => r.questionVersionId === "q2-ii") as any;
    assert.equal(respII.answers[2].value, null, "Must preserve null value");
    assert.equal(respII.answers[3].value, null, "Must preserve null value");

    const subRes = await controller.submit("manual");
    assert.equal(subRes.ok, true);
    const scoreDTO = subRes.ok ? (subRes.value.scoreDTO as any) : null;
    const q2Result = scoreDTO.questions.find((q: any) => q.questionVersionId === "q2-ii");

    // Correct count must be exactly 2
    assert.equal(q2Result.correctCount, 2, "Exactly 2 statements correct; null not coerced to false");
    // For GDPT 2018: 2 correct statements = 0.25 points = 1/4
    assert.equal(q2Result.points, "1/4");
    assert.equal(q2Result.status, "partial");
  });

  it("tests independent shuffle flags for questions and options", async () => {
    const baseExam = createSampleExam();
    // Add multiple Part I questions so question shuffle is noticeable
    const extendedExam: WebExam = {
      ...baseExam,
      questions: [
        ...baseExam.questions,
        {
          kind: "I",
          questionVersionId: "q1b-i",
          title: "Câu 1b",
          content: "Khẳng định 1b",
          correctOptionId: "opt-1b1",
          options: [
            { optionId: "opt-1b1", label: "A", text: "1" },
            { optionId: "opt-1b2", label: "B", text: "2" },
            { optionId: "opt-1b3", label: "C", text: "3" },
            { optionId: "opt-1b4", label: "D", text: "4" },
          ],
        },
      ],
    };

    // Case 1: Neither flag enabled
    {
      const storage = new InMemoryStoragePort();
      const deps = { storage, now: () => 1000, id: () => "att-noshuffle" };
      const examNoShuffle: WebExam = {
        ...extendedExam,
        settings: { ...extendedExam.settings, shuffleQuestions: false, shuffleOptions: false },
      };
      const res = await startAttempt(examNoShuffle, "A", deps);
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const order = res.value.getSnapshot().presentationOrder;
      assert.deepEqual(
        order.questionOrder,
        extendedExam.questions.map((q) => q.questionVersionId)
      );
      assert.deepEqual(
        order.optionOrder[0]!.optionIds,
        (extendedExam.questions[0] as any).options.map((o: any) => o.optionId)
      );
    }

    // Case 2: Only shuffleOptions enabled
    {
      const storage = new InMemoryStoragePort();
      const deps = { storage, now: () => 1000, id: () => "att-optshuffle" };
      const examOptShuffle: WebExam = {
        ...extendedExam,
        settings: { ...extendedExam.settings, shuffleQuestions: false, shuffleOptions: true },
      };
      const res = await startAttempt(examOptShuffle, "B", deps);
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const order = res.value.getSnapshot().presentationOrder;
      // Questions order unchanged
      assert.deepEqual(
        order.questionOrder,
        extendedExam.questions.map((q) => q.questionVersionId)
      );
      // Option order shuffled
      assert.equal(order.optionOrder.length, 2);
    }

    // Case 3: Only shuffleQuestions enabled
    {
      const storage = new InMemoryStoragePort();
      const deps = { storage, now: () => 1000, id: () => "att-qshuffle" };
      const examQShuffle: WebExam = {
        ...extendedExam,
        settings: { ...extendedExam.settings, shuffleQuestions: true, shuffleOptions: false },
      };
      const res = await startAttempt(examQShuffle, "C", deps);
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const order = res.value.getSnapshot().presentationOrder;
      // Options order unchanged for each Part I question
      const q1OptionsOriginal = (extendedExam.questions[0] as any).options.map((o: any) => o.optionId);
      const q1OptionOrder = order.optionOrder.find((o) => o.questionVersionId === "q1-i")!;
      assert.deepEqual(q1OptionOrder.optionIds, q1OptionsOriginal);
    }
  });

  it("detects clock rollback, does not reset deadline, and emits CLOCK_CHANGED event", async () => {
    const storage = new InMemoryStoragePort();
    let currentClock = 100000;
    const deps = { storage, now: () => currentClock, id: () => "att-clock" };
    const exam = createSampleExam({ durationMinutes: 30 });
    const res = await startAttempt(exam, "Học sinh Clock", deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const controller = res.value;
    const initialDeadline = controller.getSnapshot().deadline;
    assert.equal(initialDeadline, 100000 + 30 * 60 * 1000);

    const events: WebEvent[] = [];
    controller.subscribe((evt) => events.push(evt));

    // Clock advances normally
    currentClock = 150000;
    await controller.rename("Tên mới 1");
    assert.equal(controller.getSnapshot().deadline, initialDeadline);

    // Clock rolled backward to 50000
    currentClock = 50000;
    await controller.rename("Tên mới 2");

    // Deadline must NOT be extended or reset
    assert.equal(controller.getSnapshot().deadline, initialDeadline, "Deadline must not reset on clock rollback");

    // Event CLOCK_CHANGED must have been emitted
    const clockErrorEvent = events.find(
      (e) => e.type === "error" && (e as any).error.code === "CLOCK_CHANGED"
    );
    assert.ok(clockErrorEvent, "Must emit CLOCK_CHANGED error event on rollback");
  });

  it("handles disposal and late callbacks cleanly", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000;
    const deps = { storage, now: () => clock, id: () => "att-dispose" };
    const exam = createSampleExam();
    const res = await startAttempt(exam, "Học sinh Dispose", deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const controller = res.value;
    const events: WebEvent[] = [];
    const unsubscribe = controller.subscribe((e) => events.push(e));

    // Normal operation before dispose
    await controller.rename("Tên hợp lệ");
    assert.equal(events.length, 1);

    // Unsubscribe works
    unsubscribe();
    await controller.rename("Tên hợp lệ 2");
    assert.equal(events.length, 1, "Unsubscribed listener receives no further events");

    // Dispose controller
    controller.dispose();

    // Calling methods on disposed controller returns error
    const ansRes = await controller.answer({ kind: "I", questionVersionId: "q1-i", selectedOptionId: "opt-1a" });
    assert.equal(ansRes.ok, false);
    if (!ansRes.ok) {
      assert.equal(ansRes.error.code, "CONTROLLER_DISPOSED");
    }

    const renameRes = await controller.rename("Tên sau dispose");
    assert.equal(renameRes.ok, false);
    if (!renameRes.ok) {
      assert.equal(renameRes.error.code, "CONTROLLER_DISPOSED");
    }

    const subRes = await controller.submit("manual");
    assert.equal(subRes.ok, false);
    if (!subRes.ok) {
      assert.equal(subRes.error.code, "CONTROLLER_DISPOSED");
    }
  });

  it("handles duplicate submit idempotently (both sequential and concurrent double click)", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000;
    const deps = { storage, now: () => clock, id: () => "att-duplicate-submit" };
    const exam = createSampleExam();
    const res = await startAttempt(exam, "Học sinh Submit", deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const controller = res.value;

    // Concurrent double-click submit
    const [sub1, sub2] = await Promise.all([
      controller.submit("manual"),
      controller.submit("manual"),
    ]);

    assert.equal(sub1.ok, true);
    assert.equal(sub2.ok, true);
    assert.equal(storage.finalizeCalls, 1, "Storage finalize called exactly once on concurrent submits");
    if (!sub1.ok || !sub2.ok) return;
    assert.equal(sub1.value.phase, "final");
    assert.equal(sub2.value.phase, "final");

    // Sequential duplicate submit on already finalized controller
    const sub3 = await controller.submit("manual");
    assert.equal(sub3.ok, true);
    if (!sub3.ok) return;
    assert.equal(sub3.value.phase, "final");
    assert.equal(storage.finalizeCalls, 1, "No extra finalize calls for subsequent submits");
  });

  it("handles final adoption across two tabs sharing an attempt", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000;
    const deps = { storage, now: () => clock, id: () => "att-shared" };
    const exam = createSampleExam();

    // Tab 1 starts attempt
    const res1 = await startAttempt(exam, "Học sinh Hai Tab", deps);
    assert.equal(res1.ok, true);
    if (!res1.ok) return;
    const tab1 = res1.value;

    // Tab 2 resumes the same attempt
    const res2 = await resumeAttempt(tab1.getSnapshot(), deps);
    assert.equal(res2.ok, true);
    if (!res2.ok) return;
    const tab2 = res2.value;

    const tab2Events: WebEvent[] = [];
    tab2.subscribe((e) => tab2Events.push(e));

    // Tab 1 submits and finalizes the attempt
    const tab1Submit = await tab1.submit("manual");
    assert.equal(tab1Submit.ok, true);
    assert.equal(tab1.getSnapshot().phase, "final");

    // Tab 2 attempts to answer -> hits storage conflict, loads, and adopts Tab 1's final record
    const tab2Answer = await tab2.answer({
      kind: "I",
      questionVersionId: "q1-i",
      selectedOptionId: "opt-1b",
    });

    assert.equal(tab2Answer.ok, false);
    if (!tab2Answer.ok) {
      assert.equal(tab2Answer.error.code, "ATTEMPT_FINALIZED");
    }

    // Tab 2 snapshot adopted the final record
    assert.equal(tab2.getSnapshot().phase, "final", "Tab 2 adopted final phase");
    assert.equal(tab2.getSnapshot().submittedAt, tab1.getSnapshot().submittedAt);

    // Tab 2 received attempt_finalized event
    const adoptedEvent = tab2Events.find((e) => e.type === "attempt_finalized");
    assert.ok(adoptedEvent, "Tab 2 must emit attempt_finalized on adoption");
  });

  it("preserves tuple and presentation order across restore", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000;
    const deps = { storage, now: () => clock, id: () => "att-restore-tuple" };
    const exam = createSampleExam({ shuffleQuestions: true, shuffleOptions: true });

    const startRes = await startAttempt(exam, "Thí sinh Tuple", deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    const initial = startRes.value.getSnapshot();
    await startRes.value.answer({ kind: "I", questionVersionId: "q1-i", selectedOptionId: "opt-1b" });
    const updated = startRes.value.getSnapshot();

    // Resume attempt
    const resumeRes = await resumeAttempt(initial, deps);
    assert.equal(resumeRes.ok, true);
    if (!resumeRes.ok) return;

    const restored = resumeRes.value.getSnapshot();
    assert.equal(restored.examId, initial.examId);
    assert.equal(restored.examVersionId, initial.examVersionId);
    assert.equal(restored.attemptId, initial.attemptId);
    assert.equal(restored.startedAt, initial.startedAt);
    assert.equal(restored.deadline, initial.deadline);
    assert.equal(restored.candidateName, "Thí sinh Tuple");
    assert.deepEqual(restored.presentationOrder, initial.presentationOrder);
    assert.deepEqual(restored.responses, updated.responses);
  });

  it("LC28-F01 regression: restores saved nickname before overdue autosubmit", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 100000;
    const deps = { storage, now: () => clock, id: () => "att-lc28-nick" };
    const exam = createSampleExam({ durationMinutes: 10 }); // deadline = 100000 + 600000 = 700000

    // Student starts attempt with custom nickname
    const savedName = "Nguyễn An LC28";
    const startRes = await startAttempt(exam, savedName, deps);
    assert.equal(startRes.ok, true);
    if (!startRes.ok) return;

    // Student answers a question
    await startRes.value.answer({ kind: "I", questionVersionId: "q1-i", selectedOptionId: "opt-1b" });

    // Time passes until well after deadline
    clock = 800000; // Overdue!

    // Resume the expired attempt
    const resumeRes = await resumeAttempt(startRes.value.getSnapshot(), deps);
    assert.equal(resumeRes.ok, true);
    if (!resumeRes.ok) return;

    const finalizedSnapshot = resumeRes.value.getSnapshot();

    // Verify overdue attempt was finalized
    assert.equal(finalizedSnapshot.phase, "final", "Expired draft must be finalized on resume");
    assert.ok(finalizedSnapshot.submittedAt !== null, "submittedAt must be set");

    // CRITICAL (LC28-F01): Nickname must remain "Nguyễn An LC28", NOT empty or default!
    assert.equal(
      finalizedSnapshot.candidateName,
      "Nguyễn An LC28",
      "Hydrated saved nickname must be preserved across overdue autosubmit"
    );
  });

  it("rejects answers with unknown question ID or mismatched kind", async () => {
    const storage = new InMemoryStoragePort();
    const deps = { storage, now: () => 1000, id: () => "att-val-errors" };
    const exam = createSampleExam();
    const res = await startAttempt(exam, "Test Validation", deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const controller = res.value;

    // Unknown question ID
    const resUnknown = await controller.answer({
      kind: "I",
      questionVersionId: "q-nonexistent",
      selectedOptionId: "opt-1a",
    });
    assert.equal(resUnknown.ok, false);
    if (!resUnknown.ok) {
      assert.equal(resUnknown.error.code, "QUESTION_NOT_FOUND");
    }

    // Kind mismatch (sending kind III for kind I question)
    const resMismatch = await controller.answer({
      kind: "III",
      questionVersionId: "q1-i",
      raw: "1",
    });
    assert.equal(resMismatch.ok, false);
    if (!resMismatch.ok) {
      assert.equal(resMismatch.error.code, "RESPONSE_KIND_MISMATCH");
    }
  });

  it("autosubmits when answer or rename is attempted past deadline", async () => {
    const storage = new InMemoryStoragePort();
    let clock = 1000;
    const deps = { storage, now: () => clock, id: () => "att-overdue-action" };
    const exam = createSampleExam({ durationMinutes: 1 }); // deadline = 1000 + 60000 = 61000
    const res = await startAttempt(exam, "Overdue Action", deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const controller = res.value;

    // Advance clock past deadline
    clock = 70000;

    // Attempting to answer when overdue should trigger submit('deadline') and return ATTEMPT_FINALIZED
    const ansRes = await controller.answer({
      kind: "I",
      questionVersionId: "q1-i",
      selectedOptionId: "opt-1b",
    });
    assert.equal(ansRes.ok, false);
    if (!ansRes.ok) {
      assert.equal(ansRes.error.code, "ATTEMPT_FINALIZED");
      assert.equal(ansRes.error.path, "deadline");
    }

    // Verify attempt is now finalized
    assert.equal(controller.getSnapshot().phase, "final");

    // Attempting to rename now returns ATTEMPT_FINALIZED
    const renameRes = await controller.rename("New Name Past Deadline");
    assert.equal(renameRes.ok, false);
    if (!renameRes.ok) {
      assert.equal(renameRes.error.code, "ATTEMPT_FINALIZED");
    }
  });

  it("handles storage errors and non-existent attempts gracefully", async () => {
    const storage = new InMemoryStoragePort();
    const deps = { storage, now: () => 1000, id: () => "att-not-found" };

    // Resume non-existent attempt
    const res = await resumeAttempt(
      { examId: "none", examVersionId: "none", attemptId: "none" },
      deps
    );
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, "ATTEMPT_NOT_FOUND");
    }
  });

  it("AC check: pure controller works through ports and does not access global DOM/storage", async () => {
    // Assert that no global DOM or storage objects are required
    const storage = new InMemoryStoragePort();
    let clock = 5000;
    const deps = { storage, now: () => clock, id: () => "att-pure-ports" };
    const exam = createSampleExam();

    const res = await startAttempt(exam, "Pure Ports", deps);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const controller = res.value;
    assert.ok(typeof controller.getSnapshot === "function");
    assert.ok(typeof controller.answer === "function");
    assert.ok(typeof controller.rename === "function");
    assert.ok(typeof controller.submit === "function");
    assert.ok(typeof controller.subscribe === "function");
    assert.ok(typeof controller.dispose === "function");

    // Ensure all state persistence happened via injected storage port
    assert.equal(storage.createCalls, 1);
    await controller.rename("Tên cổng thuần");
    assert.equal(storage.saveDraftCalls, 1);
    await controller.submit("manual");
    assert.equal(storage.finalizeCalls, 1);
  });
});
