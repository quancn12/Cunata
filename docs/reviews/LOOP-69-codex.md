# LC69 - Independent whole-product audit

review_id: LC69; task_id: LC69; worker_id: LC69; reviewer: Codex.
Date: 2026-11-22, Asia/Bangkok. risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus captured working tree.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24, read in full; inherited M1-scoring-contract; approved decisions; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Six verified continuing findings: four MAJOR, two MINOR. No new production regression established. NEED_DECISION: NONE for the fixes or approved roadmap implementation. This is an audit handoff, not milestone acceptance or release approval.

## Scope and provenance

Read the required runtime skill/profile without reproducing its instructions, required product/technical contracts, LC68 review, design and approved roadmap/decisions. Inspected Git status/log/diff, including existing tracked edits and untracked tests. HEAD is unchanged from LC68. Existing edits belong to the shared working tree and were preserved.

SNAPSHOT = `%USERPROFILE%/AppData/Local/Temp/LC69-i7ggrvtf`. Captured src/test/scripts/docs/public/styles/apps-script, root HTML/configuration/README and ops/publish.py; initially used already-installed node_modules through a junction; the supplemental R1 rerun used a physical copy of those same installed files. Existing local test support and independent probes were copied from the retained LC68 snapshot and inspected before reuse. No production configuration was copied. public/config.json remains an empty Apps Script URL. Execution, builds, downloads and generated test artifacts target SNAPSHOT, keeping D:/Cunata outside build/test mutations.

Compared `source-hashes.json` against the actual retained LC68 snapshot `%USERPROFILE%/AppData/Local/Temp/LC68-d0dpdqir`. Among 1,345 captured inputs, the only difference is the newly present LC68 review report. **No production-source, test, root HTML/configuration, dependency or build/publish delta exists from LC68.** delta.json records the comparison. This is incremental whole-product review plus fresh gates and targeted independent reproductions, not a claim to have reread every unchanged line.

files_reviewed: Git delta and current causal paths in src/collect/index.ts and appsScript.ts, src/storage/index.ts, src/student/index.ts/view.ts/area.ts, src/domain/index.ts/rational.ts and scoring, src/schema/exam.ts/types.ts, src/app/main.ts and routing/legacy, src/report/index.ts/view.ts/download.ts, src/api/handle.ts/auth.ts/types.ts/store/{memory,neon}.ts, importer segmentation/PDF/preview, build/configuration/publish, test/report/view/reportFilterNav.test.ts, report regression fixtures and browser/performance harnesses. Repository-wide searches checked missing sections 23-24 integration.

No product code or assertions were changed; no installation, dependency addition, branch/worktree, commit, deploy or real-service write. The only intentional workspace write is this report. Synthetic local services and SQL-over-HTTP mocks do not prove production Google/Neon/Vercel integration.

## Findings

### LC69-F01 - MAJOR - Concurrent drains bypass the persisted dispatch budget

