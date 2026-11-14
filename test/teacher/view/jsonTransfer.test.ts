import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTeacherView } from "../../../src/teacher/view.ts";
import { parseExam } from "../../../src/schema/index.ts";
import {
  createTestExam,
  createTestQuestionI,
  createTestQuestionII,
  createTestQuestionIII,
} from "./fixtures.ts";

describe("WEB-W2-TEACHER-VIEW: JSON Import/Export through Schema & Copy Isolation", () => {
  it("exports draft to valid canonical JSON string through exportExam", () => {
    const exam = createTestExam();
    const controller = createTeacherView({ initialExam: exam });

    let exportedJson: string | null = null;
    const expRes = controller.exportJson();
    assert.equal(expRes.ok, true);
    if (expRes.ok) {
      exportedJson = expRes.value;
      assert.equal(typeof exportedJson, "string");
      assert.ok(exportedJson.includes('"schemaVersion": "web-exam-v1"'));
      assert.ok(exportedJson.includes('"ruleSetId": "custom-v1"'));
      assert.ok(exportedJson.includes('"title": "Đề thi thử Toán GDPT 2018"'));
    }

    // Verify the exported JSON strictly parses back through schema parseExam
    assert.notEqual(exportedJson, null);
    const parsed = parseExam(JSON.parse(exportedJson!));
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.examId, exam.examId);
      assert.equal(parsed.value.questions.length, 3);
    }
  });

  it("imports valid exam JSON and creates fresh draft without mutating active exam", () => {
    const activeExam = createTestExam("active-exam-id", "v1.0.0");
    const controller = createTeacherView({ initialExam: activeExam });

    const newExamJson = JSON.stringify({
      schemaVersion: "web-exam-v1",
      examId: "imported-exam-id",
      examVersionId: "v2.0.0",
      ruleSetId: "custom-v1",
      inputPolicyId: "sa-charset-v1",
      title: "Đề thi đã nhập từ file JSON",
      subject: "Hóa học",
      grade: 11,
      settings: {
        durationMinutes: 45,
        maxAttempts: 1,
        releasePolicy: "immediate",
        shuffleQuestions: true,
        shuffleOptions: true,
      },
      questions: [
        {
          kind: "I",
          questionVersionId: "imp-q1",
          content: "Nội dung câu nhập",
          options: [
            { optionId: "o1", text: "A", label: "A" },
            { optionId: "o2", text: "B", label: "B" },
            { optionId: "o3", text: "C", label: "C" },
            { optionId: "o4", text: "D", label: "D" },
          ],
          correctOptionId: "o1",
        },
      ],
      assets: [],
    });

    const impRes = controller.importJson(newExamJson);
    assert.equal(impRes.ok, true);

    // Current draft is now the imported exam
    const currentDraft = controller.getDraft();
    assert.equal(currentDraft.exam.examId, "imported-exam-id");
    assert.equal(currentDraft.exam.title, "Đề thi đã nhập từ file JSON");
    assert.equal(currentDraft.exam.subject, "Hóa học");
    assert.equal(currentDraft.exam.grade, 11);
    assert.equal(currentDraft.exam.settings.durationMinutes, 45);
    assert.equal(currentDraft.exam.questions.length, 1);

    // Active exam passed initially must NOT have been mutated
    assert.equal(activeExam.examId, "active-exam-id");
    assert.equal(activeExam.title, "Đề thi thử Toán GDPT 2018");
    assert.equal(activeExam.subject, "Toán");
    assert.equal(activeExam.questions.length, 3);
  });

  it("rejects malformed syntax JSON and retains current draft intact", () => {
    const exam = createTestExam("stay-intact", "v1.0.0");
    const controller = createTeacherView({ initialExam: exam });

    const brokenJson = "{ this is not valid json }";
    const impRes = controller.importJson(brokenJson);
    assert.equal(impRes.ok, false);
    if (!impRes.ok) {
      assert.equal(impRes.error.code, "JSON_PARSE_ERROR");
    }

    // Draft remains unchanged
    assert.equal(controller.getDraft().exam.examId, "stay-intact");
  });

  it("rejects schema-invalid exam JSON and retains current draft intact", () => {
    const exam = createTestExam("stay-intact-2", "v1.0.0");
    const controller = createTeacherView({ initialExam: exam });

    // Missing schemaVersion and required fields
    const invalidSchemaJson = JSON.stringify({
      title: "Chỉ có mỗi tiêu đề",
    });

    const impRes = controller.importJson(invalidSchemaJson);
    assert.equal(impRes.ok, false);

    // Draft remains unchanged
    assert.equal(controller.getDraft().exam.examId, "stay-intact-2");
  });

  it("guarantees deep copy isolation during draft edits so that source exam remains immutable", () => {
    const originalExam = createTestExam("immutability-check", "v1.0.0", [
      createTestQuestionI("q1"),
      createTestQuestionII("q2"),
      createTestQuestionIII("q3"),
    ]);

    const controller = createTeacherView({ initialExam: originalExam });

    // Mutate draft in controller
    controller.updateTitle("Tiêu đề đã sửa");
    controller.updateSubject("Vật lí");
    controller.updateGrade(10);
    controller.updateSettings({ durationMinutes: 120 });
    controller.removeQuestion("q1");

    // Original exam object properties must remain completely untouched
    assert.equal(originalExam.title, "Đề thi thử Toán GDPT 2018");
    assert.equal(originalExam.subject, "Toán");
    assert.equal(originalExam.grade, 12);
    assert.equal(originalExam.settings.durationMinutes, 50);
    assert.equal(originalExam.questions.length, 3);
  });
});
