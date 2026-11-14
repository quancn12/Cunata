# Cunata — Nền Tảng Web Luyện Đề Thi THPT (Chương Trình GDPT 2018)

Cunata là nền tảng web luyện đề và kiểm tra trực tuyến dành cho học sinh THPT (lớp 10–12) theo định hướng chương trình GDPT 2018 của Bộ Giáo dục & Đào tạo. 

Dự án chú trọng tính chuẩn xác tuyệt đối trong quy tắc chấm điểm 3 phần của GDPT 2018, bảo toàn ký tự và xử lý số học phân số chính xác (BigInt Rational), giao diện tiếng Việt thân thiện, hỗ trợ thiết bị di động, tự động lưu và làm việc ngoại tuyến (offline).

---

## 1. Yêu Cầu Hệ Thống & Cài Đặt

- **Node.js**: Phiên bản `>= 24.0.0` (khuyên dùng Node v24.14.0+ để hỗ trợ native type stripping cho TypeScript).
- **Trình duyệt**: Bất kỳ trình duyệt web hiện đại nào (Chrome, Edge, Firefox, Safari) hỗ trợ HTML5 và ECMAScript 2022+.
- **Zero-Install**: Không cần chạy `npm install` hay tải thêm thư viện bên thứ ba khi chạy bản phát hành.

---

## 2. Lệnh Build & Xác Minh Hệ Thống

### 2.1. Đóng gói module và kiểm tra tài nguyên hệ thống
Lệnh một bước xác minh toàn bộ tài nguyên frontend, kiểm tra schema đề thi mẫu, và thực thi quy trình build module ES2022 theo cơ chế staged dist:
```bash
node scripts/build.js
```
Hoặc gọi trực tiếp pipeline build web module:
```bash
node scripts/web-build.ts
```

### 2.2. Kiểm tra kiểu tĩnh (Typecheck)
Kiểm tra type safety với TypeScript cho domain, composition root, router và web harness:
```bash
npx --no-install tsc -p tsconfig.json
npx --no-install tsc -p tsconfig.web.json
```

### 2.3. Chạy toàn bộ Test Suite
Chạy toàn bộ test suite unit, domain, acceptance, oracle và E2E tests:
```bash
npm test
```
hoặc chạy kiểm thử riêng theo từng phân vùng:
```bash
node --test "test/glue/wave2/**/*.test.ts"
node --test "test/glue/wave1/**/*.test.ts"
node --test "test/e2e/demoFlow.test.ts"
node --test "test/schema/**/*.test.ts"
```
> [!NOTE]
> Các bài kiểm thử E2E hiện tại chạy trên môi trường Node VM với DOM/storage/fetch stubs. Kiểm thử trên trình duyệt đồ họa thật (Chromium/Firefox/WebKit), kiểm thử bộ gõ OS IME (Telex/VNI) thật và CORS live với Google hiện được đánh dấu trung thực là `NOT_RUN` trong báo cáo kỹ thuật.

### 2.4. Trải nghiệm bản build module độc lập (`dist/`)
Sau khi chạy build, bạn có thể khởi chạy server cục bộ để kiểm tra bản phát hành module hóa:
```bash
python -m http.server 8000 --directory dist
```
Truy cập: `http://localhost:8000/` (hỗ trợ đầy đủ đường dẫn relative và subpath GitHub Pages `/Cunata/`).

---

## 3. Hướng Dẫn Mở & Trải Nghiệm Bản Web Demo

Bản demo giao diện người dùng hoàn chỉnh nằm tại `index.html`. Bạn có thể mở theo một trong hai cách sau:

### Cách 1: Mở trực tiếp trong trình duyệt (Nhanh nhất)
- **Trên Windows PowerShell**:
  ```powershell
  Start-Process index.html
  ```
- Hoặc nhấp đúp (Double-click) chuột vào file `index.html` trong thư mục dự án.

### Cách 2: Khởi chạy qua Local Web Server
Khởi tạo một web server cục bộ qua Python hoặc Node để tải tài nguyên qua giao thức HTTP chuẩn:
- **Dùng Python**:
  ```bash
  python -m http.server 8000
  ```
  Sau đó mở trình duyệt truy cập: `http://localhost:8000`

