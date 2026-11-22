Verdict: CHANGES_REQUESTED

# R2-REVIEW-0 — Web chuyển máy chủ và xuất bản API

- reviewer: Codex; reviewed_at: 2026-11-23 (Asia/Bangkok).
- requirements: Shared Product Contract v2.0; WEB-contract §22 và các điều khoản kế thừa §6, §7, §17.2–17.6, §19.2; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md.
- base_commit được giao: HEAD. Commit mở mục: `f4d9995`; head_commit thực tế: `66eb71d6b332f42db8702334800d0394bd0e3d71`.
- Đã xem log/diff `f4d9995^..HEAD` và working tree. Hai commit trong khoảng là bộ test R2 và bộ test R4; không có thay đổi production đã commit trong khoảng này. Vì implementation R2 đã có từ trước, kiểm thêm đường chạy hiện tại, lịch sử các file R2 và thay đổi chưa commit liên quan. Không suy rằng diff production rỗng đồng nghĩa không cần review.
- Working tree vốn có nhiều thay đổi của người khác. Không sửa source, test, dependency, không commit/deploy/install; không đọc `ops/prod_config.json` thật, không gọi Google/Vercel/Neon thật. Build và test được yêu cầu tự sinh/cập nhật dist và artifact của chúng; file báo cáo này là chỉnh sửa thủ công duy nhất.

## Giả định và ranh giới

- Đây là gate kỹ thuật riêng R2 trên máy cục bộ, không phải nghiệm thu production R11. Không cần quyết định nghiệp vụ mới để sửa hai lỗi dưới đây; `BLOCKED_QUESTION: NONE`, `NEED_DECISION: NONE`.
- Theo §22, lựa chọn backend đến từ config do chủ dự án quản lý; `apiBase` thắng `appsScriptUrl`, không tự đổi về backend cũ khi API lỗi. Giữ khả năng dùng Apps Script khi không có `apiBase`.
- Hai finding là lỗi hiện hữu trên đường chạy R2; không gán sai rằng chúng được tạo bởi commit test `f4d9995`. F01 là hồi quy tích hợp khi chuyển GET từ Apps Script đã được loại khỏi cache sang `/api/rpc`. F02 là lỗi adapter kế thừa được dùng tiếp cho backend mới.
- Files reviewed: `src/collect/appsScript.ts`, `src/collect/index.ts`, `src/collect/export.ts`, `src/app/main.ts`, `src/app/authoring.ts`, `src/app/exam-list.ts`, `src/admin/main.ts`, các nhánh client/config trong `src/student/area.ts`, `scripts/build.js`, `scripts/web-build.ts`, `ops/publish.py`, `src/offline/types.ts`, `src/offline/service-worker.ts`, API response shape tại `src/api/handle.ts`, `dist/api/rpc.js`, service worker đã build; bộ kiểm định R2 và các harness/API checks của Claude.

## Findings

### R2-F01 — MAJOR — Service worker giữ GET RPC cũ dù máy chủ đã thay đổi

- affected_files: `scripts/web-build.ts:482`, `scripts/web-build.ts:713`, `scripts/web-build.ts:732`, `scripts/web-build.ts:736`; đường gọi `src/collect/appsScript.ts:684`. Bộ lọc source tại `src/offline/types.ts:159` cũng chưa loại API mới.
- evidence: service worker thực sự được build cho phép GET `/api/rpc`, đọc cache trước rồi lưu mọi GET thành công. Chỉ config và index đề được đi mạng trước. `getExam` có `cache: 'no-store'`, nhưng nhánh CacheStorage bỏ qua cờ này. Apps Script được bypass theo hostname nên việc chuyển sang API mới làm phát sinh tác động này.
- reproduction_steps: dùng `localServer` của R2 với `dist/` vừa build, `memoryContext`, cấu hình `{apiBase:'/api/rpc'}`. Qua API thật với MemoryStore, tạo giáo viên và xuất bản đề `audit-r2-sw`, title `Old title`. Mở browser thật bằng harness Claude, đăng ký `service-worker.js`, đợi trang được controller quản lý. Trong trang gọi `fetch('/api/rpc?action=getExam&id=audit-r2-sw', {cache:'no-store'})`. Xuất bản lại cùng đề với title `New title`, rồi gọi lại cùng fetch. Chỉ thay dữ liệu synthetic trong RAM; chặn HTTPS ngoài.
- actual, từ probe browser chạy thật, exit 0:

  ```json
  {"first":"Old title","second":"Old title","serverNow":"New title","getExamNetworkRequests":1,"controlled":true}
  ```

