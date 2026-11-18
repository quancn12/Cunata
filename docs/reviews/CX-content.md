# CX-content — Rà soát nội dung 16 đề Vật lí 12 (de10–de25)

- `review_id / task_id / worker_id`: CX-content-anti (tiếp quản và hoàn thiện từ CX-content/Codex); reviewer: Antigravity.
- Hồ sơ kỹ thuật: `internal-profile` theo chỉ đạo điều phối của Claude.
- Ngày kiểm: 18/11/2026, môi trường Windows/PowerShell, Node v24.14.0, trình duyệt Chrome headless qua giao thức CDP harness `test/claude-check/harness.mjs`.
- `base_commit = head_commit`: `e7d8f85c99f28fef83d37187a2101e15be100d7b` (thời điểm Codex bắt đầu chụp hash: `178fb4f86735fd8fae89133a26a2ed3cf1c79185`).
- Kết luận kiểm định: **CHANGES_REQUESTED**. Chưa đề nghị nghiệm thu đợt phát hành 16 đề Lý 12 (`public/exams/ly12/de10.json` .. `de25.json`) do tồn tại 5 lỗi MAJOR và 4 lỗi MINOR đã được xác minh bằng bằng chứng trực tiếp và bộ ca kiểm thử đỏ. Không phát hiện lỗi mức BLOCKER.
- Ràng buộc thực thi: Báo cáo kiểm định độc lập. Chỉ tạo/sửa file trong `docs/reviews/CX-content.md` và thư mục `ops/blitz/content/`. Không sửa `src/`, `dist/`, `public/`, `apps-script/`, `test/`. Không npm install, không thêm dependency, không commit, không deploy, không gọi mạng Google thật.

---

## 1. Căn cứ và snapshot

### 1.1 Căn cứ đối chiếu
1. **Shared Product Contract v2.0**: Các bất biến chấm điểm (§2: Phần I đúng duy nhất 1 đáp án 0,25 đ; Phần II 4 ý Đúng/Sai; Phần III trả lời ngắn chuỗi tối đa 4 ký tự `0-9,-,`, so khớp chính xác từng ký tự theo D01). Báo cáo kết quả và hiển thị lời giải sau nộp (§2, §3).
2. **Hợp đồng kỹ thuật `docs/contracts/WEB-contract.md`**:
   - §4, §4.1: Quy cách dữ liệu đề `web-exam-v1`, cấu trúc `Block` (text, math, image, table), hiển thị công thức an toàn, có nhãn cho cú pháp chưa hỗ trợ, không rò rỉ mã HTML/kết xuất thô.
   - §4.2: Fixtures đề và tính toàn vẹn dữ liệu.
   - §14–19: Giao diện học sinh, màn làm bài, bảng số câu, nộp bài và màn hình xem lại kết quả kèm lời giải chi tiết.
3. **Quyết định đã chốt `docs/decisions/BANG-QUYET-DINH.md`**:
   - D01: Ô trả lời ngắn Phần III nhận chữ số `0–9`, dấu phẩy `,`, dấu trừ `-`, tối đa 4 ký tự.
   - D08: Sau khi nộp, học sinh có lời giải chi tiết của mọi câu (không dùng đáp án trần thay lời giải).
4. **Quyết định nguồn đề `docs/decisions/DE-LY12-NGUON-CO-VAN-DE.md`**:
   - 14 chỗ nguồn đề Lý 12 có vấn đề và các quyết định đã chốt của Trưởng phòng ngày 16/11/2026.
   - Đối chiếu với đính chính đáp án tại `ops/exams/answer_overrides.json`.

### 1.2 Snapshot kiểm thử và tính toàn vẹn
Các file dist liên quan đã được chụp mã băm SHA-256 từ đầu phiên kiểm định (lưu tại `ops/blitz/content/start-dist-sha256.json`) và kiểm tra không đổi hash trong suốt quá trình chạy:

| File | SHA-256 |
|---|---|
| `dist/index.html` | `4F45F2DC2BBBDDCF6D6F636FEDA6FE72C05C4FB04B34385F88ECAACDFC1DE8E9` |
| `dist/app/main.js` | `37882FE63B48F4BFBC5237C908AC1D250269AE5B116170FEF50F33A9B25A775C` |
| `dist/app/legacy.js` | `4440BF4BE44F58BC9AC8652B3EBD4DDBFFBDCE03E0097EE76B7C1DA2C9E04A48` |
| `dist/student/view.js` | `0C32361B78B0239A0604812328AF7CD5044230D6C11234479529729BC75D27CA` |
| `dist/report/view.js` | `6A74C4080DF388E4EE4C3EB1EE70C92F3BE7B0D36D81CD8D9A8AE9FE30EDF33A` |

Toàn bộ 16 file JSON trong `public/exams/ly12/*.json` và bản tương ứng trong `dist/public/exams/ly12/*.json` được kiểm tra khớp nhau 100% từng byte.

---

## 2. Phạm vi đã chạy thực tế

Lượt kiểm định đã khảo sát toàn diện 16 đề thi Vật lí 12 (từ `de10.json` đến `de25.json`), bao gồm 448 câu hỏi:

1. **Kiểm tra cấu trúc và phân loại câu hỏi (Tĩnh - 16 đề):**
   - 16/16 đề đều có đúng 28 câu hỏi: 18 câu Phần I (trắc nghiệm 4 lựa chọn), 4 câu Phần II (Đúng/Sai 4 ý), 6 câu Phần III (trả lời ngắn).
   - 100% câu hỏi Phần I có đúng 4 phương án lựa chọn và `correctOptionId` hợp lệ trỏ vào một trong 4 phương án đó.
   - 100% câu hỏi Phần II có đúng 4 mệnh đề a, b, c, d với giá trị boolean xác định.
   - Cài đặt thời gian thi: 50 phút; chính sách công bố đáp án: `immediate`.
