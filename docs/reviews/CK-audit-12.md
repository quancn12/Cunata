# CK-AUDIT-12 — Kiểm định sau vòng sửa 12

verdict: **CHANGES_REQUESTED**

Năm lệnh bắt buộc đều chạy thành công, nhưng gate xanh chưa bảo đảm tính toàn vẹn của luồng sản phẩm. Còn lỗi nhận dữ liệu từ localStorage thay cho bản nộp bất biến trong IndexedDB, adapter lưu trữ trả success khi không ghi dữ liệu, và xác nhận chuyển đề bị vô hiệu hóa. Không suy đoán động cơ tác giả.

## Snapshot, yêu cầu và phạm vi

- review_id / task_id: CK-AUDIT-12; reviewer: Codex; reviewed_at: 2026-11-16, Asia/Bangkok; risk_level: HIGH.
- task_base_commit: HEAD; head_commit: `bdcb72aadfeebb2e8e376a62e79ca0c8815bf9cf`.
- Có ba commit chứa message “Bộ kiểm định web của Claude”: `0d8cf28`, `9979578`, `7a72706`. Rà từ mốc sớm nhất: `git log 0d8cf28..HEAD`, `git diff 0d8cf28 HEAD`; kiểm riêng thay đổi `7a72706..HEAD` và lịch sử các đoạn đáng ngờ. Không chỉ xét vòng 11–12.
- requirements_version: Shared Product Contract v2.0; WEB-contract v1.0, đọc toàn bộ, kể cả §14–15; M1 §2; đối chiếu `docs/decisions/BANG-QUYET-DINH.md`. Các quyết định D02/D03/D08 mới được dùng đúng thứ tự ưu tiên.
- files_reviewed: các diff sản phẩm tại `index.html`, `scripts/web-build.ts`, `scripts/sync-shell.js`, `src/app/{main,legacy,routes,authoring,exam-list,shell.html}`, `src/ui/{index,layout}`, `src/import/docx/{document-parser,reader,segmentation,xml-parser}`, `src/import/preview/view`; diff kiểm định Claude/Codex và các test e2e/glue/storage/student/report/import/collect/ui liên quan. Kiểm path history của domain và dependency; không coi log cũ là kết quả chạy mới.
- Working tree lúc bắt đầu đã có `ops/overnight.log` thay đổi và file giao việc chưa track. `plan.html` thay đổi trong phiên do hoạt động khác; giữ nguyên. Chỉ bàn giao file review này, không sửa source/test/dependency, không install, không commit, không deploy.
- Build bắt buộc tạo lại dist. Hai bộ test ghi fixtures theo hành vi sẵn có; sau khi hoàn tất không còn diff fixture hoặc dist. Không giữ file probe/log mới ngoài scope.

Hash SHA-256 tổng hợp của 323 file được `git ls-files` chọn trong `src`, `scripts`, `test`, `styles`, `index.html`, ba tsconfig, package/lock: **a1d989e1e00e0e4ae33e49f47d8222d432a2f0444cdeb68cc7f552fe3107412b**. Thuật toán: sắp xếp path, hash lần lượt `path + NUL + bytes + NUL`.

| File | SHA-256 |
|---|---|
| src/app/main.ts | 9e97cdfc70eb12bc591e5a3f0f7cb2b697d3a174f21a56ab96a1b1409ae4bec3 |
| scripts/web-build.ts | 2d614003f8e72e87f1fd9495cc375f83dee2cc98741587fb8e3f0101873c10bc |
| index.html | c8f4f6561762862112243ff9e8a0367036f3e88111d6cdc848f27bbad4792c26 |
| src/app/authoring.ts | 21a81127b7a1ee155cfcbf94f5d0454c76eee352b297497e9d947db245749449 |

## Checks chạy thật

Môi trường: Windows/PowerShell, `D:\Cunata`, Node v24.14.0, TypeScript 7.0.2 có sẵn. Browser thật qua CDP: Chrome/157.0.8103.52, context sạch, HTTP local dưới `/Cunata/`. Hai bộ browser chạy song song sau build; không dùng VM DOM thay chứng cứ browser.

| Command | Exit | Kết quả |
|---|---:|---|
| `node scripts/build.js` | 0 | PASS; emit/promote 295 file dist; tool wall time 1,654 giây |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS; không diagnostic; 1,344 giây |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS; không diagnostic; 1,329 giây |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | PASS; tests=51, suites=2, pass=51, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=63207.3117 |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | PASS; tests=116, suites=2, pass=116, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=72034.0112 |

