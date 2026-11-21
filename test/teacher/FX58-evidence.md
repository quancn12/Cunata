# Bằng chứng nghiệm thu sửa lỗi task FX58-teacher (Vòng sửa 58)

## 1. Thông tin task
- Task ID: `FX58-teacher`
- Scope: `src/teacher/**`, `test/teacher/**`
- Lỗi báo cáo: `ops/fix/round58/failures-teacher.txt`
  - Ca lỗi: `CX-teacher-F04: kết quả có thể chọn lớp và đề được giao (WEB-contract §19.1)`
  - Lỗi: `AssertionError [ERR_ASSERTION]: WEB §19.1: cần bộ chọn đề, không chỉ chọn lớp`

## 2. Phân tích nguyên nhân gốc (Root Cause)
1. **Bất đồng bộ không đồng bộ hóa giữa bộ lọc đề và bảng kết quả**:
   - Trong `src/teacher/portal.ts` (`renderResultsSection`), khi chuyển hướng vào `#/giao-vien/ket-qua`:
     - Hàm gọi đồng thời `void syncExamSelectOptions(clsSelect.value)` và `void loadResults()`.
     - `syncExamSelectOptions` ngay từ đầu đã gọi `clearChildren(examSelect)` và chỉ thêm `-- Tất cả đề --`, sau đó mới lặp tuần tự gọi bất đồng bộ `listAssignments(tok, c.classId)`.
     - Trong khi đó, `loadResults()` gọi `listResults(tok, c.classId)`. Khi dữ liệu kết quả trả về trước khi `listAssignments` hoàn tất, bảng `#resultsTable` lập tức kết xuất các dòng học sinh (`Nguyễn Học Sinh CX`).
   - Ca kiểm định `CX-teacher-F04` sử dụng `p.waitFor(() => document.querySelector('#resultsTable')?.innerText.includes('Nguyễn Học Sinh CX'))`.
     - Ngay khi bảng kết quả xuất hiện học sinh, `waitFor` lập tức hoàn thành và kiểm tra các thẻ `<select>` trong `#teacherMainContent`.
     - Do `syncExamSelectOptions` vẫn đang trong quá trình chờ mạng / xử lý `listAssignments`, thẻ `#resultsExamSelect` lúc đó chỉ có duy nhất lựa chọn `[ { value: "", text: "-- Tất cả đề --" } ]`.
     - Khi chạy độc lập hoặc tải nhẹ, thời gian mạng có thể may mắn lọt vào trước, nhưng khi chạy toàn bộ test hoặc có độ trễ mạng, điều kiện đua khiến test đánh giá sai trạng thái dropdown và ném `AssertionError: WEB §19.1: cần bộ chọn đề, không chỉ chọn lớp`.

2. **Dọn DOM sớm và tuần tự hóa không cần thiết**:
   - `syncExamSelectOptions` xóa các phần tử con của `<select>` trước khi có kết quả mạng thay vì chuẩn bị danh sách option rồi gán nguyên tử.
   - Việc gọi `listAssignments` trong vòng lặp tuần tự `for...of` làm tăng độ trễ theo số lượng lớp học.

## 3. Giải pháp đã thực hiện
1. **Đồng bộ hóa luồng nạp kết quả và bộ lọc đề (`pendingExamSync`)**:
   - `loadResults()` luôn `await pendingExamSync` trước khi xử lý và kết xuất bảng kết quả `#resultsTable`. Nhờ đó, `#resultsTable` chỉ hiển thị kết quả khi `#resultsExamSelect` đã nạp đầy đủ các tùy chọn đề thi được giao.
2. **Truy vấn bài tập song song (`Promise.all`) và cập nhật DOM nguyên tử**:
   - Chuyển `classesToQuery.map(...)` sang `Promise.all` để nạp danh sách giao đề của tất cả lớp song song trong 1 roundtrip.
   - Gom toàn bộ `<option>` vào mảng tạm `opts` và chỉ hoán đổi `examSelect` sau khi dữ liệu đã sẵn sàng, không để thẻ select rơi vào trạng thái rỗng trong thời gian đợi mạng.
3. **Tuần tự hóa luồng khởi tạo `initResultsSection`**:
   - Nạp danh sách lớp mới nhất từ server (nếu có), cập nhật `clsSelect`, đồng bộ `examSelect`, rồi mới kết xuất bảng kết quả.
4. **Bổ sung test hồi quy**:
   - Cập nhật và bổ sung ca kiểm thử `test/teacher/portal.test.ts` kiểm tra tình huống `listAssignments` bị trễ so với `listResults`: đảm bảo `#resultsExamSelect` luôn sẵn sàng khi `#resultsTable` hiển thị dữ liệu.

## 4. Kết quả kiểm tra xác minh thực tế
- `npx --no-install tsc -p tsconfig.json` | exit=0
- `npx --no-install tsc -p tsconfig.web.json` | exit=0
- `node --test "test/teacher/**/*.test.ts"` | exit=0 | pass=110 fail=0
- `node --test "test/codex-check/cx/teacher.test.mjs"` | exit=0 | pass=7 fail=0
- `node --test "test/claude-check/teacher.test.mjs"` | exit=0 | pass=11 fail=0
- Toàn bộ ca kiểm định vùng `teacher` độc lập của cả Codex và Claude đều đạt trạng thái XANH (PASS).
