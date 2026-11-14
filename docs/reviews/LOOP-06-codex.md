# LC06 — Kiểm định toàn bộ sản phẩm, vòng 6

- review_id/task_id/worker_id: LC06; reviewer: Codex.
- verified_at: 2026-11-14, khoảng 03:38–03:45, Asia/Bangkok.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch: `main`. Review HEAD cộng toàn bộ source sản phẩm trong working tree/untracked.
- requirements_version: Shared Product Contract v2.0 (đã đọc toàn bộ); M1-scoring-contract v1.0 (đã đọc toàn bộ); READINESS §6 (B1-AC01…08, T01…17).
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo; chưa nghiệm thu M1/sản phẩm.
- findings_summary: **1 BLOCKER, 2 MAJOR OPEN / VERIFIED; 1 MINOR FIXED / VERIFIED**. Ban đầu cả bốn finding LC05 tái hiện; lúc kiểm cuối 03:44 phát hiện validate.ts được worker khác sửa trong working tree dùng chung. Rerun xác nhận F04 đã sửa; ba finding còn lại vẫn mở. Unit tests/typecheck xanh không đóng ba finding đó.

## Snapshot, diff và phạm vi đã đọc

`git log -10 --oneline` chỉ có baseline `2ee84e3`; không có commit mới kể từ LC05. `git diff --stat` so HEAD vẫn có ops/m1/tasks.json (222 dòng thay đổi), ops/run_tasks.py (138), package.json (10), tổng 346 insertions/24 deletions. Đây là diff tích lũy so baseline, không phải diff riêng LC05→LC06. Source/test/assets/lockfile vẫn untracked nên không thể review chỉ bằng git diff. Không có snapshot LC05 đầy đủ của từng test/asset để kết luận chúng không đổi byte hoặc gán tác giả/thời điểm sửa.

Năm module domain giữ SHA256 LC05. validate.ts ban đầu khớp LC05 (`D42ABE42906481A7A4CA210DE355D2A1A35AB7F5A20C70B513B80B6551760F57`), nhưng thay đổi trong lúc review; bảng dưới là snapshot cuối 03:44:

| File | SHA256 tại LC06 |
| --- | --- |
| src/domain/judge.ts | 8FD98C77E6F9BBC96029BA5E2D0DB719C61725BA951BE7CE4053C5ACBFF6F23A |
| src/domain/model.ts | 73C013F90751294B69771DF246FD5F2CE1011B93857452659A614C906B71EF76 |
| src/domain/rational.ts | D0DE13864CEE75CEA8A96298C2CA06110DE040C061C75E9B241CCAED7F95FE25 |
| src/domain/shortAnswer.ts | 35A6ED980AB8301EC8161D2B9373E8F3E582FD87534BEAAEB47A22C2F3DF7A6C |
| src/domain/shuffle.ts | B1549978905E9716AD6BB9B9E3499B9F01C80B7D02BF01A3CCF301C82F7C7053 |
| src/domain/validate.ts | 58D7B9EC8B1BD73893C033B15A4DC0EC5747CB202626FA5CE2940CC8219BEAF5 |

files_reviewed: toàn bộ sáu module trên; năm suite test/domain qua cấu trúc/assertions liên quan và thực thi, ambient-node.d.ts; package.json, tsconfig.json, metadata package-lock.json; toàn bộ public/sample-exam.json; inventory src/public/styles/root HTML, phần đầu stylesheet; LC05 và mã probes LC01/LC03/LC04 trước khi tái chạy; oracle fixtures qua thực thi; hai hợp đồng và READINESS §6. Không thấy AGENTS.md ở D:\, workspace hoặc qua inventory rg trong repo. Không đọc prompt riêng của các worker khác.

