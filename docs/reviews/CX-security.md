# CX-security — Rà soát sâu Bảo mật web và Đường xuất bản

- `review_id / task_id / worker_id`: CX-security-anti; worker: Antigravity (tiếp quản từ Codex do hết hạn mức).
- Thời điểm kiểm: 18/11/2026, môi trường Windows/PowerShell, Node v24.14.0, Chrome ẩn qua CDP bằng harness có sẵn `test/claude-check/harness.mjs`.
- `base_commit`: `e7d8f85c99f28fef83d37187a2101e15be100d7b` (HEAD).
- Kết luận: **CHANGES_REQUESTED**.
  - Phía web đã thực hiện tốt các biện pháp bảo vệ cơ bản: chống XSS bằng `escapeHtml` / `textContent` trên tên học sinh, tên lớp, tên giáo viên trong admin; lưu trữ token giáo viên/admin trong `sessionStorage` (không lọt vào `localStorage` hay URL query); file HTML báo cáo tải về mở ngoại tuyến an toàn; tải JSON kết quả bảo toàn nguyên vẹn đáp án Phần III (không bị escape nhầm dấu `'`).
  - Tuy nhiên, đã phát hiện và xác minh **3 lỗi bảo mật có bằng chứng thật (2 MAJOR, 1 MINOR)** và **1 lỗi nghiêm trọng ở quy trình xuất bản (MAJOR)**:
    1. **`CX-SEC-01` (MAJOR)**: Xuất kết quả CSV của giáo viên (`#btnExportResults`) không trung hòa tiền tố công thức dạng toàn giác (fullwidth Unicode `＝`, `＋`, `－`, `＠`, `｜`) và ký tự điều khiển/khoảng trắng trước ký tự công thức, dẫn tới nguy cơ Spreadsheet Formula Injection (CWE-1236).
    2. **`CX-SEC-02` (MAJOR)**: Trình phân tích Markdown ảnh câu hỏi/lời giải (`renderMathText`) cho phép nạp tài nguyên ngoài qua đường dẫn protocol-relative (`//host/path`), vi phạm WEB-contract §4.1, tạo kênh theo dõi học sinh và rò rỉ dữ liệu mạng ra máy chủ bên ngoài.
    3. **`CX-SEC-03` (MAJOR)**: Đường xuất bản công khai (`ops/publish.py` và `D:\Cunata_publish`) sao chép toàn bộ `docs/reviews/` và `test/`, làm lộ đường dẫn nội bộ máy (`D:\Cunata`, `%USERPROFILE%`), tham số cấu trúc prompt nội bộ (`scope_files`, `worker_id`, `profile_id`), và artifacts kiểm thử lên repo GitHub công khai.
    4. **`CX-SEC-04` (MINOR / Khuyến nghị)**: Thiếu thẻ meta `Content-Security-Policy` (CSP) trên `dist/index.html`, `dist/admin.html`, và báo cáo HTML ngoại tuyến tải về.
- Phạm vi ghi: Chỉ tạo báo cáo này và cập nhật test trong `ops/blitz/security/`. KHÔNG sửa mã nguồn sản phẩm `src/`, không sửa `dist/`, không install dependency, không commit, không deploy, không gọi Google thật.

---

## 1. Căn cứ, quy tắc và snapshot

### 1.1 Căn cứ nghiệp vụ và kỹ thuật
- **Shared Product Contract v2.0**: Mục 2 (Báo cáo kết quả); Mục 5 (Bảo mật, lưu trữ, secrets).
- **Hợp đồng kỹ thuật `docs/contracts/WEB-contract.md`**:
  - §4.1 (Tương thích sample và legacy: whitelist MIME, inert SVG, chặn `javascript:`, external relationships/fetch tự động, file path traversal).
  - §7 (M4 — thu kết quả và giới hạn trust: CWE-1236 formula neutralization cho CSV; giữ raw responses cho JSON).
  - §17.1 (URL Apps Script thật chỉ ghi vào bản công khai; `public/config.json` repo giữ rỗng; test chỉ dùng fake server).
  - §17.2–17.4 (Bảo mật Apps Script: mật khẩu chỉ đi trong POST body, không lọt qua URL; token giáo viên chỉ giữ trong `sessionStorage`).
  - §19.1–19.2 (Lớp học, tài khoản giáo viên/admin, `#btnExportResults` CSV chống công thức).
