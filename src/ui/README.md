# Thành phần giao diện Cunata

Nguồn quy chuẩn: `docs/design/DESIGN.md`, hợp đồng DOM: `docs/contracts/WEB-contract.md` §19.
Không có dependency, không nạp phông hoặc tài nguyên từ mạng. Biểu tượng tự vẽ trong `icons.ts`.

## Nạp và tích hợp

Import hàm từ `src/ui/components.ts` hoặc barrel `src/ui/index.ts`.
Nạp **một lần**, sau CSS cũ: `<link rel="stylesheet" href="./ui/components.css">`.
`components.css` tự import `./tokens.css`. Nhóm app/build cần chép cả hai file vào `dist/ui/`
và đưa vào precache trước khi tính build digest; TypeScript không tự chép CSS.
Không sửa `index.html` gốc. Dùng `ui-page`, `ui-stack`, `ui-actions`, `ui-exam-grid`
cho khung nội dung, xếp dọc, hàng nút và lưới đề. Với điều hướng cố định, thêm `ui-with-nav`
vào nội dung để chừa chỗ thanh dưới; chỉ mount **một** NavRail hoặc BottomNav.
Bọc nav và main trong `.ui-shell` để tự đặt nav ở cột trái trên desktop.

Các hàm chỉ dựng DOM, không lưu dữ liệu, chấm điểm, gọi mạng hoặc quyết định quyền.
Mô tả đề thiếu dùng “Đề luyện tập N câu”, theo D05 (WEB-contract §14): bản này chỉ có
đề tùy chỉnh, chưa có mẫu chuẩn THPT được xác minh.
Tham số cuối tùy chọn là `Document` (mặc định `document`). Chuỗi được đưa vào `textContent`;
`Content` nhận chuỗi, Node hoặc mảng của chúng. Node phải do caller dựng an toàn, không nhận HTML thô.
Caller gắn id bắt buộc theo §19, điều khiển trạng thái và dọn DOM khi đổi route.

| API | Kết quả / tham số chính |
|---|---|
| `Button({label, variant?, icon?, iconOnly?, id?, type?, disabled?, loading?, onClick?})` | ButtonElement; `setLoading(bool)` giữ bề rộng, `setDisabled(bool)` cập nhật native + aria. Variant primary/secondary/ghost/danger. |
| `Input({label, id?, type?, value?, hint?, error?, required?, disabled?, autocomplete?, inputMode?, onInput?})` | `{element, control, setError(message)}`. `element` chứa nhãn, control, gợi ý, lỗi có icon; chuỗi rỗng xóa lỗi. |
| `Select({...FieldOptions, options:[{value,label,disabled?}]})` | Cùng Field; nhãn hiện thường trực. |
| `Textarea(FieldOptions)` | Cùng Field; không cắt/chuẩn hóa chuỗi, giữ IME gốc. |
| `Card(content?)` | Div surface; dùng cho nội dung và các nhóm hành động độc lập. |
| `ExamCard({id,title,subject,description?,questionCount,durationMinutes,status,score?,url?,assignmentId?,source?,openAt?,dueAt?,onClick?})` | Một button `.exam-card.exam-list-item[data-exam-id]`, không lồng nút. `url` chỉ là data-exam-url, caller tự kiểm URL trước fetch. Ngày giờ/điểm nhận chuỗi đã định dạng theo policy. |
| `StatusBadge({status,score?})` | Span `.exam-status`; status: not-started/draft/submitted/expired/not-open. |
| `TopBar({role,name?,action?})` | Header Cunata, vai, tên, một Button tùy chọn. |
| `NavRail({id?,label?,items:[{key,label,href,icon}],active,onNavigate?})` | Nav responsive: cột 240px ≥1024, thanh dưới khi hẹp; data-nav + aria-current. href tương đối cùng ứng dụng. |
| `BottomNav(NavOptions)` | Cùng hành vi responsive như NavRail, dùng thay thế chứ không mount cả hai. |
| `Dialog({id?,title,content,actions?,initialFocus?,onClose?})` | `{element,body,actions,open(opener?),close(),destroy()}`. Native modal, trap Tab/Shift+Tab, Esc, trả focus; tự mount vào body khi mở. Actions là ButtonOptions, callback tự gọi close nếu thích hợp. |
| `BottomSheet(DialogOptions)` | Cùng Dialog; cả hai hiển thị tấm trượt sát đáy toàn rộng dưới 640px. |
| `Toast(message)` | `{element,show(root?),destroy()}`; role=status, tự gỡ sau 4 giây; gọi destroy khi đổi route. |
| `EmptyState({message,icon?,action?})` | Div có icon, lời giải thích và Button tùy chọn. Caller cung cấp hành động khi có đường tiếp tục. |
| `ErrorState(StateOptions)` | Khối lỗi role=alert tại chỗ; caller cung cấp lời giải thích + action “Thử lại”. |
| `OfflineBanner({onRetry?}?)` | Dải role=status; chỉ mount khi bài làm **đã được lưu cục bộ thành công** và đang ngoại tuyến. Lỗi lưu dùng ErrorState, không hứa đã lưu. |
| `Skeleton({lines?,label?}?)` | Khối mô phỏng nội dung, aria-busy; thay bằng nội dung thật/lỗi sau khi tải. |
| `Table({id?,caption,columns:[{key,label,numeric?,cell(row)}],rows})` | Div cuộn chứa table có caption, scope/headers; đầu cột sticky, hàng 48px, thành thẻ dưới 640px. |
| `Icon(name)` | SVG nét tự vẽ 24/20px, currentColor, stroke 1.75, aria-hidden. Nút chỉ icon luôn có label. |

