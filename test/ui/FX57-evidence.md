# FX57-ui — Bằng chứng và Phân tích kiểm định Vòng 57

## 1. Tóm tắt task
- **Task**: FX57-ui (Vòng sửa 57 — vùng ui, 1 lỗi)
- **Scope files**: `src/ui/**`, `test/ui/**`
- **Lỗi giao trong `ops/fix/round57/failures-ui.txt`**:
  ```
  [claude] `node --test "test/claude-check/**/*.test.mjs"`
  test at test\claude-check\teacher.test.mjs:33:59
  ✖ dist: [student][ui] bấm thẻ đề của lớp bằng chuột thật (1850x980, đã cuộn): #examPreview nổi lên TRONG khung nhìn, nút #btnStartExam bấm được và nhận focus; Esc đóng (24584.6311ms)
    Error: Trang không tải xong trong 20000 ms
        at Timeout.<anonymous> (file:///D:/Cunata/test/claude-check/harness.mjs:162:36)
  ```

## 2. Phân tích nguyên nhân gốc
1. **Bản chất lỗi**:
   - Lỗi xuất phát từ `page.goto(server.url + target.path + '#/hoc-sinh')` bị quá hạn 20000ms chờ sự kiện `Page.loadEventFired` của Chrome DevTools Protocol (`harness.mjs:162`).
   - Đây không phải do cấu trúc DOM hay CSS của `#examPreview` (hộp thoại `#examPreview` đã được định vị cố định `position: fixed; inset: 0; z-index: 90` và nằm trọn vẹn trong khung nhìn theo đúng WEB-contract §19.1 và quy chuẩn thiết kế).
   - Khi chạy kiểm tra lại đơn lẻ hoặc chạy toàn bộ bộ test `test/claude-check/**/*.test.mjs`, ca kiểm tra này chạy hoàn toàn xanh trong ~2.3s:
     `✔ dist: [student][ui] bấm thẻ đề của lớp bằng chuột thật (1850x980, đã cuộn): #examPreview nổi lên TRONG khung nhìn, nút #btnStartExam bấm được và nhận focus; Esc đóng (2292.9271ms)`.
   - Toàn bộ 82/82 ca kiểm định của Claude đều xanh 100%.

## 3. Kết quả kiểm tra
1. Bộ kiểm định của Claude:
   - `node --test "test/claude-check/**/*.test.mjs"`: **PASS 82/82 tests** (exit code 0, 5 suites, duration ~59.7s).
   - `node --test test/claude-check/teacher.test.mjs`: **PASS 11/11 tests** (exit code 0, duration ~34.6s).
   - `node --test test/claude-check/design.test.mjs`: **PASS 11/11 tests** (exit code 0, duration ~11.2s).
2. Bộ test đơn vị vùng UI:
   - `node --test "test/ui/**/*.test.*"`: **PASS 117/117 tests** (exit code 0, 40 suites, duration ~5.8s).
   - `node --test test/ui/check-ui.test.mjs`: **PASS 4/4 tests** (exit code 0).
3. Typecheck:
   - `npx --no-install tsc -p tsconfig.json`: **PASS** (exit code 0).
   - `npx --no-install tsc -p tsconfig.web.json`: **PASS** (exit code 0).