- status: VERIFIED; continues LC68-F01. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:437`, `:446`, `:453`, `:475`, `:624`.
- evidence: fresh probes.log records calls=6, state=sending, retryCount=0, generation=8. Budget consumption follows the response; no durable sending lease excludes a later caller. Storage CAS protects individual generations but does not prevent a subsequent caller from acquiring another sending generation while transport remains pending.
- reproduction_steps: in SNAPSHOT run `node LC51-probes.mjs`. Parse hoa-repeating, start/finalize through MemoryTransactionAdapter, enqueue a synthetic endpoint, then call drainOutbox six times five milliseconds apart with unresolved transport promises. Inspect the persisted record before releasing HTTP503 responses. This probe uses no network service.
- expected: Shared section 3 / WEB section 7 bounded retries across callers, tabs and recovery; at most five dispatches including the first.
- actual/impact: six requests dispatch before any budget is consumed. More callers or repeated crashes before response can bypass the limit. Server idempotency does not enforce a client request budget.
- minimal_fix: atomically reserve a consumed dispatch and durable sending lease before transport; reject/coalesce a live lease and recover expired leases without resetting consumed attempts. Preserve tuple/hash/generation pinning and terminal confirmation. A process-local lock alone cannot coordinate tabs/reloads.
- regression_test: separate storage instances drain concurrently with delayed transport; one live lease and at most five sends; crash/reload before receipt, expired lease, lost receipt and stale callbacks after confirmation; immutable final/body/hash unchanged.

### LC69-F02 - MINOR - Fraction parser rejects the formatter's canonical output

- status: VERIFIED; continues LC68-F02. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` uses the public barrel. `toFractionString(rational(10n ** 200n))` returns a canonical integer of length 201; `parseFractionString` throws SyntaxError on that exact output. Assertions freshly confirm both facts.
- expected: M1 section 4.1 requires a strict inverse across the published rational API domain.
- actual/impact: valid public API roundtrip fails. No scoring error within the approved 1,000-question range was demonstrated; this is not a scoring blocker.
- minimal_fix: preserve the inverse contract and bound hostile serialized data at the relevant input boundary. If the public constructor/formatter/parser domain is to be restricted instead, revise that contract consistently rather than imposing a parser-only cap.
- regression_test: positive/negative integer and fraction roundtrips around 199/200/201 characters, zero and noncanonical input rejection; both inverse directions.

### LC69-F03 - MINOR - assignExam persists nonexistent exam IDs

- status: VERIFIED; continues LC68-F03. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: fresh probes.log records HTTP200/success=true and one persisted assignment for does-not-exist with an empty trusted catalog. Null from getExam bypasses the ownership check and reaches saveAssignment.
- reproduction_steps: `node LC51-probes.mjs`; seed MemoryStore with an active teacher, valid hashed session and owned class. POST assignExam with unknown examId, valid openAt and dueAt=""; inspect saved assignments.
- expected: sections 19/22 reject an unknown/deleted exam before writing; allowed published and trusted static catalog exams remain assignable.
- actual/impact: an orphan assignment is created that students cannot open, including a stale caller after exam removal. No cross-owner write was demonstrated.
- minimal_fix: require allowed published-exam existence or trusted catalog membership; return established NOT_FOUND/INVALID_EXAM otherwise and retain FORBIDDEN for foreign ownership.
- regression_test: unknown/deleted ID causes no write; owned/shared published and catalog exams succeed; foreign owner is rejected; no-due semantics remain unchanged.

### LC69-F04 - MAJOR - Actual app omits review filters, navigation and retry-wrong

- status: VERIFIED; continues LC68-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`; isolated controls at `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: fresh browser-probe.log reports cards=2, filter=false, nav=false, retry=false. Main constructs its own report; the controls implemented/tested in the separate report view are not mounted/wired into this path.
- reproduction_steps: after build, run `node LC51-browser-probe.mjs`. Installed headless Chromium/CDP serves dist at /Cunata/, loads a synthetic 1I+1III exam through the existing hidden input, submits and inspects actual report DOM.
- expected: sections 24.1/24.5 supply all/wrong/blank filters with aria-pressed, question navigation and a separate local retry-wrong attempt explicitly never sent to the teacher.
- actual/impact: approved student functions remain unavailable even though isolated renderer tests pass.
- minimal_fix: integrate the controls with actual report projection/lifecycle. Practice must use its own immutable snapshot/ID without collector/assignment linkage and preserve the original final and route cleanup.
- regression_test: actual app submission - filters and navigation, including hidden destinations; retry wrong/blank/partial-II questions; no submitResult request or original-final mutation, including after refresh.

### LC69-F05 - MAJOR - Switching exams during report download crashes export

