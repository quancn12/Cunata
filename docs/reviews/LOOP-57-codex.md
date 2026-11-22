# LC57 — Independent whole-product audit

review_id/task_id: LC57; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69` (main plus existing working-tree changes).
requirements_version: Shared Product Contract v2.0; WEB-contract.md §§1–24, including settled decisions; inherited M1 API contract; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Four verified open findings: two MAJOR, two MINOR. This is not release approval.
recommended_action: fix the responsible regions, add the specified regressions, and review a stable snapshot. No new business decision is needed for these fixes or already-specified roadmap features.

## Snapshot and scope

Read the task, private runtime profile and required product/technical contracts in full, inherited M1 signatures and design requirements, and LC56 review. Inspected git status/log and HEAD-to-working-tree diff. HEAD has not advanced since LC56. Byte-compared **550 runtime/build/public/style/test files**, plus root index/package/lock/three tsconfig files, against LC56's execution copy: **zero delta**. Existing dirty and untracked work was preserved.

Execution snapshot: `%USERPROFILE%/AppData/Local/Temp/LC57-4smqrtib`. Copied installed node_modules and current runtime/tests/build inputs, existing browser support and publishing-script test input. No install, branch or worktree. Tests and build write only in this temporary tree. `source-hashes.json` and `git-status-before.txt` capture the initial source/status. LC51-named probes were inspected, copied from LC56 and executed anew; filenames are not inherited execution evidence.

files_reviewed: working-tree changes in `src/api/{handle,types,store/memory,store/neon}.ts`, `src/import/docx/segmentation.ts`, `src/import/pdf/manual.ts`, `src/report/view.ts`, `src/schema/types.ts`, `src/student/area.ts`; relevant API/import/report/student regressions; collector dispatch, rational serialization, app report path, report recomputation, storage finalization/CAS, student/domain integration and teacher/bank entrypoints. Searched all runtime entrypoints for §§23–24 functionality. Whole-product coverage is incremental from LC56, with fresh full-suite, browser and independent scoring execution; not a fresh line-by-line audit of all unchanged files or every screen.

Only `docs/reviews/LOOP-56-codex.md` is written in the repository by LC57. No product-code change, dependency addition, commit, production write or deploy.

## Findings

### LC57-F01 — MAJOR — Concurrent dispatch bypasses the durable retry budget

- finding_id: LC57-F01; status: VERIFIED; continues LC56-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: retry/backoff checks do not reject an active `sending` record. CAS increments generation without consuming a dispatch; retryCount increments only after a retryable failure returns. Later callers can send while earlier transports remain pending.
- reproduction_steps: from the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating, create memory-backed durable storage, start/finalize an attempt, enqueue a synthetic endpoint. Invoke drainOutbox six times five milliseconds apart while send promises remain unresolved; inspect outbox, then resolve HTTP503 responses.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All reproducer assertions passed; no external service was contacted.
- expected: Shared §3 / WEB §7 require bounded durable retries, at most five dispatches including the first; a concurrent caller must honor an active sending lease.
- impact: overlapping callers/tabs or interrupted sends can exceed the persistent budget. Server deduplication does not enforce this client budget.
- minimal_fix: atomically reserve both a consumed dispatch and a durable sending lease through storage CAS before transport. Reject/coalesce while lease is live; retain consumed attempts across reload/expiry. Preserve payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: delayed concurrent calls through multiple storage instances; one live lease, at most five sends; reload/crash between send and receipt; expired lease recovery; response loss retry uses identical body/tuple; stale callbacks cannot downgrade confirmation or mutate final.

### LC57-F02 — MINOR — Rational parser rejects formatter output

- finding_id: LC57-F02; status: VERIFIED; continues LC56-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parseFractionString of that output throws SyntaxError at the 200-character cap.
- expected: M1 §4.1 requires the parser to be the strict inverse of the formatter over the published rational API domain.
- actual: constructor/formatter accept a value the parser rejects; fresh assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring failure demonstrated within the approved 1000-question limit; not a scoring blocker.
- minimal_fix: enforce hostile-input limits at DTO/payload boundaries while retaining the rational inverse API. Restricting the rational domain instead requires consistent constructor/formatter/parser restrictions and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths 199/200/201; zero; noncanonical rejection; both inverse directions.

### LC57-F03 — MINOR — A nonexistent exam can be assigned

- finding_id: LC57-F03; status: VERIFIED; continues LC56-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection; no trusted ctx.catalog membership check precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` seeds MemoryStore with an active teacher, valid hashed session and owned class. Use empty catalog and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200, success=true, one assignment persisted**; both response and stored count are asserted.
- expected: WEB §§19/22 permit available own/shared published exams or trusted static catalog exams; unknown exams must fail without a write.
- impact: creates orphan assignments leading students to unavailable exams; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before save; return established NOT_FOUND/INVALID_EXAM for unknown IDs.
- regression_test: nonexistent/deleted exam creates no assignment; own/shared published and catalog exams work; foreign owner stays FORBIDDEN; retain no-due-date semantics.

