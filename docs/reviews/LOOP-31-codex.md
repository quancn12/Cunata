# LC31 — Kiểm định độc lập toàn sản phẩm

**verdict: CHANGES_REQUESTED.** Còn 5 findings OPEN: 1 CRITICAL, 4 MAJOR. Gate cuối **345/348 pass, 3 fail**. Không có counterexample số học trong các fixtures đã chạy; chưa đủ điều kiện nghiệm thu toàn sản phẩm. Handoff: **NEED_DECISION** cho collector/trust và các policy chưa chốt.

review_id/task_id/worker_id: LC31; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 và M1-scoring-contract v1.0, đã đọc toàn bộ; acceptance_reference: READINESS §6 / B1-AC01–08 / B1-T01–17; risk_level: HIGH.

## Revision, delta, cutoff

- base_commit = head_commit: `2425ce864bd6eb06be5c56945d241da296c6986c`, main. `git log -6 --oneline` cho thấy HEAD vẫn là round25; delta so LC30 nằm trong working tree, không phải commit mới.
- SHA256 cutoff đã kiểm: index.html **814b881ec945709b61cdc9bc871c3b6b274f2fbf161d3f44aed45e7226febf68**; apps-script/Code.js **f7b85ba5e715f3d5b96fa5beb6c08f0c1148d2653ff8f13f0c8b8463a584ffa4**; test/e2e/demoFlow.test.ts **3a04df7b35ee0dcc0bf0cb0bc3cab47c4a20434848e818d44876f645269b5283**.
- Worker khác sửa index.html trong lúc review: đầu lượt 340/348 pass, 8 fail; snapshot 3e601918 có 339/348 pass, 9 fail; sau bổ sung legacy identity/active pointer, cutoff 814b881e có **345/348 pass, 3 fail**. Findings và probes đã đối chiếu lại trên hash cuối. Nếu working tree đổi sau cutoff, không suy rộng kết quả cho bytes chưa kiểm.
- Delta cutoff: index.html +229/-36, collector +130/-11, judge tests +94/-1, shortAnswer tests +7 (tổng 460 insertions/48 deletions). Không có delta src/domain production, package/lock/tsconfig/scripts/styles/public/README so HEAD và LC30. Collector thêm rational validation, toàn hàng sanitize, header trong lock. Web thêm random identity/active pointer, resume, receipt reconciliation, retry-on-restore/manual-submit, restart giữ final.
- Trước khi làm có modified index/collector/domain tests và file ops/workers.html; untracked LC30 report cùng metadata điều phối. Không sửa/hoàn tác chúng, không đọc prompt riêng của worker khác. Không có AGENTS.md trong inventory repo và D:\.
- files_reviewed: domain model/public API/rational/shortAnswer/validate/judge/shuffle/examMax/scoreAttempt/serialize; web theo luồng validate → shuffle → input/timer → local persistence/restore → submit/collector → report/restart; bank/builder/import/export/filter; collector Code.js/manifest/README; package/config/build script, fixtures và assertions/harness liên quan. CSS/assets kiểm tĩnh, không visual acceptance. Đây là review theo luồng/ranh giới và delta, không tuyên bố đọc từng dòng mọi test/ops/dependency/history.
- Chỉ tạo docs/reviews/LOOP-31-codex.md; không sửa code/test, cài dependency, branch/worktree, commit, deploy, hoặc gửi Google. Probes stdin dùng storage và Google mocks trong RAM.

## Findings OPEN

### LC31-F01 — CRITICAL — Collector kiểm một giá trị nhưng ghi giá trị alias khác; schema còn mở

