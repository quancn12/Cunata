# CK-AUDIT-18 — CHANGES_REQUESTED

- review_id / task_id: CK-AUDIT-18; reviewer: Codex; reviewed_at: 2026-11-16 11:04 +07:00.
- verdict: **CHANGES_REQUESTED**. Hai lỗ hổng kiểm định được chứng minh bên dưới; chưa có bằng chứng đủ để kết luận cố ý gian lận. Năm gate được giao đều đã chạy; bộ Claude có một lần đỏ rồi xanh khi chạy lại. Không coi lần chạy lại là xóa bằng chứng lần đầu.
- base_commit: HEAD theo task. Mốc diff chính: `7a727060bcf86613d9d356c88abeed796b7e1615` (commit mới nhất có message “Bộ kiểm định web của Claude”). head_commit: `cee0b395977480a00a8317a672a1d00193bb2deb`.
- Vì message này xuất hiện ba lần, đối chiếu thêm lịch sử từ lần đầu `0d8cf28` đến HEAD cho thay đổi test/domain, và commit lịch sử `237aeb8` về manifest giả.
- requirements_version: Shared Product Contract v2.0; WEB-contract toàn bộ, gồm quyết định §14–15; mẫu handoff M1 §2. risk_level: HIGH (durable attempt, báo cáo, nâng phiên bản offline).
- files_reviewed: diff nguồn `src/app/main.ts`, `src/offline/index.ts`, `src/offline/service-worker.ts`, `scripts/web-build.ts`, `index.html`; generated dist tương ứng; `test/browser/cdp-client.ts`, `test/ui/core/dom-mock.ts`, toàn bộ `test/final-quality/ck12Regressions.test.ts`; assertions/helper hai bộ Claude/Codex liên quan; lịch sử domain, dependency, config và quyết định nghiệp vụ. Không đọc prompt riêng của agent khác.
- Working tree trước/sau kiểm định có sẵn thay đổi `ops/fix_loop.out.txt`, `ops/overnight.log`, `plan.html`, untracked manifest/prompt round18; giữ nguyên. Chỉ thêm báo cáo này. Không sửa code/test, install, commit hay deploy. Build/test tái tạo output/fixtures theo lệnh bắt buộc; `git diff --quiet` trên src/scripts/index/dist và các bộ test đã đọc trả 0 sau chạy.

## Checks chạy thật

Môi trường Windows/PowerShell, D:\Cunata, Node v24.14.0, TypeScript 7.0.2, Chrome 157.0.8103.52; HTTP localhost dưới `/Cunata/`, Chrome thật điều khiển CDP, context sạch. Kết quả mới trong phiên này, không dùng log XANH round18 làm bằng chứng chạy lại. Output nằm trong transcript công cụ; không ghi thêm log ngoài scope.

| Command / probe | Exit | Pass / fail / skip | Evidence |
| --- | --- | --- | --- |
| `node scripts/build.js` | 0 | N/A | Validate assets/schema/Apps Script, compile và promote 295 files; dist không có diff với HEAD. Có cảnh báo Node DEP0190, không phải lỗi build. |
| `npx --no-install tsc -p tsconfig.json` | 0 | N/A | Không diagnostic. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | N/A | Không diagnostic. |
| `node --test "test/claude-check/**/*.test.mjs"` lần 1 | 1 | 50 / 1 / 0 | `dist: [student] hai tab cùng bài...` timeout ở web.test.mjs:256, sau reload A không đạt predicate báo cáo trong 15000 ms; duration 56494.8418 ms. Khi đó có suite browser khác chạy đồng thời. |
| Cùng lệnh Claude, lần 2 | 0 | 51 / 0 / 0 | duration 39990.9966 ms. Không thay source giữa hai lần. |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | 116 / 0 / 0 | duration 98915.6723 ms; oracle UI root/dist, builder/bank, DOCX, CSV và trạng thái không endpoint. |
| `node --test "test/final-quality/ck12Regressions.test.ts"` | 1 | 8 / 1 / 0 | duration 52782.0259 ms; CK16-F01 fail tại :1179 vì `reg.waiting` còn true. |
| `node --test --test-name-pattern="hai tab cùng bài" "test/claude-check/web.test.mjs"` | 0 | 2 / 0 / 0 | duration 2065.5948 ms; không tái hiện timeout lần đầu khi chạy riêng. |
| `node --test --test-name-pattern="CK16-F01" "test/final-quality/ck12Regressions.test.ts"` | 1 | 0 / 1 / 0 | Cùng assertion :1179; duration 26602.9468 ms. |
| Negative control trong RAM của CK15-F01, bỏ thao tác chọn đáp án | 0 | 1 / 0 / 8 | In `responses: []` nhưng ca vẫn PASS; duration 12427.2308 ms. Tám skip chỉ do probe chọn một ca trong RAM, không sửa test repo. |
| Probe CK16-F01 trong RAM, quan sát worker mỗi giây thay sleep 800 ms | 0 | 1 / 0 / 8 | Sau 1 giây: active `activating`, không còn waiting; sau 2 giây: `activated`; B có báo cáo `0 / 10`. duration 21818.7156 ms. Không chứng minh lỗi worker kẹt vĩnh viễn. |

