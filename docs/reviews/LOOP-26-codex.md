# LC26 — Kiểm định độc lập toàn sản phẩm

**verdict: CHANGES_REQUESTED.** Một finding MAJOR mới còn mở: LC26-F01, nhận final có raw I/III sai kiểu qua save/submit. LC25-F02 và LC25-F03 đã FIXED / RETESTED với repro độc lập. Các gate xanh không đồng nghĩa toàn sản phẩm đã hoàn thành hay đã nghiệm thu M2.

review_id/task_id: LC26; reviewer: Codex; reviewed_at: 2026-11-14; risk_level: HIGH. requirements_version: Shared Product Contract v2.0 và M1-scoring-contract v1.0, đã đọc toàn bộ; READINESS của Codex §6 dùng đối chiếu B1-AC01…08/T01…17.

## Revision, phạm vi và quyền ghi

- base_commit đầu LC26: `3cffd2aa867ebf204edab305aecda69d27e49db9`, branch main. LC25 có base efb5d09 và head cuối 3cffd2a; đã xem log/diff efb5d09→working tree để bao gồm các sửa đang chạy cuối vòng trước, rồi phân biệt delta mới của vòng này.
- head_commit cuối: `9c643a4ce46a77f0d091a2479b4020d1789a7cd5` (điều phối commit round9 trong phiên review); dùng hashes bên dưới để định danh chính xác source đã chạy. Reviewer không commit. Delta sản phẩm so efb5d09: README, index.html, test/domain/scoreAttempt.test.ts, test/e2e/demoFlow.test.ts; không thay src/domain, scripts/build.js hoặc dependencies trong delta này.
- **index.html SHA256:** `48C24C4CEE1FF908F6EEC34CD279C7E3C257A9FF2C74C1533B91AAFB2DDFB936` (116761 bytes).
- test/e2e/demoFlow.test.ts: `A15D821D18D7910340DA8B7BFFA832F93F802C0B0F5F3F877A12D4D3E0C7BC81`; test/domain/scoreAttempt.test.ts: `FD198D7A3E58CCA53EFEEA3B4B2CB2F4A2805EB62D9089F5D940CC160DA71DEF`.
- src/domain/serialize.ts: `8A523B406357689F3BDD0444856D07014A00F7AD89C35DE6503F6DD2E35C8C7E`; src/domain/scoreAttempt.ts: `E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE`.
- files_reviewed: src/domain/{model,index,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize}.ts; index.html theo luồng fetch/validate→restore→input/timer/save→submit/adopt→report/download/restart; package.json, lockfile delta, hai tsconfig, scripts/build.js, README; các test domain/oracle/acceptance/VM và diff liên quan. CSS responsive/print/focus và sample/assets được kiểm tĩnh, không phải visual QA. Không tuyên bố audit từng dòng ops/research/dependency history.
- Không tìm thấy AGENTS.md trong inventory repo hoặc tại D:\/repo root. Không đọc prompt riêng worker khác. Chỉ tạo `docs/reviews/LOOP-26-codex.md`; không sửa code/test, không install/dependency, branch/worktree, commit hoặc deploy. Các thay đổi đồng thời của worker được giữ nguyên.

## Finding còn mở

### LC26-F01 — MAJOR — Final I/III sai kiểu raw vẫn được save/submit nhận và khóa bài

