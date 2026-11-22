# LC98 - Independent whole-product review

review_id/task_id/worker_id: LC98; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `66eb71d6b332f42db8702334800d0394bd0e3d71`; branch: main; pre-existing dirty working tree included.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24 (read in full); inherited M1; approved decisions; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Four MAJOR and two MINOR findings reproduced afresh; full npm gate remains red. NEED_DECISION: NONE for these repairs and approved local roadmap. READY_FOR_REVIEW describes this report handoff, not product approval.

## Snapshot, scope and method

Only intentional workspace write: `docs/reviews/LOOP-98-codex.md`. No product/test edits, install, dependency change, commit, branch/worktree creation or deployment. Existing changes preserved. Repository inventory found no AGENTS.md.

Evidence directory: `%USERPROFILE%/AppData/Local/Temp/LC98-ow2prbof`. Checks ran afresh in an ordinary temporary copy of current workspace inputs and installed node_modules. Build/test output stayed outside the workspace. No production configuration was copied; public/config.json retains the empty Apps Script setting. All service writes exercised synthetic local stores/simulators; publisher tests used temporary synthetic destinations.

`source-hashes.json`, `changes-since-LC97.json`, `git-status.txt`, `git-diff.txt` and `git-log.txt` record inputs and repository context. No new commit since LC97; all 1,460 previously inventoried paths initially matched byte for byte. Two new regression source files were captured: test/app/r2-f01-service-worker.test.mjs and test/collect/r2-f02-regression.test.ts. Additional documentation paths were inventoried, not claimed as newly authored product changes. During this review the service-worker test changed only its cleanup from t.after callbacks to finally (context, browser, server). Its original run timed out after two passing unit tests; the cleanup-only rewrite passed on rerun. The new file was read, recaptured and rerun: all three tests pass. Product source/build/config/dependency inputs did not change. Concurrent generated R2 audit artifacts are tracked separately, not treated as source drift.

files_reviewed: current git log/diff and input comparison to LC97; domain scoreAttempt/examMax/shortAnswer/rational and serialization boundaries; schema validation; storage CAS/finalization; collector config/dispatch/receipts/export; student controller/lifecycle; report projection/download and app rendering; teacher ownership/builder and bank; API auth/assignments/results/Neon; DOCX/ZIP/XML and PDF manual entrypoints; offline cache/build/config and routing. Fresh full gates exercise unchanged modules. This is a baseline-equivalent whole-product review with fresh checks, not a claim to reread every unchanged line or exhaustively certify acceptance. Existing diagnostic scripts were inspected, copied and rerun; prior results are not fresh evidence.

## Findings


### LC98-F01 — MAJOR — Concurrent outbox drains evade the durable send budget

- status: VERIFIED; LC97-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:424, :454-469, :491, :640; storage CAS boundary src/storage/index.ts:977.
- evidence: fresh probes.log shows six actual transport calls, durable state `sending`, retryCount=0, generation=8. Dispatch accepts an already-sending record and charges the retry only after a response/error.
- reproduction_steps: in the evidence directory run `node LC51-probes.mjs`; finalize synthetic hoa-repeating using MemoryTransactionAdapter, enqueue, launch six drains five milliseconds apart while transport promises remain unresolved, inspect outbox, then resolve sends with 503.
- expected: Shared §3 / WEB §7 bound sends to five across concurrent callers/recovery.
- actual/impact: six requests precede any consumed-budget increment; repeated callers or crashes before response can evade the limit. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a consumed attempt and sending lease before transport; reject/coalesce active leases and recover expired leases without resetting budget. Preserve tuple/hash/generation and terminal confirmation. A process-only mutex does not cover tabs.
- regression_test: two clients, unresolved/lost receipts and crash/reload/lease recovery; one active send, at most five dispatches, immutable final/hash, no late-response downgrade.

### LC98-F02 — MAJOR — Switching exams during HTML download crashes the export

- status: VERIFIED; LC97-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3104, :3177–3185, :3210–3216, :3282–3315.
- evidence: download-race.log/json reports `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, active title `New exam B`. intended-regressions.log fails its no-error assertion.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs`; submit A containing an internal image, defer the image fetch during download, load B through the hidden file input, then release A's fetch. Run `node --test lc67-regressions.test.mjs` after blocks-probe.mjs for the intended invariant.
- expected: WEB §§3/20 export A's complete immutable report or explicitly cancel with recoverable feedback.
- actual/impact: after await, exporter rereads mutable currentExam/order/responses/score. Loading B clears scoredResult and A's download rejects. Mixed-identity output is a source risk, not a separately observed file.
- minimal_fix: capture the complete immutable report data and filename before the first await; use only captured fields thereafter; expose asset/download errors.
- regression_test: defer A asset → open B → resolve; one A file retaining title/version/order/answers/score and no rejection; include cancellation, fetch failure and concurrent downloads.

