Verdict: CHANGES_REQUESTED

review_id: R0-REVIEW-0
task_id: R0-REVIEW-0
reviewer: Codex
reviewed_at: 2026-11-22
base_commit: 14e08df^ (biên kiểm tra mở rộng; xem giả định bên dưới)
head_commit: 2019a03fabd3225b5e8bc3a602d0c37a4a94c74f
requirements_version: Shared Product Contract v2.0; WEB-contract hiện tại, trọng tâm §20–21; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md
risk_level: HIGH (báo cáo bài làm và định danh bài gửi)

R0 chưa đạt: có bốn lỗi MAJOR đã tái hiện độc lập, dù các ca kiểm định hiện có không phủ được chúng. Không sửa mã sản phẩm hoặc bộ kiểm định.

## Snapshot, phạm vi và giả định

- Working tree đã có nhiều thay đổi trước phiên review, gồm cả source, dist và test. Đánh giá source đang có trên đĩa cùng lịch sử tới HEAD, không chỉ bản committed. Không tạo branch/worktree Git, không commit, install hoặc deploy.
- Không tìm được commit mang đúng tên `Lộ trình R0: test kiểm định` bằng tìm kiếm lịch sử tất cả refs. `BLOCKED_QUESTION` về truy vết: điều phối cần cung cấp SHA nếu muốn giới hạn đúng commit mang tên đó. Không suy đoán SHA; để tránh bỏ sót, đã xem lịch sử/diff rộng hơn từ cha của `14e08df` (commit đưa §20 và test vào), gồm `5e26dbf` (CX), `72d0444` (tên đề/tên học sinh), `4fb0d1d` (§21), tới HEAD. Chỉ kết luận hành vi R0; không nghiệm thu R1–R10.
- §21 và quyết định đợt 11 thay yêu cầu lưới đề công khai trong tài liệu cũ. D08 đã chốt xem ngay lời giải sau nộp. Mức ẩn đề qua lớp là giao diện, không coi file đề tĩnh công khai là lỗ hổng mới.
- Để giữ đúng ownership một file, build/test chạy trên bản sao tạm của dữ liệu hiện tại tại `%USERPROFILE%\AppData\Local\Temp\cunata-r0-review-dg2pmksb` (gọi là `SNAPSHOT`). Bản sao không chứa `ops/prod_config.json`; giữ nguyên source/test, dùng TypeScript đã có. Build, ảnh kiểm định và log chỉ ghi ở bản sao. Đây không phải branch/worktree Git mới.
- SHA-256 source chính tại thời điểm kiểm tra: `src/app/main.ts` = `c99e2b779ddb0657e293387d3d717d5e22c993ad88f0e8a898201207a81d10a0`; `src/collect/appsScript.ts` = `e89ddb368fe9c6ce2dd09e74d43dd7415ea17f103a02a412eb938294c9d1a8f3`. Manifest toàn bộ file đã chụp: `SNAPSHOT/snapshot-hashes.json`.
- Vùng đã đọc/đối chiếu: luồng trong `src/app/main.ts`, `src/student/{area,index,view}.ts`, `src/report/{index,view,download,table,types}.ts`, `src/teacher/portal.ts`, `src/collect/{appsScript,index,export}.ts`, đường render toán/UI liên quan; diff build/typeconfig, test Claude/Codex/CX và các helper được chúng gọi. Không coi renderer module riêng là renderer thực tế của trang nếu composition root đang dựng báo cáo khác.

## R0-F01 — MAJOR — Chữ cái phương án đổi sau khi nộp đề đã trộn

- affected_files: `src/app/main.ts:2952`, `src/app/main.ts:2965`; đối chiếu lúc thi tại `src/app/main.ts:1637`.
- expected: §20 yêu cầu xem lại đúng thứ tự và nhãn phương án học sinh đã thấy; đáp án/chọn phải giữ mapping bằng ID.
- actual/evidence: lúc thi nhãn được tính theo vị trí đã trộn A–D, nhưng báo cáo dùng `opt.label` gốc và dùng label gốc trong dòng “Bạn chọn / Đáp án đúng”. Probe quan sát cùng `optionId` đổi chữ; ví dụ `ck-i-04-b` ở vị trí A lúc thi trở thành B trong báo cáo. Điểm vẫn chấm theo ID; lỗi nằm ở diễn giải bài làm.
- reproduction_steps: nạp đề hợp lệ có bốn phương án mang nhãn gốc A–D, bật `shuffleOptions`; ghi lại DOM `.option-card` theo ID/nhãn; chọn phương án đã chuyển vị trí; nộp; so `.review-option-label` và dòng “Bạn chọn” với nhãn đã hiển thị lúc thi. `SNAPSHOT/r0-independent.mjs` ghi bằng chứng thật vào `r0-independent.json`.
- impact: học sinh chọn A nhưng báo cáo nói đã chọn chữ khác; đáp án đúng theo chữ trên báo cáo không còn là chữ trên đề đã làm.
- minimal_fix: tạo mapping optionId → chữ cái theo `presentationOrder.optionOrder` của lượt làm; dùng mapping đó cho nhãn và tóm tắt trong cả xem lại và tải HTML. Giữ key/response ID và cách chấm.
- regression_test: `R0-F01 report retains displayed option letters` trong `SNAPSHOT/r0-regressions.test.mjs` FAIL; so nhãn theo ID trước/sau với permutation thực, không chỉ so thứ tự ID.

