/**
 * Unit tests for WEB-W2-GLUE — Application Router and Hash Navigation
 * Conforms to WEB-contract.md §3, §5, §10.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRouter,
  parseHash,
  serializeRouteState,
  isValidRoute,
  type AppRoute,
  type RouteState,
  type WindowLike,
} from '../../../src/app/routes.ts';

describe('WEB-W2-GLUE — Router & Hash Management', () => {
  it('isValidRoute accepts valid routes and rejects invalid ones', () => {
    assert.equal(isValidRoute('exam'), true);
    assert.equal(isValidRoute('report'), true);
    assert.equal(isValidRoute('builder'), true);
    assert.equal(isValidRoute('bank'), true);
    assert.equal(isValidRoute('import'), true);

    assert.equal(isValidRoute('admin'), false);
    assert.equal(isValidRoute(''), false);
    assert.equal(isValidRoute(null), false);
    assert.equal(isValidRoute(123), false);
  });

  it('parseHash parses route and query parameters safely', () => {
    assert.deepEqual(parseHash(''), { route: 'chooser', params: {} });
    assert.deepEqual(parseHash('#'), { route: 'chooser', params: {} });
    assert.deepEqual(parseHash('#/'), { route: 'chooser', params: {} });
    assert.deepEqual(parseHash('#/exam'), { route: 'exam', params: {} });

    assert.deepEqual(parseHash('#/report?attemptId=att-123&release=immediate'), {
      route: 'report',
      params: { attemptId: 'att-123', release: 'immediate' },
    });

    assert.deepEqual(parseHash('#/builder?draftId=d-1'), {
      route: 'builder',
      params: { draftId: 'd-1' },
    });

    // Unknown route falls back to 'chooser'
    assert.deepEqual(parseHash('#/unknown-route?foo=bar'), {
      route: 'chooser',
      params: { foo: 'bar' },
    });
  });

  it('serializeRouteState produces clean sorted hash URLs', () => {
    assert.equal(serializeRouteState({ route: 'exam', params: {} }), '#/exam');
    assert.equal(
      serializeRouteState({
        route: 'report',
        params: { attemptId: 'att-1', mode: 'summary' },
      }),
      '#/report?attemptId=att-1&mode=summary'
    );
  });

  it('createRouter supports in-memory navigation without window', () => {
    const router = createRouter('exam');
    assert.equal(router.getState().route, 'exam');

    const history: RouteState[] = [];
    const unsubscribe = router.subscribe((state) => {
      history.push(state);
    });

    router.navigate('builder', { draftId: 'draft-99' });
    assert.equal(router.getState().route, 'builder');
    assert.equal(router.getState().params.draftId, 'draft-99');

    router.navigate('report');
    assert.equal(router.getState().route, 'report');

    assert.equal(history.length, 2);
    assert.equal(history[0]?.route, 'builder');
    assert.equal(history[1]?.route, 'report');

    unsubscribe();
    router.navigate('bank');
    assert.equal(history.length, 2, 'Unsubscribed listener must not receive further events');
    assert.equal(router.getState().route, 'bank');

    router.dispose();
  });

  it('createRouter integrates with mock window hashchange events', () => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    const mockWindow: WindowLike = {
      location: {
        hash: '#/bank',
      },
      addEventListener(event: string, handler: (...args: unknown[]) => void) {
        listeners[event] = listeners[event] || [];
        listeners[event]?.push(handler);
      },
      removeEventListener(event: string, handler: (...args: unknown[]) => void) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event]?.filter((h) => h !== handler);
      },
    };

    const router = createRouter('exam', {}, mockWindow);
    // Initial state initialized from mockWindow.location.hash
    assert.equal(router.getState().route, 'bank');

    let notifiedState: RouteState | null = null;
    router.subscribe((state) => {
      notifiedState = state;
    });

    // Simulate window.location.hash update by user/browser
    mockWindow.location.hash = '#/report?attemptId=att-xyz';
    for (const h of listeners['hashchange'] || []) {
      h();
    }

    assert.ok(notifiedState);
    const finalState = notifiedState as RouteState;
    assert.equal(finalState.route, 'report');
    assert.equal(finalState.params.attemptId, 'att-xyz');

    // Calling navigate updates window.location.hash
    router.navigate('exam');
    assert.equal(mockWindow.location.hash, '#/exam');

    router.dispose();
    assert.equal(listeners['hashchange']?.length, 0, 'hashchange listener must be removed on dispose');
  });
});
