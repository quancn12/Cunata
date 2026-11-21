# LC45 — Kiểm định độc lập toàn sản phẩm

- review_id / task_id: LC45; reviewer: Codex; verified_at: 2026-11-22 (Asia/Bangkok).
- base_commit / head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`.
- requirements_version: Shared Product Contract v2.0; toàn bộ WEB-contract.md §1–24 và M1-scoring-contract kế thừa; DESIGN.md cho giao diện.
- risk_level: HIGH — dữ liệu bài thi, đồng bộ, backend, tích hợp chức năng mới.
- verdict: **CHANGES_REQUESTED**. Gate test/typecheck/build hiện xanh trên snapshot đã kiểm, nhưng còn 4 finding VERIFIED (2 MAJOR, 2 MINOR), cùng backlog §23–24 chưa hoàn tất. Không phải approval phát hành hoặc nghiệm thu toàn sản phẩm.
- recommended_action: giao sửa theo VÙNG bên dưới, thêm regression ở đường app thực, chạy lại gate trên snapshot sau sửa. Không sửa code trong LC45.

## Snapshot, delta và phạm vi

Đã đọc git status/log/diff thực tế và báo cáo LC44. LC44 cùng HEAD; **0 commit mới** từ cutoff đó. Delta review hiện tại chủ yếu là working tree: legacy bank/collector trong index.html; DOCX segmentation/PDF manual; report view; schema student_id; student area; các test liên quan. Không coi lời ghi “XANH” trong commit là bằng chứng của LC45.

Working tree có sẵn nhiều thay đổi src/dist/tests, ops/plan và file untracked của các tiến trình khác. Không khôi phục/xóa/ghi đè chúng. Không tìm thấy AGENTS.md trong inventory gốc D:\, D:\Cunata hoặc các thư mục src/docs/ops đã tra. Không tạo branch/worktree, install dependency, commit, deploy hay gọi dịch vụ thật. Chỉ tạo file báo cáo được giao.

Để test/build không sinh artifact ngoài scope trong repo, đã chép nguyên byte src/scripts/public/styles/apps-script/api/test, contracts/design/decisions, root config/HTML/README và node_modules có sẵn sang `%USERPROFILE%\AppData\Local\Temp\LC45-h5ycwwyh`. Đây là thư mục tạm kiểm định, không phải Git worktree; không sửa source/tests trong đó. Tất cả lệnh test/typecheck/build và probes bên dưới chạy tại bản sao, trừ git/hash inventory. Log và manifest ở thư mục tạm này, không phải artifact được commit.

Manifest SHA-256 cho 359 file source/build/public/contracts/root config: `b85afd323fec31ea3e4752fe465eb5d3d8e12c79fe421ed421c8b8be7b807be1` (`LC45-snapshot.json`). Kiểm lại workspace sau checks: HEAD không đổi; chỉ `plan.html` drift trong manifest, không phải runtime/build input của các checks đã chạy. Source/scripts/public/apps-script/contracts và config runtime đã kiểm không drift. Không suy rộng kết quả cho các thay đổi xảy ra sau snapshot.

| File | SHA-256 của snapshot |
|---|---|
| src/collect/index.ts | `0c7ae3471622ce5f6495ae36ba11cc0127e7454599f2cde5d52d51a52a5d0199` |
| src/app/main.ts | `c99e2b779ddb0657e293387d3d717d5e22c993ad88f0e8a898201207a81d10a0` |
| src/api/handle.ts | `418c1289d5c2f3dc2ae6de1fe5aef3bdc99f0b7722e4b5d29949f98cf9668c9c` |
| src/domain/rational.ts | `068b140c1d0df59ae759b6829ae961afa2034c2a5d1f060a26d8bde8e4afb886` |
| src/report/view.ts | `4b861a0e98d99db4a4153fbbe1171d610fc6770f09026ef2e9d5cc3c6a623573` |
| index.html | `3a84bb2726cd1cf2fbb373f4308f5efce7a56c4b675d619f5f36e766147a5ea8` |

files_reviewed: delta nêu trên; đường scoring/domain barrel, scoreAttempt/rational/DTO; schema; storage finalize/CAS; student start/submit; collector enqueue/drain và app sweep; app report renderer và report view; API handle/auth/types/MemoryStore/NeonStore; import DOCX/PDF và preview confirmation; offline worker; build wrapper; legacy bank; assertions/harness của full suite và claude-check. Đây là kiểm định theo luồng/rủi ro toàn sản phẩm, không khẳng định đã đọc từng dòng của mọi file hoặc thao tác mọi màn hình bằng tay. Không đọc prompt riêng của agent khác.

## Findings

### LC45-F01 — MAJOR — Outbox vẫn gửi chồng và chưa tiêu ngân sách trước dispatch

- **VÙNG chịu trách nhiệm: src/collect. VERIFIED; LC44-F01 còn mở.** Phối hợp caller tại src/app.
- affected_files: `src/collect/index.ts:408`, `:437`, `:446`, `:624`; callers `src/app/main.ts:1183`, `:1208`.
- evidence: drain từ chối failed/exhausted và kiểm nextRetryAt, nhưng không từ chối record đang sending hoặc claim lease. Chuyển sang sending tăng generation, không tăng retryCount; count chỉ tăng sau lỗi của generation mới nhất. Caller sau có thể đọc generation đã tăng và tiếp tục gửi. CAS chặn stale state update, không bảo đảm request độc quyền.
- reproduction_steps (đã chạy Node stdin, exit 0): parse `public/exams/hoa-repeating.json`; tạo storage bằng `createStoragePort(new MemoryTransactionAdapter())`; startAttempt rồi submit manual; enqueue endpointId fixture. Transport.send tăng calls và trả promise chưa resolve. Gọi drainOutbox 6 lần cách nhau 5 ms, cùng key/storage. Đọc outbox trước khi resolve transport. Assert thật: **calls=6, state=sending, retryCount=0, generation=8**. Sau đó resolve mọi promise và await mọi job, dispose controller. Không gửi mạng.
- expected: WEB §7/Shared §3 — tối đa 5 lần gồm lần đầu, budget bền vững qua reload; tránh gửi chồng cùng tuple khi request còn hiệu lực.
- actual / impact: 6 request đang bay vẫn chưa tiêu lần gửi nào trong storage. Những response cũ bị stale generation; chỉ lỗi mới nhất tăng count. Hai tab/reload/sweep có thể vượt budget/backoff dù server dedupe vẫn ngăn trùng dòng.
- minimal_fix: transaction claim/lease theo tuple, reserve lượt trước dispatch; chỉ phục hồi sending khi lease hết hạn và vẫn tính lượt đã tiêu. Giữ hash/generation và server_confirmed terminal; khóa Map riêng một trang không đủ.
- regression_test: caller song song/hai tab, request bị trì hoãn, kill/reload sau dispatch trước receipt; không chồng trong lease và tổng không quá 5; lost receipt retry cùng body/idempotency; late receipt không đổi final khác hoặc hạ confirmed.

### LC45-F02 — MINOR — Public rational parser từ chối output canonical của formatter

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED; LC44-F03 còn mở.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:143`.
- evidence / reproduction_steps (public barrel, Node stdin exit 0): `s = toFractionString(rational(10n ** 200n))`; assert length=201; `parseFractionString(s)` ném SyntaxError do cap 200.
- expected: M1 §4.1 yêu cầu parser là nghịch đảo chặt của formatter; canonical output phải roundtrip.
- actual / impact: constructor/formatter nhận giá trị mà parser từ chối. Chưa thấy sai điểm đề tối đa 1000 câu, nên MINOR; không báo thành lỗi công thức chấm.
- minimal_fix: đặt resource limit ở transport boundary thay vì phá inverse public API. Nếu muốn giới hạn cả miền API thì cần thay contract/version và enforce đồng nhất constructor/formatter/parser.
- regression_test: roundtrip length 199/200/201; tử/mẫu lớn, số âm, zero; reject dạng không canonical; inverse hai chiều trên miền công bố.

