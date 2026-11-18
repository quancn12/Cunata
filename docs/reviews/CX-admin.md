# CX-admin — Rà soát trang Admin

- `review_id / task_id / worker_id`: CX-admin; reviewer: Codex.
- Ngày kiểm: 18/11/2026, Windows/PowerShell, Node v24.14.0, Chrome headless/CDP qua harness có sẵn.
- `base_commit = head_commit`: `178fb4f86735fd8fae89133a26a2ed3cf1c79185`.
- Kết luận: **CHANGES_REQUESTED**. Chưa đề nghị nghiệm thu trang Admin: có 2 MAJOR và 3 MINOR đã tái hiện. Không phát hiện BLOCKER trong phạm vi đã kiểm.
- Đây là bàn giao kiểm định, không sửa mã sản phẩm. Chỉ tạo báo cáo này và bằng chứng/test trong `ops/blitz/admin/`. Không build, install, commit, deploy hay gọi Google thật.

## 1. Căn cứ và snapshot

Đã đọc Shared Product Contract v2.0, toàn bộ `docs/contracts/WEB-contract.md`, `docs/design/DESIGN.md`, `docs/decisions/BANG-QUYET-DINH.md`, và mẫu bàn giao M1 §2 được WEB §2 dẫn chiếu. Phạm vi chức năng theo WEB §19.1–19.2, giao tiếp/cấu hình theo §17.1–17.2/17.6, giao diện theo DESIGN. Các quyết định D01–D08 không bị thay đổi bởi lượt kiểm này.

Hash SHA-256 đã chụp trước kiểm thử; các file HTML đã được chụp ngay khi nhận task. Manifest đầy đủ của các JS/CSS/HTML trong dist, config/manifest đề, Code.js và source Admin liên quan nằm ở `ops/blitz/admin/snapshot-start.json`; đối chiếu cuối lượt chạy ở `snapshot-end.json`. Kiểm tra không đổi hash là hook bắt buộc của bộ proposed test.

| File | SHA-256 |
|---|---|
| dist/admin.html | e3fb2aa3ce87be415a8f367301a6e4855b810f8d83f7c90a9f4c2d9bd5695ca9 |
| dist/index.html | 4f45f2dc2bbbdccf6d6f636feda6fe72c05c4fb04b34385f88ecaacdfc1de8e9 |
| dist/admin/main.js | 9d53505da08b5c3f6e458d33db1ec0d65e018257845e8bb063639ac5684e4d33 |
| dist/admin/view.js | ecaad752b528980186426c9053b74521bcfbf33dd60d8eb212bb34dc843e6927 |
| dist/admin/admin.css | 71ed174e8b3e2ebbb91b07e76b267518dfa2b0d47fd7ea1dab959c91cc89efeb |
| dist/collect/appsScript.js | 85351d11fc4446d685dee796fc2255c0b5978d9d4ad69f1a4e4a47b7c568e6a4 |
| apps-script/Code.js | f8e7cbbf6b113bd4a8d97ac00599a2bbcf407f01d2c935ba639afb5d4bda2389 |

Đường chạy thực tế: `dist/admin.html → dist/admin/main.js/view.js → dist/collect/appsScript.js → gas-server.mjs → gas-fake.mjs → apps-script/Code.js`. Máy chủ tĩnh dùng `startServer(dist, {overrides})`, phục vụ dưới `/Cunata/`; chỉ ghi đè config trong phản hồi HTTP để trỏ loopback. Không đọc `ops/prod_config.json`. Không dùng client giả thay luồng Admin. Các thao tác nhập dùng `page.type` của harness (`Input.insertText`, chọn văn bản để thay), bấm nút và gửi phím thật; không gán `.value` bằng JS trong test.

