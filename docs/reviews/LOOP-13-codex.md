# LC13 — Kiểm định toàn bộ sản phẩm, vòng 13

- review_id/task_id/worker_id: LC13; reviewer: Codex.
- verified_at: 2026-11-14, Asia/Bangkok.
- base_commit lúc bắt đầu: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; head_commit lúc chốt: `f2447ae787272808f84d9d894cdded8e7cff3d2c`; branch: `main`; review working tree chung, hash product giữ nguyên khi commit được tạo bởi tiến trình khác.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6, B1-AC01…08/B1-T01…17.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo, không phải nghiệm thu sản phẩm.
- findings_summary: **2 BLOCKER, 1 CRITICAL, 1 MAJOR**, OPEN / VERIFIED; tiếp nối LC12-F01…F04, đã chạy lại repro. Không phát hiện lỗi mới được chứng minh ở domain trong các checks vòng này.

## Phạm vi, lịch sử và snapshot

Đọc toàn bộ hai hợp đồng bắt buộc, review LC12 và READINESS §6. Inventory không tìm thấy AGENTS.md trong workspace; D:\AGENTS.md cũng không tồn tại. Chỉ tạo báo cáo này, không sửa source/test/config, không cài dependency, không branch/worktree, commit hoặc deploy. Các probes chạy stdin, không tạo file ngoài scope.

Lúc preflight, git log chỉ có baseline `2ee84e3`; chưa có commit mới so với LC12. Tracked diff gồm ops/m1/tasks.json, ops/run_tasks.py, package.json, 346 insertions/24 deletions. Lúc preflight src/, test/, index.html, assets và lockfile còn untracked, nên không thể dùng git diff HEAD làm delta implementation giữa hai vòng. Đối chiếu hash LC12 và đọc source hiện tại: scorer, maxima, serialize, public index, frontend và test/e2e giữ nguyên hash dưới đây; lỗi cũ không có bằng chứng đã sửa. Không quy tác giả từ trạng thái untracked. Working tree chung không phải snapshot nguyên tử.

