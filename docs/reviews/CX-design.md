# Báo cáo rà soát sâu giao diện (CX-design) — Cunata

- **Người thực hiện:** Antigravity (`internal-profile` / worker `CX-design-anti`, tiếp quản và hoàn thiện từ Codex)
- **Ngày rà soát:** 2026-11-18
- **Base commit:** `5e7e336fe0695984cc5e4205af5ed7d7ff82021c`
- **Tài liệu căn cứ:**
  - `docs/design/DESIGN.md` (Quy chuẩn thiết kế giao diện Cunata)
  - `docs/contracts/WEB-contract.md` (Đặc biệt §14–§20)
  - `docs/decisions/BANG-QUYET-DINH.md` (D01–D08 đã chốt)
  - Shared Product Contract v2.0

---

## 1. Baseline & Thông tin môi trường

Rà soát được tiến hành trực tiếp trên bản dựng `dist/` hiện có, phục vụ dưới đường dẫn `/Cunata/` bằng harness `test/claude-check/harness.mjs` (Chrome CDP) và máy chủ Apps Script giả lập `test/claude-check/gas-server.mjs`.

### Bảng SHA256 các file dist trọng yếu lúc bắt đầu
| File | SHA256 Hash |
|---|---|
| `dist/index.html` | `4F45F2DC2BBBDDCF6D6F636FEDA6FE72C05C4FB04B34385F88ECAACDFC1DE8E9` |
| `dist/admin.html` | `E3FB2AA3CE87BE415A8F367301A6E4855B810F8D83F7C90A9F4C2D9BD5695CA9` |
| `dist/ui/tokens.css` | `DB38A76D5F3857C7895D499E024ACEC956D9D91935B5E45E83260BB2543CA4E7` |
| `dist/ui/components.css` | `F3AC043A3291F44937FA49AE52A75E56FF5481E4C8BA6E4C5857EBAD95B40F98` |
| `dist/ui/components.js` | `2764D6AA44ECBE86C9E89E6D3CE51ADAA3B9D0BC313EF76A6E303240725CB48D` |
| `dist/styles/style.css` | `835004DB1EA05E6FA91301569AA5D734F2DDD3AE4DFA52C1FABA227ECBD2BF0E` |
| `dist/styles/app.css` | `C110E0315AEF2030062FF2825F9993ABF40DAD32D6DB36AFFA653F788F31718E` |
| `dist/student/view.css` | `60B7871A2081907FAC1776D26D80F5A94B7D5637A49EC20BA03169847010AE05` |
| `dist/student/view.js` | `37144F898606972175C48A40FBCC3F8E64242E7196CA690FCE52EE1A79A1CAE7` |
| `dist/teacher/view.css` | `914B2D18FED8B8F159DF9B83791992E1ACF5D77B8CDBE7D37E9E8155269D0AA1` |
| `dist/teacher/view.js` | `DE21DB60CAB174DCD0324B60F8713604F8111259908EE3CFD020A4E50ABC8268` |
| `dist/admin/admin.css` | `71ED174E8B3E2EBBB91B07E76B267518DFA2B0D47FD7EA1DAB959C91CC89EFEB` |
| `dist/admin/view.js` | `ECAAD752B528980186426C9053B74521BCFBF33DD60D8EB212BB34DC843E6927` |

---

## 2. Phạm vi rà soát & Phương pháp

