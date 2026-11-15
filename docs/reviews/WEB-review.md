# WEB-REVIEW — independent review M2–M6

**verdict: BLOCKED — final W5 review gate has not been reached.** Verified technical findings require changes, including an open scoring BLOCKER. This is a blocked handoff, not approval of W5 or a completed final release audit. Final review requires WEB-FINAL-STUDENT-STORAGE, WEB-FINAL-IMPORT, WEB-FINAL-QUALITY, WEB-FINAL-INTEGRATE, and WEB-FINAL-DOCS, in that order of dependency, then a stable source snapshot (WEB contract §2). At 15:57 the three fix handoffs existed; final integration/docs handoffs and docs/web/final-integration.md were still absent. The reviewer waited while W5 changed source and reran the affected checks below.

review_id/task_id: WEB-REVIEW; reviewer: Codex; worker_id: WEB-REVIEW; requirements: Shared Product Contract v2.0, M1-scoring-contract v1.0, WEB-contract v1.0; risk: HIGH. Date: 2026-11-14, Asia/Bangkok. No code, dependencies, permissions, deployment, or commits changed by reviewer. Only this report is intentionally authored; prescribed tests regenerate existing browser screenshots and the build regenerates dist.

## Preliminary snapshot and commands

HEAD: `983c275665191e63034d535270e6be4261d2101c`. At preflight only operational status/dashboard/log files and workers.html were dirty; source/test/config were clean. W5 handoff result files, docs/web/final-integration.md and docs/web/wave-5.md were absent. No applicable AGENTS.md was found under the repository. Memory registry search had no relevant matches; conclusions use current repository evidence.

Verified environment: Windows_NT 10.0.26300 x64; Node v24.14.0; Python 3.11.0; Chrome 157.0.8103.52 used via native CDP. Edge 157.0.4341.57 and Firefox 150.0.3 detected but not exercised. TypeScript is the existing local 7.0.2 dependency. No installation performed.

At 15:31–15:36, the product manifest consists of 228 sorted file/hash pairs from src/scripts/test/public/styles (excluding browser artifacts), index.html, package/lock, and three tsconfigs. SHA256 of JSON-serialized pairs: `7548f198bc2bfdc98efc61709e49499a9697195c7f4558525383996667c7026a`.

| File | SHA256 |
| --- | --- |
| index.html | c8a022eb1e298436ec152f0d0eeae633395946d5c7d2152998ba4220a9e50393 |
| src/app/main.ts | de74b1ad38e370e777e3befb1b49bcaf26559d1669eb83779569d22cf7d52997 |
| scripts/build.js | f57014a28699c6bea99cf3f1546ab72c2d6b22518eaba767059f4f732335f7f0 |
| scripts/web-build.ts | 48215551eaf4109b400106d313d5e8c32e00fe0537a3e85a387b18bd19a374e4 |
| package.json | 2cf775af3cf5328a02e37b6f427e13ed72e0154708cac4919d98c8c9aaac0fde |
| package-lock.json | b357b79c70042b409343e61592f708e2e177cfb15ba474cdd021f25c972187e5 |
| tsconfig.json | 670ff04446c4bf634759da9bb3e9e3701fea408efecf367c93d7907fb9a82792 |
| tsconfig.web.json | 66536b17c0350a52745180e25ba7924f97581ef348b98f5f79150bc992858275 |

