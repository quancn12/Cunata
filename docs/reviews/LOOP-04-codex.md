# LC04 — Kiểm định toàn bộ sản phẩm, vòng 4

- review_id/task_id/worker_id: LC04; reviewer: Codex.
- verified_at: 2026-11-14, khoảng 03:19–03:27, Asia/Bangkok.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch `main`; review HEAD + working tree, gồm untracked.
- requirements_version: Shared Product Contract v2.0 (ưu tiên cao nhất), M1-scoring-contract v1.0 (đã đọc toàn bộ), READINESS §6.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo; chưa nghiệm thu M1 hoặc toàn sản phẩm.
- findings_summary: **1 BLOCKER, 2 MAJOR, 1 MINOR đang mở**. LC03-F02 typecheck đã đóng tại snapshot này; LC03-F04 sửa một phần nhưng còn biến thể tái hiện được.

## Snapshot, diff và phạm vi

Git log --all vẫn chỉ có baseline trên; không có commit mới từ LC03. `git diff --stat` với HEAD: ops/m1/tasks.json 222 dòng thay đổi, ops/run_tasks.py 138, package.json 10; tổng 346 insertions/24 deletions. Đây là diff với baseline, không phải diff riêng LC03→LC04. `src/`, `test/`, `public/`, lockfile và các review vẫn untracked; chỉ xem git diff sẽ bỏ sót mã sản phẩm.

So với hash LC03, rational.ts và validate.ts thay đổi; bốn module khác giữ nguyên. rational.sum đổi sang for-of, parser narrow regex captures; validate bổ sung safeErrorMessage và cast qua unknown. judge.test.ts hiện narrow phần tử key/response, typed StatementAnswer. Các sửa này khiến gate strict typecheck từ 7 diagnostics xuống 0, không tắt strict/noUncheckedIndexedAccess. Không có bản byte snapshot test/public LC03 để kết luận chính xác thời điểm hoặc tác giả từng thay đổi.

| File | SHA256 LC04 |
| --- | --- |
| src/domain/judge.ts | 8FD98C77E6F9BBC96029BA5E2D0DB719C61725BA951BE7CE4053C5ACBFF6F23A |
| src/domain/model.ts | 73C013F90751294B69771DF246FD5F2CE1011B93857452659A614C906B71EF76 |
| src/domain/rational.ts | D0DE13864CEE75CEA8A96298C2CA06110DE040C061C75E9B241CCAED7F95FE25 |
| src/domain/shortAnswer.ts | 35A6ED980AB8301EC8161D2B9373E8F3E582FD87534BEAAEB47A22C2F3DF7A6C |
| src/domain/shuffle.ts | B1549978905E9716AD6BB9B9E3499B9F01C80B7D02BF01A3CCF301C82F7C7053 |
| src/domain/validate.ts | D42ABE42906481A7A4CA210DE355D2A1A35AB7F5A20C70B513B80B6551760F57 |

files_reviewed: toàn bộ sáu module src/domain, các test liên quan/năm suite test/domain, ambient-node.d.ts, package scripts/tsconfig/lock metadata, public/sample-exam.json (toàn bộ), inventory src/test/public, LC03 và probes LC01, oracle README/fixtures qua runtime, hợp đồng và READINESS §6. Đã tìm AGENTS.md trong workspace và kiểm D:\\AGENTS.md: không có áp dụng. Không đọc prompt riêng của agent khác. Dashboard/workers HTML và ops là công cụ điều phối; chưa kiểm toán toàn bộ hệ thống điều phối, supply chain hoặc lịch sử secrets. Không có student frontend/backend/persistence/importer trong src.

## Findings

### LC04-F01 — BLOCKER — Chưa có public scoring engine, maxima và DTO

