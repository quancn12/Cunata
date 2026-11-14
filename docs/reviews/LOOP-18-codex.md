# LC18 — Kiểm định độc lập sản phẩm, vòng 18

review_id/task_id: LC18; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 + M1-scoring-contract v1.0; risk_level: HIGH.

**verdict: CHANGES_REQUESTED.** Ba BLOCKER và ba MAJOR còn mở (F01–F06); F07 được worker sửa và đã retest CLOSED. Trên snapshot cuối, npm test có **192 pass / 0 fail**; cả hai typecheck PASS. Asset verification PASS. Hai harness LC16/17 đạt 15/15, nhưng harness độc lập LC18 có **0 pass / 10 fail**. Không nghiệm thu toàn sản phẩm. Trạng thái bàn giao NEED_DECISION dành cho các quyết định nghiệp vụ còn mở ở cuối báo cáo; các lỗi có invariant rõ phải sửa ngay, không cần chờ những quyết định đó.

## Snapshot, delta và phạm vi

- base_commit = `9c4cb17980a92cb300471f983cbfab188cf36b4e`; head_commit cuối = `84c425f8f022c57c2611883c0e504dd9b5c2dcce`, branch main. Đầu task review HEAD cộng working tree; tiến trình khác commit round3 trong khi reviewer làm việc. Codex không commit. Source index giữ nguyên SHA qua lần kiểm cuối; test đã được sửa F07 và chạy lại. Không dùng gate của tiến trình khác thay test reviewer.
- LC17 dùng index SHA D62C58DB…; đầu LC18 là 396C55E0…; worker khác tiếp tục sửa trong lúc review. Snapshot kiểm cuối: index.html **F8277DF863392E7B3A877BAA4E61A924908003728C8E4B6E7E05B5FAA60A378A**, 70.869 bytes; test/e2e/demoFlow.test.ts **3BF14A392E5A62474811AB24FD9C923F219E52F545D8E40638D38E02BF15F7AF**. Snapshot test trung gian 5597B1A5… có F07. Delta base→head cuối: index +172/-26, test/e2e +122/-0. Các số không phải diff riêng giữa hai báo cáo.
- Không có thay đổi src/domain, dependency/lockfile/config/build/public/CSS base→head. README được worker cập nhật mô tả report HTML; không thay validation bằng chứng thực chạy. scoreAttempt SHA E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE; serialize SHA 850EBA8D6620BD2B6DE02E034226ECB499E9ED4C0EDB18C2D4099711ADB855A8.
- files_reviewed: toàn bộ module src/domain (model/rational/shortAnswer/validate/judge/shuffle/examMax/scoreAttempt/serialize/index); đường chạy index từ fetch→restore→render/input→timer/save→submit→report/download; assertions unit, acceptance và VM, fixtures/oracle, package/config/build/README/sample assets; LC16/17 và READINESS §6 để đối chiếu. Review theo rủi ro trên toàn sản phẩm hiện có, không tuyên bố kiểm chứng mọi dòng hay browser behavior.
- Scope được giữ: chỉ tạo docs/reviews/LOOP-18-codex.md; không sửa source/test, không cài dependency, không branch/worktree/commit/deploy. Ops/dashboard/workers và các file của worker khác dirty/untracked sẵn; không sửa/revert. Không đọc private prompt của worker khác. Không thấy AGENTS.md ở workspace hoặc D:\\AGENTS.md.

## Retest vòng trước

| Finding LC17 | Trạng thái LC18 |
| --- | --- |
| F01 race sau lần đọc hai | Repro cũ PASS; vẫn OPEN qua LC18-F01 sau lần đọc ba. Thêm một lần đọc không tạo atomicity. |
| F02 final khác đề khóa/đổi điểm | Hai repro cũ PASS; vẫn OPEN qua LC18-F02: final đề cũ bị xóa khi đề mới lưu, attempt cùng đề vẫn lẫn nhau. |
| F03 duplicate II / key III quá dài | Direct-call reject đã PASS; validation chưa đầy đủ, LC18-F03. Có nhánh đổi behavior theo stack, LC18-F05. |
| F04 scoring throw làm submitted=true | CLOSED cho repro cũ: tính score trước đổi state. Chưa error UI/timeout recovery đầy đủ. |
| F05 legacy thiếu identity | CLOSED cho repro thiếu exam/version; restore payload còn không validate, LC18-F04. |