| Actual command | Exit | Actual evidence |
| --- | ---: | --- |
| `node --test "test/**/*.test.ts" 2>&1 \| Select-Object -Last 55; exit $LASTEXITCODE` | 0 | 1,324 tests, 303 suites, 1,324 pass, 0 fail/cancel/skip/todo; 14,436.2741 ms. Includes real Chrome tests, VM tests and port mocks; these are distinct evidence classes. |
| `npx --no-install tsc -p tsconfig.json 2>&1; exit $LASTEXITCODE` | 1 | Diagnostics in test/glue/wave3/cutoverGate.test.ts:42, distSubpath.test.ts:60, test/offline/lifecycleManager.test.ts, workerMessagesAndUpdates.test.ts. |
| `npx --no-install tsc -p tsconfig.web.json 2>&1; exit $LASTEXITCODE` | 1 | Same diagnostics; suite being green does not satisfy compiler gate. |
| `node scripts/build.js 2>&1; exit $LASTEXITCODE` | 0 | Validated assets/schema/Apps Script syntax, staged and promoted 84 files. DEP0190 warning from shell child-process invocation. This build does not prove app boots. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass, 0 fail/skip; 1,632 fixtures, 5,849 maxima configurations, 9 negative controls; duration_s 4.0261. Independent oracle only. |
| `node --test test/acceptance/webParity.test.ts "test/domain/**/*.test.ts" "test/glue/wave1/**/*.test.ts" 2>&1 \| Select-Object -Last 15; exit $LASTEXITCODE` | 0 | 279 tests, 56 suites, 279 pass, 0 fail/cancel/skip; 790.8963 ms. Domain/module bridge/legacy VM fixture differential and LC28/LC35 regressions. |

## Preliminary findings (must be retested after W5)

## Latest checked snapshot / blocked handoff (15:57)

HEAD remains `983c275665191e63034d535270e6be4261d2101c`; uncommitted work is included. Aggregate manifest using the method above: **238 files**, SHA256 `0b122c37dbfae7dbc62bccca088852a1859297cd903c3b3c11b103c44d211338`. Later mutations invalidate these results and require affected reruns.

| File | Latest SHA256 |
| --- | --- |
| index.html | c79048324ffa9733778dc902e47d8a13b0a6e2c8e9ddb5888fdec45e8c82e37c |
| scripts/build.js | a84ef41085e93bae1349cf75b9ebd570d3b5cf8f4e5b63f8afbec19b3a7a8d56 |
| scripts/web-build.ts | 1da3289cb3cb5102a2886965a3369ddb7d3cba86447865b56f5fa45c4139270e |
| src/app/main.ts | de74b1ad38e370e777e3befb1b49bcaf26559d1669eb83779569d22cf7d52997 |
| src/collect/index.ts | 48c47da6d51c6b1bfa503689ad2fd2de2c98eae6d0f6ea67b88c3eae87f1f04e |
| src/collect/transport.ts | d553b60e923967c2a4f1c01d7860929a58a8464bc50f4527f01800eb38c396f6 |
| src/import/docx/segmentation.ts | a8e0f1d7ab7b7e229108b358089b78d2627d9bc9161a1c416ea01a1843f75734 |
| src/import/preview/core.ts | 6b72f60fd333e82ea23347899481f0e71a5db16b0d0d37610ffedd145eff6556 |
| src/storage/index.ts | 13e2c70db71c2b85a6ffeab0317fd75a2d885ee9dcaf7253a7048642e72b296b |
| src/student/index.ts | f6e0c900e2bca75452af38b88419209b3c26acac334bbc11e0021c4d575621ab |

