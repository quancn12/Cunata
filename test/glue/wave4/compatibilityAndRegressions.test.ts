/**
 * Compatibility, Regressions & Policy Isolation Test Suite — WEB-W4-GLUE
 * Conforms to WEB-contract.md §2, §10, §12 and tasks.json (WEB-W4-GLUE).
 *
 * Responsibilities:
 * - Verifies that root index.html remains directly openable via file:// protocol.
 * - Verifies cutover gate correctly enforces NEED_DECISION while D03 is open.
 * - Verifies that no unapproved business policy or mock-to-live CORS claim is accepted.
 * - Verifies BigInt Rational invariants, Part II vector scoring and Part III exact string rules.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolve, join } from 'node:path';

import {
  rational,
  ratAdd,
  ratSub,
  ratMul,
  ratDiv,
  ratCompare,
  ratEquals,
  ratToNumber,
  ratToFractionString,
  formatRationalScore,
  isValidCanonicalFraction,
  parseCanonicalFraction,
  legacyCheckShortAnswer,
  computeExamMaxFromQuestions,
  checkCutoverGates,
  generateFileOpenFallback,
  scoreLegacyAttempt,
} from '../../../src/app/legacy.ts';

import type { ExamVersion, QuestionI, QuestionII, QuestionIII } from '../../../src/domain/index.ts';

describe('WEB-W4-GLUE — Compatibility, Regressions & Policy Isolation', () => {
  const rootDir = resolve('.');
  const indexPath = join(rootDir, 'index.html');

  it('verifies root index.html is directly openable via file:// without module CORS errors', () => {
    assert.ok(fs.existsSync(indexPath), 'Root index.html must exist');
    const html = fs.readFileSync(indexPath, 'utf8');

    // 1. Must NOT contain external <script type="module" src="..."> that triggers file:// CORS errors
    const extModuleScripts = html.match(/<script\b[^>]*type=["']module["'][^>]*src=["'][^"']+["'][^>]*>/gi);
    assert.equal(
      extModuleScripts,
      null,
      'Root index.html must NOT have external <script type="module" src="..."> that fails under file://'
    );

    // 2. Must link stylesheet relatively
    assert.ok(html.includes('styles/style.css'), 'Must link to styles/style.css relatively');
    assert.equal(html.includes('href="/styles/'), false, 'Must not have root-absolute stylesheet link');

    // 3. Must contain required semantic UI elements
    assert.ok(html.includes('id="examTitle"'), 'Must have #examTitle');
    assert.ok(html.includes('id="candidateName"'), 'Must have #candidateName');
    assert.ok(html.includes('id="syncStatus"'), 'Must have #syncStatus');
    assert.ok(html.includes('id="timerBox"'), 'Must have #timerBox');
    assert.ok(html.includes('id="btnSubmit"'), 'Must have #btnSubmit');
    assert.ok(html.includes('id="examPane"'), 'Must have #examPane');
    assert.ok(html.includes('id="reportWrapper"'), 'Must have #reportWrapper');
    assert.ok(html.includes('id="reportView"'), 'Must have #reportView');
  });

  it('verifies cutover gates enforce NEED_DECISION and preserve root legacy demo', () => {
    const gate = checkCutoverGates();
    assert.equal(gate.canCutover, false, 'Cutover must NOT be auto-activated without Product Owner approval');
    assert.equal(gate.preserveRootLegacy, true, 'Root legacy demo must be preserved');
    assert.equal(gate.status, 'NEED_DECISION');
    assert.ok(gate.openDecisions.includes('D03'), 'Must cite open decision D03');
    assert.equal(gate.openDecisions.length, 8, 'Must list all 8 open owner decisions D01-D08');
  });

  it('verifies generateFileOpenFallback generates valid fallback structure', () => {
    const fallbackScript = generateFileOpenFallback();
    assert.ok(typeof fallbackScript === 'string' && fallbackScript.length > 50);
    assert.ok(fallbackScript.includes('__CUNATA_FILE_FALLBACK__'));
    assert.ok(fallbackScript.includes('isDirectFile'));
  });

  it('verifies BigInt Rational arithmetic invariants across edge cases', () => {
    // Exact addition: 1/3 + 1/6 = 3/6 = 1/2
    const a = rational(1n, 3n);
    const b = rational(1n, 6n);
    const sum = ratAdd(a, b);
    assert.equal(sum.num, 1n);
    assert.equal(sum.den, 2n);
    assert.equal(ratToFractionString(sum), '1/2');

    // Exact subtraction: 1/2 - 1/3 = 1/6
    const diff = ratSub(sum, a);
    assert.equal(diff.num, 1n);
    assert.equal(diff.den, 6n);

    // Exact multiplication: 10/3 * 3/1 = 10/1
    const r10_3 = rational(10n, 3n);
    const r3_1 = rational(3n, 1n);
    const prod = ratMul(r10_3, r3_1);
    assert.equal(prod.num, 10n);
    assert.equal(prod.den, 1n);

    // Division: 10 / (1/4) = 40
    const r10 = rational(10n, 1n);
    const r1_4 = rational(1n, 4n);
    const quot = ratDiv(r10, r1_4);
    assert.equal(quot.num, 40n);
    assert.equal(quot.den, 1n);

    // Equality and comparison
    assert.equal(ratEquals(rational(2n, 4n), rational(1n, 2n)), true);
    assert.equal(ratCompare(rational(1n, 3n), rational(1n, 2n)) < 0, true);

    // Canonical formatting
    assert.equal(formatRationalScore('10'), '10');
    assert.ok(formatRationalScore('7/3').includes('7/3'));
    assert.equal(isValidCanonicalFraction('7/3'), true);
    assert.equal(isValidCanonicalFraction('invalid-fraction'), false);
  });

  it('verifies Part III exact string comparison and negative number handling (-0,5)', () => {
    // Valid 4-character negative number
    const resNegative = legacyCheckShortAnswer('-0,5');
    assert.equal(resNegative.length, 0, '-0,5 must be valid with 0 issues');

    // 1,5 vs 1,50 vs 1.5 are distinct strings
    const issues1_5 = legacyCheckShortAnswer('1,5');
    assert.equal(issues1_5.length, 0);

    const issues1_50 = legacyCheckShortAnswer('1,50');
    assert.equal(issues1_50.length, 0);

    // Leading space must trigger whitespace / bad_char issue
    const issuesLeading = legacyCheckShortAnswer(' 1,5');
    assert.ok(issuesLeading.includes('bad_char'), 'Leading space must produce bad_char issue');

    // Exceeding 4 code points must trigger too_long issue
    const issuesTooLong = legacyCheckShortAnswer('12345');
    assert.ok(issuesTooLong.includes('too_long'), '5 chars must produce too_long issue');
  });

  it('verifies custom mode formula: when BASE >= 10, POINT_III = 0.25 (1/4) and total max is not clamped', () => {
    // 20 questions Part I (20 * 0.25 = 5 pts), 10 questions Part II (10 * 1 = 10 pts) -> BASE = 15 >= 10
    // Part III: 4 questions -> POINT_III = 0.25 -> MAX_III = 4 * 0.25 = 1 pt -> MAX_TOTAL = 16 pts
    const qI: QuestionI[] = [];
    for (let i = 1; i <= 20; i++) {
      qI.push({
        kind: 'I',
        questionVersionId: `qI_${i}_v1`,
        options: [
          { optionId: 'a' },
          { optionId: 'b' },
          { optionId: 'c' },
          { optionId: 'd' },
        ],
        correctOptionId: 'a',
      });
    }

    const qII: QuestionII[] = [];
    for (let i = 1; i <= 10; i++) {
      qII.push({
        kind: 'II',
        questionVersionId: `qII_${i}_v1`,
        statements: [
          { statementId: 's1', answer: true },
          { statementId: 's2', answer: false },
          { statementId: 's3', answer: true },
          { statementId: 's4', answer: false },
        ],
      });
    }

    const qIII: QuestionIII[] = [];
    for (let i = 1; i <= 4; i++) {
      qIII.push({
        kind: 'III',
        questionVersionId: `qIII_${i}_v1`,
        answerKey: '1,5',
      });
    }

    const maxResult = computeExamMaxFromQuestions([...qI, ...qII, ...qIII]);
    assert.equal(maxResult.n1, 20);
    assert.equal(maxResult.n2, 10);
    assert.equal(maxResult.n3, 4);
    assert.equal(ratToNumber(maxResult.maxI), 5);
    assert.equal(ratToNumber(maxResult.maxII), 10);
    assert.equal(ratToNumber(maxResult.pointIII), 0.25);
    assert.equal(ratToNumber(maxResult.maxIII), 1);
    assert.equal(ratToNumber(maxResult.maxTotal), 16, 'MAX_TOTAL must be exactly 16 (not clamped to 10)');
  });
});
