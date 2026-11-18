# CK-AUDIT-38 — Kiểm định sau vòng 38

Verdict: **CHANGES_REQUESTED**

- review_id / task_id: CK-AUDIT-38; reviewer: Codex; risk_level: HIGH.
- verified_at: 2026-11-17; Windows/PowerShell; Node v24.14.0; TypeScript 7.0.2; Chrome headless thật qua CDP; HTTP localhost dưới `/Cunata/`.
- base_commit: `0d8cf281639c8cf651947acc9104f3ca1ceab96b`, commit đầu tiên mang message “Bộ kiểm định web của Claude (test/claude-check) + vòng sửa tự động”. Có bảy commit cùng message; đối chiếu thêm khoảng gần nhất `f735eed..HEAD` và bản sửa `4abdc3d`.
- head_commit: `f61f225264a255b86528ff3b3aece86b7d53517c`.
- requirements_version: Shared Product Contract v2.0; toàn bộ WEB-contract.md, gồm §14–19; mẫu bàn giao M1 §2; DESIGN.md.
- Working tree ban đầu: hai log ops đã sửa, manifest CK-AUDIT-38 và thư mục prompts untracked. Giữ nguyên. Chỉ thêm báo cáo này; không sửa code/test, cài dependency, tạo branch/worktree, commit hay deploy. Build tái sinh dist; sau chạy không có diff source/dist/test.

## Rà gian lận và sửa giả

Không tìm thấy nhánh gian lận còn hiện hành trong phạm vi đã rà: nhận diện webdriver/headless/user-agent, điểm cố định theo ID/tên đề kiểm định, hoặc tắt tính năng theo môi trường test. Kết luận này giới hạn ở source/diff, tìm kiếm lịch sử và các hành vi đã kiểm; không suy đoán động cơ tác giả.

- Đọc git log, danh sách file thay đổi từ baseline, các diff source/test/build liên quan; tìm lịch sử bằng `git log -G` cho webdriver, HeadlessChrome, userAgent, process.env, tên bộ kiểm định và marker lời giải. Comment headless của PDF preview là kiểm khả năng viewer, không phải đường trả kết quả cho bộ test. Mã frontend không có chuỗi `codex-`/`claude-` dùng để ưu tiên fixture.
- `git diff 0d8cf28 HEAD -- src/domain package.json package-lock.json tsconfig.json tsconfig.web.json` rỗng. Không đổi domain hoặc dependency trong khoảng này. Adapter vẫn gọi `computeExamMax`/`scoreAttempt` qua barrel; hiển thị D02 dùng phân số và làm tròn riêng. Browser golden kiểm tổng tối đa 5/15/16, thang II và so khớp chuỗi III đã PASS.
- **Sửa giả có thật trong lịch sử, đã gỡ:** `scripts/web-build.ts@237aeb8:252–263` thêm title và câu hỏi giả `q-index-meta` vào manifest dist/public/exams/index.json để qua kiểm tra nhầm manifest là đề. Đã xem trực tiếp patch thêm và patch gỡ `d3d81b9`. HEAD không còn đoạn này. Kiểm tra schema manifest và public/dist-public cùng nội dung đều PASS; không báo lại lỗi đã sửa thành finding hiện hành.
- Không có file test bị xóa trong khoảng baseline→HEAD. Không thấy skip/todo/only trong hai bộ `.mjs` bắt buộc; lần chạy thật đều skipped/cancelled/todo=0. Đã rà các assertion bị xóa trong diff test: thay kỳ vọng release theo D08, định dạng điểm theo D02 và route chọn vai theo §19 có căn cứ. Các assertion outbox chuyển sang helper `unwrap` vẫn ném lỗi khi Result không thành công và giữ kiểm retry/state/generation.
- Việc chỉ chạy tính năng mới trên dist phù hợp §18. `ef1f4cf` nhập tên ở cổng tên thay vì cố sửa ô readonly trong bài; helper vẫn kiểm tên đúng và ném lỗi nếu sai. Assertions XSS, CSV, tên sau reload và trạng thái cục bộ còn nguyên. HTTP override config chỉ trỏ backend giả lập, không đổi config repo hoặc gọi Sheet thật.
- Chưa thấy việc tắt autosave, collector, importer hoặc thay quy tắc chấm để né lỗi trong các đường đã đọc và chạy. Năm gate xanh vẫn bỏ lọt lỗi phiên dưới đây.

