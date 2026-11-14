# LC14 — Kiểm định toàn bộ sản phẩm, vòng 14

- review_id/task_id/worker_id: LC14; reviewer: Codex.
- verified_at: 2026-11-14, Asia/Bangkok; risk_level: HIGH.
- base_commit/head_commit: `f2447ae787272808f84d9d894cdded8e7cff3d2c`; branch: `main`.
- requirements_version: Shared Product Contract v2.0; M1-scoring-contract v1.0; READINESS §6, B1-AC01…08/B1-T01…17.
- verdict: **CHANGES_REQUESTED**; không nghiệm thu toàn bộ sản phẩm.
- handoff_status: **NEED_DECISION** cho các chính sách còn mở ở cuối báo cáo; các lỗi F01–F05 sửa được theo invariant hiện hữu, không cần chờ quyết định đó.
- findings_summary: **2 BLOCKER, 1 CRITICAL, 2 MAJOR** — OPEN / VERIFIED. F01–F04 tiếp nối LC13; F05 mới xác minh trong vòng này. Không chứng minh được lỗi scoring domain mới qua các checks đã chạy.

## Phạm vi, lịch sử và snapshot

Đã đọc toàn bộ hai hợp đồng bắt buộc, skill được chỉ định, LC13 và READINESS §6. Không tìm thấy AGENTS.md trong workspace hoặc tại D:\\AGENTS.md. Chỉ tạo `docs/reviews/LOOP-14-codex.md`; không sửa code/test/config, không cài dependency, không tạo branch/worktree, không commit/deploy. Probes chạy stdin, không tạo file test/log ngoài scope.

LC13 chốt tại `f2447ae`; LC14 vẫn cùng HEAD. `git log` chỉ có commit đó và baseline `2ee84e3`. `git diff HEAD -- src test index.html styles public scripts package.json package-lock.json tsconfig.json tsconfig.web.json` rỗng; các SHA256 dưới đây bằng LC13. Do đó **không có delta sản phẩm để coi các finding cũ đã được sửa**. Tracked changes tại preflight/chốt gồm ops/OVERNIGHT_STATUS.md, ops/dashboard/dashboard_data.js, ops/forever.stdout.txt, ops/loop/wave1.out.txt, ops/overnight.log và workers.html; các file điều phối/review khác còn untracked. Không sửa/revert chúng. Working tree chung có thể tiếp tục thay đổi sau snapshot này.

files_reviewed: toàn bộ 10 file `src/domain/*.ts`; đường chạy `index.html` từ embedded/fetch sample → input → localStorage/timer → submit → scorer/report/print; `scripts/build.js`, `package.json`, lockfile, hai tsconfigs, public sample/SVG, CSS responsive/print/focus; assertions domain về điểm/validation/serialize/shuffle, acceptance sample, e2e/demoFlow, oracle fixtures/runner. Ops/dashboard/workers chỉ inventory/diff tổng quan, không chứng nhận chúng như một sản phẩm điều phối riêng. Không đọc prompt riêng của worker khác.

| File | SHA256 LC14 |
| --- | --- |
| index.html | 4A81BF50725B4AB913ECF0D296E905B352686D9046491381FB5E940CC7F0EAF1 |
| src/domain/examMax.ts | BE74CEAC6916536C79742F4B7858549749B86BEAE94BDCF7E41634B8E9685BE1 |
| src/domain/scoreAttempt.ts | E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE |
| src/domain/serialize.ts | 850EBA8D6620BD2B6DE02E034226ECB499E9ED4C0EDB18C2D4099711ADB855A8 |
| src/domain/index.ts | 737A04D96CE55E7675070C37422A1E341AFC13690D5EC04B874539CC512C0B07 |
| test/e2e/demoFlow.test.ts | 64A7AD72C702D72E03031D40AC58265EC7E012EC123A5184F2B97DDE4608B523 |

## Findings

### LC14-F01 — BLOCKER — Web dùng scorer/hằng số riêng, sai điểm khi cấu hình đề thay đổi

