// Harness kiểm định độc lập của Phó phòng (Claude). KHÔNG phụ thuộc mã của worker.
// Trình duyệt thật (Chrome/Edge headless) điều khiển qua CDP bằng WebSocket có sẵn của Node >= 24. Không cần cài gì.
// Worker (Antigravity) KHÔNG được sửa thư mục test/claude-check/ và test/codex-check/.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const SUBPATH = '/Cunata/'; // giống GitHub Pages: site nằm dưới đường dẫn con

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Server tĩnh: phục vụ `dir` tại http://127.0.0.1:<port>/Cunata/ . Mọi đường dẫn ngoài /Cunata/ trả 404. */
export async function startServer(dir) {
  const root = resolve(dir);
  const hits = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let p = decodeURIComponent(url.pathname);
    hits.push(p);
    if (!p.startsWith(SUBPATH)) { res.writeHead(404); res.end('outside subpath'); return; }
    p = p.slice(SUBPATH.length);
    let file = normalize(join(root, p));
    if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    try {
      if (statSync(file).isDirectory()) file = join(file, 'index.html');
      const body = readFileSync(file);
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}${SUBPATH}`,
    hits,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}

function findBrowser() {
  const cands = [process.env.CUNATA_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  const hit = cands.find((c) => existsSync(c));
  if (!hit) throw new Error('Không tìm thấy Chrome/Edge. Đặt biến CUNATA_BROWSER trỏ tới file chạy trình duyệt.');
  return hit;
}

export async function launchBrowser() {
  const profile = mkdtempSync(join(tmpdir(), 'cunata-check-'));
  const proc = spawn(findBrowser(), ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--disable-background-networking',
    '--disable-features=Translate,MediaRouter', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  const t0 = Date.now();
  while (!existsSync(portFile)) {
    if (Date.now() - t0 > 20000) { proc.kill(); throw new Error('Trình duyệt không mở được cổng debug trong 20 giây'); }
    await sleep(100);
  }
  await sleep(100);
  const [port, path] = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('Không nối được CDP')), { once: true }); });
  let seq = 0;
  const pending = new Map();
  const listeners = new Map(); // sessionId -> Set<fn>
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
    if (m.id !== undefined) {
      const p = pending.get(m.id); pending.delete(m.id);
      if (p) { m.error ? p.rej(new Error(`CDP ${p.method}: ${m.error.message}`)) : p.res(m.result); }
    } else {
      for (const fn of listeners.get(m.sessionId ?? '') ?? []) fn(m.method, m.params);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej, method });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const on = (sessionId, fn) => { if (!listeners.has(sessionId)) listeners.set(sessionId, new Set()); listeners.get(sessionId).add(fn); };

  const browser = {
    /** Mỗi context là một hồ sơ sạch (localStorage/IndexedDB/cache riêng). */
    async newContext() {
      const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
      const downloadDir = mkdtempSync(join(tmpdir(), 'cunata-dl-'));
      await send('Browser.setDownloadBehavior', { behavior: 'allow', browserContextId, downloadPath: downloadDir, eventsEnabled: true });
      return {
        downloadDir,
        async newPage() {
          const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
          const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
          return makePage(send, on, sessionId, targetId);
        },
        /** Chờ tới khi thư mục tải về có file hoàn chỉnh; trả về {name, text}. */
        async waitDownload(timeout = 10000) {
          const t = Date.now();
          while (Date.now() - t < timeout) {
            const files = readdirSync(downloadDir).filter((f) => !f.endsWith('.crdownload') && !f.endsWith('.tmp'));
            if (files.length) { await sleep(150); return { name: files[0], text: readFileSync(join(downloadDir, files[0]), 'utf8'), all: files }; }
            await sleep(100);
          }
          throw new Error('Không có file nào được tải về trong ' + timeout + ' ms');
        },
        clearDownloads() { for (const f of readdirSync(downloadDir)) rmSync(join(downloadDir, f), { force: true }); },
        async close() { await send('Target.disposeBrowserContext', { browserContextId }).catch(() => {}); rmSync(downloadDir, { recursive: true, force: true }); },
      };
    },
    async close() {
      try { await send('Browser.close'); } catch { /* đã đóng */ }
      await sleep(300);
      try { proc.kill(); } catch { /* */ }
      for (let i = 0; i < 10; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(200); } }
    },
  };
  return browser;
}

function makePage(send, on, sessionId, targetId) {
  const S = (method, params) => send(method, params, sessionId);
  const page = {
    errors: [],      // lỗi JS chưa bắt, console.error
    badRequests: [], // request lỗi mạng hoặc HTTP >= 400
    dialogs: [],     // alert/confirm/prompt đã tự đóng
    requests: [],
    _loadWaiters: [],
    acceptDialogs: true,
  };
  const reqUrl = new Map();
  on(sessionId, (method, p) => {
    if (method === 'Runtime.exceptionThrown') page.errors.push('exception: ' + (p.exceptionDetails.exception?.description ?? p.exceptionDetails.text));
    else if (method === 'Runtime.consoleAPICalled' && p.type === 'error') page.errors.push('console.error: ' + p.args.map((a) => a.value ?? a.description ?? '').join(' '));
    else if (method === 'Log.entryAdded' && p.entry.level === 'error') page.errors.push('log: ' + p.entry.text + (p.entry.url ? ' @ ' + p.entry.url : ''));
    else if (method === 'Network.requestWillBeSent') { reqUrl.set(p.requestId, p.request.url); page.requests.push(p.request.url); }
    else if (method === 'Network.responseReceived' && p.response.status >= 400) page.badRequests.push(p.response.status + ' ' + p.response.url);
    else if (method === 'Network.loadingFailed' && !p.canceled) page.badRequests.push('FAILED ' + (reqUrl.get(p.requestId) ?? '?') + ' ' + p.errorText);
    else if (method === 'Page.javascriptDialogOpening') { page.dialogs.push(p.type + ': ' + p.message); S('Page.handleJavaScriptDialog', { accept: page.acceptDialogs }).catch(() => {}); }
    else if (method === 'Page.loadEventFired') { for (const w of page._loadWaiters.splice(0)) w(); }
  });
  const waitLoad = (timeout = 20000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Trang không tải xong trong ' + timeout + ' ms')), timeout);
    page._loadWaiters.push(() => { clearTimeout(t); res(); });
  });
  Object.assign(page, {
    async init() {
      await S('Page.enable'); await S('Runtime.enable'); await S('Network.enable'); await S('Log.enable'); await S('DOM.enable');
      return page;
    },
    async goto(url) { const w = waitLoad(); await S('Page.navigate', { url }); await w; },
    async reload() { const w = waitLoad(); await S('Page.reload', { ignoreCache: false }); await w; },
    /** Chạy hàm trong trang: page.eval((a, b) => ..., a, b). Giá trị trả về phải tuần tự hóa JSON được. */
    async eval(fn, ...args) {
      const expression = typeof fn === 'string' ? fn : `(${fn})(...${JSON.stringify(args)})`;
      const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (r.exceptionDetails) throw new Error('eval lỗi trong trang: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      return r.result.value;
    },
    /** Lặp tới khi hàm trả về giá trị truthy; ném lỗi kèm `what` khi quá hạn. */
    async waitFor(fn, what, timeout = 10000, ...args) {
      const t = Date.now(); let last;
      while (Date.now() - t < timeout) {
        try { last = await page.eval(fn, ...args); if (last) return last; } catch (e) { last = String(e.message); }
        await sleep(100);
      }
      throw new Error(`Quá ${timeout} ms mà chưa đạt: ${what}` + (last ? ` (giá trị cuối: ${JSON.stringify(last).slice(0, 200)})` : ''));
    },
    async click(selector) {
      const ok = await page.eval((s) => { const e = document.querySelector(s); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true; }, selector);
      if (!ok) throw new Error('Không tìm thấy phần tử để bấm: ' + selector);
    },
    /** Gõ như người dùng (giống dán / IME commit): focus rồi chèn văn bản. */
    async type(selector, text, { clear = true } = {}) {
      const ok = await page.eval((s, c) => { const e = document.querySelector(s); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.focus(); if (c && 'value' in e) { e.select?.(); } return true; }, selector, clear);
      if (!ok) throw new Error('Không tìm thấy ô nhập: ' + selector);
      await S('Input.insertText', { text }); // thay phần đang được chọn
    },
    async press(key) {
      const map = { Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape'], Tab: [9, 'Tab'], ' ': [32, 'Space', ' '], Backspace: [8, 'Backspace'], Delete: [46, 'Delete'],
        ArrowDown: [40, 'ArrowDown'], ArrowRight: [39, 'ArrowRight'], ArrowUp: [38, 'ArrowUp'], ArrowLeft: [37, 'ArrowLeft'] };
      const [vk, code, text] = map[key] ?? (/^[a-z0-9]$/i.test(key) ? [key.toUpperCase().charCodeAt(0), (/\d/.test(key) ? 'Digit' : 'Key') + key.toUpperCase(), key] : [0, '', key]);
      const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
      await S('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
      await S('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    },
    async setFiles(selector, files) {
      const { root } = await S('DOM.getDocument', { depth: 0 });
      const { nodeId } = await S('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error('Không tìm thấy input file: ' + selector);
      await S('DOM.setFileInputFiles', { nodeId, files });
    },
    addInitScript: (source) => S('Page.addScriptToEvaluateOnNewDocument', { source }),
    setViewport: (width, height, mobile = false) => S('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }),
    setOffline: (offline) => S('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }),
    async close() { await send('Target.closeTarget', { targetId }).catch(() => {}); },
    send: S,
  });
  return page.init();
}

export function writeTempJson(obj, name = 'exam.json') {
  const dir = mkdtempSync(join(tmpdir(), 'cunata-fx-'));
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
  return file;
}
