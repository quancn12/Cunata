import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moduleAt, instantiate, rig, seed, required, files, ROOT, ok, ADMIN } from './support.mjs';

test('dist: [api] R1: STORE01 Neon SQL-over-HTTP khởi tạo đủ bảng tự động, không lộ DATABASE_URL (WEB-contract §22)', async () => {
  required('src/api/store/neon.ts');
  const originalFetch = globalThis.fetch, originalURL = process.env.DATABASE_URL;
  const connection = 'postgresql://r1_user:r1_password@r1-fixture.invalid/r1_database?sslmode=require';
  const requests = [], messages = [];
  const originalLog = console.log, originalError = console.error;
  process.env.DATABASE_URL = connection;
  globalThis.fetch = async (url, init) => {
    // No network: even a wrong URL is only captured, never delegated to fetch.
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify({ fields: [], rows: [], rowCount: 0, command: 'CREATE' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  console.log = (...a) => messages.push(a.join(' ')); console.error = (...a) => messages.push(a.join(' '));
  try {
    const store = await instantiate(await moduleAt('src/api/store/neon.ts'), 'Neon', { connectionString: connection, fetch: globalThis.fetch, fetchImpl: globalThis.fetch });
    const r = await rig({ store });
    await r.get({ action: 'listExams' });
    const sql = requests.map(x => typeof x.init?.body === 'string' ? x.init.body : '').join('\n');
    assert.ok(requests.length, 'WEB-contract §22: Neon Store dùng fetch SQL-over-HTTP khi gọi lần đầu');
    for (const request of requests) assert.equal(new URL(request.url).protocol, 'https:', 'WEB-contract §22: Neon dùng SQL-over-HTTP qua HTTPS');
    for (const table of ['teachers', 'sessions', 'classes', 'students', 'assignments', 'exams', 'results'])
      assert.match(sql, new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+(?:public\\.)?["\\\\]*${table}\\b`, 'i'), `WEB-contract §22: tự tạo bảng ${table}, chạy lại an toàn`);
    assert.match(sql, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?["\\]*exams\b[\s\S]*?\bowner\b/i,
      'WEB-contract §22: bảng exams lưu owner giáo viên');
    assert.ok(!messages.join('\n').includes(connection), 'WEB-contract §22: không in DATABASE_URL ra log');
  } finally {
    globalThis.fetch = originalFetch; console.log = originalLog; console.error = originalError;
    if (originalURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalURL;
  }
});

test('dist: [api] R1: STORE02 Neon không nuốt lỗi HTTP thành ghi thành công (WEB-contract §22)', async () => {
  required('src/api/store/neon.ts');
  const originalFetch = globalThis.fetch, originalURL = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgresql://u:p@r1-fixture.invalid/r1';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('unavailable', { status: 503 }); };
  try {
    let response, thrown;
    try {
      const store = await instantiate(await moduleAt('src/api/store/neon.ts'), 'Neon', { fetch: globalThis.fetch, fetchImpl: globalThis.fetch });
      const r = await rig({ store }); response = await r.post({ action: 'adminLogin', password: ADMIN });
    } catch (e) { thrown = e; }
    assert.ok(calls > 0, 'WEB-contract §22: thực sự gọi SQL-over-HTTP giả lập');
    assert.ok(thrown || response?.success === false, 'WEB-contract §22: lỗi Neon không được báo thành công');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalURL;
  }
});

test('dist: [api] R1: STORE03 lõi giữ dữ liệu khi tái tạo ctx và tách Store khác (WEB-contract §22)', async () => {
  const r = await rig(); const t = await seed(r);
  const c = ok(await r.post({ action: 'createClass', token: t.r1_lan, name: 'Lớp bền trong Store' }));
  const reopened = await rig({ store: r.store });
  assert.equal(ok(await reopened.get({ action: 'getClass', code: c.code })).class.name, 'Lớp bền trong Store', 'WEB-contract §22: không giữ lớp/phiên trong biến toàn cục ngoài Store');
  ok(await reopened.post({ action: 'listMyClasses', token: t.r1_lan }));
  assert.equal((await (await rig()).get({ action: 'getClass', code: c.code })).error, 'NOT_FOUND', 'WEB-contract §22: dữ liệu không rò giữa Store');
});

test('dist: [api] R1: STORE04 src/api chỉ dùng Node có sẵn, không Google hay SDK ngoài (WEB-contract §22)', async () => {
  const paths = files(required('src/api')).filter(p => /\.[cm]?[jt]s$/.test(p));
  assert.ok(paths.some(p => p.endsWith('.ts')), 'WEB-contract §22: mã nguồn API TypeScript');
  for (const file of paths) {
    const source = readFileSync(file, 'utf8');
    const specs = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(x => x[1]);
    for (const spec of specs) assert.ok(spec.startsWith('.') || spec.startsWith('node:'), `WEB-contract §22: không thêm dependency runtime ${spec}`);
    assert.doesNotMatch(source, /script\.google(?:usercontent)?\.com|SpreadsheetApp|CacheService/, 'WEB-contract §22: backend mới không phụ thuộc Apps Script/Sheet');
  }
});
