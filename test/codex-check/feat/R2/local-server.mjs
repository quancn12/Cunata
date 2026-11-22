import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
const { pathToFileURL } = await import('node:url');
const { handle, createMemoryStore } = await import(pathToFileURL(process.cwd() + '/src/api/index.ts').href);

export function memoryContext(catalog = []) {
  return { store: createMemoryStore(), now: () => Date.parse('2026-11-21T10:00:00Z'),
    adminPassword: 'R2-local-admin-123', catalog };
}

// A transport adapter only: every RPC runs the production handle with MemoryStore.
// No alternate implementation of business rules, no remote database or service.
export async function localServer(dir, config, ctx = memoryContext()) {
  const log = [];
  const errors = [];
  let failSubmissions = false;
  const mime = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.html': 'text/html', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/api/rpc') {
        // Local cross-origin browser transport only; production CORS is checked
        // separately against the emitted rpc.js entrypoint.
        const origin = req.headers.origin;
        if (origin && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
          res.setHeader('access-control-allow-origin', origin);
          res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
          res.setHeader('access-control-allow-headers', 'content-type');
        }
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const body = raw ? JSON.parse(raw) : undefined;
        log.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams),
          contentType: req.headers['content-type'], body });
        const result = failSubmissions && body?.action === 'submitResult'
          ? { status: 503, body: { success: false, error: 'SERVER_BUSY', message: 'Máy chủ đang bận' } }
          : await handle({ method: req.method, query: Object.fromEntries(url.searchParams), body, headers: req.headers }, ctx);
        res.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result.body));
        return;
      }
      if (url.pathname.endsWith('/public/config.json')) {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(config)); return;
      }
      const rel = decodeURIComponent(url.pathname).replace(/^\/Cunata\//, '').replace(/^\//, '');
      let file = resolve(dir, rel || 'index.html');
      if (!file.startsWith(resolve(dir) + sep) && file !== resolve(dir)) {
        res.writeHead(403); res.end(); return;
      }
      try {
        if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
        res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
        res.end(readFileSync(file));
      } catch { res.writeHead(404); res.end('not found'); }
    } catch (error) {
      errors.push(String(error)); res.writeHead(500); res.end(String(error));
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, log, errors, ctx,
    failSubmissions() { failSubmissions = true; },
    close: () => new Promise(r => { server.closeAllConnections(); server.close(r); }) };
}
