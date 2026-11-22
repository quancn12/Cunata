# LC58 - Independent whole-product audit

review_id/task_id: LC58; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69` (main plus existing working-tree changes).
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24 and settled decisions; inherited M1 signatures; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Four verified open findings: two MAJOR and two MINOR. Not release approval.
recommended_action: fix the responsible regions with regressions; complete the specified roadmap and acceptance checks. NEED_DECISION: NONE for these fixes/features.

## Snapshot, scope and method

Read the required runtime profile and product/technical contracts, inherited M1 contract and design requirements; examined LC57 review, git log/status and HEAD-to-working-tree source diff. HEAD has not advanced since LC57. Compared 540 selected runtime/test/build/public/style/root input files against LC57's execution copy: only three test/codex-check browser JSON evidence files differ; no runtime source delta in this comparison. Review is incremental across the whole product with fresh checks, not a new line-by-line reading of every unchanged file.

Execution snapshot: `%USERPROFILE%/AppData/Local/Temp/LC58-_mjr8vvq`. Copied current source, tests, docs, installed node_modules, scripts/assets/configs/root HTML/README and ops/publish.py into a normal temporary directory. No branch/worktree/install. All test/build/probe writes run there. `source-hashes.json` captures 540 selected input hashes; `git-status-before.txt` records existing workspace changes. LC51-named probes were read, copied from LC57 and executed anew; their names do not imply inherited test evidence.

files_reviewed: current diff in src/api/{handle,types,store/memory,store/neon}.ts, src/import/{docx/segmentation,pdf/manual}.ts, src/report/view.ts, src/schema/types.ts, src/student/area.ts; corresponding API/schema/import/report/student regressions. Rechecked collector dispatch/retry, rational serialization, report model recomputation and built-app rendering, API authentication/ownership/result submission/storage, storage CAS/finalization, student/domain integration, teacher assignment/no-due controls and roadmap entrypoints. Full npm suite covers domain/acceptance/schema/storage/student/report/builder/bank/collector/import/glue/UI plus selected actual browser cases. Mock/VM and live-browser evidence are distinguished below.

Only `docs/reviews/LOOP-58-codex.md` is intentionally created/modified in the repository by this audit. Existing changes are preserved. No product fix, dependency addition, commit, deploy or production write.

## Findings

### LC58-F01 — MAJOR — Concurrent dispatch bypasses the durable retry budget

- finding_id: LC58-F01; status: VERIFIED; continues LC57-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: retry/backoff checks do not reject an active `sending` record. CAS increments generation without consuming a dispatch; retryCount increments only after a retryable failure returns. Later callers can send while earlier transports remain pending.
- reproduction_steps: from the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating, create memory-backed durable storage, start/finalize an attempt, enqueue a synthetic endpoint. Invoke drainOutbox six times five milliseconds apart while send promises remain unresolved; inspect outbox, then resolve HTTP503 responses.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All reproducer assertions passed; no external service was contacted.
- expected: Shared §3 / WEB §7 require bounded durable retries, at most five dispatches including the first; a concurrent caller must honor an active sending lease.
- impact: overlapping callers/tabs or interrupted sends can exceed the persistent budget. Server deduplication does not enforce this client budget.
- minimal_fix: atomically reserve both a consumed dispatch and a durable sending lease through storage CAS before transport. Reject/coalesce while lease is live; retain consumed attempts across reload/expiry. Preserve payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: delayed concurrent calls through multiple storage instances; one live lease, at most five sends; reload/crash between send and receipt; expired lease recovery; response loss retry uses identical body/tuple; stale callbacks cannot downgrade confirmation or mutate final.

### LC58-F02 — MINOR — Rational parser rejects formatter output

- finding_id: LC58-F02; status: VERIFIED; continues LC57-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parseFractionString of that output throws SyntaxError at the 200-character cap.
- expected: M1 §4.1 requires the parser to be the strict inverse of the formatter over the published rational API domain.
- actual: constructor/formatter accept a value the parser rejects; fresh assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring failure demonstrated within the approved 1000-question limit; not a scoring blocker.
- minimal_fix: enforce hostile-input limits at DTO/payload boundaries while retaining the rational inverse API. Restricting the rational domain instead requires consistent constructor/formatter/parser restrictions and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths 199/200/201; zero; noncanonical rejection; both inverse directions.

### LC58-F03 — MINOR — A nonexistent exam can be assigned

- finding_id: LC58-F03; status: VERIFIED; continues LC57-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection; no trusted ctx.catalog membership check precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` seeds MemoryStore with an active teacher, valid hashed session and owned class. Use empty catalog and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200, success=true, one assignment persisted**; both response and stored count are asserted.
- expected: WEB §§19/22 permit available own/shared published exams or trusted static catalog exams; unknown exams must fail without a write.
- impact: creates orphan assignments leading students to unavailable exams; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before save; return established NOT_FOUND/INVALID_EXAM for unknown IDs.
- regression_test: nonexistent/deleted exam creates no assignment; own/shared published and catalog exams work; foreign owner stays FORBIDDEN; retain no-due-date semantics.

### LC58-F04 — MAJOR — Report filter, navigation and retry-wrong are absent in the app

- finding_id: LC58-F04; status: VERIFIED; continues LC57-F04.
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

Environment: Windows PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0, existing Chrome/Edge CDP support. npm.cmd/npx.cmd execute the requested npm/npx commands. Artifact paths below are relative to the execution snapshot; PowerShell redirected logs are UTF-16. Probe exit0 means successful assertions reproducing a defect, not a fix.

