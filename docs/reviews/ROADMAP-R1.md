Verdict: APPROVED

# R1-REVIEW-3 — Máy chủ Vercel lõi

- review_id / task_id: R1-REVIEW-3; reviewer: Codex; ngày: 22/11/2026.
- Mục được duyệt: R1, phần máy chủ của WEB-contract §22, kế thừa giao tiếp §17.2–17.6 và §19.2/19.2a. Không phải nghiệm thu production hoặc phê duyệt toàn bộ R2–R11.
- base_commit: `cd8a9f5299f4f7fa4995c267f04688dcd3508e0f` — “Lộ trình R1: test kiểm định của Codex (13 file)”. Đọc cả diff của commit mở mục và lịch sử tiếp theo tới HEAD.
- head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`.
- Snapshot thực kiểm: HEAD cộng các thay đổi chưa commit có sẵn, đặc biệt `src/api/{handle,types}.ts`, `src/api/store/{memory,neon}.ts` và `test/api/r1-findings.test.ts`. Không coi HEAD đơn lẻ là bản đã qua các kiểm tra bên dưới.
- Mức rủi ro: cao — xác thực, quyền ghi đề và tính toàn vẹn kết quả.

## Căn cứ và giả định

Đã đọc Shared Product Contract v2.0, toàn bộ WEB-contract, DESIGN.md, BANG-QUYET-DINH.md và LO-TRINH-V2.md. Các quyết định cập nhật trong §19/§22 là yêu cầu hiện hành cho tài khoản giáo viên, Vercel/Neon và hạn nộp rỗng. Dữ liệu điểm phía client trong chế độ luyện tập không được diễn giải thành máy chủ chấm thi đáng tin cậy.

Giả định phạm vi: chỉ đánh giá R1; bảng `students` phải được tạo theo §22 nhưng các hành động PIN/học sinh của §23 thuộc R3. Cấu hình/publish thuộc R2 chỉ được kiểm như ranh giới tương thích có sẵn trong bộ R1. Không có BLOCKED_QUESTION hoặc quyết định nghiệp vụ mới cần tự chọn trong phạm vi này.

Working tree có nhiều thay đổi và tiến trình khác hoạt động từ trước. Để không ghi đè sản phẩm/artifact dùng chung, chạy build và test trong bản sao tạm của source hiện hành, không tạo branch/worktree. Không sao chép hoặc đọc `ops/prod_config.json`; publisher chỉ chạy trong fixture vô hiệu hóa git/subprocess/mạng. Trong workspace gốc, phiên review này chỉ tạo báo cáo này.

## Phần đã rà soát

- `src/api/handle.ts`, `types.ts`, `auth.ts`, `examValidation.ts`, `rational.ts`, `index.ts`, `ambient.d.ts`; cả hai Store.
- `scripts/web-build.ts`, wrapper `scripts/build.js`, hợp đồng artifact `dist/api`, và đường publish được kiểm bằng fixture.
- Test R1: `api.test.mjs`, `storage.test.mjs`, `glue.test.mjs` và các helper; các ca Vercel của Claude, thay đổi helper/test Claude trong khoảng lịch sử; các regression `test/api`.
- Đối chiếu caller `src/collect/appsScript.ts` và schema ở các đường dữ liệu liên quan.

Không phát hiện finding còn mở cần sửa trong R1 ở snapshot này. Đặc biệt đã kiểm lại những đường dễ báo thành công sai hoặc vượt quyền:

1. `NeonStore.saveExam` chỉ trả thành công từ dòng `RETURNING` của UPSERT có điều kiện owner; không dùng SELECT tiếp theo để biến thao tác ghi 0 dòng thành thành công. Regression R1-REVIEW2-F01 kiểm cả xen kẽ xóa đề, owner cạnh tranh và cập nhật cùng owner.
2. Gỡ đề truyền owner tới Store; Neon DELETE kiểm owner trong chính câu SQL. Yêu cầu gỡ chậm không xóa đề mới của giáo viên khác.
3. Tạo giáo viên dùng INSERT-only, trả USERNAME_TAKEN khi username đã tồn tại; không còn đọc trước rồi UPSERT ghi đè tài khoản của request thắng.
4. Đặt lại mật khẩu và đổi active cập nhật riêng cột liên quan, tăng auth_gen nguyên tử; phiên tạo từ thế hệ cũ bị từ chối. Không phục hồi mật khẩu cũ khi hai thao tác xen kẽ.
5. Nộp kết quả lấy bản ghi thắng từ Store để phân biệt NEWLY_RECORDED, ALREADY_RECORDED và PAYLOAD_CONFLICT; retry không làm đổi dữ liệu đã nhận. Bài đã nhận vẫn retry được sau hạn; bài mới kiểm NOT_OPEN, PAST_DUE và bù mạng 2 phút; dueAt rỗng không tạo PAST_DUE.
6. Phiên 32 byte ngẫu nhiên, lưu token băm; mật khẩu scrypt có muối; hết hạn 8 giờ và kiểm quyền theo lớp/đề. Phản hồi thông thường không trả credential.
7. Neon dùng endpoint/header/body SQL-over-HTTP theo §22, giá trị động đi qua params, không giữ bản sao dữ liệu trong Map. DDL tạo đủ 7 bảng; Store bộ nhớ chỉ dùng cho test.
8. Build sinh catalog từ manifest và artifact API tự chứa; kiểm bằng manifest đổi tiêu đề trong fixture. Các đường getClass/listAssignments dùng metadata đề tĩnh thật. Entry Vercel import tĩnh handle và tự tạo NeonStore; kiểm CORS preflight bằng handler đã build.

## Rà soát sửa giả / bộ kiểm định

`git diff cd8a9f5 HEAD -- test/codex-check/feat/R1` rỗng; không có thay đổi chưa commit trong bộ R1 hoặc Claude tại thời điểm kiểm. Không có thay đổi package/lock trong khoảng này. Không thấy nhánh production dò tên test, ID fixture hoặc môi trường kiểm định trong source API/build để trả dữ liệu gắn cứng.

Claude có bổ sung ca Vercel, ca học sinh/giáo viên và đổi helper trong lịch sử; không có bằng chứng nới assert để che lỗi R1. Helper `startFromCard` có đường nạp tệp cho selector đề công khai cũ theo §21, nên không dùng các ca đi đường đó làm bằng chứng học sinh vào bài qua lớp. R1 có các ca trình duyệt riêng đi qua máy chủ cục bộ và handle thật. `_node.js` do build sinh đổi cách lấy Node builtin để artifact dùng import tương đối; đã kiểm artifact chạy được, không coi việc qua regex kiểm import là đủ bằng chứng.

## Kiểm tra chạy thật

Môi trường: Windows 10.0.26300, Node v24.14.0, TypeScript 7.0.2; Chrome/Edge headless qua CDP của harness hiện có. Không cài dependency.

Bản sao kiểm tra và log: `%USERPROFILE%\AppData\Local\Temp\cunata-r1-review3-m2qst953`.

| Lệnh (cwd = bản sao) | Exit | Kết quả |
| --- | --- | --- |
| `node scripts/build.js` | 0 | PASS, emit/promote 148 file; có dist/api |
| `node node_modules/typescript/bin/tsc -p tsconfig.json` | 0 | PASS |
| `node node_modules/typescript/bin/tsc -p tsconfig.web.json` | 0 | PASS |
| `node --test --test-reporter=tap "test/codex-check/feat/R1/**/*.test.mjs"` — lượt hợp lệ 1 | 0 | 31 pass, 0 fail, 0 skip; `r1-run2.tap` |
| Cùng lệnh R1 — lượt hợp lệ 2 | 0 | 31 pass, 0 fail, 0 skip; `r1-run3.tap` |
| `node --test --test-reporter=tap "test/claude-check/*.test.mjs"` | 0 | 104 pass, 0 fail, 0 skip, 5 suites; `claude.tap` |
| `node --test --test-reporter=tap "test/api/**/*.test.ts"` | 0 | 25 pass, 0 fail, 0 skip; `api-regression.tap` |
| `node --test --test-reporter=tap "test/codex-check/feat/R1/api.test.mjs" "test/codex-check/feat/R1/storage.test.mjs"` | 0 | 26 pass, 0 fail, 0 skip; `r1-api-recheck.tap` |

Ghi nhận lỗi điều hành kiểm tra: lần R1 đầu chạy đồng thời với build khi bản sao chưa có dist; 4 ca báo thiếu dist. Một ca mở server trước assertion nên tiến trình không tự kết thúc; đã dừng đúng tiến trình review đó. `r1-run1.tap` là lượt không hợp lệ, bị dừng, không phải PASS và không dùng để tính gate. Sau khi build hoàn tất, chạy lại trọn R1 hai lần liên tiếp đều xanh như bảng trên.

Đã so SHA-256 các file trong `src/api`, `scripts`, bộ test R1 và Claude giữa snapshot và workspace sau khi chạy: không có drift. Digest của manifest hash (JSON sorted keys): `8f68bcd6d20f3ec7d2cb81445068b4609f3d36da4c656e5151ae22d9b747e35a`; manifest ở `snapshot-hashes.json` trong thư mục tạm. Đây là mốc của source/test đã kiểm, không phải cam kết cho thay đổi xuất hiện sau review.

## Giới hạn và bàn giao

- Vercel/Neon/Google thật: NOT_RUN theo lệnh cấm của task. Các ca Neon dùng fetch giả; không chứng nhận SQL thực thi trên PostgreSQL thật, đặc tính đồng thời của dịch vụ thật hoặc cấu hình production. Ca browser/API dùng HTTP cục bộ; không diễn giải thành kiểm thử live.
- Không chạy lại toàn bộ unit/oracle ngoài phạm vi R1; đã chạy đầy đủ bộ R1, Claude và API regression nêu trên. Không sửa code hoặc bộ kiểm định; không commit/deploy.
- Cần giữ nguyên các fix chưa commit khi tích hợp. Nếu source/test thay đổi sau snapshot, chạy lại gate liên quan trước khi dùng verdict này.

recommended_action: R1 đạt gate kiểm định cục bộ và có thể được điều phối tích hợp; nghiệm thu live/production tiếp tục theo R11 và quyền Trưởng phòng.
