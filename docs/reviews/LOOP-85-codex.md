# LC85 - Independent whole-product audit

review_id: LOOP-85-codex; task_id/worker_id: LC85; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` (main) plus captured dirty-tree inputs.
requirements_version: Shared Product Contract v2.0; WEB-contract sections 1-24; inherited M1 API and handoff; approved decisions; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Six verified findings remain: four MAJOR and two MINOR. The mandatory npm gate also fails. LC84-F07 (Apps Script payload mutation) is repaired and the complete local Apps Script suite passes. NEED_DECISION: NONE for the identified fixes or the approved roadmap. This report does not grant milestone or production acceptance.

## Scope and reproducibility

Only this report is intentionally written in D:/Cunata. No product/test modifications, installs, dependency changes, branch/worktree, commit, deployment or live-service writes. Existing unrelated changes are preserved. Reviewer configuration was loaded privately; no private instructions are included.

Evidence directory: `%USERPROFILE%/AppData/Local/Temp/LC85-hvptrf3y` (ordinary temporary copy, not a Git worktree). Source, tests, docs, scripts, public assets, root configuration/HTML, ops/publish.py and existing local harness support were captured; installed node_modules was copied without installation. Builds, test-generated fixtures and observations remain in that directory. public/config.json is unconfigured; production configuration was excluded. `source-hashes.json` records 1,366 inputs; git-status.txt, git-log.txt and git-diff.txt retain repository evidence.

Compared with LC84 current snapshot C, HEAD and all src/**, scripts/**, dependency/configuration and public inputs are unchanged. The sole runtime delta is apps-script/Code.js removing the three-line getExam owner injection. Other differences are the previous review and generated test observations (CX F02/F03 and bank-backup). The initial delta.json omitted eight ops inputs from its hash pass; source-hashes.json was completed before the acceptance suites, and the corrected comparison is stated here. No claim is based on those initial false ops deletions.

files_reviewed: Git log/diff and LC84 hash comparison; changed Apps Script getter/listing/ownership flow; actual app question -> answer -> final -> report -> portable download, teacher editor/publish/library filtering, collector dispatch and transactional outbox, domain rational/scoring/serialization, schema/import rich content, API assignment/auth/store/Neon/public catalog boundaries, student/offline lifecycle, report projections and build/publish composition. All regions were exercised by automated suites where present; unchanged files were reviewed through relevant data flows and prior-baseline equivalence, not claimed reread line by line. No dependency/lockfile delta was found. No external research was necessary for this local code audit.

## Findings

### LC85-F01 - MAJOR - Concurrent outbox drains bypass the durable dispatch budget

- status: VERIFIED; persists from LC84-F01. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :437-453, :475, :624; storage CAS boundary src/storage/index.ts:977.
- evidence: probes.log reports calls=6, state=sending, retryCount=0, generation=8. A sending transition consumes no budget and does not reject an existing live send.
- reproduction_steps: `node LC51-probes.mjs`; create a synthetic finalized hoa-repeating attempt using MemoryTransactionAdapter, enqueue, invoke drainOutbox six times five milliseconds apart while transport responses remain pending, inspect persisted outbox, then resolve with 503.
- expected: Shared section 3 / WEB section 7 bound dispatches to five including concurrent callers and recovery.
- actual/impact: six requests are dispatched with zero consumed retries; more callers or crashes before a response bypass the intended bound. This is a local concurrency reproduction, not a claim of duplicate live database rows.
- minimal_fix: atomically reserve a consumed attempt and durable sending lease before transport; coalesce/reject an active lease, recover expired leases without resetting consumed attempts. Retain tuple/hash/generation pinning and terminal server confirmation; a process-only mutex cannot cover multiple tabs.
- regression_test: two clients, delayed/lost receipts, crash/reload/lease expiry; one live send and at most five dispatches, immutable payload/hash/final, late responses cannot downgrade confirmation.

### LC85-F02 - MAJOR - Switching exams during HTML download crashes export

- status: VERIFIED; persists from LC84-F02. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3094-3101, :3143-3161, :3259, :3271-3293.
- evidence: download-race.json/log capture `TypeError: Cannot read properties of null (reading 'totalFraction')`, downloads=[], title="New exam B". intended-regressions.log fails the expected-behavior assertion.
- reproduction_steps: `node download-race.mjs`, then after blocks-probe.mjs `node --test lc67-regressions.test.mjs`; submit A containing an internal image, delay its image fetch during download, load B through the hidden file input, release A's fetch, observe rejection and absent Blob download.
- expected: WEB sections 3/20 bind export to A's complete immutable final or explicitly cancel with recoverable feedback.
- actual/impact: the handler reads mutable active-exam/scoring variables after await; opening B clears scoredResult and prevents download. Mixed-identity export is a source risk, not a separately demonstrated outcome.
- minimal_fix: capture the entire immutable export model and filename before the first await, use only captured fields afterward, and display download/asset errors.
- regression_test: delayed A asset -> open B -> resolve; one file retains A's identity/title/order/answers/score and no unhandled rejection; include failure/cancel/concurrent downloads.

### LC85-F03 - MAJOR - Math inside table cells is silently omitted

- status: VERIFIED; persists from LC84-F03. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:411-422, :1681, :3086, :3259.
- evidence: lc83-independent.json captures a valid table cell with text/image/math source `x^2+83`; the actual .question-stem text is only `NESTED-TEXT`, and scoped HTML lacks math. independent.log fails the scoped visible-math assertion. The cell renderer handles only text/image; recursive asset collection does not render missing Block kinds. The broad JSON hasMath substring flag is not used as proof.
- reproduction_steps: `node --test lc83-independent.test.mjs`, fourth child; load its synthetic table-block exam through real dist in Chromium and inspect the question stem. nested-report.html preserves the captured download for inspection.
- expected: Shared section 6 / WEB sections 4/8/20 preserve supported math in recursive Cell.blocks or show the retained source with an explicit unsupported-content warning.
- actual/impact: valid mathematical question data disappears without warning and may make the question unsolvable. The executed case proves exam omission; it does not establish a defect in any specific real DOCX. The same helper is used by review/export.
- minimal_fix: share a recursive safe Block renderer for top-level and cell content, including nested tables and math/source verification labels; visibly flag unsupported nodes.
- regression_test: text/math/image/nested-table cells through exam -> final -> review -> standalone download, compare to immutable snapshot; include unsupported OMML and hostile text with safe fallback.

### LC85-F04 - MAJOR - Real report does not expose filters, navigation or retry-wrong

- status: VERIFIED; persists from LC84-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535-554, :2970-3090; isolated controls at src/report/view.ts:922, :1097, :1170.
- evidence: browser-probe.log reports cards=2, filter=false, nav=false, retry=false after actual submission. main.ts builds its own report instead of mounting the separately tested report controls.
- reproduction_steps: `node LC51-browser-probe.mjs`; serve dist under /Cunata/, load a synthetic I+III exam, submit and inspect actual report DOM.
- expected: WEB sections 24.1/24.5 provide all/wrong/blank filters, aria-pressed, question navigation and isolated local practice without teacher submission.
- actual/impact: approved features remain unavailable at the product entrypoint despite their isolated renderer implementation/tests.
- minimal_fix: integrate report projection/actions/lifecycle; retry practice needs a fresh immutable snapshot/ID and no assignment/collector linkage, preserving the original final.
- regression_test: real submit -> filters/navigation including hidden targets -> retry wrong/blank/partial-II -> refresh; zero submitResult calls and original final unchanged.

### LC85-F05 - MINOR - API persists assignments to nonexistent exams

- status: VERIFIED; persists from LC84-F05. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396-405.
- evidence: probes.log: HTTP200/success=true and one assignment stored for `does-not-exist`, with empty trusted catalog. A null getExam bypasses the ownership condition and reaches saveAssignment.
- reproduction_steps: `node LC51-probes.mjs`; seed synthetic active teacher/session/owned class in MemoryStore, assign unknown examId with valid openAt and dueAt="", inspect assignments.
- expected: reject unknown/deleted exams before writing while preserving owned/shared published and trusted-catalog assignments.
- actual/impact: orphan assignment is persisted and cannot be opened by students. No cross-owner write was demonstrated by this case.
- minimal_fix: require an allowed published exam or trusted catalog membership, otherwise NOT_FOUND/INVALID_EXAM with no write; preserve foreign-owner FORBIDDEN and no-due behavior.
- regression_test: unknown/deleted writes nothing; own/shared/catalog success; foreign owner rejection; dueAt="" still succeeds for valid exams.

### LC85-F06 - MINOR - Fraction parser rejects canonical formatter output

- status: VERIFIED; persists from LC84-F06. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls public barrel APIs: toFractionString(rational(10n**200n)) yields a canonical 201-character integer; parsing that exact output throws SyntaxError.
- expected: M1 section 4.1 strict inverse over the public rational API domain.
- actual/impact: valid public-API roundtrip fails. No incorrect score in the approved 1,000-question range was demonstrated.
- minimal_fix: preserve the public inverse, bounding hostile serialized values at their input boundary; any public-domain restriction requires a consistent contract change.
- regression_test: signed canonical integer/fraction roundtrips around 199/200/201 characters, zero, noncanonical rejection and both inverse directions.

## Rechecked fixes and red gate

- LC84-F07 is repaired: Apps Script getExam no longer injects owner into the published payload. Full appsscript.test.mjs: 9/9 pass including >50,000-character exact roundtrip. Ownership remains in listExams metadata; real-browser own-library and key-edit checks pass without listing writes.
- Earlier repaired behaviors remain independently verified: saved B answer key survives publish; browsing leaves revision unchanged and sends zero publish requests; nested report image is a data URI. Top-level Block-only stem/table survives exam/review/download. These narrow successes do not resolve F02-F04.
- `npm test` remains red: test/teacher/portal.test.ts:557, assertion :608, "Teacher exam must have unpublish button". Fixture sets a token but supplies no stored username/owner metadata. Current filtering at src/teacher/portal.ts:1689-1716 excludes the ownerless mock entry. Reconcile representative own/foreign/legacy fixtures and the port contract; do not restore publish-as-permission-check or merely delete/weaken the assertion. The real browser own-exam check passes, so this failure alone does not demonstrate a production authorization bypass.
- Unlike LC84's final npm run, this run has no cancelled browser tests. This does not retrospectively turn LC84's multi-tab timeout into a pass or prove its root cause.

## checks_run

Environment: Windows/PowerShell; Node v24.14.0; TypeScript 7.0.2; Python 3.11.0; installed Chromium/CDP harness. No installs. Commands run against the captured snapshot, never production. Logs redirected by PowerShell are UTF-16. Probe exit 0 means a defect observation was asserted successfully, not product acceptance.

| Command | Exit | Actual result / artifact relative to evidence directory |
| --- | --- | --- |
| `node scripts/build.js` | 0 | 339 files staged/promoted/verified; build.log. Existing DEP0190 warning remains. |
| `npm test` | 1 | 1,617 tests, 345 suites: 1,616 pass, 1 fail, 0 cancelled/skipped/todo; 54,201.0055 ms; npm.log. Teacher fixture failure described above. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; tsc.log. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; tsc-web.log. |
| `node --test test/claude-check/appsscript.test.mjs` | 0 | 9 pass, 0 fail/cancel/skip; 236.0495 ms; gas.log. Local Google simulator only. |
| `node LC51-probes.mjs` | 0 | probes.log: six dispatches with retryCount=0, orphan assignment persisted, canonical fraction inverse fails; six roster/PIN/history actions return UNKNOWN_ACTION. |
| `node LC51-differential.mjs` | 0 | differential.log: all 1,632 product total/max and section score/max values match independent expected fixtures. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass, 0 fail/skip; 1,632 fixtures, 5,849 maxima configurations, 9 negative controls; oracle.log. Independent oracle, separate from product differential. |
| `node --test lc83-independent.test.mjs` | 1 | 5 tests: 3 pass, 2 fail, 0 cancel/skip; 5,846.9491 ms; independent.log / lc83-independent.json. Nested-math child and parent represent one defect; three repaired behaviors pass. |
| `node download-race.mjs`; `node LC51-browser-probe.mjs`; `node blocks-probe.mjs` | 0 / 0 / 0 | download-race.json/log: null totalFraction TypeError/no download; browser-probe.log: 2 cards, missing filter/nav/retry; blocks-probe.json/log: top-level content retained. |
| `node --test lc67-regressions.test.mjs` | 1 | 2 tests, 1 pass, 1 fail, 0 cancel/skip; 131.4438 ms; intended-regressions.log. Expected download-race behavior fails, rich-block baseline passes. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 pass, 0 fail/cancel/skip; 5 suites; 99,766.7628 ms; claude.log. Includes design, latest assignment UI and local service acceptance. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/codex-check/**/*.test.mjs"` | 1 | 199 tests: 189 pass, 10 fail, 0 cancel/skip; 2 suites; 176,426.8331 ms; codex.log. All ten errors are missing temporary student/teacher evidence directories (ENOENT), including one failed after hook; no product assertion failure is inferred from these artifact writes. |
| `node --test --test-concurrency=1 --test-timeout=240000 test/codex-check/cx/student.test.mjs test/codex-check/cx/teacher.test.mjs` | 0 | After preparing the two missing temporary directories: 12 pass, 0 fail/cancel/skip; 26,367.7973 ms; artifact-recheck.log. No source, assertion or test behavior changed. |

