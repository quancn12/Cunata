/**
 * Cunata Web M2/M6 — Service Worker Core Tests
 * Tests atomic install, partial precache failure, old cache retention, fetch caching & navigation fallback,
 * subpath scope resolution, and strict exclusion of collector & private reports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeInstall,
  executeActivate,
  executeFetch,
} from '../../src/offline/service-worker.ts';
import {
  CACHE_NAME,
  CACHE_NAME_PREFIX,
  isCacheableRequest,
  resolveScopeUrl,
  type PrecacheManifestItem,
} from '../../src/offline/types.ts';
import { MockCacheStorage, createMockFetch } from './testHelpers.ts';

describe('Service Worker Core: Installation, Precache & Atomicity', () => {
  it('installs atomically when all critical precache assets succeed', async () => {
    const caches = new MockCacheStorage();
    const mockFetch = createMockFetch({
      'index.html': '<html>Shell</html>',
      './': '<html>Shell Root</html>',
      'styles/style.css': 'body { margin: 0; }',
      'public/sample-exam.json': JSON.stringify({ examId: 'sample-01' }),
      'public/q01-bbt.svg': '<svg></svg>',
    });

    const items: PrecacheManifestItem[] = [
      { url: 'index.html', critical: true, category: 'shell' },
      { url: 'styles/style.css', critical: true, category: 'style' },
      { url: 'public/sample-exam.json', critical: true, category: 'sample' },
    ];

    await executeInstall({
      cacheName: CACHE_NAME,
      precacheItems: items,
      scopeBase: '/',
      fetchFn: mockFetch.fetchFn,
      cachesObj: caches,
    });

    const cache = await caches.open(CACHE_NAME);
    const indexMatch = await cache.match('index.html');
    assert.ok(indexMatch, 'index.html must be cached');
    assert.strictEqual(await indexMatch.text(), '<html>Shell</html>');

    const cssMatch = await cache.match('styles/style.css');
    assert.ok(cssMatch, 'styles/style.css must be cached');
  });

  it('fails atomically when a critical asset fails to fetch, deleting the cache', async () => {
    const caches = new MockCacheStorage();
    const mockFetch = createMockFetch({
      'index.html': '<html>Shell</html>',
    });
    // Critical asset styles/style.css fails with 404
    mockFetch.setResponse('styles/style.css', () => new Response('Not found', { status: 404 }));

    const items: PrecacheManifestItem[] = [
      { url: 'index.html', critical: true, category: 'shell' },
      { url: 'styles/style.css', critical: true, category: 'style' },
    ];

    await assert.rejects(
      async () => {
        await executeInstall({
          cacheName: CACHE_NAME,
          precacheItems: items,
          scopeBase: '/',
          fetchFn: mockFetch.fetchFn,
          cachesObj: caches,
        });
      },
      /Atomic precache failed on critical asset "styles\/style.css"/
    );

    // Verify cache was deleted (atomic rollback)
    const exists = await caches.has(CACHE_NAME);
    assert.strictEqual(exists, false, 'Partially populated cache must be deleted on critical failure');
  });

  it('preserves existing old active cache when new install fails atomically', async () => {
    const caches = new MockCacheStorage();
    const oldCacheName = `${CACHE_NAME_PREFIX}v0`;
    const oldCache = await caches.open(oldCacheName);
    await oldCache.put('index.html', new Response('<html>Old Shell</html>'));

    const mockFetch = createMockFetch({
      'index.html': '<html>New Shell</html>',
    });
    // Critical asset fails
    mockFetch.setResponse('styles/style.css', () => new Response('Error', { status: 500 }));

    const items: PrecacheManifestItem[] = [
      { url: 'index.html', critical: true, category: 'shell' },
      { url: 'styles/style.css', critical: true, category: 'style' },
    ];

    await assert.rejects(async () => {
      await executeInstall({
        cacheName: `${CACHE_NAME_PREFIX}v1`,
        precacheItems: items,
        scopeBase: '/',
        fetchFn: mockFetch.fetchFn,
        cachesObj: caches,
      });
    });

    // Old cache must remain completely intact
    const oldIndex = await oldCache.match('index.html');
    assert.ok(oldIndex, 'Old active cache must survive failed install');
    assert.strictEqual(await oldIndex.text(), '<html>Old Shell</html>');
  });

  it('allows partial precache failure for non-critical assets while preserving critical assets', async () => {
    const caches = new MockCacheStorage();
    const mockFetch = createMockFetch({
      'index.html': '<html>Shell</html>',
      'styles/style.css': 'body {}',
    });
    // Non-critical optional sample fixture fails
    mockFetch.setResponse('public/exams/optional.json', () => new Response('Missing', { status: 404 }));

    const items: PrecacheManifestItem[] = [
      { url: 'index.html', critical: true, category: 'shell' },
      { url: 'styles/style.css', critical: true, category: 'style' },
      { url: 'public/exams/optional.json', critical: false, category: 'sample' },
    ];

    // Install should succeed despite optional failure
    await executeInstall({
      cacheName: CACHE_NAME,
      precacheItems: items,
      scopeBase: '/',
      fetchFn: mockFetch.fetchFn,
      cachesObj: caches,
    });

    const cache = await caches.open(CACHE_NAME);
    assert.ok(await cache.match('index.html'), 'Critical index.html cached');
    assert.ok(await cache.match('styles/style.css'), 'Critical CSS cached');
    assert.strictEqual(await cache.match('public/exams/optional.json'), undefined, 'Optional asset omitted');
  });

  it('resolves relative URLs accurately under subpath scopes (root / and /Cunata/)', async () => {
    assert.strictEqual(resolveScopeUrl('/', 'index.html'), '/index.html');
    assert.strictEqual(resolveScopeUrl('/', './index.html'), '/index.html');
    assert.strictEqual(resolveScopeUrl('/', './styles/style.css'), '/styles/style.css');

    assert.strictEqual(resolveScopeUrl('/Cunata/', 'index.html'), '/Cunata/index.html');
    assert.strictEqual(resolveScopeUrl('/Cunata/', './index.html'), '/Cunata/index.html');
    assert.strictEqual(resolveScopeUrl('/Cunata', 'app/main.js'), '/Cunata/app/main.js');
    assert.strictEqual(resolveScopeUrl('/Cunata/', './'), '/Cunata/');

    const caches = new MockCacheStorage();
    const mockFetch = createMockFetch();

    await executeInstall({
      cacheName: CACHE_NAME,
      precacheItems: [{ url: 'index.html', critical: true, category: 'shell' }],
      scopeBase: '/Cunata/',
      fetchFn: mockFetch.fetchFn,
      cachesObj: caches,
    });

    const cache = await caches.open(CACHE_NAME);
    const subpathMatch = await cache.match('/Cunata/index.html');
    assert.ok(subpathMatch, 'Cached under subpath /Cunata/index.html');
  });
});

describe('Service Worker Core: Activation & Old Cache Pruning', () => {
  it('retains old active cache during installation and deletes it only upon executeActivate', async () => {
    const caches = new MockCacheStorage();
    const oldCacheName = `${CACHE_NAME_PREFIX}v0`;
    const newCacheName = `${CACHE_NAME_PREFIX}v1`;

    await (await caches.open(oldCacheName)).put('index.html', new Response('Old V0'));
    await (await caches.open(newCacheName)).put('index.html', new Response('New V1'));
    // Unrelated third-party cache
    await (await caches.open('unrelated-cache')).put('asset.png', new Response('PNG'));

    let claimCalled = false;
    await executeActivate({
      currentCacheName: newCacheName,
      cachesObj: caches,
      claimClients: async () => {
        claimCalled = true;
      },
    });

    assert.strictEqual(claimCalled, true, 'clients.claim() must be invoked');
    assert.strictEqual(await caches.has(oldCacheName), false, 'Old cunata cache v0 must be deleted');
    assert.strictEqual(await caches.has(newCacheName), true, 'Current cunata cache v1 must be retained');
    assert.strictEqual(await caches.has('unrelated-cache'), true, 'Foreign non-cunata cache must NOT be touched');
  });
});

describe('Service Worker Core: Fetch Strategy & Cold-Start Navigation Fallback', () => {
  it('serves cached assets cache-first without calling fetch', async () => {
    const caches = new MockCacheStorage();
    const cache = await caches.open(CACHE_NAME);
    await cache.put('/styles/style.css', new Response('cached-css', { status: 200 }));

    const mockFetch = createMockFetch();
    const response = await executeFetch(
      { url: '/styles/style.css', method: 'GET' },
      { cachesObj: caches, fetchFn: mockFetch.fetchFn }
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(await response.text(), 'cached-css');
    assert.strictEqual(mockFetch.getHistory().length, 0, 'Fetch must not be called when cached');
  });

  it('falls back to network on cache miss and stores successful response', async () => {
    const caches = new MockCacheStorage();
    const mockFetch = createMockFetch({
      '/app/main.js': 'console.log("module");',
    });

    const response = await executeFetch(
      { url: '/app/main.js', method: 'GET' },
      { cachesObj: caches, fetchFn: mockFetch.fetchFn }
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(await response.text(), 'console.log("module");');

    // Verify it was populated into cache
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('/app/main.js');
    assert.ok(cached, 'Dynamically fetched asset must be cached for subsequent requests');
  });

  it('cold-start offline: serves cached shell index.html for navigation when network is offline', async () => {
    const caches = new MockCacheStorage();
    const cache = await caches.open(CACHE_NAME);
    await cache.put('index.html', new Response('<!DOCTYPE html><html>Offline Shell</html>', { status: 200 }));

    const mockFetch = createMockFetch();
    mockFetch.setNetworkFailure(true); // Network down

    const response = await executeFetch(
      { url: 'http://localhost:8000/', method: 'GET', mode: 'navigate' },
      { cachesObj: caches, fetchFn: mockFetch.fetchFn }
    );

    assert.strictEqual(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('Offline Shell'), 'Navigational request must fall back to shell when offline');
  });

  it('returns 503 OFFLINE_UNAVAILABLE for non-navigational requests when offline and uncached', async () => {
    const caches = new MockCacheStorage();
    const mockFetch = createMockFetch();
    mockFetch.setNetworkFailure(true);

    const response = await executeFetch(
      { url: 'http://localhost:8000/api/missing-asset.png', method: 'GET' },
      { cachesObj: caches, fetchFn: mockFetch.fetchFn }
    );

    assert.strictEqual(response.status, 503);
    const json = await response.json();
    assert.strictEqual(json.error, 'OFFLINE_UNAVAILABLE');
  });
});

describe('Service Worker Core: Strict Exclusion of Collector & Private Reports', () => {
  it('correctly classifies cacheable vs forbidden URLs in isCacheableRequest', () => {
    // Cacheable static assets
    assert.strictEqual(isCacheableRequest('http://localhost:8000/index.html', 'GET'), true);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/styles/style.css', 'GET'), true);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/public/sample-exam.json', 'GET'), true);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/public/q01-bbt.svg', 'GET'), true);
    assert.strictEqual(isCacheableRequest('/Cunata/app/main.js', 'GET'), true);
    assert.strictEqual(isCacheableRequest('/Cunata/collect/index.js', 'GET'), true, 'Static JS script is cacheable');
    assert.strictEqual(isCacheableRequest('/Cunata/collect/appsScript.js', 'GET'), true, 'collect/appsScript.js static script must be cacheable');
    assert.strictEqual(isCacheableRequest('/Cunata/app/exam-list.js?v=1', 'GET'), true, 'Script with query params must be cacheable');

    // Forbidden collector endpoints
    assert.strictEqual(isCacheableRequest('https://script.google.com/macros/s/AKfycbx/exec', 'GET'), false);
    assert.strictEqual(isCacheableRequest('https://script.googleusercontent.com/macros/echo', 'GET'), false);
    assert.strictEqual(isCacheableRequest('https://macros.google.com/collector', 'GET'), false);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/collect/send', 'GET'), false);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/collector/outbox', 'GET'), false);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/appsscript?action=listExams', 'GET'), false);

    // Forbidden private reports & user exam snapshots
    assert.strictEqual(isCacheableRequest('http://localhost:8000/report/download', 'GET'), false);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/exportResults', 'GET'), false);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/cunata:attempt:123', 'GET'), false);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/cunata:final:456', 'GET'), false);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/cunata:snapshot:789', 'GET'), false);

    // Non-GET methods
    assert.strictEqual(isCacheableRequest('http://localhost:8000/index.html', 'POST'), false);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/index.html', 'PUT'), false);
    assert.strictEqual(isCacheableRequest('http://localhost:8000/index.html', 'DELETE'), false);

    // Unsupported schemes
    assert.strictEqual(isCacheableRequest('file:///C:/Users/test/index.html', 'GET'), false);
    assert.strictEqual(isCacheableRequest('chrome-extension://abc/index.html', 'GET'), false);
    assert.strictEqual(isCacheableRequest('data:text/html,test', 'GET'), false);
    assert.strictEqual(isCacheableRequest('blob:http://localhost/123', 'GET'), false);
  });

  it('bypasses CacheStorage completely for collector endpoints during executeFetch', async () => {
    const caches = new MockCacheStorage();
    const mockFetch = createMockFetch();
    let networkCallCount = 0;
    mockFetch.setResponse('https://script.google.com/macros/s/exec', () => {
      networkCallCount++;
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    });

    const res = await executeFetch(
      { url: 'https://script.google.com/macros/s/exec', method: 'GET' },
      { cachesObj: caches, fetchFn: mockFetch.fetchFn }
    );

    assert.strictEqual(res.status, 200);
    assert.strictEqual(networkCallCount, 1);

    // Must NOT have cached collector response
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('https://script.google.com/macros/s/exec');
    assert.strictEqual(cached, undefined, 'Collector endpoint MUST NEVER be cached in CacheStorage');
  });
});