2. **Kiểm tra đáp án Phần III theo D01 (Tĩnh - 96 câu):**
   - 100% (96/96) giá trị `answerKey` của Phần III trên 16 đề đều hoàn toàn tuân thủ quy chuẩn D01: độ dài 1–4 ký tự, chỉ gồm ký tự `0-9`, dấu phẩy `,`, dấu trừ `-`.
   - Không có đáp án nào dài quá 4 ký tự, không có ký tự lạ hay khoảng trắng thừa.
3. **Đối chiếu quyết định đính chính đáp án (`answer_overrides.json`):**
   - Đề 10 Câu 17: Đáp án B (đúng theo đính chính).
   - Đề 23 Câu 10: Đáp án A (đúng theo đính chính).
   - Đề 25 Câu 3: Đáp án B (đúng theo đính chính).
   - Đề 25 Câu 19 ý c: `false` (đúng theo đính chính).
4. **Kiểm tra hình ảnh và phương tiện trực quan (Trình duyệt thật qua CDP):**
   - Mở từng đề trong trình duyệt Chrome headless (thông qua máy chủ tĩnh loopback `startServer('dist')` phục vụ dưới đường dẫn `/Cunata/`).
   - Kiểm tra thuộc tính `naturalWidth > 0`, `naturalHeight > 0`, `complete = true` của toàn bộ các thẻ `<img>` trong màn làm bài `#examPane` và màn báo cáo kết quả `#reportWrapper`.
   - Kết quả: **0 ảnh hỏng** (broken images = 0) trên toàn bộ 16 đề thi.
   - Đối với các câu thiếu hình vẽ từ bản PDF gốc (`de12-ii-03`, `de18-iii-02`, `de22-i-11`), đã chụp ảnh màn hình hiện trạng trên dist và ghi nhận vào danh sách chờ xử lý hình ảnh theo quyết định của Trưởng phòng.
5. **Kiểm tra render công thức và ký pháp toán học:**
   - Trích xuất hàm `renderMathText` từ `dist/app/main.js` kiểm tra hiển thị phân số, dấu ngoặc, chỉ số dưới/trên, căn thức.
   - Phát hiện lỗi mất nhóm ngoặc phân số trung bình cộng và các biểu thức có tổng/hiệu ở tử số/mẫu số (CX-C02).
   - Phát hiện các ký pháp chưa hỗ trợ (`\%`, `_{nc}`) bị hiển thị thô thiếu nhãn nguồn (CX-C03).
6. **Kiểm tra hiển thị bảng số liệu (Table markdown):**
   - Kiểm tra hai câu chứa bảng thực nghiệm (`de16-i-06` và `de17-i-13`). Cả hai đều bị render thành văn bản thô dài với các ký tự gạch đứng `|` thay vì bảng HTML `<table>` (CX-C05).
7. **Kiểm tra chất lượng lời giải và định dạng báo cáo kết quả:**
   - Rà soát vi phạm D08: các câu có lời giải sơ sài dạng đáp án trần ("Đáp án A.", "Đúng.", "Sai.") thiếu phân tích hoặc công thức (CX-C01).
   - Phát hiện lỗi hiển thị thẻ HTML đã escape (`&lt;strong&gt;`, `&lt;br&gt;`) trong lời giải Phần II của màn hình kết quả sau khi nộp bài (CX-C09).
   - Phát hiện ký tự điều khiển ASCII FORM FEED (`\x0C`) trong JSON đề 18 (CX-C04).

---

## 3. Bảng findings đã xác minh

