# CK-AUDIT-14 — Kiểm định sau vòng sửa 14

- review_id / task_id: CK-AUDIT-14; reviewer: Codex; ngày: 2026-11-16.
- verdict: **CHANGES_REQUESTED**.
- risk_level: HIGH — phục hồi sau lỗi integrity và tính bất biến dữ liệu báo cáo.
- requirements_version: Shared Product Contract v2.0; WEB-contract v1.0, gồm §14–15 và các quyết định đã chốt.
- head_commit: `1bb8fb9accebc38abcc21fa5f77a86f2ed03f7fb`.
- base_commit gần nhất mang message “Bộ kiểm định web của Claude”: `7a727060bcf86613d9d356c88abeed796b7e1615`. Có ba commit cùng message; mở rộng kiểm tra lịch sử/diff tới bản đầu `0d8cf281639c8cf651947acc9104f3ca1ceab96b` để không bỏ sửa né test ở các vòng trước.

Năm lệnh bắt buộc đều thành công, nhưng hai lỗi dưới đây được tái hiện trên trình duyệt thật. Không có căn cứ quy kết ý định gian lận của tác giả. Phân biệt sửa né test từng tồn tại trong lịch sử với lỗi đang có tại HEAD.

## Snapshot và phạm vi

Đã đọc hợp đồng nghiệp vụ/kỹ thuật, git log/diff và các đường chạy liên quan trong `index.html`, `scripts/{build.js,web-build.ts}`, `src/app/{main.ts,legacy.ts,routes.ts,authoring.ts,exam-list.ts,shell.html}`, thay đổi importer DOCX/preview và UI, các diff test Claude/Codex, e2e/glue/storage/report/student/collect/final-quality. Kiểm path history của domain và dependency; đối chiếu thay đổi assertions với quyết định D02/D08, không dùng message XANH làm bằng chứng chạy test.

Working tree ban đầu có sửa `ops/fix_loop.out.txt`, `ops/overnight.log`, `plan.html`, cùng file giao việc chưa track dưới `ops/fix/round14/`. Giữ nguyên. Chỉ tạo báo cáo này; không sửa code/test, không install/dependency, không commit/deploy. Build tạo lại dist và suite hiện có tạo lại fixtures theo hành vi sẵn có; sau checks không phát sinh diff source/fixture tracked.

HEAD không đổi qua checks. Hash SHA-256 của 324 file tracked trong src/scripts/test/styles, index.html, ba tsconfig và package/lock: `07e5eda7e21efd2891b52677851b02165e1b3e7343a6eecf33cd90c33ee86a07`. Thuật toán: sort path, cập nhật hash lần lượt bằng `path + NUL + bytes + NUL`.

## Checks chạy thật

Môi trường: Windows/PowerShell, `D:\Cunata`, Node v24.14.0, TypeScript 7.0.2 có sẵn. Hai suite và probe dùng Chrome/Edge thật qua CDP của harness hiện có, local HTTP dưới `/Cunata/`, context sạch. Regression TS bổ sung là DOM mock; không coi đó là browser evidence.

| Lệnh | Exit | Kết quả |
|---|---:|---|
| `node scripts/build.js` | 0 | PASS; emit/promote 295 file dist; wall time 1,631 s |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS, không diagnostic; wall time 5,553 s |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS, không diagnostic; wall time 5,809 s |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | tests=51, suites=2, pass=51, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=71974.1313 |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | tests=116, suites=2, pass=116, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=72603.3147 |
| `node --test "test/final-quality/ck12Regressions.test.ts"` | 0 | tests=4, suites=1, pass=4, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=474.1601 |

Build còn warning DEP0190 về child process `shell: true`, không đổi exit. Log artifacts là output công cụ trong phiên này; không ghi log ngoài scope. Không lấy log cũ trong ops làm kết quả mới.

Probe bổ sung chạy bằng PowerShell here-string → `node --input-type=module`, import harness/app có sẵn; dùng File/DataTransfer để nạp đề tổng hợp UUID và đọc DOM/download thật, không tạo file source probe. Probe integrity đầu exit 1 vì gọi waitBoot sau quarantine: helper đòi tiêu đề/thẻ câu hỏi của màn bình thường. Đã thay điều kiện chờ bằng sự xuất hiện SCORE_MISMATCH, chạy lại toàn bộ từ context sạch exit 0. Exit 0 của script chẩn đoán chỉ xác nhận probe hoàn tất, không chứng nhận sản phẩm đạt. Probe thời gian xuất JSON root/dist exit 0.

## Findings còn mở

### CK14-F01 — MAJOR — Màn lỗi integrity xóa cấu trúc báo cáo, làm hỏng báo cáo của đề hợp lệ tiếp theo

