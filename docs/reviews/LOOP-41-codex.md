# LC41 — Kiểm định độc lập toàn sản phẩm

- review_id/task_id: LC41; reviewer: Codex; ngày: 2026-11-14.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6 (B1-AC01…08, B1-T01…17).
- base_commit = head_commit đã kiểm: `433362216897e40638d39b743b8ca15d14afee46`, branch `main`, **cộng working-tree delta index.html** tại hash cutoff bên dưới.
- risk_level: HIGH; verdict: **CHANGES_REQUESTED**. Có lỗi mới về identity/destination trong timer khôi phục; hai lỗi LC40 vẫn mở. Gate cuối **387 pass/3 fail**, không phải390 pass. Không có bằng chứng lỗi chấm điểm trong các fixture đã chạy; không đồng nghĩa toàn sản phẩm đã nghiệm thu.
- handoff: **NEED_DECISION** cho các chính sách nghiệp vụ/dịch vụ còn mở ở cuối báo cáo; sửa các lỗi kỹ thuật hiện có không cần thay công thức nghiệp vụ.
- Chỉ tạo `docs/reviews/LOOP-41-codex.md`. Không sửa code/tests/config; không install, commit, deploy, tạo branch/worktree. Giữ nguyên file đang thay đổi/untracked của các tiến trình khác.

## Revision, phạm vi và bằng chứng

Đã đọc LC40, git log/status/diff thực tế. LC40 kết thúc tại cùng HEAD4333622. Đầu phiên source chưa đổi,390 tests xanh và probes tái hiện đủ ba lỗi LC40. Trong lúc viết báo cáo, tiến trình khác sửa `index.html` (+93/-7 tại gate cuối). Đã đọc diff và chạy lại probes/gates: khôi phục backoff và direct dispatch mặc định không còn POST sớm; phát hiện timer khôi phục không pin payload, gây F01 mới. Không sửa hoặc hoàn tác delta của tiến trình đó. Domain/collector/test/package/build không đổi tại cutoff. Không dùng thông báo PASS trong commit message thay lần chạy thật.

files_reviewed: các API domain model/rational/shortAnswer/validate/judge/shuffle/examMax/scoreAttempt/serialize/index; đường web scoring, restore/snapshot/presentation order, timer/submit, archive/collector/retry/receipt, report/release, builder/bank/JSON import/export; Apps Script validation, exact fractions, formula sanitization, locking và dedupe; test domain/acceptance/VM/collector và oracle; package/tsconfig/build/README. Review theo luồng và vùng rủi ro, không tuyên bố đã chứng minh mọi dòng hoặc mọi trạng thái.

Cutoff SHA256: HTML mới được pin trong RAM khi chạy probe mới, kiểm không đổi sau probe; gate cuối cũng kiểm hash trước/sau bằng nhau. Các file còn lại khớp nguồn LC40:

| File | SHA256 |
|---|---|
| index.html | `668B2DD35A778EA8D23B2B3044DDFFD739507F60603FB35C86BCFF801D0E3E7C` |
| src/domain/rational.ts | `068B140C1D0DF59AE759B6829AE961AFA2034C2A5D1F060A26D8BDE8E4AFB886` |
| apps-script/Code.js | `EE77DAF24DFC81878E835F85C2161889A2B6D10F5C88CE32E28177C8F4EE08A2` |
| test/e2e/demoFlow.test.ts | `1C6F7813172C68B8CD5FFB8266EA38E6AECBCC7606EF064F9C6E91067046B5B4` |

## Findings

### LC41-F01 — CRITICAL — Timer retry khôi phục của A gửi payload bài B tới collector A

