# Cunata — Google Apps Script Result Collector

Thành phần tiếp nhận kết quả thi trực tuyến vào Google Sheets phục vụ giáo viên và chủ dự án, tuân thủ **Shared Product Contract v2.0** (Mục 1, 2, 4) và nghiên cứu **RSCH-ANTI-R08**.

---

## 1. Tính Năng & An Toàn Kỹ Thuật

1. **Phòng chống Tiêm Công Thức Bảng Tính (CWE-1236 / Spreadsheet Formula Injection)**:
   - Tự động thêm tiền tố nháy đơn (`'`) vào trước các ô có ký tự kích hoạt công thức nguy hiểm: `=`, `+`, `-`, `@`, `\t`, `\r`, `\n`, `＝`, `＋`, `－`, `＠`.
   - **Bảo toàn chuỗi đáp án Phần III**: Chuỗi số âm như `-0,5` hoặc `-12` được bảo vệ nguyên vẹn dạng chuỗi, không bị Google Sheets tự động đổi dấu hay diễn giải thành công thức.

2. **Chống Ghi Trùng & Tính Lũy Nghiệm (Idempotency)**:
   - Mỗi lần thi được định danh bằng một `attempt_id` (UUID v4) bất biến.
   - Khi mạng chập chờn hoặc học sinh bấm nộp lại nhiều lần, Apps Script kiểm tra Cột A (`attempt_id`). Nếu đã tồn tại, hệ thống trả về ngay biên nhận xác nhận trước đó mà không tạo thêm dòng mới.

3. **Kiểm Soát Tranh Chấp Đồng Thời (`LockService`)**:
   - Sử dụng `LockService.getScriptLock()` với thời gian chờ 30 giây để đồng bộ hóa việc ghi hàng, ngăn ngừa race condition làm mất dữ liệu khi nhiều học sinh nộp bài cùng lúc.

4. **17 Cột Dữ Liệu Chuẩn (A–Q)**:
   - `attempt_id`: Khóa chính duy nhất.
   - `exam_id`: Mã đề thi.
   - `exam_version_id`: Phiên bản đề thi.
   - `candidate_display`: Tên hiển thị hoặc SBD học sinh.
   - `started_at`: Thời điểm bắt đầu (ISO 8601).
   - `submitted_at`: Thời điểm nộp bài (ISO 8601).
   - `duration_seconds`: Thời gian làm bài thực tế (giây).
   - `score_p1` / `max_p1`: Điểm đạt được / tối đa Phần I.
   - `score_p2` / `max_p2`: Điểm đạt được / tối đa Phần II.
   - `score_p3` / `max_p3`: Điểm đạt được / tối đa Phần III.
   - `total_score` / `max_total`: Tổng điểm đạt được / tối đa.
   - `policy_version`: Phiên bản luật chấm (ví dụ: `custom-v1`).
   - `raw_answers_json`: Toàn bộ câu trả lời chi tiết đã làm sạch.

---

## 2. Hướng Dẫn Triển Khai (Deploy as Web App)

1. Mở một Google Sheets mới trên tài khoản Google của chủ dự án (hoặc giáo viên).
2. Vào menu **Tiện ích mở rộng (Extensions)** > **Apps Script**.
3. Dán toàn bộ nội dung file `Code.js` vào trình soạn thảo.
4. Bấm **Triển khai (Deploy)** > **Triển khai mới (New deployment)**:
   - **Chọn loại**: Ứng dụng web (Web app).
   - **Mô tả**: `Cunata Collector v1.0`.
   - **Thực thi dưới dạng (Execute as)**: `Tôi (Me / email của chủ dự án)`.
   - **Ai có quyền truy cập (Who has access)**: `Bất kỳ ai (Anyone)`.
5. Cấp quyền truy cập Google Sheets theo hướng dẫn của Google và sao chép URL Web App được cấp:
   `https://script.google.com/macros/s/<SCRIPT_ID>/exec`
