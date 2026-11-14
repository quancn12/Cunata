# LC28 — Kiểm định độc lập toàn sản phẩm

**verdict: CHANGES_REQUESTED.** LC27-F01 đã FIXED / RETESTED ở working tree mới, nhưng fix tạo regression **LC28-F01 (MAJOR)**: refresh draft đã hết giờ làm tên đã lưu bị thay bằng “Thí sinh tự do” trước autosubmit. Không tìm thấy counterexample số học mới trong phạm vi đã kiểm. Các gate tự động xanh không đủ nghiệm thu toàn sản phẩm. **handoff: NEED_DECISION** cho những policy còn mở ở cuối báo cáo; việc sửa lỗi tên không phụ thuộc các quyết định đó.

review_id/task_id: LC28; reviewer: Codex; worker_id: LC28; reviewed_at: 2026-11-14; requirements_version: Shared Product Contract v2.0 và M1-scoring-contract v1.0 (đã đọc toàn bộ); acceptance reference: READINESS §6, B1-AC01–08 / B1-T01–17; risk_level: HIGH.

## Revision, diff và phạm vi thực tế

- base_commit/head_commit được kiểm: `8c81aaa3c63dcc38f5dc1c748ff4399a1c680a81`, branch main. Đối chiếu log và diff từ head cuối LC27 `77861c8709d22f174dea9cacd8e1473ac3e33d2f` đến HEAD và working tree. Không tạo branch/worktree, không commit/deploy.
- SHA256 `index.html` đầu phiên: `68b030d737f30ed63c1473244eb01fd4a63155fa62039f9c64ed2f6250ade4b0`; **snapshot cuối đã kiểm: `b22b07f8bd3827bec13c334106a2133d1b57b0f94078e5b4da1728b413f751ac`**. Không có product/source/test working-tree diff lúc bắt đầu; worker sửa index, README và domain/web tests trong khi review. Đã đọc delta mới và chạy lại checks/probes trên hash cuối. Giữ nguyên tất cả thay đổi của worker/điều phối.
- Delta commit từ LC27: `index.html` siết envelope/raw types/foreign question IDs trong isValidScoreResult và copy responses khi adopt final; `test/e2e/demoFlow.test.ts` mở rộng matrix load/save/submit × main/final. Hai tests ở `test/domain/{scoreAttempt,validate}.test.ts` kiểm I/III raw sai kiểu; LC27 đã thấy chúng ở working tree cuối phiên, LC28 kiểm lại bản commit. Delta working tree mới: helper syncCandidateNameFromInput dùng chung save/submit, input/change listeners, disable ô tên ở report; thêm 3 domain tests Part II malformed statement object/ID/value. Không có thay đổi production `src/domain`, dependency, lockfile hay build config.
- Cuối phiên thêm một web regression test LC27 gồm 5 scenario: manual, deadline trên trang đang mở, escaping, stale-tab adopt, quota error; README cập nhật 232 tests. Đã đọc assertions và chạy lại suite/typecheck. Reload trong test này mở **final đã tồn tại**, không kiểm initExam phục hồi **draft quá hạn**, nên không bắt LC28-F01.
- files_reviewed: toàn bộ `src/domain/{model,rational,shortAnswer,validate,judge,shuffle,examMax,scoreAttempt,serialize,index}.ts`; luồng runtime `index.html` từ validation/rational/restore → rendering/input → timer/save/submit → report/download/restart; manifest/lockfile, hai tsconfig, README, `scripts/build.js`; focused delta assertions ở ba test files trên, acceptance sample và VM harness. CSS responsive/print được kiểm tĩnh; sample JSON/SVG được kiểm bằng validation/assets/acceptance. Domain unit suite, oracle và các probes hồi quy được chạy thật.
- Đây là review toàn sản phẩm hiện có theo các đường chạy và ranh giới quan trọng, không phải chứng nhận đã đọc mọi dòng test/dependency/ops/research/history. `scripts/update-index.js` là helper ghi lại index bằng implementation cũ, không nằm trong đường build hiện hành; không chạy helper ghi file. Không đọc prompt riêng của worker khác. Không tìm thấy AGENTS.md dưới repo hoặc tại D:\.
- Reviewer chỉ tạo `docs/reviews/LOOP-28-codex.md`. Không npm install, thêm dependency, sửa code/test/config hoặc ghi log/probe ra file ngoài scope.

## findings

