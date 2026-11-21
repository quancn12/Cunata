# LC47 — Kiểm định độc lập toàn sản phẩm

- review_id / task_id: LC47; reviewer: Codex; verified_at: 2026-11-22, Asia/Bangkok.
- base_commit / head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`.
- requirements_version: Shared Product Contract v2.0; toàn bộ WEB-contract.md §1–24; M1-scoring-contract kế thừa; DESIGN.md.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED** — **4 finding VERIFIED còn mở: 2 MAJOR, 2 MINOR**. Không phê duyệt phát hành/nghiệm thu toàn sản phẩm.
- recommended_action: điều phối giao sửa đúng VÙNG, thêm regression đường sử dụng thực và review snapshot sau sửa.

## Snapshot và phạm vi

Đã đọc git status/log/diff và LOOP-46-codex.md; HEAD không đổi. Cây làm việc có nhiều thay đổi/untracked source, index, tests, dist, docs và ops của các tiến trình khác; giữ nguyên. Package/lock/tsconfig/build scripts không có diff so HEAD. Không lấy nhãn XANH trong git log làm test evidence.

Sao chép nguyên byte source/scripts/public/styles/apps-script/api/test, node_modules sẵn có, contracts/decisions và root config/HTML/README sang thư mục tạm `%USERPROFILE%\AppData\Local\Temp\LC47-mlm_i2q8`. Build/test/probe chạy ở bản sao để không sinh artifact ngoài scope trong repo. Không tạo branch/worktree, sửa source/test, install, thêm dependency, commit hoặc deploy. Chỉ tạo báo cáo này trong repo.

Manifest `LC47-manifest.json`: **364 file**, SHA-256 `e3ae94a48bdca727240ec1d6cb9e8c5d759bd35061e2009a0db146006b8de680`. Mọi file chung với manifest LC46 giống hash trừ plan.html; hai file decisions có thêm do inventory rộng hơn, không kết luận đó là thay đổi mới. Manifest không gồm tests/node_modules. Recheck runtime inventory không drift ngoài plan.html; HEAD giữ nguyên. Findings dưới đây là **tái kiểm độc lập LC46-F01…F04, không phải lỗi mới**.

| File | SHA-256 snapshot |
|---|---|
| src/collect/index.ts | `0c7ae3471622ce5f6495ae36ba11cc0127e7454599f2cde5d52d51a52a5d0199` |
| src/app/main.ts | `c99e2b779ddb0657e293387d3d717d5e22c993ad88f0e8a898201207a81d10a0` |
| src/api/handle.ts | `418c1289d5c2f3dc2ae6de1fe5aef3bdc99f0b7722e4b5d29949f98cf9668c9c` |
| src/domain/rational.ts | `068b140c1d0df59ae759b6829ae961afa2034c2a5d1f060a26d8bde8e4afb886` |
| src/report/view.ts | `4b861a0e98d99db4a4153fbbe1171d610fc6770f09026ef2e9d5cc3c6a623573` |
| index.html | `3a84bb2726cd1cf2fbb373f4308f5efce7a56c4b675d619f5f36e766147a5ea8` |

files_reviewed: git delta importer/report/schema/student/index/tests; domain barrel/rational/judge/examMax/scoreAttempt/serialize; schema parse; storage finalize/CAS/outbox; student start/assignment metadata; app report renderer/collector callers; collect enqueue/drain/receipt; API handle/auth/types/MemoryStore/Neon SQL; teacher/bank entrypoints; importer segmentation/PDF manual/preview core; offline worker; build wrapper và harness/assertions. Review toàn sản phẩm theo hợp đồng và luồng rủi ro, không khẳng định đã đọc từng dòng/thao tác tay mọi màn.

## Findings

### LC47-F01 — MAJOR — Outbox gửi chồng và vượt budget trước khi request kết thúc

- **VÙNG chịu trách nhiệm: src/collect.** VERIFIED; tiếp nối LC46-F01.
- affected_files: `src/collect/index.ts:408`, `:435`, `:447`, `:476`, `:507`, `:624`.
- evidence: drain không chặn state sending; CAS tăng generation nhưng chưa reserve lần gửi. retryCount chỉ tăng sau await khi xử lý lỗi; response cũ bị STALE_GENERATION.
- reproduction_steps (Node stdin đã chạy, exit 0): parse public/exams/hoa-repeating.json; createStoragePort(new MemoryTransactionAdapter()); startAttempt với clock/ID tổng hợp, submit manual, enqueue endpoint fixture. Transport.send tăng calls và giữ promise pending. Gọi drainOutbox 6 lần cùng tuple/storage cách nhau 5ms. Đọc trước resolve: **calls=6, state=sending, retryCount=0, generation=8**. Resolve mọi promise bằng {status:503}, await các job, dispose controller trong finally. Không gửi mạng.
- expected: WEB §7/Shared §3, tối đa 5 lần gồm lần đầu, budget/backoff durable, không dispatch chồng trong thời hạn request.
- actual / impact: sáu request đang bay nhưng chưa tiêu budget; nhiều tab/sweep/reload có thể vượt giới hạn. Server dedupe không thay giới hạn gửi client.
- minimal_fix: transactional claim/lease theo tuple, reserve lượt trước dispatch; sending còn lease không gửi lại; phục hồi sau lease expiry vẫn giữ lượt đã tiêu. Pin tuple/hash/generation, bảo toàn final/confirmed terminal; Map khóa một trang không đủ qua tab/reload.
- regression_test: transport trì hoãn + nhiều caller/tab; reload sau dispatch trước receipt; một request trong lease, tổng không quá 5; lost receipt retry cùng body/key, late response không hạ confirmed/sửa final.

### LC47-F02 — MINOR — Parser từ chối chuỗi canonical do formatter tạo

- **VÙNG chịu trách nhiệm: src/domain.** VERIFIED; tiếp nối LC46-F02.
- affected_files: `src/domain/rational.ts:119`, `:132`, `:143`.
- evidence / reproduction_steps (public barrel, Node stdin exit 0): s=toFractionString(rational(10n ** 200n)); assert length=201; assert parseFractionString(s) ném SyntaxError. Constructor/formatter chấp nhận, parser cap 200 ký tự từ chối.
- expected: M1 §4.1, parser là nghịch đảo chặt của formatter trên miền API công bố.
- actual / impact: public roundtrip thất bại; chưa thấy sai điểm trong cap 1000 câu, không nâng thành blocker scoring.
- minimal_fix: giới hạn tài nguyên ở biên transport, giữ inverse API. Muốn bound toàn miền rational cần version/contract và enforce đồng nhất constructor/formatter/parser.
- regression_test: roundtrip 199/200/201 ký tự, tử/mẫu lớn, âm/zero, reject noncanonical; inverse hai chiều.

### LC47-F03 — MINOR — Giao đề thành công với mã đề không tồn tại

- **VÙNG chịu trách nhiệm: src/api.** VERIFIED; tiếp nối LC46-F03.
- affected_files: `src/api/handle.ts:410`, `:416`.
- evidence: getExam trả null thì không kiểm ID trong ctx.catalog; vẫn saveAssignment.
- reproduction_steps (Node stdin exit 0): handle/MemoryStore thật; teacher active, session hợp lệ qua hashToken, lớp thuộc teacher; ctx.catalog=[]; POST assignExam với examId=does-not-exist, openAt ISO hợp lệ, dueAt rỗng. Assert **status=200, success=true, listAssignmentsByClass.length=1**. Chỉ fixture tổng hợp, không ghi backend thật.
- expected: WEB §19, chỉ giao đề tồn tại của mình/kho chung; unknown bị từ chối, không tạo assignment.
- actual / impact: assignment mồ côi, học sinh không tải được đề; caller stale sau gỡ đề có thể gặp. Không có bằng chứng cho phép sửa đề người khác.
- minimal_fix: xác minh published exam đúng phạm vi hoặc ID thuộc catalog tin cậy máy chủ trước save; unknown trả NOT_FOUND/INVALID_EXAM theo quy ước; không tin catalog client.
- regression_test: unknown/deleted không tạo assignment; own/static vẫn giao được; other-owner FORBIDDEN; dueAt rỗng hợp lệ.

### LC47-F04 — MAJOR — Filter/nav/luyện lại chưa tới báo cáo thực

- **VÙNG chịu trách nhiệm: src/app**, phối hợp src/report/src/student. VERIFIED; tiếp nối LC46-F04.
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; module riêng tại `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: app render report riêng, không mount report/view/nối retryWrong; module/callback test không chứng minh app có chức năng.
- reproduction_steps (Node stdin HTTP + Chrome/Edge headless thật, exit 0): startServer(dist) dưới /Cunata/, launchBrowser/newContext/openApp; loadExam fixture 1 câu I + 1 III; submit bằng helper UI; assert DOM **cards=2, filter=false, nav=false, retry=false**. Đóng context/browser/server trong finally. Nạp input file ẩn chỉ là fixture báo cáo, không claim luồng lớp/PIN.
- expected: WEB §24.1/24.5 có filter all/wrong/blank, nav câu và lượt luyện mới chỉ câu sai/bỏ trống, không gửi giáo viên.
- actual / impact: cả ba control vắng mặt trên build; module/test xanh chưa hoàn tất chức năng người dùng.
- minimal_fix: nối renderer/control vào app bằng model chuẩn; retry tạo ID/snapshot/lượt riêng, bỏ assignment/collector, giữ final gốc; bảo toàn order/download/cleanup.
- regression_test: browser start→answer→submit→filter/nav; nav câu bị lọc; retry đúng câu cần luyện, có II partial/ý trống; không request submitResult/đổi final gốc. Không chỉ assert callback mock.

