# IMP-AUDIT-D — Soát độc lập de22–de25

Reviewer: Codex. Ngày: 2026-11-16. Working tree: `D:\Cunata`.
Base/head đã đọc: `3d5e868af9b7c1a0748bb412e6efbb5886caa3a2`.
Requirements: prompt IMP-AUDIT-D, Shared Product Contract v2.0, WEB-contract (kể cả các quyết định bổ sung).

Đã soát 112/112 câu: mỗi đề I.1–18, II.1–4 (16 ý), III.1–6. Trong báo cáo dùng số liên tục 1–28 như `title` của JSON; câu 19–22 tương ứng II.1–4, câu 23–28 tương ứng III.1–6. Không có câu CHƯA soát. Đã nhìn trực tiếp toàn bộ ảnh trang: de22 p01–p08, de23 p01–p11, de24 p01–p09, de25 p01–p09 (37 trang); đọc JSON, các file đáp án trích, notes, source và đối chiếu lớp chữ khi cần. Ảnh trang là căn cứ ưu tiên khi lớp chữ mất dấu/mũ/chỉ số.

Đã nhìn riêng tất cả 28 ảnh được JSON dẫn tới: de22 5, de23 11, de24 5, de25 7. Hình đúng câu và giữ được các nhãn/dữ kiện cần thiết. Ngoại lệ nguồn thiếu hình de22 I.11 được nêu riêng. Không coi hình máy tính minh họa cách đổi đơn vị ở de24 p08 là hình bắt buộc trong đề bài.

Đáp án lưu trong cả bốn JSON đều khớp các kết luận đáp án trên ảnh PDF và `answers_from_text.json` khi ghép từng ý theo nhãn. Điều này KHÔNG xác nhận đáp án nguồn đúng về vật lí. Các mâu thuẫn có thể chấm sai học sinh được tách ở `Nguồn có vấn đề:`; không tự đổi đáp án trong đợt audit.

Các lời giải có diễn đạt lại/triển khai thêm bước suy ra trực tiếp từ công thức nguồn; những phần tương đương không được đánh đồng với dữ kiện bịa. Các chỗ đổi nghĩa, bổ sung sai hoặc tự sửa lỗi nguồn chưa ghi nhận được nêu bên dưới. Các lỗi kết xuất công thức được xác minh bằng hàm thực tế `renderMathText` trong `src/app/main.ts`, không giả định có MathJax/KaTeX. Đây là chạy renderer trong Node VM, chưa phải kiểm tra trình duyệt.

SHA-256 của bốn JSON đã đọc (không sửa các file này):

| Đề | SHA-256 |
| --- | --- |
| de22 | ca9d58f9cbfb9cbe01842878d8bc175886898da189cad6636bdff9827c1f721c |
| de23 | fbc7024f3856c1c601e0a423f1444e99158306b071e1399542fe0bc2176aac18 |
| de24 | 2a4f9247d79aabbe43e6c2be351c10cfe424c444e58af6656428155e706b2826 |
| de25 | c1f1d6eac544235cca2971417b397482a1380eb691e10e76b499e2fdf1275bf0 |

### Kiểm thử thực tế và giới hạn

Môi trường: Windows/PowerShell, Node v24.14.0. Repo đã có thay đổi ngoài scope khi bắt đầu; không sửa/hoàn tác chúng. Không install, commit, deploy hay tạo file test ngoài scope.

| Lệnh/check | Exit | Pass | Fail | Skip | Kết quả |
| --- | --- | --- | --- | --- | --- |
| Node stdin, 7 kiểm tra/đề, mã tái chạy ngay dưới | 1 | 27 | 1 | 0 | FAIL: de23 II.2 đảo thứ tự c,a,d,b |
| Node stdin, 4 regression renderer, mã tái chạy ngay dưới | 1 | 0 | 4 | 0 | FAIL: mất nhóm mẫu số; còn lệnh/chỉ số thô |
| `node --test test/schema/exam.test.ts test/schema/fixtures.test.ts test/schema/security.test.ts test/schema/types.test.ts` | 0 | 41 | 0 | 0 | PASS trong phạm vi schema/fixtures; không thay thế so ảnh |
| `npx --no-install tsc -p tsconfig.json` | 1 | — | — | — | FAIL: `src/app/main.ts(1130,30): TS2532 Object is possibly 'undefined'` |
| `npx --no-install tsc -p tsconfig.web.json` | 1 | — | — | — | FAIL: cùng TS2532 ở main.ts:1130 |

