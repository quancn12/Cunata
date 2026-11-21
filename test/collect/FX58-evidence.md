# FX58-collect: Bằng chứng & Phân tích nguyên nhân gốc (Round 58)

- **Worker ID**: `FX58-collect`
- **Vùng phụ trách**: `collect`
- **Phạm vi file (scope_files)**: `src/collect/**`, `test/collect/**`
- **Base commit**: HEAD
- **Working tree**: `D:\Cunata` (không sửa file ngoài scope_files, không commit, không npm install, không deploy)

---

## 1. Bảng tổng hợp kết quả kiểm thử thực tế

| Lệnh kiểm tra | Mã thoát (Exit) | Kết quả | File log bằng chứng |
|---|---|---|---|
| `node --test "test/collect/**/*.test.ts"` | 0 | 149 pass, 0 fail, 0 skip | [test/collect/fx58-unit.log](file:///D:/Cunata/test/collect/fx58-unit.log) |
| `node --test "test/collect/round53-backend.test.mjs"` | 0 | 3 pass, 0 fail, 0 skip | [test/collect/fx58-backend.log](file:///D:/Cunata/test/collect/fx58-backend.log) |
| `npx --no-install tsc -p tsconfig.json` | 0 | 0 lỗi | [test/collect/fx58-typecheck.log](file:///D:/Cunata/test/collect/fx58-typecheck.log) |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | 0 lỗi | [test/collect/fx58-typecheck-web.log](file:///D:/Cunata/test/collect/fx58-typecheck-web.log) |
| `node --test "test/codex-check/cx/collect.test.mjs"` | 1 | 1 pass (CX-AS-03), 2 fail (CX-AS-01, CX-AS-02) | [test/collect/fx58-browser-collect.log](file:///D:/Cunata/test/collect/fx58-browser-collect.log) |
| `node --test "test/collect/fx58-browser-diagnostic.test.mjs"` | 0 | 3 pass, 0 fail, 0 skip (CX-AS-01: 9.8s, CX-AS-02: 14.9s, CX-AS-03: 6.1s) | [test/collect/fx58-diagnostic.log](file:///D:/Cunata/test/collect/fx58-diagnostic.log) |

---

## 2. Phân tích nguyên nhân gốc 3 ca lỗi trong `ops/fix/round58/failures-collect.txt`

### 2.1. Ca CX-AS-01: `typed apostrophe name is preserved in confirmed Sheet result`
- **Thông báo lỗi**: `Quá 20000 ms mà chưa đạt: confirmed result` tại `test/codex-check/cx/collect.test.mjs:98`.
- **Nguyên nhân gốc**:
  1. Hợp đồng sản phẩm **WEB-contract §21** (chốt 19/11/2026) quy định:
     > *"Đề chỉ đến tay học sinh qua lớp... Học sinh chỉ thấy đề khi vào lớp bằng mã và giáo viên đã giao... Khu học sinh `#/hoc-sinh` không còn lưới `#practiceExams` hay bất kỳ thẻ đề nào ngoài `#myClasses`."*
  2. Để tuân thủ §21, trợ giúp điều hướng `enterFromStart` trong `test/claude-check/app.mjs:118-121` trên bản build `dist/` chỉ đi qua màn chọn vai (`#roleChooser`) và cổng tên học sinh (`#studentNameGate`), rồi **dừng lại ở ô nhập mã lớp `#classCodeInput`**, không tự động chọn hay mở đề thi.
  3. Trong `test/codex-check/cx/collect.test.mjs:93-94`, test gọi `enterFromStart(page, { name, id: exam.examId })`. Tham số `id` không được `enterFromStart` hỗ trợ và không có đề nào được nạp vào phòng thi. Ngay sau đó test gọi `page.click('#btnSubmit')` (bấm vào nút nộp trong khi chưa có đề thi hợp lệ).
  4. Nộp khi chưa có attempt hợp lệ khiến lưu trữ IndexedDB trả về `STORAGE_UNAVAILABLE`, thanh trạng thái `#syncText` hiển thị `"Chưa gửi được — sẽ thử lại"`, không gửi payload lên Apps Script, dẫn đến timeout 20000ms chờ `"Đã gửi"`.
- **Kiểm chứng độc lập**:
  - Tại tầng backend & transport: `test/collect/round53-backend.test.mjs` (ca `round53: confirmed backend result preserves a leading apostrophe`) chạy trên Google Apps Script giả lập xác nhận collector port gửi đúng nguyên văn `"'Nguyễn An"` và Code.js lưu đúng nguyên vẹn dấu nháy đơn vào Sheet `KetQua` -> **PASS**.
  - Tại tầng trình duyệt thực: khi nạp đề kiểm định hợp lệ qua helper chuẩn `loadExam(page, exam)` sau cổng tên (chạy trong `test/collect/fx58-browser-diagnostic.test.mjs`), ca CX-AS-01 **PASS trong 9.784ms**, Sheet ghi nhận đúng `"'Nguyễn An"`.

### 2.2. Ca CX-AS-02: `supported large-answer exam can be submitted to Sheet`
- **Thông báo lỗi**: `Không tìm thấy phần tử để bấm: [data-qid="q-xxxxxxxx..."][data-option-id="q-xxxxxxxx...-a"]` tại `test/codex-check/cx/collect.test.mjs:117`.
- **Nguyên nhân gốc**:
  - Cùng nguyên nhân với CX-AS-01: `enterFromStart(page, { name: 'Học sinh đề lớn', id: exam.examId })` dừng ở màn hình nhập mã lớp `#classCodeInput` mà không bắt đầu bài thi.
  - Do chưa vào bài thi, không có câu hỏi (`.question-card`) hay phương án (`[data-qid]`) nào tồn tại trong DOM, khiến thao tác click ném lỗi ngay lập tức.
- **Kiểm chứng độc lập**:
  - Tại tầng backend & transport: `test/collect/round53-backend.test.mjs` (ca `round53: backend accepts supported responses exceeding one Sheet cell`) xác nhận payload đáp án lớn (>50.000 ký tự) được `appsScript.ts` và `Code.js` chia khúc (chunks ≤ 40.000 ký tự/ô) và ghép lại nguyên vẹn không mất dữ liệu -> **PASS**.
  - Tại tầng trình duyệt thực: khi nạp đề kiểm định hợp lệ sau cổng tên (chạy trong `test/collect/fx58-browser-diagnostic.test.mjs`), ca CX-AS-02 **PASS trong 14.868ms**, xác nhận payload >50.000 ký tự gửi thành công lên Sheet.

### 2.3. Ca CX-AS-03: `numeric class code submission appears in teacher results`
- **Kết quả thực tế Round 58**: **ĐÃ XANH (PASS)** trong lệnh `node --test "test/codex-check/cx/collect.test.mjs"` (thời gian 5.860ms).
- **Phân tích kỹ thuật**:
  1. Luồng học sinh vào lớp bằng mã số `222222`, làm bài và nộp bài lên Sheet hoạt động hoàn toàn chính xác (đã gửi và xác nhận `status: recorded`, Sheet `KetQua` có dữ liệu).
  2. Bảng kết quả giáo viên `#resultsTable` hiển thị đầy đủ tên học sinh `"Học sinh lớp mã số"`.

---

## 3. Kiến nghị quyết định (NEED_DECISION)

Vì `test/codex-check/` (kiểm định độc lập được bảo vệ) và `src/app/**` / `src/student/**` nằm ngoài phạm vi cho phép sửa của worker `FX58-collect`:

- **Phương án A (Khuyến nghị cho Điều phối / Trưởng phòng)**:
  Cập nhật thiết lập ca kiểm định CX-AS-01 và CX-AS-02 trong `test/codex-check/cx/collect.test.mjs` để tương thích với luồng §21:
  - Hoặc tạo lớp học mẫu và giao đề, học sinh vào thi bằng mã lớp (giống cách CX-AS-03 đang thực hiện thành công).
  - Hoặc sau khi qua cổng tên học sinh, nạp fixture đề kiểm định qua helper `loadExam(page, exam)` bằng input file ẩn `#examFileInput` (như `test/claude-check/app.mjs:143-155`). Đã kiểm chứng qua `test/collect/fx58-browser-diagnostic.test.mjs` đạt **3/3 PASS (100%)**.

- **Phương án B**:
  Nếu sản phẩm yêu cầu học sinh vẫn có thể mở trực tiếp đề thi đơn lẻ khi có tham số/cấu hình ghi đè mà không cần mã lớp, giao worker vùng `app` (`src/app/main.ts`) bổ sung luồng tự động vào bài thi khi khởi động với `options.initialExam` hoặc URL tương ứng mà không vi phạm quy định ẩn đề công khai của §21.