- affected_files: `index.html:813–919`, đặc biệt `883`, `907–915`; caller `928`; fetch `408–413`; nhãn `533`, `546`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC13-F01; OPEN / VERIFIED.
- evidence: không import engine domain; score/max dùng number, III cố định 3.5/câu, max các phần cố định 1/2/7. Runner VM thực thi source hiện tại với một câu III key `1,5`, đáp án `1,5`: total=3.5, maxTotal=10, maxI=1, maxII=2, maxIII=7.
- reproduction_steps: chạy harness bên dưới, probe F01. Đây là phép thử thay dữ liệu exam tại ranh giới mà web đã nhận từ JSON; không khẳng định có builder UI.
- expected: đề custom-v1 chỉ một III đúng = **10/10**, maxI=maxII=0, maxIII=10, số học rational.
- actual: **3.5/10**, báo sai cả điểm phần. Cấu hình sample 4I/2II/2III chỉ tình cờ khớp constants.
- impact: chấm/report sai với đề max5/15/16 hoặc N3 tạo phân số lặp; UI tuyên bố chuẩn xác nhưng không dùng API đã kiểm định. JSON fetch chỉ kiểm mảng questions, không validate rules/schema/key.
- minimal_fix: nối adapter web vào `validateExamVersion`/`scoreAttempt`, responses theo ID, giữ rational/DTO đến render; bỏ scorer/maxima/nhãn hardcode. Không chuẩn hóa /10.
- regression_test: submit/report thực thi với golden max5/10/15/16, N3=0/3/7, chỉ I/II/III, full/blank/mixed, key/schema sai; đối chiếu từng section score/max và total với oracle.

### LC14-F02 — BLOCKER — Input/chấm web tự sửa raw trả lời ngắn

- affected_files: `index.html:663`, `677–684`, `880–900`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC13-F02; OPEN / VERIFIED.
- evidence: callback input thật dùng replace + slice4, scorer dùng trim. F02a: raw ` 1,5` vẫn được 3.5 điểm. F02b: callback trích từ source biến `1.5` thành `15` trước lưu.
- reproduction_steps: chạy probes F02a/F02b; hoặc dán dấu chấm/ký tự ngoài tập vào câu III rồi xem raw đã lưu. F02a trực tiếp kiểm ranh giới restored/raw của scorer, không giả định có thể gõ whitespace qua handler hiện tại.
- expected: giữ nguyên raw, exact equality; charset/length invalid → invalid/0 điểm, báo lỗi; không trim, normalize hay âm thầm cắt.
- actual: mất raw, whitespace bị bỏ trước chấm; `1.5` có thể trở thành đáp án đúng `15`. maxlength không thay được chính sách bảo toàn raw khi paste/restore.
- impact: vi phạm invariant CRITICAL phần III trên đường nhập/lưu/chấm. Re-render pane mỗi input còn có rủi ro focus/caret/composition cần browser xác minh.
- minimal_fix: lưu raw nguyên vẹn, bỏ replace/slice/trim; dùng `checkShortAnswer` và scorer domain; hiển thị lỗi, cập nhật preview không phá input đang composition.
- regression_test: input→save→reload→submit→report bảo toàn `1,5`/`1,50`/`1.5`, `-0,5`, space/NBSP/newline, U+2212/fullwidth/emoji và paste >4; kiểm IME/mobile thật.

### LC14-F03 — CRITICAL — Tab cũ ghi đè bài đã nộp

- affected_files: `index.html:352–360`, `438–456`, `485–486`, `924–930`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC13-F03; OPEN / VERIFIED.
- evidence: hai VM dùng chung storage Map: A.submitExam() lưu submitted=true; B.saveLocalState() đổi record thành submitted=false/scoreResult=null. Một key chung; không attemptId/examVersionId/revision/order snapshot trong state; restore Object.assign không schema/version check.
- reproduction_steps: mở hai trang trước khi nộp, A nộp, B sửa đáp án hoặc autosave, reload; runner F03 thực thi cùng source/storage với hai context.
- expected: final không bị stale save đảo ngược; restore đúng attempt/phiên bản/snapshot.
- actual: kết quả đã nộp bị thay bằng state chưa nộp; bài có thể trở lại editable.
- impact: mất bản ghi kết quả và trộn state giữa phiên bản đề. Đây là bằng chứng logic storage, chưa là browser concurrency E2E.
- minimal_fix: stable attempt/version/revision và snapshot; final transition chống stale writes bằng transaction/locking phù hợp storage đã duyệt, tab cũ chuyển conflict/read-only. Read-then-write đơn giản không bảo đảm atomic race.
- regression_test: hai tab edit/nộp/timeout, stale autosave sau final, reload/version change, migration/quota; score/final không bị ghi lùi, một lần final.

