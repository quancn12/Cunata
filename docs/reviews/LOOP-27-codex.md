# LC27 — Kiểm định độc lập toàn sản phẩm

**verdict: CHANGES_REQUESTED.** LC26-F01 đã FIXED / RETESTED bằng reproduction gốc (24/24). Có một finding MAJOR mới: LC27-F01, tên/SBD vừa nhập không được chốt khi nộp, khiến kết quả và báo cáo giữ tên cũ. Không phát hiện counterexample số học mới trong các checks đã chạy. Các gate xanh không chứng minh toàn bộ sản phẩm hoặc milestone student đã hoàn thành.

review_id/task_id: LC27; reviewer: Codex; reviewed_at: 2026-11-14; risk_level: HIGH; requirements_version: Shared Product Contract v2.0 và M1-scoring-contract v1.0 (đã đọc toàn bộ); đối chiếu READINESS §6, B1-AC01…08/T01…17.

## Revision và phạm vi

- base_commit đầu phiên: `9c643a4ce46a77f0d091a2479b4020d1789a7cd5`, branch main. Có working-tree changes của worker khi bắt đầu; đã đọc status, log và diff từ head LC26 tới working tree. Điều phối commit round10 trong phiên; head được kiểm cuối: `77861c8709d22f174dea9cacd8e1473ac3e33d2f`. Reviewer không commit.
- Delta sản phẩm: README.md, index.html và test/domain/{scoreAttempt,serialize}.test.ts, test/e2e/demoFlow.test.ts; 219 insertions, 1 deletion. Không đổi src/domain, dependency, lockfile hoặc build script trong delta này.
- Source fingerprint SHA256 `index.html`: **4A2C03F6DDF1679B4C6BC3AECF9D23C7D6282A47C6B95E404BC0B9572AED4C02**, 117152 bytes. Tất cả probe trong phiên đọc fingerprint này.
- `src/domain/scoreAttempt.ts`: E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE; `src/domain/serialize.ts`: 8A523B406357689F3BDD0444856D07014A00F7AD89C35DE6503F6DD2E35C8C7E.
- `test/e2e/demoFlow.test.ts`: 0A3E1E6C0B98AD308A3A29184E34C3F1B398628227B3500CC0C208A462F2E740; `test/domain/scoreAttempt.test.ts`: 8BB4D128E44CC8BF6E691E7F815536359618EDE1973B10179C228AA17A6D5B67; `test/domain/serialize.test.ts`: 227DECD2EA8816BA12CFF72C6344C2A2EB6BB9740688E5B6F6183C37D960E546.
- files_reviewed: toàn bộ src/domain/{model,index,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize}.ts; index.html theo luồng fetch/validate→restore→render/input/timer/save→submit/adopt→report/download/restart; package.json, hai tsconfig, scripts/build.js, delta tests/README; test domain/acceptance/VM/oracle và probes các vòng trước. Đọc sample/assets qua validation và differential; CSS responsive/print/focus kiểm tĩnh. scripts/update-index.js là helper ghi lại index với implementation cũ, không thuộc đường build hiện hành và không chạy trong review. Không tuyên bố audit mọi dòng ops/research/dependencies/history.
- Không tìm thấy AGENTS.md dưới repo hoặc tại D:\. Chỉ tạo `docs/reviews/LOOP-27-codex.md`; không sửa code/test, không npm install, dependency, branch/worktree, commit hoặc deploy. Không đọc prompt riêng của worker khác. Thay đổi đồng thời của worker được giữ nguyên.

## Finding còn mở

### LC27-F01 — MAJOR — Nộp bài chốt tên/SBD cũ dù ô nhập đã có tên mới