- **VÙNG chịu trách nhiệm: glue.** VERIFIED; LC30-F07 sửa một phần.
- affected_files: **apps-script/Code.js:158–159,214–229,255–257,323–337**.
- evidence/reproduction_steps: collector probe dưới gọi doPost với total="1", maxTotal="10", total_score="999", max_total="1" và sections hợp lệ tổng 1/10. Validator ưu tiên total/maxTotal, formatter ưu tiên total_score/max_total. Receipt NEWLY_RECORDED; hàng N/O ghi **999/1**, dù H:M cộng 1/10.
- Các bypass cùng boundary đã tái lập: chỉ {attempt_id:"missing"} vẫn nhận NEWLY_RECORDED, ghi thiếu exam/version và max=0; sections chỉ có I.score=999/max=1 với total=1/maxTotal=10 được chấp nhận do thiếu II/III; numeric attempt_id=123 bị ép thành string. Cùng ID gửi điểm 1 rồi 9 được ALREADY_RECORDED thay vì phát hiện payload conflict.
- expected: schema/identity/version/score/range/section sums được kiểm trên **đúng object canonical được ghi**; retry cùng dữ liệu idempotent, dữ liệu khác không được xác nhận như cùng bản ghi. Shared §2/3/4/5.
- actual/impact: bảng owner nhận kết quả không nhất quán hoặc thiếu dữ liệu, receipt không chứng minh payload được ghi đúng. Đây là bằng chứng tại sink appendRow mock, không tuyên bố đã ghi Google thật. Validation consistency cũng không biến điểm client thành trusted grade.
- minimal_fix: parse một schema canonical duy nhất; reject alias mâu thuẫn (hoặc bỏ alias sau bước normalize); required typed IDs/version/total/max/sections/raw; exact rational/range/sum validation trên canonical row; fingerprint payload để phân biệt retry/conflict. Owner quyết định self-reported practice hay server grading; không tự xây trusted mode bằng key client.
- regression_test: các payload trên phải bị reject, không append; valid 10/3 với full sections phải qua; alias đồng nhất theo protocol, thiếu field/partial section/numeric IDs/negative/>max/malformed fraction, cùng ID khác nội dung; server-recorded-but-response-lost retry; Google readback riêng.

### LC31-F02 — MAJOR — Khởi động vẫn chọn sample thay vì phục hồi đề JSON đang làm

- **VÙNG chịu trách nhiệm: glue.** VERIFIED; LC30-F02 PARTIALLY_FIXED.
- affected_files: **index.html:1672–1696,1828–1860,3271–3322**.
- evidence/reproduction_steps: loadExamVersion(exam CUSTOM/v1), responses.q="1", save; mở page context mới cùng storage, initExam fetch sample hợp lệ. currentExam.examId trở thành exam-thpt-toan-demo-01 thay vì CUSTOM. Web probe fail đúng expected CUSTOM.
- expected: refresh/back-forward/offline tiếp tục đúng exam/version, immutable question/settings/order snapshot, raw/name/deadline/identity; Shared §3/5.
- actual/impact: pointer hiện chỉ tra sau khi đã chọn currentExam; không có boot pointer tới snapshot đề CUSTOM. Draft chưa bị chứng minh xóa, nhưng UI không tự tìm được. **Reimport cùng JSON đã resume được cả draft/final**, không còn báo luồng đó hỏng.
- minimal_fix: persist active exam/attempt tuple và immutable exam/settings snapshot; boot resolve trước fetch sample; tách create-new/resume. Không dùng bank/latest hoặc ID đề đơn lẻ để thay snapshot đã giao.
- regression_test: import CUSTOM → nhập raw/name/flag → refresh online/offline/back-forward → giữ tuple/snapshot/deadline/order; source/key đổi sau đó không đổi kết quả cũ; sample và reimport controls; restart CUSTOM qua reload vẫn CUSTOM.

### LC31-F03 — MAJOR — Submit reconciliation vẫn nhận confirmed từ receipt giả đã lưu

- **VÙNG chịu trách nhiệm: glue.** VERIFIED; LC30-F04 PARTIALLY_FIXED.
- affected_files: **index.html:2668–2671,2711–2714**; đối chiếu validation đúng hơn tại loadLocalState và dispatchToServerCollector.
- evidence/reproduction_steps: tạo valid final thật; sửa serverConfirmed=true, serverReceipt={success:true,attempt_id:"FOREIGN",status:"BOGUS"} ở draft/final trong Map; active state reset confirmation; gọi submitExam. studentState.serverConfirmed trở thành true và receipt giả được adopt.
- expected: mọi nhánh khôi phục/adopt final đều kiểm schema/status/identity receipt trước server_confirmed; Shared §3.
- actual/impact: loadLocalState và POST response đã kiểm ID/status, nhưng early-return branches của submit bỏ kiểm, có thể bỏ retry và báo nhận máy chủ sai. Không tuyên bố no-login/localStorage có thể chống người dùng tự sửa toàn bộ client; đây là validation inconsistency/recovery correctness.
- minimal_fix: dùng chung validator receipt binding cho restore/submit/dispatch; receipt invalid không set confirmed, giữ pending; kiểm tuple và payload theo protocol được duyệt.
- regression_test: valid final + foreign/missing ID/unknown status/success=false/no receipt tại cả hai submit reconciliation branches; valid matching receipt control; reload+manual submit không nâng receipt invalid thành confirmed.

