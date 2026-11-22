# LC83 — Independent whole-product audit

review_id: LOOP-83-codex; task_id/worker_id: LC83; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`, branch main, plus captured uncommitted inputs.
requirements_version: Shared Product Contract v2.0; WEB-contract.md §§1–24, read in full; inherited M1 API/handoff; approved decisions, DESIGN.md and docs/LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Nine verified findings: **one BLOCKER, six MAJOR, two MINOR**. NEED_DECISION: NONE for the fixes and approved roadmap below. This report does not approve a release or milestone.

## Scope and snapshot

Loaded the named auditor skill and its profile privately. Inspected actual Git status/log/diff, including the existing dirty tree; preserved other workers' files. No source/test fix, install, dependency addition, branch/worktree creation, commit, deploy or production-service write.

Evidence directory, hereafter SNAPSHOT: `%USERPROFILE%/AppData/Local/Temp/LC83-e4pl10oe`. It is an ordinary temporary directory, not a Git worktree. Captured 1,364 inputs under src/test/scripts/docs/public/styles/apps-script, root HTML/configuration/README, ops/publish.py and the existing ops/blitz/promoted/_support helpers. Copied installed node_modules without installing anything. Tests/builds/downloads and diagnostic scripts ran there so generated output did not modify the working tree outside the permitted report. Production configuration was not copied; public/config.json stays unconfigured locally. source-hashes.json records input hashes; git-status.txt, git-log.txt and git-diff.txt record the actual repository baseline.

Latest completed available loop report is LC80; LC81/LC82 result files contain failed execution messages rather than completed reviews. Compared against LC80-h93uw64b/source-hashes.json. delta.json shows only src/app/main.ts, two browser JSON artifacts, two R0 regression test files, LOOP-80-codex.md and ROADMAP-R0.md changed/added; no removed input or new commit. No dependency/config/build-script delta. The app change adds a Block renderer, section labels, URL-origin checking for download assets and an unassigned-route guard. The new collect regression duplicates URL-checking logic locally instead of invoking the production download handler; isolated report tests likewise do not prove app integration.

files_reviewed: current app delta and its exam/report/download/router callers; teacher portal/authoring and Apps Script publishing; current collector/storage CAS and student controller paths; public domain rational/scoring/max/serialization APIs; schema Block/assets and importer output; API handle/auth/Memory/Neon and existing uncommitted ownership/session fixes; build/publish/config/offline boundaries. Prior complete-product review was used as a lead and hash baseline, with fresh causal source inspection and execution here. Unchanged bank/admin/teacher/UI/import/offline paths are also exercised by the suites below. This is an incremental whole-product audit, not a claim that every unchanged source line was reread.

## Findings

### LC83-F01 — BLOCKER — Publishing restores the old answer after an intentional key edit

- status: VERIFIED; independently reproduces R0-R2-F01. **VÙNG chịu trách nhiệm: src/teacher.**
- affected_files: src/teacher/portal.ts:1763–1773; valid editor save at src/app/authoring.ts:301–304 and :328–329.
- evidence: lc83-independent.json records expected `ck-i-01-b`, actual `ck-i-01-a`, radiosRemaining=0. The editor saves B and removes the editing controls; the portal callback then restores the original question's key when no radio remains. The existing preserve-key regression only edits text.
- reproduction_steps: in SNAPSHOT run `node --test lc83-independent.test.mjs`. Using the real dist UI and local GAS simulator, seed one teacher and a one-question exam keyed A; open teacher library → edit exam → edit question → select `#editCorrectOpt_0_1` (B) → save question → publish; read getExam from the simulator.
- expected: Shared §2 / WEB §19.1 preserve the saved B key in the new published version.
- actual/impact: publishing succeeds with A, losing the explicit answer change and grading future B answers against the obsolete key. Reorder/index mismatch is an additional source risk, not a separately executed case.
- minimal_fix: publish the editor's validated saved key; remove DOM/original-key overwrites in the portal. If metadata needs merging, match stable question IDs and preserve edited fields. Correct radio initialization in the editor itself.
- regression_test: A→B, save, reopen editor, publish, read back B, then verify a new B response earns 0.25. Retain CX-teacher-F07's text-only edit case; add reorder/delete/version-snapshot cases.

