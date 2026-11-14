# LC15 — Kiểm định toàn bộ sản phẩm, vòng 15

- review_id/task_id/worker_id: LC15; reviewer: Codex; verified_at: 2026-11-14 Asia/Bangkok; risk_level: HIGH.
- base_commit/head_commit: `f2447ae787272808f84d9d894cdded8e7cff3d2c`; branch: main.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6, B1-AC01…08/B1-T01…17.
- verdict: **CHANGES_REQUESTED**; chưa nghiệm thu sản phẩm.
- handoff_status: **NEED_DECISION** cho chính sách ở cuối báo cáo. Sửa F01–F05 đã có invariant rõ, không cần chờ các quyết định đó.
- findings_summary: **2 BLOCKER, 1 CRITICAL, 2 MAJOR**, OPEN / VERIFIED lại trong LC15. Không phát hiện lỗi domain mới qua các ca đã chạy.

## Phạm vi, lịch sử và snapshot

Đã đọc toàn bộ hai hợp đồng bắt buộc, skill được chỉ định, LC14 và READINESS §6. Không thấy AGENTS.md trong workspace hoặc D:\AGENTS.md. Không đọc prompt riêng của worker khác. Chỉ tạo `docs/reviews/LOOP-15-codex.md`; không sửa code/test/config, install dependency, tạo branch/worktree, commit/deploy. Runner chạy stdin/in-memory, không ghi test/log ngoài scope.

`git log` vẫn chỉ có HEAD f2447ae và baseline 2ee84e3. LC14 chốt cùng HEAD. `git diff HEAD -- src test index.html styles public scripts package.json package-lock.json tsconfig.json tsconfig.web.json` rỗng. **Không có delta sản phẩm từ review trước**. Các findings được thực thi lại trên source hiện tại, không chỉ kế thừa verdict.

Working tree chung: preflight có thay đổi tracked tại ops/OVERNIGHT_STATUS.md, ops/dashboard/dashboard_data.js, ops/forever.stdout.txt, ops/loop/wave1.out.txt, ops/overnight.log, workers.html và nhiều file điều phối/review untracked. Không sửa/revert chúng. Kết luận áp dụng snapshot sản phẩm đã kiểm tra, không áp dụng thay đổi xuất hiện sau đó.

files_reviewed: rà đường chạy `src/domain/*.ts` (models/rational/shortAnswer/validation/judge/shuffle/maxima/scoring/exports/DTO); index.html embedded/fetch đề → input → localStorage/restore/timer → submit → report/print; scripts/build.js, package/lockfile, hai tsconfigs, public sample/SVG, CSS responsive/focus/print; assertions domain/acceptance/e2e và fixtures oracle. Ops/dashboard/workers chỉ inventory/diff tổng quan, không chứng nhận phần điều phối như sản phẩm riêng. Review toàn sản phẩm theo đường chạy không đồng nghĩa mọi dòng hoặc mọi hành vi browser đã được xác minh.

| File | SHA256 LC15, khớp LC14 |
| --- | --- |
| index.html | 4A81BF50725B4AB913ECF0D296E905B352686D9046491381FB5E940CC7F0EAF1 |
| src/domain/examMax.ts | BE74CEAC6916536C79742F4B7858549749B86BEAE94BDCF7E41634B8E9685BE1 |
| src/domain/scoreAttempt.ts | E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE |
| src/domain/serialize.ts | 850EBA8D6620BD2B6DE02E034226ECB499E9ED4C0EDB18C2D4099711ADB855A8 |
| test/e2e/demoFlow.test.ts | 64A7AD72C702D72E03031D40AC58265EC7E012EC123A5184F2B97DDE4608B523 |

## Findings

### LC15-F01 — BLOCKER — Scorer web hardcode sai điểm/max khi cấu hình đề thay đổi