- **VÙNG chịu trách nhiệm: glue.** affected_files: `index.html:873–892` (I), `index.html:1002–1019` (III); callers `index.html:1153–1175`, `:1195–1204`, `:1212–1224`, `:1977–1988`, `:2008–2018`, `:2031–2041`.
- evidence: `isValidScoreResult` chỉ kiểm missing/null/empty và nhánh `typeof raw === 'string'`. Raw khác kiểu nhưng khác null không đi qua nhánh đối chiếu nào, rồi validator tiếp tục và trả true. II đã có đối chiếu mọi kiểu; I/III còn thiếu nhánh reject. `loadLocalState` có lớp lọc raw trước kiểm final, nhưng các nhánh adopt trong save/submit gọi validator trực tiếp nên hành vi khác nhau.
- reproduction_steps: tạo đề chỉ một I, q với o0…o3 và key=o0 (labels A…D), hoặc chỉ một III q,key='1'. Dùng scorer thật tạo full report từ raw đúng. Giữ report, identity envelope đúng, thay `responses.q` thành lần lượt `7`, `true`, `{}`, `[]`. Đặt envelope submitted=true vào final key; trên page có cùng identity và responses rỗng gọi `saveLocalState()` hoặc `submitExam()`. Không cần thay source hoặc giả lập đáp án bằng expected của scorer.
- actual: cả 8 trường hợp mỗi đường save/submit nhận full final: I totalFraction='1/4', III='10', submitted=true. Tổng probe 24 cases: **8 pass / 16 fail**, exit1; 8 controls qua `loadLocalState()` reject đúng cùng malformed data. Probe này kiểm corruption/integrity local, không chứng minh vượt xác thực hay collector tin điểm client.
- expected: Shared §2/3/5, M1 §4.3/4.7 và B1-AC04/06: raw sai kiểu phải bị reject/quarantine nhất quán ở mọi đường nhận persisted final; không lấy report full làm chứng cứ rằng người dùng đã trả lời đúng. Scorer domain từ chối các kiểu này thay vì chấm full.
- impact: một final hỏng có thể khóa lượt làm và hiển thị điểm tối đa ở tab đang chạy, nhưng refresh lại mở bài chưa nộp. Mức MAJOR cho integrity dữ liệu persisted hỏng; chưa có bằng chứng sai số học khi raw hợp lệ hoặc mất kết quả bình thường để gọi BLOCKER.
- minimal_fix: bổ sung fail-closed cho raw I/III ngoài string/null/missing ở validator dùng chung và áp dụng cùng quy tắc trên tất cả callers. Phân biệt dữ liệu không hợp lệ với unanswered; không silently biến lịch sử final thành điểm mới. Chưa cần đổi scoring hay schema. Xem xét trả kết quả validate có lý do/quarantine thay boolean để phục hồi rõ ràng.
- regression_test: I/III × raw missing/null/empty/valid-correct/valid-wrong/invalid-string/number/boolean/object/array × load/save/submit và cả main/final key; controls raw hợp lệ phải giữ đúng điểm và trạng thái. Thêm malformed envelope responses và giữ nguyên II missing/null regressions. Probe tái lập ở cuối báo cáo.

## Retest findings cũ

| Finding | Kết quả hiện tại | Bằng chứng |
| --- | --- | --- |
| LC25-F02: II full report, raw thiếu/null | FIXED / RETESTED repro gốc | LC25 block2: valid accepted; missing/empty/null rejected, 4/4 pass. Diff đổi raw II thành đối chiếu unanswered khi không có object. Test suite mới thêm non-object/partial controls. |
| LC25-F03: infinity thành membership | FIXED / RETESTED repro gốc | LC25 block1: đúng một U+005C + infty trả `&#8734;`, không `&isin;`; 5/5 pass cả các controls khác. Regex infinity trước membership có boundary. |
| LC24-F01: own prototype IDs mất khi restore | RETESTED PASS | __proto__ raw được giữ own=true, 10→10; domain test và VM regression đa loại câu cũng pass. Không thay bằng chứng event/browser thật. |
| LC24-F02: foreign II refs / III report trái raw | RETESTED PASS | LC24 block 4/4, LC25 block1 controls reject; không đồng nghĩa toàn bộ kiểu raw đã an toàn: LC26-F01. |

## checks_run

Windows/PowerShell, D:\Cunata; Node v24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Log/output/exit nằm trong tool transcript phiên LC26; không tạo log artifact ngoài scope. Các probe dùng stdin và Node VM, không phải browser E2E.

| Lệnh / kiểm tra thật | Exit | Kết quả và giới hạn |
| --- | ---: | --- |
| `npm test` đầu phiên | 0 | 222 tests,35 suites,222 pass,0 fail/skip/cancel/todo;494.6771ms. |
| `npm test` lần cuối, output qua Select-Object và `exit $LASTEXITCODE` | 0 | **224 tests,35 suites,224 pass,0 fail/skip/cancel/todo;500.8886ms**. Worker thêm hai VM regressions LC25 trong phiên; đã đọc assertions. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Đã chạy thật hai lần, không diagnostics; lần cuối1.719s wall. Không dùng NOT_RUN cũ của contract vì compiler hiện có. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Đã chạy thật, lần cuối1.693s wall; không diagnostics. Include không bao gồm inline JS trong index.html. |
| `node scripts/build.js` | 0 | 8 questions valid; index116761,CSS17769,JSON8566,SVG2584 bytes. **Chỉ kiểm assets/schema/link**, không bundling, browser, publish/deploy. |
| `python -B test/oracle/oracle.py --check` | 0 | 11/11 pass,0 fail/skip;1632 fixtures;5849 maxima configurations;9 negative controls;seed20261114;1.0256s tổng. Oracle-only, tách SUT differential. |
| Trích fenced JS LC20 blocks1/2/3 qua Node stdin | 0 mỗi block | 18/18 +6/6 +9/9 pass; có **domain và web differential 1632 fixtures**, domain DTO roundtrip. Không tính 1632 là số test runner. |
| Tương tự LC22,LC23,LC24 | 0 mỗi block | LC22 6/6,LC23 3/3+3/3,LC24 4/4; refs/status/fractions/formula/escaping/assets controls pass. |
| Tương tự hai blocks LC25 | 0 mỗi block | 5/5 +4/4 pass, index hash48C24…; các failures cũ đã được retest. |
| Probe LC26-F01 (cuối báo cáo) | **1** | **24 cases,8 pass,16 fail**. Đây là bug assertions thật; không ghi gate tổng xanh cho probe này. |
| Probe strict fraction line endings qua Node stdin | 0 | 7 inputs LF/CR/CRLF/U+2028/U+2029 bị SyntaxError như expected; không phát hiện defect mới. |
| `git diff --check -- index.html README.md src test scripts` | 0 | Không lỗi whitespace ở product/test delta. |
| `git diff --check` toàn working tree | Không capture riêng native exit | Báo trailing whitespace có sẵn trong ops logs/output; shell batch cuối exit0 không biến subcommand này thành PASS. Không sửa ngoài scope. |

