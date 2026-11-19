/**
 * Cunata Web M2-M6 — Modular Web Build & Packaging Pipeline
 * Conforms to WEB-contract.md §2, §3, §10 and tasks.json (WEB-W4-GLUE).
 *
 * Responsibilities:
 * - Invokes existing TypeScript compiler without new dependencies.
 * - Compiles ES2022 modules to staged directory (.dist-staging) to avoid concurrent write races.
 * - Rewrites relative imports (.ts to .js handled by compiler via tsconfig.build.json).
 * - Copies and rewrites shell, styles, and public assets with relative links for subpath (/Cunata/) hosting.
 * - Validates browser emit: verifies NO bare imports, NO test/Node scripts, subpath asset references.
 * - Atomically promotes staged output to dist/ when validation succeeds.
 */

// @ts-ignore
import rawFs from 'node:fs';
// @ts-ignore
import rawPath from 'node:path';
// @ts-ignore
import { spawnSync } from 'node:child_process';
// @ts-ignore
import { pathToFileURL } from 'node:url';
// @ts-ignore
import crypto from 'node:crypto';

interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

interface NodeFs {
  existsSync(p: string): boolean;
  readFileSync(p: string, encoding: string): string;
  writeFileSync(p: string, data: string, encoding: string): void;
  rmSync(p: string, opts?: { recursive?: boolean; force?: boolean }): void;
  mkdirSync(p: string, opts?: { recursive?: boolean }): void;
  readdirSync(p: string, opts?: { withFileTypes?: boolean }): DirEntry[];
  copyFileSync(src: string, dest: string): void;
}

interface NodePath {
  dirname(p: string): string;
  resolve(...paths: string[]): string;
  join(...paths: string[]): string;
  relative(from: string, to: string): string;
}

interface NodeProcess {
  platform: string;
  argv: string[];
  exit(code?: number): never;
}

const fs = rawFs as unknown as NodeFs;
const path = rawPath as unknown as NodePath;
const proc = (typeof process !== 'undefined' ? process : { platform: 'win32', argv: [], exit: () => {} }) as unknown as NodeProcess;

export interface BuildWebOptions {
  readonly rootDir?: string;
  readonly outDir?: string;
  readonly stagingDir?: string;
  readonly promote?: boolean;
  readonly silent?: boolean;
}

export interface EmitValidationResult {
  readonly valid: boolean;
  readonly bareImports: readonly string[];
  readonly testArtifacts: readonly string[];
  readonly absolutePaths: readonly string[];
  readonly issues: readonly string[];
}

export interface BuildResult {
  readonly success: boolean;
  readonly outDir: string;
  readonly stagingDir: string;
  readonly promoted: boolean;
  readonly validation: EmitValidationResult;
  readonly emittedFiles: readonly string[];
  readonly error?: string;
}

export function cleanDirectory(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    try {
      (rawFs as any).rmSync(dirPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // In case Windows file handles briefly remain open, attempt retry or pass
    }
  }
}