- expected: GET RPC đọc trạng thái mới của máy chủ; sau publish trả `New title`, hoặc sau gỡ đề trả `NOT_FOUND`. Không giữ phản hồi động như asset bất biến. Căn cứ WEB-contract §17.6, §22 và nguyên tắc trạng thái trung thực của DESIGN.md.
- impact: giáo viên có thể tải/sửa lại bản đề cũ sau khi đã xuất bản bản mới; học sinh có thể nhận đề hoặc danh sách bài giao cũ. Cache lỗi nghiệp vụ HTTP 200 cũng có thể giữ `NOT_FOUND`. Nhánh activate còn chép entry cache cũ sang cache mới (`scripts/web-build.ts:593`), nên đổi build không bảo đảm tự hết lỗi.
- minimal_fix: bypass RPC trong service worker được sinh và bộ lọc source tương ứng, cho cả URL tương đối cùng origin lẫn API tuyệt đối từ Pages. Tránh phục vụ các entry RPC cũ, kể cả entry được chuyển cache khi activate. Không cần đổi cơ chế cache các asset tĩnh.
- regression_test: thêm browser test với service worker đã kiểm soát trang; GET đề → publish sửa/gỡ → GET cùng URL vẫn lấy trạng thái máy chủ mới. Kiểm cả `getClass`, API khác origin và entry RPC tồn dư từ cache phiên bản trước. Các ca browser hiện tại không kiểm chuỗi cập nhật này.

### R2-F02 — CRITICAL — Collector tự tạo biên nhận hợp lệ từ phản hồi rỗng hoặc sai lượt

- affected_files: `src/collect/appsScript.ts:1509`, `src/collect/appsScript.ts:1522`, `src/collect/appsScript.ts:1528`, `src/collect/appsScript.ts:1544`, `src/collect/appsScript.ts:1556`; tiêu thụ tại `src/app/main.ts:1204`, `src/app/main.ts:1211`.
- evidence: chỉ `success === false` bị từ chối. `{}` vượt qua, status được mặc định thành `recorded`, thời gian lấy từ máy khách, submissionId mặc định bằng attempt hiện tại. Tuple và hash được lấy từ `final` rồi ghi đè lên phản hồi máy chủ trước `validateReceipt`. Do đó việc kiểm tra biên nhận ở outbox không phát hiện thiếu xác nhận hoặc xác nhận của lượt khác.
- reproduction_steps: chạy script bên dưới qua `node --input-type=module` (stdin) từ gốc repo. Dùng production collector, production `drainOutbox`, storage nhỏ trong RAM và fetch giả, không có request mạng.

  ```js
  import { makeExam } from './test/claude-check/app.mjs';
  import { createAppsScriptCollectorPort, computePayloadHash, drainOutbox }
    from './src/collect/index.ts';
  const exam = makeExam({id:'audit-r2-receipt',part1:['a'],part2:[],part3:[]});
  const final = {
    schemaVersion:'web-attempt-v1', examId:exam.examId,
    examVersionId:exam.examVersionId, attemptId:'audit-attempt', revision:1,
    candidateName:'Synthetic audit', examSnapshot:exam,
    presentationOrder:{seed:'audit',questionOrder:exam.questions.map(q=>q.questionVersionId),optionOrder:[]},
    responses:{attemptId:'audit-attempt',examVersionId:exam.examVersionId,responses:[]},
    startedAt:1000,deadline:100000,submittedAt:2000,phase:'final',scoreDTO:null
  };
  for (const raw of [{}, {success:true,status:'NEWLY_RECORDED',
    attempt_id:'OTHER-ATTEMPT',recorded_at:'2026-11-23T00:00:00Z'}]) {
    let out = {
      examId:final.examId,examVersionId:final.examVersionId,attemptId:final.attemptId,
      state:'queued',finalRevision:1,payloadHash:computePayloadHash(final),
      endpointId:'/api/rpc',retryCount:0,nextRetryAt:null,generation:0,
      receipt:null,lastError:null
    };
    const storage = {
      getOutbox:async()=>({ok:true,value:out}),load:async()=>({ok:true,value:final}),
      updateOutbox:async value=>{out=value;return {ok:true,value:out};}
    };
    const transport = createAppsScriptCollectorPort('/api/rpc',
      async()=>Response.json(raw),'application/json');
    const result = await drainOutbox(final,{storage,transport,now:()=>5000});
    console.log(JSON.stringify({serverReply:raw,
      result:result.ok?result.value.state:result.error,receipt:out.receipt}));
  }
  ```

