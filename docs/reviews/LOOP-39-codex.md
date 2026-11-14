# LC39 — Kiểm định toàn sản phẩm, vòng 39

- review_id/task_id: LC39; reviewer: Codex; ngày: 2026-11-14.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0, đọc toàn bộ; đối chiếu B1-AC/B1-T tại `docs/research/codex/READINESS.md` §6.
- base_commit/head_commit: `8a13df5a84e915fae0c4c76c8b0fcda218a128b3` (HEAD ở đầu phiên và khi chạy probes).
- risk_level: HIGH; verdict: **CHANGES_REQUESTED**. Bàn giao **NEED_DECISION** cho các chính sách chưa duyệt ở cuối báo cáo; không dùng các quyết định đó để trì hoãn sửa lỗi kỹ thuật F01–F03.
- Chỉ tạo `docs/reviews/LOOP-39-codex.md`; không sửa code/test/config, không cài dependency, không commit/deploy/đổi branch/worktree. Những thay đổi `ops/*`, `workers.html` đã có từ đầu phiên thuộc tiến trình khác.

## Phạm vi và revision thực tế

LC38 được commit cùng vòng sửa tại HEAD nên `git log -1 -- docs/reviews/LOOP-38-codex.md` không phải mốc source cũ độc lập. Đã đọc cả phần late-delta của LC38, xem `git log`, `git show -1 --stat`, và diff `ae57119..HEAD` cho source/tests để bao phủ toàn bộ sửa vòng 30: `index.html` +212/-119, collector +31/-17, hai test VM +275/+112 dòng; không có delta `src/domain` hoặc dependencies trong khoảng này. Không đọc prompt riêng của worker khác.

files_reviewed: các module `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; `index.html` (scoring/validation, lưu/restore/snapshot, timer, submit/reconcile, report, bank/builder và collection); `apps-script/Code.js`; tests domain/acceptance, harness và regression E2E liên quan; oracle/fixtures; `scripts/build.js`; package/tsconfig; README và contract/review trước. Đây là review source + runtime Node/VM, **không phải nghiệm thu browser/Google hoặc chứng minh mọi dòng code đều an toàn**.

Source cutoff SHA256, khớp HTML đã pin trong RAM để chạy probe:

| File | SHA256 |
|---|---|
| `index.html` | `221DFB23EBEDFE0C595F6635F24F64A5B4F1D272191E7C25BA5A5C756600A1D8` |
| `apps-script/Code.js` | `EE77DAF24DFC81878E835F85C2161889A2B6D10F5C88CE32E28177C8F4EE08A2` |
| `src/domain/rational.ts` | `068B140C1D0DF59AE759B6829AE961AFA2034C2A5D1F060A26D8BDE8E4AFB886` |
| `test/e2e/demoFlow.test.ts` | `2F76949374C0F7F6F6494C6A941885941AF67C0F1B3C02FBA368C5345F33B4A1` |
| `test/e2e/appsScriptCollector.test.ts` | `6760B45A372D6F815F68B46AA6CDE6AA3B3463A9E68940DFB51C5A22632A1CAF` |

## Findings mở

### LC39-F01 — CRITICAL — Archive cũ thiếu trường mới vẫn bị gửi sang collector của đề khác

- **VÙNG chịu trách nhiệm: glue. VERIFIED trong VM.** LC38-F01 được sửa cho job mới có `collectorUrl`, nhưng migration của dữ liệu cũ còn thiếu.
- affected_files: `index.html:2888–2897,2923–2924,2945–2947`; fallback tương tự tại `index.html:3006–3011`.
- evidence: submit A ở `https://a.invalid`, final có `examSnapshot.collectorUrl === 'https://a.invalid'`. Bỏ riêng trường top-level `collectorUrl` để mô phỏng final trước đợt pin URL; giữ nguyên snapshot, responses và score hợp lệ. Context mới dùng cùng localStorage, currentExam B ở `https://b.invalid`, B chưa nộp. `await syncUnconfirmedFinalSubmissions()` POST body của attempt A đến **https://b.invalid**. Assert identity A và URL B đều qua; probe exit0, không gửi mạng thật.
- reproduction_steps: dùng `createPageContext(store)` trong `test/e2e/demoFlow.test.ts`; đề A/B đều custom-v1/v1, một câu III q/key1. Nộp A offline, lấy key `cunata:final:*`, JSON.parse → delete `collectorUrl` → setItem lại. Context mới gán currentExam=B, studentState.attemptId='B-draft', submitted=false; mock fetch ghi URL/body rồi trả `{ok:false}`; gọi scanner. Không xóa destination trong examSnapshot.
- expected: Shared §3/4: khôi phục job A giữ destination của A; nếu không xác định an toàn được destination thì giữ local và báo cần cấu hình, không suy từ một đề khác.
- actual/impact: scanner bỏ qua destination trong snapshot A và chọn cấu hình B. Nickname, raw answers và điểm A có thể đi đến chủ nhận B; collector A không nhận bài. Chưa có bằng chứng rò rỉ production thực tế.
- minimal_fix: migrate job từ snapshot/config gắn chính attempt, validate rồi pin destination bền vững; job legacy không có provenance đủ chắc phải được giữ lại để xử lý rõ ràng. Không fallback sang currentExam/window hiện tại cho một archive không xác định nguồn. Nếu trước đây dùng window override và không lưu lại, không thể tự suy lại override cũ từ cấu hình hiện hành.
- regression_test: legacy final thiếu top-level URL nhưng có snapshot A, mở B/override C → chỉ gửi A; không có provenance → zero POST và trạng thái cần cấu hình; reload giữ migration; new pinned job/retry/receipt A không đổi theo B.

