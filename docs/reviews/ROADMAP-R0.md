Verdict: CHANGES_REQUESTED

# R0-REVIEW-3 — kiểm định độc lập R0

- Reviewer: Codex; ngày kiểm tra: 22/11/2026; review_only.
- HEAD: `2019a03fabd3225b5e8bc3a602d0c37a4a94c74f`.
- Phạm vi: WEB-contract §20, §21; bảng Markdown; các ca CX; tên đề giáo viên và tên học sinh. Căn cứ: Shared Product Contract v2.0 (ưu tiên cao nhất), WEB-contract, DESIGN.md, BANG-QUYET-DINH.md, LO-TRINH-V2.md.
- Đã xem cả mã chưa commit, không chỉ HEAD. Working tree đã bẩn trước khi review, gồm thay đổi R0 và API/R1 cùng nhiều artifact. Không sửa source/test, không commit/deploy/install, không đọc `ops/prod_config.json`, không gọi Google/Vercel/Neon thật.

## Giả định, baseline và giới hạn kết luận

Không có commit nào mang đúng tên `Lộ trình R0: test kiểm định` khi tìm trong toàn bộ lịch sử hiện có. Commit mở đầu gần nhất có bằng chứng đúng phạm vi là `14e08dffc4718f6e4c58e1ee7509272a223818e7` — `Lộ trình tới khi hoàn thành + WEB-contract §20: xem lại bài hiện toàn văn câu hỏi (test kiểm định)`. Đã dùng phạm vi rộng hơn `14e08df^..HEAD`, đọc các thay đổi §21/CX tiếp theo và bổ sung `git diff HEAD` cho mã đang chạy. Không coi tên commit không tìm được là một baseline đã xác minh.

BLOCKED_QUESTION (chỉ việc ánh xạ baseline lịch sử): điều phối cần cung cấp SHA nếu tên commit trong prompt chỉ một commit khác. Các finding dưới đây được chứng minh trên working tree hiện tại, không phụ thuộc câu trả lời này. Không có quyết định nghiệp vụ mới cần tự chọn.

Giữ quyết định §21 thay phần công khai của §15/§19.1; D08 cho xem lời giải sau khi nộp. Bốn ca CX-student-F03/F04/F08/F09 bị bỏ có quyết định nghiệp vụ ghi rõ ở BANG-QUYET-DINH đợt 11, nên không quy việc bỏ bốn ca đó thành gian lận.

## Findings còn mở

### R0-R3-F01 — MAJOR — Mất công thức và bảng con trong ô bảng

- **File:line:** `src/app/main.ts:415`–428; đường gọi lúc làm `:1689`, xem lại `:3094`, tải HTML `:3282`.
- **Bằng chứng/root cause:** `renderQuestionStemHtml` duyệt `cell.blocks` nhưng chỉ render `text` và `image`. `math` và `table` là các Block hợp lệ theo WEB-contract §4, song bị bỏ qua hoàn toàn, không có cảnh báo. Cùng helper đang dùng ở cả ba đầu ra thực tế.
- **Tái hiện đã chạy:** dùng Chrome headless/CDP và server dist cục bộ, tạo một câu I bằng `makeExam`, thay `q.blocks` bằng bảng một ô chứa text `MATH-CELL:`, math `{type:'math', source:'x=9876', format:'latex', verified:true}` và bảng con có text `NESTED-CELL-4321`. `parseExam(exam).ok === true`. Nạp bằng `A.loadExam`, đọc DOM màn làm bài, `A.submit`, đọc DOM xem lại, rồi tải HTML bằng nút thật.
- **Actual:** cả màn làm bài và xem lại chỉ có `MATH-CELL:`. HTML tải về cho `html.includes('9876') === false` và `html.includes('NESTED-CELL-4321') === false`.
- **Expected/impact:** toàn văn câu hỏi phải còn công thức/bảng theo §4 và §20. Nội dung dùng để giải bài bị mất trong đề hợp lệ, đồng thời bản báo cáo không thể dùng để xem lại đầy đủ offline.
- **Sửa tối thiểu:** render đầy đủ các loại Block trong ô bằng đường render đệ quy có sẵn hoặc helper dùng chung nhỏ; giữ asset resolver và escape hiện tại, không thêm parser riêng chỉ cho fixture.
- **Regression cần thêm:** ca trình duyệt đi qua `dist/app/main.js`, kiểm tra math và bảng con trong DOM lúc làm, DOM báo cáo và HTML tải về. Test riêng `renderReportHtml` không kiểm chứng được đường UI này.

### R0-R3-F02 — MAJOR — Asset base64 hợp lệ bị dùng như URL, hình câu hỏi không hiện