| ID | Mức | Vấn đề | File:line liên quan | Căn cứ hợp đồng / quyết định | Ca test đỏ tương ứng |
|---|---|---|---|---|---|
| **CX-C01** | MAJOR | Vi phạm D08: dùng đáp án trần ("Đáp án A.", "Đúng.", "Sai.") thay vì lời giải chi tiết trên diện rộng ở cả 16 đề | `public/exams/ly12/de10.json` .. `de25.json` (nhiều dòng); `dist/public/exams/ly12/*.json` | BANG-QUYET-DINH D08; WEB §4.1, §19 | 16 ca test `CX-C01 ${file}` trong `proposed.test.mjs` |
| **CX-C02** | MAJOR | Render phân số làm mất nhóm tử số/mẫu số: `\frac{21+23+30+26}{4}` render thành `(21 + 23 + 30 + 26/4)` | `public/exams/ly12/de12.json:184`; `dist/app/main.js:77`; `src/app/main.ts:280` | WEB §4.1 (render toán học chính xác) | Ca test `CX-C02` trong `proposed.test.mjs` |
| **CX-C03** | MINOR | Ký pháp LaTeX chưa hỗ trợ (`\%`, `_{nc}`) hiển thị thô trong DOM, thiếu nhãn nguồn hoặc cảnh báo | `public/exams/ly12/de14.json:521`; `de17.json:575`; `de12.json:382`; `src/app/main.ts:265` | WEB §4.1 (giữ source có nhãn cho ký pháp chưa hỗ trợ) | Ca test `CX-C03` trong `proposed.test.mjs` |
| **CX-C04** | MAJOR | Ký tự điều khiển ASCII FORM FEED (`\x0C`) trong chuỗi JSON do escape nhầm `\frac` thành `\f` | `public/exams/ly12/de18.json:715` (`ly12-de18-iii-02`) | WEB §4 (JSON canonical hợp lệ); RFC 8259 | Ca test `CX-C04` trong `proposed.test.mjs` |
| **CX-C05** | MAJOR | Bảng dữ kiện thực nghiệm Markdown không được render thành thẻ `<table>`, vỡ bố cục trên giao diện | `public/exams/ly12/de16.json:91`; `public/exams/ly12/de17.json:424` | WEB §4 (khối `table`, `Cell`); Shared Contract §1 | Ca test `CX-C05` trong `proposed.test.mjs` |
| **CX-C06** | MINOR | Lời giải I.8 đề 15 chứa khẳng định sai vật lí ("tốc độ phân tử càng lớn thì thể tích càng cao") do chép theo nguồn lỗi | `public/exams/ly12/de15.json:294` (`ly12-de15-i-08`) | DE-LY12-NGUON-CO-VAN-DE.md Đề 15; Shared Contract §1 | Ca test `CX-C06` trong `proposed.test.mjs` |
| **CX-C07** | MINOR | Lỗi chính tả rõ ràng trong văn bản câu hỏi và lời giải (`chuyển đông nhiệt`, `ống thử tình`, `thang do Kelvin`, v.v.) | `de14.json:604`, `de15.json:521,604`, `de17.json:181`, `de20.json:54`, `de25.json:173,251,601,685` | DE-LY12-NGUON-CO-VAN-DE.md; Shared Contract §1 | Ca test `CX-C07` trong `proposed.test.mjs` |
| **CX-C08** | MINOR | Lời giải II.4d đề 21 dùng sai ký hiệu `p_1` thay vì `p_4` ở phương trình cân bằng giai đoạn cuối | `public/exams/ly12/de21.json:720` (`ly12-de21-ii-04.d`) | DE-LY12-NGUON-CO-VAN-DE.md Đề 21; Shared Contract §2 | Ca test `CX-C08` trong `proposed.test.mjs` |
| **CX-C09** | MAJOR | Lời giải Phần II trên màn hình kết quả bị rò rỉ mã HTML đã escape (`&lt;strong&gt;`, `&lt;br&gt;`) | `dist/app/legacy.js:58`; `src/app/main.ts:267`; `dist/app/main.js:77` | WEB §4.1 (DOM an toàn, tránh escape kép); DESIGN §1.5 | Ca test `CX-C09` trong `proposed.test.mjs` |

---

## 4. Chi tiết từng finding đã xác minh

### CX-C01 — Vi phạm D08: Lời giải trần thiếu phân tích chi tiết ở cả 16 đề
- **Các bước thật đã chạy:** Quét toàn bộ 448 câu hỏi của 16 đề thi. Lọc các câu Phần I/III có `explanation` chỉ là `Đáp án A.` / `Đáp án B.` / rỗng, hoặc Phần II có từng mệnh đề chỉ ghi `Đúng.` / `Sai.`. Mở trình duyệt nộp bài và chụp màn hình xem lại kết quả.
- **Actual:** Xuất hiện tại cả 16 đề. Ví dụ:
  - `de10.json`: các câu `i-01`, `i-02`, `i-03`, `i-04`, `i-05`, `i-06` chỉ ghi "Đáp án A.", "Đáp án B."; các ý `ii-01.a`, `ii-01.c`, `ii-02.c` chỉ ghi "Đúng." hoặc "Sai.".
  - `de11.json` .. `de25.json`: đều có hiện tượng tương tự (xem chi tiết mục 5).
- **Expected:** Theo quyết định D08 đã chốt: "Sau khi nộp, học sinh có lời giải chi tiết của mọi câu." Mỗi câu cần có lý giải hiện tượng, định luật áp dụng hoặc các bước biến đổi toán học cụ thể, không chỉ thông báo lại phương án chọn.
- **Tác động:** Học sinh xem lại bài không hiểu vì sao chọn phương án đó, làm giảm đáng kể giá trị luyện thi của sản phẩm.
- **Cách sửa tối thiểu:** Bổ sung lời giải có cơ sở lí thuyết/công thức cho các câu trần này trong các file JSON đề thi. Giữ nguyên đáp án chuẩn `correctOptionId` / `answerKey` / `answer`.
- **Bằng chứng:** Các ảnh chụp `ops/blitz/content/de10-terse-explanation.png` đến `de25-terse-explanation.png`; 16 ca test đỏ `CX-C01` trong `proposed.test.mjs`.

### CX-C02 — Render phân số làm mất nhóm tử số/mẫu số
- **Các bước thật đã chạy:** Trích xuất hàm `renderMathText` đang chạy trên dist:
  ```js
  f = f.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)');
  ```
  Truyền chuỗi lời giải câu `ly12-de12-i-10`: `$t = \frac{21 + 23 + 30 + 26}{4} = 25$°C`.
