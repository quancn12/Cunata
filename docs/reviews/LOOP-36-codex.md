# LC36 — Kiểm định độc lập toàn bộ sản phẩm

review_id/task_id: LC36; reviewer: Codex; date: 2026-11-14, Asia/Bangkok.
requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6 (B1-AC01–08, B1-T01–17).
base_commit/head_commit: `07087817f452b0d423a962992147b22d1368f776` + working-tree delta vòng 29. Không tạo branch/worktree, không commit, không sửa code.

**verdict: CHANGES_REQUESTED; risk_level: HIGH.** Có 2 CRITICAL, 2 MAJOR, 1 MINOR mở; F05 đã đóng sau retest. Domain và web scorer khớp 1.632 fixtures độc lập; chưa đủ điều kiện nghiệm thu toàn sản phẩm. Đường refresh/save/reimport của LC35-F01 đã sửa.

## Snapshot, diff và phạm vi

- Đã đọc báo cáo LC35, git log/show/status/diff; đối chiếu thay đổi chưa commit ở `index.html`, `apps-script/Code.js`, hai test VM. Worker tiếp tục thay đổi trong phiên: gate đầu 372 tests, gate cuối 376. Báo cáo gắn source hash dưới đây, không coi HEAD đơn lẻ là toàn bộ source đã kiểm.
- SHA256 `index.html`: `69B3B7C4F10D50DFDFD7677FD2BEA05A11446E357E87F1BFDAA5988E63392CC3`.
- SHA256 `apps-script/Code.js`: `6A541E94D138C53686411F267A017BF37369EA4ADAC7F2FA4C25B39E8BB94094`.
- SHA256 `src/domain/rational.ts`: `068B140C1D0DF59AE759B6829AE961AFA2034C2A5D1F060A26D8BDE8E4AFB886`.
- SHA256 `test/e2e/demoFlow.test.ts`: `59D9105EC11A5BE554ACC1D25F512C7C43AFF4B15139CF8AB6F3E5B638B813FA`; `test/e2e/appsScriptCollector.test.ts`: `94A307CD724EEB5264284EDD8BA49119A50BDD9128F440D914DE3A9D42E60F6D`.
- Cutoff là các hash trên và gate cuối376 tests/868.5909ms. Worker vẫn sửa cùng tree sau cutoff; thay đổi mới hơn cần review riêng, không tự động được chứng nhận. Đã thấy init thêm guard gọi `syncUnconfirmedFinalSubmissions`, nhưng snapshot đọc lúc đó chưa có định nghĩa dispatcher; guard đơn lẻ chưa chứng minh outbox hoàn thiện. Probes chạy trước delta cuối được ghi riêng, không tuyên bố tất cả probe dùng cùng hash.
- files_reviewed: `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; web import/init/restore/save, shuffle, timer, submit/report, retry/receipt, bank/builder; collector, manifest/README; domain/oracle/acceptance và VM tests liên quan; package/tsconfig/build script. Delta sản phẩm tập trung glue, không có dependency mới trong delta đã xem. File điều phối chỉ kiểm status, không đọc prompt riêng worker khác.
- Chỉ tạo `docs/reviews/LOOP-36-codex.md`. Không cài dependency, không gọi Google, không deploy. Build hiện tại là static verifier, không phải bundler hay browser render.

## Môi trường tái hiện

Probes chạy qua PowerShell here-string → `node --input-type=module`, toàn bộ trong RAM, không thêm file test. Command/output/exit thực nằm trong transcript LC36.

Web: lấy nguyên `createPageContext` từ `test/e2e/demoFlow.test.ts` (từ khai báo hàm tới `it` kế tiếp), dùng `node:module.stripTypeScriptTypes` trong RAM với `fs`, `vm`, `indexPath='index.html'`. Mỗi page dùng VM riêng; page refresh chia sẻ Map localStorage. Chỉ stub `renderExamPane`, `renderPalette`; helper vốn stub `showReportView`. Giữ lifecycle/storage/scoring/dispatcher thật. Đây là VM tests, không phải browser E2E.

Đề tối thiểu: `{examId:'A',examVersionId:'v1',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'III',questionVersionId:'q',answerKey:'1'}]}`. Raw `q='1'` cho 10/10. Fetch spy không gửi mạng; setTimeout giữ callback để kiểm lịch retry.

Collector: chạy nguyên `apps-script/Code.js` trong VM; Sheet mock lưu hàng 17 cột và slice đúng row/column/numRows/numCols, lock có cờ và assert append chỉ khi đã lock. Payload chuẩn: `attempt_id:'A',exam_id:'E',exam_version_id:'v1',total:'1',maxTotal:'10',sections:{I:{score:'0',max:'0'},II:{score:'0',max:'0'},III:{score:'1',max:'10'}},raw_answers_json:{q:'1'},policy_version:'custom-v1'`. Không nhầm mock với Google Sheets thật.

## Findings

### LC36-F01 — CRITICAL — Retry gửi bài A tới collector của đề B

- **VÙNG chịu trách nhiệm: glue. VERIFIED bằng fetch spy; không có request mạng thật.**
- affected_files: `index.html:2847–2855,2917–2921,2982–2985,3000–3003`.
- evidence/reproduction_steps: load đề A có `collectorUrl='https://owner-a.invalid/collector'`; trả lời q=1 rồi `submitExam()`. Fetch trả `{ok:false}`, giữ callback retry. Load đề B khác examId, URL `https://owner-b.invalid/collector`, chưa submit B. Chạy callback A, đợi microtasks. POST đầu tới owner-a; POST retry **tới owner-b nhưng body vẫn exam_id A, attempt_id A, raw q=1 và điểm10**. Assert 2 POST và B.submitted=false; probe exit0. `specificPayload` giữ nội dung nhưng URL được đọc lại từ currentExam mỗi lần gọi.
- expected: Shared §3/4: immutable submission phải gửi tới dịch vụ của đúng chủ sở hữu/cấu hình đã chọn cho submission đó. actual/impact: chuyển đề giữa backoff làm dữ liệu thí sinh/bài làm bị gửi nhầm collector; owner A không nhận retry, owner B có thể nhận dữ liệu A. Chỉ cần các đề cấu hình endpoint khác nhau, không cần B đã nộp. Không khẳng định đã xảy ra rò rỉ trên Google production.
- minimal_fix: capture và lưu bền vững job gồm destination đã validate/được cấu hình, identity, payload immutable, budget/status; callback dùng đúng destination của job, không đọc currentExam/window global để định tuyến lại job cũ. Không chỉ capture body.
- regression_test: A fail→load B khác endpoint→retry A vẫn chỉ tới endpoint A; thay cả window endpoint khi có override; receipt A không sửa B; fresh-context outbox cũng giữ destination; B submit gửi endpoint B riêng.

