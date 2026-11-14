# LC24 — Kiểm định độc lập toàn sản phẩm

review_id/task_id: LC24; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 + M1-scoring-contract v1.0; risk_level: HIGH.

**verdict: CHANGES_REQUESTED.** Suite cuối 219/219 PASS, typecheck domain/web và web asset verification exit0. Hai findings còn mở: **BLOCKER** mất câu trả lời với ID hợp lệ `__proto__` khi restore, làm điểm 10 thành 0; **MAJOR** final report vẫn nhận tham chiếu ý lạ và nội dung trả lời mâu thuẫn điểm. Các repro LC23 đã PASS sau sửa. Không nghiệm thu toàn sản phẩm hoặc tuyên bố FULLY_VERIFIED.

## Revision, phạm vi và delta

- base_commit/head_commit lúc kiểm: `9e1d6b2232ee0783e0eb45e67f83b417b99bf8dd`, branch main, cộng working tree đang được worker sửa. LC23 đã chốt ở cùng HEAD này; đã xem git log ba commit gần nhất, delta chưa commit của product/tests và đọc LC23 để xác định các lỗi cần retest. Không có commit mới trong lần chốt hashes.
- Delta product cuối: index.html +58/-4; src/domain/serialize.ts +143/-26; test/e2e/demoFlow.test.ts +162/-9; test/domain/serialize.test.ts +372/-0 (một test nhiều assertions). Domain thêm formula maxima từ counts, status/points theo kind, II count/status và III inputIssues; web thêm formula/status/details checks và escape metadata. Domain còn đổi thứ tự kiểm tổng/max so với snapshot đầu để giữ test cũ. Web positive test `1/2` đã đổi sang câu II đúng 3 ý, thay fixture III full 1/2 trên max10 sai luật; thêm hai regression LC23. Package/lock/tsconfig không có delta; TypeScript 7.0.2 đã có, không dùng NOT_RUN từ mẫu cũ.
- Snapshot cuối SHA256: index.html `1B98AE78ACF2FEBD32FE1EB9834CC549529AF91ADE0629F30D36B81B12D944F8`; src/domain/serialize.ts `8A523B406357689F3BDD0444856D07014A00F7AD89C35DE6503F6DD2E35C8C7E`; test/domain/serialize.test.ts `83449D39C6EC047BDABD89AA1502032CFBF2F3335FC902064BC2850BF3F2C3A1`; test/e2e/demoFlow.test.ts `87718E07FA196A623CDA703BBDA24C4D17F33770296606A3C6ED00B675EFCD59`. Evidence chỉ áp dụng bytes đã kiểm; không chứng nhận sửa sau đó.
- files_reviewed: src/domain/{model,index,rational,shortAnswer,validate,judge,examMax,scoreAttempt,serialize,shuffle}.ts; index.html theo luồng validate/init/input/storage/timer/submit/report/export; scripts/build.js; package.json/lock inventory; tsconfig.json/tsconfig.web.json; README; test/domain và test/e2e phần liên quan, sample acceptance/JSON/SVG và oracle fixtures thông qua execution. Đối chiếu READINESS §6 B1-AC01…08/T01…17. Styles chỉ xem asset/link, không visual audit. Không tuyên bố đọc từng dòng ops/research/tests hoặc audit đầy đủ dependency history.
- Không tìm thấy AGENTS.md trong inventory repo. Working tree có thay đổi ops/dashboard/workers/review cũ từ trước và worker khác; reviewer chỉ tạo file này. Không sửa code/test, không branch/worktree/commit/deploy/install/dependency mới. Không chạy scripts/update-index.js vì nó ghi ngoài scope. Không đọc prompt riêng của worker khác.

## Findings OPEN

### LC24-F01 — BLOCKER — Restore làm mất đáp án có question ID `__proto__`, đổi 10/10 thành 0/10