- affected_files: `src/app/main.ts:680–690`, `src/app/main.ts:1677–1688`, `src/app/main.ts:1723–1763`; cấu trúc thật tại `src/app/shell.html:148–231`.
- evidence: showIntegrityError thay toàn bộ `#reportView.innerHTML`. Trong shell thật, vùng này chứa subtitle, summary, nút download/restart và danh sách lời giải. Khi về báo cáo hợp lệ, showReport chỉ gỡ banner và tìm lại các node đã bị xóa; không dựng lại shell vì HTML lỗi dài hơn 50 ký tự. Mock shell của regression đặt summary bên ngoài reportView nên không phát hiện việc xóa này.
- reproduction_steps: mở dist/context sạch; nạp đề A UUID hai câu I, trả lời đúng một câu, nộp → `0,25 / 0,50`. Trong IDB `cunata-web/attempts`, dùng cursor.update thay riêng `scoreDTO.total` thành `0`, giữ snapshot/responses/phase. Reload, chờ SCORE_MISMATCH. Nạp đề B UUID hợp lệ qua input JSON, trả lời đúng một câu, nộp; đọc DOM sau khi hoàn tất.
- actual: quarantine hiện `Lỗi: SCORE_MISMATCH`, có nút xuất quarantine; `scoreTotal` và `btnDownloadReportHtml` đã không còn trong DOM. Sau nộp B, title là `Audit B`, badge **“Đã nộp & lưu cục bộ”**, nhưng score=null, không còn nút tải HTML; `reportView.innerText` vẫn là **“Lỗi toàn vẹn dữ liệu: SCORE_MISMATCH … Điểm lưu trữ không đúng định dạng DTO hợp lệ.”**
- expected: cách ly record A và vẫn cho record B hợp lệ hiển thị tổng/từng phần, lời giải, tải kết quả bình thường; lỗi A không làm hỏng DOM dùng chung. WEB §9/§11, D08 yêu cầu báo cáo và tải kết quả khả dụng.
- impact: gặp một record hỏng làm mất bảng điểm/lời giải/các nút tải cho những đề nộp tiếp trong cùng trang, dù B hợp lệ và đã lưu. Probe không chứng minh mất dữ liệu durable của B; lỗi được chứng minh ở UI và đường tải báo cáo.
- minimal_fix: giữ nguyên shell báo cáo, dùng một vùng lỗi riêng và toggle các vùng bình thường; hoặc render lại đầy đủ cấu trúc và gắn lại handlers khi đổi model. Không dùng độ dài innerHTML để quyết định cấu trúc có hợp lệ. Khi chuyển đề phải xóa toàn bộ trạng thái lỗi của đề trước.
- regression_test: browser thật với shell dist: final A → hỏng DTO → reload/quarantine → nạp/nộp B hợp lệ → assert bốn điểm, lời giải, badge, download HTML/JSON và không còn lỗi A. Kiểm cả đường quay lại một final B đã có sẵn. Mock test cần dùng đúng quan hệ cha/con của shell sản phẩm.

### CK14-F02 — MAJOR — Xuất kết quả ghi thời điểm tải file thành thời điểm nộp bài

- affected_files: `index.html:3973–3982`, `index.html:4009–4018`; `src/app/main.ts:1848–1857`, `src/app/main.ts:1901–1910`.
- evidence: JSON đặt submittedAt bằng Date.now()/now() trong handler download; CSV đặt submitted_at bằng new Date của thời điểm download. durationSeconds cũng lấy thời điểm download trừ startedAt. Không dùng timestamp của immutable final. Các handler này được thêm trong khoảng audit; test CSV hiện chỉ bắt formula injection, không kiểm bất biến thời gian.
- reproduction_steps: mỗi target root/dist dùng context sạch và đề UUID một câu I; chọn đúng, nộp; tải JSON qua nút UI, đợi khoảng 1,2 giây rồi tải JSON lần nữa. So attemptId/submittedAt/durationSeconds của hai file tải thật.
- actual (root): cùng attemptId; file 1 submittedAt=`1794794569485`, durationSeconds=`0`; file 2 submittedAt=`1794794570968`, durationSeconds=`2`.
- actual (dist): cùng attemptId; file 1 submittedAt=`1794794571764`, durationSeconds=`0`; file 2 submittedAt=`1794794573239`, durationSeconds=`2`. CSV có cùng nguyên nhân trực tiếp tại các dòng nêu trên; probe động ở đây kiểm JSON, chưa tải CSV để đối chiếu timestamp.
- expected: submittedAt là thời điểm chốt final, bất biến qua tải lại/reload; thời gian làm bài tính bằng submittedAt−startedAt. Nếu cần thời điểm xuất, dùng exportedAt riêng. Shared Product Contract §2/§3 và WEB §6/§7 yêu cầu thời gian thực, immutable final và payload ổn định.
- impact: file kết quả tải về ghi sai lịch sử nộp/thời lượng; cùng attempt sinh metadata khác nhau theo thời điểm tải, gây sai thống kê/đối chiếu khi thu file. Không khẳng định đã gây lỗi Google live: endpoint chưa bật.
- minimal_fix: lấy finalRecord/ReportModel đã xác thực làm nguồn export chung, dùng submittedAt đã lưu (root dùng timestamp final tương ứng), giữ nguyên rational DTO và raw responses. Không tạo lại thời điểm nộp trong JSON/CSV handler; xử lý bản cứu hộ thiếu timestamp bằng nhãn thiếu dữ liệu rõ ràng.
- regression_test: nộp với clock điều khiển, xuất JSON/CSV ở hai thời điểm khác nhau và sau reload; assert cùng tuple, submittedAt và durationSeconds đúng final, payload nghiệp vụ ổn định; exportedAt riêng được phép đổi. Chạy cả root và dist.

