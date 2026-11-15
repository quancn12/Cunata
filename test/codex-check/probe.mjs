// Read-only product probe. Artifacts stay inside this worker's scope.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { launchBrowser, startServer, sleep } from '../claude-check/harness.mjs';
import { TARGETS, makeExam, loadExam, submit, setName } from '../claude-check/app.mjs';
import { field, oracleCases, webFixture, jsonFile, answer } from './support.mjs';

const out = new URL('./evidence/', import.meta.url); mkdirSync(out, { recursive: true });
const sourceFiles = ['index.html', 'src/app/main.ts', 'src/app/shell.html', 'dist/index.html', 'dist/app/main.js',
  'test/claude-check/harness.mjs', 'test/claude-check/app.mjs', 'test/oracle/fixtures/golden.json',
  'test/oracle/fixtures/sections-I-II.json', 'test/oracle/fixtures/short-answers.json'];
const hashes = () => Object.fromEntries(sourceFiles.map(p => [p, createHash('sha256').update(readFileSync(new URL(`../../${p}`, import.meta.url))).digest('hex')]));
const result = { time: new Date().toISOString(), node: process.version,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  hashesBefore: hashes(), oracleIds: oracleCases.map(c => c.id), targets: [] };
const browser = await launchBrowser();
async function screenshot(page, name) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(new URL(name + '.png', out), Buffer.from(data, 'base64'));
}
try {
  for (const target of TARGETS) {
    const server = await startServer(target.dir), ctx = await browser.newContext();
    const evidence = { target: target.name };
    try {
      const p = await ctx.newPage(); await p.goto(server.url + target.path); await sleep(1000);
      evidence.version = await p.send('Browser.getVersion');
      evidence.boot = await p.eval(() => ({ title: document.getElementById('examTitle')?.textContent,
        cards: document.querySelectorAll('#examPane .question-card').length,
        files: [...document.querySelectorAll('input[type=file]')].map(e => ({ id: e.id, accept: e.accept })),
        modules: [...document.querySelectorAll('script[type=module]')].map(e => e.src) }));
      evidence.errors = p.errors; evidence.badRequests = p.badRequests;
      await screenshot(p, `${target.name}-boot`);
      if (target.name === 'root') {
        await p.click('#btnOpenBuilder'); await screenshot(p, 'root-builder');
        await p.click('#btnAddPartIII');
        const i = await p.eval(() => document.querySelectorAll('#builderQuestionsContainer .builder-q-card').length - 1);
        await p.click(`.btn-q-edit[data-idx="${i}"]`); await field(p, `#editQAnswerKey_${i}`, '');
        await p.click(`.btn-q-save-edit[data-idx="${i}"]`);
        evidence.unsavedEdit = { dialogsAfterSave: [...p.dialogs] };
        await p.click('#btnPublishToRunner');
        evidence.unsavedEdit.afterPublish = await p.eval(() => ({ builderVisible: document.getElementById('builderModal')?.style.display,
          title: document.getElementById('examTitle')?.textContent, cards: document.querySelectorAll('#examPane .question-card').length }));
        evidence.unsavedEdit.dialogsAfterPublish = [...p.dialogs];
        await loadExam(p, makeExam({ id: 'codex-evidence-local', part1: ['a'], part2: [], part3: [] }));
        await setName(p, '=SUM(1,1)'); await submit(p);
        evidence.result = await p.eval(() => ({ sync: document.getElementById('syncText')?.textContent,
          buttons: [...document.querySelectorAll('button,a[download]')].filter(e => e.getClientRects().length).map(e => ({ id: e.id, text: e.textContent.trim() })),
          subtitle: document.getElementById('reportSubtitle')?.textContent }));
        await screenshot(p, 'root-result');
      } else {
        const c = oracleCases[0], exam = webFixture(c);
        await p.setFiles('#examFileInput', [jsonFile(exam, 'probe-dist-oracle')]); await sleep(500);
        evidence.imported = await p.eval(() => ({ title: document.getElementById('examTitle')?.textContent,
          count: document.querySelectorAll('#examPane .question-card').length, sync: document.getElementById('syncText')?.textContent }));
        await answer(p, exam, c.attempt.responses); await sleep(500);
        await setName(p, 'Codex trạng thái cục bộ');
        evidence.answered = await p.eval(() => ({ checked: document.querySelectorAll('#examPane [aria-checked=true]').length,
          sync: document.getElementById('syncText')?.textContent }));
        await p.click('#btnSubmit'); await p.click('#btnConfirmSubmit'); await sleep(500);
        evidence.submitted = await p.eval(() => ({ reportDisplay: getComputedStyle(document.getElementById('reportWrapper')).display,
          score: document.getElementById('scoreTotal')?.textContent, sync: document.getElementById('syncText')?.textContent,
          reportText: document.getElementById('reportWrapper')?.innerText,
          records: Object.keys(localStorage).map(key => ({ key, raw: localStorage.getItem(key) })).filter(r => /attempt|final/.test(r.key)) }));
        evidence.dialogs = p.dialogs; await screenshot(p, 'dist-submitted');
        await p.click('#btnOpenBuilder'); await p.click('#btnAddPartIII');
        evidence.builder = await p.eval(() => ({ display: getComputedStyle(document.getElementById('builderModal')).display,
          count: document.getElementById('builderQuestionCount')?.textContent,
          contents: document.getElementById('builderQuestionsList')?.textContent }));
        await p.reload(); await sleep(500);
        evidence.afterReload = await p.eval(() => ({ reportDisplay: getComputedStyle(document.getElementById('reportWrapper')).display,
          examDisplay: getComputedStyle(document.getElementById('examWrapper')).display, sync: document.getElementById('syncText')?.textContent,
          candidateName: document.getElementById('candidateName')?.value }));
      }
    } catch (error) { evidence.error = String(error.stack); }
    finally { await ctx.close(); await server.close(); }
    result.targets.push(evidence);
  }
} finally { await browser.close(); }
result.hashesAfter = hashes();
writeFileSync(new URL('probe.json', out), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
