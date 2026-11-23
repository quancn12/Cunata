# LC110 ? Independent whole-product review

review_id/task_id/worker_id: LC110; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `97e89d699b473fdb557ea914992ef905af3d0cb1`; branch: main; includes current uncommitted inputs.
requirements_version: Shared Product Contract v2.0 (precedence); WEB-contract.md read in full, ??1?24 and approved amendments; inherited M1; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Eight findings freshly reproduced: six MAJOR and two MINOR. Required npm gate remains red. No product/milestone acceptance. Handoff: READY_FOR_REVIEW. NEED_DECISION: NONE for these fixes or the approved local roadmap.

## Snapshot, scope and method

Only intentional workspace write: `docs/reviews/LOOP-110-codex.md`. No source/test changes, install, dependency changes, commit, branch/worktree, deployment or live-service writes. No AGENTS.md found in target ancestors or repository inventory. E = `%USERPROFILE%/AppData/Local/Temp/LC110-audit-0zj13ukn/`, a physical execution copy with copied installed dependencies. All audit build/test outputs, probes, synthetic records and logs are there. npm.cmd/npx.cmd are Windows equivalents of npm/npx.

Fresh git status/log/diff verifies HEAD unchanged from LC109. Source/build/Apps Script working diff against HEAD: 18 files, 949 insertions, 170 deletions; package/lock unchanged. Read all changed module diffs and focused callers. LC109 is an index, not inherited approval. The new inventory (`lc110-inputs.json`) contains 724 files. After separating 17 generated diagnostic JSON outputs, 707 executable/config/content/test-fixture inputs have byte-for-byte parity with the execution copy. All 571 overlapping input hashes in the LC109 manifests are unchanged (`lc110-prior-comparison.json`, `lc110-input-parity.json`). Nonoverlapping entries are not claimed unchanged. Concurrent workspace changes observed in R3 failure evidence are generated outputs, not implementation changes.

files_reviewed: src/api handle/stores/types; src/app main/authoring/exam-list and routing/report/download integration; src/collect receipt/transport/outbox; src/import DOCX segmentation, PDF manual and preview confirmation; src/report projection/view/download; src/schema validation/types; src/student controller/area; src/teacher portal; scripts/web-build.ts; apps-script/Code.js. Focused unchanged paths include domain exact scoring/short-answer/rational/shuffle, storage finalization/outbox CAS, student deadline handling, bank validation, safe asset resolver and offline/publisher callers. Automated suites exercise the broader product. This is a risk-based whole-product review, not a fresh line-by-line audit of every unchanged file or complete acceptance certification.

## Findings


### LC110-F01 — MAJOR — Concurrent drains bypass the durable send budget

