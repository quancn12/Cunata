# LC02 — Kiểm định toàn bộ sản phẩm, vòng 2

- review_id/task_id/worker_id: LC02; reviewer: Codex.
- verified_at: 2026-11-14, khoảng 03:03–03:10, Asia/Bangkok.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; nhánh `main`.
- requirements_version: Shared Product Contract v2.0 (ưu tiên cao nhất); M1-scoring-contract v1.0 toàn văn; READINESS §6, B1-AC01…08/B1-T01…17.
- risk_level: HIGH (scoring và toàn vẹn dữ liệu).
- verdict: **CHANGES_REQUESTED**. Chưa nghiệm thu M1 hoặc toàn sản phẩm; không FULLY_VERIFIED.
- handoff_status: READY_FOR_REVIEW chỉ nói báo cáo đã hoàn thành.

## Snapshot, diff và phạm vi

Đã chạy Git log/status/diff thật. `git log --oneline --all` vẫn chỉ có baseline, không có commit sửa sau LC01. Đối tượng review là HEAD cộng working tree, bao gồm mã untracked; `git diff` riêng không bao quát các file này. Sáu hash domain bên dưới trùng hoàn toàn snapshot LC01. Không có bằng chứng sửa bốn finding LC01 trong mã sản phẩm tại lần kiểm này. Không suy ra tiến độ từ báo cáo của worker.

`git diff --stat`: `ops/m1/tasks.json` (222 dòng thay đổi), `ops/run_tasks.py` (138), `package.json` (10); tổng 346 insertions/24 deletions. Diff package thêm TypeScript 7.0.2, typecheck và đổi test thành glob `test/**/*.test.ts` so với baseline; các thay đổi này đã được LC01 ghi nhận, không thể gọi là diff mới sau LC01. Không có snapshot cũ của toàn bộ file ops/test để chứng minh mọi byte ở đó không đổi.

files_reviewed: toàn bộ mã sản phẩm hiện có `src/domain/{model,rational,shortAnswer,validate,judge,shuffle}.ts`, cấu hình package/tsconfig/lock metadata; assertions liên quan trong 5 bộ `test/domain/*.test.ts`, oracle README và kiểm runtime 5 fixtures; báo cáo LC01 và các hợp đồng nêu trên. Không tìm thấy AGENTS.md trong workspace hoặc ở `D:\AGENTS.md`.

Không có frontend luyện thi, builder, collector, persistence hay importer trong `src/`. `dashboard.html`, `workers.html`, các thư mục `ops/` phục vụ điều phối; không dùng chúng làm bằng chứng tính năng sản phẩm. Báo cáo này không phải kiểm toán bảo mật đầy đủ hệ thống điều phối, cấu hình agent riêng, supply chain hoặc Git history. Không đọc prompt riêng của agent khác.

| File | SHA256 tại kiểm định |
| --- | --- |
| src/domain/judge.ts | 8FD98C77E6F9BBC96029BA5E2D0DB719C61725BA951BE7CE4053C5ACBFF6F23A |
| src/domain/model.ts | 73C013F90751294B69771DF246FD5F2CE1011B93857452659A614C906B71EF76 |
| src/domain/rational.ts | 968D4703852CC0612772BB49CD5C25BF9F30C6F13DF6ADB3D268A30A7C796054 |
| src/domain/shortAnswer.ts | 35A6ED980AB8301EC8161D2B9373E8F3E582FD87534BEAAEB47A22C2F3DF7A6C |
| src/domain/shuffle.ts | B1549978905E9716AD6BB9B9E3499B9F01C80B7D02BF01A3CCF301C82F7C7053 |
| src/domain/validate.ts | 24CFE9852622E05601D1BE1639F3D9936129A35BE36CF2C3DAACCA7CF4C18C91 |

## Findings

### LC02-F01 — BLOCKER — Public scoring engine và DTO vẫn chưa được triển khai