### LC83-F02 — MAJOR — Browsing the teacher library writes and increments exam revision

- status: VERIFIED; independently reproduces R0-R2-F02. **VÙNG chịu trách nhiệm: src/teacher.**
- affected_files: src/teacher/portal.ts:1687–1699; Apps Script revision write at apps-script/Code.js:409.
- evidence: lc83-independent.json: before=1, after=2, publishRequests=1, before the user edits anything. loadExams calls publishExam to discover ownership; errors other than FORBIDDEN are also accepted as evidence of ownership, and its catch includes the exam.
- reproduction_steps: same independent test, first child. Seed published revision 1; sign in and open Đề thi only; inspect local server request log and listExams revision.
- expected: WEB §§17.2/19.1 distinguish listing from publishing; browsing sends no publish request and changes no exam content/revision.
- actual/impact: viewing causes a real write. A concurrent newer edit could be overwritten by the read-then-publish sequence; that race was not separately executed. No backend authorization bypass is claimed.
- minimal_fix: determine ownership from an authenticated read/metadata API; do not publish as a permission probe. Render recoverable read errors instead of treating unverifiable data as owned. Keep backend publish authorization.
- regression_test: opening/reloading/changing library tabs sends zero publish requests and leaves revision/content unchanged; teacher B cannot see A's private exam; read failures do not expose it.

### LC83-F03 — MAJOR — Concurrent outbox drains bypass the durable dispatch budget

- status: VERIFIED; continues LC80-F01. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :437–453, :475, :624; CAS storage boundary src/storage/index.ts:977.
- evidence: probes.log reports calls=6, state=sending, retryCount=0, generation=8. The sending transition consumes no budget and does not exclude a send already in progress.
- reproduction_steps: `node LC51-probes.mjs`; parse hoa-repeating, finalize a synthetic attempt with MemoryTransactionAdapter, enqueue, then invoke drainOutbox six times five milliseconds apart while local fake transport promises are pending; inspect durable outbox and resolve responses with 503.
- expected: Shared §3 / WEB §7 cap total dispatches at five, including overlapping callers/recovery.
- actual/impact: six requests dispatch with zero consumed retries; more callers or crashes before response can bypass the bound.
- minimal_fix: atomically reserve consumed budget and a durable sending lease before transport; reject/coalesce a live lease and recover expiry without resetting consumed attempts. Preserve tuple/hash/generation pinning and terminal confirmation. A process-local mutex alone does not cover multiple tabs.
- regression_test: two clients, delayed/lost receipts, crash/reload and lease expiry; one live send and at most five dispatches; late responses cannot change confirmed state or immutable final/body/hash.

### LC83-F04 — MAJOR — Switching exams during HTML download crashes export

- status: VERIFIED; continues LC80-F05. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3094–3101, :3143–3161, :3259, :3271–3293.
- evidence: download-race.json records `TypeError: Cannot read properties of null (reading 'totalFraction')`, downloads=[], title="New exam B". intended-regressions.log fails the expected race behavior.
- reproduction_steps: `node download-race.mjs`, then `node --test lc67-regressions.test.mjs`. Submit A containing an internal Markdown image, delay its download image fetch, click download, load B through the existing hidden file input, release the fetch, capture rejection and HTML Blob.
- expected: WEB §§3/20 bind export to A's immutable final/title/order/answers/score/identity, or explicitly cancel with recoverable feedback.
- actual/impact: after await the handler reads mutable active-exam state; B clears scoredResult, so no file is produced. Mixed-identity output is a source risk, not a separately reproduced outcome.
- minimal_fix: capture a complete immutable export model and filename before the first await; use captured fields exclusively afterward. Show asset/download errors to the user.
- regression_test: delayed A image → B opens → resolve; one file retains A's metadata/content/score/attempt ID and no rejection. Include failure/cancel/concurrent-download paths.

