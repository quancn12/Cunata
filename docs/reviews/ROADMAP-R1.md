Verdict: CHANGES_REQUESTED

# R1-REVIEW-2 — máy chủ Vercel lõi

- task_id / review_id: `R1-REVIEW-2`; reviewer: Codex; ngày kiểm: 22/11/2026; risk_level: HIGH.
- base_commit: `cd8a9f5299f4f7fa4995c267f04688dcd3508e0f` ("Lộ trình R1: test kiểm định"); đọc cả diff từ cha của commit này để tính test viết ban đầu.
- head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`, cộng thay đổi working tree đã có lúc nhận task.
- files_reviewed: toàn bộ `src/api/**`; phần build API trong `scripts/web-build.ts`; package/lock và hai tsconfig; toàn bộ test R1; diff `test/claude-check`; `test/api/r1-findings.test.ts`, `test/api/round68.test.ts`; callers và Apps Script liên quan để đối chứng dữ liệu vào/ra.
- requirements_version: Shared Product Contract v2.0; toàn bộ `docs/contracts/WEB-contract.md`, trọng tâm §17.2–17.6, §19.2–19.2a, §22; `docs/design/DESIGN.md`, `docs/decisions/BANG-QUYET-DINH.md`, `docs/LO-TRINH-V2.md`.

## Kết luận

Build, hai typecheck, 31 test R1, 104 test Claude và 24 test hồi quy API đều xanh. Các sửa đổi sẵn có xử lý đúng ba vấn đề của vòng review trước: xóa đề có điều kiện chủ sở hữu ngay trong SQL; reset mật khẩu/đổi active cập nhật từng trường và tăng auth generation nguyên tử; tạo giáo viên chỉ INSERT, không ghi đè username trùng.

Tuy nhiên còn một lỗi MAJOR được tái hiện độc lập: `NeonStore.saveExam` chuyển kết quả UPSERT không ghi được dòng nào thành thành công nếu lần SELECT sau không còn thấy chủ sở hữu khác. `publishExam` sau đó xác nhận xuất bản dù không có đề được lưu. Chưa duyệt R1; sửa R1-REVIEW2-F01 rồi kiểm định lại. Không sửa code trong task này.

## Giả định và ranh giới

- R1 gồm lõi API/Store, auth, metadata catalog và artifact build. Không yêu cầu hoàn thành roster/PIN của R3 hoặc nghiệm thu production R11 để duyệt riêng R1. R2 chỉ đối chiếu các gate tích hợp đã có trong test R1.
- "Giống Apps Script" bao gồm dữ liệu vào/ra, mã lỗi, idempotency và xác nhận ghi trung thực. Quyết định nghiệp vụ lấy từ các tài liệu được giao; mã cũ chỉ là bằng chứng đối chiếu.
- Chế độ luyện tập đã duyệt D08 không đòi giấu key hoặc trusted grading mới. Không tự thêm yêu cầu nghiệp vụ đó vào R1.
- `BLOCKED_QUESTION: NONE`; `NEED_DECISION: NONE`. Finding là lỗi xác nhận ghi, không cần quyết định nghiệp vụ mới.
- Working tree có nhiều thay đổi sẵn, kể cả API và test hồi quy. Không hoàn nguyên hoặc nhận chúng là thay đổi của reviewer.

## Kiểm định chạy thật

Để tuân thủ chỉ sửa file báo cáo, build và test chạy trên bản sao tạm của **nội dung working tree**, không tạo branch/worktree. Sao chép compiler đã có; không cài dependency. Thư mục kiểm định: `%USERPROFILE%\AppData\Local\Temp\cunata-r1-review2-3z1pko3v\work`. Build/test chỉ tạo artifact trong bản sao hoặc thư mục tạm của harness. Không đọc hoặc sao chép `ops/prod_config.json`; publisher probe sử dụng fixture riêng, chặn git/subprocess, không deploy.

Môi trường: Windows/PowerShell; Node `v24.14.0`; TypeScript có sẵn `7.0.2`; browser thật qua harness CDP; HTTP/emulator cục bộ. Không gọi Google/Vercel/Neon thật.

| Command (cwd là bản sao, trừ probe) | Exit | Pass / fail / skip | Evidence |
|---|---:|---|---|
| `node scripts/build.js` | 0 | không áp dụng | `build.log`; emit/verify 339 files; cảnh báo DEP0190, không làm build fail |
| `node node_modules/typescript/bin/tsc -p tsconfig.json` | 0 | không áp dụng | `tsconfig.json.log`, rỗng |
| `node node_modules/typescript/bin/tsc -p tsconfig.web.json` | 0 | không áp dụng | `tsconfig.web.json.log`, rỗng |
| `node --test --test-concurrency=1 "test/codex-check/feat/R1/**/*.test.mjs"` | 0 | 31 / 0 / 0 | `r1.log`; 23.643 giây |
| `node --test --test-concurrency=1 "test/claude-check/*.test.mjs"` | 0 | 104 / 0 / 0 | `claude.log`; 5 suites; 139.862 giây; glob bao gồm toàn bộ file test hiện có của bộ Claude |
| `node --test "test/api/*.test.ts"` | 0 | 24 / 0 / 0 | `api-regression.log`; 1.937 giây |
| `node --test %USERPROFILE%\AppData\Local\Temp\cunata-r1-review2-3z1pko3v\publish-race.mjs` | 1 | 0 / 1 / 0 | `publish-race.log`; 0.167 giây; assertion hành vi mong đợi đỏ, chi tiết F01 |
| Google / Vercel / Neon live | NOT_RUN | không áp dụng | Task cấm gọi dịch vụ thật; không coi fetch giả là nghiệm thu DB thật |

