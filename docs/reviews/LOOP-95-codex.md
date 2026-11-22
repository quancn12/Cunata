# LC95 — Independent whole-product review

review_id/task_id/worker_id: LC95; reviewer: Codex; risk_level: HIGH.
base_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`; final_head_commit: `66eb71d6b332f42db8702334800d0394bd0e3d71`; branch: main; existing uncommitted changes included.
requirements_version: Shared Product Contract v2.0; WEB-contract.md §§1–24 (read in full); inherited M1; approved decisions; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Four MAJOR and two MINOR findings independently reproduced in this run; full `npm test` is red. Initial captured runtime/test/build inputs are identical to LC94; later test-only additions are accounted for below. This run also observed a timing-budget failure; no new production root cause has been established for that measurement. NEED_DECISION: NONE for these repairs and the approved local roadmap. READY_FOR_REVIEW is the report handoff state, not product approval.

## Snapshot, scope and method

Only intentional workspace write: `docs/reviews/LOOP-95-codex.md`. Existing changes preserved; no code/test edits, dependency installation/change, branch/worktree, commit, deploy or live-service write.

Evidence directory: `%USERPROFILE%/AppData/Local/Temp/LC95-kjac5fd8`. Build/tests ran in an ordinary temporary copy, not a Git worktree, keeping generated artifacts outside the workspace scope. Existing installed node_modules were copied without installation. Production configuration was excluded; the temporary public/config.json contains `{ "appsScriptUrl": "" }`. Synthetic local simulators are used for backend tests.

`source-hashes.json` records 1,278 captured inputs (src/test/public/scripts/styles/apps-script, root package/build/compiler inputs, ops/publish.py and local test support). `changes-since-LC94.json` is `{}`: no changed or removed captured input since LC94, for the initial snapshot of runtime/test/build folders. During checks, test/artifact-only commits f4d9995 and 66eb71d promoted R2/R4 acceptance cases; no captured runtime/build/existing-test code changed. Nine added test/helper/fixture files were inspected, copied and captured in promoted-hashes.json, then executed in a separate fresh gate. The baseline Codex glob result covers 198 tests before these additions; it is not an all-green claim for the final current suite. Existing dirty changes against HEAD are separately captured in git-status.txt, git-log.txt and git-diff.txt. No dependency/lock/compiler/build input change since LC94 was found. The added R4 tests fail on missing controls/navigation, corroborating F04. See promoted.log for the distinct test counts.

files_reviewed: current git log/diff and complete captured-input comparison against LC94; source tracing of scoring/rational/raw answers, app report and recursive rich-content rendering, asynchronous asset/export lifecycle, outbox dispatch and storage CAS, student timer/finalization/assignment metadata, teacher ownership/key publishing, API auth/assignment/results and Neon schema/transport. Fresh gates cover additional schema/storage/offline/import/bank/admin/UI/build integration paths. This is a baseline-equivalent whole-product review with fresh runtime evidence; it does not claim every unchanged line was reread or exhaustive acceptance. Reused supplemental harnesses were inspected, copied unchanged, hashed in harness-hashes.json and executed afresh. Prior test outcomes are not counted as current evidence.

## Findings




### LC95-F01 — MAJOR — Concurrent outbox drains evade the durable send budget

- status: VERIFIED; LC94-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :438–453, :475, :624; storage CAS boundary src/storage/index.ts:977.
- evidence: fresh probes.log shows six actual transport calls, durable state `sending`, retryCount=0, generation=8. Dispatch accepts an already-sending record and charges the retry only after a response/error.
- reproduction_steps: in the evidence directory run `node LC51-probes.mjs`; finalize synthetic hoa-repeating using MemoryTransactionAdapter, enqueue, launch six drains five milliseconds apart while transport promises remain unresolved, inspect outbox, then resolve sends with 503.
- expected: Shared §3 / WEB §7 bound sends to five across concurrent callers/recovery.
- actual/impact: six requests precede any consumed-budget increment; repeated callers or crashes before response can evade the limit. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a consumed attempt and sending lease before transport; reject/coalesce active leases and recover expired leases without resetting budget. Preserve tuple/hash/generation and terminal confirmation. A process-only mutex does not cover tabs.
- regression_test: two clients, unresolved/lost receipts and crash/reload/lease recovery; one active send, at most five dispatches, immutable final/hash, no late-response downgrade.

### LC95-F02 — MAJOR — Switching exams during HTML download crashes the export

- status: VERIFIED; LC94-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3104, :3177–3185, :3210–3216, :3282–3315.
- evidence: download-race.log/json reports `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, active title `New exam B`. intended-regressions.log fails its no-error assertion.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs`; submit A containing an internal image, defer the image fetch during download, load B through the hidden file input, then release A's fetch. Run `node --test lc67-regressions.test.mjs` after blocks-probe.mjs for the intended invariant.
- expected: WEB §§3/20 export A's complete immutable report or explicitly cancel with recoverable feedback.
- actual/impact: after await, exporter rereads mutable currentExam/order/responses/score. Loading B clears scoredResult and A's download rejects. Mixed-identity output is a source risk, not a separately observed file.
- minimal_fix: capture the complete immutable report data and filename before the first await; use only captured fields thereafter; expose asset/download errors.
- regression_test: defer A asset → open B → resolve; one A file retaining title/version/order/answers/score and no rejection; include cancellation, fetch failure and concurrent downloads.

### LC95-F03 — MAJOR — Math inside table cells silently disappears

- status: VERIFIED; LC94-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:415–428, :1689, :3094, :3282.
- evidence: lc83-independent.json records a valid cell containing text/image/math `x^2+83`; actual question text is only `NESTED-TEXT`. independent.log fails the scoped math assertion. The cell renderer handles text/image but omits math/nested-table branches. Fresh scoped HTML parsing (`nested-report-scoped.json`) yields only `NESTED-TEXT`, mathPreserved=false. The whole-file hasMath flag includes unrelated data and is not evidence of preservation.
- reproduction_steps: `node --test lc83-independent.test.mjs`; load its synthetic canonical exam in Chromium, inspect `.question-stem` and the downloaded report's question content.
- expected: Shared §6 / WEB §§4/8/20 preserve recursive Cell.blocks math, or show source with an unsupported-content warning.
- actual/impact: legitimate question content vanishes without warning, potentially making a question unsolvable. This synthetic case does not establish a defect in a particular real DOCX. The helper also serves review/download.
- minimal_fix: shared recursive safe Block rendering for top-level/cell text, math, images and nested tables; preserve/label unsupported OMML/source.
- regression_test: text/math/image/nested-table cells through exam → final → review → portable download, including unsupported expressions and escaped hostile content.

### LC95-F04 — MAJOR — Actual report lacks filters, navigation and retry-wrong

- status: VERIFIED; LC94-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535–573, :2992–3097; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: fresh browser-probe.log: `cards=2, filter=false, nav=false, retry=false`. The app builds its own report instead of mounting the isolated report controls. The newly promoted R4 acceptance suite independently contributes eight failures for missing filters/navigation/status/jump controls in promoted.log (combined R2/R4: 31 tests, 23 pass, 8 fail).
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs`; open local dist under /Cunata/, submit synthetic I+III, inspect the report DOM.
- expected: WEB §§24.1/24.5 expose all/wrong/blank filters with aria-pressed, question navigation and independent local retry practice with zero teacher submissions.
- actual/impact: approved roadmap features remain absent from the user entrypoint despite isolated module implementations/tests.
- minimal_fix: integrate report projection/actions/lifecycle; retry must use a fresh immutable practice snapshot/ID without assignment/collector linkage and retain the original final.
- regression_test: actual submit → filter → navigate, including hidden targets → retry wrong/blank/partial-II → refresh; original final unchanged, zero submitResult calls.