- Liên kết vòng trước: LC01-F01, **OPEN / tái hiện lại**.
- affected_files: `src/domain/index.ts`, `src/domain/examMax.ts`, `src/domain/scoreAttempt.ts`, `src/domain/serialize.ts` không tồn tại; không bịa line cho file thiếu. Yêu cầu tại `docs/contracts/M1-scoring-contract.md` §4.6–4.8.
- VÙNG chịu trách nhiệm: `src/domain`.
- evidence/actual: import cả bốn module đều thất bại `ERR_MODULE_NOT_FOUND`; chỉ có 6 module nền tảng. Không có acceptance suite gọi public API, không có kết quả điểm/max/từng phần/total/engine metadata hoặc DTO roundtrip sản phẩm.
- reproduction_steps: chạy từ repo `node --input-type=module -e "await import('./src/domain/index.ts')"`; thay `index` bằng ba tên module còn lại cũng lỗi. Lần này import index nằm trong bộ tái hiện LC01, ba import còn lại là ba test stdin riêng và đều fail.
- expected: computeExamMax/scoreAttempt/serialize/barrel đúng chữ ký, fail-closed khi đề sai, dùng rational chính xác và không quy về /10.
- impact: consumer chưa thể chấm bài bằng engine sản phẩm; M1 và toàn bộ sản phẩm chưa đủ nghiệm thu. Đây là thiếu implementation, không phải bằng chứng có thuật toán trả điểm sai.
- minimal_fix: hoàn tất M1-B1/B2 và M1-B3 đúng hợp đồng, nối API công khai; không dùng oracle làm engine.
- regression_test: đối chiếu đủ 1.632 fixtures qua scoreAttempt; max 5/10/15/16, N3=0/3/7, BASE 9,75/10/10,25, II k=0…4, exact III và invalid status; permutation/purity/bounds/full=max; version isolation; DTO strict và mutation controls.

### LC02-F02 — MAJOR — Gate typecheck vẫn thất bại: 21 diagnostics

- Liên kết vòng trước: LC01-F02, **OPEN / tái hiện lại**.
- affected_files: `src/domain/rational.ts:103`, `:146`, `:147`; `src/domain/validate.ts:253`; `test/domain/judge.test.ts:143`, `:144`, `:227`; `test/domain/shuffle.test.ts:287`; imports node:* trong 5 file test; `tsconfig.json:8` và `package.json:13` là cấu hình liên quan.
- VÙNG chịu trách nhiệm: `src/domain` (4 diagnostics source), `glue` (test typing/Node declarations/cấu hình).
- evidence/reproduction_steps: chạy thật `npx --no-install tsc -p tsconfig.json`, exit 1; `npx --no-install tsc --version` trả 7.0.2. Không ghi NOT_RUN theo ghi chú môi trường cũ.
- expected: strict typecheck với noUncheckedIndexedAccess hiện hành exit 0.
- actual: TS2345 ở array indexing/regex captures; TS2352 ở cast Record thành Question; TS2591 thiếu declarations node:*; TS2345/TS2322/TS18048 ở test indexing/narrowing. Unit xanh vì Node xóa kiểu trước khi chạy, không thay typecheck.
- impact: không đạt gate kiểm kiểu M1; chưa phải lỗi build web vì không có build web.
- minimal_fix: duyệt for-of hoặc narrow phần tử/captures hợp lệ; map/cast dựa trên cấu trúc được kiểm chứng; sửa typing fixtures và Node declarations trong task có quyền tương ứng. Không tắt strict để che lỗi. Không cài dependency trong LC02.
- regression_test: giữ cả source và tests trong tsconfig; npm test và đúng lệnh typecheck đều exit 0.

### LC02-F03 — MAJOR — Generator tạo snapshot tắt trộn mà validator của chính nó từ chối

