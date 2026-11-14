# LC08 — Kiểm định toàn bộ sản phẩm, vòng 8

- review_id/task_id/worker_id: LC08; reviewer: Codex.
- verified_at: 2026-11-14, khoảng 03:58–04:02, Asia/Bangkok.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch: `main`; review HEAD cộng working tree chưa commit.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6, B1-AC01…08/B1-T01…17.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo; chưa nghiệm thu M1 hoặc sản phẩm.
- findings_summary: **2 BLOCKER OPEN / VERIFIED**: public scoring engine còn thiếu; đường kiểm tra web hiện thất bại do thiếu entry. Không chứng minh engine hiện hữu tính sai điểm. Các fix validator/shuffle/sample từ vòng trước tiếp tục đạt các kiểm tra đã chạy.

## Snapshot, diff và files_reviewed

Đã đọc toàn bộ hai hợp đồng trước khi review. Không thấy AGENTS.md trong workspace hoặc tại D:\AGENTS.md. Không đọc prompt riêng của các worker khác. Không cài package, không sửa code/config/test/assets, không commit/deploy. Artifact reviewer tạo duy nhất: `docs/reviews/LOOP-08-codex.md`.

`git log -12 --oneline` vẫn chỉ có baseline `2ee84e3`; không có commit mới so LC07. `git diff --stat` tích lũy so HEAD: ops/m1/tasks.json 222 dòng thay đổi, ops/run_tasks.py 138, package.json 10; tổng 346 insertions/24 deletions. Source/tests/assets/lockfile còn untracked, nên Git diff không chứa sản phẩm; đã đọc source thật. Không có snapshot byte đầy đủ của LC07 cho mọi file để khẳng định diff chính xác toàn working tree hoặc gán tác giả.

Đã đọc toàn bộ sáu module `src/domain/{model,rational,shortAnswer,validate,judge,shuffle}.ts`, toàn bộ `scripts/build.js`, sample JSON/SVG, stylesheet, sample acceptance, ambient Node declarations, manifests/configs; xem và chạy suite domain, tập trung các assertions rational/validation/judge và regression mixed-source shuffle mới. Đọc LC07 và READINESS §6; oracle/fixtures được thực thi và đối chiếu qua probe độc lập. Inventory không có module sản phẩm ngoài src/domain. Các công cụ điều phối ops/dashboard/workers không được kiểm toán như ứng dụng học sinh.

| File | SHA256 ở LC08 |
| --- | --- |
| src/domain/judge.ts | 8FD98C77E6F9BBC96029BA5E2D0DB719C61725BA951BE7CE4053C5ACBFF6F23A |
| src/domain/model.ts | 73C013F90751294B69771DF246FD5F2CE1011B93857452659A614C906B71EF76 |
| src/domain/rational.ts | D0DE13864CEE75CEA8A96298C2CA06110DE040C061C75E9B241CCAED7F95FE25 |
| src/domain/shortAnswer.ts | 35A6ED980AB8301EC8161D2B9373E8F3E582FD87534BEAAEB47A22C2F3DF7A6C |
| src/domain/shuffle.ts | B003ADB9592F7CAEC3E0F25FB2AE89933937AA395E1C863F38852676A0040E73 |
| src/domain/validate.ts | 58D7B9EC8B1BD73893C033B15A4DC0EC5747CB202626FA5CE2940CC8219BEAF5 |

Sáu domain hashes giữ nguyên so bảng LC07. Thay đổi quan sát được: suite tăng từ126 lên128 tests với hai regression nguồn xen phần tại `test/domain/shuffle.test.ts:835–968`; xuất hiện `scripts/build.js` và có tsconfig.web.json. Package chưa có build script; build.js được chạy trực tiếp. Chưa có index.html hoặc web runtime. Snapshot dùng chung có thể tiếp tục thay đổi sau kiểm; kết luận không tự áp dụng cho code mới.

## Findings

### LC08-F01 — BLOCKER — Thiếu public scoring engine, maxima và strict result DTO

