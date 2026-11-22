# LC68 ? Independent whole-product audit

review_id: LC68; task_id: LC68; worker_id: LC68; reviewer: Codex; date: 2026-11-22 Asia/Bangkok.
base_commit/head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f` plus captured working tree.
requirements_version: Shared Product Contract v2.0; complete WEB-contract.md ??1?24; inherited M1-scoring-contract; approved decisions; DESIGN.md; LO-TRINH-V2.md.
risk_level: HIGH. verdict: **CHANGES_REQUESTED**. Six verified continuing findings: four MAJOR, two MINOR. No new production regression established in this round. NEED_DECISION: NONE for the fixes or approved roadmap implementation.

## Scope, delta and evidence provenance

Read required contracts in full, private runtime profile, previous LC67 report, Git status/log/diff, design and approved roadmap. No new commit since LC67. This is an incremental whole-product review with fresh whole-suite execution and targeted browser/API/storage/domain probes; it does not claim every unchanged line was reread.

Snapshot: `%USERPROFILE%/AppData/Local/Temp/LC68-d0dpdqir` (SNAPSHOT). Captured current src/test/scripts/docs/public/styles/apps-script, root HTML/configuration/README, ops/publish.py, installed node_modules and existing local runtime support. Compared actual retained LC67 snapshot `%USERPROFILE%/AppData/Local/Temp/LC67-kdsew9hw`, not HEAD alone. `source-hashes.json` covers 1,344 inputs; `delta.json` records six initial differences. There is **no production source, root build/configuration or dependency delta** from LC67's refreshed tested snapshot. New `test/report/r0-f01-f03-regressions.test.ts` adds two passing isolated report tests; remaining differences are review output/browser artifacts. The new fixture only supplies one of two I-question option permutations and does not exercise the actual app, delayed export or canonical rich blocks; its green result cannot close the six findings below.

files_reviewed: new report test; current related code in collect/index, collect/appsScript, storage/index, student/index/view/area, domain rational/scoreAttempt/barrel, schema/exam/types, app/main and routing/legacy, report/index/view/download, api/handle/auth/types/store memory/neon, import/docx/segmentation, PDF/manual and preview, build/configuration/publish, relevant tests. Repository-wide searches checked remaining ??23?24 implementations.

All execution/build/browser artifacts are in SNAPSHOT. Production source/test assertions were not edited. Existing synthetic probe/harness scripts were copied and inspected before reuse; observations and assertions below were rerun against the new snapshot. No installation, branch/worktree, commit, deploy or production service access. Only intentional write inside D:/Cunata is this report. Broad tests use synthetic local services; none certify live Neon/Google/Vercel behavior.

## Findings

### LC68-F01 — MAJOR — Concurrent drains bypass the persisted dispatch budget

- status: VERIFIED; continues LC67-F01. **VÙNG chịu trách nhiệm: src/collect.**
- affected_files: `src/collect/index.ts:408`, `:437`, `:446`, `:453`, `:475`, `:624`.
- evidence: fresh `probes.log` records `calls=6`, `state=sending`, `retryCount=0`, `generation=8`. The budget is consumed after a response, and no durable sending lease excludes another caller.
- reproduction_steps: run `node LC51-probes.mjs` in SNAPSHOT. Parse hoa-repeating, start/finalize in MemoryTransactionAdapter, enqueue a fixture endpoint, invoke six drains five milliseconds apart with unresolved send promises, inspect durable outbox, then release HTTP503 responses. No network service is involved.
- expected: Shared §3 / WEB §7 bounded retries across concurrent callers, tabs and recovery, at most five dispatches including the first.
- actual/impact: six sends occur before any budget is consumed; further callers/crashes can continue bypassing the limit. Idempotent server writes do not enforce a client dispatch budget.
- minimal_fix: reserve a consumed dispatch and durable sending lease atomically using CAS before transport; reject/coalesce a live lease, recover an expired lease without resetting consumed sends, and retain terminal confirmation/generation protection. A process-local lock alone is insufficient.
- regression_test: separate storage instances concurrently drain delayed transport; one live lease, at most five dispatches; crash/reload before receipt, expired lease, lost receipt and stale callbacks after confirmation; original final/body/hash unchanged.

### LC68-F02 — MINOR — Fraction parser is not the formatter's inverse

- status: VERIFIED; continues LC67-F02. **VÙNG chịu trách nhiệm: src/domain.**
- affected_files: `src/domain/rational.ts:118`, `:132`, `:143`.
- evidence/reproduction_steps: `node LC51-probes.mjs` uses the public barrel: `toFractionString(rational(10n ** 200n))` returns a canonical 201-character integer, but parsing that exact string throws SyntaxError. Both observations are asserted.
- expected: M1 §4.1 strict inverse over the published rational API domain.
- actual/impact: canonical public API roundtrip fails. No wrong score within the approved 1,000-question range was demonstrated; this is not a scoring blocker.
- minimal_fix: retain the inverse contract and limit hostile serialized input at its boundary. Restricting the constructor/formatter/parser domain instead needs a consistent contract revision, not a parser-only cap.
- regression_test: positive/negative integer and fraction roundtrips around 199/200/201 characters, zero, both inverse directions and rejection of noncanonical forms.

### LC68-F03 — MINOR — assignExam persists nonexistent exam IDs

- status: VERIFIED; continues LC67-F03. **VÙNG chịu trách nhiệm: src/api.**
- affected_files: `src/api/handle.ts:396`, `:397`, `:401`, `:402`.
- evidence: fresh probe gets HTTP200/success=true and one saved assignment for `does-not-exist` with empty trusted catalog. A null published-exam lookup bypasses the ownership check.
- reproduction_steps: `node LC51-probes.mjs`; seed MemoryStore with active teacher, valid hashed session and owned class; POST assignExam with unknown examId, valid openAt and dueAt=""; inspect saved assignments.
- expected: §§19/22 reject an unknown/deleted exam before persisting; permitted published or trusted static catalog exams remain assignable.
- actual/impact: creates an orphan assignment students cannot open, including stale callers after an exam is removed. No cross-owner write was demonstrated.
- minimal_fix: require an allowed published exam or trusted catalog membership and return established NOT_FOUND/INVALID_EXAM otherwise; preserve FORBIDDEN for foreign exams.
- regression_test: unknown/deleted ID causes no write; own/shared published and catalog exams work; foreign owner rejected; no-due behavior unchanged.

### LC68-F04 — MAJOR — Actual app still omits filter, review navigation and retry-wrong

- status: VERIFIED; continues LC67-F04. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:458`, `:2898`, `:2909`; isolated controls in `src/report/view.ts:922`, `:1097`, `:1170`.
- evidence: fresh actual-browser output `cards=2, filter=false, nav=false, retry=false` in `browser-probe.log`. The app still constructs its own report instead of mounting/wiring the isolated renderer's controls.
- reproduction_steps: after successful build, run `node LC51-browser-probe.mjs`. Existing headless Chrome/Edge CDP harness serves dist under /Cunata/, loads synthetic 1I+1III through the hidden file input, submits and inspects report DOM.
- expected: §§24.1/24.5 all/wrong/blank filters with aria-pressed, question navigation and a distinct local retry-wrong attempt explicitly never sent to the teacher.
- actual/impact: approved student features are unavailable despite isolated renderer coverage.
- minimal_fix: integrate these controls with the actual report lifecycle and projection; practice uses a separate immutable snapshot/ID with no collector/assignment linkage, preserving the original final and cleanup.
- regression_test: actual app submission → filters and navigation including hidden targets; retry wrong/blank/partial-II questions; no submitResult or original-final change, including after refresh.

