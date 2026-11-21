# FX57-glue Evidence Report

## 1. Tóm tắt nguyên nhân gốc và phương án khắc phục

### Vấn đề 1: Khởi tạo composition root khi có `options.initialExam` hoặc `options.initialRoute === 'exam'`
- **Triệu chứng:**
  - `test/glue/wave2/mainBootstrap.test.ts`: `Exam wrapper must be visible initially: 'none' !== ''`.
  - `test/glue/wave4/integrationHardening.test.ts`: `assert.equal(examWrapper.style.display, '')` thất bại.
  - `test/glue/final/fullIntegration.test.ts`: `bootstraps application and navigates cleanly across all 5 routes with modal isolation` thất bại.
  - Các ca hồi quy CK12/CK13/CK14/CK34/CK37 không tìm thấy thẻ câu hỏi `.question-card` hoặc `.short-answer-input`.
- **Nguyên nhân gốc:**
  - Khi `bootstrap` được gọi với cấu hình đề thi thử nghiệm trực tiếp (`options.initialExam` hoặc `options.initialRoute === 'exam'`), màn hình vào thi `#startScreen` vẫn chiếm quyền hiển thị ban đầu, giữ `#examWrapper` ở trạng thái `display: none` và không tự động tải/kích hoạt đề thi đã chọn.
- **Khắc phục:**
  - Trong [src/app/main.ts](file:///D:/Cunata/src/app/main.ts): Kiểm tra điều kiện `options?.initialExam || options?.initialRoute === 'exam'` khi phân giải entry route; tự động ẩn `#startScreen` và gọi `await loadOrResumeExam(currentExam, false)` để đưa người dùng/harness vào thẳng màn làm bài của đề thi đã chỉ định.

### Vấn đề 2: Khôi phục bài thi đã nộp khi IndexedDB không khả dụng (CK12-F02)
- **Triệu chứng:**
  - `test/final-quality/ck12Regressions.test.ts`: `CK12-F02: When IDB open fails, openStorage returns STORAGE_UNAVAILABLE and UI shows honest non-saved status through submit and reload` thất bại tại kiểm tra điểm báo cáo sau khi tải lại trang (`assert.ok(scoreTotal2?.textContent?.includes('0,25 / 0,50'))`).
- **Nguyên nhân gốc:**
  - Khi IDB hỏng (`isStorageAvailable = false`), bài thi nộp xong được lưu tạm vào localStorage dưới cờ `degradedRescueMirror: true` (`cunata:final:...`).
  - Khi tải lại trang, hàm `loadOrResumeExam` kiểm tra bản ghi trong localStorage chỉ tìm `draftKey` và có điều kiện `if (parsed && !parsed.submitted && parsed.phase !== 'final')`. Do bài thi đã nộp mang `phase: 'final'`, nhánh này bỏ qua và tạo một bài làm hoàn toàn mới thay vì khôi phục bản nộp báo cáo.
- **Khắc phục:**
  - Trong [src/app/main.ts](file:///D:/Cunata/src/app/main.ts): Khi không tìm thấy draft còn dở, cho phép đọc tiếp `rawFinal` từ `cunata:final:...`. Nếu có bài nộp trong localStorage khi IDB hỏng, khôi phục bản ghi này, giữ nguyên cảnh báo `STORAGE_UNAVAILABLE`, hiển thị trạng thái trung thực `Chưa lưu` và hiển thị báo cáo kèm điểm số đã tính.

### Vấn đề 3: Thời gian chờ CDP evaluate khi Service Worker kiểm tra cập nhật (CK16-F01)
- **Triệu chứng:**
  - `CK16-F01` thỉnh thoảng thất bại do `CDP request timed out: Runtime.evaluate expression: new Promise(...)` khi biểu thức kiểm tra Service Worker trong trình duyệt có timeout nội bộ 15 giây, trùng khít với timeout 15 giây của client CDP.
- **Nguyên nhân gốc & Khắc phục:**
  - Trong [test/browser/cdp-client.ts](file:///D:/Cunata/test/browser/cdp-client.ts): Thêm tham số `timeoutMs?: number` cho `evaluate`, giữ mặc định `15000` cho `send` (đảm bảo ca kiểm tra timeout trong [test/browser/cdpLifecycle.test.ts](file:///D:/Cunata/test/browser/cdpLifecycle.test.ts) kết thúc đúng trong hạn 20s).
  - Trong [test/final-quality/ck12Regressions.test.ts](file:///D:/Cunata/test/final-quality/ck12Regressions.test.ts): Tăng test timeout của `CK16-F01` lên 120s và truyền `25000` ms cho lệnh evaluate chờ Service Worker.

### Phân loại các lỗi ngoài scope / mâu thuẫn đặc tả:
1. `dist: [collect] CX-AS-01..03`: Thuộc trách nhiệm của worker `FX57-collect` (`src/collect/**`).
2. `dist: [glue] R1: GLUE04`: Lỗi trong `ops/publish.py` khi chạy fixture publisher (ngoài `scope_files` của worker glue).
3. `dist: [app] CX-C03` & `CX-scoring-F03`: Test kiểm định độc lập cũ của Codex (`test/codex-check/cx/report.test.mjs`) giả định học sinh vào web có thể bấm làm bài thẳng mà không qua mã lớp, mâu thuẫn với Quyết định Trưởng phòng chốt tại WEB-contract §21 (đề chỉ đến tay học sinh qua lớp, khu học sinh không còn lưới đề luyện tập công khai, được kiểm định nghiêm ngặt bởi `test/claude-check/web.test.mjs:57`).

---

## 2. Kết quả kiểm tra xác minh thực tế

### Build & Typecheck
- `node scripts/build.js`: exit=0 (338 files emitted vào dist/)
- `npx --no-install tsc -p tsconfig.json`: exit=0 (0 error)
- `npx --no-install tsc -p tsconfig.web.json`: exit=0 (0 error)

### Bộ test của sản phẩm (scope_files)
- `node --test test/glue/wave2/mainBootstrap.test.ts`: exit=0 | pass=5 fail=0
- `node --test test/glue/wave4/integrationHardening.test.ts`: exit=0 | pass=4 fail=0
- `node --test test/glue/final/fullIntegration.test.ts`: exit=0 | pass=9 fail=0
- `node --test test/final-quality/ck12Regressions.test.ts`: exit=0 | pass=13 fail=0
- `node --test "test/app/**/*.test.ts" "test/glue/**/*.test.ts" "test/browser/**/*.test.ts"`: exit=0 | pass=122 fail=0

### Bộ kiểm định độc lập
- `node --test test/claude-check/build.test.mjs`: exit=0 | pass=6 fail=0
- `node --test "test/claude-check/**/*.test.mjs"`: exit=0 | pass=82 fail=0
- `node --test test/codex-check/browser.test.mjs`: exit=0 | pass=116 fail=0
- `node --test test/codex-check/feat/R1/api.test.mjs`: exit=0 | pass=22 fail=0
- `node --test test/codex-check/feat/R1/glue.test.mjs`: exit=1 | pass=4 fail=1 (GLUE04 do `ops/publish.py` ngoài scope)
- `node --test test/codex-check/cx/report.test.mjs`: exit=1 | pass=5 fail=2 (CX-C03, CX-scoring-F03 mâu thuẫn đặc tả §21)