`node ops/exams/check.mjs ...`: NOT_RUN vì script ghi `ops/exams/work/deNN/check.json` ngoài scope; thay bằng kiểm tra stdin chỉ đọc. Build/browser_check: NOT_RUN vì có sinh/ghi artifact ngoài scope. Browser thật/full suite: NOT_RUN; đợt này kiểm định nội dung và schema, không nghiệm thu UI hay toàn sản phẩm. Không ghi PASS cho các phần này. Lỗi typecheck thuộc working tree ngoài scope, không được sửa trong task này.

Tái chạy kiểm tra dữ liệu từ PowerShell tại root (không ghi file):

```powershell
@'
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExam } from './src/schema/exam.ts';
for (const tag of ['de22','de23','de24','de25']) {
 const raw=readFileSync('public/exams/ly12/'+tag+'.json','utf8');
 const e=JSON.parse(raw), ref=JSON.parse(readFileSync('ops/exams/work/'+tag+'/answers_from_text.json','utf8'));
 const I=e.questions.filter(q=>q.kind==='I'), II=e.questions.filter(q=>q.kind==='II'), III=e.questions.filter(q=>q.kind==='III');
 test(tag+' schema',()=>assert.equal(parseExam(e).ok,true));
 test(tag+' structure',()=>{assert.deepEqual([I.length,II.length,III.length],[18,4,6]);assert.equal(e.settings.durationMinutes,50)});
 test(tag+' assets',()=>{for(const m of raw.matchAll(/public\/exams\/ly12\/[A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|svg|webp)/g))assert.ok(existsSync(m[0]),m[0])});
 test(tag+' keys I',()=>assert.deepEqual(I.map(q=>q.options.find(o=>o.optionId===q.correctOptionId).label),ref.part1));
 test(tag+' keys II by label',()=>{II.forEach((q,j)=>{const r=new Map(ref.part2_marks.slice(j*4,j*4+4));for(const s of q.statements)assert.equal(s.answer,r.get(s.label),q.questionVersionId+'/'+s.label)})});
 test(tag+' keys III',()=>assert.deepEqual(III.map(q=>q.answerKey),ref.part3));
 test(tag+' original statement order',()=>{for(const q of II)assert.deepEqual(q.statements.map(s=>s.label),['a','b','c','d'],q.questionVersionId)});
}
'@ | node --input-type=module
```

Tái chạy regression renderer trên chính source hiện có; assertions thể hiện hành vi mong đợi và đang FAIL, không phải test được làm yếu để xanh:

```powershell
@'
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const s=readFileSync('src/app/main.ts','utf8'),a=s.indexOf('function escapeHtml('),b=s.indexOf('function getStorageKey(',a),c={};
vm.createContext(c);vm.runInContext(stripTypeScriptTypes(s.slice(a,b)),c);
const q=(tag,i)=>JSON.parse(readFileSync('public/exams/ly12/'+tag+'.json','utf8')).questions[i];
test('de22 I12 denominator grouping',()=>assert.ok(c.renderMathText(q('de22',11).options[1].text).includes('/(C<sub>1</sub> + C<sub>2</sub>)')));
test('de23 I16 no raw ell command',()=>assert.ok(!c.renderMathText(q('de23',15).content).includes('\\ell')));
test('de24 I10 denominator grouping',()=>assert.ok(c.renderMathText(q('de24',9).explanation).includes('/(27 + 273)')));
test('de25 I11 no raw braced subscript',()=>assert.ok(!c.renderMathText(q('de25',10).explanation).includes('_{nh}')));
'@ | node --input-type=module
```

Gate nghiệp vụ cho các lỗi nguồn dưới đây: NEED_DECISION. Hai phương án để Trưởng phòng chọn: (A) tạm rút/cách ly câu lỗi, giữ bản nguồn làm chứng cứ; (B) duyệt bản hiệu đính riêng có ghi rõ khác PDF, phiên bản mới và đáp án đã kiểm lại. Không tự chốt một phương án, không đề nghị âm thầm đổi key hay tiếp tục dùng key mâu thuẫn như đã được xác nhận đúng.

