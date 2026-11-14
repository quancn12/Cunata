import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const script = [...fs.readFileSync('index.html', 'utf8')
  .matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).join('\n');

function page(store = new Map()) {
  const nodes = new Map();
  const c = vm.createContext({
    console: { warn() {} },
    document: {
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, { value: 'LC13', style: {}, classList: { add() {}, remove() {} }, addEventListener() {} });
        return nodes.get(id);
      }
    },
    window: { addEventListener() {}, scrollTo() {} },
    localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    setInterval(fn) { c.tick = fn; return 1; },
    clearInterval() {},
    alert() {}
  });
  vm.runInContext(script, c);
  vm.runInContext('showReportView=()=>{}', c);
  return { c, run: s => vm.runInContext(s, c) };
}

console.log("Running LC13 probes against index.html...");

// F01: actual 3.5, expected 10
{
  const p = page();
  p.run("currentExam={questions:[{kind:'III',questionVersionId:'q',answerKey:'1,5'}]};studentState.responses={q:'1,5'}");
  const actual = p.run('scoreAttemptLocally().total');
  assert.equal(actual, 10, `F01 failed: expected 10, got ${actual}`);
  console.log("✔ F01: PASS (total = 10)");
}

// F02a: actual 3.5, expected 0
{
  const p = page();
  p.run("studentState.responses={'q08-iii-ung-dung-thuc-te':' 1,5'}");
  const actual = p.run("scoreAttemptLocally().questionResults.find(q=>q.questionVersionId==='q08-iii-ung-dung-thuc-te').points");
  assert.equal(actual, 0, `F02a failed: expected 0, got ${actual}`);
  console.log("✔ F02a: PASS (points = 0 for un-trimmed leading space)");
}

// F02b: actual 15, expected raw 1.5
{
  const p = page();
  const h = script.match(/inputEl.addEventListener\('input', (\(e\) => \{[\s\S]*?)\n          \}\);/)[1] + '\n}';
  p.c.e = { target: { value: '1.5' } };
  p.c.q = { questionVersionId: 'q' };
  p.run('renderExamPane=()=>{};renderPalette=()=>{}');
  p.run('(' + h + ')(e)');
  assert.equal(p.c.e.target.value, '1.5', `F02b failed: expected '1.5', got ${p.c.e.target.value}`);
  console.log("✔ F02b: PASS (raw value preserved without character stripping)");
}

// F03: actual false, expected true
{
  const store = new Map(), a = page(store), b = page(store);
  a.run('submitExam()');
  assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted, true);
  b.run('saveLocalState()');
  assert.equal(JSON.parse(store.get('cunata_exam_attempt_v1')).submitted, true, "F03 failed: stale tab rewrote submitted state");
  console.log("✔ F03: PASS (stale tab cannot overwrite submitted record)");
}

// F04a: actual false; remaining 2999 sau một giờ
{
  const p = page();
  p.run('Date.now=()=>0;startTimer();Date.now=()=>3600000');
  p.c.tick();
  assert.equal(p.run('studentState.submitted'), true, "F04a failed: timer tick after deadline did not submit");
  console.log("✔ F04a: PASS (timer tick after deadline triggers auto-submit)");
}

// F04b: actual false; remaining 3000 khi restore tương lai
{
  const store = new Map(), a = page(store);
  a.run('saveLocalState()');
  const b = page(store);
  b.run('Date.now=()=>4102444800000;loadLocalState();startTimer()');
  assert.equal(b.run('studentState.submitted'), true, "F04b failed: restore in future did not submit");
  console.log("✔ F04b: PASS (restore in future triggers auto-submit)");
}

console.log("\nALL 6 CODEX LC13 PROBES PASSED 100%!");
