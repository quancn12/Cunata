import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type {
  WebQuestion,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
  WebExam,
  AttemptRecord,
  OutboxRecord,
  ImportDraft,
  WebEvent,
} from "../../src/schema/types.ts";

describe("Schema Types — Structural & Discriminated Union Verification", () => {
  it("discriminates WebQuestion union by kind property", () => {
    const q1: WebQuestion = {
      kind: "I",
      questionVersionId: "q1-ver",
      options: [
        { optionId: "opt-1", label: "A", text: "Alpha" },
        { optionId: "opt-2", label: "B", text: "Beta" },
        { optionId: "opt-3", label: "C", text: "Gamma" },
        { optionId: "opt-4", label: "D", text: "Delta" },
      ],
      correctOptionId: "opt-1",
    };

    const q2: WebQuestion = {
      kind: "II",
      questionVersionId: "q2-ver",
      statements: [
        { statementId: "st-1", label: "a", text: "Stmt 1", answer: true },
        { statementId: "st-2", label: "b", text: "Stmt 2", answer: false },
        { statementId: "st-3", label: "c", text: "Stmt 3", answer: true },
        { statementId: "st-4", label: "d", text: "Stmt 4", answer: false },
      ],
    };

    const q3: WebQuestion = {
      kind: "III",
      questionVersionId: "q3-ver",
      answerKey: "-0,5",
    };

    function inspect(q: WebQuestion): string {
      switch (q.kind) {
        case "I":
          return `I:${q.options.length}:${q.correctOptionId}`;
        case "II":
          return `II:${q.statements.length}:${q.statements[0]?.answer}`;
        case "III":
          return `III:${q.answerKey}`;
      }
    }

    assert.equal(inspect(q1), "I:4:opt-1");
    assert.equal(inspect(q2), "II:4:true");
    assert.equal(inspect(q3), "III:-0,5");
  });

  it("verifies WebOption preserves label and text", () => {
    const q: WebQuestionI = {
      kind: "I",
      questionVersionId: "q-opts",
      options: [
        { optionId: "o1", label: "A", text: "Lựa chọn 1" },
        { optionId: "o2", label: "B", text: "Lựa chọn 2" },
        { optionId: "o3", label: "C", text: "Lựa chọn 3" },
        { optionId: "o4", label: "D", text: "Lựa chọn 4" },
      ],
      correctOptionId: "o1",
    };
    assert.equal(q.options[0]?.label, "A");
    assert.equal(q.options[0]?.text, "Lựa chọn 1");
  });

  it("verifies WebStatement preserves label, text, and explanation", () => {
    const q: WebQuestionII = {
      kind: "II",
      questionVersionId: "q-stmts",
      statements: [
        {
          statementId: "s1",
          label: "a",
          text: "Mệnh đề A",
          answer: true,
          explanation: "Vì x > 0",
        },
        { statementId: "s2", label: "b", text: "Mệnh đề B", answer: false },
        { statementId: "s3", label: "c", text: "Mệnh đề C", answer: true },
        { statementId: "s4", label: "d", text: "Mệnh đề D", answer: false },
      ],
    };
    assert.equal(q.statements[0]?.explanation, "Vì x > 0");
  });

  it("verifies WebEvent discriminated union", () => {
    const ev: WebEvent = {
      type: "error",
      error: {
        code: "TEST_ERR",
        path: "test",
        message: "Lỗi thử nghiệm",
        recoverable: true,
      },
    };
    assert.equal(ev.type, "error");
    assert.equal(ev.error.code, "TEST_ERR");
  });

  it("verifies AttemptRecord supports optional student_id and studentId fields (WEB §23)", () => {
    const attempt: Partial<AttemptRecord> = {
      examId: "exam-1",
      examVersionId: "v1",
      attemptId: "att-1",
      schemaVersion: "web-attempt-v1",
      revision: 1,
      candidateName: "Nguyễn Văn A",
      student_id: "stu-123",
      studentId: "stu-123",
      class_code: "12A1",
      assignment_id: "asg-01",
    };
    assert.equal(attempt.student_id, "stu-123");
    assert.equal(attempt.studentId, "stu-123");
    assert.equal(attempt.class_code, "12A1");
  });
});
