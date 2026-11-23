# LC108 - Independent whole-product review

review_id/task_id/worker_id: LC108; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `97e89d699b473fdb557ea914992ef905af3d0cb1`; branch: main; includes the existing dirty working tree.
requirements_version: Shared Product Contract v2.0 (precedence), full WEB-contract.md sections 1-24 and inherited M1 signatures, approved decisions in WEB section 14, DESIGN.md and LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** All eight LC107 findings remain freshly reproducible: six MAJOR and two MINOR. Required npm gate remains red. F08 now also has fresh evidence of automatic cross-origin fetching from untrusted asset data; this is grouped under the same unsafe asset-resolution boundary. Handoff: READY_FOR_REVIEW; no product/milestone approval. NEED_DECISION: NONE for these local fixes and the approved roadmap.

## Snapshot and boundaries

Only intentional workspace write: `docs/reviews/LOOP-108-codex.md`. No source/test changes, install, dependency changes, commit, branch/worktree, deploy or live-service writes. Applicable AGENTS.md search found none. E = `%USERPROFILE%/AppData/Local/Temp/LC108-audit-og96jkz0/` contains a physical execution copy, logs and probes, using copied installed dependencies without installation. All checks ran there to keep generated output outside the allowed workspace scope.

Fresh git log/diff/status read. HEAD is unchanged since LC107; current product/build/Apps Script diff against HEAD is 18 files, 949 insertions and 170 deletions; package/lock have no diff. Comparing current inputs with LC107 shows no source/build/test implementation change. Differences are generated diagnostic artifacts; five JSON evidence files differ within LC107's original 460-key manifest. The broader LC108 inventory also includes CSS, Python and generated test artifacts. `lc108-inputs.json` records SHA-256 for 721 inputs; `lc108-comparison.json` records initial copy parity (zero mismatches for the first 719 inputs; the remaining two are subsequently copied legacy stylesheet files). `lc108-snapshot-check.json` verifies zero original-input drift at its check. The prior review served as an index; the findings below were rechecked against current source and fresh reproductions.

files_reviewed: dirty diffs in src/api handle/stores/types; src/app main/authoring/exam-list; src/collect; src/import/docx and pdf; src/report; src/schema; src/student; src/teacher; scripts/web-build.ts and apps-script/Code.js. Focused unchanged paths: domain rational/scoring/short-answer/shuffle, storage finalization/outbox CAS, student finalization, report recomputation, UI asset safety, importer preview/confirmation, bank and offline/build/publisher callers. This is a risk-based whole-product review with automated suites, not a fresh line-by-line reading of every unchanged file or exhaustive acceptance.

## Findings

### LC108-F01 — MAJOR — Concurrent drains bypass the durable send budget

- status: VERIFIED; LC107-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:424`, `:454–469`, `:491`, `:640`; CAS boundary `src/storage/index.ts:977`.
- evidence: E/lc108-probes.log shows six actual transport calls, durable state `sending`, `retryCount=0`, `generation=8`. Existing `sending` is accepted; budget consumption happens after the asynchronous response/error.
- reproduction_steps: run `node LC51-probes.mjs` in E. Finalize synthetic hoa-repeating using MemoryTransactionAdapter, enqueue, call drainOutbox six times five milliseconds apart with unresolved transport promises, inspect outbox, then resolve all with HTTP 503.
- expected: Shared §3 / WEB §7 require a bounded durable retry budget across concurrent callers/recovery.
- actual/impact: six requests start despite a five-send budget; repeated callers or crashes before receipts can evade the bound. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a send attempt and active lease before calling transport; refuse/coalesce active leases and recover expired leases without resetting consumed budget. Preserve tuple/hash/generation pinning and terminal confirmation. An in-process mutex alone does not cover separate tabs.
- regression_test: unresolved sends from concurrent clients, lost receipts, crash/reload and expired-lease recovery; one active dispatch, at most five actual sends per budget, immutable final/hash and no late confirmation downgrade.

### LC108-F02 — MAJOR — Switching exams during HTML export crashes the download

- status: VERIFIED; LC107-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:3104`, `:3177–3185`, `:3210–3216`, `:3282–3315`.
- evidence: E/download-race.json and E/lc108-download.log: `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, title `New exam B`.
- reproduction_steps: run `node download-race.mjs` with the teardown preloads described below. Submit A with an internal image; defer image fetch during download, load B through retained hidden examFileInput, then release A's fetch.
- expected: Shared §2 / WEB §§3,20: export A's complete immutable report or explicitly cancel with recoverable feedback.
- actual/impact: the async handler reads mutable currentExam/order/responses/scoredResult after awaiting. Loading B clears A's score and creates an unhandled export rejection. Mixed-identity output remains a source risk; no mixed downloaded file was observed.
- minimal_fix: capture the entire immutable report, assets and filename before the first await; use captured data exclusively afterward and surface asset/export failures.
- regression_test: defer A's asset, open B, release fetch; one complete A report retaining title/version/order/answers/score, or explicit cancellation. Cover failed assets and concurrent exports.

### LC108-F03 — MAJOR — Math inside table cells disappears silently

- status: VERIFIED; LC107-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:415–428`, `:1689`, `:3094`, `:3282`.
- evidence: E/lc108-nested.log and lc83-independent.json: the accepted table cell includes text, image and math source `x^2+83`; visible stem text is only `NESTED-TEXT`. The nested-math assertion fails. The cell loop handles only text/image, dropping math and nested tables.
- reproduction_steps: `node --test lc83-independent.test.mjs` in E; load its canonical synthetic exam, inspect the cell, submit and download. The downloadable report uses the same helper. Whole-file `hasMath=true` in the diagnostic is not proof of preservation; the synthetic ID/title also contains 83.
- expected: Shared §6 / WEB §§4,8,20 preserve recursive Cell.blocks, or show labeled unsupported source with a warning.
- actual/impact: legitimate question content vanishes and can prevent solving the question. No claim that a specific real DOCX was corrupted.
- minimal_fix: one recursive safe renderer for text/math/image/table at every depth, preserving and labeling unsupported OMML/source.
- regression_test: mixed cell content and nested tables through exam → final → report → portable HTML, scoped to question content; include unsupported math and hostile escaped text.

