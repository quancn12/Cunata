import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRouter, parseHash, serializeRouteState } from '../../src/app/routes.ts';
import { readRememberedRole } from '../../src/app/role-shell.ts';

test('role routes preserve invitation query and safely roundtrip opaque IDs', () => {
  assert.deepEqual(parseHash(''), { route: 'chooser', params: {} });
  assert.deepEqual(parseHash('#/hoc-sinh?lop=ABC234'), { route: 'student', params: { lop: 'ABC234' } });
  for (const id of ['exam/a?b#c', 'Đề số 1', '__proto__', 'x:y']) {
    for (const route of ['exam', 'report'] as const) {
      const params = route === 'exam' ? { examId: id } : { attemptId: id };
      const state = { route, params };
      assert.deepEqual(parseHash(serializeRouteState(state)), state);
    }
  }
  assert.deepEqual(parseHash('#/lam-bai/%E0%A4%A'), { route: 'chooser', params: {} });
  assert.deepEqual(parseHash('#/unknown'), { route: 'chooser', params: {} });
  assert.deepEqual(parseHash('#/constructor'), { route: 'chooser', params: {} });
});

test('teacher tabs serialize in the path and hash changes unsubscribe cleanly', () => {
  for (const section of ['lop', 'de', 'ket-qua']) {
    assert.equal(serializeRouteState({ route: 'teacher', params: { section } }), `#/giao-vien/${section}`);
  }
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const win = {
    location: { hash: '#/giao-vien/lop' },
    addEventListener(type: string, handler: (...args: unknown[]) => void) { handlers.set(type, handler); },
    removeEventListener(type: string) { handlers.delete(type); },
  };
  const router = createRouter('chooser', {}, win);
  const events: string[] = [];
  const unsubscribe = router.subscribe((state) => events.push(state.route));
  router.navigate('student', { lop: 'ABC234' });
  handlers.get('hashchange')?.();
  assert.deepEqual(events, ['student']);
  win.location.hash = '#/giao-vien/de'; handlers.get('hashchange')?.();
  assert.equal(router.getState().params.section, 'de');
  unsubscribe(); router.navigate('chooser');
  assert.deepEqual(events, ['student', 'teacher']);
  router.dispose(); assert.equal(handlers.size, 0);
});

test('role preferences reject unknown values and tolerate blocked storage', () => {
  assert.equal(readRememberedRole({ getItem: () => 'teacher' }), 'teacher');
  assert.equal(readRememberedRole({ getItem: () => 'admin' }), null);
  assert.equal(readRememberedRole({ getItem: () => { throw new Error('blocked'); } }), null);
});
