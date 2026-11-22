import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, scryptSync } from 'node:crypto';
const { pathToFileURL, fileURLToPath } = await import('node:url');
const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const C = await import(pathToFileURL(process.cwd() + '/test/claude-check/classroom.mjs').href);
const G = await import(pathToFileURL(process.cwd() + '/test/claude-check/gas-server.mjs').href);
const API = await import(pathToFileURL(process.cwd() + '/src/api/index.ts').href);
const Collect = await import(pathToFileURL(process.cwd() + '/src/collect/appsScript.ts').href);
const { localServer, memoryContext } = await import('./local-server.mjs');

const root = process.cwd();
const here = dirname(fileURLToPath(import.meta.url));
const artifacts = join(here, '_artifacts');
mkdirSync(artifacts, { recursive: true });
const teacher = { name: 'Giáo viên R2', username: 'r2teacher', password: 'R2-teacher-123' };
const exam = A.makeExam({ id: 'r2-published', title: 'Đề R2 chuyển máy chủ', part1: ['a'], part2: [], part3: [] });
let buildRoot, publisherOutput, browser;
let buildChecked = false, buildFailure;
const ok = (result, why) => { assert.equal(result.ok, true, `${why} (WEB-contract §22, §19.2): ${JSON.stringify(result)}`); return result.value; };
async function rpc(ctx, action, payload = {}) {
  const r = await API.handle({ method: 'POST', body: { action, ...payload } }, ctx);
  assert.equal(r.body.success, true, `API ${action} phải giữ hợp đồng dữ liệu (WEB-contract §22, §19.2): ${JSON.stringify(r.body)}`);
  return r.body;
}
async function seeded(catalog = []) {
  const ctx = memoryContext(catalog);
  const admin = await rpc(ctx, 'adminLogin', { password: ctx.adminPassword });
  await rpc(ctx, 'adminCreateTeacher', { token: admin.token, ...teacher });
  const login = await rpc(ctx, 'teacherLogin', teacher);
  await rpc(ctx, 'publishExam', { token: login.token, exam });
  const cls = await rpc(ctx, 'createClass', { token: login.token, name: 'Lớp R2' });
  const assignment = await rpc(ctx, 'assignExam', { token: login.token, classId: cls.classId, examId: exam.examId,
    openAt: '2020-01-01T00:00:00Z', dueAt: '2099-01-01T00:00:00Z' });
  return { ctx, admin, login, cls, assignment };
}
function built() {
  if (buildFailure) throw buildFailure;
  if (!buildChecked) {
    buildChecked = true;
    buildRoot = mkdtempSync(join(artifacts, 'build-input-'));
    for (const p of ['src', 'scripts', 'styles', 'public', 'apps-script', 'index.html', 'package.json', 'package-lock.json',
      'tsconfig.json', 'tsconfig.web.json', 'tsconfig.build.json']) cpSync(join(root, p), join(buildRoot, p), { recursive: true });
    symlinkSync(join(root, 'node_modules'), join(buildRoot, 'node_modules'), 'junction');
    const result = spawnSync(process.execPath, ['scripts/build.js'], { cwd: buildRoot, encoding: 'utf8', timeout: 120000 });
    writeFileSync(join(artifacts, 'build.log'), `${result.stdout}\n${result.stderr}\nexit=${result.status}\n`);
    try {
      assert.equal(result.status, 0, `BLOCKED_BUILD: node scripts/build.js phải xuất web/API thành công trước kiểm định trình duyệt (WEB-contract §22): ${result.stdout}\n${result.stderr}`);
    } catch (error) { buildFailure = error; throw error; }
  }
  assert.ok(existsSync(join(buildRoot, 'dist/index.html')), 'Build thực phải có dist/index.html (WEB-contract §22)');
  return join(buildRoot, 'dist');
}
function published() {
  if (!publisherOutput) {
    const box = join(artifacts, 'publish');
    const r = spawnSync('python', ['-B', join(here, 'publish-sandbox.py'), root, box], { encoding: 'utf8', timeout: 30000 });
    writeFileSync(join(artifacts, 'publish.log'), `${r.stdout}\n${r.stderr}\nexit=${r.status}\n`);
    assert.equal(r.status, 0, `Bộ cách ly publish phải chạy copy thật, không gọi mạng (WEB-contract §22): ${r.stderr}`);
    publisherOutput = join(box, 'output');
  }
  return publisherOutput;
}
after(async () => {
  if (browser) await browser.close();
  // Remove only the exact generated input tree within the task's scope.
  if (buildRoot) {
    assert.ok(resolve(buildRoot).startsWith(resolve(here) + sep));
    if (existsSync(join(buildRoot, 'node_modules'))) rmSync(join(buildRoot, 'node_modules'));
    rmSync(buildRoot, { recursive: true, force: true });
  }
});

