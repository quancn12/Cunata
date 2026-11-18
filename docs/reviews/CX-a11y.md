# CX-a11y — Rà soát sâu Trợ năng (Accessibility) trên bản build dist

- `review_id / task_id / worker_id`: CX-a11y-anti; reviewer: Antigravity (tiếp quản và hoàn thiện từ bản rà soát của Codex).
- Ngày kiểm: 18/11/2026, môi trường Windows 11 x64, Node.js v24.14.0, Headless Chrome 157 (CDP qua `test/claude-check/harness.mjs` và `gas-server.mjs`).
- `base_commit`: `e7d8f85c99f28fef83d37187a2101e15be100d7b` (baseline đợt rà soát bắt đầu từ `178fb4f86735fd8fae89133a26a2ed3cf1c79185`).
- Kết luận: **CHANGES_REQUESTED**. Chưa đề nghị nghiệm thu trợ năng: phát hiện **1 BLOCKER** (thẻ lớp học không thể mở bằng bàn phím), **6 MAJOR** (hộp thoại xem trước/tạo lớp/giao đề/tấm trượt di động không giữ focus hoặc Esc không đóng/không trả focus; nhóm radio và Đúng/Sai thiếu ngữ nghĩa AX; bảng câu hỏi chỉ đổi màu mà không đổi trạng thái AX; trạng thái lưu thiếu `aria-live`; thiếu cấu trúc heading phân cấp), và **3 MINOR** (ô nhập mã lớp, đáp án ngắn, tên lớp thiếu `<label>` liên kết; combobox chọn đề tên rỗng; lỗi mã lớp thiếu `aria-invalid`/`aria-describedby`).
- Phạm vi tuân thủ: Chỉ tạo/sửa file trong `docs/reviews/CX-a11y.md` và `ops/blitz/a11y/**`. Không sửa mã nguồn `src/`, không sửa `dist/`, không commit, không deploy, không chạy `build.js`.

---

## 1. Căn cứ và snapshot

### 1.1 Căn cứ kỹ thuật và nghiệp vụ
1. **Shared Product Contract v2.0**: Mục 1 (giao diện hỗ trợ mọi đối tượng, điện thoại, desktop), Mục 2 (chuẩn 3 kiểu câu hỏi).
2. **WEB-contract.md**:
   - §9 (Màn hình và acceptance): Yêu cầu bàn phím toàn diện ("keyboard-only, focus visible/không trap ngoài modal, labels/fieldset/legend, status aria-live không đọc timer từng giây, contrast WCAG AA, touch target 44px, zoom 200%, reduced-motion").
   - §14–16 (Các quyết định giao diện, màn vào thi, chọn đề).
   - §17–18 (Apps Script, giới hạn bản build `dist/`).
   - §19.1–19.3 (Cấu trúc DOM bắt buộc: chọn vai, học sinh, giáo viên, admin, hộp thoại, tấm trượt).
3. **DESIGN.md**:
   - §1 (Nguyên tắc: một việc chính mỗi màn, theo vai, kế thừa, điện thoại trước, trung thực).
   - §2 (Tương tác & tiếp cận: vùng bấm 44×44px, `:focus-visible` bắt buộc, tương phản ≥ 4.5:1, không truyền ý nghĩa chỉ bằng màu, mọi nút biểu tượng có `aria-label`, chuyển động tắt khi `prefers-reduced-motion`).
   - §4 (Thành phần: Button, Input/Select/Textarea có nhãn hiển thị phía trên + `aria-invalid` + `aria-describedby`, Dialog/BottomSheet có `role="dialog"`, `aria-modal`, tiêu đề, Esc đóng, focus vào trong và trả về nút mở).
   - §5 (Phân cấp nội dung, cách viết chữ).
4. **BANG-QUYET-DINH.md**: D01–D08, ND-01.
5. **Tiêu chuẩn Web Accessibility**: WCAG 2.1 AA (1.3.1 Info and Relationships, 1.4.1 Use of Color, 1.4.10 Reflow, 2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order, 2.4.6 Headings and Labels, 3.3.1 Error Identification, 3.3.2 Labels or Instructions, 4.1.2 Name, Role, Value, 4.1.3 Status Messages).

### 1.2 Snapshot mã nguồn và bản build dist
Bản build `dist/` hiện thời được kiểm tra tại `e7d8f85c99f28fef83d37187a2101e15be100d7b`. Bảng hash SHA-256 các file thực thi chính:

| Đường dẫn file | SHA-256 |
|---|---|
| `dist/index.html` | `4f45f2dc2bbbddcf6d6f636feda6fe72c05c4fb04b34385f88ecaacdfc1de8e9` |
| `dist/admin.html` | `e3fb2aa3ce87be415a8f367301a6e4855b810f8d83f7c90a9f4c2d9bd5695ca9` |
| `dist/app/main.js` | `1c9e450807377b56403ebfa9180ca43975c5040595d88a7fe85ce0698656da6b` |
| `dist/student/view.js` | `37144f898606972175c48a40fbcc3f8e64242e7196ca690fce52ee1a79a1cae7` |
| `dist/student/area.js` | `461d4055c485c6140db2dfb686ccf2fd61b6559ece9ccf005abf09d243fff856` |
| `dist/teacher/portal.js` | `8e0586ff31fcfd7456888c556b65a3c651e4554ad9552ac8ae3ac0bf6b1c7f7e` |
| `dist/admin/main.js` | `9d53505da08b5c3f6e458d33db1ec0d65e018257845e8bb063639ac5684e4d33` |

Toàn bộ manifest 318 file dist được lưu tại `ops/blitz/a11y/baseline.json`.

---

## 2. Phạm vi đã chạy và phương pháp kiểm thử

Mọi tương tác được thực hiện qua Chrome DevTools Protocol (CDP) trên trình duyệt Chrome ẩn thực tế; phục vụ dist dưới subpath `/Cunata/` qua `test/claude-check/harness.mjs` và giả lập backend Apps Script qua `gas-server.mjs`. Các thao tác bàn phím là phím thật (`Input.dispatchKeyEvent`, `Input.insertText`), không gán `.value` bằng script DOM.

| Luồng / Tiêu chí | Nội dung kiểm thử thực tế | Kết quả quan sát |
|---|---|---|
| **Học sinh — Bàn phím toàn trình** | Tab/Enter chọn vai Học sinh → nhập tên `#startName` → bấm `#btnNameContinue` → nhập mã lớp `#classCodeInput` → bấm `#btnJoinClass` → mở đề → làm 3 phần → mở `#submitModal` → nộp → xem `#reportWrapper`. | Đi hết luồng thành công; điểm số tính đúng 9,10/10. Tuy nhiên: xem trước đề (`#examPreview`) và tấm trượt di động (`#btnPalette`) bị lỗi focus/Esc; các ô nhập thiếu `<label>`. |
| **Giáo viên — Bàn phím** | Chọn vai Giáo viên → đăng nhập tài khoản → danh sách lớp → tạo lớp mới → mở chi tiết lớp → giao đề → xem kết quả → mở trình soạn đề. | **Bị chặn (BLOCKER) tại thẻ lớp**: không thể dùng bàn phím mở chi tiết lớp từ `.class-card`. Hộp thoại Tạo lớp và Giao đề không bẫy focus, Esc không đóng. |
| **Quản trị viên — Bàn phím** | Mở `admin.html` → đăng nhập Admin → tạo tài khoản giáo viên → đặt lại mật khẩu → khóa/mở tài khoản. | Hoạt động tốt: focus chuyển vào modal, Esc đóng modal và hoàn trả focus đúng chuẩn DESIGN §4. |
| **Cây Accessibility (CDP)** | Gọi `Accessibility.getFullAXTree` tại từng bước (29 snapshots trong `ops/blitz/a11y/`). | Phát hiện: Radio Phần I và Đúng/Sai Phần II thiếu nhóm ngữ cảnh (`radiogroup`/`group`); Bảng câu hỏi không phản ánh trạng thái đã làm trong AX; thiếu hoàn toàn thẻ Heading trên màn làm bài. |
| **Live Regions (aria-live)** | Kiểm tra `#syncText`, `#timerBox`, các thông báo lỗi. | `#timerBox` không spam `aria-live` (đạt WEB §9). Tuy nhiên `#syncText` ("Đã lưu") không nằm trong live region, người khiếm thị không biết bài đã lưu. |
| **Zoom 200% & Reflow** | Đặt viewport 720×450 với `deviceScaleFactor: 2` (tương đương zoom 200% trên màn 1440×900). | Không tràn ngang (`scrollWidth: 705px <= innerWidth: 720px`, `overflow: -15px`). Đạt WCAG 1.4.10. |
| **Giảm chuyển động** | Bật `prefers-reduced-motion: reduce`. | Đo được `motionCount: 0`: mọi transition và animation đều tắt hoặc <= 0.001s. Đạt DESIGN §2. |
| **Tương phản & Dark Mode** | Chụp và kiểm tra 3 kích thước (375, 768, 1440px) ở cả chế độ sáng và tối (12 ảnh PNG). | Tokens màu đáp ứng độ tương phản chuẩn WCAG AA; không phát hiện vỡ layout hay tràn chữ. |

