# LC29 — Kiểm định độc lập toàn sản phẩm

**verdict: CHANGES_REQUESTED.** Có 1 BLOCKER, 1 CRITICAL, 5 MAJOR ở luồng định danh/khôi phục bài và collector, cùng 1 MINOR làm gate test mới fail tại lần chạy cuối. LC28-F01 đã **FIXED / RETESTED**. Không tìm thấy counterexample số học mới trong những ca đã kiểm. Không nghiệm thu toàn sản phẩm, không gắn FULLY_VERIFIED hoặc DONE.

review_id/task_id/worker_id: LC29; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 và M1-scoring-contract v1.0, đã đọc toàn bộ; acceptance_reference: READINESS §6, B1-AC01–08 / B1-T01–17; risk_level: HIGH. **handoff: NEED_DECISION** cho các policy còn mở, tách khỏi yêu cầu sửa lỗi đã chứng minh.

## Revision và phạm vi

- base_commit=head_commit khi kiểm: `d6efb1162fe62f67321c7c0767116b69f215dfef`, branch `main`. So log và diff từ base LC28 `8c81aaa3c63dcc38f5dc1c748ff4399a1c680a81` tới HEAD; đối chiếu cả mô tả snapshot working tree cuối LC28, tránh coi code đã kiểm cuối LC28 là hoàn toàn mới.
- SHA256 index.html: `4e87921488db05af19bafd8e212ce53fbdc4a6ccd3f7ef579276591b012cb2cc`; src/domain/rational.ts: `054d5e7d2c71df43bb7da641cc3e4845921014bb3c7071fa6a468b67b60b6696`. Product/source/test sạch khi chạy các probes; ops/dashboard/workers có thay đổi và prompt/round25 untracked của tiến trình khác, được giữ nguyên.
- **Snapshot cuối:** HEAD vẫn d6efb11; index.html working tree SHA256 `70a70fa47131ebd3e6eb44876656cf0fea15a3246dd3a7a4fd33f5736ed7f34d`. Worker đồng thời thêm topic filter/badge/seed metadata trong bank và 3 tests prototype IDs ở shuffle/validate. Đã đọc diff, chạy lại suite/typechecks/build và cả probes LC29 lẫn 88 regressions trên snapshot này. Typecheck từng fail tạm vì thiếu import ExamVersion rồi worker bổ sung; cuối đều exit0. Các **file:line ở findings trỏ về HEAD d6efb11**; working tree cuối thêm 3 dòng đầu bank filter nên các vị trí index trước bank logic lệch +3. Nội dung gây 7 findings không đổi. Không sửa/hoàn tác code của worker.
- **Cutoff bổ sung:** sau snapshot đã kiểm đầy đủ ở trên, worker tiếp tục sửa topic defaults và thêm 1 web test. Đã đọc delta, chạy thêm npm test và hai typecheck: **346 tests / 345 pass / 1 fail**, hai typecheck exit0. F08 dưới đây trỏ working tree mới. Hash quan sát trong giai đoạn này lần lượt `76c3068887434f27cd0315f0afcd0ccbb5dfb464a7bddc498c361802a5259824` và `61dfdeb985a24a0bc7049faf8712cf0dcdcee3e88fad4e166f5bc035fb93bac0`; source đang được sửa đồng thời nên không tuyên bố các gate đã xác minh mọi chỉnh sửa đến sau cutoff. Build/probes toàn bộ cuối cùng gắn snapshot 70a70fa4; các thay đổi topic sau đó không sửa nguyên nhân F01–F07 theo diff đã đọc.
- Delta sản phẩm lớn: index.html +2093/-48, CSS +319 dòng; thêm Apps Script collector, shuffle/persist order, JSON loader, lịch sử/settings, builder và bank. Domain production chỉ rational.ts thêm giới hạn parse 200 ký tự và precision 100; tests tăng mạnh, thêm invariants và collector suite. package/lockfile không đổi trong delta. Giới hạn mới là thay đổi API cần ghi rõ, không tự coi là owner approval cho limits tổng thể.
- files_reviewed: các module `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; luồng index.html: validate → shuffle → load/save/restore → timer/input → submit → collector → report/download/restart; builder/bank JSON/edit/reuse/publish; apps-script/{Code.js,appsscript.json,README.md}; scripts/build.js; package.json, hai tsconfig, README và diff liên quan. Đọc assertions/harness quan trọng của domain/acceptance/e2e, chạy suite và fixtures độc lập. CSS/media kiểm tĩnh và asset/schema checks.
- Review toàn sản phẩm theo đường chạy/ràng buộc, không chứng nhận đọc mọi dòng trong hơn 11 nghìn dòng delta, mọi test/ops/research/dependency hoặc toàn lịch sử. Không có AGENTS.md trong inventory repo; không thấy tại D:\. Không đọc prompt riêng của worker khác. Không cài dependency, sửa code, commit, deploy hoặc tạo branch/worktree. Reviewer chỉ tạo báo cáo này; probes dùng stdin và Map trong RAM.

## Findings

### LC29-F01 — BLOCKER — Mã lượt mẫu dùng chung làm rơi kết quả của học sinh/lượt thi khác

- **VÙNG chịu trách nhiệm: glue.** status: VERIFIED trong runtime JS/VM và collector với Sheet mock; Google thật NOT_RUN.
- affected_files: `index.html:1537–1542` hardcode attempt-sample-01; `index.html:3068–3088` restart xóa record rồi reload; `index.html:1139–1174` history upsert theo attemptId; `apps-script/Code.js:181,204–215` dedupe chỉ theo attempt_id.
- evidence/reproduction_steps: hai page contexts có storage độc lập đều nhận `attempt-sample-01`. Collector thật chạy với Sheet mock nhận Student A tổng 1 rồi Student B tổng 9 cùng mã: lần đầu NEWLY_RECORDED, lần hai ALREADY_RECORDED, chỉ giữ hàng Student A. Luồng submit → restartExam → page mới → initExam → submit giữ cùng ID và history.length=1. Không cần chỉnh DevTools để gặp lỗi: mở ứng dụng mặc định trên hai máy hoặc làm lại đề mẫu.
- expected: mỗi lượt mới có ID riêng, reload cùng lượt giữ ID; hai học sinh đồng thời không bị dedupe thành một. Lịch sử giữ hai lượt khác nhau, retry cùng lượt mới dedupe. Shared §1/3/5.
- actual/impact: học sinh sau nhận xác nhận dù hàng kết quả của mình không được ghi; làm lại ghi đè entry lịch sử cũ, xóa bản final cũ. Đây là mất kết quả ở đường collector đã triển khai, không chỉ xác suất collision nhỏ.
- minimal_fix: cấp ID ngẫu nhiên đủ mạnh khi tạo lượt, persist active-attempt pointer; resume dùng ID đó. Restart tạo lượt mới, giữ archive/final cũ. Không dùng nickname làm ID/xác thực. Xem đồng thời F02; timestamp-only ở loader cũng không đảm bảo duy nhất giữa máy.
- regression_test: hai browser contexts, hai lượt restart thực qua initExam, hai máy cùng millisecond; hai hàng collector cho hai ID; retry cùng ID không thêm hàng; history đủ hai entries và report/raw của lượt cũ vẫn đọc được. Test hiện tại tự gán state/ID cho lượt 2 nên bỏ qua regression.

### LC29-F02 — MAJOR — Refresh/nạp lại đề JSON không tìm lại bài đã lưu

- **VÙNG chịu trách nhiệm: glue.** status: VERIFIED, VM chạy initExam/loadExamVersion thật, chỉ stub rendering.
- affected_files: `index.html:1641–1664` boot chỉ nạp sample; `index.html:1094–1106,1795–1799` lookup gắn attemptId; `index.html:3110–3135` loader cấp ID mới trước restore.
- evidence/reproduction_steps: nạp custom exam `my-custom`, trả lời q="1", saveLocalState; tạo page mới dùng chung store rồi initExam với sample hợp lệ. currentExam trở về `exam-thpt-toan-demo-01`. Nạp lại đúng JSON sau đó nhận ID khác và responses.q=undefined; draft cũ còn trong store nhưng UI không có đường resume nó.
- expected: refresh/offline/back-forward phục hồi đúng đề, version, attempt, raw answers và presentationOrder. Shared §3/5.
- actual/impact: mất khả năng truy cập bài đã lưu qua luồng bình thường; hết thời gian/đang làm trở thành lượt mới khi reimport; chỉ persist order không đủ để đáp ứng restore.
- minimal_fix: persist active attempt identity cùng immutable exam/question/settings/order snapshot; boot resolve pointer và snapshot trước default sample. Loader phân biệt resume và tạo lượt mới; không cấp ID mới trước tìm active attempt. Không suy snapshot từ bank hoặc file latest.
- regression_test: import → answer/flag/name → refresh thật online/offline → đúng exam/ID/raw/deadline/order; reimport đúng đề đề xuất resume; import version mới không phá lượt cũ; restart custom giữ đúng đề và tạo ID mới.

### LC29-F03 — MAJOR — Receipt đến muộn xác nhận và ghi final của đề đang mở khác

- **VÙNG chịu trách nhiệm: glue.** status: VERIFIED bằng deferred fetch trong RAM.
- affected_files: `index.html:2704–2738` payload được tạo trước await; `index.html:2741–2755` sau await mutate studentState/currentExam hiện tại và tính lại storage keys.
- reproduction_steps/evidence: chấm/nộp đề A; giữ pending dispatchToServerCollector bằng Promise; gọi loadExamVersion(B); resolve request A bằng receipt success của A. B đang draft nhận serverConfirmed=true và serverReceipt.attempt_id của A; code ghi cả `cunata:final:NEXT:v1:<id-B>` với submitted=false, scoreResult=null. Probe in đầy đủ envelope thử nghiệm.
- expected: receipt chỉ cập nhật attempt đã gửi, đúng identity và payload; chuyển đề không đổi chủ sở hữu request. Shared §3/5.
- actual/impact: xác nhận sai đối tượng, ghi nhầm namespace final và có thể persist state mới vào nơi không tương ứng request; UI báo máy chủ đã nhận bài chưa nộp. Không khẳng định server thực đã ghi nhầm B: lỗi chứng minh ở client.
- minimal_fix: capture immutable request identity/payload/storage keys; response update đúng record theo ID, kiểm revision/final hợp lệ. Chỉ cập nhật UI khi active attempt vẫn cùng identity; không serialize toàn bộ global state sau await. Abort khi chuyển đề chỉ là bổ sung, không thay identity checks.
- regression_test: delayed A success/failure sau chuyển B hoặc restart; stale tab đổi state trong khi request đang chạy; B không nhận receipt/final của A; A nhận đúng receipt và reload giữ được nó.

### LC29-F04 — MAJOR — Client chấp nhận success của receipt sai mã lượt

- **VÙNG chịu trách nhiệm: glue.** status: VERIFIED.
- affected_files: `index.html:2739–2744`; restore `index.html:1917–1919` cũng chỉ kiểm object cho receipt.
- reproduction_steps/evidence: dispatch cho attempt hiện tại, mock response HTTP ok với `{success:true,attempt_id:"ANOTHER",status:"NEWLY_RECORDED"}`. studentState.serverConfirmed trở thành true. Response không cần trùng attempt; schema/status/identity không được đối chiếu.
- expected: chỉ server receipt hợp lệ, đúng attempt và nội dung/version đã gửi mới chuyển server_confirmed. Shared §3.
- actual/impact: hiển thị và lưu xác nhận không chứng minh hệ thống đã nhận bài tương ứng; khi kết hợp F01, duplicate của bài người khác cũng được tin.
- minimal_fix: validator receipt chặt gồm success, status allowlist, matching attempt_id, exam/version và payload digest/receipt ID nếu protocol dùng; kiểm lại khi restore. Protocol cần thống nhất client/server, không tự suy success thành mọi đảm bảo.
- regression_test: matching NEWLY_RECORDED/ALREADY_RECORDED controls; wrong/missing ID, unknown status, malformed receipt, conflicting payload và restore receipt sai đều không confirmed. Không lấy mock success thay readback trên Google thật.

### LC29-F05 — MAJOR — Bài chờ gửi sau mất mạng không được retry khi reload/nộp lại

- **VÙNG chịu trách nhiệm: glue.** status: VERIFIED đường restore/manual-submit; scheduling/backoff kiểm thêm bằng source.
- affected_files: `index.html:2580–2595` early return adopt final; `index.html:2683–2685` dispatch chỉ ở cuối submit mới; `index.html:2759–2770` failure chỉ đổi badge; `index.html:1641–1683,1793–1947` restore không dispatch/outbox.
- reproduction_steps/evidence: tạo submitted final local chưa confirmed (tương đương POST fail); page mới cùng store có endpoint/fetch thành công, chạy initExam rồi submitExam; số POST = 0. Mạng trở lại không có listener/retry queue. Probe không đợi hàng phút vì source không có scheduler retry nào.
- expected: queued/sending/failed chính xác, bounded retry/backoff/idempotency và tiếp tục pending sau reload. Shared §3.
- actual/impact: chỉ giữ điểm local vô thời hạn; người dùng không có nút gửi lại được nối vào flow, gọi submit lại chỉ adopt final rồi return. README gọi đây là đồng bộ ngoại tuyến nhưng chưa đạt phục hồi gửi.
- minimal_fix: durable outbox theo attempt, enqueue trước POST, bounded retry/backoff và online/manual retry; boot scan pending; giữ payload/ID cố định, chỉ clear khi nhận receipt đúng. Phân biệt failure/local-save failure, không hứa đã lưu local nếu cả persistence cũng fail.
- regression_test: offline submit → reload online → một record; response mất sau server ghi → retry cùng payload nhận receipt cũ; nhiều lần fail có giới hạn/backoff, explicit retry; close/reopen không mất pending; receipt storage quota không báo sai.

### LC29-F06 — CRITICAL — Chỉ sanitize một số cột, payload công thức vẫn đi thẳng tới appendRow

- **VÙNG chịu trách nhiệm: glue.** status: VERIFIED dữ liệu chưa escape được truyền vào Sheet mock qua doPost; thực thi formula trên Google Sheets thật **NOT VERIFIED**.
- affected_files: `apps-script/Code.js:106–112,124,138–156` ID/time/policy dùng String trực tiếp; `apps-script/Code.js:181–185,219–220` chỉ yêu cầu attemptId không rỗng trước appendRow; deployment `apps-script/appsscript.json:7–9` ANYONE_ANONYMOUS.
- reproduction_steps/evidence: gọi doPost với attempt_id="=1+1", exam_id="=2+2", exam_version_id="=3+3", candidate_display="=4+4", started_at="=5+5", submitted_at="=6+6", policy_version="=7+7". Output row A/B/C/E/F/P giữ nguyên dấu `=`, riêng D có tiền tố `'`; receipt NEWLY_RECORDED. Đây là same sink mà sanitizeSheetCell đang bảo vệ ở cột tên/điểm/raw.
- expected: mọi trường untrusted phải được validate và ghi dạng text an toàn; không để anonymous caller đưa formula vào bảng tài khoản owner. Shared §4/7.
- actual/impact: bảo vệ CWE-1236 không áp dụng toàn hàng; endpoint public cho phép bypass hoàn toàn bằng các field khác. Không đã chạy Google thật, không tuyên bố đã lấy dữ liệu hay exploit từ xa.
- minimal_fix: validate schema/length/IDs/ISO timestamps/policy, áp bảo vệ text nhất quán trước sink cho mọi cột có thể nhận chuỗi. Không chỉ sanitize frontend; dùng giá trị identity canonical nhất quán khi dedupe sau xử lý text. Nếu dùng Sheets API RAW/text formatting, cần xác minh thực tế và approval stack tương ứng.
- regression_test: từng cột/trigger =,+,-,@,tab,newline/fullwidth qua doPost → appendRow capture; valid negative III và fraction/raw giữ nguyên nghĩa; fixture harmless =1+1 trên Sheet thử nghiệm được owner cho phép, kiểm readback text/formula; retry ID đã sanitize vẫn dedupe.

