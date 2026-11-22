import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MockCacheStorage } from '../offline/testHelpers.ts';

const root = process.cwd();
const { pathToFileURL } = await import('node:url');
const H = await import(pathToFileURL(root + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(root + '/test/claude-check/app.mjs').href);
const API = await import(pathToFileURL(root + '/src/api/index.ts').href);
const { localServer, memoryContext } = await import('../codex-check/feat/R2/local-server.mjs');

test('R2-F01 unit: service worker isCacheableRequest rejects RPC endpoints and keeps static assets', async () => {
  const swCode = readFileSync(new URL('../../dist/service-worker.js', import.meta.url), 'utf8');
  const sandbox = {
    self: { addEventListener: () => {} },
    caches: new MockCacheStorage(),
    URL,
    Response,
    Map,
    Set,
  };
  vm.runInNewContext(swCode, sandbox);

  const match = swCode.match(/function isCacheableRequest\([\s\S]*?\n\}/);
  assert.ok(match, 'isCacheableRequest must be defined in service-worker.js');
  const isCacheableRequest = vm.runInNewContext(`(${match[0]})`, sandbox);

  // RPC endpoints must be rejected
  assert.equal(isCacheableRequest('/api/rpc', 'GET'), false);
  assert.equal(isCacheableRequest('/api/rpc?action=getExam&id=test', 'GET'), false);
  assert.equal(isCacheableRequest('https://cunata.vercel.app/api/rpc', 'GET'), false);
  assert.equal(isCacheableRequest('https://cunata.vercel.app/api/rpc?action=getClass&code=ABCDEF', 'GET'), false);
  assert.equal(isCacheableRequest('http://127.0.0.1:3000/api/rpc?action=getExam', 'GET'), false);
  assert.equal(isCacheableRequest('http://127.0.0.1:3000/api/rpc', 'POST'), false);
  assert.equal(isCacheableRequest('https://script.google.com/macros/s/test/exec', 'GET'), false);

  // Static assets must be accepted
  assert.equal(isCacheableRequest('index.html', 'GET'), true);
  assert.equal(isCacheableRequest('app/main.js', 'GET'), true);
  assert.equal(isCacheableRequest('public/config.json', 'GET'), true);
  assert.equal(isCacheableRequest('public/exams/index.json', 'GET'), true);
  assert.equal(isCacheableRequest('styles/style.css', 'GET'), true);
});

test('R2-F01 unit: fetch listener bypasses RPC requests and activate purges residual RPC cache', async () => {
  const swCode = readFileSync(new URL('../../dist/service-worker.js', import.meta.url), 'utf8');
  const handlers = new Map();
  const mockCaches = new MockCacheStorage();

  const selfObj = {
    addEventListener: (type, cb) => handlers.set(type, cb),
    registration: { scope: '/' },
    clients: {
      claim: async () => {},
      matchAll: async () => [],
    },
  };

  vm.runInNewContext(swCode, {
    self: selfObj,
    caches: mockCaches,
    URL,
    Response,
    Request,
    Map,
    Set,
    fetch: async () => new Response('ok'),
  });

  // Verify fetch event does not intercept /api/rpc
  let responded = false;
  const fetchHandler = handlers.get('fetch');
  assert.ok(fetchHandler, 'fetch handler must be registered');

  fetchHandler({
    request: new Request('http://127.0.0.1:3000/api/rpc?action=getExam&id=abc'),
    respondWith: () => {
      responded = true;
    },
  });
  assert.equal(responded, false, 'Fetch event must NOT call respondWith for /api/rpc (must bypass)');

  // Verify activate handler purges residual RPC entries and does not migrate them from old cache
  const swCacheName = swCode.match(/const CACHE_NAME = '([^']+)';/)[1];
  const currentCache = await mockCaches.open(swCacheName);
  const oldCache = await mockCaches.open('cunata-cache-v-old');

  // Provide essential shell files so activate does not return early
  await currentCache.put('index.html', new Response('<html></html>'));
  await currentCache.put('app/main.js', new Response('console.log(1);'));

  // Seed old and current cache with RPC entries
  await oldCache.put('http://127.0.0.1:3000/api/rpc?action=getExam&id=old', new Response('stale-old'));
  await oldCache.put('http://127.0.0.1:3000/public/asset.js', new Response('valid-asset'));
  await currentCache.put('http://127.0.0.1:3000/api/rpc?action=getExam&id=residual', new Response('residual'));

  // Run activate handler
  const activateHandler = handlers.get('activate');
  assert.ok(activateHandler, 'activate handler must be registered');

  let waitUntilPromise = null;
  activateHandler({
    waitUntil: (p) => {
      waitUntilPromise = p;
    },
  });
  await waitUntilPromise;

  // Residual RPC entry should be purged from current cache
  const residualMatch = await currentCache.match('http://127.0.0.1:3000/api/rpc?action=getExam&id=residual');
  assert.equal(residualMatch, undefined, 'Residual RPC entry must be purged from current cache');

  // Old RPC entry should NOT be migrated to current cache
  const oldRpcMatch = await currentCache.match('http://127.0.0.1:3000/api/rpc?action=getExam&id=old');
  assert.equal(oldRpcMatch, undefined, 'Old RPC entry must NOT be migrated to current cache');

  // Valid asset should be preserved
  const validAssetMatch = await currentCache.match('http://127.0.0.1:3000/public/asset.js');
  assert.ok(validAssetMatch, 'Valid static asset must be preserved in cache');
});

