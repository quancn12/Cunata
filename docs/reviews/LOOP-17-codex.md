# LC17 — Kiểm định độc lập sản phẩm, vòng 17

review_id/task_id: LC17; reviewer: Codex; requirements_version: Shared Product Contract v2.0 và M1-scoring-contract v1.0; risk_level: HIGH; reviewed_at: 2026-11-14.

**verdict: CHANGES_REQUESTED.** Còn 3 BLOCKER và 2 MAJOR được tái hiện bằng Node VM. Bộ test repository 186/186, hai typecheck và asset verification đều PASS; harness LC16 8/8 PASS, gồm domain/web đối chiếu 1.632 fixtures. Tuy nhiên 7 assertions bổ sung về concurrency, identity, validation và submit failure đều FAIL. READY_FOR_REVIEW chỉ có nghĩa báo cáo sẵn sàng, không phải nghiệm thu sản phẩm. Không có sửa source hoặc triển khai trong task này.

## Snapshot và phạm vi

- base_commit = `f2447ae787272808f84d9d894cdded8e7cff3d2c`; head_commit cuối = `9c4cb17980a92cb300471f983cbfab188cf36b4e`; branch `main`. Khi bắt đầu, HEAD vẫn là base và đối tượng review là HEAD **cộng working tree**. Trong lúc kiểm định, tiến trình điều phối khác commit round2 thành 9c4cb17. Codex không commit. Hash web/test/CSS ở lần kiểm cuối giữ nguyên như khi chạy checks, nên bằng chứng vẫn áp dụng; không suy luận gate của tiến trình khác thay cho test của reviewer.
- Delta tracked so với base lúc bắt đầu: index.html +607/-288; styles/style.css +16/-0; test/e2e/demoFlow.test.ts +278/-0. Các con số này không phải diff riêng LC16→LC17. Hash LC16 và source hiện tại xác nhận web/test đã đổi; scoreAttempt/serialize giữ nguyên. Diff base→head cuối có thêm ambient-vm.d.ts +7 dòng; không đổi src/domain, package/lockfile, configs, scripts/build.js hoặc public assets. Cuối task web/test/CSS đã sạch so với HEAD mới, còn ops/workers dirty và báo cáo này untracked.
- Working tree có ops/dashboard/workers và nhiều review/prompt/result untracked của người khác. Không sửa, xóa hoặc revert chúng. Không đọc prompt riêng của worker khác; không dùng chúng làm evidence sản phẩm.
- files_reviewed: model, rational, shortAnswer, validate, judge, shuffle, examMax, scoreAttempt, serialize, index API trong src/domain; index.html từ load→input→save/restore→timer→submit→report; assertions unit/acceptance/VM và fixtures/oracle; package/config/build, sample JSON/SVG, CSS diff/print; LC16 và READINESS §6 để truy vết. Đây là review toàn đường chạy sản phẩm hiện có theo rủi ro, không tuyên bố mọi dòng hoặc mọi hành vi browser đã được kiểm chứng. Dashboard/ops là công cụ điều phối, không được chứng nhận như ứng dụng thi.
- Đã đọc đầy đủ hai hợp đồng bắt buộc và skill được chỉ định. Không thấy AGENTS.md trong workspace qua rg, hoặc D:\AGENTS.md. Chỉ tạo `docs/reviews/LOOP-17-codex.md`; không install/dependency/branch/worktree/commit/deploy.

| File | SHA256 snapshot LC17 |
| --- | --- |
| index.html | D62C58DBE16E4AC334382ECC6A2E5DFC50B8B5B59B8DF64EFF8E9355817AC2AA |
| test/e2e/demoFlow.test.ts | 9E2D184D4CFFDF9E15BF67B60D8397FC5E773683B9CDEA399F08C36E6EF4E549 |
| styles/style.css | ADFCFCD0AB34555FA3DE9098B01E1CF4CC329DFB86799556429612214E3B44E6 |
| src/domain/scoreAttempt.ts | E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE |
| src/domain/serialize.ts | 850EBA8D6620BD2B6DE02E034226ECB499E9ED4C0EDB18C2D4099711ADB855A8 |

