# FX53-collect: BLOCKED

Baseline: `b2892c9efdff516efa57ddbe2feadc17758c8bb3`, existing shared working tree.
No production source changed by this worker. No install, commit, or deployment.

## Checks

- `node --test "test/collect/**/*.test.ts"`: exit 0; 149 pass, 0 fail, 0 skip (`fx53-unit.log`).
- `npx --no-install tsc -p tsconfig.json`: exit 0 (`fx53-typecheck.log`).
- `npx --no-install tsc -p tsconfig.web.json`: exit 0 (`fx53-typecheck-web.log`).
- Required `node --test "test/codex-check/**/*.test.mjs"`: started; failed tests appeared, then no further output. Stopped only this invocation's verified process tree (40124 and its descendants), shell exit 1. Incomplete: no reliable aggregate counts (`fx53-codex-check.log`). Other workers were concurrently running browser checks; their processes were left alone.
- `node --test test/codex-check/cx/collect.test.mjs`: exit 1; 1 pass (CX-AS-03), 2 fail (CX-AS-01, CX-AS-02), 0 skip (`fx53-browser-collect.log`). Browsers/contexts closed by the existing test teardown.
- `node --test test/collect/round53-backend.test.mjs`: exit 1; 1 pass (numeric class), 2 fail (literal name, large responses), 0 skip (`fx53-backend.log`). Local HTTP redirects execute actual `apps-script/Code.js` using the shared Sheets simulator. This is not live Google evidence. Requests have a 10s abort signal, tests have 20s timeouts, and servers close in finally.

## Root causes and ownership

1. `apps-script/Code.js:32`, `:213`: `sanitizeSheetCell` leaves a literal leading apostrophe unchanged. Sheet storage consumes that apostrophe, so acknowledged `"'Nguyễn An"` becomes `"Nguyễn An"`. The new HTTP regression verifies the outgoing collector payload remains exact before asserting backend readback. Backend owner must preserve literal text and ensure duplicate comparisons use the same reversible representation.
2. `apps-script/Code.js:230`, `:238`, `:909`: all raw responses are serialized into a single cell by `formatRecordRow`, then appended unchanged. Supported responses above 50000 characters cause server error. Collector sends every response unchanged. Backend owner must chunk and reassemble answers without truncation, including deduplication/readback paths.
3. Numeric code `222222` now passes both direct HTTP and original browser case. Current shared backend writes class and assignment identifiers with `examTextCell` at `apps-script/Code.js:910`; this worker did not change that file.
4. Independent browser CX-AS-01/02 setup is incompatible with current section 21 navigation: `test/claude-check/app.mjs:124` `enterFromStart` returns after entering the student area, without loading the requested fixture. `id` supplied by `cx/collect.test.mjs` is ignored. CX-AS-01 subsequently submits the hidden fallback exam with no durable controller, and CX-AS-02 cannot find fixture choices. These test files were not edited; coordinator must reconcile the setup with section 21. Do not restore public exam access to accommodate it.

The necessary production fixes are in `apps-script/**`, outside this worker's scope (`src/collect/**`, `test/collect/**`). No client-side apostrophe encoding or answer truncation was introduced. Existing assertion tests were not weakened. Running the mandated independent tests produces their own JSON evidence in their existing directories; this worker did not manually edit those artifacts or tests.
