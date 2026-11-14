# LC38 — Kiểm định độc lập toàn bộ sản phẩm

review_id/task_id: LC38; reviewer: Codex; date: 2026-11-14 (Asia/Bangkok).
requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6.
base_commit/head_commit: `ae571193b382111dc95611bd9f239f57fba02015` + working-tree delta tại cutoff dưới đây.
**verdict: CHANGES_REQUESTED; risk_level: HIGH.** Trên cutoff đã kiểm chứng có **1 CRITICAL, 2 MAJOR, 1 MINOR** được tái hiện. **Bàn giao BLOCKED cho gate bản working tree đang thay đổi**: sau cutoff có delta collector lớn hơn, lần npm test gần nhất381/pass373/fail8. Xem phần cập nhật cuối báo cáo; không áp findings/gate của cutoff lên source mới mà chưa retest. Không nghiệm thu/deploy toàn sản phẩm.

## Snapshot, phạm vi và thay đổi từ LC37

- LC37 review HEAD `0708781` cùng delta chưa commit. HEAD hiện tại `ae57119` tích hợp round29. Đọc git log/diff `0708781..HEAD`, working diff và LC37; không dùng commit-message gate làm chứng cứ chạy test.
- Đầu phiên source web/collector/rational và hai VM tests trùng hash cutoff LC37. Trong phiên worker khác sửa collector canonicalizer rồi sửa web init: thêm `inFlightDispatches` và `await syncUnconfirmedFinalSubmissions()`. Đã đọc diff, chạy lại checks và probes trên bản mới. Set mới chỉ được khai báo ở cutoff, chưa bảo vệ dispatcher.
- files_reviewed: toàn bộ `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; đường chạy chính trong `index.html` từ validation/import JSON → snapshot/restore/localStorage/shuffle/input/timer → scoring/submit/history/report → collector/retry/archive; bank/builder và giới hạn taxonomy; `apps-script/Code.js`, manifest/README; scripts/build, package/lock/config và domain/acceptance/oracle/VM tests liên quan. Kiểm tra runtime tập trung scoring, data integrity và thay đổi từ review trước; không gọi đây là browser QA đầy đủ.
- Chỉ tạo báo cáo này. Không sửa code/tests, không cài package, không tạo branch/worktree, không commit/deploy hoặc gọi Google thật. Dirty/untracked ngoài báo cáo là dữ liệu đã có hoặc thay đổi của worker khác.

SHA256 cutoff (uppercase):

| File | SHA256 |
|---|---|
| `index.html` | `E63149545852DA1C35843B84F6203F323C90DAF0E5C3244F5A4C5173624C9814` |
| `apps-script/Code.js` | `EE77DAF24DFC81878E835F85C2161889A2B6D10F5C88CE32E28177C8F4EE08A2` |
| `src/domain/rational.ts` | `068B140C1D0DF59AE759B6829AE961AFA2034C2A5D1F060A26D8BDE8E4AFB886` |
| `test/e2e/demoFlow.test.ts` | `3A6607D2E62362A6AB68F1AF1D2944650420A38D62B8A969C0C3E677A35558A6` |
| `test/e2e/appsScriptCollector.test.ts` | `3C67658309DC587BBC309BEEDE799AA32EFF4B3E062AB4989588B67A78BBC8B2` |

Mọi delta sau cutoff cần review tiếp; gate không chứng nhận file được sửa sau thời điểm chạy.

## Findings mở

### LC38-F01 — CRITICAL — Retry/archive gửi bài A tới dịch vụ nhận của đề B

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** LC37-F01 còn mở.
- affected_files: `index.html:2874–2882,2900–2923,2930–2939,3066–3069,3084–3087`.
- evidence/reproduction_steps: tạo đề A và B cùng version v1, một câu III q/key1, lần lượt collector `https://owner-a.invalid/collector` và `https://owner-b.invalid/collector`. Load A, raw q1, submit; fetch ném offline và giữ callback retry. Load B chưa submit, chạy callback A, drain microtasks. Assertion xác nhận POST tới **owner-b** nhưng body vẫn chứa attempt A/exam A. Biến thể restart A rồi scan archive khi B hiện hành cũng POST bài A tới owner-b. Probe trên hash web cutoff exit0; không gửi mạng thật.
- expected: Shared §3/4: bài đã nộp giữ đúng identity, nội dung và destination thuộc cấu hình chủ sở hữu của bài đó.
- actual: immutable payload giữ body nhưng dispatcher mỗi lần đọc lại `window.CUNATA_COLLECTOR_URL`/`currentExam.collectorUrl`; archive không sử dụng destination trong snapshot của bài cũ.
- impact: có thể gửi nickname, raw và điểm tới bên nhận khác; endpoint của A không nhận retry. Không khẳng định đã xảy ra rò rỉ Google production.
- minimal_fix: lưu durable job gồm destination đã kiểm tra, exam/version/attempt, immutable payload, trạng thái/budget. Retry và archive dùng destination đã pin khi submit; pin cả window override nếu nó là cấu hình được chọn lúc submit.
- regression_test: A fail → load B → retry A vẫn chỉ tới A; fresh reload/scan B vẫn gửi archive A tới A; đổi override sau submit không đổi đích A; receipt A không xác nhận B; B submit riêng tới B.

