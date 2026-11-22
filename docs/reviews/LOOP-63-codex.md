# LC63 - Independent whole-product audit

review_id: LC63; task_id: LC63; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus pre-existing working-tree changes.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24, read in full; inherited M1 scoring signatures; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Four verified findings: two MAJOR and two MINOR. No release approval. First full npm run failed one timing assertion; isolated and full reruns passed. These successes do not resolve the independently reproduced defects.
NEED_DECISION: NONE for the listed fixes and approved roadmap. Retain custom-v1 and approved PDF preview/manual scope.

## Snapshot, files_reviewed and method

Independent incremental whole-product audit from LC62. Inspected git status/log, current source and HEAD-to-working-tree diff, including pre-existing uncommitted changes. HEAD is unchanged. All 552 inputs in the LC62 manifest are represented in this run's manifest: 549 byte-identical, three different (`test/codex-check/cx/F02-browser.json`, `F03-browser.json`, `test/codex-check/fixtures/bank-backup.json`). No runtime/assertion changes versus LC62 were detected in that common set. This run additionally hashes documentation and root files, for 726 selected inputs total. The three differences are browser evidence/export-fixture files; no previous evidence is presented as a fresh execution.

Direct inspection covered API handle/types/MemoryStore/NeonStore atomic account and ownership operations, importer missing II keys and preview validation, schema metadata/student name handling, report renderer controls versus app composition, domain rational/scoring and score oracle integration, storage finalization/outbox CAS, student persistence callers, teacher assignment date/no-deadline handling, result view and API projections, collector dispatch/retry and service configuration. Repository-wide symbols and fresh API probes checked sections 23-24. Full tests exercise product regions; unchanged production files were not all freshly read line by line. This is an incremental whole-product audit, not exhaustive proof of all paths.

Execution copy: `%USERPROFILE%/AppData/Local/Temp/LC63-g0eh6vcr`, a normal temporary directory, not a branch/worktree. Current src/test/scripts/docs/public/styles/apps-script, installed node_modules, root build/config assets and ops/publish.py were copied for execution. Build and tests write their artifacts only there. Reproducers retained from LC62 were inspected and executed anew; their LC51 filenames are retained for reproducibility. No install, dependency change, code fix, commit, deploy or production service write.

`source-hashes.json` records inputs; `git-status-before.txt` records existing changes. Only `docs/reviews/LOOP-63-codex.md` is intentionally created/modified in the repository by this audit. Final source-drift results appear below; existing changes are preserved.

## Findings




### LC63-F01 — MAJOR — Concurrent dispatch bypasses the durable retry budget

- finding_id: LC63-F01; status: VERIFIED; continues LC62-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: retry/backoff checks do not reject an active `sending` record. CAS increments generation without consuming a dispatch; retryCount increments only after a retryable failure returns. Later callers can send while earlier transports remain pending.
- reproduction_steps: from the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating, create memory-backed durable storage, start/finalize an attempt, enqueue a synthetic endpoint. Invoke drainOutbox six times five milliseconds apart while send promises remain unresolved; inspect outbox, then resolve HTTP503 responses.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All reproducer assertions passed; no external service was contacted.
- expected: Shared §3 / WEB §7 require bounded durable retries, at most five dispatches including the first; a concurrent caller must honor an active sending lease.
- impact: overlapping callers/tabs or interrupted sends can exceed the persistent budget. Server deduplication does not enforce this client budget.
- minimal_fix: atomically reserve both a consumed dispatch and a durable sending lease through storage CAS before transport. Reject/coalesce while lease is live; retain consumed attempts across reload/expiry. Preserve payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: delayed concurrent calls through multiple storage instances; one live lease, at most five sends; reload/crash between send and receipt; expired lease recovery; response loss retry uses identical body/tuple; stale callbacks cannot downgrade confirmation or mutate final.

### LC63-F02 — MINOR — Rational parser rejects formatter output

- finding_id: LC63-F02; status: VERIFIED; continues LC62-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parseFractionString of that output throws SyntaxError at the 200-character cap.
- expected: M1 §4.1 requires the parser to be the strict inverse of the formatter over the published rational API domain.
- actual: constructor/formatter accept a value the parser rejects; fresh assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring failure demonstrated within the approved 1000-question limit; not a scoring blocker.
- minimal_fix: enforce hostile-input limits at DTO/payload boundaries while retaining the rational inverse API. Restricting the rational domain instead requires consistent constructor/formatter/parser restrictions and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths 199/200/201; zero; noncanonical rejection; both inverse directions.

