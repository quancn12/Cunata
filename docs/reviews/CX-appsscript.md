# CX-appsscript — Rà soát sâu Bảo mật và Tính đúng đắn của Google Apps Script (apps-script/Code.js)

- `review_id / task_id / worker_id`: CX-appsscript-anti / worker: Antigravity (kế thừa và hoàn tất từ Codex do hết hạn mức).
- Thời điểm kiểm: 18/11/2026, môi trường Windows/PowerShell, Node v24.14.0, Google Apps Script VM sandbox (`test/claude-check/gas-fake.mjs` / `gas-server.mjs`), Chrome ẩn qua CDP (`test/claude-check/harness.mjs`).
- `base_commit`: `5e7e336fe0695984cc5e4205af5ed7d7ff82021c` (HEAD).
- Kết luận: **CHANGES_REQUESTED**.
  - **Đánh giá tổng thể:** Hệ thống backend serverless Google Apps Script (`apps-script/Code.js`) đã triển khai rất tốt các yêu cầu bảo mật và nghiệp vụ cốt lõi theo [WEB-contract.md](file:///D:/Cunata/docs/contracts/WEB-contract.md) §17 và §19.2. Toàn bộ 14 ca kiểm soát an toàn độc lập trong [ops/blitz/appsscript/controls.test.mjs](file:///D:/Cunata/ops/blitz/appsscript/controls.test.mjs) đều đạt 100% (14/14 PASS):
    - Xác thực token chặt chẽ cho toàn bộ 12 hành động đặc quyền của admin và giáo viên; từ chối token sai, giả mạo, rỗng, sai vai trò; từ chối mật khẩu cũ.
    - Cô lập hoàn toàn giữa hai giáo viên: không xem/sửa/xóa được lớp, bài giao, đề thi, hoặc kết quả của giáo viên khác (`FORBIDDEN`).
    - Quản lý phiên 8 giờ với cơ chế tự phục hồi sau khi CacheService bị dọn; hết hạn đúng mốc thời gian; tự động vô hiệu hóa token khi admin khóa giáo viên, reset mật khẩu, hoặc xoay vòng `ADMIN_PASSWORD`.
    - Băm mật khẩu bằng muối ngẫu nhiên và SHA-256; tuyệt đối không để lộ mật khẩu, băm, hay muối trong phản hồi JSON hay danh sách API.
    - Ranh giới thời gian `NOT_OPEN` và `PAST_DUE` (+2 phút ân hạn trễ mạng) dựa trên đồng hồ máy chủ Google; nộp lại sau hạn vẫn được xác nhận lũy nghiệm.
    - Ngăn chặn Spreadsheet Formula Injection (CWE-1236) bằng tiền tố nháy đơn (`'`) đối với các ký tự toán tử `=`, `+`, `-`, `@` và ký tự điều khiển.
    - Quản lý tranh chấp ghi đồng thời bằng `LockService.getScriptLock()`, tự động giải phóng khóa trong khối `finally` và trả về `SERVER_BUSY` khi bị nghẽn mà không làm sai lệch dữ liệu.
    - Sinh mã lớp 6 ký tự ngẫu nhiên đúng bảng chữ cái quy định `[A-HJ-NP-Z2-9]` (không chứa 0, O, 1, I).
    - Cú pháp tuân thủ chuẩn ES2019: không dùng BigInt literal (`0n`), không dùng toán tử `??`, `?.`, hay toán tử gán logic `&&=`, `||=`.
  - **Tuy nhiên, qua kiểm thử sâu trên Node VM và trình duyệt Chrome thật, đã phát hiện và xác minh 4 lỗi logic/bảo mật/nghiệp vụ (3 MAJOR, 1 MINOR):**
    1. **`CX-AS-01` (MAJOR)**: Mất tính lũy nghiệm (Idempotency) đối với các mã lượt thi (`attempt_id`) dạng chuỗi số hoặc có số 0 ở đầu (ví dụ `'00123'`), và mất ký tự nháy đơn đầu dòng đối với chuỗi văn bản (ví dụ tên thí sinh `"'Nguyễn An"`). Do `sanitizeSheetCell` không thêm tiền tố `'` cho chuỗi số và chuỗi bắt đầu bằng `'`, khiến Google Sheets tự động chuyển kiểu thành số (mất số 0 đầu) hoặc tước bỏ dấu `'` định dạng text, dẫn tới hàm tra cứu `findRowByAttemptId` không khớp và ghi đè/ghi trùng bản ghi.
    2. **`CX-AS-02` (MAJOR)**: Đề thi có số lượng câu lớn (hỗ trợ tới 1000 câu theo Shared Contract §3 và WEB-contract §14 D07) khi nộp bài làm `raw_answers_json` vượt quá giới hạn 50.000 ký tự/ô của Google Sheets, dẫn tới ngoại lệ bảng tính và lỗi hệ thống `SERVER_ERROR` (500). Trong khi `DeThi` đã có cơ chế chia khúc JSON (≤ 40.000 ký tự/ô), `KetQua` hoàn toàn thiếu cơ chế chia khúc cho `raw_answers_json`.
    3. **`CX-AS-03` (MAJOR)**: Mã lớp hoàn toàn bằng chữ số (ví dụ `'222222'` — hợp lệ theo bảng ký tự `[A-HJ-NP-Z2-9]`) bị Google Sheets lưu thành kiểu số (`number`) do `createClass` không bọc qua `examTextCell`. Khi giáo viên gọi `listResults` hoặc xem sĩ số tại `listMyClasses`, phép so sánh `String(r[17]) === code` so sánh chuỗi `"222222"` với số `222222` trả về `false`, khiến giáo viên không nhận được kết quả của học sinh và sĩ số hiển thị 0.
    4. **`CX-AS-04` (MINOR)**: Cơ chế kiểm tra xung đột payload (`PAYLOAD_CONFLICT`) khi nộp lại lượt thi cũ (`attempt_id`) chỉ kiểm tra điểm số, phiên bản và đáp án thô, nhưng bỏ sót kiểm tra các trường siêu dữ liệu bất biến: tên thí sinh (`candidate_display`), thời điểm bắt đầu (`started_at`), thời điểm nộp (`submitted_at`), và thời gian làm bài (`duration_seconds`). Việc nộp lại cùng `attempt_id` với tên người khác hoặc thời gian bị sửa đổi vẫn được trả về `ALREADY_RECORDED` thay vì trả `PAYLOAD_CONFLICT`.
- **Phạm vi ghi:** Chỉ tạo báo cáo này và cập nhật test/artifacts trong [ops/blitz/appsscript/](file:///D:/Cunata/ops/blitz/appsscript/). KHÔNG sửa `apps-script/Code.js`, KHÔNG sửa `src/`, `dist/`, `public/`, `test/`, không commit, không deploy, không gọi Google thật.

---

## 1. Căn cứ, quy tắc và snapshot

### 1.1 Căn cứ kỹ thuật và nghiệp vụ
- **Shared Product Contract v2.0**:
  - Mục 1 & 2: Bất biến chấm điểm, dữ liệu kết quả bài thi.
  - Mục 3: Cấu hình đề thi hỗ trợ lên tới 1000 câu (D07).
  - Mục 4: Bất biến attempt; tính idempotent và chống ghi đè bài thi.
  - Mục 5: Tích hợp Google Sheets, bảo vệ chống Formula Injection, bảo mật phân quyền tài khoản giáo viên/học sinh.
- **Hợp đồng kỹ thuật [WEB-contract.md](file:///D:/Cunata/docs/contracts/WEB-contract.md)**:
  - §7 (M4 — Thu kết quả và giới hạn trust): Idempotency key theo `attempt_id`, chống trùng lặp, chống formula injection cho mọi trường untrusted, phát hiện payload conflict khi cùng `attempt_id` nhưng khác nội dung.
  - §14 (Quyết định Trưởng phòng): D04 (Google Sheet + Apps Script), D07 (hỗ trợ tối đa 1000 câu/đề).
  - §17.1–17.5 (Apps Script kho đề và thu kết quả): Giới hạn 50.000 ký tự/ô (chia khúc ≤ 40.000 ký tự); lưu và đọc lại đúng nguyên văn; LockService khi ghi đồng thời; cú pháp ES2019 không có BigInt literal `0n`, `??`, `?.`.
  - §19.2 (Apps Script theo vai + lớp học + tài khoản): Phân quyền admin/giáo viên, phiên token 8 giờ, mã lớp bảng chữ `[A-HJ-NP-Z2-9]`, ranh giới `NOT_OPEN` và `PAST_DUE` (+2 phút).
- **Hồ sơ worker `internal-profile`**:
  - Mục J: Result Integration & Security.

### 1.2 Snapshot môi trường kiểm thử
- `git rev-parse HEAD`: `5e7e336fe0695984cc5e4205af5ed7d7ff82021c`
- Node.js: `v24.14.0`

| File liên quan | SHA-256 |
|---|---|
| `apps-script/Code.js` | `F8E7CBBF6B113BD4A8D97AC00599A2BBCF407F01D2C935BA639AFB5D4BDA2389` |
| `test/claude-check/gas-fake.mjs` | `1A8D65C589B1E178D135F3876CCB3FC5712AB095D7A0F673DA81D9FBC0C1E5AE` |
| `test/claude-check/gas-server.mjs` | `C4AA982C388E7EA9E24F0D66231868ABF76A62D2A1811B98C5E990AEC5BD1053` |
| `dist/index.html` | `4F45F2DC2BBBDDCF6D6F636FEDA6FE72C05C4FB04B34385F88ECAACDFC1DE8E9` |
| `dist/admin.html` | `E3FB2AA3CE87BE415A8F367301A6E4855B810F8D83F7C90A9F4C2D9BD5695CA9` |
| `dist/collect/appsScript.js` | `85351D11FC4446D685DEE796FC2255C0B5978D9D4AD69F1A4E4A47B7C568E6A4` |
| `dist/teacher/portal.js` | `8E0586FF31FCFD7456888C556B65A3C651E4554AD9552AC8AE3AC0BF6B1C7F7E` |
| `dist/admin/index.js` | `15F469526B0F983EDD7522CC289B0E325CE7F9A77459255BD5C81F80CA4D25C2` |
| `dist/app/main.js` | `6E3C3A85339A91CAF9C523FBF0AE3BFDE1E6A0A4A27CB35B0D99AD3CC813AD16` |

---

## 2. Bảng tổng hợp Findings

| Mã | Mức độ | Vị trí (File:Line) | Điều khoản vi phạm | Tóm tắt lỗi | Trạng thái test |
|---|---|---|---|---|---|
| **CX-AS-01** | **MAJOR** | [apps-script/Code.js:32-45](file:///D:/Cunata/apps-script/Code.js#L32-L45), [:153-169](file:///D:/Cunata/apps-script/Code.js#L153-L169), [:210-213](file:///D:/Cunata/apps-script/Code.js#L210-L213) | WEB-contract §7, §17.2, §17.3 | Mã lượt thi số/chuỗi số (`'00123'`) mất số 0 đầu phá vỡ idempotency (ghi trùng); chuỗi có nháy đơn đầu (`"'Nguyễn An"`) mất dấu `'` trên Sheets | ĐÃ XÁC MINH (3 ca test ĐỎ) |
| **CX-AS-02** | **MAJOR** | [apps-script/Code.js:238](file:///D:/Cunata/apps-script/Code.js#L238), [:910](file:///D:/Cunata/apps-script/Code.js#L910) | WEB-contract §14 D07, §17.3; Shared §3 | Đề thi lớn (lên tới 1000 câu) có `raw_answers_json` vượt 50.000 ký tự làm sập ghi nhận kết quả (`SERVER_ERROR` 500) do thiếu chia khúc ở trang tính `KetQua` | ĐÃ XÁC MINH (2 ca test ĐỎ) |
| **CX-AS-03** | **MAJOR** | [apps-script/Code.js:1156](file:///D:/Cunata/apps-script/Code.js#L1156), [:1263](file:///D:/Cunata/apps-script/Code.js#L1263) | WEB-contract §19.1, §19.2 | Mã lớp toàn số (`'222222'`) bị lưu dạng number trong bảng `Lop`; `classResults` so sánh nghiêm ngặt chuỗi với số thất bại, giáo viên thấy 0 bài nộp và sĩ số 0 | ĐÃ XÁC MINH (2 ca test ĐỎ) |
| **CX-AS-04** | **MINOR** | [apps-script/Code.js:820-880](file:///D:/Cunata/apps-script/Code.js#L820-L880) | WEB-contract §7; Shared §4 | Thiếu kiểm tra xung đột cho siêu dữ liệu bài thi (`candidate_display`, `started_at`, `submitted_at`, `duration_seconds`); cho phép nộp đè đổi tên thí sinh | ĐÃ XÁC MINH (1 ca test ĐỎ) |

---

## 3. Chi tiết từng Finding

### 3.1 CX-AS-01 — Idempotency bị phá vỡ với attempt_id dạng số/có số 0 đầu và mất ký tự nháy đơn
- **Mức độ:** MAJOR
- **Vị trí:** [apps-script/Code.js:32-45](file:///D:/Cunata/apps-script/Code.js#L32-L45), [apps-script/Code.js:153-169](file:///D:/Cunata/apps-script/Code.js#L153-L169), [apps-script/Code.js:210-213](file:///D:/Cunata/apps-script/Code.js#L210-L213)
- **Căn cứ hợp đồng:**
  - `docs/contracts/WEB-contract.md` §7: *"Server phải atomic dedupe tuple + hash... retry không thêm bản ghi."*
  - `docs/contracts/WEB-contract.md` §17.2: *"nộp kết quả — giữ nguyên hợp đồng hiện có của Code.js (idempotent theo attempt_id, chống formula injection, PAYLOAD_CONFLICT)."*
  - `docs/contracts/WEB-contract.md` §17.3: *"Ô nào có thể bị Sheets hiểu là công thức... phải được lưu sao cho đọc lại đúng nguyên văn."*
- **Thực trạng và nguyên nhân:**
  Trong `Code.js`, hàm `formatRecordRow` sử dụng `sanitizeSheetCell`:
  ```javascript
  const attemptId = sanitizeSheetCell(String(data.attempt_id || data.attemptId || '').trim());
  ```
  Hàm `sanitizeSheetCell` định nghĩa:
  ```javascript
  const DANGEROUS_TRIGGERS = [
      '=', '+', '-', '@',
      '\t', '\r', '\n',
      '＝', '＋', '－', '＠'
  ];
  function sanitizeSheetCell(input) {
      if (input === null || input === undefined) return '';
      const str = String(input);
      if (str.length === 0) return '';
      const firstChar = str.charAt(0);
      if (DANGEROUS_TRIGGERS.includes(firstChar)) {
          return "'" + str;
      }
      return str;
  }
  ```
  Có 2 hệ quả nghiêm trọng:
  1. **Chuỗi số hoặc chuỗi có số 0 ở đầu (ví dụ `'00123'`)**: Ký tự đầu tiên là `'0'` nên không thuộc `DANGEROUS_TRIGGERS`. Khi `sheet.appendRow` ghi giá trị `'00123'` vào Google Sheets, Google Sheets tự động ép kiểu thành số nguyên `123`. Khi client gửi lại request (retry) với cùng `attempt_id = '00123'`, hàm `findRowByAttemptId` đọc giá trị cột A từ Sheets là số `123`, chuyển thành chuỗi `"123"`, so sánh `"123" === "00123"` cho kết quả `false`. Hàm trả về `-1` (coi như chưa tồn tại) và tiếp tục append một dòng mới vào Sheet. Điều này phá vỡ hoàn toàn tính lũy nghiệm (idempotency) của hệ thống thu bài.
  2. **Chuỗi bắt đầu bằng dấu nháy đơn `'` (ví dụ tên thí sinh `"'Nguyễn An"` hoặc ID bắt đầu bằng `'`)**: Ký tự `'` không nằm trong `DANGEROUS_TRIGGERS`. Khi ghi chuỗi `"'Nguyễn An"` vào Google Sheets, Google Sheets xem ký tự `'` đầu dòng là ký tự điều khiển định dạng text và tự động tước bỏ nó khi người dùng hoặc API đọc lại ô (readback trả về `"Nguyễn An"` thay vì `"'Nguyễn An"`).
- **Bước tái hiện:**
  1. Gửi request nộp kết quả bài thi qua API hoặc giao diện với `attempt_id = '00123'`. Kết quả được ghi nhận lần đầu: `status: 'NEWLY_RECORDED'`.
  2. Gửi lại chính xác request đó (mô phỏng retry mạng do timeout):
     - Kỳ vọng: `status: 'ALREADY_RECORDED'`, trang tính `KetQua` giữ nguyên 1 dòng kết quả.
     - Thực tế: Hệ thống trả về tiếp `status: 'NEWLY_RECORDED'`, trang tính `KetQua` bị ghi thêm dòng thứ 2 (chứa số `123`).
  3. Thí sinh nhập tên có dấu nháy đơn `"'Nguyễn An"`, nộp bài thi thành công. Đọc lại giá trị từ ô tương ứng trên Sheet:
     - Kỳ vọng: Nhận được nguyên văn `"'Nguyễn An"`.
     - Thực tế: Nhận được `"Nguyễn An"`.
- **Bằng chứng kiểm thử:**
  - File bằng chứng: [ops/blitz/appsscript/F01-api.json](file:///D:/Cunata/ops/blitz/appsscript/F01-api.json), [ops/blitz/appsscript/F01-apostrophe.json](file:///D:/Cunata/ops/blitz/appsscript/F01-apostrophe.json), [ops/blitz/appsscript/F01-browser.json](file:///D:/Cunata/ops/blitz/appsscript/F01-browser.json).
  - Kết quả chạy test trong [ops/blitz/appsscript/proposed.tap](file:///D:/Cunata/ops/blitz/appsscript/proposed.tap):
    - `CX-F01 API: numeric attempt ID must remain literal and retry must deduplicate`: FAILED (`NEWLY_RECORDED` !== `ALREADY_RECORDED`, Sheet có 2 dòng).
    - `CX-F01 API: leading apostrophe in a result string must survive Sheets readback`: FAILED (`'Nguyễn An'` !== `"'Nguyễn An"`).
    - `CX-F01 dist browser: typed apostrophe name is preserved in confirmed Sheet result`: FAILED (`'Nguyễn An'` !== `"'Nguyễn An"`).
- **Cách sửa tối thiểu:**
  Tại [apps-script/Code.js:210-213](file:///D:/Cunata/apps-script/Code.js#L210-L213), ép kiểu chuỗi text nguyên vẹn bằng hàm `examTextCell` (đã có sẵn trong `Code.js:261` dùng tiền tố `'` cho mọi chuỗi để bảo toàn nguyên văn trong Sheets) cho các trường mã định danh `attempt_id`, `exam_id`, `exam_version_id`, đồng thời bổ sung `'` vào danh sách `DANGEROUS_TRIGGERS` hoặc hàm `sanitizeSheetCell`:
  ```javascript
  // Trong sanitizeSheetCell: thêm '\'' vào DANGEROUS_TRIGGERS
  const DANGEROUS_TRIGGERS = [
      '=', '+', '-', '@', '\'',
      '\t', '\r', '\n',
      '＝', '＋', '－', '＠'
  ];
  // Và trong formatRecordRow:
  const attemptId = examTextCell(String(data.attempt_id || data.attemptId || '').trim());
  const examId = examTextCell(String(data.exam_id || data.examId || '').trim());
  const examVersionId = examTextCell(String(data.exam_version_id || data.examVersionId || '').trim());
  ```

---

### 3.2 CX-AS-02 — Đề thi lớn (lên tới 1000 câu) làm sập hệ thống thu bài (SERVER_ERROR 500) do vượt quá 50.000 ký tự/ô
- **Mức độ:** MAJOR
- **Vị trí:** [apps-script/Code.js:238](file:///D:/Cunata/apps-script/Code.js#L238), [apps-script/Code.js:910](file:///D:/Cunata/apps-script/Code.js#L910)
- **Căn cứ hợp đồng:**
  - `docs/contracts/WEB-contract.md` §14: *"D07 = A. Tối đa 1000 câu/đề; trộn trong từng phần, giữ thứ tự I → II → III."*
  - `docs/contracts/WEB-contract.md` §17.3: *"Một ô Google Sheets chứa tối đa 50 000 ký tự: JSON đề phải được chia khúc (≤ 40 000 ký tự/ô) và ghép lại nguyên vẹn; đề nặng (có hình nhúng) vẫn xuất bản và đọc lại đúng từng byte."*
  - Shared Product Contract v2.0 §3 & §5.
- **Thực trạng và nguyên nhân:**
  Trong `Code.js`, phần xuất bản đề thi `DeThi` ([Code.js:403-415](file:///D:/Cunata/apps-script/Code.js#L403-L415)) đã xử lý chia khúc chuỗi JSON lớn thành nhiều ô nối tiếp nhau (mỗi ô ≤ 39.999 ký tự) bắt đầu từ cột 11.
  Tuy nhiên, tại bảng `KetQua`, dữ liệu `raw_answers_json` (chứa toàn bộ phản hồi của học sinh) được ghi vào duy nhất một ô tại cột Q (cột 17) trong hàm `formatRecordRow`:
  ```javascript
  const sanitizedRawJson = sanitizeSheetCell(rawJson);
  return [
      attemptId, ..., sanitizedRawJson
  ];
  ```
  Với các đề thi chuẩn GDPT có số lượng câu lớn (hoặc đề dài lên tới 1000 câu theo hạn mức D07), kích thước chuỗi JSON phản hồi của thí sinh dễ dàng vượt quá 50.000 ký tự (ví dụ bài thi 60 câu có ID dài hoặc 1000 câu đạt ~72.000 ký tự). Khi gọi `sheet.appendRow`, Google Sheets phát sinh lỗi vượt quá giới hạn ký tự trên một ô (`LimitExceededException: Cell content exceeds maximum length`), dẫn đến exception không được xử lý và backend trả về:
  ```json
  { "success": false, "error": "SERVER_ERROR", "message": "Không thể xử lý yêu cầu, vui lòng thử lại sau" }
  ```
  Học sinh làm đề thi lớn trên web sẽ không thể nộp bài về Google Sheets, trình duyệt báo lỗi liên tục dù bài làm hoàn toàn hợp lệ.
- **Bước tái hiện:**
  1. Chuẩn bị payload nộp bài cho một đề thi lớn có 1000 câu hoặc đề thi có chuỗi `responses` dài > 50.000 ký tự.
  2. Gửi request `submitResult` tới endpoint Apps Script qua API hoặc trình duyệt.
  3. Quan sát phản hồi của máy chủ và trạng thái hiển thị trên giao diện `#syncText`.
- **Kết quả thực tế (Actual):**
  - API trả về `{ success: false, error: "SERVER_ERROR" }`.
  - Trên trình duyệt, `#syncText` báo "Chưa gửi được — sẽ thử lại" và bài thi không bao giờ được ghi vào Google Sheets.
- **Kết quả kỳ vọng (Expected):**
  - Máy chủ Apps Script tiếp nhận thành công, tự động chia khúc `raw_answers_json` sang các cột tiếp theo (tương tự như `DeThi`), trả về `{ success: true, status: "NEWLY_RECORDED" }`.
- **Bằng chứng kiểm thử:**
  - File bằng chứng: [ops/blitz/appsscript/F02-api.json](file:///D:/Cunata/ops/blitz/appsscript/F02-api.json), [ops/blitz/appsscript/F02-browser.json](file:///D:/Cunata/ops/blitz/appsscript/F02-browser.json).
  - Kết quả chạy test trong [ops/blitz/appsscript/proposed.tap](file:///D:/Cunata/ops/blitz/appsscript/proposed.tap):
    - `CX-F02 API: valid 1000-question answers exceeding one cell must remain receivable`: FAILED (`false !== true`).
    - `CX-F02 dist browser: supported large-answer exam can be submitted to Sheet`: FAILED (`false !== true`, kích thước payload 71.905 ký tự).
- **Cách sửa tối thiểu:**
  Tại [apps-script/Code.js:909-911](file:///D:/Cunata/apps-script/Code.js#L909-L911), áp dụng cơ chế chia khúc tương tự `DeThi`: nếu `rawJson` vượt quá 40.000 ký tự, chia thành các đoạn nhỏ (mỗi đoạn ≤ 40.000 ký tự), lưu đoạn đầu vào cột 17 và các đoạn tiếp theo vào các cột sau hoặc bổ sung cột phụ `chunks_json` cho bảng `KetQua`.

---

### 3.3 CX-AS-03 — Mã lớp toàn số khiến giáo viên không nhận được kết quả học sinh và sĩ số hiển thị 0
- **Mức độ:** MAJOR
- **Vị trí:** [apps-script/Code.js:1156](file:///D:/Cunata/apps-script/Code.js#L1156), [apps-script/Code.js:1263](file:///D:/Cunata/apps-script/Code.js#L1263)
- **Căn cứ hợp đồng:**
  - `docs/contracts/WEB-contract.md` §19.1: *"Lớp học `#/giao-vien/lop`: ... mã lớp `.class-code` (6 ký tự in hoa, không có 0/O/1/I)... sĩ số (số học sinh đã nộp ít nhất 1 bài)... Kết quả `#/giao-vien/ket-qua`: chọn lớp + đề → bảng `#resultsTable`."*
  - `docs/contracts/WEB-contract.md` §19.2: *"Lop (classId, code, tên, username giáo viên, tạo lúc)... listResults {token, classId, assignmentId?} (chỉ kết quả lớp của mình)."*
- **Thực trạng và nguyên nhân:**
  Trong `Code.js:1249`, bảng chữ cái sinh mã lớp gồm các ký tự:
  ```javascript
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  ```
  Tập ký tự này bao gồm các chữ số từ `2` đến `9`. Do đó, hoàn toàn có xác suất xuất hiện một mã lớp gồm toàn chữ số (ví dụ `'222222'` hoặc `'234567'`).
  Tại dòng 1263 khi tạo lớp:
  ```javascript
  writeTable('Lop', ['classId', 'code', 'name', 'username', 'createdAt'])
      .appendRow([classId, code, examTextCell(payload.name.trim()), examTextCell(principal.username), new Date().toISOString()]);
  ```
  Biến `code` được truyền trực tiếp mà KHÔNG bọc qua `examTextCell(code)`. Khi Google Sheets nhận giá trị `'222222'`, nó tự động lưu thành kiểu số nguyên (`number` `222222`).
  Trong khi đó, ở hàm `formatRecordRow` khi học sinh nộp bài thi vào lớp ([Code.js:910](file:///D:/Cunata/apps-script/Code.js#L910)):
  `sheet.appendRow(row.concat([examTextCell(classCode), examTextCell(assignmentId)]));`
  Giá trị `classCode` trong bảng `KetQua` (cột R / cột 18) được lưu dưới dạng chuỗi có tiền tố nháy đơn (khi đọc ra là chuỗi `"222222"`).
  Khi giáo viên truy vấn kết quả lớp hoặc xem danh sách lớp:
  - Hàm `listMyClasses` ([Code.js:1266-1268](file:///D:/Cunata/apps-script/Code.js#L1266-L1268)) gọi `classResults(r[1])`. Ở đây `r[1]` lấy từ bảng `Lop`, có giá trị là số `222222`.
  - Hàm `listResults` ([Code.js:1274](file:///D:/Cunata/apps-script/Code.js#L1274)) gọi `classResults(cls[1], payload.assignmentId)`. Ở đây `cls[1]` cũng là số `222222`.
  - Trong hàm `classResults` ([Code.js:1152-1157](file:///D:/Cunata/apps-script/Code.js#L1152-L1157)):
    ```javascript
    function classResults(code, assignmentId) {
        ...
        return sheet.getRange(2, 1, sheet.getLastRow() - 1, 19).getValues().filter(function (r) {
            return String(r[17]) === code && (!assignmentId || String(r[18]) === assignmentId);
        }).map(...);
    }
    ```
    Phép so sánh `String(r[17]) === code` so sánh chuỗi `"222222"` với số `222222`. Trong JavaScript, toán tử strict equality `===` giữa String và Number **luôn luôn trả về `false`**.
  Hậu quả: Hàm `classResults` trả về mảng rỗng `[]`. Giáo viên vào màn hình kết quả lớp thấy trống trơn, sĩ số lớp hiển thị bằng 0 dù học sinh đã nộp bài thành công và được máy chủ xác nhận.
- **Bước tái hiện:**
  1. Tạo lớp học có mã toàn số (ví dụ mã `'222222'`).
  2. Giao đề thi cho lớp học này.
  3. Học sinh tham gia lớp bằng mã `'222222'`, làm bài và nộp bài thành công (nhận thông báo "Đã gửi").
  4. Giáo viên đăng nhập trang quản lý giáo viên, kiểm tra thẻ lớp học tại `#/giao-vien/lop` và bảng kết quả tại `#/giao-vien/ket-qua`.
- **Kết quả thực tế (Actual):**
  - Sĩ số lớp hiển thị: `Sĩ số: 0`.
  - Bảng kết quả `#resultsTable` hoàn toàn không có dữ liệu của học sinh.
- **Kết quả kỳ vọng (Expected):**
  - Sĩ số lớp phải là `Sĩ số: 1`.
  - Bảng kết quả phải hiển thị đầy đủ tên học sinh, thời gian nộp và điểm số.
- **Bằng chứng kiểm thử:**
  - File bằng chứng: [ops/blitz/appsscript/F03-api.json](file:///D:/Cunata/ops/blitz/appsscript/F03-api.json), [ops/blitz/appsscript/F03-browser.json](file:///D:/Cunata/ops/blitz/appsscript/F03-browser.json).
  - Kết quả chạy test trong [ops/blitz/appsscript/proposed.tap](file:///D:/Cunata/ops/blitz/appsscript/proposed.tap):
    - `CX-F03 API: all-numeric valid class code must retain submitted results and headcount`: FAILED (`results.results.length: 0 !== 1`).
    - `CX-F03 dist browser: numeric class code submission appears in teacher results`: FAILED (`0 !== 1`).
- **Cách sửa tối thiểu:**
  Tại [apps-script/Code.js:1263](file:///D:/Cunata/apps-script/Code.js#L1263), bọc mã lớp bằng `examTextCell(code)`:
  ```javascript
  writeTable('Lop', ['classId', 'code', 'name', 'username', 'createdAt'])
      .appendRow([classId, examTextCell(code), examTextCell(payload.name.trim()), examTextCell(principal.username), new Date().toISOString()]);
  ```
  Đồng thời tại [apps-script/Code.js:1156](file:///D:/Cunata/apps-script/Code.js#L1156), chuyển `code` sang kiểu chuỗi trước khi so sánh:
  ```javascript
  return String(r[17]) === String(code) && (!assignmentId || String(r[18]) === assignmentId);
  ```

---

### 3.4 CX-AS-04 — Thiếu kiểm tra xung đột cho siêu dữ liệu bài thi (candidate_display, started_at, submitted_at, duration_seconds)
- **Mức độ:** MINOR
- **Vị trí:** [apps-script/Code.js:820-880](file:///D:/Cunata/apps-script/Code.js#L820-L880)
- **Căn cứ hợp đồng:**
  - `docs/contracts/WEB-contract.md` §7: *"Server phải atomic dedupe tuple + hash; cùng tuple khác hash → conflict, không overwrite."*
  - Shared Product Contract v2.0 §4: Bất biến của attempt record một khi đã nộp.
- **Thực trạng và nguyên nhân:**
  Trong `Code.js:790-880`, khi một `attempt_id` đã tồn tại trên Google Sheets, hệ thống thực hiện kiểm tra xung đột dữ liệu (`conflict`) giữa bản ghi cũ và bản ghi mới gửi lên:
  ```javascript
  const exExamId = getColVal(2);
  const exVersion = getColVal(3);
  const exP1Score = getColVal(8);
  const exP1Max = getColVal(9);
  const exP2Score = getColVal(10);
  const exP2Max = getColVal(11);
  const exP3Score = getColVal(12);
  const exP3Max = getColVal(13);
  const exTotal = getColVal(14);
  const exMax = getColVal(15);
  const exPolicy = getColVal(16);
  const exRaw = getColVal(17);
  ...
  // Kiểm tra điểm số, phiên bản, policy, và raw answers
  ```
  Hệ thống đã kiểm tra rất kỹ các cột điểm số (8–15), policy (16), đáp án thô (17), và thông tin lớp/bài giao (18, 19).
  Tuy nhiên, hệ thống **bỏ sót hoàn toàn** các cột:
  - Cột 4: `candidate_display` (tên hiển thị thí sinh)
  - Cột 5: `started_at` (thời điểm bắt đầu)
  - Cột 6: `submitted_at` (thời điểm nộp)
  - Cột 7: `duration_seconds` (thời gian làm bài)
  Hệ quả: Nếu kẻ gian hoặc mã độc gửi lại một request nộp bài với cùng `attempt_id` nhưng sửa đổi tên thí sinh thành tên người khác (ví dụ từ `"Nguyễn An"` thành `"Người khác"`), hoặc thay đổi gian lận thời gian làm bài, hệ thống vẫn xem đây là lượt gửi trùng hợp lệ và trả về `status: 'ALREADY_RECORDED'` thay vì trả về lỗi `error: 'PAYLOAD_CONFLICT'`.
- **Bước tái hiện:**
  1. Gửi kết quả lượt thi hợp lệ với `attempt_id = 'metadata-conflict'`, tên `"Thí sinh A"`.
  2. Gửi tiếp request thứ hai với cùng `attempt_id = 'metadata-conflict'`, nhưng sửa tên thành `"Người khác"` hoặc thay đổi `started_at`/`submitted_at`/`duration_seconds`.
- **Kết quả thực tế (Actual):**
  - Hệ thống trả về `{ success: true, status: "ALREADY_RECORDED" }`. Không có lỗi xung đột nào được phát hiện.
- **Kết quả kỳ vọng (Expected):**
  - Hệ thống phải phát hiện sai lệch siêu dữ liệu bất biến và trả về `{ success: false, error: "PAYLOAD_CONFLICT", message: "..." }`.
- **Bằng chứng kiểm thử:**
  - File bằng chứng: [ops/blitz/appsscript/F04-api.json](file:///D:/Cunata/ops/blitz/appsscript/F04-api.json).
  - Kết quả chạy test trong [ops/blitz/appsscript/proposed.tap](file:///D:/Cunata/ops/blitz/appsscript/proposed.tap):
    - `CX-F04 API: same attempt with changed immutable candidate/time metadata must conflict`: FAILED (`undefined !== 'PAYLOAD_CONFLICT'`).
- **Cách sửa tối thiểu:**
  Tại [apps-script/Code.js:833](file:///D:/Cunata/apps-script/Code.js#L833), bổ sung đọc và kiểm tra các cột siêu dữ liệu bất biến:
  ```javascript
  const exCandidate = getColVal(4);
  const exStartedAt = getColVal(5);
  const exSubmittedAt = getColVal(6);
  const exDuration = getColVal(7);

  if (exCandidate !== cleanCell(expectedRow[3])) {
      conflict = true;
  } else if (exStartedAt !== cleanCell(expectedRow[4])) {
      conflict = true;
  } else if (exSubmittedAt !== cleanCell(expectedRow[5])) {
      conflict = true;
  } else if (String(exDuration) !== String(expectedRow[6])) {
      conflict = true;
  }
  ```

---

## 4. Kết quả kiểm thử thực đo (Test Evidence)

Tất cả các lệnh kiểm thử dưới đây đã được chạy thực tế trong môi trường Node.js v24.14.0 và ghi nhận nhật ký kết quả:

### 4.1 Bộ kiểm soát toàn diện (Controls Suite)
- **Lệnh thực thi:** `node --test ops/blitz/appsscript/controls.test.mjs`
- **Exit code:** `0`
- **Kết quả:** `14 pass`, `0 fail`, `0 skip` (thời gian: 341 ms)
- **Nhật ký chi tiết:** [ops/blitz/appsscript/controls.tap](file:///D:/Cunata/ops/blitz/appsscript/controls.tap)

| STT | Tên ca kiểm thử | Kết quả | Ý nghĩa kiểm định |
|---|---|---|---|
| C01 | all 12 privileged actions reject missing, forged, malformed and opposite-role tokens | **PASS** | Bảo vệ phân quyền 12 API admin/giáo viên |
| C02 | teacher isolation: classes, assignments, results, publish, unpublish, assign | **PASS** | Cô lập dữ liệu triệt để giữa các giáo viên |
| C03 | 8-hour session: usable after 6-hour cache eviction; exact expiry fails | **PASS** | Phiên 8 giờ và khôi phục khi dọn CacheService |
| C04 | lock and reset invalidate current tokens; rotation of ADMIN_PASSWORD invalidates admin token | **PASS** | Thu hồi phiên lập tức khi khóa/reset/xoay mật khẩu |
| C05 | passwords use distinct salts and SHA-256; no hash/salt/password in responses | **PASS** | Băm mật khẩu có muối, bảo mật phản hồi |
| C06 | NOT_OPEN and PAST_DUE boundaries use server time; duplicate after deadline acknowledged | **PASS** | Ranh giới thời gian làm bài chuẩn xác |
| C07 | mismatched class/exam/assignment cannot write results; malformed paired fields rejected | **PASS** | Chặn nộp bài rác không khớp thông tin phân công |
| C08 | injection prefixes preserved across teacher/class/exam/assignment/result fields | **PASS** | Chống Spreadsheet Formula Injection cho các trường |
| C09 | large exam Unicode/formula/numeric/apostrophe chunk boundaries survive exact replacement | **PASS** | Chia khúc đề thi lớn (≤ 40.000 ký tự) trên bảng `DeThi` |
| C10 | write paths obey LockService, release on errors, contention returns SERVER_BUSY | **PASS** | Khóa tranh chấp ghi đồng thời |
| C11 | class codes use required alphabet and are unique (300 draws) | **PASS** | Bảng ký tự mã lớp `[A-HJ-NP-Z2-9]` |
| C12 | Code.js has none of the prohibited syntax (lexical scan, including BigInt literals) | **PASS** | Chuẩn cú pháp ES2019 không có BigInt literal `0n` |
| C13 | invalid exams are rejected with errors and do not overwrite published content | **PASS** | Xác thực schema đề thi trước khi xuất bản |
| C14 | contention during actual result append cannot create duplicate rows | **PASS** | Chống ghi đúp bản ghi khi tranh chấp ghi kết quả |

### 4.2 Bộ kiểm thử tái hiện lỗi (Proposed Regression Suite)
- **Lệnh thực thi:** `node --test ops/blitz/appsscript/proposed.test.mjs`
- **Exit code:** `1`
- **Kết quả:** `0 pass`, `8 fail`, `0 skip` (8/8 ca kiểm thử ĐỎ trên bản dist/Apps Script hiện tại, chứng minh rõ ràng 4 findings đã nêu)
- **Nhật ký chi tiết:** [ops/blitz/appsscript/proposed.tap](file:///D:/Cunata/ops/blitz/appsscript/proposed.tap)

| STT | Tên ca kiểm thử | Exit | Kết quả thực đo | Finding liên quan |
|---|---|---|---|---|
| P01 | CX-F01 API: numeric attempt ID must remain literal and retry must deduplicate | `1` | **FAIL**: `NEWLY_RECORDED !== ALREADY_RECORDED` | **CX-AS-01** |
| P02 | CX-F01 API: leading apostrophe in a result string must survive Sheets readback | `1` | **FAIL**: `'Nguyễn An' !== "'Nguyễn An"` | **CX-AS-01** |
| P03 | CX-F02 API: valid 1000-question answers exceeding one cell must remain receivable | `1` | **FAIL**: `false !== true` (SERVER_ERROR 500) | **CX-AS-02** |
| P04 | CX-F03 API: all-numeric valid class code must retain submitted results and headcount | `1` | **FAIL**: `results.length: 0 !== 1` | **CX-AS-03** |
| P05 | CX-F04 API: same attempt with changed immutable candidate/time metadata must conflict | `1` | **FAIL**: `undefined !== 'PAYLOAD_CONFLICT'` | **CX-AS-04** |
| P06 | CX-F01 dist browser: typed apostrophe name is preserved in confirmed Sheet result | `1` | **FAIL**: `'Nguyễn An' !== "'Nguyễn An"` | **CX-AS-01** |
| P07 | CX-F02 dist browser: supported large-answer exam can be submitted to Sheet | `1` | **FAIL**: `false !== true` (kích thước > 50.000 ký tự) | **CX-AS-02** |
| P08 | CX-F03 dist browser: numeric class code submission appears in teacher results | `1` | **FAIL**: `table results: 0 !== 1` | **CX-AS-03** |

### 4.3 Các bộ kiểm thử phụ trợ hiện có (Baseline Suites)
- `node --test test/claude-check/appsscript.test.mjs`: `exit 0`, `9 pass`, `0 fail` (9/9 ca kiểm tra tính năng tổng quan của Apps Script đều xanh).
- `node --test test/claude-check/teacher.test.mjs`: `exit 0`, `7 pass`, `0 fail` (7/7 ca kiểm tra luồng giáo viên trên trình duyệt đều xanh).

---

## 5. Giới hạn kiểm thử (NOT_RUN)

1. **Không gọi URL Google Apps Script thật trên đám mây:**
   - Theo đúng quy định tại [WEB-contract.md](file:///D:/Cunata/docs/contracts/WEB-contract.md) §17.1 và chỉ thị prompt, file cấu hình `public/config.json` giữ giá trị rỗng (`""`), và `ops/prod_config.json` không được sử dụng.
   - Toàn bộ kiểm thử được thực thi trên môi trường Google Apps Script giả lập đầy đủ tính năng (`test/claude-check/gas-fake.mjs` và `test/claude-check/gas-server.mjs`) chạy chính xác file mã nguồn `apps-script/Code.js` thật trong Node.js VM context.
2. **Không sửa đổi mã nguồn sản phẩm:**
   - Đúng phạm vi `scope_files` của worker rà soát: không sửa file `apps-script/Code.js`, không sửa mã trong `src/` hoặc `dist/`.
   - Các đề xuất sửa đổi mã đã được chuẩn hóa và ghi rõ ràng ở mục 3 để worker phụ trách glue/backend tích hợp trong các lượt sửa tiếp theo.

---

## 6. Gợi ý hoàn thiện thêm (Recommendations — Không tính là lỗi)

1. **Chuẩn hóa việc ghi chuỗi văn bản bằng `examTextCell` cho mọi trường:**
   - Trong Google Sheets, bất kỳ chuỗi ký tự nào chỉ gồm chữ số (ví dụ mã định danh, số điện thoại, mã lớp) đều có nguy cơ bị Sheets chuyển đổi ngầm thành kiểu số. Khuyến nghị chuẩn hóa toàn bộ các trường chuỗi ghi vào mọi sheet (`KetQua`, `DeThi`, `Lop`, `GiaoDe`, `GiaoVien`) qua hàm `examTextCell` (thêm tiền tố `'`) để bảo đảm tính toàn vẹn 100% dữ liệu chuỗi.
2. **Thêm cơ chế tự động dọn dẹp các dòng trống khi khởi tạo sheet:**
   - Khi Google Sheets tự động tạo trang tính mới, mặc định nó có 1.000 dòng trống. Khuyến nghị xóa các dòng trống chưa dùng để tối ưu hóa hiệu năng của các hàm `sheet.getLastRow()` và `sheet.getRange()`.
