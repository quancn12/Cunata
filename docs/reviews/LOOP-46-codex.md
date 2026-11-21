# LC46 — Kiểm định độc lập toàn sản phẩm

- review_id / task_id: LC46; reviewer: Codex; verified_at: 2026-11-22, Asia/Bangkok.
- base_commit / head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69` (HEAD thực tế).
- requirements_version: Shared Product Contract v2.0; WEB-contract.md toàn bộ §1–24; M1-scoring-contract kế thừa; docs/design/DESIGN.md.
- risk_level: HIGH — điểm, bài thi bền vững, đồng bộ, xác thực và tích hợp.
- verdict: **CHANGES_REQUESTED**. Các gate đã chạy đều xanh, nhưng **4 finding VERIFIED còn mở: 2 MAJOR, 2 MINOR**. Không phải phê duyệt phát hành hoặc nghiệm thu toàn bộ sản phẩm.
- recommended_action: giao sửa theo VÙNG của từng finding; thêm regression ở đường sử dụng thực; review lại snapshot sau sửa. Không sửa code trong LC46.

## Snapshot và delta từ review trước

Đã đọc git status/log/diff và LOOP-45-codex.md. Không có commit mới từ LC45. Cây làm việc vẫn có thay đổi chưa commit và file untracked của các tiến trình khác: source importer/report/schema/student, index.html, tests, dist, tài liệu và ops. Không ghi đè, khôi phục hay xóa chúng. Không có diff package/lock/tsconfig/scripts so với HEAD trong lần kiểm tra. Không đọc prompt riêng của agent khác.

Đối chiếu manifest thực của LC45 với LC46: mọi file chung trong source/scripts/public/apps-script/api/contracts/root runtime config/HTML có hash giống nhau; chỉ `plan.html` khác. Manifest LC46 có thêm README và hai styles do inventory rộng hơn, không có nghĩa chúng mới được sửa. Vì vậy bốn finding bên dưới là **tái kiểm độc lập các finding LC45**, không phải bốn lỗi mới. Không lấy nhãn “XANH” trong git log làm test evidence.

Để build và tests không sinh artifact ngoài scope trong repo, chép nguyên byte source, scripts, public, styles, apps-script, api, test, node_modules sẵn có, contracts/decisions và root config/HTML/README sang thư mục tạm `%USERPROFILE%\AppData\Local\Temp\LC46-hmaiwbkz`. Đây là bản sao kiểm định, không phải branch/worktree; không sửa source/tests tại bản sao. Mọi lệnh test/typecheck/build và probe dưới đây chạy ở đó; git/hash inventory chạy tại D:\Cunata. Build kết thúc trước khi chạy npm test. Không install, thêm dependency, commit, deploy hoặc gọi dịch vụ dữ liệu thật. Chỉ tạo báo cáo này trong repo.

Manifest `LC46-manifest.json`: **362 file**, SHA-256 `0301c6ea51750dfef7f14d6f7870a69feb77bd2990dea2b2be2c6d8e86cc756f`. Kiểm lại sau checks: chỉ plan.html drift, source/build input runtime không drift; HEAD không đổi. Không suy rộng kết quả cho source đến sau snapshot.

| File | SHA-256 snapshot |
|---|---|
| src/collect/index.ts | `0c7ae3471622ce5f6495ae36ba11cc0127e7454599f2cde5d52d51a52a5d0199` |
| src/app/main.ts | `c99e2b779ddb0657e293387d3d717d5e22c993ad88f0e8a898201207a81d10a0` |
| src/api/handle.ts | `418c1289d5c2f3dc2ae6de1fe5aef3bdc99f0b7722e4b5d29949f98cf9668c9c` |
| src/domain/rational.ts | `068b140c1d0df59ae759b6829ae961afa2034c2a5d1f060a26d8bde8e4afb886` |
| src/report/view.ts | `4b861a0e98d99db4a4153fbbe1171d610fc6770f09026ef2e9d5cc3c6a623573` |
| index.html | `3a84bb2726cd1cf2fbb373f4308f5efce7a56c4b675d619f5f36e766147a5ea8` |

files_reviewed: git delta source/tests/index; domain barrel/judge/scoring/rational/DTO; schema; storage finalize/CAS; student controller/area; report view và app renderer; collect enqueue/drain/transport và callers; API handle/auth/types, MemoryStore/NeonStore; teacher/bank entrypoints; import DOCX segmentation/PDF manual/preview confirmation; offline worker; build wrapper; assertions và harness liên quan. Kiểm định toàn sản phẩm theo luồng và rủi ro, không khẳng định đã đọc từng dòng hoặc thao tác tay mọi màn hình.

## Findings

### LC46-F01 — MAJOR — Outbox gửi chồng và chưa tiêu ngân sách trước dispatch

- **VÙNG chịu trách nhiệm: src/collect**; phối hợp src/app. VERIFIED; tiếp nối LC45-F01.
- affected_files: `src/collect/index.ts:408`, `:437`, `:446`, `:624`; callers `src/app/main.ts:1183`, `:1208`.
- evidence: drain kiểm budget/backoff nhưng không chặn record đang sending bằng durable lease. Chuyển sang sending chỉ tăng generation; retryCount tăng sau lỗi mới nhất. CAS chặn stale response update, không độc quyền request đang bay.
- reproduction_steps: Node stdin import API sản phẩm; parse `public/exams/hoa-repeating.json`; tạo storage bằng `createStoragePort(new MemoryTransactionAdapter())`; startAttempt rồi submit manual; enqueue endpoint fixture. Transport.send tăng calls và giữ promise pending. Gọi drainOutbox 6 lần cách nhau 5ms cùng tuple/storage; đọc outbox trước resolve. Assert thật: **calls=6, state=sending, retryCount=0, generation=8**. Resolve mọi promise, await mọi job, dispose controller. Không gửi mạng; probe exit 0 là xác nhận lỗi.
- expected: WEB §7/Shared §3, tối đa 5 lần gồm lần đầu, durable budget qua reload và không gửi chồng trong thời hạn một request.
- actual / impact: 6 request đồng thời chưa tiêu lần gửi nào; response cũ bị stale generation, nên chỉ lỗi mới nhất có thể tăng budget. Sweep/hai tab/reload có thể vượt budget/backoff; server dedupe không sửa được lỗi client này.
- minimal_fix: claim tuple bằng transaction với lease và reserve lượt trước dispatch; phục hồi sending sau lease expiry vẫn phải giữ lượt đã tiêu; bảo toàn hash/generation và confirmed terminal. Map khóa trong một trang không đủ cho hai tab/reload.
- regression_test: nhiều caller/tab, transport trì hoãn, đóng/reload sau dispatch trước receipt; không gửi chồng trong lease, tổng không quá 5; lost receipt retry cùng body; late response không hạ confirmed hoặc sửa final.

### LC46-F02 — MINOR — Parser phân số từ chối đầu ra canonical của formatter

- **VÙNG chịu trách nhiệm: src/domain.** VERIFIED; tiếp nối LC45-F02.
- affected_files: `src/domain/rational.ts:119`, `:132`, `:143`.
- evidence / reproduction_steps: qua public barrel, `s = toFractionString(rational(10n ** 200n))`; assert length=201; assert `parseFractionString(s)` ném SyntaxError. Node stdin exit 0.
- expected: M1 §4.1, parser là nghịch đảo chặt của formatter trên miền API công bố.
- actual / impact: constructor/formatter chấp nhận giá trị mà parser từ chối do cap 200 ký tự. Chưa thấy sai điểm trong giới hạn 1000 câu; không nâng thành lỗi công thức chấm.
- minimal_fix: giới hạn tài nguyên tại biên transport; giữ inverse public API. Nếu muốn bound cả miền rational phải đổi contract/version và enforce đồng nhất constructor/formatter/parser.
- regression_test: roundtrip 199/200/201 ký tự; tử/mẫu lớn, số âm và zero; reject dạng không canonical; inverse hai chiều.

### LC46-F03 — MINOR — assignExam nhận mã đề không tồn tại

- **VÙNG chịu trách nhiệm: src/api.** VERIFIED; tiếp nối LC45-F03.
- affected_files: `src/api/handle.ts:410`, `:416`.
- evidence: getExam trả null thì không kiểm trusted catalog; code vẫn saveAssignment.
- reproduction_steps: handle + MemoryStore thật; tạo teacher active, session hợp lệ bằng hashToken, lớp thuộc teacher; ctx.catalog=[]; POST assignExam với examId=`does-not-exist`, openAt hợp lệ và dueAt="". Assert **success=true**, `listAssignmentsByClass(...).length=1`. Node stdin exit 0; tất cả dữ liệu tổng hợp, không bypass xác thực hoặc ghi backend thật.
- expected: WEB §19, giao đề của mình/kho chung đang tồn tại; unknown ID không tạo assignment.
- actual / impact: tạo bài giao mồ côi; học sinh không tải được đề, có thể xảy ra khi caller stale sau gỡ đề. Không có bằng chứng lỗi này cho phép sửa đề người khác.
- minimal_fix: trước save, xác minh published exam trong phạm vi cho phép hoặc ID thuộc ctx.catalog tin cậy; unknown trả NOT_FOUND/INVALID_EXAM theo quy ước. Không tin catalog từ client.
- regression_test: unknown/deleted ID không tạo assignment; own published và static catalog vẫn giao được; đề người khác FORBIDDEN; dueAt rỗng vẫn hợp lệ.

### LC46-F04 — MAJOR — Filter/nav/luyện lại có trong module nhưng chưa tới báo cáo thực

- **VÙNG chịu trách nhiệm: src/app**; phối hợp src/report/src/student. VERIFIED; tiếp nối LC45-F04.
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; implementation chưa nối tại `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: app dùng renderer báo cáo riêng; không mount report/view với filter/nav/retryWrong. Tìm src/app/src/student không có wiring tương ứng. Test reportFilterNav dùng mock DOM/callback không chứng minh app có chức năng.
- reproduction_steps: harness Chrome/Edge headless thật, HTTP dist tại `/Cunata/`; startServer → launchBrowser → openApp → loadExam synthetic có 1 câu I + 1 câu III → submit → probe DOM. Assert **cards=2, filter=false, nav=false, retry=false**. Node stdin exit 0; đóng context/browser/server trong finally. Nạp file qua input ẩn chỉ là fixture kiểm định, không claim đây là luồng lớp/PIN.
- expected: WEB §24.1/24.5, báo cáo thực có filter all/wrong/blank, nav số câu và lượt luyện chỉ câu sai/bỏ trống, không gửi giáo viên.
- actual / impact: người dùng bản build không có ba control; tests module xanh che khoảng hở tích hợp. Đây là tính năng chưa hoàn tất, không phải sai điểm.
- minimal_fix: nối renderer/control vào app bằng report model chuẩn; implement retryWrong với lượt/snapshot/ID riêng, chỉ câu cần luyện, không assignment/collector, không sửa final gốc. Giữ order/shuffle/download/lifecycle.
- regression_test: HTTP/browser từ start/answer/submit đến filter/nav thực; click nav khi câu bị lọc; retry chỉ lấy câu cần luyện, không request submitResult và final gốc bất biến. Có II partial và ý bỏ trống; không chỉ kiểm callback mock.