test('dist: [collect] R2: cấu hình apiBase ưu tiên và luôn đọc mới (WEB-contract §22)', async () => {
  const calls = [];
  const cfg = await Collect.loadAppConfig(async (url, init) => {
    calls.push({ url, init });
    return Response.json({ apiBase: ' /api/rpc ', appsScriptUrl: ' http://127.0.0.1:9/legacy ' });
  });
  assert.equal(cfg.apiBase, '/api/rpc', 'loadAppConfig giữ apiBase đã trim (WEB-contract §22)');
  assert.equal(calls[0].url, 'public/config.json', 'Cấu hình dùng đường dẫn tương đối, hỗ trợ /Cunata/ (WEB-contract §17.6, §22)');
  assert.equal(calls[0].init.cache, 'no-store', 'Cấu hình mới phải đi mạng trước (WEB-contract §17.6, §22)');
  const selected = Collect.resolveBackend(cfg);
  assert.deepEqual(selected, { url: '/api/rpc', contentType: 'application/json' }, 'apiBase thắng appsScriptUrl, dùng JSON (WEB-contract §22)');
});

test('dist: [collect] R2: apiBase trống dùng Apps Script, thiếu cấu hình không gửi mạng (WEB-contract §22)', async () => {
  for (const apiBase of [undefined, '', '  ']) {
    assert.deepEqual(Collect.resolveBackend({ apiBase, appsScriptUrl: ' http://127.0.0.1:9/exec ' }),
      { url: 'http://127.0.0.1:9/exec', contentType: 'text/plain;charset=utf-8' },
      'Không có apiBase phải giữ Apps Script text/plain (WEB-contract §22, §17.2)');
  }
  const bad = await Collect.loadAppConfig(async () => { throw new Error('offline'); });
  assert.deepEqual(bad, { appsScriptUrl: '' }, 'Mất cấu hình phải chạy cục bộ (WEB-contract §17.1, §22)');
  let calls = 0;
  const client = Collect.createAppsScriptClient('', async () => { calls++; throw new Error('forbidden'); });
  assert.equal((await client.listExams()).code, 'NOT_CONFIGURED', 'Chưa cấu hình phải báo NOT_CONFIGURED (WEB-contract §17.1, §22)');
  assert.equal((await client.teacherLogin('x', 'y')).code, 'NOT_CONFIGURED', 'Chưa cấu hình không đăng nhập giả (WEB-contract §17.1, §22)');
  assert.equal(calls, 0, 'Chưa cấu hình không được gửi request máy chủ (WEB-contract §17.1, §22)');
});

