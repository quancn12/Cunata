# R7-TESTS-PRE — Lịch sử điểm học sinh

Ngày kiểm định: 21/11/2026. Chỉ viết/hoàn thiện test; chưa làm sản phẩm.
Baseline HEAD phiên này: `9a1b0e1eb3d52bb7e144a55b3901d4a359b09b41`.
Working tree có nhiều thay đổi sẵn của các task khác; không reset, commit hoặc sửa chúng.

## Căn cứ và cách chạy

- Shared Product Contract v2.0; WEB-contract §24.4, phụ thuộc §23/R3, §22; định dạng điểm §14/D02.
- `docs/LO-TRINH-V2.md`: R7 phụ thuộc R3. DESIGN.md và bảng quyết định được đối chiếu.
- `history.test.mjs`: node:test + assert/strict; `index.js` giúp lệnh thư mục chạy được trên Node 24.
- `support.mjs` import harness/app và lõi API bằng URL tuyệt đối từ `process.cwd()`, nên có thể chuyển nguyên thư mục sang `test/codex-check/feat/R7/`.
- Lõi chạy production `handle` với `createMemoryStore`. HTTP cục bộ gọi chính `handle` và chính store đó, không giả phản hồi RPC.
- Hoàn thiện bộ test có sẵn: thêm C04 kiểm lịch sử sau retry idempotent; seedResults trả payload gốc để gửi lại nguyên văn; chỉ khởi tạo browser khi chạy ca giao diện, không để lỗi browser đánh hỏng ca lõi.
- Browser thật qua harness CDP có sẵn; context sạch; tên nhập ở cổng tên bằng Input.insertText; mọi lần bấm dùng `app.mjs.mouseClick`, kiểm hit target và khung nhìn. Không gán input.value, không seed localStorage/DOM, không rẽ nhánh theo môi trường.
- Phục vụ `dist/` hiện có dưới `/Cunata/`; config được trả tại máy chủ test để trỏ về API cục bộ, CSP giới hạn kết nối cùng nguồn. Không đọc cấu hình production hoặc gọi Google/Vercel/Neon thật.

## Ma trận kiểm định

| Ca | Yêu cầu kiểm tra | Hợp đồng | Kết quả baseline |
|---|---|---|---|
| C00 | HTTP cục bộ và gọi lõi trực tiếp trả cùng dữ liệu getClass từ cùng store | §22 | PASS |
| C01 | myResults đã được triển khai; token giả không nhận lịch sử | §23, §24.4 | FAIL: UNKNOWN_ACTION |
| C02 | myResults giữ đủ ba bài, ID đề/lớp, điểm phân số và ngày nộp gốc | §23, §24.4, §14 | FAIL: addStudents UNKNOWN_ACTION |
| C03 | Học sinh khác/chưa nộp nhận danh sách rỗng, không rò bài bạn cùng lớp | §23, §24.4 | FAIL: addStudents UNKNOWN_ACTION |
| C04 | Gửi lại ba payload cùng attempt, đọc myResults hai lần vẫn đúng ba ID gốc | §22, §23, §24.4 | FAIL: addStudents UNKNOWN_ACTION |
| B00 | Browser qua cổng tên, nhập mã lớp và bấm gửi getClass thật; hiển thị tên đã nhập | §19.1, §21 | PASS |
| B01 | #myHistory có từng đề, lớp, điểm định dạng Việt và ngày nộp đúng myResults | §24.4, §14 | FAIL: addStudents UNKNOWN_ACTION |
| B02 | #historyChart là SVG; cột biểu diễn điểm; có bảng đủ dữ liệu/tiêu đề và cây trợ năng; không tải thư viện ngoài | §24.4 | FAIL: addStudents UNKNOWN_ACTION |
| B03 | Hai context sạch độc lập đăng nhập PIN, gọi myResults và nhận lại lịch sử | §23, §24.4 | FAIL: addStudents UNKNOWN_ACTION |
| B04 | Lịch sử/biểu đồ ở trong viewport 375px, trang không tràn ngang | §9, §24.4; DESIGN §1.4 | FAIL: addStudents UNKNOWN_ACTION |
| B05 | Chưa nộp: myResults rỗng, giải thích trạng thái trống, không hiện bài mẫu/cột điểm giả | §23, §24.4; DESIGN §4 | FAIL: addStudents UNKNOWN_ACTION |

Fixture gồm ba đề tùy chỉnh hai câu I, các tổng 0; 1/4; 1/2 với ngày 18–20/11/2026, hai học sinh mô phỏng cùng lớp. Helper nộp kết quả qua submitResult thật, không ghi tay vào store. Trong các lượt hiện tại, bước này NOT_REACHED vì addStudents chưa có; không lấy log fixture-check.txt từ phiên cũ làm bằng chứng mới.

## Lệnh và kết quả thực đo

Chạy tại `D:\Cunata`, Node v24.14.0, Windows, Chromium qua harness có sẵn.