## checks_run

Environment: Windows/PowerShell; Node **v24.14.0**, TypeScript **7.0.2**, Python **3.11.0**. npm.cmd/npx.cmd là Windows shim của lệnh yêu cầu. Logs bên dưới nằm trong thư mục temp snapshot nêu trên; probes có input/assertions/output và exit code trong tool transcript phiên LC46.

| Lệnh/check thực chạy | Exit | Kết quả |
|---|---:|---|
| `node scripts/build.js` | 0 | Validate + emit/verify/promote **339 files dist**; LC46-build.log. DEP0190 warning về shell child-process, không đổi exit. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics; compiler 7.0.2. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics. |
| `npm test` | 0 | **1606 tests, 345 suites; pass1606/fail0/cancelled0/skip0/todo0; 32330.1404ms**; LC46-npm.log. Chạy sau build, không sửa/skip/làm yếu test. |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | **104 tests, 5 suites; pass104/fail0/cancelled0/skip0/todo0; 54890.7597ms**; LC46-claude.log. Có design.test.mjs, root/module/subpath và browser thật; backend fixture, không phải Google/Neon thật. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/fail0/skip0; 1632 fixtures, 5849 maxima configs, 9 negative controls; reported duration_s=3.402; oracle-only. |
| Node stdin scoreAttempt + scoreResultToDTO đối chiếu oracle fixtures | 0 | **1632/1632 PASS**, total/maxTotal và score/max I/II/III khớp expected độc lập. Không suy rộng sang mọi DOM/raw/order. |
| Node stdin collector/rational/API probes | 0 | Tái hiện F01/F02/F03; 6/6 action addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults trả UNKNOWN_ACTION. Exit0 xác nhận assertions lỗi/chưa triển khai. |
| Node stdin HTTP real-browser report probe | 0 | Tái hiện F04: cards2/filterfalse/navfalse/retryfalse. |
| `git diff --check -- src scripts apps-script index.html docs/contracts` | 0 | Không whitespace error; có LF→CRLF warnings. |
| Hash inventory, LC45 parity và HEAD | 0 | Runtime source/config không drift; plan.html drift ngoài runtime; HEAD giữ nguyên. |
| Production Google/Neon/Vercel write/readback/CORS; OS Telex/VNI; Firefox/WebKit; screen reader; axe/Lighthouse; toàn bộ codex-check .mjs riêng | NOT_RUN | Không gửi dữ liệu thật/deploy theo task; không có phiên OS/đa engine/AT hoặc thực chạy các bộ công cụ này trong LC46. Không lấy output tiến trình khác làm checks của mình. |

