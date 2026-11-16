import { Button, TopBar } from '../ui/components.ts';
import type { Router, RouteState } from './routes.ts';

export const ROLE_STORAGE_KEY = 'cunata:role';
export type Role = 'student' | 'teacher';
export function readRememberedRole(storage: Pick<Storage, 'getItem'> | undefined): Role | null {
  try { const value = storage?.getItem(ROLE_STORAGE_KEY); return value === 'student' || value === 'teacher' ? value : null; }
  catch { return null; }
}

/** The composition shell owns navigation only; each area retains its own DOM and lifecycle. */
export function mountRoleShell(root: HTMLElement, router: Router, onChangeName?: () => void) {
  const doc = root.ownerDocument;
  const host = doc.createElement('div'); host.id = 'appTopBar';
  const chooser = doc.createElement('main'); chooser.id = 'roleChooser'; chooser.className = 'ui-page ui-stack role-chooser';
  chooser.hidden = router.getState().route !== 'chooser';
  const title = doc.createElement('h1'); title.textContent = 'Chào mừng đến với Cunata';
  const intro = doc.createElement('p'); intro.textContent = 'Chọn vai trò để bắt đầu.';
  const choices = doc.createElement('div'); choices.className = 'ui-exam-grid';
  const choose = (role: Role) => {
    try { doc.defaultView?.localStorage.setItem(ROLE_STORAGE_KEY, role); } catch { /* Navigation still works without preference storage. */ }
    router.navigate(role, router.getState().params);
  };
  for (const [role, id, label, detail] of [
    ['student', 'btnRoleStudent', 'Học sinh', 'Vào lớp, làm đề luyện tập'],
    ['teacher', 'btnRoleTeacher', 'Giáo viên', 'Quản lý lớp, đề và kết quả'],
  ] as const) {
    const button = Button({ id, label, variant: 'secondary', icon: role === 'student' ? 'student' : 'teacher', onClick: () => choose(role) }, doc);
    const description = doc.createElement('span'); description.className = 'role-description'; description.textContent = detail;
    button.append(description); button.classList.add('ui-card'); choices.append(button);
  }
  chooser.append(title, intro, choices); root.prepend(host, chooser);
  const oldHeader = root.querySelector<HTMLElement>('.app-header');
  const syncStatus = root.querySelector<HTMLElement>('#syncStatus');
  const syncParent = syncStatus?.parentElement;
  const reportStatus = doc.createElement('div'); reportStatus.className = 'ui-page'; reportStatus.hidden = true; host.after(reportStatus);
  const show = (state: RouteState, name = '', examActive = true) => {
    const exam = state.route === 'exam' && examActive;
    chooser.hidden = state.route !== 'chooser';
    host.hidden = exam;
    if (oldHeader) oldHeader.hidden = !exam;
    if (syncStatus && syncParent) syncParent.append(syncStatus);
    reportStatus.hidden = state.route !== 'report';
    if (state.route === 'report' && syncStatus) { syncStatus.classList.add('ui-badge'); reportStatus.append(syncStatus); }
    host.replaceChildren(TopBar({
      role: state.route === 'teacher' ? 'Giáo viên' : state.route === 'chooser' ? '' : 'Học sinh', name,
      action: state.route === 'chooser' ? undefined : {
        id: 'btnChangeRole', label: 'Đổi vai', variant: 'ghost', onClick: () => {
          try { doc.defaultView?.localStorage.removeItem(ROLE_STORAGE_KEY); } catch { /* Preference is optional. */ }
          router.navigate('chooser');
        },
      },
    }, doc));
    if (name && state.route === 'student' && onChangeName) {
      host.querySelector('header')?.append(Button({ id: 'btnChangeName', label: 'Đổi tên', icon: 'user', iconOnly: true, variant: 'ghost', onClick: onChangeName }, doc));
    }
  };
  return { show, dispose() { if (syncStatus && syncParent) syncParent.append(syncStatus); host.remove(); chooser.remove(); reportStatus.remove(); } };
}
