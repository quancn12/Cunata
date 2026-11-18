# CX-student — Rà soát sâu luồng Học sinh

- `review_id / task_id / worker_id`: CX-student-anti; reviewer: Antigravity (hoàn tất tiếp nối lượt kiểm định độc lập của Codex).
- Ngày kiểm: 18/11/2026, Windows/PowerShell, Node v24.14.0, Chrome headless/CDP qua test harness có sẵn (`test/claude-check/harness.mjs`).
- `base_commit = head_commit`: `e7d8f85c99f28fef83d37187a2101e15be100d7b` (snapshot ban đầu ghi nhận tại `178fb4f86735fd8fae89133a26a2ed3cf1c79185`).
- Kết luận: **CHANGES_REQUESTED**. Chưa nghiệm thu luồng học sinh: phát hiện 7 lỗi MAJOR và 3 lỗi MINOR đã được tái hiện và chứng minh bằng test đỏ. Không phát hiện BLOCKER làm đổ vỡ runtime hoặc hỏng dữ liệu hệ thống.
- Phạm vi tác nghiệp: Đây là báo cáo kiểm định độc lập. Tuân thủ nghiêm ngặt chỉ thị: KHÔNG sửa code trong `src/`, `dist/`, `public/`, `apps-script/`, `scripts/`, `test/`. Chỉ tạo báo cáo `docs/reviews/CX-student.md` và các artifact, test harness trong `ops/blitz/student/`.

---

## 1. Căn cứ và snapshot

Đã đối chiếu các nguồn quy chuẩn:
1. **Shared Product Contract v2.0** (`Đặc tả sản phẩm — Web luyện đề GDPT 2018.txt`): Bất biến chấm điểm, báo cáo kết quả, trạng thái lượt làm, no-login flow.
2. **Hợp đồng kỹ thuật Web M2–M6 v1.0** (`docs/contracts/WEB-contract.md`): Đặc biệt §14 (Quyết định D01–D08 đã chốt), §15 (Danh sách đề & chọn đề), §16 (Màn vào thi), §17 (Giao thức Apps Script / Google Sheets), §18 (Tính năng mới trên bản build `dist/`), §19.1 & §19.2 (Luồng Học sinh, Lớp học, DOM bắt buộc).
3. **Quy chuẩn thiết kế giao diện Cunata** (`docs/design/DESIGN.md`): Button, Input, Card, ExamCard, StatusBadge, TopBar, Dialog, EmptyState, ErrorState, Tokens, khả năng tiếp cận WCAG AA.
4. **Bảng quyết định dự án** (`docs/decisions/BANG-QUYET-DINH.md`): D01, D02, D03, D07, D08.

Snapshot SHA-256 các file `dist` và cấu hình liên quan lúc bắt đầu kiểm định (lưu tại `ops/blitz/student/dist-start.sha256.txt`):

| File | SHA-256 |
|---|---|
| `dist/index.html` | `4f45f2dc2bbbdccf6d6f636feda6fe72c05c4fb04b34385f88ecaacdfc1de8e9` |
| `dist/app/main.js` | `1c9e450807377b56403ebfa9180ca43975c5040595d88a7fe85ce0698656da6b` |
| `dist/app/routes.js` | `36f47f3a81e9d6d5bd5a93084880f0a35b134c73433b34612d6f07c047aea705` |
| `dist/app/role-shell.js` | `d22093ef7ccc640606d67ee7d95ae06a33dbf5cb6b2448dfc4e6660a48850eef` |
| `dist/student/index.js` | `9ca8f00a432615d8a9480e5132660eb198718bc3299559b8f1980affc3b610a2` |
| `dist/student/area.js` | `e0b32c66ae978cb5ff111a9386d39002220d91d8e124876a445fe7ea107b34b1` |
| `dist/student/view.js` | `37144f898606972175c48a40fbcc3f8e64242e7196ca690fce52ee1a79a1cae7` |
| `dist/ui/components.js` | `2764d6aa44ecbe86c9e89e6d3ce51adaa3b9d0bc313ef76a6e303240725cb48d` |
| `dist/collect/appsScript.js` | `85351d11fc4446d685dee796fc2255c0b5978d9d4ad69f1a4e4a47b7c568e6a4` |
| `apps-script/Code.js` | `f8e7cbbf6b113bd4a8d97ac00599a2bbcf407f01d2c935ba639afb5d4bda2389` |

**Môi trường thực thi kiểm định:**
- Trình duyệt: Google Chrome thật qua giao thức CDP (`test/claude-check/harness.mjs`), viewport thay đổi theo ca kiểm (375px, 768px, 1440px), mô phỏng sáng/tối.
- Máy chủ tĩnh phục vụ file `dist/` dưới đường dẫn subpath `/Cunata/` (tuân thủ WEB §10).
- Giả lập backend Google Apps Script qua `gas-server.mjs` / `gas-fake.mjs` chạy `apps-script/Code.js` thật trong Node VM; tuyệt đối KHÔNG gọi URL Google thật và KHÔNG đọc `ops/prod_config.json`.
- Mọi tương tác người dùng đều thực hiện bằng hành vi thực (chuột click, `Input.insertText`, bàn phím Enter/Escape/Tab), không gán biến `.value` hay can thiệp DOM từ JS.

