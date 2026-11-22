# LC84 - Independent whole-product audit

review_id: LOOP-84-codex; task_id/worker_id: LC84; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`, main, plus captured dirty-tree inputs.
requirements_version: Shared Product Contract v2.0; WEB-contract sections 1-24; inherited M1 API/handoff; approved decisions; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Seven verified findings: four MAJOR and three MINOR. The full npm gate and the Apps Script roundtrip check also fail in the newer snapshot. NEED_DECISION: NONE for these fixes or the approved roadmap. This is not release/milestone acceptance.

## Scope, deltas and reproducibility

Only this review file is intentionally written in the workspace. No source/test changes, dependency installation, branch/worktree, commit, deployment or production-service writes. Existing unrelated and uncommitted files are preserved. The named reviewer skill/profile was loaded privately; no profile instructions are reproduced here.

Evidence uses three ordinary temporary directories, not Git worktrees:
- A: `%USERPROFILE%/AppData/Local/Temp/LC84-edzsineb` - first captured current tree, 1,365 inputs. Compared with the LC83 input hashes, only src/app/authoring.ts, src/teacher/portal.ts and the previous report changed. All nine earlier findings reproduced here.
- B: `%USERPROFILE%/AppData/Local/Temp/LC84-final-sp9e2opq` - refreshed after concurrent worker changes to src/api/handle.ts, src/app/exam-list.ts, src/app/main.ts, src/collect/appsScript.ts, src/teacher/portal.ts and apps-script/Code.js. Three earlier defects now pass independent expected-behavior checks; six remain.
- C (current review snapshot): `%USERPROFILE%/AppData/Local/Temp/LC84-current-sc0tz1_x` - refresh of B with src/report/download.ts and test/report/r0-f01-f03-regressions.test.ts. These late changes resolve image references inside Markdown text in the isolated download renderer and add one regression. Current mandatory gates and independent probes were rerun here.

Each snapshot has source-hashes.json and delta.json; A/B also retain git-status.txt, git-log.txt and git-diff.txt. Sources, tests, docs, scripts, public assets, root configuration/HTML, ops/publish.py and existing local harness support were copied; installed node_modules was copied without installing. Production configuration was excluded; public/config.json remains unconfigured. Build/test outputs stay in these directories. Later source changes are outside the reviewed hash set and require a new gate.

files_reviewed: actual Git log/diff and inter-snapshot deltas; teacher editor - publish - API ownership metadata - library rendering; app exam/review/export/route integration; domain rational/scoring/max/serialization; collector CAS/storage/student lifecycle; report projections; schema/import Block boundaries; API auth/Memory/Neon and build/publish/offline integration. Unchanged areas were reviewed causally and exercised by automated suites, not claimed reread line by line. No dependency/lock/build-configuration delta was found relative to LC83. No live service or external website was contacted for this audit.

## Findings

### LC84-F01 — MAJOR — Concurrent outbox drains bypass the durable dispatch budget

- status: VERIFIED; rechecked from LC83-F03. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :437–453, :475, :624; CAS storage boundary src/storage/index.ts:977.
- evidence: C/probes.log reports calls=6, state=sending, retryCount=0, generation=8. The sending transition consumes no budget and does not exclude a send already in progress.
- reproduction_steps: `node LC51-probes.mjs`; parse hoa-repeating, finalize a synthetic attempt with MemoryTransactionAdapter, enqueue, then invoke drainOutbox six times five milliseconds apart while local fake transport promises are pending; inspect durable outbox and resolve responses with 503.
- expected: Shared §3 / WEB §7 cap total dispatches at five, including overlapping callers/recovery.
- actual/impact: six requests dispatch with zero consumed retries; more callers or crashes before response can bypass the bound.
- minimal_fix: atomically reserve consumed budget and a durable sending lease before transport; reject/coalesce a live lease and recover expiry without resetting consumed attempts. Preserve tuple/hash/generation pinning and terminal confirmation. A process-local mutex alone does not cover multiple tabs.
- regression_test: two clients, delayed/lost receipts, crash/reload and lease expiry; one live send and at most five dispatches; late responses cannot change confirmed state or immutable final/body/hash.


### LC84-F02 — MAJOR — Switching exams during HTML download crashes export

- status: VERIFIED; rechecked from LC83-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3094–3101, :3143–3161, :3259, :3271–3293.
- evidence: C/download-race.json records `TypeError: Cannot read properties of null (reading 'totalFraction')`, downloads=[], title="New exam B". intended-regressions.log fails the expected race behavior.
- reproduction_steps: `node download-race.mjs`, then `node --test lc67-regressions.test.mjs`. Submit A containing an internal Markdown image, delay its download image fetch, click download, load B through the existing hidden file input, release the fetch, capture rejection and HTML Blob.
- expected: WEB §§3/20 bind export to A's immutable final/title/order/answers/score/identity, or explicitly cancel with recoverable feedback.
- actual/impact: after await the handler reads mutable active-exam state; B clears scoredResult, so no file is produced. Mixed-identity output is a source risk, not a separately reproduced outcome.
- minimal_fix: capture a complete immutable export model and filename before the first await; use captured fields exclusively afterward. Show asset/download errors to the user.
- regression_test: delayed A image → B opens → resolve; one file retains A's metadata/content/score/attempt ID and no rejection. Include failure/cancel/concurrent-download paths.


### LC84-F03 — MAJOR — Math blocks inside table cells disappear

- status: VERIFIED; remaining LC83-F05 after image repairs. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:411–422, :1681, :3086, :3259.
- evidence: C/lc83-independent.json captures a valid cell containing text, image and `{type:'math',source:'x^2+83',format:'latex',verified:true}`. The actual question-stem text is only `NESTED-TEXT`; captured HTML has text/image and no math. The cell loop still handles text/image only; the new recursive asset collector does not render math or nested tables. No unsupported-content warning is rendered for this omission. The saved JSON field hasMath is a weak whole-document substring check and is not used as proof; the scoped DOM assertion actually fails.
- reproduction_steps: `node --test lc83-independent.test.mjs`, fourth child; load the synthetic table-block exam through the real dist file path and inspect the actual exam DOM. Nested HTML output is saved in C/nested-report.html; the same renderer serves exam/review/export.
- expected: Shared §6 / WEB §§4/8/20 retain/render supported math within recursive Cell.blocks, or explicitly preserve source with a warning.
- actual/impact: mathematical data in a valid question is silently omitted, potentially making the question unsolvable. The executed case proves exam omission; no claim about a particular real DOCX is made.
- minimal_fix: use one recursive safe Block renderer for question and cell content, including math/source verification labels and nested tables; explicitly flag unsupported nodes.
- regression_test: math/text/image/nested-table cells through actual exam → submit → review → standalone download, comparing content to the immutable snapshot. Include unsupported OMML and hostile text with explicit safe fallback.


### LC84-F04 — MAJOR — Actual report omits filters, question navigation and retry-wrong

- status: VERIFIED; rechecked from LC83-F07. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535–554 and :2970–3090; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: C/browser-probe.log: cards=2, filter=false, nav=false, retry=false. Main builds its own report instead of mounting the separately tested controls.
- reproduction_steps: `node LC51-browser-probe.mjs`; real headless browser serves dist under /Cunata/, loads synthetic I+III exam, submits and checks actual report DOM.
- expected: WEB §§24.1/24.5 deliver all/wrong/blank filters with aria-pressed, question navigation, and an independent local retry-wrong flow that never sends to the teacher.
- actual/impact: approved student features remain unavailable despite isolated renderer tests.
- minimal_fix: integrate the real report projection/actions/lifecycle; practice must receive its own immutable snapshot/ID and no collector/assignment linkage, leaving the original final untouched.
- regression_test: actual submit → filter/nav including hidden targets → retry wrong/blank/partial-II → refresh; zero submitResult requests and no original-result mutation.


### LC84-F05 — MINOR — assignExam persists nonexistent exam IDs

- status: VERIFIED; rechecked from LC83-F08. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396–405.
- evidence: C/probes.log: HTTP200/success=true and one stored assignment for does-not-exist with empty trusted catalog. Null getExam skips the ownership conditional and reaches saveAssignment.
- reproduction_steps: `node LC51-probes.mjs`; seed active teacher, hashed session and owned class in MemoryStore; assign unknown examId with valid openAt and dueAt=""; inspect assignments.
- expected: reject unknown/deleted exam before writing; allowed owned/shared published and trusted catalog exams stay assignable.
- actual/impact: an orphan assignment is created and students cannot open it. This case does not demonstrate cross-owner writes.
- minimal_fix: require published exam existence/permission or trusted catalog membership; otherwise established NOT_FOUND/INVALID_EXAM, no write. Preserve foreign-owner FORBIDDEN and no-due behavior.
- regression_test: unknown/deleted writes nothing; owned/shared published/catalog succeeds; foreign owner fails; dueAt="" remains supported.


### LC84-F06 — MINOR — Fraction parser rejects canonical formatter output

- status: VERIFIED; rechecked from LC83-F09. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs` calls public barrel APIs. toFractionString(rational(10n**200n)) produces a canonical 201-character integer; parsing that exact string throws SyntaxError.
- expected: M1 §4.1 strict inverse over the public rational API domain.
- actual/impact: valid API roundtrip fails. No incorrect scoring within the approved 1,000-question range was demonstrated.
- minimal_fix: preserve the public inverse and bound hostile serialized values at their input boundary; changing the public API domain requires consistent contract changes.
- regression_test: signed integer/fraction canonical roundtrips around 199/200/201 characters; zero, noncanonical rejection and both inverse directions.



