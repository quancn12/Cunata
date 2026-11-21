import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, PROJECT_ROOT } from '../claude-check/harness.mjs';
import { TARGETS, enterStudentArea, joinClass, startFromCard, waitBoot, mouseClick } from '../claude-check/app.mjs';
import { classroomServer, seedClass, seedTeacher } from '../claude-check/classroom.mjs';

let browser, env, code;
const artifacts = `${PROJECT_ROOT}/test/glue/fx64-artifacts`;
before(async () => {
  browser = await launchBrowser();
  env = await classroomServer(TARGETS.find((t) => t.name === 'dist').dir);
  const token = seedTeacher(env.gas);
  ({ code } = seedClass(env.gas, ['exam-thpt-toan-full-demo'], { token }));
  mkdirSync(artifacts, { recursive: true });
}, { timeout: 30000 });
after(async () => {
  try { await env?.close(); } finally { await browser?.close(); }
}, { timeout: 30000 });

for (const width of [375, 768, 1440]) for (const scheme of ['light', 'dark']) {
  test(`FX64 exam: ${width}px ${scheme}, keyboard flags and incomplete II count`, { timeout: 60000 }, async (t) => {
    const ctx = await browser.newContext();
    t.after(() => ctx.close());
    const page = await ctx.newPage();
    await page.setViewport(width, 900, width < 600);
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await page.goto(env.server.url + '#/hoc-sinh');
    await waitBoot(page);
    await enterStudentArea(page, { name: 'Kiểm tra bố cục' });
    await startFromCard(page, await joinClass(page, code));
    const layout = await page.eval(() => ({ width: innerWidth, content: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.equal(layout.width, width);
    assert.ok(layout.scroll <= layout.content, `horizontal overflow: ${JSON.stringify(layout)}`);

    await page.eval(() => document.querySelector('.btn-flag').focus());
    await page.press('Enter');
    assert.equal(await page.eval(() => document.querySelector('.btn-flag').getAttribute('aria-pressed')), 'true');
    assert.equal(await page.eval(() => document.querySelector('#paletteGrid button').classList.contains('flagged')), true);
    await page.press('Enter');
    assert.equal(await page.eval(() => document.querySelector('.btn-flag').getAttribute('aria-pressed')), 'false');

    const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(`${artifacts}/exam-${width}-${scheme}.png`, Buffer.from(shot.data, 'base64'));
    await mouseClick(page, '.statement-row .tf-btn[data-val="true"]');
    await mouseClick(page, '#btnSubmit');
    assert.match(await page.eval(() => document.getElementById('modalBodyText').textContent), /0\/8/);
    await page.press('Escape');
    assert.equal(await page.eval(() => document.activeElement.id), 'btnSubmit');
  });
}