### LC31-F04 — MAJOR — Có retry khi restore nhưng chưa có outbox/backoff hữu hạn

- **VÙNG chịu trách nhiệm: glue.** VERIFIED bằng failure probe và source; LC30-F05 PARTIALLY_FIXED.
- affected_files: **index.html:2008–2012,2666–2668,2712–2714,2773–2893**.
- evidence/reproduction_steps: sau failed POST (fetch throw offline), setTimeout stub thu lịch retry thấy **0 callbacks**. Source chỉ dispatch lúc submit/restore; không durable retry count/nextRetry/outbox scheduler/online handler/backoff. Có setTimeout highlight UI, không phải retry.
- expected: lưu pending ổn định, queued/sending/failed/server_confirmed đúng, retry có giới hạn/backoff, chống dữ liệu cũ ghi đè final; Shared §3.
- actual/impact: mạng phục hồi trong trang đang mở không tự gửi lại; phải reload/nộp lại thủ công. **Probe pending-final → reload online hiện POST=1 và PASS**, nên không còn ghi “không retry sau reload”. Không có evidence về giới hạn/backoff/close-reopen payload stability.
- minimal_fix: persist immutable outgoing payload/identity + retry metadata; một request in-flight/attempt, bounded backoff và online/manual wake; chỉ ack đúng receipt mới clear. Chọn thông số retry theo policy được duyệt, giữ manual recovery khi hết lượt.
- regression_test: offline submit → online không reload; retry/backoff/limit giả lập clock; reload pending; lost response sau server write; concurrent retry/double submit; quota/close-reopen; labels failed/local-saved/confirmed đúng.

### LC31-F05 — MAJOR — Gate regression chưa được cập nhật theo identity/restart mới

- **VÙNG chịu trách nhiệm: glue.** VERIFIED, không diễn giải cả 9 failures thành 9 lỗi sản phẩm.
- affected_files: **test/e2e/demoFlow.test.ts:122–192,256–270,1843–1900,2211**.
- evidence/reproduction_steps: npm test cuối exit1, **348 tests / 345 pass / 3 fail**, 58 suites; fail starts 256,1843,2211. Ca multi-tab tạo hai contexts độc lập không resume cùng ID nhưng vẫn đòi draft B adopt final A. Ca restart line1883 đòi xóa final cũ, trái mục tiêu giữ kết quả cũ vừa sửa. Ca history tự gán attempt-h1/h2 thay vì đi qua create/resume lifecycle mới. Harness localStorage vẫn thiếu length/key cho migration scan. Sáu lỗi snapshot trước không còn fail sau sửa active pointer/legacy identity; không giữ chúng như lỗi OPEN.
- expected: tests setup cùng attempt cho race, IDs riêng cho lượt độc lập; valid/invalid controls đúng identity; restart giữ immutable final/archive; không nới validation để chiều fixture cũ.
- actual/impact: gate đỏ, chứng cứ regression lifecycle còn chưa đủ tin cậy. Probe reviewer có length/key và loadExamVersion thật resume final thành công; không coi lỗi harness là bằng chứng final mới bị mất. Các ca raw/foreign IDs/candidate đã trở lại PASS tại cutoff.
- minimal_fix: mô phỏng Storage đủ API, capture actual generated IDs, boot/resume qua đường thật; sửa expected restart/archive; giữ negative assertions và controls, thêm probes LC31 vào suite được worker sở hữu.
- regression_test: toàn npm suite xanh, cả 3 ca còn đỏ được sửa root setup/expectation; hai độc lập không adopt nhau, hai tab cùng attempt không ghi đè final, legacy migration, malformed raw/report, name/deadline, restart archive/history; không skip/xóa assertions để đạt gate.

## Những lỗi đã sửa / retest

