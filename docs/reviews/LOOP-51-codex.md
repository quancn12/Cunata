# LC51 — Kiểm định độc lập toàn sản phẩm

- review_id / task_id: LC51; reviewer: Codex; verified_at: 2026-11-22 (Asia/Bangkok).
- base_commit / head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`.
- requirements_version: Shared Product Contract v2.0; toàn bộ WEB-contract.md §1–24; M1-scoring-contract.md kế thừa; DESIGN.md.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED** — bốn finding VERIFIED còn mở: 2 MAJOR, 2 MINOR, tiếp nối LC50; không phải bốn lỗi mới. Không phê duyệt phát hành hoặc nghiệm thu toàn sản phẩm.
- recommended_action: sửa theo VÙNG bên dưới, bổ sung regression trên luồng sử dụng thực, kiểm định lại snapshot sau sửa.

## Snapshot, delta và phạm vi

Đã đọc git status/log/diff và LOOP-50-codex.md. HEAD không đổi so LC50. Working tree có nhiều thay đổi source/test/dist/docs/ops của công việc khác; không reset, commit hoặc coi nhãn XANH trong commit là bằng chứng kiểm định. Không có delta package/lock/tsconfig/build scripts so HEAD.

Để giữ scope chỉ một báo cáo, kiểm thử tại bản sao byte-for-byte `%USERPROFILE%/AppData/Local/Temp/LC51-df778jy8`, gồm src/scripts/public/styles/apps-script/test, node_modules có sẵn, contracts/decisions/design, root JSON/HTML/JS và README. Có ops/publish.py và ops/blitz/promoted/_support cho harness; output _audit nằm trong bản sao. Không branch/worktree/install/dependency/deploy. Supplemental dùng GIT_DIR của repo gốc chỉ để đọc SHA; publish-probe là fixture chặn commit/push, không triển khai.

Manifest `LC51-manifest.json`: **599 file**, SHA-256 `50b1533eaa125a82087418106c2bf30f9c1b1e33534615e47d4b13995692174b`. Đây là inventory text source/config/test/docs, không phải toàn bộ ảnh/node_modules/repo. So từng file với bản sao LC50: chỉ khác `test/codex-check/cx/F02-browser.json`, `F03-browser.json`, `plan.html`; **không có thay đổi mã runtime/test source so LC50**. Delta API concurrency so HEAD đã có ở review trước, không phải fix mới của bốn finding.

files_reviewed: kiểm git delta và đọc lại các đường rủi ro: domain rational/scoreAttempt/judge/examMax/serialize/barrel; schema exam/types; storage transaction saveDraft/finalize/outbox/migration; student start/resume/area; app report/collector callers; collect index/export/transport; API handle/auth/types/Memory/Neon; teacher publish/bank versioning; ZIP/DOCX segmentation/PDF manual/preview; report index/view/download; offline worker; build và assertions regression/browser. Đây là review toàn sản phẩm theo luồng và delta, không khẳng định đã đọc mới từng dòng hoặc thao tác tay mọi màn.

## Findings

### LC51-F01 — MAJOR — Gửi chồng cùng outbox chưa tiêu budget khi request đang bay

- **VÙNG chịu trách nhiệm: src/collect.** VERIFIED, tiếp nối LC50-F01.
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:476`, `:624`.
- evidence: không gate sending/lease; CAS tăng generation nhưng retryCount chỉ tăng sau await lỗi. Caller tiếp theo vẫn được gửi khi request trước pending.
- reproduction_steps: chạy `node LC51-probes.mjs` trong snapshot. Parse hoa-repeating; MemoryTransactionAdapter/createStoragePort → startAttempt → submit manual → enqueue endpoint fixture. Transport giữ promise pending; gọi drainOutbox sáu lần cùng tuple, cách 5ms; đọc durable outbox trước resolve. **calls=6, state=sending, retryCount=0, generation=8**. Resolve 503, await jobs và dispose; không gọi mạng.
- expected: WEB §7/Shared §3, retry durable theo từng tuple, tối đa 5 lần gồm lần đầu; một lease còn hiệu lực không có send chồng.
- actual / impact: sáu dispatch nhưng budget vẫn 0; nhiều caller/tab/reload có thể vượt budget và tăng tải. Dedupe máy chủ không thay giới hạn gửi client.
- minimal_fix: claim lease bằng transaction/CAS và reserve lượt trước dispatch; sending còn lease không dispatch; hết lease/reload vẫn giữ lượt đã tiêu; body/hash/idempotency key cố định và confirmed terminal. Khóa trong RAM một trang không đủ.
- regression_test: delayed transport, nhiều caller/tab và reload giữa dispatch/receipt; một in-flight/lease, tổng ≤5; lost receipt retry đúng key/body; late response không hạ confirmed hoặc sửa final.