- affected_files: `index.html:813–919`, đặc biệt `883`, `907–915`; caller `928`, fetch `408–413`, nhãn `533`, `546`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC14-F01; OPEN / VERIFIED.
- evidence/reproduction_steps: runner VM thực thi source hiện tại, thay currentExam bằng một câu III key `1,5`, responses `{q:'1,5'}`, gọi scoreAttemptLocally(). F01 assertion total=10 fail: actual=3.5. Đây là phép thử ranh giới JSON exam, không khẳng định đã có builder UI.
- expected: đề custom chỉ một III đúng = **10/10**; maxI=maxII=0, maxIII=10; số học rational.
- actual: **3.5/10**, maxima hardcode I=1, II=2, III=7; dùng number, không gọi scoring API domain. Fetch chỉ kiểm mảng questions, không validate schema/rules/key.
- impact: chấm/report sai khi đổi cấu hình; không hỗ trợ đúng max5/15/16 hoặc trọng số III phân số lặp. Sample 4I/2II/2III chỉ tình cờ khớp constants.
- minimal_fix: adapter web gọi validateExamVersion/scoreAttempt, map responses theo ID; giữ rational/DTO tới render, bỏ constants maxima/nhãn, không ép /10.
- regression_test: submit→report cho golden max5/10/15/16, N3=0/3/7, chỉ I/II/III, full/blank/mixed, schema/key lỗi; so total và từng section với oracle.

### LC15-F02 — BLOCKER — Input và chấm web tự sửa raw trả lời ngắn

- affected_files: `index.html:663`, `677–684`, `880–900`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC14-F02; OPEN / VERIFIED.
- evidence/reproduction_steps: F02a đặt raw sample q08 thành ` 1,5`, gọi scorer; actual3.5 expected0. F02b trích callback input thật, đưa `e.target.value='1.5'`; callback đổi thành chuỗi `15`. Cả hai assertion fail. F02a kiểm raw restored/scorer, không giả định whitespace đi qua được handler hiện tại.
- expected: giữ nguyên raw, exact equality; invalid charset/length → invalid/0 điểm, báo lỗi; không trim/normalize/cắt âm thầm.
- actual: callback replace ngoài charset rồi slice4; scorer trim trước so khớp. `1.5` có thể trở thành đáp án đúng `15`.
- impact: vi phạm invariant CRITICAL phần III trên đường nhập/lưu/chấm. Re-render mỗi input còn có rủi ro focus/caret/composition, chưa browser xác minh.
- minimal_fix: bỏ replace/slice/trim; lưu raw, dùng checkShortAnswer và domain scorer; báo lỗi, cập nhật preview không phá composition.
- regression_test: input→save→reload→submit→report giữ `1,5`/`1,50`/`1.5`, `-0,5`, space/NBSP/newline, U+2212/fullwidth/emoji/paste>4; mobile/IME thật.

### LC15-F03 — CRITICAL — Tab cũ ghi đè bài đã nộp

- affected_files: `index.html:352–360`, `438–456`, `485–486`, `924–930`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC14-F03; OPEN / VERIFIED.
- evidence/reproduction_steps: F03 tạo hai VM dùng chung storage Map; A.submitExam() ghi submitted=true; B.saveLocalState() ghi đè submitted=false/scoreResult=null. Assertion final=true fail.
- expected: stale save không đảo ngược final; restore đúng attempt/version/order snapshot.
- actual: key chung, không attemptId/examVersionId/revision/order snapshot; Object.assign restore không schema/version check; kết quả nộp bị thay bằng state chưa nộp.
- impact: mất kết quả đã nộp, có thể mở lại editable hoặc trộn state giữa phiên bản đề. Đây là kiểm logic storage, chưa browser concurrency E2E.
- minimal_fix: stable attempt/version/revision và snapshot; final transition chống stale writes bằng transaction/locking phù hợp storage được duyệt; tab stale chuyển conflict/read-only. Read-then-write đơn giản không bảo đảm atomic race.
- regression_test: hai tab edit/nộp/timeout, stale autosave sau final, reload/version/migration/quota; final không ghi lùi, chỉ một lần final.

### LC15-F04 — MAJOR — Timer đếm callback thay vì deadline