## checks_run

Windows/PowerShell; Node **v24.14.0**, TypeScript **7.0.2**, Python **3.11.0**. npm.cmd/npx.cmd là shim Windows của npm/npx được yêu cầu. Build xong trước npm/browser suites. Logs dưới thư mục snapshot; probes stdin có assertions/output/exit trong transcript LC47. Exit0 của probe lỗi là tái hiện thành công, không phải sản phẩm PASS.

| Lệnh/check thực chạy | Exit | Kết quả/artifact |
|---|---:|---|
| node scripts/build.js | 0 | Validate + emit/verify/promote **339 files dist**; LC47-build.log; có DEP0190 shell warning. |
| npx --no-install tsc -p tsconfig.json | 0 | Không diagnostics; LC47-tsc.log. |
| npx --no-install tsc -p tsconfig.web.json | 0 | Không diagnostics; LC47-tsc-web.log. |
| npm test | 0 | **1606 tests, 345 suites; pass1606/fail0/cancelled0/skip0/todo0; 63943.9208ms**; LC47-npm.log. |
| node --test "test/claude-check/**/*.test.mjs" | 0 | **104 tests, 5 suites; pass104/fail0/cancelled0/skip0/todo0; 62529.8785ms**; LC47-claude.log. Có design.test.mjs và browser thật root/dist/subpath/offline; backend fixture. |
| node --test "test/codex-check/**/*.test.mjs" | 1 | **155 tests, 2 suites; pass146/fail9/skip0/cancelled0/todo0; 193379.9114ms**; LC47-codex.log. 8 file cx thiếu ops helper; GLUE04 thiếu ops/publish.py trong bản sao. |
| node --test "test/codex-check/cx/*.test.mjs" "test/codex-check/feat/R1/glue.test.mjs" sau bổ sung helper | 1 | **57 tests; pass47/fail10/skip0/cancelled0/todo0; 23730.7907ms**; LC47-codex-recheck.log. Admin 8 ca + hook fail do thiếu Git metadata; schema 1 ca fail do thiếu thư mục output security. GLUE04 đã PASS. |
| node --test test/codex-check/cx/admin.test.mjs, GIT_DIR chỉ Git metadata gốc | 0 | **8 tests, pass8/fail0/skip0; 4259.379ms**; LC47-admin-recheck.log. Chỉ đọc SHA, không sửa Git. |
| node --test test/codex-check/cx/schema.test.mjs sau tạo thư mục output security tạm | 0 | **1 test, pass1/fail0/skip0; 1898.7755ms**; LC47-schema-recheck.log. |
| python -B test/oracle/oracle.py --check | 0 | 11 pass/0 fail/0 skip; 1632 fixtures, 5849 maxima configs, 9 negative controls; duration_s=8.3158; LC47-oracle.log; oracle-only. |
| Node stdin scoreAttempt + scoreResultToDTO so expected oracle | 0 | **1632/1632 PASS**, total/maxTotal và score/max từng phần khớp expected độc lập. |
| Node stdin collector/rational/API probes | 0 | Tái hiện F01/F02/F03; 6/6 action roster/PIN/history UNKNOWN_ACTION. |
| Node stdin HTTP real-browser report probe | 0 | Tái hiện F04: cards2/filterfalse/navfalse/retryfalse. |
| git diff --check -- src scripts apps-script index.html docs/contracts | 0 | Không whitespace error; LF→CRLF warnings. |
| Hash inventory/LC46 parity/HEAD | 0 | Runtime inventory không drift ngoài plan.html, HEAD giữ nguyên. |
| Production Google/Neon/Vercel CORS/write/readback; OS Telex/VNI; Firefox/WebKit; screen reader; axe/Lighthouse | NOT_RUN | Không gọi dịch vụ thật/deploy; chưa thực chạy các môi trường/công cụ này. |

