# CK-AUDIT-15 — Kiểm định sau vòng sửa 15

- review_id / task_id: CK-AUDIT-15; reviewer: Codex; ngày: 2026-11-16.
- verdict: **CHANGES_REQUESTED**.
- risk_level: HIGH — cập nhật ứng dụng offline có thể giữ người dùng ở phiên bản còn lỗi.
- requirements_version: Shared Product Contract v2.0; WEB-contract v1.0, gồm §14–15; các quyết định đã chốt trong BANG-QUYET-DINH.md.
- head_commit: `1cddea93c54c183a4bf9cd6e926ef3c1bfd83d1d`.
- base_commit gần nhất mang message “Bộ kiểm định web của Claude”: `7a727060bcf86613d9d356c88abeed796b7e1615`.
- Có ba commit cùng message. Đã mở rộng kiểm tra lịch sử/diff tới bản đầu `0d8cf281639c8cf651947acc9104f3ca1ceab96b`, bao gồm bản giữa `9979578b24a5e1db1203c395d3694ca1b1cf3cdd`. F01 thuộc khoảng mở rộng này, không phải lỗi mới được thêm riêng trong vòng 15.

Năm gate bắt buộc đều PASS. Hai finding CK14 đã được sửa và tái kiểm trên trình duyệt thật với context sạch. Tuy nhiên, probe nâng phiên bản phát hiện service worker giữ mã ứng dụng cũ dù origin đã có mã sửa mới. Không có căn cứ quy kết ý định gian lận của tác giả.

## Snapshot, phạm vi và tính toàn vẹn kiểm định

Đã đọc hợp đồng nghiệp vụ và toàn bộ hợp đồng kỹ thuật; kiểm git log/diff, path history domain/dependency/config, các thay đổi assertions và mock, source liên quan trong main/root/build, các thay đổi importer và đường chọn đề/report/storage. Đọc đối chiếu báo cáo CK14 với diff sửa thực tế, không coi báo cáo cũ hay commit message XANH là kết quả chạy mới.

Working tree đầu phiên có sửa `ops/fix_loop.out.txt`, `ops/overnight.log`, cùng file giao việc chưa track dưới `ops/fix/round15/`. Trong phiên xuất hiện thêm thay đổi `plan.html` từ bên ngoài; không sửa hay khôi phục các file đó. Chỉ tạo báo cáo này. Không sửa source/test, install dependency, commit hoặc deploy. Build tái tạo dist theo lệnh được giao; sau checks không có diff tracked trong src/scripts/test/dist hay index.html do kiểm định.

HEAD không đổi qua kiểm định. Hash SHA-256 cuối phiên của 324 file tracked trong src/scripts/test/styles, index.html, ba tsconfig và package/lock: `da8296b556224f4bd07e05d83ff7ddfb2c1eaffcb5739a9a0a6f8c9c946823ad`. Thuật toán: sort path; cập nhật hash lần lượt bằng `path + NUL + bytes + NUL`. Đây là hash snapshot hiện tại, không phải bằng chứng một bản triển khai từ xa đã cập nhật.

## Checks chạy thật

Môi trường: Windows/PowerShell, `D:\Cunata`, Node v24.14.0, TypeScript 7.0.2 có sẵn. Hai suite browser dùng Chrome/Edge headless thật qua CDP của harness hiện có, dưới subpath `/Cunata/`, không dùng VM thay browser. Hai suite chạy song song trên origin/context riêng; build hoàn tất trước khi chạy.

| Lệnh | Exit | Kết quả |
|---|---:|---|
| `node scripts/build.js` | 0 | PASS; emit/promote 295 file dist; wall time 1,565 s |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS, không diagnostic; wall time 4,504 s |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS, không diagnostic; wall time 4,600 s |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | tests=51, suites=2, pass=51, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=45936.4066 |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | tests=116, suites=2, pass=116, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=75666.0424 |
| `node --test "test/final-quality/ck12Regressions.test.ts"` | 0 | tests=6, suites=1, pass=6, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=1666.9988 |

Build có warning DEP0190 về child process `shell: true`, không đổi exit. Log evidence là output công cụ trong phiên; không ghi log ngoài scope, không dùng log cũ trong ops làm bằng chứng mới.

Probe bổ sung chạy bằng PowerShell here-string → `node --input-type=module`, dùng harness hiện có và server HTTP cục bộ, không tạo source probe. Probe tải nhiều file lần đầu exit 1 do helper waitDownload trả file cũ trong thư mục tải về; đã sửa script trong bộ nhớ bằng clearDownloads trước mỗi lần tải, chạy lại từ context sạch exit 0. Probe nâng phiên bản exit 0, nghĩa là script chẩn đoán hoàn tất; kết quả sản phẩm là F01 dưới đây.

## Finding còn mở

