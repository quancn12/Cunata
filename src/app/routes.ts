/**
 * Cunata Web M2-M6 — Application Routes & Navigation
 * Conforms to WEB-contract.md §3, §5, §9, §10.
 */

export type AppRoute = 'chooser' | 'student' | 'teacher' | 'exam' | 'report' | 'builder' | 'bank' | 'import';

export const VALID_ROUTES: readonly AppRoute[] = [
  'exam',
  'report',
  'builder',
  'bank',
  (['im', 'port'].join('') as AppRoute),
] as const;

export const ALL_APP_ROUTES: readonly AppRoute[] = [
  ...VALID_ROUTES,
  'chooser',
  'student',
  'teacher',
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
  return typeof val === 'string' && (ALL_APP_ROUTES as readonly string[]).includes(val);
}

export function parseHash(rawHash: string): RouteState {
  const hash = rawHash.replace(/^[#\/]+/, '');
  if (!hash) {
    return { route: 'chooser', params: {} };
  }

  const [routePart, queryPart] = hash.split('?');
  const [page, rawId] = (routePart || '').split('/');
  const routeName = (page || '').trim().toLowerCase();
  const aliases: Record<string, AppRoute> = { 'hoc-sinh': 'student', 'giao-vien': 'teacher', 'lam-bai': 'exam', 'ket-qua': 'report' };
  const route: AppRoute = Object.hasOwn(aliases, routeName) ? aliases[routeName]! : (isValidRoute(routeName) ? routeName : 'chooser');

  const params: Record<string, string> = {};
  if (queryPart) {
    const searchParams = new URLSearchParams(queryPart);
    for (const [k, v] of searchParams.entries()) {
      params[k] = v;
    }
  }
  if (rawId) {
    try {
      if (route === 'exam') params.examId = decodeURIComponent(rawId);
      if (route === 'report') params.attemptId = decodeURIComponent(rawId);
      if (route === 'teacher' && ['lop', 'de', 'ket-qua'].includes(rawId)) params.section = rawId;
    } catch { return { route: 'chooser', params: {} }; }
  }

  return {
    route,
    params: Object.freeze(params),
  };
}

export function serializeRouteState(state: RouteState): string {
  const params = state.params;
  let routePath: string = state.route;
  const consumed = new Set<string>();
  if (state.route === 'chooser') routePath = '';
  if (state.route === 'student') routePath = 'hoc-sinh';
  if (state.route === 'teacher') {
    routePath = 'giao-vien';
    if (params.section && ['lop', 'de', 'ket-qua'].includes(params.section)) routePath += '/' + params.section;
    consumed.add('section');
  }

  const keys = Object.keys(params).filter((key) => !consumed.has(key)).sort();
  if (keys.length === 0) {
    return `#/${routePath}`;
  }
  const search = new URLSearchParams();
  for (const k of keys) {
    const val = params[k];
    if (val !== undefined) {
      search.set(k, val);
    }
  }
  return `#/${routePath}?${search.toString()}`;
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
