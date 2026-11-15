# IMP-AUDIT-C — Kiểm định độc lập de18–de21

Ngày kiểm định: 16/11/2026. Reviewer: Codex. Snapshot HEAD: `3d5e868af9b7c1a0748bb412e6efbb5886caa3a2`; kiểm tra trực tiếp working tree, không sửa đề, không commit.

Đã đối chiếu đủ **112/112 câu**: mỗi đề I.1–18, II.1–4 (đủ 16 ý), III.1–6. Đã nhìn toàn bộ **35 ảnh trang PDF**: de18 p01–p09, de19 p01–p08, de20 p01–p09, de21 p01–p09; đối chiếu JSON, lớp chữ `pdf_text.txt`, `answers_from_text.json`, `notes.md`, `source.txt`. Đã mở riêng cả 14 ảnh được JSON tham chiếu và so với trang đề. Số trang dưới đây là thứ tự trang PDF, tương ứng `pXX.png`; số câu trong findings là số **trong từng phần**, không phải số thứ tự 1–28 của trường title JSON.

Không phát hiện đảo thứ tự A/B/C/D hay sai mapping đáp án so với đáp án PDF: 72 đáp án phần I, 64 giá trị Đúng/Sai, 24 chuỗi trả lời ngắn đều khớp. Điều đó không chứng nhận nguồn đúng vật lí hoặc câu đủ dữ kiện. Các vấn đề nguồn được ghi riêng cuối từng mục, chưa tự quyết sửa.

Phân biệt hai loại lỗi công thức: (a) chép khác PDF; (b) JSON có biểu thức LaTeX đúng nguồn nhưng **không tương thích bộ hiển thị hiện tại**, khiến học sinh đọc thành biểu thức khác. Với (b), đã chạy chính `renderMathText` trích từ `src/app/main.ts:251`, không suy đoán theo KaTeX. Bộ hiển thị đổi `\frac{a+b}{c+d}` thành `(a+b/c+d)`, mất nhóm tử/mẫu; các findings chỉ rõ cách viết tương thích để worker sửa dữ liệu trong phạm vi được giao. Gốc lỗi này thuộc renderer dùng chung; việc sửa renderer cần task riêng. Không báo `10^23`, `10^-3`, `Q_nc`, `m_Al` là lỗi hiển thị: renderer hiện tại hỗ trợ các chuỗi ASCII này. Trường hợp chỉ số Unicode, chỉ số có ngoặc nhọn và các lệnh chưa hỗ trợ được nêu cụ thể.

## de18 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 3 (Phần II): JSON ghi trong lời giải ý a “(3) - (4) là quá trình đẳng áp” rồi dùng `p_3/T_3 = p_4/T_4` ; PDF trang 7 ghi “(3) - (4) là đẳng tích”, đúng với đoạn nằm ngang trên đồ thị V–T ; sửa thành “(3) - (4) là quá trình đẳng tích”, giữ bốn đáp án Đúng.
- [MAJOR] Câu 14 (Phần I): JSON ghi `\frac{X - (-10)}{90 - (-10)}` và `\frac{40 - 0}{100 - 0}`, khi hiển thị thành `(X - (-10)/90 - (-10))` và `(40 - 0/100 - 0)` ; PDF trang 5 ghi hai phân số có toàn bộ hiệu ở tử và mẫu ; sửa thành các biểu thức tương thích `((X - (-10))/(90 - (-10))) = ((40 - 0)/(100 - 0))`, giữ X = 30 và đáp án B.
- [MAJOR] Câu 16 (Phần I): JSON ghi `\frac{t_2 + t_1}{2}`, khi hiển thị thành `(t₂ + t₁/2)` ; PDF trang 5 ghi `(t₂ + t₁)/2` ; sửa thành `(t_2 + t_1)/2` trong vùng công thức hoặc thêm ngoặc quanh tử trong `\frac`, giữ đáp án B.
- [MINOR] Câu 17 (Phần I): JSON ghi `m_đ` trong lời giải, renderer để nguyên dấu gạch dưới ; PDF trang 6 ghi đ là chỉ số dưới của m ; sửa thành ký hiệu ASCII được hỗ trợ như `m_d`, kèm định nghĩa là khối lượng nước đá; không thay dữ kiện hay đáp án D.
- [MINOR] Câu 2 (Phần II): JSON ghi `\≈ 2083` trong lời giải ý c ; PDF trang 6 ghi điện năng 2082720 J, không có ký tự gạch chéo trước dấu xấp xỉ ; sửa thành `≈ 2083` trong phần diễn giải đổi đơn vị.
- [MAJOR] Câu 2 (Phần III): JSON ghi `\frac{2}{50 + 273}`, khi hiển thị thành `(2/50 + 273)` ; PDF trang 7 ghi 2 chia cho toàn bộ `(50 + 273)` ; sửa thành `2/(50 + 273)` trong công thức, giữ key `696` theo nguồn; xử lý thiếu hình theo quyết định nguồn bên dưới.
- [MAJOR] Câu 4 (Phần III): JSON ghi `\frac{Q}{m Δt}` và `\frac{104804}{1 · (60 - 35)}`, khi hiển thị mẫu tích không được nhóm, ví dụ `(104804/1 · (60 - 35))` ; PDF trang 8 ghi toàn bộ `mΔt` và `1·(60−35)` ở mẫu ; sửa thành `Q/(m Δt)` và `104804/(1 · (60 - 35))`, giữ key `4192`.

