# LC54 — Independent whole-product audit

review_id/task_id: LC54; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69` (main).
requirements_version: Shared Product Contract v2.0; WEB-contract.md §§1–24 and inherited M1 scoring contract; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Four verified open findings: 2 MAJOR, 2 MINOR. No release approval.
recommended_action: fix the responsible regions below, add the specified regressions, and review the resulting stable snapshot.

## Snapshot, scope and files reviewed

Read the complete product and technical contracts, git status/log/diff and LC53. HEAD has not advanced since LC53. Compared SHA-256 of all **111 src files** against the actual LC53 temporary source tree: **no source delta**. Scripts, public inputs, Apps Script and styles also match that snapshot; non-PNG/log test comparison found only two changed generated browser evidence JSON files, not changed assertions. No package/lock/build-script/tsconfig delta against HEAD. Existing dirty and untracked files were preserved.

files_reviewed: HEAD-to-working-tree changes in `src/api/{handle,types,store/memory,store/neon}.ts`, `src/import/docx/segmentation.ts`, `src/import/pdf/manual.ts`, `src/report/view.ts`, `src/schema/types.ts`, `src/student/area.ts`, and associated regression tests. Rechecked public domain rational/scoring/validation boundaries, student controller/finalization, storage transactions/outbox, collect dispatch/export/client, report recomputation and app report caller, bank validation, teacher drafts/assignment dialog, import preview/ZIP/DOCX limits, UI URL safety and offline cache/update paths. Searched runtime entrypoints for §§23–24 features. Broad unchanged coverage is incremental from LC53, supported by fresh full-suite, browser and independent-oracle execution; this is not a claim of a fresh line-by-line read of every source file or manual inspection of every screen.

Execution snapshot: `%USERPROFILE%/AppData/Local/Temp/LC54-3rqbb0xn`. Copied current source/test/scripts/public/apps-script/docs/styles, root build inputs and existing installed node_modules physically; also copied existing `ops/blitz/promoted/_support` and `ops/publish.py` for supplemental harnesses. No branch/worktree was created. Build and test artifacts stayed in the temporary copy. The three existing LC51-named probe scripts were read, copied from LC53 and **executed anew** against LC54 source; their filenames do not imply inherited execution. Complete source manifest: `source-hashes.json` in this snapshot. Final repository verification found no source hash drift and unchanged HEAD.

Only this report was created in the repository by LC54. No installation, dependency change, product-code edit, production write, commit or deploy.

## Findings

### LC54-F01 — MAJOR — Concurrent outbox dispatch bypasses the durable retry budget

- finding_id: LC54-F01; status: VERIFIED; continues LC53-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: the initial checks enforce retryCount/backoff but do not reject an active `sending` record. CAS claims a new generation without consuming a dispatch. retryCount increments only after awaiting a retryable failure. A later caller can therefore claim another generation and send while the first transport is pending.
- reproduction_steps: in the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating; use MemoryTransactionAdapter/createStoragePort; start/finalize an attempt and enqueue a synthetic fixture endpoint. Keep send promises unresolved; invoke drainOutbox six times for the same tuple, five milliseconds apart. Read the durable outbox, then resolve each promise with simulated HTTP503.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All probe assertions passed; no network service was used.
- expected: Shared §3 and WEB §7 require bounded durable retries, at most five total dispatches including the first. Concurrent callers must honor an active sending lease.
- impact: multiple callers/tabs or reload can create overlapping sends and exceed the durable budget. Server deduplication does not enforce the client dispatch budget.
- minimal_fix: atomically reserve a dispatch and a durable lease through storage CAS before transport. Reject/coalesce callers while the lease is live; retain consumed dispatches across reload/lease expiry. Preserve the payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: multiple callers/storage instances with delayed transport; one live lease and no more than five dispatches; crash/reload after dispatch before receipt; expired lease recovery; lost response retries preserve body/tuple; late callbacks cannot downgrade confirmation or mutate final.

### LC54-F02 — MINOR — Rational parser is not the inverse of its formatter

- finding_id: LC54-F02; status: VERIFIED; continues LC53-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: public barrel calls in `node LC51-probes.mjs`: `s = toFractionString(rational(10n ** 200n))` produces a canonical integer of length201; `parseFractionString(s)` throws SyntaxError at the 200-character limit.
- expected: M1 §4.1 requires strict inverse parsing/formatting over the published rational API domain.
- actual: constructor and formatter accept a value that the parser rejects; freshly executed assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring defect demonstrated within the approved 1000-question limit; this is not a scoring blocker.
- minimal_fix: apply hostile-input length caps at DTO/payload boundaries while preserving the rational inverse API. Restricting the rational domain would instead require consistent constructor/formatter/parser limits and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths199/200/201, zero and noncanonical rejection; inverse in both directions.

### LC54-F03 — MINOR — API accepts assignment of a nonexistent exam

- finding_id: LC54-F03; status: VERIFIED; continues LC53-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection. No membership check against trusted ctx.catalog precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` creates a MemoryStore, active teacher, hashed valid session and owned class. Use ctx.catalog=[] and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200/success=true**, with one persisted assignment. Probe asserts both response and stored assignment count.
- expected: WEB §§19/22 allow assignment of an available permitted published exam or trusted static catalog exam; an unknown exam must not write.
- impact: an orphan assignment exposes an unavailable student exam; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before saving; use the established NOT_FOUND/INVALID_EXAM error for unknown exams.
- regression_test: nonexistent/deleted exams produce no write; own/shared published and static catalog exams work; foreign owner remains FORBIDDEN; preserve no-due-date semantics.