### LC83-F05 — MAJOR — Math blocks inside table cells disappear

- status: VERIFIED; narrower remaining rich-content defect after partial repair of LC80-F06. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:411–422, :1681, :3086, :3259.
- evidence: lc83-independent.json captures a valid cell containing text, image and `{type:'math',source:'x^2+83',format:'latex',verified:true}`. The actual question-stem text is only `NESTED-TEXT`; captured HTML has text/image and no math. The cell loop handles text/image only. No unsupported-content warning is rendered for this omission.
- reproduction_steps: same independent test, fourth child; load the synthetic table-block exam through the real dist file path and inspect the actual exam DOM. Nested HTML output is saved in nested-report.html; the same renderer serves exam/review/export.
- expected: Shared §6 / WEB §§4/8/20 retain/render supported math within recursive Cell.blocks, or explicitly preserve source with a warning.
- actual/impact: mathematical data in a valid question is silently omitted, potentially making the question unsolvable. The executed case proves exam omission; no claim about a particular real DOCX is made.
- minimal_fix: use one recursive safe Block renderer for question and cell content, including math/source verification labels and nested tables; explicitly flag unsupported nodes.
- regression_test: math/text/image/nested-table cells through actual exam → submit → review → standalone download, comparing content to the immutable snapshot. Include unsupported OMML and hostile text with explicit safe fallback.

### LC83-F06 — MAJOR — Images inside table cells remain web-relative in downloaded reports

- status: VERIFIED; independently reproduces R0-R2-F03. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3117–3127, :415–420, :3259.
- evidence: lc83-independent.json lists downloaded imageSources=["public/q01-bbt.svg"]. nested-report.html retains that src. Asset collection walks only top-level question blocks; the renderer does descend into cells and then falls back to the unembedded path.
- reproduction_steps: same independent test, third child; assets=[], one table cell with image assetId public/q01-bbt.svg (exists in dist), submit and click actual HTML download button; inspect output.
- expected: WEB §§9/20 require a self-contained offline file with the same images, embedded as data URIs.
- actual/impact: saved HTML resolves the relative src next to the downloaded file, losing the question image on another machine/offline.
- minimal_fix: recursively collect image and Markdown references from all cell blocks, resolve approved internal assets consistently, and report failures. Verify final output has no unintended web-relative image dependencies.
- regression_test: actual download with images in top-level/cell/nested Markdown/option/explanation content; open file after server shutdown and assert decoded images and zero external requests. Calling the isolated report renderer with pre-embedded assets is insufficient.

### LC83-F07 — MAJOR — Actual report omits filters, question navigation and retry-wrong

- status: VERIFIED; continues LC80-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535–554 and :2970–3090; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: browser-probe.log: cards=2, filter=false, nav=false, retry=false. Main builds its own report instead of mounting the separately tested controls.
- reproduction_steps: `node LC51-browser-probe.mjs`; real headless browser serves dist under /Cunata/, loads synthetic I+III exam, submits and checks actual report DOM.
- expected: WEB §§24.1/24.5 deliver all/wrong/blank filters with aria-pressed, question navigation, and an independent local retry-wrong flow that never sends to the teacher.
- actual/impact: approved student features remain unavailable despite isolated renderer tests.
- minimal_fix: integrate the real report projection/actions/lifecycle; practice must receive its own immutable snapshot/ID and no collector/assignment linkage, leaving the original final untouched.
- regression_test: actual submit → filter/nav including hidden targets → retry wrong/blank/partial-II → refresh; zero submitResult requests and no original-result mutation.

### LC83-F08 — MINOR — assignExam persists nonexistent exam IDs

