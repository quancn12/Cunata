# R4-TESTS-PRE — kiểm định viết trước sản phẩm

Ngày: 21/11/2026. HEAD đọc trong lượt kiểm định này: `58fc9d5704f62f02c7ab7be0b590cb3d12e7e797`.
Phạm vi: chỉ `ops/roadmap/tests/R4/**` và báo cáo này; giữ nguyên thay đổi có sẵn trong working tree.
Căn cứ: Shared Product Contract v2.0; WEB-contract §24.1, §20–22, §9, §14; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md, hàng R4.

## Cách chạy và tính độc lập

Chạy tại `D:\Cunata`: `node --test ops/roadmap/tests/R4/`.
Node v24.14.0, Windows, trình duyệt thật do harness Chrome/Edge khởi động qua CDP; viewport 1280×900 và 390×900.
`index.js` là entrypoint để Node 24 nhận đúng đối số thư mục; ca kiểm định nằm trong `review.test.mjs`.
Import harness/app và API qua URL tuyệt đối từ `process.cwd()`; fixture và helper dùng URL tương đối với file test nên có thể chuyển nguyên thư mục sang `test/codex-check/feat/R4/`.

`local-server.mjs` dùng **chính** `src/api/handle.ts` và `MemoryStore`, không dựng phản hồi API giả. Lõi được gọi trực tiếp và đối chiếu HTTP thật. Trình duyệt đọc cấu hình ghi đè chỉ trong bộ nhớ, `apiBase` trỏ loopback và `appsScriptUrl` rỗng; ca nền xác nhận trình duyệt đã gọi máy chủ đó.
Không đọc cấu hình production, không gọi Google/Vercel/Neon, không thêm gói, không commit/deploy.

Luồng trình duyệt: chọn Học sinh bằng chuột thật → nhập tên tại cổng tên bằng CDP nhập văn bản → tiếp tục bằng chuột thật → nạp fixture qua input file ẩn được §21 giữ lại → chọn đáp án và nộp qua chuột thật. Không gán input.value bằng JavaScript, không sửa state/DOM sản phẩm. Kiểm phần tử trong khung nhìn **trước** thao tác và kiểm hit-test do `mouseClick` trả về. Đường nạp file tránh phụ thuộc vào R3/PIN vì R4 chỉ phụ thuộc R0.

Fixture có 9 câu: mỗi phần I/II/III có một đúng hoàn toàn, một sai hoàn toàn, một bỏ trống. III dùng `1,5` đúng và `1,50` sai. Oracle độc lập: MAX I=3/4, MAX II=3, mỗi III=25/12; tổng đạt=1/4+1+25/12=10/3, hiển thị `3,33 / 10` theo D02. Mọi ca giao diện xác nhận toàn bộ câu trả lời và điểm nền trước khi kiểm R4, tránh đỏ do fixture/setup hỏng.

## Danh sách ca và ánh xạ hợp đồng

Tên đầy đủ có tiền tố `dist: [report] R4:` và hậu tố `(WEB-contract §…)` trong file test.

| # | Mô tả ca | Hợp đồng | Kỳ vọng / nguyên nhân đỏ |
|---|---|---|---|
| 1 | lõi máy chủ bộ nhớ giữ nguyên đề và HTTP dùng cùng handle | §22, §20 | getExam giữ nguyên JSON; HTTP bằng lời gọi lõi |
| 2 | báo cáo nền có chín câu đúng sai bỏ trống và tên cổng tên | §20, §21, §19.1 | Đủ thứ tự, câu trả lời nguyên văn, tên và điểm; trình duyệt gọi RPC cục bộ |
| 3 | ba nút tiếng Việt và trạng thái aria-pressed ban đầu | §24.1 | Thiếu ba nút all/wrong/blank trong #reviewFilter; actual=[] |
| 4 | lọc wrong giữ đúng tập câu I II III | §24.1 | Thiếu nút #reviewFilter button[data-filter="wrong"] |
| 5 | lọc blank giữ đúng tập câu I II III | §24.1 | Thiếu nút #reviewFilter button[data-filter="blank"] |
| 6 | chuyển Sai Bỏ trống Tất cả không mất nội dung hay điểm | §24.1, §20 | Thiếu nút wrong ở bước đầu; sau khi có tính năng sẽ kiểm đổi qua lại, khôi phục đủ câu, nội dung/điểm bất biến |
| 7 | thanh số câu ánh xạ đủ và duy nhất tới thẻ thật | §24.1, §20 | Thiếu #reviewNav a; actual=[]; yêu cầu đích #q-… đúng thứ tự, không trùng và nhãn số câu |
| 8 | câu sai bỏ trống có nhãn chữ trên thanh số và thẻ | §24.1 | Thiếu liên kết/nhãn thanh số; nhãn đọc được actual='' |
| 9 | chuột thật nhảy tới câu trong khung nhìn 1280px | §24.1, §9 | Thiếu liên kết #reviewNav đến câu cuối; chưa đến được bước bấm/đo đích |
| 10 | chuột thật nhảy tới câu trong khung nhìn 390px | §24.1, §9 | Thiếu liên kết tương tự trên điện thoại; sau khi có tính năng sẽ đo nhảy hai chiều, ngang màn hình và hit-test |