Mỗi hàm có alias `create*`; riêng `StatusBadge` là `createExamStatusBadge` để không đụng
`createStatusBadge` cũ (trạng thái lưu). `StatusBadgeOptions` cũ vẫn giữ nguyên ở barrel;
kiểu badge đề mới là `ExamStatusBadgeOptions` ở barrel hoặc `StatusBadgeOptions` trong components.

```ts
import { Button, Input, ExamCard, Dialog } from '../ui/components.ts';
const name = Input({ id: 'startName', label: 'Tên của bạn', autocomplete: 'name' });
root.append(name.element);
const preview = Dialog({ id: 'examPreview', title: 'Thông tin đề', content: '28 câu · 50 phút' });
root.append(ExamCard({
  id: 'ly-12', subject: 'Vật lí', title: 'Luyện tập chương I',
  questionCount: 28, durationMinutes: 50, status: 'not-started',
  onClick: (event) => preview.open(event.currentTarget as HTMLElement),
}));
preview.actions.append(Button({ id: 'btnStartExam', label: 'Bắt đầu làm bài', variant: 'primary',
  onClick: () => { preview.close(); /* controller bắt đầu lượt làm */ },
}));
// Khi đổi route: preview.destroy(); toast?.destroy(); root.replaceChildren();
```

## Tương thích cũ

Các export cũ trong `index.ts` vẫn tồn tại. Các thành phần trình bày cũ được đánh dấu
`@deprecated`; dùng components cho màn mới. Helpers an toàn nội dung, IME, announcer và mount
vẫn dùng được. CSS cũ đã dùng màu token; caller cũ cũng cần nạp components.css để có token.
Không đổi chữ ký controller, dữ liệu lưu hoặc DOM của vùng khác trong task RD-ui.

## Kiểm tra

`node --test "test/ui/**/*.test.ts"` chạy kiểm thử cũ và unit trên trình duyệt thật của thành phần mới.
`test/ui/redesign/components.test.ts` dùng harness CDP có sẵn, transpile trong bộ nhớ, không cần dist;
đo 375/768/1440px, sáng/tối, focus trap/return, loading, lỗi nhập, bảng, trạng thái và reduced motion.
`node --test test/claude-check/design.test.mjs` là gate tích hợp toàn trang, cần app/student/teacher/admin/build
đã nối API và CSS; xem lỗi thật để phân vùng, không thay các test độc lập.