- **Dùng Node / npx**:
  ```bash
  npx serve .
  ```

---

## 4. Cấu Trúc Đề Mẫu Chuẩn (`public/sample-exam.json`)

Đề mẫu khảo sát năng lực Toán 12 gồm 8 câu hỏi mẫu, mô phỏng đầy đủ 3 phần của cấu trúc định dạng đề thi GDPT 2018:

1. **Phần I — Trắc nghiệm nhiều lựa chọn (4 câu)**:
   - Câu 1: Khảo sát hàm số & bảng biến thiên (có hình SVG minh họa `public/q01-bbt.svg`).
   - Câu 2: Tích phân & tính chất cơ bản.
   - Câu 3: Tọa độ $Oxyz$ & vectơ pháp tuyến mặt phẳng.
   - Câu 4: Xác suất cổ điển (gieo xúc xắc).
   - *Điểm số*: Mỗi câu đúng nhận đúng **0,25 điểm**; sai hoặc chưa chọn nhận 0 điểm.

2. **Phần II — Trắc nghiệm Đúng / Sai (2 câu, mỗi câu 4 ý độc lập)**:
   - Câu 5: Đồ thị hàm số bậc ba, cực trị và đạo hàm.
   - Câu 6: Không gian $Oxyz$, mặt phẳng và phương trình mặt cầu đường kính $AB$.
   - *Quy tắc chấm GDPT 2018*: Điểm cả câu được tính theo số ý trả lời đúng $k \in \{0, 1, 2, 3, 4\}$ tương ứng với:
     - 0 ý đúng: **0 điểm**
     - 1 ý đúng: **0,10 điểm**
     - 2 ý đúng: **0,25 điểm**
     - 3 ý đúng: **0,50 điểm**
     - 4 ý đúng: **1,00 điểm**

3. **Phần III — Trả lời ngắn (2 câu, tối đa 4 ký tự)**:
   - Câu 7: Tìm giá trị nhỏ nhất của hàm số trên đoạn $[-1; 1]$ (Đáp án chuẩn: `-0,5`).
   - Câu 8: Ứng dụng tích phân tính vận tốc chuyển động (Đáp án chuẩn: `1,5`).
   - *Quy tắc so khớp*: So sánh chính xác từng ký tự (Exact string matching), không tự ý trim khoảng trắng, không ép kiểu số (`1,5` khác `1.5` và khác `1,50`).
   - *Công thức điểm đề tùy chỉnh*: Với $N_1 = 4, N_2 = 2, N_3 = 2$:
     - $\text{MAX}_I = 4 \times 0,25 = 1,00$
     - $\text{MAX}_{II} = 2 \times 1,00 = 2,00$
     - $\text{BASE} = 1,00 + 2,00 = 3,00 < 10 \implies \text{POINT}_{III} = (10 - 3)/2 = 3,50$
     - $\text{MAX}_{III} = 2 \times 3,50 = 7,00$
     - $\text{MAX\_TOTAL} = 1,00 + 2,00 + 7,00 = \mathbf{10,00}$ điểm.

---

## 5. Luồng Làm Bài & Nghiệm Thu Tính Năng

- **Nhập thông tin**: Thí sinh có thể nhập Tên hoặc Số báo danh (SBD).
- **Bộ đếm thời gian (Timer)**: Tự động tính thời gian làm bài dựa trên mốc thời gian thực (`deadline = startedAt + duration`), không phụ thuộc vào interval callback; tự động nộp bài khi hết giờ.
- **Bảng điều hướng (Palette)**:
  - Hiển thị đầy đủ số lượng câu hỏi của đề thi.
  - Phân loại rõ ràng trạng thái: *Đã làm* (xanh lá), *Chưa làm* (trắng), *Đang chọn* (viền xanh dương), *Đánh dấu xem lại* (viền cam).
- **Độ bền dữ liệu & Đa tab (Persistence)**:
  - Tự động lưu tiến độ vào `localStorage`.
  - Hiển thị badge trạng thái lưu trung thực (`Chưa lưu`, `Đã lưu cục bộ`, `Lỗi lưu cục bộ (bộ nhớ đầy)`).
  - Khóa bảo vệ nộp bài: Khi một tab đã nộp bài, các tab cũ hoặc thao tác autosave đến sau không thể ghi đè làm đảo ngược trạng thái `submitted: true`.
  - Cách ly phiên bản đề: Không khôi phục dữ liệu bài làm của đề khác khi mở phiên bản đề mới.