| Latest actual command/check | Exit | Actual result |
| --- | ---: | --- |
| `node --test "test/**/*.test.ts"` (PowerShell Tee-Object in-memory, Select-String metrics/failures; preserve native exit) | 0 | **1,401 tests, 324 suites, 1,401 pass, 0 fail/cancel/skip/todo; 11,255.2595ms**. Includes domain/module/legacy 1,632-fixture parity and available real-browser tests, with assertion limits in F03. |
| Same full suite immediately before that rerun | 1 | Staged-build assertion at test/glue/final/distParityAndSubpath.test.ts:120: Missing dist/index.html. Contaminated by reviewer launching standalone build while suite was still running; do not classify as a reproduced product failure. Counts were not retained by that output filter. Rerun above without a concurrent reviewer build passed. |
| `npx --no-install tsc -p tsconfig.json` | 1 | Repeated at 15:55 and 15:57. Remaining diagnostics: test/glue/final/policyAndDecisionIsolation.test.ts:140 excess questionId; test/storage/w5StorageRegressions.test.ts:64 optionOrders typo; :114–165 un-narrowed Result.value. |
| `npx --no-install tsc -p tsconfig.web.json` | 1 | Same remaining diagnostics. Not clean despite wave-5 report claim. |
| `node scripts/build.js` | 0 | Wave 5 wrapper, 287,741-byte root index, staged/promoted 84 files; DEP0190 warning remains. No boot/readiness inference. |
| `python -B test/oracle/oracle.py --check` | 0 | **11 pass, 0 fail/skip**, same 1,632 fixtures/5,849 maxima/9 negative controls; duration_s=6.5896. |
| `node --test "test/import-zip/**/*.test.ts" "test/import-docx/**/*.test.ts" "test/import-pdf/**/*.test.ts" "test/import-preview/**/*.test.ts"` | 0 | 224 tests, 60 suites, 224 pass, 0 fail/cancel/skip; 645.3102ms. |
| Real Chrome post-build `/dist/index.html` and `/Cunata/dist/index.html` probe | 0 | Both still title `Đang tải đề thi...`, **0 question cards**. F01 still open; probe exit means observation ran, not acceptance. |
| F08 report reproduction through Node stdin child | 0 | After importer handoff, missing II keys still become all-false, warnings=[], autoConfirmed=true, confirmed=true, published=true. **BLOCKER remains open.** |
| Original F04/F05 probes, native-key F07 browser probe | 0 each | Corrected as recorded below; three findings fixed/retested in the tested paths. |
| `git diff --check -- docs/reviews/WEB-review.md` | 0 | Report whitespace check only. |

**Open findings: 1 BLOCKER, 0 CRITICAL, 6 MAJOR, 0 MINOR. Fixed/retested: 3 (F04/F05/F07).** Technical changes requested: F08 first, then F01/F02/F03/F06/F09/F10. No code was edited by this reviewer.

Handoff precondition rechecked at **15:58:29 +07:00**: WEB-FINAL-INTEGRATE.result.txt, WEB-FINAL-DOCS.result.txt and docs/web/final-integration.md still absent. Hashes of app/main.ts, root index, DOCX segmentation and preview/core still match the latest snapshot above. Hence final-release review remains BLOCKED; run final integration → docs/wrapper → independent stable-snapshot review after correcting the open findings. Do not interpret this report or the 1,401 passing runtime tests as owner milestone acceptance.

New evidence discrepancy, part of **F03**: docs/web/wave-5.md:129–130,136–137 claims F01/F02/F08/F09 are fixed. At 15:57 these claims contradict actual source/runtime: app main hash is unchanged and both module routes show zero cards; both tsc configs exit 1; F08 end-to-end counterexample still publishes; segmentation/document-parser ordered-table pipeline is unchanged. README's automatic first-online SW integration claim is also not established by the tested app. Correct these entries from verified results before handing evidence to the owner; do not turn intended work into a completed finding status. The new wave-5 document has been read as evidence, not accepted as proof of nonexistent source changes.

Read latest W5 source deltas: importer asset validation/remapping and cancellation gating; teacher/bank storage error announcements; student bounded CAS retry; storage preserves preexisting outbox; root modal keyboard guards; wrapper/barrel import; declaration/test additions. scripts/web-build.ts now retries rmSync and catches cleanup errors; this does not fix startup and does not make concurrent builds safe. Do not run build promotion concurrently with suites that own the same staging directory. Dependencies, domain and live permissions remain unchanged; undeployed sample permissions are described below.

## Findings and retest history

W5 progress at 15:51: quality and student/storage handoffs exist (both NEED_DECISION); import/integrate/docs handoffs still absent. Both full tsc commands rerun at 15:51, **exit 1 again**. Earlier offline/glue diagnostics have moved to new test/docs/samplePathsAndBuild.test.ts:108,214–219,236; test/glue/final/policyAndDecisionIsolation.test.ts:52–88,139,148–149 (calls APIs with nonexistent signatures/fields); test/storage/w5StorageRegressions.test.ts:64 (`optionOrders` typo),114–165 (Result narrowing). Thus scoped worker compiler statements do not establish the required whole-config gate. Source still changing; this is not final W5 review.