Mỗi test có browser context, máy chủ và Google Sheet giả sạch; luôn đóng trong `finally`. Chỉ mở tối đa hai tiến trình browser của lượt kiểm này tại cùng thời điểm; proposed suite tự dùng một browser, chạy tuần tự. Fixture hết hạn sửa `expiresAt` phía máy chủ giả, xóa bản cache tương ứng, giữ nguyên token và đồng hồ trình duyệt; Code.js thật xác nhận `UNAUTHORIZED`. Đây không phải bằng chứng chạy trên Google thật.

## 2. Phạm vi đã chạy

| Nhóm | Ca và kết quả quan sát |
|---|---|
| Đăng nhập | C01–C05: rỗng không POST; sai bị từ chối; thiếu ADMIN_PASSWORD có giải thích; endpoint rỗng không gọi GAS; đúng mở panel, xóa ô mật khẩu, lưu token trong sessionStorage; logout xóa token. |
| Giao tiếp | POST text/plain, redirect qua `/echo`, không OPTIONS; các lệnh thống kê/danh sách dùng token, không gửi lại mật khẩu Admin; không có request ngoài loopback trong bằng chứng. |
| Tạo giáo viên | C06–C16/C23: tên rỗng, username 2/33 ký tự, khoảng trắng, dấu tiếng Việt, chữ hoa đều bị từ chối; biên 3/32 ký tự và ký tự `._-` hợp lệ; mật khẩu 7 ký tự bị chặn, đúng 8 ký tự được chấp nhận; username trùng báo tiếng Việt và không nhân đôi hàng. |
| Danh sách / mật khẩu | C06/C17: `.teacher-row[data-username]` đúng; tài khoản mới dùng được trên Code.js; reset chặn mật khẩu ngắn; mật khẩu cũ bị từ chối và mật khẩu mới dùng được. Readback đăng nhập giáo viên là gọi Code.js trong Google giả, không tuyên bố đã kiểm toàn khu giáo viên. |
| Khóa / mở | C18: thao tác trên hàng đổi trạng thái; Code.js từ chối đăng nhập khi khóa và cho phép sau mở. |
| Thống kê | C05/C19: bốn chỉ tiêu rỗng là 0; fixture giáo viên/lớp/đề/bài nộp kiểm số tương ứng bằng dữ liệu Code.js thật trên Google giả. |
| Phiên / điều hướng | C20: reload phiên hợp lệ lấy lại danh sách mà không đăng nhập lại. C21: khu học sinh đã qua cổng tên không có liên kết Admin. F01/F01-reload kiểm phiên hết hạn. |
| Bàn phím / dữ liệu nhập | C22 kiểm Enter đăng nhập, Tab tới nút tạo, Enter mở hộp thoại, focus vào tên, Esc đóng và trả focus. C24 kiểm tên giáo viên chứa HTML chỉ thành văn bản, không sinh img/script hay alert. C25 kiểm tạo khi HTTP 500: có thông báo, giữ dữ liệu, thử lại thành công. |
| Giao diện | Bộ design có sẵn: 2 ca Admin, 375/1440px. Khảo sát riêng panel ở 375/768/1440px, sáng/tối; đo vùng bấm và tràn ngang, chụp/đọc trực quan 6 ảnh panel và 2 ảnh hộp thoại ở 375px. Không thấy tràn ngang hoặc control dưới 44×44px trong các trạng thái đã đo. |

## 3. Bảng findings đã xác minh

