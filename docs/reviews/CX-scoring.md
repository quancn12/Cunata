# CX-scoring — Rà soát sâu Chấm điểm và Báo cáo kết quả

- `review_id / task_id / worker_id`: CX-scoring-anti; worker: Antigravity (làm tiếp do Codex dừng hết hạn mức).
- Ngày kiểm: 18/11/2026, Windows/PowerShell, Node v24.14.0, Chrome ẩn qua CDP bằng harness có sẵn.
- `base_commit`: `178fb4f86735fd8fae89133a26a2ed3cf1c79185`; `head_commit`: `e7d8f85c99f28fef83d37187a2101e15be100d7b`.
- Kết luận: **CHANGES_REQUESTED**. Động cơ tính điểm lõi (domain scoring engine) và quy tắc làm tròn hiển thị số thập phân D02 hoàn toàn chính xác trên toàn bộ 16 đề Vật lí 12 thật và các cấu hình biên. Tuy nhiên, tầng giao diện báo cáo và tương tác input trên `dist/` có 4 lỗi MAJOR và 1 lỗi MINOR đã được tái hiện và chứng minh bằng test đỏ. Không có lỗi BLOCKER trong phạm vi kiểm thử.
- Phạm vi ghi: Chỉ tạo báo cáo này và tài liệu/test/bằng chứng trong `ops/blitz/scoring/`. KHÔNG sửa mã nguồn sản phẩm `src/`, không sửa `dist/`, không install dependency, không commit, không deploy, không gọi Google thật.

---

## 1. Căn cứ, quy tắc và snapshot

### 1.1 Căn cứ nghiệp vụ và kỹ thuật
- **Shared Product Contract v2.0** (§2 Các loại câu hỏi và chấm điểm — CRITICAL; §2 Báo cáo kết quả — CRITICAL; §3 Hành vi làm bài).
- **Hợp đồng kỹ thuật `docs/contracts/WEB-contract.md`** (§4 Hợp đồng dữ liệu đề và JSON; §14 Quyết định Trưởng phòng đã chốt: D01, D02, D05, D07, D08; §15 Danh sách đề và chọn đề; §18 Tính năng mới chỉ làm trên bản build `dist/`).
- **Bảng quyết định `docs/decisions/BANG-QUYET-DINH.md`** (D01: ký tự Phần III `0-9,-,`, tối đa 4 ký tự; D02: số không nguyên luôn hiện đúng 2 chữ số thập phân dấu phẩy, làm tròn nửa lên từ phân số chính xác; D07: tối đa 1000 câu, trộn trong từng phần giữ thứ tự I → II → III; D08: sau nộp có lời giải chi tiết mọi câu trên trang và trong file tải về, `after_deadline` xử lý như `immediate`).
- **Quy chuẩn giao diện `docs/design/DESIGN.md`**.

### 1.2 Snapshot dist tại thời điểm kiểm thử
Toàn bộ kiểm thử chạy trên bản build `dist/` hiện có (đồng bộ với frozen snapshot `ops/blitz/scoring/baseline-dist/`, 318 files, 0 khác biệt):
- `git rev-parse HEAD`: `e7d8f85c99f28fef83d37187a2101e15be100d7b` (kế thừa base blitz `178fb4f86735fd8fae89133a26a2ed3cf1c79185`).

| File dist liên quan | SHA-256 |
|---|---|
| `dist/index.html` | `4f45f2dc2bbbdccf6d6f636feda6fe72c05c4fb04b34385f88ecaacdfc1de8e9` |
| `dist/app/main.js` | `1c9e450807377b56403ebfa9180ca43975c5040595d88a7fe85ce0698656da6b` |
| `dist/student/view.js` | `37144f898606972175c48a40fbcc3f8e64242e7196ca690fce52ee1a79a1cae7` |
| `dist/report/view.js` | `78c4844c2cfede87d354ea416b0f6f16036ece7277b1e493d21ab5d17c57cc1b` |
| `dist/report/download.js` | `ebb0a4aacddd1351f96e20343efdb72787dd3fa73d27c0a5ebe40c02c17f143d` |

