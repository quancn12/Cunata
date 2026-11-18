# CX-teacher — Rà soát khu Giáo viên

- `review_id / task_id / worker_id`: CX-teacher / CX-teacher-anti; reviewer: Antigravity (tiếp quản từ Codex).
- Ngày kiểm: 18/11/2026, Windows/PowerShell, Node v24.14.0, Chrome headless/CDP qua harness có sẵn (`test/claude-check/harness.mjs`).
- `base_commit = head_commit`: `e7d8f85c99f28fef83d37187a2101e15be100d7b`.
- Kết luận: **CHANGES_REQUESTED**. Chưa đề nghị nghiệm thu khu Giáo viên: phát hiện 1 BLOCKER, 4 MAJOR và 3 MINOR đã xác minh và tái hiện qua test tự động độc lập.
- Phạm vi tác vụ: chỉ tạo báo cáo này và bộ kiểm thử/bằng chứng trong `ops/blitz/teacher/`. Không sửa `src/`, `dist/`, `public/`, `apps-script/`, `test/`. Không `npm install`, không build, không commit, không deploy, không gọi Google thật.

## 1. Căn cứ và snapshot

Đã đối chiếu Shared Product Contract v2.0, toàn bộ `docs/contracts/WEB-contract.md` (đặc biệt §14–19, §17.1–17.6, §19.1–19.2), `docs/design/DESIGN.md`, `docs/decisions/BANG-QUYET-DINH.md` (D01–D08 đã chốt), và mẫu bàn giao M1 §2 được WEB §2 dẫn chiếu.

Hash SHA-256 các file dist và backend liên quan tại thời điểm kiểm tra:

| File | SHA-256 |
|---|---|
| `dist/index.html` | `4f45f2dc2bbbdccf6d6f636feda6fe72c05c4fb04b34385f88ecaacdfc1de8e9` |
| `dist/teacher/portal.js` | `8e0586ff31fcfd7456888c556b65a3c651e4554ad9552ac8ae3ac0bf6b1c7f7e` |
| `dist/teacher/view.js` | `de21db60cab174dcd0324b60f8713604f8111259908ee3cfd020a4e50abc8268` |
| `dist/teacher/index.js` | `4b7d6a31fc763874fc7e9503895be922b5eee721f4b1e30a77427672ef98df4e` |
| `dist/teacher/view.css` | `914b2d18fed8b8f159df9b83791992e1acf5d77b8cdbe7d37e9e8155269d0aa1` |
| `dist/app/main.js` | `1c9e450807377b56403ebfa9180ca43975c5040595d88a7fe85ce0698656da6b` |
| `dist/app/authoring.js` | `7e66e921a6a9b76c7c585e67c40ec61db973fc8d8217fafc81027d08d0f721cc` |
| `dist/app/routes.js` | `36f47f3a81e9d6d5bd5a93084880f0a35b134c73433b34612d6f07c047aea705` |
| `dist/collect/appsScript.js` | `85351d11fc4446d685dee796fc2255c0b5978d9d4ad69f1a4e4a47b7c568e6a4` |
| `apps-script/Code.js` | `f8e7cbbf6b113bd4a8d97ac00599a2bbcf407f01d2c935ba639afb5d4bda2389` |

Đường chạy thực tế: `dist/index.html#/giao-vien → dist/app/main.js → dist/teacher/portal.js → dist/collect/appsScript.js → test/claude-check/gas-server.mjs → gas-fake.mjs → apps-script/Code.js`.
Máy chủ tĩnh chạy qua `startServer(dist, { overrides })`, phục vụ dưới `/Cunata/`. Tất cả thao tác nhập liệu dùng bàn phím người dùng thật qua CDP (`page.type`, `Input.insertText`, bàn phím native điều hướng datetime); không gán `.value` bằng JavaScript trong test.

## 2. Phạm vi đã chạy

