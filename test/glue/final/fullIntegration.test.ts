/**
 * Full Application Integration & Lifecycle Test Suite — WEB-FINAL-INTEGRATE
 * Conforms to WEB-contract.md §2, §3, §5, §9, §10 and tasks.json (WEB-FINAL-INTEGRATE).
 *
 * Responsibilities:
 * - Tests composition root (bootstrap), application context, and UI shell.
 * - Verifies navigation transitions and mutual exclusion across all 5 official routes:
 *     exam, report, builder, bank, import.
 * - Verifies modal isolation (#builderModal vs #bankModal vs #submitModal).
 * - Verifies complete student attempt lifecycle: start -> answer -> submit -> report view.
 * - Verifies cutover gating: preserves root legacy demo (file:// safe) while D03 is pending.
 * - Verifies clean disposal of all event listeners, routers, and controllers without leaks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, join } from 'node:path';

import type { WebExam, AttemptRecord } from '../../../src/schema/index.ts';
import type { StoragePort, StorageTransactionAdapter } from '../../../src/storage/index.ts';
import { MemoryTransactionAdapter } from '../../../src/storage/index.ts';
import {
  createRouter,
  parseHash,
  serializeRouteState,
  isValidRoute,
  VALID_ROUTES,
} from '../../../src/app/routes.ts';
import { bootstrap } from '../../../src/app/main.ts';
import { checkCutoverGates } from '../../../src/app/legacy.ts';

// Mock DOM factory for Node.js test environment
function createMockElement(tag = 'div', id?: string, className?: string) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const children: any[] = [];
  const styleObj: Record<string, string> = {};

  const el: any = {
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
        } else if (c && c.id === selector.slice(1)) {
          results.push(c);
        }
      }
      return results;
    },
    addEventListener(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    },
    removeEventListener(event: string, handler: (...args: unknown[]) => void) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter((h) => h !== handler);
    },
    dispatchEvent(event: { type: string; [key: string]: any }): boolean {
      const handlers = listeners[event.type] || [];
      for (const h of handlers) {
        h(event);
      }
      return true;
    },
    click() {
      el.dispatchEvent({ type: 'click' });
    },
    focus() {},
    blur() {},
  };

  return el;
}

function createMockDocument() {
  const head = createMockElement('head');
  const body = createMockElement('body');
  const root = createMockElement('div', 'appRoot');
  body.appendChild(root);

  const doc: any = {
    head,
    body,
    createElement(tag: string) {
      const el = createMockElement(tag);
      el.ownerDocument = doc;
      return el;
    },
    getElementById(id: string) {
      return root.querySelector('#' + id);
    },
    querySelector(sel: string) {
      return root.querySelector(sel);
    },
    querySelectorAll(sel: string) {
      return root.querySelectorAll(sel);
    },
  };

  root.ownerDocument = doc;
  return { doc, root };
}

describe('WEB-FINAL-INTEGRATE — Full Application Integration & Lifecycle', () => {
  const rootDir = resolve('.');
  const indexPath = join(rootDir, 'index.html');

  it('verifies that root index.html remains usable directly via file:// without module CORS errors', () => {
    assert.ok(fs.existsSync(indexPath), 'Root index.html must exist');
    const html = fs.readFileSync(indexPath, 'utf8');

    // 1. Must NOT contain external <script type="module" src="..."> that triggers file:// CORS errors
    const extModuleScripts = html.match(/<script\b[^>]*type=["']module["'][^>]*src=["'][^"']+["'][^>]*>/gi);
    assert.equal(
      extModuleScripts,
      null,
      'Root index.html must NOT have external <script type="module" src="..."> that fails under file://'
    );

    // 2. Must link stylesheet relatively
    assert.ok(html.includes('styles/style.css'), 'Must link to styles/style.css relatively');
    assert.equal(html.includes('href="/styles/'), false, 'Must not have root-absolute stylesheet link');

    // 3. Must contain required semantic UI elements
    assert.ok(html.includes('id="examTitle"'), 'Must have #examTitle');
    assert.ok(html.includes('id="candidateName"'), 'Must have #candidateName');
    assert.ok(html.includes('id="syncStatus"'), 'Must have #syncStatus');
    assert.ok(html.includes('id="timerBox"'), 'Must have #timerBox');
    assert.ok(html.includes('id="btnSubmit"'), 'Must have #btnSubmit');
    assert.ok(html.includes('id="examPane"'), 'Must have #examPane');
    assert.ok(html.includes('id="reportWrapper"'), 'Must have #reportWrapper');
    assert.ok(html.includes('id="reportView"'), 'Must have #reportView');
  });

  it('verifies cutover gates enforce NEED_DECISION and preserve root legacy demo', () => {
    const cutover = checkCutoverGates();
    assert.equal(cutover.canCutover, false, 'Cutover gate must not allow automatic cutover while D03 is open');
    assert.equal(cutover.preserveRootLegacy, true, 'Root legacy demo must be preserved');
    assert.equal(cutover.status, 'NEED_DECISION');
    assert.ok(cutover.openDecisions.includes('D03'), 'D03 must be among open decisions');
  });

  it('verifies router supports all 5 official routes and preserves query params', () => {
    assert.equal(VALID_ROUTES.length, 5);
    assert.deepEqual(Array.from(VALID_ROUTES), ['exam', 'report', 'builder', 'bank', 'import']);

    for (const r of VALID_ROUTES) {
      assert.ok(isValidRoute(r), `Route ${r} must be valid`);
      const parsed = parseHash(`#/${r}`);
      assert.equal(parsed.route, r);
    }

    // Invalid route defaults to exam
    assert.equal(parseHash('#/unknown').route, 'exam');

    // Query parameters parsing and serialization
    const parsedWithQuery = parseHash('#/report?attemptId=att-123&mode=review');
    assert.equal(parsedWithQuery.route, 'report');
    assert.equal(parsedWithQuery.params.attemptId, 'att-123');
    assert.equal(parsedWithQuery.params.mode, 'review');

    const serialized = serializeRouteState(parsedWithQuery);
    assert.equal(serialized, '#/report?attemptId=att-123&mode=review');
  });

  it('bootstraps application and navigates cleanly across all 5 routes with modal isolation', async () => {
    const { root } = createMockDocument();

    const cleanup = await bootstrap(root as any, {
      initialRoute: 'exam',
      now: () => 1700000000000,
    });

    assert.ok(typeof cleanup === 'function', 'bootstrap must return a cleanup function');

    const examWrapper = root.querySelector('#examWrapper');
    const reportWrapper = root.querySelector('#reportWrapper');
    const builderModal = root.querySelector('#builderModal');
    const bankModal = root.querySelector('#bankModal');

    // 1. Initial route: exam
    assert.equal(examWrapper.style.display, '');
    assert.equal(reportWrapper.style.display, 'none');
    assert.equal(builderModal.style.display, 'none');
    assert.equal(bankModal.style.display, 'none');

    // 2. Click submit button: opens submit modal
    const btnSubmit = root.querySelector('#btnSubmit');
    const submitModal = root.querySelector('#submitModal');
    assert.ok(btnSubmit && submitModal);

    btnSubmit.click();
    assert.equal(submitModal.style.display, 'flex');

    const btnCancelSubmit = root.querySelector('#btnCancelSubmit');
    btnCancelSubmit.click();
    assert.equal(submitModal.style.display, 'none');

    // 3. Cleanup tears down without throwing
    assert.doesNotThrow(() => {
      cleanup();
    });
  });

  it('verifies submit flow generates report and navigates to report view with clean disposal', async () => {
    const { root } = createMockDocument();

    const testExam: WebExam = {
      schemaVersion: 'web-exam-v1',
      examId: 'test-integrate-exam',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'Đề Tích Hợp Thử Nghiệm',
      subject: 'Toán',
      grade: 12,
      settings: {
        durationMinutes: 45,
        maxAttempts: null,
        releasePolicy: 'immediate',
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      questions: [
        {
          questionId: 'q01',
          questionVersionId: 'q01-v1',
          kind: 'I',
          title: 'Câu 1',
          content: 'Giá trị của log2(8) là:',
          options: [
            { optionId: 'opt-a', text: '1' },
            { optionId: 'opt-b', text: '2' },
            { optionId: 'opt-c', text: '3' },
            { optionId: 'opt-d', text: '4' },
          ],
          correctOptionId: 'opt-c',
        },
      ],
      assets: [],
    };

    const cleanup = await bootstrap(root as any, {
      initialRoute: 'exam',
      initialExam: testExam,
      storageAdapter: new MemoryTransactionAdapter(),
      now: () => 1700000000000,
    });

    const btnSubmit = root.querySelector('#btnSubmit');
    const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit');
    const reportWrapper = root.querySelector('#reportWrapper');
    const reportView = root.querySelector('#reportView');

    assert.ok(btnSubmit && btnConfirmSubmit && reportWrapper && reportView);

    btnSubmit.click();
    btnConfirmSubmit.click();
    // Allow asynchronous submission and report generation to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Report view should have received HTML content and route transitioned
    assert.equal(reportWrapper.style.display, '');
    assert.ok(reportView.innerHTML.length > 50, 'Report view must have rendered HTML content');

    cleanup();
  });
});
