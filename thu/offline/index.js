/**
 * Cunata Web M2/M6 — Offline & Service Worker Client Manager
 * Conforms to WEB-contract.md §3, §6, §9-10 and tasks.json (WEB-W3-OFFLINE).
 *
 * Responsibilities:
 * - Exposes ServiceWorker lifecycle callbacks for application glue (src/app/main.ts).
 * - Enforces explicit protocol limitations (file:// is rejected with clear Vietnamese message).
 * - Enforces secure origin requirement (HTTPS or localhost).
 * - Verifies offline readiness before declaring ready (first-time offline is never falsely promised).
 * - Safely defers service worker updates when an active exam attempt is in progress.
 * - Handles offline storage quota estimation and confirmed cache clearing.
 */
import { CACHE_NAME, CACHE_NAME_PREFIX, DEFAULT_PRECACHE_ENTRIES, FILE_PROTOCOL_LIMITATION, INSECURE_ORIGIN_LIMITATION, resolveScopeUrl, } from './types.js';
export * from './types.js';
export * from './service-worker.js';
export function createServiceWorkerManager(config, callbacks, deps) {
    const swUrl = config?.swUrl ?? './service-worker.js';
    const scope = config?.scope ?? './';
    const autoVerify = config?.autoVerify !== false;
    const bypassAttemptLock = Boolean(config?.bypassAttemptLock);
    const win = deps?.windowObj ?? (typeof window !== 'undefined' ? window : undefined);
    const nav = deps?.navigatorObj ?? (typeof navigator !== 'undefined' ? navigator : undefined);
    const cachesImpl = deps?.cachesObj ?? (typeof caches !== 'undefined' ? caches : undefined);
    let currentStatus = 'idle';
    let isAttemptActiveFlag = false;
    let activeRegistration = null;
    let waitingWorkerRef = null;
    let controllerChangeHandler = null;
    let isDisposed = false;
    function updateStatus(newStatus, detail) {
        if (isDisposed)
            return;
        currentStatus = newStatus;
        callbacks?.onStatusChange?.(newStatus, detail);
    }
    function createError(code, message, recoverable = false) {
        return {
            code,
            path: 'src/offline',
            message,
            recoverable,
        };
    }
    // Pre-check protocol limitation (e.g. file://)
    if (win?.location?.protocol === 'file:') {
        currentStatus = 'unsupported';
    }
    else if (!nav || !('serviceWorker' in nav)) {
        currentStatus = 'unsupported';
    }
    const activateCallback = async () => {
        await manager.activateDeferredUpdate();
    };
    const manager = {
        get status() {
            return currentStatus;
        },
        getStatus() {
            return currentStatus;
        },
        isAttemptActive() {
            return isAttemptActiveFlag;
        },
        async register() {
            if (isDisposed) {
                return {
                    ok: false,
                    error: createError('OFFLINE_DISPOSED', 'Trình quản lý ngoại tuyến đã bị hủy.'),
                };
            }
            // 1. Explicit file:// protocol check
            if (win?.location?.protocol === 'file:') {
                updateStatus('unsupported', FILE_PROTOCOL_LIMITATION);
                const err = createError('OFFLINE_FILE_PROTOCOL', FILE_PROTOCOL_LIMITATION);
                callbacks?.onError?.(err);
                return { ok: false, error: err };
            }
            // 2. Browser ServiceWorker API availability check
            if (!nav || !('serviceWorker' in nav)) {
                const msg = 'Trình duyệt không hỗ trợ Service Worker.';
                updateStatus('unsupported', msg);
                const err = createError('OFFLINE_SW_UNSUPPORTED', msg);
                callbacks?.onError?.(err);
                return { ok: false, error: err };
            }
            // 3. Insecure origin check (must be HTTPS or localhost)
            if (win?.location) {
                const proto = win.location.protocol;
                const host = win.location.hostname;
                const isSecure = proto === 'https:' ||
                    host === 'localhost' ||
                    host === '127.0.0.1' ||
                    host === '[::1]' ||
                    host === '0.0.0.0';
                if (!isSecure) {
                    updateStatus('unsupported', INSECURE_ORIGIN_LIMITATION);
                    const err = createError('OFFLINE_INSECURE_ORIGIN', INSECURE_ORIGIN_LIMITATION);
                    callbacks?.onError?.(err);
                    return { ok: false, error: err };
                }
            }
            updateStatus('registering');
            try {
                const registration = await nav.serviceWorker.register(swUrl, { scope });
                activeRegistration = registration;
                callbacks?.onRegistered?.(registration);
                // Check if an existing waiting worker is present upon registration
                if (registration.waiting) {
                    waitingWorkerRef = registration.waiting;
                    if (isAttemptActiveFlag) {
                        updateStatus('update_deferred');
                        callbacks?.onUpdateDeferred?.();
                    }
                    else {
                        updateStatus('update_available');
                        callbacks?.onUpdateAvailable?.(activateCallback);
                    }
                }
                // Listen for new updates arriving in background
                registration.addEventListener('updatefound', () => {
                    const installingWorker = registration.installing;
                    if (!installingWorker)
                        return;
                    updateStatus('installing');
                    installingWorker.addEventListener('statechange', () => {
                        if (installingWorker.state === 'installed') {
                            if (nav.serviceWorker.controller) {
                                // New update installed while an existing controller was running
                                waitingWorkerRef = installingWorker;
                                if (isAttemptActiveFlag) {
                                    updateStatus('update_deferred');
                                    callbacks?.onUpdateDeferred?.();
                                }
                                else {
                                    updateStatus('update_available');
                                    callbacks?.onUpdateAvailable?.(activateCallback);
                                }
                            }
                            else {
                                // Initial installation finished
                                if (autoVerify) {
                                    manager.checkOfflineReady().catch(() => { });
                                }
                            }
                        }
                    });
                });
                // Listen for controllerchange events when update activates
                controllerChangeHandler = () => {
                    if (currentStatus === 'updating') {
                        if (autoVerify) {
                            manager.checkOfflineReady().catch(() => { });
                        }
                    }
                };
                nav.serviceWorker.addEventListener('controllerchange', controllerChangeHandler);
                // If already active on load, perform verification
                if (registration.active) {
                    if (autoVerify) {
                        await manager.checkOfflineReady();
                    }
                }
                return { ok: true, value: undefined };
            }
            catch (err) {
                updateStatus('error', err instanceof Error ? err.message : String(err));
                const webErr = createError('OFFLINE_PRECACHE_FAILED', `Không thể đăng ký Service Worker: ${err instanceof Error ? err.message : String(err)}`);
                callbacks?.onError?.(webErr);
                return { ok: false, error: webErr };
            }
        },
        async unregister() {
            if (activeRegistration && typeof activeRegistration.unregister === 'function') {
                try {
                    const success = await activeRegistration.unregister();
                    activeRegistration = null;
                    updateStatus('idle');
                    return { ok: true, value: Boolean(success) };
                }
                catch (err) {
                    return {
                        ok: false,
                        error: createError('OFFLINE_UNREGISTER_FAILED', `Lỗi khi hủy đăng ký Service Worker: ${err instanceof Error ? err.message : String(err)}`),
                    };
                }
            }
            return { ok: true, value: false };
        },
        async checkOfflineReady(requiredUrls) {
            const required = requiredUrls ??
                config?.requiredUrls ??
                DEFAULT_PRECACHE_ENTRIES.filter((i) => i.critical).map((i) => i.url);
            if (!cachesImpl) {
                const result = {
                    ready: false,
                    cachedCount: 0,
                    totalRequired: required.length,
                    missingUrls: Object.freeze([...required]),
                    cacheName: CACHE_NAME,
                };
                callbacks?.onOfflineReady?.(false);
                return { ok: true, value: result };
            }
            try {
                let activeCacheName = config?.cacheName ?? CACHE_NAME;
                if (!config?.cacheName && cachesImpl) {
                    const keys = await cachesImpl.keys();
                    const found = keys.find((k) => k.startsWith(CACHE_NAME_PREFIX));
                    if (found)
                        activeCacheName = found;
                }
                const cache = await cachesImpl.open(activeCacheName);
                const missing = [];
                let count = 0;
                for (const url of required) {
                    const resolved = resolveScopeUrl(scope, url);
                    const match = (await cache.match(url)) ||
                        (await cache.match(resolved)) ||
                        (await cache.match(resolveScopeUrl('/', url)));
                    if (match) {
                        count++;
                    }
                    else {
                        missing.push(url);
                    }
                }
                const isReady = missing.length === 0;
                const result = {
                    ready: isReady,
                    cachedCount: count,
                    totalRequired: required.length,
                    missingUrls: Object.freeze(missing),
                    cacheName: CACHE_NAME,
                };
                if (isReady) {
                    updateStatus('offline_ready');
                    callbacks?.onOfflineReady?.(true);
                }
                else {
                    callbacks?.onOfflineReady?.(false);
                }
                return { ok: true, value: result };
            }
            catch (err) {
                callbacks?.onOfflineReady?.(false);
                return {
                    ok: false,
                    error: createError('OFFLINE_VERIFICATION_FAILED', `Không thể xác thực trạng thái ngoại tuyến: ${err instanceof Error ? err.message : String(err)}`),
                };
            }
        },
        async setAttemptActive(active) {
            isAttemptActiveFlag = Boolean(active);
            // Inform active controller of active exam attempt
            if (nav?.serviceWorker?.controller && typeof nav.serviceWorker.controller.postMessage === 'function') {
                nav.serviceWorker.controller.postMessage({
                    type: 'SET_ATTEMPT_ACTIVE',
                    active: isAttemptActiveFlag,
                });
            }
            // If attempt concluded and there was a deferred update waiting, transition to available
            if (!isAttemptActiveFlag && currentStatus === 'update_deferred' && waitingWorkerRef) {
                updateStatus('update_available');
                callbacks?.onUpdateAvailable?.(activateCallback);
            }
            return { ok: true, value: undefined };
        },
        async activateDeferredUpdate() {
            if (isAttemptActiveFlag && !bypassAttemptLock) {
                const err = createError('OFFLINE_UPDATE_DEFERRED', 'Không thể cập nhật Service Worker khi bài thi đang diễn ra. Bản cập nhật sẽ được hoãn an toàn đến khi thí sinh nộp bài hoặc hủy bài thi.', true);
                callbacks?.onError?.(err);
                return { ok: false, error: err };
            }
            if (waitingWorkerRef) {
                updateStatus('updating');
                if (typeof waitingWorkerRef.postMessage === 'function') {
                    waitingWorkerRef.postMessage({ type: 'SKIP_WAITING' });
                }
                return { ok: true, value: true };
            }
            return { ok: true, value: false };
        },
        async getStorageEstimate() {
            if (nav?.storage && typeof nav.storage.estimate === 'function') {
                try {
                    const est = await nav.storage.estimate();
                    const quota = est.quota ?? 0;
                    const usage = est.usage ?? 0;
                    const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;
                    const persistent = typeof nav.storage.persisted === 'function' ? await nav.storage.persisted() : false;
                    return {
                        ok: true,
                        value: {
                            quota,
                            usage,
                            usagePercent,
                            persistent,
                        },
                    };
                }
                catch (err) {
                    return {
                        ok: false,
                        error: createError('OFFLINE_STORAGE_QUOTA', `Lỗi khi lấy thông tin dung lượng lưu trữ: ${err instanceof Error ? err.message : String(err)}`),
                    };
                }
            }
            return {
                ok: true,
                value: {
                    quota: 0,
                    usage: 0,
                    usagePercent: 0,
                    persistent: false,
                },
            };
        },
        async clearOfflineData(confirmed) {
            if (!confirmed) {
                return {
                    ok: false,
                    error: createError('OFFLINE_CLEAR_UNCONFIRMED', 'Thao tác xóa bộ nhớ đệm ngoại tuyến yêu cầu người dùng xác nhận rõ ràng.'),
                };
            }
            if (cachesImpl) {
                try {
                    const keys = await cachesImpl.keys();
                    const cunataKeys = keys.filter((k) => k.startsWith(CACHE_NAME_PREFIX));
                    await Promise.all(cunataKeys.map((k) => cachesImpl.delete(k)));
                    updateStatus('idle');
                    return { ok: true, value: undefined };
                }
                catch (err) {
                    return {
                        ok: false,
                        error: createError('OFFLINE_CLEAR_FAILED', `Không thể xóa bộ nhớ đệm: ${err instanceof Error ? err.message : String(err)}`),
                    };
                }
            }
            updateStatus('idle');
            return { ok: true, value: undefined };
        },
        dispose() {
            isDisposed = true;
            if (nav?.serviceWorker && controllerChangeHandler) {
                nav.serviceWorker.removeEventListener?.('controllerchange', controllerChangeHandler);
            }
            activeRegistration = null;
            waitingWorkerRef = null;
            controllerChangeHandler = null;
        },
    };
    return manager;
}
