# CK-AUDIT-29 — Kiểm định độc lập sau vòng 29

Verdict: **CHANGES_REQUESTED**

- review_id / task_id: CK-AUDIT-29; reviewer: Codex.
- Thời điểm: 2026-11-17, Asia/Bangkok; môi trường: Windows, PowerShell, Node v24.14.0, TypeScript cài sẵn, Python 3.11.0; Chrome/Edge thật qua CDP và HTTP localhost.
- base_commit: `0d8cf281639c8cf651947acc9104f3ca1ceab96b` — commit đầu tiên có message “Bộ kiểm định web của Claude (test/claude-check) + vòng sửa tự động”.
- head_commit: `b35e11f99f79edae84250f1ad69e942222392891`.
- Có 7 commit mang cùng message này. Ngoài toàn khoảng trên, rà riêng `f735eedf122691c4abd68ca3d57b367dfea99d1e..HEAD` cho các sửa vòng 27–29; không tự chọn commit cùng tên gần nhất làm toàn bộ baseline.
- Requirements: Shared Product Contract v2.0; WEB-contract v1.0 cùng các bổ sung §14–19; kế thừa M1; DESIGN.md khi đối chiếu UI. Risk: HIGH, tập trung tính toàn vẹn lượt làm và thu kết quả.
- Working tree ban đầu có sửa `ops/fix_loop.out.txt`, `ops/overnight.log` và untracked `ops/fix/round29/CK-AUDIT-29.json`, `ops/fix/round29/prompts/`. Giữ nguyên các thay đổi đó. Chỉ tạo báo cáo này; không sửa code/test, không install/dependency, không commit/deploy.

## Kết luận rà gian lận và sửa giả

Các gate được yêu cầu đều xanh, nhưng bốn lỗi dưới đây đã được tái hiện độc lập. Màu xanh chưa đủ để nghiệm thu chức năng hiện tại.

- `git log` và `git diff` toàn khoảng không có thay đổi trong `src/domain`, `package.json`, `package-lock.json`. Không thấy sửa luật chấm M1 trong domain.
- Đã quét source sản phẩm, Apps Script, build scripts và legacy index cho `navigator.webdriver`, headless, user-agent/userAgent, biến môi trường test, tên bộ kiểm định, điều kiện examId/title và điểm cố định. Không tìm được bằng chứng sản phẩm dò môi trường hoặc trả điểm theo tên/ID đề kiểm định. Không khẳng định điều này chứng minh hoàn toàn không có gian lận.
- Đã đối chiếu diff các bộ `test/claude-check`, `test/codex-check`, các test e2e/glue/storage/student và harness/CDP liên quan. Không thấy `.skip`/`.todo`/`.only` hay xóa suite nhằm làm xanh trong hai bộ kiểm định bắt buộc; chạy thật cho skipped=0. Việc đổi expectation lời giải sau nộp có căn cứ D08; đổi format điểm có căn cứ D02; đổi route ban đầu có căn cứ §19. Không quy các thay đổi này thành gian lận.
- `test/claude-check/design.test.mjs` được bổ sung assertion kiểm tra câu hỏi bị che và thanh đầu trang; đây là tăng kiểm tra. CDP `waitForVisible` đổi sang duyệt mọi phần tử của selector kết hợp phù hợp nghĩa “một phần tử bất kỳ đang hiện”.
- `test/final-quality/ck12Regressions.test.ts:1038` mở rộng selector cold boot để nhận cả start/role chooser. Sau nộp và mở lại URL gốc, hợp đồng mới cho phép màn này; tuy nhiên assertion đó không tự chứng minh mở lại báo cáo/lịch sử offline. Ghi nhận giới hạn coverage, không kết luận có gian lận từ riêng thay đổi này.
- `test/codex-check/fixtures/bank-backup.json` thay đổi metadata: `test/codex-check/support.mjs` ghi fixture từ kết quả export trong khi chạy. Bản thân diff fixture không đủ chứng minh tác giả cố tình làm yếu test. Hai bộ browser bắt buộc thực sự chạy giao diện, nhưng một số thao tác dùng DOM/CDP trực tiếp, có thể truy cập control ẩn; không thay thế kiểm định toàn bộ luồng người dùng theo vai.
- Có workaround sai nghiệp vụ đã xác minh: ghi đè accessor DOM `readOnly` và thêm regression đòi ô tên luôn sửa được (F03). Có đường gửi riêng bỏ qua outbox bền vững (F02). Đây là các sai lệch kỹ thuật cần sửa; không suy đoán động cơ của tác giả.

