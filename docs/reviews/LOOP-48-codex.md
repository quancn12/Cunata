# LC48 — Kiểm định độc lập toàn sản phẩm

- review_id / task_id: LC48; reviewer: Codex; verified_at: 2026-11-22 (Asia/Bangkok).
- base_commit / head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`.
- requirements_version: Shared Product Contract v2.0; WEB-contract.md toàn bộ §1–24; M1-scoring-contract kế thừa; DESIGN.md.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED** — **4 finding VERIFIED còn mở: 2 MAJOR, 2 MINOR**. Đây là tái kiểm LC47-F01…F04, không phải bốn lỗi mới. Chưa phê duyệt phát hành hoặc nghiệm thu toàn sản phẩm.
- recommended_action: giao sửa theo VÙNG, bổ sung regression đường sử dụng thực và review snapshot sau sửa.

## Snapshot, delta và giới hạn quyền

Đã đọc git status/log/diff và LOOP-47-codex.md. HEAD không đổi; working tree có source, tests, dist, docs và ops sửa/untracked từ công việc khác. Giữ nguyên. Không có diff package/lock/tsconfig/build scripts so HEAD. Không lấy nhãn XANH của commit làm bằng chứng kiểm thử.

Copy nguyên byte source/scripts/public/styles/apps-script/api/test, node_modules sẵn có, contracts/decisions/design và root config/HTML sang `%USERPROFILE%\AppData\Local\Temp\LC48-f25ra2b1`. Build, tests, probe và output đều chạy trong bản sao; không branch/worktree/install/dependency/commit/deploy, không sửa source/assertions. Chỉ tạo báo cáo này trong repo. Bổ sung nguyên byte ops/publish.py và ops/blitz/promoted/_support cho supplemental harness; Git metadata chỉ cung cấp qua GIT_DIR cho thao tác đọc SHA.

Manifest `LC48-manifest.json`: **366 file**, SHA-256 `6f9e7c5623cf1e62dd90bd0cdbb40ec7490dc74ea9e775af053fc8385305e65e`. Không gồm test/node_modules. Đối chiếu manifest LC47: file runtime chung thay đổi là `src/api/handle.ts`, `src/api/store/memory.ts`, `src/api/store/neon.ts`, `src/api/types.ts`; plan.html cũng đổi. DESIGN.md và scratch_csv_debug.mjs là thêm vào inventory, không coi là delta sản phẩm mới. Recheck source/config/script/public và test source không drift; chỉ plan.html đổi khi chạy, không dùng nó làm bằng chứng runtime.

| File | SHA-256 của snapshot |
|---|---|
| src/api/handle.ts | `e841c1964a499236e100d53a9a53dfacb36047d93270fa0ab4edb5240c142107` |
| src/api/store/memory.ts | `192d6582e961ab63d001f2513a071cfb986205313a4fd48c9cbafe948a019f83` |
| src/api/store/neon.ts | `ed4a45bba621f81b2cb4b21148bf1d8d0463f19cd8015aee2794e35ed2ca4e44` |
| src/api/types.ts | `f39c8e766015f4e0f00518772155e0cb9a98682872548bcbc410dd37d060f1d8` |
| src/collect/index.ts | `0c7ae3471622ce5f6495ae36ba11cc0127e7454599f2cde5d52d51a52a5d0199` |
| src/app/main.ts | `c99e2b779ddb0657e293387d3d717d5e22c993ad88f0e8a898201207a81d10a0` |

files_reviewed: delta API/store/types và regression; domain barrel/rational/judge/max/score/DTO; schema adapter/validation; storage transactions/finalize/outbox/CAS; student controller/assignment metadata/area; app report/collector callers; collect enqueue/drain/receipt; API auth/handle/store/SQL; teacher/bank entrypoints; importer DOCX segmentation/PDF manual/preview; offline worker; build scripts và browser harness/assertions. Review toàn sản phẩm theo luồng rủi ro; không khẳng định đọc từng dòng hoặc thao tác tay mọi màn.

Delta API kể từ LC47 có cải thiện đúng hướng: createTeacher insert-only; reset password và active cập nhật từng cột/tăng auth_gen nguyên tử; unpublish đặt owner predicate trong DELETE. Ba regression `R1-REVIEW1-F01/F02/F03` thực chạy qua npm test. SQL có kiểm cấu trúc bằng fetch fixture, chưa phải nghiệm thu concurrency trên Neon thật. Delta này không sửa bốn finding bên dưới.

## Findings

### LC48-F01 — MAJOR — Outbox dispatch chồng, chưa tiêu budget khi request đang bay

- **VÙNG chịu trách nhiệm: src/collect.** VERIFIED; tiếp nối LC47-F01.
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:476`, `:624`.
- evidence: không gate state sending/lease; CAS chỉ đổi generation và state, retryCount tăng sau await lỗi. Caller đến sau vẫn dispatch trong lúc request trước chưa xong.
- reproduction_steps: chạy `node LC48-probes.mjs` trong snapshot. parseExam hoa-repeating → MemoryTransactionAdapter/createStoragePort → startAttempt với clock/ID tổng hợp → submit manual → enqueue endpoint fixture. Transport.send giữ promise pending; gọi drainOutbox sáu lần cùng tuple, cách nhau 5ms. Trước resolve đọc durable outbox: **calls=6, state=sending, retryCount=0, generation=8**. Resolve các request bằng status503, await toàn bộ jobs, dispose controller. Không gửi mạng.
- expected: WEB §7/Shared §3, tối đa 5 lần gồm lần đầu, budget/backoff durable; một tuple không có request chồng trong lease còn hiệu lực.
- actual / impact: sáu request chưa hoàn thành đã vượt budget trong khi retryCount vẫn 0; nhiều caller/tab/reload có thể làm tăng tải vô hạn. Server dedupe không thay giới hạn gửi client.
- minimal_fix: transaction claim/lease theo tuple và reserve lượt trước dispatch; sending còn lease không dispatch; lease expiry/reload giữ lượt đã tiêu, body/hash/idempotency key cố định; bảo toàn terminal confirmed. Khóa Map một trang không đủ.
- regression_test: delayed transport + nhiều caller/tab; reload sau dispatch trước receipt; tối đa một in-flight trong lease, tổng không quá 5; lost receipt retry cùng body/key; late receipt không hạ confirmed/đổi final.

