# FX64-ui

Base: `7ad78209868cb3cb99da0cbd85cde4f683b29f43`.

## Phạm vi và nguyên nhân

- Sửa duy nhất sản phẩm `src/ui/components.css`: cho khối thương hiệu/tiêu đề co theo khung; cho nội dung mệnh đề co và xuống dòng; dưới 640px chuyển hàng Đúng/Sai thành hai cột, đưa nhóm nút xuống hàng tiếp. Không che overflow toàn trang, không thu nhỏ chữ hay vùng bấm.
- Trước sửa: EX-HS-01 và EX-HS-03 đều đỏ; trang 390px có innerWidth 438px. Đo DOM xác nhận tiêu đề vượt tới 404,66px, nhóm Đúng/Sai vượt tới 437,67px. Trang bị thu nhỏ làm tọa độ nhấp số câu sai.
- Sau sửa CSS: innerWidth 390px, không phần tử tràn. Nút số câu nhận cú bấm; còn căn giữa câu khiến đầu câu ở 136,81px, bị thanh trên cao 221px che.
- Nguyên nhân cuộn còn lại nằm ở `src/app/main.ts`: `scrollIntoView({block:'center'})`. Worker khác đã sửa file đó trong cùng working tree: đóng bảng số câu, tính scroll margin theo thanh trên, chuyển focus và cuộn `block:'start'`. FX64-ui không sửa file ngoài scope. Kết quả cuối kiểm tra bản tích hợp chứa thay đổi đó.

## Giả định

Không thêm quyết định nghiệp vụ. Giữ DOM, thứ tự câu, nội dung và quy tắc chấm điểm. Chấp nhận thay đổi tích hợp của worker khác như nguồn đầu vào cho kiểm định cuối; không nhận là thay đổi của FX64-ui.

## Kiểm tra thực chạy

- `node scripts/web-build.ts`: exit 0, 339 files được promote ở lần build cuối.
- `node --test --test-timeout=120000 --test-name-pattern="EX-HS-01|EX-HS-03" test/claude-check/student-explore.test.mjs`: exit 0, pass 2, fail 0.
- `node --test "test/claude-check/**/*.test.mjs"`: lượt đầu exit 1, pass 93, fail 1 (EX-HS-02 đọc bản build chưa có thay đổi đánh dấu của worker app). Sau build tích hợp chạy lại đúng lệnh: exit 0, pass 94, fail 0, skip 0, 158722,59ms. Log: `fx64-claude-final.log`; giữ log lượt đầu `fx64-claude.log` để phân biệt.
- `node --test --test-timeout=180000 "test/claude-check/design.test.mjs"`: exit 0, pass 11, fail 0, skip 0; `fx64-design.log`.
- `node test/ui/fx64-responsive.mjs`: exit 0, sáu kiểm tra PASS: 320/375/390/768/1440px không tràn; Enter mở bảng số câu, Esc đóng và trả focus. `fx64-responsive.log`. Trình duyệt đóng trong finally, có timeout.
- `npx --no-install tsc -p tsconfig.json`: exit 0.
- `npx --no-install tsc -p tsconfig.web.json`: exit 0.
- `git diff --check -- src/ui test/ui`: exit 0.

Ảnh thật `fx64-{375,768,1440}-{light,dark}.png` đã được xem trực tiếp. Bố cục không tràn. Phát hiện ngoài hai lỗi được giao: thanh đầu trang giữ nền sáng ở chế độ tối, chữ thương hiệu và ô tên tương phản kém (quy tắc nền/chữ kế thừa trong `styles/style.css`); chưa sửa vì không thuộc hai lỗi và file gốc ngoài scope. Không chứng nhận toàn bộ dark mode đạt AA. Trạng thái loading/empty/error/offline không có thay đổi trong task này và chưa kiểm tra thủ công riêng.

Không npm install, không thêm dependency, không sửa scorer, không commit, không deploy. Không chỉnh nội dung test trong test/claude-check hoặc test/codex-check. Các thay đổi sản phẩm của FX64-ui chỉ nằm trong src/ui; script, log và ảnh nằm trong test/ui.
