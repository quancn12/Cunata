// Máy chủ Vercel thật (WEB-contract §22) — Phó phòng 21/11/2026, trước khi chuyển hẳn khỏi Google Sheet.
// Test R1 dựng ctx.store sẵn nên không bắt được: dist/api/rpc.js (điểm vào Vercel) phải tự nối Neon qua DATABASE_URL,
// import tĩnh (Vercel chỉ đóng gói file được import tĩnh), và nói đúng giao thức SQL qua HTTP của Neon:
// POST https://<host>/sql, header Neon-Connection-String = chuỗi kết nối, thân JSON {query, params} — giá trị đi trong params, không ghép vào câu SQL.
// Không gọi mạng thật: fetch được thay bằng bản giả ghi lại yêu cầu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';

const RPC = join(process.cwd(), 'dist', 'api', 'rpc.js');
const DB = 'postgresql://kiemdinh_owner:MatKhauGia123@ep-kiem-dinh-123456.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function call(method, { query = {}, body } = {}) {
  const { default: handler } = await import(pathToFileURL(RPC).href + '?t=' + Date.now() + Math.random());
  const qs = new URLSearchParams(query).toString();
  const req = Object.assign(Readable.from(body ? [JSON.stringify(body)] : []), {
    method, url: '/api/rpc' + (qs ? '?' + qs : ''), query, body,
    headers: { origin: 'https://cunata.vercel.app', 'content-type': 'application/json' },
  });
  const headers = new Map(); let out = '';
  const res = {
    statusCode: 200, setHeader(k, v) { headers.set(k.toLowerCase(), String(v)); return this; }, getHeader(k) { return headers.get(k.toLowerCase()); },
    status(n) { this.statusCode = n; return this; }, writeHead(n, h = {}) { this.statusCode = n; for (const [k, v] of Object.entries(h)) this.setHeader(k, v); return this; },
    end(s) { out += s ?? ''; }, send(s) { out += typeof s === 'string' ? s : JSON.stringify(s); }, json(o) { out += JSON.stringify(o); },
  };
  await handler(req, res);
  return { status: res.statusCode, body: out ? JSON.parse(out) : null };
}

function withFakeNeon(fn) {
  return async () => {
    const calls = [];
    const saved = { fetch: globalThis.fetch, db: process.env.DATABASE_URL, admin: process.env.ADMIN_PASSWORD };
    globalThis.fetch = async (url, init = {}) => {
      const h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
      let body = null; try { body = JSON.parse(init.body); } catch { body = init.body; }
      calls.push({ url: String(url), headers: h, body });
      return new Response(JSON.stringify({ command: 'SELECT', rowCount: 0, fields: [], rows: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    process.env.DATABASE_URL = DB; process.env.ADMIN_PASSWORD = 'MatKhauAdminGia-2026';
    try { await fn(calls); } finally {
      globalThis.fetch = saved.fetch;
      if (saved.db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved.db;
      if (saved.admin === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = saved.admin;
    }
  };
}

test('dist: [glue] VERCEL01 dist/api/rpc.js import tĩnh hàm xử lý (không dò thư mục lúc chạy — Vercel chỉ đóng gói file import tĩnh) (WEB-contract §22)', () => {
  assert.ok(existsSync(RPC), 'phải có dist/api/rpc.js');
  const src = readFileSync(RPC, 'utf8');
  assert.doesNotMatch(src, /readdirSync|import\(\s*pathToFileURL/, 'rpc.js không được tìm module bằng readdirSync/import() động');
  assert.match(src, /^import\s[^;]*\bfrom\s+['"]\.\/(handle|index)\.js['"]/m, 'rpc.js phải import tĩnh từ ./handle.js hoặc ./index.js');
});

test('dist: [glue] VERCEL02 rpc.js tự nối Neon từ DATABASE_URL: getClass đọc qua https://<host>/sql, Neon-Connection-String, tham số tách riêng (WEB-contract §22)', withFakeNeon(async (calls) => {
  const r = await call('GET', { query: { action: 'getClass', code: 'KDX9Q2' } });
  assert.ok(calls.length > 0, 'getClass trên Vercel phải đọc Neon (fetch tới máy chủ SQL), không được trả lời mà không có cơ sở dữ liệu');
  for (const c of calls) {
    assert.equal(c.url, 'https://ep-kiem-dinh-123456.ap-southeast-1.aws.neon.tech/sql', 'Neon SQL qua HTTP: POST tới https://<host của DATABASE_URL>/sql');
    assert.equal(c.headers['neon-connection-string'], DB, 'Neon SQL qua HTTP: header Neon-Connection-String phải là nguyên chuỗi DATABASE_URL');
    assert.ok(c.body && typeof c.body.query === 'string', 'thân yêu cầu là JSON {query, params}');
    assert.ok(Array.isArray(c.body.params ?? []), 'params là mảng');
  }
  const sel = calls.find((c) => /\bclasses\b/i.test(c.body.query) && /^\s*select/i.test(c.body.query));
  assert.ok(sel, 'phải có câu SELECT trên bảng classes');
  assert.doesNotMatch(sel.body.query, /KDX9Q2/, 'mã lớp KHÔNG được ghép thẳng vào câu SQL (chống SQL injection) — phải đi trong params');
  assert.ok((sel.body.params || []).includes('KDX9Q2'), 'mã lớp phải nằm trong params');
  assert.equal(r.body?.error, 'NOT_FOUND', 'Neon không có lớp đó -> NOT_FOUND');
  assert.ok(!JSON.stringify(r.body).includes('MatKhauGia123'), 'phản hồi không được lộ DATABASE_URL');
}));

test('dist: [api] VERCEL03 phiên đăng nhập Admin lưu vào Neon (Vercel chạy nhiều tiến trình — không giữ dữ liệu trong bộ nhớ tiến trình) (WEB-contract §22)', withFakeNeon(async (calls) => {
  const r = await call('POST', { body: { action: 'adminLogin', password: 'MatKhauAdminGia-2026' } });
  assert.equal(r.body?.success, true, `adminLogin đúng mật khẩu phải thành công: ${JSON.stringify(r.body)}`);
  const ins = calls.find((c) => /^\s*insert\s+into\s+sessions\b/i.test(c.body?.query || ''));
  assert.ok(ins, 'đăng nhập phải ghi phiên vào bảng sessions trong Neon (INSERT INTO sessions)');
  assert.doesNotMatch(ins.body.query, new RegExp(r.body.token ?? '§'), 'token không được ghép vào câu SQL');
  const src = readFileSync(join(process.cwd(), 'dist', 'api', 'store', 'neon.js'), 'utf8');
  assert.doesNotMatch(src, /memory(Teachers|Sessions|Classes)\s*=\s*new Map/, 'NeonStore không được giữ dữ liệu trong Map bộ nhớ tiến trình');
}));
