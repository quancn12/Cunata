# Cunata — Nền Tảng Web Luyện Đề Thi THPT (Chương Trình GDPT 2018)

Cunata là nền tảng web luyện đề và kiểm tra trực tuyến dành cho học sinh THPT (lớp 10–12) theo định hướng chương trình GDPT 2018 của Bộ Giáo dục & Đào tạo.

Dự án chú trọng tính chuẩn xác tuyệt đối trong quy tắc chấm điểm 3 phần của GDPT 2018, bảo toàn ký tự và xử lý số học phân số chính xác (BigInt Rational), giao diện tiếng Việt thân thiện, hỗ trợ thiết bị di động, tự động lưu và làm việc ngoại tuyến (offline).

---

## 1. Yêu Cầu Hệ Thống & Cài Đặt

- **Node.js**: Phiên bản `>= 24.0.0` (khuyên dùng Node v24.14.0+ để hỗ trợ native type stripping cho TypeScript, cú pháp ESM và Node Test Runner `node:test`).
- **Trình duyệt**: Bất kỳ trình duyệt web hiện đại nào (Chrome, Edge, Firefox, Safari) hỗ trợ HTML5 và ECMAScript 2022+.
- **Zero-Install (Không Cần Cài Đặt)**: Kiến trúc hệ thống hoạt động hoàn toàn không cần chạy `npm install` hay tải thêm bất kỳ thư viện bên thứ ba nào khi chạy bản phát hành. Trình biên dịch TypeScript cục bộ được sử dụng trực tiếp qua `npx --no-install tsc`.

---

## 2. Lệnh Build & Xác Minh Hệ Thống

### 2.1. Đóng gói module và kiểm tra tài nguyên hệ thống
Lệnh một bước xác minh toàn bộ tài nguyên frontend, kiểm tra cú pháp Apps Script, schema đề thi mẫu, và thực thi quy trình build module ES2022 theo cơ chế staged dist:
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
node --test "test/docs/**/*.test.ts"
node --test test/acceptance/webParity.test.ts
node --test "test/glue/wave4/**/*.test.ts"
node --test "test/browser/**/*.test.ts"
node --test "test/e2e/demoFlow.test.ts"
node --test "test/schema/**/*.test.ts"
```
> [!NOTE]
> Phân vùng `test/browser/**/*.test.ts` chạy kiểm thử tự động trên Chrome thật (`--headless=new`) qua giao thức Chrome DevTools Protocol (CDP) gốc không phụ thuộc bên ngoài. Kiểm thử bộ gõ OS IME (Telex/VNI) thật từ phần cứng hệ điều hành và CORS live với Google hiện được đánh dấu trung thực là `NOT_RUN` / `MANUAL_CHECKLIST` theo tài liệu `docs/web/QA-evidence.md`.

### 2.4. Trải nghiệm bản build module độc lập (`dist/`)
Sau khi chạy build, bạn có thể khởi chạy server cục bộ để kiểm tra bản phát hành module hóa:
```bash
python -m http.server 8000 --directory dist
```
Truy cập: `http://localhost:8000/` (hỗ trợ đầy đủ đường dẫn relative và subpath GitHub Pages `/Cunata/`).

---

## 3. Hướng Dẫn Mở & Trải Nghiệm Bản Web Demo

Bản demo giao diện người dùng hoàn chỉnh nằm tại `index.html`. Bạn có thể mở theo một trong hai cách sau:

### Cách 1: Mở trực tiếp trong trình duyệt (Nhanh nhất — Direct Root Demo)
- **Trên Windows PowerShell**:
  ```powershell
  Start-Process index.html
  ```
- Hoặc nhấp đúp (Double-click) chuột vào file `index.html` trong thư mục dự án.
- Bản demo gốc tại `index.html` được thiết kế tự chứa hoàn toàn (self-contained), có thể mở trực tiếp qua giao thức `file://` mà không gặp lỗi CORS của trình duyệt đối với ES modules.

### Cách 2: Khởi chạy qua Local Web Server (HTTP Dist & Subpath)
Khởi tạo một web server cục bộ qua Python hoặc Node để tải tài nguyên qua giao thức HTTP chuẩn:
- **Dùng Python phục vụ thư mục `dist/`**:
  ```bash
  python -m http.server 8000 --directory dist
  ```
  Sau đó mở trình duyệt truy cập: `http://localhost:8000/`