| Nhóm | Ca kiểm thử và kết quả quan sát |
|---|---|
| **Đăng nhập & Phiên** | Sai mật khẩu bị chặn và báo lỗi rõ tại `#teacherLoginError`; tài khoản bị Admin khóa không đăng nhập được; đăng nhập đúng chuyển vào `#teacherShell`; đăng xuất xóa giao diện quản trị và xóa phiên; mật khẩu không lưu vào `localStorage`. Tuy nhiên, khi phiên hết hạn ở server, giao diện báo sai thành "Sai tên đăng nhập hoặc mật khẩu" và kẹt trạng thái (CX-T01). |
| **Cấu hình** | Khi chưa cấu hình Apps Script (`appsScriptUrl: ''`), màn hình hiện chữ "chưa cấu hình" rõ ràng, không gọi HTTP ra ngoài. |
| **Lớp học** | Tạo lớp mới sinh mã 6 ký tự in hoa loại trừ `0/O/1/I` theo quy chuẩn; nút sao chép mã và liên kết mời `#/hoc-sinh?lop=<MÃ>` hoạt động đúng; phản hồi thị giác đổi thành "Đã chép", "Đã chép link". |
| **Phân quyền đề thi** | Quyết định §19 yêu cầu "mỗi giáo viên chỉ thấy lớp/đề/kết quả của mình". Thực tế giáo viên này nhìn thấy toàn bộ đề thi do giáo viên khác xuất bản trong lưới đề (CX-T02). |
| **Soạn / Sửa / Gỡ đề** | Soạn đề mới có chặn xuất bản khi câu sửa dở (ND-01); sửa tiêu đề giữ nguyên `settings` (thời gian, số lần làm, trộn đề) và danh sách câu hỏi; gỡ đề thành công và xóa khỏi danh sách. Tuy nhiên, khi sửa nội dung câu hỏi phần I trong trình soạn đề, đáp án đúng `correctOptionId` bị ghi đè sai thành `opt-4` (CX-T07). |
| **Giao đề (`#assignDialog`)** | Chặn giờ mở/hạn nộp để trống; chặn hạn nộp trước giờ mở; chuyển đổi múi giờ `Asia/Ho_Chi_Minh` (UTC+7) sang chuỗi ISO UTC chính xác khi gửi API `assignExam`. Tuy nhiên, hộp thoại không hỗ trợ phím Escape và không hoàn trả focus (CX-T06). |
| **Kết quả làm bài** | Học sinh vào lớp bằng mã, làm bài và nộp; kết quả xuất hiện trên bảng `#resultsTable`. Tuy nhiên, điểm các phần và tổng điểm hiển thị dạng phân số thô `1/4/1/2` và `1/4 / 1/2` thay vì số thập phân `0,25 / 0,50` theo D02 (CX-T03). Màn hình kết quả thiếu bộ chọn đề thi đã giao (CX-T04). Xuất CSV chưa chặn ký tự fullwidth formula injection (CX-T05). |
| **Định tuyến & Tải lại trang** | Điều hướng TopBar giữa `lop`, `de`, `ket-qua` cập nhật `aria-current="page"`. Nhưng khi reload tại `#/giao-vien/de`, giao diện bị reset về mục `lop` (CX-T08). |

## 3. Bảng findings đã xác minh