## Findings

### CK29-F01 — MAJOR — Đề luyện tập kế thừa nhầm lớp/bài giao trước đó

- affected_files: `src/student/area.ts:781`, `src/student/area.ts:784`, `src/student/area.ts:787`; `src/app/main.ts:1565`; liên quan `src/collect/export.ts:193`.
- evidence: Khi mở bài được giao, area ghi context vào cả sessionStorage và localStorage. Khi mở bài luyện tập, nhánh else chỉ xóa sessionStorage. Main ưu tiên context dùng chung và fallback về localStorage, không kiểm tra context có thuộc exam/attempt hiện tại hay không. Export cũng fallback vào session toàn cục nếu final không có metadata.
- reproduction_steps: Trên dist với máy chủ localhost chạy Code.js thật trong Google giả lập, tạo tài khoản/lớp và giao `exam-thpt-hoa-repeating-demo`; học sinh vào lớp, mở đề Hóa; bấm “Về trang học sinh”; mở thẻ luyện tập `exam-thpt-ly-part-i-demo`; nộp.
- actual đã quan sát: session context = null, local context vẫn chứa lớp `K75LV6` và assignment `78fe8c87-ce52-4656-9720-cf78c471b023`. POST có `exam_id=exam-thpt-ly-part-i-demo` nhưng vẫn có `class_code=K75LV6`, `assignment_id=78fe8c87-ce52-4656-9720-cf78c471b023` của đề Hóa. UI báo “Chưa gửi được — sẽ thử lại”; KetQua chỉ có header, không có dòng kết quả. Probe kết thúc exit 0.
- expected: Bài luyện tập không mang assignment; bài giao giữ đúng context bất biến của chính attempt, kể cả chuyển đề, reload và retry.
- impact: Bài hợp lệ bị server từ chối, hoặc bị gắn sai lớp/bài giao. Context dùng chung còn làm export/retry kết quả cũ phụ thuộc bài đang mở.
- minimal_fix: Lưu class_code/assignment_id cùng AttemptRecord khi tạo attempt và bảo toàn qua finalize/restore; tạo payload chỉ từ final tương ứng. Không lấy active context hiện tại để bổ sung metadata cho kết quả cũ. Dọn cả hai storage cho legacy context khi mở bài luyện tập là biện pháp chuyển tiếp, không thay thế ràng buộc theo attempt.
- regression_test: Browser A được giao → B luyện tập → nộp B không có metadata; quay lại A vẫn có context A; hai lớp giao cùng exam; hai tab và retry A trong lúc đang mở B; export cùng final cho cùng bytes dù đổi active context.

### CK29-F02 — CRITICAL — Gửi kết quả chỉ retry trong RAM, reload làm mất việc gửi còn chờ

