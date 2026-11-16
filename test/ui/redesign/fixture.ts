/// <reference lib="dom" />
import * as ui from '../../../src/ui/components.ts';

export function mountFixture(): void {
  document.body.replaceChildren();
  const top = ui.TopBar({ role: 'Giáo viên', name: 'Nguyễn Thị Minh Anh', action: { label: 'Đổi vai', variant: 'ghost' } });
  const root = document.createElement('main'); root.className = 'ui-page ui-stack ui-with-nav';
  const input = ui.Input({ id: 'name', label: 'Tên lớp', hint: 'Nhập tên lớp học', error: 'Vui lòng nhập tên lớp' });
  const select = ui.Select({ id: 'subject', label: 'Môn học', options: [{ value: 'ly', label: 'Vật lí' }] });
  const textarea = ui.Textarea({ id: 'description', label: 'Mô tả' });
  const grid = document.createElement('div'); grid.className = 'ui-exam-grid';
  for (const [index, status] of (['not-started', 'draft', 'submitted', 'expired', 'not-open'] as const).entries()) grid.append(ui.ExamCard({
    id: `exam-${index}`, title: 'Luyện tập kiến thức với tiêu đề rất dài '.repeat(4), subject: index % 2 ? 'Toán' : 'Vật lí',
    questionCount: 28, durationMinutes: 50, status, score: '7,25', url: 'public/exams/test.json',
    openAt: '20:00, 18/11/2026', dueAt: '20:00, 20/11/2026',
  }));
  const opener = ui.Button({ id: 'opener', label: 'Xem thông tin', variant: 'primary' });
  const longButton = ui.Button({ label: 'Hành động với nhãn dài '.repeat(8) });
  const loading = ui.Button({ id: 'loading', label: 'Giao đề cho lớp' });
  const inside = ui.Input({ id: 'inside', label: 'Tên mới' });
  const dialog = ui.Dialog({ id: 'dialog', title: 'Đổi tên lớp', content: inside.element,
    initialFocus: inside.control,
    actions: [{ label: 'Lưu thay đổi', variant: 'primary', id: 'dialog-save' }],
  });
  opener.onclick = () => dialog.open(opener);
  const table = ui.Table({ id: 'results', caption: 'Kết quả lớp', columns: [
    { key: 'name', label: 'Tên', cell: (row: { name: string; score: string }) => row.name },
    { key: 'score', label: 'Tổng điểm', numeric: true, cell: (row: { name: string; score: string }) => row.score },
  ], rows: [{ name: 'Nguyễn <img src=x onerror=alert(1)>', score: '7,25 / 10' }] });
  root.append(input.element, select.element, textarea.element, opener, loading, longButton, grid, table,
    ui.Skeleton(), ui.EmptyState({ message: 'Chưa có lớp nào.', action: { label: 'Tạo lớp đầu tiên' } }),
    ui.ErrorState({ message: 'Chưa tải được danh sách. Hãy kiểm tra kết nối và thử lại.', action: { label: 'Thử lại' } }),
    ui.OfflineBanner({ onRetry() {} }));
  const nav = ui.NavRail({ id: 'nav', active: 'lop', items: [
    { key: 'lop', label: 'Lớp học', href: '#/giao-vien/lop', icon: 'classes' },
    { key: 'de', label: 'Đề thi', href: '#/giao-vien/de', icon: 'book' },
    { key: 'ket-qua', label: 'Kết quả', href: '#/giao-vien/ket-qua', icon: 'results' },
  ] });
  const shell = document.createElement('div'); shell.className = 'ui-shell'; shell.append(nav, root);
  document.body.append(top, shell);
  Object.assign(window, { fixture: { ...ui, input, select, textarea, loading, dialog } });
}
mountFixture();