### LC36-F02 — CRITICAL — Canonical raw làm mất khác biệt giữa các chuỗi đáp án

- **VÙNG chịu trách nhiệm: glue. VERIFIED trên collector hash cuối.** Các case thiếu raw/đổi policy cũ đã được sửa thành conflict; canonicalizer mới tạo collision.
- affected_files: `apps-script/Code.js:94–113,600–635`.
- evidence/reproduction_steps: dùng payload chuẩn, môi trường mới cho từng cặp. Ghi raw `{q:'1'}` rồi retry cùng ID raw `{q:'1 '}` → **ALREADY_RECORDED**, Sheet vẫn `{q:'1'}`. Ghi `{q:'-0'}` rồi retry `{q:'0'}` cũng ALREADY_RECORDED, Sheet vẫn `-0`. Hai assertions exit0 trên hash cuối. Giữ điểm request giống nhau để cô lập identity, không giả định client chấm hai raw giống nhau.
- expected: Shared §2/3 yêu cầu giữ chính xác từng ký tự; raw khác phải conflict. actual/impact: `canonicalizeJson` trim và JSON.parse mọi string leaf, làm `'1 '` thành1 và `'-0'` thành0. Request có raw chưa lưu vẫn được success và frontend có thể đánh dấu confirmed. Lỗi consistency này độc lập quyết định server grading.
- minimal_fix: parse JSON string một lần tại boundary nếu protocol hỗ trợ; validate shape. Canonicalizer chỉ sort object keys, giữ nguyên type/value của string leaf bằng JSON.stringify. Không trim, parse số hay normalize raw III; bind envelope/fingerprint đầy đủ.
- regression_test: `'1'`↔`'1 '`, `'-0'`↔`'0'`, `'1,5'`↔`'1,50'`, string↔number, null↔chuỗi rỗng; reordered keys vẫn duplicate; missing raw/policy khác/read failure vẫn reject; conflict không đặt serverConfirmed.
- positive controls cuối: missing raw và changed policy → PAYLOAD_CONFLICT; reordered keys và accepted2/2→retry1 → ALREADY_RECORDED. Không giữ kết luận counterexample cũ còn mở sau sửa.