- previous: LC03-F01, **OPEN / VERIFIED**.
- affected_files: `src/domain/index.ts`, `src/domain/examMax.ts`, `src/domain/scoreAttempt.ts`, `src/domain/serialize.ts` **chưa tồn tại**; không có line cho file thiếu. Yêu cầu M1 contract §4.6–4.8.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence: inventory chỉ có sáu module nền tảng; import thật cả bốn module đều ERR_MODULE_NOT_FOUND. Không có test/acceptance.
- reproduction_steps: `node --input-type=module -e "await import('./src/domain/index.ts')"`; thay index bằng examMax/scoreAttempt/serialize. Probe kế thừa ở phụ lục chạy cả bốn.
- expected: computeExamMax, scoreAttempt, engine/version metadata, tổng và từng phần bằng rational; ScoringInputError cho dữ liệu sai, strict DTO và public barrel đúng chữ ký.
- actual: không có public API chấm attempt thành ScoreResult; chưa thể chạy bảng golden qua engine sản phẩm.
- impact: chặn M1 và đường kết quả. Đây là thiếu triển khai, không phải bằng chứng một engine hiện có cộng sai điểm.
- minimal_fix: hoàn tất M1-B1/B2/B3 đúng hợp đồng; nối API, không dùng oracle làm implementation thay thế.
- regression_test: chạy public engine với đủ 1.632 fixtures độc lập; max 5/10/15/16, BASE 9,75/10/10,25, N3=0/3/7; II k=0…4/null, III exact/invalid/status; bounds/full=max/sum/purity/permutations/version; strict DTO roundtrip và negative/mutation controls.

### LC04-F03 — MAJOR — Generator tắt trộn tạo snapshot bị validator từ chối

- previous: LC03-F03, **OPEN / VERIFIED**, shuffle.ts không đổi hash.
- affected_files: `src/domain/shuffle.ts:116`–117 và 251–260; schema nhận nguồn xen phần tại `src/domain/validate.ts:81` trở đi.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence/reproduction_steps: dùng exam hợp lệ theo thứ tự III q3 → I q1 → II q2 trong probe LC03; chạy đủ bốn cặp flags. validateExamVersion trả ok=true.
- expected: generator→validator hợp lệ; tắt trộn giữ nguồn theo §4.5, bật trộn nhóm I→II→III theo giả thiết kỹ thuật hiện hành.
- actual: hai cặp shuffleQuestions=false giữ [q3,q1,q2] nhưng nhận hai SECTION_ORDER_INVALID; hai cặp true trả [q1,q2,q3], issues=[].
- impact: consumer validate/restore từ chối snapshot do chính generator tạo; chưa có browser/persistence để chứng minh mất bài thực tế.
- minimal_fix: validator chấp nhận thứ tự gốc bên cạnh hoán vị nhóm phần, vẫn kiểm đủ ID/options; không tự sắp nguồn khi flag tắt. Nếu muốn cấm nguồn xen phần phải thay contract/schema qua owner.
- regression_test: III→I→II và I→III→I, bốn cặp flags; false giữ nguồn, true giữ nhóm; missing/duplicate/unknown/foreign IDs vẫn fail. Fixture shuffle hiện lấy nguồn đã nhóm nên không bắt lỗi này.

### LC04-F04 — MINOR — Bộ định dạng exception vẫn có thể thoát khỏi catch

- previous: LC03-F04, **PARTIALLY FIXED / OPEN**. Null-prototype thrown value và throwing toString nay qua đúng; không giữ nguyên bằng chứng lỗi cũ như còn fail.
- affected_files: `src/domain/validate.ts:19`–27, nhất là 20; callers :218 và :393.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence: probe mới 10 checks, 6 pass/4 fail. `err instanceof Error` và `err.message` nằm ngoài try bên trong safeErrorMessage. Proxy có getPrototypeOf ném lỗi hoặc Error có message getter ném lỗi làm cả hai validator ném `secondary` ra ngoài.
- reproduction_steps: `const e=Object.defineProperty(new Error('x'),'message',{get(){throw 'secondary'}}); validateExamVersion({get examId(){throw e}})`; tương tự attemptId với validateAttemptResponses(validExam,...). Thay e bằng `new Proxy({},{getPrototypeOf(){throw 'secondary'}})` cũng fail. Mã đầy đủ ở phụ lục.
- expected: trả `{ok:false, issues:[{code:'TYPE_MISMATCH',...}]}` cho unknown input, không crash theo §4.3.
- actual: exception thứ hai thoát public validator.
- impact: vi phạm biên no-throw với object JavaScript đặc biệt. JSON thường không mang getter/proxy; không suy diễn thành exploit mạng hay mất dữ liệu thực tế.
- minimal_fix: dùng message fallback hằng hoặc bao toàn bộ xử lý exception (kể cả instanceof/message access) trong try với fallback không thể ném; kiểm message là string.
- regression_test: cả hai validator với Error thường, null-prototype, throwing toString, Error.message getter và Proxy.getPrototypeOf; assert doesNotThrow, ok=false và TYPE_MISMATCH. Cần bổ sung regression thật vào suite worker, hiện các probes chỉ chạy trong RAM.

