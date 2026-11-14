import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDraft,
  publishDraft,
  editDraft,
} from "../../../src/teacher/index.ts";
import {
  createSampleExam,
  createMockStorage,
  createValidQuestionI,
  createValidQuestionII,
  createValidQuestionIII,
} from "./fixtures.ts";

describe("Teacher - publishDraft validation and immutable storage", () => {
  it("empty-invalid: publishing an empty draft fails with EXAM_EMPTY", async () => {
    const storage = createMockStorage();
    const emptyExam = createSampleExam("exam-empty", "v1.0.0", []);
    const draft = createDraft(emptyExam, "draft-empty");

    const pubRes = await publishDraft(draft, "v2.0.0", storage);
    assert.equal(pubRes.ok, false);
    if (!pubRes.ok) {
      assert.equal(pubRes.error.code, "EXAM_EMPTY");
      assert.equal(pubRes.error.path, "questions");
    }
    assert.equal(storage.putLog.length, 0); // Nothing written
  });

  it("incomplete draft with invalid/missing keys is rejected before publication", async () => {
    const storage = createMockStorage();

    // 1. Part I with correctOptionId not in options
    const badPartI = {
      ...createValidQuestionI("q1"),
      correctOptionId: "opt-ghost",
    };
    const draftBadI = createDraft(createSampleExam("e1", "v1", [badPartI]), "d1");
    const pubI = await publishDraft(draftBadI, "v2.0.0", storage);
    assert.equal(pubI.ok, false);
    if (!pubI.ok) {
      assert.equal(pubI.error.code, "I_KEY_NOT_IN_OPTIONS");
    }

    // 2. Part II with statement answer not boolean
    const badPartII = {
      ...createValidQuestionII("q2"),
      statements: [
        { statementId: "s1", text: "t1", answer: true },
        { statementId: "s2", text: "t2", answer: null },
        { statementId: "s3", text: "t3", answer: false },
        { statementId: "s4", text: "t4", answer: true },
      ],
    } as unknown as import("../../../src/teacher/index.ts").WebQuestion;
    const draftBadII = createDraft(createSampleExam("e2", "v1", [badPartII]), "d2");
    const pubII = await publishDraft(draftBadII, "v2.0.0", storage);
    assert.equal(pubII.ok, false);
    if (!pubII.ok) {
      assert.equal(pubII.error.code, "II_ANSWER_NOT_BOOLEAN");
    }

    // 3. Part III with invalid answer key (length > 4)
    const badPartIII = createValidQuestionIII("q3", "12345"); // 5 chars, too long!
    const draftBadIII = createDraft(createSampleExam("e3", "v1", [badPartIII]), "d3");
    const pubIII = await publishDraft(draftBadIII, "v2.0.0", storage);
    assert.equal(pubIII.ok, false);
    if (!pubIII.ok) {
      assert.equal(pubIII.error.code, "III_KEY_INVALID");
    }

    // 4. Part III with illegal characters
    const badCharPartIII = createValidQuestionIII("q4", "abc"); // letters not allowed
    const draftBadChar = createDraft(createSampleExam("e4", "v1", [badCharPartIII]), "d4");
    const pubBadChar = await publishDraft(draftBadChar, "v2.0.0", storage);
    assert.equal(pubBadChar.ok, false);
    if (!pubBadChar.ok) {
      assert.equal(pubBadChar.error.code, "III_KEY_INVALID");
    }
  });

  it("requires explicit settings before publication (no implicit fallback)", async () => {
    const storage = createMockStorage();
    const draft = createDraft(createSampleExam(), "d-settings");

    // Invalid duration (<= 0)
    const editBadDur = editDraft(draft, { settings: { durationMinutes: 0 } });
    assert.ok(editBadDur.ok);
    const pubBadDur = await publishDraft(editBadDur.value, "v2.0.0", storage);
    assert.equal(pubBadDur.ok, false);
    if (!pubBadDur.ok) {
      assert.equal(pubBadDur.error.code, "EXAM_SETTINGS_INVALID");
    }

    // Invalid releasePolicy
    const editBadRel = editDraft(draft, { settings: { releasePolicy: "someday" } } as unknown);
    assert.ok(editBadRel.ok);
    const pubBadRel = await publishDraft(editBadRel.value, "v2.0.0", storage);
    assert.equal(pubBadRel.ok, false);
    if (!pubBadRel.ok) {
      assert.equal(pubBadRel.error.code, "EXAM_SETTINGS_INVALID");
    }

    // Advisory local maxAttempts: accepts null or integer >= 1
    const editValidMaxAtt = editDraft(draft, { settings: { maxAttempts: 3 } });
    assert.ok(editValidMaxAtt.ok);
    const pubValid = await publishDraft(editValidMaxAtt.value, "v2.0.0", storage);
    assert.ok(pubValid.ok);
    assert.equal(pubValid.value.settings.maxAttempts, 3);
  });

  it("requires a new exam version that differs from the draft", async () => {
    const storage = createMockStorage();
    const exam = createSampleExam("exam-ver", "v1.0.0");
    const draft = createDraft(exam, "d-ver");

    // Same versionId as draft rejected
    const pubSame = await publishDraft(draft, "v1.0.0", storage);
    assert.equal(pubSame.ok, false);
    if (!pubSame.ok) {
      assert.equal(pubSame.error.code, "VERSION_INVALID");
    }

    // Empty versionId rejected
    const pubEmpty = await publishDraft(draft, "", storage);
    assert.equal(pubEmpty.ok, false);
    if (!pubEmpty.ok) {
      assert.equal(pubEmpty.error.code, "VERSION_INVALID");
    }
  });

  it("cannot overwrite historical snapshots in storage (AC: snapshot immutability)", async () => {
    // Pre-populate storage with an existing version
    const existingSnapshot = createSampleExam("exam-hist", "v2.0.0");
    const storage = createMockStorage({
      existingObjects: {
        "exams:exam-hist:v2.0.0": existingSnapshot,
      },
    });

    const draft = createDraft(createSampleExam("exam-hist", "v1.0.0"), "d-hist");

    const pubRes = await publishDraft(draft, "v2.0.0", storage);
    assert.equal(pubRes.ok, false);
    if (!pubRes.ok) {
      assert.equal(pubRes.error.code, "EXAM_VERSION_EXISTS");
      assert.ok(pubRes.error.message.includes("cannot overwrite historical snapshots"));
    }
    assert.equal(storage.putLog.length, 0); // No overwrite occurred
  });

  it("handles storage transaction failure gracefully", async () => {
    const storage = createMockStorage({ putFailure: true });
    const draft = createDraft(createSampleExam("exam-fail", "v1.0.0"), "d-fail");

    const pubRes = await publishDraft(draft, "v2.0.0", storage);
    assert.equal(pubRes.ok, false);
    if (!pubRes.ok) {
      assert.equal(pubRes.error.code, "STORAGE_FAILED");
      assert.ok(pubRes.error.message.includes("transaction failure"));
    }
  });

  it("successfully publishes valid draft, returning immutable deep-frozen WebExam", async () => {
    const storage = createMockStorage();
    const baseExam = createSampleExam("exam-success", "v1.0.0");
    const draft = createDraft(baseExam, "d-success");

    const pubRes = await publishDraft(draft, "v2.0.0", storage);
    assert.ok(pubRes.ok);
    assert.equal(pubRes.value.examId, "exam-success");
    assert.equal(pubRes.value.examVersionId, "v2.0.0");
    assert.equal(pubRes.value.schemaVersion, "web-exam-v1");
    assert.ok(Object.isFrozen(pubRes.value));
    assert.ok(Object.isFrozen(pubRes.value.questions));
    assert.ok(Object.isFrozen(pubRes.value.settings));

    // Verify written into storage
    assert.equal(storage.putLog.length, 1);
    assert.equal(storage.putLog[0]?.store, "exams");
    assert.equal(storage.putLog[0]?.id, "exam-success:v2.0.0");

    // Source draft remains intact with original version
    assert.equal(draft.exam.examVersionId, "v1.0.0");
  });
});