Build có warning DEP0190 về child process `shell: true`; exit vẫn 0. Log artifact: output công cụ trực tiếp của phiên này, không tạo log ngoài scope.

Probe bổ sung chạy qua PowerShell here-string vào `node --input-type=module`, import harness/app hiện có, không ghi mã probe lên đĩa. Các đề dùng examId UUID mới và tiêu đề riêng; chỉ dữ liệu tổng hợp trong browser context thử nghiệm. Probe đầu exit 1 vì `waitBoot` đòi tiêu đề khác “Đang tải đề thi...” sau reload một bài đã nộp; không tính probe đó là PASS. Probe tiếp theo ghi trực tiếp DOM sau reload, exit 0, tái hiện các trạng thái bên dưới. Probe xác nhận chuyển đề riêng exit 0. Exit 0 của script chẩn đoán không có nghĩa sản phẩm đạt.

## Findings còn mở

### CK12-F01 — CRITICAL — Thông báo localStorage thay thế bản nộp bất biến và làm đổi điểm báo cáo

- affected_files: `src/app/main.ts:1761–1785`; đường tương tự tại `src/app/main.ts:592–609`, `src/app/main.ts:1033–1054`, `src/app/main.ts:1340–1350`.
- evidence: `onStorageEvent` đọc JSON mirror, lấy `parsed.responses` và `candidateName` vào state đang mở, rồi gọi `scoreLegacyAttempt`/`showReport`. Không đọc lại transaction record từ StoragePort, không kiểm revision, snapshot hoặc scoreDTO của final. Việc chấm lại responses không bảo đảm responses thuộc bản nộp đã chốt. `buildReport(subRes.value, now())` tại dòng 1070 cũng bị bỏ qua Result, không dùng làm nguồn báo cáo.
- reproduction_steps: mở dist sạch; nạp đề hai câu I có đáp án A; chọn đúng câu đầu và nộp. Đọc store `attempts` trong DB `cunata-web`: phase=final, câu đầu chọn A, scoreDTO.total=`1/4`, maxTotal=`1/2`. Trong mirror `cunata:final:...` của đúng exam/attempt, chỉ thay `responses={}`; giữ IndexedDB nguyên. Phát `StorageEvent('storage', {key, newValue})` để mô phỏng thông báo bản sao hỏng/cũ từ tab khác. Đọc điểm rồi reload.
- actual: trước thông báo **0,25 / 0,50**; sau thông báo **0 / 0,50**; IndexedDB trước/sau vẫn final với đáp án A và total=`1/4`; reload lại hiện **0,25 / 0,50**. Không sửa stored score để tạo kết quả này.
- expected: WEB §5–6 yêu cầu notification chỉ là tín hiệu, phải đọc lại transaction record; existing final thắng và không thay responses/name/score. Mọi nơi báo cáo cùng một attempt phải dựa trên cùng snapshot/final đã kiểm.
- impact: báo cáo điểm sai so với bản đã nộp, có thể thay tên/đáp án chỉ bởi mirror khác nguồn. Đây là lỗi integrity của client, không phải yêu cầu web tĩnh phải chống gian lận như server tin cậy. Probe là fault injection trên dữ liệu thử nghiệm; chưa chứng minh một lịch chạy race tự nhiên cụ thể.
- minimal_fix: dùng event chỉ để xác định AttemptKey; gọi storage.load, validate/adopt final, đồng bộ controller và UI từ record đó. Dùng buildReport và xử lý Result/error; không nhận final từ mirror localStorage thay IndexedDB. Áp dụng cho cả save, submit và storage listener.
- regression_test: hai tab cùng attempt, chốt final A rồi phát notification với mirror cũ/hỏng có responses/name khác; DOM và HTML/JSON tải về phải giữ bản A hoặc báo lỗi integrity, không đổi điểm. Kiểm bản final trong DB không đổi; initial restore và notification phải cho cùng báo cáo.

### CK12-F02 — MAJOR — Lỗi mở IndexedDB bị biến thành StoragePort giả luôn thành công