- **Dùng Python phục vụ thư mục gốc dự án**:
  ```bash
  python -m http.server 8000
  ```
  Sau đó mở trình duyệt truy cập: `http://localhost:8000/` hoặc `http://localhost:8000/dist/`
- Hệ thống hỗ trợ hoàn hảo cả root path `/` lẫn subpath GitHub Pages `/Cunata/`.

---

## 4. Lưu Trữ Ngoại Tuyến & Bộ Nhớ Đệm Lần Đầu (First-Online Cache Limitation)

Ứng dụng tích hợp Service Worker hiện đại (`src/offline/service-worker.ts`) để hỗ trợ làm bài ngoại tuyến (offline-first):

- **Yêu cầu kết nối lần đầu (First-Online Cache)**: Để có thể hoạt động hoàn toàn ngoại tuyến khi mất mạng, người dùng **bắt buộc phải truy cập ứng dụng trực tuyến ít nhất một lần** qua giao thức HTTP (`localhost`) hoặc HTTPS. Trong lần truy cập đầu tiên này, Service Worker sẽ tự động tải trước và lưu vào bộ nhớ đệm (precache) toàn bộ vỏ ứng dụng (shell HTML, JS, CSS) cùng các tài nguyên đề thi mẫu.
- **Giới hạn khởi động lạnh (Cold-Start Limitation)**: Nếu người dùng chưa từng mở ứng dụng khi có kết nối mạng, trình duyệt sẽ không có sẵn bộ nhớ đệm và không thể mở trang web lần đầu khi đang mất mạng.
- **Chính sách cập nhật Service Worker**: Service Worker mới không bao giờ tự ý kích hoạt đè khi học sinh đang làm dở bài thi, tránh làm mất dữ liệu bài làm. Thông báo cập nhật phiên bản chỉ hiển thị sau khi thí sinh đã hoàn thành nộp bài.
- **Môi trường `file://`**: Trình duyệt áp dụng chính sách bảo mật không kích hoạt Service Worker trên giao thức `file://`. Vì vậy, bản demo trực tiếp `index.html` sử dụng cơ chế lưu trữ cục bộ `localStorage` / `IndexedDB` mà không phụ thuộc Service Worker.

---

## 5. Các Bộ Đề Mẫu Minh Họa (Sample Exams)

Dự án cung cấp sẵn 4 bộ đề mẫu minh họa kỹ thuật tại thư mục `public/`:

1. **`public/sample-exam.json` — Đề Khảo Sát Năng Lực Toán 12 (8 câu)**:
   - Mô phỏng đầy đủ 3 phần cấu trúc đề thi GDPT 2018 (Phần I: 4 câu, Phần II: 2 câu, Phần III: 2 câu), điểm tối đa **10,00**.
2. **`public/exams/toan-full.json` — Đề Toán 12 Toàn Diện (8 câu)**:
   - Bộ đề đầy đủ cả 3 phần thi với cấu trúc điểm số tùy chỉnh chuẩn mực.
3. **`public/exams/ly-part-I.json` — Đề Vật Lí Chỉ Có Phần I (20 câu)**:
   - 20 câu hỏi trắc nghiệm nhiều lựa chọn Phần I. Điểm tối đa: $20 \times 0,25 = \mathbf{5,00}$ điểm. Minh chứng cho tính năng bật/tắt độc lập các phần thi mà không cưỡng ép tổng điểm về 10.
4. **`public/exams/hoa-repeating.json` — Đề Hóa Học Chỉ Có Phần III (3 câu)**:
   - 3 câu hỏi trả lời ngắn Phần III. Điểm mỗi câu: $\frac{10 - 0}{3} = \frac{10}{3} \approx 3,333...$ điểm (phân số tuần hoàn). Điểm tối đa: $\mathbf{10,00}$ điểm. Minh chứng cho tính toán số học phân số chính xác BigInt Rational, không gây trôi sai số làm tròn.

> [!IMPORTANT]
> **Tuyên bố minh bạch**: Các bộ đề trên là **đề tùy chỉnh minh họa kỹ thuật**, được kiểm tra tính hợp lệ qua `validateExamVersion`. Chúng **KHÔNG phải là đề thi chuẩn chính thức của Bộ Giáo dục & Đào tạo**. Chế độ đề mẫu chuẩn THPT theo từng năm và văn bản chính thức của Bộ hiện đang ở trạng thái chờ Trưởng phòng phê duyệt quyết định D05.

