/**
 * Unit & Integration Tests for WEB-W3-GLUE — Cutover Gate & Root Demo Preservation
 * Conforms to WEB-contract.md §2, §10, §12 and tasks.json (WEB-W3-GLUE).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { checkCutoverGates } from '../../../src/app/legacy.ts';

describe('WEB-W3-GLUE — Cutover Gate & Decision Enforcement', () => {
  it('enforces that cutover cannot proceed without owner approval (D03 / NEED_DECISION)', () => {
    const gate = checkCutoverGates();

    assert.equal(gate.canCutover, false, 'Cutover gate must remain closed');
    assert.equal(gate.preserveRootLegacy, true, 'Must preserve root index.html legacy demo');
    assert.equal(gate.status, 'NEED_DECISION', 'Gate status must report NEED_DECISION');
    assert.ok(gate.openDecisions.includes('D03'), 'Must identify D03 as blocking decision');
    assert.ok(gate.reason.includes('D03'), 'Must mention D03 in reason');
  });

  it('verifies that root index.html remains directly openable via file:// protocol without module CORS errors', () => {
    const rootDir = path.resolve('.');
    const indexPath = path.join(rootDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');

    // 1. Must NOT use external module script entry (<script type="module" src="...">) that triggers CORS error on file://
    const externalModuleScript = html.match(/<script\b[^>]*type=["']module["'][^>]*src=["'][^"']+["'][^>]*>/gi);
    assert.equal(
      externalModuleScript,
      null,
      'Root index.html must not use external <script type="module" src="..."> that fails under file:// protocol without a server'
    );

    // Must NOT contain external file import statements in scripts
    const scriptBlocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    for (const block of scriptBlocks) {
      assert.equal(
        /import\s+[\s\S]*?from\s+['"][^'"]+['"]/gi.test(block),
        false,
        'Root index.html scripts must not contain external import statements that fail under file://'
      );
    }

    // 2. Must use relative asset links (subpath / local folder safe)
    assert.ok(html.includes('styles/style.css'), 'Must link to styles/style.css relatively');
    assert.equal(
      html.includes('href="/styles/'),
      false,
      'Must NOT use root-absolute /styles/ paths'
    );

    // 3. Must contain semantic root slots
    assert.ok(html.includes('id="examTitle"'));
    assert.ok(html.includes('id="candidateName"'));
    assert.ok(html.includes('id="syncStatus"'));
    assert.ok(html.includes('id="timerBox"'));
    assert.ok(html.includes('id="btnSubmit"'));
    assert.ok(html.includes('id="paletteGrid"'));
    assert.ok(html.includes('id="examPane"'));
  });

  it('runs root index.html script successfully in an isolated DOM VM under file:// protocol simulation', () => {
    const rootDir = path.resolve('.');
    const indexPath = path.join(rootDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
      .map((m) => m[1])
      .join('\n');

    const createdElements: string[] = [];
    const createMockElement = (tag = 'div') => {
      createdElements.push(tag);
      return {
        tagName: tag.toUpperCase(),
        innerHTML: '',
        textContent: '',
        value: '',
        addEventListener: () => {},
        removeEventListener: () => {},
        classList: { add() {}, remove() {} },
        style: {},
        appendChild: () => {},
        setAttribute: () => {},
      };
    };

    const ctx: Record<string, unknown> = {
      console: { warn() {}, error() {} },
      document: {
        getElementById: () => createMockElement(),
        createElement: (tag: string) => createMockElement(tag),
        querySelectorAll: () => [],
        querySelector: () => null,
      },
      window: {
        addEventListener: () => {},
        scrollTo: () => {},
        location: { reload: () => {}, protocol: 'file:' },
      },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      },
      setInterval: () => 1,
      clearInterval: () => {},
    };

    vm.createContext(ctx);
    // Running script must not throw any exception
    assert.doesNotThrow(() => {
      vm.runInContext(script, ctx);
    }, 'Root index.html script must execute cleanly under file:// protocol simulation');

    // Verify core functions are initialized
    const scoreFn = vm.runInContext('typeof scoreAttemptLocally', ctx);
    assert.equal(scoreFn, 'function', 'scoreAttemptLocally must be initialized in VM');

    const computeMaxFn = vm.runInContext('typeof computeExamMaxFromQuestions', ctx);
    assert.equal(computeMaxFn, 'function', 'computeExamMaxFromQuestions must be initialized in VM');
  });
});