### LC39-F02 — MAJOR — Retry vẫn vượt backoff/budget khi scan lặp và reload active final

- **VÙNG chịu trách nhiệm: glue. VERIFIED trong VM.** LC38-F02 còn mở một phần; map per-attempt và in-flight guard chưa tạo durable retry state machine.
- affected_files: `index.html:1740–1742,2091–2094,2919–2921,2947,3056,3121–3139,3147–3167,3179–3186,3671–3673`.
- evidence A (backoff/chain multiplication): submit A offline, restart, xóa callbacks cũ trong harness để cô lập scanner. Gọi scanner hai lần tuần tự, không chạy timer nào. **2 POST và 2 callback cùng delay1000ms**; lẽ ra scan thứ hai phải giữ lịch đã có. `itemRetry` chỉ dùng để skip khi >=5; dispatcher vẫn nhận đối số0. Guard chỉ tồn tại khi request pending, bị delete trước thời gian backoff.
- evidence B (durable budget): active A thất bại lần đầu và chạy đủ5 callback retry → **6 POST**, final.retryCount=5, hết timer. Context mới cùng store gọi `await initExam()` → **thêm1 POST và1 timer** cho đúng attempt A. Gọi tiếp dispatcher sau request hoàn tất → tổng context mới **2 POST,2 timers, map counter2**. Không chạy timer để chờ đủ backoff. Các assertion đều qua, probe exit0.
- reproduction_steps: mock setTimeout thu `{fn,ms}`; mock fetch thu body và trả `{ok:false}`; drain100 microtasks sau submit/callback. Nhánh A dùng `restartExam()` và hai lần `await syncUnconfirmedFinalSubmissions()`. Nhánh B shift/gọi5 callbacks, xác nhận final.retryCount5, tạo context mới và init từ active snapshot đã lưu. `loadLocalState()` tự dispatch trước khi init reset map; dispatcher không hydrate/check budget đã persist.
- expected: Shared §3: retry tự động hữu hạn, có backoff và không nhân chains; scan/online/reload không khởi tạo lại ngân sách của cùng job. Manual retry sau exhaustion phải là thao tác/policy riêng nếu được chọn.
- actual/impact: scan lặp trước exhaustion luôn bắt đầu lại ở count0; reload active final cũng bắt đầu lại dù đã cạn budget. Online/dispatcher có thể phát thêm request trước nextRetryAt. Tăng request/quota; không khẳng định tạo Sheet rows trùng vì collector vẫn có dedupe.
- minimal_fix: durable per-job `{attempt/exam/version, destination, immutablePayload, retryCount, nextRetryAt, state}`; một dispatcher chung kiểm in-flight/scheduled/exhausted trước POST. Restore state trước bất kỳ dispatch nào, không reset count của final. Scan chỉ enqueue/resume đúng job đủ hạn; timer và online dùng cùng state. Giữ budget của A/B độc lập.
- regression_test: scan/online nhiều lần trong backoff không POST thêm; mỗi job tối đa1 timer/request; đã6 lần fail rồi reload không POST tự động; nextRetryAt và budget sống qua reload, restart, reimport; B còn budget riêng; lost receipt vẫn chỉ1 row; kiểm cả HTTP failure và thrown/rejected fetch.

