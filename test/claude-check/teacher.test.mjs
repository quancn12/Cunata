// Khu giáo viên, lớp học, giao đề, trang Admin, gửi kết quả qua Apps Script — trên trình duyệt thật, bản build dist/ (WEB-contract 17, 18, 19).
// Apps Script giả lập bằng máy chủ chạy chính apps-script/Code.js (gas-server.mjs).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, sleep, startServer } from './harness.mjs';
import { TARGETS, enterFromStart, enterStudentArea, loadExam, makeExam, onRoleChooser, pickOption, startFromCard, submit, waitBoot, waitSaved } from './app.mjs';
import { startGasServer } from './gas-server.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

const T1 = { name: 'Cô Lan', username: 'colan', password: 'MatKhau-Lan-01' };
const shown = (page, id) => page.eval((i) => { const e = document.getElementById(i); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; }, id);
const type = async (page, sel, text) => { await page.eval((s) => { const e = document.querySelector(s); e.focus(); e.value = ''; }, sel); await page.send('Input.insertText', { text }); await page.eval((s) => document.querySelector(s).dispatchEvent(new Event('input', { bubbles: true })), sel); };
const iso = (m) => new Date(Date.now() + m * 60000).toISOString();
const local = (m) => { const d = new Date(Date.now() + m * 60000); d.setSeconds(0, 0); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** Tạo sẵn giáo viên trong Google giả lập (như Admin đã làm). */
function seedTeacher(gas, t = T1) {
  const a = gas.gas.post({ action: 'adminLogin', password: gas.adminPassword });
  assert.equal(a.success, true, 'Apps Script giả lập: adminLogin ' + JSON.stringify(a));
  const c = gas.gas.post({ action: 'adminCreateTeacher', token: a.token, ...t });
  assert.equal(c.success, true, 'Apps Script giả lập: adminCreateTeacher ' + JSON.stringify(c));
  return gas.gas.post({ action: 'teacherLogin', username: t.username, password: t.password }).token;
}

for (const target of TARGETS.filter((t) => t.name === 'dist')) {
  describe(`${target.name} — ${target.label}`, { concurrency: 2 }, () => {
    const run = (name, fn, { gasOpts, noConfig } = {}) => test(`${target.name}: ${name}`, { timeout: 180000 }, async () => {
      const gas = noConfig ? null : await startGasServer(gasOpts);
      const server = await startServer(target.dir, { overrides: { 'public/config.json': JSON.stringify({ appsScriptUrl: gas ? gas.url : '' }) } });
      const ctx = await browser.newContext();
      try { await fn({ ctx, server, gas }); } finally { await ctx.close(); await server.close(); await gas?.close(); }
    });
    const open = async (ctx, server, q = '') => { const p = await ctx.newPage(); await p.goto(server.url + target.path + q); await waitBoot(p); return p; };
    const toTeacher = async (page) => {
      if (await onRoleChooser(page)) await page.click('#btnRoleTeacher');
      await page.waitFor(() => !!document.querySelector('#teacherLogin'), 'vào khu giáo viên: màn #teacherLogin', 10000);
    };
    const login = async (page, t = T1) => {
      await page.waitFor(() => !!document.querySelector('#teacherLogin input#teacherUsername') && !!document.querySelector('#teacherLogin input#teacherPassword'),
        '#teacherLogin có ô #teacherUsername và #teacherPassword (WEB-contract 19.1)', 8000);
      await type(page, '#teacherUsername', t.username);
      await type(page, '#teacherPassword', t.password);
      await page.click('#btnTeacherLogin');
    };
    const loggedIn = (page) => page.waitFor(() => { const s = document.getElementById('teacherShell'); return !!s && getComputedStyle(s).display !== 'none' && !!document.querySelector('#teacherNav a[data-nav="lop"]'); },
      'đăng nhập xong: #teacherShell có điều hướng #teacherNav (Lớp học · Đề thi · Kết quả)', 12000);
    const nav = async (page, where) => { await page.click(`#teacherNav a[data-nav="${where}"]`); await page.waitFor((w) => document.querySelector(`#teacherNav a[data-nav="${w}"]`)?.getAttribute('aria-current') === 'page', `mục ${where} đang chọn (aria-current="page")`, 5000, where); };

    run('[app][teacher] chưa cấu hình Apps Script: khu giáo viên báo chưa cấu hình; học sinh nộp bài vẫn lưu trên máy, không gọi ra ngoài', async ({ ctx, server }) => {
      const page = await open(ctx, server);
      await toTeacher(page);
      await page.waitFor(() => /chưa cấu hình/i.test(document.getElementById('teacherLogin')?.innerText ?? ''), 'chưa có appsScriptUrl: #teacherLogin phải báo "chưa cấu hình"', 8000);
      const p2 = await ctx.newPage(); await p2.goto(server.url + target.path + '#/hoc-sinh'); await waitBoot(p2);
      await enterFromStart(p2);
      await submit(p2);
      await sleep(800);
      assert.match(await p2.eval(() => document.getElementById('syncText').textContent), /lưu cục bộ/i, 'chưa cấu hình: trạng thái phải là đã lưu cục bộ, không giả vờ đã gửi');
      assert.deepEqual(p2.requests.filter((u) => /^https?:/.test(u) && !u.startsWith(server.url.replace(/\/Cunata\/$/, ''))), [], 'chưa cấu hình thì không được gọi máy chủ nào khác');
    }, { noConfig: true });

    run('[teacher] giáo viên: sai mật khẩu bị từ chối; đúng thì vào khu giáo viên; mật khẩu không nằm trong URL hay localStorage; đăng xuất được', async ({ ctx, server, gas }) => {
      seedTeacher(gas);
      const page = await open(ctx, server, '?teacher');
      await toTeacher(page);
      await login(page, { ...T1, password: 'sai-mat-khau-1' });
      await page.waitFor(() => (document.getElementById('teacherLoginError')?.textContent ?? '').trim().length > 0, 'sai mật khẩu: #teacherLoginError báo lỗi', 8000);
      assert.doesNotMatch(await page.eval(() => document.getElementById('teacherLoginError').textContent), /UNAUTHORIZED|attempt_id/, 'lỗi phải là câu tiếng Việt dễ hiểu, không phải mã lỗi trần');
      await login(page);
      await loggedIn(page);
      assert.ok(!page.requests.some((u) => u.includes(T1.password)) && !gas.log.some((l) => l.url.includes(T1.password)), 'mật khẩu không được nằm trong URL');
      assert.ok(!(await page.eval(() => JSON.stringify(localStorage))).includes(T1.password), 'mật khẩu không được lưu localStorage');
      assert.equal(gas.log.filter((l) => l.method === 'OPTIONS').length, 0, 'không được có preflight OPTIONS');
      await page.click('#btnTeacherLogout');
      await page.waitFor(() => !!document.querySelector('#teacherLogin input#teacherPassword'), 'đăng xuất: quay về màn đăng nhập', 8000);
    });

    run('[teacher][student][collect] trọn luồng lớp học: tạo lớp → giao đề có hạn → học sinh vào lớp bằng mã, làm, nộp → giáo viên thấy kết quả', async ({ ctx, server, gas }) => {
      seedTeacher(gas);
      const t = await open(ctx, server, '?teacher');
      await toTeacher(t); await login(t); await loggedIn(t);
      await nav(t, 'lop');
      await t.click('#btnCreateClass');
      await t.waitFor(() => !!document.querySelector('[role=dialog] input'), 'bấm Tạo lớp: hộp thoại nhập tên lớp', 5000);
      await type(t, '[role=dialog] input', '12A1 Kiểm định');
      await t.press('Enter');
      const code = await t.waitFor(() => { const c = document.querySelector('.class-card[data-class-id] .class-code'); return c ? c.textContent.trim() : null; }, 'lớp mới hiện thành thẻ .class-card có mã .class-code', 10000);
      assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/, `mã lớp hiển thị 6 ký tự: "${code}"`);
      await t.click('.class-card[data-class-id]');
      await t.waitFor(() => !!document.getElementById('btnAssignExam'), 'chi tiết lớp có nút #btnAssignExam', 8000);
      await t.click('#btnAssignExam');
      await t.waitFor(() => { const d = document.getElementById('assignDialog'); return !!d && getComputedStyle(d).display !== 'none'; }, 'mở #assignDialog', 8000);
      const hoaTitle = 'Đề Tùy Chỉnh Minh Họa Môn Hóa Học';
      const picked = await t.eval((s) => { const sel = document.querySelector('#assignDialog select'); if (sel) { const o = [...sel.options].find((x) => x.textContent.includes(s)); if (!o) return false; sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; }
        const b = [...document.querySelectorAll('#assignDialog [data-exam-id]')].find((x) => x.textContent.includes(s)); if (!b) return false; b.click(); return true; }, hoaTitle);
      assert.equal(picked, true, '#assignDialog phải cho chọn đề trong kho chung (đề Hóa minh họa)');
      await t.eval((v) => { const e = document.getElementById('assignOpenAt'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, local(-60));
      await t.eval((v) => { const e = document.getElementById('assignDueAt'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, local(120));
      await t.click('#btnAssignConfirm');
      await t.waitFor(() => document.querySelectorAll('.assignment-row[data-assignment-id]').length === 1, 'giao xong: chi tiết lớp có 1 dòng .assignment-row', 10000);
      // học sinh
      const s = await open(ctx, server, '#/hoc-sinh');
      await enterStudentArea(s, { name: 'Trần Học Sinh' });
      await type(s, '#classCodeInput', code.toLowerCase());
      await s.click('#btnJoinClass');
      const sel = `#myClasses .class-section[data-class-code="${code}"] .exam-card[data-assignment-id]`;
      await s.waitFor((q) => !!document.querySelector(q), 'vào lớp bằng mã: mục #myClasses có thẻ đề được giao (có data-assignment-id)', 10000, sel);
      assert.match(await s.eval((q) => document.querySelector(q).innerText, sel), /Hạn nộp/, 'thẻ đề được giao phải hiện "Hạn nộp"');
      await startFromCard(s, sel);
      await submit(s);
      await s.waitFor(() => /Đã gửi/i.test(document.getElementById('syncText')?.textContent ?? ''), 'nộp bài đề được giao: #syncText "Đã gửi"', 20000);
      const kq = gas.gas.sheets.get('KetQua');
      assert.ok(kq && kq.getLastRow() === 2, 'Google Sheet có đúng 1 dòng kết quả');
      assert.match(kq.rows[1].map(String).join(' | '), new RegExp(code), 'dòng kết quả phải có mã lớp');
      // giáo viên xem kết quả
      await nav(t, 'ket-qua');
      await t.waitFor(() => /Trần Học Sinh/.test(document.getElementById('resultsTable')?.innerText ?? ''), 'mục Kết quả: #resultsTable có bài của học sinh vừa nộp', 15000);
      // mã sai
      const s2 = await open(ctx, server, '#/hoc-sinh');
      await enterStudentArea(s2, { name: 'Học sinh khác' });
      await type(s2, '#classCodeInput', 'ZZZZZZ');
      await s2.click('#btnJoinClass');
      await s2.waitFor(() => (document.getElementById('classCodeError')?.textContent ?? '').trim().length > 0, 'mã lớp sai: #classCodeError báo lỗi ngay dưới ô', 10000);
    });

    run('[teacher] sửa đề rồi xuất bản: giữ nguyên cài đặt và câu hỏi, chỉ đổi phần đã sửa (lỗi thật: 15 phút thành 50 phút)', async ({ ctx, server, gas }) => {
      seedTeacher(gas);
      const page = await open(ctx, server, '?teacher');
      await toTeacher(page); await login(page); await loggedIn(page);
      await nav(page, 'de');
      await page.waitFor(() => !!document.querySelector('[data-exam-id="exam-thpt-hoa-repeating-demo"] .btn-teacher-edit'), 'mục Đề thi có thẻ đề Hóa với nút .btn-teacher-edit', 10000);
      await page.click('[data-exam-id="exam-thpt-hoa-repeating-demo"] .btn-teacher-edit');
      await page.waitFor(() => { const m = document.getElementById('builderModal'); return !!m && getComputedStyle(m).display !== 'none' && /Hóa/.test(document.getElementById('builderExamTitle')?.value ?? ''); }, 'mở trình soạn với đề Hóa', 8000);
      await type(page, '#builderExamTitle', 'Hóa học — giáo viên đã sửa');
      await page.eval(() => document.getElementById('builderExamTitle').dispatchEvent(new Event('change', { bubbles: true })));
      await page.click('#btnPublishExam');
      await page.waitFor(() => /Đã xuất bản/i.test(document.getElementById('teacherPublishStatus')?.textContent ?? ''), '#teacherPublishStatus báo "Đã xuất bản"', 15000);
      const orig = JSON.parse(await (await fetch(server.url + 'public/exams/hoa-repeating.json')).text());
      const pub = gas.gas.get({ action: 'getExam', id: 'exam-thpt-hoa-repeating-demo' }).exam;
      assert.equal(pub.title, 'Hóa học — giáo viên đã sửa');
      assert.deepEqual(pub.settings, orig.settings, 'chỉ sửa tiêu đề thì cài đặt (thời gian 15 phút, số lượt, trộn…) phải giữ nguyên');
      assert.deepEqual(pub.questions, orig.questions, 'chỉ sửa tiêu đề thì nội dung, đáp án, lời giải mọi câu phải giữ nguyên');
      for (const k of ['examId', 'subject', 'grade', 'ruleSetId', 'inputPolicyId']) assert.deepEqual(pub[k], orig[k], `trường ${k} phải giữ nguyên`);
    });

    run('[admin] trang Admin riêng: đăng nhập, tạo giáo viên; giáo viên mới đăng nhập được ngay', async ({ ctx, server, gas }) => {
      const page = await ctx.newPage(); await page.goto(server.url + 'admin.html');
      await page.waitFor(() => !!document.querySelector('#adminLogin input#adminPassword'), 'admin.html có #adminLogin', 10000);
      await type(page, '#adminPassword', 'sai');
      await page.click('#btnAdminLogin');
      await page.waitFor(() => (document.getElementById('adminLoginError')?.textContent ?? '').trim().length > 0, 'sai mật khẩu admin: #adminLoginError báo lỗi', 8000);
      await type(page, '#adminPassword', gas.adminPassword);
      await page.click('#btnAdminLogin');
      await page.waitFor(() => { const p = document.getElementById('adminPanel'); return !!p && getComputedStyle(p).display !== 'none'; }, 'đăng nhập admin: #adminPanel', 10000);
      await page.click('#btnCreateTeacher');
      await page.waitFor(() => !!document.getElementById('newTeacherUsername'), 'hộp thoại tạo giáo viên', 5000);
      await type(page, '#newTeacherName', 'Thầy Mới');
      await type(page, '#newTeacherUsername', 'thaymoi');
      await type(page, '#newTeacherPassword', 'MatKhau-ThayMoi-1');
      await page.click('#btnCreateTeacherConfirm');
      await page.waitFor(() => !!document.querySelector('.teacher-row[data-username="thaymoi"]'), 'giáo viên mới hiện trong danh sách .teacher-row', 10000);
      assert.match(await page.eval(() => document.getElementById('adminStats')?.innerText ?? ''), /1/, '#adminStats phải hiện số giáo viên');
      assert.ok(!(await page.eval(() => JSON.stringify(localStorage))).includes(gas.adminPassword), 'mật khẩu admin không được lưu localStorage');
      const tp = await open(ctx, server, '?teacher');
      await toTeacher(tp); await login(tp, { username: 'thaymoi', password: 'MatKhau-ThayMoi-1' }); await loggedIn(tp);
      const home = await open(ctx, server, '#/hoc-sinh');
      assert.equal(await home.eval(() => /admin/i.test([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).join(' '))), false, 'trang học sinh không có liên kết tới trang Admin');
    });

    run('[collect][student] nộp đề luyện tập: kết quả gửi lên Apps Script; lỗi mạng thì báo chưa gửi rồi tự gửi lại, không trùng', async ({ ctx, server, gas }) => {
      const page = await open(ctx, server, '#/hoc-sinh');
      await enterFromStart(page, { name: 'Trần Gửi Bài' });
      const exam = makeExam({ id: 'claude-check-gui', title: 'Đề kiểm định gửi kết quả' });
      await loadExam(page, exam).catch(async () => { /* bản mới bỏ nút nạp JSON khỏi màn học sinh: làm đề đang mở */ });
      gas.setFailPosts(2);
      await submit(page);
      await page.waitFor(() => /Chưa gửi được|sẽ thử lại/i.test(document.getElementById('syncText')?.textContent ?? ''), 'máy chủ lỗi: #syncText báo "Chưa gửi được — sẽ thử lại"', 15000);
      await page.waitFor(() => /Đã gửi/i.test(document.getElementById('syncText')?.textContent ?? ''), 'tự thử lại thành công: #syncText "Đã gửi"', 30000);
      const kq = gas.gas.sheets.get('KetQua');
      assert.ok(kq && kq.getLastRow() === 2, 'đúng 1 dòng kết quả (không trùng khi thử lại)');
      assert.match(kq.rows[1].map(String).join(' | '), /Trần Gửi Bài/);
    });

    // Lỗi thật 16/11/2026: đổi link Apps Script nhưng trình duyệt cũ vẫn dùng link cũ (service worker giữ public/config.json).
    test(`${target.name}: [offline][app] cấu hình và danh sách đề luôn lấy bản mới nhất khi có mạng`, { timeout: 150000 }, async () => {
      const oldGas = await startGasServer(), newGas = await startGasServer();
      seedTeacher(newGas);
      const overrides = { 'public/config.json': JSON.stringify({ appsScriptUrl: oldGas.url }) };
      const server = await startServer(target.dir, { overrides });
      const ctx = await browser.newContext();
      try {
        const page = await open(ctx, server, '#/hoc-sinh');
        await enterStudentArea(page);
        await page.waitFor(() => navigator.serviceWorker?.getRegistrations().then((r) => r.some((x) => !!x.active)), 'service worker active', 15000);
        await page.reload(); await waitBoot(page); await sleep(1000);
        overrides['public/config.json'] = JSON.stringify({ appsScriptUrl: newGas.url });
        const idx = JSON.parse(await (await fetch(server.url + 'public/exams/index.json')).text());
        overrides['public/exams/index.json'] = JSON.stringify({ ...idx, exams: [...idx.exams, { ...idx.exams[0], id: 'claude-check-moi-them', title: 'Đề vừa thêm vào danh sách' }] });
        await page.reload(); await waitBoot(page);
        await page.waitFor(() => !!document.querySelector('#startScreen .exam-list-item[data-exam-id="claude-check-moi-them"]'),
          'tải lại khi có mạng: danh sách đề phải là bản mới nhất (index.json đi mạng trước)', 10000);
        const t = await open(ctx, server, '?teacher');
        await toTeacher(t); await login(t); await loggedIn(t);
        assert.ok(newGas.log.some((l) => l.method === 'POST' && /teacherLogin/.test(l.body)), 'đăng nhập phải gửi tới link Apps Script MỚI');
        assert.equal(oldGas.log.filter((l) => l.method === 'POST').length, 0, 'không gửi gì tới link cũ');
      } finally { await ctx.close(); await server.close(); await oldGas.close(); await newGas.close(); }
    });
  });
}
