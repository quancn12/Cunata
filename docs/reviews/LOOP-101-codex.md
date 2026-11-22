# LC101 - Independent whole-product review

review_id/task_id/worker_id: LC101; reviewer: Codex; risk_level: HIGH.
base_commit/test_start_head: `a828d5b6f89f3baa05e80c0d640fcc491ee911df`; head_commit: `97e89d699b473fdb557ea914992ef905af3d0cb1`; branch: main; pre-existing dirty tree included.
requirements_version: Shared Product Contract v2.0 (precedence), WEB-contract.md sections 1-24 (read in full), inherited M1, approved decisions, DESIGN.md, LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Four MAJOR and two MINOR findings reproduced afresh; mandatory npm gate remains red. NEED_DECISION: NONE for these repairs or the approved local roadmap. Report handoff is READY_FOR_REVIEW; this does not approve the product.

## Snapshot, scope and method

Only intentional workspace write: `docs/reviews/LOOP-101-codex.md`. No source/test edits, installs, dependency changes, commits, branch/worktree creation or deployment. No AGENTS.md found. Existing changes preserved.

Evidence directory: `%USERPROFILE%/AppData/Local/Temp/LC101-dwjjjol1`. Checks ran afresh in an ordinary temporary test copy of current workspace files and already-installed dependencies. Generated build/test files stay outside the workspace; this is not a checkout/worktree. Production configuration was excluded; public/config.json remains the empty local configuration. No live Google/Neon writes.

`changes-since-LC100.json` compares all 446 previously pinned source/test/build/config inputs: zero changed/missing inputs and zero copy mismatches. Current git log/diff/status were inspected and captured as git-log.txt/git-diff.txt/git-status.txt. The tree still contains substantial uncommitted changes relative to HEAD; those were included, not ignored. Copying redundant historical ops/roadmap runtime artifacts was stopped after required source/test inputs were complete.

During this review another actor committed `97e89d6` (R3 acceptance tests and evidence, no product source changes). Its diff/stat and API/browser tests were inspected. Six new R3 code inputs were copied and pinned in r3-added-inputs.json before the full Codex browser suite started; captured-inputs.json now contains 452 inputs. The npm/TypeScript/build gates precede that test-only addition and remain applicable to unchanged product/TS inputs. Browser results below include the new R3 tests; they are not silently treated as implementation. A missing roster/PIN implementation remains roadmap debt.

files_reviewed: current log/diff and previous-review comparison; domain scoring/rational/DTO and validation boundaries; schema/assets; storage CAS/finalization/migration; student timer/lifecycle/assignment metadata; collector dispatch/receipts/config/export; report projection and actual app render/download; teacher/builder/bank ownership/versioning; API auth/store/assignment/results/Neon; DOCX ZIP/XML and PDF manual entrypoints; offline/build/config/routes. Fresh full gates exercise unchanged modules. This is a baseline-equivalent whole-product audit, not a claim to reread every unchanged line or exhaust all acceptance cases. Prior diagnostic scripts were inspected and rerun; their earlier results were not used as fresh evidence.

## Findings


### LC101-F01 — MAJOR — Concurrent outbox drains evade the durable send budget

- status: VERIFIED; LC100-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:424, :454-469, :491, :640; storage CAS boundary src/storage/index.ts:977.
- evidence: fresh probes.log shows six actual transport calls, durable state `sending`, retryCount=0, generation=8. Dispatch accepts an already-sending record and charges the retry only after a response/error.
- reproduction_steps: in the evidence directory run `node LC51-probes.mjs`; finalize synthetic hoa-repeating using MemoryTransactionAdapter, enqueue, launch six drains five milliseconds apart while transport promises remain unresolved, inspect outbox, then resolve sends with 503.
- expected: Shared §3 / WEB §7 bound sends to five across concurrent callers/recovery.
- actual/impact: six requests precede any consumed-budget increment; repeated callers or crashes before response can evade the limit. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a consumed attempt and sending lease before transport; reject/coalesce active leases and recover expired leases without resetting budget. Preserve tuple/hash/generation and terminal confirmation. A process-only mutex does not cover tabs.
- regression_test: two clients, unresolved/lost receipts and crash/reload/lease recovery; one active send, at most five dispatches, immutable final/hash, no late-response downgrade.