### LC38-F02 — MAJOR — Scan archive hồi sinh ngân sách retry đã cạn

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** LC37-F03 còn mở.
- affected_files: `index.html:2868–2871,2923,2999,3062–3069,3080–3087,3094–3101`.
- evidence/reproduction_steps: submit A offline → restart giữ final archive → clear các callback cũ trong harness để cô lập scan → `await syncUnconfirmedFinalSubmissions()` → chạy 5 callback mới, drain microtasks sau mỗi callback. Đếm được **6 POST và 0 timer còn lại**. Scan lại → **POST thứ7 và timer1000ms**. Assertions exit0 trên hash cutoff.
- expected: Shared §3: retry tự động có budget/backoff nhất quán cho cùng job qua các lần scan/online/reload.
- actual: archive luôn gọi `dispatchToServerCollector(payload, 0)`; số0 bỏ qua counter Map hiện có. `isSyncingArchive` chỉ giữ trong lần scan đang await, không bảo vệ timer đã lên lịch. `inFlightDispatches` mới chỉ khai báo, chưa sử dụng tại cutoff.
- impact: scan/online lặp lại bỏ qua exhaustion/backoff, có thể tăng request và quota; chưa có bằng chứng tạo nhiều Sheet rows vì collector vẫn dedupe.
- minimal_fix: một state machine per-job với in-flight/scheduled flag, retry count và nextRetryAt dùng chung, lưu bền vững. Scan chỉ resume job đủ điều kiện, không reset count. Nếu cần manual retry sau exhaustion, thể hiện thao tác riêng theo policy được duyệt.
- regression_test: sau6 requests nhiều scan/online không tự POST thêm; nhiều scan khi request pending/backoff không tạo nhiều chains; reload giữ budget/nextRetryAt; A/B có budget độc lập; lost receipt không tạo row trùng.

### LC38-F03 — MAJOR — Khởi tạo đề bị chặn bởi request gửi archive chưa trả về

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** Regression trong working-tree delta mới của LC38.
- affected_files: `index.html:1742–1746,1749–1765,2923,3002–3006`.
- evidence/reproduction_steps: lưu final A chưa confirmed, restart và mở B; tạo context mới chia sẻ localStorage, snapshot B đã có nên không cần fetch sample. Collector fetch trả Promise pending do harness điều khiển. Gọi `initExam()` và drain40 microtasks: có1 collector request, init chưa resolve, **renderExamPane=0, startTimer=0**. Resolve request với `{ok:false}`, await init → **renderExamPane=1, startTimer=1**. Probe exit0. Không phải assert dựa vào tốc độ mạng hay sleep.
- expected: khôi phục và hiển thị bài hiện tại, hẹn giờ/autosubmit hoạt động độc lập việc gửi lại bài cũ; Shared §3 yêu cầu local/offline restore.
- actual: init await toàn bộ scan; scan await fetch không có application timeout, phía sau mới tạo presentation/render/startTimer. Một archive request chậm treo boot của bài khác tới khi network tự kết thúc.
- impact: học sinh có thể không thấy đề, bộ đếm/autosubmit chưa chạy trong khi dịch vụ thu bài cũ chậm. Deadline lưu sẵn có thể vẫn trôi; không tuyên bố deadline được kéo dài vĩnh viễn.
- minimal_fix: tách outbox khỏi critical path khởi tạo. Hoàn tất restore/render/timer trước, enqueue sync nền có error isolation và timeout/backoff per-job. Tránh dùng await ở boot để thay thế kiểm soát concurrent dispatch.
- regression_test: pending collector archive không chặn render hoặc startTimer của B; deadline quá hạn vẫn autosubmit; request fail/timeout hoặc success chỉ cập nhật job A; B vẫn nhập và lưu local được.