Tất cả ý trong §24.1 được ánh xạ: ba nút/aria-pressed (3–6), tập thẻ sau lọc và khôi phục (4–6), href/đích thật/số câu (7), nhảy thật bằng chuột và vị trí sau nhảy (9–10), nhãn chữ sai/bỏ trống (8).
Ca đỏ dừng ở assertion thiếu tính năng; **không coi các assertion phía sau điểm dừng là đã thực thi**.

## Kết quả thực đo

Lượt 1: `node --test ops/roadmap/tests/R4/` → exit=1; 10 ca, pass=2, fail=8, cancelled=0, skipped=0; duration=120666,1347 ms. Log: `ops/roadmap/tests/R4/run-1.log`.

Lượt 2: `node --test ops/roadmap/tests/R4/` → exit=1; 10 ca, pass=2, fail=8, cancelled=0, skipped=0; duration=71827,7348 ms. Log: `ops/roadmap/tests/R4/run-2.log`.

Cả hai lượt: ca 1–2 PASS; ca 3–10 FAIL đúng tại các assertion thiếu bộ lọc/thanh số câu mô tả ở bảng trên, cùng điểm dừng và nguyên nhân. Không có lỗi nạp module, fixture, trình duyệt, timeout hay assertion điểm nền. Đây là bằng chứng đỏ ổn định trước triển khai, không phải nghiệm thu sản phẩm. Các log `debug.log`, `runner-preflight.log`, `baseline-final.log` là chẩn đoán cũ có sẵn khi nhận task, không dùng làm bằng chứng kết quả hai lượt hiện tại.

Đối chiếu chỉ đọc: không có `reviewFilter`/`reviewNav` trong `src/report/` và `dist/report/`. HEAD và hash hai module dist bên dưới giữ nguyên ở lần kiểm tra cuối hai lượt. Test `review.test.mjs` có SHA256 `DF63CBE5374DF8D9C94991B5FD0646C5E7C2E9D1CCB64B685424558186AB8EC7`.

Hai typecheck đã chạy, exit=0:

- `npx --no-install tsc -p tsconfig.json` → `ops/roadmap/tests/R4/typecheck-node.log`.
- `npx --no-install tsc -p tsconfig.web.json` → `ops/roadmap/tests/R4/typecheck-web.log`.

## Giới hạn

Chỉ kiểm định R4, không nghiệm thu sản phẩm hay toàn bộ roadmap. Không quy định thêm cách gộp điểm một phần của câu II vào bộ lọc Sai; fixture dùng câu sai hoàn toàn và bỏ trống hoàn toàn, không tự chốt policy chưa ghi trong §24.1.
Không yêu cầu thêm bộ lọc vào file HTML tải về vì §24.1 không ghi rõ yêu cầu tương tác đó; nội dung báo cáo tải về thuộc bộ kiểm định §20.
Không chạy full suite Claude, toàn bộ kiểm định thiết kế, OS IME, nhiều engine trình duyệt hay deploy thật trong task viết test này.
Không chạy build vì build ghi ngoài scope (`dist/`, staging); kiểm trình duyệt trên bản `dist/` có sẵn và đối chiếu source chỉ đọc. Chưa chứng nhận parity của một bản build mới.

Snapshot SHA256 đã đọc:

- `src/app/main.ts`: `148A7B57C774FAEF0091F2FF1EC66CA30F7568F9B2FBC443A45B7225842BCFF4`.
- `dist/app/main.js`: `F3C310F4664052E8BB286EDF884D6FA86806DC57EA8CB261A2C35EB8BC932F2D`.
- `src/report/view.ts`: `26242271D422FEEAACDCE5B65DBFC3CFAA3EA8E941838D3F90A71E3802D28349`.
- `dist/report/view.js`: `F3DC69CB43CFC6207387E741D24D4EB08BE473794E72556D6B600699BCA3D133`.

Hướng tiếp theo: worker triển khai §24.1 rồi chạy lại nguyên bộ test hai lần; kiểm định source riêng vẫn cần thiết trước nghiệm thu R4.
