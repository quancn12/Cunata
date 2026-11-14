# LC16 — Kiểm định độc lập sản phẩm, vòng 16

review_id/task_id: LC16; reviewer: Codex; requirements_version: Shared Product Contract v2.0 và M1-scoring-contract v1.0; risk_level: HIGH.

**verdict: CHANGES_REQUESTED.** Còn mở 1 BLOCKER, 1 CRITICAL, 3 MAJOR, 1 MINOR đã xác minh bằng Node VM. F01 typecheck đã được worker khác sửa trong lúc review và kiểm lại PASS. Domain và web khớp điểm/max của 1.632 fixture độc lập; chưa thể nghiệm thu toàn sản phẩm. Handoff: READY_FOR_REVIEW nghĩa là báo cáo đã sẵn sàng, không phải sản phẩm được duyệt. Các quyết định nghiệp vụ còn mở được ghi riêng NEED_DECISION bên dưới.

## Snapshot và phạm vi

base_commit = head_commit = `f2447ae787272808f84d9d894cdded8e7cff3d2c`, nhánh main; git log chỉ có commit này và baseline `2ee84e3`. LC15 review cùng HEAD, nhưng **working tree sản phẩm hiện đã thay đổi**: index.html (+504/-274), test/e2e/demoFlow.test.ts (+135). Không có delta HEAD trong src/, styles/, public/, scripts/build.js, package/lockfile hoặc hai tsconfig. Hai script untracked scripts/update-index.js và scripts/test-lc13-probes.js được đọc như công cụ hỗ trợ; không chạy script sửa index. Git diff không thay thế việc so với LC15: các hash LC15 xác nhận hai file web/test đã đổi, domain score/DTO giữ nguyên.

| File | SHA256 snapshot LC16 |
| --- | --- |
| index.html | A5F40C0D521D5F31BA6016C445179A3566DC7F1FABE47B05D56DD341460B6CFC |
| test/e2e/demoFlow.test.ts | 2B881C276C09D9B972A28450A8C6C6EC16B369657D90F22C8DD5478657B3DDC5 |
| src/domain/scoreAttempt.ts | E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE |
| src/domain/serialize.ts | 850EBA8D6620BD2B6DE02E034226ECB499E9ED4C0EDB18C2D4099711ADB855A8 |

Đã đọc toàn bộ hai hợp đồng bắt buộc, skill được chỉ định, review LC15 và READINESS §6. Không tìm thấy AGENTS.md trong workspace hoặc D:\AGENTS.md. files_reviewed: delta index/test; đường chạy fetch đề → render/input → persistence/restore/timer → submit/report; API/models/validation/judging/rational/maxima/shuffle/DTO trong src/domain; assertions unit/acceptance/fixtures và regression VM; package, configs, build script, CSS/print và assets mẫu. Review theo đường chạy/rủi ro, không tuyên bố mọi dòng hoặc mọi hành vi browser đã được kiểm định.

Working tree đã có nhiều thay đổi ops/dashboard/workers và review untracked của người khác. Chỉ tạo file báo cáo này; không sửa code/config/test, không install, branch/worktree, commit, deploy hoặc revert file khác. Không chứng nhận phần điều phối ops/dashboard/workers như một sản phẩm riêng.

## Delta so với LC15

- LC15-F01: **CLOSED cho lỗi hardcode điểm/max trên đề hợp lệ**. Web tính rational và giữ fraction fields; toàn bộ 1.632 fixture khớp total/max và từng phần. Vẫn nhân đôi scoring thay vì dùng domain; thiếu validation là LC16-F04.
- LC15-F02: **CLOSED cho hai repro trim/replace**. Suite thật kiểm raw `1.5` không thành `15`, leading space được 0 điểm; handler không render lại toàn pane mỗi input. Paste quá 4 ký tự/native maxlength, entity trong value và IME chưa browser kiểm tra.
- LC15-F03: **PARTIAL**, sequential stale save đã chặn; interleaving vẫn mất final (LC16-F03), version isolation chưa có (F05).
- LC15-F04: **PARTIAL**, tick/reload quá deadline đã hoạt động; khởi tạo timer chưa lưu ngay (F07).
- LC15-F05: **OPEN**, F02 bên dưới. Không coi log warning là feedback lưu lỗi cho học sinh.