Đã kiểm ảnh: II.3 → `p02-1.png`, II.4 → `p03-0.png`, III.3 → `p03-1.png`, III.4 → `p03-2.png`: đúng câu, không bị cắt mất dữ kiện. III.2 thực sự không có đồ thị trong nguồn, không được bịa hình.

Nguồn có vấn đề:

- **III.2, trang 3 và 7 — NEED_DECISION:** đề yêu cầu đọc đồ thị nhưng cả hai trang đều thiếu hình. Hướng dẫn tự sử dụng quá trình đẳng áp, V₁ = 2, V₂ = 6, cho key `696`. Xác nhận ghi chú worker là đúng. Phương án A: Trưởng phòng duyệt bổ sung dữ kiện bằng chữ/hình đã xác minh từ bản nguồn đầy đủ. Phương án B: tạm loại câu/giữ đề chưa phát hành tới khi lấy được bản đủ hình. Chưa tự chọn, không thể coi câu hiện tại đủ dữ kiện.
- **I.17, trang 6 — NEED_DECISION:** hướng dẫn nói nước hạ từ 20°C về 0°C nhưng tính `200·4,2·(100−20) = 67200 J`. Đúng theo dữ kiện phải là `200·4,2·(20−0) = 16800 J`; phương trình cân bằng phía sau và đáp án D ≈ 7°C vẫn đúng. JSON chép lỗi nguồn. Phương án A: duyệt đính chính dòng trung gian và ghi chú nguồn. Phương án B: giữ nguyên trích dẫn kèm cảnh báo lỗi nguồn, không trình bày nó như phép tính đúng. Không đổi đáp án.
- **I.17, trang 2/6:** nhiệt độ nước ban đầu in `20°`, thiếu chữ C; có thể duyệt chuẩn hóa `20°C` cùng đợt đính chính trên.

## de19 — verdict: CHANGES_REQUESTED

- [BLOCKER] Câu 6 (Phần III): JSON ghi “Tiếp nối thông tin câu trước” nhưng không mang theo đoạn dữ kiện chung: 1 kg nước đá ở −30°C, 2 kg nước ở 50°C, c₁ = 2100, c₂ = 4200 J/(kg·K), λ = 340000 J/kg, bỏ qua trao đổi nhiệt với bình/môi trường ; PDF trang 3 và 8 đặt nguyên đoạn này cho cả câu 5 và 6 ; sửa thành chép đầy đủ đoạn dữ kiện chung vào content của câu 6, giữ riêng dữ kiện chì/nước đá mới và key `549`. Hiện xem riêng hoặc trộn câu sẽ không có đủ dữ kiện để tính 549 g; không được thay bằng nhiệt độ đã làm tròn `1,35` vì lời giải cần giá trị chính xác `85/63`.
- [MINOR] Câu 5 (Phần III): JSON ghi `Q_{nc}` ba lần trong lời giải ; PDF trang 8 ghi Q có chỉ số nc ; sửa thành `Q_nc` tương thích renderer hiện tại (hoặc Unicode tương đương), giữ các bước tính và key `1,35`. Probe thật cho thấy `Q_{nc}` hiện nguyên văn.
- [MAJOR] Câu 4 (Phần II): JSON ghi `\frac{l_A + 4}{l_B + 6}`, khi hiển thị thành `(l_A + 4/l_B + 6)` ; PDF trang 7 ghi tỉ số toàn bộ `(l_A + 4)/(l_B + 6)` ; sửa thành `(l_A + 4)/(l_B + 6)` trong vùng công thức, giữ l_A = 8 cm, l_B = 12 cm và đáp án Sai/Sai/Đúng/Đúng.