### LC95-F05 — MINOR — API stores assignments for nonexistent exams

- status: VERIFIED; LC94-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396–405.
- evidence: probes.log shows HTTP 200 / success=true and one assignment persisted for `does-not-exist` with an empty trusted catalog. Null getExam bypasses the only ownership check.
- reproduction_steps: `node LC51-probes.mjs`; seed active synthetic teacher/session/owned class in MemoryStore; assign unknown examId with valid openAt and dueAt=""; inspect saved assignments.
- expected: reject nonexistent/deleted exams before persistence while allowing authorized published/catalog exams.
- actual/impact: orphan assignment cannot load its exam for students. No cross-owner write was established.
- minimal_fix: require an allowed published record or trusted catalog membership; otherwise NOT_FOUND/INVALID_EXAM without writing. Preserve foreign-owner rejection/no-due handling.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog succeed, foreign owner FORBIDDEN, valid dueAt="" succeeds.

### LC95-F06 — MINOR — Public fraction parser rejects formatter output

- status: VERIFIED; LC94-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel API `toFractionString(rational(10n**200n))` produces a canonical 201-character integer, but parseFractionString throws SyntaxError.
- expected: M1 §4.1 strict inverse across the public rational domain.
- actual/impact: valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: preserve the inverse and bound hostile serialized input at its boundary; restricting the public rational domain requires a consistent contract change.
- regression_test: signed canonical integer/fraction roundtrips at 199/200/201 characters, zero, noncanonical rejection and both inverse directions.