### LC29-F07 — MAJOR — Collector xác nhận điểm 999/10 và payload thiếu schema

- **VÙNG chịu trách nhiệm: glue.** status: VERIFIED với doPost thật/Sheet mock.
- affected_files: `apps-script/Code.js:165–185,219–220` không validate exam/version/answers/scores; `apps-script/Code.js:115–124` copy điểm client, defaults về 0/custom-v1.
- reproduction_steps/evidence: payload chứa attempt_id, total="999", maxTotal="10", không có câu trả lời/section scores vẫn NEWLY_RECORDED; row N/O là "999"/"10", các phần thành "0". Mock chỉ thay Google I/O; parse/validation/format/write path là production code.
- expected: collector từ chối schema/điểm/tổng mâu thuẫn; không xác nhận một result không hợp lệ như báo cáo chấm điểm hợp lệ. Với kiểm tra cần tin cậy, phải chấm từ raw theo snapshot server kiểm soát, theo Shared §3/4.
- actual/impact: bảng điểm nhận dữ liệu vượt max hoặc section/tổng không khớp; mọi caller có thể tự đặt điểm. Không yêu cầu thêm login vào MVP; nickname không giải quyết được việc tin điểm client.
- minimal_fix: schema và exact-rational consistency validation trước ghi; owner quyết rõ collector chỉ nhận self-reported practice hay trusted grading. Với trusted mode phải resolve immutable exam/key server-side và chấm lại; validation range đơn thuần không chứng minh correctness. Label dữ liệu self-reported nếu chọn practice, không tự đổi yêu cầu bảo mật.
- regression_test: >max, âm, malformed fractions, missing identities, section sum mismatch, unknown rule/version/raw, client forged in-range score; accepted controls giữ exact fractions và request idempotency; trusted mode không lấy key/score từ payload làm chuẩn.