Đã kiểm ảnh: I.16 → `p02-1.png` (bốn đồ thị giữ thứ tự trái sang phải A–D); II.4 → `p03-1.png`; III.1 → `p03-2.png`: đúng nội dung/câu, không thiếu dữ kiện hình. Đoạn chung ở III.5 đã được sao vào câu 5; vấn đề nằm ở câu 6.

Nguồn có vấn đề:

- **I.3, trang 1/4:** B và C cùng là `ΔU = A` với A < 0; JSON giữ đúng nguồn, key D vẫn khớp. Theo notes.md. Phương án A: giữ nguyên có ghi nhận phương án trùng. Phương án B: xin bản đính chính từ tác giả trước khi đổi một phương án. Không tự tạo phương án mới.
- **I.15, trang 2/5 — NEED_DECISION:** nguồn chọn B, nhưng C dùng “năng lượng cần thiết” cho cùng 1 kg chất tăng 1°C, không tách bạch rõ với “nhiệt lượng cần thiết” ở B. Đây là nghi vấn câu một đáp án chưa chặt chẽ, không phải lỗi chuyển đổi. Phương án A: tác giả/Trưởng phòng xác nhận giữ B và chấp nhận cách diễn đạt. Phương án B: duyệt viết lại C để chỉ còn một đáp án đúng trước phát hành.
- **I.5, trang 1/4:** “Ngưng tut.” được worker chuẩn hóa “Ngưng tụ.”; **II.1d, trang 2/6:** “khí lí tường” được chuẩn hóa “khí lí tưởng”. Hai thay đổi chính tả phù hợp nghĩa, đã nêu trong notes.md; không coi là đổi phương án hay đáp án.
- **II.4a, trang 3/7:** dấu “+ áp suất khí quyển” đúng là có trong nguồn; JSON giữ đúng. **II.3d, trang 6:** nguồn tính Q ≈ 3761 J nên đánh Sai cho 3600 J; JSON giữ đúng, không phải mâu thuẫn key/lời giải. Đã đối chiếu các ghi chú này của worker.

