import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseExam,
  toDomainExam,
  exportExam,
  validateImportDraft,
} from "../../src/schema/exam.ts";
import type { WebExam, ImportDraft } from "../../src/schema/types.ts";
import { validateExamVersion, scoreAttempt } from "../../src/domain/index.ts";

describe("Schema Exam Parser, Adapter, Exporter & Importer Validator", () => {
  const samplePath = path.resolve("public/sample-exam.json");
  const rawSampleText = fs.readFileSync(samplePath, "utf8");
  const sampleObj = JSON.parse(rawSampleText);

  it("successfully parses public/sample-exam.json without changing it", () => {
    const res = parseExam(sampleObj);
    assert.equal(res.ok, true, `Expected ok=true, got: ${JSON.stringify(res.ok ? {} : res.issues)}`);
    if (!res.ok) return;

    const exam = res.value;
    assert.equal(exam.schemaVersion, "web-exam-v1");
    assert.equal(exam.examId, "exam-thpt-toan-demo-01");
    assert.equal(exam.examVersionId, "v1.0.0");
    assert.equal(exam.title, "Đề Khảo Sát Năng Lực Môn Toán — GDPT 2018 (Đề Mẫu Tùy Chỉnh)");
    assert.equal(exam.subject, "Toán học");
    assert.equal(exam.grade, 12);
    assert.equal(exam.ruleSetId, "custom-v1");
    assert.equal(exam.inputPolicyId, "sa-charset-v1");

    // Preserved legacy top-level durationMinutes into settings
    assert.equal(exam.settings.durationMinutes, 50);
    assert.equal(exam.settings.maxAttempts, null);
    assert.equal(exam.settings.releasePolicy, "immediate");
    assert.equal(exam.settings.shuffleQuestions, false);
    assert.equal(exam.settings.shuffleOptions, false);

    // Default assets
    assert.deepEqual(exam.assets, []);

    // Questions count and preservation of options and statements
    assert.equal(exam.questions.length, 8);

    const q01 = exam.questions.find((q) => q.questionVersionId === "q01-i-ham-so");
    assert.ok(q01);
    if (q01.kind !== "I") throw new Error("q01 must be kind I");
    assert.equal(q01.image, "public/q01-bbt.svg");
    assert.equal(q01.options.length, 4);
    assert.equal(q01.options[0]?.label, "A");
    assert.equal(q01.options[0]?.text, "Khoảng $(-\\infty; -1)$");
    assert.ok(q01.explanation?.includes("đạo hàm $f'(x) > 0$"));

    const q05 = exam.questions.find((q) => q.questionVersionId === "q05-ii-khao-sat-ham");
    assert.ok(q05);
    if (q05.kind !== "II") throw new Error("q05 must be kind II");
    assert.equal(q05.statements.length, 4);
    assert.equal(q05.statements[0]?.label, "a");
    assert.equal(q05.statements[0]?.answer, true);
    assert.ok(q05.statements[0]?.explanation?.includes("cực tiểu"));

    const q07 = exam.questions.find((q) => q.questionVersionId === "q07-iii-gia-tri-nho-nhat");
    assert.ok(q07);
    if (q07.kind !== "III") throw new Error("q07 must be kind III");
    assert.equal(q07.answerKey, "-0,5");
  });

  it("parses raw JSON string input directly", () => {
    const res = parseExam(rawSampleText);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.value.examId, "exam-thpt-toan-demo-01");
    }
  });

  it("returns JSON_SYNTAX_ERROR on malformed JSON string", () => {
    const res = parseExam("{ bad json: ");
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.issues[0]?.code, "JSON_SYNTAX_ERROR");
    }
  });

  it("deeply freezes the parsed WebExam result", () => {
    const res = parseExam(sampleObj);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.ok(Object.isFrozen(res.value));
      assert.ok(Object.isFrozen(res.value.settings));
      assert.ok(Object.isFrozen(res.value.questions));
      assert.ok(Object.isFrozen(res.value.questions[0]));
      assert.throws(() => {
        (res.value as { title: string }).title = "Mutated Title";
      }, TypeError);
    }
  });

  it("rejects unsupported schema version with EXAM_SCHEMA_UNSUPPORTED", () => {
    const bad = { ...sampleObj, schemaVersion: "web-exam-v2" };
    const res = parseExam(bad);
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.ok(res.issues.some((i) => i.code === "EXAM_SCHEMA_UNSUPPORTED"));
    }
  });

  it("rejects explicit settings conflicts with EXAM_SETTINGS_CONFLICT", () => {
    // 1. durationMinutes conflict
    const confDuration = {
      ...sampleObj,
      durationMinutes: 40,
      settings: {
        durationMinutes: 50,
        maxAttempts: null,
        releasePolicy: "immediate",
        shuffleQuestions: false,
        shuffleOptions: false,
      },
    };
    const res1 = parseExam(confDuration);
    assert.equal(res1.ok, false);
    if (!res1.ok) {
      assert.ok(res1.issues.some((i) => i.code === "EXAM_SETTINGS_CONFLICT" && i.path === "durationMinutes"));
    }

    // 2. releasePolicy conflict
    const confRelease = {
      ...sampleObj,
      releasePolicy: "after_deadline",
      settings: {
        durationMinutes: 50,
        maxAttempts: null,
        releasePolicy: "immediate",
        shuffleQuestions: false,
        shuffleOptions: false,
      },
    };
    const res2 = parseExam(confRelease);
    assert.equal(res2.ok, false);
    if (!res2.ok) {
      assert.ok(res2.issues.some((i) => i.code === "EXAM_SETTINGS_CONFLICT" && i.path === "releasePolicy"));
    }

    // 3. shuffleQuestions conflict
    const confShuffle = {
      ...sampleObj,
      shuffleQuestions: true,
      settings: {
        durationMinutes: 50,
        maxAttempts: null,
        releasePolicy: "immediate",
        shuffleQuestions: false,
        shuffleOptions: false,
      },
    };
    const res3 = parseExam(confShuffle);
    assert.equal(res3.ok, false);
    if (!res3.ok) {
      assert.ok(res3.issues.some((i) => i.code === "EXAM_SETTINGS_CONFLICT" && i.path === "shuffleQuestions"));
    }

    // 4. shuffleSettings object conflict
    const confShuffleObj = {
      ...sampleObj,
      shuffleSettings: { questions: true, options: false },
      settings: {
        durationMinutes: 50,
        maxAttempts: null,
        releasePolicy: "immediate",
        shuffleQuestions: false,
        shuffleOptions: false,
      },
    };
    const res4 = parseExam(confShuffleObj);
    assert.equal(res4.ok, false);
    if (!res4.ok) {
      assert.ok(res4.issues.some((i) => i.code === "EXAM_SETTINGS_CONFLICT" && i.path.startsWith("shuffleSettings")));
    }
  });

  it("rejects unknown ruleSetId and inputPolicyId", () => {
    const badRule = { ...sampleObj, ruleSetId: "thpt-official-2025" };
    const resRule = parseExam(badRule);
    assert.equal(resRule.ok, false);
    if (!resRule.ok) {
      assert.ok(resRule.issues.some((i) => i.code === "RULESET_UNKNOWN"));
    }

    const badPolicy = { ...sampleObj, inputPolicyId: "arbitrary-v1" };
    const resPolicy = parseExam(badPolicy);
    assert.equal(resPolicy.ok, false);
    if (!resPolicy.ok) {
      assert.ok(resPolicy.issues.some((i) => i.code === "INPUT_POLICY_UNKNOWN"));
    }
  });

  it("rejects missing required top-level metadata keys", () => {
    const noTitle = { ...sampleObj };
    delete (noTitle as { title?: unknown }).title;
    const resTitle = parseExam(noTitle);
    assert.equal(resTitle.ok, false);

    const noSubject = { ...sampleObj };
    delete (noSubject as { subject?: unknown }).subject;
    const resSubject = parseExam(noSubject);
    assert.equal(resSubject.ok, false);

    const badGrade = { ...sampleObj, grade: 9 };
    const resGrade = parseExam(badGrade);
    assert.equal(resGrade.ok, false);
    if (!resGrade.ok) {
      assert.ok(resGrade.issues.some((i) => i.code === "GRADE_INVALID"));
    }
  });

  it("toDomainExam converts WebExam to valid domain ExamVersion", () => {
    const parsed = parseExam(sampleObj);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const domainExam = toDomainExam(parsed.value);
    assert.equal(domainExam.examId, parsed.value.examId);
    assert.equal(domainExam.examVersionId, parsed.value.examVersionId);
    assert.equal(domainExam.ruleSetId, "custom-v1");
    assert.equal(domainExam.inputPolicyId, "sa-charset-v1");

    // Strictly validate against domain schema
    const valRes = validateExamVersion(domainExam);
    assert.equal(valRes.ok, true, `Domain validation failed: ${valRes.ok ? "" : JSON.stringify(valRes.issues)}`);

    // Ensure nested text/labels are retained
    const q1 = domainExam.questions[0];
    assert.ok(q1);
    if (q1.kind !== "I") throw new Error("q1 must be kind I");
    assert.equal((q1.options[0] as { text?: string }).text, "Khoảng $(-\\infty; -1)$");
  });

  it("exportExam emits canonical JSON and achieves exact roundtrip", () => {
    const parsed = parseExam(sampleObj);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;

    const jsonString = exportExam(parsed.value);
    assert.ok(typeof jsonString === "string");
    assert.ok(jsonString.includes('"schemaVersion": "web-exam-v1"'));
    assert.ok(jsonString.includes('"ruleSetId": "custom-v1"'));

    const reparsed = parseExam(jsonString);
    assert.equal(reparsed.ok, true);
    if (reparsed.ok) {
      assert.deepEqual(reparsed.value, parsed.value);
    }
  });

  it("validateImportDraft validates complete and incomplete question drafts", () => {
    // 1. Valid Part I draft
    const validDraftI: ImportDraft = {
      draftId: "draft-01",
      provenance: {
        sourceId: "docx-doc-1",
        location: "p.3",
        confidence: 0.95,
        flags: [],
      },
      confirmed: false,
      question: {
        kind: "I",
        questionVersionId: "q-draft-1",
        options: [
          { optionId: "o1", label: "A", text: "Text A" },
          { optionId: "o2", label: "B", text: "Text B" },
          { optionId: "o3", label: "C", text: "Text C" },
          { optionId: "o4", label: "D", text: "Text D" },
        ],
        correctOptionId: "o1",
      },
    };
    const issuesI = validateImportDraft(validDraftI);
    assert.equal(issuesI.length, 0);

    // 2. Part I missing correctOptionId -> IMPORT_KEY_MISSING
    const missingKeyDraftI: ImportDraft = {
      ...validDraftI,
      question: {
        ...validDraftI.question,
        correctOptionId: undefined,
      },
    };
    const issuesMissingI = validateImportDraft(missingKeyDraftI);
    assert.ok(issuesMissingI.some((i) => i.code === "IMPORT_KEY_MISSING"));

    // 3. Valid Part II draft
    const validDraftII: ImportDraft = {
      draftId: "draft-02",
      provenance: {
        sourceId: "docx-doc-1",
        location: "p.5",
        confidence: 0.9,
        flags: [],
      },
      confirmed: false,
      question: {
        kind: "II",
        questionVersionId: "q-draft-2",
        statements: [
          { statementId: "s1", label: "a", text: "Mệnh đề 1", answer: true },
          { statementId: "s2", label: "b", text: "Mệnh đề 2", answer: false },
          { statementId: "s3", label: "c", text: "Mệnh đề 3", answer: true },
          { statementId: "s4", label: "d", text: "Mệnh đề 4", answer: false },
        ],
      },
    };
    const issuesII = validateImportDraft(validDraftII);
    assert.equal(issuesII.length, 0);

    // 4. Part II missing statement answer -> IMPORT_KEY_MISSING
    const missingKeyDraftII: ImportDraft = {
      ...validDraftII,
      question: {
        kind: "II",
        questionVersionId: "q-draft-2",
        statements: [
          { statementId: "s1", label: "a", text: "Mệnh đề 1", answer: true },
          { statementId: "s2", label: "b", text: "Mệnh đề 2", answer: (undefined as unknown as boolean) },
          { statementId: "s3", label: "c", text: "Mệnh đề 3", answer: true },
          { statementId: "s4", label: "d", text: "Mệnh đề 4", answer: false },
        ],
      },
    };
    const issuesMissingII = validateImportDraft(missingKeyDraftII);
    assert.ok(issuesMissingII.some((i) => i.code === "IMPORT_KEY_MISSING"));

    // 5. Valid Part III draft
    const validDraftIII: ImportDraft = {
      draftId: "draft-03",
      provenance: {
        sourceId: "docx-doc-1",
        location: "p.8",
        confidence: 0.85,
        flags: [],
      },
      confirmed: false,
      question: {
        kind: "III",
        questionVersionId: "q-draft-3",
        answerKey: "-0,5",
      },
    };
    const issuesIII = validateImportDraft(validDraftIII);
    assert.equal(issuesIII.length, 0);

    // 6. Part III missing answerKey -> IMPORT_KEY_MISSING
    const missingKeyDraftIII: ImportDraft = {
      ...validDraftIII,
      question: {
        kind: "III",
        questionVersionId: "q-draft-3",
        answerKey: undefined,
      },
    };
    const issuesMissingIII = validateImportDraft(missingKeyDraftIII);
    assert.ok(issuesMissingIII.some((i) => i.code === "IMPORT_KEY_MISSING"));

    // 7. Part III invalid answerKey (>4 chars) -> III_KEY_INVALID
    const invalidKeyDraftIII: ImportDraft = {
      ...validDraftIII,
      question: {
        kind: "III",
        questionVersionId: "q-draft-3",
        answerKey: "12345",
      },
    };
    const issuesInvalidIII = validateImportDraft(invalidKeyDraftIII);
    assert.ok(issuesInvalidIII.some((i) => i.code === "III_KEY_INVALID"));
  });
});
