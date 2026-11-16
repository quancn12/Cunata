# CK-AUDIT-16 — Kiểm định vòng 16

- review_id / task_id: CK-AUDIT-16; reviewer: Codex; ngày: 2026-11-16.
- verdict: **CHANGES_REQUESTED**.
- risk_level: HIGH — nâng phiên bản offline và độ tin cậy của regression.
- requirements_version: Shared Product Contract v2.0; WEB-contract v1.0, đọc toàn bộ, gồm §14–15.
- head_commit: `d7c62e481fccce5445b67f3da2b84819f0720aaf`.
- base_commit: bản gần nhất mang message “Bộ kiểm định web của Claude”, `7a727060bcf86613d9d356c88abeed796b7e1615`.
- Mở rộng kiểm tra tới bản đầu cùng message `0d8cf281639c8cf651947acc9104f3ca1ceab96b`, qua bản giữa `9979578b24a5e1db1203c395d3694ca1b1cf3cdd`, để không bỏ sót thay đổi trước round 11. Kiểm riêng sửa mới `1cddea9..HEAD` và working tree.

Năm gate được giao đều PASS khi chạy lại. Sửa CK15 đã thêm digest để worker thay đổi theo nội dung build, nhưng chưa bảo đảm cập nhật an toàn: một tab nộp bài có thể kích hoạt worker mới trên tab khác đang làm; cache mới thiếu module khiến reload offline ngay sau cập nhật không khởi động được. Regression mới cũng có thao tác trả lời không thực thi dù test PASS. Không có bằng chứng để quy kết ý định của tác giả.

## Snapshot và phạm vi

files_reviewed: git log/diff từ các mốc trên; `src/app/main.ts`, `src/offline/index.ts`, `scripts/web-build.ts`, `index.html`, generated `dist/app/main.js` và `dist/service-worker.js`; đường route/import; hai bộ kiểm định Claude/Codex và harness; `test/final-quality/ck12Regressions.test.ts`, `test/browser/cdp-client.ts`, DOM mock và các diff assertions/storage/report/import/student trong khoảng mở rộng. Kiểm path history domain, package/lock và hai cấu hình typecheck.

Đầu phiên có thay đổi ngoài phạm vi ở `ops/fix_loop.out.txt`, `ops/overnight.log` và file giao việc chưa track dưới `ops/fix/round16/`. Trong phiên còn xuất hiện `plan.html`, `ops/publish.log` từ bên ngoài. Không sửa/khôi phục các file này, không commit/deploy/install. Chỉ tạo báo cáo này. Build chạy theo task tái tạo dist; cuối kiểm định không có diff tracked trong source/scripts/test/dist/index do kiểm định. Suite tạm ghi fixture bank-backup rồi trả nội dung cũ; cuối phiên fixture không còn diff.

HEAD giữ nguyên. SHA-256 của 324 file tracked trong src/scripts/test/styles, index.html, ba tsconfig và package/lock: `80db04ccbeeade11f5fc6423efc82cd8a672a10c5c1a49646e471dfba8b8870f`. Thuật toán: sort path; hash lần lượt `path + NUL + bytes + NUL`.

| File | SHA-256 |
|---|---|
| src/app/main.ts | c8bc83f5ce00850261c5d4239ef5843a62a5ce1b5858e93484f34eeb1c629f17 |
| scripts/web-build.ts | b92812033891a430f7e6111aedecf2bf2d93115d591d281c3fe532a76066f60a |
| test/final-quality/ck12Regressions.test.ts | 500229a48d31084332cb9edf2065319a1dcfc6ee1e7e98d6cdfe0501ec3cf933 |
| test/browser/cdp-client.ts | 7899894e1f4b0c6f915d6e91e82b02713dbd5a293aa347425a5f587571f96c5b |
| dist/service-worker.js | b50d8f8a62c4adae7ed5fe862522caeb59af25d9289cc272f284c7ff937c766f |

## Checks chạy thật

Windows/PowerShell tại D:\Cunata, Node v24.14.0 và TypeScript 7.0.2 có sẵn. Build hoàn tất trước hai suite browser; hai typecheck và hai suite chạy song song. Browser là Chrome/Edge headless thật qua CDP hiện có, root và dist dưới `/Cunata/`; không thay browser bằng VM. Evidence là output công cụ của phiên này, không lấy log XANH cũ làm kết quả mới, không ghi log ngoài scope.

