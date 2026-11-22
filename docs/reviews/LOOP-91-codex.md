# LC91 - Independent whole-product review

review_id/task_id/worker_id: LC91; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`; branch: main; includes existing uncommitted changes.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24 (complete); inherited M1; approved decisions; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Four MAJOR and two MINOR findings reproduced on the current snapshot; the required npm gate fails. NEED_DECISION: NONE for these repairs and the approved local roadmap. READY_FOR_REVIEW refers only to this report.

## Snapshot, method and scope

Only intentional workspace write: `docs/reviews/LOOP-91-codex.md`. No product/test edits, installation, dependency changes, branch/worktree, commit, deployment or live-service writes. Existing changes preserved.

Evidence: `%USERPROFILE%/AppData/Local/Temp/LC91-ybvmn71b`. This is an ordinary temporary copy, not a Git worktree. Source, tests, public assets, docs, build inputs and the installed node_modules were copied; no package was installed. Production configuration was excluded; copied public/config.json is `{ "appsScriptUrl": "" }`. Build/test/probe output stays outside the workspace.

`source-hashes.json` captures 1,198 inputs. `changes-since-LC90.json` compares every capture key: only generated test/codex-check/cx/F02-browser.json, F03-browser.json and fixtures/bank-backup.json changed. No runtime or test-program changes or new files in the captured source/test directories were found since LC90. HEAD remains unchanged. Current history, dirty diff and status are recorded in git-log.txt, git-diff.txt and git-status.txt. Uncommitted fixes are part of the reviewed snapshot; operational/report churn is not a product repair. Package/lock/compiler configs/build scripts have no change against HEAD.

files_reviewed: log/diff and complete input hash comparison with LC90; focused current-source tracing of domain rational/scoring API and independent oracle, app rich-content/report/download composition, student attempt/timer/finalization, storage final/outbox CAS, collect transport/retry and assignment metadata, teacher ownership/edit/publish, API auth/assignment and Neon request boundary, import missing-key handling, and report/UI/admin/offline/build paths. Fresh tests exercise the broader product. Unchanged areas use verified baseline equivalence plus fresh gates; this report does not claim every unchanged line was reread, nor exhaustive acceptance.

## Findings


### LC91-F01 — MAJOR — Concurrent outbox drains evade the durable send budget

- status: VERIFIED; LC90-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :438–453, :475, :624; storage CAS boundary src/storage/index.ts:977.
- evidence: fresh probes.log shows six actual transport calls, durable state `sending`, retryCount=0, generation=8. Dispatch accepts an already-sending record and charges the retry only after a response/error.
- reproduction_steps: in the evidence directory run `node LC51-probes.mjs`; finalize synthetic hoa-repeating using MemoryTransactionAdapter, enqueue, launch six drains five milliseconds apart while transport promises remain unresolved, inspect outbox, then resolve sends with 503.
- expected: Shared §3 / WEB §7 bound sends to five across concurrent callers/recovery.
- actual/impact: six requests precede any consumed-budget increment; repeated callers or crashes before response can evade the limit. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a consumed attempt and sending lease before transport; reject/coalesce active leases and recover expired leases without resetting budget. Preserve tuple/hash/generation and terminal confirmation. A process-only mutex does not cover tabs.
- regression_test: two clients, unresolved/lost receipts and crash/reload/lease recovery; one active send, at most five dispatches, immutable final/hash, no late-response downgrade.

### LC91-F02 — MAJOR — Switching exams during HTML download crashes the export

- status: VERIFIED; LC90-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3104, :3177–3185, :3210–3216, :3282–3315.
- evidence: download-race.log/json reports `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, active title `New exam B`. intended-regressions.log fails its no-error assertion.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs`; submit A containing an internal image, defer the image fetch during download, load B through the hidden file input, then release A's fetch. Run `node --test lc67-regressions.test.mjs` after blocks-probe.mjs for the intended invariant.
- expected: WEB §§3/20 export A's complete immutable report or explicitly cancel with recoverable feedback.
- actual/impact: after await, exporter rereads mutable currentExam/order/responses/score. Loading B clears scoredResult and A's download rejects. Mixed-identity output is a source risk, not a separately observed file.
- minimal_fix: capture the complete immutable report data and filename before the first await; use only captured fields thereafter; expose asset/download errors.
- regression_test: defer A asset → open B → resolve; one A file retaining title/version/order/answers/score and no rejection; include cancellation, fetch failure and concurrent downloads.

### LC91-F03 — MAJOR — Math inside table cells silently disappears

- status: VERIFIED; LC90-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:415–428, :1689, :3094, :3282.
- evidence: lc83-independent.json records a valid cell containing text/image/math `x^2+83`; actual question text is only `NESTED-TEXT`. independent.log fails the scoped math assertion. The cell renderer handles text/image but omits math/nested-table branches. Fresh scoped HTML parsing (`nested-report-scoped.json`) yields only `NESTED-TEXT`, mathPreserved=false. The whole-file hasMath flag includes unrelated data and is not evidence of preservation.
- reproduction_steps: `node --test lc83-independent.test.mjs`; load its synthetic canonical exam in Chromium, inspect `.question-stem` and the downloaded report's question content.
- expected: Shared §6 / WEB §§4/8/20 preserve recursive Cell.blocks math, or show source with an unsupported-content warning.
- actual/impact: legitimate question content vanishes without warning, potentially making a question unsolvable. This synthetic case does not establish a defect in a particular real DOCX. The helper also serves review/download.
- minimal_fix: shared recursive safe Block rendering for top-level/cell text, math, images and nested tables; preserve/label unsupported OMML/source.
- regression_test: text/math/image/nested-table cells through exam → final → review → portable download, including unsupported expressions and escaped hostile content.

### LC91-F04 — MAJOR — Actual report lacks filters, navigation and retry-wrong

- status: VERIFIED; LC90-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535–573, :2992–3097; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: fresh browser-probe.log: `cards=2, filter=false, nav=false, retry=false`. The app builds its own report instead of mounting the isolated report controls.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs`; open local dist under /Cunata/, submit synthetic I+III, inspect the report DOM.
- expected: WEB §§24.1/24.5 expose all/wrong/blank filters with aria-pressed, question navigation and independent local retry practice with zero teacher submissions.
- actual/impact: approved roadmap features remain absent from the user entrypoint despite isolated module implementations/tests.
- minimal_fix: integrate report projection/actions/lifecycle; retry must use a fresh immutable practice snapshot/ID without assignment/collector linkage and retain the original final.
- regression_test: actual submit → filter → navigate, including hidden targets → retry wrong/blank/partial-II → refresh; original final unchanged, zero submitResult calls.

