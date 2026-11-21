# R2-TESTS-PRE — kiểm định trước khi tích hợp

Ngày kiểm tra: 21/11/2026. `worker_id=R2-TESTS-PRE`, `base_commit=HEAD`, SHA đọc: `58fc9d5704f62f02c7ab7be0b590cb3d12e7e797`.

**RESULT: BLOCKED.** Đã hoàn thiện 21 ca node:test trong phạm vi cho phép. Ba ca publish đỏ vì hành vi chưa đúng §22. Working tree đang có lỗi TypeScript ngoài phạm vi task, chặn chín ca cần build mới. Không coi chín ca đó là bằng chứng thiếu tính năng R2, không ghi PASS cho trình duyệt chưa chạy trên bản build cuối.

## Phạm vi và cách chạy

Nguồn yêu cầu: Shared Product Contract v2.0; WEB-contract §22, §17.2–17.6, §19.2; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md. R2 kiểm phần web chuyển backend và build/publish; không chứng nhận triển khai Neon hay production R11.

Chạy từ `D:\Cunata`:

```powershell
node --test ops/roadmap/tests/R2/
```

`index.js` là entrypoint để Node 24 chạy được đúng lệnh thư mục này. Các harness dùng `pathToFileURL(process.cwd() + '/test/claude-check/…')`; helper nội bộ dùng đường dẫn tương đối theo file. Không gắn đường dẫn import với vị trí `ops/roadmap/tests`, nên có thể chuyển bộ mã test sang `test/codex-check/feat/R2/`.

Lõi máy chủ dùng `src/api/index.ts` thật cùng MemoryStore. `local-server.mjs` chỉ chuyển HTTP thành request cho cùng hàm `handle`; không thay luật nghiệp vụ. Ca browser dùng harness CDP, `mouseClick`, kiểm hit target và phần tử trong viewport, nhập bằng `Input.insertText` qua cổng tên. Ca hai origin chỉ dùng hai cổng loopback; CORS production có ca riêng gọi `rpc.js` đã emit, không đánh đồng CORS giả lập với CORS production.

Build chạy mã `scripts/build.js` thật trên bản sao source trong `_artifacts/build-input-*`, không ghi `dist/` gốc. Thư mục mỗi lần build riêng để không dùng lại output cũ. Nếu build lỗi, mọi ca phụ thuộc ném lại `BLOCKED_BUILD` cùng lỗi gốc; không dùng `dist/` có sẵn để che lỗi.

Publish chạy logic copy thật của `ops/publish.py` trong sandbox dưới thư mục test, thay SRC/DST bằng dữ liệu tổng hợp. Git, manifest và subprocess được cách ly; audit hook chặn network/subprocess và đọc cấu hình production ngoài sandbox. `ops/prod_config.json` trong sandbox là dữ liệu tự tạo; không đọc file production thật. `wrapper-probe.mjs` dùng môi trường cố định và chặn fetch bằng phản hồi SQL tổng hợp, không kết nối Neon.

## Kết quả thực đo

| Lệnh | Exit | Pass | Fail | Skip | Bằng chứng |
|---|---:|---:|---:|---:|---|
| `node --test ops/roadmap/tests/R2/` — lượt 1 | 1 | 9 | 12 | 0 | `ops/roadmap/tests/R2/run-1.tap` |
| `node --test ops/roadmap/tests/R2/` — lượt 2 | 1 | 9 | 12 | 0 | `ops/roadmap/tests/R2/run-2.tap` |
| `node node_modules/typescript/bin/tsc -p tsconfig.json` | 1 | — | — | — | `ops/roadmap/tests/R2/typecheck-node.log` |
| `node node_modules/typescript/bin/tsc -p tsconfig.web.json` | 1 | — | — | — | `ops/roadmap/tests/R2/typecheck-web.log` |

Hai lượt cùng kết quả: 21 tests, 0 cancelled, 0 todo; lượt 1 mất 54.013 giây, lượt 2 mất 88.093 giây. Mỗi lượt có **3 RED_FEATURE + 9 BLOCKED_BUILD** trong 12 fail. `diagnostic-final.tap` là lần chẩn đoán trước khi tách các ca API không cần build, không phải lượt chốt. Các file calibration/debug có sẵn không được dùng làm chứng nhận cuối.

## Danh sách đủ 21 ca

Tên thực tế của mỗi ca có tiền tố `dist: [collect|app|glue] R2:` và hậu tố `(WEB-contract §22)`.