## Findings

### LC16-F01 — MAJOR — CLOSED / RETESTED — Typecheck hỏng do import node:vm mới

- affected_files: `test/e2e/demoFlow.test.ts:5`; declarations liên quan `test/domain/ambient-node.d.ts:1`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: chạy `npx --no-install tsc -p tsconfig.json`, rồi `npx --no-install tsc -p tsconfig.web.json`; cả hai exit1, `test/e2e/demoFlow.test.ts(5,16): error TS2591: Cannot find name 'node:vm'`.
- expected: typecheck exit0 bằng tooling đã có; actual: cả hai compiler gate đỏ dù runtime test179 pass. impact: regression từ LC15, chặn gate tích hợp/type safety.
- minimal_fix: khai báo kiểu tối thiểu nhưng đúng cho API VM đang dùng theo cơ chế ambient hiện có, hoặc giải pháp type tooling đã được duyệt; không cài dependency theo gợi ý tự động của compiler trong task này.
- regression_test: hai lệnh tsc và npm test cùng pass; không loại test mới khỏi include, không dùng suppression để che lỗi.
- final_status: sau khi chạy harness, file untracked `test/e2e/ambient-vm.d.ts` xuất hiện do worker khác. Đã đọc toàn bộ: khai báo Context/createContext/runInContext cho node:vm, không runtime code. Hai typechecks chạy lại exit0. F01 **không còn là lỗi mở**; không phải Codex sửa file này. Index/test runtime hashes vẫn đúng snapshot trên.

### LC16-F02 — MAJOR — Save thất bại vẫn giữ badge đã lưu

- affected_files: `index.html:64`, `587–613`, `1163–1171`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: save thành công; lưu lại text badge; đổi responses.q='new'; ép setItem ném QuotaExceededError; gọi saveLocalState. Badge trước/sau đều `Đã lưu cục bộ`, durable responses vẫn `{}`. Repro trong harness dưới yêu cầu badge đổi và FAIL.
- expected: local_saved gắn revision ghi thành công; failure hiện unsaved/failed cho revision mới. actual: catch chỉ warn; submit cũng nuốt lỗi ghi rồi hiện report. Markup ban đầu còn báo thành công trước first write.
- impact: đóng/reload có thể mất đáp án/lần nộp dù UI báo đã lưu. Đây là trạng thái lưu không trung thực, độc lập race F03.
- minimal_fix: success chỉ sau write, catch cập nhật failed/unsaved và cho retry/recovery/export dữ liệu RAM; submit phân biệt đã chấm trong RAM với đã lưu bền vững.
- regression_test: first-write denied; success→quota/security failure; submit write fail; retry success; badge và record đúng revision sau reload.

### LC16-F03 — CRITICAL — Read-then-write vẫn cho tab cũ đảo ngược final

- affected_files: `index.html:589–608`, `1148–1167`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: B đọc record submitted=false trong saveLocalState; trước khi B ghi, A.submitExam ghi submitted=true; cho B tiếp tục setItem với state cũ. Record cuối submitted=false. Harness mô phỏng đúng interleaving bằng getItem stub giữ giá trị cũ rồi gọi A.submitExam trước khi trả về B; assertion final=true FAIL.
- expected: final monotonic, stale writer không ghi lùi. actual: kiểm trước ghi không atomic; sequential test mới tại test/e2e/demoFlow.test.ts:218 chỉ kiểm A hoàn tất trước khi B bắt đầu nên không bắt race này.
- impact: mất kết quả final, reload mở lại editable; đã tái hiện logic bằng hai VM chung storage, chưa phải browser concurrency E2E.
- minimal_fix: final transition và autosave có giao thức concurrency atomic phù hợp storage được duyệt; stable attempt/version/revision, tab stale read-only/conflict. Không coi thêm một lần getItem là sửa root cause.
- regression_test: chèn barrier giữa getItem/setItem của hai tab; autosave vs submit/timeout, double submit; final không bị ghi lùi và giữ một kết quả đã chốt.

