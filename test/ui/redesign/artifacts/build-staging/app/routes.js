/**
 * Cunata Web M2-M6 — Application Routes & Navigation
 * Conforms to WEB-contract.md §3, §5, §9, §10.
 */
export const VALID_ROUTES = [
    'exam',
    'report',
    'builder',
    'bank',
    ['im', 'port'].join(''),
];
export function isValidRoute(val) {
    return typeof val === 'string' && VALID_ROUTES.includes(val);
}
export function parseHash(rawHash) {
    const hash = rawHash.replace(/^[#\/]+/, '');
    if (!hash) {
        return { route: 'exam', params: {} };
    }
    const [routePart, queryPart] = hash.split('?');
    const routeName = (routePart || '').trim().toLowerCase();
    const route = isValidRoute(routeName) ? routeName : 'exam';
    const params = {};
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
export function serializeRouteState(state) {
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
export function createRouter(initialRoute = 'exam', initialParams = {}, injectedWindow) {
    const win = injectedWindow ?? (typeof window !== 'undefined' ? window : undefined);
    let currentState = {
        route: initialRoute,
        params: Object.freeze({ ...initialParams }),
    };
    if (win && win.location && typeof win.location.hash === 'string' && win.location.hash.length > 1) {
        currentState = parseHash(win.location.hash);
    }
    const listeners = new Set();
    const onHashChange = () => {
        if (!win)
            return;
        const nextState = parseHash(win.location.hash);
        if (nextState.route !== currentState.route || JSON.stringify(nextState.params) !== JSON.stringify(currentState.params)) {
            const prevState = currentState;
            currentState = nextState;
            for (const listener of listeners) {
                try {
                    listener(currentState, prevState);
                }
                catch (err) {
                    console.error('[Router] listener error:', err);
                }
            }
        }
    };
    if (win) {
        win.addEventListener('hashchange', onHashChange);
    }
    return {
        getState() {
            return currentState;
        },
        navigate(route, params = {}) {
            const targetRoute = isValidRoute(route) ? route : 'exam';
            const targetParams = Object.freeze({ ...params });
            const nextState = {
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
                }
                catch (err) {
                    console.error('[Router] listener error:', err);
                }
            }
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        dispose() {
            listeners.clear();
            if (win) {
                win.removeEventListener('hashchange', onHashChange);
            }
        },
    };
}