### Bất Biến Chấm Điểm 3 Phần Của GDPT 2018:
- **Phần I (Trắc nghiệm 4 lựa chọn A/B/C/D)**: Đúng 1 lựa chọn nhận **0,25 điểm**; sai hoặc chưa chọn nhận 0 điểm.
- **Phần II (Trắc nghiệm Đúng / Sai, 4 ý độc lập)**: Chấm theo số ý trả lời đúng $k \in \{0, 1, 2, 3, 4\}$ cho cả câu:
  - 0 ý đúng: **0 điểm** | 1 ý đúng: **0,10 điểm** | 2 ý đúng: **0,25 điểm** | 3 ý đúng: **0,50 điểm** | 4 ý đúng: **1,00 điểm**.
  - Ý bỏ trống không được coi là đúng; không tự động coi thiếu là False.
- **Phần III (Trả lời ngắn, tối đa 4 ký tự)**:
  - Chuỗi tối đa 4 ký tự, hỗ trợ chữ số `0-9`, dấu âm `-`, dấu phẩy thập phân `,` (ví dụ: `-0,5`, `1,5`).
  - **So sánh chính xác từng ký tự (Exact String Matching)**: Không tự ý trim khoảng trắng, không ép kiểu số (`1,5` khác `1.5` và khác `1,50`).

---

## 6. Luồng Thao Tác, Báo Cáo & Xuất Dữ Liệu

- **Nhập thông tin thí sinh**: Học sinh có thể nhập Họ tên hoặc Số báo danh (SBD).
- **Đếm thời gian & Autosubmit**: Đồng hồ đếm thời gian dựa trên mốc thời gian thực (`deadline = startedAt + duration`), tự động nộp bài khi hết giờ kể cả khi chuyển tab hoặc tải lại trang.
- **Bảng điều hướng câu hỏi (Palette)**: Phân loại trực quan: *Đã làm* (xanh lá), *Chưa làm* (trắng), *Đang chọn* (viền xanh), *Đánh dấu xem lại* (viền cam).
- **Trộn đề độc lập (Shuffle)**: Trộn câu hỏi và trộn lựa chọn Phần I độc lập dựa trên thuật toán SplitMix32 + MurmurHash3. Thứ tự trộn được lưu bền vững vào lượt làm bài, không bị xáo trộn lại khi tải lại trang.
- **Xác nhận nộp bài có bẫy focus (Accessible Submit Modal)**: Modal xác nhận nộp bài tuân thủ tiêu chuẩn tiếp cận WCAG (bẫy phím Tab/Shift+Tab, phím Escape đóng modal, tự động hoàn trả tiêu điểm focus về nút bấm ban đầu).
- **Báo cáo kết quả chi tiết (Report View)**:
  - Bảng tổng kết điểm đạt được / tối đa cho cả bài thi và riêng từng phần I, II, III (hiển thị cả dạng phân số chính xác và số thập phân).
  - Chi tiết từng câu: câu trả lời của thí sinh, đáp án chuẩn, trạng thái đúng/sai/chưa làm, điểm nhận được và lời giải chi tiết.
  - **Chính sách công bố đáp án (`releasePolicy`)**: Khi đề thi đặt cấu hình `after_deadline`, toàn bộ đáp án chuẩn và lời giải chi tiết được ẩn hoàn toàn trước khi hết giờ làm bài; tự động công bố khi hết thời hạn quy định.
- **In ấn & Xuất báo cáo (Print / Export)**:
  - **In / Lưu PDF (`window.print()`)**: Tích hợp CSS in ấn chuyên dụng, tối ưu bố cục trang in rõ nét.
  - **Tải báo cáo ngoại tuyến (`.html`)**: Xuất toàn bộ kết quả, bảng điểm, lời giải và hình ảnh minh họa (được đóng gói dạng Base64 data URI tự chứa) thành file HTML độc lập có thể lưu trữ và mở xem bất kỳ lúc nào mà không cần kết nối mạng.
  - **Xuất dữ liệu lượt thi (Export JSON / CSV)**: Cho phép xuất kết quả ra định dạng JSON chuẩn `web-result-v1` hoặc file CSV chuẩn RFC 4180 có cơ chế phòng chống tiêm công thức bảng tính (CWE-1236 Formula Injection Protection).

---