### LC54-F04 — MAJOR — Report filter/navigation/retry-wrong remain unavailable in the application

- finding_id: LC54-F04; status: VERIFIED; continues LC53-F04.
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

Environment: Windows PowerShell; Node v24.14.0; TypeScript7.0.2; Python3.11.0; installed Chrome/Edge CDP harness. `npm.cmd`/`npx.cmd` are the Windows shims for the requested npm/npx commands. Log paths below are relative to the execution snapshot. Probe exit0 means reproduction succeeded, not that the bug was fixed.

| Command | Exit | Actual result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 files emitted, validated and promoted in temporary dist; build.log. DEP0190 warning recorded. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; tsc.log. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; tsc-web.log. |
| `npm test`, first run | 1 | 1610 tests, pass1596/fail12/skip2, 42070.2333ms; npm.log. Started before temporary build promotion: assertions requiring dist failed and two browser tests skipped. Setup/order error, not a verified product defect. |
| `npm test`, after build | 1 | 1610 tests, pass1609/fail1/skip0, 48694.8873ms; npm-rerun.log. CK15-F01 offline fetch still contained RELEASE_A_MARKER at ck12Regressions.test.ts:1144. |
| `node --test --test-name-pattern='CK15-F01' test/final-quality/ck12Regressions.test.ts` | 0 | 1 test, pass1/fail0/skip0, 7895.0925ms; ck15-retry.log. |
| `npm test`, final full run | 0 | **1610 tests / 345 suites, pass1610/fail0/skip0/cancelled0/todo0**, 29470.3304ms; npm-final.log. Includes CK15/CK16 browser update/concurrency tests. |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | **104 tests / 5 suites, pass104/fail0/skip0**, 135394.8071ms; claude.log. Real browser plus fixture-backed service checks. |
| `node --test "test/codex-check/**/*.test.mjs"` | 1 | 199 tests / 2 suites, pass186/fail13/skip0, 261978.071ms; codex.log. Missing temporary _audit directories caused eleven failures including one after-hook; two API cases failed reading DevToolsActivePort with EBUSY. |
| `node --test test/codex-check/cx/schema.test.mjs test/codex-check/cx/student.test.mjs test/codex-check/cx/teacher.test.mjs` | 0 | 13 tests, pass13/fail0/skip0, 12151.8514ms; codex-retry.log. Created missing artifact directories first. |
| `node --import ./ops/blitz/promoted/_support/runtime.mjs --test --test-timeout=180000 test/codex-check/feat/R1/api.test.mjs` | 0 | 22 tests, pass22/fail0/skip0, 6973.0636ms; codex-api-retry.log. Existing teardown adapter loaded; includes both EBUSY-affected cases. |
| `node LC51-probes.mjs` | 0 | F01 six sends/zero consumed budget; F02 length201 rejected; F03 nonexistent exam accepted; six roster/PIN/history actions UNKNOWN_ACTION; probes.log. |
| `node LC51-browser-probe.mjs` | 0 | Real dist app: two report cards; filter/nav/retry absent; browser-probe.log. |
| `node LC51-differential.mjs` | 0 | All1632 product total/max and per-section score/max values match independent fixture expectations; differential.log. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip; 1632 fixtures, 5849 maxima configurations, 9 negative controls, 3.2607s; oracle.log. |

