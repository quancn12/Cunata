/**
 * Cunata Web M2/M6 — Native Versioned Service Worker
 * Conforms to WEB-contract.md §3, §6, §9-10 and tasks.json (WEB-W3-OFFLINE).
 *
 * Capabilities:
 * - Versioned cache for shell, JS, CSS, and selected samples.
 * - Relative subpath scope support (root / or GitHub Pages /Cunata/).
 * - Atomic install: failure of any critical precached asset rejects installation,
 *   preserving the old active cache and old worker.
 * - Old active cache retention until explicit activation.
 * - Strict exclusion: NO collector endpoints, NO private reports/attempts cached.
 * - Deferred updates: safe updates held in waiting state while an exam attempt is active.
 * - Cold-start offline navigation: falls back to cached shell (index.html) when network fails.
 */
import { CACHE_VERSION, CACHE_NAME, CACHE_NAME_PREFIX, DEFAULT_PRECACHE_ENTRIES, isCacheableRequest, resolveScopeUrl, } from './types.js';
// In-memory worker state (resets per worker lifecycle)
let isAttemptActive = false;
export function getAttemptActiveState() {
    return isAttemptActive;
}
export function setAttemptActiveState(active) {
    isAttemptActive = active;
}
/**
 * Executes atomic installation and precaching.
 * If ANY critical asset fails to fetch, the promise rejects and install fails atomically,
 * ensuring no half-cached or broken state replaces the old active cache.
 */