- actual: probe exit 0; cả hai trường hợp đều trả `result:"server_confirmed"`. Với `{}`, receipt có `submissionId:"audit-attempt"` và thời gian tự sinh. Với phản hồi sai lượt, receipt vẫn có `attemptId:"audit-attempt"`, nhưng `submissionId:"OTHER-ATTEMPT"`; hash được tự tính lại nên validation vẫn qua.
- expected: thiếu `success:true`, trạng thái ghi nhận không hợp lệ, thiếu/sai `attempt_id` hoặc thời gian máy chủ phải bị từ chối; giữ final và khả năng tải báo cáo, không chuyển `server_confirmed`. Căn cứ Shared Product Contract §3 và WEB-contract §7, §17.4, §22.
- impact: giao diện báo “Đã gửi”, outbox terminal và ngừng retry dù máy chủ chưa xác nhận đúng bài. Học sinh/giáo viên có thể tin đã có kết quả trong cơ sở dữ liệu trong khi kết quả chỉ còn trên máy.
- minimal_fix: kiểm envelope và các trường xác nhận thực do API trả (`success`, status, `attempt_id`, `recorded_at`) trước khi chuyển sang Receipt. Chỉ ánh xạ dữ liệu sau kiểm; không thay thế trường sai/thiếu bằng dữ liệu client để tạo success. Giữ tương thích response shape §22, không bắt backend cũ phải trả một trường hash chưa nằm trong hợp đồng của nó; nếu máy chủ có trả hash/tuple thì phải kiểm, không ghi đè để che mismatch.
- regression_test: `{}`, `{success:true}` thiếu receipt, status lạ, sai attempt, timestamp thiếu/sai, và hash/tuple mâu thuẫn phải không bao giờ thành `server_confirmed`; response hợp lệ `NEWLY_RECORDED`/`ALREADY_RECORDED` của API thật vẫn qua. Test phải đi xuyên collector → `drainOutbox` và kiểm UI không báo “Đã gửi”.

## Checks chạy thật

Môi trường: Windows/PowerShell, Node v24.14.0, TypeScript có sẵn qua `npx --no-install`; browser headless do harness Claude khởi chạy. Không dùng npm install. Các probe bổ sung chạy bằng stdin, không tạo file test ngoài scope.

| Command/check | Exit | Pass / Fail / Skip | Bằng chứng |
| --- | --- | --- | --- |
| `node scripts/build.js` | 0 | build thành công | 339 files được promote vào dist; wrapper kiểm asset, schema và emit web/API |
| `npx --no-install tsc -p tsconfig.json` | 0 | không diagnostic | chạy độc lập |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | không diagnostic | chạy độc lập |
| `node --test --test-reporter=tap "test/codex-check/feat/R2/**/*.test.mjs"` | 0 | 21 / 0 / 0 | TAP: 10.227s; browser thật, API MemoryStore, publish sandbox |
| `node --test --test-reporter=tap "test/claude-check/*.test.mjs"` | 0 | 104 / 0 / 0 | TAP: 5 suites, 85.270s; không cancelled/todo |
| Probe collector → outbox nêu ở F02 | 0 | 2/2 tình huống tái hiện lỗi | cả hai phản hồi sai đều thành server_confirmed |
| Probe F01 bằng browser thật + API MemoryStore | 0 | tái hiện lỗi | Old title / Old title / server New title; một network GET |
| `git diff --quiet f4d9995 -- test/claude-check test/codex-check/feat/R2/r2.test.mjs test/codex-check/feat/R2/local-server.mjs test/codex-check/feat/R2/publish-sandbox.py test/codex-check/feat/R2/wrapper-probe.mjs` | 0 | không đổi code kiểm định | so với commit mở R2 |

