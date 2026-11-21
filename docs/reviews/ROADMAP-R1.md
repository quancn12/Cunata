Verdict: CHANGES_REQUESTED

# R1-REVIEW-0 — máy chủ Vercel lõi

- Reviewer: Codex; ngày kiểm: 22/11/2026; risk_level: HIGH.
- base_commit: `cd8a9f5299f4f7fa4995c267f04688dcd3508e0f` (commit “Lộ trình R1: test kiểm định”); đã xem cả diff từ cha của commit này để tính phần test ban đầu.
- head_commit: `2e92074f1ee4225d9ae1ef7c452015eb42085266`.
- Phạm vi đọc: toàn bộ `src/api/**`, phần API/build trong `scripts/web-build.ts`, hai tsconfig, package/lock diff, test R1, thay đổi liên quan trong `test/claude-check`, callers của metadata bài giao và mã Apps Script để đối chứng tương thích. Không sửa sản phẩm hoặc test.
- Căn cứ yêu cầu: Shared Product Contract v2.0; `docs/contracts/WEB-contract.md` (đã đọc toàn bộ, trọng tâm §17.2, §19.1–19.2a, §22), `docs/design/DESIGN.md`, `docs/decisions/BANG-QUYET-DINH.md`, `docs/LO-TRINH-V2.md`.

## Kết luận

Chưa thể duyệt R1: còn 8 findings, trong đó có ghi đè đề trái quyền khi tranh chấp, xác nhận bài nộp không được lưu và phiên dùng mật khẩu cũ sống sót sau reset. Bộ R1 hiện có xanh không phủ các trường hợp này. Đề nghị giao worker sửa, bổ sung regression dưới quyền chủ bộ kiểm định, rồi review lại; chưa đánh dấu R1 hoàn thành.

## Giả định, giới hạn và snapshot

- R1 kiểm phần máy chủ và build; chuyển đường gửi/xuất bản thuộc R2; roster/PIN/chấm báo cáo từ máy khác thuộc R3 trở đi. Không yêu cầu triển khai các mục sau để duyệt riêng R1.
- “API giống Apps Script” được hiểu là giữ hành vi idempotency/conflict và các dữ liệu mà web hiện dùng, không chỉ giữ tên action. Dùng Apps Script hiện có để đối chứng hành vi; quyết định nghiệp vụ lấy từ bốn tài liệu được giao và Shared Product Contract.
- Quy định MVP không đăng nhập trong Shared Product Contract là phạm vi bản đầu; §19/§22 và lộ trình hiện tại mô tả giai đoạn có tài khoản. Không suy diễn yêu cầu trusted grading/giấu đáp án cho chế độ luyện tập đã duyệt D08. Không có BLOCKED_QUESTION cần quyết định thêm cho các lỗi dưới đây.
- Không đọc `ops/prod_config.json`, không install/dependency/commit/deploy, không gọi Google/Vercel/Neon thật. GLUE04 chỉ chạy publisher với fixture và chặn git/subprocess, không xuất bản thật.
- Các probe bổ sung chạy bằng here-string PowerShell qua `node --input-type=module -`; không tạo/sửa file test. Với Neon, chạy **NeonStore thật + fetch giả có trạng thái**, mô phỏng đúng các nhánh SELECT/INSERT/ON CONFLICT đang phát ra và dùng barrier điều khiển lịch tranh chấp. Đây là bằng chứng runtime cục bộ kết hợp phân tích SQL, **không phải nghiệm thu Postgres/Neon thật**.
- Working tree có nhiều thay đổi của tiến trình khác ngay từ đầu. Trong phiên, `src/app/main.ts` và các artifact/log tiếp tục đổi; không hoàn nguyên chúng. Các findings API neo vào mã dưới đây, không phê duyệt toàn bộ snapshot web đang thay đổi.

SHA-256 tại lần đối chiếu:

