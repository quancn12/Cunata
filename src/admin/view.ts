/// <reference lib="dom" />

import { Icon } from '../ui/icons.ts';
import type { AdminStats, TeacherAccountInfo } from './types.ts';

export interface AdminViewElements {
  readonly root: HTMLElement;
  readonly topbarRole: HTMLElement;
  readonly topbarActions: HTMLElement;
  readonly btnLogout: HTMLButtonElement;
  // Login
  readonly adminLogin: HTMLElement;
  readonly adminPasswordInput: HTMLInputElement;
  readonly btnAdminLogin: HTMLButtonElement;
  readonly adminLoginError: HTMLElement;
  // Panel
  readonly adminPanel: HTMLElement;
  readonly adminStats: HTMLElement;
  readonly btnCreateTeacher: HTMLButtonElement;
  readonly btnRefreshAdmin: HTMLButtonElement;
  readonly teacherTableBody: HTMLElement;
  readonly teacherEmptyState: HTMLElement;
  // Create Teacher Dialog
  readonly createTeacherDialog: HTMLDialogElement;
  readonly newTeacherNameInput: HTMLInputElement;
  readonly newTeacherUsernameInput: HTMLInputElement;
  readonly newTeacherPasswordInput: HTMLInputElement;
  readonly btnCreateTeacherConfirm: HTMLButtonElement;
  readonly btnCreateTeacherCancel: HTMLButtonElement;
  readonly btnCloseCreateTeacherDialog: HTMLButtonElement;
  readonly createTeacherError: HTMLElement;
  // Reset Password Dialog
  readonly resetPasswordDialog: HTMLDialogElement;
  readonly resetPasswordTeacherName: HTMLElement;
  readonly resetPasswordInput: HTMLInputElement;
  readonly btnResetPasswordConfirm: HTMLButtonElement;
  readonly btnResetPasswordCancel: HTMLButtonElement;
  readonly btnCloseResetPasswordDialog: HTMLButtonElement;
  readonly resetPasswordError: HTMLElement;
}

