# IMP-AUDIT-A — Đối chiếu độc lập đề Vật lí 12

Ngày kiểm tra: 2026-11-16. Reviewer: Codex. Kết quả bàn giao: NEED_DECISION; cả bốn đề CHANGES_REQUESTED.

Snapshot HEAD: `3d5e868af9b7c1a0748bb412e6efbb5886caa3a2`. Working tree có sẵn thay đổi của các tác vụ khác. Không sửa đề, mã sản phẩm, dependency, file kiểm tra hay artifact của worker; không commit/deploy.

Quy ước: số câu trong findings là thứ tự JSON 1–28: I.1–18 → 1–18; II.1–4 → 19–22; III.1–6 → 23–28. Trang là số trong `pages/pXX.png`, không phải số trang suy ra từ thứ tự câu.

Đã đối chiếu nội dung, thứ tự A/B/C/D, 16 ý đúng/sai, sáu chuỗi trả lời ngắn, hình và lời giải của **112/112 câu**. Đã nhìn toàn bộ **37 ảnh trang**: de10 p01–p10; de11 p01–p09; de12 p01–p08; de13 p01–p10. Đã mở riêng **29 hình được JSON tham chiếu**: 7/10/5/7 hình tương ứng; tất cả gán đúng câu. Các hình lời giải bổ sung bị thiếu được ghi riêng bên dưới. Đã đọc nguồn trong source.txt, tham khảo pdf_text.txt và answers_from_text.json; notes.md tồn tại ở de10/de12/de13, **de11 không có notes.md** tại thời điểm kiểm tra. Không có câu chưa soát về đối chiếu nội dung; chưa chạy giao diện browser thật nên không chứng nhận layout/browser end-to-end.

SHA-256 của các JSON đã kiểm:

| Đề | SHA-256 |
| --- | --- |
| de10 | `786db05a723c16cd9ac86dafd3878f7812b5e702243cf8dabf4a2ddfeb5222e9` |
| de11 | `0907fe764d2366ea46228000fd389439d63717dea6f6364aea1c53203d9d64f9` |
| de12 | `00263b43117f0fd80ca5efb45c137462398dab9ad1f592463be1b315305d8cfa` |
| de13 | `b26592c847333be3fedee7b247015d8a48a3af781c8fd1869509bc8fb0056f49` |

Các đáp án JSON đều khớp các dấu chọn/Đúng-Sai/Trả lời ngắn in trong PDF đã nhìn. Điều này **không** xác nhận nguồn đúng về vật lí; đặc biệt de10 I.17 cần quyết định trước khi dùng để chấm.

Kiểm tra đã chạy thật trên Node v24.14.0, PowerShell, D:\Cunata:

| Lệnh / kiểm tra | Exit | Pass / fail / skip | Giới hạn |
| --- | --- | --- | --- |
| `node --test --test-reporter=tap test/schema/exam.test.ts test/schema/fixtures.test.ts` | 0 | 28 / 0 / 0 | Tests hiện có; fixtures trong suite không thay thế đối chiếu bốn đề này |
| `node --input-type=module -` — 16 tests stdin cho de10–13, nội dung tái chạy bên dưới | 0 | 16 / 0 / 0 | Schema, 18/4/6, 50 phút, keys so với máy trích, asset tồn tại, ID/text/explanation đầy đủ |
| `node --input-type=module -` — 6 tests stdin gọi hàm renderMathText lấy trực tiếp từ index.html | 1 | 1 / 5 / 0 | Một control số mũ đạt; ba chỉ số có ngoặc nhọn, sin và phần trăm thất bại; kiểm hàm thật trong VM, không phải browser |
| `npx --no-install tsc -p tsconfig.json` | 1 | N/A | `src/app/main.ts(1130,30): TS2532: Object is possibly 'undefined'.` |
| `npx --no-install tsc -p tsconfig.web.json` | 1 | N/A | Cùng lỗi TS2532 tại dòng 1130; ngoài scope sửa |
| Build / browser / full application suite | NOT_RUN | N/A | Task chỉ ghi một file review; build/check.mjs/browser_check.mjs ghi artifact ngoài scope. Full application suite không thuộc bằng chứng đối chiếu nội dung; chỉ chạy schema và kiểm tra đọc thuần ở trên |

