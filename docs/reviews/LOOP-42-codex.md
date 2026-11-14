# LC42 — Kiểm định độc lập toàn sản phẩm

- review_id/task_id: LC42; reviewer: Codex; ngày: 2026-11-14; risk_level: HIGH.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6, B1-AC01…08/T01…17.
- base review: LOOP-41, commit `433362216897e40638d39b743b8ca15d14afee46` cộng delta HTML hash668B… được LC41 ghi nhận.
- head_commit/cutoff: `329e4be0b35a99895f6d64d85761bd2598de11cb`, branch main. HEAD chuyển từ4333622 sang329e4be trong phiên do tiến trình tích hợp khác. Reviewer không commit.
- verdict: **CHANGES_REQUESTED**. Handoff **NEED_DECISION** cho các chính sách còn mở bên dưới; không tự quyết chính sách nghiệp vụ. Hai lỗi glue còn được chứng minh và một lỗi domain còn mở. Không phát hiện sai tổng/điểm phần trên1632 fixtures độc lập.
- Scope ghi: chỉ `docs/reviews/LOOP-42-codex.md`; không sửa code/test/config, không install/dependency, branch/worktree, commit hoặc deploy. Các thay đổi khác thuộc tiến trình khác được giữ nguyên.

## Revision và phạm vi kiểm tra

Đã đọc contracts đầy đủ, review trước, git log/status/diff thực tế. Delta từ4333622: HTML sửa backoff/capture payload, giải phóng archive discovery lock và đồng bộ retry metadata sang draft; tests bổ sung369 dòng, gồm regression LC39-F02/LC41-F01/LC41-F02. Không có delta domain/collector/dependency trong đợt này. Đã đọc các assertions mới; không dùng PASS trong commit message thay chạy thật.

files_reviewed: domain model/rational/shortAnswer/validate/judge/shuffle/examMax/scoreAttempt/serialize/index và tests; web validation/scoring, restore/pinned snapshot/order, timer/submit, final/archive/retry/receipt, report/release/download, builder/bank/JSON import/export; Apps Script schema/exact fractions/formula sanitization/locking/dedupe; package/tsconfig/build/README và oracle. Review theo data flow và rủi ro; không tuyên bố chứng minh toàn bộ trạng thái hoặc mọi dòng.

