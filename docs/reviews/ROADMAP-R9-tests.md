# R9-TESTS-PRE — kiểm định in đề

Ngày đo: 21/11/2026. Trạng thái bàn giao: **BLOCKED** — chưa đạt hai lượt đỏ do thiếu tính năng. Không nghiệm thu sản phẩm R9.

Phạm vi ghi: `ops/roadmap/tests/R9/**` và báo cáo này. Bộ test/fixture đã tồn tại khi bắt đầu phiên; đã đọc lại, giữ các oracle và chạy lại thực tế. Không sửa sản phẩm, dependency, commit, deploy hoặc đọc cấu hình production. Working tree có nhiều thay đổi đồng thời của các task khác; không coi HEAD là snapshot toàn bộ nội dung được chạy.

## Căn cứ và môi trường

- Shared Product Contract v2.0; WEB-contract đọc toàn bộ, trọng tâm §24.6, liên quan §4, §9–10, §19, §21–22; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md (R9 phụ thuộc R6).
- HEAD lúc kiểm tra: `58fc9d5704f62f02c7ab7be0b590cb3d12e7e797`.
- Windows, PowerShell, Node `v24.14.0`, TypeScript `7.0.2`, Chrome headless thật qua CDP.
- Chạy tại `D:\Cunata`; harness/app/API/build import tuyệt đối bằng `pathToFileURL(process.cwd() + '/…')`. Entry `index.js` giúp lệnh thư mục tìm đúng `print.test.mjs`.
- `support.mjs` gọi `buildWeb` vào thư mục riêng `.runtime/site`, `promote:false`; không ghi `dist/`. Hai đề tổng hợp có I/II/III, đáp án I D/B, II S/Đ/S/Đ, III `-0,5`/`1,50`, lời giải đánh dấu riêng, ảnh nhúng và công thức `x^2+1`.
- Kiểm lõi dùng `handle` thật + MemoryStore. Browser đi qua HTTP Node cục bộ cũng gọi chính `handle`; không dùng máy chủ giả trả sẵn kết quả RPC. Tài khoản tổng hợp chỉ ở bộ nhớ.
- Đăng nhập bằng nhập liệu CDP và `mouseClick` của app.mjs; kiểm hit target và khung nhìn. Không gán input value hoặc token bằng JavaScript, không skip theo dò môi trường. Không có luồng học sinh trong R9 nên không nhập tên ngoài cổng tên. Browser kiểm soát không phát request HTTP ra ngoài loopback.

## Kết quả thực đo

| Lượt/lệnh | Exit | Pass | Fail | Skip/cancel | Diễn giải |
|---|---:|---:|---:|---:|---|
| 1: `node --test ops/roadmap/tests/R9/` | 1 | 2 | 10 | 0/0 | Tất cả ca đã chạy; 10 assertion thiếu `.btn-teacher-print`; cần can thiệp dọn đúng tiến trình Chrome của lượt test để kết thúc teardown. Thời gian Node ghi 190364,0075 ms. |
| 2: `node --test ops/roadmap/tests/R9/` | 1 | 0 | 12 | 0/0 | Before hook bị chặn bởi build TypeScript; các thân test **NOT_RUN**, không phải 12 lỗi tính năng. Thời gian Node ghi 3491,8182 ms. |
| `npx --no-install tsc -p tsconfig.json` | 1 | — | — | — | TS2345 tại `src/app/main.ts:2458:36`. |
| `npx --no-install tsc -p tsconfig.web.json` | 1 | — | — | — | Cùng TS2345. |

Log nguyên bản: `ops/roadmap/tests/R9/run-1.tap`, `run-2.tap`; exit được ghi riêng trong `run-1.exit.txt`, `run-2.exit.txt`. Reporter thực tế là spec, dù đuôi file `.tap`. `typecheck-node.txt`, `typecheck-web.txt` và các file `.exit.txt` tương ứng chứa bằng chứng compiler. `build.json` hiện là kết quả lượt 2 (success=false), không đại diện build thành công của lượt 1.

Lỗi compiler: `JSON.parse(rawFinal || rawDraft)` nhận `string | null`, trong khi chữ ký yêu cầu `string`. File này ngoài scope; không sửa hoặc lờ lỗi để ép chạy browser. SHA256 `src/app/main.ts` lúc kiểm tra sau hai lượt: `6C470524BDF10CB0C5A2FEE73666FFA7C3D6D30C9732429F00EC9920A3790179`. Không có hash nguồn đầu lượt 1, nên không khẳng định hai lượt chạy cùng snapshot.

## Danh sách ca và phủ hợp đồng

Tên đầy đủ đều có dạng `dist: [teacher] R9: <mô tả> (WEB-contract §24.6)`. Các mô tả dưới đây đúng thứ tự đăng ký trong file test. Lượt 2: tất cả NOT_RUN do before hook; không suy diễn từ đó là thiếu tính năng.

