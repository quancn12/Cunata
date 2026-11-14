# LC11 — Kiểm định toàn bộ sản phẩm, vòng 11

- review_id/task_id/worker_id: LC11; reviewer: Codex.
- verified_at: 2026-11-14, Asia/Bangkok, khoảng 04:29–04:37.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch: `main`; review HEAD cộng working tree chưa commit.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6 (B1-AC01…08, B1-T01…17).
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo, không phải nghiệm thu sản phẩm.
- findings_summary: **2 BLOCKER, 1 CRITICAL, 2 MAJOR, 1 MINOR**, OPEN / VERIFIED.

## Snapshot và thay đổi từ LC10

Đã đọc toàn bộ hợp đồng nghiệp vụ và kỹ thuật trước khi review, LC10, bảng hash LC09 và READINESS §6. Không tìm thấy AGENTS.md trong cây workspace hoặc D:\AGENTS.md. Không đọc prompt riêng của worker khác. Chỉ tạo báo cáo này; không sửa source/test/config, không cài dependency, commit hoặc deploy. Probe chạy qua stdin; không tạo file test/log ngoài scope.

Git vẫn chỉ có một commit baseline `2ee84e3`; không có commit mới để diff từ LC10. `git diff --stat` vẫn có ops/m1/tasks.json, ops/run_tasks.py và package.json, 346 insertions/24 deletions. Source, tests, frontend, lockfile và phần lớn ops còn untracked; git diff không bao quát các file đó. Không quy thay đổi cho một tác giả khi không có bằng chứng.

Đã đọc lại toàn bộ 10 module src/domain, index.html/script inline, build script, configs/manifests, các assertions mới scoreAttempt/serialize và test e2e; kiểm tra tests nền, acceptance/sample, oracle, assets và CSS ở các vùng liên quan. Đã lần theo web → scorer riêng → localStorage → report. Các công cụ ops/dashboard là điều phối, đã kiểm kê và xem diff tổng quan; chưa kiểm toán sâu mọi script ops như một sản phẩm riêng.

So với LC10: thêm test/domain/scoreAttempt.test.ts và serialize.test.ts; suite tăng từ 152 lên **172 tests**. Fixture integration nay thực sự gọi scorer trong suite thường xuyên. `test/e2e/demoFlow.test.ts` đã thay statSync bằng readFileSync nên lỗi TS2339 cũ được sửa, nhưng test chấm điểm mới tạo **5 lỗi typecheck khác**. Không đóng LC10-F05 chỉ vì lỗi cũ biến mất. Tất cả 10 module domain và index.html có hash khớp snapshot LC10 (sáu module nền được LC10 đối chiếu LC09); vì vậy F01–F04/F06 chưa có sửa implementation. Những kết luận lỗi bên dưới còn được tái hiện lại trong vòng này.

| File | SHA256 LC11 |
| --- | --- |
| src/domain/examMax.ts | BE74CEAC6916536C79742F4B7858549749B86BEAE94BDCF7E41634B8E9685BE1 |
| src/domain/scoreAttempt.ts | E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE |
| src/domain/serialize.ts | 20281BC0EBE77F5664FAD60B95992499C7547E0A0613DBF05B4E7E967122D09C |
| src/domain/index.ts | 737A04D96CE55E7675070C37422A1E341AFC13690D5EC04B874539CC512C0B07 |
| index.html | 4A81BF50725B4AB913ECF0D296E905B352686D9046491381FB5E940CC7F0EAF1 |
| test/domain/scoreAttempt.test.ts | 124B46C8943EB72491B9C7EB03411A7CEBE290325E98285EB9F54E22CEE3A0F3 |
| test/domain/serialize.test.ts | EBBDE826093417A52BE274FD12A66D71B3AA88DCDB932B0DB749CE829B2B3E84 |
| test/e2e/demoFlow.test.ts | 64A7AD72C702D72E03031D40AC58265EC7E012EC123A5184F2B97DDE4608B523 |
| test/domain/ambient-node.d.ts | E9799D09658F7B90B081DB4710C287BBC00A2963529AC7772FC200317CB683E0 |

