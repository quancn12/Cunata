# R10-TESTS-PRE — kiểm định chế độ tối

Ngày: 21/11/2026. Căn cứ: WEB-contract §24.7, §19, §21, §22; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md. HEAD khi bắt đầu: `58fc9d5704f62f02c7ab7be0b590cb3d12e7e797`.

Đây là bàn giao **test trước khi làm R10**, không phải nghiệm thu sản phẩm. Chỉ sửa test và báo cáo trong phạm vi được giao. Không build lại vì build ghi ngoài scope; kiểm định chính bản `dist/` hiện có. Working tree đã có thay đổi của người khác, trong đó có `src/app/main.ts`; giữ nguyên các thay đổi đó.

## Cách chạy và kiến trúc

Chạy tại `D:\Cunata`: `node --test ops/roadmap/tests/R10/`.

- `index.js` là entrypoint của lệnh chạy thư mục trên Node v24.14.0; ca thực tế nằm ở `theme.test.mjs`.
- Harness và app helper được import bằng `pathToFileURL(process.cwd() + '/test/claude-check/…')`. Khi chuyển bộ test sang `test/codex-check/feat/R10/`, giữ cả `local-server.mjs` và chạy từ gốc repo.
- Trình duyệt Chrome/Edge headless thật qua CDP của harness có sẵn. Mỗi ca có browser context sạch; giả lập `prefers-color-scheme` và viewport bằng CDP, không ghi trực tiếp preference vào storage hoặc sửa DOM sản phẩm.
- Thao tác bấm đi qua `app.mjs:mouseClick`, kiểm `hitsTarget` và tọa độ trong viewport. Tên học sinh được gõ tại cổng tên bằng `Input.insertText`; test kiểm lại tên ở bài thi. Không gán `value` bằng JavaScript. File đề kiểm định được nạp bằng file input ẩn, đúng ngoại lệ §21.
- `local-server.mjs` dùng `MemoryStore` thật và `src/api/handle.ts` thật: tạo Admin, giáo viên và lớp bằng các lời gọi lõi; HTTP cục bộ gọi lại cùng `handle` và cùng store. Cấu hình web được override tại HTTP thành API localhost. Chặn URL HTTPS từ trình duyệt; không đọc cấu hình production, không gọi Google/Vercel/Neon thật.
- Không khóa test vào tên key localStorage hay thuộc tính theme tự chế. Bộ chọn chấp nhận nút đổi vòng hoặc menu có nhãn Sáng/Tối/Theo máy.

## Ma trận ca kiểm định

Tên đầy đủ trong log đều bắt đầu `dist: [ui] R10:` hoặc `dist: [glue] R10:` và kết thúc bằng mục hợp đồng. Các hàng có tập giá trị được triển khai thành **từng ca riêng**.

| Ca / mô tả | Số ca | Căn cứ | Điều kiện đạt |
|---|---:|---|---|
| [glue] Bản build giữ nguyên bộ token sáng và tối | 1 | §24.7, §18; DESIGN §2 | Source có media query dark và dist mang nguyên tokens.css |
| Mặc định theo máy và đổi màu khi hệ điều hành đổi | 1 | §24.7; DESIGN §2 | Cả 16 token chuẩn ở light → dark → light, không có preference đã lưu |
| TopBar `{375,768,1440}px` có bộ chọn Sáng/Tối/Theo máy dùng được | 3 | §24.7 | Một `#btnTheme` trên TopBar; chọn được ba chế độ bằng chuột; Theo máy phản ứng với OS |
| TopBar `{teacher,admin}` cũng có bộ chọn chủ đề | 2 | §24.7, §19.1 | Bộ chọn có trên các vai còn lại, dùng được ở mobile |
| `{Sáng,Tối}` ghi đè theo máy, nhớ sau tải lại và mở trang mới | 2 | §24.7 | Lựa chọn thủ công thắng OS trái ngược; reload/tab mới giữ lựa chọn; trở về Theo máy rồi reload vẫn theo OS |
| [glue] Fixture lõi và HTTP dùng cùng handle với MemoryStore | 1 | §22, §24.7 | HTTP thấy lớp đã tạo bằng lời gọi lõi, không dùng backend giả thay hàm sản phẩm |
| WCAG AA `{student,teacher,admin}` × `{light,dark}` × `{375,768,1440}px` trên các màn và hộp thoại | 18 | §24.7, §9; DESIGN §2/6 | Nội dung hiển thị đo được, không có màu/nền chưa xử lý; chữ thường ≥4,5:1, chữ lớn ≥3:1, biên ô nhập ≥3:1 |
| **Tổng** | **28** | | |

