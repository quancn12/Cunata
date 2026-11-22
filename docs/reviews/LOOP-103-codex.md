# LC103 - Independent whole-product review

review_id/task_id/worker_id: LC103; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `97e89d699b473fdb557ea914992ef905af3d0cb1`; branch: main; existing dirty working tree included.
requirements_version: Shared Product Contract v2.0 (precedence), WEB-contract.md sections 1-24 (read in full), inherited M1, approved decisions, docs/design/DESIGN.md and docs/LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Fresh reproductions confirm four MAJOR and two MINOR product findings; the required npm gate also fails. Handoff status is READY_FOR_REVIEW, not product approval. NEED_DECISION: NONE for these repairs or approved local roadmap items.

## Snapshot, scope and method

Only intentional workspace write: `docs/reviews/LOOP-103-codex.md`. No source/test edits, installation, dependency changes, commits, branches/worktrees or deployment. Existing changes preserved. No applicable AGENTS.md was found in the inspected project/parent paths.

Fresh evidence directory: `%USERPROFILE%/AppData/Local/Temp/LC103-audit-06837ast`. Commands ran against an ordinary temporary copy of the current working tree and already-installed dependencies, protecting the authorized file scope from generated build/test files. Local public/config.json remains unconfigured; production config was excluded. No live Google/Neon writes. An initial overbroad temporary evidence copy was stopped; all reported checks use the completed `LC103-audit-06837ast` copy.

Read git log/status/diff (git-log.txt, git-status.txt, git-diff.txt). HEAD is unchanged since LC102. `changes-since-LC102.json` compares its 917-entry inventory: only ten generated R3 evidence JSON/PNG files differ, no captured executable inputs. `source-integrity.json` separately compares 579 selected code/data inputs: zero workspace changes and zero copy mismatches at verification. This is a fresh audit of the unchanged source baseline, not evidence that earlier findings were fixed. No package/lockfile diff. Do not treat background operational/evidence changes as reviewer source edits.

files_reviewed: current diff and focused source reads across domain scoring/rational/DTO, schema and assets, storage finalization/outbox CAS/migration, student timer/snapshot/assignment metadata, collector transport/receipt/retry/export, report projection and actual app display/download, teacher/builder/bank ownership/versioning, API authentication/assignments/results and Memory/Neon persistence, DOCX segmentation/ZIP/XML and manual PDF, UI blocks, service worker, build and publishing. Existing tests cover the wider baseline. This does not claim a new line-by-line read of every unchanged file or exhaustive acceptance. Diagnostic script source was inspected before fresh execution; historical output is not counted as fresh evidence.

## Findings


### LC103-F01 - MAJOR - Concurrent outbox drains bypass the durable send budget

- status: VERIFIED; LC102-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:424, :454-469, :491, :640; storage CAS boundary src/storage/index.ts:977.
- evidence: fresh probes.log records six transport calls while durable state is sending, retryCount=0, generation=8. CAS advances generation but an existing sending state is accepted; consumed budget is charged after response/failure.
- reproduction_steps: from the evidence directory, `node LC51-probes.mjs`; finalize synthetic hoa-repeating with MemoryTransactionAdapter, enqueue, call drainOutbox six times five milliseconds apart while transport promises remain unresolved; inspect the outbox, then resolve requests with 503.
- expected: Shared section 3 / WEB section 7 require bounded durable retries, including concurrent callers and recovery.
- actual/impact: more than five requests can start without consuming any retry budget. Repeated callers or crashes before response evade the bound. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a send attempt plus an active lease before transport; coalesce/reject an active lease and recover expired leases without resetting budget. Keep tuple/hash/generation checks and terminal confirmation; a process-only mutex does not protect tabs.
- regression_test: two clients with unresolved/lost receipts and crash/reload/expired-lease recovery; one active send and at most five actual dispatches, stable final/hash, no late downgrade.

### LC103-F02 - MAJOR - Changing exam during HTML export crashes the download