### LC36-F03 — MAJOR — Map retry mới vẫn kế thừa ngân sách của lượt trước qua global fallback

- **VÙNG chịu trách nhiệm: glue. VERIFIED trên source hash cuối có collectorRetryMap.**
- affected_files: `index.html:1685–1687,2915,2978–3003,3398–3513`.
- evidence/reproduction_steps: submit A, fetch luôn fail; chạy lần lượt5 callbacks, drain microtasks→6 POST A, hết timers, global counter5. `loadExamVersion(B)` khác examId, trả lời/nộp B→1 POST B thất bại, **0 timer retry B**. Không gán counter5 bằng tay. Probe mới chạy sau khi worker thêm Map vẫn exit0 xác nhận lỗi.
- expected: retry budget của B bắt đầu0, first failure lên lịch1000ms độc lập A. actual/impact: `collectorRetryMap.get(B)` undefined fallback `collectorRetryCount=5`; bài mới mất mọi retry sau một lỗi tạm thời. Map chưa loại được root cause LC35-F03.
- minimal_fix: key job đầy đủ và default0 cho job chưa có; bỏ cross-attempt fallback. In-flight guard, budget và backoff theo job; success A không reset/revive budget B. Chỉ reset global khi switch không đủ nếu callback A còn chạy.
- regression_test: A hết5 retries→B fail phải có timer1000ms; A/B callbacks xen kẽ, A success khi B retry; online/manual dispatch không nhân nhiều chains; cùng job không vượt budget.

### LC36-F04 — MAJOR — Archive chưa có dispatcher khôi phục sau reload

- **VÙNG chịu trách nhiệm: glue. VERIFIED bằng fresh VM chia sẻ store.** LC35-F04 OPEN.
- affected_files: `index.html:1696–1754,2859–2867,3009–3019,3314–3377`.
- evidence/reproduction_steps: submit B offline/fetch fail→final unconfirmed có trong localStorage. `restartExam()` tạo active mới chưa submit; hủy ngữ cảnh cũ như reload, tạo page mới chia sẻ store, cấu hình collector rồi `await initExam(); await dispatchToServerCollector()`. Final B vẫn tồn tại nhưng **0 POST**, active mới chưa nộp. Callback RAM của page cũ không được chạy sau reload.
- expected: Shared §3: submitted/queued jobs phải có đường khôi phục và retry. actual/impact: giữ archive bytes chưa đồng bộ bài cũ; online handler và dispatcher chỉ xét active submitted. Học sinh làm lại có thể bỏ bài đã nộp vĩnh viễn ngoài collector.
- minimal_fix: durable outbox duyệt submitted unconfirmed độc lập active attempt, giữ endpoint/body/status/budget; resume ở init/online, thao tác xem/tải/retry archive. Chỉ xác nhận/xóa job khi receipt đúng đã được lưu bền vững.
- regression_test: fail A→restart B→fresh context→online gửi A, không gửi B chưa submit; nhiều archives, lost receipt, reload giữa sending, hết budget/manual retry, quota error; receipt A không đổi B. Sau VM cần browser reload/offline thật.

### LC36-F05 — CLOSED — Conflict giả do JSON key order và phân số

- **VÙNG chịu trách nhiệm: glue. FIX VERIFIED trên collector hash cuối.**
- Probes đầu phiên tái hiện LC35-F05: reordered keys và2/2→1 đều conflict. Sau sửa gcd/canonical comparison, chạy lại cả hai → ALREADY_RECORDED. Không còn tính mục này là finding mở. Collision làm mất literal raw được tách F02.

