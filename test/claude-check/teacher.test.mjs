// Trang giáo viên + kho đề + gửi kết quả qua Apps Script (WEB-contract mục 17), trên trình duyệt thật, cả index.html gốc lẫn dist/.
// Apps Script được giả lập bằng máy chủ chạy chính apps-script/Code.js (gas-server.mjs).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, sleep, startServer } from './harness.mjs';
import { TARGETS, enterFromStart, makeExam, onStartScreen, pickOption, submit, waitBoot, waitSaved } from './app.mjs';
import { startGasServer } from './gas-server.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

const PW = 'MatKhau-GV-123';
const shown = (page, id) => page.eval((i) => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, id);

for (const target of TARGETS) {
  describe(`${target.name} — ${target.label}`, { concurrency: 2 }, () => {
    const run = (name, fn, { gasOpts, noConfig } = {}) => test(`${target.name}: ${name}`, { timeout: 150000 }, async () => {
      const gas = noConfig ? null : await startGasServer(gasOpts);
      const server = await startServer(target.dir, { overrides: { 'public/config.json': JSON.stringify({ appsScriptUrl: gas ? gas.url : '' }) } });
      const ctx = await browser.newContext();
      try { await fn({ ctx, server, gas }); } finally { await ctx.close(); await server.close(); await gas?.close(); }
    });
    const open = async (ctx, server, q = '') => { const p = await ctx.newPage(); await p.goto(server.url + target.path + q); await waitBoot(p); return p; };
    const login = async (page, pw) => {
      await page.waitFor(() => !!document.querySelector('#teacherLogin input#teacherPassword'), 'trang giáo viên hiện ô mật khẩu #teacherPassword trong #teacherLogin', 8000);
      await page.eval(() => { const e = document.getElementById('teacherPassword'); e.focus(); e.value = ''; });
      await page.send('Input.insertText', { text: pw });
      await page.click('#btnTeacherLogin');
    };

    run('[app][teacher] chưa cấu hình Apps Script: nút "Giáo viên" báo chưa cấu hình; web không gọi ra ngoài', async ({ ctx, server }) => {
      const page = await open(ctx, server);
      assert.equal(await onStartScreen(page), true);
      await page.click('#btnTeacher');
      await page.waitFor(() => /chưa cấu hình/i.test(document.getElementById('teacherLogin')?.innerText ?? ''),
        'chưa có appsScriptUrl: #teacherLogin phải báo "chưa cấu hình"', 8000);
      await enterFromStart(page);
      await submit(page);
      await sleep(800);
      assert.match(await page.eval(() => document.getElementById('syncText').textContent), /lưu cục bộ/i, 'chưa cấu hình: trạng thái phải là đã lưu cục bộ, không giả vờ đã gửi');
      assert.deepEqual(page.requests.filter((u) => /^https?:/.test(u) && !u.startsWith(server.url.replace(/\/Cunata\/$/, ''))), [], 'chưa cấu hình thì không được gọi máy chủ nào khác');
    }, { noConfig: true });

    run('[app][student][teacher] đề giáo viên đã xuất bản hiện trong màn vào thi, làm được; trùng examId thì bản xuất bản thắng', async ({ ctx, server, gas }) => {
      const pub = makeExam({ id: 'gv-xuat-ban-01', title: 'Đề giáo viên xuất bản 01' });
      assert.equal(gas.gas.post({ action: 'publishExam', password: PW, exam: pub }).success, true);
      const page = await open(ctx, server);
      await page.waitFor(() => !!document.querySelector('#startScreen .exam-list-item[data-exam-id="gv-xuat-ban-01"]'),
        'màn vào thi phải liệt kê đề giáo viên xuất bản (button.exam-list-item[data-exam-id])', 10000);
      const txt = await page.eval(() => document.querySelector('#startScreen .exam-list-item[data-exam-id="gv-xuat-ban-01"]').textContent);
      assert.match(txt, /Đề giáo viên xuất bản 01/);
      await page.eval(() => { const e = document.getElementById('startName'); e.focus(); e.select(); });
      await page.send('Input.insertText', { text: 'Học sinh A' });
      await page.click('#startScreen .exam-list-item[data-exam-id="gv-xuat-ban-01"]');
      await page.waitFor(() => !document.getElementById('btnStartExam').disabled, 'bấm được bắt đầu', 5000);
      await page.click('#btnStartExam');
      await page.waitFor((t) => (document.getElementById('examTitle')?.textContent ?? '').trim() === t && document.querySelectorAll('#examPane .question-card').length === 8,
        'vào làm đúng đề giáo viên xuất bản (tải qua getExam)', 10000, pub.title);
      // bản xuất bản trùng id đề tĩnh thắng
      const hoa = JSON.parse(await (await fetch(server.url + 'public/exams/hoa-repeating.json')).text());
      assert.equal(gas.gas.post({ action: 'publishExam', password: PW, exam: { ...hoa, title: 'Hóa — bản giáo viên sửa' } }).success, true);
      const p2 = await open(ctx, server, '?exam=' + encodeURIComponent(hoa.examId));
      await p2.waitFor((id) => [...document.querySelectorAll(`#startScreen .exam-list-item[data-exam-id="${id}"]`)].some((b) => /bản giáo viên sửa/.test(b.textContent)),
        'đề tĩnh bị giáo viên xuất bản lại: danh sách phải hiện bản đã sửa', 10000, hoa.examId);
      assert.equal(await p2.eval((id) => document.querySelectorAll(`#startScreen .exam-list-item[data-exam-id="${id}"]`).length, hoa.examId), 1, 'trùng examId chỉ hiện một mục');
    });

    run('[teacher] giáo viên: sai mật khẩu bị từ chối; đúng thì sửa một đề, xuất bản lên web; mật khẩu không nằm trong URL hay localStorage', async ({ ctx, server, gas }) => {
      const page = await open(ctx, server, '?teacher');
      await login(page, 'sai-mat-khau');
      await page.waitFor(() => (document.getElementById('teacherLoginError')?.textContent ?? '').trim().length > 0, 'sai mật khẩu: #teacherLoginError phải báo lỗi', 8000);
      assert.equal(await shown(page, 'teacherPanel'), false, 'sai mật khẩu không được vào #teacherPanel');
      await login(page, PW);
      await page.waitFor(() => { const p = document.getElementById('teacherPanel'); return !!p && getComputedStyle(p).display !== 'none' && p.querySelectorAll('.teacher-exam-row[data-exam-id]').length >= 3; },
        'đúng mật khẩu: #teacherPanel hiện danh sách đề (.teacher-exam-row[data-exam-id])', 10000);
      await page.click('#teacherPanel .teacher-exam-row[data-exam-id="exam-thpt-hoa-repeating-demo"] .btn-teacher-edit');
      await page.waitFor(() => { const m = document.getElementById('builderModal'); return !!m && getComputedStyle(m).display !== 'none' && /Hóa/.test(document.getElementById('builderExamTitle')?.value ?? ''); },
        'bấm Sửa: mở trình soạn đề với đúng đề đó', 8000);
      await page.eval(() => { const e = document.getElementById('builderExamTitle'); e.focus(); e.select(); });
      await page.send('Input.insertText', { text: 'Hóa học — giáo viên đã sửa' });
      await page.eval(() => document.getElementById('builderExamTitle').dispatchEvent(new Event('change', { bubbles: true })));
      await page.click('#btnPublishExam');
      await page.waitFor(() => /Đã xuất bản/i.test(document.getElementById('teacherPublishStatus')?.textContent ?? ''), 'xuất bản xong: #teacherPublishStatus báo "Đã xuất bản"', 15000);
      const list = gas.gas.get({ action: 'listExams' }).exams;
      assert.deepEqual(list.map((e) => [e.id, e.title]), [['exam-thpt-hoa-repeating-demo', 'Hóa học — giáo viên đã sửa']], 'Apps Script phải nhận đúng đề đã sửa');
      assert.ok(gas.log.filter((l) => l.method === 'POST').every((l) => /^text\/plain/.test(l.contentType)), 'POST tới Apps Script phải dùng Content-Type text/plain (tránh preflight)');
      assert.equal(gas.log.filter((l) => l.method === 'OPTIONS').length, 0, 'không được có preflight OPTIONS (Apps Script không hỗ trợ)');
      assert.ok(!page.requests.some((u) => u.includes(PW)) && !gas.log.some((l) => l.url.includes(PW)), 'mật khẩu không được nằm trong URL');
      assert.ok(!(await page.eval(() => JSON.stringify(localStorage))).includes(PW), 'mật khẩu không được lưu localStorage');
    });

    run('[collect][student] nộp bài: kết quả gửi lên Apps Script (đúng tên, đúng điểm); lỗi mạng thì báo chưa gửi rồi tự gửi lại', async ({ ctx, server, gas }) => {
      const page = await open(ctx, server);
      await enterFromStart(page, { name: 'Trần Gửi Bài' });
      const exam = makeExam({ id: 'claude-check-gui', title: 'Đề kiểm định gửi kết quả' });
      const { loadExam } = await import('./app.mjs');
      await loadExam(page, exam);
      await pickOption(page, 'ck-i-01', 'a');
      await waitSaved(page);
      gas.setFailPosts(2);
      await submit(page);
      await page.waitFor(() => /Chưa gửi được|sẽ thử lại/i.test(document.getElementById('syncText')?.textContent ?? ''), 'máy chủ lỗi: #syncText phải báo "Chưa gửi được — sẽ thử lại"', 15000);
      await page.waitFor(() => /Đã gửi/i.test(document.getElementById('syncText')?.textContent ?? ''), 'tự thử lại thành công: #syncText báo "Đã gửi"', 30000);
      const kq = gas.gas.sheets.get('KetQua');
      assert.ok(kq && kq.getLastRow() === 2, 'Google Sheet phải có đúng 1 dòng kết quả (không trùng khi thử lại)');
      const row = kq.rows[1].map(String).join(' | ');
      assert.match(row, /Trần Gửi Bài/, 'dòng kết quả phải có tên thí sinh');
      assert.match(row, /claude-check-gui/, 'dòng kết quả phải có mã đề');
      assert.ok(await page.eval(() => { const b = document.getElementById('btnDownloadReportHtml'); return !!b && !b.disabled; }), 'nút tải kết quả vẫn phải có (D08)');
    });
  });
}
