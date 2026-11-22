Verdict: APPROVED

# R2-REVIEW-1 — Web dùng apiBase và gói xuất bản API

- reviewer: Codex
- reviewed_at: 2026-11-23
- requirements: Shared Product Contract v2.0; WEB-contract §17.1–17.6, §18–19, §22; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md (R2).
- risk_level: HIGH — chuyển đường gửi thông tin đăng nhập/kết quả và đóng gói máy chủ.
- first_commit: `f4d9995` — `Lộ trình R2: test kiểm định của Codex (1 file) — vòng lặp giao Anti làm`.
- base_commit: `2019a03` (cha của commit đầu R2).
- head_commit: `66eb71d6b332f42db8702334800d0394bd0e3d71`.
- reviewed_diff: `git log f4d9995^..HEAD`, `git diff f4d9995^ HEAD`, cộng phần R2 trong working tree chưa commit. Khoảng commit này thêm bộ kiểm định R2 và R4; không có bản sửa sản phẩm mới được commit trong khoảng đó. R4 nằm ngoài kết luận này.

## Giả định và phạm vi

1. Đối tượng nghiệm thu là source hiện có trong working tree, gồm các bản sửa chưa commit, không chỉ HEAD. Không coi thay đổi khác trong working tree là do phiên review tạo ra.
2. R2 được nghiệm thu bằng máy chủ cục bộ và publish sandbox, theo hàng R2 của LO-TRINH-V2.md. Kiểm thử dịch vụ thật/bật máy chủ thật thuộc R11. Không cần quyết định nghiệp vụ mới cho kết luận này; `BLOCKED_QUESTION: NONE`.
3. Để tuân thủ phạm vi chỉ sửa báo cáo, build/test chạy trên bản sao tạm của source hiện tại, không tạo branch/worktree Git. Không chép cấu hình production. Dùng dependency đã cài qua junction node_modules, không cài gói. Bản sao có 509 file đầu vào; đối chiếu SHA-256 với workspace không thấy drift ở lần kiểm cuối.
4. Không chứng nhận R3, R4, toàn bộ sản phẩm hoặc khả năng hoạt động trên dịch vụ thật từ kết quả này.

## Kết quả rà soát

**Open findings: NONE.** Không còn lỗi R2 đã chứng minh cần yêu cầu sửa trong snapshot này.

- `src/collect/appsScript.ts:15–48`: cấu hình đọc bằng đường dẫn tương đối với `cache: 'no-store'`; apiBase khác rỗng thắng appsScriptUrl, chọn POST application/json; khi thiếu apiBase vẫn giữ transport Apps Script text/plain và redirect. Không lấy endpoint từ query URL hoặc file đề.
- `src/app/main.ts:1204`, `src/app/main.ts:3723`, `src/app/main.ts:3842`, `src/admin/main.ts:28`: collector, client giáo viên/học sinh, authoring và Admin nhận đúng backend/content type. Đã theo đường gọi vào portal và callback xuất bản, không chỉ kiểm helper resolveBackend.
- `scripts/web-build.ts:259–378`, `ops/publish.py:126–168`: build tạo gói API tự chứa, package ES module, catalog từ danh mục đề; entrypoint import tĩnh handle và NeonStore. Publisher giữ mã gói trong api/_lib, rpc.js chuyển tiếp ở gốc, includeFiles tương ứng; không đặt API trong site/. Cấu hình Vercel dùng /api/rpc, Pages dùng URL Vercel tuyệt đối; Apps Script vẫn được giữ.
- R2-F01 đã được sửa trong `scripts/web-build.ts:487`, `scripts/web-build.ts:604–628`: service worker bỏ qua GET RPC và loại bỏ cache RPC cũ. Regression trình duyệt đã chứng minh sửa/xóa đề phía máy chủ hiện ra ở lần đọc kế tiếp dù trang được service worker điều khiển.
- R2-F02 đã được sửa trong `src/collect/appsScript.ts:1522–1663` và `src/collect/index.ts:244–275`: không xác nhận thành công với JSON rỗng, thiếu success, sai attempt, trạng thái lạ, thiếu thời gian hoặc hash phản hồi mâu thuẫn. Adapter vẫn tương thích envelope hiện có của hai máy chủ; không yêu cầu server bổ sung trường ngoài hợp đồng.
- Rà soát gian lận: diff của `test/codex-check/feat/R2/r2.test.mjs` và `test/claude-check/` so với HEAD rỗng. Không thấy nhánh sản phẩm dò tên/id test, r2teacher/r2-published, hay bộ kiểm định để giả kết quả. Bridge Node trong build dùng khả năng runtime chung; probe gói độc lập thực sự chạy GET/POST. Không thấy nới assertion để che lỗi trong phạm vi diff đã xem.
- R2 kiểm bằng browser thật: ưu tiên apiBase khi đồng thời có URL cũ, Admin chỉ có apiBase, POST JSON qua hai origin cục bộ, vào lớp/làm/nộp với metadata nguyên vẹn, lỗi 503 không báo đã gửi và vẫn tải báo cáo, fallback Apps Script theo redirect. Test dùng handle sản phẩm với MemoryStore; không coi đây là Neon thật.

