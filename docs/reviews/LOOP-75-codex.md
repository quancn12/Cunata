# LC75 - Independent whole-product audit

review_id: LOOP-75-codex; task_id: LC75; reviewer: Codex; worker_id: LC75; profile_id: internal-profile; risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`, branch `main`, plus the captured working tree.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24 (read in full), inherited M1 signatures/handoff; approved decisions, DESIGN.md and LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Six continuing findings freshly reproduced: four MAJOR, two MINOR. No new production regression established in this unchanged production snapshot. NEED_DECISION: NONE for these fixes or the approved roadmap. This is not milestone, release or production acceptance.

## Scope, source and delta

Loaded the required profile privately. Read the mandatory contracts and prior LC74 review; inspected actual Git status/log/diff, current owning source and callers. Existing changes/untracked files were preserved. No branch/worktree, source fix, install, dependency addition, commit, deploy or production-service write.

Evidence directory (SNAPSHOT): `%USERPROFILE%/AppData/Local/Temp/LC75-5js0ysxl`. Captured 1,358 inputs from src/test/scripts/docs/public/styles/apps-script, root HTML/configuration/README, ops/publish.py and existing supplemental ops/blitz/promoted/_support; physically copied installed node_modules without installation. This ordinary temporary directory is not a Git worktree. Tests, builds, logs and downloads ran there to keep generated writes outside the allowed workspace report path. Local public/config.json remains blank; production configuration was not copied.

Compared source-hashes.json with LC74 snapshot `%USERPROFILE%/AppData/Local/Temp/LC74-l6em89z3`: delta.json contains only test/codex-check/cx/F02-browser.json, test/codex-check/cx/F03-browser.json and docs/reviews/LOOP-74-codex.md. **No production-source, assertion, dependency, root HTML/configuration or build/publish delta; no new commit.** Review covers the captured whole product incrementally, with fresh checks and causal source inspection; it does not claim a fresh line-by-line reread of every unchanged file.

files_reviewed: current Git diff including uncommitted API store/auth ownership fixes, app/report export/order integration, import missing-key behavior and student metadata; causal domain rational/scoring/max/serialization/barrel, schema exam/types, collector/storage CAS and student controller, app exam/report/download, isolated student/report rendering, API handle/auth/Memory/Neon and build/publish/config/offline integration. Fresh production searches checked sections 23-24. Automated suites exercise bank/teacher/admin/UI/import/offline as recorded below; no exhaustive coverage claim. Root package/lock/tsconfig/build scripts have no new delta.

Eight existing standalone probes were read and copied from LC74. Their LC51/LC67 names record provenance; all observations below are fresh LC75 executions. Existing supplemental runtime only acknowledges Browser.close during teardown so the unchanged harness can kill its browser; no application responses/assertions are replaced. Synthetic local fixtures only. Defect-probe exit 0 means the defect was reproduced, not that expected behavior passed.

## Findings

### LC75-F01 — MAJOR — Concurrent drains bypass the durable dispatch budget

- status: VERIFIED; continues LC74-F01. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :437, :446, :453, :475, :624; CAS boundary at src/storage/index.ts:977.
- evidence: fresh probes.log records calls=6, state=sending, retryCount=0, generation=8. The sending transition neither reserves consumed budget nor excludes an already pending send. Sequential CAS generations do not provide a sending lease.
- reproduction_steps: in SNAPSHOT run `node LC51-probes.mjs`. Parse hoa-repeating, start/finalize via MemoryTransactionAdapter, enqueue a synthetic endpoint, then invoke drainOutbox six times five milliseconds apart while transport promises remain unresolved. Inspect persisted state, then resolve the responses with HTTP503.
- expected: Shared §3 / WEB §7 require bounded retries across callers, tabs and recovery, at most five dispatches including the first.
- actual/impact: six requests dispatch before consuming any retry budget; additional callers or crashes before receipt can bypass the limit. This reproduction uses a local fake transport, not an external service.
- minimal_fix: atomically reserve a consumed dispatch and durable sending lease before calling transport; coalesce/reject callers during a live lease; recover an expired lease without resetting consumed attempts. Preserve tuple/hash/generation pinning and terminal confirmation. A process-local mutex alone is insufficient across tabs/reloads.
- regression_test: two storage clients with delayed transport; one live dispatch and at most five total sends; crash/reload before receipt, lease expiry, lost receipt and stale responses after confirmation. Verify immutable final/body/hash.

### LC75-F02 — MINOR — Fraction parser rejects canonical formatter output

- status: VERIFIED; continues LC74-F02. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel. `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parsing that exact string throws SyntaxError. Fresh assertions confirm the mismatch.
- expected: M1 §4.1 requires a strict inverse across the public rational API domain.
- actual/impact: a valid public API roundtrip fails. No incorrect exam score within the approved 1,000-question range was demonstrated; this is not a scoring blocker.
- minimal_fix: preserve the inverse and bound hostile serialized data at its input boundary. Restricting the public API instead requires consistent contract changes, not a parser-only limit.
- regression_test: positive/negative integers and fractions around 199/200/201 characters, zero and noncanonical rejection; both inverse directions.

