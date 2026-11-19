/// <reference lib="dom" />

import { createAppsScriptClient, loadAppConfig, resolveBackend, mapErrorToVietnamese, getAdminToken, clearAdminToken } from '../collect/appsScript.ts';
import type { AppsScriptClient } from '../collect/appsScript.ts';
import { Toast, ErrorState } from '../ui/components.ts';
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
    const backend = resolveBackend(await loadAppConfig());
    return createAppsScriptClient(backend.url, undefined, backend.contentType);
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
        view.adminStats.style.display = '';
      } else {
        view.adminStats.replaceChildren();
        view.adminStats.style.display = 'none';
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
            view.resetPasswordInput.removeAttribute('aria-invalid');
            view.resetPasswordInput.setAttribute('aria-describedby', 'resetPasswordHint');
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

      if (state.error) {
        const errorNode = ErrorState(
          {
            message: state.error,
            action: {
              label: 'Thử lại',
              onClick: () => {
                refresh();
              },
            },
          },
          doc
        );
        view.adminError.replaceChildren(errorNode);
        view.adminError.style.display = '';
      } else {
        view.adminError.replaceChildren();
        view.adminError.style.display = 'none';
      }

      if (state.teachers.length > 0) {
        view.tableWrapper.style.display = '';
        view.teacherEmptyState.style.display = 'none';
      } else {
        view.tableWrapper.style.display = 'none';
        if (state.error) {
          view.teacherEmptyState.style.display = 'none';
        } else {
          view.teacherEmptyState.style.display = '';
        }
      }
    } else {
      view.adminLogin.style.display = '';
      view.adminPanel.style.display = 'none';
      view.btnLogout.style.display = 'none';
      view.adminError.replaceChildren();
      view.adminError.style.display = 'none';
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

      if (
        (!statsRes.ok && statsRes.code === 'UNAUTHORIZED') ||
        (!teachersRes.ok && teachersRes.code === 'UNAUTHORIZED')
      ) {
        client.adminLogout();
        clearAdminToken();
        state = {
          token: null,
          stats: null,
          teachers: [],
          loading: false,
          error: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
        };
        view.adminLoginError.textContent = 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
        view.adminPasswordInput.setAttribute('aria-invalid', 'true');
        view.adminPasswordInput.setAttribute('aria-describedby', 'adminLoginError');
        updateViewForState();
        return;
      }

      if (!statsRes.ok) {
        const viMsg = mapErrorToVietnamese(statsRes.code, statsRes.message);
        const errMsg = viMsg
          ? `Không thể tải dữ liệu: ${viMsg}. Vui lòng thử lại.`
          : 'Không thể tải dữ liệu từ máy chủ. Vui lòng thử lại.';
        state = {
          ...state,
          loading: false,
          error: errMsg,
        };
        updateViewForState();
        return;
      }

      if (!teachersRes.ok) {
        const viMsg = mapErrorToVietnamese(teachersRes.code, teachersRes.message);
        const errMsg = viMsg
          ? `Không thể tải dữ liệu: ${viMsg}. Vui lòng thử lại.`
          : 'Không thể tải dữ liệu từ máy chủ. Vui lòng thử lại.';
        state = {
          ...state,
          loading: false,
          error: errMsg,
        };
        updateViewForState();
        return;
      }

      state = {
        ...state,
        stats: statsRes.value,
        teachers: teachersRes.value,
        loading: false,
        error: null,
      };

      updateViewForState();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ';
      state = {
        ...state,
        loading: false,
        error: `Không thể tải dữ liệu: ${msg}. Vui lòng thử lại.`,
      };
      updateViewForState();
    } finally {
      view.btnRefreshAdmin.disabled = false;
    }
  }

  async function login(password: string): Promise<boolean> {
    view.adminPasswordInput.removeAttribute('aria-invalid');
    view.adminPasswordInput.removeAttribute('aria-describedby');

    if (!password) {
      view.adminLoginError.textContent = 'Vui lòng nhập mật khẩu quản trị';
      view.adminPasswordInput.setAttribute('aria-invalid', 'true');
      view.adminPasswordInput.setAttribute('aria-describedby', 'adminLoginError');
      return false;
    }

    if (!client.configured) {
      view.adminLoginError.textContent = 'Chưa cấu hình máy chủ Apps Script';
      view.adminPasswordInput.setAttribute('aria-invalid', 'true');
      view.adminPasswordInput.setAttribute('aria-describedby', 'adminLoginError');
      return false;
    }

    view.adminLoginError.textContent = '';
    view.btnAdminLogin.disabled = true;

    try {
      const res = await client.adminLogin(password);
      if (!res.ok) {
        view.adminLoginError.textContent = mapErrorToVietnamese(res.code, res.message);
        view.adminPasswordInput.setAttribute('aria-invalid', 'true');
        view.adminPasswordInput.setAttribute('aria-describedby', 'adminLoginError');
        return false;
      }

      state = {
        ...state,
        token: res.value.token,
        error: null,
      };
      view.adminPasswordInput.value = '';
      view.adminPasswordInput.removeAttribute('aria-invalid');
      view.adminPasswordInput.removeAttribute('aria-describedby');
      view.adminLoginError.textContent = '';
      updateViewForState();
      await refresh();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi kết nối';
      view.adminLoginError.textContent = msg;
      view.adminPasswordInput.setAttribute('aria-invalid', 'true');
      view.adminPasswordInput.setAttribute('aria-describedby', 'adminLoginError');
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
    view.adminPasswordInput.removeAttribute('aria-invalid');
    view.adminPasswordInput.removeAttribute('aria-describedby');
    view.adminLoginError.textContent = '';
    updateViewForState();
    Toast('Đã đăng xuất tài khoản quản trị', doc).show(doc.body);
  }

  async function createTeacher(input: NewTeacherInput): Promise<boolean> {
    view.createTeacherError.textContent = '';
    view.newTeacherNameInput.removeAttribute('aria-invalid');
    view.newTeacherNameInput.removeAttribute('aria-describedby');
    view.newTeacherUsernameInput.removeAttribute('aria-invalid');
    view.newTeacherUsernameInput.setAttribute('aria-describedby', 'newTeacherUsernameHint');
    view.newTeacherPasswordInput.removeAttribute('aria-invalid');
    view.newTeacherPasswordInput.setAttribute('aria-describedby', 'newTeacherPasswordHint');

    const name = input.name.trim();
    const username = input.username.trim();
    const password = input.password;

    if (!name) {
      view.createTeacherError.textContent = 'Họ và tên giáo viên không được để trống';
      view.newTeacherNameInput.setAttribute('aria-invalid', 'true');
      view.newTeacherNameInput.setAttribute('aria-describedby', 'createTeacherError');
      return false;
    }

    if (!username || !/^[a-z0-9._-]{3,32}$/i.test(username) || /\s/.test(username)) {
      view.createTeacherError.textContent = 'Tên đăng nhập phải có 3–32 ký tự a-z0-9._- không chứa dấu cách';
      view.newTeacherUsernameInput.setAttribute('aria-invalid', 'true');
      view.newTeacherUsernameInput.setAttribute('aria-describedby', 'createTeacherError');
      return false;
    }

    if (!password || password.length < 8) {
      view.createTeacherError.textContent = 'Mật khẩu phải có ít nhất 8 ký tự';
      view.newTeacherPasswordInput.setAttribute('aria-invalid', 'true');
      view.newTeacherPasswordInput.setAttribute('aria-describedby', 'createTeacherError');
      return false;
    }

    if (!state.token) {
      view.createTeacherError.textContent = 'Phiên làm việc hết hạn, vui lòng đăng nhập lại';
      return false;
    }

    view.btnCreateTeacherConfirm.disabled = true;

    try {
      const res = await client.adminCreateTeacher(state.token, name, username, password);
      if (!res.ok) {
        if (res.code === 'UNAUTHORIZED') {
          client.adminLogout();
          clearAdminToken();
          state = {
            token: null,
            stats: null,
            teachers: [],
            loading: false,
            error: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
          };
          view.adminLoginError.textContent = 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
          view.adminPasswordInput.setAttribute('aria-invalid', 'true');
          view.adminPasswordInput.setAttribute('aria-describedby', 'adminLoginError');
          if (typeof view.createTeacherDialog.close === 'function') {
            view.createTeacherDialog.close();
          } else {
            view.createTeacherDialog.removeAttribute('open');
          }
          updateViewForState();
          return false;
        }

        view.createTeacherError.textContent = mapErrorToVietnamese(res.code, res.message);
        if (res.code === 'USERNAME_TAKEN') {
          view.newTeacherUsernameInput.setAttribute('aria-invalid', 'true');
          view.newTeacherUsernameInput.setAttribute('aria-describedby', 'createTeacherError');
        }
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
    view.resetPasswordError.textContent = '';
    view.resetPasswordInput.removeAttribute('aria-invalid');
    view.resetPasswordInput.setAttribute('aria-describedby', 'resetPasswordHint');

    const password = input.password;
    if (!password || password.length < 8) {
      view.resetPasswordError.textContent = 'Mật khẩu mới phải có ít nhất 8 ký tự';
      view.resetPasswordInput.setAttribute('aria-invalid', 'true');
      view.resetPasswordInput.setAttribute('aria-describedby', 'resetPasswordError');
      return false;
    }

    if (!state.token) {
      view.resetPasswordError.textContent = 'Phiên làm việc hết hạn, vui lòng đăng nhập lại';
      return false;
    }

    view.btnResetPasswordConfirm.disabled = true;

    try {
      const res = await client.adminResetPassword(state.token, input.username, password);
      if (!res.ok) {
        if (res.code === 'UNAUTHORIZED') {
          client.adminLogout();
          clearAdminToken();
          state = {
            token: null,
            stats: null,
            teachers: [],
            loading: false,
            error: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
          };
          view.adminLoginError.textContent = 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
          view.adminPasswordInput.setAttribute('aria-invalid', 'true');
          view.adminPasswordInput.setAttribute('aria-describedby', 'adminLoginError');
          if (typeof view.resetPasswordDialog.close === 'function') {
            view.resetPasswordDialog.close();
          } else {
            view.resetPasswordDialog.removeAttribute('open');
          }
          updateViewForState();
          return false;
        }

        view.resetPasswordError.textContent = mapErrorToVietnamese(res.code, res.message);
        view.resetPasswordInput.setAttribute('aria-invalid', 'true');
        view.resetPasswordInput.setAttribute('aria-describedby', 'resetPasswordError');
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
      view.resetPasswordInput.setAttribute('aria-invalid', 'true');
      view.resetPasswordInput.setAttribute('aria-describedby', 'resetPasswordError');
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
        if (res.code === 'UNAUTHORIZED') {
          client.adminLogout();
          clearAdminToken();
          state = {
            token: null,
            stats: null,
            teachers: [],
            loading: false,
            error: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
          };
          view.adminLoginError.textContent = 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
          view.adminPasswordInput.setAttribute('aria-invalid', 'true');
          view.adminPasswordInput.setAttribute('aria-describedby', 'adminLoginError');
          updateViewForState();
          return false;
        }
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
    view.newTeacherNameInput.removeAttribute('aria-invalid');
    view.newTeacherNameInput.removeAttribute('aria-describedby');
    view.newTeacherUsernameInput.removeAttribute('aria-invalid');
    view.newTeacherUsernameInput.setAttribute('aria-describedby', 'newTeacherUsernameHint');
    view.newTeacherPasswordInput.removeAttribute('aria-invalid');
    view.newTeacherPasswordInput.setAttribute('aria-describedby', 'newTeacherPasswordHint');
    if (typeof view.createTeacherDialog.showModal === 'function') {
      view.createTeacherDialog.showModal();
    } else {
      view.createTeacherDialog.setAttribute('open', '');
    }
    view.newTeacherNameInput.focus();
  };

  const onCloseCreateTeacherDialog = () => {
    view.createTeacherError.textContent = '';
    view.newTeacherNameInput.removeAttribute('aria-invalid');
    view.newTeacherUsernameInput.removeAttribute('aria-invalid');
    view.newTeacherPasswordInput.removeAttribute('aria-invalid');
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
    view.resetPasswordError.textContent = '';
    view.resetPasswordInput.removeAttribute('aria-invalid');
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