## Findings

### LC11-F01 — BLOCKER — Web bỏ qua engine, hardcode trọng số và điểm tối đa

- affected_files: `index.html:813–919`, đặc biệt `883`, `907–915`; caller `928`; nhãn điểm `533`, `546`.
- **VÙNG chịu trách nhiệm: glue**. Liên hệ: LC10-F01, vẫn OPEN.
- evidence: `scoreAttemptLocally()` cộng number và luôn cho III=3.5/câu, maxima I/II/III=1/2/7. Script web không import hoặc gọi public scoring API. Fetch tại 408–413 chỉ kiểm questions array, không validate schema/key/rule version.
- reproduction_steps: dùng VM harness bên dưới, gán đề chỉ một câu III key `1,5`, trả lời `1,5`, gọi `scoreAttemptLocally()`.
- expected: custom-v1 chỉ một III đúng → **10/10**, I và II max0; mọi cấu hình lấy maxima từ đề đã validate, rational chính xác.
- actual: total=3.5, maxTotal=10, maxI=1, maxII=2, maxIII=7. Kết quả chỉ tình cờ phù hợp cấu hình sample 4I/2II/2III.
- impact: chấm sai điểm khi số câu thay đổi, không hỗ trợ max5/15/16, tách rời engine đã được kiểm. Trường hợp đổi cấu hình là probe, không khẳng định UI builder đã tồn tại.
- minimal_fix: tích hợp public engine vào web bằng build/adapter phù hợp stack được duyệt; chuyển state sang AttemptResponses có IDs, validate đề; giữ rational/DTO tới render. Xóa scorer và nhãn điểm cố định; không copy engine thành một scorer number khác.
- regression_test: web submit/report chạy qua API sản phẩm với golden max5/10/15/16, chỉ III và N3=3/7, từng phần, blank/mixed/full; lỗi đề phải được từ chối; so exact DTO với oracle trước kiểm display.

### LC11-F02 — BLOCKER — Web sửa raw đáp án, chấm chuỗi khác thành đúng

- affected_files: `index.html:663`, `677–684`, `880–900`.
- **VÙNG chịu trách nhiệm: glue**. Liên hệ: LC10-F02, vẫn OPEN.
- evidence: input handler xóa ký tự ngoài tập rồi slice4; scorer trim trước khi so key. Probe raw ` 1,5` được **3.5 điểm**, trong khi engine đúng trả invalid/0. Handler thật biến `1.5` thành `15`.
- reproduction_steps: gọi scorer với response q08=` 1,5`; riêng probe input handler với event.target.value=`1.5`. Hai assertions mong đợi 0 điểm và giữ raw đều fail.
- expected: không trim/normalize/cắt âm thầm; dữ liệu sai charset/length được báo rõ, giữ raw theo policy; exact equality chỉ trên chuỗi nguyên gốc.
- actual: whitespace bị bỏ để nhận điểm; ký tự lạ bị xóa và >4 bị cắt; scorer không cung cấp inputIssues/invalid như engine. Re-render toàn pane trên mỗi input cũng cần browser kiểm focus/cursor/composition.
- impact: vi phạm invariant CRITICAL của phần III, mất câu trả lời nguyên gốc; `1.5` có thể thành đáp án đúng `15` của câu khác.
- minimal_fix: bỏ replace/slice/trim trong đường chấm và silent rewriting; validate qua checkShortAnswer, thông báo lỗi, giữ raw; xử lý composition và cập nhật UI không phá input đang nhập. Chính sách grammar bổ sung còn chờ owner, không cần quyết định mới để bỏ normalization trái contract.
- regression_test: `1,5`/`1,50`/`1.5`, space/NBSP/newline, U+2212, fullwidth, `-0,5`, paste>4; kiểm giá trị lưu/restore/report, lỗi invalid=0, caret/focus và IME trên browser thật.

### LC11-F03 — CRITICAL — Tab cũ ghi đè bài đã nộp trong cùng storage key