- Liên kết vòng trước: LC01-F03, **OPEN / tái hiện lại**, kiểm thêm đủ bốn tổ hợp flags.
- affected_files: `src/domain/shuffle.ts:116–117`, `:251–260`; nguồn xen phần được chấp nhận tại `src/domain/validate.ts:201`.
- VÙNG chịu trách nhiệm: `src/domain`.
- evidence/reproduction_steps: tạo exam hợp lệ có thứ tự III q3 → I q1 → II q2; q1 có options a/b/c/d và key a, q2 có 4 statements boolean. validateExamVersion trả ok=true. Với seed LC02, gọi createPresentationOrder rồi validatePresentationOrder cho đủ 4 tổ hợp flags.
- expected: tắt shuffleQuestions giữ nguồn; snapshot generator của exam hợp lệ phải được validator nhận. Bật shuffleQuestions nhóm I→II→III theo giả thiết kỹ thuật hiện hành.
- actual: flags (false,false) và (false,true) giữ `[q3,q1,q2]` nhưng đều có 2 `SECTION_ORDER_INVALID`; (true,false) và (true,true) trả `[q1,q2,q3]`, issues=[]; ca hai câu LC01 cũng fail lại.
- impact: đường nhận/restore snapshot có validation không dùng được cho đề nguồn xen phần khi tắt trộn. Chưa có browser để chứng minh mất bài thực tế.
- minimal_fix: cho phép thứ tự gốc nguyên vẹn bên cạnh thứ tự đã nhóm phần, giữ nguyên checks hoán vị/ID/options. Không tự reorder khi flag tắt. Nếu muốn bắt nguồn phải nhóm phần, cần owner sửa schema/contract trước.
- regression_test: nguồn III→I→II và I→III→I, 4 tổ hợp flags, generator→validator hợp lệ, false giữ nguồn; thiếu/trùng/foreign ID vẫn bị từ chối. Test hiện tại chỉ dùng nguồn đã nhóm phần nên bỏ sót lỗi.

### LC02-F04 — MINOR — Catch của validator vẫn có thể ném exception khi format lỗi

- Liên kết vòng trước: LC01-F04, **OPEN / tái hiện lại cả hai validator**.
- affected_files: `src/domain/validate.ts:208`, `:383`.
- VÙNG chịu trách nhiệm: `src/domain`.
- evidence/reproduction_steps: `validateExamVersion({get examId(){throw Object.create(null)}})` và `validateAttemptResponses(validExam,{get attemptId(){throw Object.create(null)}})`; cả hai phát sinh TypeError từ String(err). Bộ tái hiện LC01 fail tại exam; bộ stdin riêng LC02 xác nhận attempt cũng fail.
- expected: input unknown được từ chối với `{ok:false,issues:[{code:'TYPE_MISMATCH',...}]}`, không crash theo §4.3.
- actual/impact: exception thoát biên validation. Chỉ chứng minh ở object/accessor JS đặc biệt; JSON thường không chứa getter. Không khẳng định exploit mạng/mất dữ liệu sản phẩm.
- minimal_fix: fallback message hằng hoặc formatter không thể ném, không đọc/chuyển kiểu dữ liệu lỗi không tin cậy ngoài guard.
- regression_test: cả hai validators với getter ném Error thường, null-prototype object, object có toString ném; assert doesNotThrow và mã TYPE_MISMATCH. Test hiện có chỉ ném Error thường.

## checks_run

Môi trường chạy thật: Windows PowerShell, cwd D:\Cunata, Node v24.14.0, npm 11.9.0, TypeScript 7.0.2, Python 3.11.0. Artifact là báo cáo này, phụ lục tái hiện LC01 và output trực tiếp của phiên; không tạo log ngoài scope. Không cài package, không commit/deploy.

