// BỘ KIỂM ĐỊNH WEB CỦA PHÓ PHÒNG (Claude) — chạy trên trình duyệt thật, cả index.html gốc lẫn dist/.
//   node --test "test/claude-check/**/*.test.mjs"
// Mỗi ca tên có nhãn [vùng] để điều phối giao đúng worker sửa. Worker KHÔNG được sửa file trong thư mục này:
// test đỏ nghĩa là SẢN PHẨM sai so với Shared Product Contract; nếu cho rằng test sai thì ghi NEED_DECISION kèm lý do.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { launchBrowser, sleep, startServer } from './harness.mjs';
import {
  SECRET, TARGETS, isVisible, loadExam, makeExam, near, openApp, pageProblems, pickOption, qI, qII, qIII, readReport,
  setName, setStatement, shortValue, submit, timerSeconds, typeShort, waitBoot, waitReport, waitSaved,
} from './app.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

for (const target of TARGETS) {
  describe(`${target.name} — ${target.label}`, { concurrency: 3 }, () => {
    let server;
    before(async () => { server = await startServer(target.dir); });
    after(async () => { await server?.close(); });

    /** Chạy một ca trong hồ sơ trình duyệt sạch; luôn đóng lại. */
    const run = (name, fn) => test(`${target.name}: ${name}`, { timeout: 120000 }, async () => {
      const ctx = await browser.newContext();
      try { await fn(ctx); } finally { await ctx.close(); }
    });

    run('[app][glue] khởi động: hiện đề mẫu, không lỗi JS, không request hỏng, chạy được dưới đường dẫn con /Cunata/', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await sleep(800);
      const cards = await page.eval(() => document.querySelectorAll('#examPane .question-card').length);
      assert.ok(cards >= 1, 'phải hiện ít nhất một câu hỏi của đề mẫu');
      assert.deepEqual(pageProblems(page), [], 'không được có lỗi JS hay request lỗi khi khởi động');
      assert.deepEqual(server.hits.filter((h) => !h.startsWith('/Cunata/') && !/favicon/.test(h)), [], 'không được gọi đường dẫn tuyệt đối ngoài /Cunata/');
    });

    run('[student][report] chấm đúng đề 4-2-2: Phần I 0,25/câu; Phần II theo số ý đúng; Phần III = (10 − 3)/2 mỗi câu', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam());
      await pickOption(page, qI(1), 'a');            // đúng
      await pickOption(page, qI(2), 'c');            // đúng
      await pickOption(page, qI(3), 'a');            // sai (đáp án b); câu 4 bỏ trống
      for (const [i, v] of [[0, true], [1, false], [2, true], [3, true]]) await setStatement(page, qII(1), i, v);   // 3 ý đúng -> 0,5
      await setStatement(page, qII(2), 0, false); await setStatement(page, qII(2), 2, true);                     // 2 ý đúng, 2 ý trống -> 0,25
      await typeShort(page, qIII(1), '0,5');         // đúng -> 3,5
      await typeShort(page, qIII(2), '12');          // sai (đáp án -12)
      await waitSaved(page);
      await submit(page);
      const r = await readReport(page);
      assert.ok(near(r.I, [0.5, 1]), `Phần I phải là 0,5 / 1, thực tế "${r.raw.I}"`);
      assert.ok(near(r.II, [0.75, 2]), `Phần II phải là 0,75 / 2, thực tế "${r.raw.II}"`);
      assert.ok(near(r.III, [3.5, 7]), `Phần III phải là 3,5 / 7, thực tế "${r.raw.III}"`);
      assert.ok(near(r.total, [4.75, 10]), `Tổng phải là 4,75 / 10, thực tế "${r.raw.total}"`);
      assert.deepEqual(pageProblems(page), [], 'không lỗi JS trong suốt luồng làm bài → nộp → báo cáo');
    });

    run('[student] thang điểm Phần II 0 – 0,1 – 0,25 – 0,5 – 1; ý bỏ trống KHÔNG được coi là "Sai"', async (ctx) => {
      const page = await openApp(ctx, server, target);
      const keys = [true, false, true, false];
      // 5 câu đầu: câu thứ k có đúng k ý đúng, các ý còn lại trả lời sai. Câu 6: đáp án toàn "Sai", học sinh bỏ trống hết.
      const exam = makeExam({ id: 'claude-check-ladder', title: 'Đề kiểm định thang điểm Phần II', part1: ['a'],
        part2: [keys, keys, keys, keys, keys, [false, false, false, false]], part3: ['7'] });
      await loadExam(page, exam);
      for (let k = 0; k <= 4; k++) for (let j = 0; j < 4; j++) await setStatement(page, qII(k + 1), j, j < k ? keys[j] : !keys[j]);
      await waitSaved(page);
      await submit(page);
      const r = await readReport(page);
      assert.ok(near(r.II, [1.85, 6]), `Phần II phải là 0+0,1+0,25+0,5+1+0 = 1,85 / 6, thực tế "${r.raw.II}" (nếu ra 2,85 thì ý bỏ trống đang bị coi là Sai)`);
      assert.ok(near(r.total, [1.85, 10]), `Tổng phải là 1,85 / 10, thực tế "${r.raw.total}"`);
    });

    run('[student] Phần III: chỉ nhận 0-9 , - ; tối đa 4 ký tự; so khớp chuỗi chính xác (0,50 ≠ 0,5)', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam());
      await typeShort(page, qIII(1), 'ab1.2x');     // dán / gõ IME chuỗi có ký tự ngoài chính sách sa-charset-v1
      const bad = await page.eval((s) => { const e = document.querySelector(s); return { value: e.value, invalid: e.getAttribute('aria-invalid') }; }, `[id="qcard-${qIII(1)}"] .short-answer-input`);
      assert.ok(/^[0-9,-]{0,4}$/.test(bad.value) || bad.invalid === 'true',
        `ký tự ngoài 0-9 , - không được nhận im lặng: phải bị loại khỏi ô, hoặc ô phải được đánh dấu aria-invalid="true" (thực tế value="${bad.value}", aria-invalid=${bad.invalid})`);
      await typeShort(page, qIII(1), '123456');
      assert.ok((await shortValue(page, qIII(1))).length <= 4, 'ô trả lời ngắn không được giữ quá 4 ký tự');
      await typeShort(page, qIII(1), '0,50');        // đáp án là "0,5" -> sai vì so chuỗi
      await typeShort(page, qIII(2), '-12');         // đúng
      assert.equal(await shortValue(page, qIII(1)), '0,50');
      assert.equal(await shortValue(page, qIII(2)), '-12');
      await waitSaved(page);
      await submit(page);
      const r = await readReport(page);
      assert.ok(near(r.III, [3.5, 7]), `Phần III phải là 3,5 / 7 (chỉ câu "-12" đúng), thực tế "${r.raw.III}"`);
    });

    run('[student][report] không chuẩn hóa về thang 10: đề 8-8-2 làm đúng hết phải ra 10,5 / 10,5', async (ctx) => {
      const page = await openApp(ctx, server, target);
      const p2 = Array.from({ length: 8 }, (_, i) => [i % 2 === 0, true, false, i % 3 === 0]);
      const exam = makeExam({ id: 'claude-check-882', title: 'Đề kiểm định 8-8-2 (BASE = 10)', part1: ['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd'], part2: p2, part3: ['1', '2'] });
      await loadExam(page, exam);
      for (let i = 0; i < 8; i++) await pickOption(page, qI(i + 1), 'abcdabcd'[i]);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) await setStatement(page, qII(i + 1), j, p2[i][j]);
      await typeShort(page, qIII(1), '1'); await typeShort(page, qIII(2), '2');
      await waitSaved(page);
      await submit(page);
      const r = await readReport(page);
      assert.ok(near(r.I, [2, 2]), `Phần I phải là 2 / 2, thực tế "${r.raw.I}"`);
      assert.ok(near(r.II, [8, 8]), `Phần II phải là 8 / 8, thực tế "${r.raw.II}"`);
      assert.ok(near(r.III, [0.5, 0.5]), `Phần III phải là 0,5 / 0,5 (0,25 mỗi câu khi BASE ≥ 10), thực tế "${r.raw.III}"`);
      assert.ok(near(r.total, [10.5, 10.5]), `Tổng phải là 10,5 / 10,5 (không quy về 10), thực tế "${r.raw.total}"`);
    });

    run('[storage][student] tải lại trang: giữ nguyên bài làm, tên thí sinh và đồng hồ chạy tiếp theo mốc thời gian', async (ctx) => {
      const page = await openApp(ctx, server, target);
      const exam = makeExam();
      await loadExam(page, exam);
      await setName(page, 'Trần Bình 0456');
      await pickOption(page, qI(2), 'c');
      await setStatement(page, qII(1), 0, true);
      await typeShort(page, qIII(1), '0,5');
      await waitSaved(page);
      const t1 = await timerSeconds(page);
      assert.ok(t1 !== null && t1 > 49 * 60 - 30 && t1 <= 50 * 60, `đồng hồ phải bắt đầu quanh 50:00, thực tế ${t1} giây`);
      await sleep(2300);
      await page.reload();
      await waitBoot(page);
      const s = await page.eval((q2, q21, sel) => ({
        title: (document.getElementById('examTitle')?.textContent ?? '').trim(),
        name: document.getElementById('candidateName')?.value,
        opt: document.querySelector(`[data-qid="${q2}"][data-option-id="${q2}-c"]`)?.getAttribute('aria-checked'),
        tf: (() => { const b = document.querySelectorAll(`[id="qcard-${q21}"] .statement-row`)[0]?.querySelector('.tf-btn[data-val="true"]'); return !!b && (/selected/.test(b.className) || b.getAttribute('aria-pressed') === 'true'); })(),
        short: document.querySelector(sel)?.value,
      }), qI(2), qII(1), `[id="qcard-${qIII(1)}"] .short-answer-input`);
      assert.equal(s.title, exam.title, 'sau khi tải lại phải mở đúng đề đang làm');
      assert.equal(s.name, 'Trần Bình 0456', 'tên thí sinh phải được khôi phục');
      assert.equal(s.opt, 'true', 'lựa chọn Phần I phải được khôi phục (aria-checked="true")');
      assert.equal(s.tf, true, 'lựa chọn Đúng/Sai phải được khôi phục');
      assert.equal(s.short, '0,5', 'đáp án trả lời ngắn phải được khôi phục');
      const t2 = await timerSeconds(page);
      assert.ok(t2 <= t1 - 2 && t2 >= t1 - 40, `đồng hồ phải chạy tiếp theo mốc thời gian, không đặt lại: trước ${t1}s, sau tải lại ${t2}s`);
    });

    run('[student][storage] quay lại sau khi hết giờ: tự nộp bài đã lưu, giữ đúng tên thí sinh', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam());
      await setName(page, 'Nguyễn An 0123');
      await pickOption(page, qI(1), 'a');
      await waitSaved(page);
      await sleep(600);
      // Lần tải trang sau thấy đồng hồ hệ thống đã trôi 3 giờ (đề 50 phút) — như học sinh đóng máy rồi mở lại sau hạn.
      await page.addInitScript(`(() => { const R = Date, skew = 3 * 3600 * 1000; class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + skew); else super(...a); } static now() { return R.now() + skew; } } window.Date = D; })();`);
      await page.reload();
      await waitReport(page, 15000);
      const r = await readReport(page);
      assert.match(r.subtitle + ' ' + r.reportText, /Nguyễn An 0123/, `báo cáo phải giữ tên đã lưu, thực tế dòng thí sinh: "${r.subtitle}"`);
      assert.ok(near(r.I, [0.25, 1]), `bài tự nộp phải chấm theo bài đã lưu: Phần I 0,25 / 1, thực tế "${r.raw.I}"`);
    });

    run('[report][ui] tên chứa mã HTML không được chạy; báo cáo tải về tự chứa, đúng điểm, đã escape', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam());
      const evil = '<img src=x onerror="window.__xss=1">An';
      await setName(page, evil);
      await pickOption(page, qI(1), 'a');
      await waitSaved(page);
      await submit(page);
      await sleep(300);
      assert.equal(await page.eval(() => window.__xss ?? null), null, 'mã trong tên thí sinh đã bị thực thi trên trang báo cáo');
      const r = await readReport(page);
      assert.ok((r.subtitle + r.reportText).includes('<img src=x'), 'tên phải hiện nguyên văn dạng chữ trên báo cáo');
      await page.click('#btnDownloadReportHtml');
      const dl = await ctx.waitDownload();
      assert.match(dl.name, /\.html?$/i, 'file báo cáo tải về phải là .html');
      assert.ok(!/<img src=x onerror/i.test(dl.text), 'file báo cáo chứa thẻ chưa escape từ tên thí sinh');
      assert.ok(!/<script[^>]+src=/i.test(dl.text), 'file báo cáo không được nạp script bên ngoài');
      assert.ok(!/<link[^>]+href=["']?https?:/i.test(dl.text), 'file báo cáo không được nạp stylesheet từ mạng');
      const view = await ctx.newPage();
      await view.goto(pathToFileURL(join(ctx.downloadDir, dl.name)).href);
      const seen = await view.eval(() => ({ xss: window.__xss ?? null, text: document.body.innerText }));
      assert.equal(seen.xss, null, 'mở file báo cáo tải về đã chạy mã chèn trong tên');
      assert.ok(seen.text.includes('<img src=x'), 'file báo cáo phải hiện tên nguyên văn');
      assert.match(seen.text, /0[.,]25/, 'file báo cáo phải có điểm 0,25');
    });

    run('[report][student] chính sách after_deadline: nộp sớm không được lộ đáp án và lời giải (cả trang lẫn file tải về)', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam({ id: 'claude-check-policy', title: 'Đề kiểm định chính sách công bố', settings: { releasePolicy: 'after_deadline' } }));
      await pickOption(page, qI(1), 'b');
      await waitSaved(page);
      await submit(page);
      const html = await page.eval(() => document.documentElement.outerHTML);
      assert.ok(!html.includes(SECRET), 'lời giải bị lộ trong trang báo cáo dù chính sách là after_deadline và chưa hết giờ');
      const text = await page.eval(() => document.getElementById('reportWrapper')?.innerText ?? '');
      assert.ok(!/Đáp án chuẩn\s*:\s*[A-D]\b/.test(text), 'đáp án chuẩn bị lộ trên báo cáo dù chưa hết giờ');
      await page.click('#btnDownloadReportHtml');
      const dl = await ctx.waitDownload();
      assert.ok(!dl.text.includes(SECRET), 'file báo cáo tải về làm lộ lời giải trước hạn');
    });

    run('[student] hai tab cùng bài: nộp ở tab A thì tab B không tạo kết quả khác', async (ctx) => {
      const a = await openApp(ctx, server, target);
      await loadExam(a, makeExam());
      await pickOption(a, qI(1), 'a');
      await waitSaved(a);
      const b = await openApp(ctx, server, target);
      await b.waitFor((t) => (document.getElementById('examTitle')?.textContent ?? '').trim() === t, 'tab B mở đúng đề đang làm', 8000, makeExam().title);
      await submit(a);
      const ra = await readReport(a);
      assert.ok(near(ra.total, [0.25, 10]), `tab A: tổng phải 0,25 / 10, thực tế "${ra.raw.total}"`);
      // Tab B (cũ) cố trả lời thêm rồi nộp.
      if (await isVisible(b, 'examWrapper')) {
        await b.eval((q) => document.querySelector(`[data-qid="${q}"][data-option-id="${q}-c"]`)?.click(), qI(2));
        await sleep(300);
        if (await isVisible(b, 'btnSubmit')) {
          await b.eval(() => document.getElementById('btnSubmit')?.click());
          await sleep(400);
          if (await isVisible(b, 'submitModal')) await b.eval(() => document.getElementById('btnConfirmSubmit')?.click());
        }
      }
      await waitReport(b, 15000);
      const rb = await readReport(b);
      assert.ok(near(rb.total, [0.25, 10]), `tab B phải nhận kết quả đã chốt ở tab A (0,25 / 10), thực tế "${rb.raw.total}"`);
      await a.reload(); await waitReport(a, 15000);
      const ra2 = await readReport(a);
      assert.ok(near(ra2.total, [0.25, 10]), `sau khi tải lại, kết quả đã chốt không được đổi: "${ra2.raw.total}"`);
    });

    run('[student] maxAttempts = 1: nộp xong không bắt đầu được lượt thứ hai', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam({ id: 'claude-check-once', title: 'Đề kiểm định một lượt', settings: { maxAttempts: 1 } }));
      await pickOption(page, qI(1), 'a');
      await waitSaved(page);
      await submit(page);
      await page.eval(() => { const b = document.getElementById('btnRestart'); if (b && !b.disabled && getComputedStyle(b).display !== 'none') b.click(); });
      await sleep(1200);
      assert.equal(await isVisible(page, 'examWrapper'), false, 'đề giới hạn 1 lượt: không được mở lại màn hình làm bài');
      await page.reload(); await waitReport(page, 15000);
      const r = await readReport(page);
      assert.ok(near(r.total, [0.25, 10]), `kết quả lượt duy nhất phải còn nguyên: "${r.raw.total}"`);
    });

    run('[student][storage] làm lại (không giới hạn lượt): lượt mới sạch, không mang đáp án cũ', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam());
      await pickOption(page, qI(1), 'a');
      await typeShort(page, qIII(2), '-12');
      await waitSaved(page);
      await submit(page);
      await page.click('#btnRestart');
      await page.waitFor(() => { const e = document.getElementById('examWrapper'); return !!e && getComputedStyle(e).display !== 'none' && document.querySelectorAll('#examPane .question-card').length > 0; },
        'bấm "làm lại" (#btnRestart) mở lượt làm bài mới', 8000);
      const st = await page.eval((sel) => ({ checked: document.querySelectorAll('#examPane [aria-checked="true"]').length, short: document.querySelector(sel)?.value }), `[id="qcard-${qIII(2)}"] .short-answer-input`);
      assert.equal(st.checked, 0, 'lượt mới không được còn lựa chọn của lượt cũ');
      assert.equal(st.short, '', 'lượt mới không được còn đáp án ngắn của lượt cũ');
      await submit(page);
      const r = await readReport(page);
      assert.ok(near(r.total, [0, 10]), `lượt mới nộp trắng phải 0 / 10, thực tế "${r.raw.total}"`);
    });

    run('[ui] hộp thoại nộp bài: tiêu điểm vào trong hộp thoại, Esc đóng và trả tiêu điểm về nút Nộp bài', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await page.eval(() => { const b = document.getElementById('btnSubmit'); b.focus(); b.click(); });
      await page.waitFor(() => { const e = document.getElementById('submitModal'); return !!e && getComputedStyle(e).display !== 'none'; }, 'hộp thoại nộp bài hiện', 5000);
      await sleep(300);
      assert.equal(await page.eval(() => !!document.activeElement && document.getElementById('submitModal').contains(document.activeElement)), true,
        'khi hộp thoại mở, tiêu điểm bàn phím phải nằm trong hộp thoại');
      await page.press('Escape');
      await sleep(300);
      assert.equal(await isVisible(page, 'submitModal'), false, 'phím Esc phải đóng hộp thoại nộp bài');
      assert.equal(await page.eval(() => document.activeElement?.id ?? ''), 'btnSubmit', 'đóng hộp thoại phải trả tiêu điểm về nút Nộp bài');
      assert.equal(await isVisible(page, 'reportWrapper'), false, 'Esc không được nộp bài');
    });

    run('[ui] bàn phím: chọn phương án Phần I bằng phím cách và phím mũi tên', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam());
      await page.eval((q) => document.querySelector(`[data-qid="${q}"][data-option-id="${q}-a"]`).focus(), qI(1));
      await page.press(' ');
      await sleep(200);
      assert.equal(await page.eval((q) => document.querySelector(`[data-qid="${q}"][data-option-id="${q}-a"]`).getAttribute('aria-checked'), qI(1)), 'true', 'phím cách phải chọn phương án đang có tiêu điểm');
      await page.press('ArrowDown');
      await sleep(200);
      const st = await page.eval((q) => ({ focus: document.activeElement?.getAttribute('data-option-id') ?? '', checked: [...document.querySelectorAll(`[data-qid="${q}"][aria-checked="true"]`)].map((e) => e.getAttribute('data-option-id')) }), qI(1));
      assert.equal(st.focus, `${qI(1)}-b`, 'mũi tên xuống phải chuyển tiêu điểm sang phương án kế tiếp trong nhóm radio');
      assert.equal(st.checked.length, 1, 'mỗi câu Phần I chỉ được có đúng một phương án được chọn');
    });

    run('[ui] màn hình điện thoại 360px: không tràn ngang ở màn làm bài và màn báo cáo', async (ctx) => {
      const page = await ctx.newPage();
      await page.setViewport(360, 740, true);
      await page.goto(server.url + target.path);
      await waitBoot(page);
      await loadExam(page, makeExam());
      const over = () => page.eval(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(await over() <= 1, `màn làm bài tràn ngang ${await over()}px ở bề rộng 360px`);
      await pickOption(page, qI(1), 'a');
      await submit(page);
      assert.ok(await over() <= 1, `màn báo cáo tràn ngang ${await over()}px ở bề rộng 360px`);
    });

    if (target.name === 'dist') {
      test('dist: [offline] sau lần tải đầu, tắt hẳn máy chủ vẫn mở lại và làm bài được', { timeout: 120000 }, async () => {
        const own = await startServer(target.dir);
        const ctx = await browser.newContext();
        let closed = false;
        try {
          const page = await ctx.newPage();
          await page.goto(own.url + target.path);
          await waitBoot(page);
          await page.waitFor(() => navigator.serviceWorker?.getRegistrations().then((r) => r.some((x) => !!x.active)), 'service worker đã đăng ký và active', 15000);
          await sleep(1500);
          await page.reload(); await waitBoot(page);     // lần 2: service worker đã điều khiển trang, cache đủ
          await sleep(1500);
          await own.close(); closed = true;              // mất mạng thật: máy chủ không còn
          await page.reload();
          await waitBoot(page);
          const cards = await page.eval(() => document.querySelectorAll('#examPane .question-card').length);
          assert.ok(cards >= 1, 'khi mất mạng vẫn phải hiện đề để làm bài');
        } finally {
          await ctx.close();
          if (!closed) await own.close();
        }
      });
    }
  });
}
