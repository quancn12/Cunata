import assert from 'node:assert/strict';
import { createServer } from 'node:http';
const { pathToFileURL } = await import('node:url');
export const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
export const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const { handle, createMemoryStore } = await import(pathToFileURL(process.cwd() + '/src/api/index.ts').href);

// Track the child allocated by the shared launcher, without changing its
// browser flags or any app behavior. On Windows Browser.close may leave the
// Chrome launcher child alive; kill only that owned child after bounded cleanup.
export async function launchManagedBrowser() {
  const { default: cp } = await import('node:child_process');
  const { syncBuiltinESMExports } = await import('node:module');
  const nativeSpawn = cp.spawn;
  let owned;
  cp.spawn = (...args) => { owned = nativeSpawn(...args); return owned; };
  syncBuiltinESMExports();
  let browser;
  try { browser = await H.launchBrowser(); }
  finally { cp.spawn = nativeSpawn; syncBuiltinESMExports(); }
  return { ...browser, close: async () => {
    const closing = browser.close().catch(() => {});
    await Promise.race([closing, H.sleep(2000)]);
    owned.kill();
    await Promise.race([closing, H.sleep(300)]);
  } };
}

export const teacher = { username: 'r3.teacher', name: 'GV R3 mô phỏng', password: 'R3-fixture-only-2026' };
export const names = ['Nguyễn An mô phỏng', 'Trần Bình mô phỏng', 'Lê Chi mô phỏng'];
export const requirement = (text) => `WEB-contract §23: ${text}`;
export function ok(body, text) {
  assert.equal(body.success, true, requirement(`${text}; nhận ${JSON.stringify(body)}`));
  return body;
}
export async function fixture() {
  let now = Date.now();
  const store = createMemoryStore();
  const exam = A.makeExam({ id: 'r3-exam', title: 'Đề R3 mô phỏng', part1: ['a'], part2: [[true, false, true, false]], part3: ['1,5'] });
  const ctx = { store, now: () => now, adminPassword: 'R3-admin-fixture-only', catalog: [] };
  const call = async (action, data = {}, method = 'POST') => (await handle({ method, ...(method === 'GET' ? { query: { action, ...data } } : { body: { action, ...data } }) }, ctx)).body;
  const admin = ok(await call('adminLogin', { password: ctx.adminPassword }), 'fixture adminLogin (§19.2)');
  const tokens = [];
  for (const username of [teacher.username, 'r3.other']) {
    ok(await call('adminCreateTeacher', { token: admin.token, ...teacher, username }), 'fixture adminCreateTeacher (§19.2)');
    tokens.push(ok(await call('teacherLogin', { username, password: teacher.password }), 'fixture teacherLogin (§19.2)').token);
  }
  const [token, otherToken] = tokens;
  const cls = ok(await call('createClass', { token, name: 'Lớp R3 mô phỏng' }), 'fixture createClass (§19.2)');
  ok(await call('publishExam', { token, exam }), 'fixture publishExam (§19.2)');
  const assignment = ok(await call('assignExam', { token, classId: cls.classId, examId: exam.examId,
    openAt: new Date(now - 60000).toISOString(), dueAt: new Date(now + 3600000).toISOString() }), 'fixture assignExam (§19.2)');
  const f = { ctx, store, call, token, otherToken, cls, assignment, exam, advance: ms => { now += ms; } };
  return f;
}

// add/list response container is not prescribed by §23. Accept the two usual
// array containers without making a new product policy; identity is always studentId.
export function rows(body) { return body.students ?? body.roster; }
export async function roster(f, requested = names) {
  const added = ok(await f.call('addStudents', { token: f.token, classId: f.cls.classId, names: requested }), 'addStudents phải thêm danh sách');
  const listed = ok(await f.call('listStudents', { token: f.token, classId: f.cls.classId }), 'listStudents phải đọc danh sách');
  const students = rows(listed);
  assert.ok(Array.isArray(students), requirement('listStudents trả danh sách học sinh'));
  return students.map(s => ({ ...s, pin: s.pin ?? rows(added)?.find(a => a.studentId === s.studentId)?.pin }));
}
export async function loginStudent(f, s, pin = s.pin) {
  return ok(await f.call('studentLogin', { code: f.cls.code, studentId: s.studentId, pin }), 'studentLogin đúng PIN phải thành công');
}
export function submission(f, s, studentToken, suffix = 'one') {
  const attemptId = `r3-${f.cls.classId}-${suffix}`;
  const responses = { attemptId, examVersionId: f.exam.examVersionId, responses: [
    { kind: 'I', questionVersionId: 'ck-i-01', selectedOptionId: 'ck-i-01-a' },
    { kind: 'II', questionVersionId: 'ck-ii-01', answers: ['a', 'b', 'c', 'd'].map((l, i) => ({ statementId: `ck-ii-01-${l}`, value: [true, false, true, false][i] })) },
    { kind: 'III', questionVersionId: 'ck-iii-01', raw: '1,5' },
  ] };
  return { attempt_id: attemptId, exam_id: f.exam.examId, exam_version_id: f.exam.examVersionId,
    candidate_display: s.name, student_id: s.studentId, studentToken,
    class_code: f.cls.code, assignment_id: f.assignment.assignmentId,
    started_at: new Date(f.ctx.now() - 30000).toISOString(), submitted_at: new Date(f.ctx.now()).toISOString(),
    duration_seconds: 30, policy_version: 'custom-v1', total: '10', maxTotal: '10',
    sections: { I: { score: '1/4', max: '1/4' }, II: { score: '1', max: '1' }, III: { score: '35/4', max: '35/4' } },
    responses, raw_answers_json: JSON.stringify(responses) };
}