- **VÙNG chịu trách nhiệm: glue. VERIFIED trên working-tree cutoff mới.** Đây là lỗi mới của phần sửa backoff trong phiên; không quy kết cho HEAD gốc.
- affected_files: `index.html:2105–2118,3051,3072,3152–3159`.
- evidence: submit A (collector `/A`) với fetch failure; context mới cùng store chạy initExam, khôi phục submittedA, **0 POST/1 timer**, rồi gọi dispatcher mặc định vẫn0 POST — xác nhận nhánh lỗi cũ đã được sửa. Giữ callback timerA; mở đềB có collector `/B` rồi submitB failure. POST đầu đúng `/B`, exam `audit-B`, attempt `attempt-mwfyulli-4si6o4j4`. Gọi callback timerA, drain microtasks: POST thứ2 vẫn exam `audit-B` và cùng attemptB, nhưng **URL là `https://example.invalid/A`**. Assertions exit0, HTML pin unchanged=true.
- reproduction_steps: extract createPageContext, stub render/palette, mock fetch trả ok:false và thu timers. Submit đềA một câuIII; reload cùng store qua initExam; giữ timers[0]. Sau loadExamVersion(B) và submitB, gọi callback đã giữ rồi đếm/kiểm URL và payload. Chỉ kích hoạt một lần callback để mô phỏng timer tới hạn, không sleep/mạng ngoài; explicit retry callback hiện không kiểm deadline nên fake clock không cần thiết để kiểm identity. Không suy ra đã có dữ liệu thật bị gửi ra ngoài.
- expected: Shared §3/4 yêu cầu attempt/snapshot/destination bất biến, không gửi dữ liệu bài khác. Timer của A chỉ xử lý jobA dù người dùng chuyển sang submittedB.
- actual/impact: closure giữ aId/targetUrlA nhưng gọi `dispatchToServerCollector(null, cRetry, targetUrl)`. Null payload khiến dispatcher lấy attempt/score/raw answers từ **studentState hiện tại B**, trong khi specificUrlA được ưu tiên trước URL pin của B. Có thể gửi nickname, đáp án và kết quả tới sai dịch vụ và gắn receipt vào sai luồng. Nhánh rearm trong dispatcher ở3158 cũng giữ specificPayload=null; cần sửa cả hai entry point, không chỉ scanner archive vốn đã capture payload.
- minimal_fix: timer luôn capture immutable job identity+payload+destination hoặc tra lại final bằng keyA tại callback; không dùng active studentState để dựng payload retry đã lên lịch. Hợp nhất scheduler per job, giữ deadline/budget guards; xét hủy/restore timer theo identity khi chuyển bài.
- regression_test: submittedA failure→reload→scheduleA→switch/submitB→fire timerA: chỉ POST payloadA đến URLA, không dispatchB; lặp khi B unsubmitted/confirmed/exhausted, reload timer và dispatcher-rearm timer; late receiptA không confirmB. Kiểm bằng fake clock ở đúng deadline và dưới deadline, archive/online/direct dispatch không nhân chains.

### LC41-F02 — MAJOR — Request archive treo giữ global scan lock, ngăn discovery job mới

- **VÙNG chịu trách nhiệm: glue. VERIFIED, LC40-F02 vẫn mở.**
- affected_files: `index.html:2919–2922,2935–2951,3025–3033` (line theo HTML cutoff mới).
- evidence: store có final A/B hợp lệ, chưa confirmed, retryCount0; active attempt là draftD. Fetch A pending có resolver do reviewer điều khiển, B trả failure. Scan đầu gửi **2 POST**, xác nhận A không chặn B đã có trong cùng snapshot. Khi A chưa settle, thêm final C rồi scan lần2 → **C POST=0**. Resolve A failure, chờ scan đầu xong rồi scan lần3 → **C POST=1**. Assertions exit0.
- reproduction_steps: clone final được tạo bởi submit thành A/B với key `cunata:final:audit-A:v1:<id>`, xóa nextRetryAt/reset retry; chạy scan không await; drain100 microtasks, thêm C tương tự. Await scan lần2 và đếm C; release A rồi scan lại làm positive control. Không sleep, không mạng thật.
- expected: các job độc lập tiếp tục được phát hiện, request treo có timeout hữu hạn và không khóa scanner toàn cục.
- actual/impact: `Promise.allSettled(dispatches)` chờ A vô hạn trong khi `isSyncingArchive=true`; các lần scan tiếp return sớm. C từ tab khác/archive mới không được discovery tới khi A settle. Active submit có đường dispatch riêng, không kết luận mọi bài đang nộp đều bị chặn.
- minimal_fix: scanner chỉ discover/enqueue rồi nhả lock; scheduler per job có timeout/AbortController, concurrency giới hạn, backoff/budget. Timeout giải phóng in-flight; late receipt chỉ cập nhật đúng identity đã gửi.
- regression_test: A pending, B có sẵn vẫn gửi; thêm C sau scan, phát online/scan → C được enqueue/gửi trước khi resolve A; timeout A tạo retry hợp lệ; repeated scans không nhân chains; late A không confirm C; concurrency cap với nhiều final.

