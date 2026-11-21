Verdict: CHANGES_REQUESTED

# R1-REVIEW-1 — Máy chủ Vercel lõi

- reviewer: Codex; ngày kiểm: 22/11/2026; risk_level: HIGH.
- base_commit: `cd8a9f5` (commit đầu: “Lộ trình R1: test kiểm định của Codex (13 file)”). Đã xem commit này và lịch sử/diff từ đây tới HEAD.
- head_commit: `7215f47506afe5f51587cb517af2a4657bad7e69`.
- requirements_version: Shared Product Contract v2.0; WEB-contract §17.2–17.6, §19.2/19.2a, §22; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md.
- files_reviewed: `src/api/**`, phần API/catalog/RPC trong `scripts/web-build.ts`, `scripts/build.js`, artifact `dist/api/**`, các test R1 và `test/claude-check/api-vercel.test.mjs`, các thay đổi liên quan của bộ kiểm định, hai tsconfig và package manifest. Apps Script được đối chiếu để kiểm tương thích, không gọi dịch vụ thật.
- Thay đổi chủ động duy nhất: báo cáo này. Không sửa code/test, không cài dependency, không commit/deploy, không đọc `ops/prod_config.json`.

## Phạm vi và giả định

1. R1 là lõi máy chủ và phần build API. Không kết luận R2–R11 hoàn thành; thiếu API PIN của §23 thuộc R3, không dùng làm finding R1.
2. Working tree đã có nhiều thay đổi trước lúc kiểm, kể cả báo cáo này đã có sửa đổi. Các finding có sẵn đã được tái hiện lại; không lấy kết quả chạy cũ làm bằng chứng mới. `src/api/**`, `scripts/web-build.ts` và hai bộ test được giao không có diff chưa commit tại lúc kiểm. Không gán thay đổi sẵn có của module khác cho R1.
3. Kiểm đồng thời là cần thiết: §22 quy định Vercel chạy nhiều tiến trình. Tạm dừng tại ranh giới async Store để tạo một lịch xen kẽ hợp lệ, không thay thuật toán xử lý yêu cầu. Các probe chỉ thay method của MemoryStore trong tiến trình kiểm, không ghi file sản phẩm.
4. Để giữ scope chỉ sửa báo cáo trong repo, build và suite chạy tại bản sao kiểm thử `%USERPROFILE%\AppData\Local\Temp\cunata-r1-review-6zfczsp_` (không phải Git worktree/branch). Sao chép source, test, tài nguyên và dependency đã có; không cài gì, không sao chép/đọc cấu hình production. Đối chiếu SHA-256 của 1.193 đầu vào với D:\Cunata sau kiểm: không có đầu vào đổi. Build sinh 339 file trong dist của bản sao, không ghi dist gốc. Ba probe concurrency chạy bằng stdin tại D:\Cunata và chỉ dùng MemoryStore.
5. Không có BLOCKED_QUESTION hoặc quyết định nghiệp vụ mới cần tự chọn cho ba finding dưới đây. Chúng vi phạm hành vi đã chốt: bảo vệ đề của giáo viên khác, mật khẩu mới sau reset và `USERNAME_TAKEN` khi trùng tài khoản.

## Kết quả kiểm định chạy thật

Môi trường: Windows/PowerShell, Node `v24.14.0`, TypeScript `7.0.2`. CWD build/tsc/suite là bản sao kiểm thử nêu trên; CWD probe là `D:\Cunata`. Các kết quả dưới đây được chạy lại trong phiên này.

