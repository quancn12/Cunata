# RD-ui verification — 2026-11-16

Baseline HEAD: `aa3e37ed800cc81b8dd35ac42446bbb014dac182`. Working tree already contained the shared UI implementation and unrelated edits at task start; existing work was preserved.

- `node --test "test/ui/**/*.test.ts"`: exit 0; 111 pass, 0 fail, 0 skip. Includes real Chromium/CDP checks at 375/768/1440px in light/dark, keyboard focus trap/Escape/return, loading width, labels/errors, responsive tables, safe text, contrast and reduced motion. Log: `ui-tests.tap`; six viewport screenshots alongside this file.
- `npx --no-install tsc -p tsconfig.json`: exit 0.
- `npx --no-install tsc -p tsconfig.web.json`: exit 0.
- `node --test test/claude-check/design.test.mjs test/claude-check/web.test.mjs test/claude-check/teacher.test.mjs test/claude-check/appsscript.test.mjs`: exit 1; 49 pass, 22 fail, 0 skip. Log: `integration-tests.tap`. These tests used the existing dist, not the isolated component fixture.
- `buildWeb({stagingDir:'test/ui/redesign/artifacts/build-staging',outDir:'test/ui/redesign/artifacts/build-output',promote:false,silent:true})`, imported from `scripts/web-build.ts` via Node: exit 0, 302 emitted files, browser-module validation passed. See `build-check.json`. No promotion to dist.

## Corrections verified in this run

Long TopBar action labels extended past the 375px viewport (right edge 492.625px). A regression test failed before the fix and passes after limiting action width and ellipsizing long labels. Ordinary “Đổi vai” remains fully readable; the complete accessible button name is retained.

Missing exam descriptions now say “Đề luyện tập N câu”. WEB-contract §14 D05 limits this release to custom-v1; it takes precedence over the DESIGN.md example implying a verified THPT structure.

## Integration blockers outside RD-ui ownership

The existing build does not copy `src/ui/components.css` or `src/ui/tokens.css` and the shell does not link them. App/build must copy/link/precache both stylesheets before computing the build digest. README documents the integration API.

Independent integration failures include missing role chooser/student/teacher/admin DOM, unconnected preview flows, offline boot and raw colors in app/bank/import/report/student/teacher. They are not evidence that the isolated components failed. No files in those modules or independent test suites were edited.

OS Telex/VNI, assistive technology, Firefox/WebKit, axe and Lighthouse: NOT_RUN; no installed/connected tooling used for these checks. Chromium tests do not certify these environments.

Generated build-staging was retained after automatic review rejected its cleanup command as “blocked by policy”. No install, dependency change, commit or deployment was performed.