| LC30 finding | Kết quả tại cutoff |
| --- | --- |
| F01 shared attempt ID/restart | Initial độc lập và custom loader fixed-clock đều unique; restart giữ final và có ID mới: PASS. Chưa chứng minh collision tuyệt đối/browser; không còn giữ finding cũ như nguyên trạng. |
| F02 resume | Same custom JSON reimport draft/final PASS; boot CUSTOM còn F02. |
| F03 delayed receipt | Matching A receipt cập nhật final A, không confirm/create final B: PASS trong VM; đã đọc capture tuple/storage keys mới. |
| F04 receipt | Live wrong ID/status rejected PASS; restore có validator; submit adopt còn F03. |
| F05 pending retry | Reload/manual trigger PASS; bounded retry/backoff còn F04. |
| F06 formula columns | Tất cả string sinks A/B/C/D/E/F/P được prefix trong mock PASS; header đã chuyển vào lock. Google literal/formula readback NOT_RUN. |
| F07 score schema | 999/10 đơn thuần bị reject, valid 10/3 được nhận; alias/schema bypass còn F01. |

## checks_run

Environment: PowerShell, D:\Cunata; Node v24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Transcript tool outputs là bằng chứng; không tạo log ngoài scope.

| Lệnh/check | Exit | Kết quả / giới hạn |
| --- | ---: | --- |
| npm test — đầu lượt | 1 | 348 tests, 340 pass, 8 fail; 58 suites, skip/cancel/todo=0; 892.1875ms ở lần đọc summary. |
| npm test — snapshot 3e601918 | 1 | 348 tests, 339 pass, 9 fail; 766.219ms. Bằng chứng trung gian, không phải kết quả cutoff. |
| npm test — cutoff cuối 814b881e | **1** | **348 tests, 345 pass, 3 fail**, 58 suites, skip/cancel/todo=0, **689.1033ms**. Fail starts demoFlow.test.ts:256,1843,2211. |
| npx --no-install tsc -p tsconfig.json | **0** | Không diagnostics, cuối wall1.439s. Compiler hiện có; không dùng NOT_RUN lịch sử trong M1. |
| npx --no-install tsc -p tsconfig.web.json | **0** | Không diagnostics, cuối wall1.447s. include src/scripts/test, **không chứng minh inline HTML JS hoặc Google runtime đã typecheck**. |
| node scripts/build.js | **0** | Cuối wall0.131s; index245441 bytes, collector14647 bytes; 7 assets tồn tại, sample8 câu hợp schema, CSS link và collector syntax. Đây là read-only verifier, không bundle/render/deploy. |
| python -B test/oracle/oracle.py --check | **0** | **11 pass / 0 fail/skip**, 1632 fixtures, 5849 maxima, 9 negative controls, seed20261114, duration_s1.4949; oracle-only. |
| Web probes dưới, Node stdin | **1** | Cuối **14 cases / 11 pass / 3 fail**; CUSTOM boot, forged persisted receipt, no backoff fail. Hai cases khác đối chiếu toàn1632 fixtures mỗi bên domain/web; domain DTO roundtrip PASS. Hash trùng cutoff. Không cộng fixtures vào npm counts. |
| Collector probes dưới, Node stdin | **1** | **8 cases / 3 pass / 5 fail**; sink safety, 999/10 reject, full rational valid PASS; thiếu schema, partial sections, alias conflict, same-ID conflict, numeric ID fail. Google I/O chỉ mock. |
| git diff --check -- index.html src test scripts styles README.md apps-script | **2** | apps-script/Code.js:50 trailing whitespace; ghi đúng failure, không coi là bug bảo mật. |
| git status/log/rev-parse/diff/inventory/Get-FileHash, runtime versions | 0 | Snapshot trên; scope giữ nguyên. Không lint script. |

Tổng reviewer probes cuối **22 cases, 14 pass, 8 fail**, tách khỏi npm/oracle counts. Bản web probe trung gian 11 cases có 5 rồi3 failures; không cộng dồn snapshots. Final 14 cases mới là cutoff.

## coverage_gaps / traceability