test('dist: [collect] R2: mọi hành động giáo viên và admin giữ tên, payload và JSON (WEB-contract §22)', async t => {
  const s = await localServer(root, {}); t.after(() => s.close());
  const backend = Collect.resolveBackend({ appsScriptUrl: '', apiBase: s.url + '/api/rpc' });
  const c = Collect.createAppsScriptClient(backend.url, fetch, backend.contentType);
  const admin = ok(await c.adminLogin(s.ctx.adminPassword), 'Admin đăng nhập API mới');
  ok(await c.adminCreateTeacher(admin.token, teacher), 'Tạo giáo viên qua API mới');
  const login = ok(await c.teacherLogin(teacher.username, teacher.password), 'Giáo viên đăng nhập API mới');
  ok(await c.publishExam(login.token, exam), 'Xuất bản giữ dữ liệu đề');
  assert.deepEqual(ok(await c.getExam(exam.examId), 'Đọc đề qua GET'), exam, 'GET getExam giữ nguyên đề (WEB-contract §22, §17.2)');
  assert.ok(ok(await c.listExams(), 'Danh sách đề').some(e => e.id === exam.examId), 'listExams trả đề xuất bản (WEB-contract §22, §17.2)');
  const cls = ok(await c.createClass(login.token, 'Lớp R2'), 'Tạo lớp');
  ok(await c.listMyClasses(login.token), 'Danh sách lớp');
  const a = ok(await c.assignExam(login.token, cls.classId, exam.examId, '2020-01-01T00:00:00Z', '2099-01-01T00:00:00Z'), 'Giao đề');
  ok(await c.listAssignments(login.token, cls.classId), 'Danh sách bài giao');
  ok(await c.getClass(cls.code), 'Vào lớp GET');
  ok(await c.listResults(login.token, cls.classId, a.assignmentId), 'Danh sách kết quả');
  ok(await c.adminListTeachers(admin.token), 'Danh sách giáo viên');
  ok(await c.adminStats(admin.token), 'Thống kê admin');
  ok(await c.adminResetPassword(admin.token, teacher.username, 'R2-new-password-123'), 'Đổi mật khẩu');
  ok(await c.adminSetTeacherActive(admin.token, teacher.username, false), 'Khóa giáo viên');
  const relogin = await c.teacherLogin(teacher.username, 'R2-new-password-123');
  assert.equal(relogin.code, 'UNAUTHORIZED', 'Máy chủ mới giữ mã UNAUTHORIZED (WEB-contract §22, §19.2)');
  ok(await c.adminSetTeacherActive(admin.token, teacher.username, true), 'Mở giáo viên');
  const tk = ok(await c.teacherLogin(teacher.username, 'R2-new-password-123'), 'Đăng nhập lại');
  ok(await c.unpublishExam(tk.token, exam.examId), 'Gỡ đề');
  assert.equal((await c.getExam(exam.examId)).code, 'NOT_FOUND', 'Giữ mã NOT_FOUND khi đề đã gỡ (WEB-contract §22, §17.2)');
  for (const r of s.log) {
    assert.equal(r.method, r.body ? 'POST' : 'GET', 'Chỉ GET đọc công khai, POST mọi hành động khác (WEB-contract §22)');
    if (r.body) assert.match(r.contentType, /^application\/json/, 'POST API mới phải là application/json (WEB-contract §22)');
    assert.ok(!JSON.stringify(r.query).includes('password'), 'Mật khẩu không được vào URL (WEB-contract §17.2, §22)');
  }
});

test('dist: [collect] R2: lỗi máy chủ mới giữ nguyên mã và không đổi sang Apps Script (WEB-contract §22)', async t => {
  const s = await localServer(root, {}); t.after(() => s.close());
  const c = Collect.createAppsScriptClient(s.url + '/api/rpc', fetch, 'application/json');
  assert.equal((await c.teacherLogin('none', 'wrong')).code, 'UNAUTHORIZED', 'Sai tài khoản trả UNAUTHORIZED (WEB-contract §22, §19.2)');
  assert.equal((await c.getClass('ZZZZZZ')).code, 'NOT_FOUND', 'Sai mã lớp trả NOT_FOUND (WEB-contract §22, §19.2)');
  assert.equal((await c.createClass('expired-token', 'Lớp')).code, 'UNAUTHORIZED', 'Token sai trả UNAUTHORIZED (WEB-contract §22, §19.2)');
  assert.equal(s.errors.length, 0, 'Adapter cục bộ không có lỗi hạ tầng (WEB-contract §22)');
});

test('dist: [collect] R2: lõi memory giữ scrypt, token băm và phiên đúng 8 giờ (WEB-contract §22)', async () => {
  const f = await seeded();
  const stored = await f.ctx.store.getTeacher(teacher.username);
  assert.equal(stored.hash, scryptSync(teacher.password, stored.salt, 64).toString('hex'),
    'Mật khẩu phải băm scrypt có muối (WEB-contract §22)');
  const tokens = [f.admin.token, f.login.token];
  assert.notEqual(tokens[0], tokens[1], 'Mỗi phiên phải có token riêng (WEB-contract §22)');
  for (const token of tokens) {
    assert.match(token, /^[0-9a-f]{64}$/, 'Token phải chứa 32 byte ngẫu nhiên (WEB-contract §22)');
    assert.equal(await f.ctx.store.getSession(token), null, 'Không lưu token thô trong sessions (WEB-contract §22)');
    const session = await f.ctx.store.getSession(createHash('sha256').update(token).digest('hex'));
    assert.equal(session.expiresAt, f.ctx.now() + 8 * 3600000, 'Phiên phải hết hạn đúng 8 giờ (WEB-contract §22)');
  }
  const start = f.ctx.now();
  f.ctx.now = () => start + 8 * 3600000 - 1;
  await rpc(f.ctx, 'listMyClasses', { token: f.login.token });
  f.ctx.now = () => start + 8 * 3600000;
  assert.equal((await API.handle({ method: 'POST', body: { action: 'listMyClasses', token: f.login.token } }, f.ctx)).body.error,
    'UNAUTHORIZED', 'Token hết 8 giờ phải bị từ chối (WEB-contract §22)');
});