### CK15-F01 — MAJOR — Service worker không đổi theo bản build và trả cache vĩnh viễn, khiến máy đã dùng bản cũ không nhận các bản sửa

- affected_files: `scripts/web-build.ts:255–258`, `scripts/web-build.ts:285–307`, `scripts/web-build.ts:312–323`; đăng ký tại `src/app/main.ts:2325–2332`; artifact phát sinh `dist/service-worker.js`.
- evidence: build sinh service worker với tên cache cố định `cunata-cache-v1`, URL module không có content hash/version, nội dung worker không phụ thuộc các source đã đổi. Fetch handler trả cache ngay khi tìm thấy và chỉ đọc mạng khi chưa có cache. Từ `1bb8fb9` tới HEAD, `dist/app/main.js` đổi nhưng worker không đổi. Browser kiểm cập nhật worker cũng không thấy bản worker mới để install/activate. Các nhánh update trong module src/offline không sửa được đường chạy thực tế đang đăng ký worker do build sinh này.
- reproduction_steps:
  1. Server HTTP cục bộ phục vụ cây dist hiện tại dưới `/Cunata/`; riêng `app/main.js` ban đầu trả đúng bytes lấy bằng `git show 1bb8fb9:dist/app/main.js`. Không chỉnh file repository.
  2. Mở context Chrome sạch; chờ ứng dụng boot và navigator.serviceWorker.controller tồn tại; reload để worker cache module cũ. Đọc SHA-256 response `fetch('app/main.js')` trong trang.
  3. Chuyển response server của module đó sang đúng bytes `dist/app/main.js` tại HEAD, giữ URL và worker như một đợt cập nhật source thực tế. Gọi registration.update(), đóng trang rồi mở lại cùng origin/context.
  4. So hash response trong browser với hash tải trực tiếp từ origin bằng Node fetch, ngoài service worker.
- actual:
  - Hash module bản cũ và response browser trước cập nhật: `0781607e71267573ddd4c452a9aee408018b4814b3e6fffa673591d5d8e13cc3`.
  - Hash module HEAD tại origin: `47dfd91a435b41c3630567b444dd74f281c61c77d80717ddfe144548fc3554f9`.
  - Sau update(), đóng/mở trang: response browser vẫn có hash bản cũ `0781607e…e13cc3`; registration.waiting=false; CacheStorage chỉ có `cunata-cache-v1`. Origin độc lập trả hash mới `47dfd91a…554f9`.
- expected: người dùng đã cài bản offline có đường nhận bản build mới sau khi kết thúc bài và mở lại, đồng thời giữ snapshot/answers/deadline đang làm. WEB §6 yêu cầu cache versioned và cơ chế cập nhật sau khi nộp; §10 yêu cầu build/cutover và rollback có hiệu lực.
- impact: các sửa CK14 hoạt động trong context sạch nhưng người dùng dist đã cache vòng 14 vẫn chạy mã trước sửa, kể cả khi origin đã được cập nhật. Fresh-context tests xanh không chứng minh người dùng cũ nhận bản sửa. Probe là mô phỏng nâng phiên bản cục bộ, không phải deploy hay xác nhận trạng thái website từ xa. Chưa chứng minh mất dữ liệu do cập nhật; lỗi đã chứng minh là không nhận cập nhật.
- minimal_fix: build sinh version/content digest cho worker và cache từ module graph/shell/assets; dùng URL asset theo version/hash hoặc cache riêng mỗi release để không trộn module giữa hai bản. Cài đầy đủ cache mới, giữ worker đang chạy khi còn bài dở, thông báo bản mới và kích hoạt an toàn sau khi nộp. Không chỉ sửa CACHE_NAME một lần: build sau đó vẫn phải tự thay version khi bytes đổi. Giữ IDB/snapshot, không hướng dẫn xóa toàn bộ dữ liệu người dùng như cách sửa mặc định.
- regression_test: browser thật, cùng origin và cùng context, chạy release A → cache/answer/save → server chuyển release B → update → hoàn tất bài/đóng mở theo cơ chế đã định → assert bytes/hành vi B, không trộn A/B, ID/answers/order/deadline/final còn nguyên và B vẫn mở offline. Dùng actual generated worker; test context sạch hoặc chỉ tắt server không cover nâng phiên bản.

## Xác minh sửa CK14

