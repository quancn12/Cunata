# LC23 — Kiểm định độc lập toàn sản phẩm

review_id/task_id: LC23; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 + M1-scoring-contract v1.0; risk_level: HIGH.

**verdict: CHANGES_REQUESTED.** Suite cuối 216/216 PASS, hai typecheck và web asset verification exit0. Ba findings MAJOR còn mở: domain DTO nhận trạng thái/điểm không thể sinh bởi engine; web restore nhận report sai status/max; metadata đề còn đi thẳng vào HTML màn hình làm bài. Các repro cụ thể của LC22 đã được sửa và retest, không giữ chúng như lỗi OPEN. Không nghiệm thu toàn sản phẩm hoặc khẳng định FULLY_VERIFIED.

## Snapshot, delta và quyền

- base_commit lúc nhận: `5417ed6e537d58a680fa38e323bf68cbb8a03b01`, main, HEAD cộng working tree. Review trước bắt đầu ở `761aba92679153d4d649069735fdb4088229ff52`; đọc log/diff 761aba9..5417ed6 và diff chưa commit. Commit này có canonical fraction parser, report asset helper và hai regressions đã được LC22 kiểm trên working tree. Trong khi viết report, coordinator commit round6 thành **head_commit cuối `9e1d6b2232ee0783e0eb45e67f83b417b99bf8dd`**; reviewer không commit. Đã đọc diff product5417ed6..9e1d6b2; source hashes không đổi từ final probes, web test thêm3 regressions.
- Delta product đầu LC23: `src/domain/serialize.ts` +125/-10 và `test/domain/serialize.test.ts` +89; kiểm tra tổng/từng phần, ID trùng, count, points/status, max I/II và consistency III. Một test mới gồm nhiều assertions. Package/lock/tsconfigs không đổi; lock v3, TypeScript 7.0.2 sẵn có.
- Worker glue sửa `index.html` và `test/e2e/demoFlow.test.ts` trong lúc review. Snapshot đầu index SHA256 `25C5B2A74691044C1584ABCAE0A421A811422A669DABED2954FCD5FF7627C867`; snapshot giữa `B11AB6AD167FBA5ECEB2E7BA8791102A98CB8C93C273EDFA9DA198FBB26A38C8` có syntax error do đoạn renderer dư; **đã hết lỗi ở snapshot cuối**, không gắn BLOCKER cho bytes cuối.
- **Snapshot chốt**: index `371A493A46F1DB66344DF361DDE80F07F24C22BC7883F858A6771CAAEB19A24B` (103183 bytes); domain serialize `EA7A7D4AA40B2FDAF506C65C5ECAF00315F9F8FDC86A61960B97EBB367D7EE6F`; domain test `5254EAA3A42F725FFDFC1F4303A70310F2E8DA149900A1E08E1FD304577F1E24`; web test cuối `EFCDB59F3B4E773BE893194739AB70ECF328B35DE125ECC76E484EB324495D40` (trước đó AD527D26, suite213). Evidence áp dụng các bytes này; không chứng nhận thay đổi sau đó.
- files_reviewed: domain models/public exports, rational, shortAnswer, validate, judge, examMax, scoreAttempt, serialize và phần tạo/kiểm order của shuffle; inline HTML validator → init → input → storage/timer → submit → report/export; sample JSON/SVG qua schema/scorer/XML; build script, package/tsconfigs, README và tests theo rủi ro. Đọc LC22, helpers/probes LC19–20 và READINESS §6. Styles kiểm asset/inventory, không visual audit. Không tuyên bố đọc từng dòng mọi test/ops/research hoặc audit toàn lockfile. Không chạy generator update-index vì nó ghi ngoài scope.
- Không tìm thấy AGENTS.md trong inventory repo. Các file ops/dashboard/review cũ và thay đổi product khác thuộc working tree có sẵn/worker khác; reviewer chỉ tạo `docs/reviews/LOOP-23-codex.md`. Không branch/worktree/commit/deploy/install/dependency mới; không đọc prompt riêng worker khác.

## Findings OPEN

### LC23-F01 — MAJOR — Domain DTO vẫn nhận điểm và maximum trái custom-v1

