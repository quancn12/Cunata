# CK-AUDIT-69

verdict: **APPROVED**

- review_id/task_id: CK-AUDIT-69; reviewer: Codex; verified_at: 2026-11-22; risk_level: HIGH.
- base_commit của task: HEAD; snapshot đã kiểm: `7215f47506afe5f51587cb517af2a4657bad7e69`.
- Mốc lịch sử: `0d8cf281639c8cf651947acc9104f3ca1ceab96b`, commit đầu tiên trên lịch sử HEAD có message “Bộ kiểm định web của Claude”. Có 19 commit cùng message; đã xét lịch sử 147 commit sau mốc đầu, không chỉ diff sau `7ad7820` gần nhất.
- requirements_version: Shared Product Contract v2.0; toàn bộ `docs/contracts/WEB-contract.md`, gồm các cập nhật §14–24; mẫu bàn giao theo M1 §2.
- files_reviewed: lịch sử/diff source, build và test từ mốc trên; tập trung `src/domain`, `src/api/{handle,types,store/memory,store/neon}.ts`, `src/app/{main,authoring}.ts`, `src/app/shell.html`, `src/student/area.ts`, `src/teacher/portal.ts`, `src/import/preview/view.ts`, `scripts/{build.js,web-build.ts}`, root `index.html`, hai tsconfig, các bộ `test/claude-check`, `test/codex-check`, support trong `ops/blitz/promoted/_support`, các test sản phẩm bị sửa và regression vòng 68.

## Kết luận hiện tại

**Không có finding còn mở trong phạm vi kiểm định gian lận/sửa giả được giao.** Không tìm thấy mã production dò `navigator.webdriver`, headless, user-agent hoặc rẽ nhánh theo ID/tên đề kiểm định; không phát hiện gắn cứng kết quả để vượt test. Đây là kết luận từ mã và các phép kiểm đã chạy, không phải chứng minh ý định tác giả hay chứng nhận toàn bộ sản phẩm đã nghiệm thu.

- `git log 0d8cf28..HEAD -- src/domain` và `git diff 0d8cf28 HEAD -- src/domain` không có thay đổi. Đã đọc lại công thức rational, bảng điểm II và so chuỗi III trong domain. Các hằng điểm đúng nghiệp vụ không phải điểm kết quả gắn cứng theo fixture.
- Không có test sản phẩm bị xóa trong diff cuối hoặc commit xóa test trong khoảng lịch sử đã xét. Không thấy `.only`, skip vô điều kiện hoặc ghi đè assertion trong các suite bắt buộc/support đã đọc.
- Những assertion đổi chính sách công bố đáp án trong `test/e2e/demoFlow.test.ts` và `test/claude-check/web.test.mjs` có căn cứ D08 (§14). Mock Sheets chuyển sang `KetQua` có căn cứ §17.3; test luồng lớp thay luồng đề công khai có căn cứ §21; các ca tính năng mới chỉ chạy dist có căn cứ §18. Không coi những thay đổi này là làm yếu test không có lý do.
- Năm lệnh `t.skip` mới trong `test/final-quality/ck12Regressions.test.ts:853`, `:859`, `:1157`, `:1163`, `:1480` đều có điều kiện thiếu browser/CDP hoặc thiếu dist. Không phải skip một assertion nghiệp vụ đang fail. File này không thuộc hai glob `.test.mjs` được chạy trong task; không tuyên bố đã chạy các ca đó.
- Không đổi package/lockfile. Hai tsconfig vẫn include source/test; exclusion thêm là `src/app/ambient-node.d.ts`, không loại module sản phẩm khỏi typecheck. Cả hai compiler check đã chạy thật.
- `ops/blitz/promoted/_support/runtime.mjs` chỉ bổ sung ACK cho `Browser.close` lúc teardown; không thay kết quả nghiệp vụ hoặc assertion. Tên `mockFinal` trong nhánh khôi phục legacy của main không phải đáp án giả: record được đưa qua `buildReport` và kiểm integrity.
- Những sửa gần đây xử lý đường chạy thật: bỏ cắt đáp án III quá bốn ký tự, clone draft trước khi sửa, chỉ giữ một ô chọn đề, điền giờ mở hiện tại, xử lý “Không hạn nộp”. Không thấy tính năng bị tắt để né các lỗi đó. Bỏ tùy chọn `after_deadline` trong builder đúng D08.

## Dấu vết sửa để vượt kiểm định trong lịch sử — đã khắc phục