Một probe browser riêng thực hiện lại luồng hai tab của Claude rồi reload A cũng mở đúng báo cáo `0,25 / 10`, IDB vẫn final. Timeout lần 1 là **intermittent / nguyên nhân chưa xác minh**, không gán thành lỗi mất kết quả hay lỗi domain. Cần điều tra/ghi trạng thái browser ở thời điểm fail; không tăng timeout hoặc nới assertion để xóa dấu vết.

## Findings

### CK18-F01 — MAJOR — Test bảo toàn đáp án vẫn xanh khi không có đáp án nào được lưu

- affected_files: `test/final-quality/ck12Regressions.test.ts:827–830`, `:845–848`, `:907`, `:930`; liên quan assertion bảo toàn bài B tại `:1163`.
- evidence: `draftRecordA.responses` là envelope `{attemptId, examVersionId, responses}`, không phải mảng đáp án. `Object.keys(draftRecordA.responses || {}).length > 0` tại :848 luôn đúng với envelope hợp lệ, kể cả `responses: []`. Các deepEqual phía sau so sánh một bài trắng với chính nó cũng đúng.
- reproduction_steps: đọc source test vào RAM; đổi import tương đối thành file URL tuyệt đối; dùng `node:module.stripTypeScriptTypes`; chỉ chọn CK15-F01; thay lần đầu `if (opt) opt.click();` bằng no-op và in `draftRecordA.responses` ngay trước assertion :848. Import module từ data URL, không ghi file. Test chạy Chrome thật và in:

  ```json
  {"attemptId":"attempt-mwiqnkdw-d7ef","examVersionId":"v1.0.0","responses":[]}
  ```

  Kết quả ca CK15-F01 vẫn PASS. Đây là negative control mới chạy, không suy luận chỉ từ đọc mã.
- expected: ca xác nhận bảo toàn đáp án phải fail khi thao tác trả lời bị vô hiệu hóa; phải chứng minh đáp án cụ thể tồn tại trước nâng phiên bản.
- actual: một lượt hoàn toàn trắng vẫn đủ điều kiện “Draft response must not be blank”. Cú pháp JS và helper exception đã được sửa ở round16, nhưng thiếu assertion dữ liệu có ý nghĩa vẫn còn.
- impact: bằng chứng xanh không xác nhận đã lưu/bảo toàn lựa chọn của học sinh; lỗi mất thao tác trả lời trước nâng phiên bản có thể lọt. Chưa chứng minh sản phẩm hiện tại làm mất đáp án, cũng chưa chứng minh chủ ý sửa giả.
- minimal_fix: assert đúng `draftRecordA.responses.responses` là array có response I với questionVersionId và selectedOptionId khớp lựa chọn đã click; xác nhận tuple attempt/version, snapshot/order/deadline/name trước/sau. Tương tự, B phải có response thực trước deepEqual :1163. Không chỉ đổi thành `.length > 0` nếu câu trả lời rỗng/null vẫn có thể lọt.
- regression_test: giữ negative control bỏ click hoặc chặn save để chắc chắn test fail; ca bình thường phải có đáp án non-null đúng ID rồi giữ nguyên sau waiting/final/cold reload. Dùng predicate dữ liệu để chờ commit, không sleep 600 ms làm điều kiện lưu xong.

