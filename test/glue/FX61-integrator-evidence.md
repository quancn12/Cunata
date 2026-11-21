# FX61-integrator evidence

Baseline: `14b99761005ec5973df4c8c2596bba6e22fa3ba2` (`main`), Node v24.14.0, Windows.

## Verdict: BLOCKED by publisher ownership

The reported GLUE04 failure executes `ops/publish.py` directly against an inert fixture. That file is outside FX61-integrator's scope. No production source, protected test source, domain scoring, dependency, or publisher was changed. No commit or deployment was performed.

`ops/publish.py:108` copies `dist/` into `site/` without excluding `api`. The isolated probe therefore fails at `test/codex-check/feat/R1/publish-probe.py:36`: `site/api` must not exist. The publisher also omits the two host-specific `apiBase` configurations required by WEB-contract section 22. The fixture creates its own inputs, so modifying the frontend or build cannot resolve this defect.

## Concrete proposed repair (not applied to ops/)

`fx61-publisher-proposed.patch` excludes `api` from the static site copy and writes the two required configs after copying public assets. The existing root API copy and Apps Script preservation remain intact. The patch needs an owner whose scope includes `ops/publish.py`.

The unchanged protected `publish-probe.py` was run against a temporary candidate made from the current publisher plus this patch. Result: exit 0, `R1_PUBLISH_PROBE_OK` (`fx61-publisher-probe.log`). This checks the absence of `site/api`, root API placement, both exact configs, and byte-preserved Apps Script. The probe forbids subprocess/network/Git writes. This is isolated validation, not a passing production GLUE04 or deployment validation.

Inert output is retained under `fx61-publish-output/`. Automatic approval review rejected recursive fixture cleanup as blocked by policy. Subsequent safe single-file cleanup removed the temporary candidate and the empty fixture `.git` directory; only the small proposed patch and fixture output remain.

## Required commands run

| Command | Exit | Result | Log |
| --- | --- | --- | --- |
| `node scripts/web-build.ts` | 0 | Build passed, 339 emitted files | `fx61-build.log` |
| `npx --no-install tsc -p tsconfig.json` | 0 | Passed | `fx61-tsconfig.log` |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Passed | `fx61-tsconfig-web.log` |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | 82 pass, 0 fail/cancel/skip | `fx61-claude.log` |
| `node --test "test/**/*.test.ts"` (first run) | 1 | 1574 pass, 1 fail, 1 cancelled, 0 skip | `fx61-unit.log` |
| `node --test "test/**/*.test.ts"` (rerun) | 0 | 1576 pass, 0 fail/cancel/skip | `fx61-unit-rerun.log` |
| `node --test "test/codex-check/**/*.test.mjs"` | 1 | 193 pass, 2 fail, 3 cancelled, 0 skip | `fx61-codex.log` |

Initial suites ran concurrently and encountered browser contention. Both initial product failures passed in the full rerun without source changes. The first Codex run additionally encountered browser timeouts; two workers remained alive past their deadlines. Verified worker PIDs 28456/26152 (children of runner 37780) and the owned Chrome tree rooted at PID 45936 were terminated to prevent hanging processes. The log and counts above include these terminations and must not be treated as a cleanly completed failure-only run.

The additional full command `node --test --test-concurrency=1 "test/codex-check/**/*.test.mjs"` completed with exit 1: **197 pass, 1 fail, 0 cancelled, 0 skipped** (`fx61-codex-serial.log`). GLUE04 is the sole remaining failure. All browser failures from the first run passed unchanged in this serial run. No workers needed termination in the serial run.

## Concurrent workspace change

At 23:25 local time, another actor modified `src/app/main.ts` and `src/app/shell.html` to add `#btnBackToStudent` and wire it to `onReturnToStudent`. These changes were absent from the initial status and were not made by FX61-integrator. They were preserved. Earlier gate results describe the files present when each command ran, not certification of subsequent external changes.

After the serial run, `node scripts/web-build.ts` and both exact `npx --no-install tsc` commands were refreshed against the current workspace: all exit 0 (`fx61-build-final.log`, `fx61-tsconfig-final.log`, `fx61-tsconfig-web-final.log`). Final product/Claude results follow below.

- `node --test "test/**/*.test.ts"`: exit 0; 1576 pass, 0 fail/cancel/skip (`fx61-unit-final.log`).
- `node --test "test/claude-check/**/*.test.mjs"`: exit 0; 84 pass, 0 fail/cancel/skip (`fx61-claude-final.log`). The earlier run contained 82 tests; the protected suite changed externally during this task. This task did not edit protected test source.
- External source edits subsequently appeared in `src/ui/math.ts` (23:28:40) and `src/ui/components.css` (23:29:39), and a separate Claude-suite runner was observed. These edits and processes are not owned by this task and were preserved. Gates are evidence of the states executed, not approval of a stable final source snapshot. No repeated verification loop is claimed to certify ongoing external edits.