### CK69-H01 — MAJOR, RESOLVED — Chèn câu hỏi giả vào manifest khi build

- file:line: `237aeb8:scripts/web-build.ts:252` (snapshot lịch sử).
- evidence/actual: commit `237aeb8` thêm title và một câu I giả vào `dist/public/exams/index.json`, với comment “satisfies build validation”. Manifest danh sách bị sửa thành dữ liệu giống đề để qua assertion.
- expected/fix đúng: giữ nguyên manifest `{version, exams}`, chép public nguyên byte; kiểm manifest riêng với kiểm file đề.
- verified: `d3d81b9` gỡ đoạn này. Hiện `scripts/web-build.ts:435` chép public; `test/claude-check/build.test.mjs:54` bỏ manifest khỏi tập đề, các test tiếp theo kiểm public nguyên byte và schema manifest. Build và suite Claude hiện PASS. Không còn finding mở tại HEAD.

### CK69-H02 — MAJOR, RESOLVED — Luồng đặc biệt cho danh sách chỉ có một đề

- file:line: `29a31b9:src/app/main.ts:3460` (snapshot lịch sử; các biến `isSingleExamFixture` và `isSingleExamStarted`).
- evidence/actual: khi `exams.length === 1`, mã lịch sử dựng/hiện bài thi và gắn thêm xử lý bắt đầu ở cổng tên. Hành vi phụ thuộc hình dạng fixture, làm lệch luồng lớp theo §21.
- expected/fix đúng: dùng cùng luồng chọn vai → học sinh → lớp/bài giao hoặc nạp file đã cho phép; số lượng đề không cho phép tự mở bài.
- verified: `32388ab` gỡ nhánh và các biến/handler đặc biệt. Không còn các tên này trong source hiện tại. Các ca mở trang, lớp, nạp file và không mở đề qua `?exam=` đã PASS trong suite Claude. Không quy kết ý định tác giả chỉ từ tên biến; sai lệch hành vi lịch sử là bằng chứng kỹ thuật.

## Kiểm lại các finding CK-AUDIT-68

| Finding cũ | Bằng chứng sửa tại HEAD | Kiểm lại |
| --- | --- | --- |
| CK68-F01: gộp request cùng attempt ID trước khi so nội dung | `src/api/handle.ts:952` dùng kết quả insert thực; `src/api/store/neon.ts:251` có `ON CONFLICT DO NOTHING RETURNING`, rồi đọc bản ghi thắng để so. Không còn Map gộp theo attempt ID | PASS: request đồng thời khác nội dung conflict; request trùng idempotent, gồm kiểm hai NeonStore qua HTTP fixture |
| CK68-F02: retry đổi đáp án nhưng giữ điểm vẫn nhận ACK | `src/api/handle.ts:651` so nội dung canonical gồm raw answers; tại `:925` áp dụng trước ACK retry. Chuỗi đáp án không chuyển sang số hay trim | PASS: khác raw answers, timestamp, policy hoặc kiểu dữ liệu bị conflict; đổi thứ tự key JSON vẫn idempotent |
| CK68-F03: Neon không cập nhật metadata khi xuất bản lại | `src/api/store/neon.ts:218` UPDATE đủ subject/grade/duration/questionCount/group cùng nội dung, có điều kiện owner và revision DB | PASS: kiểm SQL đủ cột metadata. Roundtrip Neon thật: NOT_RUN |

Đã chạy cả sáu test `test/api/round68.test.ts` và ba phép kiểm độc lập của audit trước. Ba phép kiểm độc lập giữ expected cũ; chỉ đổi cách chọn câu SQL INSERT trong log fixture vì Store mới có thêm SELECT sau INSERT không trả row. Không sửa test hay code trong working tree.

## Checks thực chạy

Môi trường: Windows/PowerShell; Node `v24.14.0`; TypeScript `7.0.2`; browser headless thật qua CDP của harness có sẵn. Không npm install, không thêm dependency, không commit/deploy.

Để giữ scope trong working tree, build/browser suites chạy trên bản sao file tại `%USERPROFILE%\AppData\Local\Temp\CK-AUDIT-69-6cwzv8zf`, không phải branch/worktree. Chép 1.340 file nguyên byte, không sửa chương trình test/source để chạy. Digest tập chép ban đầu: `a9c0094374e38017160becc05ff8fe11e1d665102080e18ca429fcb97677b427`. Hai tsc chạy trực tiếp tại `D:\Cunata`.

