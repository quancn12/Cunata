# LC33 — Kiểm định độc lập toàn sản phẩm

**verdict: CHANGES_REQUESTED.** Có 6 findings OPEN: 1 CRITICAL, 5 MAJOR. Gate cutoff cuối: **362 tests, 361 pass, 1 fail**; typecheck và web verifier xanh. **Đọc mục “Cập nhật cutoff cuối” bên dưới: source/test được worker sửa trong lúc ghi review; các số 352/10 ở thân bài là snapshot trước đó.** Không nghiệm thu toàn sản phẩm. Handoff NEED_DECISION cho các policy chưa được owner chốt; sửa lỗi kỹ thuật không phải đợi các quyết định đó.

review_id/task_id/worker_id: LC33; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 và M1-scoring-contract v1.0, đã đọc toàn bộ; acceptance_reference: READINESS §6/B1-AC01–08/B1-T01–17; risk_level: HIGH.

## Revision, phạm vi và phương pháp

- base_commit/head_commit tại kiểm tra: `4cb362925497b80fa8c5750b35adea67277a9c72`, working tree dùng chung D:\Cunata. Đọc log/diff thật và LOOP-32; delta chưa commit: index +93/-24, collector +148/-75, domain tests +65, demoFlow +160/-2 ở cutoff. Source src/domain không đổi. Có sửa ops/workers của tiến trình khác; không hoàn tác chúng.
- Cutoff SHA256 index.html: `3AE3DF88BCCD22F0CAC05DA8AE564107A5BFEEDFE162388B8FAB032BFB755271`; apps-script/Code.js: `0CA632C42E7D4A790EAC3EB542C149CBC97D34BAC59EB47D43341E3164E23865`; demoFlow cuối: `7AE6CD8CB592B9F90FB045B9D13EFFE53860EEC38ECD797B35DD65CEAF9DE9A2`. Hai source production giữ hash trong các lần đo. demoFlow thay đổi trong phiên, nên chạy lại gate; không quy kết test count đầu phiên cho bytes cuối.
- files_reviewed: API model/index/rational/shortAnswer/validate/judge/shuffle/examMax/scoreAttempt/serialize; luồng web validation/scoring/order/input/timer → local save/restore → submit/collector → history/report/restart; JSON bank/builder và metadata; Code.js, package/tsconfigs/build script, README, assertions/harness và oracle liên quan. CSS/sample/assets được kiểm tĩnh và bằng verifier. Không tuyên bố đọc từng dòng ops/dependencies hay mọi commit lịch sử.
- Chỉ tạo review này; không sửa code/test, install, dependency, branch/worktree, commit/deploy, hay gọi Google thật. Không tìm thấy AGENTS.md trong inventory repo. Mọi probe qua PowerShell here-string → `node --input-type=module`, không tạo file phụ.
- Harness: lấy đúng function createPageContext từ demoFlow trước test LC13-F01, stripTypeScriptTypes, tạo factory với fs/vm/indexPath. Stub renderExamPane/renderPalette cho probe lifecycle, giữ logic save/restore/submit thật; Storage là Map. Đây là Node VM, không browser. Collector dùng mock getRange trả đúng cột, appendRow giữ hàng, lock/content service mock. Kết quả counterexample exit0 chỉ có nghĩa probe chạy xong, không phải acceptance PASS.

## Findings OPEN

### LC33-F01 — CRITICAL — Collector còn nhận hàng thiếu schema và xác nhận nhầm payload cùng ID