Không npm install, không fetch external research/dependency advisory: task là review code/contracts cục bộ và không cần xác minh một claim upstream mới. Lint/SAST/advisory/full git-history secret scan **NOT_RUN** (không lint script hoặc tooling scan chuyên dụng trong scope). Search tĩnh sinks/I/O không thay security certification.

## coverage_gaps và traceability

- **B1-AC01–03,T01–09/T15:** domain exact arithmetic, golden max5/15/16, threshold 9.75/10/10.25, III exact characters, exhaustive II16×81, valid fixture permutations/DTO và bất biến điểm có evidence pass. Không tìm counterexample arithmetic mới. III grammar còn mở không được tự thu hẹp.
- **B1-AC04/06,T11/T13:** domain refs/unknown validation và DTO semantic guards có tests; web nhận persisted final chưa đạt do LC26-F01. Inline web duplicate scorer/validator không được typecheck bởi hai tsconfig; differential 1632 fixtures giảm rủi ro raw hợp lệ nhưng không bao phủ trust boundary persisted input.
- **B1-AC05/T12/T14:** domain shuffle flags/seed có unit evidence; web chưa gọi createPresentationOrder hay persist order + immutable exam snapshot. initExam lấy sample mới fetch/embedded, chưa có bank/version publishing workflow để chứng minh source-edit không đổi attempt cũ. Không tuyên bố shuffle UI hoàn tất.
- **Shared §3:** timer dùng deadline, local saves/report có VM checks; localStorage read→write không atomic. Final/final tại khoảng read cuối→setItem vẫn **SUSPECTED / NOT VERIFIED** bằng scheduler trình duyệt; không gọi các read bổ sung là transaction. Revisions chưa chứng minh giải quyết mọi concurrent edit. Không tuyên bố race mới đã tái lập.
- **Browser/mobile/IME/keyboard/AT/two tabs/download-open/visual/performance: NOT_RUN.** Chưa có browser session/screenshot/traces trong lượt này; chỉ có Node VM/stubs và kiểm CSS tĩnh. Chưa kiểm OS Telex/VNI, cold-start offline shell, quota/private-mode recovery, migrations, background autosubmit/clock shift, hoặc mở report trong browser offline thật.
- **Shared §4/6:** runtime vẫn local sample practice; không bank/builder/collector/importer hoàn chỉnh, không endpoint để kiểm Google CORS/receipt/readback/idempotency. Chưa kiểm OCR/text PDF, DOCX media/OMML, provenance/preview-confirm. Client có keys, không phù hợp bài kiểm tra cần giấu keys hoặc điểm server tin cậy.
- **B1-AC07/08,T10/T16/T17:** resource limits/BigInt oversized chưa adversarial toàn diện; chưa chạy mutants trong SUT (oracle negative controls không thay mutation testing SUT), browser CI/security/performance/rollback và owner milestone acceptance. Display fraction kèm decimal không thay owner approval chính sách làm tròn. Không tuyên bố FULLY_VERIFIED/DONE.

## Tính năng lộ trình còn thiếu — theo ưu tiên