Không gọi `ops/exams/check.mjs` vì script luôn ghi `ops/exams/work/deNN/check.json`. Các tests stdin không ghi file. Typecheck đỏ được bàn giao nguyên trạng, không thay bằng PASS từ worker.

Tái chạy 16 tests đọc thuần: truyền đoạn sau qua stdin cho `node --input-type=module -` tại D:\Cunata.

```js
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExam } from './src/schema/exam.ts';
for (const n of [10,11,12,13]) {
  const tag=`de${n}`;
  const e=JSON.parse(readFileSync(`public/exams/ly12/${tag}.json`,'utf8'));
  const r=JSON.parse(readFileSync(`ops/exams/work/${tag}/answers_from_text.json`,'utf8'));
  test(`${tag}: schema, 18/4/6, 50 minutes`,()=>{
    assert.equal(parseExam(e).ok,true);
    assert.deepEqual(['I','II','III'].map(k=>e.questions.filter(q=>q.kind===k).length),[18,4,6]);
    assert.equal(e.settings.durationMinutes,50);
  });
  test(`${tag}: I/II/III keys match extracted PDF reference`,()=>{
    assert.deepEqual(e.questions.filter(q=>q.kind==='I').map(q=>q.options.find(o=>o.optionId===q.correctOptionId).label),r.part1);
    assert.equal(r.part2_marks.length,16);
    assert.deepEqual(e.questions.filter(q=>q.kind==='II').flatMap(q=>q.statements.map(s=>s.answer)),r.part2_marks.map(x=>x[1]));
    assert.deepEqual(e.questions.filter(q=>q.kind==='III').map(q=>q.answerKey),r.part3);
  });
  test(`${tag}: all referenced images exist`,()=>{
    const refs=[...JSON.stringify(e).matchAll(/public\/exams\/ly12\/[A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|svg|webp)/g)];
    assert.ok(refs.length);
    for(const m of refs) assert.ok(existsSync(m[0]),m[0]);
  });
  test(`${tag}: unique question IDs, complete text and explanations`,()=>{
    assert.equal(new Set(e.questions.map(q=>q.questionVersionId)).size,28);
    for(const q of e.questions) {
      assert.ok(q.content?.trim());
      if(q.kind==='II') for(const s of q.statements) {
        assert.ok(s.text?.trim()); assert.ok(s.explanation?.trim());
      } else assert.ok(q.explanation?.trim());
    }
  });
}
```

Tái chạy phép kiểm renderer: lấy nguyên hàm thật và inject escapeHtml cho các mẫu công thức thuần. Kết quả thực tế: `Q_{nc}`, `p_{B1}`, `t_{02}`, `mg\sin 30°`, `60\%` còn nguyên ký hiệu thô. `10^23` thành `10<sup>23</sup>` đúng theo renderer hiện tại; **không** quy kết số mũ nhiều ký tự không có ngoặc nhọn là lỗi hiển thị trong renderer này. `src/app/main.ts` có cùng các phép thay thế liên quan. Sửa tương thích dữ liệu bằng Unicode/chỉ số được hỗ trợ, hoặc giao riêng task renderer; reviewer không sửa ngoài scope.

```js
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const html=readFileSync('index.html','utf8');
const start=html.indexOf('    function renderMathText(');
const end=html.indexOf('    function formatScore(',start);
const ctx={escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')};
vm.runInNewContext(html.slice(start,end),ctx);
const cases=[
  ['multi-digit exponent control','$10^23$','<sup>23</sup>'],
  ['de11 I.18 subscript','$Q_{nc}$','<sub>nc</sub>'],
  ['de12 II.4 subscript','$p_{B1}$','<sub>B1</sub>'],
  ['de13 II.3 stem subscript','$t_{02}$','<sub>02</sub>'],
  ['de10 II.3 sine','$mg\\sin 30°$','mgsin 30°'],
  ['de11 I.16 percent','$60\\%$','60%']
];
for(const [name,input,expected] of cases) test(name,()=>{
  const got=ctx.renderMathText(input);
  console.log(name,JSON.stringify(got));
  assert.ok(got.includes(expected),`expected ${expected}`);
});
```

## de10 — verdict: CHANGES_REQUESTED