---

## 2. Phạm vi đã kiểm

| Khu vực | Phạm vi kiểm tra và kết quả quan sát | Trạng thái |
|---|---|---|
| **Chọn vai (`#roleChooser`)** | Mở trang lần đầu hiện `#roleChooser` với 2 nút `#btnRoleStudent`, `#btnRoleTeacher`. Chọn Học sinh lưu vai vào localStorage, lần sau vào thẳng `#/hoc-sinh`. Nút Đổi vai trên TopBar `#btnChangeRole` xóa vai và đưa về `#roleChooser`. (Test `PASS-01`) | **ĐẠT** |
| **Cổng nhập tên (`#studentNameGate`)** | Nhập họ tên `input#startName`: khóa nút `#btnNameContinue` khi rỗng hoặc toàn khoảng trắng; gõ tên Việt có khoảng trắng đầu/cuối được trim tự động; nhấn Enter gửi được; tên lưu vào `localStorage` và hiển thị trên thanh chào `strong.student-display-name`. Đổi tên trong khu vực học sinh cập nhật thành công. (Test `PASS-01`) | **ĐẠT** |
| **Vào lớp bằng mã** | `input#classCodeInput` + `#btnJoinClass`: bấm khi rỗng báo "Vui lòng nhập mã lớp học" trong `#classCodeError`. Nhập mã sai báo lỗi không tồn tại. Nhập mã có khoảng trắng và chữ thường tự động chuyển thành in hoa và tham gia lớp thành công. (Test `PASS-02`) | **ĐẠT** |
| **Lớp của em (`#myClasses`)** | Hiện khối `.class-section[data-class-code]`, danh sách thẻ đề giao kèm `data-assignment-id`, ngày mở, hạn nộp. Đề chưa mở hiện "Chưa mở" và khóa nút; đề quá hạn hiện "Hết hạn" và khóa nút. (Test `PASS-02`) | **ĐẠT** |
| **Làm bài thi & Chấm điểm** | Tên thí sinh ở `#candidateName` là chỉ đọc; không xuất hiện các nút công cụ giáo viên (`#btnLoadExam`, `#btnOpenBuilder`, `#btnOpenBank`); trả lời cả 3 phần I/II/III; lưu tự động qua reload giữ nguyên dữ liệu và đồng hồ đếm ngược; nộp bài tính đúng 10/10 điểm theo D01/D02; báo cáo hiện lời giải chi tiết (D08); tải báo cáo HTML offline thành công; chưa cấu hình GAS báo "Đã lưu cục bộ" và không gửi mạng. (Test `PASS-03`) | **ĐẠT** |
| **Nộp bài tập lớp** | Nộp đề được giao lưu đúng `class_code`, `assignment_id`; GAS server giả lập nhận đúng 1 lượt nộp, ghi vào trang tính `KetQua`, `#syncText` báo "Đã gửi". (Test `coverage.test.mjs`) | **ĐẠT** |
| **Giới hạn số lượt làm** | Đề có `maxAttempts: 1`, sau khi nộp nút Làm lại `#btnRestart` bị ẩn/khóa đúng quy định. (Test `coverage.test.mjs`) | **ĐẠT** |
| **Bố cục hiển thị (Responsive & A11y)** | Kiểm tra ở 375px (mobile), 768px (tablet), 1440px (desktop), cả light mode và dark mode: không bị tràn ngang (`overflow <= 1px`); bảng số câu dạng trượt (BottomSheet/drawer) trên mobile mở/đóng bằng `#btnPalette`, dạng docked cột phải ở desktop. (Test `coverage.test.mjs`) | **ĐẠT** |
| **Xem lại kết quả đề đã nộp** | Bấm "Xem kết quả" của đề đã nộp: không khôi phục báo cáo của đề được bấm, chỉ bật `#reportWrapper` cũ/rỗng. | **LỖI (F01)** |
| **Trợ năng hộp thoại `#examPreview`** | Mở hộp thoại bằng bàn phím không focus vào dialog; phím Esc không đóng và không trả focus về thẻ đề. | **LỖI (F02)** |
| **Liên kết thẳng `?exam=`** | Đề mở bằng `?exam=` che cổng tên hoặc bị mất đề đã chọn nếu bấm bắt đầu trước khi có tên. | **LỖI (F03)** |
| **Trạng thái bài giao tương lai** | Bài giao chưa mở bị chuyển thành "Đã nộp" / "Xem kết quả" nếu học sinh từng làm đề đó ở khu luyện tập tự do. | **LỖI (F04)** |
| **Đồng bộ bài tập lớp** | Mở lại lớp đã vào không cập nhật bài mới được giáo viên giao thêm. | **LỖI (F05)** |
| **Link mời dạng hash** | Link mời `#/hoc-sinh?lop=<MÃ>` không tự động nạp lớp vì chỉ đọc `window.location.search`. | **LỖI (F06)** |
| **Nhãn ngữ nghĩa ô mã lớp** | `#classCodeInput` thiếu thẻ `<label>`, thiếu `aria-invalid` và `aria-describedby` khi có lỗi. | **LỖI (F07)** |
| **Xử lý lỗi danh sách đề** | Lỗi tải danh sách đề tĩnh bị nuốt âm thầm, biến thành danh sách trống không có thông báo hay nút Thử lại. | **LỖI (F08)** |
| **Khôi phục bài dở dang theo D03** | Mở trang với `?exam=` khác đẩy bài đang làm dở ra ngoài thay vì khôi phục bài dở. | **LỖI (F09)** |
| **Nút Đổi tên trên TopBar** | Bấm `#appTopBar #btnChangeName` sau khi quay về từ bài thi không hiển thị cổng đổi tên. | **LỖI (F10)** |

