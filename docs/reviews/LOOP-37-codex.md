# LC37 — Kiểm định độc lập toàn bộ sản phẩm

review_id/task_id: LC37; reviewer: Codex; date: 2026-11-14, Asia/Bangkok.
requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6 (B1-AC01–08, B1-T01–17).
base_commit/head_commit: `07087817f452b0d423a962992147b22d1368f776` + working-tree delta; không tạo branch/worktree, không commit.

**verdict: CHANGES_REQUESTED; risk_level: HIGH.** Còn **2 CRITICAL, 1 MAJOR, 1 MINOR** đã tái hiện. Gate cuối: **381 tests/pass381/fail0**, cả hai typecheck và static web build exit0. Domain và web scorer khớp 1.632 fixtures độc lập, DTO round-trip khớp. Không nghiệm thu toàn sản phẩm từ các gate này.

## Snapshot và phạm vi

- Đọc LC36, git status/log/diff, hai hợp đồng và READINESS §6. HEAD không đổi so với LC36; thay đổi sản phẩm chưa commit tập trung `index.html`, `apps-script/Code.js` và hai VM test files. Không có delta `src/`, `package.json`, `package-lock.json`. Không đọc prompt riêng của worker khác.
- Đối chiếu LC36: collector và rational giữ nguyên hash; web thêm dispatcher archive và bỏ fallback ngân sách global cho job mới. Test bổ sung regression snapshot/archive/budget và canonical comparison. Có worker khác sửa test trong lúc review; báo cáo ghi cả failure đầu và gate cuối.
- files_reviewed: `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; các đường web validation/import JSON, init/restore/save/snapshot, shuffle/input/timer, submit/history/report/release policy, collector/retry/archive, bank/builder; collector và manifest/README; package/tsconfig/build, domain/acceptance/oracle và VM tests liên quan. Phần runtime tập trung scoring và các lỗi liên quan delta; không coi đọc source là browser QA.
- Chỉ tạo `docs/reviews/LOOP-37-codex.md`. Không sửa code/tests, không cài dependency, không gọi Google, không deploy. Những file dirty/untracked khác đã có hoặc do worker khác thay đổi.

SHA256 tại cutoff:

| File | SHA256 |
|---|---|
| `index.html` | `3013A43BE9B097E6061C29A340FB0CF0CF0A9394F9084FDA07E3A3B216949896` |
| `apps-script/Code.js` | `6A541E94D138C53686411F267A017BF37369EA4ADAC7F2FA4C25B39E8BB94094` |
| `src/domain/rational.ts` | `068B140C1D0DF59AE759B6829AE961AFA2034C2A5D1F060A26D8BDE8E4AFB886` |
| `test/e2e/demoFlow.test.ts` | `3A6607D2E62362A6AB68F1AF1D2944650420A38D62B8A969C0C3E677A35558A6` |
| `test/e2e/appsScriptCollector.test.ts` | `3C67658309DC587BBC309BEEDE799AA32EFF4B3E062AB4989588B67A78BBC8B2` |

Hash demoFlow đầu phiên là `1D73B01713BB960C65DAA4F04B6D2DFC2F5C8B30319217DAEE6891CA1545E671`; cuối phiên worker thêm `await new Promise(r => setTimeout(r, 0))` sau submit B trong regression LC35-F03. Product web/collector/rational có cùng hash khi chạy probes và khi chốt. Mọi delta sau cutoff cần review tiếp, không tự được chứng nhận.

## Cách tái hiện probes

Chạy PowerShell here-string qua `node --input-type=module`, không ghi file. Web dùng **nguyên helper `createPageContext`** từ `test/e2e/demoFlow.test.ts`, lấy đoạn từ khai báo hàm tới `it('LC13-F01 regression`, bỏ type bằng `node:module.stripTypeScriptTypes`, evaluate với `{fs, vm, indexPath:'index.html'}`. Helper chạy nguyên inline script của sản phẩm, DOM/localStorage/fetch/timers giả lập. Chỉ stub `renderExamPane`, `renderPalette`; helper đã stub `showReportView`. Mỗi case dùng context mới; case reload dùng context mới chia sẻ Map store, không chạy callback của context cũ.

Fixture đề A/B: `examId:'A'/'B'`, `examVersionId:'v1'`, `ruleSetId:'custom-v1'`, `inputPolicyId:'sa-charset-v1'`, một câu III `{questionVersionId:'q',answerKey:'1'}`, endpoint lần lượt `https://owner-a.invalid/collector` và `https://owner-b.invalid/collector`. Dùng `loadExamVersion(ex)`, raw `q:'1'`, `submitExam()`. Fetch ghi `{url,payload:JSON.parse(opts.body)}` vào mảng rồi ném `Error('offline')`. `setTimeout` ghi `{fn,ms}` vào queue. Sau submit/callback drain 30 microtasks bằng `await Promise.resolve()` trước assertion. Không gửi request thật.

Collector dùng `vm` chạy nguyên `apps-script/Code.js`, mock Sheet giữ rows trong RAM với `getLastRow`, `appendRow`, `getRange(...).getValues()` đúng số hàng/cột; ScriptLock thành công; ContentService trả JSON body. Mỗi cặp request dùng Sheet/context mới. Không thay implementation canonicalizer trong probe.

## Findings mở

### LC37-F01 — CRITICAL — Retry và archive gửi bài A sang collector của đề B

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** Kế thừa LC36-F01, mở rộng sang dispatcher archive mới.
- affected_files: `index.html:2871–2879,2897–2920,2927–2934,3063–3066,3081–3084`.
- evidence/reproduction_steps:
  1. Load A, trả lời1, submit; fetch A thất bại, giữ callback retry A.
  2. Load B khác endpoint, B chưa submit. Chạy callback A và drain microtasks.
  3. POST kế tiếp có **URL owner-b**, nhưng body `exam_id:'A'`, attempt A, raw `{q:'1'}`, điểm10/10; `B.submitted=false`. Assertions exit0.
  4. Biến thể archive: submit A thất bại → restart → fresh context chia sẻ store → load B → `await syncUnconfirmedFinalSubmissions()`. Archive A cũng POST sang owner-b. Archive có `examSnapshot.collectorUrl` của A nhưng dispatcher không dùng nó.
- expected: Shared §3/4: submission đã nộp giữ identity, nội dung và dịch vụ nhận thuộc đúng cấu hình chủ sở hữu. actual: `specificPayload` chỉ pin body; mỗi lần dispatch đọc URL từ window/currentExam hiện tại. Archive cũng lấy URL của đề hiện tại.
- impact: dữ liệu thí sinh, raw và điểm có thể gửi nhầm bên nhận; collector A không nhận retry. B không cần submit để gây lỗi. Chỉ chứng minh bằng VM, không khẳng định đã rò rỉ trên Google production.
- minimal_fix: tạo job bền vững gồm destination đã validate, identity đầy đủ, immutable payload và trạng thái/budget. Retry và archive truyền destination của job, không đọc lại currentExam/window để định tuyến job cũ. Chỉ pin payload không đủ. Nếu window override là cấu hình được chọn lúc submit, pin chính giá trị đó.
- regression_test: A fail → load B khác URL → retry A vẫn chỉ tới A; fresh reload với B cũng gửi archive A tới A; thay window override sau submit không đổi đích A; receipt A không xác nhận B; submit B gửi tới B riêng.

### LC37-F02 — CRITICAL — Canonicalizer vẫn xác nhận trùng cho raw khác từng ký tự

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** LC36-F02 OPEN, collector hash không đổi.
- affected_files: `apps-script/Code.js:94–113,600–635`.
- evidence/reproduction_steps: payload hợp lệ có attempt/exam/version cố định, sections I=0/0, II=0/0, III=10/10, total=maxTotal10, policy custom-v1. POST raw `{q:'1'}`, rồi cùng envelope nhưng raw `{q:'1 '}` → **ALREADY_RECORDED**, row vẫn lưu `{"q":"1"}`. Với môi trường mới, `'-0'` → `'0'` cũng ALREADY_RECORDED, row vẫn `-0`. Thêm control `'null'` → `''` cũng collision. Mỗi cặp giữ điểm giống nhau để cô lập identity; không giả định frontend chấm các raw này cùng điểm.
- expected: Shared §2/3 yêu cầu giữ raw exact; raw khác phải PAYLOAD_CONFLICT, không success cho nội dung chưa lưu. actual: trim và JSON.parse đệ quy trên mọi string leaf làm mất whitespace, type và biểu diễn `-0`.
- impact: receipt có thể nói bài đã nhận dù raw hiện tại khác dữ liệu trong Sheet; frontend nhận status này sẽ coi confirmed. Đây là lỗi consistency, độc lập quyết định server grading.
- minimal_fix: parse JSON một lần tại boundary nếu protocol nhận JSON string; validate shape. Canonicalizer chỉ sort keys, giữ type/value và quote string leaf bằng JSON.stringify; không trim/parse số/normalize raw. So sánh immutable envelope/fingerprint đầy đủ.
- regression_test: `'1'`/`'1 '`, `'-0'`/`'0'`, `'null'`/`''`, string/number/null khác nhau; `'1,5'`/`'1,50'` conflict; keys đảo thứ tự vẫn duplicate. Missing raw, policy mismatch và lỗi đọc vẫn reject; conflict không đặt serverConfirmed.
- positive controls hiện chạy: reordered object keys và fraction `20/2` tương đương10 → ALREADY_RECORDED; missing raw và policy đổi → PAYLOAD_CONFLICT; `1,5`/`1,50` → PAYLOAD_CONFLICT. Không báo lại lỗi key order/fraction cũ đã sửa.

### LC37-F03 — MAJOR — Archive reset budget và tạo nhiều chuỗi retry cho cùng job

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** Lỗi mới trong dispatcher khôi phục; không phải bug B kế thừa counter A cũ.
- affected_files: `index.html:2865–2868,2920–2923,2942–2943,2996,3059–3066,3077–3084,3091–3098`.
- evidence/reproduction_steps:
  1. Submit A offline → restart → fresh context cùng store → `initExam()`: archive A được gửi một lần, active mới chưa submit.
  2. Chạy đủ5 callbacks và drain từng lần: **6 POST**, hết timer.
  3. Gọi lại `await syncUnconfirmedFinalSubmissions()`: **POST thứ7**, timer mới **1000ms**, dù job vừa hết budget. Assertion exit0.
  4. Context mới khác: init +4 lần gọi scan tuần tự → **5 POST, 5 timer** cùng archive. Chạy5 callback đó → **10 POST, queue tổng10 entries** (gồm5 callback đã dùng và5 callback kế tiếp). Không có in-flight/pending-chain guard theo job.
- expected: Shared §3 yêu cầu retry có giới hạn/backoff và idempotency; một job có budget/trạng thái thống nhất giữa scan/online/submit/reload. actual: archive luôn gọi `dispatchToServerCollector(payload, 0)`; explicit0 bỏ qua Map. `isSyncingArchive` chỉ chặn vòng scan đang await, thả ngay khi request fail và đặt timer; không chặn chains đã được schedule.
- impact: các online/dispatch/scan lặp lại hồi sinh budget và nhân số request, bỏ qua backoff, tăng tải/quota endpoint. Không có bằng chứng duplicate Sheet rows vì collector vẫn dedupe; lỗi ở dispatch/budget phía client.
- minimal_fix: key job bằng destination+exam/version+attempt; một state machine/in-flight hoặc scheduled flag, count/nextRetryAt dùng chung và lưu bền vững. Scan chỉ enqueue/resume job đủ điều kiện, không truyền0 cho job đã có. Nếu cho manual retry sau exhaustion, cần thao tác rõ và giới hạn riêng; không tự reset khi scan.
- regression_test:6 requests rồi nhiều scan/online không gửi thêm tự động; nhiều scan trong khi fetch pending/backoff không tạo nhiều chains; reload giữ budget/nextRetryAt; A/B độc lập; lost receipt/retry vẫn một row; success của A không reset B; thao tác retry thủ công theo policy được duyệt.

### LC37-F04 — MINOR — Parser public chưa là nghịch đảo đầy đủ của formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED.** LC36-F06 OPEN, source không đổi.
- affected_files: `src/domain/rational.ts:119–145`.
- evidence/reproduction_steps: import API công khai từ `src/domain/index.ts`; `const s=toFractionString(rational(10n**200n));` tạo canonical string201 ký tự; `parseFractionString(s)` ném SyntaxError vì limit200. Probe assert length201 và assert.throws exit0.
- expected: M1 §4.1 yêu cầu nghịch đảo chặt formatter. actual: constructor/formatter nhận giá trị mà parser từ chối.
- impact: public API round-trip hỏng với BigInt lớn; chưa thấy ảnh hưởng điểm đề tối đa1000 câu.
- minimal_fix: thực hiện inverse trên toàn canonical output hoặc owner duyệt bound chung và enforce/document thống nhất constructor/formatter/parser. Giữ transport resource limits riêng, không tự bỏ toàn bộ limit hay tự sửa contract.
- regression_test:199/200/201 ký tự; tử/mẫu lớn; zero/negative/noncanonical/malformed; nếu chọn bound chung, kiểm cả hai chiều theo policy đã duyệt.

## Retest LC36 và failure đầu phiên

| Mục cũ | Kết luận LC37 |
|---|---|
| LC36-F01 destination drift | OPEN → LC37-F01; retry và archive đều tái hiện. |
| LC36-F02 raw collision | OPEN → LC37-F02; positive controls cũ vẫn đúng. |
| LC36-F03 B kế thừa budget A | **FIX VERIFIED** cho counterexample cũ. Probe synthetic A không có archive: A6 POST, B1 POST; ngay sau submit B0 timer, drain microtasks →1 timer1000ms. Không giữ kết luận starvation cũ. |
| LC36-F04 thiếu archive dispatcher | **FIX VERIFIED cho đường phục hồi chính**: submit fail → restart → fresh init →1 POST archive A, active mới chưa submit. Còn destination/budget theo F01/F03. Chưa chứng nhận browser/offline thật. |
| LC36-F05 key order/fraction | Vẫn CLOSED; probes reordered keys/fraction tương đương thành duplicate. |
| LC36-F06 rational inverse | OPEN → LC37-F04. |
| Snapshot refresh/save/reimport của LC35 | Regression trong suite cuối PASS. Không báo lại lỗi refresh đã đóng. API aliasing chưa có chứng cứ UI gây mutation; giữ coverage gap. |

Hai lượt `npm test` đầu exit1 tại `test/e2e/demoFlow.test.ts:4060–4125`, regression LC35-F03, actual5/expected6 callbacks. Lượt có count đầy đủ:381 tests/pass380/fail1, duration861.3475ms. Test gọi submit không await dispatch nên kiểm timer trước rejection/catch của fetch. Probe riêng xác minh B vẫn có timer1000ms sau microtasks. Trong phiên worker thêm await macrotask vào test (hash cutoff nêu trên); suite cuối381/381 PASS. Đây là **failure đã có root cause và bản test mới đã retest**, không xóa failure khỏi lịch sử, không quy nó thành bug starvation còn mở.

## checks_run

Môi trường: Windows/PowerShell; cwd `D:\Cunata`; Node24.14.0, npm11.9.0; TypeScript local pin7.0.2; Python3.11.0. Evidence command/stdout/exit trong transcript LC37; không ghi log/test ngoài scope. Count probe/oracle không cộng vào count npm.

| Command/check | Exit | Kết quả thật / giới hạn |
|---|---:|---|
| `npm test` đầu (capture RAM, tail18) |1|Failure LC35-F03, actual5/expected6; tail không giữ count, không tự gán PASS. |
| `npm test` capture RAM và lọc summary/failure |1|381 tests/59 suites; pass380/fail1; cancelled/skipped/todo0;861.3475ms. |
| `npm test` sau worker thêm await trong test |0|381 tests/59 suites; pass381/fail0; cancelled/skipped/todo0;823.6376ms. |
| `npx --no-install tsc -p tsconfig.json` |0|Chạy đầu và cuối; không diagnostics. Tsc hiện đã có, không dùng NOT_RUN từ contract cũ. |
| `npx --no-install tsc -p tsconfig.web.json` |0|Chạy đầu và cuối; không diagnostics. Config include src/scripts/test, không tự typecheck mọi inline JS trong HTML. |
| `node scripts/build.js` |0|Chạy đầu và cuối;7 assets tồn tại, sample8 câu hợp lệ, CSS link, collector syntax. Cutoff web257571 bytes/collector30178. **Static verifier**, không compile/render/deploy trình duyệt. |
| `python -B test/oracle/oracle.py --check` |0|11 tests/pass11/fail0;1632 cases,5849 maxima configs,9 negative controls; seed20261114;1.3676s toàn check. Chỉ oracle độc lập. |
| Node stdin differential domain/web/DTO |0|1632 fixtures: total/max và score/max từng phần của cả hai scorer so expected độc lập; DTO→JSON→parse deepEqual toàn ScoreResult. Rational201 reject đã xác nhận. |
| Node stdin collector |0|Raw collisions F02 và positive controls key order/fraction/missing raw/policy; mỗi cặp môi trường mới. |
| Node stdin lifecycle (bản đã chỉnh assertion harness) |0|B budget độc lập sau microtasks; destination drift retry+archive; archive fresh-init1 POST; exhaustion→scan POST7/timer1000;5 scans tạo5 chains→10 POST. |
| Probe lifecycle lần đầu |1|Assertion harness đòi1 timer nhưng thấy2 vì fixture A submit thật tạo archive; B submit kích hoạt cả scan archive A và dispatch B. Đã tách synthetic A như test gốc để đo starvation; phát hiện reset archive ghi F03. Không tính harness này là pass. |
| Probe trích riêng test LC35-F03 trong RAM |1|Trong lúc worker thêm await setTimeout vào source test, sandbox ngoài của probe thiếu setTimeout nên lỗi harness `setTimeout is not defined`; không chứng minh sản phẩm fail. Sau đó đọc diff/hash và chạy lại **npm test thật**, exit0. Không sửa file test. |
| `git diff --check -- index.html apps-script/Code.js src test` |0|Không whitespace errors; warning LF/CRLF không làm exit khác0. |
| status/log/diff/rev-parse, source/contract/tests, SHA256 |0 cho các lệnh đọc hợp lệ|Xác định snapshot và concurrent test change; không dùng commit-message gate làm bằng chứng test. `rg` không có match và đường AGENTS không tồn tại có exit1/no output; không là product failure. |

## coverage_gaps

- B1-AC01–03/T01–09/T15: scoring I/II/III, II1296 tổ hợp, exact/Unicode/whitespace, max5/15/16/repeating/thresholds có unit/oracle/differential thật. Corpus hữu hạn không chứng minh mọi input; rational public inverse còn F04.
- B1-AC04–06/T10–14: validation ID/schema/prototype, seeded shuffle độc lập, DTO, properties và snapshot regression đã chạy trong suite. Chưa nghiệm thu mọi legacy/migration/settings và aliasing ở caller; nên clone/freeze snapshot khi nhận. Check-before/after localStorage không chứng minh transaction hai tab thật.
- B1-AC07–08/T16–17: gate cuối xanh; failure đầu phiên đã xác định thiếu await trong test. Negative/discrimination tests không có nghĩa đã áp mọi mutant lên SUT. Lint riêng không setup; owner acceptance/changelog/rollback chưa nghiệm thu.
- **Browser thật NOT_RUN**: Chrome/Firefox/WebKit desktop/mobile; cold-offline app shell/cache, refresh/back-forward, background timer/clock shifts, hai tab, quota/private mode, tải/mở report offline, Telex/VNI/composition/cursor, keyboard/screen reader/focus/contrast/axe, math/media overflow, screenshots/traces/performance. VM dùng DOM stub, không thay các kiểm tra này. Chưa thấy service worker sản phẩm; không chứng nhận cold-offline navigation.
- **Google thật NOT_RUN**: CORS/redirect/response-readback, Sheet literal/formatting, concurrent cold-sheet, permissions/quota/anti-abuse. Không dùng endpoint/account thật hoặc deploy. Collector vẫn kiểm consistency của điểm client gửi, không phải server grading, xác thực thí sinh hay bảo mật answer key; client có key nên release policy hiện chỉ là hạn chế hiển thị.
- Archive đã có dispatcher, **không còn NOT_IMPLEMENTED hoàn toàn**. Tuy vậy destination, retry budget, trạng thái bền vững/scheduled job và UX xem/tải/retry archive chưa nghiệm thu. Chưa test tất cả legacy/malformed archive, receipt persistence/quota failures, migration và nhiều tab.
- Bank/builder/JSON/report có implementation và VM tests; chưa nghiệm thu đủ taxonomy ổn định Topic/Lesson IDs, publication/version workflow, durable drafts/media, export/xóa/backup, toàn luồng report offline. Không đánh đồng subject/topic string với đủ mọi thực thể nghiệp vụ.
- **DOCX/PDF importer NOT_IMPLEMENTED**: chưa có file→IR rich text/table/image/math→preview/sửa→confirm; JSON import không thay pipeline này. Chưa có corpus text/scan/OCR/multicolumn/OMML/Unicode/provenance/confidence/corrupt/oversized thực.
- Full Git-history secret scan, dependency advisory/license/SAST, load/performance budgets, CI browser artifacts, owner milestone acceptance **NOT_RUN**. Không nghiên cứu upstream/cài tool hay chốt stack ngoài task.

## Tính năng lộ trình còn thiếu — theo ưu tiên

1. **P0/glue:** sửa F01 pin destination cùng immutable submission và F02 canonical raw/envelope đúng. Retest cả retry/fresh archive/receipt trước nghiệm thu collection.
2. **P1/glue:** sửa F03 thành durable outbox per-job, budget/backoff/in-flight nhất quán qua scan/online/reload; trạng thái local_saved/queued/sending/server_confirmed/failed trung thực; archive xem/tải/retry, quota và lost-receipt tests.
3. **P1/glue:** owner duyệt trust/collection mode/service; nếu cần điểm đáng tin, grade ở dịch vụ kiểm soát bởi owner từ snapshot/key tin cậy. Sau phê duyệt phải test Google CORS/write-readback/idempotency/concurrency/permissions thật.
4. **P1/glue:** browser E2E desktop/mobile, refresh/offline/timer/2-tabs/report, IME/a11y/math/media, CI artifacts và owner acceptance. Không dùng VM suite xanh làm nghiệm thu UI.
5. **P1/glue:** hoàn thiện taxonomy môn→lớp→chương/chủ đề→bài→mức độ, bank/builder drafts/publication/question-exam versions, stable IDs, snapshot cloning, migrations/export/xóa/backup.
6. **P2/glue:** DOCX/PDF pipeline với IR giữ rich text/bảng/hình/công thức, source/confidence/flags, preview/hiệu đính/confirm; OCR khi cần và corpus có quyền; không đoán key thiếu.
7. **P2/src/domain + glue:** F04 API inverse/limits thống nhất; version grammar/display/limits/grouping được duyệt; mẫu chuẩn THPT theo môn/năm/văn bản đã kiểm chứng tách custom-v1; security/license/performance/rollback. Class/Assignment giai đoạn sau.

## NEED_DECISION — chính sách chưa chốt, không tự chọn

Không thấy mâu thuẫn công thức điểm giữa hai hợp đồng. Các lỗi kỹ thuật F01–F03 sửa được mà không phải chờ chọn stack/chính sách. Những quyết định sau vẫn cần owner, không dùng làm lý do approve sản phẩm:

- Trust/collection: A luyện tập self-reported có nhãn giới hạn; B server grading từ snapshot/key do owner quản lý; C local/export-only tới khi duyệt service.
- Display rounding: A phân số exact làm hiển thị chính; B half-up2 chữ số kèm exact source; C precision/mode theo policy version. Không round khi chấm.
- Grammar III: A giữ charset/length-only sa-charset-v1; B duyệt numeric grammar version mới cùng migration. Không tự cấm01/--1/,5.
- Limits/grouping: A duyệt tạm1000 câu và nhóm I→II→III; B cấu hình version khác được owner xác nhận.
- Rational F04: A inverse toàn canonical output; B bound chung enforce/document ở constructor/formatter/parser, tách transport limit.
- Mẫu chuẩn: A chọn môn/năm/văn bản để kiểm chứng và xây preset; B tiếp tục custom-only với nhãn chưa hỗ trợ mẫu chuẩn.

recommended_action: giao worker đúng VÙNG sửa F01–F04, retest độc lập trên hash cố định; chưa nghiệm thu/deploy toàn sản phẩm. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật/dữ liệu giả lập, không chứa dữ liệu học sinh thật hoặc chỉ thị riêng.
