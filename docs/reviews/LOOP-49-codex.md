# LC49 — Kiểm định độc lập toàn sản phẩm

- review_id / task_id: LC49; reviewer: Codex; verified_at: 2026-11-22 (Asia/Bangkok).
- base_commit / head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`.
- requirements_version: Shared Product Contract v2.0; WEB-contract.md toàn bộ §1–24; M1-scoring-contract.md kế thừa; DESIGN.md.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED** — bốn finding VERIFIED còn mở (2 MAJOR, 2 MINOR), tiếp nối LC48; không phải bốn lỗi mới. Không phê duyệt phát hành/nghiệm thu toàn sản phẩm.
- recommended_action: sửa theo VÙNG bên dưới, thêm regression trên đường sử dụng thực, review lại snapshot sau sửa.

## Snapshot và phạm vi kiểm định

Đã đọc git status/log/diff và LOOP-48-codex.md. HEAD không đổi so LC48; working tree chứa nhiều source/test/dist/docs/ops đã sửa hoặc untracked từ công việc khác. Không reset, không commit, không dùng nhãn XANH trong commit làm bằng chứng. Không thấy delta package/lock/tsconfig/build scripts so HEAD.

Để giữ scope chỉ một báo cáo, copy nguyên byte source/scripts/public/styles/apps-script/api/test, node_modules đã có, contracts/decisions/design và các cấu hình/HTML gốc sang `%USERPROFILE%\AppData\Local\Temp\LC49-55qc2j_w`. Toàn bộ build/tests/probes/artifacts chạy tại bản sao; không branch/worktree/install/dependency/deploy. Có copy ops/publish.py và ops/blitz/promoted/_support phục vụ harness. Publish test chỉ fixture cô lập, không triển khai; GIT_DIR trỏ repo gốc chỉ để đọc SHA. Các thư mục output _audit được tạo trong bản sao cho harness.

Manifest `LC49-manifest.json`: **759 file**, SHA-256 `b23c52b33772bd25dbbf658d7216d2ff806c9d7d78753c326fe58ebda5fd5763`. Inventory gồm source/config module/docs và test text (không node_modules/ảnh). Đối chiếu trực tiếp từng byte với bản sao LC48 còn tồn tại: chỉ khác hai artifact `test/codex-check/cx/F02-browser.json`, `F03-browser.json` trong inventory này; **không có thay đổi mã runtime/test source so snapshot LC48**. Những thay đổi API concurrency so HEAD đã có từ LC48, không coi là fix mới cho bốn finding.

files_reviewed: domain index/rational/shortAnswer/judge/examMax/scoreAttempt/serialize; schema exam/types; storage index/migrate/backup và CAS/finalize/outbox; student index/area/assignment metadata; app main/report/collector callers; collect index/types/export/appsScript/transport; API handle/auth/types/Neon/Memory; teacher/bank entrypoints và versioning; ZIP/DOCX/PDF manual/preview; report index/download/view; offline worker; build scripts và assertions browser/regression. Review toàn sản phẩm theo luồng rủi ro và delta, không khẳng định đọc từng dòng hoặc thao tác tay mọi màn.

## Findings

### LC49-F01 — MAJOR — Dispatch chồng và chưa tiêu budget khi request đang bay

- **VÙNG chịu trách nhiệm: src/collect.** VERIFIED; tiếp nối LC48-F01.
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:476`, `:624`.
- evidence: drainOutbox không gate sending/lease; CAS đổi generation/state nhưng retryCount chỉ tăng sau await lỗi. Caller sau vẫn dispatch khi request trước chưa hoàn tất.
- reproduction_steps: `node LC49-probes.mjs` trong snapshot. Parse fixture hoa-repeating, tạo storage bằng MemoryTransactionAdapter/createStoragePort, startAttempt → submit manual → enqueue endpoint fixture. Transport giữ promise pending; gọi drainOutbox sáu lần cùng tuple, cách 5ms; đọc durable outbox trước resolve. Kết quả **calls=6, state=sending, retryCount=0, generation=8**. Resolve status503, await jobs, dispose controller; không gửi mạng.
- expected: WEB §7/Shared §3, retry durable có backoff/budget; tối đa 5 lần gồm lần đầu, một tuple không gửi chồng khi lease còn hiệu lực.
- actual / impact: sáu request đã dispatch nhưng budget vẫn 0; nhiều caller/tab/reload có thể gây tải không giới hạn. Server dedupe không thay giới hạn gửi client.
- minimal_fix: transaction claim lease theo tuple và reserve lượt trước dispatch; sending còn lease không dispatch; lease hết/reload vẫn giữ lượt đã tiêu, body/hash/idempotency key cố định; bảo toàn confirmed terminal. Map khóa trong một trang không đủ.
- regression_test: delayed transport + nhiều caller/tab, reload sau dispatch trước receipt; tối đa một in-flight/lease, tổng không quá 5; lost receipt retry cùng key/body, late receipt không đổi final hoặc hạ confirmed.

