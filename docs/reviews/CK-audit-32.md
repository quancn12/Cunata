# CK-AUDIT-32 — Kiểm định độc lập sau vòng 32

Verdict: **CHANGES_REQUESTED**

- review_id / task_id: CK-AUDIT-32; reviewer: Codex; risk_level: HIGH.
- Kiểm tra ngày 17/11/2026, Windows/PowerShell, Node v24.14.0, TypeScript 7.0.2, Python 3.11.0; trình duyệt thật qua CDP, HTTP localhost.
- base_commit: `0d8cf281639c8cf651947acc9104f3ca1ceab96b`, commit đầu tiên có message “Bộ kiểm định web của Claude (test/claude-check) + vòng sửa tự động”. Có bảy commit cùng message; không chỉ lấy commit gần nhất làm baseline.
- head_commit: `e745da6d0c1f3cebdd2f38d741d8ebb7af7d3783`.
- Rà thêm khoảng gần nhất `f735eedf122691c4abd68ca3d57b367dfea99d1e..HEAD` và các sửa sau audit 29. HEAD không đổi trong phiên.
- requirements_version: Shared Product Contract v2.0; WEB-contract v1.0 và bổ sung §14–19; M1 scoring contract; DESIGN.md cho hành vi giao diện.
- Working tree ban đầu: hai file ops/fix_loop.out.txt, ops/overnight.log đã sửa; ops/fix/round32/CK-AUDIT-32.json và thư mục prompts/ untracked. Giữ nguyên các thay đổi có sẵn. Chỉ bàn giao báo cáo này; không sửa code/test, install, thêm dependency, commit hoặc deploy.

## Kết luận rà gian lận và sửa giả

Không tìm thấy bằng chứng đủ để kết luận có gian lận có chủ ý. Tuy nhiên, ba lỗi sản phẩm dưới đây đã được tái hiện độc lập; các gate xanh không đủ để APPROVED.

- `git diff 0d8cf28..HEAD -- src/domain package.json package-lock.json` rỗng: không có thay đổi domain hoặc dependency trong khoảng kiểm tra. Không thấy sửa quy tắc chấm M1 trong domain.
- Đã rà log/diff và quét source sản phẩm, legacy index, build scripts, Apps Script cho webdriver, headless, user-agent/userAgent, tên bộ test/oracle, môi trường test, điều kiện ID/tên đề và điểm cố định. Không thấy nhánh production dò môi trường kiểm định hoặc trả điểm theo tên/ID fixture. `navigator.pdfViewerEnabled` là kiểm khả năng viewer, không phải bằng chứng gian lận.
- Hai bộ test bắt buộc không có `.skip`, `.todo`, `.only` hoặc cấu hình skip/todo tìm được; các lần chạy thực tế đều skipped=0, cancelled=0, todo=0. Không thấy xóa hai bộ kiểm định để làm xanh.
- Thay expectation format điểm có căn cứ D02; thay behavior lời giải sau nộp có căn cứ D08; thay bootstrap/route và phạm vi root/dist có căn cứ §18–19. Không coi các thay đổi được hợp đồng giải thích là gian lận.
- Test Apps Script chuyển mock từ getActiveSheet sang getSheetByName('KetQua') phù hợp §17.3 và giữ assertions. Test thiết kế được thêm kiểm tra che câu hỏi/thanh trên, tăng coverage.
- CDP waitForVisible đổi sang duyệt mọi phần tử khớp selector phù hợp selector kết hợp. Cold-offline regression mở rộng selector nhận startScreen/roleChooser phù hợp luồng mới sau nộp; riêng assertion đó không chứng minh mở lại đúng báo cáo offline.
- bank-backup.json là fixture bị test ghi lại từ export. Lần chạy này cũng làm nó thay đổi; đã hoàn nguyên đúng byte HEAD ban đầu sau khi test kết thúc. Không dùng diff fixture đó để suy đoán động cơ sửa test.
- Sửa accessor readOnly từ audit 29 đã bỏ workaround override DOM, và test/student/area.test.ts:169 chuyển sang bảo vệ readonly. Nhưng đường main thực tế vẫn mở khóa input, xem F02. Tích hợp outbox và hợp nhất catalog teacher đã có; không coi hai lỗi CK29-F02/F04 cũ là vẫn tồn tại chỉ từ báo cáo cũ. F03 là lỗi fallback mới được kiểm chứng trực tiếp.

## Findings đã xác minh

### CK32-F01 — MAJOR — Báo “Đã lưu” dù ghi câu trả lời vào IndexedDB thất bại