### LC16-F04 — BLOCKER — Web nhận đề thiếu answer key và chấm full cho bài trắng

- affected_files: `index.html:560–565`, `986–994`, `1030–1049`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: currentExam chứa một câu II có 4 statementId nhưng thiếu cả 4 trường answer; responses={}; gọi scoreAttemptLocally. actual totalFraction='1', status='full': `undefined === undefined` bốn lần. Fetch chỉ cần questions là mảng không rỗng, nên payload này qua điều kiện load. Đã kiểm cả kỳ vọng throw và kỳ vọng không full: đều FAIL.
- expected: lỗi dữ liệu đề có mã rõ, không bắt đầu/chấm như đề hợp lệ; domain validate đã có khả năng reject. actual: web bỏ qua rules/schema/key validation và có scorer riêng.
- impact: điểm sai cấp invariant CRITICAL; nguồn JSON cấu hình lỗi được biến thành điểm học sinh. Sample hiện hợp lệ; không khẳng định sample có thiếu key.
- minimal_fix: validateExamVersion ở ranh giới load/embedded và scorer; adapter responses→domain scoreAttempt; lỗi đề tách khỏi điểm0 của học sinh. Không chỉ thêm guard undefined cho một nhánh.
- regression_test: fetch→init→submit với missing/invalid key I/II/III, null/non-object/duplicate IDs, unknown ruleset/policy, empty/overlimit; fail-closed và thông báo dữ liệu lỗi; giữ golden cases hợp lệ.

### LC16-F05 — MAJOR — Restore không ràng buộc ExamVersion

- affected_files: `index.html:511–520`, `616–627`, `1150–1158`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: A save responses.q='1'; B có currentExam examVersionId='other-v2', câu q key='2'; B.loadLocalState vẫn phục hồi q='1'. Harness expected undefined, actual '1', FAIL. Record dùng key toàn cục, attemptId hardcode, không có examVersionId/snapshot để đối chiếu.
- expected: resume đúng immutable exam/version/order snapshot, hoặc tách/reject state không tương thích. actual: Object.assign mọi object JSON; submit còn tái dùng report final của đề khác nếu cùng key.
- impact: đổi file đề hoặc deploy phiên bản mới có thể gắn bài/điểm/deadline cũ vào đề mới. Hiện chưa có bank UI; lỗi đã tái hiện tại ranh giới currentExam/load hiện hữu.
- minimal_fix: persistence envelope có schemaVersion, attemptId riêng, examVersionId và snapshot; validation/migration khi restore; key namespace và final lookup theo identity; không tự regrade bài cũ theo key mới.
- regression_test: v1→v2 cùng question ID khác key, khác đề/cùng key storage, final v1 khi mở v2, corrupt/legacy record, snapshot shuffle restore; không trộn bài.

### LC16-F06 — MINOR — Null phần II được báo Sai thay vì Chưa làm

- affected_files: `index.html:1037–1044`, `1057–1058`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: câu II hợp lệ có 4 key=false, response từng ý=null; scoreAttemptLocally trả status='wrong', mỗi userVal hiển thị Sai. Harness expected unanswered, FAIL. Điểm vẫn 0, không cộng nhầm điểm cho false.
- expected: null/thiếu đều unanswered, report không mô tả học sinh đã chọn false. actual: answeredStatements đếm null và ternary truthiness hiển thị Sai.
- impact: trạng thái/report khác contract và domain; UI hiện xóa field khi clear, nên chủ yếu tác động dữ liệu nullable khi restore/adapter.
- minimal_fix: chỉ boolean là answered, null/undefined là chưa chọn; dùng kết quả judge/domain thay logic riêng.
- regression_test: mọi vector null/false/true kiểm cả perStatement và question status, ngoài điểm; clear/save/reload cũng giữ chưa làm.