Các màn được đi qua trong 18 ca tương phản:

- Học sinh: chọn vai, cổng tên, trang học sinh/trống, lỗi mã lớp, ngoại tuyến, làm bài I/II/III với phương án đã chọn và câu trả lời, xác nhận nộp, báo cáo có điểm/đáp án/lời giải.
- Giáo viên: đăng nhập, danh sách lớp, tạo lớp, chi tiết lớp, giao đề, bảng kết quả, thư viện đề, trình soạn đề.
- Admin: đăng nhập, bảng thống kê/tài khoản, tạo giáo viên, đặt lại mật khẩu.

Đo `getComputedStyle` trên text node, giá trị và placeholder của input; ghép nền alpha theo tổ tiên; xét dải nền gradient tuyến tính; cuộn phần tử vào viewport trước đo. Bỏ qua phần tử ẩn, disabled/inert và nội dung ngoài dialog đang mở. Các nền không xử lý được làm ca đỏ, không tính là đạt. Log chẩn đoán ghi screen/element/text/ratio/required/color/background và số mẫu; ảnh PNG tại `ops/roadmap/tests/R10/artifacts/` được chụp thật khi có lỗi.

## Kết quả thực chạy

Kết quả cuối được bổ sung sau khi hoàn tất hai lần chạy cùng bộ test.

## Lỗi sản phẩm được kiểm định

1. **Thiếu bộ chọn chế độ:** không có `#btnTheme` ở TopBar học sinh, giáo viên hoặc Admin. Các ca chọn chế độ và lưu lựa chọn đỏ ngay tại assertion số lượng nút, trước khi dùng thao tác cho tính năng chưa tồn tại. Chưa thể quan sát logic lưu preference vì UI này chưa làm.
2. **Tương phản sáng:** nhãn chọn đúng trên báo cáo khoảng **3,148:1**, nhãn đáp án đúng **3,296:1** (đều cần 4,5:1); phần trăm tổng **3,862:1** trên dải nền tổng điểm. Nút đóng builder **2,564:1** (cần 3:1 cho chữ lớn). Biên nhiều ô nhập khoảng **1,2–1,5:1**, dưới 3:1.
3. **Tương phản tối:** một số nội dung báo cáo kế thừa chữ sáng nhưng vẫn giữ nền trắng/xanh rất nhạt, ví dụ tiêu đề khoảng **1,174:1**, phương án đúng khoảng **1,122:1**. Placeholder tạo giáo viên khoảng **3,671:1**, cần 4,5:1; biên input tiếp tục dưới 3:1.

Các con số chi tiết của từng màn/viewport xem log acceptance, không suy từ bảng màu token. Bộ token theo OS đã có không chứng minh mọi màn đã dùng đúng token.

## Kiểm tra bổ sung và giới hạn

- `npx --no-install tsc -p tsconfig.json`: **exit 1**; `src/app/main.ts(2458,36) TS2345`: `string | null` không gán được cho `string`.
- `npx --no-install tsc -p tsconfig.web.json`: **exit 1**, cùng lỗi. Log: `typecheck.txt`, `typecheck-web.txt` trong thư mục test R10. Không sửa vì ngoài scope.
- Không npm install, dependency, commit hoặc deploy. Không đánh giá trình duyệt/OS/mobile vật lý khác, IME thật hoặc AT bằng bộ này.
- Đây là bộ đo contrast và hành vi theme trên các luồng hiện có, không phải chứng nhận WCAG toàn diện. Các màn tính năng R3–R9 chưa tồn tại đầy đủ trong snapshot phải được bổ sung vào lượt rà soát R10 sau khi các mục phụ thuộc hoàn thành; không gọi việc chưa thể mở các màn đó là PASS.
- Các log `diagnostic*`, `student-diagnostic*`, `admin-diagnostic*`, `development-run*`, `run-1.txt`, `final-run-1.txt` là khảo sát/phát triển, không phải hai lần nghiệm chứng cuối. Đã sửa lỗi test bấm giữa thẻ lớp vào nút copy ở desktop bằng cách bấm đúng `.class-name`; log acceptance mới là căn cứ bàn giao.

Không cần quyết định nghiệp vụ mới để viết các ca §24.7 này. Không đánh dấu R10 hoàn thành khi các ca đỏ chưa được sửa.
