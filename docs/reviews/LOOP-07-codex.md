# LC07 — Kiểm định toàn bộ sản phẩm, vòng 7

- review_id/task_id/worker_id: LC07; reviewer: Codex.
- verified_at: 2026-11-14, khoảng 03:50–03:54, Asia/Bangkok; working tree dùng chung có thay đổi đồng thời.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch: `main`. Đối tượng review là HEAD cộng source/test/assets chưa commit tại thời điểm kiểm.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6, B1-AC01…08/B1-T01…17.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo, chưa nghiệm thu M1/sản phẩm.
- findings_summary: **1 BLOCKER OPEN / VERIFIED**. Hai MAJOR của LC06 đã sửa; MINOR đã sửa từ LC06 tiếp tục PASS và nay có regression trong suite. Không phát hiện thêm bug sản phẩm đã chứng minh trong vòng này.

## Snapshot, diff và phạm vi

Đã đọc hai hợp đồng đầy đủ trước khi kiểm định; dùng READINESS §6 làm traceability. Không có AGENTS.md trong workspace hoặc D:\\ qua inventory. Không đọc prompt riêng của worker khác.

`git log -12 --oneline` chỉ có baseline `2ee84e3`; không có commit mới so LC06. `git diff --stat` so HEAD vẫn gồm ops/m1/tasks.json (222 dòng thay đổi), ops/run_tasks.py (138), package.json (10), tổng 346 insertions/24 deletions. Đây là diff tích lũy, không phải diff riêng LC06→LC07. Source/tests/assets/lockfile vẫn untracked nên đã đọc chúng trực tiếp, không dựa riêng git diff. Không có snapshot byte đầy đủ của tests/assets LC06 để dựng diff hoàn chỉnh hoặc gán tác giả sửa.

| Domain file | SHA256 LC07 | So LC06 cuối |
| --- | --- | --- |
| judge.ts | 8FD98C77E6F9BBC96029BA5E2D0DB719C61725BA951BE7CE4053C5ACBFF6F23A | Giữ nguyên |
| model.ts | 73C013F90751294B69771DF246FD5F2CE1011B93857452659A614C906B71EF76 | Giữ nguyên |
| rational.ts | D0DE13864CEE75CEA8A96298C2CA06110DE040C061C75E9B241CCAED7F95FE25 | Giữ nguyên |
| shortAnswer.ts | 35A6ED980AB8301EC8161D2B9373E8F3E582FD87534BEAAEB47A22C2F3DF7A6C | Giữ nguyên |
| shuffle.ts | B003ADB9592F7CAEC3E0F25FB2AE89933937AA395E1C863F38852676A0040E73 | Đã đổi; LC06 B1549978… |
| validate.ts | 58D7B9EC8B1BD73893C033B15A4DC0EC5747CB202626FA5CE2940CC8219BEAF5 | Giữ nguyên bản đã sửa |

files_reviewed: toàn bộ sáu module src/domain; các assertions liên quan trong năm suite test/domain và thực thi toàn bộ suite; ambient-node.d.ts; toàn bộ test/acceptance/sampleExam.test.ts; toàn bộ public/sample-exam.json và public/q01-bbt.svg; package.json, tsconfig.json, metadata package-lock.json; inventory src/test/public/styles/root, phần đầu stylesheet; LC06 và mã probes LC01/LC03/LC04 trước khi tái chạy; READINESS §6. Fixtures được đọc/đối chiếu qua probe 1.632 cases và oracle check. Không kiểm toán toàn bộ mã công cụ điều phối ops/dashboard/workers; các trang đó không phải UI học sinh.

Thay đổi có ý nghĩa so LC06: shuffle validator chấp nhận đúng thứ tự nguồn; sample q01 có reference hình, q02 thay distractor, q07 thay hàm/khoảng và lời giải; thêm năm sample tests và một regression validators, tổng npm tests từ120 lên126. test/acceptance hiện chỉ có sampleExam.test.ts, chưa có acceptance public scoring engine.

Kiểm trong phiên thấy thêm `tsconfig.web.json`: ES2022/ESNext/bundler, strict/noEmit, DOM libs, include src/scripts/test. Tại lúc đọc vẫn không có src web entry hoặc build script; config này chưa phải web build. Kết luận chỉ áp dụng snapshot đã đọc/chạy, không tự áp cho code worker ghi sau đó.

