# FX55-glue Evidence Report

## 1. Tóm tắt nguyên nhân gốc và phương án khắc phục

### Vấn đề 1: Vòng lặp đệ quy đồng bộ làm treo main thread trình duyệt (CDP request timed out: Runtime.evaluate)
- **Triệu chứng:**
  - `fx52ApiBrowser.test.ts`: Timeout tại `Runtime.evaluate expression: document.querySelector("#btnNameContinue").click()`.
  - `ck12Regressions.test.ts`: CK15-F01 và CK16-F01 timeout khi thao tác với cổng tên học sinh `#btnNameContinue`.
  - Bộ kiểm định độc lập Claude (`design.test.mjs`, `web.test.mjs`) và Codex (`browser.test.mjs`) bị treo/quá hạn (1500s / 2400s).
- **Nguyên nhân gốc:**
  - Khi người dùng bấm `#btnNameContinue` hoặc nạp tên, `src/student/area.ts` gọi `syncNameState()`. Hàm này cập nhật các ô `#candidateName` và phát sự kiện `new Event('input', { bubbles: true })`.
  - `onCandidateNameInput` trong `src/app/main.ts` lắng nghe sự kiện `'input'` này và gọi `startCtrl.setCandidateName(candidateName)`.
  - `setCandidateName` lại gọi `syncNameState()`, tiếp tục phát sự kiện `'input'`, tạo thành vòng lặp đệ quy đồng bộ vô hạn (infinite synchronous re-entrant loop) trên luồng chính của trình duyệt. Luồng chính bị nghẽn hoàn toàn khiến Chrome không thể xử lý bất kỳ lệnh CDP nào (Runtime.evaluate treo cứng 15 giây rồi timeout).
- **Khắc phục:**
  - Thêm cờ chống đệ quy `isSyncingCandidateName` và kiểm tra điều kiện trạng thái `startCtrl.getCandidateName() !== candidateName` trước khi gọi `startCtrl.setCandidateName()` trong `onCandidateNameInput` tại [src/app/main.ts](file:///D:/Cunata/src/app/main.ts).

### Vấn đề 2: Thứ tự ưu tiên tên thí sinh khi nộp bài trong môi trường nhiều tab (CK16-F01)
- **Triệu chứng:**
  - `ck12Regressions.test.ts: CK16-F01` thất bại: `AssertionError [ERR_ASSERTION]: Final record for Tab B must exist in IndexedDB`. Bản ghi sau khi nộp của Tab B bị gán tên của Tab A (`"Thí sinh Tab A"`).
- **Nguyên nhân gốc:**
  - Trong hàm `submitExam` tại `src/app/main.ts`, biến `effectiveName` ưu tiên lấy giá trị `startNameVal` từ ô `#startName` (vốn được điền sẵn tên nhớ từ `localStorage` của Tab A khi Tab B mở) trước giá trị `candidateInputVal` / `candidateName` đang thực sự làm bài trong Tab B.
- **Khắc phục:**
  - Điều chỉnh thứ tự ưu tiên trong `submitExam` tại [src/app/main.ts](file:///D:/Cunata/src/app/main.ts): Ưu tiên `candidateInputVal` / `candidateName` hợp lệ (khác `"Thí sinh tự do"`), và chỉ lùi về `startNameVal` khi nạp đề file mà chưa có tên (theo đúng WEB-contract §21).

### Cải tiến kiểm định
- Cải tiến thông điệp báo lỗi trong [test/browser/cdp-client.ts](file:///D:/Cunata/test/browser/cdp-client.ts) để ghi nhận chi tiết biểu thức CDP và log console trình duyệt khi xảy ra lỗi.

## 2. Kết quả kiểm tra xác minh thực tế

- `node scripts/build.js`: exit=0 (338 files emitted vào dist/)
- `npx --no-install tsc -p tsconfig.json`: exit=0 (0 error)
- `npx --no-install tsc -p tsconfig.web.json`: exit=0 (0 error)
- `node --test test/glue/fx52ApiBrowser.test.ts`: exit=0 | pass=1 fail=0 (thời gian chạy ~10s)
- `node --test test/final-quality/ck12Regressions.test.ts`: exit=0 | pass=13 fail=0 (CK15-F01 và CK16-F01 đều xanh hoàn toàn)
- `node --test "test/claude-check/**/*.test.mjs"`: exit=0 | pass=82 fail=0 (thời gian chạy ~43s, không còn treo 1500s)
- `node --test test/codex-check/browser.test.mjs`: exit=0 | pass=116 fail=0 (thời gian chạy ~60s, không còn treo 2400s)
- `node --test test/codex-check/feat/R1/api.test.mjs`: exit=0 | pass=22 fail=0
- `node --test test/codex-check/cx/report.test.mjs`: exit=0 | pass=7 fail=0
- `node --test test/claude-check/build.test.mjs`: exit=0 | pass=6 fail=0
- `node --test "test/app/**/*.test.ts" "test/glue/**/*.test.ts" "test/browser/**/*.test.ts"`: exit=0 | pass=122 fail=0