---

## 3. Bảng tổng hợp findings đã xác minh

| ID | Mức độ | Vấn đề | File:line (Source & Dist) | Căn cứ | Ca test tự động |
|---|---|---|---|---|---|
| **CX-a11y-F01** | MAJOR | Hộp thoại xem trước đề (`#examPreview`) không chuyển focus vào trong, thiếu accessible name, Esc không đóng và không trả focus | `src/student/area.ts:538`<br>`dist/student/area.js:448` | WEB §9, §19.1;<br>DESIGN §4 Dialog | `CX-A11Y-01a`<br>`CX-A11Y-01b` |
| **CX-a11y-F02** | **BLOCKER** | Thẻ lớp học của giáo viên (`.class-card`) không thể kích hoạt bằng bàn phím để xem chi tiết lớp | `src/teacher/portal.ts:17`<br>`dist/teacher/portal.js:16` | WEB §9, §19.1;<br>DESIGN §2 | `CX-A11Y-02` |
| **CX-a11y-F03** | MAJOR | Các hộp thoại giáo viên (Tạo lớp, Giao đề) không có bẫy focus (focus trap), không đóng bằng Esc và không hoàn trả focus | `src/teacher/portal.ts:476, 1260`<br>`dist/teacher/portal.js:405, 1140` | WEB §9, §19.1;<br>DESIGN §4 Dialog | `CX-A11Y-03a`<br>`CX-A11Y-03b`<br>`CX-A11Y-03c` |
| **CX-a11y-F04** | MINOR | Các ô nhập liệu (mã lớp, trả lời ngắn, tên lớp, chọn đề) thiếu `<label>` liên kết, chỉ dùng placeholder hoặc tên rỗng trong AX | `src/student/area.ts:456`<br>`src/student/view.ts:1251`<br>`src/teacher/portal.ts:482, 1267` | WEB §9;<br>DESIGN §4 Input/Select | `CX-A11Y-04a`<br>`CX-A11Y-04b`<br>`CX-A11Y-05a`<br>`CX-A11Y-05b` |
| **CX-a11y-F05** | MAJOR | Các nhóm lựa chọn đáp án (Phần I) và Đúng/Sai (Phần II) thiếu nhóm ngữ nghĩa có tên (`radiogroup`/`group`) trong cây Accessibility | `src/student/view.ts:1003, 1130`<br>`dist/student/view.js:828, 930` | WEB §9 labels/fieldset;<br>WCAG 1.3.1 | `CX-A11Y-06a`<br>`CX-A11Y-06b` |
| **CX-a11y-F06** | MAJOR | Bảng câu hỏi (`.palette-btn`) chỉ thể hiện trạng thái đã làm bằng màu sắc (class `.answered`), thiếu thông tin trạng thái trong cây Accessibility | `src/student/view.ts:1385`<br>`dist/student/view.js:1159` | WEB §9;<br>DESIGN §2 Tương tác;<br>WCAG 1.4.1 | `CX-A11Y-07` |
| **CX-a11y-F07** | MAJOR | Trạng thái lưu bài (`#syncText`) không nằm trong vùng `aria-live` | `src/app/shell.html:30`<br>`src/student/view.ts:438`<br>`dist/index.html:30` | WEB §9 status aria-live;<br>WCAG 4.1.3 | `CX-A11Y-08` |
| **CX-a11y-F08** | MINOR | Lỗi nhập mã lớp không gắn `aria-invalid` và `aria-describedby` vào ô nhập | `src/student/area.ts:464`<br>`dist/student/area.js:378` | DESIGN §4 Input;<br>WCAG 3.3.1 | `CX-A11Y-09` |
| **CX-a11y-F09** | MAJOR | Tấm trượt bảng câu hỏi trên di động (`#btnPalette` -> `.palette-card`) không nhận focus khi mở, Esc không đóng | `src/student/view.ts:155, 690`<br>`dist/student/view.js:57, 520` | WEB §19.1;<br>DESIGN §4 BottomSheet | `CX-A11Y-10` |
| **CX-a11y-F10** | MAJOR | Màn làm bài thiếu cấu trúc heading chuẩn (`<h1>`–`<h6>` hoặc `role="heading"`), không thể điều hướng bằng phím tắt heading | `src/student/view.ts:580, 945`<br>`dist/student/view.js:430, 775` | WEB §9 cấp heading;<br>DESIGN §5;<br>WCAG 2.4.6 | `CX-A11Y-11` |

---

## 4. Chi tiết các findings đã xác minh

