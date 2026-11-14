# LC09 — Kiểm định toàn bộ sản phẩm, vòng 9

- review_id/task_id/worker_id: LC09; reviewer: Codex.
- verified_at: 2026-11-14, khoảng 04:04–04:15, Asia/Bangkok.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch: `main`; review HEAD cộng working tree chưa commit.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6 (B1-AC01…08/B1-T01…17).
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo, chưa nghiệm thu M1/sản phẩm.
- findings_summary: **2 BLOCKER OPEN / VERIFIED**, kế thừa LC08: thiếu scoring API và web entry. Không phát hiện regression mới trong các kiểm tra đã chạy; không chứng minh engine hiện hữu tính sai điểm vì engine tổng hợp chưa tồn tại.

## Snapshot, diff và files_reviewed

Đã đọc toàn bộ hai hợp đồng trước khi kiểm. Không tìm thấy AGENTS.md trong workspace hoặc D:\AGENTS.md. Không đọc prompt riêng của worker khác. Không cài/thêm dependency, sửa code/config/tests/assets, commit hoặc deploy. Reviewer chỉ tạo `docs/reviews/LOOP-09-codex.md`; probe chạy qua stdin, không tạo test file.

`git log -12 --oneline` chỉ có baseline `2ee84e3`, chưa có commit mới từ LC08. `git diff --stat` so HEAD vẫn là 3 file: ops/m1/tasks.json (222 dòng thay đổi), ops/run_tasks.py (138), package.json (10); tổng 346 insertions/24 deletions. Package có test glob, typecheck và TypeScript7.0.2; chưa có build script trong package.json. Source/tests/assets/lockfile còn untracked nên Git diff không mô tả đầy đủ sản phẩm. Không có snapshot byte LC08 của mọi asset/test/config để kết luận tất cả giữ nguyên; không gán tác giả từ untracked status.

Đã đọc toàn bộ sáu module `src/domain/{model,rational,shortAnswer,validate,judge,shuffle}.ts`, scripts/build.js, sample JSON/SVG, stylesheet, sample acceptance, ambient Node declarations và manifests/configs; xem assertions domain, đặc biệt exhaustive judgeII và mixed-source shuffle; chạy toàn suite. Đọc LC08 và READINESS §6; chạy oracle và đối chiếu năm fixture files qua probe. Inventory `rg --files src test public scripts styles` chỉ có sáu source modules cùng tests/oracle/assets, chưa có UI/persistence/API/report/importer runtime. Dashboard/workers/ops là công cụ điều phối, không được coi là web luyện thi và không nằm trong kiểm toán sâu sản phẩm lần này.

| File | SHA256 LC09, khớp LC08 |
| --- | --- |
| src/domain/judge.ts | 8FD98C77E6F9BBC96029BA5E2D0DB719C61725BA951BE7CE4053C5ACBFF6F23A |
| src/domain/model.ts | 73C013F90751294B69771DF246FD5F2CE1011B93857452659A614C906B71EF76 |
| src/domain/rational.ts | D0DE13864CEE75CEA8A96298C2CA06110DE040C061C75E9B241CCAED7F95FE25 |
| src/domain/shortAnswer.ts | 35A6ED980AB8301EC8161D2B9373E8F3E582FD87534BEAAEB47A22C2F3DF7A6C |
| src/domain/shuffle.ts | B003ADB9592F7CAEC3E0F25FB2AE89933937AA395E1C863F38852676A0040E73 |
| src/domain/validate.ts | 58D7B9EC8B1BD73893C033B15A4DC0EC5747CB202626FA5CE2940CC8219BEAF5 |

Suite vẫn128 tests/29 suites như LC08. Không chứng minh có thay đổi sản phẩm mới cần quy thành regression. Các blocker là yêu cầu chưa triển khai được xác minh lại. Working tree dùng chung có thể đổi sau snapshot; kết quả không tự áp dụng cho thay đổi về sau.