### LC84-F07 - MINOR - getExam changes the published payload while reading it

- status: VERIFIED, new regression in B/C. **VÙNG chịu trách nhiệm: glue** (apps-script/Code.js).
- affected_files: apps-script/Code.js:1058-1061; failing existing assertion test/claude-check/appsscript.test.mjs:132.
- evidence: B/claude.log fails the exact large-exam roundtrip assertion with extra `owner: 'colan'`; C/gas-roundtrip.log independently reproduces it (exit 1, one failed test). The getter injects owner into parsed examObj before returning it.
- reproduction_steps: in C run `node --test --test-name-pattern="đề nặng" test/claude-check/appsscript.test.mjs`. Publish a synthetic >50,000-character exam with a formula-prefixed title and no owner field, then call getExam and compare the exam object with the submitted object.
- expected: WEB sections 17.2-17.3 getExam returns the published exam unchanged, preserving the roundtrip. Ownership metadata needed for filtering belongs in listExams metadata (already added) or another explicit response field.
- actual/impact: getExam adds a field absent from the published exam. Existing compatibility gate fails. No content truncation, score change or authorization bypass was demonstrated by this case.
- minimal_fix: retain owner in listExams and the persisted ownership column; remove mutation of the returned exam object. If a new response metadata field is needed, preserve `exam` verbatim and test both fields independently.
- regression_test: exact roundtrip for ownerless and explicitly owned exam payloads, large chunked exams and formula-prefixed names; ownership library filtering must still work without a publishing probe.

