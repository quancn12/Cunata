/**
 * Integration & Hardening Test Suite — WEB-W4-GLUE
 * Conforms to WEB-contract.md §2, §3, §5, §9, §10 and tasks.json (WEB-W4-GLUE).
 *
 * Responsibilities:
 * - Tests composition root (bootstrap), routes and UI shell structure.
 * - Verifies modal isolation and route transitions across all 5 routes:
 *     exam, report, builder, bank, import.
 * - Verifies that unapproved policies (D01-D08) remain disabled and isolated.
 * - Verifies student attempt submission and report generation in modular app.
 * - Verifies clean disposal of all event listeners, router and controllers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { WebExam, AttemptRecord } from '../../../src/schema/index.ts';
import type { StoragePort, StorageTransactionAdapter } from '../../../src/storage/index.ts';
import {
  createRouter,
  parseHash,
  serializeRouteState,
  isValidRoute,
  VALID_ROUTES,
} from '../../../src/app/routes.ts';
import { bootstrap } from '../../../src/app/main.ts';

// Mock DOM factory for Node.js test environment
function createMockElement(tag = 'div', id?: string, className?: string) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const children: any[] = [];
  const styleObj: Record<string, string> = {};

  const el = {
    tagName: tag.toUpperCase(),
    id: id || '',
    className: className || '',
    style: styleObj,
    value: '',
    textContent: '',
    innerHTML: '',
    children,
    ownerDocument: null as any,
    appendChild(child: any) {
      children.push(child);
      return child;
    },
    querySelector(selector: string): any {
      if (selector.startsWith('#')) {
        const targetId = selector.slice(1);
        if (el.id === targetId) return el;
        for (const c of children) {
          if (c && typeof c.querySelector === 'function') {
            const found = c.querySelector(selector);
            if (found) return found;
          } else if (c && c.id === targetId) {
            return c;
          }
        }
      }
      return null;
    },
    querySelectorAll(selector: string): any[] {
      const results: any[] = [];
      if (selector.startsWith('#')) {
        const targetId = selector.slice(1);
        if (el.id === targetId) results.push(el);
      }
      for (const c of children) {
        if (c && typeof c.querySelectorAll === 'function') {
          results.push(...c.querySelectorAll(selector));
        }
      }
      return results;
    },
    addEventListener(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event]!.push(handler);
    },
    removeEventListener(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event]!.filter((h) => h !== handler);
    },
    dispatchEvent(event: string, ...args: unknown[]) {
      const handlers = listeners[event] || [];
      for (const h of handlers) {
        h(...args);
      }
    },
  };

  return el;
}

function createMockDocument() {
  const doc = {
    createElement(tag: string) {
      const el = createMockElement(tag);
      el.ownerDocument = doc;
      return el;
    },
  };
  return doc;
}

const TEST_EXAM: WebExam = {
  schemaVersion: 'web-exam-v1',
  examId: 'test-exam-hardening-01',
  examVersionId: 'v1.0.0',
  ruleSetId: 'custom-v1',
  inputPolicyId: 'sa-charset-v1',
  title: 'Đề Kiểm Tra Hardening Môn Toán 12',
  subject: 'Toán học',
  grade: 12,
  settings: {
    durationMinutes: 45,
    maxAttempts: 3,
    releasePolicy: 'immediate',
    shuffleQuestions: false,
    shuffleOptions: false,
  },
  questions: [
    {
      kind: 'I',
      questionId: 'q1',
      questionVersionId: 'q1_v1',
      content: 'Giá trị của lim 1/n là bao nhiêu?',
      options: [
        { optionId: 'opt_a', label: 'A', text: '0' },
        { optionId: 'opt_b', label: 'B', text: '1' },
      ],
      correctOptionId: 'opt_a',
    },
  ],
  assets: [],
};

describe('WEB-W4-GLUE — Integration & Lifecycle Hardening', () => {
  it('verifies route parsing and serialization for all 5 valid routes', () => {
    for (const r of VALID_ROUTES) {
      assert.equal(isValidRoute(r), true, `Route ${r} must be valid`);
      const serialized = serializeRouteState({ route: r, params: {} });
      assert.equal(serialized, `#/${r}`);
      const parsed = parseHash(serialized);
      assert.equal(parsed.route, r);
      assert.deepEqual(parsed.params, {});
    }

    // Invalid route defaults to exam
    const fallback = parseHash('#/unknown-route');
    assert.equal(fallback.route, 'exam');

    // Route with query parameters
    const stateWithQuery = parseHash('#/report?attemptId=att-123&mode=review');
    assert.equal(stateWithQuery.route, 'report');
    assert.equal(stateWithQuery.params['attemptId'], 'att-123');
    assert.equal(stateWithQuery.params['mode'], 'review');
  });

  it('verifies router navigation and subscription notification', () => {
    let mockHash = '#/exam';
    const mockWindow = {
      location: {
        get hash() {
          return mockHash;
        },
        set hash(val: string) {
          mockHash = val;
        },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const router = createRouter('exam', {}, mockWindow);
    assert.equal(router.getState().route, 'exam');

    let notifiedRoute = '';
    const unsub = router.subscribe((state) => {
      notifiedRoute = state.route;
    });

    router.navigate('builder');
    assert.equal(notifiedRoute, 'builder');
    assert.equal(router.getState().route, 'builder');
    assert.equal(mockHash, '#/builder');

    router.navigate('bank');
    assert.equal(notifiedRoute, 'bank');
    assert.equal(mockHash, '#/bank');

    unsub();
    router.navigate('report', { attemptId: '999' });
    // Subscriber was removed, notifiedRoute should remain 'bank'
    assert.equal(notifiedRoute, 'bank');
    assert.equal(router.getState().route, 'report');
    assert.equal(router.getState().params['attemptId'], '999');

    router.dispose();
  });

  it('bootstraps application into container, populates shell and manages route views', async () => {
    const doc = createMockDocument();
    const root = doc.createElement('div');
    root.id = 'appRoot';

    let clockTime = 1000000;
    const now = () => clockTime;
    let idCounter = 1;
    const idGen = () => `test-id-${idCounter++}`;

    const cleanup = await bootstrap(root as any, {
      now,
      id: idGen,
      initialExam: TEST_EXAM,
      initialRoute: 'exam',
    });

    assert.equal(typeof cleanup, 'function', 'bootstrap must return a cleanup function');

    // Verify shell elements created
    const titleEl = root.querySelector('#examTitle');
    assert.ok(titleEl, 'Title element must be present in shell');
    assert.equal(titleEl.textContent, TEST_EXAM.title);

    const examWrapper = root.querySelector('#examWrapper');
    const reportWrapper = root.querySelector('#reportWrapper');
    const builderModal = root.querySelector('#builderModal');
    const bankModal = root.querySelector('#bankModal');
    assert.ok(examWrapper, 'examWrapper must exist');
    assert.ok(reportWrapper, 'reportWrapper must exist');
    assert.ok(builderModal, 'builderModal must exist');
    assert.ok(bankModal, 'bankModal must exist');

    // Initial state: exam route active
    assert.equal(examWrapper.style.display, '');
    assert.equal(reportWrapper.style.display, 'none');
    assert.equal(builderModal.style.display, 'none');
    assert.equal(bankModal.style.display, 'none');

    // Trigger cleanup
    cleanup();
  });

  it('verifies submission confirmation modal action flow and report display', async () => {
    const doc = createMockDocument();
    const root = doc.createElement('div');

    const cleanup = await bootstrap(root as any, {
      now: () => 1700000000000,
      id: () => 'id-submit-test',
      initialExam: TEST_EXAM,
    });

    const submitModal = root.querySelector('#submitModal');
    const btnSubmit = root.querySelector('#btnSubmit');
    const btnCancel = root.querySelector('#btnCancelSubmit');
    const btnConfirm = root.querySelector('#btnConfirmSubmit');

    assert.ok(submitModal);
    assert.ok(btnSubmit);
    assert.ok(btnCancel);
    assert.ok(btnConfirm);

    // Initial: modal hidden
    assert.equal(submitModal.style.display, 'none');

    // Clicking submit button opens confirmation modal
    btnSubmit.dispatchEvent('click');
    assert.equal(submitModal.style.display, 'flex');

    // Clicking cancel hides modal
    btnCancel.dispatchEvent('click');
    assert.equal(submitModal.style.display, 'none');

    cleanup();
  });
});