- previous: LC07-F01; **OPEN / VERIFIED**.
- affected_files: `src/domain/index.ts`, `src/domain/examMax.ts`, `src/domain/scoreAttempt.ts`, `src/domain/serialize.ts`: **missing**, line=N/A. Yêu cầu M1 §4.6–4.8; không gán line giả cho file chưa tồn tại.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence: cả bốn dynamic imports trả `ERR_MODULE_NOT_FOUND`; probe node:test thất bại với danh sách bốn module thiếu. Inventory chỉ sáu module nền; acceptance sample chỉ gọi validate/judge, không gọi public scoring API.
- reproduction_steps: tại D:\Cunata chạy `node --input-type=module -e "await import('./src/domain/index.ts')"`; kiểm tương tự với examMax/scoreAttempt/serialize. Hoặc chạy probe import bên dưới.
- expected: computeExamMax/POINT_I/PART2_POINTS; scoreAttempt tự validate và ScoringInputError; rational score/max tổng và từng phần; trạng thái câu; ENGINE_VERSION; strict ScoreResult DTO và public exports đúng chữ ký.
- actual: không có đường tạo ScoreResult; không tính maxima/totals/status qua engine sản phẩm, không serialize/restore kết quả đúng API.
- impact: chặn M1 và mọi UI/report cần điểm. Tests xanh hiện tại không chứng minh tổng 5/10/15/16 hay lookup điểm II của engine.
- minimal_fix: hoàn thành M1-B1/B2/B3 theo hợp đồng, nối barrel exports, thêm acceptance qua index.ts; không dùng oracle hoặc phép cộng trong test thay engine.
- regression_test: chạy1.632 fixtures qua scoreAttempt; golden N3=0/3/7, BASE9,75/10/10,25; II k0…4/null/duplicate/unknown; III exact/invalid/unanswered; full=max, bounds/sums, purity, response/option/question permutations theo ID; phiên bản cũ bất biến; DTO malformed/roundtrip và mutation controls trên SUT.

### LC08-F02 — BLOCKER — Web verification thất bại vì thiếu entry sản phẩm

- status: **OPEN / VERIFIED**, mới có bằng chứng lệnh web thật ở vòng này; không phải regression một web từng chạy được.
- affected_files: `scripts/build.js:9–20` yêu cầu asset và thoát lỗi; `index.html` **missing**, line=N/A; `package.json:8–10` chỉ có test/typecheck.
- **VÙNG chịu trách nhiệm: glue**.
- evidence: chạy `node scripts/build.js`, exit1, output `--- Cunata Web Demo Build & Verification ---` rồi `[ERROR] Missing required file: index.html`. Không có entry/runtime làm bài trong inventory src. Styles và sample đơn lẻ không tạo ứng dụng chạy được.
- reproduction_steps: checkout working tree hiện tại, tại D:\Cunata chạy `node scripts/build.js`; không cần cài dependency hay dựng server.
- expected: nếu bàn giao web demo/sản phẩm, có entry và runtime nối UI→domain, tài nguyên tải được, quy trình verification/build chạy thành công; tách rõ asset verification khỏi kiểm tra thực thi browser.
- actual: script dừng ngay ở asset đầu tiên; không đến bước schema/stylesheet và không tạo build artifact. Chưa thể làm bài hoặc tải báo cáo qua UI.
- impact: chặn web demo/build verification và nghiệm thu toàn sản phẩm; riêng phạm vi M1 không yêu cầu UI, nhưng F01 đã độc lập chặn M1.
- minimal_fix: hoàn tất entry/runtime theo milestone được duyệt, nối engine sau F01 và cung cấp lệnh web được ghi rõ. Không thêm HTML rỗng để lấy exit0 rồi gọi đó là web hoàn chỉnh. Script hiện chỉ kiểm file/schema/chuỗi stylesheet; kể cả xanh cũng chưa chứng minh browser chạy TypeScript hoặc scoring.
- regression_test: chạy lại verification, kiểm HTTP assets/module imports và browser console, làm bài ba dạng câu, nộp và xem điểm/max tổng/từng phần, tải report. Test mất entry hoặc asset phải fail; kiểm runtime không tồn tại không được coi là READY sản phẩm.

## Ledger hồi quy và kết quả không phải finding mở

