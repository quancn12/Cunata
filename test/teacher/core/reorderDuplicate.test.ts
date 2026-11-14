import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDraft,
  reorderQuestions,
  reorderQuestionsById,
  duplicateQuestion,
} from "../../../src/teacher/index.ts";
import {
  createSampleExam,
  createValidQuestionI,
  createValidQuestionII,
  createValidQuestionIII,
} from "./fixtures.ts";

describe("Teacher - Reorder and Duplicate with ID/Key remapping", () => {
  it("reorderQuestions moves question from fromIndex to toIndex and increments revision", () => {
    const q1 = createValidQuestionI("q1");
    const q2 = createValidQuestionII("q2");
    const q3 = createValidQuestionIII("q3");

    const draft = createDraft(createSampleExam("exam-ord", "v1", [q1, q2, q3]), "draft-ord");
    assert.equal(draft.exam.questions[0]?.questionVersionId, "q1");
    assert.equal(draft.exam.questions[1]?.questionVersionId, "q2");
    assert.equal(draft.exam.questions[2]?.questionVersionId, "q3");

    // Move q1 (index 0) to end (index 2)
    const reordered = reorderQuestions(draft, 0, 2);
    assert.ok(reordered.ok);
    assert.equal(reordered.value.revision, 2);
    assert.equal(reordered.value.exam.questions[0]?.questionVersionId, "q2");
    assert.equal(reordered.value.exam.questions[1]?.questionVersionId, "q3");
    assert.equal(reordered.value.exam.questions[2]?.questionVersionId, "q1");

    // Original draft unchanged (isolation)
    assert.equal(draft.exam.questions[0]?.questionVersionId, "q1");
  });

  it("reorderQuestions rejects invalid out-of-bounds indices", () => {
    const draft = createDraft(createSampleExam(), "draft-bounds");

    const res1 = reorderQuestions(draft, -1, 1);
    assert.equal(res1.ok, false);
    if (!res1.ok) assert.equal(res1.error.code, "INDEX_OUT_OF_BOUNDS");

    const res2 = reorderQuestions(draft, 0, 99);
    assert.equal(res2.ok, false);
    if (!res2.ok) assert.equal(res2.error.code, "INDEX_OUT_OF_BOUNDS");
  });

  it("reorderQuestionsById reorders questions according to the given ID order", () => {
    const q1 = createValidQuestionI("q1");
    const q2 = createValidQuestionII("q2");
    const q3 = createValidQuestionIII("q3");

    const draft = createDraft(createSampleExam("exam-ord-id", "v1", [q1, q2, q3]), "draft-ord-id");

    const reordered = reorderQuestionsById(draft, ["q3", "q1", "q2"]);
    assert.ok(reordered.ok);
    assert.equal(reordered.value.exam.questions[0]?.questionVersionId, "q3");
    assert.equal(reordered.value.exam.questions[1]?.questionVersionId, "q1");
    assert.equal(reordered.value.exam.questions[2]?.questionVersionId, "q2");

    // Mismatched length rejected
    const badLen = reorderQuestionsById(draft, ["q3", "q1"]);
    assert.equal(badLen.ok, false);

    // Unknown ID rejected
    const badId = reorderQuestionsById(draft, ["q1", "q2", "q-ghost"]);
    assert.equal(badId.ok, false);
  });

  it("duplicateQuestion for Part I remaps all optionIds AND correctOptionId consistently", () => {
    // Original question has options opt-1, opt-2, opt-3, opt-4; correctOptionId is opt-3
    const q1 = createValidQuestionI("q1", "opt-3");
    const draft = createDraft(createSampleExam("exam-dup-1", "v1", [q1]), "draft-dup-1");

    let counter = 0;
    const customGen = () => `id-${++counter}`;

    const dupRes = duplicateQuestion(draft, "q1", customGen);
    assert.ok(dupRes.ok);
    assert.equal(dupRes.value.revision, 2);
    assert.equal(dupRes.value.exam.questions.length, 2);

    const originalQ = dupRes.value.exam.questions[0]!;
    const duplicatedQ = dupRes.value.exam.questions[1]!;

    assert.equal(originalQ.questionVersionId, "q1");
    assert.equal(duplicatedQ.questionVersionId, "id-1"); // new versionId

    assert.equal(originalQ.kind, "I");
    assert.equal(duplicatedQ.kind, "I");

    if (originalQ.kind === "I" && duplicatedQ.kind === "I") {
      assert.equal(originalQ.correctOptionId, "opt-3");

      // Verify all duplicated option IDs are new and unique
      const origOptIds = originalQ.options.map((o) => o.optionId);
      const dupOptIds = duplicatedQ.options.map((o) => o.optionId);

      assert.deepEqual(origOptIds, ["opt-1", "opt-2", "opt-3", "opt-4"]);
      assert.deepEqual(dupOptIds, ["id-2", "id-3", "id-4", "id-5"]);

      // Verify no intersection between original and duplicated option IDs
      for (const id of dupOptIds) {
        assert.ok(!origOptIds.includes(id), `Duplicated optionId "${id}" must not collide with original`);
      }

      // CRITICAL INVARIANT: correctOptionId must be remapped to the newly generated ID
      // of the option that was correct in the original (index 2: opt-3 -> id-4)
      assert.equal(duplicatedQ.correctOptionId, "id-4");
      assert.equal(dupOptIds[2], duplicatedQ.correctOptionId);
      assert.ok(dupOptIds.includes(duplicatedQ.correctOptionId));
    }
  });

  it("duplicateQuestion for Part II remaps statementIds while preserving boolean answers", () => {
    const q2 = createValidQuestionII("q2");
    const draft = createDraft(createSampleExam("exam-dup-2", "v1", [q2]), "draft-dup-2");

    let counter = 0;
    const customGen = () => `stmt-gen-${++counter}`;

    const dupRes = duplicateQuestion(draft, "q2", customGen);
    assert.ok(dupRes.ok);
    assert.equal(dupRes.value.exam.questions.length, 2);

    const origQ = dupRes.value.exam.questions[0]!;
    const dupQ = dupRes.value.exam.questions[1]!;

    assert.equal(origQ.kind, "II");
    assert.equal(dupQ.kind, "II");

    if (origQ.kind === "II" && dupQ.kind === "II") {
      assert.equal(origQ.questionVersionId, "q2");
      assert.equal(dupQ.questionVersionId, "stmt-gen-1");

      const origStmtIds = origQ.statements.map((s) => s.statementId);
      const dupStmtIds = dupQ.statements.map((s) => s.statementId);

      assert.deepEqual(origStmtIds, ["stmt-1", "stmt-2", "stmt-3", "stmt-4"]);
      assert.deepEqual(dupStmtIds, ["stmt-gen-2", "stmt-gen-3", "stmt-gen-4", "stmt-gen-5"]);

      // Preserves statement answers exactly
      assert.deepEqual(
        dupQ.statements.map((s) => s.answer),
        origQ.statements.map((s) => s.answer),
      );
      assert.deepEqual(
        dupQ.statements.map((s) => s.text),
        origQ.statements.map((s) => s.text),
      );
    }
  });

  it("duplicateQuestion for Part III remaps versionId and preserves answerKey", () => {
    const q3 = createValidQuestionIII("q3", "-0,5");
    const draft = createDraft(createSampleExam("exam-dup-3", "v1", [q3]), "draft-dup-3");

    const dupRes = duplicateQuestion(draft, "q3");
    assert.ok(dupRes.ok);
    assert.equal(dupRes.value.exam.questions.length, 2);

    const origQ = dupRes.value.exam.questions[0]!;
    const dupQ = dupRes.value.exam.questions[1]!;

    assert.equal(origQ.kind, "III");
    assert.equal(dupQ.kind, "III");

    if (origQ.kind === "III" && dupQ.kind === "III") {
      assert.notEqual(origQ.questionVersionId, dupQ.questionVersionId);
      assert.equal(origQ.answerKey, "-0,5");
      assert.equal(dupQ.answerKey, "-0,5");
    }
  });

  it("duplicateQuestion rejects non-existent questionVersionId", () => {
    const draft = createDraft(createSampleExam(), "draft-err-dup");
    const dupRes = duplicateQuestion(draft, "ghost-id");
    assert.equal(dupRes.ok, false);
    if (!dupRes.ok) {
      assert.equal(dupRes.error.code, "QUESTION_NOT_FOUND");
    }
  });
});