---

## 3. Bảng findings đã xác minh

| ID | Mức | Vấn đề | File:line (Source & Dist) | Căn cứ | Test kiểm chứng |
|---|---|---|---|---|---|
| **CX-student-F01** | **MAJOR** | Bấm "Xem kết quả" của đề đã nộp chỉ mở lại view báo cáo cũ/rỗng mà không tải dữ liệu của đề được chọn | `src/student/area.ts:726`<br>`dist/student/area.js:636-644` | WEB §19.1 (`#examPreview`, "Xem kết quả"), §15, D08 | `CX-S01a`, `CX-S01b` |
| **CX-student-F02** | **MINOR** | Hộp thoại xem trước đề `#examPreview` không bẫy/chuyển focus khi mở và không đóng/trả focus bằng phím Escape | `src/student/area.ts:539`, `707`<br>`dist/student/area.js:449`, `593` | DESIGN §4 (Dialog/BottomSheet), WEB §15, §9 (WCAG AA) | `CX-S02a`, `CX-S02b` |
| **CX-student-F03** | **MAJOR** | `?exam=<examId>` che cổng tên hoặc làm mất đề được chọn nếu bấm bắt đầu trước khi có tên | `src/student/area.ts:1174`, `720`<br>`dist/student/area.js:1052`, `602` | WEB §19.1 (`?exam=` qua cổng tên), §16 | `CX-S03` |
| **CX-student-F04** | **MAJOR** | Thẻ bài giao tương lai (chưa mở) bị biến thành "Đã nộp" và mở khóa nếu học sinh đã từng nộp đề đó ở khu luyện tập | `src/student/area.ts:114`, `626`<br>`dist/student/area.js:44`, `521` | WEB §19.1 ("đề chưa mở khóa và nói lý do"), §19.2 | `CX-S04` |
| **CX-student-F05** | **MAJOR** | Tải lại trang không cập nhật bài mới được giáo viên giao cho lớp đã tham gia | `src/student/area.ts:182`, `1164`<br>`dist/student/area.js:106`, `1044` | WEB §19.1 (Lớp của tôi), §17.6 | `CX-S05` |
| **CX-student-F06** | **MAJOR** | Link mời `…/#/hoc-sinh?lop=<MÃ>` không tự động nạp lớp do chỉ đọc `location.search` thay vì hash params | `src/student/area.ts:1189`<br>`dist/student/area.js:1069` | WEB §19.1 (link mời `…/#/hoc-sinh?lop=<MÃ>`) | `CX-S06` |
| **CX-student-F07** | **MINOR** | Ô nhập mã lớp `#classCodeInput` thiếu `<label>` ngữ nghĩa và thiếu `aria-invalid` / `aria-describedby` khi có lỗi | `src/student/area.ts:456-490`<br>`dist/student/area.js:371-407` | DESIGN §4 (Input), WEB §9 (A11y/WCAG) | `CX-S07` |
| **CX-student-F08** | **MAJOR** | Lỗi tải danh sách đề tĩnh bị nuốt âm thầm, hiển thị màn hình trống không có thông báo hay nút Thử lại | `src/student/area.ts:1044-1047`<br>`dist/student/area.js:932-934` | WEB §15, §16 (Lỗi danh sách), DESIGN §4 (ErrorState) | `CX-S08` |
| **CX-student-F09** | **MAJOR** | Mở liên kết `?exam=` khác khi đang có bài dở dang làm đẩy học sinh ra màn chọn đề thay vì khôi phục bài dở | `src/app/main.ts:2989-2995`<br>`dist/app/main.js:2989-2995` | WEB §14, §16, §19.1 (Quyết định D03) | `CX-S09` |
| **CX-student-F10** | **MAJOR** | Nút Đổi tên trên TopBar (`#appTopBar #btnChangeName`) không kích hoạt cổng đổi tên khi quay lại từ bài thi | `src/app/main.ts:536-539`<br>`dist/app/main.js:536-539` | WEB §19.1 (TopBar hiện tên + `#btnChangeName`) | `CX-S10` |