### LC63-F03 — MINOR — A nonexistent exam can be assigned

- finding_id: LC63-F03; status: VERIFIED; continues LC62-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection; no trusted ctx.catalog membership check precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` seeds MemoryStore with an active teacher, valid hashed session and owned class. Use empty catalog and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200, success=true, one assignment persisted**; both response and stored count are asserted.
- expected: WEB §§19/22 permit available own/shared published exams or trusted static catalog exams; unknown exams must fail without a write.
- impact: creates orphan assignments leading students to unavailable exams; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before save; return established NOT_FOUND/INVALID_EXAM for unknown IDs.
- regression_test: nonexistent/deleted exam creates no assignment; own/shared published and catalog exams work; foreign owner stays FORBIDDEN; retain no-due-date semantics.

### LC63-F04 — MAJOR — Report filter, navigation and retry-wrong are absent in the app

- finding_id: LC63-F04; status: VERIFIED; continues LC62-F04.
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

Environment: Windows PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0, existing Chrome/Edge CDP harness. npm.cmd/npx.cmd execute the requested npm/npx commands on Windows. All executable checks ran in the temporary execution copy. Log paths below are relative to it (PowerShell redirected logs are UTF-16). A defect probe exit 0 means its assertions reproduced the defect, not that the defect was fixed.

| Command | Exit | Actual result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 emitted/validated files, staged and promoted only in execution copy; `build.log`; DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; `tsc.log`. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; `tsc-web.log`. |
| `npm test` (first run) | 1 | 1610 tests /345 suites: pass1609/fail1/skip0/cancelled0/todo0, 45360.0108ms; `npm.log`. Performance test initial page load **5259ms >2000ms**, assertion at test/browser/bundle-security-perf.test.ts:131. |
| `node --test test/browser/bundle-security-perf.test.ts` | 0 | Isolated rerun: 5 tests /1 suite, pass5/fail0/skip0/cancelled0/todo0, 2018.638ms; `perf-rerun.log`. |
| `npm test` (full rerun) | 0 | 1610 tests /345 suites: pass1610/fail0/skip0/cancelled0/todo0, 32164.106ms; `npm-rerun.log`. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 tests /5 suites, pass104/fail0/skip0/cancelled0/todo0, 46271.2445ms; `claude.log`. Real browser and local simulated services. |
| `node LC51-probes.mjs` | 0 | Fresh F01/F02/F03 reproductions and six UNKNOWN_ACTION section23 probes; `probes.log`. Synthetic durable-storage adapter and MemoryStore API fixtures. |
| `node LC51-browser-probe.mjs` | 0 | Fresh built app under /Cunata/: cards2/filterfalse/navfalse/retryfalse; `browser-probe.log`. Real browser, synthetic hidden-file fixture, resources closed. |
| `node LC51-differential.mjs` | 0 | 1632 production total/max and per-section score/max comparisons match independent expected values; `differential.log`. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip, 1632 fixtures, 5849 maxima configurations, 9 negative controls, 4.602s reported duration; `oracle.log`. |

Build completed before npm test. First npm run overlapped independent non-browser probes/oracle work. The isolated performance rerun and second full npm run followed its completion; no assertions, runner settings or source were altered. The second full run completed before the separate claude-check browser suite. The first failure must not be erased by the passing reruns. No stable product slowdown or root cause was established; scheduler/resource contention is a hypothesis, not a demonstrated cause. Existing performance assertions are not independent proof of paint p95 <100ms (the test uses five CDP typing samples with a 150ms assertion). Historical CK16-F01 did not fail these full npm runs; its earlier intermittency is not explained.

For read-only Git lookups in the supplemental suite, GIT_DIR/GIT_WORK_TREE point to the original repository; tested sources are the pinned execution copy. No real Google/Neon/Vercel endpoints were used.

## coverage_gaps


- M1: fresh full tests and independent score/max comparisons pass. F02 remains a rational public API inverse defect; no scoring defect demonstrated within the approved 1000-question limit. Differential comparison does not certify every DOM/status/raw/order field.
- M2/M3: unit/VM/browser checks cover selected restoration, timer, shuffle, finalization, reporting, builder and bank behavior. A fresh exhaustive quota/private-mode/migration/backup/delete and media-offline matrix was NOT_RUN. No new full class/PIN journey exists to certify.
- M4: F01 persists despite suite success. Live Google/Neon/Vercel CORS/write/receipt/readback/deduplication NOT_RUN: no credentials or production endpoints used. Local HTTP/SQL simulation is not evidence of actual Neon concurrency or live trusted grading.
- M5: source diff preserves unresolved II keys as absent rather than inventing false. Existing synthetic importer regressions run in npm test. Full real-document corpus covering merged tables, multicolumn layouts, media, unsupported OMML, encrypted/scan PDF NOT_RUN. Approved PDF scope remains preview/manual.
- M6: real browser checks executed. OS Telex/VNI, Firefox/WebKit, assistive technology, fresh manual screenshot review, axe and Lighthouse NOT_RUN. Selected contrast and responsive checks do not certify every screen or WCAG AA. Unit/browser timing assertions are not an independent input-to-paint p95 <100ms benchmark.
- Section23 NOT_IMPLEMENTED: fresh API probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. Students table/types and optional student_id do not implement roster CRUD, PIN hashing/uniqueness, lockout, roster-bound identity, cross-machine reports or unsubmitted roster rows.
- Section24 integration gap: report filter/nav/retry controls exist only in the isolated renderer (F04). No runtime symbols found for rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. System dark CSS does not provide a persisted Light/Dark/System selector.
- Supplemental test/codex-check .mjs suite, full Git-history secret scan and dependency audit NOT_RUN; no prior PASS imported. Owner production acceptance NOT_RUN. Historical CK16-F01 intermittency is not explained by this run. The first LC63 full suite also failed its initial-load timing budget; isolated and full reruns passed. Timing stability remains unverified.

## Missing roadmap features, priority order


1. **P1 reliability:** durable dispatch reservation/lease and persistent bounded retry budget (F01, src/collect); reject nonexistent/deleted exam assignments (F03, src/api); restore rational formatter/parser inverse (F02, src/domain). Add concurrent/reload/roundtrip regressions. Monitor the historical CK16-F01 waiting-worker intermittency with retained failing/passing evidence.
2. **P1 section23:** owner-scoped roster CRUD; unique hashed four-digit PINs; five-failure/ten-minute server lockout; studentToken; roster-bound candidate/student_id; cross-machine myResults; teacher rows for students who have not submitted. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 sections24.1/24.5:** integrate filters/navigation and retry-wrong in the actual app (F04). Independent local practice must not send to teachers or mutate original finals. Regions src/app, src/report, src/student.
4. **P1 sections24.2/24.3:** teacher per-student full submission viewer and valid-submission statistics: per-question correctness, I option distributions, top three wrong III answers. Regions src/api, src/teacher, src/report.
5. **P1 section24.4:** PIN-backed history, SVG score chart and accessible text table. Regions src/student, src/api.
6. **P2 sections24.6/24.7:** teacher print flow with blank answer sheet and separate key page; persisted Light/Dark/System TopBar selector and contrast checks. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** live-service verification, recovery/privacy/import corpus, OS IME/multiple browsers/assistive technology/performance and owner acceptance with changelog/rollback. All regions/glue. Retain approved custom-v1 and manual PDF scope; do not invent official presets or automatic OCR.

recommended_action: return four verified findings to owning workers, resolve/test them, implement missing approved features and rerun gates and independent integration review. Preserve first failing and subsequent passing timing evidence; investigate timing stability without weakening assertions. No release approval based solely on a green rerun.
NEED_DECISION: NONE for required fixes/features. If changing the rational public-domain contract instead of restoring its documented inverse, owner approval is needed; options are (A) restore inverse and limit payload boundaries, (B) consistently restrict constructor/formatter/parser with a versioned contract revision. This audit recommends the existing contract's minimal fix and does not make that revision.
tools_research: NOT_REQUESTED.
privacy_notes: synthetic test data; no private instruction text, credentials or real student data in this report.

Final snapshot: HEAD remains `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`. Compared all 726 selected original inputs against pre-run hashes: drift = `test/codex-check/fixtures/bank-backup.json`. `final-snapshot.json` records the comparison. No production source/build/config or test assertion drift detected. The export fixture changed externally while this audit ran; no source writes by this audit caused that change, and the newer fixture is not covered by the pinned-copy test results. All existing repository changes were preserved.