test('dist: [collect] R2: khóa và đổi mật khẩu vô hiệu phiên cũ, không lộ bí mật (WEB-contract §22)', async () => {
  const f = await seeded();
  const missing = await API.handle({ method: 'POST', body: { action: 'adminLogin', password: 'x' } },
    { store: API.createMemoryStore(), now: f.ctx.now });
  assert.equal(missing.body.error, 'ADMIN_PASSWORD_NOT_SET', 'Thiếu mật khẩu admin phải trả đúng mã (WEB-contract §22)');
  for (const action of ['adminResetPassword', 'adminSetTeacherActive']) {
    const login = await rpc(f.ctx, 'teacherLogin', { username: teacher.username,
      password: action === 'adminResetPassword' ? teacher.password : 'R2-replaced-password' });
    await rpc(f.ctx, action, { token: f.admin.token, username: teacher.username,
      password: 'R2-replaced-password', active: false });
    const response = await API.handle({ method: 'POST', body: { action: 'listMyClasses', token: login.token } }, f.ctx);
    assert.equal(response.body.error, 'UNAUTHORIZED', 'Đổi mật khẩu/khóa phải hủy phiên cũ (WEB-contract §22)');
  }
  const accounts = await rpc(f.ctx, 'adminListTeachers', { token: f.admin.token });
  assert.doesNotMatch(JSON.stringify(accounts), /"(?:password|hash|salt|pinHash|DATABASE_URL)"|R2-replaced-password/,
    'Phản hồi không chứa mật khẩu, băm, muối, PIN băm hoặc DATABASE_URL (WEB-contract §22)');
});

test('dist: [collect] R2: catalog giữ tiêu đề đề tĩnh trong lớp và bài giao (WEB-contract §22)', async () => {
  const entry = { id: 'r2-static', title: 'Vật lí — tiêu đề kho thật R2', subject: 'Vật lí', questionCount: 20, durationMinutes: 45 };
  const f = await seeded([entry]);
  const assignment = await rpc(f.ctx, 'assignExam', { token: f.login.token, classId: f.cls.classId,
    examId: entry.id, openAt: '2020-01-01T00:00:00Z', dueAt: '2099-01-01T00:00:00Z' });
  const cls = await API.handle({ method: 'GET', query: { action: 'getClass', code: f.cls.code } }, f.ctx);
  const list = await rpc(f.ctx, 'listAssignments', { token: f.login.token, classId: f.cls.classId });
  for (const rows of [cls.body.assignments, list.assignments]) {
    const row = rows.find(a => a.assignmentId === assignment.assignmentId);
    assert.equal(row.title, entry.title, 'Đề tĩnh phải có tiêu đề thật, không hiện examId (WEB-contract §22)');
    assert.equal(row.questionCount, 20, 'Catalog phải giữ số câu đề tĩnh (WEB-contract §22)');
    assert.equal(row.durationMinutes, 45, 'Catalog phải giữ thời gian đề tĩnh (WEB-contract §22)');
  }
});

test('dist: [collect] R2: hạn mở, bù trễ 2 phút và retry giữ mã cũ (WEB-contract §22)', async () => {
  const f = await seeded();
  const start = f.ctx.now(), due = start + 60000;
  const a = await f.ctx.store.getAssignment(f.assignment.assignmentId);
  await f.ctx.store.saveAssignment({ ...a, openAt: new Date(start).toISOString(), dueAt: new Date(due).toISOString() });
  const body = { action: 'submitResult', attempt_id: 'r2-boundary', exam_id: exam.examId, exam_version_id: exam.examVersionId,
    candidate_display: 'Học sinh R2', total: '1/4', maxTotal: '1/4',
    sections: { I: { score: '1/4', max: '1/4' }, II: { score: '0', max: '0' }, III: { score: '0', max: '0' } },
    class_code: f.cls.code, assignment_id: a.assignmentId };
  f.ctx.now = () => start - 1;
  assert.equal((await API.handle({ method: 'POST', body }, f.ctx)).body.error, 'NOT_OPEN', 'Trước giờ mở trả NOT_OPEN (WEB-contract §22, §19.2)');
  f.ctx.now = () => due + 120000;
  await rpc(f.ctx, 'submitResult', body);
  await rpc(f.ctx, 'submitResult', body);
  assert.equal(await f.ctx.store.countResults(), 1, 'Retry tại hạn bù trễ không tạo bản ghi trùng (WEB-contract §22)');
  f.ctx.now = () => due + 120001;
  assert.equal((await API.handle({ method: 'POST', body: { ...body, attempt_id: 'r2-too-late' } }, f.ctx)).body.error,
    'PAST_DUE', 'Sau hạn +2 phút trả PAST_DUE (WEB-contract §22, §19.2)');
  assert.equal(await f.ctx.store.countResults(), 1, 'Bài quá hạn không được ghi (WEB-contract §22)');
});

