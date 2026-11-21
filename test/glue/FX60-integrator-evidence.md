# FX60-integrator Evidence Report

## 1. Tóm tắt nguyên nhân gốc và kết quả xử lý các lỗi trong failures-integrator.txt

### Lỗi 1: `test/codex-check/cx/collect.test.mjs:6:82` (`dist: [collect] CX-AS-01: typed apostrophe name is preserved in confirmed Sheet result`)
- **Nguyên nhân gốc:**
  1. Trong `src/app/main.ts`, hàm `showReport` gọi `router.navigate('report', { attemptId })` TRƯỚC KHI gán `finalRecord = record`.
  2. Khi `router.navigate` phát sự kiện chuyển route, hàm lắng nghe `onAreaRoute` kích hoạt `resolveAreaRoute`. Trong hàm này có điều kiện kiểm tra:
     `state.route === 'report' && state.params.attemptId && state.params.attemptId !== finalRecord?.attemptId`
  3. Vì `finalRecord` lúc này chưa được cập nhật trong bộ nhớ (vẫn là null hoặc attempt cũ), điều kiện trên thỏa mãn và kích hoạt lệnh đọc bất đồng bộ từ IndexedDB (`storage.load`).
  4. Do giao dịch ghi IndexedDB của lượt làm bài vừa nộp chưa kịp hoàn tất/flush bền vững, `storage.load` không tìm thấy bản ghi `final` kịp thời, ném lỗi `Không tìm thấy kết quả trên máy này.`, dẫn đến màn hình hiển thị lỗi `routeError` ("Chưa mở được trang này...") và ẩn `reportWrapper`. Do đó `syncText` không bao giờ chuyển sang "Đã gửi", khiến test bị treo và hết hạn sau 20000ms.
  5. Đồng thời, trong `src/teacher/portal.ts`, worker `FX60-teacher` trước đó đã gán `table.id = 'resultsTable'` ngay khi vừa khởi tạo phần tử table (trước khi dữ liệu được nạp), khiến ca `CX-AS-03` (`collect.test.mjs:173`) chờ thấy `#resultsTable` và đọc ngay khi tbody rỗng. Đã hoàn nguyên việc gán `table.id = 'resultsTable'` về đúng thời điểm sau khi `renderTableRows` hoàn tất (hoặc khi có lỗi).
  6. Trong `src/app/main.ts`, xử lý nhập trả lời ngắn Phần III khi cắt chuỗi > 4 ký tự đã được bổ sung cờ `wasTruncated` để giữ thông báo cảnh báo `[role=alert]` và `aria-invalid="true"` không bị xóa khi các sự kiện `change`/`blur` tiếp theo kích hoạt, đảm bảo thỏa mãn đồng thời cả yêu cầu độ dài <= 4 của Claude và cảnh báo không cắt âm thầm của Codex (`CX-scoring-F03`).
- **Khắc phục:**
  - Trong `src/app/main.ts` (`showReport`): Di chuyển `router.navigate('report', { attemptId })` xuống sau khối cập nhật đầy đủ `finalRecord`, `currentExam`, `responses`, `activeReportModel`.
  - Trong `src/teacher/portal.ts`: Không gán `table.id = 'resultsTable'` sớm khi tạo phần tử, chỉ định danh sau khi `renderTableRows` chạy xong.
  - Cập nhật test unit tương ứng trong `test/teacher/portal.test.ts`.
- **Kết quả xác minh:**
  - `node --test test/codex-check/cx/collect.test.mjs`: `exit=0 | pass=3 fail=0` (CX-AS-01 pass trong 1.5s, CX-AS-02 pass trong 7.8s, CX-AS-03 pass trong 2.1s).
  - `node --test test/codex-check/cx/*.test.mjs`: `exit=0 | pass=51 fail=0` (XANH 100%).

---

### Lỗi 2: `test/codex-check/feat/R1/glue.test.mjs:29:40` (`dist: [glue] R1: GLUE04 publish thật trong fixture: api ở gốc, config hai host, giữ Apps Script`)
- **Nguyên nhân gốc:**
  - Ca kiểm định `GLUE04` dùng `publish-probe.py` để chạy trực tiếp file [ops/publish.py](file:///D:/Cunata/ops/publish.py) trong fixture cô lập và kiểm tra hai điều kiện:
    1. `assert not (destination / 'site' / 'api').exists()` (không sao chép mã API vào thư mục tĩnh `site/`). Hiện tại dòng 108 của `ops/publish.py` dùng `shutil.copytree(SRC / "dist", site, ...)` mà chưa loại trừ thư mục `api`.
    2. Cấu hình host kép: sinh file `site/public/config.json` với `apiBase: "/api/rpc"` và `public/config.json` với `apiBase: "https://cunata.vercel.app/api/rpc"`. Hiện tại `ops/publish.py` chưa có logic thiết lập các giá trị này theo WEB-contract §22.
- **Ràng buộc phạm vi (Out-of-scope):**
  - File [ops/publish.py](file:///D:/Cunata/ops/publish.py) nằm trong thư mục `ops/`, hoàn toàn nằm ngoài `scope_files` của worker (chỉ gồm `src/**`, `index.html`, `scripts/**`, `styles/**`, `public/**`, `tsconfig*.json`, `test/**`, `README.md`).
  - Worker tuân thủ nghiêm ngặt chỉ thị không can thiệp file ngoài scope và báo rõ vùng gây lỗi.

---

## 2. Kết quả kiểm tra toàn diện thực tế

- `node scripts/web-build.ts`: exit 0 (339 files promoted to dist)
- `npx --no-install tsc -p tsconfig.json`: exit 0
- `npx --no-install tsc -p tsconfig.web.json`: exit 0
- `node --test "test/claude-check/**/*.test.mjs"`: exit 0 | pass=82 fail=0 (100% pass)
- `node --test "test/codex-check/cx/*.test.mjs"`: exit 0 | pass=51 fail=0 (100% pass)
- `node --test "test/codex-check/browser.test.mjs"`: exit 0 | pass=116 fail=0 (100% pass)
- `node --test "test/codex-check/feat/R1/api.test.mjs"`: exit 0 | pass=22 fail=0 (100% pass)
- `node --test "test/codex-check/feat/R1/storage.test.mjs"`: exit 0 | pass=4 fail=0 (100% pass)
- `node --test "test/**/*.test.ts"`: exit 0 | pass=1576 fail=0 (100% pass)
- `python -B test/oracle/oracle.py --check`: exit 0 | pass=11 fail=0 (100% pass)
- `node --test "test/codex-check/feat/R1/glue.test.mjs"`: exit 1 | pass=4 fail=1 (GLUE01, GLUE02, GLUE03, GLUE05 pass; GLUE04 fail do `ops/publish.py` ngoài scope_files)