### LC39-F03 — MAJOR — Một archive request pending chặn toàn bộ archive phía sau

- **VÙNG chịu trách nhiệm: glue. VERIFIED trong VM.** Khác LC38-F03 (chặn boot) đã sửa.
- affected_files: `index.html:2883–2886,2912–2948,3059–3064,3170–3172`.
- evidence/reproduction_steps: tạo2 final hợp lệ chưa confirmed của A rồi B bằng submit/restart, cùng shared store. Context mới có active draft khác, collector A trả Promise do harness giữ pending. Gọi scanner, drain100 microtasks: chỉ POST A, **POST B=0**, scan chưa resolve. Gọi scanner lần hai → trả ngay, vẫn POST B=0 do isSyncingArchive. Resolve A `{ok:false}` và cho fetch kế tiếp trả ngay → B mới có1 POST. Không dựa vào sleep/tốc độ mạng; probe exit0.
- expected: Shared §3: xử lý lại các kết quả đã lưu với isolation, retry hữu hạn; một destination không phản hồi không khóa các job độc lập.
- actual/impact: vòng for await tuần tự giữ isSyncingArchive tới khi fetch kết thúc; không có application timeout. Những final sau A không được thử gửi trong thời gian A treo, online/scan không phục hồi được. Active boot hiện vẫn chạy; không báo lại lỗi boot đã đóng.
- minimal_fix: enqueue độc lập theo job với concurrency giới hạn và timeout/abort có kiểm soát; không giữ global scan lock xuyên network await. Timeout phải cập nhật retry/backoff và giải phóng in-flight, không chỉ Promise.race để request cũ tiếp tục ghi ngoài state machine.
- regression_test: A pending, B collector hoạt động → B nhận bài trong giới hạn scheduler; boot/render/timer tiếp tục; A timeout rồi retry có budget; late receipt không ghi nhầm B; không phát nhiều B chains khi online/scan lặp.

### LC39-F04 — MINOR — Parser phân số không nghịch đảo toàn bộ output formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED.** LC38-F04 còn mở, source không đổi.
- affected_files: `src/domain/rational.ts:119–145`.
- evidence/reproduction_steps: qua public API, `s=toFractionString(rational(10n**200n))`; `s.length===201`, canonical integer nhưng `parseFractionString(s)` ném SyntaxError vì bound200. Assert hai điều kiện trên qua, probe exit0.
- expected: M1 §4.1 yêu cầu parser là nghịch đảo chặt formatter; actual: constructor/formatter hỗ trợ miền lớn hơn parser.
- impact: roundtrip public API lỗi với BigInt lớn; chưa chứng minh ảnh hưởng điểm đề giới hạn1000 câu.
- minimal_fix: parser inverse toàn canonical output, giới hạn transport tại boundary riêng; hoặc xin owner duyệt bound chung và enforce nhất quán constructor/formatter/parser. Không tự đổi contract chỉ để khớp test hiện có.
- regression_test: canonical199/200/201 ký tự, tử/mẫu lớn, số âm/zero và các dạng noncanonical; nếu chọn bound chung kiểm cả hai chiều.

## Retest các lỗi LC38

| Mục | LC39 |
|---|---|
| F01 destination drift | **PARTIAL FIX**: regression new job A→B/override và callback giữ endpoint A PASS; legacy còn F01 ở trên. |
| F02 archive budget | **PARTIAL FIX**: exhausted archive được skip theo persisted count; scan trước exhaustion và active reload còn F02. Test hiện có chỉ vét6 request rồi chuyển B, không cover hai case này. |
| F03 boot await archive | **FIX VERIFIED trong suite VM**: pending collector không chặn render/startTimer của B; scanner vẫn có starvation F03 mới. |
| F04 rational inverse | OPEN, tái hiện lại F04. |
| F05 Map.add runtime | **FIX VERIFIED cho dispatch path**: source dùng Map.set/get/delete, npm386/386 PASS, probes gọi fetch thật trong VM; không còn TypeError đã báo ở snapshot chuyển tiếp LC38. |
| Collector raw canonical collision | **FIX VERIFIED trong VM**: 6 cặp raw/type qua doPost trả PAYLOAD_CONFLICT, đổi thứ tự object keys vẫn ALREADY_RECORDED; không tự nhận Google cells thật đã kiểm. |

