# FX66-api — kiểm tra lại API16

- Baseline: `2e92074f1ee4225d9ae1ef7c452015eb42085266`.
- Phạm vi: `src/api/**`, `test/api/**`; không sửa mã sản phẩm hoặc test kiểm định độc lập.
- Lỗi được giao: `ops/fix/round66/failures-api.txt`, API16 báo `Trang không tải xong trong 20000 ms`.

## Bằng chứng

| Lệnh | Exit | Pass | Fail | Skip |
| --- | --- | --- | --- | --- |
| `node --test "test/codex-check/**/*.test.mjs"` | 1 | 196 | 1 (+1 cancelled) | 0 |
| `node --test --test-name-pattern="API16" test/codex-check/feat/R1/api.test.mjs` | 0 | 1 | 0 | 0 |
| `node --test test/codex-check/feat/R1/api.test.mjs` | 0 | 22 | 0 | 0 |
| `node --test test/api/api.test.ts` | 0 | 7 | 0 | 0 |
| `npx --no-install tsc -p tsconfig.json` | 0 | — | — | — |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | — | — | — |

API16 hoàn thành trong 1486,9894 ms ở lần chạy riêng và 6406,4228 ms ở lần chạy cả file API, trong lúc bộ kiểm định toàn cục đang chạy. Cả file API: 22/22, 46988,3083 ms. Lệnh toàn cục: 198 tests, 196 pass, 1 fail, 1 cancelled, 296857,662 ms.

## Blocker ngoài scope

- Lệnh toàn cục tái hiện lỗi API16 nhưng tại bước sớm hơn lỗi cũ: `Trình duyệt không mở được cổng debug trong 20 giây`, `test/claude-check/harness.mjs:78`, được gọi ở `test/codex-check/feat/R1/api.test.mjs:235`. Trình duyệt chưa khởi tạo xong, chưa gọi `page.goto`, chưa có request đăng nhập từ trình duyệt. API16 mất 31731,7313 ms.
- API19 bị cancelled: `test timed out after 45000ms`; không có bằng chứng từ output này để quy lỗi cho backend.
- Vùng liên quan: khởi chạy/điều phối trình duyệt của bộ kiểm định (`test/claude-check/harness.mjs`, `test/codex-check/feat/R1/api.test.mjs`) và môi trường chạy toàn bộ suite. Hai thư mục này bị cấm sửa. Không có thay đổi trong `src/api/**` có thể sửa việc Chrome chưa mở cổng debug.
- Áp lực tài nguyên/chạy đồng thời là khả năng cần điều phối kiểm tra, chưa được chứng minh là nguyên nhân gốc của lỗi cũ. Không tăng timeout, không giảm assertion, không sửa bộ kiểm định.
- Bàn giao: **BLOCKED**. Điều phối cần kiểm tra môi trường/concurrency/browser lifecycle ngoài scope rồi chạy lại đúng lệnh toàn cục; không coi 22/22 của lần chạy riêng là toàn bộ gate xanh.

## Phân tích và giới hạn

- Trong `test/codex-check/feat/R1/api.test.mjs`, API16 gọi `page.goto(...)` trước các thao tác chọn vai, nhập tài khoản và gửi `teacherLogin`. Lỗi được giao xuất phát từ bộ đếm chờ `Page.loadEventFired` trong `test/claude-check/harness.mjs`, chưa phải assertion phản hồi API.
- Lỗi chờ tải trang cũ không tái hiện trong các lần chạy trên; lần toàn cục lỗi ở bước khởi chạy Chrome. Chưa xác định được nguyên nhân gốc của timeout trong lần kiểm định cũ; không kết luận đã sửa lỗi, không sửa API theo suy đoán.
- Giả định nghiệp vụ: NONE. Không đổi quy tắc chấm điểm, không thêm dependency, không commit/deploy.
- Trình duyệt của các test API có timeout và đóng context/browser/server trong `finally`.