### LC16-F07 — MAJOR — Deadline đầu tiên chưa được lưu, refresh có thể đặt lại giờ

- affected_files: `index.html:571–580`, `643–674`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: storage rỗng; clock1000 gọi startTimer, deadline3001000; reload bằng VM B ở clock2000, loadLocalState/startTimer, deadline3002000. Không có record trước autosave hoặc thao tác đầu tiên. Assertion giữ deadline FAIL.
- expected: khởi tạo attempt/deadline được ghi ngay trước khi bắt đầu làm; refresh giữ deadline. actual: startTimer chỉ ghi RAM, đợi tick còn số giây chia hết10 hoặc input mới save.
- impact: refresh trong cửa sổ đầu (và lặp lại) kéo dài thời gian bình thường, không cần sửa giờ máy. Không phủ nhận fix deadline sau khi record đã lưu.
- minimal_fix: persist identity/start/deadline ngay khi tạo attempt; xử lý first-write failure theo F02; render/resume không tự tạo deadline mới cho cùng attempt.
- regression_test: refresh ở 0–9s trước autosave, không tương tác; deadline bất biến; close/reopen quá hạn; first-write denied có cảnh báo; timeout/manual chỉ một final.

## checks_run — thực chạy LC16

Environment: Windows/PowerShell, D:\Cunata; Node v24.14.0, npm11.9.0, Python3.11.0, TypeScript7.0.2 có sẵn. Artifact: transcript công cụ và harness trong chính báo cáo này; không tạo log/test ngoài scope. Counts node:test không cộng số fixture/vector.

| Command/check | Exit | Kết quả và giới hạn |
| --- | ---: | --- |
| git status/log/rev-parse/diff + SHA256 | 0 | Snapshot/delta như trên; không sửa working tree của người khác. |
| `npm test` | 0 | **179 pass / 0 fail**, 34 suites, 0 skip/cancel/todo; duration397.5466ms. |
| `npx --no-install tsc -p tsconfig.json` | 1 | TS2591 node:vm, test/e2e/demoFlow.test.ts:5:16; wall1.8802s. |
| `npx --no-install tsc -p tsconfig.web.json` | 1 | Cùng diagnostic; wall1.8697s. Config không kiểm JS inline. |
| `npx --no-install tsc -p tsconfig.json` — chạy lại sau ambient-vm.d.ts | 0 | Không diagnostics; wall1.4476s; F01 CLOSED. |
| `npx --no-install tsc -p tsconfig.web.json` — chạy lại | 0 | Không diagnostics; wall1.2162s. |
| `node scripts/build.js` | 0 | 4 assets tồn tại, sample8 câu hợp schema, CSS linked; wall0.1983s. Đây là read-only asset/schema check, không compile/bundle/browser; package không có npm build. |
| `python -B test/oracle/oracle.py --check` | 0 | **11 pass / 0 fail**, 1632 fixtures, 5849 maxima configs, 9 negative controls, seed20261114, duration_s1.3248. Oracle tự kiểm, không thay SUT. |
| Node stdin domain+web oracle/negative runner, lần đầu | 1 | 8 tests: **3 pass / 5 fail**, duration141.1733ms. Domain+web fixtures pass. Assertion quota dùng literal tiếng Việt qua PowerShell pipe bị lỗi encoding, tạo false pass; không sử dụng kết quả đó để đóng F02. |
| Node stdin xác minh lại quota/key/timer | 1 | **0 pass / 3 fail**, duration21.7836ms; so badge trước/sau không phụ thuộc encoding; missing key ra1/full; deadline đổi3001000→3002000. |
| Harness hợp nhất trong báo cáo, lệnh dưới | 1 | **2 pass / 6 fail**, 8 tests, 0 skip/cancel/todo, duration135.66ms; domain/web1632 pass, F02–F07 đều fail đúng expectation; không browser E2E. |
| Browser/mobile/IME/keyboard/AT/axe/Lighthouse/screenshots/traces | — | **NOT_RUN**: lane review này static + Node VM, không khẳng định browser thật. |
| Lint/SAST/secret-history/dependency audit chuyên biệt | — | **NOT_RUN**; không có lint script; rg kiểm sinks không là chứng nhận bảo mật. |
| Collector/CORS/readback; importer DOCX/PDF | — | **NOT_RUN / NOT_IMPLEMENTED** trong source sản phẩm hiện có. |