- [MINOR] Câu 3 (Phần I): JSON ghi “Phát biếu” và phương án A “chuyến hóa” ; PDF trang 1, 5 ghi “Phát biểu” và “chuyển hóa” ; sửa thành hai từ đúng theo ảnh, không đổi thứ tự phương án hoặc đáp án C.
- [MAJOR] Câu 21 (Phần II): JSON ghi lời giải ý b bằng `mg\sin 30°`, `μmg\cos 30°`, các lệnh sin/cos còn nguyên dấu gạch chéo khi gọi renderer hiện tại ; PDF trang 8 ghi các hàm sin/cos được trình bày bình thường trong công thức lực ; sửa thành ký pháp hiển thị được như `$mg sin 30°$`, `$μmg cos 30°$`, bảo toàn các phân số 16/9, 29/3 và kết quả 0,37, hoặc yêu cầu sửa renderer ở task riêng.
- [MAJOR] Câu 22 (Phần II): JSON ghi kết quả `x + h_B = 0,49 + 0,63 = 1,12 m` nhưng bỏ phương trình xác định x và không gán hình lời giải có nhãn x, h_A, h_B ; PDF trang 9 có hình bổ sung và phương trình `V_n = V_B + m_Atan/D_B ⇒ 2Sx + S(x + 0,63) = 1,2S + 0,9S/1 ⇒ x = 0,49 m` ; sửa thành lời giải có đủ định nghĩa hình học/phương trình này, tham chiếu hình có sẵn `public/exams/ly12/de10/p09-2.png` trong explanation; không thay hình ban đầu của đề hoặc đổi các đáp án Đ/S.
- [MINOR] Câu 28 (Phần III): JSON ghi hình `public/exams/ly12/de10/p04-2.png` có lẫn một mẩu chữ ở mép trên ; PDF trang 4 hình minh họa viên đạn và quả cầu không cần phần chữ của dòng phía trên ; sửa thành vùng cắt chỉ chứa hình, qua task có quyền sửa asset; nội dung và answerKey `36,6` giữ theo PDF.

Nguồn có vấn đề:

- **NEED_DECISION — I.17 / câu 17, trang 7, đã có trong notes.md:** kết quả lời giải là `t_cb ≈ 11,4°C` nhưng kết luận “Chọn A”; A = 10,7°C, B = 11,4°C. JSON giữ A đúng theo chữ “Chọn A”, không phải lỗi đảo option của worker. Kiểm tra độc lập `(634500 - 344500)/(5·4180 + 0,5·500 + 4180) ≈ 11,4489°C`, phù hợp B. Phương án: (A) chủ dự án duyệt đổi key và kết luận sang B, giữ dữ kiện; (B) giữ bản phiên chép A nhưng cách ly khỏi đề dùng để chấm, kèm cảnh báo nguồn; (C) xin bản PDF đính chính trước phát hành. Không tự đổi key trong task review.
- **II.4 / câu 22, trang 3 và 9:** câu “Nhiệt độ chỉ trao đổi giữa băng và nước” dùng sai từ; ý nghĩa phải là nhiệt/nhiệt lượng chỉ trao đổi giữa băng và nước. JSON chép theo nguồn. Đề xuất duyệt hiệu đính từ này hoặc giữ nguyên kèm ghi chú; không coi là worker tự làm sai vật lí.

