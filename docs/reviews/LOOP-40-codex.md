# LC40 — Kiểm định toàn sản phẩm, vòng 40

- review_id/task_id: LC40; reviewer: Codex; ngày: 2026-11-14.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0 (đã đọc toàn bộ); đối chiếu `docs/research/codex/READINESS.md` §6, B1-AC01…08/B1-T01…17.
- base_commit: `8a13df5a84e915fae0c4c76c8b0fcda218a128b3`; head_commit cuối gate: `433362216897e40638d39b743b8ca15d14afee46`, branch main.
- risk_level: HIGH; verdict: **CHANGES_REQUESTED**. Bàn giao **NEED_DECISION** cho các chính sách chưa được owner chốt ở cuối; các lỗi kỹ thuật dưới đây có thể sửa ngay theo contract hiện tại.
- Chỉ tạo `docs/reviews/LOOP-40-codex.md`; không sửa code/tests/config, không install dependency, không commit/deploy, không tạo branch/worktree. Các thay đổi ops/workers thuộc tiến trình khác được giữ nguyên.

## Revision và phạm vi

Đã đọc LC39, log/status/diff, đối chiếu sửa đang có trong working tree rồi commit vòng31 do tiến trình khác tạo trong phiên. Diff `8a13df5..4333622`: HTML +253/-76 và test VM +429 dòng, collector/domain/dependency không đổi. LC39 được đưa vào commit4333622, nên commit chứa báo cáo không phải mốc source độc lập của lần review cũ. Không đọc prompt riêng của worker khác.

files_reviewed: domain models/validation/judges/rational/max/scoring/shuffle/serialization/public API; các đường HTML scoring, submit/restore/snapshot/timer, collector/archive/retry, report/release, bank/builder/JSON import/export; collector Apps Script, regression/domain/acceptance tests và oracle; scripts/build.js, package/tsconfig, README. Mức xác minh là source + Node/VM, không phải browser/Google/production acceptance hay bảo đảm mọi dòng không có lỗi.

Cutoff đã chạy probes, HTML pin trong RAM và kiểm hash không đổi:

| File | SHA256 |
|---|---|
| index.html | `0CF47B33B3CCE18186212EE32277BA65532DED3D043127C467D0B6189A653D3C` |
| src/domain/rational.ts | `068B140C1D0DF59AE759B6829AE961AFA2034C2A5D1F060A26D8BDE8E4AFB886` |
| apps-script/Code.js | `EE77DAF24DFC81878E835F85C2161889A2B6D10F5C88CE32E28177C8F4EE08A2` |
| test/e2e/demoFlow.test.ts, cuối gate390 tests | `1C6F7813172C68B8CD5FFB8266EA38E6AECBCC7606EF064F9C6E91067046B5B4` |

Gate đầu phiên có388 tests; worker thêm2 tests và commit vòng31, source HTML/domain/collector giữ nguyên hash. Gate cuối390 tests được chạy lại thật, không lấy PASS từ commit message.

## Findings

### LC40-F01 — MAJOR — Backoff đã lưu bị bỏ qua sau reload và tại dispatcher

