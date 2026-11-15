import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

describe('WEB-W1-GLUE — LC28-F01 Restore & LC27 Flush Verification', () => {
  const rootDir = path.resolve('.');
  const indexPath = path.join(rootDir, 'index.html');
  const rawHtml = fs.readFileSync(indexPath, 'utf8');
  const scriptContent = [...rawHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).join('\n');

  function createHarness(store = new Map<string, string>()) {
    const nodes = new Map<string, any>();
    const listeners: Record<string, Function[]> = {};

    function getOrCreateNode(id: string) {
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          value: id === 'candidateName' ? 'Thí sinh tự do' : '',
          textContent: '',
          innerHTML: '',
          disabled: false,
          style: {},
          appendChild() {},
          classList: {
            classes: new Set<string>(),
            add(...c: string[]) { for (const cl of c) this.classes.add(cl); },
            remove(...c: string[]) { for (const cl of c) this.classes.delete(cl); },
            contains(c: string) { return this.classes.has(c); }
          },
          addEventListener(evt: string, fn: Function) {
            const list = listeners[`${id}:${evt}`] ?? (listeners[`${id}:${evt}`] = []);
            list.push(fn);
          },
          click() {
            const fns = listeners[`${id}:click`] || [];
            for (const fn of fns) fn();
          }
        });
      }
      return nodes.get(id);
    }

    const c: Record<string, any> = {
      console: { warn() {}, error() {}, log() {} },
      confirm: () => true,
      document: {
        getElementById: (id: string) => getOrCreateNode(id),
        createElement: (tag: string) => ({
          tagName: tag.toUpperCase(),
          className: '',
          innerHTML: '',
          textContent: '',
          style: {},
          appendChild() {},
          classList: { add() {}, remove() {}, contains() { return false; } }
        }),
        querySelectorAll: () => [],
        addEventListener() {},
        removeEventListener() {}
      },
      window: {
        addEventListener() {},
        scrollTo() {}
      },
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, String(v)); },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
        get length() { return store.size; },
        key: (idx: number) => [...store.keys()][idx] ?? null
      },
      fetch: async () => ({ ok: true, json: async () => c.ex }),
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: (fn: Function) => { fn(); return 1; },
      clearTimeout: () => {},
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

  const sampleExam = {
    examId: 'exam-w1-glue',
    examVersionId: 'v1',
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    durationMinutes: 50,
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q1',
        options: [{ optionId: 'o1' }, { optionId: 'o2' }, { optionId: 'o3' }, { optionId: 'o4' }],
        correctOptionId: 'o1'
      },
      { kind: 'III', questionVersionId: 'q2', answerKey: '1' }
    ]
  };

  it('LC28-F01 reproduction and fix: overdue restore preserves saved candidate name, not default DOM input', async () => {
    const store = new Map<string, string>();

    // Step 1: Candidate starts exam, types a custom nickname, and saves state
    const h1 = createHarness(store);
    h1.c.ex = sampleExam;
    h1.run('currentExam = ex;');
    await h1.run('initExam();');
    const expectedName = 'Nguyễn An LC28 Overdue';
    h1.nodes.get('candidateName').value = expectedName;
    h1.run('syncCandidateNameFromInput(); saveLocalState();');

    const draftKey = h1.run('getStorageKey(currentExam, studentState)') as string;
    assert.ok(store.has(draftKey), 'Draft must be saved in storage');

    // Step 2: Simulate tab closed or idling until deadline has passed
    const draft = JSON.parse(store.get(draftKey)!);
    draft.startedAt = Date.now() - 3600000;
    draft.deadline = Date.now() - 60000; // 1 minute overdue
    store.set(draftKey, JSON.stringify(draft));

    // Step 3: Candidate reopens / reloads page (fresh DOM with default value 'Thí sinh tự do')
    const h2 = createHarness(store);
    h2.c.ex = sampleExam;
    h2.run('currentExam = ex;');
    assert.equal(h2.nodes.get('candidateName').value, 'Thí sinh tự do', 'Fresh DOM must start with default placeholder');

    // Step 4: initExam executes
    await h2.run('initExam();');

    // Invariant: deadline has passed -> auto-submit must have fired
    assert.equal(h2.run('studentState.submitted'), true, 'Overdue draft must auto-submit on initExam');

    // CRITICAL: candidateName must NOT be overwritten by the default DOM value
    const actualName = h2.run('studentState.candidateName');
    assert.equal(actualName, expectedName, 'Overdue auto-submit must preserve the saved candidateName');

    // Final record in storage must retain the saved candidateName
    const finalKey = h2.run('getFinalStorageKey(currentExam, studentState)') as string;
    assert.ok(store.has(finalKey), 'Final record must be saved in storage');
    const finalObj = JSON.parse(store.get(finalKey)!);
    assert.equal(finalObj.candidateName, expectedName, 'Persisted final record must retain candidateName');
  });

  it('active refresh: unexpired draft preserves saved candidate name and keeps submitted=false', async () => {
    const store = new Map<string, string>();
    const h1 = createHarness(store);
    h1.c.ex = sampleExam;
    h1.run('currentExam = ex;');
    await h1.run('initExam();');
    const activeName = 'Trần Bình Active';
    h1.nodes.get('candidateName').value = activeName;
    h1.run('syncCandidateNameFromInput(); saveLocalState();');

    // Reload with future deadline
    const h2 = createHarness(store);
    h2.c.ex = sampleExam;
    h2.run('currentExam = ex;');
    await h2.run('initExam();');

    assert.equal(h2.run('studentState.submitted'), false, 'Active draft must not be auto-submitted');
    assert.equal(h2.run('studentState.candidateName'), activeName, 'Active draft must restore saved candidateName');
    assert.equal(h2.nodes.get('candidateName').value, activeName, 'DOM input must be hydrated with saved candidateName');
  });

  it('existing final: already finalized attempt adopts final record without overwrite on reload', async () => {
    const store = new Map<string, string>();
    const h1 = createHarness(store);
    h1.c.ex = sampleExam;
    h1.run('currentExam = ex;');
    await h1.run('initExam();');
    const finalName = 'Lê Lợi Final';
    h1.nodes.get('candidateName').value = finalName;
    h1.run('studentState.responses["q1"] = "o1"; studentState.responses["q2"] = "1"; submitExam();');

    // Reload page
    const h2 = createHarness(store);
    h2.c.ex = sampleExam;
    h2.run('currentExam = ex;');
    await h2.run('initExam();');

    assert.equal(h2.run('studentState.submitted'), true, 'Final attempt must remain submitted');
    assert.equal(h2.run('studentState.candidateName'), finalName, 'Final candidateName must be preserved');
    assert.equal(h2.nodes.get('candidateName').disabled, true, 'Candidate input must be disabled after finalization');
  });

  it('overdue legacy draft restore: cunata_exam_attempt_v1 with past deadline auto-submits with legacy candidateName', async () => {
    const store = new Map<string, string>();
    const legacyDraft = {
      examId: sampleExam.examId,
      examVersionId: sampleExam.examVersionId,
      attemptId: 'attempt-sample-01',
      candidateName: 'Võ Thị Sáu Legacy',
      responses: { q1: 'o1', q2: '1' },
      deadline: Date.now() - 5000,
      startedAt: Date.now() - 60000,
      submitted: false
    };
    store.set('cunata_exam_attempt_v1', JSON.stringify(legacyDraft));

    const h = createHarness(store);
    h.c.ex = sampleExam;
    h.run('currentExam = ex;');
    await h.run('initExam();');

    assert.equal(h.run('studentState.submitted'), true, 'Expired legacy draft must auto-submit');
    assert.equal(h.run('studentState.candidateName'), 'Võ Thị Sáu Legacy', 'Legacy draft name must be preserved');
  });

  it('Unicode and HTML escaping in candidate name during overdue restore and report generation', async () => {
    const store = new Map<string, string>();
    const h1 = createHarness(store);
    h1.c.ex = sampleExam;
    h1.run('currentExam = ex;');
    await h1.run('initExam();');
    const specialName = '<script>alert("XSS")</script> & Nguyễn Ánh 12A1';
    h1.nodes.get('candidateName').value = specialName;
    h1.run('syncCandidateNameFromInput(); saveLocalState();');

    const draftKey = h1.run('getStorageKey(currentExam, studentState)') as string;
    const draft = JSON.parse(store.get(draftKey)!);
    draft.deadline = Date.now() - 1000;
    store.set(draftKey, JSON.stringify(draft));

    const h2 = createHarness(store);
    h2.c.ex = sampleExam;
    h2.run('currentExam = ex;');
    await h2.run('initExam();');

    assert.equal(h2.run('studentState.candidateName'), specialName, 'Raw candidateName preserves Unicode and symbols in state');

    const reportHtml = h2.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
    assert.equal(reportHtml.includes('<script>alert("XSS")</script>'), false, 'Raw script tags must not be unescaped in report');
    assert.ok(reportHtml.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'), 'HTML tags must be escaped');
    assert.ok(reportHtml.includes('Nguyễn Ánh 12A1'), 'Vietnamese Unicode must remain readable');
  });

  it('quota handling: storage quota exceeded during saveLocalState / submitExam sets error status and does not corrupt state', async () => {
    const store = new Map<string, string>();
    const h = createHarness(store);
    h.c.ex = sampleExam;
    h.run('currentExam = ex;');
    await h.run('initExam();');

    // Simulate quota exceeded
    h.c.localStorage.setItem = () => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    };

    h.run('saveLocalState();');
    const syncStatus = h.nodes.get('syncStatus');
    assert.ok(syncStatus.classList.contains('sync-error'), 'Quota failure must add sync-error class');
    const syncText = h.nodes.get('syncText');
    assert.ok(syncText.textContent.includes('Lỗi lưu cục bộ'), 'Quota failure must update sync text');

    // Submit with quota failure
    h.run('submitExam();');
    assert.ok(syncText.textContent.includes('Đã nộp (lỗi lưu cục bộ)'), 'Final submission with quota error must indicate submitted with storage error');
    assert.equal(h.run('studentState.submitted'), true, 'Attempt is still finalized in memory even if local storage fails');
  });

  it('LC27 flush retention: manual submit flushes current DOM input value even if changed without blur', async () => {
    const store = new Map<string, string>();
    const h = createHarness(store);
    h.c.ex = sampleExam;
    h.run('currentExam = ex;');
    await h.run('initExam();');
    h.run('studentState.candidateName = "Old Name";');
    h.nodes.get('candidateName').value = 'Phan Bội Châu Flushed';

    // Directly trigger submitExam
    h.run('submitExam();');
    assert.equal(h.run('studentState.candidateName'), 'Phan Bội Châu Flushed', 'Manual submit must flush DOM input value');

    const finalKey = h.run('getFinalStorageKey(currentExam, studentState)') as string;
    const finalObj = JSON.parse(store.get(finalKey)!);
    assert.equal(finalObj.candidateName, 'Phan Bội Châu Flushed', 'Persisted final record must reflect flushed value');
  });

  it('LC27 flush retention: deadline expiration while page open flushes current DOM input value', async () => {
    const store = new Map<string, string>();
    const h = createHarness(store);
    h.c.ex = sampleExam;
    h.run('currentExam = ex;');
    await h.run('initExam();');
    h.run('studentState.candidateName = "Old Name"; studentState.deadline = Date.now() - 100;');
    h.nodes.get('candidateName').value = 'Võ Nguyên Giáp OnTick';

    // Simulate timer check past deadline
    h.run(`
      const now = Date.now();
      if (studentState.deadline && now >= studentState.deadline && !studentState.submitted) {
        studentState.remainingSeconds = 0;
        submitExam();
      }
    `);

    assert.equal(h.run('studentState.submitted'), true);
    assert.equal(h.run('studentState.candidateName'), 'Võ Nguyên Giáp OnTick', 'Timer deadline auto-submit must flush DOM input');
  });
});
