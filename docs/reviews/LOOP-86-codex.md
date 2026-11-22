# LC86 — Independent whole-product audit

review_id: LOOP-86-codex; task_id/worker_id: LC86; reviewer: Codex; risk_level: HIGH.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` (main), with existing dirty-tree inputs.
requirements_version: Shared Product Contract v2.0; WEB-contract §§1–24; inherited M1 API/handoff; approved decisions; DESIGN.md; LO-TRINH-V2.md.

**verdict: CHANGES_REQUESTED.** Six independently reproduced findings remain (four MAJOR, two MINOR). The npm acceptance gate is red. NEED_DECISION: NONE for these fixes or the approved roadmap. Delivery is READY_FOR_REVIEW, not milestone/production acceptance.

## Snapshot and scope

Only `docs/reviews/LOOP-86-codex.md` is intentionally written in the workspace. No code/test changes, installs, dependency changes, branch/worktree, commit, deployment or live-service writes. Existing changes belong to the shared working tree and are preserved.

Evidence directory: `%USERPROFILE%/AppData/Local/Temp/LC86-4s7yusip`. This is an ordinary temporary copy, not a Git worktree. Build outputs, generated test fixtures and probe artifacts stay there. Installed node_modules was copied without installation; public/config.json is unconfigured. Production configuration was excluded. `source-hashes.json` captures 1,366 inputs; git-status.txt, git-log.txt and git-diff.txt record the repository baseline. Supplemental repro scripts were read and copied from LC85 evidence and executed again against this snapshot.

Compared with LC85, HEAD and runtime source, scripts, dependencies, configuration and public assets are unchanged. Differences are generated CX F02/F03 observations, the bank-backup fixture and review documents. The previous ROADMAP-R0.md input is absent from the current workspace; LOOP-85-codex.md is new. No runtime fix arrived between the two snapshots. The first temporary-copy pass omitted README.md; it was restored from the workspace before the corrected npm run. The initial setup failures remain separately recorded and are not product findings.

files_reviewed: Git log/diff and hash comparison; domain scoring/rational/validation/serialization/shuffle; schema/content conversion; app question→answer→final→review→HTML export; teacher editor/library/publish and ownership filtering; student/offline/transactional storage lifecycle; collect outbox/receipt dispatch; API auth/assignment/result/Neon store boundaries; DOCX/PDF/preview flow; admin, UI and build/publish composition. All module regions are covered by available automated suites; unchanged files were reviewed through relevant paths and baseline equivalence, not claimed reread line by line. No dependency/lockfile delta. External tooling research was not requested or needed.

## Findings

### LC86-F01 — MAJOR — Concurrent outbox drains bypass the durable send budget

- status: VERIFIED; persists from LC85-F01. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: src/collect/index.ts:408, :437–453, :475, :624; CAS boundary src/storage/index.ts:977.
- evidence: probes.log records `calls=6`, `state=sending`, `retryCount=0`, `generation=8`. Sending neither consumes the budget nor rejects an already active send.
- reproduction_steps: `node LC51-probes.mjs`; finalize a synthetic hoa-repeating attempt using MemoryTransactionAdapter, enqueue, invoke six drains five milliseconds apart while transport remains pending, inspect durable outbox, resolve with 503.
- expected: Shared §3 / WEB §7 limit total dispatches to five, including concurrent callers/recovery.
- actual/impact: six requests are sent with zero consumed attempts; more callers or crashes before responses evade the bound. No duplicate live database rows are claimed.
- minimal_fix: atomically reserve one consumed attempt and a durable sending lease before transport; coalesce/reject a live lease and recover expired leases without resetting the budget. Preserve immutable tuple/hash, generation checks and terminal confirmation; a process-only mutex is insufficient across tabs.
- regression_test: two clients, delayed/lost receipts, crash/reload and lease expiry; one live send, at most five dispatches, unchanged final/payload/hash, late responses cannot downgrade confirmation.

### LC86-F02 — MAJOR — Changing exams during HTML download crashes export

- status: VERIFIED; persists from LC85-F02. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:3094–3101, :3143–3161, :3259, :3271–3314.
- evidence: download-race.json/log captures `TypeError: Cannot read properties of null (reading 'totalFraction')`, zero downloads and title `New exam B`. intended-regressions.log fails the expected no-error assertion.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs download-race.mjs`; submit A with an internal image, defer its fetch during download, load B through hidden file input, release A's fetch. Run `node --test lc67-regressions.test.mjs` after blocks-probe.mjs for the expected-behavior assertion.
- expected: WEB §§3/20 export A's immutable complete result, or explicitly cancel with recoverable feedback.
- actual/impact: post-await reads use mutable active-exam/scoring fields; opening B clears scoredResult and prevents the download. A mixed-identity file is a source risk, not a separately reproduced outcome.
- minimal_fix: capture the complete immutable export model and filename before the first await; use only captured fields afterward and surface asset/download errors.
- regression_test: delay A asset→open B→resolve; one file retains A's title/version/order/answers/score, no unhandled rejection; exercise failure/cancel/concurrent downloads.

