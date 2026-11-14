# LC10 — Kiểm định toàn bộ sản phẩm, vòng 10

- review_id/task_id/worker_id: LC10; reviewer: Codex.
- verified_at: 2026-11-14, khoảng 04:16–04:27, Asia/Bangkok.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch: `main`; đối tượng là HEAD cộng working tree chưa commit.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6, B1-AC01…08/B1-T01…17.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo; chưa nghiệm thu sản phẩm/M1.
- findings_summary: **2 BLOCKER, 1 CRITICAL, 2 MAJOR, 1 MINOR**, OPEN / VERIFIED trong snapshot dưới đây.

## Snapshot, diff và phạm vi đã đọc

Đã đọc toàn bộ hai hợp đồng trước khi kiểm tra, LC09 và READINESS §6. Không tìm thấy AGENTS.md trong workspace hoặc D:\AGENTS.md. Không đọc prompt riêng của worker khác. Không cài dependency, không sửa code/test/config, không commit/deploy. Reviewer chỉ tạo báo cáo này; probe chạy stdin, không tạo file test/log/artifact ngoài scope.

Git log vẫn chỉ có baseline `2ee84e3`, không có commit mới từ LC09. `git diff --stat`: ops/m1/tasks.json, ops/run_tasks.py, package.json; 346 insertions/24 deletions. Phần lớn source, tests, frontend và lockfile còn untracked; không thể dùng git diff để xác định đầy đủ thay đổi sản phẩm hoặc tác giả. Working tree dùng chung đã đổi ngay trong review: npm test ban đầu có 128 tests; sau khi thêm examMax/sample/e2e tests có 152 tests. Typecheck ban đầu exit0, lần cuối exit1; **kết quả cuối thay thế PASS ban đầu**, không bỏ qua regression mới.

Đã đọc 10 module src/domain, index.html và script inline, scripts/build.js, manifests/tsconfigs/ambient declarations, sample JSON/SVG, assertions của các tests domain/acceptance/e2e và oracle. Đã kiểm tra đường chạy web→local scorer→localStorage→report; frontend chưa gọi public domain scoring API. Styles/assets được kiểm kê và build kiểm sự tồn tại; chưa QA hình ảnh/browser. Ops/dashboard là công cụ điều phối, chỉ kiểm kê/diff mức tổng quan, chưa kiểm toán sâu mọi script vận hành. Đây là giới hạn review toàn sản phẩm, không tuyên bố toàn workspace đã được xác minh.

Sáu module nền có SHA256 khớp LC09. Bốn module mới và web entry nay tồn tại:

| File | SHA256 tại lần kiểm cuối |
| --- | --- |
| src/domain/examMax.ts | BE74CEAC6916536C79742F4B7858549749B86BEAE94BDCF7E41634B8E9685BE1 |
| src/domain/scoreAttempt.ts | E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE |
| src/domain/serialize.ts | 20281BC0EBE77F5664FAD60B95992499C7547E0A0613DBF05B4E7E967122D09C |
| src/domain/index.ts | 737A04D96CE55E7675070C37422A1E341AFC13690D5EC04B874539CC512C0B07 |
| index.html | 4A81BF50725B4AB913ECF0D296E905B352686D9046491381FB5E940CC7F0EAF1 |
| test/acceptance/sampleExam.test.ts | 0DD1CB60FC70CB1EB2BF327ACF99F4689BABC3B6D0D656BA187F6B8343A7AD82 |

## Findings

### LC10-F01 — BLOCKER — Web chấm bằng số thực và điểm tối đa cố định, bỏ qua engine

