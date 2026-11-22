# LC55 ? Independent whole-product audit

review_id/task_id: LC55; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69` (main).
requirements_version: Shared Product Contract v2.0; complete WEB-contract.md ??1?24, inherited M1 scoring contract; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Four verified open findings: 2 MAJOR, 2 MINOR. No release approval.
recommended_action: fix the responsible regions below, add regressions, then review a stable snapshot. No new business decision is required for these fixes or the specified roadmap features.

## Snapshot and review coverage

Read the task, required contracts and previous LC54 review. Inspected git status/log and HEAD-to-working-tree source diff. HEAD has not advanced since LC54. Compared SHA-256 of all **111 src files**, scripts, public inputs, Apps Script and styles against the actual LC54 execution tree: **no delta**. Compared all test `.ts`, `.mjs` and `.py` files: **no test-code delta**. Package/lock/build-script/tsconfig diff against HEAD is empty. Existing dirty/untracked work was preserved.

files_reviewed: current changes in `src/api/{handle,types,store/memory,store/neon}.ts`, `src/import/docx/segmentation.ts`, `src/import/pdf/manual.ts`, `src/report/view.ts`, `src/schema/types.ts`, `src/student/area.ts`; associated API/import/report/student tests, including untracked regressions. Rechecked collect dispatch and storage CAS/finalization, student submit/scoring, report recomputation/application caller, domain rational API, API authentication/SQL ownership changes, bank/teacher entrypoints, import preview/ZIP boundaries, UI entrypoints and offline metadata fetching. Searched runtime entrypoints for ??23?24 functionality. Whole-product coverage is incremental from LC54 plus fresh suite/browser/oracle execution; this is not a fresh line-by-line review of every unchanged file or manual inspection of every screen.

Execution snapshot: `%USERPROFILE%/AppData/Local/Temp/LC55-mb_tcx2z`. Copied current runtime/test/build inputs and physically copied existing installed node_modules. Copied existing local harness support and `ops/publish.py`; no branch/worktree was created. Build/test artifacts and logs stay in that temporary tree. Read and copied the three LC51-named probes from LC54, then **executed them anew against LC55 source**. Their names do not denote inherited test results. Runtime manifest: `source-hashes.json`; original working-tree status: `git-status-before.txt`.

Only `docs/reviews/LOOP-55-codex.md` is written in the repository by LC55. No installation, dependencies, product-code edits, production writes, commit or deploy.

## Findings


### LC55-F01 — MAJOR — Concurrent outbox dispatch bypasses the durable retry budget

- finding_id: LC55-F01; status: VERIFIED; continues LC54-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: the initial checks enforce retryCount/backoff but do not reject an active `sending` record. CAS claims a new generation without consuming a dispatch. retryCount increments only after awaiting a retryable failure. A later caller can therefore claim another generation and send while the first transport is pending.
- reproduction_steps: in the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating; use MemoryTransactionAdapter/createStoragePort; start/finalize an attempt and enqueue a synthetic fixture endpoint. Keep send promises unresolved; invoke drainOutbox six times for the same tuple, five milliseconds apart. Read the durable outbox, then resolve each promise with simulated HTTP503.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All probe assertions passed; no network service was used.
- expected: Shared §3 and WEB §7 require bounded durable retries, at most five total dispatches including the first. Concurrent callers must honor an active sending lease.
- impact: multiple callers/tabs or reload can create overlapping sends and exceed the durable budget. Server deduplication does not enforce the client dispatch budget.
- minimal_fix: atomically reserve a dispatch and a durable lease through storage CAS before transport. Reject/coalesce callers while the lease is live; retain consumed dispatches across reload/lease expiry. Preserve the payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: multiple callers/storage instances with delayed transport; one live lease and no more than five dispatches; crash/reload after dispatch before receipt; expired lease recovery; lost response retries preserve body/tuple; late callbacks cannot downgrade confirmation or mutate final.

### LC55-F02 — MINOR — Rational parser is not the inverse of its formatter

- finding_id: LC55-F02; status: VERIFIED; continues LC54-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: public barrel calls in `node LC51-probes.mjs`: `s = toFractionString(rational(10n ** 200n))` produces a canonical integer of length201; `parseFractionString(s)` throws SyntaxError at the 200-character limit.
- expected: M1 §4.1 requires strict inverse parsing/formatting over the published rational API domain.
- actual: constructor and formatter accept a value that the parser rejects; freshly executed assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring defect demonstrated within the approved 1000-question limit; this is not a scoring blocker.
- minimal_fix: apply hostile-input length caps at DTO/payload boundaries while preserving the rational inverse API. Restricting the rational domain would instead require consistent constructor/formatter/parser limits and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths199/200/201, zero and noncanonical rejection; inverse in both directions.

### LC55-F03 — MINOR — API accepts assignment of a nonexistent exam

- finding_id: LC55-F03; status: VERIFIED; continues LC54-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection. No membership check against trusted ctx.catalog precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` creates a MemoryStore, active teacher, hashed valid session and owned class. Use ctx.catalog=[] and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200/success=true**, with one persisted assignment. Probe asserts both response and stored assignment count.
- expected: WEB §§19/22 allow assignment of an available permitted published exam or trusted static catalog exam; an unknown exam must not write.
- impact: an orphan assignment exposes an unavailable student exam; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before saving; use the established NOT_FOUND/INVALID_EXAM error for unknown exams.
- regression_test: nonexistent/deleted exams produce no write; own/shared published and static catalog exams work; foreign owner remains FORBIDDEN; preserve no-due-date semantics.