- affected_files: `index.html:352–360`, `438–456`, `485–486`, `924–930`.
- **VÙNG chịu trách nhiệm: glue**. Liên hệ: LC10-F03, vẫn OPEN.
- evidence: hai VM context dùng cùng Map storage. A submit lưu submitted=true; B còn state ban đầu gọi saveLocalState → durable submitted=false, scoreResult=null. Key duy nhất không có attemptId, examVersionId, revision hoặc presentation snapshot; load Object.assign state cũ vào đề hiện tại.
- reproduction_steps: mở hai tab trước khi nộp; A nộp; B sửa câu hoặc đến tick save; reload. VM tái hiện bằng A.submitExam(), B.saveLocalState(), đọc `cunata_exam_attempt_v1`.
- expected: final không bị tab stale đảo về editable; mỗi attempt/version/order có snapshot riêng; phát hiện conflict và giữ final bền vững.
- actual: state cũ thay toàn bộ record đã nộp. VM chứng minh logic ghi đè, chưa là kiểm thử concurrency native browser.
- impact: mất kết quả đã nộp, đáp án cũ có thể áp lên phiên bản đề mới. Đây là lỗi hai tab bình thường, không cần attacker/backend.
- minimal_fix: per-attempt snapshot và revision, bảo vệ final bằng transaction/locking phù hợp storage được chọn; tab stale chuyển read-only/conflict/reload. Không coi read-then-write không nguyên tử là giải pháp concurrency hoàn chỉnh.
- regression_test: hai tab edit/manual/autosubmit cạnh tranh, stale timer, reload sau final, version đề đổi, migration, quota và outbox nếu có; final và kết quả phải sống sót.

### LC11-F04 — MAJOR — Timer đếm callback thay vì deadline đã lưu

- affected_files: `index.html:356`, `450–456`, `466–488`.
- **VÙNG chịu trách nhiệm: glue**. Liên hệ: LC10-F04, vẫn OPEN.
- evidence: chỉ giảm remainingSeconds mỗi callback. Probe tăng Date.now một giờ rồi giao một callback: remaining=2999, submitted=false; save ở3000 rồi restore với clock tương lai vẫn3000, false.
- reproduction_steps: đóng trang lâu hơn50phút rồi mở lại; hoặc suspend/background khiến interval bị trì hoãn. Harness kiểm cả elapsed và restore.
- expected: persist startedAt/deadline/duration, tính thời gian còn từ deadline-now và nộp ngay khi restore/resume đã quá hạn.
- actual: thời gian đóng trang không tính; interval throttling kéo dài bài thi.
- impact: timer/autosubmit không thi hành giới hạn thời gian. Không nhầm lỗi elapsed-time thường này với giới hạn chống chỉnh đồng hồ của MVP offline/no-login.
- minimal_fix: deadline gắn attempt, kiểm lúc load/visibility/resume và trước submit; final transition dùng chung, idempotent; nêu giới hạn clock tampering đúng contract.
- regression_test: close/reopen quá hạn, sleep/background/offline, clock shift, manual và timeout cùng lúc, không tạo hai final.

### LC11-F05 — MAJOR — Typecheck vẫn hỏng do test scoring mới thiếu typings

- affected_files: `test/domain/scoreAttempt.test.ts:3`, `35–36`, `422`, `429`; `test/domain/ambient-node.d.ts` declarations node:fs, node:assert/strict và thiếu process.
- **VÙNG chịu trách nhiệm: glue**. Liên hệ: LC10-F05, lỗi statSync cũ đã sửa nhưng gate chưa phục hồi.
- evidence/reproduction_steps: chạy `npx --no-install tsc -p tsconfig.json` và config web. Cả hai exit1, cùng **5 diagnostics**: TS2305 thiếu readdirSync; TS2591 thiếu process; TS7006 tham số f, err, err implicit any.
- expected: source/test trong configs hiện hành typecheck exit0 bằng dependency đã có.
- actual: npm test172/172 PASS nhưng typecheck FAIL. Không phải tsc chưa cài: TypeScript7.0.2 có sẵn và đã chạy thật.
- impact: gate kiểm tra compile-time không đạt; thiếu declaration khiến API/callback trong test không được kiểm đúng.
- minimal_fix: khai báo tối thiểu đúng API Node đang dùng, process.cwd và callback predicate của assert.throws, hoặc điều chỉnh tests dùng API hiện có/annotate unknown phù hợp; không thêm dependency, exclude tests hay nới strict để giấu lỗi.
- regression_test: cả hai tsc exit0, npm test và build verification giữ pass.

