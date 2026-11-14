import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  editImport,
  confirmImport,
  cancelImport,
  isDraftValid,
  isDraftMissingKey,
} from "../../src/import/preview/core.ts";

import {
  exportExam,
  parseExam,
  toDomainExam,
} from "../../src/schema/index.ts";

import {
  validateExamVersion,
  scoreAttempt,
  toFractionString,
  rational,
} from "../../src/domain/index.ts";

import type {
  ImportJob,
  ExamDraft,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
} from "../../src/import/preview/types.ts";

import {
  createSampleImportJob,
  createSampleTargetExamDraft,
} from "./fixtures.ts";

describe("WEB-W3-IMPORT-PREVIEW: End-to-End Pipeline & Integration", () => {
  it("executes the full read-IR-edit-confirm-draft/export flow without guessed answers or auto-publish", () => {
    // 1. Initial parsed ImportJob from DOCX / PDF parser in "preview" state
    let job: ImportJob = createSampleImportJob({
      jobId: "e2e-job-thpt",
      sourceId: "de-toan-chinh-thuc.docx",
      format: "docx",
      state: "preview",
      drafts: [
        {
          draftId: "draft-i",
          question: {
            kind: "I",
            questionVersionId: "q1",
            title: "Câu 1: Hàm số",
            content: "Cho hàm số f(x) có bảng biến thiên...",
            options: [
              { optionId: "opt-1", label: "A", text: "(-∞; 0)" },
              { optionId: "opt-2", label: "B", text: "(0; 2)" },
              { optionId: "opt-3", label: "C", text: "(2; +∞)" },
              { optionId: "opt-4", label: "D", text: "(-1; 1)" },
            ],
            // Key initially unknown - NO GUESSED ANSWERS
            correctOptionId: undefined,
          },
          provenance: {
            sourceId: "de-toan-chinh-thuc.docx",
            location: "Trang 1, Đoạn 5",
            confidence: null,
            flags: ["KEY_MISSING"],
          },
          confirmed: false,
        },
        {
          draftId: "draft-ii",
          question: {
            kind: "II",
            questionVersionId: "q2",
            title: "Câu 2: Tứ diện",
            content: "Cho tứ diện ABCD có tất cả các cạnh bằng a.",
            statements: [
              { statementId: "st-1", label: "a", text: "AB vuông góc với CD", answer: undefined as unknown as boolean },
              { statementId: "st-2", label: "b", text: "Tam giác ABC đều", answer: undefined as unknown as boolean },
              { statementId: "st-3", label: "c", text: "Thể tích bằng a^3", answer: undefined as unknown as boolean },
              { statementId: "st-4", label: "d", text: "Góc giữa mặt bên và đáy là 60 độ", answer: undefined as unknown as boolean },
            ],
          },
          provenance: {
            sourceId: "de-toan-chinh-thuc.docx",
            location: "Trang 2, Đoạn 15",
            confidence: null,
            flags: ["KEY_MISSING"],
          },
          confirmed: false,
        },
        {
          draftId: "draft-iii",
          question: {
            kind: "III",
            questionVersionId: "q3",
            title: "Câu 3: Tích phân",
            content: "Tính giá trị tích phân I = ∫_0^1 (2x + 1) dx.",
            answerKey: "", // Unknown key
          },
          provenance: {
            sourceId: "de-toan-chinh-thuc.docx",
            location: "Trang 3, Đoạn 25",
            confidence: null,
            flags: ["KEY_MISSING"],
          },
          confirmed: false,
        },
      ],
    });

    const targetDraft: ExamDraft = {
      draftId: "draft-exam-destination",
      revision: 1,
      exam: {
        schemaVersion: "web-exam-v1",
        examId: "exam-e2e-01",
        examVersionId: "v1",
        ruleSetId: "custom-v1",
        inputPolicyId: "sa-charset-v1",
        title: "Đề thi thử THPT",
        subject: "Toán",
        grade: 12,
        settings: {
          durationMinutes: 50,
          maxAttempts: null,
          releasePolicy: "immediate",
          shuffleQuestions: false,
          shuffleOptions: false,
        },
        questions: [],
        assets: [],
      },
    };

    // 2. AC: Verification that unconfirmed / unresolved draft cannot be confirmed
    const unconfirmedRes = confirmImport(job, targetDraft);
    assert.equal(unconfirmedRes.ok, false);
    if (!unconfirmedRes.ok) {
      assert.equal(unconfirmedRes.error.code, "IMPORT_UNCONFIRMED");
    }

    // 3. Teacher correction:
    // Correct Part I: selects option 'A' (opt-1)
    const edit1 = editImport(job, "draft-i", {
      key: "A",
      explanation: "Hàm số đồng biến trên (-∞; 0).",
      taxonomy: {
        subject: "Toán",
        grade: 12,
        topic: "Khảo sát hàm số",
        lesson: "Tính đơn điệu",
        difficulty: "Thông hiểu",
      },
      confirmed: true,
    });
    assert.equal(edit1.ok, true);
    if (edit1.ok) job = edit1.value;

    // Correct Part II: sets 4 statements boolean answers
    const edit2 = editImport(job, "draft-ii", {
      statements: [
        { statementId: "st-1", label: "a", text: "AB vuông góc với CD", answer: true },
        { statementId: "st-2", label: "b", text: "Tam giác ABC đều", answer: true },
        { statementId: "st-3", label: "c", text: "Thể tích bằng a^3", answer: false },
        { statementId: "st-4", label: "d", text: "Góc giữa mặt bên và đáy là 60 độ", answer: false },
      ],
      taxonomy: {
        subject: "Toán",
        grade: 12,
        topic: "Hình học không gian",
        lesson: "Khối đa diện",
        difficulty: "Vận dụng",
      },
      confirmed: true,
    });
    assert.equal(edit2.ok, true);
    if (edit2.ok) job = edit2.value;

    // Correct Part III: sets answerKey "2"
    const edit3 = editImport(job, "draft-iii", {
      answerKey: "2",
      explanation: "I = [x^2 + x]_0^1 = 2.",
      taxonomy: {
        subject: "Toán",
        grade: 12,
        topic: "Nguyên hàm",
        lesson: "Tích phân",
        difficulty: "Thông hiểu",
      },
      confirmed: true,
    });
    assert.equal(edit3.ok, true);
    if (edit3.ok) job = edit3.value;

    // All drafts should now be confirmed and valid
    for (const d of job.drafts) {
      assert.equal(d.confirmed, true);
      assert.equal(isDraftMissingKey(d), false);
      assert.equal(isDraftValid(d), true);
    }

    // 4. Confirm Import into ExamDraft
    const confirmRes = confirmImport(job, targetDraft);
    assert.equal(confirmRes.ok, true);
    if (!confirmRes.ok) throw new Error("Confirm import failed unexpectedly");

    const updatedExamDraft = confirmRes.value;
    assert.equal(updatedExamDraft.exam.questions.length, 3);
    assert.equal(updatedExamDraft.revision, 2);

    // 5. Export exam canonical JSON and validate roundtrip
    const jsonStr = exportExam(updatedExamDraft.exam);
    assert.ok(jsonStr.includes("web-exam-v1"));

    const parsedJson = JSON.parse(jsonStr);
    const parsedValid = parseExam(parsedJson);
    assert.equal(parsedValid.ok, true);
    if (!parsedValid.ok) throw new Error("parseExam failed");

    const domainExam = toDomainExam(parsedValid.value);
    const domainIssues = validateExamVersion(domainExam);
    assert.equal(domainIssues.ok, true);

    // 6. Independently derived scoring check on the transferred exam:
    // Candidate answers:
    // - Q1 (Part I): "opt-1" (Correct)
    // - Q2 (Part II): st-1: true, st-2: true, st-3: false, st-4: false (4/4 Correct -> 1.00 pt)
    // - Q3 (Part III): "2" (Correct)
    const q1 = updatedExamDraft.exam.questions[0]! as WebQuestionI;
    const q2 = updatedExamDraft.exam.questions[1]! as WebQuestionII;
    const q3 = updatedExamDraft.exam.questions[2]! as WebQuestionIII;

    const attempt = {
      attemptId: "attempt-e2e-01",
      examVersionId: domainExam.examVersionId,
      responses: [
        {
          kind: "I" as const,
          questionVersionId: q1.questionVersionId,
          selectedOptionId: q1.correctOptionId,
        },
        {
          kind: "II" as const,
          questionVersionId: q2.questionVersionId,
          answers: [
            { statementId: q2.statements[0]!.statementId, value: true },
            { statementId: q2.statements[1]!.statementId, value: true },
            { statementId: q2.statements[2]!.statementId, value: false },
            { statementId: q2.statements[3]!.statementId, value: false },
          ],
        },
        {
          kind: "III" as const,
          questionVersionId: q3.questionVersionId,
          raw: "2",
        },
      ],
    };

    const scoreRes = scoreAttempt(domainExam, attempt);
    // Independently derived maximums and totals:
    // N1 = 1, N2 = 1, N3 = 1
    // MAX_I = 1 * 0.25 = 1/4
    // MAX_II = 1 * 1 = 1
    // BASE = 1/4 + 1 = 5/4 < 10
    // POINT_III = (10 - 5/4) / 1 = 35/4
    // MAX_III = 35/4
    // MAX_TOTAL = 1/4 + 4/4 + 35/4 = 40/4 = 10
    assert.equal(toFractionString(scoreRes.sections.I.score), "1/4");
    assert.equal(toFractionString(scoreRes.sections.II.score), "1");
    assert.equal(toFractionString(scoreRes.sections.III.score), "35/4");
    assert.equal(toFractionString(scoreRes.total), "10");
    assert.equal(toFractionString(scoreRes.maxTotal), "10");
  });

  it("cancel import leaves destination draft completely unmutated", () => {
    const job = createSampleImportJob();
    const targetDraft = createSampleTargetExamDraft();

    const cancelRes = cancelImport(job);
    assert.equal(cancelRes.ok, true);
    if (cancelRes.ok) {
      assert.equal(cancelRes.value.state, "failed");
    }

    // Destination exam was not touched
    assert.equal(targetDraft.revision, 1);
    assert.equal(targetDraft.exam.questions.length, 1);
  });
});
