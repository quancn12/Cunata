# LC25 — Chốt review sau thay đổi đồng thời của worker

**verdict cuối: CHANGES_REQUESTED.** Hai MAJOR còn mở: LC25-F02 (II raw thiếu/null vẫn nhận full final) và LC25-F03 (vô cực bị render sai). **LC25-F01 đã FIXED / RETESTED**; hai repro gốc LC24-F02 cũng PASS. Báo cáo phân biệt evidence trước và sau sửa.

review_id/task_id: LC25; reviewer: Codex; requirements_version: Shared Product Contract v2.0 + M1-scoring-contract v1.0; risk_level: HIGH; reviewed_at:2026-11-14. base_commit/head_commit vẫn `efb5d099e3ae29923dcd0b211bdf3035e68d18d2`, branch main, cộng working tree. Chỉ reviewer tạo báo cáo này, không sửa code/test hoặc commit.


Cập nhật revision lúc bàn giao: bên điều phối commit round8 trong khi review; **head_commit cuối `3cffd2aa867ebf204edab305aecda69d27e49db9`**, base_commit vẫn `efb5d099e3ae29923dcd0b211bdf3035e68d18d2`. Reviewer không chạy commit. Product index hash34C5 giữ nguyên. Hai test mới trong demoFlow kiểm prototype persistence và refs/contradictory details, đã xem nội dung liên quan và chạy suite222/222 PASS; missing/null II chưa được cover. SHA256 test/e2e/demoFlow.test.ts `D0F77D580346F2826DA05199EA10D4131973822057FFBA6F8DE626C412A8207C`. Hai typechecks đã chạy lại sau đó: exit0 mỗi lệnh. Các findings/probes vẫn gắn bytes index34C5.

## Snapshot cuối và checks mới nhất

- Worker sửa index.html giữa review. Các hashes giữa: `D96DB4AF34F07A46EAD92738961EF95EAB155F4C52AA28591F364C22A4A49BCD`, `5220AF569BE0A79726C8731C0A0C412D76B996CAB9A6B526EFB3616AA92142A6`. **Snapshot cuối đã kiểm: index SHA256 `34C5B3187FAC6C82408FC3B8A8962AF4B689BB630C4C9560D1A88056648A7668`**. Hash serializer/test domain ghi ở phần phạm vi. Không chứng nhận sửa sau bytes này.
- Đã xem diff mới: null-prototype maps ở init/restore/nested II/flagged; thêm own reads và kiểm semantic refs/answer/raw/identity khi load/save/submit adopt. Domain test prototype mới chỉ kiểm domain; không thay browser persistence test. Reviewer không sửa source đó.
- `npm test` lần giữa: exit0,220/220,472.5876ms. Sau worker thêm hai tests, chạy lại lần chốt: **exit0,222 tests,35 suites,222 pass,0 fail,0 cancelled/skipped/todo,390.639ms**. Lệnh cuối truyền native exit qua `exit $LASTEXITCODE` sau Select-Object. `npx --no-install tsc -p tsconfig.json` và `npx --no-install tsc -p tsconfig.web.json`: exit0 mỗi lệnh, không diagnostics.
- `node scripts/build.js`: exit0, index116331,CSS17769,JSON8566,SVG2584 bytes;8 câu schema valid. Vẫn chỉ asset verification, không browser/bundle/deploy.
- Chạy lại blocks LC20:33/33 PASS; LC22:6/6 PASS; LC23:6/6 PASS; LC24:4/4 PASS, exit0 mỗi block, hash34C5. Domain/web differential thật1632 fixtures và domain DTO roundtrip nằm trong LC20. Oracle self-check11/11 ở lịch sử vẫn đúng, không chạy lại oracle vì source/fixtures oracle không đổi.
- LC25 block đầu bên dưới: exit1,5 cases,4 pass/1 fail (math) trên hash34C5; đáp án __proto__ own=true,10→10; foreign II refs/III contradictory answer bị reject đúng. Block II bổ sung cuối báo cáo: exit1,4 cases,2 pass/2 fail (missing/null). Tổng hai blocks LC25:9 cases,6 pass/3 fail.
- Browser/mobile/IME/keyboard/AT/two tabs/download-open/visual/a11y/performance vẫn NOT_RUN; Node VM không thay bằng chứng browser. Findings/source/code coverage và các quyết định owner bên dưới vẫn áp dụng trừ trạng thái F01/F02 đã cập nhật ở đây.

## Findings OPEN cuối

### LC25-F02 — MAJOR — Full final II vẫn nhận khi raw question response thiếu/null