## Retest LC16 và delta

| LC16 | Trạng thái LC17 | Bằng chứng/giới hạn |
| --- | --- | --- |
| F01 typecheck | CLOSED / RETESTED | Cả hai tsc exit0; ambient-vm.d.ts đã tồn tại. |
| F02 save badge | CLOSED cho repro write failure | Failed latest write đổi badge, CSS sync-error đã bổ sung. VM và npm regression PASS; chưa browser quota thật. |
| F03 final race | PARTIAL / OPEN → LC17-F01 | Thêm getItem lần hai đóng interleaving cũ, nhưng không atomic; chuyển interleaving sang lần đọc hai vẫn mất final. |
| F04 invalid key | PARTIAL / OPEN → LC17-F03/F04 | Missing boolean key nay throw; chưa dùng full validator, ID trùng/key sai vẫn chấm; exception nộp bài để state final dở dang. |
| F05 version isolation | PARTIAL / OPEN → LC17-F02/F05 | load reject khi cả hai version khác nhau; save/submit vẫn nhận final khác đề; legacy thiếu identity vẫn restore. |
| F06 null II | CLOSED cho nullable repro | Null thành unanswered, không hiện Sai; suite và harness cũ PASS. Input khác kiểu vẫn cần boundary validation. |
| F07 first deadline | CLOSED cho repro refresh đầu | startTimer ghi ngay khi first init; clock1000→reload2000 giữ deadline. Không chứng nhận chống sửa giờ máy. |

## Findings

### LC17-F01 — BLOCKER — Double-check storage vẫn cho tab cũ xóa final

- affected_files: `index.html:619–630`; submit writer `index.html:1224–1246`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence: save dùng getItem→check→setItem; revision chỉ tăng trong RAM, không có conditional atomic write. Test cũ chỉ interleave ở getItem đầu nên PASS sau khi thêm lần đọc hai.
- reproduction_steps: tạo hai VM A/B dùng chung Map storage; B.saveLocalState(); hook getItem của B để lần đọc **thứ hai** lấy bản draft rồi cho A.submitExam() trước khi trả draft; gọi B.saveLocalState(). Harness F01 bên dưới FAIL: stored.submitted=false, expected=true.
- expected: draft/revision cũ không thay bản final, kể cả khi final xuất hiện sau lần đọc cuối. actual: B.setItem ghi draft đè final A vừa lưu.
- impact: mất report/điểm đã chốt, refresh lại thành chưa nộp; vi phạm chống stale overwrite của Shared §3. Đây là interleaving có kiểm soát của code thật, chưa phải browser scheduling test.
- minimal_fix: dùng primitive phối hợp/transaction thực sự cho mọi draft và final writer, hoặc tách final bất biến theo attempt identity và không cho draft ghi đè nó; kiểm version/revision trong cùng cơ chế. Chỉ thêm getItem lần ba vẫn còn cửa sổ lỗi. Chọn công nghệ persistence cần theo phương án được duyệt.
- regression_test: giữ repro cũ, thêm interleave sau lần đọc cuối, draft-vs-final và final-vs-final; test hai tab browser thật, reload vẫn cùng final và không lost update. Mỗi writer phải tham gia cùng cơ chế.

### LC17-F02 — BLOCKER — Final của đề cũ khóa và thay điểm đề mới

