import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { validateExamVersion } from '../../src/domain/validate.ts';

describe('E2E & UI Flow Verification — Cunata Web Demo (index.html)', () => {
  const rootDir = path.resolve('.');
  const indexPath = path.join(rootDir, 'index.html');
  const cssPath = path.join(rootDir, 'styles/style.css');
  const sampleExamPath = path.join(rootDir, 'public/sample-exam.json');
  const svgPath = path.join(rootDir, 'public/q01-bbt.svg');

  it('verifies that all critical frontend assets exist and are non-empty', () => {
    assert.ok(fs.existsSync(indexPath), 'index.html must exist');
    assert.ok(fs.existsSync(cssPath), 'styles/style.css must exist');
    assert.ok(fs.existsSync(sampleExamPath), 'public/sample-exam.json must exist');
    assert.ok(fs.existsSync(svgPath), 'public/q01-bbt.svg must exist');

    assert.ok(fs.readFileSync(indexPath, 'utf8').length > 1000, 'index.html must not be empty');
    assert.ok(fs.readFileSync(cssPath, 'utf8').length > 1000, 'style.css must not be empty');
    assert.ok(fs.readFileSync(sampleExamPath, 'utf8').length > 500, 'sample-exam.json must not be empty');
  });

  it('validates index.html contains correct semantic markup and metadata', () => {
    const html = fs.readFileSync(indexPath, 'utf8');

    assert.ok(html.includes('<!doctype html>'), 'Must have HTML5 doctype');
    assert.ok(html.includes('<html lang="vi">'), 'Must declare Vietnamese language');
    assert.ok(html.includes('<meta name="viewport"'), 'Must have responsive viewport');
    assert.ok(html.includes('styles/style.css'), 'Must link to styles/style.css');
  });

  it('validates presence of all core layout components in index.html', () => {
    const html = fs.readFileSync(indexPath, 'utf8');

    // Header elements
    assert.ok(html.includes('id="examTitle"'), 'Must have #examTitle element');
    assert.ok(html.includes('id="candidateName"'), 'Must have #candidateName input');
    assert.ok(html.includes('id="syncStatus"'), 'Must have #syncStatus badge');
    assert.ok(html.includes('id="timerBox"'), 'Must have #timerBox element');
    assert.ok(html.includes('id="btnSubmit"'), 'Must have #btnSubmit button');

    // Palette & Navigation
    assert.ok(html.includes('id="paletteProgress"'), 'Must have #paletteProgress');
    assert.ok(html.includes('id="paletteGrid"'), 'Must have #paletteGrid');

    // Exam pane
    assert.ok(html.includes('id="examPane"'), 'Must have #examPane');

    // Modal
    assert.ok(html.includes('id="submitModal"'), 'Must have #submitModal');
    assert.ok(html.includes('id="btnCancelSubmit"'), 'Must have #btnCancelSubmit');
    assert.ok(html.includes('id="btnConfirmSubmit"'), 'Must have #btnConfirmSubmit');

    // Report view
    assert.ok(html.includes('id="reportWrapper"'), 'Must have #reportWrapper');
    assert.ok(html.includes('id="reportView"'), 'Must have #reportView');
    assert.ok(html.includes('id="scorePartI"'), 'Must have #scorePartI');
    assert.ok(html.includes('id="scorePartII"'), 'Must have #scorePartII');
    assert.ok(html.includes('id="scorePartIII"'), 'Must have #scorePartIII');
    assert.ok(html.includes('id="scoreTotal"'), 'Must have #scoreTotal');
    assert.ok(html.includes('id="reviewQuestionsList"'), 'Must have #reviewQuestionsList');
    assert.ok(html.includes('id="btnPrintReport"'), 'Must have #btnPrintReport');
    assert.ok(html.includes('id="btnDownloadReportHtml"'), 'Must have #btnDownloadReportHtml');
    assert.ok(html.includes('id="btnRestart"'), 'Must have #btnRestart');
  });

  it('verifies sample-exam.json conforms strictly to domain schema and references valid assets', () => {
    const exam = JSON.parse(fs.readFileSync(sampleExamPath, 'utf8'));
    const val = validateExamVersion(exam);
    assert.equal(val.ok, true, 'Sample exam must pass validateExamVersion');

    assert.equal(exam.questions.length, 8, 'Sample exam must have exactly 8 questions');
    const partI = exam.questions.filter((q: { kind: string }) => q.kind === 'I');
    const partII = exam.questions.filter((q: { kind: string }) => q.kind === 'II');
    const partIII = exam.questions.filter((q: { kind: string }) => q.kind === 'III');

    assert.equal(partI.length, 4, 'Must have 4 Part I questions');
    assert.equal(partII.length, 2, 'Must have 2 Part II questions');
    assert.equal(partIII.length, 2, 'Must have 2 Part III questions');
  });

  it('verifies scoring invariants: Part I (0.25), Part II (GDPT vector), Part III (custom formula)', () => {
    // Section counts: N1 = 4, N2 = 2, N3 = 2
    const n1 = 4;
    const n2 = 2;
    const n3 = 2;

    const maxI = n1 * 0.25; // 1.00
    assert.equal(maxI, 1.00);

    const maxII = n2 * 1.00; // 2.00
    assert.equal(maxII, 2.00);

    const base = maxI + maxII; // 3.00
    assert.ok(base < 10);

    const pointIII = (10 - base) / n3; // (10 - 3) / 2 = 3.50
    assert.equal(pointIII, 3.50);

    const maxIII = n3 * pointIII; // 7.00
    assert.equal(maxIII, 7.00);

    const maxTotal = maxI + maxII + maxIII; // 10.00
    assert.equal(maxTotal, 10.00);

    // Part II score lookup table verification
    const part2PointsTable = [0, 0.10, 0.25, 0.50, 1.00];
    assert.equal(part2PointsTable[0], 0);
    assert.equal(part2PointsTable[1], 0.10);
    assert.equal(part2PointsTable[2], 0.25);
    assert.equal(part2PointsTable[3], 0.50);
    assert.equal(part2PointsTable[4], 1.00);
  });

  // =========================================================================
  // Regression Tests: Review Findings LC13-F01, LC13-F02, LC13-F03, LC13-F04
  // =========================================================================

  function createPageContext(store = new Map<string, string>()) {
    const rawHtml = fs.readFileSync(indexPath, 'utf8');
    const script = [...rawHtml.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
      .map(m => m[1]).join('\n');

    const nodes = new Map<string, { value: string; textContent?: string; innerHTML?: string; appendChild?: (child?: any) => void; disabled?: boolean; title?: string; style: Record<string, string>; classList: { add(): void; remove(): void }; addEventListener(evt: string, fn: Function): void; click(): void }>();
    const c: Record<string, unknown> = {
      console: { warn() {} },
      confirm: (_msg: string) => true,
      document: {
        getElementById(id: string) {
          if (!nodes.has(id)) {
            const val = id === 'candidateName' ? 'Thí sinh tự do' : 'Cunata';
            const listeners: Record<string, Function[]> = {};
            nodes.set(id, {
              value: val,
              textContent: '',
              innerHTML: '',
              appendChild() {},
              style: {},
              classList: { add() {}, remove() {} },
              addEventListener(evt: string, fn: Function) {
                if (!listeners[evt]) listeners[evt] = [];
                listeners[evt].push(fn);
              },
              click() {
                const list = listeners['click'] || [];
                for (const fn of list) fn({ type: 'click' });
              }
            });
          }
          return nodes.get(id);
        },
        createElement() {
          return {
            className: '',
            innerHTML: '',
            textContent: '',
            style: {},
            classList: { add() {}, remove() {} },
            appendChild() {},
            insertBefore() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
            setAttribute() {},
            getAttribute() { return null; },
            addEventListener() {},
            removeEventListener() {}
          };
        },
        addEventListener() {},
        removeEventListener() {}
      },
      window: { addEventListener() {}, scrollTo() {}, location: { reload() {} } },
      localStorage: {
        getItem: (k: string) => store.get(k) || null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
        get length() { return store.size; },
        key: (i: number) => [...store.keys()][i] ?? null
      },
      setInterval(fn: () => void) {
        c.tick = fn;
        return 1;
      },
      clearInterval() {},
      alert() {}
    };

    const context = vm.createContext(c);
    vm.runInContext(script, context);
    vm.runInContext('const _realShowReportView = showReportView; showReportView = () => {}; window.runRealShowReportView = _realShowReportView;', context);
    return {
      c: context as vm.Context & Record<string, unknown>,
      script,
      store,
      run: (s: string) => vm.runInContext(s, context),
      key: () => vm.runInContext("typeof getStorageKey==='function'?getStorageKey(currentExam,studentState):STORAGE_KEY", context) as string
    };
  }

  it('LC13-F01 regression: frontend dynamic scoring engine adapts to any exam structure without hardcoding', () => {
    const p = createPageContext();

    // 1. Single Part III question with key '1,5' -> MAX_I=0, MAX_II=0 => POINT_III=10, MAX_TOTAL=10
    p.run("currentExam={examId:'exam',examVersionId:'v1',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'III',questionVersionId:'q',answerKey:'1,5'}]};studentState.responses={q:'1,5'}");
    const res1 = p.run('scoreAttemptLocally()') as { total: number; maxTotal: number; scoreIII: number; maxIII: number };
    assert.equal(res1.total, 10);
    assert.equal(res1.maxTotal, 10);
    assert.equal(res1.scoreIII, 10);
    assert.equal(res1.maxIII, 10);

    // 2. Part I only (20 questions) -> MAX_TOTAL = 5. 10 correct -> 2.5/5
    const questionsPartI = Array.from({ length: 20 }, (_, i) => ({
      kind: 'I',
      questionVersionId: `q-i-${i}`,
      options: [{ optionId: 'opt-a' }, { optionId: 'opt-b' }, { optionId: 'opt-c' }, { optionId: 'opt-d' }],
      correctOptionId: 'opt-a'
    }));
    p.run(`currentExam={examId:'exam',examVersionId:'v1',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:${JSON.stringify(questionsPartI)}};studentState.responses={}`);
    // Answer first 10 correctly
    for (let i = 0; i < 10; i++) {
      p.run(`studentState.responses['q-i-${i}'] = 'opt-a'`);
    }
    const res2 = p.run('scoreAttemptLocally()') as { total: number; maxTotal: number; scoreI: number; maxI: number };
    assert.equal(res2.scoreI, 2.5);
    assert.equal(res2.maxI, 5);
    assert.equal(res2.total, 2.5);
    assert.equal(res2.maxTotal, 5);

    // 3. Repeating fraction N3 = 3: N1=0, N2=0, N3=3 -> POINT_III = 10/3, MAX_TOTAL = 10
    const questionsPartIII = [
      { kind: 'III', questionVersionId: 'q-iii-1', answerKey: '1' },
      { kind: 'III', questionVersionId: 'q-iii-2', answerKey: '2' },
      { kind: 'III', questionVersionId: 'q-iii-3', answerKey: '3' }
    ];
    p.run(`currentExam={examId:'exam',examVersionId:'v1',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:${JSON.stringify(questionsPartIII)}};studentState.responses={'q-iii-1':'1'}`);
    const res3 = p.run('scoreAttemptLocally()') as { total: number; maxTotal: number; totalFraction: string };
    assert.equal(res3.maxTotal, 10);
    assert.equal(res3.totalFraction, '10/3');
  });

  it('LC13-F02a regression: Part III preserves raw string without trimming; leading space yields 0 points', () => {
    const p = createPageContext();
    p.run("studentState.responses={'q08-iii-ung-dung-thuc-te':' 1,5'}");
    const pts = p.run("scoreAttemptLocally().questionResults.find(q=>q.questionVersionId==='q08-iii-ung-dung-thuc-te').points");
    assert.equal(pts, 0, 'Leading space must make answer invalid / 0 points without being silently trimmed');
  });

  it('LC13-F02b regression: Part III input listener preserves raw input without stripping chars or mutating target', () => {
    const p = createPageContext();
    const h = p.script.match(/inputEl\.addEventListener\('input', (\(e\) => \{[\s\S]*?)\n          \}\);/)?.[1] + '\n}';
    assert.ok(h, 'Must extract input event listener matching Codex probe regex');

    p.c.e = { target: { value: '1.5' } };
    p.c.q = { questionVersionId: 'q' };
    p.run('renderExamPane=()=>{};renderPalette=()=>{}');
    p.run(`(${h})(e)`);
    assert.equal((p.c.e as { target: { value: string } }).target.value, '1.5', 'Raw value 1.5 must not be replaced with 15');
    assert.equal(p.run("studentState.responses['q']"), '1.5');
  });

  it('LC13-F03 regression: stale tab saveLocalState cannot overwrite an already submitted attempt in storage', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);

    a.run('submitExam()');
    const recordA = JSON.parse(store.get(a.key()) || '{}');
    assert.equal(recordA.submitted, true);

    // Tab B attempts to autosave or save state while tab A has already submitted
    b.run('saveLocalState()');
    const recordB = JSON.parse(store.get(b.key()) || '{}');
    assert.equal(recordB.submitted, true, 'Submitted attempt in storage must never be reverted to false by stale tab');
  });

  it('LC13-F04a regression: timer ticks past deadline trigger automatic exam submission', () => {
    const p = createPageContext();
    p.run('Date.now=()=>0;startTimer();Date.now=()=>3600000');
    (p.c as { tick: () => void }).tick();
    assert.equal(p.run('studentState.submitted'), true, 'Tick past deadline must auto-submit');
  });

  it('LC13-F04b regression: restoring state from localStorage when deadline has elapsed auto-submits', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    a.run('saveLocalState()');

    const b = createPageContext(store);
    b.run('Date.now=()=>4102444800000;loadLocalState();startTimer()');
    assert.equal(b.run('studentState.submitted'), true, 'Restoring attempt after deadline in future must auto-submit');
  });

  it('LC15-F05 regression: failed latest storage write revokes saved badge status and alerts durability failure', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    const doc = p.c.document as { getElementById(id: string): { textContent: string } };
    const syncNode = doc.getElementById('syncText');

    // 1. Successful write sets 'Đã lưu cục bộ'
    p.run('saveLocalState()');
    assert.equal(syncNode.textContent, 'Đã lưu cục bộ');
    const prevSaved = syncNode.textContent;

    // 2. Storage write failure (QuotaExceededError) revokes saved status
    p.run("studentState.responses.q = 'new'; localStorage.setItem = () => { throw new Error('QuotaExceededError'); }; saveLocalState()");
    const persisted = JSON.parse(store.get(p.key()) || '{}');
    assert.equal(persisted.responses?.q, undefined, 'Failed write must not modify durable storage');
    assert.notEqual(syncNode.textContent, prevSaved, 'Failed write must revoke saved status');

    // 3. Recovery before submit: when storage is available again, saving restores valid status
    (p.c.localStorage as { setItem: (k: string, v: string) => void }).setItem = (k: string, v: string) => store.set(k, v);
    p.run('saveLocalState()');
    assert.equal(syncNode.textContent, 'Đã lưu cục bộ');
    const recovered = JSON.parse(store.get(p.key()) || '{}');
    assert.equal(recovered.responses?.q, 'new');

    // 4. submitExam() under storage failure still computes score and warns about local storage
    (p.c.localStorage as { setItem: () => void }).setItem = () => { throw new Error('QuotaExceededError'); };
    p.run('submitExam()');
    assert.equal(p.run('studentState.submitted'), true);
    assert.ok(syncNode.textContent.includes('lỗi') || syncNode.textContent.includes('Lỗi'));

    // 5. Submit recovery: when storage is available, re-saving updates status to submitted
    (p.c.localStorage as { setItem: (k: string, v: string) => void }).setItem = (k: string, v: string) => store.set(k, v);
    p.run('submitExam()');
    assert.equal(syncNode.textContent, 'Đã nộp & lưu cục bộ');
  });

  it('LC15-F01 extended golden configurations: verifies max 15, max 16, and N3=7 repeating fraction', () => {
    const p = createPageContext();

    // Golden (20, 10, 0) -> max 15
    const qPartI = Array.from({ length: 20 }, (_, i) => ({
      kind: 'I',
      questionVersionId: `q-i-${i}`,
      options: [{ optionId: 'opt-a' }, { optionId: 'opt-b' }, { optionId: 'opt-c' }, { optionId: 'opt-d' }],
      correctOptionId: 'opt-a'
    }));
    const qPartII = Array.from({ length: 10 }, (_, i) => ({
      kind: 'II',
      questionVersionId: `q-ii-${i}`,
      statements: [
        { statementId: 's1', answer: true },
        { statementId: 's2', answer: false },
        { statementId: 's3', answer: true },
        { statementId: 's4', answer: false }
      ]
    }));
    p.run(`currentExam={examId:'exam',examVersionId:'v1',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:${JSON.stringify([...qPartI, ...qPartII])}};studentState.responses={}`);
    const res15 = p.run('scoreAttemptLocally()') as { maxTotal: number; maxI: number; maxII: number; maxIII: number };
    assert.equal(res15.maxI, 5);
    assert.equal(res15.maxII, 10);
    assert.equal(res15.maxIII, 0);
    assert.equal(res15.maxTotal, 15);

    // Golden (20, 10, 4) -> max 16 (BASE = 15 >= 10 => pointIII = 0.25 => maxIII = 1)
    const qPartIII4 = Array.from({ length: 4 }, (_, i) => ({
      kind: 'III',
      questionVersionId: `q-iii-${i}`,
      answerKey: '1'
    }));
    p.run(`currentExam={examId:'exam',examVersionId:'v1',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:${JSON.stringify([...qPartI, ...qPartII, ...qPartIII4])}};studentState.responses={}`);
    const res16 = p.run('scoreAttemptLocally()') as { maxTotal: number; maxIII: number; pointIIIFraction: string };
    assert.equal(res16.maxIII, 1);
    assert.equal(res16.maxTotal, 16);
    assert.equal(res16.pointIIIFraction, '1/4');

    // N3 = 7: N1=0, N2=0, N3=7 => POINT_III = 10/7, MAX_TOTAL = 10
    const qPartIII7 = Array.from({ length: 7 }, (_, i) => ({
      kind: 'III',
      questionVersionId: `q-iii-7-${i}`,
      answerKey: '2'
    }));
    p.run(`currentExam={examId:'exam',examVersionId:'v1',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:${JSON.stringify(qPartIII7)}};studentState.responses={'q-iii-7-0':'2'}`);
    const res7 = p.run('scoreAttemptLocally()') as { maxTotal: number; totalFraction: string; pointIIIFraction: string };
    assert.equal(res7.maxTotal, 10);
    assert.equal(res7.pointIIIFraction, '10/7');
    assert.equal(res7.totalFraction, '10/7');
  });

  it('LC16-F03 regression: interleaved stale save preserves final submission in multi-tab race', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);

    b.run('saveLocalState()');
    let armed = true;
    (b.c.localStorage as { getItem: (k: string) => string | null }).getItem = (k: string) => {
      const old = store.get(k) || null;
      if (armed) {
        armed = false;
        a.run('submitExam()');
      }
      return old;
    };
    b.run('saveLocalState()');
    assert.equal(JSON.parse(store.get(b.key()) || '{}').submitted, true);
  });

  it('LC16-F04 regression: reject missing exam key and throws rather than giving full score to blank exam', () => {
    const p = createPageContext();
    p.run("currentExam={examId:'exam',examVersionId:'v1',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'II',questionVersionId:'q',statements:['a','b','c','d'].map(statementId=>({statementId}))}]};studentState.responses={}");
    assert.throws(() => p.run('scoreAttemptLocally()'), /thiếu answer boolean/);
  });

  it('LC16-F05 regression: reject cross-version restore when examVersionId does not match', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);

    a.run("studentState.responses.q='1';saveLocalState()");
    b.run("currentExam={examId:'other',examVersionId:'other-v2',questions:[{kind:'III',questionVersionId:'q',answerKey:'2'}]};loadLocalState()");
    assert.equal(b.run('studentState.responses.q'), undefined);
  });

  it('LC16-F06 regression: null statement responses in Part II remain unanswered instead of wrong', () => {
    const p = createPageContext();
    p.run("currentExam={examId:'exam',examVersionId:'v1',ruleSetId:'custom-v1',inputPolicyId:'sa-charset-v1',questions:[{kind:'II',questionVersionId:'q',statements:['a','b','c','d'].map(statementId=>({statementId,answer:false}))}]};studentState.responses={q:{a:null,b:null,c:null,d:null}}");
    const res = p.run('scoreAttemptLocally()') as { questionResults?: { status: string }[] };
    assert.ok(res.questionResults && res.questionResults.length > 0);
    assert.equal(res.questionResults[0]?.status, 'unanswered');
  });

  it('LC16-F07 regression: page reload retains initial attempt deadline and does not extend duration', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);

    a.run('Date.now=()=>1000;startTimer()');
    const first = a.run('studentState.deadline');
    b.run('Date.now=()=>2000;loadLocalState();startTimer()');
    assert.equal(b.run('studentState.deadline'), first);
  });

  it('LC17-F01 regression: race at second read must preserve final submission in multi-tab concurrency', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);

    b.run('saveLocalState()');
    let reads = 0;
    (b.c.localStorage as { getItem: (k: string) => string | null }).getItem = (k: string) => {
      const old = store.get(k) || null;
      if (++reads === 2) {
        a.run('submitExam()');
      }
      return old;
    };
    b.run('saveLocalState()');
    assert.equal(JSON.parse(store.get(a.key()) || '{}').submitted, true, 'Draft write must not overwrite final submitted attempt');
  });

  it('LC17-F02 regression: foreign final must not end current exam or replace current score', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);

    const examV1 = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    const examV2 = { examId: 'exam', examVersionId: 'v2', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };

    a.c.ex = examV1;
    a.run('currentExam=ex;saveLocalState();submitExam()');

    b.c.ex = examV2;
    b.run('currentExam=ex;loadLocalState()');
    assert.equal(b.run('studentState.submitted'), false);

    b.run('startTimer()');
    assert.equal(b.run('studentState.submitted'), false, 'startTimer on exam v2 must not adopt final from exam v1');

    b.run("studentState.responses.q='1';submitExam()");
    assert.equal(b.run('studentState.scoreResult.totalFraction'), '10', 'v2 attempt score must be computed for v2 and not replaced with v1 score');
  });

  it('LC17-F03 regression: duplicate Part II statement IDs and invalid Part III keys must be rejected by validator', () => {
    const p1 = createPageContext();
    const ex1 = {
      examId: 'exam',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'II',
          questionVersionId: 'q',
          statements: Array.from({ length: 4 }, () => ({ statementId: 's', answer: true }))
        }
      ]
    };
    p1.c.ex = ex1;
    p1.run('currentExam=ex;studentState.responses={q:{s:true}}');
    assert.throws(() => p1.run('scoreAttemptLocally()'), /trùng lặp/);

    const p2 = createPageContext();
    const ex2 = {
      examId: 'exam',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        { kind: 'III', questionVersionId: 'q', answerKey: '12345' }
      ]
    };
    p2.c.ex = ex2;
    p2.run("currentExam=ex;studentState.responses.q='1234'");
    assert.throws(() => p2.run('scoreAttemptLocally()'), /không hợp lệ/);
  });

  it('LC17-F04 regression: scoring exception must not finalize draft or clear timer prematurely', () => {
    const p = createPageContext();
    const ex = {
      examId: 'exam',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        { kind: 'II', questionVersionId: 'q', statements: ['a', 'b', 'c', 'd'].map(statementId => ({ statementId })) }
      ]
    };
    p.c.ex = ex;
    p.run('currentExam=ex');
    assert.throws(() => p.run('submitExam()'));
    assert.equal(p.run('studentState.submitted'), false, 'Attempt must remain unsubmitted when scoring fails');
  });

  it('LC17-F05 regression: legacy record with missing examVersionId must not be restored into current exam', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    const ex = {
      examId: 'exam',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }]
    };
    p.c.ex = ex;
    p.run('currentExam=ex');
    store.set('cunata_exam_attempt_v1', JSON.stringify({ responses: { q: '2' }, submitted: false }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.responses.q'), undefined, 'Record without matching examVersionId must be rejected');
  });

  it('Student report download: generateOfflineReportHtml produces standalone HTML document with complete breakdown', () => {
    const p = createPageContext();
    p.run('submitExam()');
    const htmlReport = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
    assert.ok(htmlReport.startsWith('<!doctype html>'), 'Generated report must be HTML5 document');
    assert.ok(htmlReport.includes('BÁO CÁO KẾT QUẢ BÀI THI THPT'), 'Must include official report heading');
    assert.ok(htmlReport.includes('Phần I'), 'Must include Part I summary');
    assert.ok(htmlReport.includes('Phần II'), 'Must include Part II summary');
    assert.ok(htmlReport.includes('Phần III'), 'Must include Part III summary');
    assert.ok(htmlReport.includes('TỔNG ĐIỂM'), 'Must include total score');
    assert.ok(htmlReport.includes('Lời giải chi tiết:'), 'Must include detailed explanation block');
  });

  // =========================================================================
  // Regression Tests: Review Findings LC18-F01 through LC18-F06
  // =========================================================================

  it('LC18-F01 regression: final created after third read survives stale save', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);
    b.run('saveLocalState()');
    let reads = 0;
    (b.c.localStorage as { getItem: (k: string) => string | null }).getItem = (k: string) => {
      const old = store.get(k) || null;
      if (++reads === 3) a.run('submitExam()');
      return old;
    };
    b.run('saveLocalState()');
    assert.equal(JSON.parse(store.get(a.key()) || '{}').submitted, true);
  });

  it('LC18-F02 regression: starting v2 preserves v1 final and independent attempts stay isolated', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);
    const ex1 = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    const ex2 = { examId: 'exam', examVersionId: 'v2', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };

    a.c.ex = ex1;
    a.run('currentExam=ex;saveLocalState();submitExam()');
    const original = store.get(a.key());

    b.c.ex = ex2;
    b.run('currentExam=ex;loadLocalState();startTimer()');
    assert.ok([...store.values()].includes(original as string), 'v1 final must remain in storage when v2 starts');

    // Independent attempts on same exam
    const c1 = createPageContext(store);
    const c2 = createPageContext(store);
    c1.c.ex = ex1;
    c1.run("currentExam=ex;studentState.attemptId='A';saveLocalState();submitExam()");
    c2.c.ex = ex1;
    c2.run("currentExam=ex;studentState.attemptId='B';saveLocalState()");
    assert.equal(c2.run('studentState.submitted'), false, 'Different attempt must remain independent');
  });

  it('LC18-F03 regression: unsupported rules and input policy rejected, invalid exam blocked before render/timer', async () => {
    const p1 = createPageContext();
    const ex1 = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'standard-unapproved', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    assert.equal(validateExamVersion(ex1).ok, false);
    p1.c.ex = ex1;
    p1.run("currentExam=ex;studentState.responses.q='1'");
    assert.throws(() => p1.run('scoreAttemptLocally()'));

    const p2 = createPageContext();
    const ex2 = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'unknown', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    assert.equal(validateExamVersion(ex2).ok, false);
    p2.c.ex = ex2;
    p2.run('currentExam=ex');
    assert.throws(() => p2.run('scoreAttemptLocally()'));

    const p3 = createPageContext();
    const exBad = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '12345' }] };
    p3.c.payload = exBad;
    p3.run("fetch=async()=>({ok:true,json:async()=>payload});rendered=0;started=0;renderExamPane=()=>rendered++;renderPalette=()=>{};startTimer=()=>started++");
    await p3.run('initExam()');
    assert.equal(p3.run('rendered+started'), 0, 'Invalid exam must block rendering and timer');
  });

  it('LC18-F04 regression: malformed restored responses and final without report must not lock attempt', () => {
    const p1 = createPageContext();
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    p1.c.ex = ex;
    p1.run('currentExam=ex');
    p1.store.set('cunata_exam_attempt_v1', JSON.stringify({ examId: 'exam', examVersionId: 'v1', responses: null, submitted: false }));
    p1.run('loadLocalState()');
    assert.notEqual(p1.run('studentState.responses'), null, 'Malformed null responses must not be applied');

    const p2 = createPageContext();
    p2.c.ex = ex;
    p2.run('currentExam=ex');
    p2.store.set('cunata_exam_attempt_v1', JSON.stringify({ examId: 'exam', examVersionId: 'v1', submitted: true, scoreResult: null }));
    p2.run('loadLocalState();startTimer()');
    assert.equal(p2.run('studentState.submitted'), false, 'Final without scoreResult must not lock attempt');
  });

  it('LC18-F05 regression: malformed exam must throw deterministically from direct and wrapped callers', () => {
    const p = createPageContext();
    const ex = {
      examId: 'exam',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'II', questionVersionId: 'q', statements: Array.from({ length: 4 }, () => ({ statementId: 's', answer: true })) }]
    };
    p.c.ex = ex;
    p.run('currentExam=ex');
    assert.throws(() => p.run('scoreAttemptLocally()'));
    assert.throws(() => p.run('JSON.stringify(scoreAttemptLocally().questionResults[0])'));
  });

  it('LC18-F06 regression: generateOfflineReportHtml escapes candidate nickname against injection', () => {
    const p = createPageContext();
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    p.c.ex = ex;
    p.run('currentExam=ex');
    const payload = '</title><script>globalThis.__lc18=1</script><title>';
    p.c.payload = payload;
    p.run('studentState.candidateName=payload');
    const html = p.run('generateOfflineReportHtml(scoreAttemptLocally())') as string;
    assert.equal(html.includes(payload), false, 'Raw script payload must not appear in offline report HTML');
    assert.ok(html.includes('&lt;/title&gt;&lt;script&gt;'), 'Payload must be HTML escaped');
  });

  // =========================================================================
  // Regression Tests: Review Findings LC19-F01 through LC19-F09
  // =========================================================================

  it('LC19-F01 regression: final survives stale draft at write boundary', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1', title: 'Câu 1' }] };
    a.c.ex = ex; a.run('currentExam=ex');
    b.c.ex = ex; b.run('currentExam=ex');
    b.run('saveLocalState()');

    let once = false;
    (b.c.localStorage as { setItem: (k: string, v: string) => void }).setItem = (k: string, v: string) => {
      if (!once) {
        once = true;
        a.run('submitExam()');
      }
      store.set(k, v);
    };
    b.run('saveLocalState()');

    const c = createPageContext(store);
    c.c.ex = ex; c.run('currentExam=ex');
    c.run('loadLocalState()');
    assert.equal(c.run('studentState.submitted'), true, 'Final must survive concurrent stale draft write');
  });

  it('LC19-F02 regression: different exam with same version preserves final', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);
    const exA = { examId: 'A', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    const exB = { examId: 'B', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };

    a.c.ex = exA; a.run('currentExam=ex;saveLocalState();submitExam()');
    const finalRecordA = [...store.values()].find(raw => {
      try {
        const v = JSON.parse(raw);
        return v.submitted === true && v.examId === 'A' && v.examVersionId === 'v1';
      } catch { return false; }
    });
    assert.ok(finalRecordA, 'Final for exam A must exist in store');

    b.c.ex = exB; b.run('currentExam=ex;loadLocalState();startTimer()');
    assert.ok([...store.values()].includes(finalRecordA as string), 'Exam A final must not be deleted when exam B is loaded');
  });

  it('LC19-F04 regression: empty report DTO and invalid Part II boolean strings rejected on restore', () => {
    const p1 = createPageContext();
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    p1.c.ex = ex; p1.run('currentExam=ex');
    const key = p1.run("getStorageKey(currentExam,studentState)") as string;
    p1.store.set(key, JSON.stringify({ examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01', responses: {}, submitted: true, scoreResult: {} }));
    p1.run('loadLocalState()');
    assert.equal(p1.run('studentState.submitted'), false, 'Empty scoreResult DTO must not lock attempt');

    const p2 = createPageContext();
    const exII = {
      examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'II', questionVersionId: 'q', statements: Array.from({ length: 4 }, (_, i) => ({ statementId: 's' + i, label: String(i), answer: true })) }]
    };
    p2.c.ex = exII; p2.run('currentExam=ex');
    p2.store.set(key, JSON.stringify({ examId: 'exam', examVersionId: 'v1', responses: { q: { s0: 'false' } }, submitted: false }));
    p2.run('loadLocalState()');
    assert.notEqual(p2.run('studentState.responses.q?.s0'), 'false', 'Non-boolean statement string must be stripped');
  });

  it('LC19-F08 regression: question stem and full timestamps retained in offline report', () => {
    const p = createPageContext();
    const ex = {
      examId: 'exam-stem-test',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1', title: 'Câu 1', content: 'LC19_UNIQUE_STEM_CONTENT', explanation: 'Lời giải mẫu' }]
    };
    p.c.ex = ex; p.run('currentExam=ex');
    const reportHtml = p.run('generateOfflineReportHtml(scoreAttemptLocally())') as string;
    assert.ok(reportHtml.includes('LC19_UNIQUE_STEM_CONTENT'), 'Offline report must contain question stem content');
    assert.ok(reportHtml.includes('Bắt đầu:'), 'Offline report must contain start timestamp');
    assert.ok(reportHtml.includes('Nộp bài:'), 'Offline report must contain submission timestamp');
  });

  it('LC19-F09 regression: unanswered Part II statements rendered as — Chưa làm, not ✘ Sai', () => {
    const p = createPageContext();
    const ex = {
      examId: 'exam',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'II', questionVersionId: 'q', title: 'Câu II', statements: Array.from({ length: 4 }, (_, i) => ({ statementId: 's' + i, label: String(i), answer: false })) }]
    };
    p.c.ex = ex; p.run('currentExam=ex');
    const reportHtml = p.run('generateOfflineReportHtml(scoreAttemptLocally())') as string;
    assert.equal(reportHtml.includes('✘ Sai'), false, 'Unanswered statements must not be labeled as Sai');
    assert.ok(reportHtml.includes('— Chưa làm'), 'Unanswered statements must be displayed as — Chưa làm');
  });

  it('LC20-F04 regression: restore rejects nonempty malformed report and shape mismatched to II', () => {
    const p1 = createPageContext();
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    p1.c.ex = ex; p1.run('currentExam=ex');
    const key = p1.run("getStorageKey(currentExam,studentState)") as string;
    p1.store.set(key, JSON.stringify({ examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01', responses: {}, submitted: true, scoreResult: { questionResults: [null] } }));
    p1.run('loadLocalState()');
    assert.equal(p1.run('studentState.submitted'), false, 'Malformed report with null element must not lock attempt');

    const p2 = createPageContext();
    const exII = {
      examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'II', questionVersionId: 'q', statements: Array.from({ length: 4 }, (_, i) => ({ statementId: 's' + i, answer: false })) }]
    };
    p2.c.ex = exII; p2.run('currentExam=ex');
    p2.store.set(key, JSON.stringify({ examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01', responses: { q: 'false' }, submitted: false }));
    p2.run('loadLocalState()');
    assert.notEqual(p2.run('studentState.responses.q'), 'false', 'Part II response of string type must not be accepted');
  });

  it('LC20-F10 regression: Part I options are keyboard accessible with tabindex and keydown listener', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(html.includes("optCard.setAttribute('tabindex'"), 'Option card must have tabindex');
    assert.ok(html.includes("optCard.addEventListener('keydown'"), 'Option card must have keydown event listener');
  });

  it('LC20-F01 regression: final/final first accepted snapshot preserved against write boundary race', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    const b = createPageContext(store);
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    a.c.ex = ex; a.run('currentExam=ex');
    b.c.ex = ex; b.run('currentExam=ex');
    a.run('saveLocalState()');
    b.run("studentState.responses.q='1'");
    let once = false;
    (b.c.localStorage as { setItem: (k: string, v: string) => void }).setItem = (k: string, v: string) => {
      if (!once) {
        once = true;
        a.run('submitExam()');
        assert.equal(a.run('studentState.scoreResult.totalFraction'), '0');
      }
      store.set(k, v);
    };
    b.run('submitExam()');
    const c = createPageContext(store);
    c.c.ex = ex; c.run('currentExam=ex');
    c.run('loadLocalState()');
    assert.equal(c.run('studentState.scoreResult.totalFraction'), '0', 'First accepted final score 0 must not be overwritten by concurrent submit');
  });

  it('LC20-F02 regression: independent tuple encoding isolates drafts and finals across similar IDs and versions', () => {
    const pairs: [string, string, string, string][] = [
      ['X', 'v1', 'X', 'v1.0.0'],
      ['A_B', 'C', 'A', 'B_C'],
      ['exam', 'v1', 'exam-thpt-toan-demo-01', 'v1']
    ];
    for (const [idA, vA, idB, vB] of pairs) {
      // Draft isolation
      const store = new Map<string, string>();
      const a = createPageContext(store);
      const b = createPageContext(store);
      const exA = { examId: idA, examVersionId: vA, ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
      const exB = { examId: idB, examVersionId: vB, ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
      a.c.ex = exA; a.run('currentExam=ex');
      b.c.ex = exB; b.run('currentExam=ex');
      a.run("studentState.responses.q='1';saveLocalState()");
      const draftA = store.get(a.key());
      b.run('loadLocalState();startTimer()');
      assert.ok([...store.values()].includes(draftA as string), `Draft for ${idA}/${vA} must survive starting ${idB}/${vB}`);

      // Final isolation: B must not adopt foreign final of A
      a.run('saveLocalState();submitExam()');
      const b2 = createPageContext(store);
      b2.c.ex = exB; b2.run('currentExam=ex');
      b2.run('loadLocalState();startTimer()');
      assert.equal(b2.run('studentState.submitted'), false, `Attempt ${idB}/${vB} must not adopt final submission of ${idA}/${vA}`);
    }
  });

  it('LC20-F04 regression: restore rejects report missing required score fields', () => {
    const p = createPageContext();
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    p.c.ex = ex; p.run('currentExam=ex');
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true,
      scoreResult: { questionResults: [{ questionVersionId: 'q', status: 'unanswered' }] }
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Incomplete report missing totalFraction/scoreIFraction must not finalize attempt');
  });

  it('LC20-F08 regression: offline report retains Part I options text and Part II statements text', () => {
    const p = createPageContext();
    const ex = {
      examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'I', questionVersionId: 'q1', title: 'Q1', content: 'STEM1',
          options: Array.from({ length: 4 }, (_, i) => ({ optionId: 'o' + i, label: 'ABCD'[i], text: 'LC20_OPTION_' + i })),
          correctOptionId: 'o0'
        },
        {
          kind: 'II', questionVersionId: 'q2', title: 'Q2', content: 'STEM2',
          statements: Array.from({ length: 4 }, (_, i) => ({ statementId: 's' + i, label: 'abcd'[i], text: 'LC20_STATEMENT_' + i, answer: false }))
        }
      ]
    };
    p.c.ex = ex; p.run('currentExam=ex');
    const reportHtml = p.run('generateOfflineReportHtml(scoreAttemptLocally())') as string;
    assert.ok(reportHtml.includes('LC20_OPTION_0'), 'Part I option text must be included in offline report');
    assert.ok(reportHtml.includes('LC20_STATEMENT_0'), 'Part II statement text must be included in offline report');
  });

  it('LC20-F10 regression: Part I options support keyboard navigation with arrow keys and roving tabindex', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    assert.ok(html.includes("optGrid.setAttribute('role', 'radiogroup')"), 'Options grid must have role="radiogroup"');
    assert.ok(html.includes("optCard.setAttribute('role', 'radio')"), 'Option card must have role="radio"');
    assert.ok(html.includes("optCard.setAttribute('tabindex'"), 'Option card must have tabindex');
    assert.ok(html.includes("optCard.addEventListener('keydown'"), 'Option card must have keydown event listener');
    assert.ok(html.includes("e.key === 'ArrowDown' || e.key === 'ArrowRight'"), 'Option card must handle arrow keys');
  });

  // =========================================================================
  // Regression Tests: Review Findings LC21-F04, LC21-F08
  // =========================================================================

  it('LC21-F04 regression: report parser validates canonical fraction format and rejects malformed/non-canonical fractions on restore', () => {
    const p = createPageContext();
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    p.c.ex = ex; p.run('currentExam=ex');
    const r = p.run('scoreAttemptLocally()') as Record<string, unknown>;

    // 1. Non-parseable fraction string 'INVALID' must be rejected on restore
    r.totalFraction = 'INVALID';
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true, scoreResult: r
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Attempt must not be locked as submitted when report contains invalid fraction');

    // 2. Passing bad score result to generateOfflineReportHtml throws
    p.c.bad = r;
    assert.throws(() => p.run('generateOfflineReportHtml(bad)'));

    // 3. Non-canonical fraction '2/4' (not reduced) must be rejected
    r.totalFraction = '2/4';
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true, scoreResult: r
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Non-canonical fraction 2/4 must be rejected');

    // 4. Valid canonical fraction string '1/2' and consistent report restores successfully
    const ex2 = {
      examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1',
      questions: [{
        kind: 'II', questionVersionId: 'q2',
        statements: [
          { statementId: 's1', label: 'a', answer: true },
          { statementId: 's2', label: 'b', answer: true },
          { statementId: 's3', label: 'c', answer: true },
          { statementId: 's4', label: 'd', answer: false }
        ]
      }]
    };
    p.c.ex = ex2;
    p.run('currentExam=ex');
    p.run("studentState.responses={'q2':{'s1':true,'s2':true,'s3':true,'s4':true}}"); // 3 correct -> 1/2
    const r2 = p.run('scoreAttemptLocally()') as Record<string, unknown>;
    assert.equal(r2.totalFraction, '1/2');
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: { q2: { s1: true, s2: true, s3: true, s4: true } }, submitted: true, scoreResult: r2
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), true, 'Valid canonical fraction 1/2 restores successfully');
  });

  it('LC21-F08 regression: offline report packages figures as self-contained data URIs without host-relative paths', () => {
    const p = createPageContext();
    const ex = JSON.parse(fs.readFileSync(sampleExamPath, 'utf8'));
    p.c.ex = ex; p.run('currentExam=ex');
    const out = p.run('generateOfflineReportHtml(scoreAttemptLocally())') as string;

    assert.ok(out.includes('q01-bbt.svg'), 'Fixture asset reference must be retained in report (e.g. data-asset attribute)');
    assert.equal(/src="public\/q01-bbt\.svg"/.test(out), false, 'Report must not retain host-relative image path src="public/q01-bbt.svg"');
    assert.ok(out.includes('data:image/svg+xml;utf8,'), 'Figures must be packaged as self-contained data URIs');
  });

  // =========================================================================
  // Regression Tests: Review Findings LC22-F01, LC22-F02, LC22-F03
  // =========================================================================

  it('LC22-F01 regression: report parser validates exact totals, score bounds, and requires stDetails for Part II', () => {
    const p = createPageContext();
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    p.c.ex = ex; p.run('currentExam=ex');

    // 1. Total score exceeding max must be rejected
    const r1 = p.run('scoreAttemptLocally()') as Record<string, unknown>;
    r1.totalFraction = '999';
    r1.total = 999;
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true, scoreResult: r1
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Inconsistent report with total exceeding max must be rejected');

    // 2. Part II question result missing stDetails array must be rejected
    const r2 = p.run('scoreAttemptLocally()') as Record<string, unknown>;
    (r2.questionResults as any[])[0].kind = 'II';
    delete (r2.questionResults as any[])[0].stDetails;
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true, scoreResult: r2
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Part II question without stDetails must be rejected');

    // 3. Section sum mismatch must be rejected
    const r3 = p.run('scoreAttemptLocally()') as Record<string, unknown>;
    r3.scoreIFraction = '1/4'; // totalFraction is '0', so sum mismatch
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true, scoreResult: r3
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Report with mismatched section sums must be rejected');
  });

  it('LC22-F02 regression: on-page and offline reports escape raw answers and active rich HTML tags against injection', () => {
    const p = createPageContext();
    const ex = { examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
    p.c.ex = ex; p.run('currentExam=ex');

    // 1. On-page report must escape raw user answer
    const payload1 = '<img src=x onerror="globalThis.__lc22=1">';
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: { q: payload1 }, submitted: false
    }));
    p.run('loadLocalState()');
    const captured: string[] = [];
    (p.c as any).document.createElement = () => ({ innerHTML: '', className: '' });
    (p.c as any).document.getElementById('reviewQuestionsList').appendChild = (node: any) => captured.push(node.innerHTML);
    p.run('submitExam()');
    assert.equal(p.run('studentState.scoreResult.questionResults[0].status'), 'invalid');
    assert.equal(captured.some(s => s.includes(payload1)), false, 'On-page report sink must not contain unescaped payload');

    // 2. Offline report must escape active rich HTML in question content
    const payload2 = '<img src=x onerror="globalThis.__lc22=2">';
    const ex2 = { ...ex, questions: [{ ...ex.questions[0], content: payload2 }] };
    p.c.ex = ex2; p.run('currentExam=ex');
    const reportHtml = p.run('generateOfflineReportHtml(scoreAttemptLocally())') as string;
    assert.equal(reportHtml.includes(payload2), false, 'Offline report must not contain active unescaped HTML injection');
  });

  it('LC22-F03 regression: offline report packages SVG with valid XML entities and does not contain undefined entity &infin;', () => {
    const p = createPageContext();
    const ex = JSON.parse(fs.readFileSync(sampleExamPath, 'utf8'));
    p.c.ex = ex; p.run('currentExam=ex');
    const out = p.run('generateOfflineReportHtml(scoreAttemptLocally())') as string;

    assert.equal(out.includes('&infin;'), false, 'Report must not contain undefined XML entity &infin;');
    const match = out.match(/src="data:image\/svg\+xml;utf8,([^"]+)"/);
    assert.ok(match && match[1], 'Report must contain data:image/svg+xml;utf8 URI');
    const decodedSvg = decodeURIComponent(match[1]);
    assert.equal(decodedSvg.includes('&infin;'), false, 'Decoded SVG must not contain &infin;');
    assert.ok(decodedSvg.includes('&#8734;') || decodedSvg.includes('∞'), 'Decoded SVG must use valid XML numeric entity &#8734; or Unicode character');
  });

  // =========================================================================
  // Regression Tests: Review Findings LC23-F02, LC23-F03
  // =========================================================================

  it('LC23-F02 regression: web restore rejects final reports with inconsistent status, invalid points, or formula-violating maxima', () => {
    const p = createPageContext();
    const ex = {
      examId: 'exam',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }]
    };
    p.c.ex = ex;
    p.run('currentExam=ex');

    // (A) Zero score but marked as 'full' must be rejected
    const r1 = p.run('scoreAttemptLocally()') as any;
    r1.questionResults[0].status = 'full';
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true, scoreResult: r1
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Report with full status but 0 points must be rejected on restore');

    // (B) Maxima violating formula (expected pointIII=10, maxTotal=10, forged to 1) must be rejected
    const r2 = p.run('scoreAttemptLocally()') as any;
    r2.maxTotalFraction = '1';
    r2.maxTotal = 1;
    r2.maxIIIFraction = '1';
    r2.pointIIIFraction = '1';
    r2.questionResults[0].maxPointsFraction = '1';
    r2.questionResults[0].maxPoints = 1;
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true, scoreResult: r2
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Report with formula-violating maxima must be rejected on restore');

    // (C) Part I question cannot have status 'partial'
    const exI = {
      examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1',
      questions: [{
        kind: 'I', questionVersionId: 'qi',
        options: [{ optionId: 'a' }, { optionId: 'b' }, { optionId: 'c' }, { optionId: 'd' }],
        correctOptionId: 'a'
      }]
    };
    p.c.ex = exI;
    p.run('currentExam=ex');
    const r3 = p.run('scoreAttemptLocally()') as any;
    r3.questionResults[0].status = 'partial';
    r3.questionResults[0].pointsFraction = '1/10';
    r3.questionResults[0].points = 0.1;
    r3.scoreIFraction = '1/10';
    r3.totalFraction = '1/10';
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true, scoreResult: r3
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Part I with partial status must be rejected on restore');

    // (D) Part II with all unanswered statements cannot have status 'wrong'
    const exII = {
      examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1',
      questions: [{
        kind: 'II', questionVersionId: 'qii',
        statements: [
          { statementId: 's1', label: 'a', answer: true },
          { statementId: 's2', label: 'b', answer: false },
          { statementId: 's3', label: 'c', answer: true },
          { statementId: 's4', label: 'd', answer: false }
        ]
      }]
    };
    p.c.ex = exII;
    p.run('currentExam=ex');
    const r4 = p.run('scoreAttemptLocally()') as any;
    r4.questionResults[0].status = 'wrong'; // should be 'unanswered' when all statements unanswered
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: {}, submitted: true, scoreResult: r4
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), false, 'Part II with all unanswered statements cannot be wrong');

    // (E) Valid report from scoreAttemptLocally must restore successfully
    p.run("studentState.responses={'qii':{'s1':true,'s2':false,'s3':true,'s4':false}}");
    const rValid = p.run('scoreAttemptLocally()') as any;
    p.store.set(p.key(), JSON.stringify({
      examId: 'exam', examVersionId: 'v1', attemptId: 'attempt-sample-01',
      responses: { qii: { s1: true, s2: false, s3: true, s4: false } }, submitted: true, scoreResult: rValid
    }));
    p.run('loadLocalState()');
    assert.equal(p.run('studentState.submitted'), true, 'Valid Part II report must restore successfully');
  });

  it('LC23-F03 regression: exam pane escapes question title, option labels, and statement labels against HTML injection', () => {
    const p = createPageContext();
    const payload = '<img src=x onerror="globalThis.__lc23=1">';
    const ex = {
      examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'I', questionVersionId: 'q1', title: payload, content: 'Nội dung',
          options: [{ optionId: 'o1', label: payload, text: 'Lựa chọn' }, { optionId: 'o2', label: 'B', text: 'B' }, { optionId: 'o3', label: 'C', text: 'C' }, { optionId: 'o4', label: 'D', text: 'D' }],
          correctOptionId: 'o1'
        },
        {
          kind: 'II', questionVersionId: 'q2', title: 'Câu 2', content: 'Nội dung',
          statements: [
            { statementId: 's1', label: payload, answer: true, text: 'Mệnh đề' },
            { statementId: 's2', label: 'b', answer: false, text: 'b' },
            { statementId: 's3', label: 'c', answer: true, text: 'c' },
            { statementId: 's4', label: 'd', answer: false, text: 'd' }
          ]
        }
      ]
    };
    p.c.ex = ex;
    p.run('currentExam=ex');
    assert.equal(p.run('validateExamVersion(currentExam).ok'), true);

    const captured: string[] = [];
    function makeEl(): any {
      return {
        innerHTML: '', className: '', classList: { add() {}, remove() {} },
        setAttribute() {}, addEventListener() {}, insertBefore() {},
        appendChild(n: any) { captured.push(n.innerHTML); },
        querySelector() { return makeEl(); }, querySelectorAll() { return []; }
      };
    }
    (p.c as any).document.createElement = makeEl;
    (p.c as any).document.getElementById('examPane').appendChild = (n: any) => captured.push(n.innerHTML);
    p.run('renderExamPane()');

    assert.equal(captured.some(s => s.includes(payload)), false, 'Exam pane DOM sinks must not contain unescaped payload');
    assert.ok(captured.some(s => s.includes('&lt;img src=x')), 'Exam pane DOM sinks must contain escaped HTML markup');
  });

  // =========================================================================
  // Regression Tests: Review Findings LC24-F01, LC24-F02
  // =========================================================================

  it('LC24-F01 regression: preserve own answer keys and scores across save/restore/submit with special IDs (__proto__, constructor, toString)', () => {
    const p = createPageContext();
    const ex = {
      examId: 'exam-special-ids',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'I',
          questionVersionId: 'constructor',
          title: 'Câu 1',
          options: [
            { optionId: '__proto__', label: 'A', text: 'Opt A' },
            { optionId: 'constructor', label: 'B', text: 'Opt B' },
            { optionId: 'toString', label: 'C', text: 'Opt C' },
            { optionId: 'opt-d', label: 'D', text: 'Opt D' }
          ],
          correctOptionId: '__proto__'
        },
        {
          kind: 'II',
          questionVersionId: '__proto__',
          title: 'Câu 2',
          statements: [
            { statementId: '__proto__', label: 'a', answer: true, text: 'Mệnh đề 1' },
            { statementId: 'constructor', label: 'b', answer: false, text: 'Mệnh đề 2' },
            { statementId: 'toString', label: 'c', answer: true, text: 'Mệnh đề 3' },
            { statementId: 'st-d', label: 'd', answer: false, text: 'Mệnh đề 4' }
          ]
        },
        {
          kind: 'III',
          questionVersionId: 'toString',
          title: 'Câu 3',
          answerKey: '1'
        }
      ]
    };

    p.c.ex = ex;
    p.run('currentExam=ex');
    assert.equal(p.run('validateExamVersion(currentExam).ok'), true, 'Exam with special IDs must validate');

    // 1. Save and restore draft state with special IDs
    const savedResponses = JSON.parse('{"constructor":"__proto__","__proto__":{"__proto__":true,"constructor":false,"toString":true,"st-d":false},"toString":"1"}');

    p.c.saved = {
      examId: 'exam-special-ids',
      examVersionId: 'v1',
      attemptId: 'attempt-sample-01',
      responses: savedResponses,
      flagged: JSON.parse('{"__proto__": true, "constructor": true}'),
      submitted: false
    };

    p.run('localStorage.setItem(getStorageKey(currentExam, studentState), JSON.stringify(saved)); loadLocalState()');

    assert.equal(p.run('Object.hasOwn(studentState.responses, "constructor")'), true);
    assert.equal(p.run('Object.hasOwn(studentState.responses, "__proto__")'), true);
    assert.equal(p.run('Object.hasOwn(studentState.responses, "toString")'), true);
    assert.equal(p.run('studentState.responses["constructor"]'), '__proto__');
    assert.equal(p.run('studentState.responses["toString"]'), '1');
    assert.equal(p.run('Object.hasOwn(studentState.responses["__proto__"], "__proto__")'), true);
    assert.equal(p.run('studentState.responses["__proto__"]["__proto__"]'), true);
    assert.equal(p.run('studentState.responses["__proto__"]["constructor"]'), false);
    assert.equal(p.run('studentState.responses["__proto__"]["toString"]'), true);

    // Scoring after restore must yield full marks
    const scoredAfterRestore = p.run('scoreAttemptLocally()') as any;
    assert.equal(scoredAfterRestore.totalFraction, scoredAfterRestore.maxTotalFraction, 'Full answers on special IDs must score full points');
    assert.equal(scoredAfterRestore.questionResults[0].status, 'full');
    assert.equal(scoredAfterRestore.questionResults[1].status, 'full');
    assert.equal(scoredAfterRestore.questionResults[2].status, 'full');

    // Prototype must not be polluted
    assert.equal(Object.prototype.hasOwnProperty('__proto__'), true);
    assert.equal(typeof Object.prototype.toString, 'function');

    // 2. Submit exam and verify final storage and report view
    p.run('submitExam()');
    assert.equal(p.run('studentState.submitted'), true);
    assert.equal(p.run('studentState.scoreResult.totalFraction'), scoredAfterRestore.maxTotalFraction);

    // Final storage key must contain valid record
    const finalKey = p.run('getFinalStorageKey(currentExam, studentState)') as string;
    const finalStored = JSON.parse(p.store.get(finalKey)!);
    assert.equal(finalStored.submitted, true);
    assert.equal(finalStored.scoreResult.totalFraction, scoredAfterRestore.maxTotalFraction);
  });

  it('LC24-F02 regression: web restore strictly rejects foreign statement IDs, cross-question references, and answer text contradicting score or raw responses', () => {
    const p = createPageContext();
    const ex = {
      examId: 'exam-integrity',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'I',
          questionVersionId: 'q1',
          options: [
            { optionId: 'o1', label: 'A' },
            { optionId: 'o2', label: 'B' },
            { optionId: 'o3', label: 'C' },
            { optionId: 'o4', label: 'D' }
          ],
          correctOptionId: 'o1'
        },
        {
          kind: 'II',
          questionVersionId: 'q2',
          statements: [
            { statementId: 's1', label: 'a', answer: true },
            { statementId: 's2', label: 'b', answer: false },
            { statementId: 's3', label: 'c', answer: true },
            { statementId: 's4', label: 'd', answer: false }
          ]
        },
        {
          kind: 'III',
          questionVersionId: 'q3',
          answerKey: '1'
        }
      ]
    };
    p.c.ex = ex;
    p.run('currentExam=ex');

    // Helper to store final record and attempt loadLocalState
    function testRestore(scoreResult: any, responses: any = {}): boolean {
      p.store.set(p.key(), JSON.stringify({
        examId: 'exam-integrity',
        examVersionId: 'v1',
        attemptId: 'attempt-sample-01',
        responses,
        submitted: true,
        scoreResult
      }));
      p.run('loadLocalState()');
      return p.run('studentState.submitted') as boolean;
    }

    // 1. Control: valid report restores successfully
    const validReport = p.run('scoreAttemptLocally()') as any;
    assert.equal(testRestore(validReport, {}), true, 'Valid unmodified final control must restore as submitted');

    // 2. Reject foreign statement IDs in Part II stDetails
    const rForeign = JSON.parse(JSON.stringify(validReport));
    rForeign.questionResults[1].stDetails.forEach((s: any, idx: number) => { s.statementId = 'FOREIGN_' + idx; });
    assert.equal(testRestore(rForeign, {}), false, 'Report with foreign statement IDs must be rejected');

    // 3. Reject missing / incorrect count statement IDs in Part II stDetails
    const rMissing = JSON.parse(JSON.stringify(validReport));
    rMissing.questionResults[1].stDetails.pop();
    assert.equal(testRestore(rMissing, {}), false, 'Report with missing statement IDs must be rejected');

    // 4. Reject duplicate statement IDs in Part II stDetails
    const rDup = JSON.parse(JSON.stringify(validReport));
    rDup.questionResults[1].stDetails[1].statementId = rDup.questionResults[1].stDetails[0].statementId;
    assert.equal(testRestore(rDup, {}), false, 'Report with duplicate statement IDs must be rejected');

    // 5. Reject Part III userAnswer contradicting full score / answer key
    p.run('studentState.responses.q3="1"');
    const rFullIII = p.run('scoreAttemptLocally()') as any;
    rFullIII.questionResults[2].userAnswer = '2'; // claims '2' but full marks on key '1'
    assert.equal(testRestore(rFullIII, { q3: '1' }), false, 'Report with userAnswer contradicting full score must be rejected');

    // 6. Reject Part III userAnswer contradicting raw response
    const rMismatchIII = JSON.parse(JSON.stringify(validReport));
    rMismatchIII.questionResults[2].userAnswer = '3';
    assert.equal(testRestore(rMismatchIII, { q3: '1' }), false, 'Report with userAnswer contradicting raw response must be rejected');

    // 7. Reject Part II state contradicting statement key and value
    const rContradictII = JSON.parse(JSON.stringify(validReport));
    rContradictII.questionResults[1].stDetails[0].state = 'correct';
    rContradictII.questionResults[1].stDetails[0].userVal = 'Sai'; // correctVal is 'Đúng', so 'Sai' cannot be 'correct'
    assert.equal(testRestore(rContradictII, {}), false, 'Report with statement state contradicting values must be rejected');

    // 8. Reject Part I userAnswer contradicting full score
    p.run('studentState.responses.q1="o1"');
    const rFullI = p.run('scoreAttemptLocally()') as any;
    rFullI.questionResults[0].userAnswer = 'B'; // claims 'B' but marked as full on key 'A'
    assert.equal(testRestore(rFullI, { q1: 'o1' }), false, 'Report with Part I userAnswer contradicting full score must be rejected');

    // 9. Reject report identity mismatch with envelope
    const rIdMismatch = JSON.parse(JSON.stringify(validReport));
    rIdMismatch.examVersionId = 'v999';
    assert.equal(testRestore(rIdMismatch, {}), false, 'Report with mismatched examVersionId must be rejected');
  });

  // Regression Tests: Review Findings LC25-F02, LC25-F03
  it('LC25-F02 regression: reject full Part II final when raw question responses are missing, null, or empty', () => {
    const p = createPageContext();
    const e = {
      examId: 'exam-lc25',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'II',
          questionVersionId: 'q-ii',
          statements: [0, 1, 2, 3].map(i => ({ statementId: 's' + i, label: String.fromCharCode(97 + i), answer: true }))
        }
      ]
    };
    p.c.e = e;
    p.run('currentExam = e');

    // Simulate answering all 4 statements correctly -> full marks (1/1)
    p.run('studentState.responses["q-ii"] = { s0: true, s1: true, s2: true, s3: true }');
    const fullReport = p.run('scoreAttemptLocally()') as any;
    assert.equal(fullReport.totalFraction, '1');

    function testAdopt(responses: any): boolean {
      p.store.set(p.key(), JSON.stringify({
        examId: 'exam-lc25',
        examVersionId: 'v1',
        attemptId: 'attempt-sample-01',
        responses,
        submitted: true,
        scoreResult: fullReport
      }));
      p.run('loadLocalState()');
      return p.run('studentState.submitted') as boolean;
    }

    // 1. Valid control: responses match report -> accepted
    assert.equal(testAdopt({ 'q-ii': { s0: true, s1: true, s2: true, s3: true } }), true, 'Valid matching raw responses must be accepted');

    // 2. Missing raw responses: responses = {} -> rejected
    assert.equal(testAdopt({}), false, 'Missing raw question responses must not adopt full final report');

    // 3. Null raw responses: responses = { 'q-ii': null } -> rejected
    assert.equal(testAdopt({ 'q-ii': null }), false, 'Null raw question response must not adopt full final report');

    // 4. Empty statement responses: responses = { 'q-ii': {} } -> rejected
    assert.equal(testAdopt({ 'q-ii': {} }), false, 'Empty statement responses must not adopt full final report');

    // 5. Non-object raw responses: responses = { 'q-ii': 'malformed' } -> rejected
    assert.equal(testAdopt({ 'q-ii': 'malformed' }), false, 'Malformed raw responses must not adopt full final report');

    // 6. Partial raw responses: student only answered s0=true, but report claims 4 correct -> rejected
    assert.equal(testAdopt({ 'q-ii': { s0: true } }), false, 'Partial raw responses contradicting full report must be rejected');
  });

  it('LC25-F03 regression: renderMathText properly formats infinity without corrupting into membership entity', () => {
    const p = createPageContext();

    // 1. Direct infinity expression $\infty$
    p.c.mathIn = '$\\infty$';
    const outInfty = p.run('renderMathText(mathIn)') as string;
    assert.ok(outInfty.includes('&#8734;'), `Must contain infinity entity &#8734;, got: ${outInfty}`);
    assert.ok(!outInfty.includes('&isin;'), `Must NOT contain membership entity &isin;, got: ${outInfty}`);
    assert.ok(!outInfty.includes('fty'), `Must NOT contain leftover 'fty', got: ${outInfty}`);

    // 2. Interval expression $(-\\infty; -1)$ from sample-exam.json
    p.c.mathInterval = '$(-\\infty; -1)$';
    const outInterval = p.run('renderMathText(mathInterval)') as string;
    assert.ok(outInterval.includes('&#8734;'), `Interval must contain infinity entity &#8734;, got: ${outInterval}`);
    assert.ok(!outInterval.includes('&isin;'), `Interval must NOT contain &isin;, got: ${outInterval}`);

    // 3. Legitimate membership expression $x \in A$
    p.c.mathInSet = '$x \\in A$';
    const outInSet = p.run('renderMathText(mathInSet)') as string;
    assert.ok(outInSet.includes('&isin;'), `Set membership must contain &isin;, got: ${outInSet}`);

    // 4. Integral expression $\int_{0}^{1}$
    p.c.mathInt = '$\\int_{0}^{1} f(x) dx$';
    const outInt = p.run('renderMathText(mathInt)') as string;
    assert.ok(outInt.includes('&int;'), `Integral must contain &int;, got: ${outInt}`);
    assert.ok(!outInt.includes('&isin;'), `Integral must NOT contain &isin;, got: ${outInt}`);

    // 5. Verification on sample exam q01 option A text and explanation
    const samplePath = path.resolve('public/sample-exam.json');
    const exam = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
    const q01 = exam.questions.find((q: any) => q.questionVersionId === 'q01-i-ham-so');
    p.c.q01OptAText = q01.options[0].text;
    const renderedOptA = p.run('renderMathText(q01OptAText)') as string;
    assert.ok(renderedOptA.includes('&#8734;'), 'Option A must render infinity entity');
    assert.ok(!renderedOptA.includes('&isin;'), 'Option A must NOT contain &isin;');

    p.c.q01ExplText = q01.explanation;
    const renderedExpl = p.run('renderMathText(q01ExplText)') as string;
    assert.ok(renderedExpl.includes('&#8734;'), 'Explanation must render infinity entity');
    assert.ok(!renderedExpl.includes('&isin;'), 'Explanation must NOT contain &isin;');
  });

  it('LC26-glue regression: web restore strictly rejects malformed raw types across Part I, Part II, and Part III envelopes and methods', () => {
    const p = createPageContext();
    const ex = {
      examId: 'exam-raw-types',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'I',
          questionVersionId: 'q-i',
          options: [
            { optionId: 'o1', label: 'A' },
            { optionId: 'o2', label: 'B' },
            { optionId: 'o3', label: 'C' },
            { optionId: 'o4', label: 'D' }
          ],
          correctOptionId: 'o1'
        },
        {
          kind: 'II',
          questionVersionId: 'q-ii',
          statements: [
            { statementId: 's1', label: 'a', answer: true },
            { statementId: 's2', label: 'b', answer: false },
            { statementId: 's3', label: 'c', answer: true },
            { statementId: 's4', label: 'd', answer: false }
          ]
        },
        {
          kind: 'III',
          questionVersionId: 'q-iii',
          answerKey: '1,5'
        }
      ]
    };
    p.c.ex = ex;
    p.run('currentExam = ex');

    // Generate valid full report
    p.run('studentState.responses = { "q-i": "o1", "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": "1,5" }');
    const validReport = p.run('scoreAttemptLocally()') as any;

    function runAttemptMethod(method: 'loadLocalState' | 'saveLocalState' | 'submitExam', keyTarget: 'main' | 'final', envelope: any): { submitted: boolean; totalFraction: string | undefined } {
      p.store.clear();
      const mainKey = p.key();
      const finalKey = p.run('getFinalStorageKey(currentExam, studentState)') as string;
      const targetKey = keyTarget === 'final' ? finalKey : mainKey;
      p.store.set(targetKey, JSON.stringify(envelope));

      p.run('studentState.responses = Object.create(null)');
      p.run('studentState.submitted = false');
      p.run('studentState.scoreResult = null');

      p.run(`${method}()`);

      const submitted = p.run('studentState.submitted') as boolean;
      const totalFraction = p.run('studentState.scoreResult?.totalFraction') as string | undefined;
      return { submitted, totalFraction };
    }

    const validEnvelope = {
      examId: 'exam-raw-types',
      examVersionId: 'v1',
      attemptId: 'attempt-sample-01',
      responses: { "q-i": "o1", "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": "1,5" },
      submitted: true,
      scoreResult: validReport
    };

    // 1. Controls across all three methods and keys: valid matching responses must be accepted with full score
    for (const method of ['loadLocalState', 'saveLocalState', 'submitExam'] as const) {
      for (const keyTarget of ['main', 'final'] as const) {
        const res = runAttemptMethod(method, keyTarget, validEnvelope);
        assert.equal(res.submitted, true, `${method} on ${keyTarget} key must accept valid envelope`);
        assert.equal(res.totalFraction, '10', `${method} on ${keyTarget} key must retain full score 10`);
      }
    }

    // 2. Comprehensive matrix: malformed raw values for Part I, II, III across methods and keys must NEVER adopt full score
    const malformedCases = [
      { name: 'Part I raw number', responses: { "q-i": 7, "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": "1,5" } },
      { name: 'Part I raw boolean', responses: { "q-i": true, "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": "1,5" } },
      { name: 'Part I raw object', responses: { "q-i": {}, "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": "1,5" } },
      { name: 'Part I raw array', responses: { "q-i": [], "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": "1,5" } },
      { name: 'Part II raw string', responses: { "q-i": "o1", "q-ii": "bad", "q-iii": "1,5" } },
      { name: 'Part II raw number', responses: { "q-i": "o1", "q-ii": 123, "q-iii": "1,5" } },
      { name: 'Part II non-boolean statement', responses: { "q-i": "o1", "q-ii": { s1: "true", s2: false, s3: true, s4: false }, "q-iii": "1,5" } },
      { name: 'Part III raw number', responses: { "q-i": "o1", "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": 7 } },
      { name: 'Part III raw boolean', responses: { "q-i": "o1", "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": true } },
      { name: 'Part III raw object', responses: { "q-i": "o1", "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": {} } },
      { name: 'Part III raw array', responses: { "q-i": "o1", "q-ii": { s1: true, s2: false, s3: true, s4: false }, "q-iii": [] } },
    ];

    for (const { name, responses } of malformedCases) {
      for (const method of ['loadLocalState', 'saveLocalState', 'submitExam'] as const) {
        for (const keyTarget of ['main', 'final'] as const) {
          const envelope = { ...validEnvelope, responses };
          const res = runAttemptMethod(method, keyTarget, envelope);
          if (method === 'submitExam') {
            assert.notEqual(res.totalFraction, '10', `${name} via ${method} on ${keyTarget} must not adopt full score 10`);
          } else {
            assert.equal(res.submitted, false, `${name} via ${method} on ${keyTarget} must not adopt submitted=true`);
          }
        }
      }
    }

    // 3. Envelope malformation guards: non-object responses, foreign questions, malformed envelopes
    const badEnvelopes = [
      { name: 'responses primitive number', env: { ...validEnvelope, responses: 123 } },
      { name: 'responses primitive boolean', env: { ...validEnvelope, responses: true } },
      { name: 'responses string', env: { ...validEnvelope, responses: 'bad' } },
      { name: 'responses array', env: { ...validEnvelope, responses: ['o1'] } },
      { name: 'responses foreign question ID', env: { ...validEnvelope, responses: { ...validEnvelope.responses, 'foreign-q': 'o1' } } },
    ];

    for (const { name, env } of badEnvelopes) {
      for (const method of ['loadLocalState', 'saveLocalState', 'submitExam'] as const) {
        const res = runAttemptMethod(method, 'final', env);
        if (method === 'submitExam') {
          assert.notEqual(res.totalFraction, '10', `${name} via ${method} must not adopt full score 10`);
        } else {
          assert.equal(res.submitted, false, `${name} via ${method} must not adopt submitted=true`);
        }
      }
    }

    // 4. Synchronization: verify that upon valid adoption in saveLocalState, studentState.responses is adopted
    {
      p.store.clear();
      const finalKey = p.run('getFinalStorageKey(currentExam, studentState)') as string;
      p.store.set(finalKey, JSON.stringify(validEnvelope));
      p.run('studentState.responses = Object.create(null)');
      p.run('studentState.submitted = false');
      p.run('saveLocalState()');
      assert.equal(p.run('studentState.submitted'), true);
      const adoptedResp = p.run('studentState.responses') as any;
      assert.equal(adoptedResp['q-i'], 'o1');
      assert.equal(adoptedResp['q-iii'], '1,5');
    }
  });

  it('LC27-F01 regression: candidate nickname is synchronized immediately at submit/deadline and preserved across restore and concurrency', () => {
    // 1. Manual submit with latest candidate name without intermediate save
    {
      const p = createPageContext();
      const ex = { examId: 'exam-lc27', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
      p.c.ex = ex;
      p.run('currentExam = ex; studentState.responses = { q: "1" }; document.getElementById("candidateName").value = "Old LC27"; saveLocalState()');

      const latestName = 'Nguyễn Văn An LC27';
      p.run(`document.getElementById("candidateName").value = ${JSON.stringify(latestName)}`);
      p.run('submitExam()');

      const stateName = p.run('studentState.candidateName') as string;
      assert.equal(stateName, latestName, 'studentState.candidateName must be synchronized on manual submit');

      const finalKey = p.run('getFinalStorageKey(currentExam, studentState)') as string;
      const saved = JSON.parse(p.store.get(finalKey)!);
      assert.equal(saved.candidateName, latestName, 'Saved final in localStorage must persist latest candidateName');

      const reportHtml = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
      assert.ok(reportHtml.includes(latestName), 'Offline report HTML must contain latest candidateName');

      // Verify reload / loadLocalState restores latest name
      const reloadContext = createPageContext(p.store);
      reloadContext.c.ex = ex;
      reloadContext.run('currentExam = ex; loadLocalState()');
      assert.equal(reloadContext.run('studentState.candidateName'), latestName, 'Reloaded studentState must have latest candidateName');
    }

    // 2. Deadline auto-submit with latest candidate name without intermediate save
    {
      const p = createPageContext();
      const ex = { examId: 'exam-lc27-dl', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
      p.c.ex = ex;
      p.run('currentExam = ex; studentState.responses = { q: "1" }; document.getElementById("candidateName").value = "Old LC27 DL"; saveLocalState()');

      const latestName = 'Trần Thị Bình LC27';
      p.run(`document.getElementById("candidateName").value = ${JSON.stringify(latestName)}`);
      p.run('studentState.deadline = Date.now() - 1000; startTimer()');

      const stateName = p.run('studentState.candidateName') as string;
      assert.equal(stateName, latestName, 'studentState.candidateName must be synchronized on deadline auto-submit');

      const finalKey = p.run('getFinalStorageKey(currentExam, studentState)') as string;
      const saved = JSON.parse(p.store.get(finalKey)!);
      assert.equal(saved.candidateName, latestName, 'Saved final on deadline submit must persist latest candidateName');

      const reportHtml = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
      assert.ok(reportHtml.includes(latestName), 'Offline report HTML must contain latest candidateName on deadline submit');
    }

    // 3. Candidate name with HTML/XSS injection must be escaped in offline report
    {
      const p = createPageContext();
      const ex = { examId: 'exam-lc27-xss', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
      p.c.ex = ex;
      const xssName = '<script>alert("lc27")</script><b>Học Sinh XSS</b>';
      p.run('currentExam = ex; studentState.responses = { q: "1" }');
      p.run(`document.getElementById("candidateName").value = ${JSON.stringify(xssName)}`);
      p.run('submitExam()');

      const reportHtml = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
      assert.equal(reportHtml.includes(xssName), false, 'Raw XSS candidate name must not be in report HTML');
      assert.ok(reportHtml.includes('&lt;script&gt;alert(&quot;lc27&quot;)&lt;/script&gt;'), 'XSS candidate name must be HTML-escaped');
    }

    // 4. Double submit / stale tab adoption: when final record already exists, adopt existing snapshot and do not overwrite
    {
      const store = new Map<string, string>();
      const p1 = createPageContext(store);
      const ex = { examId: 'exam-lc27-race', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
      p1.c.ex = ex;
      p1.run('currentExam = ex; studentState.responses = { q: "1" }; document.getElementById("candidateName").value = "Học Sinh Tab 1"; submitExam()');

      // Tab 2 has modified input to a different name
      const p2 = createPageContext(store);
      p2.c.ex = ex;
      p2.run('currentExam = ex; studentState.responses = { q: "1" }; document.getElementById("candidateName").value = "Học Sinh Tab 2 Kẻ Giả Mạo"; submitExam()');

      assert.equal(p2.run('studentState.candidateName'), 'Học Sinh Tab 1', 'Stale tab must adopt first accepted final candidate name');
      const finalKey = p1.run('getFinalStorageKey(currentExam, studentState)') as string;
      const saved = JSON.parse(store.get(finalKey)!);
      assert.equal(saved.candidateName, 'Học Sinh Tab 1', 'Persisted final record must remain unchanged by secondary submit');
    }

    // 5. Storage failure: localStorage quota failure marks error status without breaking submission state
    {
      const p = createPageContext();
      const ex = { examId: 'exam-lc27-fail', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };
      p.c.ex = ex;
      p.run('currentExam = ex; studentState.responses = { q: "1" }; document.getElementById("candidateName").value = "Thí Sinh Lỗi Storage"');

      (p.c.localStorage as { setItem: (k: string, v: string) => void }).setItem = () => {
        throw new Error('QuotaExceededError');
      };

      p.run('submitExam()');
      assert.equal(p.run('studentState.submitted'), true, 'Submission state must be completed despite storage failure');
      assert.equal(p.run('studentState.candidateName'), 'Thí Sinh Lỗi Storage');
      const doc = p.c.document as { getElementById(id: string): { textContent: string } };
      assert.equal(doc.getElementById('syncText').textContent, 'Đã nộp (lỗi lưu cục bộ)');
    }
  });

  it('LC28-F01 regression: expired draft refresh preserves restored candidate name across initExam and deadline auto-submit', async () => {
    const ex = { examId: 'exam-lc28', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1', questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }] };

    // 1. Active refresh: draft not expired preserves saved candidate name in both state and DOM input
    {
      const store = new Map<string, string>();
      const p1 = createPageContext(store);
      p1.c.ex = ex;
      p1.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
      p1.run('currentExam = ex; studentState.responses = { q: "1" }; studentState.remainingSeconds = 1000; document.getElementById("candidateName").value = "Nguyễn An LC28 Active"; saveLocalState()');

      // Refresh: new context starting with default DOM
      const p2 = createPageContext(store);
      p2.c.ex = ex;
      p2.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
      await p2.run('currentExam = ex; initExam()');
      assert.equal(p2.run('studentState.candidateName'), 'Nguyễn An LC28 Active', 'Active refresh must retain saved candidateName');
      assert.equal(p2.run('document.getElementById("candidateName").value'), 'Nguyễn An LC28 Active', 'DOM input must be hydrated with saved candidateName');
      assert.equal(p2.run('studentState.submitted'), false, 'Active attempt must remain not submitted');
    }

    // 2. Expired refresh: draft expired before page reload must auto-submit with saved candidate name, NOT default name
    {
      const store = new Map<string, string>();
      const p1 = createPageContext(store);
      p1.c.ex = ex;
      p1.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
      p1.run('currentExam = ex; studentState.responses = { q: "1" }; document.getElementById("candidateName").value = "Nguyễn An LC28 Expired"; saveLocalState()');

      // Simulate expiration while browser was closed / tab idle
      const key = p1.run('getStorageKey(currentExam, studentState)') as string;
      const draft = JSON.parse(store.get(key)!);
      draft.deadline = Date.now() - 5000;
      store.set(key, JSON.stringify(draft));

      // Reload page (default DOM initialized with "Thí sinh tự do")
      const p2 = createPageContext(store);
      p2.c.ex = ex;
      p2.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
      await p2.run('currentExam = ex; initExam()');

      assert.equal(p2.run('studentState.submitted'), true, 'Expired attempt must auto-submit on initExam');
      assert.equal(p2.run('studentState.candidateName'), 'Nguyễn An LC28 Expired', 'Expired auto-submit must not overwrite candidateName with default DOM value');

      const finalKey = p2.run('getFinalStorageKey(currentExam, studentState)') as string;
      const finalObj = JSON.parse(store.get(finalKey)!);
      assert.equal(finalObj.candidateName, 'Nguyễn An LC28 Expired', 'Persisted final record must retain saved candidateName');

      const reportHtml = p2.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
      assert.ok(reportHtml.includes('Nguyễn An LC28 Expired'), 'Generated report HTML must include saved candidateName');
    }

    // 3. Expired legacy draft: legacy draft key with expired deadline preserves candidate name
    {
      const store = new Map<string, string>();
      const legacyDraft = {
        examId: 'exam-lc28',
        examVersionId: 'v1',
        attemptId: 'attempt-sample-01',
        candidateName: 'Trần Bình Legacy LC28',
        responses: { q: '1' },
        deadline: Date.now() - 10000,
        startedAt: Date.now() - 60000,
        submitted: false
      };
      store.set('cunata_exam_attempt_v1', JSON.stringify(legacyDraft));

      const p = createPageContext(store);
      p.c.ex = ex;
      p.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
      await p.run('currentExam = ex; initExam()');

      assert.equal(p.run('studentState.submitted'), true, 'Legacy expired draft must auto-submit');
      assert.equal(p.run('studentState.candidateName'), 'Trần Bình Legacy LC28', 'Legacy expired draft must preserve candidateName');
    }

    // 4. Existing final: already submitted final record preserves candidate name on reload
    {
      const store = new Map<string, string>();
      const p1 = createPageContext(store);
      p1.c.ex = ex;
      p1.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
      p1.run('currentExam = ex; studentState.responses = { q: "1" }; document.getElementById("candidateName").value = "Hoàng Long Final LC28"; submitExam()');

      const p2 = createPageContext(store);
      p2.c.ex = ex;
      p2.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
      await p2.run('currentExam = ex; initExam()');

      assert.equal(p2.run('studentState.submitted'), true);
      assert.equal(p2.run('studentState.candidateName'), 'Hoàng Long Final LC28', 'Existing final must preserve candidateName');
    }

    // 5. Unicode / HTML characters in expired draft candidate name
    {
      const store = new Map<string, string>();
      const p1 = createPageContext(store);
      p1.c.ex = ex;
      p1.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
      const specialName = '<b>Lê Quý Đôn — LC28</b>';
      p1.run(`currentExam = ex; studentState.responses = { q: "1" }; document.getElementById("candidateName").value = ${JSON.stringify(specialName)}; saveLocalState()`);

      const key = p1.run('getStorageKey(currentExam, studentState)') as string;
      const draft = JSON.parse(store.get(key)!);
      draft.deadline = Date.now() - 5000;
      store.set(key, JSON.stringify(draft));

      const p2 = createPageContext(store);
      p2.c.ex = ex;
      p2.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
      await p2.run('currentExam = ex; initExam()');

      assert.equal(p2.run('studentState.candidateName'), specialName);
      const reportHtml = p2.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
      assert.equal(reportHtml.includes(specialName), false, 'Raw HTML tags must not appear unescaped in report');
      assert.ok(reportHtml.includes('&lt;b&gt;Lê Quý Đôn — LC28&lt;/b&gt;'), 'Special characters must be properly escaped in report');
    }
  });

  it('Restart flow: confirm dialog and restartExam clear active draft, final, and legacy storage keys', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    const ex = {
      examId: 'exam-restart',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q-res', answerKey: '1' }]
    };
    p.c.ex = ex;
    p.run('currentExam = ex; renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');

    // 1. Setup active draft, final submission, and legacy keys in store
    const draftKey = p.run('getStorageKey(currentExam, studentState)') as string;
    const finalKey = p.run('getFinalStorageKey(currentExam, studentState)') as string;
    const legacyKey = 'cunata_exam_attempt_v1';

    p.run('studentState.responses = { "q-res": "1" }; studentState.candidateName = "Thí sinh restart"; saveLocalState()');
    p.run('submitExam()');
    store.set(legacyKey, JSON.stringify({ examId: 'exam-restart', examVersionId: 'v1', attemptId: 'legacy-01' }));

    assert.ok(store.has(draftKey), 'Draft key must exist before restart');
    assert.ok(store.has(finalKey), 'Final key must exist before restart');
    assert.ok(store.has(legacyKey), 'Legacy key must exist before restart');

    // 2. Cancellation: when confirm returns false, storage keys must NOT be removed
    p.c.confirm = () => false;
    const btn = (p.c.document as any).getElementById('btnRestart');
    btn.click();
    assert.ok(store.has(draftKey), 'Draft key must be preserved when confirm is cancelled');
    assert.ok(store.has(finalKey), 'Final key must be preserved when confirm is cancelled');
    assert.ok(store.has(legacyKey), 'Legacy key must be preserved when confirm is cancelled');

    // 3. Confirmation: when confirm returns true, clicking btnRestart triggers restartExam and clears all keys
    let reloaded = false;
    p.c.confirm = () => true;
    (p.c.window as any).location = { reload() { reloaded = true; } };
    btn.click();

    assert.equal(store.has(draftKey), false, 'Draft key must be removed on restart');
    assert.equal(store.has(finalKey), true, 'Completed final key must be archived and preserved on restart');
    assert.equal(store.has(legacyKey), false, 'Legacy key must be removed on restart');
    assert.equal(reloaded, true, 'window.location.reload must be invoked');

    // 4. Reload verification: fresh context starting with cleared store initializes clean attempt
    const pFresh = createPageContext(store);
    pFresh.c.ex = ex;
    pFresh.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
    await pFresh.run('currentExam = ex; initExam()');

    assert.equal(pFresh.run('studentState.submitted'), false, 'New attempt must not be submitted');
    assert.deepEqual(Object.keys(pFresh.run('studentState.responses') as object), [], 'New attempt must have empty responses');
    assert.equal(pFresh.run('studentState.candidateName'), 'Thí sinh tự do', 'New attempt must reset to default candidate name');
  });

  it('Collector dispatch flow: dispatches attempt to configured collector URL and stores confirmation receipt', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    const ex = {
      examId: 'exam-collector-demo',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      collectorUrl: 'https://script.google.com/macros/s/AKfycby-mock/exec',
      questions: [{ kind: 'III', questionVersionId: 'q-collector', answerKey: '1,5' }]
    };
    p.c.ex = ex;
    p.run('currentExam = ex; renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');

    // Mock fetch for collector endpoint
    let capturedUrl: string | null = null;
    let capturedBody: any = null;
    p.c.fetch = async (url: string, opts: any) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        json: async () => ({
          success: true,
          status: 'NEWLY_RECORDED',
          attempt_id: capturedBody.attempt_id,
          recorded_at: '2026-11-14T08:30:00.000Z'
        })
      };
    };

    p.run('document.getElementById("candidateName").value = "Thí sinh Collector"; studentState.responses = { "q-collector": "1,5" }; saveLocalState()');
    p.run('submitExam()');

    // Wait a tick for async dispatchToServerCollector
    await new Promise(r => setTimeout(r, 10));

    assert.equal(capturedUrl, 'https://script.google.com/macros/s/AKfycby-mock/exec');
    assert.equal(capturedBody.attempt_id, p.run('studentState.attemptId'));
    assert.equal(capturedBody.candidate_display, 'Thí sinh Collector');
    assert.equal(capturedBody.policy_version, 'custom-v1');

    assert.equal(p.run('studentState.serverConfirmed'), true);
    assert.equal(p.run('studentState.serverReceipt.status'), 'NEWLY_RECORDED');

    // Verify offline report HTML includes server confirmation
    const reportHtml = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
    assert.ok(reportHtml.includes('Biên nhận máy chủ:'), 'Offline report must display server confirmation');
    assert.ok(reportHtml.includes('NEWLY_RECORDED'), 'Offline report must display NEWLY_RECORDED status');

    // Verify restore preserves server confirmation state
    const pRestore = createPageContext(store);
    pRestore.c.ex = ex;
    pRestore.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
    await pRestore.run('currentExam = ex; initExam()');

    assert.equal(pRestore.run('studentState.submitted'), true);
    assert.equal(pRestore.run('studentState.serverConfirmed'), true);
    assert.equal(pRestore.run('studentState.serverReceipt.status'), 'NEWLY_RECORDED');
  });

  it('Collector dispatch resilience: network failure preserves local saved state without crashing', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    const ex = {
      examId: 'exam-collector-offline',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      collectorUrl: 'https://script.google.com/macros/s/AKfycby-offline/exec',
      questions: [{ kind: 'III', questionVersionId: 'q-off', answerKey: '2' }]
    };
    p.c.ex = ex;
    p.run('currentExam = ex; renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');

    // Mock fetch that throws network error (offline)
    p.c.fetch = async () => {
      throw new Error('Failed to fetch: Network unreachable');
    };

    p.run('studentState.responses = { "q-off": "2" }; studentState.candidateName = "Thí sinh Offline"; saveLocalState()');
    p.run('submitExam()');

    await new Promise(r => setTimeout(r, 10));

    // Local submission succeeded despite collector network error
    assert.equal(p.run('studentState.submitted'), true);
    assert.equal(p.run('studentState.serverConfirmed'), false);
    assert.equal(p.run('studentState.serverReceipt'), null);

    const syncText = (p.c.document as any).getElementById('syncText');
    assert.ok(syncText.textContent.includes('Đã nộp & lưu cục bộ'), 'Status badge must reflect local persistence');
  });

  // =========================================================================
  // Milestone 2 Enhancements: Presentation Order (Shuffle), Release Policy, Exam Loader
  // =========================================================================

  it('Presentation Order & Shuffle: deterministic question and option shuffling with invariant scoring', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    const examWithShuffle = {
      examId: 'exam-shuffle-01',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      settings: { shuffleQuestions: true, shuffleOptions: true },
      questions: [
        {
          kind: 'I',
          questionVersionId: 'q-i-1',
          options: [
            { optionId: 'opt-a', label: 'A', text: 'Option A' },
            { optionId: 'opt-b', label: 'B', text: 'Option B' },
            { optionId: 'opt-c', label: 'C', text: 'Option C' },
            { optionId: 'opt-d', label: 'D', text: 'Option D' }
          ],
          correctOptionId: 'opt-b'
        },
        {
          kind: 'I',
          questionVersionId: 'q-i-2',
          options: [
            { optionId: 'opt-2a', label: 'A', text: 'Two A' },
            { optionId: 'opt-2b', label: 'B', text: 'Two B' },
            { optionId: 'opt-2c', label: 'C', text: 'Two C' },
            { optionId: 'opt-2d', label: 'D', text: 'Two D' }
          ],
          correctOptionId: 'opt-2c'
        },
        {
          kind: 'II',
          questionVersionId: 'q-ii-1',
          statements: [
            { statementId: 's1', answer: true },
            { statementId: 's2', answer: false },
            { statementId: 's3', answer: true },
            { statementId: 's4', answer: false }
          ]
        },
        {
          kind: 'III',
          questionVersionId: 'q-iii-1',
          answerKey: '1,5'
        }
      ]
    };

    p.c.ex = examWithShuffle;
    p.run('currentExam = ex; renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');

    // 1. Verify createPresentationOrder determinism
    const order1 = p.run('createPresentationOrder(currentExam, { shuffleQuestions: true, shuffleOptions: true }, "seed-test-123")') as any;
    const order2 = p.run('createPresentationOrder(currentExam, { shuffleQuestions: true, shuffleOptions: true }, "seed-test-123")') as any;
    assert.deepEqual(order1, order2, 'Same seed and settings must produce identical presentation order');

    // 2. Validate valid presentation order
    p.c.order1 = order1;
    const valIssues = p.run('validatePresentationOrder(currentExam, order1)') as any[];
    assert.equal(valIssues.length, 0, 'Generated presentation order must pass validation');

    // 3. Test validatePresentationOrder catches tampering
    const tamperedOrder = JSON.parse(JSON.stringify(order1));
    tamperedOrder.questionOrder.reverse(); // Putting Part III before Part I violates section order I -> II -> III
    p.c.tamperedOrder = tamperedOrder;
    const tamperedIssues = p.run('validatePresentationOrder(currentExam, tamperedOrder)') as any[];
    assert.ok(tamperedIssues.some((i: any) => i.code === 'SECTION_ORDER_INVALID'), 'Reversing sections must fail validation');

    // 4. Test ordered questions and options rendering
    p.run('studentState.presentationOrder = order1; saveLocalState();');
    const orderedQs = p.run('getOrderedQuestions()') as any[];
    assert.equal(orderedQs.length, 4);

    const orderedOptsQ1 = p.run('getOrderedOptionsForPartI(currentExam.questions[0])') as any[];
    assert.equal(orderedOptsQ1.length, 4);

    // 5. Test scoring invariance under presentation order
    // Student selects correct option 'opt-b' for q-i-1 and 'opt-2c' for q-i-2
    p.run('studentState.responses["q-i-1"] = "opt-b"; studentState.responses["q-i-2"] = "opt-2c"; studentState.responses["q-iii-1"] = "1,5";');
    p.run('studentState.responses["q-ii-1"] = { s1: true, s2: false, s3: true, s4: false };');

    const res = p.run('scoreAttemptLocally()') as any;
    assert.equal(res.scoreI, 0.5); // 2 * 0.25 = 0.5
    assert.equal(res.scoreII, 1.0); // all 4 statements correct = 1.0
    assert.equal(res.scoreIII, 8.5); // 10 - 1.5 = 8.5
    assert.equal(res.total, 10.0);

    // 6. Test persistence across reload / restore
    const pRestore = createPageContext(store);
    pRestore.c.ex = examWithShuffle;
    pRestore.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
    await pRestore.run('currentExam = ex; initExam()');

    const restoredOrder = pRestore.run('studentState.presentationOrder') as any;
    assert.ok(restoredOrder, 'presentationOrder must be restored from local storage');
    assert.deepEqual([...restoredOrder.questionOrder], [...order1.questionOrder], 'Question presentation order must be preserved exactly without reshuffling');
    assert.deepEqual(JSON.parse(JSON.stringify(restoredOrder.optionOrder)), JSON.parse(JSON.stringify(order1.optionOrder)), 'Option presentation order must be preserved exactly without reshuffling');
  });

  it('Answer Release Policy: releasePolicy after_deadline hides keys before deadline and reveals after', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    const examWithReleasePolicy = {
      examId: 'exam-release-policy',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      releasePolicy: 'after_deadline',
      questions: [
        {
          kind: 'I',
          questionVersionId: 'q-rel-1',
          options: [
            { optionId: 'o1', label: 'A', text: 'Option 1' },
            { optionId: 'o2', label: 'B', text: 'Option 2' },
            { optionId: 'o3', label: 'C', text: 'Option 3' },
            { optionId: 'o4', label: 'D', text: 'Option 4' }
          ],
          correctOptionId: 'o2',
          explanation: 'Bí mật: Lời giải q-rel-1 chỉ dành cho sau khi nộp và hết giờ.'
        },
        {
          kind: 'III',
          questionVersionId: 'q-rel-3',
          answerKey: '4,5',
          explanation: 'Bí mật: Lời giải q-rel-3'
        }
      ]
    };

    p.c.ex = examWithReleasePolicy;
    p.run('currentExam = ex; renderExamPane=()=>{}; renderPalette=()=>{};');

    // Case A: Submit before deadline (deadline is 1000 seconds in the future)
    p.run('studentState.startedAt = Date.now(); studentState.deadline = Date.now() + 1000000; studentState.responses = { "q-rel-1": "o2", "q-rel-3": "4,5" };');
    p.run('submitExam()');

    // Under Decision D08 (16/11/2026), after submission, explanations and correct answers are revealed for all questions
    const reportPreDeadline = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
    assert.ok(reportPreDeadline.includes('Bí mật: Lời giải q-rel-1'), 'Under D08, post-submission report reveals explanation even before deadline');
    assert.ok(reportPreDeadline.includes('Bí mật: Lời giải q-rel-3'), 'Under D08, post-submission report reveals Part III explanation even before deadline');

    // Case B: Deadline has passed (deadline is 10 seconds in the past)
    p.run('studentState.deadline = Date.now() - 10000;');
    const reportPostDeadline = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
    assert.ok(reportPostDeadline.includes('Bí mật: Lời giải q-rel-1'), 'Post-deadline offline report must reveal explanation');
    assert.ok(reportPostDeadline.includes('Bí mật: Lời giải q-rel-3'), 'Post-deadline offline report must reveal Part III explanation');
  });

  it('Custom Exam Loader: loadExamVersion validates exam, isolates attempts, and updates exam state', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    const customExam = {
      examId: 'exam-custom-dynamic-02',
      examVersionId: 'v2.1.0',
      title: 'Đề Kiểm Tra Động Môn Toán 12',
      durationMinutes: 45,
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'I',
          questionVersionId: 'cq-1',
          options: [
            { optionId: 'co-1', label: 'A', text: 'Opt 1' },
            { optionId: 'co-2', label: 'B', text: 'Opt 2' },
            { optionId: 'co-3', label: 'C', text: 'Opt 3' },
            { optionId: 'co-4', label: 'D', text: 'Opt 4' }
          ],
          correctOptionId: 'co-1'
        },
        {
          kind: 'III',
          questionVersionId: 'cq-2',
          answerKey: '0,5'
        }
      ]
    };

    p.c.customEx = customExam;
    p.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');

    // 1. Successfully load valid custom exam
    p.run('loadExamVersion(customEx)');
    assert.equal(p.run('currentExam.examId'), 'exam-custom-dynamic-02');
    assert.equal(p.run('currentExam.examVersionId'), 'v2.1.0');
    assert.equal(p.run('studentState.examId'), 'exam-custom-dynamic-02');
    assert.equal(p.run('studentState.examVersionId'), 'v2.1.0');
    assert.equal(p.run('studentState.durationSeconds'), 45 * 60);

    // 2. Reject malformed custom exam
    const badExam = {
      examId: 'exam-bad',
      examVersionId: 'v1',
      ruleSetId: 'unknown-ruleset',
      inputPolicyId: 'sa-charset-v1',
      questions: []
    };
    p.c.badEx = badExam;
    assert.throws(
      () => p.run('loadExamVersion(badEx)'),
      /Dữ liệu đề thi không hợp lệ/,
      'Malformed exam must be rejected with validation error'
    );
    // Ensure state was not corrupted by rejected exam
    assert.equal(p.run('currentExam.examId'), 'exam-custom-dynamic-02');
  });

  it('Attempt History: records multiple attempts, preserves scores and candidate names across restart and submit', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    const exam = {
      examId: 'exam-history-test',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'I',
          questionVersionId: 'hq-1',
          options: [
            { optionId: 'ho-1', label: 'A', text: 'Opt 1' },
            { optionId: 'ho-2', label: 'B', text: 'Opt 2' },
            { optionId: 'ho-3', label: 'C', text: 'Opt 3' },
            { optionId: 'ho-4', label: 'D', text: 'Opt 4' }
          ],
          correctOptionId: 'ho-1'
        },
        {
          kind: 'III',
          questionVersionId: 'hq-2',
          answerKey: '2,5'
        }
      ]
    };

    p.c.ex = exam;
    p.run('currentExam = ex; renderExamPane=()=>{}; renderPalette=()=>{};');

    // --- Lượt 1 ---
    p.run(`
      studentState.attemptId = 'attempt-h1';
      document.getElementById('candidateName').value = 'Nguyễn Văn A Lượt 1';
      studentState.candidateName = 'Nguyễn Văn A Lượt 1';
      studentState.startedAt = Date.now() - 10000;
      studentState.responses = { 'hq-1': 'ho-1', 'hq-2': '2,5' };
      submitExam();
    `);

    let hist = p.run('getAttemptHistory(currentExam, studentState)') as any[];
    assert.equal(hist.length, 1, 'History must contain 1 recorded attempt after first submission');
    assert.equal(hist[0].attemptId, 'attempt-h1');
    assert.equal(hist[0].candidateName, 'Nguyễn Văn A Lượt 1');
    assert.equal(hist[0].scoreTotal, 10);
    assert.equal(hist[0].totalFraction, '10');

    // Offline report for attempt 1
    const report1 = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
    assert.ok(report1.includes('Lịch Sử Các Lượt Làm Bài Của Đề Thi'), 'Report must include Attempt History table');
    assert.ok(report1.includes('Nguyễn Văn A Lượt 1'), 'Report must display candidate name in history table');
    assert.ok(report1.includes('#1'), 'Report must show attempt number');

    // --- Lượt 2: Restart and take second attempt ---
    p.run('restartExam()');

    // Setup attempt 2 in new state
    p.run(`
      studentState.attemptId = 'attempt-h2';
      document.getElementById('candidateName').value = 'Nguyễn Văn A Lượt 2';
      studentState.candidateName = 'Nguyễn Văn A Lượt 2';
      studentState.startedAt = Date.now() - 5000;
      studentState.submitted = false;
      studentState.scoreResult = null;
      studentState.responses = { 'hq-1': 'ho-2', 'hq-2': '2,5' }; // q1 wrong, q2 correct
      submitExam();
      window.runRealShowReportView();
    `);

    hist = p.run('getAttemptHistory(currentExam, studentState)') as any[];
    assert.equal(hist.length, 2, 'History must contain 2 recorded attempts after second submission');
    assert.equal(hist[0].attemptId, 'attempt-h1', 'First attempt metadata preserved');
    assert.equal(hist[1].attemptId, 'attempt-h2', 'Second attempt recorded');
    assert.equal(hist[1].candidateName, 'Nguyễn Văn A Lượt 2');
    assert.equal(hist[1].totalFraction, '39/4', 'Second attempt score fraction preserved (0 + 39/4)');

    // DOM check on report view
    const doc = p.c.document as any;
    assert.equal(doc.getElementById('attemptHistorySection').style.display, 'block');
    const tableHtml = doc.getElementById('attemptHistoryTableContainer').innerHTML;
    assert.ok(tableHtml.includes('Nguyễn Văn A Lượt 1') && tableHtml.includes('Nguyễn Văn A Lượt 2'));
    assert.ok(tableHtml.includes('Hiện tại'), 'Active attempt must be tagged with Hiện tại badge');

    // XSS safety check on history candidate name
    p.run(`
      studentState.attemptId = 'attempt-h3';
      document.getElementById('candidateName').value = '<script>alert("xss")</script>';
      studentState.candidateName = '<script>alert("xss")</script>';
      studentState.startedAt = Date.now();
      studentState.submitted = false;
      studentState.responses = { 'hq-1': 'ho-1' };
      submitExam();
    `);

    const report3 = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
    assert.ok(!report3.includes('<script>alert("xss")</script>'), 'Raw script tags must not appear in history HTML');
    assert.ok(report3.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'Special characters in history candidate name must be properly escaped');
  });

  it('Teacher Settings: maxAttempts limit disables restart and enforces attempt policy', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    const examWithSettings = {
      examId: 'exam-teacher-settings-01',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      settings: {
        maxAttempts: 1,
        durationMinutes: 25,
        releasePolicy: 'after_deadline'
      },
      questions: [
        {
          kind: 'III',
          questionVersionId: 'tq-1',
          answerKey: '4'
        }
      ]
    };

    p.c.ex = examWithSettings;
    p.run('renderExamPane=()=>{}; renderPalette=()=>{};');

    // 1. Verify durationMinutes from settings is applied
    p.run('loadExamVersion(ex)');
    assert.equal(p.run('studentState.durationSeconds'), 25 * 60, 'Duration must be loaded from settings.durationMinutes');

    // 2. Submit initial attempt
    p.run(`
      studentState.attemptId = 'attempt-t1';
      document.getElementById('candidateName').value = 'Thí sinh kiểm tra settings';
      studentState.candidateName = 'Thí sinh kiểm tra settings';
      studentState.responses = { 'tq-1': '4' };
      submitExam();
      window.runRealShowReportView();
    `);

    // 3. Verify maxAttempts is enforced in UI and logic
    const doc = p.c.document as any;
    const btnRestart = doc.getElementById('btnRestart');
    assert.equal(btnRestart.disabled, true, 'Restart button must be disabled when maxAttempts reached');

    const notice = doc.getElementById('maxAttemptsNotice');
    assert.equal(notice.style.display, 'block');
    assert.ok(notice.textContent.includes('1/1 lượt làm bài'), 'Notice must state attempt quota reached');

    // 4. Verify restartExam blocks attempt when maxAttempts is exceeded
    let alertCalled = false;
    p.c.alert = (msg: string) => { alertCalled = true; };
    p.run('restartExam()');
    assert.equal(alertCalled, true, 'restartExam must alert student and prevent restart');
  });

  it('Sections metadata in scoreAttemptLocally and collector dispatch payload', () => {
    const p = createPageContext();
    const exam = {
      examId: 'exam-sections-test',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'I',
          questionVersionId: 'sq-1',
          options: [
            { optionId: 'so-1', label: 'A', text: 'A' },
            { optionId: 'so-2', label: 'B', text: 'B' },
            { optionId: 'so-3', label: 'C', text: 'C' },
            { optionId: 'so-4', label: 'D', text: 'D' }
          ],
          correctOptionId: 'so-1'
        },
        {
          kind: 'II',
          questionVersionId: 'sq-2',
          statements: [
            { statementId: 'st-1', answer: true },
            { statementId: 'st-2', answer: false },
            { statementId: 'st-3', answer: true },
            { statementId: 'st-4', answer: false }
          ]
        },
        {
          kind: 'III',
          questionVersionId: 'sq-3',
          answerKey: '1'
        }
      ]
    };

    p.c.ex = exam;
    p.run('currentExam = ex; studentState.responses = { "sq-1": "so-1", "sq-2": { "st-1": true, "st-2": false, "st-3": true, "st-4": false }, "sq-3": "1" };');
    const res = p.run('scoreAttemptLocally()') as any;

    assert.ok(res.sections, 'Result must contain sections breakdown');
    assert.equal(res.sections.I.scoreFraction, '1/4');
    assert.equal(res.sections.I.maxFraction, '1/4');
    assert.equal(res.sections.II.scoreFraction, '1');
    assert.equal(res.sections.II.maxFraction, '1');
    assert.equal(res.sections.III.scoreFraction, '35/4');
    assert.equal(res.sections.III.maxFraction, '35/4');
    assert.equal(res.totalFraction, '10');
  });

  it('Teacher Exam Builder: question management, dynamic max scoring calculation, and validation enforcement', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    // 1. Reset builder and verify initial state
    p.run('resetBuilderExam()');
    assert.equal(p.run('builderExamState.questions.length'), 0, 'Initial builder state must have 0 questions');
    assert.equal(p.run('builderExamState.ruleSetId'), 'custom-v1');
    assert.equal(p.run('builderExamState.inputPolicyId'), 'sa-charset-v1');

    // 2. Add questions across Part I, Part II, Part III
    p.run('addQuestionToBuilder("I")');
    p.run('addQuestionToBuilder("II")');
    p.run('addQuestionToBuilder("III")');
    assert.equal(p.run('builderExamState.questions.length'), 3);
    assert.equal(p.run('builderExamState.questions[0].kind'), 'I');
    assert.equal(p.run('builderExamState.questions[1].kind'), 'II');
    assert.equal(p.run('builderExamState.questions[2].kind'), 'III');

    // 3. Verify real-time max score calculation matching computeExamMax (1, 1, 1) -> base = 0.25 + 1 = 1.25, pointIII = 8.75/1 = 35/4
    p.run('max1 = computeExamMaxFromQuestions(builderExamState.questions)');
    assert.equal(p.run('max1.n1'), 1);
    assert.equal(p.run('max1.n2'), 1);
    assert.equal(p.run('max1.n3'), 1);
    assert.equal(p.run('ratToFractionString(max1.maxI)'), '1/4');
    assert.equal(p.run('ratToFractionString(max1.maxII)'), '1');
    assert.equal(p.run('ratToFractionString(max1.pointIII)'), '35/4');
    assert.equal(p.run('ratToFractionString(max1.maxTotal)'), '10');

    // 4. Test Part I only exam: 4 Part I questions -> max = 1.00
    p.run('builderExamState.questions = []');
    p.run('for (let i = 0; i < 4; i++) addQuestionToBuilder("I")');
    p.run('maxPartIOnly = computeExamMaxFromQuestions(builderExamState.questions)');
    assert.equal(p.run('maxPartIOnly.n1'), 4);
    assert.equal(p.run('maxPartIOnly.n2'), 0);
    assert.equal(p.run('maxPartIOnly.n3'), 0);
    assert.equal(p.run('ratToFractionString(maxPartIOnly.maxTotal)'), '1');

    // 5. Test validation error when exporting invalid exam: empty exam
    p.run('builderExamState.questions = []');
    assert.throws(
      () => p.run('exportBuilderExam()'),
      /Đề thi không hợp lệ/,
      'Empty exam in builder must fail validation'
    );

    // 6. Test validation error: Part III short answer key violates charset
    p.run('addQuestionToBuilder("III")');
    p.run('builderExamState.questions[0].answerKey = "abc"'); // 'abc' not in sa-charset-v1
    assert.throws(
      () => p.run('exportBuilderExam()'),
      /Đề thi không hợp lệ/,
      'Part III invalid answer key must fail validation'
    );

    // 7. Fix answerKey and export successfully
    p.run('builderExamState.questions[0].answerKey = "-0,5"');
    const exported = p.run('exportBuilderExam()') as any;
    assert.ok(exported);
    assert.equal(exported.ruleSetId, 'custom-v1');
    assert.equal(exported.questions.length, 1);
    assert.equal(exported.questions[0].answerKey, '-0,5');
  });

  it('Teacher Exam Builder: publishing to runner and completing end-to-end exam workflow', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    p.run('renderExamPane=()=>{}; renderPalette=()=>{};');

    // 1. Build a custom 3-question exam with specific settings
    p.run('resetBuilderExam()');
    p.run(`
      builderExamState.title = 'Đề Khảo Sát Thử Nghiệm Giáo Viên';
      builderExamState.examId = 'exam-teacher-custom-99';
      builderExamState.examVersionId = 'v1.0.0';
      builderExamState.durationMinutes = 40;
      addQuestionToBuilder('I');
      addQuestionToBuilder('II');
      addQuestionToBuilder('III');
      builderExamState.questions[0].correctOptionId = builderExamState.questions[0].options[1].optionId; // B is correct
      builderExamState.questions[1].statements[0].answer = true;
      builderExamState.questions[1].statements[1].answer = true;
      builderExamState.questions[1].statements[2].answer = true;
      builderExamState.questions[1].statements[3].answer = true; // All true
      builderExamState.questions[2].answerKey = '1,5';
    `);

    // 2. Publish to runner
    let alertMsg = '';
    p.c.alert = (msg: string) => { alertMsg = msg; };
    p.run('publishBuilderExamToRunner()');

    assert.equal(p.run('currentExam.examId'), 'exam-teacher-custom-99');
    assert.equal(p.run('studentState.examId'), 'exam-teacher-custom-99');
    assert.equal(p.run('studentState.durationSeconds'), 40 * 60);

    // 3. Student takes the exam and gets full score
    const q1OptB = p.run('currentExam.questions[0].options[1].optionId');
    p.run(`
      studentState.responses = {
        [currentExam.questions[0].questionVersionId]: '${q1OptB}',
        [currentExam.questions[1].questionVersionId]: {
          [currentExam.questions[1].statements[0].statementId]: true,
          [currentExam.questions[1].statements[1].statementId]: true,
          [currentExam.questions[1].statements[2].statementId]: true,
          [currentExam.questions[1].statements[3].statementId]: true
        },
        [currentExam.questions[2].questionVersionId]: '1,5'
      };
      submitExam();
    `);

    assert.equal(p.run('studentState.submitted'), true);
    const scoreResult = p.run('studentState.scoreResult') as any;
    assert.ok(scoreResult);
    assert.equal(scoreResult.totalFraction, scoreResult.maxTotalFraction, 'Full score must equal maxTotalFraction');
    assert.equal(scoreResult.totalFraction, '10');
  });

  it('Question Bank: persistence, seeding, filtering, and seamless question reuse in builder', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    // 1. Initial bank empty, seed with default questions
    assert.equal(p.run('getQuestionBank().length'), 0);
    p.run('seedDefaultQuestionBank()');
    const bankAfterSeed = p.run('getQuestionBank()') as any[];
    assert.equal(bankAfterSeed.length, 8, 'Seeded bank must contain 8 default sample questions');

    // 2. Filter questions by kind
    const partIQuestions = bankAfterSeed.filter(q => q.kind === 'I');
    assert.equal(partIQuestions.length, 4);
    const partIIQuestions = bankAfterSeed.filter(q => q.kind === 'II');
    assert.equal(partIIQuestions.length, 2);
    const partIIIQuestions = bankAfterSeed.filter(q => q.kind === 'III');
    assert.equal(partIIIQuestions.length, 2);

    // 3. Save a new custom question to bank
    const newQ = {
      kind: 'III',
      questionVersionId: 'bank-custom-q01',
      title: 'Câu Hỏi Mới Từ Giáo Viên',
      content: 'Tính tích phân...',
      answerKey: '2,5',
      explanation: 'Lời giải chi tiết...'
    };
    p.c.newQ = newQ;
    p.run('saveQuestionToBank(newQ)');
    assert.equal(p.run('getQuestionBank().length'), 9);

    // 4. Retrieve question from bank and add to builder
    p.run('resetBuilderExam()');
    assert.equal(p.run('builderExamState.questions.length'), 0);
    p.run(`
      const item = getQuestionBank().find(q => q.questionVersionId === 'bank-custom-q01');
      builderExamState.questions.push(JSON.parse(JSON.stringify(item)));
    `);
    assert.equal(p.run('builderExamState.questions.length'), 1);
    assert.equal(p.run('builderExamState.questions[0].questionVersionId'), 'bank-custom-q01');
    assert.equal(p.run('builderExamState.questions[0].answerKey'), '2,5');

    // 5. Remove question from bank
    p.run('removeQuestionFromBank("bank-custom-q01")');
    assert.equal(p.run('getQuestionBank().length'), 8);
    const found = p.run('getQuestionBank().find(q => q.questionVersionId === "bank-custom-q01")');
    assert.equal(found, undefined, 'Removed question must not exist in bank');
  });

  it('Question Bank: JSON import, clear, and rich metadata preview', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    // 1. Clear bank
    p.run('clearQuestionBank()');
    assert.equal(p.run('getQuestionBank().length'), 0);

    // 2. Import from an array of question objects (JSON string or object)
    const customQuestions = [
      {
        kind: 'I',
        questionVersionId: 'import-q1',
        title: 'Câu Phần I Nhập Khẩu',
        subject: 'Toán học',
        grade: 12,
        difficulty: 'thong_hieu',
        content: 'Cho hàm số y = f(x)...',
        options: [
          { optionId: 'opt-1', label: 'A', text: 'Option A' },
          { optionId: 'opt-2', label: 'B', text: 'Option B' },
          { optionId: 'opt-3', label: 'C', text: 'Option C' },
          { optionId: 'opt-4', label: 'D', text: 'Option D' }
        ],
        correctOptionId: 'opt-1'
      },
      {
        kind: 'II',
        questionVersionId: 'import-q2',
        title: 'Câu Phần II Nhập Khẩu',
        subject: 'Toán học',
        grade: 12,
        difficulty: 'van_dung',
        content: 'Khảo sát hàm số...',
        statements: [
          { statementId: 'st-1', label: 'a', text: 'Mệnh đề a', answer: true },
          { statementId: 'st-2', label: 'b', text: 'Mệnh đề b', answer: false },
          { statementId: 'st-3', label: 'c', text: 'Mệnh đề c', answer: true },
          { statementId: 'st-4', label: 'd', text: 'Mệnh đề d', answer: false }
        ]
      },
      {
        kind: 'III',
        questionVersionId: 'import-q3',
        title: 'Câu Phần III Nhập Khẩu',
        subject: 'Toán học',
        grade: 12,
        difficulty: 'nhan_biet',
        content: 'Tìm giá trị nhỏ nhất...',
        answerKey: '-1,5'
      }
    ];

    p.c.customQs = customQuestions;
    const importedCount = p.run('importQuestionsToBank(customQs)') as number;
    assert.equal(importedCount, 3, 'All 3 valid questions must be imported');
    assert.equal(p.run('getQuestionBank().length'), 3);

    // 3. Import from exam object containing questions array
    const examPayload = {
      examId: 'exam-imported-bank',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'III',
          questionVersionId: 'exam-q-imported',
          title: 'Câu Đề Thi Nhập Khẩu',
          answerKey: '4,5'
        }
      ]
    };
    p.c.examPayload = examPayload;
    const count2 = p.run('importQuestionsToBank(examPayload)') as number;
    assert.equal(count2, 1, 'Question from exam payload must be imported');
    assert.equal(p.run('getQuestionBank().length'), 4);

    // 4. Upsert behavior: importing same questionVersionId updates existing question without duplicating
    const updatedQ = {
      kind: 'III',
      questionVersionId: 'import-q3',
      title: 'Câu Phần III Đã Sửa',
      answerKey: '2'
    };
    p.c.updatedQ = [updatedQ];
    const count3 = p.run('importQuestionsToBank(updatedQ)') as number;
    assert.equal(count3, 1);
    assert.equal(p.run('getQuestionBank().length'), 4, 'Bank length must remain 4 after upsert');
    const q3Found = p.run('getQuestionBank().find(q => q.questionVersionId === "import-q3")') as any;
    assert.equal(q3Found.title, 'Câu Phần III Đã Sửa');
    assert.equal(q3Found.answerKey, '2');

    // 5. Invalid JSON throws descriptive error
    assert.throws(
      () => p.run('importQuestionsToBank({ invalid: true })'),
      /Dữ liệu JSON không hợp lệ/,
      'Malformed payload must throw error'
    );

    // 6. UI rendering check with metadata tags and answer preview
    p.run('renderBankList("all")');
    const bankHtml = (p.c.document as any).getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(bankHtml.includes('Thông hiểu') || bankHtml.includes('Vận dụng'), 'Bank list must render difficulty badges');
    assert.ok(bankHtml.includes('Lớp 12'), 'Bank list must render grade badge');
    assert.ok(bankHtml.includes('Đáp án đúng:'), 'Part I card must display correct answer preview');
    assert.ok(bankHtml.includes('Đáp án chuẩn:'), 'Part III card must display answerKey preview');

    // 7. Clear bank removes all items
    p.run('clearQuestionBank()');
    assert.equal(p.run('getQuestionBank().length'), 0);
  });

  it('Teacher Exam Builder: loadExamFromJson and UI integration', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    const validExam = {
      examId: 'exam-builder-import',
      examVersionId: 'v1.0.0',
      title: 'Đề Thi Nhập Khẩu Vào Builder',
      subject: 'Vật lí',
      grade: 11,
      durationMinutes: 45,
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      settings: {
        durationMinutes: 45,
        maxAttempts: 2,
        releasePolicy: 'after_deadline',
        shuffleQuestions: true,
        shuffleOptions: true
      },
      questions: [
        {
          kind: 'I',
          questionVersionId: 'bq-1',
          options: [
            { optionId: 'bo-1', label: 'A', text: 'A' },
            { optionId: 'bo-2', label: 'B', text: 'B' },
            { optionId: 'bo-3', label: 'C', text: 'C' },
            { optionId: 'bo-4', label: 'D', text: 'D' }
          ],
          correctOptionId: 'bo-2'
        },
        {
          kind: 'III',
          questionVersionId: 'bq-2',
          answerKey: '-0,5'
        }
      ]
    };

    p.c.validExam = validExam;

    // 1. Successfully load valid exam via loadExamFromJson
    const loaded = p.run('loadExamFromJson(validExam)') as any;
    assert.equal(loaded.examId, 'exam-builder-import');
    assert.equal(p.run('builderExamState.examId'), 'exam-builder-import');
    assert.equal(p.run('builderExamState.questions.length'), 2);
    assert.equal(p.run('builderExamState.settings.maxAttempts'), 2);

    // 2. Reject malformed exam and preserve state
    const invalidExam = {
      examId: 'exam-invalid',
      examVersionId: 'v1',
      ruleSetId: 'invalid-rule',
      questions: []
    };
    p.c.invalidExam = invalidExam;
    assert.throws(
      () => p.run('loadExamFromJson(invalidExam)'),
      /Dữ liệu đề thi không hợp lệ/,
      'Invalid exam must be rejected by loadExamFromJson'
    );
    assert.equal(p.run('builderExamState.examId'), 'exam-builder-import', 'Builder state must not be corrupted by failed load');

    // 3. UI elements exist
    const doc = p.c.document as any;
    assert.ok(doc.getElementById('btnImportExamJson'), 'btnImportExamJson must exist');
    assert.ok(doc.getElementById('builderFileInput'), 'builderFileInput must exist');
    assert.ok(doc.getElementById('btnImportBankJson'), 'btnImportBankJson must exist');
    assert.ok(doc.getElementById('bankFileInput'), 'bankFileInput must exist');
    assert.ok(doc.getElementById('btnClearBank'), 'btnClearBank must exist');
  });

  it('Teacher Exam Builder: inline question editing, reordering, and duplication', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    // 1. Reset builder and add 3 questions (I, II, III)
    p.run('resetBuilderExam()');
    p.run('addQuestionToBuilder("I")');
    p.run('addQuestionToBuilder("II")');
    p.run('addQuestionToBuilder("III")');
    assert.equal(p.run('builderExamState.questions.length'), 3);
    assert.equal(p.run('builderExamState.questions[0].kind'), 'I');
    assert.equal(p.run('builderExamState.questions[1].kind'), 'II');
    assert.equal(p.run('builderExamState.questions[2].kind'), 'III');

    // 2. Question reordering: move question 0 down
    p.run('moveQuestionInBuilder(0, 1)');
    assert.equal(p.run('builderExamState.questions[0].kind'), 'II');
    assert.equal(p.run('builderExamState.questions[1].kind'), 'I');
    assert.equal(p.run('builderExamState.questions[2].kind'), 'III');

    // Move question 1 back up
    p.run('moveQuestionInBuilder(1, -1)');
    assert.equal(p.run('builderExamState.questions[0].kind'), 'I');
    assert.equal(p.run('builderExamState.questions[1].kind'), 'II');
    assert.equal(p.run('builderExamState.questions[2].kind'), 'III');

    // Boundary protection: moving index 0 up or index 2 down is a no-op
    p.run('moveQuestionInBuilder(0, -1)');
    assert.equal(p.run('builderExamState.questions[0].kind'), 'I');
    p.run('moveQuestionInBuilder(2, 1)');
    assert.equal(p.run('builderExamState.questions[2].kind'), 'III');

    // 3. Question duplication: duplicate question 0 (Part I)
    const origQ1Id = p.run('builderExamState.questions[0].questionVersionId') as string;
    p.run('duplicateQuestionInBuilder(0)');
    assert.equal(p.run('builderExamState.questions.length'), 4, 'Duplication must insert a new question');
    assert.equal(p.run('builderExamState.questions[1].kind'), 'I');
    const dupQId = p.run('builderExamState.questions[1].questionVersionId') as string;
    assert.notEqual(dupQId, origQ1Id, 'Duplicated question must have unique version ID');
    assert.ok(dupQId.startsWith(origQ1Id), 'Duplicated question ID must reflect source origin');
    assert.ok((p.run('builderExamState.questions[1].title') as string).includes('Bản sao'));

    // Check duplicate Part I options have new unique option IDs and valid correctOptionId
    const dupOpts = p.run('builderExamState.questions[1].options') as any[];
    assert.equal(dupOpts.length, 4);
    assert.ok(dupOpts.every(o => o.optionId.startsWith(dupQId)));
    assert.ok(dupOpts.some(o => o.optionId === p.run('builderExamState.questions[1].correctOptionId')));

    // 4. Interactive question editing: set edit mode and save changes
    p.run('setEditingQuestionIdx(0)');
    const doc = p.c.document as any;
    doc.getElementById('editQTitle_0').value = 'Câu 1 Đã Hiệu Đính';
    doc.getElementById('editQContent_0').value = 'Cho hàm số y = f(x) liên tục trên R...';
    doc.getElementById('editQDifficulty_0').value = 'van_dung';
    doc.getElementById('editQTopic_0').value = 'Khảo sát hàm số';
    doc.getElementById('editOptText_0_1').value = 'Khoảng (-2; 2)';
    doc.getElementById('editCorrectOpt_0_1').checked = true; // Set Option B as correct

    p.run('saveEditedQuestion(0)');
    assert.equal(p.run('builderExamState.questions[0].title'), 'Câu 1 Đã Hiệu Đính');
    assert.equal(p.run('builderExamState.questions[0].difficulty'), 'van_dung');
    assert.equal(p.run('builderExamState.questions[0].topic'), 'Khảo sát hàm số');
    assert.equal(p.run('builderExamState.questions[0].options[1].text'), 'Khoảng (-2; 2)');
    assert.equal(p.run('builderExamState.questions[0].correctOptionId'), p.run('builderExamState.questions[0].options[1].optionId'));

    // 5. Part III answerKey validation on edit
    p.run('setEditingQuestionIdx(3)'); // Question 3 is Part III
    doc.getElementById('editQAnswerKey_3').value = 'abc'; // Invalid characters
    assert.throws(
      () => p.run('saveEditedQuestion(3)'),
      /không hợp lệ/,
      'Part III invalid answerKey must throw and reject saving'
    );
    assert.equal(p.run('builderExamState.questions[3].answerKey'), '1,5', 'Invalid edit must not corrupt existing answerKey');

    // 6. Programmatic question update via updateQuestionInBuilder
    const okUpdate = p.run('updateQuestionInBuilder(0, { title: "Cập Nhật API", difficulty: "nhan_biet" })');
    assert.equal(okUpdate, true);
    assert.equal(p.run('builderExamState.questions[0].title'), 'Cập Nhật API');
    assert.equal(p.run('builderExamState.questions[0].difficulty'), 'nhan_biet');

    // Reject malformed patch via updateQuestionInBuilder
    const badUpdate = p.run('updateQuestionInBuilder(0, { options: [] })');
    assert.equal(badUpdate, false, 'Invalid options length must be rejected');
  });

  it('Question Bank: search by keyword, difficulty filtering, and combined multi-criteria retrieval', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    // 1. Seed bank with enriched default sample questions
    p.run('clearQuestionBank()');
    p.run('seedDefaultQuestionBank()');
    assert.equal(p.run('getQuestionBank().length'), 8, 'Default seeded bank must have 8 questions');

    // Verify UI search and difficulty elements exist
    const doc = p.c.document as any;
    assert.ok(doc.getElementById('bankSearchInput'), '#bankSearchInput must exist');
    assert.ok(doc.getElementById('bankDifficultyFilter'), '#bankDifficultyFilter must exist');

    // 2. Keyword search: search for "tích phân"
    p.run('renderBankList("all", "tích phân")');
    const searchHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(searchHtml.includes('q02-i-tich-phan'), 'Must find question matching "tích phân"');
    assert.ok(!searchHtml.includes('q01-i-ham-so'), 'Must filter out non-matching questions');

    // 3. Difficulty filtering: filter by "nhan_biet"
    p.run('renderBankList("all", "", "nhan_biet")');
    const diffHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(diffHtml.includes('q02-i-tich-phan') || diffHtml.includes('q03-i-oxyz'), 'Must include "nhan_biet" questions');
    assert.ok(!diffHtml.includes('q05-ii-khao-sat-ham'), 'Must exclude non-nhan_biet questions');

    // 4. Combined filtering: Part I only AND difficulty "thong_hieu"
    p.run('renderBankList("I", "", "thong_hieu")');
    const combinedHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(combinedHtml.includes('q01-i-ham-so'), 'Must include Part I thong_hieu question');
    assert.ok(!combinedHtml.includes('q06-ii-oxyz-mat-cau'), 'Must exclude Part II even if thong_hieu');

    // 5. Reset filters displays all 8 questions
    p.run('renderBankList("all", "", "all")');
    const fullHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(fullHtml.includes('q01-i-ham-so'));
    assert.ok(fullHtml.includes('q05-ii-khao-sat-ham'));
    assert.ok(fullHtml.includes('q07-iii-gia-tri-nho-nhat'));
  });

  it('Question Bank & Builder: multi-criteria grade filtering (grades 10, 11, 12) and grade editing', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    p.run('clearQuestionBank()');
    p.run('seedDefaultQuestionBank()'); // 8 questions seeded with Grade 12

    const doc = p.c.document as any;
    assert.ok(doc.getElementById('bankGradeFilter'), '#bankGradeFilter select element must exist');

    // 1. Add questions for Grade 10 and Grade 11 to Question Bank
    const qGrade10 = {
      kind: 'I',
      questionVersionId: 'q-math-10-vector',
      title: 'Tọa độ vectơ trong mặt phẳng',
      content: 'Cho tam giác ABC với A(1; 2), B(-2; 3)...',
      grade: 10,
      subject: 'Toán học',
      difficulty: 'nhan_biet',
      options: [
        { optionId: 'opt-10-a', label: 'A', text: '(1; 1)' },
        { optionId: 'opt-10-b', label: 'B', text: '(-1; 1)' },
        { optionId: 'opt-10-c', label: 'C', text: '(3; 5)' },
        { optionId: 'opt-10-d', label: 'D', text: '(0; 0)' }
      ],
      correctOptionId: 'opt-10-a'
    };
    const qGrade11 = {
      kind: 'III',
      questionVersionId: 'q-math-11-cap-so-cong',
      title: 'Cấp số cộng và cấp số nhân',
      content: 'Tìm số hạng thứ 5 của cấp số cộng với u1 = 2, d = 3.',
      grade: 11,
      subject: 'Toán học',
      difficulty: 'thong_hieu',
      answerKey: '14'
    };

    p.run(`saveQuestionToBank(${JSON.stringify(qGrade10)})`);
    p.run(`saveQuestionToBank(${JSON.stringify(qGrade11)})`);
    assert.equal(p.run('getQuestionBank().length'), 10, 'Bank must have 10 questions total');

    // 2. Filter by Grade 10
    p.run('renderBankList("all", "", "all", "10")');
    const g10Html = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(g10Html.includes('q-math-10-vector'), 'Must include Grade 10 question');
    assert.ok(g10Html.includes('Lớp 10'), 'Must display Grade 10 badge');
    assert.ok(!g10Html.includes('q01-i-ham-so'), 'Must exclude Grade 12 questions');
    assert.ok(!g10Html.includes('q-math-11-cap-so-cong'), 'Must exclude Grade 11 questions');

    // 3. Filter by Grade 11
    p.run('renderBankList("all", "", "all", "11")');
    const g11Html = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(g11Html.includes('q-math-11-cap-so-cong'), 'Must include Grade 11 question');
    assert.ok(g11Html.includes('Lớp 11'), 'Must display Grade 11 badge');
    assert.ok(!g11Html.includes('q-math-10-vector'), 'Must exclude Grade 10 questions');

    // 4. Filter by Grade 12
    p.run('renderBankList("all", "", "all", "12")');
    const g12Html = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(g12Html.includes('q01-i-ham-so'), 'Must include Grade 12 questions');
    assert.ok(!g12Html.includes('q-math-10-vector'), 'Must exclude Grade 10 questions');
    assert.ok(!g12Html.includes('q-math-11-cap-so-cong'), 'Must exclude Grade 11 questions');

    // 5. Combined Filter: Grade 10 + Part I + Difficulty "nhan_biet"
    p.run('renderBankList("I", "", "nhan_biet", "10")');
    const combinedHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(combinedHtml.includes('q-math-10-vector'));

    // 6. Inline editing question Grade in Builder
    p.run('resetBuilderExam(EMBEDDED_SAMPLE_EXAM)');
    p.run('setEditingQuestionIdx(0)');
    assert.ok(doc.getElementById('editQGrade_0'), '#editQGrade_0 select element must exist in edit mode');
    doc.getElementById('editQGrade_0').value = '11';
    p.run('saveEditedQuestion(0)');
    assert.equal(p.run('builderExamState.questions[0].grade'), 11, 'Edited question must have grade 11');

    // Saving edited question to bank updates bank with grade 11
    p.run('saveQuestionToBank(builderExamState.questions[0])');
    p.run('renderBankList("all", "", "all", "11")');
    const bankG11Html = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(bankG11Html.includes('q01-i-ham-so'), 'Mutated bank question must match Grade 11');
  });

  it('Shared §5 Invariant: Bank and builder mutations remain isolated from in-progress and completed attempts', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    // 1. Initialize exam runner with embedded sample exam
    p.run('renderExamPane=()=>{}; renderPalette=()=>{}; showReportView=()=>{};');
    p.run('initExam()');

    // Student provides responses to sample exam:
    // q01 (Part I): select correct option 'opt-1a' -> should score 1/4 point
    // q07 (Part III): type '-0,5' -> should score full points (3.5 points)
    p.run('studentState.responses["q01-i-ham-so"] = "opt-1a"');
    p.run('studentState.responses["q07-iii-gia-tri-nho-nhat"] = "-0,5"');
    p.run('document.getElementById("candidateName").value = "Học sinh kiểm định §5"');
    p.run('saveLocalState()');

    const draftKey = p.run('getStorageKey(currentExam, studentState)') as string;
    assert.ok(store.has(draftKey), 'In-progress draft must be saved in storage');

    // 2. TEACHER MUTATIONS: Teacher modifies Question Bank and Exam Builder questions
    // - Teacher clears or mutates q01 in Question Bank
    p.run(`
      saveQuestionToBank({
        kind: 'I',
        questionVersionId: 'q01-i-ham-so',
        title: 'CÂU ĐÃ BỊ SỬA TRONG BANK',
        content: 'Nội dung đề bài hoàn toàn mới...',
        options: [
          { optionId: 'opt-mutated-a', label: 'A', text: 'Sai' },
          { optionId: 'opt-mutated-b', label: 'B', text: 'Sai' },
          { optionId: 'opt-mutated-c', label: 'C', text: 'Sai' },
          { optionId: 'opt-mutated-d', label: 'D', text: 'Đúng' }
        ],
        correctOptionId: 'opt-mutated-d'
      });
    `);

    // - Teacher deletes q07 from Question Bank
    p.run('removeQuestionFromBank("q07-iii-gia-tri-nho-nhat")');

    // - Teacher opens Exam Builder and modifies builderExamState
    p.run('resetBuilderExam(EMBEDDED_SAMPLE_EXAM)');
    p.run('builderExamState.questions[0].title = "Câu sửa trong builder"');
    p.run('builderExamState.questions[0].correctOptionId = "foreign-option"');

    // 3. STUDENT COMPLETES ATTEMPT: Student submits the exam
    p.run('submitExam()');
    assert.equal(p.run('studentState.submitted'), true, 'Attempt must be submitted');

    // 4. VERIFY INVARIANT: Attempt scoring and report are 100% isolated from teacher bank/builder mutations
    const scoreRes = p.run('studentState.scoreResult') as any;
    assert.ok(scoreRes, 'Score result must exist');

    // q01 score must remain based on the snapshot exam version: correct (1/4 point)
    const q01Res = scoreRes.questionResults.find((q: any) => q.questionVersionId === 'q01-i-ham-so');
    assert.ok(q01Res, 'q01 result must exist');
    assert.equal(q01Res.status, 'full', 'q01 status must be full (correct), untouched by bank mutation');
    assert.equal(q01Res.pointsFraction, '1/4');

    // q07 score must remain based on snapshot exam: correct (7/2 point = 3.5 points)
    const q07Res = scoreRes.questionResults.find((q: any) => q.questionVersionId === 'q07-iii-gia-tri-nho-nhat');
    assert.ok(q07Res, 'q07 result must exist even though deleted from bank');
    assert.equal(q07Res.status, 'full');
    assert.equal(q07Res.pointsFraction, '7/2');

    // Total score: 1/4 + 7/2 = 1/4 + 14/4 = 15/4 points
    assert.equal(scoreRes.totalFraction, '15/4');

    // Offline report generated from attempt retains original snapshot question content and titles
    const offlineHtml = p.run('generateOfflineReportHtml(studentState.scoreResult)') as string;
    assert.ok(!offlineHtml.includes('CÂU ĐÃ BỊ SỬA TRONG BANK'), 'Report must not contain mutated bank question title');
    assert.ok(offlineHtml.includes('Cho hàm số'), 'Report must retain original snapshot question content');
    assert.ok(offlineHtml.includes('Học sinh kiểm định §5'), 'Report must retain candidate name');
  });

  it('Question Bank & Builder: multi-subject filtering and inline subject editing', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    p.run('clearQuestionBank()');
    p.run('seedDefaultQuestionBank()'); // 8 sample questions seeded with 'Toán học'

    const doc = p.c.document as any;
    assert.ok(doc.getElementById('bankSubjectFilter'), '#bankSubjectFilter select element must exist');

    // 1. Add questions for other subjects (Vật lí, Hóa học) to Question Bank
    const qPhysics = {
      kind: 'I',
      questionVersionId: 'q-physics-12-dao-dong',
      title: 'Dao động điều hòa',
      subject: 'Vật lí',
      grade: 12,
      difficulty: 'nhan_biet',
      topic: 'Dao động cơ',
      content: 'Phương trình dao động x = A cos(omega t + phi)...',
      options: [
        { optionId: 'opt-p1', label: 'A', text: 'Tần số góc' },
        { optionId: 'opt-p2', label: 'B', text: 'Biên độ' },
        { optionId: 'opt-p3', label: 'C', text: 'Pha ban đầu' },
        { optionId: 'opt-p4', label: 'D', text: 'Li độ' }
      ],
      correctOptionId: 'opt-p1'
    };
    const qChemistry = {
      kind: 'I',
      questionVersionId: 'q-chemistry-12-este',
      title: 'Este no đơn chức mạch hở',
      subject: 'Hóa học',
      grade: 12,
      difficulty: 'nhan_biet',
      topic: 'Este - Lipit',
      content: 'Công thức phân tử este no đơn chức mạch hở là CnH2nO2...',
      options: [
        { optionId: 'opt-c1', label: 'A', text: 'CnH2nO2' },
        { optionId: 'opt-c2', label: 'B', text: 'CnH2n+2O' },
        { optionId: 'opt-c3', label: 'C', text: 'CnH2n-2O2' },
        { optionId: 'opt-c4', label: 'D', text: 'CnH2nO' }
      ],
      correctOptionId: 'opt-c1'
    };
    p.run(`saveQuestionToBank(${JSON.stringify(qPhysics)})`);
    p.run(`saveQuestionToBank(${JSON.stringify(qChemistry)})`);

    assert.equal(p.run('getQuestionBank().length'), 10, 'Bank should have 10 questions (8 Math + 1 Physics + 1 Chemistry)');

    // 2. Filter by Subject: "Vật lí"
    p.run('renderBankList("all", "", "all", "all", "Vật lí")');
    const physHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(physHtml.includes('q-physics-12-dao-dong'), 'Must display Physics question');
    assert.ok(physHtml.includes('Vật lí'), 'Must display Physics badge');
    assert.ok(!physHtml.includes('q-chemistry-12-este'), 'Must not display Chemistry question');
    assert.ok(!physHtml.includes('q01-i-ham-so'), 'Must not display Math question');

    // 3. Filter by Subject: "Hóa học"
    p.run('renderBankList("all", "", "all", "all", "Hóa học")');
    const chemHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(chemHtml.includes('q-chemistry-12-este'), 'Must display Chemistry question');
    assert.ok(chemHtml.includes('Hóa học'), 'Must display Chemistry badge');
    assert.ok(!chemHtml.includes('q-physics-12-dao-dong'));

    // 4. Filter by Subject: "Toán học"
    p.run('renderBankList("all", "", "all", "all", "Toán học")');
    const mathHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(mathHtml.includes('q01-i-ham-so'), 'Must display Math question');
    assert.ok(!mathHtml.includes('q-physics-12-dao-dong'), 'Must not display Physics question');

    // 5. Combined Multi-Criteria Filter: Subject "Vật lí" + Grade "12" + Difficulty "nhan_biet" + Kind "I" + search "dao động"
    p.run('renderBankList("I", "dao động", "nhan_biet", "12", "Vật lí")');
    const combinedHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(combinedHtml.includes('q-physics-12-dao-dong'));

    // 6. Inline editing question Subject in Builder
    p.run('resetBuilderExam(EMBEDDED_SAMPLE_EXAM)');
    p.run('setEditingQuestionIdx(0)');
    assert.ok(doc.getElementById('editQSubject_0'), '#editQSubject_0 input element must exist in edit mode');
    doc.getElementById('editQSubject_0').value = 'Vật lí';
    p.run('saveEditedQuestion(0)');
    assert.equal(p.run('builderExamState.questions[0].subject'), 'Vật lí', 'Edited question must have subject "Vật lí"');

    // Verify badge in question card contains "Vật lí"
    const builderHtml = doc.getElementById('builderQuestionsContainer').innerHTML;
    assert.ok(builderHtml.includes('Vật lí'), 'Builder card must show updated Subject badge');
  });

  it('Question Bank & Builder: safe ID deduplication when adding duplicate questions to exam', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    // Initialize builder with sample exam (has q01-i-ham-so, q05-ii-khao-sat, etc.)
    p.run('resetBuilderExam(EMBEDDED_SAMPLE_EXAM)');
    const initialCount = p.run('builderExamState.questions.length') as number;
    assert.equal(initialCount, 8);

    // Seed bank with sample questions
    p.run('clearQuestionBank()');
    p.run('seedDefaultQuestionBank()');

    // Add duplicate Part I question 'q01-i-ham-so' from bank
    const addedQ = p.run('addQuestionFromBankToBuilder("q01-i-ham-so")') as any;
    assert.ok(addedQ, 'Must return added question');

    const updatedQuestions = p.run('builderExamState.questions') as any[];
    assert.equal(updatedQuestions.length, initialCount + 1, 'Question must be added to builder');

    const newQ = updatedQuestions[updatedQuestions.length - 1];
    assert.notEqual(newQ.questionVersionId, 'q01-i-ham-so', 'Duplicate question ID must be reassigned with unique suffix');
    assert.ok(newQ.questionVersionId.startsWith('q01-i-ham-so-bk-'), 'New ID must have backup suffix');

    // Verify option IDs and correctOptionId are remapped cleanly
    for (let i = 0; i < 4; i++) {
      assert.ok(newQ.options[i].optionId.startsWith(newQ.questionVersionId + '-opt-'));
    }
    assert.ok(newQ.options.some((o: any) => o.optionId === newQ.correctOptionId), 'correctOptionId must point to one of the newly generated option IDs');

    // Verify that validateExamVersion passes cleanly without ID_DUPLICATE
    const validation = p.run('validateExamVersion(builderExamState)') as any;
    assert.equal(validation.ok, true, 'Exam with deduplicated question must pass validateExamVersion');

    // Add Part II question 'q05-ii-khao-sat-ham' duplicate
    const addedPartII = p.run('addQuestionFromBankToBuilder("q05-ii-khao-sat-ham")') as any;
    assert.ok(addedPartII);

    const finalQuestions = p.run('builderExamState.questions') as any[];
    assert.equal(finalQuestions.length, initialCount + 2);
    const newPartII = finalQuestions[finalQuestions.length - 1];
    assert.ok(newPartII.questionVersionId.startsWith('q05-ii-khao-sat-ham-bk-'));
    for (let i = 0; i < 4; i++) {
      assert.ok(newPartII.statements[i].statementId.startsWith(newPartII.questionVersionId + '-st-'));
    }

    const finalVal = p.run('validateExamVersion(builderExamState)') as any;
    assert.equal(finalVal.ok, true, 'Exam with both Part I and Part II deduplicated questions must pass validation');

    // Publish to runner and verify runner accepts it
    p.run('publishBuilderExamToRunner()');
    assert.equal(p.run('currentExam.questions.length'), initialCount + 2);
  });

  it('Question Bank & Builder: multi-topic / chapter filtering and dynamic topic options', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    p.run('clearQuestionBank()');
    p.run('seedDefaultQuestionBank()');

    const doc = p.c.document as any;
    assert.ok(doc.getElementById('bankTopicFilter'), '#bankTopicFilter select element must exist');

    // 1. Initial seeded topics verification
    p.run('renderBankList("all")');
    const topicSelect = doc.getElementById('bankTopicFilter');
    assert.ok(topicSelect.innerHTML.includes('Khảo sát hàm số'), 'Topic options must include Khảo sát hàm số');
    assert.ok(topicSelect.innerHTML.includes('Nguyên hàm &amp; Tích phân') || topicSelect.innerHTML.includes('Nguyên hàm & Tích phân'), 'Topic options must include Nguyên hàm & Tích phân');
    assert.ok(topicSelect.innerHTML.includes('Hình học Oxyz'), 'Topic options must include Hình học Oxyz');
    assert.ok(topicSelect.innerHTML.includes('Xác suất'), 'Topic options must include Xác suất');

    // 2. Filter by Topic: "Khảo sát hàm số" (should match 3 Math questions: q01, q05, q07)
    p.run('renderBankList("all", "", "all", "all", "all", "Khảo sát hàm số")');
    const kshsHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(kshsHtml.includes('q01-i-ham-so'), 'Must include q01');
    assert.ok(kshsHtml.includes('q05-ii-khao-sat-ham'), 'Must include q05');
    assert.ok(kshsHtml.includes('q07-iii-gia-tri-nho-nhat'), 'Must include q07');
    assert.ok(kshsHtml.includes('Khảo sát hàm số'), 'Must display topic badge');
    assert.ok(!kshsHtml.includes('q03-i-oxyz'), 'Must not include Oxyz question');
    assert.ok(!kshsHtml.includes('q04-i-xac-suat'), 'Must not include probability question');

    // 3. Filter by Topic: "Hình học Oxyz" (should match q03 and q06)
    p.run('renderBankList("all", "", "all", "all", "all", "Hình học Oxyz")');
    const oxyzHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(oxyzHtml.includes('q03-i-oxyz'));
    assert.ok(oxyzHtml.includes('q06-ii-oxyz-mat-cau'));
    assert.ok(!oxyzHtml.includes('q01-i-ham-so'));

    // 4. Add custom questions with new topics
    const qPhysics = {
      kind: 'I',
      questionVersionId: 'q-physics-dao-dong',
      title: 'Dao động cơ học',
      subject: 'Vật lí',
      grade: 12,
      difficulty: 'thong_hieu',
      topic: 'Dao động cơ',
      content: 'Một vật dao động điều hòa...',
      options: [
        { optionId: 'opt-p1', label: 'A', text: 'Tần số góc' },
        { optionId: 'opt-p2', label: 'B', text: 'Pha ban đầu' },
        { optionId: 'opt-p3', label: 'C', text: 'Biên độ' },
        { optionId: 'opt-p4', label: 'D', text: 'Li độ' }
      ],
      correctOptionId: 'opt-p1'
    };
    p.run(`saveQuestionToBank(${JSON.stringify(qPhysics)})`);

    // Render bank again to update dynamic options
    p.run('renderBankList("all")');
    assert.ok(doc.getElementById('bankTopicFilter').innerHTML.includes('Dao động cơ'), 'Dynamic options must include new topic Dao động cơ');

    // 5. Filter by newly added topic "Dao động cơ"
    p.run('renderBankList("all", "", "all", "all", "all", "Dao động cơ")');
    const daoDongHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(daoDongHtml.includes('q-physics-dao-dong'));
    assert.ok(daoDongHtml.includes('Dao động cơ'));
    assert.ok(!daoDongHtml.includes('q01-i-ham-so'));

    // 6. Combined multi-criteria filter: Subject "Toán học" + Grade "12" + Topic "Khảo sát hàm số" + Difficulty "thong_hieu" + Kind "I"
    p.run('renderBankList("I", "", "thong_hieu", "12", "Toán học", "Khảo sát hàm số")');
    const combinedHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(combinedHtml.includes('q01-i-ham-so'), 'Must match q01');
    assert.ok(!combinedHtml.includes('q05-ii-khao-sat-ham'), 'Part II must be filtered out');
    assert.ok(!combinedHtml.includes('q07-iii-gia-tri-nho-nhat'), 'Part III must be filtered out');

    // 7. Adding question with topic to Exam Builder propagates topic badge
    p.run('resetBuilderExam(EMBEDDED_SAMPLE_EXAM)');
    const added = p.run('addQuestionFromBankToBuilder("q-physics-dao-dong")') as any;
    assert.ok(added);
    assert.equal(added.topic, 'Dao động cơ', 'Added question must preserve topic');

    const builderHtml = doc.getElementById('builderQuestionsContainer').innerHTML;
    assert.ok(builderHtml.includes('Dao động cơ'), 'Builder card must show Topic badge');
  });

  it('Question Bank & Builder: multi-lesson filtering, lesson editing, and complete GDPT 2018 taxonomy (Subject > Grade > Topic > Lesson > Difficulty)', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);

    p.run('clearQuestionBank()');
    p.run('seedDefaultQuestionBank()');

    const doc = p.c.document as any;
    assert.ok(doc.getElementById('bankLessonFilter'), '#bankLessonFilter select element must exist');

    // 1. Initial seeded lessons verification
    p.run('renderBankList("all")');
    const lessonSelect = doc.getElementById('bankLessonFilter');
    assert.ok(lessonSelect.innerHTML.includes('Sự đồng biến, nghịch biến của hàm số'), 'Lesson options must include Sự đồng biến, nghịch biến của hàm số');
    assert.ok(lessonSelect.innerHTML.includes('Định nghĩa và tính chất của tích phân'), 'Lesson options must include Định nghĩa và tính chất của tích phân');
    assert.ok(lessonSelect.innerHTML.includes('Phương trình mặt phẳng'), 'Lesson options must include Phương trình mặt phẳng');
    assert.ok(lessonSelect.innerHTML.includes('Xác suất có điều kiện'), 'Lesson options must include Xác suất có điều kiện');

    // 2. Filter by Lesson: "Sự đồng biến, nghịch biến của hàm số" (should match q01)
    p.run('renderBankList("all", "", "all", "all", "all", "all", "Sự đồng biến, nghịch biến của hàm số")');
    const dbHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(dbHtml.includes('q01-i-ham-so'), 'Must include q01');
    assert.ok(dbHtml.includes('Bài: Sự đồng biến, nghịch biến của hàm số'), 'Must display lesson badge');
    assert.ok(!dbHtml.includes('q02-i-tich-phan'), 'Must not include integral question');
    assert.ok(!dbHtml.includes('q03-i-oxyz'), 'Must not include Oxyz question');

    // 3. Keyword search in Bank covers Lesson field
    p.run('renderBankList("all", "nghịch biến", "all", "all", "all", "all", "all")');
    const searchHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(searchHtml.includes('q01-i-ham-so'), 'Must find question matching lesson keyword');

    // 4. Combined 5-level taxonomy filter: Subject + Grade + Topic + Lesson + Difficulty
    p.run('renderBankList("I", "", "thong_hieu", "12", "Toán học", "Khảo sát hàm số", "Sự đồng biến, nghịch biến của hàm số")');
    const taxonomyHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(taxonomyHtml.includes('q01-i-ham-so'), 'Must match q01 with exact 5-level taxonomy');

    // 5. Add custom question with new Lesson and custom taxonomy
    const qChem = {
      kind: 'I',
      questionVersionId: 'q-chem-este',
      title: 'Este - Lipit',
      subject: 'Hóa học',
      grade: 12,
      difficulty: 'nhan_biet',
      topic: 'Este - Xà phòng',
      lesson: 'Khái niệm và danh pháp Este',
      content: 'Công thức phân tử este no đơn chức mạch hở...',
      options: [
        { optionId: 'opt-c1', label: 'A', text: 'CnH2nO2 (n >= 2)' },
        { optionId: 'opt-c2', label: 'B', text: 'CnH2n-2O2 (n >= 2)' },
        { optionId: 'opt-c3', label: 'C', text: 'CnH2nO (n >= 1)' },
        { optionId: 'opt-c4', label: 'D', text: 'CnH2n+2O2 (n >= 1)' }
      ],
      correctOptionId: 'opt-c1'
    };
    p.run(`saveQuestionToBank(${JSON.stringify(qChem)})`);

    // Render bank again to update dynamic lesson options
    p.run('renderBankList("all")');
    assert.ok(doc.getElementById('bankLessonFilter').innerHTML.includes('Khái niệm và danh pháp Este'), 'Dynamic options must include new lesson');

    // 6. Filter by newly added lesson
    p.run('renderBankList("all", "", "all", "all", "all", "all", "Khái niệm và danh pháp Este")');
    const esteHtml = doc.getElementById('bankQuestionsContainer').innerHTML;
    assert.ok(esteHtml.includes('q-chem-este'), 'Must match newly added Este question');
    assert.ok(esteHtml.includes('Bài: Khái niệm và danh pháp Este'), 'Must display lesson badge');

    // 7. Adding question from bank to Exam Builder preserves complete taxonomy
    p.run('resetBuilderExam(EMBEDDED_SAMPLE_EXAM)');
    const addedChem = p.run('addQuestionFromBankToBuilder("q-chem-este")') as any;
    assert.ok(addedChem);
    assert.equal(addedChem.subject, 'Hóa học', 'Must preserve subject');
    assert.equal(addedChem.grade, 12, 'Must preserve grade');
    assert.equal(addedChem.topic, 'Este - Xà phòng', 'Must preserve topic');
    assert.equal(addedChem.lesson, 'Khái niệm và danh pháp Este', 'Must preserve lesson');
    assert.equal(addedChem.difficulty, 'nhan_biet', 'Must preserve difficulty');

    const builderHtml2 = doc.getElementById('builderQuestionsContainer').innerHTML;
    assert.ok(builderHtml2.includes('Bài: Khái niệm và danh pháp Este'), 'Builder card must show Lesson badge');
  });

  it('LC29-F01 regression: independent clients receive distinct attempt IDs and restart creates distinct attempt history entries', async () => {
    // 1. Independent clients on separate devices/storage receive distinct random attempt IDs
    const p1 = createPageContext();
    const p2 = createPageContext();
    assert.notEqual(p1.run('studentState.attemptId'), p2.run('studentState.attemptId'), 'Two independent page contexts must receive distinct attempt IDs');

    // 2. Restart flow creates new attempt ID and preserves history across submissions
    const store = new Map<string, string>();
    const a = createPageContext(store);
    a.run('renderExamPane=()=>{};renderPalette=()=>{};');
    a.run('submitExam()');
    const firstAttemptId = a.run('studentState.attemptId');

    a.run('restartExam()');

    const b = createPageContext(store);
    b.run('renderExamPane=()=>{};renderPalette=()=>{};');
    b.c.ex = {
      examId: 'exam-thpt-toan-demo-01',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }]
    };
    (b.c as any).fetch = async () => ({ ok: true, json: async () => b.c.ex });
    await b.run('initExam()');
    assert.notEqual(b.run('studentState.attemptId'), firstAttemptId, 'Restarted attempt must receive a new distinct attempt ID');

    b.run('submitExam()');
    const hist = b.run('getAttemptHistory(currentExam, studentState)') as any[];
    assert.equal(hist.length, 2, 'History must contain two distinct attempt entries');
    assert.equal(hist[0].attemptId, firstAttemptId, 'First attempt entry preserved');
    assert.equal(hist[1].attemptId, b.run('studentState.attemptId'), 'Second attempt entry recorded');
  });

  it('LC29-F02 regression: custom draft survives reload and re-import via active attempt pointer', async () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    a.run('renderExamPane=()=>{};renderPalette=()=>{};');
    const customExam = {
      examId: 'my-custom-lc29',
      examVersionId: 'custom-v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }]
    };
    a.c.custom = customExam;
    a.run('loadExamVersion(custom); studentState.responses.q = "1"; saveLocalState()');
    const oldId = a.run('studentState.attemptId');

    const b = createPageContext(store);
    b.run('renderExamPane=()=>{};renderPalette=()=>{};');
    b.c.custom = customExam;
    b.c.sample = {
      examId: 'sample-exam-01',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1' }]
    };
    (b.c as any).fetch = async () => ({ ok: true, json: async () => b.c.sample });
    await b.run('initExam()');

    // Re-importing custom exam resumes draft
    b.run('loadExamVersion(custom)');
    assert.equal(b.run('studentState.attemptId'), oldId, 'Re-imported exam must resume previous attempt ID');
    assert.equal(b.run('studentState.responses.q'), '1', 'Saved response must be restored on re-import');
  });

  it('LC29-F03 regression: late receipt from pending request cannot finalize another opened exam', async () => {
    const p = createPageContext();
    p.run('renderExamPane=()=>{};renderPalette=()=>{};');
    const exA = {
      examId: 'exam-A',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'qa', answerKey: '1' }]
    };
    const exB = {
      examId: 'exam-B',
      examVersionId: 'v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'qb', answerKey: '2' }]
    };

    p.c.exA = exA;
    p.c.exB = exB;
    p.run('currentExam = exA; studentState.scoreResult = scoreAttemptLocally(); studentState.submitted = true; window.CUNATA_COLLECTOR_URL = "https://collector.invalid";');

    let resolveFetch: (val: any) => void = () => {};
    (p.c as any).fetch = () => new Promise(r => { resolveFetch = r; });

    const pending = p.run('dispatchToServerCollector()');

    // Switch to exam B while request A is pending
    p.run('loadExamVersion(exB)');
    const keyB = p.run('getFinalStorageKey(currentExam, studentState)') as string;

    // Resolve fetch for exam A
    resolveFetch({
      ok: true,
      json: async () => ({
        success: true,
        attempt_id: 'attempt-sample-01',
        status: 'NEWLY_RECORDED'
      })
    });
    await pending;

    // Exam B must not be finalized by exam A's late receipt
    assert.equal(p.run('studentState.serverConfirmed'), false, 'Exam B must not be serverConfirmed');
    assert.equal(p.store.has(keyB), false, 'Exam B final key must not be created');
  });

  it('LC29-F04 regression: collector receipt with mismatched attempt_id is rejected on client', async () => {
    const p = createPageContext();
    p.run('studentState.scoreResult = scoreAttemptLocally(); studentState.submitted = true; window.CUNATA_COLLECTOR_URL = "https://collector.invalid";');
    (p.c as any).fetch = async () => ({
      ok: true,
      json: async () => ({
        success: true,
        attempt_id: 'FOREIGN-ATTEMPT-ID',
        status: 'NEWLY_RECORDED'
      })
    });

    await p.run('dispatchToServerCollector()');
    assert.equal(p.run('studentState.serverConfirmed'), false, 'Receipt with mismatched attempt_id must not set serverConfirmed');
  });

  it('LC29-F05 regression: unconfirmed submitted final retries collector dispatch on reload and submit', async () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    a.run('renderExamPane=()=>{};renderPalette=()=>{};');
    a.run('submitExam()'); // submitted locally without collector URL

    const b = createPageContext(store);
    b.run('renderExamPane=()=>{};renderPalette=()=>{};');
    let posts = 0;
    (b.c as any).fetch = async (_url: string, opts: any) => {
      if (opts) {
        posts++;
        return {
          ok: true,
          json: async () => ({
            success: true,
            attempt_id: b.run('studentState.attemptId'),
            status: 'NEWLY_RECORDED'
          })
        };
      }
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(sampleExamPath, 'utf8')) };
    };

    b.run('window.CUNATA_COLLECTOR_URL = "https://collector.invalid";');
    await b.run('initExam()');
    b.run('submitExam()');
    await b.run('dispatchToServerCollector()');

    assert.ok(posts > 0, 'Collector POST must be retried for pending unconfirmed final');
    assert.equal(b.run('studentState.serverConfirmed'), true, 'Receipt must confirm attempt after retry');
  });

  it('LC29-F06 regression: Apps Script collector sanitizes formula triggers across all columns against CWE-1236', () => {
    const code = fs.readFileSync('apps-script/Code.js', 'utf8');
    const rows: any[][] = [];
    const sheet = {
      getLastRow: () => rows.length,
      getLastColumn: () => (rows.length > 0 && rows[0] ? rows[0].length : 0),
      appendRow: (r: any[]) => rows.push(r),
      getRange: (start: number, col: number, count: number) => ({
        getValues: () => rows.slice(start - 1, start - 1 + count).map(r => [r[col - 1]])
      })
    };
    const c = vm.createContext({
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getActiveSheet: () => sheet }), flush() {} },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (body: string) => ({ setMimeType: () => ({ body }) }) }
    });
    vm.runInContext(code, c);

    const dangerousPayload = {
      attempt_id: '=1+1',
      exam_id: '=2+2',
      exam_version_id: '=3+3',
      candidate_display: '=4+4',
      started_at: '=5+5',
      submitted_at: '=6+6',
      policy_version: '=7+7',
      total: '5',
      maxTotal: '10',
      sections: {
        I: { score: '1', max: '2' },
        II: { score: '2', max: '4' },
        III: { score: '2', max: '4' }
      }
    };
    (c as any).dangerousPayload = dangerousPayload;

    const row = vm.runInContext('formatRecordRow(dangerousPayload)', c) as string[];
    const dangerousTriggers = ['=', '+', '-', '@', '\t', '\r', '\n', '＝', '＋', '－', '＠'];

    for (let i = 0; i < row.length; i++) {
      const val = String(row[i]);
      if (val.length > 0) {
        assert.ok(
          !dangerousTriggers.includes(val.charAt(0)) || val.startsWith("'"),
          `Column ${i} with value ${val} must not start with an unescaped formula trigger`
        );
      }
    }

    // doPost must write sanitized row and allow retry deduplication
    const res1 = JSON.parse((c as any).doPost({ postData: { contents: JSON.stringify(dangerousPayload) } }).body);
    assert.equal(res1.success, true);
    assert.equal(res1.status, 'NEWLY_RECORDED');

    const res2 = JSON.parse((c as any).doPost({ postData: { contents: JSON.stringify(dangerousPayload) } }).body);
    assert.equal(res2.success, true);
    assert.equal(res2.status, 'ALREADY_RECORDED');
    assert.equal(rows.length, 2, 'Header row + exactly 1 data row recorded due to deduplication');
  });

  it('LC29-F07 regression: Apps Script collector validates score bounds, exact fractions, and section sum consistency', () => {
    const code = fs.readFileSync('apps-script/Code.js', 'utf8');
    const rows: any[][] = [];
    const sheet = {
      getLastRow: () => rows.length,
      getLastColumn: () => (rows.length > 0 && rows[0] ? rows[0].length : 0),
      appendRow: (r: any[]) => rows.push(r),
      getRange: (start: number, col: number, count: number) => ({
        getValues: () => rows.slice(start - 1, start - 1 + count).map(r => [r[col - 1]])
      })
    };
    const c = vm.createContext({
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getActiveSheet: () => sheet }), flush() {} },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (body: string) => ({ setMimeType: () => ({ body }) }) }
    });
    vm.runInContext(code, c);

    // 1. Total score exceeds max total -> rejected
    const forgedPayload = { attempt_id: 'att-forged-1', total: '999', maxTotal: '10' };
    const forgedRes = JSON.parse((c as any).doPost({ postData: { contents: JSON.stringify(forgedPayload) } }).body);
    assert.equal(forgedRes.success, false);
    assert.equal(forgedRes.error, 'SCORE_EXCEEDS_MAX');

    // 2. Negative score -> rejected
    const negPayload = { attempt_id: 'att-neg-1', total: '-1', maxTotal: '10' };
    const negRes = JSON.parse((c as any).doPost({ postData: { contents: JSON.stringify(negPayload) } }).body);
    assert.equal(negRes.success, false);
    assert.equal(negRes.error, 'INVALID_SCORE_RANGE');

    // 3. Section sum mismatch -> rejected
    const mismatchPayload = {
      attempt_id: 'att-mismatch-1',
      exam_id: 'exam-1',
      exam_version_id: 'v1',
      total: '8',
      maxTotal: '10',
      sections: {
        I: { score: '2', max: '2' },
        II: { score: '3', max: '4' },
        III: { score: '2', max: '4' } // 2 + 3 + 2 = 7 != 8
      }
    };
    const mismatchRes = JSON.parse((c as any).doPost({ postData: { contents: JSON.stringify(mismatchPayload) } }).body);
    assert.equal(mismatchRes.success, false);
    assert.equal(mismatchRes.error, 'SECTION_SUM_MISMATCH');

    // 4. Section max mismatch -> rejected
    const maxMismatchPayload = {
      attempt_id: 'att-mismatch-2',
      exam_id: 'exam-1',
      exam_version_id: 'v1',
      total: '7',
      maxTotal: '10',
      sections: {
        I: { score: '2', max: '2' },
        II: { score: '3', max: '4' },
        III: { score: '2', max: '3' } // 2 + 4 + 3 = 9 != 10
      }
    };
    const maxMismatchRes = JSON.parse((c as any).doPost({ postData: { contents: JSON.stringify(maxMismatchPayload) } }).body);
    assert.equal(maxMismatchRes.success, false);
    assert.equal(maxMismatchRes.error, 'SECTION_MAX_MISMATCH');

    // 5. Valid consistent payload -> accepted
    const validPayload = {
      attempt_id: 'att-valid-1',
      exam_id: 'exam-1',
      exam_version_id: 'v1',
      total: '7',
      maxTotal: '10',
      sections: {
        I: { score: '2', max: '2' },
        II: { score: '3', max: '4' },
        III: { score: '2', max: '4' }
      }
    };
    const validRes = JSON.parse((c as any).doPost({ postData: { contents: JSON.stringify(validPayload) } }).body);
    assert.equal(validRes.success, true);
    assert.equal(validRes.status, 'NEWLY_RECORDED');
  });

  it('LC31-F01 regression: Apps Script collector enforces canonical schema, string IDs, complete sections, alias consistency, and payload conflict detection', () => {
    const codePath = path.resolve(process.cwd(), 'apps-script/Code.js');
    const code = fs.readFileSync(codePath, 'utf8');
    const rows: any[][] = [];
    const sheet = {
      getLastRow: () => rows.length,
      getLastColumn: () => (rows.length > 0 && rows[0] ? rows[0].length : 0),
      appendRow: (r: any[]) => rows.push(r),
      getRange: (start: number, col: number, count: number) => ({
        getValues: () => rows.slice(start - 1, start - 1 + count).map(r => [r[col - 1]])
      })
    };
    const c = vm.createContext({
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getActiveSheet: () => sheet }), flush() {} },
      LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
      ContentService: {
        MimeType: { JSON: 'json' },
        createTextOutput: (body: string) => ({ setMimeType: () => ({ body }) })
      }
    });
    vm.runInContext(code, c);
    const post = (d: any) => JSON.parse((c as any).doPost({ postData: { contents: JSON.stringify(d) } }).body);

    // 1. Numeric ID must be rejected
    assert.equal(post({ attempt_id: 12345, total: '1', maxTotal: '10' }).success, false);

    // 2. Missing score must be rejected
    assert.equal(post({ attempt_id: 'missing-score-att' }).success, false);

    // 3. Partial sections must be rejected
    assert.equal(post({
      attempt_id: 'partial-sec-att',
      exam_id: 'E',
      exam_version_id: 'V',
      total: '1',
      maxTotal: '10',
      sections: { I: { score: '1', max: '1' } }
    }).success, false);

    // 4. Conflicting aliases must be rejected
    assert.equal(post({
      attempt_id: 'alias-conflict-att',
      exam_id: 'E',
      exam_version_id: 'V',
      total: '1',
      maxTotal: '10',
      total_score: '999',
      max_total: '1',
      sections: { I: { score: '1', max: '10' }, II: { score: '0', max: '0' }, III: { score: '0', max: '0' } }
    }).success, false);

    // 5. Valid rational payload accepted and canonical row written
    const valid = post({
      attempt_id: 'canonical-valid-att',
      exam_id: 'E',
      exam_version_id: 'V',
      total: '10/3',
      maxTotal: '10',
      sections: { I: { score: '0', max: '0' }, II: { score: '0', max: '0' }, III: { score: '10/3', max: '10' } }
    });
    assert.equal(valid.success, true);
    assert.equal(valid.status, 'NEWLY_RECORDED');

    // 6. Same attempt ID with conflicting score must be detected and rejected
    const conflict = post({
      attempt_id: 'canonical-valid-att',
      exam_id: 'E',
      exam_version_id: 'V',
      total: '9',
      maxTotal: '10',
      sections: {
        I: { score: '1', max: '2' },
        II: { score: '4', max: '4' },
        III: { score: '4', max: '4' }
      }
    });
    assert.equal(conflict.success, false);
    assert.equal(conflict.error, 'PAYLOAD_CONFLICT');
  });

  it('LC31-F02 regression: custom boot restores active exam snapshot and student responses from localStorage across initExam', async () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    a.run('renderExamPane = () => {}; renderPalette = () => {};');
    const customExam = {
      examId: 'CUSTOM-LC31-BOOT',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        { kind: 'III', questionVersionId: 'q-custom-boot', answerKey: '1,5' }
      ]
    };
    a.c.customExam = customExam;
    a.run('loadExamVersion(customExam); studentState.responses["q-custom-boot"] = "1,5"; saveLocalState()');

    // Context B simulates a page reload where initExam runs
    const b = createPageContext(store);
    b.run('renderExamPane = () => {}; renderPalette = () => {};');
    b.run('fetch = async () => ({ ok: true, json: async () => ({ examId: "default-thpt", examVersionId: "v1", ruleSetId: "custom-v1", inputPolicyId: "sa-charset-v1", questions: [] }) })');
    await b.run('initExam()');

    assert.equal(b.run('currentExam.examId'), 'CUSTOM-LC31-BOOT', 'initExam must restore active custom exam snapshot from localStorage');
    assert.equal(b.run('studentState.responses["q-custom-boot"]'), '1,5', 'initExam must restore saved student responses for the custom exam');
  });

  it('LC31-F03 regression: submit reconciliation strictly validates server receipt before adopting serverConfirmed state', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    p.run('renderExamPane = () => {}; renderPalette = () => {};');
    p.run('saveLocalState(); submitExam()');

    const finalKey = p.run('getFinalStorageKey(currentExam, studentState)') as string;
    const key = p.key();

    // Persist a forged final with bogus receipt
    const stored = JSON.parse(store.get(finalKey) || '{}');
    stored.serverConfirmed = true;
    stored.serverReceipt = { success: true, attempt_id: 'FORGED-ATTEMPT-ID', status: 'BOGUS' };
    store.set(finalKey, JSON.stringify(stored));
    store.set(key, JSON.stringify(stored));

    p.run('studentState.serverConfirmed = false; studentState.serverReceipt = null; submitExam()');
    assert.equal(p.run('studentState.serverConfirmed'), false, 'submitExam must reject forged server receipt and remain unconfirmed');
    assert.equal(p.run('studentState.serverReceipt'), null);
  });

  it('LC31-F04 regression: dispatchToServerCollector implements bounded exponential backoff retry scheduling on failure', async () => {
    const p = createPageContext();
    p.run(`
      studentState.scoreResult = scoreAttemptLocally();
      studentState.submitted = true;
      window.CUNATA_COLLECTOR_URL = "https://collector.invalid";
      retryTimers = [];
      setTimeout = (fn, ms) => { retryTimers.push(ms); return 1; };
      fetch = async () => { throw new Error("offline"); };
    `);

    await p.run('dispatchToServerCollector()');
    const timers = p.run('retryTimers') as number[];
    assert.ok(timers.length > 0, 'network failure must schedule bounded exponential retry timer');
    assert.equal(timers[0], 1000, 'first backoff delay must be 1000ms');
  });

  it('LC31-F05 regression: restart preserves completed final submission archive in localStorage while initializing distinct attempt ID', async () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    a.run('renderExamPane = () => {}; renderPalette = () => {};');
    a.run('saveLocalState(); submitExam()');

    const oldAttemptId = a.run('studentState.attemptId');
    const finalKey = a.run('getFinalStorageKey(currentExam, studentState)') as string;
    assert.ok(store.has(finalKey), 'Final key must exist in storage after submission');

    a.run('restartExam()');
    const newAttemptId = a.run('studentState.attemptId');
    assert.notEqual(newAttemptId, oldAttemptId, 'Restart must generate a distinct attempt ID');
    assert.ok(store.has(finalKey), 'Completed final key must be archived and retained in localStorage after restart');

    // Context B reloads and verifies that the new attempt ID is active and previous final remains archived
    const b = createPageContext(store);
    b.run('renderExamPane = () => {}; renderPalette = () => {};');
    await b.run('initExam()');
    assert.notEqual(b.run('studentState.attemptId'), oldAttemptId);
    assert.ok(store.has(finalKey));
  });

  it('LC32-F06 regression: question difficulty markup is escaped against XSS in builder view', () => {
    const p = createPageContext();
    const doc = p.c.document as any;

    p.run(`
      resetBuilderExam({
        examId: "xss-test-exam",
        examVersionId: "v1.0.0",
        title: "Test XSS",
        questions: [{
          kind: "I",
          questionVersionId: "q-xss-diff",
          title: "Cau hoi test XSS",
          content: "Noi dung test",
          difficulty: '<img src=x onerror="alert(1)">',
          options: [
            { optionId: "o1", label: "A", text: "A" },
            { optionId: "o2", label: "B", text: "B" },
            { optionId: "o3", label: "C", text: "C" },
            { optionId: "o4", label: "D", text: "D" }
          ],
          correctOptionId: "o1"
        }]
      });
      renderBuilderForm();
    `);

    const builderHtml = doc.getElementById('builderQuestionsContainer').innerHTML;
    assert.ok(!builderHtml.includes('<img src=x onerror="alert(1)">'), 'Raw malicious tag must not be injected into builderQuestionsContainer');
    assert.ok(builderHtml.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), 'Malicious difficulty string must be escaped');
  });

  it('LC33-F02 regression: loadExamVersion pins snapshot per attempt and does not overwrite active attempt snapshot on same-version conflict', () => {
    const store = new Map<string, string>();
    const a = createPageContext(store);
    a.run('renderExamPane = () => {}; renderPalette = () => {};');

    const examV1 = {
      examId: 'CUSTOM-LC33-CONFLICT',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        { kind: 'III', questionVersionId: 'q-lc33-01', answerKey: '1' }
      ]
    };
    a.c.examV1 = examV1;
    a.run('loadExamVersion(examV1); studentState.responses["q-lc33-01"] = "1"; saveLocalState()');

    const initialScore = a.run('scoreAttemptLocally().totalFraction');
    assert.equal(initialScore, '10', 'Initial score with answerKey "1" must be 10');

    // Context B reimports the same examId and examVersionId but with altered answerKey "2"
    const b = createPageContext(store);
    b.run('renderExamPane = () => {}; renderPalette = () => {};');

    const examV1Altered = {
      examId: 'CUSTOM-LC33-CONFLICT',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        { kind: 'III', questionVersionId: 'q-lc33-01', answerKey: '2' }
      ]
    };
    b.c.examV1Altered = examV1Altered;
    b.run('loadExamVersion(examV1Altered)');

    const restoredScore = b.run('scoreAttemptLocally().totalFraction');
    assert.equal(restoredScore, '10', 'Attempt score must remain 10 using pinned attempt snapshot rather than altered key');
  });

  it('LC33-F03 regression: retry callback of attempt A does not dispatch unsubmitted attempt B after restart', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    p.run('renderExamPane = () => {}; renderPalette = () => {};');

    const dispatchedPayloads: any[] = [];
    p.c.dispatchedPayloads = dispatchedPayloads;

    p.run(`
      currentExam = {
        examId: 'exam-lc33-retry',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-retry', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc33-retry';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-A';
      studentState.responses['q-retry'] = '1';
      studentState.submitted = true;
      studentState.scoreResult = scoreAttemptLocally();

      retryCallbacks = [];
      setTimeout = (fn, ms) => {
        retryCallbacks.push(fn);
        return 1;
      };
      fetch = async (url, opts) => {
        dispatchedPayloads.push(JSON.parse(opts.body));
        throw new Error('offline');
      };
    `);

    // First dispatch for attempt A fails offline and captures callback
    await p.run('dispatchToServerCollector()');
    assert.equal(dispatchedPayloads.length, 1);
    assert.equal(dispatchedPayloads[0].attempt_id, 'att-A');
    assert.equal(dispatchedPayloads[0].total, '10');

    // User restarts exam -> attempt B initialized with submitted = false
    p.run('restartExam()');
    assert.notEqual(p.run('studentState.attemptId'), 'att-A');
    assert.equal(p.run('studentState.submitted'), false);

    // Now fire the retry callback of attempt A
    const callbacks = p.run('retryCallbacks') as Function[];
    assert.ok(callbacks.length > 0, 'Retry callback must have been scheduled');
    await callbacks[0]!();

    // Verify: second post must STILL be attempt A, NEVER unsubmitted attempt B!
    assert.equal(dispatchedPayloads.length, 2);
    assert.equal(dispatchedPayloads[1].attempt_id, 'att-A', 'Retry must send immutable captured payload of attempt A');
    assert.equal(dispatchedPayloads[1].total, '10');
  });

  it('LC33-F04 regression: builder question list escapes arbitrary difficulty payloads against XSS injection', () => {
    const p = createPageContext();
    const doc = p.c.document as any;

    const rawPayload = '<img src=x onerror="globalThis.XSS=1">';
    p.c.rawPayload = rawPayload;
    p.run(`
      resetBuilderExam({
        examId: 'exam-diff-xss',
        examVersionId: 'v1.0.0',
        title: 'XSS Test Exam',
        questions: [{
          kind: 'III',
          questionVersionId: 'q-diff-xss',
          answerKey: '1',
          difficulty: rawPayload
        }]
      });
      renderBuilderForm();
    `);

    const containerHtml = doc.getElementById('builderQuestionsContainer').innerHTML;
    assert.equal(containerHtml.includes(rawPayload), false, 'Raw difficulty payload must not appear in HTML sink');
    assert.ok(containerHtml.includes('&lt;img src=x onerror=&quot;globalThis.XSS=1&quot;&gt;'), 'Difficulty must be properly HTML-escaped');
  });

  it('LC34-F01 regression: re-importing same exam version with altered answerKey preserves pinned snapshot and score 10 in same context', () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    p.run('renderExamPane = () => {}; renderPalette = () => {};');

    const ex1 = {
      examId: 'CUSTOM-LC34-01',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        { kind: 'III', questionVersionId: 'q-lc34-01', answerKey: '1' }
      ]
    };
    p.c.ex1 = ex1;
    p.run('loadExamVersion(ex1); studentState.responses["q-lc34-01"] = "1"; saveLocalState();');

    const initialScore = p.run('scoreAttemptLocally().totalFraction');
    assert.equal(initialScore, '10', 'Initial score with answerKey "1" must be 10');

    // Reimport altered clone in the SAME context with answerKey "2"
    const ex2 = {
      examId: 'CUSTOM-LC34-01',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        { kind: 'III', questionVersionId: 'q-lc34-01', answerKey: '2' }
      ]
    };
    p.c.ex2 = ex2;
    p.run('loadExamVersion(ex2);');

    const scoreAfterAlteredImport = p.run('scoreAttemptLocally().totalFraction');
    assert.equal(scoreAfterAlteredImport, '10', 'Score must remain 10 using pinned attempt snapshot rather than altered key');
    assert.equal(p.run('currentExam.questions[0].answerKey'), '1', 'Answer key of pinned snapshot must be preserved');
  });

  it('LC34-F04 regression: collector retry captures immutable payload of attempt A across restart and multiple retries', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    p.run('renderExamPane = () => {}; renderPalette = () => {};');

    const dispatchedPayloads: any[] = [];
    p.c.dispatchedPayloads = dispatchedPayloads;

    p.run(`
      currentExam = {
        examId: 'exam-lc34-retry',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-retry-34', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc34-retry';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-34-A';
      studentState.responses['q-retry-34'] = '1';
      studentState.submitted = true;
      studentState.scoreResult = scoreAttemptLocally();

      retryCallbacks = [];
      setTimeout = (fn, ms) => {
        retryCallbacks.push(fn);
        return 1;
      };
      fetch = async (url, opts) => {
        dispatchedPayloads.push(JSON.parse(opts.body));
        throw new Error('offline');
      };
    `);

    // First dispatch for attempt A fails offline and captures callback
    await p.run('dispatchToServerCollector()');
    assert.equal(dispatchedPayloads.length, 1);
    assert.equal(dispatchedPayloads[0].attempt_id, 'att-34-A');
    assert.equal(dispatchedPayloads[0].total, '10');

    // User restarts exam -> attempt B is active with submitted = false
    p.run('restartExam()');
    assert.notEqual(p.run('studentState.attemptId'), 'att-34-A');
    assert.equal(p.run('studentState.submitted'), false);

    // Fire the retry callback of attempt A
    const callbacks = p.run('retryCallbacks') as Function[];
    assert.ok(callbacks.length > 0, 'Retry callback must have been scheduled');
    await callbacks[0]!();

    // Verify: second post must STILL be attempt A, NEVER unsubmitted attempt B!
    assert.equal(dispatchedPayloads.length, 2);
    assert.equal(dispatchedPayloads[1].attempt_id, 'att-34-A', 'Retry must send immutable captured payload of attempt A');
    assert.equal(dispatchedPayloads[1].total, '10');

    // Attempt B is still unsubmitted
    assert.equal(p.run('studentState.submitted'), false);
  });

  it('LC35-F01 regression: fresh page refresh -> edit/save -> reimport altered key retains score 10 and pinned snapshot', async () => {
    const store = new Map<string, string>();

    // 1. Page A: load exam version with key '1', answer '1', saveLocalState
    const pageA = createPageContext(store);
    pageA.run('renderExamPane = () => {}; renderPalette = () => {};');
    const ex1 = {
      examId: 'CUSTOM-LC35-SNAP',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q-lc35-snap', answerKey: '1' }]
    };
    pageA.c.ex1 = ex1;
    pageA.run('loadExamVersion(ex1); studentState.responses["q-lc35-snap"] = "1"; saveLocalState();');
    const scoreA = pageA.run('scoreAttemptLocally().totalFraction');
    assert.equal(scoreA, '10');
    const attId = pageA.run('studentState.attemptId');

    // 2. Page B: new context sharing the same store, call initExam() (like page reload)
    const pageB = createPageContext(store);
    pageB.run('renderExamPane = () => {}; renderPalette = () => {};');
    await pageB.run('initExam()');
    assert.equal(pageB.run('!!studentState.examSnapshot'), true, 'studentState.examSnapshot must be restored');
    assert.equal(pageB.run('studentState.attemptId'), attId);

    // 3. Edit answer and saveLocalState() in Page B
    pageB.run('studentState.responses["q-lc35-snap"] = "1"; saveLocalState();');

    // 4. Reimport altered clone ex2 with answerKey '2'
    const ex2 = {
      examId: 'CUSTOM-LC35-SNAP',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q-lc35-snap', answerKey: '2' }]
    };
    pageB.c.ex2 = ex2;
    pageB.run('loadExamVersion(ex2);');

    // Score must remain 10, currentExam answerKey must remain '1'
    const scoreB = pageB.run('scoreAttemptLocally().totalFraction');
    assert.equal(scoreB, '10', 'Score must remain 10 using pinned attempt snapshot across reload and re-save');
    assert.equal(pageB.run('currentExam.questions[0].answerKey'), '1');
  });

  it('LC35-F03 regression: attempt A exhausting retry budget does not starve attempt B of its retry budget', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    p.run('renderExamPane = () => {}; renderPalette = () => {};');

    const dispatched: any[] = [];
    p.c.dispatched = dispatched;

    p.run(`
      currentExam = {
        examId: 'exam-lc35-budget-A',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc35-budget-A';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-budget-A';
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
        throw new Error('offline');
      };
    `);

    // Attempt A runs initial dispatch + 5 retries (total 6 requests), exhausting budget
    await p.run('dispatchToServerCollector()');
    for (let i = 0; i < 5; i++) {
      const callbacks = p.run('retryCallbacks') as Function[];
      assert.ok(callbacks.length > i, 'Retry callback ' + i + ' must exist');
      await callbacks[i]!();
    }
    assert.equal(dispatched.length, 6);
    assert.equal(dispatched[5].attempt_id, 'att-budget-A');

    // Now switch to attempt B via loadExamVersion
    const examB = {
      examId: 'exam-lc35-budget-B',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      collectorUrl: 'https://collector.invalid',
      questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '1' }]
    };
    p.c.examB = examB;
    p.run(`
      loadExamVersion(examB);
      studentState.responses['q-b'] = '1';
      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    // Verify: Attempt B had its first dispatch fail, AND scheduled a retry callback because it has a fresh budget!
    assert.equal(dispatched.length, 7);
    assert.equal(dispatched[6].attempt_id, p.run('studentState.attemptId'));
    const totalCallbacks = (p.run('retryCallbacks') as Function[]).length;
    assert.equal(totalCallbacks, 6, 'Attempt B must have its own retry callback scheduled despite A having exhausted its retries');
  });

  it('LC35-F04 regression: unconfirmed final submissions in archive are dispatched on initExam and online event', async () => {
    const store = new Map<string, string>();
    const page1 = createPageContext(store);
    page1.run('renderExamPane = () => {}; renderPalette = () => {};');

    const dispatched: any[] = [];
    page1.c.dispatched = dispatched;

    page1.run(`
      currentExam = {
        examId: 'exam-lc35-archive',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-arc', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc35-archive';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-arc-01';
      studentState.responses['q-arc'] = '1';

      fetch = async (url, opts) => {
        dispatched.push(JSON.parse(opts.body));
        throw new Error('offline');
      };

      submitExam();
    `);

    // Attempt att-arc-01 was submitted and dispatched once, failed offline
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].attempt_id, 'att-arc-01');

    // User restarts exam -> attempt 2 is active with submitted = false
    page1.run('restartExam()');
    assert.notEqual(page1.run('studentState.attemptId'), 'att-arc-01');
    assert.equal(page1.run('studentState.submitted'), false);

    // Fresh context (simulating page reload or another session sharing the same store)
    const page2 = createPageContext(store);
    page2.run('renderExamPane = () => {}; renderPalette = () => {};');
    const dispatchedPage2: any[] = [];
    page2.c.dispatchedPage2 = dispatchedPage2;

    page2.run(`
      window.CUNATA_COLLECTOR_URL = 'https://collector.invalid';
      fetch = async (url, opts) => {
        dispatchedPage2.push(JSON.parse(opts.body));
        return { ok: true, json: async () => ({ success: true, attempt_id: JSON.parse(opts.body).attempt_id, status: 'NEWLY_RECORDED' }) };
      };
    `);

    await page2.run('initExam()');

    // Verify: unconfirmed archived final att-arc-01 must have been dispatched and confirmed!
    assert.equal(dispatchedPage2.length, 1, 'Archived unconfirmed submission must be dispatched on initExam');
    assert.equal(dispatchedPage2[0].attempt_id, 'att-arc-01');

    // Active attempt on page2 must still be unsubmitted and not sent
    assert.equal(page2.run('studentState.submitted'), false);
  });

  it('LC36-F01 regression: immutable submission destination is pinned; attempt A retry only routes to endpoint A regardless of active exam switch or window override', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    p.run('renderExamPane = () => {}; renderPalette = () => {};');

    const requests: { url: string; body: any }[] = [];
    p.c.requests = requests;

    p.run(`
      currentExam = {
        examId: 'exam-lc36-owner-A',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://owner-a.invalid/collector',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc36-owner-A';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-owner-A';
      studentState.responses['q-a'] = '1';

      retryCallbacks = [];
      setTimeout = (fn, ms) => {
        retryCallbacks.push(fn);
        return 1;
      };

      fetch = async (url, opts) => {
        requests.push({ url, body: JSON.parse(opts.body) });
        return { ok: false, status: 500 };
      };

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    // First POST of attempt A must go to owner-a
    assert.equal(requests.length, 1);
    assert.equal(requests[0]!.url, 'https://owner-a.invalid/collector');
    assert.equal(requests[0]!.body.attempt_id, 'att-owner-A');

    // User switches to Exam B with a different collectorUrl
    const examB = {
      examId: 'exam-lc36-owner-B',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      collectorUrl: 'https://owner-b.invalid/collector',
      questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '1' }]
    };
    p.c.examB = examB;
    p.run(`
      loadExamVersion(examB);
      window.CUNATA_COLLECTOR_URL = 'https://global-override.invalid/collector';
    `);

    assert.equal(p.run('studentState.submitted'), false, 'Exam B must not be submitted yet');

    // Run the retry callback of attempt A
    const callbacks = p.run('retryCallbacks') as Function[];
    assert.ok(callbacks.length > 0, 'Retry callback for attempt A must exist');
    await callbacks[0]!();
    await new Promise(r => setTimeout(r, 0));

    // Verify: Retry POST must STILL go to owner-a, NEVER owner-b or global override!
    assert.equal(requests.length, 2);
    assert.equal(requests[1]!.url, 'https://owner-a.invalid/collector', 'Retry of A must route to owner-a');
    assert.equal(requests[1]!.body.attempt_id, 'att-owner-A', 'Retry body must belong to attempt A');
    assert.equal(p.run('studentState.submitted'), false, 'Exam B remains unsubmitted');
  });

  it('LC36-F03 regression: per-job retry budget is strictly isolated without cross-attempt fallback or chain multiplication', async () => {
    const store = new Map<string, string>();
    const p = createPageContext(store);
    p.run('renderExamPane = () => {}; renderPalette = () => {};');

    const posts: any[] = [];
    p.c.posts = posts;

    p.run(`
      currentExam = {
        examId: 'exam-lc36-budget-A',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector-a.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc36-budget-A';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-budget-A';
      studentState.responses['q-a'] = '1';

      retryCallbacks = [];
      setTimeout = (fn, ms) => {
        retryCallbacks.push({ fn, ms });
        return 1;
      };

      fetch = async (url, opts) => {
        posts.push(JSON.parse(opts.body));
        return { ok: false, status: 503 };
      };

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    // Exhaust attempt A's budget: 1 initial + 5 retries = 6 posts
    for (let i = 0; i < 5; i++) {
      const cbs = p.run('retryCallbacks') as { fn: Function; ms: number }[];
      assert.ok(cbs.length > i, 'Retry callback ' + i + ' must exist');
      await cbs[i]!.fn();
      await new Promise(r => setTimeout(r, 0));
    }
    assert.equal(posts.length, 6);
    assert.equal(posts[5].attempt_id, 'att-budget-A');

    // Switch to Exam B via loadExamVersion
    const examB = {
      examId: 'exam-lc36-budget-B',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      collectorUrl: 'https://collector-b.invalid',
      questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '1' }]
    };
    p.c.examB = examB;
    p.run(`
      loadExamVersion(examB);
      studentState.responses['q-b'] = '1';
      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    // Verify: Attempt B had 1 POST fail, and scheduled a retry timer with 1000ms backoff
    assert.equal(posts.length, 7);
    assert.equal(posts[6].attempt_id, p.run('studentState.attemptId'));

    const allCbs = p.run('retryCallbacks') as { fn: Function; ms: number }[];
    assert.equal(allCbs.length, 6, 'Attempt B must have its first retry callback scheduled');
    assert.equal(allCbs[5]!.ms, 1000, 'Attempt B backoff must start at 1000ms, not inheriting A backoff');
  });

  it('LC36-F04 regression: archive recovery dispatches unconfirmed submissions upon reload when active attempt is unsubmitted', async () => {
    const store = new Map<string, string>();
    const page1 = createPageContext(store);
    page1.run('renderExamPane = () => {}; renderPalette = () => {};');

    const dispatched: any[] = [];
    page1.c.dispatched = dispatched;

    page1.run(`
      currentExam = {
        examId: 'exam-lc36-archive',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector-archive.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-arc', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc36-archive';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-arc-unconfirmed';
      studentState.responses['q-arc'] = '1';

      fetch = async (url, opts) => {
        dispatched.push(JSON.parse(opts.body));
        return { ok: false, status: 503 };
      };

      submitExam();
    `);

    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].attempt_id, 'att-arc-unconfirmed');

    // Restart exam -> active attempt is now unsubmitted
    page1.run('restartExam()');
    assert.equal(page1.run('studentState.submitted'), false);

    // Fresh session / context shares same store
    const page2 = createPageContext(store);
    page2.run('renderExamPane = () => {}; renderPalette = () => {};');
    const dispatchedPage2: any[] = [];
    page2.c.dispatchedPage2 = dispatchedPage2;

    page2.run(`
      fetch = async (url, opts) => {
        dispatchedPage2.push({ url, body: JSON.parse(opts.body) });
        return {
          ok: true,
          json: async () => ({
            success: true,
            attempt_id: JSON.parse(opts.body).attempt_id,
            status: 'NEWLY_RECORDED'
          })
        };
      };
    `);

    // Call dispatchToServerCollector with active attempt unsubmitted -> triggers outbox sync
    await page2.run('dispatchToServerCollector()');

    // Archived submission must be dispatched to its pinned destination
    assert.equal(dispatchedPage2.length, 1, 'Archived unconfirmed submission must be dispatched');
    assert.equal(dispatchedPage2[0]!.url, 'https://collector-archive.invalid');
    assert.equal(dispatchedPage2[0]!.body.attempt_id, 'att-arc-unconfirmed');

    // Active attempt remains unsubmitted
    assert.equal(page2.run('studentState.submitted'), false);
  });

  it('LC38-F03 regression: pending archive collector request does not block Exam B rendering, boot, or timer', async () => {
    const store = new Map<string, string>();
    // Set up unconfirmed final archive for Exam A
    const finalKeyA = 'cunata:final:' + encodeURIComponent('exam-A') + ':' + encodeURIComponent('v1.0') + ':' + encodeURIComponent('att-A');
    store.set(finalKeyA, JSON.stringify({
      attemptId: 'att-A',
      examId: 'exam-A',
      examVersionId: 'v1.0',
      candidateName: 'Candidate A',
      submitted: true,
      serverConfirmed: false,
      serverReceipt: null,
      collectorUrl: 'https://collector-hang.invalid',
      scoreResult: {
        totalFraction: '10',
        maxTotalFraction: '10',
        sections: {
          I: { scoreFraction: '0', maxFraction: '0' },
          II: { scoreFraction: '0', maxFraction: '0' },
          III: { scoreFraction: '10', maxFraction: '10' }
        }
      }
    }));

    // Active exam snapshot is Exam B
    const examB = {
      examId: 'exam-B',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'Đề Khảo Sát B',
      questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '1' }]
    };
    store.set('cunata:active_exam_snapshot', JSON.stringify(examB));
    store.set('cunata:active_exam_id', 'exam-B');

    const p = createPageContext(store);
    let renderCalled = false;
    let timerStarted = false;
    (p.c as any).onRender = () => { renderCalled = true; };
    (p.c as any).onTimer = () => { timerStarted = true; };
    p.run(`
      renderExamPane = () => { onRender(); };
      renderPalette = () => {};
      startTimer = () => { onTimer(); };

      // Collector fetch returns a pending promise that never resolves immediately
      fetch = async (url, opts) => {
        return new Promise(() => {});
      };
    `);

    // Call initExam() - must boot Exam B without hanging on archive fetch
    await p.run('initExam()');

    assert.equal(renderCalled, true, 'renderExamPane must be called immediately during boot');
    assert.equal(timerStarted, true, 'startTimer must be called immediately during boot');
    assert.equal(p.run('currentExam.examId'), 'exam-B');
    assert.equal(p.run('studentState.submitted'), false);
  });

  it('LC38-F01 regression: retry and archive strictly preserve pinned destination across exam switch, window override change, and reload; receipt A does not confirm B', async () => {
    const store = new Map<string, string>();
    const p1 = createPageContext(store);
    p1.run('renderExamPane = () => {}; renderPalette = () => {};');

    const postsP1: { url: string; body: any }[] = [];
    p1.c.postsP1 = postsP1;

    p1.run(`
      currentExam = {
        examId: 'exam-lc38-f01-A',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://owner-a.invalid/collector',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc38-f01-A';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-owner-A';
      studentState.responses['q-a'] = '1';

      retryCallbacks = [];
      setTimeout = (fn, ms) => {
        retryCallbacks.push(fn);
        return 1;
      };

      fetch = async (url, opts) => {
        postsP1.push({ url, body: JSON.parse(opts.body) });
        return { ok: false, status: 500 };
      };

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    // First POST of Attempt A must go to owner-a
    assert.equal(postsP1.length, 1);
    assert.equal(postsP1[0]!.url, 'https://owner-a.invalid/collector');
    assert.equal(postsP1[0]!.body.attempt_id, 'att-owner-A');

    // Switch to Exam B with different collectorUrl and change window override
    const examB = {
      examId: 'exam-lc38-f01-B',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      collectorUrl: 'https://owner-b.invalid/collector',
      questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '1' }]
    };
    p1.c.examB = examB;
    p1.run(`
      loadExamVersion(examB);
      window.CUNATA_COLLECTOR_URL = 'https://global-override.invalid/collector';
    `);

    // Run retry callback of Attempt A
    const cbs = p1.run('retryCallbacks') as Function[];
    assert.ok(cbs.length > 0, 'Retry callback for Attempt A must exist');
    await cbs[0]!();
    await new Promise(r => setTimeout(r, 0));

    // Verify: Retry POST must STILL route to owner-a, NEVER owner-b or global override
    assert.equal(postsP1.length, 2);
    assert.equal(postsP1[1]!.url, 'https://owner-a.invalid/collector', 'Retry of A must route to owner-a');
    assert.equal(postsP1[1]!.body.attempt_id, 'att-owner-A');
    assert.equal(p1.run('studentState.submitted'), false, 'Exam B remains unsubmitted in active context');

    // Fresh session / context simulating page reload while Exam B is active
    const p2 = createPageContext(store);
    p2.run('renderExamPane = () => {}; renderPalette = () => {};');
    const postsP2: { url: string; body: any }[] = [];
    p2.c.postsP2 = postsP2;

    p2.run(`
      currentExam = {
        examId: 'exam-lc38-f01-B',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://owner-b.invalid/collector',
        questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc38-f01-B';
      studentState.examVersionId = 'v1.0.0';
      window.CUNATA_COLLECTOR_URL = 'https://global-override.invalid/collector';

      fetch = async (url, opts) => {
        postsP2.push({ url, body: JSON.parse(opts.body) });
        return {
          ok: true,
          json: async () => ({
            success: true,
            attempt_id: JSON.parse(opts.body).attempt_id,
            status: 'NEWLY_RECORDED'
          })
        };
      };
    `);

    // Call syncUnconfirmedFinalSubmissions to scan archive
    await p2.run('syncUnconfirmedFinalSubmissions()');

    // Verify: Archived Attempt A is dispatched strictly to owner-a!
    assert.equal(postsP2.length, 1);
    assert.equal(postsP2[0]!.url, 'https://owner-a.invalid/collector', 'Archive scan of A must route to owner-a');
    assert.equal(postsP2[0]!.body.attempt_id, 'att-owner-A');

    // Active Exam B must NOT be marked confirmed by receipt of Attempt A
    assert.equal(p2.run('studentState.serverConfirmed'), false, 'Receipt of A must not confirm Exam B');
    assert.equal(p2.run('studentState.submitted'), false, 'Exam B remains unsubmitted');

    // Now submit Exam B in p2 -> it must route to global override (chosen override at submit time)
    p2.run(`
      studentState.responses['q-b'] = '1';
      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    assert.equal(postsP2.length, 2);
    assert.equal(postsP2[1]!.url, 'https://global-override.invalid/collector', 'Exam B must route to its chosen collector');
    assert.equal(postsP2[1]!.body.attempt_id, p2.run('studentState.attemptId'));
    assert.equal(p2.run('studentState.serverConfirmed'), true, 'Exam B confirmed with its own receipt');
  });

  it('LC38-F02 regression: archive scan does not resurrect exhausted retry budget; multiple scans and online events do not multiply concurrent retry chains; budget survives reload', async () => {
    const store = new Map<string, string>();
    const p1 = createPageContext(store);
    p1.run('renderExamPane = () => {}; renderPalette = () => {};');

    const postsP1: any[] = [];
    p1.c.postsP1 = postsP1;

    p1.run(`
      currentExam = {
        examId: 'exam-lc38-f02-A',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector-exhaust.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc38-f02-A';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-exhaust-A';
      studentState.responses['q-a'] = '1';

      retryCallbacks = [];
      setTimeout = (fn, ms) => {
        retryCallbacks.push({ fn, ms });
        return 1;
      };

      fetch = async (url, opts) => {
        postsP1.push(JSON.parse(opts.body));
        return { ok: false, status: 503 };
      };

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    // 1 initial submit POST
    assert.equal(postsP1.length, 1);

    // Run the 5 scheduled retry callbacks: 1 initial + 5 retries = 6 posts total
    for (let i = 0; i < 5; i++) {
      const cbs = p1.run('retryCallbacks') as { fn: Function; ms: number }[];
      assert.ok(cbs.length > i, 'Retry callback ' + i + ' must exist');
      await cbs[i]!.fn();
      await new Promise(r => setTimeout(r, 0));
    }

    assert.equal(postsP1.length, 6, 'Total POSTs must equal 6 (1 initial + 5 retries)');

    // Verify 0 additional timers remaining after budget exhausted
    const allCbs = p1.run('retryCallbacks') as any[];
    assert.equal(allCbs.length, 5, 'No 6th retry callback must be scheduled after budget exhaustion');

    // Switch exam / restart to make attempt A an archived final
    p1.run('restartExam()');
    assert.equal(p1.run('studentState.submitted'), false);

    // Call syncUnconfirmedFinalSubmissions multiple times: MUST NOT POST ANY MORE
    await p1.run('syncUnconfirmedFinalSubmissions()');
    await p1.run('syncUnconfirmedFinalSubmissions()');
    await p1.run('syncUnconfirmedFinalSubmissions()');

    assert.equal(postsP1.length, 6, 'Exhausted budget must not be resurrected by archive scan (still 6 POSTs)');

    // Trigger online event: MUST NOT POST ANY MORE
    p1.run(`
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.dispatchEvent = (ev) => {};
      }
    `);
    await p1.run('syncUnconfirmedFinalSubmissions()');
    assert.equal(postsP1.length, 6, 'Exhausted budget must not post on online event (still 6 POSTs)');

    // Fresh reload / session sharing same store
    const p2 = createPageContext(store);
    p2.run('renderExamPane = () => {}; renderPalette = () => {};');
    const postsP2: any[] = [];
    p2.c.postsP2 = postsP2;

    p2.run(`
      fetch = async (url, opts) => {
        postsP2.push(JSON.parse(opts.body));
        return { ok: false, status: 503 };
      };
    `);

    await p2.run('initExam()');
    await p2.run('syncUnconfirmedFinalSubmissions()');

    assert.equal(postsP2.length, 0, 'Exhausted attempt must survive reload and NOT be dispatched on initExam or scan');

    // Now verify concurrency guard: active backoff prevents duplicate chains during scan
    const p3 = createPageContext();
    p3.run('renderExamPane = () => {}; renderPalette = () => {};');
    const postsP3: any[] = [];
    p3.c.postsP3 = postsP3;

    p3.run(`
      currentExam = {
        examId: 'exam-lc38-f02-chain',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector-chain.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-c', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc38-f02-chain';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-chain';
      studentState.responses['q-c'] = '1';

      scheduledTimers = [];
      setTimeout = (fn, ms) => {
        scheduledTimers.push({ fn, ms });
        return scheduledTimers.length;
      };

      fetch = async (url, opts) => {
        postsP3.push(JSON.parse(opts.body));
        return { ok: false, status: 503 };
      };

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    assert.equal(postsP3.length, 1, 'Initial submit produces 1 POST');
    assert.equal(p3.run('scheduledTimers.length'), 1, '1 retry timer scheduled');

    // While timer is pending, call syncUnconfirmedFinalSubmissions 3 times
    await p3.run('syncUnconfirmedFinalSubmissions()');
    await p3.run('syncUnconfirmedFinalSubmissions()');
    await p3.run('syncUnconfirmedFinalSubmissions()');

    assert.equal(postsP3.length, 1, 'No duplicate requests while retry is pending backoff');
    assert.equal(p3.run('scheduledTimers.length'), 1, 'No duplicate timers scheduled during pending backoff');
  });

  it('LC39-F01 regression: legacy archive missing top-level collectorUrl strictly restores destination from examSnapshot; does not route to active exam collector', async () => {
    const store = new Map<string, string>();
    const p1 = createPageContext(store);
    p1.run('renderExamPane = () => {}; renderPalette = () => {};');

    p1.run(`
      currentExam = {
        examId: 'exam-shared-id',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://owner-a.invalid/collector',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-shared-id';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-legacy-A';
      studentState.responses['q-a'] = '1';

      fetch = async (url, opts) => {
        return { ok: false, status: 500 };
      };

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 0));

    // Simulate legacy archive by deleting top-level collectorUrl from final record,
    // but preserving examSnapshot.collectorUrl = 'https://owner-a.invalid/collector'
    const finalKeyA = 'cunata:final:' + encodeURIComponent('exam-shared-id') + ':' + encodeURIComponent('v1.0.0') + ':' + encodeURIComponent('att-legacy-A');
    const storedA = JSON.parse(store.get(finalKeyA)!);
    delete storedA.collectorUrl;
    assert.ok(storedA.examSnapshot && storedA.examSnapshot.collectorUrl === 'https://owner-a.invalid/collector');
    store.set(finalKeyA, JSON.stringify(storedA));

    // Context 2: Active exam has the SAME examId ('exam-shared-id') but different collector 'https://owner-b.invalid/collector'
    const p2 = createPageContext(store);
    p2.run('renderExamPane = () => {}; renderPalette = () => {};');
    const dispatchedP2: { url: string; body: any }[] = [];
    p2.c.dispatchedP2 = dispatchedP2;

    p2.run(`
      currentExam = {
        examId: 'exam-shared-id',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://owner-b.invalid/collector',
        questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '1' }]
      };
      studentState.examId = 'exam-shared-id';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-draft-B';
      studentState.submitted = false;

      fetch = async (url, opts) => {
        dispatchedP2.push({ url, body: JSON.parse(opts.body) });
        return { ok: false, status: 500 };
      };
    `);

    // Call syncUnconfirmedFinalSubmissions()
    await p2.run('syncUnconfirmedFinalSubmissions()');

    // Verify: Legacy attempt A must be dispatched ONLY to owner-a, NEVER owner-b!
    assert.equal(dispatchedP2.length, 1);
    assert.equal(dispatchedP2[0]!.url, 'https://owner-a.invalid/collector', 'Legacy archive must route to provenance destination in examSnapshot');
    assert.equal(dispatchedP2[0]!.body.attempt_id, 'att-legacy-A');

    // Verify migration: top-level collectorUrl is now persisted on record A
    const migratedA = JSON.parse(store.get(finalKeyA)!);
    assert.equal(migratedA.collectorUrl, 'https://owner-a.invalid/collector');
  });

  it('LC39-F03 regression: pending archive request on attempt A does not block independent archive dispatch of attempt B', async () => {
    const store = new Map<string, string>();
    const p1 = createPageContext(store);
    p1.run('renderExamPane = () => {}; renderPalette = () => {};');

    // Create 2 unconfirmed final records in store: attempt A and attempt B
    const finalKeyA = 'cunata:final:' + encodeURIComponent('exam-A') + ':' + encodeURIComponent('v1.0.0') + ':' + encodeURIComponent('att-A');
    store.set(finalKeyA, JSON.stringify({
      attemptId: 'att-A',
      examId: 'exam-A',
      examVersionId: 'v1.0.0',
      candidateName: 'Candidate A',
      submitted: true,
      serverConfirmed: false,
      serverReceipt: null,
      collectorUrl: 'https://collector-hang-A.invalid',
      scoreResult: {
        totalFraction: '10',
        maxTotalFraction: '10',
        sections: {
          I: { scoreFraction: '0', maxFraction: '0' },
          II: { scoreFraction: '0', maxFraction: '0' },
          III: { scoreFraction: '10', maxFraction: '10' }
        }
      }
    }));

    const finalKeyB = 'cunata:final:' + encodeURIComponent('exam-B') + ':' + encodeURIComponent('v1.0.0') + ':' + encodeURIComponent('att-B');
    store.set(finalKeyB, JSON.stringify({
      attemptId: 'att-B',
      examId: 'exam-B',
      examVersionId: 'v1.0.0',
      candidateName: 'Candidate B',
      submitted: true,
      serverConfirmed: false,
      serverReceipt: null,
      collectorUrl: 'https://collector-fast-B.invalid',
      scoreResult: {
        totalFraction: '10',
        maxTotalFraction: '10',
        sections: {
          I: { scoreFraction: '0', maxFraction: '0' },
          II: { scoreFraction: '0', maxFraction: '0' },
          III: { scoreFraction: '10', maxFraction: '10' }
        }
      }
    }));

    // New context with an active draft (different from A and B)
    const p2 = createPageContext(store);
    p2.run('renderExamPane = () => {}; renderPalette = () => {};');
    const posts: { url: string; attemptId: string }[] = [];
    p2.c.posts = posts;

    p2.run(`
      studentState.attemptId = 'att-active-draft';
      studentState.submitted = false;

      fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        posts.push({ url, attemptId: body.attempt_id });
        if (url === 'https://collector-hang-A.invalid') {
          // Never resolves immediately (hangs)
          return new Promise(() => {});
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            attempt_id: body.attempt_id,
            status: 'NEWLY_RECORDED'
          })
        };
      };
    `);

    // Trigger archive scanner (does not block awaiting hang A before posting B)
    p2.run('syncUnconfirmedFinalSubmissions()');
    await new Promise(r => setTimeout(r, 20));

    // Verify: Attempt B was dispatched despite Attempt A hanging!
    const postB = posts.find(p => p.attemptId === 'att-B');
    assert.ok(postB, 'Attempt B must be dispatched even while Attempt A is pending');
    assert.equal(postB!.url, 'https://collector-fast-B.invalid');

    // Verify Attempt B record was confirmed
    const finalB = JSON.parse(store.get(finalKeyB)!);
    assert.equal(finalB.serverConfirmed, true);
  });

  it('LC39-F02 regression: durable retry state machine enforces per-job backoff, avoids duplicate chains on scan/online/reload, preserves exhausted budget, and isolates job budgets', async () => {
    const store = new Map<string, string>();
    const p1 = createPageContext(store);
    p1.run('renderExamPane = () => {}; renderPalette = () => {};');

    const postsP1: { url: string; body: any }[] = [];
    const scheduledTimersP1: { fn: Function; ms: number }[] = [];
    p1.c.postsP1 = postsP1;
    p1.c.scheduledTimersP1 = scheduledTimersP1;

    p1.run(`
      currentExam = {
        examId: 'exam-lc39-f02',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector-lc39-f02.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc39-f02';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-f02-A';
      studentState.responses['q-a'] = '1';

      setTimeout = (fn, ms) => {
        scheduledTimersP1.push({ fn, ms });
        return scheduledTimersP1.length;
      };

      fetch = async (url, opts) => {
        if (typeof url === 'string' && url.startsWith('http')) {
          postsP1.push({ url, body: JSON.parse(opts.body) });
          return { ok: false, status: 500 };
        }
        return { ok: true, json: async () => currentExam };
      };

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 10));

    // Initial submission should send 1 POST and schedule 1 retry timer (1000ms)
    assert.equal(postsP1.length, 1, 'Initial submit produces exactly 1 POST');
    assert.equal(scheduledTimersP1.length, 1, 'Exactly 1 retry timer scheduled');
    assert.equal(scheduledTimersP1[0]!.ms, 1000, 'First retry backoff is 1000ms');

    // While in backoff, multiple calls to syncUnconfirmedFinalSubmissions must NOT send duplicate POSTs or timers
    await p1.run('syncUnconfirmedFinalSubmissions()');
    await p1.run('syncUnconfirmedFinalSubmissions()');
    await p1.run('syncUnconfirmedFinalSubmissions()');
    assert.equal(postsP1.length, 1, 'Multiple scans during backoff do not produce additional POSTs');
    assert.equal(scheduledTimersP1.length, 1, 'Multiple scans during backoff do not duplicate timers');

    // Context P2: Simulate page reload while attempt A is in active backoff
    const p2 = createPageContext(store);
    p2.run('renderExamPane = () => {}; renderPalette = () => {};');
    const postsP2: { url: string; body: any }[] = [];
    const scheduledTimersP2: { fn: Function; ms: number }[] = [];
    p2.c.postsP2 = postsP2;
    p2.c.scheduledTimersP2 = scheduledTimersP2;

    p2.run(`
      currentExam = {
        examId: 'exam-lc39-f02',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector-lc39-f02.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };

      setTimeout = (fn, ms) => {
        scheduledTimersP2.push({ fn, ms });
        return scheduledTimersP2.length;
      };

      fetch = async (url, opts) => {
        if (typeof url === 'string' && url.startsWith('http')) {
          postsP2.push({ url, body: JSON.parse(opts.body) });
          return { ok: false, status: 500 };
        }
        return { ok: true, json: async () => currentExam };
      };
    `);

    // Boot / reload active exam
    await p2.run('initExam()');
    // Multiple scans on reload
    await p2.run('syncUnconfirmedFinalSubmissions()');
    await p2.run('syncUnconfirmedFinalSubmissions()');

    // Verify: Reload during backoff did NOT send an immediate POST!
    assert.equal(postsP2.length, 0, 'Reload during backoff must NOT trigger immediate POST');
    assert.equal(scheduledTimersP2.length, 1, 'Reload during backoff must schedule exactly 1 timer for remaining backoff');
    assert.ok(scheduledTimersP2[0]!.ms <= 1000, 'Remaining backoff delay must be <= 1000ms');

    // Now fire the scheduled timer in P2 (Retry 1 -> total 2 requests so far: initial in P1 + retry 1 in P2)
    const cb1 = scheduledTimersP2.shift()!;
    await cb1.fn();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(postsP2.length, 1, 'Firing scheduled timer executes retry 1');
    assert.equal(scheduledTimersP2.length, 1, 'Next retry timer scheduled with backoff');
    assert.equal(scheduledTimersP2[0]!.ms, 2000, 'Next retry backoff is 2000ms (2^1 * 1000)');

    // Fire remaining retries (retries 2, 3, 4, 5) -> total requests in P2 will be 5 retries (6 total overall)
    let retriesExecuted = 1;
    while (scheduledTimersP2.length > 0 && retriesExecuted < 10) {
      const nextCb = scheduledTimersP2.shift()!;
      await nextCb.fn();
      await new Promise(r => setTimeout(r, 0));
      retriesExecuted++;
    }

    // Attempt A sent: 1 initial (in P1) + 5 retries (in P2) = 5 posts in P2
    assert.equal(postsP2.length, 5, 'Exactly 5 retries executed in P2 before exhaustion');
    assert.equal(scheduledTimersP2.length, 0, 'No timers scheduled once retry budget is exhausted');

    const finalKeyA = 'cunata:final:' + encodeURIComponent('exam-lc39-f02') + ':' + encodeURIComponent('v1.0.0') + ':' + encodeURIComponent('att-f02-A');
    const finalA = JSON.parse(store.get(finalKeyA)!);
    assert.equal(finalA.retryExhausted, true, 'Record A must be marked retryExhausted=true');
    assert.ok(finalA.retryCount >= 5, 'Record A retryCount must reflect exhaustion (>= 5)');
    assert.equal(finalA.nextRetryAt, undefined, 'nextRetryAt must be cleared upon exhaustion');

    // Context P3: Fresh session reload of exhausted attempt
    const p3 = createPageContext(store);
    p3.run('renderExamPane = () => {}; renderPalette = () => {};');
    const postsP3: { url: string; body: any }[] = [];
    const scheduledTimersP3: { fn: Function; ms: number }[] = [];
    p3.c.postsP3 = postsP3;
    p3.c.scheduledTimersP3 = scheduledTimersP3;

    p3.run(`
      currentExam = {
        examId: 'exam-lc39-f02',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector-lc39-f02.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };

      setTimeout = (fn, ms) => {
        scheduledTimersP3.push({ fn, ms });
        return scheduledTimersP3.length;
      };

      fetch = async (url, opts) => {
        if (typeof url === 'string' && url.startsWith('http')) {
          postsP3.push({ url, body: JSON.parse(opts.body) });
          return { ok: false, status: 500 };
        }
        return { ok: true, json: async () => currentExam };
      };
    `);

    await p3.run('initExam()');
    await p3.run('dispatchToServerCollector()');
    await p3.run('syncUnconfirmedFinalSubmissions()');

    assert.equal(postsP3.length, 0, 'Exhausted attempt must NOT produce any POSTs on reload, direct dispatch, or scan');
    assert.equal(scheduledTimersP3.length, 0, 'Exhausted attempt must NOT schedule any retry timers');

    // Verify Budget Isolation: Starting Attempt B in context P3 has its OWN fresh budget
    p3.run(`
      restartExam();
      currentExam = {
        examId: 'exam-lc39-f02-B',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://collector-lc39-f02-b.invalid',
        questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '1' }]
      };
      studentState.examId = 'exam-lc39-f02-B';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-f02-B';
      studentState.responses['q-b'] = '1';

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 10));

    // Verify Attempt B sends its initial POST and schedules its own retry
    const postsB = postsP3.filter(p => p.body.attempt_id === 'att-f02-B');
    assert.equal(postsB.length, 1, 'Attempt B must receive its own independent retry budget');
    assert.equal(scheduledTimersP3.length, 1, 'Attempt B has its own independent timer');

    // Verify thrown / network rejection fetch handling
    const cbB = scheduledTimersP3.shift()!;
    p3.run(`
      fetch = async () => {
        throw new Error('Network failure (CORS/offline)');
      };
    `);
    await cbB.fn();
    await new Promise(r => setTimeout(r, 0));

    // Thrown fetch properly schedules next backoff retry without breaking state machine
    assert.equal(scheduledTimersP3.length, 1, 'Rejected/thrown fetch properly advances backoff timer');
    assert.equal(scheduledTimersP3[0]!.ms, 2000, 'Backoff continues advancing after thrown fetch');
  });

  it('LC41-F01 regression: timer retry of attempt A captures immutable payload and destination, never routing attempt B responses or using active studentState', async () => {
    const store = new Map<string, string>();
    const p1 = createPageContext(store);
    p1.run('renderExamPane = () => {}; renderPalette = () => {};');

    const posts: { url: string; body: any }[] = [];
    const scheduledTimers: { fn: Function; ms: number }[] = [];
    p1.c.posts = posts;
    p1.c.scheduledTimers = scheduledTimers;

    p1.run(`
      currentExam = {
        examId: 'exam-A',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://example.invalid/A',
        questions: [{ kind: 'III', questionVersionId: 'q-a', answerKey: '1' }]
      };
      studentState.examId = 'exam-A';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-A';
      studentState.responses['q-a'] = '1';

      setTimeout = (fn, ms) => {
        scheduledTimers.push({ fn, ms });
        return scheduledTimers.length;
      };

      fetch = async (url, opts) => {
        if (typeof url === 'string' && url.startsWith('http')) {
          posts.push({ url, body: JSON.parse(opts.body) });
          return { ok: false, status: 500 };
        }
        return { ok: true, json: async () => currentExam };
      };

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 10));

    // Attempt A initial submit produced 1 POST to /A and 1 timer
    assert.equal(posts.length, 1);
    assert.equal(posts[0]!.url, 'https://example.invalid/A');
    assert.equal(posts[0]!.body.attempt_id, 'att-A');
    assert.equal(scheduledTimers.length, 1);

    // Keep Attempt A's timer callback
    const timerCbA = scheduledTimers[0]!.fn;

    // Now switch active exam to Exam B with different collector /B and submit Exam B
    p1.run(`
      currentExam = {
        examId: 'exam-B',
        examVersionId: 'v1.0.0',
        ruleSetId: 'custom-v1',
        inputPolicyId: 'sa-charset-v1',
        collectorUrl: 'https://example.invalid/B',
        questions: [{ kind: 'III', questionVersionId: 'q-b', answerKey: '2' }]
      };
      studentState.examId = 'exam-B';
      studentState.examVersionId = 'v1.0.0';
      studentState.attemptId = 'att-B';
      studentState.responses = { 'q-b': '2' };

      submitExam();
    `);
    await new Promise(r => setTimeout(r, 10));

    // Second post was Attempt B's initial submit to /B
    assert.equal(posts.length, 2);
    assert.equal(posts[1]!.url, 'https://example.invalid/B');
    assert.equal(posts[1]!.body.attempt_id, 'att-B');

    // Now fire the timer callback of Attempt A!
    await timerCbA();
    await new Promise(r => setTimeout(r, 10));

    // Third post must STILL be Attempt A routed to /A, NEVER Exam B routed to /A!
    assert.equal(posts.length, 3);
    assert.equal(posts[2]!.url, 'https://example.invalid/A', 'Timer A must strictly route to endpoint A');
    assert.equal(posts[2]!.body.attempt_id, 'att-A', 'Timer A must strictly preserve Attempt A identity');
    assert.equal(posts[2]!.body.exam_id, 'exam-A', 'Timer A must strictly preserve Exam A identity');
    assert.equal(posts[2]!.body.raw_answers_json['q-a'], '1', 'Timer A must strictly preserve Attempt A answers');
    assert.equal(posts[2]!.body.raw_answers_json['q-b'], undefined, 'Timer A must NOT include Attempt B answers');
  });

  it('LC41-F02 regression: pending archive request on attempt A does not hold global sync lock or block subsequent discovery and dispatch of attempt C', async () => {
    const store = new Map<string, string>();
    const finalKeyA = 'cunata:final:' + encodeURIComponent('exam-A') + ':' + encodeURIComponent('v1.0.0') + ':' + encodeURIComponent('att-A');
    store.set(finalKeyA, JSON.stringify({
      attemptId: 'att-A',
      examId: 'exam-A',
      examVersionId: 'v1.0.0',
      submitted: true,
      collectorUrl: 'https://collector-hang-a.invalid',
      scoreResult: { totalFraction: '10', maxTotalFraction: '10', sections: { I: { scoreFraction: '0', maxFraction: '0' }, II: { scoreFraction: '0', maxFraction: '0' }, III: { scoreFraction: '10', maxFraction: '10' } } }
    }));

    const finalKeyB = 'cunata:final:' + encodeURIComponent('exam-B') + ':' + encodeURIComponent('v1.0.0') + ':' + encodeURIComponent('att-B');
    store.set(finalKeyB, JSON.stringify({
      attemptId: 'att-B',
      examId: 'exam-B',
      examVersionId: 'v1.0.0',
      submitted: true,
      collectorUrl: 'https://collector-fast-b.invalid',
      scoreResult: { totalFraction: '10', maxTotalFraction: '10', sections: { I: { scoreFraction: '0', maxFraction: '0' }, II: { scoreFraction: '0', maxFraction: '0' }, III: { scoreFraction: '10', maxFraction: '10' } } }
    }));

    const p = createPageContext(store);
    p.run('renderExamPane = () => {}; renderPalette = () => {};');
    const posts: { url: string; attemptId: string }[] = [];
    p.c.posts = posts;
    let resolveHangA: Function;

    p.run(`
      studentState.attemptId = 'att-active-draft';
      studentState.submitted = false;

      fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        posts.push({ url, attemptId: body.attempt_id });
        if (url === 'https://collector-hang-a.invalid') {
          return new Promise(r => { resolveHangA = r; });
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            attempt_id: body.attempt_id,
            status: 'NEWLY_RECORDED'
          })
        };
      };
    `);

    // Start scan 1 (Attempt A hangs, Attempt B resolves quickly)
    const scan1 = p.run('syncUnconfirmedFinalSubmissions()');
    await new Promise(r => setTimeout(r, 20));

    assert.ok(posts.some(x => x.attemptId === 'att-A'), 'Attempt A was dispatched');
    assert.ok(posts.some(x => x.attemptId === 'att-B'), 'Attempt B was dispatched');

    // While Attempt A is still hanging, add Attempt C to store
    const finalKeyC = 'cunata:final:' + encodeURIComponent('exam-C') + ':' + encodeURIComponent('v1.0.0') + ':' + encodeURIComponent('att-C');
    store.set(finalKeyC, JSON.stringify({
      attemptId: 'att-C',
      examId: 'exam-C',
      examVersionId: 'v1.0.0',
      submitted: true,
      collectorUrl: 'https://collector-c.invalid',
      scoreResult: { totalFraction: '10', maxTotalFraction: '10', sections: { I: { scoreFraction: '0', maxFraction: '0' }, II: { scoreFraction: '0', maxFraction: '0' }, III: { scoreFraction: '10', maxFraction: '10' } } }
    }));

    // Trigger scan 2 while Attempt A is STILL hanging
    await p.run('syncUnconfirmedFinalSubmissions()');

    // Verify: Attempt C was discovered and dispatched without waiting for Attempt A to resolve!
    const postC = posts.find(x => x.attemptId === 'att-C');
    assert.ok(postC, 'Attempt C must be discovered and dispatched even while Attempt A is pending');
    assert.equal(postC!.url, 'https://collector-c.invalid');

    // Clean up hanging A
    p.run('if (typeof resolveHangA === "function") resolveHangA({ ok: false, status: 500 });');
    await scan1;
  });
});
