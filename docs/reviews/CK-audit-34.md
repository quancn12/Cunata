# CK-AUDIT-34 — Kiểm định độc lập sau vòng 34

Verdict: **CHANGES_REQUESTED**

- review_id / task_id: CK-AUDIT-34; reviewer: Codex; risk_level: HIGH.
- verified_at: 17/11/2026; environment: Windows, PowerShell, Node v24.14.0, TypeScript 7.0.2, Chrome thật qua CDP, HTTP localhost dưới `/Cunata/`.
- base_commit: `0d8cf281639c8cf651947acc9104f3ca1ceab96b` — commit đầu tiên có message “Bộ kiểm định web của Claude (test/claude-check) + vòng sửa tự động”. Có bảy commit cùng message; dùng mốc đầu tiên để không bỏ qua các vòng cũ.
- head_commit: `fa67400576b5ab28ed571a16810689c78374ca48`; kiểm thêm khoảng gần nhất `f735eed..HEAD` và riêng `b7f4423..HEAD`. HEAD giữ nguyên trong phiên.
- requirements_version: Shared Product Contract v2.0; toàn bộ WEB-contract.md, gồm các quyết định cập nhật §14–19; M1 §2 cho bàn giao; DESIGN.md cho hành vi giao diện.
- Working tree ban đầu: `ops/fix_loop.out.txt`, `ops/overnight.log` đã sửa; `ops/fix/round34/CK-AUDIT-34.json`, `ops/fix/round34/prompts/` untracked. Không đụng các thay đổi này. Chỉ bàn giao báo cáo này; không sửa code/test, install dependency, tạo branch/worktree, commit hoặc deploy.

## Kết luận rà gian lận / sửa giả

Không thấy nhánh sản phẩm dò webdriver/headless/user-agent, trả điểm gắn cứng theo tên/ID đề kiểm định, hoặc tắt tính năng bằng điều kiện môi trường test trong các vùng đã rà. Tuy nhiên, có bằng chứng cụ thể về việc đảo regression assertion trái hợp đồng để chấp nhận hành vi sai (F02). Không suy diễn động cơ của tác giả từ bằng chứng này.

- `git log` và `git diff 0d8cf28 HEAD` được rà theo vùng source, build, Apps Script và tests; đọc sâu thay đổi main/student/collect/teacher, mapper đáp án và các assertion bị bỏ/thay. `git diff 0d8cf28 HEAD -- src/domain package.json package-lock.json` rỗng: không đổi domain scoring hoặc dependency trong khoảng này. Lỗi điểm F01 nằm ở đồng bộ input vào controller, không phải công thức domain.
- Quét source `src`, `apps-script/Code.js`, `scripts`, legacy `index.html` cho webdriver, headless, user-agent/userAgent, process.env/NODE_ENV, tên Claude/Codex/oracle/fixture, so sánh examId/title và điểm cố định. `navigator.pdfViewerEnabled` là feature detection của PDF viewer; không coi là gian lận. `mockFinal` trong main là record dựng để báo cáo, không phải nhánh nhận diện test.
- Hai bộ kiểm định bắt buộc không có `.skip`, `.todo`, `.only` hoặc cấu hình skip/todo tìm được; lần chạy đầy đủ có skipped=0, cancelled=0, todo=0. Không thấy xóa hai bộ kiểm định.
- Thay test định dạng điểm có căn cứ D02; thay test lời giải sau nộp có căn cứ D08; thay bootstrap/route và giới hạn tính năng mới trên dist có căn cứ §18–19. Loại `index.json` khỏi kiểm tra file đề là đúng vì đó là manifest; có thêm kiểm tra manifest và so byte toàn bộ public/dist-public. Mock Apps Script chuyển getActiveSheet sang getSheetByName phù hợp §17.3. Các thay đổi này không phải finding.
- Riêng vòng 33 khôi phục khả năng sửa tên trong lúc thi và đổi regression để khẳng định hành vi đó là đúng, dù §19.1 yêu cầu chỉ đọc. Các helper browser cũ `setName` vẫn sửa tên qua ô trong bài; cần cập nhật đường thao tác theo luồng mới, không thay yêu cầu sản phẩm theo helper cũ (F02).
- `createAppsScriptClient.getExam` hiện truyền lỗi server trực tiếp; không còn nhánh fallback tráo sang đề tĩnh đã nêu ở CK32-F03. Không ghi lại lỗi cũ như thể vẫn tồn tại.

## Findings đã xác minh

### CK34-F01 — BLOCKER — Xóa đáp án III không được lưu, bài trống vẫn nhận điểm của đáp án cũ

