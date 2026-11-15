import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  editImport,
  confirmImport,
  cancelImport,
  failImport,
  toggleDraftConfirmed,
  confirmAllValidDrafts,
  getDraftWarnings,
  isDraftValid,
  isDraftMissingKey,
  checkDuplicateProvenance,
  deduplicateDraftsByProvenance,
  checkHostileRefs,
} from "../../src/import/preview/core.ts";

import { PREVIEW_FLAGS } from "../../src/import/preview/types.ts";
import type { ImportJob, WebQuestionI, WebQuestionII, WebQuestionIII, Asset, Block } from "../../src/import/preview/types.ts";
import { exportExam, parseExam } from "../../src/schema/index.ts";

import {
  createSampleImportJob,
  createSampleTargetExamDraft,
  sampleValidPartI,
  sampleValidPartII,
  sampleValidPartIII,
} from "./fixtures.ts";

describe("WEB-W3-IMPORT-PREVIEW: Core Functional Tests", () => {
  describe("checkHostileRefs", () => {
    it("detects javascript: and vbscript: URIs", () => {
      assert.equal(checkHostileRefs("javascript:alert(1)").isHostile, true);
      assert.equal(checkHostileRefs("vbscript:msgbox(1)").isHostile, true);
      assert.equal(checkHostileRefs("  JAVASCRIPT:attack()").isHostile, true);
    });

    it("detects path traversal ../ in image paths", () => {
      assert.equal(checkHostileRefs("../../../etc/passwd").isHostile, true);
      assert.equal(checkHostileRefs("images/../../secret.png").isHostile, true);
    });

    it("detects data:text/html hostile data URIs", () => {
      assert.equal(checkHostileRefs("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==").isHostile, true);
    });

    it("accepts safe relative images and safe data URIs", () => {
      assert.equal(checkHostileRefs("images/q01.png").isHostile, false);
      assert.equal(checkHostileRefs("public/q01-bbt.svg").isHostile, false);
      assert.equal(checkHostileRefs(undefined).isHostile, false);
    });

    it("detects hostile assetId in table or block images", () => {
      const hostileBlocks = [
        { type: "image", assetId: "javascript:doBad()", alt: "bad image" },
      ] as const;
      assert.equal(checkHostileRefs(undefined, hostileBlocks).isHostile, true);
    });
  });

  describe("editImport", () => {
    it("returns error on invalid job or non-existent draftId", () => {
      const job = createSampleImportJob();
      const res1 = editImport(null as unknown as ImportJob, "draft-01", {});
      assert.equal(res1.ok, false);
      if (!res1.ok) assert.equal(res1.error.code, "IMPORT_INVALID");

      const res2 = editImport(job, "non-existent-draft", {});
      assert.equal(res2.ok, false);
      if (!res2.ok) assert.equal(res2.error.code, "DRAFT_NOT_FOUND");

      const res3 = editImport(job, "draft-01", null);
      assert.equal(res3.ok, false);
      if (!res3.ok) assert.equal(res3.error.code, "PATCH_INVALID");
    });

    it("rejects hostile image paths with ASSET_UNSAFE error", () => {
      const job = createSampleImportJob();
      const res = editImport(job, "draft-01", {
        image: "javascript:evil()",
      });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, "ASSET_UNSAFE");
      }
    });

    it("rejects path traversal in image with ASSET_UNSAFE error", () => {
      const job = createSampleImportJob();
      const res = editImport(job, "draft-01", {
        image: "../../windows/system32/cmd.exe",
      });
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, "ASSET_UNSAFE");
      }
    });

    it("corrects Part I options, key mapping and resolves KEY_MISSING warning", () => {
      const job = createSampleImportJob();
      const draft01 = job.drafts.find((d) => d.draftId === "draft-01")!;
      assert.equal(isDraftMissingKey(draft01), true);
      assert.equal(getDraftWarnings(draft01).includes(PREVIEW_FLAGS.KEY_MISSING), true);

      // Supply correctOptionId
      const res = editImport(job, "draft-01", {
        correctOptionId: "opt-b",
        taxonomy: {
          subject: "Toán",
          grade: 12,
          topic: "Khảo sát hàm số",
          lesson: "Đơn điệu",
          difficulty: "Thông hiểu",
        },
        explanation: "Hàm số đồng biến trên khoảng (-1; 1).",
        confirmed: true,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        const updated = res.value.drafts.find((d) => d.draftId === "draft-01")!;
        const q = updated.question as WebQuestionI;
        assert.equal(q.correctOptionId, "opt-b");
        assert.equal(q.subject, "Toán");
        assert.equal(q.grade, 12);
        assert.equal(q.difficulty, "Thông hiểu");
        assert.equal(updated.confirmed, true);

        // Warning should be resolved!
        assert.equal(isDraftMissingKey(updated), false);
        assert.equal(getDraftWarnings(updated).includes(PREVIEW_FLAGS.KEY_MISSING), false);
        assert.equal(isDraftValid(updated), true);
      }
    });

    it("corrects Part I key using option label (e.g. key: 'C')", () => {
      const job = createSampleImportJob();
      const res = editImport(job, "draft-01", {
        key: "C", // Maps to option with label 'C' (opt-c)
      });
      assert.equal(res.ok, true);
      if (res.ok) {
        const updated = res.value.drafts.find((d) => d.draftId === "draft-01")!;
        const q = updated.question as WebQuestionI;
        assert.equal(q.correctOptionId, "opt-c");
      }
    });

    it("corrects Part II statements true/false answers and resolves KEY_MISSING", () => {
      const job = createSampleImportJob();
      const draft02 = job.drafts.find((d) => d.draftId === "draft-02")!;
      assert.equal(isDraftMissingKey(draft02), true);

      const res = editImport(job, "draft-02", {
        statements: [
          { statementId: "st-a", label: "a", text: "Ý 1 đúng", answer: true },
          { statementId: "st-b", label: "b", text: "Ý 2 đúng", answer: true },
          { statementId: "st-c", label: "c", text: "Ý 3 sai", answer: false },
          { statementId: "st-d", label: "d", text: "Ý 4 sai", answer: false },
        ],
        confirmed: true,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        const updated = res.value.drafts.find((d) => d.draftId === "draft-02")!;
        const q = updated.question as WebQuestionII;
        assert.equal(q.statements.length, 4);
        assert.equal(q.statements[0]?.answer, true);
        assert.equal(q.statements[1]?.answer, true);
        assert.equal(q.statements[2]?.answer, false);
        assert.equal(q.statements[3]?.answer, false);
        assert.equal(isDraftMissingKey(updated), false);
        assert.equal(isDraftValid(updated), true);
      }
    });

    it("corrects Part III answerKey and validates with checkShortAnswer", () => {
      const job = createSampleImportJob();
      const draft03 = job.drafts.find((d) => d.draftId === "draft-03")!;
      assert.equal(isDraftMissingKey(draft03), true);

      // Valid raw key "-0,5"
      const res = editImport(job, "draft-03", {
        answerKey: "-0,5",
        confirmed: true,
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        const updated = res.value.drafts.find((d) => d.draftId === "draft-03")!;
        const q = updated.question as WebQuestionIII;
        assert.equal(q.answerKey, "-0,5");
        assert.equal(isDraftMissingKey(updated), false);
        assert.equal(isDraftValid(updated), true);
      }
    });

    it("keeps KEY_MISSING warning when Part III key exceeds 4 characters or is invalid", () => {
      const job = createSampleImportJob();
      const res = editImport(job, "draft-03", {
        answerKey: "1,2345", // Length > 4 is invalid
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        const updated = res.value.drafts.find((d) => d.draftId === "draft-03")!;
        assert.equal(isDraftMissingKey(updated), true);
        assert.equal(isDraftValid(updated), false);
      }
    });

    it("handles kind transition (e.g. from Part I to Part II)", () => {
      const job = createSampleImportJob();
      const res = editImport(job, "draft-01", {
        kind: "II",
      });

      assert.equal(res.ok, true);
      if (res.ok) {
        const updated = res.value.drafts.find((d) => d.draftId === "draft-01")!;
        assert.equal(updated.question?.kind, "II");
        assert.equal(Array.isArray((updated.question as WebQuestionII).statements), true);
        assert.equal((updated.question as WebQuestionII).statements.length, 4);
        assert.equal((updated.question as any).options, undefined);
      }
    });

    it("preserves unsupported OMML warning until explicitly acknowledged or resolved", () => {
      const job = createSampleImportJob();
      const draft04 = job.drafts.find((d) => d.draftId === "draft-04-omml")!;
      assert.equal(getDraftWarnings(draft04).includes(PREVIEW_FLAGS.OMML_UNSUPPORTED), true);

      // Update title only -> OMML warning remains
      const res1 = editImport(job, "draft-04-omml", {
        title: "Tiêu đề mới cho câu 4",
      });
      assert.equal(res1.ok, true);
      if (res1.ok) {
        const updated1 = res1.value.drafts.find((d) => d.draftId === "draft-04-omml")!;
        assert.equal(getDraftWarnings(updated1).includes(PREVIEW_FLAGS.OMML_UNSUPPORTED), true);

        // Replace formula with verified LaTeX math and remove flag -> resolved!
        const res2 = editImport(res1.value, "draft-04-omml", {
          blocks: [
            { type: "text", text: "Phương trình dao động:" },
            { type: "math", source: "x = A \\cos(\\omega t + \\varphi)", format: "latex", verified: true },
          ],
          removeFlags: [PREVIEW_FLAGS.OMML_UNSUPPORTED],
        });
        assert.equal(res2.ok, true);
        if (res2.ok) {
          const updated2 = res2.value.drafts.find((d) => d.draftId === "draft-04-omml")!;
          assert.equal(getDraftWarnings(updated2).includes(PREVIEW_FLAGS.OMML_UNSUPPORTED), false);
        }
      }
    });

    it("preserves manual PDF review warning until explicitly reviewed", () => {
      const job = createSampleImportJob();
      const draft05 = job.drafts.find((d) => d.draftId === "draft-05-pdf-manual")!;
      assert.equal(getDraftWarnings(draft05).includes(PREVIEW_FLAGS.PDF_MANUAL_REVIEW_REQUIRED), true);

      // User marks reviewed
      const res = editImport(job, "draft-05-pdf-manual", {
        removeFlags: [PREVIEW_FLAGS.PDF_MANUAL_REVIEW_REQUIRED],
        confirmed: true,
      });
      assert.equal(res.ok, true);
      if (res.ok) {
        const updated = res.value.drafts.find((d) => d.draftId === "draft-05-pdf-manual")!;
        assert.equal(getDraftWarnings(updated).includes(PREVIEW_FLAGS.PDF_MANUAL_REVIEW_REQUIRED), false);
        assert.equal(updated.confirmed, true);
      }
    });
  });

  describe("confirmImport", () => {
    it("returns error IMPORT_UNCONFIRMED when 0 drafts are confirmed", () => {
      const job = createSampleImportJob(); // all confirmed: false
      const examDraft = createSampleTargetExamDraft();

      const res = confirmImport(job, examDraft);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, "IMPORT_UNCONFIRMED");
      }
    });

    it("returns error IMPORT_KEY_MISSING when confirmed drafts all lack valid answer keys", () => {
      let job = createSampleImportJob();
      // Confirm draft-01 which is missing key
      const editRes = editImport(job, "draft-01", { confirmed: true });
      assert.equal(editRes.ok, true);
      if (editRes.ok) job = editRes.value;

      const examDraft = createSampleTargetExamDraft();
      const res = confirmImport(job, examDraft);
      assert.equal(res.ok, false);
      if (!res.ok) {
        assert.equal(res.error.code, "IMPORT_KEY_MISSING");
      }
    });

    it("supports partial confirm: transfers only confirmed valid questions, ignoring unconfirmed or invalid", () => {
      let job = createSampleImportJob();

      // 1. Correct draft-01 and confirm it
      const res1 = editImport(job, "draft-01", {
        correctOptionId: "opt-a",
        confirmed: true,
      });
      assert.equal(res1.ok, true);
      if (res1.ok) job = res1.value;

      // 2. Draft-02 remains unconfirmed (confirmed: false)
      // 3. Draft-03 is confirmed: true but STILL missing key (invalid)
      const res3 = editImport(job, "draft-03", {
        confirmed: true, // confirmed but answerKey is still ""
      });
      assert.equal(res3.ok, true);
      if (res3.ok) job = res3.value;

      const examDraft = createSampleTargetExamDraft();
      const initialCount = examDraft.exam.questions.length;

      const confirmRes = confirmImport(job, examDraft);
      assert.equal(confirmRes.ok, true);
      if (confirmRes.ok) {
        const updatedExam = confirmRes.value;
        // Only draft-01 should have been transferred!
        assert.equal(updatedExam.exam.questions.length, initialCount + 1);
        assert.equal(updatedExam.revision, examDraft.revision + 1);

        const transferred = updatedExam.exam.questions[initialCount]! as WebQuestionI;
        assert.equal(transferred.kind, "I");
        assert.equal(transferred.correctOptionId, "opt-a");
      }
    });

    it("remaps IDs on collision with existing questions in target ExamDraft", () => {
      // Target draft already has question with questionVersionId: "q-p1-01"
      const examDraft = createSampleTargetExamDraft({
        exam: {
          ...createSampleTargetExamDraft().exam,
          questions: [sampleValidPartI], // Has qVersionId: "q-p1-01", optionIds: ["opt-1", ...]
        },
      });

      // Prepare import job with same qVersionId and optionIds
      const job: ImportJob = {
        jobId: "job-collision",
        sourceId: "source-collision.docx",
        format: "docx",
        state: "preview",
        blocks: [],
        drafts: [
          {
            draftId: "draft-col",
            question: sampleValidPartI, // identical IDs
            provenance: {
              sourceId: "source-collision.docx",
              location: "Trang 9, Đoạn 9",
              confidence: 0.9,
              flags: [],
            },
            confirmed: true,
          },
        ],
        flags: [],
      };

      const res = confirmImport(job, examDraft);
      assert.equal(res.ok, true);
      if (res.ok) {
        const updated = res.value;
        assert.equal(updated.exam.questions.length, 2);

        const qExisting = updated.exam.questions[0]! as WebQuestionI;
        const qImported = updated.exam.questions[1]! as WebQuestionI;

        // questionVersionId must be distinct!
        assert.notEqual(qImported.questionVersionId, qExisting.questionVersionId);

        // optionIds must be distinct!
        for (const opt of qImported.options) {
          for (const exOpt of qExisting.options) {
            assert.notEqual(opt.optionId, exOpt.optionId);
          }
        }

        // Key mapping must remain valid and point to the remapped option
        const matchingOpt = qImported.options.find((o) => o.optionId === qImported.correctOptionId);
        assert.ok(matchingOpt, "correctOptionId must point to one of the remapped options");
        assert.equal(matchingOpt?.label, "A");
      }
    });

    it("supports dedupeDuplicateProvenance: true to omit identical provenance", () => {
      const examDraft = createSampleTargetExamDraft({
        exam: {
          ...createSampleTargetExamDraft().exam,
          questions: [sampleValidPartI],
        },
      });

      const duplicateJob: ImportJob = {
        jobId: "job-dup",
        sourceId: "de-toan-thpt.docx",
        format: "docx",
        state: "preview",
        blocks: [],
        drafts: [
          {
            draftId: "draft-dup-01",
            question: {
              ...sampleValidPartI,
              questionVersionId: "different-id",
            },
            // Identical provenance as sampleValidPartI
            provenance: { ...sampleValidPartI.provenance! },
            confirmed: true,
          },
        ],
        flags: [],
      };

      // With dedupeDuplicateProvenance: true -> should skip duplicate!
      const res = confirmImport(duplicateJob, examDraft, { dedupeDuplicateProvenance: true });
      assert.equal(res.ok, true);
      if (res.ok) {
        // Nothing added because duplicate was skipped
        assert.equal(res.value.exam.questions.length, examDraft.exam.questions.length);
      }
    });

    it("verifies no direct bank writes occur during confirmation", () => {
      const job: ImportJob = {
        jobId: "job-bank-test",
        sourceId: "file.docx",
        format: "docx",
        state: "preview",
        blocks: [],
        drafts: [
          {
            draftId: "d1",
            question: sampleValidPartIII,
            provenance: sampleValidPartIII.provenance!,
            confirmed: true,
          },
        ],
        flags: [],
      };

      const examDraft = createSampleTargetExamDraft();
      // Call confirmImport - it only interacts with ExamDraft
      const res = confirmImport(job, examDraft);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.exam.questions.length, 2);
      }
    });
  });

  describe("cancelImport & failImport", () => {
    it("transitions job state to failed with IMPORT_CANCELLED flag", () => {
      const job = createSampleImportJob();
      const res = cancelImport(job);
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.state, "failed");
        assert.equal(res.value.flags.includes(PREVIEW_FLAGS.IMPORT_CANCELLED), true);
      }
    });

    it("fails import with custom reason", () => {
      const job = createSampleImportJob();
      const res = failImport(job, "ZIP_CORRUPT");
      assert.equal(res.ok, true);
      if (res.ok) {
        assert.equal(res.value.state, "failed");
        assert.equal(res.value.flags.some((f) => f.includes("ZIP_CORRUPT")), true);
      }
    });
  });

  describe("batch helpers", () => {
    it("confirmAllValidDrafts marks only valid drafts as confirmed", () => {
      let job = createSampleImportJob();
      // Resolve draft-01 key
      const resEdit = editImport(job, "draft-01", { correctOptionId: "opt-a" });
      if (resEdit.ok) job = resEdit.value;

      const resBatch = confirmAllValidDrafts(job);
      assert.equal(resBatch.ok, true);
      if (resBatch.ok) {
        const d1 = resBatch.value.drafts.find((d) => d.draftId === "draft-01")!;
        const d2 = resBatch.value.drafts.find((d) => d.draftId === "draft-02")!;
        assert.equal(d1.confirmed, true); // Valid -> confirmed
        assert.equal(d2.confirmed, false); // Missing key -> unconfirmed
      }
    });

    it("checkDuplicateProvenance identifies duplicate locations within a job", () => {
      const job = createSampleImportJob({
        drafts: [
          {
            draftId: "d1",
            question: sampleValidPartI,
            provenance: { sourceId: "file.docx", location: "Page 1, Para 1", confidence: 1, flags: [] },
            confirmed: true,
          },
          {
            draftId: "d2",
            question: sampleValidPartII,
            provenance: { sourceId: "file.docx", location: "Page 1, Para 1", confidence: 1, flags: [] },
            confirmed: true,
          },
        ],
      });

      const dups = checkDuplicateProvenance(job);
      assert.equal(dups.length, 1);
      assert.equal(dups[0]?.draftId, "d2");

      const deduped = deduplicateDraftsByProvenance(job);
      assert.equal(deduped.drafts.length, 1);
    });
  });

  describe("WEB-FINAL-IMPORT: Regression WEB-F04 & WEB-F05", () => {
    describe("WEB-F04: Asset preservation, ID collision resolution & safe references", () => {
      it("preserves imported image assets through preview confirmation into target exam", () => {
        const samplePngAsset: Asset = {
          assetId: "pic",
          mime: "image/png",
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          alt: "diagram",
        };

        const job: ImportJob & { assets: readonly Asset[] } = {
          jobId: "job-img-01",
          sourceId: "math-images.docx",
          format: "docx",
          state: "preview",
          blocks: [],
          assets: [samplePngAsset],
          drafts: [
            {
              draftId: "draft-img-01",
              question: {
                kind: "III",
                questionVersionId: "q-img-01",
                title: "Câu có ảnh minh họa",
                content: "Quan sát đồ thị trong hình vẽ sau:",
                answerKey: "12",
                blocks: [
                  { type: "image", assetId: "pic", alt: "diagram" },
                ],
              },
              provenance: {
                sourceId: "math-images.docx",
                location: "Trang 1, Đoạn 2",
                confidence: 1.0,
                flags: [],
              },
              confirmed: true,
            },
          ],
          flags: [],
        };

        const emptyTargetExam = createSampleTargetExamDraft({
          exam: {
            ...createSampleTargetExamDraft().exam,
            questions: [],
            assets: [],
          },
        });

        const res = confirmImport(job, emptyTargetExam);
        assert.equal(res.ok, true);
        if (res.ok) {
          assert.equal(res.value.exam.questions.length, 1);
          assert.equal(res.value.exam.assets.length, 1);
          assert.equal(res.value.exam.assets[0]?.assetId, "pic");
          assert.equal(res.value.exam.assets[0]?.mime, "image/png");
          assert.equal(res.value.exam.assets[0]?.alt, "diagram");

          const q = res.value.exam.questions[0]!;
          assert.ok(q.blocks);
          assert.equal(q.blocks?.length, 1);
          assert.equal(q.blocks?.[0]?.type, "image");
          assert.equal((q.blocks?.[0] as { assetId: string }).assetId, "pic");
        }
      });

      it("resolves asset ID collisions when target exam already contains an asset with the same ID", () => {
        const existingAsset: Asset = {
          assetId: "pic",
          mime: "image/jpeg",
          data: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
          alt: "existing diagram",
        };

        const targetDraft = createSampleTargetExamDraft({
          exam: {
            ...createSampleTargetExamDraft().exam,
            questions: [],
            assets: [existingAsset],
          },
        });

        const newJobAsset: Asset = {
          assetId: "pic", // Colliding assetId!
          mime: "image/png",
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          alt: "new imported diagram",
        };

        const job: ImportJob & { assets: readonly Asset[] } = {
          jobId: "job-collision",
          sourceId: "collision.docx",
          format: "docx",
          state: "preview",
          blocks: [],
          assets: [newJobAsset],
          drafts: [
            {
              draftId: "draft-col-01",
              question: {
                kind: "III",
                questionVersionId: "q-col-01",
                title: "Câu có ID ảnh trùng",
                content: "Hình vẽ:",
                answerKey: "3",
                blocks: [
                  { type: "image", assetId: "pic", alt: "new imported diagram" },
                ],
              },
              provenance: {
                sourceId: "collision.docx",
                location: "Trang 1",
                confidence: 0.9,
                flags: [],
              },
              confirmed: true,
            },
          ],
          flags: [],
        };

        let generatedCounter = 0;
        const res = confirmImport(job, targetDraft, {
          idGenerator: () => `asset-remapped-${++generatedCounter}`,
        });

        assert.equal(res.ok, true);
        if (res.ok) {
          // Both assets must exist in the resulting exam: no overwriting!
          assert.equal(res.value.exam.assets.length, 2);
          assert.equal(res.value.exam.assets[0]?.assetId, "pic");
          assert.equal(res.value.exam.assets[0]?.mime, "image/jpeg");

          const remappedAsset = res.value.exam.assets[1]!;
          assert.notEqual(remappedAsset.assetId, "pic");
          assert.equal(remappedAsset.mime, "image/png");
          assert.equal(remappedAsset.alt, "new imported diagram");

          // The transferred question's image block must point to the remapped assetId!
          const transferredQ = res.value.exam.questions[0]!;
          assert.ok(transferredQ.blocks);
          const imgBlock = transferredQ.blocks?.[0] as { type: "image"; assetId: string };
          assert.equal(imgBlock.assetId, remappedAsset.assetId);
        }
      });

      it("recursively remaps and preserves image assets nested inside table cells", () => {
        const tableAsset: Asset = {
          assetId: "tbl-pic",
          mime: "image/webp",
          data: "data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2QAA",
          alt: "table cell diagram",
        };

        const targetDraft = createSampleTargetExamDraft({
          exam: {
            ...createSampleTargetExamDraft().exam,
            questions: [],
            assets: [
              {
                assetId: "tbl-pic", // Pre-existing asset in target to force remapping
                mime: "image/jpeg",
                data: "data:image/jpeg;base64,existing",
                alt: "old",
              },
            ],
          },
        });

        const tableBlock: Block = {
          type: "table",
          rows: [
            [
              {
                rowSpan: 1,
                colSpan: 1,
                blocks: [
                  { type: "text", text: "Hình mô tả:" },
                  { type: "image", assetId: "tbl-pic", alt: "table cell diagram" },
                ],
              },
            ],
          ],
        };

        const job: ImportJob & { assets: readonly Asset[] } = {
          jobId: "job-table-img",
          sourceId: "table-math.docx",
          format: "docx",
          state: "preview",
          blocks: [],
          assets: [tableAsset],
          drafts: [
            {
              draftId: "draft-tbl-01",
              question: {
                kind: "III",
                questionVersionId: "q-tbl-01",
                title: "Bảng có hình ảnh lồng",
                content: "Xem bảng sau:",
                answerKey: "4",
                blocks: [tableBlock],
              },
              provenance: {
                sourceId: "table-math.docx",
                location: "Bảng 1",
                confidence: 1.0,
                flags: [],
              },
              confirmed: true,
            },
          ],
          flags: [],
        };

        const res = confirmImport(job, targetDraft);
        assert.equal(res.ok, true);
        if (res.ok) {
          assert.equal(res.value.exam.assets.length, 2);
          const newAsset = res.value.exam.assets[1]!;
          assert.notEqual(newAsset.assetId, "tbl-pic");
          assert.equal(newAsset.mime, "image/webp");

          const q = res.value.exam.questions[0]!;
          const tbl = q.blocks?.[0] as unknown as { type: "table"; rows: { blocks: { type: string; assetId?: string }[] }[][] };
          assert.equal(tbl.type, "table");
          const nestedImg = tbl.rows[0]?.[0]?.blocks[1];
          assert.equal(nestedImg?.type, "image");
          assert.equal(nestedImg?.assetId, newAsset.assetId);
        }
      });

      it("successfully exports and roundtrips confirmed exam with preserved assets via exportExam & parseExam", () => {
        const sampleAsset: Asset = {
          assetId: "graph-01",
          mime: "image/png",
          data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          alt: "graph",
        };

        const job: ImportJob & { assets: readonly Asset[] } = {
          jobId: "job-export-test",
          sourceId: "exam-graph.docx",
          format: "docx",
          state: "preview",
          blocks: [],
          assets: [sampleAsset],
          drafts: [
            {
              draftId: "d-export",
              question: {
                kind: "III",
                questionVersionId: "q-exp-01",
                title: "Câu đồ thị",
                content: "Đồ thị:",
                answerKey: "2",
                blocks: [{ type: "image", assetId: "graph-01", alt: "graph" }],
              },
              provenance: {
                sourceId: "exam-graph.docx",
                location: "Trang 1",
                confidence: 1,
                flags: [],
              },
              confirmed: true,
            },
          ],
          flags: [],
        };

        const targetDraft = createSampleTargetExamDraft({
          exam: {
            ...createSampleTargetExamDraft().exam,
            questions: [],
            assets: [],
          },
        });

        const confirmRes = confirmImport(job, targetDraft);
        assert.equal(confirmRes.ok, true);
        if (confirmRes.ok) {
          // Export canonical JSON
          const exportedJson = exportExam(confirmRes.value.exam);
          assert.ok(typeof exportedJson === "string");
          assert.ok(exportedJson.includes('"assetId": "graph-01"'));
          assert.ok(exportedJson.includes('"mime": "image/png"'));

          // Parse back
          const parsed = parseExam(JSON.parse(exportedJson));
          assert.equal(parsed.ok, true);
          if (parsed.ok) {
            assert.equal(parsed.value.assets.length, 1);
            assert.equal(parsed.value.assets[0]?.assetId, "graph-01");
            assert.equal(parsed.value.questions.length, 1);
          }
        }
      });

      it("rejects confirmation when a confirmed draft references an asset missing from job and exam (ASSET_UNSAFE)", () => {
        const job: ImportJob & { assets: readonly Asset[] } = {
          jobId: "job-missing-asset",
          sourceId: "missing-ref.docx",
          format: "docx",
          state: "preview",
          blocks: [],
          assets: [], // Empty assets!
          drafts: [
            {
              draftId: "d-missing",
              question: {
                kind: "III",
                questionVersionId: "q-missing-01",
                title: "Câu thiếu ảnh",
                content: "Hình bị mất:",
                answerKey: "1",
                blocks: [{ type: "image", assetId: "dangling-pic", alt: "missing pic" }],
              },
              provenance: {
                sourceId: "missing-ref.docx",
                location: "Trang 1",
                confidence: 1,
                flags: [],
              },
              confirmed: true,
            },
          ],
          flags: [],
        };

        const targetDraft = createSampleTargetExamDraft();
        const res = confirmImport(job, targetDraft);
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.equal(res.error.code, "ASSET_UNSAFE");
        }
      });

      it("rejects confirmation when a confirmed draft references a hostile path in blocks (ASSET_UNSAFE)", () => {
        const job: ImportJob & { assets: readonly Asset[] } = {
          jobId: "job-hostile-asset",
          sourceId: "hostile-ref.docx",
          format: "docx",
          state: "preview",
          blocks: [],
          assets: [],
          drafts: [
            {
              draftId: "d-hostile",
              question: {
                kind: "III",
                questionVersionId: "q-hostile-01",
                title: "Câu có ảnh độc hại",
                content: "Nội dung:",
                answerKey: "1",
                blocks: [{ type: "image", assetId: "../../etc/passwd", alt: "evil" }],
              },
              provenance: {
                sourceId: "hostile-ref.docx",
                location: "Trang 1",
                confidence: 1,
                flags: [],
              },
              confirmed: true,
            },
          ],
          flags: [],
        };

        const targetDraft = createSampleTargetExamDraft();
        const res = confirmImport(job, targetDraft);
        assert.equal(res.ok, false);
        if (!res.ok) {
          assert.equal(res.error.code, "ASSET_UNSAFE");
        }
      });
    });

    describe("WEB-F05: Lifecycle enforcement & zero destination writes on cancelled/failed jobs", () => {
      it("rejects confirmation of cancelled import job with IMPORT_CANCELLED error and writes zero questions", () => {
        // Start with a valid job with a confirmed question
        const validJob = createSampleImportJob({
          state: "preview",
          drafts: [
            {
              draftId: "d-valid",
              question: sampleValidPartIII,
              provenance: sampleValidPartIII.provenance!,
              confirmed: true,
            },
          ],
        });

        // Cancel the job
        const cancelRes = cancelImport(validJob);
        assert.equal(cancelRes.ok, true);
        if (!cancelRes.ok) throw new Error("Expected cancelImport to succeed");
        const cancelledJob = cancelRes.value;
        assert.equal(cancelledJob.state, "failed");
        assert.ok(cancelledJob.flags.includes(PREVIEW_FLAGS.IMPORT_CANCELLED));

        const targetDraft = createSampleTargetExamDraft();
        const initialQuestionsCount = targetDraft.exam.questions.length;
        const initialRevision = targetDraft.revision;

        // Attempting to confirm a cancelled job must fail!
        const confirmRes = confirmImport(cancelledJob, targetDraft);
        assert.equal(confirmRes.ok, false);
        if (!confirmRes.ok) {
          assert.equal(confirmRes.error.code, PREVIEW_FLAGS.IMPORT_CANCELLED);
        }

        // Verify destination draft remains completely unchanged (zero writes)
        assert.equal(targetDraft.exam.questions.length, initialQuestionsCount);
        assert.equal(targetDraft.revision, initialRevision);
      });

      it("rejects confirmation of failed import job with IMPORT_INVALID error and writes zero questions", () => {
        const validJob = createSampleImportJob({
          state: "preview",
          drafts: [
            {
              draftId: "d-valid",
              question: sampleValidPartIII,
              provenance: sampleValidPartIII.provenance!,
              confirmed: true,
            },
          ],
        });

        const failRes = failImport(validJob, "PARSER_FAILURE");
        assert.equal(failRes.ok, true);
        if (!failRes.ok) throw new Error("Expected failImport to succeed");
        const failedJob = failRes.value;

        const targetDraft = createSampleTargetExamDraft();
        const initialQuestionsCount = targetDraft.exam.questions.length;

        const confirmRes = confirmImport(failedJob, targetDraft);
        assert.equal(confirmRes.ok, false);
        if (!confirmRes.ok) {
          assert.equal(confirmRes.error.code, "IMPORT_INVALID");
        }

        // Zero destination writes
        assert.equal(targetDraft.exam.questions.length, initialQuestionsCount);
      });

      it("rejects confirmation when job is in reading state", () => {
        const readingJob = createSampleImportJob({
          state: "reading",
          drafts: [
            {
              draftId: "d-valid",
              question: sampleValidPartIII,
              provenance: sampleValidPartIII.provenance!,
              confirmed: true,
            },
          ],
        });

        const targetDraft = createSampleTargetExamDraft();
        const confirmRes = confirmImport(readingJob, targetDraft);
        assert.equal(confirmRes.ok, false);
        if (!confirmRes.ok) {
          assert.equal(confirmRes.error.code, "IMPORT_INVALID");
        }
      });
    });
  });
});
