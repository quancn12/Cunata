import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from '../../src/admin/main.ts';
import type { AppsScriptClient, AsResult, AdminLoginResult, AdminStats, TeacherAccountInfo, TeacherLoginResult } from '../../src/collect/appsScript.ts';
import { createMockDocument, MockDocument, MockElement } from './mock-dom.ts';

function createMockClient(overrides: Partial<AppsScriptClient> = {}): AppsScriptClient {
  let activeToken: string | null = null;
  const teachersStore: TeacherAccountInfo[] = [
    { username: 'colan', name: 'Cô Lan', active: true, createdAt: '2026-11-16T10:00:00Z' },
  ];
  let statsStore: AdminStats = {
    teachers: 1,
    classes: 2,
    exams: 5,
    results: 12,
  };

  return {
    configured: true,
    async adminLogin(password: string): Promise<AsResult<AdminLoginResult>> {
      if (password === 'Admin-Secret-123') {
        activeToken = 'mock-admin-token-32-chars-long-123456';
        return { ok: true, value: { token: activeToken } };
      }
      return { ok: false, code: 'UNAUTHORIZED', message: 'Sai mật khẩu quản trị' };
    },
    async adminStats(_token?: string): Promise<AsResult<AdminStats>> {
      return { ok: true, value: { ...statsStore } };
    },
    async adminListTeachers(_token?: string): Promise<AsResult<TeacherAccountInfo[]>> {
      return { ok: true, value: [...teachersStore] };
    },
    async adminCreateTeacher(
      _token: string | any,
      nameArg?: any,
      usernameArg?: any,
      passwordArg?: any
    ): Promise<AsResult<true>> {
      let name = '';
      let username = '';
      let password = '';
      if (typeof _token === 'object') {
        name = _token.name;
        username = _token.username;
        password = _token.password;
      } else {
        name = nameArg;
        username = usernameArg;
        password = passwordArg;
      }

      if (teachersStore.some((t) => t.username === username)) {
        return { ok: false, code: 'USERNAME_TAKEN', message: 'Tên đăng nhập đã được dùng' };
      }
      teachersStore.push({ username, name, active: true, createdAt: new Date().toISOString() });
      statsStore = { ...statsStore, teachers: teachersStore.length };
      return { ok: true, value: true };
    },
    async adminResetPassword(
      _token: string | any,
      usernameArg?: any,
      _passwordArg?: any
    ): Promise<AsResult<true>> {
      const username = typeof _token === 'object' ? _token.username : usernameArg;
      const target = teachersStore.find((t) => t.username === username);
      if (!target) {
        return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy giáo viên' };
      }
      return { ok: true, value: true };
    },
    async adminSetTeacherActive(
      _token: string | any,
      usernameArg?: any,
      activeArg?: any
    ): Promise<AsResult<true>> {
      const username = typeof _token === 'object' ? _token.username : usernameArg;
      const active = typeof _token === 'object' ? _token.active : activeArg;
      const idx = teachersStore.findIndex((t) => t.username === username);
      if (idx === -1) {
        return { ok: false, code: 'NOT_FOUND', message: 'Không tìm thấy giáo viên' };
      }
      const prev = teachersStore[idx]!;
      teachersStore[idx] = { ...prev, active };
      return { ok: true, value: true };
    },
    adminLogout(): void {
      activeToken = null;
    },
    // Required stubs for AppsScriptClient interface
    listExams: async () => ({ ok: true, value: [] }),
    getExam: async () => ({ ok: true, value: {} }),
    teacherLogin: (async (_arg1: string, _arg2?: string): Promise<any> => ({
      ok: true,
      value: _arg2 ? { token: 'mock-teacher-token', name: 'Mock Teacher' } : true,
    })) as any,
    publishExam: async () => ({ ok: true, value: { examId: 'ex1', revision: 1 } }),
    unpublishExam: async () => ({ ok: true, value: true }),
    ...overrides,
  } as unknown as AppsScriptClient;
}