- **Actual:** Render thành `(21 + 23 + 30 + 26/4)`. Chỉ có số hạng cuối `26` bị chia cho 4, ba số hạng đầu giữ nguyên phép cộng. Biểu thức trở thành $21 + 23 + 30 + 6,5 = 80,5 \ne 25$.
- **Expected:** Phân số có tử số hoặc mẫu số chứa phép cộng/trừ phải được bọc nhóm rõ ràng: `((21 + 23 + 30 + 26)/4)` hoặc `(21 + 23 + 30 + 26) / 4`.
- **Tác động:** Gây hiểu sai nghiêm trọng về mặt toán học và vật lí cho học sinh khi đọc lời giải. Lỗi này lặp lại ở 23 câu khác nhau trên 11 đề (`de10`, `de12`, `de13`, `de14`, `de15`, `de16`, `de17`, `de20`, `de21`, `de22`, `de23`).
- **Cách sửa tối thiểu:** Sửa regex thay thế `\frac` trong `renderMathText` (`src/app/main.ts`): nếu `$1` hoặc `$2` chứa toán tử `+`, `-`, bọc thêm ngoặc đơn cho tử/mẫu tương ứng, ví dụ `(($1)/($2))`.
- **Bằng chứng:** Ảnh chụp `ops/blitz/content/de12-report-q10.png`; ca test đỏ `CX-C02` trong `proposed.test.mjs`.

### CX-C03 — Ký pháp LaTeX chưa hỗ trợ hiển thị thô trong DOM
- **Các bước thật đã chạy:** Kiểm tra kết xuất của các câu có chứa `\%` (`de14-i-17`, `de17-i-18`) và `t_{nc}` (`de12-ii-03`).
- **Actual:**
  - `80\%` hiển thị nguyên văn thành `80\%` trên màn hình (dấu gạch chéo ngược `\` bị lộ).
  - `t_{nc}` hiển thị thành `t_{nc}` (dấu gạch dưới và ngoặc nhọn bị lộ do regex chỉ hỗ trợ `_([0-9a-zA-Z+-]+)` không có ngoặc nhọn).
- **Expected:** Theo WEB-contract §4.1: Các ký pháp chưa hỗ trợ phải được xử lý hoặc gán nhãn cảnh báo nguồn, không để lộ dấu escape thô của LaTeX làm xấu giao diện.
- **Tác động:** Giảm tính thẩm mỹ và tính chuyên nghiệp của giao diện thi.
- **Cách sửa tối thiểu:** Thêm vào `renderMathText`: thay `\\%` thành `%`; hỗ trợ chỉ số dưới có ngoặc nhọn `_\{([^}]+)\}` thành `<sub>$1</sub>`.
- **Bằng chứng:** Ảnh chụp `ops/blitz/content/de14-exam-q17.png`, `de17-exam-q18.png`, `de12-exam-q21.png`; ca test đỏ `CX-C03` trong `proposed.test.mjs`.

### CX-C04 — Ký tự điều khiển ASCII FORM FEED (`\x0C`) trong JSON đề 18
- **Các bước thật đã chạy:** Đọc file `public/exams/ly12/de18.json` tại dòng 715 (`ly12-de18-iii-02`). Quét mã byte của trường `explanation`.
- **Actual:** Trường chứa ký tự điều khiển ASCII `0x0C` (Form Feed, `\f`) do trong chuỗi JSON viết `\frac` thay vì `\\frac`. Khi JSON parser đọc, `\f` biến thành mã điều khiển 12.
- **Expected:** Chuỗi JSON chuẩn RFC 8259, không chứa các ký tự điều khiển vô hình không mong muốn trong dải `[\x00-\x1F]`.
- **Tác động:** Khi render hoặc copy/paste văn bản có thể gây lỗi hiển thị hoặc lỗi phân tích cú pháp ở các công cụ xử lý văn bản khác.
- **Cách sửa tối thiểu:** Đổi `\frac` thành `\\frac` (hoặc chuyển thành phân số Unicode / công thức chuẩn) trong `public/exams/ly12/de18.json` dòng 715.
- **Bằng chứng:** Log kiểm tra `candidates.log` dòng 57; ca test đỏ `CX-C04` trong `proposed.test.mjs`.

### CX-C05 — Bảng dữ kiện thực nghiệm Markdown không render thành `<table>`
- **Các bước thật đã chạy:** Mở đề 16 câu I.6 (`ly12-de16-i-06`) và đề 17 câu I.13 (`ly12-de17-i-13`) trên trình duyệt qua harness. Đọc DOM rendered của `#examPane`.
- **Actual:** Bảng dữ kiện thực nghiệm (bảng nhiệt hóa hơi riêng, nhiệt dung riêng) viết dạng Markdown table (`| Chất | Nhiệt dung riêng | ...`) bị biến thành một dòng văn bản thô dài:
  `Nhiệt hóa hơi riêng L của một số loại chất lỏng... | Chất lỏng | Nhiệt hóa hơi riêng L (J/kg) | |---|---| | Nước | 2,26 · 10^6 | ...`
- **Expected:** Dữ liệu bảng phải được trình bày dưới dạng bảng HTML `<table>` có cột, hàng ngay ngắn như quy định tại WEB §4 (`Cell`, `Block` kiểu `table`).
- **Tác động:** Học sinh rất khó đọc và tra cứu số liệu đối chiếu trong lúc giải bài; dễ nhìn nhầm dòng.
- **Cách sửa tối thiểu:** Bổ sung bộ phân tích bảng Markdown đơn giản trong `renderMathText` hoặc hàm render nội dung để chuyển cấu trúc `|...|` thành thẻ `<table><tr><td>...</td></tr></table>` có CSS cơ bản.
- **Bằng chứng:** Ảnh chụp màn hình `ops/blitz/content/de16-exam-q6.png`, `de17-exam-q13.png`; ca test đỏ `CX-C05` trong `proposed.test.mjs`.

