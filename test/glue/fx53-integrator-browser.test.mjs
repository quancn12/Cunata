// Supplemental coverage through the current §21 entry flow; independent suites stay unchanged.
import { test as nodeTest, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as H from '../claude-check/harness.mjs';
import * as A from '../claude-check/app.mjs';
import * as C from '../claude-check/classroom.mjs';
import { measure } from '../../ops/blitz/promoted/_support/design/support.mjs';

const test = (name, options, fn) => nodeTest(name, options, async () => {
  try { await fn(); } catch (error) { console.error(error); throw error; }
});
after(() => {
  for (const handle of process._getActiveHandles()) {
    if (handle.constructor?.name === 'Socket' && handle.remoteAddress === '127.0.0.1'
      && ![process.stdin, process.stdout, process.stderr].includes(handle)) handle.destroy();
    if (handle.constructor?.name === 'ChildProcess' && /(?:chrome|msedge)(?:\.exe)?$/i.test(handle.spawnfile ?? '')) handle.unref();
  }
});

test('FX53: assigned exam is usable at 320px in dark mode and preserves collection name', { timeout: 120000 }, async () => {
  let room, browser, ctx;
  try {
    room = await C.classroomServer(process.cwd() + '/dist');
    const token = C.seedTeacher(room.gas);
    const exam = A.makeExam({ id: 'integration-assigned', part1: ['a'], part2: [], part3: [] });
    assert.equal(room.gas.gas.post({ action: 'publishExam', token, exam }).success, true);
    const cls = C.seedClass(room.gas, [exam.examId], { token });
    browser = await H.launchBrowser(); ctx = await browser.newContext();
    const p = await ctx.newPage(); await p.setViewport(320, 812, true);
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await p.goto(room.server.url); await A.waitBoot(p);
    await A.enterStudentArea(p, { name: "'Nguyễn An" });
    assert.equal(await p.eval(() => document.querySelectorAll('#startScreen .exam-card').length), 0);
    await A.startFromCard(p, await A.joinClass(p, cls.code));
    const measured = await measure(p);
    const titles = measured.texts.filter(t => t.el === 'span.question-title');
    assert.ok(titles.length);
    assert.deepEqual(titles.filter(t => t.contrast < 4.5), []);
    const allowed = new Set(['12px', '14px', '16px', '20px', '24px', '32px']);
    assert.deepEqual(measured.texts.filter(t => !t.math && !allowed.has(t.size)), []);
    await p.click('#btnSubmit');
    assert.deepEqual(await p.eval(() => ['btnCancelSubmit', 'btnConfirmSubmit'].map(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { id, width: r.width, height: r.height, left: r.left, right: r.right };
    }).filter(r => r.width < 44 || r.height < 44 || r.left < 0 || r.right > innerWidth)), []);
    await p.click('#btnConfirmSubmit'); await A.waitReport(p);
    await p.waitFor(() => /Đã gửi/.test(document.getElementById('syncText')?.textContent ?? ''), 'local server receipt', 20000);
    assert.equal(room.gas.gas.sheets.get('KetQua').rows[1][3], "'Nguyễn An");
  } finally { await ctx?.close(); await browser?.close(); await room?.close(); }
});

test('FX53: hidden file import renders the real physics questions and explanations', { timeout: 120000 }, async () => {
  let server, browser, ctx;
  try {
    server = await H.startServer(process.cwd() + '/dist', { overrides: { 'public/config.json': '{"appsScriptUrl":""}' } });
    browser = await H.launchBrowser(); ctx = await browser.newContext();
    const p = await ctx.newPage(); await p.goto(server.url); await A.waitBoot(p);
    await A.enterStudentArea(p);
    for (const n of [12, 14, 10]) {
      const exam = JSON.parse(readFileSync(`dist/public/exams/ly12/de${n}.json`, 'utf8'));
      await A.loadExam(p, exam);
      if (n === 12) {
        await A.submit(p);
        const text = await p.eval(() => document.querySelectorAll('.review-question-card')[9]?.querySelector('.explanation-box')?.innerText);
        assert.ok(text);
        assert.match(text, /\(21 \+ 23 \+ 30 \+ 26\)\/\(4\)/);
        await p.click('#btnDownloadReportHtml');
        const download = await ctx.waitDownload();
        assert.match(download.text, /\(21 \+ 23 \+ 30 \+ 26\)\/\(4\)/);
      } else if (n === 14) {
        const text = await p.eval(() => document.getElementById('qcard-ly12-de14-i-17')?.innerText);
        assert.ok(text); assert.ok(!/\\%/.test(text) || /nguồn|chưa hỗ trợ|LaTeX/i.test(text));
        await A.submit(p);
      } else {
        const q = exam.questions.find(q => q.kind === 'III' && q.answerKey.length === 4);
        await A.typeShort(p, q.questionVersionId, q.answerKey + '9');
        const state = await p.eval(id => {
          const card = document.getElementById('qcard-' + id);
          return { value: card.querySelector('.short-answer-input').value,
            warning: [...card.querySelectorAll('[role=alert]')].some(el => el.getClientRects().length && el.textContent.trim()) };
        }, q.questionVersionId);
        assert.ok(state.value !== q.answerKey || state.warning, 'overlength paste must not silently become the correct answer');
      }
    }
  } finally { await ctx?.close(); await browser?.close(); await server?.close(); }
});