Không ghi full glob Codex là PASS: hai lần exit1 vẫn giữ nguyên. Các lỗi setup đã được tái kiểm sau bổ sung nguyên byte ops/blitz/promoted/_support và ops/publish.py, tạo output tạm, cung cấp SHA qua GIT_DIR; không sửa source/assertion. Admin helper chỉ git rev-parse HEAD. Publisher chỉ chạy qua publish-probe.py với fixture nguồn/đích và chặn subprocess/git/network; không triển khai thật. Recheck không còn lỗi sản phẩm quan sát được ở các ca bị ảnh hưởng. Không dùng log tiến trình khác thay checks của mình.

## coverage_gaps và coverage theo milestone

- **M1:** rational; I theo ID; II blank khác false; III exact string; suite/differential xác nhận max5/15/16/repeating. F02 còn mở. 1632 fixtures không chứng minh toàn miền DOM/raw/order.
- **M2:** transaction finalize+outbox, CAS/stale rejection/confirmed terminal có code/tests; timer/restore/shuffle/report/download/offline có browser evidence. F04 thiếu integration. Chưa kiểm mọi quota/private browsing/migration/quarantine/backup/delete/recovery/media offline bằng thao tác người dùng.
- **M3:** builder/bank/admin/teacher/lớp/giao đề đã có implementation/checks; diff trim tên giữ khoảng trắng nội bộ; assignment/no-due/schema student_id có test. F03 còn mở. Chưa audit mọi editor/taxonomy/large-bank state bằng tay.
- **M4:** receipt/hash/CAS/outbox, dedupe, parameterized Neon SQL, authGen/session revocation có implementation/tests; F01 còn mở. src/api/handle.ts:734 trở đi kiểm range/sum điểm client, chưa recompute theo key/version tin cậy. Không chứng nhận kỳ thi cần chống giả điểm/giấu đáp án. API/SQL fixtures không thay live deployment/CORS/readback.
- **M5:** delta DOCX/PDF bỏ fallback missing II key thành false; regression test/import/web-f08-regression.test.ts trong full suite qua; preview/confirm riêng. PDF manual đúng D06, không tự thêm OCR/auto PDF. Chưa có corpus thực đủ rộng cho mọi bảng gộp/nhiều cột/numbering/hình/Unicode/OMML.
- **M6:** design/mobile/focus/offline và supplemental root/dist/teacher/admin/a11y/injection có checks thực. Chưa kiểm mọi viewport/role/theme/AT, secrets toàn Git history, OS IME/Firefox/WebKit hoặc input→paint p95 máy học sinh.
- **§23:** Student type/bảng students và optional student_id/studentId không thay roster/PIN hoàn chỉnh. Sáu action addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults đều UNKNOWN_ACTION qua probe thật.
- **§24:** tìm source không có rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. Filter/nav/retry có riêng report/view nhưng app không dùng (F04). Phân biệt thiếu triển khai/tích hợp/evidence.
- **Acceptance:** D01–D08 có quyết định ở WEB §14 trở đi, không lặp quyết định cũ như đang mở. Preset custom-only, PDF manual; evidence dịch vụ/changelog/rollback/owner acceptance là gate riêng.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P1 — src/collect:** F01 durable claim/lease/budget trước sync nhiều tab/reload; **src/api:** F03 assignment mồ côi; **src/domain:** F02 inverse API. Giữ gate/regression hiện có.
2. **P1 — src/api/src/collect/src/teacher/src/student:** §23 roster/PIN: add/list/reset/remove theo quyền lớp; PIN băm/duy nhất trong lớp; khóa 5 lần sai/10 phút server; studentLogin/studentToken; tên roster/student_id; myResults đa máy; bảng giáo viên có Chưa nộp. Sáu action còn UNKNOWN_ACTION.
3. **P1 — src/app/src/report/src/student:** §24.1 filter/nav và §24.5 lượt luyện câu sai/bỏ trống thật (F04), không gửi/đổi final gốc; regression II partial/ý trống.
4. **P1 — src/api/src/teacher/src/report:** §24.2 xem toàn bài từng học sinh, §24.3 examStats (% đúng, tỉ lệ chọn I, top3 III sai); giữ snapshot/version; chỉ submission hợp lệ. listResults điểm/metadata chưa thay full-content report.
5. **P1 — src/student/src/api:** §24.4 myHistory từ myResults, SVG historyChart + bảng chữ thay thế; lịch sử local không thay lịch sử đa máy qua PIN.
6. **P2 — src/teacher/src/report/src/ui:** §24.6 in đề không đáp án + phiếu I/II/III + trang key riêng; §24.7 Sáng/Tối/Theo máy nhớ local và AA hai mode. In report/dark tokens không thay tính năng này.
7. **P2 — các vùng + glue:** live evidence dịch vụ/CORS/readback/dedupe; privacy/export/delete/recovery; corpus importer, OS IME/đa engine/AT/performance máy thật; changelog/rollback/owner acceptance. Mẫu chuẩn THPT chỉ thêm sau owner chọn môn/năm/văn bản để kiểm chứng; không tự thêm dependency/OCR.

## Quyết định và quyền

**NEED_DECISION: NONE cho sửa lỗi/tích hợp trong hợp đồng hiện hành.** Không tự chốt policy. Nếu muốn đổi miền rational thay vì sửa inverse, owner cần chọn A giữ API hiện hành và bound tại transport, hoặc B version mới bound đồng nhất constructor/formatter/parser. Hợp đồng hiện hành yêu cầu A nên không chặn sửa để hỏi lại.

tools_research: NOT_REQUESTED. privacy_notes: chỉ fixture tổng hợp, không credential/dữ liệu học sinh thật/nội dung chỉ thị riêng. Không sửa code/install/thêm dependency/commit/deploy. Báo cáo sẵn sàng điều phối giao sửa; sản phẩm chưa được nghiệm thu hoàn tất.