- **VÙNG chịu trách nhiệm: glue. VERIFIED trong VM.** LC39-F02 được sửa guard lịch trong scanner và exhausted budget, nhưng chưa thành durable scheduler.
- affected_files: `index.html:2064–2074,2104–2108,2944–2950,2993,3090–3110,3145–3170,3193–3199`.
- evidence: nộp attempt A với fetch HTTP failure, timer chỉ được thu lại, không thực thi. Final lưu `retryCount=1`, `nextRetryAt=1794633310419`. Context mới cùng store gọi `initExam()`; lúc `Date.now()=1794633309422` đã có **1 POST ngay**, trước hạn còn khoảng997ms; timer mới delay2000ms. Không giữ lại timer của context cũ. Probe xác nhận bổ sung `studentState.submitted===true`, attemptId att-A: đây là active resume A.
- evidence bổ sung: trên context mới, khi timer2000ms đang pending, gọi `await dispatchToServerCollector()` rồi drain microtasks → **POST tăng1→2, số callbacks thu được1→2**. Dispatcher chỉ kiểm in-flight/budget, không scheduledRetryTimers hoặc persisted nextRetryAt trước fetch. Không quy số callbacks thu được thành hai timer đồng thời còn sống vì clearTimeout có thể hủy timer cũ trong browser.
- reproduction_steps: lấy `createPageContext(store)` từ test/e2e/demoFlow.test.ts; gán exam A custom-v1/v1, 1 câuIII key1, attempt att-A; mock fetch ghi URL/body và trả `{ok:false}`; mock setTimeout lưu `{fn,ms}`. Nộp A, drain100 microtasks, kiểm final count1/deadline tương lai. Tạo context mới cùng store, cấu hình mocks rồi `await initExam()`; kiểm POST trước deadline. Không sleep hoặc gửi mạng ngoài.
- expected: Shared §3 yêu cầu retry hữu hạn, backoff, trạng thái lưu/khôi phục chính xác. Refresh không biến một job chưa đến hạn thành job được gửi ngay. Dispatcher phải áp dụng cùng guard lịch/hạn ở mọi entry point.
- actual/impact: nextRetryAt chỉ được lưu/hydrate, không được dùng để quyết định trước fetch hoặc scanner POST. Reload liên tục có thể tiêu hết các lượt thử trước backoff, tăng request/quota. Không kết luận có Sheet rows trùng; collector có idempotency riêng.
- minimal_fix: một state machine per job, đọc state bền vững trước dispatch, kiểm confirmed/exhausted/in-flight/scheduled và `now < nextRetryAt`; restore đúng timer còn lại, không POST sớm. Định nghĩa retryCount nhất quán là lượt đã dùng hoặc lượt kế tiếp, không trộn hai nghĩa.
- regression_test: reload ngay sau mỗi failure trước nextRetryAt → zero early POST và chỉ1 lịch; online/scanner/direct dispatcher lặp không bỏ backoff; tới hạn đúng1 request; reload ở ranh giới retry4/5 và exhausted; test cả active resume bằng loadExamVersion và archive recovery bằng initExam, HTTP error/rejected fetch, per-job budgets độc lập.

### LC40-F02 — MAJOR — Scan pending giữ global lock, không phát hiện archive mới

- **VÙNG chịu trách nhiệm: glue. VERIFIED trong VM.** Khác LC39-F03: A/B đã nằm trong cùng snapshot scan nay được dispatch song song đúng.
- affected_files: `index.html:2903–2906,2919–2935,2992–3000,3193–3199,3283–3286`.
- evidence: store có hai final A và B chưa confirmed; fetch A được giữ pending bằng Promise có resolver do reviewer điều khiển, B trả HTTP failure ngay. Gọi scanner, drain100 microtasks → **2 POST**, xác nhận B không bị A chặn ở cùng đợt. Trong lúc A còn pending, thêm final C hợp lệ vào cùng store, gọi scanner lần nữa → **C POST=0**. Resolve A `{ok:false}`, đợi scan đầu kết thúc, scan lại → **C POST=1**. Mọi assertion qua, exit0.
- reproduction_steps: clone final hợp lệ do submit tạo thành A/B với ID/key/destination riêng, retryCount0; context active draftD. `fetch(A)` trả pending Promise, fetch khác resolve false. Khởi động scan không await; sau microtasks thêm C (ví dụ final mới từ tab khác hoặc kết quả chưa gửi trước khi chuyển đề). Gọi scan lần2, đếm C; release A rồi scan lần3 làm positive control.
- expected: recovery của các job độc lập tiếp tục phát hiện công việc mới; request treo phải có timeout hữu hạn, không khóa cả scanner.
- actual/impact: Promise.allSettled vẫn chờ A và giữ isSyncingArchive; mọi online/scan tiếp theo return sớm, nên C không được discovery cho đến khi A settle. Không khẳng định mọi active submit đều bị chặn: active submit có đường dispatch riêng. Ảnh hưởng đường archive recovery, đặc biệt nhiều tab hoặc final mới chưa có dispatcher sống.
- minimal_fix: scanner chỉ discover/enqueue rồi nhả lock; scheduler per job xử lý network với concurrency giới hạn, timeout/AbortController và budget/backoff. Timeout phải giải phóng in-flight đúng cách; late receipts giữ identity; không tạo request vô hạn ngoài state machine.
- regression_test: A pending và B có sẵn → B gửi; sau đó thêm C, phát online/scan → C được enqueue/gửi dù A chưa resolve; timeout A cập nhật retry; repeated scans không nhân chains; late A receipt không confirm C. Kiểm concurrency cap khi có nhiều finals.