Inventory ban đầu chỉ có src/domain (6 file), public/sample-exam.json và styles/style.css (17.488 bytes). Kiểm cuối 03:45 thấy thêm public/q01-bbt.svg (2.584 bytes, mtime03:44:26); đọc lại sample xác nhận chưa có reference tới hình và q02/q07 vẫn giữ nội dung lỗi. SVG mới chỉ được đọc phần đầu, chưa render/kiểm nội dung đầy đủ. Không có student entry, storage, collector, importer hoặc test/acceptance. dashboard.html/workers.html và ops là công cụ điều phối, không phải UI làm bài; chưa kiểm toán toàn bộ công cụ điều phối. Vì vậy “toàn bộ sản phẩm” ở đây là toàn bộ code sản phẩm hiện có và đối chiếu các luồng còn thiếu, không phải chứng nhận mọi script vận hành trong repo. Đây là working tree đang được các worker sửa đồng thời; kết luận gắn snapshot và thời điểm kiểm, không phải cam kết cho thay đổi đến sau.

## Findings

### LC06-F01 — BLOCKER — Thiếu public scoring engine, maxima và serialization

- previous: LC05-F01; **OPEN / VERIFIED**.
- affected_files: `src/domain/index.ts`, `src/domain/examMax.ts`, `src/domain/scoreAttempt.ts`, `src/domain/serialize.ts` **chưa tồn tại**, không có line để trỏ. Yêu cầu M1 §4.6–4.8.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence: inventory chỉ có sáu module nền; probe import cả bốn module trả `ERR_MODULE_NOT_FOUND`. Không có acceptance suite qua public API.
- reproduction_steps: tại D:\Cunata chạy `node --input-type=module -e "await import('./src/domain/index.ts')"`; lặp với examMax, scoreAttempt, serialize. Đã chạy thật bằng probe LC03 tại LC06.
- expected: computeExamMax/scoreAttempt/ScoringInputError đúng API; điểm/max từng phần và tổng bằng rational; trạng thái/version metadata; strict DTO roundtrip và public exports.
- actual: chưa thể chấm một attempt thành ScoreResult bằng engine sản phẩm; chưa có công thức maxima/lookup điểm II được nối vào public grading.
- impact: chặn hoàn thành M1 và toàn bộ đường kết quả. Đây là thiếu implementation, không phải bằng chứng một engine hiện hữu đang cộng sai điểm.
- minimal_fix: hoàn thành M1-B1/B2/B3 đúng contract; nối index.ts và acceptance qua API đó. Không dùng oracle Python thay engine sản phẩm.
- regression_test: đối chiếu 1.632 fixtures qua index.ts; max5/10/15/16, N3=0/3/7, BASE9,75/10/10,25; II k0…4/null/partial; III exact/invalid/unanswered; full=max, bounds/sums, purity, permutations theo ID, version isolation, strict DTO malformed/roundtrip và mutation controls.

### LC06-F02 — MAJOR — Generator tạo snapshot bị validator từ chối khi tắt trộn

