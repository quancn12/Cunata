import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createTeacherView } from "../../../src/teacher/view.ts";
import { rational, toFractionString, equals } from "../../../src/domain/index.ts";
import {
  createTestExam,
  createTestQuestionI,
  createTestQuestionII,
  createTestQuestionIII,
} from "./fixtures.ts";

describe("WEB-W2-TEACHER-VIEW: Domain Maximum Calculation and Version Changes", () => {
  it("calculates MAX_TOTAL = 15 for N1=20, N2=10, N3=0", () => {
    // MAX_I = 20 * 0.25 = 5
    // MAX_II = 10 * 1 = 10
    // MAX_III = 0
    // MAX_TOTAL = 15
    const questions: any[] = [];
    for (let i = 0; i < 20; i++) questions.push(createTestQuestionI(`q-I-${i}`));
    for (let i = 0; i < 10; i++) questions.push(createTestQuestionII(`q-II-${i}`));

    const exam = createTestExam("exam-max-15", "v1.0.0", questions);
    const controller = createTeacherView({ initialExam: exam });

    const max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxI), "5");
    assert.equal(toFractionString(max.maxII), "10");
    assert.equal(toFractionString(max.maxIII), "0");
    assert.equal(toFractionString(max.maxTotal), "15");
    assert.ok(equals(max.maxTotal, rational(15)));
  });

  it("calculates MAX_TOTAL = 16 for N1=20, N2=10, N3=4 (BASE >= 10)", () => {
    // MAX_I = 20 * 0.25 = 5
    // MAX_II = 10 * 1 = 10
    // BASE = 15 >= 10 -> POINT_III = 0.25
    // MAX_III = 4 * 0.25 = 1
    // MAX_TOTAL = 16
    const questions: any[] = [];
    for (let i = 0; i < 20; i++) questions.push(createTestQuestionI(`q-I-${i}`));
    for (let i = 0; i < 10; i++) questions.push(createTestQuestionII(`q-II-${i}`));
    for (let i = 0; i < 4; i++) questions.push(createTestQuestionIII(`q-III-${i}`));

    const exam = createTestExam("exam-max-16", "v1.0.0", questions);
    const controller = createTeacherView({ initialExam: exam });

    const max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxI), "5");
    assert.equal(toFractionString(max.maxII), "10");
    assert.equal(toFractionString(max.pointIII), "1/4"); // 0.25
    assert.equal(toFractionString(max.maxIII), "1");
    assert.equal(toFractionString(max.maxTotal), "16");
    assert.ok(equals(max.maxTotal, rational(16)));
  });

  it("calculates MAX_TOTAL = 5 for N1=20, N2=0, N3=0 (Part I only)", () => {
    const questions: any[] = [];
    for (let i = 0; i < 20; i++) questions.push(createTestQuestionI(`q-I-${i}`));

    const exam = createTestExam("exam-max-5", "v1.0.0", questions);
    const controller = createTeacherView({ initialExam: exam });

    const max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxI), "5");
    assert.equal(toFractionString(max.maxII), "0");
    assert.equal(toFractionString(max.maxIII), "0");
    assert.equal(toFractionString(max.maxTotal), "5");
  });

  it("calculates exact fractional repeating POINT_III = 10/3 for N1=0, N2=0, N3=3", () => {
    // BASE = 0 < 10
    // POINT_III = (10 - 0) / 3 = 10/3
    // MAX_III = 3 * (10/3) = 10
    // MAX_TOTAL = 10
    const questions: any[] = [];
    for (let i = 0; i < 3; i++) questions.push(createTestQuestionIII(`q-III-${i}`));

    const exam = createTestExam("exam-max-10-repeating", "v1.0.0", questions);
    const controller = createTeacherView({ initialExam: exam });

    const max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxI), "0");
    assert.equal(toFractionString(max.maxII), "0");
    assert.equal(toFractionString(max.pointIII), "10/3");
    assert.equal(toFractionString(max.maxIII), "10");
    assert.equal(toFractionString(max.maxTotal), "10");
  });

  it("calculates MAX_TOTAL = 10, POINT_III = 0.5 for N1=12, N2=4, N3=6", () => {
    // MAX_I = 12 * 0.25 = 3
    // MAX_II = 4 * 1 = 4
    // BASE = 7 < 10
    // POINT_III = (10 - 7) / 6 = 3/6 = 1/2 = 0.5
    // MAX_III = 6 * (1/2) = 3
    // MAX_TOTAL = 3 + 4 + 3 = 10
    const questions: any[] = [];
    for (let i = 0; i < 12; i++) questions.push(createTestQuestionI(`q-I-${i}`));
    for (let i = 0; i < 4; i++) questions.push(createTestQuestionII(`q-II-${i}`));
    for (let i = 0; i < 6; i++) questions.push(createTestQuestionIII(`q-III-${i}`));

    const exam = createTestExam("exam-max-10-standard", "v1.0.0", questions);
    const controller = createTeacherView({ initialExam: exam });

    const max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxI), "3");
    assert.equal(toFractionString(max.maxII), "4");
    assert.equal(toFractionString(max.pointIII), "1/2");
    assert.equal(toFractionString(max.maxIII), "3");
    assert.equal(toFractionString(max.maxTotal), "10");
  });

  it("handles empty exam with zero questions returning zeros without error", () => {
    const exam = createTestExam("exam-empty", "v1.0.0", []);
    const controller = createTeacherView({ initialExam: exam });

    const max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxI), "0");
    assert.equal(toFractionString(max.maxII), "0");
    assert.equal(toFractionString(max.pointIII), "0");
    assert.equal(toFractionString(max.maxIII), "0");
    assert.equal(toFractionString(max.maxTotal), "0");
  });

  it("immediately updates maximum calculations when questions are added, removed, or duplicated", () => {
    const exam = createTestExam("exam-dynamic-max", "v1.0.0", [
      createTestQuestionI("q1"), // MAX_I = 0.25
    ]);
    const controller = createTeacherView({ initialExam: exam });

    let max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxTotal), "1/4");

    // Add Part II -> N1=1, N2=1, N3=0 -> MAX_I=0.25, MAX_II=1 -> MAX_TOTAL = 1.25 = 5/4
    controller.addQuestion("II");
    max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxTotal), "5/4");

    // Add Part III -> N1=1, N2=1, N3=1
    // BASE = 1.25 < 10 -> POINT_III = (10 - 1.25) / 1 = 8.75 = 35/4
    // MAX_III = 35/4
    // MAX_TOTAL = 10
    controller.addQuestion("III");
    max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxTotal), "10");
    assert.equal(toFractionString(max.pointIII), "35/4");

    // Duplicate Part III -> N1=1, N2=1, N3=2
    // BASE = 1.25 < 10 -> POINT_III = (10 - 1.25) / 2 = 8.75 / 2 = 35/8
    // MAX_TOTAL = 10
    const q3 = controller.getDraft().exam.questions.find((q) => q.kind === "III")!;
    controller.duplicateQuestion(q3.questionVersionId);
    max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxTotal), "10");
    assert.equal(toFractionString(max.pointIII), "35/8");

    // Toggle off Part III -> N1=1, N2=1, N3=0 -> MAX_TOTAL = 5/4
    controller.toggleSection("III", false);
    max = controller.getComputedMax();
    assert.equal(toFractionString(max.maxTotal), "5/4");
    assert.equal(toFractionString(max.maxIII), "0");
  });
});
