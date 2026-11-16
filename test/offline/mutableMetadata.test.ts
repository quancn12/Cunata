import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeFetch, isMutablePublicMetadata } from '../../src/offline/service-worker.ts';
import { MockCacheStorage } from './testHelpers.ts';

for (const path of ['public/config.json', 'public/exams/index.json']) {
  test(`${path}: fresh metadata replaces cache; offline restores the last successful response`, async () => {
    const url = `https://example.test/Cunata/${path}?v=2`;
    const cachesObj = new MockCacheStorage(); const cache = await cachesObj.open('metadata-test');
    await cache.put(url, new Response('old'));
    let calls = 0;
    const fetchFn: typeof fetch = async (_request, options) => {
      calls++; assert.equal(options?.cache, 'no-store'); return new Response('new');
    };
    const request = new Request(url);
    const fresh = await executeFetch(request, { cachesObj, fetchFn, cacheName: 'metadata-test' });
    assert.equal(await fresh.text(), 'new'); assert.equal(calls, 1);
    const offline = await executeFetch(request, { cachesObj, cacheName: 'metadata-test', fetchFn: async () => { throw new TypeError('offline'); } });
    assert.equal(await offline.text(), 'new');
    const failure = await executeFetch(request, { cachesObj, cacheName: 'metadata-test', fetchFn: async () => new Response('removed', { status: 404 }) });
    assert.equal(failure.status, 404);
    assert.equal(await (await cache.match(url))?.text(), 'new');
  });
}

test('only mutable manifest paths use network-first; exam snapshots remain cache-first', async () => {
  assert.equal(isMutablePublicMetadata('https://example.test/Cunata/public/config.json'), true);
  assert.equal(isMutablePublicMetadata('https://example.test/public/config.json.backup'), false);
  const url = 'https://example.test/Cunata/public/exams/toan-full.json';
  const cachesObj = new MockCacheStorage(); const cache = await cachesObj.open('snapshot-test');
  await cache.put(url, new Response('snapshot'));
  const response = await executeFetch(new Request(url), { cachesObj, cacheName: 'snapshot-test', fetchFn: async () => { throw new Error('must not fetch'); } });
  assert.equal(await response.text(), 'snapshot');
});