### LC29-F08 — MINOR — Web test topic mới assert ID khác fixture thật

- **VÙNG chịu trách nhiệm: glue.** status: VERIFIED tại cutoff working tree mới; không phải lỗi filter đã chứng minh trên browser.
- affected_files: `test/e2e/demoFlow.test.ts:3232–3233` working tree; fixture `public/sample-exam.json:42,106`.
- evidence/reproduction_steps: `npm test` exit1, 346 tests, 345 pass/1 fail. Test multi-topic assert `q03-i-oxyz-vtpt` nhưng fixture thực là `q03-i-oxyz`; assertion tiếp theo cũng dùng `q06-ii-mat-cau-oxyz` khác `q06-ii-oxyz-mat-cau`. Test dừng ở line 3232.
- expected: assertions dùng đúng stable IDs của fixture được seed; full suite xanh trước gate.
- actual/impact: gate đỏ vì test giả định dữ liệu khác; chưa thể dùng test này chứng nhận topic filter. Không suy từ assertion fail thành production filter hỏng.
- minimal_fix: sửa expectations theo fixture thực hoặc tạo fixture độc lập trong test với IDs rõ; không đổi stable production IDs chỉ để chiều test. Kiểm cả assertion phủ định để tránh pass giả.
- regression_test: chạy riêng demoFlow và full npm test sau sửa; xác nhận đúng members/nonmembers cho từng topic và combined filters. Typecheck cuối đã xanh, không bỏ qua npm test fail.