---

### Chi tiết các phát hiện (Findings Detail)

#### CX-student-F01 — Bấm "Xem kết quả" của đề đã nộp chỉ mở lại view báo cáo cũ/rỗng
- **Mức độ:** MAJOR.
- **Bước tái hiện thật đã chạy:**
  1. Học sinh làm và nộp đề A (đạt 0,25/10 điểm) -> Bấm "Về trang học sinh".
  2. Bắt đầu làm đề B và nộp ngay không trả lời (đạt 0/10 điểm) -> Bấm "Về trang học sinh".
  3. Bấm vào thẻ đề A trên danh sách -> Hộp thoại `#examPreview` hiện nút "Xem kết quả" -> Bấm nút.
  4. Ca thứ hai (mở trang mới): Nộp đề A -> Mở tab mới/phiên mới truy cập trang -> Bấm thẻ đề A -> Bấm "Xem kết quả".
- **Actual:**
  - Ở ca 1: Báo cáo hiện điểm và câu hỏi của đề B (0/10) thay vì đề A (0,25/10).
  - Ở ca 2: Báo cáo hiện toàn bộ placeholder rỗng (`-- / --`, điểm rỗng `null`), không có bất kỳ điểm số nào của đề A.
- **Expected:** Màn hình báo cáo `#reportWrapper` phải hiển thị chính xác kết quả điểm (tổng và từng phần) cùng các câu hỏi/đáp án/lời giải đã lưu của đúng đề A theo D03 & D08.
- **Nguyên nhân kỹ thuật:** Trong `src/student/area.ts:726` (`dist/student/area.js:636-644`), khi `eff.status === 'submitted'`, hàm `handleStartOrResumeExam` chỉ đơn thuần đổi `repWrapper.style.display = ''` và ẩn `container` mà không hề nạp dữ liệu bản ghi `attempt` đã nộp của `exam.id` vào bộ hiển thị báo cáo.
- **Cách sửa tối thiểu:** Lấy `attemptRecord` từ storage hoặc `getLocalAttemptInfo(exam.id).record`, gọi hàm hiển thị báo cáo (hoặc callback kích hoạt controller render báo cáo cho `exam.id` và `record`) trước khi hiển thị `#reportWrapper`.
- **Bằng chứng:** Test `CX-S01a` (AssertionError: `[0, 10]` vs `[0.25, 10]`), `CX-S01b` (AssertionError: `null` vs `[0.25, 10]`); ảnh chụp `CX-S01a-wrong-result.png`, `CX-S01b-empty-result.png`.

---

#### CX-student-F02 — Hộp thoại xem trước đề `#examPreview` không quản lý focus và không đóng bằng Esc
- **Mức độ:** MINOR.
- **Bước tái hiện thật đã chạy:**
  1. Dùng bàn phím (Tab) focus vào thẻ đề `.exam-card` đầu tiên, nhấn phím Enter để mở `#examPreview`.
  2. Đọc `document.activeElement`.
  3. Nhấn phím Escape.
- **Actual:**
  - Focus vẫn kẹt ở thẻ đề phía dưới nền, không chuyển vào nút đóng hay nút `#btnStartExam` của `#examPreview`.
  - Nhấn phím Escape không có phản hồi gì, hộp thoại vẫn mở trơ trơ (`display: flex`).
- **Expected:** Tuân thủ DESIGN §4 Dialog: mở hộp thoại phải đưa tiêu điểm vào bên trong; phím Escape phải đóng hộp thoại và trả tiêu điểm về lại thẻ đề vừa bấm.
- **Nguyên nhân kỹ thuật:** `examPreviewModal` được tạo bằng `doc.createElement('div')` chay, không dùng component `Dialog` trong `src/ui/components.ts`, không có handler `keydown` bắt phím Escape, và không lưu `triggerElement` để `focus()`.
- **Cách sửa tối thiểu:** Sử dụng component `Dialog` chuẩn của UI hoặc bổ sung: trong `openPreview()` lưu `opener = doc.activeElement` rồi focus vào nút đóng; lắng nghe sự kiện `keydown` trên modal để đóng khi `e.key === 'Escape'`; khi đóng gọi `opener?.focus()`.
- **Bằng chứng:** Test `CX-S02a` (AssertionError: `false !== true` khi kiểm tra focus), `CX-S02b` (AssertionError: `true !== false` khi kiểm tra đóng modal).

---

#### CX-student-F03 — `?exam=<examId>` che cổng tên hoặc làm mất đề khi chưa có tên
- **Mức độ:** MAJOR.
- **Bước tái hiện thật đã chạy:**
  1. Trình duyệt chưa lưu tên học sinh (chưa qua cổng tên), mở URL `…/Cunata/?exam=cx-student-a`.
  2. Quan sát giao diện: `#examPreview` mở đè lên `#studentNameGate`.
  3. Bấm nút `#btnStartExam` trên preview.
  4. Nhập tên "Nguyễn Văn A" vào `#startName` và bấm nút "Tiếp tục" `#btnNameContinue`.
