# LC102 - Independent whole-product review

review_id/task_id/worker_id: LC102; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit at capture: `97e89d699b473fdb557ea914992ef905af3d0cb1`; branch: main; existing dirty working tree included.
requirements_version: Shared Product Contract v2.0 (precedence), WEB-contract.md section 1-24 (read in full), inherited M1, approved decisions, DESIGN.md and LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Four MAJOR and two MINOR product findings reproduced afresh. The required npm gate fails independently. Handoff status: READY_FOR_REVIEW, not product approval. NEED_DECISION: NONE for the identified repairs and approved local roadmap.

## Snapshot, scope and method

Only intentional workspace write: `docs/reviews/LOOP-102-codex.md`. No source/test edits, dependency installation, commits, branch/worktree creation or deployment. Pre-existing changes were preserved. No applicable AGENTS.md found.

Fresh evidence: `%USERPROFILE%/AppData/Local/Temp/LC102-bhzuy104`. Commands ran in an ordinary temporary copy of the current workspace plus already-installed dependencies; this is not a Git checkout/worktree. All generated test/build files remain outside D:/Cunata. Production configuration was excluded; public/config.json retains the local empty configuration. No live Google/Neon writes.

Read current git log/diff/status, captured as git-log.txt/git-diff.txt/git-status.txt. `changes-since-LC101.json`: all 452 previously pinned code/test/build/config inputs are unchanged; `copy-comparison.json`: 452 compared, zero mismatches. HEAD is also unchanged since LC101. Current dirty changes relative to HEAD are included, notably app/report rendering, collector receipt handling, API persistence/ownership and build/publish integration. This is a repeated audit of an unchanged source baseline with fresh checks, not evidence that earlier findings were repaired. Redundant historical ops artifact copying was interrupted; required source/test/support/publisher inputs were copied before tests.

files_reviewed: log/diff; domain scoring/rational/DTO and validation; schema and asset boundaries; storage transactions/finalization/outbox CAS/migration; student timer, snapshot, route and assignment metadata; collector transport/receipt/retry/export; report projection and actual app display/download; teacher/builder/bank versioning and ownership; API auth, assignments, results, Memory/Neon store and RPC; DOCX ZIP/XML/segmentation and manual PDF entrypoints; offline service worker and build/config/publisher. Code reading focused on boundaries and the six suspect paths; full suites exercise the baseline across modules. This does not claim a fresh line-by-line reread of every unchanged file or exhaustive acceptance. Previous diagnostic scripts were inspected and rerun; previous outputs are not counted as new results.

## Findings

### LC102-F01 - MAJOR - Concurrent outbox drains bypass the durable send budget

- status: VERIFIED; LC101-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:424, :454-469, :491, :640; storage CAS boundary src/storage/index.ts:977.
- evidence: fresh probes.log records six transport calls while durable state is sending, retryCount=0, generation=8. CAS advances generation but an existing sending state is accepted; consumed budget is charged after response/failure.
- reproduction_steps: from the evidence directory, `node LC51-probes.mjs`; finalize synthetic hoa-repeating with MemoryTransactionAdapter, enqueue, call drainOutbox six times five milliseconds apart while transport promises remain unresolved; inspect the outbox, then resolve requests with 503.
- expected: Shared section 3 / WEB section 7 require bounded durable retries, including concurrent callers and recovery.
- actual/impact: more than five requests can start without consuming any retry budget. Repeated callers or crashes before response evade the bound. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a send attempt plus an active lease before transport; coalesce/reject an active lease and recover expired leases without resetting budget. Keep tuple/hash/generation checks and terminal confirmation; a process-only mutex does not protect tabs.
- regression_test: two clients with unresolved/lost receipts and crash/reload/expired-lease recovery; one active send and at most five actual dispatches, stable final/hash, no late downgrade.

### LC102-F02 - MAJOR - Changing exam during HTML export crashes the download