### 1.3 Môi trường và harness thực thi
- Phục vụ dist dưới `/Cunata/` thông qua `startServer(dir, {overrides})` của `test/claude-check/harness.mjs`.
- Khóa toàn bộ URL Google thật (`Network.setBlockedURLs`).
- Thao tác người dùng thực sự qua Chrome CDP (`page.click`, `Input.insertText`, `page.press`), không gán thuộc tính `.value` bằng JavaScript, không can thiệp biến môi trường của trang.
- Giữ nghiêm ngặt giới hạn mở tối đa 2 browser đồng thời; mỗi fixture/context đều dọn dẹp trong khối `finally`.

---

## 2. Phạm vi đã chạy và kết quả thực tế

### 2.1 Ma trận 16 đề Vật lí 12 thật (`public/exams/ly12/de10.json` ... `de25.json`)
Chạy tự động qua `ops/blitz/scoring/matrix.mjs` trên toàn bộ 16 đề với 3 chế độ độc lập:
1. **Chế độ `all` (Đúng hết):** Điền chính xác đáp án chuẩn từ file JSON đề.
2. **Chế độ `blank` (Bỏ trống hết):** Không chọn bất kỳ phương án nào, nộp bài ngay.
3. **Chế độ `seeded` (Ngẫu nhiên có seed):** Sinh lựa chọn giả ngẫu nhiên có kiểm soát hạt giống (`seed = 20261118 + số đề`).

Kết quả thực đo: **48/48 lượt thi đạt kết quả PASS (100%)**.
- Điểm từng phần (I, II, III) và điểm tổng đối chiếu với tính toán độc lập `oracle()` bằng phân số chính xác BigInt `Rational` khớp từng ký tự:
  - Phần I: 0,25 điểm/câu đúng; sai/chưa chọn được 0.
  - Phần II: Thang 0 / 0,10 / 0,25 / 0,50 / 1,00 cho 0, 1, 2, 3, 4 ý đúng. Ý chưa chọn không bị suy đoán thành False.
  - Phần III: So sánh chuỗi chính xác; điểm mỗi câu tính chuẩn theo `(10 - BASE)/N3` (với đề Lý 12 là 6 câu Phần III -> 0,25 điểm/câu).
  - Quy tắc D02: Số không nguyên luôn hiển thị 2 chữ số thập phân (`1,25 / 4,50`, `0,80 / 4`, `2,30 / 10`), số nguyên hiển thị số nguyên (`4 / 4`, `10 / 10`, `0 / 10`).
  - Mọi câu hỏi trên thẻ UI và báo cáo đều hiển thị lời giải chi tiết (D08).
- Dữ liệu đầy đủ lưu tại `ops/blitz/scoring/matrix.json` (kèm các file HTML/JSON evidence trong `ops/blitz/scoring/evidence/`).

### 2.2 Các ca kiểm tra hành vi tương tác và cấu hình biên
Thực hiện trong `ops/blitz/scoring/checks.mjs` (chạy qua `ops/blitz/scoring/proposed.test.mjs`):
- **CK34-F01 (Xóa Phần III bằng nút Xóa):** Nhập đáp án, bấm nút `[data-action="clear"]`, kiểm tra input rỗng rồi nộp bài -> ĐẠT: không bị lưu vết đáp án cũ, điểm Phần III là 0.
- **Xóa Phần III bằng phím Backspace:** Chọn toàn bộ và gõ Backspace rồi nộp ngay -> ĐẠT: input rỗng, chấm 0 điểm đúng chuẩn.
- **Sửa đáp án nhiều lần:** Thay đổi đáp án liên tục 4 lần trên cả Phần I, II, III -> ĐẠT: hệ thống chỉ ghi nhận và chấm theo lần sửa cuối cùng.
- **Thang điểm Phần II chi tiết (k = 0, 1, 2, 3, 4 ý đúng):**
  - k = 0 (bỏ trống cả 4 ý) -> `0 / 1` điểm.
  - k = 1 -> `0,10 / 1` điểm.
  - k = 2 -> `0,25 / 1` điểm.
  - k = 3 -> `0,50 / 1` điểm.
  - k = 4 -> `1 / 1` điểm.
  -> Toàn bộ 5 ca ĐẠT, xác nhận ý bỏ trống không bị coi là Sai.
- **So chuỗi Phần III chính xác tuyệt đối:**
  - `1,5` (chuẩn) -> `10 / 10` điểm.
  - `1,50` -> `0 / 10` điểm (khác chuỗi, không làm tròn số).
  - `1.5` -> `0 / 10` điểm (dấu chấm không thay dấu phẩy).
  - `-0,5` -> `0 / 10` điểm (khi chuẩn là `1,5`).
  - ` 1,5` -> `0 / 10` điểm (khoảng trắng đầu không bị trim âm thầm).
  -> Toàn bộ 5 ca ĐẠT theo đúng D01 và M1-contract.