### LC36-F06 — MINOR — Public rational parser vẫn không nghịch đảo đủ formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED.** LC35-F06 OPEN.
- affected_files: `src/domain/rational.ts:120–145`.
- evidence/reproduction_steps: public API `const s=toFractionString(rational(10n**200n));` cho canonical201 ký tự; `parseFractionString(s)` ném SyntaxError do limit200. Assert length201 và assert.throws pass, probe exit0.
- expected: M1 §4.1 parser là nghịch đảo chặt formatter. actual/impact: roundtrip thất bại ở miền public API đã chấp nhận; không phát hiện ảnh hưởng điểm đề≤1000 câu.
- minimal_fix: inverse toàn canonical output hoặc owner duyệt/enforce bound chung constructor/formatter/parser. Bound untrusted transport giữ riêng; không tự bỏ mọi resource limit.
- regression_test:199/200/201 ký tự, tử/mẫu lớn, malformed/noncanonical; nếu chọn bound chung, test cả hai chiều theo policy đó.

## Retest LC35 và giới hạn snapshot

| Finding cũ | Kết quả LC36 |
|---|---|
| F01 refresh/save mất snapshot | FIX VERIFIED cho counterexample chính: load/save→fresh init→save một lần→reimport key2 vẫn cùng attempt/điểm10, draft có snapshot. Không tiếp tục báo BLOCKER cũ. |
| F02 false confirmation | PARTIAL: read failure/raw omission/policy mismatch đã chặn; canonical raw collision mới là F02. |
| F03 retry budget | OPEN F03; đã re-probe bản có Map, fallback global vẫn làm B hết budget. |
| F04 archive | OPEN F04, fresh context vẫn0 POST. |
| F05 canonical payload | FIX VERIFIED cho reordered keys và fractions; xem collision F02. |
| F06 rational inverse | OPEN F06. |

Bổ sung snapshot API: `loadExamVersion(ex)` vẫn giữ reference đầu vào. Sau load, raw1 chấm10; sửa `ex.questions[0].answerKey='2'` qua reference ngoài thì chấm0. Probe xác nhận API aliasing, nhưng **chưa chứng minh builder/import UI hiện hành gây mutation reference đó**; builder export đang clone. Không gộp bằng chứng API này thành kết luận lỗi refresh cũ còn tồn tại. Nên clone/freeze snapshot ngay khi nhận vào và regression caller-mutation. Legacy records không còn snapshot đáng tin, root-level settings/identity tương thích và mọi lịch hai tab chưa được nghiệm thu đầy đủ.

## checks_run

Windows/PowerShell; Node24.14.0, npm11.9.0, Python3.11.0, TypeScript local pin7.0.2; cwd D:\Cunata. Không dùng NOT_RUN tsc cũ trong M1 vì hiện tool đã có. Artifact bằng chứng: stdout/exit trong transcript LC36; không tạo log ngoài scope.

