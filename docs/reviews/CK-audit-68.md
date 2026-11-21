# CK-AUDIT-68

verdict: **CHANGES_REQUESTED**

- reviewer: Codex; review_id/task_id: CK-AUDIT-68; risk_level: HIGH.
- verified_at: 2026-11-22.
- requirements_version: Shared Product Contract v2.0; WEB-contract hiện tại, gồm các quyết định §14–24.
- base_commit: `0d8cf28` (commit đầu tiên trên lịch sử HEAD có message “Bộ kiểm định web của Claude”). Có 19 commit cùng message; không chỉ kiểm từ bản gần nhất `7ad7820`.
- head_commit: `a65348c1244411666ca047aef9bd2e2486f2f588`.
- Phạm vi: lịch sử/diff từ baseline tới HEAD, source hiện tại và các bộ kiểm định bắt buộc. Không sửa code sản phẩm, dependency hay test trong working tree; không commit/deploy.

## Kết luận về sửa giả và gian lận kiểm định

Không tìm thấy bằng chứng hiện tại về nhánh production theo `navigator.webdriver`, headless, user-agent, ID/tên đề kiểm định, hoặc gắn cứng điểm để qua test. Kết luận này là kết quả rà mã, không phải chứng minh tuyệt đối về ý định tác giả.

- `git log 0d8cf28..HEAD -- src/domain` và diff tương ứng không có thay đổi. Không phát hiện sửa invariant chấm trong vùng này.
- Không có test sản phẩm bị xóa trong diff cuối. Các thay đổi assertion release trong `test/e2e/demoFlow.test.ts` có căn cứ D08 (§14); chuyển mock `getActiveSheet` sang `getSheetByName('KetQua')` phù hợp §17.3. Thay kiểm giao diện đề công khai/link `?exam=` bằng luồng lớp phù hợp §21. Việc chỉ chạy tính năng mới ở dist có căn cứ §18. Không coi những thay đổi này là gian lận.
- `test/claude-check/build.test.mjs:54` loại `index.json` khỏi tập file đề vì đây là manifest; test mới kiểm bản sao public nguyên byte và schema manifest. Không còn thủ thuật chèn câu hỏi giả vào manifest trong build hiện tại.
- `scripts/web-build.ts` hiện import tĩnh handler và tạo NeonStore; `src/api/store/neon.ts` đọc dữ liệu SQL thay các Map bộ nhớ trước đây. Đây là sửa đường chạy thật, nhưng vẫn còn lỗi lưu trữ bên dưới.
- `ops/blitz/promoted/_support/runtime.mjs` giả lập ACK riêng cho `Browser.close` khi teardown; không thay phản hồi nghiệp vụ/assertion và không nằm trong source production.
- Không thay package/lockfile. Hai tsconfig có thay đổi phạm vi typecheck nhưng hiện vẫn include src/test (web gồm scripts), không loại các vùng vừa sửa để né kiểm tra.

Suite xanh chưa đủ duyệt: có ba regression độc lập dưới đây. Hai lỗi đầu chạy trực tiếp handler thật với MemoryStore; lỗi thứ ba kiểm SQL do NeonStore thật phát ra, không gọi Neon production.

## Findings

### CK68-F01 — CRITICAL — Gộp request cùng attempt ID trước khi kiểm nội dung

- affected_files: `src/api/handle.ts:631–644`; liên quan `src/api/store/neon.ts:232` và `src/api/handle.ts:895–902`.
- evidence: `inFlightSubmissions.get(attemptId)` trả Promise đang chạy cho mọi payload cùng ID, trước validation/so sánh nội dung. Chạy `Promise.all` hai request cùng ID, tên `Audit A` và `Audit B`: cả hai trả `success:true, status:NEWLY_RECORDED`; Store chỉ chứa `Audit A`.
- reproduction_steps: dùng `rig()` và `payload()` từ `test/codex-check/feat/R1/support.mjs`; tạo `p = payload('audit-concurrent', {candidate_display:'Audit A'})`; gọi đồng thời `r.post(p)` và `r.post({...p,candidate_display:'Audit B'})`; đọc `r.store.getResult(p.attempt_id)`.
- expected: request khác nội dung phải nhận `PAYLOAD_CONFLICT`; receipt thành công phải xác nhận đúng dữ liệu đã lưu (§7, §17.2, §22).
- actual: request B nhận receipt của A dù B chưa được lưu. Cơ chế Map cũng chỉ bảo vệ một tiến trình; SQL `ON CONFLICT (attempt_id) DO NOTHING` không trả kết quả thắng/thua cho handler, nên không giải quyết xác nhận nội dung giữa nhiều instance.
- impact: báo gửi thành công cho nội dung không được máy chủ ghi nhận; bỏ qua validation của request đang bị gộp. Không cần sửa điểm hay phát hiện môi trường test để tái hiện.
- minimal_fix: chuẩn hóa payload và tạo hash nội dung bất biến trước dedupe; chỉ gộp request cùng ID + cùng hash. Thực hiện insert-or-compare nguyên tử ở DB và trả receipt theo bản ghi thật; khác hash trả conflict. Không chỉ bổ sung Map khác trong RAM.
- regression_test: test hai request đồng thời cùng ID khác tên/đáp án/điểm; hai instance handler/Store dùng cùng DB; request trùng hoàn toàn vẫn idempotent. Test độc lập `CK68-F01` hiện FAIL.

