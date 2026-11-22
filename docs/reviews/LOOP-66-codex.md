# LC66 — Independent whole-product audit

review_id: LC66; task_id: LC66; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus the pre-existing working tree.
requirements_version: Shared Product Contract v2.0; WEB-contract.md §§1–24 (read in full), inherited M1-scoring-contract; DESIGN.md; approved decisions and LO-TRINH-V2.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Eight verified findings remain: six MAJOR and two MINOR. This is not release approval.
NEED_DECISION: NONE for the fixes and approved roadmap features below. No new business policy was adopted.

## Scope, snapshot and evidence

Read Git status/log, HEAD-to-working-tree source changes, LC65, current contracts and R0 review. HEAD has not advanced since LC65. Captured **1,340 repository inputs** before execution, including src/test/scripts/docs/public/styles/apps-script, root configuration/HTML/README and ops/publish.py. Installed node_modules was copied without installation. No branch or Git worktree was created.

Execution directory: `%USERPROFILE%/AppData/Local/Temp/LC66-xh1gf9nq` (**SNAPSHOT**). Provenance: `source-hashes.json`, `delta.json`, `git-status-before.txt`; final comparison is recorded below. Every input common with LC65's manifest had the same SHA-256. Only LOOP-65-codex.md was added and ROADMAP-R0.md differed. No product source, assertion, dependency, build or configuration change since that reviewed snapshot was detected. This is an incremental whole-product audit with fresh execution, not a claim that every unchanged line was reread.

files_reviewed: source and relevant diff/call paths in src/api/{handle,auth,types,store/memory,store/neon}; src/collect/{index,appsScript}; src/domain/{index,rational,scoreAttempt}; src/student/{index,area}; src/storage/index; src/report/{index,view}; src/app/main; src/offline/service-worker; src/schema/types; src/import/{docx/segmentation,pdf/manual,preview/core}; bank entrypoint; teacher integration/callers; build wrapper/config/package/README; browser helpers and independent probes. Repository-wide searches checked the required section 23/24 actions and DOM. Existing full suites supply additional coverage across all regions, with the limitations below.

Only this report is intentionally written in the repository. Build, tests, generated screenshots and probe outputs run in SNAPSHOT to avoid changing out-of-scope files. For tests needing read-only Git metadata, GIT_DIR/GIT_WORK_TREE pointed to the original repository. No install, dependency addition, code fix, commit, deployment or production-service write. Retained LC51/R0 probe names are historical filenames; their outputs in this report were freshly generated in LC66 after inspecting the scripts. Exit zero on a defect-asserting probe means reproduction succeeded, not that the product is fixed.

## Findings

### LC66-F01 — MAJOR — Concurrent dispatch exceeds the durable retry budget

- finding_id: LC66-F01; status: VERIFIED; continues LC65-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: no active-sending exclusion/lease; the CAS transition increments generation without consuming a dispatch. retryCount increments after a retryable response returns. Fresh `probes.log`: **calls=6, state=sending, retryCount=0, generation=8**.
- reproduction_steps: from SNAPSHOT, run `node LC51-probes.mjs`. Parse hoa-repeating, start/finalize in MemoryTransactionAdapter, enqueue a synthetic endpoint; call drainOutbox six times five milliseconds apart while send promises remain pending, inspect durable state, then release HTTP503 responses. No real service is used.
- expected: Shared §3 / WEB §7 bounded retries, at most five dispatches including the first, enforced across concurrent callers and reloads.
- actual/impact: six concurrent sends are admitted without consuming the persisted budget; further dispatches or crashes can bypass it. Server deduplication does not enforce this client budget.
- minimal_fix: atomically reserve a consumed dispatch plus a durable sending lease through storage CAS before transport; reject/coalesce a live lease and preserve consumption across recovery. A process-local lock does not cover multiple tabs. Preserve tuple/hash/body and confirmed-terminal behavior.
- regression_test: delayed concurrent drains through separate storage instances; only one live lease and at most five sends; crash/reload before receipt, expired-lease recovery, lost-receipt retry, stale callbacks after confirmation, and immutable final integrity.