## 7. Soạn Đề, Ngân Hàng Câu Hỏi & Quản Trị Dữ Liệu

### 7.1. Bộ Soạn Đề Thi Tùy Chỉnh (Teacher Exam Builder)
- Tích hợp công cụ soạn đề trực quan ngay trên trình duyệt (`🛠 Soạn đề thi mới` trên Palette), hoạt động 100% client-side không cần backend.
- Bật/tắt linh hoạt 3 phần thi, tự động tính toán điểm tối đa từng phần và tổng điểm theo công thức `computeExamMax`.
- Chỉnh sửa câu hỏi, công thức toán LaTeX, 4 lựa chọn Phần I, 4 mệnh đề Phần II, đáp án chuẩn Phần III $\le 4$ ký tự, di chuyển thứ tự và nhân bản câu hỏi nhanh chóng.
- Nạp đề thi từ file JSON (`📥 Nạp đề từ file`) có kiểm tra tính hợp lệ toàn diện qua `validateExamVersion` trước khi nạp.

### 7.2. Ngân Hàng Câu Hỏi Tái Sử Dụng (Question Bank)
- Phân loại câu hỏi theo 5 tầng phân cấp chuẩn GDPT 2018: **Môn học > Khối lớp (10–12) > Chủ đề / Chương > Bài học > Mức độ nhận thức (Nhận biết / Thông hiểu / Vận dụng)**.
- Tìm kiếm theo từ khóa thời gian thực và bộ lọc đa tiêu chí đồng thời.
- Tái sử dụng câu hỏi: Thêm câu hỏi từ ngân hàng vào đề thi đang soạn với cơ chế tự động khử trùng ID (`-bk-<suffix>`), ngăn chặn triệt để lỗi trùng lặp `ID_DUPLICATE`.
- **Bất biến cách ly phiên bản (Version Immutability)**: Mọi thao tác chỉnh sửa hay xóa câu hỏi trong ngân hàng sau khi đề thi đã phát hành tuyệt đối không làm ảnh hưởng hay thay đổi tiến trình làm bài, điểm số hay báo cáo đã nộp của thí sinh.

### 7.3. Sao Lưu & Dọn Dẹp Dữ Liệu (Backup & Cleanup)
- **Sao lưu toàn diện (Export Backup)**: Cho phép xuất toàn bộ cơ sở dữ liệu (các bài thi, ngân hàng câu hỏi, lịch sử bài làm, outbox) ra file sao lưu dạng Blob/JSON để lưu trữ an toàn.
- **Phục hồi dữ liệu (Import Backup)**: Khôi phục toàn bộ trạng thái dữ liệu từ file sao lưu đã xuất trước đó.
- **Dọn dẹp an toàn (Clear All)**: Cho phép xóa sạch toàn bộ dữ liệu lưu trữ cục bộ sau khi có hộp thoại xác nhận tường minh từ người dùng (`clearAll(confirmed: true)`).

---

## 8. Nhập Đề Thi & Giới Hạn Tính Năng Trung Thực (Import DOCX / PDF)

Quy trình nhập đề thi tuân thủ nghiêm ngặt pipeline 6 giai đoạn:
`Đọc file` $\to$ `Phân tích cấu trúc (IR)` $\to$ `Xem trước (Preview)` $\to$ `Hiệu đính (Editor)` $\to$ `Xác nhận (Confirm)` $\to$ `Lưu Bank / Xuất bản`.

### 8.1. Nhập từ file Word (DOCX)
- Sử dụng trình đọc OpenXML gốc không phụ thuộc bên ngoài: bóc tách các đoạn văn (paragraphs), bảng biểu nhiều hàng/cột (table rowSpan/colSpan), hình ảnh minh họa nội bộ, và công thức toán học OMML.
- Công thức OMML được chuyển đổi sang mã LaTeX đối với các cấu trúc toán học đã được kiểm chứng; các biểu thức phức tạp chưa hỗ trợ được giữ nguyên mã nguồn kèm nhãn cảnh báo rõ ràng.
- Bắt buộc giáo viên phải xem trước (preview) và kiểm tra đáp án trước khi nhấn xác nhận nhập đề vào hệ thống.

