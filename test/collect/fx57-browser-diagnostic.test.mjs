// FX57 diagnostic: original protected tests remain unchanged.
// Same assertions, with explicit exam load after the name gate (contract section 21)
// and a wait for completed asynchronous teacher results. Local simulated Google only.
// CX-PROMOTE: run from repository root.
const { pathToFileURL } = await import('node:url');
await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/runtime.mjs').href);
const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const test=(name,...args)=>{const fn=args.pop();const opts=args.pop()??{};return nodeTest(name,{...opts,timeout:Math.max(120000,opts.timeout??0)},async(...a)=>{try{return await fn(...a);}catch(e){e.message=name+'\n'+e.message;throw e;}});};
// Contract assertions intentionally RED until production Code.js is fixed.
// Run from root: node --test ops/blitz/promoted/_audit/appsscript/proposed.test.mjs
import { test as nodeTest, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import vm from 'node:vm';
const { launchBrowser, PROJECT_ROOT, startServer, sleep } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const { enterFromStart, enterStudentArea, startFromCard, submit, waitBoot, waitReport, loadExam } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const { startGasServer } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/gas-server.mjs').href);
const { instrumentedGas, setup, ok, result, classroom, makeExam, teachers }=await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/appsscript/fixtures.mjs').href);

const visible = id => `(() => { const e = document.getElementById(${JSON.stringify(id)}); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; })()`;

const evidence = (name, data) => writeFileSync(new URL(`./fx57-${name}.json`, import.meta.url), JSON.stringify(data, null, 2));
async function navigate(page, url) {
  try { await page.goto(url); } catch (err) {
    if (!/Trang không tải xong/.test(err.message)) throw err;
    // The shared harness may miss the load event under concurrent host load;
    // proceed only when the browser itself confirms completed navigation.
    await page.waitFor(() => document.readyState === 'complete', 'navigation completed despite missed CDP load event', 10000);
  }
}











async function browserCase(name, exam, fn, { forceNumericCode = false } = {}) {
  // gas-server still executes the real Code.js via the standard gas-fake.
  let gas, context;
  const original = vm.runInContext;
  vm.runInContext = function (source, sandbox, options) {
    if (options?.filename === 'apps-script/Code.js') context = sandbox;
    return original.call(this, source, sandbox, options);
  };
  try { gas = await startGasServer(); } finally { vm.runInContext = original; }
  let browser, ctx, server, page;
  const toolSockets = [];
  try {
    const tokens = setup(gas.gas);
    if (forceNumericCode) {
      let draws = 0;
      context.Utilities.getUuid = () => draws++ < 2 ? '18181818-1818-4818-9818-181818181818' : crypto.randomUUID();
    }
    server = await startServer(join(PROJECT_ROOT, 'dist'), { overrides: {
      'public/config.json': JSON.stringify({ appsScriptUrl: gas.url }),
      'public/exams/index.json': JSON.stringify({ version: 1, exams: [{ id: exam.examId, title: exam.title, subject: exam.subject,
        grade: exam.grade, durationMinutes: exam.settings.durationMinutes, questionCount: exam.questions.length,
        group: 'Đề kiểm định', url: 'public/audit-exam.json' }] }),
      'public/audit-exam.json': JSON.stringify(exam),
    } });
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = class extends NativeWebSocket {
      constructor(...args) { super(...args); toolSockets.push(this); }
    };
    try { browser = await launchBrowser(); } finally { globalThis.WebSocket = NativeWebSocket; }
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await navigate(page, server.url); await waitBoot(page);
    await fn({ gas, tokens, page, ctx, server });
    const external = page.requests.filter(url => /^https?:/.test(url) && !url.startsWith('http://127.0.0.1:'));
    assert.deepEqual(external, [], 'only local HTTP traffic allowed');
  } catch (error) {
    evidence(`${name}-browser-debug`, { error: error.message, requests: page?.requests, errors: page?.errors,
      body: await page?.eval(() => document.body.innerText.slice(0, 2000)).catch(() => null) });
    throw error;
  } finally {
    await ctx?.close(); await browser?.close();
    // harness.close() closes Chrome; also close the Node CDP WebSocket to
    // prevent a completed run from retaining a local socket indefinitely.
    for (const socket of toolSockets) socket.close();
    await server?.close(); await gas?.close();
  }
}

test("dist: [collect] CX-AS-01: typed apostrophe name is preserved in confirmed Sheet result (WEB-contract §7, §17.2–17.3)", { timeout: 120000 }, async () => {
  const exam = makeExam({ id: 'browser-literal', part1: ['a'], part2: [], part3: [] });
  await browserCase('F01', exam, async ({ page, gas }) => {
    const name = "'Nguyễn An";
    await enterStudentArea(page, { name }); await loadExam(page, exam);
    await page.click('#btnSubmit');
    await page.waitFor(visible('submitModal'), 'hộp thoại xác nhận nộp bài (#submitModal) hiện ra', 5000);
    await page.click('#btnConfirmSubmit');
    await waitReport(page, 30000);
    await page.waitFor(() => /Đã gửi/i.test(document.getElementById('syncText')?.textContent ?? ''), 'confirmed result', 20000);
    const actual = gas.gas.sheets.get('KetQua').rows[1][3];
    evidence('F01-browser', { expected: name, actual, syncText: await page.eval(() => document.getElementById('syncText').textContent) });
    assert.equal(actual, name, 'typed literal name must survive confirmed collection');
  });
});

test("dist: [collect] CX-AS-02: supported large-answer exam can be submitted to Sheet (WEB-contract §7, §17.2–17.3)", { timeout: 120000 }, async () => {
  const part1 = Array(60).fill('a');
  const exam = makeExam({ id: 'browser-large', part1, part2: [], part3: [] });
  for (let i = 0; i < exam.questions.length; i++) {
    const longId = 'q-' + 'x'.repeat(850) + '-' + i;
    exam.questions[i].questionVersionId = longId;
    exam.questions[i].options[0].optionId = longId + '-a';
    exam.questions[i].correctOptionId = longId + '-a';
  }
  await browserCase('F02', exam, async ({ page, gas }) => {
    const received=[]; const post=gas.gas.post; gas.gas.post=body=>{const response=post(body);if(body.action==='submitResult')received.push(response);return response;};
    await enterFromStart(page, { name: 'Học sinh đề lớn', id: exam.examId });
    for (const q of exam.questions) await page.click(`[data-qid="${q.questionVersionId}"][data-option-id="${q.options[0].optionId}"]`);
    await page.click('#btnSubmit');
    await page.waitFor(visible('submitModal'), 'hộp thoại xác nhận nộp bài (#submitModal) hiện ra', 5000);
    await page.click('#btnConfirmSubmit');
    await waitReport(page, 30000);
    const started = Date.now();
    while (Date.now() - started < 25000) {
      const sent = gas.log.filter(entry => entry.method === 'POST').map(entry => JSON.parse(entry.body));
      if (sent.some(body => body.action === 'submitResult')) break;
      await sleep(100);
    }
    const posts = gas.log.filter(entry => entry.method === 'POST').map(entry => JSON.parse(entry.body)).filter(body => body.action === 'submitResult');
    assert.ok(posts.length, 'browser actually sent the result');
    const payload = posts[0];
    assert.ok(JSON.stringify(payload.responses).length > 50000, 'actual browser answer payload exceeds Sheets cell limit');
    
    const response = received[0]; assert.ok(response,'local server processed the actual browser submission');
    evidence('F02-browser', { questionCount: exam.questions.length, rawLength: JSON.stringify(payload.responses).length,
      response, syncText: await page.eval(() => document.getElementById('syncText').textContent) });
    assert.equal(response.success, true, 'real browser result for large answers must fit storage protocol');
  });
});

test("dist: [collect] CX-AS-03: numeric class code submission appears in teacher results (WEB-contract §19.1–19.2)", { timeout: 120000 }, async () => {
  const exam = makeExam({ id: 'browser-numeric-class', part1: ['a'], part2: [], part3: [] });
  await browserCase('F03', exam, async ({ page, gas, tokens, ctx, server }) => {
    const token = tokens.tokens[0];
    const cls = ok(gas.gas.post({ action: 'createClass', token, name: 'Lớp mã số' }));
    assert.equal(cls.code, '222222');
    ok(gas.gas.post({ action: 'publishExam', token, exam }));
    const assigned = ok(gas.gas.post({ action: 'assignExam', token, classId: cls.classId, examId: exam.examId,
      openAt: new Date(Date.now() - 60000).toISOString(), dueAt: new Date(Date.now() + 600000).toISOString() }));
    await enterStudentArea(page, { name: 'Học sinh lớp mã số' });
    await page.type('#classCodeInput', cls.code); await page.click('#btnJoinClass');
    const card = `#myClasses [data-assignment-id="${assigned.assignmentId}"]`;
    await page.waitFor(sel => !!document.querySelector(sel), 'assigned exam card', 10000, card);
    await startFromCard(page, card); await submit(page);
    await page.waitFor(() => /Đã gửi/i.test(document.getElementById('syncText')?.textContent ?? ''), 'confirmed numeric-code class submission', 20000);
    const teacherPage = await ctx.newPage(); await navigate(teacherPage, server.url); await waitBoot(teacherPage);
    if (await teacherPage.eval(()=>!!document.querySelector('#btnChangeRole')?.getClientRects().length)) { await teacherPage.click('#btnChangeRole'); await teacherPage.waitFor(()=>!!document.querySelector('#roleChooser')?.getClientRects().length,'role chooser'); }
    if (await teacherPage.eval(() => { const r = document.getElementById('roleChooser'); return !!r && getComputedStyle(r).display !== 'none'; })) {
      await teacherPage.click('#btnRoleTeacher');
    }
    await teacherPage.waitFor(() => {
      const el = document.getElementById('teacherUsername');
      return !!el && getComputedStyle(el).display !== 'none' && el.offsetParent !== null;
    }, 'teacher login input visible', 10000);
    await teacherPage.type('#teacherUsername', teachers[0].username); await teacherPage.type('#teacherPassword', teachers[0].password);
    await teacherPage.click('#btnTeacherLogin');
    await teacherPage.waitFor(() => !!document.querySelector('.class-card'), 'teacher class card', 20000).catch(async err => {
      evidence('F03-teacher-debug', { body: await teacherPage.eval(() => document.body.innerText.slice(0, 3000)),
        errors: teacherPage.errors, actions: gas.log.filter(entry => entry.method === 'POST').map(entry => JSON.parse(entry.body).action) });
      throw err;
    });
    const classText = await teacherPage.eval(() => document.querySelector('.class-card').textContent);
    await teacherPage.click('#teacherNav a[data-nav="ket-qua"]');
    await teacherPage.waitFor(() => /H?c sinh l?p m? s?/.test(document.querySelector('#resultsTable')?.textContent ?? ''), 'teacher results loaded', 20000);
    const table = await teacherPage.eval(() => document.getElementById('resultsTable').textContent);
    const api = gas.gas.post({ action: 'listResults', token, classId: cls.classId });
    evidence('F03-browser', { code: cls.code, classText, table, api, storedResults: gas.gas.sheets.get('KetQua').rows.length - 1 });
    assert.equal(api.results.length, 1, 'teacher must receive result for confirmed numeric-code class submission');
    assert.match(classText, /Sĩ số:\s*1/);
    assert.match(table, /Học sinh lớp mã số/);
  }, { forceNumericCode: true });
});

// All contexts and local servers are already closed; release residual CDP TCP handles.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='Socket'&&h.remoteAddress==='127.0.0.1'&&![process.stdin,process.stdout,process.stderr].includes(h))h.destroy();});

// Chrome has already received Browser.close and kill from the harness.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='ChildProcess'&&/(?:chrome|msedge)(?:\.exe)?$/i.test(h.spawnfile??''))h.unref();});