- **VÙNG chịu trách nhiệm: glue.** affected_files: `index.html:1137`, `:1149–1167` (plain-object response maps); `:1454` (ghi input theo ID), `:1728–1740` (đọc raw). Domain cho phép ID là mọi chuỗi không rỗng; web validator cũng nhận đề này.
- evidence/reproduction_steps: đề custom-v1 chỉ một III, questionVersionId=`__proto__`, answerKey=`1`. Gán responses bằng JSON.parse('{"__proto__":"1"}') để có own property đúng như dữ liệu JSON lưu. validateExamVersion(currentExam).ok=true; scoreAttemptLocally().totalFraction=`10`. Gọi **saveLocalState(); loadLocalState()** thật trong VM với Map-backed localStorage. Sau restore, Object.hasOwn(studentState.responses,'__proto__')=false; totalFraction=`0`, status=`invalid`. Diagnostic command exit0 và in `validExam=true before=10 / after=0 status=invalid own=false`; assertion bảo toàn own answer FAIL trong probe bên dưới.
- expected: save/restore giữ nguyên ID và raw answer, kết quả vẫn 10/10 (Shared §2/3/5, B1-AC04, T13). actual: `cleanResponses = {}` rồi `cleanResponses[qId] = qResp` gọi setter kế thừa __proto__, không tạo own property; scorer đọc Object.prototype thay raw string. Ghi input bằng bracket trên map thường cũng cùng rủi ro, chưa chạy event input với browser thật.
- impact: mất câu trả lời đã lưu và chấm sai sau restore trên dữ liệu đề hợp schema. Tái hiện không cần sửa global prototype, không phải bằng chứng remote prototype-pollution exploit. Severity BLOCKER vì đã chứng minh mất input và đổi điểm; phạm vi hiện tại cần ID đặc biệt, sample mặc định chưa gặp.
- minimal_fix: dùng null-prototype dictionary hoặc Map với codec JSON rõ ràng cho toàn bộ responses, nested statement maps và flagged; reads phải chỉ lấy own properties. Giữ nguyên ID hợp lệ theo contract; không vá riêng bằng cấm ID này. Kiểm cả khởi tạo, clean restore, event write, palette/scorer, serialization và migration.
- regression_test: lưu→reload→submit với question/statement IDs `__proto__`, `constructor`, `toString`; I/II/III, đúng/sai/blank. Assert own key và raw nguyên vẹn, điểm/status trước sau bằng nhau, không thay prototype; control IDs thường và JSON roundtrip. Chạy browser reload thực sau VM.

### LC24-F02 — MAJOR — Final report nhận foreign statement refs và answer text trái full score

- **VÙNG chịu trách nhiệm: glue.** affected_files: `index.html:840–872` (chỉ kiểm statement ID unique/state/count), `:1176–1182` (adopt final), `:1949–1966`, `:1998–2014` (hiển thị chi tiết từ report).
- evidence/reproduction_steps, index hash nêu trên: (A) đề một II với s0…s3, tất cả key=true; lấy scoreAttemptLocally() cho responses rỗng. Chỉ đổi bốn stDetails.statementId thành FOREIGN0…3, giữ count/status/points; lưu envelope identity đúng với submitted=true rồi loadLocalState. **studentState.submitted=true** dù không ý nào thuộc câu. (B) đề một III key1, responses.q='1'; engine sinh full10/10. Chỉ đổi questionResults[0].userAnswer='2', giữ raw responses.q='1' và full10/10; restore vẫn submitted=true. Hai reject assertions FAIL; valid unmodified final control PASS.
- expected: report khôi phục chỉ tham chiếu ý thuộc đúng question snapshot; lời đáp/đáp án/điểm trình bày nhất quán với raw và key (Shared §2/5, B1-AC04/06,T11/T13). actual: parser kiểm sums/formula và state count nhưng không liên kết stDetails ID set với eq.statements; không kiểm answer details với snapshot/raw. Renderer tiếp tục dùng detail text được nhận, có thể báo chọn2 và đúng hoàn toàn khi key1.
- impact: final lỗi bị hợp thức và khóa bài; báo cáo review/offline có thể trình bày dữ liệu không thuộc câu hoặc lời đáp sai. Đây là lỗi integrity ở local persistence, không chứng minh vượt quyền hoặc collector tin client. Không coi mọi chỉnh localStorage là security vulnerability; payload thử là negative control cho validator đang dùng để quyết định final hợp lệ.
- minimal_fix: dùng exam snapshot và raw persisted để xác minh refs + semantic result tại mọi đường adopt; so exact score/status/details theo IDs hoặc tạo display details từ snapshot/raw đã kiểm. Report hỏng cần quarantine và đường phục hồi raw, không âm thầm sửa lịch sử/đổi version. Không chỉ bổ sung thêm một phép cộng tổng.
- regression_test: foreign/missing/duplicate/cross-question statement IDs; state trái boolean raw/key; III userAnswer/correctAnswer/inputIssues trái raw; report identity khác envelope; valid I/II/III full/partial/wrong/unanswered/invalid controls. Giữ rejection formula/status LC23 và roundtrip fixture hợp lệ.