- **VÙNG chịu trách nhiệm: glue.** affected_files: `index.html:1195–1198` (chỉ saveLocalState đọc ô tên), `index.html:1981–2031` (submit không đọc tên trước tạo kết quả/chốt state); callers `index.html:1786–1789`, `index.html:1388–1414`; output `index.html:2085`, `index.html:2202–2206`.
- evidence: `candidateName` không có input/change listener trong source. Chỉ `saveLocalState()` lấy giá trị ô nhập vào studentState. `submitExam()` gọi scorer và serialize studentState trực tiếp; đường autosubmit cũng vậy. Timer autosave chỉ chạy khi remainingSeconds chia hết cho 10; học sinh sửa tên ở cuối bài rồi nộp ngay sẽ chốt tên trước đó. Đây là identity hiển thị không xác thực, không phải bằng chứng login hoặc impersonation.
- reproduction_steps (UI): mở demo, để bài lưu tên ban đầu; sau lần autosave, đổi ô “Thí sinh” thành “Nguyễn An LC27”; không sửa đáp án/flag, bấm Nộp và xác nhận trước lần autosave kế tiếp. Hoặc đổi tên ngay trước khi hết giờ. Xem tên trên báo cáo và tải HTML; refresh cũng giữ tên cũ từ final.
- reproduction_steps (đã chạy): VM dùng JS thật của index, Map localStorage và DOM stubs. Đặt ô tên `Old LC27`, gọi saveLocalState; đổi ô thành `Nguyễn An LC27`; gọi submitExam hoặc đặt deadline quá hạn rồi startTimer. Control gọi thêm saveLocalState trước submit. Không giả lập hàm submit/scorer/persistence/report generator; chỉ showReportView được stub như helper cũ. Probe đầy đủ bên dưới.
- expected: tên/SBD đang hiển thị được snapshot vào lượt làm lúc nộp và đồng nhất giữa final, trang kết quả, HTML tải xuống. Không cần chốt quyết định nghiệp vụ mới để thực hiện kỳ vọng này (Shared §2 báo cáo, §4 nickname; README §5 Nhập thông tin).
- actual: manual và deadline đều lưu `Old LC27`, HTML không chứa tên mới. Control có save trước submit lưu đúng tên mới. **3 cases: 1 pass, 2 fail, exit1.** Không sai điểm; sai metadata nhận diện kết quả ở cả hai đường nộp bình thường. MINOR không đủ khi tên/SBD là thông tin nhận diện duy nhất của luồng no-login và học sinh thường điền tên sau khi làm xong.
- impact: báo cáo gắn tên cũ/mặc định, khó phân biệt kết quả giữa học sinh; final đã khóa nên sửa ô sau đó hoặc nộp lại chỉ adopt tên cũ. Không kết luận có ghi nhầm lên Google vì collector chưa tồn tại.
- minimal_fix: trước khi tính/chốt một final **mới**, đồng bộ tên từ ô nhập theo cùng quy tắc hiện tại; dùng chung helper với save hoặc cập nhật state qua input listener và vẫn flush tại submit. Giữ nhánh adopt final đã tồn tại theo snapshot cũ, không ghi đè tên của final. Dùng cùng đường cho manual/autosubmit; không gọi save một cách mù quáng làm thay đổi thứ tự xử lý race/error.
- regression_test: tên ban đầu→đổi ngay trước manual submit/deadline→assert final key, state, report HTML và reload đều có tên mới; control có autosave; tên Unicode/HTML được escape; double-submit/stale-tab adopt vẫn giữ tên của final đầu; storage failure không hiển thị sai trạng thái. Test hiện có chưa cover tương tác ô tên cuối bài này.

## Retest findings cũ và đánh giá delta