- affected_files: `index.html:511–516`, `593–601`, `619–627`, `1226–1234`; load guard `646–661`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: A gắn exam/v1 (một câu III key='1'), save rồi submit bài trắng → final0/10. B gắn cùng exam/v2, loadLocalState() reject version đúng; studentState.submitted lúc này false. Nhưng B.startTimer()→saveLocalState() đọc final toàn cục và đặt submitted=true, copy report v1. Repro thứ hai: sau reject load, B.responses.q='1'; B.submitExam() trả totalFraction='0' thay vì '10'. Hai assertions F02 FAIL.
- expected: attempt/v2 độc lập, không nhận final/score v1; final lookup và writes phải kiểm đầy đủ identity. actual: save và submit chỉ kiểm submitted, bỏ qua exam/version/attempt.
- impact: không làm được đề mới hoặc thấy điểm đề khác. Load guard riêng lẻ không bảo vệ end-to-end. attemptId vẫn hardcode 'attempt-sample-01', storage key chung mọi đề.
- minimal_fix: envelope/key theo examVersionId + attemptId thật, schema/version và snapshot; validate identity tại load/save/submit/final lookup, không chỉ load; giữ hoặc archive final cũ, không xóa để che lỗi.
- regression_test: v1 final→v2 load→startTimer→answer→submit; hai exam khác nhau và hai attempt cùng version; final v1 không khóa/đổi report v2; dữ liệu cũ vẫn truy xuất đúng.

### LC17-F03 — BLOCKER — Web vẫn chấm đề sai schema như hợp lệ

- affected_files: `index.html:562–568`, `1033–1065`, `1111–1128`; validator đúng sẵn có `src/domain/validate.ts:167–225`.
- **VÙNG chịu trách nhiệm: glue** (không phải lỗi validator domain).
- evidence/reproduction_steps: đề custom-v1 có một câu II gồm bốn entry đều statementId='s', answer=true. Domain validateExamVersion reject ID_DUPLICATE. Web scoreAttemptLocally với responses={q:{s:true}} vẫn trả correctCount4/status full/pointsFraction='1'. Một lựa chọn được đếm bốn lần. Test F03 thứ hai: III answerKey='12345', raw='1234'; domain reject, web không throw mà chấm sai0/10 như lỗi học sinh. Cả hai assertions reject FAIL.
- expected: dữ liệu đề lỗi bị chặn trước render/timer và scorer, không sinh điểm học sinh; dùng toàn bộ contract validation. actual: các guard mới chỉ bắt missing key/một số shape, không bắt trùng ID, key III invalid, rules/policy/count đầy đủ. Fetch chỉ yêu cầu questions không rỗng.
- impact: sai điểm và integrity mapping; đề lỗi biến thành điểm học sinh. Không khẳng định sample hiện có lỗi: sample hợp schema và oracle điểm vẫn khớp.
- minimal_fix: validateExamVersion ở boundary fetch/embedded trước khởi tạo; adapter response→domain scoreAttempt thay scorer riêng. Hiển thị lỗi đề riêng, giữ raw/fractions. Không vá riêng duplicate ID rồi tiếp tục thiếu các nhánh schema khác.
- regression_test: init→render→submit với duplicate question/statement/option IDs, I key ngoài options/sai count, III key rỗng/>4/bad charset, unknown kind/rules/policy, empty/overlimit/null question; fail-closed với mã lỗi, không bắt đầu attempt hợp lệ; giữ 1.632 fixture scores/max và các statuses.

### LC17-F04 — MAJOR — Scoring exception để attempt ở trạng thái submitted nhưng không có kết quả

- affected_files: `index.html:1239–1241`; input guard `1033–1065`; button guard `997` và timer `679`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: câu II đủ bốn statementId nhưng thiếu boolean answer (trường hợp guard mới đã reject); gọi submitExam(). Hàm throw như dự kiến nhưng sau đó studentState.submitted=true, scoreResult=null; timer đã clear. Harness F04 assertion submitted=false FAIL.
- expected: lỗi dữ liệu được trình bày rõ, không chốt bài thành công; giữ draft/recovery, không khóa UI giả final. actual: đổi state/stop timer trước khi scoring thành công, exception không được xử lý ở handler nộp.
- impact: giao diện ngừng nhận đáp án/nút submit bỏ qua, không report, không thông báo nghiệp vụ; lỗi đề được phát hiện nhưng để lại attempt dở dang. Không gọi đây là mất draft đã persist trong repro.
- minimal_fix: validate sớm theo F03, tính kết quả trước khi chuyển state; xử lý exception bằng error state có feedback và giữ draft, tách invalid-exam khỏi submitted; persistence failure vẫn phải thể hiện đúng durability.
- regression_test: inject scoring exception qua manual submit và timeout, kiểm draft/responses còn nguyên, không success/final giả, feedback rõ; recover/retry sau xử lý lỗi theo chính sách; không double-final khi scoring thành công.