### CX-C06 — Lời giải I.8 đề 15 chứa khẳng định sai kiến thức vật lí
- **Các bước thật đã chạy:** Đọc `public/exams/ly12/de15.json` dòng 294, câu `ly12-de15-i-08`.
- **Actual:** `explanation` chép nguyên văn lỗi của PDF nguồn: *"Tốc độ chuyển động của các phân tử cấu tạo nên vật càng lớn thì thể tích của vật càng cao"*.
- **Expected:** Tốc độ chuyển động nhiệt của phân tử liên hệ với nhiệt độ chứ không đồng nhất với thể tích. Câu hỏi yêu cầu tìm phát biểu sai (chọn C), lời giải phải phân tích vì sao phát biểu đó sai thay vì lặp lại khẳng định sai đó như một chân lí. Vấn đề này đã được phát hiện trong `docs/decisions/DE-LY12-NGUON-CO-VAN-DE.md` mục Đề 15.
- **Tác động:** Dạy sai kiến thức vật lí cơ bản cho học sinh.
- **Cách sửa tối thiểu:** Đính chính lời giải: giải thích rõ tốc độ chuyển động nhiệt của phân tử phụ thuộc vào nhiệt độ (nhiệt độ càng cao thì tốc độ càng lớn); thể tích của vật phụ thuộc vào khoảng cách giữa các phân tử. Giữ nguyên đáp án đúng là phương án C (`ly12-de15-i-08-c`).
- **Bằng chứng:** Ảnh chụp `ops/blitz/content/de15-report-q8.png`; ca test đỏ `CX-C06` trong `proposed.test.mjs`.

### CX-C07 — Lỗi chính tả rõ ràng trong văn bản đề và lời giải
- **Các bước thật đã chạy:** Dùng biểu thức chính quy quét toàn bộ 16 đề để tìm các lỗi chính tả đã được ghi nhận trong `DE-LY12-NGUON-CO-VAN-DE.md`:
  `/chuyển đông nhiệt|ống thử tình|thang do Kelvin|sau đầy|biết đổi|thể tích vãn|600 g dồng|cứng thỉ|là là|nhiệt đột/`
- **Actual:** Phát hiện 10 lỗi chính tả rõ ràng:
  - `de15.json`: `chuyển đông nhiệt` (câu II.1a), `ống thử tình` (câu I.16).
  - `de17.json`: `thang do Kelvin` (câu I.3).
  - `de20.json`: `sau đầy`, `biết đổi`, `thể tích vãn` (câu I.4).
  - `de25.json`: `600 g dồng` (câu I.10), `cứng thỉ` (câu I.15), `nhiệt đột` (câu II.3), `là là` (câu II.1d).
  - `de14.json`: `là là` (câu II.2).
- **Expected:** Văn bản đề thi chuẩn mực tiếng Việt: *chuyển động nhiệt*, *ống thủy tinh*, *thang đo Kelvin*, *sau đây*, *biến đổi*, *thể tích vẫn*, *600 g đồng*, *cứng thì*, *nhiệt độ*, *là*.
- **Tác động:** Lỗi chính tả làm giảm tính trang nghiêm và độ tin cậy của đề thi.
- **Cách sửa tối thiểu:** Sửa các từ sai chính tả trong các file JSON tương ứng, giữ nguyên đáp án và mã ID.
- **Bằng chứng:** Ca test đỏ `CX-C07` trong `proposed.test.mjs`.

### CX-C08 — Lời giải II.4d đề 21 dùng sai ký hiệu `p_1` thay vì `p_4`
- **Các bước thật đã chạy:** Kiểm tra `public/exams/ly12/de21.json` dòng 720 (`ly12-de21-ii-04.d`).
- **Actual:** Dòng phương trình cân bằng lực ở trạng thái cuối ghi: `$F_1 + p_0 S_A + p_1 S_B = F_2 + p_1 S_A$`. Đại lượng áp suất giai đoạn 4 đáng lẽ phải là $p_4$ thì lại viết nhầm thành $p_1$. Ở dòng thế số bên dưới thì lại dùng đúng giá trị của $p_4 = 0,6 \cdot 10^5 \text{ Pa}$.
- **Expected:** Phương trình phải ghi `$F_1 + p_0 S_A + p_4 S_B = F_2 + p_4 S_A$` để thống nhất giữa công thức và số liệu thế vào.
- **Tác động:** Học sinh đối chiếu công thức với số liệu thế vào sẽ thấy mâu thuẫn ký hiệu.
- **Cách sửa tối thiểu:** Sửa ký hiệu $p_1$ thành $p_4$ trong phương trình cân bằng lực của ý d; giữ nguyên `answer: true`.
- **Bằng chứng:** Ảnh chụp `ops/blitz/content/de21-report-q22.png`; ca test đỏ `CX-C08` trong `proposed.test.mjs`.

### CX-C09 — Lời giải Phần II bị rò rỉ mã HTML đã escape trên màn hình kết quả
- **Các bước thật đã chạy:** Chấm bài thi qua `scoreLegacyAttempt(exam, responses)` và hiển thị màn hình xem lại kết quả (`review-question-card`).
- **Actual:** Trong `dist/app/legacy.js`, hàm `scoreLegacyAttempt` ghép lời giải 4 ý của câu Phần II bằng chuỗi:
  ```js
  '<strong>' + s.label + ') ' + (s.answer ? 'Đúng' : 'Sai') + '.</strong> ' + (s.explanation || '') + '<br>'
  ```
  Khi chuyển sang giao diện kết quả, chuỗi này được đưa qua hàm `renderMathText(q.explanation)`, mà đầu hàm `renderMathText` lại gọi `escapeHtml(text)`. Kết quả là các thẻ HTML bị biến thành thực thể:
  `&lt;strong&gt;a) Đúng.&lt;/strong&gt; ... &lt;br&gt;`
  Học sinh nhìn thấy nguyên văn chuỗi mã HTML thô này trên màn hình!