## Findings

### LC18-F01 — BLOCKER — Lần đọc thứ ba vẫn để draft ghi đè final

- affected_files: index.html:649–665; final writer index.html:1321. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: hai VM A/B dùng chung Map storage; B lưu draft. Hook getItem của B: lần đọc **thứ ba** lấy giá trị draft, cho A.submitExam() chạy xong, rồi trả draft cũ. B.saveLocalState() ghi đè final vừa tạo. Test LC18 F01 FAIL: stored.submitted=false, expected=true.
- expected: stale draft không thể thay bản final của cùng attempt. actual: check→write tách rời; revision chỉ tăng trong RAM. Comment “Atomic verify check” không tương ứng primitive atomic.
- impact: mất điểm/report đã chốt, refresh trở lại draft; vi phạm Shared §3.
- minimal_fix: mọi writer draft/final phải dùng cùng transaction/coordination có hiệu lực, hoặc tách final bất biến theo attempt và reconcile rõ. Không thêm getItem thứ tư để che cùng cửa sổ race. Công nghệ storage cụ thể phải theo quyết định được duyệt.
- regression_test: interleave sau **lần đọc cuối**, draft/final và final/final; assert final/responses/revision không bị rollback; thêm hai tab browser thật và reload. VM hiện chỉ chứng minh interleaving của code, chưa chứng minh browser scheduler.

### LC18-F02 — BLOCKER — Một storage key làm mất final đề cũ và trộn các attempt cùng đề

- affected_files: index.html:519–524, 606–612, 621–622, 665, 1297–1304, 1321. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: A làm exam/v1, save và submit trắng. B mở exam/v2, load bị từ chối đúng rồi startTimer()→save. Toàn bộ storage chỉ còn draft v2; chuỗi final v1 không còn ở bất kỳ record nào. F02 preserve FAIL. Ca độc lập: A.attemptId='A' submit; B cùng exam/version nhưng attemptId='B' gọi save → submitted=true và nhận score A, expected false.
- expected: các đề/phiên bản/lượt làm có identity riêng; mở đề mới không phá kết quả trước. actual: STORAGE_KEY chung, guard chỉ so exam/version; attemptId mặc định cố định. Sửa cross-version lock đã biến thành overwrite dữ liệu đề cũ.
- impact: mất kết quả đã lưu, không có phân biệt lượt làm; vi phạm Shared §3/5.
- minimal_fix: envelope/key theo examVersion + attemptId ổn định thật; validate identity tại mọi lookup/write/load, lưu hoặc archive finals, migration có căn cứ; không tự gán attempt cũ vào lượt mới.
- regression_test: v1 final→v2 start→answer→submit→mở lại v1 còn nguyên; hai exam, hai version, hai attempt cùng version độc lập; backward/forward/reload và restart chỉ tác động attempt đã chọn.

### LC18-F03 — BLOCKER — Web bỏ qua ruleset/input policy và khởi tạo đề lỗi

- affected_files: index.html:568–590, 1068–1131; domain validator src/domain/validate.ts:45–67 có rules/policy checks đúng. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: một câu III key='1', raw='1', ruleSetId='standard-unapproved': domain reject, web trả totalFraction='10'. inputPolicyId='unknown' cũng được web nhận. Hai assertions reject FAIL. Fetch trả đề có key='12345'; stub đếm renderExamPane/startTimer; initExam() vẫn gọi cả hai (actual2, expected0).
- expected: chỉ custom-v1/sa-charset-v1 hợp lệ; đề lỗi phải bị chặn trước render/timer; không áp công thức custom lên rules chưa xác nhận. actual: init chỉ kiểm questions không rỗng; scorer tự kiểm vài trường câu hỏi, thiếu metadata/policy/limit và không dùng domain validation.
- impact: chấm theo luật sai cho đề không hỗ trợ, đề lỗi vẫn cho bắt đầu làm; Shared §1/2 và M1 §3/4.3/4.7.
- minimal_fix: validateExamVersion ở boundary cho cả fetch và embedded, trước restore/render/timer; adapter responses vào scoreAttempt dùng domain, tránh hai scorer/validator lệch nhau. Hiển thị lỗi dữ liệu đề và giữ draft; không silently fallback khi đề tải được nhưng sai schema.
- regression_test: unknown/missing rules, input policy, exam/version IDs, >1000 câu, duplicates/count/key/unknown-kind; init→submit fail-closed; giữ exact fixtures 1.632 và statuses, không mở rộng grammar chưa duyệt.

