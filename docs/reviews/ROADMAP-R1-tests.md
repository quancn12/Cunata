# R1-TESTS — kiểm định trước triển khai

Ngày kiểm: 19/11/2026. Task: R1-TESTS. Kết quả bộ test: **READY_FOR_REVIEW**; sản phẩm R1: **NOT_IMPLEMENTED**, không phải APPROVED/DONE.

Căn cứ: Shared Product Contract v2.0; toàn bộ WEB-contract.md (đặc biệt §17.2–17.6, §19.2, §22); DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md. Không tự chốt thêm nghiệp vụ. HEAD đọc lúc bắt đầu: `dc730bb6b7aea9ebfbccb7e92b3c349243fd80b8`. Working tree đã có nhiều thay đổi và bộ test R1 chưa theo dõi từ trước; kết quả áp dụng cho working tree hiện tại, không chỉ HEAD.

## Lệnh và kết quả thực đo

Chạy từ `D:\Cunata`, Windows/PowerShell, Node v24.14.0, Chrome/Edge headless thật bằng harness CDP có sẵn. Không cài dependency.

| Lệnh | Exit | Tổng | Pass | Fail | Skip / Cancel | Thời gian |
|---|---:|---:|---:|---:|---:|---:|
| `node --test ops/roadmap/tests/R1/` lần 1 cuối cùng | 1 | 31 | 1 | 30 | 0 / 0 | 3783,6001 ms |
| `node --test ops/roadmap/tests/R1/` lần 2 cuối cùng | 1 | 31 | 1 | 30 | 0 / 0 | 3878,1028 ms |
| `.\node_modules\.bin\tsc.cmd -p tsconfig.json` | 0 | — | — | — | — | — |
| `.\node_modules\.bin\tsc.cmd -p tsconfig.web.json` | 0 | — | — | — | — | — |

Log nguyên bản: `ops/roadmap/tests/R1/run-1.tap`, `run-2.tap` (đuôi .tap nhưng nội dung là reporter spec mặc định của Node); `typecheck-node.txt`, `typecheck-web.txt`. Hai log typecheck rỗng vì không có chẩn đoán, exit ghi ở bảng trên.

Build thật `node scripts/build.js` được test gọi trong bản sao cô lập dưới scope, không chạy build ghi đè dist của người khác. Cả hai lần build exit 0, emit 325 file web, **không sinh dist/api/rpc.js hay catalog.json**. Log: `_runtime/run-clZwGW/build.log` (lần 1), `_runtime/run-8PIJID/build.log` (lần 2), đường dẫn tương đối với thư mục R1. Mỗi lần dùng thư mục mới, không tái dùng artifact cũ. Manifest của bản sao được đổi tiêu đề một đề bằng sentinel để bắt catalog gắn cứng/cũ.

Publisher thật được nạp bằng Python `-B`, thay SRC/DST bằng fixture trong scope; manifest giả lập không đọc dữ liệu thật; mọi subprocess/git thật bị chặn. `git add` và `status` chỉ là hàm inert, không stage/commit/push. `ops/prod_config.json` thật không được đọc. Log publish tương ứng nằm trong hai thư mục runtime trên.

Các lượt chẩn đoán trước khi chốt đã phát hiện và sửa hai lỗi kiểm thử: Node không resolve thư mục nếu thiếu index.js; ô đăng nhập tồn tại nhưng ẩn sau màn chọn vai. `index.js` hiện nhập đủ ba file test, browser chọn vai bằng chuột thật trước khi gõ. Không dùng các lượt lỗi kiểm thử đó làm bằng chứng R1 thiếu tính năng. Ca đối chứng API00 còn được chạy riêng: exit 0, pass 1, fail 0 (`control.txt`).

## Danh sách ca và mục hợp đồng

Mỗi tên ca đầy đủ có dạng `dist: [api|glue] R1: <ID> <mô tả> (WEB-contract §...)`. Cột kết quả áp dụng giống nhau cho cả hai lần cuối.

