# LC01 — Kiểm định sản phẩm, vòng 1

- review_id/task_id: LC01; reviewer: Codex.
- verified_at: 2026-11-14, 02:57–03:00, Asia/Bangkok.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch: `main`.
- Đối tượng thực tế: HEAD **cộng working tree chưa commit**, không phải chỉ HEAD. `git log -8 --oneline` chỉ có baseline; chưa có review trước trong Git để lấy mốc diff. `git diff --stat` không bao gồm `src/`, `test/` vì chúng đang untracked.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6 (B1-AC01…08, B1-T01…17).
- risk_level: HIGH — scoring, validation, tính toàn vẹn kết quả.
- verdict: **CHANGES_REQUESTED**. Chưa nghiệm thu M1 hoặc toàn sản phẩm. Không FULLY_VERIFIED.
- handoff_status: READY_FOR_REVIEW — báo cáo hoàn tất; trạng thái này không có nghĩa code đạt nghiệm thu.

## Phạm vi đã đọc và snapshot

files_reviewed: toàn bộ 6 file hiện có trong `src/domain/`: `model.ts`, `rational.ts`, `shortAnswer.ts`, `validate.ts`, `judge.ts`, `shuffle.ts`; 5 file `test/domain/*.test.ts`; cấu hình `package.json`, `tsconfig.json`, phần dependency/lock metadata của `package-lock.json`; oracle README và các fixtures bằng kiểm tra runtime; hợp đồng kỹ thuật toàn văn và READINESS §6. Không có AGENTS.md tìm thấy trong cây workspace hoặc hai đường dẫn tổ tiên được kiểm tra.

Không có mã ứng dụng học sinh/giáo viên, backend hoặc importer trong `src/`. `dashboard.html`, `workers.html`, `ops/dashboard/` là công cụ điều phối worker, không phải giao diện luyện thi. Kiểm định chức năng sản phẩm không chứng nhận an toàn toàn bộ hạ tầng điều phối, private agent config, lịch sử secrets hoặc các báo cáo nghiên cứu bên ngoài. Không đọc prompt riêng của agent khác.

SHA256 mã sản phẩm tại thời điểm kiểm tra:

| File | SHA256 |
| --- | --- |
| src/domain/judge.ts | 8FD98C77E6F9BBC96029BA5E2D0DB719C61725BA951BE7CE4053C5ACBFF6F23A |
| src/domain/model.ts | 73C013F90751294B69771DF246FD5F2CE1011B93857452659A614C906B71EF76 |
| src/domain/rational.ts | 968D4703852CC0612772BB49CD5C25BF9F30C6F13DF6ADB3D268A30A7C796054 |
| src/domain/shortAnswer.ts | 35A6ED980AB8301EC8161D2B9373E8F3E582FD87534BEAAEB47A22C2F3DF7A6C |
| src/domain/shuffle.ts | B1549978905E9716AD6BB9B9E3499B9F01C80B7D02BF01A3CCF301C82F7C7053 |
| src/domain/validate.ts | 24CFE9852622E05601D1BE1639F3D9936129A35BE36CF2C3DAACCA7CF4C18C91 |

## Findings

### LC01-F01 — BLOCKER — Chưa có đường chấm điểm công khai và DTO của M1