Browser supplemental commands preload the existing inspected ops/blitz/promoted/_support/runtime.mjs: it acknowledges Browser.close for harness teardown only, without altering application responses or assertions. Supplemental Git snapshot hooks use read-only GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata. The security artifact directory was prepared before the Codex suite, but the reviewer initially omitted its student/teacher output directories. These omissions caused the ten retained errors. Both directories were then created in the temporary copy and the two affected files passed all 12 tests. The initial full run is not relabeled as a pass; a second complete Codex run was not performed. This is reviewer evidence setup, not a demonstrated source defect. Tests/simulators verify local code behavior, not deployed Google, Vercel or Neon integration.

## coverage_gaps

- M1: fresh product differential and independent oracle cover mandatory scoring/max/exact-answer boundaries. F06 remains; no scoring defect within approved limits was demonstrated. Every possible raw/status/order/DOM combination was not exhausted.
- M2/M3: actual Chromium editor/publish/library, rich-content report and download flows were independently exercised. Full private-mode/quota/migration/recovery matrix, arbitrary-version IDB resume, every route/assignment switch and restored-session/legacy ownership case remain NOT_RUN. No broader guarantee follows from the passing own-exam probe.
- M4/R1/R2: local API/store/auth/ownership/SQL/transport/build/publish paths tested. Live Vercel/Neon atomic concurrency/CORS/receipt/readback/dedupe and Google writes: NOT_RUN, because this audit excludes production configuration and authorization. No trusted-assessment certification, exhaustive Git-history secret scan, external dependency advisory or license audit.
- M5: automated DOCX/PDF coverage, synthetic rich blocks. Broad real multicolumn/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus: NOT_RUN. Approved native PDF preview/manual IR is not an unimplemented automatic-parser requirement. F03 blocks full rich-content acceptance.
- M6: automated real Chromium DOM/keyboard/responsive/design checks are distinguished from manual acceptance. Complete manual visual review of all screens at 375/768/1440 in both themes, Firefox/WebKit, physical phone, OS Telex/VNI, screen reader, independent axe/Lighthouse and p95 input-to-paint measurement: NOT_RUN. Automated checks cannot certify full WCAG/performance compliance.
- A single complete clean Codex acceptance run remains unverified: the initial run and successful affected-file recheck are reported separately; no totals are combined to invent a green full run.
- Owner milestone/production acceptance: NOT_RUN. No live-service activation, deletion or deployment is implied.