| Lệnh | Exit | Kết quả |
|---|---:|---|
| `node scripts/build.js` | 0 | PASS; emit/promote 295 file; wall time 1,725 s |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS; không diagnostic; wall time 5,659 s |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS; không diagnostic; wall time 5,310 s |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | tests=51, suites=2, pass=51, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=64390.5676 |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | tests=116, suites=2, pass=116, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=74173 |
| `node --test "test/final-quality/ck12Regressions.test.ts"` | 0 | tests=7, suites=1, pass=7, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=49571.2469; PASS không chứng minh thao tác lỗi ở F03 đã chạy |

Build có warning DEP0190 (`shell: true`); exit vẫn 0. Hai probe nâng phiên bản và probe CDP dưới đây chạy bằng PowerShell here-string → `node --input-type=module`, chỉ server/payload trong bộ nhớ, không sửa source hoặc tạo probe file. Cả ba command exit 0 là script chẩn đoán hoàn tất, không phải sản phẩm PASS. Probe đầu dùng HTTP 503 để mô phỏng offline, chưa đủ để kiểm đường network failure; đã chạy lại với máy chủ đóng hẳn và chờ controllerchange/cache cleanup để lấy bằng chứng F01–F02.

## Findings còn mở

### CK16-F01 — MAJOR — Một tab nộp bài kích hoạt worker mới trên tab khác đang làm dở

- affected_files: `src/app/main.ts:591–607`, `src/app/main.ts:790–794`, `src/app/main.ts:2356–2384`; `scripts/web-build.ts:327`, `scripts/web-build.ts:351–380` (sinh worker dùng thật).
- evidence / root cause: trạng thái active được gửi tới `navigator.serviceWorker.controller` (worker cũ), còn SKIP_WAITING gửi tới `registration.waiting` (worker mới). Hai worker không chia sẻ biến `isAttemptActive`; worker mới khởi tạo false. Ngoài ra chỉ một boolean cho mọi client, không tổng hợp trạng thái từng tab. Một tab đã final gọi activateWaitingWorker, worker mới skipWaiting và clients.claim toàn bộ client dù tab khác còn draft.
- reproduction_steps:
  1. HTTP server cục bộ phục vụ dist dưới `/Cunata/`. Release A dùng cùng bytes main HEAD cộng comment marker, worker HEAD đổi token version thành `v-probe-a` trong bộ nhớ. Release B dùng nguyên worker/main HEAD. Cách này tạo hai bản hợp lệ khác nhau để kiểm giao thức, không sửa repository.
  2. Mở context browser sạch; tab A mở đề mẫu, chờ controller rồi reload. Cùng context mở tab B `?exam=ly12-hang-tuan-de-10`, chờ 28 câu, nhập nickname tổng hợp và bấm một lựa chọn. Đợi lưu IDB.
  3. Chuyển server A → B; registration.update(); chờ worker B waiting. Chỉ nộp tab A; tab B vẫn đang làm bài khác. Theo dõi controllerchange và CacheStorage từ tab B.
- actual: tab B nhận `controllerChanges=1`, `draftVisible=true`, `reportVisible=false`, candidate=`CK16 draft B`; cache A bị xóa, chỉ còn `cunata-cache-v-fc8d4b22d8d5c615`. Probe đầu còn đọc IDB trước/sau: bài mẫu A từ draft thành final, bài Lý B vẫn draft, giữ đáp án câu đầu và deadline `1794801733150`. Việc thay controller giữa bài được chứng minh; chưa chứng minh mất bản ghi IDB.
- expected: WEB §6 cấm activate worker mới giữa bài; mọi tab đang làm phải được tính trước khi cho cập nhật.
- impact: tab đang thi bị đổi worker/cache ngoài ý muốn và dùng module đang chạy của A cùng các tài nguyên về sau của B; rủi ro xuất hiện ngay với hai bài khác nhau, không chỉ trường hợp hai tab cùng attempt.
- minimal_fix: phối hợp trạng thái theo clientId trên worker sẽ quyết định activation, hỏi/nhận ACK từ tất cả client còn mở; unknown/nonresponsive client phải trì hoãn. Không gửi trạng thái vào worker cũ rồi trông đợi worker waiting biết. Kiểm lại ở thời điểm kích hoạt, không dùng boolean ghi đè bởi tab cuối; không xóa cache còn cần cho client A.
- regression_test: hai tab cùng context/origin, hai examId khác nhau, cả hai có draft; cài B; nộp A phải giữ controller/cache A cho B. Chỉ khi B hoàn tất/đóng an toàn mới activate. Kiểm ID, snapshot/order, responses, deadline/final trước/sau; thêm trường hợp worker bị terminate/restart và client không phản hồi.

### CK16-F02 — MAJOR — Cache release mới không có đủ module; cập nhật xong reload offline không khởi động được

