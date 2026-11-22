# LC59 - Independent whole-product audit

review_id/task_id: LC59; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit at audit start: `7215f47506afe5f51587cb517af2a4657bad7e69`.
head_commit at final verification: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus existing working-tree changes.
requirements_version: Shared Product Contract v2.0; full WEB-contract.md sections 1-24, inherited M1 contract and DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED** - two verified MAJOR and two verified MINOR findings remain. No release approval.
recommended_action: responsible regions fix the findings with regressions and finish the prioritized roadmap. NEED_DECISION: NONE for these fixes and specified features.

## Snapshot and review coverage

Read the required private runtime profile and product/technical contracts. Examined LC58, git status/log, HEAD-to-working-tree source changes, API store/auth changes, importer missing-key handling, report controls and app integration, schema/student metadata changes, collector CAS/retry behavior, rational serialization and scoring entrypoints. Review is incremental across the whole product; it is not a fresh line-by-line reading of every unchanged file. Full suite exercises domain, schema, storage, student, report, teacher/builder, bank, collect, import, glue and UI; browser checks are separately identified.

Execution copy: `%USERPROFILE%/AppData/Local/Temp/LC59-r9_zy_yw`. Copied current source/tests/docs/scripts/assets/root configs/installed node_modules and ops/publish.py into a normal temporary directory; no branch/worktree or install. Build and test writes occurred there. `source-hashes.json` records 540 selected runtime/test/build/public/style/root inputs; `git-status-before.txt` records pre-existing changes. All 540 are identical to LC58's execution inputs and remain byte-identical at final verification. HEAD advanced during this audit to 2019a03; the commit introduces no delta in the checked runtime/build/public/style/dependency/root paths. The tested working-tree bytes remain applicable; a commit title is not independent approval evidence.

files_reviewed: src/api/{handle,types,auth,store/memory,store/neon}.ts; src/import/{docx/segmentation,pdf/manual}.ts; src/report/{index,view}.ts; src/schema/types.ts; src/student/area.ts; src/collect/index.ts; src/domain/{index,rational,scoreAttempt}.ts; src/app/main.ts report integration; scripts/{build.js,web-build.ts}; associated existing regression coverage and roadmap symbol search across src. Fresh independent probes were inspected and copied from LC58's execution copy, then executed anew. Their LC51 filenames are retained for reproducibility, not inherited PASS evidence.

Only `docs/reviews/LOOP-59-codex.md` is intentionally created/modified in the repository by this audit. Existing changes are preserved. No code fix, dependency addition, commit, deploy or production write.

## Findings

### LC59-F01 — MAJOR — Concurrent dispatch bypasses the durable retry budget

- finding_id: LC59-F01; status: VERIFIED; continues LC58-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: retry/backoff checks do not reject an active `sending` record. CAS increments generation without consuming a dispatch; retryCount increments only after a retryable failure returns. Later callers can send while earlier transports remain pending.
- reproduction_steps: from the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating, create memory-backed durable storage, start/finalize an attempt, enqueue a synthetic endpoint. Invoke drainOutbox six times five milliseconds apart while send promises remain unresolved; inspect outbox, then resolve HTTP503 responses.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All reproducer assertions passed; no external service was contacted.
- expected: Shared §3 / WEB §7 require bounded durable retries, at most five dispatches including the first; a concurrent caller must honor an active sending lease.
- impact: overlapping callers/tabs or interrupted sends can exceed the persistent budget. Server deduplication does not enforce this client budget.
- minimal_fix: atomically reserve both a consumed dispatch and a durable sending lease through storage CAS before transport. Reject/coalesce while lease is live; retain consumed attempts across reload/expiry. Preserve payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: delayed concurrent calls through multiple storage instances; one live lease, at most five sends; reload/crash between send and receipt; expired lease recovery; response loss retry uses identical body/tuple; stale callbacks cannot downgrade confirmation or mutate final.

### LC59-F02 — MINOR — Rational parser rejects formatter output

- finding_id: LC59-F02; status: VERIFIED; continues LC58-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parseFractionString of that output throws SyntaxError at the 200-character cap.
- expected: M1 §4.1 requires the parser to be the strict inverse of the formatter over the published rational API domain.
- actual: constructor/formatter accept a value the parser rejects; fresh assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring failure demonstrated within the approved 1000-question limit; not a scoring blocker.
- minimal_fix: enforce hostile-input limits at DTO/payload boundaries while retaining the rational inverse API. Restricting the rational domain instead requires consistent constructor/formatter/parser restrictions and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths 199/200/201; zero; noncanonical rejection; both inverse directions.

### LC59-F03 — MINOR — A nonexistent exam can be assigned