## checks_run

Environment: Windows PowerShell; cwd D:\Cunata; Node v24.14.0, npm 11.9.0, TypeScript 7.0.2, Python 3.11.0. Evidence là output và exit codes trong transcript LC29 cùng mã tái lập ở dưới; không ghi log/artifact khác ngoài scope.

| Command/check | Exit | Kết quả và giới hạn |
| --- | ---: | --- |
| `npm test` (pipe Select-Object -Last 20/10/45; exit $LASTEXITCODE) | đầu 0; cuối **1** | Đầu 342/342; snapshot 70a70fa4 345/345, duration 897.9245 ms; **lần cuối 346 tests, 58 suites, 345 pass, 1 fail, 0 cancelled/skipped/todo; duration 692.6007 ms**, F08. E2E mang tên browser nhưng thực tế Node VM/DOM và Google mocks. |
| `npx --no-install tsc -p tsconfig.json` | đầu 0; giữa 1; cuối 0 | Giữa phiên TS2304 test/domain/shuffle.test.ts:1042 thiếu ExamVersion. Worker thêm import type; cuối không diagnostics, 1.470 s wall. Compiler có sẵn, NOT_RUN cũ trong M1 không còn phản ánh runtime. |
| `npx --no-install tsc -p tsconfig.web.json` | đầu 0; giữa 1; cuối 0 | Cùng lỗi import và đã retest sau sửa, cuối 1.476 s wall; không typecheck inline index JS hoặc Apps Script Google globals. |
| `node scripts/build.js` | 0 | Asset/schema/syntax verification: index đầu 228778, **cuối 231611**, CSS 23967, JSON 8566, SVG 2584, Code.js 9170 bytes; sample 8 câu hợp lệ. Không bundling, browser render hoặc deployment. |
| `python -B test/oracle/oracle.py --check` | 0 | **11 pass, 0 fail/skip**, 1632 fixtures, 5849 maxima configs, 9 negative controls; seed 20261114, 1.0133 s. Oracle-only, không tự tính là SUT differential. |
| Trích các fenced JS LC20/22/23/24/25/26/27/28, spawnSync từng block qua stdin | 0 | Đầu và cuối: 12 child commands đều exit0, **88/88 probe cases pass** (18+6+9+6+3+3+4+5+4+24+3+3), cuối wall 1.158 s. Gồm domain/web đối chiếu 1632 fixtures và DTO roundtrip; không cộng fixtures/assertions vào số test runner. |
| LC29 web probe bên dưới | **1** | Đầu và cuối **7 cases, 1 pass / 6 fail**. LC28 expired-refresh pass; 6 failures là F01 (2 cases), F02/F03/F04/F05. Rerun trực tiếp từ báo cáo in hash cuối 70a70fa4; wrapper exit0 nhưng child web exit1, không báo wrapper thành PASS. |
| Inline Apps Script probe: formatRecordRow/doPost với Sheet mock | 0 | Diagnostics chứng minh F01/F06/F07: raw formulas tới sink, forged 999/10 NEWLY_RECORDED, Student B ALREADY_RECORDED sau A. Exit0 là probe chạy thành công, không phải security PASS; không dùng test count vì chỉ in captures. |
| Inline parseFractionString trailing LF/CR/fraction LF | 0 | Cả ba input bị SyntaxError; không finding canonical-whitespace mới. |
| `git diff --check -- index.html src test styles scripts README.md apps-script` | 0 | Không whitespace errors ở working-tree product scope. Không kiểm ops logs. |
| git status/log/rev-parse/diff, SHA256 | 0 | Revision/snapshot như trên; kiểm lại cuối phiên, giữ nguyên thay đổi điều phối. |