### Harness hợp nhất, không ghi file test

Chạy từ D:\Cunata: đọc block js này rồi import data URL bằng Node; command trả nguyên exit code của node:test. VM thực thi script inline thật nhưng stub DOM/storage/timer và thay showReportView bằng no-op. Race là interleaving có kiểm soát, không phải bằng chứng browser scheduler. Hai test fixtures kiểm exact total/max và từng phần; domain thêm DTO JSON roundtrip, bounds, non-mutation. Web adapter map Response[] sang object hiện hành, vì vậy scores pass không chứng minh status/report đúng.

```js
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const api = await import(new URL('src/domain/index.ts', 'file:///' + process.cwd().replaceAll('\\','/') + '/'));
const script=[...fs.readFileSync('index.html','utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function page(store=new Map()) {
 const nodes=new Map();
 const c=vm.createContext({console:{warn(){}},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'LC16',style:{},classList:{add(){},remove(){}},addEventListener(){}});return nodes.get(id);}},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setInterval(fn){c.tick=fn;return 1;},clearInterval(){},alert(){}});
 vm.runInContext(script,c);vm.runInContext('showReportView=()=>{}',c);
 return {c,nodes,store,run:s=>vm.runInContext(s,c)};
}
const cases=fs.readdirSync('test/oracle/fixtures').filter(f=>f.endsWith('.json')).flatMap(f=>JSON.parse(fs.readFileSync('test/oracle/fixtures/'+f,'utf8')).cases);
test('domain oracle/DTO/bounds/nonmutation 1632',()=>{for(const x of cases){const before=JSON.stringify([x.exam,x.attempt]);const r=api.scoreAttempt(x.exam,x.attempt);assert.equal(api.toFractionString(r.total),x.expected.total,x.id);assert.equal(api.toFractionString(r.maxTotal),x.expected.maxTotal,x.id);for(const s of ['I','II','III']){assert.equal(api.toFractionString(r.sections[s].score),x.expected.sections[s].score,x.id);assert.equal(api.toFractionString(r.sections[s].max),x.expected.sections[s].max,x.id);}assert.deepEqual(api.scoreResultFromDTO(JSON.parse(JSON.stringify(api.scoreResultToDTO(r)))),r);assert.ok(r.total.num>=0n&&r.total.num*r.maxTotal.den<=r.maxTotal.num*r.total.den);assert.equal(JSON.stringify([x.exam,x.attempt]),before);}});
test('web exact oracle fractions 1632',()=>{const p=page();for(const x of cases){const responses={};for(const r of x.attempt.responses)responses[r.questionVersionId]=r.kind==='I'?r.selectedOptionId:r.kind==='III'?r.raw:Object.fromEntries(r.answers.map(a=>[a.statementId,a.value]));p.c.ex=x.exam;p.c.rs=responses;p.run('currentExam=ex;studentState.responses=rs');const r=p.run('scoreAttemptLocally()');assert.equal(r.totalFraction,x.expected.total,x.id);assert.equal(r.maxTotalFraction,x.expected.maxTotal,x.id);for(const s of ['I','II','III']){assert.equal(r['score'+s+'Fraction'],x.expected.sections[s].score,x.id);assert.equal(r['max'+s+'Fraction'],x.expected.sections[s].max,x.id);}}});
test('F02 failed write changes success badge',()=>{const p=page();p.run('saveLocalState()');const previous=p.nodes.get('syncText').textContent;p.run("studentState.responses.q='new';localStorage.setItem=()=>{throw Error('QuotaExceededError')};saveLocalState()");assert.notEqual(p.nodes.get('syncText').textContent,previous);});
test('F03 interleaved stale save preserves final',()=>{const store=new Map(),a=page(store),b=page(store);b.run('saveLocalState()');let armed=true;b.c.localStorage.getItem=k=>{const old=store.get(k)||null;if(armed){armed=false;a.run('submitExam()');}return old;};b.run('saveLocalState()');assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);});
test('F04 reject missing exam key',()=>{const p=page();p.run("currentExam={questions:[{kind:'II',questionVersionId:'q',statements:['a','b','c','d'].map(statementId=>({statementId}))}]};studentState.responses={}");assert.throws(()=>p.run('scoreAttemptLocally()'));});
test('F05 reject cross-version restore',()=>{const store=new Map(),a=page(store),b=page(store);a.run("studentState.responses.q='1';saveLocalState()");b.run("currentExam={examId:'other',examVersionId:'other-v2',questions:[{kind:'III',questionVersionId:'q',answerKey:'2'}]};loadLocalState()");assert.equal(b.run('studentState.responses.q'),undefined);});
test('F06 null II stays unanswered',()=>{const p=page();p.run("currentExam={questions:[{kind:'II',questionVersionId:'q',statements:['a','b','c','d'].map(statementId=>({statementId,answer:false}))}]};studentState.responses={q:{a:null,b:null,c:null,d:null}}");assert.equal(p.run('scoreAttemptLocally().questionResults[0].status'),'unanswered');});
test('F07 reload retains initial deadline',()=>{const store=new Map(),a=page(store),b=page(store);a.run('Date.now=()=>1000;startTimer()');const first=a.run('studentState.deadline');b.run('Date.now=()=>2000;loadLocalState();startTimer()');assert.equal(b.run('studentState.deadline'),first);});
```