### LC45-F03 — MINOR — assignExam chấp nhận mã đề không tồn tại

- **VÙNG chịu trách nhiệm: src/api. VERIFIED; LC44-F04 còn mở.**
- affected_files: `src/api/handle.ts:410`, `:416`.
- evidence: chỉ kiểm owner khi getExam trả published record; trường hợp null không kiểm trusted catalog trước saveAssignment.
- reproduction_steps (handle + MemoryStore thật, Node stdin exit 0): tạo teacher active, session hợp lệ bằng hashToken và lớp thuộc teacher; ctx.catalog=[]; POST assignExam với examId=`does-not-exist`, openAt hiện tại, dueAt="". Assert **success=true và assignments.size=1**. Không backend thật. Quyền/session là fixture tổng hợp; không bypass xác thực.
- expected: WEB §19.1/§19.2 — giao đề của mình hoặc kho chung đang tồn tại; unknown ID không tạo assignment.
- actual / impact: assignment mồ côi, học sinh không thể tải đề tương ứng; có thể gặp khi caller stale sau gỡ đề. Không có bằng chứng lỗi này cho phép sửa đề người khác.
- minimal_fix: xác minh published exam trong phạm vi được phép hoặc ID trong ctx.catalog tin cậy trước khi save; unknown trả NOT_FOUND/INVALID_EXAM theo quy ước. Không dùng catalog client làm bằng chứng.
- regression_test: unknown/deleted ID không tạo assignment; own published/static catalog vẫn giao được; đề người khác FORBIDDEN; dueAt rỗng vẫn hợp lệ.