## de22 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 12 (Phần I): JSON ghi phân số LaTeX có mẫu `C_1 - C_2` và `C_1 + C_2` (`public/exams/ly12/de22.json:389`, phương án A/B và lời giải), nhưng renderer thực tế đổi thành dạng `(C₁ C₂/C₁ + C₂)(t₁ - t₂)`, mất ngoặc nhóm mẫu số; PDF trang 2 và 5 ghi toàn bộ C₁±C₂ dưới gạch phân số; sửa thành cách biểu diễn tương thích renderer có ngoặc đầy đủ, ví dụ `(C₁·C₂)/(C₁+C₂)·(t₁-t₂)` cho B và tương tự A/lời giải. Cùng lỗi nhóm mẫu cần rà ở lời giải câu 17 (T+3), câu 22 (100·10⁻⁴), câu 27 (27+273), câu 28 (15+Δt). Regression: phân số sau render giữ nguyên nhóm tử/mẫu như PDF, không chỉ kiểm chuỗi LaTeX gốc.
- [MAJOR] Câu 13 (Phần I): JSON ghi `V = const/a · (t+273)/t` trong lời giải mà không định nghĩa a (`public/exams/ly12/de22.json:441`); PDF trang 5 ghi bước `pV/T = at·V/(t+273) = const` trước khi suy ra V; sửa thành khôi phục bước p=at và phương trình nguồn, giữ điều kiện t_A>t_B và kết luận V_A<V_B. Đây là thiếu bước định nghĩa, không phải sai key B.
- [MINOR] Câu 13 (Phần I): JSON ghi `V_B$.\n. Liên hệ đúng là` (`public/exams/ly12/de22.json:414`); PDF trang 2/5 chỉ có một dấu chấm trước “Liên hệ đúng là”; sửa thành `V_B$. Liên hệ đúng là`.
- [MAJOR] Câu 28 (Phần III): JSON ghi t₁ là “nhiệt độ ban đầu của nhiệt lượng kế” rồi dùng `C·10 = mc(t_n-t_1)` (`public/exams/ly12/de22.json:785`); PDF trang 8 ghi t₁ là nhiệt độ nhiệt lượng kế SAU LẦN 1; sửa thành định nghĩa t₁ sau lần 1 đúng PDF, giữ các phương trình (1)–(3) và key `2,5`. Định nghĩa hiện tại khiến phương trình cân bằng nhiệt thiếu độ tăng 10°C ở vế nước nóng, dù đáp số được giữ.

Nguồn có vấn đề:

- Câu 11 (Phần I), p01 và p05: có “Hình vẽ”, các điểm O,A,N,D,B,M,C và kết luận S₁=S₂ nhưng cả hai trang đều không có hình. Xác nhận notes.md đúng ở điểm này. NEED_DECISION: A cách ly câu, hoặc B duyệt bổ sung hình đã xác minh đúng các nhãn rồi tái soát; không tự vẽ đoán từ đáp án.
- Câu 13 (Phần I), p02 chỉ in A/B; p05 bản kèm hướng dẫn mới in thêm C/D. JSON có đủ bốn lựa chọn theo p05, không phải tự bịa. Đề nghị duyệt dùng bản đầy đủ p05 làm nguồn của câu này.
- Câu 27 (Phần III), p03 VÀ p08 thực sự in thô `$12^{\circ} \mathrm{C}$`; không phải chỉ lỗi lớp chữ như notes.md mô tả. Lời giải p08 dùng 12+273 và key 19; JSON hiển thị 12°C đúng nghĩa công thức. Đề nghị duyệt chuẩn hóa hiển thị và ghi đúng tình trạng nguồn, không quy đây là thay đổi dữ kiện.

## de23 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 20 (Phần II): JSON ghi mảng `statements` theo thứ tự c,a,d,b (`public/exams/ly12/de23.json:673`); PDF trang 3 và 8 đều in ĐỀ BÀI theo thứ tự a,b,c,d, chỉ các kết luận trong Hướng dẫn p08 xuất hiện c,a,d,b; sửa thành a,b,c,d, giữ nguyên ID/nội dung/key/lời giải đi theo từng ý (a=false, b=true, c=true, d=true). Test thứ tự độc lập FAIL; cách xếp trong notes.md để vượt checker theo vị trí không bảo toàn đề gốc. Cần điều phối sửa checker theo nhãn trong task riêng, không đổi key để làm test xanh.
- [MAJOR] Câu 16 (Phần I): JSON ghi `\ell` trong đề, cả bốn lựa chọn và lời giải (`public/exams/ly12/de23.json:543`); PDF trang 2/7 ghi ký hiệu ℓ, không có mã lệnh; sửa thành ℓ Unicode hoặc ký pháp renderer hỗ trợ, bảo toàn mẫu ℓ-d của B/D và chỉ số của từng phương án. VM xác nhận hiện nguyên `\ell` trong HTML. Cùng lệnh chưa hỗ trợ có trong câu 20 Phần II (ℓ, ℓ₁), cần chuẩn hóa đồng bộ; không thay ký hiệu vật lí bằng chuỗi lệnh thô.
- [MAJOR] Câu 8 (Phần I): JSON ghi `\frac{87 + 273}{27 + 273}` và các phân số tương tự trong lời giải; PDF trang 6 ghi cả tổng 87+273 trên tử và 27+273 dưới mẫu; sửa thành `(87+273)/(27+273)` có nhóm rõ sau render. Cùng lỗi mất nhóm mẫu ở câu 9,10,11,12,14,16,17,18 Phần I và câu 21,22 Phần II, câu 25,26 Phần III cần kiểm lại ở bản hiệu đính. Ví dụ phương án đúng B câu 16 phải hiện `p₀·S·d/(ℓ-d)`, không phải `p₀·S·d/ℓ-d`. Giữ key theo nguồn, riêng mâu thuẫn câu 10 đưa Trưởng phòng quyết bên dưới.