1. **P0 — glue:** sửa LC26-F01 và đưa toàn ma trận adoption vào gate; persistence validation/quarantine nhất quán. Browser two-tab final/draft/final-final, quota recovery và immutable exam/order snapshot trước nghiệm thu student milestone.
2. **P1 — student:** chọn/nhập đề thật; attempt ID/lịch sử tách biệt và giới hạn lượt trung thực theo no-login; teacher settings thời lượng, hai cờ shuffle, answer/explanation release; offline refresh/cold-start theo storage đã duyệt; mobile/keyboard/IME/a11y thật. Restart hiện xóa lượt sau xác nhận, chưa là lịch sử nhiều lượt.
3. **P1 — teacher:** bank Môn>Lớp>Chương/Chủ đề>Bài>Mức độ; builder bật/tắt độc lập các phần, reuse question versions, preview/publish; export/import/backup/delete. Không đặt URL bí mật làm phân quyền.
4. **P1 — collector:** dịch vụ owner-controlled đã duyệt; local_saved/queued/sending/server_confirmed/failed; bounded retry/backoff, idempotency, chống stale overwrite; Google CORS/receipt/readback thật, trusted grading/release khi cần. Không báo đã lưu Drive từ local success.
5. **P2 — importer:** DOCX/PDF→IR giữ rich text/tables/images/OMML/math, provenance/confidence/flags→preview/sửa→confirm→save; text/scan/OCR, multi-column, resource limits/corpus. Thiếu answer key không đoán.
6. **P2 — chuẩn hóa/nghiệm thu:** preset THPT theo môn/năm/văn bản đã kiểm chứng tách custom-v1; privacy/security/performance/browser CI, license/changelog/rollback và owner nghiệm thu. Class/Assignment sau MVP.

## NEED_DECISION — các lựa chọn nghiệp vụ còn mở

Không có mâu thuẫn mới giữa hai contract. Những quyết định sau vẫn thiếu phê duyệt trong tài liệu đã đọc; không tự chốt, không chặn sửa LC26-F01 có expected rõ.

| Quyết định | 2–3 phương án cho owner |
| --- | --- |
| Grammar III | A giữ charset/length tạm; B grammar hẹp bằng inputPolicyId mới; C grammar riêng cho preset đã duyệt. |
| Display rounding | A exact fractions; B digits/mode cụ thể owner chọn; C fraction kèm decimal xấp xỉ có nhãn và policy. Giữ rational gốc. |
| Limits/grouping | A duyệt tạm1000 và nhóm I→II→III; B đổi limits/grouping với version và regressions. |
| Storage/collector/report stack | A local practice+HTML; B collector được duyệt+HTML; C thêm PDF sau đánh giá. Phải duyệt lựa chọn công nghệ chính trước triển khai. |
| Preset chuẩn | A hoãn, chỉ custom-v1; B chọn môn/năm/nguồn quy định chính thức trước xây. |

assumptions: NONE mới; các giả thiết tạm M1 vẫn có nhãn, chưa coi được duyệt. recommended_action: trả glue sửa LC26-F01, thêm regressions; owner chọn các policy/stack trước milestone tương ứng. tools_research: không được giao nghiên cứu/cài mới. privacy_notes: chỉ kết quả kỹ thuật/fixtures, không nội dung chỉ thị riêng hay credentials.

## Probe LC26-F01 — tái lập không tạo file ngoài scope

Tại repo root, pipe block JS dưới vào `node --input-type=module`. Dùng helper VM đã có trong LC19; assertions là hành vi cần đạt. Output cuối hiện exit1/tests24/pass8/fail16. Browser thật vẫn NOT_RUN.

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8').match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0];
const probe=String.raw`
let pass=0,fail=0;function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
for(const kind of ['I','III'])for(const value of [7,true,{},[]])for(const method of ['loadLocalState','saveLocalState','submitExam'])check(kind+' raw '+JSON.stringify(value)+' via '+method,()=>{
 const p=page(),e=exam();if(kind==='I')e.questions=[{kind:'I',questionVersionId:'q',options:[0,1,2,3].map(i=>({optionId:'o'+i,label:'ABCD'[i]})),correctOptionId:'o0'}];setExam(p,e);
 p.c.answer=kind==='I'?'o0':'1';p.run('studentState.responses.q=answer');const r=p.run('scoreAttemptLocally()');
 const envelope={examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{q:value},submitted:true,scoreResult:r};
 const key=method==='loadLocalState'?p.key():p.run('getFinalStorageKey(currentExam,studentState)');p.store.set(key,JSON.stringify(envelope));
 p.run('studentState.responses=Object.create(null)');p.run(method+'()');
 const accepted=p.run('studentState.submitted'),total=p.run('studentState.scoreResult?.totalFraction');console.log(JSON.stringify({kind,value,method,accepted,total}));
 if(method==='submitExam')assert.notEqual(total,kind==='I'?'1/4':'10','adopted impossible full score');else assert.equal(accepted,false,'adopted impossible full score');
});
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probe).toString('base64'));
```