### CX-a11y-F01 — Hộp thoại xem trước đề (`#examPreview`) không chuyển focus, không đóng bằng Esc
- **Mức độ:** MAJOR
- **Căn cứ:** WEB-contract §9 ("keyboard-only, focus visible/không trap ngoài modal", "Focus dialog/return focus"); §19.1; DESIGN §4 Dialog (`role="dialog"`, `aria-modal`, tiêu đề, Esc đóng, focus vào trong và trả về nút mở).
- **Các bước thật đã chạy:**
  1. Mở trang học sinh, nhập tên, vào lớp học có đề được giao.
  2. Tab đến thẻ đề `.class-section .exam-card`, bấm Enter mở `#examPreview`.
  3. Kiểm tra `document.activeElement` và cây AX của `#examPreview`.
  4. Nhấn phím `Escape`.
- **Actual:** Focus vẫn giữ nguyên ở thẻ `.class-section .exam-card` bị che phía sau. Tiếp tục Tab sẽ duyệt xuyên qua các thẻ đề khác trong nền. Node `#examPreview` trong AX tree có name rỗng. Nhấn `Escape` không đóng `#examPreview` (`visible === true`).
- **Expected:** Mở dialog phải chuyển focus vào nút bắt đầu hoặc nút đóng bên trong dialog; dialog có accessible name trích từ tiêu đề đề; nhấn Esc phải đóng dialog và hoàn trả focus về thẻ đề.
- **Cách sửa tối thiểu:**
  Trong `src/student/area.ts`: Lưu `triggerEl = document.activeElement`. Gán thuộc tính `role="dialog"`, `aria-modal="true"`, `aria-labelledby="previewExamTitle"` cho `#examPreview`. Khi mở, gọi `btnStartExam.focus()`. Thêm lắng nghe `keydown` trên `#examPreview` (bắt `Escape` để gọi hàm đóng). Khi đóng, gọi `triggerEl?.focus()`.
- **Bằng chứng:** `ops/blitz/a11y/03-preview.ax.json`, `03-preview.dom.json`, `03-preview.png`; ca test `CX-A11Y-01a`, `CX-A11Y-01b`.

---

### CX-a11y-F02 — Thẻ lớp học của giáo viên (`.class-card`) không thể mở bằng bàn phím
- **Mức độ:** **BLOCKER** (người dùng điều khiển bằng bàn phím hoàn toàn không thể xem chi tiết lớp hay giao đề cho học sinh).
- **Căn cứ:** WEB-contract §9 ("keyboard-only, focus visible"); §19.1 ("Lớp học ... Bấm thẻ → chi tiết lớp: danh sách đề đã giao ... nút `#btnAssignExam`"); DESIGN §2 ("Vùng bấm tối thiểu 44×44px cho mọi nút, liên kết dạng nút").
- **Các bước thật đã chạy:**
  1. Đăng nhập giáo viên tại `#/giao-vien`.
  2. Dùng Tab duyệt qua màn hình Lớp học.
- **Actual:** Thẻ `.class-card` được render bằng thẻ `<div>` không có `tabindex="0"`, không có `role="button"`. Phím Tab chỉ nhảy vào nút hành động con ("Sao chép mã", "Link mời"), hoàn toàn không thể dừng lại ở thân thẻ lớp. Handler `click` mở chi tiết lớp chỉ gắn sự kiện chuột, không có handler bàn phím (Enter/Space).
- **Expected:** Người dùng bàn phím phải Tab được vào thẻ lớp (hoặc nút/link mở chi tiết lớp trên thẻ), nhấn Enter để mở màn chi tiết lớp.
- **Cách sửa tối thiểu:**
  Trong `src/teacher/portal.ts` (hàm render `.class-card`): Thêm `tabindex="0"`, `role="button"`, `aria-label="Xem chi tiết lớp ${cls.name}"` vào `.class-card`, thêm lắng nghe `keydown` bắt phím `Enter` và `Space` để kích hoạt `openClassDetail(cls)`.
- **Bằng chứng:** `ops/blitz/a11y/09-teacher.ax.json`, `09-teacher.dom.json`, `09-teacher.png`; ca test `CX-A11Y-02`.

---

### CX-a11y-F03 — Hộp thoại giáo viên (Tạo lớp, Giao đề) thiếu bẫy focus và không đóng bằng Esc
- **Mức độ:** MAJOR
- **Căn cứ:** WEB-contract §9; DESIGN §4 Dialog (`role="dialog"`, `aria-modal`, tiêu đề, Esc đóng, focus vào trong và trả về nút mở, không thất thoát focus ra ngoài).
- **Các bước thật đã chạy:**
  1. Đăng nhập giáo viên, bấm `#btnCreateClass` mở hộp thoại Tạo lớp. Nhấn Tab 7 lần. Nhấn phím `Escape`.
  2. Mở chi tiết lớp, bấm `#btnAssignExam` mở `#assignDialog`. Nhấn phím `Escape`.
