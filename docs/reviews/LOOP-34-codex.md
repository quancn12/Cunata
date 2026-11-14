# LC34 — Kiểm định toàn bộ sản phẩm

review_id/task_id: LC34; reviewer: Codex; date: 2026-11-14 (Asia/Bangkok).
requirements_version: Shared Product Contract v2.0 (ưu tiên cao nhất), M1-scoring-contract v1.0, READINESS §6 B1-AC01–08/T01–17.
base_commit (task HEAD) = head_commit: `0313b4fd0817ce1c068eff4da5878b0d0a4f00e0`.
So sánh từ review trước: `4cb362925497b80fa8c5750b35adea67277a9c72..0313b4f`; đọc thêm LC33, kể cả cutoff cuối và collector revision chưa được review ở LC33. Không đọc prompt riêng của worker khác.

**verdict: CHANGES_REQUESTED; risk_level: HIGH.** Gate hiện xanh nhưng còn 1 BLOCKER, 1 CRITICAL, 3 MAJOR và 1 MINOR được chứng minh bên dưới. Chưa đủ điều kiện nghiệm thu toàn sản phẩm. Không tìm counterexample số học scoring trong 1.632 fixtures đã đối chiếu cả domain và web; không suy diễn điều đó thành toàn bộ vòng đời làm bài đúng.

## Snapshot và phạm vi

