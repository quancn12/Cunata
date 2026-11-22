# LC107 — Independent whole-product review

review_id/task_id/worker_id: LC107; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `97e89d699b473fdb557ea914992ef905af3d0cb1`; branch: main; review includes the existing dirty working tree.
requirements_version: Shared Product Contract v2.0 (precedence), WEB-contract.md §§1–24 and inherited M1 signatures, approved decisions in WEB §14, DESIGN.md, LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** LC106-F01–F07 remain reproducible. New LC107-F08 demonstrates accepted embedded images disappearing from the actual exam/report. Six MAJOR findings including the required npm gate failure, two MINOR findings. Handoff: READY_FOR_REVIEW; no product/milestone approval. NEED_DECISION: NONE for the documented local repairs.

## Snapshot and review boundaries

Only intentional workspace write: `docs/reviews/LOOP-107-codex.md`. No code/test edits, install, dependency changes, commit, branch/worktree, deployment, or live-service writes. Project AGENTS.md search returned none. All generated build output, logs and synthetic probes are outside the workspace, in **E = `%USERPROFILE%/AppData/Local/Temp/LC107-audit-_isqn3rf/`**. This is a physical execution copy using the already-installed dependencies, not a Git worktree. The attempted dependency symlink failed with WinError 1314; ordinary copying succeeded without installation.

HEAD matches LC106. Fresh git log/diff/status were read; existing product/build/Apps Script diff against HEAD spans 18 files, 949 insertions and 170 deletions. Package/lock have no git diff. E/lc107-inputs.json records SHA-256 for 460 code/config/test inputs; E/lc107-comparison.json verifies the execution copy and original inputs matched. Compared with LC106's execution copy, only seven generated JSON browser-evidence files differ: no source/build/test implementation change. Prior findings were used as an index, then source and reproductions were checked again. Prior PASS claims were not substituted for fresh execution.

files_reviewed: current git boundaries and dirty diffs in src/api (handle, stores, types), src/app (main, authoring, exam-list), src/collect, src/import/docx and pdf, src/report, src/schema, src/student, src/teacher, scripts/web-build.ts and apps-script/Code.js; focused unchanged domain scoring/rational/short-answer/shuffle, storage outbox CAS, UI asset safety, importer confirmation, offline/build/publisher and their callers/tests. Risk-based whole-product review and full automated suites are not a fresh line-by-line reading of every unchanged file or exhaustive acceptance.

## Findings

### LC107-F01 — MAJOR — Concurrent drains bypass the durable send budget

