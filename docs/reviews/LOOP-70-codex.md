# LC70 — Independent whole-product audit

review_id: LC70; task_id: LC70; worker_id: LC70; reviewer: Codex.
Date: 2026-11-22 (Asia/Bangkok). risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus captured working tree.
requirements_version: Shared Product Contract v2.0; WEB-contract.md §§1–24 (read in full); inherited M1 contract; approved decisions; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Six continuing findings freshly reproduced: four MAJOR and two MINOR. No new production regression established. NEED_DECISION: NONE for these fixes or the approved roadmap. This handoff is not milestone acceptance or permission to release.

## Scope, snapshot and delta

Read the required runtime skill/profile privately, required contracts, previous LC69 review, design, decisions and roadmap. Inspected actual Git status/log/diff, including pre-existing edits and untracked regression tests. HEAD remains unchanged from LC69; shared-tree edits were preserved. No branch/worktree, installation, dependency addition, commit, deploy or real-service write.

Evidence directory, hereafter SNAPSHOT: `%USERPROFILE%/AppData/Local/Temp/LC70-ivzx8bgp`.

Copied src/test/scripts/docs/public/styles/apps-script, root HTML/configuration/README and ops/publish.py to an ordinary temporary directory, not a Git worktree. Physically copied the already-installed node_modules; no install. Builds, browser downloads and generated artifacts target SNAPSHOT. Reused and inspected the retained LC69 independent probe scripts. The supplemental CX suite additionally needs the existing ops/blitz/promoted/_support directory, copied after its initial missing-support failure. Its runtime shim acknowledges only Browser.close for harness teardown; it does not substitute product responses. No production configuration was copied; public/config.json remains `{ "appsScriptUrl": "" }`.

Comparison against retained LC69 snapshot `%USERPROFILE%/AppData/Local/Temp/LC69-i7ggrvtf` finds only the newly present LC69 report and three changed test output artifacts: test/browser/artifacts/result-report-released.png, test/codex-check/cx/F02-browser.json and F03-browser.json. No removed captured input. **No production-source, test-assertion, root HTML/configuration, dependency or build/publish delta from LC69.** source-hashes.json and delta.json record the capture. This is incremental whole-product review with fresh gates and reproductions, not a claim to reread every unchanged source line.

files_reviewed: Git delta; causal paths in src/collect/index.ts and appsScript.ts; src/storage/index.ts; src/domain rational/scoring/public barrel; src/schema exam/types; src/student controller/view/area; src/app/main.ts, routing and legacy integration; src/report projection/view/download; src/api/handle.ts, auth/types and memory/Neon stores; DOCX segmentation and PDF manual/preview integration; build/publish/configuration; regression assertions and browser harnesses. Repository-wide searches checked §23–24 production integration. Existing automated suites cover the wider bank, teacher, admin, UI, import, storage/offline and scoring areas; their results do not prove complete coverage.

## Findings

### LC70-F01 — MAJOR — Concurrent drains bypass the durable dispatch budget

- status: VERIFIED; continues LC69-F01. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :437, :446, :453, :475, :624; CAS boundary at src/storage/index.ts:977.
- evidence: fresh probes.log records calls=6, state=sending, retryCount=0, generation=8. The sending transition neither reserves consumed budget nor excludes an already pending send. Sequential CAS generations do not provide a sending lease.
- reproduction_steps: in SNAPSHOT run `node LC51-probes.mjs`. Parse hoa-repeating, start/finalize via MemoryTransactionAdapter, enqueue a synthetic endpoint, then invoke drainOutbox six times five milliseconds apart while transport promises remain unresolved. Inspect persisted state, then resolve the responses with HTTP503.
- expected: Shared §3 / WEB §7 require bounded retries across callers, tabs and recovery, at most five dispatches including the first.
- actual/impact: six requests dispatch before consuming any retry budget; additional callers or crashes before receipt can bypass the limit. This reproduction uses a local fake transport, not an external service.
- minimal_fix: atomically reserve a consumed dispatch and durable sending lease before calling transport; coalesce/reject callers during a live lease; recover an expired lease without resetting consumed attempts. Preserve tuple/hash/generation pinning and terminal confirmation. A process-local mutex alone is insufficient across tabs/reloads.
- regression_test: two storage clients with delayed transport; one live dispatch and at most five total sends; crash/reload before receipt, lease expiry, lost receipt and stale responses after confirmation. Verify immutable final/body/hash.

