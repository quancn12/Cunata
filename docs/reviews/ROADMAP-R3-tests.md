# R3-TESTS-PRE — Kiểm định trước khi làm sản phẩm

RESULT: R3-TESTS-PRE / READY_FOR_REVIEW

Ngày đo: 21/11/2026. Baseline HEAD: `9a1b0e1eb3d52bb7e144a55b3901d4a359b09b41`, nhánh `main`, working tree có thay đổi sẵn của các worker khác. Không commit, không build lại dist, không deploy, không thêm dependency. READY_FOR_REVIEW áp dụng cho bộ test trước triển khai, **không phải nghiệm thu R3**.

Nguồn: Shared Product Contract v2.0; WEB-contract đọc toàn bộ, đặc biệt §19–23; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md mục R3. Giữ tên nhập ở cổng tên cho bước vào khu học sinh; khi làm bài trong lớp phải dùng tên danh sách đã xác nhận PIN (§23).

## Kết quả thực đo

Chạy tại `D:\Cunata`, Node `v24.14.0`, Windows, Chrome/Edge headless qua harness CDP có sẵn. Lệnh cho **cả hai lần**: `node --test ops/roadmap/tests/R3/`. Trình chạy `verify.mjs` chỉ thu stdout/stderr nguyên UTF-8 và exit code; không biến kết quả đỏ thành xanh.

| Lần | Thời gian UTC | Exit | Số đo từ node:test |
|---|---|---|---|
| 1 | 2026-11-21T15:57:43.419Z → 2026-11-21T16:00:00.302Z | 1 | ℹ tests 35; ℹ pass 2; ℹ fail 33; ℹ cancelled 0; ℹ skipped 0 |
| 2 | 2026-11-21T16:00:00.303Z → 2026-11-21T16:01:08.422Z | 1 | ℹ tests 35; ℹ pass 2; ℹ fail 33; ℹ cancelled 0; ℹ skipped 0 |

Hai lần cùng 35 ca: **2 PASS, 33 FAIL, 0 skip, 0 cancelled**. Hai ca xanh là nền API và browser R2. Các ca đỏ bắt đúng tính năng chưa có: API trả UNKNOWN_ACTION; giao diện chưa có rosterPanel/rosterInput và thông báo lớp rỗng. Không có lỗi import, lỗi HTTP adapter, hook failure hoặc test timeout tổng 90 giây trong hai lần này. Timeout chờ DOM 5/10 giây bên trong ca là kiểm tra phần tử/tin nhắn chưa được triển khai, xem ảnh và JSON tương ứng.

Hai typecheck đã chạy mới: `npx --no-install tsc -p tsconfig.json` exit=0 và `npx --no-install tsc -p tsconfig.web.json` exit=0; compiler 7.0.2. Đã xác nhận lại bằng `node node_modules/typescript/bin/tsc -p <config>`, cả hai exit=0; lệnh và kết quả nằm trong `typecheck-main.log`, `typecheck-web.log` ở thư mục R3 (đã thay kết quả lỗi cũ).

Hash trước/sau của các file được liệt kê trong `evidence.json`: **không đổi**. Đây là tập hash được chọn, không phải chứng nhận toàn bộ working tree bất biến.

## Danh sách từng ca

Tên đầy đủ trong log thêm tiền tố `dist: ` và hậu tố `(WEB-contract §23)`. Gạch 1–5 dưới đây là năm gạch đầu dòng của §23, không tạo điều khoản mới.