### LC17-F05 — MAJOR — Restore nhận record thiếu identity và schema

- affected_files: `index.html:650–661`.
- **VÙNG chịu trách nhiệm: glue**.
- evidence/reproduction_steps: currentExam có examId='exam', examVersionId='v1'; storage chứa JSON {responses:{q:'2'},submitted:false}, không exam/version/schema. loadLocalState() vẫn gán responses.q='2'. Harness F05 expected undefined FAIL. Điều kiện reject chỉ chạy khi parsed.examVersionId/parsed.examId truthy.
- expected: record không xác định phiên bản không được tự gắn vào đề hiện tại; legacy phải migrate có căn cứ hoặc tách/cảnh báo, bảo toàn dữ liệu cũ. actual: Object.assign object bất kỳ vào toàn bộ studentState.
- impact: trộn câu trả lời/deadline/final không rõ nguồn sau đổi đề/legacy/corrupt state; response sai kiểu có thể làm render lỗi. Vùng tác động chính là compatibility và restore boundary; không suy luận rằng mọi record người dùng hiện đã corrupt.
- minimal_fix: schema envelope và validation đầy đủ cho identity/response/timestamp/final DTO; migration rõ ràng cho dữ liệu cũ, không tự đoán version, không overwrite record chưa xác định. Gộp thực hiện với F02 nhưng giữ regression riêng.
- regression_test: thiếu/null/rỗng/sai kiểu identity; responses=null/array; final thiếu scoreResult; deadline invalid; JSON corrupt và legacy record; reject/quarantine có feedback, không crash hoặc mất record.

## checks_run

Environment: Windows PowerShell, D:\Cunata, Node v24.14.0, npm11.9.0, TypeScript7.0.2 có sẵn, Python3.11.0. Không cài gì. Log artifact là transcript tool của LC17; harness mới nằm ngay dưới báo cáo để tái lập, không tạo test/log ngoài scope. Counts node:test không cộng 1.632 fixtures hoặc 1.296 vectors thành test cases.

| Command/check | Exit | Kết quả thực tế |
| --- | ---: | --- |
| git status/branch/rev-parse/log/diff, SHA256 | 0 | Snapshot/delta như trên; workspace dirty sẵn. rg không thấy AGENTS.md; không đọc private prompts khác. |
| `npm test` | 0 | **186 pass / 0 fail**, 34 suites, 0 skip/cancel/todo, duration455.3769ms. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics, wall1.9317s. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics, wall1.8900s. Không kiểm JS inline của index.html. |
| `node scripts/build.js` | 0 | 4 assets tồn tại, sample8 câu hợp domain schema, CSS link có. Đây là read-only asset verification, không bundle/compile/browser; package không có npm build script. |
| `python -B test/oracle/oracle.py --check` | 0 | **11 pass / 0 fail**, 1.632 fixtures, maxima sweep5.849 configs, 9 negative controls, seed20261114, duration_s1.4057. Oracle tự kiểm, không thay SUT. |
| LC16 harness chạy lại từ block js trong báo cáo LC16 | 0 | **8 pass / 0 fail**, duration138.686ms. Domain1.632 fixtures total/max/từng phần, DTO JSON roundtrip/bounds/nonmutation; web1.632 total/max/từng phần; sáu repro LC16 đều PASS hiện tại. |
| LC17 Node stdin harness dưới đây | 1 | **0 pass / 7 fail**, duration24.3926ms. Fail đúng invariants ở F01–F05; không bỏ qua vì suite repository xanh. |
| Harness trích lại trực tiếp từ file LC17, `node --input-type=module --test-reporter=dot` | 1 | Lặp lại đủ7 dấu X, cùng7 assertion failures; không có import/syntax failure. Hash web/test/CSS kiểm lại không đổi; HEAD đã được tiến trình khác commit thành9c4cb17. |
| rg sinks/network/I/O và đọc source | 0 | Domain không thấy Math.random/Date.now/I/O; web fetch sample, localStorage, innerHTML/report sinks. Đây không phải security certification. |
| Browser/mobile/IME/keyboard/AT/axe/Lighthouse/screenshots/traces | — | **NOT_RUN**: kiểm định lần này static + Node VM stub DOM/timer/storage; không ghi browser E2E PASS. |
| Lint/SAST/dependency advisory audit/secret-history scan chuyên biệt | — | **NOT_RUN**; chưa có lint script, không install/tooling mới. |
| Google collector/CORS/readback, DOCX/PDF import integration | — | **NOT_RUN / NOT_IMPLEMENTED** trong source ứng dụng hiện có. |