### LC14-F04 — MAJOR — Timer đếm callback thay vì deadline

- affected_files: `index.html:356`, `450–456`, `466–488`.
- **VÙNG chịu trách nhiệm: glue**. Tiếp nối LC13-F04; OPEN / VERIFIED.
- evidence: callback chỉ remainingSeconds--. Clock tiến một giờ rồi gọi một callback: remaining=2999, submitted=false. Restore ở thời điểm sau một giờ vẫn chưa nộp, vì chỉ persist remainingSeconds.
- reproduction_steps: probes F04a/F04b; tình huống thực tế tương ứng là đóng trang quá 50 phút rồi mở lại, sleep/background khiến callback trì hoãn.
- expected: persist startedAt/deadline/duration theo attempt, tính remaining từ deadline, quá hạn khi restore/resume thì tự nộp ngay.
- actual: thời gian đóng trang không tính; callback trì hoãn kéo dài giờ thi.
- impact: timer/autosubmit sai trong hoạt động thông thường; không đánh đồng với việc chống sửa đồng hồ máy, vốn MVP offline/no-login không thể bảo đảm tuyệt đối.
- minimal_fix: deadline và kiểm load/resume/visibility/trước submit; manual/timeout dùng cùng final transition idempotent.
- regression_test: close/reopen quá hạn, background/sleep/offline, clock shift, timeout + manual cạnh tranh; một final.

### LC14-F05 — MAJOR — Ghi local thất bại vẫn báo đã lưu

- affected_files: `index.html:64`, `438–446`; caller input `681–684` và submit `925–930`.
- **VÙNG chịu trách nhiệm: glue**. Mới xác minh LC14; OPEN / VERIFIED.
- evidence: saveLocalState chỉ console.warn ở catch. F05 lưu thành công trước, thay đáp án thành `new`, ép setItem ném QuotaExceededError: durable record không có `new`, badge vẫn **Đã lưu cục bộ**. Markup cũng khởi tạo badge thành công trước lần ghi đầu tiên.
- reproduction_steps: runner F05 bên dưới; hoặc trong DevTools ép localStorage.setItem throw sau một lần save, đổi đáp án/nộp, quan sát badge và reload. VM kiểm handler/badge/storage, không mô phỏng quota của browser thật.
- expected: local_saved chỉ đúng revision đã ghi thành công; lỗi phải hiện rõ chưa lưu/failed và có cách giữ/xuất/retry dữ liệu RAM.
- actual: UI giữ thông báo thành công cho revision cũ dù revision mới chưa được lưu; submit vẫn sang report sau lỗi ghi, không thông báo durability thất bại.
- impact: học sinh tin bài đã lưu, đóng/reload sẽ mất thay đổi mới hoặc lần nộp. Đây là lỗi xử lý failure độc lập với F03 (ghi thành công từ tab stale).
- minimal_fix: state lưu gắn revision; khởi tạo chưa lưu, chuyển saved chỉ sau success, catch chuyển failed/unsaved, báo rõ và cho retry/export recovery. Không hứa local persistence khi setItem thất bại; không tự chọn storage mới thay owner.
- regression_test: first-write denied, thành công rồi quota/security error, submit write fail, retry success, reload record cũ; badge/receipt phải khớp revision bền vững và không mất raw RAM.

## checks_run

Environment: Windows/PowerShell, D:\\Cunata; Node **v24.14.0**, npm **11.9.0**, TypeScript **7.0.2**, Python **3.11.0**. Log artifact: transcript công cụ phiên LC14; không tạo log file khác. Không cộng fixture cases vào số node:test tests.