- **Actual:** Sau khi nhập tên và bấm Tiếp tục, người dùng rơi vào màn hình danh sách đề tổng thể. Hộp thoại xem trước đề `cx-student-a` đã bị đóng và biến mất, không còn được chọn sẵn.
- **Expected:** WEB §19.1: "`?exam=<examId>` → vào khu học sinh, mở sẵn `#examPreview` của đề đó (vẫn qua cổng tên nếu chưa có tên)". Cổng tên phải được ưu tiên giải quyết mà không làm mất đề đã liên kết.
- **Nguyên nhân kỹ thuật:** `area.ts` mở preview ngay lúc khởi tạo bất kể có tên hay chưa. Khi bấm bắt đầu, `handleStartOrResumeExam` đóng preview (`closePreview()`), kiểm tra `!candidateName.trim()` và return mà không lưu lại đề đang chờ (`pendingExamId`).
- **Cách sửa tối thiểu:** Nếu chưa có tên, lưu `pendingExam = found`, tạm thời chưa bung modal (hoặc khi đóng modal giữ `pendingExamId`), sau khi qua cổng tên thành công trong `btnNameContinue` thì tự động gọi `openPreview(pendingExam)`.
- **Bằng chứng:** Test `CX-S03`; ảnh chụp `CX-S03-name-covered.png` và `CX-S03-lost-selection.png`.

---

#### CX-student-F04 — Thẻ bài giao tương lai bị biến thành "Đã nộp" / "Xem kết quả" và mở khóa trái quy tắc
- **Mức độ:** MAJOR.
- **Bước tái hiện thật đã chạy:**
  1. Học sinh tham gia lớp có bài giao `cx-future` (giờ mở cách 60 phút nữa).
  2. Ở khu vực "Đề luyện tập" công khai phía dưới, học sinh bấm làm và nộp đề `cx-future`.
  3. Quay lại trang học sinh, quan sát thẻ bài giao `cx-future` trong "Lớp của em".
  4. Bấm vào thẻ bài giao đó.
- **Actual:** Thẻ bài giao đổi sang trạng thái "Đã nộp". Hộp thoại mở ra nút `#btnStartExam` có nhãn "Xem kết quả" và KHÔNG BỊ KHÓA (`disabled = false`), cho phép học sinh xem trước đề/kết quả dù bài giao của lớp chưa đến giờ mở.
- **Expected:** Bài giao trong lớp phải được quản lý độc lập theo `assignmentId`. Đề giao chưa mở bắt buộc phải hiển thị trạng thái "Chưa mở", nút `#btnStartExam` bị khóa và hiển thị lý do chưa mở, không được lấy trạng thái từ lượt làm tự do.
- **Nguyên nhân kỹ thuật:** `getLocalAttemptInfo(examId)` và `getEffectiveStatus(examId, openAt, dueAt)` chỉ tìm kiếm theo `examId` trong `localStorage`. Khi thấy có attempt cũ đã nộp (từ lượt luyện tập), điều kiện `attempt.status !== 'submitted'` bị vi phạm, khiến việc kiểm tra `now < openTime` bị bỏ qua hoàn toàn.
- **Cách sửa tối thiểu:** Truyền `assignmentId` vào `getEffectiveStatus(examId, openAt, dueAt, assignmentId)`. Chỉ chấp nhận `attempt.status === 'submitted'` đối với bài giao nếu bản ghi attempt có đúng `assignment_id` khớp với bài giao đó.
- **Bằng chứng:** Test `CX-S04` (AssertionError: `false !== true` trên `btnStartExam.disabled`); ảnh chụp `CX-S04-assignment-state.png`.

---

#### CX-student-F05 — Mở lại lớp đã vào không cập nhật bài mới được giáo viên giao
- **Mức độ:** MAJOR.
- **Bước tái hiện thật đã chạy:**
  1. Học sinh nhập mã tham gia lớp học thành công.
  2. Phía backend, giáo viên giao thêm một đề thi mới cho lớp đó.
  3. Học sinh nhấn F5 (tải lại trang).
- **Actual:** Danh sách bài tập trong lớp vẫn y nguyên như cũ, bài giao mới hoàn toàn không xuất hiện.
- **Expected:** Khi mở lại trang hoặc làm mới, các lớp đã tham gia phải được đồng bộ lại danh sách bài giao mới nhất từ máy chủ để học sinh nhìn thấy bài tập mới của thầy cô.
- **Nguyên nhân kỹ thuật:** `joinedClasses` chỉ được đọc một lần duy nhất từ `localStorage.getItem(STORAGE_CLASSES_KEY)` lúc khởi tạo. Hàm `refreshList()` chỉ gọi `loadPublicExams()` mà không hề gọi API `getClass` để làm mới bài tập của các lớp đã lưu.
- **Cách sửa tối thiểu:** Trong `refreshList()`, duyệt danh sách mã lớp trong `joinedClasses` và gọi API `getClass` ngầm qua `AppsScriptClient`, sau đó cập nhật lại danh sách assignments vào `localStorage` và gọi `renderClasses()`.
- **Bằng chứng:** Test `CX-S05` (AssertionError: `false !== true` khi tìm thẻ bài giao mới).