### LC101-F02 — MAJOR — Switching exams during HTML download crashes the export

- status: VERIFIED; LC100-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3104, :3177–3185, :3210–3216, :3282–3315.
- evidence: download-race.log/json reports `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, active title `New exam B`. intended-regressions.log fails its no-error assertion.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs`; submit A containing an internal image, defer the image fetch during download, load B through the hidden file input, then release A's fetch. Run `node --test lc67-regressions.test.mjs` after blocks-probe.mjs for the intended invariant.
- expected: WEB §§3/20 export A's complete immutable report or explicitly cancel with recoverable feedback.
- actual/impact: after await, exporter rereads mutable currentExam/order/responses/score. Loading B clears scoredResult and A's download rejects. Mixed-identity output is a source risk, not a separately observed file.
- minimal_fix: capture the complete immutable report data and filename before the first await; use only captured fields thereafter; expose asset/download errors.
- regression_test: defer A asset → open B → resolve; one A file retaining title/version/order/answers/score and no rejection; include cancellation, fetch failure and concurrent downloads.

### LC101-F03 — MAJOR — Math inside table cells silently disappears

- status: VERIFIED; LC100-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:415–428, :1689, :3094, :3282.
- evidence: lc83-independent.json records a valid cell containing text/image/math `x^2+83`; actual question text is only `NESTED-TEXT`. independent.log fails the scoped math assertion. The cell renderer handles text/image but omits math/nested-table branches. Fresh scoped HTML parsing (`nested-report-scoped.json`) yields only `NESTED-TEXT`, mathPreserved=false. The whole-file hasMath flag includes unrelated data and is not evidence of preservation.
- reproduction_steps: `node --test lc83-independent.test.mjs`; load its synthetic canonical exam in Chromium, inspect `.question-stem` and the downloaded report's question content.
- expected: Shared §6 / WEB §§4/8/20 preserve recursive Cell.blocks math, or show source with an unsupported-content warning.
- actual/impact: legitimate question content vanishes without warning, potentially making a question unsolvable. This synthetic case does not establish a defect in a particular real DOCX. The helper also serves review/download.
- minimal_fix: shared recursive safe Block rendering for top-level/cell text, math, images and nested tables; preserve/label unsupported OMML/source.
- regression_test: text/math/image/nested-table cells through exam → final → review → portable download, including unsupported expressions and escaped hostile content.

### LC101-F04 — MAJOR — Actual report lacks filters, navigation and retry-wrong