## Rechecked fixes and failing gates

- LC83-F01 is fixed in B/C: real editor selects B, saves, removes radios, publishes, and simulator readback stays B. LC83-F02 is fixed in B/C: opening the library sends zero publish requests and revision stays 1. These were still broken in A; A results do not describe the newer source.
- LC83-F06 is fixed for the executed one-level table-cell image: C/nested-report.html contains a data URI, not public/q01-bbt.svg. Current app traverses cell blocks recursively when collecting assets; isolated download renderer also resolves Markdown references. The late added isolated test passes in C/affected.log. This does not resolve cell math/nested-table rendering (F03).
- Previous top-level Block/section/route/external-image fixes remain verified in B: fixed-behavior.log 5/5 and r0-regressions.log 4/4. C independently rechecks top-level blocks and the failed download race. No broader route/resume guarantee is inferred.
- **npm gate remains red:** B has 1616 tests, 1615 pass, 1 fail. C has 1617 tests, 1614 pass, 1 fail and 2 cancelled. The deterministic failure is test/teacher/portal.test.ts:557, assertion :608, "Teacher exam must have unpublish button". The mock supplies a token but neither a stored username nor owner metadata; new portal filtering at src/teacher/portal.ts:1689-1716 excludes that entry. C/affected.log reproduces this alone (15 tests, 14 pass, 1 fail). Fix the test/port agreement with representative own/foreign/legacy metadata and assert no write while listing; do not restore publish-as-permission-check, delete the assertion, or claim a production ownership bypass based on this mock. A real browser own-exam case passes.
- The two C cancellations are CDP launch-cleanup and service-worker-upgrade cases; recorded separately from the one assertion failure. A narrower sequential recheck is recorded below, without rewriting the original npm result.
- Apps Script exact-roundtrip gate is separately red due to F07. API/metadata improvements must not hide that failure.