### LC38-F04 — MINOR — Parser phân số public không nghịch đảo toàn bộ output formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED.** LC37-F04 còn mở, source không đổi.
- affected_files: `src/domain/rational.ts:119–145`.
- evidence/reproduction_steps: import public API; `s=toFractionString(rational(10n**200n))` có201 ký tự canonical; `parseFractionString(s)` ném SyntaxError vì giới hạn200. Assert length201 và assert.throws đều qua, probe exit0.
- expected: M1 §4.1: parser là nghịch đảo chặt formatter. actual: constructor/formatter nhận giá trị parser từ chối.
- impact: round-trip public API hỏng với BigInt lớn; chưa thấy tác động điểm đề tối đa1000 câu.
- minimal_fix: inverse toàn canonical output hoặc owner duyệt bound chung, enforce/document đồng nhất constructor/formatter/parser; giữ giới hạn resource transport ở boundary riêng.
- regression_test:199/200/201 ký tự, tử/mẫu lớn, số âm/zero và malformed/noncanonical; nếu chọn bound chung kiểm cả hai chiều theo policy được duyệt.

## Retest LC37 và thay đổi đồng thời

| Mục LC37 | Kết quả LC38 |
|---|---|
| F01 destination drift | OPEN → LC38-F01; retry và archive đều tái hiện trên web cutoff. |
| F02 raw canonical collision | **FIX VERIFIED trong VM** trên collector cutoff. POST raw `{q:'1'}` rồi `{q:'1 '}` → PAYLOAD_CONFLICT; `'-0'`/`'0'`, `'null'`/`''`, `'1,5'`/`'1,50'`, string `'1'`/number1, string `'null'`/null đều conflict. Mỗi cặp fresh Sheet/context, giữ envelope/score giống nhau, chỉ1 data row. Đảo key q/r vẫn ALREADY_RECORDED. Chưa nghiệm thu Google literal cells thật. |
| F03 archive budget | OPEN → LC38-F02; không báo lại starvation B kế thừa counter A đã đóng. |
| F04 rational inverse | OPEN → LC38-F04. |
| Snapshot/archive chính | Regression suite vẫn PASS; archive dispatcher đã tồn tại, không ghi NOT_IMPLEMENTED toàn bộ. Boot await mới gây LC38-F03. |

Canonicalizer mới parse JSON ở boundary top-level object/array, walk giữ nguyên string leaves và quote bằng JSON.stringify. Không còn trim/parse từng leaf gây collision đã báo. Các probe current chạy `doPost` đầy đủ với Sheet mock, không chỉ gọi canonicalizer. Không tự tuyên bố mọi malformed/legacy raw transport đã được bao phủ.

## checks_run

Môi trường: Windows/PowerShell, cwd `D:\Cunata`; Node24.14.0/npm11.9.0, TypeScript local7.0.2, Python3.11.0. Evidence stdout/exit trong transcript LC38; không tạo log/test ngoài scope. Probe counts không cộng vào npm test count.