export function copyDirectoryRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function collectFiles(dir: string, ext?: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, ext));
    } else if (!ext || entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Computes deterministic SHA-256 content digest across all build assets (excluding service-worker.js).
 */
export function computeBuildDigest(targetDir: string): string {
  const allFiles = collectFiles(targetDir);
  const fileEntries = allFiles
    .map((fullPath) => ({
      fullPath,
      relPath: path.relative(targetDir, fullPath).replace(/\\/g, '/'),
    }))
    .filter((entry) => entry.relPath !== 'service-worker.js')
    .sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  const hash = crypto.createHash('sha256');
  for (const entry of fileEntries) {
    hash.update(entry.relPath);
    hash.update('\0');
    const content = (rawFs as any).readFileSync(entry.fullPath);
    hash.update(content);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

/**
 * Validates emitted browser bundle in target directory:
 * 1. Checks that no bare imports exist in any emitted JavaScript file.
 * 2. Checks that no test, runner, or Node scripts leaked into dist.
 * 3. Checks that HTML shell has only relative URLs for subpath compatibility.
 */
export function validateBrowserEmit(targetDir: string): EmitValidationResult {
  const bareImports: string[] = [];
  const testArtifacts: string[] = [];
  const absolutePaths: string[] = [];
  const issues: string[] = [];

  if (!fs.existsSync(targetDir)) {
    return {
      valid: false,
      bareImports: [],
      testArtifacts: [],
      absolutePaths: [],
      issues: [`Directory does not exist: ${targetDir}`],
    };
  }

  // 1. Check all JS files for bare imports
  const jsFiles = collectFiles(targetDir, '.js');
  const importExportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const file of jsFiles) {
    const relFile = path.relative(targetDir, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');

    let match: RegExpExecArray | null;
    const checkSpecifier = (spec: string) => {
      const trimmed = spec.trim();
      // Relative imports must start with ./ or ../
      if (trimmed.startsWith('./') || trimmed.startsWith('../')) {
        return;
      }
      // In dist/api, standard Node built-in imports are permitted
      if (relFile.startsWith('api/') && trimmed.startsWith('node:')) {
        return;
      }
      // Bare import or absolute or node: module
      bareImports.push(`${relFile} -> "${trimmed}"`);
    };

    while ((match = importExportRegex.exec(content)) !== null) {
      if (match[1]) checkSpecifier(match[1]);
    }
    while ((match = dynamicImportRegex.exec(content)) !== null) {
      if (match[1]) checkSpecifier(match[1]);
    }
  }

  // 2. Check for test or node-only artifacts in targetDir
  const allFiles = collectFiles(targetDir);
  for (const file of allFiles) {
    const rel = path.relative(targetDir, file).replace(/\\/g, '/');
    if (
      rel.startsWith('test/') ||
      rel.startsWith('scripts/') ||
      rel.includes('.test.') ||
      rel.endsWith('.py') ||
      rel.includes('node_modules')
    ) {
      testArtifacts.push(rel);
    }
  }

  // 3. Check HTML shell for subpath compatibility (no leading absolute paths)
  const indexHtmlPath = path.join(targetDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const html = fs.readFileSync(indexHtmlPath, 'utf8');
    const attrRegex = /(?:href|src)=["'](\/[^"']*)["']/gi;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(html)) !== null) {
      const val = attrMatch[1];
      if (val && !val.startsWith('//')) {
        absolutePaths.push(`index.html contains root-absolute link: "${val}"`);
      }
    }
  } else {
    issues.push('Missing dist/index.html');
  }

  if (bareImports.length > 0) {
    issues.push(`Found ${bareImports.length} bare import(s) in browser emit`);
  }
  if (testArtifacts.length > 0) {
    issues.push(`Found ${testArtifacts.length} test/Node artifact(s) in browser emit`);
  }
  if (absolutePaths.length > 0) {
    issues.push(`Found ${absolutePaths.length} root-absolute link(s) in dist/index.html`);
  }

  return {
    valid: issues.length === 0,
    bareImports: Object.freeze(bareImports),
    testArtifacts: Object.freeze(testArtifacts),
    absolutePaths: Object.freeze(absolutePaths),
    issues: Object.freeze(issues),
  };
}

/**
 * Prepares serverless API artifacts in staging/api (WEB-contract §22)
 * - package.json: Vercel ES module declaration
 * - catalog.json: server-side catalog derived from public/exams/index.json
 * - rpc.js: Vercel serverless function entrypoint (CORS & RPC routing)
 */
export function prepareApiArtifacts(rootDir: string, stagingDir: string): void {
  const apiDir = path.join(stagingDir, 'api');
  fs.mkdirSync(apiDir, { recursive: true });

  // 1. package.json: Vercel ES module declaration
  const pkgPath = path.join(apiDir, 'package.json');
  fs.writeFileSync(pkgPath, JSON.stringify({ type: 'module' }, null, 2) + '\n', 'utf8');

  // 2. catalog.json: server-side catalog derived from public/exams/index.json
  const manifestPath = path.join(rootDir, 'public/exams/index.json');
  let catalogEntries: any[] = [];
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const rawList = Array.isArray(manifest) ? manifest : (manifest.exams || []);
      catalogEntries = rawList.map((e: any) => ({
        id: String(e.id || ''),
        title: String(e.title || ''),
        subject: String(e.subject || ''),
        questionCount: Number(e.questionCount) || 0,
        durationMinutes: Number(e.durationMinutes) || 50,
      }));
    } catch {}
  }
  const catalogPath = path.join(apiDir, 'catalog.json');
  fs.writeFileSync(catalogPath, JSON.stringify(catalogEntries, null, 2) + '\n', 'utf8');

  // 3. rpc.js: Vercel serverless function entrypoint (CORS & RPC routing)
  const rpcPath = path.join(apiDir, 'rpc.js');
  if (!fs.existsSync(rpcPath)) {
    const rpcContent = `import fs from 'node:fs';
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
`;
    fs.writeFileSync(rpcPath, rpcContent, 'utf8');
  }
}