// HTTP adapter only: production handle + production MemoryStore, no R3 responses
// fabricated here. Config is replaced in memory; never read production config.
export async function localSite(f) {
  const log = [];
  const rpc = createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : undefined;
      const query = Object.fromEntries(url.searchParams);
      const out = await handle({ method: req.method, body, query }, f.ctx);
      log.push({ method: req.method, action: body?.action ?? query.action, body, response: out.body });
      res.writeHead(out.status); res.end(JSON.stringify(out.body));
    } catch (e) { log.push({response:{adapterError:String(e)}}); res.writeHead(500); res.end(JSON.stringify({ adapterError: String(e) })); }
  });
  await new Promise(resolve => rpc.listen(0, '127.0.0.1', resolve));
  const apiBase = `http://127.0.0.1:${rpc.address().port}/api/rpc`;
  const site = await H.startServer(process.cwd() + '/dist', { overrides: {
    'public/config.json': JSON.stringify({ apiBase, appsScriptUrl: '' }),
  } });
  return { ...site, log, apiBase, close: async () => {
    await site.close(); rpc.closeAllConnections(); await new Promise(resolve => rpc.close(resolve));
  } };
}
export async function visible(page, selector) {
  await page.waitFor(s => {
    const e = document.querySelector(s); if (!e) return false;
    const r = e.getBoundingClientRect(); const c = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none';
  }, requirement(`phần tử ${selector} phải hiện`), 10000, selector);
}
export async function click(page, selector) {
  await visible(page, selector);
  assert.equal(await page.eval(s => { const e = document.querySelector(s); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  }, selector), true, requirement(`${selector} nằm trong khung nhìn`));
  const hit = await A.mouseClick(page, selector);
  assert.ok(hit.hitsTarget, requirement(`${selector} nhận chuột thật, không bị ${hit.top} che`));
}
export async function type(page, selector, text) {
  await click(page, selector);
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 });
  await page.send('Input.insertText', { text });
}
export async function studentPage(ctx, site) {
  const p = await ctx.newPage(); await p.goto(site.url); await A.waitBoot(p);
  await click(p, '#btnRoleStudent');
  await visible(p, '#studentNameGate');
  await type(p, '#startName', 'Tên cổng tự do mô phỏng');
  await click(p, '#btnNameContinue'); await visible(p, '#classCodeInput');
  return p;
}
export async function join(page, code) {
  await type(page, '#classCodeInput', code); await click(page, '#btnJoinClass');
}
export async function pinLogin(page, f, s) {
  await join(page, f.cls.code);
  await click(page, `#rosterPick .roster-name[data-student-id="${s.studentId}"]`);
  await type(page, '#studentPinInput', s.pin); await click(page, '#btnPinConfirm');
}
export async function teacherPage(ctx, site, cls) {
  const p = await ctx.newPage(); await p.goto(site.url); await A.waitBoot(p);
  await click(p, '#btnRoleTeacher');
  await type(p, '#teacherUsername', teacher.username); await type(p, '#teacherPassword', teacher.password);
  await click(p, '#btnTeacherLogin'); await visible(p, '#teacherShell');
  await click(p, `#teacherNav a[data-nav="lop"]`);
  // The card centre contains the copy-code button; click its visible heading
  // to open details instead of accidentally copying the code.
  if (cls) await click(p, `.class-card[data-class-id="${cls.classId}"] h3`);
  return p;
}