- affected_files: `src/app/main.ts:1046`, `src/app/main.ts:1062`, `src/app/main.ts:1169`, `src/app/main.ts:1175`.
- evidence: lastSaveOk khởi tạo true, chỉ được gán true trong đường thành công; không có đường gán false khi controller.answer/saveDraft trả lỗi. Cuối lượt lưu, pendingSaveCount về 0 thì badge lấy lastSaveOk thay vì phản ánh lần ghi thất bại.
- reproduction_steps: Mở dist qua cổng tên và thẻ đề, chờ badge Đã lưu. Trong browser probe, thay IDBObjectStore.prototype.put để ném QuotaExceededError khi store là attempts; các store khác giữ nguyên. Bấm một phương án I, chờ promise xử lý, đọc badge và đọc attempts bằng IndexedDB thật.
- actual: probe exit=0; `failedWrites=1`, `status="Đã lưu"`; record bền vững vẫn có `responses.responses=[]`. Đây là fault injection vào browser để mô phỏng quota, không sửa source hoặc dùng mock DOM.
- expected: Ghi thất bại phải hiện Chưa lưu/lỗi lưu, giữ đáp án đang nhập và chỉ báo thành công sau khi đáp án tương ứng được ghi bền vững.
- impact: Học sinh tin câu trả lời đã được lưu nhưng refresh/đóng tab có thể làm mất câu vừa chọn. Vi phạm trạng thái trung thực của Shared Product Contract §3 và WEB-contract §6.
- minimal_fix: Theo dõi kết quả lưu theo attempt và phiên bản thay đổi; đánh dấu lỗi của dữ liệu chưa persist, không để thành công cũ hoặc callback khác che lỗi mới. Với nhiều save đang chờ, chỉ báo Đã lưu khi mọi thay đổi cần giữ đã được xác nhận bền vững; thêm thông báo và đường khôi phục khi quota lỗi.
- regression_test: Browser quota/write failure sau một lần save thành công phải hiện lỗi, durable record không nhận đáp án mới; bật lại ghi rồi retry phải lưu đúng đáp án mới và mới được đổi badge. Thêm trường hợp các save thành công/thất bại xen kẽ.

### CK32-F02 — MAJOR — Main vẫn mở khóa tên thí sinh khi bắt đầu bài

- affected_files: `src/app/main.ts:2049`, `src/app/main.ts:2051`, `src/app/main.ts:2092`, `src/app/main.ts:2094`, `src/app/main.ts:2684`.
- evidence: Main đặt readOnly=false và xóa readonly ở đường bắt đầu/làm bài; area đặt true không bảo vệ được sau các lệnh này. Test readonly hiện chỉ kiểm controller area độc lập, không kiểm composition root thực tế.
- reproduction_steps: Mở dist mới, nhập tên ở cổng tên, chọn đề và bắt đầu. Focus/select #candidateName rồi dùng CDP Input.insertText gõ tên khác, không gán value trực tiếp.
- actual: probe exit=0; trước nhập `{name:"Học sinh kiểm định",readonly:false,status:"Đã lưu"}`. Sau Input.insertText, tên thành `Audit32 changed during exam`; durable record cũng mang tên mới. Sau xử lý input area có thể đặt readonly=true trở lại, nhưng lần sửa tên đã được nhận và lưu.
- expected: #candidateName chỉ đọc trong toàn bộ màn làm bài theo WEB-contract §19.1; thay tên qua thao tác #btnChangeName ở khu học sinh.
- impact: Luồng thực tế vẫn vi phạm hành vi đã chốt và audit 29 chưa được sửa hoàn chỉnh. Không còn accessor override, nhưng việc chỉ sửa test/helper không chứng minh main đã đúng.
- minimal_fix: Giữ readonly native ở mọi đường start/resume/render exam; bỏ các lệnh mở khóa trong main, bảo toàn tên lấy từ cổng tên. Nếu cần sửa tên, dùng luồng đổi tên được hợp đồng cho phép.
- regression_test: Browser qua luồng thật chọn vai → cổng tên → thẻ đề → bắt đầu; thử gõ/paste vào #candidateName ngay sau start và sau reload, tên không đổi. Kiểm tên giữ nguyên trong IndexedDB, autosubmit và báo cáo.

### CK32-F03 — MAJOR — Lỗi tải đề giáo viên bị biến thành tải thành công một đề tĩnh khác nội dung

