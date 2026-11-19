import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assertRuntimeImport } from './assert-runtime-import.ts';
import { instrumentedGas, setup, classroom, result, ok } from '../../ops/blitz/promoted/_support/appsscript/fixtures.mjs';

test('numeric legacy Sheet class codes retain submissions, headcounts and assignment counts', { timeout: 10000 }, () => {
  const gas = instrumentedGas();
  const { tokens } = setup(gas);
  let draws = 0;
  gas.setUuid(() => draws++ < 2 ? '18181818-1818-4818-9818-181818181818' : crypto.randomUUID());
  const cls = classroom(gas, tokens[0]);
  assert.equal(cls.code, '222222');
  assert.equal(typeof gas.sheets.get('Lop').rows[1][1], 'number');
  ok(gas.post(result('numeric-class', { class_code: cls.code, assignment_id: cls.assignmentId })));
  const results = ok(gas.post({ action: 'listResults', token: tokens[0], classId: cls.classId }));
  assert.equal(results.results.length, 1);
  assert.equal(results.results[0].class_code, cls.code);
  const classes = ok(gas.post({ action: 'listMyClasses', token: tokens[0] }));
  assert.equal(classes.classes[0].studentCount, 1);
  const assignments = ok(gas.post({ action: 'listAssignments', token: tokens[0], classId: cls.classId }));
  assert.equal(assignments.assignments[0].submissionCount, 1);
});

test('runtime import checks allow built-ins only in API and preserve both graph boundaries', { timeout: 10000 }, () => {
  const dir = mkdtempSync(join(import.meta.dirname, 'fx53-import-'));
  try {
    mkdirSync(join(dir, 'api'));
    mkdirSync(join(dir, 'app'));
    writeFileSync(join(dir, 'api/handle.js'), '');
    writeFileSync(join(dir, 'app/helper.js'), '');
    const api = join(dir, 'api/rpc.js'), app = join(dir, 'app/main.js');
    assertRuntimeImport(dir, api, 'node:crypto');
    assertRuntimeImport(dir, api, './handle.js');
    assertRuntimeImport(dir, app, './helper.js');
    for (const spec of ['node:crypto', '../api/handle.js', './missing.js', './helper.ts', 'npm-package']) {
      assert.throws(() => assertRuntimeImport(dir, app, spec), spec);
    }
    assert.throws(() => assertRuntimeImport(dir, api, '../app/helper.js'));
    assert.throws(() => assertRuntimeImport(dir, api, 'node:unknown-module'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
