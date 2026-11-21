import { launchBrowser } from '../claude-check/harness.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { TARGETS, enterStudentArea, joinClass, startFromCard, waitBoot } from '../claude-check/app.mjs';
import { classroomServer, seedClass, seedTeacher } from '../claude-check/classroom.mjs';
const browser = await launchBrowser();
let env;
const timeout = setTimeout(() => { browser.close(); process.exitCode = 1; }, 120000);
try {
  env = await classroomServer(TARGETS.find(t => t.name === 'dist').dir);
  const token = seedTeacher(env.gas);
  const { code } = seedClass(env.gas, ['exam-thpt-toan-full-demo'], { token });
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.setViewport(390, 844, true);
    await page.goto(env.server.url + '#/hoc-sinh');
    await waitBoot(page);
    await enterStudentArea(page, { name: 'Học sinh thi thử' });
    await startFromCard(page, await joinClass(page, code));
    for (const width of [320, 375, 390, 768, 1440]) {
      await page.setViewport(width, 900, width < 600);
      const size = await page.eval(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
      assert.equal(size.width, width);
      assert.ok(size.content <= width, `${width}px: content ${size.content}px`);
      console.log(`PASS: exam fits ${width}px`);
    }
    for (const width of [375, 768, 1440]) {
      await page.setViewport(width, 900, width < 600);
      for (const theme of ['light', 'dark']) {
        await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
        await page.eval(() => scrollTo(0, 0));
        await new Promise(resolve => setTimeout(resolve, 250));
        const shot = await page.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(new URL(`./fx64-${width}-${theme}.png`, import.meta.url), Buffer.from(shot.data, 'base64'));
      }
    }
    await page.setViewport(375, 900, true);
    await page.waitFor(() => document.getElementById('btnPalette').getClientRects().length > 0, 'mobile palette button', 3000);
    await page.eval(() => document.getElementById('btnPalette').focus());
    await page.press('Enter');
    assert.equal(await page.eval(() => document.querySelector('.palette-card').classList.contains('is-open')), true);
    await page.press('Escape');
    assert.equal(await page.eval(() => document.querySelector('.palette-card').classList.contains('is-open')), false);
    assert.equal(await page.eval(() => document.activeElement.id), 'btnPalette');
    console.log('PASS: keyboard opens/closes palette and restores focus');
  } finally { await ctx.close(); }
} finally { await env?.close(); await browser.close(); clearTimeout(timeout); }