## de11 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 14 (Phần I): JSON ghi lời giải “Áp suất điểm màu xanh bằng điểm màu đỏ” nhưng chỉ có hình đề không đánh dấu hai điểm ; PDF trang 6 có hình lời giải đánh dấu điểm xanh/đỏ ở cùng độ cao ; sửa thành explanation gắn hình có sẵn `public/exams/ly12/de11/p06-1.png`, để câu diễn giải có đối tượng tham chiếu đúng như PDF.
- [MINOR] Câu 16 (Phần I): JSON ghi `60\%` trong lời giải, renderer giữ nguyên dấu gạch chéo ; PDF trang 6 ghi `60%` ; sửa thành `60%` hoặc đưa phần trăm ra ngoài công thức, giữ nguyên đáp án A.
- [MAJOR] Câu 17 (Phần I): JSON chỉ gán hình đề, không có hình lời giải với mũi tên `h = 100 cm`, `l = 18 cm`, `2 cm` ; PDF trang 6 có thêm hình chú thích ba đại lượng này ; sửa thành explanation tham chiếu hình có sẵn `public/exams/ly12/de11/p06-4.png`, giữ nguyên hình đề và đáp án D.
- [MAJOR] Câu 18 (Phần I): JSON ghi `Q_{nc}` ở lời giải, renderer hiện nguyên chuỗi dấu ngoặc nhọn thay vì chỉ số ; PDF trang 7 ghi Q có chỉ số nc trong cả định nghĩa nhiệt nóng chảy và bất đẳng thức ; sửa thành ký pháp được renderer hỗ trợ như `$Q_nc$` tại mọi vị trí trong câu, hoặc sửa renderer qua task riêng; giữ bất đẳng thức và đáp án C.
- [MINOR] Câu 21 (Phần II): JSON ghi `30\%` ở lời giải ý a, renderer hiện dấu gạch chéo ; PDF trang 7 ghi `30%` ; sửa thành `30%`, không đổi answer true.
- [MAJOR] Câu 27 (Phần III): JSON ghi `m_{tan}` ở lời giải nhưng renderer không xử lý chỉ số có ngoặc nhọn ; PDF trang 9 trình bày khối lượng tan bằng chỉ số đúng ; sửa thành `$m_tan$` hoặc ký pháp Unicode/renderer đã hỗ trợ, đồng thời đưa sai số tính toán của chính nguồn ở dưới đây cho chủ dự án quyết định; không tự đổi answerKey `27,1`.
- [MAJOR] Câu 28 (Phần III): JSON chỉ gán hình hai piston ban đầu, không có hình lời giải thể hiện bốn lực áp suất ; PDF trang 9 có hình riêng với các lực p_A S_1, p_B S_2, p_0 S_1, p_0 S_2 ; sửa thành explanation tham chiếu hình có sẵn `public/exams/ly12/de11/p09-2.png`, giữ phương trình cân bằng và answerKey `136`.

Nguồn có vấn đề:

- **NEED_DECISION — III.5 / câu 27, trang 9:** nguồn ghi `m_tan ≈ 0,0723 kg = 72,3 g`, tiếp đó `100 - 72,3 ≈ 27,1 g`. Hai phép tính không khớp. Từ dữ kiện, `m_tan = (25200 - 0,1·2100·2)/(3,4·10^5) ≈ 0,07288235 kg`, tức 72,9 g khi làm tròn một chữ số; khối lượng còn lại ≈ 27,11765 g → answerKey `27,1` vẫn đúng. JSON chép nguyên sai số trung gian của PDF. Phương án: (A) duyệt sửa trung gian thành 0,07288 kg / 72,9 g và giữ key; (B) giữ nguyên phiên chép, thêm ghi chú lỗi nguồn rồi cách ly tới khi duyệt. Không đổi key thành 27,7 chỉ để khớp phép trừ sai.
- **I.15 / câu 15, trang 6:** nguồn ghi `0,1935·10^-3 kg = 1935 g`, thiếu dấu thập phân ở kết quả gam; phải là `0,1935 g`. JSON đã dùng `0,1935 g` và giữ đáp án C. Đề xuất chủ dự án xác nhận hiệu đính này; không phục hồi lỗi đơn vị nguồn.
- **I.14 / câu 14, trang 6:** hình lời giải đánh dấu hai điểm nhưng màu có thể rất khó phân biệt; bổ sung mô tả “hai điểm cùng mặt ngang trong thủy ngân” nếu chủ dự án cho phép hiệu đính accessibility. Không ảnh hưởng key D.
- Không có notes.md của de11 để đối chiếu quyết định hiệu đính trước đó; không suy đoán là worker đã được duyệt.

