# LC05 — Kiểm định toàn bộ sản phẩm, vòng 5

- review_id/task_id/worker_id: LC05; reviewer: Codex.
- verified_at: 2026-11-14, khoảng 03:29–03:35, Asia/Bangkok.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch `main`; đối tượng review là HEAD **cộng working tree/untracked**.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0 (đọc toàn bộ); READINESS §6, B1-AC01…08/T01…17.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo, không phải nghiệm thu sản phẩm.
- findings_summary: **1 BLOCKER, 2 MAJOR, 1 MINOR OPEN / VERIFIED**. Bốn finding LC04 đều tái hiện; không có bằng chứng sửa mới trong sáu module domain. Typecheck tiếp tục PASS.

## Snapshot và diff từ review trước

`git log -8 --oneline` vẫn chỉ có baseline; không có commit mới từ LC04. `git diff --stat` so HEAD vẫn gồm ops/m1/tasks.json (222 dòng thay đổi), ops/run_tasks.py (138), package.json (10), tổng 346 insertions/24 deletions. Đây không phải diff riêng LC04→LC05. `src/`, `test/`, `public/`, `styles/`, package-lock.json và review reports vẫn untracked; chỉ đọc git diff sẽ bỏ sót sản phẩm.

Hash SHA256 hiện tại của toàn bộ domain khớp đúng bảng LC04:

| File | SHA256 LC05 |
| --- | --- |
| src/domain/judge.ts | 8FD98C77E6F9BBC96029BA5E2D0DB719C61725BA951BE7CE4053C5ACBFF6F23A |
| src/domain/model.ts | 73C013F90751294B69771DF246FD5F2CE1011B93857452659A614C906B71EF76 |
| src/domain/rational.ts | D0DE13864CEE75CEA8A96298C2CA06110DE040C061C75E9B241CCAED7F95FE25 |
| src/domain/shortAnswer.ts | 35A6ED980AB8301EC8161D2B9373E8F3E582FD87534BEAAEB47A22C2F3DF7A6C |
| src/domain/shuffle.ts | B1549978905E9716AD6BB9B9E3499B9F01C80B7D02BF01A3CCF301C82F7C7053 |
| src/domain/validate.ts | D42ABE42906481A7A4CA210DE355D2A1A35AB7F5A20C70B513B80B6551760F57 |

Không có byte snapshot LC04 cho tất cả test/assets nên không gán thời điểm/tác giả thay đổi những file đó. Stylesheet rời `styles/style.css` (17.488 bytes, mtime 03:25:35) đã được LC04 ghi nhận; không coi nó là frontend mới hoàn thành.

Kiểm cuối 03:35: sáu hash domain vẫn khớp bảng; inventory src/public vẫn chỉ sáu module và sample JSON. Reviewer chỉ tạo file báo cáo trong scope; working tree của worker khác được giữ nguyên.

files_reviewed: toàn bộ sáu module src/domain; cấu trúc và assertions liên quan của năm suite test/domain, ambient-node.d.ts; package.json, tsconfig, lock metadata; toàn bộ sample-exam.json; inventory src/test/public/root HTML và stylesheet (kiểm tĩnh một phần); LC04 và các probe LC01/LC03; oracle README/fixtures qua thực thi; hai hợp đồng và READINESS §6. Không thấy AGENTS.md ở workspace/ancestor D:\ hoặc trong src/test/docs/public. Dashboard/workers và ops là công cụ điều phối, không phải student exam frontend; chưa kiểm toán toàn bộ công cụ điều phối. Không đọc prompt riêng của worker khác.

## Findings

### LC05-F01 — BLOCKER — Thiếu public scoring engine, maxima, serialization