### Harness LC17 — chạy không tạo file test

VM chạy script inline thật, stub DOM/storage/timer và tắt render report. Race là mô phỏng interleaving giữa các thao tác storage; chưa xác minh browser scheduler. Domain validator dùng như negative control cho dữ liệu đề sai; expected score/identity là literal theo contract.

```js
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const {validateExamVersion}=await import(new URL('src/domain/index.ts','file:///'+process.cwd().replaceAll('\\','/')+'/'));
const script=[...fs.readFileSync('index.html','utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
function page(store=new Map()) {
 const nodes=new Map();
 const c=vm.createContext({console:{warn(){}},document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'LC17',style:{},classList:{add(){},remove(){}},addEventListener(){}});return nodes.get(id);}},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},setInterval(){return 1;},clearInterval(){},alert(){}});
 vm.runInContext(script,c);vm.runInContext('showReportView=()=>{}',c);
 return {c,nodes,store,run:s=>vm.runInContext(s,c)};
}
const exam=(id='v1')=>({examId:'exam',examVersionId:id,ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'III',questionVersionId:'q',answerKey:'1'}]});
const setExam=(p,ex)=>{p.c.ex=ex;p.run('currentExam=ex');};
test('F01 race at second read must preserve final',()=>{
 const store=new Map(),a=page(store),b=page(store);b.run('saveLocalState()');let reads=0;
 b.c.localStorage.getItem=k=>{const old=store.get(k)||null;if(++reads===2)a.run('submitExam()');return old;};
 b.run('saveLocalState()');assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
});
test('F02 foreign final must not end current exam',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam('v1'));a.run('saveLocalState();submitExam()');
 setExam(b,exam('v2'));b.run('loadLocalState()');assert.equal(b.run('studentState.submitted'),false);
 b.run('startTimer()');assert.equal(b.run('studentState.submitted'),false);
});
test('F02 foreign final must not replace current score',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam('v1'));a.run('saveLocalState();submitExam()');
 setExam(b,exam('v2'));b.run("loadLocalState();studentState.responses.q='1';submitExam()");
 assert.equal(b.run('studentState.scoreResult.totalFraction'),'10');
});
test('F03 duplicate II statement IDs must be rejected',()=>{
 const p=page();const ex=exam();ex.questions=[{kind:'II',questionVersionId:'q',statements:Array.from({length:4},()=>({statementId:'s',answer:true}))}];
 assert.equal(validateExamVersion(ex).ok,false);setExam(p,ex);p.run('studentState.responses={q:{s:true}}');
 console.log('duplicate II actual',p.run('JSON.stringify(scoreAttemptLocally().questionResults[0])'));
 assert.throws(()=>p.run('scoreAttemptLocally()'));
});
test('F03 invalid III key must be exam error',()=>{
 const p=page(),ex=exam();ex.questions[0].answerKey='12345';assert.equal(validateExamVersion(ex).ok,false);setExam(p,ex);
 p.run("studentState.responses.q='1234'");assert.throws(()=>p.run('scoreAttemptLocally()'));
});
test('F04 scoring exception must not finalize draft',()=>{
 const p=page(),ex=exam();ex.questions=[{kind:'II',questionVersionId:'q',statements:['a','b','c','d'].map(statementId=>({statementId}))}];setExam(p,ex);
 assert.throws(()=>p.run('submitExam()'));assert.equal(p.run('studentState.submitted'),false);
});
test('F05 legacy missing version must not restore into current exam',()=>{
 const p=page();setExam(p,exam());p.store.set('cunata_exam_attempt_v1',JSON.stringify({responses:{q:'2'},submitted:false}));p.run('loadLocalState()');assert.equal(p.run('studentState.responses.q'),undefined);
});
```