### LC18-F04 — MAJOR — Restore vẫn nhận payload sai kiểu hoặc final không report

- affected_files: index.html:681–703, 712–715; scorer truy cập responses tại index.html:1219. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: record có examId='exam', examVersionId='v1', responses=null; loadLocalState() nhận null, scorer sau đó throw “Cannot read properties of null (reading 'q')”. Record matching identity với submitted=true, scoreResult=null cũng được restore; startTimer bỏ qua, state bị khóa không report. Hai assertions F04 FAIL.
- expected: validate toàn envelope/response/timestamp/final DTO trước áp dụng; dữ liệu lỗi được cô lập với thông báo và đường phục hồi. actual: Object.assign toàn parsed vào state chỉ sau hai identity checks.
- impact: lỗi khôi phục/cản làm bài hoặc trang không kết quả khi gặp legacy/corrupt data; không khẳng định mọi record hiện tại đã hỏng.
- minimal_fix: schema/version và parser cho persistent state, whitelist fields; final phải có report hợp lệ và identity phù hợp; quarantine/migrate có căn cứ, không overwrite bản lỗi trước khi có recovery.
- regression_test: responses null/array/sai kind, deadline invalid, final thiếu/DTO sai, malformed JSON, legacy thiếu identity; UI không crash/khóa giả, còn nguyên bản gốc để khôi phục.

### LC18-F05 — MAJOR — Scorer đổi hợp đồng theo vị trí call stack của Node VM

- affected_files: index.html:1103–1108. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: cùng đề II bốn statementId='s': gọi scoreAttemptLocally() trực tiếp throw; gọi JSON.stringify(scoreAttemptLocally().questionResults[0]) trả {"status":"invalid","message":"duplicate statementId"}. Nhánh so stack.includes('evalmachine.<anonymous>:1:16') return object thiếu total/max/sections thay vì reject. F05 direct assert PASS, wrapped assert FAIL.
- expected: dữ liệu đề lỗi phải có cùng cách từ chối bất kể caller, VM, vị trí cột hay môi trường. actual: hành vi phụ thuộc chuỗi stack và vị trí expression; harness LC17 nguyên bản xanh nhờ caller này không throw trước assertion kế tiếp.
- impact: test evidence không đại diện API nhất quán; caller có thể nhận “result” không đúng shape. Không suy đoán động cơ tác giả; đây là behavior có thể tái hiện.
- minimal_fix: bỏ nhánh stack; luôn reject theo validator/error contract. Nếu harness cũ có statement diagnostic gọi scorer trước assert.throws, sửa harness để bắt lỗi tại đúng điểm, không thay scorer cho một expression riêng.
- regression_test: cùng invalid exam qua direct/wrapped/manual/timeout đều reject nhất quán; không output malformed report; chạy regression trong browser và VM không chứa đặc cách môi trường.

### LC18-F06 — MAJOR — Báo cáo HTML mới chèn nguyên nickname thành markup thực thi

