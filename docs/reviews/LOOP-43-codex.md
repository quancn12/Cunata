# LC43 — Kiểm định độc lập toàn sản phẩm

- review_id/task_id: LC43; reviewer: Codex; verified_at: 2026-11-14, Asia/Bangkok.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0, đọc đầy đủ; đối chiếu B1-AC01…08 và B1-T01…17 trong READINESS §6.
- base_commit/head_commit: `329e4be0b35a99895f6d64d85761bd2598de11cb` + working tree đang thay đổi bởi tiến trình khác. Review trước: `docs/reviews/LOOP-42-codex.md`, cùng HEAD, khác working tree. Không lấy commit message hoặc báo cáo trước làm bằng chứng test hiện tại.
- risk_level: HIGH ở persistence/collection; verdict: **CHANGES_REQUESTED**. Handoff **NEED_DECISION** cho các chính sách chưa chốt ở cuối báo cáo. Không có bằng chứng sai điểm trên 1632 fixtures; còn 4 findings đã tái hiện, trong đó 3 kế thừa và 1 mới.
- Quyền ghi của reviewer: chỉ file này. Không sửa code/tests/config, không install/dependency, không branch/worktree, commit hoặc deploy. Các thay đổi README/HTML/tests/ops/workers của tiến trình khác được giữ nguyên.

## Revision, diff và phạm vi

Đã kiểm tra git log/status/diff thật, đọc review trước và đi theo các luồng domain → web scoring → attempt/snapshot/local storage → submit/archive/retry/receipt → report; builder/bank/import/export và collector. Không tìm thấy AGENTS.md trong workspace. Memory registry không có hit liên quan; không dùng kết luận từ memory.

Delta sản phẩm kể từ cutoff LC42: `index.html` +60/-9 dòng, thêm trường `lesson` riêng, editor/badge/filter/search/seed và lưu metadata; `test/e2e/demoFlow.test.ts` +81 dòng, thêm 1 test taxonomy; README cập nhật tính năng và số test. Chưa có thay đổi domain/collector/dependency để sửa ba findings LC42. Các thay đổi ops/dashboard/worker là orchestration đang hoạt động, không được thực thi/deploy bởi reviewer; không đọc prompt riêng của agent khác.

files_reviewed: `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; assertions liên quan trong `test/domain`, `test/acceptance`, `test/e2e`; oracle và fixtures; các đường chạy trên trong `index.html`; `apps-script/Code.js`, README/manifest của collector; README, package/tsconfig/build, assets mẫu. Đây là review theo yêu cầu/data flow/rủi ro, không phải chứng minh mọi dòng hoặc mọi trạng thái UI.

Cutoff source/tests ổn định trước/sau gate cuối, hash SHA256:

| File | Hash |
|---|---|
| index.html | `2e4e153fd567d631527fd155e9fd05ea8068a87add2dbbc02c748f023aeb9c51` |
| test/e2e/demoFlow.test.ts | `12e960f7c201ebb396d41089792f5e1249e2da529d54ee009ab9da5eaaefb750` |
| src/domain/rational.ts | `068b140c1d0df59ae759b6829ae961afa2034c2a5d1f060a26d8bde8e4afb886` |
| apps-script/Code.js | `ee77daf24dfc81878e835f85c2161889a2b6d10f5c88ce32e28177c8f4ee08a2` |

**LATE CHANGE / NOT_REVIEWED:** Khi kiểm tra lại sau khi ghi báo cáo, tiến trình khác tiếp tục sửa `index.html`: hash lần đọc sau là `d34bef2c7941b1665c70dd0c44b3417ce9705ab2196464c33fd9b0e64c87b325`, đã thêm generation map/timeout constant và bắt đầu đổi restore budget comparisons. Source vẫn đang được sửa, không có commit mới. Các PASS, số dòng và repro bên dưới chỉ áp dụng cutoff `2e4e153f…` trong bảng; **không phải chứng nhận bản sửa đang dở hoặc working tree mới nhất sau cutoff**. Chưa đóng F01/F02 từ vài dòng sửa này; cần gate và probes lại sau khi worker hoàn thành một revision ổn định. Không lấy kết quả chạy trước thay kiểm chứng bản mới.

## Findings

### LC43-F01 — MAJOR — Collector thiếu deadline cho request và đọc receipt

- **VÙNG chịu trách nhiệm: glue. VERIFIED; LC42-F01 còn mở.**
- affected_files: `index.html:3094–3096,3256–3265,3339–3343`.
- evidence/reproduction_steps: tạo page bằng helper VM hiện có; nạp đề tổng hợp một câu III, collector `https://example.invalid/collect`; mock fetch trả Promise pending có resolver giữ trong probe; submit thật qua `submitExam()`. Sau microtask flush và 5 lần gọi dispatcher: POST=1, `inFlightDispatches.has(studentState.attemptId)=true`, timeout/retry timers=0. Resolve transport `{ok:false}` rồi flush: in-flight=false, retry timers=1. Probe exit0, không mạng thật hoặc sleep.
- expected: Shared §3 yêu cầu bounded retry/backoff và sync state chính xác; request phải có đường timeout hữu hạn do ứng dụng quản lý, kể cả response body chưa hoàn thành.
- actual/impact: `await fetch`/`await resp.json` không có timeout; guard giữ job in-flight cho tới settlement. Scan/online/direct dispatch không phục hồi job đó khi transport không settle. Không kết luận job khác đều bị chặn: global discovery fix LC41 vẫn có trong source/tests.
- minimal_fix: deadline bao cả fetch lẫn receipt body, abort khi hỗ trợ, cleanup per-job và durable retry metadata. Guard generation/identity để late completion sau timeout không ghi đè trạng thái mới. Không kéo dài global discovery lock.
- regression_test: pending fetch và headers-ok/body-pending; advance fake clock tới deadline → thoát in-flight, ghi failure, retry đúng lịch/budget; B/C vẫn dispatch, repeated scan không nhân timer; late receipt không làm thoái lui final hay confirm attempt khác.