- B1-AC01–03/T01–09/T15: source/exhaustive II/unit/oracle differential domain + web xác nhận exact III, unanswered II không là false, maxima5/15/16, N3=3/7 và exact sections/total. Không tìm được lỗi số học mới. Rational/precision bounds hiện có cần document/owner duyệt tương thích API; không lấy test làm approval.
- B1-AC04–06/T11–14: domain validation/DTO/shuffle APIs không có production delta; pointer/resume/restart đã tiến bộ nhưng immutable exam/settings snapshot và boot CUSTOM chưa đạt F02. Bank/builder clone trong RAM không thay durable version workflow.
- Concurrency: delayed receipt A/B đã PASS, nhưng read/write localStorage không transaction/CAS; scheduler browser/two-tab final-final/quota/private mode/migrations chưa kiểm đầy đủ. Các tests race đang đỏ có setup identity lỗi; không khẳng định data corruption từ chúng.
- UI/report: đã có timing, tổng/từng phần score/max, HTML download/print và releasePolicy branch. Chưa mở file tải offline thật, kiểm tự công bố sau deadline sau submit sớm, browser mobile/desktop/math/media overflow, focus/keyboard/AT/native Telex/VNI/IME/cursor. Client vẫn tải keys; không nghiệm thu trusted hidden-answer exam.
- Bank/builder: JSON import/export/edit/reorder/duplicate/reuse và subject/grade/difficulty/topic filters đã có; thiếu taxonomy Chương/Chủ đề > Bài ổn định đầy đủ, draft recovery/publish/archive/migrations/media packaging nghiệm thu. Không ghi tất cả teacher tools là NOT_IMPLEMENTED.
- Collector: thật sự đã implement sink/lock/dedupe/dispatcher và sửa một số lỗ hổng; Google deployment/CORS/redirect/receipt readback, actual formula execution, simultaneous cold-sheet writes, anonymous resource/rate controls/retention/export/delete/backup **NOT_RUN / chưa nghiệm thu**. Không dùng mock thay integration.
- B1-AC07/08/T16/T17: npm gate đỏ F05; oracle negative controls không phải mutation SUT. Không full secret-history/SAST/advisory/license audit, axe/Lighthouse/performance, browser screenshots/traces, rollback/milestone owner acceptance. Không nghiên cứu web/stack mới hoặc cài công cụ trong LC31.

## Lộ trình còn thiếu theo ưu tiên

1. **P0 / glue:** F01 canonical collector/schema/payload-conflict; F02 immutable snapshot + boot pointer; F03 receipt validator mọi adoption path; F05 sửa regression setup đúng contract. Giữ các ca đã PASS ở bảng retest.
2. **P1 / glue:** F04 durable bounded outbox/backoff/in-flight control; xác minh CORS/redirect/write/readback Google và retry lost-response trên tài khoản/endpoint thử được duyệt; chọn trust mode, anti-spam/resource/retention/export/delete/backup.
3. **P1 / glue:** browser E2E desktop/mobile hai contexts/tabs, CUSTOM refresh/restart/back-forward, cold-start offline, timer background/quota, pending receipt, tải/mở report; IME/keyboard/a11y/math/media; release deadline và maxAttempts trong giới hạn no-login.
4. **P1 / glue:** taxonomy đầy đủ, stable question/exam versions, publish/archive, builder draft recovery, media export/import/backup.
5. **P2 / glue:** **DOCX/PDF importer chưa implement**: file→IR giữ paragraph/table/image/OMML/math/provenance/confidence→preview/sửa→confirm; PDF text/scan/OCR có cảnh báo; không đoán key; corpus nhiều cột/file lỗi/resource limits.
6. **P2 / glue + src/domain khi rule mới:** mẫu THPT môn/năm/văn bản đã kiểm chứng, tách custom-v1; policy versions/migrations; CI browser/security/license/performance/a11y, changelog/rollback và owner acceptance. Class/Assignment giai đoạn sau.

## NEED_DECISION

Không thấy mâu thuẫn scoring mới giữa hai contract. Các phương án dưới chưa được coi là duyệt; không tự chốt.

| Mục | 2–3 phương án cho owner |
| --- | --- |
| Collector/trust | A self-reported practice có nhãn rõ; B server grading theo immutable key/snapshot owner quản lý; C hoãn collector public tới khi B được duyệt/kiểm. Canonical schema/consistency vẫn cần với A/B. |
| Storage/hosting/report | A duyệt local practice + HTML; B transactional storage + Apps Script/serverless đã kiểm; C bổ sung PDF sau đánh giá. |
| Grammar III | A giữ charset/length tạm; B grammar hẹp với inputPolicyId mới; C theo preset/version được duyệt. |
| Display rounding | A fraction exact; B digits/mode rõ, giữ rational gốc; C fraction kèm decimal xấp xỉ có nhãn. |
| Limits/grouping | A duyệt 1000 câu, grouping I→II→III và bounds cụ thể; B đổi có version/regression/migration. |
| Mẫu chuẩn | A milestone hiện tại chỉ custom-v1; B chọn môn/năm/văn bản trước triển khai preset. |