- status: VERIFIED; LC102-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3104, :3177-3185, :3210-3216, :3282-3315.
- evidence: fresh download-race.json/log records `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, active title New exam B. intended-regressions.log fails the intended no-error invariant.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs`; submit A with an internal image, defer that image fetch during HTML export, load B through the hidden file input, then release A's fetch. `node --test lc67-regressions.test.mjs` evaluates the captured invariant after blocks-probe.mjs.
- expected: Shared section 2 / WEB section 3/20 export A's complete immutable report or cancel explicitly with recoverable feedback.
- actual/impact: after await the handler reads mutable currentExam/order/responses/scoredResult; opening B clears the score and A's download rejects. Mixed-identity output is a source risk, not an observed downloaded file.
- minimal_fix: capture the full immutable report data, assets and filename before the first await; read only captured data afterward; surface export/asset errors.
- regression_test: defer A asset - open B - resolve; one valid A report retaining title/version/order/answers/score; cancellation, missing asset and concurrent downloads must give explicit outcomes.

### LC103-F03 - MAJOR - Math inside a table cell disappears silently

- status: VERIFIED; LC102-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:415-428, :1689, :3094, :3282.
- evidence: lc83-independent.json contains a valid table cell with text/image/math source x^2+83, but actual .question-stem text is only NESTED-TEXT. The scoped math assertion fails. Fresh nested-report-scoped.json parses `.review-question-card .review-q-content` in the downloaded file: text=NESTED-TEXT, mathPreserved=false. The cell loop renders text/image only.
- reproduction_steps: `node --test lc83-independent.test.mjs`; load the synthetic canonical exam in Chromium, inspect its stem, submit and download. Inspect the downloaded question content specifically; whole-file hasMath=true includes unrelated text and is not preservation evidence.
- expected: Shared section 6 / WEB section 4/8/20 preserve recursive Cell.blocks math, or display its source with an unsupported-content warning.
- actual/impact: legitimate question content disappears without warning and may make the question unsolvable. The same helper serves report/download. This synthetic case does not establish corruption in a particular real DOCX.
- minimal_fix: shared recursive safe Block renderer handling text/math/image/nested table both at top level and inside cells; preserve/label unsupported OMML/source.
- regression_test: mixed cell content through exam - final - review - portable HTML, including nested tables, unsupported expressions and escaped hostile text.

### LC103-F04 - MAJOR - Actual result page lacks filters, navigation and retry-wrong