| Lệnh | Exit | Kết quả |
|---|---:|---|
| `node scripts/build.js` | 0 | PASS; xuất và kiểm 339 file trong dist |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS; không diagnostic |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS; không diagnostic |
| `node --test "test/codex-check/feat/R1/**/*.test.mjs"` (lần 1) | 0 | 31 pass, 0 fail, 0 skip/cancel/todo; 10,897 giây |
| `node --test "test/codex-check/feat/R1/**/*.test.mjs"` (lần 2) | 0 | 31 pass, 0 fail, 0 skip/cancel/todo; 9,437 giây |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | 104 pass, 0 fail, 5 suites, 0 skip/cancel/todo; 96,149 giây |
| Probe stdin ở cuối báo cáo: `@'…'@ \| node --input-type=module` | 0 | Ba lịch xen kẽ đều tái hiện lỗi; mọi assertion xác nhận lỗi đều đạt |

Build có cảnh báo Node DEP0190 về `shell: true`; không phải lỗi build. Output đầy đủ đã được đọc trong phiên kiểm. Log mới nằm trong thư mục tạm nêu trên: `review-r1.tap`, `review-r1-second.tap`, `review-claude.tap`; manifest đối chiếu đầu vào là `snapshot-hashes.json`. Không ghi log mới vào repo và không dùng `run-1.tap`/`run-2.tap` cũ làm bằng chứng mới.

Các suite có Chrome/Edge headless thật, HTTP cục bộ và dịch vụ giả lập. Neon/Vercel/Google thật: **NOT_RUN**, bị task cấm; test SQL-over-HTTP giả lập không chứng nhận tích hợp cơ sở dữ liệu thật. Không chạy lại full unit/oracle ngoài phạm vi lệnh của task.

## Findings

### R1-F01 — BLOCKER — Unpublish chậm có thể xóa đề mới của giáo viên khác

- affected_files: `src/api/handle.ts:519–527`; `src/api/store/neon.ts:240–241`; `src/api/store/memory.ts:121–122`; chữ ký `src/api/types.ts:127`.
- Căn cứ: WEB-contract §19.2 và §22: thao tác lên đề của giáo viên khác phải bị từ chối; lưu trữ dùng chung nhiều tiến trình.
- Bằng chứng: handle đọc owner rồi mới gọi `deleteExam(examId)`; Store xóa chỉ theo ID, không kiểm owner tại thời điểm ghi. SQL thật là `DELETE FROM exams WHERE id = $1`.
- Reproduction_steps: A xuất bản E; yêu cầu unpublish A1 đọc E và dừng ngay trước delete; unpublish A2 xóa E; B xuất bản đề mới cùng ID E thành công; tiếp tục A1. Probe xác nhận owner trước khi tiếp tục là B, sau đó E biến mất và A1 trả `success:true`.
- Expected: thao tác cuối không thể xóa bản ghi đang thuộc B; trả lỗi phù hợp khi owner đã thay đổi.
- Actual: yêu cầu được xác thực của A xóa bản ghi mới của B.
- Impact: mất dữ liệu và chỉnh sửa trái quyền giữa giáo viên. Không cần chiếm token của B; ID đề là dữ liệu công khai. Cần có lịch xen kẽ nêu trên.
- Minimal_fix: đưa username vào thao tác xóa Store và kiểm trong cùng phép ghi, ví dụ `DELETE ... WHERE id=$1 AND owner=$2 RETURNING id`; trả outcome để handle phân biệt bị từ chối/không còn bản ghi. MemoryStore phải có cùng semantics. Không dùng khóa RAM để thay giao dịch/điều kiện SQL.
- Regression_test: giữ đúng lịch A1/A2/B ở probe, kỳ vọng đề B còn nguyên sau A1; kiểm câu SQL có predicate owner và hai params. Test phân quyền tuần tự hiện tại không bao phủ trường hợp này.

### R1-F02 — CRITICAL — Cập nhật trạng thái từ bản đọc cũ khôi phục mật khẩu đã reset

