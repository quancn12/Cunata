import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, startServer } from '../claude-check/harness.mjs';
import { openApp, submit, TARGETS, loadExam, makeExam, setName, pickOption, qI, waitSaved } from '../claude-check/app.mjs';

test('root report downloads as a complete HTML file', { timeout: 60000 }, async () => {
  const target = TARGETS.find(t => t.name === 'root');
  const server = await startServer(target.dir);
  let browser, ctx;
  try {
    browser = await launchBrowser(); ctx = await browser.newContext();
    const page = await openApp(ctx, server, target);
    await loadExam(page, makeExam());
    await setName(page, '<img src=x onerror="window.__xss=1">An');
    await pickOption(page, qI(1), 'a');
    await waitSaved(page);
    await submit(page);
    await page.click('#btnDownloadReportHtml');
    const file = await ctx.waitDownload();
    assert.match(file.text, /<!DOCTYPE html>/i);
    assert.ok(file.text.includes('&lt;img src=x'));
    assert.equal(await page.eval(() => window.__xss ?? null), null);
  } finally {
    await ctx?.close(); await browser?.close(); await server.close();
    for (const h of process._getActiveHandles()) {
      if (h.constructor?.name === 'Socket' && h.remoteAddress === '127.0.0.1' && ![process.stdin, process.stdout, process.stderr].includes(h)) h.destroy();
      if (h.constructor?.name === 'ChildProcess' && /(?:chrome|msedge)(?:\.exe)?$/i.test(h.spawnfile ?? '')) h.unref();
    }
  }
});