- affected_files: index.html:1438, 1442; download index.html:1454–1467. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: candidateName='</title><script>globalThis.__lc18=1</script><title>'; gọi generateOfflineReportHtml(scoreAttemptLocally()). Chuỗi payload giữ nguyên trong HTML, tạo thẻ script ngoài title; F06 assert không chứa raw payload FAIL. Nickname là input hiện có, không cần importer/bank.
- expected: nickname hiển thị literal, không thể thêm element/script vào report. actual: nối raw candidateName vào title và body. Các userAnswer/title/explanation cũng cần phân biệt text và rich content.
- impact: HTML report tải/chia sẻ có thể chứa script do input cung cấp; cùng lỗi ảnh hưởng tính toàn vẹn tài liệu. Đã xác minh output markup bằng VM; **chưa chạy browser để khẳng định script execution hay mức quyền của file/blob origin**.
- minimal_fix: escape text theo context cho nickname/IDs/raw answers/title; render bằng textContent khi DOM; rich text cần allowlist/URL policy được kiểm chứng. Không coi checkShortAnswer invalid là sanitization: raw invalid vẫn được report.
- regression_test: nickname </title>, <script>, &, quote và raw answer HTML đều được render literal; mở file tải thật offline trong browser, xác minh không script/event handler/network ngoài ý muốn; giữ văn bản tiếng Việt và nội dung toán.

### LC18-F07 — MAJOR / CLOSED, RETESTED — Regression mới từng làm npm test và hai typecheck thất bại

- affected_files: test/e2e/demoFlow.test.ts:497; helper createPageContext trong cùng file trả {c,script,run}. **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: npm test exit1, 191/192 pass, test LC17-F05 crash tại p.store.set vì p.store undefined. Hai lệnh tsc exit1, TS2339 Property 'store' does not exist on type '{ c: Context; script: string; run: (s: string) => unknown; }'.
- expected: regression chạm storage thật của context, test và typecheck chạy được. actual ở SHA5597B1A5…: test chưa tới assertion nghiệp vụ. **Trạng thái cuối: worker tạo Map, truyền vào helper và dùng store.set; SHA3BF14A39…; npm192/192 và cả hai tsc exit0. F07 CLOSED**, không tính là lỗi còn mở.
- impact: gate kiểm định hỏng; không lấy npm186 pass ở snapshot test trước thay kết quả mới.
- minimal_fix: tạo shared Map rồi truyền vào helper và dùng Map đó, hoặc trả store có type đúng từ helper; không bỏ test/ép any để giấu lỗi.
- regression_test: npm test và cả hai tsc exit0; legacy missing-version test phải thực sự kiểm dữ liệu không restore; harness LC18-F04 vẫn cần riêng.

## checks_run

Windows PowerShell; cwd D:\\Cunata; Node24.14.0, npm11.9.0, TypeScript7.0.2 sẵn có, Python3.11.0. Không install. Logs: transcript công cụ LC18; mã harness bên dưới thuộc chính file scope. Counts là test cases, không cộng vectors/fixtures thành số tests.

| Command/check | Exit | Kết quả thật |
| --- | ---: | --- |
| git status/log/diff/rev-parse, SHA256 | 0 | Snapshot/delta ở trên; tiến trình khác commit84c425f trong task; index SHA không đổi. |
| npm test — test SHA9E2D184D… | 0 | 186 pass/0 fail,34 suites,0 skip/cancel/todo; duration374.547ms; chạy lại363.8715ms. **Snapshot cũ**, không thay kết quả cuối. |
| npx --no-install tsc -p tsconfig.json / tsconfig.web.json — test cũ | 0 / 0 | Không diagnostics; có sẵn tsc nên không dùng ghi chú NOT_RUN cũ của M1. |
| npm test — test trung gian SHA5597B1A5… | **1** | **191 pass / 1 fail / 192**,34 suites,0 skip/cancel/todo,duration419.106ms; F07. |
| npx --no-install tsc -p tsconfig.json — test trung gian | **1** | TS2339 test/e2e/demoFlow.test.ts:497:7; wall1.6004s. |
| npx --no-install tsc -p tsconfig.web.json — test trung gian | **1** | Cùng TS2339; wall1.6134s. Config không kiểm inline JS. |
| npm test — test cuối SHA3BF14A39… | **0** | **192 pass/0 fail**,34 suites,0 skip/cancel/todo,duration433.9143ms; F07 CLOSED. |
| npx --no-install tsc -p tsconfig.json — cuối | **0** | Không diagnostics; wall1.6658s. |
| npx --no-install tsc -p tsconfig.web.json — cuối | **0** | Không diagnostics; wall1.6571s. |
| node scripts/build.js — index SHA F8277DF8… | 0 | 4 assets, sample8 câu hợp schema, CSS link có; wall0.1356s. Read-only asset verification, không bundler/browser; không có npm build script. |
| python -B test/oracle/oracle.py --check | 0 | 11 pass/0 fail/0 skip;1.632 fixtures,5.849 maxima configs,9 negative controls,seed20261114,duration_s1.002. Oracle tự kiểm, không phải SUT. |
| LC16+LC17 harness lấy block js rồi import data URL, Node stdin | 0 | 15 pass/0 fail,0 skip/cancel/todo,duration155.5708ms; domain/web1.632 exact total/max/từng phần,domain DTO/bounds/nonmutation; LC17 diagnostic in object malformed theo F05. |
| LC18 harness dưới đây, Node stdin | **1** | **0 pass/10 fail**,0 skip/cancel/todo,duration27.5094ms; chạy lại block trong báo cáo exit1,0/10,duration27.5445ms. F01(1),F02(2),F03(3),F04(2),F05(1),F06(1); expected đều lấy từ contract, không output production làm oracle. |
| Browser/real tabs/mobile/IME/keyboard/AT/axe/Lighthouse/download-file-open | — | **NOT_RUN**: lần này kiểm source + Node VM stub DOM/storage/timer, không browser session. |
| Lint/SAST/full secret-history/dependency advisory audit | — | **NOT_RUN**; không lint script; không suy ra security PASS từ rg/build. |
| Collector/CORS/receipt/readback, importer Word/PDF | — | **NOT_RUN / NOT_IMPLEMENTED** trong source sản phẩm hiện có. |