### LC48-F02 — MINOR — Parser không là nghịch đảo của formatter rational

- **VÙNG chịu trách nhiệm: src/domain.** VERIFIED; tiếp nối LC47-F02.
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence / reproduction_steps: qua public barrel, `s=toFractionString(rational(10n**200n))`; s dài 201; `parseFractionString(s)` ném SyntaxError do cap 200. Assertions trong LC48-probes.mjs qua, exit0.
- expected: M1 §4.1 parser là nghịch đảo chặt của formatter trên miền API đã công bố.
- actual / impact: public API roundtrip thất bại. Không thấy sai điểm trong cap 1000 câu; không nâng thành blocker scoring.
- minimal_fix: đặt giới hạn tài nguyên ở biên payload; giữ inverse API. Nếu muốn bound miền rational, cần version/contract và bound đồng nhất constructor/formatter/parser.
- regression_test: roundtrip 199/200/201 ký tự, tử/mẫu lớn, số âm/zero; reject noncanonical, inverse hai chiều.

### LC48-F03 — MINOR — Giao đề thành công dù mã đề không tồn tại

- **VÙNG chịu trách nhiệm: src/api.** VERIFIED; tiếp nối LC47-F03; line đã đổi sau delta.
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: published null không bị từ chối, cũng không kiểm membership ctx.catalog trước saveAssignment.
- reproduction_steps: LC48-probes.mjs tạo MemoryStore thật, teacher active/session hash hợp lệ, lớp thuộc teacher, ctx.catalog=[]; POST assignExam với examId=does-not-exist, openAt ISO hợp lệ, dueAt="". **status200/success=true, listAssignmentsByClass.length=1**.
- expected: WEB §19/§22 chỉ giao đề tồn tại thuộc phạm vi được phép hoặc catalog tin cậy máy chủ; unknown phải reject và không tạo assignment.
- actual / impact: assignment mồ côi, học sinh không nạp được đề; caller stale sau khi gỡ đề có thể gặp. Không có bằng chứng cho phép sửa đề người khác.
- minimal_fix: xác minh published exam đúng quyền hoặc ID thuộc server catalog trước save; unknown trả NOT_FOUND/INVALID_EXAM theo quy ước, không tin catalog client.
- regression_test: unknown/deleted không ghi; own/static vẫn giao được; other-owner FORBIDDEN; dueAt rỗng vẫn hợp lệ.