- status: VERIFIED; continues LC80-F03. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396–405.
- evidence: probes.log: HTTP200/success=true and one stored assignment for does-not-exist with empty trusted catalog. Null getExam skips the ownership conditional and reaches saveAssignment.
- reproduction_steps: `node LC51-probes.mjs`; seed active teacher, hashed session and owned class in MemoryStore; assign unknown examId with valid openAt and dueAt=""; inspect assignments.
- expected: reject unknown/deleted exam before writing; allowed owned/shared published and trusted catalog exams stay assignable.
- actual/impact: an orphan assignment is created and students cannot open it. This case does not demonstrate cross-owner writes.
- minimal_fix: require published exam existence/permission or trusted catalog membership; otherwise established NOT_FOUND/INVALID_EXAM, no write. Preserve foreign-owner FORBIDDEN and no-due behavior.
- regression_test: unknown/deleted writes nothing; owned/shared published/catalog succeeds; foreign owner fails; dueAt="" remains supported.

### LC83-F09 — MINOR — Fraction parser rejects canonical formatter output

- status: VERIFIED; continues LC80-F02. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls public barrel APIs. toFractionString(rational(10n**200n)) produces a canonical 201-character integer; parsing that exact string throws SyntaxError.
- expected: M1 §4.1 strict inverse over the public rational API domain.
- actual/impact: valid API roundtrip fails. No incorrect scoring within the approved 1,000-question range was demonstrated.
- minimal_fix: preserve the public inverse and bound hostile serialized values at their input boundary; changing the public API domain requires consistent contract changes.
- regression_test: signed integer/fraction canonical roundtrips around 199/200/201 characters; zero, noncanonical rejection and both inverse directions.

## Rechecked fixes since LC80

- Top-level blocks-only text/table: blocks-probe.json now shows schemaValid=true, visible distinctive stem, tables=1, and retained review/download stem/table. lc67 regressions: this child passes; download-race child still fails. Do not claim full recursive Block support (F05/F06).
- Section labels, top-level embedded image and uppercase external Markdown download case: r0-fixed-behavior.log passes the three corresponding children. Source now resolves URL origin/protocol and uses redirect:error; broader redirect/protocol matrices were not independently exhausted here.
- Unassigned exam route: fresh clean-context route-probe.json shows zero classes, hash redirected to #/hoc-sinh?exam=ly12-hang-tuan-de-10, examVisible=false, startVisible=true and the teacher-assignment notice. The adapted browser regression also passes. This verifies the former bypass case, not every valid resume/routing case.
- Existing displayed option letters, shuffled question order, portable top-level image and assignment isolation: r0-regressions.log passes 4/4. No new defect is inferred from removed public-exam flows; WEB §21 supersedes those old requirements.

## checks_run

Environment: Windows/PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0; real headless Chromium/CDP supplied by existing harness. All commands below ran in SNAPSHOT with captured inputs; no dependency installation. Logs redirected by PowerShell are UTF-16. Probe exit 0 indicates successful observation, not expected-behavior PASS.