## Recheck và coverage_gaps

- **M1:** exact III, blank khác false, II partial, max5/15/16/repeating và shuffle được hỗ trợ bởi suite + differential. F02 vẫn là ngoại lệ public inverse API. Không thấy sai công thức trong 1632 fixtures; không phải chứng minh toàn miền đầu vào.
- **M2:** storage transactional finalize/CAS, student timer/restore, report/download và offline đã có code và evidence suite/browser; không ghi toàn milestone là chưa triển khai. F04 còn thiếu integration. Chưa kiểm đầy đủ quota/private browsing, mọi migration/recovery/export/delete bằng thao tác người dùng, mọi media offline hoặc OS IME thật.
- **M3:** builder/bank/admin/lớp/giao đề có implementation; regression metadata/student name/import và full suite qua. Legacy bank quota fix vẫn hiện trong source và tests, không mở lại LC44-F02; LC46 không chạy riêng VM quota probe của LC45. F03 còn mở. Chưa thao tác tay mọi editor/taxonomy/large-bank state.
- **M4:** receipt/hash/CAS/outbox, SQL parameterization, authGen/session revocation và server dedupe có implementation/tests; F01 chưa sửa. `src/api/handle.ts:734` trở đi kiểm range/sum điểm client, chưa xác lập server grading bằng key/version tin cậy. Không chứng nhận phù hợp kỳ thi cần chống giả điểm/giấu đáp án. HTTP/MemoryStore/Neon fetch fixture không thay live SQL/CORS/owner readback.
- **M5:** DOCX/PDF manual không còn mặc định missing II key thành false; regression web-f08 trong full suite PASS. ZIP/XML/IR/provenance/preview có test. PDF manual là D06 đã duyệt, OCR/auto-PDF không phải lỗi cần tự thêm. Chưa đối chiếu corpus thực đủ rộng về nhiều cột, bảng gộp, hình, numbering, OMML để bảo đảm fidelity toàn diện.
- **M6:** design/layout/mobile/zoom/focus/contrast/injection có suite/browser evidence, chưa phải full audit mọi viewport/mode/AT hoặc secrets toàn git history. Chưa đo input→paint p95 trên máy học sinh thật hay chạy axe/Lighthouse độc lập. Không suy test performance xanh thành chứng nhận mọi thiết bị.
- **§23:** src/api có kiểu/bảng students, schema có optional student_id/studentId, nhưng sáu action probe đều UNKNOWN_ACTION; không coi field/bảng là roster/PIN hoặc lịch sử đa máy hoàn chỉnh.
- **§24:** tìm toàn src không thấy rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. Filter/nav/retry có trong report/view nhưng không tới app (F04). Phân biệt thiếu API/UI/integration với thiếu evidence.
- **Acceptance:** D01–D08 có quyết định bổ sung ở WEB §14 trở đi; không lặp các quyết định đã chốt như đang mở. Custom-only D05 và PDF manual D06 giữ nguyên. Owner acceptance/release evidence/rollback là gate riêng, không được thay bằng test xanh.

