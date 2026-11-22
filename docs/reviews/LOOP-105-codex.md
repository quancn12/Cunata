# LC105 - Independent whole-product review

review_id/task_id/worker_id: LC105; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `97e89d699b473fdb557ea914992ef905af3d0cb1`; branch: main; includes the dirty working tree.
requirements_version: Shared Product Contract v2.0 (precedence), WEB-contract.md sections 1-24 read in full, inherited M1 scoring contract, approved decisions, DESIGN.md and LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Six product findings persist (four MAJOR, two MINOR), plus a MAJOR required-gate failure (F07). Handoff: READY_FOR_REVIEW; this is not product or milestone approval. NEED_DECISION: NONE for these repairs or the approved local roadmap.

## Snapshot and method

Only intentional workspace write: `docs/reviews/LOOP-105-codex.md`. No product/test source changes, install, dependencies, commit, branch/worktree creation or deployment. Existing changes preserved. No AGENTS.md found in the project search or project root.

Fresh execution evidence: `%USERPROFILE%/AppData/Local/Temp/LC105-checked-ejg6m3_h/`. Build and tests ran against current working-tree inputs in an ordinary temporary copy, with a physical copy of the already-installed node_modules (no installation). This prevents generated files from modifying out-of-scope workspace paths. Only synthetic local data/services used; production configuration was not copied or used. All results below are freshly executed, not inherited PASS claims.

Git status/log/diff captured in git-status.txt, git-log.txt, git-diff.txt. HEAD has not changed since LC104. All 357 captured product/build/public inputs from LC104 match current bytes (changes-since-LC104.json). Of 743 shared inventory entries, ten R3 generated failure JSON/PNG artifacts differ; no executable input differs. A new 766-file execution inventory (including eight temporary reproduction/teardown scripts) is in inputs.json, including current tests and fixtures. The comparison does not certify unlisted files. The pre-existing source diff against HEAD remains relevant, so HEAD alone was not used as the review boundary. Package and lockfile match LC104.

files_reviewed: current git diff and focused source/caller paths across scoring/rational/serialization, schema/assets, storage finalization/outbox CAS, student snapshot/timer/assignment metadata, collector transport/receipt/export, report projection and actual app rendering/download, teacher ownership/builder keys/bank versioning, API auth/assignments/results and Memory/Neon persistence, DOCX/PDF preview, UI/offline/build/publisher. Existing wider behavior is exercised by the current suites. Risk-based independent review; not a fresh line-by-line read of every unchanged file or exhaustive acceptance. Existing reproduction scripts were read and rerun against this snapshot.

## Findings

### LC105-F01 — MAJOR — Concurrent outbox drains evade the durable retry budget

- status: VERIFIED; LC104-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:424`, `:454–469`, `:491`, `:640`; CAS boundary `src/storage/index.ts:977`.
- evidence: fresh probes.log records six transport calls with outbox state `sending`, `retryCount=0`, `generation=8`. An existing sending state is accepted, and retry consumption is recorded only after a response/error.
- reproduction_steps: in the evidence directory, `node LC51-probes.mjs`; finalize synthetic hoa-repeating with MemoryTransactionAdapter, enqueue, call drainOutbox six times five milliseconds apart with unresolved transport promises, inspect durable outbox, then resolve all with HTTP 503.
- expected: Shared §3 / WEB §7 require bounded durable retries, including concurrent callers and recovery.
- actual/impact: more than the allowed five requests start without consuming the durable send budget. Repeated callers/crashes before responses evade the bound. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a send attempt and active lease before transport; refuse/coalesce an active lease and recover expired leases without resetting budget. Preserve tuple/hash/generation pinning and terminal confirmation; a process-only mutex does not protect separate tabs.
- regression_test: concurrent clients with unresolved/lost receipts and crash/reload/expired-lease recovery; one active dispatch, at most five actual sends per budget, no final/hash mutation or late status downgrade.

### LC105-F02 — MAJOR — Opening another exam during HTML export crashes the download

- status: VERIFIED; LC104-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:3104`, `:3177–3185`, `:3210–3216`, `:3282–3315`.
- evidence: fresh download-race.json/log contains `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, and active title `New exam B`. intended-regressions.log fails the no-error invariant.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs`; submit A with an internal image, defer its fetch during export, load B through the retained hidden file input, then release A's image fetch. Run `node --test lc67-regressions.test.mjs` after blocks-probe.mjs to evaluate the captured invariants.
- expected: Shared §2 / WEB §§3,20: export A's complete immutable report or explicitly cancel with recoverable feedback.
- actual/impact: the asynchronous handler reads mutable currentExam/order/responses/scoredResult after awaiting. Opening B clears A's score and causes an unhandled export rejection. Mixed-identity output remains a source risk; no mixed downloaded file was observed.
- minimal_fix: capture the entire immutable report, asset inputs and filename before the first await; use captured data exclusively afterward and surface export/asset failures.
- regression_test: defer A's asset, open B, release asset: produce one complete A report retaining title/version/order/answers/score, or explicit cancellation. Also cover missing assets and concurrent exports.