### CK18-F02 — MINOR — Regression cập nhật hai tab quyết định thành bại bằng sleep 800 ms

- affected_files: `test/final-quality/ck12Regressions.test.ts:1170–1179`; helper `test/browser/cdp-client.ts:278–285`.
- evidence / reproduction_steps: chạy cả file regression (8 pass/1 fail), rồi chỉ CK16-F01 (0 pass/1 fail), cùng lỗi `true !== false` tại :1179. Test chỉ đợi selector `#reportWrapper` tồn tại, nhưng helper không kiểm visible hay final durable; shell đã chứa selector từ trước. Sau đó sleep đúng 800 ms rồi kiểm `reg.waiting` một lần.
- Probe trên cùng source/dist, chỉ thay sleep bằng quan sát mỗi giây trong RAM: ở lần đọc đầu worker đang `activating`, lần sau `activated`; báo cáo B hiện `0 / 10`. Các assertion không đổi khác trong ca này vẫn pass. Vì vậy chưa đủ cơ sở gán hai lần đỏ này thành lỗi sản phẩm không bao giờ cập nhật.
- expected: kiểm định đợi sự kiện/trạng thái hoàn tất trong deadline rõ ràng, xác minh cả controller phiên bản B và final records, đồng thời giữ assertion không thay controller khi B còn làm.
- actual: một snapshot thời gian cố định biến độ trễ hợp lệ thành fail; kiểm `waiting === false` còn có thể pass khi worker mới chỉ đang activating, chưa xác nhận phiên bản B thực sự phục vụ trang.
- impact: gate không ổn định và có thể báo xanh trước khi cập nhật hoàn tất; gây vòng sửa không nhắm đúng nguyên nhân.
- minimal_fix: poll có deadline hoặc lắng nghe statechange/controllerchange, kiểm worker `activated` và phiên bản/cache B thực tế; đợi final B bằng record/visible report trước đó. Không chỉ kéo dài sleep, bỏ assertion hoặc skip browser.
- regression_test: chạy lặp hai-tab upgrade với activation bị trì hoãn có kiểm soát; ca phải chờ đúng và fail nếu controller vẫn là A hết deadline. Giữ các assertion draft B/cache A trong khi A đã nộp.

## Rà soát gian lận, sửa giả và giới hạn tính năng

