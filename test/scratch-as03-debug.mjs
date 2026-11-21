import { pathToFileURL } from 'node:url';
await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/runtime.mjs').href);
import assert from 'node:assert/strict';
import { join } from 'node:path';
import vm from 'node:vm';
const { launchBrowser, PROJECT_ROOT, startServer, sleep } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const { enterFromStart, enterStudentArea, startFromCard, submit, waitBoot, waitReport } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const { startGasServer } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/gas-server.mjs').href);
const { instrumentedGas, setup, ok, result, classroom, makeExam, teachers }=await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/appsscript/fixtures.mjs').href);

async function navigate(page, url) {
  try { await page.goto(url); } catch (err) {
    if (!/Trang không tải xong/.test(err.message)) throw err;
    await page.waitFor(() => document.readyState === 'complete', 'navigation completed despite missed CDP load event', 10000);
  }
}

async function run() {
  let gas, context;
  const original = vm.runInContext;
  vm.runInContext = function (source, sandbox, options) {
    if (options?.filename === 'apps-script/Code.js') context = sandbox;
    return original.call(this, source, sandbox, options);
  };
  try { gas = await startGasServer(); } finally { vm.runInContext = original; }
  let browser, ctx, server, page;
  try {
    const tokens = setup(gas.gas);
    let draws = 0;
    context.Utilities.getUuid = () => draws++ < 2 ? '18181818-1818-4818-9818-181818181818' : crypto.randomUUID();

    const exam = makeExam({ id: 'browser-numeric-class', part1: ['a'], part2: [], part3: [] });
    server = await startServer(join(PROJECT_ROOT, 'dist'), { overrides: {
      'public/config.json': JSON.stringify({ appsScriptUrl: gas.url }),
      'public/exams/index.json': JSON.stringify({ version: 1, exams: [{ id: exam.examId, title: exam.title, subject: exam.subject,
        grade: exam.grade, durationMinutes: exam.settings.durationMinutes, questionCount: exam.questions.length,
        group: 'Đề kiểm định', url: 'public/audit-exam.json' }] }),
      'public/audit-exam.json': JSON.stringify(exam),
    } });

    browser = await launchBrowser();
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await navigate(page, server.url); await waitBoot(page);

    const token = tokens.tokens[0];
    const cls = ok(gas.gas.post({ action: 'createClass', token, name: 'Lớp mã số' }));
    console.log('Class:', cls);
    ok(gas.gas.post({ action: 'publishExam', token, exam }));
    const assigned = ok(gas.gas.post({ action: 'assignExam', token, classId: cls.classId, examId: exam.examId,
      openAt: new Date(Date.now() - 60000).toISOString(), dueAt: new Date(Date.now() + 600000).toISOString() }));

    await enterStudentArea(page, { name: 'Học sinh lớp mã số' });
    await page.type('#classCodeInput', cls.code); await page.click('#btnJoinClass');
    const card = `#myClasses [data-assignment-id="${assigned.assignmentId}"]`;
    await page.waitFor(sel => !!document.querySelector(sel), 'assigned exam card', 10000, card);
    await startFromCard(page, card); await submit(page);
    try {
      await page.waitFor(() => /Đã gửi/i.test(document.getElementById('syncText')?.textContent ?? ''), 'confirmed numeric-code class submission', 5000);
    } catch (e) {
      console.log('SYNC TEXT FAILED! Current text:', await page.eval(() => document.getElementById('syncText')?.textContent));
      console.log('Page errors:', page.errors);
      console.log('GAS log:', gas.log.map(e => ({ method: e.method, url: e.url, body: e.body })));
      throw e;
    }
    console.log('Student submitted!');

    const teacherPage = await ctx.newPage();
    await navigate(teacherPage, server.url);
    await waitBoot(teacherPage);
    console.log('teacherPage URL:', await teacherPage.eval(() => location.href));
    console.log('teacherPage localStorage:', await teacherPage.eval(() => ({ ...localStorage })));
    console.log('teacherPage has btnChangeRole:', await teacherPage.eval(() => !!document.querySelector('#btnChangeRole')?.getClientRects().length));

    if (await teacherPage.eval(()=>!!document.querySelector('#btnChangeRole')?.getClientRects().length)) {
      console.log('Clicking btnChangeRole');
      await teacherPage.click('#btnChangeRole');
      await teacherPage.waitFor(()=>!!document.querySelector('#roleChooser')?.getClientRects().length,'role chooser');
    }
    console.log('teacherPage roleChooser state:', await teacherPage.eval(() => {
      const r = document.getElementById('roleChooser');
      return { exists: !!r, display: r ? getComputedStyle(r).display : null, hidden: r?.hidden };
    }));

    if (await teacherPage.eval(() => { const r = document.getElementById('roleChooser'); return !!r && getComputedStyle(r).display !== 'none'; })) {
      console.log('Clicking btnRoleTeacher');
      await teacherPage.click('#btnRoleTeacher');
    } else {
      console.log('SKIPPED clicking btnRoleTeacher because roleChooser display was none or not found!');
    }

    console.log('Checking teacherUsername in teacherPage:');
    const uState = await teacherPage.eval(() => {
      const el = document.getElementById('teacherUsername');
      return {
        exists: !!el,
        display: el ? getComputedStyle(el).display : null,
        offsetParent: el ? el.offsetParent !== null : null,
        parentHtml: el ? el.parentElement?.outerHTML?.slice(0, 300) : null,
        allBody: document.body.innerText.slice(0, 300)
      };
    });
    console.log('uState:', uState);

  } finally {
    await ctx?.close(); await browser?.close();
    await server?.close(); await gas?.close();
  }
}

run().then(() => console.log('DEBUG DONE')).catch(err => { console.error('DEBUG ERROR:', err); process.exit(1); });