| ID | Mức | Vấn đề | File:line (Source & Dist) | Căn cứ | Test đề xuất |
|---|---|---|---|---|---|
| **CX-teacher-F01** | MAJOR | Token hết hạn hiển thị thông báo "Sai tên đăng nhập hoặc mật khẩu" và kẹt giao diện, không đưa về cổng đăng nhập | `src/teacher/portal.ts:190, 1002`<br>`dist/teacher/portal.js:117, 907` | WEB §19.1–19.2 (Token hết hạn → `UNAUTHORIZED`, hết phiên), DESIGN §4 | `CX-T01` (FAIL) |
| **CX-teacher-F02** | MAJOR | Giáo viên nhìn thấy cả đề thi của giáo viên khác trong danh sách đề thi | `src/teacher/portal.ts:1344`, `src/app/main.ts:3074`<br>`dist/teacher/portal.js:1344`, `dist/app/main.js:3074` | WEB §19 (Quyết định 2: mỗi giáo viên chỉ thấy lớp/đề/kết quả của mình) | `CX-T02` (FAIL) |
| **CX-teacher-F03** | MAJOR | Điểm số trong bảng kết quả `#resultsTable` và file CSV hiển thị chuỗi phân số thô (`1/4/1/2`) thay vì số thập phân chuẩn | `src/teacher/portal.ts:1708-1711, 1746-1749`<br>`dist/teacher/portal.js:1546-1555, 1584-1590` | BANG-QUYET-DINH D02, WEB §19.1, §6, DESIGN | `CX-T03` (FAIL) |
| **CX-teacher-F04** | MAJOR | Khu vực Kết quả thiếu bộ chọn đề thi (chỉ có bộ chọn lớp), không lọc được kết quả theo đề đã giao | `src/teacher/portal.ts:1651-1670`<br>`dist/teacher/portal.js:1495-1515` | WEB §19.1 (Kết quả: chọn lớp + đề → bảng `#resultsTable`) | `CX-T04` (FAIL) |
| **CX-teacher-F05** | MINOR | Xuất CSV chưa lọc tiền tố công thức dạng toàn giác (fullwidth `＝`, `＋`, `－`, `＠`) | `src/teacher/portal.ts:183`<br>`dist/teacher/portal.js:110` | WEB §7, §17.3 (chống CSV formula injection) | `CX-T05` (FAIL) |
| **CX-teacher-F06** | MINOR | Hộp thoại giao đề `#assignDialog` không đóng khi nhấn phím Escape và không hoàn trả focus về `#btnAssignExam` | `src/teacher/portal.ts:1215-1380`<br>`dist/teacher/portal.js:1097-1240` | DESIGN §4 Dialog (Esc đóng, hoàn trả focus) | `CX-T06` (FAIL) |
| **CX-teacher-F07** | BLOCKER | Sửa nội dung câu hỏi phần I trong trình soạn đề tự động đổi `correctOptionId` thành `opt-4` do điều kiện radio checked bị lỗi | `src/app/authoring.ts:179`<br>`dist/app/authoring.js:140` | Shared Product Contract §B6, WEB §19.1 (phải giữ nguyên mọi trường của đề khi sửa một phần) | `CX-T07` (FAIL) |
| **CX-teacher-F08** | MINOR | Tải lại trang (F5/reload) tại `#/giao-vien/de` bị mất trạng thái tab và nhảy về `lop` | `src/teacher/portal.ts:236, 1999`, `src/app/main.ts:3126`<br>`dist/teacher/portal.js:154, 1821`, `dist/app/main.js:3098` | WEB §19.1 (điều hướng `#teacherNav` theo đường dẫn hash) | `CX-T08` (FAIL) |

---

### CX-teacher-F01 — Hết phiên báo sai lỗi và kẹt giao diện

