# LC12 — Kiểm định toàn bộ sản phẩm, vòng 12

- review_id/task_id/worker_id: LC12; reviewer: Codex.
- verified_at: 2026-11-14, Asia/Bangkok, khoảng 04:39–04:47.
- base_commit/head_commit: `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`; branch: `main`; đối tượng review là HEAD cộng working tree chưa commit.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6, B1-AC01…08/B1-T01…17.
- risk_level: HIGH.
- verdict: **CHANGES_REQUESTED**.
- handoff_status: **READY_FOR_REVIEW** cho báo cáo; không phải nghiệm thu sản phẩm.
- findings_summary: **2 BLOCKER, 1 CRITICAL, 1 MAJOR**, OPEN / VERIFIED. LC11-F05/F06 được đóng sau kiểm chứng bản sửa typecheck/DTO.

## Phạm vi và snapshot

Đã đọc đầy đủ hai hợp đồng bắt buộc và review LC11, đối chiếu READINESS §6. Không tìm thấy AGENTS.md trong inventory workspace hoặc ở D:\AGENTS.md. Chỉ tạo báo cáo này, không sửa code/test/config, không cài dependency, không tạo branch/worktree, commit hoặc deploy. Các probe chạy stdin, không tạo file ngoài scope.

Git log vẫn chỉ có commit baseline `2ee84e3`; không có commit mới kể từ LC11. Diff tracked gồm ops/m1/tasks.json, ops/run_tasks.py, package.json: 346 insertions/24 deletions. Toàn bộ src, test, frontend, lockfile còn untracked nên diff HEAD không mô tả được thay đổi implementation. Không quy tác giả từ trạng thái untracked. Manifest hiện khai báo TypeScript7.0.2, không có npm build/lint script. Lockfile v3; không có thay dependency mới được chứng minh so với LC11.