Mã nguyên nhân:

- **A**: assertion `NOT_IMPLEMENTED — thiếu src/api và hàm handle(request, ctx)`; không phải lỗi import uncaught. Thân kiểm định hành vi sau gate này **chưa được thực thi**.
- **N**: assertion thiếu `src/api/store/neon.ts`.
- **S**: assertion thiếu `src/api` để kiểm nguồn.
- **B**: build web thành công nhưng không sinh artifact API yêu cầu.
- **P**: publisher thật chép fixture `dist/api` vào `site/api`; assertion `never copy API into site/` thất bại.

| ID | Mô tả kiểm định | WEB-contract | Lần 1 / Lần 2 |
|---|---|---|---|
| API00 | Giữ Apps Script: fixture đề/bài nộp hợp lệ, retry ALREADY_RECORDED; trình duyệt chọn vai và đăng nhập thật qua emulator | §17.2, §19.1, §22 | PASS / PASS |
| API01 | handle với MemoryStore, không fetch mạng, dữ liệu độc lập | §22 | FAIL A / FAIL A |
| API02 | Admin chưa cấu hình, sai mật khẩu, token giả | §19.2, §22 | FAIL A / FAIL A |
| API03 | Username, mật khẩu tối thiểu, trùng tên, danh sách và stats | §19.2, §22 | FAIL A / FAIL A |
| API04 | Muối riêng; kiểm băm bằng scrypt độc lập; không lưu password/token thô; randomBytes(32) | §22 | FAIL A / FAIL A |
| API05 | Token mới, expiresAt và biên 8 giờ cho Admin/giáo viên | §19.2, §22 | FAIL A / FAIL A |
| API06-lock | Khóa thu hồi mọi phiên; mở khóa không hồi sinh phiên cũ | §19.2, §22 | FAIL A / FAIL A |
| API06-reset | Đặt lại mật khẩu thu hồi mọi phiên; mật khẩu mới đăng nhập được | §22 | FAIL A / FAIL A |
| API07 | Quyền Admin, sở hữu lớp/đề/kết quả giữa hai giáo viên | §19.2, §22 | FAIL A / FAIL A |
| API08 | Mã lớp, getClass, teacherName, NOT_FOUND, listAssignments | §19.1–19.2, §22 | FAIL A / FAIL A |
| API09 | Publish/list/get/update/unpublish; JSON lớn Unicode; revision và metadata | §17.2–17.3, §22 | FAIL A / FAIL A |
| API10 | INVALID_EXAM cho từng loại câu và không lưu bản lỗi | §17.2, §22 | FAIL A / FAIL A |
| API11 | Giao mọi đề catalog; getClass/listAssignments có tên, số câu, thời gian thật | §22 | FAIL A / FAIL A |
| API12 | dueAt > openAt; NOT_OPEN; đúng giờ mở; biên +2 phút; PAST_DUE theo ctx.now | §19.2, §22 | FAIL A / FAIL A |
| API13 | Action mặc định/submitResult; retry tuần tự/8 lần đồng thời; PAYLOAD_CONFLICT không ghi đè | §17.2, §19.2, §22 | FAIL A / FAIL A |
| API14 | Không lộ password, hash, salt, PIN hash trên phản hồi thành công/lỗi | §22 | FAIL A / FAIL A |
| API15 | Node HTTP cục bộ gọi cùng handle; GET công khai và POST JSON | §22 | FAIL A / FAIL A |
| API16 | Browser thật chọn vai, đăng nhập token và xem lớp qua cùng handle; cấu hình tương thích appsScriptUrl | §19.1–19.2, §22 | FAIL A / FAIL A |
| API17 | GET không tạo phiên, tạo dữ liệu hay thực hiện hành động cần quyền | §17.2, §19.2, §22 | FAIL A / FAIL A |
| API18 | Giữ mã lỗi dữ liệu nộp bài của API cũ | §17.2, §22 | FAIL A / FAIL A |
| API19 | Browser thật nhập tên tại cổng, vào lớp, xem tiêu đề đề lấy từ server | §19.1, §22 | FAIL A / FAIL A |
| API20 | apiBase ưu tiên appsScriptUrl, POST application/json cùng nguồn | §22; gate R2 | FAIL A / FAIL A |
| STORE01 | Neon fetch SQL-over-HTTP HTTPS, tự tạo 7 bảng và owner; không log DATABASE_URL | §22 | FAIL N / FAIL N |
| STORE02 | Lỗi HTTP Neon không báo ghi thành công | §22 | FAIL N / FAIL N |
| STORE03 | Tái tạo ctx vẫn giữ dữ liệu/phiên qua Store; Store khác không rò dữ liệu | §22 | FAIL A / FAIL A |
| STORE04 | Mã API TypeScript, chỉ thư viện Node/relative, không Google/SDK ngoài | §22 | FAIL S / FAIL S |
| GLUE01 | Build thật xuất dist/api/rpc.js và package type=module | §22 | FAIL B / FAIL B |
| GLUE02 | Catalog build lấy metadata từ manifest đã đổi trong fixture | §22 | FAIL B / FAIL B |
| GLUE03 | Import graph API tự chứa; import artifact và kiểm hàm Vercel | §22 | FAIL B / FAIL B |
| GLUE04 | Publisher thật: API ở gốc, không site/api, apiBase đúng hai host, giữ Apps Script | §22; phần config/publish gate R2 | FAIL P / FAIL P |
| GLUE05 | Hàm Vercel build thực sự xử lý OPTIONS CORS cho GitHub Pages, POST và content-type | §22; gate tích hợp R2 | FAIL B / FAIL B |