- **VÙNG chịu trách nhiệm: glue.** VERIFIED, LC32-F01 được sửa một phần.
- affected_files: `apps-script/Code.js:142–162,222–236,289–350,372–406`.
- evidence/reproduction_steps: trong collector VM, POST `{attempt_id:'missing',total:'1',maxTotal:'10'}` → NEWLY_RECORDED; exam/version rỗng, cả ba phần 0/0 nhưng tổng 1/10. POST `{attempt_id:'aliases',total:'1',maxTotal:'10',score_p1:'999',max_p1:'1'}` → NEWLY_RECORDED, H:O chứa `999,1,0,0,0,0,1,10`. Validation chỉ kiểm breakdown nếu có sections, formatter vẫn nhận alias chưa kiểm.
- Probe conflict: ghi payload ID `same`, exam A/v1, total1/max10, đầy đủ sections và raw q=1; retry cùng ID/tổng nhưng exam B và raw q=2 → ALREADY_RECORDED. Conflict check chỉ so N/O, không bind exam/version/raw/candidate/sections. Không ghi trùng hàng nhưng receipt không xác nhận đúng nội dung gửi.
- expected: Shared §2–5 yêu cầu identity/version, điểm từng phần và tổng nhất quán, retry cùng dữ liệu; actual/impact: hàng thiếu/sai dữ liệu được nhận, hoặc payload khác được báo đã ghi. Mock chứng minh sink; Google thật NOT_RUN. Đây là consistency defect ngay cả với self-reported practice, chưa bàn đến trusted grading.
- minimal_fix: canonical typed payload duy nhất; bắt buộc exam/version và ba phần; validate alias rồi loại alias trước formatter, exact rational/range/sum checks cho mọi đường; canonical fingerprint bao gồm immutable payload, reject same-ID conflict và fail closed khi đọc record lỗi. Không coi validation này là server grading.
- regression_test: hai payload thiếu schema/alias trên phải reject không append; retry nguyên payload đúng một row; cùng ID đổi exam/version/raw/section dù totals giữ nguyên phải conflict; positive repeating fraction10/3, negative malformed types/aliases/ranges/sums và lost-response retry. Sửa mock getRange hiện trả cột A cho mọi yêu cầu để thực sự test N/O.

### LC33-F02 — MAJOR — Snapshot global mới chưa pin nội dung theo từng attempt/version

- **VÙNG chịu trách nhiệm: glue.** VERIFIED, phần còn lại của LC32-F02.
- affected_files: `index.html:1695–1710,1833–1838,3354–3364,3406`.
- evidence/reproduction_steps: loadExamVersion đề CUSTOM/v1/custom-v1/sa-charset-v1, một III q/key1; đặt responses.q='1', saveLocalState. Boot context mới cùng Storage → CUSTOM, raw1 (control đã sửa). Sau đó reimport cùng exam/version/q với key2 → vẫn restore raw1, scoreAttemptLocally.total **0**, trước đó **10**. loadExamVersion ghi đè active_exam_snapshot trước resume, không phát hiện same-version content conflict.
- expected: Shared §3/5 nguồn sửa không thay nội dung chấm của attempt cũ; actual/impact: ID/version giữ nguyên nhưng key/settings có thể thay trong draft cũ. Không coi republish same ID với nội dung mới là hợp lệ; runner phải reject conflict hoặc pin snapshot đã dùng.
- minimal_fix: snapshot đề/settings bất biến theo attempt, active pointer trỏ tuple đó; phát hiện content conflict cho cùng version, cấp version mới khi publish sửa nguồn; archive đủ snapshot để phục hồi báo cáo cũ.
- regression_test: CUSTOM refresh online/offline/back-forward, reimport nguyên bản, same-ID đổi key/settings, sửa bank sau draft/final; giữ input/order/deadline và điểm cũ. Global active snapshot hiện tại không thay cho snapshot per-attempt.

### LC33-F03 — MAJOR — Retry của lượt A gửi nhầm lượt B chưa nộp sau restart