| Finding / thay đổi | Kết quả đã kiểm |
| --- | --- |
| LC26-F01, I/III raw sai kiểu bị save/submit adopt | **FIXED / RETESTED** reproduction nguyên gốc 24/24 pass, exit0. I/III × number/boolean/object/array × load/save/submit. Submit giờ chấm bài hiện tại 0 thay vì adopt full report hỏng. |
| LC25-F02, II full trong khi raw thiếu/null | RETESTED PASS, valid/missing/empty/null 4/4; có thêm kiểm kiểu II tại validator chung. |
| LC25-F03, infinity render thành membership | RETESTED PASS cùng block 5/5 (gồm controls persistence); đúng một backslash + infty ra entity infinity. |
| LC24 own prototype IDs / foreign refs / raw trái report | RETESTED PASS block 4/4, các controls LC25 và suite hiện tại. |
| Domain bổ sung trong round10 | Đã đọc assertions: II empty/all-wrong/unknown-only; DTO roundtrip special IDs. Không thay production domain. Assertions chạy thật trong 226 tests. |
| Regression web round10 | Một test mới kiểm restore malformed I/II/III; nhiều assertions, không tính mỗi assertion là một test. Test chỉ gọi loadLocalState; proof cho save/submit đến từ probe độc lập LC26, không suy từ tên test. |

## checks_run

Environment: Windows PowerShell, D:\Cunata; Node v24.14.0, npm11.9.0, TypeScript7.0.2; Python3.11.0. Output/exit trong tool transcript LC27; không tạo log/artifact ngoài scope. Probes là Node VM/stubs, **không phải browser E2E**.

| Lệnh / kiểm tra đã chạy | Exit | Kết quả / giới hạn |
| --- | ---: | --- |
| `npm test` (output cuối qua Select-Object, trả `$LASTEXITCODE`) | 0 | Đầu phiên226/226,35 suites,498.1558ms; **cuối phiên228 tests,35 suites,228 pass,0 fail/skip/cancel/todo**,479.5396ms. Worker thêm hai tests domain trong lúc viết report, đã đọc diff và chạy lại. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics; đầu1.5705s, cuối1.4917s wall sau tests mới. Compiler có sẵn; NOT_RUN cũ trong M1 không còn phản ánh môi trường. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics,1.4309s wall; include không typecheck inline JS trong index.html. |
| `node scripts/build.js` | 0 | index117152,CSS17769,JSON8566,SVG2584 bytes; schema8 câu hợp lệ, stylesheet link có. Asset verification, không bundling/browser/deploy. |
| `python -B test/oracle/oracle.py --check` | 0 | 11/11 pass,0 fail/skip;1632 fixtures,5849 maxima configs,9 negative controls,seed20261114,1.1608s tổng. Oracle-only, không tự coi là SUT differential. |
| Trích tất cả fenced JS của LC20/22/23/24/25/26 qua Node stdin | 0, từng child0 | **82/82 checks pass** qua10 blocks (18+6+9+6+3+3+4+5+4+24). LC20 có domain và web differential1632 fixtures, domain DTO roundtrip. Không tính1632 là số tests runner. Tất cả đọc hash4A2C03… |
| Probe LC27-F01 bản cuối (bên dưới) | **1** | **3 cases,1 pass,2 fail**. Manual/deadline fail; saved-control pass. |
| `git diff --check -- index.html README.md src test scripts` | 0 | Không lỗi whitespace ở product/test delta; chạy riêng với native exit. Không tuyên bố toàn ops logs sạch. |

Một lần chạy probe LC27 ban đầu lỗi setup do node candidateName chưa được tạo (3 setup failures), đã sửa **harness trong stdin**, không sửa sản phẩm. Lần tiếp theo chứng minh1 pass/2 fail nhưng PowerShell pipe làm mất dấu trong literal; bản cuối dùng Unicode escape và xác nhận tên Nguyễn An đúng. Chỉ bản cuối được dùng cho finding/count chính.

Cuối phiên, working tree round11 có thêm63 dòng ở test/domain/{scoreAttempt,validate}.test.ts: assertions từ chối I/III raw number/boolean/object/array và kiểm TYPE_MISMATCH/path; đã đọc và chạy lại test/typecheck như bảng. Không có diff production src/index tại thời điểm đó; hash index giữ4A2C03…; hashes tests ở phần revision là snapshot226 tests đầu phiên. Trích lại probe từ chính file bàn giao và chạy xác nhận documented reproduction exit1,3 cases/1 pass/2 fail; wrapper kiểm đúng output exit0. `git diff --no-index --check -- NUL docs/reviews/LOOP-27-codex.md` không báo lỗi whitespace (native exit1 do có file mới), không dùng exit1 đó để báo lint fail.