- affected_files: `index.html:813–919`, đặc biệt `883`, `907–915`, caller `928`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence: `scoreAttemptLocally` dùng number, cộng scoreI/II/III, hardcode mỗi câu III=3.5 và maxima I/II/III=1/2/7. Không import/call src/domain/index.ts. VM chạy chính script inline với đề chỉ một câu III đúng cho total=3.5, maxTotal=10, maxI=1, maxII=2, maxIII=7.
- reproduction_steps: dùng harness phía dưới; đặt `currentExam={questions:[{kind:'III',questionVersionId:'q',answerKey:'1,5'}]}` và `studentState.responses={q:'1,5'}` rồi gọi `scoreAttemptLocally()`; assert total=10 thất bại với 3.5.
- expected: custom counts được suy ra từ đề đã validate, chấm rational chính xác bằng public engine, chỉ làm tròn khi hiển thị theo chính sách được duyệt. Đề chỉ một III phải đạt 10/10, I và II có max0.
- actual: chỉ khớp cấu hình sample 4I/2II/2III; fetch tại 408–413 chấp nhận mọi object có questions array nhưng scorer không thích ứng và không validate keys/rules. Number arithmetic không đáp ứng exact score invariant.
- impact: sai điểm và max khi cấu hình thay đổi, không hỗ trợ tổng5/15/16 đúng trên đường web; engine được oracle xác nhận nhưng không bảo vệ kết quả học sinh.
- minimal_fix: dùng adapter từ responses web sang AttemptResponses rồi gọi scoreAttempt thực; build/transpile module cho browser theo stack đã duyệt; giữ rational/DTO gốc. Bỏ scorer lặp/hardcoded và validate đề trước hiển thị.
- regression_test: chạy web thực với golden counts, chỉ I/II/III, max5/15/16, III=10/3 và II nhiều 1/10; assert report tổng/từng phần khớp public API, không chỉ kiểm phép tính viết trong test.

### LC10-F02 — BLOCKER — Web âm thầm đổi chuỗi trả lời ngắn và trim khi chấm

- affected_files: `index.html:663`, `676–684`, `880–889`; render toàn pane tại `505–507`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence: chạy input handler thật bằng VM với `e.target.value='1.5'` trả `'15'` do replace/slice. Chạy scorer trên sample với q08 raw `' 1,5'` trả status=full, points=3.5 do trim. Domain cùng raw phải invalid/0. Input handler gọi renderExamPane, xóa/rebuild toàn pane sau từng lần nhập; chưa có composition guard.
- reproduction_steps: harness phía dưới; gọi handler được trích từ script hoặc gán `studentState.responses={'q08-iii-ung-dung-thuc-te':' 1,5'}` rồi gọi scorer. Assert points=0 thất bại với3.5. Dán `1.5`, chuỗi >4 hoặc Unicode không hợp lệ bị xóa/cắt thay vì giữ raw để cảnh báo.
- expected: exact-character equality; không trim/normalize/cắt/sửa dấu âm/dấu thập phân. Input sai được báo rõ, giữ raw và chấm invalid/0; composition/cursor/focus phải được bảo toàn.
- actual: dữ liệu học sinh đã bị biến đổi trước khi lưu/chấm; invalid không có trạng thái riêng trong scorer web. `maxlength=4` cũng cần được kiểm thử paste/Unicode, không thay cho raw validator.
- impact: có thể biến đáp án sai thành đúng hoặc đáp án khác, vi phạm invariant CRITICAL ngay trên sample; nguy cơ cản nhập liên tục do DOM rebuild cần browser xác nhận riêng.
- minimal_fix: bỏ replace/slice/trim khỏi đường đáp án, kiểm bằng checkShortAnswer, hiển thị lỗi và chuyển raw nguyên vẹn tới engine. Cập nhật preview/palette tại chỗ, xử lý compositionstart/end và giữ input node/focus.
- regression_test: paste `1.5`, `1,50`, ` 1,5`, >4, NBSP/zero-width/U+2212/fullwidth digits/emoji; xác nhận raw không đổi và status/score đúng; keyboard/mobile/IME thực, nhập liên tục bốn ký tự và sửa giữa chuỗi không mất focus/cursor.

### LC10-F03 — CRITICAL — Tab cũ ghi đè bài đã nộp, không có định danh/snapshot/revision