### LC49-F02 — MINOR — Parser rational không là nghịch đảo formatter

- **VÙNG chịu trách nhiệm: src/domain.** VERIFIED; tiếp nối LC48-F02.
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence / reproduction_steps: qua public barrel, `s = toFractionString(rational(10n**200n))` dài 201; `parseFractionString(s)` ném SyntaxError do cap 200. Probe xác nhận bằng assert. Constructor/formatter vẫn chấp nhận giá trị này.
- expected: M1 §4.1, parser là nghịch đảo chặt của formatter trên miền API công bố.
- actual / impact: roundtrip public API thất bại. Không thấy sai điểm trong cap 1000 câu; không nâng thành blocker scoring.
- minimal_fix: giữ inverse API; đặt resource bounds tại biên payload. Nếu muốn bound miền rational, version/contract và bound đồng nhất constructor/formatter/parser.
- regression_test: roundtrip 199/200/201 ký tự, tử/mẫu lớn, âm/zero; reject noncanonical và kiểm inverse hai chiều.

### LC49-F03 — MINOR — API nhận giao đề không tồn tại

- **VÙNG chịu trách nhiệm: src/api.** VERIFIED; tiếp nối LC48-F03.
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: published null không bị reject; không kiểm membership ctx.catalog trước saveAssignment.
- reproduction_steps: LC49-probes.mjs dùng MemoryStore thật, teacher active + session hash hợp lệ, lớp thuộc teacher, ctx.catalog=[]; POST assignExam với examId=does-not-exist, openAt ISO hợp lệ, dueAt="". **HTTP200/success=true; listAssignmentsByClass có một assignment**.
- expected: WEB §19/§22 chỉ giao đề tồn tại đúng quyền hoặc thuộc catalog tin cậy máy chủ; unknown không tạo assignment.
- actual / impact: tạo bài giao mồ côi, học sinh không nạp được đề; có thể gặp với caller stale sau khi gỡ đề. Không có bằng chứng sửa đề người khác.
- minimal_fix: kiểm published exam đúng quyền hoặc ID thuộc server catalog trước save; unknown trả NOT_FOUND/INVALID_EXAM theo quy ước. Không tin catalog client.
- regression_test: unknown/deleted không ghi; own/static vẫn giao được; other-owner FORBIDDEN; dueAt rỗng vẫn hợp lệ.

### LC49-F04 — MAJOR — Filter/navigation/luyện lại chưa nối vào báo cáo người dùng