NOT_RUN: browser desktop/mobile/hai tab thật, native IME/cursor/keyboard/AT, screenshot/trace, tải HTML/PDF rồi mở offline thật; Google deployment/CORS/redirect/receipt readback; actual Sheet formula execution; full SAST/dependency advisory/license/full-history secret scan, axe/Lighthouse, SUT mutation. Không có lint script. Lệnh đọc Code.gs ban đầu không thấy file, đã sửa sang Code.js thật; inventory `web` không tồn tại. Không tính các lỗi inventory này là bằng chứng PASS.

## Coverage gaps / traceability

- B1-AC01–03, T01–09/T15: engine thuần, exact III, II exhaustive, rational maxima và section totals được source/unit/oracle differential kiểm; chưa thấy sai số scoring. API numeric limits mới được test hiện có nhưng M1 chữ ký không nêu upper bound cho mọi precision/rational string; cần ghi chính sách limits tương thích, không dùng test xanh làm phê duyệt nghiệp vụ.
- B1-AC04–06, T11–14: ID schema/malformed persistence/DTO/permutation regressions cũ xanh. Web đã nối shuffle và persist presentationOrder, bank/builder clone giữ isolation trong cùng phiên; **không còn ghi chúng là chưa implement**. Tuy nhiên immutable exam snapshot + active-pointer restore chưa có (F02); tests bank-edit isolation trong RAM không thay được reload với source đổi. Model domain vẫn không phụ thuộc Google/DOM.
- Offline/concurrency: final reconciliation cũ xanh trên các interleavings đã thử; read→write localStorage chưa có transaction/CAS và chưa kiểm scheduler hai browser thật. F03 thêm async receipt race đã chứng minh, tách khỏi race final/final tổng quát vẫn SUSPECTED / NOT VERIFIED. Không có service worker/offline shell được kiểm; localStorage draft không chứng minh cold-start offline.
- Teacher/bank: đã có JSON import/export, edit/reorder/duplicate, subject/grade/difficulty filters và reuse; delta cuối thêm topic filter/badge/seed defaults. Chưa hoàn chỉnh cây Chương/Chủ đề > Bài với stable taxonomy/version/publish/archive; flat topic string không thay phân cấp đầy đủ. Chưa có draft builder autosave/recovery được xác minh. Export/import media tổng quát chưa được chứng minh; offline report chỉ embed known sample asset hoặc data URI, các ảnh khác bị placeholder.
- UI/report: đã có time metadata, score/max từng phần, HTML export và print. Source releasePolicy có nhánh ẩn key/explanation; client vẫn tải key, không thể nghiệm thu chế độ giấu đáp án tin cậy. Chưa kiểm tự công bố sau deadline khi đã submit sớm (timer bị clear, chưa thấy schedule rerender); đây là coverage gap, không gắn VERIFIED bug. Math renderer là regex subset, chưa chứng minh LaTeX tổng quát/nested equations/mobile overflow.
- Collector: đã có implementation Apps Script, LockService, dedupe và dispatch; không còn coi là NOT IMPLEMENTED toàn bộ. F01/F03–F07 chặn nghiệm thu. ensureHeaderRow còn chạy trước lock (Code.js:192–196), cold-sheet concurrency chưa kiểm; anonymous endpoint chưa có resource/rate/replay controls hoặc receipt payload binding. Không có evidence production, CORS/readback/retention/approval stack trong review này.
- B1-AC07/08, T10/T16/T17: suite không thay browser/Google integration; các tests lịch sử/setup thủ công ID bỏ lỡ production init. Oracle negative controls không phải mutation SUT. Chưa có acceptance/rollback/migration/performance/security evidence đầy đủ cho milestone toàn sản phẩm.