- status: VERIFIED; LC106-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:424`, `:454–469`, `:491`, `:640`; CAS boundary `src/storage/index.ts:977`.
- evidence: E/lc107-probes.log shows six actual transport calls, durable state `sending`, `retryCount=0`, `generation=8`. Existing `sending` is accepted; budget consumption happens after the asynchronous response/error.
- reproduction_steps: run `node LC51-probes.mjs` in E. Finalize synthetic hoa-repeating using MemoryTransactionAdapter, enqueue, call drainOutbox six times five milliseconds apart with unresolved transport promises, inspect outbox, then resolve all with HTTP 503.
- expected: Shared §3 / WEB §7 require a bounded durable retry budget across concurrent callers/recovery.
- actual/impact: six requests start despite a five-send budget; repeated callers or crashes before receipts can evade the bound. Duplicate live database rows were not demonstrated.
- minimal_fix: atomically reserve a send attempt and active lease before calling transport; refuse/coalesce active leases and recover expired leases without resetting consumed budget. Preserve tuple/hash/generation pinning and terminal confirmation. An in-process mutex alone does not cover separate tabs.
- regression_test: unresolved sends from concurrent clients, lost receipts, crash/reload and expired-lease recovery; one active dispatch, at most five actual sends per budget, immutable final/hash and no late confirmation downgrade.

### LC107-F02 — MAJOR — Switching exams during HTML export crashes the download

- status: VERIFIED; LC106-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:3104`, `:3177–3185`, `:3210–3216`, `:3282–3315`.
- evidence: E/download-race.json and E/lc107-download.log: `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, title `New exam B`.
- reproduction_steps: run `node download-race.mjs` with the teardown preloads described below. Submit A with an internal image; defer image fetch during download, load B through retained hidden examFileInput, then release A's fetch.
- expected: Shared §2 / WEB §§3,20: export A's complete immutable report or explicitly cancel with recoverable feedback.
- actual/impact: the async handler reads mutable currentExam/order/responses/scoredResult after awaiting. Loading B clears A's score and creates an unhandled export rejection. Mixed-identity output remains a source risk; no mixed downloaded file was observed.
- minimal_fix: capture the entire immutable report, assets and filename before the first await; use captured data exclusively afterward and surface asset/export failures.
- regression_test: defer A's asset, open B, release fetch; one complete A report retaining title/version/order/answers/score, or explicit cancellation. Cover failed assets and concurrent exports.

### LC107-F03 — MAJOR — Math inside table cells disappears silently

- status: VERIFIED; LC106-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:415–428`, `:1689`, `:3094`, `:3282`.
- evidence: E/lc107-nested.log and lc83-independent.json: the accepted table cell includes text, image and math source `x^2+83`; visible stem text is only `NESTED-TEXT`. The nested-math assertion fails. The cell loop handles only text/image, dropping math and nested tables.
- reproduction_steps: `node --test lc83-independent.test.mjs` in E; load its canonical synthetic exam, inspect the cell, submit and download. The downloadable report uses the same helper. Whole-file `hasMath=true` in the diagnostic is not proof of preservation; the synthetic ID/title also contains 83.
- expected: Shared §6 / WEB §§4,8,20 preserve recursive Cell.blocks, or show labeled unsupported source with a warning.
- actual/impact: legitimate question content vanishes and can prevent solving the question. No claim that a specific real DOCX was corrupted.
- minimal_fix: one recursive safe renderer for text/math/image/table at every depth, preserving and labeling unsupported OMML/source.
- regression_test: mixed cell content and nested tables through exam → final → report → portable HTML, scoped to question content; include unsupported math and hostile escaped text.

### LC107-F04 — MAJOR — Required review controls remain outside the real result page

- status: VERIFIED; LC106-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:535–573`, `:2992–3097`; isolated controls `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: E/lc107-report-controls.log: `cards=2, filter=false, nav=false, retry=false`. App builds its own report; source search locates these controls only in the isolated report view.
- reproduction_steps: `node LC51-browser-probe.mjs` in E. Submit synthetic I+III under local `/Cunata/` and inspect `#reviewFilter`, `#reviewNav`, `#btnRetryWrong`. R4 acceptance tests exercise the submitted page.
- expected: WEB §§24.1,24.5 require all/wrong/blank filters with aria-pressed, question navigation, and independent retry practice without teacher submission.
- actual/impact: controls implemented in isolation are unreachable in the product. Filter/navigation are R4 debt; retry practice also depends on R7/R8.
- minimal_fix: integrate the report projection/actions/lifecycle. Retry uses a fresh local practice ID/snapshot, clears assignment/collector linkage and preserves the original immutable final.
- regression_test: actual submit → filter → navigate including hidden targets → retry wrong/blank/partial-II → refresh; original result unchanged, zero submitResult calls for practice.

### LC107-F05 — MINOR — Assignment accepts a nonexistent exam