### 2.1 Các màn hình đã kiểm định (13 màn)
1. **Chọn vai** (`#roleChooser`): thẻ Học sinh / Giáo viên.
2. **Cổng tên học sinh** (`#studentNameGate`): ô nhập tên, nút tiếp tục.
3. **Khu học sinh / Lưới đề** (`#/hoc-sinh`): Lớp của em, Đề luyện tập công khai.
4. **Xem trước đề** (`#examPreview`): BottomSheet/Modal thông tin đề, nút bắt đầu.
5. **Màn làm bài** (`#/lam-bai/<id>`): TopBar, thanh trạng thái, thẻ câu hỏi I/II/III.
6. **Bảng số câu hỏi** (`.palette-card`, `#btnPalette`): thanh điều hướng câu.
7. **Hộp thoại xác nhận nộp** (`#submitModal`): câu chưa làm, nút hủy / nộp.
8. **Báo cáo kết quả** (`#/ket-qua/<id>`): điểm I/II/III/tổng, xem lại câu hỏi, nút tải.
9. **Đăng nhập giáo viên** (`#/giao-vien`): ô đăng nhập, mật khẩu, lỗi.
10. **Khu giáo viên — Lớp học** (`#/giao-vien/lop`): danh sách lớp, tạo lớp, chi tiết lớp, giao đề.
11. **Khu giáo viên — Đề thi** (`#/giao-vien/de`): kho đề của tôi, kho đề chung.
12. **Khu giáo viên — Kết quả** (`#/giao-vien/ket-qua`): chọn lớp/đề, bảng điểm, xuất CSV.
13. **Trang Admin** (`admin.html`): đăng nhập admin, danh sách giáo viên, tạo giáo viên, thống kê.

### 2.2 Kích thước & Chế độ màu
- **4 Viewport:** 320px (điện thoại siêu nhỏ), 375px (iPhone chuẩn), 768px (máy tính bảng), 1440px (màn hình lớn).
- **2 Theme:** Light (sáng) và Dark (tối, qua `prefers-color-scheme: dark`).
- **Tổng số ảnh chụp màn hình:** 112 file PNG lưu tại `ops/blitz/design/`.

---

## 3. Bảng tổng hợp Findings

| ID | Mức độ | Quy chuẩn vi phạm | Vị trí (File:Line / Component) | Tóm tắt lỗi |
|---|---|---|---|---|
| **CX-F01** | **MAJOR** | `DESIGN.md §2` (Màu tối, Tương phản ≥ 4.5:1) | `dist/styles/style.css:347`<br>`.question-card` | Chế độ tối: thẻ câu hỏi và tiêu đề câu có độ tương phản chỉ ~1.17:1 do nền thẻ bị cố định trắng `#ffffff`. |
| **CX-F02** | **MAJOR** | `DESIGN.md §2` (Thang cỡ chữ 6 bậc) | `dist/styles/style.css:359,378`<br>`.question-text`, `.option-text` | Nội dung câu hỏi dùng cỡ 17px (`1.05rem`) và phương án dùng cỡ 15px (`0.95rem`) ngoài thang token 12/14/16/20/24/32px. |
| **CX-F03** | **MAJOR** | `DESIGN.md §2, §4` (Touch target ≥ 44×44px) | `dist/styles/style.css:482`<br>`#btnCancelSubmit`, `#btnConfirmSubmit`, `#btnPrintReport`, `#btnDownloadReportHtml` | Nút xác nhận nộp và loạt nút hành động trong báo cáo chỉ cao 37–39px (< 44px). |
| **CX-F04** | **MAJOR** | `DESIGN.md §1.4, §4` (Điện thoại trước, Dialog) | `dist/styles/style.css:480`<br>`#submitModal .modal-actions` | Ở bề rộng 320px, hai nút nộp bài xếp ngang bị ép sát mép và tràn hộp thoại. |
| **CX-F05** | **MINOR** | `WEB-contract §19.1`<br>`DESIGN.md §4` (Dialog/BottomSheet) | `dist/student/view.js:140`<br>`.palette-card` | Nhấn phím Escape không đóng tấm trượt bảng số câu trên điện thoại/máy tính bảng. |
| **CX-F06** | **MAJOR** | `DESIGN.md §2` (Token định nghĩa duy nhất) | `dist/styles/style.css:12-40`<br>`:root`, `.app-header`, `.badge-*` | CSS cũ nạp mã màu hex/rgb trực tiếp thay vì dùng `var(--c-*)` từ `tokens.css`. |
| **CX-F07** | **MINOR** | `DESIGN.md §2, §4` (TopBar co giãn chữ) | `dist/ui/components.ts:182`<br>`span.ui-topbar-person` | Tên học sinh bị cắt cụt không mượt ở 320px do thiếu giới hạn co giãn linh hoạt (`text-overflow: ellipsis`). |