### LC91-F05 — MINOR — API stores assignments for nonexistent exams

- status: VERIFIED; LC90-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396–405.
- evidence: probes.log shows HTTP 200 / success=true and one assignment persisted for `does-not-exist` with an empty trusted catalog. Null getExam bypasses the only ownership check.
- reproduction_steps: `node LC51-probes.mjs`; seed active synthetic teacher/session/owned class in MemoryStore; assign unknown examId with valid openAt and dueAt=""; inspect saved assignments.
- expected: reject nonexistent/deleted exams before persistence while allowing authorized published/catalog exams.
- actual/impact: orphan assignment cannot load its exam for students. No cross-owner write was established.
- minimal_fix: require an allowed published record or trusted catalog membership; otherwise NOT_FOUND/INVALID_EXAM without writing. Preserve foreign-owner rejection/no-due handling.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog succeed, foreign owner FORBIDDEN, valid dueAt="" succeeds.

### LC91-F06 — MINOR — Public fraction parser rejects formatter output

- status: VERIFIED; LC90-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel API `toFractionString(rational(10n**200n))` produces a canonical 201-character integer, but parseFractionString throws SyntaxError.
- expected: M1 §4.1 strict inverse across the public rational domain.
- actual/impact: valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: preserve the inverse and bound hostile serialized input at its boundary; restricting the public rational domain requires a consistent contract change.
- regression_test: signed canonical integer/fraction roundtrips at 199/200/201 characters, zero, noncanonical rejection and both inverse directions.

## Red gate and retained behavior

`npm test` fails at test/teacher/portal.test.ts:557, assertion :608: `Teacher exam must have unpublish button`. Its fixture supplies a stored token and teacher metadata without owner/username; src/teacher/portal.ts:1689–1716 now intentionally filters metadata through read-only ownership checks. Teacher/test owners must reconcile fixtures and metadata/port behavior while preserving meaningful assertions and avoiding publish-as-permission-probe. This failure alone does not establish a production authorization bypass.