### LC11-F06 — MINOR — DTO malformed ném TypeError thay vì SyntaxError

- affected_files: `src/domain/serialize.ts:88–93`, tương tự String(issue) trong nhánh inputIssues.
- **VÙNG chịu trách nhiệm: src/domain**. Liên hệ: LC10-F06, vẫn OPEN.
- evidence/reproduction_steps: `scoreResultFromDTO({attemptId:'a',examVersionId:'e',ruleSetId:{toString:null}})` ném TypeError `Cannot convert object to primitive value` tại89. Payload này biểu diễn được bằng JSON, không chỉ object prototype đặc biệt.
- expected: input unknown sai dạng → SyntaxError theo M1 §4.8.
- actual: String(rec.ruleSetId) ném trước khi tạo SyntaxError.
- impact: caller chỉ xử lý SyntaxError có thể bỏ sót lỗi dữ liệu. Không có bằng chứng đây là sai điểm hoặc exploit một endpoint.
- minimal_fix: thông báo lỗi cố định hoặc formatter an toàn, boundary chuyển lỗi đọc/coercion sang SyntaxError; không để String trên input unknown gây exception ngoài hợp đồng.
- regression_test: JSON `{toString:null}`, null-prototype, throwing coercion/getter/proxy trên các trường lỗi → SyntaxError; nominal roundtrip, invalid fractions/JSON numbers vẫn được kiểm.

## checks_run

Environment: Windows/PowerShell, D:\Cunata; Node v24.14.0; npm11.9.0; TypeScript7.0.2; Python3.11.0. Output/log nằm trong transcript LC11, không tạo artifacts ngoài scope. Các lệnh node stdin kết thúc bằng `exit $LASTEXITCODE` để giữ exit code thật.

| Command/check | Exit | Kết quả thực / phạm vi |
| --- | ---: | --- |
| git status/log/rev-parse/branch/diff; inventory và SHA256 | 0 cho git/hash | Baseline/main + working tree; không có commit mới. Search AGENTS không có hit; không phải lỗi sản phẩm. |
| `npm test` | **0** | **172pass/0fail**,34suites,0skip/cancel/todo; duration_ms323.4094. Có test scorer dùng1632fixture và DTO mới. |
| `npx --no-install tsc -p tsconfig.json` | **1** | 5 diagnostics F05, thời gian tool khoảng1.50s. |
| `npx --no-install tsc -p tsconfig.web.json` | **1** | Cùng5 diagnostics, khoảng1.33s. Không kiểm inline JS HTML hoặc checkJs build script. |
| `node scripts/build.js` | **0** | 4 assets tồn tại; sample schema8câu; stylesheet link PASS, khoảng0.13s. Đây là asset/schema verification, không compile/bundle/browser build. package chưa có npm build script. |
| `python -B test/oracle/oracle.py --check` | **0** | 11pass/0fail/0skip;1632cases,5files;5849maxima configs;9negative controls;seed20261114;duration_s1.0612. Đây là oracle self-check, tách với SUT. |
| Stdin `node --input-type=module`, independent API + web/DTO probes | **1** | 9tests,1pass/8fail, duration_ms157.8063. Public API1632cases PASS;7 failures thật F01–F04/F06. Một failure là hypothesis/probe sai về terminal LF, bị loại khỏi findings và kiểm lại bên dưới. |
| Stdin corrected web/DTO probes + LF negative control | **1** | **8tests,1pass/7fail**,duration_ms22.0046,0skip/cancel/todo.7 assertions fail đúng các repro F01–F04/F06; LF control PASS. |
| Browser/E2E thực, screenshot/trace, mobile, IME, keyboard/AT/axe/Lighthouse | — | **NOT_RUN** trong LC11; không dùng Node VM hoặc tên file e2e để thay browser evidence. |
| Lint, full SAST/secrets/history/dependency/license audit | — | **NOT_RUN**; chưa có lint script; chưa chạy chuyên biệt full audit. Không kết luận không có lỗ hổng từ tìm kiếm đơn giản. |
| Collector/Google/CORS/readback; importer runtime | — | **NOT_RUN / NOT_IMPLEMENTED** trong product inventory hiện có; không có endpoint/corpus triển khai để chứng nhận. |

