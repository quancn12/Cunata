# CK-AUDIT-36 — Kiểm định độc lập sau vòng 36

Verdict: **CHANGES_REQUESTED**

- review_id / task_id: CK-AUDIT-36; reviewer: Codex; risk_level: HIGH.
- verified_at: 2026-11-17; Windows/PowerShell, Node v24.14.0, TypeScript 7.0.2; Chrome thật qua harness CDP có sẵn, HTTP localhost dưới `/Cunata/`.
- base_commit: `0d8cf281639c8cf651947acc9104f3ca1ceab96b`, commit đầu tiên có message “Bộ kiểm định web của Claude (test/claude-check) + vòng sửa tự động”. Có bảy commit cùng message; dùng mốc đầu tiên để tránh bỏ sót lịch sử. Đọc thêm khoảng gần nhất `f735eed..HEAD` và các thay đổi sau `04ae5c9`.
- head_commit: `968b662a5dc1bb16c1465af9909dec006bc2c88e`; giữ nguyên trong phiên.
- requirements_version: Shared Product Contract v2.0; toàn bộ WEB-contract.md, gồm quyết định cập nhật §14–19; M1 §2 cho mẫu bàn giao; DESIGN.md.
- Working tree ban đầu: hai log `ops/fix_loop.out.txt`, `ops/overnight.log` đã sửa; manifest CK-AUDIT-36 và thư mục prompts của round36 untracked. Giữ nguyên. Chỉ tạo báo cáo này; không sửa sản phẩm/tests, dependency, branch/worktree, commit hoặc deploy.

## Kết luận rà gian lận và sửa giả

Trong các vùng đã rà, không tìm thấy nhánh sản phẩm nhận diện webdriver/headless/user-agent, trả điểm cố định theo tên/ID đề kiểm định, hoặc tắt chức năng bằng điều kiện môi trường kiểm thử. Đây là kết luận rà theo rủi ro, không phải chứng nhận mọi dòng lịch sử hay suy luận về động cơ tác giả. Hai bộ kiểm định hiện xanh nhưng vẫn bỏ sót hai lỗi dưới đây.

- Đối chiếu `git log`, diff từ baseline cho source/build/Apps Script/tests; tìm dấu hiệu nhận diện Claude/Codex/oracle/fixture, ID câu kiểm định, SECRET, so sánh examId/title, điểm cố định và biến môi trường. `navigator.pdfViewerEnabled` là kiểm tra khả năng xem PDF; comment headless trong PDF không phải nhánh gian lận. Record `mockFinal` trong main là đường dựng báo cáo, không phân loại người dùng kiểm thử.
- `git diff 0d8cf28 HEAD -- src/domain package.json package-lock.json` rỗng. Không đổi công thức domain hoặc dependency trong khoảng kiểm. Đọc đường nối input → controller → lưu → báo cáo, adapter rational và collector; kiểm định browser đối chiếu các golden score độc lập.
- Không tìm thấy `.skip`, `.todo`, `.only` hay tùy chọn skip/todo trong hai bộ kiểm định bắt buộc; cả hai lần chạy đầy đủ có skipped=0, cancelled=0, todo=0. Không thấy xóa bộ kiểm định để xanh.
- Thay assertions định dạng điểm theo D02, lời giải sau nộp theo D08, route chọn vai và thao tác thẻ đề theo §19 có căn cứ yêu cầu. Test không còn ép hộp thoại chọn đề cũ lên dist; root vẫn kiểm luồng cũ theo §18. Loại manifest `index.json` khỏi tập file đề là hợp lý và có kiểm manifest cùng đối chiếu byte public/dist-public bổ sung.
- Thay helper tên trong `ef1f4cf`: nhập tên ở cổng tên; `setName` xác nhận tên khi ô chỉ đọc và ném lỗi nếu không khớp. Các assertions CSV/XSS/restore vẫn giữ. Không còn việc mở khóa ô tên để đáp ứng helper cũ. Regression readonly từng bị đảo trong vòng 33 đã được khôi phục tại HEAD; không báo lại lỗi đã sửa như lỗi hiện hành.
- Các thay đổi mock DOM/router/Apps Script được đối chiếu với API hiện tại. Refactor storage dùng `unwrap` vẫn ném lỗi khi Result thất bại và giữ assertions trạng thái/retry/generation; không xem việc đổi cú pháp truy cập Result là nới test. Không tìm thấy nới assertion không có căn cứ còn tồn tại trong phần diff đã xem.

## Findings đã xác minh

### CK36-F01 — MAJOR — Báo cáo cho làm lại bài giao sau hạn nộp