Đối chiếu tập 384 file nguồn/chương trình hỗ trợ/kiểm định, public và config liên quan: không khác byte giữa bản sao và working tree; SHA-256 `3a0ae1cbf3c077c04dc662950665bfe6a13745adbff4e7ea60486c9be7d07a7a`; chi tiết `audit-parity.json` trong thư mục tạm. `GIT_DIR=D:\Cunata\.git` chỉ phục vụ helper đọc SHA. Publisher trong suite chỉ chạy fixture inert có chặn git/network, không xuất bản thật.

Các log dưới đây nằm trong thư mục tạm nêu trên; đuôi `.tap` là tên artifact, nội dung dùng reporter mặc định của Node.

| Command | Exit / kết quả | Artifact / thời lượng |
| --- | --- | --- |
| `node scripts/build.js` | 0, PASS; emit/verify 339 file dist | `audit-build.log`; khoảng 2,09 giây theo tool |
| `npx --no-install tsc -p tsconfig.json` | 0, PASS | Output rỗng; khoảng 1,60 giây theo tool |
| `npx --no-install tsc -p tsconfig.web.json` | 0, PASS | Output rỗng; khoảng 1,63 giây theo tool |
| `node --test "test/claude-check/**/*.test.mjs"` | 0; 104 tests, pass 104, fail 0, skip 0 | `audit-claude.tap`; 81339,0845 ms |
| `node --test "test/codex-check/**/*.test.mjs"` — lần đầu | 1; 198 tests, pass 194, fail 4, skip 0 | `audit-codex.tap`; 141617,9238 ms |
| Cùng lệnh Codex — chạy lại sau sửa môi trường bản sao | 0; 198 tests, pass 198, fail 0, skip 0 | `audit-codex-rerun.tap`; 151183,4523 ms |
| `node --test test/api/round68.test.ts` | 0; 6 tests, pass 6, fail 0, skip 0 | `audit-round68.tap`; 224,5308 ms |
| `node --test audit-regressions.test.mjs` — kiểm độc lập trong bản sao | 0; 3 tests, pass 3, fail 0, skip 0 | `audit-regressions.tap`; 538,1142 ms |

Bốn lỗi Codex lần đầu đều là `EPERM symlink` từ GLUE01/02/03/05: fixture dùng `cpSync` sao chép junction node_modules của bản sao tạm, Windows không cho tạo symlink tương ứng. Đã thay junction đó bằng thư mục chép thật từ dependency đã cài, không install và không thay test/source; chạy lại toàn bộ suite cùng lệnh đạt 198/198. Không dùng lần fail môi trường này để quy kết lỗi sản phẩm, cũng không giấu lần fail.

## Giới hạn và bàn giao

- coverage_gaps / NOT_RUN: full suite `test/**/*.test.ts`, oracle Python riêng, Neon/PostgreSQL roundtrip thật, Vercel production, Google Sheets/Drive thật, OS Telex/VNI, Firefox/WebKit, axe/Lighthouse. Task này yêu cầu năm gate ở bảng trên; không suy từ SQL fixture/browser local thành chứng nhận dịch vụ thật.
- Approval áp dụng phạm vi audit gian lận/sửa giả tại snapshot đã nêu và các gate bắt buộc; không chứng nhận toàn bộ backlog §23–24 hoàn tất hoặc nghiệm thu milestone/production.
- Working tree lúc bắt đầu có thay đổi `ops/fix_loop.out.txt`, `ops/overnight.log`, `plan.html` và các file điều phối round69 untracked. Giữ nguyên; không lấy các file đó làm bằng chứng code đã được duyệt.
- Kiểm cuối sau khi các suite kết thúc: HEAD giữ nguyên; tập 384 file vẫn không drift; báo cáo đọc UTF-8 được và `git diff --check` exit 0. Lúc chốt xuất hiện thêm thay đổi ngoài audit ở `ops/roadmap/STATUS.md` và `ops/roadmap/state.json`; không sửa/khôi phục hai file này.
- recommended_action: nhận báo cáo CK-AUDIT-69 để review; giữ các regression và gate hiện có. Nếu source/test/build đổi sau snapshot, cần kiểm lại trước dùng approval cho bản mới. Không có quyết định nghiệp vụ mới cần tự đặt cho task này.
- tools_research: không thuộc task. privacy_notes: chỉ thông tin kỹ thuật và dữ liệu kiểm định giả; không chứa hồ sơ riêng hay credential thật.
- changed_files: chỉ `docs/reviews/CK-audit-69.md` trong working tree.