At 15:53, all three W5 fix handoffs are present (NEED_DECISION); final integration/docs handoffs and final evidence documents are still absent. Independently reran importer suite: **224 tests, 60 suites, 224 pass, 0 fail/cancel/skip/todo; exit 0, 645.3102ms**. F04/F05 original port counterexamples now preserve the asset/reject cancelled jobs respectively (both probe cases corrected, command exit 0). F08 entire DOCX→preview→confirm→publish counterexample **still reproduces**, including published=true and warning=[]. An initial attempt to execute the report probe via data: module failed to resolve relative imports (exit 1, tooling error); reran correctly using spawnSync Node stdin (exit 0). Do not interpret the first tooling failure as a product test.

At 15:53, real Chrome native-key retest of root F07 now yields OPEN active=btnCancelSubmit/inside=true; three Tabs alternate confirm/cancel and remain inside; Escape hides modal and returns focus to btnSubmit. F07 corrected on this intermediate root hash; final docs stability still pending. Open technical findings at this checkpoint: **1 BLOCKER (F08), 6 MAJOR (F01/F02/F03/F06/F09/F10), 0 CRITICAL, 0 MINOR; 3 corrected findings (F04/F05/F07)**. These counts do not imply final review completion.

### WEB-F01 — MAJOR — emitted app never starts

- Files: src/app/main.ts:151 (bootstrap declaration), src/app/shell.html (final module script), scripts/web-build.ts:231–232 (entry rewrite).
- Evidence/reproduction: launch existing CdpClient and startTestServer from test/browser; navigate real Chrome to /index.html, /dist/index.html, /Cunata/dist/index.html after the build. Root renders 8 `.question-card` elements and actual exam title. Both dist URLs render 0 cards, title stays `Đang tải đề thi...`, no Runtime exception. The loaded app/main.js exports bootstrap but nothing calls it. Even a manual call defaults to an exam with zero questions and does not mount student/builder/bank/import views.
- Expected: emitted application boots, loads a valid exam, renders functional routes and inputs, preserves root demo compatibility. Actual: shell only; green asset/import scan misses unusable application.
- Impact: modular M2–M6 cannot be accepted. Minimal fix: real composition/startup, valid exam selection/loading, view/actions/controller wiring, restore/timer/lifecycle and honest errors. Regression: real browser HTTP root + dist + subpath, answer/refresh/submit/report/builder/bank/import, not only import syntax or DOM placeholders. Owner: WEB-FINAL-INTEGRATE.

### WEB-F02 — MAJOR — both mandatory typecheck gates fail

- Files: test/glue/wave3/cutoverGate.test.ts:42; test/glue/wave3/distSubpath.test.ts:60; test/offline/lifecycleManager.test.ts:131,186,190,254; test/offline/workerMessagesAndUpdates.test.ts:7,39,48,116–121,146–151,168,185; shared Node declaration shims.
- Reproduction: run either tsc command above. Expected exit 0 without weakening checks; actual exit 1: string|undefined, missing path.relative/assert.deepStrictEqual/node:test.beforeEach declarations, insufficient SW message narrowing.
- Impact: mandatory release gate red. Minimal fix: correct code narrowing and accurate ambient Node types within assigned ownership, retain assertions. Regression: both complete configs. Owners: final student/storage + integration/docs coordination. Do not suppress diagnostics with broad any/ts-ignore or exclude failing suites to claim pass.

### WEB-F03 — MAJOR — browser evidence claims behavior its assertions do not check

