import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
// No remote HTTP is possible, even if the wrapper starts constructing NeonStore.
globalThis.fetch = async () => Response.json({ rows: [] });
const { default: handler } = await import(pathToFileURL(join(process.argv[2], 'rpc.js')).href);
async function call(req) {
  const headers = {}; let raw;
  const res = { setHeader(k, v) { headers[k.toLowerCase()] = v; }, statusCode: 200, end(v) { raw = v; } };
  await handler({ headers: {}, ...req }, res);
  return { status: res.statusCode, headers, body: raw ? JSON.parse(raw) : null };
}
console.log(JSON.stringify({
  get: await call({ method: 'GET', url: '/api/rpc?action=listExams' }),
  post: await call({ method: 'POST', url: '/api/rpc', body: { action: 'adminLogin', password: 'wrong' } }),
}));
