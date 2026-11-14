import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createDraft,
  toggleSection,
  getDraftSections,
  computeDraftMax,
} from "../../../src/teacher/index.ts";
import {
  rational,
  toFractionString,
  equals,
} from "../../../src/domain/index.ts";
import {
  createSampleExam,
  createValidQuestionI,
  createValidQuestionII,
  createValidQuestionIII,
} from "./fixtures.ts";

describe("Teacher - Independent section toggles and domain computeExamMax", () => {
  it("toggleSection removes questions of toggled-off section independently", () => {
    const q1 = createValidQuestionI("q1");
    const q2 = createValidQuestionII("q2");
    const q3 = createValidQuestionIII("q3");

    const draft = createDraft(createSampleExam("exam-tog", "v1", [q1, q2, q3]), "draft-tog");
    assert.deepEqual(getDraftSections(draft), ["I", "II", "III"]);

    // Toggle Section I off -> questions with kind 'I' removed
    const toggleI = toggleSection(draft, "I", false);
    assert.ok(toggleI.ok);
    assert.deepEqual(getDraftSections(toggleI.value), ["II", "III"]);
    assert.equal(toggleI.value.exam.questions.length, 2);
    assert.equal(toggleI.value.exam.questions[0]?.kind, "II");
    assert.equal(toggleI.value.exam.questions[1]?.kind, "III");

    // Toggle Section II off -> only Section III remains
    const toggleII = toggleSection(toggleI.value, "II", false);
    assert.ok(toggleII.ok);
    assert.deepEqual(getDraftSections(toggleII.value), ["III"]);
    assert.equal(toggleII.value.exam.questions.length, 1);
    assert.equal(toggleII.value.exam.questions[0]?.kind, "III");

    // Toggle Section III off -> empty questions
    const toggleIII = toggleSection(toggleII.value, "III", false);
    assert.ok(toggleIII.ok);
    assert.deepEqual(getDraftSections(toggleIII.value), []);
    assert.equal(toggleIII.value.exam.questions.length, 0);

    // Original draft untouched (isolation)
    assert.deepEqual(getDraftSections(draft), ["I", "II", "III"]);
    assert.equal(draft.exam.questions.length, 3);
  });

  it("only-I test: 20 Part I questions -> max 5 (independently derived)", () => {
    // Expected derivation:
    // N1 = 20, N2 = 0, N3 = 0
    // MAX_I = 20 * 0.25 = 5.0
    // MAX_TOTAL = 5.0
    const questionsI = Array.from({ length: 20 }, (_, i) => createValidQuestionI(`q-i-${i + 1}`));
    const draft = createDraft(createSampleExam("exam-only-1", "v1", questionsI), "draft-only-1");

    assert.deepEqual(getDraftSections(draft), ["I"]);

    const maxRes = computeDraftMax(draft);
    assert.ok(equals(maxRes.maxI, rational(5)));
    assert.ok(equals(maxRes.maxII, rational(0)));
    assert.ok(equals(maxRes.maxIII, rational(0)));
    assert.ok(equals(maxRes.maxTotal, rational(5)));
    assert.equal(toFractionString(maxRes.maxTotal), "5");
  });

  it("only-II test: 4 Part II questions -> max 4 (independently derived)", () => {
    // Expected derivation:
    // N1 = 0, N2 = 4, N3 = 0
    // MAX_II = 4 * 1.0 = 4.0
    // MAX_TOTAL = 4.0
    const questionsII = Array.from({ length: 4 }, (_, i) => createValidQuestionII(`q-ii-${i + 1}`));
    const draft = createDraft(createSampleExam("exam-only-2", "v1", questionsII), "draft-only-2");

    assert.deepEqual(getDraftSections(draft), ["II"]);

    const maxRes = computeDraftMax(draft);
    assert.ok(equals(maxRes.maxI, rational(0)));
    assert.ok(equals(maxRes.maxII, rational(4)));
    assert.ok(equals(maxRes.maxIII, rational(0)));
    assert.ok(equals(maxRes.maxTotal, rational(4)));
    assert.equal(toFractionString(maxRes.maxTotal), "4");
  });

  it("only-III test: 3 Part III questions -> each 10/3, max 10 (independently derived)", () => {
    // Expected derivation:
    // N1 = 0, N2 = 0, N3 = 3
    // BASE = 0 < 10 -> POINT_III = (10 - 0)/3 = 10/3
    // MAX_III = 3 * (10/3) = 10
    // MAX_TOTAL = 10
    const questionsIII = Array.from({ length: 3 }, (_, i) => createValidQuestionIII(`q-iii-${i + 1}`));
    const draft = createDraft(createSampleExam("exam-only-3", "v1", questionsIII), "draft-only-3");

    assert.deepEqual(getDraftSections(draft), ["III"]);

    const maxRes = computeDraftMax(draft);
    assert.ok(equals(maxRes.maxI, rational(0)));
    assert.ok(equals(maxRes.maxII, rational(0)));
    assert.ok(equals(maxRes.pointIII, rational(10, 3)));
    assert.ok(equals(maxRes.maxIII, rational(10)));
    assert.ok(equals(maxRes.maxTotal, rational(10)));
    assert.equal(toFractionString(maxRes.pointIII), "10/3");
    assert.equal(toFractionString(maxRes.maxTotal), "10");
  });

  it("max15 test: 20 Part I + 10 Part II + 0 Part III -> max 15 (independently derived)", () => {
    // Expected derivation:
    // N1 = 20, N2 = 10, N3 = 0
    // MAX_I = 20 * 0.25 = 5
    // MAX_II = 10 * 1 = 10
    // MAX_III = 0
    // MAX_TOTAL = 5 + 10 = 15
    const qI = Array.from({ length: 20 }, (_, i) => createValidQuestionI(`q-i-${i + 1}`));
    const qII = Array.from({ length: 10 }, (_, i) => createValidQuestionII(`q-ii-${i + 1}`));
    const draft = createDraft(createSampleExam("exam-max15", "v1", [...qI, ...qII]), "draft-max15");

    assert.deepEqual(getDraftSections(draft), ["I", "II"]);

    const maxRes = computeDraftMax(draft);
    assert.ok(equals(maxRes.maxI, rational(5)));
    assert.ok(equals(maxRes.maxII, rational(10)));
    assert.ok(equals(maxRes.maxIII, rational(0)));
    assert.ok(equals(maxRes.maxTotal, rational(15)));
    assert.equal(toFractionString(maxRes.maxTotal), "15");
  });

  it("max16 test: 20 Part I + 10 Part II + 4 Part III -> max 16 (independently derived)", () => {
    // Expected derivation:
    // N1 = 20, N2 = 10, N3 = 4
    // MAX_I = 20 * 0.25 = 5
    // MAX_II = 10 * 1 = 10
    // BASE = 5 + 10 = 15 >= 10 -> POINT_III = 0.25 = 1/4
    // MAX_III = 4 * 1/4 = 1
    // MAX_TOTAL = 5 + 10 + 1 = 16
    const qI = Array.from({ length: 20 }, (_, i) => createValidQuestionI(`q-i-${i + 1}`));
    const qII = Array.from({ length: 10 }, (_, i) => createValidQuestionII(`q-ii-${i + 1}`));
    const qIII = Array.from({ length: 4 }, (_, i) => createValidQuestionIII(`q-iii-${i + 1}`));
    const draft = createDraft(createSampleExam("exam-max16", "v1", [...qI, ...qII, ...qIII]), "draft-max16");

    assert.deepEqual(getDraftSections(draft), ["I", "II", "III"]);

    const maxRes = computeDraftMax(draft);
    assert.ok(equals(maxRes.maxI, rational(5)));
    assert.ok(equals(maxRes.maxII, rational(10)));
    assert.ok(equals(maxRes.pointIII, rational(1, 4)));
    assert.ok(equals(maxRes.maxIII, rational(1)));
    assert.ok(equals(maxRes.maxTotal, rational(16)));
    assert.equal(toFractionString(maxRes.pointIII), "1/4");
    assert.equal(toFractionString(maxRes.maxTotal), "16");
  });

  it("empty draft: computeDraftMax returns zeros without throwing", () => {
    const draft = createDraft(createSampleExam("exam-empty", "v1", []), "draft-empty");
    assert.deepEqual(getDraftSections(draft), []);

    const maxRes = computeDraftMax(draft);
    assert.ok(equals(maxRes.maxI, rational(0)));
    assert.ok(equals(maxRes.maxII, rational(0)));
    assert.ok(equals(maxRes.pointIII, rational(0)));
    assert.ok(equals(maxRes.maxIII, rational(0)));
    assert.ok(equals(maxRes.maxTotal, rational(0)));
  });
});