- affected_files: `src/app/main.ts:468–491`, `src/app/main.ts:548–589`, `src/app/main.ts:1325`; submit tương ứng tại `src/app/main.ts:1062–1103`.
- evidence: khi openStorage trả lỗi, app tạo port có create/saveDraft/finalize/updateOutbox trả `{ok:true,value:rec}` nhưng không lưu; exportBackup trả Blob rỗng, importBackup/clearAll cũng success. Đây là adapter production đang được chọn ở đường lỗi, không phải mock được inject riêng trong test. Bước load cuối còn ghi badge “Đã lưu” vô điều kiện.
- reproduction_steps: trước navigation dist, dùng CDP Page.addScriptToEvaluateOnNewDocument đặt `IDBFactory.prototype.open` ném `DOMException('Audit unavailable','SecurityError')`; giữ localStorage hoạt động. Khởi động, nạp đề UUID hai câu I, chọn một đáp án rồi nộp; đọc badge và `indexedDB.databases()`.
- actual: khi trả lời badge **Đã lưu**; databases=`[]`; sau nộp badge **Đã nộp & lưu cục bộ**. Không có cảnh báo mất bảo đảm IndexedDB/transaction. Reload khôi phục nhờ mirror localStorage, không phải nhờ port đã báo success.
- expected: D03=B và WEB §6/§11 yêu cầu lỗi IDB unavailable được báo rõ, không silently fallback làm mất bảo đảm transaction hoặc giả local_saved. Một bản sao localStorage có thể giúp cứu dữ liệu nhưng không biến no-op create/finalize thành transaction thành công.
- impact: khi storage thật hỏng, controller được báo đã lưu/chốt dù backend không tồn tại; mất CAS, final/outbox transaction và báo lỗi thật. Không khẳng định tất cả câu trả lời mất ngay: probe xác nhận localStorage vẫn cứu được dữ liệu trong điều kiện này.
- minimal_fix: giữ lỗi StoragePort, hiển thị STORAGE_UNAVAILABLE và đường tải khẩn cấp; không tạo adapter success giả. Nếu duy trì mirror cứu hộ, ghi đúng trạng thái suy giảm và không coi nó là xác nhận IDB. Chỉ cập nhật badge sau Result thành công của durable port; bỏ ghi đè badge vô điều kiện.
- regression_test: IDB open thất bại, readwrite thất bại, cả IDB lẫn localStorage thất bại; không đường nào báo durable success từ no-op, không xuất backup rỗng như backup hợp lệ. Kiểm recovery/export và thông báo lỗi trong browser thật.

### CK12-F03 — MINOR — Xác nhận chuyển đề bị tắt bằng callback luôn false

- affected_files: `src/app/main.ts:1716–1743`; đối chiếu `src/app/exam-list.ts:102–107`.
- evidence: initExamList nhận `hasUnsavedProgress: () => false`, nên nhánh confirm có sẵn không bao giờ chạy. File input cũng gọi switchExam trực tiếp, không hỏi xác nhận bài dở.
- reproduction_steps: dist sạch; nạp đề một câu I, chọn đáp án; mở Chọn đề rồi chọn đề đầu danh sách. Harness ghi dialogs trước=0 và sau=`[]`; tiêu đề chuyển thành “Vật lí 12 — Đề số 10 hàng tuần”.
- actual: đổi đề ngay, không có cơ hội hủy; suite chọn đề vẫn xanh vì chưa assert nhánh xác nhận/hủy.
- expected: WEB §15 quy định cùng cách xử lý bài dở cho file/danh sách, hỏi xác nhận trước khi bỏ màn bài dở. Resume khi chọn lại không thay thế quyền hủy chuyển đề.
- impact: bỏ cơ chế xác nhận đã yêu cầu; không khẳng định bài đã lưu bị xóa trong probe này.
- minimal_fix: đưa kiểm tra bài dở và confirm vào cùng đường switchExam; callback phản ánh state thật. Người dùng hủy thì giữ exam/attempt/input/deadline, không đổi active snapshot trước xác nhận.
- regression_test: cả file và danh sách, có bài dở → Cancel giữ nguyên tuple/đáp án/đồng hồ; Accept chuyển đề và quay lại resume; không hỏi khi không có bài dở hoặc đã nộp.

## Rà soát gian lận, sửa giả và test

