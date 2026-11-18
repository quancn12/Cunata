// BỘ KIỂM ĐỊNH WEB CỦA PHÓ PHÒNG (Claude) — chạy trên trình duyệt thật, cả index.html gốc lẫn dist/.
//   node --test "test/claude-check/**/*.test.mjs"
// Mỗi ca tên có nhãn [vùng] để điều phối giao đúng worker sửa. Worker KHÔNG được sửa file trong thư mục này:
// test đỏ nghĩa là SẢN PHẨM sai so với Shared Product Contract; nếu cho rằng test sai thì ghi NEED_DECISION kèm lý do.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, sleep, startServer } from './harness.mjs';
import {
  SECRET, TARGETS, START_NAME, enterFromStart, mouseClick, onStartScreen, onRoleChooser, enterStudentArea, startFromCard, isVisible, loadExam, makeExam, near, openApp, pageProblems, pickOption, qI, qII, qIII, readReport,
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
    // Trưởng phòng 16/11/2026: tính năng MỚI chỉ làm trên bản build dist/; index.html gốc giữ nguyên tới khi chuyển Pages sang dist (V01).
    const runDist = (name, fn) => { if (target.name === 'dist') run(name, fn); };
    const runRoot = (name, fn) => { if (target.name === 'root') run(name, fn); };

    // WEB-contract mục 16 (Trưởng phòng 16/11/2026): "học sinh vào web phải điền tên và chọn đề trước", không tự hiện một đề.
    // WEB-contract 19.1 (Trưởng phòng 16/11/2026: chọn vai Học sinh/Giáo viên trước; học sinh thấy đề dạng thẻ có mô tả).
    // WEB-contract 21 (Trưởng phòng 19/11/2026): đề luyện tập KHÔNG công khai; học sinh chỉ thấy đề khi vào lớp. Đề nạp bằng file dùng tên ở cổng tên.
    runDist('[app][student] mở trang lần đầu: chọn vai → nhập tên → khu học sinh chỉ có ô mã lớp + hướng dẫn, KHÔNG có đề công khai nào (§21)', async (ctx) => {
      const page = await ctx.newPage();
      await page.goto(server.url + target.path);
      await waitBoot(page);
      assert.equal(await onRoleChooser(page), true, 'mở trang lần đầu phải là màn chọn vai #roleChooser');
      assert.equal(await page.eval(() => [...document.querySelectorAll('#examPane .question-card')].filter((c) => c.getClientRects().length > 0).length), 0, 'chưa chọn vai/đề thì không hiện câu hỏi');
      await page.click('#btnRoleStudent');
      await page.waitFor(() => !!document.querySelector('#studentNameGate input#startName'), 'lần đầu vào khu học sinh: cổng nhập tên #studentNameGate', 8000);
      await page.eval(() => { const e = document.getElementById('startName'); e.focus(); e.select(); });
      await page.send('Input.insertText', { text: '   ' });
      await page.eval(() => document.getElementById('startName').dispatchEvent(new Event('input', { bubbles: true })));
      assert.equal(await page.eval(() => document.getElementById('btnNameContinue').disabled), true, 'tên chỉ có khoảng trắng không được tính là đã nhập tên');
      await enterStudentArea(page, { name: 'Lê Minh 12A1' });
      await sleep(800);
      const area = await page.eval(() => {
        const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
        return { practice: vis(document.getElementById('practiceExams')), cards: [...document.querySelectorAll('#startScreen .exam-card, #startScreen .exam-list-item')].filter(vis).length,
          join: vis(document.getElementById('classCodeInput')) && vis(document.getElementById('btnJoinClass')), text: document.getElementById('startScreen')?.innerText ?? '' };
      });
      assert.equal(area.practice, false, 'WEB-contract 21: khu học sinh không còn lưới "Đề luyện tập" #practiceExams công khai');
      assert.equal(area.cards, 0, `WEB-contract 21: chưa vào lớp nào thì không có thẻ đề nào (đề chỉ đến qua lớp); đang thấy ${area.cards} thẻ`);
      assert.equal(area.join, true, 'khu học sinh luôn có ô #classCodeInput và nút #btnJoinClass');
      assert.match(area.text, /mã lớp/i, 'chưa vào lớp: phải có hướng dẫn nhập mã lớp do giáo viên cung cấp');
      // Đề nạp bằng file ẩn (#examFileInput) dùng tên ở cổng tên, không phải "Thí sinh tự do".
      await loadExam(page, makeExam({ id: 'claude-check-ten-cong', title: 'Đề kiểm định tên ở cổng tên' }));
      assert.equal(await page.eval(() => document.getElementById('candidateName')?.value || document.getElementById('candidateName')?.textContent), 'Lê Minh 12A1',
        'WEB-contract 21: đề nạp bằng file phải dùng tên học sinh đã nhập ở cổng tên làm #candidateName');
      assert.deepEqual(pageProblems(page), [], 'không lỗi JS hay request hỏng');
    });

    runDist('[app][student] lần sau mở lại: nhớ vai và tên (không hỏi lại tên); link ?exam= KHÔNG mở đề, báo chỉ làm được khi giáo viên giao (§21)', async (ctx) => {
      const exams = readManifest();
      const page = await openApp(ctx, server, target);
      await submit(page);
      const p2 = await ctx.newPage();
      await p2.goto(server.url + target.path + '?exam=' + encodeURIComponent(exams[0].id));
      await waitBoot(p2);
      assert.equal(await onRoleChooser(p2), false, 'đã chọn vai học sinh lần trước: không hỏi lại vai');
      await p2.waitFor(() => /giáo viên giao/i.test(document.body.innerText), 'WEB-contract 21: mở ?exam= phải báo "Đề này chỉ làm được khi giáo viên giao cho lớp…"', 10000);
      await sleep(500);
      assert.equal(await p2.eval(() => { const p = document.getElementById('examPreview'); return !!p && getComputedStyle(p).display !== 'none'; }), false,
        'WEB-contract 21: link ?exam= không được mở #examPreview của đề công khai');
      assert.equal(await p2.eval(() => { const e = document.getElementById('examWrapper'); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none'; }), false,
        'WEB-contract 21: link ?exam= không được vào bài thi');
      assert.equal(await p2.eval(() => { const g = document.getElementById('studentNameGate'); return !!g && getComputedStyle(g).display !== 'none'; }), false, 'đã có tên: không hiện lại cổng tên');
      assert.ok(await p2.eval((n) => document.body.innerText.includes(n), START_NAME), 'tên đã dùng phải hiện trên trang học sinh (TopBar)');
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
      const page = await openApp(ctx, server, target, { name: 'Trần Bình 0456' });
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
      const page = await openApp(ctx, server, target, { name: 'Nguyễn An 0123' });
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
      const evil = '<img src=x onerror="window.__xss=1">An';
      const page = await openApp(ctx, server, target, { name: evil });
      await loadExam(page, makeExam());
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

    // QUYẾT ĐỊNH D08 của Trưởng phòng (16/11/2026): sau khi nộp, học sinh có lời giải chi tiết của MỌI câu; có mục tải báo cáo.
    // (Thay cho ca "after_deadline không lộ đáp án" trước đây: không còn chế độ giấu lời giải sau khi nộp.)
    for (const policy of ['immediate', 'after_deadline']) {
      run(`[report][student] D08: sau khi nộp, báo cáo hiện lời giải chi tiết của mọi câu, file tải về cũng có (đề ghi releasePolicy=${policy})`, async (ctx) => {
        const page = await openApp(ctx, server, target);
        const exam = makeExam({ id: 'claude-check-d08-' + policy, title: 'Đề kiểm định lời giải sau khi nộp (' + policy + ')', settings: { releasePolicy: policy } });
        await loadExam(page, exam);
        await pickOption(page, qI(1), 'b');            // 1 câu sai, các câu còn lại bỏ trống: vẫn phải có lời giải cho tất cả
        await waitSaved(page);
        await submit(page);
        const count = (s) => s.split(SECRET).length - 1;
        const text = await page.eval(() => document.getElementById('reportWrapper')?.innerText ?? '');
        assert.ok(count(text) >= exam.questions.length, `Quyết định D08: báo cáo phải hiện lời giải của cả ${exam.questions.length} câu (kể cả câu sai, câu bỏ trống); mới thấy ${count(text)} lời giải`);
        await page.click('#btnDownloadReportHtml');
        const dl = await ctx.waitDownload();
        assert.ok(count(dl.text) >= exam.questions.length, `Quyết định D08: file báo cáo tải về phải có lời giải của cả ${exam.questions.length} câu; mới thấy ${count(dl.text)}`);
      });
    }

    // WEB-contract §20 (Trưởng phòng 18/11/2026): khi hiện đáp án thì hiện cả câu hỏi — toàn văn đề, đủ phương án/mệnh đề, đánh dấu đáp án và lựa chọn.
    runDist('[report][student] §20: xem lại bài hiện toàn văn câu hỏi, đủ 4 phương án / 4 mệnh đề, đánh dấu đáp án đúng và lựa chọn của học sinh; file tải về cũng vậy', async (ctx) => {
      const page = await openApp(ctx, server, target);
      const exam = makeExam({ id: 'claude-check-review20', title: 'Đề kiểm định xem lại bài mục 20' });
      await loadExam(page, exam);
      await pickOption(page, qI(1), 'a');                                   // đúng
      await pickOption(page, qI(2), 'b');                                   // sai (đáp án c); câu 3, 4 bỏ trống
      await setStatement(page, qII(1), 0, true); await setStatement(page, qII(1), 1, true);   // ý a đúng, ý b sai; c, d bỏ trống
      await typeShort(page, qIII(1), '0,5');                                // đúng; câu III.2 bỏ trống
      await waitSaved(page);
      await submit(page);
      const seen = await page.eval(() => ({
        title: document.querySelector('#reportWrapper .report-title')?.textContent ?? '',
        cards: [...document.querySelectorAll('#reportWrapper .review-question-card[data-qid]')].map((c) => ({
          qid: c.getAttribute('data-qid'), text: c.innerText,
          options: [...c.querySelectorAll('.review-option[data-option-id]')].map((o) => ({ id: o.getAttribute('data-option-id'), correct: o.getAttribute('data-correct'), chosen: o.getAttribute('data-chosen'), text: o.innerText })),
          statements: [...c.querySelectorAll('.review-statement[data-statement-id]')].map((s) => ({ id: s.getAttribute('data-statement-id'), key: s.getAttribute('data-key'), chosen: s.getAttribute('data-chosen'), text: s.innerText })),
          short: c.querySelector('.review-short-answer')?.innerText ?? null,
        })),
      }));
      assert.ok(seen.title.includes(exam.title), `§20: tiêu đề báo cáo (.report-title) phải là tiêu đề đề đang làm "${exam.title}", thực tế "${seen.title}"`);
      assert.deepEqual(seen.cards.map((c) => c.qid), exam.questions.map((q) => q.questionVersionId), '§20: mỗi câu một .review-question-card[data-qid], đúng thứ tự đã làm');
      const chosenI = { [qI(1)]: 'a', [qI(2)]: 'b' };
      const chosenII = { [qII(1)]: ['true', 'true', 'none', 'none'] };
      for (const q of exam.questions) {
        const c = seen.cards.find((x) => x.qid === q.questionVersionId);
        assert.ok(c.text.includes(q.content), `§20: thẻ ${q.questionVersionId} phải hiện toàn văn đề bài "${q.content}"`);
        assert.ok(c.text.includes(SECRET), `§20/D08: thẻ ${q.questionVersionId} phải có lời giải`);
        if (q.kind === 'I') {
          assert.deepEqual(c.options.map((o) => o.id), q.options.map((o) => o.optionId), `§20: câu ${q.questionVersionId} phải hiện đủ 4 phương án .review-option[data-option-id] theo thứ tự lúc làm`);
          for (const o of q.options) {
            const v = c.options.find((x) => x.id === o.optionId);
            assert.ok(v.text.includes(o.text) && v.text.includes(o.label), `§20: phương án ${o.optionId} phải có nhãn "${o.label}" và toàn văn "${o.text}", thực tế "${v.text}"`);
            assert.equal(v.correct === 'true', o.optionId === q.correctOptionId, `§20: data-correct của ${o.optionId} sai`);
            const pick = chosenI[q.questionVersionId];
            assert.equal(v.chosen === 'true', !!pick && o.optionId === `${q.questionVersionId}-${pick}`, `§20: data-chosen của ${o.optionId} sai`);
          }
          if (!chosenI[q.questionVersionId]) assert.match(c.text, /Chưa chọn/, `§20: câu ${q.questionVersionId} bỏ trống phải ghi "Chưa chọn"`);
        }
        if (q.kind === 'II') {
          assert.deepEqual(c.statements.map((s) => s.id), q.statements.map((s) => s.statementId), `§20: câu ${q.questionVersionId} phải hiện đủ 4 mệnh đề .review-statement[data-statement-id]`);
          q.statements.forEach((s, j) => {
            const v = c.statements[j];
            assert.ok(v.text.includes(s.text), `§20: mệnh đề ${s.statementId} phải có toàn văn "${s.text}", thực tế "${v.text}"`);
            assert.equal(v.key, String(s.answer), `§20: data-key của ${s.statementId} phải là "${s.answer}"`);
            assert.equal(v.chosen, (chosenII[q.questionVersionId] ?? ['none', 'none', 'none', 'none'])[j], `§20: data-chosen của ${s.statementId} sai`);
          });
        }
        if (q.kind === 'III') {
          assert.ok(c.short && c.short.includes(q.answerKey), `§20: câu ${q.questionVersionId} phải có .review-short-answer ghi đáp án "${q.answerKey}", thực tế "${c.short}"`);
          if (q.questionVersionId === qIII(1)) assert.match(c.short, /Bạn điền:\s*0,5/, '§20: phải ghi "Bạn điền: 0,5"');
          else assert.match(c.short, /Chưa làm/, '§20: câu III bỏ trống phải ghi "Chưa làm"');
        }
      }
      await page.click('#btnDownloadReportHtml');
      const dl = await ctx.waitDownload();
      const plain = dl.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      for (const q of exam.questions) {
        assert.ok(plain.includes(q.content), `§20: file báo cáo tải về phải có toàn văn đề bài ${q.questionVersionId}`);
        for (const o of q.options ?? []) assert.ok(plain.includes(o.text), `§20: file báo cáo tải về thiếu phương án "${o.text}"`);
        for (const s of q.statements ?? []) assert.ok(plain.includes(s.text), `§20: file báo cáo tải về thiếu mệnh đề "${s.text}"`);
      }
    });

    // Trưởng phòng 19/11/2026 chốt CX-C05 phương án A: bảng Markdown trong đề (đề 16 câu 6, đề 17 câu 13) phải hiện thành bảng thật.
    runDist('[student][report] CX-C05/A: bảng Markdown trong đề bài hiện thành <table> (có tiêu đề cột, công thức trong ô) lúc làm bài và lúc xem lại bài', async (ctx) => {
      const page = await openApp(ctx, server, target);
      const exam = makeExam({ id: 'claude-check-mdtable', title: 'Đề kiểm định bảng Markdown' });
      exam.questions[0].content = 'Nhiệt hóa hơi riêng cho trong bảng sau:\n\n| Chất lỏng | Rượu | Nước |\n| --- | --- | --- |\n| L (J / kg) | $0,9 · 10^6$ | $2,3 · 10^6$ |\n\nChất nào có L lớn nhất?';
      await loadExam(page, exam);
      const read = (scope) => page.eval((sel) => {
        const card = document.querySelector(sel);
        const t = card?.querySelector('table');
        return { hasTable: !!t, th: t ? [...t.querySelectorAll('th')].map((e) => e.textContent.trim()) : [], rows: t ? t.querySelectorAll('tr').length : 0,
          td: t ? [...t.querySelectorAll('td')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()) : [], pipes: (card?.innerText.match(/\|/g) ?? []).length };
      }, scope);
      const inExam = await read(`[id="qcard-${qI(1)}"]`);
      assert.equal(inExam.hasTable, true, 'CX-C05/A: lúc làm bài, bảng Markdown phải hiện thành thẻ <table>, không phải chữ có dấu "|"');
      assert.deepEqual(inExam.th, ['Chất lỏng', 'Rượu', 'Nước'], 'CX-C05/A: dòng đầu bảng là tiêu đề cột <th>');
      assert.equal(inExam.rows, 2, 'CX-C05/A: bảng có 2 dòng (tiêu đề + 1 dòng dữ liệu); dòng "| --- |" không được hiện');
      assert.equal(inExam.td[0], 'L (J / kg)', 'CX-C05/A: ô dữ liệu đầu tiên đúng nội dung');
      assert.equal(inExam.pipes, 0, 'CX-C05/A: không còn dấu "|" thô trong thẻ câu hỏi');
      await pickOption(page, qI(1), 'a');
      await waitSaved(page);
      await submit(page);
      const inReport = await read(`#reportWrapper .review-question-card[data-qid="${qI(1)}"]`);
      assert.equal(inReport.hasTable, true, 'CX-C05/A + §20: phần xem lại bài cũng phải hiện bảng thành <table>');
      assert.deepEqual(inReport.th, ['Chất lỏng', 'Rượu', 'Nước'], 'CX-C05/A + §20: tiêu đề cột trong phần xem lại bài');
    });

    // QUYẾT ĐỊNH D02 của Trưởng phòng (16/11/2026): điểm không nguyên LUÔN hiện đúng 2 chữ số thập phân (dấu phẩy); điểm nguyên hiện số nguyên.
    run('[report][student] D02: điểm không nguyên luôn hiện 2 chữ số thập phân (0,50; 4,75), điểm nguyên không có phần thập phân', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam());
      await pickOption(page, qI(1), 'a'); await pickOption(page, qI(2), 'c');                                        // 0,50
      for (const [i, v] of [[0, true], [1, false], [2, true], [3, true]]) await setStatement(page, qII(1), i, v);   // 0,50
      await setStatement(page, qII(2), 0, false); await setStatement(page, qII(2), 2, true);                         // 0,25
      await typeShort(page, qIII(1), '0,5');                                                                        // 3,50
      await waitSaved(page);
      await submit(page);
      const raw = (await readReport(page)).raw;
      const z = (s) => s.replace(/\s+/g, '');
      assert.equal(z(raw.I), '0,50/1', `Quyết định D02: Phần I phải hiện "0,50 / 1", thực tế "${raw.I}"`);
      assert.equal(z(raw.II), '0,75/2', `Quyết định D02: Phần II phải hiện "0,75 / 2", thực tế "${raw.II}"`);
      assert.equal(z(raw.III), '3,50/7', `Quyết định D02: Phần III phải hiện "3,50 / 7", thực tế "${raw.III}"`);
      assert.equal(z(raw.total), '4,75/10', `Quyết định D02: Tổng phải hiện "4,75 / 10", thực tế "${raw.total}"`);
    });

    run('[report][student] D02: điểm vô hạn tuần hoàn làm tròn nửa lên tới 2 chữ số (14/3 → 4,67), tính toán vẫn chính xác', async (ctx) => {
      const page = await openApp(ctx, server, target);
      await loadExam(page, makeExam({ id: 'claude-check-d02-rep', title: 'Đề kiểm định làm tròn 4-2-3', part3: ['1', '2', '3'] }));   // mỗi câu III = 7/3
      await typeShort(page, qIII(1), '1'); await typeShort(page, qIII(2), '2');
      await waitSaved(page);
      await submit(page);
      const raw = (await readReport(page)).raw;
      const z = (s) => s.replace(/\s+/g, '');
      assert.equal(z(raw.III), '4,67/7', `Quyết định D02: 14/3 phải hiện "4,67 / 7" (làm tròn nửa lên), thực tế "${raw.III}"`);
      assert.equal(z(raw.total), '4,67/10', `Quyết định D02: Tổng phải hiện "4,67 / 10", thực tế "${raw.total}"`);
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
      const over = () => page.eval(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(await over() <= 1, `màn vào thi tràn ngang ${await over()}px ở bề rộng 360px`);
      await enterFromStart(page);
      await loadExam(page, makeExam());
      assert.ok(await over() <= 1, `màn làm bài tràn ngang ${await over()}px ở bề rộng 360px`);
      await pickOption(page, qI(1), 'a');
      await submit(page);
      assert.ok(await over() <= 1, `màn báo cáo tràn ngang ${await over()}px ở bề rộng 360px`);
    });

    // WEB-contract mục 15 (Trưởng phòng chốt 16/11/2026: đề đưa lên web công khai, học sinh chọn đề trong danh sách).
    const manifestFile = join(target.dir, 'public', 'exams', 'index.json');
    const readManifest = () => {
      assert.ok(existsSync(manifestFile), `thiếu ${target.name === 'dist' ? 'dist/' : ''}public/exams/index.json (danh sách đề; bản dist phải chép nguyên thư mục public/)`);
      const m = JSON.parse(readFileSync(manifestFile, 'utf8'));
      assert.ok(Array.isArray(m.exams) && m.exams.length >= 3, 'danh sách đề phải có ít nhất 3 đề');
      return m.exams.map((e) => ({ ...e, exam: JSON.parse(readFileSync(join(target.dir, e.url), 'utf8')) }));
    };
    const titleIs = (page, e) => page.waitFor((t, n) => (document.getElementById('examTitle')?.textContent ?? '').trim() === t && document.querySelectorAll('#examPane .question-card').length === n,
      `đề "${e.exam.title}" được nạp vào phòng thi (đúng tiêu đề, đủ ${e.exam.questions.length} câu)`, 10000, e.exam.title, e.exam.questions.length);

    runRoot('[app][student] chọn đề: nút "Chọn đề" mở danh sách đủ các đề trong public/exams/index.json, bấm một đề thì vào làm đề đó', async (ctx) => {
      const exams = readManifest();
      const page = await openApp(ctx, server, target);
      await page.click('#btnOpenExamList');
      await page.waitFor(() => { const m = document.getElementById('examListModal'); return !!m && getComputedStyle(m).display !== 'none' && m.querySelectorAll('.exam-list-item[data-exam-url]').length > 0; },
        'bấm #btnOpenExamList mở hộp thoại #examListModal có các mục .exam-list-item[data-exam-url]', 8000);
      const items = await page.eval(() => [...document.querySelectorAll('#examListModal .exam-list-item[data-exam-url]')].map((b) => ({ url: b.getAttribute('data-exam-url'), text: b.textContent.replace(/\s+/g, ' ').trim() })));
      assert.deepEqual(items.map((i) => i.url).sort(), exams.map((e) => e.url).sort(), 'danh sách trên màn hình phải đúng bằng danh sách trong index.json');
      for (const e of exams) assert.ok(items.find((i) => i.url === e.url).text.includes(e.title), `mục của đề phải hiện tiêu đề "${e.title}"`);
      const pick = exams[exams.length - 1];
      await page.click(`#examListModal .exam-list-item[data-exam-url="${pick.url}"]`);
      await titleIs(page, pick);
      assert.equal(await isVisible(page, 'examListModal'), false, 'chọn đề xong hộp thoại danh sách phải đóng');
      const broken = await page.eval(() => [...document.querySelectorAll('#examPane img')].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src')));
      assert.deepEqual(broken, [], 'hình trong đề vừa chọn phải hiện được');
      assert.deepEqual(pageProblems(page), [], 'không lỗi JS hay request hỏng khi chọn đề');
    });

    // Quyết định D03 + WEB-contract mục 15: đề đã có bài làm dở trên máy thì chọn lại phải mở đúng bài dở (Codex CK08-F05).
    // Bản build (§21): ca này làm qua thẻ đề của lớp trong teacher.test.mjs.
    runRoot('[student][storage] chọn đề A → sang đề B → quay lại A: mở lại đúng bài dở của A, giữ đáp án và hạn nộp', async (ctx) => {
      const exams = readManifest();
      const [A, B] = [exams[exams.length - 1], exams[exams.length - 2]];
      const page = await openApp(ctx, server, target);
      const choose = async (e) => {
        await page.click('#btnOpenExamList');
        if (target.name === 'dist') {   // 19.1: nút này về trang học sinh, chọn lại bằng thẻ đề + #examPreview ("Làm tiếp")
          await startFromCard(page, `#startScreen .exam-list-item[data-exam-url="${e.url}"]`);
        } else {
          await page.waitFor((u) => !!document.querySelector(`#examListModal .exam-list-item[data-exam-url="${u}"]`), 'danh sách đề hiện mục của đề cần chọn', 8000, e.url);
          await page.click(`#examListModal .exam-list-item[data-exam-url="${e.url}"]`);
        }
        await titleIs(page, e);
      };
      const answerFirst = async (e) => {
        const q = e.exam.questions[0];
        if (q.kind === 'I') await page.click(`[data-qid="${q.questionVersionId}"][data-option-id="${q.options[0].optionId}"]`);
        else if (q.kind === 'II') await setStatement(page, q.questionVersionId, 0, true);
        else await typeShort(page, q.questionVersionId, '7');
      };
      const answered = (e) => page.eval((q) => {
        const card = document.querySelector(`[id="qcard-${q.questionVersionId}"]`);
        if (!card) return null;
        if (q.kind === 'I') return card.querySelectorAll('[aria-checked="true"]').length === 1;
        if (q.kind === 'II') { const b = card.querySelector('.statement-row .tf-btn[data-val="true"]'); return !!b && (/selected/.test(b.className) || b.getAttribute('aria-pressed') === 'true'); }
        return card.querySelector('.short-answer-input')?.value === '7';
      }, e.exam.questions[0]);
      await choose(A);
      await answerFirst(A);
      await waitSaved(page);
      assert.equal(await answered(A), true, 'đáp án vừa chọn ở đề A phải hiện là đã chọn');
      const tA = await timerSeconds(page);
      await sleep(2200);
      await choose(B);
      await answerFirst(B);
      await waitSaved(page);
      await choose(A);
      assert.equal(await answered(A), true, 'quay lại đề A phải mở đúng bài đang làm dở: đáp án đã chọn vẫn còn (quyết định D03, WEB-contract mục 15)');
      const tA2 = await timerSeconds(page);
      assert.ok(tA2 <= tA - 2, `quay lại đề A không được đặt lại đồng hồ: trước khi rời ${tA}s, khi quay lại ${tA2}s`);
      await choose(B);
      assert.equal(await answered(B), true, 'bài dở của đề B cũng phải còn nguyên khi quay lại');
    });

    // shuffleQuestions/shuffleOptions phải có hiệu lực ở cả hai bản và ổn định trong một lượt làm bài (Codex CK08-F04).
    run('[student] đề bật trộn câu và trộn phương án: thứ tự khác đề gốc, giữ nguyên sau khi tải lại, chấm vẫn đúng', async (ctx) => {
      const page = await openApp(ctx, server, target);
      const exam = makeExam({ id: 'claude-check-shuffle', title: 'Đề kiểm định trộn câu', part1: 'abcdabcdabcd'.split(''), part2: [[true, false, true, false]], part3: ['5'],
        settings: { shuffleQuestions: true, shuffleOptions: true } });
      await loadExam(page, exam);
      const order = () => page.eval(() => ({
        cards: [...document.querySelectorAll('#examPane .question-card')].map((c) => c.id.replace(/^qcard-/, '')),
        options: [...document.querySelectorAll('#examPane [role=radio][data-option-id]')].map((o) => o.getAttribute('data-option-id')),
      }));
      const src = { cards: exam.questions.map((q) => q.questionVersionId), options: exam.questions.flatMap((q) => (q.options ?? []).map((o) => o.optionId)) };
      const o1 = await order();
      assert.deepEqual([...o1.cards].sort(), [...src.cards].sort(), 'trộn không được làm mất hay nhân đôi câu hỏi');
      assert.notDeepEqual(o1.cards, src.cards, 'đề bật shuffleQuestions: thứ tự 12 câu Phần I phải khác thứ tự gốc');
      assert.notDeepEqual(o1.options, src.options, 'đề bật shuffleOptions: thứ tự phương án phải khác thứ tự gốc');
      const kinds = o1.cards.map((id) => exam.questions.find((q) => q.questionVersionId === id).kind);
      assert.deepEqual(kinds, [...kinds].sort((a, b) => a.length - b.length), 'trộn chỉ trong từng phần: thứ tự Phần I → II → III phải giữ (quyết định D07)');
      for (let i = 1; i <= 12; i++) await pickOption(page, qI(i), 'abcdabcdabcd'[i - 1]);
      await waitSaved(page);
      await page.reload(); await waitBoot(page);
      assert.deepEqual(await order(), o1, 'tải lại trang trong cùng lượt làm bài: thứ tự câu và phương án phải giữ nguyên');
      await submit(page);
      const r = await readReport(page);
      assert.ok(near(r.I, [3, 3]), `chọn đúng cả 12 câu Phần I theo optionId phải ra 3 / 3 dù đã trộn, thực tế "${r.raw.I}"`);
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
          await enterFromStart(page);
          // §21: không còn đề công khai; bài đang làm (nạp sẵn) phải mở lại được khi mất mạng (D03).
          await loadExam(page, makeExam({ id: 'claude-check-offline', title: 'Đề kiểm định ngoại tuyến' }));
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
