// Máy chủ HTTP giả lập Apps Script web app, chạy apps-script/Code.js THẬT (qua gas-fake.mjs).
// Giống hành vi thật: GET/POST tới /exec trả 302 sang /echo (như script.googleusercontent.com), CORS "*", POST text/plain.
import { createServer } from 'node:http';
import { makeGas } from './gas-fake.mjs';

export async function startGasServer({ password = 'MatKhau-GV-123', adminPassword = 'Admin-Cunata-2026', failPosts = 0 } = {}) {
  const gas = makeGas({ password, adminPassword });
  const echo = new Map();
  const log = [];          // {method, url, body}
  let seq = 0, toFail = failPosts;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const cors = { 'access-control-allow-origin': '*' };
    if (req.method === 'OPTIONS') { log.push({ method: 'OPTIONS', url: req.url }); res.writeHead(405, cors); res.end(); return; }   // Apps Script không hỗ trợ preflight
    if (url.pathname === '/echo') {
      const body = echo.get(url.searchParams.get('k'));
      res.writeHead(body ? 200 : 404, { ...cors, 'content-type': 'application/json; charset=utf-8' }); res.end(body ?? '{}'); return;
    }
    if (url.pathname !== '/exec') { res.writeHead(404, cors); res.end(); return; }
    let body = '';
    for await (const c of req) body += c;
    log.push({ method: req.method, url: req.url, contentType: req.headers['content-type'] ?? '', body });
    let out;
    try {
      if (req.method === 'GET') out = gas.get(Object.fromEntries(url.searchParams));
      else if (req.method === 'POST') {
        if (toFail > 0) { toFail--; res.writeHead(500, cors); res.end('Internal error'); return; }
        out = gas.post(JSON.parse(body));
      } else { res.writeHead(405, cors); res.end(); return; }
    } catch (e) { out = { success: false, error: 'TEST_SERVER_ERROR', message: String(e.message ?? e) }; }
    const k = String(++seq);
    echo.set(k, JSON.stringify(out));
    res.writeHead(302, { ...cors, location: `/echo?k=${k}` }); res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}/exec`, gas, log, password, adminPassword,
    setFailPosts(n) { toFail = n; },
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
