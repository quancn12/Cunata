import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTeacherView } from "../../../src/teacher/view.ts";
import {
  createTestExam,
  createTestQuestionI,
  createTestQuestionII,
  createTestQuestionIII,
} from "./fixtures.ts";

describe("WEB-W2-TEACHER-VIEW: User Action Transitions", () => {
  it("transitions metadata: title, subject, and grade updates", () => {
    const exam = createTestExam();
    const controller = createTeacherView({ initialExam: exam });

    assert.equal(controller.getDraft().exam.title, "Đề thi thử Toán GDPT 2018");
    assert.equal(controller.getDraft().exam.subject, "Toán");
    assert.equal(controller.getDraft().exam.grade, 12);

    // Update title
    const resTitle = controller.updateTitle("Đề kiểm tra học kỳ 1 môn Toán");
    assert.equal(resTitle.ok, true);
    assert.equal(controller.getDraft().exam.title, "Đề kiểm tra học kỳ 1 môn Toán");
    assert.equal(controller.getDraft().revision, 2);

    // Update subject
    const resSubj = controller.updateSubject("Vật lí");
    assert.equal(resSubj.ok, true);
    assert.equal(controller.getDraft().exam.subject, "Vật lí");
    assert.equal(controller.getDraft().revision, 3);

    // Update grade
    const resGrade = controller.updateGrade(11);
    assert.equal(resGrade.ok, true);
    assert.equal(controller.getDraft().exam.grade, 11);
    assert.equal(controller.getDraft().revision, 4);
  });

  it("transitions explicit settings: duration, maxAttempts, releasePolicy, shuffles", () => {
    const exam = createTestExam();
    const controller = createTeacherView({ initialExam: exam });

    const initialSettings = controller.getDraft().exam.settings;
    assert.equal(initialSettings.durationMinutes, 50);
    assert.equal(initialSettings.maxAttempts, null);
    assert.equal(initialSettings.releasePolicy, "immediate");
    assert.equal(initialSettings.shuffleQuestions, false);
    assert.equal(initialSettings.shuffleOptions, false);

    // Update duration & maxAttempts
    const res1 = controller.updateSettings({
      durationMinutes: 90,
      maxAttempts: 2,
    });
    assert.equal(res1.ok, true);
    assert.equal(controller.getDraft().exam.settings.durationMinutes, 90);
    assert.equal(controller.getDraft().exam.settings.maxAttempts, 2);

    // Update releasePolicy to after_deadline & enable shuffles
    const res2 = controller.updateSettings({
      releasePolicy: "after_deadline",
      shuffleQuestions: true,
      shuffleOptions: true,
    });
    assert.equal(res2.ok, true);
    assert.equal(controller.getDraft().exam.settings.releasePolicy, "after_deadline");
    assert.equal(controller.getDraft().exam.settings.shuffleQuestions, true);
    assert.equal(controller.getDraft().exam.settings.shuffleOptions, true);
  });

  it("transitions independent section toggles", () => {
    const exam = createTestExam("exam-sections", "v1.0.0", [
      createTestQuestionI("q1"),
      createTestQuestionII("q2"),
      createTestQuestionIII("q3"),
    ]);
    const controller = createTeacherView({ initialExam: exam });

    assert.deepEqual(controller.getDraftSections(), ["I", "II", "III"]);

    // Disable Part II
    const resToggleII = controller.toggleSection("II", false);
    assert.equal(resToggleII.ok, true);
    assert.deepEqual(controller.getDraftSections(), ["I", "III"]);
    const questionsAfter = controller.getDraft().exam.questions;
    assert.equal(questionsAfter.length, 2);
    assert.equal(questionsAfter.some((q) => q.kind === "II"), false);

    // Disable Part III
    const resToggleIII = controller.toggleSection("III", false);
    assert.equal(resToggleIII.ok, true);
    assert.deepEqual(controller.getDraftSections(), ["I"]);
    assert.equal(controller.getDraft().exam.questions.length, 1);
  });

  it("transitions question reordering with index safety", () => {
    const q1 = createTestQuestionI("q1");
    const q2 = createTestQuestionII("q2");
    const q3 = createTestQuestionIII("q3");
    const exam = createTestExam("exam-reorder", "v1.0.0", [q1, q2, q3]);
    const controller = createTeacherView({ initialExam: exam });

    // Move q3 from index 2 to index 0
    const resMove = controller.reorderQuestion(2, 0);
    assert.equal(resMove.ok, true);
    const orderAfter = controller.getDraft().exam.questions.map((q) => q.questionVersionId);
    assert.deepEqual(orderAfter, ["q3", "q1", "q2"]);

    // Out of bounds reorder fails gracefully without mutating draft
    const resBad = controller.reorderQuestion(0, 99);
    assert.equal(resBad.ok, false);
    if (!resBad.ok) {
      assert.equal(resBad.error.code, "INDEX_OUT_OF_BOUNDS");
    }
    assert.deepEqual(
      controller.getDraft().exam.questions.map((q) => q.questionVersionId),
      ["q3", "q1", "q2"],
    );
  });

  it("transitions question duplication with key and ID remapping", () => {
    let mockGenCount = 0;
    const mockIdGen = () => `dup-id-${++mockGenCount}`;

    const q1 = createTestQuestionI("q1", "opt-2");
    const exam = createTestExam("exam-dup", "v1.0.0", [q1]);
    const controller = createTeacherView({
      initialExam: exam,
      idGenerator: mockIdGen,
    });

    const resDup = controller.duplicateQuestion("q1");
    assert.equal(resDup.ok, true);
    const qs = controller.getDraft().exam.questions;
    assert.equal(qs.length, 2);

    const original = qs[0] as Extract<(typeof qs)[0], { kind: "I" }>;
    const dup = qs[1] as Extract<(typeof qs)[1], { kind: "I" }>;

    assert.equal(original.questionVersionId, "q1");
    assert.notEqual(dup.questionVersionId, "q1");

    // All option IDs must be new and distinct
    const originalOptIds = original.options.map((o) => o.optionId);
    const dupOptIds = dup.options.map((o) => o.optionId);
    for (const optId of dupOptIds) {
      assert.equal(originalOptIds.includes(optId), false);
    }

    // Correct option mapping must be preserved
    const origCorrectIdx = original.options.findIndex((o) => o.optionId === original.correctOptionId);
    const dupCorrectIdx = dup.options.findIndex((o) => o.optionId === dup.correctOptionId);
    assert.equal(dupCorrectIdx, origCorrectIdx);
    assert.equal(dupCorrectIdx, 1); // opt-2 was index 1
  });

  it("transitions question addition and removal", () => {
    const exam = createTestExam("exam-add-del", "v1.0.0", [createTestQuestionI("q1")]);
    const controller = createTeacherView({ initialExam: exam });

    assert.equal(controller.getDraft().exam.questions.length, 1);

    // Add Part II
    const resAddII = controller.addQuestion("II");
    assert.equal(resAddII.ok, true);
    assert.equal(controller.getDraft().exam.questions.length, 2);
    assert.equal(controller.getDraft().exam.questions[1]!.kind, "II");

    // Add Part III
    const resAddIII = controller.addQuestion("III");
    assert.equal(resAddIII.ok, true);
    assert.equal(controller.getDraft().exam.questions.length, 3);
    assert.equal(controller.getDraft().exam.questions[2]!.kind, "III");

    // Remove q1
    const resDel = controller.removeQuestion("q1");
    assert.equal(resDel.ok, true);
    assert.equal(controller.getDraft().exam.questions.length, 2);
    assert.equal(controller.getDraft().exam.questions.some((q) => q.questionVersionId === "q1"), false);
  });

  it("transitions active question editing for content and taxonomy", () => {
    const q1 = createTestQuestionI("q1");
    const exam = createTestExam("exam-q-edit", "v1.0.0", [q1]);
    const controller = createTeacherView({ initialExam: exam });

    const resEdit = controller.updateQuestion("q1", {
      title: "Tiêu đề mới cho câu 1",
      topic: "Đại số & Giải tích",
      lesson: "Đạo hàm cấp 1",
      difficulty: "Thông hiểu",
      explanation: "Giải thích chi tiết bước làm",
    });
    assert.equal(resEdit.ok, true);

    const updated = controller.getDraft().exam.questions[0]!;
    assert.equal(updated.title, "Tiêu đề mới cho câu 1");
    assert.equal(updated.topic, "Đại số & Giải tích");
    assert.equal(updated.lesson, "Đạo hàm cấp 1");
    assert.equal(updated.difficulty, "Thông hiểu");
    assert.equal(updated.explanation, "Giải thích chi tiết bước làm");
  });

  it("transitions view mode between edit and preview and notifies subscribers", () => {
    const exam = createTestExam();
    const controller = createTeacherView({ initialExam: exam });

    assert.equal(controller.getViewMode(), "edit");

    let notifiedCount = 0;
    const unsub = controller.subscribe(() => {
      notifiedCount++;
    });

    controller.setViewMode("preview");
    assert.equal(controller.getViewMode(), "preview");
    assert.equal(notifiedCount, 1);

    controller.setViewMode("edit");
    assert.equal(controller.getViewMode(), "edit");
    assert.equal(notifiedCount, 2);

    unsub();
    controller.setViewMode("preview");
    assert.equal(notifiedCount, 2); // Unsubscribed
  });
});