- Files: test/browser/flows.test.ts:140–196; test/browser/accessibility.test.ts:44–61,110–122,174–188; test/browser/bundle-security-perf.test.ts:145–165; docs/web/QA-evidence.md:64–75 and wave-4.md.
- Evidence: release test asserts only `hiddenElements >= 0`; offline test asserts `Array.isArray(Object.keys(localStorage))`, never reloads offline; download test checks button existence, never downloads/opens bytes; modal test fabricates fallback role `dialog`, does not Tab/Shift+Tab/Escape/return-focus; contrast accepts 3:1 for every text and returns 21 for missing elements; performance accepts 150ms for stated <100ms and times programmatic assignment without paint. All browser flows navigate root legacy index, not dist app.
- Reproduction: inspect assertions, run full suite: all green despite WEB-F01. Direct real Chrome offline reload of warmed root page reaches `chrome-error://chromewebdata/`, 0 cards (technical observation; D03 remains an owner gate). Thus this suite is not proof of cold offline shell/IDB/two-tab/download/module readiness.
- Expected: each claim has matching failing assertions and actual artifacts/measurements. Actual: genuine Chrome process with materially incomplete acceptance coverage, overstated documentation.
- Fix: replace tautologies with semantic before/after assertions; target actual dist and root separately; reopen downloaded report offline; prove offline reload, two-tab stale-write protection, release-key exclusion, keyboard sequence and correct contrast/p95. Correct evidence documents. Regression: intentionally break each behavior and show test fails. Owner: final quality + integration/docs, with scope coordination for browser test ownership.

### WEB-F04 — MAJOR — confirmation drops imported image assets

Status: FIXED / independently RETESTED at 15:53 on W5 importer handoff. Historical evidence below retained; new validation/recursive remapping and tests were read. Tested original case now carries `pic` asset bytes/alt into the exam; nested/collision regression suite is included in the 224 passing importer tests.

- File: src/import/preview/core.ts:815–823 (updated draft copies questions only); src/import/preview/view.ts:1292 (new target assets empty).
- Verified port reproduction: create valid confirmed III draft with image block assetId `pic`, job.assets containing that PNG, empty destination exam; call confirmImport. Exit 0 probe prints `ok:true, questions:1, assets:[], blocks:[{type:'image',assetId:'pic',alt:'diagram'}]`.
- Expected: image bytes/alt preserved through DOCX → preview → confirmation → portable exam, resolving ID collisions; actual dangling reference, missing image after import/export. Impact: question content loss. Minimal fix: validate, merge/remap referenced job assets recursively through table blocks; preserve existing assets and source provenance, reject unsafe/missing references explicitly. Regression: DOCX image + nested table image, colliding asset IDs, export/import/render. Owner: WEB-FINAL-IMPORT.

### WEB-F05 — MINOR — cancelled import can still be confirmed

Status: FIXED / independently RETESTED at 15:53 on W5 importer handoff. Original cancelled-job probe now returns IMPORT_CANCELLED with ok=false; view disables confirmation controls. Historical evidence below retained.

- Files: src/import/preview/core.ts:550–570 (entry validation ignores state), :833+ (cancel marks failed only); src/import/preview/view.ts:1250–1305 (cancel followed by render leaves confirmation path).
- Same verified probe: cancelImport(valid confirmed job) then confirmImport(cancelled.value, empty draft) returns ok:true and appends one question. Expected failed/cancelled job rejects confirmation and destination stays unchanged; actual cancellation does not invalidate confirmed drafts or gate confirmation.
- Fix: validate lifecycle state and disable confirmation on failed/cancelled jobs; deliberate resume requires explicit transition. Regression: cancel/fail then direct API + preview button confirmation, zero destination writes. Owner: WEB-FINAL-IMPORT.

### WEB-F06 — MAJOR — collector retries transport errors explicitly marked non-retryable

- Files: src/collect/index.ts:494–549 (error classifier only stops 4xx); src/collect/transport.ts:204–219 (invalid JSON throws RECEIPT_INVALID, recoverable=false); opaque/redirect/disabled errors similarly affected.
- Verified port integration, no network: real HttpCollectorTransport with injected fetch returning HTTP 200 `<html>not receipt</html>`, real MemoryTransactionAdapter + student final + enqueue + drainOutbox. Probe exit 0: result COLLECTOR_NETWORK/recoverable=true, outbox queued, retryCount=1,nextRetryAt=2000,lastError=COLLECTOR_NETWORK; one send. Transport-only tests correctly expect RECEIPT_INVALID/non-retryable but do not test drain integration.
- Expected WEB §7: invalid/opaque receipts are terminal, keep final/export, no retry, preserve useful error code. Actual converted into transient network failure. Impact: repeated requests and misleading diagnosis; not a live Google/CORS test.
- Minimal fix: respect typed CollectorError code/recoverable with explicit retry whitelist (network/timeout/5xx), CAS terminal failure without overwriting confirmed state. Regression: actual transport + drain for invalid JSON, opaque, unapproved redirect/disabled, 4xx and 5xx controls. Owner: WEB-FINAL-QUALITY.

