# EXPLORE-gv — Trải nghiệm giáo viên lần đầu

Kiểm tra ngày 21/11/2026, Codex; HEAD khi bắt đầu: `754b89a76a901dc8882e94b5a25ee0abb14c7109`. Working tree đã có thay đổi của các lượt làm khác. Đây là báo cáo quan sát trên bản build được chụp riêng, không phải chứng nhận toàn bộ HEAD hay production.

Windows, Node `v24.14.0`, Chromium thật qua CDP của `test/claude-check/harness.mjs`; thao tác bấm dùng `mouseClick` và kiểm tra phần tử thực sự nhận chuột. Ba viewport: điện thoại **390×844**, laptop **1366×768**, màn rộng **1920×1080**. Máy chủ `classroomServer` chạy Apps Script giả lập; `seedTeacher` thực hiện Admin tạo tài khoản giáo viên, `seedClass` tạo lớp tham khảo. Tất cả tên và bài nộp là dữ liệu giả lập, không phải hồ sơ học sinh thật.

Để tuân thủ phạm vi ghi file, `ops/explore/gv/build.mjs` gọi chính `buildWeb` trong `scripts/web-build.ts`, đổi duy nhất đường xuất/staging vào `ops/explore/gv/build/dist/`. Không ghi đè `dist/` có thay đổi sẵn. Các kiểm tra trình duyệt dùng bản build này; bốn hash runtime nằm trong `ops/explore/gv/supplement.json`. Không sửa mã sản phẩm, cài dependency, commit, deploy hoặc gọi Google/Vercel/Neon thật.

## Vấn đề quan sát được

Ảnh trong bảng là ảnh nguyên viewport; JSON cùng tên lưu trạng thái giao diện. Không dùng các ảnh `*-failed` cũ ngoài những ảnh được liên kết dưới đây để suy ra lỗi mới.