- affected_files: `index.html:352–360`, `438–456`, `924–930`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence: tất cả dùng một STORAGE_KEY; studentState thiếu attemptId, examVersionId, presentation snapshot và revision. saveLocalState setItem toàn state không kiểm bản đã finalized; không có storage-event/CAS. VM hai page contexts dùng chung Map: A submit/save tạo submitted=true; B chưa submit save lại khiến record submitted=false, scoreResult=null.
- reproduction_steps: harness shared store phía dưới; A và B mở cùng lúc; A nộp; B chọn đáp án hoặc để timer tới lần save10giây; reload A. Probe gọi trực tiếp submitExam ở A và saveLocalState ở B xác nhận submitted true→false.
- expected: bài đã chốt không bị state cũ ghi đè; mỗi attempt gắn phiên bản đề/câu/rule/order snapshot, lưu revision và final transition có cơ chế nguyên tử/phát hiện xung đột.
- actual: mất trạng thái final/kết quả sau thao tác bình thường ở tab khác; currentExam được fetch mới rồi ghép state cũ không kiểm version.
- impact: mất kết quả đã nộp và trộn dữ liệu cũ với đề mới. Không cần attacker hoặc backend để tái hiện.
- minimal_fix: lưu per-attempt snapshot + revision; transaction bảo vệ final, ví dụ cơ chế storage được duyệt hỗ trợ compare-and-swap/locking. Tab stale phải reload/read-only hoặc báo conflict; không chỉ thêm if trên RAM hoặc read-then-write không nguyên tử.
- regression_test: hai tab edit/submit/autosubmit cạnh tranh, stale timer save, reload sau final; version đề đổi không tái diễn giải bài cũ; quota/migration/final+outbox nếu có phải kiểm riêng.

### LC10-F04 — MAJOR — Timer đếm callback, thời gian đóng trang không được tính

- affected_files: `index.html:356`, `450–456`, `466–488`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence: chỉ lưu remainingSeconds rồi giảm1 mỗi callback; không startedAt/deadline. Probe đặt Date.now tiến1giờ, giao1 callback cho bài50phút: remainingSeconds=2999, submitted=false. Save ở3000 rồi tạo context mới/load/start vẫn3000.
- reproduction_steps: làm bài rồi đóng trang lâu hơn50phút và mở lại; hoặc suspend/background tab làm interval chậm. Corrected VM timer tests phía dưới đều fail assertion submitted=true.
- expected: thời gian còn lại tính từ deadline đã lưu, check khi load/visibility/resume và trước submit; hết hạn tự nộp theo cùng final transition idempotent.
- actual: đóng trang dừng đồng hồ, refresh có thể phục hồi thời gian từ lần save trước; interval throttling kéo dài thời gian thi.
- impact: timer/autosubmit không thực hiện giới hạn giáo viên chọn. Đây là lỗi ordinary elapsed time, độc lập giới hạn không thể chống chỉnh đồng hồ tuyệt đối của no-login/offline.
- minimal_fix: persist startedAt/deadline/duration gắn attempt; tick chỉ hiển thị deadline-now, xử lý expired lúc restore ngay; mô tả giới hạn clock tampering theo contract.
- regression_test: close/reopen sau expiry, background/sleep, offline expiry, clock shift, manual/autosubmit cùng lúc; verify không tạo hai final records.

### LC10-F05 — MAJOR — Typecheck regression do test mới gọi API thiếu declaration

- affected_files: `test/e2e/demoFlow.test.ts:20–22`; `test/domain/ambient-node.d.ts` block declare module node:fs.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: chạy `npx --no-install tsc -p tsconfig.json` và `npx --no-install tsc -p tsconfig.web.json`; cả hai exit1, ba TS2339: Property 'statSync' does not exist on type 'typeof import("node:fs")'. Ban đầu typecheck exit0 trước khi file mới xuất hiện.
- expected: toàn bộ source/test được include typecheck thành công với typings hiện có.
- actual: npm test152/152 xanh nhưng typecheck gate hỏng. Tên E2E không làm các assertions file/chuỗi thành browser tests.
- impact: không đạt validation gate hiện tại; ambient stub không mô tả API Node mà test thật sử dụng.
- minimal_fix: khai báo đúng chữ ký statSync/Stats tối thiểu trong ambient typings theo ownership, hoặc viết kiểm tra dùng API đã có declaration; không thêm dependency hay exclude test chỉ để giấu lỗi.
- regression_test: chạy lại cả hai lệnh tsc, npm test và verification; expected exit0 thực.