| # | Vùng / mô tả ca | Điều khoản | Kết quả cả hai lượt |
|---:|---|---|---|
| 1 | collect / cấu hình apiBase ưu tiên và luôn đọc mới | §22 phía web; §17.6 | PASS |
| 2 | collect / apiBase trống dùng Apps Script, thiếu cấu hình không gửi mạng | §22 phía web; §17.1–17.2 | PASS |
| 3 | collect / mọi hành động giáo viên và admin giữ tên, payload và JSON | §22 tương thích; §17.2; §19.2 | PASS |
| 4 | collect / lỗi máy chủ mới giữ nguyên mã và không đổi sang Apps Script | §22 tương thích; §19.2 | PASS |
| 5 | collect / lõi memory giữ scrypt, token băm và phiên đúng 8 giờ | §22 bảo mật | PASS |
| 6 | collect / khóa và đổi mật khẩu vô hiệu phiên cũ, không lộ bí mật | §22 bảo mật; §19.2 | PASS |
| 7 | collect / catalog giữ tiêu đề đề tĩnh trong lớp và bài giao | §22 danh mục đề | PASS |
| 8 | collect / hạn mở, bù trễ 2 phút và retry giữ mã cũ | §22 bảo mật/idempotency; §19.2 | PASS |
| 9 | app / apiBase cùng nguồn đăng nhập giáo viên, ưu tiên URL cũ | §22 phía web; §19.2 | BLOCKED_BUILD |
| 10 | app / admin dùng apiBase khi không có appsScriptUrl | §22 phía web; §19.1–19.2 | BLOCKED_BUILD |
| 11 | app / apiBase tuyệt đối gửi JSON qua hai origin cục bộ | §22 phía web/Pages | BLOCKED_BUILD |
| 12 | app / học sinh vào lớp, làm bài và nhận xác nhận qua apiBase | §22 phía web; §17.4; §19.1–19.2 | BLOCKED_BUILD |
| 13 | app / API lỗi không báo đã gửi và vẫn tải kết quả được | §22 phía web; §17.4; D08 | BLOCKED_BUILD |
| 14 | app / không có apiBase vẫn đăng nhập Apps Script qua redirect text/plain | §22 tương thích; §17.2 | BLOCKED_BUILD |
| 15 | glue / build API tự chứa, package ES module và catalog đúng | §22 mã nguồn/điểm vào/danh mục | BLOCKED_BUILD |
| 16 | glue / gói API build gọi được GET và POST không cần file bên ngoài | §22 điểm vào; §17.2 | BLOCKED_BUILD |
| 17 | glue / API build cho phép CORS JSON từ GitHub Pages | §22 phía web/CORS | BLOCKED_BUILD |
| 18 | glue / publish chép API vào gốc, không nằm trong site | §22 điểm vào/publish | RED_FEATURE |
| 19 | glue / publish cấu hình Vercel dùng apiBase tương đối | §22 phía web/publish | RED_FEATURE |
| 20 | glue / publish cấu hình Pages dùng API tuyệt đối | §22 phía web/publish | RED_FEATURE |
| 21 | glue / publish giữ Apps Script, không nhập dữ liệu Sheet | §22 không chuyển dữ liệu cũ | PASS |

## Vì sao đỏ và bị chặn

**R2-PUBLISH-01 — MAJOR:** `ops/publish.py` chép cả `dist/api` vào `site/api`. Ca 18 xác nhận `api/rpc.js` có ở gốc nhưng `site/api` cũng tồn tại. §22 yêu cầu API ở gốc, không nằm trong `site/`. Tái hiện bằng lệnh suite; kiểm `_artifacts/publish/output/site/api/`.

**R2-PUBLISH-02 — MAJOR:** ca 19 đọc `site/public/config.json` nhận `{appsScriptUrl: 'http://127.0.0.1:9/legacy'}`, cần chính xác `{apiBase: '/api/rpc'}`. Đây là URL tổng hợp trong sandbox.

**R2-PUBLISH-03 — MAJOR:** ca 20 đọc `public/config.json` nhận cùng cấu hình Apps Script tổng hợp, cần `{apiBase: 'https://cunata.vercel.app/api/rpc'}`. Không gọi URL này thật.

**BUILD-BLOCKER — ngoài scope:** `src/app/main.ts:2458:36`, `JSON.parse(rawFinal || rawDraft)`, TS2345: `string | null` không gán được cho `string`. Hai typecheck và build từ working tree cùng báo lỗi này. File đã có thay đổi của người khác; task không sửa, hoàn tác hay thay source bằng HEAD. Ca 9–17 chưa đi đến assertion hành vi trên bản build cuối: **NOT_RUN cho phần browser/entrypoint/CORS**, dù runner ghi fail do prerequisite. Cần owner vùng app sửa lỗi nullability rồi chạy lại nguyên suite hai lần.

## Coverage và giới hạn

- Các gạch §22 thuộc R2: backend ưu tiên/fallback, POST JSON/GET công khai, giữ hành động và dữ liệu/mã lỗi, collector thật, API tự chứa + ES module + catalog, publish đúng vị trí và hai cấu hình, giữ Apps Script đều có ca riêng.
- Bảo mật/session/catalog/deadline được kiểm bằng lõi thật với MemoryStore; không chứng nhận entropy thống kê bằng một mẫu token hay bảo mật production.
- Neon SQL-over-HTTP, tạo bảng và `DATABASE_URL` là phần lõi R1; **NOT_RUN với Neon thật** theo ràng buộc task. Probe wrapper dùng fetch cách ly chỉ kiểm wiring, không thay cho kiểm tích hợp DB.
- Giữ sentinel Apps Script và cấm network trong publisher chứng minh sandbox không chuyển dữ liệu từ Google; không đọc hoặc chuyển Sheet cũ.
- Không cài dependency, không commit, không deploy, không gọi Google/Vercel/Neon thật. Không sửa sản phẩm. Chỉ ghi mã test/evidence dưới `ops/roadmap/tests/R2/**` và báo cáo này.
- Chưa đạt điều kiện test đỏ chỉ vì thiếu tính năng cho toàn bộ mục: cần giải quyết BUILD-BLOCKER rồi xác minh lại các ca bị chặn. Không nghiệm thu R2, không tuyên bố APPROVED.

Snapshot nhận diện mã đã đọc (SHA-256):

```text
src/app/main.ts             6C470524BDF10CB0C5A2FEE73666FFA7C3D6D30C9732429F00EC9920A3790179
src/collect/appsScript.ts   2B112CA6F49F0A1706EDA0CF67D642F2B588D630A89CA6E7316CF3ED191C393F
scripts/web-build.ts       630535C3EAEE40F0CD258466C56604A4FCC1670AFA97EBC4BBF48E7B6AAE1B7A
ops/publish.py             A78EC187EA9CCF99D0EE913DF8176CBB04E8073E7D8D02C9E8B1462AA2BE221A
```
