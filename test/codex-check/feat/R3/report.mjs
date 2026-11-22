// Produce a review from completed, measured runs. Never infer a PASS.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const dir = new URL('./', import.meta.url);
const evidence = JSON.parse(readFileSync(new URL('evidence.json', dir), 'utf8'));
if (evidence.runs.length !== 2 || !('after' in evidence)) throw new Error('Cần hai lần chạy hoàn tất trước khi viết bàn giao');
const logs = [1,2].map(i => readFileSync(new URL(`run-${i}.log`, dir), 'utf8'));
const cases = logs.map(log => log.split('ℹ tests')[0].split(/\r?\n/).flatMap(line => {
  const m = /^([✔✖]) (dist: \[.*?\] R3: .*? \(WEB-contract §23\)) \(/.exec(line);
  return m ? [{name:m[2], status:m[1] === '✔' ? 'PASS' : 'FAIL'}] : [];
}));
if (cases[0].length !== 35 || cases[1].length !== 35) throw new Error('Không đọc được đủ ca từ log thực');
if (cases.some(run=>run.filter(c=>c.status==='PASS').length!==2)) throw new Error('Kết quả đã đổi; phải cập nhật nhận định báo cáo từ log mới');
const browserEvidence = readdirSync(dir).filter(p=>/^failure-.*\.json$/.test(p)).map(p=>({path:p, ...JSON.parse(readFileSync(new URL(p, dir), 'utf8'))}));
function cause(c) {
  if (c.status === 'PASS') return 'Tiền điều kiện R2 hoạt động';
  const b = browserEvidence.find(b=>b.test===c.name);
  if (b) {
    if (b.error.includes('UNKNOWN_ACTION')) return '`addStudents` → `UNKNOWN_ACTION`; chưa tới thao tác UI R3';
    if (b.error.includes('#rosterPanel')) return 'Đã mở chi tiết lớp; thiếu `#rosterPanel`';
    if (b.error.includes('#rosterInput')) return 'Thiếu `#rosterInput` để nhập danh sách';
    if (b.error.includes('lớp rỗng')) return 'Không hiện thông báo lớp chưa có danh sách';
    return b.error.replaceAll('|', '\\|');
  }
  return /token thiếu|myResults không cho/.test(c.name)
    ? 'Hành động chưa có: nhận `UNKNOWN_ACTION`, cần `UNAUTHORIZED`'
    : '`addStudents` → `UNKNOWN_ACTION`; chưa tới kiểm tra tiếp theo';
}
function bullet(name) {
  if (/tiền điều kiện/.test(name)) return '§22, §19.2 (nền cho §23)';
  if (/bảng kết quả/.test(name)) return '§23 gạch 5';
  if (/máy sạch khác/.test(name)) return '§23 gạch 2–4; §20';
  if (/myResults/.test(name)) return '§23 gạch 4; §22';
  if (/bài nộp|gán bài/.test(name)) return '§23 gạch 3; §22';
  if (/đặt lại PIN|xóa học sinh/.test(name)) return '§23 gạch 1–2';
  if (/đăng nhập|đúng PIN trả|PIN sai|sai 5 lần|mã lớp hiện|lớp chưa|ID học sinh/.test(name)) return '§23 gạch 2';
  return '§23 gạch 1; §22';
}
const rows = cases[0].map((c,i)=>{
  if (cases[1][i].name !== c.name) throw new Error('Danh sách ca thay đổi giữa hai lần chạy');
  if (cases[1][i].status !== c.status) throw new Error('Có ca không ổn định giữa hai lần chạy');
  return `| ${i+1} | ${c.name.replace('dist: ', '').replace(' (WEB-contract §23)', '')} | ${bullet(c.name)} | ${c.status} / ${cases[1][i].status} | ${cause(c)} |`;
}).join('\n');
const runRows = evidence.runs.map((r,i)=>`| ${i+1} | ${r.started} → ${r.ended} | ${r.exit} | ${r.summary.join('; ')} |`).join('\n');
const changed = Object.keys(evidence.before).filter(p=>evidence.before[p]!==evidence.after[p]);
const text = `# R3-TESTS-PRE — Kiểm định trước khi làm sản phẩm

RESULT: R3-TESTS-PRE / READY_FOR_REVIEW

Ngày đo: 21/11/2026. Baseline HEAD: \`9a1b0e1eb3d52bb7e144a55b3901d4a359b09b41\`, nhánh \`main\`, working tree có thay đổi sẵn của các worker khác. Không commit, không build lại dist, không deploy, không thêm dependency. READY_FOR_REVIEW áp dụng cho bộ test trước triển khai, **không phải nghiệm thu R3**.

Nguồn: Shared Product Contract v2.0; WEB-contract đọc toàn bộ, đặc biệt §19–23; DESIGN.md; BANG-QUYET-DINH.md; LO-TRINH-V2.md mục R3. Giữ tên nhập ở cổng tên cho bước vào khu học sinh; khi làm bài trong lớp phải dùng tên danh sách đã xác nhận PIN (§23).

## Kết quả thực đo

Chạy tại \`${evidence.cwd}\`, Node \`${evidence.node}\`, Windows, Chrome/Edge headless qua harness CDP có sẵn. Lệnh cho **cả hai lần**: \`node --test ops/roadmap/tests/R3/\`. Trình chạy \`verify.mjs\` chỉ thu stdout/stderr nguyên UTF-8 và exit code; không biến kết quả đỏ thành xanh.

| Lần | Thời gian UTC | Exit | Số đo từ node:test |
|---|---|---|---|
${runRows}

Hai lần cùng 35 ca: **2 PASS, 33 FAIL, 0 skip, 0 cancelled**. Hai ca xanh là nền API và browser R2. Các ca đỏ bắt đúng tính năng chưa có: API trả UNKNOWN_ACTION; giao diện chưa có rosterPanel/rosterInput và thông báo lớp rỗng. Không có lỗi import, lỗi HTTP adapter, hook failure hoặc test timeout tổng 90 giây trong hai lần này. Timeout chờ DOM 5/10 giây bên trong ca là kiểm tra phần tử/tin nhắn chưa được triển khai, xem ảnh và JSON tương ứng.

Hai typecheck đã chạy mới: \`npx --no-install tsc -p tsconfig.json\` exit=0 và \`npx --no-install tsc -p tsconfig.web.json\` exit=0; compiler 7.0.2. Đã xác nhận lại bằng \`node node_modules/typescript/bin/tsc -p <config>\`, cả hai exit=0; lệnh và kết quả nằm trong \`typecheck-main.log\`, \`typecheck-web.log\` ở thư mục R3 (đã thay kết quả lỗi cũ).

Hash trước/sau của các file được liệt kê trong \`evidence.json\`: **${evidence.stable ? 'không đổi' : 'có thay đổi'}**.${changed.length ? ` File đổi: ${changed.map(p=>'\`'+p+'\`').join(', ')}. Không coi hai lần này là kiểm tra trên một snapshot bất biến.` : ' Đây là tập hash được chọn, không phải chứng nhận toàn bộ working tree bất biến.'}

## Danh sách từng ca

Tên đầy đủ trong log thêm tiền tố \`dist: \` và hậu tố \`(WEB-contract §23)\`. Gạch 1–5 dưới đây là năm gạch đầu dòng của §23, không tạo điều khoản mới.

| # | Ca | Điều khoản | Lần 1 / 2 | Nguyên nhân đo được |
|---|---|---|---|---|
${rows}

## Phủ yêu cầu và giới hạn bằng chứng

- **Gạch 1:** thêm tên nhiều dòng/Unicode; ID bền; PIN chuỗi 4 chữ số, khác nhau trong lớp qua nhiều đợt và reset; lưu băm; từ chối token sai và giáo viên khác cho cả bốn hành động; reset/xóa đúng học sinh; rosterPanel/input/save/print; tên và PIN trong luồng in thật. Viewport 375/768/1440, cuộn tới rồi đo toàn phần tử trong khung nhìn trước khi bấm.
- **Gạch 2:** mã lớp → chọn tên → PIN; sai PIN có lỗi và không mở bài; lớp rỗng có nguyên câu báo quy định; đúng PIN trả studentToken/name; sai lớp/ID bị từ chối; 5 lần sai khóa ở máy chủ, kiểm ranh 599999/600000 ms bằng ctx.now; học sinh khác không bị khóa; đăng nhập đúng ngắt chuỗi sai; client mới không bỏ được khóa.
- **Gạch 3:** candidateName chỉ đọc, khớp roster thay tên tự do ở cổng; submit thực gửi student_id; máy chủ không nhận danh tính giả của học sinh khác; retry không thêm kết quả.
- **Gạch 4:** myResults cần studentToken và cách ly từng học sinh, giữ nhiều lượt và thông tin đề/lớp/bài giao/điểm từng phần/thời điểm/câu trả lời; đăng nhập lại bằng context sạch không sao chép localStorage/IndexedDB. Thẻ phải hiện Đã nộp + điểm, nút Xem kết quả dựng báo cáo §20 đủ đề bài, 4 phương án và 4 mệnh đề, đáp án/chọn, trả lời ngắn và lời giải; kiểm điểm gốc 10/10 cùng từng phần trước khi so sánh.
- **Gạch 5:** chọn lớp/bài giao bằng select thật; resultsTable gồm cả học sinh đã nộp có điểm và từng học sinh chưa nộp có chữ Chưa nộp.

**Giới hạn:** nhiều ca phụ thuộc addStudents đang dừng ngay tại API thiếu, nên các assertion phía sau (khóa, in, nộp định danh, myResults, báo cáo máy khác và bảng chưa nộp) **chưa chạy tới**. Không coi chúng là lỗi downstream đã chứng minh, hoặc là các luồng đã xác minh hoàn chỉnh. Chưa đo uniqueness dưới concurrency, Neon thật, dịch vụ thật, IME OS, toàn bộ ma trận sáng/tối/keyboard hay hồi quy toàn dự án. Đây là bộ test trước triển khai; phải chạy lại khi R3 có sản phẩm. Không cần tự quyết thêm thời hạn studentToken, quy tắc tên trùng hay khả năng truy hồi PIN cũ từ hash; không áp các policy chưa được hợp đồng chốt. PIN mới lấy từ phản hồi thêm/reset; tải lại chỉ bắt buộc còn danh sách, không yêu cầu đảo ngược hash.

## Cách chạy và bằng chứng

- Chạy lệnh trên từ gốc dự án. \`index.js\` là entrypoint cho đối số thư mục của Node 24; import hai file *.test.mjs. \`support.mjs\` import harness/app và src/api/index.ts bằng pathToFileURL(process.cwd() + ...), nên phần test không phụ thuộc độ sâu thư mục khi chuyển sang test/codex-check/feat/R3/.
- API gọi production handle + createMemoryStore. Browser gọi cùng handle qua Node HTTP localhost; public/config.json chỉ được override trong bộ nhớ với apiBase loopback. Không fake R3 response, không đổi hành vi theo môi trường, không gán value bằng JS, không sửa product source/dist.
- Mọi nút dùng helper mouseClick trong app.mjs; text nhập qua CDP Input.insertText sau chuột thật và Ctrl+A. Không gọi DOM click. Luồng in quan sát beforeprint thật, không thay window.print bằng stub thành công.
- Browser sạch và cấu hình localhost; chặn HTTPS trong trang thử. Không đọc ops/prod_config.json, không gọi Google/Vercel/Neon thật. Dữ liệu tên/lớp/tài khoản là mô phỏng.
- \`run-1.log\`, \`run-2.log\`, \`evidence.json\`: lệnh/exit/số ca/hash. \`failure-*.json\`: tên ca, lỗi, hành động RPC, văn bản trang nếu đã mở. \`failure-*.png\`: ảnh thật khi đã có trang. Các ảnh/JSON cùng tên được cập nhật bởi lần 2; hai log giữ riêng kết quả hai lần. Đã xem ảnh viewport 375px: chi tiết lớp và đề giao hiện bình thường nhưng chưa có roster. Favicon 404 chỉ là log phụ, không phải lý do test đỏ.

Khuyến nghị: giao worker R3 triển khai §23 trong phạm vi sản phẩm được điều phối cấp; giữ nguyên assertions rồi chạy lại hai lần. Chưa phê duyệt R3, chưa chuyển test sang thư mục ngoài phạm vi được cấp.
`;
writeFileSync(new URL('../../../../docs/reviews/ROADMAP-R3-tests.md', dir), text, 'utf8');
console.log('Wrote review: 35 measured cases, two runs');
