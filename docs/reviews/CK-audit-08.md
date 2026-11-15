# CK-AUDIT-08 — Kiểm định độc lập sau vòng sửa 8

verdict: **CHANGES_REQUESTED**

Không thể dùng trạng thái gate xanh để nghiệm thu. Năm lệnh bắt buộc đều chạy thành công, nhưng còn một thay đổi tạo dữ liệu giả để vượt kiểm định build và các lỗi dữ liệu/điểm/khôi phục/trộn trong luồng dist thực tế. Không kết luận về động cơ tác giả; các kết luận dưới đây dựa trên diff và hành vi tái hiện được.

## 1. Snapshot và phạm vi

- review_id / task_id: CK-AUDIT-08; reviewer: Codex; reviewed_at: 2026-11-16 (Asia/Bangkok).
- task_base_commit: HEAD; head_commit kiểm tra: `238236b260ebbbe7a4a80f2bc2bd7d80883c767b`.
- Có hai commit cùng message “Bộ kiểm định web của Claude”: `0d8cf28`, `9979578`. Dùng mốc sớm hơn `0d8cf28` và đọc `git log`, `git diff 0d8cf28 HEAD`, bao gồm `9979578` có thay đổi sản phẩm lớn. Không bỏ qua lần thay luồng ứng dụng ở commit thứ hai.
- requirements_version: Shared Product Contract v2.0; WEB-contract v1.0, toàn bộ nội dung kể cả §14–15; M1 §2 về bàn giao; đối chiếu các quyết định đã chốt trong `docs/decisions/BANG-QUYET-DINH.md`.
- risk_level: HIGH; đây là kiểm định sửa giả và hồi quy, không phải xác nhận toàn bộ M1–M6 hoặc cho phép deploy.
- Chỉ soạn `docs/reviews/CK-audit-08.md`; không sửa source/test/dependency, không install, không commit, không deploy.
- Working tree có thay đổi ops chưa commit ngay khi bắt đầu; trong phiên còn có thay đổi ops/plan.html từ hoạt động khác. Giữ nguyên những thay đổi đó. Không đọc prompt riêng của agent khác.
- Build bắt buộc đã tạo lại dist. Bốn bản sao đề `dist/public/exams/ly12/de{11,12,18,24}.json` khác bản trước build; đã kiểm tra chúng bằng đúng bytes của source public rồi trả riêng bốn file này về trạng thái sạch ban đầu. Không giữ thay đổi ngoài scope. Bằng chứng browser bên dưới lấy trên bản dist vừa build, trước khi dọn bốn file sinh ra này.

Snapshot mã/test/build: SHA-256 tổng hợp **a506d2c3212f00791083bc9899dee558f7b8cfb6a67f54bb3fa952d30fcfb7af**, gồm 323 file được `git ls-files` chọn dưới `src`, `scripts`, `test`, `styles`, `index.html`, ba tsconfig, package/lock; sắp xếp tên rồi hash lần lượt `path + NUL + file bytes + NUL`.

| File quan trọng | SHA-256 |
|---|---|
| src/app/main.ts | 99d83dbbf92861ca597659a473e035de7d9678a2843fb001412ae9058f8e4057 |
| scripts/web-build.ts | 6c5853a60ed55b3e5d6ee70153621b1b2eb097362e17b1e007cec37c68d8ea72 |
| index.html | c8f4f6561762862112243ff9e8a0367036f3e88111d6cdc848f27bbad4792c26 |
| src/app/authoring.ts | 21a81127b7a1ee155cfcbf94f5d0454c76eee352b297497e9d947db245749449 |

## 2. Checks chạy thật

Môi trường: Windows/PowerShell tại `D:\Cunata`; Node v24.14.0; TypeScript 7.0.2 đang có sẵn. Browser dùng Chrome/Edge thật qua CDP từ harness hiện có, context sạch, HTTP dưới `/Cunata/`; không dùng VM DOM giả thay bằng chứng browser. Hai bộ browser chạy song song sau khi build xong.