| File | SHA-256 |
|---|---|
| `src/api/handle.ts` | `1A8DA1A5E27611F30044F8804E3A3ECC070BC6600F59F13771D70039B0882A31` |
| `src/api/store/neon.ts` | `5DACB0959B9CF34FA155262A05B303D4757B02B7EE0DAA23AB0F50764A1326AE` |
| `scripts/web-build.ts` | `72DDEC8D31C11BC9C6453ACD8BE21B7CC8406F27B285640D30F09C51D26589C5` |

## Kiểm tra đã chạy

Môi trường: Windows/PowerShell, Node `v24.14.0`, compiler có sẵn; browser thật qua harness CDP của bộ kiểm định; HTTP/emulator cục bộ. Output được thu trong phiên tool, không ghi log mới ngoài scope. Build và test tự sinh artifact theo script hiện có.

| Lệnh/check | Exit | Pass / fail / skip | Kết quả |
|---|---:|---|---|
| `node scripts/build.js` | 0 | không áp dụng | PASS, emit/verify 339 files; có cảnh báo DEP0190 của child process |
| `npx --no-install tsc -p tsconfig.json` | 0 | không áp dụng | PASS |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | không áp dụng | PASS |
| `node --test --test-reporter=tap "test/codex-check/feat/R1/**/*.test.mjs"` | 0 | 31 / 0 / 0 | PASS; 86.220 giây |
| `node --test --test-reporter=tap "test/claude-check/**/*.test.mjs"` — lần 1 | 1 | 103 / 1 / 0 | FAIL; 126.275 giây; timeout ca hai tab bản dist |
| `node --test --test-reporter=tap --test-name-pattern="hai tab cùng bài" test/claude-check/web.test.mjs` | 0 | 2 / 0 / 0 | PASS; 41.373 giây; cả root và dist |
| Bộ Claude — lần 2, cùng lệnh toàn bộ | 0 | 104 / 0 / 0 | PASS; 97.869 giây; không xóa kết quả FAIL lần 1 |
| Probe P01–P06, `node --input-type=module -` | 1 | 0 / 6 / 0 | Cả 6 assertion hành vi mong đợi đều đỏ; chi tiết từng finding |
| Probe P07–P09, cùng cách chạy, NeonStore + fetch giả | 1 | 0 / 3 / 0 | 3 assertion đỏ; không gọi DB thật |
| Apps Script control + P10, cùng cách chạy | 1 | 1 / 1 / 0 | Control PASS; race reset password FAIL |
| Google/Vercel/Neon live | NOT_RUN | không áp dụng | Bị cấm bởi task; không dùng mock để tuyên bố live PASS |

Một lần gọi nhầm `node --test --input-type=module` không có dấu `-` đã khởi chạy discovery thay vì probe stdin; đã dừng cây process đó, không tính làm kết quả kiểm định. Probe đúng được chạy lại bằng lệnh nêu trên. Vì lượt đầu có tải kiểm thử đồng thời và workspace đang được sửa, không quy timeout hai tab cho R1 khi chưa có bằng chứng nguyên nhân.

Kiểm cuối: HEAD và ba hash API/build ở trên giữ nguyên; `git status --short -- src/api scripts/web-build.ts test/codex-check/feat/R1 test/claude-check` không có thay đổi. File báo cáo là file duy nhất được biên tập thủ công trong task. Artifact sinh bởi build/test và thay đổi của tiến trình khác được giữ nguyên; không dùng chúng để khẳng định snapshot web ổn định. Tổng probe có assertion: 11, pass=1 (control), fail=10 (hành vi lỗi cần sửa), skip=0.

## Findings

### R1-F01 — BLOCKER — publish đồng thời ghi đè nội dung đề của giáo viên khác