| ID | Mức | Vấn đề | File:line của source và dist | Căn cứ | Test đỏ |
|---|---|---|---|---|---|
| CX-admin-F01 | MAJOR | UNAUTHORIZED khi làm mới bị bỏ qua; reload phiên hết hạn kẹt trong panel | `src/admin/main.ts:100`, `src/admin/main.ts:384`; `dist/admin/main.js:81`, `dist/admin/main.js:336` | WEB §19.1 cổng đăng nhập/panel; §19.2 token hết hạn → UNAUTHORIZED; DESIGN §1.5, §4 ErrorState | F01, F01-reload |
| CX-admin-F02 | MINOR | Mật khẩu Admin có dấu cách đầu/cuối bị đổi trước khi xác thực | `src/admin/main.ts:125`, `src/admin/main.ts:140`; `dist/admin/main.js:105`, `dist/admin/main.js:117` | WEB §19.2 adminLogin `{password}`, ADMIN_PASSWORD; không có quy tắc chuẩn hóa mật khẩu | F02 |
| CX-admin-F03 | MINOR | Tạo/reset giáo viên cắt dấu cách mật khẩu: từ chối chuỗi đủ 8 ký tự hoặc lưu mật khẩu khác bản nhập | `src/admin/main.ts:183`, `src/admin/main.ts:238`; `dist/admin/main.js:159`, `dist/admin/main.js:207` | WEB §19.2 adminCreateTeacher/adminResetPassword, mật khẩu ≥8 ký tự; không có quy tắc cắt khoảng trắng | F03, F03-reset |
| CX-admin-F04 | MAJOR | Làm mới lỗi mạng/server không có thông báo; lần tải đầu bị trình bày như danh sách rỗng | `src/admin/main.ts:100`, `src/admin/main.ts:112`, `src/admin/main.ts:116`; `dist/admin/main.js:81`, `dist/admin/main.js:92`, `dist/admin/main.js:96` | WEB §19.1 danh sách/thống kê; DESIGN §1.5 và §4 ErrorState/OfflineBanner: nói lỗi và cách thử lại | F04, F04-initial |
| CX-admin-F05 | MINOR | Trường sai không có aria-invalid và không liên kết thông báo lỗi | `src/admin/main.ts:191`, `src/admin/view.ts:274`; `dist/admin/main.js:165`, `dist/admin/view.js:209` | WEB §9 labels/a11y; DESIGN §4 Input: aria-invalid + aria-describedby | F05 |

### CX-admin-F01 — Phiên hết hạn không có đường đăng nhập lại rõ ràng

**Các bước thật đã chạy:** mở `/Cunata/admin.html`, nhập mật khẩu, bấm đăng nhập; tạo một giáo viên để có dữ liệu đang hiển thị; hết hạn phiên trên Google giả như mô tả §1; kiểm Code.js trả `UNAUTHORIZED` cho chính token đó; bấm `#btnRefreshAdmin`. Ca thứ hai reload sau hết hạn.

**Actual:** sau Làm mới, `adminPanel` vẫn thấy, `adminLogin` vẫn ẩn, còn nguyên số liệu/hàng giáo viên cũ, không thông báo hết hạn. Sau reload panel rỗng hiện câu “Chưa có tài khoản giáo viên nào”, vẫn không có cổng đăng nhập. Backend vẫn chặn quyền: chưa thấy khả năng ghi trái quyền; lỗi là trạng thái/khôi phục phiên ở frontend.

**Expected:** khi nhận UNAUTHORIZED phải đưa người dùng về đăng nhập hoặc yêu cầu đăng nhập lại rõ ràng; reload không được kẹt trong panel rỗng với token không hợp lệ. **Tác động:** mọi phiên hết hạn đều có thể mắc lỗi, quản trị viên phải tự tìm cách logout để phục hồi.

**Nguyên nhân và sửa tối thiểu:** `refresh()` chỉ đọc nhánh `.ok`, giữ token, gán `error:null` ngay cả khi cả hai Result lỗi. Xử lý UNAUTHORIZED của một trong hai Result, xóa token và dữ liệu phiên, đóng hộp thoại còn mở, trả cổng đăng nhập kèm giải thích; áp dụng cùng xử lý phiên cho thao tác tạo/reset/khóa. Không đòi thay backend.

**Bằng chứng:** `ops/blitz/admin/F01.json`, `F01.png`, `F01-reload.json`, `F01-reload.png`; test `F01` và `F01-reload` trong `proposed.test.mjs`.