- affected_files: `src/domain/index.ts`, `src/domain/examMax.ts`, `src/domain/scoreAttempt.ts`, `src/domain/serialize.ts` **không tồn tại**; không gán số dòng giả cho file thiếu. Tham chiếu yêu cầu: `docs/contracts/M1-scoring-contract.md` §4.6–4.8.
- VÙNG chịu trách nhiệm: `src/domain`.
- evidence/actual: import riêng từng module trả `ERR_MODULE_NOT_FOUND`. `npm test` hiện chỉ chạy 5 bộ unit, không có acceptance tests. Judge chỉ trả correctness/count, chưa tạo điểm, max từng phần, total, trạng thái kết quả và metadata phiên bản.
- reproduction_steps: tại `D:\Cunata`, `node --input-type=module -e "await import('./src/domain/index.ts')"`; các import `examMax`, `scoreAttempt`, `serialize` cũng thất bại. Test đầu ở phụ lục tái hiện public entry point thiếu.
- expected: API §4 được export; `scoreAttempt` tự validate, trả phân số chính xác; DTO strict roundtrip; score/max không ép thang 10.
- impact: consumer chưa thể chấm bài hay xuất kết quả bằng sản phẩm; toàn bộ M1 chưa thể được nghiệm thu. Đây là thiếu triển khai tại snapshot, không phải kết luận thuật toán đã chấm sai.
- minimal_fix: hoàn tất các module M1-B1/B2 đúng chữ ký và barrel exports, bổ sung M1-B3 acceptance qua entry point; không dùng oracle làm implementation sản phẩm.
- regression_test: đối chiếu tất cả 1.632 fixtures với `scoreAttempt` thực; maxima 5/10/15/16 và ngưỡng 39/40/41 câu I; k=0…4 phần II; exact III; input invalid ném ScoringInputError; DTO strict; permutation/purity/bounds/full=max; mutation controls của engine.

### LC01-F02 — MAJOR — Typecheck thực tế thất bại

- affected_files: `src/domain/rational.ts:103`, `:146`, `:147`; `src/domain/validate.ts:253`; `tsconfig.json:11`; `package.json:13`; `test/domain/judge.test.ts:143`, `:144`, `:227`; `test/domain/shuffle.test.ts:287`; các import `node:*` đầu 5 file test.
- VÙNG chịu trách nhiệm: `src/domain` (4 diagnostic source); `glue` (cấu hình/types/test).
- evidence: `npx --no-install tsc -p tsconfig.json` exit **1**, 21 diagnostics; tsc hiện có thật, version **7.0.2**. Ghi NOT_RUN vì “tsc chưa cài” sẽ sai tại snapshot này.
- reproduction_steps: chạy đúng lệnh trên với tsconfig hiện có, không cần install.
- expected: cấu hình strict hiện hành typecheck exit 0.
- actual: `xs[i]`, regex captures có thể undefined (TS2345); cast Record thành Question không đủ overlap (TS2352); thiếu khai báo module `node:test`, `node:assert/strict`, `node:fs`, `node:path` (TS2591); test array indexing/narrowing chưa an toàn (TS2345/TS2322/TS18048).
- impact: gate typecheck không đạt dù Node stripping chạy test xanh; source và tests chưa được kiểm chứng kiểu theo cấu hình đã khai báo. Không gọi đây là build web thất bại vì chưa có build web.
- minimal_fix: duyệt/narrow giá trị source một cách an toàn (vd for-of cho sum, captures đã được chứng minh tồn tại); bỏ cast không an toàn bằng cấu trúc map cần thiết; sửa fixture typing/indexing; xử lý Node type declarations trong task được phép. Reviewer không cài dependency và không tắt strict/noUncheckedIndexedAccess để che lỗi.
- regression_test: chạy lại lệnh typecheck và npm test, bắt buộc cả hai exit 0; giữ kiểm tra source lẫn test. Nếu cần dependency mới, phải được cấp phạm vi/quyền riêng trước khi thêm.

### LC01-F03 — MAJOR — Snapshot không trộn do generator tạo bị validator từ chối

