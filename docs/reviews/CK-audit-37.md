# CK-AUDIT-37 — Kiểm định độc lập sau vòng 37

Verdict: **CHANGES_REQUESTED**

- review_id / task_id: CK-AUDIT-37; reviewer: Codex; risk_level: HIGH.
- verified_at: 2026-11-17; Windows/PowerShell; Node v24.14.0; TypeScript 7.0.2; Chrome thật, headless qua CDP có sẵn, HTTP localhost dưới `/Cunata/`.
- base_commit: `0d8cf281639c8cf651947acc9104f3ca1ceab96b`, commit đầu tiên có message “Bộ kiểm định web của Claude (test/claude-check) + vòng sửa tự động”. Có bảy commit cùng tên; dùng mốc đầu tiên, đối chiếu thêm khoảng `f735eed..HEAD` và bản sửa `1d8b570`.
- head_commit: `b8a0b4d05ed8de51a14d79f3fd83ac5b0cc67e9e`; không đổi trong phiên kiểm định.
- requirements_version: Shared Product Contract v2.0; toàn bộ WEB-contract.md, gồm cập nhật §14–19; mẫu bàn giao M1 §2; DESIGN.md.
- Working tree ban đầu có hai log đã sửa (`ops/fix_loop.out.txt`, `ops/overnight.log`), manifest round37 và thư mục prompts untracked. Giữ nguyên; chỉ tạo báo cáo này. Không sửa code/test, cài dependency, tạo branch/worktree, commit hoặc deploy. Build tái sinh dist, không phát sinh diff sản phẩm.

## Kết quả rà gian lận và sửa giả

Không tìm thấy nhánh gian lận còn hiện hành trong các vùng đã rà: nhận diện `navigator.webdriver`/headless/user-agent, trả điểm cố định theo tên/ID đề kiểm định, hoặc tắt chức năng theo môi trường test. Đây là kết luận theo phạm vi kiểm tra, không phải chứng nhận mọi dòng lịch sử hoặc kết luận về động cơ tác giả.

- Đã xem `git log`/`git diff` từ baseline cho source, Apps Script, build và test; tìm thêm lịch sử bằng `git log -G` cho webdriver, HeadlessChrome, userAgent, ID Claude/Codex và biến môi trường. Comment headless trong PDF và kiểm khả năng PDF viewer không phải nhận diện bộ kiểm định. So sánh examId/version ở storage/receipt/route có mục đích nghiệp vụ; không thấy nhánh tên fixture trả kết quả đặc biệt.
- **Có bằng chứng sửa giả trong lịch sử, đã được gỡ:** `scripts/web-build.ts@237aeb8:252` và `:259` sửa bản build của `public/exams/index.json`, thêm title và câu giả `q-index-meta` chỉ để đáp ứng build validation vốn nhầm manifest là đề. `d3d81b9` gỡ đoạn đó. HEAD không còn đoạn sửa manifest; test hiện phân biệt manifest với đề, kiểm schema manifest và đối chiếu byte public/dist-public. Các kiểm tra này PASS trong phiên này. Không báo lỗi lịch sử đã sửa thành finding hiện hành.
- `git diff 0d8cf28..HEAD -- src/domain package.json package-lock.json tsconfig.json tsconfig.web.json` rỗng. Domain không bị đổi quy tắc chấm trong khoảng kiểm. Adapter module tiếp tục gọi scorer domain; thay định dạng rational theo D02 không đổi công thức. Bộ Codex browser đã đối chiếu golden score, gồm max 5/15/16, phần II và chuỗi III chính xác.
- Không thấy file test bị xóa trong khoảng kiểm. Không tìm thấy `.skip`, `.todo`, `.only` hay tùy chọn skip/todo trong hai bộ bắt buộc; mọi lượt chạy có skipped/cancelled/todo=0.
- Thay assertions after_deadline theo D08 và định dạng điểm theo D02 có căn cứ yêu cầu. Giới hạn test tính năng mới ở dist và giữ luồng chọn đề cũ ở root phù hợp §18–19. `ef1f4cf` chuyển nhập tên lên cổng tên; helper vẫn xác nhận đúng tên và ném lỗi nếu ô readonly không khớp. Assertions XSS/CSV/restore vẫn giữ. Chỉnh mock Sheets sang KetQua và unwrap Result vẫn kiểm lỗi/trạng thái, không thấy nới assertion không có lý do trong các diff đã đọc.
- Năm gate không đủ chứng minh sửa đúng: còn hai finding dưới đây. Lỗi mới F01 xuất hiện trong logic khôi phục lịch vừa thêm ở `1d8b570`.