| Finding cũ / vùng | Kết quả tái kiểm | Regression/gap |
| --- | --- | --- |
| LC06-F02 shuffle / src/domain | FIXED / VERIFIED. Source false giữ thứ tự gốc; true nhóm I→II→III. Probe LC08 seed `LC08-fixed` đủ4 cặp flags, deterministic/purity/JSON roundtrip PASS. | **Gap LC07 đã đóng**: hai tests mới `test/domain/shuffle.test.ts:835–968` bao gồm III→I→II và I→III→I, thêm negative orders; suite PASS. Chưa kiểm browser restore hoặc score invariance qua engine thiếu. |
| LC06-F03 sample / glue | FIXED ở dữ liệu nguồn; sample schema và5 acceptance PASS. q02=3−2×2=−1; q07 min(2x²+2x trên[-1;1])=−1/2; q01 có SVG và reference. | Chưa render browser. Test q07 mới assert literal key/charset/explanation, phép toán chỉ comment; chưa assert content/function độc lập. “full correct” sao key làm input, không chứng minh nội dung toán hoặc tổng điểm. |
| LC06-F04 validator / src/domain | FIXED / VERIFIED. Suite có hostile-exception regression; probe thêm null-prototype exception và throwing message trả ok=false, không thoát exception. | Không suy ra unknown input nào cũng an toàn; chưa có public scoreAttempt. |
| Rational canonical parsing / src/domain | Probe20 chuỗi:0/1/−2/1⁄2 với LF/CR/CRLF/U+2028/U+2029 đều ném SyntaxError. | Không phát hiện lỗi parser trong nhóm này; không sửa regex hoặc mở finding từ phỏng đoán. |

## checks_run

Environment: Windows/PowerShell; D:\Cunata; Node v24.14.0, npm11.9.0, TypeScript7.0.2; Python3.11.0. Raw output nằm trong transcript phiên LC08; không tạo log ngoài scope. Probe chạy qua stdin; Node exit được truyền bằng `exit $LASTEXITCODE`.