Các log trong bảng nằm ở thư mục cha của `work`. Probe bổ sung nằm ngoài repo. Hai lượt typecheck đầu trên bản sao chưa đủ cây `test/` bị lỗi do thiếu ambient declarations; đã loại bỏ kết quả đó, sao chép đầy đủ cây test và chạy lại cả hai lệnh, exit 0 như bảng. Đây không phải lỗi typecheck của sản phẩm.

## Finding

### R1-REVIEW2-F01 — MAJOR — publish trả thành công dù UPSERT bị từ chối và không có đề được lưu

- **affected_files:lines:** `src/api/store/neon.ts:246–251`; caller `src/api/handle.ts:482–496`.
- **Căn cứ:** WEB-contract §17.2/§22: `publishExam` thành công thì lưu đề và trả revision thật; sửa đề của giáo viên khác phải bị `FORBIDDEN`. Shared Product Contract §10 không cho xác nhận chức năng hoàn tất giả.
- **Nguyên nhân:** SQL tại `neon.ts:243` có điều kiện `WHERE exams.owner = EXCLUDED.owner RETURNING revision, owner`, đúng cho kiểm quyền nguyên tử. Nhưng khi `rows.length === 0`, code SELECT lại. Nếu bản ghi đã bị xóa, hoặc đã thay chủ giữa hai statement, nhánh `:251` suy ra `{ok:true}` dù UPSERT không ghi dữ liệu. SELECT sau không chứng minh lần ghi trước thành công.
- **reproduction_steps:** probe chạy `handle` và hai `NeonStore` thật, dùng fetch SQL giả có trạng thái và barrier; không thay validator/auth hoặc nhánh lưu production. (1) Alice bắt đầu publish ID chưa tồn tại, SELECT ban đầu trả rỗng; dừng trước UPSERT. (2) Store B xuất bản ID đó cho Bob. (3) Cho UPSERT Alice tiếp tục: owner khác nên ghi 0 dòng, `RETURNING` rỗng; giữ response SQL lại. (4) Bob gỡ đề bằng `deleteExam(id, 'bob')`, thành công. (5) Trả response rỗng của UPSERT cho Alice; SELECT fallback thấy không còn đề.
- **evidence:** output thực từ `publish-race.log`:

  ```json
  {"response":{"status":200,"body":{"success":true,"examId":"racing-id","revision":1}},"storedExam":null,"writes":2}
  ```

  `writes:2` là hai yêu cầu INSERT/UPSERT, không phải hai lần ghi thành công. Assertion `response.body.success === false` thất bại (`true !== false`). Cả thao tác Bob publish và Bob delete có assertion thành công trước khi mở barrier tiếp theo.
- **expected:** UPSERT trả 0 dòng phải trả thất bại, không tự tạo revision/thành công từ lần đọc khác. Không có row Alice được lưu thì không được xác nhận xuất bản Alice.
- **actual / impact:** giáo viên nhận xác nhận xuất bản và revision 1, nhưng `getExam` không có đề. Đây là race giữa các request/worker, không đòi dữ liệu DB hỏng. SQL của Alice có thể hoàn tất transaction trong khi response HTTP chưa về; request xóa của Bob chạy trong khoảng đó. MemoryStore không có nhánh fallback này nên các test xanh hiện tại không phát hiện.
- **minimal_fix:** với conditional UPSERT hiện tại, chỉ trả `ok:true` khi `RETURNING` thực sự có dòng. Khi 0 dòng, trả `ok:false`, `error:'FORBIDDEN'` qua kết quả của Store; bỏ việc suy diễn thành công từ SELECT sau. Không tự retry ghi lên ID vừa được giải phóng. Nếu muốn phân loại thêm lỗi thì cũng phải giữ nguyên nguyên tắc chỉ xác nhận lần ghi thực sự thành công.
- **regression_test:** thêm test có trạng thái cho Neon với lịch barrier nêu trên, gọi qua `handle`; xác nhận response thất bại, không revision thành công, không có nội dung Alice trong DB. Thêm control owner khác còn tồn tại vẫn `FORBIDDEN`; cùng owner ghi thành công trả revision từ `RETURNING`. Test cần kiểm outcome 0 dòng, không chỉ match chuỗi SQL.
- **Mức xác minh:** VERIFIED tại runtime cục bộ với giao thức/SQL do chính implementation phát ra; NOT_TESTED trên Postgres/Neon thật. Không suy diễn fixture này thành chứng cứ vận hành cloud.

