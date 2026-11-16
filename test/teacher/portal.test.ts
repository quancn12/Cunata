import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  mountTeacherPortal,
  getStoredTeacherPassword,
  setStoredTeacherPassword,
  clearStoredTeacherPassword,
  TEACHER_SESSION_PW_KEY,
} from "../../src/teacher/portal.ts";
import type {
  AppsScriptClient,
  TeacherPortalDeps,
  TeacherExamEntry,
  AsResult,
  PublishedExamMeta,
} from "../../src/teacher/portal.ts";

import { createTestDocument, TestDOMEvent, TestKeyboardEvent } from "./view/dom-helper.ts";

// Simple in-memory mock for Storage (sessionStorage / localStorage)
class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

describe("FEAT-teacher: Teacher Portal (mountTeacherPortal)", () => {
  let originalSessionStorage: any;
  let originalLocalStorage: any;
  let mockSession: MockStorage;
  let mockLocal: MockStorage;

  beforeEach(() => {
    mockSession = new MockStorage();
    mockLocal = new MockStorage();

    originalSessionStorage = (globalThis as any).sessionStorage;
    originalLocalStorage = (globalThis as any).localStorage;

    (globalThis as any).sessionStorage = mockSession;
    (globalThis as any).localStorage = mockLocal;
  });

  afterEach(() => {
    (globalThis as any).sessionStorage = originalSessionStorage;
    (globalThis as any).localStorage = originalLocalStorage;
  });

  function createMockClient(overrides: Partial<AppsScriptClient> = {}): AppsScriptClient {
    return {
      configured: true,
      async listExams(): Promise<AsResult<PublishedExamMeta[]>> {
        return { ok: true, value: [] };
      },
      async getExam(_id: string): Promise<AsResult<unknown>> {
        return { ok: true, value: {} };
      },
      async teacherLogin(password: string): Promise<AsResult<true>> {
        if (password === "MatKhau-Chuan-123") {
          return { ok: true, value: true };
        }
        return { ok: false, code: "UNAUTHORIZED", message: "Sai mật khẩu giáo viên" };
      },
      async publishExam(_password: string, _exam: unknown): Promise<AsResult<{ examId: string; revision: number }>> {
        return { ok: true, value: { examId: "exam-published-01", revision: 2 } };
      },
      async unpublishExam(_password: string, _examId: string): Promise<AsResult<true>> {
        return { ok: true, value: true };
      },
      ...overrides,
    };
  }

  it("mounts into root and sets up accessible modal attributes", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const client = createMockClient();
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        return [];
      },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    assert.ok(portal);
    assert.equal(typeof portal.open, "function");
    assert.equal(typeof portal.close, "function");

    const modal = root.querySelector("#teacherModal");
    assert.ok(modal, "Modal element #teacherModal should be created inside root");
    assert.equal(modal?.getAttribute("role"), "dialog");
    assert.equal(modal?.getAttribute("aria-modal"), "true");
    assert.equal(modal?.style.display, "none", "Modal should initially be hidden");

    portal.open();
    assert.equal(modal?.style.display, "flex", "Modal should be shown on open()");

    portal.close();
    assert.equal(modal?.style.display, "none", "Modal should be hidden on close()");

    portal.dispose();
  });

  it("displays 'chưa cấu hình' when client.configured is false and prevents login", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const client = createMockClient({ configured: false });
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        return [];
      },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();

    const teacherLogin = root.querySelector("#teacherLogin");
    assert.ok(teacherLogin);
    assert.equal(teacherLogin?.style.display, "block");
    assert.match(
      teacherLogin?.textContent ?? "",
      /chưa cấu hình/i,
      "Should contain 'chưa cấu hình' notice when unconfigured"
    );

    const pwInput = root.querySelector("#teacherPassword");
    assert.equal(pwInput, null, "Should not render password input when unconfigured");

    const teacherPanel = root.querySelector("#teacherPanel");
    assert.equal(teacherPanel?.style.display, "none", "#teacherPanel must remain hidden");

    portal.close();
    portal.dispose();
  });

  it("configured state: shows login form, validates empty password, rejects wrong password", async () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    let loginCalls: string[] = [];
    const client = createMockClient({
      async teacherLogin(password: string) {
        loginCalls.push(password);
        if (password === "MatKhau-Dung") {
          return { ok: true, value: true };
        }
        return { ok: false, code: "UNAUTHORIZED", message: "Mật khẩu giáo viên không chính xác" };
      },
    });

    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        return [];
      },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();

    const teacherLogin = root.querySelector("#teacherLogin");
    const teacherPanel = root.querySelector("#teacherPanel");
    const pwInput = root.querySelector("#teacherPassword") as any;
    const btnLogin = root.querySelector("#btnTeacherLogin") as any;
    const loginError = root.querySelector("#teacherLoginError") as any;

    assert.ok(teacherLogin);
    assert.ok(teacherPanel);
    assert.ok(pwInput);
    assert.ok(btnLogin);
    assert.ok(loginError);

    assert.equal(teacherLogin?.style.display, "block");
    assert.equal(teacherPanel?.style.display, "none");

    // 1. Submit empty password
    pwInput.value = "";
    btnLogin.click();
    assert.match(loginError.textContent, /Vui lòng nhập mật khẩu/);
    assert.equal(loginCalls.length, 0, "Should not call client.teacherLogin on empty password");

    // 2. Submit wrong password
    pwInput.value = "sai-mat-khau";
    btnLogin.click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.equal(loginCalls.length, 1);
    assert.equal(loginCalls[0], "sai-mat-khau");
    assert.match(loginError.textContent, /không chính xác/);
    assert.equal(teacherPanel?.style.display, "none", "Panel must remain hidden on bad password");
    assert.equal(mockSession.getItem(TEACHER_SESSION_PW_KEY), null, "Must not store bad password in sessionStorage");

    portal.close();
    portal.dispose();
  });

  it("successful login: stores password in sessionStorage only, displays #teacherPanel with exam rows", async () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const PW = "MatKhau-Chuan-123";
    const client = createMockClient();

    const loadedStaticExam = { examId: "static-01", title: "Đề Tĩnh 01" };
    const loadedTeacherExam = { examId: "teacher-01", title: "Đề Giáo Viên 01" };

    const examEntries: TeacherExamEntry[] = [
      {
        id: "static-01",
        title: "Đề Tĩnh 01",
        source: "static",
        questionCount: 40,
        durationMinutes: 50,
        async load() {
          return loadedStaticExam;
        },
      },
      {
        id: "teacher-01",
        title: "Đề Giáo Viên 01",
        source: "teacher",
        questionCount: 28,
        durationMinutes: 50,
        async load() {
          return loadedTeacherExam;
        },
      },
    ];

    let listAllExamsCalled = 0;
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        listAllExamsCalled++;
        return examEntries;
      },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();

    const pwInput = root.querySelector("#teacherPassword") as any;
    const btnLogin = root.querySelector("#btnTeacherLogin") as any;
    const teacherLogin = root.querySelector("#teacherLogin");
    const teacherPanel = root.querySelector("#teacherPanel");

    pwInput.value = PW;
    btnLogin.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Password must be in sessionStorage
    assert.equal(mockSession.getItem(TEACHER_SESSION_PW_KEY), PW, "Password must be stored in sessionStorage");
    // Password must NEVER be in localStorage
    assert.equal(mockLocal.getItem(TEACHER_SESSION_PW_KEY), null, "Password must NOT be stored in localStorage");
    assert.equal(mockLocal.length, 0);

    // Visibility toggles
    assert.equal(teacherLogin?.style.display, "none", "#teacherLogin should be hidden after login");
    assert.equal(teacherPanel?.style.display, "block", "#teacherPanel should be shown after login");

    // Verify rendered rows
    const rows = root.querySelectorAll(".teacher-exam-row");
    assert.equal(rows.length, 2, "Should render 2 exam rows");

    // Row 1: static exam
    const row0 = rows[0] as any;
    assert.equal(row0.getAttribute("data-exam-id"), "static-01");
    assert.ok(row0.querySelector(".btn-teacher-edit"), "Static exam must have .btn-teacher-edit");
    assert.equal(row0.querySelector(".btn-teacher-unpublish"), null, "Static exam must NOT have .btn-teacher-unpublish");

    // Row 2: teacher exam
    const row1 = rows[1] as any;
    assert.equal(row1.getAttribute("data-exam-id"), "teacher-01");
    assert.equal(row1.getAttribute("data-exam-source"), "teacher");
    assert.ok(row1.querySelector(".btn-teacher-edit"), "Teacher exam must have .btn-teacher-edit");
    assert.ok(row1.querySelector(".btn-teacher-unpublish"), "Teacher exam MUST have .btn-teacher-unpublish");

    portal.close();
    portal.dispose();
  });

  it(".btn-teacher-edit calls entry.load(), closes modal, and passes exam + onPublish to deps.openBuilder", async () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const PW = "MatKhau-Chuan-123";
    mockSession.setItem(TEACHER_SESSION_PW_KEY, PW);

    let loadCalled = false;
    const fullExamData = { examId: "hoa-demo", title: "Hóa 12 Demo", questions: [] };

    let builderOpenedWith: { exam: unknown | null; opts: any } | null = null;
    let publishResultReturned: any = null;

    const client = createMockClient({
      async publishExam(password: string, exam: unknown) {
        assert.equal(password, PW, "publishExam must receive password from sessionStorage");
        return { ok: true, value: { examId: (exam as any).examId, revision: 3 } };
      },
    });

    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        return [
          {
            id: "hoa-demo",
            title: "Hóa 12 Demo",
            source: "static",
            async load() {
              loadCalled = true;
              return fullExamData;
            },
          },
        ];
      },
      openBuilder(exam, opts) {
        builderOpenedWith = { exam, opts };
      },
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const modal = root.querySelector("#teacherModal");
    assert.equal(modal?.style.display, "flex");

    const rows = root.querySelectorAll(".teacher-exam-row");
    const targetRow = rows.find((r) => r.getAttribute("data-exam-id") === "hoa-demo") as any;
    assert.ok(targetRow, "Row with data-exam-id='hoa-demo' must exist");

    const editBtn = targetRow.querySelector(".btn-teacher-edit") as any;
    assert.ok(editBtn, ".btn-teacher-edit must exist");

    editBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(loadCalled, true, "entry.load() must be called");
    assert.equal(modal?.style.display, "none", "Modal must be closed when opening builder");
    assert.ok(builderOpenedWith, "deps.openBuilder must be called");
    assert.deepEqual((builderOpenedWith as any).exam, fullExamData);
    assert.equal(typeof (builderOpenedWith as any).opts.onPublish, "function");

    // Test onPublish callback
    const res = await (builderOpenedWith as any).opts.onPublish(fullExamData);
    assert.equal(res.ok, true);
    assert.equal(res.value.revision, 3);

    portal.dispose();
  });

  it(".btn-teacher-unpublish calls client.unpublishExam with password and refreshes list", async () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const PW = "MatKhau-Chuan-123";
    mockSession.setItem(TEACHER_SESSION_PW_KEY, PW);

    let unpublishCalledWith: { password: string; examId: string } | null = null;
    let listCount = 0;

    let examsList: TeacherExamEntry[] = [
      {
        id: "gv-de-01",
        title: "Đề Giáo Viên 01",
        source: "teacher",
        async load() {
          return {};
        },
      },
    ];

    const client = createMockClient({
      async unpublishExam(password: string, examId: string) {
        unpublishCalledWith = { password, examId };
        examsList = []; // Remove exam after unpublishing
        return { ok: true, value: true };
      },
    });

    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        listCount++;
        return examsList;
      },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(listCount, 1);
    const rows = root.querySelectorAll(".teacher-exam-row");
    const targetRow = rows.find((r) => r.getAttribute("data-exam-id") === "gv-de-01") as any;
    assert.ok(targetRow, "Row with data-exam-id='gv-de-01' must exist");

    const unpubBtn = targetRow.querySelector(".btn-teacher-unpublish") as any;
    assert.ok(unpubBtn, ".btn-teacher-unpublish must exist for teacher source");

    unpubBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.ok(unpublishCalledWith);
    assert.equal((unpublishCalledWith as any).password, PW, "unpublishExam must receive password from sessionStorage");
    assert.equal((unpublishCalledWith as any).examId, "gv-de-01");

    // Must have refreshed list
    assert.equal(listCount, 2);
    const remainingRows = root.querySelectorAll(".teacher-exam-row");
    assert.equal(remainingRows.length, 0, "Exam row must be removed after unpublishing");

    portal.dispose();
  });

  it("#btnTeacherNewExam closes modal and calls openBuilder(null, { onPublish })", async () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const PW = "MatKhau-Chuan-123";
    mockSession.setItem(TEACHER_SESSION_PW_KEY, PW);

    let builderArgs: { exam: unknown | null; opts: any } | null = null;
    const client = createMockClient();

    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        return [];
      },
      openBuilder(exam, opts) {
        builderArgs = { exam, opts };
      },
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const modal = root.querySelector("#teacherModal");
    assert.equal(modal?.style.display, "flex");

    const newBtn = root.querySelector("#btnTeacherNewExam") as any;
    assert.ok(newBtn, "#btnTeacherNewExam must exist");

    newBtn.click();
    assert.equal(modal?.style.display, "none", "Modal must close on clicking New Exam");
    assert.ok(builderArgs);
    assert.equal((builderArgs as any).exam, null, "First argument to openBuilder must be null");
    assert.equal(typeof (builderArgs as any).opts.onPublish, "function");

    portal.dispose();
  });

  it("already logged in: opening portal bypasses login and shows #teacherPanel immediately", async () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const PW = "MatKhau-Chuan-123";
    mockSession.setItem(TEACHER_SESSION_PW_KEY, PW);

    let listCount = 0;
    const client = createMockClient();
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        listCount++;
        return [
          {
            id: "de-01",
            title: "Đề 01",
            source: "static",
            async load() {
              return {};
            },
          },
        ];
      },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const teacherLogin = root.querySelector("#teacherLogin");
    const teacherPanel = root.querySelector("#teacherPanel");

    assert.equal(teacherLogin?.style.display, "none", "#teacherLogin should be hidden");
    assert.equal(teacherPanel?.style.display, "block", "#teacherPanel should be visible");
    assert.equal(listCount, 1);

    portal.close();
    portal.dispose();
  });

  it("accessibility: Esc key and close button dismiss modal", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const client = createMockClient();
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        return [];
      },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    const modal = root.querySelector("#teacherModal") as any;

    portal.open();
    assert.equal(modal.style.display, "flex");

    // Close button click
    const closeBtn = root.querySelector("#btnCloseTeacherModal") as any;
    assert.ok(closeBtn);
    closeBtn.click();
    assert.equal(modal.style.display, "none");

    // Reopen and test Esc key
    portal.open();
    assert.equal(modal.style.display, "flex");

    const escEvent = new TestKeyboardEvent("keydown", { key: "Escape" });
    modal.dispatchEvent(escEvent);
    assert.equal(modal.style.display, "none", "Escape keydown must close modal");

    portal.dispose();
  });

  it("onPublish fails gracefully with UNAUTHORIZED if password is missing from session", async () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    // No password in session
    let builderOpts: any = null;
    const client = createMockClient();
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        return [];
      },
      openBuilder(_exam, opts) {
        builderOpts = opts;
      },
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();

    const newBtn = root.querySelector("#btnTeacherNewExam") as any;
    newBtn.click();

    assert.ok(builderOpts);
    const res = await builderOpts.onPublish({ title: "Đề thử nghiệm" });
    assert.equal(res.ok, false);
    assert.equal(res.code, "UNAUTHORIZED");

    portal.dispose();
  });
});