Independent API probe import từ src/domain/index.ts, chạy cả1632fixture, so total/max và từng section score/max với expected; JSON DTO roundtrip deepEqual; score bounds và tổng points; input JSON không đổi. Mỗi fixture còn tạo presentation với seed `LC11-20261114`, validate order, áp questionOrder và optionIds riêng từng câu vào exam, đảo responses/statement answers rồi chấm lại; total/max giữ nguyên. Đó là một test runner chứa1632cases, không cộng1632 vào count172. Các kiểm tra semantic/per-question khác chưa vét cạn mọi adversarial input.

Probe terminal LF ban đầu giả định parser chấp nhận `1\n`; thực tế parser đã ném SyntaxError trước assertion. Đây là lỗi thiết kế probe, **không phải bug sản phẩm**. Probe sửa lại assert.throws với cả `1\n` và `1/2\n` PASS; không có finding F07.

## Harness tái hiện tối thiểu

Chạy JS qua PowerShell here-string `@' ... '@ | node --input-type=module`, sau đó `exit $LASTEXITCODE`. Dùng riêng từng repro hoặc bọc bằng node:test để tiếp tục sau assertion fail. VM chỉ kiểm logic script thật với DOM/storage/timer stubs, không là browser. showReportView bị stub để lỗi DOM thiếu không làm sai bằng chứng submit.

```js
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const script = [...fs.readFileSync('index.html','utf8')
  .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).join('\n');
function page(store=new Map()) {
  const nodes=new Map();
  const c=vm.createContext({console:{warn(){}},document:{getElementById(id){
    if(!nodes.has(id)) nodes.set(id,{value:'LC11',style:{},
      classList:{add(){},remove(){}},addEventListener(){}});
    return nodes.get(id);
  }},window:{addEventListener(){},scrollTo(){}},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  setInterval(fn){c.tick=fn;return 1},clearInterval(){},alert(){}});
  vm.runInContext(script,c);vm.runInContext('showReportView=()=>{}',c);
  return {c,run:s=>vm.runInContext(s,c)};
}
```

```js
// F01: actual3.5, expected10
const p=page();
p.run("currentExam={questions:[{kind:'III',questionVersionId:'q',answerKey:'1,5'}]};studentState.responses={q:'1,5'}");
assert.equal(p.run('scoreAttemptLocally().total'),10);
```

```js
// F02 scorer: actual3.5, expected0
const p=page();
p.run("studentState.responses={'q08-iii-ung-dung-thuc-te':' 1,5'}");
assert.equal(p.run("scoreAttemptLocally().questionResults.find(q=>q.questionVersionId==='q08-iii-ung-dung-thuc-te').points"),0);
```

```js
// F02 handler: actual15, expected raw1.5
const p=page();
const handler=script.match(/inputEl.addEventListener\('input', (\(e\) => \{[\s\S]*?)\n          \}\);/)[1]+'\n}';
p.c.e={target:{value:'1.5'}};p.c.q={questionVersionId:'q'};
p.run('renderExamPane=()=>{};renderPalette=()=>{}');p.run('('+handler+')(e)');
assert.equal(p.c.e.target.value,'1.5');
```

```js
// F03: final true bị ghi lại false
const store=new Map(),a=page(store),b=page(store);
a.run('submitExam()');
assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
b.run('saveLocalState()');
assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
```

```js
// F04 elapsed: actualfalse/2999
const p=page();p.run('Date.now=()=>0;startTimer();Date.now=()=>3600000');
p.c.tick();assert.equal(p.run('studentState.submitted'),true);
```

