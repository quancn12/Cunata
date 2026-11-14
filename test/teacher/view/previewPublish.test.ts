import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTeacherView, validateDraftForView } from "../../../src/teacher/view.ts";
import {
  createTestExam,
  createTestQuestionI,
  createTestQuestionII,
  createTestQuestionIII,
  MockStoragePort,
} from "./fixtures.ts";

describe("WEB-W2-TEACHER-VIEW: Preview Mode and Explicit Publish Workflow", () => {
  it("validates draft paths and prevents publish when draft is incomplete or invalid", async () => {
    // Incomplete draft: empty title, empty subject, empty questions
    const invalidExam = createTestExam("exam-inv", "v1.0.0", []);
    const controller = createTeacherView({ initialExam: invalidExam });
    controller.updateTitle("");
    controller.updateSubject("");

    const storage = new MockStoragePort();
    controller.setStorage(storage);

    // Validation report
    const report = validateDraftForView(controller.getDraft());
    assert.equal(report.valid, false);
    assert.ok(report.errors["title"]);
    assert.ok(report.errors["subject"]);
    assert.ok(report.errors["questions"]);

    // Attempting to publish must fail and return error
    const pubRes = await controller.publish();
    assert.equal(pubRes.ok, false);
    if (!pubRes.ok) {
      assert.equal(pubRes.error.code, "TITLE_EMPTY");
    }
    assert.equal(storage.objects.size, 0); // Nothing written
  });

  it("validates question-level paths: Part I options count and correctOptionId", async () => {
    const q1 = createTestQuestionI("q1", "non-existent-opt");
    const exam = createTestExam("exam-q1-bad", "v1.0.0", [q1]);
    const controller = createTeacherView({ initialExam: exam });

    const report = validateDraftForView(controller.getDraft());
    assert.equal(report.valid, false);
    assert.ok(report.errors["questions[0].correctOptionId"]);
    assert.match(report.errors["questions[0].correctOptionId"]!, /chưa chọn đáp án đúng/);
  });

  it("validates question-level paths: Part II statements count and boolean answer", async () => {
    const q2 = createTestQuestionII("q2");
    // Tamper with statements: make one not boolean
    (q2 as any).statements[0].answer = "not-a-boolean";
    const exam = createTestExam("exam-q2-bad", "v1.0.0", [q2]);
    const controller = createTeacherView({ initialExam: exam });

    const report = validateDraftForView(controller.getDraft());
    assert.equal(report.valid, false);
    assert.ok(report.errors["questions[0].statements[0].answer"]);
  });

  it("successfully publishes valid draft with explicit newVersionId to storage", async () => {
    const exam = createTestExam("exam-pub-1", "v1.0.0");
    const storage = new MockStoragePort();
    const controller = createTeacherView({
      initialExam: exam,
      storage,
    });

    controller.setPublishVersionId("v1.1.0");

    let publishedExamResult: any = null;
    const unsub = controller.subscribe(() => {
      // Listener called
    });

    const pubRes = await controller.publish();
    unsub();

    assert.equal(pubRes.ok, true);
    if (pubRes.ok) {
      publishedExamResult = pubRes.value;
      assert.equal(publishedExamResult.examId, "exam-pub-1");
      assert.equal(publishedExamResult.examVersionId, "v1.1.0");
      assert.equal(publishedExamResult.schemaVersion, "web-exam-v1");
      assert.equal(publishedExamResult.questions.length, 3);
      assert.ok(Object.isFrozen(publishedExamResult));
    }

    // Verify written to storage under "exams:exam-pub-1:v1.1.0"
    const stored = await storage.getObject("exams", "exam-pub-1:v1.1.0");
    assert.equal(stored.ok, true);
    if (stored.ok) {
      assert.notEqual(stored.value, null);
    }

    // Controller draft must now reflect newly published exam
    assert.equal(controller.getDraft().exam.examVersionId, "v1.1.0");
    assert.equal(controller.getStatusMessage()?.includes("Đã xuất bản thành công"), true);
  });

  it("rejects publish if target versionId is identical to current versionId (must be new version)", async () => {
    const exam = createTestExam("exam-same-ver", "v1.0.0");
    const storage = new MockStoragePort();
    const controller = createTeacherView({
      initialExam: exam,
      storage,
    });

    controller.setPublishVersionId("v1.0.0"); // Same as current draft

    const pubRes = await controller.publish();
    assert.equal(pubRes.ok, false);
    if (!pubRes.ok) {
      assert.equal(pubRes.error.code, "VERSION_CONFLICT");
    }
    assert.equal(storage.objects.size, 0);
  });

  it("prevents overwriting historical snapshots in storage (storage duplicate protection)", async () => {
    const exam = createTestExam("exam-hist", "v1.0.0");
    const storage = new MockStoragePort();

    // Pre-populate storage with an existing version v2.0.0
    await storage.putObject("exams", "exam-hist:v2.0.0", { examId: "exam-hist", examVersionId: "v2.0.0" });

    const controller = createTeacherView({
      initialExam: exam,
      storage,
    });

    // Try to publish targeting the existing version v2.0.0
    controller.setPublishVersionId("v2.0.0");

    const pubRes = await controller.publish();
    assert.equal(pubRes.ok, false);
    if (!pubRes.ok) {
      assert.equal(pubRes.error.code, "EXAM_VERSION_EXISTS");
      assert.match(pubRes.error.message, /cannot overwrite historical snapshots/);
    }
  });

  it("handles storage put failures gracefully without crashing", async () => {
    const exam = createTestExam("exam-fail-storage", "v1.0.0");
    const storage = new MockStoragePort();
    storage.failPut = true; // Simulate storage failure

    const controller = createTeacherView({
      initialExam: exam,
      storage,
    });
    controller.setPublishVersionId("v1.2.0");

    const pubRes = await controller.publish();
    assert.equal(pubRes.ok, false);
    if (!pubRes.ok) {
      assert.equal(pubRes.error.code, "STORAGE_FAILED");
    }
  });
});
