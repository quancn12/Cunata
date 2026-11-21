# EXPLORE-hs — Thi thử như học sinh lần đầu

Ngày kiểm tra: 21/11/2026. Snapshot HEAD lúc bắt đầu: `3ebdd2860600592b542f1926d476ab9d16a21edf`. Working tree có thay đổi của các tác vụ khác; không commit, không sửa mã sản phẩm. Đây là báo cáo trải nghiệm bản build cục bộ, không phải nghiệm thu production.

Môi trường: Windows, Node v24.14.0, Chrome headless 157.0.8103.79, CDP thật. Ba viewport CSS: điện thoại 390×844, laptop 1366×768, màn rộng 1920×1080; tỷ lệ điểm ảnh 1. Chạy `classroomServer(dist)`, `seedTeacher`, `seedClass` với ba đề giữ nguyên từ `public/exams`: Toán đầy đủ I/II/III (`toan-full.json`), Hóa 3 câu (`hoa-repeating.json`), Vật lí 12 đề 10 (`ly12/de10.json`). Tên học sinh và lớp đều giả lập. Bản đang chạy dùng cổng tự nhập tên, không hiện chọn danh sách/PIN; không thay thế backend hoặc tự thêm luồng PIN.

Script: [explore.test.mjs](../../ops/explore/hs/explore.test.mjs). Mọi thao tác bấm dùng `mouseClick`/`Input.dispatchMouseEvent`, nhập qua CDP `Input.insertText`; không gọi `.click()` trong DOM để đi tắt. Ảnh là `Page.captureScreenshot` tại viewport, không ghép thành bằng chứng. Các file `phone.json`, `laptop.json`, `wide.json` lưu chữ hiển thị và vị trí bấm theo từng bước; HTML tải về được giữ trong cùng thư mục.

## Vấn đề quan sát được

