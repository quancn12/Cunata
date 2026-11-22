# LC87 — Independent whole-product audit

review_id: LOOP-87-codex; task_id/worker_id: LC87; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`, branch main, including the pre-existing dirty working tree.
requirements_version: Shared Product Contract v2.0; complete WEB-contract §§1–24 and inherited M1 contract; approved decisions; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Six defects reproduced again: four MAJOR and two MINOR. The full npm gate is red. NEED_DECISION: NONE for the fixes below or the approved local roadmap. Delivery READY_FOR_REVIEW does not mean product or production acceptance.

## Snapshot, scope and review coverage

The only intentional workspace write is `docs/reviews/LOOP-87-codex.md`. No product/test modifications, install, dependency change, branch/worktree, commit, deployment or live-service write. Existing changes are preserved.

Evidence: `%USERPROFILE%/AppData/Local/Temp/LC87-cybhwr9r`, an ordinary temporary copy, not a Git worktree. Build/test-generated files remain there. Existing node_modules was copied, not installed. Production configuration was excluded; public/config.json remains `{ "appsScriptUrl": "" }`. `source-hashes.json` captures 1,361 inputs, including ops/publish.py restored before the corrected Codex run; `git-status.txt`, `git-log.txt`, `git-diff.txt` and `changes-since-LC86.json` record the baseline. The SHA and all captured src/scripts/public/apps-script/test hashes match LC86; there is no new runtime fix since that review. Reports and operational state are not product fixes. Supplemental scripts were inspected, copied from LC86 evidence and executed afresh against this snapshot.

files_reviewed: Git log/current diff and previous-review hash comparison; scoring/rational/serialization/validation/shuffle; schema and rich content; app question→input→final→report→download; transactional storage/controller/offline boundaries; collector dispatch/receipts; teacher library/edit/publish and ownership; API auth/assignments/results/Neon; DOCX/PDF/manual preview; UI/admin and build composition. Available suites cover every module region. Unchanged code is assessed through relevant paths and verified baseline equivalence, not claimed reread line by line. No package/lockfile/compiler-config/build-script delta against HEAD.

## Findings

### LC87-F01 — MAJOR — Concurrent outbox drains bypass the durable send budget

- status: VERIFIED; LC86-F01 persists. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :438–453, :475, :624; CAS boundary src/storage/index.ts:977.
- evidence: fresh `probes.log`: six actual transport calls, durable state `sending`, retryCount=0, generation=8. `sending` is neither rejected nor charged as a consumed attempt.
- reproduction_steps: `node LC51-probes.mjs`; finalize synthetic hoa-repeating using MemoryTransactionAdapter, enqueue, invoke six drains five milliseconds apart with transport unresolved, inspect outbox, then resolve sends with 503.
- expected: Shared §3 / WEB §7 bound dispatches to five including concurrent callers and recovery.
- actual/impact: six requests are sent before a single attempt is charged; repeated callers/crashes before response evade the budget. Duplicate live database rows were not demonstrated.
- minimal_fix: reserve a consumed attempt and sending lease atomically before transport; coalesce/reject an active lease; recover expired leases without resetting budget. Preserve tuple/hash/generation and terminal confirmation. A process-only mutex does not cover tabs.
- regression_test: two clients with pending/lost receipts and crash/reload/lease recovery; one active send, at most five dispatches, immutable final/hash, no late-response downgrade.

### LC87-F02 — MAJOR — Opening another exam during HTML download crashes export

- status: VERIFIED; LC86-F02 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3104, :3177–3185, :3210–3216, :3282–3315.
- evidence: fresh `download-race.json` / `download-race.log`: `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads, active title `New exam B`. `intended-regressions.log` fails the no-error assertion.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs`; submit A with an internal image, defer its fetch while downloading, load B through the hidden file input, release A's fetch. Run `node --test lc67-regressions.test.mjs` after blocks-probe.mjs.
- expected: WEB §§3/20 export A's complete immutable report, or explicitly cancel with recoverable feedback.
- actual/impact: after await, exporter reads mutable active exam/order/responses/score; B clears scoredResult and crashes A's download. A mixed-identity file remains a source risk, not a separately observed output.
- minimal_fix: capture complete immutable export data and filename before the first await; use captured fields throughout, report asset/download failures.
- regression_test: delay A asset→open B→resolve; one A file retaining title/version/order/answers/score, no rejection; cover cancellation, fetch failure and concurrent downloads.

### LC87-F03 — MAJOR — Math in table cells silently disappears

- status: VERIFIED; LC86-F03 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:415–428, :1689, :3094, :3282.
- evidence: `lc83-independent.json` records a valid table cell with text/image/math `x^2+83`; the rendered stem text is only `NESTED-TEXT`. `independent.log` fails the scoped math assertion. Source handles cell text/image but has no math/nested-table branch. Scoped nested-report.html also omits the expression; a broad substring flag is not used as evidence.
- reproduction_steps: `node --test lc83-independent.test.mjs`; load its synthetic canonical block exam in real Chromium and inspect .question-stem and nested-report.html.
- expected: Shared §6 / WEB §§4/8/20 preserve recursive Cell.blocks math or show unsupported source and a visible warning.
- actual/impact: legitimate question content vanishes without warning and can make a question unsolvable. This proves a synthetic block omission, not a defect in a specific real DOCX. The helper also serves review/download.
- minimal_fix: use a shared recursive safe Block renderer for top-level/cell text, math, images and nested tables; preserve/label unsupported OMML/source.
- regression_test: canonical text/math/image/nested-table cells across exam→final→review→portable download, including unsupported expressions and escaped hostile content.

### LC87-F04 — MAJOR — Actual report omits filters, navigation and retry-wrong

- status: VERIFIED; LC86-F04 persists. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535–554, :2992–3097; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: fresh `browser-probe.log`: `cards=2, filter=false, nav=false, retry=false`. Source app builds its own report rather than mounting the isolated report controls.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs`; open local dist under /Cunata/, submit synthetic I+III and inspect the actual report DOM.
- expected: WEB §§24.1/24.5 expose all/wrong/blank filters with aria-pressed, question navigation and independent local retry practice with zero teacher submissions.
- actual/impact: approved roadmap features are absent from the user entrypoint despite isolated module implementations/tests.
- minimal_fix: integrate report projection/actions/lifecycle; retry uses a fresh immutable practice snapshot/ID with no assignment/collector linkage, retaining the original final.
- regression_test: real submit→filter→navigate (including hidden target)→retry wrong/blank/partial-II→refresh; original final unchanged and zero submitResult calls.

