import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  editImport,
  confirmImport,
  cancelImport,
  failImport,
  checkDuplicateProvenance,
  deduplicateDraftsByProvenance,
  isDraftValid,
  isDraftMissingKey,
} from "../../src/import/preview/core.ts";
import {
  exportExam,
  parseExam,
} from "../../src/schema/index.ts";
import type {
  ImportJob,
  ImportDraft,
  ExamDraft,
  WebQuestionI,
  WebQuestionII,
  WebQuestionIII,
} from "../../src/import/preview/types.ts";
import { PREVIEW_FLAGS } from "../../src/import/preview/types.ts";
import {
  createSampleImportJob,
  createSampleTargetExamDraft,
} from "./fixtures.ts";

describe("WEB-W4-IMPORT: Hostile Preview Corpus, Retained Provenance & Anti-Partial Publication", () => {
  describe("Retained Provenance Across Complete Edit -> Confirm -> Export Pipeline", () => {
    it("preserves provenance (sourceId, location, confidence, flags) through editImport, confirmImport and exportExam roundtrip", () => {
      // 1. Initial draft with rich provenance
      const initialProvenance = {
        sourceId: "de-toan-gdpt2018.docx",
        location: "Phần I, Câu hỏi số 1 (Đoạn văn 12)",
        confidence: 0.98,
        flags: ["DOCX_MULTICOLUMN_LAYOUT"],
      };

      const job: ImportJob = {
        jobId: "job-provenance-test",
        sourceId: "de-toan-gdpt2018.docx",
        format: "docx",
        state: "preview",
        blocks: [],
        flags: ["DOCX_MULTICOLUMN_LAYOUT"],
        drafts: [
          {
            draftId: "draft-prov-1",
            question: {
              kind: "I",
              questionVersionId: "q-prov-01",
              title: "Câu 1",
              content: "Khảo sát hàm số y = f(x)",
              options: [
                { optionId: "opt-1", label: "A", text: "Đồng biến" },
                { optionId: "opt-2", label: "B", text: "Nghịch biến" },
                { optionId: "opt-3", label: "C", text: "Không đổi" },
                { optionId: "opt-4", label: "D", text: "Tuần hoàn" },
              ],
              correctOptionId: undefined, // Missing key initially
            },
            provenance: initialProvenance,
            confirmed: false,
          },
        ],
      };

      // 2. Teacher edits draft: assigns answer key and sets taxonomy
      const editResult = editImport(job, "draft-prov-1", {
        key: "A",
        confirmed: true,
        taxonomy: {
          subject: "Toán",
          grade: 12,
          topic: "Khảo sát hàm số",
          lesson: "Sự đồng biến nghịch biến",
          difficulty: "Thông hiểu",
        },
      });

      assert.strictEqual(editResult.ok, true);
      if (!editResult.ok) return;

      const editedJob = editResult.value;
      const editedDraft = editedJob.drafts[0]!;

      // Provenance must be strictly retained after editing!
      assert.strictEqual(editedDraft.provenance.sourceId, initialProvenance.sourceId);
      assert.strictEqual(editedDraft.provenance.location, initialProvenance.location);
      assert.strictEqual(editedDraft.provenance.confidence, initialProvenance.confidence);
      assert.ok(editedDraft.provenance.flags.includes("DOCX_MULTICOLUMN_LAYOUT"));
      assert.strictEqual(editedDraft.confirmed, true);
      assert.strictEqual(isDraftValid(editedDraft), true);

      // 3. Confirm draft into target ExamDraft
      const targetExam = createSampleTargetExamDraft({
        exam: {
          schemaVersion: "web-exam-v1",
          examId: "exam-dest-01",
          examVersionId: "v1",
          ruleSetId: "custom-v1",
          inputPolicyId: "sa-charset-v1",
          title: "Đề thi chính thức",
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
      });

      const confirmResult = confirmImport(editedJob, targetExam);
      assert.strictEqual(confirmResult.ok, true);
      if (!confirmResult.ok) return;

      const confirmedExamDraft = confirmResult.value;
      assert.strictEqual(confirmedExamDraft.exam.questions.length, 1);

      const transferredQ = confirmedExamDraft.exam.questions[0]!;
      // Provenance must be attached to WebQuestion!
      assert.ok(transferredQ.provenance !== undefined);
      assert.strictEqual(transferredQ.provenance?.sourceId, initialProvenance.sourceId);
      assert.strictEqual(transferredQ.provenance?.location, initialProvenance.location);
      assert.strictEqual(transferredQ.provenance?.confidence, initialProvenance.confidence);
      assert.ok(transferredQ.provenance?.flags.includes("DOCX_MULTICOLUMN_LAYOUT"));

      // 4. Export to JSON string and parse back
      const exportedJson = exportExam(confirmedExamDraft.exam);
      const parsedRes = parseExam(JSON.parse(exportedJson));
      assert.strictEqual(parsedRes.ok, true);
      if (!parsedRes.ok) return;

      const roundtripQ = parsedRes.value.questions[0]!;
      assert.ok(roundtripQ.provenance !== undefined);
      assert.strictEqual(roundtripQ.provenance?.sourceId, initialProvenance.sourceId);
      assert.strictEqual(roundtripQ.provenance?.location, initialProvenance.location);
      assert.strictEqual(roundtripQ.provenance?.confidence, initialProvenance.confidence);
    });
  });

  describe("Anti-Partial Publication & Guessed Key Rejection", () => {
    it("strictly rejects confirmation of drafts with missing answer keys (IMPORT_KEY_MISSING)", () => {
      const job: ImportJob = {
        jobId: "job-nokey",
        sourceId: "de-toan.docx",
        format: "docx",
        state: "preview",
        blocks: [],
        flags: [],
        drafts: [
          {
            draftId: "draft-nokey-1",
            question: {
              kind: "I",
              title: "Câu hỏi thiếu đáp án",
              options: [
                { optionId: "o1", label: "A", text: "1" },
                { optionId: "o2", label: "B", text: "2" },
                { optionId: "o3", label: "C", text: "3" },
                { optionId: "o4", label: "D", text: "4" },
              ],
              correctOptionId: undefined, // Missing!
            },
            provenance: { sourceId: "de-toan.docx", location: "p1", confidence: null, flags: [PREVIEW_FLAGS.KEY_MISSING] },
            confirmed: true, // User attempted to confirm without providing key
          },
        ],
      };

      const target = createSampleTargetExamDraft();
      const res = confirmImport(job, target);

      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      // AC: no guessed keys or partial publication
      assert.strictEqual(res.error.code, "IMPORT_KEY_MISSING");
      assert.match(res.error.message, /thiếu đáp án chuẩn/);
    });

    it("strictly rejects confirmation when draft is not explicitly confirmed by user (IMPORT_UNCONFIRMED)", () => {
      const job = createSampleImportJob();
      // Ensure all drafts have confirmed = false
      const unconfirmedJob: ImportJob = {
        ...job,
        drafts: job.drafts.map((d) => ({ ...d, confirmed: false })),
      };

      const target = createSampleTargetExamDraft();
      const res = confirmImport(unconfirmedJob, target);

      assert.strictEqual(res.ok, false);
      if (res.ok) return;

      assert.strictEqual(res.error.code, "IMPORT_UNCONFIRMED");
      assert.match(res.error.message, /Chưa có câu hỏi nào được xác nhận/);
    });

    it("rejects hostile image paths (e.g. javascript: or path traversal) during editImport with ASSET_UNSAFE", () => {
      const job = createSampleImportJob();
      const targetDraftId = job.drafts[0]!.draftId;

      // Hostile traversal
      const res1 = editImport(job, targetDraftId, {
        image: "../../etc/passwd",
      });
      assert.strictEqual(res1.ok, false);
      if (!res1.ok) {
        assert.strictEqual(res1.error.code, "ASSET_UNSAFE");
      }

      // Hostile javascript: protocol
      const res2 = editImport(job, targetDraftId, {
        image: "javascript:alert(document.cookie)",
      });
      assert.strictEqual(res2.ok, false);
      if (!res2.ok) {
        assert.strictEqual(res2.error.code, "ASSET_UNSAFE");
      }
    });
  });

  describe("Duplicate Provenance Detection & Deduplication", () => {
    it("detects and deduplicates duplicate source provenance within an ImportJob", () => {
      const duplicateProvenance = {
        sourceId: "de-goc.docx",
        location: "Trang 1, Đoạn 5",
        confidence: null,
        flags: [],
      };

      const job: ImportJob = {
        jobId: "job-dupes",
        sourceId: "de-goc.docx",
        format: "docx",
        state: "preview",
        blocks: [],
        flags: [],
        drafts: [
          {
            draftId: "draft-orig",
            question: { kind: "I", title: "Bản gốc" },
            provenance: duplicateProvenance,
            confirmed: false,
          },
          {
            draftId: "draft-copy",
            question: { kind: "I", title: "Bản sao trùng vị trí" },
            provenance: duplicateProvenance,
            confirmed: false,
          },
        ],
      };

      // Check duplicates
      const dupes = checkDuplicateProvenance(job);
      assert.strictEqual(dupes.length, 1);
      assert.strictEqual(dupes[0]!.draftId, "draft-copy");
      assert.strictEqual(dupes[0]!.sourceId, "de-goc.docx");

      // Deduplicate
      const dedupedJob = deduplicateDraftsByProvenance(job);
      assert.strictEqual(dedupedJob.drafts.length, 1);
      assert.strictEqual(dedupedJob.drafts[0]!.draftId, "draft-orig");
    });
  });

  describe("Lifecycle Teardown & Cancellation", () => {
    it("transitions job state to failed and sets IMPORT_CANCELLED flag on cancelImport", () => {
      const job = createSampleImportJob();
      const res = cancelImport(job);

      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      assert.strictEqual(res.value.state, "failed");
      assert.ok(res.value.flags.includes("IMPORT_CANCELLED"));
    });

    it("records error message and transitions state on failImport", () => {
      const job = createSampleImportJob();
      const res = failImport(job, "Lỗi phân tích cú pháp nghiêm trọng");

      assert.strictEqual(res.ok, true);
      if (!res.ok) return;

      assert.strictEqual(res.value.state, "failed");
      assert.ok(res.value.flags.some((f) => f.includes("Lỗi phân tích cú pháp")));
    });
  });

  describe("QA Resource & Performance Measurement (Timing & Memory)", () => {
    it("measures execution time and memory usage delta for batch edit and confirmation", () => {
      const job = createSampleImportJob();
      const target = createSampleTargetExamDraft();

      const getHeap = (): number => {
        const proc = (globalThis as unknown as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;
        return typeof proc?.memoryUsage === "function" ? proc.memoryUsage().heapUsed : 0;
      };

      const startMem = getHeap();
      const startTime = performance.now();

      // Edit all drafts to be valid and confirmed
      let currentJob = job;
      for (const d of currentJob.drafts) {
        if (d.question.kind === "I") {
          const editRes = editImport(currentJob, d.draftId, { key: "A", confirmed: true });
          if (editRes.ok) currentJob = editRes.value;
        } else if (d.question.kind === "II") {
          const editRes = editImport(currentJob, d.draftId, {
            statements: [
              { statementId: "st-1", label: "a", text: "Ý a", answer: true },
              { statementId: "st-2", label: "b", text: "Ý b", answer: true },
              { statementId: "st-3", label: "c", text: "Ý c", answer: false },
              { statementId: "st-4", label: "d", text: "Ý d", answer: false },
            ],
            confirmed: true,
          });
          if (editRes.ok) currentJob = editRes.value;
        } else if (d.question.kind === "III") {
          const editRes = editImport(currentJob, d.draftId, { answerKey: "1,5", confirmed: true });
          if (editRes.ok) currentJob = editRes.value;
        }
      }

      const confirmRes = confirmImport(currentJob, target);
      assert.strictEqual(confirmRes.ok, true);

      const endTime = performance.now();
      const endMem = getHeap();

      const durationMs = endTime - startTime;
      const heapDeltaBytes = endMem - startMem;

      assert.ok(durationMs >= 0);
      assert.ok(durationMs < 5000, `Batch edit/confirm took too long: ${durationMs}ms`);
      assert.strictEqual(typeof durationMs, "number");
      assert.strictEqual(typeof heapDeltaBytes, "number");
    });
  });
});
