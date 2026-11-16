import { launchBrowser, startServer } from '../claude-check/harness.mjs';
import { TARGETS, shortSel, typeShort } from '../claude-check/app.mjs';
import { open, jsonFile, webFixture, oracleCases } from '../codex-check/support.mjs';

const browser = await launchBrowser();
for (const target of TARGETS) {
  const server = await startServer(target.dir);
  const ctx = await browser.newContext();
  const page = await open(ctx, server, target);
  const c = oracleCases.find(x => x.id === 'golden-20-10-4-full');
  const exam = webFixture(c);
  await page.setFiles('#examFileInput', [jsonFile(exam, 'test-repro-' + target.name)]);
  await page.waitFor((title, count) => document.getElementById('examTitle')?.textContent.trim() === title
    && document.querySelectorAll('#examPane .question-card').length === count,
    'load exam', 7000, exam.title, exam.questions.length);

  const qid = 'golden-20-10-4:III:0';
  await typeShort(page, qid, '1,5');
  const val = await page.eval((s) => document.querySelector(s)?.value, shortSel(qid));
  console.log(target.name, 'value after typeShort:', val);

  await ctx.close();
  await server.close();
}
await browser.close();