### LC45-F04 — MAJOR — Bộ lọc/xem số câu/luyện lại mới chưa tới màn báo cáo thực

- **VÙNG chịu trách nhiệm: src/app. VERIFIED, finding tích hợp mới.** src/report phối hợp callback luyện lại.
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; implementation chưa được dùng tại `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: main dựng và render báo cáo bằng đường riêng, không mount report/view. Tìm toàn src/app/src/student không có wiring reviewFilter/reviewNav/retryWrong. report/view có control và gọi actions.retryWrong nếu được inject; chỉ thêm control vào module này chưa làm app có tính năng.
- reproduction_steps (Chrome/Edge headless thật qua CDP harness có sẵn, Node stdin exit 0): startServer('dist') dưới `/Cunata/`, launchBrowser → openApp khu học sinh → loadExam synthetic có 1 câu I + 1 câu III → submit → waitReport. Probe DOM assert **cards=2, filter=false, nav=false, retry=false**. Đã đóng context/server/browser trong finally. Test module `test/report/view/reportFilterNav.test.ts` vẫn pass, nhưng dùng DOM mock + callback tự cung cấp.
- expected: WEB §24.1/§24.5 — báo cáo thực có bộ lọc all/wrong/blank, reviewNav và lượt luyện câu sai/bỏ trống có nhãn không gửi giáo viên.
- actual / impact: học sinh vẫn không có các control này trong bản build; test module xanh không phát hiện thiếu tích hợp. Đây là chức năng chưa hoàn tất, không phải lỗi điểm.
- minimal_fix: nối renderer được dùng thực vào app, hoặc nối các control vào renderer hiện hành bằng cùng model chuẩn. Implement retryWrong tạo lượt chỉ gồm câu cần luyện với ID/snapshot riêng, không gửi collector/assignment và không sửa final gốc. Giữ shuffle/order, report download và cleanup lifecycle hiện có.
- regression_test: HTTP/browser từ load/start/answer/submit → filter/nav hoạt động trên báo cáo thực; điều hướng đúng câu kể cả sau lọc; luyện lại chỉ lấy câu cần luyện, không request submitResult, final gốc bất biến. Test cả Phần II partial và bỏ trống từng ý; không chỉ mock callback.

## Recheck các sửa đổi và finding cũ

- **LC44-F02 legacy bank: FIXED trong phạm vi đã kiểm.** save/update/import/delete/clear hiện propagate lỗi; UI callers có catch báo lỗi. Probe VM trích nguyên 5 hàm get/save/import/remove/clear từ HTML, localStorage.setItem/removeItem ném QuotaExceededError: cả add/update/import/delete/clear đều throw và bytes bank cũ giữ nguyên. Không còn import báo count thành công khi ghi thất bại. Đây là VM thực thi mã sản phẩm, không phải browser quota click-test; chưa chứng minh mọi thiết bị lưu trữ.
- DOCX/PDF manual bỏ `answer ?? false` ở ý II thiếu đáp án. Regression `test/import/web-f08-regression.test.ts` nằm trong full suite PASS: thiếu/giải quyết một phần key không confirm/publish được; teacher cung cấp đủ boolean mới publish. Không suy từ test synthetic thành xác nhận mọi DOCX thực tế.
- student area setCandidateName trim và cập nhật name gate; các ca nhớ vai/tên, hidden-file candidate name, refresh/autosubmit qua claude-check PASS.
- schema thêm student_id/studentId chỉ là kiểu tùy chọn; chưa phải roster/PIN hoặc myResults đa máy. Các API §23 vẫn UNKNOWN_ACTION (6 action đã probe bên dưới).
- LC44 full-suite performance/offline failures: **không tái hiện ở lần chạy serial LC45**, 1606/1606 PASS. Không gọi những failure cũ là đang fail trong LC45 và không tuyên bố đã chứng minh nguyên nhân gốc của tính không ổn định trước đó.

## checks_run

Environment: Windows/PowerShell; Node v24.14.0; TypeScript 7.0.2; Python 3.11.0; browser thật từ harness hiện có, không cài tool. npm.cmd/npx.cmd là shim Windows của lệnh yêu cầu. Snapshot temp nêu trên là cwd cho mọi lệnh test/build. Artifact là đường dẫn tương đối trong temp, trừ tool transcript.

| Check thực chạy | Exit | Kết quả / evidence |
|---|---:|---|
| `npm test` — lần đầu, trùng lúc build | 1 | 1606 tests; pass1591/fail13/skip2, suites345; 23855.4123ms; `LC45-npm.log`. Bản sao chưa có dist khi test bắt đầu và build đang dùng staging: lỗi missing dist/staging và một API browser flow. Đây là lỗi điều kiện chạy do LC45 gây ra, không quy thành finding sản phẩm. |
| `npm test` — sau khi build đã kết thúc | 0 | **1606 tests, 345 suites, pass1606/fail0/cancelled0/skip0/todo0**, 29239.8983ms; `LC45-npm-serial.log`. Không sửa/skip/làm yếu test giữa hai lần. Đây là full gate cuối. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics, compiler 7.0.2; tool transcript. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics; tool transcript. |
| `node scripts/build.js` | 0 | Validate + emit/verify/promote **339 files dist**; `LC45-build.log`. Có DEP0190 warning từ shell child process, không đổi exit. |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | **104 tests, 5 suites, pass104/fail0/skip0**, 43068.7278ms; `LC45-claude.log`. Browser thật cho root/module/subpath; backend fixture, không phải Google/Neon thật. Bao gồm design.test.mjs. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/fail0/skip0; 1632 cases, 5849 maxima configs, 9 negative controls; duration1.1062s; tool transcript. Oracle-only. |
| Node stdin domain scoreAttempt + scoreResultToDTO → oracle fixtures | 0 | **1632/1632** khớp expected độc lập ở total/maxTotal và score/max của I/II/III. Assert count=1632; tool transcript. Không mở rộng kết luận sang mọi DOM/status/order. |
| Node stdin collector + rational probes | 0 | F01 calls6/retryCount0/generation8; F02 formatter length201 bị parser từ chối; assertions thật, tool transcript. Exit0 là probe xác nhận lỗi, không phải tính năng đạt. |
| Node stdin handle + MemoryStore | 0 | F03 unknown exam được giao; addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults **6/6 UNKNOWN_ACTION**. Tool transcript. |
| Node stdin legacy bank quota VM | 0 | 5 mutations throw khi quota; bytes cũ nguyên vẹn; tool transcript. |
| Node stdin HTTP real-browser report probe | 0 | F04 report cards2/filterfalse/navfalse/retryfalse; tool transcript. |
| `git diff --check -- src scripts apps-script index.html docs/contracts` | 0 | Không whitespace error; có cảnh báo LF→CRLF. |
| Hash parity / git HEAD | 0 | Runtime source/config snapshot không drift; plan.html đổi ngoài checks; HEAD giữ nguyên. |
| Google/Neon/Vercel production, CORS/write/readback; OS Telex/VNI; Firefox/WebKit; screen reader; axe/Lighthouse; toàn bộ codex-check .mjs độc lập | NOT_RUN | Không deploy/gửi dữ liệu thật theo task; không có phiên kiểm OS/đa engine/AT hoặc chạy các công cụ này trong LC45. Không lấy kết quả của tiến trình khác làm checks của mình. |

## coverage_gaps và đối chiếu toàn sản phẩm

- **M1/scoring:** full suite, browser anchors và differential hỗ trợ exact III, blank≠false, II partial, maxima5/15/16/repeating rational và shuffle. F02 là ngoại lệ inverse API. Không tìm thấy bằng chứng sai công thức trong 1632 fixtures; không phải chứng minh toàn miền đầu vào.
- **M2/student/storage/report:** IDB durable attempt, deadline/autosubmit, restore, two-tab và cold offline đã có evidence browser. Không gọi cả M2 là chưa triển khai. F04 chứng minh khoảng hở giữa report module và app thực. Chưa kiểm OS IME, private browsing/quota đầy đủ trên nhiều engine, toàn bộ backup/migration/recovery bằng thao tác người dùng hoặc mọi ảnh offline.
- **M3/teacher/bank/admin/classes:** các luồng hiện có được suite hỗ trợ; legacy quota finding cũ đã sửa trong probe. F03 vẫn tạo assignment mồ côi. Roster/PIN §23 chưa có API public; không coi bảng students/field type là chức năng hoàn chỉnh. Chưa nghiệm thu tay mọi editor/taxonomy/large-bank state.
- **M4/collect/backend:** outbox/receipt/hash/dedupe/CSV và API Vercel-Neon đã hiện hữu. F01 còn phá budget khi chồng request. API kiểm consistency/range điểm client, chưa xác lập trusted grading từ answer key/snapshot máy chủ; không chứng nhận phù hợp kiểm tra cần chống giả điểm/giấu key. Unit/HTTP fixture không thay live Neon SQL/CORS/owner readback.
- **M5/import:** sửa missing-key II đúng hướng; ZIP/XML/IR/provenance/preview có tests. PDF manual đúng D06; OCR/auto PDF không phải việc phải tự thêm. Chưa đối chiếu corpus thực nhiều cột/bảng gộp/hình/OMML đủ rộng để tuyên bố fidelity toàn diện.
- **M6/UI/security/performance:** suite có browser/layout/mobile/zoom/focus/contrast và injection checks; không phải full axe/Lighthouse/SAST/history secrets audit. Test performance hiện có PASS trong lần serial; chưa đo input→paint và thiết bị học sinh bằng profiling độc lập, chưa kiểm mọi màn ở mọi viewport/mode/AT.
- **Roadmap integration:** tìm trên toàn src không thấy rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. Đây là bằng chứng tĩnh cộng API probes, không phải đã browser-test những màn chưa tồn tại. F1/F2 có code cục bộ trong report/view nhưng chưa tới app, nên không đánh dấu hoàn tất.
- **Requirements/acceptance:** áp các quyết định đã chốt ở WEB §14 trở đi; không lặp D01–D08 như đang mở. D05 custom-only và D06 PDF manual là phạm vi được duyệt. Milestone owner acceptance và release evidence riêng vẫn cần trước production.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P1 — src/collect + src/app:** sửa F01 trước đồng bộ nhiều tab/reload; regression durable lease/reserved budget. **src/api** sửa F03; **src/domain** sửa F02 theo public contract. Giữ full gate hiện đang xanh.
2. **P1 — src/api/src/collect/src/teacher/src/student:** hoàn thiện WEB §23 roster/PIN: add/list/reset/remove theo quyền lớp; PIN hash/unique, lock 5 lần/10 phút server; studentLogin/studentToken; tên từ roster, student_id; myResults đa máy, chưa nộp. Sáu action còn UNKNOWN_ACTION, không giao lại như chỉ cần tô giao diện.
3. **P1 — src/app + src/report/src/student:** sửa tích hợp F04: §24.1 filter/nav tới báo cáo thực; §24.5 lượt luyện câu sai/bỏ trống thật, không gửi giáo viên và không đổi final. Chốt xử lý câu II partial/ý trống bằng regression; không coi callback stub là hoàn tất.
4. **P1 — src/api/src/teacher/src/report:** §24.2–24.3 bài từng học sinh và examStats từng câu/phương án/top3 raw III, chỉ tính submission hợp lệ. Cần full content + snapshot/version lúc nộp, không dựng kết quả cũ bằng đề vừa bị sửa; listResults hiện chỉ chiếu điểm/metadata cho table.
5. **P1 — src/student/src/api:** §24.4 myHistory từ myResults + SVG historyChart và bảng chữ thay thế; local history hiện có không thay lịch sử đa máy qua PIN.
6. **P2 — src/teacher/src/report/src/ui:** §24.6 in đề không đáp án + phiếu I/II/III + trang key riêng; §24.7 theme Sáng/Tối/Theo máy, nhớ local và WCAG AA. In báo cáo không thay in đề; dark tokens không thay theme control.
7. **P2 — các vùng liên quan + glue:** hoàn tất evidence live dịch vụ được duyệt, privacy/export/delete/backup/recovery, corpus DOCX, OS IME/AT/đa browser, performance trên máy thực và owner acceptance/rollback/changelog. Preset THPT chuẩn chỉ sau owner chọn môn/năm/nguồn để verify; không tự mở rộng D05 hoặc cài OCR/PDF dependency.

## Quyết định và bàn giao

**NEED_DECISION: NONE cho sửa lỗi/tích hợp theo contract hiện tại.** Không tự chốt policy mới. Nếu muốn giữ cap rational bằng cách đổi hợp đồng, có hai phương án để owner duyệt: A giữ inverse public API và bound transport; B version mới bound đồng nhất constructor/formatter/parser. Contract hiện tại yêu cầu A; không cần treo việc sửa để chọn lại.

tools_research: NOT_REQUESTED. privacy_notes: chỉ dữ liệu tổng hợp; không credential, dữ liệu học sinh thật hoặc nội dung hồ sơ riêng. Không sửa code, không commit/deploy. Báo cáo sẵn sàng bàn giao để sửa, không khẳng định sản phẩm đã hoàn tất.