### LC98-F03 — MAJOR — Math inside table cells silently disappears

- status: VERIFIED; LC97-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:415–428, :1689, :3094, :3282.
- evidence: lc83-independent.json records a valid cell containing text/image/math `x^2+83`; actual question text is only `NESTED-TEXT`. independent.log fails the scoped math assertion. The cell renderer handles text/image but omits math/nested-table branches. Fresh scoped HTML parsing (`nested-report-scoped.json`) yields only `NESTED-TEXT`, mathPreserved=false. The whole-file hasMath flag includes unrelated data and is not evidence of preservation.
- reproduction_steps: `node --test lc83-independent.test.mjs`; load its synthetic canonical exam in Chromium, inspect `.question-stem` and the downloaded report's question content.
- expected: Shared §6 / WEB §§4/8/20 preserve recursive Cell.blocks math, or show source with an unsupported-content warning.
- actual/impact: legitimate question content vanishes without warning, potentially making a question unsolvable. This synthetic case does not establish a defect in a particular real DOCX. The helper also serves review/download.
- minimal_fix: shared recursive safe Block rendering for top-level/cell text, math, images and nested tables; preserve/label unsupported OMML/source.
- regression_test: text/math/image/nested-table cells through exam → final → review → portable download, including unsupported expressions and escaped hostile content.

### LC98-F04 — MAJOR — Actual report lacks filters, navigation and retry-wrong

