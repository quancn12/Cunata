# LC53 - Independent whole-product audit

review_id/task_id: LC53; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24, inherited M1 contract; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Four verified findings remain open (2 MAJOR, 2 MINOR). No release approval.
recommended_action: assign fixes to the responsible regions below, add regression coverage, then review the resulting stable snapshot.

## Snapshot, scope and delta since LC52

Read git status/log/diff and LC52 report. HEAD has not advanced since LC52. Pre-existing dirty/untracked files were preserved. Compared SHA-256 of all **111 src files** with the actual LC52 test snapshot: only `src/api/store/neon.ts` changed. Its tested SHA-256 is `aa04473d8d46c377cbfefe1f8d137633d202deffb745a3986911f700302bdf59`. Current repository src hashes matched the tested snapshot on final verification. Complete manifest: `source-hashes.json` in the temporary directory below.

The new delta removes saveExam's follow-up read and false success when the conditional UPSERT returned zero rows. It now returns FORBIDDEN immediately. Static review supports the fix: success requires RETURNING a revision. The new `R1-REVIEW2-F01` regression passed in npm: concurrent competing insert, rejected UPSERT followed by delete, persistent competing owner, and same-owner update. Its SQL transport is simulated; this is not live Neon/Postgres concurrency evidence. No new finding in this delta.

Against HEAD, re-read API atomic teacher creation/password/status/auth generation, owner-scoped deletion, both stores/types, missing-II-key DOCX/PDF import changes, student naming/metadata, report controls and their app caller. Also traced scoring/DTO and report recomputation, controller responses/finalization, storage transaction/outbox boundaries, CSV escaping, offline cache policy, bank/builder/import preview entrypoints and roadmap runtime markers. Broader unchanged coverage is incremental from LC52; this report does not claim a new line-by-line inspection of every source or a manual tour of every screen. No package/lock/build-script/tsconfig delta against HEAD.

All checks ran in `%USERPROFILE%/AppData/Local/Temp/LC53-_jpdj0rr`: copied current src/test/scripts/public/apps-script/docs/styles and root build inputs; initially a junction to existing node_modules; subsequently copied those same installed files physically for a nested-build harness that cannot copy junctions. Added existing ops/blitz/promoted/_support and ops/publish.py inputs in the temporary copy for supplemental checks. This is a temporary copy, not a branch/worktree. Build/test artifacts stayed there. No installation, dependency changes, production writes, commit or deploy. Only this report was created in the repository by LC53. LC51-named probe files were inspected, copied from the prior test directory, and executed anew on LC53 source; filenames are not claims of inherited execution.

## Findings

### LC53-F01 - MAJOR - Concurrent outbox dispatch bypasses the durable retry budget

