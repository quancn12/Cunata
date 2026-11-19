# FX52-integrator — evidence and remaining gates

Date: 2026-11-19. Base HEAD: `6b1fef17d1a6358d60fe59c5723fbcce36f5f1e2`.

## Product correction

`loadAppConfig` previously discarded `apiBase`, so an API-only deployment appeared unconfigured; when both endpoints existed the frontend selected Apps Script. The application and admin now resolve the owner-provided configuration consistently: nonempty `apiBase` takes priority and selects `application/json`; otherwise the existing Apps Script endpoint and `text/plain;charset=utf-8` remain in use. Teacher/admin actions, publishing and result collection receive that selection. The existing timeout, redirect, receipt and outbox behavior remains in place.

Changed product files: `src/collect/appsScript.ts`, `src/collect/index.ts`, `src/app/main.ts`, `src/app/authoring.ts`, `src/admin/main.ts`. Existing file-import concurrency changes in `src/app/main.ts` were present before this task and were preserved.

New tests: `test/collect/apiBase.test.ts` and `test/glue/fx52ApiBrowser.test.ts`. The browser test starts the real local HTTP handler with a memory store, opens the actual built frontend, logs in a teacher, reads assigned class cards as a student, and logs in an admin. It uses an isolated browser profile, a test timeout, CDP request deadlines and finally cleanup. No Google or Neon deployment is contacted. The collector regression checks raw answers, candidate name and assignment metadata.

No existing test assertions were changed. No domain/scoring, dependency, package, deployment or commit changes were made. Requested build/test commands generate their normal artifacts; those outputs are distinct from manual source edits.

## Commands and logs

- `node scripts/web-build.ts`: exit 0; `fx52-integrator-build.log`.
- `npx --no-install tsc -p tsconfig.json`: exit 0; `fx52-integrator-tsc.log`.
- `npx --no-install tsc -p tsconfig.web.json`: exit 0; `fx52-integrator-tsc-web.log`.
- `node --test test/collect/apiBase.test.ts test/collect/appsScript.test.ts`: exit 0, 54 passed, 0 failed; `fx52-integrator-collect-final.log`.
- `node --test test/glue/fx52ApiBrowser.test.ts`: exit 0, 1 passed, 0 failed; `fx52-integrator-api-browser.log`. This browser test also passed in the full product suite.
- `node --test "test/**/*.test.ts"`: exit 1, 1,573 tests, 1,569 passed, 4 failed, 0 cancelled/skipped; `fx52-integrator-product-final.log`.
- `node --test "test/claude-check/**/*.test.mjs"`: exit 1, 82 tests, 81 passed, 1 failed, 0 cancelled/skipped; `fx52-integrator-claude-final.log`. All design cases passed in this run.
- `node --test "test/codex-check/**/*.test.mjs"`: exit 1, 198 tests, 185 passed, 13 failed, 0 cancelled/skipped; `fx52-integrator-codex-final.log`. API16 and API20 pass in this final run; API20 was red in the supplied failure list before the transport correction.

An earlier concurrent run produced navigation/lifecycle timing failures. The sequential final runs above supersede its counts. In particular CDP launch cleanup, CK15 service-worker upgrade and CK16 multi-tab lifecycle checks passed in the final product run.

## Why the remaining gates cannot be made green by changing this frontend

### Browser-only import assertions conflict with the required server artifact

WEB-contract §22 requires `dist/api/**`, a Node server using built-in modules. `test/claude-check/build.test.mjs:36` scans every `.js` file under `dist`, including that server package, and rejects its `node:crypto`, `node:fs`, `node:path` and `node:url` imports as if they ran in a browser. The same outdated assumption causes all four product-suite failures in:

- `test/docs/samplePathsAndBuild.test.ts:202`
- `test/glue/final/distParityAndSubpath.test.ts:42`
- `test/glue/wave3/distSubpath.test.ts:53`
- `test/glue/wave4/subpathAndBareImports.test.ts:35`

The separate §22 tests require the server package and permit Node built-ins there. Removing those artifacts would violate §22. No imports were obfuscated or repackaged to evade the browser scanner, and none of these assertions were changed.

### Student fixtures still assume the superseded public-exam flow

WEB-contract §21 removes public practice cards and `?exam=` startup; students obtain exam cards through class assignments. The protected CX design tests (`cx/app.test.mjs:18`) enter the student area and immediately look for an assigned card without joining the class their fixture creates. The image-security fixture (`cx/schema.test.mjs:114`) also looks for a public card without class entry. The report fixtures (`cx/report.test.mjs:17`) call `enterFromStart` with an `id` argument; the shared helper now only enters the student area and does not load that exam. Consequently their assertions never exercise the intended report questions or long-answer inputs. Collection fixtures CX-AS-01/02 use the same obsolete entry pattern.

The remaining R1 API19 browser failure explicitly navigates to `#/hoc-sinh`, then requires a visible `#btnRoleStudent`. The current route has already opened its destination, as required by §19.1. The new independent browser regression exercises the direct routes and succeeds without requiring a hidden chooser button. R1 API16 and API20 pass in the final protected suite.

Decision needed from the test/contract owner: (A, recommended) align protected fixtures with §§19.1/21/22, retaining their assertions after valid class entry, actual exam loading and correct browser/server graph separation; or (B) explicitly revise those approved contracts before changing the product back. The integrator cannot edit either protected test directory.

### Failures whose root files are outside the task scope

- CX-AS-03: the confirmed numeric-class submission is stored but teacher `listResults` returns no result (`cx/F03-browser.json`: `storedResults: 1`, `api.results: []`). `apps-script/Code.js:910` stores class metadata through `examTextCell` (`:261`, leading apostrophe), while `classResults` (`:1156`) compares raw `String(r[17])` to the class code. Fix/readback validation belongs to the Apps Script owner; `apps-script/**` is outside this task's allowed files. Changing the frontend class code would corrupt the API contract.
- R1 GLUE04: the real publisher fixture fails because `ops/publish.py:108` copies the server API into `site/api`. §22 explicitly requires the API at the published root and excludes it from `site/`; the fixture also checks host-specific `apiBase` configuration. `ops/publish.py` is outside this task's allowed files. No publisher or deployment was modified.

This is a partial integration fix with verified regressions, not READY_FOR_REVIEW for the entire round.
