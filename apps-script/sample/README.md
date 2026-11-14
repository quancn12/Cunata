# Cunata — Google Apps Script Sample Collector (Mẫu Tham Khảo Kỹ Thuật)

> **CẢNH BÁO BẮT BUỘC THEO HỢP ĐỒNG KỸ THUẬT (WEB-contract.md §7):**  
> Bản mẫu ở `apps-script/sample/` là tài liệu tham khảo độc lập, **“chưa triển khai, chưa kiểm CORS thật”**.  
> Tuyệt đối không chứa credentials, token, API key hoặc endpoint đã triển khai thực tế.  
> Mặc định tính năng kết nối mạng thu thập kết quả bị vô hiệu hóa (`COLLECTOR_DISABLED`) khi chưa có phê duyệt quyết định **D04** từ Trưởng phòng (Product Owner).  
> Các bài kiểm tra trong môi trường Node VM đều là **kiểm thử mô phỏng (simulated)**.  
> Kiểm thử CORS trình duyệt thực tế và đọc lại dữ liệu (readback) từ Google Sheets được ghi nhận là **NOT_RUN** khi chưa được cấp quyền; **tuyệt đối không tuyên bố đã lưu Google Drive khi chưa nhận được receipt xác nhận**.

---

## 1. Mục Đích & Sự Khác Biệt với Bản Cũ (`apps-script/`)

Bản mẫu này (`apps-script/sample/`) được thiết kế tách biệt hoàn toàn với mã nguyên mẫu cũ (`apps-script/Code.js`):
1. **Tra cứu & Khử trùng lặp theo Bộ ba Định danh (Tuple Deduplication)**:
   - Bản cũ chỉ tra cứu `attempt_id` tại Cột A, có rủi ro xung đột hoặc bypass nếu hai kỳ thi khác nhau có ID trùng hoặc alias.
   - Bản mẫu mới tra cứu theo **bộ ba định danh (Tuple)**: `(exam_id, exam_version_id, attempt_id)` kết hợp với mã băm nội dung `payload_hash` (Cột 18 / R).
2. **Khử trùng lặp Nguyên tử (Atomic Dedupe)**:
   - Mọi thao tác kiểm tra tiêu đề, tìm kiếm dòng, so sánh mã băm và ghi dữ liệu đều được bao bọc hoàn toàn bên trong khóa nguyên tử `LockService.getScriptLock()` với thời gian chờ 30 giây.
   - Nếu khóa đang bận, hệ thống trả về mã lỗi `SERVER_BUSY` (HTTP 503 tương đương), ngăn chặn tình trạng ghi đè hoặc ghi trùng hàng khi nhiều thí sinh nộp bài cùng lúc.
3. **Phát hiện Xung đột Dữ liệu (Conflict Detection)**:
   - Khi cùng bộ ba `(exam_id, exam_version_id, attempt_id)` gửi lại với `payload_hash` hoặc điểm số/câu trả lời khác nhau, hệ thống trả về lỗi `PAYLOAD_CONFLICT` và **tuyệt đối không ghi đè** dữ liệu cũ.
   - Nếu `payload_hash` hoàn toàn khớp (idempotent retry), hệ thống trả về biên nhận `already_recorded` kèm thông tin `Receipt` chuẩn.
4. **Cấu trúc Biên nhận Chuẩn (`Receipt` Contract)**:
   - Trả về đối tượng JSON khớp chính xác với kiểu `Receipt` của Web client:
     ```json
     {
       "examId": "exam-01",
       "examVersionId": "v1.0.0",
       "attemptId": "att-uuid-01",
       "submissionId": "sub-att-uuid-01",
       "payloadHash": "1a2b3c4d5e6f7089",
       "receivedAt": "2026-11-14T08:00:00.000Z",
       "status": "recorded" // hoặc "already_recorded"
     }
     ```

---

## 2. Phòng Chống Tiêm Công Thức Bảng Tính (CWE-1236 / Formula Injection)

Google Sheets và Microsoft Excel tự động thực thi các công thức khi một ô bắt đầu bằng các ký tự kích hoạt. Đối với các dữ liệu từ học sinh (tên hiển thị, đáp án tự do Phần III, ghi chú), đây là lỗ hổng bảo mật nghiêm trọng.

Bản mẫu triển khai hàm `sanitizeSheetCell`:
- Phát hiện các tiền tố kích hoạt chuẩn: `=`, `+`, `-`, `@`, `|`, `\t`, `\r`, `\n`.
- Phát hiện các biến thể Fullwidth Unicode: `＝` (\uFF1D), `＋` (\uFF0B), `－` (\uFF0D), `＠` (\uFF20), `｜` (\uFF5C).
- Phát hiện khoảng trắng hoặc ký tự điều khiển đứng trước ký tự nguy hiểm.
- **Bảo toàn chuỗi số âm Phần III**: Chuỗi `-0,5` hoặc `-12` được bảo vệ nguyên vẹn bằng tiền tố nháy đơn (`"'-0,5"`), ngăn chặn Google Sheets tự động chuyển đổi thành phép trừ hoặc công thức lỗi.

---