- **affected_files:lines:** `src/api/handle.ts:467`, `src/api/handle.ts:478`, `src/api/store/neon.ts:210`.
- **Căn cứ:** §19.2/§22: sửa đề giáo viên khác phải `FORBIDDEN`.
- **evidence / reproduction_steps:** P08 dùng hai token giáo viên hợp lệ Alice/Bob; cả hai publish lần đầu cùng `examId=shared`. Fetch giả cho hai SELECT đọc snapshot chưa có đề rồi mới mở barrier cho hai INSERT. Cả hai `handle` trả `{success:true, revision:1}`; record cuối có `owner=alice` nhưng title/examJson là nội dung Bob. SQL thật được phát ra có `ON CONFLICT (id) DO UPDATE` không có điều kiện owner. Không có transaction ràng buộc kiểm quyền với ghi.
- **expected:** một giáo viên tạo thành công; request của người khác bị `FORBIDDEN`, không thay nội dung đã thuộc chủ khác.
- **actual / impact:** request thứ hai sửa dữ liệu của chủ thứ nhất và vẫn báo thành công; client tự chọn examId nên tranh chấp có thể chủ động tạo. Test API07 chỉ kiểm ghi sau khi chủ sở hữu đã tồn tại, không kiểm hai request cùng vượt bước đọc.
- **minimal_fix:** kiểm owner ngay tại thao tác ghi nguyên tử: UPSERT có điều kiện owner, trả kết quả ghi để ánh xạ `FORBIDDEN`; revision tăng ở DB. MemoryStore cũng phải giữ cùng ngữ nghĩa. Không chỉ thêm kiểm tra SELECT thứ hai.
- **regression_test:** barrier hai giáo viên publish cùng ID chưa tồn tại; kiểm nội dung/owner và response. Thêm cập nhật đồng thời cùng owner để revision không mất bước.

### R1-F02 — CRITICAL — gộp request theo attempt_id trả success cho payload chưa kiểm và Store chưa ghi

- **affected_files:lines:** `src/api/handle.ts:21`, `src/api/handle.ts:631`, `src/api/handle.ts:644`.
- **Căn cứ:** §22 lõi nhận ctx.store; §17.2 cùng attempt khác nội dung phải conflict; Shared Product Contract §3 yêu cầu xác nhận trung thực.
- **evidence / reproduction_steps:** P03 gọi `Promise.all([r.post(p), r.post({...p,total:'invalid'})])` cùng attempt. Cả hai nhận `NEWLY_RECORDED`; request thứ hai chưa đi qua validator, đáng ra `INVALID_SCORE`. P04 gọi đồng thời cùng attempt trên hai rig/MemoryStore độc lập: cả hai báo success nhưng số rows là `[1,0]`.
- **expected:** mỗi request được validate; chỉ xác nhận dữ liệu của request đó trong ctx.store tương ứng; payload khác hợp lệ phải conflict.
- **actual / impact:** Map toàn module chỉ dùng attemptId, trả nguyên Promise của request khác. Có thể báo đã nhận dù dữ liệu không tồn tại; lõi không còn độc lập theo Store.
- **minimal_fix:** bỏ cơ chế trả chung receipt theo attemptId; chuyển quyết định idempotency vào Store nguyên tử. Nếu giữ hàng đợi tối ưu, chỉ dùng để tuần tự hóa theo Store/khóa, sau đó vẫn kiểm từng payload và đọc receipt thực.
- **regression_test:** P03/P04; thêm hai payload hợp lệ khác tên/điểm gửi đồng thời cùng ID, yêu cầu request sau `PAYLOAD_CONFLICT`.

### R1-F03 — CRITICAL — hai Vercel worker xác nhận NEWLY_RECORDED dù INSERT thứ hai bị bỏ qua