- **Can thiệp artifact đã có trong lịch sử, hiện đã gỡ:** `237aeb8`, `scripts/web-build.ts:252–264` ở revision đó thêm title và câu I giả một lựa chọn (`q-index-meta`) vào dist/public/exams/index.json để thỏa build validation. `d3d81b9` gỡ đoạn này. HEAD chỉ copy public; kiểm định byte-equal public/dist và schema manifest chạy mới đều PASS. Ghi nhận là sửa giả lịch sử đã khắc phục, không ghi lại thành lỗi còn mở của HEAD.
- Không có thay đổi `src/domain` hoặc package/lock trong path history `0d8cf28..HEAD`; diff domain rỗng. Không tìm thấy scoring gắn cứng theo examId/tên đề kiểm định. So sánh ID khi resume và tìm kiếm tiêu đề ngân hàng là hành vi nghiệp vụ bình thường.
- Tìm `webdriver`, headless, user-agent, tên Claude/Codex-check và test mode trong source/build/root: chỉ có từ headless trong comment PDF preview có sẵn, không có detector điều khiển điểm/hành vi browser. Tìm kiếm chuỗi kết hợp đọc diff không phải chứng minh tuyệt đối rằng không thể có mọi dạng obfuscation.
- `src/app/routes.ts:13` giữ route import bằng `['im','port'].join('')`; main có cách viết route tương tự. Cách viết này né false positive của regex import scanner tại `test/claude-check/build.test.mjs:43`. Runtime vẫn là chuỗi import, tính năng DOCX chạy thật trong hai suite; không kết luận tính năng bị tắt. Nên sửa scanner theo cú pháp JavaScript thay vì làm source phụ thuộc regex test.
- Main có nhánh render `#reportView` khi thiếu scoreTotal và comment nhắc fullIntegration tại `src/app/main.ts:1374–1384`. Đây là nhánh thích nghi DOM harness, không detector browser; không dùng nhánh đó làm chứng cứ UI báo cáo hoàn chỉnh. F01/F02/F03 tái hiện trên DOM sản phẩm thật.
- D02: thay assertion format phân số bằng số thập phân hai chữ số trong legacyBridge/compatibility và oracle comparator Codex ở `8de9c01` có căn cứ quyết định owner. Comparator vẫn dùng bigint và so chính xác kết quả half-up, không nới tolerance tùy tiện. D08: bỏ test giấu đáp án sau nộp và thay bằng mọi câu có lời giải là đúng §14, không phải xóa bảo mật trái yêu cầu.
- Test build loại index.json khỏi danh sách đề và bổ sung kiểm schema manifest/copy bytes có lý do hợp lệ; không cần ép manifest trở thành đề giả. Các test glue thêm event/attribute stubs, storage chuyển sang unwrap vẫn throw khi !ok và giữ assertions retry/generation/final; không thấy xóa/skip test không có căn cứ trong diff đã rà. Hai bộ chạy mới đều skip=0.
- Domain/shuffle/khôi phục IndexedDB đã được nối lại một phần ở `d3d81b9`; các ca shuffle và A→B→A chạy mới PASS. Lỗi tin trực tiếp stored score đã được đổi sang chấm lại. Tuy nhiên F01 chứng minh chấm lại từ nguồn responses sai vẫn làm sai báo cáo, F02 chứng minh đường lỗi lưu vẫn success giả. Không coi tên commit sửa audit là đủ bằng chứng đóng mọi lỗi.
- Chưa gửi mạng collector khi owner chưa triển khai endpoint là đúng D04; PDF manual đúng D06; không coi hai giới hạn đã duyệt này là tắt tính năng để né lỗi. Callback luôn false tại F03 thực sự vô hiệu nhánh xác nhận bắt buộc.

## Giới hạn, xử lý và bàn giao

- Probe finalize-failure riêng: sau khi lưu một đáp án, làm IDB readwrite ném QuotaExceededError, nộp → badge “Chưa lưu”; reload → báo cáo hiện “Đã nộp & lưu cục bộ” nhờ mirror/restore. Không dùng kết quả này để khẳng định đã mất điểm; chưa đo riêng trạng thái IDB sau phục hồi. Đây là khoảng trống cần regression nguồn final duy nhất.
- Quan sát phụ: reload final trong các probe vẫn hiện header “Đang tải đề thi...” trong khi report đã hiện; đây cũng là lý do helper waitBoot của probe đầu timeout. Không đổi kết quả PASS của hai suite bắt buộc vì probe phụ thất bại.
- NOT_RUN: full suite `test/**/*.test.ts`, oracle Python toàn bộ, Firefox/WebKit, OS IME Telex/VNI, mobile thật, axe/Lighthouse, Google Apps Script live/CORS/Sheets readback. Không chép kết quả từ message commit hoặc log vòng 12 thành evidence phiên này. Không kiểm tay toàn bộ nội dung/đáp án/ảnh bộ đề Lý.
- Không có quyết định nghiệp vụ mới cần tự chốt cho ba finding: yêu cầu tương ứng đã được duyệt. assumptions: NONE về nghiệp vụ.
- recommended_action: giao worker sửa F01/F02 trước, thêm regression ở biên IndexedDB/localStorage/event, khôi phục xác nhận F03; chạy lại gate và review snapshot mới. Chưa APPROVED, chưa nghiệm thu milestone, không deploy.
- privacy_notes: chỉ kết quả kỹ thuật, IDs công khai và dữ liệu thử tổng hợp; không đưa nội dung hồ sơ riêng hoặc dữ liệu học sinh thật vào báo cáo.
