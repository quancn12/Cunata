import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDraft,
  editDraft,
  addQuestionToDraft,
  removeQuestionFromDraft,
  updateQuestionInDraft,
} from "../../../src/teacher/index.ts";
import {
  createSampleExam,
  createValidQuestionI,
  createValidQuestionII,
  createValidQuestionIII,
} from "./fixtures.ts";

describe("Teacher ExamDraft - Core creation and editing", () => {
  it("createDraft initializes draft with draftId, revision 1, and deep-frozen exam", () => {
    const originalExam = createSampleExam("exam-001", "v1");
    const draft = createDraft(originalExam, "draft-001");

    assert.equal(draft.draftId, "draft-001");
    assert.equal(draft.revision, 1);
    assert.equal(draft.exam.examId, "exam-001");
    assert.equal(draft.exam.title, originalExam.title);
    assert.ok(Object.isFrozen(draft));
    assert.ok(Object.isFrozen(draft.exam));
  });

  it("createDraft guarantees source-edit isolation from the original exam", () => {
    const questionsArray = [createValidQuestionI("q1"), createValidQuestionII("q2")];
    const originalExam = createSampleExam("exam-iso", "v1", questionsArray);

    const draft = createDraft(originalExam, "draft-iso");

    // Mutate the original questions array
    questionsArray.push(createValidQuestionIII("q3"));

    // Draft questions should not be affected
    assert.equal(draft.exam.questions.length, 2);
    assert.equal(draft.exam.questions[0]?.questionVersionId, "q1");
    assert.equal(draft.exam.questions[1]?.questionVersionId, "q2");

    // Mutating frozen draft exam throws
    assert.throws(() => {
      // @ts-expect-error mutating readonly property
      draft.exam.title = "Hacked Title";
    }, TypeError);
  });

  it("editDraft allows editing incomplete drafts (empty questions, missing keys)", () => {
    const emptyExam = createSampleExam("exam-incomplete", "v1", []);
    const draft = createDraft(emptyExam, "draft-inc");

    // Incomplete draft with 0 questions can be edited
    const edit1 = editDraft(draft, { title: "Tiêu đề mới đang soạn" });
    assert.ok(edit1.ok);
    assert.equal(edit1.value.revision, 2);
    assert.equal(edit1.value.exam.title, "Tiêu đề mới đang soạn");
    assert.equal(edit1.value.exam.questions.length, 0);

    // Incomplete draft: add an unfinished question (without answer key)
    const incompleteQ = {
      kind: "III" as const,
      questionVersionId: "q-wip",
      content: "Đang soạn nội dung, chưa có đáp án",
      answerKey: "", // empty answer key, incomplete!
    };

    const edit2 = editDraft(edit1.value, {
      action: "add_question",
      question: incompleteQ,
    });
    assert.ok(edit2.ok);
    assert.equal(edit2.value.revision, 3);
    assert.equal(edit2.value.exam.questions.length, 1);
    assert.equal(edit2.value.exam.questions[0]?.questionVersionId, "q-wip");

    // Original draft and previous revisions remain completely unchanged (isolation)
    assert.equal(draft.revision, 1);
    assert.equal(draft.exam.questions.length, 0);
    assert.equal(edit1.value.revision, 2);
    assert.equal(edit1.value.exam.questions.length, 0);
  });

  it("editDraft supports structured actions (set_title, set_subject, set_grade, set_settings)", () => {
    const draft = createDraft(createSampleExam(), "draft-actions");

    const resTitle = editDraft(draft, { action: "set_title", title: "Khảo sát đầu năm" });
    assert.ok(resTitle.ok);
    assert.equal(resTitle.value.exam.title, "Khảo sát đầu năm");
    assert.equal(resTitle.value.revision, 2);

    const resSubject = editDraft(resTitle.value, { action: "set_subject", subject: "Vật lí" });
    assert.ok(resSubject.ok);
    assert.equal(resSubject.value.exam.subject, "Vật lí");

    const resGrade = editDraft(resSubject.value, { action: "set_grade", grade: 11 });
    assert.ok(resGrade.ok);
    assert.equal(resGrade.value.exam.grade, 11);

    const resSettings = editDraft(resGrade.value, {
      action: "set_settings",
      settings: { durationMinutes: 90, shuffleQuestions: true },
    });
    assert.ok(resSettings.ok);
    assert.equal(resSettings.value.exam.settings.durationMinutes, 90);
    assert.equal(resSettings.value.exam.settings.shuffleQuestions, true);
    assert.equal(resSettings.value.exam.settings.shuffleOptions, false); // preserved
  });

  it("editDraft rejects invalid grade or malformed actions", () => {
    const draft = createDraft(createSampleExam(), "draft-err");

    // Invalid grade
    const resBadGrade = editDraft(draft, { action: "set_grade", grade: 9 } as unknown);
    assert.equal(resBadGrade.ok, false);
    if (!resBadGrade.ok) {
      assert.equal(resBadGrade.error.code, "DRAFT_EDIT_INVALID");
    }

    // Non-object patch
    const resBadPatch = editDraft(draft, "not an object");
    assert.equal(resBadPatch.ok, false);
    if (!resBadPatch.ok) {
      assert.equal(resBadPatch.error.code, "DRAFT_EDIT_INVALID");
    }

    // Unknown action
    const resUnknownAction = editDraft(draft, { action: "fly_to_moon" } as unknown);
    assert.equal(resUnknownAction.ok, false);
    if (!resUnknownAction.ok) {
      assert.equal(resUnknownAction.error.code, "DRAFT_EDIT_INVALID");
    }
  });

  it("addQuestionToDraft, removeQuestionFromDraft, and updateQuestionInDraft work as expected", () => {
    const initialExam = createSampleExam("exam-q", "v1", [createValidQuestionI("q1")]);
    const draft = createDraft(initialExam, "d-q");

    // Add question
    const q2 = createValidQuestionII("q2");
    const added = addQuestionToDraft(draft, q2);
    assert.ok(added.ok);
    assert.equal(added.value.exam.questions.length, 2);
    assert.equal(added.value.revision, 2);

    // Update question
    const updated = updateQuestionInDraft(added.value, "q1", { content: "Nội dung mới câu 1" });
    assert.ok(updated.ok);
    assert.equal(updated.value.exam.questions[0]?.content, "Nội dung mới câu 1");
    assert.equal(updated.value.revision, 3);

    // Remove question
    const removed = removeQuestionFromDraft(updated.value, "q1");
    assert.ok(removed.ok);
    assert.equal(removed.value.exam.questions.length, 1);
    assert.equal(removed.value.exam.questions[0]?.questionVersionId, "q2");
    assert.equal(removed.value.revision, 4);

    // Removing non-existent question returns error
    const removeNonExistent = removeQuestionFromDraft(removed.value, "q-ghost");
    assert.equal(removeNonExistent.ok, false);
    if (!removeNonExistent.ok) {
      assert.equal(removeNonExistent.error.code, "QUESTION_NOT_FOUND");
    }

    // Updating non-existent question returns error
    const updateNonExistent = updateQuestionInDraft(removed.value, "q-ghost", { content: "abc" });
    assert.equal(updateNonExistent.ok, false);
    if (!updateNonExistent.ok) {
      assert.equal(updateNonExistent.error.code, "QUESTION_NOT_FOUND");
    }
  });
});