Supplemental tests requiring Git HEAD received read-only GIT_DIR/GIT_WORK_TREE pointing at the original repository; no repository or worktree was created. One supplemental API child retained handles after producing its test results; after several minutes its exact process/parent/command line was verified and only that LC54 child stopped so the parent could finish. No other existing test/service process was stopped. The API file was then rerun with the existing runtime teardown adapter and a timeout. No test assertions/source were edited, weakened or skipped. Original nonzero exits remain nonzero; targeted reruns do not constitute a clean all-files supplemental run.

The intermittent CK15-F01 failure is **observed but root cause NOT VERIFIED**: isolated retry and final full suite passed with unchanged source. Preserve the failing log; investigate activation/controller handover timing and harness synchronization before claiming repeatable offline-update acceptance. It is not silently counted as PASS or promoted to a fifth verified product finding.

PowerShell log redirection stores UTF-16 text and may render benign native stderr as NativeCommandError records; native exit codes were captured separately. An incidental git diff from the temporary non-Git directory failed and was corrected using `git -C D:/Cunata`; no finding relies on that failed command.

## coverage_gaps

- M1: fresh full suite and independent differential verify exact scoring/maxima; differential compares numeric rational DTO values, not every DOM/status/order/raw field. F02 remains.
- M2/M3: npm and browser suites cover storage/finalization/CAS, timer, shuffle restore, builder/bank/versioning and selected report flows. No new exhaustive manual private-browser/quota/recovery/migration/delete/backup/media-offline matrix. F03/F04 remain; CK15 intermittent failure remains an evidence limitation.
- M4: F01 remains. Range/sum checking of client scores is not trusted server grading. Live Google/Neon/Vercel origin/CORS/write/receipt/readback/deduplication **NOT_RUN**: no production credentials/endpoints used. Neon SQL transport/concurrency fixtures are simulated, not live database evidence.
- M5: missing II keys remain unresolved rather than fabricated; PDF remains preview/manual per D06. No new complete real-document corpus for merged tables/multicolumn layout/images/unsupported OMML/encrypted or scanned PDFs. No OCR or automatic PDF parsing claim.
- M6: real-browser checks ran; no fresh visual screenshot inspection, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse or p95 performance measurement. Full Git-history secret scan **NOT_RUN**. Existing tests are not blanket proof of WCAG AA across every screen.
- §23 **NOT_IMPLEMENTED**: fresh handle probes return UNKNOWN_ACTION for addStudents, listStudents, resetPin, removeStudent, studentLogin and myResults. A students table/type is not roster CRUD, PIN authentication/lockout, roster-bound naming or cross-machine history. Teacher results currently omit not-submitted roster rows.
- §24 runtime marker search found no rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme in relevant runtime paths. Filter/nav/retry exist only in the separate renderer and were absent in the actual app probe. System dark CSS is not a persisted three-way theme selector.

## Missing roadmap features, priority order

1. **P1 reliability:** durable dispatch reservation/lease and retry budget (F01, src/collect); reject orphan assignments (F03, src/api); restore rational inverse API (F02, src/domain). Add concurrent/reload/roundtrip regressions.
2. **P1 §23 roster/PIN:** owner-scoped roster CRUD, unique hashed four-digit PINs, five failures/10-minute lock, studentToken, roster-bound candidate/student_id, cross-machine myResults and teacher rows for students not submitted. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 §§24.1/24.5:** integrate report filter/nav/retry-wrong (F04), separate local practice with no teacher submission or original-result mutation. Regions src/app, src/report, src/student.
4. **P1 §§24.2/24.3:** per-student full submission viewer; per-question correctness, I-option distribution and top-three wrong III answers from valid final submissions. Regions src/api, src/teacher, src/report.
5. **P1 §24.4:** PIN-backed student history and SVG score chart with accessible text table. Regions src/student, src/api.
6. **P2 §§24.6/24.7:** teacher exam print with answer sheet and separate key page; persisted Light/Dark/System TopBar selector and verified AA across screens. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** resolve offline-update test instability; live-service evidence, recovery/privacy/import corpus, OS IME/multiple browsers/AT/performance and owner acceptance with changelog/rollback. All regions/glue. Continue custom-v1; official presets and automatic OCR must not be invented.

NEED_DECISION: NONE for these concrete fixes and already-specified features; apply settled decisions and §§19.2a/21–24. Any new restriction of the rational API domain requires a contract decision; restoring its existing inverse contract does not.
tools_research: NOT_REQUESTED. privacy_notes: synthetic fixtures only; no credentials, real student data or private instruction content.