## Lịch sử, sửa giả và độ phủ

- Đã xem log/diff từ commit mở R1 tới HEAD và diff API chưa commit. `git diff cd8a9f5 HEAD -- test/codex-check/feat/R1` rỗng; working-tree diff của test R1 và `test/claude-check` cũng rỗng. Không thấy test R1 bị sửa sau mốc viết đầu.
- API ban đầu được thêm tại `5920e1e`; Neon ban đầu dùng Map trong tiến trình dù phát SQL. `7ad7820` đã thay phần đó bằng SELECT/INSERT thật với params; `32388ab` sửa outcome ghi kết quả, conflict, metadata, auth generation. Các sửa working tree tiếp theo thêm xóa theo owner và mutation tài khoản nguyên tử. Không tính lại các lỗi cũ đã sửa là finding hiện hành.
- Diff Claude thêm VERCEL01–03 và kiểm định UX; helper vào đề bằng file theo §21, cuộn chuột instant để tọa độ ổn định. Không thấy nới assert hoặc sửa test để che F01. Các file Claude `web.test.mjs`, `design.test.mjs`, `harness.mjs` không đổi trong khoảng review.
- Không thấy nhánh theo tên test/id fixture, webdriver hoặc NODE_ENV trong API. Bridge `_node.js` dùng builtin thật và artifact đã import/chạy qua test; không kết luận sửa giả chỉ vì bridge đáp ứng kiểm graph. Package/lock không đổi trong khoảng review. Hai tsconfig loại một ambient declaration cũ; vẫn include source/test, và đã typecheck đầy đủ.
- Đã kiểm các đường auth hết hạn 8 giờ/thu hồi phiên, owner, submit conflict/deadline/no-due, catalog động, parameter binding, lỗi HTTP Neon và browser qua HTTP cục bộ. Các test MemoryStore và mock SQL chưa bao phủ mọi lịch đồng thời; F01 là khoảng trống có chứng cứ cụ thể.
- Live DB, đóng gói/chạy trên Vercel thật, quota và CORS trên host thật: NOT_RUN theo giới hạn task. Các mục R3+ ngoài scope. Không có yêu cầu cài đặt hoặc quyết định nghiệp vụ cần bổ sung để sửa F01.

## Snapshot và bàn giao

SHA-256 của nội dung đã kiểm:

| File | SHA-256 |
|---|---|
| `src/api/handle.ts` | `e841c1964a499236e100d53a9a53dfacb36047d93270fa0ab4edb5240c142107` |
| `src/api/store/neon.ts` | `ed4a45bba621f81b2cb4b21148bf1d8d0463f19cd8015aee2794e35ed2ca4e44` |
| `src/api/store/memory.ts` | `192d6582e961ab63d001f2513a071cfb986205313a4fd48c9cbafe948a019f83` |
| `src/api/types.ts` | `f39c8e766015f4e0f00518772155e0cb9a98682872548bcbc410dd37d060f1d8` |
| `scripts/web-build.ts` | `72ddec8d31c11bc9c6453acd8be21b7cc8406f27b285640d30f09c51d26589c5` |

Manifest hash đầy đủ của API/scripts/test kiểm định nằm ở `%USERPROFILE%\AppData\Local\Temp\cunata-r1-review2-3z1pko3v\hashes.json`. Đối chiếu sau kiểm định không thấy drift trong các file của manifest. Không approve thay đổi tới sau snapshot này.

recommended_action: giao worker sửa F01 tối thiểu và thêm regression đúng outcome, chạy lại gate rồi review. Reviewer chỉ tạo lại `docs/reviews/ROADMAP-R1.md` (file này bị xóa sẵn khi nhận task); không sửa code/test/config trong repo, không commit/deploy. Không đưa hồ sơ riêng hoặc credential thật vào báo cáo.