| Command/check | Exit | Kết quả thực / giới hạn |
| --- | ---: | --- |
| Git status/log/branch/rev-parse/diff + SHA256 inventory | 0 | main, cùng HEAD LC13; product paths sạch, hashes khớp. |
| `npm test` | **0** | **173 pass / 0 fail**, 34 suites; 0 skip/cancel/todo; **404.2402ms**. |
| `npx --no-install tsc -p tsconfig.json` | **0** | Không diagnostics; wall **1.80s**. tsc có sẵn; không dùng ghi chú NOT_RUN cũ thay kết quả thật. |
| `npx --no-install tsc -p tsconfig.web.json` | **0** | Không diagnostics; wall **1.78s**; inline JS/HTML không được typecheck bởi include hiện tại. |
| `node scripts/build.js` | **0** | 4 assets có thật, sample schema hợp lệ 8 câu, link CSS; wall **0.158s**. Script read-only kiểm assets/schema, không compile/bundle hay chạy browser. Không có npm build script. |
| `python -B test/oracle/oracle.py --check` | **0** | **11 pass / 0 fail**, 1632 cases/5 files, 5849 maxima configs, 9 negative controls, seed20261114; duration **1.3585s**. Oracle tự kiểm độc lập, không thay test SUT. |
| Stdin Node web regression runner bên dưới | **1** | **7 tests: 0 pass / 7 fail**, **25.0552ms**; F01,F02a,F02b,F03,F04a,F04b,F05 tái hiện. DOM/storage/timer stub trong VM, không browser thật. |
| Stdin Node public API/oracle + DTO + fractions | **0** | **3 tests: 3 pass / 0 fail**, **124.6271ms**. Test đầu chạy 1632 fixtures, seed `LC14-20261114`. |
| Report QA + snapshot hash check | **0** | UTF-8 không replacement char, đủ trường/5 vùng trách nhiệm, syntax repro hợp lệ; index/scorer/serialize giữ hash. QA nháp trước đó có assertion đếm chuỗi Unicode không khớp (Node exit1; lệnh PowerShell ghép cuối exit0); sửa harness đếm marker ASCII rồi đạt. Không phải lỗi sản phẩm. |
| Browser/mobile/IME/keyboard/AT/axe/Lighthouse/screenshot/trace | — | **NOT_RUN**: vòng này chạy Node VM và static review; chưa thực thi browser lane, không tuyên bố browser E2E PASS. |
| Lint/full SAST/secret/history/dependency audit | — | **NOT_RUN** chuyên biệt; package không có lint script. Search sinks/nguồn chỉ là kiểm tĩnh giới hạn. |
| Google collector/CORS/readback, DOCX/PDF importer | — | **NOT_RUN / NOT_IMPLEMENTED** trong source sản phẩm hiện có; không có integration thật để nghiệm thu. |

Public API runner import `src/domain/index.ts`, so exact fractions total/max và score/max từng phần với toàn bộ 1632 fixtures; JSON DTO roundtrip deepEqual; bounds, sum(points)=total, input không mutate. Sinh presentation order bằng seed LC14, validate permutation, áp optionOrder riêng từng câu I, đảo responses/statement answers, so toàn bộ score/max và từng question result theo ID bất biến. Hai test còn lại xác minh malformed DTO ruleSetId `{toString:null}`/throwing Proxy vẫn ném SyntaxError, fraction strings có LF/CR/CRLF/U+2028 cuối bị reject. LC11 typecheck/DTO vẫn **CLOSED / VERIFIED**; không mở lại lỗi đã sửa. Oracle negative controls không phải full mutation run trên candidate.

## Harness tái hiện (không ghi thêm file test)

Chạy PowerShell: đặt đoạn dưới trong `@' ... '@ | node --input-type=module`, sau đó `exit $LASTEXITCODE`. Các assertion diễn đạt yêu cầu đúng nên **exit1/7fail là bằng chứng lỗi**, không phải 7 ca đạt.

