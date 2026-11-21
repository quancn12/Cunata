# LC44 — Kiểm định độc lập toàn sản phẩm

- review_id / task_id: LC44; reviewer: Codex; verified_at: 2026-11-22, Asia/Bangkok.
- base_commit / head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69` (HEAD khi nhận task và khi kiểm cuối).
- requirements_version: Shared Product Contract v2.0; WEB-contract.md toàn bộ §1–24, gồm các quyết định cập nhật; M1-scoring-contract v1.0 kế thừa. Tham chiếu thêm docs/design/DESIGN.md.
- risk_level: HIGH — persistence, đồng bộ, API và chuyển phiên bản offline.
- verdict: **CHANGES_REQUESTED**. Có 4 finding đã tái hiện; full suite còn đỏ. Các ca browser thất bại trong full suite đã pass khi chạy riêng, vì vậy chưa kết luận chúng là lỗi sản phẩm xác định.
- recommended_action: giao đúng vùng sửa F01–F04; ổn định và chạy lại full gate trên snapshot không đổi; thực hiện backlog §23–24 trước tuyên bố toàn sản phẩm hoàn tất. Báo cáo sẵn sàng review, không phải approval phát hành.

## Snapshot, delta và phạm vi

Review trước: `docs/reviews/LOOP-43-codex.md`, cutoff `329e4be0b35a99895f6d64d85761bd2598de11cb` cộng working tree cũ. Đã đọc git log/diff/status thật. Delta commit tới HEAD hiện tại trong src/test/scripts/apps-script: **924 files, +182554/-638 dòng**. Đây là thay đổi lớn, không còn chỉ là bản legacy có thêm lesson. Không dùng thông điệp commit “XANH” làm kết quả kiểm định hiện tại. Có đọc CK-audit-69.md để định vị sửa gần đây; các kết quả của audit đó không được tính thành checks của LC44.

files_reviewed (theo luồng/rủi ro, không khẳng định đã đọc từng dòng của toàn bộ 924 file): domain barrel/scorer/rational/validation/DTO; schema; student controller và app main/routes; storage transaction/backup; collector/outbox/transport/Apps Script client/export; report projection/download; bank persistence; teacher portal/results; API handle/auth/types, MemoryStore/NeonStore; importer DOCX/PDF/preview; offline worker; build wrapper/module builder; legacy bank/collector; assertions và harness liên quan. Full suite còn phủ admin/UI/import/browser, không đồng nghĩa mọi trạng thái UI đã được reviewer thao tác riêng.

Không tìm thấy AGENTS.md trong inventory workspace hoặc tại D:\. Không sửa source/test/config, không install/dependency, branch/worktree, commit hay deploy. Chỉ tạo báo cáo này. Các bài kiểm định dùng dữ liệu tổng hợp; public/config.json trong repo rỗng, không gọi Google/Neon/Vercel thật.

Để build và browser checks không ghi generated output vào repository, tạo bản sao nguyên byte tại `%USERPROFILE%\AppData\Local\Temp\LC44-wjssslup`; dependency chép từ node_modules hiện có, không install. Snapshot ban đầu 489 file (src/scripts/public/styles/apps-script/api, các harness được chọn, contracts, root JSON/HTML): SHA-256 tổng `dbf114dd925849d8ab45939f454b5750f4f658a280e53ed9d7322bada7def390`. Bổ sung toàn bộ test/support và README khi mở rộng full suite; không sửa nội dung source/tests để chạy. README thiếu ở lần thử đầu của bản sao đã được khắc phục bằng chép nguyên byte; không tính lỗi môi trường này thành bug sản phẩm.

Lần `npm test` đầu chạy trực tiếp ở D:\Cunata đã sinh lại ảnh kiểm định. Năm ảnh xác định được đã được lưu vào thư mục tạm và phục hồi byte HEAD vốn sạch lúc bắt đầu. Sau đó vẫn xuất hiện ảnh/JSON kiểm định thay đổi; đã xác minh có tiến trình kiểm định khác đang chạy (`node --test --test-timeout=180000 ...claude-check...codex-check...` và một full npm suite khác). Không can thiệp tiến trình đó hoặc ghi đè tiếp artifact không phân biệt được tác giả. Những thay đổi ops/plan/artifacts của tiến trình khác được giữ nguyên. Không dùng chúng làm bằng chứng LC44.

Đối chiếu hash trước/sau checks: source/scripts/public/apps-script/contracts và các root config trong snapshot **không drift**. HEAD không đổi. Mốc chính:

| File | SHA-256 |
|---|---|
| src/collect/index.ts | `0c7ae3471622ce5f6495ae36ba11cc0127e7454599f2cde5d52d51a52a5d0199` |
| src/app/main.ts | `c99e2b779ddb0657e293387d3d717d5e22c993ad88f0e8a898201207a81d10a0` |
| src/api/handle.ts | `418c1289d5c2f3dc2ae6de1fe5aef3bdc99f0b7722e4b5d29949f98cf9668c9c` |
| src/domain/rational.ts | `068b140c1d0df59ae759b6829ae961afa2034c2a5d1f060a26d8bde8e4afb886` |
| index.html | `92bc6b00e2dfa169bed33f11a0359c6d53d2d871d218b81b14d7dc2bdede70ad` |
| scripts/web-build.ts | `72ddec8d31c11bc9c6453acd8be21b7cc8406f27b285640d30f09c51d26589c5` |

## Findings

### LC44-F01 — MAJOR — Outbox cho gửi chồng và vượt ngân sách gửi bền vững

- **VÙNG chịu trách nhiệm: src/collect. VERIFIED, finding mới của module.** Callers cần phối hợp tại src/app.
- file:line: `src/collect/index.ts:408`, `:438`, `:447`, `:624`; đường gọi thực `src/app/main.ts:1080`, `:1183`, `:1208`.
- evidence: kiểm budget trước gửi nhưng không từ chối/claim độc quyền record đang `sending`; chuyển sang sending chỉ tăng generation, chưa tăng retryCount. Count chỉ tăng sau lỗi của generation còn hiệu lực. CAS bảo vệ cập nhật trạng thái, không ngăn một caller đọc generation mới rồi gửi tiếp. App sweep và phục hồi final cũng drain record `sending`.
- repro đã chạy exit 0: parse `public/exams/hoa-repeating.json`; startAttempt → submit bằng createStoragePort(new MemoryTransactionAdapter()); enqueue với endpoint fixture; gọi drainOutbox 6 lần, cách nhau 5ms, cùng record/storage. Transport trả promise chờ để mô phỏng request mạng đang bay. Trước khi giải phóng response, kết quả assert: **calls=6, retryCount=0, generation=8, state=sending**. Giải phóng tất cả promise rồi await để không bỏ timer/tiến trình treo. Không request mạng thật.
- expected: WEB §7 và Shared §3 yêu cầu tối đa 5 lần gửi gồm lần đầu, budget không reset khi reload; một request đang bay phải có durable ownership/lease hoặc quy tắc phục hồi có giới hạn.
- actual/impact: tab mới/reload/sweep có thể gửi lại trong khi request cũ chưa xong; 6 request vẫn chưa tiêu lượt nào trong state bền vững. Response cũ bị STALE_GENERATION, chỉ failure mới nhất tăng count. Server idempotency vẫn có thể ngăn trùng dòng, nhưng không bảo đảm budget/backoff và tránh request thừa.
- minimal_fix: claim/lease transaction cho từng tuple và reserve số lượt trước dispatch; giữ lease/budget qua enqueue idempotent, reload và hai tab; chỉ recovery sau lease hết hạn, vẫn giới hạn tổng số lượt. Giữ server_confirmed terminal và pin hash/generation, không chỉ thêm khóa Map trong một trang.
- regression_test: hai caller cùng/khác tab và 6 lần reload khi POST bị trì hoãn; không gửi chồng khi lease còn hiệu lực, tổng gửi không vượt 5; kill page sau dispatch trước response vẫn tiêu lượt; lost receipt retry cùng body/idempotency; late receipt không hạ confirmed hoặc chuyển nhầm attempt A/B.

### LC44-F02 — MAJOR — Legacy bank vẫn báo lưu/nhập dù ghi storage thất bại

- **VÙNG chịu trách nhiệm: glue. VERIFIED; LC43-F04 còn mở ở root legacy.** Không quy kết cùng lỗi cho src/bank.
- file:line: `index.html:4374`, `:4458`, `:4459`; UI callers `:5048`, `:5636`.
- evidence/repro đã chạy exit 0: trích nguyên các hàm getQuestionBank/saveQuestionToBank/importQuestionsToBank từ HTML vào Node VM; dùng checkShortAnswer từ domain barrel. Lưu câu III old, content=original; pin bytes bank; cho localStorage.setItem ném QuotaExceededError; import một câu III new hợp lệ. Hàm trả **1**, số bản ghi mới bền vững **0**. Gọi saveQuestionToBank sửa old sang edited cũng trả bình thường; bytes và content cũ vẫn original. VM chạy mã sản phẩm nhưng không phải click UI trong browser.
- expected: Shared §5/§8 và WEB §6/§9 — chỉ thông báo thành công sau ghi thành công, báo lỗi lưu trung thực.
- actual/impact: catch rỗng nuốt lỗi, import tăng count vô điều kiện. Giáo viên có thể đóng editor vì tin đã lưu rồi mất phần sửa chưa được ghi. Không có bằng chứng probe làm mất bản ghi cũ hay bài học sinh.
- minimal_fix: propagate Result/lỗi từ bank mutations; UI giữ dữ liệu editor, báo failure và cho retry/export; batch import chỉ đếm durable writes hoặc commit một lần sau validate. Áp dụng cả delete/clear; không dùng catch rỗng để trả success.
- regression_test: quota/denied trên add/update/import/delete/clear; bytes cũ giữ nguyên; UI không có success giả; phục hồi storage rồi retry chỉ ghi đúng một bản; lesson/text/IDs giữ nguyên.

### LC44-F03 — MINOR — Parser phân số vẫn không nghịch đảo toàn bộ formatter output

- **VÙNG chịu trách nhiệm: src/domain. VERIFIED; LC43-F03 còn mở.**
- file:line: `src/domain/rational.ts:119`, `:132`, `:143`.
- evidence/repro public API, exit 0: `s = toFractionString(rational(10n ** 200n))`; assert s.length===201; parseFractionString(s) ném SyntaxError do cap 200.
- expected: M1 §4.1 yêu cầu parser là nghịch đảo chặt của formatter; canonical output phải roundtrip.
- actual/impact: constructor/formatter cho giá trị mà parser từ chối. Chưa thấy sai điểm đề <=1000 câu; do đó MINOR, không gọi là lỗi công thức điểm.
- minimal_fix: tách resource bound của transport ra boundary, giữ inverse cho public rational API. Muốn bound toàn miền thì owner phải sửa contract và enforce nhất quán, không tự sửa luật điểm.
- regression_test: canonical length 199/200/201, tử/mẫu lớn, âm/zero và syntax không canonical; inverse hai chiều trên miền công bố.

### LC44-F04 — MINOR — API chấp nhận giao một đề không tồn tại

- **VÙNG chịu trách nhiệm: src/api. VERIFIED, finding mới.**
- file:line: `src/api/handle.ts:409`, `:415`.
- evidence: assignExam kiểm owner nếu tìm thấy published exam, nhưng nếu không tìm thấy thì không kiểm ctx.catalog và vẫn lưu assignment.
- repro đã chạy exit 0 trên handle + MemoryStore thật: tạo giáo viên/session hợp lệ và lớp thuộc giáo viên, ctx.catalog=[]; POST assignExam với examId=does-not-exist, openAt hiện tại, dueAt="". Nhận success=true. GET getClass trả một assignment có title=does-not-exist; GET getExam với cùng id trả NOT_FOUND. Không sử dụng backend thật.
- expected: lựa chọn giao đề theo WEB §19.1/§19.2 là đề của mình hoặc kho chung đang tồn tại; đề không tồn tại phải bị reject, không tạo assignment lỗi cho học sinh.
- actual/impact: tạo được thẻ bài giao không thể nạp đề. Có thể xảy ra từ caller sai/stale sau gỡ đề; không phải bằng chứng vượt quyền sửa đề khác.
- minimal_fix: trước saveAssignment xác minh published exam hợp lệ thuộc phạm vi được phép hoặc ID có trong trusted catalog; không có thì trả NOT_FOUND/INVALID_EXAM theo mã đã thống nhất. Không dùng danh mục client làm bằng chứng tồn tại.
- regression_test: unknown id không ghi assignment; static catalog id và own published id vẫn giao được; đề người khác vẫn FORBIDDEN; đề vừa gỡ không tạo assignment mồ côi; dueAt rỗng vẫn hợp lệ.

## checks_run

Environment: Windows/PowerShell; Node v24.14.0, TypeScript 7.0.2, Python 3.11.0; Chrome/Edge headless thật qua CDP của harness đã có. Không cài tool. `npm.cmd`/`npx.cmd` là command shim Windows cho các lệnh yêu cầu. Artifact đường dẫn tương đối dưới thư mục tạm LC44 nêu trên, trừ khi ghi tool transcript.

| Lệnh/check thực chạy | Exit | Kết quả / evidence |
|---|---:|---|
| `npm test` tại D:\Cunata | 1 | **1591 tests, 343 suites, pass1589/fail2**, cancelled/skip/todo0; 247120.2977ms. Tool transcript. Fail: performance navigation 2913ms >2000 tại test/browser/bundle-security-perf.test.ts:131; CK16-F01 CDP timeout caches.keys() tại test/final-quality/ck12Regressions.test.ts:1154. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics; chạy trực tiếp repo. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics; chạy trực tiếp repo. |
| `node scripts/build.js` tại bản sao | 0 | Validate assets/schema/Apps Script và **emit/verify/promote 339 files dist**. Tool transcript; không còn chỉ là asset check như LC43. Có DEP0190 warning, không đổi exit. |
| `node --test "test/claude-check/**/*.test.mjs"` tại bản sao | 0 | **104 tests, 5 suites, pass104/fail0/skip0**, 126014.7604ms; LC44-claude.log. Browser thật, dưới /Cunata/, cả legacy và module; backend fixture. |
| `npm test` bản sao mở rộng lần đầu | 1 | 1582 tests, pass1580/fail2, còn một suite lỗi khởi tạo vì thiếu README trong bản sao; CK15-F01 offline fetch vẫn chứa RELEASE_A_MARKER. 71152.266ms; LC44-npm-repeat.log. Không coi lỗi thiếu README là lỗi sản phẩm. |
| `npm test` bản sao sau bổ sung README nguyên byte | 1 | **1591 tests, 343 suites, pass1589/fail2/skip0**, 51984.4126ms; LC44-npm-final.log. Fail performance p95=158ms >150 tại :151; CK15-F01 tại test/final-quality/ck12Regressions.test.ts:1144. Full gate vẫn FAIL. |
| `node --test --test-name-pattern='CK15-F01\|CK16-F01' test/final-quality/ck12Regressions.test.ts` | 0 | **2 tests, pass2/fail0/skip0**, 22644.7853ms; LC44-offline-isolated.log. Upgrade A→B cold offline và multi-tab pass khi chạy riêng. |
| `node --test --test-name-pattern='Performance Benchmarks\|teardown bundle' test/browser/bundle-security-perf.test.ts` | 0 | **2 tests, pass2/fail0/skip0**, 10275.7168ms; LC44-perf-isolated.log. Có teardown thật; không lấy tổng duration testcase làm FCP/p95. |
| Một lần lọc performance/CK16 trước đó | 1, interrupted | Performance assertion pass, nhưng lọc tên bỏ qua teardown của suite performance nên process giữ browser mở. Đã kết thúc đúng cây tiến trình của LC44 và chạy lại với teardown ở dòng trên. LC44-targeted.log; không tính lần interrupted là gate pass hoặc bug sản phẩm. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/fail0/skip0; 1632 cases, 5849 maxima configurations, 9 negative controls; oracle duration1.5786s. Tool transcript. Đây là oracle-only. |
| Node stdin differential sản phẩm → oracle fixtures | 0 | **1632/1632**: domain scoreAttempt + scoreResultToDTO khớp total/max và score/max cả I/II/III của expected độc lập. Không suy thêm status/order/browser từ check này. Tool transcript. |
| Node stdin collector + rational probes | 0 | F01 calls6/count0/generation8; F03 length201 rejection; assertions thật. |
| Node stdin legacy bank quota probe | 0 | F02 reportedImported1/durableNewRecords0/updateRetained original. |
| Node stdin API assignment/roadmap probe | 0 | F04 assign success/listed1/getExam NOT_FOUND; addStudents/listStudents/studentLogin/myResults đều UNKNOWN_ACTION (4/4). |
| Git diff whitespace + snapshot parity | 0 | `git diff --check -- src scripts apps-script docs/contracts`; source/config không drift; HEAD giữ nguyên. |
| Google/Neon/Vercel live; OS IME; Firefox/WebKit; axe/Lighthouse; độc lập toàn bộ codex-check .mjs | NOT_RUN | Task không cho deploy/gửi dữ liệu thật; không có phiên kiểm OS/đa engine hoặc công cụ này được chạy bởi LC44. Không nhận kết quả tiến trình khác là của mình. |

Full test có tranh chấp tài nguyên với automation ngoài LC44; đã quan sát tiến trình, không suy đoán chỉ từ thời gian. Các ca pass riêng giúp thu hẹp nguyên nhân nhưng **không thay full-suite FAIL thành PASS**. Chưa xác định root cause của tính không ổn định update/offline trong full suite; cần gate trên môi trường kiểm soát, giữ nguyên assertions, không xóa/skip/làm yếu test.

Một probe differential nháp đã dùng nhầm scoreAttempt như Result và fail assertion .ok; sau khi đối chiếu chữ ký ScoreResult/throws, sửa riêng câu lệnh stdin, chạy lại đủ1632 pass. Một lệnh in log Python gặp lỗi console cp1252; không phải check sản phẩm. Không sửa source/test để sửa các lỗi thao tác này.

## Đối chiếu sản phẩm và coverage_gaps

- **M1/scoring:** anchors I/II/III, blank≠false, exact raw/charset, max5/15/16, repeating rational, shuffle/snapshot/DTO được full suite và differential hỗ trợ. F03 là ngoại lệ API. Không có bằng chứng sai công thức trên1632 fixtures. Không chạy mutation framework hoặc chứng minh mọi input ngoài fixtures.
- **M2/student/storage/report:** đã có modular app, IndexedDB, resume/deadline, hai tab, cold offline, report toàn văn/giải thích, tải HTML; browser suite thật pass. Không còn mô tả cả M2 là NOT_IMPLEMENTED. Full-suite upgrade/performance chưa ổn định; chưa đo riêng import lớn/1000 câu trên máy học sinh, private browsing/quota của mọi browser, OS Telex/VNI, screen reader hoặc toàn bộ asset offline. Event composition mô phỏng không thay IME OS.
- **M3/teacher/bank/admin/classes:** modules và đường nhập/soạn/xuất bản/lớp/giao bài/no-due đã có; suite browser và typecheck chạy thật. F02 chỉ root legacy; F04 API vẫn cho assignment không có đề. Chưa nghiệm thu toàn bộ editor taxonomy cascade, durable draft/backup/delete/migration/recovery trên các browser.
- **M4/collection/backend:** có outbox/receipt/dedupe/hash/CSV và backend Vercel-Neon qua Store; không còn ghi collector module/API là chưa có. F01 phá budget trong dispatch chồng. Backend hiện kiểm tính nhất quán điểm client, chưa chứng minh trusted grading từ key/snapshot máy chủ. Không nhận nickname là danh tính xác thực; không chứng nhận phù hợp kiểm tra cần giấu key/điểm tin cậy. No live CORS/readback/Neon SQL roundtrip/production acceptance trong LC44.
- **M5/import:** DOCX ZIP/XML/IR/provenance/preview/confirm và PDF manual/native preview đã tồn tại, không giao viết lại từ đầu. PDF manual đúng D06, OCR/auto PDF không phải chức năng phải tự thêm. Chưa tự kiểm tay corpus thực tế đủ nhiều cột/bảng gộp/hình/OMML và mọi fidelity warning; tests không chứng minh mọi DOCX.
- **M6/UI/security/performance:** đã có real browser/layout/component checks, mobile/zoom/focus và một số contrast/injection/secrets-pattern checks trong suite. Không thay bằng chứng này bằng tuyên bố axe/Lighthouse/SAST/full-history secrets scan đã chạy. Performance đo trong full suite không ổn định; budget check hiện đo CDP navigation/input roundtrip, không phải phép đo FCP/input-to-paint độc lập chính xác.
- **Version/release:** dùng §14 trở đi để áp quyết định đã chốt: D01 charset; D02 hai số lẻ/half-up; D05 custom-only; D07 limit/grouping; D08 hiện giải thích ngay; D03 IndexedDB; D06 PDF manual; backend §22. Không lặp lại các câu NEED_DECISION cũ như thể vẫn chưa chốt. Nghiệm thu chủ dự án, rollback/changelog và dịch vụ live là gate riêng.

## Tính năng lộ trình còn thiếu — theo thứ tự ưu tiên

1. **P1 — src/collect + src/app; glue; src/api; src/domain:** sửa F01/F02/F04/F03 và regression tương ứng. Đồng thời làm full test ổn định, phân tích log CK15/CK16/performance dưới tải; chưa phát hành từ gate đỏ.
2. **P1 — src/api, src/collect, src/teacher, src/student:** hoàn thành **WEB §23 roster/PIN**: add/list/reset/remove học sinh theo quyền lớp, PIN hash/unique, khóa5 lần/10 phút phía server, studentLogin/studentToken, tên từ roster/student_id, myResults từ máy khác, học sinh chưa nộp. Hiện API trả UNKNOWN_ACTION cho các action đã probe; Store có type/bảng students nhưng chưa có public methods/luồng yêu cầu. Không xem bảng trống là tính năng đã làm.
3. **P1 — src/report + src/student:** **§24.1 và §24.4**: reviewFilter wrong/blank/all, reviewNav; myHistory từ máy chủ + SVG historyChart và bảng chữ thay thế. Không có các selector/chức năng này trong source hiện tại; local history không thay myResults đa máy.
4. **P1 — src/api + src/teacher + src/report:** **§24.2–24.3**: xem submission toàn văn và examStats hợp lệ theo câu/phương án/raw III. Hiện listResults chỉ chiếu điểm/metadata, không trả raw_answers_json/snapshot cho màn xem bài; teacher table chưa có btn-view-submission/submissionDialog/examStats. Cần giữ snapshot/version lúc nộp, không dựng bài cũ bằng đề mới bị sửa.
5. **P2 — src/student + src/report + src/collect:** **§24.5** luyện lại câu sai/bỏ trống, lượt mới có nhãn không gửi giáo viên và không đổi kết quả gốc; hiện chưa có btnRetryWrong/luồng tương ứng.
6. **P2 — src/teacher + src/report + src/ui:** **§24.6–24.7** in đề/phiếu/đáp án riêng và btnTheme ba chế độ nhớ local. Có CSS dark tokens không đồng nghĩa có theme control; window.print báo cáo không thay in đề giáo viên.
7. **P2 — các vùng liên quan + glue:** nghiệm thu live backend được duyệt, privacy/retention/export-delete-backup/recovery, corpus DOCX, OS IME/AT/đa browser, hiệu năng thực tế và evidence release. Preset chuẩn THPT chỉ thêm khi owner chọn nguồn/môn/năm để xác minh; hiện custom-only đã được duyệt, không tự mở rộng. PDF tự động/OCR ngoài D06 không phải thiếu sót cần cài dependency ngay.

## Quyết định và bàn giao

Không phát hiện quyết định nghiệp vụ mới cần tự chốt để sửa bốn finding; các yêu cầu §23–24 đã có chữ ký/tiêu chí trong contract. **NEED_DECISION: NONE cho việc sửa theo contract hiện tại.** Nếu muốn đổi miền rational để giữ cap, đổi contract trước với hai phương án: A giữ inverse và giới hạn tại transport; B bound đồng nhất constructor/formatter/parser bằng phiên bản mới. Hiện phương án A là sửa đúng contract, không cần hoãn chờ chọn lại.

tools_research: NOT_REQUESTED. privacy_notes: dữ liệu tổng hợp, không private profile, credential, URL production cấu hình riêng hoặc dữ liệu học sinh thật. Approval của báo cáo khác không áp thay LC44 và không nghiệm thu backlog còn thiếu.