### LC41-F03 — MINOR — parseFractionString không là nghịch đảo trên toàn miền output formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED, LC40-F03 vẫn mở.**
- affected_files: `src/domain/rational.ts:119–145`.
- evidence/reproduction_steps, qua public API:
  ```js
  const s = toFractionString(rational(10n ** 200n));
  assert.equal(s.length, 201);
  assert.throws(() => parseFractionString(s), SyntaxError);
  ```
  Probe chạy thật, assertions qua, exit0.
- expected: M1 §4.1 yêu cầu parser là nghịch đảo chặt của formatter.
- actual/impact: constructor/formatter nhận BigInt201 ký tự; parser từ chối bởi bound200. Roundtrip API không đúng contract. Chưa chứng minh sai điểm đề giới hạn1000 câu; không nâng thành lỗi scoring blocker.
- minimal_fix: giữ inverse trên canonical outputs, giới hạn transport riêng. Nếu muốn bound chung toàn API, cần owner duyệt sửa contract và enforce đồng bộ constructor/formatter/parser.
- regression_test: canonical199/200/201 ký tự, số âm/zero/tử/mẫu lớn, noncanonical inputs; inverse hai chiều trên miền API được duyệt.

## checks_run

Môi trường thực: Windows/PowerShell, D:\Cunata; Node24.14.0, npm11.9.0, TypeScript local7.0.2, Python3.11.0. Transcript công cụ LC41 chứa stdout/exit; không tạo log/probe ngoài scope. Contract cũ nói tsc chưa cài đã lỗi thời: lần này tsc đã chạy thật thành công.

| Command/check | Exit | Kết quả thực |
|---|---:|---|
| `npm test`, source đầu phiên | 0 | 390 tests,59 suites; pass390/fail0, cancelled/skipped/todo0;1164.1524ms. Chỉ áp dụng HTML hash `0CF47B33…`, không phải cutoff mới. |
| `npm test`, sau concurrent delta | 1 | 390 tests,59 suites; **pass387/fail3**. Fail LC35-F04, LC38-F01, LC39-F01, actual0/expected1 POST. |
| `node --test test/**/*.test.ts`, gate cuối hash668B… | 1 | **390 tests/59 suites/pass387/fail3**,1056.5778ms; hash HTML trước/sau bằng nhau. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics. Include src/scripts/test; không kiểm kiểu mọi inline JS trong HTML. |
| `node scripts/build.js` | 0 | Chạy đầu phiên và sau delta/gate cuối;7 assets, schema đề mẫu8 câu, stylesheet link, collector syntax hợp lệ. Đây là static verification, không build bundle/render browser. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 tests/pass11/fail0;1632 fixtures,5849 maxima configs,9 negative controls; seed20261114;0.9862s toàn check. Oracle-only không phải product tests. |
| Node stdin independent differential/lifecycle probes đầu phiên | 0 | Tái hiện ba lỗi LC40;1632 fixtures domain/web: total/max và score/max cả3 phần khớp oracle; domain DTO→JSON→parse deepEqual; HTML pin unchanged=true. Scoring không đổi trong delta sau đó. |
| Node stdin lifecycle probes cutoff668B… | 0 | LC40-F01 immediate reload/default dispatch được sửa; F01 mới wrong-destination và F02 discovery lock tái hiện bằng assertions; HTML pin unchanged=true. F03 domain không đổi. |
| Probe khởi đầu chưa stub render | 1 | Harness DOM giả querySelector trả null làm `renderExamPane` lỗi addEventListener khi loadExamVersion. Sửa setup trong RAM bằng stub render/palette giống regression harness rồi chạy lại đầy đủ exit0. Không dùng lỗi harness này làm finding sản phẩm. |
| `git diff --check -- index.html src test apps-script/Code.js` | 0 | Không whitespace errors. |
| git status/log/diff/hash và đọc source UTF-8 | 0 | HEAD4333622 cộng working-tree HTML delta. Không thấy AGENTS.md ở workspace hoặc D:\. Memory registry không có hit liên quan nên không dùng kết luận từ memory. |
| Browser/Google integration/lint/security scanners | NOT_RUN | Không chạy browser thật/endpoint Google/deploy; không có lint script riêng; chưa chạy SAST, advisory scan, axe/Lighthouse. Không cài tool. |

