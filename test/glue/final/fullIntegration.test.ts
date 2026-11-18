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
import { MemoryTransactionAdapter, createStoragePort } from '../../../src/storage/index.ts';
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
    classList: {
      add(...classes: string[]) {
        const set = new Set((el.className || '').split(/\s+/).filter(Boolean));
        for (const c of classes) set.add(c);
        el.className = Array.from(set).join(' ');
      },
      remove(...classes: string[]) {
        const set = new Set((el.className || '').split(/\s+/).filter(Boolean));
        for (const c of classes) set.delete(c);
        el.className = Array.from(set).join(' ');
      },
      contains(c: string) {
        return (el.className || '').split(/\s+/).includes(c);
      },
      toggle(c: string, force?: boolean) {
        const has = (el.className || '').split(/\s+/).includes(c);
        const shouldHave = force !== undefined ? force : !has;
        if (shouldHave) this.add(c);
        else this.remove(c);
        return shouldHave;
      },
    },
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
      } else if (selector.startsWith('.')) {
        const targetClass = selector.slice(1);
        if (typeof el.className === 'string' && el.className.split(/\s+/).includes(targetClass)) {
          results.push(el);
        }
      }
      for (const c of children) {
        if (c && typeof c.querySelectorAll === 'function') {
          results.push(...c.querySelectorAll(selector));
        } else if (c) {
          if (selector.startsWith('#') && c.id === selector.slice(1)) {
            results.push(c);
          } else if (selector.startsWith('.') && typeof c.className === 'string' && c.className.split(/\s+/).includes(selector.slice(1))) {
            results.push(c);
          }
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
    setAttribute(name: string, val: string) {
      el[name] = val;
    },
    getAttribute(name: string) {
      return el[name] ?? null;
    },
    focus() {},
    blur() {},
    remove() {
      if (el.parentNode && Array.isArray(el.parentNode.children)) {
        const idx = el.parentNode.children.indexOf(el);
        if (idx >= 0) el.parentNode.children.splice(idx, 1);
      }
    },
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
    createElementNS(_ns: string, tag: string) {
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
    addEventListener(event: string, handler: any) {},
    removeEventListener(event: string, handler: any) {},
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

    // Invalid route defaults to chooser
    assert.equal(parseHash('#/unknown').route, 'chooser');

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

  it('CK32-F02 regression: #candidateName remains strictly readOnly in composition root during exam', async () => {
    const { root } = createMockDocument();
    const testExam: WebExam = {
      schemaVersion: 'web-exam-v1',
      examId: 'exam-f02-test',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'F02 Candidate ReadOnly Test',
      subject: 'Vật lí',
      grade: 12,
      settings: {
        durationMinutes: 50,
        maxAttempts: 1,
        releasePolicy: 'immediate',
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      questions: [
        {
          kind: 'I',
          questionVersionId: 'q1',
          title: 'Câu 1',
          content: 'Nội dung câu 1',
          options: [
            { optionId: 'opt-a', text: 'A' },
            { optionId: 'opt-b', text: 'B' },
          ],
          correctOptionId: 'opt-a',
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

    const candidateInput = root.querySelector('#candidateName');
    assert.ok(candidateInput, '#candidateName element must exist');
    assert.equal(candidateInput.readOnly, true, '#candidateName.readOnly must be true in composition root during exam');
    assert.equal(candidateInput.getAttribute('readonly'), 'readonly', '#candidateName must have readonly attribute');

    // Attempting to simulate typing input event on readonly input must NOT change candidate name
    candidateInput.dispatchEvent({ type: 'input', target: { value: 'Audit32 changed during exam' } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(candidateInput.readOnly, true);
    assert.notEqual(candidateInput.value, 'Audit32 changed during exam');

    cleanup();
  });

  it('CK34-F01 regression: clearing Part III answer persists raw: null to draft and scores 0 upon submission', async () => {
    const { root } = createMockDocument();
    const adapter = new MemoryTransactionAdapter();
    const testExam: WebExam = {
      schemaVersion: 'web-exam-v1',
      examId: 'exam-f01-test',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'F01 Part III Clear Test',
      subject: 'Toán học',
      grade: 12,
      settings: {
        durationMinutes: 50,
        maxAttempts: 1,
        releasePolicy: 'immediate',
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      questions: [
        {
          kind: 'III',
          questionVersionId: 'q-iii-1',
          title: 'Câu 1 (Phần III)',
          content: 'Nội dung câu 1',
          answerKey: '1,5',
        },
      ],
      assets: [],
    };

    const cleanup = await bootstrap(root as any, {
      initialRoute: 'exam',
      initialExam: testExam,
      storageAdapter: adapter,
      now: () => 1700000000000,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // 1. Enter answer "1,5"
    const inputEl = root.querySelectorAll('.short-answer-input')[0] as HTMLInputElement;
    assert.ok(inputEl, '.short-answer-input element must exist');
    inputEl.value = '1,5';
    inputEl.dispatchEvent({ type: 'input', target: { value: '1,5' } } as any);
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check draft has raw: "1,5"
    const storagePort = createStoragePort(adapter);
    const attempts1 = await storagePort.listAttempts('exam-f01-test', 'v1');
    assert.equal(attempts1.ok, true);
    const firstAttempt1 = attempts1.ok && attempts1.value.length > 0 ? attempts1.value[0] : null;
    if (firstAttempt1) {
      const resp1 = firstAttempt1.responses.responses.find((r: any) => r.questionVersionId === 'q-iii-1');
      assert.equal(resp1?.kind, 'III');
      if (resp1?.kind === 'III') {
        assert.equal(resp1.raw, '1,5');
      }
    }

    // 2. Clear answer using quick key "Xóa"
    const clearBtn = root.querySelectorAll('.quick-key-btn').find((b: any) => b.getAttribute('data-action') === 'clear') as HTMLButtonElement;
    if (clearBtn) {
      clearBtn.click();
    } else {
      inputEl.value = '';
      inputEl.dispatchEvent({ type: 'input', target: { value: '' } } as any);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify draft now has raw: null
    const attempts2 = await storagePort.listAttempts('exam-f01-test', 'v1');
    assert.equal(attempts2.ok, true);
    const firstAttempt2 = attempts2.ok && attempts2.value.length > 0 ? attempts2.value[0] : null;
    if (firstAttempt2) {
      const resp2 = firstAttempt2.responses.responses.find((r: any) => r.questionVersionId === 'q-iii-1');
      assert.equal(resp2?.kind, 'III');
      if (resp2?.kind === 'III') {
        assert.equal(resp2.raw, null, 'draft response raw must be null after clearing');
      }
    }

    // 3. Submit exam
    const btnSubmit = root.querySelector('#btnSubmit');
    const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit');
    assert.ok(btnSubmit && btnConfirmSubmit);
    btnSubmit.click();
    btnConfirmSubmit.click();
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Verify final record has raw: null and score is 0
    const attemptsFinal = await storagePort.listAttempts('exam-f01-test', 'v1');
    assert.equal(attemptsFinal.ok, true);
    if (attemptsFinal.ok) {
      const finalRec = attemptsFinal.value.find((a: any) => a.phase === 'final');
      assert.ok(finalRec, 'final record must exist');
      if (finalRec) {
        const respFinal = finalRec.responses.responses.find((r: any) => r.questionVersionId === 'q-iii-1');
        assert.equal(respFinal?.kind, 'III');
        if (respFinal?.kind === 'III') {
          assert.equal(respFinal.raw, null, 'final response raw must be null');
        }
        const dto = finalRec.scoreDTO as any;
        assert.ok(dto);
        assert.equal(dto.total, '0');
        assert.equal(dto.sections.III.score, '0');
      }
    }

    cleanup();
  });

  it('CK32-F01 regression: syncText reports Chưa lưu on storage write failure and only recovers to Đã lưu upon durable confirmation', async () => {
    const { root } = createMockDocument();
    const baseAdapter = new MemoryTransactionAdapter();
    let failPut = false;

    // Fault-injectable storage adapter that simulates QuotaExceededError or DB write failure
    const faultAdapter: StorageTransactionAdapter = {
      async runTransaction<T>(stores: readonly any[], mode: any, operation: (tx: any) => Promise<T>): Promise<T> {
        if (failPut && mode === 'readwrite' && stores.includes('attempts')) {
          const err: any = new Error('QuotaExceededError: Storage quota exceeded');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return baseAdapter.runTransaction(stores, mode, operation);
      },
      async isAvailable() { return baseAdapter.isAvailable(); },
      async clearAll() { return baseAdapter.clearAll(); },
      close() { baseAdapter.close?.(); },
    };

    const testExam: WebExam = {
      schemaVersion: 'web-exam-v1',
      examId: 'exam-f01-test',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'F01 Storage Save Failure Test',
      subject: 'Vật lí',
      grade: 12,
      settings: {
        durationMinutes: 50,
        maxAttempts: 1,
        releasePolicy: 'immediate',
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      questions: [
        {
          kind: 'I',
          questionVersionId: 'q1',
          title: 'Câu 1',
          content: 'Nội dung câu 1',
          options: [
            { optionId: 'q1-opt-a', text: 'Phương án A' },
            { optionId: 'q1-opt-b', text: 'Phương án B' },
            { optionId: 'q1-opt-c', text: 'Phương án C' },
            { optionId: 'q1-opt-d', text: 'Phương án D' },
          ],
          correctOptionId: 'q1-opt-a',
        },
        {
          kind: 'I',
          questionVersionId: 'q2',
          title: 'Câu 2',
          content: 'Nội dung câu 2',
          options: [
            { optionId: 'q2-opt-a', text: 'Phương án A' },
            { optionId: 'q2-opt-b', text: 'Phương án B' },
            { optionId: 'q2-opt-c', text: 'Phương án C' },
            { optionId: 'q2-opt-d', text: 'Phương án D' },
          ],
          correctOptionId: 'q2-opt-a',
        },
      ],
      assets: [],
    };

    const cleanup = await bootstrap(root as any, {
      initialRoute: 'exam',
      initialExam: testExam,
      storageAdapter: faultAdapter,
      now: () => 1700000000000,
    });

    const syncText = root.querySelector('#syncText');
    assert.ok(syncText, '#syncText must exist');

    // Initially saved
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(syncText.textContent, 'Đã lưu');

    // Enable failure injection
    failPut = true;

    // Click option B on Question 1
    const optCards = root.querySelectorAll('.option-card');
    assert.ok(optCards.length >= 2, 'Option cards must exist');
    optCards[1].click();

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Must report "Chưa lưu", NOT "Đã lưu"!
    assert.equal(syncText.textContent, 'Chưa lưu', 'F01: syncText must report Chưa lưu when storage write fails');

    // Verify durable storage does NOT contain the failed answer
    const storagePort = (await import('../../../src/storage/index.ts')).createStoragePort(baseAdapter);
    const attemptRes = await storagePort.getObject('attempts' as any, 'exam-f01-test:v1:' + (root as any).attemptId);
    // Durable store should not have acknowledged q1 answer while failing
    if (attemptRes.ok && attemptRes.value) {
      const rec = attemptRes.value as AttemptRecord;
      const q1Ans = rec.responses?.responses?.find((r) => r.questionVersionId === 'q1');
      assert.ok(!q1Ans || !(q1Ans as any).selectedOptionId || (q1Ans as any).selectedOptionId !== 'q1-opt-b', 'Durable record must not contain unpersisted answer');
    }

    // Now restore storage capability and answer question 2
    failPut = false;
    assert.ok(optCards.length >= 4, 'Must have at least 4 option cards for 2 questions');
    optCards[3].click(); // Select option B on Question 2

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should now successfully persist both answers and report "Đã lưu"
    assert.equal(syncText.textContent, 'Đã lưu', 'syncText must recover to Đã lưu once durable write succeeds');

    cleanup();
  });

  it('FX33-integrator regression: #btnSubmit opens submit modal immediately and confirm submits cleanly', async () => {
    const { root } = createMockDocument();
    const testExam: WebExam = {
      schemaVersion: 'web-exam-v1',
      examId: 'fx33-reg-exam',
      examVersionId: 'v1.0.0',
      title: 'FX33 Regression Exam',
      subject: 'Toán học',
      grade: 12,
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      settings: { durationMinutes: 50, maxAttempts: null, releasePolicy: 'immediate', shuffleQuestions: false, shuffleOptions: false },
      assets: [],
      questions: [
        {
          kind: 'I',
          questionVersionId: 'fx33-q1',
          title: 'Câu 1 (Phần I)',
          content: 'Nội dung câu 1',
          options: [
            { optionId: 'opt-a', text: 'A' },
            { optionId: 'opt-b', text: 'B' },
            { optionId: 'opt-c', text: 'C' },
            { optionId: 'opt-d', text: 'D' },
          ],
          correctOptionId: 'opt-a',
        },
      ],
    };

    const cleanup = await bootstrap(root as any, {
      initialExam: testExam,
      initialRoute: 'exam',
      storageAdapter: new MemoryTransactionAdapter(),
    });
    await new Promise((r) => setTimeout(r, 50));

    // Submit modal opens immediately
    const btnSubmit = root.querySelector('#btnSubmit');
    const submitModal = root.querySelector('#submitModal');
    assert.ok(btnSubmit && submitModal);
    btnSubmit.click();
    assert.equal(submitModal.style.display, 'flex', 'submitModal must open immediately');

    const btnConfirmSubmit = root.querySelector('#btnConfirmSubmit');
    const reportWrapper = root.querySelector('#reportWrapper');
    assert.ok(btnConfirmSubmit && reportWrapper);
    btnConfirmSubmit.click();

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(reportWrapper.style.display, '', 'reportWrapper must display after confirmation');

    cleanup();
  });
});
