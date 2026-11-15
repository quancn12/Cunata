import { TARGETS, loadExam, makeExam, near, openApp, pickOption, qI, qII, qIII, readReport, setStatement, submit, typeShort, waitSaved } from '../claude-check/app.mjs';
import { launchBrowser, startServer } from '../claude-check/harness.mjs';
import { join } from 'node:path';

async function main() {
  const browser = await launchBrowser();
  const target = TARGETS.find(t => t.name === 'dist');
  const server = await startServer(target.dir);

  try {
    const runTest6 = async () => {
      const ctx = await browser.newContext();
      try {
        const page = await openApp(ctx, server, target);
        await loadExam(page, makeExam());
        await typeShort(page, qIII(1), '0,50');
        await typeShort(page, qIII(2), '-12');
        await waitSaved(page);
        await submit(page);
        const r = await readReport(page);
        console.log('Test 6 report III:', r.raw.III);
      } finally {
        await ctx.close();
      }
    };

    const runTest7 = async () => {
      const ctx = await browser.newContext();
      try {
        const page = await openApp(ctx, server, target);
        const p2 = Array.from({ length: 8 }, (_, i) => [i % 2 === 0, true, false, i % 3 === 0]);
        const exam = makeExam({ id: 'claude-check-882', title: 'Đề kiểm định 8-8-2 (BASE = 10)', part1: ['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd'], part2: p2, part3: ['1', '2'] });
        await loadExam(page, exam);
        for (let i = 0; i < 8; i++) await pickOption(page, qI(i + 1), 'abcdabcd'[i]);
        for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) await setStatement(page, qII(i + 1), j, p2[i][j]);
        await typeShort(page, qIII(1), '1');
        await typeShort(page, qIII(2), '2');
        await waitSaved(page);
        
        // Debug inspect before submit
        const inpValues = await page.eval(() => {
          const inputs = Array.from(document.querySelectorAll('.short-answer-input')).map((e) => ({
            id: e.closest('.question-card')?.id,
            val: e.value,
          }));
          return { inputs, activeSnapshot: localStorage.getItem('cunata:active_exam_snapshot')?.slice(0, 50) };
        });
        console.log('Test 7 before submit inputs:', JSON.stringify(inpValues));

        await submit(page);
        const r = await readReport(page);
        console.log('Test 7 report:', r.raw);
      } finally {
        await ctx.close();
      }
    };

    console.log('Running concurrently:');
    await Promise.all([runTest6(), runTest7()]);
  } finally {
    await server.close();
    await browser.close();
  }
}

main().catch(console.error);
