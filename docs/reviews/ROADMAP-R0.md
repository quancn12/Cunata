Verdict: CHANGES_REQUESTED

# R0-REVIEW-1 — kiểm định riêng R0

reviewer: Codex  
reviewed_at: 2026-11-22 (Asia/Bangkok)  
head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`  
risk_level: MAJOR  
recommended_action: sửa các finding dưới đây, bổ sung kiểm định trình duyệt qua đường chạy thật, rồi rà soát lại; chưa đóng R0.

files_reviewed (source/diff và caller liên quan): `src/app/main.ts`, `src/app/legacy.ts`, `src/app/authoring.ts`, `src/app/role-shell.ts`, `src/app/routes.ts`, `src/student/area.ts`, `src/student/index.ts`, `src/student/view.ts`, `src/teacher/portal.ts`, `src/report/{index,types,view,download,table}.ts`, `src/collect/{appsScript,export}.ts`, `src/ui/math.ts`, `src/ui/{components,tokens}.css`, `scripts/{build.js,web-build.ts}`, 8 file `test/codex-check/cx/*.test.mjs`, diff kiểm định Claude/helpers liên quan §20–21, các regression worker R0. Đây là review riêng R0, không phải chứng nhận toàn bộ hệ thống.

## Phạm vi, giả định và mốc lịch sử

- Căn cứ nghiệp vụ: Shared Product Contract v2.0; căn cứ R0: `docs/contracts/WEB-contract.md` (đã đọc toàn bộ, trọng tâm §20–21 và §4.1/§14), `docs/design/DESIGN.md`, `docs/decisions/BANG-QUYET-DINH.md`, `docs/LO-TRINH-V2.md`. Những mục cũ về đề công khai được thay bằng §21; D08 đã chốt công bố lời giải sau nộp. Không tự đặt quyết định nghiệp vụ mới.
- Không tìm thấy commit có đúng subject `Lộ trình R0: test kiểm định` trong lịch sử Git hiện có. **BLOCKED_QUESTION (chỉ mốc lịch sử):** điều phối cần chỉ ra SHA của subject này nếu nó là một mốc khác. Không khẳng định đã tìm thấy subject đó.
- Để vẫn kiểm tra được lỗi hiện hữu, đã xem lịch sử/diff từ trước `14e08dffc4718f6e4c58e1ee7509272a223818e7` (commit §20 và test xem lại bài ngày 18/11) tới HEAD; đối chiếu riêng mốc CX `5e26dbf56aa2e502a7654a5a399df99b47c58f19`, thay đổi §21 `4fb0d1d375fa92ce6d2f1e860581ebdecc5d5e51`, và diff chưa commit trong các vùng R0. Đây là khoảng rà soát bổ sung có chủ ý, không thay thế một SHA còn thiếu bằng khẳng định chắc chắn.
- Working tree ban đầu đã bẩn ở source, dist, test và nhiều tài liệu/vận hành. Review bao gồm source chưa commit vì đó là bản đang được bàn giao; không quy mọi thay đổi cho worker R0. Không sửa hay khôi phục các file có sẵn này.
- Build/test chạy trên bản sao tạm tại `%USERPROFILE%\AppData\Local\Temp\cunata-r0-review-ee4a61a576ff4a368d2feffa897b80a9` (gọi tắt **E**). Không tạo branch hay Git worktree. Dùng compiler đã có qua junction `node_modules`, không cài dependency. File `ops/prod_config.json` bị loại khỏi bản sao, không mở/đọc. Artifact kiểm định và probe chỉ nằm trong E; file duy nhất tạo/sửa trong workspace là báo cáo này.
- SHA256 `src/app/main.ts` đã kiểm: `59E318B10701BC4C28AEC4B974BE114D33B618300355D6376005845F69EF29AB`. Đối chiếu cuối toàn bộ file trong `src/`, `scripts/`, `public/`, `apps-script/` giữa E và workspace: **0 khác biệt**, HEAD vẫn như trên. Kết quả không tự áp dụng cho source đổi sau snapshot.

## Findings đã tái hiện

### R0-F01 — MAJOR — Đường báo cáo thật bỏ mất blocks và ảnh câu hỏi

- **affected_files:lines:** `src/app/main.ts:3009`, `src/app/main.ts:3168`; đối chiếu `src/report/index.ts:357` và `public/exams/toan-full.json:31`.
- **evidence:** renderer màn xem lại chỉ gọi `renderMathText(q.content)`; renderer tải HTML cũng chỉ gọi `renderPortableMathText(q.content || '')`. Cả hai không render `q.blocks` hoặc `q.image`. Vòng thu ảnh trong handler download có quét `q.image` nhưng không chèn ảnh đó vào thẻ câu. Trong khi đó `buildReport` của module report đã có nhánh giữ blocks/image; regression test gọi module này nên xanh mà chưa chứng minh đường UI.
- **reproduction_steps:** mở bản build qua HTTP cục bộ, nhập tên; nạp đề hợp lệ có câu I, `blocks` chứa text `BLOCK-CONTENT-REQUIRED` và ảnh asset, đồng thời có trường `image: "public/q01-bbt.svg"`; nộp bài và tải HTML. Có sẵn ví dụ trường image trong đề Toán của repo, không phải schema giả.
- **expected:** theo §20/§4.1, toàn văn đề, bảng, công thức và ảnh được giữ trong xem lại và HTML tự chứa.
- **actual:** Chrome báo `imageCount: 0`; không có text của block trong thẻ xem lại; HTML tải về cũng không có block/ảnh. Probe quan sát trong `E/r0-probe-2.log`, HTML ở `E/r0-probe-download.html`; regression độc lập R0-F01 đỏ trong `E/r0-independent.tap`.
- **impact:** học sinh mất dữ kiện của câu hỏi khi xem lại/offline. Cùng đường render khi làm bài cũng đang bỏ trường này (`src/app/main.ts:1604`), cần giữ parity khi sửa.
- **minimal_fix:** nối renderer nội dung có hỗ trợ blocks và asset map vào đúng các nhánh đang dùng của app; khi không có blocks thì dựng content + image. Không chỉ sửa module không được UI dùng để vẽ thẻ/download. Ảnh nội bộ phải được nhúng data URI trong HTML.
- **regression_test:** test trình duyệt trên `dist/`, nạp đề có structured text/table/math/image và đề legacy dùng `q.image`, nộp, kiểm nội dung màn xem lại và mở HTML khi offline; không chỉ kiểm `renderReportHtml()` trực tiếp.

### R0-F02 — MAJOR — Đường URL làm bài vẫn mở đề chưa được giao qua lớp

- **affected_files:lines:** `src/app/main.ts:3794–3804`; alias URL trong `src/app/routes.ts:65`.
- **evidence:** nhánh route `exam` tìm đề trong toàn bộ catalog rồi gọi `loadOrResumeExam(exam, false)` chỉ với điều kiện có tên. Không yêu cầu lớp đã vào, assignment đã chọn, hoặc durable draft tương ứng. Nhánh này có cả trong HEAD, không chỉ bản sửa chưa commit.
- **reproduction_steps:** trên context sạch nhập tên ở cổng học sinh, không vào lớp nào; đổi hash thành `#/lam-bai/ly12-hang-tuan-de-10`. Probe xác nhận số `.class-section` trong `#myClasses` bằng 0 trước đổi hash.
- **expected:** §21: chỉ mở lượt mới qua đề được giao trong lớp; link trực tiếp đưa về khu học sinh với thông báo có chữ "giáo viên giao". Vẫn giữ các đường đã cho phép: nạp file ẩn, mở lại báo cáo local, tiếp tục durable draft theo hợp đồng.
- **actual:** `examVisible: true`, tiêu đề `Vật lí 12 — Đề số 10 hàng tuần`, đồng hồ khoảng `49:56`; URL chuẩn hóa thành `#/exam?examId=ly12-hang-tuan-de-10`. R0-F02 trong `E/r0-independent.tap` đỏ: `exam started with zero joined classes`; quan sát ở `E/r0-probe-2.log`.
- **impact:** luồng UI còn mở đề công khai bằng URL thay vì qua lớp. Đây là vi phạm luồng §21, **không** đánh đồng với việc bảo mật file tĩnh: hợp đồng đã chấp nhận file công khai.
- **minimal_fix:** gate việc tạo lượt mới ở nhánh route chung bằng ngữ cảnh bài giao hợp lệ, hoặc chuyển URL catalog trần về student + notice; giữ resume bằng record đã lưu và luồng thẻ lớp. Không chỉ chặn riêng query `?exam=` lúc bootstrap.
- **regression_test:** context có tên nhưng chưa có lớp, thử cả đổi hash sau boot và mở URL mới, với alias `#/lam-bai/<id>` và dạng chuẩn `#/exam?examId=<id>`; phải không tạo lượt mới. Thêm control rằng thẻ lớp/draft hợp lệ vẫn mở được.

### R0-F03 — MINOR — Thẻ xem lại phụ thuộc tiêu đề tác giả để có nhãn phần

- **affected_files:lines:** `src/app/main.ts:3005–3010`, `src/app/main.ts:3165–3169`.
- **evidence:** thẻ màn hình chỉ in `qTitle` và điểm; thẻ HTML thêm trạng thái nhưng không thêm nhãn phần từ `q.kind`. Tiêu đề hợp lệ `Câu 1` không bắt buộc chứa `Phần I`.
- **reproduction_steps:** nạp đề hợp lệ có câu I với title `Câu 1`, content `Nội dung câu hỏi`; nộp và xem thẻ câu/download.
- **expected:** §20 yêu cầu mỗi thẻ có số câu, **phần**, điểm câu và trạng thái; nhãn phần phải được suy từ kind, không dựa vào nội dung tác giả.
- **actual:** thẻ thật có tiêu đề `Câu 1 (0 / 0,25 điểm)` và không có nhãn `Phần I`. R0-F03 độc lập đỏ trong `E/r0-independent.tap` khi kiểm toàn thẻ, không áp đặt nhãn phải nằm ở một vị trí DOM cụ thể.
- **impact:** thiếu thông tin phân loại phần, đặc biệt với đề giáo viên đặt tiêu đề ngắn.
- **minimal_fix:** thêm nhãn phần từ `q.kind` cho cả thẻ UI và HTML; giữ thứ tự presentationOrder và điểm hiện hành.
- **regression_test:** dùng tiêu đề/content không có sẵn chữ chỉ phần; kiểm nhãn I/II/III trong từng thẻ trên màn hình và HTML tải về.

### R0-F04 — MAJOR — Download tự fetch URL ngoài có scheme viết hoa

- **affected_files:lines:** `src/app/main.ts:3055–3063` (diff chưa commit).
- **evidence:** chỉ loại bằng `startsWith('http://')`/`startsWith('https://')` có phân biệt hoa thường, sau đó gọi `fetch(rawSrc)`. URL parser của trình duyệt chấp nhận `HTTP://...`/`HTTPS://...`. Renderer thường loại URL đó, nhưng handler download vẫn fetch nó trước khi render.
- **reproduction_steps:** đặt Markdown trong content là `![tracker](HTTP://127.0.0.1:<cổng giả lập khác>/pixel)`; nạp, nộp và bấm tải HTML. Probe mở server đếm request trên một origin localhost khác; không gọi dịch vụ thật.
- **expected:** §4.1 không tự fetch ảnh/quan hệ ngoài từ nội dung không tin cậy; chỉ resolve asset nội bộ được chấp nhận để nhúng báo cáo.
- **actual:** origin giả lập nhận đúng **1 GET** trong thao tác download; R0-F04 trong `E/r0-independent.tap` đỏ (`expected 0, actual 1`). Đó là request thật trong Chrome, không phải suy luận từ regex.
- **impact:** nội dung đề có thể khiến trình duyệt học sinh gửi request tới host tùy ý khi tải báo cáo, cho phép theo dõi và phá yêu cầu không nạp nguồn ngoài. Chưa chứng minh thực thi JavaScript hay lộ credentials; không gọi đây là SSRF máy chủ.
- **minimal_fix:** resolve bằng `new URL(rawSrc, document.baseURI)`, chỉ cho phép protocol HTTP(S) và origin nội bộ đã duyệt; từ chối redirect khi fetch asset (chẳng hạn `redirect: 'error'`) để không theo chuyển hướng ra ngoài trước khi kiểm. Data URI chỉ qua whitelist MIME/asset hiện có. Không dùng blacklist chuỗi case-sensitive để xác định asset nội bộ.
- **regression_test:** server cục bộ khác origin đếm request, thử `HTTP://`, `HTTPS://`, `//`, scheme trộn hoa thường và redirect ra origin ngoài; download không được phát request ngoài. Control ảnh nội bộ vẫn được nhúng.

## Chống sửa giả và độ phủ

- Đã dò source runtime/diff liên quan R0 với các dấu hiệu `webdriver`, user-agent, `NODE_ENV`, `claude-check`, `codex-check`, ID/tên CX và điểm gắn cứng; không thấy nhánh production phân biệt môi trường kiểm định trong các vùng đã rà soát. Các literal MathML/legacy là chức năng render; không dùng làm bằng chứng tự động rằng mọi source đều an toàn.
- So sánh 8 file CX từ commit promotion tới HEAD: phần assertion của report/schema/collect/teacher/admin/ui giữ nguyên; `app.test.mjs` đổi đường vào sang lớp; `student.test.mjs` bỏ F03/F04/F08/F09 theo quyết định §21 ghi rõ trong bảng quyết định, giữ F01/F05/F06/F10. Không coi những ca bị thay do quyết định này là gian lận. Không thấy nới assert của CX để che các finding mới ở trên.
- Diff các kiểm định Claude chuyển luồng đề công khai sang lớp/file phù hợp §21, thêm kiểm định giao diện và chuột thật. Tuy nhiên helper `startFromCard` có fallback nạp file ẩn; kết quả của helper đó không chứng minh đường route hoặc thẻ lớp được kiểm đầy đủ. Đây là lỗ hổng độ phủ, không phải bằng chứng động cơ gian lận.
- Đã đọc diff vùng report/student/teacher/ui/collect/app, đối chiếu tên đề khi giao lớp, tên học sinh khi nạp file, presentationOrder, Markdown table và các assertion CX; kiểm lại regression worker R0. Không thấy thay đổi package/lockfile trong khoảng đã so. Không sửa code hay bộ kiểm định.

## Lệnh kiểm chứng và artifact

Môi trường: Windows, PowerShell; Node `v24.14.0`, TypeScript `7.0.2`, Chrome `157.0.8103.79`, HTTP localhost dưới `/Cunata/`. Lệnh bên dưới chạy tại E. `--import ./ops/blitz/promoted/_support/runtime.mjs` là helper teardown có sẵn, chỉ giải phóng phản hồi CDP `Browser.close`; đã đọc helper, không đổi assert, thao tác sản phẩm hay kết quả. Dùng concurrency giới hạn để tránh quá tải trình duyệt.

| Kiểm tra | Lệnh / kết quả | Artifact tại E |
|---|---|---|
| Build thật | `node scripts/build.js` — exit 0, emit/promote 339 file; có warning DEP0190 của Node | `r0-build.log` |
| Typecheck Node | `.\node_modules\.bin\tsc.cmd -p tsconfig.json` — exit 0 | `r0-tsc-main.log` |
| Typecheck web | `.\node_modules\.bin\tsc.cmd -p tsconfig.web.json` — exit 0 | `r0-tsc-web.log` |
| Regression worker R0 | `node --test --test-reporter=tap test/report/r0-f01-f03-regressions.test.ts test/collect/r0-f04-regression.test.ts` — exit 0, pass 3/fail 0/skip 0 | `r0-worker-regressions.tap` |
| Bộ mục R0, lần đầu không giới hạn concurrency | `node --test --test-reporter=tap "test/claude-check/**/*.test.mjs" "test/codex-check/*.test.mjs" "test/codex-check/cx/*.test.mjs"` — **INTERRUPTED**, chưa có tổng kết; có timeout page-load 20s, không ghi PASS. Dừng đúng cây tiến trình kiểm định này trước khi chạy lại | `r0-combined.tap` |
| Bộ mục R0, bounded lần 1 | `node --import ./ops/blitz/promoted/_support/runtime.mjs --test --test-concurrency=2 --test-reporter=tap "test/claude-check/**/*.test.mjs" "test/codex-check/*.test.mjs" "test/codex-check/cx/*.test.mjs"` — exit 1, pass 263/fail 9/skip 0, 272 tests; 8 admin hook failures + file-level failure do bản sao thiếu `.git`, không quy lỗi này cho sản phẩm | `r0-combined-bounded.tap` |
| CX admin chạy lại sau sửa môi trường | đặt `GIT_DIR=D:\Cunata\.git` chỉ cho tiến trình kiểm định để đọc HEAD, rồi `node --import ./ops/blitz/promoted/_support/runtime.mjs --test --test-concurrency=1 --test-reporter=tap test/codex-check/cx/admin.test.mjs` — exit 0, pass 8/fail 0/skip 0 | `r0-admin-rerun.tap` |
| Bộ mục R0, bounded đủ môi trường | đặt `GIT_DIR=D:\Cunata\.git`, rồi `node --import ./ops/blitz/promoted/_support/runtime.mjs --test --test-concurrency=2 --test-reporter=tap "test/claude-check/**/*.test.mjs" "test/codex-check/*.test.mjs" "test/codex-check/cx/*.test.mjs"` — **exit 0, pass 271/fail 0/skip 0**, 276,679 giây; không cộng lần chạy admin riêng vào tổng này | `r0-combined-final.tap` |
| Toàn bộ Claude, chạy riêng | `node --import ./ops/blitz/promoted/_support/runtime.mjs --test --test-concurrency=1 --test-reporter=tap "test/claude-check/**/*.test.mjs"` — exit 0, pass 104/fail 0/skip 0, 110,663 giây | `r0-claude-repeat.tap` |
| Regression độc lập trên browser thật | `node --test --test-reporter=tap r0-independent.test.mjs` — exit 1, pass 0/fail 5/skip 0; **4 finding/subtest đỏ + 1 parent đỏ**, không phải 5 lỗi độc lập | `r0-independent.test.mjs`, `r0-independent.tap` |
| Probe quan sát UI/download | `node r0-probe.mjs` — exit 0; exit này chỉ có nghĩa probe chạy xong, **không** có nghĩa sản phẩm PASS | `r0-probe-2.log`, `r0-probe-download.html` |