### LC43-F02 — MINOR — Reload bỏ lượt retry thứ 5 còn đang chờ

- **VÙNG chịu trách nhiệm: glue. VERIFIED; LC42-F02 còn mở.**
- affected_files: `index.html:2066–2076,2108,2952–2955,3100–3108,3174–3216`.
- evidence/reproduction_steps: fake `Date.now=100000`, mock POST failure, submit bài một câu III. Chạy 4 retry timers, mỗi lần đặt clock đúng `studentState.nextRetryAt`; tổng POST=5. State/final có `retryCount=5`, chưa `retryExhausted`, còn 1 timer. Clone localStorage sang page mới, đặt clock tại deadline retry cuối và `await initExam()`: POST mới=0, timers=0, `retryExhausted=true`. Positive control: callback cuối của page gốc tại cùng deadline làm POST tăng lên 6. Các assertions chạy exit0.
- expected: cùng durable state/deadline chưa exhausted phải có cùng lượt gửi còn lại giữa page mở và page reload. Không reset budget.
- actual/impact: scheduler ghi ordinal lượt sắp gửi (`currentRetry+1`), restore/archive lại dùng `>=5` làm exhausted. Reload làm mất cơ hội retry cuối dù chưa thực thi. Kết quả local còn, nên không phân loại mất bài hoặc blocker.
- minimal_fix: định nghĩa nhất quán completed attempts/next retry ordinal; phân biệt pending-at-limit với exhausted sau failure cuối, áp dụng đồng bộ active restore/archive/dispatcher/online. Không chỉ đổi một dấu so sánh hoặc reset count.
- regression_test: failure 0…4, reload trước/tại/sau deadline retry5 cho active và archive; đúng 1 POST còn lại, payload/URL giữ nguyên, không sớm. Failure5 mới exhausted; reload tiếp không gửi thêm. So budget page mở với reload.

### LC43-F03 — MINOR — Parser phân số không là nghịch đảo trên toàn output formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED; LC42-F03 còn mở.**
- affected_files: `src/domain/rational.ts:119–145`.
- evidence/reproduction_steps qua public API, đã chạy exit0:
  ```js
  const s = toFractionString(rational(10n ** 200n));
  assert.equal(s.length, 201);
  assert.throws(() => parseFractionString(s), SyntaxError);
  ```
- expected: M1 §4.1 yêu cầu parser là nghịch đảo chặt của formatter; canonical formatter output phải roundtrip.
- actual/impact: constructor/formatter chấp nhận giá trị trên nhưng parser từ chối chuỗi >200. API vi phạm inverse contract; chưa có bằng chứng sai điểm với đề <=1000 câu. Test hiện có cố ý reject >200 không thay đổi contract.
- minimal_fix: giữ inverse cho canonical outputs, tách giới hạn transport tại boundary. Nếu owner muốn bound chung thì phải đổi contract và enforce nhất quán constructor/formatter/parser.
- regression_test: canonical 199/200/201 ký tự, tử/mẫu lớn, âm/zero và noncanonical syntax; kiểm inverse hai chiều trên miền đã duyệt.