| Command/check | Exit | Kết quả thực và giới hạn |
|---|---:|---|
| `npm test` đầu phiên |0|381 tests/59 suites; pass381/fail0, cancelled/skipped/todo0;858.2684ms. |
| `npm test` sau collector/web delta, capture output RAM |0|381 tests/59 suites; pass381/fail0, cancelled/skipped/todo0;918.0796ms. |
| `npx --no-install tsc -p tsconfig.json` |0|Đầu và cuối phiên, không diagnostics. Tsc hiện đã có; không dùng NOT_RUN từ mô tả môi trường cũ của M1. |
| `npx --no-install tsc -p tsconfig.web.json` |0|Đầu và cuối, không diagnostics; không đồng nghĩa typecheck mọi inline JS. |
| `node scripts/build.js` |0|Đầu và cuối;7 assets, sample8 câu hợp lệ, CSS link, collector syntax. Cuối web257649 bytes/collector30955. Đây là static verifier, không compile/render/deploy browser. |
| `python -B test/oracle/oracle.py --check` |0|11 tests/pass11/fail0;1632 cases,5849 maxima configurations,9 negative controls, seed20261114;0.9909s toàn check. Oracle độc lập, không tự là SUT verification. |
| Node stdin differential domain/web + DTO |0|1632 fixtures: total/max và score/max từng phần của cả hai scorers bằng oracle; DTO→JSON→parse deepEqual ScoreResult. Rational201 reject xác nhận. |
| Node stdin collector current |0|6 raw/type conflict pairs qua doPost, each fresh Sheet/context; reordered keys duplicate. Giả lập Lock/Sheet/ContentService, không Google thật. |
| Node stdin lifecycle current, pin HTML trong RAM |0|Xác nhận F01 retry/archive, F02 POST7/backoff1000, F03 pending boot + release control. SHA256 in từ chính HTML helper đã chạy trùng cutoff. |
| Probe đầu phiên, dự kiến canonicalizer cũ |1|F01 retry/archive và budget đã tái hiện trước khi assert raw collision thất bại: worker vừa sửa collector nên raw khác không còn collision. Dừng trước differential. Đây là expectation stale của probe, không ghi thành product failure; đã đọc diff và retest current như các dòng trên. |
| `git diff --check -- src test index.html apps-script/Code.js` |0|Không whitespace errors; warning LF/CRLF không là failure. |
| status/log/rev-parse/diff/hash; đọc contracts/source/tests |0 ở các lệnh hợp lệ|Không có AGENTS.md tìm được; memory registry không có hit liên quan. Thử đọc `web/package.json` báo path không tồn tại: sản phẩm là root static HTML, sau đó dùng script build thật. Không coi lỗi lookup là build failure. |

## coverage_gaps

- Scoring I/II/III, bỏ trống khácfalse, exact strings/Unicode, max5/15/16/repeating/threshold, II1296 tổ hợp, validation/shuffle/DTO/seeded properties đã có suite/oracle/differential thật. Corpus hữu hạn không chứng minh mọi input; F04 còn mở. Negative/discrimination tests không có nghĩa đã áp từng mutation vào code SUT.
- Browser thật **NOT_RUN**: Chrome/Firefox/WebKit, desktop/mobile, cold-offline navigation/app shell cache, refresh/back-forward/background timer, hai tab đồng thời thật, localStorage quota/private mode/migrations, Telex/VNI/composition/cursor, keyboard/focus/screen reader/contrast/axe, math/media overflow, download/mở report offline, screenshots/traces/performance. VM dùng DOM/localStorage/timers giả lập; không thay các kiểm tra này. Check-before/after setItem không chứng minh transaction nhiều tab.
- Google thật **NOT_RUN**: CORS/redirect/readback, literal cell formatting, permissions/quota/anti-abuse, cold-sheet concurrency, lost receipt qua mạng thật. Không deploy/call endpoint thật. Collector kiểm consistency của điểm client, không tự chấm từ key tin cậy. Answer keys ở frontend nên release policy chỉ là hạn chế hiển thị; không nghiệm thu kỳ thi yêu cầu giấu key/điểm đáng tin.
- Retry/archive đã có nhưng chưa durable outbox đủ destination/budget/scheduled state; malformed/legacy archive, failure khi persist receipt và UX xem/tải/retry lịch sử chưa nghiệm thu. Snapshot refresh/reimport regressions qua suite; caller aliasing, publication/migration workflow chưa chứng minh đầy đủ.
- Bank/builder/JSON import/report có implementation và VM tests. Taxonomy đủ môn→lớp→chương/chủ đề→bài→mức độ với stable IDs, durable drafts/media/versioning, export/xóa/backup chưa nghiệm thu; các filter string không thay toàn bộ data lifecycle.
- **DOCX/PDF importer NOT_IMPLEMENTED** theo pipeline Shared §6: chưa có file→IR rich text/table/image/math/provenance/confidence→preview/sửa→confirm. JSON import không thay Word/PDF. Chưa có corpus text/scan/OCR/multicolumn/OMML/corrupt/oversized.
- Mẫu chuẩn THPT theo môn/năm/văn bản kiểm chứng chưa triển khai; chỉ custom-v1. Full Git-history secret scan, dependency advisory/license/SAST, load budgets, CI browser artifacts, owner acceptance/rollback/changelog toàn milestone **NOT_RUN**. Lint riêng không setup. Không nghiên cứu/cài upstream ngoài task.

