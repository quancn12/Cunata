# R5-TESTS-PRE — kiểm định trước triển khai

Phạm vi: WEB-contract §24.2, kế thừa nội dung xem bài §20, định dạng D02/D08 (§14), quyền đọc §19.2/§22 và Dialog trong DESIGN §4. Đây là bàn giao bộ test, **không nghiệm thu sản phẩm R5**.

## Môi trường và cách chạy

- Working tree chung `D:\Cunata`; HEAD kiểm lại ngày 21/11/2026: `9a1b0e1eb3d52bb7e144a55b3901d4a359b09b41`. Có sẵn nhiều thay đổi của các công việc khác; không sửa hay hoàn tác chúng.
- Node v24.14.0, Windows; Chrome/Edge headless thật qua CDP của `test/claude-check/harness.mjs`. UI phục vụ từ `dist/` hiện có, dưới `/Cunata/`; không chạy build vì build sẽ ghi ngoài scope.
- `support.mjs` import harness/app và API bằng `pathToFileURL(process.cwd() + '/…')`. Chạy từ gốc dự án. Các import nội bộ R5 dùng đường dẫn tương đối, nên chuyển cả thư mục sang `test/codex-check/feat/R5/` vẫn giữ nguyên cách tìm harness/API. `index.js` nạp các `*.test.mjs` cho lệnh directory của Node 24.
- Lõi API: production `handle` + production MemoryStore, clock được inject. Browser gọi một HTTP adapter Node cục bộ dùng chính `handle` và cùng store; không dựng đáp án API giả. Adapter xử lý OPTIONS/content-type cho POST JSON.
- Mọi hành động bấm của bộ R5 dùng `app.mjs.mouseClick`, kiểm hit target và khung nhìn; nhập tài khoản bằng CDP Input.insertText, không gán `.value` hoặc gọi DOM `.click()`.
- Hai tên học sinh là dữ liệu **mô phỏng**, được seed qua `submitResult` để kiểm màn giáo viên. Ca TN nhập từng tên tại cổng `#startName` trong context mới, bằng bàn phím và chuột thật, rồi kiểm đã qua cổng. Không mở khóa `candidateName`, không gán tên bằng JS. Bài nộp được seed trực tiếp qua handle; chưa chạy luồng PIN/làm bài/nộp bài học sinh đầu cuối của R3.
- Hai bài: An chọn sai I.1, bỏ I.2, II đúng 3 ý và bỏ 1 ý, III nhập `1,50` khác key `1,5`, bỏ câu có key `-0,5`; Bình bỏ toàn bộ. Điểm An `0,50/10`, II `0,50/1`, mỗi câu III tối đa `4,25`.
- Fixture đề có công thức, bảng Markdown, ảnh nhúng và chuỗi HTML độc hại inert; câu I và lựa chọn có thứ tự hoán vị khác ID để bắt việc tự sắp lại. Đây là thứ tự đề đã giao trong fixture, chưa phải bằng chứng E2E về thao tác bật trộn ở máy học sinh.
- Cấu hình web chỉ bị thay trong bộ nhớ HTTP thành loopback. Không đọc `ops/prod_config.json`, không gọi Google/Vercel/Neon thật, không install/dependency, không commit/deploy.

## Ma trận ca kiểm định

Tên đầy đủ trong mã theo dạng `dist: [api|teacher] R5: … (WEB-contract §…)`.