Nguồn có vấn đề:

- Câu 10 (Phần I), p01 và p06: A=77°C, B=70°C; Hướng dẫn p06 tính T=350 K≈77°C nhưng kết “Chọn B”. JSON giữ B đúng dòng kết luận PDF nhưng chấm sai học sinh chọn kết quả phép tính A. NEED_DECISION: A cách ly, hoặc B duyệt hiệu đính key thành A cùng lời giải; không tự đổi key trong audit. Xác nhận mâu thuẫn notes.md đã nêu.
- Câu 4 (Phần I), p01/p05: B ghi V_A>V_C>p_B, trộn thể tích với áp suất. JSON chép đúng lỗi gốc; đề nghị duyệt hiệu đính p_B→V_B hoặc cách ly câu. Hướng dẫn p05 nói “hệ số góc càng nhỏ thì V càng lớn” trong khi trục ngang hình là t(°C); quan hệ đúng dùng p/(t+273), không dùng p/t với gốc 0°C. Cần làm rõ điểm xuất phát của hệ số góc khi hiệu đính lời giải.
- Câu 16 (Phần I), p02/p07: phương án C in p_p, đúng như notes.md; JSON giữ đúng. Đề nghị người ra đề xác nhận chỉ số dự định trước khi hiệu đính, không tự coi chắc chắn phải là p₀.
- Câu 20 (Phần II), p08: thứ tự kết luận trong phần Hướng dẫn khác thứ tự đề. Đây là đặc điểm bố cục PDF và lỗi của phép trích theo vị trí, không phải lý do đảo các ý trong JSON. `answers_from_text.json` phải được hiểu theo cặp nhãn/giá trị trong từng câu.

## de24 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 3 (Phần I): JSON ghi `v̅^2` ở C/D và tự thêm lời giải `p=(1/3)μm v̅²=...` (`public/exams/ly12/de24.json:129`); PDF trang 1/4 đặt gạch trung bình TRÊN v², tức trung bình của bình phương tốc độ, còn Hướng dẫn p04 chỉ ghi “Chọn D”; sửa thành ký hiệu rõ `⟨v²⟩` hoặc “trung bình của v²”, giữ các hệ số 1/3 và 2/3, và bỏ phần giải thích bổ sung sai. `(trung bình v)²` khác `trung bình(v²)`, không phải lỗi trang trí dấu gạch.
- [MAJOR] Câu 10 (Phần I): JSON ghi phân số mẫu `27 + 273` (`public/exams/ly12/de24.json:348`), sau render thành `(10⁵ · 45/27 + 273)`; PDF trang 5 ghi `(10⁵·45)/(27+273)` dưới dạng phân số; sửa thành nhóm tử/mẫu rõ trong dữ liệu hiển thị. Cùng rủi ro ở câu 13,17 Phần I; câu 21,22 Phần II; câu 24,27,28 Phần III, nhất là `(45+0,1·l₁)/(20+273)` của câu 28. Regression mẫu 27+273 đang FAIL.
- [MINOR] Câu 10 (Phần I): JSON ghi `\⇒`, `\≈` trong lời giải (`public/exams/ly12/de24.json:348`); PDF trang 5 ghi ký hiệu ⇒,≈, không có dấu gạch chéo; sửa thành ký tự Unicode trực tiếp. Lỗi cùng loại xuất hiện ở I.12,13,14,16,17,18; II.3,4; III.1–6, và `\↓` ở I.18. VM xác nhận ký tự gạch chéo còn trong HTML; không gọi đây là LaTeX hợp lệ được web kết xuất.
- [MAJOR] Câu 21 (Phần II): JSON ghi lời giải ý c `m_1/m_2=V_1/V_2=80/20=4` (`public/exams/ly12/de24.json:690`); PDF trang 7 ghi `m_2/m_1=V_2/V_1=4`, đảo chỉ số so với V₁=80 lít, V₂=20 lít trong đề. JSON đã tự hiệu đính công thức nguồn nhưng notes.md không ghi nhận và lại khẳng định khớp 100%; sửa thành bản hiệu đính được duyệt có ghi rõ khác nguồn, hoặc gắn cờ chờ quyết định. Không đề nghị khôi phục công thức sai một cách âm thầm. Key c=true khớp kết luận và phát biểu “I gấp 4 lần II”.
- [MINOR] Câu 20 (Phần II): JSON ghi bảng kết quả bằng các dòng Markdown `| ... |`, `| --- | --- |` trong content; PDF trang 2/6 có bảng hai hàng nhiệt độ 22,5°C và 24,6°C; sửa thành bảng block được hỗ trợ hoặc hai dòng văn bản có nhãn rõ. Renderer hiện chỉ xử lý ảnh/chữ đậm/công thức/xuống dòng, không chuyển cú pháp bảng này thành bảng. Không thiếu hai số đo, đây là lỗi trình bày.