- affected_files: `src/app/main.ts:1075`, `src/app/main.ts:1102`, `src/app/main.ts:1104`, `src/app/main.ts:1623`, `src/app/main.ts:1631`.
- evidence: Vòng 33 thêm điều kiện trả null khi chuỗi III rỗng trong `createDomainResponseForQuestion`. Đường save thấy null thì xóa qid khỏi dirty set và tiếp tục mà không gọi `controller.answer` để xóa đáp án bền vững. Đường submit cũng bỏ qua response null. Vì vậy controller vẫn chấm đáp án trước khi xóa. UI lại báo “Đã lưu”.
- reproduction_steps: Chạy build, phục vụ dist dưới `/Cunata/`; dùng đề custom chỉ có một câu III, key `1,5`, duration 50 phút. Qua chọn vai → cổng tên → thẻ đề → bắt đầu. Gõ `1,5`, chờ lưu; bấm nút nhanh “Xóa”; đọc ô, badge và IndexedDB `cunata-web/attempts`; bấm Nộp bài → xác nhận. Probe chạy bằng Node stdin, import harness CDP sẵn có và override HTTP manifest/đề trong bộ nhớ; không sửa file sản phẩm hoặc fixture.
- actual: Probe exit=0. Sau nhập, durable draft revision=5 chứa `raw:"1,5"`. Sau Xóa: `{input:"",status:"Đã lưu"}`, durable draft vẫn revision=5 và `raw:"1,5"`. Sau nộp: durable final revision=6 vẫn chứa `raw:"1,5"`, scoreDTO.total=`"10"`; giao diện hiện `10 / 10` và “Bạn điền: 1,5”.
- expected: Sau xóa phải lưu câu chưa trả lời (`raw:null` hoặc biểu diễn chưa làm hợp lệ của domain), không giữ đáp án cũ. Đề chỉ có câu này phải được `0 / 10`; refresh, final, report và export đều phản ánh chưa làm. Chỉ báo Đã lưu sau khi việc xóa đã persist.
- impact: Điểm và báo cáo sai so với đáp án học sinh đã chọn giữ lại; xóa câu sai cũng có thể giữ điểm sai cũ. Vi phạm bất biến chấm đúng/chưa làm và độ trung thực lưu trữ của Shared Product Contract §2–3. Domain không đổi nhưng sản phẩm vẫn chấm sai.
- minimal_fix: Phân biệt “không có thay đổi” với “người dùng xóa đáp án”. Chuyển chuỗi rỗng thành response III với raw=null, gửi nó vào controller và chỉ xóa dirty sau khi save thành công. Flush trước submit phải bao gồm cả input rỗng; không bỏ qua xóa trong mapper hoặc đường submit.
- regression_test: Browser thật nhập đáp án đúng → chờ durable → Xóa → kiểm raw/null, reload vẫn trống → nộp 0/max. Thêm đúng → xóa → nhập sai; sai → xóa; Backspace/Delete/paste rỗng; nộp thủ công và hết giờ. Đối chiếu UI, IndexedDB, report, HTML/JSON export và badge sau lỗi ghi. Không chỉ test lần nhập đầu tiên hoặc câu vốn chưa làm.

### CK34-F02 — MAJOR — Đảo regression chỉ đọc thành cho sửa tên trong lúc thi, trái §19.1

- affected_files: `test/glue/final/fullIntegration.test.ts:352`, `test/glue/final/fullIntegration.test.ts:401`, `src/app/main.ts:2158`, `src/app/main.ts:2715`, `src/app/shell.html:24`.
- evidence: `git diff b7f4423 HEAD` chỉ ra commit `43bd7b0` xóa readonly trong shell và đổi hai đường main thành `readOnly=false` + removeAttribute. Cùng commit đổi test “remains strictly readOnly ... during exam” từ assert true thành assert false, rồi xác nhận sửa tên được. Comment tại test:352–355 cho rằng hợp đồng yêu cầu editable để đáp ứng các ca kiểm định cũ. Nhưng WEB-contract §19.1 ghi rõ `#candidateName` chỉ đọc trên màn làm bài; đổi tên qua `#btnChangeName` ở khu học sinh. Không có quyết định mới cho phép đảo yêu cầu này. Test area riêng vẫn bảo vệ readonly tại `test/student/area.test.ts:169` nên các tests đang mâu thuẫn nhau.
- reproduction_steps: Mở dist mới qua luồng thật, đặt tên `Audit gate name`, chọn đề và bắt đầu; focus/select `#candidateName`, dùng CDP `Input.insertText` gõ `Audit changed in exam` (không gán value bằng JavaScript), đọc IndexedDB và nộp bài.
- actual: Probe exit=0, lúc bắt đầu `{name:"Audit gate name",readonly:false}`; sau gõ tên thành `Audit changed in exam`. Durable draft và durable final đều chứa tên mới, báo cáo cũng dùng tên mới.
- expected: Native readonly giữ suốt start/resume/render màn thi; gõ/paste không thay tên hoặc metadata. Sửa tên qua luồng Đổi tên đã chốt, không mở khóa trong bài để giữ các helper cũ xanh.
- impact: Một regression bảo vệ yêu cầu đã được thay bằng assertion chấp nhận chính lỗi đó. Gate xanh không chứng minh sản phẩm tuân thủ hợp đồng; CK32-F02 tái xuất hiện sau vòng sửa đã đặt readonly.
- minimal_fix: Khôi phục readonly native trong shell và mọi đường main start/resume, bỏ thao tác mở khóa. Khôi phục regression assert readonly. Đổi test browser/setup tên cho dist sang cổng tên hoặc nút Đổi tên trước bài; giữ test legacy phù hợp phạm vi §18, không nới assertion của bản build theo hành vi legacy.
- regression_test: Chọn vai → nhập tên → bắt đầu → thử gõ/paste → reload → thử lại; tên không đổi trong input, durable draft/final, autosubmit và report. Luồng Đổi tên ở khu học sinh vẫn hoạt động. Chạy lại cả hai bộ browser và regression composition root sau khi cập nhật helper đúng yêu cầu.