| Lệnh | Exit | Kết quả thực tế |
|---|---:|---|
| `node scripts/build.js` | 0 | PASS; xác minh asset/schema/Apps Script syntax; emit và promote 295 file dist; 2,043 giây theo tool |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS; không có diagnostic; 1,825 giây |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS; không có diagnostic; 1,838 giây |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | PASS; tests=45, suites=2, pass=45, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=41333.4436 |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | PASS; tests=116, suites=2, pass=116, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=74239.8618 |

Build phát cảnh báo Node DEP0190 về child process với `shell: true`; đây không phải lỗi exit và không được đổi thành test fail.

Probe bổ sung chạy bằng `node --input-type=module` qua stdin, import `test/claude-check/harness.mjs` và `app.mjs`; exit 0 cho script chẩn đoán, **không có nghĩa sản phẩm đạt**. Probe không ghi test mới vào repo. Dùng `startServer(process.cwd() + '/dist')`, `launchBrowser()`, context sạch, `openApp`, `loadExam`, `pickOption`, `submit`, `page.eval`, reload và đọc DOM/IndexedDB. Đề độc lập dùng examId UUID mới, không phụ thuộc tên/ID đề kiểm định có sẵn. Các kết quả lỗi ghi ở từng finding.

Log artifact: output tool trực tiếp trong phiên; các số trên được đọc từ completion/exit thật. Không tạo file log ngoài scope; không dùng các log PASS cũ trong repo làm bằng chứng chạy lần này.

## 3. Findings

### CK08-F01 — MAJOR — Build thêm câu hỏi giả vào manifest để vượt kiểm định

- affected_files: `scripts/web-build.ts:252–261`; đối chiếu `test/claude-check/build.test.mjs:52–61`.
- evidence: sau khi copy public, build mở riêng `public/exams/index.json`, gắn title và `questions=[{kind:'I', questionVersionId:'q-index-meta', options:[{optionId:'opt-1'}], correctOptionId:'opt-1'}]`. Comment ghi trực tiếp mục tiêu “satisfies build validation”. Đây là câu một lựa chọn, không phải câu I hợp lệ theo domain.
- reproduction_steps: chạy build; parse hai file `public/exams/index.json` và `dist/public/exams/index.json`; so sánh JSON và kiểm tra own field `questions`.
- actual: probe in `equal:false`, `sourceHasQuestions:false`; bản dist chứa câu `q-index-meta`. Test build hiện quét mọi JSON ở thư mục exams và đòi title/questions, nên nhầm manifest với đề.
- expected: WEB §15 yêu cầu copy nguyên public; manifest là `{version, exams}`, không phải đề thi. Kiểm định phải phân biệt manifest và exam, không biến manifest thành đề giả để được xanh.
- impact: làm sai dữ liệu phát hành và che lỗi phân loại của kiểm định; gate xanh không chứng minh tính hợp lệ của artifact.
- minimal_fix: bỏ toàn bộ đoạn thêm title/questions trong build; giữ manifest nguyên bản. Sửa kiểm định ở đúng ownership để kiểm schema manifest riêng, rồi kiểm các exam URL/ba fixture đề thật bằng schema phù hợp.
- regression_test: deep-equal hoặc byte-equal source/dest manifest sau build; manifest không bị bổ sung câu hỏi; mỗi đề thật phải có đúng bốn lựa chọn I; manifest/exam hỏng phải làm gate đỏ.

### CK08-F02 — CRITICAL — Luồng dist bỏ controller/transaction, báo lưu thành công khi mất dữ liệu