## 3. Xác Thực Phân Số BigInt Chuẩn Tắc (Rational Scores)

Bản mẫu triển khai bộ parser và cộng trừ phân số BigInt (`parseRational`, `ratAdd`, `ratCmp`):
- `total` và `maxTotal` phải là phân số hợp lệ, `total >= 0`, `maxTotal > 0`, `total <= maxTotal`.
- Cả 3 phần I, II, III phải có đầy đủ điểm đạt được và điểm tối đa (`score` và `max`).
- Tổng điểm 3 phần phải khớp chính xác với điểm tổng bài thi: `score_I + score_II + score_III == total`.
- Tổng điểm tối đa 3 phần phải khớp chính xác với điểm tối đa của đề: `max_I + max_II + max_III == maxTotal`.

---

## 4. Giải Thích Giới Hạn Bảo Mật Chấm Điểm Phía Máy Chủ (Trusted Server Grading Limitations)

> [!WARNING]
> **Giới hạn tin cậy trong mô hình Web tĩnh (GitHub Pages)**:
> 1. **Biên Giới Tin Cậy Phía Client (Client-Side Trust Boundary)**:  
>    Trên nền tảng web tĩnh không có máy chủ ứng dụng chuyên biệt, việc chấm điểm được thực thi bởi JavaScript trên trình duyệt của thí sinh. Thí sinh am hiểu kỹ thuật có thể mở Developer Tools, sửa đổi trạng thái bộ nhớ hoặc can thiệp mã JavaScript để làm giả điểm số (`scoreDTO`, `total`) trước khi gửi lên Apps Script.
> 2. **Rủi Ro Lộ Đáp Án Đề Thi (Answer Key Leakage)**:  
>    Nếu bài thi tải toàn bộ đáp án chuẩn về máy để chấm offline, học sinh có thể trích xuất đáp án từ file mã nguồn/JSON hoặc CacheStorage. Việc ẩn hiển thị đáp án trên giao diện trước deadline (`releasePolicy: 'after_deadline'`) chỉ là **tính năng trải nghiệm (UX)**, không phải là cơ chế bảo mật mật mã học.
> 3. **Yêu Cầu Chấm Điểm Đáng Tin Cậy Phía Máy Chủ (Trusted Server Grading — D04 / D08)**:  
>    Để phục vụ các kỳ thi đánh giá chính thức có giám sát và yêu cầu tính trung thực cao, kết quả do client gửi lên **không thể được coi là nguồn sự thật duy nhất**. Hệ thống bắt buộc phải có một thành phần máy chủ đáng tin cậy (như Cloudflare Worker hoặc backend bảo mật nắm giữ đáp án bí mật), nhận các lựa chọn thô của học sinh và tự chạy lại hàm chấm `scoreAttempt` độc lập.

---

## 5. Cấu Trúc 18 Cột Bảng Tính Chuẩn (A–R)

| Cột | Tên trường | Mô tả |
| :--- | :--- | :--- |
| **A** | `attempt_id` | Khóa duy nhất của lượt thi (UUID v4) |
| **B** | `exam_id` | Định danh đề thi |
| **C** | `exam_version_id` | Phiên bản đề thi |
| **D** | `candidate_display` | Tên hiển thị thí sinh (đã khử công thức) |
| **E** | `started_at` | Thời điểm bắt đầu (ISO 8601) |
| **F** | `submitted_at` | Thời điểm nộp bài (ISO 8601) |
| **G** | `duration_seconds` | Thời gian làm bài (giây) |
| **H** | `score_p1` | Điểm đạt được Phần I (phân số chuẩn) |
| **I** | `max_p1` | Điểm tối đa Phần I |
| **J** | `score_p2` | Điểm đạt được Phần II |
| **K** | `max_p2` | Điểm tối đa Phần II |
| **L** | `score_p3` | Điểm đạt được Phần III |
| **M** | `max_p3` | Điểm tối đa Phần III |
| **N** | `total_score` | Tổng điểm đạt được |
| **O** | `max_total` | Tổng điểm tối đa |
| **P** | `policy_version` | Phiên bản luật chấm (ví dụ: `custom-v1`) |
| **Q** | `raw_answers_json` | Dữ liệu trả lời thô (đã khử công thức) |
| **R** | `payload_hash` | Mã băm SHA-like 16 ký tự dùng để khử trùng lặp |

---

## 6. Hướng Dẫn Thử Nghiệm Trong Môi Trường Mô Phỏng (Simulated Node VM)

Toàn bộ các hành vi của bản mẫu này được kiểm thử tự động trong file:  
`test/collect/sample/appsScriptSample.test.ts`

Các bài kiểm tra xác nhận:
- Khóa `LockService` hoạt động nguyên tử, trả về `SERVER_BUSY` khi bị tranh chấp.
- Khử trùng lặp chính xác theo bộ ba `(exam_id, exam_version_id, attempt_id)` và `payload_hash`.
- Phát hiện và từ chối xung đột `PAYLOAD_CONFLICT` khi gửi lại cùng bộ ba với điểm số/đáp án khác.
- Kiểm tra tính toán phân số BigInt và phòng chống formula injection CWE-1236.