### 8.2. Giới Hạn Kỹ Thuật Với File PDF (PDF Import Limitations)
> [!WARNING]
> **Tuyên bố minh bạch**: Trình duyệt web hiện đại không có API gốc để bóc tách luồng văn bản phức tạp, bố cục nhiều cột hay công thức toán học từ file PDF. Dự án **TUYỆT ĐỐI KHÔNG tuyên bố tính năng tự động trích xuất PDF hoàn chỉnh hay nhận dạng chữ ký tự quang học (OCR) tự động** khi chưa có quyết định D06 của Trưởng phòng.

- **Khả năng hiện tại**: Hệ thống hỗ trợ mở xem trước tài liệu PDF thông qua trình xem PDF có sẵn của trình duyệt (Native PDF Viewer), cho phép giáo viên đối chiếu trực quan và sao chép văn bản hoặc nhập thủ công nội dung vào bộ soạn biểu diễn trung gian (IR).
- **Cảnh báo minh bạch**: Các tệp PDF dạng scan hình ảnh được đánh dấu trạng thái `PDF_OCR_UNAVAILABLE`; các tệp PDF văn bản phức tạp được đánh dấu `PDF_MANUAL_REVIEW_REQUIRED` yêu cầu người dùng hiệu đính.

---

## 9. Phân Quyền, Danh Tính & Bảo Mật (Roles & Security Truthfulness)

- **Vai trò người dùng theo luồng công việc (Unauthenticated Workflow Roles)**: Phiên bản MVP hiện tại hoạt động **hoàn toàn không cần đăng nhập**. Các vai trò "Học sinh", "Giáo viên", "Quản trị viên" là các vai trò phân định theo luồng giao diện thao tác, **KHÔNG phải là ranh giới phân quyền bảo mật đã được xác thực**.
- **Thông tin thí sinh (Nickname / SBD)**: Họ tên hoặc mã số báo danh do học sinh nhập chỉ mang tính chất hiển thị tham chiếu trên bài làm và bảng điểm. Hệ thống không suy đoán danh tính thật và **không cam kết khả năng chống gian lận tuyệt đối** trên môi trường máy client khi không có máy chủ xác thực tin cậy.
- **Lưu trữ cục bộ an toàn**: Toàn bộ công cụ soạn đề và ngân hàng câu hỏi hoạt động 100% phía client trên trình duyệt của người dùng, không tạo ra bất kỳ trang quản trị (Admin Dashboard) công khai nào sử dụng đường dẫn URL bí mật để giả lập bảo mật.

---

## 10. Thu Thập Kết Quả & Cảnh Báo Apps Script (Undeployed / CORS Warning)

> [!WARNING]
> Mã nguồn tại thư mục `apps-script/Code.js` là **bản mẫu thiết kế kỹ thuật tham khảo**, **HIỆN CHƯA ĐƯỢC TRIỂN KHAI LÊN GOOGLE CLOUD / PRODUCTION** và **CHƯA ĐƯỢC NGHIỆM THU CORS / PREFLIGHT THẬT** từ trình duyệt tới máy chủ Google (xem Hợp đồng kỹ thuật §7 và quyết định D04).
>
> **Chế độ mặc định của ứng dụng là làm bài và xuất kết quả cục bộ (local-first)**.

- **Bảo mật mã nguồn tĩnh**: Trang web tĩnh (như GitHub Pages) tuyệt đối không được nhúng mã bí mật (secrets), khóa API (API keys), tài khoản dịch vụ (service accounts) hoặc token Google Drive có quyền ghi lâu dài vào mã JavaScript công khai.
- **Minh bạch trạng thái gửi kết quả**: Hệ thống phân định rõ ràng các trạng thái đồng bộ: `Chưa lưu`, `Đã lưu cục bộ` (`local_saved`), `Đang chờ gửi` (`queued`), `Đang gửi` (`sending`), `Đã xác nhận trên máy chủ` (`server_confirmed`), và `Gửi thất bại` (`failed`). Hệ thống **tuyệt đối không bao giờ thông báo "Đã lưu Google Drive"** nếu chưa nhận được biên nhận hợp lệ (`Receipt`) từ máy chủ.
- **Độ tin cậy của bài kiểm tra**: Các bài kiểm tra chính thức đòi hỏi bảo mật đề thi tuyệt đối, giấu đáp án chuẩn hoặc chấm điểm tin cậy bắt buộc phải được kết nối với dịch vụ backend có xác thực và chấm điểm phía máy chủ (Server-side grading theo quyết định D04/D08), không thể bảo đảm chỉ bằng trang web tĩnh.