- affected_files: `scripts/web-build.ts:290–320`, `scripts/web-build.ts:331–362`, `scripts/web-build.ts:410–430`; generated `dist/service-worker.js`.
- evidence / root cause: install precache danh sách thủ công chỉ một phần graph; ngay cả main.js và các entrypoint JS đều `critical:false`. Không tải dependency transitive như app/legacy.js, app/exam-list.js, storage/migrate.js, schema/exam.js. Activate xóa mọi cache release trước; code JS đã nằm trong bộ nhớ trang không tự lấp cache B. Cache đầy đủ của A không còn cứu được cold start B.
- reproduction_steps: dùng probe F01; sau khi worker B đã claim và cache A đã bị xóa, chưa navigate online với B, đóng hẳn server bằng closeAllConnections()/close(); reload tab B. Đây là network failure thật, không phải server chỉ trả HTTP lỗi.
- actual trước khi mất mạng: cache B có 25 keys, `domain/scoreAttempt.js` chưa cache. Sau đóng server/reload: `.question-card` count=0. Browser log và network cùng ghi HTTP `503 Offline` do worker trả cho `/Cunata/app/legacy.js`, `/Cunata/app/exam-list.js`, `/Cunata/app/authoring.js`, `/Cunata/storage/broadcast.js`, `/Cunata/storage/migrate.js`, `/Cunata/storage/backup.js`, `/Cunata/schema/exam.js`. Shell cache trả được nhưng graph module không chạy.
- expected: cold-start offline sau cập nhật phải có đủ shell và module runtime đã xác minh; một bản cập nhật không được phá khả năng mở lại bài đã lưu (WEB §6, §10 và §15).
- impact: học sinh đang có bài lưu local không truy cập giao diện khi mất mạng ngay sau update. Đây là mất khả năng sử dụng offline đã chứng minh, không phải bằng chứng IDB bị xóa. F02 độc lập với F01: kể cả activate đúng lúc sau khi mọi bài đã nộp, cache mới vẫn cần đủ graph trước khi offline.
- minimal_fix: sinh manifest precache từ graph emit thực tế và shell/assets cần thiết; runtime dependencies là critical, chỉ cho install/activation sau khi đầy đủ và cùng release. Không bỏ cache cũ khi cache mới thiếu graph. Bảo toàn nguồn đề/asset đã mở cho yêu cầu offline; không dựa vào việc người dùng sẽ reload online một lần để lấp cache.
- regression_test: A chạy online → B waiting → submit/activate B → dừng server NGAY trước lần navigation đầu tiên của B → cold reload phải boot, restore đúng attempt/report và dùng bytes B cho graph; mọi request runtime cần thiết không 503. Không được tải lại B online trước khi kiểm offline như regression hiện tại tại dòng 884–900.

### CK16-F03 — MAJOR — Regression nâng phiên bản báo PASS dù thao tác trả lời bị SyntaxError, không xác nhận bảo toàn bài

- affected_files: `test/final-quality/ck12Regressions.test.ts:824–829`, `test/final-quality/ck12Regressions.test.ts:878–900`; helper liên quan `test/browser/cdp-client.ts:232–241` (helper đã tồn tại từ trước, ca mới làm lộ vấn đề).
- evidence: chuỗi JavaScript gửi qua Runtime.evaluate còn `as HTMLElement | null`. Node type stripping chỉ xử lý source TS, không chuyển nội dung string thành JS. Probe biên dịch nguyên expression bằng vm.Script báo `SyntaxError: Unexpected identifier 'as'`. Trên Chrome thật, CdpClient.evaluate(expression) trả `undefined` thay vì reject; lệnh CDP thô trả `exceptionDetails` với cùng SyntaxError. Helper chỉ trả res.result.value và bỏ qua exceptionDetails.
- reproduction_steps: chạy nguyên suite regression mới: exit=0, pass=7, fail=0, skip=0. Sau đó gửi đúng expression ở dòng 826–829 qua helper và Runtime.evaluate trực tiếp để đối chiếu; helper trả undefined, CDP có lỗi cú pháp. Không cần tắt browser hay sửa source để tái hiện.
- expected: thao tác trả lời phải thực thi, mọi exception browser phải làm test fail; tên test “preserving draft” phải được chứng minh bằng assertions dữ liệu trước/sau.
- actual: click chọn đáp án không chạy; test vẫn nộp một bài có thể bỏ trắng. Không assertion attemptId/answers/order/deadline/candidate trước/sau nâng cấp, chỉ nhìn marker qua fetch và selector hiện diện. Ca offline còn navigate B online trước khi dừng server nên che F02.
- impact: bằng chứng xanh của ca CK15-F01 không xác nhận bảo toàn draft như tên test, có thể bỏ lọt regression mất đáp án hoặc cold offline hỏng. Đây là lỗi kiểm định có bằng chứng, chưa đủ để kết luận tác giả cố ý sửa giả.
- minimal_fix: dùng JS hợp lệ trong evaluated string; sửa helper để throw khi có exceptionDetails, phân biệt undefined hợp lệ với lỗi. Assertion phải kiểm response được lưu và tuple/metadata/snapshot trước/sau; kiểm bytes/hành vi B chạy thật, không chỉ fetch source; kiểm offline trước lần reload B online. Không hạ assertion hoặc skip ca này.
- regression_test: helper phải reject expression sai cú pháp và throw Error trong browser; ca update bắt buộc có đáp án khác blank trong IDB rồi so sau upgrade. Thử negative control vô hiệu hóa thao tác chọn hoặc làm đổi response: ca kiểm bảo toàn phải fail.

