# LC03 — Kiểm định toàn bộ sản phẩm, vòng 3

- review_id/task_id/worker_id: LC03; reviewer: Codex.
- verified_at: 2026-11-14, khoảng 03:11–03:18, Asia/Bangkok.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch: `main`; đối tượng kiểm định: HEAD + working tree (gồm untracked).
- requirements_version: Shared Product Contract v2.0 (ưu tiên cao nhất); M1-scoring-contract v1.0 đọc toàn văn; READINESS §6 B1-AC01…08/B1-T01…17.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo LC03; không phải nghiệm thu M1/toàn sản phẩm, không FULLY_VERIFIED.
- findings_summary: **1 BLOCKER, 2 MAJOR, 1 MINOR**, tất cả tái hiện lại từ LC02; không đóng finding dựa trên unit tests xanh.

## Snapshot và thay đổi so với lần review trước

Git log --all vẫn chỉ có baseline. Không có commit mới sau LC02. Git diff --stat với HEAD: ops/m1/tasks.json 222 dòng thay đổi; ops/run_tasks.py 138; package.json 10; tổng 346 insertions/24 deletions. Đây là diff so baseline, không phải diff mới sau LC02. Mã src/test còn untracked nên git diff riêng không đại diện toàn bộ sản phẩm.

Sáu file domain trùng toàn bộ hash trong LC02. Gate typecheck cải thiện từ **21 diagnostics (LC02) xuống 7 (LC03)**: hiện có test/domain/ambient-node.d.ts, không còn TS2591 thiếu node:* declarations và không còn diagnostic shuffle.test.ts:287. Chưa có snapshot toàn bộ test/ops ở LC02 để khẳng định byte diff hoặc tác giả thay đổi. Không kết luận tất cả working tree không đổi.

| src/domain file | SHA256 |
| --- | --- |
| judge.ts | 8FD98C77E6F9BBC96029BA5E2D0DB719C61725BA951BE7CE4053C5ACBFF6F23A |
| model.ts | 73C013F90751294B69771DF246FD5F2CE1011B93857452659A614C906B71EF76 |
| rational.ts | 968D4703852CC0612772BB49CD5C25BF9F30C6F13DF6ADB3D268A30A7C796054 |
| shortAnswer.ts | 35A6ED980AB8301EC8161D2B9373E8F3E582FD87534BEAAEB47A22C2F3DF7A6C |
| shuffle.ts | B1549978905E9716AD6BB9B9E3499B9F01C80B7D02BF01A3CCF301C82F7C7053 |
| validate.ts | 24CFE9852622E05601D1BE1639F3D9936129A35BE36CF2C3DAACCA7CF4C18C91 |

