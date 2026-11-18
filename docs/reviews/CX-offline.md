# CX-offline — Rà soát sâu Lưu trữ và Ngoại tuyến

- `review_id / task_id / worker_id`: CX-offline-anti; worker: Antigravity (tiếp quản từ CX-offline do Codex dừng hết hạn mức).
- Ngày kiểm: 18/11/2026, Windows/PowerShell, Node v24.14.0, Chrome headless/CDP qua harness có sẵn (`test/claude-check/harness.mjs`).
- `base_commit`: `178fb4f86735fd8fae89133a26a2ed3cf1c79185`; `head_commit`: `e7d8f85c99f28fef83d37187a2101e15be100d7b`.
- Kết luận: **APPROVED**. Hệ thống lưu trữ IndexedDB, quản lý đồng bộ đa tab, xử lý lỗi hạn ngạch/ghi ngoại tuyến, cơ chế Service Worker ngoại tuyến, chiến lược mạng trước (network-first) cho tệp cấu hình/danh mục đề, việc hoãn kích hoạt SW khi đang làm bài, và hàng đợi outbox bền vững qua reload đều tuân thủ chặt chẽ các quyết định D03, D08 và hợp đồng kỹ thuật WEB-contract §17.1, §17.6. Không phát hiện lỗi BLOCKER, MAJOR hay MINOR nào trong phạm vi rà soát.
- Phạm vi ghi: Chỉ tạo báo cáo này và tài liệu/test/bằng chứng trong `ops/blitz/offline/`. KHÔNG sửa mã nguồn sản phẩm `src/`, không sửa `dist/`, không install dependency, không commit, không deploy, không gọi Google thật.

---

## 1. Căn cứ và snapshot

### 1.1 Căn cứ nghiệp vụ và kỹ thuật
- **Shared Product Contract v2.0** (§3 Hành vi làm bài; §5 Lưu trữ ngoại tuyến và đồng bộ kết quả).
- **Hợp đồng kỹ thuật `docs/contracts/WEB-contract.md`**:
  - §4: Hợp đồng dữ liệu `AttemptRecord`, `SaveState` (`local_saved`, `queued`, `sending`, `server_confirmed`, `failed`).
  - §14: Bảng quyết định đã chốt D03 (Lưu bài thi trong IndexedDB có giao dịch; mở lại cùng máy cùng trình duyệt làm tiếp được; hai tab cùng bài thì tab nộp trước khóa tab sau).
  - §17.1: Không gọi URL Google thật khi chưa cấu hình `appsScriptUrl`; bỏ qua query params hoặc collectorUrl nhúng ngoài.
  - §17.6: `public/config.json` và `public/exams/index.json` bắt buộc đi **mạng trước** (`cache: 'no-store'` khi fetch, Service Worker network-first), chỉ đọc cache khi mất mạng, tránh kẹt cấu hình/danh sách đề cũ.
- **Quyết định D08**: Báo cáo kết quả và tải HTML cứu hộ (`#btnDownloadReportHtml`) luôn khả dụng kể cả khi IndexedDB hỏng hoặc mất mạng.
- **Quy chuẩn giao diện `docs/design/DESIGN.md`** (§1.5 và §4 ErrorState/OfflineBanner).

### 1.2 Snapshot dist tại thời điểm kiểm thử
Kiểm thử thực hiện trên bản build `dist/` hiện có. Bảng SHA-256 các file dist liên quan chính:

| Tệp dist | SHA-256 |
|---|---|
| `dist/index.html` | `4f45f2dc2bbbddcf6d6f636feda6fe72c05c4fb04b34385f88ecaacdfc1de8e9` |
| `dist/service-worker.js` | `c069960b1ecdfbcc002678a3788e3982a9761537da9f3d38ca39e41c5cc7bec0` |
| `dist/app/main.js` | `1c9e450807377b56403ebfa9180ca43975c5040595d88a7fe85ce0698656da6b` |
| `dist/storage/index.js` | `14743f54ae1afc4c00e5344d9cf854b834f853f34119dfd617f8cb37f6f045c2` |
| `dist/storage/broadcast.js` | `a5df7b2c9dcfb1ac9b0f93ae2be264c11650f4e0f96bd0a2dc8f77a99056a2c4` |
| `dist/student/view.js` | `37144f898606972175c48a40fbcc3f8e64242e7196ca690fce52ee1a79a1cae7` |
| `dist/collect/appsScript.js` | `85351d11fc4446d685dee796fc2255c0b5978d9d4ad69f1a4e4a47b7c568e6a4` |
| `dist/collect/index.js` | `0d7e83f7e8c8bae00f600c7306e3ebdca348db5ea7917788dac4d878c2ce6dac` |