### LC66-F02 — MINOR — Rational formatter output is rejected by its inverse

- finding_id: LC66-F02; status: VERIFIED; continues LC65-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:118`, `:134`, `:140`.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel. `toFractionString(rational(10n ** 200n))` emits a canonical 201-character integer; parseFractionString of that exact output throws SyntaxError at the 200-character cap. Both results are asserted.
- expected: M1 §4.1 defines parseFractionString as the strict inverse of the formatter over the published rational API domain.
- actual/impact: public API roundtrip fails. No incorrect score within the approved 1,000-question domain was demonstrated; this is not classified as a scoring blocker.
- minimal_fix: bound hostile DTO/payload input at its boundary while retaining the rational inverse API. Changing the public domain instead requires consistent constructor/formatter/parser restrictions and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional roundtrips at 199/200/201 characters, zero, both inverse directions and rejection of noncanonical forms.

### LC66-F03 — MINOR — Unknown exam IDs can be assigned

- finding_id: LC66-F03; status: VERIFIED; continues LC65-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection; no trusted catalog-membership check precedes saveAssignment. Fresh probe asserts **HTTP200/success=true and one assignment persisted**.
- reproduction_steps: `node LC51-probes.mjs` seeds MemoryStore with an active teacher, valid hashed session and owned class; use empty ctx.catalog and POST assignExam with examId=does-not-exist, valid openAt and dueAt="".
- expected: §§19/22 allow available permitted published exams or trusted static catalog exams; reject unknown IDs without a write.
- actual/impact: an orphan assignment is created and students cannot load its exam; stale callers after unpublish can hit this path. No cross-owner mutation demonstrated.
- minimal_fix: require a permitted existing published exam or trusted catalog membership before saving; return established NOT_FOUND/INVALID_EXAM for unknown IDs.
- regression_test: unknown/deleted exam creates no assignment; own/shared published and static catalog IDs work, foreign owner stays FORBIDDEN, and no-due-date behavior remains intact.

### LC66-F04 — MAJOR — Filter, navigation and retry-wrong are missing in the actual app

- finding_id: LC66-F04; status: VERIFIED; continues LC65-F04.
- **VÙNG chịu trách nhiệm: src/app** (integration with src/report and src/student).
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; isolated controls at `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: the app constructs a separate report DOM and does not mount/wire the isolated renderer's controls. Fresh actual-browser result: **cards=2, filter=false, nav=false, retry=false** (`browser-probe.log`).
- reproduction_steps: run `node LC51-browser-probe.mjs` after build. The existing Chrome/Edge CDP harness serves dist under /Cunata/, loads a synthetic 1I+1III fixture through the hidden file input, submits through the UI and inspects report DOM. This isolates report integration; it does not certify the class/PIN journey.
- expected: §§24.1/24.5 require all/wrong/blank buttons with aria-pressed, question links and an independent local retry-wrong attempt explicitly not sent to the teacher.
- actual/impact: approved features are unavailable to students despite isolated renderer tests passing.
- minimal_fix: integrate controls with report projection/lifecycle; make practice a distinct ID/snapshot with no assignment/collector linkage, preserving original final/order/downloads and cleanup.
- regression_test: actual app submission → filter/navigation (including a currently hidden question); retry wrong/blank/partial-II cases; no submitResult or original-final mutation, including after refresh.

### LC66-F05 — MAJOR — Reviewing a shuffled attempt changes option letters