### LC10-F06 — MINOR — Malformed unknown DTO thoát TypeError thay vì SyntaxError

- affected_files: `src/domain/serialize.ts:88–93` (String(...) trong thông báo lỗi; tương tự inputIssues tại nhánh III).
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence/reproduction_steps: `scoreResultFromDTO({attemptId:'a',examVersionId:'e',ruleSetId:Object.create(null)})` ném TypeError: Cannot convert object to primitive value. Probe assert.throws(...,SyntaxError) fail. Đây là input unknown của API, không phải JSON payload phổ biến.
- expected: malformed DTO → SyntaxError theo M1 §4.8, không gọi coercion không an toàn trên object lạ.
- actual: String(rec.ruleSetId) ném trước khi tạo SyntaxError.
- impact: caller chỉ bắt SyntaxError có thể bỏ sót validation failure. Không chứng minh sai số điểm hoặc exploit endpoint.
- minimal_fix: thông báo lỗi cố định/typeof hoặc formatter an toàn, xử lý getter/proxy exception tại boundary nếu API nhận arbitrary unknown.
- regression_test: null-prototype objects, throwing toPrimitive/toString/getter/proxy trong các trường lỗi phải từ chối bằng SyntaxError, bên cạnh JSON malformed/number fractions/roundtrip.

## checks_run

Environment: Windows/PowerShell, D:\Cunata; Node v24.14.0; npm11.9.0; TypeScript7.0.2; Python3.11.0. Logs/output nằm trong transcript phiên LC10, không tạo file ngoài scope. Probe stdin dùng `node --input-type=module` và `exit $LASTEXITCODE` để truyền đúng exit code.

| Check/command | Exit | Kết quả thực |
| --- | ---: | --- |
| git status/log/branch/rev-parse/diff; inventory/hashes | 0 | Baseline/main + working tree thay đổi; snapshots ghi trên. rg tìm AGENTS không có hit exit1, không phải lỗi source. |
| `npm test` ban đầu | 0 | 128pass/0fail,29suites; lần chạy có duration_ms192.5275. |
| `npm test` lần cuối | 0 | **152pass/0fail**,31suites; skipped/cancelled/todo0; duration_ms231.477. |
| `npx --no-install tsc -p tsconfig.json` | **1 cuối** | Ban đầu0; cuối3 TS2339 tại demoFlow.test.ts:20–22. |
| `npx --no-install tsc -p tsconfig.web.json` | **1 cuối** | Cùng3 TS2339. Config noEmit; không typecheck script inline HTML hoặc JS build với checkJs. |
| `node scripts/build.js` | 0 | Asset existence, sample schema8câu, stylesheet link PASS; không compile/bundle hay chạy browser. Package chưa có npm build script nên chạy script có thật. |
| `python -B test/oracle/oracle.py --check` | 0 | 11pass/0fail/0skip;1632cases/5files;5849maxima configs;9negative controls;seed20261114;duration_s0.9584. Oracle self-check, không thay SUT tests. |
| Stdin node:test independent probe7 tests | **1** | 1pass/6fail;duration_ms142.9415. PASS public engine differential1632cases.5 failures kỹ thuật: hardcode,trim,input rewrite,stale tab,DTO error. **Một failure timer ban đầu là lỗi harness thiếu document.createElement, không tính làm bằng chứng sản phẩm**; đã thay bằng probe đúng bên dưới. |
| Corrected stdin node:test timer probe2 tests | **1** | 0pass/2fail;duration_ms7.8793. Deadline sau1giờ vẫn2999 và restore vẫn3000; cả hai submitted=false. |
| Browser/E2E thực, mobile, IME, a11y, screenshot/traces, Lighthouse | — | **NOT_RUN**: chưa chạy browser trong vòng này; Node VM/markup tests không thay browser và không xác minh UI hiển thị/focus. Không cài thêm tooling/artifact setup. |
| Lint, full security/dependency/license/history scan, collector/CORS/Google, importer | — | **NOT_RUN**: chưa có lint script; chưa full audit tooling; collector/importer runtime chưa hiện diện trong inventory. |

