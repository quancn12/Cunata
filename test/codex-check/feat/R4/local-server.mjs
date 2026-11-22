import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { handle } = await import(pathToFileURL(root + '/src/api/handle.ts').href);
const { MemoryStore } = await import(pathToFileURL(root + '/src/api/store/memory.ts').href);
const H = await import(pathToFileURL(root + '/test/claude-check/harness.mjs').href);

// No environment variables, external services, or production configuration.
export async function localServer(exam) {
  const store = new MemoryStore();
  const now = Date.now();
  await store.saveExam({ id: exam.examId, title: exam.title, subject: exam.subject,
    grade: 12, durationMinutes: 50, questionCount: exam.questions.length, group: 'R4',
    revision: 1, updatedAt: new Date(now).toISOString(), owner: '', examJson: JSON.stringify(exam) });
  const ctx = { store, now: () => now };
  const calls = [];
  const rpc = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost');
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const request = { method: req.method, query: Object.fromEntries(url.searchParams),
        ...(raw ? { body: JSON.parse(raw) } : {}) };
      calls.push(request);
      const result = await handle(request, ctx);
      res.writeHead(result.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result.body));
    } catch (error) { res.writeHead(500); res.end(JSON.stringify({ message: error.message })); }
  });
  await new Promise(resolve => rpc.listen(0, '127.0.0.1', resolve));
  const apiBase = `http://127.0.0.1:${rpc.address().port}/api/rpc`;
  const web = await H.startServer(root + '/dist', { overrides: {
    'public/config.json': JSON.stringify({ apiBase, appsScriptUrl: '' }),
  } });
  return { ...web, store, ctx, calls, apiBase, handle,
    close: async () => {
      await web.close();
      rpc.closeAllConnections();
      await new Promise(resolve => rpc.close(resolve));
    } };
}