## Lộ trình còn thiếu — ưu tiên

1. **P0 / glue:** sửa F01/F02 trước thu kết quả nhiều học sinh; immutable snapshot + active identity + resume + archive/restart. Sửa F03/F04/F06 và chặn payload sai F07 trước bật collector public; retry/outbox F05 trước nghiệm thu đồng bộ. Giữ 88 regressions và thêm các probes LC29 vào tests thực.
2. **P1 / glue:** browser E2E thật cho JSON/custom→refresh/restart/back-forward, hai context/hai tab, offline/online, delayed collector, quota và tải/mở report offline; desktop/mobile, Telex/VNI, focus/keyboard/AT, math/media. Xác minh auto-release và maxAttempts đúng trong giới hạn no-login; không quảng cáo chống gian lận tuyệt đối.
3. **P1 / glue:** hoàn thiện bank/builder theo cây phân loại đầy đủ, version publishing/archive, draft recovery, export/backup/delete và media packaging; chưa thay API schema/stack nếu owner chưa duyệt.
4. **P1 / glue:** collector schema/trusted-vs-practice policy, bounded outbox, payload-bound receipts, Google CORS/redirect/write/readback/idempotency/concurrency thật; privacy retention/export/delete/rate/resource controls và không publish write credentials.
5. **P2 / glue:** DOCX/PDF importer chưa có: parse → IR giữ text/table/image/OMML/math/provenance/confidence → preview/sửa → confirm; phân biệt text/scan/OCR, không đoán key thiếu; corpus lỗi/multi-column/resource/security. JSON loader không thay importer tài liệu.
6. **P2 / glue + src/domain khi có rule mới:** mẫu THPT môn/năm/văn bản chính thức kiểm chứng, tách custom-v1; policy versions và migration. Sau đó browser CI, a11y/performance/security/license/changelog/rollback và owner acceptance. Class/Assignment thuộc giai đoạn sau.