export async function executeInstall(options) {
    const cacheName = options?.cacheName ?? CACHE_NAME;
    const items = options?.precacheItems ?? DEFAULT_PRECACHE_ENTRIES;
    const scopeBase = options?.scopeBase ??
        (typeof self !== 'undefined' && 'registration' in self ? self.registration.scope : '/');
    const fetchImpl = options?.fetchFn ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    const cachesImpl = options?.cachesObj ?? (typeof caches !== 'undefined' ? caches : undefined);
    if (!fetchImpl || !cachesImpl) {
        throw new Error('Service Worker install requires fetch and caches APIs');
    }
    const cache = await cachesImpl.open(cacheName);
    const resolvedUrls = items.map((item) => ({
        ...item,
        resolvedUrl: resolveScopeUrl(scopeBase, item.url),
    }));
    // Fetch each asset individually to record exact failure reason and enforce atomicity
    for (const item of resolvedUrls) {
        try {
            const response = await fetchImpl(item.resolvedUrl, { cache: 'no-cache' });
            if (!response.ok) {
                if (item.critical) {
                    throw new Error(`Critical precache asset failed: ${item.resolvedUrl} (HTTP ${response.status})`);
                }
                // Non-critical optional asset (e.g. sample exam fixtures not yet built)
                continue;
            }
            // Store under both resolvedUrl and item.url to ensure matching regardless of base
            await cache.put(item.resolvedUrl, response.clone());
            if (item.url !== item.resolvedUrl) {
                await cache.put(item.url, response);
            }
        }
        catch (err) {
            if (item.critical) {
                // Enforce atomic failure: delete partially populated cache and rethrow
                try {
                    await cachesImpl.delete(cacheName);
                }
                catch {
                    // ignore cleanup error
                }
                throw new Error(`Atomic precache failed on critical asset "${item.url}": ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }
}
/**
 * Executes activation and old cache pruning.
 * Only deletes old caches with prefix 'cunata-cache-' that do not match currentCacheName.
 * Calls clients.claim() to take immediate control of existing open tabs.
 */
export async function executeActivate(options) {
    const currentCache = options?.currentCacheName ?? CACHE_NAME;
    const cachesImpl = options?.cachesObj ?? (typeof caches !== 'undefined' ? caches : undefined);
    const claimFn = options?.claimClients ??
        (typeof self !== 'undefined' && 'clients' in self && self.clients?.claim
            ? () => self.clients.claim()
            : undefined);
    if (cachesImpl) {
        const keys = await cachesImpl.keys();
        const oldCunataCaches = keys.filter((key) => key.startsWith(CACHE_NAME_PREFIX) && key !== currentCache);
        await Promise.all(oldCunataCaches.map((k) => cachesImpl.delete(k)));
    }
    if (claimFn) {
        await claimFn();
    }
}
/**
 * Handles incoming fetch events:
 * 1. Strictly bypasses non-cacheable requests (collector endpoints, private student attempts, non-GET).
 * 2. Cache-first strategy for precached assets (shell, css, scripts, public samples).
 * 3. Network fallback, and cold-start offline fallback to cached shell (index.html) for navigation.
 */
export async function executeFetch(request, options) {
    const fetchImpl = options?.fetchFn ?? (typeof fetch !== 'undefined' ? fetch : undefined);
    const cachesImpl = options?.cachesObj ?? (typeof caches !== 'undefined' ? caches : undefined);
    const cacheName = options?.cacheName ?? CACHE_NAME;
    if (!isCacheableRequest(request.url, request.method)) {
        if (!fetchImpl) {
            return new Response('Network unavailable for uncacheable request', { status: 503 });
        }
        return fetchImpl(request);
    }
    // 1. Check cache first
    if (cachesImpl) {
        const cache = await cachesImpl.open(cacheName);
        const cachedResponse = (await cache.match(request)) || (await cache.match(request.url));
        if (cachedResponse) {
            return cachedResponse;
        }
    }
    // 2. Not in cache: attempt network
    if (fetchImpl) {
        try {
            const networkResponse = await fetchImpl(request);
            // Cache successful GET responses for same-origin static assets
            if (networkResponse.ok && cachesImpl && request.method === 'GET') {
                const cache = await cachesImpl.open(cacheName);
                try {
                    await cache.put(request, networkResponse.clone());
                }
                catch {
                    // ignore cache put failures for streaming or opaque responses
                }
            }
            return networkResponse;
        }
        catch {
            // Network failed (offline)
        }
    }
    // 3. Offline fallback for navigation requests (cold-start offline)
    const isNavigational = request.mode === 'navigate' || request.url.endsWith('/') || request.url.endsWith('.html');
    if (isNavigational && cachesImpl) {
        const fallback = (await cachesImpl.match(options?.fallbackShellUrl ?? 'index.html')) ||
            (await cachesImpl.match('./index.html')) ||
            (await cachesImpl.match('/index.html')) ||
            (await cachesImpl.match('./')) ||
            (await cachesImpl.match('/'));
        if (fallback) {
            return fallback;
        }
    }
    // 4. Return offline error response
    return new Response(JSON.stringify({
        error: 'OFFLINE_UNAVAILABLE',
        message: 'Thiết bị đang ngoại tuyến và tài nguyên yêu cầu chưa được lưu trong bộ nhớ đệm.',
        url: request.url,
    }), {
        status: 503,
        statusText: 'Service Unavailable (Offline)',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}
/**
 * Handles incoming postMessage commands from client application tabs.
 */
export async function executeMessage(message, options) {
    switch (message.type) {
        case 'SKIP_WAITING': {
            let canActivate = !isAttemptActive;
            if (canActivate && typeof self !== 'undefined' && 'clients' in self && self.clients?.matchAll) {
                try {
                    const windowClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
                    if (windowClients && windowClients.length > 0) {
                        const checks = windowClients.map((client) => {
                            return new Promise((resolve) => {
                                let resolved = false;
                                const timer = setTimeout(() => {
                                    if (!resolved) {
                                        resolved = true;
                                        resolve({ responsive: false, active: true });
                                    }
                                }, 600);
                                const channel = new MessageChannel();
                                channel.port1.onmessage = (ev) => {
                                    if (!resolved) {
                                        resolved = true;
                                        clearTimeout(timer);
                                        resolve({
                                            responsive: true,
                                            active: Boolean(ev.data && ev.data.active),
                                        });
                                    }
                                };
                                try {
                                    client.postMessage({ type: 'QUERY_ATTEMPT_ACTIVE' }, [channel.port2]);
                                }
                                catch (_) {
                                    if (!resolved) {
                                        resolved = true;
                                        clearTimeout(timer);
                                        resolve({ responsive: false, active: true });
                                    }
                                }
                            });
                        });
                        const statuses = await Promise.all(checks);
                        if (statuses.some((s) => !s.responsive || s.active)) {
                            canActivate = false;
                        }
                    }
                }
                catch (_) { }
            }
            if (!canActivate) {
                options?.postMessageFn?.({
                    type: 'UPDATE_DEFERRED_REPORT',
                    active: true,
                });
                return;
            }
            if (options?.skipWaitingFn) {
                await options.skipWaitingFn();
            }
            else if (typeof self !== 'undefined' && 'skipWaiting' in self) {
                await self.skipWaiting();
            }
            break;
        }
        case 'SET_ATTEMPT_ACTIVE': {
            isAttemptActive = Boolean(message.active);
            options?.postMessageFn?.({
                type: 'ATTEMPT_STATUS_ACK',
                active: isAttemptActive,
            });
            break;
        }
        case 'GET_VERSION': {
            options?.postMessageFn?.({
                type: 'VERSION_REPORT',
                version: CACHE_VERSION,
                cacheName: options?.cacheName ?? CACHE_NAME,
            });
            break;
        }
        case 'PING': {
            options?.postMessageFn?.({
                type: 'PONG',
                version: CACHE_VERSION,
            });
            break;
        }
        case 'CHECK_OFFLINE_READY': {
            const cachesImpl = options?.cachesObj ?? (typeof caches !== 'undefined' ? caches : undefined);
            const cacheName = options?.cacheName ?? CACHE_NAME;
            const scopeBase = message.scopeBase ?? '/';
            const required = message.requiredUrls ?? DEFAULT_PRECACHE_ENTRIES.filter((i) => i.critical).map((i) => i.url);
            const missingUrls = [];
            let cachedCount = 0;
            if (cachesImpl) {
                const cache = await cachesImpl.open(cacheName);
                for (const url of required) {
                    const resolved = resolveScopeUrl(scopeBase, url);
                    const match = (await cache.match(url)) ||
                        (await cache.match(resolved)) ||
                        (await cache.match(resolveScopeUrl('/', url)));
                    if (match) {
                        cachedCount++;
                    }
                    else {
                        missingUrls.push(url);
                    }
                }
            }
            else {
                missingUrls.push(...required);
            }
            options?.postMessageFn?.({
                type: 'OFFLINE_READY_REPORT',
                ready: missingUrls.length === 0,
                cachedCount,
                totalCount: required.length,
                missingUrls: Object.freeze(missingUrls),
            });
            break;
        }
        default:
            break;
    }
}
// ----------------------------------------------------------------------------
// Service Worker Global Scope Event Listener Binding
// ----------------------------------------------------------------------------
const isServiceWorkerScope = typeof self !== 'undefined' &&
    'addEventListener' in self &&
    !('window' in self) &&
    !('document' in self);
if (isServiceWorkerScope) {
    const swSelf = self;
    swSelf.addEventListener('install', (event) => {
        event.waitUntil(executeInstall());
    });
    swSelf.addEventListener('activate', (event) => {
        event.waitUntil(executeActivate());
    });
    swSelf.addEventListener('fetch', (event) => {
        event.respondWith(executeFetch(event.request));
    });
    swSelf.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || typeof data !== 'object')
            return;
        const reply = (outMsg) => {
            if (event.source && typeof event.source.postMessage === 'function') {
                event.source.postMessage(outMsg);
            }
        };
        event.waitUntil(executeMessage(data, {
            postMessageFn: reply,
            skipWaitingFn: () => swSelf.skipWaiting(),
        }));
    });
}
