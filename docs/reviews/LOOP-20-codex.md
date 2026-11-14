# LC20 — Kiểm định độc lập toàn sản phẩm, vòng 20

review_id/task_id: LC20; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 + M1-scoring-contract v1.0; risk_level: HIGH.

**verdict: CHANGES_REQUESTED.** Trên snapshot cuối còn hai BLOCKER (F01/F02) và hai MAJOR (F04/F08); F09 CLOSED/RETESTED, F10 đã sửa ca thiếu keyboard handler qua kiểm source (browser còn NOT_RUN). Suite cuối **205 pass / 0 fail**, hai typecheck và web asset verification exit 0. Harness LC19 cuối **18 pass / 0 fail**; sáu probes LC20 ban đầu cuối **6 pass / 0 fail**; tám probes mở rộng **0 pass / 8 fail**, thêm ca report thiếu fields **0 pass / 1 fail**. Test xanh chưa bao phủ các counterexample final/final, identity, restore và report options/statements. Các quyết định mở ở cuối cần owner chọn, trạng thái bàn giao `NEED_DECISION`; không dùng chúng để trì hoãn sửa invariant đã rõ.

**Lưu ý snapshot:** worker sửa source/test ngay trong phiên. Phần finding bên dưới mô tả kết quả cuối trên **53AB76C2…9F007BB**, không lấy lỗi ở snapshot đầu gán cho source cuối. Lịch sử kết quả đầu và giữa giữ ở checks_run để truy vết. Evidence chỉ áp dụng bytes đã ghi hash; cần kiểm lại nếu worker tiếp tục sửa.

## Snapshot và delta từ vòng 19

