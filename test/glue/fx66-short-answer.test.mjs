import '../../ops/blitz/promoted/_support/runtime.mjs';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, startServer } from '../claude-check/harness.mjs';
import { makeExam, waitBoot, enterStudentArea, loadExam, typeShort, shortValue, qIII, waitSaved } from '../claude-check/app.mjs';

after(() => {
  for (const handle of process._getActiveHandles()) {
    if (handle.constructor?.name === 'Socket' && handle.remoteAddress === '127.0.0.1' && ![process.stdin, process.stdout, process.stderr].includes(handle)) handle.destroy();
    if (handle.constructor?.name === 'ChildProcess' && /(?:chrome|msedge)(?:\.exe)?$/i.test(handle.spawnfile ?? '')) handle.unref();
  }
});

test('FX66: reject an overlength paste without saving a truncated answer across reload', { timeout: 60000 }, async () => {
  let server, browser, context;
  try {
    server = await startServer(process.cwd() + '/dist', { overrides: { 'public/config.json': '{"appsScriptUrl":""}' } });
    browser = await launchBrowser();
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(server.url);
    await waitBoot(page);
    await enterStudentArea(page);
    await loadExam(page, makeExam({ part3: ['-0,5'] }));
    await typeShort(page, qIII(1), '12');
    await waitSaved(page);
    await typeShort(page, qIII(1), '-0,59');
    assert.equal(await shortValue(page, qIII(1)), '12', 'retain the previous answer instead of manufacturing the correct four-character prefix');
    assert.equal(await page.eval(() => {
      const warning = document.querySelector('.short-answer-error');
      return !!warning?.getClientRects().length && !!warning.textContent.trim();
    }), true, 'the rejected edit stays explained after change and blur');
    await waitSaved(page);
    await page.reload();
    await waitBoot(page);
    assert.equal(await shortValue(page, qIII(1)), '12', 'reload must not restore a truncated correct answer');
    await typeShort(page, qIII(1), '-0,5');
    await waitSaved(page);
    assert.equal(await shortValue(page, qIII(1)), '-0,5');
    assert.equal(await page.eval(() => document.querySelector('.short-answer-error').style.display), 'none');
  } finally {
    try { await context?.close(); } finally {
      try { await browser?.close(); } finally { await server?.close(); }
    }
  }
});