- **affected_files:lines:** `src/api/store/neon.ts:232`, `src/api/store/neon.ts:233`, `src/api/handle.ts:824`, `src/api/handle.ts:895`.
- **Căn cứ:** §22 nhiều tiến trình, idempotency; §17.2/§7 cần conflict cho cùng khóa khác nội dung, không báo ghi giả.
- **evidence / reproduction_steps:** P09 import hai instance module handle độc lập (query suffix khác nhau để có hai Map riêng), dùng hai NeonStore cùng fetch giả có trạng thái. Chặn hai SELECT results đến khi cả hai đều thấy chưa có attempt. Hai payload cùng attempt khác candidate sau đó INSERT; SQL `ON CONFLICT (attempt_id) DO NOTHING` chỉ giữ record đầu. Cả hai response vẫn `NEWLY_RECORDED`; không có `RETURNING`, kiểm rowCount hay đọc lại record sau ghi.
- **expected:** đúng một NEWLY_RECORDED; request thua đọc/so record đã lưu và trả ALREADY_RECORDED nếu giống hoặc PAYLOAD_CONFLICT nếu khác.
- **actual / impact:** không tạo row trùng nhưng vẫn xác nhận sai payload; mất nội dung của request thua. Sửa Map F02 không sửa được lỗi này trên nhiều tiến trình.
- **minimal_fix:** Store trả outcome của insert-if-absent nguyên tử và record canonical. Khi không insert, đọc record đã thắng và so toàn bộ fingerprint; trả recorded_at thật. Không dùng khóa trong RAM làm bảo đảm DB.
- **regression_test:** hai worker/store độc lập cùng DB giả, barrier trước INSERT; kiểm cả payload giống và khác, một row duy nhất và receipt đúng.

### R1-F04 — MAJOR — retry đổi câu trả lời hoặc policy vẫn được ALREADY_RECORDED

- **affected_files:lines:** `src/api/handle.ts:824`, `src/api/handle.ts:849`, `src/api/handle.ts:866`.
- **Căn cứ:** §17.2/§22 giữ PAYLOAD_CONFLICT và nội dung nộp; §7 yêu cầu cùng khóa khác hash phải conflict.
- **evidence / reproduction_steps:** P01 lưu `raw_answers:{q:'A'}`, gửi lại cùng attempt/điểm nhưng `{q:'B'}`. P02 chỉ đổi policy_version. Cả hai trả success/ALREADY_RECORDED. Apps Script control chạy chính Code.js trong makeGas với cùng payload: cả hai trả PAYLOAD_CONFLICT (control PASS). Nhánh existing không so raw_answers_json hoặc policy_version; so class/assignment còn có điều kiện chỉ khi request mới có classCode.
- **expected:** các thay đổi đó bị PAYLOAD_CONFLICT, không xác nhận payload khác là đã lưu.
- **actual / impact:** raw answers phía máy học sinh có thể khác DB nhưng web nhận trạng thái đã gửi; không giữ tương thích Apps Script.
- **minimal_fix:** chuẩn hóa payload trước nhánh existing, so fingerprint đầy đủ (các trường định danh, lớp/bài giao kể cả chuỗi rỗng, policy, đáp án JSON canonical và điểm rational). JSON khác thứ tự key nhưng cùng nội dung không nên conflict.
- **regression_test:** P01/P02; retry thay/loại class_code + assignment_id; JSON reordered vẫn idempotent; giữ record đầu nguyên vẹn.

### R1-F05 — MAJOR — retry bài đã nhận sau hạn bị báo giáo viên chưa nhận

- **affected_files:lines:** `src/api/handle.ts:810`, `src/api/handle.ts:819`, `src/api/handle.ts:824`.
- **Căn cứ:** §19.2 hạn +2 phút; §17.2/§22 idempotency và trạng thái gửi trung thực.
- **evidence / reproduction_steps:** P05 tạo bài giao open=EPOCH−60s, due=EPOCH+60s; nộp hợp lệ ở EPOCH. Đặt ctx.now=EPOCH+180001 rồi gửi lại payload y hệt để mô phỏng mất response lần đầu. Nhận `PAST_DUE` và message “giáo viên chưa nhận” dù row đã tồn tại. Apps Script đặt kiểm existing trước kiểm hạn cho bản ghi mới (`apps-script/Code.js:805`, `apps-script/Code.js:924`).
- **expected:** retry giống record trả ALREADY_RECORDED dù đã qua hạn; chỉ bản ghi mới chịu deadline hiện tại; retry khác nội dung vẫn conflict.
- **actual / impact:** outbox có thể đánh dấu không gửi được cho bài đã ghi; giáo viên/học sinh thấy hai trạng thái trái nhau.
- **minimal_fix:** sau validate/chuẩn hóa, giải quyết existing và so fingerprint trước kiểm thời gian cho insert mới; kết hợp xử lý nguyên tử F03.
- **regression_test:** P05; lost response rồi retry sau grace; control attempt mới vẫn PAST_DUE; không hạn nộp không bị áp hạn.