## Findings

### LC07-F01 — BLOCKER — Thiếu public scoring engine, maxima và strict result DTO

- previous: LC06-F01; **OPEN / VERIFIED**.
- affected_files: `src/domain/index.ts`, `src/domain/examMax.ts`, `src/domain/scoreAttempt.ts`, `src/domain/serialize.ts` **chưa tồn tại**; line=N/A (missing file), yêu cầu M1 §4.6–4.8. Không gán line giả cho file vắng mặt.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence: inventory chỉ có sáu module nền; probe import riêng cả bốn module trả `ERR_MODULE_NOT_FOUND`. Sample acceptance chỉ gọi validate/judge, không gọi scoreAttempt, không kiểm totals/max/status/result DTO.
- reproduction_steps: từ D:\\Cunata chạy `node --input-type=module -e "await import('./src/domain/index.ts')"`; lặp với examMax, scoreAttempt, serialize. Probe LC03 đã chạy thật đủ bốn imports trong phiên này.
- expected: API computeExamMax, POINT_I/PART2_POINTS, scoreAttempt/ScoringInputError/ENGINE_VERSION, ScoreResult và strict DTO/barrel đúng contract; rational score/max từng phần/tổng, không ép thang10.
- actual: không có đường sản phẩm chấm attempt thành ScoreResult, không có maxima và strict result serialization. Unit tests xanh vì chưa gọi các modules thiếu.
- impact: chặn hoàn thành M1 và đường kết quả/report. Đây là thiếu implementation; chưa phải bằng chứng một engine hiện hữu cộng sai điểm.
- minimal_fix: hoàn thành M1-B1/B2/B3 đúng chữ ký; nối exports; thêm acceptance qua public API. Không thay engine bằng oracle hoặc phép cộng tự viết trong test.
- regression_test: chạy toàn bộ1.632 fixtures qua index.ts; II k0…4/null/duplicate/unknown; III exact/invalid/unanswered; golden max5/10/15/16, N3=0/3/7, BASE9,75/10/10,25; full=max, bounds, sums, deterministic/purity và permutation theo IDs; version isolation; strict malformed DTO/roundtrip và mutation controls của engine.

## Ledger các finding đã sửa

### LC06-F02 — MAJOR — FIXED / VERIFIED

- affected_files: `src/domain/shuffle.ts:222–224`, `:254–265` (trước đây kiểm section order vô điều kiện); generator giữ nguồn tại :116–117.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence/root cause fix: `isOriginalOrder` so đúng toàn bộ thứ tự ID nguồn; chỉ kiểm I→II→III khi snapshot khác nguồn. Các kiểm missing/duplicate/unknown/options vẫn thực hiện. Không tự sửa schema bắt dữ liệu nguồn phải nhóm phần.
- reproduction_steps: đề hợp lệ thứ tự III→I→II; createPresentationOrder với bốn cặp flags rồi validate. Probe LC03 hiện **4/4 cặp PASS**, trước LC06 hai cặp false bị từ chối.
- expected/actual hiện tại: false giữ nguồn; true giữ nhóm; tất cả snapshot hợp lệ. Probe LC07 mở rộng cả nguồn I→III→I: hai schema + tám cặp flags PASS; kiểm deterministic, không mutate, JSON snapshot roundtrip và negative missing/duplicate/foreign question IDs trong mỗi cặp đều PASS.
- impact trước sửa: consumer từ chối snapshot do generator tạo; không có browser/persistence để chứng minh mất bài thật.
- minimal_fix: bản sửa hiện tại xử lý root cause; reviewer không sửa code.
- regression_test/remaining gap: **test/domain/shuffle.test.ts chưa có regression nguồn xen phần** (fixture chính vẫn nhóm I/II/III). Đưa hai nguồn và đủ flags của probe vào suite, tiếp tục giữ tests foreign options/IDs. Đây là gap chống tái phát, không ghi bug cũ còn mở.

### LC06-F03 — MAJOR — FIXED / VERIFIED ở dữ liệu nguồn

