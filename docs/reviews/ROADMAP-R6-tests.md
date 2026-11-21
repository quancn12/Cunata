# R6-TESTS-PRE — Kiểm định thống kê đề

Ngày đo: 21/11/2026. Task chỉ viết kiểm định, không triển khai sản phẩm.

## Phạm vi và căn cứ

- WEB-contract §24.3: Kết quả → chọn lớp + bài giao → `#examStats`; mỗi câu `.stat-row[data-qid]` có % đúng; Phần I có tỉ lệ từng phương án; Phần III có ba chuỗi trả lời sai phổ biến nhất; chỉ tính bài nộp hợp lệ.
- Ranh giới quyền, lọc lớp/bài giao, hạn nộp, gửi lại: §19.1–19.2, §22. Phần II chỉ đúng toàn câu khi đủ bốn ý; III so chuỗi chính xác theo Shared Product Contract §2.
- Đã đọc toàn bộ WEB-contract, Shared Product Contract v2.0, DESIGN.md, BANG-QUYET-DINH.md, LO-TRINH-V2.md. R6 phụ thuộc R5; đây là bộ test trước triển khai, không nghiệm thu R5/R6.
- HEAD lúc bắt đầu: `58fc9d5704f62f02c7ab7be0b590cb3d12e7e797`. Working tree đã có thay đổi của tác vụ khác. Không sửa hay hoàn tác chúng.

## Cách kiểm định và oracle

`ops/roadmap/tests/R6/support.mjs` nhập harness/app bằng URL tuyệt đối từ `process.cwd()`, nhập trực tiếp `handle` và memory store. HTTP adapter chỉ chuyển request vào cùng `handle`; không thay business response bằng mock. Browser chạy `dist/` có sẵn dưới `/Cunata/`, override cấu hình trong HTTP response tới API loopback; không sửa config hay build sản phẩm. Mọi nút dùng `app.mjs::mouseClick`, ô nhập dùng CDP bàn phím, select dùng chuột + bàn phím native; không gán value bằng JS, không nhét token vào storage. Không có luồng nhập tên học sinh trong test giáo viên; toàn bộ tên fixture là dữ liệu giả lập phía API.

Fixture: hai lớp; cùng đề giao ba lần trong lớp chính (20 bài, 1 bài đúng hết, 0 bài); lớp đối chứng có 1 bài đúng hết. Không gộp denominator theo examId.

| Câu | Oracle độc lập |
|---|---|
| I.1 | 20 bài: A=8, B=6, C=4, D=2 → đúng 40%; tỉ lệ 40/30/20/10%. Mảng options đảo thứ tự D/C/B/A, đối chiếu ID. |
| I.2 | 20 bài bỏ trống → đúng 0%, vẫn là câu cần thống kê. |
| II.1 | 4 bài đúng 4 ý; 6 bài đúng 3; 4 bài đúng 2; 2 bài đúng 1; 4 bài bỏ trống → đúng toàn câu 20%. |
| III.1 | key `1,5`: 4 đúng; sai `1,50`×6, `-1`×4, `77`×3, `999`×1; 2 bỏ trống → đúng 20%; top ba sai là `1,50`, `-1`, `77`. Không có đồng hạng. |

API fixture được nộp thật qua `handle`, không chèn dòng kết quả vào store. Sửa giờ assignment trong memory store chỉ phục vụ ca NOT_OPEN/PAST_DUE. Bài lỗi tổng điểm và request bị từ chối phải không làm tăng số bài. Gửi lại attempt giữ nguyên denominator. Assertion oracle không dùng implementation thống kê sản phẩm.

## Danh sách ca và hợp đồng

Tên đầy đủ nằm trong hai file `.test.mjs`, đều theo mẫu `dist: [api|teacher] R6: … (WEB-contract §…)`.