files_reviewed: toàn bộ mã sản phẩm hiện có tại sáu file src/domain ở bảng trên, assertions/cấu trúc năm test/domain/*.test.ts, ambient-node.d.ts, package.json/tsconfig.json/lock metadata, oracle README và runtime năm fixtures, LC01/LC02, các hợp đồng/READINESS nêu trên. Đã kiểm inventory src/test và tìm AGENTS.md trong workspace và D:\\; không tìm thấy.

Không có student UI, builder, collector, persistence hoặc importer trong src. Dashboard/workers HTML và ops là công cụ điều phối, không phải frontend luyện thi. Không kiểm toán toàn bộ ops, cấu hình agent riêng, supply chain hay mọi Git history; không đọc prompt riêng của agent khác. Không cần web research để quyết định các lỗi nội bộ theo hợp đồng đã cung cấp.

## Findings

### LC03-F01 — BLOCKER — Public scoring engine, maxima và DTO chưa tồn tại

- previous: LC02-F01 / LC01-F01, **OPEN, VERIFIED**.
- affected_files: src/domain/index.ts, src/domain/examMax.ts, src/domain/scoreAttempt.ts, src/domain/serialize.ts **không tồn tại**; không có line để dẫn cho file thiếu. Yêu cầu: docs/contracts/M1-scoring-contract.md §4.6–4.8.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence: inventory chỉ có sáu module nền tảng; runtime import riêng cả bốn module trả ERR_MODULE_NOT_FOUND. Không có test/acceptance suite.
- reproduction_steps: tại D:\\Cunata chạy `node --input-type=module -e "await import('./src/domain/index.ts')"`; thay index bằng examMax/scoreAttempt/serialize. Bộ probe cuối báo cáo cũng thực thi đủ bốn import.
- expected: API computeExamMax, scoreAttempt, strict DTO và barrel đúng chữ ký; điểm/max từng phần/tổng bằng rational; validation fail-closed và engine/version metadata.
- actual: không có đường gọi public để chấm một attempt thành ScoreResult. Oracle không phải implementation sản phẩm.
- impact: chặn hoàn thành/kiểm nghiệm M1 và luồng kết quả sản phẩm. Đây là thiếu triển khai, chưa phải bằng chứng engine hiện có trả điểm sai.
- minimal_fix: hoàn tất M1-B1/B2/B3 trong đúng vùng, nối public API; không thay engine bằng oracle hoặc chuẩn hóa về /10.
- regression_test: public API đối chiếu đủ 1.632 fixtures độc lập; max 5/10/15/16, N3=0/3/7, BASE=9,75/10/10,25; II k=0…4 và null; III exact/invalid; total=sum(parts), full=max, bounds, purity, permutations, snapshot/version isolation; DTO strict roundtrip và mutation controls.

### LC03-F02 — MAJOR — Strict typecheck còn 7 diagnostics

- previous: LC02-F02 / LC01-F02, **OPEN, PARTIALLY IMPROVED**.
- affected_files: src/domain/rational.ts:103,146,147; src/domain/validate.ts:253; test/domain/judge.test.ts:143,144,227.
- **VÙNG chịu trách nhiệm: src/domain** (4 diagnostics source), **glue** (3 diagnostics test).
- evidence/reproduction_steps: `npx --no-install tsc -p tsconfig.json`, compiler thật 7.0.2, exit=1.
- expected: tsconfig strict + noUncheckedIndexedAccess hiện hành qua gate, exit=0.
- actual: TS2345 tại rational array access/regex captures; TS2352 tại Record→Question; TS2345 hai chỗ key array access trong judge tests, TS2322 tại answers có thể chứa undefined.
- impact: không đạt gate typecheck. Node type stripping cho phép 120 runtime tests xanh mà vẫn có lỗi kiểu; không gọi đây là web build fail khi chưa có build.
- minimal_fix: for-of hoặc narrow phần tử/captures có bằng chứng, dùng cấu trúc kiểu đã kiểm chứng cho map Question, sửa fixture/index narrowing trong tests; giữ strict. Ambient declarations hiện có chỉ là khai báo cục bộ, không chứng minh toàn bộ Node API contracts.
- regression_test: giữ source và tests trong tsconfig, đúng lệnh trên và npm test cùng exit=0; không dùng bỏ file/tắt strict để che lỗi.

### LC03-F03 — MAJOR — Snapshot tắt trộn của đề xen phần bị validator từ chối

- previous: LC02-F03 / LC01-F03, **OPEN, VERIFIED**.
- affected_files: src/domain/shuffle.ts:116–117,251–260; schema chấp nhận nguồn xen phần tại src/domain/validate.ts:201.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence/reproduction_steps: exam hợp lệ có thứ tự III q3 → I q1 → II q2; validateExamVersion trả ok=true. Gọi generator và validator với seed LC03, đủ bốn tổ hợp flags; xem bộ probe cuối báo cáo.
- expected: snapshot generator của exam hợp lệ được validator chấp nhận; shuffleQuestions=false giữ nguyên nguồn theo contract; khi bật thì nhóm phần theo giả thiết kỹ thuật hiện hành.
- actual: (false,false)/(false,true) trả [q3,q1,q2] nhưng mỗi snapshot có hai SECTION_ORDER_INVALID. Hai tổ hợp shuffleQuestions=true trả [q1,q2,q3], issues=[].
- impact: consumer validate/restore không dùng được snapshot hợp lệ do generator tạo khi tắt trộn. Chưa có persistence/browser để chứng minh mất bài thực tế.
- minimal_fix: cho validator nhận nguyên thứ tự nguồn bên cạnh thứ tự đã nhóm phần, giữ checks hoán vị/ID/options; không tự sắp lại nguồn khi flag tắt. Nếu bắt nguồn phải nhóm phần thì phải sửa contract/schema được owner duyệt.
- regression_test: III→I→II và I→III→I, đủ bốn flags; generator→validator hợp lệ, false giữ nguồn; thiếu/trùng/unknown/foreign IDs vẫn bị từ chối. Test hiện có lấy nguồn đã nhóm phần nên không bắt lỗi.

### LC03-F04 — MINOR — Catch của cả hai validator có thể tiếp tục ném lỗi

- previous: LC02-F04 / LC01-F04, **OPEN, VERIFIED**.
- affected_files: src/domain/validate.ts:208,383.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence/reproduction_steps: `validateExamVersion({get examId(){throw Object.create(null)}})`; với validExam gọi `validateAttemptResponses(validExam,{get attemptId(){throw Object.create(null)}})`. Cả hai nằm trong assert.doesNotThrow ở probe.
- expected: unknown input được từ chối bằng Validated với TYPE_MISMATCH, không exception theo §4.3.
- actual: String(err) trong catch ném TypeError: Cannot convert object to primitive value.
- impact: lọt exception qua biên validation. Chỉ tái hiện ở object/accessor JavaScript đặc biệt; JSON thông thường không mang getter. Không suy diễn thành exploit mạng hay mất dữ liệu thực tế.
- minimal_fix: message fallback hằng hoặc formatter được bảo vệ để không thể ném; không chuyển kiểu tùy ý exception không tin cậy trong catch.
- regression_test: cả hai validators với Error thường, null-prototype thrown value, toString ném lỗi; assert doesNotThrow và TYPE_MISMATCH. Test hiện có chỉ kiểm getter ném Error thường.

## checks_run

Môi trường: Windows PowerShell, D:\\Cunata, Node v24.14.0, npm 11.9.0, TypeScript 7.0.2, Python 3.11.0. Artifact: báo cáo này (probe đầy đủ bên dưới) và output trực tiếp của phiên; không tạo log/test file ngoài scope. Không npm install, thêm dependency, sửa code, commit hay deploy.

| Command/check | Exit | Kết quả thực tế LC03 |
| --- | ---: | --- |
| git status --short; git log --all --oneline; git diff --stat; git rev-parse HEAD; inventory src/test | 0 | Một baseline; mã sản phẩm untracked; diff như snapshot. |
| Get-FileHash src/domain/*.ts -Algorithm SHA256 | 0 | Sáu hash trùng LC02. |
| npm test | 0 | **120 pass / 0 fail**, 27 suites, 0 skipped/cancelled/todo; duration_ms=193.6009. Exhaustive II 1.296 vectors nằm trong một test. |
| npx --no-install tsc -p tsconfig.json | 1 | **FAIL, 7 diagnostics**, đã chạy thật; không ghi NOT_RUN theo ghi chú môi trường cũ. |
| npx --no-install tsc --version | 0 | 7.0.2. |
| python -B test/oracle/oracle.py --check | 0 | **11 pass / 0 fail / 0 skip**; 1.632 cases/5 fixtures, 5.849 maxima configs, 9 negative controls, seed 20261114; duration_s=0.988. Chỉ tự kiểm oracle. |
| Trích JS phụ lục LC01 rồi pipe node --input-type=module | 1 | **4 tests: 1 pass / 3 fail**, duration_ms=60.2218. Fail F01/F03/F04; pass schema cả 1.632 fixtures và judge section totals/exact III. |
| Probe LC03 trong phụ lục → node --input-type=module | 1 | **10 probe checks: 2 pass / 8 fail**; 4 imports thiếu, 2 flags tắt trộn fail, 2 catch fail; 2 flags bật trộn pass. Không cộng probe checks vào npm test count. |
| Probe strict fraction parser với 1 hoặc 1/2 kèm LF/CR/CRLF | 0 | **5 tests: 5 pass / 0 fail**, duration_ms=5.7626; đều ném SyntaxError đúng. Không ghi thành finding khi giả thuyết không tái hiện. |
| Đọc package scripts và inventory build | 0 | Chỉ test/typecheck; build web **NOT_RUN / NOT_IMPLEMENTED**, không có frontend/build config hoặc build script sản phẩm. |
| rg API/secret patterns trong src + test/domain | 0 | Không thấy mẫu network/I/O/parseFloat/secret đã quét trong src; Math.random/Date.now ở tests chặn API. Không phải full secret/security audit. |
| Lint, browser/E2E, mobile/IME/a11y/performance, collector/importer integration | — | **NOT_RUN**: chưa có setup/implementation sản phẩm tương ứng. |

Thời lượng từng command/probe có trong output phiên, không đo benchmark production hoặc coverage phần trăm. Không chạy build giả hay cài tool để lấp gate. Không chứng minh dependency được owner phê duyệt chỉ vì đã có trong manifest.

## Traceability và coverage_gaps

| Tiêu chí | Kết quả / giới hạn |
| --- | --- |
| B1-AC01…03 | PARTIAL: rational, judge, charset có unit/fixture probes; engine/maxima/points/status/tổng/DTO thiếu F01. |
| B1-AC04 | PARTIAL: IDs/model/schema có; version isolation, result DTO và snapshot persistence chưa có. |
| B1-AC05 | FAIL F03; chưa thể kiểm điểm sau trộn qua API công khai hoặc reload browser thật. |
| B1-AC06 | FAIL F04; schema JSON thường có tests; scoreAttempt fail-closed chưa triển khai. |
| B1-AC07 | FAIL F02 và thiếu acceptance/mutation suite engine. |
| B1-AC08 | Báo cáo có evidence/limitations; không chứng nhận tích hợp/owner acceptance. |
| B1-T01…06 | Judge/charset/schema kiểm được; điểm và status III invalid qua public engine chưa có. Không đồng nhất unit raw với IME/paste/mobile thật. |
| B1-T07…10 | Rational và oracle chạy được; maxima/counts sản phẩm NOT_IMPLEMENTED. |
| B1-T11…12 | Schema/shuffle có kiểm; F03/F04 mở, score invariance engine chưa chạy được. |
| B1-T13…15 | DTO/version/property tổng/max của engine NOT_IMPLEMENTED; random oracle fixtures không thay tests engine. |
| B1-T16 | DEFERRED: report/UI chưa có, display policy chờ owner. |
| B1-T17 | Có 9 negative controls oracle, mutation suite engine NOT_RUN. |

Chưa có đường end-to-end UI→domain→persistence→collector→report. Không có bằng chứng browser cho refresh/back/forward/offline restore, snapshot cố định, timer background/clock shift, autosubmit/double-submit, hai tab/stale final, migrations/quota/private mode, receipt/retry/idempotency/CORS. Không có import corpus chạy thật cho DOCX/PDF/math/image/table/OCR; không test 2–3 học sinh đồng thời. Không đo frontend performance/a11y/IME/renderer, không chứng nhận security/privacy không còn lỗi. Working tree chung có thể đổi tiếp; kết luận gắn snapshot/hash nêu trên.

## Tính năng lộ trình còn thiếu theo thứ tự ưu tiên

1. **P0 / M1:** engine/maxima/barrel/strict DTO/public acceptance; sửa F01…F04; gate unit + typecheck + oracle differential + mutation/permutation/purity/version. Review lại khi code/hash thực sự đổi.
2. **P1 / M2 làm bài:** entry/nickname không xác thực, UI tiếng Việt/mobile/desktop đủ I/II/III; attempt/version/snapshot cố định; deadline timer/nộp/autosubmit; local persistence, refresh/offline restore, migration/quota/hai tab và chống stale/double-submit.
3. **P1 / M2 kết quả:** score/max từng phần và tổng kể cả 12/15, 11/16; thời gian/trạng thái/câu trả lời/đáp án/lời giải theo policy; tải HTML/PDF offline sau quyết định công nghệ, giữ rational gốc.
4. **P2 / M3 giáo viên:** question bank phân loại môn→lớp→chủ đề→bài→mức độ; reusable versioned questions; custom builder bật/tắt phần, thời gian/lượt/trộn/lời giải, publish snapshot, backup/export/import. Không dùng secret URL làm authorization.
5. **P2 / M4 thu kết quả:** dịch vụ/hosting/Google integration được duyệt; trusted grading khi cần; receipt chính xác local_saved/queued/sending/server_confirmed/failed; idempotency, bounded retry/backoff, lost-response/readback/CORS, privacy/xóa/xuất/backup.
6. **P3 / M5 importer:** DOCX/PDF→IR→preview/sửa→confirm→publish, text/bảng/hình/OMML/LaTeX; scan/OCR khi cần, provenance/confidence/flags, không đoán missing key; giới hạn resource/file lỗi/external relationships.
7. **P3 / mẫu chuẩn THPT:** registry ruleSet theo môn/năm/văn bản kiểm chứng được duyệt; không coi custom-v1 là chuẩn chính thức.
8. **P4 / M6:** build/lint/E2E/security/a11y/keyboard/IME/zoom/mobile/performance thực; rollback/changelog/owner nghiệm thu. Scoring/integrity phải có gate ngay mỗi milestone, không đợi polish.

## Quyết định mở

Không thiếu quyết định để hoàn thành review LC03 hoặc sửa các lỗi kỹ thuật đã chứng minh; handoff không phải NEED_DECISION. Các mục dưới mang **NEED_DECISION khi triển khai liên quan**; reviewer không tự chốt:

| Mục | Phương án cho owner |
| --- | --- |
| Grammar III | Giữ charset/length sa-charset-v1; hoặc policy ID mới với grammar chặt và compatibility. |
| Hiển thị điểm | Phân số chính xác; hoặc decimal với số chữ số/rounding được duyệt, giữ số gốc. |
| Giới hạn câu | Duyệt 1.000; hoặc giới hạn khác sau đo payload/hiệu năng. |
| Nhóm phần | Giữ nguồn khi tắt trộn, validator nhận nguồn; hoặc sửa schema yêu cầu nguồn nhóm phần qua owner. |
| Mẫu chuẩn | Tiếp tục custom; hoặc bổ sung ruleSet riêng theo môn/năm đã kiểm chứng. |
| Thu kết quả/hosting | Workflow local/private; Apps Script đã kiểm integration; hoặc serverless trung gian được duyệt chi phí/quyền. |

recommended_action: giao đúng vùng hoàn tất M1 và sửa bốn finding mở, giữ findings chưa sửa qua vòng tiếp theo; không nghiệm thu chỉ dựa 120 unit tests. Công cụ kiểu hiện có cải thiện gate nhưng chưa sửa source.

privacy_notes: chỉ kết quả kỹ thuật; không hồ sơ riêng, credentials hoặc dữ liệu học sinh. tools_research: NOT_REQUESTED.

## Phụ lục — Probe LC03 không tạo file ngoài scope

Chạy toàn khối tại D:\\Cunata bằng PowerShell. Mã này chỉ import/read/validate trong RAM, không sửa src/test. Exit=1 là kết quả lỗi được kỳ vọng ở snapshot đang review.

```powershell
@'
import assert from 'node:assert/strict';
import { validateExamVersion, validateAttemptResponses } from './src/domain/validate.ts';
import { createPresentationOrder, validatePresentationOrder } from './src/domain/shuffle.ts';
const exam = {
 examId:'e', examVersionId:'ev', ruleSetId:'custom-v1', inputPolicyId:'sa-charset-v1',
 questions:[
  {kind:'III',questionVersionId:'q3',answerKey:'1'},
  {kind:'I',questionVersionId:'q1',options:['a','b','c','d'].map(optionId=>({optionId})),correctOptionId:'a'},
  {kind:'II',questionVersionId:'q2',statements:[1,2,3,4].map(n=>({statementId:'s'+n,answer:false}))}
 ]
};
assert.equal(validateExamVersion(exam).ok,true);
let passed=0,failed=0;
async function check(id,fn) {
 try { await fn(); passed++; console.log(JSON.stringify({id,result:'PASS'})); }
 catch(e) { failed++; console.log(JSON.stringify({id,result:'FAIL',code:e.code,message:e.message})); }
}
for(const name of ['index','examMax','scoreAttempt','serialize'])
 await check('import:'+name,()=>import('./src/domain/'+name+'.ts'));
for(const shuffleQuestions of [false,true]) for(const shuffleOptions of [false,true])
 await check('shuffle:'+shuffleQuestions+','+shuffleOptions,()=>{
  const order=createPresentationOrder(exam,{shuffleQuestions,shuffleOptions},'LC03');
  const issues=validatePresentationOrder(exam,order);
  console.log(JSON.stringify({questionOrder:order.questionOrder,issues:issues.map(i=>i.code)}));
  assert.deepEqual(issues,[]);
 });
await check('exam-catch',()=>assert.doesNotThrow(()=>validateExamVersion({get examId(){throw Object.create(null)}})));
await check('attempt-catch',()=>assert.doesNotThrow(()=>validateAttemptResponses(exam,{get attemptId(){throw Object.create(null)}})));
console.log(JSON.stringify({probe_checks:passed+failed,passed,failed}));
process.exitCode=failed?1:0;
'@ | node --input-type=module
```

Tái chạy suite độc lập cũ (không tạo file):

```powershell
$report = Get-Content docs/reviews/LOOP-01-codex.md -Raw -Encoding UTF8
$body = [regex]::Match($report, "(?s)@'\r?\n(.*?)\r?\n'@ \| node --input-type=module").Groups[1].Value
$body | node --input-type=module
```