### LC87-F05 — MINOR — API persists assignments for nonexistent exams

- status: VERIFIED; LC86-F05 persists. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396–405.
- evidence: `probes.log`: HTTP 200 / success=true and one assignment persisted for `does-not-exist` with empty trusted catalog. A null getExam bypasses the only ownership check.
- reproduction_steps: `node LC51-probes.mjs`; seed an active synthetic teacher/session/owned class in MemoryStore; assign unknown examId with valid openAt and dueAt=""; inspect stored assignments.
- expected: nonexistent/deleted exams rejected before persistence; own/shared published and catalog exams remain assignable.
- actual/impact: orphan assignment cannot load its exam for students. This is not evidence of a cross-owner write.
- minimal_fix: require an allowed published record or trusted catalog membership, otherwise NOT_FOUND/INVALID_EXAM with no write; preserve foreign-owner rejection and no-due handling.
- regression_test: unknown/deleted IDs write nothing; own/shared/catalog succeed, foreign owner FORBIDDEN, valid dueAt="" succeeds.

### LC87-F06 — MINOR — Public fraction parser rejects formatter output

- status: VERIFIED; LC86-F06 persists. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel API `toFractionString(rational(10n**200n))` produces a canonical 201-character integer; parseFractionString throws SyntaxError.
- expected: M1 §4.1 strict inverse across the public rational domain.
- actual/impact: a valid public API roundtrip fails. Wrong scoring within the approved 1,000-question limit was not demonstrated.
- minimal_fix: preserve the inverse and bound hostile serialized input at its boundary; restricting the public rational domain needs a consistent contract change.
- regression_test: signed canonical integer/fraction roundtrips at 199/200/201 characters, zero, noncanonical rejection and both inverse directions.