### R1-F06 — MAJOR — Neon cập nhật JSON đề nhưng giữ thời lượng/số câu/môn/khối/nhóm cũ

- **affected_files:lines:** `src/api/store/neon.ts:210`.
- **Căn cứ:** §17.2/§22 metadata listExams/getClass/listAssignments phải phản ánh đề đã xuất bản; §19.1 giữ đúng cài đặt.
- **evidence / reproduction_steps:** P07 saveExam cùng ID lần 1 duration=15, questionCount=3, subject=Physics, grade=12, group=Old; lần 2 duration=30, questionCount=4, subject=Math, grade=11, group=New, revision=2. Fetch giả áp đúng mệnh đề UPDATE thực được phát ra: title/revision đổi nhưng getExam metadata vẫn 15/3/Physics/12/Old. SQL chỉ SET title, revision, updated_at, exam_json; thiếu cả năm cột metadata. MemoryStore thay toàn record nên test API09 không bắt được.
- **expected:** list và metadata bài giao cùng revision với JSON mới.
- **actual / impact:** thẻ/hộp xem trước báo sai thời gian và số câu sau giáo viên sửa đề; có thể dẫn đến quyết định bắt đầu bài dựa trên thời lượng sai.
- **minimal_fix:** cập nhật đầy đủ metadata trong cùng UPSERT đã kiểm owner, không đổi owner theo EXCLUDED; trả revision thật từ DB.
- **regression_test:** republish đổi cả năm trường; kiểm listExams, getClass, listAssignments qua NeonStore rồi tái tạo store.

### R1-F07 — CRITICAL — phiên xác thực bằng mật khẩu cũ vẫn hợp lệ sau reset khi login đang chờ ghi

- **affected_files:lines:** `src/api/handle.ts:241`, `src/api/handle.ts:246`, `src/api/handle.ts:273`, `src/api/handle.ts:284`, `src/api/handle.ts:64`; `src/api/types.ts:10`.
- **Căn cứ:** §22 khóa/reset password vô hiệu phiên cũ.
- **evidence / reproduction_steps:** P10 chặn createSession của teacherLogin sau khi verify mật khẩu cũ. Admin reset password, saveTeacher và deleteTeacherSessions hoàn tất. Mở barrier để login cũ ghi session; dùng token đó listMyClasses vẫn `{success:true,classes:[]}`. authenticate chỉ kiểm active/expiry, session không gắn version của credential. Đây là await thật trong Store port, không thay validator/auth.
- **expected:** phiên dựa trên credential đã reset bị UNAUTHORIZED, không thể tiếp tục sau khi admin thu hồi.
- **actual / impact:** thao tác thu hồi có thể bị race vượt qua và token sống thêm 8 giờ; khóa rồi mở khóa cũng cần chống phục hồi phiên dựa trên credential cũ.
- **minimal_fix:** gắn credential/auth generation vào teacher và session, kiểm generation khi authenticate; cập nhật generation nguyên tử khi reset/khóa. Hoặc giao dịch khóa teacher row và cấp phiên có điều kiện credential chưa đổi; chỉ đọc lại trước INSERT vẫn còn race.
- **regression_test:** P10 với barrier trước createSession; khóa/mở khóa trong cùng lịch; áp dụng cả MemoryStore và hai NeonStore.

### R1-F08 — MAJOR — listAssignments bỏ submissionCount, giáo viên luôn thấy 0 bài đã nộp