export function createAdminView(container: HTMLElement, doc: Document = document): AdminViewElements {
  container.replaceChildren();

  const layout = doc.createElement('div');
  layout.className = 'admin-layout';

  // 1. TopBar
  const topbar = doc.createElement('header');
  topbar.className = 'ui-topbar';

  const brand = doc.createElement('span');
  brand.className = 'ui-brand';
  brand.textContent = 'Cunata';

  const topbarRole = doc.createElement('span');
  topbarRole.className = 'ui-topbar-role';
  topbarRole.textContent = 'Quản trị hệ thống';

  const topbarPerson = doc.createElement('span');
  topbarPerson.className = 'ui-topbar-person';

  const topbarActions = doc.createElement('div');
  topbarActions.className = 'ui-actions';

  const btnLogout = doc.createElement('button');
  btnLogout.id = 'btnAdminLogout';
  btnLogout.type = 'button';
  btnLogout.className = 'ui-button ui-button--ghost';
  btnLogout.setAttribute('aria-label', 'Đăng xuất quản trị');
  btnLogout.style.display = 'none';

  const logoutIcon = Icon('logout', doc);
  const logoutLabel = doc.createElement('span');
  logoutLabel.className = 'ui-button-label';
  logoutLabel.textContent = 'Đăng xuất';
  btnLogout.append(logoutIcon, logoutLabel);
  topbarActions.append(btnLogout);

  topbar.append(brand, topbarRole, topbarPerson, topbarActions);
  layout.append(topbar);

  // 2. Main content container
  const main = doc.createElement('main');
  main.className = 'admin-main ui-page';

  // 3. Login Section: #adminLogin
  const adminLogin = doc.createElement('div');
  adminLogin.id = 'adminLogin';
  adminLogin.className = 'ui-card ui-stack admin-login-card';

  const loginTitle = doc.createElement('h1');
  loginTitle.textContent = 'Đăng nhập Quản trị';

  const loginHint = doc.createElement('div');
  loginHint.className = 'ui-field-hint';
  loginHint.textContent = 'Trang riêng dành cho ban quản trị hệ thống Cunata';

  const passwordField = doc.createElement('div');
  passwordField.className = 'ui-field';

  const passwordLabel = doc.createElement('label');
  passwordLabel.className = 'ui-field-label';
  passwordLabel.htmlFor = 'adminPassword';
  passwordLabel.textContent = 'Mật khẩu quản trị';

  const adminPasswordInput = doc.createElement('input');
  adminPasswordInput.id = 'adminPassword';
  adminPasswordInput.type = 'password';
  adminPasswordInput.className = 'ui-control';
  adminPasswordInput.setAttribute('autocomplete', 'current-password');
  adminPasswordInput.required = true;

  passwordField.append(passwordLabel, adminPasswordInput);

  const adminLoginError = doc.createElement('div');
  adminLoginError.id = 'adminLoginError';
  adminLoginError.className = 'ui-field-error';
  adminLoginError.setAttribute('aria-live', 'polite');

  const btnAdminLogin = doc.createElement('button');
  btnAdminLogin.id = 'btnAdminLogin';
  btnAdminLogin.type = 'button';
  btnAdminLogin.className = 'ui-button ui-button--primary';

  const loginBtnLabel = doc.createElement('span');
  loginBtnLabel.className = 'ui-button-label';
  loginBtnLabel.textContent = 'Đăng nhập';
  btnAdminLogin.append(loginBtnLabel);

  adminLogin.append(loginTitle, loginHint, passwordField, adminLoginError, btnAdminLogin);

  const loginWrapper = doc.createElement('div');
  loginWrapper.className = 'admin-login-wrapper';
  loginWrapper.append(adminLogin);
  main.append(loginWrapper);

  // 4. Panel Section: #adminPanel
  const adminPanel = doc.createElement('div');
  adminPanel.id = 'adminPanel';
  adminPanel.className = 'ui-stack';
  adminPanel.style.display = 'none';

  // 4.1 Stats: #adminStats
  const adminStats = doc.createElement('div');
  adminStats.id = 'adminStats';
  adminStats.className = 'admin-stats-container';
  adminPanel.append(adminStats);

  // 4.2 Toolbar
  const toolbar = doc.createElement('div');
  toolbar.className = 'admin-toolbar';

  const btnCreateTeacher = doc.createElement('button');
  btnCreateTeacher.id = 'btnCreateTeacher';
  btnCreateTeacher.type = 'button';
  btnCreateTeacher.className = 'ui-button ui-button--primary';
  const plusIcon = Icon('plus', doc);
  const createLabel = doc.createElement('span');
  createLabel.className = 'ui-button-label';
  createLabel.textContent = 'Tạo tài khoản giáo viên';
  btnCreateTeacher.append(plusIcon, createLabel);

  const btnRefreshAdmin = doc.createElement('button');
  btnRefreshAdmin.id = 'btnRefreshAdmin';
  btnRefreshAdmin.type = 'button';
  btnRefreshAdmin.className = 'ui-button ui-button--secondary';
  const refreshIcon = Icon('refresh', doc);
  const refreshLabel = doc.createElement('span');
  refreshLabel.className = 'ui-button-label';
  refreshLabel.textContent = 'Làm mới';
  btnRefreshAdmin.append(refreshIcon, refreshLabel);

  toolbar.append(btnCreateTeacher, btnRefreshAdmin);
  adminPanel.append(toolbar);

  // 4.3 Teacher Table
  const teachersSection = doc.createElement('section');
  teachersSection.className = 'admin-teachers-section';

  const teachersTitle = doc.createElement('h2');
  teachersTitle.textContent = 'Danh sách tài khoản giáo viên';

  const tableWrapper = doc.createElement('div');
  tableWrapper.className = 'ui-table-wrap admin-table-wrapper';
  tableWrapper.setAttribute('tabindex', '0');
  tableWrapper.setAttribute('role', 'region');
  tableWrapper.setAttribute('aria-label', 'Danh sách giáo viên');

  const table = doc.createElement('table');
  table.className = 'ui-table';

  const caption = doc.createElement('caption');
  caption.textContent = 'Danh sách tài khoản giáo viên trong hệ thống';

  const thead = doc.createElement('thead');
  const headerRow = doc.createElement('tr');

  const thName = doc.createElement('th');
  thName.textContent = 'Họ và tên';
  const thUsername = doc.createElement('th');
  thUsername.textContent = 'Tên đăng nhập';
  const thStatus = doc.createElement('th');
  thStatus.textContent = 'Trạng thái';
  const thActions = doc.createElement('th');
  thActions.textContent = 'Thao tác';

  headerRow.append(thName, thUsername, thStatus, thActions);
  thead.append(headerRow);

  const teacherTableBody = doc.createElement('tbody');
  table.append(caption, thead, teacherTableBody);
  tableWrapper.append(table);

  const teacherEmptyState = doc.createElement('div');
  teacherEmptyState.className = 'admin-empty-state ui-card';
  teacherEmptyState.style.display = 'none';
  const emptyIcon = Icon('teacher', doc);
  const emptyText = doc.createElement('p');
  emptyText.textContent = 'Chưa có tài khoản giáo viên nào. Bấm nút "Tạo tài khoản giáo viên" để tạo tài khoản đầu tiên.';
  teacherEmptyState.append(emptyIcon, emptyText);

  teachersSection.append(teachersTitle, tableWrapper, teacherEmptyState);
  adminPanel.append(teachersSection);

  // 5. Create Teacher Dialog
  const createTeacherDialog = doc.createElement('dialog');
  createTeacherDialog.id = 'createTeacherDialog';
  createTeacherDialog.className = 'ui-dialog';
  createTeacherDialog.setAttribute('role', 'dialog');
  createTeacherDialog.setAttribute('aria-modal', 'true');
  createTeacherDialog.setAttribute('aria-labelledby', 'createTeacherTitle');

  const createDialogHeading = doc.createElement('div');
  createDialogHeading.className = 'ui-dialog-heading';

  const createTeacherTitle = doc.createElement('h2');
  createTeacherTitle.id = 'createTeacherTitle';
  createTeacherTitle.textContent = 'Tạo tài khoản giáo viên';

  const btnCloseCreateTeacherDialog = doc.createElement('button');
  btnCloseCreateTeacherDialog.type = 'button';
  btnCloseCreateTeacherDialog.className = 'ui-button ui-button--ghost';
  btnCloseCreateTeacherDialog.setAttribute('aria-label', 'Đóng hộp thoại tạo giáo viên');
  btnCloseCreateTeacherDialog.append(Icon('close', doc));

  createDialogHeading.append(createTeacherTitle, btnCloseCreateTeacherDialog);

  const createFormStack = doc.createElement('div');
  createFormStack.className = 'ui-stack';

  // Field: Name
  const fieldName = doc.createElement('div');
  fieldName.className = 'ui-field';
  const labelName = doc.createElement('label');
  labelName.className = 'ui-field-label';
  labelName.htmlFor = 'newTeacherName';
  labelName.textContent = 'Họ và tên giáo viên';
  const newTeacherNameInput = doc.createElement('input');
  newTeacherNameInput.id = 'newTeacherName';
  newTeacherNameInput.type = 'text';
  newTeacherNameInput.className = 'ui-control';
  newTeacherNameInput.placeholder = 'Ví dụ: Cô Lan';
  newTeacherNameInput.required = true;
  fieldName.append(labelName, newTeacherNameInput);

  // Field: Username
  const fieldUsername = doc.createElement('div');
  fieldUsername.className = 'ui-field';
  const labelUsername = doc.createElement('label');
  labelUsername.className = 'ui-field-label';
  labelUsername.htmlFor = 'newTeacherUsername';
  labelUsername.textContent = 'Tên đăng nhập';
  const newTeacherUsernameInput = doc.createElement('input');
  newTeacherUsernameInput.id = 'newTeacherUsername';
  newTeacherUsernameInput.type = 'text';
  newTeacherUsernameInput.className = 'ui-control';
  newTeacherUsernameInput.placeholder = 'Ví dụ: colan';
  newTeacherUsernameInput.setAttribute('autocomplete', 'off');
  newTeacherUsernameInput.required = true;
  const usernameHint = doc.createElement('div');
  usernameHint.className = 'ui-field-hint';
  usernameHint.textContent = '3–32 ký tự bao gồm a-z, 0-9, dấu chấm, gạch dưới hoặc gạch nối';
  fieldUsername.append(labelUsername, newTeacherUsernameInput, usernameHint);

  // Field: Password
  const fieldPassword = doc.createElement('div');
  fieldPassword.className = 'ui-field';
  const labelPassword = doc.createElement('label');
  labelPassword.className = 'ui-field-label';
  labelPassword.htmlFor = 'newTeacherPassword';
  labelPassword.textContent = 'Mật khẩu ban đầu';
  const newTeacherPasswordInput = doc.createElement('input');
  newTeacherPasswordInput.id = 'newTeacherPassword';
  newTeacherPasswordInput.type = 'password';
  newTeacherPasswordInput.className = 'ui-control';
  newTeacherPasswordInput.setAttribute('autocomplete', 'new-password');
  newTeacherPasswordInput.required = true;
  const passwordHint = doc.createElement('div');
  passwordHint.className = 'ui-field-hint';
  passwordHint.textContent = 'Tối thiểu 8 ký tự';
  fieldPassword.append(labelPassword, newTeacherPasswordInput, passwordHint);

  const createTeacherError = doc.createElement('div');
  createTeacherError.id = 'createTeacherError';
  createTeacherError.className = 'ui-field-error';
  createTeacherError.setAttribute('aria-live', 'polite');

  createFormStack.append(fieldName, fieldUsername, fieldPassword, createTeacherError);

  const createActions = doc.createElement('div');
  createActions.className = 'ui-actions ui-dialog-actions';

  const btnCreateTeacherCancel = doc.createElement('button');
  btnCreateTeacherCancel.id = 'btnCreateTeacherCancel';
  btnCreateTeacherCancel.type = 'button';
  btnCreateTeacherCancel.className = 'ui-button ui-button--ghost';
  const cancelCreateLabel = doc.createElement('span');
  cancelCreateLabel.className = 'ui-button-label';
  cancelCreateLabel.textContent = 'Hủy';
  btnCreateTeacherCancel.append(cancelCreateLabel);

  const btnCreateTeacherConfirm = doc.createElement('button');
  btnCreateTeacherConfirm.id = 'btnCreateTeacherConfirm';
  btnCreateTeacherConfirm.type = 'button';
  btnCreateTeacherConfirm.className = 'ui-button ui-button--primary';
  const confirmCreateLabel = doc.createElement('span');
  confirmCreateLabel.className = 'ui-button-label';
  confirmCreateLabel.textContent = 'Xác nhận tạo';
  btnCreateTeacherConfirm.append(confirmCreateLabel);

  createActions.append(btnCreateTeacherCancel, btnCreateTeacherConfirm);
  createTeacherDialog.append(createDialogHeading, createFormStack, createActions);
  adminPanel.append(createTeacherDialog);

  // 6. Reset Password Dialog
  const resetPasswordDialog = doc.createElement('dialog');
  resetPasswordDialog.id = 'resetPasswordDialog';
  resetPasswordDialog.className = 'ui-dialog';
  resetPasswordDialog.setAttribute('role', 'dialog');
  resetPasswordDialog.setAttribute('aria-modal', 'true');
  resetPasswordDialog.setAttribute('aria-labelledby', 'resetPasswordTitle');

  const resetDialogHeading = doc.createElement('div');
  resetDialogHeading.className = 'ui-dialog-heading';

  const resetPasswordTitle = doc.createElement('h2');
  resetPasswordTitle.id = 'resetPasswordTitle';
  resetPasswordTitle.textContent = 'Đặt lại mật khẩu giáo viên';

  const btnCloseResetPasswordDialog = doc.createElement('button');
  btnCloseResetPasswordDialog.type = 'button';
  btnCloseResetPasswordDialog.className = 'ui-button ui-button--ghost';
  btnCloseResetPasswordDialog.setAttribute('aria-label', 'Đóng hộp thoại đặt lại mật khẩu');
  btnCloseResetPasswordDialog.append(Icon('close', doc));

  resetDialogHeading.append(resetPasswordTitle, btnCloseResetPasswordDialog);

  const resetFormStack = doc.createElement('div');
  resetFormStack.className = 'ui-stack';

  const resetPasswordTeacherName = doc.createElement('div');
  resetPasswordTeacherName.className = 'ui-field-hint';

  const fieldResetPw = doc.createElement('div');
  fieldResetPw.className = 'ui-field';
  const labelResetPw = doc.createElement('label');
  labelResetPw.className = 'ui-field-label';
  labelResetPw.htmlFor = 'resetPasswordInput';
  labelResetPw.textContent = 'Mật khẩu mới';

  const resetPasswordInput = doc.createElement('input');
  resetPasswordInput.id = 'resetPasswordInput';
  resetPasswordInput.type = 'password';
  resetPasswordInput.className = 'ui-control';
  resetPasswordInput.setAttribute('autocomplete', 'new-password');
  resetPasswordInput.required = true;

  const resetPwHint = doc.createElement('div');
  resetPwHint.className = 'ui-field-hint';
  resetPwHint.textContent = 'Mật khẩu mới tối thiểu 8 ký tự';

  fieldResetPw.append(labelResetPw, resetPasswordInput, resetPwHint);

  const resetPasswordError = doc.createElement('div');
  resetPasswordError.id = 'resetPasswordError';
  resetPasswordError.className = 'ui-field-error';
  resetPasswordError.setAttribute('aria-live', 'polite');

  resetFormStack.append(resetPasswordTeacherName, fieldResetPw, resetPasswordError);

  const resetActions = doc.createElement('div');
  resetActions.className = 'ui-actions ui-dialog-actions';

  const btnResetPasswordCancel = doc.createElement('button');
  btnResetPasswordCancel.id = 'btnResetPasswordCancel';
  btnResetPasswordCancel.type = 'button';
  btnResetPasswordCancel.className = 'ui-button ui-button--ghost';
  const cancelResetLabel = doc.createElement('span');
  cancelResetLabel.className = 'ui-button-label';
  cancelResetLabel.textContent = 'Hủy';
  btnResetPasswordCancel.append(cancelResetLabel);

  const btnResetPasswordConfirm = doc.createElement('button');
  btnResetPasswordConfirm.id = 'btnResetPasswordConfirm';
  btnResetPasswordConfirm.type = 'button';
  btnResetPasswordConfirm.className = 'ui-button ui-button--primary';
  const confirmResetLabel = doc.createElement('span');
  confirmResetLabel.className = 'ui-button-label';
  confirmResetLabel.textContent = 'Xác nhận';
  btnResetPasswordConfirm.append(confirmResetLabel);

  resetActions.append(btnResetPasswordCancel, btnResetPasswordConfirm);
  resetPasswordDialog.append(resetDialogHeading, resetFormStack, resetActions);
  adminPanel.append(resetPasswordDialog);

  main.append(adminPanel);
  layout.append(main);
  container.append(layout);

  return {
    root: layout,
    topbarRole,
    topbarActions,
    btnLogout,
    adminLogin,
    adminPasswordInput,
    btnAdminLogin,
    adminLoginError,
    adminPanel,
    adminStats,
    btnCreateTeacher,
    btnRefreshAdmin,
    teacherTableBody,
    teacherEmptyState,
    createTeacherDialog,
    newTeacherNameInput,
    newTeacherUsernameInput,
    newTeacherPasswordInput,
    btnCreateTeacherConfirm,
    btnCreateTeacherCancel,
    btnCloseCreateTeacherDialog,
    createTeacherError,
    resetPasswordDialog,
    resetPasswordTeacherName,
    resetPasswordInput,
    btnResetPasswordConfirm,
    btnResetPasswordCancel,
    btnCloseResetPasswordDialog,
    resetPasswordError,
  };
}