## R0-F02 — MAJOR — Báo cáo HTML tải về không tự chứa ảnh

- affected_files: `src/app/main.ts:277`, `src/app/main.ts:3060`, `src/app/main.ts:3068`.
- expected: §20 và §9 yêu cầu báo cáo HTML tự chứa, ảnh nhúng, mở offline vẫn xem được nội dung câu hỏi.
- actual/evidence: `renderMathText` giữ nguyên nguồn ảnh tương đối; handler tải HTML tự tạo Blob trực tiếp, không đóng gói ảnh. Fixture `![graph](public/q01-bbt.svg)` hiện ảnh thành công lúc thi (`complete=true`, `naturalWidth>0`), nhưng HTML tải về vẫn chứa `src="public/q01-bbt.svg"`. Mở riêng `SNAPSHOT/r0-portable/report.html`, không có thư mục public cạnh file: `loaded=false`.
- reproduction_steps: mở đề có ảnh Markdown nội bộ hợp lệ; nộp; tải HTML; chuyển duy nhất file HTML sang thư mục trống; mở file đó. Đừng mở ngay ở gốc repo vì thư mục `public/` cạnh file sẽ che lỗi.
- impact: học sinh xem lại offline mất hình vẽ/dữ liệu cần giải câu hỏi; tải thành công không đồng nghĩa báo cáo sử dụng được.
- minimal_fix: giải quyết asset nội bộ đã kiểm vào data URI trước khi tạo Blob, giữ alt; khi thiếu ảnh phải báo lỗi/cho thử lại theo hợp đồng. Áp dụng cho ảnh trong đề, phương án và lời giải; không fetch URL ngoài do đề chỉ định.
- regression_test: `R0-F02 portable report embeds every image` FAIL trên HTML thật mở bằng trình duyệt từ thư mục riêng; bằng chứng `r0-independent.json` có `offlineImages[0].loaded=false`.

## R0-F03 — MAJOR — File tải về mất thứ tự bài đã trộn và điểm từng câu

- affected_files: `src/app/main.ts:3035`, `src/app/main.ts:3041`, `src/app/main.ts:3059`.
- expected: §20 áp dụng cùng nội dung cho màn kết quả và file HTML: thứ tự học sinh đã làm, phương án theo thứ tự đã hiển thị, điểm và trạng thái từng câu.
- actual/evidence: màn kết quả dùng `presentationOrder`, còn download lặp `currentExam.questions` và `q.options` nguyên gốc. Probe ghi thứ tự làm `ck-i-04, ck-i-01, ck-i-02, ck-i-03, …`, nhưng file tải về trở lại `ck-i-01, ck-i-02, ck-i-03, ck-i-04, …`. Template thẻ tải về chỉ có tiêu đề/nội dung/đáp án/lời giải; không có điểm đạt/tối đa hay trạng thái câu như trên màn hình.
- reproduction_steps: bật cả hai cờ shuffle trên đề nhiều câu; nộp; so thứ tự `.review-question-card[data-qid]` của màn hình với file HTML; kiểm thứ tự optionId và điểm/trạng thái từng câu trong file. Không dùng fixture tắt shuffle làm chứng cứ cho nhánh này.
- impact: file học sinh lưu không tái hiện lượt làm đã xem, khó đối chiếu số câu/phương án và thiếu kết quả chi tiết khi ngoại tuyến.
- minimal_fix: dùng một projection theo snapshot thứ tự của lượt làm cho cả trang và download, gồm mapping nhãn ở F01, điểm/trạng thái từng câu; không dựng file bằng mảng câu/phương án gốc.
- regression_test: `R0-F03 portable report retains question order` FAIL trên file tải thật; bổ sung so thứ tự phương án, điểm/trạng thái mỗi câu giữa trang và file sau sửa.