- finding_id: LC66-F05; status: VERIFIED; continues LC65-F05 / R0-F01.
- **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:2952`, `:2965`; exam rendering uses display position at `:1637`.
- evidence: fresh `r0-independent.json`, question ck-i-02: option IDs c,b,d,a displayed A,B,C,D during the exam, then C.,B.,D.,A. during review. Scoring remains ID-based. Intended-behavior regression 1 FAILS.
- reproduction_steps: run `node r0-independent.mjs` then `node --test r0-regressions.test.mjs` in SNAPSHOT. Load a labelled fixture with both shuffle flags, choose a moved option, submit and compare labels by optionId before/after.
- expected: §20 preserves option order and the letters the student actually saw, including chosen/correct summaries and downloads.
- actual/impact: a chosen A can be described under another letter after submission, misleading review despite correct numeric scoring.
- minimal_fix: derive optionId-to-letter mapping from the pinned presentation order; use it for option labels and chosen/correct summaries on screen and in downloads. Retain IDs and scoring.
- regression_test: non-identity permutations, matching ID/letter/chosen/correct before/after submission, after reload and in the actual downloaded file.

### LC66-F06 — MAJOR — Downloaded HTML loses images when opened independently

- finding_id: LC66-F06; status: VERIFIED; continues LC65-F06 / R0-F02.
- **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:310`, `:3060`, `:3068`.
- evidence: exam image loads, but the actual download retains `src="public/q01-bbt.svg"`. Opened alone as SNAPSHOT/r0-portable/report.html, the browser reports loaded=false. Intended-behavior regression 2 FAILS.
- reproduction_steps: run the R0 probe/regressions above; submit a fixture containing an approved same-origin Markdown image, download, save only its HTML in a directory with no adjacent public assets and open via file://.
- expected: Shared report requirement and §§9/20 require a self-contained offline report with embedded images.
- actual/impact: the offline report loses illustration/data needed to understand its questions.
- minimal_fix: embed approved local assets as data URIs before creating the Blob; cover question/option/explanation images, preserve alt and report actionable missing-asset errors. Never fetch arbitrary external URLs supplied by exams.
- regression_test: stop the HTTP server and open the real downloaded HTML alone in an empty directory; required images load, including options/explanations; unsafe external sources stay blocked.

### LC66-F07 — MAJOR — Download resets shuffled order and omits question results

- finding_id: LC66-F07; status: VERIFIED; continues LC65-F07 / R0-F03.
- **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:3035`, `:3041`, `:3059`.
- evidence: fresh exam question order **i-02,i-04,i-01,i-03,ii-02,ii-01,iii-02,iii-01** (all IDs prefixed ck-); downloaded order **i-01,i-02,i-03,i-04,ii-01,ii-02,iii-01,iii-02**. Source iterates currentExam.questions/q.options and omits per-question score/max/status. Intended-behavior regression 3 FAILS on order.
- reproduction_steps: run the R0 probe and regressions with both shuffle flags; compare actual question/card order to downloaded data-qid values and inspect downloaded card result fields.
- expected: §20 requires full attempt content, actual display order and per-question points/status both on screen and in portable HTML.
- actual/impact: saved reports change question/option sequence and drop result detail, preventing accurate offline comparison with the attempt.
- minimal_fix: share an immutable-final/presentation-order projection for screen and download, including ID/letter/order, question score/max and textual status.
- regression_test: compare screen and real download for question/option IDs, labels, chosen/correct attributes, full/partial/wrong/unanswered statuses and exact formatted points under a non-identity shuffle.

### LC66-F08 — MAJOR — Collector borrows another exam's active assignment

- finding_id: LC66-F08; status: VERIFIED; continues LC65-F08 / R0-F04.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/appsScript.ts:1349`, `:1351`, `:1354`, `:1357`.
- evidence: send(final) falls back to session/localStorage active_assignment for missing metadata without checking the final's tuple/exam. Fresh regression 4 FAILS: captured class_code=ABCDEF and assignment_id=other-assignment accompany exam r0-offline-original, while the active assignment belongs to unrelated-exam.
- reproduction_steps: `node --test r0-regressions.test.mjs`, fourth test. Construct a final without assignment metadata, set synthetic active assignment B, call createAppsScriptCollectorPort with a recording mock fetch and inspect its JSON body. No real service is contacted.
- expected: Shared §§3/5 and WEB §§5–7/19.2 require immutable attempt-bound metadata and identical retry body/hash/tuple.
- actual/impact: sends another exam's class/assignment or causes rejection; repeating the same final can send different metadata after switching exams. Acceptance of a wrong row by production was NOT tested.
- minimal_fix: transport sends metadata already pinned in final/outbox only. A legacy migration must verify the full tuple and persist one complete assignment before enqueue; never merge fields from current activity during sending.
- regression_test: an unassigned final stays unassigned despite active B; final A stays A after switching/reload/receipt-loss retry, with identical request body/hash/tuple; reject mixed assignment fields.