- affected_files: `src/domain/shuffle.ts:116–117`, `:251–260`; đầu vào được chấp nhận tại `src/domain/validate.ts:201`.
- VÙNG chịu trách nhiệm: `src/domain`.
- evidence/reproduction_steps: đề hợp lệ có câu III `q3` trước câu I `q1`; `validateExamVersion(exam).ok === true`. Gọi `createPresentationOrder(exam, {shuffleQuestions:false, shuffleOptions:false}, 'LC01')` trả `['q3','q1']` đúng thứ tự gốc; đưa ngay kết quả đó vào `validatePresentationOrder` nhận `SECTION_ORDER_INVALID` ở `order.questionOrder[1]`. Phụ lục có test fail thật. Cùng đề, bật shuffleQuestions thì trả `['q1','q3']`, validation đạt.
- expected: flag tắt giữ nguyên thứ tự gốc theo §4.5; snapshot generator trả về phải được validator chấp nhận cho exam đã hợp lệ.
- actual: validator luôn ép section rank tăng dần, kể cả thứ tự gốc không được schema buộc nhóm phần.
- impact: đề tùy chỉnh có thứ tự nguồn xen phần không dùng được với cờ tắt trộn khi consumer kiểm snapshot; thiết lập trộn độc lập có hành vi không nhất quán. Chưa có UI để chứng minh tác động browser.
- minimal_fix: validator chấp nhận thứ tự gốc nguyên vẹn khi không đổi câu, đồng thời giữ permutation/ID checks và nhóm I→II→III cho thứ tự được trộn. Không âm thầm sắp xếp lại câu khi flag tắt. Nếu muốn bắt buộc nhóm phần ngay cả nguồn không trộn, cần owner quyết thay đổi schema/hợp đồng trước.
- regression_test: exam nguồn III→I→II và I→III→I; đủ 4 tổ hợp flags; generator→validate luôn hợp lệ; false giữ thứ tự gốc; true nhóm phần; permutation sai/thiếu/trùng/foreign option vẫn bị từ chối. Không yêu cầu thêm field vào chữ ký hiện hành nếu chưa duyệt.

### LC01-F04 — MINOR — Catch của hai validator vẫn có thể ném exception

- affected_files: `src/domain/validate.ts:208`, `:383`.
- VÙNG chịu trách nhiệm: `src/domain`.
- evidence: getter của examId hoặc attemptId ném `Object.create(null)`; catch gọi `String(err)` và ném tiếp `TypeError: Cannot convert object to primitive value`. Đã chạy tái hiện riêng cả hai hàm; test phụ lục dừng tại assertion exam đầu tiên.
- reproduction_steps: `validateExamVersion({get examId(){throw Object.create(null)}})`; tương tự `validateAttemptResponses(validExam, {get attemptId(){throw Object.create(null)}})`.
- expected: với input unknown, trả `{ok:false, issues:[{code:'TYPE_MISMATCH', ...}]}`; không crash theo §4.3.
- actual/impact: exception thoát biên validation. Chỉ tái hiện với object/accessor JS bất thường, không phải JSON thuần; không suy ra exploit mạng hoặc mất bài hiện có.
- minimal_fix: dùng thông điệp fallback hằng trong catch hoặc error formatter riêng không bao giờ ném, không gọi conversion/property không tin cậy ngoài guard.
- regression_test: cả hai validator với getter ném Error thường, null-prototype object, object có toString ném; assert doesNotThrow và mã TYPE_MISMATCH. Giữ tests prototype và missing key hiện tại.

## checks_run

Môi trường: Windows PowerShell, cwd `D:\Cunata`; Node **v24.14.0**, npm **11.9.0**, TypeScript **7.0.2**, Python **3.11.0**. Output/exit thu từ chạy trực tiếp trong phiên LC01; artifact bằng chứng là báo cáo này và phụ lục lệnh tái lập, không có log ngoài scope.