| Command | Exit | Actual result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 files emitted/validated/promoted into temporary dist; `build.log`. DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; `tsc.log`. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; `tsc-web.log`. |
| `npm test` initial | 1 | 1610 tests / 345 suites, pass1596/fail12/skip2/cancelled0/todo0; 28570.189ms; `npm.log`. Ran concurrently with initial build before dist existed; failures concern missing dist and active staging. Invalid setup for release judgment, not PASS. |
| `npm test` after build completed | 0 | **1610 tests / 345 suites, pass1610/fail0/skip0/cancelled0/todo0**; 29722.8577ms; `npm-rerun.log`. Natural completion. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 tests / 5 suites, pass104/fail0/skip0/cancelled0/todo0; 47614.0813ms; `claude.log`. Actual browser and local simulated-service checks; GIT_DIR/GIT_WORK_TREE point to original repo for read-only Git queries. |
| `node LC51-probes.mjs` | 0 | Reproduces F01/F02/F03; six section 23 actions return UNKNOWN_ACTION; `probes.log`. Synthetic local storage/API only. |
| `node LC51-browser-probe.mjs` | 0 | Fresh built dist served under /Cunata/: cards2/filterfalse/navfalse/retryfalse; `browser-probe.log`. Actual browser, synthetic hidden-file fixture, server/context/browser closed. |
| `node LC51-differential.mjs` | 0 | 1632 production total/max and per-section scores match independent oracle expectations; `differential.log`. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip; 1632 fixtures, 5849 maxima configs, 9 negative controls; 1.419s; `oracle.log`. |

The initial npm/build overlap was an audit setup mistake. The complete rerun occurred after build promotion, with no concurrent LC58 build, and passed without changing source or assertions. Two initial skipped browser cases are covered by the zero-skip rerun. LC57's prior CK16 browser failure did not recur in this full run; this does not prove every timing/resource condition. No test failure was hidden or downgraded.

## coverage_gaps

- M1: fresh full suite plus independent score/max/per-section differential. Differential does not independently compare every DOM/status/order/raw field. F02 is a public rational roundtrip defect, not a demonstrated score error under the approved 1000-question cap.
- M2/M3: full suite exercises CAS, finalization, timer/shuffle restoration, bank/builder/versioning, reports/downloads and selected browser flows. No exhaustive new quota/private-mode/migration/backup/delete/recovery/media-offline matrix. F03/F04 remain.
- M4: F01 remains. Client score range/sum validation is not trusted server grading. Live Google/Neon/Vercel CORS/write/receipt/readback/deduplication NOT_RUN: no production credentials/endpoints used. SQL concurrency tests simulate the database. No trusted-assessment or production acceptance claim.
- M5: unresolved II keys are preserved in current importer code/regressions. PDF is approved preview/manual, not automatic extraction/OCR. Exhaustive real-document corpus across merged tables, multicolumn text, images, unsupported OMML, encrypted/scan/corrupt PDFs NOT_RUN.
- M6: npm includes actual CDP browser tests for selected offline/update/storage/UI cases; extra F04 browser probe ran. No fresh manual screenshot-by-screenshot review, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse or p95 measurement. Full history secret scan and independent dependency audit NOT_RUN. Selected contrast tests do not certify every screen at WCAG AA.
- section 23 NOT_IMPLEMENTED: six fresh API probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table/type and optional student_id do not implement roster CRUD, unique hashed PINs, lockout, roster-bound identity or cross-machine reports. Teacher results cannot show roster students who have not submitted.
- section 24 source search found no rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme in relevant runtime paths. Report filter/nav/retry are isolated renderer controls, absent in actual app (F04). System dark CSS does not implement the persisted three-way theme switch.
- Supplemental Codex .mjs suite NOT_RUN in LC58; no prior PASS or timeout result is carried forward as current evidence. The required npm/typecheck/build and listed probes ran freshly.

## Missing roadmap features, priority order

1. **P1 reliability:** durable dispatch reservation/lease/budget (F01, src/collect); nonexistent-exam assignment rejection (F03, src/api); rational inverse API (F02, src/domain). Add concurrent/reload/roundtrip regressions.
2. **P1 section 23:** owner-scoped roster CRUD; unique hashed four-digit PINs; five-failure/10-minute lockout; studentToken; roster-bound candidate/student_id; cross-machine myResults; teacher not-submitted rows. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 sections 24.1/24.5:** integrate report filters, navigation and retry-wrong (F04); independent local practice without teacher sends or original-final mutation. Regions src/app, src/report, src/student.
4. **P1 sections 24.2/24.3:** teacher per-student full submission viewer and per-question correctness, I option distributions, three common wrong III answers from valid submissions. Regions src/api, src/teacher, src/report.
5. **P1 section 24.4:** PIN-backed history, SVG score chart and accessible text table. Regions src/student, src/api.
6. **P2 sections 24.6/24.7:** teacher printing with blank answer sheet and separate key page; persisted Light/Dark/System TopBar selector and contrast verification. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** live-service verification; recovery/privacy/import corpus; OS IME/multiple browsers/AT/performance; owner acceptance with changelog/rollback. All regions/glue. Retain custom-v1 and manual PDF; do not invent official presets or automatic OCR.

NEED_DECISION: NONE for the listed fixes and specified features. Restoring the documented rational inverse needs no new business policy; restricting the public rational domain instead would require contract revision.

tools_research: NOT_REQUESTED. privacy_notes: synthetic fixtures, no credentials/real student data/private instruction text in report.

Snapshot verification before report: HEAD remains 7215f47506afe5f51587cb517af2a4657bad7e69; all 540 recorded selected inputs are byte-identical to audit start. Runtime scope remains applicable; generated test evidence/operational documents are not product fixes.