## Findings

### LC09-F01 — BLOCKER — Thiếu public scoring engine, maxima và strict result DTO

- previous: LC08-F01; status: **OPEN / VERIFIED**.
- affected_files: `src/domain/index.ts`, `src/domain/examMax.ts`, `src/domain/scoreAttempt.ts`, `src/domain/serialize.ts`: **missing**, line=N/A; yêu cầu M1 §4.6–4.8. Không gán line giả cho file chưa tồn tại.
- **VÙNG chịu trách nhiệm: src/domain**.
- evidence: probe node:test dynamic-import cả bốn module nhận `ERR_MODULE_NOT_FOUND`; assertion yêu cầu danh sách import lỗi rỗng thất bại. Inventory source chỉ có sáu module nền. Sample acceptance chỉ validate/gọi judges, không tạo ScoreResult hoặc assert total/max qua public API.
- reproduction_steps: tại D:\Cunata chạy import probe bên dưới; hoặc `node --input-type=module -e "await import('./src/domain/index.ts')"`; kiểm tương tự ba file còn lại.
- expected: computeExamMax/POINT_I/PART2_POINTS, scoreAttempt tự validate, ScoringInputError/ENGINE_VERSION; rational score/max tổng và từng phần; trạng thái câu; strict result DTO và barrel exports đúng chữ ký.
- actual: không có đường sản phẩm tính tổng/max hoặc serialize/restore kết quả; không thể chạy public acceptance M1.
- impact: chặn M1 và UI/report phụ thuộc điểm. Judges/oracle xanh không chứng minh scoring sản phẩm đúng với tổng5/10/15/16, II partial hay III invalid.
- minimal_fix: hoàn tất M1-B1/B2/B3 đúng hợp đồng, nối exports. Không thay engine bằng phép tính trong test/oracle.
- regression_test: public API chạy1.632 fixtures; golden N3=0/3/7, BASE9,75/10/10,25; II k0…4/null/duplicate/unknown; III exact/invalid/unanswered; full=max, bounds/sums/statuses, input purity, ID permutations, snapshot/version isolation; DTO strict malformed/roundtrip và mutation controls trên SUT.

### LC09-F02 — BLOCKER — Web verification thất bại vì thiếu entry sản phẩm

- previous: LC08-F02; status: **OPEN / VERIFIED**.
- affected_files: `scripts/build.js:9–20` (asset bắt buộc/exit lỗi), `index.html`: **missing**, line=N/A; `package.json:8–10` chưa có build script.
- **VÙNG chịu trách nhiệm: glue**.
- evidence: `node scripts/build.js` chạy thật, exit1: `[ERROR] Missing required file: index.html`. Không có student web runtime trong src. Styles/sample riêng lẻ không tạo đường làm bài.
- reproduction_steps: chạy `node scripts/build.js` tại root; không cần install/server.
- expected: web entry/runtime nối UI→domain theo milestone, assets/module load được, build/verification thành công, có luồng làm bài/nộp/xem điểm/report.
- actual: script dừng ngay asset đầu tiên; không tạo bundle/build artifact và chưa có web sản phẩm để kiểm browser.
- impact: chặn web demo/nghiệm thu toàn sản phẩm. UI không thuộc phạm vi M1 thuần, nhưng F01 độc lập chặn M1.
- minimal_fix: hoàn tất entry/runtime nối engine thật và cung cấp lệnh build/verification rõ ràng; không thêm HTML rỗng để lấy exit0. `build.js:41–49` chỉ kiểm chuỗi stylesheet sau file/schema, chưa kiểm script logic dù comment nhắc tới; READY của script không đủ chứng minh runtime.
- regression_test: verification + HTTP/module assets + browser console; làm đủ ba dạng câu, nộp, xem score/max tổng/từng phần và tải report. Negative controls thiếu entry/asset/runtime phải không được chấp nhận là web hoàn thiện.

## Ledger tái kiểm