- **CK14-F01 đã sửa trong context sạch:** tạo đề A hai câu I bằng UUID ngẫu nhiên, nộp được `0,25 / 0,50`; sửa riêng scoreDTO.total trong IndexedDB thành `0`, reload thấy SCORE_MISMATCH. Nạp/nộp đề B UUID hợp lệ: score=`0,25 / 0,50`, banner lỗi không còn, badge=`Đã nộp & lưu cục bộ`, lời giải của hai câu còn nguyên và nút tải HTML tải được file. Source giữ shell báo cáo và dùng banner riêng thay vì xóa reportView.innerHTML. Không lặp lại CK14-F01 như lỗi hiện hành của HEAD.
- **CK14-F02 đã sửa trong context sạch, cả root và dist:** tải JSON/CSV sau nộp, đợi 1,25 giây rồi tải lại, reload và tải lần ba. Với mỗi target, cả ba file JSON giữ cùng attemptId, startedAt, submittedAt và durationSeconds; cả ba CSV byte-equal. Root: startedAt=`1794796599571`, submittedAt=`1794796599914`; dist: startedAt=`1794796603108`, submittedAt=`1794796603534`. Thời lượng probe dưới nửa giây nên hiển thị 0 giây; regression clock điều khiển riêng xác nhận thời lượng 60 giây và timestamp không đổi khi tải trễ. Không suy từ probe này rằng mọi dạng legacy thiếu metadata đã được kiểm.

## Rà soát gian lận và sửa né test

- **Sửa giả từng tồn tại, đã gỡ:** commit `237aeb8` chèn title và câu giả một option `q-index-meta` vào manifest trong build để qua validator. `d3d81b9` gỡ. HEAD không còn đoạn đó; ca schema manifest và đối chiếu dist/public với public chạy mới PASS. Đây là bằng chứng lịch sử cần ghi nhận, không phải finding còn mở tại HEAD.
- Path history từ `0d8cf28` tới HEAD không có sửa `src/domain`, package/lock, tsconfig.json hoặc tsconfig.web.json. Khoảng gần nhất `7a72706..HEAD` cũng không đổi hai bộ test Claude/Codex. Không thấy đổi quy tắc chấm domain để làm xanh.
- Scan source/build/root và history bằng pattern webdriver/userAgent/headless/NODE_ENV/process.env không thấy detector môi trường kiểm định để thay hành vi/điểm; comment headless trong PDF preview không phải detector. Không thấy nhánh theo tên/ID fixture Claude/Codex hoặc hardcode điểm tương ứng. Probe bổ sung dùng examId/title UUID ngẫu nhiên vẫn chạy đúng. Đây là kết quả rà soát theo phạm vi/pattern, không phải chứng minh tuyệt đối không thể có mã che giấu.
- Diff assertions D02 chuyển sang half-up hai chữ số và D08 chuyển sang lời giải sau nộp có quyết định owner tại WEB §14. Không xem đây là nới test vô cớ. Manifest index.json là danh sách theo §15; tách khỏi JSON đề và thêm ca schema/copy nguyên là sửa đúng hợp đồng.
- Các sửa storage test unwrap Result, presentationOrder và mock listeners giữ kiểm tra hành vi cũ. Không thấy thêm skip/only/todo mới trong diff test để né ca đỏ. Hai suite browser chạy mới có skipped=0. Sáu regression mới kiểm kết quả thật; vẫn phân biệt DOM mock với browser evidence.
- `src/app/routes.ts:13` ghép `['im', 'port'].join('')` để tránh scanner regex hiểu nhầm route thành import. Đây là coupling với kiểm định, nên sửa scanner cho đúng cú pháp khi có task phù hợp. Không chứng minh importer bị tắt: ca DOCX root/dist chạy mới PASS, route vẫn hoạt động.
- Không gửi Google trước endpoint owner triển khai phù hợp D04; PDF chỉ preview/nhập tay phù hợp D06; bỏ tùy chọn after_deadline phù hợp D08. Không coi các giới hạn đã duyệt này là tắt tính năng để né lỗi.

## Giới hạn và đề nghị

- NOT_RUN: full suite `test/**/*.test.ts`, Python oracle toàn bộ, Firefox/WebKit, OS IME Telex/VNI, mobile thật, axe/Lighthouse, Google live/CORS/Sheets readback. Đây không phải năm gate được giao; không chép kết quả từ log vòng 15 cũ. Suite codex browser đã đối chiếu các golden fixtures, không tương đương chạy lại toàn bộ Python oracle.
- Không kiểm tay toàn bộ nội dung/đáp án bộ đề Lý, không nghiệm thu milestone/production. Probe nâng phiên bản kiểm module main.js; chưa chạy toàn bộ ma trận nâng cấp shell/CSS/public hoặc nhiều tab đang làm bài.
- recommended_action: worker sửa F01 ở build/worker và thêm browser regression nâng phiên bản cùng context; chạy lại gate và review snapshot mới. Không cần quyết định nghiệp vụ mới để sửa cache versioning; không tự bật dịch vụ hay thay luật chấm.
- assumptions: NONE về nghiệp vụ.
- privacy_notes: chỉ source, hashes và dữ liệu kiểm thử tổng hợp; không đưa hồ sơ riêng hoặc dữ liệu học sinh thật vào báo cáo.