- **VÙNG chịu trách nhiệm: glue.** VERIFIED; hồi quy trong sửa LC32-F04.
- affected_files: `index.html:2826–2882,2937–2974,3284–3313`.
- evidence/reproduction_steps: đề một III q/key1; raw1; submit A, collector URL collector.invalid, fetch mock throw offline, setTimeout spy giữ callback. Gọi dispatchToServerCollector → timer đầu1000ms. restartExam tạo B; gọi callback A, drain microtask. posts chứa attempt A với total10/raw{q:'1'}, rồi **attempt B với total0/raw{}**, dù B.submitted=false. Callback gọi dispatchToServerCollector() từ state hiện hành; dispatch không kiểm submitted, không có captured payload cho timer.
- expected: Shared §3 retry đúng immutable attempt/payload, không nộp lượt mới; actual/impact: A không được retry, B phát request sai lifecycle. Với collector hiện tại B max0 bị reject; **không khẳng định B đã được ghi Google**. Khi đổi đề/restart, pending A vẫn cần được gửi dù active state đổi.
- minimal_fix: durable outbox theo attempt, callback nhận immutable outgoing record của A; chỉ enqueue final hợp lệ, in-flight guard và bounded retry metadata per-attempt persisted; online wake không reset budget toàn cục cho mọi bài. Guard submitted một mình tránh gửi B nhưng chưa cứu retry A.
- regression_test: offline A→restart B→callback phải POST A với bytes không đổi, B không gửi; switch exam, late ack A không finalize B, hai dispatch đồng thời, reload giữa backoff, retry limit và quota. Hiện có backoff1/2/4/8/16s và online listener: không còn ghi là chưa có lịch retry; retry metadata/outbox vẫn chưa bền vững.

### LC33-F04 — MAJOR — Difficulty không tin cậy vẫn thành active HTML trong builder

- **VÙNG chịu trách nhiệm: glue.** VERIFIED sink, tiếp tục LC32-F06. Browser execution NOT_RUN.
- affected_files: `index.html:3533–3555,4031–4033` và đường JSON builder import.
- evidence/reproduction_steps: đề JSON custom-v1 hợp lệ có một III q/key1, difficulty=`<img src=x onerror="globalThis.XSS=1">`; domain validation không chặn metadata này. Đặt chính đề đó vào **builderExamState**, renderBuilderForm; builderQuestionsContainer.innerHTML.includes(rawPayload) → **true**. Bank list có escapeHtml nhưng builder metaBadge fallback q.difficulty không escape.
- expected: Shared §4/7 dữ liệu import không tin cậy chỉ là text đã kiểm/escape; actual/impact: img/event handler đi vào HTML sink, đường XSS qua file được chia sẻ có thể tác động dữ liệu local. VM không chạy handler, không khẳng định đã thực thi JavaScript hoặc trích dữ liệu.
- minimal_fix: escapeHtml toàn difficulty label sau mapping hoặc dùng textContent; kiểm enum metadata khi import và vẫn escape ở sink.
- regression_test: exam JSON và bank→reuse→builder với payload trên; assert escaped text, browser không tạo img/không đổi marker, controls ba difficulty hợp lệ và unknown text. Probe đầu gán nhầm builderExam thay vì builderExamState cho false; đã sửa harness và kiểm đúng state/sink, không báo false đó là fix.

### LC33-F05 — MAJOR — Gate đỏ và harness restore không cô lập negative controls