- SHA256 `index.html`: `DC73769AB294096CE06484FB5EA9A01F330DF38B2E46FB9D6CBF9FF5DAD6BD4E`.
- SHA256 `apps-script/Code.js`: `9503BD7CCCF560B5488E9EA36C23CE3CDF18BD3766F3C4D6566A16A5D660909D`.
- SHA256 `test/e2e/demoFlow.test.ts`: `1CEFE35E14346878E53EE5FB19AA89613EA797D4EB057FADEBBFF99241C56759`.
- SHA256 `test/e2e/appsScriptCollector.test.ts`: `385669616C160354A72DD56A8188711B5EF385E2804327A66EEE01427D26EC98`.
- files_reviewed: toàn bộ `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; đường chạy và sinks trong `index.html` (validation/scoring, storage/restore, timer, submit/retry/receipt, report/export, bank/builder/import JSON); `apps-script/Code.js`; các tests domain/acceptance/oracle/e2e liên quan, `package.json`, `scripts/build.js`, READINESS §6. Không có thay đổi implementation domain trong diff này; domain delta là test thêm. Không có package/dependency delta trong commit được so sánh.
- Working tree ban đầu có thay đổi `ops/OVERNIGHT_STATUS.md`, `ops/dashboard/dashboard_data.js`, `ops/forever.stdout.txt`, `ops/overnight.log`, `workers.html` và các file điều phối untracked. Không đụng vào chúng. Reviewer chỉ tạo file review này; không sửa code/test, không install, commit hay deploy.

## findings

### LC34-F01 — BLOCKER — Cùng lượt làm bị chấm theo key mới khi nạp lại cùng version

- **VÙNG chịu trách nhiệm: glue.** VERIFIED bằng VM lifecycle; tiếp nối LC33-F02.
- affected_files: `index.html:3358–3368,3372–3420`; snapshot global `1695–1706,1833–1837`.
- evidence/reproduction_steps: tạo đề hợp lệ `examId=CUSTOM`, `examVersionId=v1`, custom-v1/sa-charset-v1, một câu III `q`, key `1`. Gọi `loadExamVersion(ex)`, đặt `studentState.responses.q='1'`, `saveLocalState()`. Điểm `10`. Nạp clone cùng IDs nhưng key `2` bằng `loadExamVersion(ex2)`. Probe assert cùng attemptId, raw vẫn `1`, key hiện `2`, điểm thành `0`.
- expected: Shared §3/5, B1-AC04/T14: attempt gắn snapshot/version bất biến; sửa nguồn không thay key dùng cho lượt cũ. actual/impact: currentExam và global active snapshot bị thay trước restore; cùng version được tin chỉ vì IDs, khiến đáp án của học sinh bị chấm sai. Đây là lỗi qua API nạp đề dùng thật, không phải lỗi phép tính rational.
- minimal_fix: lưu immutable exam snapshot/content identity theo mỗi attempt/version; khi gặp cùng version nhưng nội dung khác, từ chối với thông báo hoặc yêu cầu xuất version mới. Restore/chấm/report phải dùng snapshot đã ghim; không ghi đè snapshot cũ trước kiểm conflict.
- regression_test: case key1→key2 ở trên phải giữ điểm10 và snapshot cũ hoặc reject import rõ ràng; thêm đổi options/statements/độ dài đề/settings, draft và final, reload, hai đề khác IDs và version mới làm positive controls. Kiểm preservation raw/order/timer, không chỉ examId.

### LC34-F02 — CRITICAL — Collector xác nhận payload khác bản đã lưu, có bypass khi ID bằng điểm

- **VÙNG chịu trách nhiệm: glue.** VERIFIED bằng Sheet mock có đầy đủ row/column semantics; tiếp nối phần payload binding LC33-F01.
- affected_files: `apps-script/Code.js:386–428`, đặc biệt `394` và catch nuốt lỗi trong conflict read.
- evidence/reproduction_steps: POST A/E/v1, total1/max10, đủ ba sections, raw `{q:'1'}` → NEWLY_RECORDED. POST cùng A nhưng exam DIFFERENT/v2, raw `{q:'2'}`, giữ totals → ALREADY_RECORDED. Bản trên Sheet vẫn là E/v1/raw1; receipt thành công không ràng buộc dữ liệu request thứ hai.
- Counterexample mới: attempt_id chuỗi `'1'`, total `'1'`, max10; gửi lại cùng ID nhưng total2 và section III score2/max10. Kết quả vẫn ALREADY_RECORDED. Điều kiện `cleanExistingTotal !== attemptId` bỏ cả kiểm total/max khi giá trị điểm cũ tình cờ bằng ID. Probe dùng getRange đúng cột N/O; không phải mock trả nhầm cột1.
- expected: Shared §3 idempotency và không xác nhận sai trạng thái đã chốt; cùng ID/cùng payload được xác nhận, cùng ID/different immutable payload phải conflict. actual/impact: client có thể báo đã đồng bộ trong khi dữ liệu đang xem chưa được lưu. Không cần backend chấm điểm mới sửa được consistency này.
- minimal_fix: so canonical immutable payload/identity/raw/sections/policy với bản đã lưu hoặc fingerprint versioned; fail closed khi không đọc được bản cũ. Bỏ production branch dành cho mock; sửa mock theo Google API. Receipt cần ràng buộc revision/payload tương ứng.
- regression_test: cùng ID/cùng payload reordered fields → duplicate hợp lệ; thay exam/version/raw/section/policy dù tổng bằng nhau → conflict; ID='1' và điểm1→2 → conflict; getRange lỗi → không success. Kiểm client chỉ confirmed cho đúng payload. Google thật còn NOT_RUN.

### LC34-F03 — MAJOR — Collector vẫn nhận bản ghi thiếu đề/version/sections/điểm

- **VÙNG chịu trách nhiệm: glue.** VERIFIED, phần schema LC33-F01 còn mở.
- affected_files: `apps-script/Code.js:240–250,274–302`; default row `140–166`.
- evidence/reproduction_steps: từng case trong Sheet context riêng: `{attempt_id:'score-only',total:'1',maxTotal:'10'}` → NEWLY_RECORDED, exam/version rỗng, sáu cột breakdown0 nhưng total1/max10; `{attempt_id:'exam-only',exam_id:'E'}` → NEWLY_RECORDED với total0/max0; payload có đủ sections/score nhưng thiếu exam_version_id cũng NEWLY_RECORDED.
- expected: Shared §2/3/5 kết quả tổng/từng phần đầy đủ, gắn version và lưu trạng thái trung thực. actual/impact: dữ liệu không thể truy ngược đề/version và điểm từng phần không bằng tổng vẫn được coi là đã ghi nhận. Không đánh đồng validation số học với khả năng xác thực điểm client.
- minimal_fix: canonical envelope bắt buộc string IDs đề/version, đủ điểm tổng/max và ba sections (phần vắng là0/0), raw/policy theo protocol đã duyệt; validate trước ghi; từ chối thiếu, không mặc định thành kết quả0. Nếu cần legacy payload, dùng adapter/version và migration rõ ràng.
- regression_test: score-only, exam-only, missing-version, omitted-sections, missing-total/max đều reject; positive control đủ sections, đề một phần và max15/16/repeating được nhận đúng. Test hiện chỉ partial sections và alias tổng conflict chưa chứng minh schema bắt buộc.
- Retest alias: canonical section nay được ưu tiên khi ghi, nên `sections.III=1/10` cộng alias `score_p3=999/max_p3=1` vẫn nhận nhưng Sheet ghi1/10. **Không giữ lại kết luận cũ rằng alias này ghi điểm999 vào Sheet**; việc chấp nhận alias xung đột còn là protocol hardening, tách khỏi ba counterexamples trên.

### LC34-F04 — MAJOR — Retry cũ lấy state lượt mới chưa nộp

- **VÙNG chịu trách nhiệm: glue.** VERIFIED bằng callback timer thực thi trong VM; LC33-F03 còn mở.
- affected_files: `index.html:2830–2880,2941–2966,3275–3325`; retry counter dùng chung `1685–1686`.
- evidence/reproduction_steps: submit A (III raw1,10/10), cấu hình endpoint giả và fetch mock trả `{ok:false}`, gọi dispatch để lấy callback backoff1000ms. `restartExam()` tạo B; thực thi callback cũ. Request đầu mang A/raw1/10, request sau mang B/raw{}/sections:null/total0/max0; B.submitted=false. Không có network POST thật.
- expected: Shared §3 retry cùng immutable attempt; chưa nộp không gửi. actual/impact: retry A không gửi lại A, có thể làm mất đồng bộ A và gửi dữ liệu của bài đang làm. Collector hiện reject B nếu sections:null, nhưng điều đó không phục hồi A và không sửa lỗi client.
- minimal_fix: queue immutable submitted envelope theo attempt; callback giữ queue item/identity/payload và per-attempt retry budget/in-flight; guard submitted; restart/switch không chuyển job sang state mới. Durable outbox cần xử lý cả archive, không chỉ active attempt.
- regression_test: A fail→restart B→fire callback phải POST A lần nữa; B không gửi trước submit. Thêm switch exam/reload/lost receipt/online event/concurrent dispatch, backoff bounds và hết retry. Test hiện tại chỉ kiểm timer đầu1000ms, không chạy callback hoặc kiểm payload/budget.

### LC34-F05 — MAJOR — Khởi tạo Sheet trước validation và ngoài lock

- **VÙNG chịu trách nhiệm: glue.** VERIFIED unprotected mutation; Google concurrent race NOT_RUN; LC33-F06 còn mở.
- affected_files: `apps-script/Code.js:201–206,109–133,372–384`.
- evidence/reproduction_steps: Sheet trống, appendRow spy ghi locked flag; gọi doPost với `{}`. Kết quả MISSING_ATTEMPT_ID nhưng đã có1 header append, locked=false. ensureHeaderRow chạy lại sau lock không loại được write đầu.
- expected: Shared §3/7, check-empty+append được cùng lock bảo vệ và invalid request không ghi dữ liệu. actual/impact: request bị reject vẫn sửa Sheet; cold initialization có cửa sổ hai request cùng kiểm trống rồi thêm hai header. Chưa tuyên bố đã gây hai headers trên Google.
- minimal_fix: bỏ init ngoài lock, chỉ init sau parse/validate và lấy lock thành công. Giữ mọi lookup/write trong lock.
- regression_test: invalid request/lock busy không append trên Sheet trống; spy mọi append phải locked=true; deterministic interleaving cold requests chỉ một header, hai attempt rows; kiểm integration đồng thời khi endpoint thử được duyệt.

### LC34-F06 — MINOR — Parser không là nghịch đảo của formatter trên mọi Rational hợp lệ

- **VÙNG chịu trách nhiệm: src/domain.** VERIFIED; giới hạn đã được LC33 nêu như coverage/API gap, nay có counterexample trực tiếp.
- affected_files: `src/domain/rational.ts:120–142`.
- evidence/reproduction_steps: `s=toFractionString(rational(10n**200n))` tạo chuỗi canonical dài201; `parseFractionString(s)` ném SyntaxError vì hard limit200. Probe assert lỗi thật, exit0.
- expected: M1 §4.1 parser là nghịch đảo chặt của formatter; actual/impact: roundtrip Rational công khai thất bại dù formatter nhận giá trị hợp lệ. Không thấy ảnh hưởng điểm đề≤1000 câu; không nâng thành blocker scoring.
- minimal_fix: thống nhất và ghi rõ giới hạn chung ở cả hai chiều theo contract sửa được duyệt, hoặc cho parser nhận toàn bộ canonical output của Rational API. Không đơn thuần bỏ resource limit trên untrusted collector input.
- regression_test: roundtrip boundaries199/200/201 và numerator/denominator lớn; reject malformed/noncanonical vẫn giữ; nếu chọn bound mới cần test cả constructor/formatter/parser và tài liệu API.

## Retest LC33

- F01 PARTIAL: canonical total/max aliases reject conflict, section canonical row precedence sửa được; schema/payload binding vẫn F02/F03, thêm bypass ID=score.
- F02 OPEN: F01 snapshot conflict tái hiện mới. CUSTOM boot/restore positive control đã xanh trong suite, không gọi toàn restore hỏng.
- F03 OPEN: F04 retry drift tái hiện mới.
- F04 FIX VERIFIED ở sink difficulty4036 và regression escaped markup trong suite. Không có browser execution test, không tuyên bố mọi XSS đã hết.
- F05 gate đỏ **CLOSED tại snapshot này**: 363/363 pass; collector revision9503… đã được chạy/review ở LC34. Tuy nhiên production mock bypass gây F02, không dùng gate xanh làm bằng chứng idempotency đủ.
- F06 OPEN: F05 header write tái hiện mới. Receipt validator và final retention positive regressions tiếp tục xanh; retention bytes chưa thay việc truy cập/tải/retry archive qua UI.

## checks_run

Environment: Windows/PowerShell; Node24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Logs/probes ở transcript phiên LC34; không tạo artifact ngoài scope.

| Command/check | Exit | Kết quả và giới hạn |
|---|---:|---|
| `npm test` (lọc22 dòng cuối stdout/stderr, in LASTEXITCODE) | 0 | tests363, suites58, pass363, fail0, cancelled0, skipped0, todo0; duration776.6222ms. VM tests, không browser E2E thật. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics; compiler có sẵn, không dùng NOT_RUN cũ trong M1. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics; không kiểm DOM Google runtime hoặc inline HTML đầy đủ. |
| `node scripts/build.js` | 0 | 7 assets; index248891 bytes/collector18895; sample8 câu hợp lệ, CSS link/collector syntax. Đây là static verifier, không bundling/render/deploy. |
| `python -B test/oracle/oracle.py --check` | 0 | tests11/pass11/fail0/skip0;1632 cases,5849 maxima configs,9 negative controls, seed20261114; duration_s1.0232. Oracle riêng, không cộng vào npm count. |
| Node stdin differential domain/web + deep DTO | 0 | 1632 fixtures: domain và web tổng/từng phần score/max fraction khớp expected oracle; deepEqual toàn ScoreResult sau DTO→JSON→parse. Không chỉ total. |
| Node stdin lifecycle/retry probe, bản đầu | 1 | Harness querySelector trả null làm renderExamPane TypeError. Không ghi là bug browser; đã cô lập renderExamPane/renderPalette thành no-op để kiểm đúng lifecycle, rồi chạy lại bên dưới. |
| Node stdin lifecycle/retry probe, bản sửa harness | 0 | Counterexamples F01/F04 được assert; dùng createPageContext trích từ test và Node stripTypeScriptTypes trong RAM, cảnh báo experimental của API. Render/report mocks không chứng nhận UI. |
| Node stdin collector column-aware Sheet probe | 0 | F02/F03/F05: malformed accepted, changed payload confirmed, ID=score bypass, invalid request append không lock. Fresh Sheet context cho từng schema case. Không Google/network thật. |
| Node stdin rational inverse boundary | 0 | Assert canonical201 ký tự bị parser reject; chứng minh F06, không phải acceptance pass. |
| `git diff --check` | 2 | Trailing whitespace ở file của worker `ops/forever.stdout.txt:357`; không sửa ngoài scope. Không phải lỗi build/scoring. |
| git status/log/rev-parse/diff/hash, source/contract reads, runtime versions | 0 cho các lệnh hợp lệ | Inventory đầu có path `web` không tồn tại (`rg` exit2); chuyển sang index.html thực. Không gọi đó là build fail. Memory quick search không có hit liên quan, không dùng dữ liệu memory làm kết luận. |

## coverage_gaps và đáp ứng contract

- B1-AC01–03/T01–09/T15: scoring domain và web exact fractions khớp corpus1632, bao gồm exhaustive II1296, III exact strings, max5/15/16, threshold/repeating. Input validation/judge/serialize/shuffle đã đọc và unit suite chạy thật. Không có phép thử vét cạn mọi input/schema; bounds/properties không thay review integration.
- AC04–06/T10–14: shuffle IDs/flags/child seeds được kiểm trong tests hiện có; web snapshot version vẫn blocker F01. localStorage check-then-write không là transaction; scheduling hai tab/quota/migrations chưa chứng nhận. API rational bound F06 cần thống nhất.
- AC07–08/T16–17: gate xanh tại hash này, chưa chạy instrumented mutation suite toàn bộ; negative controls oracle không đồng nghĩa đã áp mọi mutant lên SUT. Lint riêng không được setup trong package.json. Display/limits/grouping/preset còn chờ owner.
- Browser thật **NOT_RUN**: Chrome/Firefox/WebKit, mobile/desktop screenshots/traces, offline cold reload/cache (chưa thấy service worker trong inventory), timer background/clock shifts, hai tab, quota/private mode, IME Telex/VNI/composition/cursor, keyboard/AT/focus/contrast/axe, media/math overflow và download/mở report HTML/PDF offline. VM DOM mocks không thay những kiểm thử này.
- Google thật **NOT_RUN**: CORS/redirect/receipt/write-readback/deployment, concurrent cold-sheet, cell literal/format behavior, payload size/quota/anti-abuse. Không deploy hay POST endpoint thật; Spreadsheet mock không chứng minh Google semantics đầy đủ.
- Reports và bank/builder JSON đã có score/max tổng/từng phần, raw/key/lời giải/thời gian, download/print, settings/history/filter/reuse/edit. Chưa nghiệm thu answer release sau deadline tự cập nhật và report offline bằng browser. Key ở client chỉ phù hợp trust mode được nói rõ, không phải hidden-answer secure exam.
- Taxonomy còn thiếu đầy đủ Topic/Lesson IDs ổn định; bank/builder local không bằng publication/version management và durable draft/recovery/migration hoàn thiện. Nhập DOCX/PDF vẫn **NOT_IMPLEMENTED**, JSON import không thay pipeline Word/PDF.
- Full secret/history scan, dependency advisories/license/SAST, performance/load budgets, rollback/CI browser và owner milestone acceptance **NOT_RUN**. Không có nghiên cứu/cài tool mới trong LC34.

## Lộ trình còn thiếu, theo ưu tiên

1. **P0/glue:** ghim snapshot F01; payload-bound idempotency F02, envelope F03, retry F04, lock F05. Regression cần chạy đúng counterexample và positive control, không thêm bypass cho mock vào production.
2. **P1/glue:** immutable durable outbox, retry per-attempt/backoff/in-flight, duyệt archive/tải report/retry các lượt không active; đồng bộ cục bộ nhiều tab, recovery/quota/migration, xuất/xóa/backup và retention rõ ràng.
3. **P1/glue:** owner chọn trust/collection mode và service ownership, sau đó test Google CORS/write/readback/idempotency/receipt thật; nếu cần kết quả đáng tin, server grade bằng snapshot/key của owner.
4. **P1/glue:** browser desktop/mobile/offline boot/timer/2-tabs/lost receipt/report export; IME/a11y/media/math; CI artifacts và nghiệm thu các giới hạn no-login/maxAttempts trung thực.
5. **P1/glue:** taxonomy môn→lớp→chương/chủ đề→bài→mức độ, publish/version/archive, builder draft persistence, media và migration/export/import/backup.
6. **P2/glue:** DOCX/PDF file→IR paragraph/table/image/OMML/LaTeX/provenance/confidence→preview/sửa→confirm; text/scan/OCR/multicolumn/corrupt/oversized corpus, cảnh báo thiếu key/công thức, không đoán đáp án.
7. **P2/src/domain + glue:** giải quyết F06/API limits và policies versioned; mẫu chuẩn THPT theo môn/năm/văn bản đã kiểm chứng tách custom-v1; security/performance/license/rollback/changelog và owner acceptance. Class/Assignment giai đoạn sau.

## NEED_DECISION

Không thấy mâu thuẫn công thức điểm mới giữa hai contract. Các sửa consistency F01–05 không phải chờ chọn business mode; không tự quyết những policy còn thiếu:

- Trust/collector: **A** luyện tập self-reported có nhãn giới hạn; **B** server grade từ immutable owner snapshot/key; **C** local/export-only đến khi protocol được duyệt.
- Display rounding: **A** exact fraction chính; **B** half-up2 chữ số kèm exact source; **C** precision/mode theo policy version owner duyệt.
- Grammar III: **A** giữ charset/length-only sa-charset-v1; **B** numeric grammar mới do owner quy định kèm version/migration. Không tự cấm --1/,5/01.
- Limits/grouping: **A** phê duyệt tạm1000 câu và nhóm I→II→III; **B** cấu hình limits/grouping version mới. Rational API **A** inverse toàn canonical output; **B** bound chung được duyệt, enforce/document cả hai chiều. Mẫu chuẩn cần owner chọn môn/năm/văn bản.

recommended_action: giao worker đúng VÙNG sửa findings, retest trên revision/hash cố định, giữ review độc lập và chưa nghiệm thu/deploy sản phẩm. tools_research: NOT_REQUESTED. privacy_notes: chỉ kết quả kỹ thuật, dữ liệu probes tổng hợp; không chứa chỉ thị riêng hay dữ liệu học sinh thật.

## Cutoff cuối — cập nhật khi worker sửa domain song song

Ngay trước bàn giao, worker thay `src/domain/rational.ts`, `src/domain/index.ts`, `test/domain/rational.test.ts`. Đã đọc toàn bộ diff mới: tách/export constants200/100, giữ nguyên logic limits và thêm3 tests boundary. HEAD vẫn0313b4f; bốn hashes web/collector/e2e phía trên không đổi. Không coi các thay đổi này là của reviewer.

- SHA256 rational: `068B140C1D0DF59AE759B6829AE961AFA2034C2A5D1F060A26D8BDE8E4AFB886`; index.ts: `C775EC7CCC1DF571B0D6D21795A98567C76FEDC0A1023C846C4F59601A96FD74`; rational.test: `4E26FD5D439015B3324509EF138ECB2C1E63B85102ADD4EA10E7A7BF493598B8`.
- `npm test` chạy lại: **exit0/tests366/suites59/pass366/fail0/cancelled0/skipped0/todo0/duration774.168ms**. Đây là gate cuối, thay counts363 của snapshot đầu.
- Hai lệnh TypeScript chạy lại exit0, không diagnostics. `node scripts/build.js` chạy lại exit0, các asset bytes và sample8 câu giữ nguyên.
- Probe F06 chạy lại exit0: canonical201 ký tự vẫn bị reject; F06 còn OPEN. Line parser limit nay `rational.ts:143` thay140. Constants công khai giúp thấy limits, chưa làm constructor/formatter/parser thống nhất theo inverse contract.
- Oracle/differential1632/deep DTO ở bảng trên đã chạy trước delta constants này; không gọi đó là rerun trên hash domain mới. Không có thay đổi số học trong diff mới; các findings web/collector vẫn áp dụng đúng hashes đã kiểm. Browser/Google thật giữ NOT_RUN.
- `git diff --check` xác nhận exit2 vì ops whitespace nêu trên; kiểm riêng path review exit0. Review không sửa file nào ngoài scope.