- **Các cấu hình đề biên:**
  - `max15` (N1=20, N2=10, N3=0): Tổng 15 điểm -> ĐẠT (`15 / 15`).
  - `max16` (N1=20, N2=10, N3=4): Tổng 16 điểm -> ĐẠT (`16 / 16`).
  - `onlyI-max5` (N1=20 chỉ Phần I): Tổng 5 điểm -> ĐẠT (`5 / 5`).
  - `thirds` (N3=3 câu Phần III): Điểm mỗi câu phân số lặp 10/3 -> ĐẠT (`3,33 / 10`).
  - `sevenths` (N3=7 câu Phần III): Điểm mỗi câu 10/7 -> ĐẠT (`1,43 / 10`).
  - `half-up` (Làm tròn nửa lên D02): Điểm phân số lẻ 0,875 làm tròn thành `0,88` -> ĐẠT.
  - `shuffle` (Trộn câu và lựa chọn D07): Giữ nguyên thứ tự các phần Phần I -> II -> III -> ĐẠT.
  - `after-deadline` (D08): Xử lý hiển thị ngay sau khi nộp như `immediate` -> ĐẠT.
- **Tự động nộp khi hết giờ (Timer autosubmit):**
  - Đề 1 phút thực: Chờ hết 60 giây hạn nộp bài.
  - ĐẠT: Giao diện tự động chuyển sang màn hình báo cáo, câu trả lời đã điền được bảo toàn, IndexedDB chỉ lưu đúng duy nhất 1 bản ghi `phase: 'final'` với `submittedAt - startedAt >= 60000ms`.

---

## 3. Bảng findings đã xác minh

| ID | Mức | Vấn đề | File:line của source và dist | Căn cứ | Test đỏ trong proposed.test.mjs |
|---|---|---|---|---|---|
| **CX-scoring-F01** | **MAJOR** | Màn hình báo cáo kết quả trên UI bị gắn cứng tiêu đề môn Toán (`KẾT QUẢ KHẢO SÁT NĂNG LỰC TOÁN 12`), thiếu thời điểm bắt đầu và phiên bản đề | `src/app/shell.html:98`, `src/app/main.ts:2529-2533`; `dist/index.html:98`, `dist/app/main.js:2472-2476` | Shared Product Contract §2 (Báo cáo kết quả); WEB §15 | `CX-F01: báo cáo UI xác định đúng đề và có bắt đầu/kết thúc` |
| **CX-scoring-F02** | **MAJOR** | Báo cáo HTML tải về máy (`#btnDownloadReportHtml`) không có nội dung câu hỏi (`content`), bỏ trống nội dung và đáp án từng ý câu hỏi Phần II Đúng/Sai | `src/app/main.ts:2617-2647`; `dist/app/main.js:2561-2583` | Shared Product Contract §2 (Báo cáo kết quả); BANG-QUYET-DINH D08 | `CX-F02: HTML offline giữ câu hỏi, từng ý II, câu trả lời và đáp án` |
| **CX-scoring-F03** | **MAJOR** | Ô nhập Phần III có `maxlength="4"` âm thầm cắt ký tự thứ 5 khi dán chuỗi vượt quá 4 ký tự, biến câu trả lời sai thành đáp án đúng và cho điểm tối đa | `src/app/main.ts:1637`; `dist/app/main.js:1597` | Shared Product Contract §2.III; WEB §14/D01 | `CX-F03: dán 5 ký tự không âm thầm thành đáp án đúng 4 ký tự` |
| **CX-scoring-F04** | **MINOR** | Lời giải chi tiết câu hỏi Phần II trên UI bị lộ mã HTML (`<strong>`, `<br/>`) thành chữ thô do bị `escapeHtml` 2 lần | `src/app/main.ts:267`, `src/app/main.ts:2590`; `dist/app/main.js:217`, `dist/app/main.js:2538` | BANG-QUYET-DINH D08; cunata-ui-design | `CX-F04: lời giải II không lộ markup HTML thành chữ` |
| **CX-scoring-F05** | **MAJOR** | File HTML báo cáo kết quả tải về thiếu tiêu đề đề thi (`title`), mã phiên bản (`examVersionId`) và thời gian bắt đầu / kết thúc làm bài | `src/app/main.ts:2617-2630`; `dist/app/main.js:2561-2575` | Shared Product Contract §2; WEB §4, §15 | `CX-F05: HTML có tên đề, phiên bản, thời điểm bắt đầu/kết thúc` |