```js
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const script=[...fs.readFileSync('index.html','utf8')
  .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).join('\n');
function page(store=new Map()) {
  const nodes=new Map();
  const c=vm.createContext({console:{warn(){}},document:{getElementById(id){
    if(!nodes.has(id)) nodes.set(id,{value:'LC14',textContent:'',style:{},
      classList:{add(){},remove(){}},addEventListener(){}});
    return nodes.get(id);
  }},window:{addEventListener(){},scrollTo(){}},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  setInterval(fn){c.tick=fn;return 1},clearInterval(){},alert(){}});
  vm.runInContext(script,c); vm.runInContext('showReportView=()=>{}',c);
  return {c,nodes,run:s=>vm.runInContext(s,c)};
}
test('F01 only III full score must be 10',()=>{
  const p=page();
  p.run("currentExam={questions:[{kind:'III',questionVersionId:'q',answerKey:'1,5'}]};studentState.responses={q:'1,5'}");
  assert.equal(p.run('scoreAttemptLocally().total'),10);
});
test('F02a whitespace must not score',()=>{
  const p=page();p.run("studentState.responses={'q08-iii-ung-dung-thuc-te':' 1,5'}");
  assert.equal(p.run("scoreAttemptLocally().questionResults.find(q=>q.questionVersionId==='q08-iii-ung-dung-thuc-te').points"),0);
});
test('F02b input callback must preserve raw',()=>{
  const p=page();
  const h=script.match(/inputEl.addEventListener\('input', (\(e\) => \{[\s\S]*?)\n          \}\);/)[1]+'\n}';
  p.c.e={target:{value:'1.5'}};p.c.q={questionVersionId:'q'};
  p.run('renderExamPane=()=>{};renderPalette=()=>{}');p.run('('+h+')(e)');
  assert.equal(p.c.e.target.value,'1.5');
});
test('F03 stale save must preserve final',()=>{
  const store=new Map(),a=page(store),b=page(store);a.run('submitExam()');
  assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
  b.run('saveLocalState()');
  assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted,true);
});
test('F04a one hour elapsed must auto-submit',()=>{
  const p=page();p.run('Date.now=()=>0;startTimer();Date.now=()=>3600000');
  p.c.tick();assert.equal(p.run('studentState.submitted'),true);
});
test('F04b restore after deadline must auto-submit',()=>{
  const store=new Map(),a=page(store);
  a.run('Date.now=()=>0;startTimer();saveLocalState()');
  const b=page(store);b.run('Date.now=()=>3600000;loadLocalState();startTimer()');
  assert.equal(b.run('studentState.submitted'),true);
});
test('F05 failed latest write must revoke saved status',()=>{
  const store=new Map(),p=page(store);p.run('saveLocalState()');
  const previous=p.nodes.get('syncText').textContent;
  p.run("studentState.responses.q='new';localStorage.setItem=()=>{throw new Error('QuotaExceededError')};saveLocalState()");
  assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).responses.q,undefined);
  assert.notEqual(p.nodes.get('syncText').textContent,previous);
});
```

## coverage_gaps và traceability

| Yêu cầu | Bằng chứng | Gap / giới hạn |
| --- | --- | --- |
| B1-AC01/02/03, T01–09 | 173 tests có golden, II exhaustive 1296 vectors, oracle/API1632, exact rational | Domain đạt các ca đã chạy; web vi phạm F01/F02, display policy chưa duyệt. |
| B1-AC04/05, T11–15 | ID validation/shuffle; seeded API permutations/DTO/bounds/non-mutation | Web thiếu attempt/version/order snapshot; bank immutable versions/migrations chưa triển khai. |
| B1-AC06, T10/13 | Invalid schema/unit tests, DTO exception regression | Chưa vét cạn payload/resource abuse, getter đổi giá trị, giới hạn phân số/response cực lớn; không chứng nhận mọi unknown input. |
| B1-AC07/08, T16/17 | Checks thật, review/delta/hash/limitations | Chưa full candidate mutation, lint, browser integration, owner acceptance/rollback milestone. |
| Student/offline/timer/report | VM thực thi scorer/input/save/submit/timer; F03–F05 | Không browser quota/concurrency/offline cold-start/print artifact; VM không thay các kiểm thử này. |
| UX/a11y/security/math | Đọc CSS/DOM handlers/renderMathText/innerHTML | Chưa mobile/keyboard/contrast/focus/IME/math layout; không có screenshot/trace thực. |

`test/e2e/demoFlow.test.ts` đọc assets/HTML và tự tính constants trong test, không chạy input→submit→report. Typecheck chỉ bao gồm TS nguồn/test theo config; script build không kiểm JavaScript inline. Vì vậy cả ba check xanh vẫn có thể cùng tồn tại với các repro web đỏ.

`renderMathText`/innerHTML chưa escape nội dung câu hỏi/answer/lời giải là rủi ro khi nối nguồn không tin cậy. Hiện nguồn là sample tĩnh và local state; chưa chứng minh exploit qua importer/bank chưa tồn tại, không gắn finding exploit đã xác minh. Answer key nằm trên client nên sample phù hợp luyện tập; chưa có mô hình kiểm tra cần giấu key/trusted grading. Không có collector để chứng minh CORS/receipt/dedupe hay không lộ credential qua integration. Search nguồn giới hạn không tương đương security certification.

