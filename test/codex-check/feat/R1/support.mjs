import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createServer } from 'node:http';
const { pathToFileURL } = await import('node:url');
export const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
export const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
export const ROOT = process.cwd();
export const ADMIN = 'R1-Admin-Password-2026';
export const T1 = { username: 'r1_lan', name: 'Cô Lan kiểm định', password: 'R1-Teacher-Password-2026' };
export const T2 = { username: 'r1_minh', name: 'Thầy Minh kiểm định', password: 'R1-Teacher-Password-2026' };
export const EPOCH = Date.parse('2026-11-19T05:00:00Z');
export const HOURS8 = 8 * 60 * 60 * 1000;
export const iso = (ms) => new Date(ms).toISOString();
export const catalog = JSON.parse(readFileSync(resolve(ROOT, 'public/exams/index.json'), 'utf8')).exams;
export function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
}
export function required(rel, requirement = 'WEB-contract §22') {
  const p = resolve(ROOT, rel);
  assert.ok(existsSync(p), `${requirement}: NOT_IMPLEMENTED — thiếu ${rel}`);
  return p;
}
export async function moduleAt(rel) { return import(pathToFileURL(required(rel)).href); }
// The contract names handle, but does not fix its file, request DTO or Store factory.
// All transport/factory adaptation is deliberately confined to this helper.
export async function loadHandle(base = resolve(ROOT, 'src/api')) {
  assert.ok(existsSync(base), 'WEB-contract §22: NOT_IMPLEMENTED — thiếu src/api và hàm handle(request, ctx)');
  for (const file of files(base).filter(p => /\.[cm]?[jt]s$/.test(p) && !/[\\/]store[\\/]/.test(p))) {
    const source = readFileSync(file, 'utf8');
    if (!/export\s+(?:async\s+)?function\s+handle\b|export\s+(?:const|let)\s+handle\b|export\s*\{[^}]*\bhandle\b/s.test(source)) continue;
    const m = await import(pathToFileURL(file).href);
    if (typeof m.handle === 'function') return m.handle;
  }
  assert.fail('WEB-contract §22: NOT_IMPLEMENTED — src/api phải export handle(request, ctx)');
}
export function instantiate(m, kind, options = {}) {
  const factory = m[`create${kind}Store`] ?? m.createStore;
  if (typeof factory === 'function') return factory(options);
  const C = m[`${kind}Store`] ?? m.default;
  assert.equal(typeof C, 'function', `WEB-contract §22: ${kind} Store cần factory hoặc constructor; cập nhật riêng adapter nếu tên export khác`);
  return new C(options);
}
export async function rig({ adminPassword = ADMIN, store, now = EPOCH } = {}) {
  const handle = await loadHandle();
  store ??= await instantiate(await moduleAt('src/api/store/memory.ts'), 'Memory');
  let time = now;
  const ctx = { store, now: () => time, adminPassword, env: { ADMIN_PASSWORD: adminPassword }, catalog };
  const responses = [];
  const request = async (method, data) => {
    const req = { method, query: method === 'GET' ? data : {}, body: method === 'POST' ? data : undefined,
      headers: { 'content-type': 'application/json' } };
    const out = await handle(req, ctx);
    assert.ok(out && Number.isInteger(out.status) && out.status >= 100 && out.status <= 599,
      'WEB-contract §22: handle trả {status, body}, status HTTP hợp lệ');
    assert.equal(typeof out.body?.success, 'boolean', 'WEB-contract §17.2/§22: mọi phản hồi JSON có success boolean');
    if (!out.body.success) {
      assert.equal(typeof out.body.error, 'string', 'WEB-contract §17.2/§22: lỗi có mã error');
      assert.ok(typeof out.body.message === 'string' && out.body.message.length, 'WEB-contract §17.2/§22: lỗi có message tiếng Việt');
    }
    noSecrets(out.body);
    responses.push(out.body);
    return out;
  };
  return { handle, ctx, store, responses, setTime(t) { time = t; },
    post: async data => (await request('POST', data)).body,
    get: async data => (await request('GET', data)).body, request };
}
export function noSecrets(value, additional = []) {
  const text = JSON.stringify(value);
  for (const s of [ADMIN, T1.password, ...additional].filter(Boolean))
    assert.ok(!text.includes(s), 'WEB-contract §22: phản hồi không lộ mật khẩu, băm, muối, PIN băm, DATABASE_URL');
  assert.ok(!/"(?:password|passwordHash|password_hash|salt|pinHash|pin_hash|DATABASE_URL)"\s*:/i.test(text),
    'WEB-contract §22: phản hồi không có trường bí mật');
}
export function ok(r, requirement = 'WEB-contract §19.2/§22') {
  assert.equal(r?.success, true, `${requirement}: hành động hợp lệ phải thành công (${r?.error ?? 'no error code'})`);
  return r;
}
export async function seed(r, teachers = [T1]) {
  const admin = ok(await r.post({ action: 'adminLogin', password: ADMIN })).token;
  const tokens = {};
  for (const teacher of teachers) {
    ok(await r.post({ action: 'adminCreateTeacher', token: admin, ...teacher }));
    tokens[teacher.username] = ok(await r.post({ action: 'teacherLogin', username: teacher.username, password: teacher.password })).token;
  }
  return { admin, ...tokens };
}
export async function classroom(r, token, examId, { openAt = EPOCH - 60000, dueAt = EPOCH + 60000 } = {}) {
  const c = ok(await r.post({ action: 'createClass', token, name: 'Lớp 12 kiểm định R1' }));
  const a = ok(await r.post({ action: 'assignExam', token, classId: c.classId, examId, openAt: iso(openAt), dueAt: iso(dueAt) }));
  return { ...c, ...a, openAt, dueAt };
}
export function payload(id, extra = {}) {
  return { attempt_id: id, exam_id: 'r1-exam', exam_version_id: 'v1.0.0', candidate_display: '=1+1 — Nguyễn An',
    started_at: iso(EPOCH - 30000), submitted_at: iso(EPOCH), duration_seconds: 30, policy_version: 'custom-v1',
    sections: { I: { score: '1/2', max: '1' }, II: { score: '3/4', max: '2' }, III: { score: '7/2', max: '7' } },
    total: '19/4', maxTotal: '10', raw_answers: {}, ...extra };
}
export function objects(root, seen = new Set()) {
  if (!root || typeof root !== 'object' || seen.has(root)) return [];
  seen.add(root);
  return [root, ...[...(root instanceof Map ? root.values() : Object.values(root))].flatMap(v => objects(v, seen))];
}
export function storedStrings(root) {
  return objects(root).flatMap(o => [...(o instanceof Map ? [...o.keys(), ...o.values()] : Object.values(o))]).filter(v => typeof v === 'string');
}
// Real local HTTP transport; never answers RPC from a fake implementation.
export async function localServer(r, staticServer) {
  const log = [];
  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/api/rpc') {
        if (!staticServer) { res.writeHead(404); res.end(); return; }
        const upstream = await fetch(staticServer.url + u.pathname.slice(1) + u.search);
        res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'text/plain' });
        res.end(Buffer.from(await upstream.arrayBuffer())); return;
      }
      let body = ''; for await (const chunk of req) body += chunk;
      const input = req.method === 'GET' ? Object.fromEntries(u.searchParams) : JSON.parse(body || '{}');
      log.push({ method: req.method, contentType: req.headers['content-type'], input });
      const out = await r.request(req.method, input);
      res.writeHead(out.status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out.body));
    } catch (e) { res.writeHead(500); res.end(JSON.stringify({ success: false, error: 'R1_TEST_SERVER', message: e.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, log,
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
export async function click(page, selector) {
  await page.waitFor(s => {
    const e = document.querySelector(s); if (!e) return false;
    e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.width > 0 && r.height > 0 && !!top && e.contains(top);
  }, `WEB-contract §19.1/§22: ${selector} hiện và nhận được chuột`, 10000, selector);
  assert.ok(await page.eval(s => { const r = document.querySelector(s).getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
  }, selector), `WEB-contract §19.1/§22: toàn bộ ${selector} nằm trong khung nhìn`);
  const hit = await A.mouseClick(page, selector);
  assert.ok(hit.hitsTarget, `WEB-contract §19.1/§22: ${selector} không bị che, bấm chuột thật`);
}
export async function type(page, selector, text) {
  await click(page, selector);
  await page.send('Input.insertText', { text });
}
