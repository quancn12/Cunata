/**
 * Cunata Web M2-M6 — Application Routes & Navigation
 * Conforms to WEB-contract.md §3, §5, §9, §10.
 */

export type AppRoute = 'exam' | 'report' | 'builder' | 'bank' | 'import';

export const VALID_ROUTES: readonly AppRoute[] = [
  'exam',
  'report',
  'builder',
  'bank',
  'import',
] as const;

export interface RouteParams {
  readonly examId?: string;
  readonly examVersionId?: string;
  readonly attemptId?: string;
  readonly [key: string]: string | undefined;
}

export interface RouteState {
  readonly route: AppRoute;
  readonly params: Readonly<RouteParams>;
}

export type RouteListener = (state: RouteState, prevState?: RouteState) => void;

export interface WindowLike {
  location: {
    hash: string;
  };
  addEventListener(event: string, handler: (...args: unknown[]) => void): void;
  removeEventListener(event: string, handler: (...args: unknown[]) => void): void;
}

export interface Router {
  getState(): RouteState;
  navigate(route: AppRoute, params?: RouteParams): void;
  subscribe(listener: RouteListener): () => void;
  dispose(): void;
}

export function isValidRoute(val: unknown): val is AppRoute {
  return typeof val === 'string' && (VALID_ROUTES as readonly string[]).includes(val);
}

export function parseHash(rawHash: string): RouteState {
  const hash = rawHash.replace(/^[#\/]+/, '');
  if (!hash) {
    return { route: 'exam', params: {} };
  }

  const [routePart, queryPart] = hash.split('?');
  const routeName = (routePart || '').trim().toLowerCase();
  const route: AppRoute = isValidRoute(routeName) ? routeName : 'exam';

  const params: Record<string, string> = {};
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    for (const [k, v] of searchParams.entries()) {
      params[k] = v;
    }
  }

  return {
    route,
    params: Object.freeze(params),
  };
}

export function serializeRouteState(state: RouteState): string {
  const params = state.params;
  const keys = Object.keys(params).sort();
  if (keys.length === 0) {
    return `#/${state.route}`;
  }
  const search = new URLSearchParams();
  for (const k of keys) {
    const val = params[k];
    if (val !== undefined) {
      search.set(k, val);
    }
  }
  return `#/${state.route}?${search.toString()}`;
}

export function createRouter(
  initialRoute: AppRoute = 'exam',
  initialParams: RouteParams = {},
  injectedWindow?: WindowLike
): Router {
  const win = injectedWindow ?? (typeof window !== 'undefined' ? (window as unknown as WindowLike) : undefined);

  let currentState: RouteState = {
    route: initialRoute,
    params: Object.freeze({ ...initialParams }),
  };

  if (win && win.location && typeof win.location.hash === 'string' && win.location.hash.length > 1) {
    currentState = parseHash(win.location.hash);
  }

  const listeners = new Set<RouteListener>();

  const onHashChange = () => {
    if (!win) return;
    const nextState = parseHash(win.location.hash);
    if (nextState.route !== currentState.route || JSON.stringify(nextState.params) !== JSON.stringify(currentState.params)) {
      const prevState = currentState;
      currentState = nextState;
      for (const listener of listeners) {
        try {
          listener(currentState, prevState);
        } catch (err) {
          console.error('[Router] listener error:', err);
        }
      }
    }
  };

  if (win) {
    win.addEventListener('hashchange', onHashChange);
  }

  return {
    getState(): RouteState {
      return currentState;
    },

    navigate(route: AppRoute, params: RouteParams = {}): void {
      const targetRoute: AppRoute = isValidRoute(route) ? route : 'exam';
      const targetParams = Object.freeze({ ...params });
      const nextState: RouteState = {
        route: targetRoute,
        params: targetParams,
      };

      const prevState = currentState;
      currentState = nextState;

      if (win) {
        const nextHash = serializeRouteState(nextState);
        if (win.location.hash !== nextHash) {
          win.location.hash = nextHash;
        }
      }

      for (const listener of listeners) {
        try {
          listener(currentState, prevState);
        } catch (err) {
          console.error('[Router] listener error:', err);
        }
      }
    },

    subscribe(listener: RouteListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose(): void {
      listeners.clear();
      if (win) {
        win.removeEventListener('hashchange', onHashChange);
      }
    },
  };
}