### LC105-F03 — MAJOR — Table-cell math disappears without a warning

- status: VERIFIED; LC104-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:415–428`, `:1689`, `:3094`, `:3282`.
- evidence: fresh lc83-independent.json records a canonical table cell containing text/image/math source `x^2+83`; actual question-stem text is only `NESTED-TEXT`. The nested-math assertion fails. Downloaded nested-report.html, scoped to question content in nested-report-scoped.json, also has `mathPreserved=false`. Cell rendering handles text/image and silently skips math/nested tables.
- reproduction_steps: `node --test lc83-independent.test.mjs`; load the valid synthetic exam in Chromium, inspect the cell, submit, download, and inspect `.review-question-card .review-q-content` in that HTML. Whole-file `hasMath=true` from an unrelated substring is not proof of math preservation.
- expected: Shared §6 / WEB §§4,8,20 preserve recursive Cell.blocks content, or retain labeled unsupported math source with a warning.
- actual/impact: legitimate question content vanishes and may prevent solving a question. The same helper serves exam/review/download. This synthetic reproduction does not establish corruption in a specific real DOCX.
- minimal_fix: use a shared recursive safe Block renderer for text/math/image/table at every depth, preserving and labeling unsupported OMML/source.
- regression_test: mixed cell contents through exam → final → review → portable HTML; include nested tables, unsupported math and hostile escaped text.

### LC105-F04 — MAJOR — The actual result page omits review filters, navigation and retry-wrong

- status: VERIFIED; LC104-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:535–573`, `:2992–3097`; isolated controls in `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: fresh browser-probe.log: `cards=2, filter=false, nav=false, retry=false`. App constructs its own report instead of mounting the report module's controls. Source search finds these IDs only in the isolated report view.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs`; under local `/Cunata/`, submit synthetic I+III and inspect `#reviewFilter`, `#reviewNav`, `#btnRetryWrong` on the actual result page. R4 acceptance tests inspect this submitted page at desktop/mobile widths.
- expected: WEB §§24.1,24.5 require all/wrong/blank filters with aria-pressed, question navigation and independent local retry practice without teacher submission.
- actual/impact: approved controls are unreachable despite isolated implementation and tests. Filters/navigation are R4 debt; full retry also depends on R7 in the roadmap.
- minimal_fix: integrate report projection/actions/lifecycle. Retry must create a fresh practice ID/snapshot, clear assignment/collector linkage and preserve the original immutable final.
- regression_test: actual submit → filter → navigation including hidden targets → retry wrong/blank/partial-II → refresh; original final unchanged and zero submitResult calls for practice.

### LC105-F05 — MINOR — API creates an assignment for a nonexistent exam