## Retest các review trước

| Hạng mục | Kết quả LC24 |
| --- | --- |
| LC23-F01 domain wrong III max, I partial; valid roundtrip | 3/3 PASS, exit0; đúng hai repro cũ FIXED/RETESTED |
| LC23-F02 web full0/wrong III max | 2/2 PASS; sửa đúng hai repro cũ; semantic refs còn thiếu tách F02 |
| LC23-F03 exam title HTML sink | 1/1 PASS; suite bổ sung title/option/statement label escaping |
| LC22 report malformed fraction, out-of-bounds score, missing II details, report raw/rich HTML escaping, packaged sample SVG | 6/6 PASS, exit0 |
| LC20 storage/identity/timer/report probes và differential | Ba blocks 18+6+9 =33/33 PASS, exit0 từng block |

LC20 differential thực sự gọi cả public domain scorer và web scorer trên 1.632 fixtures, so exact total/max/từng phần; domain DTO roundtrip cũng PASS. Không có counterexample công thức trên fixtures; F01 nằm ở persistence với ID ngoài tập fixtures thường. Hai lỗi test đầu phiên đã hết trên snapshot cuối; không giữ như lỗi OPEN.

## checks_run

Environment: D:\Cunata, Windows/PowerShell; Node v24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Output/exit ở tool transcript, không ghi artifact/log ngoài scope. `tests` là số test cases, không phải số assertions.

| Command/check | Exit | Evidence / giới hạn |
| --- | ---: | --- |
| git status/log/rev-parse/branch/diff; inventory/hashes | 0 | HEAD/working tree và hashes nêu trên; inventory ban đầu có rg exit2 do web/ không tồn tại; đọc nhầm web/package.json và scripts/build-web.mjs báo không tồn tại, đã xác định script thật scripts/build.js. |
| npm test — đầu | 1 | 216 tests,34 suites,214 pass/2 fail,0 skip/cancel/todo;470.6625ms. serialize.test.ts:328 regex error message đổi sau validation reorder; demoFlow.test.ts:899 positive III full1/2,max10 bị reject đúng. |
| npm test — giữa/cuối | 0 / 0 | Giữa218/218 PASS,439.8723ms; cuối **219 tests,34 suites,219 pass/0 fail**,0 skip/cancel/todo;408.9422ms. Worker sửa positive fixture/check ordering, thêm2 web tests và1 domain regression nhiều assertions trước lần chốt. Native npm_test_exit=0 được in riêng; wrapper có exit1 do git diff bị Select-Object -First cắt pipe, không phải npm failure. |
| npx --no-install tsc -p tsconfig.json — đầu/cuối | 0 / 0 | Không diagnostics. Tsc hiện đã có. |
| npx --no-install tsc -p tsconfig.web.json — đầu/cuối | 0 / 0 | Không diagnostics; không có nghĩa đã typecheck inline HTML JS. |
| node scripts/build.js | 0 | 4 assets; index106142,CSS17769,JSON8566,SVG2584 bytes; sample8 câu hợp schema. Đây là asset/link/schema verification, không bundle/browser/deploy. |
| python -B test/oracle/oracle.py --check | 0 | 11/11 pass,0 fail/skip;1632 fixtures,5849 maxima,9 negative controls,seed20261114;1.0318s. Chỉ oracle self-check; SUT differential ở LC20 blocks. |
| JS blocks LC20 qua node stdin | 0 từng block | 33/33 PASS trên index1B98AE78; domain/web fixtures và VM storage/timer/identity/report. |
| JS blocks LC23 qua node stdin | 0 từng block | Domain3/3 và web3/3 PASS, gồm valid DTO và repro F01–F03 cũ. |
| JS block LC22 qua node stdin | 0 | 6/6 PASS trên index1B98AE78. SVG kiểm đóng gói, không browser visual. |
| LC24 probes bên dưới, node stdin | 1 | 4 checks:1 pass/3 fail; valid final control PASS; foreign refs, contradictory answer và __proto__ restore reject/preserve assertions FAIL. |
| F01 diagnostic save→load→score | 0 | validExam=true,before=10,after=0,status=invalid,own=false. Exit0 chỉ diagnostic đã chạy, không phải behavior PASS. |
| Browser desktop/mobile/keyboard/IME/AT/two tabs/download-open/screenshots/axe/Lighthouse | — | **NOT_RUN**: lần review này chỉ thực thi Node VM, không mở browser lane; DOM/localStorage là stubs. |
| Lint/SAST/full secret history/dependency advisory audit | — | **NOT_RUN**: không có lint script; không chạy auditor hoặc cài tool mới. Inventory không chứng nhận bảo mật. |
| Google collector CORS/receipt/readback; DOCX/PDF importer | — | **NOT_IMPLEMENTED / NOT_RUN** trong product source hiện có. |