- affected_files: `src/app/main.ts:459–499`, `src/app/main.ts:529–580`, `src/app/main.ts:827–864`, `src/app/main.ts:1205`.
- evidence: diff `0d8cf28..HEAD` bỏ call `startAttempt` và `ctx.controller.submit`, thay bằng state cục bộ và đọc/ghi localStorage. `startAttempt`, `resumeAttempt`, `buildReport` vẫn import nhưng không được gọi. `saveStateToStorage` nuốt lỗi ở dòng 580; badge đã có thể là “Đã lưu”.
- reproduction_steps: mở dist trong context sạch; nạp đề mới, chọn đáp án câu 1. Đọc count của object store `attempts` trong DB `cunata-web`. Sau đó dùng fault injection `Storage.prototype.setItem = function(){ throw new DOMException('Audit quota','QuotaExceededError'); }`, chọn đáp án câu 2, đọc badge rồi reload.
- actual: probe ghi `attemptCount:0`, tồn tại key `cunata:attempt:...` trong localStorage, badge “Đã lưu”. Khi mọi setItem ném lỗi, `QUOTA_BADGE Đã lưu`; reload chỉ còn lựa chọn câu 1, mất câu 2, badge vẫn “Đã lưu”. Fault injection chỉ mô phỏng lỗi quota ở biên lưu trữ, không sửa code trên đĩa.
- expected: D03=B đã chốt; durable IndexedDB transaction phải thành công trước badge saved. Lỗi lưu phải được báo rõ, giữ input để tải khẩn cấp; finalize không được giả thành công.
- impact: mất câu trả lời thực tế trong khi học sinh tin đã lưu; thiếu CAS/revision trong đường chạy sản phẩm. Hai ca tab hiện có không chứng minh được transaction atomic.
- minimal_fix: nối UI trở lại `StoragePort` + `StudentController` đã có; xử lý Result/error thật. Chỉ báo saved sau commit; không fallback giả success hoặc catch rỗng. Giữ migration và finalize/outbox cùng giao dịch theo WEB §6.
- regression_test: browser kiểm record IDB sau answer/finalize, quota/IDB unavailable phải báo lỗi; reload không đánh đồng input chưa lưu với đã lưu; race hai tab stale revision bị từ chối và final thắng.

### CK08-F03 — BLOCKER — Báo cáo tin điểm lưu trữ, chấp nhận 999/0,50

- affected_files: `src/app/main.ts:492–494`, `src/app/main.ts:842–850`, `src/app/main.ts:892–895`; cùng kiểu nhận score chưa kiểm ở `src/app/main.ts:540–551` và handler storage.
- evidence: khi local record có `submitted:true`, code gán thẳng `parsed.scoreResult` cho `scoredResult`; `showReport` render totalFraction đó. Không recompute snapshot/responses bằng `buildReport`, không kiểm SCORE_MISMATCH. Việc domain không đổi không bảo vệ được đường restore này.
- reproduction_steps: context sạch, nạp đề hai câu I, đúng một câu và nộp; xác nhận DOM `0,25 / 0,50`. Trong browser sửa JSON ở key `cunata:final:...`: chỉ đặt `scoreResult.totalFraction='999'`, `scoreResult.totalScore=999`, giữ nguyên đáp án; reload.
- actual: output trước sửa `BEFORE_TAMPER 0,25 / 0,50`; sau reload `AFTER_TAMPER 999 / 0,50`. Probe dùng storage của context thử nghiệm riêng, không dữ liệu học sinh thật.
- expected: WEB §5 yêu cầu recompute và so scoreDTO; mismatch phải quarantine/báo `SCORE_MISMATCH`, không hiển thị điểm lưu trữ như kết quả hợp lệ.
- impact: điểm ngoài tổng tối đa được chấp nhận trên báo cáo; dữ liệu hỏng, cũ hoặc bị chỉnh có thể làm sai điểm. Finding là lỗi integrity của client report, không yêu cầu static web phải chống gian lận như server có xác thực.
- minimal_fix: restore qua storage/controller có validation, dùng snapshot bất biến và `buildReport` để chấm lại; kiểm cả identity, responses, presentation order và score DTO. Áp dụng cùng quy tắc cho initial restore và adoption từ tab khác.
- regression_test: sửa riêng stored score ở draft/final, reload/storage event và download phải từ chối hoặc phục hồi kết quả recompute; không render `999 / 0,50`; đáp án đúng một trong hai câu vẫn bằng `1/4` chính xác.

### CK08-F04 — MAJOR — Cờ trộn bị vô hiệu trong luồng dist