## de20 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 5 (Phần III): JSON ghi thêm định nghĩa `m_2` là “khối lượng chất lỏng ban đầu ở bình II”, rồi dùng `mc(t_0 − 15) = m_2 c(15 − 10)` ; PDF trang 8–9 ghi 10°, 15°, 18° là nhiệt độ **sau mỗi lần trút** và không thêm định nghĩa sai này ; sửa thành `m_2` là khối lượng chất lỏng ở bình II **sau lần trút thứ nhất**, để hai phương trình hiện tại mô tả lần trút thứ hai và thứ ba. Đổi nhãn “lần 1/lần 2” tương ứng, giữ key `30`.
- [MAJOR] Câu 7 (Phần I): JSON ghi `\frac{99720}{D·(27 + 273)}`, renderer hiện `(99720/D·(27 + 273))` ; PDF trang 5 đặt toàn bộ `D·(27 + 273)` ở mẫu ; sửa thành `99720/(D·(27 + 273))`, đồng thời nhóm mẫu `2·10^-3` trong phân số kế tiếp, giữ D = 0,08 và đáp án A.
- [MAJOR] Câu 8 (Phần I): JSON ghi hai phân số `\frac{x - 273}{373 - 273}` và `\frac{x - 32}{212 - 32}`, renderer bỏ nhóm tử/mẫu ; PDF trang 5 ghi các hiệu nguyên vẹn trên/dưới vạch phân số ; sửa thành `(x - 273)/(373 - 273) = (x - 32)/(212 - 32)`, giữ x = 574,25 và đáp án C.
- [MAJOR] Câu 9 (Phần I): JSON ghi `\frac{2·10}{27 + 273}` và `\frac{p·40}{327 + 273}`, renderer tách các số hạng +273 ra ngoài phép chia ; PDF trang 5 ghi toàn bộ nhiệt độ Kelvin ở mẫu ; sửa thành `(2·10)/(27 + 273) = (p·40)/(327 + 273)`, giữ đáp án A.
- [MAJOR] Câu 10 (Phần I): JSON ghi `\frac{357 + 273}{27 + 273}`, renderer hiện `(357 + 273/27 + 273)` ; PDF trang 5 ghi tỉ số hai tổng ; sửa thành `(357 + 273)/(27 + 273)`, giữ 2,1 và đáp án C.
- [MAJOR] Câu 11 (Phần I): JSON ghi `\frac{p·5}{5 + 273}`, renderer hiện `(p·5/5 + 273)` ; PDF trang 5 ghi `p·5/(5 + 273)` ; sửa thành `(p·5)/(5 + 273)` trong lời giải; riêng nhiệt độ thiếu ở đề phải chờ quyết định nguồn bên dưới, giữ key A trong lúc review.
- [MAJOR] Câu 12 (Phần I): JSON ghi `\frac{0,8·5}{50 + 273}`, renderer hiện `(0,8·5/50 + 273)` ; PDF trang 5 đặt toàn bộ 50 + 273 ở mẫu ; sửa thành `(0,8·5)/(50 + 273)`, giữ T = 646 K và đáp án C.
- [MAJOR] Câu 13 (Phần I): JSON ghi `\frac{2}{20 + 273}` và `\frac{p}{42 + 273}`, renderer làm mất nhóm mẫu ; PDF trang 5 ghi hai tổng nhiệt độ Kelvin ở mẫu ; sửa thành `2/(20 + 273) = p/(42 + 273)`, giữ đáp án C.
- [MAJOR] Câu 14 (Phần I): JSON ghi `\frac{2}{27 + 273}`, renderer hiện `(2/27 + 273)` ; PDF trang 5 ghi mẫu là toàn bộ 27 + 273 ; sửa thành `2/(27 + 273)`, giữ ΔT = 75°C và đáp án B. Sai số dòng nhiệt độ trung gian của nguồn được ghi riêng bên dưới.
- [MAJOR] Câu 15 (Phần I): JSON ghi `\frac{pVM}{RT}` và các phân số `\frac{1}{7 + 273}`, `\frac{1}{17 + 273}`, renderer hiện mẫu tích/tổng không được nhóm ; PDF trang 6 ghi RT và các tổng tương ứng nằm trọn ở mẫu ; sửa thành `pVM/(RT)` và `1/(7 + 273) − 1/(17 + 273)`; giữ đáp án A, trình bày rõ bước đổi kg sang g.
- [MAJOR] Câu 17 (Phần I): JSON ghi `\frac{n_A/2 + n_B}{n_A + n_B}`, `\frac{n_A}{n_A + n_B}`, `\frac{2}{2 + 1}` và các phân số tương tự, renderer mất nhóm các tổng ; PDF trang 6 ghi đầy đủ các tổng trên/dưới vạch phân số ; sửa thành `(n_A/2 + n_B)/(n_A + n_B)`, `n_A/(n_A + n_B)`, `2/(2 + 1)` và tương tự cho khí B; nhóm mẫu `n_B M_B` ở tỉ số khối lượng. Giữ đáp án B.
- [MAJOR] Câu 4 (Phần II): JSON ghi `\frac{20 + 5}{2}` trong lời giải b, renderer hiện `(20 + 5/2)` ; PDF trang 8 ghi tổng 20 + 5 cùng ở tử ; sửa thành `(20 + 5)/2`, giữ 12,5 cm và b Đúng.
- [MAJOR] Câu 5 (Phần III): JSON ghi `\frac{t_0 - 15}{t_0 - 21}`, renderer hiện `(t_0 - 15/t_0 - 21)` ; PDF trang 9 ghi tỉ số hai hiệu ; sửa thành `(t_0 - 15)/(t_0 - 21)`, đồng thời sửa định nghĩa m₂ như finding trên, giữ key `30`.
- [MAJOR] Câu 6 (Phần III): JSON ghi các phân số có mẫu `T + ΔT`, `300 + ΔT` và tử `1 − 1/3`, `1 + 1/3`, renderer bỏ nhóm ; PDF trang 9 ghi toàn bộ các biểu thức này ở tử/mẫu ; sửa thành `p'(l_0 + l_0/3)/(T + ΔT)` và `(1 − 1/3)/300 = (1 + 1/3)/(300 + ΔT)`, giữ key `300`.

