# Oracle độc lập M1-C1

Công cụ kiểm định cho **đề tùy chỉnh** `custom-v1`, không phải code sản phẩm.
Python 3.11+ và thư viện chuẩn; không cài dependency. Oracle không đọc, import,
gọi hoặc thực thi bất kỳ code nào trong `src/`.

Nguồn quy tắc: **Shared Product Contract v2.0, mục 2**. Kiểu dữ liệu,
`sa-charset-v1` và JSON fixtures theo `docs/contracts/M1-scoring-contract.md`
mục 3, 4 và 6. Oracle không áp công thức này lên mẫu chuẩn THPT.

## Chạy từ `D:\Cunata`

```powershell
# Chạy tự kiểm, sau đó tái tạo 5 file fixtures UTF-8, LF.
python -B test/oracle/oracle.py --write

# Chạy tự kiểm và kiểm file JSON trên đĩa; không ghi file.
python -B test/oracle/oracle.py --check
```

Không truyền tham số tương đương `--check`. Có thể chạy từ thư mục khác bằng
đường dẫn tuyệt đối của script; thư mục fixtures được xác định theo `__file__`.
`-B` tránh tạo `__pycache__`. Exit `0` khi mọi kiểm tra thành công; exit khác
`0` khi tự kiểm thất bại, file thiếu/thừa hoặc bytes JSON khác kết quả tái tạo.
Khi tự kiểm thất bại, `--write` không ghi fixtures.
File `.gitattributes` trong thư mục này giữ LF qua checkout trên Windows để
kiểm bytes không bị ảnh hưởng bởi `core.autocrlf` của máy.

Script in kết quả `unittest` và một dòng JSON gồm số test, pass/fail/skip,
số fixtures, seed, Python và thời gian chạy. Số **test methods** và số **ca
fixtures** là hai đại lượng riêng, không phải số test sản phẩm.

## Fixtures và cách dùng

| File | Số ca | Nội dung |
| --- | ---: | --- |
| `fixtures/golden.json` | 29 | 10 cấu hình bắt buộc: đúng hết/bỏ hết, thêm đúng một câu III khi có III; hai ca báo cáo 11/16 và 12/15 |
| `fixtures/sections-I-II.json` | 15 | I đúng 0/1/4, null, ID lạ/thuộc câu khác; II k=0..4, key false với null/thiếu, ID ý lạ |
| `fixtures/exhaustive-II.json` | 1296 | 16 vector đáp án × 81 vector trả lời thuộc {null, false, true} |
| `fixtures/short-answers.json` | 36 | Chuỗi chính xác, số 0 cuối, dấu chấm, âm bốn ký tự, rỗng/null/thiếu, >4, whitespace/Unicode, charset-only probes |
| `fixtures/random-seed-20261114.json` | 256 | 128 đề/bài ngẫu nhiên và 128 bản đổi thứ tự tương ứng |
| **Tổng** | **1632** | Schema `m1-fixture-v1` |

Mỗi file chỉ có `schema` và `cases`. Mỗi ca chỉ có `id`, `exam`, `attempt`,
`expected`; exam/attempt đúng kiểu hợp đồng. Expected chỉ chứa score/max từng
phần, total và maxTotal. Tất cả điểm là chuỗi phân số tối giản; số nguyên không
có `/1`, số 0 viết `"0"`. Không có trường điểm dạng JSON Number.

Bảng golden gồm `(20,0,0)`, `(0,4,0)`, `(20,10,0)`, `(20,10,4)`, `(12,4,6)`,
`(0,0,3)`, `(0,0,7)`, `(39,0,3)`, `(40,0,3)`, `(41,0,3)`. Các ca chỉ đúng một
câu III giúp consumer kiểm trọng số `10/3`, `10/7`, `1/12`, `1/4`, `1/2`
qua schema kết quả hiện có, không cần thêm trường `pointIII` ngoài schema.

Ca `report-11-of-16`: I đạt `3` trên `5`; II đạt `15/2` trên `10`; III đạt
`1/2` trên `1`; total `11`, maxTotal `16`. Ca `report-12-of-15` giữ nguyên
total `12`, maxTotal `15`, không đổi về thang 10.

Seed cố định **20261114**, bộ sinh `random.Random` của Python chuẩn (MT19937),
128 cấu hình lấy `N1∈[0,44]`, `N2∈[0,12]`, `N3∈[0,9]`, thay cấu hình toàn
0 bằng `(1,0,0)`. Mỗi bài có lựa chọn đúng/sai/null/ID lạ, ý đúng/sai/null/thiếu,
chuỗi đúng/sai/không hợp lệ, câu thiếu response. Ca `-permuted` đổi thứ tự câu
trong từng phần, trộn options riêng từng câu I và đảo responses/answers,
giữ nguyên IDs và điểm. Có seed và chỉ số trong ID để định vị lỗi.
Để tái tạo đúng bytes, dùng runtime được ghi trong evidence bên dưới;
consumer chỉ cần đọc fixtures, không cần tái hiện PRNG bằng JavaScript.

Test acceptance của sản phẩm có thể đọc từng ca, gọi engine với `exam` và
`attempt`, rồi so score/max với `expected` sau khi chuyển Rational thành
chuỗi chuẩn. Không dùng oracle để tính lại expected bằng code sản phẩm.
Fixtures này không chứa bài sai schema, trạng thái từng câu hay mã lỗi:
chúng không thay thế unit tests validator/judge/serialization.