- **Actual:**
  - Hộp Tạo lớp: Tab thoát ra ngoài hộp thoại, đi vào TopBar và thanh điều hướng trong nền. Nhấn Esc không đóng hộp thoại.
  - Hộp Giao đề: Focus không chuyển vào bên trong dialog khi mở. Nhấn Esc không đóng hộp thoại và không trả focus về `#btnAssignExam`.
- **Expected:** Khi modal mở, focus phải lập tức chuyển vào ô nhập đầu tiên; phím Tab phải tuần hoàn bên trong modal (focus trap); nhấn Esc phải đóng modal ngay lập tức và trả focus về nút mở.
- **Cách sửa tối thiểu:**
  Trong `src/teacher/portal.ts`: Dùng component `Dialog` chuẩn từ `src/ui/components.ts` hoặc cài đặt bẫy focus: lưu `activeElement` trước khi mở modal, gán `keydown` bắt phím `Escape` để đóng và phím `Tab` để giữ focus trong các phần tử focusable của modal; khi đóng gọi `lastActive.focus()`.
- **Bằng chứng:** `ops/blitz/a11y/10-create-class.ax.json`, `22-assign.ax.json`, `22-assign.png`; ca test `CX-A11Y-03a`, `CX-A11Y-03b`, `CX-A11Y-03c`.

---

### CX-a11y-F04 — Các ô nhập liệu thiếu nhãn liên kết (`<label for="...">`)
- **Mức độ:** MINOR (ảnh hưởng trực tiếp đến người dùng screen reader theo WCAG 3.3.2)
- **Căn cứ:** WEB-contract §9 ("labels/fieldset/legend"); DESIGN §4 Input / Select ("Nhãn luôn hiện phía trên (không dùng placeholder thay nhãn)...").
- **Các bước thật đã chạy:**
  1. Kiểm tra thuộc tính `.labels` của `#classCodeInput` và `.short-answer-input`.
  2. Kiểm tra ô nhập tên lớp trong modal Tạo lớp.
  3. Kiểm tra thuộc tính accessible name của `#assignExamSelect` qua CDP `Accessibility.getFullAXTree`.
- **Actual:**
  - `#classCodeInput` không có thẻ `<label for="classCodeInput">`, chỉ dùng placeholder.
  - `.short-answer-input` không có thẻ `<label>` liên kết hoặc `aria-label`/`aria-labelledby` gắn với câu hỏi.
  - Ô nhập tên lớp trong modal tạo lớp không có `<label for="...">`.
  - `#assignExamSelect` trong cây AX có `name: undefined` (tên rỗng).
- **Expected:** Mọi điều khiển nhập liệu phải có nhãn hiển thị phía trên và được liên kết bằng `for`/`id` hoặc `aria-label`/`aria-labelledby`.
- **Cách sửa tối thiểu:**
  - `src/student/area.ts`: Thêm `<label for="classCodeInput" class="ui-label">Mã lớp</label>`.
  - `src/student/view.ts`: Thêm `aria-label="Đáp án câu ${idx + 1}"` cho `.short-answer-input`.
  - `src/teacher/portal.ts`: Thêm `<label for="newClassName">Tên lớp học</label>` và `<label for="assignExamSelect">Chọn đề thi</label>`.
- **Bằng chứng:** `ops/blitz/a11y/02-student.dom.json`, `04-exam.dom.json`, `10-create-class.dom.json`, `22-assign.ax.json`; ca test `CX-A11Y-04a`, `CX-A11Y-04b`, `CX-A11Y-05a`, `CX-A11Y-05b`.

---

### CX-a11y-F05 — Nhóm lựa chọn Phần I và Đúng/Sai Phần II thiếu nhóm ngữ nghĩa có tên trong AX
- **Mức độ:** MAJOR
- **Căn cứ:** WEB-contract §9 ("labels/fieldset/legend"); WCAG 2.1 SC 1.3.1 Info and Relationships (Cấp A).
- **Các bước thật đã chạy:**
  1. Mở màn làm bài, kiểm tra cây AX từ node `[role="radio"]` (Phần I) và `.tf-btn` (Phần II) duyệt ngược lên các node cha.