- **Hồ sơ worker `internal-profile`**: Mục J (Result Integration & Security: formula injection với ô bắt đầu bằng `=`, `+`, `-`, `@`, `|`, PII, secret scanning).

### 1.2 Snapshot dist tại thời điểm bắt đầu kiểm thử
- `git rev-parse HEAD`: `e7d8f85c99f28fef83d37187a2101e15be100d7b`

| File dist liên quan | SHA-256 |
|---|---|
| `dist/index.html` | `4F45F2DC2BBBDDCF6D6F636FEDA6FE72C05C4FB04B34385F88ECAACDFC1DE8E9` |
| `dist/admin.html` | `E3FB2AA3CE87BE415A8F367301A6E4855B810F8D83F7C90A9F4C2D9BD5695CA9` |
| `dist/app/main.js` | `1C9E450807377B56403EBFA9180CA43975C5040595D88A7FE85CE0698656DA6B` |
| `dist/teacher/portal.js` | `8E0586FF31FCFD7456888C556B65A3C651E4554AD9552AC8AE3AC0BF6B1C7F7E` |
| `dist/report/download.js` | `EBB0A4AACDDD1351F96E20343EFDB72787DD3FA73D27C0A5EBE40C02C17F143D` |
| `dist/collect/export.js` | `BC9384F6007CAFAAD280C3B2598812A04DC84EEA5F6D9505A92E99451A1B87FB` |

### 1.3 Môi trường và harness thực thi
- Phục vụ dist dưới `/Cunata/` qua `startServer(DIST, {overrides})` của `test/claude-check/harness.mjs`.
- Apps Script backend giả lập hoàn toàn cục bộ qua `test/claude-check/gas-server.mjs`.
- Trình duyệt điều khiển bằng Chrome CDP ẩn (`launchBrowser()`), thao tác như người dùng thật (`page.click`, `page.type`, `waitDownload`), không gán `.value` bằng JS. Mở tối đa 2 browser cùng lúc, đóng sạch trong `finally`.

---

## 2. Bảng tổng hợp Findings

| Mã | Mức độ | Vị trí (File:Line) | Điều khoản vi phạm | Tóm tắt lỗi | Trạng thái test |
|---|---|---|---|---|---|
| **CX-SEC-01** | **MAJOR** | `src/teacher/portal.ts:179-187` (`dist/teacher/portal.js:180-188`) | WEB-contract §7, §19.1 | Xuất CSV giáo viên không chặn ký tự công thức toàn giác (`＝`, `＋`, `－`, `＠`, `｜`) và khoảng trắng trước công thức | ĐÃ XÁC MINH (Test ĐỎ trên dist) |
| **CX-SEC-02** | **MAJOR** | `src/app/main.ts:265-276` (`dist/app/main.js:268-278`) | WEB-contract §4.1 | Regex ảnh Markdown cho phép URL protocol-relative `//host/path`, nạp tài nguyên ngoài và rò rỉ dữ liệu học sinh | ĐÃ XÁC MINH (Test ĐỎ trên dist) |
| **CX-SEC-03** | **MAJOR** | `ops/publish.py:19` | WEB-contract §1, §17.1; Chỉ thị Trưởng phòng | Script xuất bản copy `docs/reviews/` và `test/`, làm lộ đường dẫn nội bộ máy, thông tin prompt nội bộ | ĐÃ XÁC MINH (Scan phát hiện 88 hits) |
| **CX-SEC-04** | **MINOR** | `dist/index.html`, `dist/admin.html`, `dist/report/download.js:363` | WEB-contract §4.1, R08 §4 | Toàn bộ ứng dụng và file báo cáo HTML tải về thiếu thẻ meta Content-Security-Policy (CSP) | ĐÃ XÁC MINH (Kiểm tra mã nguồn) |

---

## 3. Chi tiết từng Finding