```js
// F04 restore: actualfalse/3000
const store=new Map(),a=page(store);a.run('saveLocalState()');
const b=page(store);b.run('Date.now=()=>4102444800000;loadLocalState();startTimer()');
assert.equal(b.run('studentState.submitted'),true);
```

```js
// F06, chạy riêng không cần VM: actual TypeError
import {scoreResultFromDTO} from './src/domain/index.ts';
import assert from 'node:assert/strict';
assert.throws(()=>scoreResultFromDTO({attemptId:'a',examVersionId:'e',
  ruleSetId:{toString:null}}),SyntaxError);
```

## Traceability, regression ledger và coverage_gaps

| Hạng mục | LC11 evidence / giới hạn |
| --- | --- |
| LC10-F01…F04 | **OPEN**, unchanged source hash và repro thật lặp lại. Không đóng dựa trên tests xanh. |
| LC10-F05 | StatSync lỗi cũ **RESOLVED**; gate **OPEN** bởi5 lỗi mới trong scoreAttempt tests. |
| LC10-F06 | **OPEN**; JSON-compatible malformed object nay cũng chứng minh lỗi. |
| LC10 gap scorer/DTO tests thiếu | **IMPROVED**: tests nay có, fixture integration1632cases và nominal/malformed DTO cases được chạy trong npm test; chưa cover F06 hoặc đường web. |
| B1-AC01…03, T01…09/T15 | Rational/judges/maxima/scorer unit và independent fixture/permutation/bounds/sums/roundtrip PASS trong phạm vi dữ liệu nêu trên. Web vẫn vi phạm F01/F02. |
| AC04/T11/T13/T14 | Domain IDs/validation/DTO nominal PASS; malformed DTO F06. Chưa complete lifecycle source-edit/new-version/restore isolation, browser snapshot thiếu ở web. |
| AC05/T12 | Shuffle flags/IDs unit PASS; independent engine chấm lại presentation thực cho1632fixtures PASS. Web chưa gọi shuffle hoặc lưu presentation snapshot. Không phải browser refresh-order test. |
| AC06/T10 | Validator tests có malicious getters/errors và các mã lỗi; chưa vét cạn proxies/stateful getters/size/DoS trên toàn API. LIMIT1000 vẫn duyệt tạm, không benchmark UI1000câu. |
| AC07/08/T17 | npm test/asset verification PASS, typechecks FAIL. Chưa mutation SUT, changelog/rollback và owner acceptance;9negative controls oracle không thay mutation candidate. |
| T16 | formatScore tự dùng toFixed2; owner chưa chốt display rounding. Chưa coi display policy được duyệt. |

`test/e2e/demoFlow.test.ts` đọc file, kiểm chuỗi HTML, schema sample và tự tính constants; không mở browser, click/input, timer, storage, fetch, submit/report hoặc gọi scorer web. Các test sample chủ yếu judge/validate, không phải web integration.172tests xanh vì vậy không phủ F01–F04.

Chưa QA render desktop/mobile, Telex/VNI/composition/caret, keyboard/focus/modal/contrast/AT, math/ảnh và print artifact thực. Static code cho thấy options là div role=radio không tabindex/keydown, và input re-render cả pane; cần browser regression khi sửa, không tuyên bố đã kiểm bàn phím/IME. innerHTML nhận text/content/labels và report data mà không escaping rõ; chưa có importer/authoring/untrusted endpoint để chứng minh trust path/exploit, nên không tự gắn một finding XSS đã xác nhận. Sample luyện tập public key không tự động là leak key bí mật; chưa có chế độ kiểm tra cần bảo vệ key.