- status: VERIFIED; LC102-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535-573, :2992-3097; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: fresh browser-probe.log: cards=2, filter=false, nav=false, retry=false. Actual app builds its own report rather than mounting the isolated report controls. R4 acceptance runs below check the submitted result page, not just exported view functions.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs`; open the local build under /Cunata/, submit synthetic I+III, inspect report DOM for reviewFilter/reviewNav/btnRetryWrong.
- expected: WEB section 24.1/24.5 supply all/wrong/blank filters with aria-pressed, question navigation, and independent local retry practice without teacher submission.
- actual/impact: approved features remain unreachable despite isolated module implementations/tests. Filters/navigation are R4 debt; full retry also depends on R7 under the approved roadmap.
- minimal_fix: integrate report projection/actions/lifecycle; retry uses a fresh practice snapshot/ID with no assignment/collector linkage and preserves the original final.
- regression_test: actual submit - filter - navigate including hidden target - retry wrong/blank/partial-II - refresh; original final unchanged and zero submitResult calls for practice.

### LC103-F05 - MINOR - API persists assignments for nonexistent exams

- status: VERIFIED; LC102-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396-405.
- evidence: fresh probes.log: HTTP 200 / success=true and one assignment stored for does-not-exist with an empty trusted catalog. A null getExam result bypasses the ownership condition.
- reproduction_steps: `node LC51-probes.mjs`; seed an active synthetic teacher/session/owned class in MemoryStore, assign unknown examId with valid openAt and dueAt="", inspect assignments.
- expected: reject nonexistent/deleted exams before persistence; allow authorized published or trusted catalog exams.
- actual/impact: orphan assignment is saved although students cannot load its exam. No cross-owner write was demonstrated.
- minimal_fix: require an allowed published exam or trusted catalog membership, otherwise NOT_FOUND/INVALID_EXAM with no write; preserve foreign-owner rejection and no-due semantics.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog pass, foreign owner is FORBIDDEN, valid dueAt="" remains supported.

### LC103-F06 - MINOR - Public fraction parser rejects formatter output

- status: VERIFIED; LC102-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
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

Environment: Windows/PowerShell, Node v24.14.0, TypeScript 7.0.2, Python 3.11.0; installed Chromium via native CDP harness. All counts below are fresh LC103 results; zero skipped/cancelled/todo in listed test-runner results. Diagnostic exit 0 establishes completion of a reproduction, not product acceptance. Log paths are relative to the evidence directory above. gate-results.json, browser-results.json, acceptance-results.json and cx-rerun-result.json retain commands/exits/timings.

| Command | Exit | Actual result | Evidence / seconds |
| --- | --- | --- | --- |
| `node scripts/build.js` | 0 | PASS; 339 emitted/promoted/verified files; existing DEP0190 warning | build.log / 2.125 |
| `npm.cmd test` | 1 | FAIL; 1,625 tests, 345 suites, pass=1,622 fail=3 | npm.log / 30.625 |
| `npx.cmd --no-install tsc -p tsconfig.json` | 0 | PASS; no diagnostics | tsc.log / 6.547 |
| `npx.cmd --no-install tsc -p tsconfig.web.json` | 0 | PASS; no diagnostics | tsc-web.log / 6.328 |
| `node LC51-probes.mjs` | 0 | Diagnostic: six concurrent sends with retryCount=0; orphan assignment accepted; fraction inverse rejected; six UNKNOWN_ACTION roster/PIN actions | probes.log / 0.344 |
| `node LC51-differential.mjs` | 0 | PASS; 1,632 product total/max and section score/max comparisons | differential.log / 0.235 |
| `python -B test/oracle/oracle.py --check` | 0 | PASS; 11/11 tests, 1,632 fixtures, 5,849 maxima configurations, 9 negative controls; independent oracle only | oracle.log / 2.719 |
| `node --test lc83-independent.test.mjs` | 1 | FAIL; 5 tests, pass=3 fail=2 (nested math child and parent) | independent.log / 2.906 |
| `node download-race.mjs` | 0 | Diagnostic: null totalFraction TypeError; zero downloads; New exam B active | download-race.log / 3.344 |
| `node blocks-probe.mjs` | 0 | PASS diagnostic; top-level canonical text/table in exam/review/download | blocks-probe.log / 2.031 |
| `node --test lc67-regressions.test.mjs` | 1 | FAIL; 2 tests, pass=1 fail=1 (download invariant) | intended-regressions.log / 0.11 |
| `node LC51-browser-probe.mjs` | 0 | Diagnostic: cards=2, filter=false, nav=false, retry=false | browser-probe.log / 1.718 |
| `node --test --test-timeout=90000 test/app/r2-f01-service-worker.test.mjs` | 0 | PASS; 3 tests, pass=3 fail=0 | sw.log / 1.672 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/claude-check/**/*.test.mjs` | 0 | PASS; 104 tests, 5 suites, pass=104 fail=0 | claude.log / 73.922 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` | 1 | FAIL; 265 tests, 2 suites, pass=213 fail=52; includes 11 temporary-copy output-directory errors | codex.log / 200.453 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/cx/*.test.mjs` | 0 | PASS after restoring empty output folders; 51 tests, pass=51 fail=0 | cx-rerun.log / 56.5 |

The full Codex run has 41 contract-feature failures: 22 in feat/R3/api.test.mjs (missing roster/PIN API), 11 in feat/R3/browser.test.mjs (missing roster/PIN UI), eight in feat/R4/review.test.mjs (wrong/blank filters and navigation at 1280/390px). R3 real-handle preconditions pass. The other 11 failures, including an after-hook outcome, are reviewer setup errors: missing ops/blitz/promoted/_audit/{security,student,teacher} output folders. After creating empty folders, all 51 affected CX tests pass with unchanged product source and assertions. No second full-suite result is claimed; the full log remains red and retained. R1/R2 local API/build/publisher checks pass in that run. These are feature outcomes, not 41 independent security bugs.

Browser runs preload unchanged ops/blitz/promoted/_support/runtime.mjs (Browser.close acknowledgement after 100ms) and teardown-http.mjs (close lingering HTTP connections 1.5s after Server.close), using absolute file URLs. These affect teardown, not product behavior/assertions/skip lists. GIT_DIR/GIT_WORK_TREE supply original repository context for read-only provenance checks. One Python orchestration console print hit Windows encoding after Claude completed; its exit-0 log/results were saved, and the Codex command was then run separately. This was not a product-test failure.

Fresh probes also confirm own-exam browsing keeps revision 1 to 1 with zero publish requests; the saved B key survives publication; nested images remain portable; top-level canonical text/table renders. These do not repair F02-F04. nested-report-scoped.json verifies the downloaded question content lacks nested math; whole-file substring matches are not preservation evidence. Service-worker checks cover RPC bypass/cache purge and local controlled-browser title update/unpublish, not deployed-service acceptance.