## Red gate and retained behavior

`npm test` has two failures (1,615/1,617 pass). The teacher failure is at test/teacher/portal.test.ts:557, assertion :608: `Teacher exam must have unpublish button`. Fixture metadata supplies neither owner nor teacher username; src/teacher/portal.ts:1689–1716 filters exams through read-only ownership checks. Teacher/test owners must reconcile the fixture/port metadata contract without weakening the ownership assertion or using publish requests to probe permission. This failure is not proof of a production authorization bypass. The other failure is test/browser/bundle-security-perf.test.ts:119: measured local navigation 2,649 ms against the 2,000 ms budget. This is a real failed check, not yet a verified persistent production slowdown; the concurrent npm run shared resources with both compiler checks. The benchmark measures navigation wall time rather than independent FCP/input-to-paint. A separate rerun is reported below; it cannot make the original full suite green.

Fresh independent Chromium checks preserve own-exam access, browsing without publish requests or revision changes, and saved B answer keys surviving publication. Nested images download as embedded data. Canonical top-level text/table content survives exam/review/download. These passes do not repair F02–F04. The fresh domain differential matches independently expected total/max and all three section score/max on 1,632 fixtures; the independent oracle also passes. Neither establishes complete browser/persistence/security coverage.

## checks_run

Environment: Windows/PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0, installed Chromium via CDP. All commands ran afresh in the temporary evidence directory; times are wall seconds. No installed packages changed.

