/**
 * Unit Tests for WEB-W3-GLUE — File-Open Fallback Generator
 * Conforms to WEB-contract.md §10 and tasks.json (WEB-W3-GLUE).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

import { generateFileOpenFallback } from '../../../src/app/legacy.ts';

describe('WEB-W3-GLUE — File-Open Fallback Artifact Generator', () => {
  it('generates a valid, self-contained IIFE without external dependencies or bare imports', () => {
    const fallbackScript = generateFileOpenFallback();

    assert.ok(typeof fallbackScript === 'string', 'Fallback artifact must be a string');
    assert.ok(fallbackScript.length > 50, 'Fallback artifact must be non-empty');
    assert.ok(fallbackScript.includes('function'), 'Must contain a function wrapper');
    assert.equal(fallbackScript.includes('import '), false, 'Must not contain ES module bare imports');
    assert.equal(fallbackScript.includes('export '), false, 'Must not contain ES module bare exports');
  });

  it('executes cleanly in a browser-like window VM and initializes __CUNATA_FILE_FALLBACK__', () => {
    const fallbackScript = generateFileOpenFallback();

    const mockWindow: Record<string, unknown> = {
      location: { protocol: 'file:' },
    };
    const ctx = vm.createContext({
      window: mockWindow,
      globalThis: mockWindow,
    });

    assert.doesNotThrow(() => {
      vm.runInContext(fallbackScript, ctx);
    });

    const fallbackObj = (mockWindow as unknown as {
      __CUNATA_FILE_FALLBACK__: {
        version: string;
        protocol: string;
        isDirectFile: boolean;
        ready: boolean;
      };
    }).__CUNATA_FILE_FALLBACK__;

    assert.ok(fallbackObj, '__CUNATA_FILE_FALLBACK__ must be defined on window');
    assert.equal(fallbackObj.protocol, 'file:');
    assert.equal(fallbackObj.isDirectFile, true);
    assert.equal(fallbackObj.ready, true);
    assert.equal(fallbackObj.version, 'wave-3-cutover-fallback');
  });

  it('handles non-window / node global environment gracefully without throwing', () => {
    const fallbackScript = generateFileOpenFallback();

    const nodeGlobal: Record<string, unknown> = {};
    const ctx = vm.createContext({
      globalThis: nodeGlobal,
    });

    assert.doesNotThrow(() => {
      vm.runInContext(fallbackScript, ctx);
    });

    const fallbackObj = (nodeGlobal as unknown as {
      __CUNATA_FILE_FALLBACK__: {
        version: string;
        protocol: string;
        isDirectFile: boolean;
        ready: boolean;
      };
    }).__CUNATA_FILE_FALLBACK__;

    assert.ok(fallbackObj, '__CUNATA_FILE_FALLBACK__ must be defined on globalThis');
    assert.equal(fallbackObj.protocol, 'unknown');
    assert.equal(fallbackObj.isDirectFile, false);
    assert.equal(fallbackObj.ready, true);
  });
});