- **VÙNG chịu trách nhiệm: glue.** VERIFIED.
- affected_files: `test/e2e/appsScriptCollector.test.ts:173–180,224–310`; `test/e2e/demoFlow.test.ts:894–945,1046–1139,1317–1340,1402–1422,3654–3733`.
- evidence/reproduction_steps: npm test cuối exit1, 362 tests/352 pass/10 fail. Bốn collector failures: duplicate/form fallback payload thiếu score nay bị reject, missing-ID đổi mã lỗi, lock-busy fixture gặp MISSING_SCORE trước lock. Mock getRange bỏ startCol nên không mô phỏng conflict check N/O đúng.
- Sáu web failures: canonical1/2 positive control; valid PartII positive control; foreign statement IDs; missing raw responses; custom boot `container.querySelector is not a function`; restart reload `optGrid.setAttribute is not a function`. Hai TypeError cuối là API DOM mock thiếu, không phải chứng cứ browser hỏng. Hai negative restore tests thay draft sau khi đã load final hợp lệ; loadLocalState ưu tiên immutable final nên control sau có thể kiểm nhầm record. Không kết luận source validator nhận foreign IDs chỉ từ những assertion này.
- expected: Shared §7/10 và B1-AC07 cần gate chạy thật xanh, negative tests chạm đúng record; actual/impact: gate đỏ, không thể dùng suite này để nghiệm thu regression. Cả hai positive controls đỏ cần trace identity/final/envelope riêng trước khi quyết định sửa source hay fixture; root cause đầy đủ của chúng chưa xác minh.
- minimal_fix: mỗi case context/storage riêng hoặc mutate đúng finalKey, giữ full identity/envelope từ API thật; DOM mock đúng API cần dùng hoặc test lifecycle tách render có browser test bù; collector fixtures hợp lệ và getRange đúng cột. Không đổi expectation để chấp nhận mất bài/nhận malformed payload.
- regression_test: tất cả10 tests phải pass với negative controls thực sự kiểm candidate record, valid restore vẫn pass; chạy npm test, typecheck, verifier đúng hash cuối. Không dùng chỉ Selected-Test PASS thay gate đầy đủ.

### LC33-F06 — MAJOR — Header Sheets được ghi trước validation và ngoài ScriptLock

- **VÙNG chịu trách nhiệm: glue.** VERIFIED unprotected write; race Google thật NOT_RUN.
- affected_files: `apps-script/Code.js:109–116,201–206,357–369`.
- evidence/reproduction_steps: mock sheet rỗng với appendRow ghi lại trạng thái locked; doPost đầu tiên gọi ensureHeaderRow ở đầu hàm. Probe ghi nhận `unlocked header writes: ['attempt_id']`, rồi mới tryLock. Nhánh này cũng chạy trước parse/validate, kể cả request invalid. ensureHeaderRow còn được gọi lần nữa bên trong lock.
- expected: Shared §3/7 tính nhất quán khi 2–3 người đồng thời, mọi check-empty+append dùng chung lock; actual/impact: cold-sheet initialization có đường race hai request cùng thấy rỗng rồi append hai headers, cả request bị reject có thể làm thay đổi Sheet. Không khẳng định đã tái hiện hai headers trên Google.
- minimal_fix: bỏ ensureHeaderRow ngoài lock; chỉ init header và lookup/append sau payload validation và tryLock thành công.
- regression_test: invalid request và lock-failure trên sheet rỗng không append; spy đảm bảo mọi append giữ lock; deterministic interleaving hai cold requests chỉ một header và hai attempt rows; integration đồng thời thật khi endpoint thử được duyệt.

## Retest LC32 và checks_run

- LC32-F01 PARTIAL: total/max alias conflict, numeric attempt ID và partial sections được siết; bỏ qua sections/identity và payload conflict vẫn còn F01.
- LC32-F02 PARTIAL: CUSTOM boot+raw control nay qua probe, immutable version conflict còn F02.
- LC32-F03 FIX VERIFIED ở probe submit với FOREIGN/BOGUS: serverConfirmed=false; shared receipt validator được dùng restore/submit/dispatch. Không giữ finding cũ như chưa sửa.
- LC32-F04 PARTIAL: có lịch backoff/online wake, nhưng F03 và durable outbox còn thiếu.
- LC32-F05 FIX VERIFIED trong Storage probe: restart giữ final với raw q=1. Chưa có UI duyệt/tải/gửi mọi archive; không coi retention bytes là hoàn thiện archive recovery.
- LC32-F06 OPEN: F04 tái lập mới.

Environment: Windows PowerShell, Node24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Output nằm trong transcript, không ghi log ngoài scope.