## Hai cách tính và tự kiểm

1. `score_fraction` dùng `fractions.Fraction`, chép trực tiếp công thức nghiệp
   vụ, bảng II `[0, 1/10, 1/4, 1/2, 1]`, so ID và chuỗi raw chính xác.
2. `score_integer` tự đếm lại đáp án bằng bit mask và so bytes UTF-8 cho III,
   không gọi Fraction, bảng điểm hay hàm tính maxima của cách 1. Đặt
   `B=25*N1+100*N2`, `D=N3 or 1`; `U=0` nếu không có III, `1000-B` nếu
   `B<1000`, còn lại `25*N3`. Với `C1`, `C3` là số đúng của I, III và
   `T2=sum([0,10,25,50,100][k])`, tổng là
   `((25*C1+T2)*D+C3*U)/(100*D)`. Từng phần và maxima cũng tính bằng số
   nguyên, sau đó tự rút gọn bằng `gcd` để so mọi trường expected.

11 bài tự kiểm bao gồm: schema/ID duy nhất; đối chiếu cả 1.632 ca bằng hai
cách và kiểm không sửa input; literal golden maxima/trọng số; literal báo
cáo/điểm từng phần; phân bố đầy đủ của 1.296 ca II; literal outcomes cho III;
bounds và tổng các phần; đúng hết = max/bỏ hết = 0 cho 128 đề ngẫu nhiên;
bất biến hoán vị; counts không hợp lệ; đối chứng lỗi. Ngoài fixtures, quét
**5.849** cấu hình maxima (`45×13×10−1`) đối chiếu công thức số nguyên.

9 đối chứng thực thi các cách tính cố tình sai: II tuyến tính `k/4`, null
thành false, III so giá trị số, trim, cắt bốn ký tự, ép max về 10, làm tròn
từng câu trước khi cộng, ghép lựa chọn theo chỉ số bỏ qua ID câu, dùng
`BASE<=10` thay cho `<10`. Mỗi mutant phải khác expected của một ca đã neo
bằng literal. Đây là đối chứng của công cụ, chưa phải mutation test engine.
`Decimal` chỉ xuất hiện trong mutant cố tình sai; đáp án III không được parse
số trong hai oracle thật. Không làm tròn hoặc cộng bằng float trong chấm điểm.

`--check` tái tạo dữ liệu trong RAM, so **từng byte** với file trên đĩa, đọc
lại JSON, kiểm schema và tính lại bằng số nguyên. Kiểm này phát hiện fixtures
bị sửa/stale; chỉnh file bằng tay sẽ không còn vượt qua regeneration check.

## Phạm vi và quyết định còn mở

Chỉ kiểm charset/độ dài theo `sa-charset-v1`, không tự quyết cú pháp chi tiết:
`01`, `-0`, `,5`, `1,`, `--1`, `1,,` là các probe của policy hiện có, không
phải phê duyệt ngữ pháp tương lai. Rỗng/null/thiếu không được điểm; raw sai
charset/độ dài không thể bằng key hợp lệ, vì thế cũng không được điểm.
Fixtures không trim, chuẩn hóa Unicode, cắt hoặc chuyển số. Kiểm chuỗi raw
không chứng nhận đã chạy paste/mobile/IME thật.

Chưa quyết chính sách làm tròn hiển thị; công cụ chỉ xuất phân số chính xác.
Giới hạn 1.000 câu dùng để kiểm cấu trúc fixtures theo hợp đồng kỹ thuật,
không phê duyệt giới hạn sản phẩm. Thứ tự đổi trong random giữ nhóm I→II→III
theo hợp đồng task, không quyết chính sách trộn cuối cùng.

Không chạy engine, test TypeScript, UI, mạng, lưu trữ, build, lint hay deploy.
Typecheck: **NOT_RUN (tsc chưa cài theo hợp đồng)**. Kết quả oracle không phải
nghiệm thu milestone M1; cần worker acceptance/reviewer đối chiếu SUT riêng.

## Evidence chạy thật — 2026-11-14

Môi trường: Windows/PowerShell, Python **3.11.0**, cwd `D:\Cunata`, branch
`main`, HEAD/base `2ee84e35ea7b2d5b8097a6e538f4c991882feb67`. Các file của
task đang ở working tree, chưa commit; HEAD này là base, không phải commit
chứa oracle. Task không sửa các thay đổi sẵn có của worker khác.

| Lệnh | Exit | Kết quả |
| --- | ---: | --- |
| `python -B test/oracle/oracle.py --write` | 0 | 11 tests pass, 0 fail, 0 skip; sinh 1.632 ca/5 file; duration 0,8225 s |
| `python -B test/oracle/oracle.py --check` | 0 | 11 tests pass, 0 fail, 0 skip; kiểm 1.632 ca/5 file trên đĩa; duration 1,0678 s |

Cả hai lần đều quét 5.849 cấu hình maxima và qua 9 đối chứng lỗi.
Duration là tổng thời gian script tự đo, không phải riêng thời gian unittest.
Đây là evidence công cụ oracle, **không có số test pass của engine sản phẩm**.