- **Expected:** Giao diện hiển thị chữ in đậm và ngắt dòng bình thường mà không lộ thẻ HTML thô.
- **Tác động:** Lỗi hiển thị nghiêm trọng, ảnh hưởng trực tiếp đến trải nghiệm xem kết quả của toàn bộ 64 câu hỏi Phần II trên cả 16 đề.
- **Cách sửa tối thiểu:** Sửa `scoreLegacyAttempt` không chèn trực tiếp thẻ HTML thô rồi đưa qua `escapeHtml`, hoặc dùng ký pháp Markdown (`**a) Đúng.**\n`) vốn đã được `renderMathText` hỗ trợ an toàn.
- **Bằng chứng:** Ảnh chụp `ops/blitz/content/de22-report.html` và các ảnh chụp màn hình báo cáo; ca test đỏ `CX-C09` trong `proposed.test.mjs`.

---

## 5. Báo cáo rà soát chi tiết từng đề (Đề 10 đến Đề 25)

| Đề | File JSON | Trạng thái ảnh | Phần III (D01) | Đối chiếu nguồn / Overrides | Tình trạng lời giải trần (D08) | Lỗi render / Chính tả / Ghi chú đặc biệt | Minh chứng ảnh lưu trữ |
|---|---|---|---|---|---|---|---|
| **Đề 10** | `de10.json` | 100% OK | 6/6 đạt: `111`, `1700`, `7`, `64,8`, `76`, `36,6` | Câu 17 đã đổi sang key B theo đính chính | 6 câu Phần I (`i-01`..`i-06`), 3 ý Phần II (`ii-01.a,c`, `ii-02.c`) chỉ có đáp án trần | Phân số `i-15`, `iii-06` mất nhóm tử số; II.4 dùng từ "nhiệt độ" thay vì "nhiệt lượng" | `de10-exam.png`, `de10-report-q15.png`, `de10-report-q28.png`, `de10-terse-explanation.png` |
| **Đề 11** | `de11.json` | 100% OK | 6/6 đạt: `131`, `131`, `672`, `0,2`, `27,1`, `136` | III.5 chép sai số trung gian PDF nhưng key `27,1` chuẩn | Phần I `i-01`..`i-04` chỉ ghi "Đáp án...", Phần II `ii-01` chỉ ghi "Đúng/Sai" | I.15 nguồn ghi nhầm đơn vị, JSON đã dùng 0,1935 g chuẩn; I.14 hình khó phân biệt điểm | `de11-exam.png`, `de11-terse-explanation.png` |
| **Đề 12** | `de12.json` | 100% OK | 6/6 đạt: `67,2`, `8`, `7`, `77,8`, `8,15`, `7` | Câu 21 (II.3) thiếu đồ thị cả đề lẫn giải (Trưởng phòng chốt vẽ thêm) | Phần I `i-01`..`i-04`, Phần II `ii-01`, `ii-02` có nhiều ý trần | `i-10` render $(21+23+30+26/4)$; `ii-03` lộ $t_{nc}$; II.2 nguồn in lẫn đáp án vào đề | `de12-exam.png`, `de12-exam-q21.png`, `de12-report-q10.png`, `de12-report-q21.png`, `de12-terse-explanation.png` |
| **Đề 13** | `de13.json` | 100% OK | 6/6 đạt: `0,75`, `247`, `5`, `6156`, `1375`, `4114` | Khớp nguồn | Phần I `i-01`..`i-04`, Phần II `ii-01` lời giải sơ sài | Phân số `i-18`, `ii-02`, `ii-04`, `iii-05` mất nhóm ngoặc; II.1c câu chữ chưa khớp | `de13-exam.png`, `de13-exam-q18.png`, `de13-report-q18.png`, `de13-terse-explanation.png` |
| **Đề 14** | `de14.json` | 100% OK | 6/6 đạt: `200`, `73,1`, `0,67`, `1,06`, `138`, `6` | Khớp nguồn | Phần I `i-01`..`i-05`, Phần II `ii-01` lời giải sơ sài | `i-17` lộ `80\%`; `ii-02` lặp từ "là là"; `iii-04` phân số mất nhóm ngoặc | `de14-exam.png`, `de14-exam-q17.png`, `de14-terse-explanation.png` |
| **Đề 15** | `de15.json` | 100% OK | 6/6 đạt: `20`, `57`, `0,7`, `800`, `118`, `10` | Khớp nguồn | Phần I `i-01`..`i-06`, Phần II `ii-01` có nhiều ý trần | `i-08` giải sai vật lí (CX-C06); `i-16` lỗi "ống thử tình"; `ii-01` lỗi "chuyển đông nhiệt" | `de15-exam.png`, `de15-exam-q16.png`, `de15-exam-q19.png`, `de15-report-q8.png`, `de15-report-q18.png`, `de15-terse-explanation.png` |
| **Đề 16** | `de16.json` | 100% OK | 6/6 đạt: `70`, `327`, `116`, `1,75`, `0,8`, `126` | Khớp nguồn | Phần I `i-01`..`i-06` chỉ có đáp án trần | `i-06` bảng Markdown vỡ giao diện (CX-C05); `i-13`, `i-14`, `i-17`, `ii-04` phân số mất nhóm | `de16-exam.png`, `de16-exam-q6.png`, `de16-terse-explanation.png` |
| **Đề 17** | `de17.json` | 100% OK | 6/6 đạt: `117`, `6`, `176`, `4,75`, `702`, `58` | Khớp nguồn | Phần I `i-01`..`i-04` chỉ có đáp án trần | `i-13` bảng Markdown vỡ giao diện (CX-C05); `i-03` lỗi "thang do Kelvin"; `i-18` lộ `80\%` | `de17-exam.png`, `de17-exam-q13.png`, `de17-exam-q18.png`, `de17-report-q22.png`, `de17-terse-explanation.png` |
| **Đề 18** | `de18.json` | 100% OK | 6/6 đạt: `300`, `696`, `89,9`, `4192`, `1544`, `871` | Câu 24 (III.2) nguồn thiếu hình (Trưởng phòng chốt ghi bằng lời) | Phần I `i-01`..`i-05` chỉ có đáp án trần | `iii-02` chứa mã Form Feed ASCII 0x0C (CX-C04); `i-17` nguồn tính nhầm trung gian | `de18-exam.png`, `de18-report-q24.png`, `de18-terse-explanation.png` |
| **Đề 19** | `de19.json` | 100% OK | 6/6 đạt: `4`, `3450`, `616`, `4,23`, `1,35`, `549` | Giữ nguyên theo quyết định Nhóm 3 của Trưởng phòng | Phần I `i-01`..`i-06` chỉ có đáp án trần | `i-03` phương án B và C trùng nội dung $\Delta U = A$ ($A < 0$); `i-15` câu chữ B và C chưa tách bạch | `de19-exam.png`, `de19-terse-explanation.png` |
| **Đề 20** | `de20.json` | 100% OK | 6/6 đạt: `0,5`, `2,58`, `9`, `19`, `30`, `300` | Câu 11 nguồn thiếu số, Trưởng phòng chốt sửa thành 5°C | Phần I `i-01`..`i-05` chỉ có đáp án trần | `i-04` lỗi chính tả "sau đầy", "biết đổi", "thể tích vãn" (CX-C07); `iii-06` phân số mất nhóm | `de20-exam.png`, `de20-exam-q4.png`, `de20-terse-explanation.png` |
| **Đề 21** | `de21.json` | 100% OK | 6/6 đạt: `-46`, `1,5`, `27`, `0,45`, `13`, `35` | Câu 10 Trưởng phòng chốt sửa đề "tăng thêm 27°C", giữ key A | Phần I `i-01`..`i-05` chỉ có đáp án trần | `ii-04.d` dùng nhầm $p_1$ thay vì $p_4$ (CX-C08); `i-18` phân số mất nhóm ngoặc | `de21-exam.png`, `de21-report-q22.png`, `de21-terse-explanation.png` |
| **Đề 22** | `de22.json` | 100% OK | 6/6 đạt: `208`, `50`, `4`, `23`, `19`, `2,5` | Câu 11 nguồn thiếu hình vẽ (Trưởng phòng chốt vẽ đường đẳng nhiệt) | Phần I `i-01`..`i-06` chỉ có đáp án trần | `iii-01`, `iii-06` phân số mất nhóm ngoặc | `de22-exam.png`, `de22-exam-q11.png`, `de22-report-q1.png`, `de22-terse-explanation.png` |
| **Đề 23** | `de23.json` | 100% OK | 6/6 đạt: `70`, `227`, `0,75`, `2`, `135`, `4,5` | Câu 10 đổi key sang A theo `answer_overrides.json` | Phần I `i-01`..`i-06` chỉ có đáp án trần | `i-04` nguồn in lẫn thể tích với áp suất; `ii-03`, `ii-04` phân số mất nhóm | `de23-exam.png`, `de23-exam-q4.png`, `de23-terse-explanation.png` |
| **Đề 24** | `de24.json` | 100% OK | 6/6 đạt: `0,29`, `0,15`, `5,43`, `632`, `450`, `17,8` | Giữ nguyên theo quyết định Nhóm 3 của Trưởng phòng | Phần I `i-01`..`i-05` chỉ có đáp án trần | `i-08` phương án C diễn đạt lẫn độ cao với nhiệt độ; `ii-21` tỉ số ngược | `de24-exam.png`, `de24-report-q17.png`, `de24-terse-explanation.png` |
| **Đề 25** | `de25.json` | 100% OK | 6/6 đạt: `72`, `962`, `1050`, `27`, `301`, `19` | Câu 3 đổi sang key B; Câu 19 ý c đổi sang Sai theo overrides | Phần I `i-01`..`i-06` chỉ có đáp án trần | Lỗi chính tả "600 g dồng", "cứng thỉ", "nhiệt đột", "là là" (CX-C07); `i-04` B và D trùng | `de25-exam.png`, `de25-exam-q10.png`, `de25-exam-q15.png`, `de25-exam-q19.png`, `de25-exam-q21.png`, `de25-terse-explanation.png` |

