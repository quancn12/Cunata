# LC80 - Independent whole-product audit

review_id: LOOP-80-codex; task_id: LC80; reviewer: Codex; worker_id: LC80; profile_id: internal-profile; risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`, branch `main`, plus the captured working tree.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24 (read in full), inherited M1 signatures/handoff; approved decisions, DESIGN.md and LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Nine verified findings: six MAJOR, three MINOR. Six continue LC79; three additional existing defects were freshly verified after consulting the updated R0 review. No production-source delta was found. NEED_DECISION: NONE for these fixes or the approved roadmap. This is not milestone, release or production acceptance.

## Scope, source and delta

Loaded the required profile privately (fallback file; named runtime skill unavailable). Read the mandatory contracts and prior LC79 review; inspected actual Git status/log/diff, current owning source and callers. Existing changes/untracked files were preserved. No branch/worktree, source fix, install, dependency addition, commit, deploy or production-service write.

Evidence directory (SNAPSHOT): `%USERPROFILE%/AppData/Local/Temp/LC80-h93uw64b`. Captured 1,363 inputs from src/test/scripts/docs/public/styles/apps-script, root HTML/configuration/README, ops/publish.py and existing supplemental ops/blitz/promoted/_support; physically copied installed node_modules without installation. This ordinary temporary directory is not a Git worktree. Tests, builds, logs and downloads ran there to keep generated writes outside the allowed workspace report path. Local public/config.json remains blank; production configuration was not copied.

Compared source-hashes.json with LC79 snapshot `%USERPROFILE%/AppData/Local/Temp/LC79-zadmxt8q`: delta.json contains only the addition of docs/reviews/LOOP-79-codex.md and a modification of docs/reviews/ROADMAP-R0.md. **No production-source, test-assertion, dependency, root HTML/configuration or build/publish delta; no new commit.** Current Git log/diff and owning source were inspected, including pre-existing uncommitted changes. Review covers the captured whole product incrementally with fresh execution and causal source inspection; it does not claim a fresh line-by-line reread of every unchanged file.

files_reviewed: incremental review of unchanged production snapshot; current Git diff including uncommitted API store/auth ownership fixes, app/report export/order integration, import missing-key behavior and student metadata; causal domain rational/scoring/max/serialization/barrel, schema exam/types, collector/storage CAS and student controller, app exam/report/download, isolated student/report rendering, API handle/auth/Memory/Neon, build scripts and configuration/offline boundaries. Build/publish behavior is exercised by the captured suites, subject to checks_run below. Fresh production searches checked sections 23-24. Automated suites exercise bank/teacher/admin/UI/import/offline as recorded below; no exhaustive coverage claim. Root package/lock/tsconfig/build scripts have no new delta.

Eight existing standalone probes/regression scripts were reused from LC79; the causal probe code was inspected before execution. Their LC51/LC67 names record provenance; all observations below are fresh LC80 executions. Existing supplemental runtime only acknowledges Browser.close during teardown so the unchanged harness can kill its browser; no application responses/assertions are replaced. Synthetic local fixtures only. Defect-probe exit 0 means the defect was reproduced, not that expected behavior passed.

The updated docs/reviews/ROADMAP-R0.md supplied additional leads. Inspected its causal runtime paths and the existing independent browser regression, copied that regression as r0-current-regressions.test.mjs into SNAPSHOT, and ran it against the freshly built product. Four failing child tests confirm F06 plus F07/F08/F09; the fifth reported failure is their parent, not a fifth defect. No production code or repository assertion was changed.

## Findings

### LC80-F01 — MAJOR — Concurrent drains bypass the durable dispatch budget

- status: VERIFIED; continues LC79-F01. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :437, :446, :453, :475, :624; CAS boundary at src/storage/index.ts:977.
- evidence: fresh probes.log records calls=6, state=sending, retryCount=0, generation=8. The sending transition neither reserves consumed budget nor excludes an already pending send. Sequential CAS generations do not provide a sending lease.
- reproduction_steps: in SNAPSHOT run `node LC51-probes.mjs`. Parse hoa-repeating, start/finalize via MemoryTransactionAdapter, enqueue a synthetic endpoint, then invoke drainOutbox six times five milliseconds apart while transport promises remain unresolved. Inspect persisted state, then resolve the responses with HTTP503.
- expected: Shared §3 / WEB §7 require bounded retries across callers, tabs and recovery, at most five dispatches including the first.
- actual/impact: six requests dispatch before consuming any retry budget; additional callers or crashes before receipt can bypass the limit. This reproduction uses a local fake transport, not an external service.
- minimal_fix: atomically reserve a consumed dispatch and durable sending lease before calling transport; coalesce/reject callers during a live lease; recover an expired lease without resetting consumed attempts. Preserve tuple/hash/generation pinning and terminal confirmation. A process-local mutex alone is insufficient across tabs/reloads.
- regression_test: two storage clients with delayed transport; one live dispatch and at most five total sends; crash/reload before receipt, lease expiry, lost receipt and stale responses after confirmation. Verify immutable final/body/hash.

### LC80-F02 — MINOR — Fraction parser rejects canonical formatter output

- status: VERIFIED; continues LC79-F02. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel. `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parsing that exact string throws SyntaxError. Fresh assertions confirm the mismatch.
- expected: M1 §4.1 requires a strict inverse across the public rational API domain.
- actual/impact: a valid public API roundtrip fails. No incorrect exam score within the approved 1,000-question range was demonstrated; this is not a scoring blocker.
- minimal_fix: preserve the inverse and bound hostile serialized data at its input boundary. Restricting the public API instead requires consistent contract changes, not a parser-only limit.
- regression_test: positive/negative integers and fractions around 199/200/201 characters, zero and noncanonical rejection; both inverse directions.