## Findings đã xác minh

### CK37-F01 — MAJOR — Hạn của bài giao A làm hỏng lưu IndexedDB khi bắt đầu đề luyện tập B

- affected_files: `src/app/main.ts:866`, `src/app/main.ts:871`, `src/app/main.ts:2060`, `src/app/main.ts:2358`, `src/app/main.ts:2389`; đường kiểm hạn: `src/student/index.ts:820`.
- evidence: `resolveAssignmentSchedule` lấy lịch từ `finalRecord` mà không kiểm examId/examVersionId hoặc assignment. `loadOrResumeExam` đã đổi currentExam sang B rồi gọi resolver, trong khi finalRecord vẫn là A; việc xóa finalRecord xảy ra muộn ở :2358. Hạn A được gắn vào options khởi tạo B. Controller từ chối ASSIGNMENT_PAST_DUE; main bỏ lỗi, tiếp tục render B với controller=null. Nhánh saveDraft dự phòng không tạo được bản ghi mới khi gặp STORAGE_CONFLICT vì record chưa tồn tại.
- reproduction_steps: Probe `node --input-type=module -` qua stdin, không tạo file test. Dùng startGasServer chạy Code.js thật trên Google giả lập; admin tạo giáo viên, giáo viên xuất bản hai đề một câu III key `1,5`, ID ngẫu nhiên A/B, maxAttempts=null. Giao A vào lớp, openAt=now−60 giây, dueAt=now+12 giây. Chrome qua cổng tên → vào lớp bằng mã → làm A → nộp → chờ qua dueAt 500 ms. Bấm “Về trang học sinh” → chọn B trong practiceExams → bắt đầu → nhập `1,5` → đợi 1,8 giây → đọc IndexedDB bằng transaction readonly.
- actual: Probe exit=0. Nút làm lại A sau hạn `{hidden:true, disabled:true}`: ca lỗi cũ CK36-F01 đã được sửa ở đường này. Nhưng B vẫn hiện màn làm bài với raw=`1,5`, sync=`Chưa lưu`; store attempts chỉ có final của A, **không có draft B**. ID lần đo: A=`A-cc64f016-d827-440d-85b3-db9670d9824c`, B=`B-cc64f016-d827-440d-85b3-db9670d9824c`; dueAt A=`2026-11-17T06:52:41.159Z`. Một probe độc lập trước đó chuyển sang đề tĩnh `ly12-hang-tuan-de-10` cũng không có draft đề mới.
- expected: B không thuộc assignment A nên phải bắt đầu bình thường, tạo draft B bằng transaction IndexedDB và lưu câu trả lời. Lịch A chỉ áp dụng cho đúng bài giao A.
- impact: Sau khi nộp bài giao rồi chuyển sang luyện tập, tính năng lưu durable bị hỏng dù IndexedDB đang hoạt động. Có localStorage mirror: probe reload khôi phục raw=`1,5` và sau đó tạo được draft B. Vì vậy **không kết luận mất đáp án sau reload**; lỗi được chứng minh là lượt B ban đầu không có durable draft và hiện “Chưa lưu”, trái D03. Không được coi mirror là thay thế bảo đảm lưu IndexedDB.
- minimal_fix: Ràng buộc nguồn lịch theo tuple đề/phiên bản/assignment; không đọc finalRecord của đề khác. Đặt lại ngữ cảnh lượt cũ trước khi giải lịch cho đề mới, vẫn giữ metadata khi mở lại đúng assignment. Xử lý Result lỗi khởi tạo rõ ràng, không tiếp tục luồng thi với controller=null do lỗi nghiệp vụ. Không sửa bằng cách bỏ kiểm hạn, tắt autosave hoặc tăng timeout test.
- regression_test: A được giao → nộp → qua hạn → mở B chưa có lượt → nhập đáp án: phải có draft B/đáp án trong IndexedDB ngay trước reload, không kế thừa dueAt A. Chạy cho cả B tĩnh và B giáo viên xuất bản; thêm trường hợp A chưa hết hạn để kiểm metadata không rò sang B. Giữ test A làm lại trước/sau hạn và khôi phục đúng lịch sau reload.