## R0-F04 — MAJOR — Collector lấy lớp/bài giao hiện tại gắn vào kết quả khác

- affected_files: `src/collect/appsScript.ts:1349`–`src/collect/appsScript.ts:1358`.
- expected: WEB-contract §5–7 yêu cầu kết quả immutable và cô lập từng attempt; retry phải gửi lại đúng dữ liệu của attempt. §19.2 gắn kết quả lớp với đúng bài giao.
- actual/evidence: khi final thiếu `class_code` hoặc `assignment_id`, transport đọc `cunata:active_assignment` từ session/localStorage mà không đối chiếu examId hoặc attemptId. Với final exam `r0-offline-original`, không có metadata lớp, và storage chứa `{examId:'unrelated-exam',classCode:'ABCDEF',assignmentId:'other-assignment'}`, mock fetch nhận payload `exam_id='r0-offline-original'`, `class_code='ABCDEF'`, `assignment_id='other-assignment'`. Không gọi máy chủ thật.
- reproduction_steps: tạo final hợp lệ không gắn lớp (đề nạp file/legacy); đặt active assignment của đề B; gọi `createAppsScriptCollectorPort(..., mockFetch).send(final, signal)`; kiểm body mà mock fetch nhận. Có thể gặp khi outbox bài cũ được gửi sau khi người dùng đã chuyển đề.
- impact: gửi sai lớp/bài giao hoặc bị máy chủ từ chối; cùng final có thể sinh metadata gửi khác tùy trạng thái máy. Chưa khẳng định máy chủ production đã nhận sai dòng vì không gọi production.
- minimal_fix: transport chỉ gửi metadata đã chốt trong final/outbox. Nếu cần migration legacy, xác minh tuple và lưu metadata một lần trước enqueue; không bổ sung từ active assignment ở mỗi lần gửi, không ghép các trường của hai assignment.
- regression_test: `R0-F04 collector must not borrow another exam assignment` FAIL bằng fetch giả ghi lại payload. Sau sửa kiểm retry sau đổi đề vẫn giữ nguyên body/hash/tuple; bài không thuộc lớp phải tiếp tục không có metadata lớp.

## Kiểm tra sửa giả và độ phủ

- Đã so diff tests từ mốc §20 và từ mốc promote CX. Việc bỏ bốn ca CX-student-F03/F04/F08/F09 và thay đường vào đề có căn cứ rõ tại BANG-QUYET-DINH đợt 11/§21; không tính đó là gian lận để test xanh. Các assertion còn lại không bị nới trong diff CX đã xem.
- `test/claude-check/app.mjs` có đường nạp file ẩn để phục vụ ca kiểm định khi không còn thẻ công khai; đó là thao tác harness, không chứng minh luồng vào lớp. Các ca lớp/§21 và tên học sinh/tên đề được chạy riêng trong suite.
- Không thấy nhánh production dựa `navigator.webdriver`, test name/id hay host localhost để thay kết quả trong các vùng source R0 đã tìm. `ops/blitz/promoted/_support/runtime.mjs` giả xác nhận `Browser.close` phục vụ teardown, không thay assert/chấm điểm; giới hạn này được phân biệt với bằng chứng hành vi.
- Test §20 hiện có chủ yếu dùng shuffle=false và chỉ tìm chuỗi nội dung trong HTML. Ca Markdown kiểm có table/header nhưng không mở file tải độc lập khỏi tài nguyên repo. Vì vậy không bắt F01–F03. Test collector hiện có không bao phủ final thiếu metadata khi active assignment thuộc đề khác (F04).
- Bảo mật: đã đối chiếu escape text/thuộc tính, chặn ảnh host ngoài, auth/CSV/session tests trong bộ CX; chưa phát hiện thêm lỗi bảo mật đã chứng minh trong phạm vi R0. Không suy rộng thành chứng nhận bảo mật toàn hệ thống/API R1.

## Checks chạy thật

Môi trường: Windows, Node v24.14.0, TypeScript 7.0.2, Chrome/Edge headless thật qua CDP; HTTP local + Apps Script giả lập. Log dưới `SNAPSHOT`; không thay assert hoặc source để chạy.