Artifact của test R2 nằm trong `test/codex-check/feat/R2/_artifacts/` (build.log, publish.log, browser JSON và PNG). Output TAP và hai probe bổ sung được ghi trong transcript của phiên review; không tạo thêm log thủ công ngoài scope. Build có cảnh báo Node DEP0190 về child_process shell; build vẫn exit 0, không quy thành lỗi R2 riêng khi chưa có đường input nguy hiểm được chứng minh.

## Kiểm tra sửa giả, publish và giới hạn

- Không thấy code kiểm định R2 hoặc bộ Claude bị sửa so với `f4d9995`; không thấy nới assert/skip để làm xanh trong diff đã kiểm. Không thấy production branch theo tên/id test, `navigator.webdriver`, NODE_ENV hay hostname localhost để trả thành công giả trong các đường R2 đã đọc. Kết luận này có giới hạn theo files reviewed, không phải chứng minh toàn repo không có lỗi.
- `resolveBackend` được nối vào app/admin, client và collector dùng JSON khi API được chọn; fallback Apps Script giữ text/plain và redirect. R2 chạy browser cùng nguồn, khác origin cục bộ, admin, giáo viên, học sinh nộp bài, 503 và tải report đều xanh. Không tự fallback sang Apps Script khi API lỗi.
- Publisher được chạy qua sandbox có SRC/DST synthetic, git/subprocess bị thay và audit hook chặn mạng/đọc prod config thật. Copy ra `api/_lib/`, wrapper `api/rpc.js`, package ES module, hai config site/Pages và giữ Apps Script đều qua. Đã đọc `ops/publish.py:132`: includeFiles là `api/_lib/**`. Không chạy CLI publisher thật.
- API được build tự chứa; R2 kiểm catalog, GET/POST isolated và CORS preflight. Đây là bằng chứng local, không chứng nhận Vercel packaging hoặc Neon thật.
- NOT_RUN: Google/Vercel/Neon live, deploy, owner acceptance R11 (đều ngoài quyền task). Không dùng MemoryStore/fake Neon thay bằng chứng live.
- R2 suite được chạy lại một lần trong phiên này; không xác nhận gate “hai lần liên tiếp” chỉ từ artifact cũ. Hai lỗi chứng minh ở trên đủ yêu cầu sửa dù tất cả test bắt buộc xanh.

## Snapshot để tái kiểm

HEAD cuối phiên vẫn `66eb71d6b332f42db8702334800d0394bd0e3d71`. SHA-256 sau các checks và kiểm lại trước ghi báo cáo không đổi:

| File | SHA-256 |
| --- | --- |
| src/collect/appsScript.ts | 77BB9A8366A926B5D50327BF9F0EC23C1A5D3F8B8903A2036B5251B790046B3B |
| src/app/main.ts | 9441469F8E314B52BBA2E4FA778D08E3646930538E0E4E1996729BA945AFFDCF |
| src/admin/main.ts | 176E8E88E743976BF0DE3642973216763B5419379B7F8B59ADF0F660EEC27F63 |
| src/app/authoring.ts | 7ADE04EFCA45BAAE43FF28E1186728D5216B47D25BC704E17BD12BEDD07829D6 |
| src/student/area.ts | B98282DE4FB238FA7F7272225D065F0D0C69B6124E97DA3AF3FDC79385D52A8A |
| src/app/exam-list.ts | D811B71BB6CD62E20BF7ED0273CFEB1F20487C7DD98AA5F39F57C90285BEE68D |
| scripts/web-build.ts | 72DDEC8D31C11BC9C6453ACD8BE21B7CC8406F27B285640D30F09C51D26589C5 |
| ops/publish.py | C66AD3443BAD774DA3C717231B2170F75B2113BC9696144426D6014BD0499E03 |
| src/offline/types.ts | C664933F2C189857CC023122E075817BFBA2DF3819F0C416CBF2D80E15A56380 |
| src/offline/service-worker.ts | 71B1C5A80A5D8A1E9B43A4F58122E20BE0D8531025C430A5E7F5769F43139AF7 |

recommended_action: giao worker sửa R2-F01 và R2-F02, bổ sung regression theo mô tả, chạy lại gate và rà soát snapshot mới. Chưa APPROVED R2; không sửa code trong task review này.