## NEED_DECISION

Không thấy xung đột scoring mới giữa hai contract. Không tự chốt các lựa chọn dưới đây; chúng không cản sửa identity/receipt/sanitization đã chứng minh.

| Quyết định owner | 2–3 phương án |
| --- | --- |
| Collector và độ tin cậy | A local practice/self-reported rõ nhãn; B server chấm lại theo snapshot được owner quản lý; C hoãn collector public tới khi B được duyệt/kiểm. Validation consistency vẫn cần ở mọi phương án có collector. |
| Storage/hosting/report stack | A duyệt local practice + HTML; B transactional local store + Apps Script/serverless collector được kiểm; C thêm PDF sau đánh giá. Code hiện có không tự là phê duyệt stack/production. |
| Grammar III | A tiếp tục charset/length tạm; B grammar hẹp với inputPolicyId mới; C grammar theo preset/version được duyệt. |
| Display rounding | A fraction exact; B digits/mode rõ, giữ rational gốc; C fraction + decimal xấp xỉ có nhãn. |
| Limits/grouping | A duyệt 1000 câu/nhóm I→II→III và ghi resource bounds cụ thể; B đổi limits/grouping có version/regressions. |
| Mẫu chuẩn THPT | A chỉ custom-v1 ở milestone này; B chọn môn/năm/nguồn chính thức trước triển khai preset. |

assumptions: NONE mới; không dùng các mặc định demo làm quyết định nghiệp vụ. recommended_action: giao glue sửa findings; owner trả lời policy trước milestone tương ứng; không merge/deploy theo gate xanh hiện tại. tools_research: không giao nghiên cứu tool mới. privacy_notes: chỉ dữ liệu thử và evidence kỹ thuật; không credentials hoặc nội dung hồ sơ riêng.

## Tái lập web probes LC29 (không tạo file)

Trích block JS này rồi pipe vào `node --input-type=module` tại repo root. Helper từ LC19 là VM/Map, không browser; tất cả storage writes ở RAM. Mong đợi hiện tại exit1, pass1/fail6.

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8')
 .match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0];