files_reviewed: toàn bộ 10 file src/domain/*.ts; index.html và đường web → scorer → localStorage → report; scripts/build.js, package.json/lockfile, hai tsconfigs; test/domain (đặc biệt scoreAttempt, serialize và ambient declarations), acceptance/sample, test/e2e/demoFlow.test.ts, oracle/fixtures, public sample/SVG, CSS tại các vùng liên quan. Các script ops/dashboard được kiểm kê và xem diff tổng quan, chưa audit sâu như một sản phẩm điều phối riêng. Không đọc prompt riêng của các worker khác.

Thay đổi so với LC11: serialize.ts bỏ coercion tạo thông báo lỗi và bọc boundary bằng catch chuyển lỗi ngoài SyntaxError thành SyntaxError; có regression mới trong serialize.test.ts. Đã chạy lại payload JSON `{toString:null}`, null-prototype, throwing coercion và proxy: đều SyntaxError. **Đóng LC11-F06**, không mang lỗi đã sửa sang findings mở. Domain scoring và index.html giữ hash cũ. File ambient-node.d.ts thay đổi ngay trong lúc kiểm định: lần đầu typecheck có 5 diagnostics, lần sau còn 2; suite lần đầu172, lần sau173 tests. Báo cáo dùng kết quả cuối, giữ lịch sử đo rõ ràng; không coi working tree chung là snapshot nguyên tử.

| File | SHA256 tại lần chốt inventory |
| --- | --- |
| src/domain/examMax.ts | BE74CEAC6916536C79742F4B7858549749B86BEAE94BDCF7E41634B8E9685BE1 |
| src/domain/scoreAttempt.ts | E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE |
| src/domain/serialize.ts | 850EBA8D6620BD2B6DE02E034226ECB499E9ED4C0EDB18C2D4099711ADB855A8 |
| src/domain/index.ts | 737A04D96CE55E7675070C37422A1E341AFC13690D5EC04B874539CC512C0B07 |
| index.html | 4A81BF50725B4AB913ECF0D296E905B352686D9046491381FB5E940CC7F0EAF1 |
| test/domain/serialize.test.ts | 0287252AE81E58B658B4C9FBBC031B1313DEB5CDA420CC5A4939023A2AC57F58 |
| test/domain/scoreAttempt.test.ts | 47066466913CF3AEC938EB4CB7373EA57CD3B88376EB948F7108604584632E1F |
| test/domain/ambient-node.d.ts | 3881BE66CC64B03E53AA60F7994676260FCCE40BF9A3637A2EFDA5C48F82B63D |
| test/e2e/demoFlow.test.ts | 64A7AD72C702D72E03031D40AC58265EC7E012EC123A5184F2B97DDE4608B523 |
| package-lock.json | B357B79C70042B409343E61592F708E2E177CFB15BA474CDD021F25C972187E5 |

## Findings

### LC12-F01 — BLOCKER — Web hardcode điểm, không gọi engine đã kiểm định

- affected_files: `index.html:813–919`, cụ thể `883`, `907–915`; caller `928`; nhãn `533`, `546`; fetch chỉ kiểm array ở `408–413`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC11-F01, OPEN / VERIFIED.
- evidence: scoreAttemptLocally dùng number, III luôn3.5/câu, maxI/maxII/maxIII luôn1/2/7. Web không import public scoring API. Đề chỉ một câu III key1,5, trả lời1,5: probe trả total3.5, maxTotal10.
- reproduction_steps: chạy harness phía dưới; gán currentExam.questions chỉ một III và response đúng; gọi scoreAttemptLocally().total.
- expected: custom-v1 một III đúng =10/10, maxI=maxII=0; maxima và từng điểm dùng rational theo cấu hình đề đã validate.
- actual:3.5/10; maxima sai. Cấu hình sample4I/2II/2III chỉ tình cờ khớp constants.
- impact: sai chấm điểm khi cấu hình thay đổi; không thể chứng nhận đề max5/15/16 hoặc phân số lặp qua web. Probe là thay dữ liệu cấu hình, không khẳng định UI builder đã tồn tại.
- minimal_fix: adapter/build nối web với API domain; chuyển responses sang kiểu có IDs, validate đề/rules, dùng DTO phân số và render theo policy. Loại scorer và nhãn hardcode.
- regression_test: submit/report qua web thật với golden max5/10/15/16, chỉIII, N3=3/7, full/blank/mixed, invalid key; so DTO từng phần/tổng với oracle, sau đó kiểm display.

### LC12-F02 — BLOCKER — Web tự sửa chuỗi trả lời ngắn trước khi lưu/chấm

- affected_files: `index.html:663`, `677–684`, `880–900`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC11-F02, OPEN / VERIFIED.
- evidence: handler replace ký tự ngoài tập và slice4, scorer trim raw. Probe raw` 1,5` nhận3.5 điểm; handler thật biến`1.5` thành`15`.
- reproduction_steps: harness: gán response q08=` 1,5` rồi chấm; chạy callback input trích từ source với event.target.value=`1.5`.
- expected: giữ raw, không trim/normalize/cắt âm thầm; charset/length lỗi phải báo invalid/0 theo API, chỉ chuỗi bằng từng ký tự mới đúng.
- actual: space bị bỏ để nhận điểm; dấu chấm bị xóa trước lưu, không còn đáp án gốc. Re-render pane mỗi input còn cần kiểm focus/caret/composition trên browser.
- impact: vi phạm invariant CRITICAL III; chuỗi`1.5` có thể bị biến thành đáp án đúng`15`.
- minimal_fix: bỏ silent rewriting và trim; dùng checkShortAnswer/scoreAttempt, hiển thị lỗi và bảo toàn raw; cập nhật preview không phá input đang nhập/composition.
- regression_test:1,5/1,50/1.5, space/NBSP/newline, U+2212, fullwidth, -0,5, paste>4, lưu/restore/report; mobile và IME thật. Không cần owner quyết grammar mới để sửa lỗi normalization trái hợp đồng hiện tại.

### LC12-F03 — CRITICAL — Tab cũ ghi đè kết quả đã nộp

- affected_files: `index.html:352–360`, `438–456`, `485–486`, `924–930`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC11-F03, OPEN / VERIFIED.
- evidence: hai VM dùng chung storage Map. A.submitExam lưu submitted=true; B.saveLocalState sau đó ghi submitted=false, scoreResult=null. Một key chung, không attemptId/examVersionId/revision/presentation snapshot, restore bằng Object.assign.
- reproduction_steps: hai tab mở trước submit; A nộp; B sửa đáp án hoặc tick save; reload. Harness thực thi source với storage chung chứng minh durable record bị đảo ngược.
- expected: final bền vững, tab stale không ghi đè; restore đúng attempt/version/order.
- actual: bài final bị ghi trở lại editable và mất scoreResult. Probe là logic concurrency trong VM, chưa là native browser E2E.
- impact: mất kết quả đã nộp; dữ liệu cũ có thể áp lên đề khác phiên bản.
- minimal_fix: snapshot mỗi attempt và revision, final transition bảo vệ bằng transaction/locking phù hợp storage được chọn; tab stale nhận conflict/read-only. Read-then-write không nguyên tử chưa giải quyết đầy đủ race.
- regression_test: hai tab edit/submit/autosubmit cạnh tranh, stale save, reload final, version change, migration/quota; final và điểm không bị mất.

### LC12-F04 — MAJOR — Timer bỏ qua thời gian trang đóng hoặc callback bị trì hoãn

- affected_files: `index.html:356`, `450–456`, `466–488`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC11-F04, OPEN / VERIFIED.
- evidence: mỗi interval chỉ remainingSeconds--, không deadline. Tăng clock một giờ rồi gọi một callback: submitted=false, remaining2999. Restore bài lưu3000 giây với clock tương lai vẫn không nộp.
- reproduction_steps: đóng trang lâu hơn50phút rồi mở lại hoặc suspend/background; harness kiểm clock elapsed và restore như bên dưới.
- expected: persist startedAt/deadline/duration, tính còn lại từ mốc thời gian; restore/resume quá hạn phải nộp.
- actual: thời gian trang đóng không tính; throttled callbacks kéo dài kỳ thi.
- impact: giới hạn thời gian/autosubmit sai trong luồng bình thường; phân biệt với rủi ro chống sửa clock vốn không thể bảo đảm ở MVP offline/no-login.
- minimal_fix: deadline gắn attempt, kiểm load/visibility/resume và trước final; manual/timeout dùng chung final transition idempotent.
- regression_test: close/reopen quá hạn, sleep/background/offline, clock shift, manual+timeout đồng thời, không hai final.

### LC12-R05 — CLOSED — Typecheck đã phục hồi ở lần chốt

- affected_files: `test/domain/scoreAttempt.test.ts:422`, `429`; declarations `test/domain/ambient-node.d.ts:27`, `41`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC11-F05, **CLOSED / VERIFIED** ở lần chốt.
- evidence/reproduction_steps: chạy cả hai configs bằng npx --no-install tsc. Lần chốt đều exit1 với TS7006: Parameter 'err' implicitly has an 'any' type ở422 và429. readdirSync/process/f đã được sửa giữa phiên; không còn báo ba diagnostics đó là hiện trạng cuối.
- expected: typecheck strict source/test exit0 bằng dependency đã có.
- actual: npm test173/173 xanh nhưng typecheck thất bại. Không được ghi NOT_RUN vì tsc thực sự có sẵn và đã chạy.
- impact: gate compile-time chưa đạt, predicates không được kiểm kiểu đúng.
- minimal_fix: annotate `(err: unknown)` rồi narrow bằng instanceof, hoặc cung cấp overload predicate có contextual type unknown phù hợp assert.throws; không exclude tests/nới strict hay thêm dependency để che lỗi.
- regression_test: hai configs exit0, npm test và build verification tiếp tục đạt.

**Cập nhật cuối 04:47:** Trong working tree chung, hai predicates đã được annotate `(err: unknown)`. Reviewer không sửa source/test. Đã chạy lại cả hai configs: **exit0, không diagnostics**; npm test **173pass/0fail**,343.4584ms. Các dòng mô tả lỗi phía trên là bằng chứng trước sửa trong cùng phiên, không còn là finding mở. Đóng LC11-F05; F01–F04 vẫn mở. Đây là lần kiểm chứng sau cùng, thay thế kết quả typecheck ở snapshot giữa phiên nêu trong phần mở đầu.

## checks_run

Environment: Windows/PowerShell tại D:\Cunata; Node v24.14.0, npm11.9.0, TypeScript7.0.2, Python3.11.0. Logs/output nằm trong transcript LC12; không tạo log artifact ngoài scope. Probe Node stdin có `exit $LASTEXITCODE` để giữ mã lỗi thật.

| Command/check | Exit | Kết quả và giới hạn |
| --- | ---: | --- |
| git status/log/rev-parse/branch/diff, inventory/hash | 0 cho git/hash | main/baseline + working tree untracked; không commit mới. AGENTS không tìm thấy, không là lỗi sản phẩm. |
| `npm test` lần đầu | 0 |172pass/0fail,34suites,0skip/cancel/todo;314.205ms. |
| `npm test` lần cuối sau thay đổi typings/predicates | **0** | **173pass/0fail**,34suites,0skip/cancel/todo;343.4584ms. Lần giữa334.2487ms cũng đạt. |
| `npx --no-install tsc -p tsconfig.json` | **0** | Lần đầu exit1/5 diagnostics, giữa exit1/2 TS7006, lần cuối **exit0/0 diagnostics**, wall≈1.50s. |
| `npx --no-install tsc -p tsconfig.web.json` | **0** | Lần đầu exit1/5, giữa exit1/2, cuối **exit0/0 diagnostics**,≈1.49s. Inline JS trong HTML không thuộc typecheck. |
| `node scripts/build.js` chạy riêng | **0** |4assets tồn tại, sample schema8câu, stylesheet link;≈0.07s. Đây là asset/schema verification, không bundling/compile/browser build. Không có npm build script. |
| `python -B test/oracle/oracle.py --check` | **0** |11pass/0fail,1632cases/5files,5849maxima configs,9negative controls,seed20261114;0.9769s. Oracle self-check, không tự coi là SUT test. |
| Stdin `node --input-type=module`: API + web + DTO regression | **1** | **8tests:2pass/6fail**,0skip/cancel/todo;162.1361ms. API1632fixtures PASS; DTO regression PASS;6 web assertions fail thật F01–F04. |
| Browser thật/mobile/IME/keyboard/AT/axe/Lighthouse/screenshot/trace | — | **NOT_RUN** trong LC12. Tên test/e2e không thay browser evidence. |
| Lint/full SAST/secret/history/dependency/license audit | — | **NOT_RUN** chuyên biệt; không có lint script; inventory/search không chứng nhận hết lỗ hổng. |
| Collector/Google/CORS/readback và importer | — | **NOT_RUN / NOT_IMPLEMENTED** trong product source hiện có; không endpoint/corpus triển khai để test. |

Independent API check import qua src/domain/index.ts, chạy1632fixtures, so exact fractions total/max và score/max cả ba phần; DTO JSON roundtrip deepEqual, bounds, tổng points=total, input không mutate. Mỗi case tạo presentation seed `LC12-20261114`, validate, áp questionOrder và hoán vị options riêng từng câu I, đảo responses và statement answers, so score/max bất biến. Đây là một runner test chứa1632cases, không cộng1632 vào173 tests. Negative controls9 nằm trong oracle, không phải đã mutation-test toàn bộ source ứng dụng.

## Harness tái hiện

Dùng PowerShell here-string `@' ... '@ | node --input-type=module`, tiếp theo `exit $LASTEXITCODE`. VM thực thi script inline thật với DOM/storage/timer stubs; không mô phỏng đầy đủ browser. Mỗi repro chạy riêng để assertion fail không chặn repro tiếp theo.

```js
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const script = [...fs.readFileSync('index.html','utf8')
  .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).join('\n');
function page(store=new Map()) {
  const nodes=new Map();
  const c=vm.createContext({console:{warn(){}},document:{getElementById(id){
    if(!nodes.has(id)) nodes.set(id,{value:'LC12',style:{},
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
// F01 actual3.5, expected10
const p=page();
p.run("currentExam={questions:[{kind:'III',questionVersionId:'q',answerKey:'1,5'}]};studentState.responses={q:'1,5'}");
assert.equal(p.run('scoreAttemptLocally().total'),10);
```

```js
// F02 actual3.5, expected0
const p=page();
p.run("studentState.responses={'q08-iii-ung-dung-thuc-te':' 1,5'}");
assert.equal(p.run("scoreAttemptLocally().questionResults.find(q=>q.questionVersionId==='q08-iii-ung-dung-thuc-te').points"),0);
```

```js
// F02 actual15, expected raw1.5
const p=page();
const handler=script.match(/inputEl.addEventListener\('input', (\(e\) => \{[\s\S]*?)\n          \}\);/)[1]+'\n}';
p.c.e={target:{value:'1.5'}};p.c.q={questionVersionId:'q'};
p.run('renderExamPane=()=>{};renderPalette=()=>{}');p.run('('+handler+')(e)');
assert.equal(p.c.e.target.value,'1.5');
```

```js
// F03 actualfalse, expectedtrue
const store=new Map(),a=page(store),b=page(store);
a.run('submitExam()');
assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
b.run('saveLocalState()');
assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
```

```js
// F04 elapsed: actualfalse; một giờ trôi qua chỉ giảm1giây
const p=page();p.run('Date.now=()=>0;startTimer();Date.now=()=>3600000');
p.c.tick();assert.equal(p.run('studentState.submitted'),true);
```

```js
// F04 restore: actualfalse, remaining3000
const store=new Map(),a=page(store);a.run('saveLocalState()');
const b=page(store);b.run('Date.now=()=>4102444800000;loadLocalState();startTimer()');
assert.equal(b.run('studentState.submitted'),true);
```

```js
// LC11-F06 fixed: PASS ở LC12
import {scoreResultFromDTO} from './src/domain/index.ts';
assert.throws(()=>scoreResultFromDTO({attemptId:'a',examVersionId:'e',
  ruleSetId:{toString:null}}),SyntaxError);
assert.throws(()=>scoreResultFromDTO(new Proxy({},{get(){throw Error('x')}})),SyntaxError);
```

## Coverage và nghiệm thu

| Nhóm yêu cầu | Bằng chứng hiện có | Gap còn lại |
| --- | --- | --- |
| B1-AC01/02/03; T01–09 | Domain unit, exhaustiveII1296 vectors, golden/oracle1632 cases, exact DTO/arithmetic | Web F01/F02 vi phạm dù domain đạt; display rounding chưa được owner chốt. |
| B1-AC04/05; T11–15 | IDs, validator, shuffle độc lập, permutation/bounds/roundtrip/input preservation | Browser không lưu attempt/version/order snapshot đúng yêu cầu; versioning bank và migration chưa triển khai. |
| B1-AC06; T10/13 | Validation negative tests, DTO malformed regression đã sửa | Chưa vét cạn adversarial schema/resource limits; không gắn full validation guarantee từ fixtures. |
| B1-AC07/08; T16/17 | Tests/build verification/oracle và báo cáo độc lập; typecheck cuối PASS | Không có full mutation run, lint/browser evidence/owner acceptance. |
| StudentUI/offline/report | UI sample8câu, localStorage, report và window.print | F03/F04; không service worker/offline shell đã kiểm, không downloadable report artifact đã chứng nhận. |
| Security/a11y/math | Đã lần theo innerHTML, localStorage, input/click handlers | Không browser exploit/keyboard/composition audit. renderMathText/innerHTML chưa escape input là rủi ro khi nối nguồn đề không tin cậy; hiện source mẫu là dữ liệu tĩnh, không tự kết luận đã exploit qua importer chưa tồn tại. |

Không có browser execution trong vòng này, nên focus/caret, radio div chỉ click, modal focus, mobile layout/contrast, Telex/VNI, print output và cold-start offline đều **NOT_TESTED**. Không dùng VM, schema build hoặc assertions chỉ kiểm chuỗi HTML để tuyên bố E2E PASS. test/e2e/demoFlow.test.ts đọc file, dò markup và tự tính constants; không submit UI/scorer thật. Không xác minh Google credentials/permissions/CORS/readback hoặc scan toàn lịch sử; không kết luận an toàn production.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0: nối UI vào scoring domain và giữ gates** — sửa F01/F02, giữ typecheck vừa phục hồi, đủ cấu hình max5/15/16 và exact rational/raw. Chặn nghiệm thu sản phẩm cho đến khi web regression qua.
2. **P0: attempt/offline integrity + deadline** — sửa F03/F04; stable attempt/version/rule/presentation snapshots, final idempotent, nhiều tab, migration/quota/failure states; offline shell/restore phải chạy browser thật.
3. **P1: hoàn thiện luồng học sinh và báo cáo** — chọn đề/nickname, cấu hình thời gian/trộn/số lượt/chính sách lời giải, startedAt/endedAt; download HTML/PDF dùng offline, điểm từng phần/tổng, key visibility đúng policy. Hai cờ shuffle domain đã có nhưng web chưa tích hợp.
4. **P1: builder và question bank** — phân loại môn/lớp/chương/bài/mức độ; reuse câu, immutable versions, preview/publish, export/import/backup/delete; luồng giáo viên/private local phù hợp MVP không login.
5. **P1: collector được duyệt** — Google/Apps Script/gateway theo owner chọn, server authority khi cần; outbox/retry bounded/backoff, dedupe/conflict, receipt state chính xác và owner readback/CORS thật. Không giả local_saved là Drive confirmed.
6. **P2: importer DOCX/PDF** — source→IR→preview/edit→confirm→export, math/table/image/provenance, scan/text và OCR flags; missing key không đoán, resource/security limits và corpus regression. Hiện chưa có implementation.
7. **P2: standard presets** — registry theo môn/năm/nguồn đã xác nhận; không áp custom-v1 như quy định THPT chung.
8. **P2: hoàn thiện UX/a11y/security/performance/release** — keyboard/mobile/IME, math renderer, privacy/export/delete guidance, secrets/dependency checks, browser E2E, CI/changelog/rollback và owner acceptance. Class/assignment là giai đoạn sau.

## Quyết định nghiệp vụ còn mở

Không tự đặt quyết định để chấm đạt review. **NEED_DECISION** cho các hạng mục sau, không chặn sửa lỗi đã có invariant rõ:

- Grammar III ngoài charset/length: (A) giữ sa-charset-v1 và exact raw hiện có; (B) grammar hẹp dưới policy version mới, giữ tái lập bài cũ; (C) presets grammar theo ngữ cảnh được owner duyệt. Chưa chọn.
- Rounding display: (A) phân số exact; (B) decimal số chữ số cố định/half-up owner chọn, giữ fraction nguồn; (C) decimal xấp xỉ kèm fraction. Chưa chọn, không dùng display rounding để chấm.
- Limit và grouping: (A) phê duyệt1000 + giữ nguyên khi tắt trộn/nhóm I→II→III khi bật; (B) limit/grouping khác kèm rule/version và tests. Đây là giả thiết tạm đã nêu trong hợp đồng kỹ thuật, không coi là owner approval.
- Collector/storage/report format/standard presets: (A) local practice + HTML export trước; (B) dịch vụ thu kết quả được duyệt với trusted authority, retention/CORS/readback trước dùng kiểm tra; report PDF/preset cần nghiệm thu riêng. Chưa có quyết định trong đầu vào LC12 để chứng nhận production.

recommended_action: giao vùng glue sửa F01–F04 với regression fail-base/pass-fix, giữ bản sửa DTO/typings/predicates và tests; chạy lại typecheck/build/domain + browser integration sau khi tích hợp. Không merge/deploy/nghiệm thu chỉ dựa173 tests xanh. Báo cáo LC12 hoàn tất trong scope; sản phẩm vẫn CHANGES_REQUESTED.

tools_research: không được giao nghiên cứu/cài công cụ mới ở LC12; dùng READINESS §6 làm tiêu chí. privacy_notes: báo cáo chỉ chứa kết quả kỹ thuật và dữ liệu thử; không chép nội dung chỉ thị riêng.