---

### Chi tiết từng finding đã xác minh

#### CX-scoring-F01 — Báo cáo UI hiển thị sai tiêu đề đề thi, thiếu mốc thời gian bắt đầu và phiên bản đề
- **Các bước thật đã chạy:** Khởi động hệ thống với đề Vật lí 12 (ví dụ `public/exams/ly12/de10.json`, tiêu đề: "Đề số 10 - Vật lí 12", phiên bản: `de10-v1`); nhập tên thí sinh, làm bài và nộp bài; đọc các thuộc tính của `#reportWrapper`.
- **Actual:** Tiêu đề lớn `.report-title` trên giao diện báo cáo hiển thị cứng: `"KẾT QUẢ KHẢO SÁT NĂNG LỰC TOÁN 12"`. Phần phụ đề `#reportSubtitle` chỉ có `Thí sinh: ... · Nộp bài lúc: ...`, hoàn toàn không có thời gian bắt đầu làm bài và mã phiên bản đề.
- **Expected:** Báo cáo phải thể hiện đúng tiêu đề đề thi học sinh vừa làm ("Đề số 10 - Vật lí 12"), hiển thị thời gian bắt đầu làm bài và phiên bản đề để đối chiếu kết quả.
- **Nguyên nhân kỹ thuật:** Khung HTML `src/app/shell.html:98` (và `dist/index.html:98`) ghi cứng thẻ `<h1 class="report-title">KẾT QUẢ KHẢO SÁT NĂNG LỰC TOÁN 12</h1>`. Khi hoàn thành bài thi, hàm `renderReport` trong `src/app/main.ts:2529` chỉ gán text cho `#reportSubtitle` mà quên cập nhật lại text cho `.report-title` từ `currentExam.title`.
- **Cách sửa tối thiểu:** Trong `src/app/main.ts`, tại khối hiển thị báo cáo:
  ```ts
  const titleEl = root.querySelector('.report-title') as HTMLElement | null;
  if (titleEl) titleEl.textContent = `KẾT QUẢ: ${currentExam.title}`;
  if (reportSubtitle) {
    reportSubtitle.textContent = `Thí sinh: ${candidateName} · Bắt đầu: ${formatTime(startTime)} · Nộp bài: ${formatTime(subTime)} · Bản: ${currentExam.examVersionId}`;
  }
  ```
- **Bằng chứng:** `ops/blitz/scoring/evidence/current-F01.png`, `current-F01.json`; Test `CX-F01` trong `proposed.test.mjs` thất bại với:
  `AssertionError: UI phải chứa tên đề Vật lí đã làm; actual title=KẾT QUẢ KHẢO SÁT NĂNG LỰC TOÁN 12`.

---

#### CX-scoring-F02 — Báo cáo HTML tải về không có nội dung câu hỏi và từng ý Phần II
- **Các bước thật đã chạy:** Chọn làm đề có câu hỏi Phần II Đúng/Sai; chọn ý a) Đúng, ý b) Sai; nộp bài; bấm nút `#btnDownloadReportHtml`; nạp nội dung tải về vào một trang offline để kiểm tra DOM.
- **Actual:** Báo cáo HTML chỉ hiển thị tiêu đề câu hỏi (`<h3>Câu 1 (...)</h3>`), không hề có nội dung câu hỏi (`q.content`). Đối với câu Phần II, học sinh thấy dòng `Bạn trả lời:  | Đáp án đúng: ` bị để trống, không hiển thị nội dung của 4 mệnh đề a, b, c, d cũng như lựa chọn Đúng/Sai của học sinh và đáp án đúng.
- **Expected:** Báo cáo tải về xem offline phải giữ đầy đủ nội dung câu hỏi, nội dung 4 ý Phần II kèm đáp án học sinh đã chọn và đáp án chuẩn theo đúng Shared Product Contract §2 và D08.
- **Nguyên nhân kỹ thuật:** Handler `#btnDownloadReportHtml` tại `src/app/main.ts:2617-2647` tự viết một template HTML nội bộ sơ sài, chỉ duyệt qua mảng `scoredResult.questionResults` lấy `qr.title` và `qr.userAnswer` (vốn là string rỗng đối với câu Phần II) thay vì sử dụng module `renderReportHtml` đầy đủ trong `src/report/download.ts`.
- **Cách sửa tối thiểu:** Trong handler `#btnDownloadReportHtml` của `src/app/main.ts`, chuyển sang gọi hàm xuất báo cáo chuẩn `downloadReport(activeReportModel)` từ `src/report/download.ts`, hoặc cập nhật template để in `q.content` và duyệt qua 4 ý `statements` của câu hỏi Phần II.
- **Bằng chứng:** `ops/blitz/scoring/evidence/current-F02.html`, `current-F02.json`; Test `CX-F02` trong `proposed.test.mjs` thất bại với `AssertionError: HTML phải giữ nội dung câu hỏi`.

