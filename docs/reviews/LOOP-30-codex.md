# LC30 — Kiểm định độc lập toàn sản phẩm

**verdict: CHANGES_REQUESTED.** Còn 7 findings đã tái lập: 1 BLOCKER, 1 CRITICAL, 5 MAJOR. Gate hiện tại xanh không đủ nghiệm thu toàn sản phẩm. LC29-F08 đã FIXED / RETESTED; LC29-F01–F07 vẫn OPEN / RETESTED. Không tìm thấy counterexample số học mới trong các ca đã chạy. Không tuyên bố DONE/FULLY_VERIFIED.

review_id/task_id/worker_id: LC30; reviewer: Codex; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 và M1-scoring-contract v1.0 (đã đọc toàn bộ); acceptance_reference: READINESS §6 / B1-AC01–08 / B1-T01–17; risk_level: HIGH. **handoff: NEED_DECISION** cho chính sách collector/stack còn mở; việc sửa lỗi identity/restore/receipt/sanitization không cần tự chốt chính sách mới.

## Revision, delta và phạm vi

- base_commit = head_commit: `2425ce864bd6eb06be5c56945d241da296c6986c`, branch main. Review log/diff từ HEAD của LC29 `d6efb1162fe62f67321c7c0767116b69f215dfef` tới HEAD; đối chiếu cả cutoff working tree LC29, không coi toàn bộ commit round25 là code chưa từng review.
- Product working tree sạch tại các checks/probes. Có thay đổi sẵn ở ops/OVERNIGHT_STATUS.md, ops/dashboard/dashboard_data.js, ops/forever.stdout.txt, ops/overnight.log, workers.html và untracked metadata/prompt round26/LC30 của điều phối; không sửa/hoàn tác chúng. Không thấy AGENTS.md trong inventory repo hoặc D:\. Không đọc prompt riêng của worker khác.
- SHA256 index.html: `61dfdeb985a24a0bc7049faf8712cf0dcdcee3e88fad4e166f5bc035fb93bac0`; src/domain/rational.ts: `054d5e7d2c71df43bb7da641cc3e4845921014bb3c7071fa6a468b67b60b6696`; apps-script/Code.js: `12dc6fbb93de14b3dfdcfeb9252e9f4b67cefb7308a7f1114e9e0d416aa00887`.
- Delta commit: topic/chapter filter, badges và seed metadata trong bank/builder; thêm tests prototype-property IDs trong validate/shuffle và test multi-topic. Production domain/collector/package/lockfile không đổi. So với cutoff LC29, test đã sửa ID Oxyz theo fixture thật; full suite hiện 346/346. Không có fix nguyên nhân F01–F07 trong delta đã đọc.
- Cutoff cuối: worker đồng thời sửa `test/domain/judge.test.ts` (+prototype-ID assertions) và `test/domain/shortAnswer.test.ts` (+astral-code-point assertions). Đã đọc delta 101 insertions/1 deletion, chạy lại npm test **348/348**, typecheck domain exit0. HEAD và hash index/collector/domain production không đổi trong kiểm cuối; các findings/probes vẫn áp dụng source đã kiểm. Không sửa file của worker.
- files_reviewed: `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; `index.html` theo các đường validate → order → input/timer → local save/restore → submit → collector → report/restart, bank/builder/filter/reuse/publish; `apps-script/Code.js`, manifest/README; package.json, tsconfig.json, tsconfig.web.json, scripts/build.js, README, sample fixture và assertions/harness tests liên quan. CSS/media: kiểm tĩnh/assets, không visual acceptance.
- Review theo luồng và ranh giới dữ liệu toàn sản phẩm, không chứng nhận đọc từng dòng của mọi test/ops/research/dependency hoặc toàn lịch sử. Không cài dependency, không sửa code, không commit/deploy, không branch/worktree. Chỉ tạo báo cáo này; probes chạy stdin với Map/Google mocks trong RAM.

## Findings

### LC30-F01 — BLOCKER — Các học sinh và lượt làm lại dùng chung attempt ID

- **VÙNG chịu trách nhiệm: glue.** Status: VERIFIED / OPEN từ LC29-F01.
- affected_files: `index.html:1540–1545`, `index.html:1142–1177`, `index.html:3071–3091`; `apps-script/Code.js:181,204–215`.
- evidence/reproduction_steps: chạy block JS web LC29 trong phần tái lập dưới: hai page contexts với store riêng đều khởi tạo `attempt-sample-01`. Submit → restart → page mới → initExam → submit vẫn cùng ID; historyLength=1. Collector capture nhận Student A tổng 1 rồi Student B tổng 9 cùng ID: NEWLY_RECORDED rồi ALREADY_RECORDED, không ghi thêm hàng của B.
- expected: mỗi lượt mới độc lập có ID riêng; reload/retry cùng lượt giữ ID; hai học sinh đồng thời có hai bản ghi. Shared §1/3/5.
- actual/impact: kết quả học sinh sau bị dedupe mất nhưng client vẫn có thể báo confirmed; làm lại thay entry lịch sử và xóa final cũ.
- minimal_fix: cấp ID đủ mạnh khi tạo lượt; persist active pointer để resume; restart tạo ID mới và giữ archive/final trước. Không dùng nickname hoặc timestamp đơn lẻ làm định danh duy nhất.
- regression_test: hai contexts độc lập + hai lượt restart qua init thật; hai hàng collector, history/raw/report cũ còn đọc được; retry cùng payload chỉ một hàng; fixed-clock collision control. Test tự gán ID lượt 2 không đủ.

### LC30-F02 — MAJOR — Refresh/reimport không resume bài JSON đã lưu

- **VÙNG chịu trách nhiệm: glue.** Status: VERIFIED / OPEN từ LC29-F02.
- affected_files: `index.html:1097–1109`, `index.html:1644–1667`, `index.html:1798–1802`, `index.html:3113–3138`.
- evidence/reproduction_steps: load custom `my-custom`, trả lời q="1", saveLocalState; tạo page mới cùng store, initExam fetch sample hợp lệ. currentExam trở về `exam-thpt-toan-demo-01`; reimport cùng custom sau đó cấp ID khác, responses.q=undefined. Probe fail đúng kỳ vọng phục hồi, không phải vì lỗi harness.
- expected: phục hồi exam/version/snapshot, ID, raw answers, deadline và order sau refresh/offline. Shared §3/5.
- actual/impact: draft vẫn còn trong storage nhưng luồng UI không tìm được; người dùng phải làm lại, trộn/thời gian cũng có thể khởi tạo mới.
- minimal_fix: lưu active attempt pointer và immutable exam/settings/question/order snapshot; boot resolve trước sample; tách resume khỏi create-new trong loader. Không resume bằng bank/latest file.
- regression_test: JSON → answer/name/flag → refresh online/offline/back-forward → giữ đúng toàn bộ tuple/snapshot; reimport đúng version có resume; version mới không phá lượt cũ; restart custom vẫn dùng đúng đề.

### LC30-F03 — MAJOR — Receipt của A ghi confirmed/final vào draft B

- **VÙNG chịu trách nhiệm: glue.** Status: VERIFIED / OPEN từ LC29-F03.
- affected_files: `index.html:2707–2741`, `index.html:2744–2758`.
- evidence/reproduction_steps: giữ fetch của dispatch A pending; loadExamVersion(NEXT); resolve A bằng success receipt A. Probe thấy draft NEXT có serverConfirmed=true, serverReceipt.attempt_id=`attempt-sample-01`; storage final NEXT được ghi với submitted=false, scoreResult=null.
- expected: response chỉ cập nhật record tương ứng identity/payload request; chuyển đề không thay chủ sở hữu request. Shared §3/5.
- actual/impact: UI/persistence xác nhận máy chủ nhận bài B chưa nộp, ghi sai namespace final. Không khẳng định Google đã ghi nhầm B.
- minimal_fix: capture request identity, payload, revision và storage keys trước await; reconcile đúng record; chỉ update UI nếu active tuple còn trùng. Không serialize global studentState mới sau await.
- regression_test: delayed success/failure A sau load/restart B; B không nhận receipt/final của A, A vẫn giữ receipt đúng khi reload; kết hợp stale tab và quota failure.

### LC30-F04 — MAJOR — Receipt sai attempt vẫn được chấp nhận

- **VÙNG chịu trách nhiệm: glue.** Status: VERIFIED / OPEN từ LC29-F04.
- affected_files: `index.html:2742–2747`, restore `index.html:1920–1922`.
- evidence/reproduction_steps: dispatch attempt hiện tại, HTTP ok trả `{success:true,attempt_id:"ANOTHER",status:"NEWLY_RECORDED"}`; probe thấy serverConfirmed=true. Source chỉ kiểm success, không bind ID/status/payload.
- expected: chỉ receipt hợp lệ cho đúng bài đã gửi mới đổi server_confirmed. Shared §3.
- actual/impact: trạng thái xác nhận không chứng minh bài tương ứng được nhận; kết hợp ID chung càng dễ xác nhận bản ghi người khác.
- minimal_fix: schema receipt chặt, status allowlist, match attempt/exam/version và payload binding theo protocol đã thống nhất; validate lại receipt persisted khi restore.
- regression_test: matching NEWLY_RECORDED/ALREADY_RECORDED controls; wrong/missing ID, unknown status, malformed/conflicting payload và restored forged receipt đều không confirmed; readback Google riêng.

### LC30-F05 — MAJOR — Pending final không retry sau reload

- **VÙNG chịu trách nhiệm: glue.** Status: VERIFIED / OPEN từ LC29-F05.
- affected_files: `index.html:2583–2598`, `index.html:2686–2688`, `index.html:2762–2773`, boot/restore `index.html:1644–1686,1796–1950`.
- evidence/reproduction_steps: submit local final chưa confirmed; page mới cùng store, endpoint/fetch thành công; initExam rồi submitExam. Counter POST vẫn 0. Early return adopt final không dispatch; source không có durable outbox, online retry hay bounded backoff scheduler.
- expected: queued/sending/failed chính xác, pending phục hồi, bounded retry/backoff và idempotency. Shared §3.
- actual/impact: điểm bị giữ local vô thời hạn; nộp lại không gửi được. Gate test network failure chỉ chứng minh không crash, không chứng minh eventual delivery.
- minimal_fix: durable outbox, enqueue payload/identity cố định trước POST; boot/online/manual retry có giới hạn/backoff; chỉ ack đúng receipt mới clear. Badge phải phản ánh cả lỗi persistence.
- regression_test: offline submit → reload online → một record; server ghi nhưng mất response → retry cùng ID/payload; giới hạn/backoff/failure/manual retry; close/reopen và quota không mất pending hoặc báo confirmed sai.

### LC30-F06 — CRITICAL — Formula protection bỏ sót các cột ID/time/policy

- **VÙNG chịu trách nhiệm: glue.** Status: VERIFIED tại appendRow sink với Sheet mock; thực thi công thức trên Google thật NOT_VERIFIED. OPEN từ LC29-F06.
- affected_files: `apps-script/Code.js:106–112,124,138–156,181–185,219–220`; public access `apps-script/appsscript.json:7–9`.
- evidence/reproduction_steps: collector block LC29 gọi doPost với attempt/exam/version/name/start/end/policy lần lượt `=1+1`…`=7+7`. Capture row A/B/C/E/F/P vẫn bắt đầu `=`, D được prefix `'`; receipt NEWLY_RECORDED. Sử dụng production parse/format/write path, chỉ mock Google I/O.
- expected: validate untrusted schema và ghi text an toàn nhất quán toàn hàng; anonymous caller không được đưa formula tới bảng của owner. Shared §4/7.
- actual/impact: sanitize tên/điểm/raw bị bypass qua field khác. Không tuyên bố đã khai thác Google hoặc đọc dữ liệu thật.
- minimal_fix: validate schema, length, IDs, timestamps/policy; áp text safety cho mọi cột nhận chuỗi trước sink và giữ canonical identity cho dedupe. Nếu chọn RAW/text-format API, xác minh trên Sheet thử được duyệt.
- regression_test: từng cột qua doPost tới appendRow với =,+,-,@,tab/newline; negative III/fraction/raw giữ nghĩa; retry sanitized identity vẫn dedupe; harmless formula fixture trên Google thử và kiểm text/formula readback.