```powershell
@'
import fs from 'node:fs';
const md=fs.readFileSync('docs/reviews/LOOP-16-codex.md','utf8');
const code=md.match(/```js\r?\n([\s\S]*?)```/)[1];
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
'@ | node --input-type=module
exit $LASTEXITCODE
```

## coverage_gaps / traceability

| Yêu cầu | Bằng chứng | Giới hạn còn lại |
| --- | --- | --- |
| B1-AC01/02/03, T01–09 | unit179, exhaustiveII1296 vectors; domain/web1632 scores/max; exact rational | Web key validation F04, nullable status F06; display policy chưa duyệt. Không lấy score-only differential để kết luận status pass. |
| B1-AC04/05, T11–15 | unit IDs/shuffle/version DTO; domain fixture roundtrip/bounds/nonmutation | Lần này không chạy independent permutation runner hay full candidate mutation; web chưa snapshot shuffle/version, F05; bank immutable versions chưa có. |
| B1-AC06, T10/13 | schema/DTO negative unit; web invalid-key repro | Không vét cạn getters thay đổi, resource abuse/huge rational/unknown objects; web không dùng domain validator. |
| B1-AC07/08, T16/17 | real commands, SHA/delta và limitations; typechecks cuối pass | Browser/owner acceptance/rollback/changelog milestone chưa chứng minh; oracle negative controls không là full mutation SUT. |
| Student offline/timer/report | VM regression cũ và repro mới F02/F03/F05/F07 | Không test browser quota, actual tab scheduling, offline cold-start, download/print output; static shell chưa có service worker. |
| UI/a11y/security | CSS/print, handlers, innerHTML/rich text sinks đã xem | Radio div chỉ click, focus/keyboard và modal cần browser kiểm; raw interpolation/report và renderMathText chưa escape đầy đủ. Chưa gắn exploit đã xác minh qua bank/importer chưa tồn tại. |