### LC28-F01 — MAJOR — Refresh draft hết giờ ghi đè tên đã lưu bằng tên mặc định

- **VÙNG chịu trách nhiệm: glue.** status: OPEN / VERIFIED bằng inline code thật chạy trong Node VM; browser thật NOT_RUN. Đây là regression mới trong fix LC27-F01, không phải original reproduction vẫn fail.
- affected_files: `index.html:1157–1162` initExam gọi loadLocalState trước hydrate ô tên; `index.html:1369,1394–1396` restore tên rồi gọi submit ngay khi deadline đã qua; `index.html:1173–1179,2040` helper mới lấy ô tên mặc định ghi đè state trước chốt final.
- evidence: khi refresh, input trong HTML có value “Thí sinh tự do” (`index.html:59`). loadLocalState đã phục hồi candidateName nhưng nhánh overdue gọi submitExam đồng bộ trước khi initExam gán candEl.value. Lệnh syncCandidateNameFromInput mới trong submit vì vậy ghi đè tên phục hồi bằng giá trị DOM chưa hydrate. Sau đó initExam hydrate bằng tên sai vừa chốt.
- reproduction_steps (UI): nhập tên/SBD và làm bài để draft đã lưu; đóng tab trước deadline; mở lại sau deadline (hoặc refresh sau khi tab đã bị dừng cho tới hết giờ). Đọc tên trên kết quả/HTML. Không cần sửa dữ liệu localStorage hay đồng hồ để gặp lỗi: chỉ cần quay lại bài sau hạn.
- reproduction_steps (đã chạy): probe dưới đây dùng draft thật từ saveLocalState, chỉ đặt deadline quá hạn để điều khiển thời gian trong test. Trang mới bắt đầu với đúng default DOM; fetch trả đề hợp lệ; chạy initExam thật, load/submit/scorer/storage thật. Chỉ renderExamPane/renderPalette/showReportView được stub. Controls active-refresh và existing-final giữ đúng tên.
- expected: restore draft quá hạn phải chốt bằng nickname/SBD đã lưu; input chưa hydrate không phải dữ liệu người dùng mới nhập. Căn cứ Shared §2 báo cáo, §3 refresh/khôi phục và §4 nickname.
- actual: expired-refresh có state/final `Thí sinh tự do`, submitted=true thay vì `Nguyễn An LC28`; active-refresh và existing-final giữ đúng tên. **Exit 1, 3 cases, 2 pass / 1 fail** trên hash cuối. Không phát hiện sai điểm trong repro này.
- impact: mất metadata nhận diện đã lưu trên luồng quay lại bài sau hạn; nhiều học sinh có thể cùng hiện tên mặc định, final đã chốt không tự sửa được. Không kết luận ghi nhầm Google vì chưa có collector.
- minimal_fix: hydrate candidateName vào input từ state đã restore trước khi có thể gọi autosubmit, hoặc tách submit khi restore khỏi flush DOM chưa khởi tạo. Giữ flush tên mới cho manual/deadline khi trang đang hoạt động và giữ nhánh adopt final đầu. Không bỏ fix LC27 chỉ để làm probe mới xanh.
- regression_test: active refresh, expired refresh qua initExam, expired legacy/main draft, existing final, Unicode/HTML tên; kiểm state/final/generated HTML/reload. Giữ manual/deadline/saved-control LC27 và double-submit/stale-tab tests.

Reproduction original LC27 chạy từ repo root (không tạo file), hiện **3/3 PASS** sau fix:

```powershell
@'
import fs from 'node:fs';
const code=fs.readFileSync('docs/reviews/LOOP-27-codex.md','utf8')
  .match(/^```js\r?\n([\s\S]*?)^```/m)[1];
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
'@ | node --input-type=module
```

## Retest và đánh giá delta

