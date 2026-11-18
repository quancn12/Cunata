// Đo quy chuẩn thiết kế (docs/design/DESIGN.md) trên trình duyệt thật, bản build dist/, ở 375px và 1440px.
// Nhãn vùng: [ui] (src/ui) và [app]. Trưởng phòng 16/11/2026: "giao diện như cứt, không có tính kế thừa".
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, sleep, startServer } from './harness.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TARGETS, enterFromStart, enterStudentArea, joinClass, startFromCard, waitBoot } from './app.mjs';
import { classroomServer, seedClass } from './classroom.mjs';

let browser, server;
const dist = TARGETS.find((t) => t.name === 'dist');
before(async () => { browser = await launchBrowser(); server = await startServer(dist.dir); });
after(async () => { await server?.close(); await browser?.close(); });

// WEB-contract 21: đề chỉ đến tay học sinh qua lớp -> trang học sinh và màn làm bài được đo với một lớp có 6 đề thật được giao.
const realExamIds = () => JSON.parse(readFileSync(join(dist.dir, 'public', 'exams', 'index.json'), 'utf8')).exams.map((e) => e.id).slice(-6);
async function studentWithClass(p) {
  const room = await classroomServer(dist.dir);
  const { code } = seedClass(room.gas, realExamIds());
  p._room = room;
  await p.goto(room.server.url + dist.path + '#/hoc-sinh'); await waitBoot(p);
  return code;
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

/** Đo trang đang hiện: phông, cỡ chữ, vùng bấm, emoji, tràn ngang. */
function audit(page) {
  return page.eval((EMOJI_SRC) => {
    const EMO = new RegExp(EMOJI_SRC, 'u');
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0; };
    const fams = new Set(), sizes = new Set(), small = [], emoji = [], rawColors = [];
    for (const e of document.querySelectorAll('body *')) {
      if (!vis(e) || e.closest('.math-expr, .question-stem, .option-text, .statement-text, .explanation, svg, script, style')) continue;
      const s = getComputedStyle(e);
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (own) { fams.add(s.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase()); sizes.add(s.fontSize); }
      if (own && EMO.test([...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''))) emoji.push((e.id || e.className || e.tagName).toString().slice(0, 40));
    }
    for (const e of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=radio], [role=tab]')) {
      if (!vis(e) || e.closest('.question-stem')) continue;
      const r = e.getBoundingClientRect();
      if ((e.type === 'checkbox' || e.type === 'radio') && e.closest('label')) { const l = e.closest('label').getBoundingClientRect(); if (l.height >= 44) continue; }
      if (r.height < 44 || r.width < 44) small.push(`${(e.id || e.getAttribute('aria-label') || e.textContent.trim() || e.className).toString().slice(0, 30)} ${Math.round(r.width)}×${Math.round(r.height)}`);
    }
    return { fams: [...fams], sizes: [...sizes].sort(), small, emoji, overflow: document.documentElement.scrollWidth - innerWidth };
  }, EMOJI.source);
}

async function check(page, where) {
  const a = await audit(page);
  assert.ok(a.overflow <= 1, `${where}: tràn ngang ${a.overflow}px`);
  assert.equal(a.fams.length, 1, `${where}: phải dùng một họ phông cho toàn trang (DESIGN.md mục 2 "Chữ", kể cả nút/ô nhập), đang có: ${a.fams.join(' | ')}`);
  assert.ok(a.sizes.length <= 6, `${where}: tối đa 6 cỡ chữ theo thang --fs-*, đang có ${a.sizes.length}: ${a.sizes.join(', ')}`);
  const allowed = new Set(['12px', '14px', '16px', '20px', '24px', '32px']);
  const off = a.sizes.filter((s) => !allowed.has(s));
  assert.deepEqual(off, [], `${where}: cỡ chữ ngoài thang 12/14/16/20/24/32px`);
  assert.deepEqual(a.emoji, [], `${where}: không dùng emoji làm biểu tượng/nhãn (dùng SVG trong src/ui/icons.ts)`);
  assert.deepEqual(a.small, [], `${where}: vùng bấm phải tối thiểu 44×44px`);
}

async function focusRing(page, where) {
  const rings = [];
  for (let i = 0; i < 8; i++) {
    await page.press('Tab');
    rings.push(await page.eval(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e);
      return { id: (e.id || e.className || e.tagName).toString().slice(0, 30), ok: (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || /0px 0px 0px [2-9]px/.test(s.boxShadow) }; }));
  }
  const bad = rings.filter((r) => r && !r.ok).map((r) => r.id);
  assert.deepEqual(bad, [], `${where}: phần tử nhận focus bằng Tab phải có viền focus ≥ 2px (DESIGN.md "Focus")`);
}