### LC04-F05 — MAJOR — Đề mẫu không đủ điều kiện dùng để luyện/chấm thật

- previous: **NEWLY IDENTIFIED / VERIFIED**; không khẳng định mới được thêm sau LC03.
- affected_files: `public/sample-exam.json:15`, :31–36, :143–145.
- **VÙNG chịu trách nhiệm: glue** (asset public, ngoài src).
- evidence/reproduction_steps: parse UTF-8 JSON, validateExamVersion trả ok=true; chọn câu q02, cả opt-2a và opt-2b đều text `$-1$`. Phép tính 3−2×2=−1; judgeI trả correct cho a, wrong cho b. q07 hỏi min x²+x trên [-1,2], đỉnh x=−1/2 cho −1/4, trong khi answerKey là `-0,5`; judgeIII chấp nhận key sai này. Chính explanation ghi −0,25 rồi áp một đáp án quy ước khác. `checkShortAnswer('-0,25')` trả too_long (5 ký tự). q01 yêu cầu bảng biến thiên “như hình vẽ”, nhưng không có hình/reference trong record và public chỉ chứa file JSON.
- expected: câu I chỉ có một đáp án đúng; key III khớp nội dung và biểu diễn được trong bốn ký tự; câu dùng hình có asset hoặc nội dung đủ dữ kiện.
- actual: hai lựa chọn toán học cùng đúng nhưng chấm theo ID khác nhau; câu III chấp nhận đáp án sai và không cho đáp án toán học đúng theo policy; câu I thiếu dữ kiện.
- impact: nếu dùng asset hiện tại làm đề luyện, học sinh có thể bị chấm sai hoặc không giải được. Chưa có UI load asset hay public engine để chứng minh điểm tổng/browser; không quy kết đây là lỗi số học của domain. Structural validator không có nhiệm vụ tự giải toán.
- minimal_fix: sửa distractor q02; thay nội dung q07 bằng bài có đáp án đúng biểu diễn được trong bốn ký tự rồi kiểm lại key/lời giải; bổ sung bảng/hình q01 hoặc đổi sang câu tự đủ dữ kiện. Không nới charset/length hoặc cố sửa engine để hợp thức hóa key sai.
- regression_test: kiểm nội dung sample độc lập trước dùng, neo literal cho q02/q07 và asset reference tồn tại; public grading test chọn mọi option có giá trị đúng chỉ sau khi câu hết mơ hồ. Không chỉ test schema hoặc expected bằng chính answerKey.

## Finding đã đóng

**LC03-F02 — CLOSED / VERIFIED tại LC04.** `npx --no-install tsc -p tsconfig.json` chạy thật exit=0, không diagnostics; npm test 120/120. Compiler local 7.0.2, Node 24.14.0; tsconfig vẫn strict, noUncheckedIndexedAccess, include src/test. Không ghi NOT_RUN theo ghi chú “tsc chưa cài” cũ trong hợp đồng. Ambient Node declarations là stub cục bộ, chưa phải kiểm chứng toàn bộ typing Node runtime. Cast qua unknown không thay runtime validation; không dùng typecheck xanh làm chứng nhận validation hoặc engine.

## checks_run

Môi trường Windows/PowerShell, D:\\Cunata; Node v24.14.0, npm 11.9.0, TypeScript 7.0.2, Python 3.11.0. Artifact bền: báo cáo này; output lệnh trong phiên. Không tạo file test/log ngoài scope, không npm install/thêm dependency/sửa code/commit/deploy.

