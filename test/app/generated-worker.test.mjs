import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { MockCacheStorage } from '../offline/testHelpers.ts';

test('emitted service worker uses network-first under a subpath and caches only successful metadata', async () => {
  const handlers = new Map(); const caches = new MockCacheStorage();
  const url = 'https://example.test/Cunata/public/config.json';
  let network = async (_request, options) => { assert.equal(options.cache, 'no-store'); return new Response('new'); };
  const self = { addEventListener(type, callback) { handlers.set(type, callback); } };
  vm.runInNewContext(readFileSync(new URL('../../dist/service-worker.js', import.meta.url), 'utf8'), {
    self, caches, URL, Response, Map, Set, fetch: (...args) => network(...args),
  });
  const cacheName = (await caches.keys())[0];
  const dispatch = async () => {
    let response;
    handlers.get('fetch')({ request: new Request(url), respondWith(value) { response = value; } });
    return await response;
  };
  assert.equal(await (await dispatch()).text(), 'new');
  const actualCache = await caches.open((await caches.keys())[0]);
  network = async () => { throw new TypeError('offline'); };
  assert.equal(await (await dispatch()).text(), 'new');
  network = async () => new Response('unavailable', { status: 503 });
  assert.equal((await dispatch()).status, 503);
  assert.equal(await (await actualCache.match(url)).text(), 'new');
});