- status: VERIFIED; LC97-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535–573, :2992–3097; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: fresh browser-probe.log: `cards=2, filter=false, nav=false, retry=false`. The app builds its own report instead of mounting the isolated report controls. The full current Codex browser suite includes R4 acceptance tests; its fresh result is recorded below. Missing filters/navigation are checked on actual submitted reports, rather than isolated module exports.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs`; open local dist under /Cunata/, submit synthetic I+III, inspect the report DOM.
- expected: WEB §§24.1/24.5 expose all/wrong/blank filters with aria-pressed, question navigation and independent local retry practice with zero teacher submissions.
- actual/impact: approved roadmap features remain absent from the user entrypoint despite isolated module implementations/tests.
- minimal_fix: integrate report projection/actions/lifecycle; retry must use a fresh immutable practice snapshot/ID without assignment/collector linkage and retain the original final.
- regression_test: actual submit → filter → navigate, including hidden targets → retry wrong/blank/partial-II → refresh; original final unchanged, zero submitResult calls.

### LC98-F05 — MINOR — API stores assignments for nonexistent exams

- status: VERIFIED; LC97-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396–405.
- evidence: probes.log shows HTTP 200 / success=true and one assignment persisted for `does-not-exist` with an empty trusted catalog. Null getExam bypasses the only ownership check.
- reproduction_steps: `node LC51-probes.mjs`; seed active synthetic teacher/session/owned class in MemoryStore; assign unknown examId with valid openAt and dueAt=""; inspect saved assignments.
- expected: reject nonexistent/deleted exams before persistence while allowing authorized published/catalog exams.
- actual/impact: orphan assignment cannot load its exam for students. No cross-owner write was established.
- minimal_fix: require an allowed published record or trusted catalog membership; otherwise NOT_FOUND/INVALID_EXAM without writing. Preserve foreign-owner rejection/no-due handling.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog succeed, foreign owner FORBIDDEN, valid dueAt="" succeeds.

### LC98-F06 — MINOR — Public fraction parser rejects formatter output

- status: VERIFIED; LC97-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel API `toFractionString(rational(10n**200n))` produces a canonical 201-character integer, but parseFractionString throws SyntaxError.
- expected: M1 §4.1 strict inverse across the public rational domain.
- actual/impact: valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: preserve the inverse and bound hostile serialized input at its boundary; restricting the public rational domain requires a consistent contract change.
- regression_test: signed canonical integer/fraction roundtrips at 199/200/201 characters, zero, noncanonical rejection and both inverse directions.

## Red gate and retained behavior

Fresh `npm test`: 1,625 tests, 345 suites, 1,622 pass, 3 fail, 0 skipped/cancelled/todo. Eight new collector regression tests pass; they do not repair the concurrent-send budget defect.

- test/teacher/portal.test.ts:557, assertion :608: `Teacher exam must have unpublish button`. Fixture supplies neither owner nor current teacher username; src/teacher/portal.ts:1689-1716 applies read-only ownership checks. Reconcile fixture/port ownership metadata while preserving assertions; avoid publication as an access probe. This failure does not establish a production authorization bypass.
- test/collect/apiBase.test.ts:41, send :66: `RECEIPT_INVALID`; fixture response lacks attempt_id and recorded_at.
- test/collect/r0-f04-regression.test.ts:6, send :96: `BAD_RESPONSE`; fixture uses ok:true without success:true.

Retain collector request/metadata assertions and supply a valid synthetic service receipt (success:true, matching attempt_id, recognized status and valid recorded_at); retain malformed/mismatched response rejection tests. Do not weaken production validation to satisfy fixtures. Full npm is a mandatory red gate independent of the browser passes.

Fresh Chromium probes retain own-exam browsing without writes/revision changes, saved B keys through publication, portable nested images, and top-level canonical text/table through exam/review/download. These passes do not repair F02-F04. The independent product differential matches 1,632 total/max and section score/max cases; Python oracle passes separately. Updated service-worker regression verifies RPC bypass, old/current cache purge in VM, and a real controlled browser seeing changed title and NOT_FOUND after unpublish against the local API. It does not establish live-service or full two-version browser cache migration acceptance.

## checks_run

Environment: Windows/PowerShell; Node v24.14.0; TypeScript 7.0.2; Python 3.11.0; installed Chromium via native CDP harness. All checks below ran afresh in the evidence directory.

| Command | Exit | Actual outcome | Evidence / wall seconds |
| --- | --- | --- | --- |
| `node scripts/build.js` | 0 | PASS: 339 emitted/promoted/verified files; existing DEP0190 warning. | build.log; 2.103 s |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS: no diagnostics. | tsc.log; 1.504 s |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS: no diagnostics. | tsc-web.log; 1.503 s |
| `npm test` | 1 | FAIL: tests=1625, suites=345, pass=1622, fail=3, cancelled=0, skipped=0, todo=0 | npm.log; 32.235 s |
| `node LC51-probes.mjs` | 0 | Diagnostic reproduction: six sends/retryCount=0; orphan assignment persisted; 201-character inverse rejected; six roster/PIN/history actions UNKNOWN_ACTION. Exit 0 means reproduction succeeded, not product PASS. | probes.log; 0.263 s |
| `node LC51-differential.mjs` | 0 | PASS: 1,632 product cases; total/max plus every section score/max. | differential.log; 0.169 s |
| `python -B test/oracle/oracle.py --check` | 0 | PASS: 11 tests, 1,632 fixtures, 5,849 maxima configurations, 9 negative controls. Independent oracle only. | oracle.log; 1.24 s |
| `node --test lc83-independent.test.mjs` | 1 | FAIL: tests=5, suites=0, pass=3, fail=2, cancelled=0, skipped=0, todo=0 | independent.log; 2.649 s |
| `node download-race.mjs` | 0 | Diagnostic: null totalFraction TypeError, zero downloads, active New exam B. | download-race.log; 3.405 s |
| `node blocks-probe.mjs` | 0 | PASS: canonical top-level text/table through exam, review, download. | blocks-probe.log; 2.465 s |
| `node --test lc67-regressions.test.mjs` | 1 | FAIL: tests=2, suites=0, pass=1, fail=1, cancelled=0, skipped=0, todo=0 | intended-regressions.log; 0.17 s |
| `node LC51-browser-probe.mjs` | 0 | Diagnostic: cards=2; filter=false, nav=false, retry=false. | browser-probe.log; 1.997 s |
| `node --test --test-concurrency=1 --test-timeout=240000 test/claude-check/**/*.test.mjs` | 0 | PASS: tests=104, suites=5, pass=104, fail=0, cancelled=0, skipped=0, todo=0 | claude.log; 129.062 s |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` | 1 | FAIL: tests=229, suites=2, pass=221, fail=8, cancelled=0, skipped=0, todo=0 | codex.log; 151.684 s |
| `node --test --test-timeout=90000 test/app/r2-f01-service-worker.test.mjs` (initial cleanup) | 1 | tests=3, pass=2, fail=1; integration timed out; cleanup-only rewrite passed on rerun. Superseded by recaptured test below. | sw-regression.log; 96.954 s |
| Same command (recaptured finally cleanup) | 0 | PASS: tests=3, pass=3, fail=0, cancelled=0, skipped=0, todo=0. | sw-updated.log; 2.427 s |

Full Codex browser suite: eight failures at test/codex-check/feat/R4/review.test.mjs:112, :125 (wrong/blank), :132, :142, :153, :168 (1280/390px). They verify the missing controls/navigation in F04. Full Claude browser suite passes 104/104 on the same product snapshot.