## Tính năng lộ trình còn thiếu — theo ưu tiên

1. **P0/glue:** F01 pin destination đúng submission; retest retry/archive/override/receipt. Chưa nghiệm thu collection khi còn nguy cơ gửi nhầm nơi.
2. **P1/glue:** F02 durable outbox per-job, bounded retry/backoff/in-flight/scheduled/exhausted qua scan/online/reload, trạng thái local_saved/queued/sending/server_confirmed/failed trung thực; UX archive xem/tải/retry; quota/lost-receipt tests.
3. **P1/glue:** F03 khôi phục/render/timer độc lập archive network; browser E2E offline/background/two-tabs/report và IME/a11y/mobile/math/media; CI artifacts và owner acceptance.
4. **P1/glue:** owner duyệt trust/service/collection mode. Nếu cần kiểm tra đáng tin phải server grading từ snapshot/key do owner kiểm soát; sau duyệt test Google CORS/write-readback/idempotency/concurrency/permissions thật.
5. **P1/glue:** hoàn thiện bank/builder taxonomy gồm Bài, stable IDs, drafts/publication/question-exam versions, immutable snapshots, migrations/export/xóa/backup.
6. **P2/glue:** importer DOCX/PDF + IR bảo toàn rich text/bảng/hình/toán và nguồn/confidence/flags, preview/hiệu đính/confirm, OCR khi cần; không đoán key thiếu.
7. **P2/src/domain + glue:** F04 inverse/limits nhất quán; owner duyệt grammar/display/limits/grouping; preset THPT theo môn/năm/văn bản xác minh tách custom; security/license/performance/rollback. Class/Assignment thuộc giai đoạn sau.

## NEED_DECISION — các chính sách cần owner, không tự chốt

Không thấy xung đột công thức chấm giữa hai hợp đồng. F01–F03 là lỗi kỹ thuật sửa được không cần chờ chọn policy mới. Các quyết định sau không được dùng để tự approve phần chưa hoàn thiện:

- Trust/collection: A luyện tập self-reported có nhãn giới hạn; B server grading từ snapshot/key tin cậy; C local/export-only tới khi duyệt service.
- Hiển thị điểm: A phân số exact là chính; B half-up2 chữ số kèm exact source; C precision/mode theo policy version. Không làm tròn trong scoring.
- Grammar III: A giữ charset/length-only sa-charset-v1; B grammar số version mới kèm migration. Không tự cấm01/--1/,5.
- Limits/grouping: A duyệt tạm1000 câu và nhóm I→II→III; B cấu hình version khác được owner xác nhận.
- Rational F04: A inverse toàn canonical output; B bound chung ở constructor/formatter/parser, tách transport limit.
- Mẫu chuẩn: A chọn môn/năm/văn bản để kiểm chứng preset; B tiếp tục custom-only và ghi rõ chưa hỗ trợ mẫu chuẩn.

recommended_action: giao worker đúng VÙNG sửa F01–F04, kiểm định lại source hash cố định; chưa nghiệm thu/deploy toàn sản phẩm. tools_research: NOT_REQUESTED. privacy_notes: chỉ dữ liệu giả lập và kết quả kỹ thuật; không có dữ liệu học sinh thật hoặc nội dung chỉ thị riêng.

## Cập nhật sau cutoff — working tree tiếp tục thay đổi, gate chưa đạt