Public-engine probe import `src/domain/index.ts`, duyệt mọi JSON trong test/oracle/fixtures, gọi scoreAttempt cho1632cases, so exact total/maxTotal và từng sections.I/II/III.score/max với expected độc lập. Mỗi case còn assert DTO JSON roundtrip bằng giá trị, 0<=total<=maxTotal, tổng points câu=total, đảo responses/answers giữ kết quả, JSON input không đổi. Tất cả PASS trong một node:test; không cộng1632 vào count152. Fixture chứa1296vectors II,29golden,256random,15I/II,36short-answer. Đây là lần đầu LC09→LC10 có bằng chứng public scorer thật; không còn báo module thiếu.

### Harness tái hiện web không tạo file

Chạy đoạn sau qua PowerShell here-string pipe tới `node --input-type=module`, cuối lệnh `exit $LASTEXITCODE`. Đây là VM harness với DOM/storage/timer stub giới hạn, **không phải browser E2E**; chỉ gọi logic inline thật. Renderer bị stub trong submit để không nhầm thiếu DOM với lỗi sản phẩm.

```js
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = fs.readFileSync('index.html', 'utf8');
const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).join('\n');
function page(store = new Map()) {
  const elements = new Map();
  const c = vm.createContext({console,
    document: {getElementById(id) {
      if (!elements.has(id)) elements.set(id, {value:'LC10',style:{},
        classList:{add(){},remove(){}},addEventListener(){}});
      return elements.get(id);
    }},
    window:{addEventListener(){},scrollTo(){}},
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
    setInterval(fn){c.tick=fn;return 1},clearInterval(){},alert(){}
  });
  vm.runInContext(script,c);
  vm.runInContext('showReportView=()=>{}',c);
  return {c,run:s=>vm.runInContext(s,c)};
}
// Chạy riêng từng repro: assertion theo hành vi mong đợi sẽ thất bại.
const p=page();
p.run("currentExam={questions:[{kind:'III',questionVersionId:'q',answerKey:'1,5'}]};studentState.responses={q:'1,5'}");
assert.equal(p.run('scoreAttemptLocally().total'),10); // actual3.5, F01
```

Các repro khác chạy riêng, sau helper page:

```js
const p=page();
p.run("studentState.responses={'q08-iii-ung-dung-thuc-te':' 1,5'}");
assert.equal(p.run("scoreAttemptLocally().questionResults.find(q=>q.questionVersionId==='q08-iii-ung-dung-thuc-te').points"),0); // actual3.5, F02
```

```js
const handler=script.match(/inputEl.addEventListener\('input', (\(e\) => \{[\s\S]*?)\n          \}\);/)[1]+'\n}';
const p=page();p.c.e={target:{value:'1.5'}};p.c.q={questionVersionId:'q'};
p.run('renderExamPane=()=>{};renderPalette=()=>{}');
p.run('('+handler+')(e)');
assert.equal(p.c.e.target.value,'1.5'); // actual15, F02
```

```js
const store=new Map(), a=page(store), b=page(store);
a.run('submitExam()');
assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
b.run('saveLocalState()');
assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true); // actualfalse,F03
```

```js
const p=page();p.run('Date.now=()=>0;startTimer();Date.now=()=>3600000');
p.c.tick();
assert.equal(p.run('studentState.submitted'),true); // false,2999seconds,F04
```

```js
const store=new Map(), a=page(store);a.run('saveLocalState()');
const b=page(store);b.run('Date.now=()=>4102444800000;loadLocalState();startTimer()');
assert.equal(b.run('studentState.submitted'),true); // false,3000seconds,F04
```