NODE_OPTIONS preloads unchanged ops/blitz/promoted/_support/runtime.mjs (acknowledges CDP Browser.close after 100 ms) and teardown-http.mjs (closes outstanding HTTP connections 1.5 seconds after Server.close). These accommodate teardown only; assertions/expected values/skips/product responses are unchanged. GIT_DIR/GIT_WORK_TREE provide read-only original repository context. Local simulations do not prove deployed Neon/Apps Script acceptance.

Fresh bounded secret scan: 144 text/code files under src/public/scripts/apps-script, zero matching private-key markers, Google/GitHub token patterns or credentialed PostgreSQL URLs; bounded-secret-scan.json. This is not a comprehensive/history/advisory/license audit.

## coverage_gaps

- M1: fresh full suite, 1,632-case product differential and independent oracle; F06 persists. Not every raw/status/order/DOM combination is exhausted.
- M2/M3: fresh Chromium flows and full gates. Exhaustive private/quota/migration/recovery and assignment/version/route/ownership interleavings: NOT_RUN in this bounded review.
- M4/R1/R2: local auth/store/transport/build/publisher checks only. Live Google/CORS/write/readback, deployed Neon concurrency/deduplication/activation: NOT_RUN; no production configuration or live write authorization used. Client-key practice is not trusted-assessment certification.
- M5: synthetic importer tests and rich-content checks only. Broad real multi-column/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus: NOT_RUN. Approved manual PDF is not a missing automatic parser. F03 prevents rich-content acceptance.
- M6: automated Chromium responsive/keyboard/component checks do not equal manual acceptance. Full visual review at 375/768/1440 light/dark, Firefox/WebKit, physical phone, OS Telex/VNI, screen reader, independent axe/Lighthouse and input-to-paint p95: NOT_RUN. No full WCAG/performance claim.
- Service-worker regression now covers VM cache purge and a controlled browser's local RPC updates. Full two-version cache migration across open attempts/tabs: NOT_RUN.
- Comprehensive dependency/advisory/license/history audit and owner milestone/production acceptance: NOT_RUN. No activation/deploy/old-service deletion authorized.

## Missing roadmap features — priority and dependencies

1. **P0 / R0:** repair F01–F04 and reconcile the teacher metadata and collector receipt fixtures/ports; restore a green full npm gate. Preserve ownership/key edits/portable images. F05/F06 remain bounded debt.
2. **P1 / R2→R3, §23:** complete local new-service acceptance, then roster CRUD/print, unique hashed four-digit PINs, five-failure/ten-minute server lockout, studentToken/student_id binding, cross-machine reconstruction and unsubmitted roster rows. All six fresh addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults probes return UNKNOWN_ACTION. A students table alone does not implement these actions.
3. **P1 / R4, §24.1, after R0:** integrate report filters/navigation into the actual entrypoint (F04); isolated view tests do not satisfy this.
4. **P2 / R5→R6, §§24.2–24.3, after R3:** authorized per-student submissionDialog/btn-view-submission and examStats/stat-row, per-question accuracy, option distribution and common wrong short answers. Production UI paths absent in current source search.
5. **P2 / R7, §24.4, after R3:** PIN-backed myHistory/historyChart with accessible text table; production paths absent.
6. **P2 / R8, §24.5, after R4+R7:** local wrong/blank/partial-II practice with zero teacher submissions and immutable original final (F04).
7. **P2 / R9, §24.6, after R6:** teacher print, answer sheet and separate answer key; btn-teacher-print path absent.
8. **P2 / R10, §24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists, btnTheme path absent.
9. **P3 / R11:** owner-authorized live activation and phone acceptance, recovery/import/privacy/performance matrix, version 1.0 and retirement decision. Not authorized in LC98.

Custom-only presets and manual PDF remain approved choices. NEED_DECISION: NONE for these fixes and the approved local roadmap. No new scoring grammar, service, or storage policy was selected. tools_research: NOT_REQUESTED. privacy_notes: synthetic local data only; no real student records, credentials or private instruction content in this report.

recommended_action: F01→src/collect; F02–F04→src/app; F05→src/api; F06→src/domain. Teacher/collector test owners reconcile metadata and receipt fixtures while preserving read-only listing and receipt validation. Product verdict remains CHANGES_REQUESTED; report handoff READY_FOR_REVIEW.


Final integrity: final-snapshot.json records 1635 captured inputs. Product, test source, build, config and dependency inputs have no workspace drift after recapturing the service-worker cleanup change. Concurrent generated R2 artifact changes are listed separately. HEAD remained `66eb71d6b332f42db8702334800d0394bd0e3d71`; src/app/main.ts SHA-256 `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. Verdict applies to this source snapshot. Only docs/reviews/LOOP-98-codex.md was intentionally written in the workspace.