async function click(page, selector) {
  await page.waitFor(s => {
    const e = document.querySelector(s); if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !e.disabled && getComputedStyle(e).visibility !== 'hidden';
  }, `Phần tử ${selector} phải hiển thị và bấm được (WEB-contract §19.1, §22)`, 10000, selector);
  const hit = await A.mouseClick(page, selector);
  assert.equal(hit.hitsTarget, true, `${selector} phải nhận chuột thật, không bị che (WEB-contract §19.1, §22)`);
  assert.ok(await page.eval(s => {
    const r = document.querySelector(s).getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  }, selector), `${selector} phải nằm trong khung nhìn (WEB-contract §19.1, §22)`);
}
async function type(page, selector, value) { await click(page, selector); await page.type(selector, value); }
async function openPage(t, server, path = '/Cunata/') {
  browser ??= await H.launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  page.r2Context = context;
  t.after(async () => {
    const name = t.name.replace(/[^a-zA-Z0-9]+/g, '-').slice(0, 100);
    writeFileSync(join(artifacts, name + '.json'), JSON.stringify({
      errors: page.errors, badRequests: page.badRequests, requests: page.requests, serverLog: server.log,
      text: await page.eval(() => document.body.innerText).catch(String),
    }, null, 2));
    await context.close();
  });
  await page.send('Network.setBlockedURLs', { urls: ['https://*'] });
  await page.setViewport(1440, 1000);
  await page.goto(server.url + path);
  return page;
}
async function shot(page, name) {
  const r = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(artifacts, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function teacherLogin(page) {
  await A.waitBoot(page);
  if (await A.onRoleChooser(page)) await click(page, '#btnRoleTeacher');
  await type(page, '#teacherUsername', teacher.username);
  await type(page, '#teacherPassword', teacher.password);
  await click(page, '#btnTeacherLogin');
  await page.waitFor(() => !!document.querySelector('#teacherShell')?.getClientRects().length,
    'apiBase phải đăng nhập giáo viên được (WEB-contract §22, §19.2)', 10000);
}

test('dist: [app] R2: apiBase cùng nguồn đăng nhập giáo viên, ưu tiên URL cũ (WEB-contract §22)', async t => {
  const f = await seeded();
  const s = await localServer(built(), { apiBase: '/api/rpc', appsScriptUrl: 'http://127.0.0.1:9/must-not-use' }, f.ctx);
  t.after(() => s.close());
  const p = await openPage(t, s, '/Cunata/#/giao-vien');
  await teacherLogin(p);
  const req = s.log.find(r => r.body?.action === 'teacherLogin');
  assert.ok(req, 'Trang giáo viên phải dùng apiBase kể cả có appsScriptUrl (WEB-contract §22)');
  assert.match(req.contentType, /^application\/json/, 'Đăng nhập web phải POST JSON cùng nguồn (WEB-contract §22)');
  assert.equal(req.body.username, teacher.username, 'Tên đăng nhập giữ nguyên qua UI (WEB-contract §22, §19.2)');
  assert.ok(!p.requests.some(u => u.includes(':9/')), 'apiBase thắng URL cũ, không gửi sang máy chủ cũ (WEB-contract §22)');
  await shot(p, 'teacher-api');
});

test('dist: [app] R2: admin dùng apiBase khi không có appsScriptUrl (WEB-contract §22)', async t => {
  const s = await localServer(built(), { apiBase: '/api/rpc' }); t.after(() => s.close());
  const p = await openPage(t, s, '/Cunata/admin.html');
  await type(p, '#adminPassword', s.ctx.adminPassword);
  await click(p, '#btnAdminLogin');
  await p.waitFor(() => !!document.querySelector('#adminPanel')?.getClientRects().length,
    'Admin phải mở bảng bằng apiBase duy nhất (WEB-contract §22, §19.1)', 10000);
  assert.ok(s.log.some(r => r.body?.action === 'adminStats'), 'Admin lấy thống kê qua API mới (WEB-contract §22, §19.2)');
  await shot(p, 'admin-api');
});

test('dist: [app] R2: apiBase tuyệt đối gửi JSON qua hai origin cục bộ (WEB-contract §22)', async t => {
  const f = await seeded();
  const backend = await localServer(built(), {}, f.ctx); t.after(() => backend.close());
  const web = await localServer(built(), { apiBase: backend.url + '/api/rpc' }); t.after(() => web.close());
  const p = await openPage(t, web, '/Cunata/#/giao-vien');
  await teacherLogin(p);
  const req = backend.log.find(r => r.body?.action === 'teacherLogin');
  assert.ok(req, 'apiBase tuyệt đối phải tới máy chủ khác origin qua browser thật (WEB-contract §22)');
  assert.match(req.contentType, /^application\/json/, 'Khác origin vẫn gửi POST JSON (WEB-contract §22)');
  assert.equal(web.log.length, 0, 'Không gửi RPC nhầm tới origin web (WEB-contract §22)');
});

async function studentExam(t, { failing = false } = {}) {
  const f = await seeded();
  const s = await localServer(built(), { apiBase: '/api/rpc' }, f.ctx); t.after(() => s.close());
  if (failing) s.failSubmissions();
  const p = await openPage(t, s, '/Cunata/#/hoc-sinh');
  await A.waitBoot(p);
  if (await A.onRoleChooser(p)) await click(p, '#btnRoleStudent');
  await type(p, '#startName', 'Học sinh R2 Nguyễn An');
  await click(p, '#btnNameContinue');
  await type(p, '#classCodeInput', f.cls.code);
  await click(p, '#btnJoinClass');
  const card = `#myClasses [data-class-code="${f.cls.code}"] .exam-card[data-assignment-id]`;
  await p.waitFor(s => !!document.querySelector(s), 'API mới phải trả đề được giao trong lớp (WEB-contract §22, §19.2)', 10000, card);
  await click(p, card);
  await click(p, '#btnStartExam');
  await p.waitFor(() => document.querySelectorAll('#examPane .question-card').length === 1,
    'API mới phải nạp nguyên đề (WEB-contract §22, §17.2)', 10000);
  assert.equal(await p.eval(() => document.querySelector('#candidateName').value), 'Học sinh R2 Nguyễn An',
    'Tên thí sinh phải lấy từ cổng tên (WEB-contract §19.1, §21, §22)');
  await click(p, `[data-qid="${A.qI(1)}"][data-option-id="${A.qI(1)}-a"]`);
  await click(p, '#btnSubmit');
  await click(p, '#btnConfirmSubmit');
  await A.waitReport(p);
  return { p, s, f };
}

test('dist: [app] R2: học sinh vào lớp, làm bài và nhận xác nhận qua apiBase (WEB-contract §22)', async t => {
  const { p, s, f } = await studentExam(t);
  await p.waitFor(() => /Đã gửi/.test(document.querySelector('#syncText')?.textContent || ''),
    'Chỉ báo Đã gửi sau xác nhận API mới (WEB-contract §22, §17.4)', 12000);
  const r = s.log.find(r => r.body?.action === 'submitResult');
  assert.ok(r, 'Nộp bài phải gửi submitResult sang API mới (WEB-contract §22)');
  assert.match(r.contentType, /^application\/json/, 'Collector web phải POST JSON (WEB-contract §22)');
  assert.equal(r.body.class_code, f.cls.code, 'Giữ class_code khi chuyển máy chủ (WEB-contract §22, §19.2)');
  assert.equal(r.body.assignment_id, f.assignment.assignmentId, 'Giữ assignment_id khi chuyển máy chủ (WEB-contract §22, §19.2)');
  assert.equal(r.body.candidate_display, 'Học sinh R2 Nguyễn An', 'Giữ tên từ cổng tên khi nộp (WEB-contract §22, §19.1)');
  assert.equal(await f.ctx.store.countResults(), 1, 'Máy chủ mới nhận đúng một kết quả (WEB-contract §22)');
  assert.equal((await API.handle({ method: 'POST', body: r.body }, f.ctx)).body.success, true,
    'Retry cùng attempt_id phải thành công (WEB-contract §22)');
  assert.equal(await f.ctx.store.countResults(), 1, 'Retry không tạo bản ghi trùng (WEB-contract §22)');
  await shot(p, 'student-confirmed');
});

test('dist: [app] R2: API lỗi không báo đã gửi và vẫn tải kết quả được (WEB-contract §22)', async t => {
  const { p, s, f } = await studentExam(t, { failing: true });
  await p.waitFor(() => /Chưa gửi|thử lại|lỗi|không.*gửi/i.test(document.querySelector('#syncText')?.textContent || ''),
    'API lỗi phải có trạng thái chưa gửi trung thực (WEB-contract §22, §17.4)', 12000);
  assert.doesNotMatch(await p.eval(() => document.querySelector('#syncText')?.textContent), /Đã gửi/,
    'Không được xác nhận giả khi API trả 503 (WEB-contract §22, §17.4)');
  assert.equal(await f.ctx.store.countResults(), 0, 'API 503 chưa ghi kết quả (WEB-contract §22)');
  await click(p, '#btnDownloadReportHtml');
  const download = await p.r2Context.waitDownload();
  assert.ok(download.text.includes(exam.title) && download.text.includes('Học sinh R2 Nguyễn An'),
    'API lỗi vẫn tải được báo cáo đúng đề và tên đã nhập (WEB-contract §22, §17.4, D08)');
  assert.ok(s.log.some(r => r.body?.action === 'submitResult'), 'Phải có lần gửi thật trước khi báo lỗi (WEB-contract §22)');
  await shot(p, 'student-failed');
});

test('dist: [app] R2: không có apiBase vẫn đăng nhập Apps Script qua redirect text/plain (WEB-contract §22)', async t => {
  const gas = await G.startGasServer(); t.after(() => gas.close());
  C.seedTeacher(gas, teacher);
  const s = await localServer(built(), { appsScriptUrl: gas.url }); t.after(() => s.close());
  const p = await openPage(t, s, '/Cunata/#/giao-vien');
  await teacherLogin(p);
  const r = gas.log.find(r => r.method === 'POST' && JSON.parse(r.body).action === 'teacherLogin');
  assert.ok(r, 'Thiếu apiBase phải dùng Apps Script cũ (WEB-contract §22)');
  assert.match(r.contentType, /^text\/plain/, 'Fallback phải giữ text/plain để không preflight (WEB-contract §22, §17.2)');
  assert.ok(p.requests.some(u => u.includes('/echo?')), 'Fallback phải theo redirect Apps Script (WEB-contract §22, §17.2)');
  assert.equal(s.log.length, 0, 'Fallback không được gọi API mới (WEB-contract §22)');
});

test('dist: [glue] R2: build API tự chứa, package ES module và catalog đúng (WEB-contract §22)', () => {
  const dir = join(built(), 'api');
  assert.ok(existsSync(join(dir, 'rpc.js')), 'Build phải emit dist/api/rpc.js (WEB-contract §22)');
  assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'))).type, 'module', 'dist/api phải là ES module (WEB-contract §22)');
  const files = readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.js'));
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    for (const m of text.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (spec.startsWith('node:')) continue;
      assert.ok(spec.startsWith('.'), `API chỉ dùng Node builtin hoặc file nội bộ: ${f}: ${spec} (WEB-contract §22)`);
      const dest = resolve(dirname(join(dir, f)), spec);
      assert.ok(dest.startsWith(resolve(dir) + sep), `API không import ngoài dist/api: ${f}: ${spec} (WEB-contract §22)`);
      assert.ok(existsSync(dest), `API import phải tồn tại trong gói độc lập: ${f}: ${spec} (WEB-contract §22)`);
    }
  }
  const index = JSON.parse(readFileSync(join(root, 'public/exams/index.json'))).exams;
  const project = e => Object.fromEntries(['id', 'title', 'subject', 'questionCount', 'durationMinutes'].map(k => [k, e[k]]));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'catalog.json'))).map(project), index.map(project),
    'catalog máy chủ phải lấy metadata thật từ public/exams/index.json (WEB-contract §22)');
});