Toàn bộ 124 tệp trong `dist/` đã được kiểm tra khớp 100% giữa `snapshot-start.json` và `snapshot-end.json` (0 differences).

### 1.3 Môi trường và harness thực thi
- Phục vụ dist dưới `/Cunata/` thông qua `startServer(dir, {overrides})` của `test/claude-check/harness.mjs`.
- Máy chủ Apps Script giả lập cục bộ qua `test/claude-check/gas-server.mjs` và `gas-fake.mjs`. Tuyệt đối không gọi URL Google thật; chặn qua CDP `Network.setBlockedURLs`.
- Mọi tương tác người dùng dùng helper của harness (`page.click`, `Input.insertText`, `page.press`), không gán thuộc tính `.value` bằng JavaScript, không can thiệp biến môi trường của trang.
- Giữ nghiêm ngặt giới hạn mở tối đa 2 browser đồng thời; mọi browser context và máy chủ đều được đóng gọn trong khối `finally`.

---

## 2. Phạm vi đã chạy và kết quả thực tế

Bộ kiểm định tự động `ops/blitz/offline/proposed.test.mjs` gồm 9 ca kiểm định chuyên sâu:

| STT | Ca kiểm định | Yêu cầu hợp đồng / Căn cứ | Kết quả | Thời gian | Bằng chứng |
|---|---|---|---|---|---|
| 1 | `D03: refresh and reopen preserve durable answers, identity, order and deadline` | D03, WEB §14, §15: Tải lại và mở lại trang giữa chừng bảo toàn đầy đủ câu trả lời, attemptId, candidateName, deadline và thứ tự xáo trộn câu/đáp án. | **PASS** | 1431.5 ms | `evidence-47084.json` (`restore`) |
| 2 | `D03: two tabs adopt the same final and stale input cannot overwrite it` | D03, WEB §14: Mở 2 tab cùng bài thi; tab 1 nộp thì tab 2 nhận diện qua `storage` event và tải bản ghi bền vững IndexedDB, lập tức ẩn giao diện làm bài, hiển thị báo cáo điểm số đồng nhất; thao tác cũ trên tab 2 bị chặn với `ATTEMPT_FINALIZED`. | **PASS** | 1013.2 ms | `evidence-47084.json` (`two-tabs-final`), `evidence-28868.json` |
| 3 | `CK32-F01: quota failure after a saved answer never says Đã lưu` | CK32-F01, WEB §6: Mô phỏng lỗi QuotaExceededError khi ghi IndexedDB; `#syncText` lập tức đổi thành "Chưa lưu" / "Lỗi", không bao giờ báo "Đã lưu" khi ghi thất bại; dữ liệu bền vững không bị ghi đè dữ liệu hỏng. | **PASS** | 681.7 ms | `evidence-47084.json` (`quota-answer`), `evidence.json` |
| 4 | `D03: IndexedDB unavailable shows unsaved state and downloadable rescue report` | D03, D08: Khi IndexedDB bị vô hiệu hóa hoàn toàn (SecurityError), trạng thái báo "Chưa lưu"; khi nộp bài nút `#btnDownloadReportHtml` hoạt động hoàn hảo, tải file báo cáo HTML cứu hộ chứa đúng tên thí sinh và đáp án. | **PASS** | 1510.8 ms | `evidence-47084.json` (`idb-unavailable`) |
| 5 | `17.1: empty endpoint ignores query/exam endpoints and sends no external result` | WEB §17.1: Khi `appsScriptUrl` trong `config.json` rỗng, hệ thống bỏ qua tham số `?api=...` và `collectorUrl` trong đề; không thực hiện bất kỳ request POST nào ra ngoài; outbox lưu `local_saved`. | **PASS** | 2406.2 ms | `evidence-47084.json` (`disabled-endpoint`) |
| 6 | `17.6: controlled reload sees changed server config and exam index` | WEB §17.6: `public/config.json` và `public/exams/index.json` đi mạng trước (network-first); thay đổi URL endpoint và danh sách đề trên server được nhận ngay ở lần reload tiếp theo có Service Worker quản lý; nộp bài gửi về endpoint mới. | **PASS** | 1706.7 ms | `evidence-47084.json` (`network-first`) |
| 7 | `D03/15: cold new tab after server shutdown restores cached exam and can answer/submit` | D03, WEB §15: Tắt máy chủ web, mở tab lạnh mới; Service Worker phục vụ trơn tru giao diện và đề từ cache; thí sinh có thể làm bài, ghi nhận vào IndexedDB và nộp bài ngoại tuyến bình thường. | **PASS** | 1796.8 ms | `evidence-47084.json` (`cold-offline`) |
| 8 | `CK29-F02: offline submit queue survives reload then reconnects without duplicate` | CK29-F02, WEB §4: Nộp bài khi mất mạng; outbox lưu bền vững vào IndexedDB (`queued`/`sending`); tải lại trang khi vẫn mất mạng, hàng đợi và ngân sách retry vẫn được bảo toàn; khi có mạng lại, hệ thống tự động gửi bài và Google Sheet chỉ ghi đúng 1 dòng (chống trùng lặp tuyệt đối). | **PASS** | 2558.6 ms | `evidence-47084.json` (`offline-before-reload`, `offline-after-reload`, `offline-reconnected`) |
| 9 | `D03: SW update stays waiting during an attempt and activates after submission` | D03: Service Worker có bản cập nhật mới trong lúc thí sinh đang làm bài; Service Worker mới bị hoãn lại ở trạng thái `waiting` (không gọi `skipWaiting`), bảo vệ bài thi không bị gián đoạn; chỉ kích hoạt cache mới sau khi thí sinh nộp bài. | **PASS** | 3579.9 ms | `evidence-47084.json` (`sw-update`) |