| ID | Vùng / mô tả ca | Hợp đồng | Trạng thái dự kiến trên bản chưa có R5 |
| --- | --- | --- | --- |
| A01 | api — đối chứng store giữ câu trả lời thật đã gửi qua handle | §22, §24.2 | Xanh: fixture chứa raw answers thật |
| A02 | api — giáo viên chỉ đọc bài lớp mình, không lộ thông tin xác thực | §19.2, §22 | Xanh: sai/thiếu token, giáo viên khác bị chặn |
| A03 | api — dữ liệu bài làm nguyên văn đến được giáo viên | §24.2, §20 | Đỏ: listResults bỏ câu trả lời |
| A04 | api — xem và gửi lại không sửa hay nhân đôi bài đã nộp | §22, §24.2 | Xanh: immutable, idempotent, token hết 8 giờ |
| TN | teacher — đối chứng tên mô phỏng nhập tại cổng tên bằng bàn phím | §19.1 | Xanh: cả hai tên qua cổng tên bằng thao tác thật |
| T00 | teacher — đối chứng bảng kết quả qua handle cục bộ bằng chuột thật | §22, §19.1 | Xanh: hai bài, đúng tên, không lỗi JS/mạng ngoài favicon, chỉ loopback |
| T01 | teacher — mỗi dòng có nút xem và hộp thoại đúng bài | §24.2, §20 | Đỏ: thiếu `.btn-view-submission` |
| T02 | teacher — đủ câu, thứ tự, nội dung, công thức, bảng, ảnh và lời giải | §24.2, §20, §14 D08 | Đỏ tại nút xem; assertions nội dung chờ hộp thoại |
| T03 | teacher — phần I đủ phương án và phân biệt chọn sai, đáp án, chưa chọn | §24.2, §20 | Đỏ tại nút xem; kiểm ID/thứ tự/toàn văn/nhãn/chosen/correct/chữ và biểu tượng |
| T04 | teacher — phần II giữ bốn mệnh đề, đáp án và ba trạng thái lựa chọn | §24.2, §20 | Đỏ tại nút xem; kiểm a–d, key, true/false/none, không đổi null thành false |
| T05 | teacher — phần III giữ nguyên chuỗi 1,50 khác 1,5 và câu bỏ trống | §24.2, §20 | Đỏ tại nút xem; kiểm nguyên văn, Chưa làm, key âm 4 ký tự |
| T06 | teacher — điểm từng câu và trạng thái không biến II đúng ba ý thành đúng hoàn toàn | §24.2, §20, §14 D02 | Đỏ tại nút xem; điểm đạt/tối đa và trạng thái sai/partial/blank |
| T07 | teacher — đổi học sinh không tái sử dụng bài cũ và hộp thoại hỗ trợ Esc, focus | §24.2, DESIGN §4 | Đỏ tại nút xem; dialog/aria-modal/focus/Esc/trả focus/đúng bài thứ hai |
| T08 | teacher — nội dung đề được escape, không thực thi HTML người dùng | §24.2, §20 | Đỏ tại nút xem; không script/onerror, vẫn giữ nguyên văn |
| T09 | teacher — nút xem và bài làm dùng được ở 375px | §24.2, §9, DESIGN §1/§4 | Đỏ tại nút xem; kiểm khung nhìn và không tràn ngang |
| T10 | teacher — nút xem và bài làm dùng được ở 768px | §24.2, §9, DESIGN §1/§4 | Đỏ tại nút xem; kiểm khung nhìn và không tràn ngang |

## Kết quả thực đo

Hai lượt chạy mã test cuối cùng, từ thư mục gốc; không skip/loại bỏ ca đỏ. Kết quả ngày 21/11/2026:

| Lượt | Lệnh | Exit | Tổng | Pass | Fail | Skip / Cancel | Thời gian |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `node --test ops/roadmap/tests/R5/` | 1 | 16 | 5 | 11 | 0 / 0 | 38,734 giây |
| 2 | `node --test ops/roadmap/tests/R5/` | 1 | 16 | 5 | 11 | 0 / 0 | 112,938 giây |

Log: `ops/roadmap/tests/R5/run-1.log`, `run-2.log`; mã thoát ở `run-1.exit.txt`, `run-2.exit.txt`.

