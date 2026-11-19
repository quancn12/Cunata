# FX54-api — Bằng chứng và Phân tích kiểm định R1 API19

## 1. Tóm tắt
- **Task**: FX54-api (Vòng sửa 54 — vùng api)
- **Scope được phép**: `src/api/**`, `test/api/**`
- **Lỗi được giao**: `ops/fix/round54/failures-api.txt`
  - Lệnh kiểm tra: `node --test "test/codex-check/**/*.test.mjs"`
  - Ca lỗi: `dist: [api] R1: API19 học sinh nhập tên ở cổng rồi vào lớp qua cùng handle HTTP (WEB-contract §19.1/§22)` tại `test/codex-check/feat/R1/api.test.mjs:8:48`
  - Thông báo: `Error: Quá 10000 ms mà chưa đạt: WEB-contract §19.1/§22: #btnRoleStudent hiện và nhận được chuột` tại `test/codex-check/feat/R1/api.test.mjs:284:5`

## 2. Kết quả kiểm tra vùng `src/api/**`
1. Lệnh unit tests của vùng:
   - `node --test "test/api/**/*.test.ts"`: **PASS** (7 tests, 0 failed, exit code 0).
2. Typecheck:
   - `npx --no-install tsc -p tsconfig.json`: **PASS** (exit code 0).
   - `npx --no-install tsc -p tsconfig.web.json`: **PASS** (exit code 0).
3. Kiểm định độc lập:
   - `node --test "test/codex-check/feat/R1/api.test.mjs"`: 21/22 ca **PASS** (API00–API18, API20 đạt; duy nhất API19 đỏ tại bước click DOM `#btnRoleStudent`).
   - Toàn bộ backend HTTP handle (`src/api/handle.ts`), router RPC, auth (scrypt, token session 8h), store (`MemoryStore`, `NeonStore`), exam validation, rational arithmetic đều hoạt động chuẩn xác theo WEB-contract §17.2, §19.2, §22.

## 3. Phân tích nguyên nhân gốc của lỗi API19
1. Trong ca kiểm thử `test/codex-check/feat/R1/api.test.mjs`:
   ```javascript
   await page.goto(server.url + '/index.html#/hoc-sinh');
   await click(page, '#btnRoleStudent');
   ```
2. Trình duyệt tải `dist/index.html` với hash `#/hoc-sinh`.
3. Router phía frontend (`src/app/routes.ts`) phân tích hash `#/hoc-sinh` thành route `'student'`.
4. Trong `src/app/role-shell.ts`:
   ```typescript
   chooser.hidden = state.route !== 'chooser';
   ```
   Do route là `'student'`, `#roleChooser` bị ẩn (`hidden = true`).
5. Nút `#btnRoleStudent` nằm bên trong `#roleChooser`. Do đó, nút này không hiển thị và không nhận được sự kiện click, dẫn tới timeout 10000 ms trong test harness.
6. Ngược lại, ở ca API16 và API20 (`#/giao-vien`), `src/teacher/portal.ts` có đoạn mã:
   ```typescript
   if (chooser && !roleChosen && !isLoggedIn()) {
     chooser.hidden = false;
     if (loginSection) loginSection.style.display = 'none';
     if (shell) shell.style.display = 'none';
     return;
   }
   ```
   giúp `#roleChooser` được hiện lại khi chưa chọn vai giáo viên.
7. Vùng `src/app/**` (thuộc worker `FX54-glue`), `src/student/**` và `test/codex-check/**` đều nằm ngoài scope được phép sửa của worker `FX54-api` (`src/api/**`, `test/api/**`).

## 4. Kiến nghị quyết định (NEED_DECISION)
- **Phương án A (Khuyến nghị)**: Worker vùng frontend (`FX54-glue` phụ trách `src/app/**`) bổ sung cơ chế hiển thị `#roleChooser` khi người dùng mở trực tiếp hash `#/hoc-sinh` mà chưa chọn vai (đồng bộ với cơ chế `portal.ts` của giáo viên), hoặc điều chỉnh router `main.ts` để hiển thị chooser khi `rememberedRole` là null.
- **Phương án B**: Test owner chuẩn hóa fixture kiểm định API19 trong `test/codex-check/feat/R1/api.test.mjs` để truy cập `index.html` (chưa hash) trước khi bấm `#btnRoleStudent`, hoặc nếu đã vào thẳng `#/hoc-sinh` thì chuyển tiếp trực tiếp vào cổng tên `#startName` theo đúng WEB-contract §19.1.