Trong lúc ghi báo cáo worker tiếp tục thay `index.html`: pin collector URL trong state/payload, thêm đối số destination cho retry, guard dispatch và await archive trước active dispatch; diff tăng từ7 dòng lên hơn150 dòng. Không ghi đè thay đổi của worker hoặc đóng lỗi chỉ từ comment. F01 ở phần trên là bằng chứng của cutoff E631..., **không khẳng định cùng counterexample còn xảy ra trên bản mới đã pin URL**. F02/F03 cần chạy lại trên implementation mới; static diff vẫn có archive count0 và boot await, nhưng không nâng static evidence thành runtime retest mới.

Các checks bổ sung thật:

| Check | Exit | Kết quả |
|---|---:|---|
| `npm test` sau delta lớn, tail RAM |1|Có failure ở demoFlow:4160, actual0/expected1; tail không giữ tổng count. |
| `npm test` lặp lại, lọc summary/failures trong RAM |1|**381 tests,59 suites,pass373/fail8**, cancelled/skipped/todo0,780.4532ms. Web hash sau command `85BF4E5A7D498D5F5929F2A8EAB2D8FED13B03FD33C10927C50AC495C5A40E83`; test demoFlow hash vẫn3A6607... |
| `npx --no-install tsc -p tsconfig.json` sau delta |0|Không diagnostics. |
| `node scripts/build.js` sau delta |0|Web261067 bytes; collector30955; static verifier không bắt lỗi dispatch runtime. |
| Node stdin lifecycle mới |1|Pin HTML hash85BF..., assert POST đầu tiên1 nhưng actual0 dù drain100 microtasks; dừng trước các assertion destination/budget/boot/legacy. **Không gọi các case chưa chạy là PASS.** |
| Node stdin diagnostic sau một macrotask |0|Submit completed/local state nhưng0fetch; gọi trực tiếp `await dispatchToServerCollector()` bắt **TypeError: inFlightDispatches.add is not a function** tại inline script:2642. Đây là lỗi source chuyển tiếp worker đang sửa, không quy toàn bộ8 failures thành lỗi thiếu await của test. |

Tám test fail: Collector dispatch/receipt; LC29-F04 mismatched receipt; LC29-F05 retry reload/submit; LC31-F04 backoff; LC33-F03 retryA/restart; LC34-F04 immutable payload retry; LC35-F03 independent budgets; LC35-F04 archive init/online. Test đầu actual URLnull thay expected mock collector; test cuối actual0/expected1.

**LC38-F05 — CRITICAL / glue / VERIFIED trên snapshot chuyển tiếp:** collector dispatcher gọi `.add` trên Map nên mọi request đi qua guard có thể reject trước fetch và bị caller `.catch` nuốt. affected_files: `index.html:1687,3017–3020` ở bản chuyển tiếp (line có thể đổi theo delta). expected: submitted attempt gửi được và retry đúng; actual: submitted/local nhưng không POST, direct call ném TypeError như trên. minimal_fix: thống nhất cấu trúc guard và lifecycle của nó (Set add/delete hoặc Map set/get/delete cùng promise), giữ lỗi observable. regression_test: submit với endpoint hợp lệ thực sự gọi fetch và xác nhận receipt; fail rồi retry; concurrent callers cùng job không tạo nhiều request; guard được giải phóng cả success/error. Không sửa tests chỉ để bỏ assertion fetch.

Lệnh đọc sau diagnostic cho thấy worker đã đổi guard sang `Map` + `.set(...,dispatchPromise)`/`.get`, bỏ `.add`; **LC38-F05 FIX PENDING RETEST**, không khẳng định lỗi .add còn trên bản mới nhất. Đây là lý do cần source ổn định trước gate kết thúc; không chạy vòng vô hạn theo file đang được ghi từng bước. Phần late delta chưa có full runtime regression/differential và cả hai typecheck đồng thời gắn cùng hash mới; ghi **NOT_FULLY_REVIEWED**, không APPROVED. Collector canonicalizer và rational hashes vẫn như cutoff ở lần xác nhận sau ghi báo cáo.

Yêu cầu bàn giao tiếp: worker hoàn tất delta, cung cấp hash cố định; chạy lại npm test, hai typecheck/build và lifecycle destination/budget/boot/legacy/probe guard trên cùng hash. Giữ các policy NEED_DECISION ở trên; không cần owner quyết định để sửa lỗi runtime này.