### CK37-F02 — MINOR — Phiên công bố tám giờ vẫn hết hiệu lực sau sáu giờ

- affected_files: `apps-script/Code.js:1102`, `apps-script/Code.js:1104`, `apps-script/Code.js:1109`, `apps-script/Code.js:1110`.
- evidence: newSession trả expiresAt=now+8 giờ nhưng CacheService TTL=21600 giây; sessionPrincipal coi cache miss là vô hiệu, không có nguồn giữ phiên đủ hạn. Đây là CK36-F02 vẫn tồn tại; bản sửa vòng 36 không thay Code.js.
- reproduction_steps: `node --input-type=module -` import makeGas, gọi adminLogin, giữ token trong RAM. Tạm đổi Date.now của tiến trình probe tới lúc đăng nhập+21601000 ms, gọi adminStats bằng token đó, khôi phục Date.now trong finally. Fake cache giữ TTL của chính Code.js; không gọi Google thật.
- actual: Probe exit=0; `{advertisedHours:8, atHours:6.000277777777778, result:{success:false,error:"UNAUTHORIZED",message:"Phiên đăng nhập không hợp lệ"}}`.
- expected: Phiên còn hiệu lực trước expiresAt theo §19.2, trừ thu hồi/khóa/reset hợp lệ. Không công bố tám giờ trong khi chủ động chỉ giữ sáu giờ.
- impact: Giáo viên/admin phải đăng nhập lại sớm hơn thời hạn công bố; không suy diễn mất draft từ probe này.
- minimal_fix: Có nguồn phiên phía máy chủ giữ đủ tám giờ, kiểm expiry và thu hồi; cache chỉ tăng tốc. Không chỉ hạ expiresAt xuống sáu giờ hoặc bỏ TTL trong fake. Thời hạn tám giờ đã được hợp đồng nêu, không cần tự đặt quyết định nghiệp vụ mới.
- regression_test: Đăng nhập → 6 giờ+1 giây và 7 giờ 59 phút còn hợp lệ; 8 giờ hết hạn. Cache miss phải khôi phục được phiên còn hạn; khóa/reset vẫn thu hồi đúng. Đây là test clock/cache mô phỏng, không thay xác minh Google live.

## Checks chạy thật

