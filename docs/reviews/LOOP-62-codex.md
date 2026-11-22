# LC62 - Independent whole-product audit

review_id: LC62; task_id: LC62; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus existing working-tree changes.
requirements_version: Shared Product Contract v2.0 (read in full); WEB-contract.md sections 1-24 (read in full); inherited M1 scoring API; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Two verified MAJOR and two verified MINOR findings persist. All checks executed in LC62 pass, including the full npm suite; passing tests do not cover the four independently reproduced defects. No release approval.
NEED_DECISION: NONE for the fixes and specified roadmap features below.

## Snapshot, files_reviewed and method

Independent incremental whole-product audit from LC61: inspected git status, log and HEAD-to-working-tree source diff. HEAD is unchanged. Compared all 552 selected source/test/build/asset/config inputs against LC61: 550 are identical; the only differences are pre-existing browser evidence JSON files `test/codex-check/cx/F02-browser.json` and `test/codex-check/cx/F03-browser.json`. No runtime or assertion changes since LC61 were detected. These evidence JSON changes are not new execution evidence for LC62.

Direct source inspection covered changed API handler/types/MemoryStore/NeonStore account and ownership operations, importer unresolved answer keys, isolated report controls, schema attempt metadata and student-name handling. Rechecked domain barrel/rational/scoring/maxima, storage finalize/outbox transaction, student controller, teacher/bank entrypoints, app report composition and collector dispatch/retry/configuration. Repository-wide symbol searches checked integration of sections 23-24. The full tests exercise all product regions; unchanged production code was not freshly read line by line in its entirety. This is an incremental audit, not an exhaustive proof of every path.

Execution copy: `%USERPROFILE%/AppData/Local/Temp/LC62-4g5_atq3`. Current src/test/scripts/docs/public/styles/apps-script and installed node_modules copied into a normal temporary directory, with root build/config/README files and ops/publish.py. No branch/worktree, installation, dependency change, commit, deploy or production write. Build and test outputs remain in that execution copy. `source-hashes.json` records 552 selected inputs; `git-status-before.txt` records pre-existing repository changes. Reproducer scripts copied from LC61 were inspected before execution and executed anew; LC51 filenames are retained only for reproducibility.

Only `docs/reviews/LOOP-62-codex.md` is intentionally created/modified in the repository by this audit. Existing changes are preserved.

## Findings



### LC62-F01 — MAJOR — Concurrent dispatch bypasses the durable retry budget

- finding_id: LC62-F01; status: VERIFIED; continues LC61-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: retry/backoff checks do not reject an active `sending` record. CAS increments generation without consuming a dispatch; retryCount increments only after a retryable failure returns. Later callers can send while earlier transports remain pending.
- reproduction_steps: from the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating, create memory-backed durable storage, start/finalize an attempt, enqueue a synthetic endpoint. Invoke drainOutbox six times five milliseconds apart while send promises remain unresolved; inspect outbox, then resolve HTTP503 responses.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All reproducer assertions passed; no external service was contacted.
- expected: Shared §3 / WEB §7 require bounded durable retries, at most five dispatches including the first; a concurrent caller must honor an active sending lease.
- impact: overlapping callers/tabs or interrupted sends can exceed the persistent budget. Server deduplication does not enforce this client budget.
- minimal_fix: atomically reserve both a consumed dispatch and a durable sending lease through storage CAS before transport. Reject/coalesce while lease is live; retain consumed attempts across reload/expiry. Preserve payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: delayed concurrent calls through multiple storage instances; one live lease, at most five sends; reload/crash between send and receipt; expired lease recovery; response loss retry uses identical body/tuple; stale callbacks cannot downgrade confirmation or mutate final.

### LC62-F02 — MINOR — Rational parser rejects formatter output

- finding_id: LC62-F02; status: VERIFIED; continues LC61-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parseFractionString of that output throws SyntaxError at the 200-character cap.
- expected: M1 §4.1 requires the parser to be the strict inverse of the formatter over the published rational API domain.
- actual: constructor/formatter accept a value the parser rejects; fresh assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring failure demonstrated within the approved 1000-question limit; not a scoring blocker.
- minimal_fix: enforce hostile-input limits at DTO/payload boundaries while retaining the rational inverse API. Restricting the rational domain instead requires consistent constructor/formatter/parser restrictions and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths 199/200/201; zero; noncanonical rejection; both inverse directions.

### LC62-F03 — MINOR — A nonexistent exam can be assigned