### LC55-F04 — MAJOR — Report filter/navigation/retry-wrong remain unavailable in the application

- finding_id: LC55-F04; status: VERIFIED; continues LC54-F04.
- **VÙNG chịu trách nhiệm: src/app**, coordinating src/report and src/student.
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; isolated controls at `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: the application builds its own report DOM and does not mount the module report controls or wire retryWrong. Tests of the isolated renderer do not establish availability in dist.
- reproduction_steps: run `node LC51-browser-probe.mjs`. Existing real-browser harness serves the freshly built dist under `/Cunata/`; open app, load a synthetic 1I+1III fixture through the hidden file input, submit through the UI, inspect the report DOM.
- actual: **cards=2, filter=false, nav=false, retry=false**. Browser assertions passed; context/browser/local server were closed. Hidden JSON loading isolates report integration and does not certify the class/PIN journey.
- expected: WEB §§24.1/24.5 require all/wrong/blank controls with aria-pressed, question links, and an independent practice attempt containing wrong/unanswered questions, explicitly not sent to the teacher.
- impact: requested roadmap controls are absent for application users despite implementation in a separate renderer.
- minimal_fix: integrate the controls with the standard report model and app lifecycle; create an independent practice ID/snapshot without assignment/collector linkage. Preserve original immutable final, order, downloads and cleanup.
- regression_test: actual app submit → filter/nav, including navigation to filtered-out questions; retry set covers wrong/blank and partial II; no submitResult call or original-final mutation, including after refresh.

## checks_run

Environment: Windows PowerShell; Node v24.14.0; installed TypeScript 7.0.2; Python 3.11.0; existing Chrome/Edge CDP harness. Windows `npm.cmd`/`npx.cmd` execute the requested npm/npx commands. Paths below are relative to the execution snapshot. Probe exit 0 means successful reproduction of the asserted behavior, not resolution of the bug.

| Command | Exit | Actual result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 files emitted, validated and promoted into temporary dist; `build.log`. DEP0190 warning recorded. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; `tsc.log`. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; `tsc-web.log`. |
| `npm test` | 0 | **1610 tests / 345 suites, pass1610/fail0/skip0/cancelled0/todo0**, 143460.3577ms; `npm.log`. Fresh build completed before this command. |
| `npm test` with existing teardown adapter through NODE_OPTIONS | 0 | **1610 tests / 345 suites, pass1610/fail0/skip0/cancelled0/todo0**, 34166.46ms; `npm-adapter.log`. Adapter path: `ops/blitz/promoted/_support/runtime.mjs`. |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | **104 tests / 5 suites, pass104/fail0/skip0/cancelled0/todo0**, 97623.0767ms; `claude.log`. Includes real-browser design/role/student/teacher/offline checks and simulated services. |
| `node LC51-probes.mjs` | 0 | Six overlapping sends and zero budget consumed; length201 rational rejected; nonexistent exam accepted and persisted; six roster/PIN/history actions UNKNOWN_ACTION; `probes.log`. |
| `node LC51-browser-probe.mjs` | 0 | Real freshly built dist app: two report cards; filter/nav/retry absent; `browser-probe.log`. |
| `node LC51-differential.mjs` | 0 | All1632 product total/max and per-section score/max DTO values match independent fixture expectations; `differential.log`. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip, 1632 fixtures, 5849 maxima configurations, 9 negative controls, 2.7347s; `oracle.log`. This command checks the independent oracle; the differential above separately executes production scoring. |

The first npm run appeared stalled in browser component execution/teardown. A process query verified the child and ancestry; a guarded stop was attempted after more than two minutes, but the process had already exited and **no process was stopped**. The plain run then returned exit0 with the complete summary above. The adapter rerun was already started and also passed. The existing adapter acknowledges Browser.close during teardown only; test assertions and production code were unchanged. Both outcomes are retained separately. This timing observation is not a demonstrated product defect.

Supplemental tests needing Git context received GIT_DIR/GIT_WORK_TREE pointing to the original repository for read-only queries. No worktree was created. PowerShell redirection stores UTF-16 logs and may format native stderr warnings as NativeCommandError; actual native exit codes were captured. Two incidental source-search paths were invalid (a nonexistent storage helper and a Windows wildcard); corrected entrypoint reads/searches supplied the cited evidence. No finding rests on those failed searches.

## coverage_gaps

- M1: full suites and independent differential freshly verify exact total/max and per-section scores. The differential does not independently compare every DOM/status/order/raw field. F02 is an API roundtrip defect, not a demonstrated scoring error under the approved cap.
- M2/M3: suites cover transactions/CAS, finalization, timer, shuffle restore, builder/bank/versioning, downloads and selected browser journeys. No exhaustive new manual private-browser/quota/migration/backup/delete/recovery/media-offline matrix. F03/F04 remain.
- M4: F01 remains. Range/sum checks on client data are not trusted server grading. Live Google/Neon/Vercel CORS/write/receipt/owner readback/deduplication **NOT_RUN**: no production service credentials/endpoints used. SQL concurrency fixtures simulate database behavior. No claim of production acceptance.
- M5: current regressions preserve missing II keys as unresolved; PDF remains preview/manual per D06. A new exhaustive real-document corpus for merged tables, multicolumn layout, images, unsupported OMML and encrypted/scanned PDF **NOT_RUN**. No OCR or automatic PDF extraction claim.
- M6: existing real-browser design checks ran, including selected mobile/desktop/dark/keyboard/contrast cases. Fresh screenshot-by-screenshot manual review, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse and p95 performance measurement **NOT_RUN**. Full Git-history secret scan and separate dependency audit **NOT_RUN**. Passing browser checks do not establish WCAG AA on every screen.
- Separate complete `test/codex-check/**/*.test.mjs` suite **NOT_RUN in LC55**; no LC54 supplemental failures are reclassified as LC55 passes. Fresh evidence here is the npm, Claude, direct production probes and oracle commands listed above.
- ?23 **NOT_IMPLEMENTED**: freshly executed handle probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table/type is not roster CRUD, PIN authentication/lockout, roster-bound candidate naming or cross-machine history. Teacher results lack not-submitted roster rows.
- ?24 search found no rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme in relevant runtime paths. Filter/nav/retry exist only in the separate report renderer and are absent in the actual app probe. System dark CSS does not implement a persisted three-way theme selector.
- LC54's intermittent CK15 failure did not reproduce in either LC55 full run. Two passing executions do not prove its underlying timing cause was fixed; source is unchanged.

## Missing roadmap features, priority order


1. **P1 reliability:** durable dispatch reservation/lease and retry budget (F01, src/collect); reject orphan assignments (F03, src/api); restore rational inverse API (F02, src/domain). Add concurrent/reload/roundtrip regressions.
2. **P1 §23 roster/PIN:** owner-scoped roster CRUD, unique hashed four-digit PINs, five failures/10-minute lock, studentToken, roster-bound candidate/student_id, cross-machine myResults and teacher rows for students not submitted. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 §§24.1/24.5:** integrate report filter/nav/retry-wrong (F04), separate local practice with no teacher submission or original-result mutation. Regions src/app, src/report, src/student.
4. **P1 §§24.2/24.3:** per-student full submission viewer; per-question correctness, I-option distribution and top-three wrong III answers from valid final submissions. Regions src/api, src/teacher, src/report.
5. **P1 §24.4:** PIN-backed student history and SVG score chart with accessible text table. Regions src/student, src/api.
6. **P2 §§24.6/24.7:** teacher exam print with answer sheet and separate key page; persisted Light/Dark/System TopBar selector and verified AA across screens. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** resolve offline-update test instability; live-service evidence, recovery/privacy/import corpus, OS IME/multiple browsers/AT/performance and owner acceptance with changelog/rollback. All regions/glue. Continue custom-v1; official presets and automatic OCR must not be invented.

NEED_DECISION: NONE for these concrete fixes and already-specified features; use settled decisions and ??19.2a/21?24. A new restriction of the rational API domain would require a contract decision; restoring the documented inverse does not.

tools_research: NOT_REQUESTED. privacy_notes: synthetic fixtures only; no credentials, real student data or private instruction content.

Final snapshot verification: unchanged HEAD and no hash drift across the reviewed runtime/build/public/style inputs after all checks.