files_reviewed: toàn bộ 10 file src/domain/*.ts, đường index.html → fetch/embedded sample → input → timer/localStorage → submit → score/report/print; scripts/build.js, package.json/lockfile, tsconfig.json/tsconfig.web.json, public sample/SVG; CSS tại print/responsive/focus; test/domain đặc biệt scoring/serialize/validation/shuffle và ambient declarations; acceptance/sample, test/e2e/demoFlow, oracle/fixtures. Ops và dashboard điều phối chỉ inventory/diff tổng quan, chưa audit sâu như sản phẩm riêng. Không đọc prompt riêng của worker khác.

| File | SHA256 kiểm trong LC13 |
| --- | --- |
| src/domain/examMax.ts | BE74CEAC6916536C79742F4B7858549749B86BEAE94BDCF7E41634B8E9685BE1 |
| src/domain/scoreAttempt.ts | E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE |
| src/domain/serialize.ts | 850EBA8D6620BD2B6DE02E034226ECB499E9ED4C0EDB18C2D4099711ADB855A8 |
| src/domain/index.ts | 737A04D96CE55E7675070C37422A1E341AFC13690D5EC04B874539CC512C0B07 |
| index.html | 4A81BF50725B4AB913ECF0D296E905B352686D9046491381FB5E940CC7F0EAF1 |
| test/e2e/demoFlow.test.ts | 64A7AD72C702D72E03031D40AC58265EC7E012EC123A5184F2B97DDE4608B523 |

## Findings

### LC13-F01 — BLOCKER — Frontend chấm điểm bằng constants, không nối engine

- affected_files: `index.html:813–919`, đặc biệt `883`, `907–915`; caller `928`; fetch chỉ kiểm array `408–413`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC12-F01, OPEN / VERIFIED.
- evidence: scoreAttemptLocally dùng number, III luôn3.5/câu; maxima I/II/III luôn1/2/7; không import API domain. VM thực thi script inline hiện tại, thay currentExam thành một III key1,5, response1,5: actual total3.5/max10.
- reproduction_steps: chạy harness bên dưới, rồi probe F01. Đề khác cấu hình sample cũng có thể đến từ public/sample-exam.json mà fetch không validate schema/rules.
- expected: custom-v1 chỉ một III trả lời đúng =10/10, maxI=maxII=0, rational theo công thức đề đã validate.
- actual:3.5/10; điểm tối đa từng phần sai. Sample4I/2II/2III chỉ tình cờ khớp constants.
- impact: sai điểm và báo cáo khi thay cấu hình; không đáp ứng max5/15/16 hay phân số lặp. Đây là probe thay dữ liệu cấu hình, không khẳng định đã có builder UI.
- minimal_fix: adapter/build nối frontend với validateExamVersion/scoreAttempt, responses theo IDs; DTO exact fractions và render theo policy. Bỏ scorer/maxima/nhãn hardcode.
- regression_test: submit và report qua frontend với golden max5/10/15/16, chỉIII, N3=3/7; full/blank/mixed và invalid key; so score/max từng phần/tổng với oracle.

### LC13-F02 — BLOCKER — Sửa raw trả lời ngắn trước khi lưu/chấm

- affected_files: `index.html:663`, `677–684`, `880–900`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC12-F02, OPEN / VERIFIED.
- evidence: input handler replace ký tự và slice4; scorer trim. Hai assertions độc lập thất bại: raw` 1,5` được3.5 điểm; callback input thật biến`1.5` thành`15`.
- reproduction_steps: chạy probe F02a/F02b bên dưới; callback được trích từ source, không viết lại thuật toán để giả lập kết quả.
- expected: bảo toàn raw; không trim, normalize hoặc cắt âm thầm; input ngoài charset/length invalid/0 điểm và báo lỗi; exact equality.
- actual: mất chuỗi gốc; whitespace bị bỏ để nhận điểm; dấu chấm bị xóa trước lưu. Chuỗi1.5 có thể thành đáp án đúng15.
- impact: vi phạm invariant CRITICAL III ngay trong đường nhập/lưu/chấm. Re-render toàn pane mỗi input còn cần kiểm focus/caret/composition trên browser.
- minimal_fix: giữ raw, bỏ rewriting/trim, dùng checkShortAnswer/scoreAttempt và hiện lỗi; cập nhật preview không thay input đang composition.
- regression_test:1,5/1,50/1.5, -0,5, space/NBSP/newline, U+2212/fullwidth, paste>4; input→save→restore→report bảo toàn raw; mobile/IME thật.

### LC13-F03 — CRITICAL — Tab stale ghi đè kết quả đã nộp

- affected_files: `index.html:352–360`, `438–456`, `485–486`, `924–930`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC12-F03, OPEN / VERIFIED.
- evidence: hai VM dùng chung storage Map: A.submitExam() lưu submitted=true; B.saveLocalState() đổi durable record thành submitted=false/scoreResult=null. Một key chung, không attemptId/examVersionId/revision/order snapshot, restore Object.assign.
- reproduction_steps: hai trang cùng mở trước submit; A nộp; B sửa đáp án hoặc autosave; reload. Probe F03 thực thi source với shared storage.
- expected: final không bị tab stale ghi đè; restore đúng attempt/version/order.
- actual: mất kết quả đã nộp và bài trở về editable.
- impact: mất dữ liệu kết quả; trạng thái cũ có thể áp vào phiên bản đề khác. Probe VM xác nhận logic, chưa phải browser concurrency E2E.
- minimal_fix: snapshot theo attempt/version/revision; final transition bảo vệ bằng transaction/locking phù hợp storage đã chọn, stale tab conflict/read-only. Read-then-write đơn thuần chưa bảo đảm atomic race.
- regression_test: hai tab edit/submit/timeout cạnh tranh, stale save sau final, reload, version change, migration/quota; final và score không bị đảo ngược.

### LC13-F04 — MAJOR — Đồng hồ đếm callback, không tính thời gian trang đóng

- affected_files: `index.html:356`, `450–456`, `466–488`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC12-F04, OPEN / VERIFIED.
- evidence: interval chỉ remainingSeconds--, không deadline. Clock đi một giờ và chạy một callback vẫn submitted=false; restore dữ liệu3000giây với clock tương lai vẫn chưa nộp. Hai assertions F04a/F04b fail.
- reproduction_steps: đóng trang quá50phút rồi mở lại, hoặc suspend/background làm callback trì hoãn; dùng probes bên dưới để kiểm logic elapsed/restore.
- expected: persist startedAt/deadline/duration theo attempt, tính remaining từ deadline; restore/resume quá hạn nộp ngay.
- actual: thời gian trang đóng không tính, background throttling kéo dài thời gian thi.
- impact: timer/autosubmit sai ở hoạt động thông thường; tách biệt với giới hạn chống chỉnh clock ở MVP offline/no-login.
- minimal_fix: deadline, kiểm load/visibility/resume và trước submit; manual/timeout cùng final transition idempotent.
- regression_test: close/reopen quá hạn, sleep/background/offline, clock shift, manual+timeout đồng thời, chỉ một final.

## Kiểm chứng lỗi đã đóng

LC11-F05/typecheck và LC11-F06/DTO vẫn **CLOSED / VERIFIED**: cả hai tsconfigs exit0; malformed ruleSetId `{toString:null}` và proxy throwing đều ném SyntaxError. Không mở lại lỗi đã sửa. Thử bổ sung parseFractionString với trailing LF cũng bị reject đúng; không có finding từ giả thuyết đó.

## checks_run

Environment: Windows/PowerShell tại D:\Cunata; Node v24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Output/log bằng transcript LC13; không tạo log artifact ngoài scope.

| Command/check | Exit | Kết quả / giới hạn |
| --- | ---: | --- |
| git status/log/rev-parse/branch/diff + inventory/hash | 0 | main, baseline + working tree; không commit implementation mới từ LC12. |
| `npm test` | **0** | **173pass/0fail**,34suites,0skip/cancel/todo;315.732ms. |
| `npx --no-install tsc -p tsconfig.json` | **0** | Không diagnostics; wall≈1.45s. tsc có sẵn, không ghi NOT_RUN theo giả định cũ trong hợp đồng. |
| `npx --no-install tsc -p tsconfig.web.json` | **0** | Không diagnostics;≈1.26s. JS inline index.html không thuộc typecheck. |
| `node scripts/build.js` | **0** |4assets, schema8câu, stylesheet link;≈0.14s. Script chỉ kiểm asset/schema, không compile/bundle/browser build. package.json không có npm build script. |
| `python -B test/oracle/oracle.py --check` | **0** |11pass/0fail,1632cases/5files,5849maxima configs,9negative controls,seed20261114;1.0192s. Oracle self-check, tách khỏi SUT. |
| Stdin Node web regression runner | **1** | **6tests:0pass/6fail**,23.2571ms; F01,F02a,F02b,F03,F04a,F04b đều tái hiện. DOM/storage/timer stubs trong VM, không browser thật. |
| Stdin Node API/oracle + DTO + trailing LF runner | **0** | **3tests:3pass/0fail**,141.0562ms; runner API chứa1632cases, không cộng1632 vào173tests. |
| Stdin runner nháp đầu tiên | **1** | SyntaxError do thừa dấu ngoặc trong harness;0tests thực thi. Đã sửa harness trong RAM và chạy hai runner trên; không là lỗi sản phẩm. |
| Browser/mobile/IME/keyboard/AT/axe/Lighthouse/screenshot/trace | — | **NOT_RUN**; không ghi E2E PASS từ test đọc HTML. |
| Lint/full SAST/secret/history/dependency audit | — | **NOT_RUN** chuyên biệt; không có lint script. |
| Collector/Google/CORS/readback; importer | — | **NOT_RUN / NOT_IMPLEMENTED** trong product source hiện có. |

Independent API runner import `src/domain/index.ts`: so exact total/max và score/max từng phần với1632fixtures; JSON DTO roundtrip deepEqual, bounds, sum(points)=total, input không mutate. Tạo order seed`LC13-20261114`, validate permutation, áp questionOrder/options riêng từng I, đảo responses/statement answers, so từng section và total bất biến. Negative controls9 thuộc oracle, không phải mutation run toàn bộ candidate.

## Harness tái hiện tối thiểu

PowerShell: `@' ... '@ | node --input-type=module`, kết thúc `exit $LASTEXITCODE`. Sau phần khởi tạo dưới đây chạy mỗi probe riêng hoặc dùng node:test để failures không chặn nhau. Đây là đoạn dùng để tái hiện hành vi, không phải file test đã thêm vào repo.

```js
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const script=[...fs.readFileSync('index.html','utf8')
  .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).join('\n');
function page(store=new Map()) {
  const nodes=new Map();
  const c=vm.createContext({console:{warn(){}},document:{getElementById(id){
    if(!nodes.has(id))nodes.set(id,{value:'LC13',style:{},
      classList:{add(){},remove(){}},addEventListener(){}});
    return nodes.get(id);
  }},window:{addEventListener(){},scrollTo(){}},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  setInterval(fn){c.tick=fn;return 1},clearInterval(){},alert(){}});
  vm.runInContext(script,c);vm.runInContext('showReportView=()=>{}',c);
  return {c,run:s=>vm.runInContext(s,c)};
}
```

```js
// F01: actual3.5, expected10
const p=page();
p.run("currentExam={questions:[{kind:'III',questionVersionId:'q',answerKey:'1,5'}]};studentState.responses={q:'1,5'}");
assert.equal(p.run('scoreAttemptLocally().total'),10);
```

```js
// F02a: actual3.5, expected0
const p=page();p.run("studentState.responses={'q08-iii-ung-dung-thuc-te':' 1,5'}");
assert.equal(p.run("scoreAttemptLocally().questionResults.find(q=>q.questionVersionId==='q08-iii-ung-dung-thuc-te').points"),0);
```

```js
// F02b: actual15, expected raw1.5
const p=page();
const h=script.match(/inputEl.addEventListener\('input', (\(e\) => \{[\s\S]*?)\n          \}\);/)[1]+'\n}';
p.c.e={target:{value:'1.5'}};p.c.q={questionVersionId:'q'};
p.run('renderExamPane=()=>{};renderPalette=()=>{}');p.run('('+h+')(e)');
assert.equal(p.c.e.target.value,'1.5');
```

```js
// F03: actualfalse, expectedtrue
const store=new Map(),a=page(store),b=page(store);a.run('submitExam()');
assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
b.run('saveLocalState()');
assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
```

```js
// F04a: actualfalse; remaining2999 sau một giờ
const p=page();p.run('Date.now=()=>0;startTimer();Date.now=()=>3600000');
p.c.tick();assert.equal(p.run('studentState.submitted'),true);
```

```js
// F04b: actualfalse; remaining3000 khi restore tương lai
const store=new Map(),a=page(store);a.run('saveLocalState()');
const b=page(store);b.run('Date.now=()=>4102444800000;loadLocalState();startTimer()');
assert.equal(b.run('studentState.submitted'),true);
```

## coverage_gaps và traceability

| Yêu cầu | Evidence hiện có | Gap |
| --- | --- | --- |
| B1-AC01/02/03; T01–09 | Unit/exhaustiveII1296vectors, golden/oracle1632cases, exact rational/DTO | Domain evidence đạt các ca chạy; frontend F01/F02 vi phạm; display policy chưa chốt. |
| B1-AC04/05; T11–15 | IDs, validation/shuffle, seeded permutations, bounds/input preservation/roundtrip | Browser thiếu attempt/version/order snapshot, bank versioning và migrations chưa có. |
| B1-AC06; T10/13 | Invalid-input unit và DTO boundary regression | Chưa vét cạn schema/resource abuse, getter biến đổi, payload cực lớn; không chứng nhận mọi unknown input. |
| B1-AC07/08; T16/17 | Tests/typecheck/build verification/oracle/reviewer report | Chưa full mutation run, lint/browser/owner acceptance; không gắn DONE toàn bộ sản phẩm. |
| Student/offline/report | SampleUI/localStorage/report/print có implementation | F03/F04; cold-start offline, quota recovery và downloadable report artifact chưa xác minh. |
| UX/security/math | Đọc event/innerHTML/renderMathText/CSS | Không browser thực; keyboard/focus/composition/contrast/mobile/print/math render chưa chứng nhận. |

`test/e2e/demoFlow.test.ts` chỉ đọc assets/markup và tự tính constants trong test, không chạy input/submit/scorer thật. Không dùng tên suite để suy ra browser E2E. renderMathText/innerHTML chưa escape nguồn không tin cậy là risk cần giải quyết trước nối importer/bank; hiện đề mẫu tĩnh, không tự kết luận đã exploit qua importer chưa tồn tại. Public client có answer key, nên chỉ phù hợp practice/sample; chưa chứng minh khả năng kiểm tra cần giấu đáp án. Không có collector thật để kiểm credential/CORS/idempotent receipt. Dashboard/ops không nằm trong chứng nhận an toàn sản phẩm vòng này.

## Tính năng lộ trình còn thiếu — ưu tiên

1. **P0 — Nối frontend vào domain**: sửa F01/F02, validate exam/rules và giữ raw/rational; submit/report golden max5/15/16, III phân số lặp. Giữ173tests/typecheck và bổ sung regression thực thi UI.
2. **P0 — Attempt/offline integrity và deadline**: sửa F03/F04; stable attempt/version/order snapshot, final idempotent, concurrency, migrations/quota/failure states; kiểm browser offline/restore thực.
3. **P1 — Hoàn thiện luồng học sinh/báo cáo**: chọn đề/nickname, settings thời gian/trộn/lượt/lời giải; startedAt/endedAt; download HTML/PDF offline và policy công bố key. Hai flags shuffle domain chưa tích hợp web.
4. **P1 — Builder/question bank**: môn→lớp→chương/chủ đề→bài→mức độ, reuse, immutable versions, preview/publish, backup/export/import/delete; luồng giáo viên/local private đúng MVP không login.
5. **P1 — Collector được duyệt**: Google/Apps Script/gateway theo owner; trusted grading khi cần, outbox/retry giới hạn/backoff, dedupe/conflict, receipt/readback/CORS thật; phân biệt local_saved/queued/sending/server_confirmed/failed.
6. **P2 — Import DOCX/PDF**: đọc→IR→preview/edit→confirm→export, math/table/image/provenance, text/scan/OCR uncertainty, không đoán key; limits và corpus regression. Chưa implementation.
7. **P2 — Standard presets**: registry theo môn/năm/nguồn chính thức được xác nhận; không gắn custom-v1 thành quy định THPT chung.
8. **P2 — UX/a11y/security/performance/release**: keyboard/mobile/IME/math, privacy/export/delete guidance, audits và browser E2E, CI/changelog/rollback/owner acceptance. Class/assignment giai đoạn sau.

## NEED_DECISION — chưa tự chốt nghiệp vụ

Các mục sau cần owner quyết trước triển khai tương ứng, không chặn sửa F01–F04 theo invariant sẵn có:

- Grammar III: (A) giữ charset/length policy hiện tại; (B) grammar hẹp với policy version mới; (C) grammar theo preset được duyệt, giữ tái lập bài cũ.
- Rounding display: (A) phân số exact; (B) decimal số chữ số/half-up owner chọn, giữ fraction nguồn; (C) decimal xấp xỉ kèm fraction. Không dùng rounding cho chấm.
- Limit/grouping: (A) duyệt tạm1000, nguyên thứ tự khi tắt trộn/nhóm khi bật; (B) limit/grouping khác với rule/version/tests. Hiện là giả thiết hợp đồng kỹ thuật, không coi là owner approval.
- Storage/collector/report: (A) local practice và HTML export trước; (B) collector được duyệt với quyền/retention/CORS/readback và trusted authority khi kiểm tra; (C) local practice/PDF export sau đánh giá công nghệ. Chưa chọn thay owner.

recommended_action: giao vùng glue sửa F01–F04 với regression fail-base/pass-fix, giữ bản sửa DTO/typecheck, chạy lại domain/typecheck/build và browser integration. Không nghiệm thu/deploy từ173tests xanh. tools_research: không giao nghiên cứu/cài tool mới; dùng READINESS §6. privacy_notes: chỉ kết quả kỹ thuật và dữ liệu thử, không trích nội dung chỉ thị riêng.

## Cập nhật snapshot cuối phiên

Trong lúc ghi báo cáo, tiến trình khác tạo commit f2447ae787272808f84d9d894cdded8e7cff3d2c (forever round 1), đưa implementation trước đó untracked vào Git. Reviewer không commit. Đã xác minh lại index.html, scoreAttempt.ts, serialize.ts giữ nguyên SHA256 nêu trên; git status giới hạn src/test/index/scripts/public/styles/package/tsconfigs sạch. Do đó kết quả checks/probes vẫn áp dụng các bytes sản phẩm vừa được commit. Trạng thái cuối còn thay đổi ở ops/dashboard/log/workers của tiến trình khác và báo cáo LC13 untracked; không sửa hay revert các file đó. Các nhận xét untracked/baseline phía trên mô tả preflight, không phải HEAD cuối. Chưa nghiệm thu các thay đổi điều phối trong commit này như sản phẩm riêng.

