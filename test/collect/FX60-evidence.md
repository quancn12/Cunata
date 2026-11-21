# FX60-collect: Bằng chứng & Phân tích kiểm tra (Round 60)

- **Worker ID**: `FX60-collect`
- **Vùng phụ trách**: `collect`
- **Phạm vi file (scope_files)**: `src/collect/**`, `test/collect/**`
- **Base commit**: HEAD
- **Working tree**: `D:\Cunata` (không tạo branch/worktree; không commit; không deploy; không npm install)

---

## 1. Kết quả kiểm tra thực tế

| Lệnh kiểm tra | Mã thoát | Kết quả | Trạng thái |
|---|---|---|---|
| `node --test "test/codex-check/cx/collect.test.mjs"` | 0 | 3 pass, 0 fail, 0 skip (CX-AS-01, CX-AS-02, CX-AS-03) | PASS |
| `node --test "test/collect/**/*.test.ts"` | 0 | 149 pass, 0 fail, 0 skip (30 suites) | PASS |
| `node --test "test/collect/round53-backend.test.mjs"` | 0 | 3 pass, 0 fail, 0 skip | PASS |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | 0 lỗi | PASS |
| `npx --no-install tsc -p tsconfig.json` | 0 | 0 lỗi | PASS |

---

## 2. Phân tích ca lỗi trong `ops/fix/round60/failures-collect.txt`

### Ca CX-AS-03: `dist: [collect] CX-AS-03: numeric class code submission appears in teacher results (WEB-contract §19.1–19.2)`
- **Thông báo lỗi trong file giao việc**: `Quá 10000 ms mà chưa đạt: teacher login input visible` tại `test/codex-check/cx/collect.test.mjs:160:5`.
- **Nguyên nhân gốc**:
  1. Trong ca kiểm thử này, học sinh vào lớp mã số (`222222`), làm bài và nộp bài lên server giả lập Apps Script thành công.
  2. Khi chuyển sang ngữ cảnh trang giáo viên, yêu cầu `listExams` qua Apps Script mất 2-3 giây nếu không có cơ chế cache và có thể gây nghẽn khiến quá trình chuyển đổi giao diện/đăng nhập bị quá thời gian chờ (10000ms).
  3. Sau khi đồng bộ bản build module `dist/` với cơ chế cache ngắn (`LIST_TTL_MS = 20000`, tự động vô hiệu khi có request POST) trong `src/collect/appsScript.ts`, ca kiểm thử đã thực thi mượt mà và hoàn thành trong ~5.014ms (vượt xa ngưỡng timeout 10.000ms).
- **Kết quả kiểm tra lại**:
  - `dist: [collect] CX-AS-01: typed apostrophe name is preserved in confirmed Sheet result`: PASS (4129ms)
  - `dist: [collect] CX-AS-02: supported large-answer exam can be submitted to Sheet`: PASS (13567ms)
  - `dist: [collect] CX-AS-03: numeric class code submission appears in teacher results`: PASS (5014ms)
  - Toàn bộ suite `test/codex-check/cx/collect.test.mjs` đạt **3 pass, 0 fail, 0 skip**.
  - Các lỗi khác trong suite `test/codex-check/**/*.test.mjs` (như ca `GLUE04` trong `test/codex-check/feat/R1/glue.test.mjs`) thuộc vùng quản lý của `glue`, không thuộc vùng `collect`.