## Phủ từng gạch đầu dòng §22 và phân kỳ

| Gạch đầu dòng | Ca |
|---|---|
| Nguồn TypeScript, Node built-in, lõi handle/ctx.store/ctx.now | API01, API05, API12, STORE03–04 |
| Hai Store; DATABASE_URL; SQL-over-HTTP; 7 bảng; exams.owner | API01, API07, STORE01–03 |
| Điểm vào ES module, GET/POST, build tự chứa, publish api ở gốc | API15, API17, GLUE01, GLUE03–04 |
| Scrypt/muối/token băm/32 byte/8 giờ/thu hồi/Admin/không lộ bí mật/hạn nộp/dedupe | API02–07, API12–14, API18 |
| Catalog sinh từ manifest, tiêu đề thật cho đề tĩnh | API11, API19, GLUE02 |
| apiBase, tương thích appsScriptUrl, hai config và CORS | API00, API16, API20, GLUE04–05 |
| Không chuyển Sheet, giữ Apps Script | API00, STORE04, GLUE04; publisher chạy với nguồn fixture không có Sheet/prod config |
| Giữ hành động/dữ liệu/mã lỗi §17 và §19.2 | API02–03, API07–10, API12–18 |

LO-TRINH-V2 chia lõi/build cho R1, chuyển web/publish cho R2, roster/PIN cho R3. Test chứa gate tích hợp R2 để phủ đầy đủ gạch đầu dòng §22 theo prompt; không dùng ca này để yêu cầu R1 làm trước toàn bộ R2. Bảng students được kiểm khởi tạo ở R1; nghiệp vụ PIN/roster không được thêm vào R1. Giữ các yêu cầu Google Sheets chunk/LockService/ES2019 ở Apps Script cũ; API mới kiểm tương đương dữ liệu lớn/idempotency, không bắt PostgreSQL dùng ô Sheet hay cú pháp ES2019.

## Giới hạn và adapter kỹ thuật