Đã kiểm hai ảnh: I.18 → `p02-1.png`, II.4 → `p03-1.png`, đúng câu và đầy đủ nhãn/kích thước. Không phát hiện lỗi chép lựa chọn hay đáp án.

Nguồn có vấn đề:

- **I.11, trang 1/5 — NEED_DECISION:** đề thực sự ghi “ở °C”, thiếu số. Hướng dẫn dùng `5 + 273`, chọn A = 1,14 atm. Xác nhận notes.md về lỗi nguồn; mã `i-01` trong ghi chú là nhầm, câu thực tế là `ly12-de20-i-11`. Phương án A: duyệt thêm **5°C** từ hướng dẫn, có ghi nhận đính chính. Phương án B: tạm loại câu/đề khỏi phát hành cho tới khi có bản đủ dữ kiện. Không tự suy ra rồi sửa đề.
- **I.14, trang 5 — NEED_DECISION:** ảnh hướng dẫn in `T₂ = 357 K ≈ 102°C` trong khi phép tính cho **375 K = 102°C**. JSON đã dùng 375 K (đúng phép tính), không chép con số in sai. Phương án A: xác nhận duyệt đính chính này, ghi nguồn có lỗi đảo chữ số. Phương án B: giữ trích dẫn nguồn cùng chú thích sửa lỗi, không lặp lại 357 K như một kết quả đúng. Key B không đổi.
- **I.18, trang 7:** nguồn viết `p_B = p_0 + h_B`, `p_C = p_0 − h_C` nhưng không định nghĩa h là áp suất tương đương của cột thủy ngân. Nếu h là chiều cao thì phải có ρg h. JSON chép đúng nguồn nhưng cần duyệt làm rõ quy ước hoặc bổ sung ρg; thứ tự áp suất/lực căng và key A vẫn đúng.
- **II.4, trang 8:** nguồn ghi p_A = 76 cm (thiếu Hg), và chiều dài l′_A = 190/91 **cmHg** (sai đơn vị chiều dài). JSON đã chuẩn hóa thành cmHg cho áp suất và cm cho chiều dài, hợp lí; nên ghi nhận đính chính khi duyệt.
- **I.4D, trang 1/4:** “biết đổi”, “vãn” là lỗi chính tả có sẵn, worker giữ nguyên theo notes.md. Có thể duyệt chuẩn hóa “biến đổi”, “vẫn”; không ảnh hưởng đáp án C.