- status: VERIFIED; continues LC68-F05. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:3019`, `:3063`, `:3095`, `:3099`, `:3183`, `:3188`, `:3197`.
- evidence: new download-race.json records errors=["TypeError: Cannot read properties of null (reading 'totalFraction')"], downloads=[], title="New exam B". Fresh intended-behavior regression fails.
- reproduction_steps: `node download-race.mjs`. Submit A containing a same-origin Markdown image; delay only the download image fetch with a controlled promise. Click download, load B through the existing hidden input while fetch is pending, then release fetch. Capture unhandled rejection and HTML Blobs. Only timing is controlled; product source is unchanged.
- expected: a started export stays bound to A's immutable title/final/responses/order/score/attempt ID, or cancels explicitly with recoverable feedback.
- actual/impact: after await, the callback reads mutable currentExam/presentationOrder/scoredResult/attemptId; opening B clears scoredResult and export rejects without an HTML download. Mixed identities are also a code-path risk, but a mixed-score variant was not separately reproduced.
- minimal_fix: capture the complete immutable export model and filename before the first await; render only that model and report asset/fetch failures visibly. Route changes must not substitute active-exam fields into pending exports.
- regression_test: delay A's image fetch, open B, then resolve; exported HTML and filename retain A's metadata, score, questions and identity without rejection. Include cancellation, fetch failure, repeated clicks and independent concurrent downloads.

### LC69-F06 - MAJOR - Canonical rich blocks vanish in the actual exam and reports

- status: VERIFIED; continues LC68-F06. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:1604`, `:3009`, `:3168`; supported renderer at `src/student/view.ts:1088`; importer output at `src/import/docx/segmentation.ts:384`, `:385`.
- evidence: fresh blocks-probe.json: schemaValid=true, exam.stem="", exam.tables=0, reviewContainsStem=false, downloadContainsStem=false, downloadContainsTable=false. Intended-behavior regression fails. Main reads q.content; schema accepts q.blocks and the separate student view supports them.
- reproduction_steps: `node blocks-probe.mjs`; create a valid canonical one-question exam with empty content and blocks containing a distinctive text stem plus one-cell table. Assert parseExam accepts it, load in actual app, inspect stem, submit, inspect review and downloaded HTML.
- expected: Shared section 6 / WEB sections 4/8/20 preserve/show canonical text, table, image and math content, or explicitly warn of unsupported content. Valid question content must not silently disappear.
- actual/impact: student sees choices with an empty question; review and export also lose stem/table. DOCX rich content is at risk because segmentation emits blocks. Loss of a real imported equation/image is not claimed from this synthetic text/table reproduction.
- minimal_fix: use a shared safe Block/asset renderer in actual exam, review and portable export, with consistent content precedence, spans, math verification labels and explicit unsupported flags. Avoid unsafe HTML injection.
- regression_test: blocks-only text/table/math/image exam through actual app - submit - reload - standalone offline report; compare semantic content, table spans and assets with its immutable snapshot; include mixed content+blocks and hostile/unsupported input.

## checks_run

Environment: Windows PowerShell; Node v24.14.0; TypeScript 7.0.2; Python 3.11.0; installed headless Chrome/Edge CDP harness. All commands below run in SNAPSHOT. Logs redirected by PowerShell are UTF-16. An observation probe exiting 0 while asserting a bug means reproduction succeeded, not that the product passed.