## Probes LC24 tái lập không tạo file ngoài scope

Tại repo root, trích fenced JS block dưới và pipe vào `node --input-type=module`. Helper từ LC19 chỉ dựng VM/Map storage; assertions là behavior cần đạt nên exit1 biểu thị defect. Có thể chạy các blocks LC20/22/23 cùng cách; không dùng data: import trực tiếp cho block có relative imports.

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8').match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0];
const probe=String.raw`
let pass=0,fail=0;function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
function restore(p,r,responses={}){p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses,submitted:true,scoreResult:r}));p.run('loadLocalState()')}
check('valid final restore',()=>{const p=page();setExam(p,exam());const r=p.run('scoreAttemptLocally()');restore(p,r);assert.equal(p.run('studentState.submitted'),true)});
check('reject foreign statement IDs',()=>{const p=page(),e=exam();e.questions=[{kind:'II',questionVersionId:'q',statements:[0,1,2,3].map(i=>({statementId:'s'+i,answer:true}))}];setExam(p,e);const r=p.run('scoreAttemptLocally()');r.questionResults[0].stDetails.forEach((s,i)=>s.statementId='FOREIGN'+i);restore(p,r);assert.equal(p.run('studentState.submitted'),false)});
check('reject report raw contradicting full',()=>{const p=page();setExam(p,exam());p.run('studentState.responses.q="1"');const r=p.run('scoreAttemptLocally()');r.questionResults[0].userAnswer='2';restore(p,r,{q:'1'});assert.equal(p.run('studentState.submitted'),false)});
check('restore own __proto__ answer',()=>{const p=page(),e=exam();e.questions[0].questionVersionId='__proto__';setExam(p,e);p.c.saved={examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:JSON.parse('{"__proto__":"1"}'),submitted:false};p.run('localStorage.setItem(getStorageKey(currentExam,studentState),JSON.stringify(saved));loadLocalState()');assert.equal(p.run('Object.hasOwn(studentState.responses,"__proto__")'),true);assert.equal(p.run('scoreAttemptLocally().totalFraction'),'10')});
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probe).toString('base64'));
```

## coverage_gaps và traceability