| Command/check | Exit | Kết quả thực tế |
|---|---:|---|
| `npm test` lần đầu |0|372 tests/59 suites, pass372/fail0; cancelled/skipped/todo0;873.3127ms. |
| `npm test \| Select-Object -Last 10` trong lúc worker đang đổi source/tests |1|Output bị tail, thấy assertion actual8/expected10; không giữ đủ tên test/count. **Lượt này FAIL, không đổi thành PASS và không suy đoán nguyên nhân.** |
| Capture toàn output trong RAM: `$out=npm test 2>&1; $testExit=$LASTEXITCODE; …; exit $testExit` |0|376 tests/59 suites, pass376/fail0; cancelled/skipped/todo0;1021.2501ms. |
| Chạy thêm3 lần `npm test`, kiểm riêng `$LASTEXITCODE` mỗi lượt để xác minh failure chưa rõ |0/0/0|Mỗi lượt376 tests/59 suites, pass376/fail0, cancelled/skipped/todo0;792.1828/804.963/858.2115ms. Gate cuối xanh; lỗi một lượt trước chưa có root cause, không xóa khỏi evidence. |
| `npx --no-install tsc -p tsconfig.json` |0|Ba lần, không diagnostics. |
| `npx --no-install tsc -p tsconfig.web.json` |0|Ba lần, không diagnostics; không chứng nhận mọi inline JS/DOM/Google API. |
| `node scripts/build.js` |0|Ba lần;7 assets, sample8 câu schema hợp lệ, CSS link và collector syntax. Gate cuối index254144 bytes, collector30178. Static verifier, không render/deploy. |
| `python -B test/oracle/oracle.py --check` |0|11 tests/pass11/fail0;1632 cases,5849 maxima configs,9 negative controls; seed20261114;1.2047s toàn check. Oracle độc lập, không cộng vào npm count. |
| Node stdin: domain/web differential + DTO |0|1632 fixtures, compare total/max và score/max cả3 phần của domain lẫn inline web scorer với expected oracle; deepEqual DTO→JSON→parse với toàn ScoreResult. |
| Node stdin: snapshot/retry/archive/rational |0|Refresh-save-reimport control pass; caller alias10→0; A6/B1 retry bug; fresh archive0 POST; canonical201 parser reject. |
| Node stdin: collector controls/counterexamples |0|Read-error fix, duplicate/conflict/lock controls và F02/F05 thực sự tái hiện. |
| Retest collector sau delta cuối |0|Ca cũ đã sửa; raw1/1-space và -0/0 vẫn nhận duplicate sai. Hash collector6A541E94…94094. |
| `npm test` sau delta cuối |0|376 tests/59 suites, pass376/fail0, cancelled/skipped/todo0;868.5909ms. |
| Node stdin: destination drift |0|A body sang B URL sau switch, B chưa submit; không request thật. |
| Node stdin: re-probe retry sau Map |0|A6 POST→B1 POST→0 timers; xác nhận đúng source mới. |
| `git diff --check -- index.html apps-script/Code.js src test` |0|Không whitespace errors trong phạm vi code/tests đã kiểm. |
| git status/log/show/diff/rev-parse, SHA256 và đọc contracts/source/tests |0 cho lệnh hợp lệ|Xác minh delta/hash, không lấy thông điệp gate của commit thay test thật. |

## coverage_gaps

- B1-AC01–03/T01–09/T15: exact rational, II1296 tổ hợp, III exact/Unicode/whitespace, maxima5/15/16/repeating/thresholds đã có unit/oracle/differential thực; corpus hữu hạn không chứng nhận mọi input.
- B1-AC04–06/T10–14: validation/shuffle/serialization/properties chạy; snapshot chính đã retest, aliasing và legacy/migrations còn giới hạn nêu trên. LocalStorage check-before/after-write không là transaction liên tab.
- B1-AC07–08/T16–17: gate cuối xanh nhưng có một npm run thất bại chưa định danh/root cause; cần lưu full failure nếu tái diễn. Discrimination tests không đồng nghĩa đã áp mọi mutant lên code SUT; lint riêng chưa setup. Owner acceptance/changelog/rollback chưa nghiệm thu.
- **Browser thật NOT_RUN:** Chrome/Firefox/WebKit desktop/mobile, cold-offline cache (chưa thấy service worker sản phẩm), background timer/clock shifts, refresh/download report offline, hai tab, quota/private mode, Telex/VNI/composition/cursor, keyboard/screen reader/focus/contrast/axe, math/media overflow, screenshot/trace. VM stubs không kiểm được DOM layout/IME/cache.
- **Google thật NOT_RUN:** CORS/redirect/receipt readback, Sheets formatting/literal strings, concurrent cold-sheet, deployment permissions/quota/anti-abuse. Không có live endpoint đã kiểm chứng, không deploy/POST. Collector chỉ kiểm consistency, vẫn tin điểm client; không chứng nhận trusted grading, danh tính hoặc giấu đáp án trước người có thể đọc client.
- Collector raw/time/policy envelope và legacy compatibility chưa hoàn chỉnh; started_at/raw có thể thiếu, submitted_at tự điền. Không coi cơ chế nhận self-reported là server grading. Sửa consistency không cần tự chốt stack/business mode.
- Bank/builder/JSON/report đã có code/tests, chưa nghiệm thu taxonomy Topic/Lesson IDs đầy đủ, publish/question versions, durable drafts/outbox/archive UX, migration/export/xóa/backup; release policy/report offline cần browser thật.
- **DOCX/PDF importer NOT_IMPLEMENTED:** chưa có file→IR→preview/chỉnh→confirm; JSON import không thay DOCX paragraphs/tables/images/OMML hoặc PDF multicolumn/text/scan/OCR/confidence/provenance/corrupt/oversized corpus.
- Full history secret scan, dependency advisory/license/SAST, load/performance budget, CI browser artifacts, owner milestone acceptance **NOT_RUN**. Không nghiên cứu/cài tool hoặc thay kiến trúc ngoài quyền task.