- status: VERIFIED; LC106-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396–405`.
- evidence: E/lc107-probes.log records HTTP 200/success=true and one persisted assignment for `does-not-exist` with an empty trusted catalog. Null getExam bypasses the ownership condition.
- reproduction_steps: `node LC51-probes.mjs`; seed synthetic active teacher/session/owned class in MemoryStore; assign an unknown exam with valid openAt and `dueAt:""`; inspect assignments.
- expected: reject nonexistent/deleted exams before persistence; allow authorized published or trusted catalog exams.
- actual/impact: an orphan assignment is accepted and students cannot load its exam. No cross-owner write was demonstrated.
- minimal_fix: require an allowed published exam or trusted catalog membership; otherwise NOT_FOUND/INVALID_EXAM and no write. Retain foreign-owner rejection and no-due semantics.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog pass, foreign-owner fails FORBIDDEN; `dueAt:""` remains supported.

### LC107-F06 — MINOR — Public fraction parser is not the formatter's strict inverse

- status: VERIFIED; LC106-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel API `toFractionString(rational(10n**200n))` yields a canonical 201-character integer, then parseFractionString throws SyntaxError.
- expected: M1 §4.1 specifies a strict inverse for these public functions.
- actual/impact: valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: separate bounded untrusted DTO parsing from general rational conversion, or reconcile the public inverse contract without removing ingress resource protection.
- regression_test: signed integer/fraction roundtrips at length boundaries plus oversized untrusted DTO rejection and existing scoring cases.

### LC107-F07 — MAJOR — Required npm gate still fails three tests

- status: VERIFIED; LC106-F07 persists. **VÙNG chịu trách nhiệm: glue**, consulting src/collect and src/teacher.
- affected_files: `test/collect/apiBase.test.ts:41` / send `:66`; `test/collect/r0-f04-regression.test.ts:6` / send `:96`; `test/teacher/portal.test.ts:557` / assertion `:608`.
- evidence: fresh isolated npm.cmd test exits 1: 1,625 tests, 345 suites, 1,622 pass, 3 fail, no skipped/cancelled/todo. E/lc107-npm.log includes full stacks.
- reproduction_steps: build E, then run `npm.cmd test` without an overlapping standalone build.
- expected: required full suite green without weakening assertions or production validation.
- actual/impact: apiBase fixture omits attempt_id/recorded_at → RECEIPT_INVALID; r0-f04 fixture returns ok:true rather than success:true → BAD_RESPONSE; teacher fixture lacks owner/current teacher identity while `src/teacher/portal.ts:1689–1716` filters ownership. Each independently keeps the required gate red. Fixture failures alone do not establish a production authorization bypass.
- minimal_fix: reconcile response fixtures and owner/port metadata with the actual contract. Preserve malformed/mismatched receipt rejection, raw answers, assignment isolation and authorization. Do not restore publish-based ownership probing or weaken receipt validation.
- regression_test: these three tests, full npm suite and relevant browser receipt/ownership checks.

### LC107-F08 — MAJOR — Accepted raw-base64 assets become broken exam/report images

- status: VERIFIED; newly demonstrated in LC107. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:375–382`, `:407–408`, `:1689`, `:3094`; accepted asset preservation `src/schema/exam.ts:594–626`; safe existing resolver `src/ui/security.ts:152–173`.
- evidence: E/lc107-asset.json/log: parseOk=true; actual stem and report img src equals raw PNG base64, both complete=true/naturalWidth=0. The exact same PNG prefixed `data:image/png;base64,` has naturalWidth=1. HTML export includes the correct data URL, so browser display and download diverge.
- reproduction_steps: `node lc107-asset.mjs` with teardown preloads. Build a synthetic valid I exam, assets=[{assetId:'diagram',mime:'image/png',data:<raw base64>,alt:'required diagram'}], question blocks=[{type:'image',assetId:'diagram',alt:'required diagram'}]. Load, inspect the image after settling, submit and inspect the report; compare a control Image with a data URL. The probe contains the complete minimal PNG.
- expected: the accepted Asset representation renders the embedded image in both exam and result; the existing UI resolver explicitly supports raw base64 payloads.
- actual/impact: resolveAssetSrc returns raw data unchanged, so the browser treats it as a relative URL and the image is broken. Questions dependent on a diagram cannot be answered correctly. No missing-image warning appears. This is independent of F03's dropped math.
- minimal_fix: use the shared safe asset resolver or normalize raw base64 to a validated MIME-specific data URL before rendering; preserve checked internal SVG rules and reject unsafe content consistently. Do not construct arbitrary executable data URLs.
- regression_test: actual app load → submit → review → download with PNG/JPEG/WebP assets supplied as raw base64 and data URLs, including nested cells. Assert decoded dimensions and no unintended relative-image request; retain unsafe SVG/MIME rejection.

## checks_run

Environment: Windows/PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0; local headless Chromium via existing native CDP harness. npm.cmd/npx.cmd are the Windows equivalents of the requested npm/npx commands. Build precedes npm; no separate build overlaps npm. Every command below ran in this invocation on the physical copy. Diagnostic success means reproduction completed, not product approval.