### LC48-F04 — MAJOR — Filter, navigation và luyện lại chưa tích hợp vào báo cáo người dùng

- **VÙNG chịu trách nhiệm: src/app**, phối hợp src/report/src/student. VERIFIED; tiếp nối LC47-F04.
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; controls riêng tại `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: app dựng report riêng; không mount renderer report/view hay nối retryWrong. Unit test module/callback không chứng minh app có chức năng.
- reproduction_steps: `node LC48-browser-probe.mjs`, HTTP snapshot dist dưới /Cunata/, Chrome/Edge headless thật qua harness; openApp → loadExam fixture 1I+1III → submit qua UI → đọc DOM: **cards=2, filter=false, nav=false, retry=false**. Assert chính xác rồi đóng context/browser/server. Fixture nạp file ẩn phục vụ báo cáo, không claim luồng lớp/PIN.
- expected: WEB §24.1/24.5 có all/wrong/blank, aria-pressed/nav câu; retry tạo lượt riêng chỉ câu sai/bỏ trống, không gửi giáo viên và không sửa final gốc.
- actual / impact: ba control vắng mặt trên bản build; tính năng đã viết ở module chưa dùng được qua app.
- minimal_fix: nối renderer/control vào app bằng model chuẩn; retry có ID/snapshot riêng, bỏ assignment/collector; giữ final gốc, order/download/cleanup.
- regression_test: browser start→answer→submit→filter/nav, nav câu bị lọc; retry chứa đúng câu cần luyện (II partial/ý trống); không submitResult/đổi final gốc; kiểm sau refresh, không chỉ callback mock.

## checks_run

Môi trường Windows/PowerShell; Node v24.14.0, TypeScript 7.0.2, Python 3.11.0. npm.cmd/npx.cmd là shim Windows của lệnh được yêu cầu. Mọi log/probe nằm trong thư mục snapshot nêu trên. Exit0 của bug probe nghĩa là tái hiện lỗi thành công.

| Lệnh/check thực chạy | Exit | Kết quả / artifact |
|---|---:|---|
| node scripts/build.js | 0 | Validate/typecheck/emit/promote **339 file dist**; LC48-build.log; có DEP0190 shell warning. |
| npx --no-install tsc -p tsconfig.json | 0 | Không diagnostics; LC48-tsc.log. |
| npx --no-install tsc -p tsconfig.web.json | 0 | Không diagnostics; LC48-tsc-web.log. |
| npm test, lần đầu | 1 | 1609 tests/345 suites; **1605 pass/4 fail/0 skip/0 cancelled/0 todo**, 177969.92ms; LC48-npm.log. Fail performance benchmark, CK15 SW update, CK16 multi-tab SW và fx52ApiBrowser chờ teacherUsername. |
| npm test, chạy lại sau khi các suite cạnh tranh kết thúc | 0 | **1609 tests/345 suites, pass1609/fail0/skip0/cancelled0/todo0**, 28561.1313ms; LC48-npm-recheck.log. Giữ nguyên source/assertion. |
| node --test "test/claude-check/**/*.test.mjs" | 0 | **104 tests/5 suites, pass104/fail0/skip0/cancelled0/todo0**, 180895.8573ms; LC48-claude.log. Có design/browser root/dist/subpath/offline, backend fixture. |
| node --test "test/codex-check/**/*.test.mjs" | 1 | **199 tests/2 suites, pass184/fail15/skip0/cancelled0/todo0**, 157799.2038ms; LC48-codex.log. Thiếu output directories _audit; isolated GLUE01 build timeout120s, kéo theo GLUE02/03/05 thiếu artifacts. |
| node --test --test-concurrency=1 "test/codex-check/cx/*.test.mjs" "test/codex-check/feat/R1/glue.test.mjs" | 0 | **56 tests/0 suites, pass56/fail0/skip0/cancelled0/todo0**, 62007.886ms; LC48-codex-recheck.log. Tạo đúng output dirs _audit trong bản sao, GIT_DIR chỉ đọc SHA. |
| python -B test/oracle/oracle.py --check | 0 | **11 pass/0 fail/0 skip**, 1632 fixtures, 5849 maxima configs, 9 negative controls; duration_s6.9625; LC48-oracle.log; oracle-only. |
| node LC48-differential.mjs | 0 | **1632/1632** product scoreAttempt/DTO khớp independent expected total/maxTotal và score/max từng phần; LC48-differential.log. |
| node LC48-probes.mjs | 0 | Tái hiện F01/F02/F03; 6/6 action roster/PIN/history UNKNOWN_ACTION; LC48-probes.log. |
| node LC48-browser-probe.mjs | 0 | Browser thật xác nhận F04; LC48-browser-probe.log. |
| git diff --check -- src scripts apps-script index.html docs/contracts (repo gốc) | 0 | Không whitespace error; warnings LF→CRLF. |
| Hash runtime/test source/HEAD | 0 | Chỉ plan.html drift; test source không drift, HEAD giữ nguyên. |
| Production Google/Neon/Vercel CORS/write/readback; OS Telex/VNI; Firefox/WebKit; AT; axe/Lighthouse | NOT_RUN | Không gọi endpoint thật/deploy; chưa thực chạy các môi trường/công cụ này. |

Không ghi lần đầu của npm hoặc full Codex là PASS. Các suite đầu chạy đồng thời, có resource contention và GLUE build timeout; npm full rerun sau đó xanh. Không kết luận bốn timeout/performance failure đầu là lỗi sản phẩm ổn định. Recheck 56 ca sau khi tạo các thư mục output security/student/teacher/admin và chạy từng file tuần tự đều xanh, gồm GLUE01–05; isolated build chỉ 2676ms. Full glob Codex vẫn là exit1 đã ghi ở trên, không đổi thành PASS. Publish probe chạy fixture cô lập/chặn thao tác thật, không triển khai. Không dùng log của tiến trình điều phối thay kết quả tự chạy.

## coverage_gaps và tình trạng theo milestone

- **M1:** domain suite/differential kiểm I theo ID, II blank khác false, III exact string, max5/15/16/repeating; F02 mở. Fixture arithmetic không thay toàn miền DOM/raw/order.
- **M2:** code/tests có transaction finalize/outbox/CAS, restore/timer/shuffle/report/download và browser offline; F04 thiếu integration. Chưa kiểm mọi quota/private browsing/migration/quarantine/backup/delete/recovery/media offline bằng thao tác người dùng.
- **M3:** builder/bank/teacher/admin/lớp/giao đề có implementation/tests; F03 mở. API delta concurrency có ba regression xanh; SQL fixture không chứng minh Neon race live. Chưa đi tay mọi editor/taxonomy/large-bank state.
- **M4:** hash/receipt/CAS/confirmed terminal, API dedupe/authGen/parameterized SQL có checks. F01 mở. API validate range/sum điểm client, chưa recompute key/version tin cậy; không chứng nhận kỳ thi cần chống giả điểm/giấu key. Backend fixture không thay production CORS/readback.
- **M5:** DOCX/PDF thiếu key II giữ missing thay vì đoán false; preview/confirm có regression. PDF manual đúng D06; không tự OCR/auto extraction. Chưa đủ corpus thực cho mọi bảng gộp/nhiều cột/numbering/hình/Unicode/OMML.
- **M6:** có browser/design/mobile/focus/offline/injection checks. Chưa kiểm mọi vai/viewport/theme/AT, secrets toàn Git history, OS IME/đa engine/performance máy học sinh. Không coi suite xanh là owner acceptance.
- **§23:** Student type/students table và student_id metadata chưa thành roster/PIN. Probe thật sáu action addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults đều UNKNOWN_ACTION; Store chưa có CRUD student/session student.
- **§24:** không tìm thấy rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme trong src; filter/nav/retry chỉ ở report/view, app chưa dùng (F04). Phân biệt missing implementation/integration/evidence.
- **Acceptance:** áp dụng quyết định D01–D08 đã chốt ở WEB §14 trở đi, custom-only/PDF manual. Không lặp các quyết định cũ như còn mở. Live evidence, changelog/rollback và owner acceptance là gate riêng.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P1 — src/collect, src/api, src/domain:** sửa F01 durable dispatch budget/lease, F03 orphan assignment, F02 inverse API; giữ regression hiện có.
2. **P1 — src/api/src/collect/src/teacher/src/student:** §23 roster/PIN: thêm/list/reset/remove đúng quyền lớp; PIN4 băm/khác nhau trong lớp, khóa5 lần sai/10 phút; studentToken, roster name/student_id, myResults đa máy; giáo viên thấy Chưa nộp. Sáu API hiện UNKNOWN_ACTION.
3. **P1 — src/app/src/report/src/student:** §24.1/24.5 filter/nav/retry thật (F04); luyện riêng không gửi, không đổi kết quả gốc, xử lý II partial/ý trống.
4. **P1 — src/api/src/teacher/src/report:** §24.2 xem toàn bài học sinh, §24.3 thống kê từng câu (% đúng, tỉ lệ lựa chọn I, top3 III sai), chỉ final hợp lệ; giữ snapshot/version.
5. **P1 — src/student/src/api:** §24.4 myHistory từ myResults + SVG historyChart/bảng chữ thay thế; local history chưa thay lịch sử đa máy qua PIN.
6. **P2 — src/teacher/src/report/src/ui:** §24.6 in đề + phiếu I/II/III + key trang riêng; §24.7 nút Sáng/Tối/Theo máy có nhớ và AA hai mode. Print report/dark tokens chưa đủ.
7. **P2 — các vùng + glue:** live evidence dịch vụ/CORS/readback/dedupe; export/delete/recovery/privacy; corpus importer, OS IME/đa engine/AT/performance máy thật; changelog/rollback/owner acceptance. Preset chuẩn chỉ sau owner chọn môn/năm/văn bản kiểm chứng; không tự thêm dependency/OCR.

## Quyết định và quyền

**NEED_DECISION: NONE để sửa/tích hợp trong hợp đồng hiện hành.** Nếu muốn đổi miền rational thay vì giữ inverse, owner chọn A giữ API hiện hành và bound tại transport, hoặc B version mới bound đồng nhất constructor/formatter/parser; hợp đồng hiện tại yêu cầu A, không chặn sửa để hỏi lại.

tools_research: NOT_REQUESTED. privacy_notes: chỉ fixture tổng hợp; không credential/dữ liệu học sinh thật/nội dung chỉ thị riêng. Không sửa code/install/thêm dependency/commit/deploy. Báo cáo là kết quả kiểm định; sản phẩm chưa nghiệm thu hoàn tất.

