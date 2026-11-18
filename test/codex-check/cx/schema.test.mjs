const { pathToFileURL } = await import('node:url');
await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/runtime.mjs').href);
const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const { launchBrowser, startServer, PROJECT_ROOT, sleep } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const { makeExam, waitBoot, enterStudentArea, startFromCard, submit, pickOption, qI, onRoleChooser } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const { startGasServer } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/gas-server.mjs').href);

const DIST = join(PROJECT_ROOT, 'dist');
const OUT = join(PROJECT_ROOT, 'ops/blitz/promoted/_audit/security');
const T = { name: 'Giáo viên kiểm định', username: 'securitygv', password: 'Synthetic-GV-12345' };
const HTML = '<img src=x onerror="document.documentElement.dataset.cxXss=1">';
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });

async function fixture(fn, exam = makeExam({ id: 'cx-security', part1: ['a'], part2: [], part3: [] })) {
  const gas = await startGasServer();
  const admin = gas.gas.post({ action: 'adminLogin', password: gas.adminPassword });
  assert.equal(admin.success, true);
  assert.equal(gas.gas.post({ action: 'adminCreateTeacher', token: admin.token, ...T }).success, true);
  const teacher = gas.gas.post({ action: 'teacherLogin', username: T.username, password: T.password });
  assert.equal(teacher.success, true);
  const server = await startServer(DIST, { overrides: {
    'public/config.json': JSON.stringify({ appsScriptUrl: gas.url }),
    'public/exams/index.json': JSON.stringify({ version: 1, exams: [{ id: exam.examId, title: exam.title,
      subject: exam.subject, grade: 12, durationMinutes: 50, questionCount: exam.questions.length,
      group: 'Kiểm định', url: 'public/exams/cx-security.json' }] }),
    'public/exams/cx-security.json': JSON.stringify(exam),
  } });
  const ctx = await browser.newContext();
  try { return await fn({ gas, server, ctx, teacherToken: teacher.token, adminToken: admin.token, exam }); }
  finally { await ctx.close(); await server.close(); await gas.close(); }
}
async function loginTeacher(ctx, server) {
  const page = await ctx.newPage();
  await page.goto(server.url + '#/giao-vien');
  await waitBoot(page);
  try {
    if (await onRoleChooser(page)) await page.click('#btnRoleTeacher');
    await page.waitFor(() => {
      const form = document.querySelector('#teacherLogin');
      const btn = document.querySelector('#btnTeacherLogin');
      return form && form.getClientRects().length > 0 && btn && !btn.disabled;
    }, 'teacher login ready');
    await page.type('#teacherUsername', T.username);
    await page.type('#teacherPassword', T.password);
    await page.click('#btnTeacherLogin');
    await page.waitFor(() => !!document.querySelector('#teacherNav a[data-nav="lop"]'), 'teacher shell');
  }
  catch (err) {
    writeFileSync(join(OUT, 'login-diagnostic.json'), JSON.stringify(await page.eval(() => ({
      username: document.querySelector('#teacherUsername')?.value,
      passwordLength: document.querySelector('#teacherPassword')?.value.length,
      loginError: document.querySelector('#teacherLoginError')?.textContent,
      loginCount: document.querySelectorAll('#teacherLogin').length,
      loginVisible: !!document.querySelector('#teacherLogin')?.getClientRects().length,
      errors: document.querySelector('#teacherLogin')?.innerText,
      hash: location.hash,
      roleChooser: document.querySelector('#roleChooser')?.innerText,
      body: document.body.innerText.slice(0, 1500),
      passwordInputs: document.querySelectorAll('#teacherPassword').length,
    })), null, 2));
    throw err;
  }
  return page;
}
async function student(ctx, server, exam, name) {
  const page = await ctx.newPage();
  await page.goto(server.url);
  await waitBoot(page);
  await enterStudentArea(page, { name });
  await startFromCard(page, `[data-exam-id="${exam.examId}"]`);
  return page;
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = text.charCodeAt(0) === 0xFEFF ? 1 : 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\r' || c === '\n') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function assertInert(observed) {
  assert.equal(observed.executed, null, 'untrusted text must not execute');
  assert.equal(observed.handlers, 0, 'untrusted text must not become an event handler');
}
const inertState = () => ({ executed: document.documentElement.getAttribute('data-cx-xss'), handlers: document.querySelectorAll('[onerror],[onload],script:not([src])').length });





test('dist: [app] CX-SEC-02: ảnh Markdown không nạp host ngoài qua URL // (WEB-contract §4.1)', { timeout: 120000 }, async () => {
  const exam = makeExam({ id: 'cx-image', part1: ['a'], part2: [], part3: [] });
  // The first harmless image also checks that every Markdown image is validated.
  exam.questions[0].content = '![safe](public/safe.png) ![tracker](//cx-security.invalid/pixel)';
  await fixture(async ({ ctx, server, exam, gas, teacherToken }) => {
    assert.equal(gas.gas.post({ action: 'publishExam', token: teacherToken, exam }).success, true);
    const page = await ctx.newPage();
    await page.send('Network.setBlockedURLs', { urls: ['*cx-security.invalid*'] });
    await page.goto(server.url); await waitBoot(page); await enterStudentArea(page);
    await startFromCard(page, `[data-exam-id="${exam.examId}"]`);
    await sleep(250);
    const unsafe = await page.eval(() => [...document.querySelectorAll('#examPane img')].map(x => x.getAttribute('src')).filter(x => x.startsWith('//')));
    writeFileSync(join(OUT, 'image-observation.json'), JSON.stringify({ unsafeImageCount: unsafe.length,
      attemptedExternalRequests: page.requests.filter(u => u.includes('cx-security.invalid')).length }, null, 2));
    assert.deepEqual(unsafe, [], 'WEB-contract §4.1: external image must be rejected or rendered inert');
  }, exam);
});



// All contexts and local servers are already closed; release residual CDP TCP handles.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='Socket'&&h.remoteAddress==='127.0.0.1'&&![process.stdin,process.stdout,process.stderr].includes(h))h.destroy();});

// Chrome has already received Browser.close and kill from the harness.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='ChildProcess'&&/(?:chrome|msedge)(?:\.exe)?$/i.test(h.spawnfile??''))h.unref();});
