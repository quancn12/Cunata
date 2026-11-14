# LC19 — Kiểm định độc lập sản phẩm, vòng 19

review_id/task_id: LC19; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 + M1-scoring-contract v1.0; risk_level: HIGH.

**verdict: CHANGES_REQUESTED.** Không nghiệm thu toàn sản phẩm. Hai BLOCKER (F01/F02), hai MAJOR (F04/F08) và một MINOR (F09) còn mở trên snapshot kiểm cuối. LC18-F03/F05 đã sửa và kiểm lại; hai payload HTML của LC18-F06 đã được escape và retest PASS. F07 từng làm suite đỏ trong phiên, worker đã sửa và retest CLOSED: **198 pass / 0 fail**. Hai typecheck và asset verification PASS. Harness LC19 độc lập cuối: **12 pass / 6 fail / 18 checks**, gồm domain/web1.632 fixtures mỗi bên PASS. Trạng thái bàn giao NEED_DECISION chỉ áp dụng các quyết định mở ở cuối; không trì hoãn sửa lỗi invariant.

## Snapshot, delta và phạm vi

- base_commit/head_commit lúc bắt đầu: `84c425f8f022c57c2611883c0e504dd9b5c2dcce`, branch main. Review HEAD cộng working tree, không branch/worktree/commit/deploy. LC18 kết thúc trên cùng HEAD; đầu LC19 không có product delta so snapshot cuối LC18. Đã đọc log các vòng trước và diff thật, không dùng overnight gate thay kết quả tự chạy.
- Worker sửa `index.html` trong khi review: snapshot đầu SHA256 `F8277DF863392E7B3A877BAA4E61A924908003728C8E4B6E7E05B5FAA60A378A`, 70.869 bytes; sau đó `390CC911...`, `7BB12843...`, `B971F614...`, `7361F6F1...`; snapshot kiểm cuối `04CB070EF5CA857B69291FBA3A6A5C732D32F9B056B4CACBE915F76E78BC72F8`, 81.987 bytes. Những kết quả trung gian không được gán cho bytes cuối.
- `test/e2e/demoFlow.test.ts` SHA256 đầu `3BF14A392E5A62474811AB24FD9C923F219E52F545D8E40638D38E02BF15F7AF`, cuối `5080F5C7A2E9639F5CAF4FF310D25495C315F9C79D0ACEDAEFA1EFC0C5B66398`; `src/domain/scoreAttempt.ts` `E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE`; `src/domain/serialize.ts` `850EBA8D6620BD2B6DE02E034226ECB499E9ED4C0EDB18C2D4099711ADB855A8`. Không domain/dependency/config delta ở các lần kiểm nêu trong báo cáo.
- files_reviewed: tất cả module `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; luồng `index.html` fetch/embedded → validation → restore → render/input → save/timer → submit → report/download/restart; unit/acceptance/VM assertions, oracle/fixtures, package/lock/config/build, sample JSON/SVG, CSS và README; READINESS §6, LC16–18 để đối chiếu hồi quy. Review theo rủi ro, không tuyên bố exhaustive mọi dòng/trạng thái.
- Chỉ Codex tạo/sửa `docs/reviews/LOOP-19-codex.md`; các thay đổi source/test/ops/dashboard/workers thuộc tiến trình khác, không sửa/revert. Không thấy AGENTS.md trong workspace hoặc D:\AGENTS.md. Không install, thêm dependency hay chạy script sinh build file ngoài scope. Không đọc private prompt của worker khác.

## Findings

### LC19-F01 — BLOCKER — Thêm lần đọc thứ tư vẫn không bảo toàn final trước stale draft

- affected_files: `index.html:817–855`, writer final `index.html:1493–1514`. **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC18-F01.
- evidence/reproduction_steps: harness `race` tạo hai VM dùng chung Map storage, cùng đề/attempt; B lưu draft. Tại boundary B.setItem, cho A.submitExam hoàn thành rồi B ghi payload draft đã chuẩn bị. VM C load lại: `submitted=false`, expected true. Các lần đọc kiểm tra đều đã chạy trước interleave; thêm `finalVerify` không tạo transaction.
- expected/actual: final đã chốt không bị stale writer đảo ngược; hiện draft thay final. Impact: mất điểm/report, vi phạm Shared §3. Đây là repro mô hình storage interleaving của mã thật, **chưa xác nhận browser scheduler đa tiến trình thực tế**.
- minimal_fix: dùng cùng cơ chế coordination/transaction cho tất cả writer, hoặc final bất biến tách khỏi draft và reconcile theo attempt; không thêm lần đọc thứ năm. Lựa chọn storage mới cần approval phù hợp.
- regression_test: xen kẽ sau lần đọc cuối cho draft/final và final/final; assert final, responses, score, revision không rollback; hai tab browser thật, reload/offline/manual/timeout.

### LC19-F02 — BLOCKER — Storage key thiếu examId nên đề khác cùng version xóa final

- affected_files: `index.html:665–673`, `index.html:766`, `index.html:855`, `index.html:1461`, `index.html:1514`. **VÙNG chịu trách nhiệm: glue**. LC18-F02 sửa một phần, chưa đóng.
- evidence/reproduction_steps: A = examId A/version v1, save→submit; kiểm có record `submitted=true` rồi giữ nguyên serialized final. B = examId B/version v1, load→startTimer. Final A biến mất khỏi mọi storage values; harness `different exam same version` FAIL. Guard identity từ chối adopt A đúng, nhưng writer B dùng cùng key và ghi đè A.
- expected/actual: đề/phiên bản/lượt làm độc lập và bảo tồn final; key chỉ gồm normalized version và đôi khi attempt. `v1.0.0` còn bị gộp thành `v1`, attempt mặc định vẫn cố định. Impact: mất bài thi cũ khi mở đề khác, Shared §3/5.
- minimal_fix: key/envelope có identity đầy đủ (examId, versionId, attemptId), encode không va chạm; attemptId ổn định thật và tra cứu/restore đúng identity; migration giữ final cũ và snapshot đề/thứ tự. Không tự gán final cũ vào attempt mới.
- regression_test: hai exam cùng version; v1 và v1.0.0; hai attempt cùng version; A submit→B làm→mở lại A; restart chỉ xóa attempt đã chọn. V2 và hai attempt đặt ID A/B đã PASS trong harness mới, không đủ để đóng toàn finding.

### LC19-F03 — CLOSED / RETESTED — Chặn metadata/schema đề trước khởi tạo

- affected_files: `index.html:534–661`, `index.html:724–745`, `index.html:1292–1296`. **VÙNG chịu trách nhiệm: glue**.
- evidence: unsupported ruleset, unsupported input policy và fetch key quá bốn ký tự đều reject trước render/timer; ba checks LC19 PASS. Đầu phiên cả ba ca còn FAIL trên F8277DF8. Domain schema vẫn không đổi.
- residual gap: web giữ validator/scorer riêng thay vì adapter domain; prototype/accessor/resource-abuse/full schema parity chưa chứng minh. Lỗi khởi tạo hiện chỉ console.warn, chưa error UI. Không mở rộng verdict của ba repro thành chứng nhận mọi schema/input.
- regression_test: giữ ba checks và thêm mọi mã lỗi/count/key/limit/IDs/unknown kind, thông báo tiếng Việt và bảo toàn draft khi đề lỗi.

### LC19-F04 — MAJOR — Restore nhận report rỗng và response II sai kiểu

- affected_files: `index.html:892–916`, đọc `index.html:1348–1356`, render report `index.html:1570–1590`. **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC18-F04.
- evidence/reproduction_steps: ghi record matching exam/version, submitted=true, scoreResult={}, responses={} vào key đang dùng; load nhận `submitted=true` và report rỗng, expected reject/quarantine. Ca độc lập responses={q:{s0:'false'}} cho câu II, load giữ string nguyên vẹn; scorer coi đã trả lời, trình bày truthy string thành “Đúng” dù không phải boolean. Hai checks FAIL. `responses=null` và final `scoreResult=null` nay PASS nhưng chưa validate schema thật.
- expected/actual: chỉ persistent envelope/response/DTO hợp lệ được áp dụng; kiểm hiện tại chỉ chặn null/array ngoài cùng và scoreResult không-object. Impact: khóa bài bằng report hỏng, crash khi report truy cập questionResults, hoặc hiển thị câu trả lời sai dữ liệu; Shared §3/5. Không kết luận mọi stored record bình thường bị lỗi.
- minimal_fix: versioned parser cho toàn envelope, whitelist fields và kind/IDs/boolean/string/time hợp lệ, parse report đầy đủ với identity; giữ/quarantine raw hỏng và recovery UI. Không lặng lẽ xóa responses lỗi rồi báo “Đã lưu cục bộ”.
- regression_test: {}, thiếu questionResults/fractions/counts, DTO lệch identity, nested response sai kiểu/unknown IDs, invalid timestamps, malformed JSON, legacy/quota; không khóa giả và không ghi đè bản cần phục hồi.

### LC19-F05 — CLOSED / RETESTED — Bỏ hành vi phụ thuộc call stack

- affected_files: `index.html:1292–1296`; nhánh `evalmachine.<anonymous>:1:16` cũ đã bị xóa. **VÙNG chịu trách nhiệm: glue**.
- evidence: duplicate statements reject cả direct và JSON.stringify-wrapped caller; check LC19 PASS. Đầu phiên wrapped caller trả malformed result và FAIL. Giữ behavior reject thống nhất; test cũ cần sửa như F07, không khôi phục nhánh đặc cách.

### LC19-F06 — CLOSED cho payload đã tái hiện / RETESTED — Escape nickname và raw answer trong offline HTML

- affected_files: `index.html:519–527`, `index.html:1612–1635`. **VÙNG chịu trách nhiệm: glue**.
- evidence: nickname `</title><script>globalThis.__lc19=1</script><title>` và raw answer `<img src=x onerror="globalThis.__lc19=1">` không còn xuất hiện nguyên văn trong HTML; hai checks LC19 PASS trên 7361F6F1. Trên B971F614 cả hai còn FAIL. Đây là output-string verification, chưa mở file tải bằng browser.
- residual gap: renderMathText vẫn nhận rich content nguyên bản; on-page innerHTML/userAnswer/title/explanation và URL policy chưa được chứng nhận an toàn. Không gọi toàn bộ XSS/privacy PASS từ việc sửa nickname. Cần allowlist/escape đúng context và browser regression nếu mở rộng nguồn đề/import.

### LC19-F07 — MAJOR / CLOSED, RETESTED — Test suite từng đỏ sau validation mới

- affected_files: `test/e2e/demoFlow.test.ts:159`, `:289`, `:360`, `:376`, `:435`; validator caller `index.html:1292–1296`. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: chạy `npm test` trên 7361F6F1 với test SHA3BF14A39: exit1, 192 tests,187 pass,5 fail. Ba fixture hợp lệ theo ý định scoring chỉ gán `{questions:...}` nên thiếu examId/examVersionId/ruleSetId/inputPolicyId, nay bị reject đúng. Hai assertions invalid-key/duplicate còn match message tiếng Việt cũ (`/thiếu answer boolean/`, `/trùng lặp/`) trong khi validator mới trả message khác. Không chứng minh engine chấm sai từ các lỗi setup này.
- expected/actual: valid fixtures đạt schema và negative assertions kiểm đúng contract, gate xanh; hiện assertions scoring không được chạy tới hoặc fail vì regex. Impact: mất gate regression đáng tin, không thể dùng badge 192 PASS cũ cho bytes mới.
- minimal_fix: helper metadata hợp lệ cho mọi fixture custom, negative fixture chỉ sai đúng trường đang kiểm; assert error/type/issues theo contract và ổn định. Không nới validator hoặc thêm stack bypass để làm xanh test.
- retest cuối: worker bổ sung metadata đúng cho fixtures, khôi phục message tiếng Việt tương ứng validator và thêm sáu regression LC18; không khôi phục stack bypass. Test SHA5080F5C7, index SHA04CB070E: npm **198/198 pass**, hai typecheck exit0. **F07 CLOSED**. Đặt valid setup assertion trước behavior quan trọng; regression mới vẫn chưa bắt F01/F02/F04 mở (harness LC19 có counterexample).

### LC19-F08 — MAJOR — Offline report bỏ câu hỏi gốc và không có thời gian bắt đầu/kết thúc đầy đủ

- affected_files: `index.html:1328–1425`, `index.html:1456`, `index.html:1600–1644`. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: đề hợp lệ có content=`LC19_STEM_UNIQUE`, title, key và explanation. `generateOfflineReportHtml(scoreAttemptLocally())` không chứa marker content; check FAIL. Các result chỉ lưu title/answer/explanation, không có stem/options/statement text. Static inspection: report chỉ có submittedAt là locale time-of-day, không render startedAt/date/endedAt đầy đủ, thiếu attempt/exam identity đầy đủ.
- expected/actual: Shared §2 yêu cầu báo cáo offline để xem câu sai, thời gian bắt đầu/kết thúc; file chỉ còn nhãn câu và đáp án/lời giải nên người nhận không thể đọc lại đề/các lựa chọn. Impact: tính năng tải report hiện có chưa đáp ứng mục tiêu xem bài offline.
- minimal_fix: report snapshot gắn phiên bản/attempt, stem + options/statements + lời giải/assets tự chứa cần thiết; full timestamps với timezone và start/end; render an toàn, policy công bố key rõ. Không phụ thuộc đường dẫn tương đối về máy host trong file tải.
- regression_test: marker content, options, statement text, ảnh/công thức và metadata có trong file; tải/mở offline thật, kiểm không cần mạng, so điểm exact và giữ Unicode.

### LC19-F09 — MINOR — Ý II bỏ trống vẫn hiện kết quả “Sai” trong report

- affected_files: `index.html:1353–1357`, `index.html:1586`, `index.html:1616`. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: câu II bốn key=false, responses trống. Scorer cấp câu đúng là unanswered/0; nhưng stDetails chỉ giữ isMatch=false nên mỗi dòng report ghi userVal=“Chưa chọn”, kết quả=“✘ Sai”. Harness `unanswered II is not wrong` FAIL.
- expected/actual: phân biệt wrong và unanswered cho từng ý; hiện cùng nhánh false. Impact: báo cáo diễn giải sai trạng thái, **không sai điểm** trong ca này; Shared §2.
- minimal_fix: lưu perStatement.state (correct/wrong/unanswered/invalid) và render theo state cho cả on-page/offline.
- regression_test: null/thiếu/false/true với key cả true/false, clear answer; ba trạng thái đúng/sai/chưa làm và điểm không đổi.

## checks_run

Windows PowerShell; cwd D:\Cunata; Node24.14.0, npm11.9.0, TypeScript7.0.2 sẵn có, Python3.11.0. Không install. Logs là transcript tool LC19; harness trong chính file scope. Counts test cases khác với fixture/vector counts.

| Lệnh/check | Exit | Kết quả thực |
| --- | ---: | --- |
| git status/log/diff/rev-parse; Get-FileHash | 0 | Delta/snapshot ở trên; worker thay source trong lúc review. |
| npm test — F8277DF8 đầu phiên | 0 | 192 pass/0 fail,34 suites,0 skip/cancel/todo,duration448.9903ms. |
| npx --no-install tsc -p tsconfig.json — đầu phiên | 0 | Không diagnostics. |
| npx --no-install tsc -p tsconfig.web.json — đầu phiên | 0 | Không diagnostics. |
| node scripts/build.js — đầu phiên | 0 | 4 assets, sample8 câu hợp schema; asset verification read-only, không bundler/browser. |
| python -B test/oracle/oracle.py --check | 0 | 11 pass/0 fail/0 skip;1.632 fixtures,5.849 maxima configs,9 negative controls,seed20261114,duration_s1.4531. Oracle self-check, không thay SUT. |
| LC16+17+18 JS blocks qua Node stdin | 1 | 25 tests:15 pass/10 fail,0 skip/cancel/todo,duration173.5963ms trên F8277DF8. Domain oracle/DTO/bounds/nonmutation và web exact fixtures1.632 mỗi bên PASS;10 fail tương ứng LC18. |
| Harness LC19 — B971F614 | 1 | 16 checks:8 pass/8 fail, gồm escaping còn fail ở snapshot trung gian. |
| Harness LC19 — 7361F6F1 | 1 | **16 checks:10 pass/6 fail**; stdout có hash; F01(1),F02(1),F04(2),F08(1),F09(1). |
| npm test — sau validation mới | 1 | **192 tests,187 pass/5 fail**,34 suites,0 skip/cancel/todo,duration360.8165ms; F07. |
| npx --no-install tsc -p tsconfig.json — sau edits | 0 | Không diagnostics; wall1.6118s. |
| npx --no-install tsc -p tsconfig.web.json — sau edits | 0 | Không diagnostics; wall1.6322s; inline JS không được config kiểm kiểu. |
| node scripts/build.js — sau validation mới | 0 | 4 assets; index81.507 bytes ở B971F614; sample8 câu hợp schema, CSS link có. |
| npm test — cuối, index04CB070E/test5080F5C7 | **0** | **198 tests,198 pass/0 fail**,34 suites,0 skip/cancel/todo,duration468.3707ms; F07 CLOSED. |
| npx --no-install tsc -p tsconfig.json — cuối | **0** | Không diagnostics; wall1.7383s. |
| npx --no-install tsc -p tsconfig.web.json — cuối | **0** | Không diagnostics; wall1.7323s. |
| node scripts/build.js — cuối | **0** | 4 assets,index81.987 bytes; sample8 câu hợp schema,CSS link có; read-only asset verification. |
| Harness LC19 cuối — 04CB070E | **1** | **18 checks:12 pass/6 fail**; domain và web1.632 exact fixtures mỗi bên PASS, domain DTO roundtrip PASS; sáu fail cùng F01/F02/F04/F08/F09. Wall0.2904s. |
| Browser/two tabs/mobile/IME/keyboard/AT/axe/Lighthouse/download-file-open | — | **NOT_RUN**; VM stubs không chứng minh browser behavior/render hay script execution. |
| Lint/SAST/full secret-history/dependency-advisory audit | — | **NOT_RUN**; không lint setup, không tuyên bố security PASS. |
| Collector/CORS/receipt/readback; Word/PDF importer | — | **NOT_RUN / NOT_IMPLEMENTED** trong source sản phẩm hiện có. |

Tái lập harness dưới đây (không tạo file test):

```powershell
@'
import fs from 'node:fs';
const md=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8');
await import('data:text/javascript;base64,'+Buffer.from(md.match(/```js\r?\n([\s\S]*?)```/)[1]).toString('base64'));
'@ | node --input-type=module
exit $LASTEXITCODE
```

## Harness LC19 (stdin, không sửa source/test)

Chạy block JavaScript bằng Node ESM từ thư mục D:\Cunata. VM thực thi inline script thật với DOM/storage/timer stub; không phải browser E2E. `showReportView` được thay no-op. Mỗi check dùng assertion theo invariant; không lấy output production làm expected. Hash in ra khóa snapshot của từng lần chạy.

```js
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const html=fs.readFileSync('index.html','utf8');
const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function page(store=new Map()) {
 const nodes=new Map();
 const c=vm.createContext({console:{warn(){}},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'LC19',textContent:'',style:{},classList:{add(){},remove(){}},addEventListener(){}});return nodes.get(id);}},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},setInterval(){return 1;},clearInterval(){},alert(){}});
 vm.runInContext(script,c);vm.runInContext('showReportView=()=>{}',c);
 const run=s=>vm.runInContext(s,c);
 return {c,nodes,store,run,key:()=>run("typeof getStorageKey==='function'?getStorageKey(currentExam,studentState):STORAGE_KEY")};
}
const exam=(version='v1',id='exam')=>({examId:id,examVersionId:version,ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'III',questionVersionId:'q',answerKey:'1',title:'Câu 1',content:'LC19_STEM_UNIQUE',explanation:'LC19_EXPLANATION'}]});
const setExam=(p,ex)=>{p.c.ex=ex;p.run('currentExam=ex');};
function finalRecord(store,id,version,attempt='attempt-sample-01') {
 return [...store.values()].find(raw=>{try{const v=JSON.parse(raw);return v.submitted===true&&v.examId===id&&v.examVersionId===version&&v.attemptId===attempt;}catch{return false;}});
}
let pass=0,fail=0;
async function check(id,fn){try{await fn();pass++;console.log('PASS '+id);}catch(e){fail++;console.log('FAIL '+id+' | '+e.message);}}
await check('race: final survives stale draft at write boundary',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam());setExam(b,exam());b.run('saveLocalState()');
 let once=false;b.c.localStorage.setItem=(k,v)=>{if(!once){once=true;a.run('submitExam()');}store.set(k,v);};
 b.run('saveLocalState()');const c=page(store);setExam(c,exam());c.run('loadLocalState()');assert.equal(c.run('studentState.submitted'),true);
});
await check('identity: v2 preserves v1 final',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam('v1'));a.run('saveLocalState();submitExam()');const original=finalRecord(store,'exam','v1');assert.ok(original,'setup final missing');
 setExam(b,exam('v2'));b.run('loadLocalState();startTimer()');assert.ok([...store.values()].includes(original),'v1 final disappeared');
});
await check('identity: different exam same version preserves final',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam('v1','A'));a.run('saveLocalState();submitExam()');const original=finalRecord(store,'A','v1');assert.ok(original,'setup final missing');
 setExam(b,exam('v1','B'));b.run('loadLocalState();startTimer()');assert.ok([...store.values()].includes(original),'exam A final disappeared');
});
await check('identity: different attempts remain independent',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam());a.run("studentState.attemptId='A';saveLocalState();submitExam()");
 setExam(b,exam());b.run("studentState.attemptId='B';saveLocalState()");assert.equal(b.run('studentState.submitted'),false);
 b.run('submitExam()');assert.ok(finalRecord(store,'exam','v1','A'),'attempt A final lost');assert.ok(finalRecord(store,'exam','v1','B'),'attempt B final missing');
});
for(const [field,value] of [['ruleSetId','standard-unapproved'],['inputPolicyId','unknown']]) await check('schema: '+field,()=>{
 const p=page(),ex=exam();ex[field]=value;setExam(p,ex);assert.throws(()=>p.run('scoreAttemptLocally()'));
});
await check('schema: invalid fetched exam blocked before render/timer',async()=>{
 const p=page(),ex=exam();ex.questions[0].answerKey='12345';p.c.payload=ex;
 p.run("fetch=async()=>({ok:true,json:async()=>payload});rendered=0;started=0;renderExamPane=()=>rendered++;renderPalette=()=>{};startTimer=()=>started++");
 await p.run('initExam()');assert.equal(p.run('rendered+started'),0);
});
await check('restore: null responses rejected',()=>{
 const p=page();setExam(p,exam());p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',responses:null,submitted:false}));
 p.run('loadLocalState()');assert.notEqual(p.run('studentState.responses'),null);
});
await check('restore: final missing report rejected',()=>{
 const p=page();setExam(p,exam());p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',submitted:true,scoreResult:null}));
 p.run('loadLocalState();startTimer()');assert.equal(p.run('studentState.submitted'),false);
});
await check('restore: empty report DTO must not lock attempt',()=>{
 const p=page();setExam(p,exam());p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{},submitted:true,scoreResult:{}}));
 p.run('loadLocalState()');assert.equal(p.run('studentState.submitted'),false);
});
await check('restore: invalid II boolean must not be presented as true',()=>{
 const p=page(),ex=exam();ex.questions=[{kind:'II',questionVersionId:'q',statements:Array.from({length:4},(_,i)=>({statementId:'s'+i,label:String(i),answer:true}))}];setExam(p,ex);
 p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',responses:{q:{s0:'false'}},submitted:false}));p.run('loadLocalState()');
 assert.notEqual(p.run('studentState.responses.q?.s0'),'false');
});
await check('error: duplicate statements reject direct AND wrapped',()=>{
 const p=page(),ex=exam();ex.questions=[{kind:'II',questionVersionId:'q',statements:Array.from({length:4},()=>({statementId:'s',answer:true}))}];setExam(p,ex);
 assert.throws(()=>p.run('scoreAttemptLocally()'));assert.throws(()=>p.run('JSON.stringify(scoreAttemptLocally().questionResults[0])'));
});
await check('HTML: nickname escaped',()=>{
 const p=page();setExam(p,exam());p.c.payload='</title><script>globalThis.__lc19=1</script><title>';p.run('studentState.candidateName=payload');
 assert.equal(p.run('generateOfflineReportHtml(scoreAttemptLocally())').includes(p.c.payload),false);
});
await check('HTML: raw answer escaped in offline report',()=>{
 const p=page();setExam(p,exam());p.c.payload='<img src=x onerror="globalThis.__lc19=1">';p.run('studentState.responses.q=payload');
 assert.equal(p.run('generateOfflineReportHtml(scoreAttemptLocally())').includes(p.c.payload),false);
});
await check('report: question stem retained for offline review',()=>{
 const p=page();setExam(p,exam());assert.ok(p.run('generateOfflineReportHtml(scoreAttemptLocally())').includes('LC19_STEM_UNIQUE'),'question stem absent');
});
await check('report: unanswered II is not wrong',()=>{
 const p=page(),ex=exam();ex.questions=[{kind:'II',questionVersionId:'q',title:'Câu II',statements:Array.from({length:4},(_,i)=>({statementId:'s'+i,label:String(i),answer:false}))}];setExam(p,ex);
 assert.equal(p.run('generateOfflineReportHtml(scoreAttemptLocally())').includes('✘ Sai'),false);
});
const api=await import(new URL('src/domain/index.ts','file:///'+process.cwd().replaceAll('\\','/')+'/'));
const fixtures=fs.readdirSync('test/oracle/fixtures').filter(n=>n.endsWith('.json')).flatMap(n=>JSON.parse(fs.readFileSync('test/oracle/fixtures/'+n,'utf8')).cases);
await check('domain: all 1632 independent fixtures and DTO roundtrip',()=>{
 assert.equal(fixtures.length,1632);
 for(const f of fixtures){const r=api.scoreAttempt(f.exam,f.attempt);assert.equal(api.toFractionString(r.total),f.expected.total,f.id);assert.equal(api.toFractionString(r.maxTotal),f.expected.maxTotal,f.id);
  for(const s of ['I','II','III'])for(const k of ['score','max'])assert.equal(api.toFractionString(r.sections[s][k]),f.expected.sections[s][k],f.id+' '+s+' '+k);
  assert.deepEqual(api.scoreResultFromDTO(JSON.parse(JSON.stringify(api.scoreResultToDTO(r)))),r,f.id);
 }
});
await check('web: all 1632 independent fixtures exact total/max/sections',()=>{
 const p=page();for(const f of fixtures){setExam(p,f.exam);p.c.responses=Object.fromEntries(f.attempt.responses.map(r=>[r.questionVersionId,r.kind==='I'?r.selectedOptionId:r.kind==='III'?r.raw:Object.fromEntries(r.answers.map(a=>[a.statementId,a.value]))]));
  p.run('studentState.responses=responses');const r=p.run('scoreAttemptLocally()');assert.equal(r.totalFraction,f.expected.total,f.id);assert.equal(r.maxTotalFraction,f.expected.maxTotal,f.id);
  for(const s of ['I','II','III'])for(const k of ['score','max'])assert.equal(r[k+s+'Fraction'],f.expected.sections[s][k],f.id+' '+s+' '+k);
 }
});
console.log(JSON.stringify({sha256:createHash('sha256').update(html).digest('hex'),tests:pass+fail,pass,fail}));
process.exitCode=fail?1:0;
```

## coverage_gaps và traceability

| Contract / READINESS | Evidence đã có | Giới hạn còn lại |
| --- | --- | --- |
| Shared §2, B1-AC01–03/T01–09 | Rational/domain unit; exhaustive II1.296; 1.632 fixture domain/web exact totals và từng phần; golden5/15/16,N3=3/7; Unicode/raw cases | Web còn hai implementation; chưa exhaustive schema/status parity. F07 test setup đã sửa và retest CLOSED. Display rounding chưa được owner chốt. |
| Shared §3/5, B1-AC04–05/T11–15 | Stable ID/shuffle unit, DTO roundtrip/bounds/nonmutation; independent persistence repro | F01/F02/F04; web chưa nối PresentationOrder snapshot; không immutable bank/version workflow; chưa browser hai tab thật. |
| B1-AC06/T10/13 | Validation/errors unit; malformed exam và restored state probes; direct/wrapped reject nay thống nhất | Domain DTO parser kiểm shape không phải trusted regrade; chưa full resource limits/accessor/proxy fuzz cho mọi boundary. |
| B1-AC07–08/T16/17 | Commands/exit/count/hash; oracle negative controls | Chưa mutation testing đầy đủ trên SUT/coverage instrumentation, CI/changelog/rollback milestone và owner acceptance. |
| Shared §1/7 UI/UX | Source render/input/CSS/sample assets review; VM input/timer và HTML-string tests | Không browser render/screenshots; chưa mobile/IME Telex/VNI thật/keyboard-only/AT/a11y/contrast/performance. Option div role=radio hiện chỉ click, cần keyboard flow đúng. |
| Shared §2 offline report | Blob download handler và HTML generator có thật; text escaping payload đã PASS | F08/F09; chưa mở file tải offline; rich-text/URL/on-page innerHTML sanitization chưa verified; chưa release-time answer visibility policy. |

Không có service-worker/offline shell cache trong source hiện có; lưu câu trả lời local không chứng minh cold-start offline tải được ứng dụng. Không backend/collector/outbox; public embedded/sample answer keys chỉ cho phép đánh giá demo luyện tập, chưa bảo đảm giấu key/độ tin cậy cho bài kiểm tra. README mô tả “hoàn chỉnh”/offline/E2E không thay acceptance evidence; test/e2e hiện chạy FS/VM. Không nghiên cứu quy định hiện hành hay advisory từ web trong task này, không đề xuất dependency mới hoặc coi custom-v1 là preset THPT đã được duyệt.

## Tính năng lộ trình còn thiếu — ưu tiên

1. **P0 — Bảo toàn dữ liệu bài thi:** sửa F01/F02/F04; identity đủ, attempt thật, immutable exam/question/order snapshot, migration/quarantine/recovery/quota; browser tests đa tab/reload/offline/timeout.
2. **P0 — Gate scoring/regression:** giữ F07 đã sửa fixture/schema và retest; không nới validator; tích hợp domain/API hoặc chứng minh parity bền vững; exact score/max và statuses qua toàn luồng; giữ các ca đã đóng F03/F05/F06.
3. **P0 — Report dùng được offline:** F08/F09; stem/options/statements/images/math, metadata start/end và full identity, safe render/URL policy, policy công bố đáp án; tải/mở file thật offline.
4. **P1 — Student flow:** chọn/nhập đề, duration/lượt làm do giáo viên cấu hình, shuffle question và options độc lập + restore order snapshot, autosubmit/error recovery, honest saved/sync status; keyboard/mobile/IME/a11y và cold-start offline theo giải pháp đã duyệt.
5. **P1 — Teacher builder/ngân hàng:** môn>lớp>chủ đề>bài>mức độ, reuse/version immutable, preview/publish, bật/tắt các phần, export/import/backup/delete; luồng private/local hoặc xác thực được duyệt, không giả bảo mật vai trò no-login.
6. **P1 — Thu kết quả thật:** dịch vụ thuộc owner được duyệt, CORS/receipts/readback thực, bounded retry/backoff/idempotency/outbox queued/sending/server_confirmed/failed; trusted grading/answer release khi kiểm tra cần độ tin cậy.
7. **P2 — Word/PDF importer:** đọc→IR→preview/chỉnh→confirm→xuất; provenance/confidence/flags, paragraph/table/image/OMML/math, PDF text vs scan/OCR uncertainty, không đoán key, file limits/corpus và security tests.
8. **P2 — Mẫu chuẩn và nghiệm thu:** preset registry theo môn/năm/văn bản đã kiểm chứng, tách custom-v1; browser E2E/security/privacy/a11y/performance, CI/evidence/changelog/rollback và owner acceptance. Class/Assignment ở giai đoạn sau.

## NEED_DECISION — không tự chốt

Hai hợp đồng bắt buộc còn giữ các mục mở dưới đây; không thấy quyết định thay thế trong tài liệu bắt buộc. Mỗi mục có 2–3 phương án. Chỉ owner chốt nghiệp vụ/công nghệ; các lỗi có invariant rõ ở trên vẫn phải sửa ngay.

| Mục cần quyết | Phương án |
| --- | --- |
| Grammar III | A giữ charset/length hiện tại; B grammar hẹp với inputPolicyId mới; C grammar theo preset/version đã duyệt. |
| Display rounding | A fraction exact; B owner chọn digits/mode, giữ fraction gốc; C fraction kèm decimal xấp xỉ. Không mặc nhiên duyệt hai chữ số hiện có. |
| Limit/grouping | A duyệt tạm1000 và nhóm I→II→III; B giới hạn/grouping khác, version và regression tương ứng. |
| Persistence/collector/report | A local practice + HTML; B collector được duyệt + HTML; C local practice + PDF sau đánh giá. Implementation candidate không là approval production. |
| Mẫu chuẩn THPT | A hoãn và chỉ custom-v1; B chọn môn/năm/nguồn chính thức để kiểm chứng và duyệt trước triển khai. |

assumptions: NONE mới; giữ các giả thiết tạm M1 có nhãn chưa duyệt. recommended_action: giao glue sửa các finding OPEN và chứng minh fail-before/pass-after; re-review bytes mới, browser verification trước nghiệm thu. tools_research: không giao/cài công cụ mới. privacy_notes: chỉ dữ liệu thử và kết quả kỹ thuật, không đưa hồ sơ riêng/credentials.
