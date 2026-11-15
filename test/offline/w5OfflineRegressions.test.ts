import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  executeMessage,
  setAttemptActiveState,
  getAttemptActiveState,
} from '../../src/offline/service-worker.ts';

import {
  createServiceWorkerManager,
  type OfflineStatus,
  type ServiceWorkerOutboundMessage,
  CACHE_NAME,
} from '../../src/offline/index.ts';

import { MockCacheStorage, createMockClientEnvironment } from './testHelpers.ts';

describe('WEB-FINAL-STUDENT-STORAGE: Offline Regressions', () => {
  it('correctly handles CHECK_OFFLINE_READY outbound message narrowing for both complete and incomplete cache', async () => {
    const caches = new MockCacheStorage();
    const cache = await caches.open(CACHE_NAME);

    const outbound: ServiceWorkerOutboundMessage[] = [];
    const postMessageFn = (msg: ServiceWorkerOutboundMessage) => outbound.push(msg);

    // Incomplete cache: 0 assets cached
    await executeMessage(
      {
        type: 'CHECK_OFFLINE_READY',
        requiredUrls: ['index.html', 'styles/style.css'],
      },
      {
        cachesObj: caches,
        cacheName: CACHE_NAME,
        postMessageFn,
      }
    );

    assert.equal(outbound.length, 1);
    const rep1 = outbound[0];
    assert.ok(rep1);
    assert.equal(rep1.type, 'OFFLINE_READY_REPORT');
    if (rep1 && rep1.type === 'OFFLINE_READY_REPORT') {
      assert.equal(rep1.ready, false);
      assert.equal(rep1.cachedCount, 0);
      assert.equal(rep1.totalCount, 2);
      assert.deepEqual(rep1.missingUrls, ['index.html', 'styles/style.css']);
    }

    // Populate required assets
    await cache.put('index.html', new Response('<html></html>'));
    await cache.put('styles/style.css', new Response('body {}'));

    // Complete cache
    outbound.length = 0;
    await executeMessage(
      {
        type: 'CHECK_OFFLINE_READY',
        requiredUrls: ['index.html', 'styles/style.css'],
      },
      {
        cachesObj: caches,
        cacheName: CACHE_NAME,
        postMessageFn,
      }
    );

    assert.equal(outbound.length, 1);
    const rep2 = outbound[0];
    assert.ok(rep2);
    assert.equal(rep2.type, 'OFFLINE_READY_REPORT');
    if (rep2 && rep2.type === 'OFFLINE_READY_REPORT') {
      assert.equal(rep2.ready, true);
      assert.equal(rep2.cachedCount, 2);
      assert.equal(rep2.totalCount, 2);
      assert.equal(rep2.missingUrls.length, 0);
    }
  });

  it('safely defers Service Worker activation while exam attempt is active and activates upon conclusion', async () => {
    setAttemptActiveState(false);
    const env = createMockClientEnvironment();
    const statusHistory: OfflineStatus[] = [];
    let updateAvailableFired = false;
    let activateFnRef: (() => Promise<void>) | null = null;

    const waitingWorkerMessages: any[] = [];
    const mockWaitingWorker = {
      state: 'installed',
      postMessage: (msg: any) => waitingWorkerMessages.push(msg),
    };

    env.setRegistration({
      active: { state: 'activated' },
      waiting: mockWaitingWorker,
      installing: null,
      scope: '/',
      addEventListener: () => {},
      unregister: async () => true,
    });

    const manager = createServiceWorkerManager(
      { autoVerify: false },
      {
        onStatusChange: (status) => statusHistory.push(status),
        onUpdateAvailable: (activateFn) => {
          updateAvailableFired = true;
          activateFnRef = activateFn;
        },
      },
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj }
    );

    // Exam attempt starts: mark active
    await manager.setAttemptActive(true);
    assert.equal(manager.isAttemptActive(), true);

    await manager.register();
    assert.equal(manager.status, 'update_deferred');

    // Attempting to activate while exam is in progress must be blocked
    const activateAttempt = await manager.activateDeferredUpdate();
    assert.equal(activateAttempt.ok, false);
    assert.equal(waitingWorkerMessages.length, 0, 'No SKIP_WAITING sent while exam is active');

    // Exam attempt concludes: candidate submits
    await manager.setAttemptActive(false);
    assert.equal(manager.isAttemptActive(), false);
    assert.equal(manager.status, 'update_available');
    assert.equal(updateAvailableFired, true);
    assert.ok(activateFnRef !== null);

    // Now activate deferred update
    const finalActivate = await manager.activateDeferredUpdate();
    assert.equal(finalActivate.ok, true);
    assert.equal(manager.status, 'updating');
    assert.equal(waitingWorkerMessages.length, 1);
    assert.deepEqual(waitingWorkerMessages[0], { type: 'SKIP_WAITING' });
  });
});