### LC30-F07 — MAJOR — Collector nhận 999/10 và thiếu dữ liệu chấm điểm

- **VÙNG chịu trách nhiệm: glue.** Status: VERIFIED / OPEN từ LC29-F07; trust policy NEED_DECISION.
- affected_files: `apps-script/Code.js:115–124,165–185,219–220`.
- evidence/reproduction_steps: doPost payload có attempt_id, total="999", maxTotal="10", không answers/sections vẫn NEWLY_RECORDED; capture N/O là 999/10, sections mặc định 0. Không gọi Google thật.
- expected: reject schema/rational/range/section-total mismatch. Với kiểm tra đáng tin, server chấm từ snapshot/key do owner kiểm soát, không tin điểm/key client. Shared §3/4.
- actual/impact: bảng kết quả chứa điểm vô nghĩa hoặc tự khai; validation consistency cũng chưa có. Nickname/login không phải cách sửa trust boundary này.
- minimal_fix: schema + exact-rational consistency trước write; owner chọn self-reported practice có nhãn hay trusted server grading. Trusted mode phải resolve snapshot và chấm lại; kiểm range không chứng minh correctness.
- regression_test: missing IDs, malformed/negative/>max fractions, section sum mismatch, unknown policy/version; forged in-range client score; valid repeating fractions; cùng ID khác payload phải conflict thay vì success vô điều kiện.