---

#### CX-scoring-F03 — Cắt xén âm thầm khi dán vượt quá 4 ký tự ở Phần III biến chuỗi sai thành đúng
- **Các bước thật đã chạy:** Chọn câu hỏi Phần III có đáp án đúng là 4 ký tự (ví dụ `1700`); thực hiện dán hoặc nhập chuỗi 5 ký tự `17009`; kiểm tra giá trị thực tế trong ô input và nộp bài.
- **Actual:** Thuộc tính `maxlength="4"` trên thẻ `<input>` đã tự động cắt bỏ ký tự thứ 5 (`9`). Ô input chỉ lưu giá trị `1700`. Khi nộp bài, học sinh nhận được đủ điểm `1,50 / 1,50` cho câu hỏi này mặc dù chuỗi ban đầu nhập vào là không hợp lệ.
- **Expected:** D01 và M1-contract quy định so chuỗi chính xác tuyệt đối, không được âm thầm cắt bớt ký tự. Chuỗi `17009` phải giữ nguyên để so sánh (`17009 !== 1700` -> 0 điểm) hoặc hiển thị cảnh báo không hợp lệ.
- **Nguyên nhân kỹ thuật:** Tại `src/app/main.ts:1637` (và `dist/app/main.js:1597`), ô input được gán cứng `inputEl.maxLength = 4;`. Trong khi đó, tại `src/student/view.ts:1255` đã ghi rõ quy tắc: `// Do NOT set inputEl.maxLength = 4; allows Vietnamese IME composition buffer` và để tầng scoring/validator xử lý độ dài.
- **Cách sửa tối thiểu:** Bỏ dòng `inputEl.maxLength = 4;` tại `src/app/main.ts:1637` để ô input nhận đủ chuỗi người dùng gõ/dán, để domain scorer so sánh chính xác theo chuỗi thô.
- **Bằng chứng:** `ops/blitz/scoring/evidence/current-F03-input.json`, `current-F03.png`; Test `CX-F03` trong `proposed.test.mjs` thất bại với:
  `AssertionError: D01/WEB §9 cấm cắt im lặng: 17009 bị biến thành 1700`.

---

#### CX-scoring-F04 — Lời giải chi tiết câu hỏi Phần II hiển thị lộ mã HTML dạng chữ
- **Các bước thật đã chạy:** Nộp bài kiểm tra Vật lí 12 (ví dụ Đề 10); kiểm tra thẻ hiển thị lời giải của câu hỏi Phần II trong danh sách `#reviewQuestionsList`.
- **Actual:** Lời giải hiển thị thô trên màn hình:
  `<strong>a)</strong> Đúng.<br/><strong>b)</strong> Sai. Chất lỏng có thể tích riêng xác định.<br/><strong>c)</strong> Đúng.<br/><strong>d)</strong> Sai. Trong chất lỏng các phân tử dao động quanh vị trí cân bằng không cố định.`
- **Expected:** Các thẻ HTML `<strong>` và `<br/>` phải được trình duyệt hiển thị dưới dạng chữ in đậm và ngắt dòng, không được lộ nguyên văn các thẻ tag HTML cho người dùng.
- **Nguyên nhân kỹ thuật:** Tại `src/app/main.ts:265-267`, hàm `renderMathText(text)` gọi `let html = escapeHtml(text);`. Dữ liệu lời giải Phần II trong các đề `ly12/*.json` đã được định dạng sẵn bằng các thẻ HTML an toàn (`<strong>`, `<br/>`). Việc gọi `escapeHtml` đã biến chúng thành `&lt;strong&gt;` và `&lt;br/&gt;`, dẫn đến khi gán vào `innerHTML` thì trình duyệt vẽ ra text thô.
- **Cách sửa tối thiểu:** Trong `renderMathText(text)` tại `src/app/main.ts`, giải mã lại các tag an toàn sau khi escape:
  ```ts
  html = html.replace(/&lt;(\/?(?:strong|b|em|i|br\/?))&gt;/gi, '<$1>');
  ```