Probes chạy qua PowerShell here-string → `node --input-type=module`, không ghi file. HTML pin trong RAM, helper VM extract trực tiếp từ test hiện tại; mock fetch và thu timer, không tự tạo network traffic. ExperimentalWarning của stripTypeScriptTypes không phải test failure. Điểm expected đọc fixtures oracle độc lập, không gọi production để tạo expected. Một probe giữa lúc source đang đổi fail vì còn mong direct dispatch POST1 nhưng bản sửa đã trả0; không dùng giả thuyết đó làm lỗi còn mở. Một command tổng hợp gate bị SyntaxError do ký tự regex qua encoding shell, chưa chạy checks; đã sửa command ASCII và chạy lại với exit từng subprocess ghi ở gate cuối.

Ba regression failures cuối nằm tại `test/e2e/demoFlow.test.ts:4185,4572,4797` (test bắt đầu4129,4467,4732). Các assertion mong POST ngay sau reload/archive trong khi backoff mới trì hoãn; chưa coi ba failures này là bằng chứng mất bài. Cần cập nhật fake clock/timers và chứng minh gửi đúng payload/destination **khi đến hạn**, giữ assertions identity và dedupe; không xóa assertions để lấy xanh. F01 là bằng chứng hành vi độc lập với vấn đề kỳ vọng thời gian của tests. Typecheck cả2 cấu hình và build đã rerun trên hash668B… bằng local Node CLI, exit0.

## Đối chiếu yêu cầu và coverage_gaps

- **B1-AC01…08/T01…17:** suite và differential có evidence cho I=1/4, II staircase/1296 vectors/null khácfalse, III exact/Unicode/charset, maxima5/15/16/threshold/repeating, validation, ID shuffle độc lập, deterministic/no mutation, snapshot và DTO. F03 là ngoại lệ inverse còn mở. Không coi tên test AC08 trong suite thay checklist bàn giao/owner acceptance của READINESS. Negative controls/discrimination không phải đã chạy mutation framework trên từng candidate.
- **Student/offline/report:** có implementation timer theo deadline, autosubmit, local save/restore, pinned snapshot/order, report đạt/tối đa từng phần và tổng, release policy, tải HTML. Chưa chạy browser thật cho refresh/back-forward, background timer, cold-offline app shell, hai tab, quota/private browsing, migration, tải rồi mở report offline. VM không chứng minh localStorage read/check/write là transaction giữa các tab. Không có screenshot/trace/visual/mobile/a11y/IME Telex/VNI evidence phiên này.
- **Collection:** Apps Script có schema/bounds/sums/locking/dedupe/formula sanitization và test mock; không ghi toàn bộ tính năng là NOT_IMPLEMENTED. F01/F02 còn mở. Chưa kiểm CORS/redirect/readback/format ô/permissions/quota/anti-abuse, cold-sheet concurrency và lost receipt mạng thật. Server hiện kiểm tính nhất quán điểm client, chưa là server grading từ answer key/snapshot tin cậy. Frontend có key; release UI/report không cung cấp secrecy cho bài kiểm tra cần bảo mật. Không nghiệm thu hệ thống thi đáng tin từ mock xanh.
- **Teacher/bank/builder:** có JSON import/export, preview/editor, publish runner, local bank và filters. Chưa nghiệm thu đầy đủ taxonomy Môn→Lớp→Chương/chủ đề→Bài→mức độ (topic/Bài đang gộp), durable builder drafts/media, stable version publication/migration, xóa/xuất/backup và sửa nguồn không đổi mọi kết quả cũ. Editor public/no-login không là access control.
- **DOCX/PDF:** NOT_IMPLEMENTED pipeline file→IR→preview/sửa→confirm→publish theo Shared §6. FileReader hiện đọc JSON không thay parser DOCX/PDF; chưa có bảo toàn đoạn/bảng/hình/OMML/math/provenance/confidence, phân biệt PDF text/scan/OCR, corpus nhiều cột/Unicode/corrupt/oversized.
- **Presets và production:** chưa có mẫu THPT được xác minh theo môn/năm/văn bản; custom-v1 không đại diện mọi mẫu chuẩn. Full-history secrets, dependency/license/advisory, browser CI artifacts, security/performance budgets, rollback/changelog và owner milestone acceptance chưa có evidence đầy đủ phiên này. Không tuyên bố APPROVED toàn sản phẩm hoặc DONE từ390 tests.