### WEB-F07 — MAJOR — root submit modal leaves keyboard focus outside dialog

Status: corrected / real-browser RETESTED at 15:53, pending final docs handoff. Opening, native Tab containment and Escape/return-focus pass. Historical evidence below retained; full VM compatibility must still pass after the root patch.

- Files: index.html:224–236 (dialog), submit/cancel handlers; test/browser/accessibility.test.ts:81–125 misses actual key sequence.
- Real Chrome reproduction: focus #btnSubmit then open its modal, send native CDP Tab and Escape keydown/up. Probe exit 0: OPEN active=btnSubmit/inside=false/display=flex; TAB active has no ID/inside=false/display=flex; ESC still display=flex. There are no modal keydown/focus/return-focus handlers in root implementation.
- Expected: opening moves focus inside, Tab/Shift+Tab cycle inside, Escape cancels where supported, closing returns focus. Actual background controls remain navigable despite aria-modal=true. Impact: keyboard/screen reader users cannot reliably operate submission confirmation. Fix with shared modal primitive and lifecycle wiring without interfering with IME. Regression: actual native key events, focus containment and return on root and dist. Owner: WEB-FINAL-DOCS (root) with quality/integration coordination.

### WEB-F08 — BLOCKER — missing DOCX Part II keys become publishable all-false answers

- Files: src/import/docx/segmentation.ts:382 (`answer: ans ?? false`); src/import/preview/core.ts:119–129 (only checks boolean type), :179–181 (removes KEY_MISSING), confirmAllValidDrafts and confirmImport.
- Verified complete port reproduction: buildSyntheticDocx with PHẦN II, Câu 1 and four a)–d) statements, no key markers/key table. importDocx outputs four answer=false plus provenance KEY_MISSING. getDraftWarnings returns []; confirmAllValidDrafts marks confirmed=true; confirmImport succeeds; publishDraft to real memory storage succeeds. Probe exit 0; exact observed flags=[HEURISTIC_PARSED,KEY_MISSING], warning=[], autoConfirmed=true, confirmed=true, published=true.
- Expected Shared §2/§6 and WEB §4/§8: absent key stays unresolved, cannot publish or score as an invented answer. Actual missing answers silently become a full false key and the missing-key warning disappears.
- Impact: wrong scoring against fabricated keys; a teacher clicking confirm-valid can unknowingly publish an invalid exam. Minimal fix: preserve missing II key explicitly in import IR (partial statement type/undefined or equivalent unresolved state), require explicit boolean key per statement before warnings/confirmation/publication clear, never infer false from absence. Preserve raw source and partially supplied keys. Regression: none/one/some missing II keys through DOCX→edit→confirm-valid→confirm→publish; no path publishes until each missing key is supplied. Owner: WEB-FINAL-IMPORT, coordinate schema/teacher if typing requires cross-scope work.

### WEB-F09 — MAJOR — DOCX table content disappears from extracted questions without warning

- Files: src/import/docx/document-parser.ts:164–178 (tables only enter documentBlocks); src/import/docx/segmentation.ts:119–124 and :321–328 (questions consume only paragraphs).
- Verified synthetic DOCX: PHẦN III heading → `Câu 1. Read this table` → one-cell table containing `Unique table data 42` → `Đáp án: 42`. importDocx returns ok=true; job.blocks contains the table, but drafts[0].question.blocks contains only the prompt text, answerKey=42, flags=[HEURISTIC_PARSED], job.flags=[]. The table is not associated with the question and confirmImport only transfers question blocks.
- Expected: preserved ordered table in question IR/confirmed exam, or explicit unresolved association warning requiring correction; actual silent question content loss while key is publishable. Fix: carry an ordered block stream with source locations through segmentation; associate table/image/math blocks with the current question or flag unresolved association. Regression: tables between prompt/options/key and nested/merged cells through preview→confirm→export→render, not only checking job.blocks. Owner: WEB-FINAL-IMPORT.