### LC108-F04 — MAJOR — Required review controls remain outside the real result page

- status: VERIFIED; LC107-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:535–573`, `:2992–3097`; isolated controls `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: E/lc108-report-controls.log: `cards=2, filter=false, nav=false, retry=false`. App builds its own report; source search locates these controls only in the isolated report view.
- reproduction_steps: `node LC51-browser-probe.mjs` in E. Submit synthetic I+III under local `/Cunata/` and inspect `#reviewFilter`, `#reviewNav`, `#btnRetryWrong`. R4 acceptance tests exercise the submitted page.
- expected: WEB §§24.1,24.5 require all/wrong/blank filters with aria-pressed, question navigation, and independent retry practice without teacher submission.
- actual/impact: controls implemented in isolation are unreachable in the product. Filter/navigation are R4 debt; retry practice also depends on R7/R8.
- minimal_fix: integrate the report projection/actions/lifecycle. Retry uses a fresh local practice ID/snapshot, clears assignment/collector linkage and preserves the original immutable final.
- regression_test: actual submit → filter → navigate including hidden targets → retry wrong/blank/partial-II → refresh; original result unchanged, zero submitResult calls for practice.

### LC108-F05 — MINOR — Assignment accepts a nonexistent exam

- status: VERIFIED; LC107-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396–405`.
- evidence: E/lc108-probes.log records HTTP 200/success=true and one persisted assignment for `does-not-exist` with an empty trusted catalog. Null getExam bypasses the ownership condition.
- reproduction_steps: `node LC51-probes.mjs`; seed synthetic active teacher/session/owned class in MemoryStore; assign an unknown exam with valid openAt and `dueAt:""`; inspect assignments.
- expected: reject nonexistent/deleted exams before persistence; allow authorized published or trusted catalog exams.
- actual/impact: an orphan assignment is accepted and students cannot load its exam. No cross-owner write was demonstrated.
- minimal_fix: require an allowed published exam or trusted catalog membership; otherwise NOT_FOUND/INVALID_EXAM and no write. Retain foreign-owner rejection and no-due semantics.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog pass, foreign-owner fails FORBIDDEN; `dueAt:""` remains supported.

### LC108-F06 — MINOR — Public fraction parser is not the formatter's strict inverse

- status: VERIFIED; LC107-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel API `toFractionString(rational(10n**200n))` yields a canonical 201-character integer, then parseFractionString throws SyntaxError.
- expected: M1 §4.1 specifies a strict inverse for these public functions.
- actual/impact: valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: separate bounded untrusted DTO parsing from general rational conversion, or reconcile the public inverse contract without removing ingress resource protection.
- regression_test: signed integer/fraction roundtrips at length boundaries plus oversized untrusted DTO rejection and existing scoring cases.

### LC108-F07 — MAJOR — Required npm gate still fails three tests

- status: VERIFIED; LC107-F07 persists. **VÙNG chịu trách nhiệm: glue**, consulting src/collect and src/teacher.
- affected_files: `test/collect/apiBase.test.ts:41` / send `:66`; `test/collect/r0-f04-regression.test.ts:6` / send `:96`; `test/teacher/portal.test.ts:557` / assertion `:608`.
- evidence: fresh isolated npm.cmd test exits 1: 1,625 tests, 345 suites, 1,622 pass, 3 fail, no skipped/cancelled/todo. E/lc108-npm.log includes full stacks.
- reproduction_steps: build the complete execution copy E, then run `npm.cmd test` without an overlapping standalone build.
- expected: required full suite green without weakening assertions or production validation.
- actual/impact: apiBase fixture omits attempt_id/recorded_at → RECEIPT_INVALID; r0-f04 fixture returns ok:true rather than success:true → BAD_RESPONSE; teacher fixture lacks owner/current teacher identity while `src/teacher/portal.ts:1689–1716` filters ownership. Each independently keeps the required gate red. Fixture failures alone do not establish a production authorization bypass.
- minimal_fix: reconcile response fixtures and owner/port metadata with the actual contract. Preserve malformed/mismatched receipt rejection, raw answers, assignment isolation and authorization. Do not restore publish-based ownership probing or weaken receipt validation.
- regression_test: these three tests, full npm suite and relevant browser receipt/ownership checks.

### LC108-F08 — MAJOR — Unvalidated asset data breaks embedded images and triggers foreign requests

- status: VERIFIED; LC107-F08 persists; freshly reproduced in LC108. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:375–382`, `:407–408`, `:1689`, `:3094`; permissive ingress `src/schema/exam.ts:82-98`, `:594-626`; safe existing resolver `src/ui/security.ts:152–173`.
- evidence: E/lc107-asset.json and E/lc108-asset.log: parseOk=true; actual stem and report img src equals raw PNG base64, both complete=true/naturalWidth=0. The exact same PNG prefixed `data:image/png;base64,` has naturalWidth=1. HTML export includes the correct data URL, so browser display and download diverge.
- reproduction_steps: `node lc107-asset.mjs` with teardown preloads. Build a synthetic valid I exam, assets=[{assetId:'diagram',mime:'image/png',data:<raw base64>,alt:'required diagram'}], question blocks=[{type:'image',assetId:'diagram',alt:'required diagram'}]. Load, inspect the image after settling, submit and inspect the report; compare a control Image with a data URL. The probe contains the complete minimal PNG.
- additional evidence in LC108: `E/lc108-external-asset.json`, produced by `node lc108-external-asset.mjs` (exit 0). A valid synthetic exam with `assets[0].data = http://127.0.0.1:<second-port>/tracking.png?synthetic=LC108` passes parseExam. Merely loading the exam sends one GET to that second origin, including the app-origin Referer, and displays the image with naturalWidth=1. The receiver is a synthetic loopback server; no external service was contacted. Run the probe to reproduce. This demonstrates an actual request, not just an unsafe-looking DOM string; no real PII exfiltration was tested.
- expected: the accepted Asset representation renders embedded data correctly; WEB sections 4.1 and 9 require safe assets and no automatic external tracking. Untrusted asset data must not become an arbitrary fetch URL. The shared resolver supports raw base64.
- actual/impact: resolveAssetSrc returns raw data unchanged, so the browser treats it as a relative URL and the image is broken. Questions dependent on a diagram cannot be answered correctly. No missing-image warning appears. This is independent of F03's dropped math. The same direct assignment permits URLs to initiate automatic foreign requests, exposing network/referrer metadata to an exam-supplied receiver.
- minimal_fix: use the shared safe asset resolver or normalize raw base64 to a validated MIME-specific data URL before rendering; preserve checked internal SVG rules and reject unsafe content consistently. Reject URL-valued embedded asset data at ingress and/or render through a strict shared resolver; do not construct arbitrary executable data URLs.
- regression_test: actual app load → submit → review → download with PNG/JPEG/WebP assets supplied as raw base64 and data URLs, including nested cells. Assert decoded dimensions and no unintended relative-image request; retain unsafe SVG/MIME rejection. Include URL-valued asset data with a second-origin local receiver and require zero receiver requests during exam, report and export.