| Mã | Màn/bước | Cỡ màn | Thấy gì (cụ thể) | Vì sao khó chịu với học sinh | Mức | Ảnh |
|---|---|---|---|---|---|---|
| EX-HS-01 | Làm bài Toán, chọn đáp án và mở số câu | 390×844 | Xuất hiện thanh cuộn ngang ở đáy; chiều rộng nội dung đo được 438px với viewport 390px. Tiêu đề trên cùng bị cắt ở mép phải; thanh điều khiển chiếm khoảng 220px chiều cao. Trang học sinh trước đó không có phần tràn này. | Phải kéo ngang khi đang làm bài; vùng đọc câu hỏi còn hẹp và thấp. | Vừa | [Màn thi](../../ops/explore/hs/shots/phone-08-choice-flag.png), [bảng số câu](../../ops/explore/hs/shots/phone-09-palette.png) |
| EX-HS-02 | Tìm cách đánh dấu câu để quay lại | Cả ba cỡ | Bảng số câu có chú giải “Đánh dấu”, nhưng trên câu hỏi và bảng số câu không thấy nút để đánh dấu. Kiểm tra các nút hiện trong DOM cũng không có thao tác này. Không thực hiện được bước đánh dấu. | Học sinh thấy một trạng thái được giới thiệu nhưng không biết bật ở đâu; không lưu được câu muốn xem lại bằng thao tác đó. | Vừa | [Điện thoại](../../ops/explore/hs/shots/phone-09-palette.png), [câu hỏi và bảng số câu laptop](../../ops/explore/hs/shots/laptop-08-choice-flag.png) |
| EX-HS-03 | Bấm số 5 trong danh sách câu | 390×844 | Tấm số câu đóng, trang nhảy tới các ý a–d của câu 5 nhưng không thấy số câu và đề dẫn. Thanh đầu trang vẫn chiếm phần trên; phải cuộn ngược lên để đọc câu hỏi chung. Ảnh chụp ngay sau bấm và đợi cuộn kết thúc, không tự cuộn ảnh về thẻ câu. | Vừa chuyển câu đã phải tìm lại đề dẫn, dễ trả lời các ý khi chưa đọc điều kiện chung. | Vừa | [Ngay sau chuyển câu](../../ops/explore/hs/shots/phone-10-navigation.png) |
| EX-HS-04 | Xác nhận nộp sau khi trả lời rồi tải lại trang | Cả ba cỡ | Đã chọn B câu 1, chọn đủ bốn ý câu 5 và điền `1,5` câu 7. Bảng số câu tô ba ô đã làm, nhưng hộp xác nhận ghi “Bạn đã làm 0/8 câu”. Kết quả sau đó vẫn có câu trả lời và điểm phần II 0,50; không quan sát thấy mất các câu trả lời này. | Tưởng bài chưa được ghi nhận, không dám nộp hoặc phải đóng hộp để kiểm tra lại. | Vừa | [Xác nhận và bảng số câu](../../ops/explore/hs/shots/wide-14-confirm.png), [kết quả](../../ops/explore/hs/shots/laptop-14-result.png) |
| EX-HS-05 | Xem trước rồi bắt đầu đề Hóa | Cả ba cỡ | Thẻ và hộp xem trước ghi “3 câu · 50 phút”; ngay khi vào bài, đồng hồ là `15:00`. File đề gốc cũng đặt 15 phút. | Dự tính có 50 phút nhưng thực tế chỉ có 15 phút, làm sai kế hoạch thời gian. Quan sát này thuộc đường Apps Script giả lập được giao, chưa suy rộng sang Vercel. | Vừa | [Xem trước](../../ops/explore/hs/shots/laptop-18-second-preview.png), [bắt đầu làm](../../ops/explore/hs/shots/laptop-19-second-exam.png) |
| EX-HS-06 | Đọc mô tả xem trước đề minh họa | Cả ba cỡ | Đề Hóa chỉ có ba câu trả lời ngắn, tiêu đề ghi “Tùy Chỉnh Minh Họa”, nhưng mô tả lại nói “Đề luyện tập 3 câu theo cấu trúc tốt nghiệp THPT”. Đề Toán tám câu cũng có câu mô tả tương tự. | Dễ hiểu nhầm đề minh họa ngắn là một đề có cấu trúc thi tốt nghiệp đầy đủ. | Nhẹ | [Hóa](../../ops/explore/hs/shots/laptop-18-second-preview.png), [Toán](../../ops/explore/hs/shots/laptop-06-preview.png) |

## Luồng đã đi và kiểm chứng

Mở web → chọn Học sinh → nhập “Nguyễn Minh Anh” → nhập sai mã `ZZZZZZ` → nhận “Không tìm thấy lớp” ngay dưới ô → nhập mã đúng → thấy ba đề → xem trước Toán → chọn phương án, chọn Đúng/Sai, điền số → chuyển bằng danh sách số câu → tìm thao tác đánh dấu (không có, EX-HS-02) → tải lại khi đang làm → xác nhận `1,5` còn nguyên → nộp → xem điểm, đáp án và lời giải I/II/III → tải HTML → về trang học sinh → làm và nộp Hóa → về trang học sinh, tải lại → mở thẻ Toán “Xem kết quả” → xem lại kết quả cũ → mở đề Vật lí 10.

Các ca kiểm tra thành công việc đi qua luồng không đồng nghĩa giao diện không có lỗi: các vấn đề trong bảng được ghi từ ảnh và trạng thái thực tế, không dùng assertion để hợp thức hóa chúng. Không kiểm quá sâu từng câu; đề Vật lí chỉ mở và đọc giao diện, không nộp toàn bộ 28 câu. Không kiểm IME Telex/VNI của hệ điều hành, máy điện thoại thật, Google/Vercel/Neon thật hoặc các dịch vụ production. Không triển khai, không cài gói.

## Lệnh và kết quả