| Command/check | Exit | Kết quả / giới hạn |
|---|---:|---|
| npm test, lần đầu | 1 | Gate đỏ; output dài bị truncate nên không dùng count lần này làm cutoff. |
| npm test, chạy lại sau thay đổi demoFlow; cuối lọc summary stdout | 1 | **362 tests,58 suites,352 pass,10 fail,0 cancelled/skipped/todo; duration724.1366ms**. Lần trước cùng counts, duration833.1452ms. Chạy lại vì test file thay đổi, không coi pass lịch sử355 là hiện tại. |
| npx --no-install tsc -p tsconfig.json | 0 | Không diagnostics; compiler có sẵn, không dùng NOT_RUN lịch sử trong M1. |
| npx --no-install tsc -p tsconfig.web.json | 0 | Không diagnostics; noEmit/include src/scripts/test, không typecheck inline HTML hoặc Google runtime. |
| node scripts/build.js | 0 | 7 assets; index248606 bytes, collector18043 bytes; sample8 câu schema valid, CSS link/collector syntax. Verifier tĩnh, không bundling/render/deploy. |
| python -B test/oracle/oracle.py --check | 0 | 11 pass,0 fail/skip;1632 fixture cases,5849 maxima configurations,9 negative controls; seed20261114; duration_s1.0102. Independent oracle, không cộng vào npm count. |
| Node stdin domain/web differential trên fixtures | 0 | **1632 cases** total/max domain đúng oracle, DTO roundtrip total đúng; web total/max và từng phần score/max exact fraction đúng oracle. DTO probe này chỉ so total, không tuyên bố deepEqual toàn DTO. |
| Node stdin lifecycle/receipt/retry/metadata probes | 0 | CUSTOM boot/raw và final retention controls; conflict key10→0; forged receipt rejected; old retry gửi new unsubmitted B; active markup true. Counterexamples, không PASS acceptance. |
| Node stdin collector với column-aware Sheet mock | 0 | Missing identity/sections accepted; alias999/1 accepted; same-total changed exam/raw được ALREADY_RECORDED; header write ngoài lock. Không network/Google. |
| git diff --check -- index.html apps-script/Code.js src test scripts styles | 0 | Chỉ cảnh báo LF→CRLF, không whitespace errors ở cutoff. |
| git status/log/rev-parse/diff/inventory/hash; runtime versions | 0 | Cutoff và working tree trên; không mutation của reviewer ngoài review. Inventory có yêu cầu path web không tồn tại trả rg exit2; đã dùng index.html, không phải build failure. |

## coverage_gaps và mức đáp ứng contract

- B1-AC01–03/T01–09/T15: không tìm counterexample số học trong fixtures đã chạy; I quarter, II lookup/null, III exact charset/length, maxima5/15/16/repeating và domain/web fractions có evidence. Không suy diễn toàn sản phẩm đúng từ số lượng test.
- AC04–06/T10–14: domain IDs/shuffle/validation/serialization đọc lại, source không delta; F02 là khoảng trống version pin của web. Non-transactional localStorage nhiều tab/quota/private mode/migration chưa nghiệm thu. Check-then-write không phải transaction. Domain rational parse giới hạn200 ký tự/precision100 cần ghi rõ trong API/owner limits.
- AC07–08/T16–17: gate fail F05; mutation discrimination assertions hiện có không đồng nghĩa đã instrument/chạy toàn bộ mutants. Display rounding policy chưa được duyệt; formatScore/toFixed không chứng minh policy approved.
- Browser thật **NOT_RUN**: Chrome/Firefox/WebKit, mobile/desktop screenshots/traces, offline cold boot/cache, background timer/clock shifts, hai tab scheduling, quota, IME Telex/VNI/cursor/composition, keyboard/AT/focus/contrast/axe, media/math overflow, tải và mở HTML/PDF offline thật. VM DOM mocks không thay các checks đó.
- Google integration **NOT_RUN**: deployment/CORS/redirect, write/readback và receipt thật, literal cell conversion, cold sheet concurrency/abuse/resource limits. Review không deploy hay POST dịch vụ thật; chưa có evidence end-to-end production.
- Reports và bank/builder JSON đã có: score/max từng phần/tổng, raw/key/explanation/time, download/print, settings/history/filter/reuse/edit. Không ghi là hoàn toàn chưa implement. Release policy auto-reveal khi submit sớm chưa kiểm browser; keys vẫn ở client, không đạt hidden-answer trusted exam chỉ bằng ẩn UI.
- Taxonomy còn thiếu Lesson/Topic IDs ổn định, builder draft recovery/version publication và archive/media migration được nghiệm thu. Full secrets/history/dependency advisory/license/SAST scan, performance/load budgets, rollback/CI browser và owner milestone acceptance **NOT_RUN**. Không nghiên cứu/cài stack mới trong LC33.