- status: VERIFIED; LC100-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535–573, :2992–3097; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: fresh browser-probe.log: `cards=2, filter=false, nav=false, retry=false`. The app builds its own report instead of mounting the isolated report controls. The full current Codex browser suite includes R4 acceptance tests; its fresh result is recorded below. Missing filters/navigation are checked on actual submitted reports, rather than isolated module exports.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs`; open local dist under /Cunata/, submit synthetic I+III, inspect the report DOM.
- expected: WEB §§24.1/24.5 expose all/wrong/blank filters with aria-pressed, question navigation and independent local retry practice with zero teacher submissions.
- actual/impact: approved roadmap features remain absent from the user entrypoint despite isolated module implementations/tests.
- minimal_fix: integrate report projection/actions/lifecycle; retry must use a fresh immutable practice snapshot/ID without assignment/collector linkage and retain the original final.
- regression_test: actual submit → filter → navigate, including hidden targets → retry wrong/blank/partial-II → refresh; original final unchanged, zero submitResult calls.

### LC101-F05 — MINOR — API stores assignments for nonexistent exams

- status: VERIFIED; LC100-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396–405.
- evidence: probes.log shows HTTP 200 / success=true and one assignment persisted for `does-not-exist` with an empty trusted catalog. Null getExam bypasses the only ownership check.
- reproduction_steps: `node LC51-probes.mjs`; seed active synthetic teacher/session/owned class in MemoryStore; assign unknown examId with valid openAt and dueAt=""; inspect saved assignments.
- expected: reject nonexistent/deleted exams before persistence while allowing authorized published/catalog exams.
- actual/impact: orphan assignment cannot load its exam for students. No cross-owner write was established.
- minimal_fix: require an allowed published record or trusted catalog membership; otherwise NOT_FOUND/INVALID_EXAM without writing. Preserve foreign-owner rejection/no-due handling.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog succeed, foreign owner FORBIDDEN, valid dueAt="" succeeds.

### LC101-F06 — MINOR — Public fraction parser rejects formatter output

- status: VERIFIED; LC100-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel API `toFractionString(rational(10n**200n))` produces a canonical 201-character integer, but parseFractionString throws SyntaxError.
- expected: M1 §4.1 strict inverse across the public rational domain.
- actual/impact: valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: preserve the inverse and bound hostile serialized input at its boundary; restricting the public rational domain requires a consistent contract change.
- regression_test: signed canonical integer/fraction roundtrips at 199/200/201 characters, zero, noncanonical rejection and both inverse directions.

## Red gate and retained behavior

Fresh `npm test`: **1,625 tests, 345 suites; 1,622 pass, 3 fail, 0 skipped/cancelled/todo; exit 1.** These failures are independent of the six product findings and block a green full gate:

- `test/collect/apiBase.test.ts:41` (send at :66): RECEIPT_INVALID, missing attempt_id. Its synthetic response also omits recorded_at.
- `test/collect/r0-f04-regression.test.ts:6` (send at :96): BAD_RESPONSE; fixture uses ok:true rather than success:true.
- `test/teacher/portal.test.ts:557` (assertion :608): "Teacher exam must have unpublish button". Fixture supplies neither owner nor current teacher username; `src/teacher/portal.ts:1689-1716` now makes a read-only ownership decision.

Minimal repair: reconcile receipt fixtures with the real service schema (success:true, matching attempt_id, recognized status, valid recorded_at) and teacher fixture/port ownership metadata. Preserve request/raw-answer/assignment assertions, malformed/mismatched receipt rejection, and ownership isolation. Do not weaken production receipt validation or probe ownership by publishing. These failures do not independently demonstrate a production authorization bypass.

Fresh Chromium probes retain read-only own-exam browsing (revision 1 to 1; zero publish requests during listing), saved B key through publish, portable nested images, and top-level canonical text/table in exam/review/download. They do not repair F02-F04. Scoped parsing of the downloaded nested question yields only NESTED-TEXT, mathPreserved=false; a whole-file hasMath=true flag includes unrelated data and must not count as preservation.

Fresh service-worker tests pass 3/3: VM RPC bypass/cache purge and a controlled browser reflecting title changes and NOT_FOUND after unpublish against a local API. They do not prove deployed-service acceptance or a full two-version, multi-tab cache migration. Product score/max differential passes all 1,632 total and section cases; the Python oracle passes separately.

## checks_run

Environment: Windows/PowerShell; Node v24.14.0; TypeScript 7.0.2; Python 3.11.0; installed Chromium via native CDP harness. All results below are fresh; logs and command arrays/exits/wall times are in the evidence directory and gate-results.json. A diagnostic exit 0 means the reproducer completed, not that the defective behavior passed acceptance.

| Command | Exit | Actual outcome | Evidence / wall seconds |
| --- | --- | --- | --- |
| `node scripts/build.js` | 0 | PASS: 339 emitted/promoted/verified files; existing DEP0190 warning. | build.log; 2.295 s |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS: no diagnostics. | tsc.log; 1.614 s |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS: no diagnostics. | tsc-web.log; 1.583 s |
| `npm test` | 1 | FAIL: tests=1625, suites=345, pass=1622, fail=3; no skipped/cancelled/todo. | npm.log; 31.264 s |
| `node LC51-probes.mjs` | 0 | Diagnostic: six sends with retryCount=0; orphan assignment saved; 201-character rational inverse rejects; six roster/PIN/history actions UNKNOWN_ACTION. | probes.log; 0.29 s |
| `node LC51-differential.mjs` | 0 | PASS: 1,632 product total/max and section score/max comparisons. | differential.log; 0.175 s |
| `python -B test/oracle/oracle.py --check` | 0 | PASS: 11 tests, 1,632 fixtures, 5,849 maxima configurations, 9 negative controls; independent oracle only. | oracle.log; 1.281 s |
| `node --test lc83-independent.test.mjs` | 1 | FAIL: tests=5, pass=3, fail=2, no skipped/cancelled/todo; nested-math child and its parent fail. | independent.log; 2.977 s |
| `node download-race.mjs` | 0 | Diagnostic: null totalFraction TypeError; zero downloads; active New exam B. | download-race.log; 3.359 s |
| `node blocks-probe.mjs` | 0 | PASS: top-level canonical text/table in exam/review/download. | blocks-probe.log; 2.083 s |
| `node --test lc67-regressions.test.mjs` | 1 | FAIL: tests=2, pass=1, fail=1, no skipped/cancelled/todo; report-download invariant fails. | intended-regressions.log; 0.116 s |
| `node LC51-browser-probe.mjs` | 0 | Diagnostic: cards=2, filter=false, nav=false, retry=false. | browser-probe.log; 1.677 s |
| `node --test --test-timeout=90000 test/app/r2-f01-service-worker.test.mjs` | 0 | PASS: tests=3, pass=3, fail=0, no skipped/cancelled/todo. | sw.log; 1.765 s |
| `node --test --test-concurrency=1 --test-timeout=240000 test/claude-check/**/*.test.mjs` | 0 | PASS: tests=104, suites=5, pass=104, fail=0, no skipped/cancelled/todo. | claude.log; 71.812 s |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` | 1 | FAIL: tests=264, suites=2, pass=223, fail=41, no skipped/cancelled/todo; R3=33 failures, R4=8 failures. | codex.log; 205.385 s |

