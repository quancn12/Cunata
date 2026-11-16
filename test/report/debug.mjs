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
    startScreenDisplay: document.getElementById('startScreen')?.style.display,
  };
}, sel);
console.log('Focus info:', focusInfo);

const afterHideStartScreen = await page.eval((s) => {
  const scr = document.getElementById('startScreen');
  if (scr) scr.style.display = 'none';
  const ew = document.getElementById('examWrapper');
  if (ew) ew.style.display = '';
  const el = document.querySelector(s);
  el.focus();
  el.select();
  return {
    startScreenDisplay: scr?.style.display,
    examWrapperDisplay: window.getComputedStyle(ew).display,
    activeElementTagName: document.activeElement?.tagName,
    isEqual: document.activeElement === el,
  };
}, sel);
console.log('After hide startScreen:', afterHideStartScreen);

import { answer, assertScores } from '../codex-check/support.mjs';
import { submit } from '../claude-check/app.mjs';
await answer(page, exam, c.attempt.responses);
await submit(page);
console.log('Submitted successfully! Checking scores...');
await assertScores(page, c.expected);
console.log('ASSERT SCORES PASSED!');

await ctx.close();
await server.close();
await browser.close();