- affected_files: `public/sample-exam.json:15–16`, `:33`, `:144–146`; `public/q01-bbt.svg`; `test/acceptance/sampleExam.test.ts:26–64`.
- **VÙNG chịu trách nhiệm: glue** (asset ngoài src).
- evidence/reproduction_steps: đọc toàn bộ sample/SVG; chạy năm sample acceptance và probe độc lập q02/q07. q01 có image và Markdown reference tới file tồn tại; SVG có mốc−1/1, dấu đạo hàm +/−/+, phù hợp key khoảng(-∞;−1). Chưa render hình trong browser.
- expected/actual hiện tại: q02 b là−5, bốn lựa chọn khác nhau; tính3−2×2=−1 chỉ khớp a. q07 đổi thành2x²+2x trên[-1;1], min tại−1/2 bằng−1/2; key `-0,5` dài4, charset hợp lệ, lời giải nhất quán. Không nới input policy để giữ bài cũ sai.
- impact trước sửa: sample có key/distractor sai và thiếu dữ kiện; hiện các lỗi nguồn đã tái kiểm đóng. Chưa có scoring UI nên không tuyên bố đã chấm tổng hoặc hiển thị hình đúng end-to-end.
- minimal_fix: đã có trong source, không cần reviewer sửa.
- regression_test: suite mới 5/5 PASS. Test q07 hiện khẳng định key/explanation literal nhưng phép tính nằm trong comment, chưa assert hàm/đoạn trong content; nên thêm kiểm nội dung và expected toán độc lập để tránh regression đổi đề mà giữ key. “full correct” hiện lấy answerKey làm input, không thay oracle nội dung hoặc public score acceptance.

### LC06-F04 — MINOR — FIXED / VERIFIED, regression gap đã đóng

- affected_files: `src/domain/validate.ts:19–30`, catch :215–224/:390–399; `test/domain/validate.test.ts:607–640`.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence/reproduction_steps: tái chạy probe LC04 với Error thường, null-prototype, throwing toString, throwing message, throwing getPrototypeOf; mỗi loại chạy cả exam/attempt validators. **10/10 PASS, exit0**. Suite nay có regression cùng mười tổ hợp trong một test.
- expected/actual: unknown input ném exception bất thường vẫn trả ok=false/TYPE_MISMATCH; exception formatter không thoát ra ngoài. Bản sửa giữ nguyên so LC06 cuối.
- impact trước sửa: no-throw contract bị vi phạm ở object JavaScript đặc biệt; không chứng minh exploit mạng/mất dữ liệu.
- minimal_fix/regression_test: implementation hiện tại cùng regression mới đã xử lý trường hợp đã chứng minh; reviewer không sửa code.

## checks_run

Environment: Windows/PowerShell, D:\\Cunata, Node v24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Output gốc trong transcript; artifact reviewer tạo duy nhất là báo cáo này. Không npm install, không thêm dependency, không sửa code/config/fixture, không commit/deploy. Các probe chạy stdin, không tạo file tạm ngoài scope.