export function renderAdminStats(container: HTMLElement, stats: AdminStats, doc: Document = document): void {
  container.replaceChildren();

  const resultsCount = stats.results ?? 0;
  const cardsData: readonly [string, number][] = [
    ['Giáo viên', stats.teachers],
    ['Lớp học', stats.classes],
    ['Đề thi', stats.exams],
    ['Bài nộp', resultsCount],
  ];

  for (const [label, num] of cardsData) {
    const card = doc.createElement('div');
    card.className = 'ui-card admin-stat-card';

    const numSpan = doc.createElement('span');
    numSpan.className = 'admin-stat-num';
    numSpan.textContent = String(num);

    const labelSpan = doc.createElement('span');
    labelSpan.className = 'admin-stat-label';
    labelSpan.textContent = label;

    card.append(numSpan, labelSpan);
    container.append(card);
  }

  const summary = doc.createElement('div');
  summary.className = 'admin-stats-summary';
  summary.textContent = `${stats.teachers} giáo viên · ${stats.classes} lớp học · ${stats.exams} đề thi · ${resultsCount} bài nộp`;
  container.append(summary);
}

export function renderTeacherRows(
  tbody: HTMLElement,
  teachers: readonly TeacherAccountInfo[],
  callbacks: {
    onResetPassword(username: string, name: string): void;
    onToggleActive(username: string, currentActive: boolean): void;
  },
  doc: Document = document
): void {
  tbody.replaceChildren();

  for (const teacher of teachers) {
    const row = doc.createElement('tr');
    row.className = 'teacher-row';
    row.dataset.username = teacher.username;

    // 1. Name
    const tdName = doc.createElement('td');
    const labelName = doc.createElement('span');
    labelName.className = 'ui-table-label';
    labelName.textContent = 'Họ và tên';
    const valName = doc.createElement('span');
    valName.className = 'teacher-name';
    valName.textContent = teacher.name;
    tdName.append(labelName, valName);

    // 2. Username
    const tdUsername = doc.createElement('td');
    const labelUsername = doc.createElement('span');
    labelUsername.className = 'ui-table-label';
    labelUsername.textContent = 'Tên đăng nhập';
    const valUsername = doc.createElement('span');
    valUsername.className = 'teacher-username';
    valUsername.textContent = `@${teacher.username}`;
    tdUsername.append(labelUsername, valUsername);

    // 3. Status
    const tdStatus = doc.createElement('td');
    const labelStatus = doc.createElement('span');
    labelStatus.className = 'ui-table-label';
    labelStatus.textContent = 'Trạng thái';
    const badge = doc.createElement('span');
    const isActive = teacher.active !== false;
    badge.className = `ui-badge ${isActive ? 'ui-badge--submitted' : 'ui-badge--expired'}`;
    badge.textContent = isActive ? 'Đang hoạt động' : 'Đã khóa';
    tdStatus.append(labelStatus, badge);

    // 4. Actions
    const tdActions = doc.createElement('td');
    const labelActions = doc.createElement('span');
    labelActions.className = 'ui-table-label';
    labelActions.textContent = 'Thao tác';

    const actionsWrap = doc.createElement('div');
    actionsWrap.className = 'teacher-actions';

    const btnReset = doc.createElement('button');
    btnReset.type = 'button';
    btnReset.className = 'ui-button ui-button--secondary btn-reset-password';
    btnReset.setAttribute('aria-label', `Đặt lại mật khẩu cho ${teacher.name}`);
    const editIcon = Icon('edit', doc);
    const resetLabel = doc.createElement('span');
    resetLabel.className = 'ui-button-label';
    resetLabel.textContent = 'Đặt lại mật khẩu';
    btnReset.append(editIcon, resetLabel);
    btnReset.addEventListener('click', () => callbacks.onResetPassword(teacher.username, teacher.name));

    const btnToggle = doc.createElement('button');
    btnToggle.type = 'button';
    btnToggle.className = `ui-button ui-button--secondary btn-toggle-teacher`;
    btnToggle.setAttribute('aria-label', `${isActive ? 'Khóa' : 'Mở khóa'} tài khoản ${teacher.name}`);
    const toggleIcon = Icon(isActive ? 'warning' : 'check', doc);
    const toggleLabel = doc.createElement('span');
    toggleLabel.className = 'ui-button-label';
    toggleLabel.textContent = isActive ? 'Khóa tài khoản' : 'Mở khóa';
    btnToggle.append(toggleIcon, toggleLabel);
    btnToggle.addEventListener('click', () => callbacks.onToggleActive(teacher.username, isActive));

    actionsWrap.append(btnReset, btnToggle);
    tdActions.append(labelActions, actionsWrap);

    row.append(tdName, tdUsername, tdStatus, tdActions);
    tbody.append(row);
  }
}