| Command | Exit | Actual result / artifact in SNAPSHOT |
| --- | --- | --- |
| `node scripts/build.js` | 0 | build.log; 339 files emitted/promoted/verified; existing DEP0190 warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | tsc.log; no diagnostics. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | tsc-web.log; no diagnostics. |
| `npm test` initial | 1 | npm.log; 1616 tests, 1608 pass, 8 fail, 0 skip/cancel/todo, 345 suites; 32059.0246 ms. All eight failures inspect missing dist outputs: this first run was incorrectly launched concurrently with build in a snapshot that initially had no dist. This is review sequencing error, not evidence of a source regression. |
| `npm test` after build completion | 0 | npm-retry.log; 1616 tests, 1616 pass, 0 fail/skip/cancel/todo, 345 suites; 38714.8744 ms. Initial failure retained above. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | claude.log; 104 tests, 104 pass, 0 fail/skip/cancel/todo, 5 suites; 85952.4665 ms. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/codex-check/**/*.test.mjs"` | 0 | codex.log; 198 tests, 198 pass, 0 fail/skip/cancel/todo, 2 suites; 138281.5226 ms. |
| `node LC51-probes.mjs` | 0 | probes.log; F03/F08/F09 reproduced; six roster/PIN/history actions return UNKNOWN_ACTION. |
| `node LC51-differential.mjs` | 0 | differential.log; product total/max and section score/max match 1632 independent expected fixtures. |
| `python -B test/oracle/oracle.py --check` | 0 | oracle.log; 11 pass, 0 fail/skip; 1632 fixtures, 5849 maxima configs, 9 negative controls; 1.0762 s total. Independent oracle itself, separate from preceding product differential. |
| `node LC51-browser-probe.mjs` | 0 | browser-probe.log; F07 reproduced. |
| `node download-race.mjs` / `node blocks-probe.mjs` | 0 / 0 | respective .log/.json; race fails expected behavior, top-level text/table repaired. |
| `node --test lc67-regressions.test.mjs` | 1 | intended-regressions.log; 2 tests, 1 pass, 1 fail, 0 skip/cancel/todo; 88.1208 ms. |
| `node --test lc83-independent.test.mjs` | 1 | lc83-independent.log/.json; 5 tests, 0 pass, 5 fail, 0 skip/cancel/todo; 3317.81 ms. Four failing child assertions verify F01/F02/F05/F06, plus their parent, not five independent defects. |
| `node r0-independent.mjs`; `node --test r0-regressions.test.mjs` | 0 / 0 | r0-independent.log/.json and portable report; r0-regressions.log: 4 pass, 0 fail/skip/cancel/todo; 359.4404 ms. |
| `node --test --test-reporter=tap r0-updated-regressions.test.mjs` initial legacy probe | 1 | r0-updated-regressions.log: 4 tests, 3 pass, 1 parent fail; 15716.2027 ms. The attempted replacement did not match the Unicode legacy wait line, so it still waited for an unassigned exam to load, which the fix now prevents. Not a product regression. |
| `node --test --test-reporter=tap r0-fixed-behavior.test.mjs` | 0 | r0-fixed-behavior.log: 5 tests, 5 pass, 0 fail/skip/cancel/todo; 2788.3286 ms. Retains old content/image/section/external checks; route wait now expects student redirection rather than forbidden loading, then asserts exam hidden. |
| `node route-probe.mjs` | 0 | route-probe.log/.json; independent clean-context route observation described above. |

Existing supplemental runtime was inspected and used via NODE_OPTIONS=--import=file:///%USERPROFILE%/AppData/Local/Temp/LC83-e4pl10oe/ops/blitz/promoted/_support/runtime.mjs (or imported directly by probes). It releases the Browser.close acknowledgment for harness teardown; application responses/assertions are unchanged. Supplemental suites use GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata for an existing read-only Git snapshot hook. Output directories under SNAPSHOT ops/blitz/promoted/_audit were created before execution. Local GAS/Neon doubles do not certify external services.

## coverage_gaps

- M1: fresh differential verifies totals and section maxima/scores across 1632 cases; F09 remains. Not every status/raw/order/DOM combination exhausted. No domain scoring error inside approved limits demonstrated; F01 instead corrupts the teacher's chosen key before future grading.
- M2/M3: suites cover timer, offline restore, two-tab/revision simulations, bank/builder and UI. Actual-entrypoint probes expose F01–F07. Broad private-mode/quota/migration/recovery matrix and all valid route/resume combinations NOT_RUN. New route guard calls listAttempts(examId,'') while storage filters exact version; the fallback therefore does not establish arbitrary-version IDB recovery. No separate loss-of-resume case is claimed without reproduction.
- M4/R2: API/ownership/session/SQL/transport/publish tests run locally. Live deployed Vercel/Neon concurrency/CORS/receipt/readback/dedupe and Google behavior NOT_RUN: no production configuration or writes. Full Git-history secret scan, external dependency/license audit and trusted-assessment certification NOT_RUN. No dependency change found in inspected delta; scoped production search found no test-ID/webdriver branch.
- M5: automated DOCX/PDF cases run; broad real-document corpus, multicolumn/merged-table/media/unsupported-equation/corrupt/encrypted/scan files NOT_RUN. Approved PDF scope remains native preview/manual entry. F05/F06 prevent full rich-content acceptance; top-level tests are insufficient.
- M6: automated real Chromium and responsive/design/keyboard suites run. Complete manual visual review of every screen/theme/viewport, Firefox/WebKit, physical phone, OS Telex/VNI, screen reader, axe/Lighthouse and independent input-to-paint p95 benchmarking NOT_RUN. Automated DOM/contrast checks do not certify all WCAG AA or performance targets.
- Owner milestone/production acceptance NOT_RUN. No live website/service was visited or deployed. Missing approved functionality below is NOT_IMPLEMENTED, not a new policy question.