Nguồn có vấn đề:

- Câu 21 (Phần II), p07: tỷ số chỉ số trong lời giải c bị ngược như finding trên; đề nghị duyệt công thức I/II=80/20=4 và ghi rõ hiệu đính. Notes.md không liệt kê lỗi này.
- Câu 8 (Phần I), p01/p04: B nói bầu lớn làm mực thủy ngân dâng cao hơn; C nói “mực thuỷ ngân ... dâng lên tới cùng một nhiệt độ”; nguồn chọn C. B cũng là nhận định vật lí có cơ sở với cùng tiết diện ống quản, còn C diễn đạt lẫn độ cao với nhiệt độ. NEED_DECISION: cách ly, hoặc duyệt sửa câu/phương án để bảo đảm một đáp án duy nhất; không đổi C chỉ từ suy luận trong audit.
- Câu 20 (Phần II), p06–p07, ý c: bảng đã cho nhiệt độ khí tăng 22,5→24,6°C, nhưng Hướng dẫn bác kết luận bằng trường hợp khí sinh công bằng nhiệt nhận vào (ΔU=0). Lập luận này không giải thích được số đo tăng nhiệt độ nếu coi khí lí tưởng. Cần người ra đề xác nhận yêu cầu kiểm chứng giả thuyết và giải thích c; giữ nguyên kết luận c=false trong bản audit, không tự sửa nghiệp vụ.
- Câu 19 (Phần II), p06, ý d: nguồn loại cách đo dùng nước chỉ vì cột cần cao hơn 10 m. Đây là hạn chế thực hành, không chứng minh nguyên lí dùng cột nước sai. Đề nghị người ra đề làm rõ phạm vi “ống Tô-ri-xen-li”/tính hợp lý của dụng cụ trước khi tái sử dụng câu; JSON hiện theo đúng nguồn.
- Câu 26 (Phần III), p08: có thêm ảnh màn hình máy tính đổi 300 mmHg≈39996,72 Pa và câu “Có thể casio để đổi đơn vị được”. JSON giữ phương trình đổi đơn vị và đáp số 632 nhưng lược mẹo/ảnh giải phụ. Không ảnh hưởng dữ kiện đề hay đáp số; nếu yêu cầu lưu toàn bộ hướng dẫn kể cả mẹo thao tác, cần duyệt bổ sung phần này ở bản hiệu đính.