## checks_run

Environment: Windows/PowerShell; Node v24.14.0; TypeScript 7.0.2; Python 3.11.0; installed real Chromium/CDP harness. No installs. All commands ran in the identified snapshot, not against production. PowerShell redirected logs are UTF-16. Probe exit 0 means the observation/assertion of a defect succeeded; it is not a product PASS.

| Snapshot / command | Exit | Actual result / log |
| --- | --- | --- |
| C: `node scripts/build.js` | 0 | 339 files emitted/promoted/verified; build.log. Existing DEP0190 warning retained. |
| C: `npm test` | 1 | 1617 tests; 1614 pass, 1 fail, 2 cancelled, 0 skipped/todo; 345 suites; 177422.6065 ms; npm.log. Teacher fixture assertion plus two cancellations identified above. |
| C: `npx --no-install tsc -p tsconfig.json` | 0 | tsc.log and independent tsc-now.log; no diagnostics. |
| C: `npx --no-install tsc -p tsconfig.web.json` | 0 | tsc-web.log and tsc-web-now.log; no diagnostics. |
| C: `node --test test/report/r0-f01-f03-regressions.test.ts test/teacher/portal.test.ts` | 1 | affected.log: 15 tests; 14 pass, 1 fail, 0 cancelled/skip; 759.2892 ms. New nested-image regression passes; teacher assertion fails. |
| C: `node --test lc83-independent.test.mjs` | 1 | independent.log and lc83-independent.json: 5 tests; 3 pass, 2 fail, 0 cancelled/skip; 138269.8728 ms. Three repaired behaviors pass; nested-math child plus parent fail (one defect). |
| C: `node LC51-probes.mjs` | 0 | probes.log and repeated probes-now.log: six concurrent sends with retryCount=0; unknown exam assignment persisted; rational inverse fails; all six roster/PIN/history actions return UNKNOWN_ACTION. |
| C: `node LC51-differential.mjs` | 0 | differential.log / differential-now.log: all 1632 product total/max and section score/max values agree with independent expected fixtures. |
| C: `python -B test/oracle/oracle.py --check` | 0 | oracle.log / oracle-now.log: 11 pass, 0 fail/skip; 1632 fixtures, 5849 maxima configurations, 9 negative controls. Independent oracle, separate from product differential. |
| C: `node download-race.mjs`; `node LC51-browser-probe.mjs`; `node blocks-probe.mjs` | 0 / 0 / 0 | download-race.json: null totalFraction TypeError, no download; browser-probe.log: 2 cards, filter/nav/retry all false; blocks-probe.json: top-level rich content retained. |
| C: `node --test lc67-regressions.test.mjs` | 1 | intended-regressions.log: 2 tests; 1 pass, 1 fail, 0 cancelled/skip; 293.3945 ms. Download-race expected behavior fails; top-level Block case passes. |
| C: `node --test --test-name-pattern="đề nặng" test/claude-check/appsscript.test.mjs` | 1 | gas-roundtrip.log: 1 test, 0 pass, 1 fail; 198.8998 ms. F07 exact payload regression, using local Apps Script simulator. |
| C: sequential `node --test --test-concurrency=1 test/browser/cdpLifecycle.test.ts test/final-quality/ck12Regressions.test.ts` | 1 | cancelled-recheck.log: 17 tests; 16 pass, 1 fail, 0 cancelled/skip; 100331.4956 ms. Previously cancelled lifecycle/upgrade cases pass; another two-tab SW case at ck12Regressions.test.ts:1154 times out evaluating caches.keys(). Product cause NOT VERIFIED; full gate remains red. |
| C: `node --test --test-name-pattern="CX-SEC-02" test/codex-check/cx/schema.test.mjs` | 0 | security-recheck.log: 1 pass, 0 fail/skip; 6609.3612 ms, after creating the test artifact directory. |
| B: `node --test --test-concurrency=1 --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 1 | claude.log: 104 tests; 103 pass, 1 fail, 0 cancelled/skip; 319516.7933 ms. F07 exact roundtrip is the only assertion failure. |
| B: same options, `"test/codex-check/**/*.test.mjs"` | interrupted / 1 | codex.log is partial, no final test totals. Optional duplicate full run was interrupted by reviewer after prolonged concurrent Chromium load; NOT a completed PASS. A completed broad run and C targeted repair check are separately reported below. |
| B: `node --test r0-fixed-behavior.test.mjs`; `node r0-independent.mjs`; `node --test r0-regressions.test.mjs` | 0 / 0 / 0 | fixed-behavior.log: 5/5 pass; r0-independent.log/.json; r0-regressions.log: 4/4 pass. No skip/cancel. |
| A: build; both typechecks; `npm test` | all 0 | build.log, tsc.log, tsc-web.log; npm.log: 1616 pass, 0 fail/cancel/skip; 345 suites; 30712.8798 ms. Earlier source only, not current-green evidence. |
| A: full Claude suite (same command as B) | 0 | claude.log: 104 pass, 0 fail/cancel/skip; 74876.8199 ms. Earlier source only. |
| A: full Codex suite (same command as B) | 1 | codex.log: 198 tests, 197 pass, 1 fail, 0 cancelled/skip; 381423.3718 ms. Only failure: missing ops/blitz/promoted/_audit/security/image-observation.json directory during CX-SEC-02 artifact write. C targeted recheck above passes; do not relabel A as 198/0. |

Execution/setup errors retained: A lc67-regressions was first invoked before blocks-probe.json existed (1 failed file-level test, exit 1); after generating that observation the expected race assertion fails as intended. A r0-regressions was invoked before r0-independent.json existed (exit 1); B generated observations first and then passed 4/4. These are reviewer sequencing errors, not new source defects. A diagnostic diff-print command initially hit cp1252 UnicodeEncodeError and succeeded after PYTHONIOENCODING=utf-8; it did not alter source. Browser teardown delays/concurrent load are not evidence that the product meets performance budgets.

Supplemental runs use existing ops/blitz/promoted/_support/runtime.mjs, inspected before execution, via NODE_OPTIONS=--import=file:///... or direct import. It acknowledges Browser.close for harness teardown without changing application responses/assertions. Supplemental Git snapshot hooks use read-only GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata. Output directories are under snapshots. Mocks/simulators do not verify deployed Google, Vercel or Neon behavior.

## coverage_gaps

- M1: fresh 1632-case product differential and oracle cover mandatory scoring/max/exact-answer boundaries; F06 remains. No incorrect score in the approved 1000-question range was demonstrated. Not every status/raw/order/DOM combination was exhausted.
- M2/M3: real-browser editor, report, route, image, offline, timer and keyboard paths were exercised. Independent entrypoint checks expose F01-F04. Full private-mode/quota/migration/recovery matrix, arbitrary-version IDB resume and all assignment-switch/routing combinations remain NOT_RUN. New owner filtering needs representative restored-session, legacy/shared ownerless, own/foreign and read-failure tests; the existing failing mock is not evidence of a production authorization bypass.
- M4/R1/R2: local API/store/auth/ownership/SQL/transport/build paths exercised. Live Vercel/Neon concurrency/CORS/receipt/readback/dedupe and Google writes are NOT_RUN: production configuration/authorization intentionally unavailable to local tests. No trusted-assessment certification or full Git-history secret/dependency/license audit. The added public owner metadata is a username, not a credential; no password/hash leak was demonstrated in the inspected delta.
- M5: automated DOCX/PDF suites exercised. Broad real-document multicolumn/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus NOT_RUN. PDF native preview/manual entry is approved scope, not a missing automatic-parser promise. Nested math omission prevents full rich-content acceptance.
- M6: automated real Chromium DOM/keyboard/responsive/design cases run, but broad suite gaps/timeouts remain as recorded. Complete manual visual review of every screen at 375/768/1440 in both themes, Firefox/WebKit, physical phone, OS Telex/VNI, screen reader, axe/Lighthouse and independent p95 input-to-paint measurement are NOT_RUN. Automated tests do not certify all WCAG/performance requirements.
- Current complete Codex suite is NOT_COMPLETED; earlier completed suite and narrow recheck do not substitute for it. The C sequential multi-tab timeout is unresolved, not declared a proven SW bug or ignored as harmless infrastructure.
- Owner milestone/production acceptance NOT_RUN. No deployment or live-service write was authorized by this audit.

## Missing roadmap functionality - priority and dependency order

1. **P0 / R0 acceptance:** repair F01-F04 and F07; resolve current teacher test/metadata agreement and rerun browser/SW gates. Preserve the freshly verified key-edit, read-only listing and nested-image fixes. Close F05 orphan assignments and F06 public rational inverse as bounded technical debts.
2. **P1 / R2 - R3, WEB section 23:** finish local new-service acceptance; implement roster CRUD/print, unique hashed four-digit PINs, server five-failure/ten-minute lockout, studentToken/student_id binding, cross-machine results and teacher unsubmitted roster rows. Current addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults all return UNKNOWN_ACTION; tables/types alone do not implement this feature.
3. **P1 / R4, section 24.1, after R0:** integrate actual report all/wrong/blank filters and question navigation (F04); isolated report/view.ts controls are not exposed by the real entrypoint.
4. **P2 / R5 - R6, sections 24.2-24.3, after R3:** authorized per-student submission dialog and per-question statistics, option distribution and common wrong short answers. No production submissionDialog/btn-view-submission/examStats/stat-row path found.
5. **P2 / R7, section 24.4, after R3:** PIN-backed myHistory, SVG historyChart and accessible text table. No current production path found.
6. **P2 / R8, section 24.5, after R4+R7:** independent wrong/blank/partial-II practice with fresh snapshot/ID, immutable original result and zero teacher submission (F04).
7. **P2 / R9, section 24.6, after R6:** teacher exam printing with answer sheet and separate key page; btn-teacher-print production path absent.
8. **P2 / R10, section 24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control. System-dark CSS exists; btnTheme production control absent.
9. **P3 / R11:** owner-authorized real-service activation, phone acceptance, recovery/privacy/import/performance matrix, version 1.0 and explicit old-service retirement decision. No activation/deploy permission is inferred from local review.

Custom-only presets and manual PDF remain approved choices. No scoring grammar, service or storage policy was silently selected. tools_research: NOT_REQUESTED. privacy_notes: synthetic local fixtures only; no credentials, real student records or private-profile instructions included.

recommended_action: send F01 to src/collect; F02-F04 to src/app; F05 to src/api; F06 to src/domain; F07 to glue. Ask teacher/test owners to reconcile the representative ownership metadata fixture and retain read-only listing assertions. Resolve the browser timeout and run a final stable gate after fixes. Report delivery is READY_FOR_REVIEW; product verdict is CHANGES_REQUESTED.

Final integrity: C/final-snapshot.json records 1,365 input hashes, unchanged HEAD 2019a03fabd3225b5e8bc3a602d0c37a4a94c74f, runtimeDrift=[], and app SHA-256 `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. Concurrent input drift is limited to test/codex-check/cx/F02-browser.json and F03-browser.json observation artifacts plus test/codex-check/fixtures/bank-backup.json; these changing files are not approved by this report. No captured runtime/build/configuration/dependency input changed at final comparison. Only docs/reviews/LOOP-84-codex.md was intentionally written in D:/Cunata.
