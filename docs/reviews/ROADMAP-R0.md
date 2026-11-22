Verdict: CHANGES_REQUESTED

# R0 — kiểm định độc lập lần 2

- review_id / task_id: `R0-REVIEW-2`; reviewer: Codex; ngày: 22/11/2026.
- head_commit: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`.
- Phạm vi: R0 trong `docs/LO-TRINH-V2.md`: WEB-contract §20, §21, bảng Markdown, các ca CX, tên đề giáo viên và tên học sinh. Không kết luận nghiệm thu R1–R10.
- Căn cứ nghiệp vụ: Shared Product Contract v2.0; `docs/contracts/WEB-contract.md` (đọc toàn bộ), `docs/design/DESIGN.md`, `docs/decisions/BANG-QUYET-DINH.md`, `docs/LO-TRINH-V2.md`. Các file test chỉ là bằng chứng kiểm tra, không thay hợp đồng.
- risk_level: HIGH. Có một lỗi làm mất thay đổi đáp án chuẩn, một thao tác đọc gây ghi dữ liệu và một thiếu sót báo cáo offline đã tái hiện.
- files_reviewed: diff/lịch sử R0 trong `src/app`, `src/student`, `src/report`, `src/teacher`, `src/ui`, `src/collect`, `apps-script/Code.js`, `scripts/web-build.ts`, dữ liệu đề thay đổi; assertions/helpers trong `test/claude-check`, `test/codex-check/*.test.mjs`, 8 file CX và các regression R0 chưa commit. Các mục API/R1+ chỉ đọc khi cần hiểu biên gọi, không coi là đã nghiệm thu toàn bộ.
- Chỉ viết báo cáo này; không sửa code/test, không install/dependency/commit/deploy; không đọc `ops/prod_config.json`, không gọi Google/Vercel/Neon thật. Build và test tạo/cập nhật đầu ra vốn có của chúng; không khôi phục các thay đổi sẵn có của worker khác.

## Snapshot, lịch sử và giả định

Working tree đã bẩn khi nhận task, gồm source, dist, artifacts và nhiều file của các vòng khác. Đã đọc cả diff commit lẫn diff chưa commit; không coi HEAD là toàn bộ mã được chạy.

`git log --all --oneline --grep='Lộ trình R0'` không có commit mang tên được nêu trong prompt. Mốc chức năng tìm thấy là `14e08dffc4718f6e4c58e1ee7509272a223818e7` — “Lộ trình tới khi hoàn thành + WEB-contract §20: xem lại bài hiện toàn văn câu hỏi (test kiểm định)”. Đã xem lịch sử/diff từ cha của commit này tới HEAD, rồi diff working tree; bao gồm `5e26dbf` đưa 8 file CX vào bộ kiểm định, `c397ebc` quyết định bảng/đính chính nội dung và `4fb0d1d` thay luồng công khai bằng §21.

**BLOCKED_QUESTION về truy nguyên lịch sử:** điều phối xác nhận `14e08df` có phải mốc được gọi là “Lộ trình R0: test kiểm định”, hay cung cấp SHA khác. Không tự khẳng định hai tên là cùng một commit. Các finding dưới đây độc lập với câu hỏi này: đều tái hiện trên bản hiện có.

Giả định được công khai:

- Giữ ngoại lệ `#examFileInput` ẩn theo §21; dùng file để kiểm tra chấm/báo cáo không có nghĩa học sinh được thấy thư viện đề công khai.
- D08 tại §14 và §21 thay các hành vi cũ tương ứng. Không báo việc bỏ `?exam=` hoặc bốn ca CX dựa trên đề công khai là hồi quy.
- Giữ review ở R0; không tự phê duyệt policy/triển khai của các mục sau. Không phát sinh quyết định nghiệp vụ mới để sửa ba lỗi dưới đây.

Hash SHA-256 của 148 file tracked `.ts/.js/.mjs/.css/.html` dưới `src`, `apps-script`, `test/claude-check`, `test/codex-check`, `scripts` (ghép danh sách `path:sha256` theo `git ls-files`): `4deef665d71b73bab3f9c27a9ec37b3bb1c9a8e364f4f4143b1ed5cd56b64d16`, trùng ở 08:21:54 và 08:23:43 UTC. Hash riêng để đối chiếu finding:

| File | SHA-256 |
| --- | --- |
| `src/teacher/portal.ts` | `3f8205811235a062f4b6d3f69ee5804572a29eb520744726a6c85c0ccff7aa5a` |
| `src/app/authoring.ts` | `e98d3b260ebee961d4093b20e762d88c79d33243804251cfe4f4f8abaec81ebc` |
| `src/app/main.ts` | `247489229f12c41f056921c021df2673e867abdc1c5f14eec3e34bbb9e70219d` |

Sau lượt kết hợp cuối, kiểm lại lúc 08:29:22 UTC: HEAD và hash tổng vẫn trùng. Không phát hiện source/test đổi trong khoảng snapshot trên; verdict chỉ áp dụng snapshot này, không bao gồm các thay đổi về sau.

## Findings đã xác minh

### R0-R2-F01 — BLOCKER — Xuất bản âm thầm phục hồi đáp án cũ sau khi giáo viên đổi đáp án

- **affected_files:lines:** `src/teacher/portal.ts:1763–1773`; đường lưu hợp lệ tại `src/app/authoring.ts:301–304,328–329`.
- **Căn cứ:** WEB-contract §19.1 yêu cầu giữ những phần không sửa và xuất bản phần đã sửa; Shared Product Contract §2 yêu cầu mapping đáp án theo ID chính xác.
- **Nguyên nhân/bằng chứng:** sau khi bấm Lưu câu, authoring đã ghi `correctOptionId` mới vào draft và dựng lại giao diện, nên không còn radio trong DOM. Callback xuất bản lại lấy câu nguồn theo chỉ số và thay `q.correctOptionId` bằng `origQ.correctOptionId` khi không thấy radio. Giáo viên nhận thành công nhưng key mới bị mất. Đổi thứ tự/xóa câu còn làm việc ghép theo chỉ số nguy hiểm hơn; trường hợp đó chưa chạy, không tính là bằng chứng riêng.
- **reproduction_steps:** dùng `test/claude-check/gas-server.mjs` và server dist cục bộ; tạo giáo viên, publish đề một câu I có ID phương án `ck-i-01-a`…`d`, key A; đăng nhập → Đề thi → Sửa đề → `.btn-q-edit[data-idx="0"]` → chọn `#editCorrectOpt_0_1` (B) → `.btn-q-save-edit[data-idx="0"]` → `#btnPublishExam`; đọc lại bằng `getExam` trên GAS giả lập.
- **expected:** key sau xuất bản là `ck-i-01-b`; bài mới chọn B được 0,25.
- **actual / output probe Chrome thật:** `radiosRemaining: 0`; `R0_KEY_EDIT_PROBE {"expected":"ck-i-01-b","actual":"ck-i-01-a"}`. Probe exit 0 nghĩa tái hiện xong, không có nghĩa sản phẩm đúng.
- **impact:** làm mất chỉnh sửa đáp án và khiến các lượt mới tiếp tục chấm theo key cũ.
- **minimal_fix:** bỏ bước ghi đè key từ DOM/câu nguồn trong callback portal; publish key đã được editor lưu và validator kiểm. Sửa lỗi radio mặc định ở nơi dựng editor, không bảo vệ bằng cách phục hồi mọi key cũ khi publish. Nếu cần ghép metadata câu thì ghép theo ID, giữ các trường đã sửa của draft.
- **regression_test:** sửa đề đã xuất bản, đổi A→B, lưu, mở lại editor phải vẫn chọn B, xuất bản, đọc lại và làm bài chọn B được điểm. Giữ ca hiện có `CX-teacher-F07` sửa nội dung mà không đổi key; ca đó chỉ kiểm bảo toàn key, chưa phủ thay đổi key có chủ đích.

### R0-R2-F02 — MAJOR — Chỉ mở thư viện đề cũng gửi publish và tăng revision

- **affected_files:lines:** `src/teacher/portal.ts:1687–1699`; backend tăng revision tại `apps-script/Code.js:409`.
- **Căn cứ:** WEB-contract §17.2 phân biệt đọc danh sách với publish; §19.1 chỉ cho giáo viên thấy đề của mình và kho chung. Bảng quyết định đợt 8 yêu cầu phạm vi đề theo giáo viên, không yêu cầu xuất bản lại khi xem danh sách.
- **Nguyên nhân/bằng chứng:** `loadExams()` gọi `deps.client.publishExam(tok, fullExam)` để dò quyền sở hữu. Với đề của mình, đó là thao tác ghi thật và tăng revision; với lỗi khác `FORBIDDEN`, code vẫn đánh dấu là đề của mình. Nhánh catch còn hiển thị đề không xác minh được quyền. Không kết luận đã vượt quyền ghi server; server vẫn chặn `FORBIDDEN` trong trường hợp đã kiểm.
- **reproduction_steps:** seed một giáo viên và một đề đã publish revision 1 trên GAS giả lập; mở trang, đăng nhập, chỉ bấm Đề thi; không bấm sửa hoặc xuất bản. Đợi thẻ đề hiện; đọc `listExams` và đếm POST `publishExam` trong `gas.log`.
- **expected:** revision vẫn 1; số POST publish trong thao tác duyệt thư viện bằng 0.
- **actual / output probe Chrome thật:** `R0_OWNERSHIP_PROBE {"before":1,"after":2,"publishRequestsDuringBrowsing":1}`; exit 0 (tái hiện xong).
- **impact:** thao tác xem làm thay đổi dữ liệu; còn có thể ghi đè bản sửa mới hơn giữa lúc GET và POST bằng bản vừa tải. Race ghi đè chưa được chạy riêng, là rủi ro từ đường ghi đã chứng minh. Tăng tải mạng và revision không tương ứng chỉnh sửa của giáo viên.
- **minimal_fix:** xác định chủ sở hữu bằng dữ liệu đọc từ máy chủ dưới phiên giáo viên/metadata phù hợp; không dùng hành động publish làm kiểm tra quyền. Gặp lỗi tải/quyền phải báo lỗi tại chỗ và cho thử lại, không coi là đề của mình. Giữ xác minh quyền ở backend khi thực sự publish.
- **regression_test:** mở thư viện/reload/đổi mục không gửi publish và không đổi revision/nội dung; giáo viên B không thấy đề của A; lỗi mạng không làm đề của A lọt vào thư viện B. Giữ nguyên assertion của `CX-teacher-F02`.

### R0-R2-F03 — MAJOR — Ảnh trong ô bảng không được nhúng vào HTML tải về

- **affected_files:lines:** `src/app/main.ts:3122–3126`, đầu ra tại `src/app/main.ts:3259`; render ảnh trong bảng tại `src/app/main.ts:411–420`.
- **Căn cứ:** WEB-contract §20 yêu cầu file báo cáo cùng nội dung, tự chứa, ảnh nhúng; §9 yêu cầu mở báo cáo khi mất mạng. `Block.table.rows[].blocks` là cấu trúc hợp lệ theo §4.
- **Nguyên nhân/bằng chứng:** bộ gom asset chỉ xét block text/image ở cấp đầu của câu. Nó không đi vào `table.rows[].blocks`. Renderer lại vẫn xuất ảnh trong ô, nên resolver không có data URI và rơi về đường dẫn tương đối. Kiểm định mới `R0-F02` ở `test/report/r0-f01-f03-regressions.test.ts` chỉ kiểm model có asset được nhúng sẵn qua `renderReportHtml`, chưa kiểm nhánh nút tải thực tế trong app với ảnh nằm trong bảng.
- **reproduction_steps:** mở dist bằng harness, cấu hình `{ "appsScriptUrl": "" }`; nạp đề hợp lệ một câu I, `assets: []`, `blocks: [{type:'table',rows:[[{rowSpan:1,colSpan:1,blocks:[{type:'text',text:'nested image'},{type:'image',assetId:'public/q01-bbt.svg',alt:'nested diagram'}]}]]}]`; nộp và bấm `#btnDownloadReportHtml`; đọc nội dung tải về. Ảnh này tồn tại ở dist và có thể được nhúng từ cùng origin.
- **expected:** ảnh trong HTML có `src="data:image/..."`; mở file độc lập vẫn thấy hình.
- **actual / output probe Chrome thật:** `R0_NESTED_IMAGE_PROBE {"imageSources":["public/q01-bbt.svg"],"relativeImageRemains":true}`; exit 0 (tái hiện xong). File sẽ tìm `public/q01-bbt.svg` cạnh file tải về, không phải cạnh trang web.
- **impact:** học sinh tải kết quả thành công nhưng mất hình đề khi xem offline; nội dung báo cáo không đầy đủ như §20.
- **minimal_fix:** duyệt cây Block để gom asset ở cả ô bảng và text Markdown trong ô; nhúng qua cùng resolver của bản tải. Kiểm tra đầu ra cuối không còn ảnh phụ thuộc đường dẫn web; lỗi lấy asset phải được thông báo rõ.
- **regression_test:** browser thật bấm nút tải với ảnh ở block đầu, ô bảng, Markdown trong ô, options và lời giải; mở file tải về khi server đã tắt, kiểm ảnh tải thành công và không phát request ngoài. Không thay bằng test chỉ gọi renderer riêng.

## Kiểm tra sửa giả, bảo mật và khoảng trống

- Đã tìm trong `src`, `scripts`, `apps-script` các dấu hiệu `navigator.webdriver`, user-agent, tên fixture/test (`claude-check`, `codex-check`, `ck-i-`, `GIAITHICH`, `cx-design`), localhost và biến môi trường. Không thấy rẽ nhánh production theo tên/id test hay trình duyệt kiểm định. Các chỗ localhost/SW và DATABASE_URL của backend có vai trò vận hành rõ; không phải bằng chứng sửa giả.
- F01 và F02 là sửa theo biểu hiện của test: một chỗ phục hồi key cũ để ca “không tự đổi key” xanh, một chỗ dùng publish để ca “chỉ thấy đề mình” xanh. Không suy đoán ý đồ tác giả; đã chứng minh cách sửa làm sai luồng thực tế ngoài test.
- So `5e26dbf..HEAD`: sáu file test CX `admin/collect/report/schema/teacher/ui` không đổi nội dung. `app.test.mjs`, `student.test.mjs` đổi theo §21; việc bỏ CX-student-F03/F04/F08/F09 có quyết định đợt 11 cho phép. Các file JSON debug là artifact, không phải assertion.
- `test/claude-check/app.mjs:95–116` thêm fallback nạp file khi không còn thẻ công khai. Phù hợp ngoại lệ file ẩn của §21 cho test chấm/báo cáo, nhưng không kiểm chứng luồng lớp. Đã đọc các ca lớp thực sự trong `teacher.test.mjs` và CX student; không lấy fallback làm bằng chứng duy nhất cho §21.
- `test/claude-check/web.test.mjs` bổ sung §20 và bảng Markdown nhưng fixture §20 không trộn; assertion download chủ yếu tìm toàn văn. Chưa phủ các biên đã thấy ở F03, cũng không phủ thay đổi key có chủ đích trong portal ở F01.
- Root/index giữ vai trò kiểm hồi quy; không dùng bộ test root cho hành vi riêng dist. Các ca §21/tên học sinh, tiêu đề đề, luồng lớp và bảng Markdown đã chạy trong bộ Claude.
- Không thấy diff dependency/package trong khoảng lịch sử đã xét. Không đọc secret/config production và không xác minh dịch vụ live. Không tuyên bố audit bảo mật toàn sản phẩm hoặc mọi nội dung của 16 đề đã được kiểm tay.

## Lệnh chạy thật và kết quả

Môi trường: Windows, PowerShell, Node `v24.14.0`, TypeScript hiện có, Chrome headless/CDP của harness; server HTTP và GAS/Neon mock cục bộ. Không cài thêm công cụ. TAP/đầu ra được đọc trực tiếp trong phiên; không tạo file log ngoài scope. Các số dưới đây là test count của Node, không phải số finding lịch sử CX.

| Lệnh | Kết quả thực tế |
| --- | --- |
| `node scripts/build.js` | exit 0; chạy hai lần, lần cuối emit/promote 339 file. Có cảnh báo Node DEP0190 từ spawn shell, không làm build thất bại. |
| `npx --no-install tsc -p tsconfig.json` | exit 0; lần cuối sau build cuối. |
| `npx --no-install tsc -p tsconfig.web.json` | exit 0; lần cuối sau build cuối. |
| `node --test --test-reporter=tap "test/claude-check/**/*.test.mjs" "test/codex-check/*.test.mjs" "test/codex-check/cx/*.test.mjs"` | exit 1; 271 tests, pass 265, fail 6, skip 0, cancelled 0; 256459,6977 ms. Sáu lỗi đều là timeout tải trang 20 giây, không phải assertion nghiệp vụ. Không ghi lần chạy này PASS. |
| `node --test --test-concurrency=1 --test-reporter=tap "test/claude-check/**/*.test.mjs"` | exit 0; 104 tests, pass 104, fail 0, skip 0; 80609,4545 ms. Chạy lại đủ bộ, bao gồm sáu ca timeout nêu trên. |
| `node --test --test-reporter=tap "test/report/r0-f01-f03-regressions.test.ts" "test/collect/r0-f04-regression.test.ts"` | exit 0; 6 tests, pass 6, fail 0, skip 0. Chỉ là bằng chứng cho các API được gọi trong test, không đủ phủ nút tải thực tế. |
| `node --test --test-concurrency=2 --test-reporter=tap "test/claude-check/**/*.test.mjs" "test/codex-check/*.test.mjs" "test/codex-check/cx/*.test.mjs"` | exit 0 trên bản build cuối; 271 tests, pass 271, fail 0, skip 0, cancelled 0; 211188,1418 ms. |
| Ba probe độc lập chạy qua `@'…'@ \| node --input-type=module` | Exit 0 ở ba lần tái hiện thành công; output cụ thể ghi ở F01–F03. Có một lần probe F01 lỗi cú pháp do pipe PowerShell đổi Unicode; đã sửa script thành ASCII và chạy lại thành công, không dùng lần lỗi làm bằng chứng sản phẩm. |
| Google/Vercel/Neon thật; IME Telex/VNI hệ điều hành; nghiệm thu thiết bị thật | NOT_RUN: ngoài quyền/phạm vi phiên review cục bộ này. |

Sáu timeout trong lượt kết hợp đầu: EX-HS-04; teacher.test: về trang học sinh 390×844, chuyển A→B→A; web.test/dist: nhớ vai+tên/link `?exam=`, chấm đề 4-2-2, thang điểm II. Lượt Claude riêng đã PASS toàn bộ sáu ca; không gán timeout chưa tái hiện ổn định thành bug sản phẩm.

## Hành động đề nghị

Giao worker sửa F01–F03, thêm test hành vi ngoài các ca hiện có và chạy lại gate R0 trên snapshot ổn định. Không sửa assert/bỏ test để xanh. Chưa đạt điều kiện APPROVED hoặc hai lượt xanh liên tiếp của lộ trình; dù suite xanh vẫn phải sửa ba lỗi đã tái hiện. Không cần thay đổi cách chấm domain, triển khai thật hay tự quyết nghiệp vụ để xử lý chúng.