| Hạng mục | Kết quả hiện tại |
| --- | --- |
| LC27-F01 | **FIXED / RETESTED**: đầu phiên 1 pass / 2 fail; sau fix original reproduction **3/3 PASS**. Nhánh flush mới gây LC28-F01 overdue-refresh như đã chứng minh. |
| LC26-F01, I/III raw sai kiểu | Original 24/24 checks PASS. Domain tests mới kiểm TYPE_MISMATCH đúng path; web matrix kiểm cả main/final và load/save/submit. Submit malformed stored final không adopt full score. |
| Adopt final copy responses | Đã đọc cả save/submit delta. Suite/matrix và probes hồi quy PASS; state raw được copy cùng score thay vì giữ raw của tab cũ. Không coi đây là transaction/CAS. |
| LC25 II missing/null/empty raw và infinity | Probes gốc PASS 4/4 và block 5/5. Null không được coi là false; infinity không biến thành membership. |
| LC24 own special IDs, foreign refs, report/raw mismatch | Probes gốc PASS; own `__proto__` đáp án giữ điểm qua save/load; foreign statement refs và contradictory report bị từ chối trong các cases đã chạy. |
| Domain và web differential | Cả hai đối chiếu đúng 1.632 fixtures về total/max/từng phần; domain DTO roundtrip cũng PASS. Không dùng expected tính bởi production. |

## checks_run

Environment: Windows PowerShell, cwd D:\Cunata; Node v24.14.0, npm 11.9.0, TypeScript 7.0.2, Python 3.11.0. Artifact evidence: output/exit code trong tool transcript LC28 và reproduction tham chiếu ở trên; không ghi log ngoài scope. Thời gian wall từ tool, trừ duration do runner tự báo.

| Lệnh / kiểm tra | Exit | Evidence / giới hạn |
| --- | ---: | --- |
| `npm test` (pipe Select-Object, trả `$LASTEXITCODE`) | 0 | Đầu phiên 228/228, giữa 231/231; cuối **232 tests, 35 suites, 232 pass, 0 fail/cancelled/skipped/todo; duration 520.0483 ms.** “E2E” ở đây là Node VM/stubs, không phải browser. |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không diagnostics; đầu 1.2283 s, cuối 1.5580 s wall. Compiler có sẵn; dòng NOT_RUN cũ trong M1 không còn đúng với môi trường hiện tại. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không diagnostics; đầu 1.2011 s, cuối 1.3786 s wall. Include src/scripts/test; không typecheck inline JS trong index.html. |
| `node scripts/build.js` | 0 | Bản cuối: index **119392**, CSS 17769, JSON 8566, SVG 2584 bytes; schema 8 câu hợp lệ; stylesheet link có. Đây là asset/schema verification, không bundling hay browser render. |
| `python -B test/oracle/oracle.py --check` | 0 | **11/11 pass**, fail/skip 0; 1632 fixtures, 5849 maxima configs, 9 negative controls; seed 20261114; duration 1.0467 s. Oracle-only tự nó không phải SUT differential. |
| Trích fenced JS của LC20/22/23/24/25/26 qua Node stdin, spawnSync từng block | 0 cho cả 10 child | Đầu và sau fix đều **82/82 checks pass** (18+6+9+6+3+3+4+5+4+24), xác nhận hash cuối. Gồm differential domain/web 1632 fixtures và domain DTO roundtrip. Không cộng fixture/assertion thành số tests runner. |
| Original LC27-F01, lệnh ở trên | đầu **1**, cuối **0** | Trước fix 3 cases, 1 pass / 2 fail; sau fix **3 cases, 3 pass / 0 fail**, wall 0.1344 s. |
| Probe LC28-F01 expired-refresh bên dưới | **1** | **3 cases, 2 pass / 1 fail**, wall 0.1039 s; expired-refresh sai tên, active-refresh/existing-final pass, hash cuối. |
| Strict fraction/DTO negative probe qua Node stdin | 0 | Các chuỗi số/phân số có newline/CR/CRLF/U+2028/U+2029 thử nghiệm đều bị SyntaxError; DTO total có newline cũng bị từ chối. Không phát sinh finding. |
| `git diff --check -- index.html README.md src test scripts` | 0 | Không whitespace errors trong working-tree product/test scope; không chứng nhận ops logs. |
| `git status`, `git log`, diff từ LC27, rev-parse và SHA256 | 0 | Snapshot ở đầu báo cáo; theo dõi riêng thay đổi đồng thời của điều phối. |

Wrapper chạy chung các probes cũ ban đầu exit 0 nhưng in đầy đủ child status; riêng LC27 child lúc đầu exit 1. Đã chạy LC27 trực tiếp cả trước/sau fix để xác nhận fail-before/pass-after; không báo wrapper exit 0 thành PASS của ca fail. Hai tìm kiếm inventory phụ có lỗi đường dẫn (`web` không tồn tại; glob Windows truyền thẳng cho rg); đã dùng file paths hiện có, không dùng chúng làm evidence PASS.