---

## 6. Lệnh và kết quả đo thực tế

Toàn bộ các lệnh dưới đây được chạy từ thư mục gốc `D:\Cunata` trên PowerShell:

| Lệnh thực thi | Exit Code | Kết quả thực đo (Pass / Fail / Skip) | File log / Artifact ghi nhận |
|---|---:|---|---|
| `git rev-parse HEAD` | 0 | `e7d8f85c99f28fef83d37187a2101e15be100d7b` | Snapshot phiên làm việc |
| `Get-FileHash dist/index.html, dist/app/main.js` | 0 | Đúng mã SHA-256 như mục 1.2 | `ops/blitz/content/start-dist-sha256.json` |
| `node --test ops/blitz/content/proposed.test.mjs` | 1 | **18 pass, 24 fail, 0 skip** (tổng 42 ca kiểm thử) | `ops/blitz/content/proposed-test.log`, `proposed-test.exit.txt` |
| `node ops/blitz/content/inventory.mjs` | 0 | Quét 16 đề, trích xuất cấu trúc 448 câu hỏi | `ops/blitz/content/inventory.json` |
| `node ops/blitz/content/browser-audit.mjs` | 0 | Khảo sát 16 đề qua Chrome headless; kiểm tra ảnh | `ops/blitz/content/browser-results.json`, `browser-audit.log` |
| `node ops/blitz/content/finish-focused.mjs` | 0 | Chụp ảnh màn hình các câu hỏi và báo cáo nghi vấn | 58 file PNG trong `ops/blitz/content/*.png`, `focused-results.json` |
| `node ops/blitz/content/analyze.mjs` | 0 | Phân tích và nhóm các lỗi render, bảng Markdown, ký tự lạ | `ops/blitz/content/candidates.json`, `candidates.log` |