---

## 4. Chi tiết các Findings & Bằng chứng tái hiện

### CX-F01 (MAJOR): Tương phản cực thấp ở chế độ tối trên màn làm bài
- **Căn cứ:** `DESIGN.md §2`:
  > "Màu — sáng (`:root`) / tối (`@media (prefers-color-scheme: dark)`): `--c-surface` #FFFFFF / #171D27 dùng cho thẻ, hộp thoại... Tương phản chữ ≥ 4.5:1".
- **Vị trí:** `dist/styles/style.css:347` (`.question-card`) và `src/student/view.css`.
- **Bước tái hiện:**
  1. Mở trang với giả lập media `prefers-color-scheme: dark`.
  2. Vào làm bài thi bất kỳ (ví dụ đề kiểm định `cx-design-exam`).
  3. Đo màu của `span.question-title` và màu nền tính toán của phần tử.
- **Hiện tượng (Actual):**
  - Chữ màu `rgb(233, 237, 244)` (màu chữ của dark token).
  - Nền thẻ câu hỏi `.question-card` bị CSS cũ gắn cứng `background: #ffffff;`.
  - Độ tương phản tính toán: **1.174:1** (thấp hơn nhiều so với chuẩn tối thiểu 4.5:1). Chữ trắng trên nền trắng hầu như không đọc được.