Source/hash cutoff dưới đây ổn định trước/sau gate cuối trên toàn bộ src/*.ts, test/*.ts, HTML và collector. HTML cũng được pin trong RAM và so sánh sau independent lifecycle/differential probe.

| File | SHA256 |
|---|---|
| index.html | `B1E1E7EB4D00E5E27819481E610D51A39D762EF116231A0052CFC00D0D119346` |
| test/e2e/demoFlow.test.ts | `3DCD1B1AF7AD54A7A4F29B6DF335F555EB5C2734ECDDDD3FE210B298D6BD32B7` |
| src/domain/rational.ts | `068B140C1D0DF59AE759B6829AE961AFA2034C2A5D1F060A26D8BDE8E4AFB886` |
| apps-script/Code.js | `EE77DAF24DFC81878E835F85C2161889A2B6D10F5C88CE32E28177C8F4EE08A2` |

## Findings

### LC42-F01 — MAJOR — Request collector treo không có timeout, giữ job ở in-flight vô hạn

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** Phần global discovery lock của LC41-F02 đã sửa; đây là phần timeout/job recovery vẫn thiếu, không tiếp tục quy lỗi C bị chặn.
- affected_files: `index.html:2945–2947,3091–3094,3253–3262,3336–3340`.
- evidence/reproduction_steps: qua VM helper hiện có, tạo final A/B từ bài một câuIII được submit thật trong harness; active là draftD. Mock fetchA là Promise pending có resolver do reviewer giữ, fetchB trả failure. Scan1 tạo2 POST. Thêm finalC rồi scan2: C được POST, chứng minh discovery đã sửa. Khi A còn pending, lặp scan5 lần: POSTA vẫn1, `inFlightDispatches.has('A')=true`, `scheduledRetryTimers.has('A')=false`; timers chỉ thuộc failures B/C, không có timeout A. Sau resolveA `{ok:false}`, scan1 kết thúc và A mới có retry timer. Assertions exit0; không sleep hoặc mạng thật.
- expected: Shared §3 yêu cầu retry có giới hạn/backoff và trạng thái đồng bộ đúng; mỗi request cần đường kết thúc hữu hạn để job được retry khi dịch vụ/network không settle. Job khác vẫn tiếp tục discovery.
- actual/impact: `await fetch` và `await resp.json()` không được deadline/abort; in-flight chỉ được xóa ở finally sau settlement. Request/response body treo giữ job hiện tại ở sending, scan/online/direct dispatch tiếp bị in-flight guard bỏ qua, không có retry trong context đó cho tới settlement/reload. Không kết luận mọi browser fetch luôn treo vĩnh viễn hay mọi job đều bị chặn; đây là thiếu deadline do ứng dụng kiểm soát, đã chứng minh với pending transport.
- minimal_fix: timeout hữu hạn bao cả fetch và đọc receipt; AbortController khi hỗ trợ, cleanup per-job in-flight, ghi failure/retry metadata bền vững, không nhân chain. Late completion của request đã timeout phải kiểm identity/generation và không ghi đè trạng thái mới. Giữ discovery lock ngắn như bản hiện tại.
- regression_test: fake transport A pending và A headers-ok/body-pending; advance fake clock tới deadline → A rời in-flight và được retry đúng lịch/budget. B/C vẫn dispatch, repeated scan không nhân timer; late receiptA không confirmB hoặc làm thoái lui job đã chốt.

### LC42-F02 — MINOR — Reload làm mất retry thứ5 đang chờ, dù chưa exhausted

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** Lỗi nhất quán durable state, không cần chọn lại số retry nghiệp vụ để sửa.
- affected_files: `index.html:2063–2073,2105–2108,2949–2951,3102–3114,3172–3187,3209–3213`.
- evidence/reproduction_steps: fake clock `Date.now=100000`, mock POST failure; submit bài một câuIII. Chạy4 timer retries, mỗi lần advance clock đúng `studentState.nextRetryAt`. Sau tổng5 POST, state/durable final có `retryCount=5`, `retryExhausted!==true`, còn timer retry5 chưa chạy. Clone store sang page mới, đặt clock tại deadline rồi initExam: **0 POST,0 timer, studentState.retryExhausted=true**. Positive control trên page gốc: chạy timer5 ở đúng deadline → **POST thứ6**. Probe assertions exit0, không sửa file. Đây không phải suy luận từ tên test.
- expected: cùng durable job chưa exhausted và cùng deadline phải có cùng lượt retry còn lại khi reload; số lượt không phụ thuộc việc giữ tab mở. Không reset budget đã dùng.
- actual/impact: scheduler ghi số lần retry sắp thực thi (`currentRetry+1`) trước khi gửi; restore/scanner lại coi `retryCount >=5` là đã exhausted. Vì vậy lần cuối có thể gửi nếu giữ tab nhưng bị bỏ khi reload; nếu máy chủ chỉ phục hồi ở lần cuối, bài không được tự gửi lại. Dữ liệu local vẫn còn, nên không nâng thành mất bài/blocker.
- minimal_fix: thống nhất semantics completed attempts/next retry ordinal trong persistence; phân biệt pending-at-limit với exhausted sau failure cuối. Restore đúng timer/deadline còn lại, giữ guard chống reset/nhân chain. Áp dụng đồng bộ active restore, archive và dispatcher; không chỉ đổi một dấu so sánh.
- regression_test: failure0…4 → reload trước/tại/sau deadline retry5, kiểm đúng một POST5 cùng payload/URL, không sớm; failure5 mới exhausted và reload không gửi thêm. Lặp cho archived job và page vẫn mở; so sánh budgets/timestamps hai đường.

### LC42-F03 — MINOR — parseFractionString chưa là nghịch đảo trên toàn output formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED; LC41-F03 còn mở.**
- affected_files: `src/domain/rational.ts:119–145`.
- evidence/reproduction_steps qua public API, đã chạy exit0:
  ```js
  const s = toFractionString(rational(10n ** 200n));
  assert.equal(s.length, 201);
  assert.throws(() => parseFractionString(s), SyntaxError);
  ```
- expected: M1 §4.1 yêu cầu parser là nghịch đảo chặt của formatter; canonical output hợp lệ phải roundtrip.
- actual/impact: constructor/formatter không cùng bound200 của parser. API roundtrip sai contract; chưa có bằng chứng sai điểm đề <=1000 câu. Existing test cố ý assert reject >200 không làm hợp thức hóa khác biệt contract.
- minimal_fix: giữ inverse cho canonical outputs, đặt transport bounds ở boundary riêng. Nếu muốn bound chung, cần owner sửa contract và enforce đồng bộ toàn API.
- regression_test: canonical199/200/201 ký tự, tử/mẫu lớn, âm/zero, noncanonical syntax; inverse hai chiều trên miền được duyệt.

## Kiểm tra lại findings trước

- **LC41-F01 CLOSED trên cutoff**: independent probe submitA failure → reload/scheduleA → load/submitB → callback timerA, assertions xác nhận payload.attempt_idA/examA và URLA; không còn lấy payloadB. Regression mới tại `test/e2e/demoFlow.test.ts:5098` đã chạy xanh. Probe identity gọi callback trực tiếp; probe deadline riêng ở F02 dùng fake clock tại đúng hạn.
- **LC41-F02 global discovery CLOSED**: C được phát hiện/gửi khi A vẫn pending. Regression mới tại `test/e2e/demoFlow.test.ts:5185` và independent probe cùng xác nhận. Thiếu timeout được tách thành F01, không báo lại lỗi global lock cũ như chưa sửa.
- Gate3 failures của LC41 không còn: final393/393 pass. Các tests cũ được cập nhật phần chờ backoff; không lấy kết quả xanh làm bằng chứng cho budget boundary F02 chưa có regression.
- LC41-F03 vẫn mở, định danh hiện tại F03.

## checks_run

Environment: D:\Cunata, Windows/PowerShell; Node24.14.0, npm11.9.0, TypeScript local7.0.2, Python3.11.0. Contract M1 ghi tsc chưa cài đã lỗi thời; phiên này có tsc và đã chạy thật. Evidence stdout/exit trong transcript LC42; không tạo log/test/probe ngoài scope.

| Command/check | Exit | Kết quả thật |
|---|---:|---|
| `npm test` đầu phiên | 0 | 391 tests/59 suites, pass391/fail0, cancelled/skipped/todo0;1236.89ms. Chưa có hai regression LC41 được thêm sau đó. |
| `npm test` gate cuối (npm.cmd trên Windows) | 0 | **393 tests/59 suites/pass393/fail0**, cancelled/skipped/todo0;1340.0685ms. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics, chạy cả đầu phiên và gate cuối. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics. Không kiểm mọi inline JS trong HTML. |
| `node scripts/build.js` | 0 | 7 assets, schema đề mẫu8 câu, link stylesheet và syntax Apps Script hợp lệ; HTML272343 bytes. Đây là static asset verification, không bundle/browser render. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 tests/pass11/fail0/skip0,1632 fixtures,5849 maxima configs,9 negative controls;seed20261114;1.0512s toàn check. Đây là oracle-only, không thay SUT differential. |
| Node stdin independent lifecycle + scoring/DTO probes | 0 | A→A identity corrected; archiveC discovery corrected; pendingA/no-timeout tái hiện; fraction inverse tái hiện.1632 fixtures: domain và web total/max, score/max cả3 phần khớp expected oracle; domain DTO→JSON→parse deepEqual. HTML unchanged=true. |
| Node stdin fake-clock budget probe | 0 | Pending retry5: page mở POST6; page reload POST0/timer0/exhausted; assertions PASS. |
| `git diff --check -- index.html src test apps-script/Code.js` | 0 | Không whitespace errors. |
| hash trước/sau final gate | 0 | Source và test không đổi trong các checks cuối; hashes ở trên. |
| git log/status/diff và đọc source | 0 | Xác định HEAD integration329e4be; không thấy AGENTS.md trong workspace hoặc D:\. Memory registry không có hit liên quan, không dùng kết luận từ memory. |
| Browser, live Google integration, lint, security/a11y/performance scanners | NOT_RUN | Không chạy browser thật, endpoint Google, deploy, SAST/advisory/full-history secret scan, axe/Lighthouse; không có lint script riêng. Không cài công cụ. |

Probes chạy PowerShell here-string → `node --input-type=module`, extract helper VM trực tiếp từ test bằng stripTypeScriptTypes; mock fetch, timers và storage trong RAM, chỉ dữ liệu tổng hợp/URL example.invalid. ExperimentalWarning của type stripping không phải failure. Không gửi request thật. Expected fixture do oracle độc lập, không gọi production để dựng expected.

Một wrapper Python metadata kết thúc exit1 vì key đường dẫn slash/backslash sau khi cả bốn checks đã exit0 (393 tests/1330.2241ms). Đã sửa wrapper trong RAM và chạy lại trọn gate, exit0, source_unchanged=true; số final ở bảng lấy từ lần sau. Không giấu lỗi wrapper hoặc gắn lỗi đó thành bug sản phẩm. Có chạy lặp vì source/tests đang được worker khác cập nhật; final hash giới hạn chính xác verdict.

## coverage_gaps và đối chiếu toàn sản phẩm

- **B1-AC01…07/T01…15:** exact rational, I=1/4, II staircase/null≠false/1296 vectors, III exact charset/Unicode, maxima5/15/16/threshold/repeating, validation/IDs, permutation độc lập, deterministic/no mutation/snapshot, DTO có bằng chứng suite +1632 differential. F03 là ngoại lệ inverse. T16 policy display chưa duyệt, T17 suite có negative discrimination nhưng chưa chạy mutation framework trên từng bản mutant. AC08 owner acceptance/changelog/rollback không suy ra từ tests.
- **Student/offline/report:** đã có deadline timer/autosubmit, local restore, snapshot/presentationOrder, đạt/tối đa từng phần/tổng, release UI/report và HTML download. VM không chứng minh refresh/back-forward/cold-offline shell/background timer/two-tabs transaction trong browser thật. Chưa kiểm quota/private browsing/migration/download mở offline, screenshots/traces, mobile/desktop, Telex/VNI OS IME, keyboard/focus/screen reader, math/media rendering/performance. Không coi test tên E2E sử dụng VM là browser E2E.
- **Collection:** có collector schema/bounds/sums/locking/dedupe/formula sanitization và mock tests. F01/F02 còn mở. Chưa test Google CORS/redirect/receipt/readback/format ô/permissions/quota/concurrency/lost receipt thật. Collector hiện kiểm tính nhất quán điểm client; chưa là server grading từ trusted exam/key. Frontend chứa answer key; release UI không chứng minh secrecy trong kỳ kiểm tra cần giấu key. Không nghiệm thu trusted testing từ mock xanh.
- **Builder/bank/versioning:** có editor, JSON import/export/preview, bank local/filter và snapshot isolation. Phân cấp topic/Bài còn gộp; durable builder drafts/media, migrations, version publication, xóa/xuất/backup cần acceptance đầy đủ. Public editor/no-login không là access control; maxAttempts chỉ local không xác thực danh tính.
- **DOCX/PDF:** NOT_IMPLEMENTED pipeline file→IR→preview/sửa→confirm→publish; FileReader JSON không phải DOCX/PDF parser. Chưa có corpus text/scan/OCR, nhiều cột/bảng/hình/OMML/LaTeX/provenance/confidence, corrupt/oversize và cảnh báo mất fidelity.
- **Presets/production:** chưa có mẫu THPT xác minh theo môn/năm/văn bản; custom-v1 không đại diện mọi mẫu chuẩn. Chưa nghiệm thu CI browser artifacts, full-history secrets/advisory/license scan, budgets, rollback/changelog và owner milestone acceptance. Không tuyên bố APPROVED toàn sản phẩm hay DONE.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P1/glue:** đóng F01/F02, durable scheduler/outbox với timeout và giới hạn concurrency, budget/deadline bền vững; UX queued/sending/confirmed/failed/exhausted; xem/tải/retry archive và quota/migration/lost-receipt acceptance.
2. **P1/glue:** browser E2E thực mobile/desktop: refresh/offline/background/hai tab/report, IME/keyboard/a11y/math/media; screenshot/trace và CI, owner acceptance.
3. **P1/glue:** chốt collection/trust model; nếu dùng kiểm tra cần điểm tin cậy, trusted server grading và integration Google thật, permissions/anti-abuse/idempotency/readback.
4. **P1/glue:** taxonomy Bài riêng; builder drafts/media bền vững; IDs/version publication/migration và xóa/xuất/backup; sửa nguồn không thay đổi đề/kết quả cũ.
5. **P2/glue:** importer DOCX/PDF/IR/provenance/flags/preview/hiệu đính/confirm; bảo toàn bảng/hình/toán, OCR khi cần, không đoán key.
6. **P2/src/domain + glue:** đóng F03, policy grammar/display/limits/grouping có version; presets THPT xác minh theo môn/năm; security/license/performance/rollback gates. Class/Assignment thuộc giai đoạn sau.

## NEED_DECISION — giữ nguyên các lựa chọn chưa được duyệt

Không thấy mâu thuẫn công thức điểm giữa Shared và M1. Các sửa kỹ thuật F01/F02 không cần tự chốt nghiệp vụ. Các phần sau cần owner quyết trước nghiệm thu tương ứng:

- Trust/collection: A luyện tập self-reported có nhãn giới hạn; B trusted server grading qua dịch vụ được duyệt; C local/export-only trong khi chưa duyệt dịch vụ.
- Display: A phân số exact; B half-up2 chữ số kèm nguồn exact; C precision/mode theo version policy. Scoring luôn exact.
- GrammarIII: A tiếp tục sa-charset-v1; B grammar số riêng có version/migration. Không tự cấm01/--1/,5.
- Limits/grouping: A duyệt tạm1000 câu và nhóm I→II→III; B giới hạn/thứ tự mới có version.
- Inverse API F03: A giữ inverse và tách transport bound; B sửa contract giới hạn nhất quán constructor/formatter/parser.
- Presets: A owner chọn môn/năm/văn bản để xác minh; B tiếp tục custom-only với nhãn phạm vi rõ.

recommended_action: giao glue sửa F01/F02 và regression boundary; domain đóng F03 theo contract hoặc quyết định owner. Giữ hai fixes LC41 đã xác minh, không reset budget để chữa triệu chứng. Sau thay đổi cần review/gate theo revision mới. Không deploy từ báo cáo này.

tools_research: NOT_REQUESTED trong LC42; không cài tool. privacy_notes: dữ liệu tổng hợp và kết quả kỹ thuật; không dùng dữ liệu học sinh thật.