| Mã | Màn/bước | Cỡ màn | Thấy gì (cụ thể) | Vì sao khó chịu với giáo viên | Mức | Ảnh |
|---|---|---|---|---|---|---|
| EX-GV-01 | Nhập DOCX → xác nhận tất cả hợp lệ → xác nhận nhập vào đề → xuất bản | Cả 3 | Tệp mẫu có một câu hỏi, bốn lựa chọn và đáp án A được nhận đủ, xác nhận 1/1. Sau khi nhập vào đề, xuất bản thất bại với nguyên văn `Lỗi xuất bản: Cannot assign to read only property 'title' of object '#<Object>'`. | Không đưa được đề Word vừa nhập lên web; thông báo kỹ thuật không chỉ ra cách tiếp tục. | Nặng | [Xác nhận 1/1](../../ops/explore/gv/shots/phone-extra-28-docx-confirmed.png), [laptop lỗi xuất bản](../../ops/explore/gv/shots/laptop-extra-docx-preview-failed.png), [điện thoại](../../ops/explore/gv/shots/phone-extra-docx-preview-failed.png), [màn rộng](../../ops/explore/gv/shots/wide-extra-docx-preview-failed.png) |
| EX-GV-02 | Kết quả → chọn lớp → chọn đề đã giao hai lần | Cả 3 | Khi chọn “Tất cả đề”, bảng có Nguyễn Minh An và Trần Hà Vy. Hai học sinh nộp vào hai lần giao của cùng một đề (một có hạn, một không hạn). Chọn tên đề thì chỉ còn Minh An; menu chỉ có một lựa chọn cho đề này, không phân biệt hai lần giao. | Dễ tưởng học sinh chưa nộp, hoặc tải danh sách thiếu bài mà không nhận ra. Có thể xem đủ bằng cách quay lại “Tất cả đề”. | Nặng | [Trước lọc](../../ops/explore/gv/shots/laptop-extra-24-results-all.png), [sau lọc](../../ops/explore/gv/shots/laptop-extra-26-repeated-exam-filter.png), [điện thoại](../../ops/explore/gv/shots/phone-extra-26-repeated-exam-filter.png), [màn rộng](../../ops/explore/gv/shots/wide-extra-26-repeated-exam-filter.png) |
| EX-GV-03 | Xem bảng kết quả hai học sinh | 390×844 | Chỉ thấy tên, mã lớp, giờ nộp và phần I; cột phần II bị cắt ở mép phải, phần III và tổng điểm nằm ngoài khung nhìn. Bảng có thanh kéo ngang. | Muốn đối chiếu tên với tổng điểm phải kéo qua lại; không đọc được cả một kết quả ngay trên điện thoại. | Vừa | [Bảng trên điện thoại](../../ops/explore/gv/shots/phone-19-results.png) |
| EX-GV-04 | Mở soạn đề mới và xuất bản thành công | Cả 3 | Màn soạn hiện “không cần server”, “JSON chuẩn domain”, “Exam ID”, “Version ID”; thông báo thành công là “Đã xuất bản (revision 1)”. | Giáo viên bình thường phải hiểu các từ dành cho lập trình viên ngay trong việc đặt tên, lưu và xuất bản đề; thông điệp không nhất quán với các màn lớp học dùng tiếng Việt đơn giản. | Vừa | [Mở trình soạn](../../ops/explore/gv/shots/phone-12-builder.png), [thông báo xuất bản](../../ops/explore/gv/shots/laptop-16-publish.png) |
| EX-GV-05 | Cài đặt đề → chính sách công bố đáp án | Cả 3 | Vẫn chọn được “Chỉ sau khi hết giờ (after_deadline)”; ảnh ghi nhận mục này đã được chọn. WEB-contract §14/D08 quy định luôn công bố lời giải sau khi nộp và bỏ tùy chọn này. | Giáo viên có thể tin rằng mình đang trì hoãn công bố đáp án bằng một lựa chọn mà hợp đồng đã bỏ. Lượt khám phá này xác minh sự tồn tại và khả năng chọn mục đó, không kiểm tra thêm thời điểm lộ đáp án của học sinh. | Vừa | [Laptop đã chọn](../../ops/explore/gv/shots/laptop-extra-27a-release-policy.png), [điện thoại](../../ops/explore/gv/shots/phone-extra-27a-release-policy.png) |
| EX-GV-06 | Xem trước DOCX hợp lệ | Cả 3 | Cùng câu “Câu 1. Giá trị của 1 + 1 bằng bao nhiêu?” hiện liên tiếp hai lần trong một thẻ, dù nguồn chỉ có một đoạn câu hỏi. | Khó biết đây là nội dung bị nhập trùng hay hai phần khác nhau; tốn thêm chỗ khi hiệu đính trên điện thoại. | Nhẹ | [Câu bị lặp trên điện thoại](../../ops/explore/gv/shots/phone-extra-27-docx-preview.png), [laptop](../../ops/explore/gv/shots/laptop-extra-27-docx-preview.png) |

## Phạm vi đã đi qua và kết quả chạy

- Mỗi viewport đều đi qua chọn vai → đăng nhập → tạo lớp → xem mã lớp → giao có hạn → giao không hạn → xem danh sách bài giao → thư viện đề → soạn/sửa một câu → xuất bản → nhập JSON và xuất bản → xem hai bài nộp giả lập → lọc → tải CSV → đăng xuất → đăng nhập lại. Ảnh chính đánh số `01` đến `23` (có các bước `10b`, `10c`), dưới `ops/explore/gv/shots/`.
- Bổ sung mỗi viewport: hai lần giao cùng đề, mỗi lần có một bài nộp; tải CSV đầy đủ hai tên; lọc đề; chọn chính sách công bố đáp án; nhập DOCX UTF-8 hợp lệ, xác nhận một câu và thử xuất bản. Ảnh có tiền tố `*-extra-`.
- Mẫu DOCX tạo bằng `python ops/explore/gv/make-fixture.py`, nguồn có một câu và một đáp án. Mẫu cũ bị mất dấu đã được thay trước lượt kiểm tra bổ sung cuối; không ghi việc nhận 0 câu từ mẫu cũ thành lỗi sản phẩm.