Fresh independent Chromium checks confirm own-exam access, browsing without revision changes/publish requests, and saved B answer key surviving publication. Nested images in downloaded HTML are portable; canonical top-level Block text/table survives exam/review/download. These retained passes do not fix F02–F04. Product total/max and each section score/max match all 1,632 independent expected cases; the independent oracle also passes.

## checks_run

Environment: Windows/PowerShell; Node v24.14.0; installed TypeScript 7.0.2; Python 3.11.0; installed Chromium through CDP. All checks ran afresh on the temporary snapshot using synthetic/local services. Logs are UTF-8. Exit 0 on a diagnostic probe means its observation/assertion succeeded, including reproduction of a defect; it does not approve the product.

| Command | Exit | Actual result; evidence path relative to snapshot |
| --- | --- | --- |
| `node scripts/build.js` | 0 | 339 files emitted/promoted/verified; 2.302 s; build.log. Existing DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; 1.469 s; tsc.log. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; 1.457 s; tsc-web.log. |
| `npm test` | 1 | 1,617 tests, 345 suites; 1,616 pass, 1 fail, 0 cancelled/skip/todo; 40,711.3171 ms; npm.log, npm-result.json. |
| `node LC51-probes.mjs` | 0 | 6 sends before any durable budget consumption; orphan assignment saved; fraction inverse throws; all 6 roster/PIN/history actions UNKNOWN_ACTION; 0.267 s; probes.log. |
| `node LC51-differential.mjs` | 0 | 1,632 product cases match independently expected total/max and all section score/max; 0.170 s; differential.log. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass, 0 fail/skip; 1,632 fixtures, 5,849 maxima configs, 9 negative controls; reported 1.0581 s; oracle.log. Independent oracle only. |
| `node --test lc83-independent.test.mjs` | 1 | 5 tests, 3 pass, 2 fail, 0 cancel/skip/todo; 2,493.4386 ms; independent.log, lc83-independent.json, nested-report.html. Nested-math assertion fails, plus parent failure. |
| `node download-race.mjs` | 0 | Null totalFraction TypeError and zero downloads after switching to New exam B; 3.409 s; download-race.log/json. |
| `node blocks-probe.mjs` | 0 | Canonical top-level Block text/table retained in exam/review/download; 2.042 s; blocks-probe.log/json. |
| `node --test lc67-regressions.test.mjs` | 1 | 2 tests, 1 pass, 1 fail, 0 cancel/skip/todo; 74.3588 ms; intended-regressions.log. Export isolation fails on fresh probe output. |
| `node LC51-browser-probe.mjs` | 0 | 2 report cards, no filter/nav/retry; 1.683 s; browser-probe.log. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 pass, 0 fail/cancel/skip/todo, 5 suites; 93,164.6868 ms; claude.log. Includes local browser, API/Apps Script, build and design checks. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/codex-check/**/*.test.mjs"` - initial setup | 1 | 199 tests, 188 pass, 11 fail, 0 cancel/skip/todo, 2 suites; 195,178.0529 ms; codex-initial.log. Every reported failure is ENOENT for missing evidence-output folders (including the after hook); no production defect inferred. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/codex-check/**/*.test.mjs"` - corrected setup | 0 | 198 pass, 0 fail/cancel/skip/todo, 2 suites; 199220.8963 ms; codex.log, codex-final-result.json. Complete fresh rerun, including DOCX correction/confirmation and local API/store/build tests. |

Supplemental probes were inspected, copied unchanged from LC90 evidence and executed afresh; harness-hashes.json records the hashes. Browser commands and the final npm run load absolute file-URL NODE_OPTIONS preloads for shutdown only: the existing support/runtime.mjs releases a CDP Browser.close acknowledgement after 100 ms, and teardown-http.mjs closes remaining HTTP connections 1.5 seconds after Server.close. These harness adaptations change no product responses, test assertions, expected values or skips. Read-only GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata support git-sensitive fixtures. No source/assertion changes were made to obtain passing acceptance suites.

Setup history: first npm invocation failed before test discovery because the Windows absolute preload was supplied without a file:// URL (npm-setup.log, npm-setup-result.json, exit 1; zero tests executed). Correcting only the external environment allowed the complete npm run reported above. Its wrapper then encountered a console UnicodeEncodeError while printing the already-recorded tail; npm.log and npm-result.json retain the actual completed child result. This output-encoding issue did not interrupt or rerun the product tests. The initial complete Codex run lacked security/student/teacher output directories in the temporary copy. These directories were then created outside the workspace and the complete suite rerun; no test source or assertion was changed. Local simulators do not establish live Google, Neon, Vercel or CORS behavior.

## coverage_gaps

- M1: fresh product differential and independent oracle; F06 remains. Every raw/status/order/DOM combination is not exhausted.
- M2/M3: Chromium editor/publish/library and rich-content/report paths exercised. Exhaustive private-mode/quota/migration/recovery, every historical version/route/assignment switch and ownership matrix: NOT_RUN; outside this bounded rerun.
- M4/R1/R2: local auth/store/transport/build checks only. Live CORS/Google writes/readback, deployed Neon concurrency/deduplication and production activation: NOT_RUN; production configuration/credentials excluded. No trusted-assessment certification or exhaustive history secret/advisory/license audit.
- M5: automated synthetic DOCX/PDF tests and rich-block probes; broad real multi-column/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus: NOT_RUN. Approved native/manual PDF is not missing auto-parser functionality. F03 blocks full rich-content acceptance.
- M6: automated Chromium responsive/keyboard/component tests differ from manual acceptance. Complete manual 375/768/1440 light/dark visual inspection, Firefox/WebKit, physical phone, OS Telex/VNI, screen reader, independent axe/Lighthouse and p95 input-to-paint measurements: NOT_RUN; automated suites do not supply that evidence. No full WCAG/performance claim.
- Owner milestone/production acceptance: NOT_RUN. This review authorizes no activation, deployment or old-service deletion.

## Missing roadmap features — priority and dependencies

1. **P0 / R0:** repair F01–F04 and reconcile the teacher ownership fixture/port; rerun stable full gates. Preserve read-only listing/key edits/portable images. F05/F06 remain bounded debt.
2. **P1 / R2→R3, §23:** complete local new-service acceptance, then roster CRUD/print, unique hashed four-digit PINs, server five-failure/ten-minute lockout, studentToken/student_id binding, cross-machine reconstruction and unsubmitted roster rows. Fresh addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults probes return UNKNOWN_ACTION. A students table alone does not implement these paths.
3. **P1 / R4, §24.1, after R0:** integrate actual report filters/navigation (F04); isolated view tests do not satisfy the entrypoint.
4. **P2 / R5→R6, §§24.2–24.3, after R3:** authorized btn-view-submission/submissionDialog and examStats/stat-row: per-question accuracy, option distribution and common wrong short answers. Production UI paths absent.
5. **P2 / R7, §24.4, after R3:** PIN-backed myHistory/historyChart with accessible table; production paths absent.
6. **P2 / R8, §24.5, after R4+R7:** independent local wrong/blank/partial-II practice and zero teacher submissions (F04).
7. **P2 / R9, §24.6, after R6:** teacher print, answer sheet and separate key page; btn-teacher-print path absent.
8. **P2 / R10, §24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists, btnTheme path absent.
9. **P3 / R11:** owner-authorized live activation and phone acceptance; privacy/recovery/import/performance matrix, version 1.0 and retirement decision. This task does not authorize these operations.

Custom-only presets/manual PDF remain approved choices. No new scoring grammar/service/storage policy selected. tools_research: NOT_REQUESTED. privacy_notes: synthetic local data; no real student records, credentials or private instructions in this report.

recommended_action: F01→src/collect; F02–F04→src/app; F05→src/api; F06→src/domain. Teacher/test owners reconcile metadata fixtures while preserving read-only listing. Product remains CHANGES_REQUESTED; report handoff READY_FOR_REVIEW.

Final integrity: final-snapshot.json records 1,198 input hashes, unchanged HEAD `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`, workspaceRuntimeAndTestCodeDrift=[], snapshotRuntimeAndTestCodeDrift=[], additionalUncapturedInputFiles=[], app SHA-256 `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. Supplemental harness hashes match LC90. Generated evidence/fixture-data changes are outputs, not program changes. This verdict covers the captured snapshot; later source changes require review. Only this report was intentionally written in the workspace.