- status: VERIFIED; LC109-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:424`, `:454–469`, `:491`, `:640`; CAS boundary `src/storage/index.ts:977`.
- evidence: E/lc110-probes.log shows six actual transport calls, durable state `sending`, `retryCount=0`, `generation=8`. Existing `sending` is accepted; budget consumption happens after the asynchronous response/error.
- reproduction_steps: run `node LC51-probes.mjs` in E. Finalize synthetic hoa-repeating using MemoryTransactionAdapter, enqueue, call drainOutbox six times five milliseconds apart with unresolved transport promises, inspect outbox, then resolve all with HTTP 503.
- expected: Shared §3 / WEB §7 require a bounded durable retry budget across concurrent callers/recovery.
- actual/impact: six requests start despite a five-send budget; repeated callers or crashes before receipts can evade the bound. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a send attempt and active lease before calling transport; refuse/coalesce active leases and recover expired leases without resetting consumed budget. Preserve tuple/hash/generation pinning and terminal confirmation. An in-process mutex alone does not cover separate tabs.
- regression_test: unresolved sends from concurrent clients, lost receipts, crash/reload and expired-lease recovery; one active dispatch, at most five actual sends per budget, immutable final/hash and no late confirmation downgrade.

### LC110-F02 — MAJOR — Switching exams during HTML export crashes the download

- status: VERIFIED; LC109-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:3104`, `:3177–3185`, `:3210–3216`, `:3282–3315`.
- evidence: E/download-race.json and E/lc110-download-race.log: `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, title `New exam B`.
- reproduction_steps: run `node download-race.mjs` with the teardown preloads described below. Submit A with an internal image; defer image fetch during download, load B through retained hidden examFileInput, then release A's fetch.
- expected: Shared §2 / WEB §§3,20: export A's complete immutable report or explicitly cancel with recoverable feedback.
- actual/impact: the async handler reads mutable currentExam/order/responses/scoredResult after awaiting. Loading B clears A's score and creates an unhandled export rejection. Mixed-identity output remains a source risk; no mixed downloaded file was observed.
- minimal_fix: capture the entire immutable report, assets and filename before the first await; use captured data exclusively afterward and surface asset/export failures.
- regression_test: defer A's asset, open B, release fetch; one complete A report retaining title/version/order/answers/score, or explicit cancellation. Cover failed assets and concurrent exports.

### LC110-F03 — MAJOR — Math inside table cells disappears silently

- status: VERIFIED; LC109-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:415–428`, `:1689`, `:3094`, `:3282`.
- evidence: E/lc110-lc83-independent.test.log and lc83-independent.json: the accepted table cell includes text, image and math source `x^2+83`; visible stem text is only `NESTED-TEXT`. The nested-math assertion fails. The cell loop handles only text/image, dropping math and nested tables.
- reproduction_steps: `node --test lc83-independent.test.mjs` in E; load its canonical synthetic exam, inspect the cell, submit and download. The downloadable report uses the same helper. Whole-file `hasMath=true` in the diagnostic is not proof of preservation; the synthetic ID/title also contains 83.
- expected: Shared §6 / WEB §§4,8,20 preserve recursive Cell.blocks, or show labeled unsupported source with a warning.
- actual/impact: legitimate question content vanishes and can prevent solving the question. No claim that a specific real DOCX was corrupted.
- minimal_fix: one recursive safe renderer for text/math/image/table at every depth, preserving and labeling unsupported OMML/source.
- regression_test: mixed cell content and nested tables through exam → final → report → portable HTML, scoped to question content; include unsupported math and hostile escaped text.

### LC110-F04 — MAJOR — Required review controls remain outside the real result page

- status: VERIFIED; LC109-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:535–573`, `:2992–3097`; isolated controls `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: E/lc110-LC51-browser-probe.log: `cards=2, filter=false, nav=false, retry=false`. App builds its own report; source search locates these controls only in the isolated report view.
- reproduction_steps: `node LC51-browser-probe.mjs` in E. Submit synthetic I+III under local `/Cunata/` and inspect `#reviewFilter`, `#reviewNav`, `#btnRetryWrong`. R4 acceptance tests exercise the submitted page.
- expected: WEB §§24.1,24.5 require all/wrong/blank filters with aria-pressed, question navigation, and independent retry practice without teacher submission.
- actual/impact: controls implemented in isolation are unreachable in the product. Filter/navigation are R4 debt; retry practice also depends on R7/R8.
- minimal_fix: integrate the report projection/actions/lifecycle. Retry uses a fresh local practice ID/snapshot, clears assignment/collector linkage and preserves the original immutable final.
- regression_test: actual submit → filter → navigate including hidden targets → retry wrong/blank/partial-II → refresh; original result unchanged, zero submitResult calls for practice.

### LC110-F05 — MINOR — Assignment accepts a nonexistent exam