| # | Ca | Điều khoản | Lần 1 / 2 | Nguyên nhân đo được |
|---|---|---|---|---|
| 1 | [api] R3: tiền điều kiện R2: giáo viên, lớp, đề và bài giao tồn tại qua handle thật | §22, §19.2 (nền cho §23) | PASS / PASS | Tiền điều kiện R2 hoạt động |
| 2 | [api] R3: thêm và đọc tên Unicode, ID ổn định, PIN 4 chữ số duy nhất trong lớp | §23 gạch 1; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 3 | [api] R3: PIN lưu băm và không rò băm hoặc PIN qua GET công khai | §23 gạch 1; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 4 | [api] R3: addStudents từ chối token thiếu hoặc sai | §23 gạch 1; §22 | FAIL / FAIL | Hành động chưa có: nhận `UNKNOWN_ACTION`, cần `UNAUTHORIZED` |
| 5 | [api] R3: addStudents từ chối giáo viên khác với FORBIDDEN và không đổi dữ liệu | §23 gạch 1; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 6 | [api] R3: listStudents từ chối token thiếu hoặc sai | §23 gạch 1; §22 | FAIL / FAIL | Hành động chưa có: nhận `UNKNOWN_ACTION`, cần `UNAUTHORIZED` |
| 7 | [api] R3: listStudents từ chối giáo viên khác với FORBIDDEN và không đổi dữ liệu | §23 gạch 1; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 8 | [api] R3: resetPin từ chối token thiếu hoặc sai | §23 gạch 1; §22 | FAIL / FAIL | Hành động chưa có: nhận `UNKNOWN_ACTION`, cần `UNAUTHORIZED` |
| 9 | [api] R3: resetPin từ chối giáo viên khác với FORBIDDEN và không đổi dữ liệu | §23 gạch 1; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 10 | [api] R3: removeStudent từ chối token thiếu hoặc sai | §23 gạch 1; §22 | FAIL / FAIL | Hành động chưa có: nhận `UNKNOWN_ACTION`, cần `UNAUTHORIZED` |
| 11 | [api] R3: removeStudent từ chối giáo viên khác với FORBIDDEN và không đổi dữ liệu | §23 gạch 1; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 12 | [api] R3: đặt lại PIN, PIN mới đăng nhập được và PIN cũ bị từ chối | §23 gạch 1–2 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 13 | [api] R3: xóa học sinh, đọc lại không còn và không đăng nhập được | §23 gạch 1–2 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 14 | [api] R3: đúng PIN trả studentToken và tên trong danh sách, sai mã/lớp/PIN bị từ chối | §23 gạch 2 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 15 | [api] R3: sai 5 lần khóa đủ 10 phút, đổi client không bỏ khóa, không khóa học sinh khác | §23 gạch 2 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 16 | [api] R3: đăng nhập đúng ngắt chuỗi sai liên tiếp | §23 gạch 2 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 17 | [api] R3: bài nộp lưu student_id và tên danh sách thay tên tự do, retry không nhân bản | §23 gạch 3; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 18 | [api] R3: myResults chỉ trả bài của đúng học sinh, đủ dữ liệu để xem lại ở máy khác | §23 gạch 4; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 19 | [api] R3: PIN vẫn khác nhau khi thêm nhiều đợt và reset nhiều học sinh | §23 gạch 1; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 20 | [api] R3: ID học sinh hợp lệ không đăng nhập được bằng mã của lớp khác | §23 gạch 2 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 21 | [api] R3: phiên học sinh không thể gán bài nộp cho ID học sinh khác | §23 gạch 3; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 22 | [api] R3: myResults giữ nhiều lượt đã nộp của học sinh đang đăng nhập | §23 gạch 4; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo |
| 23 | [api] R3: myResults không cho token thiếu/sai hoặc phiên giáo viên đọc bài học sinh | §23 gạch 4; §22 | FAIL / FAIL | Hành động chưa có: nhận `UNKNOWN_ACTION`, cần `UNAUTHORIZED` |
| 24 | [glue] R3: tiền điều kiện: dist dùng apiBase cục bộ, đăng nhập và mở chi tiết lớp bằng chuột thật | §22, §19.2 (nền cho §23) | PASS / PASS | Tiền điều kiện R2 hoạt động |
| 25 | [teacher] R3: chi tiết lớp hiện rosterPanel, textarea và các nút trong khung nhìn 375px | §23 gạch 1; §22 | FAIL / FAIL | Đã mở chi tiết lớp; thiếu `#rosterPanel` |
| 26 | [teacher] R3: chi tiết lớp hiện rosterPanel, textarea và các nút trong khung nhìn 768px | §23 gạch 1; §22 | FAIL / FAIL | Đã mở chi tiết lớp; thiếu `#rosterPanel` |
| 27 | [teacher] R3: chi tiết lớp hiện rosterPanel, textarea và các nút trong khung nhìn 1440px | §23 gạch 1; §22 | FAIL / FAIL | Đã mở chi tiết lớp; thiếu `#rosterPanel` |
| 28 | [teacher] R3: nhập mỗi dòng một tên, hiện PIN mới và tải lại vẫn đủ tên | §23 gạch 1; §22 | FAIL / FAIL | Thiếu `#rosterInput` để nhập danh sách |
| 29 | [teacher] R3: nút reset PIN và xóa tác động đúng hàng trên máy chủ | §23 gạch 1; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới thao tác UI R3 |
| 30 | [teacher] R3: in danh sách tên và PIN bằng nút rosterPrint | §23 gạch 1; §22 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới thao tác UI R3 |
| 31 | [student] R3: lớp chưa có danh sách hiện thông báo nhờ giáo viên thêm tên | §23 gạch 2 | FAIL / FAIL | Không hiện thông báo lớp chưa có danh sách |
| 32 | [student] R3: mã lớp hiện tên để chọn, PIN sai có pinError và không mở bài | §23 gạch 2 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới thao tác UI R3 |
| 33 | [student] R3: đúng PIN dùng tên danh sách, nộp student_id rồi máy sạch khác dựng lại đầy đủ báo cáo | §23 gạch 2–4; §20 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới thao tác UI R3 |
| 34 | [student] R3: PIN sai năm lần hiện khóa do máy chủ, tải lại không bỏ được khóa | §23 gạch 2 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới thao tác UI R3 |
| 35 | [teacher] R3: bảng kết quả liệt kê cả học sinh chưa nộp, không chỉ các lượt đã gửi | §23 gạch 5 | FAIL / FAIL | `addStudents` → `UNKNOWN_ACTION`; chưa tới thao tác UI R3 |