*Ghi chú về bộ test `proposed.test.mjs`:*
- 18 ca **XANH** (PASS) xác nhận: phạm vi harness `/Cunata/`, tính toàn vẹn 28 câu/đề, tính đồng nhất giữa public và dist, tuân thủ định dạng D01 cho Phần III (tối đa 4 ký tự `0-9,-,`), và đáp án đính chính theo `answer_overrides.json` được giữ vững.
- 24 ca **ĐỎ** (FAIL) đại diện cho 9 nhóm finding đã xác minh (16 ca test đỏ cho CX-C01 trên từng đề, và 8 ca test đỏ cho CX-C02 đến CX-C09). Các ca này hiện đỏ trên bản dist/JSON hiện tại và được thiết kế để chuyển sang **XANH** khi các lỗi nội dung và lỗi render được khắc phục đúng hợp đồng.

---

## 7. Giới hạn kiểm định (NOT_RUN) và kiến nghị xử lý

### 7.1 Các giới hạn chưa kiểm tra trong lượt này (NOT_RUN)
1. **Kiểm thử trên thiết bị di động vật lí thật:** Lượt kiểm tra này thực hiện trên Chrome headless qua CDP trên máy tính Windows. Trải nghiệm vuốt chạm thực tế, phóng to ảnh trên màn hình nhỏ và nhập liệu bàn phím ảo di động: **NOT_RUN** (cần thiết bị thật).
2. **Kiểm thử mạng ngoài / Google Apps Script thật:** Theo đúng quy tắc an toàn, không gọi Google Sheet thật của Trưởng phòng; chỉ kiểm tra qua harness giả lập nội bộ loopback.

### 7.2 Danh sách câu hỏi cần quyết định nghiệp vụ (NEED_DECISION)
- **NEED_DECISION 01 (Vẽ bổ sung đồ thị thiếu):** Đề 12 Câu 21 và Đề 22 Câu 11 thiếu đồ thị trong nguồn PDF. Trưởng phòng đã duyệt hướng vẽ bổ sung đồ thị (Đề 12 vẽ cả chất A và B; Đề 22 vẽ đường đẳng nhiệt). Cần giao worker đồ họa tạo 2 file ảnh PNG này và đưa vào thư mục assets của đề tương ứng.
- **NEED_DECISION 02 (Đợt biên tập bổ sung lời giải chi tiết theo D08):** Toàn bộ 16 đề đều có số lượng lớn câu hỏi Phần I và Phần II chỉ có đáp án trần. Đề xuất:
  - *Phương án A (Khuyến nghị):* Mở một task biên tập nội dung độc lập (`task_id: CX-content-fix`), tập trung viết bổ sung phần `explanation` chuẩn kiến thức và phương pháp giải cho các câu này, giữ nguyên cấu trúc đề và key.
  - *Phương án B:* Tạm phát hành bản hiện tại cho học sinh thử nghiệm nội bộ, ghi rõ cảnh báo "lời giải chi tiết đang được cập nhật", sau đó bổ sung dần theo từng đợt 4 đề.
  - *Phương án C:* Chỉ bổ sung lời giải chi tiết cho 4 đề đầu tiên (Đề 10–13), các đề sau bổ sung trong giai đoạn hoàn thiện ngân hàng đề.

### 7.3 Gợi ý cải tiến kỹ thuật (Không tính là lỗi)
1. **Renderer phân số (`renderMathText`):** Cần nâng cấp hàm chuyển đổi công thức toán học để tự động bọc ngoặc đơn cho tử số và mẫu số khi biểu thức chứa toán tử nhị phân cộng/trừ, tránh lỗi hiểu sai toán học như câu I.10 Đề 12.
2. **Bộ kết xuất bảng Markdown:** Nên thêm khoảng 15–20 dòng mã vào `renderMathText` để nhận diện các khối bảng Markdown `| ... |` và chuyển thành bảng HTML chuẩn, giúp học sinh dễ dàng tra cứu dữ liệu thực nghiệm.
3. **Chuẩn hóa ghép lời giải Phần II:** Trong `src/app/legacy.ts` và `src/report/view.ts`, nên ghép các ý bằng cấu trúc đối tượng hoặc khối phân đoạn an toàn thay vì ghép chuỗi chứa thẻ HTML `<br>` và `<strong>` thô rồi để bị hàm `escapeHtml` biến thành `&lt;...&gt;`.
