# LC60 ? Independent whole-product audit

review_id/task_id: LC60; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus pre-existing working-tree changes.
requirements_version: Shared Product Contract v2.0; WEB-contract.md ??1?24 (read in full), inherited M1 and DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Two verified MAJOR and two verified MINOR findings persist; the corrected full npm run also fails its browser SW gate. No release approval. NEED_DECISION: NONE for the listed fixes/features.

## Snapshot and coverage

Independent incremental whole-product review since LC59. Git status/log and HEAD-to-working-tree diff inspected; all 540 inputs recorded by LC59 are byte-identical to current inputs. No new runtime delta since that review. Current API atomic ownership/account mutations, importer missing-key preservation, report controls, schema/student metadata changes were inspected directly, together with domain scoring/maxima/rational, storage/student entrypoints, collector dispatch/CAS/retry, configuration transport and app report integration. Tests exercise all product regions; unchanged code was not freshly read line by line in its entirety.

Execution copy: `%USERPROFILE%/AppData/Local/Temp/LC60-cxvlxba0`. Current src/tests/scripts/docs/assets/configs/installed node_modules copied to a normal temporary directory; no branch/worktree or install. Tests/build write only there. `source-hashes.json` records 552 selected code/test/build/assets/root inputs including README and ops/publish.py; `git-status-before.txt` captures pre-existing changes. The 11 inputs added to the prior 540-input manifest broaden the manifest; they are not claimed to be new repository changes. README is the twelfth additional input. Probe scripts copied from LC59 were inspected and executed anew; legacy LC51 filenames are retained for reproducibility, not inherited PASS evidence.

Only `docs/reviews/LOOP-60-codex.md` is intentionally created/modified in the repository by this audit. Existing edits preserved. No product fix, dependency addition, commit, deploy or production write.

## Findings


### LC60-F01 — MAJOR — Concurrent dispatch bypasses the durable retry budget

- finding_id: LC60-F01; status: VERIFIED; continues LC59-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: retry/backoff checks do not reject an active `sending` record. CAS increments generation without consuming a dispatch; retryCount increments only after a retryable failure returns. Later callers can send while earlier transports remain pending.
- reproduction_steps: from the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating, create memory-backed durable storage, start/finalize an attempt, enqueue a synthetic endpoint. Invoke drainOutbox six times five milliseconds apart while send promises remain unresolved; inspect outbox, then resolve HTTP503 responses.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All reproducer assertions passed; no external service was contacted.
- expected: Shared §3 / WEB §7 require bounded durable retries, at most five dispatches including the first; a concurrent caller must honor an active sending lease.
- impact: overlapping callers/tabs or interrupted sends can exceed the persistent budget. Server deduplication does not enforce this client budget.
- minimal_fix: atomically reserve both a consumed dispatch and a durable sending lease through storage CAS before transport. Reject/coalesce while lease is live; retain consumed attempts across reload/expiry. Preserve payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: delayed concurrent calls through multiple storage instances; one live lease, at most five sends; reload/crash between send and receipt; expired lease recovery; response loss retry uses identical body/tuple; stale callbacks cannot downgrade confirmation or mutate final.

### LC60-F02 — MINOR — Rational parser rejects formatter output

- finding_id: LC60-F02; status: VERIFIED; continues LC59-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parseFractionString of that output throws SyntaxError at the 200-character cap.
- expected: M1 §4.1 requires the parser to be the strict inverse of the formatter over the published rational API domain.
- actual: constructor/formatter accept a value the parser rejects; fresh assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring failure demonstrated within the approved 1000-question limit; not a scoring blocker.
- minimal_fix: enforce hostile-input limits at DTO/payload boundaries while retaining the rational inverse API. Restricting the rational domain instead requires consistent constructor/formatter/parser restrictions and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths 199/200/201; zero; noncanonical rejection; both inverse directions.

### LC60-F03 — MINOR — A nonexistent exam can be assigned