test('dist: [glue] R2: gói API build gọi được GET và POST không cần file bên ngoài (WEB-contract §22)', async t => {
  const dir = mkdtempSync(join(artifacts, 'api-isolated-'));
  cpSync(join(built(), 'api'), dir, { recursive: true });
  const run = spawnSync(process.execPath, [join(here, 'wrapper-probe.mjs'), dir], {
    encoding: 'utf8', timeout: 10000,
    env: { DATABASE_URL: 'postgresql://r2:r2@127.0.0.1/r2', ADMIN_PASSWORD: 'r2-probe-admin' },
  });
  assert.equal(run.status, 0, `Probe entrypoint phải chạy trong môi trường cố định, fetch bị cách ly (WEB-contract §22): ${run.stderr}`);
  const { get, post } = JSON.parse(run.stdout);
  assert.equal(get.body?.success, true, `GET entrypoint phải nối store vào handle và giữ envelope (WEB-contract §22): ${JSON.stringify(get.body)}`);
  assert.ok(Array.isArray(get.body.exams), 'GET entrypoint phải trả exams array (WEB-contract §22, §17.2)');
  assert.equal(post.body?.success, false, 'POST entrypoint phải giữ envelope lỗi (WEB-contract §22)');
  assert.equal(post.body.error, 'UNAUTHORIZED', 'POST adminLogin sai mật khẩu phải giữ mã lỗi hợp đồng (WEB-contract §22, §19.2)');
});