## checks_run

Environment: Windows PowerShell, cwd D:\Cunata, Node v24.14.0, npm 11.9.0, TypeScript 7.0.2, Python 3.11.0. Evidence: output/exit codes transcript LC30 và mã tái lập dưới; không tạo log ngoài scope.

| Command/check | Exit | Kết quả thực tế / giới hạn |
| --- | ---: | --- |
| `npm test` (Select-Object -Last 28/12; exit $LASTEXITCODE) | 0 cả hai | Đầu **346/346**, 779.3637 ms; cuối **348 tests, 58 suites, 348 pass, 0 fail/cancelled/skipped/todo**, 781.8342 ms sau delta tests đồng thời. E2E là Node VM/DOM/Google mocks, không browser. LC29-F08 topic assertions đã đúng IDs fixture và pass. |
| `npx --no-install tsc -p tsconfig.json` | 0 cả hai | Không diagnostics; đầu 1.754 s, cuối 1.709 s wall sau delta tests. Compiler đã có, NOT_RUN lịch sử trong M1 không áp dụng runtime này. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics; 1.225 s wall. Không chứng minh inline JS/Google runtime đã typecheck toàn bộ. |
| `node scripts/build.js` | 0 | Asset/schema/syntax verification; index 231698, CSS 23967, JSON 8566, SVG 2584, Code.js 9170 bytes; 8 sample questions hợp lệ. Script không bundle/render/deploy. |
| `python -B test/oracle/oracle.py --check` | 0 | **11 pass / 0 fail/skip**, 1632 fixtures, 5849 maxima configurations, 9 negative controls, seed 20261114; 1.0648 s. Oracle-only, tách khỏi differential dưới. |
| 12 fenced JS child probes LC20/22/23/24/25/26/27/28 | 0 mỗi child | **88 cases / 88 pass / 0 fail**, gồm domain và web đối chiếu 1632 fixtures, DTO roundtrip, persistence/raw/report/schema regressions. Không cộng fixture/assertion vào count của npm test. |
| Fenced JS web LC29 block1 | **1** | **7 cases / 1 pass / 6 fail**: expired-refresh name pass; custom resume, unique IDs, restart/history, receipt mismatch, delayed receipt, pending retry fail. Trên hash index nêu ở trên. |
| Fenced JS collector LC29 block2 | 0 | Captures tái lập F01/F06/F07. Exit0 chỉ là probe chạy thành công, **không phải security PASS**; không có assert test count. |
| Wrapper spawnSync toàn bộ 14 blocks | **1** | 13 child exit0, 1 child exit1 (web LC29). Tổng assertion cases 95 = 89 pass + 6 fail; collector diagnostic tách riêng. 1.247 s wall. |
| `git diff --check -- index.html src test styles scripts README.md apps-script` | 0 | Không whitespace errors trong product working-tree scope. |
| git log/diff/status/rev-parse, SHA256 và version inventory | 0 | Snapshot/revision như trên; giữ nguyên file điều phối. Không dependency/lockfile changes trong delta review. |