### LC57-F04 — MAJOR — Report filter, navigation and retry-wrong are absent in the app

- finding_id: LC57-F04; status: VERIFIED; continues LC56-F04.
- **VÙNG chịu trách nhiệm: src/app** (coordinates src/report and src/student).
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; isolated controls at `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: the app renders its own report DOM; it does not mount the isolated report controls or wire retryWrong. Isolated renderer tests do not establish built-app availability.
- reproduction_steps: `node LC51-browser-probe.mjs` serves freshly built dist under `/Cunata/` through the existing real-browser harness. Load a synthetic 1I+1III fixture through the hidden file input, submit via UI and inspect the report DOM.
- actual: **cards=2, filter=false, nav=false, retry=false**; browser assertions passed. Browser/context/server closed. This fixture isolates report integration and does not certify the class/PIN journey.
- expected: WEB §§24.1/24.5 require all/wrong/blank controls with aria-pressed, question links and a separate local practice attempt containing wrong/unanswered questions, explicitly not sent to the teacher.
- impact: requested controls remain unavailable to app users despite implementation in the isolated renderer.
- minimal_fix: integrate controls through the report model and app lifecycle; create independent practice IDs/snapshot without assignment/collector linkage; preserve immutable original final/order/downloads and cleanup.
- regression_test: actual app submit → filter/navigation, including navigation to a hidden question; retry covers wrong/blank and partial II; no submitResult request or original-final mutation, including after refresh.

## checks_run

Environment: Windows PowerShell; Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0, existing Chrome/Edge CDP harness. Windows npm.cmd/npx.cmd execute the requested commands. All artifacts below are in the execution snapshot. Probe exit0 means assertions reproduced the bugs, not fixed them.

| Command | Exit | Actual result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 files emitted/validated/promoted in temporary dist; `build.log`; DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics, `tsc.log`. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics, `tsc-web.log`. |
| `npm test` (initial) | 1 | Printed 1601 tests / 345 suites, pass1599/fail2/skip0/cancelled0/todo0, 80388.2558ms. `npm.log`. Two README ENOENT failures from incomplete temporary setup; additionally prints CK16-F01 worker-waiting assertion at :1372 after summary. Not PASS. |
| `npm test` (README restored) | 1, TERMINATED | No final count/summary: process remained alive after last UI assertion output. Stopped own npm process tree; `npm-rerun.log`. No PASS or complete-suite count inferred. |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | 104 tests / 5 suites, pass104/fail0/skip0/cancelled0/todo0; 179057.3512ms, `claude.log`. |
| `node --test "test/codex-check/**/*.test.mjs"` | 1, TERMINATED | No final summary/count; remained alive after supplemental real-browser suite output. Stopped own runner tree; `codex.log`. Not PASS. |
| `node LC51-probes.mjs` | 0 | Fresh assertions reproduce F01/F02/F03 and six UNKNOWN_ACTION roadmap actions; `probes.log`. |
| `node LC51-browser-probe.mjs` | 0 | Actual freshly built dist: cards2/filterfalse/navfalse/retryfalse; `browser-probe.log`. |
| `node LC51-differential.mjs` | 0 | 1632 production total/max/per-section DTO results match independent expectations; `differential.log`. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass, 0 fail/skip; 1632 fixtures, 5849 maxima configs, 9 negative controls; 2.9903s; `oracle.log`. |

The temporary copy initially omitted README.md; restored the unchanged repository README before the second full npm invocation. No test assertions or production source were edited. The second npm and supplemental Codex runs were terminated after they stopped producing output and retained Node/browser handles. Their wrappers reported exit1; termination is not a natural test failure classification. Process inspection identified the retained npm child as test/ui/redesign/components.test.ts and the retained Codex child as test/codex-check/browser.test.mjs. Other unrelated test runners were also present; they were left untouched. Resource contention and teardown are possibilities, not proven causes. The initial CK16 assertion is an unresolved test failure, not proof of unsafe worker activation. Temporary browser audit output directories were prepared in advance. Read-only Git queries in supplemental suites use original GIT_DIR/GIT_WORK_TREE; no worktree was created. PowerShell log redirects are UTF-16. One incidental diagnostic tried to print Unicode through Python cp1252 and failed; retried with ASCII-escaped diagnostic output, without affecting checks.

Targeted rerun: `node --test --test-timeout=60000 test/final-quality/ck12Regressions.test.ts test/ui/redesign/components.test.ts` **exit1**, 25 tests / 1 suite, pass24/fail1/skip0/cancelled0/todo0, 92296.3155ms; `targeted.log`. CK16-F01 again fails, this time CDP `Runtime.evaluate caches.keys()` timeout (test/browser/cdp-client.ts:206), rather than the initial installed/waiting assertion. Other 24 checks pass. The targeted command exited naturally. Neither attempted taskkill command for the targeted run matched a process; no targeted process was killed. This supports an unresolved browser-check reliability gap, not a proven worker data-loss bug.

## coverage_gaps

- M1: suites and independent differential freshly verify exact total/max and per-section scores. Differential does not independently compare every DOM/status/order/raw field. F02 is an API roundtrip defect, not a demonstrated score error under the approved cap.
- M2/M3: unit/VM/browser suites exercise storage/CAS, finalization, timer, shuffle restore, builder/bank/versioning and report/download behavior. No exhaustive new private-browser/quota/migration/backup/delete/recovery/media-offline matrix. F03/F04 remain.
- M4: F01 remains. Range/sum validation of client scores is not authoritative server grading. Live Google/Neon/Vercel CORS/write/receipt/owner readback/deduplication **NOT_RUN**: no production endpoint or credentials used. SQL concurrency fixtures simulate the database. No production acceptance claim.
- M5: current regressions preserve unresolved II keys; PDF remains preview/manual per settled D06. New exhaustive real-document corpus for merged tables, multicolumn layout, images, unsupported OMML and encrypted/scanned PDF **NOT_RUN**. No OCR/automatic PDF extraction claim.
- M6: selected real-browser mobile/desktop/dark/keyboard/contrast/offline checks ran. Fresh manual screenshot-by-screenshot inspection, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse and p95 performance measurement **NOT_RUN**. Full Git-history secret scan and separate dependency audit **NOT_RUN**. Passing selected checks is not WCAG AA certification across every screen.
- §23 **NOT_IMPLEMENTED**: fresh API probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table/type does not implement roster CRUD, PIN/lockout, roster-bound identity, student_id or cross-machine results. Teacher results cannot include not-submitted roster students.
- §24 source search found no rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme in relevant runtime paths. Filter/nav/retry exist only in the isolated renderer; F04 proves absence in actual dist. System dark CSS does not supply a persisted three-way theme switch.
- The initial npm run failed the CK16-F01 worker-waiting assertion at test/final-quality/ck12Regressions.test.ts:1372. This does not demonstrate unsafe activation or a product root cause; retain it as an unresolved check until rerun analysis. Browser suites were concurrent and may contend for resources.

## Missing roadmap features, priority order

1. **P1 reliability:** durable dispatch reservation/lease and budget (F01, src/collect); unknown-exam assignment validation (F03, src/api); rational inverse API (F02, src/domain). Add concurrent/reload/roundtrip regressions.
2. **P1 §23:** owner-scoped roster CRUD; unique hashed four-digit PINs; five failures/10-minute lock; studentToken; roster-bound candidate/student_id; cross-machine myResults; teacher rows for students not submitted. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 §§24.1/24.5:** integrate report filter/nav/retry-wrong (F04); local practice without teacher submission or original-final mutation. Regions src/app, src/report, src/student.
4. **P1 §§24.2/24.3:** full per-student submission viewer; per-question correctness; I-option distribution; three most frequent wrong III answers, using valid submissions. Regions src/api, src/teacher, src/report.
5. **P1 §24.4:** PIN-backed student history and SVG score chart with accessible text table. Regions src/student, src/api.
6. **P2 §§24.6/24.7:** teacher exam printing with answer sheet/separate key page; persisted Light/Dark/System TopBar selector and verified AA. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** investigate intermittent offline-update evidence; live-service checks, recovery/privacy/import corpus, OS IME/multiple browsers/AT/performance and owner acceptance with changelog/rollback. All regions/glue. Retain custom-v1 and manual PDF; do not invent official presets or automatic OCR.

NEED_DECISION: NONE for these concrete fixes and specified features; apply settled decisions and §§19.2a/21–24. A new restriction of the rational API domain would require contract approval; restoring the documented inverse does not.

tools_research: NOT_REQUESTED. privacy_notes: synthetic fixtures only; no credentials, real student data or private instruction content.

Final snapshot verification: HEAD remains `7215f47506afe5f51587cb517af2a4657bad7e69`. Of 359 recorded runtime/build/public/style/root inputs, only `plan.html` changed while this audit ran; all runtime/build/public/style inputs, package/lock/compiler config and root index remained byte-identical. Initial comparison against LC56 covered 550 runtime/test files and found no delta. Source snapshot is still applicable to the product code reviewed; changing plan.html is not covered by this review.

Workspace status changed concurrently: new modifications appeared in test/codex-check/cx/F02-browser-debug.json and test/codex-check/fixtures/bank-backup.json; the pre-existing modification of ops/blitz/promoted/_audit/student/CX-S01b-empty-result.png disappeared. Unrelated runners were visible during process inspection. LC57's test/build commands ran with the temporary directory as cwd, and LC57 intentionally wrote only docs/reviews/LOOP-57-codex.md in the repository. Do not attribute concurrent workspace changes to a reviewed fix or overwrite them. No commit/deploy was performed.