const probe=String.raw`
let pass=0,fail=0;
async function check(id,fn){try{await fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
function prep(store=new Map()){const p=page(store);p.run('renderExamPane=()=>{};renderPalette=()=>{};renderBuilderForm=()=>{}');return p}
await check('LC28 expired refresh name',async()=>{
 const store=new Map(),a=prep(store);setExam(a,exam());a.run('document.getElementById("candidateName").value="Nguyen LC29";saveLocalState()');
 const d=JSON.parse(store.get(a.key()));d.startedAt=Date.now()-10000;d.deadline=Date.now()-1;store.set(a.key(),JSON.stringify(d));
 const b=prep(store);setExam(b,exam());b.run('document.getElementById("candidateName").value="Thí sinh tự do";fetch=async()=>({ok:true,json:async()=>ex})');await b.run('initExam()');assert.equal(b.run('studentState.candidateName'),'Nguyen LC29');
});
await check('custom draft survives actual init and reimport',async()=>{
 const store=new Map(),a=prep(store);a.c.custom=exam('custom-v1','my-custom');a.run('loadExamVersion(custom);studentState.responses.q="1";saveLocalState()');
 const oldId=a.run('studentState.attemptId');const b=prep(store);b.run('fetch=async()=>({ok:true,json:async()=>EMBEDDED_SAMPLE_EXAM})');await b.run('initExam()');
 console.log('reloadExam='+b.run('currentExam.examId'));b.c.custom=a.c.custom;await new Promise(r=>setTimeout(r,5));b.run('loadExamVersion(custom)');
 console.log('oldId='+oldId+' reimportId='+b.run('studentState.attemptId'));assert.equal(b.run('studentState.responses.q'),'1');
});
await check('independent clients receive distinct attempt IDs',()=>{const a=prep(),b=prep();assert.notEqual(a.run('studentState.attemptId'),b.run('studentState.attemptId'))});
await check('restart creates new attempt/history entry',async()=>{const store=new Map(),a=prep(store);a.run('submitExam()');const old=a.run('studentState.attemptId');a.run('restartExam()');const b=prep(store);b.run('fetch=async()=>({ok:true,json:async()=>EMBEDDED_SAMPLE_EXAM})');await b.run('initExam()');b.run('submitExam()');console.log('historyLength='+b.run('getAttemptHistory(currentExam,studentState).length'));assert.notEqual(b.run('studentState.attemptId'),old)});
await check('receipt for another attempt rejected',async()=>{const p=prep();setExam(p,exam());p.run('studentState.scoreResult=scoreAttemptLocally();studentState.submitted=true;window.CUNATA_COLLECTOR_URL="https://collector.invalid";fetch=async()=>({ok:true,json:async()=>({success:true,attempt_id:"ANOTHER",status:"NEWLY_RECORDED"})})');await p.run('dispatchToServerCollector()');assert.equal(p.run('studentState.serverConfirmed'),false)});
await check('late receipt cannot finalize another exam',async()=>{const p=prep();setExam(p,exam());p.run('studentState.scoreResult=scoreAttemptLocally();studentState.submitted=true;window.CUNATA_COLLECTOR_URL="https://collector.invalid";fetch=()=>new Promise(r=>globalThis.resolveFetch=r)');const pending=p.run('dispatchToServerCollector()');p.c.next=exam('v1','NEXT');p.run('loadExamVersion(next)');const key=p.run('getFinalStorageKey(currentExam,studentState)');p.c.resolveFetch({ok:true,json:async()=>({success:true,attempt_id:'attempt-sample-01',status:'NEWLY_RECORDED'})});await pending;console.log('newDraftFinal='+p.store.get(key));assert.equal(p.run('studentState.serverConfirmed'),false);assert.equal(p.store.has(key),false)});
await check('saved pending final retries after reload',async()=>{const store=new Map(),a=prep(store);setExam(a,exam());a.run('submitExam()');const b=prep(store);setExam(b,exam());b.run('window.CUNATA_COLLECTOR_URL="https://collector.invalid";posts=0;fetch=async(url,opts)=>{if(opts){posts++;return {ok:true,json:async()=>({success:true,attempt_id:studentState.attemptId})}}return {ok:true,json:async()=>ex}}');await b.run('initExam()');b.run('submitExam()');await Promise.resolve();assert.ok(b.run('posts')>0,'no retry POST after restore/manual submit')});
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probe).toString('base64'));
```

## Tái lập collector captures (mock, không gửi Google)

```js
import fs from 'node:fs';import vm from 'node:vm';
const rows=[];
const sheet={getLastRow:()=>rows.length,appendRow:r=>rows.push(r),getRange:(start,col,count)=>({getValues:()=>rows.slice(start-1,start-1+count).map(r=>[r[col-1]])})};
const c=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getActiveSheet:()=>sheet}),flush(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:body=>({setMimeType:()=>({body})})}});
vm.runInContext(fs.readFileSync('apps-script/Code.js','utf8'),c);
const data={attempt_id:'=1+1',exam_id:'=2+2',exam_version_id:'=3+3',candidate_display:'=4+4',started_at:'=5+5',submitted_at:'=6+6',policy_version:'=7+7',total:'999',maxTotal:'10'};c.data=data;
console.log('unsafeRow',JSON.stringify(vm.runInContext('formatRecordRow(data)',c)));
console.log('forgedScoreReceipt',c.doPost({postData:{contents:JSON.stringify(data)}}).body);
console.log('storedRow',JSON.stringify(rows[1]));
const first={attempt_id:'attempt-sample-01',candidate_display:'Student A',total:'1',maxTotal:'10'};
console.log('first',c.doPost({postData:{contents:JSON.stringify(first)}}).body);
console.log('second',c.doPost({postData:{contents:JSON.stringify({...first,candidate_display:'Student B',total:'9'})}}).body);
console.log('dataRows',rows.length-1);
```
