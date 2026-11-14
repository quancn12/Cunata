/**
 * Cunata Web M2/M6 — Service Worker Lifecycle Manager Tests
 * Tests lifecycle callbacks, protocol limitation (file://), insecure origin rejection,
 * first-time offline verification, update deferral during active attempt, storage quota,
 * and confirmed offline data cleanup.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServiceWorkerManager } from '../../src/offline/index.ts';
import {
  CACHE_NAME,
  FILE_PROTOCOL_LIMITATION,
  INSECURE_ORIGIN_LIMITATION,
  type OfflineStatus,
  type WebError,
} from '../../src/offline/types.ts';
import { MockCacheStorage, createMockClientEnvironment } from './testHelpers.ts';

describe('Lifecycle Manager: Protocol & Capability Limits (AC Compliance)', () => {
  it('explicitly rejects file:// protocol with OFFLINE_FILE_PROTOCOL and contract message', async () => {
    const env = createMockClientEnvironment({ protocol: 'file:', hostname: '' });
    const errors: WebError[] = [];
    const statusHistory: OfflineStatus[] = [];

    const manager = createServiceWorkerManager(
      {},
      {
        onError: (err) => errors.push(err),
        onStatusChange: (s) => statusHistory.push(s),
      },
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj }
    );

    assert.strictEqual(manager.status, 'unsupported');

    const result = await manager.register();
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'OFFLINE_FILE_PROTOCOL');
      assert.strictEqual(result.error.message, FILE_PROTOCOL_LIMITATION);
    }

    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0]?.code, 'OFFLINE_FILE_PROTOCOL');
    assert.strictEqual(errors[0]?.message, FILE_PROTOCOL_LIMITATION);
  });

  it('rejects registration when Service Worker API is missing in navigator', async () => {
    const env = createMockClientEnvironment({ hasServiceWorker: false });
    const errors: WebError[] = [];

    const manager = createServiceWorkerManager(
      {},
      { onError: (err) => errors.push(err) },
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj }
    );

    assert.strictEqual(manager.status, 'unsupported');

    const result = await manager.register();
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'OFFLINE_SW_UNSUPPORTED');
    }
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0]?.code, 'OFFLINE_SW_UNSUPPORTED');
  });

  it('rejects insecure non-localhost origins with OFFLINE_INSECURE_ORIGIN', async () => {
    const env = createMockClientEnvironment({ protocol: 'http:', hostname: 'insecure-test.com' });
    const errors: WebError[] = [];

    const manager = createServiceWorkerManager(
      {},
      { onError: (err) => errors.push(err) },
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj }
    );

    const result = await manager.register();
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.error.code, 'OFFLINE_INSECURE_ORIGIN');
      assert.strictEqual(result.error.message, INSECURE_ORIGIN_LIMITATION);
    }
    assert.strictEqual(errors.length, 1);
  });

  it('accepts localhost, 127.0.0.1, and HTTPS as secure origins', async () => {
    for (const host of ['localhost', '127.0.0.1', '0.0.0.0']) {
      const env = createMockClientEnvironment({ protocol: 'http:', hostname: host });
      const manager = createServiceWorkerManager(
        { autoVerify: false },
        {},
        { windowObj: env.windowObj, navigatorObj: env.navigatorObj }
      );
      const res = await manager.register();
      assert.strictEqual(res.ok, true, `Origin http://${host} must be accepted as secure development origin`);
    }

    const httpsEnv = createMockClientEnvironment({ protocol: 'https:', hostname: 'cunata.edu.vn' });
    const httpsManager = createServiceWorkerManager(
      { autoVerify: false },
      {},
      { windowObj: httpsEnv.windowObj, navigatorObj: httpsEnv.navigatorObj }
    );
    const httpsRes = await httpsManager.register();
    assert.strictEqual(httpsRes.ok, true, 'HTTPS origin must be accepted');
  });
});

describe('Lifecycle Manager: Verified Offline-Ready & Precache Verification', () => {
  it('does NOT promise offline-ready when cache is empty on first access (AC Requirement)', async () => {
    const env = createMockClientEnvironment();
    const caches = new MockCacheStorage(); // empty cache
    let readyReported: boolean | null = null;

    const manager = createServiceWorkerManager(
      { autoVerify: false },
      { onOfflineReady: (ready) => (readyReported = ready) },
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj, cachesObj: caches }
    );

    await manager.register();

    const checkRes = await manager.checkOfflineReady(['index.html', 'styles/style.css']);
    assert.strictEqual(checkRes.ok, true);
    if (checkRes.ok) {
      assert.strictEqual(checkRes.value.ready, false, 'First-time empty cache must not be marked ready');
      assert.strictEqual(checkRes.value.cachedCount, 0);
      assert.deepStrictEqual(checkRes.value.missingUrls, ['index.html', 'styles/style.css']);
    }
    assert.strictEqual(readyReported, false);
    assert.notStrictEqual(manager.status, 'offline_ready');
  });

  it('transitions to offline_ready only when required precache assets are fully verified', async () => {
    const env = createMockClientEnvironment();
    const caches = new MockCacheStorage();
    const cache = await caches.open(CACHE_NAME);
    await cache.put('index.html', new Response('Shell'));
    await cache.put('styles/style.css', new Response('CSS'));

    let readyReported: boolean | null = null;
    const statusHistory: OfflineStatus[] = [];

    const manager = createServiceWorkerManager(
      { autoVerify: false, requiredUrls: ['index.html', 'styles/style.css'] },
      {
        onOfflineReady: (ready) => (readyReported = ready),
        onStatusChange: (s) => statusHistory.push(s),
      },
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj, cachesObj: caches }
    );

    await manager.register();

    const checkRes = await manager.checkOfflineReady();
    assert.strictEqual(checkRes.ok, true);
    if (checkRes.ok) {
      assert.strictEqual(checkRes.value.ready, true);
      assert.strictEqual(checkRes.value.cachedCount, 2);
      assert.strictEqual(checkRes.value.missingUrls.length, 0);
    }
    assert.strictEqual(readyReported, true);
    assert.strictEqual(manager.status, 'offline_ready');
    assert.ok(statusHistory.includes('offline_ready'));
  });
});

describe('Lifecycle Manager: Safe Updates Deferred During Active Attempt', () => {
  it('notifies active controller when student attempt becomes active or inactive', async () => {
    const env = createMockClientEnvironment();
    const manager = createServiceWorkerManager(
      { autoVerify: false },
      {},
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj }
    );

    await manager.register();

    assert.strictEqual(manager.isAttemptActive(), false);

    await manager.setAttemptActive(true);
    assert.strictEqual(manager.isAttemptActive(), true);
    assert.deepStrictEqual(env.controllerMessages[0], { type: 'SET_ATTEMPT_ACTIVE', active: true });

    await manager.setAttemptActive(false);
    assert.strictEqual(manager.isAttemptActive(), false);
    assert.deepStrictEqual(env.controllerMessages[1], { type: 'SET_ATTEMPT_ACTIVE', active: false });
  });

  it('defers service worker update when attempt is active and exposes activate callback on attempt completion', async () => {
    const env = createMockClientEnvironment();
    let deferredFired = false;
    let availableActivateFn: (() => Promise<void>) | null = null;

    // Simulate registration with a waiting worker
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
        onUpdateDeferred: () => {
          deferredFired = true;
        },
        onUpdateAvailable: (activateFn) => {
          availableActivateFn = activateFn;
        },
      },
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj }
    );

    // 1. Mark exam attempt as active before registration
    await manager.setAttemptActive(true);

    // 2. Register: should detect waiting worker and enter update_deferred state
    await manager.register();

    assert.strictEqual(manager.status, 'update_deferred');
    assert.strictEqual(deferredFired, true, 'onUpdateDeferred must be called');

    // 3. Attempting to activate update while attempt is active is rejected
    const blockedActivate = await manager.activateDeferredUpdate();
    assert.strictEqual(blockedActivate.ok, false);
    if (!blockedActivate.ok) {
      assert.strictEqual(blockedActivate.error.code, 'OFFLINE_UPDATE_DEFERRED');
    }
    assert.strictEqual(waitingWorkerMessages.length, 0, 'No SKIP_WAITING sent while locked');

    // 4. Conclude exam attempt: status should transition to update_available
    await manager.setAttemptActive(false);

    assert.strictEqual(manager.status, 'update_available');
    assert.ok(availableActivateFn !== null, 'onUpdateAvailable callback must now be provided');

    // 5. Activate deferred update now succeeds
    const allowedActivate = await manager.activateDeferredUpdate();
    assert.strictEqual(allowedActivate.ok, true);
    assert.strictEqual(manager.status, 'updating');
    assert.deepStrictEqual(waitingWorkerMessages[0], { type: 'SKIP_WAITING' });
  });
});

describe('Lifecycle Manager: Storage Estimate & Confirmed Cleanup', () => {
  it('retrieves storage quota and usage estimates', async () => {
    const env = createMockClientEnvironment();
    const manager = createServiceWorkerManager(
      { autoVerify: false },
      {},
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj }
    );

    const est = await manager.getStorageEstimate();
    assert.strictEqual(est.ok, true);
    if (est.ok) {
      assert.strictEqual(est.value.quota, 1024 * 1024 * 100);
      assert.strictEqual(est.value.usage, 1024 * 1024 * 10);
      assert.strictEqual(est.value.usagePercent, 10);
      assert.strictEqual(est.value.persistent, false);
    }
  });

  it('rejects unconfirmed cache clear and deletes cunata caches when confirmed', async () => {
    const env = createMockClientEnvironment();
    const caches = new MockCacheStorage();
    await (await caches.open(`${CACHE_NAME}`)).put('index.html', new Response('Shell'));
    await (await caches.open('other-app-cache')).put('file.txt', new Response('Other'));

    const manager = createServiceWorkerManager(
      { autoVerify: false },
      {},
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj, cachesObj: caches }
    );

    // 1. Unconfirmed attempt is rejected
    const unconfirmed = await manager.clearOfflineData(false);
    assert.strictEqual(unconfirmed.ok, false);
    if (!unconfirmed.ok) {
      assert.strictEqual(unconfirmed.error.code, 'OFFLINE_CLEAR_UNCONFIRMED');
    }
    assert.strictEqual(await caches.has(CACHE_NAME), true, 'Cache must not be touched when unconfirmed');

    // 2. Confirmed attempt succeeds and deletes cunata caches only
    const confirmed = await manager.clearOfflineData(true);
    assert.strictEqual(confirmed.ok, true);
    assert.strictEqual(await caches.has(CACHE_NAME), false, 'Cunata cache must be deleted');
    assert.strictEqual(await caches.has('other-app-cache'), true, 'Foreign cache must be preserved');
  });

  it('disposes cleanly and unregisters registration', async () => {
    const env = createMockClientEnvironment();
    const manager = createServiceWorkerManager(
      { autoVerify: false },
      {},
      { windowObj: env.windowObj, navigatorObj: env.navigatorObj }
    );

    await manager.register();
    const unregRes = await manager.unregister();
    assert.strictEqual(unregRes.ok, true);
    assert.strictEqual(unregRes.value, true);
    assert.strictEqual(manager.status, 'idle');

    manager.dispose();
  });
});