- affected_files: `src/app/main.ts:1550`, `src/app/main.ts:1601`, `src/app/main.ts:1616`, `src/app/main.ts:1624`; restore final tại `src/app/main.ts:1833`.
- evidence: Composition root tự fetch và setTimeout, không nối đường gửi này vào `enqueue`/`drainOutbox` và `createAppsScriptCollectorPort` hiện có theo WEB-contract §17.4/18.1. RetryCount/generation/receipt không được cập nhật trong durable outbox.
- reproduction_steps: Máy chủ Apps Script giả lập trả HTTP 500 cho POST; học sinh làm và nộp đề luyện tập. Đợi lần gửi đầu lỗi; gọi CDP `Page.reload` giữ nguyên hash báo cáo; sau reload cho server hoạt động lại; chờ 9 giây, dài hơn các mốc retry đầu 1/2/4 giây.
- actual đã quan sát: Trước reload có 1 POST; IndexedDB `attempts` có phase=final, `outbox` state=local_saved, retryCount=0, không receipt. Sau reload và server phục hồi vẫn đúng 1 POST, cùng final và outbox local_saved/retryCount=0, KetQua chưa có dòng nào. Hash vẫn là `#/report?attemptId=attempt-mwjwpsyz-awzw`; UI chỉ báo “Đã nộp & lưu cục bộ”. Probe hoàn tất exit 0.
- expected: Kết quả đã chốt nhưng chưa được nhận phải có trạng thái gửi bền vững; mở lại trang tiếp tục gửi trong budget của chính attempt, giữ idempotency/body; chỉ server_confirmed khi có xác nhận hợp lệ.
- impact: Đóng/reload trang sau lỗi mạng làm bài không được chuyển tới giáo viên dù server đã hoạt động lại. Bài còn local, nhưng công việc gửi bị bỏ rơi. Gate retry hiện tại chỉ chứng minh retry khi trang còn sống.
- minimal_fix: Tích hợp collector port với outbox transactional hiện có; persist queued/retryCount/nextRetryAt/generation trước gửi, khôi phục/drain khi bootstrap/online theo budget; gắn callback và UI vào đúng AttemptKey/hash/generation. Bỏ vòng retry riêng trong main; xử lý lỗi nghiệp vụ như PAST_DUE bằng thông báo đúng nghĩa và giữ tải kết quả.
- regression_test: HTTP 500 → submit → reload → server phục hồi → một dòng KetQua và receipt đúng attempt; reload nhiều lần không reset budget; mất response sau server write không tạo dòng trùng; đang mở B thì receipt A không đổi badge B.

### CK29-F03 — MAJOR — Vô hiệu hóa thuộc tính chỉ đọc của tên thí sinh để giữ tên luôn sửa được

- affected_files: `src/student/area.ts:608`–`src/student/area.ts:619`; `src/app/main.ts:1886`; regression trái hợp đồng tại `test/student/area.test.ts:169`–`test/student/area.test.ts:185`.
- evidence: Code đặt readOnly=false, xóa attribute readonly, rồi Object.defineProperty accessor trả false và bỏ qua mọi setter. Diff main còn bỏ lệnh đặt readOnly=true. WEB-contract §19.1 yêu cầu `#candidateName` chỉ đọc trong màn làm bài, có thao tác đổi tên ở khu học sinh.
- reproduction_steps: Mở dist, qua cổng tên, bắt đầu đề; đọc trạng thái DOM; focus/select #candidateName và nhập tên khác bằng CDP Input.insertText (sự kiện nhập thật của trình duyệt).
- actual đã quan sát: `{readOnly:false, attr:false, ownProperty:true, disabled:false}`; tên đổi thành `Changed during exam`. Không chỉ sai phản ánh thuộc tính JS: ô thực tế nhận được bàn phím. Probe đầu dừng sau đó do đợi trạng thái mạng không đúng thời điểm; bằng chứng thao tác tên đã thu trước lỗi đó, không coi toàn probe ấy là PASS.
- expected: Tên của bài đang làm được hiển thị chỉ đọc; thay tên theo luồng được hợp đồng cho phép, không thay semantics native DOM.
- impact: Sai hành vi đã chốt; code khác không thể khóa input bằng setter chuẩn. Test mới hợp thức hóa workaround thay vì bảo vệ yêu cầu.
- minimal_fix: Bỏ accessor override và helper ép editable; giữ readonly native của input trong màn làm bài. Đổi regression sang kiểm tra không thể nhập tên khi làm bài và bảo toàn tên từ cổng tên qua save/reload/autosubmit. Giữ xử lý đổi tên trong luồng #btnChangeName.
- regression_test: Browser thật thử gõ/paste vào #candidateName khi thi, tên không đổi; tên đã nhập ở cổng tên giữ nguyên trong record/report; setter readOnly của DOM vẫn hoạt động bình thường.

