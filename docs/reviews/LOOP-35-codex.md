# LC35 — Kiểm định độc lập toàn bộ sản phẩm

review_id/task_id: LC35; reviewer: Codex; date: 2026-11-14 (Asia/Bangkok).
requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6 B1-AC01–08/T01–17.
base_commit lúc nhận task: `0313b4fd0817ce1c068eff4da5878b0d0a4f00e0`.
head_commit/cutoff đã kiểm: `07087817f452b0d423a962992147b22d1368f776`.

**verdict: CHANGES_REQUESTED; risk_level: HIGH.** Còn 1 BLOCKER, 1 CRITICAL, 2 MAJOR, 2 MINOR dưới đây. Gate cuối xanh 372/372 không loại được các counterexamples vòng đời và collector. Chưa nghiệm thu toàn sản phẩm; các quyết định nghiệp vụ còn thiếu có phương án riêng ở cuối.

## Snapshot và phạm vi

- Đã đọc LC34, log và diff thực tế. HEAD ban đầu chưa chứa các sửa vòng 28; Claude commit `0708781` trong phiên review. Đã xem diff `0313b4f..0708781`, kiểm hash source và chạy lại gate sau commit; reviewer không commit.
- SHA256 `index.html`: `D0BB433C769C8BE0CBDC2836F1837BCB9037A50B4F26BA54D52571B5B7EA85C3`.
- SHA256 `apps-script/Code.js`: `77364A4DCD7FB70C5C29FF1C2D5805EFA6496E48606AE98B0D79E04B03F2BF8D`.
- SHA256 `src/domain/rational.ts`: `068B140C1D0DF59AE759B6829AE961AFA2034C2A5D1F060A26D8BDE8E4AFB886`.
- SHA256 `test/e2e/demoFlow.test.ts`: `3754292D18796D891EA721B067ED109D525D11CA74F078697FF18CB20F32742B`; collector test: `B34196A4C97672C22B49307831FF64A320D176FD21F03796D9DCCDC1EB30C9ED`.
- files_reviewed: các module `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; đường chạy `index.html` từ import/init→restore/storage→timer/shuffle/input→submit/retry/receipt→report/download, bank/builder/JSON; collector, manifest/README; tests domain/acceptance/oracle/e2e liên quan; package/tsconfig và build verifier. Không có dependency delta trong commit vòng 28.
- Phạm vi chứng minh: domain bằng test/oracle; web bằng đọc source và Node VM. Không gọi VM là browser E2E. Không POST Google, không deploy, không cài dependency. Chỉ tạo báo cáo này. Các file điều phối và thay đổi khác thuộc worker/Claude được giữ nguyên.

## Cách tái hiện chung

Các probe chạy bằng PowerShell here-string đưa vào `node --input-type=module`, không tạo/sửa file test. Transcript phiên LC35 chứa command và output thật.

- Web: trích nguyên hàm `createPageContext` trong `test/e2e/demoFlow.test.ts` (từ `function createPageContext(` tới `it(` tiếp theo), dùng `node:module.stripTypeScriptTypes` trong RAM, chạy với `node:vm`, `fs`, `indexPath='index.html'`. Mỗi page mới có VM riêng; các page chia sẻ một `Map` localStorage. Đặt `renderExamPane=()=>{}; renderPalette=()=>{}` để tránh hạn chế DOM mock. Giữ nguyên lifecycle, save/restore, timer, scoring và dispatch thật. Hàm `showReportView` đã được helper test mock; không có kết luận render/browser từ probes.
- Đề tối thiểu `E/v1`: custom-v1, sa-charset-v1; một câu III `{questionVersionId:'q',answerKey:'1'}`. Trả lời `q='1'` được 10/10.
- Collector: VM chạy nguyên `apps-script/Code.js`. Sheet mock giữ mảng các hàng 17 cột; `getRange(row,col,numRows=1,numCols=1).getValues()` trả đúng lát hàng/cột. Lock mock có cờ để spy mọi append; ContentService trả JSON body. Mỗi schema/control dùng môi trường mới khi cần. Đây là mô phỏng API, không chứng nhận Google runtime.
- Payload chuẩn dùng trong probes: `attempt_id:'A',exam_id:'E',exam_version_id:'v1',total:'1',maxTotal:'10',sections:{I:{score:'0',max:'0'},II:{score:'0',max:'0'},III:{score:'1',max:'10'}},raw_answers_json:{q:'1'},policy_version:'custom-v1'`.

## findings

### LC35-F01 — BLOCKER — Restore không khôi phục snapshot vào state trước lần lưu tiếp theo

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** LC34-F01 được sửa một phần, vẫn có đường mất snapshot và đổi điểm.
- affected_files: `index.html:1581–1599,1828–1835,1944–1949,3417–3442`.
- evidence/reproduction_steps:
  1. Page A: `loadExamVersion(ex)` với đề tối thiểu; đặt raw1, `saveLocalState()`. Assert draft có `examSnapshot`, điểm10; ghi attemptId.
  2. Tạo page B mới dùng cùng store, gọi `await initExam()` như refresh. `currentExam.questions[0].answerKey` vẫn1, nhưng `!!studentState.examSnapshot` là false.
  3. Sửa/nhập câu trả lời1, `saveLocalState()` đúng một lần. Draft vừa ghi không còn `examSnapshot`: dòng1828 serialize state trước khi dòng1835 mới gán snapshot trong RAM.
  4. `loadExamVersion(ex2)` cùng E/v1 nhưng key2. Không tìm thấy pinned snapshot trong draft nên nhận đề mới. Assert cùng attemptId, raw vẫn1, điểm đổi **10→0**. Probe exit0, không sửa thủ công bản ghi trong case này.
- expected: Shared §3/5, B1-AC04/T14: refresh/edit/import không thay key của cùng lượt làm. actual/impact: bản ghim vừa bổ sung bị lần lưu đầu sau refresh loại khỏi dữ liệu bền vững; nguồn cùng version có thể chấm sai bài cũ.
- minimal_fix: đưa snapshot đã validate/đối chiếu identity vào studentState ngay khi restore; bảo đảm snapshot đúng nằm trong state **trước** mọi serialize/write. Clone/ghim snapshot độc lập với đối tượng đầu vào; migrate bản ghi cũ thiếu snapshot từ nguồn đáng tin đang có, hoặc từ chối resume theo key mới và thông báo rõ. Không tự dựng lại key cũ nếu không có bằng chứng.
- regression_test: load→save→fresh page/init→edit/save một lần→reimport key2 phải giữ điểm10 hoặc reject conflict rõ; kiểm draft vẫn có snapshot sau từng lần save. Thêm final, legacy snapshotless, nhiều lần reload, đổi options/statements/settings, version mới và hai đề khác IDs làm positive controls.
- Bổ sung đã chứng minh: `loadExamVersion(ex)` giữ reference đầu vào; sửa `ex.questions[0].answerKey='2'` trong RAM cũng đổi điểm10→0. Đây là API aliasing, chưa chứng minh luồng builder UI hiện hành tự gây mutation này (builder export đã clone).

### LC35-F02 — CRITICAL — Collector vẫn xác nhận khi chưa chứng minh payload trùng bản ghi

- **VÙNG chịu trách nhiệm: glue. VERIFIED.** LC34-F02 PARTIAL; không giữ kết luận cũ rằng mọi thay exam/raw đều được nhận.
- affected_files: `apps-script/Code.js:481–482,511–524,538–577`; client nhận receipt `index.html:1688–1692,2921–2956`.
- evidence/reproduction_steps với payload chuẩn:
  1. Ghi A/raw1 → NEWLY_RECORDED. Gửi lại A bỏ `raw_answers_json` → ALREADY_RECORDED, mặc dù request không chứa raw đã lưu. Ngược lại, môi trường mới ghi A thiếu raw → NEWLY_RECORDED; gửi A/raw9 sau đó vẫn ALREADY_RECORDED, Sheet vẫn raw rỗng. Điều kiện `exRaw && newRaw` bỏ so sánh khi một phía rỗng.
  2. Ghi A với policy custom-v1; retry A/policy different-policy → ALREADY_RECORDED; Sheet vẫn custom-v1. Cột16 không được so sánh.
  3. Ghi A/E/v1/raw1. Cho Sheet mock chỉ trả được cột ID phục vụ lookup, còn full-row và các cột khác ném lỗi đọc. Retry A/exam DIFFERENT/raw2 → ALREADY_RECORDED. Các catch biến lỗi thành chuỗi rỗng, bỏ mọi điều kiện so sánh và trả success.
  4. Positive controls: cùng payload → duplicate hợp lệ; đổi examId hoặc đổi raw không rỗng khi đọc Sheet bình thường → PAYLOAD_CONFLICT. Header và row append đều nằm trong lock.
- expected: Shared §3/5: chỉ confirmed khi đúng immutable submission đã được lưu; lỗi đọc không là bằng chứng trùng dữ liệu. actual/impact: receipt success có thể xác nhận nội dung không tồn tại trên Sheet. Đây là consistency/idempotency, sửa được cả trong chế độ self-reported; không cần đợi quyết định server grading.
- minimal_fix: canonical immutable envelope/versioned fingerprint gồm identity, answers, scores/sections, policy và metadata đã chốt; bắt buộc cấu trúc raw hợp lệ (bài bỏ trống dùng object rỗng rõ ràng), so sánh cả giá trị rỗng; mọi lỗi đọc record trả retryable failure thay success. Validate policy thay vì nhận chuỗi tùy ý; receipt ràng buộc submission tương ứng.
- regression_test: hai chiều thiếu/raw khác; policy khác; missing/corrupt stored cells; full-row và fallback reads lỗi; cùng ID/cùng payload vẫn duplicate; conflict không cập nhật serverConfirmed. Thêm metadata/candidate/time nếu thuộc immutable envelope. Không lấy mock-positive làm bằng chứng Google integration.
- Lưu ý LC34 bypass `exTotal !== attemptId` vẫn còn ở dòng541/543, nhưng counterexample cũ đổi total đồng thời đổi sections nay bị section comparison chặn. Test mới tên LC34-F02 thay cả sections nên chưa chứng minh đã loại nhánh bypass. Không báo lại case cũ như vẫn tái hiện ở payload đầy đủ.

### LC35-F03 — MAJOR — Ngân sách retry của lượt cũ làm lượt mới không được retry

- **VÙNG chịu trách nhiệm: glue. VERIFIED.**
- affected_files: `index.html:1685–1686,2909,2970–2995,3389–3485`.
- evidence/reproduction_steps: cùng VM, cấu hình endpoint giả; fetch mock luôn `{ok:false}` và setTimeout giữ callbacks. Submit A; chạy lần lượt5 callback cùng chờ microtasks: tổng6 POST, timer rỗng, collectorRetryCount=5. Nạp đề khác B bằng `loadExamVersion` (luồng import không reload), trả lời rồi submit. POST đầu B thất bại; **không có callback retry B**, global vẫn5. Probe exit0; không tiêm counter5 trực tiếp.
- expected: Shared §3 retry hữu hạn/backoff cho từng submission độc lập. actual/impact: hết retry A làm B mất toàn bộ cơ hội retry, dù B mới gửi một lần; bài B dễ bị giữ cục bộ khi lỗi mạng tạm thời.
- minimal_fix: counter và in-flight job theo immutable attempt/submission; dispatch mới bắt đầu budget0, callback tiếp tục đúng budget của job đó. Không chỉ reset global khi switch vì callback A còn sống có thể sửa lại nó.
- regression_test: A dùng hết5 retries→switch B→B failure phải có backoff1000ms và budget riêng; callbacks A/B interleave; success A không reset budget B; lặp online/submit không sinh nhiều retry chain cho cùng job.

### LC35-F04 — MAJOR — Archive chưa được xử lý như hàng đợi đồng bộ sau restart/reload

- **VÙNG chịu trách nhiệm: glue. VERIFIED trong fresh VM; browser network thật NOT_RUN.**
- affected_files: `index.html:1695–1753,2853–2858,3000–3008,3305–3359`.
- evidence/reproduction_steps: submit một lượt B khi collector fail, bản final unconfirmed tồn tại. `restartExam()` tạo lượt mới chưa nộp và gọi location.reload (mock). Hủy ngữ cảnh cũ như reload thật bằng page mới chia sẻ store; cấu hình collector và fetch spy; `await initExam(); await dispatchToServerCollector()`. Assert final B cũ vẫn nằm trong store, nhưng **0 POST**, active attempt chưa nộp. Không có dispatcher duyệt các final unconfirmed khác active; online handler cũng chỉ xử lý active submitted.
- expected: Shared §3 offline/retry/idempotency: submission đang chờ phải có đường khôi phục và đồng bộ lại. actual/impact: giữ bytes archive chưa đủ đưa bài cũ đến collector; callback trong RAM biến mất khi restart reload. Positive test chạy callback cũ sau restart trong cùng VM không mô phỏng việc này.
- minimal_fix: durable outbox chứa immutable submitted envelopes, load/retry độc lập với active attempt, có status/budget/backoff; có thao tác xem/tải/retry archive và thông báo pending/failed đúng. Xóa job chỉ khi receipt đúng submission được lưu bền vững.
- regression_test: fail A→restart B→fresh context→online phải gửi lại A, không gửi B chưa nộp; nhiều archive, hết budget/manual retry, lost receipt, refresh giữa sending, xác nhận A không sửa B. Sau unit/VM cần browser reload/offline thật.

### LC35-F05 — MINOR — So sánh raw JSON và phân số theo cách biểu diễn tạo conflict giả

- **VÙNG chịu trách nhiệm: glue. VERIFIED.**
- affected_files: `apps-script/Code.js:54–66,164–173,465–480,538–562`.
- evidence/reproduction_steps: ghi payload chuẩn với raw `{q:'1',r:'2'}`, retry cùng answers nhưng insertion order `{r:'2',q:'1'}` → PAYLOAD_CONFLICT. Môi trường mới ghi total/III.score `'2/2'` (được parser nhận) → NEWLY_RECORDED và Sheet lưu2/2; retry cùng nội dung số học với `'1'` → PAYLOAD_CONFLICT. `toCanonicalStr` không rút gọn gcd.
- expected: field order không đổi meaning của cùng submission; dạng được chấp nhận cần được canonicalize thống nhất hoặc bị reject trước khi ghi. actual/impact: retry từ serializer/adapter khác có thể thất bại vĩnh viễn dù dữ liệu không đổi; web hiện gửi fraction tối giản nên nhánh2/2 có phạm vi hẹp hơn.
- minimal_fix: validate/canonicalize raw object đệ quy theo keys ổn định, giữ nguyên literal string answers; canonical fractions tối giản/mẫu dương, hoặc reject noncanonical theo protocol rõ. Không trim/normalize chuỗi đáp án III.
- regression_test: nested II keys/reordered top-level keys, raw string JSON nếu còn hỗ trợ;1↔2/2, zero fractions; thực sự đổi raw vẫn conflict. Kết hợp fingerprint F02, không bỏ conflict protection.

### LC35-F06 — MINOR — Rational parser không là nghịch đảo đầy đủ của formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED.** LC34-F06 OPEN.
- affected_files: `src/domain/rational.ts:120–145`.
- evidence/reproduction_steps: import API công khai; `s=toFractionString(rational(10n**200n))` tạo201 ký tự canonical; `parseFractionString(s)` ném SyntaxError do limit200. Probe assert exit0.
- expected: M1 §4.1 parser là nghịch đảo chặt formatter. actual/impact: public Rational roundtrip thất bại trên input formatter chấp nhận. Không phát hiện ảnh hưởng scoring đề≤1000 câu; không nâng thành blocker số học.
- minimal_fix: hoặc inverse toàn miền output hợp lệ, hoặc owner duyệt bound chung enforce/document nhất quán constructor/formatter/parser. Giữ resource limits riêng ở untrusted transport; không chỉ bỏ mọi limit collector.
- regression_test:199/200/201 ký tự, tử/mẫu lớn, malformed/noncanonical rejection; nếu bound chung mới thì cả hai chiều đều kiểm cùng bound.

## Retest LC34

| Finding cũ | Kết quả tại cutoff |
|---|---|
| F01 snapshot | PARTIAL: direct same-version key-change đã giữ10/10; refresh→edit/save→reimport vẫn sai, LC35-F01. |
| F02 collector conflict | PARTIAL: đổi exam/raw không rỗng nay reject. Read failure, missing raw, policy vẫn F02; không tái khẳng định bypass score cũ. |
| F03 schema | Các case score-only/exam-only/missing-version/incomplete sections nay bị validation chặn trong code/tests. Raw/time/policy envelope chưa hoàn chỉnh; thiếu raw vẫn nhận, F02. |
| F04 retry drift | FIX VERIFIED cho callback giữ A sau đổi active B trong cùng VM; guard không gửi active chưa submit đã có. Retry budget và durable queue vẫn F03/F04. |
| F05 header ngoài lock | FIX VERIFIED: invalid request không append; valid header+row append chỉ khi locked=true. Google concurrent cold-sheet NOT_RUN. |
| F06 Rational inverse | OPEN: constants/export/tests boundary chưa đổi mismatch miền201 ký tự. |

## checks_run

Environment: Windows/PowerShell; Node24.14.0, npm11.9.0, Python3.11.0; TypeScript local có sẵn (package pin7.0.2). Lệnh chạy tại D:\Cunata. Bằng chứng stdout/exit trong transcript LC35; không tạo log/probe ngoài scope.

| Command/check | Exit | Kết quả thực tế và giới hạn |
|---|---:|---|
| `npm test` lần đầu |0|368 tests/59 suites, pass368/fail0, cancelled/skipped/todo0;867.4929ms. Tests được worker thêm tiếp trong phiên. |
| `npm test` sau commit0708781 |0|**372 tests/59 suites, pass372/fail0**, cancelled/skipped/todo0;924.94ms. Đây là gate cuối. |
| `npx --no-install tsc -p tsconfig.json` |0|Chạy lần đầu và sau commit, không diagnostics; không dùng NOT_RUN tsc cũ trong M1. |
| `npx --no-install tsc -p tsconfig.web.json` |0|Cả hai lượt không diagnostics; include src/scripts/test, không có kiểm đầy đủ inline JavaScript/DOM Apps Script. |
| `node scripts/build.js` |0|Cả hai lượt thành công; gate cuối xác nhận7 assets, sample8 câu hợp lệ, CSS link và collector syntax. **Static verifier**, không bundle/render/deploy; index251957 bytes, collector27503. |
| `python -B test/oracle/oracle.py --check` |0|11 tests/pass11/fail0;1632 cases,5849 maxima configs,9 negative controls, seed20261114;1.0183s. Independent oracle, không cộng vào npm count. |
| Node stdin domain/web differential + DTO roundtrip |0|1632 fixtures: so fraction total/max và score/max cả3 phần của domain lẫn web với oracle expected; deepEqual toàn ScoreResult sau DTO→JSON→parse. Không chỉ so total. |
| Node stdin lifecycle/control/inverse |0|Direct pin và captured retry positive controls; reference mutation/legacy missing-snapshot counterexamples; Rational201 reject. |
| Node stdin collector probes |0|F02/F05 counterexamples và lock/schema/normal-conflict controls nêu trên. API mock có column slicing thật, không Google. |
| Node stdin giả thuyết first-save, trước khi cô lập refresh |1|Assert mong snapshot thiếu sau init + thêm một save không đúng: snapshot có, điểm vẫn10. **Bác bỏ giả thuyết đó**, không ghi là lỗi sản phẩm. |
| Node stdin fresh-page refresh→save→reimport |0|Counterexample F01 đúng lifecycle, không xóa/sửa stored snapshot bằng tay; cùng attempt/raw, điểm10→0. |
| Node stdin retry budget + fresh-context archive |0|A6 POST hết budget→B1 fail không timer; archive final vẫn có sau restart nhưng fresh context0 POST, F03/F04. |
| `git diff --check` trước commit vòng28 |2|Whitespace trong ops/forever.stdout.txt, ops/loop/wave1.out.txt, ops/overnight.log thuộc worker. Không phải lỗi build/scoring, không sửa ngoài scope. |
| git status/log/diff/rev-parse/hash, source/contract/test reads |0 cho kiểm tra hợp lệ|Đối chiếu cutoff/hash, không tin gate message trong commit thay command chạy thật. Không đọc prompt riêng worker khác. |

## coverage_gaps

- B1-AC01–03/T01–09/T15: số học domain/web khớp1632 fixtures, bao gồm exhaustive II1296, raw III exact/Unicode/whitespace, max5/15/16, thresholds và repeating fractions. Các tests validation/shuffle/serialization/properties chạy xanh. Không suy rộng corpus hữu hạn thành mọi input đúng.
- B1-AC04–06/T10–14: code API/read tests đã xem; snapshot lifecycle vẫn blocker F01, public inverse F06. Shuffle theo IDs/flags/seed và DTO deep roundtrip có evidence; localStorage check-then-write không phải transaction hai tab. Chưa chứng nhận mọi lịch xen kẽ/quota/migration.
- B1-AC07–08/T16–17: gate thực xanh ở cutoff, oracle negative controls không thay việc áp mọi mutant lên SUT. Lint riêng không được setup. Nghiệm thu owner/changelog/rollback/production readiness chưa đạt.
- **Browser thật NOT_RUN:** desktop/mobile Chrome/Firefox/WebKit, offline cold boot/cache (chưa có service worker trong inventory dự án), timer background/clock shifts, multi-tab, quota/private mode, Telex/VNI/composition/cursor, keyboard/AT/focus/contrast/axe, math/media overflow, screenshot/trace, download/mở report offline. VM render stubs và tên thư mục e2e không chứng minh những mục này.
- **Google thật NOT_RUN:** CORS/redirect/receipt/readback, concurrent cold-sheet, Google cell formatting/literal semantics, deployment permissions, quota/anti-abuse. Không có endpoint test được kiểm chứng trong phiên; không tự deploy/POST. Backend vẫn nhận điểm client: chỉ có thể đánh giá consistency hiện tại, chưa chứng nhận trusted grading hay hidden-answer security.
- Collector còn nhận thiếu started_at/raw và tự điền submitted_at/default policy; báo cáo thu về có thể thiếu provenance/thời gian gốc. Cần schema/version và quyết định legacy rõ. Không gộp việc sửa consistency F02 với việc phải chọn hệ thống chấm server.
- Bank/builder/report JSON đã có luồng và tests nhưng chưa đủ full taxonomy Topic/Lesson IDs, publication/version management/draft recovery, retention/outbox/archive UI, migration và xuất/xóa/backup hoàn chỉnh. After-deadline answer release/report offline chưa nghiệm thu browser.
- **DOCX/PDF importer NOT_IMPLEMENTED:** JSON import không thay file→IR→preview/sửa→confirm; chưa có corpus bảng/hình/OMML/LaTeX, text/scan/OCR/multicolumn và resource-limit failures.
- Full history secret scan, dependency advisories/license/SAST, performance/load budgets, CI browser artifacts và owner milestone acceptance **NOT_RUN**. Không thêm nghiên cứu/cài tool ngoài yêu cầu review.

## Lộ trình còn thiếu — thứ tự ưu tiên

1. **P0/glue:** sửa F01 snapshot restore/write/migration; F02 canonical payload binding và fail-closed reads. Retest counterexamples cùng positive controls trên hash cố định trước nghiệm thu.
2. **P1/glue:** F03 per-submission retry; F04 durable outbox/archive access/retry/download; concurrent in-flight/online dispatch, lost receipt, recovery/quota/migration và trạng thái pending/failed/confirmed trung thực. F05 canonical transport gộp cùng protocol.
3. **P1/glue:** owner chốt trust/collection mode và dịch vụ sở hữu; sau đó Google CORS/write-readback/concurrency/idempotency/receipt thật. Nếu cần kết quả đáng tin, server grade từ immutable owner snapshot/key; no-login không bảo đảm danh tính/chống gian lận.
4. **P1/glue:** browser desktop/mobile/offline/reload/timer/2-tabs/report, IME/a11y/math/media; CI evidence và nghiệm thu owner. Không tuyên bố hỗ trợ cold offline chỉ từ localStorage.
5. **P1/glue:** taxonomy môn→lớp→chương/chủ đề→bài→mức độ; bank versions/publish/archive, builder drafts/media, export/import/xóa/backup và migration.
6. **P2/glue:** DOCX/PDF pipeline với IR rich text/table/image/math/provenance/confidence, preview/chỉnh/confirm; corpus text/scan/OCR/corrupt/oversized; cảnh báo thiếu đáp án/công thức, không đoán key.
7. **P2/src/domain + glue:** F06 thống nhất public API limits; display/grammar/limits/grouping policies versioned; mẫu chuẩn THPT theo môn/năm/văn bản đã kiểm chứng tách custom-v1; security/performance/license/rollback và owner acceptance. Class/Assignment ở giai đoạn sau.

## NEED_DECISION — không tự chốt nghiệp vụ

Không phát hiện mâu thuẫn công thức điểm giữa hai contract. Sửa F01–05 về consistency không cần đợi chọn business mode. Các policy còn mở:

- **Trust/collection:** A luyện tập self-reported có nhãn giới hạn; B server grading từ owner snapshot/key; C local/export-only đến khi dịch vụ/protocol được duyệt.
- **Rounding hiển thị:** A exact fractions chính; B half-up2 chữ số kèm exact source; C precision/mode theo policy version được owner duyệt. Không thay phép tính gốc.
- **Grammar III:** A tiếp tục charset/length-only sa-charset-v1; B owner quy định numeric grammar mới kèm version/migration. Không tự cấm --1/,5/01.
- **Limits/grouping:** A duyệt tạm1000 câu và nhóm I→II→III; B cấu hình limits/grouping version mới.
- **Rational API F06:** A inverse toàn canonical output; B bound chung được duyệt và enforce/document cả hai chiều. Bound transport riêng không tự động sửa contract API.
- **Mẫu chuẩn:** A owner chọn môn/năm và văn bản để kiểm chứng trước khi xây; B giữ custom-only và ghi rõ chưa có mẫu chuẩn. Không suy công thức custom thành quy định chính thức.

recommended_action: giao worker đúng VÙNG xử lý findings, retest độc lập trên revision/hash cố định; chưa nghiệm thu/deploy toàn sản phẩm. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật và dữ liệu tổng hợp trong probes; không chứa chỉ thị riêng hoặc dữ liệu học sinh thật.