Full Codex suite failure locations: 22 API and 11 browser failures in test/codex-check/feat/R3/{api,browser}.test.mjs (roster actions UNKNOWN_ACTION and missing roster/PIN UI); eight in test/codex-check/feat/R4/review.test.mjs:112, :125 (wrong/blank), :132, :142, :153, :168 (1280/390px). These confirm missing approved features, not 41 separate security findings. No ENOENT/output-directory failures occurred in this run. Both real-handle R3 preconditions pass, so the R3 red results are not attributed to a broken fixture login/class setup. No product-approval inference from passing preconditions.

NODE_OPTIONS preloads unchanged ops/blitz/promoted/_support/runtime.mjs (acknowledges CDP Browser.close after 100 ms) and teardown-http.mjs (closes lingering HTTP connections 1.5 seconds after Server.close). These affect teardown only; product behavior, assertions, expected values and skips were unchanged. GIT_DIR/GIT_WORK_TREE supply read-only original repository context. Local service simulators are not deployed Neon/Google integration evidence.

Fresh bounded secret scan: 136 code/data files under src/public/scripts/apps-script, zero matches for private-key markers, Google/GitHub token patterns or credentialed PostgreSQL URLs. Evidence: bounded-secret-scan.json. This is not a comprehensive credential/history/advisory/license audit.

## coverage_gaps