| Command | Exit | Actual outcome; evidence |
| --- | --- | --- |
| `node scripts/build.js` | 0 | PASS: 339 files emitted/promoted/verified; existing DEP0190 warning. Wall 2.459 s; build.log. |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS; no compiler diagnostics. Wall 6.577 s; tsc.log. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS; no compiler diagnostics. Wall 7.236 s; tsc-web.log. |
| `npm test` | 1 | FAIL: teacher ownership metadata fixture and local navigation 2649 ms > 2000 ms. tests=1617, suites=345, pass=1615, fail=2, skipped=0, cancelled=0, todo=0. Wall 45.499 s; npm.log. |
| `node LC51-probes.mjs` | 0 | Diagnostic reproduction: six sends with retryCount=0; orphan assignment persisted; 201-character rational inverse fails; six roster/PIN/history actions UNKNOWN_ACTION. Exit 0 is successful reproduction, not a product PASS. Wall 0.304 s; probes.log. |
| `node LC51-differential.mjs` | 0 | PASS: 1632 product cases match independent total/max and every section score/max. Wall 0.194 s; differential.log. |
| `python -B test/oracle/oracle.py --check` | 0 | PASS: independent oracle only, tests=11, pass=11, fail=0, skipped=0; 1632 fixtures, 5849 maxima configs, 9 negative controls. Wall 1.367 s; oracle.log. |
| `node --test lc83-independent.test.mjs` | 1 | FAIL: nested math assertion plus parent; tests=5, pass=3, fail=2, skipped=0, cancelled=0, todo=0. Own-exam read-only browse, saved B key and nested image portability pass. Wall 3.031 s; independent.log. |
| `node download-race.mjs` | 0 | Diagnostic reproduction: null totalFraction TypeError; zero downloads; active title New exam B. Exit 0 is not product correctness. Wall 3.293 s; download-race.log. |
| `node blocks-probe.mjs` | 0 | PASS: canonical top-level text/table preserved through exam, review and download. Wall 2.144 s; blocks-probe.log. |
| `node --test lc67-regressions.test.mjs` | 1 | FAIL: A/B download isolation; canonical blocks pass; tests=2, pass=1, fail=1, skipped=0, cancelled=0, todo=0. Wall 0.122 s; intended-regressions.log. |
| `node LC51-browser-probe.mjs` | 0 | Diagnostic reproduction: cards=2, filter=false, nav=false, retry=false. Wall 1.875 s; browser-probe.log. |
| `node --test --test-concurrency=1 --test-timeout=240000 test/claude-check/**/*.test.mjs` | 0 | PASS: tests=104, suites=5, pass=104, fail=0, cancelled=0, skipped=0, todo=0. Local synthetic browser/service checks. Wall 115.715 s; claude.log. |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` | 0 | PASS: tests=198, suites=2, pass=198, fail=0, cancelled=0, skipped=0, todo=0. Local synthetic browser/service checks. Wall 222.739 s; codex.log. |
| `node --test test/browser/bundle-security-perf.test.ts` | 0 | PASS: tests=5, suites=1, pass=5, fail=0, cancelled=0, skipped=0, todo=0. Local synthetic browser/service checks. Separate rerun after the full browser suites; does not replace the red npm result or prove FCP/input-to-paint budgets. Wall 2.187 s; perf-rerun.log. |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/feat/R2/r2.test.mjs test/codex-check/feat/R4/review.test.mjs` | 1 | FAIL: tests=31, suites=0, pass=23, fail=8, cancelled=0, skipped=0, todo=0. Local synthetic browser/service checks. Wall 27.802 s; promoted.log. |

NODE_OPTIONS preloads the unchanged ops/blitz/promoted/_support/runtime.mjs (acknowledges CDP Browser.close after 100 ms) and teardown-http.mjs (closes outstanding HTTP connections 1.5 seconds after Server.close). These adjust teardown only. No assertions, skips, expected values or production responses were modified. Temporary evidence directories under ops/blitz/promoted/_audit/{security,student,teacher,admin} were created before the full Codex suite to satisfy its output paths. GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata provide read-only repository context for git-sensitive tests. Publisher tests use synthetic temporary destinations; no deployment or production-service write occurred. Neon/Apps Script simulators do not establish live-service acceptance.

## coverage_gaps

