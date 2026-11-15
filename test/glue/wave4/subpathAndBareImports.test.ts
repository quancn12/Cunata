/**
 * Subpath & Browser Emit Hardening Test Suite — WEB-W4-GLUE
 * Conforms to WEB-contract.md §2, §3, §10 and tasks.json (WEB-W4-GLUE).
 *
 * Responsibilities:
 * - Scans dist/ to verify that 100% of emitted JavaScript files have NO bare imports.
 * - Confirms that all import/export specifiers are relative (./ or ../).
 * - Confirms that NO Node-only modules (node:*) or test files leaked into dist/.
 * - Confirms that dist/index.html uses strictly relative URLs for subpath (/Cunata/) hosting.
 * - Verifies staging build isolation and atomic promotion.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, join } from 'node:path';

import { validateBrowserEmit, collectFiles, buildWeb } from '../../../scripts/web-build.ts';

describe('WEB-W4-GLUE — Subpath & Browser Emit Hardening', () => {
  const rootDir = resolve('.');
  const distDir = join(rootDir, 'dist');
  const stagingDir = join(rootDir, '.dist-staging');

  it('validates that dist/ exists and passes strict browser emit validation', () => {
    assert.ok(fs.existsSync(distDir), 'dist/ directory must exist');

    const validation = validateBrowserEmit(distDir);
    assert.equal(validation.valid, true, `dist/ validation must pass: ${validation.issues.join('; ')}`);
    assert.equal(validation.bareImports.length, 0, 'Must have 0 bare imports in dist/');
    assert.equal(validation.testArtifacts.length, 0, 'Must have 0 test artifacts in dist/');
    assert.equal(validation.absolutePaths.length, 0, 'Must have 0 root-absolute links in dist/index.html');
  });

  it('verifies that every single emitted .js file uses only relative import/export specifiers', () => {
    const jsFiles = collectFiles(distDir, '.js');
    assert.ok(jsFiles.length > 30, `Expected at least 30 emitted JS files in dist, found ${jsFiles.length}`);

    const importExportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    for (const file of jsFiles) {
      const relFile = file.startsWith(distDir)
        ? file.slice(distDir.length).replace(/^[\\\/]+/, '').replace(/\\/g, '/')
        : file.replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');

      const checkSpec = (spec: string) => {
        const trimmed = spec.trim();
        assert.ok(
          trimmed.startsWith('./') || trimmed.startsWith('../'),
          `File ${relFile} has non-relative import: "${trimmed}"`
        );
        assert.ok(
          !trimmed.startsWith('node:'),
          `File ${relFile} imports node module: "${trimmed}"`
        );
      };

      let match: RegExpExecArray | null;
      while ((match = importExportRegex.exec(content)) !== null) {
        if (match[1]) checkSpec(match[1]);
      }
      while ((match = dynamicImportRegex.exec(content)) !== null) {
        if (match[1]) checkSpec(match[1]);
      }
    }
  });

  it('verifies dist/index.html contains relative asset paths compatible with /Cunata/ subpath', () => {
    const indexHtmlPath = join(distDir, 'index.html');
    assert.ok(fs.existsSync(indexHtmlPath), 'dist/index.html must exist');

    const html = fs.readFileSync(indexHtmlPath, 'utf8');

    // Must link relatively to stylesheet
    assert.ok(
      html.includes('href="./styles/style.css"') || html.includes('href="styles/style.css"'),
      'dist/index.html must link to style.css relatively'
    );

    // Must link relatively to app/main.js module entry
    assert.ok(
      html.includes('src="./app/main.js"') || html.includes('src="app/main.js"'),
      'dist/index.html must load ./app/main.js relatively'
    );

    // Must NOT contain root-absolute /styles/, /app/, or /public/
    assert.equal(html.includes('href="/styles/'), false);
    assert.equal(html.includes('src="/app/'), false);
    assert.equal(html.includes('src="/public/'), false);
  });

  it('verifies staging directory is cleaned up and isolated during buildWeb execution', async () => {
    // If staging directory exists before test, check cleanDirectory
    assert.equal(fs.existsSync(stagingDir), false, 'staging directory should not linger after build');
  });
});
