/**
 * Acceptance & Invariant tests for WEB-W2-GLUE — Unapproved Features Gating & Legacy Parity
 * Conforms to WEB-contract.md §2, §7, §8, §10, §12 and tasks.json (WEB-W2-GLUE).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DisabledCollectorPort, enqueue, drainOutbox } from '../../../src/collect/index.ts';
import { checkShortAnswer, judgeIII, rational, add, toFractionString } from '../../../src/domain/index.ts';
import type { StoragePort, AttemptRecord } from '../../../src/storage/index.ts';

describe('WEB-W2-GLUE — Unapproved Features Isolation & Legacy Parity (D01-D08)', () => {
  it('D04: Collector is disabled by default and forbids automatic network transmission', async () => {
    const disabledPort = new DisabledCollectorPort();
    await assert.rejects(
      async () => {
        // @ts-ignore
        await disabledPort.send({} as AttemptRecord, new AbortController().signal);
      },
      {
        message: 'Collector endpoint is disabled by default',
      }
    );

    // Enqueue without endpoint must record local_saved only (no queued state)
    const mockStorage = {
      async getOutbox() {
        return { ok: true, value: null };
      },
      async updateOutbox(rec: unknown) {
        return { ok: true, value: rec };
      },
    } as unknown as StoragePort;

    const mockFinal = {
      examId: 'ex1',
      examVersionId: 'v1',
      attemptId: 'att1',
      schemaVersion: 'web-attempt-v1',
      revision: 1,
      candidateName: 'Thí sinh',
      examSnapshot: { examId: 'ex1', examVersionId: 'v1', questions: [] },
      presentationOrder: {},
      responses: { attemptId: 'att1', examVersionId: 'v1', responses: [] },
      startedAt: 1000,
      deadline: 4000,
      phase: 'final',
      submittedAt: 2000,
      scoreDTO: null,
    } as unknown as AttemptRecord;

    const enqRes = await enqueue(mockFinal, mockStorage, null);
    assert.equal(enqRes.ok, true);
    if (enqRes.ok) {
      assert.equal(enqRes.value.state, 'local_saved', 'Disabled collector must store local_saved, not queued');
      assert.equal(enqRes.value.endpointId, null);
    }
  });

  it('D01: Short Answer Part III preserves exact character string equality and charset validation', () => {
    // 1,5 vs 1.5 vs 1,50
    assert.deepEqual(checkShortAnswer('1,5'), []);
    assert.deepEqual(checkShortAnswer('-0,5'), []);
    assert.ok(checkShortAnswer('1,500').includes('too_long'));
    assert.ok(checkShortAnswer('1.5').includes('bad_char'));

    const q = { kind: 'III' as const, questionId: 'q1', questionVersionId: 'qv1', answerKey: '1,5' };
    const rCorrect = { kind: 'III' as const, questionVersionId: 'qv1', raw: '1,5' };
    const rDot = { kind: 'III' as const, questionVersionId: 'qv1', raw: '1.5' };
    const rZero = { kind: 'III' as const, questionVersionId: 'qv1', raw: '1,50' };
    const rSpace = { kind: 'III' as const, questionVersionId: 'qv1', raw: ' 1,5' };

    assert.equal(judgeIII(q, rCorrect), 'correct');
    assert.equal(judgeIII(q, rDot), 'wrong', '1,5 must not match 1.5');
    assert.equal(judgeIII(q, rZero), 'wrong', '1,5 must not match 1,50');
    assert.equal(judgeIII(q, rSpace), 'wrong', 'Leading space must not match');
    assert.equal(judgeIII(q, undefined), 'unanswered');
  });

  it('D02: Score rational precision is preserved without floating-point drift', () => {
    const r1 = rational(10n, 3n);
    const r2 = rational(20n, 3n);
    const sum = add(r1, r2);
    // 10/3 + 20/3 = 30/3 = 10
    assert.equal(toFractionString(r1), '10/3');
    assert.equal(toFractionString(sum), '10');
  });

  it('Root index.html retains intact legacy demo without premature cutover', () => {
    const rootIndexPath = path.resolve('index.html');
    assert.ok(fs.existsSync(rootIndexPath), 'Root index.html must exist');
    const content = fs.readFileSync(rootIndexPath, 'utf8');

    // Retains inline stylesheet link
    assert.ok(content.includes('styles/style.css'), 'Root index.html must retain stylesheet link');
    // Retains legacy studentState and timerBox elements
    assert.ok(content.includes('id="timerBox"'), 'Root index.html must contain #timerBox');
    assert.ok(content.includes('id="btnSubmit"'), 'Root index.html must contain #btnSubmit');
    assert.ok(content.includes('id="paletteGrid"'), 'Root index.html must contain #paletteGrid');
    // Must NOT have premature cutover to module entrypoint at root
    assert.ok(
      !content.includes('type="module" src="app/main.js"') &&
      !content.includes('type="module" src="./app/main.js"'),
      'Root index.html must not switch to module entrypoint until Wave 3 cutover'
    );
  });

  it('Apps Script sample files contain NO hardcoded tokens or secrets', () => {
    const codeJsPath = path.resolve('apps-script/Code.js');
    if (fs.existsSync(codeJsPath)) {
      const code = fs.readFileSync(codeJsPath, 'utf8');
      assert.ok(!code.includes('AIzaSy'), 'No Google API keys');
      assert.ok(!code.includes('client_secret'), 'No OAuth secrets');
      assert.ok(!code.includes('PRIVATE KEY'), 'No service account keys');
    }
  });
});