### WEB-F10 — MAJOR — redirect allowlist is checked after posting data to unapproved destination

- Files: src/collect/transport.ts:137–148 (`redirect:'follow'`), :181–194 (post-response allowlist check).
- Verified loopback network reproduction (Node native fetch, no external service): approved localhost server returns 307 Location to a second, unapproved localhost server. HttpCollectorTransport.send posts a synthetic finalized result. Second server receives 1 POST, 1,641 body bytes; transport then throws COLLECTOR_HTTP. Probe exit 0, both servers closed. This is transport evidence, not live browser Google CORS evidence.
- Expected: endpoint allowlist prevents any payload leaving for an unapproved URL. Actual: response validation occurs after native redirect has resent the result, including nickname/raw responses/score.
- Impact: allowlist cannot contain result disclosure through redirect. Minimal fix: disable automatic redirects (redirect:error or properly handled manual/opaqueredirect fail-closed); only deliberately follow destinations verified before resending, with browser-compatible semantics and owner approval. Regression: real local 307/308 redirect to unapproved sink receives zero body/requests, approved redirects considered explicitly, no receipt confirmation from rejected response. Owner: WEB-FINAL-QUALITY.

## Acceptance boundaries and remaining work

- LC28-F01 and LC35-F03: present regression assertions and preliminary focused/full runs pass. Additional real Chrome LC28 probe (exit 0): enter Unicode nickname `Nguyễn LC28 Browser`, raw `1,50`; expire the synthetic stored draft deadline then reload. Exactly one draft expired; restored name and persisted final retain the Unicode nickname and raw answer, submitted=true. Deadline adjustment is test setup, not a claim about OS clock defenses. LC35 per-attempt retry is still VM/port evidence, no live service claim.
- Exact maxima 5/15/16, III 10/3, raw III and II exhaustive: preliminary domain/oracle/parity pass; no new grammar/rounding approval.
- Teacher/bank publication cloning, report recomputation/release projection, collector receipt/CAS/idempotency/CSV, ZIP bounded expansion/CRC/offsets, XML security, DOCX provenance/OMML and PDF manual flags were inspected. Existing suites ran; this is not certification of full real UI paths. Specific counterexamples above remain actionable.
- Two-tab browser probe: second root tab restored raw `1,50`; first final record kept original nickname/raw after second tab input change. This is a sequential stale-write observation, not simultaneous-final atomicity proof. Initial probe attempted module-scoped lexical state from Runtime.evaluate and returned undefined; discarded as evidence (CDP helper ignores exceptionDetails). Later DOM/localStorage probe produced explicit data. Unicode typed through PowerShell stdin was substituted in that probe; do not call it a Telex/VNI or Unicode-name pass.
- Native IDB browser-port probe (exit 0, no mock DB): import emitted storage/student/schema into two actual Chrome tabs in the same temporary browser context; start answer `1,50`, resume in tab B at revision 2; submit concurrently via Promise.all. Both return phase=final, revision=3 and identical submittedAt=1794645672192. Subsequent tab B rename returns ATTEMPT_FINALIZED. Technical port result only, no D03 activation/approval or claim that app UI integrates this port.
- Real download probe (exit 0): actual root report downloaded through Browser.setDownloadBehavior to the temporary browser profile, reopened file:// with Network offline. UTF-8 Unicode title/name `Nguyễn Review Download` preserved, raw `1,50` present, 26,761-byte HTML; embedded SVG image complete=true,naturalWidth=540; 5,024 text characters. Browser temp files cleaned by existing client.close lifecycle. This verifies the tested sample report only, not every imported asset/release branch or native print dialog.
- Real root unreleased-report probe (exit 0): load synthetic after_deadline III exam with unique key `9,87` and explanation marker, answer `1,50`, submit before deadline and actually download HTML. DOM and 4,268-byte file contain neither key nor explanation marker; file retains raw answer. Does not conceal keys in app storage/source or establish trusted assessment.
- NOT_RUN: real OS Telex/VNI and NVDA/JAWS (no OS driver/human session); axe/Lighthouse (not installed, installation prohibited); live Google/CORS/redirect/preflight/receipt/readback (D04 not approved, no authorized endpoint); native print dialog; real module offline/two-tab workflows (startup incomplete); complete adversarial multi-tab simultaneous-final/browser IDB corpus. Report these as gaps, not passing mocks.
- Dependency/permission delta from WEB baseline `038a7a9`: package/lock/domain unchanged. New apps-script/sample/appsscript.json declares USER_DEPLOYING + ANYONE_ANONYMOUS; sample is undeployed, not authenticated or authoritative grading. No deployment authorized or performed. No full dependency advisory/history secret audit claimed; limited source/bundle pattern scan ran in browser suite.
- D01–D08 remain owner decisions (WEB §12). Options: D01 charset vs new grammar version vs preset; D02 exact vs owner-specified decimal vs labeled approximation; D03 legacy-local/HTML vs transactional IDB+migration/HTML vs added PDF engine; D04 local/export vs approved Apps Script live pilot vs approved serverless; D05 custom-only vs verified official preset; D06 manual PDF vs reviewed parser vs defer auto; D07 proposed caps/grouping vs versioned alternatives; D08 client-key practice vs UX deadline release vs approved trusted service. No option approved by this review.

