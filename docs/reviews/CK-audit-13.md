# CK-AUDIT-13 — Kiểm định sau vòng sửa 13

- review_id / task_id: CK-AUDIT-13; reviewer: Codex; ngày kiểm định: 2026-11-16.
- verdict: **CHANGES_REQUESTED**.
- risk_level: HIGH — trạng thái lưu bản nộp, kiểm tra integrity và chất lượng regression.
- requirements_version: Shared Product Contract v2.0; WEB-contract v1.0, gồm cập nhật §14–15; quyết định D01–D08 và ND-01 đã ghi trong hợp đồng.
- head_commit: `cb931498c3f95a34d10d34ebabecba9f0fda78cd`.
- base_commit chính: `7a727060bcf86613d9d356c88abeed796b7e1615` (commit gần nhất mang message “Bộ kiểm định web của Claude”). Vì có nhiều commit cùng message, mở rộng rà soát về commit đầu tiên `0d8cf281639c8cf651947acc9104f3ca1ceab96b` để không bỏ lịch sử sửa giả/test.

Hai bộ kiểm định bắt buộc đều xanh, nhưng có lỗi lưu còn tái hiện trên browser thật và hai test mới không kiểm tra hành vi mà chúng tuyên bố. Không có căn cứ kết luận ý định gian lận của tác giả; các nhận xét dưới đây đánh giá mã và bằng chứng thực tế.

## Snapshot và phạm vi

Đã đọc lịch sử/diff sản phẩm, build và các test bị sửa trong khoảng trên; tập trung đường UI → domain → IndexedDB/mirror → submit/restore/report. Files reviewed gồm `index.html`, `scripts/{build.js,web-build.ts,sync-shell.js}`, `src/app/{main.ts,legacy.ts,routes.ts,authoring.ts,exam-list.ts,shell.html}`, thay đổi `src/import/docx/*`, `src/import/preview/view.ts`, `src/ui/{index.ts,layout.ts}`, test Claude/Codex và các diff test e2e/glue/storage/report/student/import/collect/ui/final-quality. Đối chiếu path history của `src/domain`, package và lockfile; không chỉ tin message commit XANH.

Working tree ban đầu có thay đổi `ops/fix_loop.out.txt`, `ops/overnight.log`, `plan.html` và các file giao việc chưa track dưới `ops/fix/round13/`. Giữ nguyên; chỉ tạo file báo cáo này. Build tái sinh dist và test tái ghi fixtures theo hành vi có sẵn; sau checks không có diff sản phẩm/fixture phát sinh. Không sửa code/test, không install/dependency, không commit/deploy.

Hash tổng hợp 324 file tracked trong `src`, `scripts`, `test`, `styles`, `index.html`, ba tsconfig và package/lock: **`53b3ed3397e6103c469c5e1924cb41715948b012742b1eae916bbc3207fe42fe`**. Thuật toán: sắp xếp path, SHA-256 trên lần lượt `path + NUL + bytes + NUL`. HEAD không đổi sau checks.

## Checks chạy thật

Môi trường: Windows/PowerShell, `D:\Cunata`, Node **v24.14.0**, TypeScript **7.0.2** đã có sẵn. Browser thật Chrome/Edge qua CDP của harness hiện có, context sạch, local HTTP dưới `/Cunata/`; không dùng DOM mock thay cho các probe trình duyệt.

| Lệnh | Exit | Kết quả thực tế |
|---|---:|---|
| `node scripts/build.js` | 0 | PASS; emit/promote 295 file dist; wall time 1,574 s |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS, không diagnostic; wall time 7,871 s khi chạy đồng thời các checks |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS, không diagnostic; wall time 7,828 s |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | tests=51, suites=2, pass=51, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=67692.6926 |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | tests=116, suites=2, pass=116, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=76924.2503 |
| `node --test "test/final-quality/ck12Regressions.test.ts"` | 0 | tests=3, suites=1, pass=3, fail=0, skipped=0; duration_ms=253.148; giới hạn coverage tại F02 |

Build có warning DEP0190 (`shell: true`), không làm đổi exit. Log artifacts: output công cụ của phiên kiểm định; không ghi file log ngoài scope.