## Missing roadmap functionality - priority and dependency order

1. **P0 / R0 acceptance:** repair F01-F04, reconcile the red teacher fixture/ownership contract and repeat the stable gates. Preserve repaired key-edit/read-only listing/nested-image and Apps Script roundtrip behaviors. Close F05/F06 as bounded technical debt.
2. **P1 / R2 -> R3, WEB section 23:** finish local new-service acceptance and implement roster CRUD/print, unique hashed four-digit PINs, five-failure/ten-minute server lockout, studentToken/student_id binding, cross-machine results and unsubmitted roster rows. addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults currently return UNKNOWN_ACTION; students table/types alone do not implement the feature.
3. **P1 / R4, section 24.1, after R0:** expose actual report filters and navigation (F04); isolated src/report/view.ts controls do not satisfy the entrypoint requirement.
4. **P2 / R5 -> R6, sections 24.2-24.3, after R3:** authorized per-student submission dialog, per-question correctness/option distribution/common wrong short answers. No production submissionDialog/btn-view-submission/examStats/stat-row path found.
5. **P2 / R7, section 24.4, after R3:** PIN-backed myHistory, SVG historyChart and accessible table; production path absent.
6. **P2 / R8, section 24.5, after R4+R7:** wrong/blank/partial-II practice with independent snapshot/ID, preserved original result and zero teacher submission (F04).
7. **P2 / R9, section 24.6, after R6:** teacher printing, answer sheet and separate key page; btn-teacher-print path absent.
8. **P2 / R10, section 24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control. System-dark CSS exists; btnTheme path absent.
9. **P3 / R11:** owner-authorized activation/phone acceptance, recovery/privacy/import/performance matrix, version 1.0 and old-service retirement decision. No activation permission inferred from local review.

Custom-only presets and manual PDF remain approved choices. No new scoring grammar, storage or service policy was selected. tools_research: NOT_REQUESTED. privacy_notes: synthetic local fixtures only; no credentials, real student records or private instructions included.

recommended_action: F01 -> src/collect; F02-F04 -> src/app; F05 -> src/api; F06 -> src/domain. Teacher/test owners reconcile metadata fixtures while retaining read-only listing assertions. Run final stable gates after fixes. Report delivery READY_FOR_REVIEW; product verdict CHANGES_REQUESTED.

Final integrity: final-snapshot.json records 1,366 input hashes, unchanged HEAD `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`, runtimeDrift=[], and app SHA-256 `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. Other captured-input drift: ["test/codex-check/fixtures/bank-backup.json"]. Generated test evidence may change independently; source arriving after this comparison is outside this review. Only docs/reviews/LOOP-85-codex.md was intentionally written in the workspace.
