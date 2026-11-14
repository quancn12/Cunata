# LC22 — Kiểm định độc lập toàn sản phẩm

review_id/task_id: LC22; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 + M1-scoring-contract v1.0; risk_level: HIGH.

**verdict: CHANGES_REQUESTED.** Không nghiệm thu toàn sản phẩm. Suite chính cuối xanh **212/212**, hai typecheck và asset verification exit0. Còn ba findings MAJOR: parser/khôi phục report, HTML injection ở report và SVG nhúng không hợp XML. Domain không có counterexample tính điểm trong 1.632 fixtures; điều này không chứng nhận UI, concurrency, collector hoặc importer.

## Snapshot và phạm vi

- base_commit/head_commit khi bắt đầu: `761aba92679153d4d649069735fdb4088229ff52`, main; review HEAD cộng working tree, không branch/worktree/commit/deploy. LC21 cuối cùng cũng đã ở commit này. `git log` trước đó: 84c425f, 9c4cb17, f2447ae, 2ee84e3.
- Snapshot đầu index SHA256 `3AE76DAA73471A98BB24491E5EDEE7734D7EF3240C0E3A2F662DD27C3C3720CB`, đúng LC21 cuối. Test SHA256 `B1EE318BDE9EEDB8632F5EC68FF7CB44002879590D9A399044775C0C17888589`.
- Worker sửa index trong khi review: snapshot giữa `0C692C2E0B635E36ED5676C39C2057AE6F8EE70B028BA49456D542DCD100BC3F` thêm canonical fraction/status/finite checks; kế tiếp `673D70685EA0A2A8C88609D84D9B49E269A4D13AFD46E798135D3B96C11CA640` thêm EMBEDDED_ASSETS và nhánh renderMathText(text,isStandalone). Các kết quả dưới phân biệt snapshot; không gán lỗi cũ đã sửa cho bytes mới.
- **Snapshot chốt evidence**: index `25C5B2A74691044C1584ABCAE0A421A811422A669DABED2954FCD5FF7627C867` (98.999 bytes); test `AE235E7E4D3E7FC6EFCDE0F8B0EE25CF72BD737A60D4DDA4465D597603A9745B`. Worker đã nối isStandalone=true ở export và thêm2 regression. HEAD vẫn761aba9; report áp dụng các bytes này, không tự chứng nhận thay đổi tiếp sau.
- files_reviewed: đọc domain modules và các đường gọi inline `index.html` (validate → init → input → localStorage → timer → submit → on-page/offline report), đọc chọn lọc regressions của `test/e2e/demoFlow.test.ts`, tìm assertions/fixtures trong test acceptance/domain; đọc build script, phần đầu generator `scripts/update-index.js`, package.json/tsconfigs, README, LC21 và repro helpers LC19–20. Suite domain/acceptance/e2e đã chạy; fixtures/sample JSON được parse/chấm trong harness; SVG nguồn được đọc và parse. Package lock/styles kiểm inventory/diff và asset check, không audit toàn nội dung. Không thực thi generator vì ghi ngoài scope. Đọc source chọn theo risk/callers, không tuyên bố line-by-line mọi file hoặc mọi test.
- Không diff domain/package/lock/tsconfigs/public so HEAD lúc kiểm. Không tìm thấy AGENTS.md trong inventory workspace. Các file ops/dashboard/review cũ và script probe đã dirty/untracked từ trước hoặc do worker khác; reviewer chỉ tạo file này. Không đọc prompt riêng worker khác.

## Findings

### LC22-F01 — MAJOR — Parser nhận report không nhất quán và thiếu payload Part II