NOT_RUN: lint (không script), browser desktop/mobile/hai tab thật/IME/AT, screenshot/trace, download mở offline thật; dedicated SAST/dependency advisory/full-history secret scan; axe/Lighthouse; SUT mutation testing. Không có claim upstream mới hay task nghiên cứu/cài tool trong LC28.

## coverage_gaps và traceability

- **B1-AC01–03, T01–09/T15:** đã kiểm số học/domain purity, exact raw III, bigint rational, maxima 5/15/16 và ngưỡng BASE 9.75/10/10.25 qua source/unit/oracle/differential; II exhaustive 16×81 trong fixtures. Không có counterexample mới; không phê duyệt grammar III hay policy rounding qua việc tests xanh.
- **B1-AC04/06, T11/T13:** refs/schema/error handling, DTO consistency và malformed persistence có nhiều controls đã chạy. Không tuyên bố phủ hết malformed envelopes/main/final/legacy. loadLocalState lọc dữ liệu trước validation còn save/submit validate trực tiếp; cần xác định quarantine/recovery và test nhất quán. Metadata tên còn LC28-F01.
- **B1-AC05, T12/T14 / Shared §3/5:** domain shuffle có seed/flags/ID mapping và per-question permutations. Web chưa nối createPresentationOrder, chưa persist immutable exam/question/order snapshot; initExam tải sample hiện tại hoặc embedded. Chưa chứng minh bank edit/publish không ảnh hưởng attempt cũ bằng workflow thật.
- **Offline/timer/concurrency:** VM kiểm deadline/restore/double submit và một số write-boundary interleavings. localStorage read→write không atomic; khoảng final-read→final-write chưa có bằng chứng scheduler nhiều browser. Race final/final tổng quát vẫn **SUSPECTED / NOT VERIFIED**, không khẳng định multiple reads là khóa. Chưa kiểm quota/private mode/migration/background clock/cold-start offline thật. Không có service-worker offline shell hiện hành.
- **UI/a11y/IME:** source có escaping, radio keyboard và CSS responsive/print; VM không thực thi layout, native focus/composition/cursor hoặc browser storage semantics. Chưa PASS cho Telex/VNI/mobile, modal keyboard/AT, contrast, downloaded HTML/PDF render. Bộ test tên E2E không thay bằng chứng browser.
- **Trust/collector:** chỉ demo luyện tập với keys client-side; không phù hợp nghiệm thu bài kiểm tra cần giấu key/trusted score. Chưa có backend/outbox/Google collector để kiểm receipt/CORS/readback/idempotency/retry/backoff. Nhãn lưu cục bộ không là server_confirmed/Drive receipt.
- **Importer/teacher:** chưa có bank/builder/version publishing, DOCX/PDF parser/IR/OCR/provenance/preview-confirm. Không có code để chạy corpus nhiều cột/hình/bảng/OMML, unknown answer keys hoặc resource/security tests.
- **B1-AC07/08, T10/T16/T17:** còn gap resource limits trước BigInt/oversized payload, SUT mutants, security/performance/browser CI, rollback/migration và owner milestone acceptance. Oracle mutants kiểm công cụ độc lập, không là mutation test SUT. Không gắn FULLY_VERIFIED/DONE.

## Tính năng lộ trình còn thiếu — theo thứ tự ưu tiên

1. **P0 — glue:** sửa LC28-F01/LC27-F01 với regression fail-before/pass-after. Kiểm browser refresh/hai tab/manual/timeout/quota/error, finalization theo storage đã được duyệt và immutable exam/order snapshot trước nghiệm thu student milestone.
2. **P1 — student:** chọn/nhập đề thực, attempt ID/lịch sử nhiều lượt; teacher settings thời lượng/lượt làm, hai cờ shuffle độc lập, answer/explanation release; cold-start offline; mobile/keyboard/IME/a11y thật. Restart xóa bài có xác nhận chưa phải lịch sử nhiều lượt.
3. **P1 — teacher:** ngân hàng Môn>Lớp>Chương/Chủ đề>Bài>Mức độ; builder bật/tắt ba phần độc lập, reuse immutable question/exam versions, preview/publish, export/import/backup/delete. Luồng private/local hoặc quyền thật cần được duyệt; URL bí mật không là xác thực.
4. **P1 — collector:** dịch vụ owner-controlled đã duyệt; local_saved/queued/sending/server_confirmed/failed, bounded retry/backoff/dedupe, chống stale overwrite; test CORS/receipt/readback trên dịch vụ thật, trusted grading và release policy khi cần.
5. **P2 — importer:** DOCX/PDF → IR giữ text/table/media/OMML/math, provenance/confidence/flags → preview/sửa → confirm → lưu; phân biệt text/scan/OCR/multi-column, resource/security corpus; không đoán answer key thiếu.
6. **P2 — preset/nghiệm thu:** mẫu chuẩn THPT theo môn/năm/văn bản kiểm chứng tách custom-v1; privacy/security/performance, browser CI, license/changelog/rollback và owner acceptance. Class/Assignment sau MVP.

