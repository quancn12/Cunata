import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CdpClient } from '../browser/cdp-client.ts';
// @ts-ignore Existing local HTTP fixtures; no Google/Neon calls.
import { rig, seed, classroom, catalog, T1, ADMIN, localServer, H } from '../codex-check/feat/R1/support.mjs';

test('apiBase integrates teacher, student class lookup and admin through the real HTTP API', { timeout: 120000 }, async () => {
  const api = await rig({ now: Date.now() });
  const tokens = await seed(api);
  const cls = await classroom(api, tokens[T1.username], catalog[0].id, {
    openAt: Date.now() - 60000, dueAt: Date.now() + 3600000,
  });
  const staticServer = await H.startServer(H.PROJECT_ROOT + '/dist', {
    overrides: { 'public/config.json': JSON.stringify({ apiBase: '/api/rpc', appsScriptUrl: '/forbidden-legacy' }) },
  });
  let server: any;
  let browser: CdpClient | undefined;
  try {
    server = await localServer(api, staticServer);
    browser = await CdpClient.launch({ width: 1280, height: 900 });
    const fill = async (selector: string, value: string) => {
      await browser!.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    };
    const click = async (selector: string) => { await browser!.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); };
    const wait = async (selector: string) => assert.equal(await browser!.waitForVisible(selector, 15000), true, selector);

    await browser.navigate(server.url + '/index.html#/giao-vien');
    await wait('#teacherUsername');
    await fill('#teacherUsername', T1.username); await fill('#teacherPassword', T1.password);
    await click('#btnTeacherLogin'); await wait('#teacherShell'); await wait('.class-card');

    await browser.navigate(server.url + '/index.html#/hoc-sinh');
    await wait('#startName'); await fill('#startName', 'Nguyễn An'); await click('#btnNameContinue');
    await wait('#classCodeInput'); await fill('#classCodeInput', cls.code); await click('#btnJoinClass');
    await wait(`#myClasses [data-assignment-id="${cls.assignmentId}"]`);

    await browser.navigate(server.url + '/admin.html');
    await wait('#adminPassword'); await fill('#adminPassword', ADMIN); await click('#btnAdminLogin');
    await wait('#adminPanel'); await wait('.teacher-row');

    for (const action of ['teacherLogin', 'adminLogin']) {
      assert.ok(server.log.some((x: any) => x.input.action === action && x.method === 'POST' && x.contentType.startsWith('application/json')), action);
    }
    assert.ok(server.log.some((x: any) => x.input.action === 'getClass' && x.input.code === cls.code));
  } finally {
    await browser?.close();
    await server?.close();
    await staticServer.close();
  }
});