### CX-admin-F02 — Mật khẩu Admin nguyên văn bị từ chối

**Các bước thật đã chạy:** cấu hình fixture `ADMIN_PASSWORD = " Admin-123456 "`; gọi Code.js trực tiếp với chuỗi nguyên văn để xác nhận backend chấp nhận; nhập đúng chuỗi đó vào `#adminPassword`, bấm `#btnAdminLogin`.

**Actual:** POST nhận 12 ký tự thay vì 14; dấu cách đầu/cuối bị cắt. UI báo “Sai tên đăng nhập hoặc mật khẩu”, không mở panel. **Expected:** gửi đúng mật khẩu đã nhập; hợp đồng không cấm dấu cách hoặc cho phép frontend tự thay mật khẩu. **Tác động:** không đăng nhập được nếu Script Property chứa loại mật khẩu này. Mức MINOR vì chỉ ảnh hưởng trường hợp có dấu cách biên.

**Sửa tối thiểu:** không trim giá trị gửi xác thực; có thể dùng kiểm tra rỗng riêng nhưng phải giữ nguyên chuỗi cho `client.adminLogin(password)`. Không sửa giá trị Script Property để che lỗi.

**Bằng chứng:** `F02.json` có `sentMatchesInput:false`, `inputLength:14`, `sentLength:12`; `F02.png`; test `F02`.

### CX-admin-F03 — Mật khẩu giáo viên bị thay đổi âm thầm

**Các bước thật đã chạy:** đăng nhập Admin, mở hộp thoại tạo giáo viên, nhập tên/username hợp lệ và mật khẩu `" 123456 "` (8 ký tự), bấm xác nhận. Trong ca riêng, tạo tài khoản bình thường, mở đặt lại mật khẩu, nhập `" Moi-123456 "`, bấm xác nhận rồi dùng Code.js kiểm đăng nhập với đúng bản nguyên văn.

**Actual:** tạo với 8 ký tự bị báo “ít nhất 8 ký tự” và không POST vì trim thành 6. Reset mật khẩu dài hơn báo thành công nhưng gửi bản đã trim, đăng nhập với chuỗi nguyên văn vừa đặt thất bại. **Expected:** kiểm độ dài và lưu đúng mật khẩu được nhập, theo điều kiện ≥8 ký tự trong §19.2. Không tự bổ sung chính sách cấm dấu cách. **Tác động:** thông tin mật khẩu giao cho giáo viên khác dữ liệu đã lưu; chỉ ảnh hưởng loại chuỗi biên này nên xếp MINOR.

**Sửa tối thiểu:** bỏ `.trim()` cho password ở cả `createTeacher` và `resetPassword`; kiểm độ dài nhất quán với Code.js (`Array.from(password).length`), giữ trim riêng tên hiển thị nếu cần. Test chỉ yêu cầu backend readback đúng mật khẩu Admin đặt, không giả định toàn bộ portal giáo viên đã sửa.

**Bằng chứng:** `F03.json`, `F03.png`, `F03-reset.json` (`sentMatchesInput:false`), `F03-reset.png`; test `F03`, `F03-reset`.

### CX-admin-F04 — Lỗi tải dữ liệu bị biến thành dữ liệu cũ/rỗng

**Các bước thật đã chạy:** đăng nhập và tạo giáo viên; đặt `gas.setFailPosts(2)` để đúng hai POST tiếp theo trả HTTP 500; bấm `#btnRefreshAdmin`, đợi nút được bật lại. Ca riêng mở phiên sạch, để adminLogin chạy Code.js thật nhưng trả lỗi server xác định cho `adminStats/adminListTeachers` tại máy chủ giả, rồi đăng nhập.