## Red gate and verified retained fixes

`npm test` fails at test/teacher/portal.test.ts:557 (assertion :608). The fixture expects unpublish for teacher metadata with only a token and no owner/username, whereas src/teacher/portal.ts:1689–1716 filters that record through read-only ownership checks. Reconcile own/foreign/legacy metadata fixtures and the port contract; do not restore publish-as-permission-probe or merely remove the assertion. Fresh independent Chromium probes confirm real own-exam access, browsing without revision changes/publish requests, and saved B answer key surviving publication. This fixture failure alone is not proof of production authorization bypass.

Nested report images are portable; canonical top-level Block-only text/table survives exam, review and download. These passes do not fix F02–F04. Product score/max values match all 1,632 independent cases; the separate oracle passes its mandatory scoring/max/exact-answer boundaries.

## checks_run

Windows/PowerShell; Node v24.14.0; TypeScript 7.0.2; Python 3.11.0; installed Chromium/CDP. All commands run on the captured temporary snapshot and local simulators. No install or production access. Redirected PowerShell logs are UTF-16. A probe exit 0 verifies an observed defect, not approval.

| Command | Exit | Actual result; artifact relative to evidence directory |
| --- | --- | --- |
| `node scripts/build.js` | 0 | 339 files emitted/promoted/verified; build.log. Existing DEP0190 shell-child-process warning. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; tsc.log. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; tsc-web.log. |
| `npm test` | 1 | 1,617 tests / 345 suites: 1,616 pass, 1 fail, 0 cancelled/skipped/todo; 29,354.5672 ms; npm.log. Teacher assertion above. |
| `node LC51-probes.mjs` | 0 | Six sends / retryCount=0; unknown exam assignment persisted; fraction inverse failure; six roster/PIN/history actions UNKNOWN_ACTION; probes.log. |
| `node LC51-differential.mjs` | 0 | 1,632 total/max and section score/max product values match independent expected fixtures. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass, 0 fail/skip; 1,632 fixtures, 5,849 maxima configs, 9 negative controls; independent oracle only. |
| `node --test lc83-independent.test.mjs` | 1 | 5 tests: 3 pass, 2 fail, 0 cancelled/skipped; 2,572.2557 ms; independent.log / lc83-independent.json. Nested-math child+parent are one defect. |
| `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs` | 0 | Null totalFraction TypeError, zero downloads; download-race.log/json. |
| `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs` | 0 | Two cards; filter/navigation/retry absent; browser-probe.log. |
| `node --import ./ops/blitz/promoted/_support/runtime.mjs blocks-probe.mjs` | 0 | Valid schema; canonical top-level text/table preserved across exam/review/download; blocks-probe.log/json. |
| `node --test lc67-regressions.test.mjs` | 1 | 2 tests: 1 pass, 1 fail, 0 cancelled/skipped; 58.862 ms; intended-regressions.log. Export isolation assertion fails. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | 104 pass, 0 fail/cancel/skip, 5 suites; 68,006.604 ms; claude.log. Local Apps Script/teacher/assignment/API/build/publish/UI/offline acceptance. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/codex-check/**/*.test.mjs"` — initial copy | 1 | 198 tests / 2 suites: 197 pass, 1 fail, 0 cancelled/skipped; 123,875.2344 ms; codex-initial.log. GLUE04 fails because ops/publish.py was omitted from the temporary copy; setup error, not a product finding. |
| `node --test --test-concurrency=1 --test-timeout=240000 "test/codex-check/**/*.test.mjs"` — complete corrected copy | 0 | 198 pass, 0 fail/cancel/skip/todo, 2 suites; 198,364.5997 ms; codex.log. Complete fresh run, including inert GLUE04 publish fixture. |

The complete corrected Codex run is green; the initial setup failure is retained separately. The npm gate remains red and is not overwritten by acceptance-suite success. LC86's CDP lifecycle/service-worker failures did not recur in this full npm run. No assertions were removed or weakened.

