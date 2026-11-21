# R8-TESTS-PRE — Kiểm định trước khi làm Luyện lại câu sai

Ngày: 21/11/2026. Snapshot HEAD khi kiểm lại và hoàn tất bàn giao: `58fc9d5704f62f02c7ab7be0b590cb3d12e7e797`. Kế thừa bộ test R8 đang có trong working tree và hoàn tất lại bằng chứng, không coi nhật ký dở của lần trước là kết quả đã hoàn thành.

Phạm vi: chỉ `ops/roadmap/tests/R8/**` và báo cáo này. Không sửa sản phẩm, không build lại `dist/` vì nằm ngoài phạm vi ghi, không cài dependency, không commit, không deploy. Working tree đã có thay đổi của tiến trình khác; không sửa hoặc hoàn tác chúng. Mã băm source, bản build đang kiểm và bộ test được ghi trong `ops/roadmap/tests/R8/snapshot.txt` và `snapshot-final.txt`. Giữa hai snapshot, `src/app/main.ts` bị thay đổi bên ngoài task; API lõi, memory store, `dist/app/main.js`, `dist/index.html` và hợp đồng giữ cùng hash. Kết quả trình duyệt áp dụng cho bản `dist/` sẵn có, không chứng nhận source vừa thay đổi đã được build hay review.

Căn cứ: Shared Product Contract v2.0; WEB-contract §24.5, §20–23 và quy tắc tại §2/§9; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md (R8 phụ thuộc R4, R7). Không tự thêm API luyện lại, quy tắc tính điểm hoặc chính sách hết lượt mới.

## Thiết kế kiểm định

- `index.js` hỗ trợ đúng lệnh thư mục của Node 24; các ca nằm trong `retry.test.mjs`. Chỉ helper cùng thư mục được import tương đối; harness và app được import bằng `pathToFileURL(process.cwd() + '/test/claude-check/…')`, nên chuyển nguyên thư mục sang `test/codex-check/feat/R8/` vẫn dùng được từ gốc dự án.
- `support.mjs`: máy chủ Node HTTP cục bộ chuyển RPC vào chính `src/api/handle.ts`, dùng `createMemoryStore()` thật. Máy chủ tĩnh phục vụ bản `dist/` sẵn có; cấu hình được ghi đè trong HTTP response, không sửa file cấu hình. Không dùng Apps Script giả làm bằng chứng cho máy chủ Node.
- Trình duyệt Chrome/Edge headless thật qua CDP của harness có sẵn; mỗi ca dùng context sạch. Mọi thao tác bấm dùng `mouseClick` sau khi kiểm hình chữ nhật nằm trong viewport và hit-test không bị che. Nhập tên tại cổng tên; nhập văn bản bằng CDP, không gán `value` bằng JS. Đề tổng hợp nạp bằng file input ẩn được §21 cho phép, dùng tên đã nhập; không bịa học sinh thật.
- Giới hạn riêng bước đóng trình duyệt ở 5 giây: CDP có thể đóng kết nối trước khi trả lời `Browser.close`. Lượt chẩn đoán ban đầu đã trả đủ 9 ca nhưng chưa thoát, được ngắt và không tính vào hai lượt nghiệm chứng; không bỏ qua hay đổi assertion sản phẩm.
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

Đang cập nhật hai lượt chạy hoàn chỉnh. Nhật ký cuối được lưu ở `ops/roadmap/tests/R8/run-1.txt` và `run-2.txt`.

Typecheck đã chạy thật từ gốc dự án:

- `npx --no-install tsc -p tsconfig.json`: exit **0**, không diagnostic; log `typecheck-node.txt`.
- `npx --no-install tsc -p tsconfig.web.json`: exit **0**, không diagnostic; log `typecheck-web.txt`.

## Giới hạn và bàn giao

Các ca hành vi luyện lại phải đi qua nút công khai của sản phẩm. Khi nút chưa tồn tại, assertion đầu vào báo `NOT_IMPLEMENTED` và các assertion phía sau chưa được thực thi; không coi việc giữ kết quả/không gửi/lọc đúng câu là đã xác minh. Hai ca đối chứng độc lập giúp phân biệt thiếu R8 với lỗi chuẩn bị bài, tính điểm hoặc máy chủ kiểm định.

Ca không gửi quan sát trong lúc thao tác, chờ 1,2 giây sau nộp, reload và chờ 1,8 giây sau offline/online; thêm kiểm outbox bền vững. Không khẳng định chứng minh không có bất kỳ request nào ở mọi thời điểm tương lai. RPC đọc dữ liệu chung khi khởi động lại không bị coi là gửi bài luyện.

Build, toàn bộ suite Claude, kiểm thử dịch vụ thật và nghiệm thu sản phẩm: **NOT_RUN**, ngoài yêu cầu test trước R8 và/hoặc ngoài phạm vi ghi. Không tuyên bố R8 đã hoàn thành. Rà soát độc lập sau khi thực hiện sản phẩm vẫn cần theo lộ trình. Không có quyết định nghiệp vụ mới cần tự chốt trong bộ kiểm định này.