### LC43-F04 — MAJOR — Lưu ngân hàng thất bại nhưng vẫn báo nhập/lưu thành công

- **VÙNG chịu trách nhiệm: glue. VERIFIED; finding mới, lỗi có sẵn trước delta lesson.**
- affected_files: `index.html:3917–3933,4015–4016,4605–4606,5004–5007`.
- evidence/reproduction_steps: dùng helper VM, lưu câu III `old` content=`original`; pin bytes `cunata:question_bank`. Thay `localStorage.setItem` để chỉ key ngân hàng ném `QuotaExceededError`. Gọi `importQuestionsToBank([{kind:'III',questionVersionId:'new',answerKey:'2',lesson:'New lesson'}])`: trả **1**, nhưng `getQuestionBank()` không có `new`, bytes lưu giữ nguyên. Gọi `saveQuestionToBank` sửa câu old sang content=`edited`, answerKey=`2`: trả bình thường, đọc lại vẫn `original`. Probe assertions exit0. Source của hai UI callers thông báo thành công vô điều kiện sau các lời gọi này; không tuyên bố đã click UI trong browser thật.
- expected: dữ liệu ngân hàng bền vững theo chức năng hiện có và Shared §5/§8; chỉ báo thành công sau ghi thành công, báo lỗi nếu quota/storage bị chặn. Số nhập phải phản ánh số ghi thực tế.
- actual/impact: `catch (_) {}` nuốt write error; import vẫn tăng count và UI báo thành công. Giáo viên có thể rời editor vì tin đã lưu rồi mất phần sửa chưa được ghi; import nhận báo cáo sai. Không khẳng định probe đã xóa bản ghi cũ hoặc làm mất kết quả học sinh.
- minimal_fix: propagate lỗi hoặc trả typed success/failure từ bank mutations; chỉ tăng count/hiển thị success khi commit thành công. Giữ nội dung editor khi lỗi và cho export/retry; với batch import phải báo partial count hoặc thực hiện một write nguyên tử sau validation. Áp dụng cùng quy tắc cho remove/clear để không giấu thất bại.
- regression_test: storage quota/denied trên add/update/import/delete/clear, old bytes không đổi khi lỗi, UI hiển thị failure và không success, import count không báo record chưa ghi; phục hồi storage rồi retry chỉ ghi đúng một bản và metadata lesson vẫn nguyên.

## Kiểm tra thay đổi và findings trước

- LC42-F01/F02/F03 được kiểm chứng mới trong phiên này, không chỉ sao chép report. Domain/collector không có diff sửa chúng trên cutoff.
- Delta lesson: trường riêng, filter/search/badge và metadata propagation đã có; suite mới xanh. Reviewer còn chạy probe độc lập `setEditingQuestionIdx(0)` → điền `editQLesson_0` → `saveEditedQuestion(0)` → assert builder field → lưu bank → clone storage/page → assert lesson giữ nguyên, exit0. Test mới có tiêu đề “lesson editing” nhưng assertions chủ yếu seed/filter/add metadata, nên không lấy tên test thay kiểm chứng editor.
- Không còn ghi taxonomy Bài riêng là NOT_IMPLEMENTED như LC42. Chưa có bằng chứng browser/a11y hoặc migration/cascade-taxonomy đầy đủ.
- LC41 payload identity/global discovery fixes vẫn được giữ; regression hiện tại chạy pass. Không báo lại global lock cũ như lỗi chưa sửa. Per-job timeout là vấn đề riêng F01.

## checks_run

Environment: `D:\Cunata`, Windows/PowerShell; Node v24.14.0, npm 11.9.0, local TypeScript 7.0.2, Python 3.11.0. Nhận định “tsc chưa cài” trong M1 không còn đúng môi trường này; đã chạy thật, không ghi NOT_RUN. Log artifact: stdout/exit trong tool transcript LC43; không tạo file log/test/probe ngoài scope.