NOT_RUN: browser desktop/mobile/multi-tab/IME/AT, screenshot/trace, download rồi mở offline thật; lint (không script), dedicated SAST/dependency advisory/full-history secret scan, Lighthouse/axe, mutation testing SUT. Static sink/I/O search không thay security certification. Không có claim upstream mới cần web research; không cài tooling.

## coverage_gaps và traceability

- **B1-AC01–03/T01–09/T15:** đã đọc domain logic và chạy unit/golden/exhaustive II16×81/differential1632 fixtures, exact rational maxima5/15/16, thresholds9.75/10/10.25, N3=3/7, III exact string/Unicode, permutation/DTO/bounds/nonmutation. Không tìm lỗi số học mới; không tự thu hẹp grammar III.
- **B1-AC04/06/T11/T13:** domain validation/errors và strict DTO có evidence; LC26-F01 đóng cho repro gốc. Không tuyên bố toàn bộ malformed persistence space đã được phủ. loadLocalState có bước lọc raw trước validate, save/submit validate trực tiếp; cần ma trận chung cho malformed envelopes/main/final/legacy và chính sách quarantine. Metadata tên tại final còn lỗi LC27-F01.
- **B1-AC05/T12/T14, Shared §3/5:** shuffle unit deterministic/flags/ID có thật; web chưa nối createPresentationOrder hoặc persist immutable exam/question/order snapshot. initExam fetch sample mới/embedded; chưa chứng minh sửa bank không làm ảnh hưởng attempt cũ trong workflow publishing thật.
- **Persistence/timer:** deadline, local save/final reconcile có tests VM. localStorage read→write không atomic; final/final ở cửa sổ sau read cuối trước setItem vẫn **SUSPECTED / NOT VERIFIED trên scheduler browser**. Không coi nhiều reads là transaction. Draft revisions chưa chứng minh giải quyết mọi conflict. Chưa kiểm quota/private-mode/migrations/background-clock-shift/recovery/cold-start offline thật; không service-worker offline shell hiện hành.
- **Browser/UI:** đọc source responsive/keyboard radio/short answer và escaping, chưa chạy renderer. Không đưa PASS cho mobile layout, OS Telex/VNI, focus sau rerender II, modal keyboard/AT, contrast, report PDF/HTML thực tế. Node VM không thực hiện composition/cursor/browser storage semantics.
- **Shared §4/6:** không backend/collector/outbox để chạy CORS/receipt/readback/idempotency hay trusted regrade. Keys public chỉ thích hợp đánh giá demo luyện tập; chưa nghiệm thu kiểm tra cần giấu key. Không importer DOCX/PDF/IR/OCR/provenance/preview-confirm để kiểm.
- **B1-AC07/08/T10/T16/T17:** chưa full adversarial resource limits/oversized BigInt hoặc SUT mutants; oracle negative controls không thay mutation testing engine. Chưa milestone browser CI/security/performance/rollback/owner acceptance. Fraction kèm decimal hiện có không là phê duyệt rounding policy. Không gắn FULLY_VERIFIED/DONE.

## Tính năng lộ trình còn thiếu — theo thứ tự ưu tiên