- affected_files: `src/api/handle.ts:233–250`, `src/api/handle.ts:259–273`; `src/api/store/neon.ts:147–150`; `src/api/store/memory.ts:17-18`.
- Căn cứ: WEB-contract §22: reset mật khẩu vô hiệu phiên cũ; thao tác khóa/mở không được âm thầm hoàn tác mật khẩu mới.
- Bằng chứng: reset và đổi active đều đọc toàn bộ teacher, tăng `authGen` ở handle rồi spread bản đọc cũ vào `saveTeacher`. UPSERT ghi lại tất cả salt/hash/active/auth_gen; không có CAS/giao dịch và không tăng generation dựa trên bản ghi hiện tại trong SQL.
- Reproduction_steps: yêu cầu bật active đọc teacher cũ rồi dừng; reset sang mật khẩu mới hoàn tất; đăng nhập bằng mật khẩu mới thành công; tiếp tục yêu cầu active. Probe xác nhận mật khẩu cũ đăng nhập được trở lại, mật khẩu mới bị từ chối.
- Expected: cập nhật active giữ nguyên mật khẩu hiện hành sau reset. Generation phải tăng nguyên tử; reset không bị hoàn tác bởi bản đọc trước đó.
- Actual: cả hai hành động báo thành công nhưng hash/salt mới bị ghi đè bằng hash/salt cũ. Cùng cách ghi toàn bộ bản ghi cũng có thể làm mất cập nhật active khi đảo lịch.
- Impact: khôi phục credential mà Admin vừa thu hồi, có thể mở lại quyền đăng nhập bằng mật khẩu đã lộ. Việc xóa sessions sau mỗi lần ghi không ngăn đăng nhập mới bằng mật khẩu cũ.
- Minimal_fix: tách cập nhật mật khẩu và active ở Store; mỗi phép chỉ ghi các cột của chính hành động đó và tăng `auth_gen = auth_gen + 1` trong cùng câu SQL, hoặc dùng giao dịch/CAS có retry. Không ghi hash/salt từ snapshot cũ trong cập nhật active. Đồng bộ semantics MemoryStore và bảo đảm cơ chế thu hồi phiên không bị lost update.
- Regression_test: lịch pause-active → reset → login-new → resume-active; kỳ vọng old-password luôn UNAUTHORIZED và new-password vẫn dùng được. Thêm lịch reset/lock đảo chiều, kiểm active và generation hiện hành.

### R1-F03 — MAJOR — Hai yêu cầu tạo trùng username đều thành công và ghi đè tài khoản

- affected_files: `src/api/handle.ts:168–190`; `src/api/store/neon.ts:147–150`; `src/api/store/memory.ts:17-18`.
- Căn cứ: WEB-contract §19.2/§22: username trùng → `USERNAME_TAKEN`.
- Bằng chứng: kiểm tồn tại và lưu là hai await riêng; `saveTeacher` dùng UPSERT cập nhật tài khoản tồn tại. Unique primary key không bảo vệ semantics tạo mới vì conflict đã bị biến thành UPDATE.
- Reproduction_steps: hai yêu cầu Admin tạo cùng username, password khác nhau; cho cả hai `getTeacher` hoàn thành với null trước khi cho tiếp tục. Probe nhận `[true,true]`; mật khẩu của yêu cầu thành công đầu bị thay bằng mật khẩu yêu cầu thứ hai.
- Expected: đúng một lần tạo thành công; lần còn lại `USERNAME_TAKEN`, không thay tên/hash/salt/active/generation của tài khoản đã tạo.
- Actual: hai response đều thành công, lần sau ghi đè tài khoản của lần trước.
- Impact: Admin giao tài khoản có credential không còn đúng dù đã nhận thành công; có thể ghi đè một tài khoản vừa bắt đầu sử dụng. Đây là lỗi khác với cập nhật trạng thái: cần insert-only cho đường tạo mới.
- Minimal_fix: Store có thao tác tạo insert-only (`ON CONFLICT DO NOTHING RETURNING username`), handle ánh xạ conflict thành `USERNAME_TAKEN`; giữ thao tác update riêng cho reset/active. MemoryStore kiểm và set nguyên tử trong cùng thao tác tạo.
- Regression_test: hai create đồng thời, kiểm chỉ một success, một USERNAME_TAKEN và account của bên thắng không đổi; kiểm SQL không có nhánh UPDATE trong đường create.