### LC80-F03 — MINOR — assignExam persists nonexistent exam IDs

- status: VERIFIED; continues LC79-F03. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396, :397, :401, :402.
- evidence: probes.log records HTTP200/success=true and one saved assignment for does-not-exist with an empty trusted catalog. Null from getExam bypasses the ownership conditional and reaches saveAssignment.
- reproduction_steps: `node LC51-probes.mjs`; seed an active teacher, valid hashed session and owned class in MemoryStore. POST assignExam with unknown examId, valid openAt and dueAt=""; inspect assignments.
- expected: WEB §§19/22 reject an unknown/deleted exam before writing; allowed published and trusted catalog exams remain assignable.
- actual/impact: a stale/invalid caller creates an orphan assignment students cannot open. No cross-owner write was demonstrated by this case.
- minimal_fix: require allowed published-exam existence or trusted catalog membership; otherwise return established NOT_FOUND/INVALID_EXAM without a write. Preserve foreign-owner FORBIDDEN and no-due behavior.
- regression_test: unknown/deleted ID writes nothing; owned/shared published and catalog exams succeed; foreign owner fails; empty dueAt still works.

### LC80-F04 — MAJOR — Actual app omits review filters, navigation and retry-wrong

- status: VERIFIED; continues LC79-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:458, :2898, :2909; isolated controls at src/report/view.ts:922, :1097, :1170.
- evidence: browser-probe.log freshly reports cards=2, filter=false, nav=false, retry=false. Actual main constructs its own report rather than mounting the independently tested controls.
- reproduction_steps: after build run `node LC51-browser-probe.mjs`. Real headless Chromium/CDP serves dist under /Cunata/, loads a synthetic 1I+1III exam through the existing hidden input, submits and inspects the actual report DOM.
- expected: WEB §§24.1/24.5 provide all/wrong/blank filters with aria-pressed, question navigation, and an independent local retry-wrong flow explicitly never sent to the teacher.
- actual/impact: approved student features remain unavailable despite isolated renderer tests passing.
- minimal_fix: integrate controls with the real report projection and lifecycle. Retry practice needs its own immutable snapshot/ID and no collector/assignment linkage; preserve the original final and route cleanup.
- regression_test: actual submission → filtering/navigation including hidden targets → retry wrong/blank/partial-II → refresh. Assert no submitResult request and no mutation of the original final.

### LC80-F05 — MAJOR — Switching exams during report download crashes export