| # | Vùng / mô tả ca | Căn cứ | Kỳ vọng hiện tại |
|---|---|---|---|
| 1 | api / lọc đúng lớp và bài giao, không trộn cùng đề giao lần hai | §24.3, §19.2 | PASS |
| 2 | api / gửi lại cùng lượt không tăng số bài thống kê | §24.3, §22 | PASS |
| 3 | api / bài lỗi, chưa mở và quá hạn không vào nguồn thống kê | §24.3, §19.2 | PASS |
| 4 | api / giáo viên khác và khách không đọc được tập bài | §24.3, §19.2 | PASS |
| 5 | api / bài giao chưa ai nộp trả tập rỗng | §24.3 | PASS |
| 6 | api / HTTP cục bộ gọi cùng handle và store | §22, §24.3 | PASS |
| 7 | teacher / đối chứng đăng nhập, tải và render 20 bài qua HTTP handle | §22, §19.1, §24.3 | PASS |
| 8 | teacher / chọn lớp và bài giao hiện từng câu trong khung nhìn | §24.3 | RED: thiếu #examStats |
| 9 | teacher / phần trăm đúng gồm bài có câu bỏ trống | §24.3 | RED: thiếu #examStats |
| 10 | teacher / II đúng một phần không tính đúng toàn câu | §24.3; Shared §2 | RED: thiếu #examStats |
| 11 | teacher / I đủ tỉ lệ bốn phương án theo ID | §24.3 | RED: thiếu #examStats |
| 12 | teacher / III ba đáp án sai phổ biến, giữ nguyên chuỗi | §24.3; Shared §2 | RED: thiếu #examStats |
| 13 | teacher / gửi lại và bài bị từ chối không đổi thống kê | §24.3, §22 | RED: thiếu #examStats |
| 14 | teacher / đổi lớp, đổi bài giao cùng đề không giữ số liệu cũ | §24.3 | RED: thiếu option bài giao lặp |
| 15 | teacher / bài giao rỗng không NaN hay số liệu cũ | §24.3 | RED: thiếu option bài giao rỗng cùng đề |

## Kết quả thực đo

Đang hoàn tất hai lượt chạy cuối; không dùng kết quả chẩn đoán thay cho exit code hoàn chỉnh.

## Giới hạn và phát hiện

- Quan sát browser đối chứng đã tải 20 dòng kết quả; `browser-statistics.png` và `browser-observation.json` ghi màn Kết quả thật, `stats: null`. Chưa thể đi qua các assertion số liệu và viewport của thống kê vì sản phẩm chưa có panel.
- `src/teacher/portal.ts::syncExamSelectOptions` dùng `seenExamIds` nên các bài giao cùng đề chỉ có một option. Hai ca cuối bắt lỗi thiếu khả năng chọn bài giao, trước khi kiểm số liệu của bài đó.
- Không bịa API thống kê mới: hợp đồng không đặt tên action/DTO riêng cho F4. Các ca API kiểm tập dữ liệu hiện có qua `listResults`; số liệu F4 được kiểm qua giao diện.
- Node v24.14.0, Windows, Chrome/Edge headless qua harness CDP, viewport 1440×1000. Chưa kiểm mobile/theme/IME/AT, Neon thật, triển khai hay hồi quy toàn dự án. Không tuyên bố PASS các phần này.
- Không chạy build vì chỉ được ghi vào scope kiểm định; đã dùng bản dist có sẵn. Hash các entrypoint kiểm trong `snapshot.json`.
- Typecheck cả hai cấu hình đã chạy, đều exit 1: `src/app/main.ts(2458,36) TS2345`, `string | null` không gán được cho `string`. File ngoài scope và đã có thay đổi trước task; không sửa trong task này.
- Lượt chẩn đoán đầu hoàn tất 15 ca nhưng treo khi đóng browser; lưu riêng `diagnostic-teardown.log`, không coi là lượt chạy cuối. Đã giới hạn chờ `browser.close()` ở teardown; không bỏ qua lỗi feature/assertion. Ca đối chứng riêng sau điều chỉnh exit 0, pass 1/fail 0.

Không npm install, không dependency mới, không commit, không deploy, không đọc prod_config, không gọi Google/Vercel/Neon thật. Chỉ ghi trong hai phạm vi task cho phép.