- base_commit = head_commit: `84c425f8f022c57c2611883c0e504dd9b5c2dcce`, branch main; review HEAD **cộng working tree**. Git log vẫn là round3 `84c425f`, round2 `9c4cb17`, round1 `f2447ae`, baseline `2ee84e3`; không có commit mới sau LC19.
- `index.html` LC19 cuối SHA256 `04CB070EF5CA857B69291FBA3A6A5C732D32F9B056B4CACBE915F76E78BC72F8`; LC20 đầu `89068EC2583D1294DB6FFBC2281A002BED72920E33B5A42F7A7D8FA326BDF43E`,85.761 bytes; giữa `CB25E950FBA0D46D90CDDBC87DDED7E569A46AF757D0911F79F718264ECC59D2`,88.641 bytes; cuối **`53AB76C228C1C6687A56DB55C2A77D7C24E56195129E6CF7A63DB3B1C9F007BB`**,90.437 bytes. Delta đầu: examId trong phần lớn key,final-key reader,lọc nested boolean/chặn report rỗng. Delta giữa: writer finalKey,full timestamps/identity/stem,per-statement.state,restart xóa hai key. Delta cuối: lọc response theo kind,kiểm qr có ID/status và keyboard tabindex/Space/Enter; chưa khắc phục mọi counterexample.
- `test/e2e/demoFlow.test.ts` đầu `5080F5C7A2E9639F5CAF4FF310D25495C315F9C79D0ACEDAEFA1EFC0C5B66398`,giữa `5D4D863E4B1FA4ADD64A8B4F776A09B752CB8A41415DA55D72C01ECD6020DF77`,cuối **`6CC0E8DF69EFDF6969E300FEFB65521F207C79B017EF7B1E89664459ED534BB6`**: thêm tổng7 regression,suite198→203→205. `src/domain/scoreAttempt.ts` `E7D76160AA10E7E681FA757869AF48D76594C84C32F57844312F23B816C61ACE`; `src/domain/serialize.ts` `850EBA8D6620BD2B6DE02E034226ECB499E9ED4C0EDB18C2D4099711ADB855A8`.
- Không có diff domain/package/lock/tsconfig/build script so HEAD. Working-tree product diff cuối so HEAD: index +451/-106,demoFlow +248/-9; đó là delta tích lũy, **không phải riêng LC19→LC20**. Các file ops/dashboard/workers cùng hai review trước đã dirty/untracked khi bắt đầu; không sửa/revert chúng.
- files_reviewed: toàn bộ mười module `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; luồng index fetch/embedded→validate→restore→render/input→save/timer→submit→report/download/restart; tests/fixtures/assertions liên quan, `test/oracle/oracle.py`, sample JSON/SVG, CSS, package/lock/tsconfigs, README, build script, READINESS §6, báo cáo LC19. Kiểm tra bổ trợ script cũ bằng đọc mã, không chạy `scripts/update-index.js` vì nó ghi source. Đánh giá theo rủi ro và data flow; không tuyên bố vét cạn mọi dòng/đầu vào.
- Không tìm thấy AGENTS.md trong workspace hoặc D:\AGENTS.md. Chỉ tạo `docs/reviews/LOOP-20-codex.md`; không sửa code/test/config, không tạo branch/worktree, không install/dependency/commit/deploy. Các logs thực thi ở transcript công cụ; không tạo log ngoài scope.

## Findings

### LC20-F01 — BLOCKER — Final-key đã ghi nhưng final/final vẫn thay đổi kết quả đã chốt

- **VÙNG chịu trách nhiệm: glue**. affected_files cuối: `index.html:1579–1641`, đặc biệt read1619 và write1640–1641. Tiếp nối LC19-F01, PARTIALLY FIXED / OPEN.
- evidence: snapshot đầu không có writer finalKey; cuối đã ghi dòng1606. Ca draft/final LC19 và final-key presence **nay PASS**. Tuy nhiên finalKey vẫn mutable, không transaction/coordination giữa các submitter.
- reproduction_steps: hai VM A/B cùng đề/attempt. A chưa trả lời (0), B có đáp án đúng (10). Tại B.setItem sau lần reconcile cuối, cho A.submitExam hoàn thành chốt 0; sau đó B tiếp tục ghi draft/final đã serialize. C load: **totalFraction='10'**, expected final A `'0'`. Probe final/final FAIL trên hash CB25E950. Interleaving mô hình trên script thật; chưa xác nhận scheduler hai tab browser thực tế.
- expected: final đã chốt, responses và score không bị writer cũ đảo ngược. actual: final A bị B thay dù A đã hoàn thành submit trước các write B. impact: thay kết quả đã nộp, Shared §3/5; không còn tuyên bố ca draft/final cũ làm mất final trên snapshot cuối.
- minimal_fix: coordination/transaction chung cho mọi submitter hoặc final thực sự bất biến có reconciliation rõ. Không chỉ thêm read/write cuối. Xử lý durability giữa hai setItem, restart/migration và validate identity/envelope của final.
- regression_test: xen kẽ draft/final sau lần đọc cuối, final/final khác responses, reload/offline/timeout và quota. Assert tồn tại final, đúng snapshot/score/revision; kiểm hai tab browser thật. Test bảo toàn ở các read thứ 2/3 hiện tại chưa bắt write-boundary này.

### LC20-F02 — BLOCKER — Key va chạm làm mất draft hoặc nhận final của identity khác

- **VÙNG chịu trách nhiệm: glue**. affected_files: `index.html:665–690`, final reader `index.html:786–795`, draft write `index.html:890`. Tiếp nối LC19-F02, PARTIALLY FIXED / OPEN.
- evidence/reproduction_steps trên snapshot cuối: A lưu **draft** có response q='1'; B identity khác load→startTimer; serialized draft A biến mất. Ba ca đều FAIL:
  1. cùng examId X, version `v1` và `v1.0.0`: bị normalize về cùng key;
  2. `(examId=A_B, version=C)` và `(examId=A, version=B_C)`: nối bằng `_` tạo cùng key;
  3. examId `exam` và `exam-thpt-toan-demo-01`, cùng version v1: nhánh alias bỏ examId tạo cùng key.
- Hai ca bổ sung A **submit** rồi B load→startTimer cho tuple (1)/(2): B thành submitted=true dù final thuộc identity A. loadLocalState từ chối identity khác, nhưng saveLocalState ở startTimer đọc finalKey và adopt không kiểm identity (786–795). Cả hai FAIL. Trên cuối, ba probes chỉ kiểm “serialized final A còn ở storage” **nay PASS**, do có bản sao final; tồn tại bản sao chưa chứng minh đúng restore.
- expected: mọi tuple examId/versionId/attemptId khác nhau có namespace độc lập và restore đúng identity. actual: mất draft hoặc nhận final khác đề/phiên bản. impact: mất bài đang làm/khóa bài bởi kết quả khác qua thao tác tuần tự, **không phụ thuộc race/scheduler**; Shared §3/5.
- minimal_fix: encoding tuple không va chạm và không tự gộp version/alias; có schema/migration bảo toàn bản cũ, unique attemptId ổn định và cơ chế tìm lại attempt. Áp dụng đồng nhất draft/final/restart. Không dùng các ngoại lệ nhằm giữ test hardcoded key.
- regression_test: ba ca trên, ID có `_`/Unicode, v1 vs v1.0.0, hai attempt, A submit→B làm→mở lại A, migration và restart chỉ target đúng attempt. Ca hai đề A/B thông thường cùng version, v1/v2 và hai attempt A/B của LC19 **nay PASS**; không đủ đóng finding.

### LC20-F04 — MAJOR — Restore chỉ kiểm report có phần tử, chưa parse report và response theo kind

- **VÙNG chịu trách nhiệm: glue**. affected_files cuối: `index.html:922–924`, `index.html:990–1009`. Tiếp nối LC19-F04, PARTIALLY FIXED / OPEN.
- evidence: trên CB25E950 report `[null]` và II string `'false'` còn FAIL; trên 53AB76C2 cả hai **PASS**: reject null qr và bỏ response không đúng kind. Parser mới vẫn chỉ yêu cầu qr có questionVersionId/status kiểu string.
- reproduction_steps cuối: matching envelope với `submitted:true,responses:{},scoreResult:{questionResults:[{questionVersionId:'q',status:'unanswered'}]}`. Thiếu kind,points/max và toàn bộ total/section fractions. loadLocalState vẫn đặt **submitted=true**, expected false/quarantine; probe cuối1 fail/0 pass, hash53AB76C2. Bài bị khóa và report thiếu điểm hợp lệ. Không còn gán lỗi dereference null cũ cho bytes cuối.
- expected: parse versioned envelope/report đầy đủ schema/identity trước adopt. actual: ID/status strings là đủ nhận report thiếu mọi trường chấm điểm. impact: trạng thái đã nộp giả/report không dùng được; Shared §3/5. Không coi local client tampering là trusted assessment.
- minimal_fix: parser đầy đủ cho persistence/report, whitelist fields, đối chiếu kind/IDs/booleans/time/fractions/identity; quarantine raw lỗi và recovery UI. Không lặng lẽ làm sạch mất nội dung rồi báo đã lưu. Có thể recompute từ validated snapshot/responses khi phù hợp; không lấy DTO client làm kết quả tin cậy cho bài kiểm tra.
- regression_test: `[null]`, `[{}]`, thiếu fractions/counts/II details, lệch identity, response sai kind/unknown IDs, timestamp lỗi, JSON hỏng, quota và migration. Assert không lock giả, không crash, giữ bản gốc để phục hồi. Ca report `{}`, report null, responses null và nested II `s0:'false'` của LC19 **nay PASS**, chỉ đóng các repro cụ thể đó.

### LC20-F08 — MAJOR — Report đã có stem/timestamps nhưng thiếu text lựa chọn và mệnh đề

- **VÙNG chịu trách nhiệm: glue**. affected_files cuối: `index.html:1428–1440`, `index.html:1463–1470`, `index.html:1745–1772`. Tiếp nối LC19-F08, PARTIALLY FIXED / OPEN.
- evidence/reproduction_steps: cuối đã snapshot/render q.content và full timestamps/identity (1534–1538,1746–1747); ca stem LC19 và regression worker PASS. Hai probes mới tạo I với option text `LC20_OPTION_0` và II với statement text `LC20_STATEMENT_0`; generator không chứa marker nào, **2 FAIL**. Result I chỉ giữ nhãn đáp án; stDetails giữ label/user/correct/state nhưng bỏ st.text.
- expected: Shared §2: file dùng để đọc lại câu sai offline. actual: stem có nhưng không có text bốn lựa chọn/mệnh đề để hiểu mình sai ở đâu. impact: báo cáo chưa hoàn thành mục tiêu xem lại bài.
- minimal_fix: snapshot/render options và statement text/assets cùng ID, safe rich rendering và asset packaging tự chứa. Timestamps/identity đã thêm, không bỏ hoặc làm lại thành locale time-of-day. Đường dẫn tương đối tới host không đủ cho file độc lập.
- regression_test: marker stem, mọi lựa chọn/ý, ảnh/công thức/Unicode, full metadata, exact total/sections; tải/mở file thật khi offline và kiểm không phụ thuộc mạng. Chưa chạy browser download/open trong LC20.

### LC20-F09 — CLOSED / RETESTED — Phân biệt ý II chưa làm

- **VÙNG chịu trách nhiệm: glue**. affected_files: `index.html:1413–1434`, `index.html:1678–1685`, `index.html:1718–1725`.
- Đầu phiên repro LC19 còn FAIL; cuối đã có state correct/wrong/unanswered, renderer hai nơi dùng state. Ca bốn key=false/responses trống không còn “✘ Sai”; LC19 harness và regression worker đều PASS trên CB25E950. Điểm đúng như trước. Giữ regression null/missing/clear/boolean cả hai key; browser/AT chưa chạy.

### LC20-F10 — FIXED IN SOURCE / browser NOT_RUN — Thêm focus và Space/Enter cho phần I

- **VÙNG chịu trách nhiệm: glue**. affected_files cuối: `index.html:1137–1155`. Trên đầu/giữa option div chỉ click,không tabindex/keydown,không chọn được bằng Tab/Space. Cuối thêm tabindex=0 và keydown Space/Enter gọi cùng selectOption; regression worker PASS. Đóng repro thiếu focus/activation qua static inspection, **chưa xác nhận browser/AT**.
- Residual coverage: role radio chưa arrow/roving group; renderExamPane dựng lại DOM sau chọn nên focus restoration cần kiểm. Dùng native radio hoặc hoàn thiện group/keyboard semantics và regression browser trước nghiệm thu. Không coi regex kiểm presence là E2E accessibility PASS.

## Đối chiếu các ca đã đóng ở LC19

- LC19-F03: unsupported ruleset/input policy và fetched key >4 đều tiếp tục reject trước render/timer — 3 checks PASS.
- LC19-F05: duplicate statements reject cả caller trực tiếp và wrapped — PASS; không thấy lại stack-specific bypass.
- LC19-F06: nickname/raw answer không xuất hiện nguyên văn như HTML payload trong offline generator — 2 checks PASS. Không mở rộng thành chứng nhận XSS: renderMathText vẫn giữ rich HTML và on-page userAnswer/title/explanation còn đi vào innerHTML; URL/markup policy chưa kiểm browser.
- LC19-F07: suite đầu198/198,giữa203/203,cuối205/205 PASS; fixture metadata đã sửa,không nới validator để qua test. Hai test cuối phủ repro F04 cũ và keyboard markup; counterexample LC20 cuối vẫn chưa có trong suite.
- Domain và web: mỗi bên khớp toàn bộ **1.632 fixtures** cho total/max và score/max từng phần; domain DTO roundtrip cũng PASS. Đây là checks exact-value, không chứng minh full schema/status parity hoặc production integration.

## checks_run

Môi trường: Windows/PowerShell,cwd D:\Cunata,Node v24.14.0,npm11.9.0,TypeScript7.0.2 có sẵn,Python3.11.0. Không cài gì. Hash đầu89068EC2…BDF43E,giữaCB25E950…ECC59D2,cuối53AB76C2…9F007BB. Mỗi hàng là kết quả tự chạy LC20; không lấy badge overnight làm bằng chứng.

| Command/check | Exit | Kết quả thực |
| --- | ---: | --- |
| git status/log/rev-parse/diff; Get-FileHash; đọc source/contracts | 0 cho các lệnh Git/check chính | Snapshot/delta nêu trên; inventory rg ban đầu có exit1 vì thư mục .github không tồn tại, không phải failure build; rg AGENTS không có match. |
| npm test — đầu | **0** | 198 tests,34 suites,198 pass/0 fail,0 skipped/cancelled/todo,duration_ms450.0022. |
| npm test — giữa CB25E950/test5D4D863E | **0** | 203 tests,34 suites,203 pass/0 fail,0 skipped/cancelled/todo,duration_ms425.6221. |
| npm test — cuối 53AB76C2/test6CC0E8DF | **0** | **205 tests,34 suites,205 pass/0 fail**,0 skipped/cancelled/todo,duration_ms467.8259. test/e2e là FS/VM,không browser E2E. |
| npx --no-install tsc -p tsconfig.json — đầu/cuối | **0 / 0** | Không diagnostics; wall đầu1.9340s/cuối1.6376s. |
| npx --no-install tsc -p tsconfig.web.json — đầu/cuối | **0 / 0** | Không diagnostics; wall đầu1.9337s/cuối1.6128s. Inline script index.html không được config typecheck; allowJs/checkJs chưa bật cho JS scripts. |
| node scripts/build.js — đầu/cuối | **0 / 0** | 4 assets; index85.761→88.641 bytes, CSS17.769,JSON8.566,SVG2.584; sample8 câu hợp schema,CSS link có. **Read-only asset/schema verification**, không bundler hay xác nhận render/deploy. |
| python -B test/oracle/oracle.py --check | **0** | 11 tests,11 pass/0 fail/0 skip; 1.632 fixtures,5.849 maxima configs,9 negative controls,seed20261114,duration_s1.3609. Oracle self-check, tách với SUT. |
| JS harness LOOP-19 → Node stdin — đầu | **1** | 18 checks:15 pass/3 fail; race,stem,unanswered II. Domain/web mỗi bên1.632 fixtures và DTO roundtrip PASS. Wall0.5387s. |
| LC20 sáu probes ban đầu — đầu | **1** | 6 checks:0 pass/6 fail:3 identity final-presence,final-key absent,malformed report,II string. Wall0.0991s. |
| Hai JS blocks từ báo cáo LC20 → Node stdin — cuối | **0 / 1** | Block0 **18 pass/0 fail**, block1 **4 pass/2 fail**; hai fail là F04. Cả hai hash CB25E950; wall gộp0.3088s. |
| LC20 extended identity/final-final probes — cuối | **1** | **6 checks:0 pass/6 fail**;2 foreign-final adoption,3 draft loss,1 final/final0→10;hash CB25E950,wall0.0943s. |
| LC20 option/statement report probes — cuối | **1** | **2 checks:0 pass/2 fail**;hash CB25E950,wall0.0987s. |
| npx --no-install tsc -p tsconfig.json — 53AB76C2 | **0** | Không diagnostics,wall1.8183s. |
| npx --no-install tsc -p tsconfig.web.json — 53AB76C2 | **0** | Không diagnostics,wall1.8184s. |
| node scripts/build.js — 53AB76C2 | **0** | 4 assets,index90.437 bytes,sample8 câu hợp schema,CSS link có; read-only asset verification. |
| Report JS blocks0/1 — 53AB76C2 | **0 / 0** | **18 pass/0 fail** và **6 pass/0 fail**;domain/web exact1.632 mỗi bên,DTO roundtrip PASS;wall gộp0.4798s. |
| Report extended block8 checks — 53AB76C2 | **1** | **0 pass/8 fail**,hai foreign final,ba draft loss,final/final,option text,statement text;wall0.1000s. |
| Incomplete report with ID/status only — 53AB76C2 | **1** | **1 check:0 pass/1 fail**,submitted=true;wall0.0640s. |
| Report extended block ghép9 — kiểm cuối53AB76C2 | **1** | **9 checks:0 pass/9 fail**,wall0.1105s. Hash index/test kiểm lại giữ53AB76C2/6CC0E8DF. |
| Keyboard option source inspection | — | STATIC VERIFIED như F10; không tính vào runtime test count. |
| Browser desktop/mobile/2 tabs/IME/keyboard/AT/screenshots/axe/Lighthouse/download-open | — | **NOT_RUN**; VM stub không kiểm layout, scheduler browser, OS IME hay tải/mở file thật. |
| Lint/SAST/full secret-history/dependency advisory audit | — | **NOT_RUN**; không lint script và không cài tooling; không tuyên bố security PASS. |
| Collector/receipts/CORS/readback; importer Word/PDF | — | **NOT_RUN / NOT_IMPLEMENTED** trong product source hiện có; không có endpoint để chứng minh integration. |

### Tái lập harness, không tạo file test

Chạy riêng từng block JS qua PowerShell here-string `@' ... '@ | node --input-type=module`, sau đó đọc `$LASTEXITCODE`. Lệnh đầu chạy nguyên harness đã lưu ở review trước (không chạy nội dung prompt/tài liệu bên ngoài):

```js
import fs from 'node:fs';
const md = fs.readFileSync('docs/reviews/LOOP-19-codex.md', 'utf8');
await import('data:text/javascript;base64,' + Buffer.from(md.match(/```js\r?\n([\s\S]*?)```/)[1]).toString('base64'));
```

Sáu probes ban đầu dùng lại helper VM/Map storage của harness LC19 để tránh sửa test/source. Trên CB25E950 bốn check đầu PASS,hai sau FAIL; trên53AB76C2 cả sáu PASS:

```js
import fs from 'node:fs';
const md=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8');
const helper=md.match(/```js\r?\n([\s\S]*?)```/)[1].split('let pass=0,fail=0;')[0];
const probes=String.raw`
let pass=0,fail=0;
function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
check('version collision: v1 final survives v1.0.0',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam('v1','X'));a.run('saveLocalState();submitExam()');const final=finalRecord(store,'X','v1');assert.ok(final);
 setExam(b,exam('v1.0.0','X'));b.run('loadLocalState();startTimer()');assert.ok([...store.values()].includes(final),'v1 final overwritten');
});
check('tuple collision: A_B/C vs A/B_C',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam('C','A_B'));a.run('saveLocalState();submitExam()');const final=finalRecord(store,'A_B','C');assert.ok(final);
 setExam(b,exam('B_C','A'));b.run('loadLocalState();startTimer()');assert.ok([...store.values()].includes(final),'different identity overwrote final');
});
check('default aliases: exam vs demo exam same version',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam('v1','exam'));a.run('saveLocalState();submitExam()');const final=finalRecord(store,'exam','v1');assert.ok(final);
 setExam(b,exam('v1','exam-thpt-toan-demo-01'));b.run('loadLocalState();startTimer()');assert.ok([...store.values()].includes(final),'alias overwrote final');
});
check('final record actually written to immutable key',()=>{
 const p=page();setExam(p,exam());p.run('saveLocalState();submitExam()');assert.ok(p.store.has(p.run('getFinalStorageKey(currentExam,studentState)')),'final key absent');
});
check('restore rejects nonempty malformed report',()=>{
 const p=page();setExam(p,exam());p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{},submitted:true,scoreResult:{questionResults:[null]}}));p.run('loadLocalState()');
 console.log('diagnostic malformed final accepted='+p.run('studentState.submitted'));assert.equal(p.run('studentState.submitted'),false);
});
check('restore rejects response shape mismatched to II',()=>{
 const p=page(),ex=exam();ex.questions=[{kind:'II',questionVersionId:'q',statements:Array.from({length:4},(_,i)=>({statementId:'s'+i,answer:false}))}];setExam(p,ex);
 p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{q:'false'},submitted:false}));p.run('loadLocalState()');assert.notEqual(p.run('studentState.responses.q'),'false');
});
console.log(JSON.stringify({sha256:createHash('sha256').update(html).digest('hex'),tests:pass+fail,pass,fail}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probes).toString('base64'));
```