- **File:line:** `src/app/main.ts:375`–385, đặc biệt `:381`; các đường dùng cùng resolver ở `:1689` và `:3094`.
- **Bằng chứng/root cause:** khi asset có `mime:'image/png'` và `data` là base64 chưa có tiền tố, `resolveAssetSrc` trả thẳng `found.data`. Trình duyệt hiểu base64 là đường dẫn tương đối. Trong khi đó `src/ui/security.ts:171` đã hỗ trợ đúng dạng này bằng `data:${asset.mime};base64,${asset.data.trim()}`, và bộ tải HTML mới cũng tự thêm tiền tố.
- **Tái hiện đã chạy:** câu I có `blocks:[{type:'image',assetId:'img',alt:'pixel'}]`; asset `img`, MIME PNG, dữ liệu base64 `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=`. `parseExam(exam).ok === true`; nạp đề, sau đó nộp.
- **Actual:** ở cả màn làm bài và xem lại, `img.getAttribute('src')` chính là chuỗi base64, `naturalWidth === 0`. CDP ghi hai request 404 tới `/Cunata/iVBORw0KGgo...`, thay vì một ảnh data URI.
- **Expected/impact:** asset nhúng hợp lệ phải hiển thị được, giữ nội dung hình của câu hỏi theo §4/§20; hiện học sinh không thấy hình để giải và xem lại.
- **Sửa tối thiểu:** chuẩn hóa base64 bằng MIME trước khi trả URL; tái sử dụng quy tắc asset an toàn hiện có và không nới MIME/protocol whitelist.
- **Regression cần thêm:** kiểm tra `img.complete && img.naturalWidth > 0` trong trình duyệt thật cho cả asset raw-base64 và data URI, ở màn làm và xem lại; không chỉ assert HTML chứa chuỗi base64.

### R0-R3-F03 — MINOR — Thẻ xem lại thiếu trạng thái kết quả của cả câu

- **File:line:** `src/app/main.ts:3090`–3095.
- **Bằng chứng:** template thẻ trên trang chỉ có tiêu đề, phần và điểm; không render `qr.status`. Bản tải HTML có `statusBadge` ở `:3223`–3225, nên hai đầu ra không cùng mức thông tin.
- **Tái hiện đã chạy:** nạp đề I/II/III rồi nộp bỏ trống bằng helper trình duyệt. Header câu III là `Câu 3 (Phần III - Trả lời ngắn) (Phần III) (0 / 8,75 điểm)`; không có trạng thái câu. Với câu II, dòng từng ý có Đúng/Sai/Chưa chọn nhưng không có trạng thái tổng của câu (đúng một phần/hoàn toàn/sai/bỏ trống).
- **Expected/impact:** §20 yêu cầu mỗi thẻ có số câu, phần, điểm và trạng thái. Điểm hay đáp án chuẩn không thay thế nhãn trạng thái kết quả của cả câu.
- **Sửa tối thiểu:** thêm nhãn chữ từ `qr.status`, phân biệt `full`, `partial`, `wrong`, `unanswered`, `invalid`, nhất quán với HTML tải về.
- **Regression cần thêm:** assert nhãn trạng thái trên từng thẻ của đủ ba phần, gồm II đúng một phần và III bỏ trống; không chỉ kiểm nội dung đáp án.

## Kiểm tra sửa giả, bảo mật và độ phủ

- Đã xem log/diff của source, build và hai thư mục kiểm định trong khoảng lịch sử trên; so riêng các dòng assertion bị xóa và thay đổi helper. Các đổi đường vào đề công khai sang lớp/file phù hợp quyết định §21; các assertion tên HS, tiêu đề đề GV, bảng Markdown và đủ lựa chọn/mệnh đề vẫn có kiểm tra tương ứng. Working tree không sửa các file `*.test.mjs`/helper của hai bộ kiểm định so với HEAD; các JSON/PNG bằng chứng được test sinh lại có thay đổi.
- Không tìm thấy nhánh production mới dò `navigator.webdriver`, user-agent, tên/id `claude-check`/`codex-check`/`CX-`, hoặc gắn cứng điểm để vượt các ca được rà. Các literal localhost ở cơ chế offline dùng kiểm tra secure origin; không kết luận chúng là nhánh gian lận. Đây là kết quả rà trong phạm vi, không phải chứng nhận bảo mật toàn bộ repo.
- `ops/blitz/promoted/_support/runtime.mjs` được CX nạp có shim hoàn tất request CDP `Browser.close` khi teardown. Không sửa score/assert/result; không coi shim này là bằng chứng product hoạt động.
- Điểm mù thực tế: `src/report/view.ts`/`download.ts` và `src/app/main.ts` có đường render báo cáo khác nhau. Bảy regression module đang xanh không đảm bảo helper hiển thị trong `dist` giữ đủ Block/ảnh/trạng thái; F01–F03 được kiểm trực tiếp qua đường UI.
- Các ca lớp/tên đề/tên học sinh, §21, bảng Markdown và CX được chạy bằng bộ kiểm định thật bên dưới. Không suy rằng 55 lỗi cũ đều đã được giải quyết chỉ từ count xanh.

## Checks chạy thật