---

#### CX-student-F06 — Link mời dạng hash `#/hoc-sinh?lop=<MÃ>` không tự động nạp lớp
- **Mức độ:** MAJOR.
- **Bước tái hiện thật đã chạy:**
  1. Mở trang với URL định dạng chuẩn theo WEB §19.1: `…/Cunata/#/hoc-sinh?lop=ABCDEF`.
  2. Qua cổng tên vào trang học sinh.
- **Actual:** Ô mã lớp `#classCodeInput` hoàn toàn rỗng, lớp `ABCDEF` không được gọi nạp hay tham gia.
- **Expected:** Hệ thống phải nhận diện tham số `lop` từ link mời hash, tự động điền vào ô mã lớp và kích hoạt nạp lớp.
- **Nguyên nhân kỹ thuật:** Tại `src/student/area.ts:1174` (`dist/student/area.js:1054`), mã nguồn chỉ khởi tạo `params = new URLSearchParams(window.location.search)`. Tuy nhiên theo chuẩn định tuyến của Cunata, query nằm sau hash (`window.location.hash`), do đó `location.search` trả về rỗng!
- **Cách sửa tối thiểu:** Trích xuất params từ cả `location.search` lẫn phần query của `location.hash` (tương tự như `routes.ts` đã làm trong `parseHash`).
- **Bằng chứng:** Test `CX-S06` (AssertionError: `false !== true` khi kiểm tra phần tử `.class-section[data-class-code]`).

---

#### CX-student-F07 — Ô nhập mã lớp thiếu nhãn ngữ nghĩa và thuộc tính trợ năng lỗi
- **Mức độ:** MINOR.
- **Bước tái hiện thật đã chạy:**
  1. Kiểm tra DOM của `#classCodeInput` và `#classCodeError`.
  2. Bấm nút `#btnJoinClass` khi ô rỗng để kích hoạt thông báo lỗi "Vui lòng nhập mã lớp học.".
- **Actual:**
  - Ô nhập không có thẻ `<label>` tương ứng (`input.labels.length === 0`), chỉ dựa vào placeholder.
  - Khi có lỗi, ô nhập không có `aria-invalid="true"` và không có `aria-describedby="classCodeError"`.
- **Expected:** DESIGN §4 (Input) quy định: "Nhãn luôn hiện ở trên ô nhập", "Placeholder không thay nhãn", "Khi lỗi: viền màu error, thông báo lỗi ở dưới, `aria-invalid="true"`, `aria-describedby` trỏ tới id thông báo lỗi".
- **Nguyên nhân kỹ thuật:** `#classCodeInput` được tạo thủ công mà không bọc trong `Input` component chuẩn của `src/ui/components.ts` hoặc thiếu thẻ `<label for="classCodeInput">` và các thuộc tính ARIA.
- **Cách sửa tối thiểu:** Bổ sung `<label for="classCodeInput" class="ui-field-label">Mã lớp học</label>`, gán `aria-describedby="classCodeError"` cố định cho input, và thiết lập `aria-invalid="true"` khi hiển thị lỗi, xóa khi người dùng nhập lại.
- **Bằng chứng:** Test `CX-S07` (AssertionError: `placeholder không thay nhãn luôn hiện`).

---

#### CX-student-F08 — Lỗi tải danh sách đề tĩnh bị nuốt âm thầm, hiển thị màn hình trống
- **Mức độ:** MAJOR.
- **Bước tái hiện thật đã chạy:**
  1. Khởi chạy với file `public/exams/index.json` bị lỗi cú pháp `{broken-json` hoặc máy chủ trả HTTP 500 khi nạp danh sách đề.
  2. Học sinh vào trang học sinh.
- **Actual:** Khu vực đề luyện tập `#practiceExams` hoàn toàn trống trơn; không hề có bất kỳ thông báo lỗi nào hoặc nút Thử lại.
- **Expected:** WEB §15 & §16 quy định: "Lỗi: không tải được danh sách hoặc đề (mất mạng lần đầu, file hỏng) → báo rõ... màn vào thi báo rõ lỗi và có nút thử lại; không treo; không biến dữ liệu hỏng thành danh sách trống".
- **Nguyên nhân kỹ thuật:** Khối `try/catch` khi fetch `public/exams/index.json` tại `src/student/area.ts:1044-1047` (`dist/student/area.js:932-934`) bắt lỗi nhưng chỉ gán `staticExams = []` rồi bỏ qua.
- **Cách sửa tối thiểu:** Ghi nhận cờ lỗi `loadError = true`, khi render danh sách nếu có lỗi thì render component `ErrorState` kèm nút "Thử lại" gọi lại `refreshList()`.
- **Bằng chứng:** Test `CX-S08` (AssertionError: `không được biến dữ liệu hỏng thành danh sách trống`); ảnh chụp `CX-S08-list-failure.png`.