- finding_id: LC59-F03; status: VERIFIED; continues LC58-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection; no trusted ctx.catalog membership check precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` seeds MemoryStore with an active teacher, valid hashed session and owned class. Use empty catalog and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200, success=true, one assignment persisted**; both response and stored count are asserted.
- expected: WEB §§19/22 permit available own/shared published exams or trusted static catalog exams; unknown exams must fail without a write.
- impact: creates orphan assignments leading students to unavailable exams; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before save; return established NOT_FOUND/INVALID_EXAM for unknown IDs.
- regression_test: nonexistent/deleted exam creates no assignment; own/shared published and catalog exams work; foreign owner stays FORBIDDEN; retain no-due-date semantics.

### LC59-F04 — MAJOR — Report filter, navigation and retry-wrong are absent in the app

- finding_id: LC59-F04; status: VERIFIED; continues LC58-F04.
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

Environment: Windows PowerShell; Node v24.14.0; installed TypeScript 7.0.2; Python 3.11.0; existing CDP browser harness. npm.cmd/npx.cmd execute the requested npm/npx commands. Paths below are relative to the execution copy. Logs redirected by PowerShell are UTF-16. All checks below ran freshly; probe exit0 verifies the defect assertions, not a fix.

| Command | Exit | Result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 files emitted/validated/promoted to temporary dist; `build.log`. DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; `tsc.log`. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; `tsc-web.log`. |
| `npm test` (after build) | 0 | **1610 tests / 345 suites; pass1610/fail0/skip0/cancelled0/todo0**; 30647.4668ms; `npm.log`. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | **104 tests / 5 suites; pass104/fail0/skip0/cancelled0/todo0**; 43733.9625ms; `claude.log`. Actual browser and local simulated-service checks. Git environment points to original repo for read-only queries. |
| `node LC51-probes.mjs` | 0 | F01/F02/F03 reproduced; all six section 23 actions UNKNOWN_ACTION; `probes.log`. Local synthetic API/storage only. |
| `node LC51-browser-probe.mjs` | 0 | Fresh built dist under /Cunata/: cards2/filterfalse/navfalse/retryfalse; `browser-probe.log`. Actual browser; synthetic hidden-file fixture. Browser/context/server closed. |
| `node LC51-differential.mjs` | 0 | 1632 production total/max and per-section scores match independent oracle expectations; `differential.log`. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip; 1632 fixtures, 5849 maxima configs, 9 negative controls; 1.8909s reported duration; `oracle.log`. |

Build completed before npm tests. No source/assertion changes or test skips were needed. Independent scoring comparison checks total/max and section scores; it does not independently certify every DOM/status/order/raw field.

## coverage_gaps

- M1: full suite and fresh independent score comparison pass. F02 is a public rational inverse failure, not demonstrated incorrect scoring within the approved 1000-question cap.
- M2/M3: existing unit/VM/browser coverage exercises restoration, timer, shuffle, CAS/finalization, two tabs, report/download and builder/bank behavior. No exhaustive fresh quota/private-mode/migration/backup/delete/media-offline recovery matrix; no new full class/PIN journey. F03/F04 remain.
- M4: F01 remains despite suite success. Live Google/Neon/Vercel CORS/write/receipt/readback/dedupe NOT_RUN; no production endpoint or credentials used. Local SQL/service simulations do not establish real database concurrency or trusted server grading.
- M5: current DOCX/PDF-manual changes preserve unresolved II keys rather than inventing false. Full real-document corpus for merged tables/multicolumn layout/images/unsupported OMML/encrypted or scan PDFs NOT_RUN. Approved PDF scope is preview/manual, not automatic extraction or OCR.
- M6: selected actual browser checks ran. OS Telex/VNI, Firefox/WebKit, assistive technology, fresh manual screenshot inspection, axe/Lighthouse and p95 performance NOT_RUN. Selected contrast assertions are not a whole-product WCAG AA certification. Full Git-history secret scanning/dependency audit NOT_RUN.
- section 23 NOT_IMPLEMENTED: addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults all return UNKNOWN_ACTION in fresh probes. Existing students table/types and optional student_id do not implement roster CRUD, unique hashed PINs, server lockout, roster-bound identity or cross-machine reports. No roster-based unsubmitted rows.
- section 24: source search finds report filter/nav/retry only in isolated report renderer, absent from actual app (F04). No relevant runtime entrypoints for rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. System dark CSS does not implement a persisted three-way theme control.
- Supplemental test/codex-check .mjs suite NOT_RUN in LC59; no previous PASS is carried forward. No owner production acceptance performed.

## Missing roadmap features, priority order

1. **P1 reliability:** durable dispatch reservation/lease/budget (F01, src/collect); nonexistent-exam assignment rejection (F03, src/api); rational inverse API (F02, src/domain). Add concurrent/reload/roundtrip regressions.
2. **P1 section 23:** owner-scoped roster CRUD; unique hashed four-digit PINs; five-failure/10-minute lockout; studentToken; roster-bound candidate/student_id; cross-machine myResults; teacher not-submitted rows. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 sections 24.1/24.5:** integrate report filters, navigation and retry-wrong (F04); independent local practice without teacher sends or original-final mutation. Regions src/app, src/report, src/student.
4. **P1 sections 24.2/24.3:** teacher per-student full submission viewer and per-question correctness, I option distributions, three common wrong III answers from valid submissions. Regions src/api, src/teacher, src/report.
5. **P1 section 24.4:** PIN-backed history, SVG score chart and accessible text table. Regions src/student, src/api.
6. **P2 sections 24.6/24.7:** teacher printing with blank answer sheet and separate key page; persisted Light/Dark/System TopBar selector and contrast verification. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** live-service verification; recovery/privacy/import corpus; OS IME/multiple browsers/AT/performance; owner acceptance with changelog/rollback. All regions/glue. Retain custom-v1 and manual PDF; do not invent official presets or automatic OCR.

NEED_DECISION: NONE for the listed fixes and specified features. Restoring the documented rational inverse needs no new business policy; restricting the public rational domain instead would require contract revision.

tools_research: NOT_REQUESTED. privacy_notes: synthetic fixtures; no private instruction text, credentials or real student data in report.

Final snapshot verification: HEAD 2019a03fabd3225b5e8bc3a602d0c37a4a94c74f; all 540 recorded selected inputs unchanged since the LC59 execution copy. Evidence remains limited to these tested bytes and the checks described above.