- affected_files: `src/collect/appsScript.ts:666`, `src/collect/appsScript.ts:669`, `src/collect/appsScript.ts:671`, `src/collect/appsScript.ts:680`; caller `src/student/area.ts:768`.
- evidence: getExam trả sớm khi server thành công; mọi kết quả lỗi còn lại đều đi vào fallback manifest tĩnh, không chỉ NOT_FOUND như comment. Khi teacher đã override cùng examId, fallback này âm thầm thay nội dung người dùng vừa chọn. Catalog có giữ source='teacher', nhưng client đã đổi lỗi server thành ok:true trước khi caller kiểm.
- reproduction_steps: Chạy Code.js thật trong Google giả lập, tạo giáo viên và publish đề 1 câu có examId `ly12-hang-tuan-de-10`, title `Audit32 teacher replacement`. Mở context học sinh mới, xác nhận thẻ teacher đã thắng bản tĩnh. Bằng script CDP nạp trước trang, bọc fetch: chỉ khi bật cờ và URL có action=getExam mới trả `{success:false,error:"INTERNAL_ERROR",message:"temporary outage"}`; các request khác đi mạng localhost bình thường. Bật cờ sau khi catalog tải xong, bấm thẻ teacher và bắt đầu.
- actual: probe cuối exit=0. Thẻ hiển thị `Audit32 teacher replacement`, `Đề giáo viên xuất bản`, `1 câu · 50 phút`; bài thực sự mở là `Vật lí 12 — Đề số 10 hàng tuần`, có 28 câu. Probe API độc lập cũng cho thấy INTERNAL_ERROR → fetch manifest → fetch file static → `{ok:true,value:...}`.
- expected: Khi đã chọn nguồn teacher, tải lỗi phải báo lỗi và cho thử lại; không tráo sang bản static cùng ID. WEB-contract §17.4 yêu cầu bản teacher thắng khi trùng ID; version/snapshot phải đúng đề đã chọn.
- impact: Học sinh làm nội dung/câu hỏi/đáp án khác đề giáo viên xuất bản mà không có thông báo; báo cáo và kết quả có thể thuộc sai phiên bản.
- minimal_fix: Giữ provenance/source trong đường load. getExam của Apps Script nên truyền nguyên lỗi cho nguồn teacher; xử lý static qua loader riêng của catalog. Nếu giữ fallback cho mục đích khác, caller phải yêu cầu rõ và không dùng nó cho teacher override. Không coi mọi lỗi mạng/server/auth là NOT_FOUND.
- regression_test: Publish override ID tĩnh, kiểm nội dung teacher khi server khỏe; getExam trả INTERNAL_ERROR/500/timeout thì không bắt đầu static và hiện lỗi; thử lại khôi phục phải mở đúng teacher. Đề static thông thường vẫn mở được khi catalog teacher lỗi.
- probe_limits: Một probe browser đầu tiên bọc window.fetch sau bootstrap không tác động fetch đã được client giữ tham chiếu, nên vẫn mở teacher đúng; không dùng lần ấy làm bằng chứng lỗi. Probe cuối cài wrapper trước bootstrap rồi bật cờ sau catalog mới tái hiện fallback.

## Checks chạy thật và bất ổn cần giữ lại

| Lệnh / kiểm tra | Exit | Kết quả thực đo |
| --- | ---: | --- |
| `node scripts/build.js` | 0 | PASS; emit/promote 318 files vào dist, assets/schema/Apps Script syntax hợp lệ. Có warning DEP0190. |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS, không diagnostic. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS, không diagnostic. |
| `node --test "test/claude-check/**/*.test.mjs"` — lần 1 | 1 | tests=77, pass=76, fail=1, suites=5, skipped=0, cancelled=0, todo=0; duration_ms=114156.7159. |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | tests=116, pass=116, fail=0, suites=2, skipped=0, cancelled=0, todo=0; duration_ms=132973.3116. |
| `node --test --test-name-pattern="D02: điểm vô hạn" "test/claude-check/web.test.mjs"` | 0 | tests=2, pass=2, fail=0, skipped=0; duration_ms=1840.4237. |
| `node --test "test/claude-check/**/*.test.mjs"` — rerun sau Codex suite | 0 | tests=77, pass=77, fail=0, suites=5, skipped=0, cancelled=0, todo=0; duration_ms=51344.2173. |
| `python -B test/oracle/oracle.py --check` | 0 | tests=11, pass=11, fail=0; 1632 fixtures, 5849 maxima configurations, 9 negative controls. Đây là oracle độc lập, không tự chứng nhận product. |
| Browser probe F01/F02, IndexedDB thật và quota injection | 0 | Xác minh false save badge, durable responses rỗng và tên bị sửa bằng Input.insertText. |
| API probe F03 bằng fetch inject trong bộ nhớ | 0 | Server INTERNAL_ERROR bị đổi thành static ok:true. |
| Browser probe F03 cuối, Code.js + localhost + lỗi getExam có kiểm soát | 0 | Thẻ teacher 1 câu mở static 28 câu cùng ID. |
| `git diff --check` | 0 | Không lỗi whitespace trước khi tạo báo cáo. |