### CK29-F04 — MAJOR — Trang học sinh không tải đề giáo viên đã xuất bản

- affected_files: `src/student/area.ts:947`–`src/student/area.ts:971`, `src/student/area.ts:1024`.
- evidence: loadPublicExams chỉ fetch public/exams/index.json rồi gán publicExams từ đề tĩnh; refreshList chỉ gọi hàm này trước renderPracticeExams. Không gọi client.listExams để hợp nhất như §17.4 yêu cầu (mục 19 giữ hành vi này).
- reproduction_steps: Dùng chính Code.js trong Google giả lập, Admin tạo giáo viên; giáo viên publish đề hợp lệ id `audit29-published-only`; mở một browser context mới ở dist đã cấu hình endpoint; vào học sinh/qua cổng tên; chờ danh sách.
- actual đã quan sát: publish trả success=true/revision=1; backend listExams trả đề này. Selector `#practiceExams [data-exam-id="audit29-published-only"]` = false; log HTTP của Apps Script có `GET_ACTIONS=[]`. Probe exit 0.
- expected: Danh sách học sinh = đề tĩnh hợp đề đã xuất bản; trùng id bản giáo viên thắng; lỗi tải catalog giáo viên có cảnh báo nhưng vẫn giữ đề tĩnh.
- impact: Giáo viên xuất bản thành công nhưng học sinh không tìm thấy đề luyện tập đó; tính năng chỉ tồn tại phía giáo viên/backend. Test hiện kiểm tra xuất bản giữ nội dung nhưng chưa kiểm chứng học sinh mới nhìn thấy đề.
- minimal_fix: Dùng đường hợp nhất catalog chung đã có trong app/exam-list hoặc gọi client.listExams đúng quy tắc; giữ source và load bằng getExam cho bản teacher. Không fallback sang URL tĩnh trước bản teacher khi trùng id. Hiện cảnh báo khi catalog teacher thất bại.
- regression_test: Publish id mới → context học sinh mới thấy/mở/làm được; teacher override id tĩnh phải tải nội dung teacher; unpublish → mất bản teacher; API lỗi → vẫn có static và cảnh báo.

## Checks chạy thật

| Lệnh / kiểm tra | Exit | Kết quả |
| --- | ---: | --- |
| `node scripts/build.js` | 0 | Emit/promote 318 files vào dist; validate assets/schema/syntax thành công. Có Node DEP0190 warning; không coi warning là failure. |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS, không diagnostic. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS, không diagnostic. |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | tests=77, suites=5, pass=77, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=65285.6299. |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | tests=116, suites=2, pass=116, fail=0, cancelled=0, skipped=0, todo=0; duration_ms=79227.5911. |
| `python -B test/oracle/oracle.py --check` | 0 | pass=11, fail=0, skipped=0; 1632 fixtures, 5849 maxima configs, 9 negative controls. Chỉ oracle độc lập, không phải tự nó chứng nhận product scorer. |
| `git diff --check` | 0 | Không whitespace error trong working diff tại thời điểm kiểm. |
| Probe F01 qua browser + Code.js giả lập | 0 | Tái hiện payload sai assignment và server không ghi kết quả. |
| Probe F02 qua Page.reload + đọc IndexedDB | 0 | Tái hiện final tồn tại nhưng POST không được retry sau reload/server phục hồi. |
| Probe F04 publish → context học sinh mới | 0 | Tái hiện catalog teacher không được gọi/hiển thị. |

