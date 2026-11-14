/**
 * Unit and integration tests for WEB-W2-GLUE — Web Build & Browser Packaging Pipeline
 * Conforms to WEB-contract.md §2, §3, §10 and tasks.json (WEB-W2-GLUE).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import rawFs from 'node:fs';
import rawPath from 'node:path';
// @ts-ignore
import rawOs from 'node:os';

const fs = rawFs as any;
const path = rawPath as any;
const os = rawOs as any;
import {
  validateBrowserEmit,
  prepareShellAndAssets,
  promoteStagedDist,
  cleanDirectory,
  collectFiles,
} from '../../../scripts/web-build.ts';

describe('WEB-W2-GLUE — Web Build & Browser Emit Validation', () => {
  it('validateBrowserEmit rejects bare imports in emitted JavaScript files', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cunata-build-test-'));
    try {
      fs.mkdirSync(path.join(tempDir, 'sub'), { recursive: true });

      // Valid relative imports
      fs.writeFileSync(
        path.join(tempDir, 'valid.js'),
        'import { foo } from "./sub/module.js";\nexport { bar } from "../other.js";\n'
      );
      // Hostile / bare import
      fs.writeFileSync(
        path.join(tempDir, 'invalid.js'),
        'import { readFileSync } from "node:fs";\nimport lodash from "lodash";\n'
      );
      // Valid shell
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        '<!doctype html><html><head><link rel="stylesheet" href="./styles/style.css"></head><body><script type="module" src="./app/main.js"></script></body></html>'
      );

      const res = validateBrowserEmit(tempDir);
      assert.equal(res.valid, false, 'Validation must fail when bare imports are present');
      assert.equal(res.bareImports.length, 2, 'Must detect exactly 2 bare imports');
      assert.ok(
        res.bareImports.some((b) => b.includes('node:fs')),
        'Must flag node:fs bare import'
      );
      assert.ok(
        res.bareImports.some((b) => b.includes('lodash')),
        'Must flag lodash bare import'
      );
    } finally {
      cleanDirectory(tempDir);
    }
  });

  it('validateBrowserEmit rejects test, Node scripts, or mock artifacts inside dist', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cunata-build-test-'));
    try {
      fs.mkdirSync(path.join(tempDir, 'test/e2e'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });

      fs.writeFileSync(path.join(tempDir, 'test/e2e/leaked.test.js'), '// test file');
      fs.writeFileSync(path.join(tempDir, 'scripts/runner.js'), '// script');
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        '<!doctype html><html><head><link rel="stylesheet" href="./styles/style.css"></head><body></body></html>'
      );

      const res = validateBrowserEmit(tempDir);
      assert.equal(res.valid, false, 'Validation must fail when test files leak into dist');
      assert.ok(res.testArtifacts.length >= 2, 'Must detect leaked test artifacts');
      assert.ok(
        res.testArtifacts.some((t) => t.includes('leaked.test.js')),
        'Must flag leaked test file'
      );
    } finally {
      cleanDirectory(tempDir);
    }
  });

  it('validateBrowserEmit rejects root-absolute links in index.html to guarantee subpath /Cunata/ compatibility', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cunata-build-test-'));
    try {
      // HTML with root-absolute links (breaks on GitHub Pages subpaths like /Cunata/)
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        '<!doctype html><html><head><link rel="stylesheet" href="/styles/style.css"></head><body><script src="/app/main.js"></script></body></html>'
      );

      const res = validateBrowserEmit(tempDir);
      assert.equal(res.valid, false, 'Validation must fail on root-absolute paths');
      assert.equal(res.absolutePaths.length, 2, 'Must flag both root-absolute links');
      assert.ok(
        res.absolutePaths.some((p) => p.includes('/styles/style.css')),
        'Must flag /styles/style.css'
      );
      assert.ok(
        res.absolutePaths.some((p) => p.includes('/app/main.js')),
        'Must flag /app/main.js'
      );
    } finally {
      cleanDirectory(tempDir);
    }
  });

  it('validateBrowserEmit approves cleanly structured browser emit with relative imports and assets', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cunata-build-test-'));
    try {
      fs.mkdirSync(path.join(tempDir, 'app'), { recursive: true });
      fs.mkdirSync(path.join(tempDir, 'styles'), { recursive: true });

      fs.writeFileSync(
        path.join(tempDir, 'app/main.js'),
        'import { route } from "./routes.js";\nexport function start() { return route; }\n'
      );
      fs.writeFileSync(path.join(tempDir, 'app/routes.js'), 'export const route = "exam";\n');
      fs.writeFileSync(path.join(tempDir, 'styles/style.css'), 'body { margin: 0; }');
      fs.writeFileSync(
        path.join(tempDir, 'index.html'),
        '<!doctype html><html lang="vi"><head><link rel="stylesheet" href="./styles/style.css"></head><body><script type="module" src="./app/main.js"></script></body></html>'
      );

      const res = validateBrowserEmit(tempDir);
      assert.equal(res.valid, true, `Validation must pass for clean bundle, got: ${res.issues.join('; ')}`);
      assert.equal(res.bareImports.length, 0);
      assert.equal(res.testArtifacts.length, 0);
      assert.equal(res.absolutePaths.length, 0);
    } finally {
      cleanDirectory(tempDir);
    }
  });

  it('prepareShellAndAssets rewrites shell stylesheet and module paths to relative paths', () => {
    const rootMock = fs.mkdtempSync(path.join(os.tmpdir(), 'cunata-mock-root-'));
    const stagingMock = fs.mkdtempSync(path.join(os.tmpdir(), 'cunata-mock-staging-'));

    try {
      fs.mkdirSync(path.join(rootMock, 'src/app'), { recursive: true });
      fs.mkdirSync(path.join(rootMock, 'styles'), { recursive: true });
      fs.mkdirSync(path.join(rootMock, 'public'), { recursive: true });

      // Mock shell.html with relative path from src/app/
      fs.writeFileSync(
        path.join(rootMock, 'src/app/shell.html'),
        '<!doctype html><html><head><link rel="stylesheet" href="../../styles/style.css"></head><body><script type="module" src="./main.js"></script></body></html>'
      );
      fs.writeFileSync(path.join(rootMock, 'styles/style.css'), '/* styles */');
      fs.writeFileSync(path.join(rootMock, 'public/sample.json'), '{"id":"mock"}');

      prepareShellAndAssets(rootMock, stagingMock);

      const indexHtmlPath = path.join(stagingMock, 'index.html');
      assert.ok(fs.existsSync(indexHtmlPath), 'staging/index.html must exist');
      const rewrittenHtml = fs.readFileSync(indexHtmlPath, 'utf8');

      // Stylesheet must be rewritten to ./styles/style.css
      assert.ok(
        rewrittenHtml.includes('href="./styles/style.css"'),
        'Stylesheet link must be rewritten to ./styles/style.css'
      );
      // Script entry must be rewritten to ./app/main.js
      assert.ok(
        rewrittenHtml.includes('src="./app/main.js"'),
        'Module script entry must be rewritten to ./app/main.js'
      );
      assert.ok(
        !rewrittenHtml.includes('../../styles/style.css'),
        'Old relative path ../../styles/style.css must be eliminated'
      );

      // Verify copied assets
      assert.ok(fs.existsSync(path.join(stagingMock, 'styles/style.css')), 'styles/style.css must be copied');
      assert.ok(fs.existsSync(path.join(stagingMock, 'public/sample.json')), 'public assets must be copied');
    } finally {
      cleanDirectory(rootMock);
      cleanDirectory(stagingMock);
    }
  });

  it('promoteStagedDist atomically moves staged contents and cleans staging directory', () => {
    const stagingMock = fs.mkdtempSync(path.join(os.tmpdir(), 'cunata-staging-'));
    const distMock = fs.mkdtempSync(path.join(os.tmpdir(), 'cunata-dist-'));

    try {
      fs.writeFileSync(path.join(stagingMock, 'test-staged.txt'), 'staged content');
      fs.writeFileSync(path.join(distMock, 'old-file.txt'), 'old content');

      promoteStagedDist(stagingMock, distMock);

      // Dist must have new content
      assert.ok(fs.existsSync(path.join(distMock, 'test-staged.txt')), 'Promoted file must exist in dist');
      assert.equal(fs.readFileSync(path.join(distMock, 'test-staged.txt'), 'utf8'), 'staged content');
      // Old dist content must be cleared
      assert.ok(!fs.existsSync(path.join(distMock, 'old-file.txt')), 'Old file in dist must be removed');
      // Staging directory must be cleaned up
      assert.ok(!fs.existsSync(stagingMock), 'Staging directory must be removed after promotion');
    } finally {
      cleanDirectory(stagingMock);
      cleanDirectory(distMock);
    }
  });
});
