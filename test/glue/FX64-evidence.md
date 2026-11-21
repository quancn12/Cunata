# FX64-glue handoff

RESULT: FX64-glue / READY_FOR_REVIEW

Base: `7ad78209868cb3cb99da0cbd85cde4f683b29f43`. Windows, Node v24.14.0, real headless Chrome via the existing CDP harness. No install, dependency change, commit or deployment.

## Changes and ownership

- EX-HS-01: `styles/app.css` lets the header brand shrink and puts True/False controls below statement text on narrow screens. The original title flex item and fixed three-column statement rows extended beyond 390px; browser reproduction measured innerWidth 438px.
- EX-HS-02: `src/app/main.ts` renders a shared button-class flag control for every question, updates `aria-pressed`, and keeps palette flag classes independent of answered state.
- EX-HS-03: palette navigation closes the mobile sheet, focuses the question without scrolling, then scrolls its start below the measured sticky header.
- EX-HS-04: the submit dialog derives its count from current responses when opened. Palette and dialog share the completion predicate; a Part II question needs four actual boolean answers, including false. Restored null entries do not count as answers.
- EX-HS-05/06: root causes are in `src/student/area.ts` (assignment duration fallback and unverified THPT preview wording), outside this worker's scope. Another worker changed that file during this run. Those changes were preserved and included by the requested build; both cases pass in the integrated snapshot. This worker did not edit that source or `src/ui/components.css`.
- `test/glue/fx64-exam.browser.test.mjs`: six real-browser cases cover 375/768/1440px, light/dark, keyboard flag toggling, incomplete Part II count and Esc focus return. Each test has a 60-second timeout and context cleanup; hooks have 30-second timeouts and server/browser cleanup. Desktop overflow checks account for the native vertical scrollbar.

Assumption: question flags are navigation state for the currently loaded attempt; loading/resuming an exam clears flags. No durable flag schema was introduced.

## Final checks

| Command | Exit | Pass | Fail | Evidence |
| --- | --- | --- | --- | --- |
| `node scripts/web-build.ts` | 0 | n/a | n/a | 339 emitted files, build completed |
| `npx --no-install tsc -p tsconfig.json` | 0 | n/a | n/a | no diagnostics |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | n/a | n/a | no diagnostics |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | 94 | 0 | `fx64-claude.log`; final run 127467ms |
| `node --test --test-timeout=120000 test/claude-check/student-explore.test.mjs` | 0 | 6 | 0 | `fx64-explore.log` |
| `node --test --test-timeout=120000 test/claude-check/design.test.mjs` | 0 | 11 | 0 | `fx64-design.log` |
| `node --test --test-timeout=120000 test/glue/wave2/mainBootstrap.test.ts test/glue/wave4/compatibilityAndRegressions.test.ts test/glue/wave4/integrationHardening.test.ts test/glue/final/fullIntegration.test.ts` | 0 | 24 | 0 | `fx64-app.log` |
| `node --test test/glue/fx64-exam.browser.test.mjs` | 0 | 6 | 0 | `fx64-exam-browser.log` |
| `git diff --check -- src/app/main.ts styles/app.css` | 0 | n/a | n/a | no whitespace errors |

Initial independent reproduction: all six EX-HS cases failed before changes. No existing tests were edited, skipped or weakened. Six final screenshots in `fx64-artifacts/` were visually inspected. No browser test process from these runs was left running.

Known issue observed during screenshot inspection: existing dark-theme header/palette backgrounds and candidate field have inconsistent contrast (see `exam-375-dark.png` and `exam-1440-dark.png`). This is outside the six assigned failures and was not expanded into an unrelated redesign. Native OS IME and live Google/Vercel were NOT_RUN; only the local fake backend was used.

## Reviewed source hashes (SHA-256)

- `src/app/main.ts`: `FF65C70F744204BCB0737DD652413A01DCE5F485157744CA1FCAE2D3E0FE6118`
- `styles/app.css`: `78A4AC1886644BD4F82820EF753CB18EE08F477B69A5947CB39FE5B2F57BF393`
- External integrated dependency `src/student/area.ts`: `88E64DE5991CE6FDC2DFD044FC25CBAE6978898DD3A704CD7861A1BDA5857857`
- External integrated dependency `src/ui/components.css`: `F70D2428871632621D859855755D9B0CE443F573ED58FF60AC1A11AE98BC27F8`
- `dist/app/main.js`: `6D31CE3E760072AFB76B63BCBF9CBEA099CA23575FE5AAE18065A043D5004278`

Rollback: revert only this worker's edits to `src/app/main.ts`, `styles/app.css` and new `test/glue/fx64-*` / `FX64-evidence.md` artifacts, then rebuild; retain other workers' edits. Generated dist changes are build output, not separately hand-edited fixes.