```js
import {scoreResultFromDTO} from './src/domain/index.ts';
assert.throws(()=>scoreResultFromDTO({attemptId:'a',examVersionId:'e',
  ruleSetId:Object.create(null)}),SyntaxError); // TypeError,F06
```

## Regression ledger, coverage_gaps và traceability

| Hạng mục | LC10 evidence / giới hạn |
| --- | --- |
| LC09-F01 thiếu scoring modules | **RESOLVED về thiếu implementation**: public API/compute maxima/score/DTO nay có,1632fixtures thực khớp. F06 và thiếu committed regression suite cho score/DTO vẫn cần sửa; không APPROVED toàn M1. |
| LC09-F02 thiếu entry/build fail | **RESOLVED về file/build failure**: index.html có, script exit0. F01–F04 là lỗi đường web mới; không coi asset checker READY là nghiệm thu. |
| LC06 validator/shuffle/sample | Sáu module nền hashes không đổi; suite PASS. Tests sample đã tăng toán học/blank/mixed, nhưng full-correct/mixed chỉ judge/validate, chưa nối scoreAttempt/report web. |
| B1-AC01…03; T01…09/T15 | Engine differential/bounds/sums/purity/roundtrip PASS; maxima unit golden mới có. Web vi phạm exact raw/rational/dynamic max. Count152 không bao gồm probes1632. |
| AC04/T11/T13/T14 | Models IDs và DTO nominal roundtrip PASS; malformed unknown DTO F06. Lifecycle source-edit/version isolation và browser snapshot chưa kiểm đầy đủ; web không lưu version/order. |
| AC05/T12 | Shuffle unit regressions PASS; probe đảo response/statement answers PASS. Chưa chạy full cross-product exam+option permutations qua engine ở vòng này; chưa actual reload/order persistence. |
| AC06/T10 | Validator suite PASS; malformed getter/proxy/resource limits toàn API chưa vét cạn; serializer còn F06. Không benchmark payload lớn/DoS endpoint khi chưa endpoint. |
| AC07/08/T17 | Test+asset checks PASS nhưng typechecks FAIL; chưa mutation trên engine, changelog/rollback/owner acceptance.9negative controls oracle không là mutation SUT. |
| T16 | Display rounding chưa owner duyệt. Web tự dùng toFixed2 tại401; cần quyết định khi tích hợp report, không coi chính sách đã duyệt. |

`test/e2e/demoFlow.test.ts` chỉ đọc file/kiểm chuỗi và tự tính constants4/2/2. Không mở browser, click, fetch trang, timer, storage, submit hoặc gọi scorer sản phẩm. Tên E2E và152tests xanh không phủ F01–F04. Inventory cuối chưa có test/domain/scoreAttempt.test.ts hoặc serialize.test.ts và public acceptance engine riêng; reviewer probe chưa được đưa vào regression suite do scope chỉ cho báo cáo.

Chưa browser QA mobile/desktop, keyboard/focus/modal/contrast/zoom, Telex/VNI/composition, rich text/math/SVG thực. Renderer có các phép thay thế regex và innerHTML; chưa chạy DOM injection/security probe hoặc kiểm toàn bộ công thức, không gán claim XSS exploit khi chưa chứng minh trust path. Sample luyện tập public key không tự động là leak key cần bí mật; chưa có policy kiểm tra giấu key.