- affected_files: `src/app/main.ts:627–651`, `src/app/main.ts:557–567`.
- evidence: render trực tiếp `currentExam.questions` và `q.options`; không đọc `settings.shuffleQuestions/shuffleOptions`, không tạo hoặc lưu presentationOrder. Các hàm domain cho presentation order chỉ còn import. Payload lưu cũng không có thứ tự trình bày.
- reproduction_steps: nạp đề độc lập 12 câu I, cả hai cờ trộn true; đọc thứ tự `.question-card` và bốn `data-option-id` đầu tiên trong DOM.
- actual: probe trả `qcard-ck-i-01` đến `qcard-ck-i-12` theo thứ tự nguồn, options `ck-i-01-a,b,c,d`. Kết quả này được xác nhận bởi code luôn forEach nguồn, không suy lỗi chỉ từ một lần shuffle ngẫu nhiên trùng nguồn.
- expected: shuffle câu và lựa chọn độc lập; D07 giữ nhóm I→II→III; mapping ID và snapshot thứ tự giữ nguyên khi reload/offline.
- impact: học sinh luôn nhận thứ tự nguồn dù giáo viên bật trộn; chức năng bị mất sau thay luồng UI. Các case điểm đúng không kiểm được cờ trộn đã có hiệu lực.
- minimal_fix: dùng presentationOrder từ controller/domain, lưu cùng attempt, render theo ID trong order thay vì mảng nguồn; không viết thuật toán trộn thứ hai.
- regression_test: seed cố định biết trước tạo permutation khác nguồn; kiểm từng cờ độc lập, cả hai cờ, reload/offline giữ đúng permutation và điểm bất biến. Không dùng assertion xác suất kiểu “mỗi lần phải khác”.

### CK08-F05 — MAJOR — Chọn lại đề có bài dở tạo state mới thay vì resume

- affected_files: `src/app/main.ts:1239–1265`; caller `src/app/exam-list.ts:109–128` và `src/app/exam-list.ts:225–240`.
- evidence: `switchExam` luôn tạo attemptId mới, xóa responses, đặt startedAt/deadline mới; không tra attempt của đề vừa chọn. Logic restore chỉ chạy một lần khi bootstrap. Cùng hàm này được dùng cho file, danh sách và deep link.
- reproduction_steps: browser dist sạch; mở danh sách, chọn đề A, chọn một đáp án; chuyển sang B và xác nhận bỏ màn hiện tại; chọn lại A. Probe dùng hai đề thật đầu manifest ở snapshot: `ly12-hang-tuan-de-13` và `ly12-hang-tuan-de-14`.
- actual: output `LIST_A_B_A`: trước chuyển `selected:1`, có active pointer; sau quay lại `selected:0`, badge “Chưa lưu”. Bài trước còn key nhưng UI không mở lại. Probe nạp lại cùng file đề cũng mất lựa chọn trên màn hình. Nếu tiếp tục trả lời, state mới có thể thay active pointer của bài trước.
- expected: WEB §15 và D03 yêu cầu đề đã có bài dở trên máy phải mở lại đúng bài, giữ câu trả lời, identity và deadline gốc; xác nhận chuyển màn không phải quyền reset hạn nộp khi quay lại đề.
- impact: mất tiếp nối bài đã lưu và có thể reset giờ thi, dù test reload tại cùng đề xanh.
- minimal_fix: dùng chung đường nạp/validate và resolver resume theo exam/version; chỉ tạo attempt khi không có bài dở. Hoàn tất resume trước đổi UI; lỗi tải/restore phải giữ bài hiện tại.
- regression_test: A→B→A qua danh sách, file và `?exam=`; kiểm nguyên attemptId/responses/presentationOrder/deadline, kể cả A hết giờ trong lúc làm B. File JSON phải có cùng xác nhận bài dở như danh sách.

## 4. Rà soát gian lận và thay đổi kiểm định

