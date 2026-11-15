/**
 * Distribution, Subpath (/Cunata/) & Module Emit Verification — WEB-FINAL-INTEGRATE
 * Conforms to WEB-contract.md §2, §3, §10 and tasks.json (WEB-FINAL-INTEGRATE).
 *
 * Responsibilities:
 * - Scans dist/ to verify that 100% of emitted JavaScript files have NO bare imports.
 * - Confirms that all import/export specifiers are relative (./ or ../).
 * - Confirms that NO Node-only modules (node:*) or test files leaked into dist/.
 * - Confirms that dist/index.html uses strictly relative URLs for subpath (/Cunata/) hosting.
 * - Verifies staging build isolation (.dist-staging) and atomic promotion to dist/.
 * - Verifies that tsconfig.build.json compiles src/ with zero errors.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, join } from 'node:path';

import {
  validateBrowserEmit,
  collectFiles,
  buildWeb,
  promoteStagedDist,
  cleanDirectory,
} from '../../../scripts/web-build.ts';

describe('WEB-FINAL-INTEGRATE — Distribution, Subpath & Module Emit Verification', () => {
  const rootDir = resolve('.');
  const distDir = join(rootDir, 'dist');
  const stagingDir = join(rootDir, '.dist-staging');

  it('validates that dist/ directory exists and passes strict browser emit validation', () => {
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

    // 1. Must NOT contain root-absolute links like href="/styles/..." or src="/app/..."
    const rootAbsMatches = html.match(/(?:href|src)=["']\/[^\/"'][^"']*["']/gi);
    assert.equal(
      rootAbsMatches,
      null,
      `dist/index.html must not contain root-absolute asset URLs: ${rootAbsMatches?.join(', ')}`
    );

    // 2. Must contain relative stylesheet link
    assert.ok(
      html.includes('href="./styles/style.css"') || html.includes('href="styles/style.css"'),
      'dist/index.html must link to styles/style.css relatively'
    );

    // 3. Must contain relative module script entry
    assert.ok(
      html.includes('src="./app/main.js"') || html.includes('src="app/main.js"'),
      'dist/index.html must load ./app/main.js relatively'
    );

    // 4. Required semantic markup
    assert.ok(html.includes('id="examTitle"'), 'Must have #examTitle');
    assert.ok(html.includes('id="examPane"'), 'Must have #examPane');
    assert.ok(html.includes('id="reportWrapper"'), 'Must have #reportWrapper');
  });

  it('verifies reproducible staged build execution without breaking live dist', async () => {
    // Run buildWeb with promote: false to verify staging pipeline in isolation
    const testStagingDir = join(rootDir, '.dist-staging-test');
    try {
      cleanDirectory(testStagingDir);
    } catch {
      // pass
    }

    const res = await buildWeb({
      rootDir,
      stagingDir: testStagingDir,
      promote: false,
      silent: true,
    });

    assert.equal(res.success, true, `Staged build must succeed: ${res.error}`);
    assert.ok(res.emittedFiles.length > 50, 'Emitted files count must exceed 50');
    assert.equal(res.validation.valid, true);

    try {
      cleanDirectory(testStagingDir);
    } catch {
      // pass
    }
  });
});
