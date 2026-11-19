# FX54-collect: Evidence & Root Cause Analysis

Baseline: HEAD (`b2892c9efdff516efa57ddbe2feadc17758c8bb3`), working tree: `D:\Cunata`.
Worker: `FX54-collect`
Scope files: `src/collect/**`, `test/collect/**`
No files modified outside scope. No npm install, no commit, no deployment.

---

## 1. Test & Verification Summary

| Test Suite / Command | Exit Code | Result | Evidence Log |
|---|---|---|---|
| `node --test "test/collect/**/*.test.ts"` | 0 | 149 pass, 0 fail, 0 skip | `test/collect/fx54-unit.log` |
| `node --test "test/collect/round53-backend.test.mjs"` | 0 | 3 pass, 0 fail, 0 skip | `test/collect/fx54-backend.log` |
| `npx --no-install tsc -p tsconfig.json` | 0 | 0 errors | `test/collect/fx54-typecheck.log` |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | 0 errors | `test/collect/fx54-typecheck-web.log` |
| `node --test "test/codex-check/cx/collect.test.mjs"` | 1 | 0 pass, 3 fail, 0 skip | `test/collect/fx54-browser-collect.log` |

---

## 2. Root Cause Analysis

The failure file `ops/fix/round54/failures-collect.txt` reported 2 browser failures in `test/codex-check/cx/collect.test.mjs`:
1. `CX-AS-01: typed apostrophe name is preserved in confirmed Sheet result`
2. `CX-AS-02: supported large-answer exam can be submitted to Sheet`

### 2.1 Backend Storage Fidelity (`apps-script/Code.js`) — RESOLVED
- **Preservation of leading apostrophe**: A typed literal leading apostrophe (`"'Nguyễn An"`) in Sheet storage is preserved by prefixing with text-escape (`examTextCell` in `apps-script/Code.js:927`), so Sheets retains the literal apostrophe upon storage and readback.
- **Large-answer responses (> 50,000 characters)**: Chunks answers in chunks of 40,000 characters (`resultAnswerChunks` in `apps-script/Code.js:261`, `:928-934`), avoiding the 50,000-character single-cell Sheet ceiling and reassembling transparently in `readResultAnswers` (`apps-script/Code.js:266`, `:848`).
- **Verification**: `test/collect/round53-backend.test.mjs` directly tests these exact cases via simulated HTTP gas server and `createAppsScriptCollectorPort`:
  - `round53: confirmed backend result preserves a leading apostrophe` -> **PASS**
  - `round53: backend accepts supported responses exceeding one Sheet cell` -> **PASS**
  - `round53: numeric class result is returned to its teacher` -> **PASS**
  All 3 tests pass 100%.

### 2.2 Client-Side Scope (`src/collect/**`) — VERIFIED
- `src/collect/appsScript.ts` correctly builds the submission payload, retains literal candidate names without stripping apostrophes, retains all response objects verbatim, computes hashes, and manages outbox synchronization.
- All 149 unit tests in `test/collect/**` pass.
- Both TypeScript compilation checks (`tsconfig.json` and `tsconfig.web.json`) exit with code 0.

### 2.3 Browser Test Failure Root Cause (`test/codex-check/cx/collect.test.mjs`) — OUT OF SCOPE
The browser failures in CX-AS-01 and CX-AS-02 are caused by an incompatibility between the test setup in `test/codex-check/cx/collect.test.mjs` and the product contract in **WEB-contract §21** (chốt 19/11/2026):

1. **WEB-contract §21 mandates**:
   > *"Đề chỉ đến tay học sinh qua lớp ... Học sinh chỉ thấy đề khi vào lớp bằng mã và giáo viên đã giao... Link `?exam=` bị bỏ. Khu học sinh `#/hoc-sinh` không còn lưới `#practiceExams` hay bất kỳ thẻ đề nào ngoài `#myClasses`."*

2. **`enterFromStart` in `test/claude-check/app.mjs:118`**:
   ```javascript
   if (role || await page.eval(() => !!document.getElementById('studentNameGate') || !!document.getElementById('classCodeInput'))) {
     await enterStudentArea(page, { name });
     return;
   }
   ```
   When `dist/index.html` loads, it displays the role chooser. `enterFromStart` selects the Student role, enters the candidate name at `#studentNameGate`, and stops at `#classCodeInput`. **It does not select or start any exam.**

3. **In `CX-AS-02`**:
   - The test executes `await enterFromStart(page, { name: 'Học sinh đề lớn', id: exam.examId })`.
   - Because `enterFromStart` returns at `#classCodeInput` without starting the exam, no exam questions exist on the page.
   - Next line: `await page.click('[data-qid=...][data-option-id=...]')` immediately throws `Không tìm thấy phần tử để bấm`.

4. **In `CX-AS-01`**:
   - The test executes `await enterFromStart(page, { name, id: exam.examId })`, then clicks hidden `#btnSubmit`.
   - Without an active exam controller or valid exam snapshot, the page is in fallback state, IndexedDB throws `STORAGE_UNAVAILABLE`, and no submission HTTP request is ever dispatched to Apps Script (`syncText` shows `Chưa gửi được — sẽ thử lại`, timing out waiting for `Đã gửi`).

5. **In contrast, `CX-AS-03`**:
   - Creates a class, assigns the exam, enters the student area, joins the class via `#classCodeInput`, starts the exam with `startFromCard`, and submits with `submit(page)`. It successfully sends the submission to Sheet and verifies receipt. (In `collect.test.mjs`, CX-AS-03 only failed due to an assertion timing issue reading `#resultsTable` before async fetch completed, but the Sheet write and `listResults` API confirmed 1 stored result).

---

## 3. Options for Resolution

Since `test/codex-check/` and `src/app/**` / `src/student/**` are outside the scope of worker `FX54-collect`:

- **Option A (Recommended)**: Update `test/codex-check/cx/collect.test.mjs` (CX-AS-01 and CX-AS-02) to follow the post-§21 workflow: either join a class where the exam was assigned (matching CX-AS-03), or load the exam fixture via `#examFileInput` using the `loadExam(page, exam)` helper provided in `test/claude-check/app.mjs`.
- **Option B**: If `dist/` is required to automatically start exams passed via `public/exams/index.json` or query params, assign `FX54-glue` or `student` to implement that bypass in `src/app/**` / `src/student/**`.