- status: VERIFIED; continues LC79-F05. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3019, :3063, :3095, :3099, :3183, :3188, :3197.
- evidence: fresh download-race.json records errors=["TypeError: Cannot read properties of null (reading 'totalFraction')"], downloads=[], title="New exam B". Fresh intended-behavior regression fails.
- reproduction_steps: `node download-race.mjs`. Submit A with a same-origin Markdown image, delay only the download image fetch, click download, load B through the existing hidden input, release the fetch and capture unhandled rejection/HTML Blobs. Product code is unchanged; only timing is controlled.
- expected: export stays bound to A's immutable title/final/responses/order/score/attempt identity, or cancels explicitly with recoverable feedback.
- actual/impact: after await, the callback reads mutable active-exam state; B clears scoredResult and the export rejects without a file. Mixed identities are also a code-path risk, but that variant was not separately reproduced.
- minimal_fix: capture the complete immutable export model and filename before the first await; use only captured fields thereafter. Report asset/download failures visibly.
- regression_test: delay A image fetch, open B, resolve; verify one HTML/filename retaining A metadata, score, content and identity without rejection. Include fetch failure, cancellation and concurrent downloads.

### LC80-F06 — MAJOR — Canonical rich blocks vanish in actual exam and reports

- status: VERIFIED; continues LC79-F06. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:1604, :3009, :3168; supported renderer at src/student/view.ts:1088; importer emits blocks at src/import/docx/segmentation.ts:384–385.
- evidence: fresh blocks-probe.json: schemaValid=true, exam.stem="", exam.tables=0, reviewContainsStem=false, downloadContainsStem=false, downloadContainsTable=false. Intended-behavior regression fails. Main reads q.content although schema accepts q.blocks.
- reproduction_steps: `node blocks-probe.mjs`; load a valid canonical question with empty content and blocks containing distinctive text plus a one-cell table. Assert parseExam accepts it; inspect actual exam, submit, inspect review and downloaded HTML.
- expected: Shared §6 / WEB §§4/8/20 preserve and display supported canonical content, or explicitly warn of unsupported content.
- actual/impact: students see choices with an empty question; review/export also lose stem/table. DOCX integration is at risk because segmentation emits blocks. This synthetic case does not establish loss of a particular real equation/image.
- minimal_fix: use a shared safe Block/asset renderer in the actual exam, review and portable export; define consistent content precedence, spans, math verification labels and explicit unsupported flags. Escape untrusted content.
- regression_test: blocks-only text/table/math/image exam through actual app, submit/reload and standalone offline report; compare content/spans/assets to the immutable snapshot. Include mixed content+blocks and hostile/unsupported input.


### LC80-F07 — MAJOR — Hash route starts an unassigned catalog exam

- status: VERIFIED; newly included in this whole-product review, independently confirms ROADMAP-R0 R0-F02. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3794–3804; alias src/app/routes.ts:65.
- evidence: r0-current-regressions.log records `exam started with zero joined classes`, actual=true versus expected=false. Source fetches an exam from the entire catalog, checks only the entered name, then calls loadOrResumeExam(exam, false); no assignment/class gate.
- reproduction_steps: in SNAPSHOT run `node --test --test-reporter=tap r0-current-regressions.test.mjs`. Its fresh Chromium context enters a synthetic name without joining a class, checks zero #myClasses .class-section, then changes hash to #/lam-bai/ly12-hang-tuan-de-10 and waits for that exam title.
- expected: WEB §21 permits a new class exam through its assigned class card; bare catalog links should return to the student area with the teacher-assignment notice. Preserve permitted durable-draft resume and hidden-file import behavior.
- actual/impact: a new exam becomes visible with zero joined classes. This violates the approved navigation flow; it is not a claim that the public static exam files should be confidential.
- minimal_fix: gate creation of a new attempt at the common exam-route entrypoint using valid assignment context; route unsupported bare catalog links to student + notice. Preserve explicit resume from a validated stored record and the class-card journey.
- regression_test: fresh named context without classes, both hash change and fresh page load for #/lam-bai/<id> and #/exam?examId=<id>; no new attempt. Controls: valid class card and persisted draft still open correctly.

### LC80-F08 — MINOR — Review cards omit their section when author titles do not include it