Các probe bổ sung dùng PowerShell here-string → `node --input-type=module`, import harness/app sẵn có, tạo đề UUID và File/DataTransfer trong browser, không tạo source/probe file. Probe storage hai tình huống exit 0; probe mismatch sửa bằng cursor exit 0. Đây là script chẩn đoán: exit 0 không có nghĩa sản phẩm đạt. Một probe integrity trước đó kiểm mirror thành công rồi bị treo khi ghi IDB bằng `put` thiếu out-of-line key; đã dừng (exit 1), không tính là PASS. Probe sau dùng cursor.update và transaction onabort để kiểm chứng mismatch đầy đủ.

## Findings còn mở

### CK13-F01 — MAJOR — Reload biến bản cứu hộ chưa lưu thành thông báo đã lưu thành công

- affected_files: `src/app/main.ts:1321–1360`, `src/app/main.ts:1397`, `src/app/main.ts:1418–1425`; mirror ghi tại `src/app/main.ts:1253–1280`.
- evidence: khi không có record IndexedDB, restore đọc mirror localStorage. `isSubmitted` nhận `submitted: true`; nhánh report đặt “Đã nộp & lưu cục bộ” vô điều kiện, không xét `isStorageAvailable`, `degradedRescueMirror` hoặc kết quả resume. Cảnh báo đầu bootstrap vì vậy không ngăn badge success giả sau reload.
- reproduction_steps: trước navigation dist, inject `IDBFactory.prototype.open = function(){ throw new DOMException('Audit unavailable','SecurityError'); }` bằng CDP addInitScript, áp dụng cả reload. Nạp đề UUID có hai câu I, trả lời đúng một câu, nộp; đọc badge, reload rồi đọc lại. localStorage vẫn hoạt động.
- actual: trước reload badge **“Chưa lưu”**, report **0,25 / 0,50**, có banner lỗi IDB. Sau reload badge **“Đã nộp & lưu cục bộ”**, cùng điểm, vẫn có banner; `indexedDB.open` vẫn ném SecurityError. Không có xác nhận lưu IndexedDB ở cả hai lần.
- expected: WEB §6/§7 và D03=B: bản cứu hộ có thể dùng để cứu câu trả lời, nhưng trạng thái phải giữ “Chưa lưu”/suy giảm cho tới khi durable transaction thật thành công. Không hiển thị hai thông báo lưu mâu thuẫn.
- impact: người dùng bị báo đã lưu thành công dù đường durable storage luôn lỗi; bản cứu hộ thiếu bảo đảm transaction được trình bày như bản nộp đã lưu. Không khẳng định câu trả lời mất ngay trong probe: localStorage vẫn khôi phục được.
- minimal_fix: phân biệt nguồn restore và trạng thái durable final; mirror chỉ mang trạng thái rescue. Chỉ đặt saved khi load/finalize trả record durable hợp lệ. Nếu IDB lỗi, giữ cảnh báo, tải khẩn cấp và đường retry rõ ràng qua cả reload.
- regression_test: browser thật IDB unavailable xuyên reload; submit → reload → download phải giữ dữ liệu và badge lỗi. Kiểm thêm cả hai storage cùng lỗi và IDB phục hồi; chỉ đổi saved sau transaction xác nhận.
- quan sát đối chứng: chặn riêng readwrite sau khi lưu đáp án khiến submit báo “Chưa lưu”, DB vẫn draft. Khi reload với write đã hoạt động lại, migration chuyển thành final thật và badge saved; tình huống này không được dùng làm bằng chứng success giả. Finding dựa trên IDB luôn unavailable ở trên.

### CK13-F02 — MAJOR — Hai regression CK12 xanh nhưng không thực hiện tình huống cần bảo vệ