---

#### CX-student-F09 — Mở liên kết `?exam=` khác khi đang có bài dở dang đẩy học sinh ra màn chọn đề
- **Mức độ:** MAJOR.
- **Bước tái hiện thật đã chạy:**
  1. Học sinh đang làm dở đề A (đã nhập đáp án phần III, bản ghi draft đã được lưu vào storage).
  2. Mở URL trang với tham số `?exam=cx-student-b`.
- **Actual:** Trang không khôi phục bài thi A đang làm dở mà mở thẳng màn hình khởi động với hộp thoại xem trước đề B.
- **Expected:** Quyết định D03 & WEB §16, §19.1 quy định: "Có bài đang làm dở (chưa nộp) → vào thẳng bài dở như quyết định D03 (tải lại trang không bị đẩy ra màn vào thi). `?exam=<examId>`: Có bài dở → vào thẳng bài dở (D03)". Bài thi dở dang phải luôn được ưu tiên bảo vệ.
- **Nguyên nhân kỹ thuật:** Tại `src/app/main.ts:2989` (`dist/app/main.js:2989`), điều kiện kiểm tra bản ghi dở dang bị giới hạn bởi: `(!queryExamId || queryExamId === currentExam.examId)`. Khi `queryExamId` khác với `currentExam.examId`, nhánh kiểm tra draft bị bỏ qua, dẫn tới việc bỏ rơi bài thi dở dang.
- **Cách sửa tối thiểu:** Quét storage tìm bản ghi `draft` trước; nếu có bài dở dang thì luôn khôi phục bài dở đó bất kể giá trị của `queryExamId`.
- **Bằng chứng:** Test `CX-S09` (AssertionError: `false !== true` khi kiểm tra `#examWrapper`).

---

#### CX-student-F10 — Nút Đổi tên trên TopBar không mở cổng đổi tên khi quay lại từ bài thi
- **Mức độ:** MAJOR.
- **Bước tái hiện thật đã chạy:**
  1. Học sinh vào làm bài thi, sau đó bấm nút "Về trang học sinh" (`#btnOpenExamList`).
  2. Đóng hộp thoại xem trước nếu có.
  3. Bấm vào nút "Đổi tên" trên thanh điều hướng trên cùng (`#appTopBar #btnChangeName`).
- **Actual:** Cổng đổi tên `#studentNameGate` không hiển thị (vẫn bị ẩn `display: none`), màn hình chính `#studentMainArea` vẫn hiện, người dùng không thể đổi tên.
- **Expected:** WEB §19.1: "TopBar hiện tên + `#btnChangeName`", bấm vào phải mở lại cổng nhập tên có thể chỉnh sửa họ tên.
- **Nguyên nhân kỹ thuật:** Nút `#btnChangeName` trên `#appTopBar` chỉ gọi `router.navigate('student'); root.querySelector('#startName')?.focus();` (tại `src/app/main.ts:536-539`), nhưng không hề thông báo cho `studentArea` thực hiện `syncNameState()`. Do `candidateName` trong `area.ts` vẫn còn giá trị, `#studentNameGate` vẫn bị ẩn, khiến lệnh `focus()` thất bại.
- **Cách sửa tối thiểu:** Trong hàm `mountRoleShell`, callback `onChangeName` cần kích hoạt hàm `openNameChange()` của `mountStudentArea` (hoặc giả lập click nút `#btnChangeName` nội bộ của `area.ts`) để xóa tên tạm thời và mở `#studentNameGate`.
- **Bằng chứng:** Test `CX-S10` (AssertionError: `false !== true` trên `#studentNameGate`).

---

## 4. Gợi ý cải tiến trải nghiệm (Không tính là lỗi)

1. **Thông báo Toast sau khi tham gia lớp thành công:** Hiện tại sau khi nhập đúng mã lớp, ô nhập mã tự xóa nhưng không có thông báo dạng Toast chúc mừng học sinh đã tham gia lớp (ví dụ: "Đã vào lớp 12A thành công").
2. **Nút "Quay lại" rõ ràng trên `#examPreview`:** Trên màn hình xem trước đề thi, hiện chỉ có nút biểu tượng "X" nhỏ ở góc phải trên. Nên bổ sung nút "Quay lại" hoặc "Đóng" dạng Button có nhãn rõ ràng ở chân hộp thoại cạnh nút "Bắt đầu làm bài".
3. **Hiển thị số lượng câu hỏi đã làm trên thẻ đề khi đang dở dang:** Thẻ đề đang làm dở hiện StatusBadge "Đang làm", nếu bổ sung thông tin tiến độ (ví dụ "Đã làm 15/40 câu") sẽ giúp học sinh nắm bắt nhanh hơn.

---

## 5. Lệnh đã chạy, kết quả thực đo và giới hạn (NOT_RUN)

### Các lệnh kiểm định tự động đã chạy thực tế:

| Lệnh thực thi | Mục đích | Exit Code | Kết quả thực đo | Thời gian |
|---|---|---|---|---|
| `node --test ops/blitz/student/proposed.test.mjs` | Bộ 15 test kiểm định toàn diện luồng học sinh (12 test đỏ chứng minh 10 findings, 3 test xanh kiểm soát baseline) | **1** | **3 PASS, 12 FAIL** | 13,9 giây |
| `node --test --test-reporter=tap ops/blitz/student/proposed.test.mjs > ops/blitz/student/proposed.tap.txt` | Xuất toàn bộ kết quả kiểm định chi tiết dạng TAP chuẩn vào artifact | **1** | **15 tests (3 ok, 12 not ok)** | 12,8 giây |
| `node --test ops/blitz/student/coverage.test.mjs` | Kiểm tra giao diện đa kích thước (375/768/1440px), sáng/tối, nộp bài tập lớp lên GAS giả lập, giới hạn maxAttempts | **0** | **8 PASS, 0 FAIL** | 6,7 giây |
| `npx --no-install tsc -p tsconfig.json --noEmit` | Kiểm tra typecheck toàn bộ core source code | **0** | **0 lỗi** | ~3 giây |
| `npx --no-install tsc -p tsconfig.web.json --noEmit` | Kiểm tra typecheck client web source code | **0** | **0 lỗi** | ~3 giây |

### Danh sách các ca test trong `ops/blitz/student/proposed.test.mjs`:
- `PASS-01`: Chọn vai, cổng tên chặn rỗng/khoảng trắng, tên Việt được trim và nhớ; đổi tên/đổi vai (**PASS**)
- `PASS-02`: Mã thiếu/sai hiển thị lỗi; chữ thường + khoảng trắng vào lớp; thẻ có mô tả, ngày và khóa chưa mở/quá hạn (**PASS**)
- `PASS-03`: I/II/III, lưu sau reload, tên chỉ đọc, điểm/lời giải/download offline, chưa cấu hình không gửi mạng (**PASS**)
- `CX-S01a`: Xem kết quả đề A sau đề B phải tải đúng điểm/tiêu đề A (**FAIL — ĐỎ**)
- `CX-S01b`: Xem kết quả từ lần mở mới phải khôi phục báo cáo đã lưu (**FAIL — ĐỎ**)
- `CX-S02a`: Mở preview bằng bàn phím phải focus trong dialog (**FAIL — ĐỎ**)
- `CX-S02b`: Esc đóng preview và trả focus (**FAIL — ĐỎ**)
- `CX-S03`: `?exam` phải giữ đề đã chọn qua cổng tên khi bấm Bắt đầu sớm (**FAIL — ĐỎ**)
- `CX-S04`: Luyện tập đã nộp không biến bài giao chưa mở thành Đã nộp (**FAIL — ĐỎ**)
- `CX-S05`: Mở lại lớp đã vào phải tải bài giáo viên mới giao (**FAIL — ĐỎ**)
- `CX-S06`: Link mời `#/hoc-sinh?lop=<MÃ>` phải đưa vào lớp (**FAIL — ĐỎ**)
- `CX-S07`: Ô mã lớp có nhãn luôn hiện và lỗi liên kết ngữ nghĩa (**FAIL — ĐỎ**)
- `CX-S08`: Danh sách lỗi phải báo lỗi và có Thử lại (**FAIL — ĐỎ**)
- `CX-S09`: `?exam` khác không được đẩy bài đang làm dở ra màn chọn (**FAIL — ĐỎ**)
- `CX-S10`: Đổi tên trên TopBar sau quay về phải mở cổng đổi tên (**FAIL — ĐỎ**)

### Giới hạn kiểm định (NOT_RUN):
- **NOT_RUN: Gửi dữ liệu tới Google Apps Script production thật trên cloud**: Tuân thủ tuyệt đối quy tắc chung của đợt rà soát blitz và mục 17.1/17.6 của hợp đồng: không gọi URL Google thật, không đọc `ops/prod_config.json`, chỉ kiểm thử tương tác qua `gas-server.mjs` chạy `apps-script/Code.js` cục bộ.
- **NOT_RUN: Trình duyệt Safari/WebKit và thiết bị iOS thật**: Kiểm định tự động thực hiện trên Chrome thông qua giao thức Chrome DevTools Protocol (CDP); môi trường Windows hiện tại không có trình duyệt WebKit/iOS thật nên các kiểm tra giao diện mobile sử dụng thiết lập Device Metrics và Touch Emulation của Chrome.
- **NOT_RUN: Nhập liệu bàn phím bộ gõ tiếng Việt Telex/VNI cấp hệ điều hành**: Do hạn chế headless automation của CDP chỉ hỗ trợ gửi ký tự đã gộp hoàn chỉnh (`Input.insertText`), các bài kiểm tra gõ tiếng Việt chỉ xác nhận chuỗi Unicode có dấu sau khi nhập, không kiểm tra được trạng thái composition của bộ gõ ngoài OS.