- **VÙNG chịu trách nhiệm: glue**. affected_files: `index.html:707–737` (isValidScoreResult), các đường adopt tại load/save/submit; `index.html:1795–1815` (showReportView). Line anchors trên snapshot 673D7068; tìm theo tên hàm nếu worker tiếp tục đổi dòng.
- evidence/reproduction_steps: lấy report từ scoreAttemptLocally trên đề III một câu hợp lệ (key `1`, max10). (A) đổi `totalFraction='999'`, `total=999`, giữ section scores/max nguyên; lưu envelope đúng examId/version/attemptId, submitted=true rồi loadLocalState. (B) report hợp lệ đó đổi questionResults[0].kind='II', xóa stDetails; lưu/restore tương tự. **Cả A và B vẫn studentState.submitted=true**, probe expected reject FAIL trên 0C692C2E. A cho total999/max10 dù các phần0; B qua parser vì chỉ validate stDetails khi nó đã là array, trong khi on-page renderer gọi stDetails.map vô điều kiện cho II.
- expected: dữ liệu lỗi không được nhận thành final đã khóa; schema, kind/ID set, các trường phụ thuộc kind và tổng/từng phần phải nhất quán trước adopt. actual: kiểm từng trường chưa kiểm quan hệ; kind còn optional. Đây là lỗi độ bền/khôi phục client, không phải bằng chứng backend tin điểm client hoặc lỗi phép tính domain.
- impact: có thể khóa attempt với report sai hoặc không render được khi local data hỏng/không tương thích; Shared §2/3/5, B1-AC04/06, T13.
- minimal_fix: parser versioned kiểm required fields theo kind, map đúng snapshot đề và kiểm exact totals/max/status consistency. Có thể tái tính từ snapshot+raw đã validate. Quarantine raw lỗi và cho recovery, không âm thầm báo đã lưu thành công. Dùng cùng parser cho mọi đường adopt.
- regression_test: valid roundtrip; canonical fractions; total>max, total≠sum sections, foreign/duplicate/missing IDs, kind sai/thiếu, II thiếu hoặc sai stDetails; thử restore/save/submit và render thực. Assert reject trước submitted lock, giữ raw phục hồi. **Repro LC21 `totalFraction='INVALID'` đã FIXED/RETESTED trên 0C692C2E**; không còn dùng ca đó làm bằng chứng OPEN. Fraction resource limits vẫn chưa được chứng nhận.
- retest cuối25C5B2A7: malformed fraction rejection PASS; total999 và II thiếu stDetails vẫn được adopt (2 assertions FAIL). Test mới LC21-F04 còn tự đổi totalFraction='1/2' nhưng giữ total=0/sections0 rồi assert restore thành công, nên chưa chống inconsistency.

### LC22-F02 — MAJOR — Dữ liệu câu trả lời và rich content đi thẳng vào HTML report

- **VÙNG chịu trách nhiệm: glue**. affected_files: `index.html:760–803` renderMathText; `index.html:1795` qr.userAnswer concatenation, `:1810` item.innerHTML; `:1830–1890` offline rich-content renderer (anchors 673D7068).
- evidence/reproduction_steps: lưu draft đúng identity với raw III `<img src=x onerror="globalThis.__lc22=1">`, loadLocalState, submitExam. Scorer đánh `invalid`/0 điểm đúng nhưng original showReportView vẫn đưa nguyên payload vào item.innerHTML. Harness LC22 giữ hàm showReportView thật, chỉ capture DOM sink; observed payload sink=true. Ca khác: đưa `<img src=x onerror="globalThis.__lc22=2">` vào content đề, validateExamVersion.ok=true, generateOfflineReportHtml vẫn giữ nguyên attribute onerror. Hai expected escaping assertions FAIL trên 0C692C2E.
- expected: raw answer hiện như text; rich text/math/images chỉ sinh HTML từ tập cú pháp/URL đã kiểm, không mang event handlers hoặc markup thực thi. actual: on-page answer không escape; renderMathText bắt đầu với raw text và chỉ thay regex, không sanitize. Offline đã escape nickname/raw answer nhưng content/explanation còn raw.
- impact: HTML injection được xác minh ở output/sink; nguy cơ stored script execution khi có nội dung không tin cậy trong storage/đề và mở report. **Browser execution, remote delivery, exfiltration NOT_RUN / NOT VERIFIED**; không báo một exploit remote đã chạy. Raw draft injection cần seed localStorage; không khẳng định ô maxlength4 cho phép gõ payload dài bằng thao tác thường. Rich exam payload là fixture kiểm boundary, chưa có importer public.
- minimal_fix: textContent cho answers/titles/labels; escape text trước khi render cú pháp cho phép, kiểm image URL/attributes và sanitize rich HTML theo chính sách rõ. Không chỉ sửa generator offline mà bỏ on-page. Không tự thêm dependency khi chưa duyệt.
- regression_test: raw restored answer, titles/labels/content/options/statements/explanations với `<img onerror>`, SVG/events, quote/URL payload; giữ Unicode/math/ảnh hợp lệ. Assert không còn active markup ở sink; bổ sung browser test với marker vô hại, offline report và reload. Không cắt/sửa raw để che injection hay đổi exact grading.
- retest cuối25C5B2A7: cả on-page raw-answer và offline rich-content escaping assertions vẫn FAIL, không chỉ nhận xét trên bytes cũ.

### LC22-F03 — MAJOR — SVG nhúng trong báo cáo offline không hợp XML