## Kiểm tra gian lận, sửa né test và kết quả vòng trước

- **Sửa giả đã tồn tại, hiện đã gỡ:** `237aeb8` thêm title và câu hỏi giả một option `q-index-meta` vào manifest trong build để qua kiểm định. `d3d81b9` gỡ đoạn đó. HEAD copy public nguyên; kiểm byte-equal và schema manifest chạy mới đều PASS. Không ghi đây là finding còn mở tại HEAD.
- `git diff`/path history từ `0d8cf28` đến HEAD không có thay đổi `src/domain`, package/lock hoặc hai tsconfig. Không thấy đổi luật chấm trong domain để làm xanh. Hai suite browser mới kiểm điểm bằng dữ liệu độc lập, không chỉ kiểm nội dung có sẵn.
- Tìm detector webdriver/userAgent/headless/NODE_ENV/process.env trong source/build/root và kiểm lịch sử bằng `git log -G`: không thấy nhánh phát hiện môi trường kiểm định để đổi điểm/hành vi. Comment headless trong PDF preview không phải detector. So sánh examId phục vụ chọn đề/resume/version không phải nhánh gắn cứng theo fixture. Không thấy hardcode điểm theo tên/ID đề kiểm định trong phạm vi đã rà soát.
- Đổi test D02 sang half-up hai chữ số và D08 sang hiện lời giải sau nộp có quyết định owner tại WEB §14; không phải nới test vô cớ. Loại manifest khỏi danh sách JSON đề phù hợp §15, kèm test riêng schema/copy nguyên. Các sửa mock listeners/Result unwrap/order shape không bỏ assertions nghiệp vụ cũ; không thấy xóa/skip test cũ vô cớ. Hai suite mới có skipped=0.
- `src/app/routes.ts:13` và case tương ứng main vẫn ghép chuỗi `['im','port'].join('')` để tránh scanner regex import hiểu nhầm tên route. Đây là coupling với kiểm định cần cải thiện scanner; route/importer thật vẫn tồn tại, các ca DOCX root/dist chạy PASS. Không coi là bằng chứng tắt importer.
- Hai test rỗng hành vi của CK13 đã được viết lại: dùng MemoryTransactionAdapter chung với bootstrap, fixture bốn options, phát storage event; test đổi đề có trả lời và assert confirm/Cancel/Accept. Không lặp lại CK13-F02 như finding hiện hành. Coverage còn thiếu browser shell thật/recovery sau quarantine như F01; storage-event assertion cũng chưa chờ hậu điều kiện async riêng.
- Probe IDB luôn unavailable xuyên reload: submit badge **“Chưa lưu”**, reload vẫn **“Chưa lưu”**, điểm vẫn `0,25 / 0,50`. CK13-F01 đã sửa trong tình huống tái hiện này.
- Probe DTO hỏng sau reload: app báo **SCORE_MISMATCH**, có xuất quarantine; CK13-F03 đã được xử lý ở nhánh lỗi ban đầu. F01 là lỗi phục hồi phát sinh từ cách render nhánh mới, không phải tiếp tục che SCORE_MISMATCH.
- Không bật gửi Google trước endpoint do owner triển khai đúng D04; PDF xem/nhập tay đúng D06. Không đánh dấu hai giới hạn được duyệt này là tắt tính năng né test.

## Giới hạn và đề nghị

- NOT_RUN: full suite `test/**/*.test.ts`, Python oracle toàn bộ, Firefox/WebKit, OS IME Telex/VNI, mobile thật, axe/Lighthouse, Google live/CORS/Sheets readback. Không có yêu cầu chạy những mục này trong năm gate bắt buộc; không suy PASS từ commit message hoặc log cũ.
- Không kiểm tay toàn bộ đáp án/nội dung bộ đề Lý, không chứng nhận milestone/production. Scan tĩnh theo pattern/diff không chứng minh tuyệt đối không thể tồn tại mọi dạng mã che giấu.
- recommended_action: worker sửa F01 bằng giữ/render lại đúng shell, sửa F02 bằng export immutable final; thêm regression thực hiện chuỗi lỗi→phục hồi và kiểm timestamp qua tải/reload, rồi chạy lại gate và review snapshot ổn định.
- assumptions: NONE về nghiệp vụ; hai lỗi có yêu cầu rõ trong hợp đồng, không cần tự chốt policy hay yêu cầu quyết định mới.
- privacy_notes: chỉ source, hash và dữ liệu kiểm thử tổng hợp; không đưa hồ sơ riêng hoặc dữ liệu học sinh thật vào báo cáo.
