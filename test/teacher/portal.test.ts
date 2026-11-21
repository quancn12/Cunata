import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  mountTeacherPortal,
  getStoredTeacherPassword,
  setStoredTeacherPassword,
  clearStoredTeacherPassword,
  getStoredTeacherToken,
  setStoredTeacherToken,
  clearStoredTeacherToken,
  TEACHER_SESSION_PW_KEY,
  TEACHER_TOKEN_KEY,
} from "../../src/teacher/portal.ts";
import type {
  AppsScriptClient,
  TeacherPortalDeps,
  AsResult,
  PublishedExamMeta,
} from "../../src/teacher/portal.ts";

import { createTestDocument, TestDOMEvent } from "./view/dom-helper.ts";

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

describe("FEAT-teacher: Teacher Portal Section 19.1", () => {
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
      async teacherLogin(usernameOrPassword: string, password?: string): Promise<AsResult<any>> {
        const u = password !== undefined ? usernameOrPassword : "colan";
        const p = password !== undefined ? password : usernameOrPassword;
        if (p === "MatKhau-Lan-01") {
          return { ok: true, value: { token: "token-lan-valid-12345", name: "Cô Lan" } };
        }
        return { ok: false, code: "UNAUTHORIZED", message: "Sai mật khẩu" };
      },
      async publishExam(_token: string, _exam: unknown): Promise<AsResult<{ examId: string; revision: number }>> {
        return { ok: true, value: { examId: "exam-published-01", revision: 2 } };
      },
      async unpublishExam(_token: string, _examId: string): Promise<AsResult<true>> {
        return { ok: true, value: true };
      },
      async createClass(_token: string, name: string): Promise<AsResult<{ classId: string; code: string }>> {
        return { ok: true, value: { classId: "class-12a1", code: "ABCDEF" } };
      },
      async listMyClasses(_token?: string): Promise<AsResult<any[]>> {
        return {
          ok: true,
          value: [
            { classId: "class-12a1", code: "ABCDEF", name: "12A1 Kiểm định", createdAt: "2026-11-16T10:00:00Z", studentCount: 25 },
          ],
        };
      },
      async assignExam(_token: string, classId: string, examId: string, openAt: string, dueAt: string): Promise<AsResult<{ assignmentId: string }>> {
        return { ok: true, value: { assignmentId: "assign-01" } };
      },
      async listAssignments(_token: string, _classId: string): Promise<AsResult<any[]>> {
        return {
          ok: true,
          value: [
            {
              assignmentId: "assign-01",
              classId: "class-12a1",
              examId: "exam-thpt-hoa",
              title: "Đề thi Hóa",
              openAt: "2026-11-16T08:00:00Z",
              dueAt: "2026-11-16T12:00:00Z",
              createdAt: "2026-11-16T07:00:00Z",
              questionCount: 28,
              durationMinutes: 50,
              submissionCount: 15,
            },
          ],
        };
      },
      async listResults(_token: string, _classId: string, _assignmentId?: string): Promise<AsResult<any[]>> {
        return {
          ok: true,
          value: [
            {
              candidateName: "Trần Học Sinh",
              class_code: "ABCDEF",
              submitted_at: "2026-11-16T09:30:00Z",
              sections: {
                I: { score: "3", max: "4.5" },
                II: { score: "4", max: "4" },
                III: { score: "1.5", max: "1.5" },
              },
              total: "8.5",
              maxTotal: "10",
            },
          ],
        };
      },
      ...overrides,
    };
  }

  it("mounts #teacherLogin with username, password, login button, and error container", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const client = createMockClient();
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() { return []; },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    assert.ok(portal);

    portal.open();

    const loginSec = root.querySelector("#teacherLogin");
    assert.ok(loginSec);
    assert.equal(loginSec?.style.display, "block");

    const userInput = root.querySelector("#teacherUsername");
    assert.ok(userInput, "#teacherUsername must exist");

    const pwInput = root.querySelector("#teacherPassword");
    assert.ok(pwInput, "#teacherPassword must exist");

    const loginBtn = root.querySelector("#btnTeacherLogin");
    assert.ok(loginBtn, "#btnTeacherLogin must exist");

    const errDiv = root.querySelector("#teacherLoginError");
    assert.ok(errDiv, "#teacherLoginError must exist");

    portal.close();
    assert.equal(loginSec?.style.display, "none");
    portal.dispose();
  });

  it("shows notice containing 'chưa cấu hình' when client.configured is false", () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const client = createMockClient({ configured: false });
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() { return []; },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();

    const loginSec = root.querySelector("#teacherLogin");
    assert.ok(loginSec);
    assert.match(loginSec?.textContent ?? "", /chưa cấu hình/i);

    portal.dispose();
  });

  it("shows friendly Vietnamese error on invalid credentials without leaking raw UNAUTHORIZED", async () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const client = createMockClient();
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() { return []; },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();

    const userInput = root.querySelector("#teacherUsername") as any;
    const pwInput = root.querySelector("#teacherPassword") as any;
    const form = root.querySelector("#teacherLoginForm") as any;
    const errDiv = root.querySelector("#teacherLoginError");

    userInput.value = "colan";
    pwInput.value = "sai-mat-khau";

    form.dispatchEvent(new TestDOMEvent("submit"));

    await new Promise((r) => setTimeout(r, 20));

    const errText = errDiv?.textContent ?? "";
    assert.ok(errText.length > 0, "Error must be displayed");
    assert.ok(!/UNAUTHORIZED|attempt_id/.test(errText), "Must not leak raw error code");

    portal.dispose();
  });

  it("logs in successfully: stores token in sessionStorage and shows #teacherShell with #teacherNav", async () => {
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const client = createMockClient();
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() { return []; },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open();

    const userInput = root.querySelector("#teacherUsername") as any;
    const pwInput = root.querySelector("#teacherPassword") as any;
    const form = root.querySelector("#teacherLoginForm") as any;

    userInput.value = "colan";
    pwInput.value = "MatKhau-Lan-01";

    form.dispatchEvent(new TestDOMEvent("submit"));
    await new Promise((r) => setTimeout(r, 20));

    const token = getStoredTeacherToken();
    assert.equal(token, "token-lan-valid-12345");

    const shell = root.querySelector("#teacherShell");
    assert.equal(shell?.style.display, "block");

    const nav = root.querySelector("#teacherNav");
    assert.ok(nav);

    const navLop = root.querySelector('#teacherNav a[data-nav="lop"]');
    const navDe = root.querySelector('#teacherNav a[data-nav="de"]');
    const navKq = root.querySelector('#teacherNav a[data-nav="ket-qua"]');
    assert.ok(navLop);
    assert.ok(navDe);
    assert.ok(navKq);
    assert.equal(navLop?.getAttribute("aria-current"), "page");

    // Test logout
    const logoutBtn = root.querySelector("#btnTeacherLogout") as any;
    assert.ok(logoutBtn);
    logoutBtn.click();

    assert.equal(getStoredTeacherToken(), null, "Logout clears token");
    const loginSec = root.querySelector("#teacherLogin");
    assert.equal(loginSec?.style.display, "block", "Logout returns to login view");

    portal.dispose();
  });

  it("renders classes section with .class-card and .class-code", async () => {
    setStoredTeacherToken("valid-token");
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const client = createMockClient();
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() { return []; },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open("lop");

    await new Promise((r) => setTimeout(r, 20));

    const card = root.querySelector('.class-card[data-class-id="class-12a1"]');
    assert.ok(card, "Class card must exist");

    const code = root.querySelector(".class-card .class-code");
    assert.equal(code?.textContent.trim(), "ABCDEF");

    const createBtn = root.querySelector("#btnCreateClass");
    assert.ok(createBtn, "#btnCreateClass must exist");

    portal.dispose();
  });

  it("renders results section with #resultsTable and Trần Học Sinh", async () => {
    setStoredTeacherToken("valid-token");
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    const client = createMockClient();
    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() { return []; },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open("ket-qua");

    await new Promise((r) => setTimeout(r, 30));

    const table = root.querySelector("#resultsTable");
    assert.ok(table, "#resultsTable must exist");
    assert.match(table?.textContent ?? "", /Trần Học Sinh/);

    const examSelect = root.querySelector("#resultsExamSelect") as any;
    assert.ok(examSelect, "#resultsExamSelect must exist");
    const optionValues = examSelect.querySelectorAll("option").map((o: any) => o.value);
    assert.ok(optionValues.includes("exam-thpt-hoa"), "resultsExamSelect must contain assigned exam options");

    const exportBtn = root.querySelector("#btnExportResults");
    assert.ok(exportBtn, "#btnExportResults must exist");

    portal.dispose();
  });

  it("results section coordinates exam select options and results table even with delayed assignments (no race condition)", async () => {
    setStoredTeacherToken("valid-token");
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    let listAssignmentsResolved = false;
    const client = createMockClient({
      async listAssignments(_token: string, _classId: string): Promise<AsResult<any[]>> {
        await new Promise((r) => setTimeout(r, 20));
        listAssignmentsResolved = true;
        return {
          ok: true,
          value: [
            {
              assignmentId: "assign-delayed-01",
              classId: "class-12a1",
              examId: "exam-delayed-id",
              title: "Đề thi chậm",
              openAt: "2026-11-16T08:00:00Z",
              dueAt: "2026-11-16T12:00:00Z",
              createdAt: "2026-11-16T07:00:00Z",
              questionCount: 20,
              durationMinutes: 45,
              submissionCount: 5,
            },
          ],
        };
      },
      async listResults(_token: string, _classId: string): Promise<AsResult<any[]>> {
        // listResults returns immediately, but portal must coordinate with exam options
        return {
          ok: true,
          value: [
            {
              candidateName: "Học Sinh Chậm",
              class_code: "ABCDEF",
              submitted_at: "2026-11-16T09:30:00Z",
              sections: {
                I: { score: "2.5", max: "5" },
              },
              total: "2.5",
              maxTotal: "10",
            },
          ],
        };
      },
    });

    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() { return []; },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open("ket-qua");

    // Wait for the render to complete
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(listAssignmentsResolved, true, "listAssignments must have resolved");
    const table = root.querySelector("#resultsTable");
    assert.match(table?.textContent ?? "", /Học Sinh Chậm/);

    const examSelect = root.querySelector("#resultsExamSelect") as any;
    const optionValues = examSelect.querySelectorAll("option").map((o: any) => o.value);
    assert.ok(optionValues.includes("exam-delayed-id"), "Exam select options must be populated when results are rendered");

    portal.dispose();
  });

  it("syncExamSelectOptions loads classes dynamically if cachedMyClasses is initially empty", async () => {
    setStoredTeacherToken("valid-token");
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    let classesCalled = 0;
    const client = createMockClient({
      async listMyClasses(_token: string) {
        classesCalled++;
        return {
          ok: true,
          value: [{ classId: "class-dynamic", code: "DYN123", name: "Lớp Động", createdAt: "2026-11-16T00:00:00Z", studentCount: 1 }],
        };
      },
      async listAssignments(_token: string, classId: string) {
        return {
          ok: true,
          value: [{
            assignmentId: "assign-dyn-01",
            classId,
            examId: "exam-dyn-id",
            title: "Đề thi Động",
            openAt: "2026-11-16T08:00:00Z",
            dueAt: "2026-11-16T12:00:00Z",
            createdAt: "2026-11-16T07:00:00Z",
            questionCount: 10,
            durationMinutes: 30,
          }],
        };
      },
    });

    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() { return []; },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open("ket-qua");

    await new Promise((r) => setTimeout(r, 60));

    const table = root.querySelector("#resultsTable");
    assert.ok(table, "#resultsTable must exist after results loaded");

    const examSelect = root.querySelector("#resultsExamSelect") as any;
    const optionValues = examSelect.querySelectorAll("option").map((o: any) => o.value);
    assert.ok(optionValues.includes("exam-dyn-id"), "Exam select must contain options from dynamically fetched classes");

    portal.dispose();
  });

  it("assigns exam to class via #assignDialog and verifies dueAt > openAt check", async () => {
    setStoredTeacherToken("valid-token");
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    let assignedExamId = "";
    const client = createMockClient({
      async assignExam(_token: string, _classId: string, examId: string, _openAt: string, _dueAt: string) {
        assignedExamId = examId;
        return { ok: true, value: { assignmentId: "assign-new-99" } };
      },
    });

    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        return [
          { id: "exam-hoa", title: "Đề thi Hóa minh họa", source: "static", load: async () => ({}) },
        ];
      },
      openBuilder() {},
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open("lop");
    await new Promise((r) => setTimeout(r, 20));

    // Open class detail
    const card = root.querySelector('.class-card[data-class-id="class-12a1"]') as any;
    assert.ok(card);
    card.click();
    await new Promise((r) => setTimeout(r, 20));

    const assignBtn = root.querySelector("#btnAssignExam") as any;
    assert.ok(assignBtn, "#btnAssignExam must exist in class detail");
    assignBtn.click();
    await new Promise((r) => setTimeout(r, 60));

    const dialog = doc.getElementById("assignDialog");
    assert.ok(dialog, "#assignDialog must exist");
    if (!dialog) throw new Error("#assignDialog must exist");

    const openInput = dialog.querySelector("#assignOpenAt") as any;
    const dueInput = dialog.querySelector("#assignDueAt") as any;
    const confirmBtn = dialog.querySelector("#btnAssignConfirm") as any;
    const form = dialog.querySelector("form") as any;

    // Bad dates (due before open)
    openInput.value = "2026-11-16T10:00";
    dueInput.value = "2026-11-16T08:00";
    form.dispatchEvent(new TestDOMEvent("submit"));
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(assignedExamId, "", "Must not call assignExam when dueAt <= openAt");

    // Good dates
    openInput.value = "2026-11-16T08:00";
    dueInput.value = "2026-11-16T12:00";
    form.dispatchEvent(new TestDOMEvent("submit"));
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(assignedExamId, "exam-hoa");

    portal.dispose();
  });

  it("renders exams section with .btn-teacher-edit, .btn-teacher-assign, and .btn-teacher-unpublish", async () => {
    setStoredTeacherToken("valid-token");
    const doc = createTestDocument();
    const root = doc.createElement("div");
    doc.body.appendChild(root);

    let openedWithExam: any = null;
    let unpublishedId = "";

    const client = createMockClient({
      async unpublishExam(_token: string, examId: string) {
        unpublishedId = examId;
        return { ok: true, value: true };
      },
    });

    const deps: TeacherPortalDeps = {
      client,
      async listAllExams() {
        return [
          { id: "exam-static-1", title: "Đề tĩnh", source: "static", load: async () => ({ id: "exam-static-1" }) },
          { id: "exam-teacher-1", title: "Đề giáo viên", source: "teacher", load: async () => ({ id: "exam-teacher-1" }) },
        ];
      },
      openBuilder(exam) {
        openedWithExam = exam;
      },
    };

    const portal = mountTeacherPortal(root as any, deps);
    portal.open("de");
    await new Promise((r) => setTimeout(r, 20));

    const newBtn = root.querySelector("#btnTeacherNewExam") as any;
    assert.ok(newBtn, "#btnTeacherNewExam must exist");
    newBtn.click();
    assert.equal(openedWithExam, null, "#btnTeacherNewExam opens builder with null");

    // Edit exam
    const editBtn = root.querySelector('.class-card[data-exam-id="exam-static-1"] .btn-teacher-edit') as any;
    assert.ok(editBtn, ".btn-teacher-edit must exist");
    editBtn.click();
    await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(openedWithExam, { id: "exam-static-1" });

    // Static exam should NOT have unpublish button
    const staticUnpub = root.querySelector('.class-card[data-exam-id="exam-static-1"] .btn-teacher-unpublish');
    assert.equal(staticUnpub, null, "Static exam must not have unpublish button");

    // Teacher exam MUST have unpublish button
    const teacherUnpub = root.querySelector('.class-card[data-exam-id="exam-teacher-1"] .btn-teacher-unpublish') as any;
    assert.ok(teacherUnpub, "Teacher exam must have unpublish button");

    portal.dispose();
  });
});