- **VÙNG chịu trách nhiệm: glue**. affected_files: `index.html:755–757` EMBEDDED_ASSETS (cả hai entries), `:768–770` data URI encoder, `:1830` export content call; anchors25C5B2A7.
- evidence/reproduction_steps: sample-exam.json → scoreAttemptLocally → generateOfflineReportHtml; lấy src data:image/svg+xml;utf8 đầu tiên, decodeURIComponent, chuyển JSON qua Python ElementTree.fromstring. **exit1: ParseError undefined entity: line1,column1155**, index hash25C5B2A7. SVG nhúng chứa named entity `&infin;` không được khai báo trong XML. Control `ElementTree.parse('public/q01-bbt.svg')` **exit0**, nguồn thật hợp XML. Bản nhúng đã biến đổi nội dung nguồn.
- expected: file tải riêng mang ảnh SVG hợp lệ, giữ bảng biến thiên q01. actual: URI self-contained nhưng payload không parse thành XML hợp lệ. Browser render/download-open NOT_RUN; đây là lỗi dữ liệu SVG đã chứng minh, không tuyên bố đã có screenshot ảnh vỡ.
- impact: renderer SVG không thể đọc payload chuẩn, đe dọa hình cần để hiểu câu sai; Shared §2 report offline. **LC21-F08 relative-path repro đã FIXED/RETESTED**: cuối25C5B2A7 không src tương đối và có data URI; không giữ nguyên kết luận helper chưa nối của snapshot trung gian673D7068.
- minimal_fix: đóng gói đúng bytes asset đã validate hoặc dùng ký tự∞/numeric entity&#8734; thay vì entity HTML chưa khai báo; kiểm cả hai alias. Giữ safe URLs/SVG và limits. Placeholder chỉ có tên file không thay nội dung hình; asset chưa hỗ trợ cần cảnh báo rõ.
- regression_test: decode và parse từng SVG export bằng XML parser độc lập, so nội dung/ảnh với source; kiểm actual img load/naturalWidth hoặc screenshot offline trong thư mục trống. Presence test data URI hiện có vẫn PASS với XML hỏng. Thêm ảnh khác/Unicode/công thức và báo asset chưa hỗ trợ.

## checks_run

Môi trường: Windows/PowerShell, D:\Cunata; Node24.14.0, npm11.9.0, Python3.11.0, TypeScript sẵn có. Không cài gì, không ghi logs ngoài scope. Bằng chứng output/exit nằm trong tool transcript.

| Command/check | Exit | Kết quả và giới hạn |
| --- | ---: | --- |
| git status/log/diff/rev-parse; hashes/inventory | 0 | Snapshot và delta nêu trên; rg inventory có exit2 khi tìm thư mục web không tồn tại, không phải build failure. |
| npm test — snapshot đầu | 0 | 210 tests,34 suites,210 pass/0 fail,0 skipped/cancelled/todo; duration_ms403.2716. |
| npm test — rerun trong lúc worker thêm asset helper | 0 | 210 tests,34 suites,210 pass/0 fail,0 skipped/cancelled/todo; duration_ms422.2985. Hash được đọc riêng sau lệnh, không gọi đây là atomic snapshot verification. |
| npx --no-install tsc -p tsconfig.json — đầu/cuối | 0/0 | Không diagnostics; cuối1.1918s. |
| npx --no-install tsc -p tsconfig.web.json — standalone rerun | 0 | Không diagnostics,1.1625s; inline HTML JS không được tsc check, JS scripts chưa checkJs. |
| node scripts/build.js — đầu/rerun | 0/0 | 4 assets + sample8 câu hợp schema; index92.078 rồi98.881 bytes. Đây là asset/schema verification, không bundler, render hay deploy. |
| python -B test/oracle/oracle.py --check | 0 | 11 tests,11 pass/0 fail;1.632 fixtures,5.849 maxima,9 negative controls,seed20261114,duration_s1.0279. Oracle tự kiểm, tách với SUT. |
| LC20 JS fenced blocks qua Node stdin — 3AE76DAA | 0 từng block | 18/0 +6/0 +9/0=33 pass/0 fail. Domain và web mỗi bên khớp1.632 fixture totals/max/sections; domain DTO roundtrip PASS. |
| LC21 block — 3AE76DAA | 1 | 4 checks,2 pass/2 fail: malformed fraction reject và asset packaging FAIL; crash assertion và legacy draft restore PASS. Shell cùng lần chạy các blocks kết thúc exit1, không gọi toàn command PASS. |
| LC22 initial probes — 3AE76DAA | 1 | 3 checks,0 pass/3 fail: on-page answer escaping, offline rich HTML escaping, total>max rejection. |
| LC22 six probes — 0C692C2E | 1 | 6 checks,1 pass/5 fail: malformed fraction reject PASS; total>max reject, missing II details reject, on-page escaping, rich HTML escaping, sample packaging FAIL.0.086s. |
| npm test — FINAL25C5B2A7 / testAE235E7E | 0 | **212 tests,34 suites,212 pass/0 fail**,0 skipped/cancelled/todo,duration_ms383.306. Hai regression mới kiểm canonical fraction và URI presence. |
| npx --no-install tsc -p tsconfig.json; npx --no-install tsc -p tsconfig.web.json — FINAL | 0/0 | Chạy riêng từng lệnh, không diagnostics;1.1737s/1.1915s. |
| node scripts/build.js — FINAL | 0 | index98.999,CSS17.769,JSON8.566,SVG2.584 bytes; sample8 câu. |
| LC20 blocks — FINAL25C5B2A7 | 0 từng block | **33 pass/0 fail**, gồm domain/web1.632 fixtures mỗi bên và DTO roundtrips. Combined command sau đó exit1 do LC22 defects, không phải LC20 fail. |
| LC22 block bên dưới — FINAL25C5B2A7 | 1 | **6 checks,2 pass/4 fail**: reject malformed fraction và sample data URI PASS; reject total>max, reject II thiếu details, on-page escape, offline rich HTML escape FAIL. |
| Node extract SVG URI → python -B ElementTree.fromstring | 1 | ParseError undefined entity line1,column1155; hash25C5B2A7. Không tạo asset/log file. |
| python -B ElementTree.parse(public/q01-bbt.svg) control | 0 | Source SVG XML PASS. |
| Browser desktop/mobile/IME/keyboard/AT/2 tabs/download-open/screenshots/axe/Lighthouse | — | NOT_RUN; VM DOM/storage/timers không phải browser E2E. |
| Lint/full SAST/secrets history/dependency advisory audit | — | NOT_RUN; không tooling/script đã setup cho full audit. Search source không chứng nhận security PASS. |
| Collector/CORS/receipt/readback; DOCX/PDF import | — | NOT_IMPLEMENTED / NOT_RUN trong product source. Không endpoint/importer thật để test. |