Final review pending stable W5 handoffs, complete source/diff recheck and affected reruns. This preliminary snapshot must not be carried forward as approval of later code.

## Reproduce scoring blocker without changing project files

Run this UTF-8 PowerShell here-string from D:\Cunata. Exit 0 means the probe executed, **not** that the observed publication of an unkeyed question is acceptable. Existing builders create synthetic bytes in memory; no file output, network, or installation.

```powershell
@'
import fs from 'node:fs';
import {buildSyntheticDocx,createMockDocxFile} from './test/import-docx/docx-builder.ts';
import {importDocx} from './src/import/docx/index.ts';
import {getDraftWarnings,confirmAllValidDrafts,confirmImport} from './src/import/preview/index.ts';
import {createDraft,publishDraft} from './src/teacher/index.ts';
import {parseExam} from './src/schema/index.ts';
import {openStorage,MemoryTransactionAdapter} from './src/storage/index.ts';
const text=['PH\u1ea6N II. Tr\u1eafc nghi\u1ec7m \u0110\u00fang/Sai',
 'C\u00e2u 1. X\u00e9t c\u00e1c m\u1ec7nh \u0111\u1ec1','a) first','b) second','c) third','d) fourth'];
const documentXml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
 +text.map(t=>'<w:p><w:r><w:t>'+t+'</w:t></w:r></w:p>').join('')+'</w:body></w:document>';
const imported=await importDocx(createMockDocxFile(await buildSyntheticDocx({documentXml})),new AbortController().signal);
if(!imported.ok)throw imported.error;const job=imported.value;
const parsed=parseExam(JSON.parse(fs.readFileSync('public/exams/hoa-repeating.json','utf8')));
if(!parsed.ok)throw parsed.issues;const target=createDraft({...parsed.value,questions:[]},'review-ii');
const marked=confirmAllValidDrafts(job);if(!marked.ok)throw marked.error;
const result=confirmImport(marked.value,target);
const store=await openStorage(new MemoryTransactionAdapter());if(!store.ok)throw store.error;
const pub=result.ok?await publishDraft(result.value,'review-published',store.value):null;
console.log(JSON.stringify({drafts:job.drafts,warning:getDraftWarnings(job.drafts[0]),
 autoConfirmed:marked.value.drafts[0].confirmed,confirmed:result.ok,published:pub?.ok,publishError:pub?.error}));
'@ | node --input-type=module
```