- **Bằng chứng:** `ops/blitz/scoring/evidence/current-F04.png`, `current-F04.json`; Test `CX-F04` trong `proposed.test.mjs` thất bại với:
  `AssertionError: lời giải cần hiển thị văn bản với ngắt dòng đúng`.

---

#### CX-scoring-F05 — File HTML báo cáo offline thiếu tên đề, phiên bản và thời gian bắt đầu/kết thúc
- **Các bước thật đã chạy:** Hoàn thành bài thi và tải báo cáo HTML qua `#btnDownloadReportHtml`; kiểm tra nội dung text của file HTML xuất ra.
- **Actual:** File HTML xuất ra chỉ gồm tiêu đề chung `<h1>Báo Cáo Kết Quả Thi</h1>`, tên thí sinh và bảng điểm tổng / từng phần. Toàn bộ thông tin định danh bài thi gồm tên đề (`exam.title`), phiên bản đề (`exam.examVersionId`), thời điểm bắt đầu thi (`startedAt`), thời điểm kết thúc thi (`submittedAt`) đều bị bỏ sót.
- **Expected:** Báo cáo kết quả lưu trữ offline phải ghi rõ bài thi thuộc đề nào, phiên bản nào, bắt đầu và kết thúc khi nào (Shared Product Contract §2).
- **Nguyên nhân kỹ thuật:** Template HTML trong `src/app/main.ts:2617-2630` không chèn các trường `${escapeHtml(currentExam.title)}`, `${escapeHtml(currentExam.examVersionId)}`, `${formatTime(startTime)}`, `${formatTime(subTime)}`.
- **Cách sửa tối thiểu:** Bổ sung các dòng metadata vào phần đầu của template HTML trong `src/app/main.ts:2626`:
  ```html
  <p><strong>Đề thi:</strong> ${escapeHtml(currentExam.title)} (Bản: ${escapeHtml(currentExam.examVersionId)})</p>
  <p><strong>Thời gian:</strong> Bắt đầu ${new Date(startTime).toLocaleString('vi-VN')} · Nộp bài lúc ${new Date(subTime).toLocaleString('vi-VN')}</p>
  ```
- **Bằng chứng:** `ops/blitz/scoring/evidence/current-F05.html`, `current-F05.json`; Test `CX-F05` trong `proposed.test.mjs` thất bại với:
  `AssertionError: HTML phải chứa tên đề`.

---

## 4. Lệnh kiểm thử và kết quả đo thực tế

Chạy tại thư mục gốc `D:\Cunata`:

| Lệnh | Exit | Kết quả thực đo (Pass / Fail / Skip) | Ý nghĩa / Ghi chú |
|---|---:|---|---|
| `git rev-parse HEAD` | 0 | `e7d8f85c99f28fef83d37187a2101e15be100d7b` | Xác nhận commit cơ sở hiện tại |
| `node ops/blitz/scoring/matrix.mjs` | 0 | 48 pass / 0 fail / 0 skip | Ma trận 16 đề Lý 12 thật x 3 chế độ (`all`, `blank`, `seeded`) khớp hoàn toàn với độc lập BigInt Rational Oracle |
| `node --test ops/blitz/scoring/proposed.test.mjs` | 1 | 22 pass / 5 fail / 0 skip | Bộ test kiểm định toàn diện trên `dist/`: 5 ca đỏ chứng minh 5 findings F01–F05; 22 ca xanh chứng minh các bất biến chấm điểm & hành vi |
| `node --test --test-name-pattern="xóa|sửa" ops/blitz/scoring/proposed.test.mjs` | 0 | 3 pass / 0 fail / 0 skip | Kiểm tra xóa bằng nút Clear (CK34-F01), xóa bằng Backspace, sửa đáp án nhiều lần |
| `node --test --test-name-pattern="thang II" ops/blitz/scoring/proposed.test.mjs` | 0 | 5 pass / 0 fail / 0 skip | Kiểm tra thang điểm Phần II k=0, 1, 2, 3, 4; ý chưa chọn không bị coi là False |
| `node --test --test-name-pattern="so chuỗi III" ops/blitz/scoring/proposed.test.mjs` | 0 | 5 pass / 0 fail / 0 skip | Kiểm tra so sánh chuỗi chính xác Phần III ("1,5", "1,50", "1.5", "-0,5", " 1,5") |
| `node --test --test-name-pattern="cấu hình" ops/blitz/scoring/proposed.test.mjs` | 0 | 8 pass / 0 fail / 0 skip | Kiểm tra các cấu hình đề biên: max15, max16, onlyI-max5, thirds, sevenths, half-up, shuffle D07, after-deadline D08 |
| `node --test --test-name-pattern="hết 1 phút" ops/blitz/scoring/proposed.test.mjs` | 0 | 1 pass / 0 fail / 0 skip | Kiểm tra hết hạn 1 phút thực: tự nộp vào màn báo cáo, IndexedDB lưu 1 bản ghi final |
| `npx --no-install tsc -p tsconfig.json` | 0 | 0 errors | Typecheck Node/Domain |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | 0 errors | Typecheck Web/Client |

