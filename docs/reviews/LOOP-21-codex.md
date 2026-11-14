# LC21 — Kiểm định độc lập toàn sản phẩm

review_id/task_id: LC21; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 + M1-scoring-contract v1.0; risk_level: HIGH.

**verdict: CHANGES_REQUESTED.** Snapshot chốt evidence `3AE76DAA…C3720CB`, test `B1EE318B…88589`: npm test cuối **210 pass/0 fail**, hai typecheck exit 0, web asset verification exit 0. Các 33 probes kế thừa LC20 đều PASS; domain/web khớp 1.632 fixtures mỗi bên, domain DTO roundtrip PASS. Còn hai findings MAJOR: parser report chưa chặt và report offline thiếu đóng gói hình. F11 stale test đã được worker sửa trước khi chốt. Không nghiệm thu toàn sản phẩm; các quyết định nghiệp vụ còn mở được bàn giao `NEED_DECISION` ở cuối.

## Snapshot, delta và phạm vi thực đọc

- base_commit/preflight HEAD: `84c425f8f022c57c2611883c0e504dd9b5c2dcce`, branch main, review HEAD cộng working tree. Khi kiểm cuối, coordinator đã tạo commit **`761aba92679153d4d649069735fdb4088229ff52`** (forever round4). head_commit cuối là 761aba9; product bytes giữ đúng hai hashes chốt ở trên. Reviewer không chạy commit. Log trước đó là `84c425f`, `9c4cb17`, `f2447ae`, `2ee84e3`; report được coordinator track trong lúc reviewer đang hoàn tất, nên phần cập nhật cuối còn dirty.
- LC20 cuối index SHA256 `53AB76C228C1C6687A56DB55C2A77D7C24E56195129E6CF7A63DB3B1C9F007BB`. LC21 đầu `6886BD8891FADF19ECB79B4B689F2CFA8D5C544101DEBC91D939D51C48BC1C41`; giữa `F84EA9C7374BB4D141464830AFE9A54B99028489AC269F4CE1729DDB89C9BDE1`, `0FDFDEF62D97E65AEBE6490DB92B9D489ED6B9FAC65F312A7316A73557C68B59`, `0D80096D4EBAB20EC375EC2CEB009C83C745CADA24958BF41D93295BB7A2086C`; cuối **`3AE76DAA73471A98BB24491E5EDEE7734D7EF3240C0E3A2F662DD27C3C3720CB`**, 92.078 bytes.
- Worker sửa source trong lúc review. Kết luận finding dưới đây áp dụng snapshot cuối, không gán lỗi của bytes đầu cho bytes cuối. `test/e2e/demoFlow.test.ts` đầu SHA256 `6CC0E8DF69EFDF6969E300FEFB65521F207C79B017EF7B1E89664459ED534BB6`, cuối **`B1EE318BDE9EEDB8632F5EC68FF7CB44002879590D9A399044775C0C17888589`**: sửa key helper/assertions và thêm5 tests. README cũng được worker sửa trong phiên; không phải thay đổi của reviewer. Không có diff domain/package/lock/tsconfig/scripts/styles/public so HEAD.
- Delta xác minh so LC20: storage key dùng tuple encodeURIComponent, không gộp version/alias; parser dùng chung isValidScoreResult ở restore/save/submit; restore legacy bare key; reconcile final sau draft write và trước final write; radio roving tabindex/arrow/focus restoration; snapshot và render text options/statements trong HTML report. Diff Git so HEAD là tích lũy, không phải riêng delta LC20→21.
- files_reviewed: `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; `index.html` từ fetch/embedded→validate→restore→input/render→save/timer→submit→report/restart; tests domain/acceptance/VM và fixtures/assertions liên quan; oracle Python; public sample JSON/SVG, CSS, package/lock, hai tsconfigs, README/build script, LC19/LC20 và READINESS §6. Đọc theo data flow/rủi ro, không tuyên bố vét cạn mọi input.
- Không tìm thấy AGENTS.md trong inventory workspace hoặc D:\AGENTS.md. Các file ops/dashboard/workers/reviews trước đã dirty/untracked ở preflight; không sửa/revert. Chỉ tạo file báo cáo này; không sửa source/test/config, không install, branch/worktree, commit hay deploy. Không chạy scripts/update-index.js vì script ghi source.

## Findings

### LC21-F04 — MAJOR — Report parser chỉ kiểm kiểu chuỗi, nhận phân số không parse được

- **VÙNG chịu trách nhiệm: glue**. affected_files: `index.html:690–704`, `index.html:972–989`, formatter `index.html:417–447`; caller report `index.html:1690–1704`, `index.html:1818–1833`. Tiếp nối LC20-F04, PARTIALLY FIXED / OPEN.
- evidence/reproduction_steps: tạo report hợp lệ bằng scoreAttemptLocally, sửa duy nhất `totalFraction='INVALID'`, lưu envelope đúng examId/version/attemptId và submitted=true vào getStorageKey, gọi loadLocalState. **studentState.submitted=true**; gọi generateOfflineReportHtml trên report đó ném lỗi BigInt. Probe độc lập fail, assertion kiểm generator ném lỗi PASS trên hash chốt.
- expected: parse đầy đủ score fractions và schema/identity trước adopt, không khóa bài bằng report không render được. actual: typeof string là đủ qua parser; denominator, canonical fraction, status enum, kind/ID set và consistency chưa được kiểm đầy đủ. Các khuyết thiếu khác là nhận xét source, chưa tính như thêm ca đã tái hiện.
- impact: bài bị khóa đã nộp nhưng report không mở được khi storage lỗi hoặc schema không tương thích; vi phạm Shared §2/3/5. Đây là độ bền dữ liệu client, không phải chứng nhận trusted grading hay một khai thác remote đã chạy.
- minimal_fix: parser versioned dùng canonical fraction parser có giới hạn, kiểm schema/status/kind/IDs và các tổng; dùng đồng nhất ở mọi đường adopt. Quarantine raw lỗi và cho recovery; không âm thầm mất dữ liệu rồi báo đã lưu. Có thể tái tính từ validated snapshot/responses khi phù hợp.
- regression_test: valid roundtrip; invalid fraction/zero denominator/noncanonical/field thiếu/foreign ID/unknown status và stale schemas qua load/save/submit. Assert reject trước khóa, không crash, giữ raw phục hồi. Các repro cũ `[null]`, `{}`, report thiếu tất cả fraction và II string đã PASS, không còn là bằng chứng lỗi hiện tại.

### LC21-F08 — MAJOR — HTML offline vẫn trỏ hình tương đối tới host

- **VÙNG chịu trách nhiệm: glue**. affected_files: `index.html:723–746`, `index.html:1780–1788`, `index.html:1831–1850`; fixture `public/sample-exam.json` q01. Tiếp nối LC20-F08, PARTIALLY FIXED / OPEN.
- evidence/reproduction_steps: load public/sample-exam.json vào VM, gọi generateOfflineReportHtml(scoreAttemptLocally()). Chuỗi vẫn chứa **`src="public/q01-bbt.svg"`**; không có bước đóng gói tài nguyên trong Blob. Lưu HTML ra thư mục Downloads riêng thì URL đó được giải theo Downloads/public, không theo thư mục app. Đây là output/schema evidence; tải/mở trong browser thật NOT_RUN.
- expected: Shared §2 cho xem câu sai offline: hình cần cho đề vẫn có trong file tải độc lập. actual: code render đường dẫn tương đối; file đơn không mang SVG theo.
- impact: q01 phụ thuộc bảng biến thiên bị thiếu hình trong report được tách khỏi thư mục web. Text lựa chọn và mệnh đề đã sửa và probes PASS; không tiếp tục báo thiếu các text đó trên snapshot cuối.
- minimal_fix: snapshot/đóng gói asset có quyền và được validate, bằng data URI hoặc gói HTML+assets có cấu trúc rõ. Không để report phụ thuộc đường dẫn host; áp limits và safe URL/SVG handling.
- regression_test: sample SVG và ảnh/công thức/Unicode, tất cả options/statements và metadata; tải vào thư mục trống, offline hoàn toàn, mở kiểm hình và đọc câu sai. Assert report không còn URL tương đối bắt buộc tài nguyên ngoài gói.

### LC21-F11 — CLOSED / RETESTED — Suite regression dùng namespace và keyboard assertion cũ

- **VÙNG chịu trách nhiệm: glue**. severity lúc phát hiện: MAJOR; affected_files trước sửa: `test/e2e/demoFlow.test.ts:227–232`, `:267–276`, `:358`, `:411`, `:533`, `:545–549`, `:749–753`; production keys `index.html:665–676`, roving tabindex `index.html:1128–1129`. **Trạng thái cuối: CLOSED cho gate đỏ/stale key; browser keyboard behavior vẫn coverage gap.**
- evidence/reproduction_steps: chạy npm test: cuối 205 tests, 198 pass/7 fail, exit1. Sáu ca LC13-F03/LC15-F05/LC16-F03/LC17-F01/LC18-F01/LC18-F02 đọc hardcoded `cunata_exam_attempt_v1` dù writer đã dùng namespace mới, gặp undefined thay true/'new'. Ca LC20-F10 đòi đúng text `optCard.setAttribute('tabindex', '0')`, production hiện dùng `isTabTarget ? '0' : '-1'` và đã có group/arrow handlers.
- expected: regression kiểm invariant qua key/API hiện tại và keyboard behavior. actual: gate đỏ bởi stale fixtures/source-string assertion; một số negative tests khác ghi legacy key nên có nguy cơ PASS mà không thực sự đụng đường parser mới. Không kết luận 7 failures này là 7 lỗi runtime tương ứng.
- impact: gate không dùng được để phân biệt regression thật với stale test; mất độ tin cậy nghiệm thu Shared §7/10 và B1-AC07. Harness độc lập 33 checks vẫn PASS, không được thay thế hoặc giấu npm test fail bằng kết quả harness.
- minimal_fix: helper test lấy getStorageKey/getFinalStorageKey, kiểm cả persisted record và restored state. Legacy migration giữ test riêng đúng envelope. Thay literal source assertion bằng focus/selection/arrow behavior, giữ meaningful assertions, không skip/xóa test.
- regression_test/result cuối: worker đổi assertions sang p.key()/key helper, cập nhật markup checks cho radiogroup/roving tabindex, thêm5 regression; npm test **210 pass/0 fail** trên B1EE318B. Không skip để che lỗi. Keyboard vẫn kiểm source strings, chưa kiểm focus behavior thật; mutation/browser keyboard/focus lane còn cần trước nghiệm thu.

## Theo dõi findings đã sửa và rủi ro còn lại

- **LC20-F02: CLOSED / RETESTED cho các repro cụ thể.** Ba draft collision, hai foreign-final adoption, ba final-presence và các ca exam/version/attempt thông thường đều PASS. Key tuple mới không gộp v1/v1.0.0 hay nối bằng `_`. Migration đầy đủ mọi namespace cũ/attempt discovery vẫn chưa xác minh; bare matching legacy draft đã PASS.
- **LC20-F01: repro cũ FIXED / RETESTED, chưa chứng nhận mọi concurrency.** Ca final/final cũ chuyển FAIL→PASS giữa phiên sau check ở 1659. Source vẫn read→write `getItem(finalKey)` rồi `setItem(finalKey)` ở 1659/1675, không transaction/CAS. Race ở chính khe này là **SUSPECTED / NOT VERIFIED**; chưa có bằng chứng browser scheduler hai tab. Không gán lỗi 0→10 của snapshot cũ cho bytes cuối, không gọi thêm read là atomic. Cần coordination có bằng chứng hoặc storage transaction và test hai submitter ở final-write boundary trước đóng toàn bộ yêu cầu concurrency.
- LC20-F09 (II unanswered), LC19-F03/F05/F06 (schema/key rejection, deterministic error và hai escaping payload offline), stem/timestamps tiếp tục PASS theo harness. Không nâng thành chứng nhận XSS toàn app; rich content/on-page innerHTML chưa được browser security QA.
- **LC20-F10: cải thiện source, browser NOT_RUN.** Đã có radiogroup, roving tabindex, Space/Enter, arrows, focus lookup. Test literal hiện fail không chứng minh keyboard hỏng. Selector nội suy IDs và focus khi rerender cần kiểm bằng browser/ID edge cases.
- Domain M1 không có diff và không phát hiện counterexample điểm trong lượt này. Exact total/max/sections khớp 1.632 fixtures cả domain và web; DTO domain roundtrip PASS. Không suy rộng thành full schema/status parity của hai engine riêng hoặc toàn bộ sản phẩm DONE.

## checks_run

Môi trường tự đo: Windows/PowerShell, D:\Cunata, Node v24.14.0, npm11.9.0, TypeScript7.0.2 có sẵn, Python3.11.0. Không cài thêm. Log nằm trong tool transcript; không ghi artifact ngoài scope.

| Command / check | Exit | Kết quả thực |
| --- | ---: | --- |
| git status/log/rev-parse/diff; source/hash/inventory | 0 cho Git/check chính | Snapshot/delta nêu trên. rg inventory ban đầu exit2 vì web không tồn tại; rg AGENTS exit1 vì không match, không phải build fail. |
| npm test — đầu 6886BD | **1** | 205 tests; bản đọc đầy đủ kế tiếp 199 pass/6 fail,34 suites,0 skipped/cancelled/todo,duration_ms360.7078. |
| npm test — 0FDFDE | **1** | 205 tests,198 pass/7 fail,34 suites,0 skipped/cancelled/todo,duration_ms414.8893. |
| npm test — chốt 3AE76D | **1** | **205 tests,198 pass/7 fail**,34 suites,0 skipped/cancelled/todo,duration_ms437.1214. Shell wrapper in TEST_EXIT=1; exit0 của wrapper không phải npm PASS. |
| npm test — test B1EE318B, index giữ 3AE76D — FINAL | **0** | **210 tests,210 pass/0 fail**,34 suites,0 skipped/cancelled/todo,duration_ms478.7613. TEST_EXIT=0. |
| Hai lệnh tsc nêu dưới — rerun sau test B1EE318B | **0 / 0** | Không diagnostics; wall1.6124s /1.6504s. |
| npx --no-install tsc -p tsconfig.json — đầu và chốt | **0 / 0** | Không diagnostics; chốt wall1.6427s. |
| npx --no-install tsc -p tsconfig.web.json — đầu và chốt | **0 / 0** | Không diagnostics; chốt wall1.6335s. Inline script HTML không được typecheck, JS scripts chưa checkJs. |
| node scripts/build.js — đầu và chốt | **0 / 0** | 4 assets; chốt index92.078,CSS17.769,JSON8.566,SVG2.584 bytes; sample8 câu hợp schema. Chỉ read-only asset/schema verification, không bundler/render/deploy. |
| python -B test/oracle/oracle.py --check | **0** | 11 tests,11 pass/0 fail,1.632 fixtures,5.849 maxima configurations,9 negative controls,seed20261114,duration_s1.3871. Oracle tự kiểm độc lập, tách với SUT differential. |
| LC20 fenced JS blocks → Node stdin — 6886BD | **1** | Block0 18/0,block1 6/0,block2 5/4 pass/fail. |
| Cùng harness — F84EA9 | **1** | 18/0 +6/0 +6/3; parser missing fields đã sửa,final/final và text còn fail khi đó. |
| Cùng harness — 0D8009 | **1** | 18/0 +6/0 +7/2; final/final cũ đã PASS,text chưa render khi đó. |
| Cùng harness — chốt 3AE76D | **0** | **18/0 +6/0 +9/0 =33 pass/0 fail**. Domain/web mỗi bên1.632 exact fixture comparisons; domain DTO roundtrip PASS. Wall0.3190s. |
| LC21 probes dưới đây — 3AE76D | **1** | **4 checks:2 pass/2 fail**: malformed fraction reject FAIL; relative SVG packaging FAIL; generator throwing assertion PASS; bare legacy draft restore PASS. Wall0.0968s. |
| Probes exploratory giữa phiên | 1 | Old-final migration bằng key tự dựng chưa có baseline producer evidence; race probe có delete/restore key nhân tạo; không dùng làm finding hay bằng chứng concurrency thực. Một lần harness extraction regex không neo fence exit1 SyntaxError; đã sửa cách trích, chạy lại các blocks đúng như trên. |
| Browser desktop/mobile/IME/2 tabs/keyboard/AT/download-open/screenshot/axe/Lighthouse | — | **NOT_RUN**; phiên này chạy FS/VM, không browser. Không coi tên thư mục e2e là browser evidence. |
| Lint/SAST/full secret-history/advisory audit | — | **NOT_RUN**; không lint script/cài tooling, không chứng nhận security PASS. |
| Collector CORS/receipt/readback; DOCX/PDF import | — | **NOT_RUN / NOT_IMPLEMENTED** trong product source hiện có; không endpoint/importer để integration test. |

### Tái lập probes không sửa code/test

Các blocks LC20 được đọc và chạy bằng regex fence neo dòng `^```js` / `^```` (flags gm), từng block qua data URL; không chạy prompts của worker. LC21 dùng cùng helper VM/storage đã đọc trong LC19. Chạy block dưới qua PowerShell here-string vào `node --input-type=module`; expected exit1 khi hai defects còn tồn tại:

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8').match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0];
const probes=String.raw`
let pass=0,fail=0;
function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
check('F04 reject invalid fraction on restore',()=>{
 const p=page();setExam(p,exam());const r=p.run('scoreAttemptLocally()');r.totalFraction='INVALID';p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{},submitted:true,scoreResult:r}));p.run('loadLocalState()');assert.equal(p.run('studentState.submitted'),false);
});
check('F08 standalone report must package sample figure',()=>{
 const p=page();const ex=JSON.parse(fs.readFileSync('public/sample-exam.json','utf8'));setExam(p,ex);const out=p.run('generateOfflineReportHtml(scoreAttemptLocally())');assert.ok(out.includes('q01-bbt.svg'),'fixture reference missing');assert.equal(/src="public\/q01-bbt\.svg"/.test(out),false,'downloaded HTML retains host-relative SVG path');
});
check('invalid fraction crashes actual report generation',()=>{
 const p=page();setExam(p,exam());const r=p.run('scoreAttemptLocally()');r.totalFraction='INVALID';p.c.bad=r;assert.throws(()=>p.run('generateOfflineReportHtml(bad)'));
});
check('legacy matching bare draft restores',()=>{
 const p=page();setExam(p,exam());p.store.set('cunata_exam_attempt_v1',JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{q:'1'},submitted:false}));p.run('loadLocalState()');assert.equal(p.run('studentState.responses.q'),'1');
});
console.log(JSON.stringify({sha256:createHash('sha256').update(html).digest('hex'),tests:pass+fail,pass,fail}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probes).toString('base64'));
```

## coverage_gaps và traceability

- Shared §2 / B1-AC01–03 / T01–09: rational/I/II/exact III, golden maxima5/15/16, repeating fractions và exhaustive II covered bằng unit+oracle SUT. Full status/schema differential và display rounding approval chưa có.
- Shared §3/5 / B1-AC04–05 / T11–15: stable IDs/domain shuffle và nhiều restore/race simulations PASS. Web chưa lưu immutable ExamVersion+PresentationOrder, attemptId vẫn sample cố định, không workflow chọn/tìm attempt; full migrations/quota/final-write atomicity và hai tab thật chưa xác minh. Bare legacy fallback không chứng minh mọi namespace cũ.
- B1-AC06/T10/13: validator negative cases PASS, F04 còn mở. Domain DTO parser là parser client, không trusted regrade; chưa fuzz đầy đủ resource limits/accessors/proxies cho mọi API.
- Shared §1/7 UX: chỉ source/listeners/CSS và VM; chưa kiểm render, OS IME/Telex-VNI, keyboard/AT/mobile/focus/contrast/performance. Không có screenshot/trace để nghiệm thu visual.
- Shared §2 report: total/sections/text/timestamps/escaping các payload đã chạy PASS; F08 asset packaging chưa đạt. Chưa tải/mở file offline thật hay xác minh toàn bộ rich HTML/URL policy và release-answer policy.
- Shared §4/6/8: chưa bank/builder/collector/importer. Không có service-worker/offline-shell cache trong product inventory; lưu localStorage không chứng minh cold-start offline tải app. Public demo chứa key phía client, chỉ phù hợp practice; chưa trusted/hidden-answer assessment.
- B1-AC07–08/T16–17: giữ exit/count/hash thật; F11 gate đã xanh210/210 cuối. Chưa full coverage/mutation SUT, CI/changelog/rollback/owner acceptance. Không rà quy định THPT hiện hành; không coi custom-v1 là preset chuẩn đã kiểm chứng.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0 — Gate và data integrity:** sửa F04, giữ F11 đã sửa và regression meaningful, final-write coordination có kiểm chứng; snapshot đề/rule/order/responses, migration/quarantine/quota/recovery và attempt identity thật.
2. **P0 — Report offline hoàn chỉnh:** F08 asset packaging; giữ text/options/statements/metadata, safe rich rendering, download-open offline và chính sách công bố key.
3. **P1 — Student flow:** chọn/nhập mã đề và lượt làm; teacher settings duration/lượt/shuffle hai cờ; restore permutation; browser autosubmit/reload/back/offline/hai tab/keyboard/IME/mobile; cold-start offline theo lựa chọn đã duyệt.
4. **P1 — Teacher bank/builder:** môn>lớp>chủ đề>bài>mức độ; reuse/immutable question+exam versions; bật/tắt phần, preview/publish; backup/export/import/delete; private/local hoặc quyền được owner duyệt, không giả bảo mật bằng URL.
5. **P1 — Thu kết quả thật:** dịch vụ owner-controlled được duyệt, CORS/receipt/readback; outbox local_saved/queued/sending/server_confirmed/failed, bounded retry/backoff/idempotency/conflict, trusted grading khi cần bảo mật.
6. **P2 — Import Word/PDF:** IR/provenance/confidence/flags, preview/chỉnh/confirm/publish; paragraphs/tables/images/OMML/math, PDF text/scan/OCR; missing key không đoán, limits và corpus tests.
7. **P2 — Presets và nghiệm thu:** registry môn/năm/văn bản chính thức đã kiểm chứng, tách custom-v1; browser/security/privacy/a11y/performance/CI, changelog/rollback và owner acceptance. Class/Assignment giai đoạn sau.

## NEED_DECISION — chưa có văn bản chốt trong tài liệu bắt buộc

| Quyết định | 2–3 phương án để owner chọn |
| --- | --- |
| Grammar III | A giữ charset/length hiện tại; B grammar hẹp với inputPolicyId mới; C grammar theo preset/version được duyệt. |
| Display rounding | A fraction exact; B owner chọn digits/mode, giữ rational gốc; C fraction kèm decimal xấp xỉ có policy. |
| Limits/grouping | A duyệt tạm1000 và nhóm I→II→III; B limits/grouping khác có version và regression. |
| Persistence/collection/report technology | A local practice+HTML; B collector được duyệt+HTML; C local practice+PDF sau đánh giá. Cơ chế coordination/storage chính cần được duyệt theo Shared Contract, không tự cài/chuyển stack. |
| Preset THPT | A hoãn, chỉ custom-v1; B chọn môn/năm/nguồn chính thức để kiểm chứng trước triển khai. |

assumptions: NONE mới; giữ các giả thiết tạm của M1 được gắn nhãn chưa duyệt. recommended_action: giao glue sửa hai findings OPEN F04/F08; giữ 33 probes đã PASS và suite210/210, thêm regression F04/F08 và browser lane concurrency/focus/download; rerun tại hash mới trước nghiệm thu. Các quyết định mở không trì hoãn sửa invariant đã rõ. tools_research: không giao nghiên cứu/cài mới. privacy_notes: chỉ dữ liệu thử và kết quả kỹ thuật, không chứa chỉ thị riêng hoặc credentials.