Các probe chạy bằng PowerShell here-string đưa trực tiếp vào `node --input-type=module`, dùng harness/browser/server hiện có, không tạo file source/test. F03 đã quan sát nhập bàn phím thật trong probe ban đầu; probe này exit=1 ở bước chờ trạng thái mạng sau đó. Một probe chuyển đề ban đầu cũng exit=1 vì dùng sai selector id (`partI` thay vì `part-i`); đã sửa selector trong lệnh, chạy lại F01 exit=0. Không dùng các lần lỗi công cụ đó làm kết quả PASS.

Log gốc là output lệnh trong phiên kiểm định này; không ghi đè log vòng 29 của điều phối. Bảng trên và output thực đo trong từng finding là evidence được lưu trong file scope duy nhất này. Build/test bắt buộc sinh lại artifact theo cơ chế sẵn có; git status sau chạy không có thay đổi source/test/dist so với ban đầu.

## Snapshot và giới hạn

SHA256 các file trọng yếu sau kiểm tra, HEAD vẫn không đổi:

| File | SHA256 |
| --- | --- |
| src/app/main.ts | 2EF110D3F440B35780B60A308E97A4812162D385E26140F9305727A25C7DEE12 |
| src/student/area.ts | 93DA43FC65A03426B37062D43F4170DC692130C0DC5669BA7E19E2E6DA60316A |
| src/collect/export.ts | 604D2E850F8D10E83DF55833F4F375B4242ED15A2FE671E1668083E0FA97B270 |
| src/teacher/portal.ts | 393FDE2685494ECC487809AF1A557AC39A2985CF8B10FD09711BC5BF10D7B349 |
| test/claude-check/web.test.mjs | 2286B766D07D6E6E7AECB4CEB70D50F2C1818BF9B7C9CA608DA5692606FA3EFE |
| test/codex-check/browser.test.mjs | 884205E993B846C58174206FE262041007603346FA7E5160DB785148965780E6 |

- files_reviewed: history/diff toàn khoảng theo các hạng mục audit; tập trung src/app/{main,legacy,authoring,role-shell,routes,shell}, src/student/{area,view}, src/collect/{appsScript,export,index}, src/teacher/portal, src/import/preview/view, src/bank/view, src/ui/components.css, scripts/{build,web-build}, apps-script/Code.js, legacy index và các test/harness nêu trên. Không tuyên bố đã review từng dòng của mọi module không đổi hoặc mọi artifact sinh tự động.
- Full `test/**/*.test.ts`: NOT_RUN trong lần audit này; phạm vi bắt buộc yêu cầu hai bộ .mjs và hai tsc. Không chép kết quả unit của vòng trước thành kết quả chạy mới.
- Google/Sheets production, endpoint thật, CORS/readback Google thật: NOT_RUN; chỉ dùng localhost và Google giả lập, không sửa public/config.json, không chạm bảng thật của chủ dự án.
- OS IME Telex/VNI, Firefox/WebKit, AT, performance benchmark, kiểm tra hình ảnh thủ công toàn bộ viewport: NOT_RUN; browser gates hiện có đã đo một số viewport/layout. Không phải nghiệm thu M2–M6 toàn diện.
- Không có quyết định nghiệp vụ mới cần tự chốt để sửa bốn finding: hướng sửa bám hành vi đã ghi rõ trong hợp đồng. Không deploy/đề nghị merge trước khi sửa và kiểm lại.
- recommended_action: giao worker đúng vùng sửa F01–F04, giữ các regression hiện có phù hợp hợp đồng, thêm regression cho các đường hỏng trên; build/typecheck/hai browser suites lại trên snapshot ổn định rồi audit lại.
- privacy_notes: chỉ dùng tài khoản, tên, mã lớp và dữ liệu mô phỏng; không chứa credential production hay nội dung hồ sơ riêng.