## Kiểm tra đã chạy

Môi trường: Windows, PowerShell, Node v24.14.0, TypeScript đã cài trong workspace, Chrome/Edge headless qua harness CDP có sẵn. Thư mục chạy và log: `%TEMP%/cunata-r2-review-h04rx8hn/`.

| Lệnh | Exit | Kết quả | Log |
| --- | ---: | --- | --- |
| `node scripts/build.js` | 0 | PASS, emit/promote 148 file | `review-build.log` |
| `npx --no-install tsc -p tsconfig.json` (chạy sạch sau R2) | 0 | PASS | `review-tsc-clean.log` |
| `npx --no-install tsc -p tsconfig.web.json` (chạy sạch sau R2) | 0 | PASS | `review-tsc-web-clean.log` |
| `node --test "test/codex-check/feat/R2/**/*.test.mjs"` lần 1 | 0 | 21 pass, 0 fail, 0 skip; 93.475 giây | `review-r2.log` |
| Cùng lệnh R2 lần 2, cùng source | 0 | 21 pass, 0 fail, 0 skip; 12.186 giây | `review-r2-second.log` |
| `node --test "test/claude-check/*.test.mjs"` | 0 | 104 pass, 0 fail, 0 skip; 5 suites, 98.376 giây | `review-claude.log` |
| `node --test "test/app/r2-f01-service-worker.test.mjs" "test/collect/r2-f02-regression.test.ts"` | 0 | 11 pass, 0 fail, 0 skip; 1.868 giây | `review-r2-fixes.log` |

Hai lượt tsc đầu tiên exit 1, TS2451 trùng khai báo process, vì chạy đồng thời lúc R2 tạo `test/codex-check/feat/R2/_artifacts/build-input-*/src` nằm trong glob của tsc. Đây là xung đột giữa lệnh kiểm tra trong bản sao tạm. Đã chờ R2 tự dọn input rồi chạy lại nguyên lệnh, cả hai exit 0; không sửa tsconfig/source/test để làm xanh. Log ban đầu: `review-tsc.log`, `review-tsc-web.log`. Build có cảnh báo DEP0190 của Node; không có lỗi build.

## Dấu vân tay source đã kiểm

Manifest đầy đủ: `%TEMP%/cunata-r2-review-h04rx8hn/review-snapshot.json`; SHA-256 của manifest: `05badf0ded69fdc94c881457d3f446aa55577dda143b0ebb5ea807fa506b838b`.

| File | SHA-256 |
| --- | --- |
| src/collect/appsScript.ts | `6bff5ab9401292789280916a6caa585bf3eaf7fb5482707228253cf79bbc73aa` |
| src/collect/index.ts | `883ae86f1d41c13c01d63077267c459e6df76a996753cd3994fc0e01f7a52293` |
| src/app/main.ts | `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf` |
| src/app/authoring.ts | `7ade04efca45baae43ff28e1186728d5216b47d25bc704e17bd12bedd07829d6` |
| src/app/exam-list.ts | `d811b71bb6cd62e20bf7ed0273cfeb1f20487c7dd98aa5f39f57c90285bee68d` |
| src/admin/main.ts | `176e8e88e743976bf0de3642973216763b5419379b7f8b59adf0f660eec27f63` |
| scripts/web-build.ts | `86a8ffbcdb677bd0175ea6ca0dc95c5513007dcef881d2feb05c89323223ec6b` |
| ops/publish.py | `c66ad3443bad774da3c717231b2170f75b2113bc9696144426d6014bd0499e03` |
| test/codex-check/feat/R2/r2.test.mjs | `3a0381d020f55c61e9aaef0e913410ddd1da792aa6774e961951947035f96042` |

## Giới hạn và bàn giao

- Google/Vercel/Neon thật, production CORS/readback, triển khai thật: **NOT_RUN**, bị cấm bởi task; không suy ra PASS từ mock. Publish chỉ chạy logic copy trong sandbox với git/subprocess/network bị chặn và cấu hình giả. Không đọc `ops/prod_config.json` thật.
- Không chạy toàn bộ unit/oracle ngoài yêu cầu; không kiểm nghiệm mọi tính năng R1/R3 hoặc mọi runtime Node. Kết quả runtime của gói ở đây là Node 24.14.0.
- Phiên này chỉ tạo `docs/reviews/ROADMAP-R2.md`; không sửa code, dependency hay bộ kiểm định, không commit/deploy.
- recommended_action: chấp nhận R2 trên snapshot có dấu vân tay trên; điều phối tích hợp các bản sửa đang có. Nếu source đổi sau snapshot phải kiểm lại phần liên quan. Việc bật dịch vụ thật vẫn theo R11 và quyền của Trưởng phòng.