## Phủ yêu cầu và giới hạn bằng chứng

- **Gạch 1:** thêm tên nhiều dòng/Unicode; ID bền; PIN chuỗi 4 chữ số, khác nhau trong lớp qua nhiều đợt và reset; lưu băm; từ chối token sai và giáo viên khác cho cả bốn hành động; reset/xóa đúng học sinh; rosterPanel/input/save/print; tên và PIN trong luồng in thật. Viewport 375/768/1440, cuộn tới rồi đo toàn phần tử trong khung nhìn trước khi bấm.
- **Gạch 2:** mã lớp → chọn tên → PIN; sai PIN có lỗi và không mở bài; lớp rỗng có nguyên câu báo quy định; đúng PIN trả studentToken/name; sai lớp/ID bị từ chối; 5 lần sai khóa ở máy chủ, kiểm ranh 599999/600000 ms bằng ctx.now; học sinh khác không bị khóa; đăng nhập đúng ngắt chuỗi sai; client mới không bỏ được khóa.
- **Gạch 3:** candidateName chỉ đọc, khớp roster thay tên tự do ở cổng; submit thực gửi student_id; máy chủ không nhận danh tính giả của học sinh khác; retry không thêm kết quả.
- **Gạch 4:** myResults cần studentToken và cách ly từng học sinh, giữ nhiều lượt và thông tin đề/lớp/bài giao/điểm từng phần/thời điểm/câu trả lời; đăng nhập lại bằng context sạch không sao chép localStorage/IndexedDB. Thẻ phải hiện Đã nộp + điểm, nút Xem kết quả dựng báo cáo §20 đủ đề bài, 4 phương án và 4 mệnh đề, đáp án/chọn, trả lời ngắn và lời giải; kiểm điểm gốc 10/10 cùng từng phần trước khi so sánh.
- **Gạch 5:** chọn lớp/bài giao bằng select thật; resultsTable gồm cả học sinh đã nộp có điểm và từng học sinh chưa nộp có chữ Chưa nộp.

**Giới hạn:** nhiều ca phụ thuộc addStudents đang dừng ngay tại API thiếu, nên các assertion phía sau (khóa, in, nộp định danh, myResults, báo cáo máy khác và bảng chưa nộp) **chưa chạy tới**. Không coi chúng là lỗi downstream đã chứng minh, hoặc là các luồng đã xác minh hoàn chỉnh. Chưa đo uniqueness dưới concurrency, Neon thật, dịch vụ thật, IME OS, toàn bộ ma trận sáng/tối/keyboard hay hồi quy toàn dự án. Đây là bộ test trước triển khai; phải chạy lại khi R3 có sản phẩm. Không cần tự quyết thêm thời hạn studentToken, quy tắc tên trùng hay khả năng truy hồi PIN cũ từ hash; không áp các policy chưa được hợp đồng chốt. PIN mới lấy từ phản hồi thêm/reset; tải lại chỉ bắt buộc còn danh sách, không yêu cầu đảo ngược hash.

## Cách chạy và bằng chứng

- Chạy lệnh trên từ gốc dự án. `index.js` là entrypoint cho đối số thư mục của Node 24; import hai file *.test.mjs. `support.mjs` import harness/app và src/api/index.ts bằng pathToFileURL(process.cwd() + ...), nên phần test không phụ thuộc độ sâu thư mục khi chuyển sang test/codex-check/feat/R3/.
- API gọi production handle + createMemoryStore. Browser gọi cùng handle qua Node HTTP localhost; public/config.json chỉ được override trong bộ nhớ với apiBase loopback. Không fake R3 response, không đổi hành vi theo môi trường, không gán value bằng JS, không sửa product source/dist.
- Mọi nút dùng helper mouseClick trong app.mjs; text nhập qua CDP Input.insertText sau chuột thật và Ctrl+A. Không gọi DOM click. Luồng in quan sát beforeprint thật, không thay window.print bằng stub thành công.
- Browser sạch và cấu hình localhost; chặn HTTPS trong trang thử. Không đọc ops/prod_config.json, không gọi Google/Vercel/Neon thật. Dữ liệu tên/lớp/tài khoản là mô phỏng.
- `run-1.log`, `run-2.log`, `evidence.json`: lệnh/exit/số ca/hash. `failure-*.json`: tên ca, lỗi, hành động RPC, văn bản trang nếu đã mở. `failure-*.png`: ảnh thật khi đã có trang. Các ảnh/JSON cùng tên được cập nhật bởi lần 2; hai log giữ riêng kết quả hai lần. Đã xem ảnh viewport 375px: chi tiết lớp và đề giao hiện bình thường nhưng chưa có roster. Favicon 404 chỉ là log phụ, không phải lý do test đỏ.

Khuyến nghị: giao worker R3 triển khai §23 trong phạm vi sản phẩm được điều phối cấp; giữ nguyên assertions rồi chạy lại hai lần. Chưa phê duyệt R3, chưa chuyển test sang thư mục ngoài phạm vi được cấp.