NOT_RUN: browser thật desktop/mobile/hai tab, native IME Telex/VNI/cursor/keyboard/AT, screenshot/trace, cold-start offline, tải rồi mở report HTML/PDF thật; Google deployment/CORS/redirect/receipt readback, actual Sheet formula execution/concurrency; full SAST/advisory/license/full-history secret scan, axe/Lighthouse, mutation SUT. Không có lint script. rg inventory `web` từng báo thư mục không tồn tại; web hiện nằm inline index.html, không coi inventory error là product failure.

## Tái lập (không ghi file, không gửi Google)

Tại root repo, pipe đoạn JS sau vào `node --input-type=module`. Nó chạy đúng các blocks độc lập đã dùng; wrapper trả exit1 nếu bất kỳ child fail, in đủ stdout/stderr và child exit. Các blocks từ LC19 helper chỉ dùng VM/Map, không thay browser E2E. Expected hiện tại: regression children xanh, LC29 web exit1 (1/7 pass), collector in formula/forged-score/duplicate captures.

```js
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
let bad=0;
for (const n of [20,22,23,24,25,26,27,28,29]) {
  const md=fs.readFileSync(`docs/reviews/LOOP-${n}-codex.md`,'utf8');
  const blocks=[...md.matchAll(/^```js\r?\n([\s\S]*?)^```/gm)];
  for (let i=0;i<blocks.length;i++) {
    const r=spawnSync(process.execPath,['--input-type=module'],{
      input:blocks[i][1],encoding:'utf8'
    });
    console.log(`LC${n} block${i+1} exit=${r.status}\n${r.stdout}\n${r.stderr}`);
    if (r.status!==0) bad++;
  }
}
console.log('failing_child_commands='+bad);
process.exitCode=bad?1:0;
```