**Actual:** hai HTTP 500 có trong log browser; không có thông báo lỗi tại chỗ. Panel giữ số cũ như cập nhật thành công. Ở lần tải đầu, panel không có thống kê và báo “Chưa có tài khoản giáo viên nào”, dù chưa đọc được dữ liệu. **Expected:** phân biệt tải thất bại với dữ liệu rỗng; báo tiếng Việt và cho thử lại. Có thể giữ dữ liệu cũ nhưng phải ghi rõ chưa cập nhật được. **Tác động:** quản trị viên bị dẫn tới hiểu sai số liệu và tình trạng tài khoản khi mạng/server lỗi.

**Sửa tối thiểu:** kiểm từng Result không `.ok`, lưu/hiện lỗi ở một ErrorState trong panel với nút thử lại; nhánh catch cũng phải render lỗi. Chỉ hiện empty state sau lần tải danh sách thành công. Trường hợp UNAUTHORIZED chuyển qua xử lý F01. F01 và F04 chia theo nhánh lỗi cần khôi phục khác nhau, không phải hai lỗi backend.

**Bằng chứng:** `F04.json` có đúng hai lỗi HTTP 500, `F04.png`, `F04-initial.json/png`; test `F04`, `F04-initial`. C25 là đối chứng: lỗi mạng khi *tạo* tài khoản đã được báo đúng, không gộp mọi thao tác thành lỗi.

### CX-admin-F05 — Thông báo lỗi không gắn với ô nhập sai

**Các bước thật đã chạy:** đăng nhập, mở tạo giáo viên, nhập username `ab`, các trường khác hợp lệ, bấm xác nhận rồi đọc thuộc tính của `#newTeacherUsername`.

**Actual:** thông báo nhìn thấy trong `#createTeacherError`, nhưng `aria-invalid=null` và `aria-describedby=null`. **Expected:** trường sai có `aria-invalid="true"` và trỏ tới nội dung lỗi liên quan như DESIGN §4 yêu cầu. **Tác động:** công nghệ hỗ trợ không xác định được ô sai và mối liên hệ với thông báo; aria-live chung không thay thế hai thuộc tính đã quy định.

**Sửa tối thiểu:** cập nhật trạng thái và liên kết lỗi trên từng input khi validate; xóa trạng thái lỗi sau khi sửa hợp lệ/đóng và mở lại hộp thoại. Dùng thông báo riêng từng trường hoặc liên kết lỗi chung đều được. Test kiểm liên kết tới nội dung lỗi, không bắt buộc tên ID của phần tử lỗi.

**Bằng chứng:** `F05.json`, `F05.png`; test `F05`.

## 4. Lệnh và kết quả đo

Chạy tại `D:\Cunata`. Các bộ test dưới đây chỉ tạo artifact trong phạm vi được giao hoặc thư mục tạm do harness quản lý.

| Lệnh | Exit | Pass / fail / skip | Log |
|---|---:|---|---|
| `git rev-parse HEAD` | 0 | SHA như §1 | Ghi trong snapshot |
| `Get-FileHash -Algorithm SHA256 dist/admin.html,dist/index.html` | 0 | Hash như §1 | Bảng snapshot |
| `node --test ops/blitz/admin/proposed.test.mjs` — lượt đầu 28 ca | 1 | 21 / 7 / 0 | `ops/blitz/admin/proposed.tap.txt` (reporter mặc định, nội dung không phải TAP) |
| `node --test ops/blitz/admin/proposed.test.mjs` — lượt cuối, bản bàn giao | FINAL_PENDING | FINAL_PENDING | `ops/blitz/admin/proposed.log.txt` |
| `node --test --test-name-pattern=admin test/claude-check/design.test.mjs` | 0 | 2 / 0 / 0 | `ops/blitz/admin/design-admin.tap.txt` |
| `node --test --test-name-pattern=Admin test/claude-check/appsscript.test.mjs` | 0 | 2 / 0 / 0 | `ops/blitz/admin/backend-admin.tap.txt` |
| `node ops/blitz/admin/visual.mjs` | 0 | Khảo sát, không phải node:test | `visual.log.txt`, `visual-metrics.json`, 8 ảnh PNG |
| `npx --no-install tsc -p tsconfig.json` | 0 | Compiler không phát lỗi | `typecheck-node.txt` |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | Compiler không phát lỗi | `typecheck-web.txt` |