Chưa offline shell/service worker, fresh offline navigation, quota/private-mode/migrations, honest failed-save badge, native atomicity/multi-tab/2–3 học sinh browser, back/forward, double-submit và clock tampering tests đầy đủ. saveLocalState chỉ cảnh báo console khi lỗi; trạng thái lưu thật cần failure injection. Report dùng window.print, chưa kiểm PDF tải ra và nội dung/offline; thiếu timestamps đầy đủ và snapshot version trong lifecycle web. Chưa collector, receipt/readback/CORS/retry/backoff/trusted grading, bank/builder/importer. Không coi các milestone tương lai chưa làm là lỗi code M1 thuần, nhưng sản phẩm toàn phần chưa DONE.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0 / glue:** nối web→public rational engine, raw validation/report đúng, bỏ constants maxima/trọng số và normalization (F01/F02); regression web thực cho max5/15/16. Khôi phục cả hai typecheck gate (F05); sửa malformed DTO (F06, src/domain).
2. **P0 / M2, glue:** attemptId/examVersionId/presentation snapshot, startedAt/deadline/endedAt, durable revision/final transition và xử lý stale tab (F03/F04). Offline shell/restore/quota/migration, double/manual/autosubmit; trạng thái lưu trung thực; giới hạn chống gian lận no-login.
3. **P1 / M1:** giữ fixture integration và DTO tests mới; bổ sung public API acceptance cố định, unknown/duplicate II/status/invalid III, source-edit/version isolation, full=max/blank0/sums, mutation SUT và malformed DTO adversarial. Reviewer permutation probe cần thành regression trong ownership phù hợp.
4. **P1 / M2:** báo cáo tải offline HTML/PDF theo công nghệ được duyệt; score/max tổng/từng phần, câu trả lời/key/lời giải, timestamps và đề/version; publication policy; kiểm artifact xuất thật.
5. **P2 / M3:** ngân hàng Môn→Lớp→Chương/Chủ đề→Bài→mức độ, builder custom bật/tắt phần, time/shuffle/lượt/policy, reuse/versioning/publish snapshot và export/import/backup; authoring private phù hợp MVP không login.
6. **P2 / M4:** chọn collector/hosting được duyệt, receipt/readback thật; local_saved/queued/sending/server_confirmed/failed, bounded retry/backoff/durable dedupe/lost-response/CORS; trusted grading khi cần và tối thiểu PII/xóa/xuất/sao lưu.
7. **P3 / M5:** DOCX/PDF→IR→preview/edit→confirm→publish; text/bảng/hình/OMML/LaTeX, text-vs-scan/OCR, provenance/confidence/flags; thiếu key phải báo, không đoán; limits/security/error corpus.
8. **P3 / mẫu chuẩn THPT:** registry theo môn/năm/văn bản được kiểm chứng và owner phê duyệt, tách custom-v1; không tự gán sample/custom là mẫu chính thức.
9. **P4 / M6:** browser E2E thật, mobile/IME/a11y/performance/security/privacy, CI/lint/build/rollback/changelog và owner nghiệm thu. Integrity/security được kiểm ngay ở mỗi milestone.

## Quyết định nghiệp vụ còn mở

Không có quyết định thiếu nào chặn review hoặc sửa F01–F06. Không tự chốt những mục sau; khi triển khai phần phụ thuộc, trả **NEED_DECISION** với các phương án:

| Hạng mục | Phương án cho owner |
| --- | --- |
| Grammar III | Giữ charset/length hiện tại; hoặc grammar chặt với policy version và compatibility rõ. |
| Display rounding | Phân số exact; hoặc decimal với digits/mode được duyệt, giữ rational gốc. |
| Giới hạn đề | Duyệt1000 tạm; hoặc limit từ benchmark. |
| Nhóm phần khi shuffle | Duyệt false giữ nguồn/true nhóm I→II→III; hoặc schema bắt nguồn đã nhóm phần. |
| Collector/hosting | Local/private; Apps Script với integration thực; hoặc serverless gateway được duyệt. |
| Báo cáo offline | HTML tải xuống; hoặc PDF với renderer/publication policy được chọn. |
| Mẫu chuẩn | Tiếp tục chỉ custom; hoặc registry môn/năm đã kiểm chứng và duyệt. |

recommended_action: **CHANGES_REQUESTED**; giao worker theo vùng đóng F01–F06, chạy regression web thật và typecheck trước review lại; chưa nghiệm thu/commit/deploy. tools_research: NOT_REQUESTED, không đưa claim upstream mới hay cài công cụ. privacy_notes: chỉ kết quả kỹ thuật, không nội dung hồ sơ riêng, credentials hoặc dữ liệu học sinh.