## checks_run

Môi trường thực: Windows/PowerShell, cwd D:\Cunata; Node24.14.0/npm11.9.0, local TypeScript7.0.2, Python3.11.0. Không dùng NOT_RUN của môi trường tsc cũ trong M1 để thay kết quả chạy thật. Stdout/exit lưu trong transcript phiên LC39; không tạo log/test ngoài scope. Các probe dưới chạy qua PowerShell here-string → `node --input-type=module`, không gọi mạng ngoài.

| Command/check | Exit | Kết quả thực và giới hạn |
|---|---:|---|
| `npm test` |0|386 tests/59 suites, pass386/fail0, cancelled/skipped/todo0;1164.3674ms. Tên E2E ở đây là VM + DOM/Sheet giả lập, không browser. |
| `npx --no-install tsc -p tsconfig.json` |0|Không diagnostics. |
| `npx --no-install tsc -p tsconfig.web.json` |0|Không diagnostics; tsconfig include src/scripts/test, không typecheck toàn bộ inline script trong HTML. |
| `node scripts/build.js` |0|7 assets tồn tại; sample8 câu hợp lệ; CSS link; collector syntax; web262620 bytes, collector30955. Đây là static verification, không bundle/render/deploy. |
| `python -B test/oracle/oracle.py --check` |0|11 tests/pass11/fail0;1632 fixture cases,5849 maxima configurations,9 negative controls, seed20261114;1.557s toàn check. Oracle riêng không thay SUT tests. |
| Node stdin differential domain/web/DTO và lifecycle |0|1632 fixtures, total/max + score/max của3 phần bằng expected cho cả scoreAttempt và scoreAttemptLocally; DTO→JSON→parse deepEqual kết quả domain. F01/F02/F03/F04 tái hiện với assertions như trên. HTML pin trong RAM, hash trước/sau bằng nhau. Chạy lại để tách riêng init reload cũng exit0: init tự POST1/timer1. |
| Node stdin collector doPost |0|6 cặp `1`/`1 `, `-0`/`0`, `null`/empty, `1,5`/`1,50`, string1/number1, stringnull/null → PAYLOAD_CONFLICT, mỗi cặp fresh Sheet chỉ1 data row. Reordered keys → ALREADY_RECORDED. Mock Sheet/Lock/ContentService. |
| `git diff --check -- src test index.html apps-script/Code.js` |0|Không whitespace error. |
| status/log/show/diff/hash và đọc UTF-8 |0 ở các lệnh hợp lệ|Không tìm thấy AGENTS.md trong workspace/đường dẫn cha đã kiểm; memory registry không có hit. Lệnh inventory ban đầu có `rg ... web` exit2 vì không có thư mục web; đã xác định ứng dụng là root index.html, chạy đúng build ở trên. Không tính lookup này là product failure. |
| Browser/Google integration/security tools/lint |NOT_RUN|Không chạy browser, endpoint Google thật, deploy, dependency advisory scanner/SAST/axe/Lighthouse. Không có lint script riêng. Không cài thêm công cụ. |

Phương pháp tái lập probe: lấy nguyên hàm `createPageContext` từ `test/e2e/demoFlow.test.ts`, bỏ type bằng Node `stripTypeScriptTypes`, inject fs/vm/indexPath; fs trả đúng HTML snapshot trong RAM. Mock fetch ghi `{url,body:JSON.parse(opts.body)}`, setTimeout lưu `{fn,ms}`, không tự thực thi timer. Drain100 microtasks sau submit/callback; pending request được giữ và resolve chủ động. Dùng cùng helper `createMockEnvironment` của test collector cho doPost, expected conflict/status do reviewer đặt độc lập. Không ghi thêm testcase vào test/ vì ngoài scope. ExperimentalWarning của stripTypeScriptTypes không là test failure.

## coverage_gaps

