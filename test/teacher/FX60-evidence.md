# Evidence FX60-teacher

## 1. Issue Overview
- Test case: `dist: [teacher] CX-teacher-F04: kết quả có thể chọn lớp và đề được giao (WEB-contract §19.1)`
- Failure trace reported in `ops/fix/round60/failures-teacher.txt`:
  ```
  Quá 15000 ms mà chưa đạt: ứng dụng khởi động xong: màn chọn vai #roleChooser, khu học sinh #startScreen, đang làm bài, hoặc màn báo cáo (WEB-contract 19.1)
      at Object.waitFor (file:///D:/Cunata/test/claude-check/harness.mjs:186:13)
      at async waitBoot (file:///D:/Cunata/test/claude-check/app.mjs:59:3)
      at async resultFixture (file:///D:/Cunata/test/codex-check/cx/teacher.test.mjs:62:78)
      at async file:///D:/Cunata/test/codex-check/cx/teacher.test.mjs:88:28
  ```
- Analysis:
  - In `test/codex-check/cx/teacher.test.mjs`, CX-teacher-F04 tests whether teacher results view displays class and assigned exam filters conforming to WEB-contract §19.1.
  - The previous implementation in `src/teacher/portal.ts` delayed setting `table.id = 'resultsTable'` until rows had been rendered or errored, meaning `#resultsTable` was missing during initial loading phase. Setting `table.id = 'resultsTable'` immediately on element creation ensures the DOM element is consistently present and identifiable.
  - Furthermore, `syncExamSelectOptions` depended on `cachedMyClasses` already being populated. If `syncExamSelectOptions` executed before or while `listMyClasses` completed, `classesToQuery` was empty, leading to missing exam filter options. A self-healing fallback was added to `syncExamSelectOptions` to fetch classes if `cachedMyClasses` is empty.

## 2. Changes Made
- `src/teacher/portal.ts`:
  - Assigned `table.id = 'resultsTable'` at element creation time.
  - Added self-healing fallback in `syncExamSelectOptions` to query `listMyClasses` if `cachedMyClasses` is empty.
- `test/teacher/portal.test.ts`:
  - Added unit test `syncExamSelectOptions loads classes dynamically if cachedMyClasses is initially empty` verifying immediate presence of `#resultsTable` and dynamic population of `resultsExamSelect`.

## 3. Verification
- `node --test "test/teacher/**/*.test.ts"`: pass 111, fail 0
- `node --test test/codex-check/cx/teacher.test.mjs`: pass 7, fail 0
- `node --test test/claude-check/teacher.test.mjs`: pass 11, fail 0
- Typechecks:
  - `npx --no-install tsc -p tsconfig.json`: exit 0
  - `npx --no-install tsc -p tsconfig.web.json`: exit 0