- `node scripts/web-build.ts`: exit 0, emit 339 file vào `dist/` theo lệnh task.
- `npx --no-install tsc -p tsconfig.json`: exit 0; log `ops/explore/hs/typecheck-main.log`.
- `npx --no-install tsc -p tsconfig.web.json`: exit 0; log `ops/explore/hs/typecheck-web.log`.
- `node --test --test-force-exit ops/explore/hs/explore.test.mjs`: exit 1, pass 2 fail 1; laptop và màn rộng hoàn thành, điện thoại timeout tải trang trước bước chọn vai (`Trang không tải xong trong 20000 ms`). Log `ops/explore/hs/run-final.log`. Không coi timeout này là lỗi sản phẩm đã xác minh.
- `node --test --test-force-exit --test-name-pattern phone ops/explore/hs/explore.test.mjs`: exit 0, pass 1 fail 0, skip 0; chạy lại điện thoại hoàn thành toàn bộ luồng. Log `ops/explore/hs/run-phone.log`. Kết quả cuối cùng: đủ cả ba viewport, 82 ảnh theo bước (28 điện thoại, 27 laptop, 27 màn rộng). Không gọi lượt chạy đầu là PASS.
- `node --test --test-force-exit test/claude-check/design.test.mjs`: exit 1, pass 10 fail 1, skip 0. Ca màn chọn vai 375px timeout tải trang 20 giây; các ca còn lại qua. Log `ops/explore/hs/design.log`.
- `node --test --test-force-exit --test-name-pattern '375px màn chọn vai' test/claude-check/design.test.mjs`: exit 0, pass 1 fail 0, skip 0. Log `ops/explore/hs/design-retry.log`. Chạy lại đúng ca lỗi để phân biệt timeout với assertion thiết kế; không xóa kết quả lỗi ban đầu.

Các log `run.log`, `run-2.log`, `run-3.log` giữ dấu vết phát triển script: ban đầu selector đánh dấu không tồn tại; selector palette không có `data-qid`; sau đó script dùng nhầm nút quay về đang ẩn trên màn kết quả. Đã điều chỉnh script theo DOM quan sát được, không sửa ứng dụng để làm test qua. Bước đánh dấu vẫn không làm được và được ghi EX-HS-02. Các ảnh `*-ERROR.png` là ảnh ở lượt dừng trước, không thuộc bộ 82 ảnh hoàn tất. Ba ảnh `*-contact.png` chỉ là bảng thu nhỏ để kiểm tra bố cục tổng thể, không thay ảnh gốc làm bằng chứng.

NOT_RUN: bộ unit/domain/oracle toàn dự án (task quan sát trải nghiệm, không thay mã sản phẩm); màn 768px, kiểm toàn bộ sáng/tối và keyboard-only; IME hệ điều hành; đo hiệu năng có kiểm soát; dịch vụ production. Không suy kết quả local giả lập thành xác nhận thu bài trên dịch vụ thật. Source của tác vụ khác có thay đổi trong phiên, vì vậy đây là bằng chứng working tree tại thời điểm chụp, không phải gate cho một commit phát hành bất biến.

## Ba điều tốt nhất

1. Nhập sai mã lớp có lời giải thích tiếng Việt rõ, ngay dưới ô; sửa mã rồi vào lại được, không rơi vào ngõ cụt. [Ảnh](../../ops/explore/hs/shots/phone-04-wrong-code.png).
2. Trả lời ngắn giữ nguyên `1,5` sau tải lại; câu đã chọn và các ý Đúng/Sai cũng xuất hiện trong kết quả. [Ảnh khôi phục](../../ops/explore/hs/shots/phone-13-reload-draft.png), [ảnh xem lại](../../ops/explore/hs/shots/phone-16-review-II.png).
3. Kết quả hiện điểm từng phần và toàn văn đáp án/lời giải; về trang học sinh, tải lại rồi mở được kết quả Toán sau khi đã làm Hóa. [Báo cáo](../../ops/explore/hs/shots/laptop-14-result.png), [mở lại](../../ops/explore/hs/shots/laptop-23-reopened-result.png).