- previous: LC04-F01; **OPEN / VERIFIED**.
- affected_files: `src/domain/index.ts`, `src/domain/examMax.ts`, `src/domain/scoreAttempt.ts`, `src/domain/serialize.ts` **chưa tồn tại** (không có line để trỏ cho file thiếu). Contract §4.6–4.8.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence: inventory chỉ có sáu module nền; probe import cả bốn file đều trả `ERR_MODULE_NOT_FOUND`. Không có test/acceptance.
- reproduction_steps: tại D:\Cunata chạy `node --input-type=module -e "await import('./src/domain/index.ts')"`; lặp với examMax/scoreAttempt/serialize. Probe LC03 chạy thật tại LC05 xác nhận cả bốn.
- expected: computeExamMax và scoreAttempt đúng chữ ký; rational score/max từng phần/tổng; status/inputIssues/version metadata; ScoringInputError; strict DTO roundtrip và public re-exports.
- actual: chưa thể chấm một attempt thành ScoreResult hoặc chạy differential qua public engine.
- impact: chặn M1 và đường kết quả sản phẩm. Đây là thiếu implementation, không phải bằng chứng engine hiện hữu cộng sai điểm.
- minimal_fix: hoàn tất M1-B1/B2/B3 đúng API và công thức, nối public barrel; không đưa oracle vào làm engine thay thế.
- regression_test: acceptance qua index.ts đối chiếu 1.632 fixtures; max5/10/15/16, N3=0/3/7, BASE9,75/10/10,25; II k0…4/null, III exact/invalid/status; full=max, bounds, sum, purity, permutation theo IDs, version isolation; strict DTO negative cases và mutation controls.

### LC05-F02 — MAJOR — Snapshot do generator tạo bị validator từ chối khi tắt trộn

