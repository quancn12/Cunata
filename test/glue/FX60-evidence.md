# FX60-glue Evidence Report

## 1. Tóm tắt nguyên nhân gốc và kết quả xác minh 8 lỗi trong failures-glue.txt

### Lỗi 1: `test/codex-check/cx/admin.test.mjs:16:1` (`dist/Code.js thay đổi trong khi kiểm định: kết quả cần chạy lại`)
- **Nguyên nhân gốc:**
  - Trong đợt chạy kiểm định round 60, file `src/collect/appsScript.ts` bị thay đổi song song bởi worker khác giữa lúc `snapshot()` khởi đầu và kết thúc của `admin.test.mjs`, dẫn đến sai lệch hash (`e89ddb368fe9...` vs `5f3c8ba0794e...`).
- **Kết quả xác minh:**
  - `src/collect/appsScript.ts` hiện tại đã hoàn tất và ổn định.
  - Chạy lại thật: `node --test test/codex-check/cx/admin.test.mjs`
  - **Kết quả:** `exit=0 | pass=8 fail=0` (36.1s). XANH hoàn toàn.

### Lỗi 2: `test/codex-check/cx/collect.test.mjs:6:82` (`dist: [collect] CX-AS-03: numeric class code submission appears in teacher results`)
- **Nguyên nhân gốc & Phân vùng:**
  - Lỗi thuộc trách nhiệm vùng collect (`FX60-collect`, `src/collect/**`). Sau khi worker collect hoàn thiện xử lý đăng nhập giáo viên và mã lớp số:
- **Kết quả xác minh:**
  - Chạy lại thật: `node --test test/codex-check/cx/collect.test.mjs`
  - **Kết quả:** `exit=0 | pass=3 fail=0` (CX-AS-03 hoàn thành trong 5.2s). XANH hoàn toàn.

### Lỗi 3: `test/codex-check/cx/teacher.test.mjs:6:82` (`dist: [teacher] CX-teacher-F04: kết quả có thể chọn lớp và đề được giao`)
- **Nguyên nhân gốc & Phân vùng:**
  - Lỗi thuộc trách nhiệm vùng teacher (`FX60-teacher`, `src/teacher/**`). Sau khi worker teacher hoàn thiện bộ lọc chọn đề/lớp trong `src/teacher/portal.ts`:
- **Kết quả xác minh:**
  - Chạy lại thật: `node --test test/codex-check/cx/teacher.test.mjs`
  - **Kết quả:** `exit=0 | pass=7 fail=0` (CX-teacher-F04 hoàn thành trong 3.2s). XANH hoàn toàn.

### Lỗi 4, 5, 6, 8: `test/codex-check/feat/R1/glue.test.mjs` (GLUE01, GLUE02, GLUE03, GLUE05)
- **Nguyên nhân gốc:**
  - Khi `built()` chạy `node scripts/build.js` trong thư mục cô lập `_runtime`, lệnh build đã bị hủy do lỗi biên dịch TypeScript trong `src/collect/appsScript.ts` (`error TS2304: Cannot find name 'fetchListExams'`).
  - Do build thất bại (exit code 2), các artifact `dist/api/rpc.js`, `dist/api/package.json`, `dist/api/catalog.json` không được sinh ra, khiến GLUE01, GLUE02, GLUE03, GLUE05 đều đỏ với `NOT_IMPLEMENTED`.
- **Khắc phục & Xác minh:**
  - `src/collect/appsScript.ts` đã được sửa lỗi type/syntax.
  - Lệnh `node scripts/build.js` chạy thành công, sinh đầy đủ 339 files trong `dist/`, bao gồm toàn bộ `dist/api/**` tự chứa và `dist/api/catalog.json`.
  - Chạy lại: `node --test test/codex-check/feat/R1/glue.test.mjs`
  - **Kết quả:**
    - `GLUE01`: PASS
    - `GLUE02`: PASS
    - `GLUE03`: PASS
    - `GLUE05`: PASS

### Lỗi 7: `test/codex-check/feat/R1/glue.test.mjs` (GLUE04)
- **Nguyên nhân gốc:**
  - `publish-probe.py` kiểm tra hành vi của `ops/publish.py` trong fixture cô lập:
    1. Yêu cầu `assert not (destination / 'site' / 'api').exists()` (không được chép API vào `site/`). Nhưng dòng 108 của `ops/publish.py` sao chép nguyên `SRC / "dist"` vào `site` mà không loại trừ thư mục `api`.
    2. Yêu cầu ghi `{"apiBase": "/api/rpc"}` cho `site/public/config.json` và `{"apiBase": "https://cunata.vercel.app/api/rpc"}` cho `public/config.json`. Nhưng `ops/publish.py` chưa có logic ghi các trường này.
- **Ràng buộc phạm vi (Out-of-scope):**
  - File gây lỗi là `ops/publish.py`, nằm ngoài `scope_files` của task `FX60-glue`.
  - Theo luật: `RÀNG BUỘC: không sửa file ngoài scope_files`. Worker tuân thủ không sửa file ngoài scope và báo rõ vùng gây lỗi.

---

## 2. Kết quả kiểm tra xác minh thực tế

### Build & Typecheck
- `node scripts/build.js`: exit=0 (339 files emitted vào dist/)
- `npx --no-install tsc -p tsconfig.json`: exit=0
- `npx --no-install tsc -p tsconfig.web.json`: exit=0

### Bộ kiểm tra thuộc vùng phụ trách & liên quan
- `node --test test/claude-check/build.test.mjs`: exit=0 | pass=6 fail=0
- `node --test test/glue/fx52ApiBrowser.test.ts`: exit=0 | pass=1 fail=0
- `node --test test/final-quality/ck12Regressions.test.ts`: exit=0 | pass=13 fail=0
- `node --test test/codex-check/cx/admin.test.mjs`: exit=0 | pass=8 fail=0
- `node --test test/codex-check/cx/collect.test.mjs`: exit=0 | pass=3 fail=0
- `node --test test/codex-check/cx/teacher.test.mjs`: exit=0 | pass=7 fail=0
- `node --test test/codex-check/cx/app.test.mjs`: exit=0 | pass=4 fail=0
- `node --test test/codex-check/cx/student.test.mjs`: exit=0 | pass=5 fail=0
- `node --test test/codex-check/feat/R1/api.test.mjs test/codex-check/feat/R1/storage.test.mjs`: exit=0 | pass=26 fail=0
- `node --test test/codex-check/feat/R1/glue.test.mjs`: exit=1 | pass=4 fail=1 (GLUE04 đỏ do `ops/publish.py` ngoài scope_files)