### LC68-F05 — MAJOR — Switching exams while downloading crashes the report

- status: VERIFIED; continues LC67-F05; no production fix since LC67. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:3019`, `:3063`, `:3095`, `:3099`, `:3183`, `:3188`, `:3197`.
- evidence: fresh `download-race.json`: errors=["TypeError: Cannot read properties of null (reading 'totalFraction')"], downloads=[], title="New exam B". Intended-behavior assertion fails in `lc68-regressions.log`.
- reproduction_steps: `node download-race.mjs`. Submit exam A with a valid same-origin Markdown image. Delay only the download's image fetch via a controlled promise; click download; load exam B through the existing hidden input while fetch is pending; release the fetch. Observe rejection and captured HTML Blobs. This changes timing, not product source.
- expected: a started download remains bound to A's immutable final/title/responses/order/score/attempt ID, or explicitly cancels with recoverable feedback.
- actual/impact: callback resumes against mutable currentExam/presentationOrder/scoredResult/attemptId; B has cleared scoredResult, so export rejects and produces no HTML. Even where a score exists, mixing report identities is possible; that mixed-score variant was not separately reproduced.
- minimal_fix: capture an immutable complete export model and filename before the first await, render solely from that model, and handle missing assets/fetch failure visibly. Route changes must not substitute active-exam fields into an in-flight export.
- regression_test: delay asset fetch for final A, open B, then resolve; standalone HTML retains A's metadata, score, questions and filename with no rejection. Also test cancellation, failed fetch, repeated clicks and independent concurrent downloads.

### LC68-F06 — MAJOR — Canonical rich blocks disappear in the actual exam and reports

- status: VERIFIED; continues LC67-F06; no production fix since LC67. **VÙNG chịu trách nhiệm: src/app.**
- affected_files: `src/app/main.ts:1604`, `:3009`, `:3168`; supported alternative renderer at `src/student/view.ts:1088`; importer output at `src/import/docx/segmentation.ts:384`, `:385`.
- evidence: `blocks-probe.json`: schemaValid=true, exam.stem="", exam.tables=0, reviewContainsStem=false, downloadContainsStem=false, downloadContainsTable=false. The intended acceptance assertion fails. Main renders only q.content while the schema supports q.blocks and the separate student renderer understands them.
- reproduction_steps: `node blocks-probe.mjs`; generate a valid one-question canonical exam, set content="" and blocks to a text marker plus a one-cell table; assert parseExam accepts it, load through the real app, inspect exam stem, submit, inspect review and actual downloaded HTML. No production endpoint involved.
- expected: Shared §6 / WEB §§4/8/20 preserve and show rich text/table/image/math content from the canonical IR or provide an explicit unsupported-content warning; valid rich content must not silently vanish.
- actual/impact: student sees choices with an empty question; review/download also lose the stem and table. DOCX rich content is at risk because the importer emits blocks alongside flattened content. Loss of a real imported equation/image was not separately claimed from this synthetic text/table probe.
- minimal_fix: use a shared safe Block/asset renderer in actual exam, review and portable export, with consistent rich-content precedence and explicit unsupported flags. Keep table spans, math verification labels and asset safety; do not blindly stringify blocks into HTML.
- regression_test: canonical blocks-only text/table/math/image exam through actual app → submit → reload → downloaded HTML opened alone offline; compare content and spans/asset rendering with the pinned snapshot, including mixed content+blocks and hostile/unsupported content.

## LC67 disposition and new test review

All six LC67 findings remain open, freshly reproduced above. No new production fix exists between the retained LC67 snapshot and LC68. The added `test/report/r0-f01-f03-regressions.test.ts` passes its two tests (included in npm's 1,613), covering isolated report ordering/letters and a supplied data-backed SVG. Its first fixture omits one I question from optionOrder; both fixtures use scoreDTO=null. These tests do not exercise the actual app's async download, blocks rendering or navigation/filter/retry integration, and cannot close F04/F05/F06.

Previous R0 corrections remain verified by fresh actual-browser observations and four independent regression assertions: displayed shuffled option letters, downloaded question order, embedded image loading in an isolated file:// report, and no assignment borrowed from another active exam. `r0-independent.log/json`, `r0-portable/report.html`, `r0-regressions.log`; pass4/fail0. This is limited evidence for these cases, not universal content parity.

## checks_run

Environment: Windows PowerShell; Node v24.14.0; TypeScript 7.0.2; Python 3.11.0; installed headless Chrome/Edge CDP harness. SNAPSHOT = `%USERPROFILE%/AppData/Local/Temp/LC68-d0dpdqir`. Logs use PowerShell UTF-16 redirection. Exit0 from an observation asserting a bug means the reproduction succeeded, not that behavior is correct.

| Command in SNAPSHOT | Exit | Result / artifact |
|---|---:|---|
| `node scripts/build.js` | 0 | Promoted 339 verified files; build.log. Existing Node DEP0190 warning remains. |
| `npx --no-install tsc -p tsconfig.json` | 0 | No diagnostics; tsc.log. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | No diagnostics; tsc-web.log. |
| `npm test` | 0 | tests1,613/suites345/pass1,613/fail0/skip0/cancelled0/todo0; 67,800.3178ms; npm.log. |
| `node --test --test-timeout=240000 "test/claude-check/**/*.test.mjs"` | 0 | tests104/suites5/pass104/fail0/skip0/cancelled0/todo0; 56,544.4577ms; claude.log. Includes browser/local simulated-service checks. |
| `node LC51-probes.mjs` | 0 | F01/F02/F03 reproduced; six roster/PIN/history actions UNKNOWN_ACTION; probes.log. |
| `node LC51-differential.mjs` | 0 | Product total/max and every section score/max match 1,632 independent expected fixtures; direct tool output. |
| `python -B test/oracle/oracle.py --check` | 0 | pass11/fail0/skip0, 1,632 fixtures, 5,849 maxima configurations, 9 negative controls; reported 4.4441s. Oracle alone is not product execution; preceding differential is. |
| `node LC51-browser-probe.mjs` | 0 | Actual app: cards2/filterfalse/navfalse/retryfalse; browser-probe.log. |
| `node download-race.mjs` | 0 | F05 reproduced: unhandled TypeError and no download; download-race.log/json. |
| `node blocks-probe.mjs` | 0 | F06 reproduced: valid rich stem/table absent in exam/review/download; blocks-probe.log/json. |
| `node --test lc67-regressions.test.mjs` | 1 | pass0/fail2/skip0; lc68-regressions.log. Assertions require intended behavior on newly captured browser observations. Test names retain LC67 provenance. |
| `node r0-independent.mjs` | 0 | Fresh actual built app/submit/download/file-open observations; r0-independent.log/json. |
| `node --test r0-regressions.test.mjs` | 0 | tests4/pass4/fail0/skip0; 417.2417ms; r0-regressions.log. |
| `node --test --test-timeout=240000 "test/codex-check/**/*.test.mjs"` | 1 | tests199/suites2/pass190/fail9/skip0/cancelled0/todo0; 89,045.6633ms; codex.log. Eight admin cases and their suite file fail because an admin before/after snapshot hook invokes git in the temporary directory without Git metadata. These are auditor preparation errors, not demonstrated admin defects. |

| `GIT_DIR=D:/Cunata/.git GIT_WORK_TREE=D:/Cunata node --test --test-timeout=240000 "test/codex-check/cx/*.test.mjs"` (PowerShell environment variables) | 0 | Separate corrected CX run: tests51/pass51/fail0/skip0/cancelled0/todo0; 25,159.6409ms; codex-cx.log. |

The CX rerun uses GIT_DIR/GIT_WORK_TREE solely for existing read-only Git snapshot checks against D:/Cunata. All browser output still targets SNAPSHOT. Existing copied helper runtime acknowledges Browser.close solely for harness teardown; this is not a product-response mock. No product assertion was changed or weakened. The earlier full Codex invocation remains a failed run and must not be relabeled as a pass.

## coverage_gaps and missing roadmap features

- M1: independent product differential agrees on numeric scores/maxima; F02 remains. No incorrect scoring within approved limits was demonstrated. Not every status/raw/order/DOM combination was exhausted.
- M2/M3: suites cover timer, restore, revision/two-tab behavior, builder and bank. Independent actual-app probes expose F04/F05/F06. Broad private/quota/migration and media-offline recovery matrix NOT_RUN. Hidden-input probes do not certify the future PIN/class journey.
- M4/R2: local apiBase/publish and service simulations are covered by suites; live Neon SQL concurrency, production CORS/write/receipt/readback/deduplication NOT_RUN. No production credentials or writes used. Trusted grading/key confidentiality and full historical secret/dependency/license audit not certified.
- M5: DOCX/PDF regressions run. A broad real corpus with multicolumn/merged table/media/unsupported equation/corrupt/encrypted/scan inputs NOT_RUN. Approved PDF behavior is preview/manual; no automatic extraction/OCR certification. F06 shows content integration still incomplete.
- M6: responsive, keyboard and design checks run in installed Chromium browser harnesses. Complete manual visual inspection at every screen/theme/viewport, OS Telex/VNI, Firefox/WebKit, assistive technology, axe/Lighthouse and independent p95 input-to-paint benchmarking NOT_RUN. DOM checks do not certify every layout or WCAG AA result.
- **R3 / ?23 NOT_IMPLEMENTED:** addStudents/listStudents/resetPin/removeStudent/studentLogin/myResults freshly return UNKNOWN_ACTION. Student table/types do not provide scoped roster CRUD, printable unique PINs, hashed PIN validation, five-failure ten-minute lockout, studentToken/roster identity binding, cross-machine review or unsubmitted roster rows.
- **R4/R8 / ??24.1/24.5:** actual-app filters/navigation/retry-wrong missing (F04); isolated report controls are insufficient.
- **R5/R6 / ??24.2/24.3:** production search finds no submissionDialog/btn-view-submission/examStats; listResults at src/api/handle.ts:551?596 omits raw detailed answers needed for authorized submission review/statistics.
- **R7 / ?24.4:** no myHistory/historyChart in production source; PIN-backed history/chart/table remains absent.
- **R9/R10 / ??24.6/24.7:** no btn-teacher-print/btnTheme in production source; teacher print/blank sheet/separate key and remembered three-state theme selection remain absent. System dark CSS alone does not implement the selector.
- Owner milestone and production acceptance NOT_RUN. Missing approved roadmap work is NOT_IMPLEMENTED, not a new owner-policy question.

## recommended_action

1. P1: return F01/F05/F06 to collect/app owners for minimal reliability/content fixes and actual-app regressions; close F03 and F02 in api/domain without silently changing the rational API contract.
2. Follow approved dependencies: local R2 acceptance, then R3 roster/PIN; R4 filters; R3?R5?R6 teacher review/statistics; R3?R7 history; R4+R7?R8 local retry; R6?R9 printing; R8+R9?R10 theme; R11 owner-authorized live/phone/recovery/privacy/import/performance acceptance.
3. Re-run gates and independently review the new source snapshot. No merge/deploy/release approval in LC68.

NEED_DECISION: NONE for these fixes/approved roadmap work. A proposed rational API-domain change would require a consistent contract revision and owner choice; LC68 does not adopt one.
tools_research: NOT_REQUESTED; no installation.
privacy_notes: synthetic local fixtures only; no private instructions, real student records or credentials in this report.

## Completion and snapshot integrity

Build and both typechecks exit0; npm passes1,613/fails0; Claude passes104/fails0; independent prior-fix regressions pass4/fail0. Intended-behavior regressions for the report race and rich-content loss pass0/fail2. Full supplemental Codex invocation retains its nine preparation failures; corrected separate CX run passes51/fails0. Six verified findings remain (four MAJOR, two MINOR). Verdict: **CHANGES_REQUESTED**; not release approval.

Final integrity comparison: 1,344 captured inputs; HEAD `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`; app SHA-256 `59e318b10701bc4c28aec4b974be114d33b618300355d6376005845f69ef29ab`; repository drift = `[]`. Evidence: SNAPSHOT/final-snapshot.json and source-hashes.json. Root HTML/configuration/dependencies/build/publish inputs also match the retained LC67 snapshot. Source changes after this comparison require renewed review.