## checks_run

Environment: Windows PowerShell; Node v24.14.0; installed TypeScript 7.0.2; Python 3.11.0; existing headless Chrome/Edge CDP harness. npm.cmd/npx.cmd implement the requested npm/npx commands on Windows. Artifacts below are under SNAPSHOT; redirected PowerShell logs are UTF-16. Browser suites and independent browser probes ran sequentially, after the npm suite; non-browser probes/differential/oracle overlapped the initial gate sequence. No assertion was weakened; per-test timeouts and concurrency defaults were unchanged. The explicit runner timeout is shown in each command.

| Command | Exit | Actual result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 emitted/validated files; build.log. Existing DEP0190 warning retained. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; tsc.log. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; tsc-web.log. |
| `npm test` | 0 | 1,610 tests / 345 suites; pass1,610/fail0/skip0/cancelled0/todo0; 29,058.8823ms; npm.log. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 tests / 5 suites; pass104/fail0/skip0/cancelled0/todo0; 40,249.8127ms; claude.log. Includes design.test.mjs and real-browser/local simulated-service checks. |
| `node LC51-probes.mjs` | 0 | Fresh F01/F02/F03 assertions; all six section23 actions UNKNOWN_ACTION; probes.log. Memory storage/store; no production write. |
| `node LC51-browser-probe.mjs` | 0 | Fresh real built app: cards2/filterfalse/navfalse/retryfalse; browser-probe.log. |
| `node LC51-differential.mjs` | 0 | Production total/max and each section score/max match 1,632 independent expected fixtures; differential.log. |
| `python -B test/oracle/oracle.py --check` | 0 | pass11/fail0/skip0; 1,632 fixtures, 5,849 maxima configurations, 9 negative controls; 1.3949s reported duration; oracle.log. |
| `node r0-independent.mjs` | 0 | Real exam/submit/download/file-open observations; r0-independent.log/json; r0-portable/report.html. |
| `node --test r0-regressions.test.mjs` | 1 | pass0/fail4/skip0; 160.0578ms; intended-behavior assertions reproduce F05–F08; r0-regressions.log. |
| `node --test --test-timeout=240000 "test/codex-check/**/*.test.mjs"` | 1 | 155 tests / 2 suites; pass147/fail8/skip0/cancelled0; 62,407.8769ms; codex.log. All eight failures are file-load errors: missing ops/blitz/promoted/_support/runtime.mjs in the audit snapshot. The other 147 tests pass, including supplemental real-browser and R1 checks. This command is not reported as PASS. |
| `node --test --test-timeout=240000 "test/codex-check/cx/*.test.mjs"` — partial preparation | 1 | pass7/fail7/skip0/cancelled0, 14 tests; 22,681.5278ms; codex-cx-rerun.log. Adding only runtime.mjs was insufficient: six further support-module imports and a missing security output directory failed. Auditor snapshot-preparation errors, not demonstrated product defects. |
| Same CX command — complete preparation | 1 | 51 tests; pass50/fail1/skip0/cancelled0/todo0; 92,485.2532ms; codex-cx-complete.log. Existing seven support modules copied unchanged and artifact directories created. CX-AS-03 times out in waitBoot (15,000ms condition) at harness.mjs:186 / collect.test.mjs:72, before the teacher-results assertion. Root cause unresolved. |
| `node --test --test-timeout=240000 --test-name-pattern='CX-AS-03' test/codex-check/cx/collect.test.mjs` | 0 | pass1/fail0/skip0/cancelled0/todo0; 20,059.111ms; codex-as03-focused.log. Focused pass does not explain or erase the preceding suite timeout. |