- **Thứ tự trình bày & Trộn đề (Presentation Order / Shuffle)**:
  - Hỗ trợ trộn câu hỏi (giữ nguyên phân nhóm Phần I -> II -> III) và trộn lựa chọn Phần I độc lập dựa trên thuật toán SplitMix32 + MurmurHash3.
  - Đáp án chuẩn luôn gắn liền với `optionId`, đảm bảo kết quả chấm điểm hoàn toàn bất biến dưới mọi thứ tự hiển thị.
  - Bộ trộn (`presentationOrder`) được lưu bền vững trong `studentState`, bảo đảm không bao giờ tự ý trộn lại khi học sinh tải lại trang (refresh), back/forward hoặc mất kết nối.
- **Nạp Đề Tùy Chỉnh (Custom Exam JSON Loader)**:
  - Tích hợp nút `📁 Nạp đề thi (JSON)` trên bảng điều hướng (Palette), cho phép giáo viên và học sinh tải file đề JSON trực tiếp lên ứng dụng.
  - Kiểm tra tính hợp lệ toàn diện qua `validateExamVersion` trước khi nạp; từ chối và báo lỗi chi tiết đối với đề thi sai định dạng.
  - Cách ly trạng thái bài làm và tiến độ độc lập theo từng đề thi (`examId` và `examVersionId`).
- **Nộp bài & Chấm điểm**:
  - Modal xác nhận trước khi nộp bài để tránh click nhầm.
  - Chấm điểm bằng engine phân số chính xác BigInt (`Rational`), tránh trôi sai số dấu phẩy động.
- **Báo cáo kết quả (Report View)**:
  - Bảng tổng kết điểm số tổng và điểm chi tiết từng phần I, II, III (hiển thị dạng phân số và số thập phân).
  - Chi tiết từng câu hỏi: Câu trả lời của thí sinh, đáp án đúng chuẩn, trạng thái câu, điểm đạt được và lời giải chi tiết.
  - **Chính sách công bố đáp án (`releasePolicy`)**: Khi đề thi kích hoạt chính sách `after_deadline`, đáp án chuẩn và lời giải chi tiết được ẩn hoàn toàn trước khi hết giờ làm bài; tự động công bố khi hết thời gian quy định; áp dụng đồng bộ trên cả giao diện web lẫn bản tải offline HTML.
  - Hỗ trợ in ấn và xuất PDF trực tiếp từ trình duyệt (`In / Lưu Báo Cáo (PDF)`).
  - **Tải báo cáo ngoại tuyến (`Tải Báo Cáo Offline (.html)`)**: Xuất toàn bộ kết quả, lời giải chi tiết, bảng điểm và hình ảnh minh họa (được đóng gói dạng data URI tự chứa) thành file HTML độc lập có thể lưu trữ và mở xem lại bất kỳ lúc nào mà không cần kết nối mạng hay phụ thuộc thư mục lưu trữ.
- **Lịch Sử Lượt Thi & Cấu Hình Giáo Viên (Attempt History & Teacher Settings)**:
  - Tự động lưu trữ lịch sử các lượt làm bài của từng đề thi theo chuẩn cô lập ID (`cunata:history:<examId>:<version>`).
  - Hiển thị bảng tổng hợp lịch sử các lượt thi (mã lượt thi, thời gian nộp, tên thí sinh, điểm từng phần I, II, III, tổng điểm đạt được và trạng thái máy chủ) trên cả giao diện báo cáo web và bản tải ngoại tuyến HTML, với nhãn đánh dấu trực quan lượt thi hiện tại.
  - Hỗ trợ cấu hình giáo viên (`settings`): `maxAttempts` (giới hạn số lượt làm bài, tự động khóa nút làm lại và hiển thị cảnh báo khi học sinh đã đạt hạn mức), `durationMinutes` (thời lượng làm bài tùy chỉnh linh hoạt), `releasePolicy` (`immediate` hoặc `after_deadline`).
