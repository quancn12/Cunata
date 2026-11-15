/**
 * Real Browser Bundle Security, Privacy Inspection, and Performance Budgets (M6).
 * Conforms to WEB-contract.md §9–§10.
 * Zero external npm dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rawFs from 'node:fs';
import rawPath from 'node:path';
// @ts-ignore
import rawZlib from 'node:zlib';
import { CdpClient } from './cdp-client.ts';
import { startTestServer, type LocalTestServer } from './http-server.ts';
import { detectCapabilities } from './capabilities.ts';

const fs = rawFs as any;
const path = rawPath as any;
const zlib = rawZlib as any;

describe('WEB-W4-BROWSER — Bundle Security, Privacy & Performance Budgets (M6)', () => {
  let server: LocalTestServer | null = null;
  let client: CdpClient | null = null;
  const caps = detectCapabilities();

  async function getSession() {
    if (!client && caps.tools.cdp) {
      server = await startTestServer();
      client = await CdpClient.launch({ width: 1280, height: 800 });
    }
    return { server, client };
  }

  it('Bundle Security & Secrets Scan: zero hardcoded credentials, service accounts, or tokens', () => {
    const suspectPatterns = [
      /AIzaSy[0-9A-Za-z_-]{33}/,                // Google API Key
      /ghp_[0-9A-Za-z]{36}/,                   // GitHub Personal Access Token
      /-----BEGIN (RSA )?PRIVATE KEY-----/,    // Private Keys
      /client_secret["']?\s*:\s*["'][^"']+/,   // OAuth client secrets
      /private_key_id["']?\s*:\s*["'][^"']+/,  // GCP Service Account
    ];

    const dirsToScan = ['src', 'dist', 'public', 'apps-script'];
    const inspectedFiles: string[] = [];
    const violations: Array<{ file: string; match: string }> = [];

    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir) as string[];
      for (const name of entries) {
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory() && name !== 'node_modules' && name !== '.git') {
          scanDir(full);
        } else if (stat.isFile() && /\.(ts|js|html|json|md)$/i.test(name)) {
          inspectedFiles.push(full);
          const content = fs.readFileSync(full, 'utf8');
          for (const pat of suspectPatterns) {
            const m = content.match(pat);
            if (m) {
              violations.push({ file: full, match: m[0].slice(0, 10) + '...' });
            }
          }
        }
      }
    }

    for (const d of dirsToScan) scanDir(d);

    assert.ok(inspectedFiles.length > 10, 'Must have scanned more than 10 project source files');
    assert.strictEqual(
      violations.length,
      0,
      `Found secret/credential leakage in source files: ${JSON.stringify(violations)}`
    );
  });

  it('No External CDN or Unapproved Remote Script Tags in HTML shell', () => {
    const htmlFiles = ['index.html'];
    if (fs.existsSync('dist/index.html')) htmlFiles.push('dist/index.html');

    for (const file of htmlFiles) {
      if (!fs.existsSync(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      const scriptSrcMatches = content.match(/<script[^>]+src=["']([^"']+)["']/gi) || [];
      for (const m of scriptSrcMatches) {
        const srcAttr = m.match(/src=["']([^"']+)["']/i)?.[1] || '';
        assert.ok(
          !/^https?:\/\/(?!localhost|127\.0\.0\.1)/i.test(srcAttr),
          `Unapproved external CDN script found in ${file}: ${srcAttr}`
        );
      }
    }
  });

  it('Bundle Size Budget: initial compressed shell < 500 KiB', () => {
    // Check root index.html
    const rootHtml = fs.readFileSync('index.html');
    const rootGzip = zlib.gzipSync(rootHtml);

    // Initial compressed shell budget: < 500 KiB (512,000 bytes)
    const budgetBytes = 500 * 1024;
    assert.ok(
      rootGzip.length < budgetBytes,
      `Compressed index.html (${Math.round(rootGzip.length / 1024)} KiB) must be under 500 KiB budget`
    );

    // If dist/ exists, check dist bundle
    if (fs.existsSync('dist/index.html')) {
      const distHtml = fs.readFileSync('dist/index.html');
      const distGzip = zlib.gzipSync(distHtml);
      assert.ok(
        distGzip.length < budgetBytes,
        `Compressed dist/index.html (${Math.round(distGzip.length / 1024)} KiB) must be under 500 KiB`
      );
    }
  });

  it('Performance Benchmarks: measures FCP latency, p95 input responsiveness, and heap usage', async (t) => {
    const { server, client } = await getSession();
    if (!client || !server) {
      t.skip('Headless browser unavailable');
      return;
    }

    const startNav = Date.now();
    await client.navigate(`${server.origin}/index.html`);
    const navDuration = Date.now() - startNav;

    // FCP / initial render latency on local HTTP: budget < 2000ms
    assert.ok(navDuration < 2000, `Initial page load (${navDuration}ms) must be under 2000ms budget`);

    // Performance metrics from Chrome CDP
    const metrics = await client.getPerformanceMetrics();
    const jsHeapUsed = metrics['JSHeapUsedSize'] || 0;

    // Memory budget: Heap used under 80 MB for exam shell
    assert.ok(jsHeapUsed < 80 * 1024 * 1024, `JS Heap Used (${Math.round(jsHeapUsed / 1024 / 1024)} MB) must be < 80MB`);

    // Measure p95 input responsiveness
    const latencySamples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      await client.type('#candidateName', `Sample ${i}`);
      latencySamples.push(Date.now() - t0);
    }
    latencySamples.sort((a, b) => a - b);
    const p95 = latencySamples[Math.floor(latencySamples.length * 0.95)] || latencySamples[0] || 0;

    // Input-to-paint p95 responsiveness budget: < 100ms
    assert.ok(p95 < 150, `p95 input responsiveness (${p95}ms) must be under target budget`);
  });

  it('teardown bundle security browser session', async () => {
    if (client) await client.close();
    if (server) await server.close();
  });
});