## Rà soát sửa giả và phần test chưa phủ

- `git diff cd8a9f5 HEAD -- test/codex-check/feat/R1` rỗng: không thấy sửa/xóa/nới test R1 sau commit kiểm định đầu.
- Lịch sử của `test/claude-check` trong khoảng này có các commit kiểm định mới của điều phối (api-vercel, EX-HS, EX-GV, §19.2a và cập nhật §21). Đã xem diff helper `app.mjs`: thêm nạp fixture khi không có thẻ công khai, sửa click sang scroll instant, thêm id vào enterFromStart. Không quy các thay đổi được ghi nhận theo quyết định §21 này thành gian lận R1.
- Không thấy nhánh dò `webdriver`, user-agent, tên/id test hoặc credential fixture trong source API. Biến môi trường được đọc là cấu hình DATABASE_URL/ADMIN_PASSWORD theo hợp đồng. Không thấy thêm npm dependency trong diff package/lock.
- Build có cầu nối `_node.js` và đổi import built-in sang cầu nối để thỏa kiểm graph; đây là phần cần lưu ý khi kiểm runtime, không có bằng chứng đủ để quy kết ý định gian lận. Phiên này kiểm trên Node 24, không chứng nhận mọi bản Node 20.
- Các test hiện kiểm phân quyền tuần tự, password/session cơ bản, hạn nộp, idempotency kết quả, catalog và giao thức request Neon. Chưa kiểm cạnh tranh cập nhật teacher hoặc đổi owner giữa lookup và delete; ba probe bắt được lỗi dù cả hai suite xanh.
- Dữ liệu Neon trong test chủ yếu là response rỗng và kiểm request SQL, chưa là vòng đọc/ghi PostgreSQL có kiểu dữ liệu thật, persistence qua nhiều tiến trình hoặc giao dịch thật. Không suy diễn PASS live từ test đó.
- Không đưa việc nhận điểm client vào finding mới yêu cầu đổi cơ chế chấm: đây là luồng luyện tập hiện hành, quyết định không giấu đáp án và tương thích API đã chốt. Không tự mở rộng R1 sang trusted grading.

## Probe độc lập đã chạy

Chạy phần JavaScript sau bằng PowerShell here-string UTF-8 đưa vào `node --input-type=module` tại repo. Không tạo file test, không gọi mạng. Assertions bên dưới xác nhận **lỗi hiện tại** để làm bằng chứng; khi worker viết regression chính thức phải đảo sang kỳ vọng đúng đã mô tả ở từng finding.