test('R2-F01 integration: browser service worker bypasses GET RPC and reflects server state updates', async () => {
  const ctx = memoryContext();
  const server = await localServer(root + '/dist', { apiBase: '/api/rpc' }, ctx);
  let browser, context;

  try {
    // Create teacher and publish initial exam
    const adminRes = await API.handle({ method: 'POST', body: { action: 'adminLogin', password: ctx.adminPassword } }, ctx);
    const adminToken = adminRes.body.token;
    await API.handle(
      {
        method: 'POST',
        body: { action: 'adminCreateTeacher', token: adminToken, username: 'swteacher', password: 'password123', name: 'GV' },
      },
      ctx
    );
    const loginRes = await API.handle(
      { method: 'POST', body: { action: 'teacherLogin', username: 'swteacher', password: 'password123' } },
      ctx
    );
    const teacherToken = loginRes.body.token;

    const exam = A.makeExam({ id: 'audit-r2-sw', title: 'Old title', part1: ['a'], part2: [], part3: [] });
    await API.handle({ method: 'POST', body: { action: 'publishExam', token: teacherToken, exam } }, ctx);

    browser = await H.launchBrowser();
    context = await browser.newContext();
    const page = await context.newPage();

    await page.send('Network.setBlockedURLs', { urls: ['https://*'] });
    await page.goto(server.url + '/Cunata/');
    await A.waitBoot(page);

    // Register service worker and activate controller
    await page.eval(async () => {
      const reg = await navigator.serviceWorker.register('service-worker.js');
      await new Promise((resolve) => {
        if (reg.active) return resolve();
        const w = reg.installing || reg.waiting;
        if (!w) return resolve();
        w.addEventListener('statechange', () => {
          if (w.state === 'installed') w.postMessage({ type: 'SKIP_WAITING' });
          else if (w.state === 'activated') resolve();
        });
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    });
    await page.reload();
    await A.waitBoot(page);

    const isControlled = await page.eval(() => !!navigator.serviceWorker.controller);
    assert.equal(isControlled, true, 'Page must be controlled by service worker');

    // First fetch: should return Old title
    const firstData = await page.eval(async () => {
      const res = await fetch('/api/rpc?action=getExam&id=audit-r2-sw', { cache: 'no-store' });
      return await res.json();
    });
    assert.equal(firstData.exam?.title || firstData.title, 'Old title');

    // Update exam to New title
    const updatedExam = { ...exam, title: 'New title' };
    await API.handle({ method: 'POST', body: { action: 'publishExam', token: teacherToken, exam: updatedExam } }, ctx);

    // Second fetch: must return New title (NOT Old title from cache!)
    const secondData = await page.eval(async () => {
      const res = await fetch('/api/rpc?action=getExam&id=audit-r2-sw', { cache: 'no-store' });
      return await res.json();
    });
    assert.equal(
      secondData.exam?.title || secondData.title,
      'New title',
      'Service worker must not serve stale cached RPC response after server update'
    );

    // Unpublish exam
    await API.handle({ method: 'POST', body: { action: 'unpublishExam', token: teacherToken, examId: 'audit-r2-sw' } }, ctx);

    // Third fetch: must return NOT_FOUND (NOT cached 200 response!)
    const thirdData = await page.eval(async () => {
      const res = await fetch('/api/rpc?action=getExam&id=audit-r2-sw', { cache: 'no-store' });
      return await res.json();
    });
    assert.equal(thirdData.error, 'NOT_FOUND', 'Service worker must not serve cached 200 after exam is unpublished');
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await server.close();
  }
});