No production code/assertion was changed to run these checks. The existing runtime helper supplies a synthetic Browser.close acknowledgement for teardown only; it is not evidence for product behavior. Both preparation failures and the later genuine browser timeout remain recorded. A focused CX-AS-03 rerun and final snapshot integrity are recorded in the completion section below; separate passing runs are not combined into a fictitious all-green full suite.

## coverage_gaps

- **M1:** fresh product differential and independent oracle agree on score/max fields; F02 remains. This does not exhaust all raw/status/order/DOM fields. No scoring error within approved exam limits was demonstrated.
- **M2/M3:** suites exercise restore, deadline, shuffle, report, builder/bank and class behavior. Full quota/private browsing/migration/backup/delete/media-offline matrix NOT_RUN. F05–F07 demonstrate that green report checks do not establish portable/shuffled report parity. Hidden-file probes do not establish the class/PIN journey.
- **M4:** F01/F08 verified; F03 admits orphan assignments. Live Google/Neon/Vercel CORS, actual SQL concurrency, production write/receipt/readback/deduplication NOT_RUN: this task did not use production credentials or endpoints. Captured SQL and simulated services are not live-service evidence. Trusted grading/confidential-key security is not certified. Comprehensive history secret scan, dependency/license audit NOT_RUN.
- **M5:** synthetic DOCX/PDF regression suites run; code preserves missing II keys as unresolved. Full real-document corpus (merged tables, columns, images, unsupported OMML, corrupt/encrypted/scanned PDF) NOT_RUN. Approved PDF scope remains preview/manual; no automatic extraction/OCR claim.
- **M6:** design/responsive/keyboard/contrast/offline browser tests run. Manual visual inspection of every screen at all required viewports in both themes, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse NOT_RUN. DOM assertions do not certify all layout or WCAG behavior; no new independent p95 input-to-paint certification.
- **Historical stability:** LC65's initial CK16-F01 CDP timeout is previous-run evidence, not a failure observed in LC66. This run passes that gate as part of npm test; the prior intermittent timeout's cause remains unresolved. Neither count is substituted for the other.
- **Current supplemental stability:** the fully prepared CX run still has one waitBoot timeout (CX-AS-03). It does not establish incorrect numeric-class-code submission, but prevents calling that suite green. No competing browser suite was launched by this audit during that run; other workspace activity was observed, without proof it caused the timeout.
- **§23 NOT_IMPLEMENTED:** freshly invoking addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults returns UNKNOWN_ACTION. Student types/table and optional student_id do not implement roster CRUD, unique hashed four-digit PINs, five-failure lockout, authenticated identity binding, cross-machine result retrieval or unsubmitted teacher rows.
- **§24 incomplete:** F04 confirms actual-app filter/navigation/retry absence. Production searches find no rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. listResults omits answer detail needed for full submission review/statistics. System dark CSS does not supply remembered Sáng/Tối/Theo máy selection.
- Owner milestone/production acceptance NOT_RUN; no release approval. No claim that every unchanged code path is independently verified.

## Missing roadmap features — priority order