- **affected_files:lines:** `src/api/handle.ts:433`, `src/api/handle.ts:437`; caller `src/teacher/portal.ts:1321`.
- **Căn cứ:** §19.1 dòng bài giao có số bài đã nộp; §22 giữ dữ liệu API cũ.
- **evidence / reproduction_steps:** P06 tạo lớp/bài giao, nộp một attempt hợp lệ rồi listAssignments. Assignment không có submissionCount (`undefined`, expected 1). Apps Script assignmentsFor trả trường này (`apps-script/Code.js:1200`); client giữ trường nếu có, portal render `${a.submissionCount || 0} bài đã nộp`.
- **expected:** 1 sau một bài; retry cùng attempt không tăng; tách theo assignment.
- **actual / impact:** chuyển sang máy chủ mới làm giáo viên thấy 0 dù listResults đã có bài; đây là hồi quy dữ liệu đầu ra mà bộ R1 chưa assert.
- **minimal_fix:** đếm kết quả của đúng classCode/assignmentId trong Store rồi bổ sung trường riêng cho listAssignments; không đưa số liệu cá nhân vào public getClass.
- **regression_test:** 0→1→retry vẫn 1, assignment khác vẫn 0; kiểm bằng UI với apiBase.

## Lịch sử, sửa giả và độ phủ còn thiếu

- `git diff cd8a9f5 HEAD -- test/codex-check/feat/R1` rỗng: bộ test R1 không bị sửa sau commit viết test đầu tiên. Package/lock không đổi trong khoảng được review.
- API được thêm ở `5920e1e`; `754b89a` thêm dueAt rỗng; `7ad7820` sửa Neon từ Map giả sang SQL đọc/ghi thật và parameter binding. Bản cũ của Neon chỉ ghi yêu cầu SQL rồi lấy dữ liệu từ Map, không bảo đảm nhiều tiến trình; lỗi đó **đã được sửa ở HEAD**, không ghi lại như finding hiện hành.
- Các thay đổi `test/claude-check` sau mốc đầu gồm VERCEL01–03 và kiểm định UX mới, helper vào đề bằng tệp theo §21 và mouseClick behavior instant. Không thấy xóa assertion/nới điều kiện nhằm che lỗi R1. Không kết luận tác giả vi phạm chỉ từ tên commit.
- Không thấy branch theo test ID/tên fixture, webdriver hay NODE_ENV trong src/api. Build có bridge `_node.js` dùng process.getBuiltinModule để đáp ứng kiểm graph cũ; đã kiểm artifact import/chạy thật, không chỉ nhìn regex. Không coi đó là bằng chứng gian lận. Tuy vậy test xanh không bảo đảm đúng nghiệp vụ như các findings trên.
- STORE01/VERCEL02–03 chủ yếu giả trả rows rỗng và kiểm request; chưa có vòng publish→đọc→sửa→đọc qua NeonStore có dữ liệu. API13 dùng một handle/Store và payload đồng thời giống hệt, nên che F02/F03. API06 chỉ reset/khóa tuần tự. API09 chỉ đổi title qua MemoryStore.
- Chưa kiểm live response typing của Neon (timestamp/int/bigint), tranh chấp DDL trên nhiều cold start, hoặc môi trường Node/Vercel thật: NOT_RUN theo giới hạn task. Các probe fetch giả không thay thế các bằng chứng này.
- Không đưa R3 student/PIN vào danh sách thiếu của R1; bảng students đã được tạo theo §22. Không có nghiên cứu công cụ/dependency mới trong task này.

## Hành động đề nghị

Sửa F01–F08 trong vùng api và bổ sung kiểm định tương ứng bằng worker có scope phù hợp. Giữ toàn bộ test hiện có, chạy lại build/hai tsc/R1/Claude; R1 cần hai lượt xanh theo lộ trình và review lại trên snapshot ổn định. Không dùng báo cáo này làm phê duyệt triển khai.