## checks_run

Environment: Windows/PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0; existing local headless Chromium/CDP harness. npm.cmd/npx.cmd are Windows equivalents of the requested commands. All commands below were executed fresh in E. Build completed before the authoritative npm run; no separate build overlapped it. Diagnostic exit 0 means the reproduction completed, not that the product passed.

| Command in E | Exit | Fresh result | Log / seconds |
| --- | ---: | --- | --- |
| `node scripts/build.js` | 0 | PASS; modules/API emitted and verified | lc108-build-fixed.log / 1.938 |
| `npm.cmd test` | 1 | FAIL; 1,625 tests, 345 suites; 1,622 pass, 3 fail; 0 skip/cancel/todo | lc108-npm-fixed.log / 28.953 |
| `npx.cmd --no-install tsc -p tsconfig.json` | 0 | PASS | lc108-tsc.log / 1.531 |
| `npx.cmd --no-install tsc -p tsconfig.web.json` | 0 | PASS | lc108-tsc-web.log / 1.531 |
| `python -B test/oracle/oracle.py --check` | 0 | PASS; 11 tests, 1,632 fixtures, 5,849 maxima configurations, 9 negative controls | lc108-oracle.log / 1.188 |
| `node LC51-differential.mjs` | 0 | PASS; actual total/max and each section score/max versus independent expected values, 1,632 cases | lc108-differential.log / 0.156 |
| `node LC51-probes.mjs` | 0 | Diagnostic: F01/F05/F06 reproduced; six R3 actions UNKNOWN_ACTION | lc108-probes.log / 0.250 |
| `node --test lc83-independent.test.mjs` | 1 | FAIL; 5 tests, 3 pass, 2 fail including parent; nested math lost | lc108-nested.log / 2.594 |
| `node download-race.mjs` | 0 | Diagnostic: null totalFraction rejection, zero downloads, B active | lc108-download.log / 3.281 |
| `node LC51-browser-probe.mjs` | 0 | Diagnostic: two cards; filter/navigation/retry absent | lc108-report-controls.log / 1.719 |
| `node lc107-asset.mjs` | 0 | Diagnostic: accepted raw-base64 image broken in exam/report, prefixed control decodes 1px | lc108-asset.log / 2.391 |
| `node lc108-external-asset.mjs` | 0 | Diagnostic: accepted URL-valued asset produces one second-origin GET with Referer; naturalWidth=1 | lc108-external-asset.json and tool output / 3.212 wall |
| `node --test --test-timeout=90000 test/app/r2-f01-service-worker.test.mjs` | 0 | PASS; 3 tests, including real local browser RPC cache exclusion | lc108-sw.log / 1.765 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/claude-check/**/*.test.mjs` | 0 | PASS; 104 tests, 5 suites, 0 skip/cancel/todo | lc108-claude.log / 68.469 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` | 1 | FAIL; 264 tests, 2 suites; 223 pass, 41 fail; 0 skip/cancel/todo | lc108-codex.log / 201.234 |