assumptions: NONE mới. recommended_action: giao glue sửa 5 findings, cập nhật regression và xác minh browser/Google trước nghiệm thu; owner trả lời policy tương ứng. tools_research: không giao nghiên cứu tool mới. privacy_notes: chỉ dữ liệu thử/evidence kỹ thuật, không credentials/nội dung hồ sơ riêng.

## Tái lập reviewer probes

Từ repo root, pipe riêng từng block JS vào node --input-type=module. Mọi storage/Sheet writes ở RAM, không gửi Google. Web helper LC19 chỉ cung cấp VM/DOM; prep bổ sung length/key của Storage cho đúng code mới. Không dùng nó thay browser E2E.

### Web — expected exit1, 11 pass / 3 fail

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8').match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0];
const probe=String.raw`
let pass=0,fail=0;
async function check(id,fn){try{await fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
function prep(store=new Map()){const p=page(store);Object.defineProperty(p.c.localStorage,'length',{get:()=>store.size});p.c.localStorage.key=i=>[...store.keys()][i]??null;p.run('renderExamPane=()=>{};renderPalette=()=>{};renderBuilderForm=()=>{}');return p}
await check('initial independent contexts unique',()=>{const a=prep(),b=prep();assert.notEqual(a.run('studentState.attemptId'),b.run('studentState.attemptId'))});
await check('custom loader fixed-clock clients unique',()=>{const a=prep(),b=prep();for(const p of [a,b]){p.c.custom=exam();p.run('Date.now=()=>1700000000000;loadExamVersion(custom)')}assert.notEqual(a.run('studentState.attemptId'),b.run('studentState.attemptId'))});
await check('custom boot restores exam and raw',async()=>{const store=new Map(),a=prep(store);a.c.custom=exam('v1','CUSTOM');a.run('loadExamVersion(custom);studentState.responses.q="1";saveLocalState()');const b=prep(store);b.run('fetch=async()=>({ok:true,json:async()=>EMBEDDED_SAMPLE_EXAM})');await b.run('initExam()');assert.equal(b.run('currentExam.examId'),'CUSTOM');assert.equal(b.run('studentState.responses.q'),'1')});
await check('same custom reimport resumes draft',()=>{const store=new Map(),a=prep(store);a.c.custom=exam();a.run('loadExamVersion(custom);studentState.responses.q="1";saveLocalState()');const b=prep(store);b.c.custom=exam();b.run('loadExamVersion(custom)');assert.equal(b.run('studentState.responses.q'),'1');assert.equal(b.run('studentState.attemptId'),a.run('studentState.attemptId'))});
await check('same custom final resumes submitted',()=>{const store=new Map(),a=prep(store);a.c.custom=exam();a.run('loadExamVersion(custom);studentState.responses.q="1";submitExam()');console.log('finalValid='+a.run('isValidScoreResult(studentState.scoreResult,currentExam,studentState)'));const b=prep(store);b.c.custom=exam();b.run('loadExamVersion(custom)');console.log('restoreSubmitted='+b.run('studentState.submitted'));assert.equal(b.run('studentState.submitted'),true)});
await check('restart retains old final and gets new ID',async()=>{const store=new Map(),a=prep(store);a.run('saveLocalState();submitExam()');const old=a.run('studentState.attemptId'),fk=a.run('getFinalStorageKey(currentExam,studentState)');a.run('restartExam()');const b=prep(store);b.run('fetch=async()=>({ok:true,json:async()=>EMBEDDED_SAMPLE_EXAM})');await b.run('initExam()');console.log('restart old='+old+' new='+b.run('studentState.attemptId')+' archive='+store.has(fk));assert.notEqual(b.run('studentState.attemptId'),old);assert.ok(store.has(fk))});
await check('wrong receipt rejected live',async()=>{const p=prep();setExam(p,exam());p.run('studentState.scoreResult=scoreAttemptLocally();studentState.submitted=true;window.CUNATA_COLLECTOR_URL="https://collector.invalid";fetch=async()=>({ok:true,json:async()=>({success:true,attempt_id:"OTHER",status:"BOGUS"})})');await p.run('dispatchToServerCollector()');assert.equal(p.run('studentState.serverConfirmed'),false)});
await check('late matching A receipt does not finalize B',async()=>{const p=prep();setExam(p,exam());p.run('studentState.scoreResult=scoreAttemptLocally();studentState.submitted=true;window.CUNATA_COLLECTOR_URL="https://collector.invalid";fetch=()=>new Promise(r=>globalThis.resolveFetch=r)');const id=p.run('studentState.attemptId'),pending=p.run('dispatchToServerCollector()');p.c.next=exam('v1','NEXT');p.run('loadExamVersion(next)');const key=p.run('getFinalStorageKey(currentExam,studentState)');p.c.resolveFetch({ok:true,json:async()=>({success:true,attempt_id:id,status:'NEWLY_RECORDED'})});await pending;console.log('B submitted='+p.run('studentState.submitted')+' confirmed='+p.run('studentState.serverConfirmed'));assert.equal(p.run('studentState.serverConfirmed'),false);assert.equal(p.store.has(key),false)});
await check('pending final retries after actual sample boot',async()=>{const store=new Map(),a=prep(store);a.run('submitExam()');const b=prep(store);b.run('window.CUNATA_COLLECTOR_URL="https://collector.invalid";posts=0;fetch=async(url,opts)=>{if(opts){posts++;return {ok:true,json:async()=>({success:true,attempt_id:studentState.attemptId,status:"NEWLY_RECORDED"})}}return {ok:true,json:async()=>EMBEDDED_SAMPLE_EXAM}}');await b.run('initExam()');b.run('submitExam()');await Promise.resolve();console.log('retry posts='+b.run('posts'));assert.ok(b.run('posts')>0)});
await check('late receipt retained on A final',async()=>{const p=prep();p.run('window.CUNATA_COLLECTOR_URL="https://collector.invalid";fetch=()=>new Promise(r=>globalThis.resolveFetch=r);saveLocalState();submitExam()');const id=p.run('studentState.attemptId'),fk=p.run('getFinalStorageKey(currentExam,studentState)');p.c.next=exam('v1','NEXT');p.run('loadExamVersion(next)');p.c.resolveFetch({ok:true,json:async()=>({success:true,attempt_id:id,status:'NEWLY_RECORDED'})});await new Promise(r=>setTimeout(r,0));assert.equal(JSON.parse(p.store.get(fk)).serverConfirmed,true);assert.equal(p.run('studentState.serverConfirmed'),false)});
await check('submit cannot trust forged persisted confirmation',()=>{const p=prep();p.run('saveLocalState();submitExam()');const fk=p.run('getFinalStorageKey(currentExam,studentState)'),k=p.key();const obj=JSON.parse(p.store.get(fk));obj.serverConfirmed=true;obj.serverReceipt={success:true,attempt_id:'FOREIGN',status:'BOGUS'};p.store.set(fk,JSON.stringify(obj));p.store.set(k,JSON.stringify(obj));p.run('studentState.serverConfirmed=false;studentState.serverReceipt=null;submitExam()');assert.equal(p.run('studentState.serverConfirmed'),false)});
await check('network failure schedules bounded retry',async()=>{const p=prep();p.run('studentState.scoreResult=scoreAttemptLocally();studentState.submitted=true;window.CUNATA_COLLECTOR_URL="https://collector.invalid";retryTimers=[];setTimeout=(fn,ms)=>{retryTimers.push(ms);return 1};fetch=async()=>{throw Error("offline")}');await p.run('dispatchToServerCollector()');assert.ok(p.run('retryTimers.length')>0,'no retry timer/backoff scheduled after failed POST')});
const api=await import(new URL('src/domain/index.ts','file:///'+process.cwd().replaceAll('\\','/')+'/'));
const fixtures=fs.readdirSync('test/oracle/fixtures').filter(n=>n.endsWith('.json')).flatMap(n=>JSON.parse(fs.readFileSync('test/oracle/fixtures/'+n,'utf8')).cases);
await check('domain 1632 oracle fixtures and DTO',()=>{assert.equal(fixtures.length,1632);for(const f of fixtures){const r=api.scoreAttempt(f.exam,f.attempt);assert.equal(api.toFractionString(r.total),f.expected.total,f.id);assert.equal(api.toFractionString(r.maxTotal),f.expected.maxTotal,f.id);for(const s of ['I','II','III'])for(const k of ['score','max'])assert.equal(api.toFractionString(r.sections[s][k]),f.expected.sections[s][k],f.id);assert.deepEqual(api.scoreResultFromDTO(JSON.parse(JSON.stringify(api.scoreResultToDTO(r)))),r,f.id)}});
await check('web 1632 oracle exact sections totals',()=>{const p=prep();for(const f of fixtures){setExam(p,f.exam);p.c.responses=Object.fromEntries(f.attempt.responses.map(r=>[r.questionVersionId,r.kind==='I'?r.selectedOptionId:r.kind==='III'?r.raw:Object.fromEntries(r.answers.map(a=>[a.statementId,a.value]))]));p.run('studentState.responses=responses');const r=p.run('scoreAttemptLocally()');assert.equal(r.totalFraction,f.expected.total,f.id);assert.equal(r.maxTotalFraction,f.expected.maxTotal,f.id);for(const s of ['I','II','III'])for(const k of ['score','max'])assert.equal(r[k+s+'Fraction'],f.expected.sections[s][k],f.id)}});
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probe).toString('base64'));

```