- status: VERIFIED; independently confirms ROADMAP-R0 R0-F03. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3005–3010, :3165–3169.
- evidence: fresh r0-current-regressions.log shows the complete card text starting `Câu 1 (0 / 0,25 điểm)` with no `Phần I`; the /Phần I/ assertion fails. Both UI and downloaded card templates print the title and score without deriving a section label from q.kind.
- reproduction_steps: same command as F07; load a valid Part I question titled `Câu 1`, with content that does not mention a section; submit and inspect its review card. Downloaded-card omission is source-confirmed; the copied test's download assertion checks the entire HTML, including the section-score summary, and does not independently establish card-level labeling.
- expected: WEB §20 requires each review card to identify its question number, section, score and status independently of authored text.
- actual/impact: section identification disappears for valid short/custom titles, making the review ambiguous in mixed-section exams.
- minimal_fix: derive the section label from q.kind and include it in both on-screen and portable card templates, preserving displayed order and exact score formatting.
- regression_test: I/II/III fixtures with titles/content omitting section words; assert each individual card's label in actual app and downloaded HTML, rather than matching the whole report summary.

### LC80-F09 — MAJOR — Download fetches an external Markdown URL with uppercase scheme

- status: VERIFIED; independently confirms ROADMAP-R0 R0-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3055–3063.
- evidence: r0-current-regressions.log records `HTTP uppercase URL reached a separate local origin 1 time(s)`, expected=0, actual=1. The downloader's case-sensitive startsWith blacklist excludes lowercase http/https only, then fetches rawSrc. Browser URL parsing accepts uppercase HTTP.
- reproduction_steps: same command as F07. The synthetic content contains `![tracker](HTTP://127.0.0.1:<other-local-port>/pixel)`. A separate localhost HTTP server counts requests. Load exam, submit and download; that origin receives one request. No real external service was contacted.
- expected: WEB §4.1 forbids automatic external-resource fetching from untrusted exam content; portable export may resolve accepted internal assets.
- actual/impact: downloading a report can contact an arbitrary origin supplied by exam content, enabling tracking. This evidence does not demonstrate script execution, credential disclosure or server-side SSRF.
- minimal_fix: parse/resolve URLs with the browser URL API, allow only approved same-origin HTTP(S) assets, and prevent redirects from fetching a foreign origin (for example redirect:error). Handle approved data URIs through the existing MIME policy. Do not rely on a case-sensitive string blacklist.
- regression_test: separate local counting origin for uppercase/mixed-case HTTP(S), protocol-relative URLs and same-origin redirects to foreign origins; all produce zero foreign requests. Accepted internal images still embed correctly. Only the uppercase HTTP variant was executed here; the rest are proposed regressions.

## checks_run

Environment: Windows PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0, real headless Chromium through CDP. Commands ran in SNAPSHOT using captured current inputs; no installation. Build finished before application/browser tests. Logs redirected by PowerShell are UTF-16. Initial broad suites overlapped under substantial shared machine load; durations are observations, not performance certification.