| Command/check | Exit | Kết quả thật |
| --- | ---: | --- |
| git status --short; git log -12 --oneline; git rev-parse HEAD; git branch --show-current; git diff --stat | 0 | main/HEAD như trên, một baseline; source untracked, diff tích lũy346+/24−. |
| Get-FileHash src/domain/*.ts -Algorithm SHA256 | 0 | Sáu hashes như snapshot; chỉ shuffle đổi so LC06 cuối. |
| npm test | 0 | **126 pass/0 fail**,28 suites; cancelled/skipped/todo=0; duration_ms187.2845. Exhaustive II1.296 vectors nằm trong một test. |
| npx --no-install tsc -p tsconfig.json | 0 | **PASS**, không diagnostics; wall1,19s. Compiler có thật, không dùng ghi chú NOT_RUN cũ trong contract. |
| python -B test/oracle/oracle.py --check | 0 | **11 pass/0 fail/0 skip**,1.632 cases/5fixtures,5.849 maxima configs,9negative controls; seed20261114; duration_s1.0334, unittest0.386s. Chỉ oracle tự kiểm. |
| Probe LC01 (trích code report, stdin node --input-type=module) | **1** | **4tests:3pass/1fail**, duration_ms60.0732. PASS schema/judge section totals của1.632fixtures, shuffle và catch; FAIL import public engine. |
| Probe LC03 (trích code report, stdin Node) | **1** | **10checks:6pass/4fail**: bốn module imports FAIL; bốn flags shuffle và hai catch PASS. |
| Probe exception LC04 (block đầu, stdin Node) | 0 | **10checks:10pass/0fail**. |
| Probe LC07 mixed sections + sample (stdin Node, seed LC07-fixed) | **1** | **14checks:13pass/1fail**. 10 mixed-section checks PASS; sample schema/q02/q07 PASS. q01 probe FAIL do ký tự U+2212 trong mã pipe PowerShell thành `?`; không kết luận asset lỗi từ failure công cụ này. |
| Probe q01 lại với String.fromCodePoint(0x2212), mã stdin chỉ ASCII | 0 | **1check:1pass/0fail**, reference/SVG markers/key PASS. Không sửa asset để làm xanh probe. |
| npm run; đọc package.json/inventory | 0 | Chỉ test/typecheck. **Web build NOT_RUN / NOT_IMPLEMENTED**: chưa build script/entry. tsconfig.web.json noEmit mới xuất hiện chưa thay build. |
| rg mẫu network/I/O/random/time/numeric parsing/secret trong src/public/styles | 1 | Không khớp mẫu đã tìm; không phải chứng nhận full SAST/secret/advisory audit. |
| Browser/E2E/mobile/IME/a11y/performance, lint, collector/importer integration | — | **NOT_RUN**, chưa implementation/setup tương ứng. Không có screenshot/trace giả. |

Probe report cũ chạy bằng PowerShell: lấy block here-string khớp `@' ... '@ | node --input-type=module` bằng regex; LC01/LC03 lấy block0, LC04 lấy block0(exception). Node exit được truyền bằng `exit $LASTEXITCODE`, không lấy thành công của wrapper làm PASS. Không cộng số oracle/probes vào126 npm tests. Chỉ roundtrip JSON PresentationOrder đã thử, không gọi đó là ScoreResult DTO hoặc restore browser.

## coverage_gaps và traceability

| Tiêu chí | Trạng thái / giới hạn |
| --- | --- |
| B1-AC01…03; T01…06 | PARTIAL: judge/charset/rational/schema có unit và probe fixtures PASS; public score/status/max vẫn thiếu F01. II exhaustive judge không chứng minh lookup điểm II trong engine chưa có. |
| B1-AC04; T11/T14 | Stable IDs/schema có; strict result DTO, output isolation và version compatibility toàn luồng chưa có. |
| B1-AC05; T12 | Generator/validator hiện PASS cả mixed source; thiếu regression mixed source trong suite. Score invariance qua public engine và browser persistence chưa có. |
| B1-AC06 | Các validators/catch có test thật và PASS; scoreAttempt fail-closed chưa triển khai. Không dùng schema validation làm bằng chứng nội dung toán đúng. |
| B1-AC07 | Unit/typecheck PASS; acceptance hiện chỉ sample validate/judge. Differential/mutation trên public engine NOT_IMPLEMENTED. Oracle controls không phải mutation SUT. |
| B1-AC08 | Báo cáo/evidence có; chưa nghiệm thu milestone và owner acceptance/changelog/rollback toàn sản phẩm. |
| T07…10/T13/T15 | Rational/oracle mới kiểm một phần; maxima/bounds/sums/status/result DTO của engine chưa có. |
| T16/T17 | Display DEFERRED chờ policy; mutation engine NOT_RUN. |

Chưa có đường UI→domain→persistence→API→report. Chưa test refresh/back/forward/offline giữ input/order; timer/background/clock shift; manual/double/autosubmit; hai tab/stale final; local migrations/quota/private mode;2–3 học sinh đồng thời. Chưa có receipt/retry/backoff/idempotency/lost-response/CORS thật hoặc trusted backend grading. Chưa có importer/corpus DOCX/PDF đa cột/OMML/hình/bảng/OCR. Chưa render stylesheet/SVG nên không xác nhận responsive, keyboard/screen reader, Telex/VNI/IME, zoom/math overflow hoặc performance bằng comment CSS.

Ambient Node declarations là stub cục bộ nên typecheck PASS không chứng minh mọi Node API được type chính xác. Chưa full dependency/license/advisory/history-secret audit. Không tìm upstream bằng web vì vòng này kiểm code nội bộ, không đưa khuyến nghị package mới hoặc xác nhận claim upstream. No-login không có authorization thực; không coi nickname/URL bí mật là bảo mật. Sample là dữ liệu luyện public, chưa có secrecy policy; không tự coi answerKey trong asset mẫu là rò rỉ đề thi bảo mật.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0/M1:** public scoring/maxima/strict DTO/barrel và acceptance sản phẩm qua oracle, golden, permutations/purity/status/version, bounds/sums/mutation. Thêm regression mixed-source shuffle; tăng độ độc lập sample content tests. Giữ strict typecheck.
2. **P1/M2 làm bài:** entry tiếng Việt mobile/desktop, nickname không xác thực, ba dạng câu; attempt/version/order snapshot; timer/manual/autosubmit; local save/offline restore/refresh, migration/quota, hai tab và chống stale/double submit.
3. **P1/M2 kết quả:** điểm đạt/max tổng và từng phần, thời gian, trạng thái, raw answers/key/lời giải đúng policy; report offline HTML/PDF theo công nghệ được duyệt, giữ rational gốc và hỗ trợ12/15,11/16.
4. **P2/M3:** ngân hàng môn→lớp→chương/chủ đề→bài→mức độ; reusable QuestionVersion; custom builder bật/tắt phần, thời gian/lượt/trộn/lời giải, publish snapshot; backup/export/import và luồng quản lý private phù hợp no-login.
5. **P2/M4:** dịch vụ thu kết quả/Google và hosting đã duyệt; trusted grading khi cần; local_saved/queued/sending/server_confirmed/failed theo receipt thật; idempotency, bounded retry/backoff/CORS/lost response; tối thiểu PII, xóa/xuất/backup.
6. **P3/M5:** DOCX/PDF→IR→preview/sửa→confirm→publish; giữ paragraph/table/image/OMML/LaTeX phù hợp, text PDF/scan/OCR khi cần, provenance/confidence/flags, không đoán key; limits/file hỏng/external relationships.
7. **P3/mẫu chuẩn:** preset/ruleSet riêng theo môn/năm/văn bản chính thức đã kiểm chứng và owner duyệt; không coi custom-v1 là mẫu chuẩn THPT.
8. **P4/M6:** build/lint/E2E/security/privacy/a11y/IME/mobile/performance thực, changelog/rollback và owner nghiệm thu. Integrity/security gates áp dụng trong từng milestone.

## Quyết định nghiệp vụ còn mở

Không có quyết định thiếu chặn hoàn thành review LC07 hoặc triển khai các API M1 đã quy định. Các mục sau **NEED_DECISION khi triển khai phần liên quan**, không tự chốt:

| Hạng mục | Phương án cho owner |
| --- | --- |
| Grammar III | Giữ charset/length sa-charset-v1; hoặc grammar chặt có policy version và compatibility. |
| Hiển thị điểm | Phân số exact; hoặc decimal với số chữ số/rounding được duyệt, vẫn giữ gốc. |
| Giới hạn câu | Duyệt tạm1.000; hoặc chọn limit sau benchmark. |
| Thứ tự phần | Duyệt giả thiết hiện hành: false giữ nguồn/true nhóm phần; hoặc schema mới bắt nguồn nhóm phần. Không thay quyết định này trong review. |
| Mẫu chuẩn | Tiếp tục chỉ custom; hoặc preset theo môn/năm đã kiểm chứng. |
| Collector/hosting | Local/private; Apps Script có integration thật; hoặc gateway serverless đã duyệt quyền/chi phí. |
| Report offline | HTML; hoặc PDF sau duyệt renderer và policy công bố key. |

recommended_action: giữ CHANGES_REQUESTED cho sản phẩm, giao đúng vùng hoàn tất F01 và public acceptance; nhận các fix F02/F03/F04 theo snapshot đã kiểm, bổ sung regression còn thiếu. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật, không nội dung hồ sơ riêng/credentials/dữ liệu học sinh. Reviewer chỉ tạo báo cáo trong scope, không sửa sản phẩm hoặc điều phối worker.