| Hạng mục | Bằng chứng LC09 | Giới hạn |
| --- | --- | --- |
| LC06-F02 shuffle | Hai regression nguồn xen phần vẫn trong suite (`test/domain/shuffle.test.ts:835–968`); probe đủ4 cặp flags trên III→I→II→I, deterministic, đúng ID set, false giữ nguồn/true nhóm phần, options độc lập cờ, purity/JSON roundtrip: PASS. | JSON roundtrip không phải browser reload/offline; score invariance qua engine chưa chạy được. |
| LC06-F04 validator | Suite regression hostile error PASS; probe null-prototype error và throwing message cho exam/attempt trả ok=false, không thoát exception. | Không chứng nhận mọi unknown/getter/proxy đều an toàn sau validation; public scoreAttempt chưa có. |
| LC06-F03 sample | Schema và5 acceptance PASS; q02=3−2×2=−1, q07 min(2x²+2x trên[-1;1])=−1/2; q01 có SVG/reference. | Chưa render web. Test q07 chủ yếu assert literal key/charset/explanation; full-correct sample sao key thành responses, không chứng minh nội dung toán hoặc tổng điểm. |
| Judge/oracle fixtures |1.632cases validate và điểm từng phần suy ra từ judges khớp oracle qua probe. | Lookup/weight phụ trợ do reviewer tính; không phải computeExamMax/scoreAttempt sản phẩm, không kiểm ScoreResult/status/DTO. |
| Rational parser | Probe4 canonical strings×5 line endings đều ném SyntaxError; diagnostic thêm4 chuỗi cũng bị từ chối. | Không mở finding từ suy đoán regex; chưa full hostile resource benchmark. |

## checks_run

Environment: Windows/PowerShell; D:\Cunata; Node v24.14.0, npm11.9.0, TypeScript7.0.2; Python3.11.0. Raw output/evidence nằm trong transcript tool calls phiên LC09; không ghi log ngoài scope. Probe dùng here-string stdin `node --input-type=module`, kèm `exit $LASTEXITCODE` để truyền đúng mã Node.

| Command/check | Exit | Kết quả thật |
| --- | ---: | --- |
| git status/log/rev-parse/branch; git diff --stat; git diff -- package.json |0| Baseline/main, source untracked và diff tích lũy như snapshot; warning LF→CRLF không phải lỗi chạy. |
| `Get-FileHash src/domain/*.ts -Algorithm SHA256` |0| Sáu hashes khớp LC08. |
| `npm test` |0| **128pass/0fail**,29suites; cancelled/skipped/todo=0; duration_ms233.6199. Exhaustive II1.296vectors là một test, không cộng1.296 vào tổng128. |
| `npx --no-install tsc -p tsconfig.json` |0| **PASS**, không diagnostics; wall1.422s. Tsc có thật, không dùng NOT_RUN cũ trong M1. |
| `npx --no-install tsc -p tsconfig.web.json` |0| **PASS**, không diagnostics; wall1.491s. noEmit, không phải web build. |
| `node scripts/build.js` |**1**| **FAIL**, missing index.html; wall0.156s; không bundle/browser. Package không có npm build nên chạy script thật đang có. |
| `python -B test/oracle/oracle.py --check` |0| **11pass/0fail/0skip**,1.632cases/5files,5.849maxima configs,9negative controls,seed20261114; duration_s1.0781/unittest0.395s. Oracle tự kiểm, không engine sản phẩm. |
| LC09 stdin Node/node:test probe (5 tests) |**1**| **4pass/1fail**,67.1516ms. FAIL cả4scoring modules thiếu; PASS schema/judge-derived section scores, shuffle/JSON/purity, hostile errors,20 malformed fractions. |
| Standalone parser diagnostic stdin |0|4chuỗi lỗi đều báo SyntaxError; wrapper bắt exception nên exit0 chỉ mô tả diagnostic. |
| rg network/storage/eval/HTML/credential/random/time/numeric-parse patterns trong src/public/scripts/styles |0| Chỉ SVG namespace URL; không tìm thấy patterns khác. Tìm kiếm giới hạn, không full secret/security scan. |
| Browser/E2E/mobile/IME/a11y/Lighthouse/lint |—| **NOT_RUN**: thiếu student entry/runtime và setup tương ứng; không screenshot/trace. |
| Collector/Google/CORS/importer/offline/timer/two-tab integration |—| **NOT_RUN / NOT_IMPLEMENTED**; không thay bằng mock success. |