- affected_files: `index.html:356`, `450–456`, `466–488`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC14-F04; OPEN / VERIFIED.
- evidence/reproduction_steps: F04a bắt đầu clock0, tiến clock một giờ, gọi một interval callback; submitted=false, remaining2999. F04b save ở clock0 rồi restore/start ở clock3600000 vẫn submitted=false. Hai assertion autosubmit=true fail.
- expected: persist startedAt/deadline/duration; restore/resume quá hạn tự nộp ngay.
- actual: chỉ persist remainingSeconds và decrement mỗi callback; thời gian đóng trang/background không tính đủ.
- impact: kéo dài giờ thi trong hoạt động thông thường; khác với giới hạn chống chỉnh đồng hồ vốn offline/no-login không thể bảo đảm tuyệt đối.
- minimal_fix: deadline và kiểm load/resume/visibility/trước submit; timeout/manual dùng cùng final transition idempotent.
- regression_test: close/reopen quá hạn, background/sleep/offline, clock shift, timeout/manual cạnh tranh; một final.

### LC15-F05 — MAJOR — Ghi local thất bại vẫn báo đã lưu

- affected_files: `index.html:64`, `438–446`; caller `681–684`, `925–930`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC14-F05; OPEN / VERIFIED.
- evidence/reproduction_steps: F05 save thành công, đổi responses.q='new', ép setItem ném QuotaExceededError, gọi saveLocalState(). Durable record chưa có `new` nhưng badge vẫn **Đã lưu cục bộ**; assertion badge phải đổi fail. Markup cũng khởi tạo trạng thái thành công trước lần ghi đầu.
- expected: local_saved chỉ đúng revision ghi thành công; catch hiện failed/unsaved và cách giữ/retry/export dữ liệu RAM.
- actual: catch chỉ console.warn; badge giữ thành công của revision cũ; submit vẫn chuyển report dù ghi lỗi.
- impact: học sinh đóng/reload có thể mất thay đổi hoặc lần nộp dù UI báo đã lưu. Độc lập với F03, nơi stale write thành công.
- minimal_fix: trạng thái lưu gắn revision; khởi tạo chưa lưu; success sau setItem thành công, catch failed rõ ràng, retry/recovery. Không tự chọn storage mới thay owner.
- regression_test: first-write denied, success→quota/security error, submit write fail, retry success, reload record cũ; badge khớp durable revision.

## checks_run — thực chạy LC15

Environment: Windows/PowerShell, D:\Cunata; Node v24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Log artifact: transcript công cụ LC15; không tạo log file ngoài scope. Không cộng số fixture/vector vào số node:test tests.

| Command/check | Exit | Kết quả thực / giới hạn |
| --- | ---: | --- |
| Git log/status/rev-parse/diff + SHA256 | 0 | main; cùng HEAD LC14; product paths không có delta; hashes khớp. |
| `npm test` | **0** | **173 pass / 0 fail**, 34 suites; 0 skip/cancel/todo; duration352.6969ms. |
| `npx --no-install tsc -p tsconfig.json` | **0** | Không diagnostics; wall1.5749s. tsc có sẵn, không dùng NOT_RUN từ ghi chú hợp đồng cũ. |
| `npx --no-install tsc -p tsconfig.web.json` | **0** | Không diagnostics; wall1.3587s; config không kiểm JS inline. |
| `node scripts/build.js` | **0** | 4 assets tồn tại, sample8 câu hợp schema, link CSS đúng; wall0.1296s. Script asset/schema read-only, không compile/bundle/browser; package không có npm build script. |
| `python -B test/oracle/oracle.py --check` | **0** | **11 pass / 0 fail**; 1632 cases/5 files, 5849 maxima configs, 9 negative controls; seed20261114; duration_s1.0635. Oracle tự kiểm, không thay SUT test. |
| Node stdin web runner mô tả dưới | **1** | **0 pass / 7 fail**, duration22.996ms; F01/F02a/F02b/F03/F04a/F04b/F05. Assertion yêu cầu đúng đều đỏ; VM với DOM/storage/timer stub, không browser E2E. |
| Node stdin public API vs oracle + DTO/permutations/bounds/non-mutation | **0** | **2 pass / 0 fail**, duration195.5299ms; fixture test189.891ms; 1632 fixtures, seed LC15-20261114; fraction/DTO exception test2.5362ms. |
| Browser/mobile/IME/keyboard/AT/axe/Lighthouse/screenshot/trace | — | **NOT_RUN**: vòng này static + Node VM, chưa chạy browser lane. |
| Lint/full SAST/secret-history/dependency audit | — | **NOT_RUN** chuyên biệt; không có lint script; search nguồn không là chứng nhận bảo mật. |
| Google collector/CORS/readback; DOCX/PDF importer | — | **NOT_RUN / NOT_IMPLEMENTED** trong source sản phẩm hiện có. |

