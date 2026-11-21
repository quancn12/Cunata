import { handle } from './handle.js';
import { NeonStore } from './store/neon.js';
import catalog from './catalog.json' with { type: 'json' };

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
      store: new NeonStore({ connectionString: process.env.DATABASE_URL }),
      now: () => Date.now(),
      adminPassword: process.env.ADMIN_PASSWORD,
      env: process.env,
      catalog,
    };
    const result = await handle({ method: req.method, query, body, headers: req.headers }, ctx);
    res.statusCode = result.status || 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(result.body));
  } catch {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ success: false, error: 'SERVER_ERROR', message: 'Lỗi máy chủ' }));
  }
}