### LC86-F03 — MAJOR — Math in table cells disappears without a warning

- status: VERIFIED; persists from LC85-F03. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:411–422, :1681, :3086, :3259.
- evidence: lc83-independent.json shows a valid cell containing text, image and math `x^2+83`; actual question-stem text is only `NESTED-TEXT`, and scoped HTML has no math. independent.log fails the scoped assertion. The renderer handles cell text/image only. A broad download `hasMath` substring flag is not used as proof.
- reproduction_steps: `node --test lc83-independent.test.mjs`, nested-math child; load its synthetic table-block exam in real Chromium. Inspect .question-stem and retained nested-report.html.
- expected: Shared §6 / WEB §§4/8/20 retain recursive Cell.blocks math, or visibly preserve unsupported source with a warning.
- actual/impact: valid question content silently vanishes, potentially making the question unsolvable. This executed case proves a synthetic exam omission, not an error in a particular real DOCX. The same helper serves review/export.
- minimal_fix: share a recursive safe Block renderer for top-level/cell content, including math and nested tables; visibly label unsupported/unverified sources.
- regression_test: text/math/image/nested-table cells through exam→final→review→portable download; compare immutable content, include unsupported OMML and hostile text fallback.

### LC86-F04 — MAJOR — Actual report lacks filters, navigation and retry-wrong

- status: VERIFIED; persists from LC85-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: src/app/main.ts:535–554, :2970–3090; isolated controls src/report/view.ts:922, :1097, :1170.
- evidence: browser-probe.log reports `cards=2, filter=false, nav=false, retry=false` after an actual submission. App builds its own report rather than mounting the independently tested controls.
- reproduction_steps: `node --import ./ops/blitz/promoted/_support/runtime.mjs LC51-browser-probe.mjs`; serve dist under /Cunata/, load synthetic I+III, submit, inspect actual report DOM.
- expected: WEB §§24.1/24.5 expose all/wrong/blank filters with aria-pressed, question navigation and separate local practice without teacher submission.
- actual/impact: approved features are unavailable through the real entrypoint despite isolated implementation/tests.
- minimal_fix: integrate report projection/actions/lifecycle; retry practice needs a fresh immutable snapshot/ID without assignment/collector linkage, preserving the original final.
- regression_test: real submit→filters/navigation (including hidden targets)→retry wrong/blank/partial-II→refresh; zero submitResult calls and original final unchanged.

### LC86-F05 — MINOR — API accepts an assignment to a nonexistent exam

- status: VERIFIED; persists from LC85-F05. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: src/api/handle.ts:396–405.
- evidence: probes.log records HTTP 200/success=true and one stored assignment for `does-not-exist`, with an empty trusted catalog. Null getExam bypasses ownership checking and reaches saveAssignment.
- reproduction_steps: `node LC51-probes.mjs`; seed a synthetic active teacher/session/owned class in MemoryStore, assign unknown examId with valid openAt and dueAt="", inspect assignments.
- expected: unknown/deleted exam is rejected before persistence; owned/shared published and trusted-catalog assignments remain usable.
- actual/impact: orphan assignment is persisted but students cannot open its exam; this case does not establish a cross-owner write.
- minimal_fix: require an allowed published exam or trusted catalog membership, otherwise NOT_FOUND/INVALID_EXAM without a write. Preserve foreign-owner rejection and no-due behavior.
- regression_test: unknown/deleted writes nothing; own/shared/catalog success, foreign owner FORBIDDEN, valid dueAt="" still succeeds.

### LC86-F06 — MINOR — Fraction parser rejects formatter's canonical output

- status: VERIFIED; persists from LC85-F06. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: src/domain/rational.ts:119, :132, :143.
- evidence/reproduction_steps: `node LC51-probes.mjs`; barrel APIs produce a canonical 201-character integer with `toFractionString(rational(10n**200n))`; parsing that exact string throws SyntaxError.
- expected: M1 §4.1 requires the strict inverse over the public rational domain.
- actual/impact: valid public API roundtrip fails. No wrong score within the approved 1,000-question limit was demonstrated.
- minimal_fix: preserve the inverse and bound hostile serialized values at their input boundary; a restricted public domain requires a consistent contract change.
- regression_test: canonical signed integer/fraction roundtrips around 199/200/201 characters, zero, noncanonical rejection and both inverse directions.

## Red gate and repaired behaviors

The teacher fixture at test/teacher/portal.test.ts:557 (assertion :608) expects a teacher unpublish button, but supplies only a token and ownerless exam metadata. Current read-only filtering at src/teacher/portal.ts:1689–1716 excludes that entry. Reconcile representative own/foreign/legacy metadata fixtures and the port contract; do not restore publish-as-permission-probe or simply remove the assertion. Fresh browser checks show own-exam access works, browsing preserves revision and sends zero publish requests, and saved B answer key survives publishing. This failing unit fixture alone is not proof of a production authorization bypass.