- affected_files: `src/app/main.ts:2525`, `src/app/main.ts:2535`, `src/student/area.ts:50`, `src/student/area.ts:827`.
- evidence: Handler làm lại chỉ kiểm `maxAttempts <= 1`, rồi gọi `loadOrResumeExam(currentExam, true)`. Không kiểm giờ mở/hạn nộp của bài giao. Student area có dueAt để khóa thẻ/preview, nhưng callback bắt đầu chỉ chuyển assignmentId/classCode; hạn không được truyền vào kiểm tra làm lại. WEB-contract §19.1 yêu cầu `#btnRestart` chỉ có khi còn lượt và còn hạn.
- reproduction_steps: Dùng `startGasServer` chạy Code.js thật trên Google giả lập. Admin tạo giáo viên, giáo viên tạo lớp và xuất bản đề chỉ có một câu III key `1,5`, maxAttempts=null, duration=50 phút, examId ngẫu nhiên. Giao đề với openAt=hiện tại−60 giây, dueAt=hiện tại+12 giây. Phục vụ dist bằng `startServer` và override config trong RAM trỏ tới máy chủ giả lập. Trình duyệt qua cổng tên → nhập mã lớp → mở thẻ bài giao → bắt đầu → nộp. Chờ đồng hồ thật qua dueAt 500 ms, kiểm nút rồi bấm Làm lại. Probe chạy qua Node stdin, không sửa file nguồn/fixture.
- actual: Probe exit=0. Sau hạn, nút `{visible:true, disabled:false}`. Bấm nút tạo thêm durable draft với responses rỗng và màn thi hiện lại. Mốc đo: dueAt=`1794895406334`, lúc kiểm sau bấm=`1794895407455`; IndexedDB có một final và một draft mới. Deadline draft mới=`1794898406838`, dù hạn giao đã qua. Không gán value để cưỡng ép nút bị khóa; sử dụng nút đang bật trên giao diện.
- expected: Sau hạn không cung cấp nút làm lại có thể sử dụng; handler cũng phải từ chối tạo lượt mới nếu thời gian vừa vượt hạn. Giữ kết quả cũ và đường tải báo cáo. Giới hạn này phải tồn tại sau reload/khôi phục.
- impact: Học sinh được bắt đầu một lượt đã hết hạn, mất công làm bài có thể bị server từ chối PAST_DUE sau khoảng bù mạng. Không kết luận đã vượt kiểm hạn phía server; lỗi được chứng minh ở quyền bắt đầu lại và giao diện.
- minimal_fix: Mang ngữ cảnh lịch giao và hạn nộp vào luồng attempt/report, giữ khi restore. Khi dựng báo cáo, tính đồng thời số lượt còn lại và hạn; cập nhật khi thời gian đi qua hạn. Kiểm lại ngay trong handler trước tạo attempt. Không chỉ ẩn nút bằng CSS hoặc sửa test bỏ kiểm hạn.
- regression_test: Bài giao chưa hết hạn được làm lại khi còn lượt; qua hạn trong lúc đang xem báo cáo thì nút bị khóa/ẩn và bấm không tạo draft. Reload sau hạn vẫn khóa. Kiểm hạn đúng biên, số lượt >1 và maxAttempts=null; đề luyện tập không có hạn vẫn làm lại bình thường. Đối chiếu số attempt trong IndexedDB.

### CK36-F02 — MINOR — Phiên công bố tám giờ nhưng bị từ chối sau sáu giờ