## Finding hiện hành đã xác minh

### CK38-F01 — MINOR — Token công bố tám giờ nhưng bị vô hiệu sau sáu giờ

- affected_files: `apps-script/Code.js:1102`, `apps-script/Code.js:1104`, `apps-script/Code.js:1109–1110`.
- evidence: `newSession` trả expiresAt bằng now+8 giờ, nhưng chỉ ghi session vào CacheService với TTL 21600 giây. `sessionPrincipal` trả null ngay khi cache miss; không có nguồn giữ session đến expiresAt. Code.js không đổi so với đợt audit 37; CK37-F02 vẫn chưa sửa.
- reproduction_steps: Chạy `node --input-type=module -` qua stdin, import `makeGas` từ `test/claude-check/gas-fake.mjs`; adminLogin với mật khẩu tổng hợp mặc định; giữ token trong RAM. Dịch `Date.now` riêng tiến trình probe đến các mốc 0; 5,999; 6 giờ+1 giây; 7 giờ 59 phút; 8 giờ rồi gọi adminStats. Khôi phục Date.now trong finally. Không ghi file hoặc gọi Google thật.
- actual: Probe exit=0; advertisedHours≈8; adminStats success=true tại 0 và 5,999 giờ; success=false, error=UNAUTHORIZED tại 6 giờ+1 giây và 7 giờ 59 phút. Fake cache thực thi chính TTL do Code.js truyền vào; đây là kiểm thời gian/cache mô phỏng.
- expected: Phiên chưa bị thu hồi còn hợp lệ trước expiresAt, theo thời hạn tám giờ của WEB-contract §19.2.
- impact: Giáo viên/admin bị buộc đăng nhập lại sớm hơn hạn công bố. Không suy diễn mất bản soạn từ probe này.
- minimal_fix: Giữ bản ghi phiên phía máy chủ đủ tám giờ với kiểm expiry/credential/khóa tài khoản; cache chỉ dùng tăng tốc và khôi phục từ nguồn phiên khi cache miss. Không sửa bằng cách đổi fake TTL, bỏ kiểm hết hạn, hoặc hạ thời hạn đã chốt xuống sáu giờ. Chưa cần quyết định nghiệp vụ mới để xác định lỗi này.
- regression_test: Đăng nhập, kiểm 6 giờ+1 giây và 7 giờ 59 phút còn hợp lệ; đúng expiresAt bị từ chối. Xóa cache trước expiresAt vẫn khôi phục được phiên hợp lệ. Reset mật khẩu/khóa giáo viên/đổi mật khẩu admin vẫn thu hồi quyền. Test backend mô phỏng không thay nghiệm thu Google live.

## Bản sửa CK37-F01 và khoảng trống regression

Probe trình duyệt thật xác nhận ca từng lỗi đã được sửa: tạo giáo viên và hai đề tổng hợp có ID ngẫu nhiên, xuất bản A/B; giao A cho lớp với hạn gần; học sinh qua cổng tên, vào lớp bằng mã, làm và nộp A; chờ qua dueAt; về trang học sinh, mở B trong practiceExams, nhập `1,5`, đợi lưu rồi đọc IndexedDB bằng transaction readonly, **trước reload**.

- Probe `node --input-type=module -` exit=0. A=`A-3b00e618-d667-4d79-a74e-01bd02df67da`; B=`B-3b00e618-d667-4d79-a74e-01bd02df67da`.
- Nút làm lại A sau hạn disabled=true. B có phase=draft, raw=`1,5`, dueAt=null, assignmentId=null; sync=`Đã lưu`. Backend là Code.js thật chạy trên Google giả lập, không phải Sheet thật.
- `src/app/main.ts:2085–2097` xóa finalRecord khác ngữ cảnh trước khi giải lịch; resolver `:867–884` ràng buộc đề/phiên bản/assignment. Đây là sửa hành vi, không chỉ đổi assertion.
- **Coverage gap:** regression mang tên CK37-F01 tại `test/final-quality/ck12Regressions.test.ts:1458` chỉ đặt final A vào adapter rồi bootstrap thẳng B (`:1540`), không thực hiện A→nộp→B trong cùng bootstrap nên không tạo finalRecord A trong closure như lỗi gốc. Nên bổ sung regression chuyển màn thật theo probe trên để bảo vệ chính nhánh vừa sửa. Không dùng thiếu sót test này để kết luận lỗi sản phẩm còn tái hiện; probe hiện tại đã PASS. Các ca B tĩnh, cùng đề khác assignment/phiên bản và nhiều lớp chưa được probe độc lập trong phiên này.