### LC75-F03 — MINOR — assignExam persists nonexistent exam IDs

- status: VERIFIED; continues LC74-F03. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396, :397, :401, :402.
- evidence: probes.log records HTTP200/success=true and one saved assignment for does-not-exist with an empty trusted catalog. Null from getExam bypasses the ownership conditional and reaches saveAssignment.
- reproduction_steps: `node LC51-probes.mjs`; seed an active teacher, valid hashed session and owned class in MemoryStore. POST assignExam with unknown examId, valid openAt and dueAt=""; inspect assignments.
- expected: WEB §§19/22 reject an unknown/deleted exam before writing; allowed published and trusted catalog exams remain assignable.
- actual/impact: a stale/invalid caller creates an orphan assignment students cannot open. No cross-owner write was demonstrated by this case.
- minimal_fix: require allowed published-exam existence or trusted catalog membership; otherwise return established NOT_FOUND/INVALID_EXAM without a write. Preserve foreign-owner FORBIDDEN and no-due behavior.
- regression_test: unknown/deleted ID writes nothing; owned/shared published and catalog exams succeed; foreign owner fails; empty dueAt still works.

### LC75-F04 — MAJOR — Actual app omits review filters, navigation and retry-wrong

- status: VERIFIED; continues LC74-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:458, :2898, :2909; isolated controls at src/report/view.ts:922, :1097, :1170.
- evidence: browser-probe.log freshly reports cards=2, filter=false, nav=false, retry=false. Actual main constructs its own report rather than mounting the independently tested controls.
- reproduction_steps: after build run `node LC51-browser-probe.mjs`. Real headless Chromium/CDP serves dist under /Cunata/, loads a synthetic 1I+1III exam through the existing hidden input, submits and inspects the actual report DOM.
- expected: WEB §§24.1/24.5 provide all/wrong/blank filters with aria-pressed, question navigation, and an independent local retry-wrong flow explicitly never sent to the teacher.
- actual/impact: approved student features remain unavailable despite isolated renderer tests passing.
- minimal_fix: integrate controls with the real report projection and lifecycle. Retry practice needs its own immutable snapshot/ID and no collector/assignment linkage; preserve the original final and route cleanup.
- regression_test: actual submission → filtering/navigation including hidden targets → retry wrong/blank/partial-II → refresh. Assert no submitResult request and no mutation of the original final.

### LC75-F05 — MAJOR — Switching exams during report download crashes export

- status: VERIFIED; continues LC74-F05. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3019, :3063, :3095, :3099, :3183, :3188, :3197.
- evidence: fresh download-race.json records errors=["TypeError: Cannot read properties of null (reading 'totalFraction')"], downloads=[], title="New exam B". Fresh intended-behavior regression fails.
- reproduction_steps: `node download-race.mjs`. Submit A with a same-origin Markdown image, delay only the download image fetch, click download, load B through the existing hidden input, release the fetch and capture unhandled rejection/HTML Blobs. Product code is unchanged; only timing is controlled.
- expected: export stays bound to A's immutable title/final/responses/order/score/attempt identity, or cancels explicitly with recoverable feedback.
- actual/impact: after await, the callback reads mutable active-exam state; B clears scoredResult and the export rejects without a file. Mixed identities are also a code-path risk, but that variant was not separately reproduced.
- minimal_fix: capture the complete immutable export model and filename before the first await; use only captured fields thereafter. Report asset/download failures visibly.
- regression_test: delay A image fetch, open B, resolve; verify one HTML/filename retaining A metadata, score, content and identity without rejection. Include fetch failure, cancellation and concurrent downloads.

