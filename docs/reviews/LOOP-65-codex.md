# LC65 - Independent whole-product audit

review_id: LC65; task_id: LC65; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus pre-existing working-tree changes.
requirements_version: Shared Product Contract v2.0; WEB-contract.md sections 1-24, read in full; inherited M1-scoring-contract; DESIGN.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Eight verified findings: six MAJOR and two MINOR. No release approval.
NEED_DECISION: NONE for these fixes or approved roadmap requirements. Preserve custom-v1, charset-only III validation and approved PDF preview/manual scope.

## Snapshot, scope and method

Read git status/log and HEAD-to-working-tree source diff, previous LC64 and newly added ROADMAP-R0 review. HEAD has not advanced since LC64. Current files were copied before running anything: **1,342 selected inputs**, including current src/test/scripts/docs/public/styles/apps-script, root HTML/JSON/config/README, ops/publish.py and three retained probe scripts. Installed node_modules was copied without installation. No new branch or Git worktree.

Execution/artifact directory: `%USERPROFILE%/AppData/Local/Temp/LC65-xophqbbe` (SNAPSHOT). `source-hashes.json`, `delta.json`, `git-status-before.txt` and `final-snapshot.json` retain provenance. Every path common with LC64's input manifest matched its SHA-256. The only additional selected files were `docs/reviews/LOOP-64-codex.md` and `docs/reviews/ROADMAP-R0.md`. No common runtime or assertion source changed. This is an incremental whole-product audit; unchanged files were not all reread line by line.

files_reviewed: current source and HEAD diff for src/api/{handle,auth,index,types,store/memory,store/neon}; src/collect/{index,appsScript}; src/domain/{scoreAttempt,rational,index}; src/storage/index; src/student/{index,area}; src/report/{index,view}; src/app/main; src/offline/service-worker; src/import/{docx/segmentation,pdf/manual,preview/core}; src/schema/types; src/teacher/portal; src/bank/index; build wrapper/config/package and README; CK16 test/harness, report controls and independent probe implementations. Repository-wide symbol/caller searches checked sections 23-24. Full tests exercise the other regions; this does not prove all paths correct.

Only docs/reviews/LOOP-65-codex.md is intentionally written in the repository. Build, tests, probe scripts and generated artifacts stay in SNAPSHOT. No code fix, install, dependency addition, commit, deploy or real-service write. For supplemental read-only Git inspection, GIT_DIR/GIT_WORK_TREE pointed to the original metadata; executable product source stayed in SNAPSHOT. Probe filenames/fixture IDs beginning LC51/LC50/R0 are retained historical names; every result below was freshly executed in LC65.

Fresh independent score differential compares total/max and each section score/max against 1,632 expected fixtures, with no disagreement. Rational sums, exact III equality, unanswered II handling, finalization/CAS and auth changes were checked. API ingestion still does not establish authoritative server grading for examinations that require hidden keys/trusted scores; no such certification is made.

## Findings

### LC65-F01 — MAJOR — Concurrent dispatch bypasses the durable retry budget

- finding_id: LC65-F01; status: VERIFIED; continues LC64-F01.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:414`, `:446`, `:453`, `:475`, `:624`.
- evidence: retry/backoff checks do not reject an active `sending` record. CAS increments generation without consuming a dispatch; retryCount increments only after a retryable failure returns. Later callers can send while earlier transports remain pending.
- reproduction_steps: from the execution snapshot run `node LC51-probes.mjs`. Parse hoa-repeating, create memory-backed durable storage, start/finalize an attempt, enqueue a synthetic endpoint. Invoke drainOutbox six times five milliseconds apart while send promises remain unresolved; inspect outbox, then resolve HTTP503 responses.
- actual: **calls=6, state=sending, retryCount=0, generation=8**. All reproducer assertions passed; no external service was contacted.
- expected: Shared §3 / WEB §7 require bounded durable retries, at most five dispatches including the first; a concurrent caller must honor an active sending lease.
- impact: overlapping callers/tabs or interrupted sends can exceed the persistent budget. Server deduplication does not enforce this client budget.
- minimal_fix: atomically reserve both a consumed dispatch and a durable sending lease through storage CAS before transport. Reject/coalesce while lease is live; retain consumed attempts across reload/expiry. Preserve payload/hash/idempotency tuple and confirmed-terminal behavior. A process-local lock alone does not cover tabs/reloads.
- regression_test: delayed concurrent calls through multiple storage instances; one live lease, at most five sends; reload/crash between send and receipt; expired lease recovery; response loss retry uses identical body/tuple; stale callbacks cannot downgrade confirmation or mutate final.

### LC65-F02 — MINOR — Rational parser rejects formatter output

- finding_id: LC65-F02; status: VERIFIED; continues LC64-F02.
- **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:119`, `:132`, `:138`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer; parseFractionString of that output throws SyntaxError at the 200-character cap.
- expected: M1 §4.1 requires the parser to be the strict inverse of the formatter over the published rational API domain.
- actual: constructor/formatter accept a value the parser rejects; fresh assertions verify both outcomes.
- impact: public API roundtrip failure. No scoring failure demonstrated within the approved 1000-question limit; not a scoring blocker.
- minimal_fix: enforce hostile-input limits at DTO/payload boundaries while retaining the rational inverse API. Restricting the rational domain instead requires consistent constructor/formatter/parser restrictions and an approved contract revision.
- regression_test: canonical positive/negative integer and fractional numerator/denominator roundtrips at lengths 199/200/201; zero; noncanonical rejection; both inverse directions.