test('dist: [glue] R2: API build cho phép CORS JSON từ GitHub Pages (WEB-contract §22)', async () => {
  const { default: handler } = await import(pathToFileURL(join(built(), 'api/rpc.js')).href);
  const headers = {}; let status = 200;
  await handler({ method: 'OPTIONS', url: '/api/rpc', headers: { origin: 'https://quancn12.github.io',
    'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } },
  { setHeader(k, v) { headers[k.toLowerCase()] = v; }, set statusCode(v) { status = v; }, end() {} });
  assert.ok([200, 204].includes(status), 'Preflight GitHub Pages phải thành công (WEB-contract §22)');
  assert.ok(['*', 'https://quancn12.github.io'].includes(headers['access-control-allow-origin']), 'CORS phải cho phép origin GitHub Pages (WEB-contract §22)');
  assert.match(headers['access-control-allow-methods'], /POST/, 'CORS phải cho phép POST (WEB-contract §22)');
  assert.match(headers['access-control-allow-headers'], /content-type/i, 'CORS phải cho phép JSON Content-Type (WEB-contract §22)');
});

test('dist: [glue] R2: publish chép API vào gốc, không nằm trong site (WEB-contract §22)', () => {
  const dir = published();
  assert.ok(existsSync(join(dir, 'api/rpc.js')), 'Repo công khai phải có api/rpc.js ở gốc (WEB-contract §22)');
  assert.equal(existsSync(join(dir, 'site/api')), false, 'Không được chép dist/api vào site/ (WEB-contract §22)');
  // Phó phòng 22/11/2026 (WEB-contract §22, đã chạy trên Vercel thật): Vercel biến MỌI file .js trong api/ thành một hàm, nên mã API nguyên vẹn nằm ở api/_lib/
  // (tiền tố _ = không thành hàm) và api/rpc.js chỉ chuyển tiếp sang đó.
  assert.equal(readFileSync(join(dir, 'api/_lib/rpc.js'), 'utf8'), 'export default function rpc() {}', 'Publish giữ nguyên artifact API trong api/_lib/ (WEB-contract §22)');
  assert.match(readFileSync(join(dir, 'api/rpc.js'), 'utf8'), /^export \{ default \} from '\.\/_lib\/rpc\.js';/, 'api/rpc.js chuyển tiếp sang api/_lib/rpc.js (WEB-contract §22)');
});

test('dist: [glue] R2: publish cấu hình Vercel dùng apiBase tương đối (WEB-contract §22)', () => {
  assert.deepEqual(JSON.parse(readFileSync(join(published(), 'site/public/config.json'))), { apiBase: '/api/rpc' },
    'Vercel site/public/config.json phải dùng API cùng nguồn, không Apps Script (WEB-contract §22)');
});

test('dist: [glue] R2: publish cấu hình Pages dùng API tuyệt đối (WEB-contract §22)', () => {
  assert.deepEqual(JSON.parse(readFileSync(join(published(), 'public/config.json'))), { apiBase: 'https://cunata.vercel.app/api/rpc' },
    'Pages public/config.json phải trỏ máy chủ Vercel (WEB-contract §22)');
});

test('dist: [glue] R2: publish giữ Apps Script, không nhập dữ liệu Sheet (WEB-contract §22)', () => {
  const dir = published();
  assert.equal(readFileSync(join(dir, 'apps-script/Code.js'), 'utf8'), '// R2 legacy sentinel',
    'Không xóa/thay Apps Script trong lúc chuyển máy chủ (WEB-contract §22)');
  assert.equal(readFileSync(join(artifacts, 'publish/input/apps-script/Code.js'), 'utf8'), '// R2 legacy sentinel',
    'Xuất bản không được sửa Apps Script nguồn (WEB-contract §22)');
});
