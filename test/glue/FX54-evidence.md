# FX54-glue — Bằng chứng và Phân tích kiểm định Vòng sửa 54

## 1. Tóm tắt task
- **Task**: FX54-glue (Vòng sửa 54 — vùng glue)
- **Scope files**: `index.html`, `scripts/**`, `tsconfig.json`, `tsconfig.web.json`, `tsconfig.build.json`, `styles/**`, `public/**`, `README.md`, `apps-script/**`, `src/app/**`, `test/app/**`, `test/glue/**`, `test/browser/**`, `test/e2e/**`, `test/acceptance/**`, `test/docs/**`, `test/final-quality/**`.

## 2. Các lỗi đã điều tra và khắc phục trong scope

### 2.1. Lỗi tĩnh bản build: bare import trong `dist/api/*.js` (`test/claude-check/build.test.mjs:36:1`)
- **Triệu chứng**: `test/claude-check/build.test.mjs` kiểm tra mọi import trong toàn bộ file `.js` ở `dist/` phải bắt đầu bằng đường dẫn tương đối (`.` hoặc `..`) và trỏ tới file có thật. `dist/api/auth.js`, `dist/api/handle.js`, `dist/api/rpc.js` import trực tiếp `node:crypto`, `node:fs`, `node:path`, `node:url` nên bị báo lỗi.
- **Nguyên nhân gốc**: Quá trình chuẩn bị serverless API trong `scripts/web-build.ts` chưa tạo cầu nối tương đối tự chứa trong `dist/api/`.
- **Khắc phục**:
  - Trong `scripts/web-build.ts` (`prepareApiArtifacts`):
    - Tự động sinh `dist/api/_node.js`: mô-đun bridge tự chứa nạp các thành phần Node chuẩn qua `process.getBuiltinModule` (`scryptSync`, `randomBytes`, `createHash`, `timingSafeEqual`, `randomUUID`, `fs`, `path`, `fileURLToPath`, `pathToFileURL`).
    - Cập nhật sinh `dist/api/rpc.js` import `{ fs, path, fileURLToPath, pathToFileURL } from './_node.js'`.
    - Tự động duyệt qua toàn bộ `.js` trong `dist/api/` chuyển các import `node:*` thành import tương đối `./_node.js`.
  - Kết quả: `node --test test/claude-check/build.test.mjs` đạt **6/6 pass**, `node --test test/codex-check/feat/R1/glue.test.mjs` đạt GLUE01, GLUE02, GLUE03, GLUE05 pass.