```powershell
@'
import fs from 'node:fs';
const md=fs.readFileSync('docs/reviews/LOOP-17-codex.md','utf8');
const code=md.match(/```js\r?\n([\s\S]*?)```/)[1];
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
'@ | node --input-type=module
exit $LASTEXITCODE
```

## coverage_gaps và traceability

| Contract / AC | Bằng chứng | Phần chưa chứng minh |
| --- | --- | --- |
| Shared§2; B1-AC01/02/03; T01–09 | npm186, exhaustive II1.296 vectors trong unit; domain/web1.632 exact scores/max; rational/DTO roundtrip | Web F03 còn vi phạm schema; fixtures score-only không chứng minh tất cả report statuses; chưa official display policy. |
| Shared§3/5; B1-AC04/05; T11–15 | Unit shuffle/IDs/version tests; domain fixture nonmutation/bounds | UI chưa nối shuffle/seed snapshot; persistence F01/F02/F05; chưa bank immutable versions hoặc browser multiple tabs. |
| B1-AC06; T10/13 | Unit validator/schema/DTO negatives; F03/F04 repro mới | Không fuzz toàn bộ Proxy/getters thay đổi/resource abuse; DTO structural parse không chứng minh trusted grading. |
| B1-AC07/08; T16/17 | Commands/counts/exit/snapshot thật, independent oracle và 9 negative controls | Oracle negative controls không là mutation toàn SUT; chưa coverage instrument/lint/CI/owner acceptance/rollback nghiệm thu. |
| Shared§3 offline/timer | Old VM regressions PASS, new interleaving và identity failures | Chưa browser quota/storage lock/actual offline cold-start/download; chưa service worker/offline shell cache. |
| Shared§1/7 UI/security | CSS error state, semantic/static/input/report code đã đọc | Chưa mobile/IME thật, keyboard/AT/contrast/performance. I options là div role=radio, không tabindex/keydown; cần browser acceptance. |

HTML rendering vẫn nội suy raw content/userAnswer vào innerHTML (`index.html:528–551`, `1315–1322`); cần kiểm escaping/URL policy và browser XSS trước khi nối bank/importer hoặc nhận dữ liệu ngoài. Chưa chạy exploit browser nên không gắn finding exploit đã xác minh. Native maxlength4, paste overflow, entity trong value và IME composition chưa có browser evidence. Report mới có submittedAt dạng giờ, chưa đủ start/end/version trong report; tải hiện chỉ window.print, chưa kiểm deliverable HTML/PDF offline. Các test tên E2E hiện dùng FS/VM, không phải browser E2E.