Bounded fresh secret-pattern scan: 142 code/data files under src/public/scripts/apps-script; zero private-key markers, Google/GitHub token-pattern or credentialed PostgreSQL URL matches (bounded-secret-scan.json). This is not a complete credential/history/dependency/license audit.


## coverage_gaps

- M1: fresh npm tests, product-versus-expected comparison and independent oracle; F06 remains. Exhaustive score/raw/status/order/DOM combinations were not reverified.
- M2/M3: fresh local browser and unit checks. Exhaustive quota/private browsing, storage migration/quarantine/recovery, clock shifts, route/assignment races and real multi-tab interleavings NOT_RUN in this audit.
- M4/R1/R2: local API/store/transport/publisher simulations. Live Google CORS/redirect/write/readback and deployed Neon concurrency/deduplication NOT_RUN: no live configuration or write authorization used. Practice with client answer keys is not trusted-assessment certification.
- M5: synthetic importer tests and rich-content probes, including observed F03. Broad real multi-column/merged-cell/media/unsupported-equation/corrupt/encrypted/scan document corpus NOT_RUN. Approved manual PDF is not missing automatic parsing.
- M6: browser responsive/keyboard checks do not replace full manual 375/768/1440 light/dark product acceptance. Physical phones, Firefox/WebKit, OS Telex/VNI, screen reader, independent axe/Lighthouse and input-to-paint p95 NOT_RUN. No full WCAG/performance certification.
- Offline: fresh RPC bypass/cache-purge/update check and existing browser suite; complete two-version cache migration across active attempts/tabs NOT_RUN.
- Comprehensive dependency advisory/license/history audit and owner milestone/production acceptance NOT_RUN. Deployment, activation and old-service deletion are outside LC103.

## Missing roadmap features - priority order

1. **P0 / R0 stabilization:** fix F01-F04 and reconcile three failing npm fixtures with real receipts and ownership, retaining isolation, saved keys and portable images. F05/F06 are bounded additional debt.
2. **P1 / R3, section 23, after R2:** roster CRUD/print, unique hashed four-digit PINs, five-failure/ten-minute server lockout, studentToken/student_id binding, cross-machine report reconstruction, unsubmitted roster rows. Fresh handle probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table and acceptance tests do not implement the feature.
3. **P1 / R4, section 24.1, after R0:** mount all/wrong/blank filters, aria-pressed and question navigation in the actual result page (F04); isolated report/view controls are insufficient.
4. **P2 / R5-R6, sections 24.2-24.3, after R3:** authorized per-student submissionDialog/btn-view-submission; examStats/stat-row, question accuracy, option distributions, top three wrong short answers. Production source search finds no UI implementation paths.
5. **P2 / R7, section 24.4, after R3:** PIN-backed myHistory/historyChart and accessible table; production paths absent.
6. **P2 / R8, section 24.5, after R4+R7:** local retry for wrong/blank/partial-II questions, original final immutable, zero teacher submissions. Button exists only in the isolated report view (F04).
7. **P2 / R9, section 24.6, after R6:** teacher print with answer sheet and separate answer key; btn-teacher-print production path absent.
8. **P2 / R10, section 24.7, after R8+R9:** remembered S?ng/T?i/Theo m?y TopBar control; system-dark CSS exists but btnTheme production path absent.
9. **P3 / R11:** owner-authorized live activation, phone acceptance, recovery/import/privacy/performance matrix, version 1.0 and retirement decision. Outside LC103 authorization.

Custom-only presets and manual PDF remain approved choices. NEED_DECISION: NONE for local repairs/approved roadmap; no new grammar/storage/service policy chosen. R11 still requires explicit owner acceptance/authorization when reached.

tools_research: NOT_REQUESTED. privacy_notes: synthetic local data only; no real student records, credentials or private instruction content in this report.
recommended_action: F01 -> src/collect; F02-F04 -> src/app; F05 -> src/api; F06 -> src/domain. Glue reconciles failing fixtures with module owners without weakening receipts or ownership. Keep product CHANGES_REQUESTED; report READY_FOR_REVIEW.

Final integrity: final-snapshot.json records HEAD `97e89d699b473fdb557ea914992ef905af3d0cb1` and zero changed selected workspace source inputs since capture; src/app/main.ts SHA-256 `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. Only docs/reviews/LOOP-103-codex.md was intentionally written in the workspace. Source changes after this snapshot invalidate the corresponding review evidence.
