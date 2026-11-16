# RD-app — BLOCKED

Baseline HEAD: `aa3e37ed800cc81b8dd35ac42446bbb014dac182`.

Implemented within RD-app ownership: shared-component role chooser; remembered role and explicit hash precedence over legacy query links; Vietnamese hash routes; shared TopBar with role switching; read-only candidate name; removal of student-facing authoring buttons; durable draft lookup before initial navigation; exact attempt lookup for result links; teacher portal and authoring callback wiring; mutable metadata network-first in both worker implementations; stylesheet copying and generation of the Admin HTML entry.

The existing working-tree changes in other modules were preserved. No install, dependency change, commit, deployment, root index edit, or independent-test edit was made.

## Checks

| Command | Exit | Pass | Fail | Evidence |
|---|---:|---:|---:|---|
| `node --test test/app/routes.test.ts "test/offline/**/*.test.ts"` | 0 | 39 | 0 | [unit-output.txt](unit-output.txt) |
| `node --test test/app/role-shell.browser.test.mjs test/app/generated-worker.test.mjs` | 0 | 9 | 0 | [browser-output.txt](browser-output.txt) |
| `node --test test/claude-check/design.test.mjs` | 1 | 2 | 9 | [design-output.txt](design-output.txt) |
| `node --test --test-name-pattern="^dist" test/claude-check/web.test.mjs` | 1 | 0 | 23 | [web-dist-final-output.txt](web-dist-final-output.txt) |
| `node --test test/claude-check/teacher.test.mjs` | 1 | 2 | 5 | [teacher-output.txt](teacher-output.txt) |
| `node --test test/claude-check/appsscript.test.mjs` | 0 | 9 | 0 | [appsscript-output.txt](appsscript-output.txt) |
| `node --test test/glue/wave2/routes.test.ts test/glue/wave2/webBuild.test.ts` | 1 | 9 | 2 | [glue-output.txt](glue-output.txt) |

Both `npx --no-install tsc -p tsconfig.json` and `npx --no-install tsc -p tsconfig.web.json` exit 0. Build exits 0 and emits 312 files, with an explicit missing-Admin integration warning: [build-output.txt](build-output.txt). Build success establishes compilation/emission only.

The role chooser passed the independent design checks at 375px and 1440px. The scoped browser suite covers 375px, 768px, 1440px in light/dark mode, real Tab/Enter focus and navigation, remembered role, legacy-query precedence, plus a real controlling service worker refreshing metadata and retaining its latest successful responses offline. All six final chooser screenshots in [artifacts](artifacts) were visually inspected.

## Integration blockers

1. `src/student` has the previous attempt/view API, without the section 19 home UI. App still uses its existing start-screen adapter until the owning module supplies the name gate, practice ExamCards, preview, class invitation and assignment UI. The independent browser suite stops at this missing flow; its scoring failures here do not establish new scoring defects.
2. `src/teacher/portal.ts` still implements the earlier password modal. It does not supply section 19 username login, teacher shell, class/exam/result navigation or assignment screens. RD-app now calls the real `mountTeacherPortal` and passes the real client/list/builder ports; its tabs cannot be completed inside app ownership. Direct `?teacher` also exposes a limitation in the independent `waitBoot` helper: that helper does not consider teacher login a booted screen.
3. `src/admin` does not exist. Generated `dist/admin.html` references `./admin/index.js` until the owning module supplies `src/admin/index.ts` (or `main.ts`, which the build also detects). The Admin page is currently nonfunctional. Do not release this build.
4. The global design scan still finds literal colors in bank/import/report/student/teacher files outside RD-app scope. App-owned literal colors were replaced with tokens.
5. Two existing wave-2 routing assertions still expect empty hashes to open `exam` and result URLs to use `#/report?attemptId=…`. Section 19 now requires role selection and `#/ket-qua/<id>`. These tests were left unchanged; the new scoped route tests verify the required routes.

The exact result-link and direct exam-route integration remains only partially exercised because the new student flow is absent. Loading/empty/error behavior across the unfinished role areas and live Google integration are NOT_RUN as complete product acceptance; the latter was intentionally restricted to the local Apps Script fake. No milestone acceptance is claimed.

Once the owning modules land: replace the existing app start-screen adapter with the student home entry, connect the new teacher section lifecycle, build the Admin entry, then rerun the four independent suites.