## Lộ trình thiếu theo thứ tự ưu tiên

1. **P0/glue:** sửa collector schema/payload binding F01 và metadata HTML F04; khóa snapshot per-attempt F02; sửa retry sai lượt F03; đưa gate F05 về xanh bằng negative controls đúng và positive controls thực; bỏ header write ngoài lock F06.
2. **P1/glue:** durable immutable outbox/archive explorer/retry, per-attempt budget/backoff/in-flight/online wake, archive report/export và recovery cả attempt không active; retention/xóa/xuất/backup rõ ràng. Restart hiện giữ final nhưng chưa tự đồng bộ archive cũ.
3. **P1/glue:** owner chọn trust mode, endpoint ownership/anti-abuse, rồi Google write/readback/CORS/receipt integration thử thật; trusted mode phải server grade từ snapshot/key phía owner, không tin điểm/key client.
4. **P1/glue:** browser desktop/mobile/offline/two-tabs/timer/lost receipt/quota/report download, Vietnamese IME/a11y/media/math; CI evidence và giới hạn no-login/maxAttempts minh bạch.
5. **P1/glue:** taxonomy môn→lớp→chương/chủ đề→bài→mức độ, version/publish/archive ổn định, durable builder draft, media và migration/export/import/backup.
6. **P2/glue:** DOCX/PDF importer **NOT_IMPLEMENTED**: file→IR paragraph/table/image/OMML/LaTeX/provenance/confidence→preview/sửa→confirm; corpus text/scan/OCR/multi-column/corrupt/oversized, không đoán key. JSON import không thay Word/PDF import.
7. **P2/glue + src/domain khi thêm rule:** mẫu chuẩn theo môn/năm/văn bản đã xác minh, tách custom-v1; policy/limits/rounding versions, security/performance/license, changelog/rollback và owner nghiệm thu; Class/Assignment giai đoạn sau.

## NEED_DECISION

Không thấy mâu thuẫn scoring mới giữa hai contract. Không tự chốt các điểm sau:

- Trust/collector: **A** luyện tập self-reported có nhãn giới hạn tin cậy; **B** server grade từ immutable owner exam/key; **C** local/export-only đến khi protocol được duyệt. Consistency fixes vẫn cần cho A.
- Display rounding: **A** exact fraction chính; **B** half-up hai chữ số kèm exact source; **C** precision/mode theo policy version owner quy định.
- Short-answer grammar: **A** giữ charset/length-only sa-charset-v1; **B** owner định numeric grammar và version/migration mới. Không tự cấm --1/,5/01 theo policy hiện tại.
- Limits/grouping: **A** phê duyệt tạm1000 câu và nhóm I→II→III; **B** chọn limits/grouping cấu hình theo version khác. Preset chuẩn cần owner chọn môn/năm/văn bản, không gắn custom-v1 thành mẫu chuẩn chung.

## Cập nhật cutoff cuối — thay thế trạng thái gate/hash trước đó

Trong lúc reviewer hoàn tất file, worker cập nhật source và harness. Không sửa file của worker để đóng băng; dùng cutoff mới sau retest. HEAD vẫn `4cb362925497b80fa8c5750b35adea67277a9c72`.