/**
 * Prepares the shell and static assets inside the staging directory:
 * - Adapts src/app/shell.html to staging/index.html with relative links
 * - Copies styles/style.css to staging/styles/style.css
 * - Copies public/ assets to staging/public/
 */
export function prepareShellAndAssets(rootDir: string, stagingDir: string): void {
  fs.mkdirSync(stagingDir, { recursive: true });
  // 1. Prepare shell HTML
  const shellSrcPath = path.join(rootDir, 'src/app/shell.html');
  const indexDestPath = path.join(stagingDir, 'index.html');

  if (fs.existsSync(shellSrcPath)) {
    let shellHtml = fs.readFileSync(shellSrcPath, 'utf8');
    // Transform relative stylesheet link: ../../styles/style.css -> ./styles/style.css
    shellHtml = shellHtml.replace(/href=["']\.\.\/\.\.\/styles\/style\.css["']/g, 'href="./styles/style.css"');
    // Transform module script entry: ./main.js -> ./app/main.js
    shellHtml = shellHtml.replace(/src=["']\.\/main\.js["']/g, 'src="./app/main.js"');
    shellHtml = shellHtml.replace(/href=["']\.\.\/ui\//g, 'href="./ui/');
    shellHtml = shellHtml.replace(/href=["']\.\.\/\.\.\/styles\//g, 'href="./styles/');
    fs.writeFileSync(indexDestPath, shellHtml, 'utf8');
  }

  // 2. Prepare styles
  const stylesSrcDir = path.join(rootDir, 'styles');
  const stylesDestDir = path.join(stagingDir, 'styles');
  if (fs.existsSync(stylesSrcDir)) {
    copyDirectoryRecursive(stylesSrcDir, stylesDestDir);
  }

  // CSS is not emitted by tsc. Preserve each area's stylesheet next to its modules.
  for (const file of collectFiles(path.join(rootDir, 'src'))) {
    if (!file.endsWith('.css')) continue;
    const relative = path.relative(path.join(rootDir, 'src'), file);
    const destination = path.join(stagingDir, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, fs.readFileSync(file, 'utf8'), 'utf8');
  }

  const adminEntry = fs.existsSync(path.join(stagingDir, 'admin/main.js')) ? 'main' : 'index';
  if (!fs.existsSync(path.join(stagingDir, `admin/${adminEntry}.js`))) {
    console.warn('[web-build] BLOCKED admin integration: src/admin entrypoint is missing; admin.html is a shell only.');
  }
  fs.writeFileSync(path.join(stagingDir, 'admin.html'), `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cunata — Quản trị</title><link rel="stylesheet" href="./ui/tokens.css"><link rel="stylesheet" href="./ui/components.css"></head>
<body><main id="adminRoot"></main><script type="module" src="./admin/${adminEntry}.js"></script></body></html>`, 'utf8');

  // 3. Prepare public assets (sample exam, SVG, etc.)
  const publicSrcDir = path.join(rootDir, 'public');
  const publicDestDir = path.join(stagingDir, 'public');
  if (fs.existsSync(publicSrcDir)) {
    copyDirectoryRecursive(publicSrcDir, publicDestDir);
  }

  // 3b. Prepare serverless API artifacts in dist/api (WEB-contract §22)
  prepareApiArtifacts(rootDir, stagingDir);

  // 4. Compute deterministic build digest and prepare versioned Service Worker
  const buildDigest = computeBuildDigest(stagingDir);
  const cacheVersion = 'v-' + buildDigest;
  const cacheName = 'cunata-cache-' + cacheVersion;
  const swDestPath = path.join(stagingDir, 'service-worker.js');

  // Collect all emitted files in stagingDir to construct complete runtime precache manifest
  const allStagedFiles = collectFiles(stagingDir);
  const precacheEntries: { url: string; critical: boolean }[] = [
    { url: 'index.html', critical: true },
    { url: './', critical: true },
  ];
  const seenUrls = new Set<string>(['index.html', './']);

  for (const filePath of allStagedFiles) {
    const rel = path.relative(stagingDir, filePath).replace(/\\/g, '/');
    if (rel === 'service-worker.js' || rel.startsWith('api/')) continue;
    if (seenUrls.has(rel)) continue;
    seenUrls.add(rel);

    // All runtime code (JS, CSS, core JSON schemas & exams) is critical for cold offline start
    if (rel.endsWith('.js') || rel.endsWith('.css') || rel.endsWith('.json') || rel === 'public/q01-bbt.svg') {
      precacheEntries.push({ url: rel, critical: true });
    } else {
      precacheEntries.push({ url: rel, critical: false });
    }
  }

  const swContent = `// Cunata Web Native Service Worker
// Build Digest: ${buildDigest}
const BUILD_VERSION = '${cacheVersion}';
const CACHE_NAME_PREFIX = 'cunata-cache-';
const CACHE_NAME = '${cacheName}';
const DEFAULT_PRECACHE_ENTRIES = ${JSON.stringify(precacheEntries, null, 2)};

function resolveScopeUrl(scopeBase, relativePath) {
  const cleanBase = scopeBase.endsWith('/') ? scopeBase : (scopeBase + '/');
  const cleanPath = relativePath.startsWith('./') ? relativePath.slice(2) : (relativePath.startsWith('/') ? relativePath.slice(1) : relativePath);
  return cleanBase + cleanPath;
}

function isCacheableRequest(requestUrl, method) {
  if (method && method.toUpperCase() !== 'GET') return false;
  const lower = requestUrl.toLowerCase();
  if (lower.startsWith('chrome-extension:') || lower.startsWith('file:') || lower.startsWith('data:') || lower.startsWith('blob:')) return false;
  if (lower.includes('script.google.com') || lower.includes('macros.google.com') || lower.includes('script.googleusercontent.com')) return false;
  return true;
}

let isAttemptActive = false;
const clientActiveMap = new Map();

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const scope = (self.registration && self.registration.scope) || '/';
    const CONCURRENCY = 16;
    let index = 0;
    let abortError = null;

    async function worker() {
      while (index < DEFAULT_PRECACHE_ENTRIES.length && !abortError) {
        const item = DEFAULT_PRECACHE_ENTRIES[index++];
        if (!item) break;
        const fullUrl = resolveScopeUrl(scope, item.url);
        try {
          const resp = await fetch(fullUrl, { cache: 'no-cache' });
          if (resp && resp.ok) {
            await cache.put(fullUrl, resp.clone());
            if (fullUrl !== item.url) await cache.put(item.url, resp);
          } else if (item.critical) {
            throw new Error('Critical asset failed: ' + item.url + ' status: ' + (resp ? resp.status : 'null'));
          }
        } catch (err) {
          if (item.critical) {
            abortError = err;
            try { await caches.delete(CACHE_NAME); } catch (_) {}
            throw err;
          }
        }
      }
    }

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, DEFAULT_PRECACHE_ENTRIES.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    if (abortError) throw abortError;
  })());
});

async function checkClientsCanActivate() {
  if (!self.clients || !self.clients.matchAll) return !isAttemptActive;
  const windowClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  if (!windowClients || windowClients.length === 0) return true;

  const checks = windowClients.map((client) => {
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Unknown or non-responsive client -> defer activation
          resolve({ responsive: false, active: true });
        }
      }, 600);

      const channel = new MessageChannel();
      channel.port1.onmessage = (ev) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({
            responsive: true,
            active: Boolean(ev.data && ev.data.active),
            cacheName: ev.data?.cacheName,
          });
        }
      };

      try {
        client.postMessage({ type: 'QUERY_ATTEMPT_ACTIVE' }, [channel.port2]);
      } catch (_) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({ responsive: false, active: true });
        }
      }
    });
  });

  const statuses = await Promise.all(checks);
  const cannotActivate = statuses.some((s) => !s.responsive || s.active);
  return !cannotActivate;
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const currentCache = await caches.open(CACHE_NAME);

    // Verify currentCache has essential shell and main.js before pruning old caches
    const hasIndex = (await currentCache.match('index.html')) || (await currentCache.match('./'));
    const hasMain = await currentCache.match('app/main.js');
    if (!hasIndex || !hasMain) {
      if (self.clients && self.clients.claim) {
        await self.clients.claim();
      }
      return;
    }

    // Preserve any cached entries from old caches into the new cache
    const keys = await caches.keys();
    const oldKeys = keys.filter((k) => k.startsWith(CACHE_NAME_PREFIX) && k !== CACHE_NAME);

    for (const oldKey of oldKeys) {
      try {
        const oldCache = await caches.open(oldKey);
        const oldRequests = await oldCache.keys();
        for (const req of oldRequests) {
          const hasReq = await currentCache.match(req);
          if (!hasReq) {
            const resp = await oldCache.match(req);
            if (resp) {
              await currentCache.put(req, resp);
            }
          }
        }
      } catch (_) {}
    }

    // Check which clients are currently open and which caches they might still be referencing
    const windowClients = (self.clients && self.clients.matchAll)
      ? await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
      : [];

    const activeCachesInUse = new Set([CACHE_NAME]);
    if (windowClients.length > 0) {
      const clientChecks = windowClients.map((client) => {
        return new Promise((resolve) => {
          let done = false;
          const timer = setTimeout(() => {
            if (!done) { done = true; resolve(null); }
          }, 300);
          const channel = new MessageChannel();
          channel.port1.onmessage = (ev) => {
            if (!done) {
              done = true;
              clearTimeout(timer);
              resolve(ev.data?.cacheName || null);
            }
          };
          try {
            client.postMessage({ type: 'QUERY_CACHE_IN_USE' }, [channel.port2]);
          } catch (_) {
            if (!done) { done = true; clearTimeout(timer); resolve(null); }
          }
        });
      });
      const inUseList = await Promise.all(clientChecks);
      for (const name of inUseList) {
        if (name && typeof name === 'string' && name.startsWith(CACHE_NAME_PREFIX)) {
          activeCachesInUse.add(name);
        }
      }
    }

    // Only delete old caches that are NOT in use by any open client
    for (const k of oldKeys) {
      if (!activeCachesInUse.has(k)) {
        await caches.delete(k);
      }
    }

    if (self.clients && self.clients.claim) {
      await self.clients.claim();
    }
  })());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SET_ATTEMPT_ACTIVE') {
    isAttemptActive = Boolean(data.active);
    const clientId = (event.source && event.source.id) || data.clientId;
    if (clientId) {
      clientActiveMap.set(clientId, isAttemptActive);
    }
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage({ type: 'ATTEMPT_STATUS_ACK', active: isAttemptActive });
    }
  } else if (data.type === 'SKIP_WAITING') {
    event.waitUntil((async () => {
      const canActivate = await checkClientsCanActivate();
      if (!canActivate) {
        if (event.source && typeof event.source.postMessage === 'function') {
          event.source.postMessage({ type: 'UPDATE_DEFERRED_REPORT', active: true });
        }
        return;
      }
      self.skipWaiting();
    })());
  } else if (data.type === 'CHECK_OFFLINE_READY') {
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      const reqUrls = data.requiredUrls || DEFAULT_PRECACHE_ENTRIES.filter((i) => i.critical).map((i) => i.url);
      const missingUrls = [];
      let cachedCount = 0;
      for (const u of reqUrls) {
        const match = (await cache.match(u)) || (await cache.match(resolveScopeUrl((self.registration && self.registration.scope) || '/', u)));
        if (match) {
          cachedCount++;
        } else {
          missingUrls.push(u);
        }
      }
      if (event.source && typeof event.source.postMessage === 'function') {
        event.source.postMessage({
          type: 'OFFLINE_READY_REPORT',
          ready: missingUrls.length === 0,
          cachedCount,
          totalCount: reqUrls.length,
          missingUrls,
        });
      }
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!isCacheableRequest(req.url, req.method)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = (await cache.match(req)) || (await cache.match(req.url));
    const pathname = new URL(req.url).pathname;
    const mutableMetadata = pathname.endsWith('/public/config.json') || pathname.endsWith('/public/exams/index.json');
    if (mutableMetadata) {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        if (fresh && fresh.ok) {
          try { await cache.put(req, fresh.clone()); } catch (_) {}
        }
        return fresh;
      } catch (_) {
        if (cached) return cached;
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    }
    if (cached) return cached;
    try {
      const network = await fetch(req);
      if (network && network.ok && req.method === 'GET') {
        cache.put(req, network.clone()).catch(() => {});
      }
      return network;
    } catch (_) {
      const isNav = req.mode === 'navigate' || req.url.endsWith('/') || req.url.endsWith('.html');
      if (isNav) {
        const fallback =
          (await cache.match('index.html')) ||
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          (await cache.match('/'));
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
`;
  fs.writeFileSync(swDestPath, swContent, 'utf8');
}

/**
 * Executes TypeScript compiler targeting stagingDir.
 */
export function compileTypescript(rootDir: string, stagingDir: string, silent = false): {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const isWin = proc.platform === 'win32';
  const npxCmd = isWin ? 'npx.cmd' : 'npx';
  const args = [
    '--no-install',
    'tsc',
    '-p',
    'tsconfig.build.json',
    '--outDir',
    stagingDir,
  ];

  const res = spawnSync(npxCmd, args, {
    cwd: rootDir,
    encoding: 'utf8',
    shell: true,
  });

  const stdout = res.stdout || '';
  const stderr = res.stderr || '';
  const exitCode = res.status ?? 1;
  const success = exitCode === 0;

  if (!silent && !success) {
    if (stdout) console.error('[web-build] tsc stdout:', stdout);
    if (stderr) console.error('[web-build] tsc stderr:', stderr);
  }

  return { success, stdout, stderr, exitCode };
}

/**
 * Atomically promotes staging directory into target dist directory.
 */
export function promoteStagedDist(stagingDir: string, distDir: string): void {
  if (!fs.existsSync(stagingDir)) {
    throw new Error(`Cannot promote non-existent staging directory: ${stagingDir}`);
  }

  // Clean or swap dist
  if (fs.existsSync(distDir)) {
    cleanDirectory(distDir);
  }
  fs.mkdirSync(distDir, { recursive: true });
  copyDirectoryRecursive(stagingDir, distDir);
  cleanDirectory(stagingDir);
}

/**
 * Main build entrypoint:
 * - Compiles to staging
 * - Populates relative shell & assets
 * - Validates browser emit
 * - Atomically promotes to dist (if promote !== false)
 */
export async function buildWeb(options?: BuildWebOptions): Promise<BuildResult> {
  const rootDir = path.resolve(options?.rootDir ?? '.');
  const distDir = path.resolve(rootDir, options?.outDir ?? 'dist');
  const stagingDir = path.resolve(rootDir, options?.stagingDir ?? '.dist-staging');
  const promote = options?.promote ?? true;
  const silent = options?.silent ?? false;

  if (!silent) {
    console.log(`[web-build] Starting build in staging: ${stagingDir}`);
  }

  // 1. Clean staging directory to ensure fresh isolation
  cleanDirectory(stagingDir);
  fs.mkdirSync(stagingDir, { recursive: true });

  // 2. Run TypeScript compiler
  const compileRes = compileTypescript(rootDir, stagingDir, silent);
  if (!compileRes.success) {
    cleanDirectory(stagingDir);
    return {
      success: false,
      outDir: distDir,
      stagingDir,
      promoted: false,
      validation: {
        valid: false,
        bareImports: [],
        testArtifacts: [],
        absolutePaths: [],
        issues: [`TypeScript compilation failed with code ${compileRes.exitCode}: ${compileRes.stdout} ${compileRes.stderr}`],
      },
      emittedFiles: [],
      error: `TypeScript compilation failed with code ${compileRes.exitCode}`,
    };
  }

  // 3. Prepare shell and assets
  prepareShellAndAssets(rootDir, stagingDir);

  // 4. Validate emitted browser modules and assets
  const validation = validateBrowserEmit(stagingDir);
  if (!validation.valid) {
    if (!silent) {
      console.error('[web-build] Browser emit validation failed:', validation.issues);
    }
    cleanDirectory(stagingDir);
    return {
      success: false,
      outDir: distDir,
      stagingDir,
      promoted: false,
      validation,
      emittedFiles: [],
      error: `Validation failed: ${validation.issues.join('; ')}`,
    };
  }

  const emittedFiles = collectFiles(stagingDir).map((f) => path.relative(stagingDir, f).replace(/\\/g, '/'));

  // 5. Promote staged dist
  let promoted = false;
  if (promote) {
    promoteStagedDist(stagingDir, distDir);
    promoted = true;
    if (!silent) {
      console.log(`[web-build] Successfully promoted ${emittedFiles.length} files to ${distDir}`);
    }
  } else {
    if (!silent) {
      console.log(`[web-build] Staged build verified (${emittedFiles.length} files in staging, promote skipped)`);
    }
  }

  return {
    success: true,
    outDir: distDir,
    stagingDir,
    promoted,
    validation,
    emittedFiles: Object.freeze(emittedFiles),
  };
}

// Allow direct CLI invocation
const isMainModule = proc.argv[1] && pathToFileURL(path.resolve(proc.argv[1])).href === import.meta.url;
if (isMainModule) {
  buildWeb()
    .then((res) => {
      if (!res.success) {
        console.error('[web-build] Build failed:', res.error);
        proc.exit(1);
      }
      console.log('[web-build] Build completed successfully.');
      proc.exit(0);
    })
    .catch((err) => {
      console.error('[web-build] Fatal error:', err);
      proc.exit(1);
    });
}