### LC51-F02 — MINOR — Parser rational không là nghịch đảo formatter

- **VÙNG chịu trách nhiệm: src/domain.** VERIFIED, tiếp nối LC50-F02.
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence / reproduction_steps: qua public barrel, `s=toFractionString(rational(10n**200n))` dài 201; `parseFractionString(s)` ném SyntaxError vì cap 200. `LC51-probes.mjs` assert cả hai kết quả.
- expected: M1 §4.1, parser là nghịch đảo chặt của formatter trên miền API công bố.
- actual / impact: roundtrip API thất bại dù constructor/formatter nhận giá trị. Chưa thấy sai điểm trong cap 1000 câu; không phân loại blocker scoring.
- minimal_fix: giữ inverse API và bound tại biên payload. Nếu muốn miền rational bounded, cần version/contract và bound đồng nhất constructor/formatter/parser.
- regression_test: roundtrip 199/200/201 ký tự, tử/mẫu lớn, âm/zero; reject noncanonical; inverse hai chiều.

### LC51-F03 — MINOR — API cho giao đề không tồn tại

- **VÙNG chịu trách nhiệm: src/api.** VERIFIED, tiếp nối LC50-F03.
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: published null không bị reject, không kiểm membership ctx.catalog trước saveAssignment.
- reproduction_steps: `LC51-probes.mjs`, MemoryStore thật, active teacher/session hash hợp lệ và lớp thuộc teacher, ctx.catalog=[]; POST assignExam với examId=does-not-exist, openAt ISO hợp lệ, dueAt="". **HTTP200/success=true**, listAssignmentsByClass có một assignment.
- expected: WEB §19/§22, chỉ giao đề đúng quyền đang tồn tại hoặc đề trong catalog máy chủ tin cậy; unknown không ghi.
- actual / impact: tạo assignment mồ côi, học sinh không tải được đề; caller stale sau khi gỡ đề cũng có thể gặp. Không có bằng chứng sửa đề người khác.
- minimal_fix: kiểm published đúng quyền hoặc ID thuộc server catalog trước save; unknown trả NOT_FOUND/INVALID_EXAM theo quy ước. Không tin catalog client.
- regression_test: unknown/deleted không ghi; own/static vẫn giao được; other-owner FORBIDDEN; dueAt rỗng vẫn hợp lệ.

### LC51-F04 — MAJOR — Filter/navigation/luyện lại chưa nối vào báo cáo người dùng