- **Các bước thật đã chạy:** Đăng nhập giáo viên, mở bảng điều khiển shell; làm hết hạn token trong backend giả lập (`expiresAt = 2000-01-01T00:00:00.000Z`, xóa cache session); bấm điều hướng tới tab Lớp học (`#teacherNav a[data-nav="lop"]`).
- **Actual:** Backend trả về `{ success: false, error: 'UNAUTHORIZED', message: 'Token không hợp lệ hoặc đã hết hạn' }`. Hàm `toVietnameseErrorMessage` ánh xạ cứng `UNAUTHORIZED` thành chuỗi `"Sai tên đăng nhập hoặc mật khẩu"`. Giao diện `#teacherShell` vẫn hiển thị, lưới lớp học chèn dòng chữ "Sai tên đăng nhập hoặc mật khẩu". Người dùng không được thông báo phiên đã hết hạn và không được điều hướng về màn hình đăng nhập.
- **Expected:** Khi nhận mã `UNAUTHORIZED` cho các thao tác đã đăng nhập, hệ thống phải thông báo rõ phiên làm việc đã hết hạn (ví dụ: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại"), xóa token khỏi `sessionStorage`, đóng shell và đưa người dùng về `#teacherLogin`.
- **Tác động:** Giáo viên bối rối vì đang sử dụng bình thường lại nhận được câu báo sai mật khẩu; không thể tiếp tục thao tác nếu không tự tìm nút Đăng xuất.
- **Sửa tối thiểu:** Trong `src/teacher/portal.ts`, tại các điểm bắt lỗi API (`loadClasses`, `loadExams`, `loadResults`), kiểm tra nếu `res.code === 'UNAUTHORIZED'` thì gọi `clearStoredTeacherPassword()`, thông báo "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại" trong `#teacherLoginError` và chuyển giao diện về `showLogin()`.
- **Bằng chứng:** `ops/blitz/teacher/expired.json`, `ops/blitz/teacher/expired.png`; test `CX-T01` trong `proposed.test.mjs`.

---

### CX-teacher-F02 — Giáo viên thấy đề thi riêng của giáo viên khác

- **Các bước thật đã chạy:** Dùng Admin tạo giáo viên thứ hai `cxother`, đăng nhập `cxother` và xuất bản một đề thi mới `cx-other-private` ("Đề của giáo viên khác"). Sau đó đăng nhập bằng giáo viên `cxteacher` và mở tab Đề thi `#/giao-vien/de`.
- **Actual:** Trong lưới đề thi `#teacherExamGrid` của `cxteacher` hiển thị thẻ đề `cx-other-private` ("Đề của giáo viên khác"). `cxteacher` thậm chí có thể thấy nút "Sửa đề" và "Gỡ".
- **Expected:** Theo WEB-contract §19 (Quyết định 2): "Admin tạo từng tài khoản giáo viên, mỗi giáo viên chỉ thấy lớp/đề/kết quả của mình". Lưới đề thi của giáo viên chỉ gồm: (1) đề do chính giáo viên đó xuất bản; (2) Kho đề chung (đề tĩnh).
- **Tác động:** Vi phạm nghiêm trọng tính riêng tư và phân quyền giữa các giáo viên trong cùng trường/hệ thống; giáo viên có thể xem trước nội dung đề kiểm tra của đồng nghiệp.
- **Sửa tối thiểu:** Backend Apps Script cần gắn `owner` vào dữ liệu trả về của `listExams` (hoặc cung cấp hành động `listMyExams`), hoặc phía frontend `fetchAndMergeExams` / `mountTeacherPortal` phải lọc chỉ hiển thị các đề có nguồn `static` hoặc có `owner === currentTeacherUsername`.
- **Bằng chứng:** `ops/blitz/teacher/ownership.json`, `ops/blitz/teacher/ownership.png`; test `CX-T02` trong `proposed.test.mjs`.

---

### CX-teacher-F03 — Điểm thi hiển thị phân số thô thay vì số thập phân

- **Các bước thật đã chạy:** Tạo đề thi có 2 câu trắc nghiệm phần I (mỗi câu 0,25 điểm, tổng phần I = 0,5 điểm). Giao cho lớp. Học sinh vào làm đúng 1 câu và nộp bài. Giáo viên mở tab Kết quả và bấm "Xuất kết quả CSV".
- **Actual:**
  - Bảng `#resultsTable`: Cột "Phần I" hiển thị `1/4/1/2`; Cột "Tổng điểm" hiển thị `1/4 / 1/2`.
  - File CSV tải về: Cột Phần I ghi `"1/4/1/2"`, Cột Tổng điểm ghi `"1/4/1/2"`.
- **Expected:** Theo Quyết định D02 và Shared Product Contract: điểm số hiển thị theo định dạng số thập phân dùng dấu phẩy tiếng Việt: `0,25 / 0,50`. Không được ghép hai phân số thô thành chuỗi `1/4/1/2`.
- **Tác động:** Giáo viên không đọc được điểm của học sinh (nhìn như phép chia lặp); bảng điểm xuất ra không thể dùng để nhập điểm hay báo cáo.
- **Sửa tối thiểu:** Trong `src/teacher/portal.ts` (hàm `renderTableRows` và trình xử lý `exportBtn`), sử dụng hàm định dạng Rational sang số thập phân tiếng Việt (đã có sẵn trong `src/domain/rational.ts`: `formatViScore` hoặc quy đổi tử/mẫu sang chuỗi thập phân làm tròn 2 chữ số phẩy) trước khi render DOM và ghi vào CSV.
- **Bằng chứng:** `ops/blitz/teacher/results-flow.json`, `ops/blitz/teacher/results.png`, `ops/blitz/teacher/results-csv.json`; test `CX-T03` trong `proposed.test.mjs`.

---

### CX-teacher-F04 — Màn hình Kết quả thiếu bộ chọn đề thi

- **Các bước thật đã chạy:** Xuất bản 2 đề thi khác nhau và giao cả 2 đề cho cùng một lớp. Đăng nhập giáo viên, điều hướng vào `#/giao-vien/ket-qua`.
- **Actual:** Tại khu vực bộ lọc trên đầu bảng `#resultsTable`, chỉ có đúng 1 thẻ `<select id="resultsClassSelect">` để chọn lớp học. Không có bất kỳ thẻ `<select>` nào để chọn đề thi. Bảng kết quả chỉ tải kết quả của lớp theo đề đầu tiên hoặc toàn bộ mà không phân tách theo bài tập đã giao.
- **Expected:** Theo WEB-contract §19.1: *"Kết quả `#/giao-vien/ket-qua`: chọn lớp + đề → bảng `#resultsTable` (tên, lúc nộp, điểm từng phần, tổng), nút `#btnExportResults` (CSV chống công thức)"*. Phải có bộ chọn đề thi (các đề đã giao cho lớp đã chọn).
- **Tác động:** Giáo viên không thể lọc và đối chiếu kết quả theo từng bài kiểm tra đã giao; khi một lớp có nhiều bài thi được giao, danh sách nộp bài bị trộn lẫn.
- **Sửa tối thiểu:** Bổ sung `<select id="resultsAssignmentSelect">` bên cạnh `resultsClassSelect` trong `src/teacher/portal.ts:1651-1670`. Khi giáo viên chọn một lớp, nạp danh sách bài giao của lớp đó qua `deps.client.listAssignments(token, classId)` và cập nhật bộ chọn đề; khi chọn đề thì gọi `listResults(token, classId, assignmentId)`.
- **Bằng chứng:** `ops/blitz/teacher/results-filters.json`; test `CX-T04` trong `proposed.test.mjs`.

---

### CX-teacher-F05 — Xuất CSV chưa lọc ký tự fullwidth formula injection

- **Các bước thật đã chạy:** Học sinh nhập tên hiển thị chứa ký tự dấu bằng toàn giác `＝1+1` (U+FF1D). Sau khi nộp bài, giáo viên bấm xuất CSV trên trang Kết quả.
- **Actual:** Dòng dữ liệu học sinh trong file CSV xuất ra là:
  `"＝1+1","82JUGT","2026-11-18T11:17:31.470Z","1/4/1/2","0/0","0/0","1/4/1/2"`
  Tên bắt đầu bằng `＝` không được thêm tiền tố nháy đơn `'`.
- **Expected:** Theo WEB-contract §7 và §17.3: các ô CSV bắt đầu bằng các ký tự công thức `= + - @` và các biến thể fullwidth Unicode (`＝ ＋ － ＠`) phải được bọc thêm dấu nháy đơn `'` ở đầu (thành `"'＝1+1"`), tránh nguy cơ thực thi macro/công thức tự động khi người dùng mở bằng Microsoft Excel hoặc Google Sheets.
- **Tác động:** Nguy cơ bảo mật Formula Injection (CSV Injection) khi học sinh đặt tên cố tình chứa payload khai thác.
- **Sửa tối thiểu:** Cập nhật regex trong `escapeCsvCell` (`src/teacher/portal.ts:183` và `dist/teacher/portal.js:110`):
  Đổi từ `/^[=+\-@]/` thành `/^[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/.test(s)`.
- **Bằng chứng:** `ops/blitz/teacher/csv-formula.json`; test `CX-T05` trong `proposed.test.mjs`.

---

### CX-teacher-F06 — Hộp thoại giao đề không đóng khi nhấn phím Escape

- **Các bước thật đã chạy:** Bấm nút "Giao đề" `#btnAssignExam` trong chi tiết lớp để mở `#assignDialog`. Khi hộp thoại hiển thị, nhấn phím `Escape`.
- **Actual:** Hộp thoại vẫn mở nguyên trên màn hình (`assignDialog` không biến mất), focus vẫn nằm trong hộp thoại.
- **Expected:** Theo DESIGN.md §4 (Quy chuẩn Dialog): Hộp thoại phải có sự kiện lắng nghe phím `Escape` để đóng hộp thoại, đồng thời hoàn trả focus về phần tử kích hoạt mở trước đó (`#btnAssignExam`).
- **Tác động:** Không đáp ứng tiêu chuẩn tiếp cận tiếp cận bàn phím (Keyboard Accessibility) cho người dùng khuyết tật hoặc người dùng chuyên phím tắt.
- **Sửa tối thiểu:** Trong `src/teacher/portal.ts` (hàm `openAssignDialog`), lưu lại `document.activeElement` trước khi mở; thêm sự kiện `keydown` trên `document` lắng nghe `e.key === 'Escape'` để đóng dialog và gọi `triggerElement?.focus()`.
- **Bằng chứng:** `ops/blitz/teacher/dialog-escape.json`, `ops/blitz/teacher/dialog-escape.png`; test `CX-T06` trong `proposed.test.mjs`.

---

### CX-teacher-F07 — Sửa nội dung câu hỏi phần I làm hỏng đáp án đúng

- **Các bước thật đã chạy:** Giáo viên có đề thi đã xuất bản, câu số 1 phần I có các đáp án `opt-1`, `opt-2`, `opt-3`, `opt-4` và đáp án đúng là `opt-1`. Giáo viên bấm "Sửa đề", mở trình soạn câu hỏi, chỉ gõ sửa phần văn bản câu hỏi (không đổi đáp án đúng), bấm "Lưu câu hỏi" rồi bấm "Xuất bản lên web".
- **Actual:** Đề xuất bản mới nhận được `correctOptionId: 'opt-4'` (thay vì `'opt-1'`).
- **Expected:** Theo Shared Product Contract §B6 và WEB §19.1: việc sửa câu hỏi phải giữ nguyên toàn bộ các trường không sửa; đáp án đúng phải được bảo toàn nguyên vẹn.
- **Tác động:** **BLOCKER**. Mọi thao tác sửa câu hỏi dạng trắc nghiệm 4 lựa chọn đều tự động biến đáp án đúng thành lựa chọn D (`opt-4`), làm sai toàn bộ barem chấm bài của học sinh.
- **Nguyên nhân chi tiết:** Tại `src/app/authoring.ts:179` (và `dist/app/authoring.js:140`):
  ```ts
  const isChecked = opt.optionId === q.correctOptionId || opt.optionId === `opt-${oIdx + 1}` ? 'checked' : '';
  ```
  Vế `|| opt.optionId === 'opt-${oIdx + 1}'` khiến cả 4 lựa chọn đều được gán `checked="checked"`. Khi nhiều radio button cùng `name` đều có `checked`, trình duyệt ưu tiên phần tử cuối cùng (`opt-4`). Khi bấm lưu, code đọc `querySelector('input[name=...]:checked').value` và lấy giá trị `opt-4`.
- **Sửa tối thiểu:** Xóa bỏ vế thừa trong `src/app/authoring.ts:179`:
  Đổi thành `const isChecked = opt.optionId === q.correctOptionId ? 'checked' : '';`.
- **Bằng chứng:** `ops/blitz/teacher/edited-key.json`; test `CX-T07` trong `proposed.test.mjs`.

---

### CX-teacher-F08 — Tải lại trang tại tab Đề thi bị nhảy về Lớp học

- **Các bước thật đã chạy:** Đăng nhập giáo viên, chuyển sang tab Đề thi (`location.hash = '#/giao-vien/de'`). Nhấn tải lại trang (reload / F5).
- **Actual:** Sau khi trang tải xong, TopBar điều hướng gán `aria-current="page"` cho mục `lop` (Lớp học); nội dung hiển thị là danh sách lớp học thay vì giữ nguyên tab Đề thi.
- **Expected:** Theo WEB-contract §19.1: thanh điều hướng `#teacherNav` gồm các đường dẫn cụ thể `#/giao-vien/lop`, `#/giao-vien/de`, `#/giao-vien/ket-qua`. Khi người dùng truy cập hoặc reload đúng URL hash, hệ thống phải mở đúng tab tương ứng với hash đó.
- **Tác động:** Gây khó chịu và làm mất ngữ cảnh công việc của giáo viên khi refresh trang.
- **Sửa tối thiểu:** Trong `src/app/main.ts:3126` (và `dist/app/main.js:3098`), truyền `state.params.section` vào `teacherCtrl.open(state.params.section)`. Trong `src/teacher/portal.ts`, cho phép `open(initialSection)` tiếp nhận tham số hoặc đọc trực tiếp từ `location.hash` thay vì mặc định cứng `activeSection = 'lop'`.
- **Bằng chứng:** `ops/blitz/teacher/route-reload.json`; test `CX-T08` trong `proposed.test.mjs`.

## 4. Lệnh và kết quả đo thực tế

Chạy tại thư mục gốc `D:\Cunata` trên Windows 11, Node v24.14.0. Không thay đổi code sản phẩm hay dependency.

| Lệnh | Exit code | Pass / Fail / Skip | Log artifact |
|---|---:|---|---|
| `git rev-parse HEAD` | 0 | `e7d8f85c99f28fef83d37187a2101e15be100d7b` | Ghi trong snapshot §1 |
| `node --test ops/blitz/teacher/proposed.test.mjs` | 1 | 6 pass / 8 fail / 0 skip (14 tests) | `ops/blitz/teacher/test-final.log` |
| `node --test test/claude-check/teacher.test.mjs` | 0 | 7 pass / 0 fail / 0 skip (7 tests) | Log console đợt chạy độc lập |
| `node --test --test-name-pattern=teacher test/claude-check/design.test.mjs` | 0 | 2 pass / 0 fail / 0 skip (2 tests) | `ops/blitz/teacher/design.log` |

Chi tiết 14 ca kiểm thử trong `ops/blitz/teacher/proposed.test.mjs`:
1. `AUTH: sai mật khẩu, tài khoản khóa, đăng nhập đúng, đăng xuất`: **PASS** (1073 ms)
2. `CONFIG: chưa cấu hình báo rõ và không gọi Apps Script`: **PASS** (238 ms)
3. `CLASS: tạo lớp, mã hợp lệ, sao chép mã và liên kết mời`: **PASS** (541 ms)
4. `CX-T01: hết phiên phải báo phiên hết hạn, không báo sai mật khẩu`: **FAIL** (550 ms) — Đỏ theo CX-teacher-F01
5. `CX-T02: giáo viên chỉ thấy đề của mình cùng kho đề chung`: **FAIL** (638 ms) — Đỏ theo CX-teacher-F02
6. `EDIT: chỉ đổi tiêu đề giữ nguyên settings, câu hỏi và xuất bản/gỡ được`: **PASS** (1811 ms)
7. `DATES: để trống/hạn trước giờ mở bị chặn; múi giờ UTC+7 chuyển ISO chính xác`: **PASS** (987 ms)
8. `CX-T03: bài nộp hiện ở bảng và CSV với điểm theo D02`: **FAIL** (1641 ms) — Đỏ theo CX-teacher-F03
9. `CX-T04: kết quả có thể chọn lớp và đề được giao`: **FAIL** (1283 ms) — Đỏ theo CX-teacher-F04
10. `CX-T05: CSV chặn tiền tố công thức fullwidth theo WEB §7`: **FAIL** (2223 ms) — Đỏ theo CX-teacher-F05
11. `CX-T06: Escape đóng hộp giao đề và trả focus về nút mở`: **FAIL** (804 ms) — Đỏ theo CX-teacher-F06
12. `CX-T07: sửa nội dung câu I không được tự đổi đáp án có ID opt-1…4`: **FAIL** (585 ms) — Đỏ theo CX-teacher-F07
13. `NEW/ND01: tạo đề mới, chặn xuất bản câu sửa dở, lưu rồi xuất bản được`: **PASS** (662 ms)
14. `CX-T08: tải lại đường dẫn Đề thi giữ đúng mục đang chọn`: **FAIL** (546 ms) — Đỏ theo CX-teacher-F08

## 5. Giới hạn và NOT_RUN

- **NOT_RUN:** Gọi URL Google Apps Script / Google Sheets thật (tuân thủ nghiêm ngặt quy tắc task: chỉ dùng `gas-server.mjs` + `gas-fake.mjs` chạy `apps-script/Code.js` cục bộ).
- **NOT_RUN:** Trình duyệt Firefox / WebKit / Safari di động (kiểm thử hoàn toàn qua headless Chrome qua CDP với viewport và emulation chuẩn).
- **NOT_RUN:** Screen reader chuyên dụng (NVDA / JAWS); chỉ kiểm tra cây accessibility và thuộc tính ARIA qua CDP DOM/AXTree.
- **NOT_RUN:** Chạy `node scripts/build.js` hoặc sửa mã nguồn `src/` (do Antigravity đang build và sửa song song theo phân công của đợt rà soát).

## 6. Gợi ý (không tính là lỗi)

1. **Hiển thị sĩ số lớp học:** Hiện tại sĩ số chỉ tính theo số học sinh đã nộp bài. Có thể cân nhắc thêm nhãn giải thích nhỏ bên cạnh (ví dụ: "3 học sinh đã nộp bài") để giáo viên không nhầm lẫn với danh sách học sinh đã tham gia lớp.
2. **Bộ lọc trạng thái bài giao:** Trong chi tiết lớp học, nếu một lớp có nhiều bài giao, có thể bổ sung các thẻ lọc trạng thái: "Đang mở", "Chưa mở", "Đã hết hạn".

## 7. Đề nghị xử lý

1. Ưu tiên sửa ngay **CX-teacher-F07** (BLOCKER): Đây là lỗi logic nghiệm trọng trong `src/app/authoring.ts:179` khiến mọi câu trắc nghiệm bị ép đáp án đúng thành `opt-4` khi lưu sửa câu.
2. Sửa các lỗi MAJOR về trải nghiệm và phân quyền:
   - **CX-teacher-F02**: Lọc đề thi theo `owner` để bảo vệ quyền riêng tư giữa các giáo viên.
   - **CX-teacher-F03**: Định dạng lại điểm số thập phân theo Quyết định D02 thay vì để phân số thô `1/4/1/2`.
   - **CX-teacher-F04**: Bổ sung bộ chọn đề thi vào màn hình Kết quả `#/giao-vien/ket-qua`.
   - **CX-teacher-F01**: Xử lý `UNAUTHORIZED` cho phiên hết hạn và điều hướng về trang đăng nhập.
3. Hoàn thiện các lỗi MINOR: Esc đóng dialog (`CX-teacher-F06`), CSV escape fullwidth (`CX-teacher-F05`), và giữ route hash sau reload (`CX-teacher-F08`).
