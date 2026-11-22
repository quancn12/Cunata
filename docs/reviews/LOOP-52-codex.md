# LC52 ? Independent whole-product audit

review_id/task_id: LC52; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1?24; inherited M1 contract; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Four verified findings remain open from LC51 (2 MAJOR, 2 MINOR); no release approval.
recommended_action: fix findings by responsible directory and add regression tests, then review a stable snapshot.

## Snapshot and review scope

Read git status/log/diff and LC51. HEAD unchanged; extensive pre-existing working-tree changes preserved. SHA-256 comparison of every src file against LC51 snapshot found **zero runtime differences**. Comparison of tested src to original repository found **zero source drift**. No package/lock/scripts/tsconfig delta against HEAD. Existing working-tree changes include API concurrency, missing-II-key import handling, report controls, student names and metadata; these were already present in LC51.

files_reviewed: whole-product git delta; re-read rational parsing/formatting, outbox dispatch/CAS/retry, API assignment/auth/MemoryStore/NeonStore, importer II changes, schema/student metadata, app report caller and module controls. Searched runtime for roadmap actions/DOM. Unchanged broader static coverage inherits LC51; this does not claim every line or screen was freshly inspected.

Tests ran in `%USERPROFILE%/AppData/Local/Temp/LC52-95rkie2q`: copied src/test/scripts/public/apps-script/docs/styles and root JSON/HTML/JS/README, junction to existing node_modules. Build and harness artifacts stayed in temporary copy. No branch/worktree/install/dependency changes/commit/deploy. LC51-named probes were copied unchanged and **executed anew on LC52 source**. Synthetic fixtures only, no production writes.

## Findings

### LC52-F01 — MAJOR — Gửi chồng cùng outbox chưa tiêu budget khi request đang bay