describe('RD-admin: Trang Admin riêng (src/admin)', () => {
  let doc: MockDocument;
  let root: MockElement;

  beforeEach(() => {
    doc = createMockDocument();
    root = doc.createElement('div');
    root.id = 'adminRoot';
    doc.body.appendChild(root);
  });

  it('1. Khởi tạo giao diện: có #adminLogin với input#adminPassword, #btnAdminLogin, #adminLoginError; #adminPanel ẩn', async () => {
    const client = createMockClient();
    const ctrl = await bootstrap(root as any, client, doc as any);

    const loginEl = doc.getElementById('adminLogin');
    assert.ok(loginEl, 'phải có phần tử #adminLogin');
    assert.equal(loginEl!.style.display, '', '#adminLogin phải hiển thị lúc đầu');

    const pwInput = doc.getElementById('adminPassword') as MockElement | null;
    assert.ok(pwInput, 'phải có input#adminPassword');
    assert.equal(pwInput!.type, 'password', '#adminPassword phải có type="password"');

    const btnLogin = doc.getElementById('btnAdminLogin');
    assert.ok(btnLogin, 'phải có button#btnAdminLogin');

    const errEl = doc.getElementById('adminLoginError');
    assert.ok(errEl, 'phải có #adminLoginError');
    assert.equal(errEl!.textContent, '', 'lỗi ban đầu phải rỗng');

    const panelEl = doc.getElementById('adminPanel');
    assert.ok(panelEl, 'phải có phần tử #adminPanel trong DOM');
    assert.equal(panelEl!.style.display, 'none', '#adminPanel phải ẩn khi chưa đăng nhập');

    ctrl.dispose();
  });

  it('2. Đăng nhập: từ chối mật khẩu rỗng và báo lỗi', async () => {
    const client = createMockClient();
    const ctrl = await bootstrap(root as any, client, doc as any);

    const success = await ctrl.login('');
    assert.equal(success, false);

    const errEl = doc.getElementById('adminLoginError');
    assert.match(errEl?.textContent ?? '', /mật khẩu/i, 'phải báo lỗi yêu cầu nhập mật khẩu');

    ctrl.dispose();
  });

  it('3. Đăng nhập: sai mật khẩu hiện thông báo lỗi tiếng Việt', async () => {
    const client = createMockClient();
    const ctrl = await bootstrap(root as any, client, doc as any);

    const pwInput = doc.getElementById('adminPassword') as MockElement | null;
    assert.ok(pwInput);
    pwInput!.value = 'sai-mat-khau';

    const btnLogin = doc.getElementById('btnAdminLogin') as MockElement | null;
    assert.ok(btnLogin);
    btnLogin!.click();

    // Chờ promise hoàn tất qua login trực tiếp
    const success = await ctrl.login('sai-mat-khau');
    assert.equal(success, false);

    const errEl = doc.getElementById('adminLoginError');
    assert.ok((errEl?.textContent ?? '').trim().length > 0, '#adminLoginError phải có nội dung lỗi');
    assert.match(errEl?.textContent ?? '', /Sai|mật khẩu/i, 'lỗi tiếng Việt dễ hiểu');

    ctrl.dispose();
  });

  it('4. Đăng nhập đúng: chuyển sang #adminPanel, hiện #adminStats và danh sách giáo viên', async () => {
    const client = createMockClient();
    const ctrl = await bootstrap(root as any, client, doc as any);

    const success = await ctrl.login('Admin-Secret-123');
    assert.equal(success, true, 'đăng nhập đúng mật khẩu phải thành công');

    const loginEl = doc.getElementById('adminLogin');
    assert.equal(loginEl?.style.display, 'none', '#adminLogin phải ẩn sau đăng nhập');

    const panelEl = doc.getElementById('adminPanel');
    assert.equal(panelEl?.style.display, '', '#adminPanel phải hiện sau đăng nhập');

    const statsEl = doc.getElementById('adminStats');
    assert.ok(statsEl, 'phải có #adminStats');
    assert.match(statsEl!.textContent, /1/, '#adminStats phải chứa số 1 (số giáo viên)');
    assert.match(statsEl!.textContent, /giáo viên/i, '#adminStats phải có chữ giáo viên');

    const teacherRow = doc.querySelector('.teacher-row[data-username="colan"]');
    assert.ok(teacherRow, 'phải có .teacher-row[data-username="colan"]');
    assert.match(teacherRow!.textContent, /Cô Lan/, 'hàng phải hiện tên giáo viên');

    const btnReset = teacherRow!.querySelector('.btn-reset-password');
    assert.ok(btnReset, 'hàng giáo viên phải có nút .btn-reset-password');

    const btnToggle = teacherRow!.querySelector('.btn-toggle-teacher');
    assert.ok(btnToggle, 'hàng giáo viên phải có nút .btn-toggle-teacher');

    ctrl.dispose();
  });

  it('5. Tạo giáo viên mới: kiểm tra hợp lệ client-side và tạo thành công', async () => {
    const client = createMockClient();
    const ctrl = await bootstrap(root as any, client, doc as any);
    await ctrl.login('Admin-Secret-123');

    // Mở hộp thoại
    const btnCreate = doc.getElementById('btnCreateTeacher') as MockElement | null;
    assert.ok(btnCreate);
    btnCreate!.click();

    const dialog = doc.getElementById('createTeacherDialog') as MockElement | null;
    assert.ok(dialog, 'phải có hộp thoại #createTeacherDialog');

    // Thử tạo với tên rỗng
    const failName = await ctrl.createTeacher({ name: '', username: 'thaymoi', password: 'Password-123' });
    assert.equal(failName, false);
    assert.match(doc.getElementById('createTeacherError')?.textContent ?? '', /tên/i);

    // Thử tạo với username có dấu cách
    const failUser = await ctrl.createTeacher({ name: 'Thầy Mới', username: 'thay moi', password: 'Password-123' });
    assert.equal(failUser, false);
    assert.match(doc.getElementById('createTeacherError')?.textContent ?? '', /Tên đăng nhập/i);

    // Thử tạo với mật khẩu dưới 8 ký tự
    const failPw = await ctrl.createTeacher({ name: 'Thầy Mới', username: 'thaymoi', password: '123' });
    assert.equal(failPw, false);
    assert.match(doc.getElementById('createTeacherError')?.textContent ?? '', /8 ký tự/i);

    // Tạo thành công
    const ok = await ctrl.createTeacher({ name: 'Thầy Mới', username: 'thaymoi', password: 'MatKhau-ThayMoi-1' });
    assert.equal(ok, true, 'tạo giáo viên hợp lệ phải thành công');

    const newRow = doc.querySelector('.teacher-row[data-username="thaymoi"]');
    assert.ok(newRow, 'phải có .teacher-row cho giáo viên mới thaymoi');
    assert.match(newRow!.textContent, /Thầy Mới/);

    const statsEl = doc.getElementById('adminStats');
    assert.match(statsEl?.textContent ?? '', /2/, 'số giáo viên trong #adminStats phải tăng lên 2');

    // Tạo trùng username phải báo lỗi
    const dup = await ctrl.createTeacher({ name: 'Thầy Trùng', username: 'thaymoi', password: 'Password-123' });
    assert.equal(dup, false);
    assert.match(doc.getElementById('createTeacherError')?.textContent ?? '', /đã được dùng/i);

    ctrl.dispose();
  });

  it('6. Khóa và mở khóa tài khoản giáo viên: nút .btn-toggle-teacher hoạt động', async () => {
    const client = createMockClient();
    const ctrl = await bootstrap(root as any, client, doc as any);
    await ctrl.login('Admin-Secret-123');

    let teacherRow = doc.querySelector('.teacher-row[data-username="colan"]');
    assert.match(teacherRow?.textContent ?? '', /Đang hoạt động/);

    // Khóa tài khoản
    const lockOk = await ctrl.setTeacherActive({ username: 'colan', active: false });
    assert.equal(lockOk, true);

    teacherRow = doc.querySelector('.teacher-row[data-username="colan"]');
    assert.match(teacherRow?.textContent ?? '', /Đã khóa/);

    // Mở khóa tài khoản
    const unlockOk = await ctrl.setTeacherActive({ username: 'colan', active: true });
    assert.equal(unlockOk, true);

    teacherRow = doc.querySelector('.teacher-row[data-username="colan"]');
    assert.match(teacherRow?.textContent ?? '', /Đang hoạt động/);

    ctrl.dispose();
  });

  it('7. Đặt lại mật khẩu giáo viên: kiểm tra độ dài mật khẩu và gọi API', async () => {
    const client = createMockClient();
    const ctrl = await bootstrap(root as any, client, doc as any);
    await ctrl.login('Admin-Secret-123');

    // Mật khẩu dưới 8 ký tự
    const fail = await ctrl.resetPassword({ username: 'colan', password: '123' });
    assert.equal(fail, false);
    assert.match(doc.getElementById('resetPasswordError')?.textContent ?? '', /8 ký tự/i);

    // Mật khẩu hợp lệ
    const ok = await ctrl.resetPassword({ username: 'colan', password: 'MatKhau-Moi-123' });
    assert.equal(ok, true);

    ctrl.dispose();
  });

  it('8. Đăng xuất: xóa token, ẩn #adminPanel, hiện lại #adminLogin', async () => {
    const client = createMockClient();
    const ctrl = await bootstrap(root as any, client, doc as any);
    await ctrl.login('Admin-Secret-123');

    assert.equal(doc.getElementById('adminPanel')?.style.display, '');

    ctrl.logout();

    assert.equal(doc.getElementById('adminPanel')?.style.display, 'none');
    assert.equal(doc.getElementById('adminLogin')?.style.display, '');
    assert.equal(ctrl.getState().token, null);

    ctrl.dispose();
  });

  it('9. Cấu hình chưa hoàn tất: báo rõ khi appsScriptUrl chưa cấu hình', async () => {
    const client = createMockClient({ configured: false });
    const ctrl = await bootstrap(root as any, client, doc as any);

    const success = await ctrl.login('Admin-Secret-123');
    assert.equal(success, false);
    assert.match(doc.getElementById('adminLoginError')?.textContent ?? '', /chưa cấu hình/i);

    ctrl.dispose();
  });

  it('10. Mật khẩu có dấu cách biên: giữ nguyên văn cho login, createTeacher, resetPassword', async () => {
    let capturedLoginPw = '';
    let capturedCreatePw = '';
    let capturedResetPw = '';

    const client = createMockClient({
      async adminLogin(pw: string) {
        capturedLoginPw = pw;
        if (pw === ' Admin-123456 ') {
          return { ok: true, value: { token: 'tok-123' } };
        }
        return { ok: false, code: 'UNAUTHORIZED', message: 'Sai mật khẩu' };
      },
      async adminCreateTeacher(...args: any[]): Promise<AsResult<true>> {
        if (typeof args[0] === 'object' && args[0] !== null) {
          capturedCreatePw = args[0].password;
        } else if (typeof args[1] === 'object' && args[1] !== null) {
          capturedCreatePw = args[1].password;
        } else {
          capturedCreatePw = args[3];
        }
        return { ok: true, value: true };
      },
      async adminResetPassword(...args: any[]): Promise<AsResult<true>> {
        if (typeof args[0] === 'object' && args[0] !== null) {
          capturedResetPw = args[0].password;
        } else if (args.length >= 3) {
          capturedResetPw = args[2];
        } else {
          capturedResetPw = args[1];
        }
        return { ok: true, value: true };
      },
    });

    const ctrl = await bootstrap(root as any, client, doc as any);

    // 1. Login with spaces
    const loginOk = await ctrl.login(' Admin-123456 ');
    assert.equal(loginOk, true);
    assert.equal(capturedLoginPw, ' Admin-123456 ');

    // 2. Create teacher with 8-char password containing spaces
    const createOk = await ctrl.createTeacher({ name: 'Cô Lan', username: 'colan_sp', password: ' 123456 ' });
    assert.equal(createOk, true);
    assert.equal(capturedCreatePw, ' 123456 ');

    // 3. Reset password with spaces
    const resetOk = await ctrl.resetPassword({ username: 'colan_sp', password: ' Moi-123456 ' });
    assert.equal(resetOk, true);
    assert.equal(capturedResetPw, ' Moi-123456 ');

    ctrl.dispose();
  });

  it('11. Hết hạn phiên (UNAUTHORIZED): refresh đưa về cổng đăng nhập và xóa token', async () => {
    let isExpired = false;
    const client = createMockClient({
      async adminStats() {
        if (isExpired) return { ok: false, code: 'UNAUTHORIZED', message: 'Phiên hết hạn' };
        return { ok: true, value: { teachers: 1, classes: 0, exams: 0, results: 0 } };
      },
    });

    const ctrl = await bootstrap(root as any, client, doc as any);
    await ctrl.login('Admin-Secret-123');
    assert.ok(ctrl.getState().token);
    assert.equal(doc.getElementById('adminPanel')?.style.display, '');

    // Làm mới khi phiên hết hạn
    isExpired = true;
    await ctrl.refresh();

    assert.equal(ctrl.getState().token, null, 'token phải bị xóa khi hết hạn');
    assert.equal(doc.getElementById('adminPanel')?.style.display, 'none', '#adminPanel phải ẩn');
    assert.equal(doc.getElementById('adminLogin')?.style.display, '', '#adminLogin phải hiện lại');
    assert.match(doc.getElementById('adminLoginError')?.textContent ?? '', /hết hạn|đăng nhập lại/i);

    ctrl.dispose();
  });

  it('12. Lỗi mạng/server khi làm mới: hiển thị thông báo tại chỗ và nút thử lại', async () => {
    let failRefresh = false;
    const client = createMockClient({
      async adminStats() {
        if (failRefresh) return { ok: false, code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ thử nghiệm' };
        return { ok: true, value: { teachers: 1, classes: 0, exams: 0, results: 0 } };
      },
    });

    const ctrl = await bootstrap(root as any, client, doc as any);
    await ctrl.login('Admin-Secret-123');

    // Thất bại khi làm mới
    failRefresh = true;
    await ctrl.refresh();

    const errBox = doc.getElementById('adminError');
    assert.ok(errBox);
    assert.equal(errBox!.style.display, '', '#adminError phải hiển thị khi lỗi');
    assert.match(errBox!.textContent, /Lỗi|thử lại/i);

    ctrl.dispose();
  });

  it('13. Lỗi tải ban đầu: không hiển thị danh sách rỗng, hiển thị thông báo lỗi', async () => {
    const client = createMockClient({
      async adminListTeachers() {
        return { ok: false, code: 'INTERNAL_ERROR', message: 'Không tải được dữ liệu kiểm định' };
      },
    });

    const ctrl = await bootstrap(root as any, client, doc as any);
    await ctrl.login('Admin-Secret-123');

    const emptyState = doc.querySelector('.admin-empty-state') as MockElement | null;
    assert.equal(emptyState?.style.display, 'none', 'không được hiển thị danh sách rỗng khi lỗi tải');

    const errBox = doc.getElementById('adminError');
    assert.ok(errBox);
    assert.equal(errBox!.style.display, '', '#adminError phải hiển thị');
    assert.match(errBox!.textContent, /Không.*tải|thử lại/i);

    ctrl.dispose();
  });

  it('14. Lỗi input: thiết lập aria-invalid="true" và aria-describedby trỏ tới lỗi', async () => {
    const client = createMockClient();
    const ctrl = await bootstrap(root as any, client, doc as any);
    await ctrl.login('Admin-Secret-123');

    // Mở hộp thoại tạo giáo viên
    const btnCreate = doc.getElementById('btnCreateTeacher') as MockElement | null;
    btnCreate?.click();

    const userInp = doc.getElementById('newTeacherUsername') as MockElement | null;
    assert.ok(userInp);

    // Gõ username không hợp lệ (ab)
    await ctrl.createTeacher({ name: 'Cô Lan', username: 'ab', password: 'Password-123' });

    assert.equal(userInp!.getAttribute('aria-invalid'), 'true');
    const describedby = userInp!.getAttribute('aria-describedby') ?? '';
    assert.match(describedby, /createTeacherError/);

    const errEl = doc.getElementById('createTeacherError');
    assert.match(errEl?.textContent ?? '', /3.32/);

    ctrl.dispose();
  });
});