Kết quả hai lượt hoàn tất được ghi dưới đây sau khi tiến trình kết thúc; các log cũ không dùng thay kết quả phiên này.

<!-- MEASURED_RESULTS -->

| Lượt hoàn tất | Lệnh tại gốc dự án | Exit | Tests | Pass | Fail | Skip/Cancelled | Thời gian | Log |
|---|---|---|---|---|---|---|---|---|
| 1 | `node --test ops/roadmap/tests/R7/` | 1 | 11 | 2 | 9 | 0/0 | 40.987 giây | `ops/roadmap/tests/R7/current-1.tap` |
| 2 (chạy lại) | `node --test ops/roadmap/tests/R7/` | 1 | 11 | 2 | 9 | 0/0 | 22.592 giây | `ops/roadmap/tests/R7/current-3.tap` |

Cả hai lượt: C00/B00 PASS; C01 FAIL với myResults UNKNOWN_ACTION; C02–C04/B01–B05 FAIL với addStudents UNKNOWN_ACTION. Danh sách ca và mục hợp đồng ở ma trận trên; log chứa assertion/stack thực đo.

Một lần chạy xen giữa bị treo ở bước browser/CDP, đã dừng riêng tiến trình của lần chạy đó và chạy lại. Log một phần: `current-2.tap`, ghi chú `current-2.aborted.txt`; tiến trình Node bị dừng có exit=-1, **không phải lượt hoàn tất, không dùng làm bằng chứng đỏ do tính năng hoặc bằng chứng ổn định**. Không khẳng định môi trường browser không có lỗi hạ tầng. Hai lượt hoàn tất có cùng kết quả yêu cầu như trên.

- `npx --no-install tsc -p tsconfig.json`: exit=0; log `ops/roadmap/tests/R7/typecheck-node.txt`.
- `npx --no-install tsc -p tsconfig.web.json`: exit=0; log `ops/roadmap/tests/R7/typecheck-web.txt`.
- `git diff --check -- ops/roadmap/tests/R7 docs/reviews/ROADMAP-R7-tests.md`: exit=0.
- Build: NOT_RUN trong task này vì build ghi ngoài scope. Browser dùng dist hiện có; không chứng nhận dist khớp toàn bộ working tree hiện tại.
- Full suite Claude/design, deploy, dịch vụ thật: NOT_RUN; ngoài việc kiểm định R7 được giao. Không cài dependency.

Ảnh và dữ liệu quan sát thật: `ops/roadmap/tests/R7/evidence/B00..B05.{png,json}` (mỗi lượt ghi đè). Đã xem ảnh B00: tên tiếng Việt đúng và giao diện vào lớp hoạt động. JSON ghi request/action/lỗi và DOM history/chart; không lưu token/PIN. Tên/lớp trong fixture đều mô phỏng.

## Giới hạn và bàn giao

R7 chưa được nghiệm thu. Lỗi C01 chứng minh trực tiếp hành động myResults còn thiếu; C02–C04/B01–B05 đỏ ở phụ thuộc addStudents của R3. Trong hai lượt hoàn tất, đây là phản hồi UNKNOWN_ACTION từ mã sản phẩm, không phải import lỗi, trình duyệt giả hoặc timeout của assertion lịch sử. B00 và C00 là ca kiểm soát cho browser/HTTP thật.

Các assertion dữ liệu lịch sử, retry, hình học cột, bảng trợ năng, lấy lại trên máy sạch và mobile đã được viết nhưng **NOT_REACHED** do thiếu R3. Không suy từ chín ca đỏ rằng đã kiểm chứng được chín lỗi riêng của biểu đồ. Sau khi R3 có API/DOM đúng §23, chạy lại nguyên suite để đánh giá R7; không mock PIN/myResults nhằm vượt phụ thuộc.

Snapshot SHA256 dùng để xác định mã đã đọc/chạy (không phải chứng nhận toàn repo):

`snapshot-start.json` (chụp trong lượt hoàn tất đầu) và `snapshot-end.json` (sau lượt hoàn tất thứ hai) giống nhau cho sáu file API/dist/harness/app đã ghi; HEAD cuối vẫn là SHA baseline. Không suy rộng thành toàn working tree đã đứng yên.

| File | SHA256 |
|---|---|
| src/api/handle.ts | 67A73E805B0F5AFDCA33569C89CE5283F99EBDF3F5F1AABF8A57CE0C476D45F1 |
| src/api/store/memory.ts | F76E35F138396E730105F9B5544C7AADCB1922C56F55DEAF64198C25AA012B69 |
| dist/app/main.js | C096FB56A86122E8F44F590E6DEBB3ACB2960789C70AE6F38DCE309D07E4DD6D |
| dist/student/area.js | 2E9900B22920C661378DB887749319374462FF8B80D7CD7ED39A174DF807FE26 |

Không có quyết định nghiệp vụ mới cần tự chốt cho việc viết test §24.4. Không commit/deploy; điều phối tiếp nhận test đỏ và xử lý phụ thuộc R3 trước.
