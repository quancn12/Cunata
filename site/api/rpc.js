import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let cachedHandler = null;

async function getBackendHandler() {
  if (cachedHandler !== null) return cachedHandler;
  try {
    const entries = fs.readdirSync(__dirname);
    for (const name of entries) {
      if (name.endsWith('.js') && name !== 'rpc.js') {
        const full = path.join(__dirname, name);
        try {
          const mod = await import(pathToFileURL(full).href);
          if (typeof mod.handle === 'function') {
            cachedHandler = mod.handle;
            return cachedHandler;
          }
        } catch {}
      }
    }
  } catch {}
  cachedHandler = false;
  return null;
}

export default async function handler(req, res) {
  const origin = req.headers?.origin || req.headers?.Origin || '*';
  res.setHeader('access-control-allow-origin', origin);
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', req.headers?.['access-control-request-headers'] || 'content-type, authorization');
  res.setHeader('access-control-max-age', '86400');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const backend = await getBackendHandler();
  if (backend) {
    try {
      let body = req.body;
      if (!body && req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        try { body = JSON.parse(raw); } catch { body = {}; }
      }
      const u = new URL(req.url || '/', 'http://127.0.0.1');
      const query = Object.fromEntries(u.searchParams);
      const ctx = {
        now: () => Date.now(),
        adminPassword: process.env.ADMIN_PASSWORD,
        env: process.env,
      };
      const result = await backend({ method: req.method, query, body, headers: req.headers }, ctx);
      res.statusCode = result.status || 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result.body));
      return;
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: err.message }));
      return;
    }
  }

  const u = new URL(req.url || '/', 'http://127.0.0.1');
  if (req.method === 'GET' && u.searchParams.get('action') === 'listExams') {
    try {
      const catPath = path.join(__dirname, 'catalog.json');
      if (fs.existsSync(catPath)) {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(fs.readFileSync(catPath, 'utf8'));
        return;
      }
    } catch {}
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ success: false, error: 'NOT_IMPLEMENTED', message: 'API handle is being implemented by worker FX48-api' }));
}