### LC40-F03 — MINOR — Parser không nghịch đảo toàn miền output formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED.** LC39-F04 còn mở, module không thay đổi.
- affected_files: `src/domain/rational.ts:119–145`.
- evidence/reproduction_steps: qua public API: `const s=toFractionString(rational(10n**200n)); assert.equal(s.length,201); assert.throws(()=>parseFractionString(s),SyntaxError);` → cả2 assertions qua trong probe exit0.
- expected: M1 §4.1: parseFractionString là nghịch đảo chặt của toFractionString.
- actual/impact: constructor/formatter nhận BigInt này nhưng parser từ chối vì bound200. Roundtrip public API lỗi; chưa chứng minh sai điểm đề giới hạn1000 câu.
- minimal_fix: giữ inverse trên canonical outputs, áp limit ở transport boundary riêng; nếu muốn bound toàn API thì cần owner phê duyệt đổi contract và enforce nhất quán constructor/formatter/parser.
- regression_test: canonical199/200/201 ký tự, âm/zero/tử/mẫu lớn, dạng noncanonical; roundtrip hai chiều trong miền API đã duyệt.

## Retest LC39 và ý nghĩa tests xanh

| LC39 | LC40 |
|---|---|
| F01 destination drift của legacy có snapshotA | **FIX VERIFIED**: probe xóa riêng top-level URL và giữ snapshotA, activeB → chỉ POST A. Suite mới còn kiểm cùng examId khác collector, URL migration được persist. Không suy ra mọi legacy không có provenance đã an toàn. |
| F02 retries | **PARTIAL FIX**: suite exhaustion qua6 requests rồi reload PASS; scan cùng lifecycle khi có scheduled timer không nhân chains PASS; persisted backoff chưa được thi hành, còn F01. |
| F03 pending A chặn B có sẵn | **FIX VERIFIED**: A/B dispatch ngay cùng đợt, regression mới PASS. Discovery C phát sinh sau đợt scan còn F02. |
| F04 rational inverse | OPEN, F03 ở trên. |

Tests tên E2E là Node VM + DOM/Sheet giả lập. Không tự coi đó là browser E2E. Test online hiện có đoạn thay dispatchEvent bằng no-op rồi gọi scanner không chứng minh browser đã phát online event thật. Regression cùng đợt A/B không cover C đến sau. Scoring/domain/web được differential riêng, không chỉ dựa tên tests.

## checks_run

Môi trường Windows/PowerShell, D:\Cunata; Node24.14.0, npm11.9.0, TypeScript local7.0.2, Python3.11.0. Stdout/exit nằm trong transcript LC40; không tạo log/test ngoài scope.