| Lệnh đã chạy từ gốc dự án | Exit | Kết quả thật | Bằng chứng |
|---|---:|---|---|
| `node ops/explore/gv/build.mjs` | 0 | Build thành công, 339 tệp; kiểm module hợp lệ | `ops/explore/gv/build.log`, `build-result.json` |
| `node ops/explore/gv/run.mjs` | 0 | 21 PASS, 0 FAIL; 7 nhóm thao tác × 3 viewport | `ops/explore/gv/run-current.log`, `evidence.json`; ba tệp `phone/laptop/wide-results.csv` |
| `node ops/explore/gv/supplement.mjs` | 1 | 3 PASS, 6 FAIL: 3 ca lọc hai lần giao (EX-GV-02), 3 ca xuất bản sau nhập DOCX (EX-GV-01) | `ops/explore/gv/supplement-current.log`, `supplement.json`; ba tệp `*-extra-results.csv` |
| `node --test ops/explore/gv/design-current.test.mjs` | 0 | 11 PASS, 0 FAIL, 0 SKIP, 2 suites | `ops/explore/gv/design-current.log` |
| `npx --no-install tsc -p tsconfig.json` | 0 | Không có lỗi typecheck | `ops/explore/gv/typecheck-main.log` |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Không có lỗi typecheck | `ops/explore/gv/typecheck-web.log` |

`design-current.test.mjs` nạp nguyên bộ `test/claude-check/design.test.mjs`, chỉ trỏ mục tiêu dist sang bản build trong scope; không sửa bộ test gốc. 11 ca thiết kế xanh không xác nhận toàn bộ trình soạn/hiệu đính đạt quy chuẩn. Những lần chạy thử kịch bản trước lượt cuối có lỗi chờ do chuỗi tên bị mã hóa sai trong kịch bản; đã sửa chuỗi chờ và chạy lại đủ 21 ca. Không tính lỗi chờ đó là lỗi sản phẩm.

Giới hạn: kết quả học sinh được giả lập qua máy chủ, không phải hai học sinh thật thao tác trình duyệt. NOT_RUN: Google/Vercel/Neon production, tải lại CSV trong Excel thật, nhập IME Telex/VNI ở cấp hệ điều hành, khảo sát đủ sáng/tối và chỉ bàn phím cho toàn bộ màn giáo viên, kiểm thử tải lớn, các tính năng ngoài danh sách khám phá. Không suy ra kết luận về những phần đó. Không cần quyết định nghiệp vụ mới cho báo cáo này.

## 3 điều tốt nhất

1. Tạo lớp ngắn gọn, mã lớp nổi bật trên thẻ; chi tiết lớp có nút quay lại danh sách rõ ràng. [Ảnh](../../ops/explore/gv/shots/phone-05-created.png)
2. “Không hạn nộp” vô hiệu hóa ô hạn và danh sách bài giao ghi rõ trạng thái này; thực hiện được ở cả ba cỡ màn. [Ảnh](../../ops/explore/gv/shots/phone-10b-no-deadline-filled.png), [danh sách](../../ops/explore/gv/shots/laptop-10c-no-deadline-list.png)
3. Soạn trực tiếp và nhập JSON đều xuất bản được; CSV tải thực sự chứa đủ hai học sinh ở ca cơ bản; đăng xuất rồi đăng nhập lại vẫn thấy lớp/bài giao. [Xuất bản](../../ops/explore/gv/shots/laptop-16-publish.png), [CSV](../../ops/explore/gv/phone-results.csv), [đăng nhập lại](../../ops/explore/gv/shots/wide-23-relogin.png)