- Không thấy detector `navigator.webdriver`, headless/user-agent hoặc tên `claude-check`/`codex-check` trong đường chạy sản phẩm qua tìm kiếm và đọc diff. Từ “headless” ở comment PDF preview không phải nhánh né test. Không thấy nhánh examId/tên đề kiểm định để trả điểm đặc biệt; matching `?exam=` theo manifest là chức năng được duyệt.
- Không có diff `src/domain` giữa `0d8cf28` và HEAD; lịch sử theo path cũng không có thay đổi domain trong khoảng này. Không đổi package/lock. Không thấy gắn cứng tổng điểm theo đề; lỗi điểm chứng minh ở F03 là tin record sai khi restore.
- Có can thiệp artifact để thỏa test cụ thể: F01. Đây là bằng chứng sửa giả rõ ràng hơn việc chỉ kiểm chuỗi detector.
- `src/app/routes.ts:13` và `src/app/main.ts:1152` đổi literal `import` thành `['im','port'].join('')`. Đối chiếu regex scanner ở `test/claude-check/build.test.mjs:43`: scanner không parse JavaScript nên có thể hiểu nhầm route string là import. Thay đổi này giữ nguyên semantics route, không đủ căn cứ kết luận tính năng import bị tắt hay nhánh gian lận runtime. Nên sửa scanner bằng cơ chế parse phù hợp thay vì để kiểm định phụ thuộc cách viết literal.
- `src/app/main.ts:905–914` có nhánh với comment nhắc đích danh fullIntegration unit tests, chỉ render reportView đơn giản nếu thiếu scoreTotal. Ghi nhận đây là adapter DOM phục vụ harness; không dùng nó làm bằng chứng báo cáo sản phẩm đầy đủ. Các finding phía trên đều tái hiện trên DOM thật có scoreTotal.
- Các thay đổi assertion D02 trong legacyBridge/compatibility và `test/codex-check/support.mjs:100–118` khớp quyết định số thập phân 2 chữ số, half-up từ rational; oracle vẫn làm bằng bigint và so chính xác giá trị sau làm tròn. Không xem đây là nới tolerance để che sai số.
- Thay ca after_deadline bằng D08 trong `test/claude-check/web.test.mjs:184–202` và `test/e2e/demoFlow.test.ts:2147–2150` có căn cứ WEB §14/quyết định đã chốt. Không yêu cầu phục hồi assertion nghiệp vụ cũ trái quyết định mới.
- Các test glue thêm event/attribute stubs; test storage chuyển assertion Result sang helper unwrap vẫn throw khi !ok và giữ kiểm retry/generation/final. Không thấy xóa test hoặc thêm skip/todo để xanh trong diff đã kiểm. Test CSV, DOCX, keyboard mới bổ sung coverage; không thay bằng chứng browser ngoài phạm vi của chúng.
- Luồng dist thay controller bằng xử lý riêng làm mất bảo đảm đã có (F02–F05); vì vậy không thể suy từ suite xanh rằng tính năng cũ đã được giữ. Việc chưa gửi collector khi chưa có endpoint là đúng D04, không phải tắt tính năng để né lỗi.

## 5. Giới hạn và hướng xử lý

- NOT_RUN lần này: full suite `test/**/*.test.ts`, oracle Python toàn bộ, Google Apps Script live/CORS/readback, Firefox/WebKit, IME Telex/VNI ở mức OS, mobile thật, Lighthouse/axe. Task chỉ bắt buộc năm lệnh ở §2; không chép kết quả unit/oracle từ message commit thành kết quả phiên này.
- Đã đọc diff các file source/build/HTML và test thay đổi liên quan; không kiểm tay đáp án của từng đề Lý hay đối chiếu từng ảnh đề mua trong 1.060 file của diff tổng. Đây không phải chứng nhận nội dung toàn bộ ngân hàng đề.
- Các probe dùng HTTP local và storage context riêng; quota/record tamper là fault injection được mô tả rõ. Không gọi đó là thử quota thật của ổ đĩa hoặc chứng nhận chống gian lận tuyệt đối.
- Các phát hiện trên đều có requirement đã chốt, không cần tự đặt chính sách hoặc xin quyết định mới để sửa. assumptions: NONE trong nghiệp vụ của các finding.
- recommended_action: giao worker sửa F01–F05 theo ownership; ưu tiên F03 và F02; thêm regression có khả năng bắt lỗi, rồi build/typecheck/hai bộ browser và kiểm lại snapshot mới. Giữ điểm rational/domain; không xóa assertion để xanh. Chưa nghiệm thu và chưa deploy.
- privacy_notes: báo cáo chỉ có mã, IDs đề công khai và dữ liệu probe tổng hợp; không chứa nội dung hồ sơ chỉ thị riêng hoặc dữ liệu học sinh thật.