| Lệnh/check | Exit | Kết quả trong LC02 |
| --- | ---: | --- |
| git status/log/rev-parse/diff, inventory src/test | 0 | Một baseline; src/test untracked; không có commit sửa sau review trước. |
| Get-FileHash src/domain/*.ts -Algorithm SHA256 | 0 | 6/6 hash trùng LC01. |
| `npm test` | 0 | **120 pass, 0 fail**, 27 suites, 0 skipped/cancelled/todo; duration 218.0206 ms. II exhaustive 1.296 vectors là một test, không cộng vào test count. |
| `npx --no-install tsc -p tsconfig.json` | 1 | **FAIL**, 21 diagnostics, có compiler thật. |
| `npx --no-install tsc --version` | 0 | 7.0.2. |
| `python -B test/oracle/oracle.py --check` | 0 | 11 pass/0 fail/0 skip; 1.632 cases/5 fixtures; 5.849 maxima configs; 9 negative controls; seed 20261114; duration script 1.1503 s. Chỉ tự kiểm oracle, không chứng minh engine đã đạt. |
| Trích nguyên khối JS phụ lục LC01 → `node --input-type=module` | 1 | **4 tests: 1 pass/3 fail**, 60.5971 ms. Fail public API/F03/F04; pass schema tất cả fixtures + judge I/II totals và exact judge III. |
| Stdin LC02: attempt getter + import examMax/scoreAttempt/serialize | 1 | **4 tests: 0 pass/4 fail**, 7.4031 ms; xác nhận F01/F04 độc lập. |
| Stdin LC02: nguồn III→I→II, 4 tổ hợp flags | 0 | Probe in kết quả: 2 tổ hợp tắt trộn bị từ chối, 2 bật trộn hợp lệ. Exit 0 của probe không có nghĩa cả 4 trường hợp PASS. |
| rg forbidden APIs/secret patterns trong src + test/domain | 0 | Không thấy mẫu I/O/network/parseFloat/secret đã quét trong src; Math.random/Date.now chỉ ở test chặn API. Đây không phải full secret/security audit. |
| Build web | — | **NOT_RUN / NOT_IMPLEMENTED**: package chỉ có test/typecheck, không build script hoặc frontend luyện thi/build config; không tạo build giả. |
| Lint, browser/E2E, IME/mobile/a11y/performance, collector, importer | — | **NOT_RUN**: chưa có implementation/setup tương ứng. |

Tái chạy bộ bổ sung LC01 mà không tạo file (PowerShell):

```powershell
$report = Get-Content docs/reviews/LOOP-01-codex.md -Raw -Encoding UTF8
$body = [regex]::Match($report, "(?s)@'\r?\n(.*?)\r?\n'@ \| node --input-type=module").Groups[1].Value
$body | node --input-type=module
```

Tái hiện độc lập attempt catch: dùng validExam theo §3 của contract và gọi biểu thức ở F04; bao bằng assert.doesNotThrow trong node:test sẽ fail. Tái hiện ba import thiếu bằng lệnh import ở F01, đổi tên module. Các bước này không cần file/dependency mới.

## Traceability và coverage_gaps

| Tiêu chí | Trạng thái và giới hạn |
| --- | --- |
| B1-AC01…03 | PARTIAL: rational/judge/charset hiện có qua unit và fixture probes; engine/maxima/status/tổng/DTO còn thiếu F01. |
| B1-AC04 | PARTIAL: stable IDs/schema có; version isolation, serialization kết quả và snapshot lưu trữ chưa có. |
| B1-AC05 | FAIL F03; permutation/flags hiện có tests trên nguồn nhóm phần; chưa thể kiểm score invariance hoặc reload thật. |
| B1-AC06 | FAIL F04; schema thường chạy được, giới hạn 1.000 còn tạm; chưa có scoreAttempt fail-closed. |
| B1-AC07 | FAIL: F02 và không có public acceptance/mutation tests engine. |
| B1-AC08 | Báo cáo có evidence/limitations; chưa có nghiệm thu milestone hoặc tích hợp hoàn tất. |
| B1-T01…06 | Correctness/charset/schema được kiểm; engine points/status III invalid chưa có; unit raw không thay kiểm IME/paste/mobile. |
| B1-T07…10 | Rational unit và oracle đạt; computeExamMax sản phẩm NOT_IMPLEMENTED nên không nhận đạt các ca maxima/counts của engine. |
| B1-T11…12 | Schema/ID và shuffle có kiểm, F03/F04 mở; chưa kiểm điểm sau trộn qua API công khai. |
| B1-T13…15 | DTO/version isolation/property total/max của engine NOT_IMPLEMENTED; random fixtures chỉ chứng minh oracle và judge/schema probes. |
| B1-T16 | DEFERRED: report/UI chưa có; policy hiển thị chưa được duyệt. |
| B1-T17 | 9 negative controls oracle không phải mutation suite engine; engine mutation NOT_RUN. |

Chưa kiểm được UI→domain→persistence→collector→report vì chỉ domain nền tảng tồn tại. Không có browser evidence cho offline shell, refresh/back/forward giữ shuffle, deadline/background, autosubmit, double-submit, hai tab/stale final, migration/quota, receipt/idempotency/CORS. Không có importer corpus chạy thật, renderer toán/rich-text, test 2–3 học sinh đồng thời. Không đo coverage phần trăm/benchmark production; không chứng nhận không có mọi secret/lỗ hổng. Working tree dùng chung có thể thay đổi tiếp; kết luận gắn hash trên, không gắn mặc định với mọi thay đổi về sau.

## Lộ trình còn thiếu theo ưu tiên

1. **P0 / M1:** hoàn tất engine/maxima/barrel/DTO/public acceptance (F01); sửa F02/F03/F04. Gate unit + strict types + oracle differential + mutation/version/permutation/purity; review lại snapshot có thay đổi thực.
2. **P1 / M2 làm bài:** UI tiếng Việt desktop/mobile ba phần; entry/nickname không xác thực; attempt/version/snapshot trộn cố định; timer deadline, nộp/autosubmit; local persistence, refresh/offline restore, quota/migration/hai tab và chống stale/double submit.
3. **P1 / M2 kết quả:** đạt/tối đa từng phần và tổng kể cả 12/15, 11/16; trạng thái, thời gian, câu trả lời, đáp án/lời giải theo chính sách công bố; tải report offline HTML/PDF sau quyết định công nghệ; giữ rational gốc.
4. **P2 / M3 giáo viên:** bank phân loại môn→lớp→chủ đề→bài→mức độ; reusable versioned questions, provenance; custom builder bật/tắt phần, thời gian/lượt/trộn/lời giải; publish snapshot, export/import/backup. Không dùng URL bí mật làm phân quyền.
5. **P2 / M4 thu kết quả:** dịch vụ được owner duyệt và Google integration thật; trusted grading khi cần bảo mật; receipt, local_saved/queued/sending/server_confirmed/failed; idempotency/retry/backoff, CORS, privacy/xóa/xuất/backup; test lost-response/readback.
6. **P3 / M5 importer:** DOCX/PDF→IR→preview/sửa→confirm→publish; text/bảng/hình/OMML/LaTeX, scan/OCR tùy nhu cầu, flags/confidence/provenance, missing-key không đoán; file lỗi/quá lớn/external relationships và resource limits.
7. **P3 / mẫu chuẩn THPT:** registry theo môn/năm/văn bản đã kiểm chứng và được duyệt; không gọi custom-v1 là chuẩn chính thức.
8. **P4 / M6 hoàn thiện:** build/lint/E2E/IME/keyboard/AT/contrast/zoom/mobile/performance/security thực; rollback/changelog/owner acceptance. Gate scoring và integrity phải áp dụng ngay từng milestone.

## Quyết định còn mở và hành động đề nghị

Không thiếu quyết định nghiệp vụ để hoàn tất **review LC02** hay sửa các lỗi kỹ thuật trên; handoff không phải NEED_DECISION. Những mục hợp đồng để mở dưới đây mang trạng thái **NEED_DECISION khi triển khai tính năng liên quan**, chưa được reviewer chốt và không chặn việc hoàn tất M1:

| Mục | 2–3 phương án cần owner chọn |
| --- | --- |
| Grammar III | Giữ charset/length policy v1; hoặc policy ID mới với grammar chặt và compatibility. |
| Điểm hiển thị | Phân số chính xác; hoặc decimal với digits/rounding được duyệt, giữ số gốc. |
| Limit câu | Duyệt 1.000; hoặc limit khác sau đo payload/hiệu năng. |
| Nhóm phần | Giữ nguồn khi tắt trộn và cho validator nhận nguồn; hoặc yêu cầu nguồn nhóm phần bằng sửa schema/contract được duyệt. |
| Mẫu chuẩn | Tiếp tục custom; hoặc bổ sung ruleSet riêng đã kiểm chứng theo môn/năm. |
| Collector/hosting | Workflow private/local; Apps Script đã kiểm integration; hoặc serverless trung gian sau duyệt quyền/chi phí. |

recommended_action: giao đúng vùng hoàn tất M1 và sửa bốn finding mở; chạy lại khi có code/hash mới. Không nghiệm thu sản phẩm dựa vào 120 tests xanh. Compiler hiện có khác ghi chú môi trường cũ của contract; không suy ra dependency đã được owner duyệt chỉ từ manifest.

privacy_notes: chỉ kết quả kỹ thuật; không nội dung hồ sơ riêng, credentials hoặc dữ liệu học sinh. LC02 chỉ tạo báo cáo này; không sửa code, cài dependency, commit hoặc deploy. tools_research: NOT_REQUESTED.