## de12 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 21 (Phần II): JSON ghi “Hình bên là đồ thị...” nhưng không có image/đồ thị ; PDF trang 2 và 7 cũng không có đồ thị A/B cần để xác định các ý ; sửa thành câu có hình gốc hợp lệ sau khi xin bổ sung nguồn, hoặc cách ly câu/đề theo quyết định chủ dự án; không tự vẽ suy ngược từ đáp án. Đây là thiếu sót của nguồn, đã có trong notes.md, không phải kết luận worker bỏ sót một hình có sẵn.
- [MAJOR] Câu 22 (Phần II): JSON ghi các chỉ số `{A1}`, `{B1}`, `{A2}`, `{B2}` trong p/V/l ở lời giải cả bốn ý, renderer giữ nguyên ký pháp thô ; PDF trang 7 ghi đúng các chỉ số tương ứng hai trạng thái và hai cột khí ; sửa thành `$p_A1$`, `$p_B1$`, `$p_A2$`, `$p_B2$`, `$V_A1$`, `$V_B1$`, `$V_A2$`, `$V_B2$`, `$l_A2$` ở mọi vị trí hoặc giao sửa renderer; bảo toàn giá trị 101, 116,359, 91,36, 33,3 và 10 cm.
- [MINOR] Câu 26 (Phần III): JSON ghi `77,8\%` trong lời giải, renderer hiện thêm dấu gạch chéo ; PDF trang 8 ghi `77,8%` ; sửa thành `77,8%`, giữ answerKey `77,8`.
- [MINOR] Câu 27 (Phần III): JSON gán `public/exams/ly12/de12/p03-3.png` có lẫn một mẩu khung của hình ống chữ U ở mép dưới ; PDF trang 3 có hình mảnh thép và hình ống U thuộc hai câu khác nhau ; sửa thành vùng cắt chỉ chứa hình mảnh thép qua task có quyền sửa asset.
- [MINOR] Câu 28 (Phần III): JSON gán `public/exams/ly12/de12/p03-4.png` có lẫn mép ảnh vách núi của câu trước ở phía trên ; PDF trang 3 hình cần cho câu này là sơ đồ ống chữ U ; sửa thành vùng cắt chỉ chứa sơ đồ qua task có quyền sửa asset; không đổi độ chênh 5 cm và answerKey `7`.

Nguồn có vấn đề:

- **NEED_DECISION — II.3 / câu 21:** thiếu đồ thị ở cả trang 2 và 7. Phương án: (A) xin bản nguồn đủ hình rồi nhập lại; (B) tạm cách ly toàn đề khỏi danh sách dùng làm bài; (C) chủ dự án duyệt một phiên bản đề mới loại/thay câu này, giữ version cũ và tính lại điểm tối đa đúng contract. Không coi ba ý true, một ý false in sẵn là dữ kiện thay cho hình.
- **I.16 / câu 16, trang 2 và 6, đã có trong notes.md:** “1,81 nước” ở nguồn được hiểu là 1,8 lít qua `V = 1,8·10^-3 m³`, `m = 1,8 kg`; JSON ghi `1,8 l`. Cùng câu, nguồn trang 6 in `R = U²/R = 220²/800 = 60,5Ω`, mẫu số ký hiệu R bị sai, phải là P. JSON đã dùng U²/P. Đề xuất duyệt hai hiệu đính, giữ dữ kiện số và đáp án D; nếu cần bản phiên chép tuyệt đối thì giữ bằng provenance/ghi chú, không đưa phương trình sai vào lời giải học sinh.
- **II.2 / câu 20, trang 2, đã có trong notes.md:** dòng “d) Sai. Nếu bỏ qua khối lượng...” bị in ngay vào phần đề. JSON đã bỏ dòng lộ đáp án khỏi content và giữ trong explanation ý d. Đề xuất duyệt cách tách này; không thêm nó thành ý thứ năm.
- **II.3 / câu 21 ý a, đã có trong notes.md:** nguồn viết “Chất tắn B”; JSON sửa “Chất rắn B”. Đề xuất chấp nhận sửa chính tả, độc lập với yêu cầu bổ sung đồ thị.
- **III.4 / câu 26, trang 8:** nguồn dùng chuỗi `672000/864000 ≈ 0,78 = 77,8%`. Tỉ số chính xác ≈ 0,7777778; dấu bằng sau số đã làm tròn 0,78 không chính xác. Đề xuất duyệt viết `H ≈ 0,7778 ≈ 77,8%`, giữ key.
- **III.6 / câu 28, trang 8:** nguồn ghi áp suất khí bằng `p_0 - 5 cmHg`, trong khi 5 cm trong đề là chênh lệch hai mặt trên, không phải chiều dài cột thủy ngân nhánh phải. Kết luận áp suất không đổi có thể dựa vào chiều dài cố định của cột thủy ngân nhánh phải; không cần gán nó bằng 5 cm. Đề xuất chủ dự án duyệt dùng `p = p_0 - ρgℓ` với ℓ là chiều dài cột nhánh phải, hoặc bỏ riêng mệnh đề giá trị áp suất chưa có dữ kiện; giữ kết quả độ chênh 7 cm sau kiểm tra. JSON hiện chép đúng câu sai của nguồn, không phải lỗi tự đổi số.

