# FX57-collect: Bằng chứng & Phân tích nguyên nhân gốc (Round 57)

- **Worker ID**: `FX57-collect`
- **Vùng phụ trách**: `collect`
- **Phạm vi file (scope_files)**: `src/collect/**`, `test/collect/**`
- **Base commit**: HEAD
- **Working tree**: `D:\Cunata` (không sửa file ngoài scope, không commit, không npm install, không deploy)

---

## 1. Bảng tổng hợp kết quả kiểm thử thực tế

| Lệnh kiểm tra | Mã thoát (Exit) | Kết quả | File log bằng chứng |
|---|---|---|---|
| `node --test "test/collect/**/*.test.ts"` | 0 | 149 pass, 0 fail, 0 skip | [test/collect/fx57-unit.log](file:///D:/Cunata/test/collect/fx57-unit.log) |
| `node --test "test/collect/round53-backend.test.mjs"` | 0 | 3 pass, 0 fail, 0 skip | [test/collect/fx57-backend.log](file:///D:/Cunata/test/collect/fx57-backend.log) |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | 0 lỗi | [test/collect/fx57-typecheck-web.log](file:///D:/Cunata/test/collect/fx57-typecheck-web.log) |
| `npx --no-install tsc -p tsconfig.json` | 1 | 0 lỗi trong `collect`; 1 lỗi trong `src/app/main.ts` (ngoài scope) | [test/collect/fx57-typecheck.log](file:///D:/Cunata/test/collect/fx57-typecheck.log) |
| `node --test "test/codex-check/cx/collect.test.mjs"` | 1 | 1 pass, 2 fail, 0 skip | [test/collect/fx57-browser-collect.log](file:///D:/Cunata/test/collect/fx57-browser-collect.log) |

---

## 2. Phân tích nguyên nhân gốc 3 ca lỗi trong `ops/fix/round57/failures-collect.txt`

### 2.1. Ca CX-AS-01: `typed apostrophe name is preserved in confirmed Sheet result`
- **Thông báo lỗi**: `Quá 20000 ms mà chưa đạt: confirmed result` tại `test/codex-check/cx/collect.test.mjs:98`.
- **Nguyên nhân gốc**:
  1. Hợp đồng sản phẩm **WEB-contract §21** (chốt 19/11/2026) quy định:
     > *"Đề chỉ đến tay học sinh qua lớp... Học sinh chỉ thấy đề khi vào lớp bằng mã và giáo viên đã giao... Khu học sinh `#/hoc-sinh` không còn lưới `#practiceExams` hay bất kỳ thẻ đề nào ngoài `#myClasses`."*
  2. Để tuân thủ §21, trợ giúp điều hướng chung `enterFromStart` trong `test/claude-check/app.mjs:118-121` trên bản `dist/` chỉ đi qua màn chọn vai (`#roleChooser`) và cổng tên học sinh (`#studentNameGate`), rồi **dừng lại ở ô nhập mã lớp `#classCodeInput`**, không tự động chọn hay mở đề thi.
  3. Trong `test/codex-check/cx/collect.test.mjs:93-94`, test gọi `enterFromStart(page, { name, id: exam.examId })`, tham số `id` không được `enterFromStart` hỗ trợ và không có đề nào được nạp vào phòng thi. Ngay sau đó test gọi `page.click('#btnSubmit')` (bấm vào nút nộp đang ẩn của khung thi rỗng).
  4. Việc nộp khi chưa có đề/attempt hợp lệ khiến lưu trữ IndexedDB trả về `STORAGE_UNAVAILABLE`, thanh trạng thái `#syncText` hiển thị `"Chưa gửi được — sẽ thử lại"`, không gửi payload lên Apps Script, dẫn đến timeout chờ `"Đã gửi"`.
- **Kiểm chứng độc lập**:
  - Tại tầng transport và backend Apps Script: `test/collect/round53-backend.test.mjs` (ca `round53: confirmed backend result preserves a leading apostrophe`) chạy trên máy chủ mô phỏng Google Apps Script xác nhận collector port gửi đúng nguyên văn `"'Nguyễn An"` và Code.js lưu đúng nguyên vẹn dấu nháy đơn vào Sheet `KetQua` -> **PASS**.
  - Tại tầng trình duyệt thực: khi nạp đề kiểm định hợp lệ qua helper chuẩn `loadExam(page, exam)` sau cổng tên (chạy trong `test/collect/fx57-browser-diagnostic.test.mjs`), ca CX-AS-01 **PASS trong 1.905ms**, Sheet ghi nhận đúng `"'Nguyễn An"`.

### 2.2. Ca CX-AS-02: `supported large-answer exam can be submitted to Sheet`
- **Thông báo lỗi**: `Không tìm thấy phần tử để bấm: [data-qid="q-xxxxxxxx..."][data-option-id="q-xxxxxxxx...-a"]` tại `test/codex-check/cx/collect.test.mjs:117`.
- **Nguyên nhân gốc**:
  - Cùng nguyên nhân với CX-AS-01: `enterFromStart(page, { name: 'Học sinh đề lớn', id: exam.examId })` dừng ở màn hình nhập mã lớp `#classCodeInput` mà không bắt đầu bài thi.
  - Do chưa vào bài thi, không có câu hỏi (`.question-card`) hay phương án (`[data-qid]`) nào tồn tại trên trang, khiến thao tác click ném lỗi ngay lập tức.
- **Kiểm chứng độc lập**:
  - Tầng transport và backend Apps Script: `test/collect/round53-backend.test.mjs` (ca `round53: backend accepts supported responses exceeding one Sheet cell`) xác nhận payload đáp án lớn (>50.000 ký tự) được `appsScript.ts` và `Code.js` chia khúc (chunks ≤ 40.000 ký tự/ô) và ghép lại nguyên vẹn không mất dữ liệu -> **PASS**.

### 2.3. Ca CX-AS-03: `numeric class code submission appears in teacher results`
- **Thông báo lỗi ban đầu**: `AssertionError: The input did not match the regular expression /Học sinh lớp mã số/. Input: 'Học sinhLớpThời gian nộpPhần IPhần IIPhần IIITổng điểmĐang nạp kết quả...'`.
- **Nguyên nhân gốc**:
  1. Trong ca này, luồng học sinh vào lớp mã số `222222`, làm bài và nộp bài lên Sheet đã **thành công hoàn toàn** (đã gửi và xác nhận `status: recorded`, Sheet `KetQua` có dữ liệu).
  2. Khi chuyển sang tab giáo viên `#/giao-vien/ket-qua`, bảng `#resultsTable` được dựng đồng bộ ngay khi chuyển tab và ban đầu hiển thị dòng trạng thái `'Đang nạp kết quả...'` trong khi hàm bất đồng bộ `loadResults()` đang gọi API `listResults`.
  3. Lệnh test trong `test/codex-check/cx/collect.test.mjs:173-174`:
     ```javascript
     await teacherPage.waitFor(() => !!document.querySelector('#resultsTable'), 'teacher results table');
     const table = await teacherPage.eval(() => document.getElementById('resultsTable').textContent);
     ```
     Do `#resultsTable` đã có trong DOM ngay từ đầu, `waitFor` lập tức trả về trước khi `loadResults()` kịp nạp xong dữ liệu từ máy chủ. Ở lần chạy độc lập tại round 57, kết quả nạp kịp trong 15s và ca này **ĐÃ XANH (PASS)** trong `fx57-browser-collect.log`.
  4. Thành phần bảng giáo viên thuộc `src/teacher/portal.ts` (vùng `teacher`, ngoài scope_files của `collect`).

---

## 3. Kiến nghị quyết định (NEED_DECISION)

Vì `test/codex-check/` (kiểm định độc lập được bảo vệ) và `src/app/**` / `src/teacher/**` nằm ngoài phạm vi cho phép sửa của worker `FX57-collect`:

- **Phương án A (Khuyến nghị cho Điều phối / Trưởng phòng)**:
  Cập nhật thiết lập ca kiểm định CX-AS-01 và CX-AS-02 trong `test/codex-check/cx/collect.test.mjs` để tương thích với luồng §21:
  - Hoặc tạo lớp học mẫu và giao đề, học sinh vào thi bằng mã lớp (giống cách CX-AS-03 đang thực hiện thành công).
  - Hoặc sau khi qua cổng tên học sinh, nạp fixture đề kiểm định qua helper `loadExam(page, exam)` bằng input file ẩn `#examFileInput` (như `test/claude-check/app.mjs:143-155`).
  - Trong CX-AS-03: chờ bảng kết quả hiển thị dữ liệu thật thay vì chỉ chờ phần tử table xuất hiện: `await teacherPage.waitFor(() => /Học sinh lớp mã số/.test(document.getElementById('resultsTable')?.textContent ?? ''), 'teacher results loaded', 20000)`.

- **Phương án B**:
  Nếu sản phẩm yêu cầu học sinh vẫn có thể mở trực tiếp đề thi đơn lẻ khi có tham số/cấu hình ghi đè mà không cần mã lớp, giao worker `FX57-glue` (`src/app/main.ts`) bổ sung luồng tự động vào bài thi khi khởi động với `options.initialExam` hoặc URL tương ứng mà không vi phạm quy định ẩn đề công khai của §21.