### 3.1 CX-SEC-01 — Xuất kết quả CSV phía giáo viên không trung hòa tiền tố công thức toàn giác (CWE-1236)
- **Mức độ:** MAJOR
- **Vị trí:** [src/teacher/portal.ts:179-187](file:///D:/Cunata/src/teacher/portal.ts#L179-L187), [dist/teacher/portal.js:180-188](file:///D:/Cunata/dist/teacher/portal.js#L180-L188)
- **Căn cứ hợp đồng:**
  - `docs/contracts/WEB-contract.md` §19.1: *"Kết quả `#/giao-vien/ket-qua`: chọn lớp + đề → bảng `#resultsTable` ... nút `#btnExportResults` (CSV chống công thức)."*
  - `docs/contracts/WEB-contract.md` §7: *"quoted CRLF with CWE-1236 formula neutralization... ô bắt đầu bằng =, +, -, @, |..."*
- **Thực trạng và nguyên nhân:**
  Trong `src/teacher/portal.ts`, hàm `escapeCsvCell(val)` được cài đặt như sau:
  ```ts
  function escapeCsvCell(val: unknown): string {
    if (val === null || val === undefined) return '""';
    let s = String(val);
    if (/^[=+\-@]/.test(s)) {
      s = "'" + s;
    }
    return `"${s.replace(/"/g, '""')}"`;
  }
  ```
  Regex `/^[=+\-@]/` chỉ bắt được 4 ký tự ASCII đầu dòng:
  1. Bỏ sót hoàn toàn các ký tự toàn giác (Fullwidth Unicode Forms): `＝` (\uFF1D), `＋` (\uFF0B), `－` (\uFF0D), `＠` (\uFF20), `｜` (\uFF5C). Các phần mềm bảng tính phổ biến (Microsoft Excel, Google Sheets, LibreOffice Calc) tự động chuẩn hóa các ký tự Unicode này thành toán tử công thức khi mở file CSV.
  2. Bỏ sót toán tử pipe `|` (sử dụng trong DDE command execution `=cmd|' /C ...'`).
  3. Bỏ sót trường hợp có khoảng trắng hoặc ký tự điều khiển thụt đầu dòng trước toán tử (ví dụ `   =1+1` hoặc `\t=1+1`).
  Trong khi đó, ở phía học sinh xuất CSV ([src/collect/export.ts:48-77](file:///D:/Cunata/src/collect/export.ts#L48-L77) và [src/app/main.ts:2705](file:///D:/Cunata/src/app/main.ts#L2705)), hệ thống đã dùng regex bảo vệ chuẩn:
  `/^['\s\x00-\x1f\x7f-\x9f\uFEFF\u200B-\u200D\u3000]*[=+\-@|＝＋－＠｜]/u`.
  Sự thiếu sót này dẫn đến: khi học sinh nhập tên độc hại như `＝1+1` hoặc lệnh DDE vào bài thi, giáo viên bấm xuất danh sách kết quả lớp sẽ nhận được ô chưa được escape dấu `'`, dẫn tới thực thi mã khi mở bảng tính.
- **Bước tái hiện:**
  1. Khởi động môi trường kiểm thử với tài khoản giáo viên và lớp học giả lập.
  2. Học sinh vào thi bằng mã lớp, nhập tên: `＝1+1`.
  3. Học sinh nộp bài thành công, hệ thống ghi nhận kết quả lên backend.
  4. Giáo viên đăng nhập `#/giao-vien`, chuyển sang mục Kết quả `[data-nav="ket-qua"]`.
  5. Giáo viên nhấn nút `#btnExportResults`.
  6. Kiểm tra nội dung file CSV tải về (`teacher-formula.csv`).
- **Kết quả thực tế (Actual):**
  Ô tên học sinh có giá trị `"＝1+1"` (không có dấu `'` bảo vệ).
- **Kết quả kỳ vọng (Expected):**
  Ô tên học sinh phải là `"'＝1+1"`.
- **Bằng chứng kiểm thử:**
  Test `CX-SEC-01` trong `ops/blitz/security/proposed.test.mjs` thất bại:
  ```
  AssertionError [ERR_ASSERTION]: fullwidth formula must be neutralized like student CSV
  '＝1+1' !== "'＝1+1"
  ```
- **Cách sửa tối thiểu:**
  Tại [src/teacher/portal.ts:183](file:///D:/Cunata/src/teacher/portal.ts#L183), cập nhật regex kiểm tra:
  ```ts
  if (/^['\s\x00-\x1f\x7f-\x9f\uFEFF\u200B-\u200D\u3000]*[=+\-@|＝＋－＠｜]/u.test(s) || /^[\x00-\x1f\x7f-\x9f]/u.test(s)) {
    s = "'" + s;
  }
  ```

---

### 3.2 CX-SEC-02 — Ảnh Markdown cho phép URL protocol-relative nạp tài nguyên ngoài
- **Mức độ:** MAJOR
- **Vị trí:** [src/app/main.ts:265-276](file:///D:/Cunata/src/app/main.ts#L265-L276), [dist/app/main.js:268-278](file:///D:/Cunata/dist/app/main.js#L268-L278)
- **Căn cứ hợp đồng:**
  - `docs/contracts/WEB-contract.md` §4.1: *"Asset nội bộ giữ relative public/... của sample; export portable đóng gói data/asset map, whitelist MIME PNG/JPEG/WebP và SVG nội bộ đã kiểm; SVG nhập từ người dùng chỉ giữ nguồn inert/cảnh báo, không inject DOM. Chặn javascript:, external relationships/fetch tự động, file path traversal."*
- **Thực trạng và nguyên nhân:**
  Hàm `renderMathText(text)` trong `src/app/main.ts` xử lý cú pháp ảnh `![alt](src)` như sau:
  ```ts
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const cleanSrc = src.trim();
    if (!/^[a-zA-Z0-9_./\-]+$/.test(cleanSrc) && !cleanSrc.startsWith('data:image/')) {
      return '';
    }
    return '<img src="' + escapeHtml(cleanSrc) + '" alt="' + alt + '" class="exam-figure" />';
  });
  ```
  Regex `/^[a-zA-Z0-9_./\-]+$/` chỉ kiểm tra tập ký tự mà không kiểm tra cấu trúc URL:
  - Chuỗi URL protocol-relative như `//cx-security.invalid/pixel` chỉ chứa `/`, `.`, `-` và các chữ cái nên hoàn toàn thỏa mãn regex.
  - Khi trình duyệt render `<img src="//cx-security.invalid/pixel">`, nó tự động gửi request HTTP/HTTPS tới máy chủ bên ngoài `cx-security.invalid`.
  - Điều này cho phép người biên soạn đề (hoặc đề chia sẻ bên ngoài) chèn pixel tracker hoặc nạp tài nguyên từ máy chủ của bên thứ ba, làm lộ IP, thời gian thi, user-agent của học sinh, vi phạm chính sách web tĩnh offline-first của Cunata.
- **Bước tái hiện:**
  1. Giáo viên xuất bản đề thi có câu hỏi chứa nội dung Markdown:
     `![safe](public/safe.png) ![tracker](//cx-security.invalid/pixel)`.
  2. Bật chặn URL qua CDP `Network.setBlockedURLs` với `*cx-security.invalid*`.
  3. Học sinh vào làm đề thi nói trên.
  4. Kiểm tra các thẻ `<img>` trong `#examPane` và nhật ký request mạng của trang.
- **Kết quả thực tế (Actual):**
  Thẻ `img` được tạo với `src="//cx-security.invalid/pixel"`, và trình duyệt ghi nhận request ra máy chủ bên ngoài `cx-security.invalid`.
- **Kết quả kỳ vọng (Expected):**
  Đường dẫn `//...` phải bị từ chối hoặc vô hiệu hóa, không có phần tử `img` mang nguồn ngoại vi (`unsafe === []`).
- **Bằng chứng kiểm thử:**
  Test `CX-SEC-02` trong `ops/blitz/security/proposed.test.mjs` thất bại:
  ```
  AssertionError [ERR_ASSERTION]: external image must be rejected or rendered inert
  + actual - expected
  + [ '//cx-security.invalid/pixel' ]
  - []
  ```
- **Cách sửa tối thiểu:**
  Tại [src/app/main.ts:270](file:///D:/Cunata/src/app/main.ts#L270), bổ sung điều kiện chặn đường dẫn protocol-relative và path traversal:
  ```ts
  if (cleanSrc.startsWith('//') || cleanSrc.includes('..') || (!cleanSrc.startsWith('public/') && !cleanSrc.startsWith('data:image/'))) {
    return '';
  }
  ```

---

### 3.3 CX-SEC-03 — Đường xuất bản công khai copy file đánh giá nội bộ làm lộ đường dẫn máy và prompt
- **Mức độ:** MAJOR
- **Vị trí:** [ops/publish.py:19](file:///D:/Cunata/ops/publish.py#L19)
- **Căn cứ hợp đồng:**
  - `docs/contracts/WEB-contract.md` §1: Snapshot và baseline.
  - `docs/contracts/WEB-contract.md` §17.1: Phân tách môi trường repo nội bộ và bản công khai.
  - Lệnh kiểm định của Trưởng phòng (`CX-security-anti.prompt.txt`): *"tìm file không nên công khai (hồ sơ riêng, .agy_logs, khóa, email, đường dẫn máy, prompt nội bộ, mã nguồn đề chưa đạt). Không in nội dung bí mật tìm được, chỉ ghi đường dẫn và loại."*
- **Thực trạng và nguyên nhân:**
  Trong `ops/publish.py`:
  ```python
  INCLUDE = ["src", "test", "scripts", "public", "styles", "apps-script", "docs/contracts", "docs/reviews",
             "index.html", "sample-exam.json", "README.md", "package.json", "package-lock.json",
             "tsconfig.json", "tsconfig.web.json", ".gitignore"]
  ```
  `INCLUDE` đưa toàn bộ thư mục `docs/reviews` và `test` sang thư mục phát hành `D:\Cunata_publish`.
  Kết quả quét kiểm định từ `ops/blitz/security/scan-publication.py` trên `D:\Cunata_publish` ghi nhận:
  - **1.300 tệp** được quét trong bản publish hiện tại.
  - **78 tệp** chứa đường dẫn máy tuyệt đối của môi trường phát triển (`machine_path`: `D:\Cunata\...`, `%USERPROFILE%\...`).
  - **21 tệp** trong `docs/reviews/` (ví dụ `docs/reviews/LOOP-*.md`, `docs/reviews/WEB-review.md`) chứa các thẻ cấu trúc của prompt nội bộ (`internal_prompt_candidate`: `scope_files`, `worker_id`, `profile_id`).
  - Toàn bộ thư mục kiểm thử `test/` (bao gồm `test/ui/redesign/artifacts/build-staging/`) cũng bị đẩy lên bản publish.
- **Bước tái hiện:**
  1. Chạy lệnh: `python ops/blitz/security/scan-publication.py`.
  2. Đọc file kết quả `ops/blitz/security/publication-scan.json`.
- **Kết quả thực tế (Actual):**
  Bản sao công khai chứa 88 lượt vi phạm (78 đường dẫn ổ đĩa máy cá nhân, 21 tài liệu chứa prompt nội bộ).
- **Kết quả kỳ vọng (Expected):**
  Bản xuất bản công khai không chứa các tài liệu đánh giá nội bộ (`docs/reviews/`), không chứa artifacts test, không lộ đường dẫn ổ đĩa phát triển `D:\Cunata` hay `%USERPROFILE%`.
- **Cách sửa tối thiểu:**
  Trong `ops/publish.py`:
  1. Loại bỏ `"docs/reviews"` và `"test"` khỏi danh sách `INCLUDE`.
  2. Bổ sung bộ lọc sanitize chuỗi đường dẫn máy `D:\Cunata` và `%USERPROFILE%` trước khi commit/push sang repo công khai.

---

### 3.4 CX-SEC-04 — Thiếu chính sách An toàn Nội dung (Content-Security-Policy)
- **Mức độ:** MINOR (Khuyến nghị phòng thủ theo chiều sâu)
- **Vị trí:** `dist/index.html`, `dist/admin.html`, [src/report/download.ts:480-490](file:///D:/Cunata/src/report/download.ts#L480-L490)
- **Căn cứ hợp đồng:**
  - `docs/contracts/WEB-contract.md` §4.1: Chặn nạp script/fetch ngoại vi không kiểm soát.
  - Nghiên cứu an toàn `docs/research/anti/R08-result-integration-security.md` mục 4: Cấu hình CSP qua thẻ `<meta>` để giới hạn các kênh truyền dữ liệu ra ngoài.
- **Thực trạng và nguyên nhân:**
  Cả `dist/index.html`, `dist/admin.html` và file báo cáo ngoại tuyến HTML tải về đều không có thẻ meta CSP.
  Mặc dù ứng dụng đã áp dụng `escapeHtml` và `textContent` cho hầu hết các điểm đầu ra, việc thiếu CSP loại bỏ lớp phòng thủ thứ hai. Khi phát sinh các lỗi như `CX-SEC-02`, trình duyệt không có chính sách để ngăn cản việc gửi dữ liệu ra máy chủ bên ngoài hoặc nạp script trái phép.
  Đặc biệt, đối với file báo cáo HTML lưu về máy tính của học sinh, việc có một thẻ meta CSP nghiêm ngặt (`default-src 'none'; style-src 'unsafe-inline'; img-src data:;`) là tiêu chuẩn an toàn bắt buộc để đảm bảo file mở hoàn toàn offline, không thể bị lợi dụng để tấn công máy học sinh.
- **Cách sửa tối thiểu:**
  Bổ sung thẻ meta CSP vào `<head>` của `dist/index.html`, `dist/admin.html`, và hàm `downloadReport` trong `src/report/download.ts`.

---

## 4. Các điểm kiểm tra An toàn đã được xác nhận (PASS Controls)

Hệ thống đã được kiểm tra toàn diện và đạt yêu cầu an toàn tại các điểm sau:
1. **Chống XSS hiển thị dữ liệu người dùng/giáo viên:**
   - Tên thí sinh chứa mã độc `<img src=x onerror="...">`: Hiển thị nguyên văn dạng text, không kích hoạt script tại thanh TopBar, thẻ làm bài, trang báo cáo kết quả.
   - Tên lớp học, tên giáo viên trong trang admin: Render qua `textContent`, không dùng `innerHTML`.
   - Tiêu đề câu hỏi, nội dung, đáp án lựa chọn và lời giải: Sử dụng `escapeHtml` trước khi đưa vào DOM.
2. **Báo cáo HTML tải về (`#btnDownloadReportHtml`):**
   - File `.html` tải về đóng gói độc lập toàn bộ CSS và asset nội bộ.
   - Khi mở file HTML ngoại tuyến bằng trình duyệt, tên thí sinh hiển thị nguyên văn dạng chuỗi, không có script hay link stylesheet ngoại vi nào được nạp.
3. **Xuất kết quả JSON (`#btnDownloadResultJson`):**
   - Bảo toàn nguyên văn giá trị Phần III (ví dụ `-0,5`), không bị chèn tiền tố quote (`'`) như CSV.
4. **Quản lý Token và Thông tin xác thực:**
   - Token giáo viên (`cunata_teacher_token`) và admin (`cunata_admin_token`) được lưu đúng trong `sessionStorage`, hoàn toàn không xuất hiện trong `localStorage`.
   - Mật khẩu và token không xuất hiện trong URL query parameter ở bất kỳ yêu cầu mạng nào.
   - Mật khẩu chỉ được gửi qua thân request POST `text/plain;charset=utf-8` khi đăng nhập, không trả lại trong phản hồi.
   - Đăng xuất (`#btnTeacherLogout` và nút Đăng xuất admin) xóa sạch token khỏi `sessionStorage`.
5. **Kiểm tra kho đề Lý 12 (`public/exams/ly12/`):**
   - Không có đề thi nào chưa đạt kiểm định bị đưa vào xuất bản (`unapproved_exam_files: []`).

---

## 5. Lệnh thực tế đã chạy và Bằng chứng kiểm thử

| Lệnh thực thi | Mục đích | Exit code | Kết quả thực tế đo được |
|---|---|---|---|
| `node --test ops/blitz/security/proposed.test.mjs` | Chạy test bộ ca kiểm định bảo mật trên `dist/` | 1 | 4 tests, 2 pass, 2 fail (`CX-SEC-01`, `CX-SEC-02` đỏ theo đúng thiết kế) |
| `python ops/blitz/security/scan-publication.py` | Quét kiểm định thư mục xuất bản `D:\Cunata_publish` | 0 | 1300 files scanned, 88 hits (78 `machine_path`, 21 `internal_prompt_candidate`, 6 `email_candidate`), 0 unapproved |
| `git rev-parse HEAD` | Chụp hash commit gốc lúc kiểm | 0 | `e7d8f85c99f28fef83d37187a2101e15be100d7b` |

Chi tiết TAP log của bộ test lưu tại: [ops/blitz/security/proposed.tap.txt](file:///D:/Cunata/ops/blitz/security/proposed.tap.txt).
Chi tiết quét xuất bản lưu tại: [ops/blitz/security/publication-scan.json](file:///D:/Cunata/ops/blitz/security/publication-scan.json).

---

## 6. Giới hạn kiểm thử (NOT_RUN)

- **Không gọi URL Google Apps Script production thật:** Tuân thủ điều khoản bắt buộc của WEB-contract §17.1 (không làm rác trang tính của Trưởng phòng). Toàn bộ kiểm thử backend được thực hiện qua `gas-server.mjs`.
- **Typecheck `tsc` toàn bộ repo:** `NOT_RUN` do môi trường hiện tại không có `tsc` toàn cục và bị ràng buộc không được chạy `npm install`.