| Command in E | Exit | Fresh result | Log / seconds |
| --- | ---: | --- | --- |
| `node scripts/build.js` | 0 | PASS; modules/API emitted and verified | lc107-build.log / 2.078 |
| `npm.cmd test` | 1 | FAIL; 1,625 tests, 345 suites; 1,622 pass, 3 fail; 0 skip/cancel/todo | lc107-npm.log / 29.820 |
| `npx.cmd --no-install tsc -p tsconfig.json` | 0 | PASS | lc107-tsc.log / 1.487 |
| `npx.cmd --no-install tsc -p tsconfig.web.json` | 0 | PASS | lc107-tsc-web.log / 1.465 |
| `python -B test/oracle/oracle.py --check` | 0 | PASS; 11 tests, 1,632 fixtures, 5,849 maxima configurations, 9 negative controls | lc107-oracle.log / 1.196 |
| `node LC51-differential.mjs` | 0 | PASS; actual domain total/max and section score/max versus independent expected values, 1,632 cases | lc107-differential.log / 0.164 |
| `node LC51-probes.mjs` | 0 | Diagnostic: F01/F05/F06 reproduced; six R3 actions UNKNOWN_ACTION | lc107-probes.log / 0.279 |
| `node --test lc83-independent.test.mjs` | 1 | FAIL; 5 tests, 3 pass, 2 fail including parent; nested math lost | lc107-nested.log / 2.646 |
| `node download-race.mjs` | 0 | Diagnostic: null totalFraction rejection, zero downloads, B active | lc107-download.log / 3.408 |
| `node LC51-browser-probe.mjs` | 0 | Diagnostic: two cards; filter/navigation/retry absent | lc107-report-controls.log / 1.672 |
| `node lc107-asset.mjs` | 0 | Diagnostic: accepted raw-base64 image broken in exam/report, prefixed control decodes 1px | lc107-asset.log / 3.317 |
| `node --test --test-timeout=90000 test/app/r2-f01-service-worker.test.mjs` | 0 | PASS; 3 tests, including real local browser RPC cache exclusion | lc107-sw.log / 1.649 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/claude-check/**/*.test.mjs` | 0 | PASS; 104 tests, 5 suites, 0 skip/cancel/todo | lc107-claude.log / 68.450 |

| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/**/*.test.mjs` | 1 | FAIL; 265 tests, 2 suites; 213 pass, 52 fail; 0 skip/cancel/todo. Includes 11 temporary-copy artifact-directory errors, corrected below | lc107-codex.log / 200.315 |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/cx/schema.test.mjs test/codex-check/cx/student.test.mjs test/codex-check/cx/teacher.test.mjs` | 0 | PASS; all 13 tests in the affected files after creating missing output directories; 0 skip/cancel/todo | lc107-codex-setup-rerun.log / 16.805 |

The full Codex run completed. Eleven failures were ENOENT writes under E/ops/blitz/promoted/_audit/{security,student,teacher}; these were execution-copy setup errors, not product defects. After creating the output folders, all three affected files passed on a targeted rerun, with no source/assertion changes. The other **41 product/roadmap failures** are 22 R3 API tests (`test/codex-check/feat/R3/api.test.mjs:4`), 11 R3 browser tests (`test/codex-check/feat/R3/browser.test.mjs:12`) and eight R4 report tests (`test/codex-check/feat/R4/review.test.mjs:112`, `:125`, `:132`, `:142`, `:153`, `:168`). R3 lacks roster/PIN/history actions and UI; R4 lacks integrated filter/navigation (F04). These are unfinished approved features, not 41 independently established security bugs. The full suite was not rerun after the folder-only repair; do not report a fictional 224/41 or previous-run 223/41 full-suite result. Counts across full and targeted runs are not additive unique coverage.

E/lc107-final-snapshot.json confirms unchanged HEAD, zero drift in the 460 original inputs, and matching execution-copy/original/LC106 bytes for 11 root files including index.html, package/lock and all three tsconfigs.

E/lc107-gates.json and lc107-probe-gates.json record actual commands/exits/timings. Browser/probe runs preload the inspected existing ops/blitz/promoted/_support/runtime.mjs and E/teardown-http.mjs via absolute file URLs in NODE_OPTIONS. They release browser/HTTP teardown handles; no assertion or product-source patch. GIT_DIR/GIT_WORK_TREE point to the original repository for read-only provenance. Synthetic local services only; copied public/config.json has an empty Apps Script URL. No production configuration or live endpoint used.

Fresh positive probes: browsing owned exams keeps revision unchanged with zero publish calls; a saved B answer key survives publication; nested image export is portable. The independent score comparison covers totals/section maxima, not every raw/status/order permutation. A bounded scan of 135 TS/JS/MJS/JSON files in src/scripts/apps-script/public found no private-key markers, Google/GitHub token patterns or credentialed PostgreSQL URLs (E/lc107-secret-scan.json); not a comprehensive secret/history/advisory audit.

## coverage_gaps

- M1: full unit suite, independent oracle and 1,632 actual scorer comparisons are fresh; F06 remains. Exhaustive status/raw/shuffle/DOM combinations not reverified.
- M2/M3: unit and local browser checks cover representative restore/timer/two-tab/builder flows. Exhaustive quota/private browsing, corrupted migration/quarantine, clock changes, assignment races and real tab interleavings NOT_RUN; no blanket persistence/concurrency certification.
- M4/R1/R2: local service/transport/store/publisher simulations; live Google CORS/redirect/write/readback and deployed Neon concurrency/deduplication NOT_RUN. No live configuration or service-write authorization used. Client-bundled keys/client scores are not certified for trusted assessment.
- M5: synthetic import tests and actual content probes; F03/F08 affect fidelity. Broad real multi-column/merged-cell/unsupported-equation/media/encrypted/corrupt/scan corpus NOT_RUN. Approved manual PDF is not a missing automatic parser.
- M6: fresh local responsive/component light/dark/keyboard checks do not replace full manual acceptance at 375/768/1440px. Physical phones, Firefox/WebKit, OS Telex/VNI, screen reader, independent axe/Lighthouse, input-to-paint p95 NOT_RUN; no complete WCAG/performance claim.
- Offline: RPC cache exclusion and local offline tests ran; full two-version update/migration matrix across active attempts/tabs NOT_RUN.
- Comprehensive dependency advisory/license/history audit, owner milestone/production acceptance NOT_RUN. Deployment/activation/service retirement are outside LC107.

## Missing roadmap features — priority order

1. **P0 / R0 stabilization:** fix F01–F03/F08 and reconcile the three npm fixtures (F07), preserving immutable reports, saved answer keys, portable images, assignment isolation and receipt checks. F05/F06 are bounded additional debt.
2. **P1 / R3 / WEB §23, after R2:** roster CRUD/print, unique hashed four-digit PINs, five-failure/ten-minute server lockout, studentToken/student_id binding, cross-machine report reconstruction and unsubmitted roster rows. Fresh actual-handle probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table/type is insufficient.
3. **P1 / R4 / §24.1, after R0:** integrate all/wrong/blank filters, aria-pressed and review navigation into the actual submitted result page (F04).
4. **P2 / R5–R6 / §§24.2–24.3, after R3:** authorized btn-view-submission/submissionDialog and examStats/stat-row; per-question accuracy, choice distributions and top three wrong III responses. Production UI paths absent by source search.
5. **P2 / R7 / §24.4, after R3:** PIN-backed myHistory/historyChart with accessible table. Production paths absent.
6. **P2 / R8 / §24.5, after R4+R7:** independent wrong/blank/partial-II practice; original final immutable, zero teacher submissions. Retry button remains isolated in report/view (F04).
7. **P2 / R9 / §24.6, after R6:** teacher print with answer sheet and separate key; btn-teacher-print production path absent.
8. **P2 / R10 / §24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists, btnTheme production path absent.
9. **P3 / R11:** owner-authorized live activation, phone acceptance, recovery/import/privacy/performance matrix, version 1.0 and old-service-retirement decision. Requires owner gate when reached, outside this audit.

Custom-only presets, current charset/rounding/release policy and manual PDF remain the approved choices. No new policy selected. NEED_DECISION: NONE for local fixes/approved roadmap; R11 still requires explicit owner acceptance and live-test authorization.

tools_research: NOT_REQUESTED. privacy_notes: synthetic local records; no real student data, credentials or private instructions in this report.

recommended_action: F01 → src/collect; F02/F03/F04/F08 → src/app; F05 → src/api; F06 → src/domain; F07 → glue with collect/teacher owners. Repair and rerun the red gates before approval. Report READY_FOR_REVIEW; product CHANGES_REQUESTED.