### Collector — expected exit1, 3 pass / 5 fail

```js
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const rows=[];const sheet={getLastRow:()=>rows.length,appendRow:r=>rows.push(r),getRange:(start,col,count)=>({getValues:()=>rows.slice(start-1,start-1+count).map(r=>[r[col-1]])})};
const c=vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getActiveSheet:()=>sheet}),flush(){}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:body=>({setMimeType:()=>({body})})}});
vm.runInContext(fs.readFileSync('apps-script/Code.js','utf8'),c);
const post=d=>JSON.parse(c.doPost({postData:{contents:JSON.stringify(d)}}).body);
let pass=0,fail=0;function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
check('all string sinks formula prefixed',()=>{c.data={attempt_id:'=1+1',exam_id:'=2+2',exam_version_id:'=3+3',candidate_display:'=4+4',started_at:'=5+5',submitted_at:'=6+6',policy_version:'=7+7'};const row=vm.runInContext('formatRecordRow(data)',c);for(const i of [0,1,2,3,4,5,15])assert.ok(row[i].startsWith("'="))});
check('999/10 rejected',()=>assert.equal(post({attempt_id:'outofrange',total:'999',maxTotal:'10'}).success,false));
check('missing score and exam identity rejected',()=>{const r=post({attempt_id:'missing'});console.log('missing='+JSON.stringify(r));assert.equal(r.success,false)});
check('partial sections rejected',()=>{const r=post({attempt_id:'partial',exam_id:'E',exam_version_id:'V',total:'1',maxTotal:'10',sections:{I:{score:'999',max:'1'}}});console.log('partial='+JSON.stringify(r));assert.equal(r.success,false)});
check('conflicting score aliases rejected',()=>{const r=post({attempt_id:'alias',exam_id:'E',exam_version_id:'V',total:'1',maxTotal:'10',total_score:'999',max_total:'1',sections:{I:{score:'1',max:'10'},II:{score:'0',max:'0'},III:{score:'0',max:'0'}}});console.log('alias receipt='+JSON.stringify(r)+' stored='+JSON.stringify(rows.at(-1).slice(7,15)));assert.equal(r.success,false)});
check('valid rational full sections accepted',()=>assert.equal(post({attempt_id:'valid',exam_id:'E',exam_version_id:'V',total:'10/3',maxTotal:'10',sections:{I:{score:'0',max:'0'},II:{score:'0',max:'0'},III:{score:'10/3',max:'10'}}}).success,true));
check('same ID different payload conflicts',()=>{const a={attempt_id:'conflict',total:'1',maxTotal:'10'};post(a);const r=post({...a,total:'9'});console.log('conflict='+JSON.stringify(r));assert.equal(r.success,false)});
check('numeric ID rejected',()=>assert.equal(post({attempt_id:123,total:'0',maxTotal:'10'}).success,false));
console.log(JSON.stringify({tests:pass+fail,pass,fail}));process.exitCode=fail?1:0;
```