- **VÙNG chịu trách nhiệm: src/app**, phối hợp src/report và src/student. VERIFIED; tiếp nối LC48-F04.
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; controls riêng tại `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: app dựng report riêng; không mount report/view hoặc nối retryWrong. Test riêng của module không chứng minh app có chức năng.
- reproduction_steps: `node LC49-browser-probe.mjs`; HTTP dist tại /Cunata/, trình duyệt thật qua harness sẵn có. openApp → loadExam fixture 1I+1III → submit bằng UI → đọc DOM: **cards=2, filter=false, nav=false, retry=false**. Assert rồi đóng browser/context/server. Nạp file ẩn chỉ để kiểm báo cáo; không claim luồng lớp/PIN.
- expected: WEB §24.1/24.5 có all/wrong/blank, aria-pressed/nav câu; luyện lại tạo lượt riêng chỉ câu sai/bỏ trống, không gửi giáo viên/đổi final gốc.
- actual / impact: ba control vắng trên bản build; phần code mới ở module chưa đến tay người dùng.
- minimal_fix: tích hợp renderer/controls bằng model chuẩn; lượt luyện có ID/snapshot riêng, không mang assignment/collector, giữ final gốc/order/download/lifecycle cleanup.
- regression_test: browser làm bài→nộp→filter/nav, nav câu bị lọc; retry đúng tập câu, gồm II partial/ý trống; không submitResult hoặc sửa final gốc; kiểm sau refresh, không chỉ callback mock.

## checks_run

Môi trường Windows/PowerShell, Node v24.14.0, TypeScript 7.0.2, Python 3.11.0. npm.cmd/npx.cmd là shim Windows của lệnh yêu cầu. Log/probes ở thư mục snapshot trên. Exit0 của bug probe nghĩa là tái hiện lỗi thành công.

| Lệnh/check thực chạy | Exit | Kết quả / artifact |
|---|---:|---|
| node scripts/build.js | 0 | Validate/typecheck/emit/promote **339 file dist**; LC49-build.log; warning DEP0190. |
| npx --no-install tsc -p tsconfig.json | 0 | Không diagnostics; LC49-tsc.log. |
| npx --no-install tsc -p tsconfig.web.json | 0 | Không diagnostics; LC49-tsc-web.log. |
| npm test, lần đầu | 1 | **1609 tests/345 suites, pass1607/fail2/skip0/cancelled0/todo0**, 172626.3271ms; LC49-npm.log. |
| npm test, chạy lại sau supplemental suites | 0 | **1609 tests/345 suites, pass1609/fail0/skip0/cancelled0/todo0**, 32042.2035ms; LC49-npm-recheck.log; source/assertion giữ nguyên. |
| node --test "test/claude-check/**/*.test.mjs" | 0 | **104 tests/5 suites, pass104/fail0/skip0/cancelled0/todo0**, 167691.0405ms; LC49-claude.log. Có design/browser root/dist/subpath/offline và backend fixture. |
| node --test --test-concurrency=1 "test/codex-check/**/*.test.mjs" | 0 | **198 tests/2 suites, pass198/fail0/skip0/cancelled0/todo0**, 160921.7429ms; LC49-codex.log. Tạo output dirs _audit trong bản sao; GIT_DIR chỉ đọc SHA; publish fixture không deploy. |
| python -B test/oracle/oracle.py --check | 0 | **11 pass/0 fail/0 skip**, 1632 fixtures, 5849 maxima configs, 9 negative controls; duration_s1.4349; LC49-oracle.log. Chỉ oracle độc lập. |
| node LC49-differential.mjs | 0 | **1632/1632** product scoreAttempt/DTO khớp expected độc lập cho total/maxTotal và score/max từng phần; LC49-differential.log. |
| node LC49-probes.mjs | 0 | Tái hiện F01/F02/F03; sáu action §23 UNKNOWN_ACTION; LC49-probes.log. |
| node LC49-browser-probe.mjs | 0 | Browser thật xác nhận F04, cards2/filter false/nav false/retry false; LC49-browser-probe.log. |
| git diff --check -- src scripts apps-script index.html docs/contracts | 0 | Không whitespace error; warning LF→CRLF. Chạy repo gốc, không sửa file. |
| Hash source/config/HEAD | 0 | Runtime/test source và root configs không drift; chỉ hai JSON artifact browser đổi. LC49-manifest.json + LC49-roots.json. |
| Production Google/Neon/Vercel CORS/write/readback/dedupe; OS Telex/VNI; Firefox/WebKit; AT; axe/Lighthouse | NOT_RUN | Không gọi endpoint thật/deploy; chưa thực chạy các môi trường/công cụ này. |

Hai test lỗi lần npm đầu: performance benchmark tại `test/browser/bundle-security-perf.test.ts:119` đo 152ms, vượt assertion `<150ms`; CK16-F01 tại `test/final-quality/ck12Regressions.test.ts:1154` timeout chờ browser DevTools 15000ms. Lượt đầu có thời gian chồng với supplemental suites; lượt full rerun sau khi chúng kết thúc xanh, không đổi source/assertion và không skip test. Đây là evidence phụ thuộc tải/môi trường, chưa đủ kết luận hai lỗi sản phẩm ổn định; **không đổi kết quả lần đầu thành PASS**. Benchmark dùng năm mẫu thao tác CDP, chưa chứng minh p95 input-to-paint trên máy học sinh theo mục tiêu §9.

Đối chiếu riêng các root file index.html/package/lock/tsconfigs/README/vercel hiện có với LC48 và repo gốc: không delta/drift (`LC49-roots.json`). Hash snapshot quan trọng: src/api/handle.ts `e841c1964a499236e100d53a9a53dfacb36047d93270fa0ab4edb5240c142107`; src/collect/index.ts `0c7ae3471622ce5f6495ae36ba11cc0127e7454599f2cde5d52d51a52a5d0199`; src/app/main.ts `c99e2b779ddb0657e293387d3d717d5e22c993ad88f0e8a898201207a81d10a0`; src/domain/rational.ts `068b140c1d0df59ae759b6829ae961afa2034c2a5d1f060a26d8bde8e4afb886`.

## coverage_gaps và tình trạng tính năng

- **M1:** tests/differential kiểm ID/shuffle, II blank khác false, III exact raw, max5/15/16/repeating. F02 mở; oracle arithmetic không thay kiểm mọi DOM/raw/order.
- **M2:** storage transactions/CAS/finalize, restore/timer/report/download và offline có code/tests; F04 thiếu integration. Chưa đi tay mọi quota/private browsing/migration/quarantine/backup/delete/media offline/recovery.
- **M3:** builder/bank/teacher/admin/lớp/giao đề có implementation/tests; F03 mở. API concurrency delta so HEAD có insert-only createTeacher, partial update/authGen nguyên tử, owner predicate trong DELETE và ba regression R1-REVIEW1-F01/F02/F03. SQL fetch fixture không chứng minh concurrency Neon thật. Chưa đi tay mọi editor/taxonomy/large-bank state.
- **M4:** range/sum client score, receipt/hash/CAS/terminal/idempotency/auth/SQL có tests. F01 mở. Server chưa recompute đáp án/version tin cậy; không chứng nhận kỳ thi cần chống giả điểm/giấu key. Backend fixture không thay CORS/write/receipt/readback/dedupe trên production.
- **M5:** DOCX/PDF II thiếu key giữ unresolved thay vì đoán false; preview/confirm có regression. PDF manual đúng D06; không coi OCR/auto extraction là tính năng đã có. Chưa đủ corpus thực mọi bảng gộp/nhiều cột/numbering/hình/Unicode/OMML.
- **M6:** browser/design/mobile/focus/offline/injection có checks; chưa kiểm mọi vai/viewport/theme/AT, toàn Git history secrets, OS Telex/VNI, Firefox/WebKit hoặc hiệu năng máy học sinh. Không đồng nhất composition-event mô phỏng với IME thật.
- **§23 NOT_IMPLEMENTED:** Student type/students table/student_id metadata chưa thành roster/PIN. Probe sáu action addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults đều UNKNOWN_ACTION; Store chưa có CRUD/session học sinh.
- **§24:** tìm src không có rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. filter/nav/retry chỉ có ở report/view, app chưa dùng (F04). Phân biệt module có code, integration thiếu và live evidence thiếu.
- **Acceptance:** áp dụng các quyết định D01–D08 đã chốt tại WEB §14 trở đi và thay đổi lớp/backend §21–22; không liệt kê quyết định đã chốt như còn mở. Changelog/rollback/live evidence và owner acceptance là gate riêng; suite xanh không đủ nghiệm thu.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P1 — src/collect, src/api, src/domain:** sửa F01 durable budget/lease, F03 orphan assignment, F02 inverse API, giữ regression đã có.
2. **P1 — src/api, src/collect, src/teacher, src/student:** §23 roster/PIN đầy đủ: thêm/list/reset/remove theo quyền lớp; PIN4 băm/khác nhau trong lớp, khóa5 sai/10 phút; studentToken, tên roster/student_id, myResults đa máy, giáo viên thấy Chưa nộp. Sáu API hiện UNKNOWN_ACTION.
3. **P1 — src/app, src/report, src/student:** §24.1/24.5 filter/nav/luyện lại trên app thật (F04); luyện riêng không gửi, không sửa final, xử lý II partial/ý trống.
4. **P1 — src/api, src/teacher, src/report:** §24.2 xem toàn bài từng học sinh; §24.3 thống kê mỗi câu, tỉ lệ chọn I/top3 III sai; chỉ final hợp lệ, giữ snapshot/version.
5. **P1 — src/student, src/api:** §24.4 myHistory từ myResults, SVG historyChart/bảng chữ; local history chưa thay lịch sử đa máy qua PIN.
6. **P2 — src/teacher, src/report, src/ui:** §24.6 in đề + phiếu trả lời I/II/III + key trang riêng; §24.7 nút Sáng/Tối/Theo máy nhớ lựa chọn, AA cả hai mode. Print report/dark tokens chưa đủ.
7. **P2 — các vùng + glue:** live service/CORS/readback/dedupe; export/delete/privacy/recovery; corpus importer, IME/đa engine/AT/performance; changelog/rollback/owner acceptance. Preset chuẩn chỉ sau owner chọn môn/năm/văn bản kiểm chứng; không tự thêm dependency/OCR.

## Quyết định và quyền

**NEED_DECISION: NONE cho các fix/tích hợp đã nêu.** Nếu muốn đổi miền rational: A giữ API hiện hành và bound tại transport (đúng hợp đồng hiện tại); B version miền bounded, cập nhật đồng nhất constructor/formatter/parser cùng migration/regression. Không cần chờ quyết định để làm A.

tools_research: NOT_REQUESTED. privacy_notes: fixture tổng hợp, không credential/dữ liệu học sinh thật/nội dung chỉ thị riêng. Trong repo chỉ tạo báo cáo này; không sửa code/install/dependency/commit/deploy. Sản phẩm chưa nghiệm thu hoàn tất.