- previous: LC04-F03; **OPEN / VERIFIED**, shuffle.ts không đổi hash.
- affected_files: `src/domain/shuffle.ts:116`–117 và :251–260; `src/domain/validate.ts:81` trở đi cho phép nguồn xen phần.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence/reproduction_steps: exam hợp lệ có thứ tự III q3 → I q1 → II q2; gọi createPresentationOrder với seed cố định và đủ bốn cặp flags; truyền kết quả vào validatePresentationOrder. Probe LC03 dưới đây có input đầy đủ.
- expected: generator→validator nhất quán; flag câu=false giữ nguồn theo §4.5; flag=true trộn trong nhóm I→II→III theo giả thiết kỹ thuật hiện tại.
- actual: hai cặp false/* giữ `[q3,q1,q2]` nhưng bị hai `SECTION_ORDER_INVALID`; hai cặp true/* trả `[q1,q2,q3]`, issues=[] và PASS.
- impact: consumer kiểm snapshot sẽ từ chối kết quả hợp lệ do chính generator tạo. Chưa có persistence/browser để khẳng định đã gây mất bài thực tế.
- minimal_fix: validator chấp nhận thứ tự gốc ngoài các hoán vị giữ nhóm, vẫn kiểm đủ ID/options. Không tự đổi nguồn khi flag=false. Muốn buộc nguồn nhóm phần cần đổi schema/contract qua owner.
- regression_test: III→I→II, I→III→I, đủ bốn cặp flags; false giữ nguồn, true giữ nhóm; missing/duplicate/unknown/foreign IDs vẫn bị từ chối. Test hiện dùng nguồn nhóm sẵn nên không phát hiện lỗi.

### LC05-F03 — MAJOR — Nội dung đề mẫu có đáp án sai, lựa chọn trùng và thiếu hình

- previous: LC04-F05; **OPEN / VERIFIED**.
- affected_files: `public/sample-exam.json:15`, :31–36, :143–145.
- **VÙNG chịu trách nhiệm: glue** (asset ngoài src).
- evidence/reproduction_steps: đọc UTF-8 JSON, validateExamVersion trả ok=true; q02 có cả opt-2a và opt-2b cùng text `$-1$`. Tính 3−2×2=−1; judgeI chấp nhận a nhưng báo b wrong. q07 yêu cầu min x²+x trên [-1,2], giá trị tại x=−1/2 là −1/4=−0,25; key lại `-0,5`, chính explanation cũng tính −0,25 rồi áp “quy ước” sai. `checkShortAnswer('-0,25')` báo too_long. q01 phụ thuộc bảng biến thiên “như hình vẽ” nhưng record không có hình/reference, public chỉ có JSON.
- expected: mỗi câu I chỉ một lựa chọn đúng; key III đúng nội dung, biểu diễn được trong bốn ký tự; câu dùng hình có asset/nội dung đủ dữ kiện.
- actual: hai lựa chọn cùng đúng bị judge phân biệt; key III sai được chấp nhận, đáp án toán học đúng vượt policy; câu I thiếu dữ kiện. Probe nội dung 0 pass/3 fail.
- impact: không đủ điều kiện dùng sample để luyện/chấm thật. Chưa có UI/public engine nên không tuyên bố đã quan sát điểm tổng sai trong browser. Structural validator không có nhiệm vụ tự giải toán.
- minimal_fix: đổi distractor q02; thay q07 bằng câu có đáp án đúng trong bốn ký tự và kiểm lại key/lời giải; cung cấp hình q01 hoặc đổi câu tự đủ dữ kiện. Không nới policy/chỉnh judge để hợp thức hóa key sai.
- regression_test: kiểm nội dung sample độc lập, neo phép tính q02/q07 và kiểm asset reference tồn tại; sau sửa, test public scoring cho sample với expected độc lập. Không chỉ lấy answerKey hiện có làm expected.

### LC05-F04 — MINOR — Exception formatter vẫn ném lỗi khỏi public validator

- previous: LC04-F04; **OPEN / VERIFIED**, validate.ts không đổi hash. Không hồi quy trạng thái cũ: null-prototype và throwing toString đã PASS.
- affected_files: `src/domain/validate.ts:19`–27, nhất là :20; callers :218, :393.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence: probe exception hiện tại có 10 checks, 6 pass/4 fail. `instanceof Error` và đọc message nằm ngoài try nội bộ; Error.message getter hoặc Proxy.getPrototypeOf ném `secondary` sẽ thoát catch.
- reproduction_steps: tạo `e=Object.defineProperty(new Error('x'),'message',{get(){throw 'secondary'}})`; gọi validateExamVersion với getter examId ném e. Lặp với getter attemptId của validateAttemptResponses(validExam,input); lặp e là `new Proxy({},{getPrototypeOf(){throw 'secondary'}})`. Cả bốn ném ra ngoài.
- expected: unknown input lỗi trả `{ok:false, issues:[{code:'TYPE_MISMATCH',...}]}`, không crash (§4.3).
- actual: exception thứ hai thoát validator.
- impact: vi phạm no-throw với object JavaScript đặc biệt. JSON thường không mang getter/proxy; chưa chứng minh exploit mạng/mất dữ liệu, nên giữ MINOR.
- minimal_fix: fallback message hằng hoặc bao toàn bộ formatter, kể cả instanceof/message access, trong try; bảo đảm message là string.
- regression_test: cả hai validators với Error thường, null-prototype, throwing toString, Error.message getter, Proxy.getPrototypeOf; doesNotThrow + ok=false + TYPE_MISMATCH. Bổ sung vào suite thật; hiện probe chỉ chạy trong RAM.

## checks_run

Môi trường Windows/PowerShell, cwd D:\Cunata; Node24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Output gốc nằm trong phiên công cụ; artifact bền duy nhất reviewer tạo là báo cáo này. Không npm install/thêm dependency, không sửa code/config/fixture, không commit/deploy.

| Command/check | Exit | Kết quả thực tế |
| --- | ---: | --- |
| git status --short; git log -8 --oneline; git rev-parse HEAD; git diff --stat; git branch --show-current | 0 | main, baseline duy nhất; working tree/untracked như mô tả. |
| Get-FileHash src/domain/*.ts -Algorithm SHA256 | 0 | Sáu hash khớp LC04. |
| npm test | 0 | **120 pass/0 fail**, 27 suites; 0 skipped/cancelled/todo; duration_ms=220.5037. Exhaustive II 1.296 vectors nằm trong một test. |
| npx --no-install tsc -p tsconfig.json | 0 | **PASS**, 0 diagnostics, wall1.53s. Compiler đã hiện hữu; không ghi NOT_RUN theo thông tin cũ “tsc chưa cài”. |
| npx --no-install tsc --version | 0 | 7.0.2. |
| python -B test/oracle/oracle.py --check | 0 | **11 pass/0 fail/0 skip**, 1.632 cases/5 fixtures, 5.849 maxima configs, 9 negative controls; seed20261114; duration_s=1.1556, unittest0.472s. **Oracle tự kiểm**, không phải engine sản phẩm. |
| Probe LC01 (trích report, pipe node --input-type=module) | 1 | **4 tests:2 pass/2 fail**, duration_ms60.8774; pass schema/judge section totals của 1.632 fixtures và catch cũ; fail public import và snapshot false. |
| Probe LC03 (trích report, pipe node --input-type=module) | 1 | **10 checks:4 pass/6 fail**: bốn import thiếu, hai cặp flags false fail; hai cặp true/catch cũ pass. |
| Probe exception LC04, chạy lại tại LC05 | 1 | **10 checks:6 pass/4 fail**: hai biến thể mới fail ở cả hai validators. |
| Probe sample LC04, chạy lại tại LC05 | 1 | **3 checks:0 pass/3 fail**: duplicate correct value, wrong minimum key, missing figure; schema sample PASS. |
| npm run + inventory package scripts/src/root/public | 0 | Chỉ test/typecheck; **web build NOT_RUN / NOT_IMPLEMENTED**, không build script/student entry/frontend implementation. Không chạy build giả. |
| rg network/I/O/numeric parsing/secret patterns trong src/public/styles | 1 (không khớp) | Scan hẹp không thấy các mẫu đã tìm; không chứng nhận full secrets/SAST/security audit. |
| Lint/browser/E2E/mobile/IME/a11y/performance/collector/importer integration | — | **NOT_RUN**: chưa implementation/setup tương ứng. |

Không cộng oracle/probe counts vào 120 npm tests. PASS typecheck giữ strict/noUncheckedIndexedAccess; ambient Node declarations là stub cục bộ, không chứng minh typing đầy đủ của Node API. Không coi compile là web build hay unit là browser evidence. Một lệnh rg với wildcard đường dẫn kiểu Unix không được PowerShell mở rộng đã lỗi123; chạy lại bằng thư mục và `-g '*.ts'` thành công, không ảnh hưởng kết quả checks chính.

## coverage_gaps và traceability

| Tiêu chí | Kết quả / giới hạn |
| --- | --- |
| B1-AC01…03, T01…06 | PARTIAL: rational/judge/charset/schema có tests và fixture probe PASS; tổng/status/lookup sản phẩm thiếu F01. F03 cho thấy schema đúng không chứng nhận key đúng nội dung. |
| B1-AC04, T11/T14 | IDs/schema có; result snapshot isolation/DTO/version compatibility đầy đủ chưa triển khai. |
| B1-AC05, T12 | FAIL F02; unit flags/options có, score invariance qua public engine và browser restore chưa có. |
| B1-AC06 | PARTIAL / FAIL F04; public scoreAttempt fail-closed chưa có. |
| B1-AC07 | npm test/typecheck PASS; acceptance/mutation/differential engine NOT_IMPLEMENTED. Oracle controls không thay mutation SUT. |
| B1-AC08 | Báo cáo/evidence có; không nghiệm thu milestone/owner acceptance. |
| T07…10/T13/T15 | Một phần rational/oracle PASS; computeExamMax/ScoreResult bounds/sums/strict DTO public engine chưa có. |
| T16/T17 | Display DEFERRED (policy chưa chốt), mutation engine NOT_RUN. |

Chưa có đường UI→domain→persistence→collector→report. Chưa test refresh/back/forward/offline, snapshot không reroll, timer/background/clock shift, manual/double/autosubmit, hai tab/stale final, migrations/quota/private mode; chưa có 2–3 học sinh cùng làm. Chưa có receipt/retry/backoff/idempotency/lost-response/CORS thật hoặc backend trusted grading. Chưa có importer/corpus Word/PDF đa cột/hình/bảng/OMML/OCR. Chưa đo responsive/IME Telex/VNI/keyboard/a11y/zoom/performance; CSS chưa render nên không chứng nhận các claim trong comment. Chưa full dependency/license/advisory/history-secret audit. No-login không có quyền admin xác thực; không coi URL bí mật/nickname là authorization. Sample là dữ liệu luyện public chưa có secrecy policy, không tự gọi việc có answerKey trong sample là rò rỉ đề bảo mật.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0 / M1:** hoàn tất engine/maxima/barrel/strict DTO/acceptance; sửa F02/F04 và sample F03 trước dùng thật. Chạy 1.632 fixtures qua public engine, permutation/purity/status/version và mutation gates, giữ typecheck strict.
2. **P1 / M2 làm bài:** student entry tiếng Việt mobile/desktop, nickname không xác thực, đủ I/II/III; attempt/version/order snapshot; deadline/manual/autosubmit; local save/offline restore/refresh, migrations/quota, hai tab và chống stale/double submit.
3. **P1 / M2 kết quả:** tổng và từng phần đạt/max (12/15,11/16), thời gian, trạng thái/answers/key/lời giải theo policy; tải report offline HTML/PDF sau quyết định công nghệ, giữ rational gốc.
4. **P2 / M3:** ngân hàng phân loại môn→lớp→chương/chủ đề→bài→mức độ; reusable QuestionVersion; custom builder bật/tắt từng phần, thời gian/lượt/trộn/lời giải, publish snapshot, export/import/backup. Không giả quyền admin bằng URL bí mật.
5. **P2 / M4:** dịch vụ thu kết quả/Google và hosting đã duyệt, trusted grading khi cần; local_saved/queued/sending/server_confirmed/failed đúng receipt; idempotency, bounded retry/backoff, CORS/lost-response, tối thiểu PII và xóa/xuất/backup.
6. **P3 / M5:** DOCX/PDF→IR→preview/sửa→confirm→publish; giữ paragraph/table/image/OMML/LaTeX phù hợp; PDF text/scan/OCR khi cần; provenance/confidence/flags; không đoán key; resource limits/file hỏng/external relationships.
7. **P3 / mẫu chuẩn:** ruleSet riêng theo môn/năm/văn bản chính thức đã kiểm chứng và owner duyệt; không áp custom-v1 rồi gọi là chuẩn THPT.
8. **P4 / M6:** build/lint/E2E/security/privacy/a11y/IME/mobile/performance thực; changelog/rollback và owner nghiệm thu. Integrity/security gates phải đi cùng từng milestone, không đợi cuối.

## Quyết định mở

Không cần quyết định mới để hoàn thành review hoặc sửa các lỗi kỹ thuật đã chứng minh; không tự chốt các nghiệp vụ dưới đây. **NEED_DECISION khi triển khai phần liên quan**, với các lựa chọn cho owner:

| Hạng mục | Phương án |
| --- | --- |
| Grammar III | Giữ charset/length sa-charset-v1; hoặc policy grammar chặt có version/migration. F03 sửa bằng đổi câu, không cần nới grammar. |
| Điểm hiển thị | Phân số chính xác; hoặc decimal với digits/rounding được duyệt, vẫn giữ số gốc. |
| Giới hạn câu | Duyệt tạm1.000; hoặc chọn giới hạn sau đo payload/hiệu năng. |
| Thứ tự phần | Giữ nguồn khi tắt trộn và sửa validator; hoặc duyệt schema mới bắt buộc nhóm phần. |
| Mẫu chuẩn | Tiếp tục custom; hoặc triển khai preset theo môn/năm đã kiểm chứng. |
| Thu kết quả/hosting | Local/private; Apps Script có integration thật; hoặc serverless trung gian đã duyệt chi phí/quyền. |
| Report offline | HTML; hoặc PDF sau lựa chọn renderer và policy công bố đáp án. |

recommended_action: giao worker đúng vùng hoàn tất M1 và sửa ba lỗi còn lại, thêm regression trong suite; giữ CHANGES_REQUESTED cho sản phẩm. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật, không hồ sơ riêng/credentials/dữ liệu học sinh.

## Tái lập probes, không ghi file ngoài scope

Các report trước đã hiện hữu. Tại D:\Cunata, PowerShell sau chỉ đọc report, trích mã JS đã kiểm và chạy qua stdin; LC01/LC03 mỗi file có một probe, LC04 có hai probe exception/sample. Exit1 ở các probes fail là kết quả mong đợi của việc tái hiện bug, không phải PASS.

```powershell
foreach ($name in @('LOOP-01-codex.md','LOOP-03-codex.md','LOOP-04-codex.md')) {
  $report = Get-Content (Join-Path 'docs/reviews' $name) -Raw -Encoding UTF8
  $blocks = [regex]::Matches($report, "(?s)@'\r?\n(.*?)\r?\n'@ \| node --input-type=module")
  foreach ($block in $blocks) {
    $block.Groups[1].Value | node --input-type=module
    Write-Output "probe_exit=$LASTEXITCODE"
  }
}
```