## Tính năng lộ trình còn thiếu — ưu tiên

1. **P1 — src/collect + src/app:** durable claim/lease/reserved budget F01 trước sync nhiều tab/reload. **src/api** chặn assignment mồ côi F03; **src/domain** khôi phục inverse API F02; giữ full gate xanh.
2. **P1 — src/api/src/collect/src/teacher/src/student:** hoàn thiện §23 roster/PIN: add/list/reset/remove theo quyền lớp; hash PIN/unique trong lớp; khóa 5 lần sai/10 phút server; studentLogin/studentToken; tên từ roster và student_id; myResults đa máy; bảng giáo viên có Chưa nộp. Sáu action chưa triển khai.
3. **P1 — src/app/src/report/src/student:** tích hợp §24.1 filter/nav và §24.5 lượt luyện câu sai/bỏ trống thật (F04), không gửi giáo viên/không sửa final. Regression II partial và ý bỏ trống trên đường app.
4. **P1 — src/api/src/teacher/src/report:** §24.2 xem bài từng học sinh và §24.3 examStats theo câu/phương án/top3 III sai; giữ snapshot/version khi nộp, chỉ tính submission hợp lệ. listResults hiện chiếu điểm/metadata, chưa cấp đủ full-content report.
5. **P1 — src/student/src/api:** §24.4 myHistory từ myResults, historyChart SVG và bảng chữ thay thế; lịch sử local không thay lịch sử đa máy qua PIN.
6. **P2 — src/teacher/src/report/src/ui:** §24.6 in đề không đáp án + phiếu I/II/III + trang key riêng; §24.7 nút theme Sáng/Tối/Theo máy nhớ local và WCAG AA. In báo cáo hoặc dark tokens hiện có không thay hai tính năng này.
7. **P2 — các vùng + glue:** evidence dịch vụ được duyệt/CORS/readback/dedupe; privacy/export/delete/backup/recovery; corpus DOCX, OS IME/đa browser/AT/performance máy thật; changelog/rollback và owner acceptance. Preset chuẩn THPT chỉ thêm sau owner chọn môn/năm/nguồn chính thức để verify; không tự cài OCR/PDF dependency.

## Quyết định và quyền

**NEED_DECISION: NONE đối với sửa lỗi/tích hợp trong contract hiện tại.** Không tự chốt policy mới. Riêng nếu muốn giữ cap rational bằng cách thay hợp đồng: A giữ inverse API và bound tại transport; B version mới bound đồng nhất constructor/formatter/parser. Contract hiện hành yêu cầu A, nên việc sửa không cần chờ chọn lại.

tools_research: NOT_REQUESTED. privacy_notes: chỉ fixtures tổng hợp, không credential/dữ liệu học sinh thật/nội dung chỉ thị riêng. Không sửa code, commit hoặc deploy. Báo cáo sẵn sàng để điều phối giao sửa, sản phẩm chưa được nghiệm thu hoàn tất.