- status: VERIFIED; LC104-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396–405`.
- evidence: fresh probes.log: HTTP 200 / success=true and one persisted assignment for `does-not-exist` with an empty trusted catalog. A null getExam result bypasses the ownership condition.
- reproduction_steps: `node LC51-probes.mjs`; seed an active synthetic teacher/session/owned class in MemoryStore; assign an unknown exam ID with valid openAt and `dueAt:""`; inspect assignments.
- expected: reject nonexistent/deleted exams before persistence; allow authorized published or trusted catalog exams.
- actual/impact: orphan assignment is accepted although students cannot load its exam. No cross-owner write was demonstrated.
- minimal_fix: require an allowed published exam or trusted catalog membership, otherwise NOT_FOUND/INVALID_EXAM with no write; retain foreign-owner rejection and no-due semantics.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog pass, foreign-owner fails FORBIDDEN, valid `dueAt:""` remains supported.

### LC105-F06 — MINOR — Public fraction parser rejects its formatter's output

- status: VERIFIED; LC104-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel API `toFractionString(rational(10n**200n))` returns a canonical 201-character integer; `parseFractionString` throws SyntaxError.
- expected: M1 §4.1 specifies a strict inverse for the public formatter/parser.
- actual/impact: valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: reconcile the public inverse guarantee with parser resource limits; separate bounded untrusted DTO parsing from unrestricted rational conversion.
- regression_test: signed integer/fraction roundtrips across length boundaries, oversized untrusted DTO rejection and existing scoring cases.

### LC105-F07 - MAJOR - Required npm gate remains red

status: VERIFIED. Fresh `npm.cmd test`: **1,625 tests, 345 suites; pass=1,622, fail=3; exit 1.** No skipped/cancelled/todo tests. Each failure independently keeps the required gate red:

- `test/collect/apiBase.test.ts:41` / send at `:66`: RECEIPT_INVALID; fixture omits attempt_id and recorded_at.
- `test/collect/r0-f04-regression.test.ts:6` / send at `:96`: BAD_RESPONSE; fixture returns ok:true rather than success:true.
- `test/teacher/portal.test.ts:557` / assertion at `:608`: missing unpublish button; fixture omits owner/current teacher identity while `src/teacher/portal.ts:1689–1716` now filters ownership without write probes.

**VÙNG chịu trách nhiệm: glue**, consulting src/collect and src/teacher. Minimal repair: reconcile receipt fixtures and owner/port metadata with the real contract. Preserve malformed/mismatched receipt rejection, raw answers, assignment isolation and authorization assertions. Do not weaken production receipt validation or restore publish-based ownership probing. Regression: these three tests, then full npm and relevant browser checks. These fixture failures alone do not prove a production authorization bypass.

## checks_run

Environment: Windows/PowerShell; Node v24.14.0; installed TypeScript 7.0.2; Python 3.11.0; local Chromium controlled by the existing native CDP harness. All paths below are relative to the evidence directory. `npm.cmd`/`npx.cmd` are the Windows executables for the requested npm/npx commands. Diagnostic exit 0 means the reproduction completed; it does not mean product acceptance. Final listed test-runner checks have zero skipped/cancelled/todo.

| Command | Exit | Fresh outcome | Log / seconds |
| --- | --- | --- | --- |
| `node scripts/build.js` | 0 | PASS; 339 emitted/promoted/verified files; existing DEP0190 warning | build.log / 1.969 |
| `npm.cmd test` | 1 | FAIL; 1,625 tests, 345 suites; 1,622 pass, 3 fail | npm.log / 29.781 |
| `npx.cmd --no-install tsc -p tsconfig.json` | 0 | PASS; no diagnostics | tsc.log / 7.203 |
| `npx.cmd --no-install tsc -p tsconfig.web.json` | 0 | PASS; no diagnostics | tsc-web.log / 7.125 |
| `python -B test/oracle/oracle.py --check` | 0 | PASS; 11 tests; 1,632 fixtures, 5,849 maxima configurations, 9 negative controls; independent oracle only | oracle.log / 2.25 |
| `node LC51-probes.mjs` | 0 | Diagnostic; six sends with retryCount=0; orphan assignment accepted; rational inverse rejected; six roster/PIN UNKNOWN_ACTION results | probes.log / 0.234 |
| `node LC51-differential.mjs` | 0 | PASS; 1,632 product total/max and section score/max comparisons against independent expected fixtures | differential.log / 0.141 |
| `node --test lc83-independent.test.mjs` | 1 | FAIL; 5 tests, 3 pass, 2 fail (nested math assertion and parent) | independent.log / 2.594 |
| `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs` | 0 | Diagnostic; null totalFraction TypeError; zero downloads; B active | download-race.log / 3.297 |
| `node --import ./ops/blitz/promoted/_support/runtime.mjs blocks-probe.mjs` | 0 | PASS diagnostic; top-level canonical text/table retained in exam/review/download | blocks.log / 2.031 |
| `node --test lc67-regressions.test.mjs` | 1 | FAIL; 2 tests, 1 pass, 1 fail (download invariant) | intended-regressions.log / 0.094 |
| `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs` | 0 | Diagnostic; two cards; missing filter/nav/retry | browser-probe.log / 1.687 |
| `node --test --test-timeout=90000 test/app/r2-f01-service-worker.test.mjs` | 0 | PASS; 3 tests; local browser RPC cache exclusion and updates | sw.log / 1.969 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/claude-check/**/*.test.mjs` | 0 | PASS; 104 tests, 5 suites | claude.log / 68.234 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` | 1 | FAIL; 264 tests, 2 suites; 223 pass, 41 fail | codex-final.log / 202.204 |

The final 41 Codex failures are all approved contract-feature outcomes: 22 in feat/R3/api.test.mjs (missing roster/PIN actions), 11 in feat/R3/browser.test.mjs (missing roster/PIN UI), eight in feat/R4/review.test.mjs (missing report filters/navigation). Real-handle R3 preconditions pass. R1/R2 local API/build/publisher and existing CX cases pass in the final full run. These are missing-feature outcomes, not 41 distinct demonstrated security vulnerabilities. See codex-final.log and acceptance-summary.json.

Execution corrections, retained for audit: the first full Codex trial (codex.log) returned exit 1, 265 tests, 200 pass/65 fail. It included missing diagnostic-output directories, relative inherited preload paths failing inside nested build fixtures, and Windows copying of the dependency junction. CX rerun after directory preparation passed 13/13 (cx-rerun.log, exit 0, 18.546s). The R1/R2 retry with absolute preloads passed 22/26 but retained four dependency-junction copy failures (r1-r2-rerun.log, exit 1, 14.469s). Replacing that junction with a physical copy of the already-installed dependencies and retaining absolute file-URL preloads produced the final complete run above. No product assertion, timeout, skip list or source file was changed. Earlier setup failures are not reported as product findings or hidden as PASS.

Browser preloads are unchanged ops/blitz/promoted/_support/runtime.mjs (bounded Browser.close acknowledgement) and teardown-http.mjs (close lingering HTTP connections 1.5 seconds after server close). They affect teardown only. Absolute preload URIs are recorded here because child builds change cwd. GIT_DIR/GIT_WORK_TREE supply original repository context for read-only provenance checks. Logs/screenshots remain in the temporary copy; no real endpoint was used.

Fresh independent probes also confirm opening an owned exam keeps revision 1 -> 1 with zero publish requests, a saved B answer key survives publishing, nested images are portable, and top-level canonical text/table renders. These positive cases do not repair F02-F04. Scoped downloaded question content is only NESTED-TEXT, with mathPreserved=false (nested-report-scoped.json). Service-worker checks exercise local RPC bypass/cache purge and update/unpublish behavior, not deployed-service acceptance.

Bounded secret-pattern scan: 144 code/data files under src/public/scripts/apps-script; zero private-key marker, Google/GitHub token-pattern or credentialed PostgreSQL URL matches (bounded-secret-scan.json). No complete history/dependency/license audit is claimed.

## coverage_gaps

- M1: fresh unit suite, product-versus-independent expected comparisons and independent oracle; F06 remains. Exhaustive raw/status/order/DOM combinations were not reverified.
- M2/M3: fresh unit/local browser checks. Exhaustive quota/private browsing, migration/quarantine/recovery, clock shifts, route/assignment races and real multi-tab interleavings NOT_RUN in this audit; data-integrity risk remains outside exercised cases.
- M4/R1/R2: local handle/store/transport/publisher simulations. Live Google CORS/redirect/write/readback and deployed Neon concurrency/deduplication NOT_RUN: no live configuration or write authorization used. Client-side keys/scores are suitable for practice; trusted-assessment security is not certified.
- M5: synthetic importer coverage and rich-content probes, including F03. Broad real multi-column/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus NOT_RUN; no comprehensive import-fidelity claim. Approved manual PDF is not missing automatic parsing.
- M6: browser responsive/keyboard checks and component light/dark checks do not replace full manual product acceptance at 375/768/1440px. Physical phones, Firefox/WebKit, OS Telex/VNI, screen reader, independent axe/Lighthouse and input-to-paint p95 NOT_RUN; no full WCAG/performance certification.
- Offline: local RPC bypass/cache purge and acceptance coverage; complete two-version cache migration across active attempts/tabs NOT_RUN.
- Comprehensive dependency advisory/license/history audit and owner milestone/production acceptance NOT_RUN. Deployment, live activation and old-service retirement are outside LC105.

## Missing roadmap features — priority order

1. **P0 / R0 stabilization:** fix F01–F04 and reconcile the three npm fixtures with actual receipts/ownership while preserving isolation, saved keys and portable images. F05/F06 remain additional bounded debt.
2. **P1 / R3 / §23, after R2:** roster CRUD/print, unique hashed four-digit PINs, five-failure/ten-minute server lockout, studentToken/student_id binding, cross-machine report reconstruction and unsubmitted roster rows. Fresh real-handle probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table and tests do not implement those flows.
3. **P1 / R4 / §24.1, after R0:** mount all/wrong/blank filters, aria-pressed and question navigation in the actual result page (F04); isolated report controls are insufficient.
4. **P2 / R5–R6 / §§24.2–24.3, after R3:** authorized per-student btn-view-submission/submissionDialog and examStats/stat-row with question accuracy, option distributions and top three wrong short answers. No production UI paths found by source search.
5. **P2 / R7 / §24.4, after R3:** PIN-backed myHistory/historyChart and accessible table; production paths absent.
6. **P2 / R8 / §24.5, after R4+R7:** independent wrong/blank/partial-II practice; original final immutable, zero teacher submissions. Button remains isolated in report/view (F04).
7. **P2 / R9 / §24.6, after R6:** teacher print with answer sheet and separate answer key; btn-teacher-print production path absent.
8. **P2 / R10 / §24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists but btnTheme production path is absent.
9. **P3 / R11:** owner-authorized live activation, phone acceptance, recovery/import/privacy/performance matrix, version 1.0 and service-retirement decision. Outside this task's authorization.

Custom-only presets and manual PDF remain approved choices. No new grammar, rounding, storage or service policy selected. NEED_DECISION: NONE for local repairs and approved roadmap; R11 still requires explicit owner acceptance/authorization when reached.

tools_research: NOT_REQUESTED. privacy_notes: synthetic local data only; no real student records, credentials or private instruction content in this report.

recommended_action: F01 → src/collect; F02–F04 → src/app; F05 → src/api; F06 → src/domain. Glue reconciles failing fixtures with module owners without weakening receipts or ownership. Keep product CHANGES_REQUESTED; F07 -> glue with collect/teacher owners. Report READY_FOR_REVIEW.

Final integrity: final-snapshot.json records HEAD `97e89d699b473fdb557ea914992ef905af3d0cb1`, 580 current workspace product/build/test/script inputs, zero changed inputs and zero temporary-copy mismatches after checks. Eight temporary reproduction/teardown scripts are separately inventoried, not counted as workspace inputs. `src/app/main.ts` SHA-256: `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. Source changes after this snapshot invalidate affected evidence. Only this review document was intentionally written in the workspace.