Public API runner import src/domain/index.ts, đọc 5 fixture JSON, gọi scoreAttempt, so exact fraction total/max và từng section score/max với expected độc lập. Mỗi case kiểm DTO JSON roundtrip deepEqual, bounds, sum(question.points)=total và input không mutate. Tạo/validate order seed LC15, áp questionOrder và optionOrder riêng từng câu I, đảo responses/statement answers; total/max và kết quả từng câu theo ID bất biến. Test thứ hai kiểm fraction có LF/CR/CRLF/U+2028 cuối bị reject; DTO ruleSetId `{toString:null}` và throwing Proxy vẫn ném SyntaxError. Không full mutation trên candidate.

### Lệnh tái hiện web runner đã chạy (không tạo file test)

Đoạn js được đọc từ harness LC14 đã xem lại, thực thi trên source index.html LC15. Tên LC14 trong stub là dữ liệu thử không ảnh hưởng logic. Exit1/7fail là bằng chứng vi phạm yêu cầu, không phải bảy ca đạt. Lệnh đọc file review local có sẵn, không chạy nội dung prompt riêng nào.

```powershell
@'
import fs from 'node:fs';
const md=fs.readFileSync('docs/reviews/LOOP-14-codex.md','utf8');
const code=md.match(/```js\r?\n([\s\S]*?)```/)[1];
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
'@ | node --input-type=module
exit $LASTEXITCODE
```

Hai attempt tạo báo cáo trước bản này thất bại trước ghi: PowerShell parser do here-string lồng nhau (exit1), rồi Python ValueError do anchor Unicode qua pipe (exit1). Đã chuyển sang apply_patch UTF-8. Đây là lỗi thao tác harness, không phải lỗi sản phẩm.

## coverage_gaps và traceability

| Yêu cầu | Bằng chứng | Gap / giới hạn |
| --- | --- | --- |
| B1-AC01/02/03; T01–09 | 173 tests, II exhaustive1296 vectors; oracle/API1632, exact rational | Domain đạt các ca đã chạy; web vi phạm F01/F02; display policy chưa duyệt. |
| B1-AC04/05; T11–15 | ID validation/shuffle; API permutations/DTO/bounds/non-mutation | Web thiếu attempt/version/order snapshot; bank immutable versions/migrations chưa triển khai. |
| B1-AC06; T10/13 | Negative schema/unit tests, DTO exception regression | Chưa vét cạn resource abuse/getter đổi giá trị/response hoặc phân số cực lớn; không chứng nhận mọi unknown input. |
| B1-AC07/08; T16/17 | Checks thật, delta/hash và limitations | Chưa full candidate mutation/lint/browser integration/owner acceptance/rollback milestone. |
| Student/offline/timer/report | VM thực thi source; F03–F05 | Không browser quota/concurrency/offline cold-start/print artifact; VM không thay browser checks. |
| UX/a11y/security/math | Đọc CSS/handlers/renderMathText/innerHTML | Chưa mobile/keyboard/contrast/focus/IME/math layout; không screenshot/trace thật. |

test/e2e/demoFlow.test.ts đọc assets/HTML và tự tính constants, không chạy input→submit→report. Typecheck chỉ kiểm TS theo config; build không kiểm JavaScript inline. Ba check xanh vẫn cùng tồn tại với repro web đỏ.