Môi trường: Windows/PowerShell, Node `v24.14.0`, TypeScript `7.0.2`, Chrome headless qua CDP; HTTP localhost dưới `/Cunata/`, Apps Script giả lập khi test cần backend. Không dùng mock thay bằng chứng dịch vụ thật: dịch vụ thật không nằm trong quyền task này.

| Lệnh/kiểm tra | Exit | Kết quả |
|---|---:|---|
| `node scripts/build.js` | 0 | PASS, promote 339 file dist; có warning DEP0190, không phải lỗi build |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS |
| `node --test --test-reporter=tap "test/claude-check/**/*.test.mjs" "test/codex-check/*.test.mjs" "test/codex-check/cx/*.test.mjs"` | 1 | 271 test; 269 pass, 2 fail, 0 skip/cancel; 206898.783 ms. Output trung gian bị giới hạn hiển thị; không gán hai lỗi đó cho một nguyên nhân chưa chứng minh |
| `node --test --test-reporter=tap "test/codex-check/*.test.mjs" "test/codex-check/cx/*.test.mjs"` | 0 | 167 pass, 0 fail/skip/cancel; 289780.5229 ms |
| `node --test --test-reporter=tap "test/claude-check/**/*.test.mjs"` | 1 | 104 test; 101 pass, 3 fail, 0 skip/cancel; 287167.2912 ms. Ba ca dist: màn 360px, trộn, cold offline; đều `Trang không tải xong trong 20000 ms` tại harness.mjs:162 |
| `node --test --test-reporter=tap --test-concurrency=1 "test/claude-check/**/*.test.mjs"` | 0 | Toàn bộ Claude: 104 pass, 0 fail/skip/cancel; 257639.4836 ms |
| `node --test --test-reporter=tap --test-concurrency=1 --test-name-pattern='360px\|đề bật trộn\|tắt hẳn' test/claude-check/web.test.mjs` | 0 | 5/5 test được chọn pass (2 root, 3 dist), 0 fail/skip/cancel; 15128.6772 ms |
| `node --test test/report/r0-f01-f03-regressions.test.ts test/collect/r0-f04-regression.test.ts` | 0 | 7 pass, 0 fail/skip/cancel; 15302.1785 ms |
| Ba probe độc lập qua `node --input-type=module` (script truyền stdin, không tạo file test) | 0 | Tái hiện F01/F02/F03; output DOM/CDP/download mô tả ngay trong từng finding |

Các timeout ở lượt song song là kết quả FAIL thật, nhưng cả các ca chọn riêng lẫn toàn bộ Claude chạy tuần tự đã xanh; chưa có bằng chứng chúng là hồi quy sản phẩm. Không xóa/nới test để làm xanh. Chưa xác minh điều kiện hai lượt toàn bộ liên tiếp xanh của LO-TRINH-V2; không ghi đè kết quả FAIL trước đó thành PASS. Verdict yêu cầu sửa dựa trên F01/F02/F03, không dựa vào phỏng đoán nguyên nhân timeout.

NOT_RUN: Google/Apps Script thật, Vercel, Neon thật (bị cấm trong task); IME hệ điều hành, trình đọc màn hình, Lighthouse và audit toàn bộ API/R1 (ngoài phạm vi rà R0). Không tuyên bố owner nghiệm thu hay hoàn thành R0.

## Snapshot và bàn giao

SHA-256 source chính tại lượt kiểm tra:

```text
src/app/main.ts          9441469F8E314B52BBA2E4FA778D08E3646930538E0E4E1996729BA945AFFDCF
src/report/index.ts      31C4816874627A115D921B4193DC68D30D40583ADF1386F55C507464D0F269CE
src/report/view.ts       A7DD255C87D0422281013AF286F58A40D9A445217BA4419940F4856CCFDB0BAE
src/report/download.ts   B34C137BDBA2EE56FFB18BEF557CE02AAD185D0D6CA7585126BFF0E93230A0D1
src/student/area.ts      B98282DE4FB238FA7F7272225D065F0D0C69B6124E97DA3AF3FDC79385D52A8A
src/teacher/portal.ts    2B3A26F76CB85BB46D376194ADF392617BCA3059E195E6958783BEE6EB57BA12
src/collect/appsScript.ts 77BB9A8366A926B5D50327BF9F0EC23C1A5D3F8B8903A2036B5251B790046B3B
```

Thay đổi có chủ đích của reviewer: chỉ `docs/reviews/ROADMAP-R0.md`. Build/test bắt buộc tái sinh dist và artifact của harness; không hoàn nguyên chúng bằng git reset/checkout vì đã có thay đổi của người khác trước lượt rà. Không ghi thêm log/test/source ngoài scope.

Khuyến nghị: giao worker sửa F01/F02/F03, bổ sung regression qua UI thực tế, chạy lại gate R0 và Claude hai lượt ổn định rồi review lại snapshot mới. Chưa APPROVED; không commit/deploy từ báo cáo này.