- B1-AC01–03,T01–09/T15: unit exhaustiveII16×81, golden maxima5/15/16, exact fractions và differential1632 PASS. Chưa chứng nhận mọi ID/shape/status ở persistence; F01/F02 chặn AC04/06,T11/T13. Không có lỗi arithmetic mới trong domain đã chứng minh.
- B1-AC05,T12: domain shuffle deterministic/independent flags và invariant tests PASS. UI chưa tích hợp createPresentationOrder, chưa persist order+immutable exam snapshot; currentExam lấy sample fetched/embedded. Cần version/snapshot bền trước bảo đảm đề/câu sửa không đổi attempt cũ (T14).
- Shared §3: timer/submit/identity và mô phỏng interleavings có regressions; localStorage read→write không atomic. Final/final giữa read cuối và write còn SUSPECTED/NOT VERIFIED bằng scheduler browser; không gọi thêm read là transaction. Cold-start offline shell, quota/migration recovery, private browsing, multiple attempts, clock/background, browser restart chưa chứng nhận.
- B1-AC07/08,T10/T14/T16/T17: chưa full adversarial resource/BigInt-size tests, SUT mutation testing, browser/IME/a11y/performance/security/CI/changelog/rollback/owner acceptance. Oracle negative controls không thay mutation tests SUT. UI rounding/III grammar và limits/grouping còn decision.
- Shared §4/6: chưa bank/builder/collector/importer thật trong src/index runtime. Không endpoint receipt/idempotency/CORS để kiểm; không IR/provenance/preview-confirm tài liệu. No-login và keys client chỉ phù hợp local practice; chưa đáp ứng controlled exam cần giấu key.

## Tính năng lộ trình còn thiếu — theo ưu tiên

1. **P0:** sửa F01/F02 và đưa repro vào gate; bảo toàn immutable exam/order/raw/final, migration/quarantine/recovery và phối hợp hai tab được kiểm browser trước nghiệm thu student milestone.
2. **P1:** chọn đề/lượt thật, attempt ID riêng; settings thời lượng, shuffle hai cờ, số lượt, release lời giải; nối shuffle snapshot, refresh/offline/background autosubmit, cold-start offline theo phương án duyệt; mobile/keyboard/IME/a11y thực.
3. **P1:** bank Môn>Lớp>Chủ đề>Bài>Mức độ, builder bật/tắt phần, reuse questions, immutable versions, preview/publish, export/import/backup/delete. MVP không giả quyền bảo mật admin từ URL/nickname.
4. **P1:** collector owner-controlled đã duyệt, trusted grading khi cần, CORS/receipt/readback; local_saved/queued/sending/server_confirmed/failed; bounded retry/backoff/idempotency/conflict; release policy thực cho controlled exam.
5. **P2:** DOCX/PDF→IR có provenance/flags/confidence→preview/sửa/confirm; text/bảng/ảnh/OMML/math, text/scan/OCR, limits/corpus; thiếu key không đoán.
6. **P2:** presets THPT môn/năm/nguồn quy định đã kiểm chứng, tách custom-v1; privacy/security/a11y/performance, CI/browser evidence, license/changelog/rollback/owner acceptance. Class/Assignment giai đoạn sau.

## NEED_DECISION — giữ nguyên việc chờ owner

| Quyết định | Các phương án, không tự chọn |
| --- | --- |
| Grammar III | A giữ charset/length hiện tại; B grammar hẹp với inputPolicyId mới; C policy theo preset được duyệt. |
| Display rounding | A exact fraction; B owner chọn digits/mode; C fraction kèm decimal xấp xỉ có policy. Giữ rational gốc. |
| Limits/grouping | A duyệt tạm1000 và nhóm I→II→III; B đổi limits/grouping với version/regressions. |
| Persistence/collector/report stack | A local practice+HTML; B collector được duyệt+HTML; C thêm PDF sau đánh giá. Kiến trúc storage/coordination chính cần owner duyệt. |
| THPT presets | A hoãn, chỉ custom-v1; B chọn môn/năm/văn bản chính thức trước triển khai. |

Không có mâu thuẫn mới giữa hai contract cần tự chốt. Các decision trên không chặn sửa findings đã có expected rõ. assumptions: NONE mới; giữ giả thiết tạm M1 có nhãn. recommended_action: giao glue sửa F01/F02 và regression theo vùng, chốt source hashes/checks lại sau sửa; chưa nghiệm thu toàn sản phẩm. tools_research: không giao nghiên cứu/cài mới. privacy_notes: chỉ dữ liệu kỹ thuật và fixture, không chỉ thị riêng hay credential.