- tracking: LC24-F02 **PARTIALLY_FIXED / OPEN**. **VÙNG chịu trách nhiệm: glue.** affected_files snapshot34C5: `index.html:911–913` (rawSts fallback null), `:944–956` (skip raw validation khi null), `:1323–1327` (adopt final).
- evidence/reproduction_steps: đề chỉ một II, s0…s3, tất cả key=true. Sinh report thật bằng scorer với raw cả bốn true → full1/1. Giữ report, lưu envelope identity đúng nhưng responses={} hoặc responses={q:null}, rồi loadLocalState. Cả hai vẫn submitted=true,totalFraction='1'. Valid control raw đủ true nhận đúng; raw={q:{}} bị reject đúng. Hai reject assertions FAIL; block tái lập bổ sung ở cuối.
- expected: Shared §2/3/5,B1-AC04/06,T11/T13: thiếu/null raw không thể chứng minh bốn ý đã trả lời đúng; không khóa full final trái raw. actual: `rawSts && typeof rawSts==='object'` bỏ đối chiếu khi raw question missing/null. Restore còn lọc q:null khỏi clean responses, gặp cùng missing branch. Report tự nhất quán với key nhưng trái persisted raw.
- impact: final hỏng được nhận và khóa bài, giữ1/1 trong khi chấm raw hiện có sẽ0/1; integrity local persistence, không phải bằng chứng collector tin client hay vượt quyền.
- minimal_fix: khi có envelope/raw, coi missing/null là unanswered cho từng ý và so toàn bộ states/userVal/count/points/status. Không dùng truthiness để bỏ kiểm; áp dụng mọi đường adopt; quarantine/recover raw thay vì âm thầm sửa lịch sử. Legacy thiếu toàn bộ raw cần policy migration rõ, không mặc định tin full report.
- regression_test: II full/partial/wrong/unanswered × raw missing/null/{}/non-object/malformed; đủ refs nhưng trái raw; valid controls. Giữ foreign/cross-question IDs và III contradictory-answer regressions đã PASS.

### LC25-F03 — MAJOR — Vô cực trong đề mẫu bị render thành `∈ fty`

- **VÙNG chịu trách nhiệm: glue.** affected_files cuối: `index.html:1089–1090`; input `public/sample-exam.json:18`,`:24`, embedded `index.html:219`,`:225`.
- Evidence/reproduction_steps: input đúng một U+005C vẫn output `<p><span class="math-expr"> &isin; fty</span></p>`, thiếu infinity entity. Regex membership chạy trước infinity ăn tiền tố. Ảnh hưởng lựa chọn đúng A/lời giải câu1, không thay điểm theo ID. Sửa thứ tự/token boundary, regression infinity/membership/integral và default report. Chưa kiểm hình browser.

## Retest đã sửa

**LC25-F01 (LC24-F01): FIXED / RETESTED repro gốc** — save/load III __proto__ giữ own=true và10→10. Chưa chứng nhận mọi event/browser I/II/flagged; có null maps/own reads trong diff. **Hai repro gốc LC24-F02 FIXED / RETESTED** — foreign II IDs và III userAnswer2 trái raw1/full10 đều bị reject. F02 giữ OPEN vì missing/null mới nêu trên.

## Phạm vi và môi trường

Đã đọc hai contracts đầy đủ, README, READINESS §6, files_reviewed: src/domain/{model,index,rational,shortAnswer,validate,judge,examMax,scoreAttempt,serialize,shuffle}.ts; index.html theo luồng init/validate/render/input/storage/timer/submit/adopt/report/download/restart; scripts/build.js; package/tsconfigs; diff/tests/harness liên quan. CSS/assets chỉ kiểm tham chiếu/tồn tại. Không tuyên bố đọc từng dòng ops/research/dependency history. Không tìm thấy AGENTS.md qua inventory repo.

Environment: D:\Cunata, Windows/PowerShell; Node v24.14.0,npm11.9.0,TypeScript7.0.2,Python3.11.0. Logs/exit ở tool transcript, không artifact/log ngoài scope. Không install/dependency/branch/worktree/commit/deploy hoặc sửa source/test. Không chạy update-index vì ghi ngoài scope. Không đọc prompt riêng worker khác.

SHA256 src/domain/serialize.ts: `8A523B406357689F3BDD0444856D07014A00F7AD89C35DE6503F6DD2E35C8C7E`; test/domain/scoreAttempt.test.ts: `57F72A443DCBA963F1EDAB9E4974EC5BD2532886CB73B08F81977AA41F54FD3C`. Product/test delta chưa commit đầu phiên: test scoreAttempt+84 dòng, một test nhiều assertions IDs prototype domain; sau đó worker sửa glue như trên. HEAD round7 đã tích hợp diff từ review trước ở 9e1d6b2.