## de21 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 9 (Phần I): JSON ghi `\uparrow`, `\downarrow` trong lời giải ; PDF trang 5 có các mũi tên tăng/giảm, renderer hiện nguyên lệnh ; sửa thành ký tự Unicode `↑`, `↓`, giữ hai cặp biến thiên và đáp án A.
- [MAJOR] Câu 10 (Phần I): JSON ghi `\frac{2,7}{-3 + 273}` và `\frac{p}{-3 + 27 + 273}`, renderer hiện `(2,7/-3 + 273)` và `(p/-3 + 27 + 273)` ; PDF trang 5 đặt nguyên các tổng ở mẫu ; sửa thành `2,7/(-3 + 273) = p/(-3 + 27 + 273)` nếu giữ trích dẫn nguồn; cách hiểu nhiệt độ cuối của nguồn còn cần quyết định bên dưới.
- [MAJOR] Câu 12 (Phần I): JSON ghi `\frac{12 + 273}{27 + 273}`, renderer bỏ nhóm hai tổng ; PDF trang 5 ghi phân số nhiệt độ Kelvin ; sửa thành `(12 + 273)/(27 + 273)`, giữ p₂ = 1,9·10⁵ Pa và đáp án B.
- [MAJOR] Câu 17 (Phần I): JSON ghi “áp suất tại điểm màu xanh = áp suất tại điểm màu đỏ” trong lời giải nhưng chỉ gắn hình đề `p02-1.png` không có hai điểm màu này ; PDF trang 6 có **hình lời giải riêng** đánh dấu hai điểm ; sửa thành bổ sung `public/exams/ly12/de21/p06-2.png` vào lời giải, hoặc mô tả rõ hai điểm cùng độ cao dưới piston và trong thủy ngân nhánh B, giữ phương trình/đáp án B.
- [MAJOR] Câu 1 (Phần II): JSON ghi `\sim` ở lời giải ý b và c ; PDF trang 7 ghi dấu quan hệ tỉ lệ ; sửa thành `∼` hoặc diễn đạt bằng chữ “tỉ lệ thuận”, giữ Sai/Đúng/Đúng/Sai. Renderer hiện nguyên `\sim`.
- [MINOR] Câu 2 (Phần II): JSON ghi `20\%` ở lời giải c ; PDF trang 7 ghi `20%` ; sửa thành `20%`, giữ c Đúng.
- [MAJOR] Câu 4 (Phần II): JSON ghi `\frac{2L·30 + L·15}{450}` ở lời giải c, renderer hiện `(2L·30 + L·15/450)` ; PDF trang 8 ghi toàn bộ `2L·30 + L·15` ở tử ; sửa thành `(2L·30 + L·15)/450`, giữ T₃ = 270 K và c Đúng.
- [MAJOR] Câu 2 (Phần III): JSON ghi `\frac{2}{127 + 273}` và `\frac{p}{127 - 100 + 273}`, renderer tách các số hạng ra ngoài phép chia ; PDF trang 8 ghi nguyên các tổng ở mẫu ; sửa thành `2/(127 + 273) = p/(127 - 100 + 273)`, giữ key `1,5`.
- [MAJOR] Câu 3 (Phần III): JSON ghi `\frac{2·2}{127 + 273}`, renderer hiện `(2·2/127 + 273)` ; PDF trang 9 ghi mẫu là toàn bộ 127 + 273 ; sửa thành `(2·2)/(127 + 273)`, giữ key `27`.
- [MAJOR] Câu 4 (Phần III): JSON ghi `\frac{10^5·11·10^-3}{21 + 273}`, renderer hiện tử chia 21 rồi cộng 273 ; PDF trang 9 ghi toàn bộ 21 + 273 ở mẫu ; sửa thành `(10^5·11·10^-3)/(21 + 273)`, giữ key `0,45`.
- [MAJOR] Câu 6 (Phần III): JSON ghi `\frac{500·(60 - 50)}{100·(60 - t)}` và `\frac{50 - 20}{t - 20}`, renderer làm mất nhóm mẫu tích/tử hiệu ; PDF trang 9 ghi hai phân số với nhóm đầy đủ ; sửa thành `(500·(60 - 50))/(100·(60 - t)) = (50 - 20)/(t - 20)`, giữ key `35`.
- [MINOR] Câu 1 (Phần III): JSON ghi lời giải và đáp án −46 nhưng bỏ chú ý về quy tròn khi dùng 273 hay 273,15 ; PDF trang 8 có chú ý này ngay sau đáp án ; sửa thành bổ sung chú ý tương ứng để giữ đủ hướng dẫn nguồn, không đổi key `-46`.

Đã kiểm năm ảnh đề: I.17 → `p02-1.png`, I.18 → `p02-2.png`, II.2 → `p02-3.png`, II.3 → `p03-1.png`, II.4 → `p03-2.png`: đúng câu, đầy đủ dữ kiện. III.2–3 và III.4–5 đều có đoạn chung trong từng câu, đúng như notes.md. Hình phụ của lời giải I.17 là thiếu sót riêng đã nêu.

Nguồn có vấn đề:

- **I.10, trang 1/5 — NEED_DECISION:** đề nói nhiệt độ “tăng lên 27°C” (thông thường là nhiệt độ cuối 27°C), nhưng hướng dẫn dùng −3 + 27 + 273, tương ứng **tăng thêm** 27°C, nhiệt độ cuối 24°C. Hai cách lần lượt cho 3 atm và 2,97 atm; nguồn làm tròn đều chọn A = 3 atm. JSON chép đúng mâu thuẫn nguồn. Phương án A: duyệt giữ đề, sửa lời giải dùng T₂ = 300 K. Phương án B: duyệt sửa chữ “tăng thêm 27°C”, giữ phép tính 2,97 ≈ 3 atm. Không tự chọn.
- **I.17, trang 2/6:** đơn vị p₀ của PDF in N/m, thiếu số mũ 2; JSON dùng N/m², phù hợp giá trị áp suất và phép tính. Đề nghị ghi nhận đính chính nguồn.
- **II.4d, trang 8:** sau khi đã tính p₄ = 0,6·10⁵ Pa, dòng cân bằng lực của PDF vẫn dùng ký hiệu p₁, trong khi dòng thế số dùng p₄. JSON giữ nhầm ký hiệu này. Đề nghị duyệt sửa p₁ thành p₄ ở phương trình giai đoạn cuối; không đổi F₂ = 90 N hay đáp án d Đúng.
- **III.3, trang 3/9:** “Bây giờ” sau câu 2 có thể gây hiểu là tiếp tục từ trạng thái đã giảm nhiệt; hướng dẫn lại tính từ dữ kiện chung 2 atm, 127°C. JSON giữ đúng nguồn. Phương án A: duyệt thêm “Từ trạng thái ban đầu 2 atm, 127°C” để rõ key 27. Phương án B: xin tác giả xác nhận chuỗi quá trình trước khi sửa dữ kiện/đáp án. Không dùng kết quả câu 2 để tự đổi key.

## Bằng chứng kiểm tra và giới hạn

**Kiểm tra chạy thật, không ghi ngoài scope:** PowerShell here-string truyền vào `node --input-type=module -`, dùng `node:test`, `node:assert/strict`, `parseExam` thật và `renderMathText` thật được trích từ source vào `node:vm`. 21 tests: **exit=1, pass=17, fail=4, skip=0**. Mỗi đề có 5 ca: schema, cấu trúc 18–4–6/thời gian 50 phút, đối chiếu đáp án đủ ba phần, tồn tại ảnh tham chiếu, renderer không để sót cú pháp thô; de19 thêm một ca câu III.6 đủ đoạn dữ kiện chung. Bốn ca fail: renderer de18 (2 trường), renderer de19 (1 trường), de19 III.6 thiếu ngữ cảnh, renderer de21 (4 trường). Ca renderer de20 pass chỉ có nghĩa không còn cú pháp thô; **không** phát hiện được mất ngoặc phân số. Probe riêng đã chạy, in chính HTML của tất cả phân số có tổng/hiệu để xác minh các findings mất nhóm trên.

Lệnh tái lập bộ 21 ca (chạy tại D:\Cunata; không tạo file test):