## Probes LC22 tái lập không tạo file khác

Trích JS block dưới, pipe vào `node --input-type=module` tại root. Helper LC19 chỉ DOM/storage/timer stub; bỏ override showReportView để kiểm sink thật. Assertions là yêu cầu cần đạt; exit1 phản ánh defect còn tồn tại. Không chạy prompt hoặc generator worker.

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8').match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0].replace("vm.runInContext('showReportView=()=>{}',c);",'');
const probes=String.raw`
let pass=0,fail=0;
function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
for(const [label,mutate] of [['malformed fraction',r=>{r.totalFraction='INVALID'}],['score exceeds max',r=>{r.totalFraction='999';r.total=999}],['missing II details',r=>{r.questionResults[0].kind='II';delete r.questionResults[0].stDetails}]])check('restore rejects '+label,()=>{
 const p=page();setExam(p,exam());const r=p.run('scoreAttemptLocally()');mutate(r);
 p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{},submitted:true,scoreResult:r}));p.run('loadLocalState()');assert.equal(p.run('studentState.submitted'),false);
});
check('on-page report escapes restored raw answer',()=>{
 const p=page();setExam(p,exam());const payload='<img src=x onerror="globalThis.__lc22=1">';
 p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{q:payload},submitted:false}));p.run('loadLocalState()');
 const captured=[];p.c.document.createElement=()=>({innerHTML:'',className:''});p.c.document.getElementById('reviewQuestionsList').appendChild=node=>captured.push(node.innerHTML);
 p.run('submitExam()');assert.equal(p.run('studentState.scoreResult.questionResults[0].status'),'invalid');assert.equal(captured.some(s=>s.includes(payload)),false);
});
check('offline report escapes active rich HTML',()=>{
 const p=page(),ex=exam();const payload='<img src=x onerror="globalThis.__lc22=2">';ex.questions[0].content=payload;setExam(p,ex);assert.equal(p.run('validateExamVersion(currentExam).ok'),true);assert.equal(p.run('generateOfflineReportHtml(scoreAttemptLocally())').includes(payload),false);
});
check('offline report packages sample SVG',()=>{
 const p=page();setExam(p,JSON.parse(fs.readFileSync('public/sample-exam.json','utf8')));const out=p.run('generateOfflineReportHtml(scoreAttemptLocally())');assert.equal(/src="public\/q01-bbt\.svg"/.test(out),false);assert.ok(out.includes('data:image/svg+xml;utf8,'));
});
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probes).toString('base64'));
```

