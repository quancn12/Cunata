# LC67 — Independent whole-product audit

review_id: LC67; task_id: LC67; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus captured working-tree changes.
requirements_version: Shared Product Contract v2.0; WEB-contract.md §§1–24; inherited M1-scoring-contract; docs/design/DESIGN.md; approved decisions; LO-TRINH-V2.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Six verified findings: four MAJOR and two MINOR. This is not release approval.
NEED_DECISION: NONE for the required fixes or approved roadmap work below. No business policy was changed.

## Scope and provenance

Read the required contracts, Git status/log and LC66; compared current source with LC66's actual retained snapshot, rather than treating HEAD as the previous reviewed working tree. HEAD has not advanced. Initially captured 1,343 inputs from src/test/scripts/docs/public/styles/apps-script, root HTML/configuration/README, ops/publish.py and runtime support. Copied installed node_modules without installation. Snapshot: `%USERPROFILE%/AppData/Local/Temp/LC67-kdsew9hw` (SNAPSHOT below). Source manifests and delta: `source-hashes-initial.json`, `source-hashes.json`, `delta.json`, `git-status-before.txt`.

The substantive LC66-to-LC67 delta is src/app/main.ts, src/collect/appsScript.ts, src/report/{download,view}.ts and new test/collect/r0-f04-regression.test.ts. Other initial differences are previous review output and browser artifacts. During the first gate run, src/app/main.ts and that new regression test changed again in the shared workspace. Preserved their initial captured versions under `initial-inputs/` and the failing logs under `initial-*.log`, then refreshed those two files from the repository without changing their contents. All final gates and browser observations below use the refreshed snapshot. The initial failures are retained, not reported as passes.

files_reviewed: the changed files and related UI→attempt→storage→collector→API→report paths in src/app/main, app/legacy, student/{index,view,area}, storage/index, collect/{index,appsScript}, api/{handle,auth,types,store/memory,store/neon}, domain/{index,rational,scoreAttempt}, schema/exam, report/{index,view,download}, import/docx/segmentation and import/preview, plus build/configuration, contracts, roadmap and relevant tests. Repository-wide searches checked §§23–24 implementation. This is an incremental whole-product audit with fresh whole-suite execution; it does not claim every unchanged line was reread.

All tests/builds/probes and their artifacts run in SNAPSHOT. The only intentional repository write is this report. No production service was called, no dependency installed, no code fixed, no branch/worktree created, no commit and no deployment. For tests requiring Git metadata, GIT_DIR/GIT_WORK_TREE point read-only checks at the original repository. Synthetic names, passwords and endpoints only.

## Findings

### LC67-F01 — MAJOR — Concurrent drains bypass the persisted dispatch budget

