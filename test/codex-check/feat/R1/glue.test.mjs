import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT, files, catalog, required } from './support.mjs';
// All generated output stays under the task's allowed scope. Never build at repo root.
const runtime = resolve(ROOT, 'ops/roadmap/tests/R1/_runtime');
mkdirSync(runtime, { recursive: true });
const work = mkdtempSync(join(runtime, 'run-'));
let build;
function built() {
  if (build) return build;
  const root = join(work, 'build'); mkdirSync(root, { recursive: true });
  for (const rel of ['src', 'scripts', 'public', 'styles', 'apps-script', 'api', 'assets', 'index.html', 'sample-exam.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.web.json', 'tsconfig.build.json', 'node_modules']) {
    const src = resolve(ROOT, rel); if (existsSync(src)) cpSync(src, join(root, rel), { recursive: true });
  }
  // Change only the isolated manifest: a stale or hardcoded catalog must fail.
  const manifestPath = join(root, 'public/exams/index.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.exams[0].title += ' — R1 catalog build sentinel';
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const run = spawnSync(process.execPath, ['scripts/build.js'], { cwd: root, encoding: 'utf8', timeout: 120000 });
  writeFileSync(join(work, 'build.log'), (run.stdout ?? '') + (run.stderr ?? ''));
  build = { root, run, expectedCatalog: manifest.exams };
  return build;
}
const check = (id, description, fn) => test(`dist: [glue] R1: ${id} ${description} (WEB-contract §22)`, { timeout: 180000 }, fn);
check('GLUE01', 'build thật xuất dist/api/rpc.js và ES module package', () => {
  const { root, run } = built();
  assert.equal(run.status, 0, 'WEB-contract §22: node scripts/build.js phải build thành công trong fixture cô lập (xem _runtime/build.log)');
  assert.ok(existsSync(join(root, 'dist/api/rpc.js')), 'WEB-contract §22: NOT_IMPLEMENTED — build chưa sinh dist/api/rpc.js');
  const pkg = JSON.parse(readFileSync(join(root, 'dist/api/package.json'), 'utf8'));
  assert.equal(pkg.type, 'module', 'WEB-contract §22: api/package.json type=module');
});
check('GLUE02', 'catalog build sinh đúng metadata từ public/exams/index.json', () => {
  const { root, expectedCatalog } = built(); const file = join(root, 'dist/api/catalog.json');
  assert.ok(existsSync(file), 'WEB-contract §22: NOT_IMPLEMENTED — thiếu dist/api/catalog.json');
  const json = JSON.parse(readFileSync(file, 'utf8')); const actual = Array.isArray(json) ? json : json.exams;
  const projection = xs => xs.map(x => Object.fromEntries(['id', 'title', 'subject', 'questionCount', 'durationMinutes'].map(k => [k, x[k]]))).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(projection(actual), projection(expectedCatalog), 'WEB-contract §22: catalog đúng id, title, subject, questionCount, durationMinutes từ manifest đã đổi, không gắn cứng');
});
check('GLUE03', 'dist/api tự chứa, graph import không đi ra ngoài', async () => {
  const { root } = built(); const dir = join(root, 'dist/api');
  assert.ok(existsSync(join(dir, 'rpc.js')), 'WEB-contract §22: NOT_IMPLEMENTED — thiếu artifact API để kiểm graph');
  const js = files(dir).filter(p => p.endsWith('.js'));
  for (const file of js) {
    const source = readFileSync(file, 'utf8');
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(x => x[1]);
    for (const spec of imports) {
      if (spec.startsWith('node:')) continue;
      assert.ok(spec.startsWith('.'), `WEB-contract §22: API không cần npm runtime: ${spec}`);
      const target = resolve(dirname(file), spec), rel = relative(dir, target);
      assert.ok(!rel.startsWith('..') && !resolve(target).startsWith(resolve(root, 'src')), 'WEB-contract §22: import nằm trong dist/api');
      assert.ok(existsSync(target), `WEB-contract §22: import artifact tồn tại ${spec}`);
    }
  }
  const { pathToFileURL } = await import('node:url');
  const rpc = await import(pathToFileURL(join(dir, 'rpc.js')).href);
  assert.equal(typeof rpc.default, 'function', 'WEB-contract §22: rpc.js export hàm Vercel');
});
check('GLUE04', 'publish thật trong fixture: api ở gốc, config hai host, giữ Apps Script', () => {
  const src = join(work, 'publish-source'), dst = join(work, 'publish-output');
  for (const p of ['dist/api', 'dist/public', 'public', 'apps-script']) mkdirSync(join(src, p), { recursive: true });
  writeFileSync(join(src, 'dist/index.html'), '<!doctype html><title>R1 fixture</title>');
  writeFileSync(join(src, 'index.html'), '<!doctype html><title>Legacy fixture</title>');
  writeFileSync(join(src, 'dist/api/rpc.js'), 'export default function handler() {}\n');
  writeFileSync(join(src, 'dist/api/package.json'), '{"type":"module"}');
  writeFileSync(join(src, 'public/config.json'), '{"appsScriptUrl":""}');
  writeFileSync(join(src, 'apps-script/Code.js'), '// inert Apps Script preservation fixture\n');
  const run = spawnSync('python', ['-B', fileURLToPath(new URL('./publish-probe.py', import.meta.url)), resolve(ROOT, 'ops/publish.py'), src, dst], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 30000 });
  writeFileSync(join(work, 'publish.log'), (run.stdout ?? '') + (run.stderr ?? ''));
  assert.equal(run.status, 0, 'WEB-contract §22: publisher phải đặt API/config đúng trong fixture, không deploy (xem _runtime/publish.log)');
});

check('GLUE05', 'điểm vào Vercel thực sự cho CORS preflight từ GitHub Pages', async () => {
  const { root } = built(); const entry = join(root, 'dist/api/rpc.js');
  assert.ok(existsSync(entry), 'WEB-contract §22: NOT_IMPLEMENTED — thiếu rpc.js để kiểm CORS');
  const { pathToFileURL } = await import('node:url');
  const { Readable } = await import('node:stream');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('WEB-contract §22: preflight không được gọi Neon/Google thật');
  try {
    const { default: handler } = await import(pathToFileURL(entry).href);
    const req = Object.assign(Readable.from([]), { method: 'OPTIONS', url: '/api/rpc',
      headers: { origin: 'https://quancn12.github.io', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' }, query: {} });
    const headers = new Map(); let ended = false;
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers.set(k.toLowerCase(), String(v)); return this; },
      getHeader(k) { return headers.get(k.toLowerCase()); },
      status(n) { this.statusCode = n; return this; },
      writeHead(n, h = {}) { this.statusCode = n; for (const [k, v] of Object.entries(h)) this.setHeader(k, v); return this; },
      end() { ended = true; }, send() { ended = true; }, json() { ended = true; },
    };
    await handler(req, res);
    assert.ok(ended && res.statusCode >= 200 && res.statusCode < 300, 'WEB-contract §22: OPTIONS hoàn tất thành công');
    assert.ok(['*', 'https://quancn12.github.io'].includes(headers.get('access-control-allow-origin')), 'WEB-contract §22: CORS cho origin GitHub Pages');
    assert.match(headers.get('access-control-allow-methods') ?? '', /\bPOST\b/i, 'WEB-contract §22: CORS cho POST');
    assert.match(headers.get('access-control-allow-headers') ?? '', /content-type/i, 'WEB-contract §22: CORS cho application/json');
  } finally { globalThis.fetch = originalFetch; }
});