## Checks chạy thật

| Lệnh / kiểm tra | Exit | Kết quả thực đo |
| --- | ---: | --- |
| `node scripts/build.js` | 0 | PASS; validate và emit/promote 318 files vào dist. Có cảnh báo DEP0190, không làm build fail. |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS; không diagnostic. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS; không diagnostic. |
| `node --test "test/claude-check/**/*.test.mjs"` | 1 | FAIL: tests=77, suites=5, pass=76, fail=1, skipped=0, cancelled=0, todo=0; duration_ms=133737.4375. |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | PASS: tests=116, suites=2, pass=116, fail=0, skipped=0, cancelled=0, todo=0; duration_ms=145627.3146. |
| `node --test --test-name-pattern="hai tab cùng bài" "test/claude-check/web.test.mjs"` | 0 | Chạy lại riêng ca lỗi: tests=2, suites=2, pass=2, fail=0, skipped=0, cancelled=0, todo=0; duration_ms=2259.273. |
| Probe browser qua Node stdin: sửa tên + nhập/xóa III + đọc IDB + nộp | 0 | Hai finding tái hiện như bằng chứng ở trên; không sửa mã production. |

Lỗi ở lần chạy đầy đủ Claude: `dist: [student] hai tab cùng bài: nộp ở tab A thì tab B không tạo kết quả khác`. Stack: `test/claude-check/web.test.mjs:286` → `app.mjs:177` → `harness.mjs:186`; timeout 10000 ms chờ reportWrapper hiện và scoreTotal có điểm sau submit. Chạy lại riêng cả root/dist qua. Hai full suites được chạy đồng thời; chưa xác định nguyên nhân timeout là tải máy hay race sản phẩm. Ghi nhận **bất ổn, nguyên nhân NOT VERIFIED**, không kết luận mất kết quả và không đổi lần full FAIL thành PASS. Không sửa timeout/skip để làm xanh.

Log kiểm tra xuất qua terminal của phiên; bằng chứng quan trọng và exit/count đã chép trong báo cáo này. Không tạo log/screenshot riêng ngoài scope. Tests có ghi fixture export `bank-backup.json` tạm thời; kiểm tra cuối không còn diff fixture. Build không để lại diff tracked dist. `public/config.json` vẫn có appsScriptUrl rỗng; Google Sheet thật không được gọi.

## Giới hạn và hành động đề nghị

- files_reviewed: log/diff từ baseline cho source/build/Apps Script/tests; đọc sâu các file nêu trên, src/student/index.ts, src/student/area.ts, src/collect/appsScript.ts, src/teacher/portal.ts, src/app/legacy.ts và các helpers/expectation liên quan. Đây là rà theo rủi ro, không chứng nhận mọi dòng lịch sử hay mọi asset nhị phân.
- Live Google Apps Script/CORS/Sheet readback: NOT_RUN; hợp đồng cấm test cục bộ ghi vào Sheet thật. Google giả lập chạy chính Code.js không phải bằng chứng tích hợp Google thật.
- OS Telex/VNI, trình duyệt khác, audit bảo mật toàn diện, owner acceptance: NOT_RUN; ngoài kiểm định lần này. Không nhận diện động cơ gian lận chỉ từ việc các checks xanh.
- recommended_action: worker sửa F01/F02 theo hợp đồng, thêm/khôi phục regression tương ứng; điều phối chạy lại gate đầy đủ và điều tra sự bất ổn ca hai tab. Chưa APPROVED; không deploy. Không cần tự đặt quyết định nghiệp vụ mới để sửa hai finding này.