renderMathText/innerHTML chưa escape nội dung câu hỏi/answer/lời giải: rủi ro khi nối nguồn không tin cậy. Nguồn hiện là sample tĩnh và local state; chưa chứng minh exploit qua importer/bank chưa tồn tại, không gắn finding exploit đã xác minh. Answer key ở client nên chỉ phù hợp luyện tập; chưa có mô hình trusted grading/giấu key cho kiểm tra bảo mật. Không collector để kiểm CORS/receipt/dedupe. Không tuyên bố không có secret chỉ từ search giới hạn.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0 — Chấm/report web qua domain:** sửa F01/F02, validate rules/schema, giữ raw/rational; max5/15/16 và phân số lặp; regression thực thi frontend.
2. **P0 — Độ bền bài làm/thời hạn:** sửa F03–F05; attempt/version/order snapshot, final idempotent, conflict nhiều tab, deadline, quota/recovery/migration; offline/reload browser thật.
3. **P1 — Luồng học sinh/báo cáo:** chọn đề/nickname; cấu hình thời gian/lượt/trộn hai cờ độc lập/lời giải; startedAt/endedAt; tải report HTML/PDF xem offline, policy công bố key. Hiện chỉ window.print, chưa có bản tải report được kiểm định.
4. **P1 — Soạn đề/ngân hàng:** môn→lớp→chủ đề→bài→mức độ, reuse, immutable QuestionVersion/ExamVersion, preview/publish/export/import/backup/delete; local/private không giả phân quyền khi không login.
5. **P1 — Thu kết quả theo phương án được duyệt:** Google/Apps Script/gateway, receipt/readback/CORS thật, outbox/retry giới hạn/backoff/dedupe, local_saved/queued/sending/server_confirmed/failed; trusted grading khi cần. Backend/collector chưa triển khai.
6. **P2 — Import DOCX/PDF:** file→IR→preview/chỉnh→confirm→export; math/table/image/OMML/provenance, text/scan/OCR uncertainty, không đoán key; resource limits/corpus regression. Chưa implementation.
7. **P2 — Mẫu chuẩn THPT:** registry môn/năm/nguồn quy định đã kiểm chứng và duyệt; không gọi custom-v1 là mẫu chuẩn.
8. **P2 — Hoàn thiện/nghiệm thu:** mobile/IME/keyboard/a11y, math/layout/print, privacy/export/delete guidance, security/performance, browser E2E/CI/changelog/rollback và owner acceptance. Class/assignment giai đoạn sau.

## NEED_DECISION — chưa tự chốt chính sách

Chưa có bằng chứng phê duyệt trong tài liệu bắt buộc. Các quyết định này không hợp thức hóa F01–F05.

| Quyết định | 2–3 phương án cho owner | Phần bị chặn |
| --- | --- | --- |
| Grammar III | A: giữ sa-charset-v1 chỉ charset/length; B: grammar hẹp với policy version mới; C: grammar theo preset/version được duyệt | Validator mở rộng, không thay exact matching bài cũ. |
| Hiển thị điểm | A: phân số exact; B: decimal với digits/mode owner chọn, giữ fraction nguồn; C: decimal xấp xỉ kèm fraction | Chốt renderer/report, không round scoring. |
| Limit/grouping | A: duyệt tạm1000/group I→II→III khi trộn, tắt giữ gốc; B: limit/grouping khác kèm version/tests | Chính sách chính thức; hiện là giả thiết hợp đồng kỹ thuật. |
| Storage/collector/report | A: local practice + HTML; B: collector được duyệt quyền/retention/CORS/authority + HTML; C: local practice + PDF sau đánh giá công nghệ | Hạ tầng/chi phí/production; sample localStorage không chứng minh owner approval. |

assumptions: NONE mới; giữ giả thiết tạm trong hợp đồng ở trạng thái chờ duyệt. recommended_action: giao **glue** sửa F01–F05, regression fail-base/pass-fix; giữ domain/DTO/typecheck đã đạt; review bytes thay đổi và browser integration trước nghiệm thu. tools_research: không giao nghiên cứu/cài tool mới. privacy_notes: chỉ kết quả kỹ thuật/dữ liệu thử; không chép chỉ thị riêng.