## de13 — verdict: CHANGES_REQUESTED

- [MAJOR] Câu 19 (Phần II): JSON ghi thêm các đoạn giải thích về cách đo/tách nhiệt lượng ở ý a, b, d, và đổi lý do ý c thành “chưa xảy ra quá trình nóng chảy hoàn toàn” ; PDF trang 7 chỉ ghi a) Đúng; b) Đúng; c) Sai với lý do “Vì chưa xảy ra quá trình nóng chảy thì chưa thể đo được nhiệt nóng chảy riêng”; d) Đúng ; sửa thành explanation đúng nội dung hướng dẫn nguồn, bỏ các đoạn tự bổ sung a/b/d và không tự thêm từ “hoàn toàn” vào lý do c; nếu muốn hiệu đính lý do nguồn thì xin duyệt riêng như mục bên dưới. Các boolean hiện khớp PDF.
- [MAJOR] Câu 21 (Phần II): JSON ghi `t_{02}` trong ý b, `t_{01}` trong ý d và `m_{nd}`, `t_{01}` trong lời giải d; renderer hiện nguyên chỉ số có ngoặc nhọn ; PDF trang 3 và 8 có các chỉ số 02/01/nđ trình bày đúng ; sửa thành ký pháp renderer hỗ trợ như `$t_02$`, `$t_01$`, `$m_nd$` hoặc ký tự Unicode phù hợp, giữ nguyên dữ kiện 0°C, 68,6°C và kết quả lời giải 83,81°C; không đổi answer false của b/d.
- [MINOR] Câu 14 (Phần I): JSON gán `public/exams/ly12/de13/p02-1.png` có lẫn một mẩu chữ từ dòng phía trên ; PDF trang 2 sơ đồ cần cho câu là đồ thị nhiệt độ A–B–C–D–E ; sửa thành vùng cắt sạch đồ thị qua task có quyền sửa asset.
- [MINOR] Câu 16 (Phần I): JSON gán `public/exams/ly12/de13/p02-2.png` có lẫn mẩu chữ của dòng dưới ; PDF trang 2 hình cần cho câu là đồ thị p–V với hai đường T_1, T_2 ; sửa thành vùng cắt chỉ chứa đồ thị qua task có quyền sửa asset, không đổi nhãn hai đường hoặc key C.

Nguồn có vấn đề:

- **II.1 / câu 19 ý c, trang 7:** phần đề hỏi dừng đo “khi thấy có sự nóng chảy”, nhưng lý do trong hướng dẫn nói “chưa xảy ra quá trình nóng chảy”. Hai câu chữ không khớp hoàn toàn. JSON đã tự đổi sang “chưa ... nóng chảy hoàn toàn”, làm mất tính phiên chép. Phương án: (A) giữ nguyên lời giải nguồn kèm chú thích mâu thuẫn; (B) chủ dự án duyệt lý do “chỉ mới bắt đầu nóng chảy, chưa xác định đủ nhiệt lượng nóng chảy toàn khối” cho phiên bản hiệu đính. Không tự coi lời giải bổ sung là nguyên văn PDF.
- **I.4B, I.12, I.17, III.3, III.6, đã có trong notes.md:** nguồn lần lượt có “xác đạnh”, “lí tường”, “lý tường”, “rởi” và thiếu dấu ngoặc đóng ở yêu cầu làm tròn. JSON lần lượt sửa “xác định”, “lí tưởng”, “lý tưởng”, “rơi” và đóng ngoặc. Đề xuất duyệt các sửa chính tả/trình bày này; không phục hồi lỗi in nguồn.
- **I.18 / câu 18, trang 2 và 7:** thân đề/hướng dẫn dùng p_0 còn các phương án in P_0 hoa. JSON thống nhất p_0. Đề xuất chấp nhận chuẩn hóa cùng đại lượng áp suất, ghi nhận khác biệt nguồn nếu yêu cầu phiên chép từng ký tự; không đổi các phân số hoặc key B.

Gate bàn giao: cần sửa findings chuyển đổi/hiển thị, quyết định các vấn đề nguồn, rồi kiểm lại đúng snapshot mới. Không cấp OK hoặc chứng nhận sẵn sàng phát hành chỉ dựa vào 16 tests dữ liệu xanh. Rollback của task review chỉ là gỡ file báo cáo này; không có thay đổi dữ liệu đề để rollback.