| Lệnh/check | Exit | Kết quả thực tế |
| --- | ---: | --- |
| `git status --short`, `git log -8 --oneline`, `git rev-parse HEAD`, `git branch --show-current`, `git diff --stat`, `git diff -- package.json` | 0 | main; 1 baseline; mã sản phẩm/test untracked; package thêm typecheck và TypeScript so baseline. Không xác minh được lịch sử duyệt dependency từ diff. |
| `npm test` | 0 | **120 pass, 0 fail**, 27 suites, 0 skip/cancel/todo; Node test duration **191.3864 ms**. II exhaustive 1.296 vectors nằm trong 1 test, không cộng nhầm vào 120. |
| `npx --no-install tsc -p tsconfig.json` | 1 | **FAIL**, 21 diagnostics, không phải NOT_RUN. |
| `python -B test/oracle/oracle.py --check` | 0 | **11 pass, 0 fail**, 0 skip; 1.632 cases/5 fixtures; maxima sweep 5.849 cấu hình; 9 negative controls; seed 20261114; duration **0.9989 s**. Đây là tự kiểm oracle, không phải nghiệm thu engine. |
| PowerShell here-string → `node --input-type=module` (phụ lục) | 1 | **4 tests: 1 pass, 3 fail**; duration **60.2738 ms**. Fail F01/F03/F04; pass kiểm schema toàn bộ fixtures và tổng I/II qua judge hiện có. |
| Import trực tiếp 4 module thiếu | 0 (probe bắt lỗi) | 4 lần ERR_MODULE_NOT_FOUND; không tính PASS import. |
| Probe riêng getter attemptId ném object null-prototype | 0 (probe bắt lỗi) | TypeError tái hiện F04; không phải PASS validator. |
| Probe parseFractionString có newline/CR/U+2028 ở cuối | 0 | Tất cả bị SyntaxError; không ghi finding parser. |
| Đọc source và `rg` kiểm forbidden APIs/secret patterns trong src + test/domain | 0 | Chỉ thấy Math.random/Date.now trong test chặn API. Không thấy network/I/O, parseFloat hoặc secret mẫu đã quét trong src. Không phải secret audit toàn Git/hạ tầng. |
| Build web | — | **NOT_RUN / NOT IMPLEMENTED**: package không có build script, không có frontend luyện thi/build config. Không cài tool hoặc tạo build giả. |
| Lint, browser E2E, IME/mobile/a11y/performance, Google integration, importer | — | **NOT_RUN**: không có implementation/test setup sản phẩm tương ứng. |

## Traceability và coverage_gaps

| Tiêu chí | Trạng thái và giới hạn |
| --- | --- |
| B1-AC01, AC03 | PARTIAL: judge/rational chạy; chưa có engine/maxima/DTO (F01). |
| B1-AC02 | PARTIAL: I/II/III correctness/charset đạt unit và fixture checks; chưa có points/status kết quả. |
| B1-AC04 | PARTIAL: IDs/schema hiện có được kiểm; persistence snapshot/version/serialization chưa có. |
| B1-AC05 | FAIL: F03; seed/flags/ID permutation unit xanh trên dữ liệu đã nhóm phần. Chưa kiểm điểm engine sau shuffle hoặc refresh browser. |
| B1-AC06 | FAIL: F04; các mã lỗi phổ thông được test; giới hạn 1.000 vẫn tạm. |
| B1-AC07 | FAIL: typecheck F02; thiếu acceptance qua public API/mutation engine. |
| B1-AC08 | PARTIAL: báo cáo thật theo snapshot; chưa có nghiệm thu owner hoặc tích hợp M1 hoàn tất. |
| B1-T01…06 | Unit judge/charset/schema và fixture probes đã chạy; scoring I/II và invalid status III của engine chưa tồn tại. Không suy ra paste/IME thật đã đạt. |
| B1-T07…10 | Rational arithmetic unit đạt; computeExamMax thiếu. Maxima oracle không thay SUT. |
| B1-T11 | Validator unit/ref-ID checks đạt các ca hiện có; F04 giới hạn robustness; chưa có scoreAttempt fail-closed. |
| B1-T12 | Shuffle cấu trúc có tests; F03 thất bại bổ sung; score invariance engine chưa chạy. |
| B1-T13…15 | NOT_IMPLEMENTED ở engine/DTO; random fixtures chỉ dùng kiểm schema/judge I/II, chưa kiểm total/pointIII/metadata/snapshot isolation. |
| B1-T16 | DEFERRED: chưa có report/UI và policy làm tròn chính thức. |
| B1-T17 | Chỉ 9 negative controls của oracle; mutation tests của engine NOT_RUN. |

Các khoảng trống khác: chưa có persistence/offline/timer/autosubmit/hai tab/retry; chưa có backend tin cậy, CORS/receipt/idempotency, access policy; chưa có rich text/math/report renderer hoặc import DOCX/PDF. Không có dữ liệu chứng minh UI hoạt động với 2–3 học sinh đồng thời. Không lấy trang điều phối worker làm bằng chứng các tính năng này. Không đo coverage phần trăm hay benchmark production. Snapshot làm việc chung có thể tiếp tục thay đổi; chỉ các hash trên gắn với bằng chứng này.