- finding_id: LC62-F03; status: VERIFIED; continues LC61-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection; no trusted ctx.catalog membership check precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` seeds MemoryStore with an active teacher, valid hashed session and owned class. Use empty catalog and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200, success=true, one assignment persisted**; both response and stored count are asserted.
- expected: WEB §§19/22 permit available own/shared published exams or trusted static catalog exams; unknown exams must fail without a write.
- impact: creates orphan assignments leading students to unavailable exams; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before save; return established NOT_FOUND/INVALID_EXAM for unknown IDs.
- regression_test: nonexistent/deleted exam creates no assignment; own/shared published and catalog exams work; foreign owner stays FORBIDDEN; retain no-due-date semantics.

### LC62-F04 — MAJOR — Report filter, navigation and retry-wrong are absent in the app

- finding_id: LC62-F04; status: VERIFIED; continues LC61-F04.
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

Environment: Windows PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0, existing Chrome/Edge CDP harness. The execution copy is a plain temporary directory, not a Git branch or worktree. npm.cmd/npx.cmd run the requested npm/npx commands on Windows. All commands below ran in the execution copy. Log paths are relative to it; redirected PowerShell logs are UTF-16. Defect probe exit 0 means the asserted defect was reproduced, not fixed.

| Command | Exit | Result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 emitted/validated files, staged and promoted in execution copy; `build.log`; DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; `tsc.log`. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; `tsc-web.log`. |
| `npm test` | 0 | 1610 tests /345 suites, pass1610/fail0/skip0/cancelled0/todo0; 29364.8659ms; `npm.log`. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 tests /5 suites, pass104/fail0/skip0/cancelled0/todo0; 40916.333ms; `claude.log`. Real browser with local simulated services. |
| `node LC51-probes.mjs` | 0 | F01/F02/F03 reproduced; six section23 actions return UNKNOWN_ACTION; `probes.log`. Synthetic durable-storage adapter and API fixtures. |
| `node LC51-browser-probe.mjs` | 0 | Fresh built dist under /Cunata/: cards2/filterfalse/navfalse/retryfalse; `browser-probe.log`. Real browser; hidden-file synthetic fixture; resources closed. |
| `node LC51-differential.mjs` | 0 | 1632 production total/max and per-section score/max results match independent expected values; `differential.log`. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip; 1632 fixtures, 5849 maxima configurations, 9 negative controls; 2.3313s reported duration; `oracle.log`. |

Build completed before npm test. The separate browser suite and defect browser probe ran after the full npm suite completed. No assertions, source or test runner behavior were changed. For read-only git lookups in the separate browser suite, GIT_DIR/GIT_WORK_TREE pointed at the original repository; tested files were the execution copy. LC61 was green and this fresh LC62 run is also green. The older LC60 CK16-F01 waiting-worker failure did not recur; these runs do not establish that intermittent failure's root cause or justify a claim that a code fix occurred.

## coverage_gaps

- M1: fresh full tests and independent score/max comparisons pass. F02 remains a rational public API inverse defect; no scoring defect demonstrated within the approved 1000-question limit. Differential comparison does not certify every DOM/status/raw/order field.
- M2/M3: unit/VM/browser checks cover selected restoration, timer, shuffle, finalization, reporting, builder and bank behavior. A fresh exhaustive quota/private-mode/migration/backup/delete and media-offline matrix was NOT_RUN. No new full class/PIN journey exists to certify.
- M4: F01 persists despite suite success. Live Google/Neon/Vercel CORS/write/receipt/readback/deduplication NOT_RUN: no credentials or production endpoints used. Local HTTP/SQL simulation is not evidence of actual Neon concurrency or live trusted grading.
- M5: source diff preserves unresolved II keys as absent rather than inventing false. Existing synthetic importer regressions run in npm test. Full real-document corpus covering merged tables, multicolumn layouts, media, unsupported OMML, encrypted/scan PDF NOT_RUN. Approved PDF scope remains preview/manual.
- M6: real browser checks executed. OS Telex/VNI, Firefox/WebKit, assistive technology, fresh manual screenshot review, axe and Lighthouse NOT_RUN. Selected contrast and responsive checks do not certify every screen or WCAG AA. Unit/browser timing assertions are not an independent input-to-paint p95 <100ms benchmark.
- Section23 NOT_IMPLEMENTED: fresh API probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. Students table/types and optional student_id do not implement roster CRUD, PIN hashing/uniqueness, lockout, roster-bound identity, cross-machine reports or unsubmitted roster rows.
- Section24 integration gap: report filter/nav/retry controls exist only in the isolated renderer (F04). No runtime symbols found for rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. System dark CSS does not provide a persisted Light/Dark/System selector.
- Supplemental test/codex-check .mjs suite, full Git-history secret scan and dependency audit NOT_RUN; no prior PASS imported. Owner production acceptance NOT_RUN. Historical CK16-F01 intermittency is not explained by this passing run.

## Missing roadmap features, priority order

1. **P1 reliability:** durable dispatch reservation/lease and persistent bounded retry budget (F01, src/collect); reject nonexistent/deleted exam assignments (F03, src/api); restore rational formatter/parser inverse (F02, src/domain). Add concurrent/reload/roundtrip regressions. Monitor the historical CK16-F01 waiting-worker intermittency with retained failing/passing evidence.
2. **P1 section23:** owner-scoped roster CRUD; unique hashed four-digit PINs; five-failure/ten-minute server lockout; studentToken; roster-bound candidate/student_id; cross-machine myResults; teacher rows for students who have not submitted. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 sections24.1/24.5:** integrate filters/navigation and retry-wrong in the actual app (F04). Independent local practice must not send to teachers or mutate original finals. Regions src/app, src/report, src/student.
4. **P1 sections24.2/24.3:** teacher per-student full submission viewer and valid-submission statistics: per-question correctness, I option distributions, top three wrong III answers. Regions src/api, src/teacher, src/report.
5. **P1 section24.4:** PIN-backed history, SVG score chart and accessible text table. Regions src/student, src/api.
6. **P2 sections24.6/24.7:** teacher print flow with blank answer sheet and separate key page; persisted Light/Dark/System TopBar selector and contrast checks. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** live-service verification, recovery/privacy/import corpus, OS IME/multiple browsers/assistive technology/performance and owner acceptance with changelog/rollback. All regions/glue. Retain approved custom-v1 and manual PDF scope; do not invent official presets or automatic OCR.

recommended_action: return the four verified findings to their owning workers; implement and test the missing approved features, then rerun gates and independent integration review. Do not approve release based only on green tests.
NEED_DECISION: NONE for listed fixes/features. Restricting the public rational domain instead of restoring its documented inverse would require a contract revision; that alternative is not required by this review.
tools_research: NOT_REQUESTED.
privacy_notes: synthetic data only; no private instruction text, credentials or real student data in the report.

Final snapshot: HEAD unchanged; all 552 selected inputs remained byte-identical to the LC62 pre-run manifest, including the two browser evidence JSON files. `final-snapshot.json` records the comparison. No tested source/build/config drift detected.
