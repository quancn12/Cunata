# FX53-glue — changes and review blockers

Baseline HEAD: `b2892c9efdff516efa57ddbe2feadc17758c8bb3`. Work stayed in the existing working tree; pre-existing edits were retained.

## Product fixes

- `apps-script/Code.js`: normalize the class-code argument in `classResults` to text. Google Sheets can return legacy numeric codes as numbers, while result rows store literal text. This previously hid confirmed submissions, student counts and assignment submission counts. The existing independent browser regression `CX-AS-03` passes after this fix.
- `index.html`: defer Blob URL revocation for report, builder and bank exports until the browser has time to consume the download. The new browser regression exercises a real HTML download with an escaped candidate name; the independent root report cases also pass.

## Why four owned tests changed

`test/docs/samplePathsAndBuild.test.ts`, `test/glue/final/distParityAndSubpath.test.ts`, `test/glue/wave3/distSubpath.test.ts`, and `test/glue/wave4/subpathAndBareImports.test.ts` predate WEB-contract §22 and incorrectly apply browser-only rules to every server API file. §22 explicitly requires `dist/api/**`, including Node built-ins. They now use `assert-runtime-import.ts` to check both runtimes: only real Node built-ins are allowed in API files; browser imports remain relative, cannot enter the API directory, cannot reference TypeScript or missing targets, and API relative imports cannot escape their own directory. Negative controls are included in `fx53-regressions.test.mjs`. No tests were skipped or removed.

## Protected-test and ownership blockers

No source assertions or helpers in `test/claude-check` or `test/codex-check` were edited. Running their exact commands generates their own fixture/evidence files, including pre-existing dirty evidence; these are not source changes authored for this task.

- `test/claude-check/build.test.mjs:36`: recursively treats server files as browser code and rejects `node:crypto`, `node:fs`, `node:path`, and `node:url`, contradicting §22.
- `test/codex-check/cx/app.test.mjs`: setup creates a class but `withExam` never joins it before selecting its exam. §21 forbids public exam cards.
- `test/codex-check/cx/report.test.mjs`: `withExam` calls `enterFromStart` with an `id` argument that the helper does not accept and never loads the requested exam. Consequently its question-specific assertions run without that exam.
- `test/codex-check/cx/collect.test.mjs`: CX-AS-01/02 likewise call `enterFromStart` without loading their exam. CX-AS-03 is a valid reproduction and was fixed in the product.
- `test/codex-check/cx/schema.test.mjs:106`: attempts to select a public exam without class assignment, contrary to §21.
- `test/codex-check/feat/R1/api.test.mjs` API19: navigates directly to `#/hoc-sinh` then attempts to click the hidden role chooser. Direct student navigation is required by §19.1. API16 timed out in the final run; API20 passed. Do not treat the timeout as proof of a product cause.
- `ops/publish.py` (outside scope): GLUE04 fixture shows `site/api` is copied, violating §22. Evidence is in the generated R1 publish log. This worker cannot edit `ops/**`.

Decision options for the protected test conflicts: (A) have the test owner update fixtures and scanners to §21/§22 while retaining all behavioral assertions; (B) have the product owner explicitly revise those contract requirements before changing product behavior. Option A follows the current contract. Do not restore public exams, hide the server artifact, or special-case fixture IDs to turn tests green.

## Evidence

Logs in this directory record the commands run during this task. `node --test "test/claude-check/**/*.test.mjs"` produced `fx53-claude-final.log` (exit 1: 81 pass, 1 fail, 0 cancelled). `node --test "test/codex-check/**/*.test.mjs"` produced `fx53-codex-final.log` (exit 1: 185 pass, 12 fail, 1 cancelled). The latter API child retained two listening HTTP servers after more than six minutes and had no browser children left. Its PID/parent/command were verified before terminating only that stuck child, allowing the runner to print final counts and exit; this is a failed/incomplete API check, not a passing run. All independent root cases passed in this final run. Earlier logs record the initial concurrent run, which produced additional download/time-limit failures under load and must not be presented as the final verification snapshot.

Owned unit suite logs: `fx53-docs.log` (20 pass), `fx53-final.log` (4 pass), `fx53-wave3.log` (4 pass), `fx53-wave4.log` (4 pass), `fx53-regressions.log` (2 pass). `fx53-numeric-code.log` records CX-AS-03 (1 pass); `fx53-root-reports-final.log` records three independent root report cases (3 pass); `fx53-download.log` records the new browser download regression (1 pass); `fx53-appsscript.log` records all 9 Apps Script cases passing. `fx53-build.log` records a successful 337-file build. Both `tsc -p tsconfig.json` and `tsc -p tsconfig.web.json` passed; their log files are empty on success.

No install, dependency change, scoring change, commit, or deployment was performed. Rollback consists of reverting the listed product/test edits and removing this task's added tests, helper and logs; preserve pre-existing working-tree edits.