- **Bộ Soạn Đề Thi Tùy Chỉnh (Teacher Exam Builder)**:
  - Tích hợp công cụ soạn đề trực quan ngay trên trình duyệt (`🛠 Soạn đề thi mới` trên Palette), hoạt động 100% client-side không cần backend.
  - Cho phép bật/tắt độc lập 3 phần thi (Phần I trắc nghiệm 4 lựa chọn, Phần II đúng/sai 4 ý, Phần III trả lời ngắn $\le 4$ ký tự) hoặc kết hợp linh hoạt.
  - Tự động tính toán điểm tối đa từng phần ($\text{MAX}_I, \text{MAX}_{II}, \text{POINT}_{III}, \text{MAX}_{III}$) và tổng điểm $\text{MAX\_TOTAL}$ theo đúng công thức chuẩn của `computeExamMax`.
  - Cấu hình nâng cao: mã đề, phiên bản, môn học, khối lớp (10–12), thời gian thi, số lượt tối đa, chính sách công bố đáp án và tùy chọn trộn đề độc lập.
  - Hỗ trợ chỉnh sửa câu hỏi trực quan (`✏ Sửa`): cho phép giáo viên chỉnh sửa tiêu đề, môn học (`Môn học`), khối lớp (10–12), nội dung câu hỏi (hỗ trợ công thức LaTeX), các lựa chọn A/B/C/D và đáp án đúng (Phần I), 4 mệnh đề đúng/sai (Phần II), đáp án chuẩn tối đa 4 ký tự có kiểm tra quy chuẩn `checkShortAnswer` (Phần III), lời giải chi tiết, đầy đủ phân cấp chuyên môn (Chủ đề / Chương `topic`, Bài học `lesson`) và mức độ nhận thức (`difficulty`).
  - Di chuyển thứ tự câu hỏi linh hoạt (`▲ Lên` / `▼ Xuống`) và nhân bản nhanh câu hỏi (`📑 Bản sao`) với tự động tạo định danh câu hỏi và lựa chọn duy nhất.
  - Hỗ trợ tải đề thi có sẵn từ file JSON (`📥 Nạp đề từ file`) với kiểm tra tính hợp lệ toàn diện qua `validateExamVersion` trước khi nạp vào bộ soạn.
  - Kiểm tra tính hợp lệ toàn diện trước khi xuất file JSON (`💾 Tải file JSON`) hoặc trực tiếp nạp vào phòng thi (`🚀 Nạp vào phòng thi ngay`) để thử nghiệm.
- **Ngân Hàng Câu Hỏi Tái Sử Dụng (Question Bank)**:
  - Lưu trữ câu hỏi bền vững trong `localStorage` (`📚 Ngân hàng câu hỏi`), phân loại theo phân cấp 5 tầng chuẩn GDPT 2018 (Shared §5): Môn học (`subject`) > Khối lớp (10–12) > Chủ đề / Chương (`topic`) > Bài học (`lesson`) > Mức độ nhận thức (`difficulty`: Nhận biết / Thông hiểu / Vận dụng).
  - Tìm kiếm câu hỏi thời gian thực theo từ khóa (`🔍 Tìm kiếm câu hỏi...`) quét qua tiêu đề, nội dung đề bài, lời giải, chủ đề, bài học và mã câu hỏi.
  - Bộ lọc đa tiêu chí linh hoạt kết hợp đồng thời giữa Phần thi (Phần I, II, III, Tất cả), Môn học (`Mọi môn`, `Toán học`, `Vật lí`, `Hóa học`...), Khối lớp (`Mọi khối lớp`, `Lớp 10`, `Lớp 11`, `Lớp 12`), Chủ đề / Chương (`bankTopicFilter` tự động trích xuất các chủ đề hiện có trong ngân hàng: Khảo sát hàm số, Nguyên hàm & Tích phân, Hình học Oxyz, Xác suất...), Bài học (`bankLessonFilter` tự động trích xuất các bài học hiện có: Sự đồng biến/nghịch biến, Cực trị, Tích phân, Mặt phẳng, Mặt cầu...) và Mức độ nhận thức (`Nhận biết` / `Thông hiểu` / `Vận dụng`).
  - Cho phép lưu câu hỏi từ đề đang soạn vào ngân hàng (`💾 Lưu Bank`) hoặc chọn câu hỏi từ ngân hàng đưa vào đề thi (`+ Thêm vào đề`) với cập nhật tức thời cấu trúc điểm số và cơ chế tự động khử trùng ID (`-bk-<suffix>`) bảo vệ đề thi khỏi lỗi `ID_DUPLICATE`.
  - Hỗ trợ xem trước trực quan nội dung câu hỏi, nhãn phân loại (môn học, khối lớp, chủ đề, bài học, mức độ) và đáp án chuẩn ngay trên thẻ câu hỏi ngân hàng.
  - Nạp câu hỏi từ file JSON (`📥 Nạp từ JSON`), hỗ trợ cả định dạng danh sách câu hỏi xuất từ ngân hàng hoặc file đề thi đầy đủ; khôi phục câu hỏi mẫu (`Khôi phục câu mẫu`), xuất toàn bộ ngân hàng (`Xuất ngân hàng (JSON)`) và làm trống ngân hàng (`🗑 Xóa toàn bộ`) an toàn.
  - **Bảo toàn tính độc lập của lượt thi (Shared §5 Invariant)**: Mọi thao tác chỉnh sửa, cập nhật hay xóa câu hỏi trong ngân hàng câu hỏi hoặc bộ soạn sau khi đề thi đã phát hành tuyệt đối không làm ảnh hưởng hay thay đổi tiến trình làm bài, điểm số hay báo cáo đã nộp của thí sinh.