### LC65-F03 — MINOR — A nonexistent exam can be assigned

- finding_id: LC65-F03; status: VERIFIED; continues LC64-F03.
- **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: null getExam bypasses the ownership rejection; no trusted ctx.catalog membership check precedes saveAssignment.
- reproduction_steps: `node LC51-probes.mjs` seeds MemoryStore with an active teacher, valid hashed session and owned class. Use empty catalog and POST assignExam with examId=`does-not-exist`, valid ISO openAt and dueAt=`""`.
- actual: **HTTP200, success=true, one assignment persisted**; both response and stored count are asserted.
- expected: WEB §§19/22 permit available own/shared published exams or trusted static catalog exams; unknown exams must fail without a write.
- impact: creates orphan assignments leading students to unavailable exams; stale callers after unpublish can encounter the same path. No cross-owner mutation demonstrated.
- minimal_fix: require an existing permitted published exam or trusted catalog membership before save; return established NOT_FOUND/INVALID_EXAM for unknown IDs.
- regression_test: nonexistent/deleted exam creates no assignment; own/shared published and catalog exams work; foreign owner stays FORBIDDEN; retain no-due-date semantics.

### LC65-F04 — MAJOR — Report filter, navigation and retry-wrong are absent in the app

- finding_id: LC65-F04; status: VERIFIED; continues LC64-F04.
- **VÙNG chịu trách nhiệm: src/app** (coordinates src/report and src/student).
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`, `:2931`; isolated controls at `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: the app renders its own report DOM; it does not mount the isolated report controls or wire retryWrong. Isolated renderer tests do not establish built-app availability.
- reproduction_steps: `node LC51-browser-probe.mjs` serves freshly built dist under `/Cunata/` through the existing real-browser harness. Load a synthetic 1I+1III fixture through the hidden file input, submit via UI and inspect the report DOM.
- actual: **cards=2, filter=false, nav=false, retry=false**; browser assertions passed. Browser/context/server closed. This fixture isolates report integration and does not certify the class/PIN journey.
- expected: WEB §§24.1/24.5 require all/wrong/blank controls with aria-pressed, question links and a separate local practice attempt containing wrong/unanswered questions, explicitly not sent to the teacher.
- impact: requested controls remain unavailable to app users despite implementation in the isolated renderer.
- minimal_fix: integrate controls through the report model and app lifecycle; create independent practice IDs/snapshot without assignment/collector linkage; preserve immutable original final/order/downloads and cleanup.
- regression_test: actual app submit → filter/navigation, including navigation to a hidden question; retry covers wrong/blank and partial II; no submitResult request or original-final mutation, including after refresh.

### LC65-F05 - MAJOR - Option letters change when reviewing a shuffled attempt