## Tính năng lộ trình còn thiếu — ưu tiên

1. **P0/glue:** F01 pin destination/body theo immutable submission; F02 canonical envelope/fingerprint/raw/policy để receipt phản ánh đúng dữ liệu đã lưu. Không nghiệm thu collection trước khi retest.
2. **P1/glue:** F03 per-job budget/in-flight; F04 durable outbox khôi phục sau reload, archive xem/tải/retry, status local_saved/queued/sending/server_confirmed/failed trung thực; canonical transport giữ literal raw theo F02. Test lost receipt, nhiều jobs/tabs và quota.
3. **P1/glue:** owner chọn collection/trust mode và service; sau đó integration Google CORS/write-readback/concurrency/idempotency thật. Nếu cần kiểm tra đáng tin, grade ở server từ snapshot/key do owner kiểm soát.
4. **P1/glue:** browser E2E desktop/mobile/offline/refresh/timer/2-tabs/report; IME/a11y/math/media và CI artifacts; xác định nguyên nhân npm failure đã thấy. Owner nghiệm thu milestone.
5. **P1/glue:** hoàn thiện bank/builder taxonomy môn→lớp→chương/chủ đề→bài→mức độ, question/exam publication versions, drafts/media, import/export/xóa/backup/migrations, snapshot clone và legacy compatibility.
6. **P2/glue:** DOCX/PDF pipeline IR rich text/table/image/math, provenance/confidence/flags, preview/sửa/confirm; corpus text/scan/OCR/corrupt/oversized, không đoán đáp án thiếu.
7. **P2/src/domain + glue:** F06 public API limits thống nhất; policies grammar/display/limits/grouping có version; mẫu chuẩn THPT theo môn/năm/văn bản kiểm chứng tách custom-v1; security/performance/license/rollback. Class/Assignment giai đoạn sau.

## NEED_DECISION — chỉ các chính sách còn thiếu, không tự chọn

Không thấy mâu thuẫn công thức điểm hai hợp đồng. Verdict kỹ thuật CHANGES_REQUESTED độc lập các quyết định sau:

- Trust/collection: A luyện tập self-reported có nhãn giới hạn; B server grading từ owner snapshot/key; C local/export-only đến khi service được duyệt.
- Rounding hiển thị: A exact fractions làm nguồn chính; B half-up2 chữ số kèm exact source; C precision/mode theo policy version được owner phê duyệt. Không round trong engine.
- Grammar III: A tiếp tục charset/length-only sa-charset-v1; B owner duyệt numeric grammar version mới kèm migration. Không tự cấm01/--1/,5.
- Limits/grouping: A duyệt tạm1000 câu và nhóm I→II→III; B cấu hình version mới được duyệt.
- Rational F06: A inverse toàn canonical output; B bound chung enforce/document cả constructor/formatter/parser. Transport limit riêng không tự sửa contract API.
- Mẫu chuẩn: A chọn môn/năm/văn bản để kiểm chứng rồi xây preset; B giữ custom-only có nhãn chưa hỗ trợ mẫu chuẩn.

recommended_action: giao worker đúng VÙNG sửa findings; retest độc lập theo revision/hash cố định; không nghiệm thu/deploy toàn sản phẩm. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật và dữ liệu tổng hợp trong probes; không chứa hồ sơ riêng hoặc dữ liệu học sinh thật.