1. **P1 reliability and report fidelity (R0 / existing baseline):** fix durable sending lease/dispatch budget (F01), pinned collector metadata (F08), report letters/order/portable images/per-question results (F05–F07); reject nonexistent assignments (F03) and restore rational API inverse (F02). Owners src/collect, src/app, src/api, src/domain. Add actual crash/retry/download regressions; investigate recurrence of historical CK16 timeout if it reappears.
2. **P1 R3 / §23:** owner-scoped roster CRUD and printable PIN list; unique hashed PINs, five failures/ten-minute server lockout, studentToken and bound name/student_id; cross-machine myResults with reconstructed reports; unsubmitted teacher rows. Owners src/api, src/collect, src/teacher, src/student. Keep roadmap R2 dependency and verify local wiring first.
3. **P1 R4/R8 / §§24.1/24.5:** integrate filter/nav and distinct local retry-wrong attempt (F04), preserve original result and prevent teacher submission after reload. Owners src/app, src/report, src/student. Respect R8's R4/R7 dependency; do not treat isolated controls as completion.
4. **P1 R5/R6 / §§24.2/24.3:** authorized full submission viewer and per-question correctness, option distributions, top three wrong III answers from valid submissions. Owners src/api, src/teacher, src/report; depends on R3 then R5.
5. **P1 R7 / §24.4:** PIN-backed history, SVG score chart and accessible text table. Owners src/student, src/api; depends on R3 and precedes R8 acceptance.
6. **P2 R9/R10 / §§24.6/24.7:** teacher print with blank answer sheet/separate key; persisted three-state theme selector and AA contrast across screens. Owners src/teacher, src/report, src/ui; respect declared roadmap dependencies.
7. **P2 R11 / acceptance:** owner-authorized live-service verification and phone acceptance, recovery/privacy/import corpus, OS IME, multiple browsers/AT/performance, changelog/rollback and version acceptance. All regions/glue. Do not deploy as part of this review. Official presets and automatic PDF/OCR remain outside approved scope.

recommended_action: return the eight verified findings to their owners, fix minimally with regression coverage, complete approved roadmap features, then rerun gates and independently inspect the actual built app. NEED_DECISION: NONE for required fixes. If choosing to change the rational API domain instead of restoring its inverse, obtain the owner's choice: (A) preserve inverse and bound hostile DTO inputs; (B) version the contract with consistent constructor/formatter/parser limits. Neither policy change is adopted here.
tools_research: NOT_REQUESTED; no tool installation.
privacy_notes: synthetic fixtures only; no private instructions, production credentials or real student data included.

## Completion and snapshot integrity

All requested gates were actually executed: build and both typechecks exit0, npm pass1,610/fail0. Claude suite pass104/fail0. Supplemental Codex initial run and two CX runs retain their exact failures above; the final prepared CX run is pass50/fail1 with a waitBoot timeout, followed by a focused pass1/fail0. No full-Codex all-green claim is made. Independent intended-behavior regressions remain pass0/fail4 and the eight findings remain open.

Final comparison (`SNAPSHOT/final-snapshot.json`) checked **1,347 inputs**, including the seven subsequently copied support modules. HEAD is unchanged. No src, test assertion source, build script, contract, dependency or configuration drift was detected. Three original-workspace JSON files changed while the audit ran: `test/codex-check/cx/F02-browser.json`, `test/codex-check/cx/F03-browser.json`, `test/codex-check/fixtures/bank-backup.json`. Results apply to captured inputs, not an untested replacement fixture. They were not overwritten or restored by this audit.

Git-status delta adds this report plus concurrently observed changes: modified `ops/blitz/promoted/_audit/student/CX-S01b-empty-result.png` and `test/codex-check/fixtures/bank-backup.json`, and new `ops/roadmap/tasks/R0-FIX-1.json` and its prompt file. The prompt was not read. No pre-existing status entry disappeared. All audit execution commands used SNAPSHOT; the only intentional repository write is `docs/reviews/LOOP-66-codex.md`. No claim is made that this audit controls other active workspace processes. Subsequent product changes require renewed review.