## coverage_gaps / traceability

- B1-AC01–03 / T01–09/T15: source, unit/exhaustive II, oracle differential và exact rational totals/sections không lộ sai số mới. Numeric III không normalize, null II không coi false. Giới hạn rational parse 200 chars/precision 100 đang có nhưng hợp đồng chữ ký không nêu; cần chốt/document compatibility limits trước mở rộng API, không coi test mới là owner approval.
- B1-AC04–06 / T11–14: shuffle flags/IDs/prototype strings, DTO và các regressions raw/persistence đã xanh. Bank/builder clone isolation trong RAM đã có; immutable attempt snapshot + boot pointer chưa có (F02). Không coi JSON loader, history/settings hoặc shuffle là hoàn toàn NOT_IMPLEMENTED.
- Offline/concurrency: fixtures xác nhận một số interleavings final/draft nhưng localStorage read→write không transaction/CAS. Race final/final tổng quát trên scheduler browser thật còn SUSPECTED / NOT VERIFIED; F03 là race async riêng đã chứng minh. localStorage draft không chứng minh offline shell/cold start. Retry/outbox F05 chưa đạt.
- UI/report: có score/max từng phần/tổng, timestamp, HTML download/print và releasePolicy display branch. Keys vẫn ở client, không nghiệm thu bảo mật giấu đáp án. Submit sớm clear timer; tự rerender công bố sau deadline chưa được test, giữ coverage gap thay vì gắn VERIFIED finding. Math renderer regex subset chưa chứng minh LaTeX tổng quát, media arbitrary/nested math hoặc mobile overflow. Chưa kiểm browser visual/a11y/IME.
- Bank/builder: có JSON import/export/edit/reorder/duplicate/reuse, subject/grade/difficulty/topic filters và topic badges mới. Chưa hoàn chỉnh cây Chương/Chủ đề > Bài theo IDs ổn định, publishing/archive/migrations và draft recovery; chuỗi topic phẳng không thay taxonomy. Packaging media tổng quát chưa được chứng minh.
- Collector đã implement dispatcher + LockService + dedupe + sample manifest; không ghi NOT_IMPLEMENTED toàn bộ. F01/F03–F07 cản nghiệm thu. ensureHeaderRow chạy trước lock (Code.js:192–196), cold-sheet concurrency chưa kiểm. Anonymous spam/resource controls, receipt payload binding, retention/export/delete và Google integration chưa có evidence nghiệm thu. Không dùng mock thay Google CORS hoặc trusted grade.
- B1-AC07/08 / T10/T16/T17: suite xanh không thay browser/integration/owner acceptance. Oracle negative controls không phải mutation SUT. Chưa có lint/full security/performance/rollback/migration acceptance cho toàn milestone.