- status: VERIFIED; LC101-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3104, :3177-3185, :3210-3216, :3282-3315.
- evidence: fresh download-race.json/log records `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, active title New exam B. intended-regressions.log fails the intended no-error invariant.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs`; submit A with an internal image, defer that image fetch during HTML export, load B through the hidden file input, then release A's fetch. `node --test lc67-regressions.test.mjs` evaluates the captured invariant after blocks-probe.mjs.
- expected: Shared section 2 / WEB section 3/20 export A's complete immutable report or cancel explicitly with recoverable feedback.
- actual/impact: after await the handler reads mutable currentExam/order/responses/scoredResult; opening B clears the score and A's download rejects. Mixed-identity output is a source risk, not an observed downloaded file.
- minimal_fix: capture the full immutable report data, assets and filename before the first await; read only captured data afterward; surface export/asset errors.
- regression_test: defer A asset - open B - resolve; one valid A report retaining title/version/order/answers/score; cancellation, missing asset and concurrent downloads must give explicit outcomes.

### LC102-F03 - MAJOR - Math inside a table cell disappears silently

- status: VERIFIED; LC101-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:415-428, :1689, :3094, :3282.
- evidence: lc83-independent.json contains a valid table cell with text/image/math source x^2+83, but actual .question-stem text is only NESTED-TEXT. The scoped math assertion fails. Fresh nested-report-scoped.json parses `.review-question-card .review-q-content` in the downloaded file: text=NESTED-TEXT, mathPreserved=false. The cell loop renders text/image only.
- reproduction_steps: `node --test lc83-independent.test.mjs`; load the synthetic canonical exam in Chromium, inspect its stem, submit and download. Inspect the downloaded question content specifically; whole-file hasMath=true includes unrelated text and is not preservation evidence.
- expected: Shared section 6 / WEB section 4/8/20 preserve recursive Cell.blocks math, or display its source with an unsupported-content warning.
- actual/impact: legitimate question content disappears without warning and may make the question unsolvable. The same helper serves report/download. This synthetic case does not establish corruption in a particular real DOCX.
- minimal_fix: shared recursive safe Block renderer handling text/math/image/nested table both at top level and inside cells; preserve/label unsupported OMML/source.
- regression_test: mixed cell content through exam - final - review - portable HTML, including nested tables, unsupported expressions and escaped hostile text.

### LC102-F04 - MAJOR - Actual result page lacks filters, navigation and retry-wrong

- status: VERIFIED; LC101-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535-573, :2992-3097; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: fresh browser-probe.log: cards=2, filter=false, nav=false, retry=false. Actual app builds its own report rather than mounting the isolated report controls. R4 acceptance runs below check the submitted result page, not just exported view functions.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs`; open the local build under /Cunata/, submit synthetic I+III, inspect report DOM for reviewFilter/reviewNav/btnRetryWrong.
- expected: WEB section 24.1/24.5 supply all/wrong/blank filters with aria-pressed, question navigation, and independent local retry practice without teacher submission.
- actual/impact: approved features remain unreachable despite isolated module implementations/tests. Filters/navigation are R4 debt; full retry also depends on R7 under the approved roadmap.
- minimal_fix: integrate report projection/actions/lifecycle; retry uses a fresh practice snapshot/ID with no assignment/collector linkage and preserves the original final.
- regression_test: actual submit - filter - navigate including hidden target - retry wrong/blank/partial-II - refresh; original final unchanged and zero submitResult calls for practice.

### LC102-F05 - MINOR - API persists assignments for nonexistent exams

- status: VERIFIED; LC101-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396-405.
- evidence: fresh probes.log: HTTP 200 / success=true and one assignment stored for does-not-exist with an empty trusted catalog. A null getExam result bypasses the ownership condition.
- reproduction_steps: `node LC51-probes.mjs`; seed an active synthetic teacher/session/owned class in MemoryStore, assign unknown examId with valid openAt and dueAt="", inspect assignments.
- expected: reject nonexistent/deleted exams before persistence; allow authorized published or trusted catalog exams.
- actual/impact: orphan assignment is saved although students cannot load its exam. No cross-owner write was demonstrated.
- minimal_fix: require an allowed published exam or trusted catalog membership, otherwise NOT_FOUND/INVALID_EXAM with no write; preserve foreign-owner rejection and no-due semantics.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog pass, foreign owner is FORBIDDEN, valid dueAt="" remains supported.

### LC102-F06 - MINOR - Public fraction parser rejects formatter output

- status: VERIFIED; LC101-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs`; the barrel API toFractionString(rational(10n**200n)) returns a canonical 201-character integer; parseFractionString throws SyntaxError.
- expected: M1 section 4.1 specifies a strict inverse for public rational formatting/parsing.
- actual/impact: valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: reconcile the public inverse guarantee with parser resource limits; separate DTO boundary caps from unrestricted rational conversion, preserving bounded untrusted input handling.
- regression_test: signed integer/fraction roundtrips across length boundaries plus oversized untrusted DTO rejection and existing scoring cases.