| Command/check thực | Exit | Kết quả |
|---|---:|---|
| `npm test` đầu phiên | 0 | 394 tests, 59 suites, pass394/fail0, cancelled/skipped/todo0; 2076.9255ms. |
| `npm test` gate cuối (`npm.cmd test` trên Windows) | 0 | **394 tests, 59 suites, pass394/fail0**, cancelled/skipped/todo0; 1560.4059ms; wall1.995s. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics; gate cuối wall1.381s. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics; gate cuối wall1.460s. Include TS/harness, không typecheck toàn bộ inline JS trong HTML. |
| `node scripts/build.js` | 0 | 7 assets, sample schema8 câu, stylesheet link, collector syntax hợp lệ; HTML276478 bytes; gate cuối wall0.095s. Đây là static asset verification, không bundle/browser render. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 tests/pass11/fail0/skip0; 1632 fixtures, 5849 maxima configs, 9 negative controls, seed20261114; toàn check1.3202s. Oracle-only, không thay SUT differential. |
| Node stdin independent differential/lifecycle probe | 0 | 1632 fixtures: domain và web khớp oracle total/max và score/max cả 3 phần; domain DTO→JSON→parse deepEqual. F01/F02/F03 tái hiện. HTML unchanged=true. |
| Node stdin bank storage/lesson probe | 0 | F04 tái hiện import count1/no durable write và update cũ; lesson edit→bank→page mới giữ nguyên. |
| `git diff --check -- index.html src test apps-script/Code.js` | 0 | Không whitespace errors. |
| Hash snapshot trước/sau gate cuối | 0 | Toàn bộ src/*.ts, test/*.ts và HTML/collector/build/package/tsconfigs được pin: `source_test_unchanged=true`. HEAD vẫn329e4be. |
| git status/log/diff, source/contracts/review trước | 0 | Xác định dirty working tree và delta thật; read-only. Lệnh inventory từng dò D:\ ngoài repo gặp access denied WindowsApps, exit1; không dùng làm bằng chứng không có file trong thư mục không đọc được. Không có thay đổi bởi reviewer ở đó. |
| Browser thật, Google live, lint/scanners | NOT_RUN | Không chạy Chrome/Firefox/WebKit, endpoint Google, deploy, axe/Lighthouse/SAST/advisory/full-history secrets/license scan; không có lint script. Không cài tool để lấp các gaps. |

Các probes qua PowerShell here-string → `node --input-type=module`; helper `createPageContext` trích từ test bằng `stripTypeScriptTypes`, DOM/storage/timers/fetch giả trong RAM. Đã chạy code sản phẩm, không sửa file hoặc request thật. ExperimentalWarning của Node không phải test failure. Gate cuối qua Python stdlib capture stdout/exit/hash, không ghi artifact khác. Các lần test lặp giới hạn cho source đang thay đổi và final cutoff, không suy số test từ README.

## coverage_gaps và đối chiếu toàn sản phẩm

- **M1/B1-AC01…07, T01…15:** suite + independent fixtures chứng minh các anchors I=1/4, II staircase/null≠false/1296 vectors, III exact string/charset/Unicode, max5/15/16, BASE threshold, repeating fractions, IDs/validation, permutation/determinism/nonmutation/version snapshots/DTO trong ca đã chạy. F03 là ngoại lệ API inverse. Không chạy mutation framework áp từng mutant rồi rerun; tên tests negative discrimination không đủ chứng minh quy trình đó. T16 display policy và AC08 owner acceptance/changelog/rollback còn cần quyết định/evidence.
- **Student/offline/report:** có timer deadline/autosubmit, response+snapshot+presentation restore, từng phần/tổng đạt/tối đa, release gating UI/HTML download. VM không chứng minh refresh/back-forward/cold-offline shell/background scheduling/hai tab transaction trên browser thật. Chưa đo quota/private mode/schema migration cho toàn attempt lifecycle, mở report offline, mobile/desktop, OS Telex/VNI, focus/keyboard/screen reader/contrast hoặc math/media rendering. Renderer regex hiện có chưa được chứng minh là LaTeX renderer tổng quát.
- **Collection/trust:** schema/bounds/sums/alias/raw JSON conflict/locking/dedupe/formula sanitization có source và mocked suite. F01/F02 còn mở. Chưa kiểm CORS/redirect/receipt/readback/cell types/permissions/quota/lost receipt/concurrency trên Google thật. Collector nhận điểm client và kiểm tính nhất quán, chưa chấm từ trusted exam/key. Frontend có answer key; release UI không cung cấp secrecy cho kiểm tra cần giấu đáp án. Chưa nghiệm thu trusted testing.
- **Builder/bank/version:** lesson riêng đã được thêm, có editor/JSON import-export/local bank/search/filter/snapshot isolation. F04 làm persistence báo sai khi lỗi. Chưa nghiệm thu durable builder drafts/assets, migrations, version publication, full export/delete/backup và taxonomy khi thay môn/lớp. Bank JSON validation không tương đương importer DOCX/PDF. No-login/local maxAttempts không xác minh danh tính/quyền public editor.
- **DOCX/PDF:** NOT_IMPLEMENTED pipeline đọc file→IR/provenance/flags→preview/sửa→confirm→publish; chưa corpus text-layer/scan/OCR, nhiều cột/bảng/hình/OMML/LaTeX, corrupt/oversize hoặc cảnh báo mất fidelity. Không xem FileReader JSON là Word/PDF support.
- **Chuẩn THPT/release:** chỉ custom-v1 được kiểm; chưa registry mẫu chuẩn đã xác minh theo môn/năm/văn bản. Chưa đủ CI browser artifacts/security/dependency-license/performance budgets/rollback/changelog và owner acceptance. Không tuyên bố DONE/APPROVED toàn sản phẩm từ suite xanh.
- **Infrastructure:** tiến trình khác thay đổi ops trong phiên; reviewer không chạy publish/web_run/forever hoặc xác nhận behavior automation đó. Các công cụ orchestration không thuộc evidence nghiệm thu website và không được quyền tự deploy từ task này.

## Tính năng lộ trình còn thiếu — ưu tiên

1. **P1/glue:** sửa F01/F02/F04; durable outbox timeout/retry budgets, bounded concurrency, trạng thái queued/sending/confirmed/failed/exhausted rõ; ngân hàng không báo thành công trước durable write. Regression cho failure paths.
2. **P1/glue:** browser E2E thật cho mobile/desktop/offline/refresh/background/hai tab/download; IME/keyboard/a11y/math/media, screenshots/traces và CI evidence.
3. **P1/glue:** chốt trust/collector service; integration Google thật, idempotency/readback/lost receipt/permissions/anti-abuse; trusted server grading nếu chọn chế độ kiểm tra cần điểm tin cậy.
4. **P1/glue:** durable builder drafts/assets, publication/version migrations, xóa/xuất/backup/retention và taxonomy acceptance; giữ snapshot bài cũ khi sửa bank. Trường lesson đã có, không giao triển khai lại.
5. **P2/glue:** DOCX/PDF importer với IR/provenance/confidence, preview-hiệu đính-confirm, OMML/math/bảng/hình/OCR và xử lý file lỗi; không đoán key.
6. **P2/src/domain + glue:** đóng F03, version policy grammar/display/limits/grouping; presets THPT xác minh theo môn/năm; security/license/performance/release/rollback và owner gate. Class/Assignment thuộc giai đoạn sau.

## NEED_DECISION

Không thấy xung đột công thức điểm Shared/M1. Các fixes F01/F02/F04 là lỗi kỹ thuật có thể giao sửa ngay, không cần tự quyết lại nghiệp vụ. Các lựa chọn sau cần owner trước nghiệm thu chức năng tương ứng:

- Trust/collection: A luyện tập self-reported có nhãn giới hạn; B trusted server grading qua dịch vụ được duyệt; C local/export-only trong lúc chờ duyệt.
- Display: A phân số exact; B half-up2 chữ số kèm exact source; C precision/mode theo version. Không đổi scoring exact.
- Grammar III: A giữ sa-charset-v1; B grammar số riêng có version/migration. Không tự cấm `01`, `--1`, `,5`.
- Limits/grouping: A duyệt tạm1000 câu và nhóm I→II→III; B giới hạn/thứ tự mới có version.
- F03: A tuân thủ inverse API và tách transport bound; B owner sửa contract bound nhất quán toàn API. A là cách sửa theo contract hiện tại, không cần chờ quyết định nếu giữ nguyên contract.
- Mẫu chuẩn: A owner chọn môn/năm/văn bản để xác minh; B tiếp tục custom-only với nhãn phạm vi rõ.

recommended_action: giao glue sửa F01/F02/F04 và bổ sung regression tương ứng; domain đóng F03 theo M1. Review lại revision mới sau fixes. Giữ lesson và các fixes payload/discovery đã có. Không deploy từ báo cáo này.

tools_research: NOT_REQUESTED; không cài tool/dependency. privacy_notes: chỉ dữ liệu tổng hợp, URL example.invalid và kết quả kỹ thuật; không dữ liệu học sinh thật hoặc nội dung chỉ thị riêng.