## de25 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 10 (Phần I): JSON ghi phân số tính nhiệt độ cân bằng có mẫu `m_d c_d + m_n c_n` và mẫu thay số `0,6·380+0,35·4200` (`public/exams/ly12/de25.json:362`); PDF trang 5 đặt toàn bộ các tổng dưới gạch phân số; sửa thành `(m_d·c_d·t_d+m_n·c_n·t_n)/(m_d·c_d+m_n·c_n)` và biểu thức thay số có ngoặc nhóm sau render. Cùng vấn đề ở lời giải I.13,14; II.2c,2d,3a,4a,4c; III.4,5. Giữ 28,7°C/key B; không sửa phép tính nguồn thành phép chia chỉ cho số hạng đầu của mẫu.
- [MINOR] Câu 11 (Phần I): JSON ghi `m_{nh}`, `c_{nh}`, `Δt_{nh}` (`public/exams/ly12/de25.json:392`); PDF trang 5 ghi “nh” dưới chân từng đại lượng; sửa thành ký pháp chỉ số mà renderer hiện hỗ trợ, ví dụ `m_nh`, `c_nh`, `Δt_nh`, hoặc diễn đạt chữ. VM xác nhận HTML vẫn chứa nguyên `_{nh}`. Cùng lỗi `t_{cb}` trong đề câu 21 Phần II cần chuẩn hóa đồng bộ.
- [MINOR] Câu 16 (Phần I): JSON ghi phương án C `01°C` (`public/exams/ly12/de25.json:533`); PDF ảnh trang 2 và 6 ghi `1°C`; sửa thành `1°C`. Lớp chữ trích có `01 C` vì nhận nhầm ký hiệu độ, không phải một số 0 đứng trước 1 trong ảnh. Key D=0°C không đổi.

Nguồn có vấn đề:

- Câu 3 (Phần I), p01/p04: đơn vị đúng của λ=Q/m là J/kg ở B, nhưng nguồn kết “Chọn A” (A là J/kg.độ). JSON đúng dòng key nguồn nhưng mâu thuẫn công thức và đơn vị. NEED_DECISION: cách ly, hoặc duyệt key B cùng lời giải. Lưu ý notes.md mô tả Hướng dẫn là Q=mλ, nhưng ảnh p04 thực tế ghi λ=Q/m, đúng như JSON; không báo nhầm đây là lỗi chép công thức của worker.
- Câu 19 (Phần II), p02/p07, ý c: phát biểu V=2 m³, hướng dẫn tính V=2³=8 m³ nhưng vẫn kết “c) Đúng”; JSON giữ answer=true theo PDF. Đây là mâu thuẫn có thể chấm sai: NEED_DECISION giữa cách ly và duyệt c=false (hoặc sửa phát biểu thành 8 m³ có version mới), không tự chốt.
- Câu 19 (Phần II), p07, ý d: dòng phân tử trong phân số mật độ in `3,01·10^23/8≈3,76·10^23`, trong khi ý b xác định N=3,01·10²⁴. JSON đã dùng 10²⁴ đúng phép tính nhưng notes.md không ghi sửa lỗi nguồn này. Đề nghị duyệt hiệu đính số mũ; key d=true tương ứng phép tính đúng với 10²⁴.
- Câu 4 (Phần I), p01/p04: B và D trùng “khối khí tỏa nhiệt và nhiệt độ tăng”, như notes.md. Đề nghị duyệt thay một phương án nhiễu hoặc giữ có ghi nhận trùng; không tự chế phương án khác. Key A không bị thay đổi bởi chỗ trùng này.
- Câu 21 (Phần II), p03/p07: lỗi chữ “nhiệt đột”, như notes.md. Ý c nói “thể tích nước đá đã tan khoảng 0,3 lít”, nhưng lời giải lấy m₃≈0,301 kg rồi V₃≈0,3 lít, ứng với thể tích NƯỚC tạo thành; nếu hỏi thể tích đá trước tan thì dùng ρ₂=900 và được khoảng 0,334 lít. Đề nghị làm rõ đại lượng thể tích trước khi nghiệm thu ý c; không tự đổi key c=true.
- Các ghi chú lỗi chữ ở notes.md: I.10 “dồng”, I.15 “thỉ”, II.1d “là là” có trong lớp chữ; II.1d “là là” cũng thấy trên ảnh p02/p07. Không dùng lớp chữ để kết luận mọi dấu tiếng Việt trên ảnh giống hệt; khi hiệu đính dùng ảnh làm chuẩn. Các lỗi chữ này không phải căn cứ để đổi dữ kiện/đáp án.
- Câu 8 (Phần I), p05: phần chữ Hướng dẫn có ký tự lỗi ở “hệ số góc”; JSON đã chuẩn hóa thành tiếng Việt có nghĩa. Câu 25 (Phần III), p08 bản có Hướng dẫn in thô `$30 \%$`, còn p03 bản đề ghi 30%; JSON dùng 30% đúng dữ kiện. Đề nghị ghi nhận các chuẩn hóa nguồn này, không báo thành bịa dữ kiện.