```powershell
@'
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseExam} from './src/schema/exam.ts';
const src=readFileSync('src/app/main.ts','utf8');
const math=src.slice(src.indexOf('function renderMathText('),src.indexOf('\nfunction getStorageKey')).replace('text?: string): string','text)');
const c={}; vm.createContext(c);
vm.runInContext("function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;');}\n"+math,c);
for(const tag of ['de18','de19','de20','de21']){
 const raw=readFileSync(`public/exams/ly12/${tag}.json`,'utf8');
 const d=JSON.parse(raw),r=JSON.parse(readFileSync(`ops/exams/work/${tag}/answers_from_text.json`,'utf8'));
 test(tag+' schema',()=>assert.equal(parseExam(d).ok,true));
 test(tag+' shape/settings',()=>{assert.deepEqual(['I','II','III'].map(k=>d.questions.filter(q=>q.kind===k).length),[18,4,6]);assert.equal(d.settings.durationMinutes,50)});
 test(tag+' answer mapping I/II/III',()=>{
  assert.deepEqual(d.questions.filter(q=>q.kind==='I').map(q=>q.options.find(o=>o.optionId===q.correctOptionId).label),r.part1);
  assert.deepEqual(d.questions.filter(q=>q.kind==='II').flatMap(q=>q.statements.map(s=>[s.label,s.answer])),r.part2_marks);
  assert.deepEqual(d.questions.filter(q=>q.kind==='III').map(q=>q.answerKey),r.part3);
 });
 test(tag+' referenced images exist',()=>{for(const m of raw.matchAll(/public\/exams\/ly12\/[A-Za-z0-9_./-]+\.png/g))assert.ok(existsSync(m[0]),m[0])});
 const issues=[];
 for(const q of d.questions){
  const fields=[['content',q.content],['explanation',q.explanation],...(q.options??[]).map(o=>['option '+o.label,o.text]),...(q.statements??[]).flatMap(s=>[['statement '+s.label,s.text],['explanation '+s.label,s.explanation]])];
  for(const [field,s] of fields){if(!s)continue;const html=c.renderMathText(s);if(/\\|\^|_/.test(html.replace(/<img[^>]*>/g,'')))issues.push(q.questionVersionId+' '+field+': '+html);}
 }
 console.log(tag+' residual formula diagnostics: '+JSON.stringify(issues));
 test(tag+' actual renderer leaves no raw math syntax',()=>assert.equal(issues.length,0,issues.map(s=>s.slice(0,140)).join('\n')));
 if(tag==='de19')test(tag+' III6 includes shared setup independently',()=>{const q=d.questions.find(q=>q.questionVersionId.endsWith('iii-06'));assert.ok(/340000/.test(q.content)&&/2100/.test(q.content)&&/4200/.test(q.content)&&/50/.test(q.content),'Missing shared masses, temperatures and thermal constants from PDF pages 3/8')});
}
'@ | node --input-type=module -
```

Typecheck chạy thật:

- `npx --no-install tsc -p tsconfig.json` → **exit=1**, `src/app/main.ts(1130,30): error TS2532: Object is possibly 'undefined'.`
- `npx --no-install tsc -p tsconfig.web.json` → **exit=1**, cùng lỗi TS2532 tại (1130,30).

Hai lỗi typecheck thuộc source ứng dụng ngoài scope, không sửa và không tuyên bố gate xanh. Không chạy `ops/exams/check.mjs`/`browser_check.mjs` vì chúng ghi `check.json`/`browser.json` ngoài scope; phần schema/key/asset được kiểm lại read-only như trên. Browser thật: **NOT_RUN**, chỉ kiểm hàm renderer thật trong Node, chưa xác nhận layout mobile/desktop, ảnh trong báo cáo tải về hay toàn luồng thi. Full app suite/build: **NOT_RUN**, task chỉ review tài liệu/dữ liệu, build có thể ghi dist ngoài scope. Không có câu CHƯA soát trong bốn đề; phạm vi chưa kiểm là hành vi trình duyệt, không phải việc đọc câu/ảnh nguồn.

Snapshot SHA-256 của JSON đã soát:

| Đề | SHA-256 |
| --- | --- |
| de18 | `2d396aa75de44c31686725b8259d88ad8cedfc8f66aa251c5a07b44fd1ca3dbd` |
| de19 | `d7fd7de0f09dad60c0133e3edf34d7c6e6ed19edbb4d88e6d7bf15888591dede` |
| de20 | `4e2ab265fe17581793d5173e8b45dce4452a1e8fef9ccbf93e06b5ed09cd7d33` |
| de21 | `ad29502b23f59d0b3466add83b03533aae369aca5f5228282b58757478e6394c` |

Khuyến nghị bàn giao: **NEED_DECISION** cho các lỗi/thiếu dữ kiện của PDF; đồng thời trả worker sửa các findings chuyển đổi/hiển thị đã chứng minh. Chưa phê duyệt bốn đề để phát hành từ báo cáo này. Không tự thay quyết định nghiệp vụ bằng đáp án suy diễn.

QA báo cáo: kiểm tra read-only bằng Python qua stdin, exit=0: đủ 4 tiêu đề verdict, 4 mục “Nguồn có vấn đề”, **36 findings** đúng khuôn máy đọc; cả 4 SHA-256 JSON vẫn khớp snapshot. Đã trích và chạy lại chính code block 21 tests trong báo cáo, xác nhận lặp lại exit=1, pass=17, fail=4, skip=0. Các thao tác của reviewer chỉ tạo/sửa file báo cáo này.
