import { launchBrowser, startServer } from '../claude-check/harness.mjs';
import { TARGETS, shortSel } from '../claude-check/app.mjs';
import { open, jsonFile, webFixture, oracleCases } from '../codex-check/support.mjs';

const browser = await launchBrowser();
const target = TARGETS.find(t => t.name === 'dist');
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
const sel = shortSel(qid);

const focusInfo = await page.eval((s) => {
  const el = document.querySelector(s);
  el.scrollIntoView({ block: 'center' });
  el.focus();
  el.select();
  return {
    activeElementTagName: document.activeElement?.tagName,
    activeElementId: document.activeElement?.id,
    activeElementClass: document.activeElement?.className,
    isEqual: document.activeElement === el,
    elTagName: el?.tagName,
    elParentDisplay: window.getComputedStyle(el.parentElement).display,
    cardDisplay: window.getComputedStyle(el.closest('.question-card')).display,
    examWrapperDisplay: window.getComputedStyle(document.getElementById('examWrapper')).display,
  };
}, sel);
console.log('Focus info:', focusInfo);

await ctx.close();
await server.close();
await browser.close();