Test có tên E2E hiện dùng FS và VM stub, **không phải browser E2E**. Build chỉ kiểm assets/sample schema; không validate JSON đề runtime và không typecheck inline JS. Answer key public/client scoring hiện chỉ phù hợp luyện tập; không có trusted grading/collector để xác minh yêu cầu thi bảo mật, CORS, receipt/readback/dedupe. Không suy ra không có secret từ một lần rg; không chứng nhận bảo mật toàn bộ Git history.

## Tính năng lộ trình còn thiếu — ưu tiên

1. **P0: chấm/report web an toàn** — F04, adapter domain thay scorer riêng, validation schema/rules/key; giữ fractions/raw; F06; regression UI thật cho max5/15/16 và phân số lặp.
2. **P0: độ bền attempt** — F02/F03/F05/F07; stable attempt/version/order snapshot, final atomic/idempotent, deadline ghi ngay, migration/quota/conflict/recovery; giữ gate F01 đã sửa.
3. **P1: luồng học sinh/report đầy đủ** — chọn đề/nickname; cấu hình thời gian/lượt/trộn hai cờ/lời giải, startedAt/endedAt gắn phiên bản; tải HTML/PDF để xem offline theo policy công bố key. Hiện chỉ window.print, chưa deliverable report download được kiểm định.
4. **P1: soạn đề/ngân hàng** — môn/lớp/chủ đề/bài/mức độ, reuse, immutable QuestionVersion/ExamVersion, preview/publish, import/export/backup/delete; private/local authoring theo phương án duyệt, không giả phân quyền no-login.
5. **P1: thu kết quả** — dịch vụ chủ dự án kiểm soát được duyệt; Google/Apps Script/gateway thật, CORS/receipt/readback, outbox/retry giới hạn/backoff/dedupe; local_saved/queued/sending/server_confirmed/failed; trusted grading khi cần.
6. **P2: importer Word/PDF** — IR/preview/sửa/xác nhận, rich text/bảng/ảnh/OMML/math, text vs scan/OCR uncertainty, provenance, không đoán key, resource limits/corpus tests. Chưa implementation.
7. **P2: mẫu chuẩn THPT** — registry môn/năm/nguồn quy định được kiểm chứng và owner duyệt; không gắn custom-v1 thành chuẩn.
8. **P2: polish/nghiệm thu** — mobile/IME/keyboard/a11y/math/print/performance/security/privacy, export/delete/backup guidance, browser E2E/CI, rollback/changelog và owner acceptance; class/assignment giai đoạn sau.

## NEED_DECISION — không tự chốt

Không thấy quyết định thay thế trong hai tài liệu bắt buộc. Các việc sửa có invariant rõ ở F01–F07 không phải chờ quyết định dưới đây.

| Quyết định | 2–3 phương án cho owner | Phần bị chặn |
| --- | --- | --- |
| Grammar III | A: giữ charset/length sa-charset-v1; B: grammar hẹp với policy version mới; C: grammar theo preset/version duyệt | Validator mở rộng; giữ exact matching bài cũ. |
| Display rounding | A: fraction exact; B: decimal với digits/mode được duyệt và fraction nguồn; C: fraction kèm decimal xấp xỉ | Renderer/report chính thức; web hiện tự chọn2digits và approximation, chưa bằng chứng phê duyệt. |
| Limit/grouping | A: duyệt tạm1000/group I→II→III; B: limit/grouping khác kèm version/tests | Chính sách chính thức, không tự mở rộng. |
| Storage/collector/report | A: local practice + HTML; B: collector được duyệt quyền/CORS/retention/authority + HTML; C: local practice + PDF sau đánh giá | Hạ tầng, chi phí, production và format download. |

assumptions: NONE mới; giữ giả thiết tạm của hợp đồng ở trạng thái chờ duyệt. recommended_action: giao glue sửa F02–F07, giữ F01 đã sửa, fail-base/pass-fix regression rồi review bytes thay đổi và browser integration trước nghiệm thu. tools_research: không giao nghiên cứu/cài tool mới. privacy_notes: chỉ dữ liệu thử và kết quả kỹ thuật; không đưa nội dung chỉ thị riêng.