### LC75-F06 — MAJOR — Canonical rich blocks vanish in actual exam and reports

- status: VERIFIED; continues LC74-F06. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:1604, :3009, :3168; supported renderer at src/student/view.ts:1088; importer emits blocks at src/import/docx/segmentation.ts:384–385.
- evidence: fresh blocks-probe.json: schemaValid=true, exam.stem="", exam.tables=0, reviewContainsStem=false, downloadContainsStem=false, downloadContainsTable=false. Intended-behavior regression fails. Main reads q.content although schema accepts q.blocks.
- reproduction_steps: `node blocks-probe.mjs`; load a valid canonical question with empty content and blocks containing distinctive text plus a one-cell table. Assert parseExam accepts it; inspect actual exam, submit, inspect review and downloaded HTML.
- expected: Shared §6 / WEB §§4/8/20 preserve and display supported canonical content, or explicitly warn of unsupported content.
- actual/impact: students see choices with an empty question; review/export also lose stem/table. DOCX integration is at risk because segmentation emits blocks. This synthetic case does not establish loss of a particular real equation/image.
- minimal_fix: use a shared safe Block/asset renderer in the actual exam, review and portable export; define consistent content precedence, spans, math verification labels and explicit unsupported flags. Escape untrusted content.
- regression_test: blocks-only text/table/math/image exam through actual app, submit/reload and standalone offline report; compare content/spans/assets to the immutable snapshot. Include mixed content+blocks and hostile/unsupported input.


## checks_run

Environment: Windows PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0, real headless Chromium through CDP. Commands ran in SNAPSHOT. Logs redirected by PowerShell are UTF-16. No installation.

| Command / invocation | Exit | Actual result; artifact relative to SNAPSHOT |
| --- | --- | --- |
| `node scripts/build.js` | 0 | build.log: 339 files emitted/verified; existing DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | tsc.log: no diagnostics. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | tsc-web.log: no diagnostics. |
| `npm test`, initial invocation before build readiness | 1 | npm.log: tests1613/pass1605/fail8/skip0;59291.1629ms. Eight dist-presence checks ran before temporary build promotion. Audit orchestration/setup failure, not a source regression. |
| `npm test`, post-build invocation overlapping supplemental browser suites | 1 | npm-rerun.log: tests1613/pass1612/fail1/skip0;47600.6464ms. Performance assertion measured initial load5202ms against2000ms. Observed failure retained; attribution to source unproven under concurrent load. |
| `npm test`, final invocation with suites run sequentially | 0 | npm-final.log: tests1613/suites345/pass1613/fail0/skip0/cancelled0/todo0;30120.3501ms. |
| Claude suite, first invocation | 1 | claude.log: 8 file-level startup failures, pass0;2736.3005ms. Invalid Windows absolute NODE_OPTIONS preload URL; product assertions did not execute. |
| Codex suite, first invocation | 1 | codex.log: 12 file-level startup failures, pass0;2784.4948ms. Same preload URL error; product assertions did not execute. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"`, overlapping rerun | 1 | claude-rerun.log: tests104/pass102/fail2/skip0;164267.3494ms. Class-flow and two-tab waits timed out during overlapping browser suites; not dismissed as passes. |
| `node --test --test-timeout=240000 "test/codex-check/**/*.test.mjs"`, overlapping rerun | 1 | codex-rerun.log: tests199/pass189/fail10/skip0;164369.6527ms. Includes missing temporary student/teacher artifact directories and a student-file hook failure. |
| Claude suite, final sequential invocation (same command) | 0 | claude-final.log: tests104/suites5/pass104/fail0/skip0/cancelled0/todo0;42816.037ms. Real browser plus simulated services. |
| Codex suite, final sequential invocation (same command) | 0 | codex-final.log: tests198/suites2/pass198/fail0/skip0/cancelled0/todo0;93896.013ms. |
| `node LC51-probes.mjs` | 0 | probes.log: six simultaneous dispatches/retryCount0/generation8; canonical201-character fraction rejected; orphan assignment accepted; six roster/PIN/history actions UNKNOWN_ACTION. |
| `node LC51-differential.mjs` | 0 | differential.log: product total/max and each section score/max match all1632 independent expected fixtures. |
| `python -B test/oracle/oracle.py --check` | 0 | oracle.log: tests11/pass11/fail0/skip0;1632fixtures,5849maxima configurations,9negative controls;1.4369s reported total. Independent oracle only; preceding differential executes product. |
| `node LC51-browser-probe.mjs` | 0 | browser-probe.log: actual report cards2/filterfalse/navfalse/retryfalse. |
| `node download-race.mjs` | 0 | download-race.log/json: null totalFraction TypeError, downloads0, title New exam B. |
| `node blocks-probe.mjs` | 0 | blocks-probe.log/json: valid schema, empty actual exam stem/tables0, stem absent from review/download, table absent from download. |
| `node --test lc67-regressions.test.mjs` | 1 | intended-regressions.log: tests2/pass0/fail2/skip0/cancelled0/todo0;394.1097ms. Intended download/content behavior remains broken. |
| `node r0-independent.mjs` | 0 | r0-independent.log/json, r0-portable/report.html: actual shuffled submission/download and file:// embedded-image load. |
| `node --test r0-regressions.test.mjs` | 0 | r0-regressions.log: tests4/pass4/fail0/skip0/cancelled0/todo0;250.0595ms. Displayed letters, question order, portable image and assignment isolation. |