| Lệnh | Kết quả | Bằng chứng |
| --- | --- | --- |
| `node scripts/build.js` | exit=0, emit/promote 339 file | `build-review.log` |
| `node node_modules/typescript/bin/tsc -p tsconfig.json` | exit=0 | `tsc-review.log` |
| `node node_modules/typescript/bin/tsc -p tsconfig.web.json` | exit=0 | `tsc-web-review.log` |
| `node --test --test-reporter=tap "test/claude-check/**/*.test.mjs" "test/codex-check/*.test.mjs" "test/codex-check/cx/*.test.mjs"` (lần đầu) | exit=1, pass=263 fail=9 skip=0; 9 lỗi setup/teardown vì snapshot không có .git, không phải 9 bug sản phẩm | `r0-tests.tap` |
| `$env:GIT_DIR='D:\Cunata\.git'; node --test --test-reporter=tap test/codex-check/cx/admin.test.mjs` | exit=0, pass=8 fail=0 skip=0; chỉ trỏ đọc metadata Git có sẵn cho hàm snapshot của test | `r0-admin-rerun.tap` |
| Bộ mục chạy lại với GIT_DIR đọc metadata, cùng lệnh ba glob trên | exit=1, pass=266 fail=5 skip=0, 268,857 giây; năm lỗi navigation timeout 20 giây | `r0-tests-rerun.tap` |
| `node --test --test-reporter=tap "test/claude-check/**/*.test.mjs"` (riêng bộ Claude) | exit=1, pass=101 fail=3 skip=0, 257,813 giây; cả ba lỗi navigation timeout 20 giây | `claude-only.tap` |
| `node r0-independent.mjs` | exit=0; hoàn tất probe trình duyệt, quan sát ba lỗi F01–F03 | `r0-independent.json`, `r0-independent.log`, `r0-portable/report.html` |
| `node --test --test-reporter=tap r0-regressions.test.mjs` | exit=1, pass=0 fail=4 skip=0; bốn assertion độc lập tái hiện bốn finding | `r0-regressions.tap` |

Các probe/regression mới chỉ nằm ở SNAPSHOT, không được thêm vào source/bộ kiểm định của repo. Chạy lại bằng cwd SNAPSHOT với chính các lệnh trong bảng. Log/probe là artifact tạm trên máy này, không phải file được commit.

Ba lỗi riêng bộ Claude nằm ở `web.test.mjs`: “hai tab cùng bài”, “maxAttempts = 1”, “làm lại (không giới hạn lượt)”; đều báo `Trang không tải xong trong 20000 ms` tại `harness.mjs:162`. Các ca này qua ở lần chạy gộp đầu, nên ghi nhận timeout không ổn định, chưa quy thành ba lỗi logic sản phẩm và không gọi riêng bộ Claude là PASS. Lượt chạy lại có chồng thời gian với suite gộp; chưa đủ bằng chứng xác định nguyên nhân tải máy hay ứng dụng.

Năm timeout của lần chạy gộp lại: design/trang học sinh 375px; EX-HS-02 đánh dấu câu; EX-GV-02 lọc hai lần giao; teacher/bấm thẻ bằng chuột thật 390px; teacher/nút về trang học sinh 1366px. Đều là navigation timeout, không có assertion nghiệp vụ chứng minh lỗi mới. Toàn bộ CX và supplemental Codex ở lần chạy gộp lại không có ca fail. Không gộp số pass của các lượt để tuyên bố suite xanh.

Kiểm cuối: HEAD vẫn là SHA nêu trên; so SHA-256 tất cả file đã chụp với working tree gốc không có khác biệt (`snapshot_source_changes=[]`). Chỉ thêm file review này trong workspace; kết quả chưa bao gồm thay đổi source tương lai.

## Giới hạn và bước tiếp theo

- Google/Vercel/Neon thật: NOT_RUN theo cấm của task. Không đọc cấu hình production. Mạng giả lập không chứng minh CORS hoặc nhận kết quả production.
- OS IME Telex/VNI, thiết bị điện thoại thật, browser engine khác: NOT_RUN; suite có viewport/keyboard/CDP, không thay thế nhập OS hoặc nghiệm thu thiết bị thật.
- Không yêu cầu quyết định nghiệp vụ mới để sửa bốn lỗi; hợp đồng đã nêu hành vi. Câu hỏi SHA lịch sử ở trên chỉ ảnh hưởng truy vết chính xác mốc task.
- recommended_action: worker sửa tối thiểu F01–F04, thêm regression bắt các lỗi này, chạy lại build/hai tsc/suite rồi review lại snapshot. Không APPROVED R0 trong tình trạng hiện tại.