Typecheck dùng ambient-node.d.ts cục bộ và không check JS build script theo config hiện tại; không chứng nhận đầy đủ Node typings hoặc browser runtime. Không cộng oracle/probes vào npm test counts.

### Repro tối thiểu không tạo file

```powershell
@'
import assert from 'node:assert/strict';
const errors=[];
for (const name of ['index','examMax','scoreAttempt','serialize']) {
  try { await import(`./src/domain/${name}.ts`); }
  catch(e) { errors.push(`${name}:${e.code}`); }
}
assert.deepEqual(errors,[]);
'@ | node --input-type=module
# LC09: exit1, cả4 ERR_MODULE_NOT_FOUND

node scripts/build.js
# LC09: exit1, Missing required file: index.html
```

Probe5 tests đầy đủ nằm trong transcript. Fixture probe đọc mọi JSON trong test/oracle/fixtures, assert validate exam/attempt, cộng rational từ judgeI, bảng II[0,1/10,1/4,1/2,1] và weight III tính riêng từ counts/contract, so expected.sections cho I/II/III và assert1632cases. Không assert engine total/max/status vì API chưa tồn tại. Shuffle dùng sample câu[6,0,4,1], seed `LC09-fixed`; parser dùng `0`,`1`,`-2`,`1/2`×LF/CR/CRLF/U+2028/U+2029. Regression đề xuất phải được worker đưa vào suite khi sửa.

## coverage_gaps và traceability

| Tiêu chí | Kết quả LC09 |
| --- | --- |
| B1-AC01…03; T01…06 | PARTIAL: schema/charset/codepoint/rational/judges có tests/probes; II exhaustive PASS. Public engine lookup/status/total/max chưa có. |
| AC04; T11/T14 | IDs/refs có validation; thiếu strict result DTO, result isolation/version lifecycle toàn luồng. |
| AC05; T12 | Shuffle flags/mixed-source/determinism/permutation và JSON PASS; thiếu score invariance qua engine và actual persistence. |
| AC06; T10 | Validator malformed-input PASS; public engine/count/max/DTO fail-closed chưa kiểm được. Limit1000 ghi issue nhưng vẫn duyệt toàn array; chưa benchmark hostile payload, không kết luận DoS endpoint khi chưa endpoint. |
| AC07 | Test/typechecks PASS có output thật; web verification FAIL; public acceptance/mutation thiếu. |
| AC08 | Có report/repro/gaps; chưa owner acceptance/release/changelog/rollback đầy đủ. |
| T07…09/T13/T15 | Rational/oracle xác nhận một phần nền; maxima/bounds/sums/result DTO/status của engine chưa triển khai. |
| T16/T17 | Display policy DEFERRED; mutation engine NOT_RUN/NOT_IMPLEMENTED;9negative controls oracle không phải mutation SUT. |

Chưa có UI→domain→persistence→API→report. Chưa kiểm thực refresh/back/forward/offline/order/input, background deadline/clock shift, manual/double/autosubmit, stale final/two tabs, migration/quota/private mode,2–3học sinh đồng thời. Chưa receipt/readback/retry/backoff/idempotency/lost-response/CORS thật hay trusted grading. Chưa importer/corpus DOCX/PDF/OMML/OCR. Chưa kiểm browser rich text/math/image rendering, keyboard/focus/contrast/zoom/mobile/IME/Telex/VNI; CSS selectors/comment không chứng minh a11y.