```js
import assert from 'node:assert/strict';
import { handle } from './src/api/handle.ts';
import { MemoryStore } from './src/api/store/memory.ts';
import { readFileSync } from 'node:fs';
const now = Date.parse('2026-11-22T00:00:00Z');
const store = new MemoryStore();
const ctx = { store, now: () => now, adminPassword: 'ReviewAdmin123' };
const post = async body => (await handle({ method: 'POST', body }, ctx)).body;
const admin = (await post({ action: 'adminLogin', password: ctx.adminPassword })).token;
for (const username of ['review_a', 'review_b']) {
  assert.equal((await post({ action: 'adminCreateTeacher', token: admin,
    username, name: username, password: 'Original123' })).success, true);
}
const login = (username, password = 'Original123') =>
  post({ action: 'teacherLogin', username, password });
const a = (await login('review_a')).token;
const b = (await login('review_b')).token;
const gate = () => {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
};
const get = store.getTeacher.bind(store);
const both = gate(); let reads = 0;
store.getTeacher = async user => {
  const row = await get(user);
  if (user === 'review_new') {
    if (++reads === 2) both.resolve();
    await both.promise;
  }
  return row;
};
const creates = await Promise.all(['FirstPass123', 'SecondPass123'].map(password =>
  post({ action: 'adminCreateTeacher', token: admin, username: 'review_new',
    name: password, password })));
store.getTeacher = get;
assert.deepEqual(creates.map(r => r.success), [true, true]);
assert.equal((await login('review_new', 'FirstPass123')).success, false);
assert.equal((await login('review_new', 'SecondPass123')).success, true);
console.log('CONFIRMED create race: both success; first successful account password overwritten');

const captured = gate(), resume = gate(); let once = true;
store.getTeacher = async user => {
  const row = await get(user);
  if (user === 'review_a' && once) {
    once = false; captured.resolve(); await resume.promise;
  }
  return row;
};
const toggle = post({ action: 'adminSetTeacherActive', token: admin,
  username: 'review_a', active: true });
await captured.promise;
assert.equal((await post({ action: 'adminResetPassword', token: admin,
  username: 'review_a', password: 'NewPassword123' })).success, true);
assert.equal((await login('review_a', 'NewPassword123')).success, true);
resume.resolve(); assert.equal((await toggle).success, true);
store.getTeacher = get;
assert.equal((await login('review_a', 'Original123')).success, true);
assert.equal((await login('review_a', 'NewPassword123')).success, false);
console.log('CONFIRMED reset race: completed reset undone by stale active toggle; old password works again');

const ex = JSON.parse(readFileSync('public/exams/toan-full.json', 'utf8'));
ex.examId = 'review-race-exam';
assert.equal((await post({ action: 'publishExam', token: a, exam: ex })).error, 'UNAUTHORIZED');
const freshA = (await login('review_a')).token;
assert.equal((await post({ action: 'publishExam', token: freshA, exam: ex })).success, true);
const deleting = gate(), release = gate();
const del = store.deleteExam.bind(store); let first = true;
store.deleteExam = async id => {
  if (first) { first = false; deleting.resolve(); await release.promise; }
  return del(id);
};
const staleDelete = post({ action: 'unpublishExam', token: freshA, examId: ex.examId });
await deleting.promise;
assert.equal((await post({ action: 'unpublishExam', token: freshA, examId: ex.examId })).success, true);
assert.equal((await post({ action: 'publishExam', token: b, exam: ex })).success, true);
assert.equal((await store.getExam(ex.examId)).owner, 'review_b');
release.resolve(); assert.equal((await staleDelete).success, true);
assert.equal(await store.getExam(ex.examId), null);
console.log('CONFIRMED ownership race: teacher A delayed unpublish deleted teacher B exam');
```

Probe exit 0, output đúng ba dòng CONFIRMED trong code. Chứng minh thực thi dùng MemoryStore; tác động tương ứng trên Neon được đối chiếu tĩnh với UPSERT toàn bản ghi và DELETE không owner, chưa chạy Neon thật.

## Snapshot và hành động đề nghị

SHA-256 các file nguồn trọng yếu sau kiểm:

| File | SHA-256 |
|---|---|
| src/api/handle.ts | `418C1289D5C2F3DC2AE6DE1FE5AEF3BDC99F0B7722E4B5D29949F98CF9668C9C` |
| src/api/store/neon.ts | `A0EC34648D864C86FD529E475B243101916708A313C28D6A0AA0C919A80423C2` |
| src/api/store/memory.ts | `1335A0F0712B2B8150C458A4948016118A8433CBCD2A9FD2D10F2D9D3D224300` |
| scripts/web-build.ts | `72DDEC8D31C11BC9C6453ACD8BE21B7CC8406F27B285640D30F09C51D26589C5` |

recommended_action: giao worker vùng API sửa ba finding bằng thao tác Store nguyên tử, bổ sung regression vào vùng test được điều phối cấp quyền, chạy lại build/hai tsc/R1/Claude rồi review lại snapshot mới. R1 chưa đủ điều kiện APPROVED dù kiểm định hiện có xanh. Không có yêu cầu deploy hoặc thay đổi nghiệp vụ mới.
