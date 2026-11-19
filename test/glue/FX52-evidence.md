# FX52-glue evidence

Baseline: `6b1fef17d1a6358d60fe59c5723fbcce36f5f1e2`, branch `main`.
Existing working-tree changes were retained. No dependency installation, commit or deployment.

## Changes

- `src/app/main.ts:3227`: prevent overlapping file-change handlers from racing through the asynchronous read/load/create sequence. Reset the guard on success, parse failure, read failure and abort.
- `test/final-quality/ck12Regressions.test.ts`: regression dispatches two changes before releasing the file read, checks exactly one durable record, then checks a later independent import. Temporarily removing the guard makes this fail with `2 !== 1`; restoring it passes.
- `test/browser/cdp-client.ts`: bound HTTP discovery, WebSocket connection and individual CDP requests; reject pending requests on connection/client closure; dispose failed browser/tab startup; consume no unhandled browser output pipes; wait boundedly for process exit.
- `test/browser/cdpLifecycle.test.ts`: cover a silent peer, explicit close, synchronous send failure and an executable that exits before opening DevTools.

## Completed checks

| Command | Exit | Pass | Fail |
| --- | --- | --- | --- |
| `node scripts/build.js` | 0 | build succeeded | 0 |
| `npx --no-install tsc -p tsconfig.json` | 0 | typecheck succeeded | 0 |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | typecheck succeeded | 0 |
| `node --test test/final-quality/ck12Regressions.test.ts` | 0 | 13 | 0 |
| `node --test test/browser/cdpLifecycle.test.ts` | 0 | 4 | 0 |
| `node --test test/app/routes.test.ts` | 0 | 3 | 0 |
| `node --test "test/claude-check/**/*.test.mjs"` | 1 | 81 | 1 |
| `node --test test/docs/samplePathsAndBuild.test.ts` | 1 | 19 | 1 |
| `node --test test/glue/final/distParityAndSubpath.test.ts` | 1 | 3 | 1 |
| `node --test test/glue/wave3/distSubpath.test.ts` | 1 | 3 | 1 |
| `node --test test/glue/wave4/subpathAndBareImports.test.ts` | 1 | 3 | 1 |

Logs: `test/glue/fx52-*.log`. The final CK12 run includes real-browser service-worker update/offline restore, multi-tab isolation and JavaScript exception tests, and exits normally (90 seconds). Initial browser checks overlapped other already-running workspace checks; the baseline CK12 process leaked after a failed launch and was explicitly terminated. The final run uses the cleanup fix.

## Decision required: server artifacts versus browser-only assertions

All five completed failing commands above reject imports such as `node:crypto` in `dist/api/auth.js`. WEB-contract section 22 explicitly requires Node crypto and self-contained serverless output under `dist/api/**`; `node scripts/build.js` must emit that output. `scripts/web-build.ts:186` already distinguishes those server imports, and its service-worker manifest excludes `api/` at line 453. The independent assertion at `test/claude-check/build.test.mjs:36` still treats every emitted JS file as browser code.

No assertions were relaxed, removed or skipped. No protected test source was edited. Removing the API, disguising Node imports or changing the output extension solely to evade the scanners would violate the current requirements.

Options for the coordinator/owner:

1. Keep section 22: update the independently owned checks to validate the browser and server module graphs separately, permitting Node built-ins only in the server graph.
2. Change the packaging contract: put server output outside the browser `dist/` tree and update publishing, API checks and browser checks together.

## Protected Codex run

The exact command `node --test --test-reporter=spec "test/codex-check/**/*.test.mjs"` was launched before the fixes. The remaining process was `test/codex-check/cx/collect.test.mjs`, using the independently owned `test/claude-check/harness.mjs`. That harness has unbounded CDP promises and awaits them during context/browser cleanup (including `Browser.close`). Changing the product's CDP helper cannot change this separate harness. After more than 600 seconds, only this owned child and its browser descendants were forcibly stopped; the test runner then exited 1, reporting 198 tests, 183 pass, 15 fail, 0 skipped, 618 seconds. This is not a naturally completed or post-fix full verification. See `fx52-codex.log`.

Additional reported failures, outside the seven initial assertions:

- `cx/app.test.mjs` design F01–F04 and `cx/schema.test.mjs` SEC-02 wait for a public practice card, conflicting with WEB-contract section 21. They fail before reaching their intended checks.
- `cx/report.test.mjs` C02/C03/scoring-F03 assert question IDs/content that were not rendered. Their setup/fixture flow needs independent revalidation; these failures do not establish a scoring or renderer defect.
- `cx/teacher.test.mjs` F04 reports a missing assignment selector (`src/teacher/**`, outside this worker's scope).
- `cx/collect.test.mjs` AS-01 lacks a confirmed result; AS-02 cannot find the expected answer control; AS-03 reports navigation timeout. The protected fixture flow/cleanup needs correction before a reliable product diagnosis.
- R1 API19/API20 report role-chooser/navigation timeouts. R1 GLUE04 fails its publisher fixture (`ops/publish.py`, outside scope). The same R1 suite passes its section 22 self-contained API graph test, which explicitly permits Node built-ins in the server artifacts.

The two protected directories contain runtime-generated fixtures/debug evidence from the mandated test commands, alongside pre-existing changes. Their source was not edited or restored. Generated `dist/` output was rebuilt with the required build command.