After identifying setup errors, corrected NODE_OPTIONS to an absolute `file:///C:/.../runtime.mjs` URL and prepared all required temporary _audit output directories. Final broad suites run one after another with unchanged assertions and production source; no build overlaps the final npm run. Supplemental suites use GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata for existing read-only Git snapshot hooks. Earlier errors/failures above remain recorded. A passing repeat does not prove timing robustness under load. Local simulated-service evidence does not establish deployed Neon/Vercel or Google behavior; no prior results were promoted to LC75 passes.

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

Return F01 to src/collect, F02 to src/domain, F03 to src/api and F04/F05/F06 to src/app for minimal fixes with actual-entrypoint regressions. Preserve existing API ownership/race fixes, unresolved-import-key protection, report order/portable-image behavior and assignment isolation. Rerun gates on the changed source snapshot. Green broad suites do not close the six independently reproduced defects or the two failed intended-behavior regressions.

NEED_DECISION: NONE for these fixes and the approved roadmap. tools_research: NOT_REQUESTED. privacy_notes: synthetic local data, no private-profile instructions, credentials or real student data in this report. Final answer status READY_FOR_REVIEW denotes report delivery; product verdict remains CHANGES_REQUESTED.

Snapshot integrity: final-snapshot.json compares all 1,358 captured inputs against D:/Cunata at completion. inputDrift=["test/codex-check/fixtures/bank-backup.json"]; productionDrift=[]. Only the generated bank-backup fixture changed among captured inputs, consistent with concurrent external test activity; no changed source/assertion/build/config input invalidates this captured production snapshot. HEAD remains `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`. src/app/main.ts SHA-256=`59e318b10701bc4c28aec4b974be114d33b618300355d6376005845f69ef29ab`. Changes arriving after this comparison require separate review. The only intentional workspace write is docs/reviews/LOOP-75-codex.md; test/build artifacts remain in SNAPSHOT.

**CHANGES_REQUESTED:** six verified findings. Final broad runs: npm1613/0, Claude104/0, Codex198/0; build and both typechecks pass; oracle11/0 and product differential1632/0. Independent intended-behavior regressions remain0/2; prior-fix regressions4/0. Earlier failed runs are retained in checks_run. No milestone, deploy or production-service acceptance.