Supplemental browser scripts use the inspected existing runtime.mjs only to acknowledge Browser.close during harness teardown, without altering application responses/assertions. Acceptance snapshot hooks use read-only GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata. Local Google/SQL/API simulators are not deployed Google/Vercel/Neon evidence.

## coverage_gaps

- M1: fresh independent oracle + product differential; F06 remains. Every raw/status/order/DOM combination is not exhausted.
- M2/M3: actual Chromium editor/publish/library, rich-content exam/review/export paths exercised. Exhaustive private-mode/quota/migration/recovery, all historical versions/routes/assignment switches and ownership matrices: NOT_RUN; outside this bounded rerun.
- M4/R1/R2: local auth/store/transport/build checks only. Live CORS/Google writes/readback, deployed Neon concurrency/deduplication and production activation: NOT_RUN; production credentials/configuration deliberately excluded. No trusted-assessment certification or exhaustive history secret/advisory/license audit.
- M5: automated synthetic DOCX/PDF tests and rich-block browser probes; broad real multi-column/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus: NOT_RUN. Approved native/manual PDF is not a missing auto-parser feature. F03 prevents full rich-content acceptance.
- M6: automated Chromium responsive/keyboard/component tests differ from manual acceptance. Complete manual 375/768/1440 light/dark visual inspection, Firefox/WebKit, physical phone, OS Telex/VNI, screen reader, independent axe/Lighthouse and p95 input-to-paint measurements: NOT_RUN; not supplied by automated Node/browser checks. No full WCAG/performance claim.
- Owner milestone/production acceptance: NOT_RUN. This review authorizes no activation, deployment or old-service deletion.

## Missing roadmap features — priority and dependencies

1. **P0 / R0:** repair F01–F04, reconcile teacher ownership fixture/port, rerun stable full gates. Preserve retained read-only listing/key edits/portable-image behavior. F05/F06 remain bounded debt.
2. **P1 / R2→R3, §23:** complete local new-service acceptance, then roster CRUD/print, unique hashed four-digit PINs, server five-failure/ten-minute lockout, studentToken/student_id binding, cross-machine result reconstruction and unsubmitted roster rows. Fresh addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults probes return UNKNOWN_ACTION. A students table is not implementation of these paths.
3. **P1 / R4, §24.1, after R0:** integrate actual report filters/navigation (F04); isolated view tests do not satisfy the entrypoint.
4. **P2 / R5→R6, §§24.2–24.3, after R3:** authorized btn-view-submission/submissionDialog and examStats/stat-row with per-question accuracy, option distribution and frequent wrong short answers; production UI paths absent.
5. **P2 / R7, §24.4, after R3:** PIN-backed myHistory/historyChart with accessible text table; production paths absent.
6. **P2 / R8, §24.5, after R4+R7:** independent local wrong/blank/partial-II practice and zero teacher submissions (F04).
7. **P2 / R9, §24.6, after R6:** teacher print, answer sheet, separate key page; btn-teacher-print path absent.
8. **P2 / R10, §24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists, btnTheme path absent.
9. **P3 / R11:** owner-authorized live activation and phone acceptance; privacy/recovery/import/performance matrix, version 1.0 and retirement decision. This task does not authorize those operations.

Custom-only presets and manual PDF remain approved choices. No new scoring grammar/service/storage policy selected. tools_research: NOT_REQUESTED. privacy_notes: synthetic local data only, no credentials/real student records/private instructions.

recommended_action: F01→src/collect; F02–F04→src/app; F05→src/api; F06→src/domain. Teacher/test owners reconcile metadata fixtures while preserving read-only listing. Product remains CHANGES_REQUESTED; handoff READY_FOR_REVIEW.

Final integrity: `final-snapshot.json` records 1,361 input hashes, unchanged HEAD `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`, runtimeDrift=[], otherDrift=[], app SHA-256 `9441469f8e314b52bba2e4fa778d08e3646930538e0e4e1996729ba945affdcf`. This verdict covers that captured snapshot; later product changes require review. Only this report was intentionally written in the workspace.