Offline localStorage tồn tại nhưng chưa có offline shell/service worker trong inventory, chưa chứng minh fresh offline navigation/refresh. Chưa failure injection quota/private-mode/migration, honest failed-save badge, native storage atomicity, back/forward, actual multi-tab/browser simultaneous candidates. VM tái hiện logic race/timer, không thay checks hệ điều hành/browser. Report hiện có print(), chưa kiểm PDF tạo ra hoặc HTML download offline; không lưu startedAt/endedAt đầy đủ, chỉ submittedAt dạng giờ địa phương. Chưa collector/API/Google receipt/readback/CORS/idempotency/retry/backoff/trusted grading, question bank/builder/importer runtime. Không audit toàn bộ ops hay dependency/history/secrets/license hiện hành.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0 / glue:** đóng F01/F02: nối web→engine rational đã kiểm; raw validation không sửa input; regression thật trên scorer/report web. Cùng đợt khôi phục typecheck F05, bổ sung score/DTO/public acceptance tests và F06.
2. **P0 / glue, M2:** đóng F03/F04: attempt/version/order snapshots, startedAt/deadline/endedAt, durable revision/final transition và conflict giữa tab; manual/double/autosubmit, no-login clock limitations. Kiểm offline shell/restore/quota/migration và trạng thái lưu thật.
3. **P1 / M1:** đưa1632fixture differential vào suite public API; hoàn thiện input-error/status/unknown+duplicate II/invalid III, DTO malformed, full=max/blank0/bounds/sums, question+option permutations, source-edit/version isolation, mutation controls. Giữ maxima golden hiện có; tsc/test/build gates thật.
4. **P1 / M2:** báo cáo offline tải được theo công nghệ được chọn; score/max tổng/từng phần giữ5/15/16 và rational gốc, timestamp đầy đủ, câu trả lời/key/lời giải theo publication policy. Xác minh print/PDF/HTML artifact thực.
5. **P2 / M3:** question bank môn→lớp→chương/chủ đề→bài→mức độ; builder custom bật/tắt từng phần, thời gian/trộn/lượt/policy; reuse/versioning/publish snapshots, export/import/backup; authoring private phù hợp no-login.
6. **P2 / M4:** collector/storage/hosting được duyệt, real receipt/readback, local_saved/queued/sending/server_confirmed/failed; bounded retry/backoff/durable dedupe/conflict/lost-response/CORS; trusted grading khi cần, tối thiểu PII/xóa/xuất/sao lưu.
7. **P3 / M5:** DOCX/PDF→IR→preview/edit→confirm→publish, giữ text/table/image/OMML/LaTeX, PDF text/scan/OCR, provenance/confidence/flags/missing keys; resource/error/security corpus; không đoán key.
8. **P3 / mẫu chuẩn:** preset rule version theo môn/năm/văn bản được xác minh và owner duyệt, tách custom-v1.
9. **P4 / M6:** browser E2E thực, mobile/IME/a11y/performance/security/privacy, CI/lint/build/rollback/changelog và owner nghiệm thu. Integrity/security kiểm ngay từng milestone.

## Quyết định còn mở

Không thiếu quyết định chặn việc sửa F01–F06 hoặc thực hiện review. Không tự thay scoring invariant. Các hạng mục sau trả **NEED_DECISION khi triển khai phần liên quan**, không coi là blocker để hoãn fixes đã rõ:

| Hạng mục | 2–3 phương án cho owner |
| --- | --- |
| Grammar III | Giữ charset/length sa-charset-v1; hoặc grammar chặt với policy version/compatibility. |
| Display điểm | Phân số exact; hoặc decimal theo digits/mode được duyệt, giữ rational gốc. |
| Giới hạn đề | Duyệt1000 tạm; hoặc limit dựa trên benchmark. |
| Nhóm phần trộn | Duyệt false giữ nguồn/true nhóm I→II→III; hoặc schema mới bắt nguồn đã nhóm phần. |
| Collector/hosting | Local/private; Apps Script qua integration thực; hoặc serverless gateway được duyệt. |
| Report offline | HTML tải xuống; hoặc PDF với renderer/công bố key được chọn. |
| Mẫu chuẩn | Tiếp tục chỉ custom; hoặc registry môn/năm đã kiểm chứng. |

recommended_action: **CHANGES_REQUESTED**; giao worker đúng vùng đóng F01–F06, tích hợp engine thay scorer web, chạy regression/browser thật. Chưa commit/deploy/nghiệm thu. tools_research: NOT_REQUESTED; không đưa khuyến nghị dependency/claim upstream mới nên không nghiên cứu web. privacy_notes: chỉ kết quả kỹ thuật, không nội dung chỉ thị riêng, credentials hoặc dữ liệu học sinh.