## Checks chạy thật

| Lệnh / kiểm tra | Exit | Kết quả |
| --- | ---: | --- |
| `node scripts/build.js` | 0 | PASS; emit/promote 318 files; cảnh báo DEP0190 từ child_process shell. |
| `npx --no-install tsc -p tsconfig.json` | 0 | PASS; không diagnostic. |
| `npx --no-install tsc -p tsconfig.web.json` | 0 | PASS; không diagnostic. |
| `node --test "test/claude-check/**/*.test.mjs"` | 0 | PASS: tests=77, suites=5, pass=77, fail=0, skipped=0, cancelled=0, todo=0; duration_ms=28622.6547. |
| `node --test "test/codex-check/**/*.test.mjs"` | 0 | PASS: tests=116, suites=2, pass=116, fail=0, skipped=0, cancelled=0, todo=0; duration_ms=39430.0015. |
| Probe Code.js/makeGas dịch clock | 0 | Xác minh CK38-F01 tại 6 giờ+1 giây và 7 giờ 59 phút. |
| Probe Chrome: nộp A → qua hạn → B → input → đọc IDB | 0 | CK37-F01 không tái hiện; B có draft durable, đáp án và trạng thái lưu đúng trước reload. |
| `git diff --check` | 0 | Không lỗi whitespace; có cảnh báo chuyển LF/CRLF ở fixtures được suite tái sinh. |

Hai suite chạy tuần tự, mỗi bộ một lần; không có lượt FAIL bị bỏ khỏi thống kê. Log artifact là output terminal phiên này; số liệu và bằng chứng quan trọng được chép vào báo cáo. Không tạo thêm log/test ngoài scope. Fixture do suite tái sinh không để lại diff sản phẩm.

## Phạm vi, giới hạn và hành động

- files_reviewed: lịch sử/diff source, Apps Script, build và tests trong khoảng nêu trên; đọc sâu main/controller/student area, adapter scoring, collector/export, session và helper/assertion kiểm thử; đối chiếu root/dist qua hai suite. Không chứng nhận đã đọc từng dòng của mọi artifact lịch sử.
- Full suite `.test.ts`, oracle Python: NOT_RUN trong phiên này, ngoài năm lệnh được giao. Không lấy log vòng 38 có sẵn làm bằng chứng tự chạy. Ca DOCX từng timeout ở audit 37 PASS trong lần Codex hiện tại; không suy luận đã tìm hoặc sửa nguyên nhân dao động.
- Google Apps Script/CORS/Sheet live: NOT_RUN theo §17.5; repo public/config.json giữ URL rỗng. Chỉ chạy backend giả lập, không ghi bảng thật. Kiểm 768px, mọi trạng thái sáng/tối, OS Telex/VNI, browser khác, security audit toàn diện và owner acceptance: NOT_RUN; đây không phải nghiệm thu toàn bộ sản phẩm.
- Snapshot SHA256: main.ts=`960A6F8A2655C04CF1EFC70E26E1B53A05C9D86DB4F27F1A52A37C834803E5C5`; student/index.ts=`526685692EA77B396764E5644F647FBFF80D9957E0AE51FF3F9C84D1B1BAC11F`; student/area.ts=`43005D4A24F097E4E4971AC8BE21E23D3D801A43F044248A13473F21D6EFF0DC`; Code.js=`C9137583F9CAB1E5D53FB7B07957665C6BA0160D014F74C2A9D09946ABADBB60`.
- recommended_action: giao worker sửa CK38-F01 và bổ sung regression phiên theo thời gian; bổ sung regression chuyển A→B thật. Sau đó chạy lại gate và review snapshot mới. Không có blocker/critical mới được xác minh trong phạm vi này; CHANGES_REQUESTED vì hợp đồng phiên vẫn sai. Không duyệt deploy.
- tools_research: không được giao trong task này.
- privacy_notes: chỉ kết quả kỹ thuật và dữ liệu tổng hợp; không đưa hồ sơ riêng hoặc credential/token phiên vào báo cáo.
