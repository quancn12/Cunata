// Khu giáo viên, lớp học, giao đề, trang Admin, gửi kết quả qua Apps Script — trên trình duyệt thật, bản build dist/ (WEB-contract 17, 18, 19).
// Apps Script giả lập bằng máy chủ chạy chính apps-script/Code.js (gas-server.mjs).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, sleep, startServer } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TARGETS, enterFromStart, enterStudentArea, joinClass, loadExam, makeExam, mouseClick, onRoleChooser, pickOption, setStatement, startFromCard, submit, timerSeconds, typeShort, waitBoot, waitSaved } from './app.mjs';
import { startGasServer } from './gas-server.mjs';
import { seedClass } from './classroom.mjs';

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

    const manifest = () => JSON.parse(readFileSync(join(target.dir, 'public', 'exams', 'index.json'), 'utf8')).exams
      .map((e) => ({ ...e, exam: JSON.parse(readFileSync(join(target.dir, e.url), 'utf8')) }));

    // Lỗi thật trên /thu/ 19/11/2026 ("không click được đề nào"): #examPreview thiếu CSS hộp thoại nên hiện ở CUỐI trang, ngoài khung nhìn.
    // Bấm bằng chuột thật vào thẻ đề của lớp (WEB-contract 21: đề chỉ đến qua lớp), ở 3 khổ màn, trang đã cuộn.
    for (const [w, h] of [[1850, 980], [1280, 800], [390, 844]]) {
      run(`[student][ui] bấm thẻ đề của lớp bằng chuột thật (${w}x${h}, đã cuộn): #examPreview nổi lên TRONG khung nhìn, nút #btnStartExam bấm được và nhận focus; Esc đóng`, async ({ ctx, server, gas }) => {
        const ids = manifest().slice(0, 6).map((e) => e.id);
        const { code } = seedClass(gas, ids);
        const page = await ctx.newPage();
        await page.setViewport(w, h, w < 600);
        await page.goto(server.url + target.path + '#/hoc-sinh');
        await waitBoot(page);
        await enterStudentArea(page, { name: 'Học sinh chuột thật' });
        await joinClass(page, code);
        const sel = `#myClasses .class-section[data-class-code="${code}"] .exam-card[data-assignment-id][data-exam-id="${ids[4]}"]`;
        await page.waitFor((q) => !!document.querySelector(q), 'lớp có thẻ đề được giao thứ 5', 10000, sel);
        const hit = await mouseClick(page, sel);
        assert.ok(hit.hitsTarget, `chuột tại giữa thẻ đề phải trúng thẻ, đang bị phần tử khác đè: ${hit.top}`);
        await page.waitFor(() => { const p = document.getElementById('examPreview'); return !!p && getComputedStyle(p).display !== 'none'; }, 'bấm thẻ: #examPreview mở', 5000);
        const v = await page.eval(() => {
          const b = document.getElementById('btnStartExam'); const r = b.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { btnInView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, btnReachable: !!top && b.contains(top),
            focusInside: document.getElementById('examPreview').contains(document.activeElement), pos: getComputedStyle(document.getElementById('examPreview')).position };
        });
        assert.equal(v.btnInView, true, `WEB-contract 19.1: bấm thẻ đề thì hộp thoại #examPreview phải hiện trong khung nhìn (nút #btnStartExam nằm trong màn hình), không được rơi xuống cuối trang; position=${v.pos}`);
        assert.equal(v.btnReachable, true, 'nút #btnStartExam phải bấm được bằng chuột (không bị phần tử khác đè)');
        assert.equal(v.focusInside, true, 'mở hộp thoại thì focus phải chuyển vào trong #examPreview (bàn phím / trình đọc màn hình)');
        await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        await page.waitFor(() => getComputedStyle(document.getElementById('examPreview')).display === 'none', 'nhấn Esc: đóng #examPreview', 3000);
        const back = await mouseClick(page, sel);
        assert.ok(back.hitsTarget, 'đóng hộp thoại xong, bấm lại thẻ đề phải được (không còn lớp phủ sót lại)');
        await page.waitFor(() => getComputedStyle(document.getElementById('examPreview')).display !== 'none', 'mở lại #examPreview', 5000);
        await mouseClick(page, '#btnStartExam');
        await page.waitFor(() => { const e = document.getElementById('examWrapper'); return !!e && e.getClientRects().length > 0 && document.querySelectorAll('#examPane .question-card').length > 0; },
          'bấm "Bắt đầu làm bài" bằng chuột thật: vào màn làm bài', 15000);
        assert.equal(await page.eval(() => document.getElementById('candidateName')?.value), 'Học sinh chuột thật', 'vào bài từ thẻ đề của lớp: #candidateName là tên ở cổng tên');
      });
    }

    // Trưởng phòng 21/11/2026: "làm bài xong chưa có nút về lại trang học sinh". Nộp xong, màn kết quả phải có nút "Về trang học sinh"
    // nhìn thấy được (trong khung nhìn, không phải cuộn), bấm bằng chuột thật thì về lại khu học sinh có lớp vừa làm.
    for (const [w, h] of [[1366, 768], [390, 844]]) {
      run(`[student][report] nộp bài xong (${w}x${h}): màn kết quả có nút "Về trang học sinh" trong khung nhìn, bấm về lại lớp`, async ({ ctx, server, gas }) => {
        const ids = manifest().slice(0, 1).map((e) => e.id);
        const { code } = seedClass(gas, ids);
        const page = await ctx.newPage();
        await page.setViewport(w, h, w < 600);
        await page.goto(server.url + target.path + '#/hoc-sinh');
        await waitBoot(page);
        await enterStudentArea(page, { name: 'Học sinh về trang' });
        const card = await joinClass(page, code);
        await startFromCard(page, card);
        await submit(page);
        const sel = await page.eval(() => {
          const b = [...document.querySelectorAll('button, a')].find((e) => /Về trang học sinh/i.test(e.textContent || '') && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden');
          if (!b) return null; b.setAttribute('data-cc-back', '1'); return '[data-cc-back="1"]';
        });
        assert.ok(sel, 'màn kết quả phải có nút/liên kết "Về trang học sinh" đang hiển thị');
        assert.equal(await page.eval(() => innerWidth), w, `màn kết quả không được rộng hơn màn hình ${w}px (công thức/hình dài làm điện thoại tự thu nhỏ cả trang)`);
        const inView = await page.eval((s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }, sel);
        assert.equal(inView, true, 'nút "Về trang học sinh" phải nằm trong khung nhìn ngay khi hiện kết quả (không phải cuộn tìm)');
        const hit = await mouseClick(page, sel);
        assert.ok(hit.hitsTarget, `bấm chuột vào nút "Về trang học sinh" phải trúng nút, đang bị đè: ${hit.top}`);
        await page.waitFor((c) => { const s = document.querySelector(`#myClasses .class-section[data-class-code="${c}"]`); return !!s && s.getClientRects().length > 0; },
          'bấm "Về trang học sinh": về khu học sinh, thấy lớp vừa làm trong #myClasses', 10000, code);
      });
    }

    // Quyết định D03 (Codex CK08-F05) trên bản build: chuyển qua lại giữa hai đề được giao phải mở đúng bài dở, giữ đáp án và đồng hồ (§21: qua lớp).
    run('[student][storage] đề A → đề B → quay lại A (cùng lớp): mở lại đúng bài dở của A, giữ đáp án và hạn nộp', async ({ ctx, server, gas }) => {
      const ex = manifest();
      const [A, B] = [ex[ex.length - 1], ex[ex.length - 2]];
      const { code } = seedClass(gas, [A.id, B.id]);
      const page = await open(ctx, server, '#/hoc-sinh');
      await enterStudentArea(page, { name: 'Học sinh A B A' });
      await joinClass(page, code);
      const titleIs = (e) => page.waitFor((t, n) => (document.getElementById('examTitle')?.textContent ?? '').trim() === t && document.querySelectorAll('#examPane .question-card').length === n,
        `đề "${e.exam.title}" được nạp vào phòng thi`, 15000, e.exam.title, e.exam.questions.length);
      const choose = async (e) => {
        if (await page.eval(() => { const x = document.getElementById('examWrapper'); return !!x && x.getClientRects().length > 0; })) await page.click('#btnOpenExamList');
        await startFromCard(page, `#myClasses .class-section[data-class-code="${code}"] .exam-card[data-exam-id="${e.id}"]`);
        await titleIs(e);
      };
      const answerFirst = async (e) => { const q = e.exam.questions[0];
        if (q.kind === 'I') await page.click(`[data-qid="${q.questionVersionId}"][data-option-id="${q.options[0].optionId}"]`);
        else if (q.kind === 'II') await setStatement(page, q.questionVersionId, 0, true); else await typeShort(page, q.questionVersionId, '7'); };
      const answered = (e) => page.eval((q) => { const card = document.querySelector(`[id="qcard-${q.questionVersionId}"]`); if (!card) return null;
        if (q.kind === 'I') return card.querySelectorAll('[aria-checked="true"]').length === 1;
        if (q.kind === 'II') { const b = card.querySelector('.statement-row .tf-btn[data-val="true"]'); return !!b && (/selected/.test(b.className) || b.getAttribute('aria-pressed') === 'true'); }
        return card.querySelector('.short-answer-input')?.value === '7'; }, e.exam.questions[0]);
      await choose(A); await answerFirst(A); await waitSaved(page);
      const tA = await timerSeconds(page);
      await sleep(2200);
      await choose(B); await answerFirst(B); await waitSaved(page);
      await choose(A);
      assert.equal(await answered(A), true, 'quay lại đề A phải mở đúng bài đang làm dở: đáp án đã chọn vẫn còn (D03)');
      assert.ok(await timerSeconds(page) <= tA - 2, 'quay lại đề A không được đặt lại đồng hồ');
      await choose(B);
      assert.equal(await answered(B), true, 'bài dở của đề B cũng phải còn nguyên khi quay lại');
    });

    run('[app][teacher] chưa cấu hình Apps Script: khu giáo viên báo chưa cấu hình; học sinh nộp bài vẫn lưu trên máy, không gọi ra ngoài', async ({ ctx, server }) => {
      const page = await open(ctx, server);
      await toTeacher(page);
      await page.waitFor(() => /chưa cấu hình/i.test(document.getElementById('teacherLogin')?.innerText ?? ''), 'chưa có appsScriptUrl: #teacherLogin phải báo "chưa cấu hình"', 8000);
      const p2 = await ctx.newPage(); await p2.goto(server.url + target.path + '#/hoc-sinh'); await waitBoot(p2);
      await enterFromStart(p2);
      await loadExam(p2, makeExam({ id: 'claude-check-chua-cau-hinh', title: 'Đề kiểm định chưa cấu hình' }));   // §21: không còn đề công khai
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

    // WEB-contract 19.2a (Trưởng phòng 21/11/2026: "lúc thầy giao bài ko có mục vô thời hạn").
    run('[teacher][student][collect] giao đề "Không hạn nộp": tích #assignNoDue bằng chuột thật → ô hạn nộp bị vô hiệu; dòng bài giao và thẻ đề học sinh hiện "Không hạn nộp"; nộp được', async ({ ctx, server, gas }) => {
      seedTeacher(gas);
      const t = await open(ctx, server, '?teacher');
      await toTeacher(t); await login(t); await loggedIn(t);
      await nav(t, 'lop');
      await t.click('#btnCreateClass');
      await t.waitFor(() => !!document.querySelector('[role=dialog] input'), 'bấm Tạo lớp: hộp thoại nhập tên lớp', 5000);
      await type(t, '[role=dialog] input', '12A2 Không hạn');
      await t.press('Enter');
      const code = await t.waitFor(() => { const c = document.querySelector('.class-card[data-class-id] .class-code'); return c ? c.textContent.trim() : null; }, 'lớp mới có mã', 10000);
      await t.click('.class-card[data-class-id]');
      await t.waitFor(() => !!document.getElementById('btnAssignExam'), 'chi tiết lớp có nút #btnAssignExam', 8000);
      await t.click('#btnAssignExam');
      await t.waitFor(() => { const d = document.getElementById('assignDialog'); return !!d && getComputedStyle(d).display !== 'none'; }, 'mở #assignDialog', 8000);
      await t.eval(() => { const sel = document.querySelector('#assignDialog select'); if (sel && sel.options.length > 1) { sel.selectedIndex = 1; sel.dispatchEvent(new Event('change', { bubbles: true })); } else document.querySelector('#assignDialog [data-exam-id]')?.click(); });
      await t.eval((v) => { const e = document.getElementById('assignOpenAt'); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, local(-60));
      assert.ok(await t.eval(() => !!document.getElementById('assignNoDue')), 'WEB-contract 19.2a: #assignDialog phải có ô tích #assignNoDue "Không hạn nộp"');
      const hit = await mouseClick(t, '#assignNoDue');
      assert.ok(hit.hitsTarget, `ô #assignNoDue phải bấm được bằng chuột (đang bị đè: ${hit.top})`);
      assert.equal(await t.eval(() => document.getElementById('assignNoDue').checked && document.getElementById('assignDueAt').disabled), true, 'tích "Không hạn nộp": ô #assignDueAt phải bị vô hiệu');
      await t.click('#btnAssignConfirm');
      await t.waitFor(() => document.querySelectorAll('.assignment-row[data-assignment-id]').length === 1, 'giao xong: có 1 dòng .assignment-row', 10000);
      assert.match(await t.eval(() => document.querySelector('.assignment-row[data-assignment-id]').innerText), /Không hạn nộp/, 'dòng bài giao phải hiện "Không hạn nộp"');
      const s = await open(ctx, server, '#/hoc-sinh');
      await enterStudentArea(s, { name: 'Học sinh không hạn' });
      const card = await joinClass(s, code);
      assert.match(await s.eval((q) => document.querySelector(q).innerText, card), /Không hạn nộp/, 'thẻ đề của học sinh phải hiện "Không hạn nộp"');
      await startFromCard(s, card);
      await submit(s);
      await s.waitFor(() => /Đã gửi/i.test(document.getElementById('syncText')?.textContent ?? ''), 'nộp bài không hạn nộp: #syncText "Đã gửi" (không PAST_DUE)', 20000);
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
      // Lỗi thật trên /thu/ 19/11/2026: dòng đề đã giao hiện mã "exam-thpt-…-demo" thay vì tên đề (đề kho chung lấy tên từ public/exams/index.json).
      const row = await t.eval(() => document.querySelector('.assignment-row[data-assignment-id]').innerText);
      assert.ok(row.includes(hoaTitle), `chi tiết lớp: dòng đề đã giao phải hiện TÊN đề ("${hoaTitle}…"), không chỉ mã đề; thực tế "${row}"`);
      // học sinh
      const s = await open(ctx, server, '#/hoc-sinh');
      await enterStudentArea(s, { name: 'Trần Học Sinh' });
      await type(s, '#classCodeInput', code.toLowerCase());
      await s.click('#btnJoinClass');
      const sel = `#myClasses .class-section[data-class-code="${code}"] .exam-card[data-assignment-id]`;
      await s.waitFor((q) => !!document.querySelector(q), 'vào lớp bằng mã: mục #myClasses có thẻ đề được giao (có data-assignment-id)', 10000, sel);
      assert.match(await s.eval((q) => document.querySelector(q).innerText, sel), /Hạn nộp/, 'thẻ đề được giao phải hiện "Hạn nộp"');
      await startFromCard(s, sel);
      // Lỗi thật trên /thu/ 19/11/2026: vào bài từ thẻ đề được giao thì ô "Thí sinh" trống (mất tên đã nhập ở cổng tên).
      assert.equal(await s.eval(() => document.getElementById('candidateName')?.value ?? document.getElementById('candidateName')?.textContent),
        'Trần Học Sinh', 'vào bài từ thẻ đề được giao: #candidateName phải là tên học sinh đã nhập ở cổng tên (WEB-contract 19.1), không được trống');
      await submit(s);
      await s.waitFor(() => /Đã gửi/i.test(document.getElementById('syncText')?.textContent ?? ''), 'nộp bài đề được giao: #syncText "Đã gửi"', 20000);
      const kq = gas.gas.sheets.get('KetQua');
      assert.ok(kq && kq.getLastRow() === 2, 'Google Sheet có đúng 1 dòng kết quả');
      assert.match(kq.rows[1].map(String).join(' | '), new RegExp(code), 'dòng kết quả phải có mã lớp');
      assert.match(kq.rows[1].map(String).join(' | '), /Trần Học Sinh/, 'dòng kết quả trong Sheet phải có tên học sinh');
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
        const t = await open(ctx, server, '?teacher');
        await toTeacher(t); await login(t); await loggedIn(t);
        // §21: danh sách đề kho chung giờ nằm trong thư viện đề của giáo viên.
        await nav(t, 'de');
        await t.waitFor(() => !!document.querySelector('#teacherShell [data-exam-id="claude-check-moi-them"]'),
          'tải lại khi có mạng: thư viện đề của giáo viên (#/giao-vien/de) phải có đề vừa thêm vào index.json (đi mạng trước, §17.6)', 10000);
        assert.ok(newGas.log.some((l) => l.method === 'POST' && /teacherLogin/.test(l.body)), 'đăng nhập phải gửi tới link Apps Script MỚI');
        assert.equal(oldGas.log.filter((l) => l.method === 'POST').length, 0, 'không gửi gì tới link cũ');
      } finally { await ctx.close(); await server.close(); await oldGas.close(); await newGas.close(); }
    });
  });
}