- **VÙNG chịu trách nhiệm: src/domain**. affected_files: `src/domain/serialize.ts:206–217`, `:222–241`, `:265–275`, `:298–331`.
- evidence/reproduction_steps: qua public API, tạo đề chỉ một III key `1`, trả lời `1`: scoreAttempt sinh đúng 10/10. Lấy scoreResultToDTO rồi đổi question points/maxPoints, section III score/max và total/maxTotal đồng loạt thành chuỗi `1`. scoreResultFromDTO **nhận 1/1**; các tổng vẫn khớp nhưng công thức đúng là 10/10. Ca thứ hai: đề một I, DTO unanswered; đổi status thành partial, points/section score/total thành `1/10`, giữ max `1/4`. Parser **nhận partial 1/10** dù I chỉ có 0 hoặc 1/4. Probe reject cả hai đều FAIL; valid roundtrip control PASS (3 checks,1 pass/2 fail,exit1).
- expected: parser chặt của custom-v1 từ chối kết quả vi phạm công thức và trạng thái theo kind (M1 §4.6–4.8, Shared §2; B1-AC03/06,T13). actual: III chỉ so maximum giữa các câu với nhau; không suy expected maximum từ counts. Partial kiểm chung 0<points<max nên lọt cho I/III.
- impact: report/DTO lỗi được hợp thức thành ScoreResult, consumer thống kê/khôi phục không phân biệt kết quả engine đúng với giá trị bất khả thi. **Không phải counterexample scoreAttempt tính sai**, không có backend tin client được chứng minh.
- minimal_fix: sau khi có counts, dùng computeExamMax xác minh max từng phần/câu III; giới hạn status/points theo kind; II kiểm quan hệ correctCount/status, III kiểm inputIssues/status. Từ chối dữ liệu không thể sinh bởi version engine được hỗ trợ; không normalize/chấm lại bằng Number.
- regression_test: hai controls trên; III max khác nhau và cùng sai; BASE<10/=10/>10,N3=3/7; partial I/III; II count/status mâu thuẫn; empty DTO exam. Đồng thời giữ tất cả valid fixtures roundtrip để tránh parser từ chối dữ liệu hợp lệ.

### LC23-F02 — MAJOR — Web restore khóa final với status/max không nhất quán

- **VÙNG chịu trách nhiệm: glue**. affected_files: `index.html:722–834` (isValidScoreResult, đặc biệt nhánh III `:817–820` và checks số/tổng), `test/e2e/demoFlow.test.ts:885–899` (positive control).
- evidence/reproduction_steps trên index371A493A: (A) đề III một câu key1, responses rỗng → report 0/10 unanswered; chỉ đổi questionResults[0].status=`full`, lưu envelope đúng identity/submitted=true vào p.key(), gọi loadLocalState. (B) từ report 0/10 gốc, đổi maxTotalFraction/maxIIIFraction/pointIIIFraction và question.maxPointsFraction thành `1`, các Number maxima thành1; restore cùng cách. **Cả hai được adopt với studentState.submitted=true**; hai reject assertions FAIL. Positive control escaping report title PASS trong cùng probe (3 checks,1 pass/2 fail,exit1).
- expected: final report phải đúng status/points và maxima từ snapshot đề; 0/10 không thể full, một III không thể max1. actual: parser mới kiểm sums/ranges/kind/ID set và II details, chưa kiểm quan hệ status/points hay expected III max. Positive regression hiện còn đặt `full` cho points1/2,max10 và assert restore thành công.
- impact: khôi phục báo cáo mâu thuẫn, khóa bài làm với thống kê sai; Shared §2/3/5, B1-AC04/06,T13. Không phải bằng chứng phá phân quyền/trusted grading.
- minimal_fix: parser dùng snapshot đã validate, kiểm formula maxima và trạng thái theo kind; có thể so lại với chấm exact từ raw snapshot. Quarantine dữ liệu hỏng và giữ đường phục hồi; thống nhất mọi đường load/save/submit adopt. Positive test dùng report thực sự hợp lệ.
- regression_test: A/B ở trên, full với0, partial sai kind, count/header mismatch, đổi cả sums đồng bộ vẫn sai formula, II detail/status/ID sai; valid final restore/render và raw recovery. Chạy browser thực thêm sau VM.