LC84-F07 remains fixed: Apps Script getExam no longer modifies the published payload with owner metadata. The Apps Script suite exercises exact large-payload roundtrip. Nested report images are still embedded as data URIs. Top-level Block-only stem/table survives exam, review and HTML download. These successes do not resolve F02–F04.

## checks_run

Environment: Windows/PowerShell, Node v24.14.0, TypeScript 7.0.2, Python 3.11.0, installed Chromium/CDP. No installs. Commands use the captured local snapshot, never production. PowerShell redirected logs are UTF-16. Probe exit 0 indicates a successfully asserted observation, not product approval.

CHECK_RESULTS_PENDING

Supplemental browser probes preload the existing inspected `ops/blitz/promoted/_support/runtime.mjs`, which acknowledges Browser.close solely for harness teardown and does not change app responses/assertions. Acceptance snapshot hooks use read-only GIT_DIR=D:/Cunata/.git and GIT_WORK_TREE=D:/Cunata. Security/student/teacher temporary evidence directories were prepared. Local Google/SQL/API simulators are not deployed Google/Vercel/Neon proof.

## coverage_gaps

- M1: fresh 1,632-case product differential and independent oracle cover mandatory scoring/max/exact-answer boundaries; F06 remains. Every raw/status/order/DOM combination is not exhausted.
- M2/M3: fresh Chromium editor/publish/library and rich-report/download paths exercised. Complete private-mode/quota/migration/recovery, arbitrary-version resume, every route/assignment switch and restored-session/legacy ownership matrix: NOT_RUN.
- M4/R1/R2: local API/store/auth/ownership/transport/build/publish checks only. Live Vercel/Neon CORS, atomic concurrency, write/receipt/readback/dedupe and Google writes: NOT_RUN; production configuration/authorization excluded. No trusted-assessment certification or exhaustive Git-history secret/advisory/license audit.
- M5: automated DOCX/PDF and synthetic rich blocks; broad real multicolumn/merged-cell/media/unsupported-equation/corrupt/encrypted/scan corpus: NOT_RUN. Approved manual PDF/native preview is not a missing automatic-parser feature. F03 prevents full rich-content acceptance.
- M6: automated Chromium DOM/keyboard/responsive/design checks are distinct from manual acceptance. Complete manual 375/768/1440 visual review in both themes, Firefox/WebKit, physical phone, OS Telex/VNI, screen reader, independent axe/Lighthouse and p95 input-to-paint: NOT_RUN. Automated results do not certify full WCAG/performance compliance.
- Owner milestone/production acceptance: NOT_RUN. No activation, deployment or old-service deletion implied.

## Missing roadmap features — priority/dependency order

1. **P0 / R0 acceptance:** repair F01–F04 and reconcile the teacher metadata fixture/contract; rerun stable gates. Preserve repaired key-edit/read-only listing/nested-image/Apps Script roundtrip. F05/F06 remain bounded technical debt.
2. **P1 / R2→R3, §23:** finish local new-service acceptance; roster CRUD/print, unique hashed four-digit PINs, five-failure/ten-minute server lockout, studentToken/student_id binding, cross-machine reports and unsubmitted roster rows. Fresh API probes return UNKNOWN_ACTION for addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults. A students table alone is not this feature.
3. **P1 / R4, §24.1, after R0:** integrate actual report filters/navigation (F04); isolated report renderer does not satisfy entrypoint acceptance.
4. **P2 / R5→R6, §§24.2–24.3, after R3:** authorized submissionDialog/btn-view-submission and examStats/stat-row, per-question correctness/option distribution/top wrong short answers. Production paths absent.
5. **P2 / R7, §24.4, after R3:** PIN-backed myHistory, historyChart SVG and accessible text table; production path absent.
6. **P2 / R8, §24.5, after R4+R7:** wrong/blank/partial-II local practice with independent snapshot/ID and zero teacher submissions (F04).
7. **P2 / R9, §24.6, after R6:** teacher print, answer sheet and separate key page; btn-teacher-print path absent.
8. **P2 / R10, §24.7, after R8+R9:** remembered Sáng/Tối/Theo máy TopBar control; system-dark CSS exists, btnTheme path absent.
9. **P3 / R11:** owner-authorized activation/phone acceptance, recovery/privacy/import/performance matrix, version 1.0 and old-service retirement decision. No activation authority inferred from this audit.

Custom-only presets and manual PDF remain approved choices. No new scoring grammar, service or storage policy selected. tools_research: NOT_REQUESTED. privacy_notes: synthetic local data only; no credentials, real student records or private instructions included.

recommended_action: F01→src/collect; F02–F04→src/app; F05→src/api; F06→src/domain. Teacher/test owners reconcile metadata fixtures while retaining read-only listing assertions; repeat final stable gates after fixes. Delivery READY_FOR_REVIEW; product CHANGES_REQUESTED.

INTEGRITY_PENDING