- **VÙNG chịu trách nhiệm: src/app**, phối hợp src/report và src/student. VERIFIED, tiếp nối LC50-F04.
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; controls riêng tại `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: app dựng report riêng, không mount report/view hoặc nối retryWrong. Module tests không chứng minh app có chức năng.
- reproduction_steps: `node LC51-browser-probe.mjs`, HTTP dist tại /Cunata/, browser thật dùng harness có sẵn. openApp → loadExam fixture 1I+1III → submit qua UI → đọc DOM: **cards=2, filter=false, nav=false, retry=false**. Đóng context/browser/server. Nạp file ẩn để cô lập báo cáo, không coi đây là test luồng lớp/PIN.
- expected: WEB §24.1/24.5, có all/wrong/blank với aria-pressed, nav câu; retry tạo lượt luyện riêng chỉ câu sai/bỏ trống, không gửi giáo viên hoặc sửa final gốc.
- actual / impact: người dùng dist không có ba control dù renderer riêng đã có code. Ảnh mới `LC51-dist-report.png`, `LC51-dist-report-375.png` đã mở xem trực tiếp, xác nhận giao diện report thực tế ở 1280/375px.
- minimal_fix: nối renderer/controls với model chuẩn; lượt luyện ID/snapshot riêng, không assignment/collector; bảo toàn final/order/download và cleanup lifecycle.
- regression_test: browser làm→nộp→filter/nav, gồm nav tới câu đang bị lọc; retry đúng tập câu, II partial/ý trống; không submitResult hoặc sửa final gốc; kiểm sau refresh.

## checks_run

Môi trường Windows/PowerShell; Node v24.14.0, TypeScript 7.0.2, Python 3.11.0. npm.cmd/npx.cmd là shim Windows của lệnh yêu cầu. Logs/probes/screenshots tại `%USERPROFILE%/AppData/Local/Temp/LC51-df778jy8`, là artifact tạm, chưa commit. Exit 0 của bug probe nghĩa là tái hiện lỗi thành công, không phải đã sửa lỗi.

| Lệnh/check thực chạy | Exit | Kết quả / artifact |
|---|---:|---|
| node scripts/build.js | 0 | Emit/promote **339 file dist**; LC51-build.log. Warning DEP0190. |
| npx --no-install tsc -p tsconfig.json | 0 | Không diagnostics; LC51-tsc.log. |
| npx --no-install tsc -p tsconfig.web.json | 0 | Không diagnostics; LC51-tsc-web.log. |
| npm test — lần đầu | 1 | **1600 tests/345 suites, pass1584/fail14/skip2/cancelled0**, 50480.227ms; LC51-npm.log. Môi trường kiểm sai, xem giải thích dưới. |
| node scripts/build.js — sau khi suite đầu kết thúc | 0 | LC51-build-recheck.log; build riêng, không chạy chồng npm. |
| npm test — lần hai | 1 | **1600 tests/345 suites, pass1599/fail1/skip0/cancelled0**, 30242.1775ms; LC51-npm-recheck.log. Thiếu README trong bản sao; suite docs còn lỗi khởi tạo. |
| npm test — bản sao đã đủ README, sau build | 0 | **1609 tests/345 suites, pass1609/fail0/skip0/cancelled0/todo0**, 28845.2795ms; LC51-npm-final.log. Không sửa assertion/source/test. |
| node --test "test/claude-check/**/*.test.mjs" | 0 | **104 tests/5 suites, pass104/fail0/skip0/cancelled0**, 47286.0233ms; LC51-claude.log. Browser thật, backend fixture. |
| node --test --test-concurrency=1 "test/codex-check/**/*.test.mjs" | 0 | **198 tests/2 suites, pass198/fail0/skip0/cancelled0/todo0**, 161528.5782ms; LC51-codex.log. Một lượt, không sửa/skip assertion. |
| python -B test/oracle/oracle.py --check | 0 | **11 pass/0 fail/0 skip**, 1632 fixtures, 5849 maxima configs, 9 negative controls; duration_s2.3125; LC51-oracle.log. Oracle độc lập. |
| node LC51-differential.mjs | 0 | **1632/1632** product scoreAttempt/DTO khớp expected độc lập cho total/maxTotal và score/max từng phần; LC51-differential.log. |
| node LC51-probes.mjs | 0 | Tái hiện F01/F02/F03 và sáu action §23 UNKNOWN_ACTION; LC51-probes.log. Fixture tổng hợp, không gọi endpoint thật. |
| node LC51-browser-probe.mjs; node LC51-browser-visual.mjs | 0; 0 | Xác nhận F04 trong dist; logs tương ứng, hai ảnh dist mới đã xem. |
| git diff --check -- src scripts apps-script index.html docs/contracts | 0 | Không whitespace error; repo gốc, chỉ đọc. |
| Hash snapshot/source/contracts/HEAD cuối phiên | 0 | Không runtime/test-source/contracts drift, không runtime file mới, HEAD không đổi. Repo đổi plan.html; snapshot chỉ đổi F02-browser.json/F03-browser.json do harness. LC51-drift-final.json. |
| Production Google/Neon/Vercel CORS/write/readback/dedupe; OS Telex/VNI; Firefox/WebKit; AT; axe/Lighthouse | NOT_RUN | Không gọi dịch vụ thật/deploy; chưa thực chạy các môi trường/công cụ này. |

Hai lượt npm lỗi được giữ nguyên, không tính là PASS. Lượt đầu reviewer chạy build chồng npm trong cùng bản sao: staging/dist bị tranh chấp, kéo theo lỗi asset/import/browser; đồng thời bản sao thiếu README. Sau khi build riêng, lượt hai chỉ còn lỗi ENOENT README và suite docs không khởi tạo đủ test. Đã copy README nguyên byte từ repo gốc; lượt đầy đủ sau đó qua 1609/1609. Đây là lỗi thiết lập kiểm định, không phải thay đổi/sửa sản phẩm. Không xóa/skip/làm yếu test để xanh. Chênh count do suite docs trước đó không khởi tạo đủ ca; không suy từ 1600 rằng repo mất test.

Ca CSV nickname `@` từng thất bại intermittent ở LC50 không tái diễn trong lượt supplemental này; không đủ chứng cứ tuyên bố đã sửa root cause. Không đưa thành finding VERIFIED mới.

Hash snapshot quan trọng: src/api/handle.ts `e841c1964a499236e100d53a9a53dfacb36047d93270fa0ab4edb5240c142107`; src/collect/index.ts `0c7ae3471622ce5f6495ae36ba11cc0127e7454599f2cde5d52d51a52a5d0199`; src/app/main.ts `c99e2b779ddb0657e293387d3d717d5e22c993ad88f0e8a898201207a81d10a0`; src/domain/rational.ts `068b140c1d0df59ae759b6829ae961afa2034c2a5d1f060a26d8bde8e4afb886`. `plan.html` là tài liệu ngoài runtime; bản thay đổi trong phiên không được xem là đã review. Hai JSON browser chỉ là artifacts, không phải test source.

## coverage_gaps và tình trạng tính năng

- **M1:** domain tests và differential kiểm điểm I/II/III, blank II khác false, exact raw III, max5/15/16/repeating, IDs/shuffle. F02 vẫn mở. Differential chỉ so score/max, không thay kiểm mọi DOM/raw/order.
- **M2:** storage transactions/CAS/finalize, snapshot/restore/timer, report/download/offline có code và tests. F04 thiếu integration. Chưa kiểm tay mọi quota/private browsing/migration/quarantine/backup/delete/media offline/recovery.
- **M3:** builder/bank/teacher/admin/lớp/giao đề có implementation/tests. F03 mở. Delta API so HEAD dùng insert-only createTeacher, partial update/authGen nguyên tử và owner predicate trong DELETE; regression R1-REVIEW1-F01/F02/F03 đã ở suite. SQL fixture không chứng minh concurrency Neon thật.
- **M4:** outbox/receipt/hash/CAS/terminal/idempotency, auth và SQL có checks; F01 vẫn mở. Máy chủ kiểm range/sum client score nhưng chưa recompute theo key/version tin cậy. Không chứng nhận bài kiểm tra chống giả điểm/giấu key. Mock/fixture không thay CORS/write/receipt/readback/dedupe production.
- **M5:** DOCX/PDF II thiếu key giữ unresolved, không tự đoán false; preview/confirm có regression. PDF manual đúng D06, không coi auto extraction/OCR là tính năng đã có. Chưa đủ corpus thực mọi bảng gộp/nhiều cột/numbering/hình/Unicode/OMML.
- **M6:** có checks browser/mobile/theme/focus/offline/injection; hai ảnh dist report mới đã xem. Chưa kiểm mọi vai/viewport/state, toàn Git history secrets, OS IME, đa engine, AT hoặc input-to-paint p95 trên máy học sinh. Ảnh/test legacy không thay chứng cứ dist. Composition-event mô phỏng không phải Telex/VNI thật.
- **§23 NOT_IMPLEMENTED:** Student type/students table/student_id metadata chưa thành roster/PIN hoàn chỉnh. Probe `addStudents`, `listStudents`, `resetPin`, `removeStudent`, `studentLogin`, `myResults` đều UNKNOWN_ACTION (`src/api/handle.ts:597`); Store chưa có CRUD/session học sinh.
- **§24:** tìm trong src/app/student/teacher/admin/ui không thấy rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. Filter/nav/retry nằm ở report/view, chưa vào app (F04). Phân biệt code module, integration và evidence live.
- Áp dụng quyết định D01–D08 đã chốt tại WEB §14 trở đi cùng §21–22 và không-hạn-nộp §19.2a; không liệt kê lại các quyết định này như còn mở. Changelog/rollback/live evidence/owner acceptance là gate riêng, suite xanh chưa đủ nghiệm thu.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P1 — src/collect, src/api, src/domain:** sửa F01 durable budget/lease, F03 assignment mồ côi, F02 inverse API; giữ regression hiện có.
2. **P1 — src/api, src/collect, src/teacher, src/student:** §23 roster/PIN trọn luồng: CRUD theo quyền lớp; PIN4 băm, khác nhau trong lớp, 5 sai/khóa10 phút; studentToken, tên roster/student_id, myResults đa máy; giáo viên thấy Chưa nộp. Hiện sáu action UNKNOWN_ACTION.
3. **P1 — src/app, src/report, src/student:** §24.1/24.5 filter/nav/luyện lại trong app thật (F04); luyện riêng không gửi/đổi final, gồm II partial/ý trống.
4. **P1 — src/api, src/teacher, src/report:** §24.2 bài làm đầy đủ từng học sinh; §24.3 thống kê mỗi câu, tỉ lệ chọn I/top3 III sai; chỉ final hợp lệ, giữ snapshot/version.
5. **P1 — src/student, src/api:** §24.4 myHistory qua myResults, SVG historyChart và bảng chữ; lịch sử local hiện tại không thay lịch sử đa máy qua PIN.
6. **P2 — src/teacher, src/report, src/ui:** §24.6 in đề + phiếu trả lời I/II/III + key trang riêng; §24.7 Sáng/Tối/Theo máy nhớ lựa chọn, AA cả hai mode. Print report/dark tokens chưa đáp ứng đầy đủ.
7. **P2 — các vùng + glue:** service/CORS/readback/dedupe live; export/delete/privacy/recovery, corpus importer, IME/đa engine/AT/performance; changelog/rollback/owner acceptance. Preset chuẩn chỉ sau owner chọn môn/năm/văn bản kiểm chứng; không tự thêm dependency/OCR.

## Quyết định và quyền

**NEED_DECISION: NONE cho các fix/tích hợp nêu trên.** Với F02, A giữ miền API hiện hành, bound tại transport là cách sửa theo contract; B nếu muốn đổi sang miền rational bounded thì phải duyệt/version miền và cập nhật đồng nhất constructor/formatter/parser, migration/regression. Không cần chờ quyết định để làm A.

tools_research: NOT_REQUESTED. privacy_notes: fixture tổng hợp; không credential, dữ liệu học sinh thật hoặc nội dung chỉ thị riêng. Trong repo chỉ tạo báo cáo này; không sửa code/install/dependency/commit/deploy. Sản phẩm chưa nghiệm thu hoàn tất.