## Giới hạn và bàn giao

- NOT_RUN: Google/Vercel/Neon thật, deploy, kiểm điện thoại vật lý/Telex-VNI hệ điều hành/trình đọc màn hình thật. Các backend của kiểm định là server cục bộ/giả lập; không gọi đó là nghiệm thu dịch vụ thật.
- Không chạy toàn bộ các mục R1–R11 hoặc coi kết quả của chúng là verdict R0. Không cập nhật roadmap/state, không commit, không install.
- Source report-module được sửa chưa đủ để nghiệm thu đường app; các kiểm định chuẩn xanh không phủ bốn ca độc lập này. Cần worker sửa đúng các nhánh runtime được chỉ ra, giữ nguyên bộ kiểm định hiện có, thêm regression trong scope test được điều phối giao, và chạy lại trước khi yêu cầu APPROVED.
- Tổng kết: build + hai tsc xanh, bộ mục đầy đủ **271/271** và Claude chạy riêng **104/104** xanh; regression độc lập vẫn tái hiện **3 MAJOR + 1 MINOR**. Verdict giữ **CHANGES_REQUESTED**. Chưa xác nhận điều kiện hai lần xanh liên tiếp của roadmap: lần bounded trước đã lỗi môi trường và đã được ghi trung thực, không đổi nó thành PASS.