## NEED_DECISION — không tự chốt policy

Không thấy mâu thuẫn mới giữa hai contract. Các mục mở trong tài liệu bắt buộc chưa có phê duyệt thay thế; implementation demo không tự trở thành quyết định nghiệp vụ. Chúng không cản sửa lỗi tên.

| Policy cần owner quyết | 2–3 phương án |
| --- | --- |
| Grammar III | A giữ charset/length tạm; B chốt grammar hẹp bằng inputPolicyId mới; C grammar theo preset/version được duyệt. |
| Hiển thị điểm / rounding | A fraction exact; B chốt digits/mode, giữ rational gốc; C fraction kèm decimal xấp xỉ có nhãn/policy. |
| Limits và grouping | A duyệt tạm 1000 câu và nhóm I→II→III; B đổi limits/grouping với version và regression. |
| Storage/collector/report stack | A local practice + HTML; B collector được duyệt + HTML; C thêm PDF sau đánh giá. Phải chọn implementation/storage cụ thể trước milestone tương ứng. |
| Mẫu chuẩn THPT | A hoãn và chỉ custom-v1; B chọn môn/năm/nguồn chính thức trước triển khai preset. |

assumptions: NONE mới; giới hạn/grouping tạm M1 tiếp tục được ghi là chưa duyệt. recommended_action: giao glue sửa LC28-F01, giữ các regressions raw/adopt final hiện có; owner quyết policy ở milestone liên quan. tools_research: không được giao mới. privacy_notes: chỉ evidence kỹ thuật và dữ liệu thử; không credentials hoặc nội dung hồ sơ riêng.

## Probe LC28-F01 — initExam với draft quá hạn

Pipe block JS sau vào `node --input-type=module` tại repo root; helper VM có sẵn trong LC19. Mọi writes chỉ ở Map trong RAM. Không phải browser E2E.

```js
import fs from 'node:fs';
const helper=fs.readFileSync('docs/reviews/LOOP-19-codex.md','utf8')
  .match(/^```js\r?\n([\s\S]*?)^```/m)[1].split('let pass=0,fail=0;')[0];
const probe=String.raw`
let pass=0,fail=0;
for(const mode of ['active-refresh','expired-refresh','existing-final']) {
 try {
 const store=new Map(),a=page(store);setExam(a,exam());
 const expected='Nguy\u1ec5n An LC28';a.c.expected=expected;
 a.run('document.getElementById("candidateName").value=expected;saveLocalState()');
 if(mode==='existing-final')a.run('submitExam()');
 else if(mode==='expired-refresh') {
  const draft=JSON.parse(store.get(a.key()));
  draft.startedAt=Date.now()-10000;draft.deadline=Date.now()-1;
  store.set(a.key(),JSON.stringify(draft));
 }
 const b=page(store);setExam(b,exam());
 b.run('document.getElementById("candidateName").value="Th\u00ed sinh t\u1ef1 do";fetch=async()=>({ok:true,json:async()=>ex});renderExamPane=()=>{};renderPalette=()=>{}');
 await b.run('initExam()');
 const actual=b.run('studentState.candidateName');
 const raw=store.get(b.run('getFinalStorageKey(currentExam,studentState)'));
 const finalName=raw?JSON.parse(raw).candidateName:null;
 console.log(JSON.stringify({mode,actual,finalName,submitted:b.run('studentState.submitted')}));
 assert.equal(actual,expected);if(raw)assert.equal(finalName,expected);pass++;
 }catch(e){fail++;console.log('FAIL '+mode+' | '+e.message)}
}
console.log(JSON.stringify({tests:pass+fail,pass,fail,sha256:createHash('sha256').update(html).digest('hex')}));
process.exitCode=fail?1:0;
`;
await import('data:text/javascript;base64,'+Buffer.from(helper+probe).toString('base64'));
```
