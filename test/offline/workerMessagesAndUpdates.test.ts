/**
 * Cunata Web M2/M6 — Worker Messages & Deferred Updates Tests
 * Tests safe updates deferred during active attempt, offline readiness verification,
 * version reports, and inbound postMessage handling.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeMessage,
  setAttemptActiveState,
  getAttemptActiveState,
} from '../../src/offline/service-worker.ts';
import {
  CACHE_NAME,
  CACHE_VERSION,
  type ServiceWorkerOutboundMessage,
} from '../../src/offline/types.ts';
import { MockCacheStorage } from './testHelpers.ts';

describe('Worker Messages: Safe Updates Deferred During Active Attempt', () => {
  beforeEach(() => {
    setAttemptActiveState(false);
  });

  it('updates attempt active state via SET_ATTEMPT_ACTIVE message', async () => {
    const outbound: ServiceWorkerOutboundMessage[] = [];
    const postMessageFn = (msg: ServiceWorkerOutboundMessage) => outbound.push(msg);

    assert.strictEqual(getAttemptActiveState(), false);

    await executeMessage(
      { type: 'SET_ATTEMPT_ACTIVE', active: true },
      { postMessageFn }
    );

    assert.strictEqual(getAttemptActiveState(), true);
    assert.strictEqual(outbound.length, 1);
    assert.deepEqual(outbound[0], { type: 'ATTEMPT_STATUS_ACK', active: true });

    await executeMessage(
      { type: 'SET_ATTEMPT_ACTIVE', active: false },
      { postMessageFn }
    );

    assert.strictEqual(getAttemptActiveState(), false);
    assert.strictEqual(outbound.length, 2);
    assert.deepEqual(outbound[1], { type: 'ATTEMPT_STATUS_ACK', active: false });
  });

  it('defers SKIP_WAITING when an exam attempt is active, refusing to call skipWaiting', async () => {
    setAttemptActiveState(true);

    let skipWaitingCalled = false;
    const outbound: ServiceWorkerOutboundMessage[] = [];

    await executeMessage(
      { type: 'SKIP_WAITING' },
      {
        skipWaitingFn: () => {
          skipWaitingCalled = true;
        },
        postMessageFn: (msg) => outbound.push(msg),
      }
    );

    assert.strictEqual(skipWaitingCalled, false, 'skipWaiting must NOT be executed while attempt is active');
    assert.strictEqual(outbound.length, 1);
    assert.deepEqual(outbound[0], { type: 'UPDATE_DEFERRED_REPORT', active: true });
  });

  it('allows SKIP_WAITING to proceed when no exam attempt is active', async () => {
    setAttemptActiveState(false);

    let skipWaitingCalled = false;
    const outbound: ServiceWorkerOutboundMessage[] = [];

    await executeMessage(
      { type: 'SKIP_WAITING' },
      {
        skipWaitingFn: () => {
          skipWaitingCalled = true;
        },
        postMessageFn: (msg) => outbound.push(msg),
      }
    );

    assert.strictEqual(skipWaitingCalled, true, 'skipWaiting must be called when attempt is inactive');
    assert.strictEqual(outbound.length, 0, 'No deferred report sent on successful skipWaiting');
  });
});

describe('Worker Messages: Offline Readiness Verification (CHECK_OFFLINE_READY)', () => {
  it('reports offline ready true when all required precache assets exist in cache', async () => {
    const caches = new MockCacheStorage();
    const cache = await caches.open(CACHE_NAME);
    await cache.put('index.html', new Response('Shell'));
    await cache.put('styles/style.css', new Response('CSS'));
    await cache.put('public/sample-exam.json', new Response('JSON'));

    const outbound: ServiceWorkerOutboundMessage[] = [];
    await executeMessage(
      {
        type: 'CHECK_OFFLINE_READY',
        requiredUrls: ['index.html', 'styles/style.css', 'public/sample-exam.json'],
      },
      {
        cachesObj: caches,
        cacheName: CACHE_NAME,
        postMessageFn: (msg) => outbound.push(msg),
      }
    );

    assert.strictEqual(outbound.length, 1);
    const report = outbound[0];
    assert.ok(report);
    assert.strictEqual(report.type, 'OFFLINE_READY_REPORT');
    if (report && report.type === 'OFFLINE_READY_REPORT') {
      assert.strictEqual(report.ready, true);
      assert.strictEqual(report.cachedCount, 3);
      assert.strictEqual(report.totalCount, 3);
      assert.strictEqual(report.missingUrls.length, 0);
    }
  });

  it('reports offline ready false with missing URLs list when cache is incomplete', async () => {
    const caches = new MockCacheStorage();
    const cache = await caches.open(CACHE_NAME);
    // Only index.html is cached
    await cache.put('index.html', new Response('Shell'));

    const outbound: ServiceWorkerOutboundMessage[] = [];
    await executeMessage(
      {
        type: 'CHECK_OFFLINE_READY',
        requiredUrls: ['index.html', 'styles/style.css', 'public/sample-exam.json'],
      },
      {
        cachesObj: caches,
        cacheName: CACHE_NAME,
        postMessageFn: (msg) => outbound.push(msg),
      }
    );

    assert.strictEqual(outbound.length, 1);
    const report = outbound[0];
    assert.ok(report);
    assert.strictEqual(report.type, 'OFFLINE_READY_REPORT');
    if (report && report.type === 'OFFLINE_READY_REPORT') {
      assert.strictEqual(report.ready, false);
      assert.strictEqual(report.cachedCount, 1);
      assert.strictEqual(report.totalCount, 3);
      assert.deepEqual(report.missingUrls, ['styles/style.css', 'public/sample-exam.json']);
    }
  });
});

describe('Worker Messages: Version & Ping Utilities', () => {
  it('responds with VERSION_REPORT upon GET_VERSION', async () => {
    const outbound: ServiceWorkerOutboundMessage[] = [];
    await executeMessage(
      { type: 'GET_VERSION' },
      {
        cacheName: CACHE_NAME,
        postMessageFn: (msg) => outbound.push(msg),
      }
    );

    assert.strictEqual(outbound.length, 1);
    assert.deepEqual(outbound[0], {
      type: 'VERSION_REPORT',
      version: CACHE_VERSION,
      cacheName: CACHE_NAME,
    });
  });

  it('responds with PONG upon PING', async () => {
    const outbound: ServiceWorkerOutboundMessage[] = [];
    await executeMessage(
      { type: 'PING' },
      {
        postMessageFn: (msg) => outbound.push(msg),
      }
    );

    assert.strictEqual(outbound.length, 1);
    assert.deepEqual(outbound[0], {
      type: 'PONG',
      version: CACHE_VERSION,
    });
  });
});