- **VÙNG chịu trách nhiệm: src/collect.** VERIFIED; continues LC52-F01.
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:476`, `:624`.
- evidence: no sending lease/in-flight gate; generation is claimed before sending, but retryCount is increased only after awaiting a retryable error. A later caller sees sending with zero retry count and dispatches again.
- reproduction_steps: run `node LC51-probes.mjs` in the LC53 snapshot. Parse hoa-repeating, create MemoryTransactionAdapter/createStoragePort, start and finalize an attempt, enqueue fixture endpoint. Hold transport promises pending and call drainOutbox six times, 5ms apart, for the same tuple. Read durable outbox before resolving all with simulated 503.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. Probe assertions passed. No network used.
- expected: WEB section 7/Shared section 3 require bounded durable retries, at most five total dispatches including the first; callers must respect an active sending lease.
- impact: multiple callers/tabs or reload can exceed the specified budget and send overlapping requests; server deduplication does not implement the client budget.
- minimal_fix: atomically reserve a dispatch and lease through durable CAS before transport; reject/coalesce callers while lease is valid; preserve consumed attempts across reload/expired lease. Keep body/hash/idempotency tuple unchanged and confirmed terminal. An in-memory lock alone cannot cover tabs/reloads.
- regression_test: delayed transport with multiple callers and storage instances; one active lease, <=5 total sends; reload between dispatch/receipt; lost receipt retry preserves tuple/body; late responses cannot downgrade confirmed or mutate final.

### LC53-F02 - MINOR - Rational parser is not the inverse of its formatter

- **VÙNG chịu trách nhiệm: src/domain.** VERIFIED; continues LC52-F02.
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: public barrel API in LC51-probes: `s=toFractionString(rational(10n**200n))` produces a 201-character canonical integer; `parseFractionString(s)` throws SyntaxError because of the 200-character limit.
- expected: M1 section 4.1 requires a strict inverse on the published rational API's domain.
- actual: constructor/formatter accept a value the parser rejects. Fresh probe asserts both outcomes.
- impact: API roundtrip failure; no scoring error demonstrated within the approved 1000-question cap. This is not a scoring blocker.
- minimal_fix: enforce hostile-input size limits at DTO/payload boundaries while preserving inverse rational API. A bounded rational domain would require consistent constructor/formatter/parser bounds and an approved contract change.
- regression_test: canonical positive/negative numerator/denominator roundtrips at 199/200/201 characters, zero, and rejection of noncanonical forms; inverse in both directions.

### LC53-F03 - MINOR - API accepts assignment of a nonexistent exam

- **VÙNG chịu trách nhiệm: src/api.** VERIFIED; continues LC52-F03.
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam result bypasses ownership rejection; membership of the trusted ctx.catalog is not checked before saveAssignment.
- reproduction_steps: LC51-probes creates a real MemoryStore, active teacher, valid hashed session and owned class; ctx.catalog=[]; POST assignExam with examId=does-not-exist, valid ISO openAt and dueAt="".
- actual: **HTTP200/success=true**, one persisted assignment. Probe checks response and stored list length.
- expected: WEB sections 19/22, only an available owned/shared published exam or trusted static catalog exam can be assigned; unknown exam does not write.
- impact: orphan assignment and unavailable student exam; also possible for a stale caller after unpublish. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted server catalog membership before write; return the established NOT_FOUND/INVALID_EXAM error for unknown exams.
- regression_test: unknown/deleted exams do not write; own and static catalog exams succeed; foreign owner returns FORBIDDEN; preserve no-due-date behavior.

### LC53-F04 - MAJOR - Report filters, navigation and retry-wrong are not integrated into the application

- **VÙNG chịu trách nhiệm: src/app**, with src/report and src/student integration. VERIFIED; continues LC52-F04.
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; isolated controls at `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: application constructs a separate report and does not mount the module report controls or connect retryWrong. Module tests alone cannot establish application availability.
- reproduction_steps: `node LC51-browser-probe.mjs` starts local dist under /Cunata/ through the existing real-browser harness; openApp - hidden JSON fixture load (1I+1III) - UI submit - inspect DOM.
- actual: **cards=2, filter=false, nav=false, retry=false**. Browser assertions passed; browser/context/server closed. Hidden file input isolates report integration and does not certify the class/PIN journey.
- expected: WEB sections 24.1/24.5 require all/wrong/blank filtering with aria-pressed, question links, and a separate retry practice attempt containing wrong/unanswered questions, explicitly not sent to teacher.
- impact: the requested roadmap controls are absent for dist users despite implementation in an isolated renderer.
- minimal_fix: integrate controls/renderer with the standard report model; create independent practice ID/snapshot with no assignment/collector; preserve original final, displayed order, downloads and disposal lifecycle.
- regression_test: real app submit - filter/nav, including navigation to a filtered-out question; retry checks exact wrong/blank set including partial II; no submitResult calls or changes to the original final, also after refresh.

## checks_run

Environment: Windows PowerShell, Node v24.14.0, TypeScript 7.0.2, Python 3.11.0; existing browser harness. Windows npm.cmd/npx.cmd shims execute the requested npm/npx commands. All log paths below are relative to the temporary LC53 snapshot directory above. Probe exit0 means a successful reproduction, not that the bug was repaired.

| Command | Exit | Result / evidence |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 emitted files, successful staged promotion; build.log; DEP0190 warning |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; tsc.log |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; tsc-web.log |
| `npm test` | 0 | 1610 tests / 345 suites; pass1610/fail0/skip0/cancelled0/todo0; 52331.6524ms; npm.log |
| `node --test test/claude-check/**/*.test.mjs` | 0 | 104 tests / 5 suites; pass104/fail0/skip0/cancelled0/todo0; 76544.2884ms; claude.log; includes real-browser and fixture-backend checks |
| `node --test test/codex-check/**/*.test.mjs` | 1 | 155 tests, pass142/fail13/skip0; 62106.0812ms; codex.log. Eight module-load failures from omitted ops support; five nested-build/publisher cases blocked by junction copying or missing ops/publish.py. Environment failures, not verified product defects. |
| `node --test test/codex-check/cx/*.test.mjs test/codex-check/feat/R1/glue.test.mjs` | 1 | 58 tests, pass38/fail20/skip0; 24995.7716ms; codex-retry.log. Added support and physical installed dependency copy; remaining failures are git HEAD lookup and missing artifact directories in the temporary snapshot. Glue checks passed. |
| `node --test test/codex-check/cx/{admin,app,student,teacher}.test.mjs` (four explicit filenames) | 0 | 24 tests, pass24/fail0/skip0/cancelled0/todo0; 12699.8855ms; codex-final.log. Remaining blocked files now pass after artifact directories were created and Git HEAD was read via GIT_DIR/GIT_WORK_TREE; no repository/worktree created. |
| `node LC51-probes.mjs` | 0 | F01 six sends / zero budget; F02 canonical length201 rejected; F03 unknown exam accepted; all six roster/PIN/history actions UNKNOWN_ACTION; probes.log |
| `node LC51-browser-probe.mjs` | 0 | Real browser dist: two review cards, filter/nav/retry absent; browser-probe.log |
| `node LC51-differential.mjs` | 0 | All 1632 product total/max/section score/max values match independent fixtures; differential.log |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip; 1632 fixtures, 5849 maxima configurations, 9 negative controls; 6.3668s; oracle.log |