### CK68-F02 — MAJOR — Retry đổi đáp án nhưng giữ điểm vẫn được xác nhận

- affected_files: `src/api/handle.ts:824–867`.
- evidence: nhánh existing chỉ so tên, ID đề/phiên bản, điểm và một số dữ liệu lớp; không so `raw_answers_json`. Giá trị raw answers chỉ được chuẩn hóa sau khi nhánh này đã trả về.
- reproduction_steps: `p = payload('audit-answers', {raw_answers:{q1:'A'}})`; gửi thành công; gửi lại `{...p, raw_answers:{q1:'B'}}` với điểm giữ nguyên; đọc raw answers trong Store.
- expected: `PAYLOAD_CONFLICT`, không xác nhận dữ liệu khác bản đã chốt (Shared Product Contract §3; WEB §7).
- actual: trả `success:true, status:ALREADY_RECORDED`; bản ghi vẫn là `{"q1":"A"}`. Lỗi tái hiện tuần tự, độc lập với CK68-F01.
- impact: người dùng có thể nhận xác nhận cho đáp án khác dữ liệu giáo viên xem lại; integrity của kết quả/report không được bảo đảm.
- minimal_fix: so hash canonical của toàn payload bất biến, gồm raw answers, tuple, thời gian và ngữ cảnh lớp; dùng cùng quy tắc cho retry tuần tự và đồng thời. Giữ raw câu III, không normalize đáp án để tạo hash.
- regression_test: cùng ID/cùng điểm/khác raw answers phải conflict; payload trùng phải ALREADY_RECORDED; cùng dữ liệu với thứ tự key JSON khác có xử lý canonical nhất quán. Test độc lập `CK68-F02` hiện FAIL.

### CK68-F03 — MAJOR — Xuất bản lại đề không cập nhật metadata trong Neon

- affected_files: `src/api/store/neon.ts:209–212`; callers/readers: `src/api/handle.ts:81–89`, `src/api/handle.ts:478–490`.
- evidence: INSERT gửi đủ metadata mới nhưng `ON CONFLICT (id) DO UPDATE` chỉ cập nhật `title, revision, updated_at, exam_json`; bỏ `duration_minutes, question_count, subject, grade, "group"`. MemoryStore thay cả object nên test dựa trên MemoryStore không phát hiện lệch này.
- reproduction_steps: gọi NeonStore.saveExam hai lần cùng ID; lần đầu 15 phút/4 câu/nhóm A, lần hai 30 phút/8 câu/nhóm B. Ghi lại SQL bằng fetch fixture: phần UPDATE không chứa cả năm cột nêu trên dù params đã mang giá trị mới. Theo đúng câu SQL, DB giữ metadata cũ còn exam_json đã mới.
- expected: listExams/getClass/listAssignments phản ánh metadata bản đề vừa xuất bản (§17.2, §19.1, §22).
- actual: nội dung JSON và danh mục/bài giao có thể hiện thời gian, số câu, môn/khối/nhóm khác nhau. Đã xác minh SQL phát ra; chưa chạy roundtrip PostgreSQL/Neon thật.
- impact: giáo viên/học sinh thấy metadata cũ sau khi sửa đề; bản MemoryStore và production Neon không cùng hành vi.
- minimal_fix: UPDATE đầy đủ các trường metadata được phép sửa, giữ quy tắc owner. Thêm roundtrip persistence với cùng bộ contract cho MemoryStore và Neon.
- regression_test: publish → sửa thời gian/số câu/môn/khối/nhóm → publish cùng ID → đọc lại từ Store instance mới và qua listExams/getClass. Test SQL độc lập `CK68-F03` hiện FAIL.

## Checks và môi trường

Windows/PowerShell, Node `v24.14.0`, TypeScript `7.0.2`; dùng Chrome/Edge headless thật qua CDP của harness có sẵn. Không npm install.

Để không thay generated artifacts/fixtures ngoài scope trong working tree, build và browser suites chạy trên bản sao file tại `%USERPROFILE%\AppData\Local\Temp\CK-AUDIT-68-ua6hrji6`. Đây không phải branch/worktree. Hai tsc chạy tại `D:\Cunata`. Source, script, public, styles, Apps Script và chương trình test được chép nguyên, không sửa để chạy test. Đối chiếu ban đầu 166 file source/chương trình liên quan: không khác byte; digest tập kiểm `0696c033ddbc5c996b3ec7450d4a5c8ceaf525a8686f0266f77e35f5b6864692`.