- status: VERIFIED; continues LC66-F01. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:437`, `:446`, `:453`, `:475`, `:624`.
- evidence: fresh `probes.log` records `calls=6`, `state=sending`, `retryCount=0`, `generation=8`. The budget is consumed after a response, and no durable sending lease excludes another caller.
- reproduction_steps: run `node LC51-probes.mjs` in SNAPSHOT. Parse hoa-repeating, start/finalize in MemoryTransactionAdapter, enqueue a fixture endpoint, invoke six drains five milliseconds apart with unresolved send promises, inspect durable outbox, then release HTTP503 responses. No network service is involved.
- expected: Shared §3 / WEB §7 bounded retries across concurrent callers, tabs and recovery, at most five dispatches including the first.
- actual/impact: six sends occur before any budget is consumed; further callers/crashes can continue bypassing the limit. Idempotent server writes do not enforce a client dispatch budget.
- minimal_fix: reserve a consumed dispatch and durable sending lease atomically using CAS before transport; reject/coalesce a live lease, recover an expired lease without resetting consumed sends, and retain terminal confirmation/generation protection. A process-local lock alone is insufficient.
- regression_test: separate storage instances concurrently drain delayed transport; one live lease, at most five dispatches; crash/reload before receipt, expired lease, lost receipt and stale callbacks after confirmation; original final/body/hash unchanged.

### LC67-F02 — MINOR — Fraction parser is not the formatter's inverse

- status: VERIFIED; continues LC66-F02. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:118`, `:132`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` uses the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer, but parsing that exact string throws SyntaxError. Both observations are asserted.
- expected: M1 §4.1 strict inverse over the published rational API domain.
- actual/impact: canonical public API roundtrip fails. No wrong score within the approved 1,000-question range was demonstrated; this is not a scoring blocker.
- minimal_fix: retain the inverse contract and limit hostile serialized input at its boundary. Restricting the constructor/formatter/parser domain instead needs a consistent contract revision, not a parser-only cap.
- regression_test: positive/negative integer and fraction roundtrips around 199/200/201 characters, zero, both inverse directions and rejection of noncanonical forms.

### LC67-F03 — MINOR — assignExam persists nonexistent exam IDs

- status: VERIFIED; continues LC66-F03. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: fresh probe gets HTTP200/success=true and one saved assignment for `does-not-exist` with empty trusted catalog. A null published-exam lookup bypasses the ownership check.
- reproduction_steps: `node LC51-probes.mjs`; seed MemoryStore with active teacher, valid hashed session and owned class; POST assignExam with unknown examId, valid openAt and dueAt=""; inspect saved assignments.
- expected: §§19/22 reject an unknown/deleted exam before persisting; permitted published or trusted static catalog exams remain assignable.
- actual/impact: creates an orphan assignment students cannot open, including stale callers after an exam is removed. No cross-owner write was demonstrated.
- minimal_fix: require an allowed published exam or trusted catalog membership and return established NOT_FOUND/INVALID_EXAM otherwise; preserve FORBIDDEN for foreign exams.
- regression_test: unknown/deleted ID causes no write; own/shared published and catalog exams work; foreign owner rejected; no-due behavior unchanged.

### LC67-F04 — MAJOR — Actual app still omits filter, review navigation and retry-wrong

- status: VERIFIED; continues LC66-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`; isolated controls in `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: fresh actual-browser output `cards=2, filter=false, nav=false, retry=false` in `browser-probe.log`. The app still constructs its own report instead of mounting/wiring the isolated renderer's controls.
- reproduction_steps: after successful build, run `node LC51-browser-probe.mjs`. Existing headless Chrome/Edge CDP harness serves dist under /Cunata/, loads synthetic 1I+1III through the hidden file input, submits and inspects report DOM.
- expected: §§24.1/24.5 all/wrong/blank filters with aria-pressed, question navigation and a distinct local retry-wrong attempt explicitly never sent to the teacher.
- actual/impact: approved student features are unavailable despite isolated renderer coverage.
- minimal_fix: integrate these controls with the actual report lifecycle and projection; practice uses a separate immutable snapshot/ID with no collector/assignment linkage, preserving the original final and cleanup.
- regression_test: actual app submission → filters and navigation including hidden targets; retry wrong/blank/partial-II questions; no submitResult or original-final change, including after refresh.

### LC67-F05 — MAJOR — Switching exams while downloading crashes the report

- status: VERIFIED; newly introduced by the async download change. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:3019`, `:3063`, `:3095`, `:3099`, `:3183`, `:3188`, `:3197`.
- evidence: fresh `download-race.json`: errors=["TypeError: Cannot read properties of null (reading 'totalFraction')"], downloads=[], title="New exam B". Intended-behavior assertion fails in `lc67-regressions.log`.
- reproduction_steps: `node download-race.mjs`. Submit exam A with a valid same-origin Markdown image. Delay only the download's image fetch via a controlled promise; click download; load exam B through the existing hidden input while fetch is pending; release the fetch. Observe rejection and captured HTML Blobs. This changes timing, not product source.
- expected: a started download remains bound to A's immutable final/title/responses/order/score/attempt ID, or explicitly cancels with recoverable feedback.
- actual/impact: callback resumes against mutable currentExam/presentationOrder/scoredResult/attemptId; B has cleared scoredResult, so export rejects and produces no HTML. Even where a score exists, mixing report identities is possible; that mixed-score variant was not separately reproduced.
- minimal_fix: capture an immutable complete export model and filename before the first await, render solely from that model, and handle missing assets/fetch failure visibly. Route changes must not substitute active-exam fields into an in-flight export.
- regression_test: delay asset fetch for final A, open B, then resolve; standalone HTML retains A's metadata, score, questions and filename with no rejection. Also test cancellation, failed fetch, repeated clicks and independent concurrent downloads.