## Tính năng lộ trình còn thiếu — theo ưu tiên

1. **P0 / hoàn tất M1:** engine/maxima/barrel/serialization và acceptance độc lập (F01); sửa F02–F04; test strict DTO, sum/bounds/seed/permutation/version isolation. Gate: unit + typecheck + tất cả fixture expected qua SUT; review lại.
2. **P1 / M2 học sinh:** UI tiếng Việt mobile/desktop cho ba phần; chọn đề/nickname không xác thực; snapshot attempt/version/order cố định; timer deadline, submit/autosubmit, double-click; lưu offline và restore refresh; xử lý quota/migration/hai tab/stale final.
3. **P1 / M2 kết quả:** tổng/từng phần đạt trên tối đa (có 12/15, 11/16), trạng thái/câu trả lời/đáp án/lời giải theo policy; thời gian bắt đầu/kết thúc; tải báo cáo HTML/PDF xem offline. Giữ số gốc, chỉ round khi render sau duyệt policy.
4. **P2 / M3 giáo viên:** ngân hàng câu hỏi, phân loại môn/lớp/chủ đề/bài/mức độ, version/provenance; builder đề custom bật/tắt phần, settings thời gian/lượt/trộn/công bố lời giải; publish snapshot và export/import dữ liệu. Không giả admin URL là xác thực.
5. **P2 / M4 thu kết quả:** lựa chọn dịch vụ được owner duyệt; đầu nhận tin cậy tự kiểm điểm/key cho kiểm tra cần bảo mật; Google Sheets/Drive thực; local_saved/queued/sending/server_confirmed/failed đúng receipt; retry giới hạn/backoff/idempotency; privacy, xuất/xóa/backup và CORS integration thật.
6. **P3 / M5 nhập liệu:** DOCX/PDF → intermediate → preview/chỉnh sửa → xác nhận → lưu; bảng/hình/OMML/toán; text PDF/scan/OCR khi cần, flags/confidence/nguồn, không đoán key; file lỗi/quá lớn/external links và cảnh báo mất nội dung.
7. **P3 / mẫu chuẩn THPT:** chỉ thêm sau kiểm chứng văn bản theo môn/năm và owner duyệt; custom-v1 hiện không phải mẫu chính thức.
8. **P4 / M6 nghiệm thu:** build frontend/lint/E2E thật, IME Telex/VNI, keyboard/screen reader/contrast, màn hình nhỏ, performance, security/privacy, backup/rollback/changelog và owner acceptance. Những gate liên quan phải được kiểm ở từng milestone, không dồn lỗi scoring/data đến cuối.

## Quyết định còn mở

Không thiếu quyết định để **hoàn thành LC01**; các điểm sau được hợp đồng ghi là chưa chặn M1. Reviewer không tự chốt và không yêu cầu dừng sửa các lỗi kỹ thuật đã có quy tắc.

| Hạng mục | Phương án để owner quyết khi triển khai tính năng liên quan |
| --- | --- |
| Grammar trả lời ngắn | Giữ policy charset/độ dài v1; hoặc định nghĩa grammar chặt bằng policy ID mới và quy tắc tương thích. |
| Hiển thị điểm | Hiển thị phân số chính xác; hoặc decimal với số chữ số/quy tắc round được duyệt, luôn giữ rational gốc. |
| Giới hạn số câu | Phê duyệt 1.000; hoặc giới hạn khác sau đo payload/hiệu năng và cập nhật contract/tests. |
| Nhóm phần khi không trộn | Giữ nguồn nguyên vẹn theo flag-off hiện tại (cách sửa F03 nêu trên); hoặc yêu cầu nguồn đã nhóm phần và sửa schema/contract sau duyệt. Không âm thầm reorder nguồn. |
| Mẫu chuẩn THPT | Tiếp tục chỉ custom; hoặc thêm ruleSet đã kiểm chứng riêng theo môn/năm. |
| Dịch vụ nhận kết quả | Private/local workflow; hoặc Apps Script có integration được kiểm chứng; hoặc serverless trung gian sau duyệt quyền/chi phí. Chưa chọn stack/hosting mới. |