Đối chiếu mở rộng trước khi Codex rerun kết thúc: 188 file, gồm toàn bộ chương trình kiểm định `.mjs`, support, config/lockfile, root HTML và publisher, không khác byte; SHA-256 `ef0849bb0833887e997f75380939226e2cbe2043c80c503d4f4e073b6b541a65`. Codex rerun đặt `GIT_DIR=D:\Cunata\.git` để helper snapshot chỉ đọc `git rev-parse HEAD`; không tạo repository/branch/worktree mới, không đổi harness. Đã chép đủ publisher và tạo các thư mục output trống mà helper cần. Publisher chỉ được gọi bởi fixture inert có chặn subprocess/git/network, không triển khai thật.

**Drift lúc chốt:** HEAD vẫn là `a65348c`, nhưng worker khác bắt đầu sửa `src/api/store/memory.ts`, `src/api/types.ts`, rồi `src/api/store/neon.ts` trong working tree. Đã đọc diff: Store đang đổi kiểu trả về saveExam/saveResult và bổ sung authGen. Không ghi đè hoặc chép các sửa dở này vào snapshot. Các kết quả PASS và findings trong báo cáo áp dụng cho HEAD/snapshot đã kiểm; **NOT_REVIEWED đối với các sửa mới**, không dùng báo cáo này để duyệt working tree sau drift. Cần snapshot ổn định và chạy gate lại sau khi worker hoàn tất, theo WEB §2/§13. Các file ops/plan thay đổi đồng thời cũng được giữ nguyên.

| Lệnh | Kết quả |
| --- | --- |
| `node scripts/build.js` | PASS, exit 0; emit/verify 339 file dist |
| `npx --no-install tsc -p tsconfig.json` | PASS, exit 0 |
| `npx --no-install tsc -p tsconfig.web.json` | PASS, exit 0 |
| `node --test "test/claude-check/**/*.test.mjs"` — lần đầu chạy cùng Codex | exit 1; 104 tests: 97 pass, 7 fail, 0 skip; 191587 ms; lỗi page-load timeout. Log: `audit-claude.tap` trong thư mục tạm |
| `node --test "test/claude-check/**/*.test.mjs"` — chạy lại riêng | PASS, exit 0; 104 tests: 104 pass, 0 fail, 0 skip; 75054 ms. Log: `audit-claude-rerun.tap` |
| `node --test "test/codex-check/**/*.test.mjs"` — lần đầu | exit 1; 200 tests: 179 pass, 21 fail, 0 skip; 221441 ms. Có lỗi chuẩn bị bản sao (thiếu git metadata để đọc HEAD, publish.py chưa chép xong, thư mục artifact) và lỗi browser; không dùng lần này để quy kết bug sản phẩm. Log: `audit-codex.tap` |
| `node --test "test/codex-check/**/*.test.mjs"` — chạy lại riêng sau sửa môi trường bản sao | PASS, exit 0; 198 tests: 198 pass, 0 fail, 0 skip; 143322 ms. Log: `audit-codex-rerun.tap`. Lần đầu có thêm 2 file-level failure do hook/teardown lỗi; không có test bị sửa/xóa/skip giữa hai lần |
| `node --test audit-regressions.test.mjs` — regression độc lập trong thư mục tạm | exit 1; 3 tests: 0 pass, 3 fail, 0 skip; đúng ba expected behavior trong findings. Log: `audit-regressions.tap` |

Chốt gate có sẵn trên snapshot đã kiểm: build + hai tsc + Claude 104/104 + Codex 198/198 đều PASS ở lần chạy hợp lệ cuối. Không sửa test để có kết quả này. Verdict vẫn CHANGES_REQUESTED do ba regression chưa được suite hiện hữu bao phủ; không chứng nhận gate của các sửa working tree đến sau.

## Giới hạn và đề nghị

- NOT_RUN: roundtrip Neon/PostgreSQL thật, Vercel production, Google Sheets/Drive thật, OS Telex/VNI và bộ browser đa engine. Không dùng mock HTTP/SQL để tuyên bố integration live PASS.
- Rà soát này tập trung gian lận/sửa giả và các vùng sửa có rủi ro; không chứng nhận toàn bộ backlog §23–24 đã triển khai hoặc chủ dự án đã nghiệm thu.
- recommended_action: giao worker sửa CK68-F01…F03, bổ sung regression có assertion về dữ liệu đã lưu/receipt thật; chạy lại gate và kiểm Neon roundtrip trước duyệt. Không có quyết định nghiệp vụ mới cần tự đặt cho ba sửa lỗi này.
- privacy_notes: chỉ thông tin kỹ thuật và dữ liệu kiểm định giả; không chứa nội dung hồ sơ riêng hay credential thật.