| Command | Exit | Actual result; artifact relative to SNAPSHOT |
| --- | --- | --- |
| `node scripts/build.js` | 0 | build.log: 339 files emitted/promoted/verified; existing DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | tsc.log: no diagnostics. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | tsc-web.log: no diagnostics. |
| `npm test` | 0 | npm.log: tests1613/suites345/pass1613/fail0/skip0/cancelled0/todo0;158350.1091ms. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 1 | claude.log: tests104/suites5/pass102/fail2/skip0/cancelled0/todo0;170109.0593ms. Two preview tests fail at the harness 20s page-load timeout, before preview assertions. |
| `node --test --test-timeout=240000 "test/codex-check/**/*.test.mjs"` | 1 | codex.log: tests199/suites2/pass187/fail11/cancelled1/skip0/todo0;183531.8175ms. Missing SNAPSHOT ops/blitz/promoted/_audit output directories cause ENOENT/hook failure; R1 API16 also times out at45s. Counts include a file-level failure. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | claude-retry.log: tests104/suites5/pass104/fail0/skip0/cancelled0/todo0;72665.9065ms. All original tests/assertions retained. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/codex-check/**/*.test.mjs"` | 0 | codex-retry.log: tests198/suites2/pass198/fail0/skip0/cancelled0/todo0;133504.1116ms. Original assertions and timeouts retained; missing output directories supplied in SNAPSHOT. |
| `node LC51-probes.mjs` | 0 | probes.log: six simultaneous sends/retryCount0/generation8; canonical201-character fraction rejected; orphan assignment accepted; six roster/PIN/history actions UNKNOWN_ACTION. Exit0 means defect reproduction succeeded. |
| `node LC51-differential.mjs` | 0 | differential.log: product total/max and each section score/max match all1632 independent expected fixtures. |
| `python -B test/oracle/oracle.py --check` | 0 | oracle.log: tests11/pass11/fail0/skip0;1632fixtures,5849maxima configurations,9negative controls;3.418s unittest runtime;10.824s reported total. This is an independent oracle; preceding differential executes product. |
| `node LC51-browser-probe.mjs` | 0 | browser-probe.log: actual report cards2/filterfalse/navfalse/retryfalse. Defect observed, not expected-behavior PASS. |
| `node download-race.mjs` | 0 | download-race.log/json: null totalFraction TypeError, downloads0, title New exam B. Observation probe only. |
| `node blocks-probe.mjs` | 0 | blocks-probe.log/json: valid schema, empty exam stem/tables0, stem absent from review/download, table absent from download. Observation probe only. |
| `node --test lc67-regressions.test.mjs` | 1 | intended-regressions.log: tests2/pass0/fail2/skip0/cancelled0/todo0;1490.048ms. Expected download/content behavior still fails. |
| `node r0-independent.mjs` | 0 | r0-independent.log/json and r0-portable/report.html: actual shuffled submission/download and file:// embedded-image load. |
| `node --test r0-regressions.test.mjs` | 0 | r0-regressions.log: tests4/pass4/fail0/skip0/cancelled0/todo0;429.192ms. Displayed letters, question order, portable image and assignment isolation. |
| `node --test --test-reporter=tap r0-current-regressions.test.mjs` | 1 | r0-current-regressions.log: tests5/pass0/fail5/skip0/cancelled0/todo0;2509.3874ms. Four child failures (rich-content loss, missing section label, external fetch, unassigned-route start), plus their failing parent. |

Supplemental browser processes use existing teardown-only runtime through NODE_OPTIONS=`--import=file:///%USERPROFILE%/AppData/Local/Temp/LC80-h93uw64b/ops/blitz/promoted/_support/runtime.mjs`; r0-current-regressions imports the same file directly. It only releases Browser.close acknowledgment so the unchanged harness can stop its browser. Application responses and assertions are not replaced. GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata support the existing read-only Git snapshot hook. Required SNAPSHOT ops/blitz/promoted/_audit/{admin,teacher,student,security,appsscript} directories were created before retry; the initial omission was review-environment setup, not a product code finding. Retry suites ran sequentially with file concurrency1 and unchanged test timeouts. Preserve initial failure logs: their results are not relabeled PASS. Page-load timeouts did not reproduce on the reduced-concurrency Claude retry; shared load is a plausible cause, not a proven product diagnosis. Local simulated services do not certify deployed Neon/Vercel or Google.

## coverage_gaps

- M1: fresh independent score/max differential passes; F02 remains. Not every status/raw/order/DOM combination exhausted. No incorrect scoring within approved limits demonstrated.
- M2/M3: automated suites exercise timer, restore, revisions/two-tab, builder/bank and UI. Fresh actual-app checks reveal F04/F05/F06/F07/F08/F09. Broad private-mode/quota/migration/media-offline recovery matrix NOT_RUN. Hidden-input probes do not certify the future PIN/class journey. Broad class-entry checks do not cover the hash-change bypass in F07.
- M4/R2: local API, publish/configuration and simulated services checked. Live Neon SQL concurrency, deployed Vercel CORS/write/receipt/readback/dedupe and Google behavior NOT_RUN: no production credentials or service writes. Trusted assessment/key confidentiality and full history-wide secret/dependency/license audit are not certified.
- M5: DOCX/PDF automated cases ran. Broad real-document corpus covering multicolumn/merged tables/media/unsupported equations/corrupt/encrypted/scan documents NOT_RUN. Approved PDF scope remains preview/manual, not automatic extraction/OCR. F06 blocks full rich-content integration acceptance.
- M6: actual Chromium browser/design/keyboard/responsive suites ran; initial supplemental failures and retry are recorded in checks_run. Complete manual visual inspection of every screen/theme/viewport, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse and independent input-to-paint p95 benchmarking NOT_RUN. DOM assertions do not certify all layouts or WCAG AA. Existing five-sample typing test is not certification of the <100ms input-to-paint target.
- Owner milestone, phone and production acceptance NOT_RUN. Missing approved roadmap functions are NOT_IMPLEMENTED, not new business-policy questions. Isolated report fixtures with incomplete option permutation/scoreDTO=null do not close actual-app integration findings.