- finding_id: LC60-F03; status: VERIFIED; continues LC59-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection; no trusted ctx.catalog membership check precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` seeds MemoryStore with an active teacher, valid hashed session and owned class. Use empty catalog and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200, success=true, one assignment persisted**; both response and stored count are asserted.
- expected: WEB §§19/22 permit available own/shared published exams or trusted static catalog exams; unknown exams must fail without a write.
- impact: creates orphan assignments leading students to unavailable exams; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before save; return established NOT_FOUND/INVALID_EXAM for unknown IDs.
- regression_test: nonexistent/deleted exam creates no assignment; own/shared published and catalog exams work; foreign owner stays FORBIDDEN; retain no-due-date semantics.

### LC60-F04 — MAJOR — Report filter, navigation and retry-wrong are absent in the app

- finding_id: LC60-F04; status: VERIFIED; continues LC59-F04.
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

Environment: Windows PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0, existing CDP browser harness. npm.cmd/npx.cmd execute requested npm/npx commands. Artifacts below are relative to execution copy; PowerShell redirected logs are UTF-16. Probe exit0 confirms asserted defects, not fixes.

| Command | Exit | Result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 emitted/validated files, staged then promoted; `build.log`; DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; `tsc.log`. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; `tsc-web.log`. |
| `npm test` initial run after build | 1 | 1601 tests /345 suites; pass1599/fail2/skip0/cancelled0/todo0; 59528.2176ms; `npm.log`. README omitted from execution copy caused ENOENT and an uninstantiated docs suite; separate performance assertion measured 219ms vs <150ms. These are not represented as product defects without isolation. |
| `npm test` corrected execution copy | 1 | 1610 tests /345 suites; pass1609/fail1/skip0/cancelled0/todo0; 180496.3625ms; `npm-rerun.log`. README restored byte-for-byte; docs and performance checks pass. CK16-F01 fails: Release B worker must be installed into waiting state (`test/final-quality/ck12Regressions.test.ts:1372`). No source/assertion edits. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 tests /5 suites; pass104/fail0/skip0/cancelled0/todo0; 64773.0161ms; `claude.log`. Real browser + local simulated-service checks. Read-only Git queries point to original repository. |
| `node --test --test-timeout=120000 --test-name-pattern="CK16-F01" test/final-quality/ck12Regressions.test.ts` | 0 | Focused investigation: 1 test /1 suite; pass1/fail0/skip0; 16258.8245ms; `ck16.log`. Does not turn full suite green. |
| `node LC51-probes.mjs` | 0 | F01/F02/F03 freshly reproduced; all six section23 actions UNKNOWN_ACTION; `probes.log`. Synthetic storage/API, no external service. |
| `node LC51-browser-probe.mjs` | 0 | Fresh built dist under /Cunata/: cards2/filterfalse/navfalse/retryfalse; `browser-probe.log`. Real browser, synthetic hidden-file fixture; resources closed. |
| `node LC51-differential.mjs` | 0 | 1632 production total/max and per-section scores match independent oracle expectations; `differential.log`. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip; 1632 fixtures, 5849 maxima configurations, 9 negative controls; 7.8951s reported duration; `oracle.log`. |

Build completed before npm tests. First npm run overlapped the separate browser suite; performance may be sensitive to contention. Its performance assertion passed on the corrected full rerun. CK16-F01 fails before the cross-tab submission assertion because the replacement worker does not reach waiting within its 22-second polling window. Root cause NOT VERIFIED; do not claim data loss or a confirmed SW production defect from that failure alone. Full npm gate remains RED irrespective of focused rerun outcome. No tests skipped or weakened by the auditor. Independent score comparison does not certify every DOM/status/order/raw field.

## coverage_gaps

- Full npm gate is RED (corrected execution copy: 1609 pass/1 fail). CK16-F01 waiting-worker failure at test/final-quality/ck12Regressions.test.ts:1372 requires investigation in src/offline or glue/browser harness. Root cause NOT VERIFIED. Never infer a green gate from prior LC59 or a focused rerun. Performance test uses five CDP typing durations and <150ms assertion; it is not an independent measurement of input-to-paint p95 <100ms. No whole-product performance certification.
- M1: fresh score/oracle comparisons pass. F02 is a public inverse API failure, no scoring failure demonstrated under approved 1000-question cap.
- M2/M3: selected unit/VM/browser restoration/timer/shuffle/finalization/report/builder/bank checks; no exhaustive new quota/private-mode/migration/backup/delete/media-offline recovery matrix, nor full class/PIN journey.
- M4: F01 persists. Live Google/Neon/Vercel CORS/write/receipt/readback/deduplication NOT_RUN; no credentials or production endpoints used. Local SQL/service simulation does not certify database concurrency or trusted grading.
- M5: static source confirms unresolved II keys remain absent rather than guessed false. Full real-document corpus for merged tables, multicolumn layouts, media, unsupported OMML, encrypted/scan PDF NOT_RUN. PDF approved scope remains preview/manual.
- M6: actual browser checks ran, but OS Telex/VNI, Firefox/WebKit, assistive technology, fresh manual screenshot inspection, axe/Lighthouse NOT_RUN. Selected contrast checks do not certify WCAG AA across all screens. Full Git-history secret scan/dependency audit NOT_RUN.
- Section23 NOT_IMPLEMENTED: addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults all return UNKNOWN_ACTION in fresh probes. Students table/types and optional student_id do not implement roster CRUD, PIN hashing/uniqueness, lockout, roster-bound identity, cross-machine reports, or unsubmitted roster rows.
- Section24: filter/nav/retry are isolated report-renderer controls, absent from actual app (F04). No relevant runtime symbols for rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. System dark CSS does not implement persisted three-way theme selector.
- Supplemental test/codex-check .mjs suite NOT_RUN; no prior PASS carried forward. Owner production acceptance NOT_RUN.

## Missing roadmap features, priority order


1. **P1 reliability:** resolve the CK16-F01 full-suite SW gate and rerun the unchanged full suite; durable dispatch reservation/lease/budget (F01, src/collect); nonexistent-exam assignment rejection (F03, src/api); rational inverse API (F02, src/domain). Add concurrent/reload/roundtrip regressions.
2. **P1 section 23:** owner-scoped roster CRUD; unique hashed four-digit PINs; five-failure/10-minute lockout; studentToken; roster-bound candidate/student_id; cross-machine myResults; teacher not-submitted rows. Regions src/api, src/teacher, src/student, src/collect.
3. **P1 sections 24.1/24.5:** integrate report filters, navigation and retry-wrong (F04); independent local practice without teacher sends or original-final mutation. Regions src/app, src/report, src/student.
4. **P1 sections 24.2/24.3:** teacher per-student full submission viewer and per-question correctness, I option distributions, three common wrong III answers from valid submissions. Regions src/api, src/teacher, src/report.
5. **P1 section 24.4:** PIN-backed history, SVG score chart and accessible text table. Regions src/student, src/api.
6. **P2 sections 24.6/24.7:** teacher printing with blank answer sheet and separate key page; persisted Light/Dark/System TopBar selector and contrast verification. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** live-service verification; recovery/privacy/import corpus; OS IME/multiple browsers/AT/performance; owner acceptance with changelog/rollback. All regions/glue. Retain custom-v1 and manual PDF; do not invent official presets or automatic OCR.

NEED_DECISION: NONE for the listed fixes and specified features. Restoring the documented rational inverse needs no new business policy; restricting the public rational domain instead would require contract revision.

tools_research: NOT_REQUESTED. privacy_notes: synthetic fixtures; no private instruction text, credentials or real student data in report.


Final verification: HEAD `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`; 550/552 selected inputs remain byte-identical, including every selected source/build/config input; two existing browser evidence JSON files changed during the audit (`test/codex-check/cx/F02-browser.json`, `test/codex-check/cx/F03-browser.json`). Those artifacts are not source, not assertions and not execution evidence for this audit; no tested runtime-code drift detected Focused CK16-F01 rerun passes (1/1), suggesting intermittent timing/environment sensitivity, but root cause remains unverified and the full npm result remains RED. No release approval. Final evidence: `final-snapshot.json` in the execution copy.