## Rà soát gian lận / sửa giả

- Đã xác minh lịch sử từng có sửa né validator: `237aeb8` thêm title và câu giả `q-index-meta` với một option vào manifest dist/public/exams/index.json. `d3d81b9` gỡ; HEAD không còn. Không ghi lỗi lịch sử này thành finding đang mở. Gate mới copy nguyên public và schema manifest PASS.
- Path history từ `0d8cf28` đến HEAD không đổi src/domain, package/lock hay tsconfig.json/tsconfig.web.json. Không thấy sửa luật chấm domain, ép tổng về 10 hoặc gắn điểm cứng để qua test trong diff được rà.
- Từ `7a72706..HEAD` không sửa hai bộ kiểm định Claude/Codex. Khoảng mở rộng có đổi D02 sang half-up hai chữ số, D08 sang hiện lời giải sau nộp, và tách manifest khỏi JSON đề kèm assertions schema/copy nguyên; có cơ sở WEB §14–15, không phải nới test vô cớ. Unwrap Result và cập nhật presentationOrder trong storage test giữ assertions nghiệp vụ. Không thấy xóa/skip/only các ca sản phẩm cũ để làm xanh. Skip mới trong regression browser chỉ khi thiếu browser/dist; phiên này skip=0.
- Scan source/build/root theo webdriver/headless/userAgent/NODE_ENV/process.env và đối chiếu diff không thấy detector môi trường kiểm định đổi hành vi/điểm. Comment headless ở PDF preview không phải detector. Không thấy nhánh theo examId/tên fixture Claude/Codex để trả kết quả riêng trong phần đã đọc. Đây là giới hạn scan/review, không phải chứng minh tuyệt đối không tồn tại obfuscation.
- `src/app/routes.ts:13` ghép chuỗi `['im','port'].join('')` tránh scanner nhầm route import với import cú pháp; coupling với scanner tồn tại trong lịch sử. Ca DOCX root/dist chạy mới vẫn PASS, chưa thấy importer bị tắt qua thay đổi này. Nên sửa scanner parse đúng khi giao task phù hợp.
- Collector chưa gửi mạng khi chưa có endpoint owner và PDF chỉ preview/nhập tay phù hợp D04/D06; không xem là tắt tính năng né lỗi. F03 là trường hợp xanh thiếu bằng chứng đã chứng minh tại HEAD; không suy ý định từ màu xanh.

## Coverage gaps và bàn giao

- NOT_RUN: full suite `test/**/*.test.ts`, toàn bộ Python oracle, Firefox/WebKit, OS IME Telex/VNI, axe/Lighthouse, mobile thật và Google live/CORS/Sheets readback. Không thuộc năm gate được giao; không sao chép kết quả cũ. Bộ codex browser đã kiểm các golden, không tương đương chạy toàn bộ Python oracle.
- Probe là mô phỏng hai release trên HTTP localhost, không deploy hay kết luận website từ xa đã cập nhật. Chưa thử toàn bộ upgrade từ mỗi version lịch sử, mọi shell/CSS/asset và recovery sau offline failure. Chưa kiểm tay toàn bộ nội dung/đáp án bộ đề Lý.
- recommended_action: worker sửa F01/F02 và làm regression F03 có hiệu lực, chạy lại gate rồi review snapshot mới. Chưa APPROVED cho bản hiện tại; không cần quyết định nghiệp vụ mới cho ba sửa lỗi này.
- assumptions: NONE về nghiệp vụ. tools_research: không giao trong task này. privacy_notes: chỉ mã, hash và dữ liệu tổng hợp; không đưa chỉ thị hồ sơ riêng hoặc dữ liệu học sinh thật vào báo cáo.