- **VÙNG chịu trách nhiệm: src/collect.** VERIFIED, tiếp nối LC50-F01.
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:476`, `:624`.
- evidence: không gate sending/lease; CAS tăng generation nhưng retryCount chỉ tăng sau await lỗi. Caller tiếp theo vẫn được gửi khi request trước pending.
- reproduction_steps: chạy `node LC51-probes.mjs` trong snapshot. Parse hoa-repeating; MemoryTransactionAdapter/createStoragePort → startAttempt → submit manual → enqueue endpoint fixture. Transport giữ promise pending; gọi drainOutbox sáu lần cùng tuple, cách 5ms; đọc durable outbox trước resolve. **calls=6, state=sending, retryCount=0, generation=8**. Resolve 503, await jobs và dispose; không gọi mạng.
- expected: WEB §7/Shared §3, retry durable theo từng tuple, tối đa 5 lần gồm lần đầu; một lease còn hiệu lực không có send chồng.
- actual / impact: sáu dispatch nhưng budget vẫn 0; nhiều caller/tab/reload có thể vượt budget và tăng tải. Dedupe máy chủ không thay giới hạn gửi client.
- minimal_fix: claim lease bằng transaction/CAS và reserve lượt trước dispatch; sending còn lease không dispatch; hết lease/reload vẫn giữ lượt đã tiêu; body/hash/idempotency key cố định và confirmed terminal. Khóa trong RAM một trang không đủ.
- regression_test: delayed transport, nhiều caller/tab và reload giữa dispatch/receipt; một in-flight/lease, tổng ≤5; lost receipt retry đúng key/body; late response không hạ confirmed hoặc sửa final.

### LC52-F02 — MINOR — Parser rational không là nghịch đảo formatter

- **VÙNG chịu trách nhiệm: src/domain.** VERIFIED, tiếp nối LC50-F02.
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence / reproduction_steps: qua public barrel, `s=toFractionString(rational(10n**200n))` dài 201; `parseFractionString(s)` ném SyntaxError vì cap 200. `LC51-probes.mjs` assert cả hai kết quả.
- expected: M1 §4.1, parser là nghịch đảo chặt của formatter trên miền API công bố.
- actual / impact: roundtrip API thất bại dù constructor/formatter nhận giá trị. Chưa thấy sai điểm trong cap 1000 câu; không phân loại blocker scoring.
- minimal_fix: giữ inverse API và bound tại biên payload. Nếu muốn miền rational bounded, cần version/contract và bound đồng nhất constructor/formatter/parser.
- regression_test: roundtrip 199/200/201 ký tự, tử/mẫu lớn, âm/zero; reject noncanonical; inverse hai chiều.

### LC52-F03 — MINOR — API cho giao đề không tồn tại

- **VÙNG chịu trách nhiệm: src/api.** VERIFIED, tiếp nối LC50-F03.
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: published null không bị reject, không kiểm membership ctx.catalog trước saveAssignment.
- reproduction_steps: `LC51-probes.mjs`, MemoryStore thật, active teacher/session hash hợp lệ và lớp thuộc teacher, ctx.catalog=[]; POST assignExam với examId=does-not-exist, openAt ISO hợp lệ, dueAt="". **HTTP200/success=true**, listAssignmentsByClass có một assignment.
- expected: WEB §19/§22, chỉ giao đề đúng quyền đang tồn tại hoặc đề trong catalog máy chủ tin cậy; unknown không ghi.
- actual / impact: tạo assignment mồ côi, học sinh không tải được đề; caller stale sau khi gỡ đề cũng có thể gặp. Không có bằng chứng sửa đề người khác.
- minimal_fix: kiểm published đúng quyền hoặc ID thuộc server catalog trước save; unknown trả NOT_FOUND/INVALID_EXAM theo quy ước. Không tin catalog client.
- regression_test: unknown/deleted không ghi; own/static vẫn giao được; other-owner FORBIDDEN; dueAt rỗng vẫn hợp lệ.

### LC52-F04 — MAJOR — Filter/navigation/luyện lại chưa nối vào báo cáo người dùng

- **VÙNG chịu trách nhiệm: src/app**, phối hợp src/report và src/student. VERIFIED, tiếp nối LC50-F04.
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; controls riêng tại `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: app dựng report riêng, không mount report/view hoặc nối retryWrong. Module tests không chứng minh app có chức năng.
- reproduction_steps: `node LC51-browser-probe.mjs`, HTTP dist tại /Cunata/, browser thật dùng harness có sẵn. openApp → loadExam fixture 1I+1III → submit qua UI → đọc DOM: **cards=2, filter=false, nav=false, retry=false**. Đóng context/browser/server. Nạp file ẩn để cô lập báo cáo, không coi đây là test luồng lớp/PIN.
- expected: WEB §24.1/24.5, có all/wrong/blank với aria-pressed, nav câu; retry tạo lượt luyện riêng chỉ câu sai/bỏ trống, không gửi giáo viên hoặc sửa final gốc.
- actual / impact: người dùng dist không có ba control dù renderer riêng đã có code. Fresh LC52 browser probe confirmed missing controls; no new screenshot inspection.
- minimal_fix: nối renderer/controls với model chuẩn; lượt luyện ID/snapshot riêng, không assignment/collector; bảo toàn final/order/download và cleanup lifecycle.
- regression_test: browser làm→nộp→filter/nav, gồm nav tới câu đang bị lọc; retry đúng tập câu, II partial/ý trống; không submitResult hoặc sửa final gốc; kiểm sau refresh.

## checks_run

Windows/PowerShell; Node v24.14.0, TypeScript 7.0.2, Python 3.11.0. npm.cmd/npx.cmd used as Windows command shims. Logs in snapshot directory above.