| # | Mô tả | Mục hợp đồng/oracle | Lượt 1 |
|---|---|---|---|
| 1 | lõi handle với MemoryStore giữ nguyên nội dung và khóa đáp án của đề cần in | §24.6; §17.2, §19.2, §22: đọc lại đúng payload, owner | PASS |
| 2 | trình duyệt đăng nhập thật qua máy chủ Node handle và hiện cả hai nguồn đề | §24.6; §19.1, §21–22: đăng nhập HTTP, đúng tên đề, không lỗi JS/HTTP ra ngoài local | PASS |
| 3 | nút in hiện trong khung nhìn và nhận chuột thật: đề của giáo viên ở desktop | §24.6: nút trên đúng thẻ; mở đúng đề | FAIL — thiếu nút |
| 4 | nút in hiện trong khung nhìn và nhận chuột thật: đề kho chung ở desktop | §24.6: kho chung cũng in được | FAIL — thiếu nút |
| 5 | nút in hiện trong khung nhìn và nhận chuột thật: đề của giáo viên ở điện thoại 375px | §24.6; DESIGN: hiện và bấm được trong khung nhìn | FAIL — thiếu nút |
| 6 | đề in chứa toàn văn câu, lựa chọn, mệnh đề và không lộ đáp án hay lời giải | §24.6: đề không key, không lời giải/đánh dấu đúng; đủ nội dung | FAIL — thiếu nút, chưa tới oracle tài liệu |
| 7 | phiếu trả lời Phần I có A–D cho từng câu, để trống cho học sinh | §24.6: hàng 1/2 đủ A/B/C/D, không điền sẵn | FAIL — thiếu nút |
| 8 | phiếu trả lời Phần II có Đ/S riêng cho đủ bốn ý a–d | §24.6: lựa chọn Đ/S cho từng ý, không lời giải | FAIL — thiếu nút |
| 9 | phiếu trả lời Phần III có đúng bốn ô trống cho mỗi câu | §24.6: hai vùng, mỗi vùng bốn ký tự/ô, không in sẵn key | FAIL — thiếu nút |
| 10 | trang đáp án riêng ánh xạ đúng I, II và giữ nguyên chuỗi III | §24.6; §4: key I D/B, II S/Đ/S/Đ, raw III chính xác, CSS ngắt trang hiệu lực | FAIL — thiếu nút |
| 11 | luồng in gọi window.print và có CSS dành cho bản in | §24.6: quan sát print do thao tác chuột, CSS @media print và ngắt trang | FAIL — thiếu nút |
| 12 | công thức và ảnh hiện đầy đủ trong tài liệu in, không tràn nội dung | §24.6; §9: ảnh đúng nguồn giải mã được, công thức có số mũ và kích thước render, không overflow | FAIL — thiếu nút |

Các assertion sâu đã có nhưng **chưa được thực thi** vì thiếu điểm vào tính năng. Không dùng 10 lỗi nút in làm bằng chứng rằng từng chi tiết tài liệu chắc chắn sai hoặc đúng. Ảnh thật `library-r9-owned-375.png` đã xem: cả hai thẻ hiện Sửa đề/Giao đề, đề riêng thêm Gỡ; không có nút in. Các PNG desktop được lưu cùng thư mục.

## Vấn đề helper và giới hạn còn lại

Lượt 1 chạy đủ ca nhưng chưa tự thoát; Chrome PID 26352 được xác minh là con trực tiếp của tiến trình test PID 3044, sau đó chỉ dừng Chrome đó. Node mới in tổng kết và exit 1. Không coi đây là lượt chạy tự động ổn định. Đã sửa teardown trong `support.mjs` để đóng browser và hai server đồng thời, gọi `api.close` trước `closeAllConnections` để giảm race với request đang tới. **NOT_RUN sau sửa teardown**: build hiện chặn trước khi browser được tạo; chưa chứng minh sửa này xử lý hoàn toàn việc không thoát.

Observer ghi nhận `window.print` và giữ document thật để đọc DOM/CSS/ảnh; không mở hộp thoại in hệ điều hành. Adapter hỗ trợ cùng trang, popup about:blank cùng nguồn, iframe cùng nguồn; không đặt thêm ID sản phẩm ngoài `.btn-teacher-print`. Nếu triển khai hợp lệ dùng popup điều hướng hoặc nút in bên trong popup, cần mở rộng adapter trước khi kết luận lỗi sản phẩm.

Chưa kiểm bản giấy/PDF, phân trang nhiều trang, vị trí hình/công thức trên giấy, hay hộp thoại máy in; chưa có tính năng để đo. Không chạy live Google/Vercel/Neon, không deploy và không install. Không nghiệm thu regression toàn dự án trong task viết test này. Không có quyết định nghiệp vụ R9 cần tự đặt thêm.

## Việc cần để mở gate

Worker sở hữu `src/app/main.ts` cần sửa TS2345 trong phạm vi của họ. Sau đó chạy lại cả hai typecheck và đúng lệnh test hai lần; kiểm tra teardown tự kết thúc, cập nhật kết quả. Gate R9-TESTS-PRE vẫn BLOCKED cho tới khi hai lượt đỏ ổn định do thiếu tính năng, không do build/helper. Việc triển khai sản phẩm và phê duyệt R9 là bước sau.