- `git log` và diff chính `7a72706..HEAD` không có sửa `src/domain`, package/lock, hai config typecheck, hay test/claude-check/test/codex-check. Không phát hiện điểm gắn cứng, đổi công thức, ép tổng về 10 trong thay đổi đã đọc. Bộ Codex mới chạy kiểm golden gồm max 5/15/16, III tuần hoàn và exact raw.
- Scan src/scripts/root theo navigator.webdriver, headless, userAgent/user-agent, NODE_ENV/process.env, chuỗi tên suite/fixture; không thấy nhánh dò môi trường test để trả kết quả khác. Một comment headless tại `src/import/pdf/preview.ts:23` không phải detector. Không thấy nhánh examId/tên đề kiểm định dùng làm đặc quyền chấm điểm; các so ID đang phục vụ lookup/persistence. Đây là kết luận trong phạm vi diff/source đã rà, không phải chứng minh tuyệt đối về mọi mã có thể tồn tại.
- Thay đổi test cũ trong khoảng mở rộng `0d8cf28..HEAD`: D02 oracle đổi so điểm hiển thị sang half-up hai chữ số theo quyết định 16/11; D08 đổi test giấu lời giải sang hiện sau nộp theo WEB §14. `build.test.mjs:54` loại manifest index.json khỏi danh sách đề, đồng thời thêm kiểm schema manifest, số câu, và copy bytes public; phù hợp §15. Không coi các sửa này là nới vô cớ.
- Trong diff chính, test sản phẩm cũ không bị xóa/skip; có thêm regression browser và helper CDP nay throw `exceptionDetails`. Các skip mới do thiếu browser/dist không kích hoạt trong lần chạy test nguyên bản này. Probe trong RAM có skip chọn ca được ghi riêng, không tính vào bằng chứng suite nguyên bản.
- Có sửa né validator trong lịch sử mở rộng: `237aeb8`, `scripts/web-build.ts` thêm `title` và câu giả `q-index-meta` chỉ có một option vào dist/public/exams/index.json để vừa validator. Đã đối chiếu diff commit; thay đổi được gỡ trước mốc chính, HEAD không còn. Build mới và kiểm bytes public PASS. Đây là sự kiện lịch sử đã sửa, không ghi thành lỗi đang mở.
- Collector không gửi mạng khi owner chưa triển khai endpoint và PDF chỉ preview/nhập tay phù hợp D04/D06; không thấy tắt hai tính năng này mới để né lỗi. Root preload DOCX chuyển import song song, vẫn có handler gọi importer; hai bộ test DOCX root/dist mới chạy PASS.
- Sửa offline dùng build digest và manifest toàn runtime, hỏi trạng thái mọi client trước skipWaiting là thay đổi có tác dụng thật; CK15-F01 nguyên bản đã PASS và probe cập nhật hai tab quan sát được activation. Tuy nhiên F01/F02 làm bằng chứng regression chưa đủ tin cậy. Không suy ý định tác giả từ thiếu sót kiểm định.

## Snapshot, coverage gaps và bàn giao

SHA-256 tại cuối kiểm định (HEAD không đổi):

| File | SHA-256 |
| --- | --- |
| src/app/main.ts | C1EAF2B4374DF11274D9479D8FE7C801986BE7989AC42A3962ABA86DEB76E5AC |
| scripts/web-build.ts | B31BD43F945836E6B37BEBE81C74B63D11ED7982F24B4D78F0C6A0FAB5C3709A |
| src/offline/index.ts | 072D56733A3B000E4DA2E08CFB37F910A0BE60A3B4A9EDF4754E01267B1552F1 |
| src/offline/service-worker.ts | BF6E7FB8D187634DC80776220669D6A3772ED1F61D45CB7E5F743ECB3245D0AC |
| index.html | DD1C0F07034298484369685C4BE049D8A4E6D6DC6C140BFFF9DDA66387B64E9D |
| test/final-quality/ck12Regressions.test.ts | 6C8E8CFB55308E5F4100AF6FC89196F79CE05CC2035F050512EA982B91184455 |
| test/browser/cdp-client.ts | A1C4E2141E177E430EBD39B82069E43D9F44FE37C7E5D54E21AB5213443ED607 |

- NOT_RUN: toàn bộ `test/**/*.test.ts`, Python oracle đầy đủ, Firefox/WebKit, IME OS Telex/VNI, axe/Lighthouse, thiết bị di động thật, Google live/CORS/Sheets readback. Task yêu cầu năm gate; chạy thêm regression đúng vùng thay đổi. Không dùng tên “unit XANH” trong commit để thay kết quả mới.
- Chưa kiểm hết mọi upgrade từ phiên bản lịch sử, mọi tình huống worker restart/client không phản hồi, mọi race submit/write; chưa kiểm tay toàn bộ đề Lý. Timeout Claude lần đầu chưa có root cause; cần instrumentation nếu tái diễn. Probe update mô phỏng release qua localhost, không phải deploy hay xác minh website từ xa.
- recommended_action: worker sửa assertions F01 và đồng bộ test F02 theo state; giữ nguyên negative controls, chạy lại các gate và review snapshot mới. Không sửa domain/scoring hay giảm kiểm định để giải quyết hai finding này. Không cần quyết định nghiệp vụ mới.
- assumptions: NONE về nghiệp vụ. tools_research: không giao trong task. privacy_notes: chỉ kết quả kỹ thuật và dữ liệu tổng hợp; không đưa nội dung hồ sơ riêng vào báo cáo.
