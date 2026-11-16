/// <reference lib="dom" />

import { createAppsScriptClient, loadAppConfig, mapErrorToVietnamese, getAdminToken, clearAdminToken } from '../collect/appsScript.ts';
import type { AppsScriptClient } from '../collect/appsScript.ts';
import { Toast } from '../ui/components.ts';
import { createAdminView, renderAdminStats, renderTeacherRows } from './view.ts';
import type { AdminController, AdminState, AdminStats, NewTeacherInput, ResetPasswordInput, SetTeacherActiveInput, TeacherAccountInfo } from './types.ts';

export async function bootstrap(
  rootElement?: HTMLElement,
  clientOverride?: AppsScriptClient,
  doc: Document = document
): Promise<AdminController> {
  const root = rootElement ?? doc.getElementById('adminRoot') ?? doc.body;
  if (!root) {
    throw new Error('Admin root element not found');
  }

  // Ensure admin.css is linked
  if (doc.head && !doc.querySelector('link[href*="admin.css"]')) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = './admin/admin.css';
    doc.head.append(link);
  }

  const client = clientOverride ?? (await (async () => {
    const config = await loadAppConfig();
    return createAppsScriptClient(config.appsScriptUrl);
  })());

  const view = createAdminView(root, doc);

  let state: AdminState = {
    token: getAdminToken(),
    stats: null,
    teachers: [],
    loading: false,
    error: null,
  };

  let activeResetUsername: string | null = null;

  function updateViewForState(): void {
    if (state.token) {
      view.adminLogin.style.display = 'none';
      view.adminPanel.style.display = '';
      view.btnLogout.style.display = '';
      if (state.stats) {
        renderAdminStats(view.adminStats, state.stats, doc);
      }
      renderTeacherRows(
        view.teacherTableBody,
        state.teachers,
        {
          onResetPassword(username, name) {
            activeResetUsername = username;
            view.resetPasswordTeacherName.textContent = `Đặt lại mật khẩu cho tài khoản: ${name} (@${username})`;
            view.resetPasswordInput.value = '';
            view.resetPasswordError.textContent = '';
            if (typeof view.resetPasswordDialog.showModal === 'function') {
              view.resetPasswordDialog.showModal();
            } else {
              view.resetPasswordDialog.setAttribute('open', '');
            }
          },
          async onToggleActive(username, currentActive) {
            await setTeacherActive({ username, active: !currentActive });
          },
        },
        doc
      );
      if (state.teachers.length === 0) {
        view.teacherEmptyState.style.display = '';
      } else {
        view.teacherEmptyState.style.display = 'none';
      }
    } else {
      view.adminLogin.style.display = '';
      view.adminPanel.style.display = 'none';
      view.btnLogout.style.display = 'none';
    }
  }

  async function refresh(): Promise<void> {
    if (!state.token) return;
    state = { ...state, loading: true };
    view.btnRefreshAdmin.disabled = true;

    try {
      const tokenArg = state.token ?? undefined;
      const [statsRes, teachersRes] = await Promise.all([
        client.adminStats(tokenArg),
        client.adminListTeachers(tokenArg),
      ]);

      let newStats: AdminStats | null = state.stats;
      let newTeachers: readonly TeacherAccountInfo[] = state.teachers;

      if (statsRes.ok) {
        newStats = statsRes.value;
      }
      if (teachersRes.ok) {
        newTeachers = teachersRes.value;
      }

      state = {
        ...state,
        stats: newStats,
        teachers: newTeachers,
        loading: false,
        error: null,
      };

      updateViewForState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi làm mới dữ liệu';
      state = { ...state, loading: false, error: msg };
    } finally {
      view.btnRefreshAdmin.disabled = false;
    }
  }

  async function login(password: string): Promise<boolean> {
    const trimmed = password.trim();
    if (!trimmed) {
      view.adminLoginError.textContent = 'Vui lòng nhập mật khẩu quản trị';
      return false;
    }

    if (!client.configured) {
      view.adminLoginError.textContent = 'Chưa cấu hình máy chủ Apps Script';
      return false;
    }

    view.adminLoginError.textContent = '';
    view.btnAdminLogin.disabled = true;

    try {
      const res = await client.adminLogin(trimmed);
      if (!res.ok) {
        view.adminLoginError.textContent = mapErrorToVietnamese(res.code, res.message);
        return false;
      }

      state = {
        ...state,
        token: res.value.token,
        error: null,
      };
      view.adminPasswordInput.value = '';
      updateViewForState();
      await refresh();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối';
      view.adminLoginError.textContent = msg;
      return false;
    } finally {
      view.btnAdminLogin.disabled = false;
    }
  }

  function logout(): void {
    client.adminLogout();
    clearAdminToken();
    state = {
      token: null,
      stats: null,
      teachers: [],
      loading: false,
      error: null,
    };
    view.adminPasswordInput.value = '';
    view.adminLoginError.textContent = '';
    updateViewForState();
    Toast('Đã đăng xuất tài khoản quản trị', doc).show(doc.body);
  }

  async function createTeacher(input: NewTeacherInput): Promise<boolean> {
    const name = input.name.trim();
    const username = input.username.trim();
    const password = input.password.trim();

    if (!name) {
      view.createTeacherError.textContent = 'Họ và tên giáo viên không được để trống';
      return false;
    }

    if (!username || !/^[a-z0-9._-]{3,32}$/i.test(username) || /\s/.test(username)) {
      view.createTeacherError.textContent = 'Tên đăng nhập phải có 3–32 ký tự a-z0-9._- không chứa dấu cách';
      return false;
    }

    if (!password || password.length < 8) {
      view.createTeacherError.textContent = 'Mật khẩu phải có ít nhất 8 ký tự';
      return false;
    }

    if (!state.token) {
      view.createTeacherError.textContent = 'Phiên làm việc hết hạn, vui lòng đăng nhập lại';
      return false;
    }

    view.btnCreateTeacherConfirm.disabled = true;
    view.createTeacherError.textContent = '';

    try {
      const res = await client.adminCreateTeacher(state.token, name, username, password);
      if (!res.ok) {
        view.createTeacherError.textContent = mapErrorToVietnamese(res.code, res.message);
        return false;
      }

      if (typeof view.createTeacherDialog.close === 'function') {
        view.createTeacherDialog.close();
      } else {
        view.createTeacherDialog.removeAttribute('open');
      }

      view.newTeacherNameInput.value = '';
      view.newTeacherUsernameInput.value = '';
      view.newTeacherPasswordInput.value = '';

      Toast(`Đã tạo tài khoản giáo viên: ${name}`, doc).show(doc.body);
      await refresh();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi tạo giáo viên';
      view.createTeacherError.textContent = msg;
      return false;
    } finally {
      view.btnCreateTeacherConfirm.disabled = false;
    }
  }

  async function resetPassword(input: ResetPasswordInput): Promise<boolean> {
    const password = input.password.trim();
    if (!password || password.length < 8) {
      view.resetPasswordError.textContent = 'Mật khẩu mới phải có ít nhất 8 ký tự';
      return false;
    }

    if (!state.token) {
      view.resetPasswordError.textContent = 'Phiên làm việc hết hạn, vui lòng đăng nhập lại';
      return false;
    }

    view.btnResetPasswordConfirm.disabled = true;
    view.resetPasswordError.textContent = '';

    try {
      const res = await client.adminResetPassword(state.token, input.username, password);
      if (!res.ok) {
        view.resetPasswordError.textContent = mapErrorToVietnamese(res.code, res.message);
        return false;
      }

      if (typeof view.resetPasswordDialog.close === 'function') {
        view.resetPasswordDialog.close();
      } else {
        view.resetPasswordDialog.removeAttribute('open');
      }

      view.resetPasswordInput.value = '';
      Toast(`Đã đặt lại mật khẩu cho giáo viên @${input.username}`, doc).show(doc.body);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi đặt lại mật khẩu';
      view.resetPasswordError.textContent = msg;
      return false;
    } finally {
      view.btnResetPasswordConfirm.disabled = false;
    }
  }

  async function setTeacherActive(input: SetTeacherActiveInput): Promise<boolean> {
    if (!state.token) {
      Toast('Phiên làm việc hết hạn, vui lòng đăng nhập lại', doc).show(doc.body);
      return false;
    }

    try {
      const res = await client.adminSetTeacherActive(state.token, input.username, input.active);
      if (!res.ok) {
        Toast(mapErrorToVietnamese(res.code, res.message), doc).show(doc.body);
        return false;
      }

      Toast(
        `Đã ${input.active ? 'mở khóa' : 'khóa'} tài khoản giáo viên @${input.username}`,
        doc
      ).show(doc.body);
      await refresh();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi cập nhật trạng thái';
      Toast(msg, doc).show(doc.body);
      return false;
    }
  }

  // Bind Event Listeners
  const onLoginClick = () => {
    login(view.adminPasswordInput.value);
  };

  const onPasswordKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      login(view.adminPasswordInput.value);
    }
  };

  const onLogoutClick = () => {
    logout();
  };

  const onRefreshClick = () => {
    refresh();
  };

  const onOpenCreateTeacherDialog = () => {
    view.createTeacherError.textContent = '';
    view.newTeacherNameInput.value = '';
    view.newTeacherUsernameInput.value = '';
    view.newTeacherPasswordInput.value = '';
    if (typeof view.createTeacherDialog.showModal === 'function') {
      view.createTeacherDialog.showModal();
    } else {
      view.createTeacherDialog.setAttribute('open', '');
    }
    view.newTeacherNameInput.focus();
  };

  const onCloseCreateTeacherDialog = () => {
    if (typeof view.createTeacherDialog.close === 'function') {
      view.createTeacherDialog.close();
    } else {
      view.createTeacherDialog.removeAttribute('open');
    }
  };

  const onConfirmCreateTeacher = () => {
    createTeacher({
      name: view.newTeacherNameInput.value,
      username: view.newTeacherUsernameInput.value,
      password: view.newTeacherPasswordInput.value,
    });
  };

  const onCloseResetPasswordDialog = () => {
    if (typeof view.resetPasswordDialog.close === 'function') {
      view.resetPasswordDialog.close();
    } else {
      view.resetPasswordDialog.removeAttribute('open');
    }
  };

  const onConfirmResetPassword = () => {
    if (activeResetUsername) {
      resetPassword({
        username: activeResetUsername,
        password: view.resetPasswordInput.value,
      });
    }
  };

  view.btnAdminLogin.addEventListener('click', onLoginClick);
  view.adminPasswordInput.addEventListener('keydown', onPasswordKeyDown);
  view.btnLogout.addEventListener('click', onLogoutClick);
  view.btnRefreshAdmin.addEventListener('click', onRefreshClick);

  view.btnCreateTeacher.addEventListener('click', onOpenCreateTeacherDialog);
  view.btnCloseCreateTeacherDialog.addEventListener('click', onCloseCreateTeacherDialog);
  view.btnCreateTeacherCancel.addEventListener('click', onCloseCreateTeacherDialog);
  view.btnCreateTeacherConfirm.addEventListener('click', onConfirmCreateTeacher);

  view.btnCloseResetPasswordDialog.addEventListener('click', onCloseResetPasswordDialog);
  view.btnResetPasswordCancel.addEventListener('click', onCloseResetPasswordDialog);
  view.btnResetPasswordConfirm.addEventListener('click', onConfirmResetPassword);

  // If already logged in, attempt to refresh
  if (state.token) {
    updateViewForState();
    refresh().catch(() => {
      logout();
    });
  } else {
    updateViewForState();
  }

  const controller: AdminController = {
    root,
    refresh,
    login,
    logout,
    createTeacher,
    resetPassword,
    setTeacherActive,
    getState: () => state,
    dispose: () => {
      view.btnAdminLogin.removeEventListener('click', onLoginClick);
      view.adminPasswordInput.removeEventListener('keydown', onPasswordKeyDown);
      view.btnLogout.removeEventListener('click', onLogoutClick);
      view.btnRefreshAdmin.removeEventListener('click', onRefreshClick);
      view.btnCreateTeacher.removeEventListener('click', onOpenCreateTeacherDialog);
      view.btnCloseCreateTeacherDialog.removeEventListener('click', onCloseCreateTeacherDialog);
      view.btnCreateTeacherCancel.removeEventListener('click', onCloseCreateTeacherDialog);
      view.btnCreateTeacherConfirm.removeEventListener('click', onConfirmCreateTeacher);
      view.btnCloseResetPasswordDialog.removeEventListener('click', onCloseResetPasswordDialog);
      view.btnResetPasswordCancel.removeEventListener('click', onCloseResetPasswordDialog);
      view.btnResetPasswordConfirm.removeEventListener('click', onConfirmResetPassword);
      root.replaceChildren();
    },
  };

  return controller;
}

// Auto-run when loaded directly in browser environment
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const autoBoot = () => {
    const rootEl = document.getElementById('adminRoot') ?? document.body;
    if (rootEl) {
      bootstrap(rootEl).catch((err) => {
        console.error('[Cunata Admin] Bootstrap error:', err);
      });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoBoot);
  } else {
    autoBoot();
  }
}
