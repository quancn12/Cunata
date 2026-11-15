# IMP-AUDIT-B — Đối chiếu de14–de17

Reviewer: Codex. Ngày kiểm: 16/11/2026. Baseline HEAD: `3d5e868af9b7c1a0748bb412e6efbb5886caa3a2`. Working tree có thay đổi của các task khác; không sửa đề, không commit, không build/deploy.

Đã đối chiếu **112/112 câu**: mỗi đề I.1–18, II.1–4 (đủ 16 ý), III.1–6. Đã trực tiếp xem **35 ảnh trang**: de14 p01–p08, de15 p01–p09, de16 p01–p10, de17 p01–p08; xem thêm toàn bộ **22 hình cắt khác nhau** được các JSON tham chiếu. Đã kiểm nội dung, thứ tự phương án/ý, đáp án theo ID/nhãn, công thức, đơn vị, hình và nội dung hướng dẫn. Không có câu CHƯA soát. Số câu trong findings dùng **số trong từng phần của PDF**; kèm số liên tục của JSON khi cần tránh nhầm.

Nguồn: `ops/exams/work/deNN/{pages/pXX.png,pdf_text.txt,answers_from_text.json,source.txt}` và `notes.md` của de14, de15, de17. **de16 không có notes.md** tại thời điểm kiểm. Cả bốn `source.txt` đều trỏ tới PDF tồn tại, tên `Đề số NN hàng tuần.pdf` trong thư mục `D:\vậtlí12\0. BÁN ĐỀ LÝ 12 HÀNG TUẦN(CÒN CẬP NHẬT)\0. BÁN ĐỀ LÝ 12 HÀNG TUẦN(CÒN CẬP NHẬT)\`. Ảnh trang là căn cứ chính; đáp án trích tự động chỉ dùng đối chiếu bổ sung.

SHA-256 của bốn JSON được kiểm:

| Đề | SHA-256 |
| --- | --- |
| de14 | `a7213aa4d07eaa7ef7687ade39319a0095e89c4c782ba04537efb73500931aa2` |
| de15 | `6dfc64f5012816865fb44d4a668c8a6a71a8245658486c3a6571e37e8d2f8be1` |
| de16 | `17763c63884e2170a2ef3ccdbfe617ecb308bc952e3c47ba71aa3a7c480be655` |
| de17 | `290b4199a7d5f4f39d2aa10d9b4393e79f7cea54b4739ea823de91ba93b90735` |

## de14 — verdict: CHANGES_REQUESTED

- [MINOR] Câu 2 (Phần II): JSON ghi các ý theo thứ tự `b,a,c,d` ở câu liên tục 20 (`ly12-de14-ii-02.statements`); PDF trang 2 và 6 ghi đề bài theo thứ tự `a,b,c,d`, chỉ phần hướng dẫn giải b trước a; sửa thành thứ tự `a,b,c,d`, giữ nguyên statementId, nội dung và đáp án gắn với từng ý: a Sai, b Đúng, c Đúng, d Đúng. Không đảo nội dung đề theo thứ tự xuất hiện của lời giải để vượt checker so sánh theo vị trí.
- [MINOR] Câu 2 (Phần II): JSON ghi “cùng một khối lượng khí” trong content của câu liên tục 20; PDF trang 2 và 6 ghi “cùng một chất khí”; sửa thành “cùng một chất khí”, giữ dữ kiện nhiệt độ theo hình và ghi chú phần ký hiệu bị thiếu trong bản nguồn nếu biên tập bổ sung. `notes.md` nói giữ nguyên “là là” nhưng JSON thực tế đã bỏ một từ “là”; cần phân biệt bản chép với bản hiệu đính, không coi notes là chứng cứ khớp nguyên văn.

Đã kiểm đáp án I.1–18: `B D A A D C C D C D A C A A C C A D`; II.1–4 theo nhãn a,b,c,d: `SĐĐĐ / SĐĐĐ / SSĐĐ / ĐĐĐĐ`; III.1–6: `200; 73,1; 0,67; 1,06; 138; 6`. Tất cả đáp án khớp hướng dẫn PDF. Ngoài hai finding trên, không thấy sai lệch nội dung có ý nghĩa ở các câu còn lại. Ba hình đúng câu: I.16, II.2, II.4; đủ trục, nhãn và số liệu cần dùng. Các lời giải tương đương nội dung hướng dẫn, không phát hiện thêm dữ kiện hoặc kết quả bịa.

Nguồn có vấn đề:

- II.2, trang 2 và 6: câu dẫn lặp “là là” và để trống ký hiệu nhiệt độ trước “và T₂”; hình vẫn ghi đủ T₁, T₂. Đề xuất Trưởng phòng chọn A: giữ văn bản nguồn kèm chú thích thiếu ký hiệu; hoặc B: duyệt hiệu đính thành “ở các nhiệt độ T₁ và T₂ khác nhau”, bỏ từ lặp. Việc hướng dẫn trình bày b trước a là thứ tự giải thích, không phải lỗi đáp án của PDF.
- I.18, trang 2, 5–6: nguồn ghi “Coi nhiệt độ truyền ra ngoài môi trường…”, trong khi đại lượng truyền là nhiệt lượng. Đề xuất A: giữ nguyên kèm chú thích; hoặc B: duyệt đổi “nhiệt độ” thành “nhiệt lượng”; không đổi đáp án D.
- III.2, trang 3 và 7: công thức tuổi có ký tự `$(` thừa trong bản in. JSON đã làm sạch; đề xuất duyệt đây là hiệu đính ký tự, giữ công thức và đáp án `73,1` của nguồn. Không phát hiện mâu thuẫn đáp án–lời giải cần đổi key.

## de15 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 1 (Phần I): JSON ghi `$N = nN_A = (/)N_A$` trong explanation (`ly12-de15-i-01`); PDF trang 4 ghi `N = nN_A = (m/M)N_A`; sửa thành `$N = nN_A = \frac{m}{M}N_A$`, giữ chọn C.
- [MAJOR] Câu 3 (Phần I): JSON ghi `$μ = (/)$` trong explanation (`ly12-de15-i-03`); PDF trang 4 ghi `V tăng ⇒ μ = N/V giảm`; sửa thành `$V$ tăng $⇒ μ = \frac{N}{V}$ giảm`, giữ chọn C.
- [MAJOR] Câu 11 (Phần I): JSON ghi `Đẳng tích: $(/) = (/) = (/) ⇒ T = 400$ K` (`ly12-de15-i-11.explanation`); PDF trang 5 ghi bảng trạng thái p,T và 21p/20,T+20, sau đó `p/T = const ⇒ p/T = (21p/20)/(T+20) ⇒ T = 400 K`; sửa thành đủ quan hệ `$p/T =$ const`, `$\frac{p}{T} = \frac{21p/20}{T+20} ⇒ T = 400$ K`, không để phân số rỗng, giữ chọn B.
- [MINOR] Câu 14 (Phần I): JSON ghi `$m_{kl} c_{kl} (t_{kl} - t) = ...$` (`ly12-de15-i-14.explanation`); PDF trang 6 ghi các chỉ số kl ở dưới m,c,t; sửa thành ký pháp renderer hiện tại hỗ trợ như `$m_kl c_kl (t_kl - t) = m_n c_n (t - t_n)$`. Hàm `renderMathText` ở index.html hiện để nguyên `_{kl}`, đã tái hiện bằng chính hàm lấy từ source; kết quả 752°C và chọn C vẫn đúng.
- [MAJOR] Câu 15 (Phần I): JSON ghi `(/)` chín lần trong explanation, làm mất p₀/T₀, p/T, p/p₀ và toàn bộ tử/mẫu của bốn tỉ số; PDF trang 6 ghi `p₀/T₀ = p/T`, `T = (p/p₀)T₀`, các tỉ số `260/244 ≈ 1,066`, `264/244 ≈ 1,082`, `268/252 ≈ 1,063`, `264/248 ≈ 1,065`, và kết luận lốp sau bên trái có p/p₀ nhỏ nhất; sửa thành đủ các phân số đó, giữ chọn C. Hai lỗi chữ trong chính lời giải nguồn được liệt kê ở “Nguồn có vấn đề”, không tự đưa phát biểu vật lí sai trở lại JSON.
- [MINOR] Câu 16 (Phần I): JSON ghi hình `public/exams/ly12/de15/p02-2.png` có thêm các nét chữ bị cắt ở mép trên; PDF trang 2 ghi hình hai ống với nhãn 40 cm³, x cm³, Hình a, Hình b, phần chữ phía trên thuộc câu dẫn; sửa thành ảnh cắt gọn đúng vùng hình, giữ đủ các nhãn và mực thủy ngân. Đây là đề nghị giao lại worker có scope ảnh; audit này không sửa ảnh ngoài scope.
- [MAJOR] Câu 18 (Phần I): JSON ghi `p_1' = (/)`, `p_2' = (/)`, `p' = p_1' + p_2' = (/)` (`ly12-de15-i-18.explanation`); PDF trang 7 ghi `p₁′ = p₁/4`, `p₂′ = 3p₂/4`, `p′ = (p₁+3p₂)/4`; sửa thành đủ ba phân số tương ứng, giữ các phương trình Boyle và Dalton cùng chọn A.
- [MINOR] Câu 1 (Phần II): JSON ghi “chuyển đông nhiệt” ở ý a và “các phân từ” ở ý b (`ly12-de15-ii-01`); PDF trang 2 và 7 ghi “chuyển động nhiệt”, “các phân tử”; sửa thành đúng hai cụm từ nguồn, giữ đáp án a Sai, b Đúng.
- [MINOR] Câu 2 (Phần II): JSON ghi thứ tự ý `a,c,d,b` ở câu liên tục 20 (`ly12-de15-ii-02.statements`); PDF trang 3 và 7 ghi đề bài theo `a,b,c,d`, phần hướng dẫn mới gom a,c,d trước b; sửa thành thứ tự `a,b,c,d`, giữ nguyên ID và key từng ý là a Sai, b Đúng, c Sai, d Sai. `notes.md` xác nhận worker chủ động đổi thứ tự để khớp checker; đó không phải thứ tự của đề nguồn.
- [MAJOR] Câu 2 (Phần II): JSON ghi `$D = (/)$` trong explanation ý a và `$p = C · (/)$` trong explanation ý b (`ly12-de15-ii-02`); PDF trang 7 ghi `D = m/V`, `p = const · 1/V`; sửa thành `$D = \frac{m}{V}$` và `$p = C · \frac{1}{V}$`, giữ lập luận a,c,d Sai và b Đúng theo đồ thị p–1/V.
- [MAJOR] Câu 3 (Phần II): JSON ghi `Quá trình đẳng áp: $(/) = (/) ⇒ (/) = (/) ⇒ V_2 = 100$ cm³` trong explanation ý c (`ly12-de15-ii-03`); PDF trang 7 ghi `V/T = const ⇒ 140/420 = V₂/300 ⇒ V₂ = 100 cm³`, bảng có 147+273=420 K và 27+273=300 K; sửa thành đủ các nhiệt độ và phân số trên, giữ c Đúng.
- [MAJOR] Câu 4 (Phần II): JSON ghi `p_b = p_0 + (/) = 10^5 + (/)` và tương tự p_c trong explanation ý b,c (`ly12-de15-ii-04`); PDF trang 8 ghi `p_b = p₀ + m_gx g/S = 10⁵ + (6·10)/(30·10⁻⁴) = 1,2·10⁵ Pa`, `p_c = p₀ + (m_gx+m_hs)g/S = 10⁵ + ((6+24)·10)/(30·10⁻⁴) = 2·10⁵ Pa`; sửa thành đủ công thức và các phân số số học này, giữ b,c Đúng.
- [MAJOR] Câu 2 (Phần III): JSON ghi `Đẳng tích: $(/) = (/) ⇒ (/) = (/) ⇒ T_2 = 330$ K` ở câu liên tục 24; PDF trang 8 ghi `p/T = const ⇒ 2/(27+273) = 2,2/T ⇒ T = 330 K ≈ 57°C`; sửa thành quan hệ đẳng tích và hai phân số đầy đủ, giữ answerKey `57`.
- [MAJOR] Câu 3 (Phần III): JSON ghi `$Q = mcΔt ⇒ (/) = (/) ⇒ 1 = (/) · (/) · 2 ⇒ (/) = (/) ≈ 0,7$` ở câu liên tục 25; PDF trang 8 ghi `Q_A/Q_B = (m_A/m_B)(c_A/c_B)(Δt_A/Δt_B) ⇒ 1 = (3/4)(c_A/c_B)·2 ⇒ c_A/c_B = 2/3 ≈ 0,7`; sửa thành đủ từng tử/mẫu và các tỉ số trên, giữ answerKey `0,7`.
- [MAJOR] Câu 4 (Phần III): JSON ghi `Đẳng tích: $(/) = (/) ⇒ T = 800$ K` ở câu liên tục 26; PDF trang 8 ghi bảng p,T và p+p/40=1,025p,T+20, rồi `p/T = const ⇒ p/T = 1,025p/(T+20) ⇒ T = 800 K`; sửa thành đầy đủ phương trình `$\frac{p}{T} = \frac{1,025p}{T+20} ⇒ T = 800$ K`, giữ answerKey `800`.

Đã kiểm đáp án I.1–18: `C C C B B A A C B B B B A C C D B A`; II.1–4 theo a,b,c,d: `SĐSS / SĐSS / ĐĐĐS / SĐĐS`; III.1–6: `20; 57; 0,7; 800; 118; 10`. Tất cả key khớp hướng dẫn PDF theo nhãn; lỗi chính là mất công thức trong lời giải, không phải sai key. Có **39 dấu `(/)` trong 13 trường explanation thuộc 11 câu**. Phóng to riêng trang 9 xác nhận nhiệt dung riêng nước đá ở III.6 là **2100 J/kgK**, khớp JSON; không có finding đổi số này. Sáu hình đúng câu I.15, I.16, I.17, II.2, II.3, II.4; finding I.16 chỉ là mép crop.

Nguồn có vấn đề:

- I.3, trang 1 và 4: nguồn ghi “Khí giãn nở khí đẳng nhiệt”, lỗi từ; I.5 ghi “Đặc điểm nào sao đây…”. JSON giữ theo nguồn. Đề xuất A: giữ nguyên có chú thích; B: duyệt sửa lần lượt “khi đẳng nhiệt”, “sau đây”.
- I.8, trang 5: lời giải nguồn lặp phát biểu “tốc độ… càng lớn thì thể tích… càng cao” ngay dưới câu hỏi tìm phát biểu sai, không đưa ra cách sửa phát biểu đó; JSON chép đúng lỗi này. Đề xuất A: giữ nguyên và ghi rõ đây là phát biểu bị bác bỏ; B: duyệt bổ sung giải thích đúng về liên hệ tốc độ chuyển động nhiệt và nhiệt độ. Không đổi chọn C chỉ vì lời giải nguồn diễn đạt sai.
- I.13, trang 5: bảng lời giải ghi `75+5=80 mmHg` dù dùng 75 cmHg và chiều dài 5 cm; phương trình và đáp án 112,5 mm dùng giá trị theo cmHg. Đề xuất A: giữ bản gốc kèm cảnh báo đơn vị; B: duyệt sửa đơn vị trong bảng thành cmHg. JSON đã bỏ bảng và dùng cmHg đúng; cần ghi nhận hiệu đính này.
- I.15, trang 6: nguồn ghi “p/p₀ càng nhỏ thì T càng lớn”, trái với ngay công thức `T=(p/p₀)T₀`; dòng `264/248` còn ghi nhầm “lốp sau bên trái”, trong khi hình là bên phải. JSON đã sửa thành “T càng nhỏ” và “lốp sau bên phải”. Đề xuất A: duyệt hai hiệu đính có căn cứ này, bổ sung lại các phân số theo finding; B: giữ trích nguồn với chú thích hai lỗi. Đáp án C vẫn phù hợp số liệu hình. Không tự đổi key.
- I.16, trang 2 và 6: nguồn in “ống thử tình”; JSON giữ nguyên. Đề xuất A: giữ có chú thích; B: duyệt sửa “ống thủy tinh”.
- II.2, trang 3 và 7: nguồn gọi đại lượng trục ngang là “một phần thể tích V” nhưng hình ghi 1/V. Đề xuất A: giữ chữ và bổ sung chú thích trục 1/V; B: duyệt sửa thành “nghịch đảo thể tích 1/V”. Việc thứ tự lời giải là a,c,d,b không làm đổi thứ tự đề a,b,c,d.
- Các điểm trong notes.md đã được đối chiếu: lỗi chính tả I.16, thứ tự II.2, sáu key phần III. Không có ghi chú nguồn nào bị dùng để miễn kiểm tra ảnh.

## de16 — verdict: CHANGES_REQUESTED

- [MINOR] Câu 5 (Phần III): JSON ghi `$Q_{nc} = mλ ...$` trong explanation ở câu liên tục 27 (`ly12-de16-iii-05`); PDF trang 10 ghi Q có chỉ số dưới nc; sửa thành ký pháp renderer hiện tại hỗ trợ như `$Q_nc = mλ ⇒ (42 - 22) · 10^3 = m · 0,25 · 10^5 ⇒ m = 0,8$ kg`. Đã tái hiện `Q_{nc}` còn nguyên trong HTML sinh từ chính hàm `renderMathText` của index.html; dữ kiện, phép tính và answerKey `0,8` vẫn đúng.

Đã kiểm đáp án I.1–18: `C A B C D C D C A A C B B B A B C A`; II.1–4 theo a,b,c,d: `SĐĐĐ / ĐSĐS / SSSS / SĐĐĐ`; III.1–6: `70; 327; 116; 1,75; 0,8; 126`. Tất cả key khớp hướng dẫn PDF. Bảng I.6 giữ đủ năm chất và số liệu; các lời giải II.4 giữ đủ quan hệ thể tích, khối lượng và cân bằng nhiệt của bản nguồn. Sáu hình đúng câu I.9, I.17, II.1, II.2, II.4 và III.5–6 (hình dùng chung, đã được nhúng vào cả hai câu). Không thiếu hình dù `assets` là mảng rỗng: các đường dẫn ảnh nằm trực tiếp trong content và đã hiển thị trong lượt kiểm trình duyệt root.

Nguồn có vấn đề:

- III.3, trang 3 và 10: bản in ghi nhiệt dung riêng đồng `380 K/kgK`; đơn vị nhiệt dung riêng cần J/(kg·K), hướng dẫn vẫn dùng hệ số 380 để tính 116 s. JSON đã ghi J/kgK. Đề xuất A: duyệt hiệu đính đơn vị có chú thích; B: giữ bản in kèm cảnh báo đơn vị sai. Không đổi key `116`.
- I.16, trang 2 và 7: nhiệt độ đầu ghi `20°` thiếu chữ C; lời giải dùng 100−20 theo Celsius, JSON cũng giữ `20°`. Đề xuất A: giữ có chú thích; B: duyệt bổ sung C.
- III.5–6, trang 4 và 10: câu dẫn dùng chung bị cụt “Sử dụng các thông tin sau cho Câu 5 và Đồ thị…”, và trục nhiệt độ chỉ ghi 436 ở vạch trên; hướng dẫn III.6 dùng Δt=218. JSON làm rõ hai câu dùng chung hình và giữ nguyên Δt=218 theo hướng dẫn, không chế nhãn trục mới. Đề xuất A: giữ hình với chú thích cách đọc các khoảng chia; B: duyệt bổ sung nhãn nhiệt độ vào nguồn/hình trước phát hành nếu cần loại bỏ sự mơ hồ. Không tự tạo dữ kiện trục mới trong đợt sửa JSON.

## de17 — verdict: OK

Đã soát đủ 28/28 câu và từng phương án/ý, không có finding chuyển đổi phải sửa. Đáp án I.1–18: `D A C A C B D A C B C C B C C A D A`; II.1–4 theo a,b,c,d: `SSĐĐ / ĐĐSĐ / SĐSS / SĐSS`; III.1–6: `117; 6; 176; 4,75; 702; 58`. Key, dữ kiện, bảng I.13 và công thức phù hợp ảnh PDF. Bảy hình đúng câu I.13, I.18, II.1, II.3, III.2, III.4, III.5, đủ nội dung cần dùng. Lời giải có diễn giải lại và khai triển bước tính nhưng không thêm giả thiết hoặc kết quả không có căn cứ trong hướng dẫn. `notes.md` đã được kiểm lại bằng ảnh, không lấy tuyên bố “100%” làm bằng chứng độc lập.

Nguồn có vấn đề:

- III.6, trang 3 và 8: nguồn gọi cả hệ số 4,2 J/gK và 2,1 J/gK là “nhiệt dung riêng của nước”; lời giải dùng 2,1 cho nước đá. JSON đã làm rõ hệ số thứ hai là “của nước đá”. Đề xuất A: duyệt đây là hiệu đính tên chất, giữ key `58`; B: giữ nguyên câu nguồn và thêm chú thích nước đá. Đây không phải thay số/đáp án của bản chuyển.
- I.3, trang 1 và 4: nguồn ghi “thang do Kelvin”, JSON giữ theo nguồn. Đề xuất A: giữ nguyên; B: duyệt sửa chính tả thành “thang đo Kelvin”. Không ảnh hưởng chọn C. Không phát hiện mâu thuẫn key–hướng dẫn ở đề này.

### Kiểm tra đã chạy và giới hạn

Môi trường Windows/PowerShell, Node `v24.14.0`. Không cài dependency. Các lượt chạy checker được nạp vào bộ nhớ bằng `node --input-type=module - de14 de15 de16 de17`; chỉ bỏ lệnh ghi `check.json`/`browser.json` để không sửa file ngoài scope. Với `check.mjs`, thay ROOT suy từ import.meta.url bằng process.cwd(); với `browser_check.mjs`, chuyển hai import harness/app sang file URL tuyệt đối. Không đổi assertions hoặc dữ liệu đầu vào. Các báo cáo cũ trong work không phải evidence của lượt này.

| Kiểm tra | Lệnh/chế độ | Kết quả thật |
| --- | --- | --- |
| Checker sẵn có | `ops/exams/check.mjs de14 de15 de16 de17`, chạy trong bộ nhớ, không ghi check.json | exit=0; pass=4 đề, fail=0 |
| Browser thật, Chrome/Edge headless qua harness CDP sẵn có | `ops/exams/browser_check.mjs de14 de15 de16 de17`, chạy trong bộ nhớ, không ghi browser.json | exit=0; pass=4 đề, fail=0; nạp JSON, ảnh tải được, làm theo key JSON, nộp và đọc điểm từng phần/tổng |
| Schema/fixtures | `node --test --test-reporter=tap test/schema/exam.test.ts test/schema/fixtures.test.ts` | exit=0; tests=28, pass=28, fail=0, skip=0 |
| Kiểm độc lập dữ liệu, mã ở dưới | `node --input-type=module -` | exit=1; tests=16, pass=13, fail=3, skip=0: thứ tự II của de14, de15 và phân số rỗng của de15 |
| Chẩn đoán formatter | Lấy nguyên `renderMathText` từ index.html, thực thi bằng node:vm và kiểm kết quả | exit=0 (lệnh chẩn đoán); tìm thấy chỉ số ngoặc nhọn chưa render ở de15 I.14 và de16 III.5; không phải test PASS về nội dung |
| Kiểm báo cáo và snapshot đầu vào | Python stdin kiểm 4 tiêu đề, 4 mục nguồn, cấu trúc từng finding và SHA-256 bốn JSON | exit=0; 18 findings: BLOCKER=0, MAJOR=11, MINOR=7; cả bốn JSON giữ nguyên hash đã kiểm |
| Typecheck domain/config chung | `npx --no-install tsc -p tsconfig.json` | exit=1; TS2532 `src/app/main.ts(1130,30): Object is possibly 'undefined'.` |
| Typecheck web | `npx --no-install tsc -p tsconfig.web.json` | exit=1; cùng TS2532 tại main.ts:1130:30 |
| Build/full suite/browser dist/mobile/offline/download | NOT_RUN | Audit dữ liệu; build có ghi ngoài scope, các luồng rộng hơn không nằm trong kiểm này. Không suy kết quả dist/offline từ browser root. |

Checker sẵn có kiểm key phần II theo **vị trí xuất hiện trong lời giải**, bỏ qua nhãn; do đó việc đảo ý giúp cả checker và browser “làm theo key JSON” đạt nhưng không chứng minh thứ tự trung thành PDF. Cả hai checker cũng không phát hiện `(/)` vì đó không còn là mã LaTeX. Hai chỉ số ngoặc nhọn không nằm trong regex phát hiện công thức thô của browser_check. Vì vậy kết quả xanh của chúng không bác bỏ findings.

Mã kiểm độc lập đã chạy trực tiếp qua stdin, không tạo test file ngoài scope:

```js
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {test} from 'node:test';
for (const tag of ['de14', 'de15', 'de16', 'de17']) {
  const e = JSON.parse(readFileSync(`public/exams/ly12/${tag}.json`));
  const ref = JSON.parse(readFileSync(`ops/exams/work/${tag}/answers_from_text.json`));
  test(`${tag}: source keys by labels, not extraction position`, () => {
    const I = e.questions.filter(q => q.kind === 'I');
    const II = e.questions.filter(q => q.kind === 'II');
    const III = e.questions.filter(q => q.kind === 'III');
    assert.deepEqual(I.map(q => q.options.find(o => o.optionId === q.correctOptionId).label), ref.part1);
    II.forEach((q, k) => {
      const byLabel = new Map(ref.part2_marks.slice(k * 4, k * 4 + 4));
      q.statements.forEach(s => assert.equal(s.answer, byLabel.get(s.label)));
    });
    assert.deepEqual(III.map(q => q.answerKey), ref.part3);
  });
  test(`${tag}: figure references exist`, () => {
    for (const m of JSON.stringify(e.questions).matchAll(/public\/exams\/ly12\/[\w/.-]+\.png/g))
      assert(existsSync(m[0]));
  });
  test(`${tag}: original II label order`, () => {
    for (const q of e.questions.filter(q => q.kind === 'II'))
      assert.deepEqual(q.statements.map(s => s.label), ['a', 'b', 'c', 'd']);
  });
  test(`${tag}: no empty fraction placeholder`, () => {
    assert(!JSON.stringify(e.questions).includes('(/)'), 'Found (/) instead of PDF fraction');
  });
}
```

Kiểm theo nhãn tự động khớp 4/4 đề; kết luận key phù hợp PDF còn dựa trên việc đã trực tiếp xem từng trang hướng dẫn. Chưa chứng nhận nội dung nguồn hoàn toàn đúng khoa học hoặc được Trưởng phòng nghiệm thu. Các hiệu đính nguồn cần Trưởng phòng chọn cách xử lý như các phương án tại từng mục; chưa tự duyệt sửa nguồn. Lỗi typecheck thuộc source ngoài scope và không được sửa trong task này.