- finding_id: LC65-F05; status: VERIFIED; independently confirms ROADMAP-R0 R0-F01.
- **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:2952`, `:2965`; contrast exam rendering at `:1637`.
- evidence: examination labels use shuffled display index; report labels and chosen/correct summaries use original opt.label. Fresh browser observation included displayed A/B/C/D becoming B/C/D/A for the same ordered option IDs. Scoring remains ID-based.
- reproduction_steps: `node r0-independent.mjs` then `node --test r0-regressions.test.mjs` in SNAPSHOT. Load a labelled exam with both shuffle flags, choose a moved option, submit, compare labels by optionId before/after. First regression FAILS with actual B./C./D./A. versus expected A./B./C./D.
- expected: WEB section 20 preserves the option order and letters actually seen in the attempt and uses the same mapping in downloaded HTML.
- actual/impact: selected A can be described under another letter in review, misleading the student despite correct numeric scoring.
- minimal_fix: derive optionId-to-letter mapping from the pinned presentation order and use it for option labels and summaries on screen/download; retain IDs and scoring.
- regression_test: real moved-option permutations, compare ID/letter/chosen/correct before and after submit and in the actual downloaded file; verify reload retains mapping.

### LC65-F06 - MAJOR - Downloaded HTML loses its images when opened independently

- finding_id: LC65-F06; status: VERIFIED; independently confirms R0-F02.
- **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:310`, `:3060`, `:3068`.
- evidence: the real download contains `src="public/q01-bbt.svg"`. The image loaded during the exam (naturalWidth > 0), but loaded=false after moving the single HTML into SNAPSHOT/r0-portable/report.html with no adjacent public directory. Fresh browser evidence in r0-independent.json; second regression FAILS.
- reproduction_steps: run the two R0 commands above; the probe loads Markdown with a verified same-origin image, submits, downloads, writes the HTML alone into a fresh directory and opens it using file://.
- expected: Shared report requirement and WEB sections 9/20 require a self-contained offline report with embedded images.
- actual/impact: the downloaded report cannot show the illustration needed to understand the question offline.
- minimal_fix: resolve approved local assets to data URIs before Blob creation; cover question/option/explanation images, preserve alt and show an actionable missing-asset failure. Never fetch arbitrary external URLs supplied by exams.
- regression_test: open the actual HTML alone from an empty directory after stopping the HTTP server; assert every required image loads, including images in options/explanations; verify unsafe external sources remain blocked.

### LC65-F07 - MAJOR - Download ignores shuffled order and omits per-question results

- finding_id: LC65-F07; status: VERIFIED; independently confirms R0-F03.
- **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:3035`, `:3041`, `:3059`.
- evidence: actual exam order was ck-i-02, ck-i-04, ck-i-03, ck-i-01, ck-ii-02, ck-ii-01, ck-iii-01, ck-iii-02. Download reverted to ck-i-01, ck-i-02, ck-i-03, ck-i-04, ck-ii-01, ck-ii-02, ck-iii-01, ck-iii-02. The source iterates currentExam.questions/q.options and its template lacks each question's score/max/status. Third fresh regression FAILS on order.
- reproduction_steps: run R0 browser probe and regressions above with both shuffle flags; compare actual screen/card order with downloaded card IDs and inspect per-question result fields in the downloaded HTML.
- expected: section 20 requires the same full attempt content, displayed order and per-question points/status on screen and in the portable report.
- actual/impact: saved report changes question/option sequence and drops result detail, preventing accurate offline comparison with the completed attempt.
- minimal_fix: share a projection from immutable final plus presentation order for screen and download, carrying ID/letter/order, per-question score/max and textual status.
- regression_test: compare screen and actual downloaded HTML for question IDs, option IDs/labels, chosen/correct attributes, full/partial/wrong/unanswered status and exact formatted question points across a non-identity shuffle.

### LC65-F08 - MAJOR - Collector borrows another attempt's active assignment metadata

- finding_id: LC65-F08; status: VERIFIED; independently confirms R0-F04.
- **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/appsScript.ts:1349`, `:1351`, `:1354`, `:1357`.
- evidence: send(final) falls back to cunata:active_assignment in session/localStorage when class/assignment metadata is missing. It does not check the final's exam or attempt tuple. Fresh regression's mock fetch captures class_code=ABCDEF and assignment_id=other-assignment on exam r0-offline-original while active assignment belongs to unrelated-exam; assertion expecting absent metadata FAILS.
- reproduction_steps: `node --test r0-regressions.test.mjs` fourth test. Construct a final without assignment fields, set synthetic sessionStorage active_assignment for another exam, invoke createAppsScriptCollectorPort with a recording local mock fetch, inspect JSON body. No real service is called.
- expected: Shared section 3 and WEB sections 5-7/19.2 require immutable attempt-bound metadata and identical retry body/hash/tuple.
- actual/impact: submission receives another exam's class/assignment or becomes rejected; repeating the same final can send different metadata after switching exams. Production acceptance of a wrong row was NOT tested.
- minimal_fix: transport sends only metadata pinned in final/outbox. If supporting legacy migration, verify tuple and persist a single complete assignment before enqueue; never merge fields from current activity during send.
- regression_test: no-assignment final stays unassigned despite active B; final A with metadata stays A before/after switching to B, reload and receipt-loss retry; compare identical full request body/hash/tuple and reject mixed assignment fields.

