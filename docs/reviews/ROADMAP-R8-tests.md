# R8-TESTS-PRE — Kiểm định trước khi làm Luyện lại câu sai

Ngày: 21/11/2026. Snapshot HEAD khi bắt đầu kiểm lại: `9a1b0e1eb3d52bb7e144a55b3901d4a359b09b41`. Kế thừa và rà soát bộ test R8 đã có; giữ nguyên các assertion, chạy lại toàn bộ và thay bằng chứng dở của lần trước bằng kết quả đo trong phiên này.

Phạm vi: chỉ `ops/roadmap/tests/R8/**` và báo cáo này. Không sửa sản phẩm, không build lại `dist/` vì nằm ngoài phạm vi ghi, không cài dependency, không commit, không deploy. Working tree đã có thay đổi của tiến trình khác; không sửa hoặc hoàn tác chúng. Mã băm source, bản build đang kiểm và bộ test được ghi trong `ops/roadmap/tests/R8/snapshot.txt` và `snapshot-final.txt`; toàn bộ file được ghi nhận giữ nguyên hash giữa hai snapshot của hai lượt cuối. Kết quả trình duyệt áp dụng cho bản `dist/` sẵn có; không chứng nhận tính tương đương giữa source và bản build.

Căn cứ: Shared Product Contract v2.0; WEB-contract §24.5, §20–23 và quy tắc tại §2/§9; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md (R8 phụ thuộc R4, R7). Không tự thêm API luyện lại, quy tắc tính điểm hoặc chính sách hết lượt mới.

## Thiết kế kiểm định

- `index.js` hỗ trợ đúng lệnh thư mục của Node 24; các ca nằm trong `retry.test.mjs`. Chỉ helper cùng thư mục được import tương đối; harness và app được import bằng `pathToFileURL(process.cwd() + '/test/claude-check/…')`, nên chuyển nguyên thư mục sang `test/codex-check/feat/R8/` vẫn dùng được từ gốc dự án.
- `support.mjs`: máy chủ Node HTTP cục bộ chuyển RPC vào chính `src/api/handle.ts`, dùng `createMemoryStore()` thật. Máy chủ tĩnh phục vụ bản `dist/` sẵn có; cấu hình được ghi đè trong HTTP response, không sửa file cấu hình. Không dùng Apps Script giả làm bằng chứng cho máy chủ Node.
- Trình duyệt Chrome/Edge headless thật qua CDP của harness có sẵn; mỗi ca dùng context sạch. Mọi thao tác bấm dùng `mouseClick` sau khi kiểm hình chữ nhật nằm trong viewport và hit-test không bị che. Nhập tên tại cổng tên; nhập văn bản bằng CDP, không gán `value` bằng JS. Đề tổng hợp nạp bằng file input ẩn được §21 cho phép, dùng tên đã nhập; không bịa học sinh thật.
- Giới hạn riêng bước đóng trình duyệt ở 5 giây: CDP có thể đóng kết nối trước khi trả lời `Browser.close`. Cả hai lượt nghiệm chứng phải kết thúc tự nhiên và có tổng kết node:test cùng exit code; không bỏ qua hay đổi assertion sản phẩm.
- Sửa helper điều hướng riêng R8: chờ đúng origin/đường dẫn/query và `document.readyState === 'complete'`, giới hạn 60 giây qua CDP; route vẫn được xác nhận bằng bước chờ màn hình ứng dụng. Không sửa harness chung và không retry ca hay thao tác. Hai lượt chẩn đoán trước chỉnh sửa lưu ở `diagnostic-before-wait-fix-1.txt` (2 pass/7 fail, exit 1) và `diagnostic-before-wait-fix-2.txt` (1 pass/8 fail, exit 1); lượt thứ hai có hai lỗi tải trang quá 20 giây, nên không dùng nó để chứng minh tất cả ca R8 đỏ do thiếu tính năng. Một lượt thử helper so sánh cả hash đã bị dừng vì ứng dụng tự cập nhật hash lúc khởi động (`diagnostic-url-wait-aborted.txt`); không tính lượt đó vào kết quả nghiệm chứng.
- Mọi RPC trỏ localhost; chặn HTTPS và các miền Google/Vercel/Neon trong trình duyệt. Không đọc `ops/prod_config.json`, không gọi dịch vụ thật.
- Đề kiểm định: 3 câu I (đúng/sai/trống), 4 câu II (đúng đủ 4 ý/đúng 3 ý/sai cả 4 ý/trống), 3 câu III (`1,5` đúng / `1,50` sai so với `1,5` / trống). Tổng gốc `3,50/10`: I `0,25/0,75`, II `1,50/4`, III `1,75/5,25`. Lượt luyện dự kiến đúng 7 câu; II đạt 0,50 không phải đúng hoàn toàn. Có ca riêng bỏ trống cả 10 câu.

## Danh sách ca và đối chiếu hợp đồng

Tên đầy đủ trong mã/log đều theo mẫu `dist: [report|student] R8: … (WEB-contract §…)`.

