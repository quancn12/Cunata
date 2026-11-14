/**
 * Cunata Web M2/M6 — Offline & Service Worker Test Helpers
 * In-memory deterministic mocks for CacheStorage, ServiceWorkerRegistration, and Fetch.
 */

export class MockCache {
  readonly name: string;
  private readonly store = new Map<string, Response>();

  constructor(name: string) {
    this.name = name;
  }

  async match(request: string | { url: string }): Promise<Response | undefined> {
    const key = typeof request === 'string' ? request : request.url;
    const res = this.store.get(key);
    if (res) {
      return res.clone();
    }

    // Try matching pathnames if full URL was passed or vice versa
    for (const [storedKey, storedRes] of this.store.entries()) {
      if (
        storedKey === key ||
        storedKey.endsWith(key) ||
        key.endsWith(storedKey) ||
        (key.startsWith('/') && storedKey === key.slice(1)) ||
        (storedKey.startsWith('/') && key === storedKey.slice(1))
      ) {
        return storedRes.clone();
      }
    }
    return undefined;
  }

  async put(request: string | { url: string }, response: Response): Promise<void> {
    const key = typeof request === 'string' ? request : request.url;
    this.store.set(key, response.clone());
  }

  async delete(request: string | { url: string }): Promise<boolean> {
    const key = typeof request === 'string' ? request : request.url;
    return this.store.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  size(): number {
    return this.store.size;
  }
}

export class MockCacheStorage implements CacheStorage {
  private readonly caches = new Map<string, MockCache>();

  async open(cacheName: string): Promise<Cache> {
    let c = this.caches.get(cacheName);
    if (!c) {
      c = new MockCache(cacheName);
      this.caches.set(cacheName, c);
    }
    return c as unknown as Cache;
  }

  async has(cacheName: string): Promise<boolean> {
    return this.caches.has(cacheName);
  }

  async delete(cacheName: string): Promise<boolean> {
    return this.caches.delete(cacheName);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.caches.keys());
  }

  async match(request: any): Promise<Response | undefined> {
    for (const c of this.caches.values()) {
      const match = await c.match(request);
      if (match) return match;
    }
    return undefined;
  }
}

export interface MockFetchController {
  fetchFn: typeof fetch;
  setResponse(urlPattern: string | RegExp, response: () => Response | Promise<Response>): void;
  setNetworkFailure(enabled: boolean): void;
  getHistory(): readonly { url: string; options?: any }[];
  clearHistory(): void;
}

export function createMockFetch(initialRoutes?: Record<string, string | object>): MockFetchController {
  const customRoutes = new Map<string | RegExp, () => Response | Promise<Response>>();
  const history: { url: string; options?: any }[] = [];
  let simulateNetworkDown = false;

  if (initialRoutes) {
    for (const [route, body] of Object.entries(initialRoutes)) {
      const content = typeof body === 'string' ? body : JSON.stringify(body);
      const isJson = typeof body !== 'string';
      customRoutes.set(route, () =>
        new Response(content, {
          status: 200,
          headers: { 'Content-Type': isJson ? 'application/json' : 'text/html' },
        })
      );
    }
  }

  const fetchFn: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : String(input);
    history.push({ url, options: init });

    if (simulateNetworkDown) {
      throw new TypeError('Failed to fetch: Network is offline');
    }

    // Check custom routes
    for (const [pattern, handler] of customRoutes.entries()) {
      if (typeof pattern === 'string') {
        if (url === pattern || url.endsWith(pattern) || pattern.endsWith(url)) {
          return handler();
        }
      } else if (pattern.test(url)) {
        return handler();
      }
    }

    // Default 200 response for any other URL unless specified
    return new Response(`Mock asset content for ${url}`, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  };

  return {
    fetchFn,
    setResponse(pattern, handler) {
      customRoutes.set(pattern, handler);
    },
    setNetworkFailure(enabled) {
      simulateNetworkDown = enabled;
    },
    getHistory() {
      return Object.freeze([...history]);
    },
    clearHistory() {
      history.length = 0;
    },
  };
}

export function createMockClientEnvironment(opts?: {
  protocol?: string;
  hostname?: string;
  hasServiceWorker?: boolean;
  activeRegistration?: any;
}) {
  const protocol = opts?.protocol ?? 'http:';
  const hostname = opts?.hostname ?? 'localhost';
  const hasSW = opts?.hasServiceWorker !== false;

  const listeners = new Map<string, ((...args: any[]) => void)[]>();
  const addEventListener = (evt: string, fn: any) => {
    if (!listeners.has(evt)) listeners.set(evt, []);
    listeners.get(evt)!.push(fn);
  };
  const removeEventListener = (evt: string, fn: any) => {
    const list = listeners.get(evt);
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx !== -1) list.splice(idx, 1);
  };

  const controllerMessages: any[] = [];
  const mockController = {
    postMessage(msg: any) {
      controllerMessages.push(msg);
    },
  };

  let mockReg = opts?.activeRegistration ?? {
    active: { state: 'activated' },
    waiting: null,
    installing: null,
    scope: '/',
    addEventListener: (evt: string, fn: any) => {},
    unregister: async () => true,
  };

  const mockServiceWorker = {
    controller: mockController,
    register: async (url: string, regOpts?: any) => {
      return mockReg;
    },
    addEventListener,
    removeEventListener,
  };

  const windowObj = {
    location: {
      protocol,
      hostname,
      href: `${protocol}//${hostname}:8000/`,
    },
  };

  const navigatorObj: any = {
    storage: {
      estimate: async () => ({
        quota: 1024 * 1024 * 100, // 100 MB
        usage: 1024 * 1024 * 10,  // 10 MB
      }),
      persisted: async () => false,
    },
  };

  if (hasSW) {
    navigatorObj.serviceWorker = mockServiceWorker;
  }

  return {
    windowObj,
    navigatorObj,
    controllerMessages,
    setRegistration(reg: any) {
      mockReg = reg;
    },
    setController(c: any) {
      mockServiceWorker.controller = c;
    },
  };
}