## checks_run

Environment: Windows PowerShell, Node v24.14.0, installed TypeScript 7.0.2, Python 3.11.0, existing real Chrome/Edge CDP harness. npm.cmd/npx.cmd are the Windows executables for requested npm/npx commands. All runnable checks used SNAPSHOT; log redirects are UTF-16. Exit zero on defect-asserting probes means successful reproduction, not a product fix.

| Command | Exit | Actual result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | 339 emitted/validated files; build.log. Existing DEP0190 warning retained. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; tsc.log. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; tsc-web.log. |
| `npm test` - initial | 1 | 1,610 tests/345 suites; pass1,609/fail1/skip0/cancelled0; 53,147.0282ms. CK16-F01 at test/final-quality/ck12Regressions.test.ts:1154 times out in CDP Runtime.evaluate(caches.keys()); npm.log. |
| `node --test --test-name-pattern='CK16-F01' test/final-quality/ck12Regressions.test.ts` | 0 | pass1/fail0/skip0; 11,663.0787ms; ck16-rerun.log. Does not establish why the initial timeout occurred. |
| `npm test` - full rerun | 0 | 1,610 tests/345 suites; pass1,610/fail0/skip0/cancelled0/todo0; 29,488.9227ms; npm-rerun.log. Initial timeout remains unresolved evidence. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 tests/5 suites; pass104/fail0/skip0/cancelled0; 43,149.5175ms; claude.log. Includes design.test.mjs and actual browser/local simulated services. |
| `node LC51-probes.mjs` | 0 | Fresh F01/F02/F03 reproductions and all six section23 actions UNKNOWN_ACTION; probes.log. MemoryTransactionAdapter/MemoryStore, no real-service write. |
| `node LC51-browser-probe.mjs` | 0 | Real freshly built app: cards2/filterfalse/navfalse/retryfalse; browser-probe.log. |
| `node LC51-differential.mjs` | 0 | 1,632 production total/max and section score/max fields agree with independent expected values; differential.log. |
| `python -B test/oracle/oracle.py --check` | 0 | pass11/fail0/skip0; 1,632 fixtures, 5,849 maxima configurations, 9 negative controls; 4.5147s reported duration; oracle.log. |
| `node r0-independent.mjs` | 0 | Fresh real browser exam/submit/download/file-open observations; r0-independent.log/json and r0-portable/report.html. |
| `node --test r0-regressions.test.mjs` | 1 | pass0/fail4/skip0; 143.737ms; all four intended-behavior assertions reproduce F05-F08; r0-regressions.log. |

Browser probes ran after the initial npm suite finished. Focused rerun, supplemental suite and full npm rerun were sequential; no competing audit browser suites during those runs. Non-browser differential/oracle ran alongside the initial gate sequence. No assertion, timeout or concurrency setting was weakened. Independent reproducers remain outside the repository.

## coverage_gaps