All initially blocked supplemental files were rerun successfully across the two targeted reruns; the original all-files command was not repeated and its exit remains 1. No test code/assertion was edited, removed, skipped or weakened. PowerShell renders some stderr as NativeCommandError records (including the build deprecation warning and Python unittest progress); the native exit codes above are captured separately. Initial attempt to read LC52's hash-manifest filename found no such file; comparison was completed by hashing its actual src tree directly. No review conclusion relies on that failed lookup.

## coverage_gaps

- M1: fresh full suite and independent differential cover exact I/II/III scoring and maxima. Differential compares total/max/per-section values, not every DOM/status/order/raw field. F02 remains.
- M2/M3: npm covers storage/CAS/finalization, timing, snapshots, builder/bank/version preservation; fresh browser suites cover selected flows. No exhaustive new manual quota/private-browser/migration/recovery/delete/backup or media-offline matrix. F03/F04 remain.
- M4: F01 remains. Client-score range/sum validation is not trusted server grading. Live Google/Neon/Vercel origin/CORS/write/receipt/readback/deduplication **NOT_RUN**: no production endpoint or credentials used. The Neon regression is transport simulation, not live database evidence.
- M5: missing II keys stay unresolved instead of being invented; PDF remains preview/manual under D06. No new comprehensive real-document corpus for merged tables, multicolumn layout, images, unsupported OMML, encrypted/scanned PDF; no automatic OCR claim.
- M6: real-browser suites and report probe executed. No new screenshot inspection, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse or p95 performance run. Full Git-history secret scan NOT_RUN. Supplemental setup failures and reruns are reported above; do not interpret their initial nonzero exits as a clean suite. Browser suite assertions do not certify every screen's AA compliance.
- section 23 **NOT_IMPLEMENTED**: fresh API probe returns UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table and student_id type fields do not implement roster/PIN/authenticated names/cross-machine result history. Current no-login UI is not roster authentication.
- section 24 runtime search finds no rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme in the relevant runtime paths. Filter/nav/retry markers exist only in report/view and were absent in the tested app. System dark CSS is not the requested persisted three-way theme control.

## Missing roadmap features, priority order

1. **P1 reliability:** durable outbox dispatch budget/lease (F01, src/collect); reject orphan assignments (F03, src/api); restore rational inverse contract (F02, src/domain). Add meaningful concurrent/reload/roundtrip regressions.
2. **P1 section 23 roster/PIN:** owner-scoped roster CRUD, unique hashed four-digit PINs, five failures/10-minute lock, studentToken and roster-bound candidate/student_id; myResults across machines and teacher rows for students not submitted. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 sections 24.1/24.5 app integration:** filter/nav/retry-wrong (F04), separate local practice without teacher submission or original-result mutation. Regions src/app, src/report, src/student.
4. **P1 sections 24.2/24.3:** full per-student submission viewer, per-question correctness, I option distribution and top-three wrong III answers, valid finalized submissions only. Regions src/api, src/teacher, src/report.
5. **P1 section 24.4:** PIN-backed myHistory plus SVG column chart with accessible alternative text table. Regions src/student, src/api.
6. **P2 sections 24.6/24.7:** printable exam plus answer sheet and separate key page; persistent Light/Dark/System TopBar selector and AA across screens. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** live-service evidence, privacy/recovery, full import corpus, OS IME/multiple browsers/AT/performance, changelog/rollback and owner acceptance. All regions/glue. Continue custom-v1; do not invent official THPT presets, OCR or dependencies.

NEED_DECISION: NONE for the concrete fixes/integrations listed here; apply settled decisions and sections 19.2a/21-24. A change to the rational API domain would need an approved contract revision; restoring the existing inverse contract does not.
tools_research: NOT_REQUESTED. privacy_notes: synthetic fixtures only; no credentials, real student data or private instruction content.