- **Actual:**
  - Phần I: Node cha `options-grid` bị Chrome đánh dấu `ignored: true` (`uninteresting`) và role `none` trong cây AX do thiếu liên kết tên tính toán; các radio đứng trơ trọi không thuộc một `radiogroup` có tên câu hỏi.
  - Phần II: Từng cặp nút Đúng/Sai (`.tf-btn`) nằm trong `div.statement-row` không có `role="group"` và không có `aria-label`/`aria-labelledby` trỏ tới nội dung ý a/b/c/d.
- **Expected:**
  - Phần I: Các nút radio phải thuộc `role="radiogroup"` có `aria-labelledby` trỏ tới tiêu đề/nội dung câu hỏi.
  - Phần II: Mỗi dòng ý dẫn phải là một `role="group"` có `aria-label="Ý ${label}: ${content}"` để screen reader thông báo ngữ cảnh khi focus vào nút Đúng/Sai.
- **Cách sửa tối thiểu:**
  Trong `src/student/view.ts`:
  - Gán `id` cho tiêu đề câu hỏi (`titleSpan.id = 'q-title-' + q.questionVersionId`) và đặt `optGrid.setAttribute("aria-labelledby", titleSpan.id)`.
  - Trên mỗi dòng `.statement-row`, thêm `setAttribute("role", "group")` và `setAttribute("aria-label", "Ý " + stmt.label)`.
- **Bằng chứng:** `ops/blitz/a11y/04-exam.ax.json` (node 1141, 1154, 1155); ca test `CX-A11Y-06a`, `CX-A11Y-06b`.

---

### CX-a11y-F06 — Bảng câu hỏi chỉ đổi màu khi đã làm, không phản ánh trạng thái trong cây AX
- **Mức độ:** MAJOR
- **Căn cứ:** WEB-contract §9; DESIGN §2 Tương tác & tiếp cận ("không truyền ý nghĩa chỉ bằng màu (trạng thái luôn kèm chữ hoặc biểu tượng)"); WCAG 2.1 SC 1.4.1 Use of Color (Cấp A).
- **Các bước thật đã chạy:**
  1. Kiểm tra AX node của nút câu hỏi 1 (`.palette-btn:first-child`) khi chưa làm: `name: "1"`, `properties: []`.
  2. Bấm chọn đáp án A của Câu 1: nút câu đổi màu (thêm class `.answered`).
  3. Đọc lại AX node của nút câu 1: `name: "1"`, `properties: []` (hoàn toàn không thay đổi).
- **Actual:** Trạng thái duy nhất thay đổi là màu nền CSS. Người dùng khiếm thị hoặc dùng công cụ trợ năng duyệt bảng câu không thể biết câu nào đã trả lời, câu nào chưa làm.
- **Expected:** Nút bảng câu phải cập nhật accessible name hoặc thuộc tính ARIA mô tả trạng thái, ví dụ `aria-label="Câu 1: Đã làm"` khi đã trả lời và `aria-label="Câu 1: Chưa làm"` khi chưa trả lời.
- **Cách sửa tối thiểu:**
  Trong `src/student/view.ts` (`updatePaletteButton`):
  Cập nhật thuộc tính: `btn.setAttribute("aria-label", `Câu ${idx + 1}: ${hasAnswer ? "Đã làm" : "Chưa làm"}${isFlagged ? " (Đã đánh dấu)" : ""}`)`.
- **Bằng chứng:** `ops/blitz/a11y/04-exam.ax.json`, `05-answered.ax.json`, `15-answer-states.ax.json`; ca test `CX-A11Y-07`.

---

### CX-a11y-F07 — Trạng thái lưu bài (`#syncText`) không nằm trong vùng `aria-live`
- **Mức độ:** MAJOR
- **Căn cứ:** WEB-contract §9 ("status aria-live không đọc timer từng giây", "Trạng thái lưu/mạng"); WCAG 2.1 SC 4.1.3 Status Messages (Cấp AA).
- **Các bước thật đã chạy:**
  1. Vào làm bài, nhập đáp án ngắn `0,5`, đợi hệ thống lưu cục bộ.
  2. Chữ trong `#syncText` đổi từ "Đang lưu..." sang "Đã lưu".
  3. Kiểm tra cây DOM và AX: không có vùng `aria-live` hoặc `role="status"` nào bao bọc `#syncText`.
- **Actual:** Thay đổi trạng thái lưu diễn ra âm thầm trong một thẻ `<span>` thông thường. Người dùng dùng screen reader không nhận được bất kỳ phản hồi nào về việc bài thi đã được lưu an toàn.
- **Expected:** Khối trạng thái lưu hoặc phần tử cha phải có `role="status"` và `aria-live="polite"` (`aria-atomic="true"`) để screen reader thông báo trạng thái mà không ngắt quãng thao tác làm bài.
- **Cách sửa tối thiểu:**
  Trong `src/app/shell.html` và `src/student/view.ts`: Thêm `role="status"` và `aria-live="polite"` vào container `#syncStatus` / `#syncText`.