| Command | Exit | Result / artifact |
|---|---:|---|
| node scripts/build.js | 0 | Web emitted successfully; build.log; DEP0190 warning |
| npx --no-install tsc -p tsconfig.json | 0 | No diagnostics; tsc.log |
| npx --no-install tsc -p tsconfig.web.json | 0 | No diagnostics; tsc-web.log |
| npm test | 0 | 1609 tests, 345 suites, pass1609/fail0/skip0/cancelled0/todo0; 50516.7641ms; npm.log |
| node --test test/claude-check/**/*.test.mjs | 0 | 104 tests/5 suites; pass104/fail0/skip0/cancelled0; 41902.0104ms; claude.log; browser + fixture backend |
| node LC51-probes.mjs | 0 | F01 calls6/retryCount0/generation8; F02 length201 rejected; F03 success200 unknown exam; six roster actions UNKNOWN_ACTION; probes.log |
| node LC51-browser-probe.mjs | 0 | Real browser dist: cards2/filter false/nav false/retry false; browser-probe.log |
| node LC51-differential.mjs | 0 | 1632/1632 product total/max/section score/max match independent fixtures; differential.log |
| python -B test/oracle/oracle.py --check | 0 | 11 pass/0 fail; 1632 fixtures, 5849 maxima configurations, 9 negative controls; oracle.log |

Build completed before npm. Python wrapper subsequently failed printing Unicode log text under cp1252 (wrapper exit1), after capturing npm exit0; npm.log contains complete passing summary. No source/assertion edits or skipped failures. Probe exit0 means successful bug reproduction, not fixes.

## coverage_gaps

- M1: fresh suite/differential cover scoring fixtures, maxima and exact III; F02 remains. Differential checks score/max, not every DOM/status/raw/order.
- M2/M3: storage/CAS/finalize, timer, snapshots, builder/bank/version tests in npm. Not all quota/private browsing/migrations/backup/delete/media offline/role states manually exercised. F03/F04 remain.
- M4: F01 remains. Range/sum validation of client score does not certify trusted server grading. Production Google/Neon/Vercel CORS/write/receipt/readback/dedupe NOT_RUN (no live service access used). SQL fixtures do not establish live Neon concurrency.
- M5: missing II keys preserved unresolved; PDF preview/manual per D06. No fresh comprehensive real DOCX/PDF corpus covering merged tables/multicolumn/images/OMML; no OCR claim.
- M6: browser-backed checks plus fresh dist probe; no fresh screenshot inspection, OS Telex/VNI, Firefox/WebKit, AT, axe/Lighthouse or p95 benchmark. Full Git-history secret scan NOT_RUN.
- Supplemental test/codex-check/**/*.test.mjs NOT_RUN in LC52; prior PASS not copied as current evidence.
- Section23 NOT_IMPLEMENTED: addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults all return UNKNOWN_ACTION in fresh probe. Student type/students table/student_id metadata do not supply roster/PIN/multi-machine history.
- Section24 runtime search: no rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. Filter/nav/retry exist in report/view but absent in app (fresh F04 browser probe).

## Missing roadmap features, in priority order

1. P1 src/collect durable budget/lease (F01), src/api unknown exam rejection (F03), src/domain parser inverse (F02), with concurrency/assignment/roundtrip regressions.
2. P1 section23 src/api/teacher/student/collect: owner-scoped roster CRUD, unique hashed PIN4, five failures/10-minute lock, studentToken/roster name/student_id, myResults across machines, teacher not-submitted rows.
3. P1 sections24.1/24.5 src/app/report/student: integrate filter/nav/retry wrong; independent practice attempt, including partial II, no server submission or original-final mutation.
4. P1 sections24.2/24.3 src/api/teacher/report: full individual submissions; per-question correctness, option distribution, top3 wrong III, valid final attempts only.
5. P1 section24.4 src/student/api: myHistory through PIN/myResults, SVG chart plus accessible text table.
6. P2 sections24.6/24.7 src/teacher/report/ui: printable exam/answer sheet/separate keys; persisted Light/Dark/System control and AA throughout.
7. P2 glue/all regions: live service evidence, privacy/recovery, importer corpus, OS IME/multiple engines/AT/performance, changelog/rollback/owner acceptance. D05 remains custom-v1; no invented official presets, dependencies or OCR.

NEED_DECISION: NONE for these authorized fixes/integrations. Apply settled D01?D08 and sections19.2a/21?22. Changing the rational API domain would need owner-approved versioning; restoring the current inverse contract does not.
tools_research: NOT_REQUESTED. privacy_notes: synthetic data; no credentials, actual student data or private instruction content. Only this review report created in repository.
