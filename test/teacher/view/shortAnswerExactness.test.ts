import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTeacherView, validateDraftForView } from "../../../src/teacher/view.ts";
import { checkShortAnswer } from "../../../src/domain/index.ts";
import {
  createTestExam,
  createTestQuestionIII,
} from "./fixtures.ts";

describe("WEB-W2-TEACHER-VIEW: Raw III Exactness and Short Answer Validation", () => {
  it("preserves exact distinction between '1,5' and '1,50'", () => {
    const q1 = createTestQuestionIII("q1", "1,5");
    const q2 = createTestQuestionIII("q2", "1,50");
    const exam = createTestExam("exam-raw-1", "v1.0.0", [q1, q2]);
    const controller = createTeacherView({ initialExam: exam });

    const q1Current = controller.getDraft().exam.questions[0] as Extract<(typeof exam.questions)[0], { kind: "III" }>;
    const q2Current = controller.getDraft().exam.questions[1] as Extract<(typeof exam.questions)[0], { kind: "III" }>;

    assert.equal(q1Current.answerKey, "1,5");
    assert.equal(q2Current.answerKey, "1,50");
    assert.notEqual(q1Current.answerKey, q2Current.answerKey);

    // Ensure neither string was coerced to a number (1.5)
    assert.equal(typeof q1Current.answerKey, "string");
    assert.equal(typeof q2Current.answerKey, "string");
    assert.equal(q1Current.answerKey.length, 3);
    assert.equal(q2Current.answerKey.length, 4);
  });

  it("identifies '1.5' (with dot) as illegal bad_char under sa-charset-v1", () => {
    // Under GDPT 2018 Vietnamese exam standard sa-charset-v1, only comma ',' is allowed as decimal mark
    const issues = checkShortAnswer("1.5");
    assert.deepEqual(issues, ["bad_char"]);

    // If teacher inputs '1.5', view validation must report the exact path error
    const q = createTestQuestionIII("q1", "1.5");
    const exam = createTestExam("exam-raw-dot", "v1.0.0", [q]);
    const controller = createTeacherView({ initialExam: exam });

    const isValid = controller.validate();
    assert.equal(isValid, false);
    const errors = controller.getValidationErrors();
    assert.ok(errors["questions[0].answerKey"]);
    assert.match(errors["questions[0].answerKey"]!, /không hợp lệ|0-9/);
  });

  it("strictly accepts negative values with 4 characters like '-0,5'", () => {
    // '-0,5' consists of 4 code points: '-', '0', ',', '5'
    const raw = "-0,5";
    const issues = checkShortAnswer(raw);
    assert.deepEqual(issues, []); // Valid!

    const q = createTestQuestionIII("q1", raw);
    const exam = createTestExam("exam-raw-neg", "v1.0.0", [q]);
    const controller = createTeacherView({ initialExam: exam });

    const report = validateDraftForView(controller.getDraft());
    assert.equal(report.valid, true);
    assert.equal(report.errors["questions[0].answerKey"], undefined);

    const currentQ = controller.getDraft().exam.questions[0] as Extract<(typeof exam.questions)[0], { kind: "III" }>;
    assert.equal(currentQ.answerKey, "-0,5");
  });

  it("rejects keys longer than 4 characters with too_long without silent trimming", () => {
    // If teacher inputs 5 characters e.g. "12,34" or "1,500"
    const raw5 = "12,34";
    const issues = checkShortAnswer(raw5);
    assert.deepEqual(issues, ["too_long"]);

    const q = createTestQuestionIII("q1", raw5);
    const exam = createTestExam("exam-raw-long", "v1.0.0", [q]);
    const controller = createTeacherView({ initialExam: exam });

    const report = validateDraftForView(controller.getDraft());
    assert.equal(report.valid, false);
    assert.ok(report.errors["questions[0].answerKey"]);
    assert.match(report.errors["questions[0].answerKey"]!, /vượt quá độ dài tối đa 4 ký tự/);

    // Key must NOT be silently trimmed in draft
    const currentQ = controller.getDraft().exam.questions[0] as Extract<(typeof exam.questions)[0], { kind: "III" }>;
    assert.equal(currentQ.answerKey, "12,34");
  });

  it("rejects empty answerKey with empty issue", () => {
    const q = createTestQuestionIII("q1", "");
    const exam = createTestExam("exam-raw-empty", "v1.0.0", [q]);
    const controller = createTeacherView({ initialExam: exam });

    const report = validateDraftForView(controller.getDraft());
    assert.equal(report.valid, false);
    assert.ok(report.errors["questions[0].answerKey"]);
    assert.match(report.errors["questions[0].answerKey"]!, /không được để trống/);
  });

  it("rejects alphabetic, whitespace, or math symbol characters", () => {
    const invalidKeys = ["1,5 ", " 1,5", "+1,5", "1/2", "π", "A", "-1234"];
    for (const key of invalidKeys) {
      const q = createTestQuestionIII("q1", key);
      const exam = createTestExam("exam-raw-bad", "v1.0.0", [q]);
      const controller = createTeacherView({ initialExam: exam });

      const report = validateDraftForView(controller.getDraft());
      assert.equal(report.valid, false, `Expected key "${key}" to be rejected`);
      assert.ok(report.errors["questions[0].answerKey"]);
    }
  });

  it("maintains raw exactness during question updates and duplication", () => {
    const q = createTestQuestionIII("q1", "-1,2");
    const exam = createTestExam("exam-raw-dup", "v1.0.0", [q]);
    const controller = createTeacherView({ initialExam: exam });

    // Duplicate question
    const resDup = controller.duplicateQuestion("q1");
    assert.equal(resDup.ok, true);

    const dupQ = controller.getDraft().exam.questions[1] as Extract<(typeof exam.questions)[0], { kind: "III" }>;
    assert.equal(dupQ.answerKey, "-1,2");

    // Update with exact string
    const resUpdate = controller.updateQuestion(dupQ.questionVersionId, {
      answerKey: "0,25",
    });
    assert.equal(resUpdate.ok, true);

    const updatedQ = controller.getDraft().exam.questions[1] as Extract<(typeof exam.questions)[0], { kind: "III" }>;
    assert.equal(updatedQ.answerKey, "0,25");
  });
});