- **Bằng chứng:** `ops/blitz/a11y/04-exam.dom.json`, `05-answered.dom.json`; ca test `CX-A11Y-08`.

---

### CX-a11y-F08 — Lỗi mã lớp không gắn `aria-invalid` và `aria-describedby`
- **Mức độ:** MINOR
- **Căn cứ:** DESIGN §4 Input ("lỗi hiện ngay dưới ô bằng chữ đỏ + biểu tượng, aria-invalid + aria-describedby"); WCAG 2.1 SC 3.3.1 Error Identification.
- **Các bước thật đã chạy:**
  1. Để trống ô mã lớp `#classCodeInput`, bấm `#btnJoinClass`.
  2. Thông báo lỗi hiển thị trong `#classCodeError`.
  3. Kiểm tra thuộc tính của `#classCodeInput`: `aria-invalid` là `null`, `aria-describedby` là `null`.
- **Actual:** Ô nhập không có dấu hiệu tiếp cận nào báo lỗi cho công nghệ hỗ trợ.
- **Expected:** Khi có lỗi, ô nhập phải có `aria-invalid="true"` và `aria-describedby="classCodeError"`. Khi lỗi được khắc phục, gỡ bỏ thuộc tính.
- **Cách sửa tối thiểu:**
  Trong `src/student/area.ts`: Khi hiển thị lỗi, gọi `classCodeInput.setAttribute("aria-invalid", "true")` và `classCodeInput.setAttribute("aria-describedby", "classCodeError")`.
- **Bằng chứng:** `ops/blitz/a11y/14-class-error.dom.json`; ca test `CX-A11Y-09`.

---

### CX-a11y-F09 — Tấm trượt bảng câu hỏi trên di động (`#btnPalette`) không bẫy focus, Esc không đóng
- **Mức độ:** MAJOR
- **Căn cứ:** WEB-contract §19.1 ("Bảng số câu: ... điện thoại là nút #btnPalette mở tấm trượt"); DESIGN §4 BottomSheet ("Trên điện thoại hiện thành BottomSheet toàn bề rộng... role='dialog', aria-modal, tiêu đề, Esc đóng, focus vào trong và trả về nút mở").
- **Các bước thật đã chạy:**
  1. Đặt viewport 375×812, bấm `#btnPalette` mở `.palette-card.is-open`.
  2. Kiểm tra `document.activeElement`.
  3. Nhấn phím `Escape`.
- **Actual:** Focus vẫn giữ ở `#btnPalette` ngoài tấm trượt; phím `Escape` không đóng tấm trượt.
- **Expected:** Mở tấm trượt phải chuyển focus vào bên trong danh sách câu hỏi; nhấn Esc phải đóng tấm trượt và trả focus về `#btnPalette`.
- **Cách sửa tối thiểu:**
  Trong `src/student/view.ts`: Gán `role="dialog"`, `aria-modal="true"`, `aria-label="Danh sách câu hỏi"` cho `.palette-card` khi ở viewport mobile; khi mở, focus vào nút câu đầu tiên; bắt sự kiện `keydown` phím `Escape` để đóng và gọi `btnPalette.focus()`.
- **Bằng chứng:** `ops/blitz/a11y/18-mobile-palette.ax.json`, `18-mobile-palette.dom.json`, `18-mobile-palette.png`; ca test `CX-A11Y-10`.

---

### CX-a11y-F10 — Màn làm bài thiếu cấu trúc heading (`<h1>`–`<h6>`)
- **Mức độ:** MAJOR
- **Căn cứ:** WEB-contract §9 ("tiêu đề trang và cấp heading"); DESIGN §5; WCAG 2.1 SC 1.3.1 và 2.4.6.
- **Các bước thật đã chạy:**
  1. Mở màn làm bài, trích xuất toàn bộ node có `role="heading"` qua CDP `Accessibility.getFullAXTree`.
- **Actual:** Danh sách heading hoàn toàn rỗng (`headings: []`). Tiêu đề đề thi chỉ là thẻ `span.exam-title`; số câu hỏi chỉ là `span.question-num-tag`.
- **Expected:** Tiêu đề bài thi phải là `<h1>` (hoặc `role="heading"`, `aria-level="1"`), và mỗi câu hỏi phải có tiêu đề cấp `<h2>` (hoặc `role="heading"`, `aria-level="2"`).
- **Cách sửa tối thiểu:**
  Trong `src/student/view.ts`: Đổi `span.exam-title` thành `h1.exam-title`; đổi nhãn câu hỏi trong `question-num-tag` thành thẻ `h2` hoặc gán `role="heading"`, `aria-level="2"`.