## Tính năng lộ trình còn thiếu — theo ưu tiên

1. **P0 — Chấm/report web qua domain:** sửa F01/F02, validate dữ liệu/rules, giữ raw/rational; max5/15/16 và III phân số lặp; regression thực thi frontend.
2. **P0 — Độ bền bài làm và thời hạn:** sửa F03–F05; stable attempt/version/order snapshot, final idempotent, conflict nhiều tab, deadline, recovery/quota/migrations, trạng thái lưu đúng revision; offline/reload browser thật.
3. **P1 — Luồng học sinh và báo cáo:** chọn đề/nickname, cấu hình thời gian/lượt/trộn hai cờ độc lập/lời giải, startedAt/endedAt, báo cáo HTML/PDF xem offline, chính sách công bố key; chưa có bản tải báo cáo được kiểm định, hiện chỉ window.print.
4. **P1 — Soạn đề/ngân hàng:** môn→lớp→chủ đề→bài→mức độ, reuse, immutable QuestionVersion/ExamVersion, preview/publish/export/import/backup/delete; luồng giáo viên local/private không giả phân quyền khi MVP không login.
5. **P1 — Thu kết quả theo phương án được duyệt:** Google/Apps Script/gateway, receipt/readback/CORS thật, outbox/retry giới hạn/backoff/dedupe, local_saved/queued/sending/server_confirmed/failed, trusted grading khi cần kiểm tra bảo mật. Chưa triển khai backend/collector.
6. **P2 — Import DOCX/PDF:** đọc→IR→preview/chỉnh→confirm→export; math/table/image/OMML/provenance, text/scan/OCR uncertainty, không đoán key; resource limits/corpus regression. Chưa implementation.
7. **P2 — Mẫu chuẩn THPT:** registry môn/năm/nguồn quy định đã kiểm chứng và phê duyệt; không coi custom-v1 là mẫu chuẩn.
8. **P2 — Hoàn thiện/nghiệm thu:** mobile/IME/keyboard/a11y, math/layout/print, privacy/export/delete guidance, security/performance/audit, browser E2E/CI/changelog/rollback và owner acceptance. Class/assignment ở giai đoạn sau.

## NEED_DECISION — không tự chốt chính sách

Các quyết định sau chưa có bằng chứng duyệt trong tài liệu bắt buộc; chúng không hợp thức hóa các lỗi F01–F05:

| Quyết định | 2–3 phương án để owner chọn | Phần bị chặn |
| --- | --- | --- |
| Grammar III | A: giữ sa-charset-v1 chỉ charset/length; B: grammar hẹp với policy version mới; C: grammar theo preset/version được duyệt | Validator mở rộng; không đổi exact matching bài cũ. |
| Hiển thị điểm | A: phân số exact; B: decimal theo số chữ số và rounding mode owner chỉ định, giữ fraction nguồn; C: decimal xấp xỉ kèm fraction | Chốt renderer/report; không làm tròn scoring. |
| Limit/grouping | A: duyệt tạm1000 và grouping I→II→III khi bật trộn, tắt giữ gốc; B: chọn limit/grouping khác kèm version/tests | Chính sách giới hạn/trộn chính thức; hiện chỉ giả thiết hợp đồng kỹ thuật. |
| Storage/collector/format report | A: local practice + HTML export; B: collector được duyệt quyền/retention/CORS/authority + HTML; C: local practice + PDF sau đánh giá công nghệ | Chọn hạ tầng, chi phí và production; không coi sample localStorage là owner approval kiến trúc. |

assumptions: NONE mới; giữ các giả thiết tạm của hợp đồng ở trạng thái chờ duyệt, không tự tạo quy tắc nghiệp vụ. recommended_action: giao **glue** sửa F01–F05, thêm regression fail-base/pass-fix, giữ domain/DTO/typecheck đã đạt; review lại bytes thay đổi và browser integration trước nghiệm thu. tools_research: không giao nghiên cứu/cài tool mới. privacy_notes: chỉ kết quả kỹ thuật/dữ liệu thử; không chép nội dung chỉ thị riêng.