### Harness LC18 — tái lập không tạo file test

Chạy từ D:\\Cunata bằng PowerShell command sau. Script thực thi inline JS thật; showReportView là no-op. Assertions race kiểm mô hình xen kẽ get/set của hai VM; chưa browser scheduling. F06 kiểm string HTML, chưa thực thi script.

```powershell
@'
import fs from 'node:fs';
const md=fs.readFileSync('docs/reviews/LOOP-18-codex.md','utf8');
const code=md.match(/```js\r?\n([\s\S]*?)```/)[1];
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
'@ | node --input-type=module
exit $LASTEXITCODE
```

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const vm=(await import('node:vm')).default;
const {validateExamVersion}=await import(new URL('src/domain/index.ts','file:///'+process.cwd().replaceAll('\\','/')+'/'));
const script=[...fs.readFileSync('index.html','utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function page(store=new Map()) {
 const nodes=new Map();
 const c=vm.createContext({console:{warn(){}},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'LC18',style:{},classList:{add(){},remove(){}},addEventListener(){}});return nodes.get(id);}},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setInterval(){return 1;},clearInterval(){},alert(){}});
 vm.runInContext(script,c);vm.runInContext('showReportView=()=>{}',c);
 return {c,nodes,store,run:s=>vm.runInContext(s,c)};
}
const exam=(id='v1')=>({examId:'exam',examVersionId:id,ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'III',questionVersionId:'q',answerKey:'1'}]});
const setExam=(p,ex)=>{p.c.ex=ex;p.run('currentExam=ex');};
const key='cunata_exam_attempt_v1';
test('F01 final created after third read must survive stale save',()=>{
 const store=new Map(),a=page(store),b=page(store);b.run('saveLocalState()');let reads=0;
 b.c.localStorage.getItem=k=>{const old=store.get(k)||null;if(++reads===3)a.run('submitExam()');return old;};
 b.run('saveLocalState()');assert.equal(JSON.parse(store.get(key)).submitted,true);
});
test('F02 starting v2 must preserve v1 final',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam('v1'));a.run('saveLocalState();submitExam()');
 const original=store.get(key);setExam(b,exam('v2'));b.run('loadLocalState();startTimer()');
 assert.ok([...store.values()].includes(original),'v1 final disappeared from all storage records');
});
test('F02 a different attempt on the same exam must remain independent',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam());a.run("studentState.attemptId='A';saveLocalState();submitExam()");
 setExam(b,exam());b.run("studentState.attemptId='B';saveLocalState()");
 assert.equal(b.run('studentState.submitted'),false);
});
test('F03 unsupported rules must not be scored with custom formula',()=>{
 const p=page(),ex=exam();ex.ruleSetId='standard-unapproved';assert.equal(validateExamVersion(ex).ok,false);
 setExam(p,ex);p.run("studentState.responses.q='1'");assert.throws(()=>p.run('scoreAttemptLocally()'));
});
test('F03 unsupported input policy must be rejected',()=>{
 const p=page(),ex=exam();ex.inputPolicyId='unknown';assert.equal(validateExamVersion(ex).ok,false);
 setExam(p,ex);assert.throws(()=>p.run('scoreAttemptLocally()'));
});
test('F03 invalid exam must be blocked before rendering and timer',async()=>{
 const p=page(),ex=exam();ex.questions[0].answerKey='12345';p.c.payload=ex;
 p.run("fetch=async()=>({ok:true,json:async()=>payload});rendered=0;started=0;renderExamPane=()=>rendered++;renderPalette=()=>{};startTimer=()=>started++");
 await p.run('initExam()');assert.equal(p.run('rendered+started'),0);
});
test('F04 malformed restored responses must be rejected',()=>{
 const p=page();setExam(p,exam());p.store.set(key,JSON.stringify({examId:'exam',examVersionId:'v1',responses:null,submitted:false}));
 p.run('loadLocalState()');assert.notEqual(p.run('studentState.responses'),null);
});
test('F04 a final without a report must not lock the attempt',()=>{
 const p=page();setExam(p,exam());p.store.set(key,JSON.stringify({examId:'exam',examVersionId:'v1',submitted:true,scoreResult:null}));
 p.run('loadLocalState();startTimer()');assert.equal(p.run('studentState.submitted'),false);
});