## Required gate failures

Fresh `npm test`: **1,625 tests, 345 suites; 1,622 pass, 3 fail, 0 skipped/cancelled/todo; exit 1.** The following failures independently prevent a green gate:

- test/collect/apiBase.test.ts:41 (send :66): RECEIPT_INVALID, fixture lacks attempt_id and recorded_at.
- test/collect/r0-f04-regression.test.ts:6 (send :96): BAD_RESPONSE, fixture uses ok:true rather than success:true.
- test/teacher/portal.test.ts:557 (assert :608): Teacher exam must have unpublish button; fixture lacks owner and current teacher username while src/teacher/portal.ts:1689-1716 now filters ownership without write probes.

**VÙNG chịu trách nhiệm: glue** for test reconciliation, with src/collect and src/teacher owners consulted. Minimal repair: update fixtures/port metadata to the current real response and ownership contract; retain malformed/mismatched receipt rejection and assignment/raw-answer assertions. Do not weaken production validation or restore publish-based ownership probes. Regression: these three tests plus full npm and browser ownership/collector cases. These test failures do not independently prove a production authorization bypass.

## checks_run

Environment: Windows/PowerShell, Node v24.14.0, TypeScript 7.0.2, Python 3.11.0, installed Chromium through native CDP harness. Commands, exits and wall times: gate-results.json and browser-results.json. Each outcome below is from LC102; diagnostic exit 0 means reproduction completed, not product acceptance.

