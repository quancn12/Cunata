import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, startServer, PROJECT_ROOT } from '../claude-check/harness.mjs';
import { waitBoot } from '../claude-check/app.mjs';

let browser, server;
const artifacts = join(PROJECT_ROOT, 'test/app/artifacts');
before(async () => { mkdirSync(artifacts, { recursive: true }); browser = await launchBrowser(); server = await startServer(join(PROJECT_ROOT, 'dist')); });
after(async () => { await server?.close(); await browser?.close(); });

for (const width of [375, 768, 1440]) for (const scheme of ['light', 'dark']) {
  test(`role shell: ${width}px ${scheme}, keyboard and remembered role`, async () => {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    try {
      await page.setViewport(width, 900, width === 375);
      await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await page.goto(server.url); await waitBoot(page);
      assert.equal(await page.eval(() => getComputedStyle(document.getElementById('roleChooser')).display !== 'none'), true);
      assert.equal(await page.eval(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.eval(() => document.getElementById('timerBox').getClientRects().length), 0);
      await page.press('Tab');
      assert.equal(await page.eval(() => document.activeElement.id), 'btnRoleStudent');
      assert.equal(await page.eval(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
      const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(join(artifacts, `chooser-${width}-${scheme}.png`), Buffer.from(shot.data, 'base64'));
      await page.press('Enter');
      await page.waitFor(() => location.hash === '#/hoc-sinh', 'student route');
      assert.equal(await page.eval(() => document.getElementById('timerBox').getClientRects().length), 0);
      await page.reload(); await waitBoot(page);
      assert.equal(await page.eval(() => location.hash), '#/hoc-sinh');
      await page.click('#btnChangeRole');
      assert.equal(await page.eval(() => document.getElementById('roleChooser').hidden), false);
      await page.goto(server.url); await waitBoot(page);
      assert.equal(await page.eval(() => document.getElementById('roleChooser').hidden), false);
      assert.deepEqual(page.errors.filter((error) => !/(?:favicon|DEBUG-)/.test(error)), []);
    } finally { await ctx.close(); }
  });
}

test('live service worker refreshes config and manifest, then serves their last successful values offline', async () => {
  const overrides = { 'public/config.json': JSON.stringify({ appsScriptUrl: '', marker: 'old' }) };
  const changingServer = await startServer(join(PROJECT_ROOT, 'dist'), { overrides });
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  try {
    await page.goto(changingServer.url); await waitBoot(page);
    await page.waitFor(() => navigator.serviceWorker.getRegistration().then((registration) => !!registration?.active), 'worker active', 15000);
    await page.reload(); await waitBoot(page);
    const original = await page.eval(() => fetch('public/exams/index.json').then((response) => response.json()));
    overrides['public/config.json'] = JSON.stringify({ appsScriptUrl: '', marker: 'new' });
    overrides['public/exams/index.json'] = JSON.stringify({ ...original, marker: 'new-index' });
    const read = () => page.eval(async () => {
      const config = await fetch('public/config.json', { cache: 'no-store' }).then((response) => response.json());
      const manifest = await fetch('public/exams/index.json', { cache: 'no-store' }).then((response) => response.json());
      return [config.marker, manifest.marker];
    });
    assert.deepEqual(await read(), ['new', 'new-index']);
    await page.setOffline(true);
    assert.deepEqual(await read(), ['new', 'new-index']);
    await page.setOffline(false);
  } finally { await ctx.close(); await changingServer.close(); }
});

test('explicit role hash wins over an old teacher or exam query after changing roles', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  try {
    for (const query of ['?teacher', '?exam=toan-full']) {
      await page.goto(server.url + query + '#/'); await waitBoot(page);
      assert.equal(await page.eval(() => document.getElementById('roleChooser').hidden), false);
      await page.press('Tab'); await page.press('Enter');
      await page.waitFor(() => location.hash === '#/hoc-sinh', 'explicit student route');
      await page.reload(); await waitBoot(page);
      assert.equal(await page.eval(() => document.getElementById('startScreen').style.display), 'block');
      await page.click('#btnChangeRole');
    }
  } finally { await ctx.close(); }
});