- affected_files: `test/final-quality/ck12Regressions.test.ts:59–140`, đặc biệt `:120–138`; `test/final-quality/ck12Regressions.test.ts:184–206`.
- evidence: test F01 tạo Map/StoragePort riêng và chèn final, nhưng bootstrap chỉ nhận initialExam, không nhận adapter kết nối Map đó. Test không làm hỏng mirror, không phát storage event và không kiểm DOM/report; cuối cùng chỉ đọc lại Map độc lập vừa tự ghi. Test F03 khai báo `confirmCalled` nhưng không assert biến này, không nhập đáp án, không yêu cầu đổi đề và không kiểm Cancel; chỉ assert title chứa CK12. Fixture hai câu I còn chỉ có hai options/câu, không đủ bốn options theo contract.
- reproduction_steps: chạy lệnh regression ở bảng trên; đọc các bước/argument bootstrap và assertions. Kết quả thực tế 3/3 PASS, trong khi không có event corrupt-mirror hay thao tác chuyển đề ở hai test tương ứng.
- expected: test phải đi qua tác nhân gây lỗi và kiểm hậu điều kiện liên quan. Tên test/PASS không thay được chứng cứ.
- actual: F01 chỉ kiểm Map tự tạo; F03 chỉ kiểm tên đề. Không có bằng chứng hai test này sẽ đỏ nếu đưa lỗi cũ trở lại.
- impact: tạo độ tin cậy sai cho việc đóng CK12-F01/F03 và không chặn tái phát. Đây là test coverage giả về hành vi, không phải bằng chứng đủ để quy kết chủ ý gian lận.
- minimal_fix: dùng fixture hợp lệ bốn options; nối cùng durable adapter hoặc IDB thật với app. F01: chốt final → corrupt mirror → notification → assert điểm/tên/đáp án DOM và download, kiểm DB bất biến. F03: trả lời → chọn đề qua file và danh sách → Cancel/Accept → assert confirm đã gọi, tuple/đáp án/deadline giữ đúng và quay lại resume.
- regression_test: test mới phải đỏ khi khôi phục lỗi cũ; không dùng assertion lên store độc lập hoặc title làm bằng chứng đóng lỗi. Test F02 cũng cần thêm submit/reload để bắt F01 của vòng này.

### CK13-F03 — MAJOR — Gọi buildReport nhưng bỏ qua SCORE_MISMATCH, tiếp tục báo cáo thành công

- affected_files: `src/app/main.ts:628–656`; đường submit tương tự `src/app/main.ts:1246–1251`; renderer tự tính lại tại `src/app/main.ts:1514`.
- evidence: `buildReport(record, now())` chỉ được xử lý khi `.ok`; nhánh error không báo lỗi/quarantine/return. Sau đó vẫn đặt badge saved và gọi showReport; showReport tự dựng điểm từ responses, không dùng Result lỗi để chặn báo cáo bình thường.
- reproduction_steps: trên dist sạch, nộp đề UUID hai câu I, đúng một câu. Trong context dữ liệu tổng hợp, mở IDB store attempts, dùng cursor.update thay riêng `scoreDTO.total` từ `1/4` thành `0`, giữ responses/snapshot/phase. Gọi trực tiếp module report buildReport cho record đó, rồi reload app và kiểm UI.
- actual: API report trả `{ok:false,error:{code:'SCORE_MISMATCH',path:'scoreDTO',...}}`. Sau reload UI vẫn hiện **0,25 / 0,50**, badge **“Đã nộp & lưu cục bộ”**, body không có SCORE_MISMATCH. Kết quả hiển thị được tính lại đúng từ responses; lỗi là che mất kiểm tra integrity, không phải tin điểm giả thành 0.
- expected: WEB §5/§11 yêu cầu mismatch → SCORE_MISMATCH/quarantine; người dùng phải biết bản lưu không nhất quán. Không coi recompute im lặng là đã xử lý lỗi integrity.
- impact: kiểm tra integrity đã có trong report module bị vô hiệu ở composition root; record hỏng được trình bày như final hợp lệ. Fault injection dùng dữ liệu thử, không chứng minh website tĩnh có khả năng chống sửa dữ liệu client như dịch vụ tin cậy.
- minimal_fix: kiểm tra repRes trước khi adopt state/đổi badge; lỗi thì clear activeReportModel, hiển thị lỗi và giữ/export bản gốc để phục hồi. Chỉ render report bình thường khi Result hợp lệ; thống nhất submit/restore/event trên cùng đường kiểm tra.
- regression_test: sửa scoreDTO không khớp tổng/phần/câu rồi restore và notification; UI phải báo SCORE_MISMATCH, không dùng model của attempt trước hoặc che lỗi bằng renderer khác. Record hợp lệ vẫn phải hiện đúng điểm và tải báo cáo được.

## Rà soát gian lận và sửa né kiểm định

