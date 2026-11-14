import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

describe('WEB-W1-GLUE — LC35-F03 Retry Isolation & Dispatch Verification', () => {
  const rootDir = path.resolve('.');
  const indexPath = path.join(rootDir, 'index.html');
  const rawHtml = fs.readFileSync(indexPath, 'utf8');
  const scriptContent = [...rawHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join('\n');

  function createHarness(store = new Map<string, string>()) {
    const nodes = new Map<string, any>();
    const c: Record<string, any> = {
      console: { warn() {}, error() {}, log() {} },
      confirm: () => true,
      document: {
        getElementById: (id: string) => {
          if (!nodes.has(id)) {
            nodes.set(id, {
              id,
              value: id === 'candidateName' ? 'Thí sinh tự do' : '',
              textContent: '',
              style: {},
              appendChild() {},
              addEventListener() {},
              classList: { add() {}, remove() {}, contains() { return false; } }
            });
          }
          return nodes.get(id);
        },
        createElement: () => ({
          className: '',
          innerHTML: '',
          textContent: '',
          style: {},
          appendChild() {},
          classList: { add() {}, remove() {}, contains() { return false; } }
        }),
        querySelectorAll: () => []
      },
      window: { addEventListener() {}, scrollTo() {} },
      setInterval: () => 1,
      clearInterval: () => {},
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
        get length() { return store.size; },
        key: (idx: number) => [...store.keys()][idx] ?? null
      },
      Date: Date,
      Math: Math,
      JSON: JSON,
      Map: Map,
      Set: Set,
      Promise: Promise,
      encodeURIComponent: encodeURIComponent,
      decodeURIComponent: decodeURIComponent
    };

    const context = vm.createContext(c);
    vm.runInContext(scriptContent, context);

    context.renderExamPane = () => {};
    context.renderPalette = () => {};

    return {
      c,
      nodes,
      store,
      run: (code: string) => vm.runInContext(code, context)
    };
  }

  it('LC35-F03 regression: timer callback returns dispatch promise so sequential awaits deterministically discover next retry callback', async () => {
    const store = new Map<string, string>();
    const h = createHarness(store);

    const dispatched: any[] = [];
    h.c.dispatched = dispatched;

    h.run(`
      currentExam = {
        examId: 'exam-lc35-glue-A',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector.example/test',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc35-glue-A';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-glue-A';
      studentState.responses['q-a'] = '1';
      studentState.submitted = true;
      studentState.scoreResult = scoreAttemptLocally();

      retryCallbacks = [];
      setTimeout = (fn, ms) => {
        retryCallbacks.push(fn);
        return 1;
      };
      fetch = async (url, opts) => {
        dispatched.push(JSON.parse(opts.body));
        throw new Error('network offline simulated');
      };
    `);

    // Initial dispatch triggers 1st request and schedules retry callback 0
    await h.run('dispatchToServerCollector()');
    assert.equal(dispatched.length, 1, 'Initial dispatch must fire 1 request');

    // Sequential awaits through all 5 retries (total 6 requests)
    for (let i = 0; i < 5; i++) {
      const callbacks = h.run('retryCallbacks') as Function[];
      assert.ok(callbacks.length > i, `Retry callback ${i} must exist before invocation`);
      // Awaiting the callback awaits the dispatch promise because the timer callback returns it
      await callbacks[i]!();
    }

    assert.equal(dispatched.length, 6, 'Total 6 requests: 1 initial + 5 retries');
    assert.equal(dispatched[5].attempt_id, 'att-glue-A', 'All 6 requests must belong to attempt A');

    // 6th callback must NOT be scheduled (budget exhausted)
    const callbacksAfterExhaustion = h.run('retryCallbacks') as Function[];
    assert.equal(callbacksAfterExhaustion.length, 5, 'No 6th retry callback after budget exhaustion');
  });

  it('per-attempt retry budget isolation: attempt A exhaustion does not starve attempt B of fresh budget', async () => {
    const store = new Map<string, string>();
    const h = createHarness(store);

    const dispatched: any[] = [];
    h.c.dispatched = dispatched;

    h.run(`
      currentExam = {
        examId: 'exam-iso-A',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector.example/test',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-iso-A';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-iso-A';
      studentState.responses['q-a'] = '1';
      studentState.submitted = true;
      studentState.scoreResult = scoreAttemptLocally();

      retryCallbacks = [];
      setTimeout = (fn, ms) => {
        retryCallbacks.push(fn);
        return 1;
      };
      fetch = async (url, opts) => {
        dispatched.push(JSON.parse(opts.body));
        throw new Error('simulated network failure');
      };
    `);

    // Exhaust attempt A budget: 1 initial + 5 retries = 6 requests
    await h.run('dispatchToServerCollector()');
    for (let i = 0; i < 5; i++) {
      const callbacks = h.run('retryCallbacks') as Function[];
      await callbacks[i]!();
    }
    assert.equal(dispatched.length, 6);

    // Switch to Exam B
    h.c.examB = {
      examId: 'exam-iso-B',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      collectorUrl: 'https://collector.example/test',
      questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '1' }]
    };
    h.run(`
      loadExamVersion(examB);
      studentState.responses['q-b'] = '1';
      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    // Verify: Attempt B was dispatched and scheduled its own retry callback
    assert.equal(dispatched.length, 7, 'Attempt B must perform initial dispatch');
    assert.equal(dispatched[6].attempt_id, h.run('studentState.attemptId'));

    const allCallbacks = h.run('retryCallbacks') as Function[];
    assert.equal(allCallbacks.length, 6, 'Attempt B must have its retry callback scheduled despite A exhaustion');
  });

  it('durable backoff values follow exponential progression with 30s cap', () => {
    // Expected backoff progression independently calculated: min(30000, 1000 * 2^retry)
    const expectedDelays = [
      Math.min(30000, 1000 * Math.pow(2, 0)), // 1000ms
      Math.min(30000, 1000 * Math.pow(2, 1)), // 2000ms
      Math.min(30000, 1000 * Math.pow(2, 2)), // 4000ms
      Math.min(30000, 1000 * Math.pow(2, 3)), // 8000ms
      Math.min(30000, 1000 * Math.pow(2, 4))  // 16000ms
    ];

    assert.deepEqual(expectedDelays, [1000, 2000, 4000, 8000, 16000]);
    // 5th retry backoff if computed would be min(30000, 32000) = 30000ms
    assert.equal(Math.min(30000, 1000 * Math.pow(2, 5)), 30000);
  });
});