## Missing roadmap functionality — priority and dependency order

1. **P0 / R0 reliability:** repair F01 before acceptance; F02/F04/F05/F06 require actual teacher/download/content regressions. Preserve the freshly verified route/section/URL fixes. F03 retry budget, F08 orphan assignments and F09 API roundtrip remain technical debts to close in their owning regions.
2. **P1 / R2 then R3, WEB §23:** complete local R2 acceptance before activating new service; implement roster CRUD/print/unique hashed four-digit PINs, five-failure ten-minute lockout, studentToken/student_id binding and cross-machine reports. Fresh addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults probes all return UNKNOWN_ACTION. Table/type scaffolding is insufficient; teacher unsubmitted roster rows are also absent.
3. **P1 / R4, §24.1, after R0:** integrate real report filters/navigation (F07); isolated renderer controls do not deliver the feature.
4. **P2 / R5→R6, §§24.2–24.3, after R3:** authorized teacher submission details and per-question statistics. No production submissionDialog/btn-view-submission/examStats/stat-row path found; current listResults projection does not provide the detailed question/response report.
5. **P2 / R7, §24.4, after R3:** PIN-backed myHistory, SVG historyChart and accessible textual table; no production path found.
6. **P2 / R8, §24.5, after R4+R7:** independent local wrong/blank/partial-II practice, original results immutable and zero teacher submission (F07).
7. **P2 / R9, §24.6, after R6:** teacher exam printing with blank response sheet and separate answer page; no btn-teacher-print path found.
8. **P2 / R10, §24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system dark CSS exists, production btnTheme absent.
9. **P3 / R11:** owner-authorized service activation/phone acceptance, recovery/privacy/import/performance matrix, version 1.0 and explicit old-service retirement decision. No deployment authorization is inferred from this review.

Custom-only presets and manual PDF are approved scope choices. No grammar/scoring/storage/service decision was silently changed. tools_research: NOT_REQUESTED. privacy_notes: only synthetic local fixtures; no credentials, real student data or private-profile instructions included.

recommended_action: return F01/F02 to src/teacher; F03 to src/collect; F04–F07 to src/app; F08 to src/api; F09 to src/domain. Keep current assertions, add actual-entrypoint regressions and rerun gates on a stable snapshot. Report delivery can be READY_FOR_REVIEW while product verdict remains CHANGES_REQUESTED.

Final snapshot integrity: final-snapshot.json compares all 1,364 captured inputs with D:/Cunata after checks: inputDrift=[]. HEAD remains `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`; src/app/main.ts SHA-256=`247489229f12c41f056921c021df2673e867abdc1c5f14eec3e34bbb9e70219d`. Later code changes invalidate this evidence. Only docs/reviews/LOOP-83-codex.md was intentionally created/modified in the workspace; generated artifacts remain in SNAPSHOT.

**CHANGES_REQUESTED:** nine verified findings (one BLOCKER, six MAJOR, two MINOR), despite post-build npm 1616/0, Claude 104/0, Codex 198/0, both typechecks/build passing, oracle 11/0 and product differential 1632/0. Independent expected-behavior regressions retain one download-race failure and four new child failures; parent failures are not counted as additional defects. Initial execution/setup failures are preserved above. No source fix, commit, deployment or production acceptance.