- **Có sửa giả trong lịch sử, đã gỡ:** commit `237aeb8`, `scripts/web-build.ts:252–264` ở revision đó sửa manifest dist bằng title và câu I giả một option, ID `q-index-meta`, để qua validation. `d3d81b9` gỡ đoạn này. HEAD copy public nguyên; ca byte-equal và schema manifest chạy mới PASS. Không ghi lỗi này thành finding còn mở của HEAD.
- `git diff` và path history `0d8cf28..HEAD` cho `src/domain`, `package.json`, `package-lock.json` không có thay đổi. Không thấy nới scoring domain hoặc dependency để làm xanh.
- Tìm `navigator.webdriver`/webdriver, headless, userAgent, NODE_ENV/process.env, tên Claude/Codex/oracle trong source/build/root kết hợp đọc nhánh liên quan: không thấy detector browser điều khiển điểm, hardcode điểm theo ID/tên đề kiểm định. “headless” trong comment PDF preview không phải detector. Các so sánh examId phục vụ resume/version là chức năng bình thường. Đây là kết luận trong phạm vi source/diff đã kiểm, không chứng minh tuyệt đối mọi dạng obfuscation không thể tồn tại.
- `src/app/routes.ts:13` và route tương ứng trong main dùng `['im','port'].join('')`: né false positive của scanner regex import trong test build. Runtime vẫn là route import; kiểm định DOCX thật cả root/dist PASS. Ghi nhận coupling với test scanner; nên sửa scanner theo cú pháp thay vì đổi cách viết route để vừa regex.
- `src/app/main.ts:1546–1558` có renderer riêng khi DOM thiếu scoreTotal, comment nhắc fullIntegration. Đây là thích nghi DOM harness, không phải phát hiện webdriver; không lấy nhánh đó làm bằng chứng giao diện report thật. F03 cho thấy đường xử lý report bình thường vẫn cần sửa.
- Các thay đổi test D02 (half-up hai chữ số, vẫn so bằng bigint) và D08 (hiện mọi lời giải sau nộp) có căn cứ quyết định owner; không coi là nới test vô cớ. Loại manifest index.json khỏi test “mỗi JSON là đề” là đúng schema; đã thêm test manifest và copy nguyên thay cho thêm câu giả.
- Diff test glue/e2e bổ sung listener/stub DOM; storage sửa shape order/unwrap Result nhưng còn assert retry/generation/final. Không thấy test cũ bị xóa/skip vô cớ trong diff đã kiểm. Hai suite browser mới chạy skipped=0; regression mới yếu được tách thành F02, không nhập nhằng với suite browser.
- Không gửi Google khi chưa có endpoint owner triển khai là đúng D04; PDF preview/manual đúng D06. Không xem hai giới hạn này là tắt tính năng để né lỗi. Callback xác nhận luôn false của vòng trước đã được thay bằng kiểm progress thật; test F03 mới vẫn chưa kiểm thao tác đó.
- Probe corrupt mirror trên dist lần này: sau final **0,25 / 0,50**, thay responses trong mirror thành `{}`, phát storage event → vẫn **0,25 / 0,50**. Đường notification của CK12-F01 đã cải thiện; không lặp lại finding điểm bị mirror đổi như lỗi hiện hành. Phần xử lý lỗi report vẫn còn F03.

## Giới hạn và đề nghị xử lý

- NOT_RUN: full suite `test/**/*.test.ts`, Python oracle toàn bộ, Firefox/WebKit, OS IME Telex/VNI, mobile thật, axe/Lighthouse và Google Apps Script live/CORS/Sheets readback. Task yêu cầu năm lệnh đã chạy đủ; không sao chép kết quả unit/oracle từ message commit thành evidence mới.
- Không kiểm tay toàn bộ nội dung/đáp án/vật liệu bộ đề Lý. Không chứng nhận milestone hay production chỉ dựa trên suite xanh.
- recommended_action: sửa F01 và F03 tại đường restore/report, thay các test rỗng hành vi ở F02, thêm fault-injection regression thực sự và chạy lại gate/review snapshot ổn định. Không sửa code trong task audit này.
- assumptions: NONE về nghiệp vụ. Không cần quyết định nghiệp vụ mới để sửa ba finding; yêu cầu đã có trong hợp đồng.
- privacy_notes: chỉ source, hash và dữ liệu thử tổng hợp; không chép nội dung hồ sơ riêng hoặc dữ liệu học sinh thật.
