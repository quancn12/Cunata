# LC64 - Independent whole-product audit

review_id: LC64; task_id: LC64; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus pre-existing working-tree changes.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24 (read in full), inherited M1 scoring contract; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Four independently reproduced findings: two MAJOR and two MINOR. No release approval. Fresh full suite, both typechecks, build and supplemental browser/service tests passed; these do not resolve the verified findings.
NEED_DECISION: NONE for the required fixes and approved roadmap. Retain custom-v1 and approved PDF preview/manual scope.

## Snapshot, files_reviewed and method

Incremental whole-product review from LC63. Inspected git status/log and HEAD-to-working-tree source diff. HEAD remains unchanged. Of the 725 common paths in LC63's input manifest, only `test/codex-check/fixtures/bank-backup.json` changed; no common runtime/assertion source changed. The only previous manifest path not copied is `scratch_csv_debug.mjs`, an unrelated temporary debug helper; it is not a product input. Current `ops/publish.py` is included and hashed. Current input hashes, pre-run git status and final drift check are retained with execution evidence.

Execution copy: `%USERPROFILE%/AppData/Local/Temp/LC64-76tc617n`, an ordinary temporary execution directory, not a branch or Git worktree. Copied current src/test/scripts/docs/public/styles/apps-script, installed node_modules, root HTML/JSON/config/README and ops/publish.py. Tests and build run there to contain generated artifacts. Inspected and reused the retained LC51-named reproducers from LC63, executing every listed probe anew. Their filenames and synthetic IDs are historical, not evidence dates. Only `docs/reviews/LOOP-64-codex.md` is intentionally written in the repository. No installation, dependency change, code fix, commit, deploy or real service write.

files_reviewed: current source/diff for src/api/{handle,auth,index,types,store/memory,store/neon}.ts; src/collect/{index,appsScript}.ts; src/domain/{index,rational,scoreAttempt,judge}.ts; src/storage/index.ts; src/student/{index,area}.ts; src/report/{index,view}.ts; src/app/main.ts; src/offline/service-worker.ts; src/import/{docx/segmentation,pdf/manual}.ts; src/schema/types.ts; scripts/build.js; package.json and configs; test/report/view/reportFilterNav.test.ts; supplemental browser harness; score differential and defect-probe implementations. Repository-wide symbols/callers checked teacher assignment/result flows and sections 23-24. Current diff contains atomic account creation/password/status and owner-scoped exam deletion changes, importer missing-key preservation, student-name trimming, report controls, metadata and regressions; these were assessed with fresh tests. Full tests exercise all product regions. Unchanged files were not all reread line by line; this is not exhaustive proof of every path.

Fresh score differential compared production total/max and all section score/max fields against 1,632 independent expected cases; no disagreement. Exact-character III equality, unanswered II handling, rational sums and immutable-final/CAS paths were inspected. This does not establish live trusted server grading: API result ingestion validates client fields but this audit does not certify client scores as authoritative for secure examinations.

## Findings




### LC64-F01 — MAJOR — Concurrent dispatch bypasses the durable retry budget

- finding_id: LC64-F01; status: VERIFIED; continues LC63-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: retry/backoff checks do not reject an active `sending` record. CAS increments generation without consuming a dispatch; retryCount increments only after a retryable failure returns. Later callers can send while earlier transports remain pending.
- reproduction_steps: from the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating, create memory-backed durable storage, start/finalize an attempt, enqueue a synthetic endpoint. Invoke drainOutbox six times five milliseconds apart while send promises remain unresolved; inspect outbox, then resolve HTTP503 responses.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All reproducer assertions passed; no external service was contacted.
- expected: Shared §3 / WEB §7 require bounded durable retries, at most five dispatches including the first; a concurrent caller must honor an active sending lease.
- impact: overlapping callers/tabs or interrupted sends can exceed the persistent budget. Server deduplication does not enforce this client budget.
- minimal_fix: atomically reserve both a consumed dispatch and a durable sending lease through storage CAS before transport. Reject/coalesce while lease is live; retain consumed attempts across reload/expiry. Preserve payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: delayed concurrent calls through multiple storage instances; one live lease, at most five sends; reload/crash between send and receipt; expired lease recovery; response loss retry uses identical body/tuple; stale callbacks cannot downgrade confirmation or mutate final.

### LC64-F02 — MINOR — Rational parser rejects formatter output