### LC23-F03 — MAJOR — Metadata đề chưa escape tại màn hình làm bài

- **VÙNG chịu trách nhiệm: glue**. affected_files: `index.html:1252` (q.title và question ID ghép HTML), `:1280` (opt.label), `:1339` (st.label). Repro đã xác minh tại q.title; các sink label/ID còn lại là quan sát source cùng boundary, chưa chạy từng payload riêng.
- evidence/reproduction_steps: đề III hợp schema, đặt questions[0].title=`<img src=x onerror="globalThis.__lc23=1">`; validateExamVersion(currentExam).ok=true. Gọi renderExamPane thật bằng DOM stub có capture appendChild; metaBar.innerHTML giữ nguyên toàn payload. Expected escape assertion FAIL (1 check,0 pass/1 fail,exit1), index371A493A.
- expected: title/labels/IDs được render như text hoặc gán attribute bằng DOM API; parser rich content có policy riêng. actual: renderMathText đã escape content và report đã escape title, nhưng exam metadata bypass helper.
- impact: HTML injection tại sink màn hình làm bài từ đề không tin cậy; có nguy cơ script khi xử lý markup trong browser. **Browser script execution/remote delivery/exfiltration NOT_RUN / NOT VERIFIED**. Fixture kiểm boundary, không khẳng định đã có importer public hay exploit từ nickname thường.
- minimal_fix: textContent cho title/labels, setAttribute/dataset cho IDs, không nối dữ liệu vào HTML hoặc selector chưa escape; audit toàn bộ sink của exam UI. Giữ math/Unicode/ảnh và exact raw grading.
- regression_test: payload title, option/statement labels và ID chứa quote/markup ở cả exam/report/offline; DOM sink không còn active markup, browser marker vô hại và kiểm keyboard/IME không hồi quy. Không cắt raw answer để che lỗi.

## Retest LC22 và các lỗi đã sửa

| Hạng mục | Snapshot đầu25C5B2A7 | Cuối371A493A |
| --- | --- | --- |
| Reject malformed fraction | PASS | PASS |
| Reject total999/max10 và II thiếu stDetails | 2 FAIL | 2 PASS; đúng repro cũ đã FIXED, phần còn thiếu tách F02 |
| Escape on-page restored raw answer và offline active rich HTML | 2 FAIL | 2 PASS; FIXED cho hai đường report; exam metadata tách F03 |
| Sample có data URI, không relative src | PASS | PASS |
| Decode export SVG → XML parser | FAIL undefined entity, column1155 | PASS,1 SVG; LC22-F03 FIXED/RETESTED ở mức XML, browser hình chưa test |

Domain mới kiểm total/section sums và một số quan hệ tốt hơn; 1.632 valid fixtures roundtrip vẫn PASS. Điều đó không thay các negative controls F01. Không mang nguyên kết luận LC22 sang bytes mới.

## checks_run

Environment: Windows/PowerShell, D:\Cunata; Node24.14.0,npm11.9.0,Python3.11.0,TypeScript7.0.2. Không tạo log/artifact ngoài scope; output/exit nằm trong tool transcript. Các lệnh pipeline vẫn báo native exit; không lấy exit của lệnh kế sau làm exit của test.