- previous: LC05-F02; **OPEN / VERIFIED**.
- affected_files: `src/domain/shuffle.ts:116–117`, `src/domain/shuffle.ts:251–260`; `src/domain/validate.ts:81` trở đi không cấm nguồn xen phần.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence/reproduction_steps: đề hợp lệ theo schema có thứ tự III q3 → I q1 → II q2. Gọi createPresentationOrder với seed cố định, thử đủ bốn cặp shuffleQuestions/shuffleOptions, rồi validatePresentationOrder.
- expected: snapshot do generator tạo hợp lệ; flag câu=false giữ thứ tự nguồn theo §4.5, flag=true trộn trong nhóm I→II→III theo giả thiết kỹ thuật hiện hành.
- actual: hai cặp false/* giữ `[q3,q1,q2]` nhưng trả hai `SECTION_ORDER_INVALID`; hai cặp true/* trả `[q1,q2,q3]`, issues=[] và PASS.
- impact: consumer kiểm snapshot sẽ từ chối output hợp lệ do generator tạo. Chưa có persistence/browser để khẳng định đã gây mất bài thực tế.
- minimal_fix: validator chấp nhận thứ tự nguồn ngoài các hoán vị giữ nhóm, vẫn kiểm đầy đủ ID/options. Không tự thay thứ tự nguồn khi flag=false. Nếu muốn buộc dữ liệu nguồn nhóm phần cần owner duyệt schema/contract mới.
- regression_test: nguồn III→I→II và I→III→I với đủ bốn cặp flags; false giữ nguồn, true giữ nhóm; missing/duplicate/unknown/foreign IDs tiếp tục bị từ chối. Suite hiện dùng nguồn đã nhóm nên bỏ lọt case này.

### LC06-F03 — MAJOR — Đề mẫu có hai lựa chọn đúng, key sai và thiếu hình

- previous: LC05-F03; **OPEN / VERIFIED**.
- affected_files: `public/sample-exam.json:15`, `:31–36`, `:143–145`.
- **VÙNG chịu trách nhiệm: glue** (asset ngoài src).
- evidence: sample qua validateExamVersion trả ok=true. q02 có opt-2a và opt-2b cùng text `$-1$`; 3−2×2=−1, judgeI chấp nhận a nhưng báo b wrong. q07: min x²+x trên [-1,2] tại x=−1/2 bằng −1/4=−0,25; key lại `-0,5`, chính lời giải cũng tính −0,25 rồi áp “quy ước” sai. Đáp án toán học `-0,25` dài5, checkShortAnswer báo too_long. q01 đòi bảng biến thiên “như hình vẽ” nhưng record không có hình/reference. Ban đầu public không có hình; kiểm cuối thấy q01-bbt.svg mới xuất hiện nhưng sample vẫn chưa liên kết tới asset đó, nên chưa đủ bằng chứng đóng lỗi.
- reproduction_steps: chạy probe sample LC04 (đã tái chạy tại LC06, mã trích ở phụ lục); đọc các records nêu trên, so phép tính độc lập và kết quả judge/charset.
- expected: câu I chỉ một lựa chọn đúng; key III đúng nội dung và biểu diễn được trong bốn ký tự; câu dùng hình có đủ dữ kiện/asset.
- actual: probe nội dung **0 pass/3 fail**, trong khi schema PASS.
- impact: sample chưa đủ điều kiện dùng luyện/chấm thật. Chưa có public engine/UI nên không tuyên bố đã quan sát điểm tổng sai trên browser. Structural validator không có nhiệm vụ giải toán.
- minimal_fix: thay distractor q02; thay q07 bằng bài có kết quả đúng biểu diễn được trong policy bốn ký tự và sửa key/lời giải tương ứng; bổ sung hình q01 hoặc đổi thành câu tự đủ dữ kiện. Không nới policy hoặc sửa judge để chấp nhận key sai.
- regression_test: kiểm nội dung độc lập cho phép tính/key/distractor và tồn tại asset; sau khi có engine, test sample với expected độc lập. Không dùng chính answerKey hiện có làm oracle duy nhất.

### LC06-F04 — MINOR — Formatter ngoại lệ ném khỏi public validator — FIXED / VERIFIED

- previous: LC05-F04; ban đầu OPEN / VERIFIED, **FIXED / VERIFIED ở snapshot cuối**.
- affected_files: `src/domain/validate.ts:19–30`; callers hiện :221, :396 (trước sửa :218, :393).
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence trước sửa: probe exception 10 checks: **6 pass/4 fail**. Nhánh `err instanceof Error` và đọc `err.message` nằm ngoài try nội bộ. Khi getter đầu vào ném Error có message getter ném tiếp hoặc Proxy có getPrototypeOf ném, exception `secondary` thoát catch.
- reproduction_steps: `e=Object.defineProperty(new Error('x'),'message',{get(){throw 'secondary'}})`; validateExamVersion với examId getter ném e. Lặp validateAttemptResponses với validExam và attemptId getter; lặp cả hai với `e=new Proxy({},{getPrototypeOf(){throw 'secondary'}})`.
- expected: input unknown lỗi trả `{ok:false, issues:[{code:'TYPE_MISMATCH',...}]}`, không crash theo M1 §4.3.
- actual trước sửa: cả bốn trường hợp ném ra ngoài; Error thường/null-prototype/throwing toString vẫn PASS. **Sau sửa:** formatter đưa toàn bộ đọc message/String(err) vào try, chỉ nhận message kiểu string và fallback hằng khi ném; không còn instanceof ngoài catch. Chạy lại đúng probe: **10 pass/0 fail, exit0**. npm tests vẫn 120/120 và typecheck PASS.
- impact: vi phạm no-throw với object JavaScript đặc biệt; JSON thường không mang getter/proxy. Chưa chứng minh exploit mạng/mất dữ liệu nên giữ MINOR.
- minimal_fix: thay đổi hiện tại đã xử lý root cause trên; reviewer không sửa code.
- regression_test: probe cả hai validators với Error thường, null-prototype, throwing toString, throwing message getter, throwing getPrototypeOf đã PASS. **Coverage gap:** test/domain/validate.test.ts vẫn chưa chứa regression đặc thù cho message getter/getPrototypeOf; cần worker bổ sung để ngăn tái phát.

## checks_run

Environment: Windows/PowerShell; cwd D:\Cunata; Node v24.14.0; npm11.9.0; TypeScript7.0.2; Python3.11.0. Commit như metadata. Output gốc nằm trong transcript công cụ; artifact bền duy nhất reviewer tạo là báo cáo này. Không npm install/thêm dependency, không sửa code/config/fixture, không commit/deploy.

| Command/check | Exit | Kết quả thật |
| --- | ---: | --- |
| git status --short; git log -10 --oneline; git rev-parse HEAD; git branch --show-current; git diff --stat/--numstat | 0 | main, baseline duy nhất; working tree/untracked và diff tích lũy như trên. |
| Get-FileHash src/domain/*.ts -Algorithm SHA256 | 0 | Lần đầu cả sáu khớp LC05; lần cuối năm khớp, validate.ts đổi hash như bảng snapshot. |
| npm test | 0 | **120 pass/0 fail**, 27 suites; skipped/cancelled/todo=0; duration_ms=217.6226. Exhaustive II 1.296 vectors nằm trong một test. |
| npx --no-install tsc -p tsconfig.json | 0 | **PASS**, không diagnostics; wall khoảng1,60s. Compiler thực sự đã hiện hữu, không ghi NOT_RUN theo trạng thái cũ trong contract. |
| npm test (rerun sau sửa validate.ts; output lấy 9 dòng cuối) | 0 | **120 pass/0 fail**, 27 suites; skipped/cancelled/todo=0; duration_ms=191.5318. |
| npx --no-install tsc -p tsconfig.json (rerun sau sửa validate.ts) | 0 | **PASS**, không diagnostics; wall khoảng1,32s. |
| node --version; npm --version; npx --no-install tsc --version | 0 | v24.14.0 / 11.9.0 / 7.0.2. |
| python -B test/oracle/oracle.py --check | 0 | **11 pass/0 fail/0 skip**, 1.632 cases/5 fixtures, 5.849 maxima configs, 9 negative controls; seed20261114; duration_s=1.1523; unittest0.485s. Chỉ oracle tự kiểm, không engine sản phẩm. |
| Probe LC01 trích report, pipe node --input-type=module | **1** | **4 tests:2 pass/2 fail**, duration_ms59.9126. PASS schema/judge section totals của 1.632 fixtures và catch cũ; FAIL import engine và snapshot false. |
| Probe LC03 trích report, pipe node --input-type=module | **1** | **10 checks:4 pass/6 fail**; 4 import thiếu +2 cặp flags false FAIL; 2 cặp true +2 catch cũ PASS. |
| Probe exception LC04 trích report, pipe node --input-type=module (trước/sau sửa) | **1 → 0** | **6 pass/4 fail → 10 pass/0 fail**, F04 đóng tại snapshot cuối. |
| Probe sample LC04 trích report, pipe node --input-type=module | **1** | **3 checks:0 pass/3 fail**, F03; schema sample PASS. |
| Probe parseFractionString qua stdin với trailing LF/CR/CRLF/U+2028/U+2029 | 0 | **8 checks:8 pass/0 fail**; tất cả chuỗi không chuẩn bị SyntaxError; không có finding mới từ giả thuyết này. |
| npm run + inventory scripts/src/public/root | 0 | Chỉ test/typecheck; **web build NOT_RUN / NOT_IMPLEMENTED**: không build script, không student entry. Không coi tsc noEmit là build web. |
| rg network/I/O/random/time/numeric parsing/secret patterns trong src/public/styles | 1 (không khớp) | Không thấy các mẫu đã tìm trong phạm vi hẹp; không chứng nhận full SAST/secrets/advisory audit. |
| Browser/E2E/mobile/IME/a11y/performance, collector/importer integration, lint | — | **NOT_RUN**: chưa implementation/setup tương ứng. |

Lệnh shell chứa nhiều probes trả exit0 khi lệnh cuối Write-Output thành công; bảng trên ghi **exit Node của từng probe** (được in `probe_exit=1`), không lấy exit wrapper làm PASS. Không cộng oracle/probe counts vào 120 npm tests. Typecheck giữ strict/noUncheckedIndexedAccess; ambient-node.d.ts là stub cục bộ nên chưa chứng minh đầy đủ typing Node API. Một số output đọc nhiều file bị giới hạn hiển thị; các phần quan trọng được đọc riêng, không suy luận nội dung chưa thấy là đã đạt.

## coverage_gaps và traceability

| Tiêu chí | Kết quả / giới hạn |
| --- | --- |
| B1-AC01…03; T01…06 | PARTIAL: rational/judge/schema/charset có test và probe fixtures PASS; public total/status/lookup chưa có F01. F03 chứng minh schema đúng không bảo đảm nội dung/key đúng. |
| B1-AC04; T11/T14 | Stable IDs/schema đã có; strict DTO, result isolation và version compatibility toàn luồng chưa có. |
| B1-AC05; T12 | FAIL F02; chưa score invariance qua public engine hoặc browser restore. |
| B1-AC06 | PARTIAL: F04 đã sửa và probe PASS; regression chưa vào suite, public scoreAttempt fail-closed chưa có. |
| B1-AC07 | Unit/typecheck PASS; acceptance/differential/mutation engine NOT_IMPLEMENTED. Oracle controls không thay mutation SUT. |
| B1-AC08 | Review/evidence có; chưa nghiệm thu milestone/owner acceptance. |
| T07…10/T13/T15 | Rational/oracle kiểm được một phần; computeExamMax, engine bounds/sums và strict ScoreResult DTO chưa có. |
| T16/T17 | Display DEFERRED (policy chưa chốt); mutation engine NOT_RUN. |

Chưa tồn tại đường UI→domain→persistence→API→report. Chưa test refresh/back/forward/offline, không reroll snapshot, timer/background/clock shift, nộp thủ công/double/autosubmit, hai tab/stale final, migrations/quota/private mode, 2–3 học sinh đồng thời. Chưa có receipt/retry/backoff/idempotency/lost-response/CORS thật hoặc trusted backend grading. Chưa có importer/corpus DOCX/PDF đa cột/hình/bảng/OMML/OCR. Chưa render stylesheet nên không xác nhận responsive/a11y qua comment CSS; chưa test Telex/VNI, keyboard/screen reader, zoom/math overflow/performance. Chưa full dependency/license/advisory/history-secret audit; không tải advisory hay repo ngoài vì task không cần xác minh một claim upstream cụ thể.

No-login không cung cấp quyền admin xác thực; không coi nickname/URL bí mật là authorization. Sample là dữ liệu luyện public chưa có secrecy policy; không tự gọi sự tồn tại answerKey trong sample là rò rỉ đề bảo mật. Những phần chưa triển khai được tách khỏi bug thực thi đã chứng minh.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0 / M1:** hoàn tất public engine/maxima/strict DTO/barrel/acceptance; sửa F02 và sample F03 trước dùng thật, thêm regression cho F04 đã sửa. Chạy fixtures, permutations/purity/status/version, bounds/sums và mutation gates qua engine sản phẩm; giữ typecheck strict.
2. **P1 / M2 làm bài:** student entry tiếng Việt mobile/desktop, nickname không xác thực, ba loại câu; attempt/version/order snapshot; deadline/manual/autosubmit; local save/offline restore/refresh, quota/migrations, hai tab và chống stale/double submit.
3. **P1 / M2 kết quả:** điểm đạt/max từng phần và tổng (12/15,11/16), thời gian, trạng thái/câu trả lời/key/lời giải theo policy; report offline HTML/PDF sau chọn công nghệ, giữ rational gốc.
4. **P2 / M3:** bank môn→lớp→chương/chủ đề→bài→mức độ; reusable QuestionVersion; custom builder bật/tắt phần, thời gian/lượt/trộn/lời giải, publish snapshot, backup/export/import; luồng quản lý private phù hợp no-login.
5. **P2 / M4:** dịch vụ thu kết quả/Google và hosting đã duyệt; trusted grading khi cần; local_saved/queued/sending/server_confirmed/failed đúng receipt; idempotency, bounded retry/backoff, CORS/lost-response; giảm PII, xóa/xuất/backup.
6. **P3 / M5:** DOCX/PDF→IR→preview/sửa→confirm→publish; giữ paragraph/table/image/OMML/LaTeX phù hợp; text PDF/scan/OCR khi cần, provenance/confidence/flags, không đoán key; limits/file hỏng/external relationships.
7. **P3 / mẫu chuẩn:** ruleSet/preset riêng theo môn/năm/văn bản chính thức đã kiểm chứng và owner duyệt; không gọi custom-v1 là chuẩn THPT.
8. **P4 / M6:** build/lint/E2E/security/privacy/a11y/IME/mobile/performance thực; changelog/rollback và owner nghiệm thu. Integrity/security gates áp dụng ngay từng milestone.

## Quyết định mở và hành động đề nghị

Không thiếu quyết định để hoàn thành review LC06 hoặc sửa các bug kỹ thuật trên. Các mục dưới **NEED_DECISION khi triển khai phần liên quan**; reviewer không tự chốt:

| Hạng mục | 2–3 phương án cho owner |
| --- | --- |
| Grammar III | Giữ charset/length sa-charset-v1; hoặc grammar chặt có policy version/compatibility. F03 giải quyết bằng thay câu, không phải nới policy. |
| Hiển thị điểm | Phân số chính xác; hoặc decimal với số chữ số và rounding được duyệt, giữ số gốc. |
| Giới hạn câu | Duyệt tạm1.000; hoặc chọn giới hạn sau benchmark payload/hiệu năng. |
| Thứ tự phần | Giữ nguồn khi tắt trộn và sửa validator; hoặc duyệt schema mới bắt buộc nguồn nhóm phần. |
| Mẫu chuẩn | Tiếp tục chỉ custom; hoặc thêm preset theo môn/năm đã kiểm chứng. |
| Thu kết quả/hosting | Local/private; Apps Script có integration thật; hoặc serverless trung gian đã duyệt quyền/chi phí. |
| Report offline | HTML; hoặc PDF sau duyệt renderer và policy công bố key. |

recommended_action: giao worker đúng vùng hoàn thành M1/F01, sửa F02/F03, thêm regression F04 trong suite; giữ CHANGES_REQUESTED cho sản phẩm. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật, không nội dung hồ sơ riêng/credentials/dữ liệu học sinh.

## Phụ lục — Tái chạy probes không ghi file ngoài scope

Mã các probes trước đã được đọc và chạy lại tại LC06; chạy từ D:\Cunata bằng PowerShell. Các exit1 là kết quả tái hiện lỗi, không phải PASS; riêng exception LC04 hiện exit0 sau sửa. LC01/LC03 mỗi report chứa một block, LC04 chứa hai block exception/sample:

```powershell
foreach ($name in @('LOOP-01-codex.md','LOOP-03-codex.md','LOOP-04-codex.md')) {
  $report = Get-Content (Join-Path 'docs/reviews' $name) -Raw -Encoding UTF8
  $blocks = [regex]::Matches($report, "(?s)@'\r?\n(.*?)\r?\n'@ \| node --input-type=module")
  foreach ($block in $blocks) {
    Write-Output "source=$name"
    $block.Groups[1].Value | node --input-type=module
    Write-Output "probe_exit=$LASTEXITCODE"
  }
}
```