| Command | Exit | Evidence / result |
|---|---:|---|
| `node scripts/build.js` | 0 | build.log; emitted/promoted 339 verified files. Existing DEP0190 child-process warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | tsc.log; no diagnostics. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | tsc-web.log; no diagnostics. |
| `npm test` - initial run concurrent with browser checks | 1 | npm.log; tests1,613/suites345/pass1,612/fail1/skip0/cancelled0/todo0; 72,294.0809ms. Performance case at test/browser/bundle-security-perf.test.ts:151 measures 189ms against its 150ms threshold. |
| `npm test` - isolated rerun after other browser commands finished | 0 | npm-isolated.log; tests1,613/suites345/pass1,613/fail0/skip0/cancelled0/todo0; 28,805.3705ms. No assertions/settings changed. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | claude.log; tests104/suites5/pass104/fail0/skip0/cancelled0/todo0; 73,584.7914ms. Includes real-browser/design and simulated-service cases. |
| `node LC51-probes.mjs` | 0 | probes.log; F01/F02/F03 reproduced; six roster/PIN/history actions return UNKNOWN_ACTION. |
| `node LC51-differential.mjs` | 0 | differential.log; product total/max and every section score/max match 1,632 independent expected fixtures. |
| `python -B test/oracle/oracle.py --check` | 0 | oracle.log; tests11/pass11/fail0/skip0; 1,632 fixtures, 5,849 maxima configurations, nine negative controls; reported 7.5074s. This checks the oracle; the preceding differential executes product code. |
| `node LC51-browser-probe.mjs` | 0 | browser-probe.log; actual-app F04 confirmed. |
| `node download-race.mjs` | 0 | download-race.log/json; F05 rejection and zero downloads. |
| `node blocks-probe.mjs` | 0 | blocks-probe.log/json; F06 valid rich content missing. |
| `node --test lc67-regressions.test.mjs` | 1 | intended-regressions.log; tests2/pass0/fail2/skip0. Assertions require intended behavior on fresh browser observations; test name retains original provenance. |
| `node r0-independent.mjs` | 0 | r0-independent.log/json and r0-portable/report.html; fresh actual-app submission/download and file:// image loading. |
| `node --test r0-regressions.test.mjs` | 0 | r0-regressions.log; tests4/pass4/fail0/skip0; 162.6189ms. Displayed option letters, question order, embedded offline image and assignment isolation remain correct in these cases. |
| `node --test --test-timeout=240000 "test/codex-check/**/*.test.mjs"` with read-only Git environment below | 1 | codex.log; tests198/suites2/pass194/fail4/skip0/cancelled0/todo0; 90,571.6873ms. Four R1 glue cases fail while cpSync tries to recreate the temporary node_modules junction without symlink privilege (EPERM), before product assertions. |
| `node --test test/codex-check/feat/R1/glue.test.mjs` - first targeted rerun | 1 | codex-r1-glue.log; tests5/pass1/fail4/skip0; 850.5586ms. Junction preparation had not succeeded; same four EPERM setup failures. |
| `node --test test/codex-check/feat/R1/glue.test.mjs` - after physically copying existing installed dependencies | 0 | codex-r1-glue-corrected.log; tests5/pass5/fail0/skip0/cancelled0/todo0; 2,972.0721ms. No install, product edit or test/assertion change. |

The initial npm failure remains recorded. Its non-repetition in the isolated full rerun is consistent with host contention; it does not establish an application performance regression. The existing five-sample CDP typing-duration test accepts 150ms and does not measure actual input-to-paint p95 <100ms specified as the product target. No independent performance certification is inferred from its green rerun.

For the full supplemental command, PowerShell sets GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata solely so existing read-only admin snapshot hooks can resolve HEAD. Browser artifacts still target SNAPSHOT. Existing copied runtime support acknowledges Browser.close only for harness teardown; it does not fake product responses. The initial supplemental run and first targeted rerun remain failed runs; the successful corrected targeted run is separate evidence, not a relabeling of either run.

No tests were weakened/skipped to obtain green. The isolated R0 report fixtures still omit one I-question permutation and use scoreDTO=null; their passing result cannot close the actual-app integration findings above.

## coverage_gaps

- M1: fresh independent product differential agrees on score/max totals and sections. F02 remains. No incorrect scoring within approved limits demonstrated; not every status/raw/order/DOM combination exhausted.
- M2/M3: actual suites exercise timer, restore, revision/two-tab, builder and bank. Fresh app probes reveal F04/F05/F06. Broad private-mode/quota/migration and media-offline recovery matrix NOT_RUN. Hidden-input synthetic probes do not certify the future PIN/class journey.
- M4/R2: local API/config/publish and simulated services are checked. Live Neon SQL concurrency, deployed Vercel CORS/write/receipt/readback/dedupe and Google service behavior NOT_RUN; no production credentials or writes used. Trusted grading/key confidentiality and complete history-wide secret/dependency/license audit not certified.
- M5: DOCX/PDF regression suites ran. Broad real-document corpus with multicolumn/merged tables/media/unsupported equations/corrupt/encrypted/scan inputs NOT_RUN. Approved PDF mode remains preview/manual; automatic extraction/OCR is not certified. F06 demonstrates incomplete content integration.
- M6: installed Chromium browser/design/keyboard/responsive tests ran; complete manual visual review of every screen/theme/viewport, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse and independent input-to-paint performance benchmarking NOT_RUN. DOM assertions do not certify all layouts or WCAG AA conformance.
- Owner milestone/phone and production acceptance NOT_RUN. Approved roadmap omissions are NOT_IMPLEMENTED, not a new business-policy question.