| Command/check | Exit | Kết quả và giới hạn |
| --- | ---: | --- |
| git status/log/rev-parse/diff; inventory/hashes | 0 | HEAD và delta nêu trên. Inventory rg ban đầu có exit2 vì thư mục web không tồn tại; không phải build failure. |
| npm test — đầu index25C5B2A7 | 0 | 213 tests,34 suites,213 pass/0 fail;0 skipped/cancelled/todo;471.6511ms. |
| npx --no-install tsc -p tsconfig.json — đầu | 0 | Không diagnostics,1.995s. Tsc đã có; không dùng NOT_RUN cũ trong mẫu. |
| node scripts/build.js — đầu | 0 | 4 assets và sample8 câu hợp schema; index98999 bytes. Đây là verification, không bundle/render/deploy. |
| python -B test/oracle/oracle.py --check | 0 | 11/11 pass;1632 fixtures,5849 maxima,9 negative controls,seed20261114;1.2959s. Oracle self-check độc lập, không thay SUT differential. |
| LC20 JS fenced blocks qua node stdin — đầu/cuối | 0 từng block | Mỗi snapshot18+6+9=33 pass/0 fail; domain và web khớp1632 fixtures total/max/sections mỗi bên, domain DTO roundtrip. VM storage/timer/DOM stubs. |
| LC22 JS block qua node stdin — đầu/cuối | 1 / 0 | Đầu6 checks,2 pass/4 fail; cuối6/6 pass theo bảng retest. |
| Domain negative controls F01 | 1 | 3 checks,1 pass/2 fail; valid roundtrip PASS, reject wrong III maximum và I partial FAIL. |
| Decode export SVG → python -B ElementTree.fromstring — đầu/cuối | 1 / 0 | Đầu undefined entity; cuối1 SVG XML PASS. Source ElementTree.parse(public/q01-bbt.svg) control exit0. |
| npm test — giữa indexB11AB6AD | 1 | 213 tests,176 pass/37 fail,34 suites;0 skipped/cancelled/todo;333.9545ms. SyntaxError renderer dư; đã sửa trước final. |
| npm test — FINAL371A493A | 0 | **213 tests,34 suites,213 pass/0 fail**,0 skipped/cancelled/todo;451.5681ms. |
| npx --no-install tsc -p tsconfig.json — FINAL | 0 | Không diagnostics,1.702s; inline HTML JS ngoài typecheck. |
| npx --no-install tsc -p tsconfig.web.json — FINAL | 0 | Không diagnostics,1.686s; scripts JS chưa checkJs; không chứng nhận syntax HTML bằng tsc. |
| node scripts/build.js — FINAL | 0 | index103183,CSS17769,JSON8566,SVG2584 bytes; sample8 câu schema hợp lệ. |
| Web controls F02 + report-title positive | 1 | 3 checks,1 pass/2 fail: reject wrong full status, wrong III maximum FAIL; report-title escape PASS. |
| Exam metadata sink F03 | 1 | 1 check,0 pass/1 fail; payload reaches sink=true. Không execution browser. |
| npm test — chốt head9e1d6b2 sau thêm3 regressions | 0 | **216 tests,34 suites,216 pass/0 fail**,0 skipped/cancelled/todo;382.4866ms. Source index/domain giữ hashes đã kiểm. |
| npx --no-install tsc -p tsconfig.json; npx --no-install tsc -p tsconfig.web.json — chốt head9e1d6b2, chạy riêng | 0 / 0 | Không diagnostics;1.258s/1.259s, bao gồm web tests mới. |
| Hai fenced JS blocks của report LC23, trích bằng PowerShell và pipe riêng vào node --input-type=module | 1 từng block | Domain3 checks,1 pass/2 fail; web3 checks,0 pass/3 fail. Xác nhận lại đúng F01–F03 trên final source. |
| Browser desktop/mobile/keyboard/IME/AT/two tabs/download-open/screenshots/axe/Lighthouse | — | NOT_RUN: chưa có browser lane trong thực thi này; test/e2e là node:vm, không browser. |
| Lint/full SAST/secrets history/dependency advisory audit | — | NOT_RUN; không chạy tool audit/install mới. Search source và lock inventory không chứng nhận security. |
| Collector CORS/receipt/readback; DOCX/PDF import | — | NOT_IMPLEMENTED / NOT_RUN trong product source, không có endpoint/importer thật. |

Hai thử DOM phụ ban đầu dừng do thiếu createElement/insertBefore trong stub; không tính là bug sản phẩm. Đã bổ sung stub trong stdin và chạy lại F03 thành công đến sink. Một probe giữa gặp SyntaxError của index đang sửa; phân biệt với lỗi stub và snapshot cuối. Lần tự kiểm report dùng data: import cho block có relative import bị ERR_UNSUPPORTED_RESOLVE_REQUEST của harness; đã chạy lại bằng PowerShell trích block → node stdin đúng hướng dẫn, thu counts nêu trên.