- Scoring I/II/III, exact raw/Unicode, null khácfalse, II1296 tổ hợp, max5/15/16/threshold/repeating, stable-ID permutations, immutable results và DTO đã có evidence suite/differential. Hữu hạn1632 fixtures không chứng minh mọi input; F04 còn mở. Các test tên mutant chủ yếu discrimination assertions, không phải chạy hệ thống mutation trên từng candidate.
- Browser thật **NOT_RUN**: Chrome/Firefox/WebKit, desktop/mobile, cold-offline app-shell navigation, refresh/back-forward/background timer, hai tab đồng thời, quota/private mode/migration, Telex/VNI/composition/cursor, keyboard/focus/screen reader/contrast, math/media overflow, tải/mở HTML/PDF offline, screenshots/traces/performance. VM không chứng minh localStorage check-before/after là transaction nhiều tab.
- Google thật **NOT_RUN**: CORS/redirect/readback, literal cell types/formatting, permissions/quota/anti-abuse, cold-sheet concurrency, lost receipt qua mạng thật. Collector chỉ kiểm consistency điểm client; chưa tự chấm từ snapshot/key tin cậy do owner quản lý. Answer key nằm ở frontend nên releasePolicy chưa cung cấp bí mật đề thi; chỉ có nhánh hạn chế hiển thị. Chưa nghiệm thu chế độ kiểm tra cần key bí mật/điểm đáng tin.
- Collection có implementation, receipt checks, archive và retry; không ghi NOT_IMPLEMENTED toàn bộ. F01–F03 cho thấy chưa có durable outbox hoàn chỉnh. Archive lỗi schema/date, receipt persist thất bại, pending/failed/exhausted UX và xem/tải/retry lịch sử chưa được kiểm định toàn diện.
- Bank/builder/JSON import/export/report có implementation/tests; phân cấp đủ Môn→Lớp→Chương/Chủ đề→Bài→mức độ, stable IDs/versioned publication, durable drafts/media, migrations và luồng xóa/xuất/backup đầy đủ chưa nghiệm thu. Các filter subject/grade/topic/difficulty không thay đủ data lifecycle.
- **DOCX/PDF importer NOT_IMPLEMENTED** theo Shared §6: chưa có file→IR bảo toàn đoạn/bảng/hình/OMML/math/provenance/confidence→preview/sửa→confirm; JSON importer không thay pipeline này. Chưa có corpus text-layer/scan/OCR/multicolumn/Unicode/corrupt/oversized.
- Mẫu chuẩn THPT theo môn/năm/văn bản kiểm chứng chưa triển khai; custom-v1 không đại diện quy tắc chính thức của mọi môn. Full-history secret scan, dependency/license/advisory audit, SAST, performance/load budgets, CI browser artifacts, rollback/changelog và owner milestone acceptance chưa có evidence của phiên này. Không có external repo/tool research trong task này.

## Tính năng lộ trình còn thiếu — ưu tiên

1. **P0/glue:** đóng F01, migration destination cho final cũ; chưa nghiệm thu collection khi còn đường gửi nhầm bên nhận.
2. **P1/glue:** đóng F02/F03 bằng durable outbox, bounded retries/backoff/timeout và job isolation; UX queued/sending/confirmed/failed/exhausted trung thực, archive xem/tải/retry, receipt persist/quota/lost receipt.
3. **P1/glue:** browser E2E offline/refresh/background/two-tabs/report thật, IME/mobile/keyboard/a11y/math/media; evidence traces/screenshots, CI và nghiệm thu owner.
4. **P1/glue:** owner duyệt trust/collection service; nếu cần kiểm tra đáng tin, server grading từ snapshot/key tin cậy, rồi Google CORS/write/readback/idempotency/permissions/anti-abuse thật sau phê duyệt.
5. **P1/glue:** hoàn thiện bank/builder taxonomy có Bài, versioned question/exam publication, durable drafts/media, migration/xuất/xóa/backup; snapshots cũ giữ nguyên khi nguồn sửa.
6. **P2/glue:** DOCX/PDF importer + IR/provenance/flags, preview/hiệu đính/confirm, OCR khi cần; giữ bảng/hình/toán, không đoán key.
7. **P2/src/domain + glue:** F04 và quyết định grammar/display/limits/grouping; preset THPT theo môn/năm/văn bản được kiểm chứng, tách custom; security/license/performance/rollback gates. Class/Assignment là giai đoạn sau.