## Missing roadmap functionality, in priority/dependency order

1. **P1 - Reliability/content baseline (R0):** close F01/F05/F06 and add actual-app regressions before accepting report/offline/content parity. Resolve F03 and F02 in api/domain as bounded fixes.
2. **P1 - R2 local acceptance, then R3 / section 23 roster/PIN and cross-machine review:** addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults all freshly return UNKNOWN_ACTION. Table/type scaffolding does not implement scoped roster CRUD, unique printable PINs, hashed validation, five-failure/ten-minute lockout, studentToken identity, student_id submission binding, cross-machine reports or unsubmitted roster rows. No production activation is implied.
3. **P1 - R4 / section 24.1:** integrate filter/navigation into actual app (F04). Isolated report implementation exists but does not complete the student journey.
4. **P2 - R5 then R6 / sections 24.2-24.3, after R3:** teacher submission details and per-question statistics; no production submissionDialog/btn-view-submission/examStats/stat-row path found. listResults at src/api/handle.ts:551-596 omits detailed raw answers needed for these authorized views.
5. **P2 - R7 / section 24.4, after R3:** PIN-backed myHistory, SVG historyChart and accessible text table are absent from production source.
6. **P2 - R8 / section 24.5, after R4+R7:** distinct local retry-wrong flow with explicit no-teacher-send isolation (F04), including partial-II/blank behavior.
7. **P2 - R9 / section 24.6, after R6:** no btn-teacher-print path; teacher print exam, blank response sheet and separate answer-key page remain absent.
8. **P2 - R10 / section 24.7, after R8+R9:** system dark CSS exists in src/ui/tokens.css:93, but no btnTheme three-state remembered selector found.
9. **P3 - R11:** owner-authorized live Neon/Vercel and phone acceptance, recovery/privacy/import/performance matrix and explicit production-service retirement decision. No deploy or live test undertaken here.

Custom-only presets and manual PDF remain approved scope choices; they are not mislabeled as missing approved implementation. Further changes to grammar, score calculation or rational API scope require consistent approved contracts.

## recommended_action and integrity

Return F01 to collect, F03 to api, F02 to domain, and F04/F05/F06 to app for minimal fixes and actual-path regression evidence. Re-run gates and review the new captured source. Production source has not changed across the retained LC68 and LC69 snapshots, so repeating green suites cannot close these findings.

NEED_DECISION: NONE for current fixes/approved roadmap. tools_research: NOT_REQUESTED. privacy_notes: synthetic local fixtures only; no private profile instructions, real student data or credentials included.

Final comparison: all 1,345 captured inputs still match D:/Cunata; repository drift=[]. HEAD remains `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`. src/app/main.ts SHA-256 = `59e318b10701bc4c28aec4b974be114d33b618300355d6376005845f69ef29ab`. Evidence: SNAPSHOT/source-hashes.json, delta.json and final-snapshot.json. Source changes after this comparison require renewed review.

Build and both typechecks pass; isolated npm passes1,613/fails0 after an initial performance failure; Claude passes104/fails0. Supplemental Codex passes194/fails4 at preparation, followed by corrected R1 glue passes5/fails0. Independent intended-behavior report regressions remain pass0/fail2, while prior-fix regressions pass4/fail0. All six findings remain verified and open. **CHANGES_REQUESTED**, not release approval.