Không full audit ops/dashboard, Git history secrets, dependency advisories/licenses hoặc third-party tooling. Không đưa khuyến nghị dependency/claim upstream hiện hành nên không nghiên cứu web trong task này. No-login không cấp authorization thật; sample luyện tập public không tự động là leak answer key của kỳ thi có policy bí mật.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0/M1, src/domain:** maxima/scoreAttempt/strict DTO/barrel; public acceptance/golden/oracle, bounds/sums/full=max/statuses/purity/versions/permutations/mutation. Đóng F01, giữ regression nền đã xanh.
2. **P1/M2, glue và module mới theo phân công:** web entry/runtime tiếng Việt mobile/desktop, nickname không xác thực, ba dạng câu nối engine; attempt/version/order snapshots, deadline/manual/autosubmit; local save/offline/refresh/quota/migrations/two-tab CAS/chống stale/double submit. Đóng F02 bằng đường chạy thật.
3. **P1/M2:** bảng tổng/từng phần score/max (giữ5/15/16), thời gian/trạng thái/câu trả lời/key/lời giải theo policy; tải report offline HTML/PDF sau chọn công nghệ, giữ rational gốc.
4. **P2/M3:** question bank môn→lớp→chương/chủ đề→bài→mức độ; builder custom bật/tắt phần, thời gian/trộn/lượt/lời giải; reuse/versioned questions/publish snapshots/backup/export/import; authoring private phù hợp no-login.
5. **P2/M4:** collector/Google/hosting được duyệt; real receipt/readback/local_saved/queued/sending/server_confirmed/failed, durable dedupe/bounded retry/backoff/CORS/lost response; trusted grading khi cần, tối thiểu PII/xóa/xuất/sao lưu.
6. **P3/M5:** DOCX/PDF→IR→preview/edit→confirm→publish; text/table/image/OMML/LaTeX, text PDF/scan/OCR, provenance/confidence/flags/missing keys; file corruption/size/external-rel/resource handling, không đoán đáp án.
7. **P3/mẫu chuẩn:** ruleSet/preset theo môn/năm/văn bản được kiểm chứng và owner duyệt, tách custom-v1.
8. **P4/M6:** E2E/browser/mobile/IME/a11y/performance/security/privacy/lint/build gates, changelog/rollback/owner acceptance. Integrity/security gates áp dụng ngay trong từng milestone.

## Quyết định còn mở

Không có quyết định nghiệp vụ thiếu chặn review LC09 hoặc các API M1 đã quy định. Không tự chốt các mục sau; **NEED_DECISION khi triển khai phần liên quan**, đưa owner chọn:

| Hạng mục | Phương án |
| --- | --- |
| Grammar III | Giữ charset/length sa-charset-v1; hoặc grammar chặt có policy version/compatibility. |
| Display điểm | Phân số exact; hoặc decimal theo số chữ số/rounding được duyệt, giữ rational gốc. |
| Limit đề | Duyệt1000 tạm; hoặc limit sau benchmark. |
| Nhóm phần khi trộn | Duyệt false giữ nguồn/true nhóm I→II→III; hoặc schema mới yêu cầu nguồn đã nhóm phần. |
| Mẫu chuẩn | Tiếp tục custom; hoặc registry/preset môn/năm được kiểm chứng. |
| Collector/hosting | Local/private; Apps Script qua integration thật; hoặc gateway serverless được duyệt. |
| Report offline | HTML; hoặc PDF với renderer/policy công bố key được chọn. |

recommended_action: giữ **CHANGES_REQUESTED**; giao hoàn tất F01/F02 đúng vùng rồi chạy public acceptance và web/browser checks. LC09 tái xác nhận blocker chưa xử lý; không dùng review nền lặp lại thay cho triển khai. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật, không chỉ thị riêng/credentials/dữ liệu học sinh.