- M1: fresh domain differential and independent oracle; F06 persists. Not every raw/status/order/DOM combination is exhausted.
- M2/M3: fresh Chromium editor, library, publish, report and rich-block paths plus full gates. Exhaustive private/quota/migration/recovery, all version/assignment/route switches and ownership permutations: NOT_RUN in this bounded rerun.
- M4/R1/R2: local auth/store/transport/build/publisher checks only. Live Google/CORS/write/readback, deployed Neon concurrency/deduplication and activation: NOT_RUN; no production credentials/configuration or live writes authorized. No trusted-assessment certification or exhaustive historical secret/advisory/license audit.
- M5: synthetic DOCX/PDF and rich-content checks only. Broad real multi-column/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus: NOT_RUN. Approved native/manual PDF is not a missing automatic parser. F03 prevents full rich-content acceptance.
- M6: automated Chromium responsive/keyboard/component checks do not equal manual acceptance. Full manual 375/768/1440 light/dark inspection, Firefox/WebKit, physical phone, OS Telex/VNI, screen reader, independent axe/Lighthouse, and independent input-to-paint p95: NOT_RUN; no full WCAG/performance claim.
- Owner milestone/production acceptance: NOT_RUN. This review authorizes no activation/deploy/old-service deletion.

## Missing roadmap features — priority and dependencies

1. **P0 / R0:** repair F01–F04 and reconcile the teacher metadata fixture/port; restore a green full npm gate. Preserve ownership/key edits/portable images. F05/F06 remain bounded debt.
2. **P1 / R2→R3, §23:** complete local new-service acceptance, then roster CRUD/print, unique hashed four-digit PINs, five-failure/ten-minute server lockout, studentToken/student_id binding, cross-machine reconstruction and unsubmitted roster rows. All six fresh addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults probes return UNKNOWN_ACTION. A students table alone does not implement these actions.
3. **P1 / R4, §24.1, after R0:** integrate report filters/navigation into the actual entrypoint (F04); isolated view tests do not satisfy this.
4. **P2 / R5→R6, §§24.2–24.3, after R3:** authorized per-student submissionDialog/btn-view-submission and examStats/stat-row, per-question accuracy, option distribution and common wrong short answers. Production UI paths absent in current source search.
5. **P2 / R7, §24.4, after R3:** PIN-backed myHistory/historyChart with accessible text table; production paths absent.
6. **P2 / R8, §24.5, after R4+R7:** local wrong/blank/partial-II practice with zero teacher submissions and immutable original final (F04).
7. **P2 / R9, §24.6, after R6:** teacher print, answer sheet and separate answer key; btn-teacher-print path absent.
8. **P2 / R10, §24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists, btnTheme path absent.
9. **P3 / R11:** owner-authorized live activation and phone acceptance, recovery/import/privacy/performance matrix, version 1.0 and retirement decision. Not authorized in LC95.

Custom-only presets and manual PDF remain approved choices. NEED_DECISION: NONE for these fixes and the approved local roadmap. No new scoring grammar, service, or storage policy was selected. tools_research: NOT_REQUESTED. privacy_notes: synthetic local data only; no real student records, credentials or private instruction content in this report.

recommended_action: F01→src/collect; F02–F04→src/app; F05→src/api; F06→src/domain. Teacher/test owners reconcile metadata fixtures while preserving read-only listing. Product verdict remains CHANGES_REQUESTED; report handoff READY_FOR_REVIEW.

Final integrity: final-snapshot.json records 1287 captured inputs (1278 initial plus 9 promoted source/fixture files). Initial HEAD 2019a03fabd3225b5e8bc3a602d0c37a4a94c74f advanced to 66eb71d6b332f42db8702334800d0394bd0e3d71 through test/artifact-only commits f4d9995 and 66eb71d. workspaceRuntimeAndTestCodeDrift={}, snapshotRuntimeAndTestCodeDrift={}. Remaining uncaptured entries are generated logs/evidence under the promoted R2/R4 test directories and are listed in final-snapshot.json. Generated evidence/configuration changes are recorded separately. Current src/app/main.ts SHA-256: `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. Verdict applies to this stable captured snapshot. Only docs/reviews/LOOP-95-codex.md was intentionally written in the workspace.

Tooling note: the Python console wrapper for the performance rerun exited 1 while printing Unicode to the Windows cp1252 console after the child completed successfully. The child node --test exit was 0, its UTF-8 log and stored result contain five passes. This display failure is not hidden as a product test failure or counted as a passing Python check.