- **M1:** tests/differential and independent oracle pass; F02 remains a public API inverse defect. Differential covers score/max fields, not all raw/status/order/DOM fields. No scoring defect within the approved 1,000-question domain demonstrated.
- **M2/M3:** exercised tests plus selected actual-browser restore, deadline, shuffle, report, builder/bank and class flows. Full quota/private browsing/migration/backup/delete/media-offline matrix NOT_RUN. F05-F07 show green report tests do not establish real portable/shuffled report parity. Hidden-file fixture probes are explicitly not a class/PIN journey.
- **M4:** F01/F08 remain verified; F03 permits an orphan assignment. Real Google/Neon/Vercel CORS, SQL concurrency, write/receipt/readback/deduplication NOT_RUN: no production credentials/endpoints used. Local services and captured SQL are not live-service evidence. No trusted-grading/confidential-key certification. Comprehensive Git-history secret scan, dependency/license audit NOT_RUN.
- **M5:** synthetic DOCX/PDF regressions run; missing II keys stay unresolved in current source. Full real-document corpus (merged tables, columns, images, unsupported OMML, corrupt/encrypted/scanned PDF) NOT_RUN. PDF scope remains preview/manual, with no automatic extraction/OCR claim.
- **M6:** supplemental real-browser design/responsive/keyboard/contrast/offline tests run. Manual visual inspection of every screen at 375/768/1440px in both themes, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse NOT_RUN. DOM assertions do not certify all layout/WCAG behavior. No new independent p95 input-to-paint performance certification.
- **Test stability:** initial CK16-F01 timeout and focused pass are both retained. Cause unresolved; do not call it a proven product SW defect or an established harmless infrastructure failure. Do not erase the first full-run failure when reporting the later result.
- **section 23 NOT_IMPLEMENTED:** fresh addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults return UNKNOWN_ACTION. Student table/types and optional student_id do not implement roster CRUD, unique hashed four-digit PINs, lockout, identity binding, cross-machine results or unsubmitted teacher rows.
- **section 24:** F04 proves filter/navigation/retry are absent in actual app. Production symbol searches also found no rosterPanel/studentPinInput/myHistory/historyChart/submissionDialog/btn-view-submission/examStats/btn-teacher-print/btnTheme. listResults projection omits answer detail needed for full submission/statistics. System dark CSS does not implement remembered Sáng/Tối/Theo máy selection.
- Full test/codex-check .mjs suite NOT_RUN (required npm, supplemental Claude and targeted independent checks were prioritized). Owner milestone acceptance NOT_RUN; no release approval.

## Missing roadmap features - priority order

1. **P1 correctness/reliability:** fix durable sending lease/dispatch budget (F01), attempt-bound collector metadata (F08), shuffled report labels/order and portable images/question results (F05-F07), nonexistent assignments (F03), and rational API inverse (F02). Regions src/collect, src/app, src/api, src/domain. Add genuine end-to-end/crash/retry regressions, preserve timeout evidence and investigate CK16 recurrence.
2. **P1 section 23:** owner-scoped roster CRUD and printable PIN list; unique hashed PINs, five failures/ten-minute server lockout; studentToken and roster-bound student_id/name; cross-machine myResults/reconstructed report; unsubmitted teacher rows. Regions src/api, src/collect, src/teacher, src/student.
3. **P1 sections 24.1/24.5:** integrate filter/navigation and separate local retry-wrong attempt (F04); never send practice to teacher or mutate original final, including after reload. Regions src/app, src/report, src/student.
4. **P1 sections 24.2/24.3:** full authorized submission viewer; question correctness/option distributions/top three wrong III answers from valid submissions. Regions src/api, src/teacher, src/report.
5. **P1 section 24.4:** PIN-backed history, SVG score chart and accessible text table. Regions src/student, src/api.
6. **P2 sections 24.6/24.7:** teacher print with blank answer sheet and separate key; persisted three-state theme selector and AA contrast verification across all screens. Regions src/teacher, src/report, src/ui.
7. **P2 acceptance:** live-service checks under owner-approved access, recovery/privacy/import corpus, OS IME and multiple browsers/AT/performance, changelog/rollback and owner acceptance. All regions/glue. Official presets and automatic PDF/OCR remain outside approved implementation scope.

recommended_action: return all eight verified findings to their owners, fix minimally with regression coverage, complete approved roadmap items and rerun gates plus independent built-app review. NEED_DECISION: NONE for required fixes. If changing the documented rational API domain instead of restoring its inverse, seek an owner choice: (A) retain inverse and constrain hostile DTO inputs; (B) version the contract with consistent constructor/formatter/parser limits. This review adopts neither a new policy nor a changed API domain.
tools_research: NOT_REQUESTED; no tool installation.
privacy_notes: synthetic fixtures only; no private profile instructions, production credentials or real student data included.

Snapshot integrity: final comparison checked 1,339 original repository inputs; only docs/reviews/ROADMAP-R0.md changed concurrently. No selected product source/test/build/config drift was detected. HEAD unchanged. The audit applies to the pinned product snapshot; later source changes require renewed review. Final git-status delta adds only `?? docs/reviews/LOOP-65-codex.md`; no pre-existing status entry was removed. Concurrent ROADMAP-R0 document edits were preserved.
