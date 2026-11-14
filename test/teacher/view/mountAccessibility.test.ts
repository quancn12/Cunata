import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { mount, createTeacherView } from "../../../src/teacher/view.ts";
import { createTestDocument, TestDOMEvent } from "./dom-helper.ts";
import {
  createTestExam,
  createTestQuestionI,
  createTestQuestionII,
  createTestQuestionIII,
} from "./fixtures.ts";

describe("WEB-W2-TEACHER-VIEW: Mount Convention, Accessibility & AC Guarantees", () => {
  it("mounts builder UI into root and renders AC notices: no fake auth and D08 security disclaimer", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const exam = createTestExam();
    const unmount = mount(root as any, exam);

    // Verify root classes and ARIA attributes
    assert.ok(root.classList.contains("cunata-teacher-view"));
    assert.ok(root.classList.contains("cunata-ui"));
    assert.equal(root.getAttribute("role"), "main");
    assert.equal(root.getAttribute("aria-label"), "Trình soạn thảo đề thi GDPT 2018");

    // AC Guarantee 1: Local authoring tool badge (No fake authentication)
    const authBadge = root.querySelector(".cunata-auth-badge");
    assert.notEqual(authBadge, null);
    assert.equal(authBadge?.getAttribute("role"), "status");
    assert.ok(authBadge?.textContent.includes("Chưa đăng nhập / Không phân quyền người dùng"));

    // AC Guarantee 2: D08 security advisory notice (No hidden-key guarantee while D08 remains open)
    const d08Banner = root.querySelector(".cunata-d08-banner");
    assert.notEqual(d08Banner, null);
    assert.equal(d08Banner?.getAttribute("role"), "note");
    assert.ok(d08Banner?.textContent.includes("D08"));
    assert.ok(d08Banner?.textContent.includes("không thể cam kết giấu đáp án"));

    // Title input rendered
    const titleInput = root.querySelector("#field-title") as any;
    assert.notEqual(titleInput, null);
    assert.equal(titleInput?.value, "Đề thi thử Toán GDPT 2018");

    // Unmount cleanup
    unmount();
    assert.equal(root.textContent, "");
  });

  it("renders accessible path validation errors with role='alert' and aria-invalid", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const exam = createTestExam("exam-inv", "v1.0.0", []);
    const controller = createTeacherView({ initialExam: exam });
    // Invalidate title
    controller.updateTitle("");
    controller.validate();

    const unmount = mount(root as any, controller);

    // Validation summary must have role="alert" and aria-live="assertive"
    const summary = root.querySelector("#validation-summary");
    assert.notEqual(summary, null);
    assert.equal(summary?.getAttribute("role"), "alert");
    assert.equal(summary?.getAttribute("aria-live"), "assertive");
    assert.ok(summary?.textContent.toLowerCase().includes("tiêu đề"));

    // Invalid input field must have aria-invalid="true" and aria-describedby="error-title"
    const titleInput = root.querySelector("#field-title");
    assert.equal(titleInput?.getAttribute("aria-invalid"), "true");
    assert.equal(titleInput?.getAttribute("aria-describedby"), "error-title");

    unmount();
  });

  it("toggles between edit and preview mode via interactive buttons", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const exam = createTestExam();
    const controller = createTeacherView({ initialExam: exam });

    let modeChangeRecorded: string | null = null;
    const actions = {
      onModeChange: (mode: any) => {
        modeChangeRecorded = mode;
      },
    };

    const unmount = mount(root as any, controller, actions);

    const btnEdit = root.querySelector("#btn-mode-edit");
    const btnPreview = root.querySelector("#btn-mode-preview");
    assert.notEqual(btnEdit, null);
    assert.notEqual(btnPreview, null);

    assert.equal(btnEdit?.getAttribute("aria-pressed"), "true");
    assert.equal(btnPreview?.getAttribute("aria-pressed"), "false");

    // Click Preview button
    btnPreview?.click();
    assert.equal(controller.getViewMode(), "preview");
    assert.equal(modeChangeRecorded, "preview");

    // DOM must re-render into preview presentation
    const previewContainer = root.querySelector(".cunata-preview-container");
    assert.notEqual(previewContainer, null);

    // In preview mode, btnPreview has aria-pressed="true"
    const btnPreviewAfter = root.querySelector("#btn-mode-preview");
    assert.equal(btnPreviewAfter?.getAttribute("aria-pressed"), "true");

    // Click Edit button
    const btnEditAfter = root.querySelector("#btn-mode-edit");
    btnEditAfter?.click();
    assert.equal(controller.getViewMode(), "edit");
    assert.equal(modeChangeRecorded, "edit");

    unmount();
  });

  it("adds a question and duplicates a question through DOM buttons", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const exam = createTestExam("exam-dom-ops", "v1.0.0", [createTestQuestionI("q1")]);
    const controller = createTeacherView({ initialExam: exam });

    const unmount = mount(root as any, controller);

    assert.equal(controller.getDraft().exam.questions.length, 1);

    // Click Add Part II button
    const btnAddII = root.querySelector("#btn-add-q-II");
    assert.notEqual(btnAddII, null);
    btnAddII?.click();

    assert.equal(controller.getDraft().exam.questions.length, 2);
    assert.equal(controller.getDraft().exam.questions[1]!.kind, "II");

    // Click Duplicate on first question
    const q1Row = root.querySelector("#q-item-q1");
    assert.notEqual(q1Row, null);
    const btns = q1Row?.querySelectorAll("button") ?? [];
    const dupBtn = btns.find((b) => b.textContent.includes("Nhân bản"));
    assert.notEqual(dupBtn, undefined);
    dupBtn?.click();

    assert.equal(controller.getDraft().exam.questions.length, 3);

    unmount();
  });

  it("triggers JSON export action through DOM export button", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const exam = createTestExam();
    const exportedRef = { data: "" };
    const actions = {
      onExport: (json: any) => {
        exportedRef.data = String(json);
      },
    };

    const unmount = mount(root as any, exam, actions);

    const btnExport = root.querySelector("#btn-export-json");
    assert.notEqual(btnExport, null);
    btnExport?.click();

    assert.ok(exportedRef.data.includes('"schemaVersion": "web-exam-v1"'));

    unmount();
  });

  it("protects Vietnamese IME typing during composition in input fields", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const exam = createTestExam();
    const controller = createTeacherView({ initialExam: exam });

    const unmount = mount(root as any, controller);

    const titleInput = root.querySelector("#field-title") as any;
    assert.notEqual(titleInput, null);

    // 1. IME compositionstart
    titleInput.dispatchEvent(new TestDOMEvent("compositionstart"));

    // 2. Typing intermediate syllables (e.g. 'Toa')
    titleInput.value = "Toa";
    titleInput.dispatchEvent(new TestDOMEvent("input", { isComposing: true }));

    // Draft title must NOT be updated yet while composing
    assert.equal(controller.getDraft().exam.title, "Đề thi thử Toán GDPT 2018");

    // 3. IME compositionend with full accent: 'Toán'
    titleInput.value = "Đề thi Toán GDPT 2018 mới";
    titleInput.dispatchEvent(new TestDOMEvent("compositionend"));

    // Now draft title must be updated
    assert.equal(controller.getDraft().exam.title, "Đề thi Toán GDPT 2018 mới");

    unmount();
  });
});