for (const [w, h, mobile] of [[375, 812, true], [1440, 900, false]]) {
  describe(`[ui] quy chuẩn thiết kế — ${w}px`, { concurrency: 1 }, () => {
    const page = async () => { const ctx = await browser.newContext(); const p = await ctx.newPage(); await p.setViewport(w, h, mobile); p._ctx = ctx; return p; };

    test(`dist: [ui][app] ${w}px màn chọn vai: hai thẻ Học sinh / Giáo viên, đúng quy chuẩn`, { timeout: 90000 }, async () => {
      const p = await page();
      try {
        await p.goto(server.url + dist.path); await waitBoot(p);
        assert.ok(await p.eval(() => !!document.getElementById('roleChooser') && !!document.getElementById('btnRoleStudent') && !!document.getElementById('btnRoleTeacher')),
          'mở trang lần đầu phải là màn chọn vai #roleChooser với #btnRoleStudent và #btnRoleTeacher (WEB-contract 19.1)');
        assert.equal(await p.eval(() => [...document.querySelectorAll('#examPane .question-card, #btnSubmit, #timerBox')].filter((e) => e.getClientRects().length).length), 0,
          'màn chọn vai không được hiện câu hỏi, đồng hồ hay nút Nộp bài');
        await check(p, `màn chọn vai ${w}px`);
        await focusRing(p, `màn chọn vai ${w}px`);
      } finally { await p._ctx.close(); await p._room?.close(); }
    });

    test(`dist: [ui][student] ${w}px trang học sinh: đề dạng thẻ có mô tả + trạng thái, đúng quy chuẩn`, { timeout: 90000 }, async () => {
      const p = await page();
      try {
        const code = await studentWithClass(p);
        if (await p.eval(() => !!document.getElementById('btnRoleStudent') && document.getElementById('roleChooser')?.getClientRects().length > 0)) { await p.click('#btnRoleStudent'); await sleep(500); }
        await p.waitFor(() => !!document.querySelector('#studentNameGate input#startName') || !!document.getElementById('classCodeInput'), 'vào khu học sinh', 8000);
        if (await p.eval(() => !!document.querySelector('#studentNameGate input#startName') && document.getElementById('studentNameGate').getClientRects().length > 0)) await check(p, `cổng nhập tên ${w}px`);
        await enterStudentArea(p, { name: 'Học sinh đo giao diện' });
        await check(p, `trang học sinh chưa vào lớp ${w}px`);
        await joinClass(p, code);
        await p.waitFor(() => document.querySelectorAll('#myClasses .exam-card[data-exam-id]').length >= 3, 'thẻ đề được giao trong #myClasses', 10000);
        const cards = await p.eval(() => [...document.querySelectorAll('#myClasses .exam-card[data-exam-id]')].slice(0, 5).map((c) => ({
          text: c.innerText, status: c.querySelector('.exam-status')?.textContent.trim() ?? '', w: Math.round(c.getBoundingClientRect().width) })));
        for (const c of cards) {
          assert.ok(c.status.length > 0, 'mỗi thẻ đề phải có trạng thái (.exam-status): Chưa làm / Đang làm dở / Đã nộp…');
          assert.match(c.text, /\d+ câu · \d+ phút/, 'thẻ đề phải có dòng "28 câu · 50 phút" (không ngoặc)');
          assert.ok(c.text.split('\n').filter((l) => l.trim()).length >= 4, `thẻ đề phải có môn, tiêu đề, mô tả, thông tin, trạng thái: "${c.text.slice(0, 120)}"`);
        }
        if (w >= 1024) assert.ok(await p.eval(() => { const xs = new Set([...document.querySelectorAll('#myClasses .exam-card')].slice(0, 6).map((c) => Math.round(c.getBoundingClientRect().top))); return xs.size < 6; }),
          'ở 1440px thẻ đề phải xếp lưới nhiều cột (DESIGN.md ExamCard)');
        assert.equal(await p.eval(() => [...document.querySelectorAll('#btnLoadExam, #btnOpenBuilder, #btnOpenBank, #examFileInput + *, #btnTeacher')].filter((e) => e.getClientRects().length).length), 0,
          'trang học sinh không được hiện công cụ giáo viên (nạp JSON, soạn đề, ngân hàng)');
        await check(p, `trang học sinh ${w}px`);
        await focusRing(p, `trang học sinh ${w}px`);
      } finally { await p._ctx.close(); await p._room?.close(); }
    });

    test(`dist: [ui][student] ${w}px màn làm bài: không có công cụ giáo viên, câu 1 thấy ngay, đúng quy chuẩn`, { timeout: 90000 }, async () => {
      const p = await page();
      try {
        const code = await studentWithClass(p);
        await enterFromStart(p, { name: 'Học sinh đo giao diện' });
        await startFromCard(p, await joinClass(p, code));
        assert.equal(await p.eval(() => [...document.querySelectorAll('#btnLoadExam, #btnOpenBuilder, #btnOpenBank')].filter((e) => e.getClientRects().length).length), 0,
          'màn làm bài không được hiện "Nạp đề thi (JSON)", "Soạn đề thi mới", "Ngân hàng câu hỏi"');
        await p.eval(() => window.scrollTo(0, 0)); await sleep(300);
        const top = await p.eval(() => Math.round(document.querySelector('#examPane .question-card').getBoundingClientRect().top));
        assert.ok(top < h, `câu hỏi đầu tiên phải nằm trong màn hình đầu tiên (đang ở y=${top}px, màn cao ${h}px) — bảng số câu ra cột phải hoặc tấm trượt`);
        // Ảnh chụp 17/11: trên điện thoại bảng số câu tự mở đè lên câu hỏi, thanh trên chữ "Nộp bài" bị xuống dòng, "Đã lưu" bị cắt.
        const cover = await p.eval(() => { const c = document.querySelector('#examPane .question-card'); c.scrollIntoView({ block: 'center' });
          const r = c.getBoundingClientRect(); const pts = [[r.left + 24, r.top + 24], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 24, r.top + 24]];
          return pts.map(([x, y]) => { const e = document.elementFromPoint(x, y); return e && !c.contains(e) ? (e.id || e.className || e.tagName).toString().slice(0, 40) : null; }).filter(Boolean); });
        assert.deepEqual(cover, [], `${w}px: không thành phần nào được đè lên câu hỏi khi mới vào bài (bảng số câu chỉ mở khi bấm #btnPalette)`);
        const bar = await p.eval(() => [...document.querySelectorAll('#btnSubmit, #btnOpenExamList, #timerBox, #syncText')].filter((e) => e.getClientRects().length)
          .map((e) => { const r = e.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(e).lineHeight) || 24; return { id: e.id, wrapped: e.scrollHeight > lh * 1.6 + 24 || r.right > innerWidth + 1 }; }).filter((x) => x.wrapped).map((x) => x.id));
        assert.deepEqual(bar, [], `${w}px: chữ trên thanh làm bài không được xuống dòng hay bị cắt ra ngoài màn hình`);
        await check(p, `màn làm bài ${w}px`);
      } finally { await p._ctx.close(); await p._room?.close(); }
    });

    test(`dist: [ui][teacher] ${w}px đăng nhập giáo viên: có tên đăng nhập + mật khẩu, đúng quy chuẩn`, { timeout: 90000 }, async () => {
      const p = await page();
      try {
        await p.goto(server.url + dist.path); await waitBoot(p);
        await p.click('#btnRoleTeacher');
        await p.waitFor(() => !!document.querySelector('#teacherLogin'), 'màn đăng nhập giáo viên #teacherLogin', 8000);
        await check(p, `đăng nhập giáo viên ${w}px`);
      } finally { await p._ctx.close(); await p._room?.close(); }
    });

    test(`dist: [ui][admin] ${w}px trang admin riêng (admin.html), đúng quy chuẩn`, { timeout: 90000 }, async () => {
      const p = await page();
      try {
        await p.goto(server.url + 'admin.html');
        await p.waitFor(() => !!document.querySelector('#adminLogin input#adminPassword'), 'admin.html có #adminLogin với ô #adminPassword', 10000);
        await check(p, `đăng nhập admin ${w}px`);
      } finally { await p._ctx.close(); await p._room?.close(); }
    });
  });
}