- status: VERIFIED; LC109-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396–405`.
- evidence: E/lc110-probes.log records HTTP 200/success=true and one persisted assignment for `does-not-exist` with an empty trusted catalog. Null getExam bypasses the ownership condition.
- reproduction_steps: `node LC51-probes.mjs`; seed synthetic active teacher/session/owned class in MemoryStore; assign an unknown exam with valid openAt and `dueAt:""`; inspect assignments.
- expected: reject nonexistent/deleted exams before persistence; allow authorized published or trusted catalog exams.
- actual/impact: an orphan assignment is accepted and students cannot load its exam. No cross-owner write was demonstrated.
- minimal_fix: require an allowed published exam or trusted catalog membership; otherwise NOT_FOUND/INVALID_EXAM and no write. Retain foreign-owner rejection and no-due semantics.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog pass, foreign-owner fails FORBIDDEN; `dueAt:""` remains supported.

### LC110-F06 — MINOR — Public fraction parser is not the formatter's strict inverse

- status: VERIFIED; LC109-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel API `toFractionString(rational(10n**200n))` yields a canonical 201-character integer, then parseFractionString throws SyntaxError.
- expected: M1 §4.1 specifies a strict inverse for these public functions.
- actual/impact: valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: separate bounded untrusted DTO parsing from general rational conversion, or reconcile the public inverse contract without removing ingress resource protection.
- regression_test: signed integer/fraction roundtrips at length boundaries plus oversized untrusted DTO rejection and existing scoring cases.

### LC110-F07 — MAJOR — Required npm gate still fails three tests

- status: VERIFIED; LC109-F07 persists. **VÙNG chịu trách nhiệm: glue**, consulting src/collect and src/teacher.
- affected_files: `test/collect/apiBase.test.ts:41` / send `:66`; `test/collect/r0-f04-regression.test.ts:6` / send `:96`; `test/teacher/portal.test.ts:557` / assertion `:608`.
- evidence: fresh isolated npm.cmd test exits 1: 1,625 tests, 345 suites, 1,622 pass, 3 fail, no skipped/cancelled/todo. E/lc110-npm.log includes full stacks.
- reproduction_steps: build the complete execution copy E, then run `npm.cmd test` without an overlapping standalone build.
- expected: required full suite green without weakening assertions or production validation.
- actual/impact: apiBase fixture omits attempt_id/recorded_at → RECEIPT_INVALID; r0-f04 fixture returns ok:true rather than success:true → BAD_RESPONSE; teacher fixture lacks owner/current teacher identity while `src/teacher/portal.ts:1689–1716` filters ownership. Each independently keeps the required gate red. Fixture failures alone do not establish a production authorization bypass.
- minimal_fix: reconcile response fixtures and owner/port metadata with the actual contract. Preserve malformed/mismatched receipt rejection, raw answers, assignment isolation and authorization. Do not restore publish-based ownership probing or weaken receipt validation.
- regression_test: these three tests, full npm suite and relevant browser receipt/ownership checks.

### LC110-F08 — MAJOR — Unvalidated asset data breaks embedded images and triggers foreign requests

- status: VERIFIED; LC109-F08 persists; freshly reproduced in LC110. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:375–382`, `:407–408`, `:1689`, `:3094`; permissive ingress `src/schema/exam.ts:82-98`, `:594-626`; safe existing resolver `src/ui/security.ts:152–173`.
- evidence: E/lc107-asset.json and E/lc110-lc107-asset.log: parseOk=true; actual stem and report img src equals raw PNG base64, both complete=true/naturalWidth=0. The exact same PNG prefixed `data:image/png;base64,` has naturalWidth=1. HTML export includes the correct data URL, so browser display and download diverge.
- reproduction_steps: `node lc107-asset.mjs` with teardown preloads. Build a synthetic valid I exam, assets=[{assetId:'diagram',mime:'image/png',data:<raw base64>,alt:'required diagram'}], question blocks=[{type:'image',assetId:'diagram',alt:'required diagram'}]. Load, inspect the image after settling, submit and inspect the report; compare a control Image with a data URL. The probe contains the complete minimal PNG.
- additional evidence in LC110: `E/lc108-external-asset.json and E/lc110-lc108-external-asset.log`, produced by `node lc108-external-asset.mjs` (exit 0). A valid synthetic exam with `assets[0].data = http://127.0.0.1:<second-port>/tracking.png?synthetic=LC108` passes parseExam. Merely loading the exam sends one GET to that second origin, including the app-origin Referer, and displays the image with naturalWidth=1. The receiver is a synthetic loopback server; no external service was contacted. Run the probe to reproduce. This demonstrates an actual request, not just an unsafe-looking DOM string; no real PII exfiltration was tested.
- expected: the accepted Asset representation renders embedded data correctly; WEB sections 4.1 and 9 require safe assets and no automatic external tracking. Untrusted asset data must not become an arbitrary fetch URL. The shared resolver supports raw base64.
- actual/impact: resolveAssetSrc returns raw data unchanged, so the browser treats it as a relative URL and the image is broken. Questions dependent on a diagram cannot be answered correctly. No missing-image warning appears. This is independent of F03's dropped math. The same direct assignment permits URLs to initiate automatic foreign requests, exposing network/referrer metadata to an exam-supplied receiver.
- minimal_fix: use the shared safe asset resolver or normalize raw base64 to a validated MIME-specific data URL before rendering; preserve checked internal SVG rules and reject unsafe content consistently. Reject URL-valued embedded asset data at ingress and/or render through a strict shared resolver; do not construct arbitrary executable data URLs.
- regression_test: actual app load → submit → review → download with PNG/JPEG/WebP assets supplied as raw base64 and data URLs, including nested cells. Assert decoded dimensions and no unintended relative-image request; retain unsafe SVG/MIME rejection. Include URL-valued asset data with a second-origin local receiver and require zero receiver requests during exam, report and export.