## Missing roadmap functionality, priority/dependency order

1. **P1 — Reliability/content/navigation baseline (R0):** close F09 (external fetch), F07 (class-only flow), F01 (retry bound), F05 (export race) and F06 (lost rich content) before acceptance. Fix F08 (section labels), F03 (orphan assignments) and F02 (public rational roundtrip) in their responsible areas.
2. **P1 — R2 local acceptance, then R3 / §23 roster/PIN and cross-machine review:** addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults all freshly return UNKNOWN_ACTION. Table/type scaffolding does not implement roster CRUD, unique printable four-digit PINs, hashed validation, five-failure/ten-minute lockout, studentToken/student_id identity binding, cross-machine reports or unsubmitted roster rows. No production activation implied.
3. **P1 — R4 / §24.1:** integrate actual-app filtering/navigation (F04). Isolated renderer implementation is incomplete student delivery.
4. **P2 — R5 then R6 / §§24.2–24.3, after R3:** teacher submission detail and per-question statistics; no production submissionDialog/btn-view-submission/examStats/stat-row integration found. src/api/handle.ts:551–596 listResults omits detailed raw answers for these authorized views.
5. **P2 — R7 / §24.4, after R3:** PIN-backed myHistory, SVG historyChart and accessible text table absent from production source.
6. **P2 — R8 / §24.5, after R4+R7:** independent local retry-wrong flow with no-teacher-send isolation (F04), including blank/partial-II cases.
7. **P2 — R9 / §24.6, after R6:** teacher print exam, blank response sheet and separate answer page; no btn-teacher-print path found.
8. **P2 — R10 / §24.7, after R8+R9:** system dark CSS exists at src/ui/tokens.css:93; remembered three-state btnTheme control absent.
9. **P3 — R11:** owner-authorized live Neon/Vercel and phone acceptance; recovery/privacy/import/performance matrix and explicit production-service retirement decision. No deploy/live test performed here.

Custom-only presets and manual PDF are approved scope choices, not missing approved implementation. No change to grammar, score calculation or rational API scope was assumed.


## Recommended action

Return F01 to src/collect, F02 to src/domain, F03 to src/api and F04–F09 to src/app for minimal fixes with actual-entrypoint regressions. Preserve existing API ownership/race fixes, unresolved-import-key protection, report order/portable-image behavior and assignment isolation. Rerun gates on the changed source snapshot. Broad suites do not close the nine verified defects or the independent failing regressions. F07/F08/F09 are additional verification of existing R0 findings, not three source regressions introduced since LC79.

NEED_DECISION: NONE for these fixes and the approved roadmap. tools_research: NOT_REQUESTED. privacy_notes: synthetic local data, no private-profile instructions, credentials or real student data in this report. Final answer status READY_FOR_REVIEW denotes report delivery; product verdict remains CHANGES_REQUESTED.

Snapshot integrity: final-snapshot.json compares all 1363 captured inputs with D:/Cunata at completion. inputDrift=[]; addedInputs=[]; productionDrift=[]. HEAD remains `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`; src/app/main.ts SHA-256=`59e318b10701bc4c28aec4b974be114d33b618300355d6376005845f69ef29ab`. Evidence applies to these captured inputs; later source changes require review. Only docs/reviews/LOOP-80-codex.md was intentionally written in the workspace; generated build/test/probe artifacts remain in SNAPSHOT.

**CHANGES_REQUESTED:** nine verified findings (six MAJOR, three MINOR). npm1613/0; Claude retry104/0; Codex retry198/0; build and both typechecks pass; oracle11/0; product differential1632/0. Initial supplemental failures are recorded above, not hidden. Independent intended-behavior regressions0/2; additional R0 browser regressions0/5 including their parent; prior-fix regressions4/0. No source fix, commit, deploy or production-service acceptance.