test('dist: [ui] màu chỉ định nghĩa trong src/ui/tokens.css; dark mode có bộ token riêng', async () => {
  const { readFileSync, readdirSync, statSync, existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { PROJECT_ROOT } = await import('./harness.mjs');
  const tok = join(PROJECT_ROOT, 'src', 'ui', 'tokens.css');
  assert.ok(existsSync(tok), 'thiếu src/ui/tokens.css (DESIGN.md mục 2)');
  const t = readFileSync(tok, 'utf8');
  for (const k of ['--c-bg', '--c-surface', '--c-text', '--c-primary', '--font', '--fs-md', '--sp-4', '--r-md', '--shadow-1']) assert.ok(t.includes(k), `tokens.css thiếu ${k}`);
  assert.match(t, /prefers-color-scheme:\s*dark/, 'tokens.css phải có bộ màu tối');
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const offenders = [];
  for (const f of walk(join(PROJECT_ROOT, 'src')).filter((f) => /\.(css|ts)$/.test(f) && !f.endsWith('tokens.css') && !/[\\/]domain[\\/]/.test(f))) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const hits = (src.match(/#[0-9a-fA-F]{3,8}\b(?![\w-])|rgba?\(\s*\d/g) ?? []).filter((x) => !/^#[0-9]{3,8}$/.test(x) || /[a-f]/i.test(x));
    if (hits.length > 0) offenders.push(`${f.slice(PROJECT_ROOT.length)}: ${hits.length} mã màu (vd ${hits[0]})`);
  }
  assert.deepEqual(offenders.slice(0, 15), [], 'mã màu trực tiếp ngoài tokens.css — dùng var(--c-*)');
});