## NEED_DECISION — các mục không tự chốt

Không thấy xung đột công thức điểm giữa hai contract. Những phương án dưới cần owner quyết; không thay đổi code/policy trong review này:

- Trust/collection: A luyện tập self-reported với nhãn giới hạn; B server grading từ snapshot/key tin cậy; C local/export-only đến khi duyệt dịch vụ.
- Display: A phân số exact làm chính; B half-up2 chữ số kèm exact source; C precision/mode theo policy version. Không làm tròn trong scoring.
- Grammar III: A giữ sa-charset-v1 chỉ charset/length; B grammar số version mới cùng migration; không tự cấm01/--1/,5.
- Limits/grouping: A duyệt tạm1000 câu và nhóm I→II→III; B policy version khác với limits/grouping owner xác nhận.
- F04: A parser inverse toàn canonical output, transport bound riêng; B bound chung constructor/formatter/parser theo contract sửa được owner duyệt.
- Mẫu chuẩn: A chọn môn/năm/văn bản để xác minh preset; B tiếp tục custom-only và ghi rõ phạm vi.

recommended_action: giao worker **glue** sửa F01–F03 và **src/domain** xử lý F04 theo contract; thêm regression được nêu, kiểm định source/hash cố định trước gate. Không nghiệm thu/deploy toàn sản phẩm từ việc386 tests xanh. tools_research: NOT_REQUESTED. privacy_notes: chỉ dữ liệu tổng hợp giả lập và bằng chứng kỹ thuật; không có dữ liệu học sinh thật.

## Delta đồng thời và retest cuối phiên

Worker khác sửa `index.html` trong lúc ghi báo cáo; HEAD chưa đổi. Snapshot mới **SHA256 A3A7912C5C98654F3433D85F2EBAB593A4CBB3FCB514195FBD8C185E80A2B2AF**,263555 bytes. Collector/domain/test hashes vẫn như bảng cutoff. Diff working tree thêm scheduledRetryTimers và hydrate collectorUrl/retryCount/retryExhausted/nextRetryAt trong restore, chỉ reset counters với bài chưa nộp. Không sửa/ghi đè delta của worker.

Đã chạy lại trên delta này, không dùng kết quả cũ để tự đóng findings:

| Check | Exit | Kết quả |
|---|---:|---|
| `npm test` (capture stdout trong RAM, lấy summary) |0|386 tests/59 suites;pass386/fail0,cancelled/skipped/todo0;1037.8717ms. |
| `npx --no-install tsc -p tsconfig.json` |0|Không diagnostics. |
| `npx --no-install tsc -p tsconfig.web.json` |0|Không diagnostics. |
| `node scripts/build.js` |0|7 assets/sample8/CSS/collector syntax OK; web263555 bytes. |
| Node stdin differential/lifecycle đầy đủ như trên |0|1632 fixtures domain/web/DTO PASS; F01 legacy vẫn gửi A→B; F02 archive2 scans vẫn POST2/timer2/delay1000,1000; F03 pending A vẫn chặn B cho tới release; F04 vẫn reject canonical201. HTML pin hash mới, unchanged=true sau probe. |

**F02 active reload còn lỗi nhưng biểu hiện thay đổi:** final.retryCount5 đã được hydrate; init vẫn tự POST thêm1 nhưng nay không lên timer; gọi dispatcher thêm một lần vẫn POST thêm1, map giữ5. Có nghĩa counter không còn reset về0 ở nhánh này, nhưng **không có guard exhaustion trước fetch**, nên request vẫn vượt budget khi restore/online/direct dispatcher. Số timer1/2 ở phần bằng chứng cutoff cũ không áp cho snapshot mới; kết luận cần chặn POST của exhausted job vẫn đúng và đã tái hiện lại. Những tham chiếu file:line ở findings thuộc cutoff221DFB..., ở delta mới các dòng sau restore dịch khoảng18 dòng.

Verdict cuối vẫn **CHANGES_REQUESTED**. Mọi delta sau hash A3A791... cần gate/review tiếp; không có nghiệm thu browser/Google/production ở cả hai snapshot.