| Command/check | Exit | Kết quả thực |
|---|---:|---|
| `npm test`, đầu phiên | 0 | 388 tests/59 suites, pass388/fail0, cancelled/skipped/todo0;1044.8874ms. |
| `npm test`, gate cuối4333622 | 0 | **390 tests/59 suites, pass390/fail0**, cancelled/skipped/todo0;1161.3744ms. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics; chạy đầu và gate cuối. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics; chạy đầu và gate cuối. Include src/scripts/test, không typecheck toàn inline HTML. |
| `node scripts/build.js` | 0 | 7 assets, sample8 câu, stylesheet link và collector syntax OK; HTML268918 bytes, collector30955. Đây là static verification, không bundle/render. Gate cuối in exit riêng. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 tests/pass11/fail0;1632 fixtures,5849 maxima configurations,9 negative controls; seed20261114;1.0043s toàn check. Oracle-only không thay SUT tests. |
| Node stdin differential và lifecycle probes | 0 | 1632 fixtures: domain và web khớp total/max, score/max cả3 phần; DTO→JSON→parse deepEqual domain. F01/F02/F03 được tái hiện bằng assertions, legacy snapshot destinationA PASS; HTML pin hash unchanged=true. |
| Hai probe khám phá tiếp theo | 1 mỗi probe | Giả thuyết reload tự bỏ retry thứ5 nhận POST1 thay expected0; giả thuyết legacy không provenance tự gửi sang override mới nhận POST0 thay expected1. **Không dùng hai giả thuyết này làm finding**; setup init không chứng minh activeA đã resume. Không sửa SUT để làm probes qua. |
| `git diff --check -- index.html src test apps-script/Code.js` | 0 | Không whitespace errors. |
| log/status/diff/hash/source UTF-8 | 0 | Theo dõi HEAD chuyển8a13df5→4333622; source cutoff ở trên. Không có AGENTS.md trong workspace hoặc D:\ đã kiểm. Memory registry không có hit liên quan. |
| Browser/Google/lint/security tools | NOT_RUN | Không chạy browser thật, endpoint Google, deploy, SAST/dependency advisory scanner/axe/Lighthouse; không có lint script riêng. Không cài công cụ. |

Phương pháp probes không ghi file: PowerShell here-string → `node --input-type=module`; extract nguyên helper createPageContext từ test rồi Node stripTypeScriptTypes, inject fs/vm/indexPath; fs trả HTML pin trong RAM. fetch chỉ mock; setTimeout thu callback/delay, không tự chạy; drain100 microtasks và resolve pending chủ động. Expected fractions lấy JSON oracle độc lập; so từng trường domain/web, DTO so deepEqual. ExperimentalWarning của type stripping không phải test failure.

## coverage_gaps

- Scoring bắt buộc có evidence suite và differential: I1/4, II lookup và1296 vectors, null khácfalse, III exact/Unicode, max5/15/16/threshold/repeating, ID shuffle, immutability và DTO. Hữu hạn1632 fixtures không chứng minh mọi input. F03 vi phạm inverse API vẫn mở. Chưa chạy mutation framework thực sự; negative controls không tương đương mutate từng candidate.
- Browser thật **NOT_RUN**: Chrome/Firefox/WebKit, mobile/desktop, cold-offline app-shell, refresh/back-forward/background timer, real two-tab races, quota/private mode/migrations, IME Telex/VNI/composition/cursor, keyboard/focus/screen reader/contrast, math/media overflow, download/mở report offline, screenshot/trace/performance. Không thể xác nhận localStorage check-before/after là transaction đa tab từ VM.
- Google thật **NOT_RUN**: CORS/redirect/readback, cells literal/formula formatting, permissions/quota/rate limits, cold-sheet concurrency, lost receipts mạng thật. Collector có validation/locking/dedupe, nhưng consistency điểm client không thay server grading từ snapshot/key tin cậy. Frontend chứa key; releasePolicy chỉ hạn chế UI/report, không cung cấp bí mật cho kiểm tra chống gian lận.
- Collection/retry/archive có implementation, không ghi toàn bộ là NOT_IMPLEMENTED; durable scheduler/discovery còn F01/F02. UX history/retry/exhaustion, receipt persist/quota, malformed archive/date và restore migration chưa có kiểm định đầy đủ.
- Builder/bank/JSON import/export/report có implementation. Taxonomy đầy đủ có Bài, durable builder drafts/media, versioned publication và migrations/xóa/xuất/backup chưa nghiệm thu toàn luồng; các filter không thay data lifecycle. Không coi editor public không login là authorization thực sự.
- **DOCX/PDF importer NOT_IMPLEMENTED** theo Shared §6: chưa có pipeline file→IR bảo toàn đoạn/bảng/hình/OMML/math/provenance/confidence→preview/sửa→confirm. JSON importer không thay pipeline này. Chưa có corpus multicolumn/text-layer/scan/OCR/Unicode/corrupt/oversized.
- Preset THPT theo môn/năm/văn bản đã kiểm chứng chưa triển khai; custom-v1 không đại diện mọi quy định chính thức. Full-history secret scan, dependency/license/advisory review, CI browser artifacts, security/performance budgets, rollback/changelog và owner milestone acceptance chưa có evidence phiên này.