- M1: fresh npm suite, 1,632-case product differential and independent oracle. F06 persists; not every raw/status/order/DOM combination is exhausted.
- M2/M3: fresh Chromium flows and full gates. Exhaustive quota/private browsing, migration/quarantine/recovery, assignment/version/route races and multi-tab interleavings: NOT_RUN in this bounded review.
- M4/R1/R2: local auth/store/transport/build/publisher simulations only. Live Google CORS/redirect/write/readback, deployed Neon concurrency/deduplication and activation: NOT_RUN; no production configuration or live write authorization used. Client-key practice is not trusted-assessment certification.
- M5: synthetic importer tests and rich-content probes. Broad real multi-column/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus: NOT_RUN. F03 blocks rich-content acceptance. Approved manual PDF is not a missing automatic parser.
- M6: Chromium automated responsive/keyboard/component checks are not manual acceptance. Full visual review at 375/768/1440 light/dark, Firefox/WebKit, physical phones, OS Telex/VNI, screen reader, independent axe/Lighthouse and input-to-paint p95: NOT_RUN. No full WCAG/performance claim.
- Offline: fresh RPC bypass/update regression; full two-version cache migration across open attempts/tabs: NOT_RUN.
- Comprehensive dependency/advisory/license/history audit and owner milestone/production acceptance: NOT_RUN. No activation/deployment/old-service deletion authorized.

## Missing roadmap features - priority and dependencies

1. **P0 / R0 stabilization:** repair F01-F04; reconcile collector receipt and teacher ownership metadata fixtures/ports; restore green npm gate. Preserve ownership isolation, saved keys and portable images. F05/F06 are bounded debt.
2. **P1 / R3, WEB section 23, after R2:** roster CRUD/print, unique hashed four-digit PINs, server five-failure/ten-minute lockout, studentToken/student_id binding, cross-machine report reconstruction and unsubmitted roster rows. Fresh probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table and new acceptance tests do not implement these actions. R2 local approval does not certify live activation.
3. **P1 / R4, section 24.1, after R0:** integrate all/wrong/blank report filters with aria-pressed and question navigation into the actual app entrypoint (F04); isolated view controls are insufficient.
4. **P2 / R5 to R6, sections 24.2-24.3, after R3:** authorized per-student submissionDialog/btn-view-submission and examStats/stat-row; per-question accuracy, option distribution, common wrong short answers. Current source search finds no production UI paths.
5. **P2 / R7, section 24.4, after R3:** PIN-backed myHistory/historyChart and accessible text table; current production paths absent.
6. **P2 / R8, section 24.5, after R4+R7:** local wrong/blank/partial-II retry practice, immutable original final and zero teacher submissions (F04).
7. **P2 / R9, section 24.6, after R6:** teacher print with answer sheet and separate key; btn-teacher-print path absent.
8. **P2 / R10, section 24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists, btnTheme path absent.
9. **P3 / R11:** owner-authorized live activation, phone acceptance, recovery/import/privacy/performance matrix, version 1.0 and retirement decision. Outside LC101 authorization.

Custom-only presets and manual PDF remain approved choices. NEED_DECISION: NONE for these fixes and the approved local roadmap; no new grammar/service/storage policy selected. tools_research: NOT_REQUESTED. privacy_notes: synthetic local data only; no real student records, credentials or private instruction content in this report.

recommended_action: F01 -> src/collect; F02-F04 -> src/app; F05 -> src/api; F06 -> src/domain. Test owners reconcile receipt/ownership fixtures without weakening validation or reintroducing write probes. Product remains CHANGES_REQUESTED; report is READY_FOR_REVIEW.

Final integrity: final-snapshot.json confirms all 452 pinned inputs remain unchanged in the workspace. Final HEAD `97e89d699b473fdb557ea914992ef905af3d0cb1` includes only the test/evidence addition described above since the initial HEAD. src/app/main.ts SHA-256 `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. Generated artifacts are excluded from this source-integrity claim. Only docs/reviews/LOOP-101-codex.md was intentionally written in the workspace.