| Command/check | Exit | Kết quả thực tế |
| --- | ---: | --- |
| git status --short, git log --all -8 --oneline, git rev-parse HEAD, git diff --stat, git diff -- package.json | 0 | Snapshot như trên; untracked src/test/public, một baseline. |
| Get-FileHash src/domain/*.ts -Algorithm SHA256 | 0 | Hai module đổi hash so LC03, bốn giữ nguyên. |
| npm test | 0 | **120 pass / 0 fail**, 27 suites, 0 skip/cancel/todo, duration_ms=525.0852. Exhaustive II 1.296 vectors nằm trong một test. |
| npx --no-install tsc -p tsconfig.json | 0 | **PASS**, 0 diagnostics; wall time 2,48s. |
| npx --no-install tsc --version | 0 | 7.0.2. |
| python -B test/oracle/oracle.py --check | 0 | **11 pass / 0 fail / 0 skip**, 1.632 cases/5 fixtures, 5.849 maxima configs, 9 negative controls, seed 20261114, duration_s=2.1927 (unittest 0.948s). Chỉ oracle tự kiểm. |
| LC01 probe trích từ báo cáo rồi pipe node --input-type=module | 1 | **4 tests: 2 pass / 2 fail**, duration_ms=63.8553. Pass catch cũ và toàn bộ schema/judge section totals 1.632 fixtures; fail public import và snapshot tắt trộn. |
| LC03 probe trích từ báo cáo rồi pipe node --input-type=module | 1 | **10 checks: 4 pass / 6 fail**: bốn import thiếu, hai flags false fail; hai flags true và hai catch cũ pass. |
| LC04 exception probe ở phụ lục | 1 | **10 checks: 6 pass / 4 fail**; hai biến thể mới fail ở cả hai validators. |
| LC04 sample content probe ở phụ lục | 1 | **3 checks: 0 pass / 3 fail**: multiple correct options, wrong minimum key, missing figure. Schema sample PASS. |
| npm run + inventory src/public/package scripts | 0 | Chỉ scripts test/typecheck; **web build NOT_RUN / NOT_IMPLEMENTED**, không có frontend/build script sản phẩm. Không chạy build giả. |
| rg mẫu network/I/O/numeric answer parsing/secrets trong src | 1 (không khớp) | Không tìm thấy các mẫu đã quét; chỉ scan hẹp, không phải full security audit. |
| Lint, browser/E2E, mobile/IME/a11y/performance, collector/importer integration | — | **NOT_RUN**: chưa có setup/implementation tương ứng. |

Không cộng số checks thủ công hoặc oracle vào 120 npm tests. Không có web build để đo bundle; không đánh đồng typecheck với web build. Search AGENTS rộng trên D:\\ gặp Access denied tại WindowsApps; kiểm workspace/ancestor trực tiếp không bị chặn. Không dựa vào các thư mục không liên quan để review.

Kiểm cuối lúc 03:26: domain hashes giữ nguyên; working tree có thêm `styles/style.css` (17.488 bytes, LastWriteTime 03:25:35) do hoạt động đồng thời ngoài scope reviewer. Đã kiểm inventory/header/các mẫu CSS, chưa review hoặc render toàn bộ asset này; chưa có entry HTML sản phẩm trong root (chỉ dashboard.html/workers.html), src vẫn chỉ có sáu domain modules. Không suy diễn stylesheet rời thành frontend hoàn thiện. Kết luận về UI/build là theo snapshot này; cần review bổ sung nếu worker tiếp tục tạo entry hoặc logic sản phẩm.

## coverage_gaps và traceability

| Tiêu chí | Trạng thái / giới hạn |
| --- | --- |
| B1-AC01…03; T01…06 | PARTIAL: rational/judge/charset/schema chạy được, exhaustive II và fixture probes qua; engine/lookup points/status/tổng thiếu F01. F05 cho thấy schema đúng chưa bảo đảm nội dung/key đúng. |
| B1-AC04; T11/T14 | IDs/schema có; snapshot/version/result isolation đầy đủ và DTO chưa triển khai. |
| B1-AC05; T12 | FAIL F03; unit có independent flags/options, chưa kiểm score invariance public engine hoặc browser reload. |
| B1-AC06 | PARTIAL, F04 vẫn vi phạm unknown no-throw; scoreAttempt fail-closed chưa có. |
| B1-AC07 | Unit/typecheck PASS; acceptance/differential/mutation engine thiếu. 9 controls oracle không thay mutation suite SUT. |
| B1-AC08 | Báo cáo có evidence/limitation; chưa có tích hợp/owner acceptance. |
| T07…10/T13/T15 | Oracle/rational chỉ chứng minh phần tương ứng; maxima/API/bounds/tổng/DTO engine NOT_IMPLEMENTED. |
| T16/T17 | Display DEFERRED, policy chưa duyệt; mutation engine NOT_RUN. |

Chưa có đường UI→domain→persistence→collector→report. Chưa test browser refresh/back/forward/offline, snapshot không reroll, timer background/clock shift, manual/double/autosubmit, hai tab/stale final, migration/quota/private mode, receipt/retry/backoff/idempotency/CORS, 2–3 học sinh đồng thời. Chưa có import corpus DOCX/PDF nhiều cột/công thức/hình/bảng/OCR; chưa đo UI mobile/desktop, Vietnamese IME, keyboard/a11y/zoom/performance hoặc full secrets/dependency/license audit. Không chứng nhận answer-key secrecy/trusted grading khi chưa có chính sách/đường phục vụ sản phẩm. Public sample là dữ liệu luyện mẫu chưa có secrecy policy, không tự gọi việc có key trong sample là rò rỉ bài thi bảo mật.

## Tính năng lộ trình còn thiếu, theo ưu tiên

1. **P0 / M1:** engine/maxima/barrel/strict DTO và acceptance; sửa F01/F03/F04, giữ unit/typecheck gates; chạy public differential/oracle, permutation/purity/version và mutation controls. Sửa F05 trước dùng sample.
2. **P1 / M2 làm bài:** entry/nickname không xác thực, UI tiếng Việt mobile/desktop đủ I/II/III; attempt/version/order snapshot; deadline/nộp/autosubmit; local save/offline restore/refresh, migrations/quota, hai tab và chống stale/double-submit.
3. **P1 / M2 kết quả:** score/max từng phần/tổng cả 12/15, 11/16; thời gian, trạng thái, câu trả lời/key/lời giải theo policy; report offline HTML/PDF sau duyệt công nghệ, giữ rational gốc.
4. **P2 / M3:** question bank môn→lớp→chủ đề→bài→mức độ; reusable versioned questions; custom builder bật/tắt phần/thời gian/lượt/trộn/lời giải, publish snapshot, backup/export/import. Không coi URL bí mật là quyền admin.
5. **P2 / M4:** dịch vụ thu kết quả/Google/hosting được duyệt; trusted grading khi cần; local_saved/queued/sending/server_confirmed/failed đúng receipt; idempotency, bounded retry/backoff/lost-response/CORS, hạn chế dữ liệu cá nhân và xóa/xuất/backup.
6. **P3 / M5:** DOCX/PDF→IR→preview/sửa→confirm→publish; paragraph/table/image/OMML/LaTeX, text PDF/scan/OCR khi cần; provenance/confidence/flags; không đoán key, giới hạn resource/file hỏng/external relationships.
7. **P3 / mẫu chuẩn:** ruleSet riêng theo môn/năm/văn bản chính thức đã kiểm chứng và duyệt; không gọi công thức custom là chuẩn THPT.
8. **P4 / M6:** frontend build/lint/E2E, security/privacy/a11y/IME/keyboard/mobile/performance thật, rollback/changelog và nghiệm thu owner. Integrity gates thực hiện ngay từng milestone.

## Quyết định mở

Không cần thêm quyết định để hoàn thành LC04 hoặc sửa các lỗi kỹ thuật trên; handoff READY_FOR_REVIEW. Các hạng mục dưới **NEED_DECISION khi triển khai liên quan**, reviewer không tự chốt:

| Hạng mục | Phương án cho owner |
| --- | --- |
| Grammar III | Giữ charset/length sa-charset-v1; hoặc policy mới với grammar chặt và compatibility. F05 có thể sửa bằng đổi câu, không cần nới policy. |
| Hiển thị điểm | Phân số chính xác; hoặc decimal với digits/rounding duyệt rõ, giữ số gốc. |
| Số câu | Duyệt giới hạn tạm 1.000; hoặc chọn giới hạn sau đo payload/hiệu năng. |
| Nhóm phần | Giữ nguồn khi tắt trộn và sửa validator; hoặc duyệt schema mới buộc nguồn nhóm phần. |
| Mẫu chuẩn | Tiếp tục custom; hoặc thêm ruleSet theo môn/năm đã kiểm chứng. |
| Thu kết quả/hosting/report | Local/private; Apps Script đã test integration; hoặc serverless trung gian được duyệt chi phí/quyền. Report HTML hoặc PDF theo quyết định công nghệ. |

recommended_action: giao đúng vùng hoàn tất M1, sửa snapshot/exception boundary và nội dung sample, thêm regression tương ứng; giữ CHANGES_REQUESTED cho sản phẩm, công nhận typecheck đã sửa. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật, không hồ sơ riêng/credentials/dữ liệu học sinh.

## Phụ lục — Tái hiện không tạo file ngoài scope

Các khối chạy tại D:\\Cunata, chỉ đọc/import và assert trong RAM. Exit=1 hiện tại phản ánh các checks fail, không phải PASS.

Tái chạy probe LC03 (10 checks) hoặc LC01 (4 node:test tests), thay tên report tương ứng:

```powershell
$report = Get-Content docs/reviews/LOOP-03-codex.md -Raw -Encoding UTF8
$body = [regex]::Match($report, "(?s)@'\r?\n(.*?)\r?\n'@ \| node --input-type=module").Groups[1].Value
$body | node --input-type=module
```

Exception boundary:

```powershell
@'
import assert from 'node:assert/strict';
import {validateExamVersion,validateAttemptResponses} from './src/domain/validate.ts';
const exam={examId:'e',examVersionId:'v',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'III',questionVersionId:'q',answerKey:'1'}]};
let pass=0,fail=0;
for(const [name,makeError] of [
 ['normal',()=>new Error('ordinary')],
 ['null-prototype',()=>Object.create(null)],
 ['throwing-toString',()=>({toString(){throw 'secondary'}})],
 ['throwing-message',()=>Object.defineProperty(new Error('x'),'message',{get(){throw 'secondary'}})],
 ['throwing-getPrototypeOf',()=>new Proxy({},{getPrototypeOf(){throw 'secondary'}})]
]) for(const kind of ['exam','attempt']) {
 try {
  const input=Object.defineProperty({},kind==='exam'?'examId':'attemptId',{get(){throw makeError()}});
  const result=kind==='exam'?validateExamVersion(input):validateAttemptResponses(exam,input);
  assert.equal(result.ok,false);assert.equal(result.issues[0].code,'TYPE_MISMATCH');
  pass++;console.log(name+':'+kind+' PASS');
 }catch(e){fail++;console.log(name+':'+kind+' FAIL escaped='+String(e))}
}
console.log(JSON.stringify({checks:pass+fail,pass,fail}));process.exitCode=fail?1:0;
'@ | node --input-type=module
```

Nội dung đề mẫu (kiểm hình là kiểm record/inventory, chưa render browser):

```powershell
@'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateExamVersion} from './src/domain/validate.ts';
import {judgeI,judgeIII} from './src/domain/judge.ts';
import {checkShortAnswer} from './src/domain/shortAnswer.ts';
const e=JSON.parse(fs.readFileSync('public/sample-exam.json','utf8'));
console.log('sample schema valid='+validateExamVersion(e).ok);
const q=e.questions.find(q=>q.questionVersionId==='q02-i-tich-phan');
const opts=q.options.filter(o=>o.text==='$-1$');
console.log(JSON.stringify({correctValue:3-2*2,options:opts.map(o=>({id:o.optionId,judgment:judgeI(q,{kind:'I',questionVersionId:q.questionVersionId,selectedOptionId:o.optionId})}))}));
const s=e.questions.find(q=>q.questionVersionId==='q07-iii-gia-tri-nho-nhat');
const vertex=-0.5;console.log(JSON.stringify({minimum:vertex*vertex+vertex,key:s.answerKey,keyJudgment:judgeIII(s,{kind:'III',questionVersionId:s.questionVersionId,raw:s.answerKey}),correctRaw:'-0,25',correctRawIssues:checkShortAnswer('-0,25')}));
let pass=0,fail=0;
for(const [id,fn] of [
 ['single-correct-option',()=>assert.equal(opts.length,1)],
 ['minimum-key',()=>assert.equal(s.answerKey,'-0,25')],
 ['figure-present',()=>{const a=e.questions[0];assert.ok(a.image||a.images||a.media||a.content.includes('<img')||a.content.includes('!['))}]
])try{fn();pass++;console.log(id+' PASS')}catch{fail++;console.log(id+' FAIL')}
console.log(JSON.stringify({checks:3,pass,fail}));process.exitCode=fail?1:0;
'@ | node --input-type=module
```