| Lệnh / kiểm tra | Exit | Kết quả |
| --- | ---: | --- |
| `node scripts/build.js` | 0 | PASS; emit/promote 318 files vào dist; có cảnh báo DEP0190. |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS; không diagnostic. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS; không diagnostic. |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | PASS: tests=77, suites=5, pass=77, fail=0, skipped=0, cancelled=0, todo=0; duration_ms=32414.8849. |
| `node --test "test/codex-check/**/*.test.mjs"` — lần 1 | 1 | FAIL: tests=116, suites=2, pass=115, fail=1, skipped=0, cancelled=0, todo=0; duration_ms=43311.7479. |
| Cùng lệnh Codex — chạy lại đầy đủ | 0 | PASS: tests=116, suites=2, pass=116, fail=0, skipped=0, cancelled=0, todo=0; duration_ms=39684.7843. |
| Probe Chrome/CDP: A hết hạn → đề tĩnh khác | 0 | A khóa làm lại; đề mới không tạo durable draft. |
| Probe Chrome/CDP: A hết hạn → B xuất bản → input → đọc IDB → reload | 0 | Xác minh F01 và giới hạn tác động; trước reload không có B trong IDB, sau reload khôi phục mirror và có B. |
| Probe Code.js/makeGas với clock +6 giờ+1 giây | 0 | Xác minh F02. |
| `git diff --check` | 0 | Không lỗi whitespace ở diff hiện có. |

Ca Codex đỏ lần đầu: `dist: [import] generated DOCX preview preserves table/image or explicitly warns`, tại `test/codex-check/browser.test.mjs:178`; hết 5000 ms chờ “DOCX preview text before confirmation”, stack helper :174 và harness.mjs:186. Lần chạy lại đầy đủ ca đó PASS (~734 ms). Chưa xác minh nguyên nhân dao động; không tự kết luận lỗi parser hoặc sửa timeout/assertion để bỏ qua. Hai suite bắt đầu lệch thời điểm và có thể cùng chạy trong lượt đầu; không dùng kết quả chạy lại để xóa kết quả FAIL đã quan sát. Không tái chạy vô hạn.

Log artifact: output terminal của phiên này; số liệu và bằng chứng quan trọng đã chép vào báo cáo, không tạo thêm log ngoài scope. Các probe dùng backend giả lập và lớp/đề tổng hợp, không ghi Google Sheet thật. Không xuất token/mật khẩu phiên.

## Phạm vi và giới hạn

- files_reviewed: source/build/Apps Script/test diff từ baseline; đọc sâu main/controller/student area, adapter score, collector, account/session, helper/assertion test và bản sửa 1d8b570; kiểm cả root và dist qua các suite bắt buộc. Không chứng nhận toàn bộ binary/screenshot hoặc mọi đường chạy lịch sử.
- Bộ `.test.ts` toàn dự án và oracle Python: NOT_RUN trong phiên này, không thuộc năm lệnh được giao. Browser golden đã chạy không đồng nghĩa chạy toàn bộ oracle Python.
- Google Apps Script/CORS/Sheet live: NOT_RUN; kiểm định cục bộ không được ghi bảng thật theo §17.5. Fake backend không phải chứng cứ CORS/retention Google live; public/config.json trong repo giữ URL rỗng.
- Design suite đã đo 375/1440px; kiểm thủ công đầy đủ 768px, sáng/tối, OS Telex/VNI, browser khác, security audit toàn diện và owner acceptance: NOT_RUN. Không tuyên bố nghiệm thu toàn bộ sản phẩm.
- Snapshot SHA256: main.ts=`129DAD85B3DA1904D9D9EBE3DC4DB0DAE856AE36FE55CE820BAB32774024E56D`; student/index.ts=`316245AA007E47C4A621EC88D355A7C94BE694574EE9F47AF9F264B95725BEB4`; student/area.ts=`43005D4A24F097E4E4971AC8BE21E23D3D801A43F044248A13473F21D6EFF0DC`; Code.js=`C9137583F9CAB1E5D53FB7B07957665C6BA0160D014F74C2A9D09946ABADBB60`.
- recommended_action: giao worker sửa F01 và F02, thêm regression hành vi, chạy lại năm gate rồi review snapshot mới. Giữ bằng chứng timeout DOCX để theo dõi nếu tái phát. Chưa duyệt release/deploy; không sửa code trong task này.
- privacy_notes: báo cáo chỉ chứa kết quả kỹ thuật và dữ liệu tổng hợp; không đưa nội dung hồ sơ riêng.