---

## 5. Giới hạn và NOT_RUN

- **NOT_RUN:** Gọi URL Google Apps Script/Google Sheets thật. Tuân thủ tuyệt đối quy tắc task: chỉ kiểm qua máy chủ giả lập, không ghi dữ liệu thử vào Google Sheet của Trưởng phòng.
- **NOT_RUN:** Kiểm tra trên thiết bị di động thật (iOS/Android), trình duyệt Safari/Firefox. Chỉ kiểm tra trên headless Chrome qua giao thức CDP.
- **NOT_RUN:** Bộ gõ tiếng Việt Telex/VNI cấp hệ điều hành (OS IME). Harness sử dụng `Input.insertText` và sự kiện bàn phím của Chrome CDP, chưa thay thế hoàn toàn việc kiểm thử IME trên OS thực tế.
- **NOT_RUN:** Không chạy `node scripts/build.js` và không sửa `src/` hay `dist/` do Antigravity đang build và sửa song song trên các task khác.

---

## 6. Gợi ý (không tính là lỗi)

1. **Thống nhất logic xuất báo cáo HTML:** Hiện tại `src/report/download.ts` đã có hàm `renderReportHtml` rất hoàn chỉnh, có nhúng tài nguyên asset, bảng biểu và styled CSS, nhưng handler `#btnDownloadReportHtml` trong `src/app/main.ts` lại tự tạo một chuỗi HTML thủ công khác. Đề xuất quy về một đầu mối duy nhất bằng cách gọi trực tiếp `downloadReport()` trong `src/report/download.ts`.
2. **Trải nghiệm nhập liệu Phần III:** Trên màn hình desktop và mobile, nên có thông báo trợ giúp nhỏ về định dạng dấu phẩy thập phân (ví dụ: `Dùng dấu phẩy , thay cho dấu chấm .`) ngay dưới ô nhập Phần III để học sinh không bị nhầm lẫn khi thao tác gõ nhanh.

---

## 7. Đề nghị xử lý

1. Giao worker phụ trách `src/app/main.ts` sửa ngay 5 findings theo đúng các dòng mã tối thiểu đã chỉ rõ ở mục 3:
   - Cập nhật `.report-title` theo tên đề thi thực tế và bổ sung thời gian bắt đầu vào `#reportSubtitle` (CX-scoring-F01).
   - Xóa bỏ `inputEl.maxLength = 4;` tại ô nhập Phần III để tránh cắt xén âm thầm dữ liệu người dùng (CX-scoring-F03).
   - Bổ sung khử escape cho các thẻ HTML an toàn (`<strong>`, `<br/>`) trong `renderMathText` để lời giải Phần II hiển thị đẹp mắt (CX-scoring-F04).
   - Bổ sung tên đề, phiên bản, thời gian bắt đầu/kết thúc và chi tiết câu hỏi/các ý Phần II vào file báo cáo HTML tải về (CX-scoring-F02, CX-scoring-F05).
2. Sau khi sửa và build lại `dist/`, chạy lại lệnh:
   ```bash
   node --test ops/blitz/scoring/proposed.test.mjs
   ```
   Tiêu chí nghiệm thu: Toàn bộ 27/27 test chuyển sang màu XANH (PASS 27, FAIL 0, exit code 0).