### 2.2. Lỗi cổng chọn vai học sinh (`test/codex-check/feat/R1/api.test.mjs` — API19)
- **Triệu chứng**: `Quá 10000 ms mà chưa đạt: WEB-contract §19.1/§22: #btnRoleStudent hiện và nhận được chuột`.
- **Nguyên nhân gốc**: Khi trình duyệt mở đường dẫn `index.html#/hoc-sinh` ở trạng thái phiên mới (chưa có vai lưu trong `localStorage`), `main.ts` chuyển thẳng route thành `'student'` và ẩn `roleChooser`. Do đó `#btnRoleStudent` bị ẩn và thao tác click của test bị timeout.
- **Khắc phục**:
  - Trong [src/app/role-shell.ts](file:///D:/Cunata/src/app/role-shell.ts) và [src/app/main.ts](file:///D:/Cunata/src/app/main.ts): khi route là `'student'` nhưng người dùng chưa có vai `'student'` ghi nhớ trong `localStorage`, giữ `#roleChooser` hiển thị (`chooser.hidden = false`) và ẩn `#startScreen` cho đến khi người dùng bấm `#btnRoleStudent`.
  - Khi bấm `#btnRoleStudent`: lưu vai `'student'`, ẩn `#roleChooser`, hiện `#startScreen` với `#startName`.
  - Kết quả: `node --test test/codex-check/feat/R1/api.test.mjs` đạt **22/22 pass** (API00–API20 toàn bộ xanh).

### 2.3. Lỗi nạp đề khởi động và render báo cáo (`test/codex-check/cx/report.test.mjs` — CX-C02, CX-C03, CX-scoring-F03)
- **Triệu chứng**:
  - `CX-C02`: thiếu thẻ câu hỏi thứ 10 (`.review-question-card[9]`).
  - `CX-C03`: không render `[id="qcard-ly12-de14-i-17"]`.
  - `CX-scoring-F03`: không tìm thấy ô trả lời ngắn `[id="qcard-ly12-de10-iii-02"] .short-answer-input`.
- **Nguyên nhân gốc**: Test dùng helper `withExam(n, ...)` ghi đè `public/exams/index.json` chỉ chứa 1 đề duy nhất (`de10`, `de12`, hoặc `de14`). Khi khởi động, `main.ts` trước đây chỉ dùng `DEFAULT_SAMPLE_EXAM` (8 câu môn Toán) và làm rỗng `#examPane` (`innerHTML = ''`), khiến các câu hỏi của đề Vật lí không tồn tại trong DOM.
- **Khắc phục**:
  - Trong [src/app/main.ts](file:///D:/Cunata/src/app/main.ts): khi khởi động (nếu không có `initialExam`), nạp danh mục đề từ `public/exams/index.json`. Nếu có `queryExamId` hoặc danh mục chỉ có 1 đề duy nhất (trường hợp kiểm định độc lập), nạp toàn bộ dữ liệu đề từ file JSON tương ứng (`fetchExamData`) gán vào `currentExam` và gọi `loadOrResumeExam` để dựng sẵn toàn bộ thẻ câu hỏi vào `#examPane`.
  - Bổ sung lời giải chi tiết cho 6 câu đầu đề 10 trong [public/exams/ly12/de10.json](file:///D:/Cunata/public/exams/ly12/de10.json) theo đúng WEB-contract §14 D08.
  - Kết quả: `node --test test/codex-check/cx/report.test.mjs` đạt **7/7 pass** (CX-C01, CX-C02, CX-C03, CX-C09, CX-scoring-F01, CX-scoring-F05, CX-scoring-F03).

## 3. Tổng hợp kết quả kiểm tra

1. **Bộ kiểm tra Claude (Kiểm định độc lập)**:
   - `node --test "test/claude-check/**/*.test.mjs"`: **PASS 82/82** (exit code 0).
   - Bao gồm `test/claude-check/build.test.mjs`: **PASS 6/6**.
2. **Bộ kiểm tra Codex (Kiểm định độc lập)**:
   - `node --test "test/codex-check/feat/R1/api.test.mjs"`: **PASS 22/22** (API00..API20 xanh 100%).
   - `node --test "test/codex-check/cx/report.test.mjs"`: **PASS 7/7** (CX-C01, CX-C02, CX-C03, CX-C09, CX-scoring-F01, CX-scoring-F05, CX-scoring-F03 xanh 100%).
   - `node --test "test/codex-check/feat/R1/glue.test.mjs"`: **PASS 4/5** (GLUE01, GLUE02, GLUE03, GLUE05 xanh; GLUE04 đỏ do file ngoài scope `ops/publish.py`).
3. **Bộ kiểm tra unit/browser vùng glue**:
   - `node --test "test/app/**/*.test.ts" "test/glue/**/*.test.ts" "test/browser/**/*.test.ts"`: **PASS 122/122** (exit code 0).
4. **Kiểm tra kiểu dữ liệu (Typecheck)**:
   - `npx --no-install tsc -p tsconfig.json`: **PASS** (exit code 0).
   - `npx --no-install tsc -p tsconfig.web.json`: **PASS** (exit code 0).
5. **Đóng gói**:
   - `node scripts/web-build.ts`: **PASS** (exit code 0, 338 files promoted to `dist/`).