- finding_id: LC64-F02; status: VERIFIED; continues LC63-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parseFractionString of that output throws SyntaxError at the 200-character cap.
- expected: M1 §4.1 requires the parser to be the strict inverse of the formatter over the published rational API domain.
- actual: constructor/formatter accept a value the parser rejects; fresh assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring failure demonstrated within the approved 1000-question limit; not a scoring blocker.
- minimal_fix: enforce hostile-input limits at DTO/payload boundaries while retaining the rational inverse API. Restricting the rational domain instead requires consistent constructor/formatter/parser restrictions and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths 199/200/201; zero; noncanonical rejection; both inverse directions.

### LC64-F03 — MINOR — A nonexistent exam can be assigned

- finding_id: LC64-F03; status: VERIFIED; continues LC63-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection; no trusted ctx.catalog membership check precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` seeds MemoryStore with an active teacher, valid hashed session and owned class. Use empty catalog and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200, success=true, one assignment persisted**; both response and stored count are asserted.
- expected: WEB §§19/22 permit available own/shared published exams or trusted static catalog exams; unknown exams must fail without a write.
- impact: creates orphan assignments leading students to unavailable exams; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before save; return established NOT_FOUND/INVALID_EXAM for unknown IDs.
- regression_test: nonexistent/deleted exam creates no assignment; own/shared published and catalog exams work; foreign owner stays FORBIDDEN; retain no-due-date semantics.

### LC64-F04 — MAJOR — Report filter, navigation and retry-wrong are absent in the app

- finding_id: LC64-F04; status: VERIFIED; continues LC63-F04.
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

Environment: Windows PowerShell; Node v24.14.0; installed TypeScript 7.0.2; Python 3.11.0; existing Chrome/Edge CDP harness. `npm.cmd`/`npx.cmd` execute the requested npm/npx commands on Windows. All executable checks ran in the temporary execution copy. Paths below are relative to that directory. PowerShell redirected logs are UTF-16. Probe exit 0 means the assertion reproduced a defect, not that it was fixed.

| Command | Exit | Actual result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 files emitted/validated, staging promoted only in execution copy; `build.log`. DEP0190 deprecation warning retained. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; `tsc.log`. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; `tsc-web.log`. |
| `npm test` | 0 | 1610 tests /345 suites; pass1610/fail0/skip0/cancelled0/todo0; 29418.9528ms; `npm.log`. One full run, no rerun needed. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 tests /5 suites; pass104/fail0/skip0/cancelled0/todo0; 46932.1877ms; `claude.log`. Includes design.test.mjs, real browser and local simulated services. |
| `node LC51-probes.mjs` | 0 | Fresh F01/F02/F03 assertions and six UNKNOWN_ACTION section23 probes; `probes.log`. Durable-port fixture uses MemoryTransactionAdapter; API uses MemoryStore, no external service. |
| `node LC51-browser-probe.mjs` | 0 | Fresh built app under /Cunata/: cards2/filterfalse/navfalse/retryfalse; `browser-probe.log`. Real browser; synthetic hidden-file fixture; context/browser/server closed. |
| `node LC51-differential.mjs` | 0 | 1632 production total/max and section score/max comparisons match independent expected values; `differential.log`. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip; 1632 fixtures, 5849 maxima configurations, 9 negative controls; 5.7561s reported duration; `oracle.log`. |

Build/typechecks preceded npm test. Non-browser probes/oracle overlapped the first command sequence. The report browser probe and supplemental suite followed npm completion, and ran sequentially. No assertions or runner settings were weakened. For read-only Git lookups in the supplemental suite, GIT_DIR/GIT_WORK_TREE referenced the original repository; tested source remained the pinned copy. No live Google/Neon/Vercel endpoint was contacted. Historical LC63 initial-load timing failure and CK16-F01 intermittency did not recur in this run; one passing run does not establish their root cause or timing stability.

## coverage_gaps

- **M1 scoring:** fresh tests and independent differential passed. F02 remains a public rational API inverse defect; no score defect was demonstrated within the approved 1000-question limit. Differential only compares score/max, not every status/raw/order/DOM field.
- **M2/M3 student/storage/teacher/bank:** tests cover selected restore, timer, shuffle, finalization, report, builder, bank and assignment behavior. Full fresh quota/private-mode/migration/backup/delete/media-offline matrix NOT_RUN. No complete PIN-based class journey can be certified while section23 is missing.
- **M4 collection/API:** F01 persists despite green suites. Live Google/Neon/Vercel CORS/write/receipt/readback/deduplication and actual Neon concurrent SQL execution NOT_RUN; no production credentials/endpoints used. Local simulation is not live evidence. No certification of trusted grading or confidential-key examinations.
- **M5 import:** current DOCX/PDF diff preserves unresolved II answers as absent, and synthetic regressions run in npm test. Full real-document corpus for merged tables, multiple columns, media, unsupported OMML, corrupt/encrypted/scanned PDF NOT_RUN. Approved PDF scope is preview/manual, not automatic extraction/OCR.
- **M6 UI:** selected real-browser responsive, keyboard, contrast, offline and design checks ran. Manual visual review of every screen at 375/768/1440px in both themes, OS Telex/VNI, Firefox/WebKit, assistive technology, axe and Lighthouse NOT_RUN. DOM-driven tests do not certify all layout or WCAG AA behavior. Existing five-sample typing timings with a 150ms assertion do not independently prove input-to-paint p95 <100ms.
- **Section23 NOT_IMPLEMENTED:** fresh API calls addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults all return UNKNOWN_ACTION. Student table/types and optional student_id are groundwork, not roster CRUD, unique hashed PINs, five-failure/ten-minute lockout, bound identity, cross-machine results or teacher unsubmitted rows.
- **Section24:** filter/nav/retry are isolated renderer code, unavailable in the built app (F04). No production symbols found for rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. System dark CSS does not implement a remembered Light/Dark/System selector. API listResults projection omits answers required for the full submission viewer/statistics.
- Supplemental test/codex-check .mjs suite, comprehensive Git-history secret scan and dependency/license audit NOT_RUN; not needed to rerun the required gate and no prior PASS imported. Owner milestone/production acceptance NOT_RUN. No release approval.

## Missing roadmap features, priority order

1. **P1 reliability:** reserve dispatches and durable sending lease/budget (F01, src/collect); reject nonexistent/deleted exam assignments (F03, src/api); restore rational formatter/parser inverse (F02, src/domain). Add concurrent/crash/reload and roundtrip regressions. Retain historical timing-failure evidence and investigate recurrence without weakening assertions.
2. **P1 section23:** owner-scoped roster CRUD, unique hashed four-digit PINs, server lockout after five wrong attempts for ten minutes, studentToken, roster-bound name/student_id, cross-machine myResults and unsubmitted teacher rows. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 sections24.1/24.5:** integrate actual-app report filters/navigation and retry-wrong (F04); separate local practice IDs/snapshot, no teacher transmission and no original-final mutation. Regions src/app, src/report, src/student.
4. **P1 sections24.2/24.3:** teacher full submission dialog and valid-submission statistics, including I option distributions and top three wrong III responses; API must provide authorized data. Regions src/api, src/teacher, src/report.
5. **P1 section24.4:** PIN-backed student result history, SVG score chart and accessible text table. Regions src/student, src/api.
6. **P2 sections24.6/24.7:** teacher exam print flow, blank answer sheet and separate answer page; persisted Light/Dark/System TopBar selector with contrast verification. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** live-service verification, recovery/privacy/import corpus, OS IME/multiple browsers/assistive technology/performance, changelog/rollback and owner acceptance. All regions/glue. Keep approved custom-v1 and manual PDF scope; official presets and automatic OCR remain outside the approved implementation scope.

recommended_action: return the four verified findings to their owning workers; fix and add regressions; complete missing approved roadmap features; rerun gates and independent app integration review. Green gates alone do not approve this product snapshot.
NEED_DECISION: NONE for the listed fixes/features. If choosing to restrict the rational API instead of restoring its documented inverse, obtain an owner decision: (A) preserve the inverse and limit hostile inputs at DTO/payload boundaries; (B) version the contract and consistently restrict constructor/formatter/parser. This audit does not adopt a new API domain.
tools_research: NOT_REQUESTED; no tool installation.
privacy_notes: synthetic fixtures only; no private profile instructions, credentials or real student data in this report.

Final snapshot: HEAD remains `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`. Compared all 1337 selected original inputs that exist in the repository against pre-run hashes: **drift = []**. `source-hashes.json`, `git-status-before.txt` and `final-snapshot.json` are retained in the execution copy. Build/test artifacts remain outside the repository. Existing user/worker changes were preserved. Review applies to this pinned snapshot; subsequent source changes require renewed review.
