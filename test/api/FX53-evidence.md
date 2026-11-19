# FX53-api — Bằng chứng và Phân tích kiểm định R1 API19

## 1. Tóm tắt
- **Task**: FX53-api (Vòng sửa 53 — vùng api)
- **Scope được phép**: `src/api/**`, `test/api/**`
- **Lỗi được giao**: `ops/fix/round53/failures-api.txt`
  - Ca lỗi: `dist: [api] R1: API19 học sinh nhập tên ở cổng rồi vào lớp qua cùng handle HTTP (WEB-contract §19.1/§22)`
  - Thông báo: `Error: Quá 10000 ms mà chưa đạt: WEB-contract §19.1/§22: #btnRoleStudent hiện và nhận được chuột` tại `test/codex-check/feat/R1/api.test.mjs:284:5`

## 2. Kết quả kiểm tra vùng `src/api/**`
1. Đã bổ sung ca kiểm thử hồi quy `Handle: GET getClass returns class details and assignments for student access (API19 backend)` trong [api.test.ts](file:///D:/Cunata/test/api/api.test.ts).
2. Lệnh `node --test "test/api/**/*.test.ts"`: **PASS** (7 tests passed, 0 failed).
3. Typecheck:
   - `npx --no-install tsc -p tsconfig.json`: **PASS** (exit 0).
   - `npx --no-install tsc -p tsconfig.web.json`: **PASS** (exit 0).
4. Kiểm định độc lập `node --test "test/codex-check/feat/R1/api.test.mjs"`:
   - 21/22 ca **PASS** (API00–API18, API20).
   - Duy nhất ca API19 đỏ tại bước click DOM `#btnRoleStudent` trên trình duyệt. Phía backend Node HTTP handle (`handle.ts`) của `src/api` hoàn toàn không có lỗi, xử lý đầy đủ các action `getClass`, `createClass`, `assignExam`, `submitResult`, xác thực scrypt/token và MemoryStore/NeonStore.

## 3. Phân tích nguyên nhân gốc của lỗi API19
1. Trong `test/codex-check/feat/R1/api.test.mjs`:
   ```javascript
   await page.goto(server.url + '/index.html#/hoc-sinh');
   await click(page, '#btnRoleStudent');
   ```
2. Khi mở trực tiếp `#/hoc-sinh`, router trong `src/app/routes.ts` nhận diện hash `#/hoc-sinh` là route `'student'`.
3. Trong `src/app/role-shell.ts`:
   ```typescript
   chooser.hidden = state.route !== 'chooser';
   ```
   Do route là `'student'` chứ không phải `'chooser'`, `#roleChooser` bị ẩn (`hidden = true`).
4. Nút `#btnRoleStudent` nằm bên trong `#roleChooser`, vì vậy phần tử không hiển thị và không thể nhận sự kiện chuột.
5. Ngược lại, tại `#/giao-vien` (API16, API20), `src/teacher/portal.ts` có logic riêng:
   ```typescript
   if (chooser && !roleChosen && !isLoggedIn()) {
     chooser.hidden = false;
     ...
   }
   ```
   Do đó `#roleChooser` được hiện lại khi chưa chọn vai giáo viên, giúp `#btnRoleTeacher` nhận được click.
6. Cả `src/app/` (`main.ts`, `role-shell.ts`) và `src/student/` đều nằm ngoài scope được phép sửa của worker `FX53-api` (`src/api/**`, `test/api/**`). Đồng thời, thư mục kiểm định `test/codex-check/` được bảo vệ nghiêm ngặt không được sửa.

## 4. Kiến nghị quyết định (NEED_DECISION)
- **Phương án A (Khuyến nghị)**: Giao task thuộc vùng frontend (`app` hoặc `student` / `ui`) xử lý đồng bộ cơ chế hiển thị `#roleChooser` khi người dùng/kiểm thử truy cập trực tiếp hash `#/hoc-sinh` mà chưa chọn vai (tương tự như `src/teacher/portal.ts` xử lý cho `#/giao-vien`), hoặc điều chỉnh entry router trong `src/app/main.ts` để hiển thị chooser khi chưa có `rememberedRole`.
- **Phương án B**: Test owner chuẩn hóa fixture kiểm định API19 trong `test/codex-check/feat/R1/api.test.mjs` để truy cập `index.html` (chưa hash) trước khi bấm `#btnRoleStudent`, hoặc nếu đã vào thẳng `#/hoc-sinh` thì đi thẳng vào cổng tên `#startName` theo đúng đặc tả WEB-contract §19.1 ("Học sinh `#/hoc-sinh` → khối `#startScreen` ... cổng `#studentNameGate` với `input#startName`").