1. **P0 — glue:** sửa LC27-F01, đưa metadata snapshot và regression vào gate. Tiếp tục browser hai tab/reload/timeout/quota/error, atomic finalization theo storage được duyệt, immutable exam/order snapshot trước nghiệm thu student milestone.
2. **P1 — student:** chọn/nhập đề thật; attempt ID/lịch sử nhiều lượt, teacher settings thời lượng/lượt làm/hai cờ shuffle và answer/explanation release; cold-start offline theo giải pháp được duyệt; mobile/keyboard/IME/a11y thật. Restart xóa bài sau xác nhận chưa là lịch sử nhiều lượt.
3. **P1 — teacher:** bank Môn>Lớp>Chương/Chủ đề>Bài>Mức độ; builder bật/tắt các phần độc lập, reuse immutable versions, preview/publish, backup/export/import/delete; quyền thật hoặc private/local workflow được duyệt.
4. **P1 — collector:** dịch vụ owner-controlled đã duyệt; local_saved/queued/sending/server_confirmed/failed, bounded retry/backoff/idempotency, chống stale overwrite; Google CORS/receipt/readback thật, trusted score và release khi cần. Local success không là Drive success.
5. **P2 — importer:** Word/PDF→IR giữ text/tables/media/OMML/math, provenance/confidence/flags→preview/sửa→confirm→save; text/scan/OCR/multi-column và resource/security corpus; không đoán answer key.
6. **P2 — preset/nghiệm thu:** mẫu chuẩn theo môn/năm/văn bản đã kiểm chứng tách custom-v1; privacy/security/performance/browser CI, license/changelog/rollback và owner milestone acceptance. Class/Assignment sau MVP.

## NEED_DECISION — các policy chưa được chốt

Không có mâu thuẫn mới giữa hai contract; các mục mở vẫn chưa có phê duyệt thay thế trong tài liệu bắt buộc. Không tự chốt và không dùng chúng làm lý do hoãn sửa LC27-F01.

| Quyết định | 2–3 phương án cho owner |
| --- | --- |
| Grammar III | A giữ charset/length tạm; B grammar hẹp bằng inputPolicyId mới; C grammar riêng preset/version được duyệt. |
| Display rounding | A fraction exact; B owner chọn digits/mode cụ thể, giữ rational gốc; C fraction kèm decimal xấp xỉ có nhãn/policy. |
| Limits/grouping | A duyệt tạm1000 và nhóm I→II→III; B đổi limits/grouping với version và regressions. |
| Storage/collector/report stack | A local practice+HTML; B collector được duyệt+HTML; C thêm PDF sau đánh giá. Implementation demo không là approval production. |
| Mẫu chuẩn THPT | A hoãn, chỉ custom-v1; B chọn môn/năm/nguồn chính thức trước xây preset. |

assumptions: NONE mới; giả thiết tạm M1 vẫn có nhãn chưa duyệt. recommended_action: giao glue sửa LC27-F01 và test fail-before/pass-after, owner quyết các policy trước milestone tương ứng. tools_research: không được giao nghiên cứu/cài mới. privacy_notes: chỉ evidence kỹ thuật/dữ liệu thử, không credentials hoặc nội dung hồ sơ riêng.

## Probe LC27-F01 — không tạo file ngoài scope

Pipe block JS vào `node --input-type=module` tại repo root. Helper VM có sẵn trong LC19; bản source được xác định bằng hash cuối. Expected assertions hiện thất bại ở manual/deadline. Browser thật vẫn NOT_RUN.

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8').match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0];
const probe=String.raw`
let pass=0,fail=0;function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
for(const mode of ['manual','deadline','saved-control'])check('candidate latest name '+mode,()=>{
 const p=page();setExam(p,exam());p.run('document.getElementById("candidateName").value="Old LC27";saveLocalState()');const latest='Nguy\u1ec5n An LC27';p.nodes.get('candidateName').value=latest;
 if(mode==='saved-control')p.run('saveLocalState()');
 if(mode==='deadline')p.run('studentState.deadline=Date.now()-1;startTimer()');else p.run('submitExam()');
 const saved=JSON.parse(p.store.get(p.run('getFinalStorageKey(currentExam,studentState)')));
 const report=p.run('generateOfflineReportHtml(studentState.scoreResult)');
 console.log(JSON.stringify({mode,input:p.nodes.get('candidateName').value,state:p.run('studentState.candidateName'),persisted:saved.candidateName,reportHasLatest:report.includes(latest)}));
 assert.equal(saved.candidateName,latest,'latest visible nickname not persisted');assert.ok(report.includes(latest));
});
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probe).toString('base64'));
```