## coverage_gaps và trạng thái các yêu cầu

- Shared §2/B1-AC01–03/T01–09: exact rational, I=1/4, exhaustiveII16×81, exactIII, max5/15/16, repeating fractions covered bằng unit/oracle/differential. Không phát hiện sai phép tính; chưa full status/schema differential giữa hai engine tách biệt. Display rounding chưa owner duyệt.
- Shared §3/5/B1-AC04–06/T11–15: nhiều identity/storage simulated races PASS. Chưa immutable ExamVersion+PresentationOrder persisted, attempt-sample-01 còn cố định, chưa chọn/tìm lượt làm; migrations/quota recovery/cold-start offline cần triển khai/kiểm thật.
- LC20-F01: repro final/final cũ vẫn PASS; read(finalKey)→set(finalKey) vẫn không atomic transaction/CAS. Race đúng khe cuối là SUSPECTED / NOT VERIFIED trong browser; không dùng callback giả như bằng chứng scheduler thật, không gọi thêm read là đủ concurrency.
- LC20-F02 và LC21-F11: các repro namespace/key isolation và suite gate tiếp tục PASS. Legacy draft một dạng PASS không chứng minh mọi migration. Keyboard assertions chủ yếu source strings; chưa test focus/AT/IME/Telex-VNI/mobile thật.
- Shared §4/6: chỉ local practice demo với keys public; không phù hợp kỳ thi cần giấu key/trusted grading. Bank/builder/collector/importer chưa có, không mô tả là hoàn thành. Không service-worker/offline shell trong inventory product.
- B1-AC07–08: có test evidence thật; chưa SUT mutation suite/full coverage, browser lane/security/performance/CI/changelog/rollback/owner acceptance đầy đủ. Không đánh đồng tên test/e2e với browser, build asset check với rendered UI.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0:** sửa F01/F02; chốt report asset F03 qua đường export thật; final coordination, snapshot/version/order/raw và recovery/migration trước nghiệm thu student milestone.
2. **P1:** student flow chọn đề/lượt, teacher settings duration/shuffle hai cờ/lượt/answer-release; persisted shuffle và browser reload/offline/background autosubmit/hai tab/keyboard/IME/mobile; cold-start offline theo lựa chọn đã duyệt.
3. **P1:** ngân hàng môn>lớp>chủ đề>bài>mức độ, builder bật/tắt phần, reuse và immutable versions, preview/publish, export/import/backup/delete; vai trò no-login không giả phân quyền thật.
4. **P1:** collector owner-controlled đã duyệt; CORS/receipt/readback thật, outbox local_saved/queued/sending/server_confirmed/failed; bounded retry/backoff/idempotency/conflict; trusted grading khi cần bảo mật.
5. **P2:** DOCX/PDF → IR/provenance/confidence/flags → preview/sửa/confirm; text/tables/images/OMML/math, PDF text/scan/OCR; missing key không đoán; limits/corpus tests.
6. **P2:** preset THPT theo môn/năm/nguồn chính thức đã kiểm chứng, tách custom-v1; privacy/a11y/performance/CI, license/security checks, rollback/changelog và owner acceptance; Class/Assignment sau.

## NEED_DECISION — giữ mở, không tự chốt

| Quyết định | Phương án cho owner |
| --- | --- |
| Grammar III | A giữ charset/length; B grammar hẹp bằng inputPolicyId mới; C grammar theo preset được duyệt. |
| Rounding hiển thị | A fraction exact; B chọn digits/mode, giữ rational; C fraction kèm decimal xấp xỉ có policy. |
| Limits và grouping shuffle | A duyệt tạm1000/nhóm I→II→III; B chọn limits/grouping khác có version và regression. |
| Persistence/collection/report stack | A local practice+HTML; B collector được duyệt+HTML; C PDF sau đánh giá. Coordination/storage chính cần owner duyệt theo Shared §1/8. |
| Preset THPT | A hoãn, custom-v1; B chọn môn/năm/nguồn chính thức trước triển khai. |

assumptions: NONE mới; giữ giả thiết tạm M1 được gắn nhãn. recommended_action: giao glue sửa findings OPEN, giữ regressions đã xanh, bổ sung browser/security/download lane và chốt trên hashes mới trước nghiệm thu. Quyết định mở không trì hoãn sửa invariant đã rõ. tools_research: không giao nghiên cứu/cài mới. privacy_notes: chỉ kết quả kỹ thuật/dữ liệu thử, không chứa chỉ thị riêng hoặc credentials.