### LC67-F06 — MAJOR — Canonical rich blocks disappear in the actual exam and reports

- status: VERIFIED; pre-existing integration gap newly exercised in LC67. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:1604`, `:3009`, `:3168`; supported alternative renderer at `src/student/view.ts:1088`; importer output at `src/import/docx/segmentation.ts:384`, `:385`.
- evidence: `blocks-probe.json`: schemaValid=true, exam.stem="", exam.tables=0, reviewContainsStem=false, downloadContainsStem=false, downloadContainsTable=false. The intended acceptance assertion fails. Main renders only q.content while the schema supports q.blocks and the separate student renderer understands them.
- reproduction_steps: `node blocks-probe.mjs`; generate a valid one-question canonical exam, set content="" and blocks to a text marker plus a one-cell table; assert parseExam accepts it, load through the real app, inspect exam stem, submit, inspect review and actual downloaded HTML. No production endpoint involved.
- expected: Shared §6 / WEB §§4/8/20 preserve and show rich text/table/image/math content from the canonical IR or provide an explicit unsupported-content warning; valid rich content must not silently vanish.
- actual/impact: student sees choices with an empty question; review/download also lose the stem and table. DOCX rich content is at risk because the importer emits blocks alongside flattened content. Loss of a real imported equation/image was not separately claimed from this synthetic text/table probe.
- minimal_fix: use a shared safe Block/asset renderer in actual exam, review and portable export, with consistent rich-content precedence and explicit unsupported flags. Keep table spans, math verification labels and asset safety; do not blindly stringify blocks into HTML.
- regression_test: canonical blocks-only text/table/math/image exam through actual app → submit → reload → downloaded HTML opened alone offline; compare content and spans/asset rendering with the pinned snapshot, including mixed content+blocks and hostile/unsupported content.

## LC66 finding disposition

- LC66-F01/F02/F03/F04 remain open as LC67-F01/F02/F03/F04; freshly reproduced.
- LC66-F05: tested non-identity shuffle now retains screen option letters; independent regression PASS.
- LC66-F06: tested same-origin Markdown SVG is now embedded as a data URI and loads from the isolated file:// report; independent regression PASS. This is not proof that every rich-content/asset case works (see F05/F06).
- LC66-F07: downloaded order now matches the attempt and source includes per-question point/max/status and chosen/correct attributes. Order regression PASS; the previous blanket absence of these fields is no longer reported. Full parity for all valid/invalid question states remains a coverage gap.
- LC66-F08: mutable session/localStorage assignment fallback removed. Independent collector regression PASS: unrelated active assignment B does not contaminate standalone final A. Full final-A/reload/lost-receipt matrix remains a gap. Existing new regression uses an incomplete/cast fixture; the independent regression also exercises the actual port with a canonical exam.

## checks_run

Environment: Windows PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0; existing headless Chrome/Edge CDP harness. No install. Logs redirected by PowerShell are UTF-16. Browser command groups run sequentially; initial build and typechecks ran concurrently against the same captured source with separate logs. Exit zero on a defect-asserting observation probe means reproduction succeeded, not that the defect is fixed.

| Command | Exit | Actual result / SNAPSHOT artifact |
|---|---:|---|
| Initial `node scripts/build.js` | 1 | Captured intermediate source fails TS7006 (optId/oIdx) and TS2345 (optional content); initial-build.log. No dist was promoted in this fresh snapshot. |
| Initial `npx --no-install tsc -p tsconfig.json` and `-p tsconfig.web.json` | 1 each | Same app diagnostics plus invalid new regression port argument/PresentationOrder/responses types; initial-tsc.log, initial-tsc-web.log. |
| Initial `npm test` | 1 | tests1,611/suites345/pass1,595/fail14/skip2/cancelled0; 22,590.4352ms; initial-npm.log. Includes malformed regression and missing-build/cascading integration failures. Not a PASS. |
| Refreshed `node scripts/build.js` | 0 | Successfully emitted/validated/promoted 339 files; build.log. Existing DEP0190 warning remains. |
| Refreshed `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; tsc.log. |
| Refreshed `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; tsc-web.log. |
| Refreshed `npm test` | 0 | tests1,611/suites345/pass1,611/fail0/skip0/cancelled0/todo0; 27,701.8492ms; npm.log. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | tests104/suites5/pass104/fail0/skip0/cancelled0/todo0; 42,893.6927ms; claude.log. Includes real-browser/local simulated-service and design checks. |
| `node LC51-probes.mjs` | 0 | F01/F02/F03 reproduced; six §23 actions UNKNOWN_ACTION; probes.log. |
| `node LC51-differential.mjs` | 0 | Product total/max and each section score/max match 1,632 independent expected fixtures; direct tool output. |
| `python -B test/oracle/oracle.py --check` | 0 | pass11/fail0/skip0; 1,632 fixtures, 5,849 maxima configs, 9 negative controls; 1.5544s reported; direct tool output. Oracle alone is not product execution; differential above is. |
| `node r0-independent.mjs` | 0 | Real built app exam/submit/download/file-open observations; r0-independent.log/json, r0-portable/report.html. |
| `node --test r0-regressions.test.mjs` | 0 | pass4/fail0/skip0; 270.3562ms; r0-regressions.log. |
| `node LC51-browser-probe.mjs` | 0 | Actual report cards2/filterfalse/navfalse/retryfalse; browser-probe.log. |
| `node download-race.mjs` | 0 | F05 observation, unhandled TypeError, zero HTML downloads; download-race.log/json. |
| `node blocks-probe.mjs` | 0 | F06 observation, valid rich blocks missing from actual app/review/download; blocks-probe.log/json. |
| `node --test lc67-regressions.test.mjs` | 1 | pass0/fail2/skip0; 671.1621ms; lc67-regressions.log. Assertions enforce intended behavior on freshly captured observations. |
| `node --test --test-timeout=240000 "test/codex-check/**/*.test.mjs"` | 1 | tests161/suites2/pass155/fail6/skip0/cancelled0; 95,433.0688ms; codex.log. Six CX files fail import because nested support helpers were omitted by snapshot preparation; the other 155 tests pass. These are auditor preparation errors, not demonstrated product defects. |
| `node --test --test-timeout=240000 "test/codex-check/cx/*.test.mjs"` after complete support preparation | 0 | tests51/suites0/pass51/fail0/skip0/cancelled0/todo0; 46,758.3525ms; codex-cx.log. No assertion changed. This is a separate passing CX run, not a claim that the earlier full command passed. |

Copied all seven existing runtime/helper modules unchanged and created existing audit output directory structure in SNAPSHOT for the CX rerun. The runtime helper synthesizes a Browser.close acknowledgement for teardown only; it is not product behavior evidence. No production test assertion was edited or weakened. LC66's CX-AS-03 timeout did not recur in this prepared CX run; that single pass does not establish its historical root cause.

## coverage_gaps

- M1: current differential and independent oracle agree on numeric score/max fields. F02 persists. Raw/status/order/DOM and all boundary combinations are not exhausted; no incorrect score within approved exam limits was shown.
- M2/M3: full suites exercise timer, restore, two-tab/revision, builder/bank and report behavior; independent actual-app report probes supplement them. Full private/quota/migration/media-offline matrix NOT_RUN. Hidden file-input probes establish integration defects but do not certify the class/PIN journey. F06 demonstrates why isolated rich renderer tests are insufficient.
- M4: live Google/Neon/Vercel CORS/SQL concurrency, real write/receipt/readback/deduplication NOT_RUN; no production credentials or writes were authorized/used. Simulated services and captured SQL are not live evidence. Trusted grading/key confidentiality not certified. Complete historical secret/license/dependency audit NOT_RUN.
- M5: importer regression suites run, but broad real DOCX/PDF corpus with merged tables, columns, unsupported OMML, images and corrupt/encrypted/scanned PDFs NOT_RUN. Approved PDF scope remains preview/manual; no automatic OCR/extraction claim.
- M6: design, responsive and keyboard browser checks run; manual visual inspection of every screen/theme/viewport, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse and new independent p95 input-to-paint benchmark NOT_RUN. DOM assertions do not certify all layout or AA compliance.
- §23 NOT_IMPLEMENTED: fresh API calls addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults all return UNKNOWN_ACTION. A students type/table does not implement roster CRUD, unique hashed PINs, five failures/ten-minute lockout, bound student identity, cross-machine review or unsubmitted roster rows.
- §24 incomplete: F04 persists in actual app. Production search finds no rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. listResults at src/api/handle.ts:551–596 still omits detailed answers required for submission review/statistics. System dark CSS does not implement remembered three-state theme selection.
- Owner milestone and production acceptance NOT_RUN. Passing gates do not override the six verified findings or constitute release approval.

## Missing roadmap features — priority order

1. **P1 reliability/content (R0):** durable dispatch lease/budget (F01); pin async report export to the final (F05); connect canonical rich blocks across exam/review/export (F06). Also reject orphan assignments (F03) and restore rational inverse (F02). Owners src/collect, src/app, src/api, src/domain.
2. **P1 R2 / §22:** finish local apiBase/publish integration acceptance after R0/R1 gates; current suites cover it locally, but no production rollout approval is implied. Full-service integration remains unverified, not claimed absent merely because the live gate is pending.
3. **P1 R3 / §23:** owner-scoped roster CRUD/printable PIN list, unique hashed PINs, five-failure lockout, studentToken and name/student_id binding, cross-machine myResults with §20 reports, teacher unsubmitted rows. Owners src/api, src/collect, src/teacher, src/student; depends on R2.
4. **P1 R4/R8 / §§24.1/24.5:** actual-app filters/navigation (F04); separate local retry-wrong with no teacher submission and immutable original final. Owners src/app, src/report, src/student. Respect R8's R4/R7 dependency.
5. **P1 R5/R6 / §§24.2/24.3:** authorized full-submission viewer, per-question statistics, I option distribution and top three wrong III answers, using valid finals. Owners src/api, src/teacher, src/report; R3→R5→R6.
6. **P1 R7 / §24.4:** PIN-backed history, SVG score chart and accessible table. Owners src/student, src/api; depends on R3 and precedes R8 acceptance.
7. **P2 R9/R10 / §§24.6/24.7:** teacher print with blank answer sheet and separate answer key; remembered Sáng/Tối/Theo máy selector and AA contrast. Owners src/teacher, src/report, src/ui; preserve declared dependencies.
8. **P2 R11:** owner-authorized live-service and phone acceptance, recovery/privacy/import corpus, OS IME/multiple browsers/AT/performance, changelog/rollback, version acceptance and decisions about retiring legacy services. No deploy in LC67.

recommended_action: return the six findings to their owners for minimal fixes and regressions, complete approved roadmap work, then repeat gates and independently inspect the actual app. NEED_DECISION: NONE for these fixes; a proposed change to the rational API contract would require owner choice between preserving the inverse with boundary limits or consistently versioning the whole API domain. No such change was adopted.
tools_research: NOT_REQUESTED; no installation.
privacy_notes: synthetic fixtures only; no private instructions, real student data or production credentials included.

## Completion and final snapshot integrity

All requested final gates ran: build exit0, both typechecks exit0, npm pass1,611/fail0. Claude pass104/fail0. Initial intermediate-source failures remain documented. Supplemental full Codex command retains its six preparation failures and 155 passing tests; the correctly prepared separate CX run passes51/fails0. Do not combine separate commands into a fictitious all-green full run. Independent previous-finding regressions pass4/fail0; new intended-behavior regressions pass0/fail2. Six findings remain open; verdict CHANGES_REQUESTED.

Final `SNAPSHOT/final-snapshot.json` compares 1,349 captured inputs, including the six added nested helpers. HEAD remains `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`. No src/test assertion/build/contract/dependency/configuration drift from the refreshed, tested snapshot was detected. App SHA-256: `59e318b10701bc4c28aec4b974be114d33b618300355d6376005845f69ef29ab`. Two original browser artifacts changed externally: `test/codex-check/cx/F02-browser.json` and `F03-browser.json`; these files were not overwritten/restored by this audit. Results apply to the captured versions, not an untested replacement artifact.

Git-status delta adds this report and concurrent modifications to `dist/app/main.js`, `dist/collect/appsScript.js`, `dist/report/download.js` and `ops/blitz/promoted/_audit/student/CX-S01a-wrong-result.png`. No initial status entry disappeared. Every audit execution command ran in SNAPSHOT; the only intentional write in D:/Cunata is this report. Source changes after this hash check require renewed review.