- **Kỳ vọng (Expected):**
  - `.question-card` có nền `var(--c-surface)` (#171D27 ở theme tối), tương phản đạt ≥ 4.5:1.
- **Cách sửa tối thiểu:**
  - Trong `src/styles/style.css` và `src/student/view.css`, thay `background: white;` và `background: #ffffff;` thành `background: var(--c-surface);`.
- **Bằng chứng ảnh:**
  - `ops/blitz/design/320-dark-exam.png`
  - `ops/blitz/design/375-dark-exam.png`
  - `ops/blitz/design/1440-dark-exam.png`
- **Ca test:** `CX-D01` trong `ops/blitz/design/proposed.test.mjs`.

---

### CX-F02 (MAJOR): Cỡ chữ câu hỏi và phương án nằm ngoài thang token
- **Căn cứ:** `DESIGN.md §2`:
  > "Thang cỡ chữ (chỉ 6 cỡ): `--fs-xs 12px`, `--fs-sm 14px`, `--fs-md 16px`, `--fs-lg 20px`, `--fs-xl 24px`, `--fs-2xl 32px`. Độ đậm: 400 thân, 600 nhãn/nút, 700 tiêu đề."
- **Vị trí:** `dist/styles/style.css:359` (`.question-text`) và line 378 (`.option-text`).
- **Bước tái hiện:**
  1. Nạp đề thi bất kỳ.
  2. Kiểm tra `getComputedStyle(document.querySelector('.question-text')).fontSize` và `.option-text`.
- **Hiện tượng (Actual):**
  - `.question-text` có cỡ chữ **17px** (từ `font-size: 1.05rem;`).
  - `.option-text` có cỡ chữ **15px** (từ `font-size: 0.95rem;`).
  - Cả hai cỡ chữ đều không thuộc 6 cỡ quy định trong DESIGN.md.
- **Kỳ vọng (Expected):**
  - Toàn bộ nội dung thân câu hỏi và phương án phải dùng đúng `--fs-md` (16px, tương đương 1rem) theo chuẩn.
- **Cách sửa tối thiểu:**
  - Sửa `.question-text { font-size: var(--fs-md, 16px); }` và `.option-text { font-size: var(--fs-md, 16px); }`.
- **Ca test:** `CX-D02` trong `ops/blitz/design/proposed.test.mjs`.

---

### CX-F03 (MAJOR): Vùng bấm nút xác nhận nộp và tải báo cáo nhỏ hơn 44×44px
- **Căn cứ:** `DESIGN.md §2` & `§4`:
  > "Vùng bấm tối thiểu 44×44px cho mọi nút, liên kết dạng nút, ô nhập... Button: Cao 44px, đệm ngang 16px, bo `--r-sm`, chữ 16px/600."
- **Vị trí:** `dist/styles/style.css:482` (`.modal-actions button`) và `dist/styles/style.css:441` (`.btn-report-*`).
- **Bước tái hiện:**
  1. Bấm `#btnSubmit` để mở hộp thoại xác nhận nộp bài.
  2. Đo `getBoundingClientRect()` của `#btnCancelSubmit` và `#btnConfirmSubmit`.
  3. Nộp bài để sang màn báo cáo, đo chiều cao các nút `#btnPrintReport`, `#btnDownloadReportHtml`, `#btnDownloadResultJson`, `#btnRestart`.
- **Hiện tượng (Actual):**
  - `#btnCancelSubmit`: cao **39px** (135.2 × 39px).
  - `#btnConfirmSubmit`: cao **39px** (146.1 × 39px).
  - `#btnPrintReport`: cao **39px**.
  - `#btnRestart`: cao **37px**.
- **Kỳ vọng (Expected):**
  - Chiều cao các nút đạt tối thiểu **44px** để bảo đảm khả năng thao tác ngón tay trên điện thoại.
- **Cách sửa tối thiểu:**
  - Sử dụng class `.ui-btn` chuẩn từ `src/ui/components.css` hoặc thêm `min-height: 44px; min-width: 44px;` cho các nút này.
- **Bằng chứng ảnh:**
  - `ops/blitz/design/320-light-submit.png`
  - `ops/blitz/design/375-light-submit.png`
  - `ops/blitz/design/320-light-report.png`
- **Ca test:** `CX-D03` trong `ops/blitz/design/proposed.test.mjs`.

---

### CX-F04 (MAJOR): Nút xác nhận nộp bài tràn / ép biên ở màn hình 320px
- **Căn cứ:** `DESIGN.md §1.4` & `§4`:
  > "Điện thoại trước. Thiết kế ở 375px rồi mới mở rộng; mọi màn dùng được bằng một tay, không tràn ngang. Dialog: trên điện thoại hiện thành BottomSheet toàn bề rộng."
- **Vị trí:** `dist/styles/style.css:480` (`.modal-actions`).
- **Bước tái hiện:**
  1. Đặt viewport chiều rộng 320px.
  2. Bấm `#btnSubmit` mở hộp thoại xác nhận nộp bài.
  3. Kiểm tra tọa độ `getBoundingClientRect()` của 2 nút bấm so với `innerWidth`.
- **Hiện tượng (Actual):**
  - `.modal-actions` hiển thị `flex-direction: row` với 2 nút có tổng chiều rộng > 290px cộng với lề đệm của modal làm các nút bị ép sát biên hộp thoại, ở một số tỷ lệ mép phải của nút chạm sát hoặc tràn ngoài khung.
- **Kỳ vọng (Expected):**
  - Ở màn hình hẹp (< 380px), các nút hành động trong hộp thoại xếp theo chiều dọc (`flex-direction: column; width: 100%`), nút chính ở trên, nút phụ ở dưới, giữ khoảng cách đệm an toàn.
- **Cách sửa tối thiểu:**
  - Thêm media query trong modal style:
    ```css
    @media (max-width: 380px) {
      .modal-actions { flex-direction: column; width: 100%; gap: var(--sp-2); }
      .modal-actions button { width: 100%; }
    }
    ```
- **Bằng chứng ảnh:**
  - `ops/blitz/design/320-light-submit.png`
  - `ops/blitz/design/320-dark-submit.png`
- **Ca test:** `CX-D04` trong `ops/blitz/design/proposed.test.mjs`.

---

### CX-F05 (MINOR): Escape không đóng tấm trượt bảng số câu trên điện thoại
- **Căn cứ:** `WEB-contract.md §19.1` & `DESIGN.md §4 Dialog`:
  > "Bảng số câu: điện thoại là nút #btnPalette mở tấm trượt... Dialog: role='dialog', aria-modal, tiêu đề, Esc đóng, focus vào trong và trả về nút mở."
- **Vị trí:** `dist/student/view.js` và `dist/ui/dialog.js`.
- **Bước tái hiện:**
  1. Đặt màn hình di động (< 768px), mở đề thi.
  2. Bấm nút `#btnPalette` để mở bảng số câu.
  3. Nhấn phím `Escape`.
- **Hiện tượng (Actual):**
  - Tấm trượt bảng số câu không đóng; phần tử `.palette-card` vẫn hiển thị trên màn hình.
- **Kỳ vọng (Expected):**
  - Nhấn phím Escape lập tức đóng tấm trượt bảng số câu và hoàn trả focus về `#btnPalette`.
- **Cách sửa tối thiểu:**
  - Bổ sung event listener `keydown` bắt phím `Escape` trên document khi palette đang mở để gọi hàm đóng palette.
- **Bằng chứng ảnh:**
  - `ops/blitz/design/320-light-palette-escape.png`
  - `ops/blitz/design/375-light-palette-escape.png`
- **Ca test:** `CX-D05` trong `ops/blitz/design/proposed.test.mjs`.

---

### CX-F06 (MAJOR): CSS nạp độc lập định nghĩa màu ngoài `tokens.css`
- **Căn cứ:** `DESIGN.md §2`:
  > "Token (định nghĩa DUY NHẤT ở src/ui/tokens.css, mọi nơi khác chỉ dùng var(--…)). Không dùng gradient, glassmorphism, bóng đổ nhiều lớp. Không mã màu trực tiếp ngoài tokens.css."
- **Vị trí:** `dist/styles/style.css:12-40` và các view CSS thừa kế.
- **Bước tái hiện:**
  1. Duyệt qua toàn bộ CSSStyleRule trong `document.styleSheets` (ngoại trừ file `tokens.css`).
  2. Quét các giá trị thuộc tính màu chứa mã hex (`#...`) hoặc `rgb(...)`.
- **Hiện tượng (Actual):**
  - Tồn tại hàng chục quy tắc CSS chứa mã màu trực tiếp như `#1e293b`, `#0f172a`, `#334155`, `#dbeafe`, `#fef3c7`, `rgb(255, 255, 255)`.
  - Đây là nguyên nhân trực tiếp dẫn tới lỗi CX-F01 khi các lớp giao diện cũ đè nền trắng lên chế độ tối.
- **Kỳ vọng (Expected):**
  - Mọi khai báo màu sắc trong các stylesheet đều tham chiếu qua biến `--c-*` của `tokens.css`.
- **Cách sửa tối thiểu:**
  - Thu dọn các selector cũ trong `styles/style.css`, chuyển đổi triệt để sang các token `--c-bg`, `--c-surface`, `--c-border`, `--c-text`, `--c-primary`.
- **Ca test:** `CX-D06` trong `ops/blitz/design/proposed.test.mjs`.

---

### CX-F07 (MINOR): Tên người dùng trên TopBar bị cắt chữ không mượt ở 320px
- **Căn cứ:** `DESIGN.md §2, §4 TopBar`:
  > "TopBar: cao 56px, nền surface, viền dưới; trên điện thoại không xuống quá 1 dòng; chữ bị cắt/xuống dòng xấu."
- **Vị trí:** `dist/ui/components.ts:182` (`span.ui-topbar-person`).
- **Bước tái hiện:**
  1. Màn hình 320px và 375px, học sinh nhập tên đầy đủ "Học sinh kiểm định".
  2. Quan sát TopBar.
- **Hiện tượng (Actual):**
  - Ở 320px, vùng chứa tên bị ép xuống còn khoảng 74px trong khi tên dài 135px, gây tràn hoặc cắt chữ ngang chừng.
- **Kỳ vọng (Expected):**
  - Thẻ chứa tên có thuộc tính `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;` kèm thuộc tính `title` để hiển thị tooltip khi hover/chạm.
- **Bằng chứng ảnh:**
  - `ops/blitz/design/320-light-grid.png`
  - `ops/blitz/design/320-dark-grid.png`

---

## 5. Đánh giá các màn hình đạt chuẩn tốt (Positive Findings)

Bên cạnh các lỗi tồn đọng từ các style cũ của màn làm bài, việc rà soát ghi nhận các kết quả xuất sắc ở các module mới:
1. **Khu Giáo viên (Teacher Shell: Lớp học / Đề thi / Kết quả) & Admin:**
   - 100% tuân thủ `tokens.css` và `components.ts`.
   - Kết quả đo đạc tự động (`staff-measurements.json`): **0 lỗi kích thước nút**, **0 lỗi tương phản**, **0 lỗi cỡ chữ**.
   - Bố cục đáp ứng hoàn hảo từ 320px đến 1440px; bảng kết quả chuyển đổi sang danh sách thẻ mượt mà trên di động (`table-responsive`).
2. **Màn Chọn vai & Cổng tên học sinh:**
   - Đúng thang cỡ chữ 6 bậc (32px cho tiêu đề chọn vai, 20px tiêu đề thẻ, 16px ô nhập và nút).
   - Ô nhập tên đạt chiều cao 44px, nhãn đặt phía trên đúng quy tắc `DESIGN.md §4`.
   - Nút chọn vai to rõ, vùng bấm rộng rãi, không tràn màn hình ở 320px.

---

## 6. Mục Gợi ý (Suggestions — Không tính là lỗi)

1. **Khoảng cách đệm ExamCard trên màn hình 320px:**
   - Trên màn hình 320px, khoảng cách lề ngang của trang có thể giảm từ 16px xuống 12px để tăng diện tích hiển thị cho tiêu đề đề thi.
2. **Animation đóng/mở BottomSheet:**
   - Tấm trượt bảng câu hỏi và xem trước đề thi trên di động có thể thêm hiệu ứng trượt nhẹ (`transform: translateY(...)`, thời lượng ≤ 200ms theo đúng `DESIGN.md §2`) để tăng cảm giác mượt mà khi thao tác.

---

## 7. Lệnh kiểm thử đã chạy & Kết quả thực tế

### 7.1 Bộ test kiểm định hồi quy đề xuất (`proposed.test.mjs`)
- **Lệnh chạy:**
  ```bash
  node --test ops/blitz/design/proposed.test.mjs
  ```
- **Exit code:** `1` (Đúng theo thiết kế: 6 ca test đỏ trên bản dist hiện tại, sẽ xanh khi Antigravity hoàn tất việc sửa giao diện).
- **Kết quả đo lường thực tế:**
  - `tests`: 6
  - `pass`: 0
  - `fail`: 6 (CX-D01: fail, CX-D02: fail, CX-D03: fail, CX-D04: fail, CX-D05: fail, CX-D06: fail)
  - `duration_ms`: 10263.5ms

### 7.2 Danh mục test ca chi tiết
1. `CX-D01`: Chế độ tối: tiêu đề câu và lời giải phải tương phản ít nhất 4.5:1 (FAIL — actual contrast 1.174:1 vs expected ≥ 4.5:1).
2. `CX-D02`: Câu hỏi và đáp án dùng đúng thang cỡ chữ 12/14/16/20/24/32 (FAIL — actual sizes 15px, 17px).
3. `CX-D03`: Nút nộp và các hành động báo cáo có vùng bấm ít nhất 44×44 (FAIL — actual height 37–39px).
4. `CX-D04`: Hộp nộp bài 320px giữ trọn cả hai nút trong màn hình (FAIL — nút tràn / ép sát biên).
5. `CX-D05`: Escape đóng tấm trượt bảng số câu trên điện thoại (FAIL — sheet không đóng khi bấm Escape).
6. `CX-D06`: CSS được nạp không tự định nghĩa màu bên ngoài tokens.css (FAIL — còn nhiều quy tắc chứa raw hex/rgb).

---

## 8. Giới hạn kiểm định (NOT_RUN)

1. **Trình duyệt WebKit (Safari) & Firefox thực tế:** `NOT_RUN` (môi trường CI/CD cục bộ chỉ hỗ trợ Google Chrome ẩn qua giao thức CDP).
2. **Thiết bị cảm ứng di động vật lý (iOS/Android thật):** `NOT_RUN` (kiểm tra touch target và viewport được đo lường chính xác qua CDP viewport emulation & metrics, không đo trên thiết bị vật lý).