- §22 chưa ấn định tên file export handle, request DTO, factory Store và port cấu hình Admin/catalog. `support.mjs` tập trung adapter: tìm named export handle dưới src/api; request `{method, query, body, headers}`; `createMemoryStore`/`createNeonStore` hoặc createStore/class; ctx có store/now/adminPassword/env/catalog. Đây là giả định nối kỹ thuật công khai, không thêm nghiệp vụ. Khi production có API khác tên/hình dạng, chỉ sửa adapter theo API thật, giữ assertions. Chưa thể chứng minh các thân test sau gate thiếu module chạy được với implementation tương lai.
- API04 quan sát bản ghi MemoryStore có trường username/salt/hash; hỗ trợ digest Buffer/hex/base64 và salt nguyên văn/giải mã. Nếu Store đóng kín hoặc dùng định dạng scrypt khác, cần nối observer hợp lệ trong helper; không coi khác tên trường là lỗi bảo mật.
- HTTP helper chỉ chuyển giao cho handle thật, không có bản sao nghiệp vụ API. Browser dùng mouseClick thật, kiểm viewport và hit target, gõ bằng Input.insertText, không gán value bằng JS hay dò môi trường để bỏ test. API00 đã chạy browser; API16/19/20 chưa tới bước mở browser vì gate API thiếu.
- Neon chỉ được kiểm qua fetch giả chặn mạng và schema/HTTP-error; không phải bằng chứng Postgres lưu bền, SQL transaction hay concurrency thật. Không gọi Google/Vercel/Neon thật. Live và nghiệm thu production R11: **NOT_RUN**, ngoài quyền task.
- GLUE04 lần này dừng ở site/api; assertions hai config và giữ Apps Script sau đó chưa chạy, không được ghi PASS riêng. GLUE05 chưa import được endpoint vì build chưa có API; chưa có bằng chứng CORS chạy.
- Không chạy full suite Claude/regression hoặc nghiệm thu giao diện toàn hệ thống vì task chỉ viết test R1, chưa sửa sản phẩm. Typecheck xanh không chứng nhận R1 hoạt động.
- Không commit, deploy, npm install, sửa dependency hay sửa nguồn sản phẩm. Mọi artifact ghi mới của task nằm trong scope. Thư mục `_runtime` là bản sao nguồn/build/publish fixture phục vụ bằng chứng, không phải code sản phẩm mới.

## Snapshot để đối chiếu

SHA-256 sau kiểm:

HEAD lúc chốt là `5dec88407d7ee50a24c2b01e2bc778b09c723e3e`, đã đổi do tiến trình/người khác trong working tree dùng chung. Task này không thực hiện git add/commit. Năm hash nguồn/contract dưới đây vẫn giống snapshot đã kiểm; không suy rộng kết quả sang thay đổi khác ngoài R1.

| File | SHA-256 |
|---|---|
| docs/contracts/WEB-contract.md | 249E25023FA2ABAA62D09EC9AD5395F602720A49A77D974B9A147C584C22CA17 |
| scripts/build.js | A84EF41085E93BAE1349CF75B9EBD570D3B5CF8F4E5B63F8F4E5B63F8AFBEC19B3A7A8D56 |
| scripts/web-build.ts | 76145757EA9FA702B52CED92786D95C1A3DABE5218BE4C29E9308FA7E4666100 |
| ops/publish.py | A78EC187EA9CCF99D0EE913DF8176CBB04E8073E7D8D02C9E8B1462AA2BE221A |
| apps-script/Code.js | F8E7CBBF6B113BD4A8D97AC00599A2BBCF407F01D2C935BA639AFB5D4BDA2389 |

Bước tiếp theo: worker sản phẩm triển khai R1 theo §22; nối adapter theo chữ ký thật nếu cần; chạy lại đủ ca, phân biệt gate R2; sau khi xanh hai lần và regression Claude xanh mới giao Codex review riêng. Báo cáo này bàn giao **bộ test đỏ trước triển khai**, không nghiệm thu sản phẩm.