## Tính năng lộ trình còn thiếu — ưu tiên

1. **P1/glue:** durable outbox/scheduler: F01/F02, timeout/capped concurrency, bounded backoff qua reload, job discovery, trạng thái queued/sending/confirmed/failed/exhausted và lịch sử xem/tải/retry; kiểm quota/lost receipt/migration.
2. **P1/glue:** browser E2E thật offline/refresh/background/two-tabs/report, IME/mobile/keyboard/a11y/math/media; screenshots/traces, CI và owner acceptance.
3. **P1/glue:** owner duyệt collection/trust model; nếu cần bài kiểm tra đáng tin, server grading từ key/snapshot tin cậy rồi kiểm Google CORS/write/readback/idempotency/permissions/anti-abuse thật.
4. **P1/glue:** hoàn thiện bank/builder taxonomy Môn→Lớp→Chương/chủ đề→Bài→mức độ, durable drafts/media, stable IDs/versioned publication, migrations/xóa/xuất/backup; giữ snapshots cũ khi nguồn sửa.
5. **P2/glue:** DOCX/PDF importer + IR/provenance/flags, preview/hiệu đính/confirm, OCR khi cần; giữ bảng/hình/toán, không đoán key.
6. **P2/src/domain và glue:** đóng F03 theo contract; policy grammar/display/limits/grouping đã duyệt; preset THPT verified theo môn/năm; security/license/performance/rollback gates. Class/Assignment giai đoạn sau.

## NEED_DECISION — không tự chốt

Không phát hiện xung đột công thức điểm hai contract. Các lựa chọn còn mở cần owner xác nhận, không ngăn sửa lỗi triển khai F01/F02:

- Trust/collection: A luyện tập self-reported kèm giới hạn; B server grading từ trusted snapshot/key; C local/export-only đến khi duyệt dịch vụ.
- Display: A phân số exact; B half-up2 chữ số kèm exact source; C precision/mode theo version policy. Scoring luôn giữ exact.
- GrammarIII: A giữ sa-charset-v1 charset/length; B grammar số mới versioned/migration; không tự cấm01/--1/,5.
- Limits/grouping: A duyệt tạm1000 câu và nhóm I→II→III; B quy định limits/grouping mới được version hóa.
- F03: A parser inverse toàn canonical output và transport bound riêng; B owner sửa contract để bound chung constructor/formatter/parser.
- Presets: A chọn môn/năm/văn bản xác minh; B tiếp tục custom-only, ghi rõ phạm vi.

recommended_action: giao glue sửa F01/F02 với regressions nêu trên; domain xử lý F03 đúng contract hoặc quyết định owner. Không nghiệm thu/deploy toàn sản phẩm từ390 tests xanh. Mọi delta sau cutoff cần review/gate mới. tools_research: NOT_REQUESTED. privacy_notes: chỉ dữ liệu tổng hợp và kỹ thuật; không dữ liệu học sinh thật.
