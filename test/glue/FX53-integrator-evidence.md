# FX53 integration evidence

Base: `b2892c9efdff516efa57ddbe2feadc17758c8bb3`. Existing working-tree changes were retained. No install, commit or deployment.

## Product changes

`src/app/main.ts`: retain numerator and denominator grouping when displaying fractions; support escaped percent signs; preserve and label source for unsupported LaTeX commands. The same renderer feeds the exam, on-page review and downloaded HTML. Keep the overlength-input warning through subsequent change/blur events, until another input edit. No domain/scoring changes.

`test/glue/fx53-integrator-browser.test.mjs`: additional browser regressions using the current class assignment and hidden file import paths. This does not replace or modify either independent suite. Contexts, browser and servers close in finally blocks; each test has a 120-second timeout. CDP sockets are released at teardown.

The physics regression failed before the fix with `t = (21 + 23 + 30 + 26/4)`, and with a five-character paste becoming the four-character key without a visible warning after blur. It now passes, including the downloaded HTML assertion, real question rendering and percent notation.

## Remaining blockers

* The assigned-exam browser regression passes class entry, dark contrast, font scale and 320px dialog target/bounds assertions, then fails the Sheet readback: submitted name `'Nguyễn An` becomes `Nguyễn An`. The real local Apps Script simulator executes `apps-script/Code.js`. That file is outside the integrator's allowed scope. Client-side payload mutation would conceal the backend encoding defect and is not a fix.
* `test/claude-check/build.test.mjs:36` applies a browser-only import rule to all of dist, including Node modules under dist/api. WEB-contract §22 requires this self-contained Node API and permits node:crypto/fs/path/url there. Do not remove the API or its security imports to satisfy this obsolete assertion.
* `test/codex-check/cx/app.test.mjs` sets up an assigned exam but never joins the class before selecting its card. `cx/schema.test.mjs` likewise expects a public practice card. §21 disallows those cards outside joined classes.
* `cx/report.test.mjs` and the first two browser cases in `cx/collect.test.mjs` call enterFromStart with an id, but that helper now only enters the student area, per §21; it neither selects nor loads the requested exam. Missing questions, missing explanations and unconfirmed submissions in those cases are not evidence that their intended exam was exercised. The supplemental regression loads real physics files explicitly and independently reproduces the renderer and paste defects.
* API19 in `test/codex-check/feat/R1/api.test.mjs:284` clicks #btnRoleStudent after navigating directly to #/hoc-sinh. §19.1 routes directly to the student area; the chooser is hidden. API20 similarly clicks the hidden teacher chooser after direct navigation.
* GLUE04 exercises `ops/publish.py:108`: copying the entire dist into site also copies api, contrary to §22. The publisher is outside scope. The isolated publish probe fails `never copy API into site/` without deploying.

Resolution choices for the coordinator: (A) retain §21/§22 and authorize the independent-suite owner to align setup/import boundaries, plus assign backend/publisher repairs to their owners; (B) obtain an explicit product-contract revision before changing those behaviors. The integrator did not change the protected tests or restore public student exam access.

## Logs and limitations

Logs are `test/glue/fx53-integrator-*.log`; `*-final.log` are the post-change gate runs. Build and both TypeScript checks exit 0. The supplemental browser suite exits 1, one pass and one backend readback failure.

The initial full runs overlapped and also encountered timing/CDP failures. Other test processes predated this task. The first Codex run stopped making progress with browser processes still open and was terminated by its own PID tree; this is incomplete execution, not a passing gate. Final gate results are reported in the handoff; no Google production traffic/readback was tested.

Post-change full gates (all commands executed as requested):

| Command | Exit | Pass / fail |
| --- | --- | --- |
| `node scripts/web-build.ts` | 0 | Build succeeded |
| `npx --no-install tsc -p tsconfig.json` | 0 | Typecheck succeeded |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Typecheck succeeded |
| `node --test "test/claude-check/**/*.test.mjs"` | 1 | 81 / 1 |
| `node --test "test/codex-check/**/*.test.mjs"` | 1 | 185 / 13 |
| `node --test "test/**/*.test.ts"` | 1 | 1572 / 2 |

The two full-suite TypeScript failures were CK15 offline Release B cache and CK16 serviceWorker undefined during navigation. Both unmodified tests pass in a focused rerun (`node --test --test-name-pattern="CK15-F01|CK16-F01" test/final-quality/ck12Regressions.test.ts`, exit 0, 2 pass, 0 fail). This does not turn the full gate green. The final Codex gate also hit a 5-second DOCX preview timeout in browser.test.mjs; see the isolated rerun log for its result.

The unchanged DOCX cases also pass in isolation: `node --test --test-name-pattern="generated DOCX preview preserves" test/codex-check/browser.test.mjs`, exit 0, 2 pass / 0 fail (`fx53-integrator-import.log`).

`node --test test/collect/round53-backend.test.mjs`: exit 1, 1 pass / 2 fail. It independently confirms both out-of-scope backend defects: apostrophe loss and HTTP 500 for supported answer payloads larger than one Sheet cell.