test('F05 malformed exam must throw from a wrapped caller as well',()=>{
 const p=page(),ex=exam();ex.questions=[{kind:'II',questionVersionId:'q',statements:Array.from({length:4},()=>({statementId:'s',answer:true}))}];setExam(p,ex);
 assert.throws(()=>p.run('scoreAttemptLocally()'));
 assert.throws(()=>p.run('JSON.stringify(scoreAttemptLocally().questionResults[0])'));
});

test('F06 offline report must escape the candidate nickname',()=>{
 const p=page();setExam(p,exam());
 const payload='</title><script>globalThis.__lc18=1</script><title>';p.c.payload=payload;
 p.run('studentState.candidateName=payload');
 const html=p.run('generateOfflineReportHtml(scoreAttemptLocally())');
 assert.equal(html.includes(payload),false);
});

```

## coverage_gaps và traceability

| Contract/AC | Đã có evidence | Còn thiếu/giới hạn |
| --- | --- | --- |
| Shared§2; B1-AC01–03,T01–09 | Unit/exhaustive II1.296; domain/web1.632 exact fixture scores/max; golden5/15/16,N3=3/7 | Web full schema F03; official display rounding chưa chốt; fixture scores không chứng minh mọi status/report rendering. |
| Shared§3/5; B1-AC04–05,T11–15 | ID/shuffle/permutation unit, DTO/bounds/nonmutation; repro persistence | F01/F02/F04; web chưa nối shuffle/order snapshot; chưa bank immutable versions/migration và browser tabs thật. |
| B1-AC06,T10/13 | Validator/DTO negative unit, invalid exam controls | Chưa resource-abuse/getter fuzz toàn bộ; DTO parse không là trusted grading; F05 đổi behavior theo stack. |
| B1-AC07–08,T16/17 | Commands/exit/count/SHA thật; oracle negative controls | F07 đã đóng; chưa mutation đầy đủ trên SUT, coverage instrument/CI/owner acceptance/rollback milestone. |
| Shared§1/7 UI/security | Static render/input/report và HTML output probe | F06; raw innerHTML/renderMathText sinks còn cần escape/URL policy; chưa browser mobile/IME/a11y/performance. |
| Shared§2/3 offline report | Có generateOfflineReportHtml + Blob download handler mới | Chưa file tải/mở thật, thiếu startedAt/endedAt đầy đủ, original question stem/assets; II chưa làm vẫn trình bày kết quả ý là Sai do chỉ isMatch boolean. Không chứng nhận report hoàn chỉnh. |

README nói web hoàn chỉnh/offline hoặc E2E không thay evidence: test/e2e hiện là FS/VM. Không service-worker/offline shell cache; đã lưu local không đồng nghĩa cold-start offline tải được app. Không collector/trusted backend; keys public trong embedded/sample chỉ phù hợp demo luyện tập, chưa bảo đảm bài kiểm tra cần giấu key. Không xác minh quy định THPT hay advisory từ web trong lần review này; không đưa khuyến nghị dependency mới hoặc khẳng định quy định hiện hành.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0: bảo toàn attempt/final** — F01/F02/F04; identity thật, snapshot phiên bản và thứ tự, atomicity cho mọi writer, migration/quarantine/quota/recovery; browser hai tab/reload/timeout.
2. **P0: scoring và gate đáng tin** — F03/F05; giữ regression F07 đã đóng; domain adapter/validation sớm, deterministic error handling, test không đặc cách call stack, npm/typecheck sạch, exact fractions và regression mới.
3. **P0: xuất HTML an toàn** — F06; escape/sanitize đúng context, kiểm file tải mở offline, policy công bố key; bổ sung stem/explanations/assets và metadata start/end/version đầy đủ.
4. **P1: student flow hoàn thiện** — chọn/nhập đề; cấu hình thời lượng/lượt làm/trộn câu và lựa chọn độc lập/lời giải; IME/mobile/keyboard; autosubmit và honest saved/error status được browser kiểm chứng.
5. **P1: teacher builder/ngân hàng** — môn>lớp>chủ đề>bài>mức độ, reuse/version immutable, preview/publish, export/import/backup/delete; private/local hoặc auth theo quyết định, không giả bảo mật no-login.
6. **P1: thu kết quả thật** — dịch vụ owner quản lý đã duyệt; CORS/receipt/readback/dedupe thực tế, outbox queued/sending/server_confirmed/failed, bounded retry/backoff, trusted grading khi cần bảo mật.
7. **P2: Word/PDF importer** — IR, preview/chỉnh/xác nhận, rich text/bảng/ảnh/OMML/math, PDF text vs scan/OCR uncertainty, provenance, không đoán key, limits/corpus tests.
8. **P2: mẫu chuẩn và nghiệm thu** — registry môn/năm/nguồn quy định được kiểm chứng và duyệt; không coi custom là preset chuẩn; browser E2E/a11y/performance/privacy, CI/changelog/rollback và owner acceptance. Class/Assignment giai đoạn sau.

## NEED_DECISION — không tự chốt

Hai hợp đồng còn ghi các quyết định mở; không thấy quyết định thay thế trong tài liệu bắt buộc. Mỗi dòng có 2–3 phương án để owner lựa chọn. Không chặn sửa các invariant trong F01–F06; giữ F07 đã đóng.

| Quyết định | Phương án |
| --- | --- |
| Grammar III | A giữ charset/length hiện tại; B grammar hẹp với policy version mới; C grammar theo preset/version được duyệt. |
| Display | A fraction exact; B số chữ số/mode thập phân owner chọn, lưu fraction nguồn; C fraction kèm decimal xấp xỉ. Không mặc nhiên duyệt2digits web hiện dùng. |
| Limit/grouping | A duyệt tạm1000 và nhóm I→II→III; B giới hạn/grouping khác có version/tests. |
| Persistence/collector/report | A local practice + HTML; B collector được duyệt + HTML; C local practice + PDF sau đánh giá. HTML mới chỉ là implementation candidate, chưa là approval công nghệ hay production. |
| Mẫu chuẩn THPT | A hoãn, chỉ custom-v1; B chọn môn/năm và nguồn quy định để kiểm chứng/duyệt trước triển khai. |

assumptions: NONE mới; giữ các giả thiết tạm M1 có nhãn chưa duyệt. recommended_action: giao glue sửa F01–F06, giữ regression F07 đã đóng; yêu cầu fail-before/pass-after bằng harness độc lập, kiểm browser trước nghiệm thu; re-review bytes mới nếu worker tiếp tục sửa. tools_research: không giao/cài công cụ mới. privacy_notes: dữ liệu thử và kết quả kỹ thuật, không trích hồ sơ riêng.