recommended_action: giao worker đúng vùng sửa và hoàn tất M1; chạy lại checks và review snapshot mới. Không merge/deploy/nghiệm thu sản phẩm từ 120 unit tests hiện tại. TypeScript đã hiện diện khác ghi chú cũ trong hợp đồng; báo trạng thái runtime thật, không suy ra dependency đã được owner duyệt chỉ từ file.

privacy_notes: báo cáo chỉ chứa kết quả kỹ thuật, không chứa nội dung hồ sơ riêng/credential/dữ liệu học sinh. Không cài dependency, không sửa code, không commit/deploy; chỉ tạo file báo cáo được giao. tools_research: NOT_REQUESTED trong LC01.

## Phụ lục — bộ kiểm tra bổ sung đã chạy không tạo file

Chạy nguyên khối PowerShell dưới đây từ `D:\Cunata`. Đây là kiểm tra reviewer trong stdin; chưa thêm regression vào cây test vì ngoài scope LC01. Kết quả snapshot trên: pass 1 / fail 3, exit 1.

```powershell
@'
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateExamVersion,validateAttemptResponses} from './src/domain/validate.ts';
import {judgeI,judgeII,judgeIII} from './src/domain/judge.ts';
import {createPresentationOrder,validatePresentationOrder} from './src/domain/shuffle.ts';
const exam={examId:'e',examVersionId:'v',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'III',questionVersionId:'q3',answerKey:'1'},{kind:'I',questionVersionId:'q1',options:['a','b','c','d'].map(optionId=>({optionId})),correctOptionId:'a'}]};
test('LC01-F01: public engine can be imported',async()=>{await import('./src/domain/index.ts');});
test('LC01-F03: generated unshuffled order validates',()=>{
 assert.equal(validateExamVersion(exam).ok,true);
 const order=createPresentationOrder(exam,{shuffleQuestions:false,shuffleOptions:false},'LC01');
 assert.deepEqual(order.questionOrder,['q3','q1']);
 assert.deepEqual(validatePresentationOrder(exam,order),[]);
});
test('LC01-F04: unknown inputs never escape validator catch',()=>{
 const bad=Object.create(null);
 for(const [field,call] of [['examId',x=>validateExamVersion(x)],['attemptId',x=>validateAttemptResponses(exam,x)]]){
  const input=Object.defineProperty({},field,{get(){throw bad;}});
  assert.doesNotThrow(()=>{assert.equal(call(input).ok,false);},field);
 }
});
test('LC01-C04: all 1632 oracle fixture schemas and judge section totals',()=>{
 let cases=0;
 for(const name of ['golden','sections-I-II','exhaustive-II','short-answers','random-seed-20261114']){
  const data=JSON.parse(readFileSync('./test/oracle/fixtures/'+name+'.json','utf8'));
  for(const c of data.cases){
   assert.equal(validateExamVersion(c.exam).ok,true,c.id);
   assert.equal(validateAttemptResponses(c.exam,c.attempt).ok,true,c.id);
   let scoreI=0,scoreII=0;
   for(const q of c.exam.questions){
    const r=c.attempt.responses.find(x=>x.questionVersionId===q.questionVersionId);
    if(q.kind==='I')scoreI+=judgeI(q,r)==='correct'?25:0;
    if(q.kind==='II')scoreII+=[0,10,25,50,100][judgeII(q,r).correctCount];
    if(q.kind==='III')assert.equal(judgeIII(q,r),!r||r.raw===null||r.raw===''?'unanswered':r.raw===q.answerKey?'correct':'wrong',c.id);
   }
   for(const [section,cents] of [['I',scoreI],['II',scoreII]]){
    const [n,d='1']=c.expected.sections[section].score.split('/');
    assert.equal(BigInt(cents)*BigInt(d),BigInt(n)*100n,c.id+':'+section);
   }
   cases++;
  }
 }
 assert.equal(cases,1632);
});
'@ | node --input-type=module
```