| Command/check | Exit | Kết quả thật |
| --- | ---: | --- |
| git status --short; git log -12 --oneline; git rev-parse HEAD; git branch --show-current; git diff --stat; git diff -- package.json | 0 | main/HEAD như metadata; một baseline, source untracked; diff tích lũy346+/24−. Không commit mới từ LC07. |
| Get-FileHash src/domain/*.ts -Algorithm SHA256 | 0 | Sáu hashes ở bảng snapshot. |
| `npm test` | 0 | **128pass/0fail**,29 suites; cancelled/skipped/todo=0; duration_ms187.6334. Exhaustive II1.296 vectors nằm trong một test. |
| `npx --no-install tsc -p tsconfig.json` | 0 | **PASS**, không diagnostics; wall1,21s. Compiler đã có thật, không dùng ghi chú NOT_RUN cũ của M1. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | **PASS**, không diagnostics; wall1,19s. noEmit; không phải web build. JS build script không được typecheck với cấu hình checkJs hiện tại. |
| `node scripts/build.js` | **1** | **FAIL**, thiếu index.html; không tạo bundle, không chạy browser. Không ghi NOT_RUN cho lệnh đã chạy. |
| `python -B test/oracle/oracle.py --check` | 0 | **11pass/0fail/0skip**,1.632cases/5fixtures,5.849 maxima configs,9negative controls; seed20261114; duration_s0.9764, unittest0.358s. **Oracle tự kiểm**, không phải engine sản phẩm. |
| Probe LC08 stdin Node/node:test (5 tests) | **1** | **4pass/1fail**, duration_ms70.4567. FAIL bốn public modules thiếu; PASS schema/judge-derived section scores của1.632cases; hostile errors; mixed-source flags/purity/JSON;20 malformed fraction strings. |
| Probe chẩn đoán imports/parser trước probe node:test | 0 |7 chuỗi malformed đều bị từ chối;4 imports trả ERR_MODULE_NOT_FOUND được bắt và in ra. Exit0 của wrapper **không** chứng minh imports thành công; assertion probe ở dòng trên fail đúng. |
| rg input/network/secret patterns trong src/public/styles/scripts | 0 tổng lệnh | Chỉ khớp namespace SVG `http://www.w3.org/2000/svg`; không phát hiện network/storage/eval/innerHTML/credential theo mẫu. Không phải full security audit. |
| Browser/E2E/mobile/IME/a11y/performance, lint | — | **NOT_RUN**: chưa web entry/runtime hoặc setup tương ứng; không có screenshot/trace. |
| Collector/Google/CORS/importer/real offline integration | — | **NOT_RUN / NOT_IMPLEMENTED**. Không thay bằng mocked success. |

Không cộng oracle/probes vào128 npm tests. Probe tính lookup/trọng số trong mã reviewer để kiểm judge so expected fixture, **không kiểm computeExamMax/scoreAttempt/ScoreResult** chưa tồn tại. Chưa kiểm maxima output sản phẩm, total/status/DTO sản phẩm. Typecheck dùng ambient-node.d.ts stub nên không chứng nhận đầy đủ typings Node.

### Repro tối thiểu cho hai blockers (không tạo file)

```powershell
@'
import assert from 'node:assert/strict';
const missing = [];
for (const name of ['index','examMax','scoreAttempt','serialize']) {
  try { await import(`./src/domain/${name}.ts`); }
  catch (e) { missing.push(`${name}:${e.code}`); }
}
assert.deepEqual(missing, []);
'@ | node --input-type=module
# LC08: exit=1, cả bốn ERR_MODULE_NOT_FOUND.

node scripts/build.js
# LC08: exit=1, Missing required file: index.html.
```

Probe5 tests đầy đủ đã chạy trong transcript: fixture loop đọc cả5 JSON, validate exam/attempt, dùng judge + bảng rational[0,1/10,1/4,1/2,1] và trọng số III theo Contract để assert từng expected.sections[k].score, assert count=1632; không ghi file test ngoài scope. Snapshot probe lấy sample theo thứ tự câu[6,0,4,1], chạy4 flags, so JSON roundtrip và input trước/sau. Parser probe dùng4 canonical values×5 line endings; mỗi input phải ném SyntaxError.

## coverage_gaps và traceability

| Tiêu chí | Trạng thái ở LC08 |
| --- | --- |
| B1-AC01…03; T01…06 | PARTIAL: schema/charset/rational/judge có unit + fixture probes; II exhaustive judge PASS. Total/max/status/lookup điểm trong public engine vẫn thiếu F01. |
| B1-AC04; T11/T14 | Stable IDs và schema refs được kiểm một phần; thiếu strict ScoreResult DTO, output isolation, immutable version toàn luồng. |
| B1-AC05; T12 | Shuffle + mixed-source regression PASS; snapshot JSON probe PASS. Thiếu engine score invariance và browser persistence; không gọi JSON roundtrip là reload/offline restore. |
| B1-AC06; T10 | Validator tests PASS; public scoring fail-closed/count validation/DTO validation chưa có. LIMIT_EXCEEDED hiện ghi issue nhưng vẫn duyệt mọi phần tử, chưa benchmark hostile payload lớn; không chứng minh DoS mạng khi chưa có endpoint. |
| B1-AC07 | Unit/typechecks có kết quả thật; public scoring acceptance/mutation thiếu; web verification FAIL. |
| B1-AC08 | Có review/evidence/gaps; chưa owner nghiệm thu, changelog/release/rollback toàn sản phẩm. |
| T07…09/T13/T15 | Rational/oracle chỉ là một phần; maxima/bounds/sums/status/result DTO của SUT chưa có. |
| T16/T17 | Display policy DEFERRED; mutation engine NOT_RUN/NOT_IMPLEMENTED. Oracle9 negative controls không phải mutation trên SUT. |

Chưa có đường UI→domain→persistence→API→report. Chưa thể xác nhận refresh/back/forward/offline giữ input/order, timer background/clock shift, manual/double/autosubmit, hai tab/stale final, migration/quota/private mode,2–3 học sinh đồng thời. Chưa có receipt/retry/backoff/idempotency/lost-response/CORS thực hoặc trusted server grading. Chưa có importer/corpus DOCX/PDF/OMML/OCR. Chưa test renderer rich text/math/SVG, keyboard/focus/contrast/zoom/mobile và IME/Telex/VNI; CSS comments không là bằng chứng a11y/responsive.

Không full audit điều phối ops hoặc toàn Git history/dependency licenses/advisories/secrets. Không cần web research ở vòng kiểm code nội bộ này; không đưa khuyến nghị dependency hay claim upstream hiện hành. No-login chỉ là luồng vai trò, không có authorization thật. Sample public luyện tập không có secrecy policy đã áp dụng; không tự kết luận key trong sample là rò rỉ kỳ thi bảo mật.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0/M1:** hoàn tất maxima/scoreAttempt/strict result DTO/barrel, acceptance qua public API và oracle/golden, bounds/sums/full=max, statuses, permutations/version/purity/mutation. Giữ regression mixed-source vừa bổ sung; làm sample content tests độc lập hơn.
2. **P1/M2:** entry web tiếng Việt mobile/desktop và runtime ba dạng câu, nối engine thật; nickname không xác thực; attempt/version/order snapshot; timer/manual/autosubmit; local save/offline/refresh, quota/migrations/two-tab CAS và chống stale/double submit. Xử lý F02 bằng đường chạy thực.
3. **P1/M2:** kết quả tổng/từng phần đạt/max, thời gian/câu trả lời/trạng thái/key/lời giải theo policy; tải report offline HTML/PDF sau chọn công nghệ; giữ rational gốc, không ép /10.
4. **P2/M3:** question bank phân loại môn→lớp→chương/chủ đề→bài→mức độ; tái dùng QuestionVersion; builder custom bật/tắt phần, thời gian/lượt/trộn/lời giải, publish snapshot; backup/export/import; quản lý private phù hợp no-login.
5. **P2/M4:** collector/Google và hosting được duyệt; trusted grading khi cần; local_saved/queued/sending/server_confirmed/failed theo receipt thật; idempotency, bounded retry/backoff, CORS/lost response; tối thiểu PII/xóa/xuất/sao lưu.
6. **P3/M5:** DOCX/PDF→IR→preview/sửa→confirm→publish; giữ text/bảng/hình/OMML/LaTeX phù hợp; text PDF/scan/OCR; provenance/confidence/flags/missing key; file hỏng/limits/external relationships, không đoán đáp án.
7. **P3/mẫu chuẩn:** preset/ruleSet riêng theo môn/năm/quy định chính thức đã kiểm chứng và owner duyệt; custom-v1 không thay mẫu chuẩn.
8. **P4/M6:** build/lint/E2E/security/privacy/a11y/IME/mobile/performance, changelog/rollback và owner acceptance. Các gate integrity/security áp dụng ngay trong từng milestone.

## Quyết định nghiệp vụ còn mở

Không có quyết định thiếu chặn review LC08 hoặc các API M1 đã quy định. Không tự chốt các mục sau; **NEED_DECISION khi triển khai phần liên quan**:

| Hạng mục | 2–3 phương án cho owner |
| --- | --- |
| Grammar III | Giữ charset/length sa-charset-v1; hoặc grammar chặt có version/compatibility. |
| Hiển thị điểm | Phân số exact; hoặc decimal với số chữ số/rounding được duyệt và giữ rational gốc. |
| Limit đề | Duyệt tạm1000; hoặc limit sau benchmark. |
| Thứ tự phần | Duyệt giả thiết false giữ nguồn/true nhóm phần; hoặc schema mới bắt nguồn nhóm phần. |
| Mẫu chuẩn | Tiếp tục custom; hoặc preset môn/năm được kiểm chứng. |
| Collector/hosting | Local/private; Apps Script với integration thật; hoặc gateway serverless được duyệt. |
| Report offline | HTML; hoặc PDF sau chọn renderer/policy công bố key. |

recommended_action: giữ CHANGES_REQUESTED; giao hoàn tất F01 và entry/runtime F02 đúng vùng, chạy lại public acceptance và web verification/browser. Không cần lặp review nền không đổi thay cho triển khai phần thiếu. tools_research: NOT_REQUESTED. privacy_notes: báo cáo chỉ chứa kết quả kỹ thuật, không chỉ thị riêng/credentials/dữ liệu học sinh.