## checks_run

Environment: Windows/PowerShell; Node v24.14.0; npm 11.9.0; installed TypeScript 7.0.2; Python 3.11.0; installed local Chromium/CDP harness. All checks below were executed afresh in E. Standalone build finished before npm; npm finished before the extended browser suites. No standalone build overlapped npm. The two extended suites ran concurrently against isolated browser contexts/loopback services. Tests and product assertions were not changed.

| Command in E | Exit | Actual result | Evidence in E |
| --- | ---: | --- | --- |
| `node scripts/build.js` | 0 | PASS; staged module/API emit, 339 dist files, asset/schema/syntax checks | lc110-build.log |
| `npm.cmd test` | 1 | FAIL; 1,625 tests / 345 suites; 1,622 pass / 3 fail / 0 skip/cancel/todo; 30.353 s | lc110-npm.log |
| `npx.cmd --no-install tsc -p tsconfig.json` | 0 | PASS | lc110-tsc.log |
| `npx.cmd --no-install tsc -p tsconfig.web.json` | 0 | PASS | lc110-tsc-web.log |
| `python -B test/oracle/oracle.py --check` | 0 | PASS; 11 tests, 1,632 fixtures, 5,849 maxima configurations, 9 negative controls | lc110-oracle.log |
| `node LC51-differential.mjs` | 0 | PASS; actual total/max and section score/max vs independent expected, 1,632 cases | lc110-differential.log |
| `node LC51-probes.mjs` | 0 | Reproduced F01/F05/F06; six R3 actions UNKNOWN_ACTION | lc110-probes.log |
| `node --test --test-timeout=120000 lc83-independent.test.mjs` | 1 | FAIL; 5 tests / 3 pass / 2 fail including parent; nested math disappears; 11.320 s | lc110-lc83-independent.test.log; lc83-independent.json |
| `node download-race.mjs` | 0 | Reproduced null totalFraction rejection; zero downloads; B active | lc110-download-race.log; download-race.json |
| `node LC51-browser-probe.mjs` | 0 | Two result cards; filter/nav/retry absent | lc110-LC51-browser-probe.log |
| `node lc107-asset.mjs` | 0 | Accepted base64 image broken on exam/report; prefixed control decodes | lc110-lc107-asset.log; lc107-asset.json |
| `node lc108-external-asset.mjs` | 0 | Accepted URL-valued asset causes second-origin GET with Referer | lc110-lc108-external-asset.log; lc108-external-asset.json |
| `node --test --test-timeout=120000 test/app/r2-f01-service-worker.test.mjs` | 0 | PASS; 3 tests / 3 pass; actual browser RPC cache exclusion; 2.576 s | lc110-r2-f01-service-worker.test.log |
| `node --test --test-concurrency=1 --test-timeout=240000 test/claude-check/**/*.test.mjs` | 0 | PASS; 104 tests / 5 suites; 104 pass / 0 fail/skip/cancel/todo; 105.505 s | lc110-claude.log |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` | 1 | FAIL; 264 tests / 2 suites; 223 pass / 41 fail / 0 skip/cancel/todo; 231.177 s | lc110-codex.log |
| `node lc110-visual.mjs` | 0 | Six actual result-page captures: 375/768/1440px ? light/dark; no positive horizontal overflow; Tab/focus observations | lc110-visual.log; lc110-visual.json; lc110-result-*.png; lc110-visual-contact.png |

The complete Codex run has 22 R3 API failures, 11 R3 browser failures and eight R4 failures. Each stack was inspected: UNKNOWN_ACTION or missing required roster/result controls, consistent with source/probes. No ENOENT or missing-module setup failure appears in this run. These failures establish unfinished approved features, not 41 independent security exploits. Unlike the previous review's setup-affected runs, this is a single complete run with evidence/support directories and the unchanged local publisher present. The fresh test count is reported directly; no combined/synthetic PASS total is used.

Browser execution uses absolute file-URL NODE_OPTIONS preloads for the existing `ops/blitz/promoted/_support/runtime.mjs` (Browser.close teardown acknowledgement) and copied `teardown-http.mjs` (HTTP keepalive teardown). These affect teardown only, not product logic or assertions. GIT_DIR/GIT_WORK_TREE point to the original repo for read-only provenance. Prior probe filenames, synthetic IDs and their older console finding labels are retained; the LC110 mapping is defined in Findings, and every cited output was regenerated here. Diagnostic exit 0 means successful reproduction, not product correctness.

The nested-content probe also positively confirmed that browsing owned exams issued zero publish requests, a saved B key survived publication, and exported nested images were embedded. These passes do not remove the nested-math failure. The six visual captures and contact sheet were visually inspected; they are representative result-page checks, not full screen/theme/keyboard acceptance. Most matrix captures show visible focused controls; the first post-submit Tab capture has no focused control, so no blanket focus certification is made. Existing design/keyboard browser assertions passed in the Claude suite.

Fresh bounded secret scan: 135 TS/JS/MJS/JSON files under src/scripts/apps-script/public; no selected private-key, Google/GitHub token or credentialed PostgreSQL URL patterns found (`lc110-secret-scan.json`). This is not a full history/advisory/license audit. public/config.json stays unconfigured; ops/prod_config.json was not copied or used. Only synthetic local services/records were exercised.

Final input parity: `lc110-input-parity.json` records zero workspace or execution-copy drift across 707 input files. `lc110-snapshot-check.json` retains the broader raw inventory observation, including generated diagnostics that changed during external/audit runs. Generated evidence changes are explicitly separated from source/test/fixture changes. Later source changes invalidate this review; unrelated regenerated dist outputs are not approval of new code.

## coverage_gaps

- M1: full npm suite, independent oracle and 1,632 scorer comparisons ran; F06 persists. Exhaustive status/raw/shuffle/DOM combinations were not reverified.
- M2/M3: fresh unit/local-browser coverage includes representative restore/timer/two-tab/builder flows. Exhaustive quota/private mode, corruption/quarantine, migration rollback, clock changes, assignment races and real interleavings NOT_RUN; no blanket concurrency/data-recovery certification.
- M4/R1/R2: local transport/store/API/publisher checks ran. Live Google CORS/redirect/write/readback and deployed Neon concurrency/deduplication NOT_RUN: no live service configuration or write authorization used. Client scores/client-bundled keys are not certified for trusted assessment.
- M5: synthetic import/preview tests and actual nested content/asset probes ran. Broad real multi-column/merged-cell/unsupported-equation/media/encrypted/corrupt/scan corpus NOT_RUN. Approved manual PDF is not a missing automatic parser. F03/F08 remain fidelity risks.
- M6: representative six result-page captures were inspected; automated local design/keyboard checks passed. Full manual states across every role and viewport, physical phones, Firefox/WebKit, OS Telex/VNI, screen reader, independent axe/Lighthouse and input-to-paint p95 NOT_RUN; no full WCAG/performance claim.
- Offline: actual local RPC cache exclusion and offline browser tests passed. Full two-version update/migration matrix with active attempts/multiple tabs NOT_RUN.
- Comprehensive dependency advisory/license/history audit and owner milestone/production acceptance NOT_RUN. Deployment, activation and old-service retirement are outside LC110.

## Missing roadmap features ? priority order

1. **P0 / R0 stabilization:** fix F01?F03/F08; reconcile the three npm fixtures (F07), preserving immutable reports, answer keys, portable images, assignment isolation and strict receipt validation. F05/F06 are bounded additional debt.
2. **P1 / R3 / WEB ?23, after R2:** roster CRUD/print; unique four-digit hashed PINs; five-failure/ten-minute server lockout; studentToken/student_id binding; cross-machine report reconstruction; unsubmitted roster rows. Actual handle probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. The full suite has 33 failing R3 tests; a students table/type alone is insufficient.
3. **P1 / R4 / ?24.1, after R0:** integrate all/wrong/blank filters, aria-pressed and question navigation into the actual submitted result page (F04; eight failing acceptance tests).
4. **P2 / R5?R6 / ??24.2?24.3, after R3 (R5), then R5 (R6):** authorized btn-view-submission/submissionDialog and examStats/stat-row; per-question correctness, option distribution and top three wrong III answers. Required production paths absent by fresh source search.
5. **P2 / R7 / ?24.4, after R3:** PIN-backed myHistory/historyChart and accessible text table. Required production paths absent.
6. **P2 / R8 / ?24.5, after R4+R7:** new local wrong/blank/partial-II practice, immutable original final, no teacher submissions. Retry button remains isolated in report/view (F04).
7. **P2 / R9 / ?24.6, after R6:** teacher print with answer sheet and separate answer key; btn-teacher-print production path absent.
8. **P2 / R10 / ?24.7, after R8+R9:** remembered S?ng/T?i/Theo m?y TopBar control; system-dark CSS exists, btnTheme production path absent. Existing dark styles are not completion of the remembered selector.
9. **P3 / R11:** owner-authorized live activation, phone acceptance, recovery/import/privacy/performance matrix, version 1.0 and decision on old-service retirement. Owner acceptance and live-test authorization required when reached; outside this audit.

Custom-only presets, charset, rounding, immediate post-submit explanations and manual PDF remain the approved choices. No new policy selected. NEED_DECISION: NONE for local fixes/approved roadmap; R11 retains its explicit owner gate.

tools_research: NOT_REQUESTED. privacy_notes: synthetic local records only; no real student records, credentials or private instructions included.

recommended_action: F01 ? src/collect; F02/F03/F04/F08 ? src/app; F05 ? src/api; F06 ? src/domain; F07 ? glue with collect/teacher owners. Repair, complete approved missing features and rerun red gates before approval. Report READY_FOR_REVIEW; product CHANGES_REQUESTED.
