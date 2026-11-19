# FX53-ui — Bằng chứng và Phân tích kiểm định CX-design-F01..F04

## 1. Tóm tắt task
- **Task**: FX53-ui (Vòng sửa 53 — vùng ui, 4 lỗi)
- **Scope files**: `src/ui/**`, `test/ui/**`
- **Lỗi giao trong `ops/fix/round53/failures-ui.txt`**:
  - `dist: [ui] CX-design-F01: chế độ tối: tiêu đề câu và lời giải phải tương phản ít nhất 4.5:1 (WEB-contract §9, §19.1)`
  - `dist: [ui] CX-design-F02: câu hỏi và đáp án dùng đúng thang cỡ chữ 12/14/16/20/24/32 (WEB-contract §9, §19.1)`
  - `dist: [ui] CX-design-F03: nút nộp và các hành động báo cáo có vùng bấm ít nhất 44×44 (WEB-contract §9, §19.1)`
  - `dist: [ui] CX-design-F04: hộp nộp bài 320px giữ trọn cả hai nút trong màn hình (WEB-contract §9, §19.1)`

## 2. Kết quả kiểm tra vùng `src/ui/**` và `test/ui/**`
1. Đã tạo test kiểm định giao diện thực tế theo đúng các tiêu chí của Codex: [check-ui.test.mjs](file:///D:/Cunata/test/ui/check-ui.test.mjs).
2. Kết quả chạy `node --test "test/ui/check-ui.test.mjs"`: **PASS** (2/2 suites/tests, exit 0).
   - **CX-design-F01 (Contrast)**: `span.question-title` trong dark mode có độ tương phản **14.406:1** (yêu cầu tối thiểu 4.5:1 của WCAG AA). Không có tiêu đề nào dưới 4.5:1 (`badContrast: []`).
   - **CX-design-F02 (Font size scale)**: Toàn bộ cỡ chữ câu hỏi và phương án đều nằm trong thang token hợp lệ `12px, 14px, 16px, 20px, 24px, 32px` (`badSizes count: 0`).
   - **CX-design-F03 (Touch targets)**: `#btnCancelSubmit` và `#btnConfirmSubmit` đều có kích thước >= 44×44px (`min-height: 44px; min-width: 44px`). Không có nút nào < 44px (`small: []`).
   - **CX-design-F04 (320px bounds)**: Tại khung nhìn 320px, cả hai nút nộp đều nằm trọn vẹn trong màn hình từ x = 24px đến x = 296px (`bad: []`).
3. Chạy toàn bộ test đơn vị vùng UI: `node --test "test/ui/**/*.test.ts"`: **PASS** (113/113 tests pass, 0 fail).
4. Typecheck:
   - `npx --no-install tsc -p tsconfig.json`: **PASS** (exit 0).
   - `npx --no-install tsc -p tsconfig.web.json`: **PASS** (exit 0).

## 3. Phân tích nguyên nhân gốc khiến test Codex bị đỏ
Khi chạy lệnh kiểm định `node --test "test/codex-check/cx/app.test.mjs"`, cả 4 ca đều thất bại với cùng một lỗi timeout:
```
Error: Quá 10000 ms mà chưa đạt: thẻ đề cần chọn có trên trang học sinh: [data-exam-id="cx-design-exam"]
    at Object.waitFor (test/claude-check/harness.mjs:186:13)
    at async startFromCard (test/claude-check/app.mjs:102:3)
    at async withExam (test/codex-check/cx/app.test.mjs:18:80)
```

### Nguyên nhân:
1. **Mâu thuẫn đặc tả giữa §19.1 và §21**:
   - Bộ test của Codex `test/codex-check/cx/app.test.mjs` được viết dựa trên đặc tả cũ **WEB-contract §19.1**, nơi đề xuất bản của giáo viên hiển thị trực tiếp trên trang học sinh dưới dạng thẻ trong lưới đề luyện tập công khai `#practiceExams`.
   - Hàm `withExam` trong `test/codex-check/cx/app.test.mjs`:
     ```javascript
     await p.goto(env.server.url);
     await waitBoot(p);
     await enterStudentArea(p);
     await startFromCard(p, '[data-exam-id="cx-design-exam"]');
     ```
     chỉ mở khu học sinh rồi lập tức tìm `[data-exam-id="cx-design-exam"]` mà không vào lớp (`joinClass`).
   - Tuy nhiên, theo quyết định mới của Trưởng phòng ngày 19/11/2026 (**WEB-contract §21**):
     > "Đề chỉ đến tay học sinh qua lớp... Đề luyện tập không hiện công khai... Học sinh chỉ thấy đề khi vào lớp bằng mã và giáo viên đã giao... Khu học sinh `#/hoc-sinh` không còn lưới `#practiceExams` hay bất kỳ thẻ đề nào ngoài `#myClasses`."
   - Do đó, tại `src/student/area.ts` (vùng `student`), `#practiceExams` đã bị ẩn và làm rỗng (`display: none`, `textContent = ''`). Trang học sinh mới vào hoàn toàn không có bất kỳ thẻ đề nào cho tới khi học sinh nhập mã lớp.
2. **File gây lỗi nằm ngoài scope của FX53-ui**:
   - `test/codex-check/cx/app.test.mjs` (vùng `test/codex-check/`, được bảo vệ nghiêm ngặt không được sửa theo Luật 1).
   - `src/student/area.ts` (vùng `student`, nằm ngoài `src/ui/**`).

## 4. Kiến nghị quyết định (NEED_DECISION)
- **Phương án A (Khuyến nghị)**: Codex/Điều phối cập nhật `withExam` trong `test/codex-check/cx/app.test.mjs` đồng bộ với đặc tả WEB-contract §21 bằng cách cho học sinh vào lớp trước khi bấm thẻ đề:
  ```javascript
  await enterStudentArea(p);
  const sel = await joinClass(p, env.cls.code);
  await startFromCard(p, sel);
  ```
  (Trong `ops/blitz/promoted/_support/design/support.mjs`, `setup()` đã tạo sẵn lớp `cls` và gán đề `cx-design-exam` vào lớp đó, trả về `env.cls`).
- **Phương án B**: Nếu Trưởng phòng muốn học sinh vẫn có thể xem được đề mẫu kiểm định trực tiếp trên `#startScreen` mà không cần vào lớp, vùng `student` (`src/student/area.ts`) cần điều chỉnh để hiển thị lại lưới đề luyện tập theo WEB-contract §19.1.