Các ca đỏ F01–F05 là assertion về hành vi hợp đồng đã được tái hiện, không phải skip/timeout hay cố ý `assert.fail`. Không sửa source/dist để làm xanh. Bộ test phải tiếp tục đỏ cho tới khi owner sửa các lỗi tương ứng. Kết quả typecheck xanh không phủ định các lỗi runtime này.

Mỗi ca có JSON bằng chứng với tên tương ứng, phương thức/content-type/action của request, lỗi console và request ngoài loopback; không lưu token/mật khẩu vào log mạng. Fixture dùng tên và thông tin giả. Favicon 404 xuất hiện trong các context sạch và được tách khỏi finding. HTTP 500 trong các ca gây lỗi là chủ đích, không báo là lỗi bootstrap.

## 5. Giới hạn và NOT_RUN

- **NOT_RUN:** Google Apps Script/Sheets/Drive thật, CORS trên origin triển khai thật, quyền Google, readback dữ liệu production. Bị cấm theo task; không suy nghiệm thu live từ fake server.
- **NOT_RUN:** chờ 8 giờ theo thời gian thật. Test hết hạn bằng fixture server với expiresAt quá khứ, có kiểm Code.js trả UNAUTHORIZED trước thao tác UI.
- **NOT_RUN:** Firefox/WebKit, thiết bị di động thật, screen reader thật, Telex/VNI ở cấp hệ điều hành; không đồng nhất Input.insertText với chứng nhận IME thật.
- **NOT_RUN:** toàn bộ bộ design/student/teacher; chỉ chạy lọc Admin ở hai bộ kiểm tra sẵn có. Không suy kết quả cho các ca bị lọc. Không chạy build/full regression suite vì task chỉ kiểm bản dist hiện có và máy có nhiều worker.
- **NOT_RUN:** axe/Lighthouse và đo tương phản toàn bộ trạng thái; không cài thêm dependency. Vùng bấm/phông/overflow chỉ được xác nhận trong trạng thái/viewport đã ghi.
- **NOT_RUN:** kiểm toàn bộ nghiệp vụ cổng giáo viên, bảo mật backend độc lập hoặc dữ liệu lớn. Readback bằng Code.js nhằm xác nhận tác động thao tác Admin, không thay cho audit các vùng khác.
- Kho đã có các thay đổi của worker khác tại preflight. Không reset/revert hay ghi đè các thay đổi đó. Không có yêu cầu nghiệp vụ mới cần tự chốt; không đề xuất thay D01–D08.

## 6. Gợi ý — không tính vào lỗi

Sau đăng nhập, `.admin-login-wrapper` vẫn giữ min-height dù phần login ẩn (`src/admin/admin.css:21`, `src/admin/main.ts:46`). Ở viewport cao 900px, đầu thống kê nằm tại y=646 trong cả ba bề rộng: ảnh panel cho thấy khoảng trống rất lớn trước công việc chính. Có thể ẩn wrapper cùng login để giảm cuộn. Đây là gợi ý bố cục; không đặt ra ngưỡng khoảng trống mới và không dùng làm finding đỏ.

## 7. Đề nghị xử lý

Giao owner Admin xử lý F01/F04 trước, rồi giữ nguyên chuỗi mật khẩu và bổ sung trạng thái input cho F02/F03/F05. Chạy lại `node --test ops/blitz/admin/proposed.test.mjs` và các gate liên quan sau build của owner; ghi SHA/hash mới. Bản review này chỉ áp dụng snapshot ở §1; không phê duyệt mã build sau đó. Các quyết định triển khai/production vẫn thuộc điều phối và Trưởng phòng.
