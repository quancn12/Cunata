import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mount } from "../../src/import/preview/view.ts";
import type { ImportJob, ExamDraft } from "../../src/import/preview/types.ts";
import { createMockDocument, MockElement, MockEvent } from "../ui/core/dom-mock.ts";
import { createSampleImportJob, createSampleTargetExamDraft } from "./fixtures.ts";

describe("WEB-W3-IMPORT-PREVIEW: View & Mount Interactivity Tests", () => {
  it("mounts successfully, renders header, summary badges, and warning banners", () => {
    const doc = createMockDocument();
    const root = doc.createElement("div") as unknown as HTMLElement;

    const job = createSampleImportJob();
    let changedJob: ImportJob | null = null;

    const unmount = mount(root, job, {
      onJobChange: (j) => {
        changedJob = j as ImportJob;
      },
    });

    const rootEl = root as unknown as MockElement;
    assert.ok(rootEl.childNodes.length > 0);

    const titleEl = rootEl.querySelector(".preview-title");
    assert.ok(titleEl);
    assert.ok(titleEl.textContent.includes(job.sourceId));

    // Stats badges
    const totalBadge = rootEl.querySelector(".stat-badge-total");
    assert.ok(totalBadge);
    assert.ok(totalBadge.textContent.includes(`Tổng câu: ${job.drafts.length}`));

    const missingBadge = rootEl.querySelector(".stat-badge-missing");
    assert.ok(missingBadge);

    // Warning banner should be present due to missing keys
    const warningBanner = rootEl.querySelector(".preview-warning-banner");
    assert.ok(warningBanner);

    unmount();
    assert.equal(rootEl.childNodes.length, 0);
  });

  it("filters drafts by section (Kind) and search keyword", () => {
    const doc = createMockDocument();
    const root = doc.createElement("div") as unknown as HTMLElement;
    const job = createSampleImportJob();

    const unmount = mount(root, job);
    const rootEl = root as unknown as MockElement;

    // Filter by Part I
    const sectionSelect = rootEl.querySelector(".preview-filter-select") as MockElement;
    assert.ok(sectionSelect);
    sectionSelect.value = "I";
    sectionSelect.dispatchEvent(new MockEvent("change"));

    let cards = rootEl.querySelectorAll(".preview-draft-card");
    for (const card of cards) {
      const badge = card.querySelector(".kind-badge");
      assert.ok(badge?.textContent.includes("Phần I"));
    }

    // Filter by Part II
    sectionSelect.value = "II";
    sectionSelect.dispatchEvent(new MockEvent("change"));
    cards = rootEl.querySelectorAll(".preview-draft-card");
    for (const card of cards) {
      const badge = card.querySelector(".kind-badge");
      assert.ok(badge?.textContent.includes("Phần II"));
    }

    // Reset section filter and test search
    sectionSelect.value = "all";
    sectionSelect.dispatchEvent(new MockEvent("change"));

    const searchInput = rootEl.querySelector(".preview-search-input") as MockElement;
    assert.ok(searchInput);
    searchInput.value = "hàm số";
    searchInput.dispatchEvent(new MockEvent("input"));

    cards = rootEl.querySelectorAll(".preview-draft-card");
    assert.ok(cards.length >= 1);
    for (const card of cards) {
      assert.ok(card.textContent.toLowerCase().includes("hàm số"));
    }

    unmount();
  });

  it("toggles draft confirmation checkbox and triggers onJobChange", () => {
    const doc = createMockDocument();
    const root = doc.createElement("div") as unknown as HTMLElement;
    const job = createSampleImportJob();

    let latestJob: ImportJob | null = null;
    const unmount = mount(root, job, {
      onJobChange: (j) => {
        latestJob = j as ImportJob;
      },
    });

    const rootEl = root as unknown as MockElement;
    const firstCheckbox = rootEl.querySelector(".draft-checkbox-input") as MockElement;
    assert.ok(firstCheckbox);
    assert.equal((firstCheckbox as any).checked, false);

    // Toggle to checked
    (firstCheckbox as any).checked = true;
    firstCheckbox.dispatchEvent(new MockEvent("change"));

    assert.ok(latestJob);
    assert.equal((latestJob as ImportJob).drafts[0]?.confirmed, true);

    unmount();
  });

  it("interactively selects Part I option and updates correctOptionId", () => {
    const doc = createMockDocument();
    const root = doc.createElement("div") as unknown as HTMLElement;
    const job = createSampleImportJob();

    let latestJob: ImportJob | null = null;
    const unmount = mount(root, job, {
      onJobChange: (j) => {
        latestJob = j as ImportJob;
      },
    });

    const rootEl = root as unknown as MockElement;
    const radio = rootEl.querySelector(".draft-option-radio") as MockElement;
    assert.ok(radio);

    (radio as any).checked = true;
    radio.dispatchEvent(new MockEvent("change"));

    assert.ok(latestJob);
    const q1 = (latestJob as ImportJob).drafts[0]?.question as any;
    assert.equal(q1.correctOptionId, radio.value);

    unmount();
  });

  it("interactively toggles Part II statement True/False button", () => {
    const doc = createMockDocument();
    const root = doc.createElement("div") as unknown as HTMLElement;
    const job = createSampleImportJob();

    let latestJob: ImportJob | null = null;
    const unmount = mount(root, job, {
      onJobChange: (j) => {
        latestJob = j as ImportJob;
      },
    });

    const rootEl = root as unknown as MockElement;
    // Switch to Part II filter
    const sectionSelect = rootEl.querySelector(".preview-filter-select") as MockElement;
    sectionSelect.value = "II";
    sectionSelect.dispatchEvent(new MockEvent("change"));

    const btnTrue = rootEl.querySelector(".stmt-toggle-btn") as MockElement;
    assert.ok(btnTrue);
    btnTrue.dispatchEvent(new MockEvent("click"));

    assert.ok(latestJob);
    const q2 = (latestJob as ImportJob).drafts[1]?.question as any;
    assert.equal(q2.statements[0]?.answer, true);

    unmount();
  });

  it("handles batch confirm-all-valid and unconfirm-all buttons", () => {
    const doc = createMockDocument();
    const root = doc.createElement("div") as unknown as HTMLElement;
    const job = createSampleImportJob();

    let latestJob: ImportJob | null = null;
    const unmount = mount(root, job, {
      onJobChange: (j) => {
        latestJob = j as ImportJob;
      },
    });

    const rootEl = root as unknown as MockElement;
    const buttons = rootEl.querySelectorAll(".preview-btn");
    const btnConfirmValid = Array.from(buttons).find((b) => b.textContent.includes("Xác nhận tất cả hợp lệ"));
    const btnUnconfirmAll = Array.from(buttons).find((b) => b.textContent.includes("Bỏ xác nhận tất cả"));

    assert.ok(btnConfirmValid);
    assert.ok(btnUnconfirmAll);

    // Click confirm valid
    btnConfirmValid.dispatchEvent(new MockEvent("click"));
    assert.ok(latestJob);

    // Click unconfirm all
    btnUnconfirmAll.dispatchEvent(new MockEvent("click"));
    assert.ok(latestJob);
    for (const d of (latestJob as ImportJob).drafts) {
      assert.equal(d.confirmed, false);
    }

    unmount();
  });

  it("handles Confirm Import action and calls onConfirm with updated ExamDraft", () => {
    const doc = createMockDocument();
    const root = doc.createElement("div") as unknown as HTMLElement;
    let job = createSampleImportJob();
    const targetDraft = createSampleTargetExamDraft();

    // Prepare a confirmed valid draft in job
    job = {
      ...job,
      drafts: [
        {
          draftId: "valid-draft-01",
          question: {
            kind: "III",
            questionVersionId: "q-p3-view",
            title: "Câu 3 view",
            content: "Nội dung...",
            answerKey: "1,5",
          },
          provenance: {
            sourceId: "test.docx",
            location: "Trang 1",
            confidence: 1,
            flags: [],
          },
          confirmed: true,
        },
      ],
    };

    let confirmedExam: ExamDraft | null = null;
    let cancelCalled = false;

    const unmount = mount(
      root,
      {
        job,
        targetExamDraft: targetDraft,
      },
      {
        onConfirm: (draft) => {
          confirmedExam = draft as ExamDraft;
        },
        onCancel: () => {
          cancelCalled = true;
        },
      },
    );

    const rootEl = root as unknown as MockElement;
    const btnConfirmImport = rootEl.querySelector(".btn-success") as MockElement;
    assert.ok(btnConfirmImport);

    btnConfirmImport.dispatchEvent(new MockEvent("click"));
    assert.ok(confirmedExam);
    assert.equal((confirmedExam as ExamDraft).exam.questions.length, targetDraft.exam.questions.length + 1);

    // Test Cancel button
    const btnCancel = rootEl.querySelector(".btn-danger") as MockElement;
    assert.ok(btnCancel);
    btnCancel.dispatchEvent(new MockEvent("click"));
    assert.equal(cancelCalled, true);

    unmount();
  });
});