Checks đầu: npm test exit0,220/220,509.6955ms; hai typecheck exit0; build exit0,index106142 bytes; LC24 block exit1,1 pass/3 fail. Oracle self-check command `python -B test/oracle/oracle.py --check`: exit0,11 pass/0 fail/skip,1632 fixtures,5849 maxima,9 negative controls,seed20261114,1.3265s. Không thay oracle self-check cho SUT differential. Lint/SAST/dependency advisory/full secret history NOT_RUN (không lint script, không auditor/cài tool); Google CORS/receipt/readback và DOCX/PDF import NOT_IMPLEMENTED/NOT_RUN.

Probe thử final/final đầu phiên lỗi harness (undefined JSON); loại khỏi bằng chứng, chưa chứng minh race. Infinity probe đầu thừa backslash; đã chạy lại chính xác U+005C. Một số inventory rg lỗi vì web/ không tồn tại hoặc wildcard Windows, đã xác định paths thật; không tính product failure. Không giấu lỗi harness thành PASS.

## Probes tái lập LC25

Tại repo root, trích từng fenced JS pipe vào `node --input-type=module`; không tạo file ngoài scope. Helper LC19 dựng VM/stubs. Block1 cuối exit1,5 cases,4 pass/1 fail; block2 cuối exit1,4 cases,2 pass/2 fail. Các LC20/22/23/24 blocks cũng đã trích/chạy Node stdin cùng cách. Assertions là behavior cần đạt, exit1 hiện thể hiện defects.
```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8').match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0];
const probe=String.raw`
let pass=0,fail=0;function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
function restore(p,r,responses={}){p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses,submitted:true,scoreResult:r}));p.run('loadLocalState()')}
check('valid final control',()=>{const p=page();setExam(p,exam());restore(p,p.run('scoreAttemptLocally()'));assert.equal(p.run('studentState.submitted'),true)});
check('reject foreign statement IDs',()=>{const p=page(),e=exam();e.questions=[{kind:'II',questionVersionId:'q',statements:[0,1,2,3].map(i=>({statementId:'s'+i,answer:true}))}];setExam(p,e);const r=p.run('scoreAttemptLocally()');r.questionResults[0].stDetails.forEach((s,i)=>s.statementId='FOREIGN'+i);restore(p,r);assert.equal(p.run('studentState.submitted'),false)});
check('reject contradictory report answer',()=>{const p=page();setExam(p,exam());p.run('studentState.responses.q="1"');const r=p.run('scoreAttemptLocally()');r.questionResults[0].userAnswer='2';restore(p,r,{q:'1'});assert.equal(p.run('studentState.submitted'),false)});
check('save load preserves proto answer score',()=>{const p=page(),e=exam();e.questions[0].questionVersionId='__proto__';setExam(p,e);p.c.answers=JSON.parse('{"__proto__":"1"}');p.run('studentState.responses=answers');const before=p.run('scoreAttemptLocally().totalFraction');assert.equal(before,'10');p.run('saveLocalState();loadLocalState()');const after=p.run('scoreAttemptLocally().totalFraction');console.log(JSON.stringify({before,after,own:p.run('Object.hasOwn(studentState.responses,"__proto__")')}));assert.equal(after,before)});
check('infinity render',()=>{const p=page();p.c.mathInput='$'+String.fromCharCode(92)+'infty$';const output=p.run('renderMathText(mathInput)');console.log(JSON.stringify({input:p.c.mathInput,output}));assert.ok(output.includes('&#8734;'),'missing infinity');assert.ok(!output.includes('&isin;'),'unexpected membership')});
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probe).toString('base64'));
```

## coverage_gaps và traceability

- B1-AC01–03,T01–09/T15: unit/golden/exhaustiveII16×81 và1632 SUT differential PASS; chưa thấy counterexample số học mới. Không suy từ đó rằng mọi ID/shape trong persistence an toàn; F02 còn chặn B1-AC04/06,T11/T13.
- B1-AC05/T12: domain shuffle deterministic/flags độc lập theo tests; web chưa gọi createPresentationOrder, chưa persist presentationOrder và immutable exam snapshot. init lấy latest sample fetched/embedded, nên chưa chứng minh sửa bank/key sau giao không ảnh hưởng attempt (T14).
- Shared §3: deadline/submit/durability và identity có VM regression, nhưng localStorage read→write không atomic. Final/final trong khoảng read cuối→write vẫn SUSPECTED / NOT VERIFIED bằng browser scheduler; probe harness lỗi nêu trên không chứng minh nó. Chưa kiểm cold-start offline shell, private browsing/quota recovery, migrations, restart, background/clock shift, browser hai tab. Không coi thêm getItem là transaction.
- UI student vẫn là sample cố định, attempt ID mặc định; restart xóa current attempt/final theo xác nhận, chưa phải lịch sử nhiều lượt thật. Teacher settings, shuffle UI, release policy và cơ chế trusted grading chưa có; client có answer keys chỉ phù hợp demo/local practice.
- B1-AC07/08,T10/T14/T16/T17: chưa adversarial resource limits/BigInt-size toàn diện, SUT mutation testing, browser/a11y/security/performance/CI/rollback và owner acceptance. Oracle negative controls không thay mutant chạy trong SUT. F03 chứng minh test asset/regex hiện tại không đủ kiểm đúng nghĩa toán khi render.
- Shared §4/6: chưa bank/builder/collector/importer thật trong runtime hiện có; không endpoint để đo CORS/receipt/idempotency, không IR/provenance/preview-confirm. Không nghiên cứu quy định THPT hiện hành trong review này; không gắn custom-v1 là preset chuẩn đã kiểm chứng.

## Tính năng lộ trình còn thiếu — theo ưu tiên

1. **P0:** sửa phần còn lại F02 và F03 và đưa repro vào gate; bảo toàn raw/final/snapshot/version, quarantine/recovery và concurrency được kiểm browser trước nghiệm thu student milestone.
2. **P1:** chọn đề/lượt thật, attempt ID và lịch sử riêng; teacher settings thời lượng/số lượt/shuffle hai cờ/release lời giải; persist order+immutable exam; offline refresh/cold-start/background autosubmit theo phương án duyệt; mobile/keyboard/IME/a11y thật.
3. **P1:** ngân hàng Môn>Lớp>Chủ đề>Bài>Mức độ; builder bật/tắt phần, reuse question versions, preview/publish, export/import/backup/delete. MVP no-login không dựng quyền bảo mật giả từ URL/nickname.
4. **P1:** collector owner-controlled đã duyệt; trusted grading/release khi cần, CORS/receipt/readback; local_saved/queued/sending/server_confirmed/failed, bounded retry/backoff/idempotency/conflict. Không báo lưu Drive từ local success.
5. **P2:** DOCX/PDF→IR giữ rich text/bảng/ảnh/OMML/math, provenance/confidence/flags→preview/sửa/confirm; text/scan/OCR, corpus/limits; thiếu key không đoán.
6. **P2:** preset THPT môn/năm/văn bản đã kiểm chứng tách custom-v1; hoàn thiện privacy/security/performance/browser CI, license/changelog/rollback và owner nghiệm thu. Class/Assignment sau MVP.

## NEED_DECISION — không tự chốt nghiệp vụ còn mở

| Quyết định | 2–3 phương án trình owner |
| --- | --- |
| Grammar III | A giữ charset/length; B grammar hẹp qua inputPolicyId mới; C policy riêng theo preset được duyệt. |
| Display rounding | A exact fractions; B digits/mode owner chọn; C fraction kèm decimal xấp xỉ có nhãn/policy. Giữ rational gốc. |
| Limits/grouping | A duyệt tạm1000 và nhóm I→II→III; B đổi giới hạn/grouping với version+regressions. |
| Persistence/collector/report stack | A local practice+HTML; B collector được duyệt+HTML; C thêm PDF sau đánh giá. Storage/coordination chính cần phê duyệt. |
| Preset chuẩn | A hoãn và chỉ custom-v1; B chọn môn/năm/nguồn quy định chính thức trước triển khai. |

Không có mâu thuẫn mới giữa hai contract; các quyết định này không chặn sửa hai findings còn mở có expected rõ. assumptions: NONE mới; giữ các giả thiết tạm M1 có nhãn. recommended_action: glue sửa hai findings còn mở, thêm regressions và chốt lại hashes/checks; chưa nghiệm thu toàn sản phẩm. tools_research: không được giao nghiên cứu/cài mới. privacy_notes: chỉ dữ liệu kỹ thuật/fixtures, không nội dung chỉ thị riêng hoặc credentials.


## Probe II bổ sung — snapshot cuối

Trích block này pipe vào `node --input-type=module` tại repo root. Exit1 hiện thể hiện missing/null finals chưa bị reject.

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8').match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0];
const probe=String.raw`
let pass=0,fail=0;function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
for(const mode of ['valid','missing','empty','null'])check('II full raw '+mode,()=>{const p=page(),e=exam();e.questions=[{kind:'II',questionVersionId:'q',statements:[0,1,2,3].map(i=>({statementId:'s'+i,answer:true}))}];setExam(p,e);p.run('studentState.responses.q={s0:true,s1:true,s2:true,s3:true}');const r=p.run('scoreAttemptLocally()');const responses=mode==='valid'?{q:{s0:true,s1:true,s2:true,s3:true}}:mode==='missing'?{}:mode==='empty'?{q:{}}:{q:null};p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses,submitted:true,scoreResult:r}));p.run('loadLocalState()');const accepted=p.run('studentState.submitted');console.log(JSON.stringify({mode,accepted,total:p.run('studentState.scoreResult?.totalFraction')}));assert.equal(accepted,mode==='valid');});
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probe).toString('base64'));
```