| Command | Exit | Actual result | Evidence / seconds |
| --- | --- | --- | --- |
| `node scripts/build.js` | 0 | PASS, 339 emitted/promoted/verified files; existing DEP0190 warning | build.log / 2.112 |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS, no diagnostics | tsc.log / 6.878 |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS, no diagnostics | tsc-web.log / 7.270 |
| `npm test` | 1 | FAIL, tests=1625, suites=345, pass=1622, fail=3, skip/cancel/todo=0 | npm.log / 31.617 |
| `node LC51-probes.mjs` | 0 | Diagnostic: six sends/retryCount=0; orphan assignment; rational inverse rejection; six missing roster actions | probes.log / 0.318 |
| `node LC51-differential.mjs` | 0 | PASS, 1,632 product total/max and section score/max comparisons | differential.log / 0.185 |
| `python -B test/oracle/oracle.py --check` | 0 | PASS, 11 tests, 1,632 fixtures, 5,849 maxima configurations, 9 negative controls; independent oracle only | oracle.log / 2.903 |
| `node --test lc83-independent.test.mjs` | 1 | FAIL, tests=5, pass=3, fail=2; nested-math child and parent fail; skip/cancel/todo=0 | independent.log / 2.684 |
| `node download-race.mjs` | 0 | Diagnostic: null totalFraction TypeError; zero downloads; New exam B active | download-race.log / 3.340 |
| `node blocks-probe.mjs` | 0 | PASS, top-level canonical text/table in exam/review/download | blocks-probe.log / 1.998 |
| `node --test lc67-regressions.test.mjs` | 1 | FAIL, tests=2, pass=1, fail=1; download invariant fails; skip/cancel/todo=0 | intended-regressions.log / 0.129 |
| `node LC51-browser-probe.mjs` | 0 | Diagnostic: cards=2, filter=false, nav=false, retry=false | browser-probe.log / 1.736 |
| `node --test --test-timeout=90000 test/app/r2-f01-service-worker.test.mjs` | 0 | PASS, tests=3, pass=3, fail=0, skip/cancel/todo=0 | sw.log / 1.696 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/claude-check/**/*.test.mjs` | 0 | PASS, tests=104, suites=5, pass=104, fail=0, skip/cancel/todo=0 | claude.log / 69.374 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` (initial environment) | 1 | FAIL, tests=265, suites=2, pass=200, fail=65, skip/cancel/todo=0; includes temporary-copy setup errors, not 65 product bugs | codex.log / 191.801 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/cx/*.test.mjs` (output directories restored) | 0 | PASS, tests=51, pass=51, fail=0, skip/cancel/todo=0 | cx-rerun.log / 58.462 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` (corrected environment) | 1 | FAIL, tests=264, suites=2, pass=223, fail=41, skip/cancel/todo=0 | codex-rerun.log / 206.538 |

The first full Codex run included 24 setup-related failures: 11 CX outcomes (including an after-hook) from missing evidence output directories, plus four R1 and nine R2 build outcomes because relative NODE_OPTIONS imports resolved inside isolated build fixtures. These are reviewer test-copy errors, not implementation findings. Restoring empty output directories made all 51 CX tests pass. A subsequent absolute Windows-path preload attempt failed at runner bootstrap (exit 1, 0.654s; codex-preload-path-error.log); the final full rerun uses absolute file:/// preload URLs and unchanged source/assertions. Initial logs remain available. Final full rerun: 22 API and 11 browser failures in test/codex-check/feat/R3/{api,browser}.test.mjs (UNKNOWN_ACTION and missing roster/PIN UI); eight in test/codex-check/feat/R4/review.test.mjs:112, :125 (wrong/blank), :132, :142, :153, :168 (1280/390px). Both R3 real-handle preconditions pass. R1/R2 build/publisher checks pass in the corrected run. No ENOENT or bootstrap errors remain. These 41 outcomes confirm missing approved features, not 41 independent security bugs.

Fresh browser probes preserve read-only own-exam browsing (revision 1 to 1, zero publish requests during listing), the saved B answer key through publication, portable nested images and top-level canonical text/table rendering. They do not repair F02-F04. Service-worker tests cover RPC bypass/cache purge and a controlled-browser title update/unpublish against local API; not live-service or full multi-version migration acceptance.

NODE_OPTIONS preloads unchanged ops/blitz/promoted/_support/runtime.mjs (acknowledges Browser.close after 100ms) and teardown-http.mjs (closes lingering HTTP connections 1.5s after Server.close). These modify teardown, not product behavior, assertions, expected values or skip lists. GIT_DIR/GIT_WORK_TREE provide read-only original repository context. Synthetic local services do not certify deployed Neon/Google behavior.

Fresh bounded secret scan: 144 code/data files under src/public/scripts/apps-script, zero private-key markers, Google/GitHub token patterns or credentialed PostgreSQL URLs; bounded-secret-scan.json. This is not a comprehensive credential/history/dependency advisory/license audit.

## coverage_gaps

- M1: fresh npm, product differential and oracle; F06 remains. Exhaustive raw/status/order/DOM combinations not covered.
- M2/M3: fresh Chromium flows and gates; exhaustive quota/private browsing, migration/quarantine/recovery, route/version/assignment races and multi-tab interleavings NOT_RUN in this audit.
- M4/R1/R2: local auth/store/transport/publisher simulations. Live Google CORS/redirect/write/readback, deployed Neon concurrency/deduplication and activation NOT_RUN: no production configuration or live write authorization used. Practice with client answer keys is not trusted-assessment certification.
- M5: synthetic importer tests and rich-content probes; broad real multi-column/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus NOT_RUN. F03 blocks rich-content acceptance. Approved manual PDF is not missing automatic parsing.
- M6: Chromium responsive/keyboard checks do not replace owner acceptance. Full manual 375/768/1440 light/dark matrix, physical phones, Firefox/WebKit, OS Telex/VNI, screen reader, independent axe/Lighthouse and input-to-paint p95 NOT_RUN. No full WCAG/performance claim.
- Offline: fresh RPC bypass/update test; complete two-version cache migration across active attempts/tabs NOT_RUN.
- Comprehensive dependency/advisory/license/history audit and owner milestone/production acceptance NOT_RUN. Deployment, activation and old-service deletion are outside this task.

## Missing roadmap features - priority order

1. **P0 / R0 stabilization:** fix F01-F04 and reconcile the three failing npm tests while preserving ownership isolation, saved keys and portable images. F05/F06 are bounded additional debt.
2. **P1 / R3, WEB section 23, after R2:** roster CRUD/print; unique hashed four-digit PINs; server-enforced five-failure/ten-minute lockout; studentToken/student_id binding; cross-machine report reconstruction and unsubmitted roster rows. Fresh probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table and acceptance tests are not implementation.
3. **P1 / R4, section 24.1, after R0:** integrate all/wrong/blank filters with aria-pressed and question navigation into the actual result page (F04). Isolated report/view controls are insufficient.
4. **P2 / R5-R6, section 24.2-24.3, after R3:** authorized per-student submissionDialog/btn-view-submission; examStats/stat-row, question accuracy, option distributions, top three wrong short answers. Production source search finds no UI implementation paths.
5. **P2 / R7, section 24.4, after R3:** PIN-backed myHistory/historyChart plus an accessible text table; production paths absent.
6. **P2 / R8, section 24.5, after R4+R7:** independent local wrong/blank/partial-II retry practice, immutable original final, zero teacher submissions (F04).
7. **P2 / R9, section 24.6, after R6:** teacher print with answer sheet and separate key; btn-teacher-print production path absent.
8. **P2 / R10, section 24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists but btnTheme production path is absent.
9. **P3 / R11:** owner-authorized live activation, phone acceptance, recovery/import/privacy/performance matrix, version 1.0 and retirement decision. Outside LC102 authorization.

Custom-only presets and manual PDF remain approved choices. NEED_DECISION: NONE for local repairs or this approved roadmap; no new grammar/storage/service policy chosen. R11 still requires explicit owner acceptance/authorization when reached.

tools_research: NOT_REQUESTED. privacy_notes: synthetic local data only, no real student records, credentials or private instruction content.
recommended_action: F01 -> src/collect; F02-F04 -> src/app; F05 -> src/api; F06 -> src/domain. Glue reconciles test contracts with module owners without weakening receipts or ownership. Product remains CHANGES_REQUESTED; report READY_FOR_REVIEW.

Final integrity: final-snapshot.json confirms all 452 pinned code/test/build/config inputs from LC101 remain unchanged in the workspace; final HEAD `97e89d699b473fdb557ea914992ef905af3d0cb1`; src/app/main.ts SHA-256 `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. The broader 917-entry copy inventory also includes generated test evidence; 10 of those entries changed in the workspace during review, all outside the 452 pinned code inputs (paths retained in final-snapshot.json). Generated evidence is excluded from the source-integrity claim. Only docs/reviews/LOOP-102-codex.md was intentionally written in the workspace.