Không có backend/collector xác nhận điểm đáng tin; key ở sample/embedded public, phù hợp phạm vi demo luyện tập, chưa đủ chế độ kiểm tra cần giấu key. Không suy ra secrets an toàn từ rg hoặc build. Không truy vấn advisory/web mới vì review này không đưa khuyến nghị dependency hay đánh giá quy định THPT hiện hành; mẫu chuẩn vẫn chờ nguồn/duyệt riêng.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0 — scoring web và boundary**: F03/F04; dùng domain validation/scoring; giữ exact raw/fractions, error state và regression init→submit thật. Tiếp tục test max5/15/16, N3=3/7, II nullable và report statuses.
2. **P0 — attempt bền và độc lập**: F01/F02/F05; stable IDs, immutable exam/order snapshot, schema/migration, atomic final, quota/error recovery, identity trên mọi đường đọc/ghi; browser hai tab/timeout/reload tests.
3. **P1 — student flow/report**: chọn/nhập đề, nickname, teacher-config time/attempts/shuffle hai cờ/lời giải theo giới hạn no-login; report đầy đủ start/end/version/câu sai; tải HTML/PDF offline theo phương án được duyệt. Nút in chưa thay bằng chứng download hoàn chỉnh.
4. **P1 — builder/ngân hàng**: môn/lớp/chủ đề/bài/mức độ, tái dùng câu, QuestionVersion/ExamVersion immutable, preview/publish, backup/export/import/delete; local/private authoring hoặc quyền xác thực theo quyết định, không URL admin bí mật.
5. **P1 — thu kết quả thật**: dịch vụ owner quản lý được duyệt, CORS/receipt/readback thực tế, queued/sending/server_confirmed/failed chính xác; outbox/retry/backoff/dedupe; trusted grading cho kiểm tra bảo mật.
6. **P2 — Word/PDF importer**: IR/preview/chỉnh/xác nhận, rich text/bảng/hình/OMML/math, OCR uncertainty, provenance/không đoán key, resource limits và corpus tests. Chưa implementation.
7. **P2 — chuẩn THPT**: registry môn/năm/nguồn quy định được kiểm chứng và owner duyệt; không coi custom-v1 là chuẩn chính thức.
8. **P2 — polish/nghiệm thu**: mobile/IME/keyboard/a11y/math/security/privacy/performance, hướng dẫn xóa/xuất/backup; browser E2E/CI/changelog/rollback/owner acceptance. Class/Assignment thuộc giai đoạn sau.

## NEED_DECISION — phần chưa chốt, không tự quyết

Không có bằng chứng quyết định thay thế trong hai tài liệu bắt buộc. Các sửa F01–F05 có invariant rõ, không cần chờ các quyết định sau để bắt đầu sửa.

| Quyết định | Phương án trình owner | Phần phụ thuộc |
| --- | --- | --- |
| Grammar III | A giữ charset/length hiện tại; B grammar hẹp và policy version mới; C grammar theo preset/version duyệt | Validator mở rộng; không đổi nghĩa bài cũ. |
| Display rounding | A fraction exact; B decimal digits/mode được duyệt và lưu fraction nguồn; C fraction kèm decimal xấp xỉ | Renderer/report chính thức. Web đang tự chọn2digits, chưa có approval evidence. |
| Limit/grouping | A duyệt tạm1000 và nhóm I→II→III; B limit/grouping khác kèm version/tests | Chính sách chính thức, không tự mở rộng. |
| Persistence/collector/report | A local practice + HTML; B collector được duyệt + HTML; C local practice + PDF sau đánh giá | Công nghệ, quyền/retention/chi phí/production. Atomicity vẫn là yêu cầu với mọi phương án. |

assumptions: NONE mới; các giả thiết tạm của contract vẫn chờ duyệt. recommended_action: giao glue sửa F01–F05, giữ regressions đã đóng; yêu cầu fail-before/pass-after với interleaving sau lần đọc cuối và luồng đổi version trọn vẹn; review lại bytes mới và browser integration trước nghiệm thu. tools_research: không giao nghiên cứu/cài tool mới. privacy_notes: chỉ dữ liệu thử và kết quả kỹ thuật, không đưa nội dung chỉ thị riêng.