- **Bằng chứng:** `ops/blitz/a11y/04-exam.dom.json`, `17-zoom200-reflow.dom.json`; ca test `CX-A11Y-11`.

---

## 5. Điểm sáng và đối chứng đạt yêu cầu

1. **Luồng bàn phím làm bài và nộp bài hoàn chỉnh:**
   - Ca test đối chứng trong `proposed.test.mjs` chạy hoàn toàn bằng bàn phím: chọn radio Phần I bằng phím, chọn Đúng/Sai Phần II, gõ đáp án ngắn Phần III, mở modal nộp bài `#submitModal`, kiểm tra Esc đóng modal nộp và trả focus về `#btnSubmit`, sau đó xác nhận nộp thành công và chuyển sang màn báo cáo điểm số đạt 9,10/10.
2. **Khu vực Admin (`admin.html`) tuân thủ tốt nguyên tắc modal:**
   - Modal tạo giáo viên và đặt lại mật khẩu trong `admin.html` đều bẫy focus tốt, bấm Esc đóng modal và hoàn trả focus chính xác về nút mở (`#btnCreateTeacher` và `.btn-reset-password`).
3. **Reflow và thu phóng (Zoom 200%):**
   - Tại viewport 720×450 với `deviceScaleFactor: 2` (chuẩn kiểm tra zoom 200%), toàn bộ giao diện tự co giãn một cột mượt mà, không xuất hiện thanh cuộn ngang (`scrollWidth: 705px <= innerWidth: 720px`).
4. **Hỗ trợ giảm chuyển động (`prefers-reduced-motion`):**
   - Khi kích hoạt media query `prefers-reduced-motion: reduce`, toàn bộ transition/animation trong giao diện đều được triệt tiêu (`motionCount: 0`).
5. **Đồng hồ thi không quấy rối người dùng khiếm thị:**
   - `#timerBox` được cập nhật mỗi giây nhưng không bị gán nhầm `aria-live="polite"` hay `assertive`, tránh việc screen reader đọc liên tục từng giây gây ức chế.

---

## 6. Gợi ý cải tiến (không tính lỗi hợp đồng)

1. **Liên kết nhảy nhanh qua nội dung (Skip link):**
   - Thêm `<a href="#examPane" class="skip-link">Nhảy tới nội dung bài thi</a>` ở đầu trang làm bài để người dùng bàn phím không phải Tab qua toàn bộ TopBar và đồng hồ trước khi tới câu hỏi.
2. **Phím tắt chuyển câu hỏi:**
   - Hỗ trợ phím tắt điều hướng nhanh giữa các câu hỏi (ví dụ `Alt + Mũi tên xuống` / `Alt + Mũi tên lên`) giúp học sinh thao tác nhanh hơn khi làm bài.

---

## 7. Lệnh đã chạy, kết quả đo và giới hạn (NOT_RUN)

### 7.1 Lệnh chạy bộ kiểm tra đề xuất
```bash
node --test ops/blitz/a11y/proposed.test.mjs
```
- **Exit code thực đo:** `1`
- **Kết quả:** `18 tests | 1 pass | 17 fail | 0 skipped`
  - Ca đối chứng (`Đối chứng: bàn phím chọn radio/Đúng-Sai, nhập và nộp ra báo cáo`): **PASS** (1569ms).
  - 17 ca kiểm tra tương ứng với 10 findings: **FAIL** (đúng tính chất TDD, đỏ trên bản build `dist` hiện tại và sẽ chuyển xanh khi các module `src/` được sửa đúng quy chuẩn).
- **Thời gian chạy:** 16,11 giây. Toàn bộ log chi tiết được lưu tại `ops/blitz/a11y/proposed-test.log`.

### 7.2 Giới hạn (NOT_RUN)
- **Kiểm thử Screen Reader thực tế của Hệ điều hành (NVDA, JAWS, VoiceOver, TalkBack):** `NOT_RUN` — do môi trường máy chủ chạy dòng lệnh tự động (headless CLI), không có thiết bị đầu ra âm thanh hoặc phần mềm đọc màn hình đồ họa chuyên dụng. Toàn bộ kiểm định tiếp cận ngữ nghĩa được thực hiện thông qua cây tiếp cận chuẩn CDP `Accessibility.getFullAXTree` của Chromium.
- **Kiểm tra trên trình duyệt di động thật:** `NOT_RUN` — chỉ mô phỏng kích thước viewport (375×812) và tỷ lệ màn hình qua Chrome CDP.