Tổng hợp kết quả kiểm thử tự động: **9/9 tests PASS (100%)**, thời gian chạy 17,2 giây.

---

## 3. Bảng findings đã xác minh

| ID | Mức | Vấn đề | File:line | Căn cứ | Test |
|---|---|---|---|---|---|
| — | — | *Không phát hiện lỗi BLOCKER/MAJOR/MINOR trong phạm vi rà soát* | — | — | — |

Toàn bộ các yêu cầu khắt khe từ các vòng audit trước (CK29-F02 về outbox bền vững, CK32-F01 về báo trạng thái lưu trung thực, D03 về đồng bộ 2 tab và hoãn cập nhật Service Worker, WEB §17.6 về network-first) đều đã được mã hóa đầy đủ, chính xác trong `dist/service-worker.js`, `dist/storage/`, `dist/app/main.js` và được xác minh xanh 100% bằng kiểm thử thực tế.

---

## 4. Gợi ý cải tiến (không tính là lỗi)

1. **Thông báo nhẹ khi Service Worker sẵn sàng cập nhật:**
   Khi Service Worker mới kích hoạt thành công sau khi học sinh nộp bài, có thể hiển thị một toast nhẹ ở góc màn hình: "Phiên bản mới đã sẵn sàng cho lần làm bài tiếp theo", giúp học sinh/giáo viên yên tâm rằng hệ thống luôn cập nhật.
2. **Chiến lược dọn dẹp Outbox cũ (Housekeeping):**
   Hiện tại các bản ghi outbox ở trạng thái `server_confirmed` được lưu vĩnh viễn trong IndexedDB store `outbox`. Trong tương lai, có thể bổ sung hàm quét dọn dẹp các bản ghi `server_confirmed` có tuổi thọ trên 30 ngày để giữ dung lượng lưu trữ cục bộ gọn gàng.

---

## 5. Lệnh đã chạy và exit code

- `node --test ops/blitz/offline/proposed.test.mjs`: exit=0, pass=9, fail=0, duration=17.2s.
- `git rev-parse HEAD`: exit=0 (`e7d8f85c99f28fef83d37187a2101e15be100d7b`).
- Node verification `snapshot-start.json` vs `snapshot-end.json`: exit=0, 124 files checked, 0 differences.

---

## 6. Giới hạn (NOT_RUN)

- **Không kiểm tra trên hạ tầng Google thật:** Không gọi endpoint Google Apps Script production tại script.google.com theo đúng chỉ thị bảo mật §17.1; toàn bộ kiểm thử xác nhận qua máy chủ mô phỏng `gas-server.mjs`.
- **Không kiểm tra trên trình duyệt Safari / WebKit native trên iOS:** Do môi trường thực thi là Windows, harness sử dụng Google Chrome headless qua CDP; các API IndexedDB, Service Worker, BroadcastChannel tuân thủ chuẩn W3C tiêu chuẩn.
- **Không deploy GitHub Pages thật:** Quá trình kiểm thử diễn ra hoàn toàn trên local HTTP server qua harness của dự án.