## Probes mới tái lập không tạo file ngoài scope

Tại repo root, pipe từng block JS vào `node --input-type=module`. Expected assertions là yêu cầu cần đạt; exit1 phản ánh defect. Helpers đọc từ report cũ chỉ là VM fixture, không chạy generator/prompt worker. Rerun LC20/LC22 bằng cách trích các fenced JS blocks của report tương ứng.

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {scoreAttempt,scoreResultToDTO,scoreResultFromDTO} from './src/domain/index.ts';
let pass=0,fail=0;
function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
const ex={examId:'e',examVersionId:'v',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'III',questionVersionId:'q',answerKey:'1'}]};
const at={attemptId:'a',examVersionId:'v',responses:[{kind:'III',questionVersionId:'q',raw:'1'}]};
check('valid domain roundtrip',()=>{const r=scoreAttempt(ex,at);assert.deepEqual(scoreResultFromDTO(JSON.parse(JSON.stringify(scoreResultToDTO(r)))),r)});
check('domain rejects wrong III max',()=>{const d=scoreResultToDTO(scoreAttempt(ex,at));d.questions[0].points='1';d.questions[0].maxPoints='1';d.sections.III.score='1';d.sections.III.max='1';d.total='1';d.maxTotal='1';assert.throws(()=>scoreResultFromDTO(d),SyntaxError)});
check('domain rejects I partial',()=>{const e={...ex,questions:[{kind:'I',questionVersionId:'q',options:['a','b','c','d'].map(optionId=>({optionId})),correctOptionId:'a'}]};const d=scoreResultToDTO(scoreAttempt(e,{...at,responses:[]}));d.questions[0].status='partial';d.questions[0].points='1/10';d.sections.I.score='1/10';d.total='1/10';assert.throws(()=>scoreResultFromDTO(d),SyntaxError)});
console.log(JSON.stringify({tests:pass+fail,pass,fail}));process.exitCode=fail?1:0;
```

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8').match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0].replace("vm.runInContext('showReportView=()=>{}',c);",'');
const probe=String.raw`
let pass=0,fail=0;function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
function restore(p,r){p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{},submitted:true,scoreResult:r}));p.run('loadLocalState()')}
check('web rejects full with zero points',()=>{const p=page();setExam(p,exam());const r=p.run('scoreAttemptLocally()');r.questionResults[0].status='full';restore(p,r);assert.equal(p.run('studentState.submitted'),false)});
check('web rejects wrong III max',()=>{const p=page();setExam(p,exam());const r=p.run('scoreAttemptLocally()');r.maxTotalFraction='1';r.maxTotal=1;r.maxIIIFraction='1';r.pointIIIFraction='1';r.questionResults[0].maxPointsFraction='1';r.questionResults[0].maxPoints=1;restore(p,r);assert.equal(p.run('studentState.submitted'),false)});
check('exam title escaped',()=>{const p=page(),e=exam();const payload='<img src=x onerror="globalThis.__lc23=1">';e.questions[0].title=payload;setExam(p,e);assert.equal(p.run('validateExamVersion(currentExam).ok'),true);const captured=[];function el(){return {innerHTML:'',className:'',classList:{add(){},remove(){}},setAttribute(){},addEventListener(){},insertBefore(){},appendChild(n){captured.push(n.innerHTML)},querySelector(){return el()},querySelectorAll(){return []}}}p.c.document.createElement=el;p.c.document.getElementById('examPane').appendChild=n=>captured.push(n.innerHTML);p.run('renderExamPane()');assert.equal(captured.some(s=>s.includes(payload)),false)});
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probe).toString('base64'));
```

## coverage_gaps và traceability

- B1-AC01–03,T01–09/T15: unit/exhaustiveII16×81, oracle/differential1632, golden max5/15/16 và repeating fractions PASS. Không counterexample tính điểm; không đồng nghĩa mọi status/schema web đã differential. F01/F02 chặn độ chặt DTO/restore (AC04/06,T13).
- B1-AC05,T12: domain shuffle deterministic theo flags/seed/IDs, unit pass; UI chưa nối createPresentationOrder hoặc persist order+immutable exam snapshot. Source version mới vẫn cần snapshot bền để bảo đảm attempt cũ không bị ảnh hưởng. No-login/keys public chỉ phù hợp local practice, chưa bảo mật bài kiểm tra cần giấu key.
- Shared §3/5: timer/draft/identity và simulated interleavings có regression PASS. Read(finalKey)→set(finalKey) không atomic; khe final/final còn **SUSPECTED / NOT VERIFIED bằng scheduler browser**, không coi thêm read là giao dịch. Cold-start offline shell/service-worker, migration/quota recovery, multi-attempt selection và fresh browser reopen chưa chứng nhận.
- B1-AC07–08,T10/T14/T16–17: chưa full resource limits/adversarial BigInt sizes, SUT mutation coverage, browser/IME/a11y/performance/security lane/CI, changelog/rollback/owner acceptance. Oracle negative controls không thay mutation tests SUT. Display rounding/grammar còn owner decision. Build asset checker xanh cả khi inline JS lỗi ở giữa, nên phải giữ execution/syntax gate.
- Shared §4/6: bank/builder/collector/importer chưa có trong src/index runtime; không coi roadmap mockups/research là implemented. Không endpoint/CORS/idempotency server/receipt/readback để chứng nhận. Không có provenance/IR/preview pipeline nhập tài liệu.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0:** sửa F01–F03; giữ six probes LC22 và XML export gate; final snapshot report validation, immutable exam/order/raw persistence, recovery/migration và browser two-tab coordination trước nghiệm thu student milestone.
2. **P1:** flow chọn đề/lượt, attempt ID thật; teacher duration/shuffle hai cờ/lượt/answer-release settings; nối shuffle domain và giữ order sau reload; offline/background autosubmit, keyboard/IME/mobile, cold-start offline theo phương án đã duyệt.
3. **P1:** ngân hàng Môn>Lớp>Chủ đề>Bài>Mức độ; builder bật/tắt phần, reuse, immutable versions, preview/publish, export/import/backup/delete. Không giả quyền admin bằng URL khi MVP no-login.
4. **P1:** collector do owner kiểm soát đã duyệt, CORS/receipt/readback thật, local_saved/queued/sending/server_confirmed/failed, bounded retry/backoff/idempotency/conflict; trusted grading và release policy cho bài cần bảo mật.
5. **P2:** DOCX/PDF→IR/provenance/flags/confidence→preview/sửa/confirm; text/bảng/ảnh/OMML/math, PDF text/scan/OCR, limits/corpus; thiếu key không đoán.
6. **P2:** preset THPT theo môn/năm/văn bản được kiểm chứng, tách custom-v1; privacy/a11y/performance/security/CI và browser evidence, license checks/rollback/changelog/owner acceptance. Class/Assignment giai đoạn sau.

## NEED_DECISION — không tự chốt nghiệp vụ

| Quyết định | 2–3 phương án cho owner |
| --- | --- |
| Grammar III | A giữ charset/length hiện tại; B grammar hẹp với inputPolicyId mới; C theo preset được duyệt. |
| Rounding hiển thị | A exact fraction; B chọn digits/mode giữ rational; C fraction kèm decimal xấp xỉ có policy. |
| Limits và grouping shuffle | A duyệt tạm1000/nhóm I→II→III; B chọn giới hạn/grouping khác có version và regression. |
| Persistence/collector/report stack | A local practice+HTML; B collector được duyệt+HTML; C thêm PDF sau đánh giá. Kiến trúc storage/coordination chính cần owner duyệt. |
| Preset THPT | A hoãn, chỉ custom-v1; B chọn môn/năm/nguồn chính thức trước triển khai. |

Các quyết định này không chặn sửa invariant đã rõ trong F01–F03. assumptions: NONE mới; giữ giả thiết tạm M1 có nhãn. recommended_action: giao domain/glue sửa findings theo vùng, thêm controls trên vào gate, chốt lại hashes sau sửa; không nghiệm thu sản phẩm từ suite xanh. tools_research: không giao cài/nghiên cứu mới. privacy_notes: chỉ kết quả kỹ thuật và fixture thử, không chỉ thị riêng hay credentials.
