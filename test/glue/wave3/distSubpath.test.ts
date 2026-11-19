/**
 * Unit & Integration Tests for WEB-W3-GLUE — Dist & Subpath (/Cunata/) Compatibility
 * Conforms to WEB-contract.md §2, §3, §10 and tasks.json (WEB-W3-GLUE).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertRuntimeImport } from '../assert-runtime-import.ts';

import { validateBrowserEmit, collectFiles } from '../../../scripts/web-build.ts';

describe('WEB-W3-GLUE — Dist & Subpath (/Cunata/) Compatibility', () => {
  const rootDir = path.resolve('.');
  const distDir = path.join(rootDir, 'dist');

  it('validates that dist/ directory exists and contains valid browser emit', () => {
    assert.ok(fs.existsSync(distDir), 'dist/ directory must exist');

    const validation = validateBrowserEmit(distDir);
    assert.equal(validation.valid, true, `dist/ validation must pass: ${validation.issues.join('; ')}`);
    assert.equal(validation.bareImports.length, 0, 'No bare imports allowed in dist/');
    assert.equal(validation.testArtifacts.length, 0, 'No test artifacts allowed in dist/');
    assert.equal(validation.absolutePaths.length, 0, 'No root-absolute links allowed in dist/index.html');
  });

  it('validates dist/index.html has relative asset paths for GitHub Pages subpath (/Cunata/) compatibility', () => {
    const distHtmlPath = path.join(distDir, 'index.html');
    assert.ok(fs.existsSync(distHtmlPath), 'dist/index.html must exist');

    const html = fs.readFileSync(distHtmlPath, 'utf8');

    // 1. Must use relative links starting with ./
    assert.ok(html.includes('href="./styles/style.css"'), 'Must link to ./styles/style.css relatively');
    assert.ok(html.includes('src="./app/main.js"'), 'Must link to ./app/main.js relatively');

    // 2. Must not contain root-absolute URLs
    const absoluteHrefMatch = html.match(/href=["']\/[^"']*["']/g);
    assert.equal(absoluteHrefMatch, null, 'dist/index.html must not contain root-absolute href links');

    const absoluteSrcMatch = html.match(/src=["']\/[^"']*["']/g);
    assert.equal(absoluteSrcMatch, null, 'dist/index.html must not contain root-absolute src links');
  });

  it('validates required public assets exist in dist/public/', () => {
    const distSampleExam = path.join(distDir, 'public/sample-exam.json');
    const distSvg = path.join(distDir, 'public/q01-bbt.svg');

    assert.ok(fs.existsSync(distSampleExam), 'dist/public/sample-exam.json must exist');
    assert.ok(fs.existsSync(distSvg), 'dist/public/q01-bbt.svg must exist');
  });

  it('verifies emitted JavaScript files in dist/ contain only relative import specifiers', () => {
    const jsFiles = collectFiles(distDir, '.js');
    assert.ok(jsFiles.length > 20, `Expected at least 20 JS files in dist, found ${jsFiles.length}`);

    const importExportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;

    for (const file of jsFiles) {
      const relFile = path.relative(distDir, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');

      let match: RegExpExecArray | null;
      while ((match = importExportRegex.exec(content)) !== null) {
        const specifier = match[1]!;
        assertRuntimeImport(distDir, file, specifier);
      }
    }
  });
});