## Lộ trình còn thiếu theo ưu tiên

1. **P0 / glue:** sửa F01/F02 identity, active pointer, immutable snapshot, resume/restart/archive trước nhiều học sinh; F03/F04/F06/F07 trước public collector; F05 durable bounded retry. Thêm failed probes vào test suite, giữ 88 regressions cũ.
2. **P1 / glue:** browser E2E thật desktop/mobile cho JSON → refresh/restart/back-forward, hai contexts/tab, offline/online, delayed receipt/quota; mở offline report, IME, keyboard/focus/AT/math/media. Kiểm release-after-deadline và maxAttempts đúng giới hạn no-login.
3. **P1 / glue:** chốt và kiểm Google collector mode/protocol; CORS/redirect/write/readback, dedupe payload-conflict, concurrency/resource controls, retention/export/delete/backup. Không publish credentials hay dùng client score cho trusted mode.
4. **P1 / glue:** hoàn thiện taxonomy Môn > Lớp > Chương/Chủ đề > Bài > Mức độ, bank versions/publish/archive, builder draft recovery và media export/import/backup.
5. **P2 / glue:** DOCX/PDF importer chưa implement: file → IR text/table/image/OMML/math/provenance/confidence → preview/sửa → confirm; PDF text/scan/OCR có cảnh báo, không đoán answer key; corpus nhiều cột/file lỗi/resource limits. JSON loader không thay importer tài liệu.
6. **P2 / glue + src/domain khi rule mới:** mẫu THPT theo môn/năm/nguồn chính thức được kiểm chứng, tách custom-v1; policy versions/migrations. Hoàn tất CI browser/a11y/performance/security/license/changelog/rollback và owner acceptance. Class/Assignment giai đoạn sau.

## NEED_DECISION

Không thấy xung đột scoring mới giữa hai contract. Không tự chốt các mục dưới; các options không phải thay đổi đã được phê duyệt.

| Quyết định owner | 2–3 phương án |
| --- | --- |
| Collector / độ tin cậy | A: self-reported practice có nhãn rõ; B: server chấm theo snapshot/key owner quản lý; C: hoãn collector public tới khi B được duyệt/kiểm. Schema/consistency vẫn bắt buộc nếu nhận kết quả. |
| Storage/hosting/report | A: duyệt local practice + HTML; B: transactional local store + Apps Script/serverless đã kiểm; C: bổ sung PDF sau đánh giá. Code hiện có không thay approval. |
| Grammar III | A: giữ charset/length tạm; B: grammar hẹp với inputPolicyId mới; C: grammar theo preset/version được duyệt. |
| Display rounding | A: fraction exact; B: digits/mode rõ, giữ rational gốc; C: fraction + decimal xấp xỉ có nhãn. |
| Limits/grouping | A: duyệt 1000 câu, grouping I→II→III và resource bounds cụ thể; B: đổi có version/regression/migration. |
| Mẫu chuẩn | A: milestone hiện tại chỉ custom-v1; B: chọn môn/năm/văn bản chính thức trước triển khai preset. |

assumptions: NONE mới. recommended_action: giao glue sửa findings, bổ sung regression thực và xác minh Google/browser trước nghiệm thu; owner trả lời policy tương ứng. tools_research: không giao nghiên cứu tool mới trong LC30. privacy_notes: chỉ dữ liệu thử/kết quả kỹ thuật, không credentials hoặc nội dung hồ sơ riêng.