| # | Vùng / mô tả ca | Căn cứ và điều kiện kiểm |
|---|---|---|
| 1 | report — đối chứng báo cáo gốc đủ ba phần, đã gửi máy chủ cục bộ | §20/§24.5: 10 thẻ, điểm 3,50/10, giữ chuỗi sai `1,50`; API và IndexedDB thực sự có bản gốc |
| 2 | report — nút luyện lại tại 1440px | §24.5: báo cáo có `#btnRetryWrong`, thấy/bấm bằng chuột thật và mở lượt luyện; §9 không tràn ngang |
| 3 | report — nút luyện lại tại 375px | §24.5: như ca 2 ở viewport điện thoại |
| 4 | student — chỉ lấy câu sai/bỏ trống | §24.5: đúng 7 ID, gồm II chưa đúng trọn vẹn và III khác từng ký tự; loại cả 3 câu đúng hoàn toàn |
| 5 | student — bài gốc bỏ trống toàn bộ | §24.5: lấy đủ 10 câu; không biến ý II bỏ trống thành đáp án false |
| 6 | student — lượt mới, phản hồi trống, nội dung nguyên vẹn | §24.5/§20: không kế thừa câu trả lời, giữ toàn văn câu/phương án/mệnh đề; nộp trắng được 0 điểm; mã báo cáo mới khác mã gốc |
| 7 | report — thông báo rõ ràng | §24.5: chữ nhìn thấy “Luyện lại câu sai — không gửi giáo viên” trên màn luyện |
| 8 | student — không gửi lượt luyện, giữ kết quả gốc | §24.5: không có submitResult mới khi luyện/nộp/reload/online; store giữ nguyên cả dòng; IndexedDB giữ nguyên bản nộp; không tạo outbox gửi luyện; mở lại báo cáo gốc giữ điểm/câu trả lời |
| 9 | report — đối chứng lõi handle + memory store | §22/§24.5: gửi lại cùng bản nộp không nhân dòng; đổi điểm/phản hồi cùng attempt bị PAYLOAD_CONFLICT; bản gốc không đổi |

## Kết quả thực chạy

Lệnh chạy từ `D:\Cunata`: `node --test ops/roadmap/tests/R8/`, Node `v24.14.0`, Windows, trình duyệt Chrome headless thật qua CDP.

| Lượt | Exit | Tổng | Pass | Fail | Skip / Cancel | Thời gian node:test | Nhật ký |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 9 | 2 | 7 | 0 / 0 | 37.390 giây | `ops/roadmap/tests/R8/run-1.txt` |
| 2 | 1 | 9 | 2 | 7 | 0 / 0 | 18.087 giây | `ops/roadmap/tests/R8/run-2.txt` |

**Cả hai lượt cuối:** ca **1 và 9 PASS**. Các ca **2–8 FAIL** tại assertion `WEB-contract §24.5: NOT_IMPLEMENTED — báo cáo phải có #btnRetryWrong để mở lượt luyện mới chỉ gồm câu sai/bỏ trống` (hàm `retry` trong `support.mjs`). Mỗi ca đã thực sự tạo bài gốc và nhận xác nhận từ máy chủ cục bộ trước khi tới assertion này. Đây là lỗi thiếu điểm vào của tính năng; không phải lỗi import, máy chủ, cổng tên, thao tác chuột hay timeout. Không có lỗi setup, hook, timeout, skip hoặc cancel trong hai lượt cuối. Những assertion phía sau điểm vào còn đỏ chưa được thực thi.

Typecheck đã chạy thật từ gốc dự án:

- `npx --no-install tsc -p tsconfig.json`: exit **0**, không diagnostic; log `typecheck-node.txt`.
- `npx --no-install tsc -p tsconfig.web.json`: exit **0**, không diagnostic; log `typecheck-web.txt`.

## Giới hạn và bàn giao

Các ca hành vi luyện lại phải đi qua nút công khai của sản phẩm. Khi nút chưa tồn tại, assertion đầu vào báo `NOT_IMPLEMENTED` và các assertion phía sau chưa được thực thi; không coi việc giữ kết quả/không gửi/lọc đúng câu là đã xác minh. Hai ca đối chứng độc lập giúp phân biệt thiếu R8 với lỗi chuẩn bị bài, tính điểm hoặc máy chủ kiểm định.

Ca không gửi được thiết kế để quan sát trong lúc thao tác, chờ 1,2 giây sau nộp, reload và chờ 1,8 giây sau offline/online; thêm kiểm outbox bền vững. Nhánh này chưa chạy vì thiếu nút vào luyện lại. Không khẳng định chứng minh không có bất kỳ request nào ở mọi thời điểm tương lai. RPC đọc dữ liệu chung khi khởi động lại không bị coi là gửi bài luyện.

Build, toàn bộ suite Claude, kiểm thử dịch vụ thật và nghiệm thu sản phẩm: **NOT_RUN**, ngoài yêu cầu test trước R8 và/hoặc ngoài phạm vi ghi. Không tuyên bố R8 đã hoàn thành. Rà soát độc lập sau khi thực hiện sản phẩm vẫn cần theo lộ trình. Không có quyết định nghiệp vụ mới cần tự chốt trong bộ kiểm định này.