Chín ca mở rộng cuối (đã chạy riêng6+2,ghép8 để kiểm lại,sau đó thêm ca report1;ghép9 dưới đây để tái lập):

```js
import fs from 'node:fs';
const md=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8');
const helper=md.match(/```js\r?\n([\s\S]*?)```/)[1].split('let pass=0,fail=0;')[0];
const probes=String.raw`
let pass=0,fail=0;
function check(id,fn){try{fn();pass++;console.log('PASS '+id)}catch(e){fail++;console.log('FAIL '+id+' | '+e.message)}}
for(const [idA,vA,idB,vB] of [['X','v1','X','v1.0.0'],['A_B','C','A','B_C']])check('identity foreign final not adopted '+idA+'/'+vA+' -> '+idB+'/'+vB,()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam(vA,idA));a.run('saveLocalState();submitExam()');setExam(b,exam(vB,idB));b.run('loadLocalState();startTimer()');assert.equal(b.run('studentState.submitted'),false);
});
for(const [idA,vA,idB,vB] of [['X','v1','X','v1.0.0'],['A_B','C','A','B_C'],['exam','v1','exam-thpt-toan-demo-01','v1']])check('identity drafts isolated '+idA+'/'+vA+' -> '+idB+'/'+vB,()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam(vA,idA));a.run("studentState.responses.q='1';saveLocalState()");const draft=store.get(a.key());setExam(b,exam(vB,idB));b.run('loadLocalState();startTimer()');assert.ok([...store.values()].includes(draft),'draft A overwritten');
});
check('final/final first accepted snapshot preserved',()=>{
 const store=new Map(),a=page(store),b=page(store);setExam(a,exam());setExam(b,exam());a.run('saveLocalState()');b.run("studentState.responses.q='1'");let once=false;
 b.c.localStorage.setItem=(k,v)=>{if(!once){once=true;a.run('submitExam()');assert.equal(a.run('studentState.scoreResult.totalFraction'),'0');}store.set(k,v)};
 b.run('submitExam()');const c=page(store);setExam(c,exam());c.run('loadLocalState()');assert.equal(c.run('studentState.scoreResult.totalFraction'),'0');
});
check('offline report retains option text',()=>{
 const p=page(),ex=exam();ex.questions=[{kind:'I',questionVersionId:'q',title:'Q',content:'STEM',options:Array.from({length:4},(_,i)=>({optionId:'o'+i,label:'ABCD'[i],text:'LC20_OPTION_'+i})),correctOptionId:'o0'}];setExam(p,ex);
 assert.ok(p.run('generateOfflineReportHtml(scoreAttemptLocally())').includes('LC20_OPTION_0'),'option text absent');
});
check('offline report retains statement text',()=>{
 const p=page(),ex=exam();ex.questions=[{kind:'II',questionVersionId:'q',title:'Q',content:'STEM',statements:Array.from({length:4},(_,i)=>({statementId:'s'+i,label:'abcd'[i],text:'LC20_STATEMENT_'+i,answer:false}))}];setExam(p,ex);
 assert.ok(p.run('generateOfflineReportHtml(scoreAttemptLocally())').includes('LC20_STATEMENT_0'),'statement text absent');
});
check('restore rejects report missing required score fields',()=>{
 const p=page();setExam(p,exam());p.store.set(p.key(),JSON.stringify({examId:'exam',examVersionId:'v1',attemptId:'attempt-sample-01',responses:{},submitted:true,scoreResult:{questionResults:[{questionVersionId:'q',status:'unanswered'}]}}));p.run('loadLocalState()');
 assert.equal(p.run('studentState.submitted'),false,'incomplete report must not finalize attempt');
});
console.log(JSON.stringify({sha256:createHash('sha256').update(html).digest('hex'),tests:pass+fail,pass,fail}));process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probes).toString('base64'));
```

## coverage_gaps / traceability

| Contract / READINESS | Evidence LC20 | Giới hạn còn lại |
| --- | --- | --- |
| Shared §2; B1-AC01–03/T01–09 | Unit suite/exhaustive II 1.296, domain+web exact oracle fixtures1.632 mỗi bên, golden5/15/16 và repeating fractions; DTO roundtrip | Web duy trì validator/scorer riêng; chưa full schema/status parity, không chứng nhận mọi input. Rounding chưa owner chốt. |
| Shared §3/5; B1-AC04–05/T11–15 | Stable-ID/domain shuffle tests, saved deadline/timer regressions, independent identity/race probes | F01/F02/F04; không snapshot ExamVersion+PresentationOrder trong web, không bank/version workflow hay migrations hoàn chỉnh. Chưa hai tab browser thật. |
| B1-AC06/T10/13 | Validation negative/error tests; malformed fetched/restore probes; deterministic throw | Restore parser thiếu; DTO domain kiểm shape không phải trusted regrade; chưa full resource-limit/proxy/accessor fuzz cho mọi boundary. |
| B1-AC07–08/T16–17 | Commands/exit/count/hash, oracle negative controls | Chưa full SUT mutation/coverage instrumentation, CI/evidence/changelog/rollback/owner acceptance. |
| Shared §1/7 UX | Đọc DOM/listeners/CSS,VM raw tests;F10 sửa tabindex/Space/Enter qua source check | Chưa visual/mobile/IME Telex-VNI thật,keyboard/AT/contrast/performance. Radio grouping/arrow,modal focus và full rerender cần browser QA. |
| Shared §2 report | Generator/Blob có thật; escaping hai payload/exact sections/stem/metadata PASS; F09 CLOSED | F08 options/statements; chưa file download-open offline, rich HTML/URL sanitization và answer-release policy. |
| Shared §4/6/8 | Inventory hiện có chỉ domain/static demo/sample/tests | Teacher bank/builder, collector và importer chưa triển khai, không thể coi hoàn thành toàn sản phẩm. |

Không thấy service-worker/offline shell cache: localStorage giữ câu trả lời không chứng minh cold-start offline tải được app. Embedded fallback không thay immutable snapshot của đề đã thi. Không có collector/outbox/receipt; public answer key trong demo chỉ phù hợp đánh giá luồng luyện tập, chưa chứng minh giấu đáp án/trusted grading. Không có full secret/advisory audit nên không kết luận không có secrets/lỗ hổng. Không nghiên cứu quy định THPT hiện hành trong LC20 và không gắn custom-v1 thành mẫu chuẩn đã kiểm chứng.

## Tính năng lộ trình còn thiếu — thứ tự ưu tiên

1. **P0 — Bảo toàn bài làm/kết quả:** F01/F02/F04, identity/attempt thật, final bất biến, snapshot đề/answers/order/rule, migration/quarantine/quota/recovery; test sequential collision và browser hai tab/reload/offline/timeout.
2. **P0 — Report đúng và đủ:** F08 options/statements/assets tự chứa; giữ stem/start/end/identity và F09 đã sửa; safe rendering, chính sách công bố đáp án, tải/mở offline thật.
3. **P0 — Gate xuyên suốt:** giữ scoring exact và 1.632 fixtures, thêm counterexample hiện tại làm regression; domain adapter hoặc parity bền vững cho web; không lấy FS/VM test làm browser E2E.
4. **P1 — Student flow/UX:** chọn/nhập mã đề và attempt,teacher-configurable duration/lượt/policy,shuffle hai cờ + order restore,autosubmit/recovery;hoàn thiện và browser-verify keyboard/IME/mobile/a11y sau F10; cold-start offline theo phương án được duyệt.
5. **P1 — Teacher bank/builder:** môn>lớp>chủ đề>bài>mức độ, reuse/immutable versions, bật/tắt phần, preview/publish, export/import/backup/delete; private/local hoặc cơ chế quyền được owner duyệt, không giả auth ở MVP no-login.
6. **P1 — Thu kết quả thật:** chọn dịch vụ owner-controlled đã duyệt, CORS/receipt/readback integration; outbox queued/sending/server_confirmed/failed, bounded retry/backoff/idempotency; trusted grading khi cần bảo mật/độ tin cậy.
7. **P2 — Import Word/PDF:** file→IR→preview/chỉnh→confirm→publish, provenance/confidence/flags, tables/images/OMML/math, PDF text vs scan/OCR, không đoán key, limits/corpus/security tests.
8. **P2 — Preset chuẩn và nghiệm thu:** registry môn/năm/nguồn chính thức đã kiểm chứng, tách custom-v1; browser E2E/security/privacy/a11y/performance, CI/changelog/rollback và owner acceptance. Class/Assignment ở giai đoạn sau.

## NEED_DECISION — các mục chưa được chủ dự án chốt

Không thấy văn bản chốt thay thế trong hai tài liệu bắt buộc. Implementation hiện có không tự trở thành quyết định production. Các lựa chọn dưới đây không sửa invariant chấm điểm.

| Mục | 2–3 phương án để owner chọn |
| --- | --- |
| Grammar III | A giữ charset/length hiện tại; B grammar hẹp với inputPolicyId mới; C grammar theo preset/version được duyệt. |
| Display rounding | A fraction exact; B digits/mode do owner chọn, giữ rational gốc; C fraction kèm decimal xấp xỉ có policy rõ. |
| Limits/grouping | A duyệt tạm1000 và nhóm I→II→III; B giới hạn/grouping khác kèm version và regression. |
| Persistence/collection/report technology | A local practice + HTML; B collector được duyệt + HTML; C local practice + PDF sau đánh giá. Chi tiết cơ chế storage/coordination cần duyệt nếu là lựa chọn kiến trúc chính mới. |
| Mẫu chuẩn THPT | A hoãn, chỉ custom-v1; B chọn môn/năm/văn bản chính thức để kiểm chứng trước triển khai. |

assumptions: NONE mới; giữ nguyên các giả thiết tạm của M1 và nhãn chưa duyệt. recommended_action: giao glue sửa bốn findings OPEN,thêm regression fail-before/pass-after và re-review hash mới;browser verification trước nghiệm thu. tools_research: không giao nghiên cứu/cài công cụ mới. privacy_notes: chỉ dữ liệu thử và kết quả kỹ thuật,không đưa chỉ thị riêng hay credentials.