## Tính năng lộ trình còn thiếu — theo ưu tiên

1. **P0/glue:** đóng F01 routing dữ liệu sai; khôi phục gate387/3 bằng regression fake-clock đúng deadline, payload/destination và receipt identity. **P1/glue:** durable outbox/scheduler đóng F02, timeout/capped concurrency, lịch retry bền vững qua reload, discovery job mới; UX queued/sending/confirmed/failed/exhausted, xem/tải/retry kết quả; kiểm quota/migration/lost receipts.
2. **P1/glue:** browser E2E thật trên mobile/desktop, offline/refresh/background/two-tabs/report; IME/keyboard/focus/a11y/math/media; screenshots/traces, CI và owner acceptance.
3. **P1/glue:** quyết định collection/trust model; nếu phục vụ kiểm tra cần điểm đáng tin, server grading từ trusted version/key và kiểm Google CORS/write/readback/idempotency/permissions/anti-abuse thật.
4. **P1/glue:** hoàn thiện taxonomy Bài riêng, durable drafts/media, stable IDs/versioned publication, migration/xóa/xuất/backup; giữ đề/câu snapshot cũ khi sửa nguồn.
5. **P2/glue:** DOCX/PDF importer với IR, provenance/flags/preview/hiệu đính/confirm; bảo toàn bảng/hình/toán, OCR khi cần, không đoán key.
6. **P2/src/domain + glue:** đóng F03; version policy grammar/display/limits/grouping; presets THPT xác minh theo môn/năm; security/license/performance/rollback gates. Class/Assignment thuộc giai đoạn sau.

## NEED_DECISION — không tự chốt

Không phát hiện mâu thuẫn công thức điểm giữa Shared và M1. Các lựa chọn cần owner quyết, tách khỏi sửa kỹ thuật F01/F02:

- Trust/collection: A luyện tập self-reported kèm giới hạn rõ; B server grading từ trusted snapshot/key và dịch vụ đã duyệt; C local/export-only tới khi duyệt dịch vụ.
- Display: A phân số exact; B half-up2 chữ số kèm exact source; C precision/mode theo version policy. Chấm điểm luôn exact.
- GrammarIII: A giữ sa-charset-v1 chỉ charset/length; B grammar số mới có version/migration. Không tự cấm01/--1/,5.
- Limits/grouping: A duyệt tạm1000 câu và nhóm I→II→III; B định nghĩa giới hạn/grouping mới được version hóa.
- F03: A giữ inverse API và bound transport riêng; B sửa contract để bound nhất quán toàn constructor/formatter/parser.
- Presets: A owner chọn môn/năm/văn bản để xác minh; B tiếp tục custom-only với nhãn phạm vi rõ.

recommended_action: giao glue ưu tiên sửa F01 mới, F02 và regression gate3 failures; domain xử lý F03 theo contract hoặc quyết định owner. Bổ sung acceptance browser/Google/import trước nghiệm thu milestone; không deploy từ báo cáo này. Mọi delta sau hash cutoff668B… cần gate/review mới; không suy diễn PASS đầu phiên cho working tree sau đó.

tools_research: NOT_REQUESTED trong LC41; không cài công cụ. privacy_notes: chỉ dữ liệu tổng hợp, URL example.invalid và kết quả kỹ thuật; không dùng dữ liệu học sinh thật.