---

## 6. Tiếp Nhận Kết Quả Qua Google Sheets (Apps Script Collector — Bản Tham Khảo Chưa Triển Khai)

> [!WARNING]
> Bản mẫu `apps-script/Code.js` là thiết kế kỹ thuật tham khảo, **hiện chưa được triển khai lên Google Cloud / production** và **chưa được nghiệm thu CORS / preflight thật** từ trình duyệt tới máy chủ Google (xem Hợp đồng kỹ thuật §7 và quyết định D04). Chế độ mặc định của ứng dụng là làm bài và xuất kết quả cục bộ (local-first).

Nhằm phục vụ giáo viên và chủ dự án thu thập kết quả thi trực tuyến chi phí 0 đồng, thư mục `apps-script/` cung cấp giải pháp Backend Web App Google Apps Script tích hợp chặt chẽ với Google Sheets:

1. **Phòng chống Tiêm Công Thức Bảng Tính (CWE-1236 Formula Injection)**:
   - Tự động thêm tiền tố nháy đơn (`'`) vào trước các ô có ký tự kích hoạt công thức nguy hiểm (`=`, `+`, `-`, `@`, tab, xuống dòng, ký tự fullwidth).
   - Bảo toàn chuỗi số âm Phần III (`-0,5`), ngăn Google Sheets tính toán sai lệch hay tự động đổi dấu.

2. **Chống Ghi Trùng & Tính Lũy Nghiệm (Idempotency)**:
   - Dựa trên khóa `attempt_id` bất biến. Khi mạng chập chờn hoặc học sinh bấm nộp lại nhiều lần, server nhận diện và trả về biên nhận trước đó (`ALREADY_RECORDED`) mà không tạo thêm dòng trùng.

3. **Kiểm Soát Tranh Chấp Bằng `LockService`**:
   - Sử dụng ScriptLock chờ tối đa 30s để đồng bộ hóa việc ghi hàng, bảo vệ tính toàn vẹn dữ liệu khi nhiều học sinh nộp bài đồng thời.

4. **Đồng Bộ Ngoại Tuyến & Trạng Thái Server Confirmed**:
   - Khi cấu hình endpoint collector (`window.CUNATA_COLLECTOR_URL` hoặc trong đề thi), client tự động gửi kết quả sau khi nộp và lưu cục bộ.
   - Khi server xác nhận thành công, trạng thái chuyển sang `Đã ghi nhận trên máy chủ` và biên nhận được lưu trữ an toàn trong báo cáo. Nếu mất mạng hoặc server bận, bài làm vẫn được bảo vệ nguyên vẹn ở trạng thái cục bộ (`Đã nộp & lưu cục bộ`).