- affected_files: `apps-script/Code.js:1102`, `apps-script/Code.js:1103`, `apps-script/Code.js:1104`, `apps-script/Code.js:1110`.
- evidence: `newSession` trả expiresAt=now+8 giờ nhưng chỉ lưu phiên vào cache với TTL=21600 giây. `sessionPrincipal` phụ thuộc hoàn toàn vào cache; mất entry là UNAUTHORIZED. Comment đã ghi nhận sáu giờ nhưng không có cơ chế giữ phiên đủ hạn công bố. Không có nhánh phục hồi từ nguồn phiên khác. WEB-contract §19.2 đã yêu cầu phiên tám giờ.
- reproduction_steps: Import `makeGas`, đăng nhập admin; giữ token trong RAM. Sau đó tạm thay Date.now của tiến trình probe thành thời điểm đăng nhập+6 giờ+1 giây, gọi adminStats với cùng token, rồi khôi phục Date.now trong finally. Fake cache có TTL thật và dùng chính Code.js sản phẩm. Probe không gọi Google thật hoặc chờ sáu giờ.
- actual: Probe exit=0; elapsedHours=`6.000277777777778`, advertisedExpiryHours≈`8`; trả `{success:false,error:"UNAUTHORIZED",message:"Phiên đăng nhập không hợp lệ"}`. Đây là kiểm thử clock mô phỏng, không phải đo Google live. Admin và teacher dùng cùng hàm cấp/kiểm phiên.
- expected: Phiên hợp lệ vẫn dùng được trước expiresAt theo thời hạn đã chốt, trừ khi bị thu hồi/khóa/reset theo chính sách. Không công bố tám giờ trong khi chủ động chỉ giữ sáu giờ.
- impact: Người dùng bị đăng xuất sớm hơn hai giờ; có thể gián đoạn việc quản lý lớp/đề. Không khẳng định mất draft từ probe này.
- minimal_fix: Có nguồn phiên phía máy chủ giữ được đủ tám giờ, kiểm expiry và thu hồi; dùng cache để tăng tốc thay vì làm nguồn duy nhất ngắn hơn hạn. Giữ kiểm giáo viên bị khóa/reset và token không lộ ra phản hồi khác. Không chỉ đổi expiresAt xuống sáu giờ trái yêu cầu đã chốt; nếu muốn đổi thời hạn phải xin quyết định riêng.
- regression_test: Với clock/cache có TTL, đăng nhập → kiểm tại 6 giờ+1 giây và 7 giờ 59 phút còn hợp lệ; tại 8 giờ hết hiệu lực. Kiểm cache miss với nguồn phiên, reset mật khẩu/khóa tài khoản vẫn thu hồi đúng. Không bỏ TTL trong fake để làm xanh.

## Checks chạy thật

| Lệnh / kiểm tra | Exit | Kết quả |
| --- | ---: | --- |
| `node scripts/build.js` | 0 | PASS; emit/promote 318 files vào dist; cảnh báo DEP0190, không fail. |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS; không diagnostic. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS; không diagnostic. |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | PASS: tests=77, suites=5, pass=77, fail=0, skipped=0, cancelled=0, todo=0; duration_ms=30386.8566. |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | PASS: tests=116, suites=2, pass=116, fail=0, skipped=0, cancelled=0, todo=0; duration_ms=46694.3661. |
| Probe Chrome/CDP: bài giao, readonly, nhập/xóa III, durable final, làm lại sau hạn | 0 | Xác minh F01; xác nhận hai lỗi CK34 đã sửa như dưới đây. |
| Probe Code.js qua makeGas, clock +6 giờ+1 giây | 0 | Xác minh F02; không phải bằng chứng Google live. |

Hai suite browser chạy lần lượt, sau build; không lấy log round36 cũ làm kết quả phiên này. Logs là output terminal của phiên, các số đo và bằng chứng quan trọng được chép vào báo cáo; không tạo thêm log ngoài scope.

Kiểm lại CK34: Chrome thấy `candidateName.readOnly=true`. Nhập `1,5` → durable raw=`1,5`; bấm Xóa → durable raw=null; nộp → final raw=null, total=`0`. Vì vậy không báo lại CK34-F01/F02 tại HEAD.

## Phạm vi và giới hạn

- files_reviewed: log/diff source, build, Apps Script, tests từ baseline; đọc sâu main/student area/controller, legacy rational adapter, report, collector/client, Apps Script accounts/classes/submission và các helper/assertion thay đổi. Không chứng nhận toàn bộ tài sản nhị phân hoặc mọi đường chạy trong lịch sử.
- Bộ `.test.ts` toàn dự án và oracle Python: NOT_RUN trong phiên này; không thuộc năm lệnh bắt buộc. Golden oracle dùng trong bộ Codex browser đã chạy thật, không đồng nghĩa đã chạy toàn bộ oracle Python.
- Google Apps Script/CORS/Sheet live: NOT_RUN; §17.5 cấm kiểm định cục bộ ghi bảng thật. Mock backend chạy Code.js thật vẫn không thay bằng chứng Google live. `public/config.json` giữ appsScriptUrl rỗng.
- Kiểm định design trong suite đã chạy ở 375/1440px. Kiểm thủ công toàn bộ màn ở 768px, sáng/tối, OS Telex/VNI, trình duyệt khác, audit bảo mật toàn diện và owner acceptance: NOT_RUN; không tuyên bố hoàn tất các phần đó.
- HEAD và working tree kiểm lại sau probes: không có diff sản phẩm/test/fixture phát sinh. Thay đổi log/manifest có sẵn giữ nguyên.
- recommended_action: sửa F01/F02 trong vùng worker phù hợp, thêm regression đúng hành vi, chạy lại năm lệnh bắt buộc rồi review snapshot mới. Không cần tự đặt quyết định nghiệp vụ mới để áp dụng yêu cầu hiện hành. Chưa duyệt release/deploy.