The completed Codex run has no ENOENT/setup errors: 22 failures are R3 API tests (`test/codex-check/feat/R3/api.test.mjs:4`), 11 are R3 browser tests (`test/codex-check/feat/R3/browser.test.mjs:12`), eight are R4 tests (`test/codex-check/feat/R4/review.test.mjs:112`, `:125`, `:132`, `:142`, `:153`, `:168`). R3 lacks roster/PIN/history actions and UI; R4 lacks integrated filtering/navigation (F04). These are unfinished approved features, not 41 independently proved authorization exploits. Counts come from this complete run; no arithmetic combination with prior or targeted runs.

Execution-copy setup correction: the first build exited 1 because I omitted `styles/style.css` from the copy. The first npm run exited 1 with 1,625 tests: 1,606 pass, 17 fail, two skip. Those results include missing-build/setup failures and are preserved in lc108-build.log/lc108-npm.log, not attributed to production. After copying the actual legacy styles and required local support files without changing source/assertions, a fresh build passed and the full npm rerun above produced the authoritative 1,622/3/0 result. No separate build overlapped either npm run. No installation occurred.

`lc108-gates.json`, `lc108-fixed-gates.json` and `lc108-probe-gates.json` preserve actual commands/exits/timings. Existing inspected `ops/blitz/promoted/_support/runtime.mjs` and `teardown-http.mjs` were preloaded for browser/probe teardown only: they release Browser.close acknowledgement and HTTP keepalive teardown handles. Assertions/product code were unchanged. GIT_DIR/GIT_WORK_TREE pointed to the original repository for read-only provenance where needed. Only synthetic loopback services were used; public/config.json has an empty Apps Script URL and ops/prod_config.json was not copied. No live Google/Neon/production endpoints were tested or written.

