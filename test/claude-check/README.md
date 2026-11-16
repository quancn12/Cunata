# test/claude-check — bộ kiểm định web độc lập của Phó phòng

Chạy trên **trình duyệt thật** (Chrome/Edge headless qua CDP, không cần cài gì), trên **cả hai bản**:
`index.html` ở gốc (bản đang lên GitHub Pages) và `dist/` (bản build module). Cả hai được phục vụ dưới đường dẫn con `/Cunata/`.

```powershell
node scripts/web-build.ts                              # dựng dist/ trước
node --test "test/claude-check/**/*.test.mjs"          # toàn bộ
node --test --test-name-pattern="^dist" test/claude-check/web.test.mjs   # chỉ bản dist
```

## Luật

- Worker (Antigravity) **không được sửa, xóa, bỏ qua** bất kỳ file nào trong `test/claude-check/` và `test/codex-check/`.
  Sau mỗi vòng, điều phối tự khôi phục hai thư mục này từ git; mọi thay đổi ở đây bị hủy và bị ghi nhận là vi phạm.
- Test đỏ = **sản phẩm** chưa đúng Shared Product Contract. Sửa sản phẩm ở `src/**`, `index.html`, `scripts/**`.
- Cấm sửa để "qua test": không dò `navigator.webdriver`/user-agent, không rẽ nhánh theo `examId` bắt đầu bằng `claude-check`,
  không gắn cứng điểm số. Codex sẽ rà soát diff.
- Cho rằng test sai so với hợp đồng: giữ nguyên test, ghi `NEED_DECISION` kèm điều khoản hợp đồng và bằng chứng.

## Hợp đồng DOM (cả hai bản phải giữ)

Đây là DOM của `index.html` gốc hiện tại; bản `dist/` phải tương đương.

| Thành phần | Selector |
|---|---|
| Tiêu đề đề thi | `#examTitle` (khác "Đang tải đề thi..." khi đã sẵn sàng) |
| Tên thí sinh | `#candidateName` |
| Trạng thái lưu | `#syncText` (chứa "Đã lưu" khi đã lưu cục bộ) |
| Đồng hồ | `#timerBox` dạng `mm:ss` |
| Nạp đề JSON | `input[type=file]#examFileInput` (lược đồ `web-exam-v1`, như `public/exams/toan-full.json`) |
| Vùng làm bài / báo cáo | `#examWrapper`, `#examPane`, `#reportWrapper` (ẩn bằng `display:none`) |
| Thẻ câu hỏi | `.question-card` có `id="qcard-<questionVersionId>"` |
| Phương án Phần I | `[role=radio][data-qid][data-option-id]`, có `aria-checked` |
| Ý Phần II | `.statement-row` theo thứ tự, mỗi hàng có `.tf-btn[data-val="true"|"false"]`; nút được chọn có class chứa `selected` hoặc `aria-pressed="true"` |
| Trả lời ngắn | `.short-answer-input` |
| Nộp bài | `#btnSubmit` → hộp thoại `#submitModal` → `#btnConfirmSubmit` / `#btnCancelSubmit` |
| Điểm | `#scorePartI`, `#scorePartII`, `#scorePartIII`, `#scoreTotal` dạng `điểm / tối đa`; `#reportSubtitle` có tên thí sinh |
| Báo cáo | `#btnDownloadReportHtml`, `#btnRestart`, `#reviewQuestionsList` |
| Chọn đề | `#btnOpenExamList` → hộp thoại `#examListModal` chứa `button.exam-list-item[data-exam-url]`; dữ liệu từ `public/exams/index.json`; liên kết thẳng `?exam=<examId>` (WEB-contract mục 15) |
| Màn vào thi | `#startScreen` gồm `input#startName`, `button.exam-list-item[data-exam-url]` (đề chọn: `aria-pressed="true"`), `#btnStartExam` (khóa tới khi có tên + đề) — WEB-contract mục 16 |