Cả hai lượt: A01, A02, A04, TN và T00 xanh. A03 đỏ tại assertion `listResults phải cung cấp câu trả lời để giáo viên dựng bài, không chỉ điểm`; T01–T10 đỏ tại assertion thiếu `.btn-view-submission` (T01 đo 0/2 dòng có nút). Các ca browser đều đã đăng nhập và tải đủ hai dòng kết quả trước khi kiểm tính năng. Không có lỗi setup hay timeout thay thế lỗi thiếu R5. Thời gian chạy khác nhau nhưng kết quả và nguyên nhân đỏ giống nhau.

Đối chiếu SHA-256 trước/sau không thay đổi ở `src/api/handle.ts`, `src/teacher/portal.ts`, `dist/teacher/portal.js`; hash cuối ở `ops/roadmap/tests/R5/snapshot-final.json`. `git diff --check` trên mã test và báo cáo: exit 0. Rollback phần bổ sung của lượt này: bỏ ca TN và thay đổi thứ tự teardown trong `teacher.test.mjs`, khôi phục báo cáo/log trong scope theo baseline của điều phối; không hoàn tác các thay đổi sản phẩm có sẵn.

## Phát hiện và giới hạn

1. **R5-API-01 — MAJOR:** `src/api/handle.ts:554`, nhánh `listResults`, chiếu điểm/tên/thời gian nhưng bỏ `raw_answers_json` đã lưu. A01 đối chứng store giữ đủ câu trả lời; A03 buộc đầu ra cung cấp dữ liệu câu trả lời cho giáo viên. Sửa trong vùng api; không tự đặt RPC mới trong test.
2. **R5-UI-01 — MAJOR:** `src/teacher/portal.ts:1969`, `renderTableRows`, chưa tạo `.btn-view-submission`/`#submissionDialog`. Screenshot `ops/roadmap/tests/R5/evidence/teacher-1.png` đã được xem trực tiếp trong lượt này: hai dòng bài nộp và các cột điểm hiện đúng, không có nút xem.
3. Mọi assertion sau mở hộp thoại trong T02–T10 hiện **chưa được thực thi đến**. Test đỏ chứng minh entrypoint thiếu; không chứng nhận công thức/ảnh/điểm/focus/XSS trong một hộp thoại chưa tồn tại. Phải chạy lại toàn bộ sau triển khai.
4. Chưa kiểm luồng R3 roster/PIN, runtime shuffle từ máy học sinh và snapshot cũ sau khi giáo viên sửa đề; chưa kiểm Google/Neon/Vercel live. Không dùng kết quả này thay nghiệm thu các luồng đó. §20 về file báo cáo tải về thuộc bộ xem lại bài; §24.2 không quy định nút tải báo cáo riêng cho giáo viên nên không tự thêm yêu cầu đó.
5. Hai typecheck kiểm lại ngày 21/11/2026: `npx --no-install tsc -p tsconfig.json` và `npx --no-install tsc -p tsconfig.web.json` đều exit 0; log trống, mã thoát trong `typecheck-node.exit.txt`, `typecheck-web.exit.txt` ở R5. Build: NOT_RUN vì phát sinh ghi `dist/` ngoài scope. Full regression/design suite: NOT_RUN vì task chỉ viết kiểm định R5 và các suite chung có thể ghi artifact ngoài scope. Production/IME thật: NOT_RUN, không được phép gọi dịch vụ thật và không có thao tác bộ gõ OS.
6. Các log `diagnostic-*`, `teardown-*`, `probe.png` là dấu vết chẩn đoán/đợt trước, không phải bằng chứng hai lần chạy cuối. CORS của adapter đã được sửa trước hai lần bàn giao; không chấp nhận lỗi đăng nhập do helper làm bằng chứng R5 đỏ.

Hành động tiếp theo: điều phối triển khai teacher/api, chạy lại bộ R5 hai lần và regression chung, rồi Codex review độc lập theo LO-TRINH-V2. Bộ test PRE không phải APPROVED cho sản phẩm.