### LC70-F02 — MINOR — Fraction parser rejects canonical formatter output

- status: VERIFIED; continues LC69-F02. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel. `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parsing that exact string throws SyntaxError. Fresh assertions confirm the mismatch.
- expected: M1 §4.1 requires a strict inverse across the public rational API domain.
- actual/impact: a valid public API roundtrip fails. No incorrect exam score within the approved 1,000-question range was demonstrated; this is not a scoring blocker.
- minimal_fix: preserve the inverse and bound hostile serialized data at its input boundary. Restricting the public API instead requires consistent contract changes, not a parser-only limit.
- regression_test: positive/negative integers and fractions around 199/200/201 characters, zero and noncanonical rejection; both inverse directions.

### LC70-F03 — MINOR — assignExam persists nonexistent exam IDs

- status: VERIFIED; continues LC69-F03. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396, :397, :401, :402.
- evidence: probes.log records HTTP200/success=true and one saved assignment for does-not-exist with an empty trusted catalog. Null from getExam bypasses the ownership conditional and reaches saveAssignment.
- reproduction_steps: `node LC51-probes.mjs`; seed an active teacher, valid hashed session and owned class in MemoryStore. POST assignExam with unknown examId, valid openAt and dueAt=""; inspect assignments.
- expected: WEB §§19/22 reject an unknown/deleted exam before writing; allowed published and trusted catalog exams remain assignable.
- actual/impact: a stale/invalid caller creates an orphan assignment students cannot open. No cross-owner write was demonstrated by this case.
- minimal_fix: require allowed published-exam existence or trusted catalog membership; otherwise return established NOT_FOUND/INVALID_EXAM without a write. Preserve foreign-owner FORBIDDEN and no-due behavior.
- regression_test: unknown/deleted ID writes nothing; owned/shared published and catalog exams succeed; foreign owner fails; empty dueAt still works.

### LC70-F04 — MAJOR — Actual app omits review filters, navigation and retry-wrong

- status: VERIFIED; continues LC69-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:458, :2898, :2909; isolated controls at src/report/view.ts:922, :1097, :1170.
- evidence: browser-probe.log freshly reports cards=2, filter=false, nav=false, retry=false. Actual main constructs its own report rather than mounting the independently tested controls.
- reproduction_steps: after build run `node LC51-browser-probe.mjs`. Real headless Chromium/CDP serves dist under /Cunata/, loads a synthetic 1I+1III exam through the existing hidden input, submits and inspects the actual report DOM.
- expected: WEB §§24.1/24.5 provide all/wrong/blank filters with aria-pressed, question navigation, and an independent local retry-wrong flow explicitly never sent to the teacher.
- actual/impact: approved student features remain unavailable despite isolated renderer tests passing.
- minimal_fix: integrate controls with the real report projection and lifecycle. Retry practice needs its own immutable snapshot/ID and no collector/assignment linkage; preserve the original final and route cleanup.
- regression_test: actual submission → filtering/navigation including hidden targets → retry wrong/blank/partial-II → refresh. Assert no submitResult request and no mutation of the original final.

### LC70-F05 — MAJOR — Switching exams during report download crashes export

- status: VERIFIED; continues LC69-F05. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3019, :3063, :3095, :3099, :3183, :3188, :3197.
- evidence: fresh download-race.json records errors=["TypeError: Cannot read properties of null (reading 'totalFraction')"], downloads=[], title="New exam B". Fresh intended-behavior regression fails.
- reproduction_steps: `node download-race.mjs`. Submit A with a same-origin Markdown image, delay only the download image fetch, click download, load B through the existing hidden input, release the fetch and capture unhandled rejection/HTML Blobs. Product code is unchanged; only timing is controlled.
- expected: export stays bound to A's immutable title/final/responses/order/score/attempt identity, or cancels explicitly with recoverable feedback.
- actual/impact: after await, the callback reads mutable active-exam state; B clears scoredResult and the export rejects without a file. Mixed identities are also a code-path risk, but that variant was not separately reproduced.
- minimal_fix: capture the complete immutable export model and filename before the first await; use only captured fields thereafter. Report asset/download failures visibly.
- regression_test: delay A image fetch, open B, resolve; verify one HTML/filename retaining A metadata, score, content and identity without rejection. Include fetch failure, cancellation and concurrent downloads.

### LC70-F06 — MAJOR — Canonical rich blocks vanish in actual exam and reports

- status: VERIFIED; continues LC69-F06. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:1604, :3009, :3168; supported renderer at src/student/view.ts:1088; importer emits blocks at src/import/docx/segmentation.ts:384–385.
- evidence: fresh blocks-probe.json: schemaValid=true, exam.stem="", exam.tables=0, reviewContainsStem=false, downloadContainsStem=false, downloadContainsTable=false. Intended-behavior regression fails. Main reads q.content although schema accepts q.blocks.
- reproduction_steps: `node blocks-probe.mjs`; load a valid canonical question with empty content and blocks containing distinctive text plus a one-cell table. Assert parseExam accepts it; inspect actual exam, submit, inspect review and downloaded HTML.
- expected: Shared §6 / WEB §§4/8/20 preserve and display supported canonical content, or explicitly warn of unsupported content.
- actual/impact: students see choices with an empty question; review/export also lose stem/table. DOCX integration is at risk because segmentation emits blocks. This synthetic case does not establish loss of a particular real equation/image.
- minimal_fix: use a shared safe Block/asset renderer in the actual exam, review and portable export; define consistent content precedence, spans, math verification labels and explicit unsupported flags. Escape untrusted content.
- regression_test: blocks-only text/table/math/image exam through actual app, submit/reload and standalone offline report; compare content/spans/assets to the immutable snapshot. Include mixed content+blocks and hostile/unsupported input.

## checks_run

Environment: Windows PowerShell, Node v24.14.0, TypeScript 7.0.2, Python 3.11.0, installed headless Chromium/CDP. Commands execute in SNAPSHOT unless stated. PowerShell redirected logs are UTF-16. A probe that asserts a defect and exits zero is a successful reproduction, not a passing product acceptance test.

| Command | Exit | Actual result / artifact relative to SNAPSHOT |
| --- | --- | --- |
| `npm test` before preparing dist | 1 | npm.log: tests1613/suites345/pass1599/fail12/skip2/cancelled0/todo0; 22867.3391ms. Temporary copy had no dist; distribution checks and API-browser integration fail before usable build. This failed run is retained. |
| `node scripts/build.js` | 0 | build.log: emitted/promoted339 verified files. Existing DEP0190 child-process warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | tsc.log: no diagnostics. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | tsc-web.log: no diagnostics. |
| `npm test` after build | 0 | npm-built.log: tests1613/suites345/pass1613/fail0/skip0/cancelled0/todo0; 29872.06ms. No assertion/settings changes. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | claude.log: tests104/suites5/pass104/fail0/skip0/cancelled0/todo0; 75438.407ms. Includes real-browser/design and simulated-service cases. |
| `node --test --test-timeout=240000 "test/codex-check/**/*.test.mjs"` | 1 | codex.log: tests155/suites2/pass147/fail8/skip0/cancelled0/todo0; 97632.2487ms. Eight CX test files fail to import the support directory omitted from the temporary copy; product assertions in those files did not run. |
| `node --test --test-timeout=240000 "test/codex-check/cx/*.test.mjs"` after copying support | 1 | codex-cx-corrected.log: tests52/pass41/fail11/skip0/cancelled0/todo0;26298.3012ms. Missing temporary _audit output directories cause ENOENT while recording evidence, including a student after-hook failure. A further prepared rerun is recorded below. |
| `node --test --test-timeout=240000 "test/codex-check/cx/*.test.mjs"` after preparing output directories | 0 | codex-cx-prepared.log: tests51/pass51/fail0/skip0/cancelled0/todo0;23597.8611ms. Unchanged product/assertions; all eight previously unloaded CX files now execute. The previous run's extra failing file-level after-hook is absent. |
| `node LC51-probes.mjs` | 0 | probes.log: F01/F02/F03 freshly reproduced; six §23 actions return UNKNOWN_ACTION. |
| `node LC51-differential.mjs` | 0 | differential.log: product total/max and every section score/max match1632 independent expected fixtures. |
| `python -B test/oracle/oracle.py --check` | 0 | oracle.log: tests11/pass11/fail0/skip0;1632 fixtures,5849 maxima configurations,nine negative controls; reported1.8246s. Checks oracle independently; differential above executes product. |
| `node LC51-browser-probe.mjs` | 0 | browser-probe.log: F04 actual-app absence confirmed. |
| `node r0-independent.mjs` | 0 | r0-independent.log/json, r0-portable/report.html: fresh actual-app shuffled submission/download, then file:// embedded-image loading. |
| `node --test r0-regressions.test.mjs` | 0 | r0-regressions.log: tests4/pass4/fail0/skip0;352.2567ms. Checks displayed option labels, question order, portable image and assignment isolation. |
| `node download-race.mjs` | 0 | download-race.log/json: F05 rejection and zero downloads. |
| `node blocks-probe.mjs` | 0 | blocks-probe.log/json: F06 valid content missing. |
| `node --test lc67-regressions.test.mjs` | 1 | intended-regressions.log: tests2/pass0/fail2/skip0;223.4316ms. Assertions require intended behavior using the fresh browser observations; filename retains its provenance. |
| `node r0-independent.mjs` | 0 | r0-independent.log/json and r0-portable/report.html: fresh app submission/download plus actual file:// image loading. |
| `node --test r0-regressions.test.mjs` | 0 | r0-regressions.log: tests4/pass4/fail0/skip0;352.2567ms. Displayed option letters, question order, embedded offline image and assignment isolation remain correct in these cases. |

Supplemental commands set GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata solely for existing read-only snapshot hooks to resolve HEAD. All generated artifacts still target SNAPSHOT. The initial missing-dist, missing-support and missing-output-directory failures are reviewer preparation failures, not demonstrated product regressions. Corrected results are reported separately; no failed run is relabeled PASS and no tests were weakened or skipped to obtain green.

## coverage_gaps

- M1: fresh independent score/max differential passes; F02 remains. Not every status/raw/order/DOM combination exhausted. No incorrect scoring within approved limits demonstrated.
- M2/M3: suites exercise timer, restore, revisions/two-tab, builder/bank and UI. Fresh actual-app checks reveal F04/F05/F06. Broad private-mode/quota/migration/media-offline recovery matrix NOT_RUN. Hidden-input probes do not certify the future PIN/class journey.
- M4/R2: local API, publish/configuration and simulated services checked. Live Neon SQL concurrency, deployed Vercel CORS/write/receipt/readback/dedupe and Google behavior NOT_RUN: no production credentials or service writes. Trusted assessment/key confidentiality and full history-wide secret/dependency/license audit are not certified.
- M5: DOCX/PDF automated cases ran. Broad real-document corpus covering multicolumn/merged tables/media/unsupported equations/corrupt/encrypted/scan documents NOT_RUN. Approved PDF scope remains preview/manual, not automatic extraction/OCR. F06 blocks full rich-content integration acceptance.
- M6: actual Chromium browser/design/keyboard/responsive suites ran. Complete manual visual inspection of every screen/theme/viewport, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse and independent input-to-paint p95 benchmarking NOT_RUN. DOM assertions do not certify all layouts or WCAG AA. Existing five-sample typing test is not certification of the <100ms input-to-paint target.
- Owner milestone, phone and production acceptance NOT_RUN. Missing approved roadmap functions are NOT_IMPLEMENTED, not new business-policy questions. Isolated report fixtures with incomplete option permutation/scoreDTO=null do not close actual-app integration findings.

## Missing roadmap functionality, priority/dependency order

1. **P1 — Reliability/content baseline (R0):** close F01/F05/F06 before report/offline/content parity acceptance; fix F03 and F02 in their responsible areas.
2. **P1 — R2 local acceptance, then R3 / §23 roster/PIN and cross-machine review:** addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults all freshly return UNKNOWN_ACTION. Table/type scaffolding does not implement roster CRUD, unique printable four-digit PINs, hashed validation, five-failure/ten-minute lockout, studentToken/student_id identity binding, cross-machine reports or unsubmitted roster rows. No production activation implied.
3. **P1 — R4 / §24.1:** integrate actual-app filtering/navigation (F04). Isolated renderer implementation is incomplete student delivery.
4. **P2 — R5 then R6 / §§24.2–24.3, after R3:** teacher submission detail and per-question statistics; no production submissionDialog/btn-view-submission/examStats/stat-row integration found. src/api/handle.ts:551–596 listResults omits detailed raw answers for these authorized views.
5. **P2 — R7 / §24.4, after R3:** PIN-backed myHistory, SVG historyChart and accessible text table absent from production source.
6. **P2 — R8 / §24.5, after R4+R7:** independent local retry-wrong flow with no-teacher-send isolation (F04), including blank/partial-II cases.
7. **P2 — R9 / §24.6, after R6:** teacher print exam, blank response sheet and separate answer page; no btn-teacher-print path found.
8. **P2 — R10 / §24.7, after R8+R9:** system dark CSS exists at src/ui/tokens.css:93; remembered three-state btnTheme control absent.
9. **P3 — R11:** owner-authorized live Neon/Vercel and phone acceptance; recovery/privacy/import/performance matrix and explicit production-service retirement decision. No deploy/live test performed here.

Custom-only presets and manual PDF are approved scope choices, not missing approved implementation. No change to grammar, score calculation or rational API scope was assumed.

## Recommended action and integrity

Return F01 to collect, F02 to domain, F03 to api and F04/F05/F06 to app for minimal fixes plus actual-path regressions. Re-run gates against newly captured source; unchanged source with green suites does not close reproduced defects.

NEED_DECISION: NONE for these fixes/approved roadmap. tools_research: NOT_REQUESTED. privacy_notes: synthetic local fixtures only; no private profile instructions, real student data or credentials included.

Snapshot integrity: final-snapshot.json records 1346 captured inputs matching D:/Cunata, sourceDrift=[], removedSincePrevious=[]. HEAD remains `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`. src/app/main.ts SHA-256=`59e318b10701bc4c28aec4b974be114d33b618300355d6376005845f69ef29ab`. Source changes after this comparison require renewed review. The only intentional workspace write is this review file.

Final checks: build and both typechecks pass; prepared npm passes 1613/fails0; Claude passes104/fails0. Supplemental Codex initially passes147/fails8 at missing imports, followed by CX preparation failure41/11 and prepared CX pass51/fail0. All six independent findings remain open; intended-behavior report regressions pass0/fail2, prior-fix regressions pass4/fail0. **CHANGES_REQUESTED.**