- SHA256 mới: index.html `22E6F03C193DDD44BB8FA80FC3E5171B43FBD729D5D28A0A7E391223A4B10CAC`; Code.js `C6E0C1031D24B0C1ED9E4637E401721A00588703D67E42FE81A47329CD19F155`; demoFlow `A52E6F0A8D7056E2FEEDB3A1C4D805A66E5A06B85C145861C065E4DFA3AAC36C`.
- `npm test` chạy lại **exit1, tests362/suites58/pass361/fail1/cancelled0/skipped0/todo0, duration736.7032ms**. Chỉ còn `test/e2e/appsScriptCollector.test.ts:224`, “doPost preserves idempotency on duplicate attempt_id and returns ALREADY_RECORDED”, actual.success=false, expected=true. Đây là kết quả cutoff cuối, không phải 10 failures cũ.
- Cả hai lệnh `npx --no-install tsc -p tsconfig.json` và `-p tsconfig.web.json` chạy lại exit0, không diagnostics. `node scripts/build.js` chạy lại exit0: index248881 bytes, collector18657 bytes, 7 assets/sample8 câu valid/syntax valid. Vẫn chỉ verifier tĩnh.
- Delta bổ sung: loadLocalState không scan các key khác nếu current draft/final có sẵn; DOM mock bổ sung insertBefore/querySelector/setAttribute/getAttribute. Sáu web failures trước đã hết trong gate. Collector khôi phục MISSING_ATTEMPT_ID cho absent ID, đổi gating thành hasExam/score condition và score validation optional. Ba collector failures khác hết. Không coi các case đã xanh là OPEN riêng; F05 **thu hẹp** còn full gate đỏ do test224 và mock getRange thiếu column semantics. Phân tích negative-control isolation ở thân bài là debt/giới hạn, không phải tuyên bố sáu tests đó còn đỏ.
- Chạy lại probes trên source mới, exit0: same-version key conflict vẫn cho raw1/key2→total0; builder active markup=true; retry A sau restart vẫn POST B với B.submitted=false/raw{}; collector missing exam/sections vẫn NEWLY_RECORDED; alias999/1 với tổng1/10 vẫn NEWLY_RECORDED; đổi exam/raw cùng ID/totals vẫn ALREADY_RECORDED; header append ngoài lock vẫn1. **F01–04 và F06 vẫn OPEN được xác minh mới**, không chỉ suy từ bytes cũ. Mỗi probe là quan sát counterexample, không acceptance pass.
- Line mapping cutoff mới: F01 collector validation `Code.js:237–365`, conflict `391–421`; F02 loadExamVersion `index.html:3358–3368`; F03 dispatch/retry `2830–2980`, restart `3275–3317`; F04 sink `4035–4037`; F06 ngoài lock `Code.js:201–206`, bên trong `384`. Những vị trí ở thân bài thuộc snapshot đầu, dùng mapping này khi sửa.
- Oracle/differential1632 trước đó áp dụng source domain không thay và web scoring không thay trong delta mới; không gọi đó là chạy lại toàn1632 trên hash mới. Browser/Google thật và các coverage_gaps khác giữ NOT_RUN như trên.

**Thay đổi sau cutoff đã kiểm:** kiểm hash ngay trước bàn giao thấy Code.js đã chuyển tiếp sang `9503BD7CCCF560B5488E9EA36C23CE3CDF18BD3766F3C4D6566A16A5D660909D`; index và demoFlow còn đúng hash trên. Revision collector mới này **NOT_REVIEWED / NOT_TESTED** trong LC33; các kết quả361/1 và probes áp dụng cutoff C6E0… đã nêu, không chứng nhận bytes9503… hay các sửa tiếp theo. Cần vòng retest sau khi điều phối khóa revision, không tiếp tục đuổi working tree đang đổi vô hạn.

recommended_action: giao worker glue xử lý F01–06 theo cutoff đã kiểm, giữ ownership, chạy gate trên hash cố định và retest probes; chưa merge/nghiệm thu sản phẩm. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật, không nội dung chỉ thị riêng hay dữ liệu học sinh thật.