**Lần chạy Claude đầu không được ghi đè thành PASS.** Hai suite browser ban đầu chạy đồng thời. Case tại `test/claude-check/web.test.mjs:267` gõ hai đáp án III rồi nộp; assertion `:275` nhận `2,33 / 7` thay vì `4,67 / 7` (actual `2,33/7`, expected `4,67/7`). Rerun case riêng và rerun toàn suite đều xanh mà không thay code. Nguyên nhân **SUSPECTED / NOT VERIFIED**: có thể liên quan timing nhập/lưu/khởi tạo dưới tải; chưa có capture raw responses hoặc durable record của đúng lần đỏ để phân biệt product race với harness race. Không kết luận sai công thức domain hoặc quy lỗi cho làm tròn. Cần giữ assertion, thu trace input/response/revision và tái hiện có điều khiển trước khi tuyên bố ổn định; không thêm sleep hoặc nới expected để che lỗi.

Logs gốc nằm trong output công cụ của phiên; không ghi đè log round32 của điều phối. Các bảng và số đo trên lưu evidence trong file scope duy nhất này. Build và test sinh lại artifact theo cơ chế hiện có; fixture test ghi ra được hoàn nguyên về trạng thái ban đầu, source/test/dist không có diff do audit.

## Phạm vi, snapshot và giới hạn

- files_reviewed: git log/diff từ baseline đầu tiên, diff riêng vòng 27–32; src/app/{main,legacy,authoring,role-shell,routes,shell}, src/student/{area,index,view}, src/collect/{appsScript,index,export}, src/storage, src/teacher/portal, src/import/preview/view, src/offline, scripts/{build,web-build}, apps-script/Code.js, index.html; diff test/harness/CDP/e2e/report/storage/student/offline liên quan. Không tuyên bố review từng dòng của mọi artifact binary/generated hoặc module không đổi.
- Full `test/**/*.test.ts`: **NOT_RUN**, ngoài phạm vi lệnh bắt buộc của task; không sao chép PASS unit từ vòng trước. Hai tsc và các suite .mjs ở bảng là chạy mới.
- Google production, endpoint/Sheet thật, CORS/readback Google thật: **NOT_RUN** theo §17.5; public/config.json giữ rỗng, chỉ sử dụng server localhost và Google giả lập.
- OS IME Telex/VNI, Firefox/WebKit, AT, benchmark hiệu năng và visual QA thủ công toàn bộ viewport: **NOT_RUN**. Các ca design trong Claude suite thực sự chạy browser ở 375/1440px; không thay cho nghiệm thu UI toàn diện.
- Không cần chốt nghiệp vụ mới để sửa F01–F03; expected đã có trong hợp đồng. Không sửa chính sách hoặc source trong audit này.
- recommended_action: giao worker đúng vùng sửa ba finding, bổ sung regression đi qua composition root, điều tra bất ổn D02 rồi chạy lại build/hai tsc/hai browser suites trên snapshot ổn định trước audit tiếp. Chưa đề nghị deploy/nghiệm thu.
- privacy_notes: dữ liệu/tài khoản/tên trong probe là mô phỏng; không dùng credential production hoặc đưa nội dung hồ sơ riêng vào bàn giao.

SHA256 của snapshot đã kiểm:

| File | SHA256 |
| --- | --- |
| src/app/main.ts | E963FDFF92EE34B12796D49C55E6663B3E68676E0E935B6B138D776E664056F4 |
| src/student/area.ts | CEA0D4A71BDC5F2F24A6955EC3260E982FC022EDBC99778921002E31846977F2 |
| src/collect/appsScript.ts | D2463AE18710F5AC9550D1A6DF33B64094402E09325DB03C817ED858DE6F66ED |
| src/teacher/portal.ts | 393FDE2685494ECC487809AF1A557AC39A2985CF8B10FD09711BC5BF10D7B349 |
| test/claude-check/web.test.mjs | 2286B766D07D6E6E7AECB4CEB70D50F2C1818BF9B7C9CA608DA5692606FA3EFE |
| test/codex-check/browser.test.mjs | 884205E993B846C58174206FE262041007603346FA7E5160DB785148965780E6 |