Fresh positive probes: browsing owned exams preserves revision and sends zero publish requests; a saved B answer key survives publication; nested image export is portable. Independent differential scoring covers total/max and section score/max, not every status/raw/shuffle/DOM permutation. A bounded scan of 135 TS/JS/MJS/JSON files under src/scripts/apps-script/public found no private-key markers, Google/GitHub token patterns or credentialed PostgreSQL URLs (`lc108-secret-scan.json`); not a comprehensive history/advisory audit.

Final snapshot: HEAD and all source/build/config/test implementation inputs are unchanged. Five original generated R3 failure JSON artifacts changed during the review (names in `lc108-final-snapshot.json`); they are evidence-output drift, not reviewed implementation changes, and were not written by this audit. Earlier `lc108-snapshot-check.json` had zero drift across all 721 inventoried inputs at its check. Generated audit tests/logs/screenshots/builds remain in E. Source changes after this snapshot invalidate the review.

## coverage_gaps

- M1: full unit suite, independent oracle and 1,632 actual scorer comparisons are fresh; F06 remains. Exhaustive status/raw/shuffle/DOM combinations not reverified.
- M2/M3: unit and local browser checks cover representative restore/timer/two-tab/builder flows. Exhaustive quota/private browsing, corrupted migration/quarantine, clock changes, assignment races and real tab interleavings NOT_RUN; no blanket persistence/concurrency certification.
- M4/R1/R2: local service/transport/store/publisher simulations; live Google CORS/redirect/write/readback and deployed Neon concurrency/deduplication NOT_RUN. No live configuration or service-write authorization used. Client-bundled keys/client scores are not certified for trusted assessment.
- M5: synthetic import tests and actual content probes; F03/F08 affect fidelity. Broad real multi-column/merged-cell/unsupported-equation/media/encrypted/corrupt/scan corpus NOT_RUN. Approved manual PDF is not a missing automatic parser.
- M6: fresh local responsive/component light/dark/keyboard checks do not replace full manual acceptance at 375/768/1440px. Physical phones, Firefox/WebKit, OS Telex/VNI, screen reader, independent axe/Lighthouse, input-to-paint p95 NOT_RUN; no complete WCAG/performance claim.
- Offline: RPC cache exclusion and local offline tests ran; full two-version update/migration matrix across active attempts/tabs NOT_RUN.
- Comprehensive dependency advisory/license/history audit, owner milestone/production acceptance NOT_RUN. Deployment/activation/service retirement are outside LC108.

## Missing roadmap features — priority order

1. **P0 / R0 stabilization:** fix F01–F03/F08 and reconcile the three npm fixtures (F07), preserving immutable reports, saved answer keys, portable images, assignment isolation and receipt checks. F05/F06 are bounded additional debt.
2. **P1 / R3 / WEB §23, after R2:** roster CRUD/print, unique hashed four-digit PINs, five-failure/ten-minute server lockout, studentToken/student_id binding, cross-machine report reconstruction and unsubmitted roster rows. Fresh actual-handle probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table/type is insufficient.
3. **P1 / R4 / §24.1, after R0:** integrate all/wrong/blank filters, aria-pressed and review navigation into the actual submitted result page (F04).
4. **P2 / R5–R6 / §§24.2–24.3, after R3 (R5), then R5 (R6):** authorized btn-view-submission/submissionDialog and examStats/stat-row; per-question accuracy, choice distributions and top three wrong III responses. Production UI paths absent by source search.
5. **P2 / R7 / §24.4, after R3:** PIN-backed myHistory/historyChart with accessible table. Production paths absent.
6. **P2 / R8 / §24.5, after R4+R7:** independent wrong/blank/partial-II practice; original final immutable, zero teacher submissions. Retry button remains isolated in report/view (F04).
7. **P2 / R9 / §24.6, after R6:** teacher print with answer sheet and separate key; btn-teacher-print production path absent.
8. **P2 / R10 / §24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists, btnTheme production path absent.
9. **P3 / R11:** owner-authorized live activation, phone acceptance, recovery/import/privacy/performance matrix, version 1.0 and old-service-retirement decision. Requires owner gate when reached, outside this audit.

Custom-only presets, current charset/rounding/release policy and manual PDF remain the approved choices. No new policy selected. NEED_DECISION: NONE for local fixes/approved roadmap; R11 still requires explicit owner acceptance and live-test authorization.

tools_research: NOT_REQUESTED. privacy_notes: synthetic local records; no real student data, credentials or private instructions in this report.

recommended_action: F01 → src/collect; F02/F03/F04/F08 → src/app; F05 → src/api; F06 → src/domain; F07 → glue with collect/teacher owners. Repair and rerun the red gates before approval. Report READY_FOR_REVIEW; product CHANGES_REQUESTED.
