/**
 * Unit & Integration Tests for WEB-W3-GLUE — Legacy Bridge (src/app/legacy.ts)
 * Conforms to WEB-contract.md §2, §10 and tasks.json (WEB-W3-GLUE).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExamVersion, Question } from '../../../src/domain/index.ts';
import { toFractionString } from '../../../src/domain/index.ts';
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
  convertLegacyResponsesToDomain,
  convertDomainResponsesToLegacy,
  scoreLegacyAttempt,
  createLegacyCompatibilityHarness,
  checkCutoverGates,
} from '../../../src/app/legacy.ts';

describe('WEB-W3-GLUE — Legacy Bridge Rational Arithmetic', () => {
  it('correctly adds, subtracts, multiplies and divides BigInt rationals', () => {
    const a = rational(1n, 4n);
    const b = rational(1n, 2n);

    // 1/4 + 1/2 = 3/4
    const sum = ratAdd(a, b);
    assert.equal(ratToFractionString(sum), '3/4');

    // 1/2 - 1/4 = 1/4
    const diff = ratSub(b, a);
    assert.equal(ratToFractionString(diff), '1/4');

    // 1/4 * 1/2 = 1/8
    const prod = ratMul(a, b);
    assert.equal(ratToFractionString(prod), '1/8');

    // (1/4) / (1/2) = 1/2
    const quotient = ratDiv(a, b);
    assert.equal(ratToFractionString(quotient), '1/2');
  });

  it('compares rationals and converts to floating-point number', () => {
    const a = rational(1n, 4n);
    const b = rational(1n, 2n);
    const c = rational(2n, 8n);

    assert.equal(ratCompare(a, b), -1);
    assert.equal(ratCompare(b, a), 1);
    assert.equal(ratCompare(a, c), 0);
    assert.equal(ratEquals(a, c), true);

    assert.equal(ratToNumber(a), 0.25);
    assert.equal(ratToNumber(b), 0.5);
  });

  it('parses and formats canonical fractions correctly', () => {
    assert.equal(isValidCanonicalFraction('0'), true);
    assert.equal(isValidCanonicalFraction('3/4'), true);
    assert.equal(isValidCanonicalFraction('10/3'), true);
    assert.equal(isValidCanonicalFraction('invalid'), false);
    assert.equal(isValidCanonicalFraction('1.5'), false);

    const r = parseCanonicalFraction('7/2');
    assert.ok(r);
    assert.equal(r.num, 7n);
    assert.equal(r.den, 2n);

    assert.equal(formatRationalScore('10'), '10');
    assert.equal(formatRationalScore('7/2'), '3,5');
    assert.equal(formatRationalScore('10/3'), '10/3 (~3,33)');
  });
});

describe('WEB-W3-GLUE — Short Answer & Exam Max Bridging', () => {
  it('bridges checkShortAnswer strictly through domain engine', () => {
    // Valid 4-character strings
    assert.deepEqual(legacyCheckShortAnswer('1,5'), []);
    assert.deepEqual(legacyCheckShortAnswer('-0,5'), []);
    assert.deepEqual(legacyCheckShortAnswer('0'), []);

    // Hostile or invalid strings
    const issuesDot = legacyCheckShortAnswer('1.5');
    assert.ok(issuesDot.length > 0, 'Dot decimal must be flagged');

    const issuesLong = legacyCheckShortAnswer('12345');
    assert.ok(issuesLong.length > 0, 'Strings exceeding 4 code points must be rejected');

    const issuesAlpha = legacyCheckShortAnswer('abc');
    assert.ok(issuesAlpha.length > 0, 'Alphabetical strings must be rejected');
  });

  it('computes exam max from questions conforming to GDPT 2018 custom rules', () => {
    const questions: Question[] = [
      {
        kind: 'I',
        questionVersionId: 'q1',
        options: [{ optionId: 'o1' }, { optionId: 'o2' }],
        correctOptionId: 'o1',
      },
      {
        kind: 'I',
        questionVersionId: 'q2',
        options: [{ optionId: 'o1' }, { optionId: 'o2' }],
        correctOptionId: 'o1',
      },
      {
        kind: 'I',
        questionVersionId: 'q3',
        options: [{ optionId: 'o1' }, { optionId: 'o2' }],
        correctOptionId: 'o1',
      },
      {
        kind: 'I',
        questionVersionId: 'q4',
        options: [{ optionId: 'o1' }, { optionId: 'o2' }],
        correctOptionId: 'o1',
      },
      {
        kind: 'II',
        questionVersionId: 'q5',
        statements: [
          { statementId: 's1', answer: true },
          { statementId: 's2', answer: false },
          { statementId: 's3', answer: true },
          { statementId: 's4', answer: false },
        ],
      },
      {
        kind: 'II',
        questionVersionId: 'q6',
        statements: [
          { statementId: 's1', answer: true },
          { statementId: 's2', answer: false },
          { statementId: 's3', answer: true },
          { statementId: 's4', answer: false },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'q7',
        answerKey: '1,5',
      },
      {
        kind: 'III',
        questionVersionId: 'q8',
        answerKey: '-0,5',
      },
    ];

    const max = computeExamMaxFromQuestions(questions);
    assert.equal(max.n1, 4);
    assert.equal(max.n2, 2);
    assert.equal(max.n3, 2);
    assert.equal(ratToFractionString(max.maxI), '1');
    assert.equal(ratToFractionString(max.maxII), '2');
    assert.equal(ratToFractionString(max.pointIII), '7/2');
    assert.equal(ratToFractionString(max.maxIII), '7');
    assert.equal(ratToFractionString(max.maxTotal), '10');
  });
});

describe('WEB-W3-GLUE — Response Mapper & Scorer Integration', () => {
  const baseExam: ExamVersion = {
    examId: 'bridge-test-exam',
    examVersionId: 'v1.0.0',
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q-i',
        options: [
          { optionId: 'opt-A' },
          { optionId: 'opt-B' },
          { optionId: 'opt-C' },
          { optionId: 'opt-D' },
        ],
        correctOptionId: 'opt-A',
      },
      {
        kind: 'II',
        questionVersionId: 'q-ii',
        statements: [
          { statementId: 'st-1', answer: true },
          { statementId: 'st-2', answer: false },
          { statementId: 'st-3', answer: true },
          { statementId: 'st-4', answer: false },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'q-iii',
        answerKey: '3,14',
      },
    ],
  };

  it('maps between legacy response dictionaries and domain AttemptResponses', () => {
    const legacyDict: Record<string, unknown> = {
      'q-i': 'opt-A',
      'q-ii': { 'st-1': true, 'st-2': false, 'st-3': null, 'st-4': true },
      'q-iii': '3,14',
    };

    const domainAttempt = convertLegacyResponsesToDomain(baseExam, legacyDict);
    assert.equal(domainAttempt.responses.length, 3);

    // Verify roundtrip back to legacy dictionary
    const roundtrip = convertDomainResponsesToLegacy(domainAttempt.responses);
    assert.equal(roundtrip['q-i'], 'opt-A');
    assert.deepEqual(roundtrip['q-ii'], { 'st-1': true, 'st-2': false, 'st-3': null, 'st-4': true });
    assert.equal(roundtrip['q-iii'], '3,14');
  });

  it('scoreLegacyAttempt scores using pure domain engine and produces both domain and legacy structures', () => {
    const legacyResponses = {
      'q-i': 'opt-A', // correct -> 1/4
      'q-ii': { 'st-1': true, 'st-2': false, 'st-3': false, 'st-4': false }, // 3 correct -> 0.50 (1/2)
      'q-iii': '3,14', // correct -> (10 - 1.25) / 1 = 8.75 (35/4)
    };

    const res = scoreLegacyAttempt(baseExam, legacyResponses);

    // Domain properties
    assert.equal(toFractionString(res.sections.I.score), '1/4');
    assert.equal(toFractionString(res.sections.II.score), '1/2');
    assert.equal(toFractionString(res.sections.III.score), '35/4');
    // Total = 1/4 + 2/4 + 35/4 = 38/4 = 19/2
    assert.equal(toFractionString(res.total), '19/2');

    // Legacy properties
    assert.equal(res.scoreIFraction, '1/4');
    assert.equal(res.scoreIIFraction, '1/2');
    assert.equal(res.scoreIIIFraction, '35/4');
    assert.equal(res.totalFraction, '19/2');
    assert.equal(res.scoreI, 0.25);
    assert.equal(res.scoreII, 0.5);
    assert.equal(res.scoreIII, 8.75);
    assert.equal(res.totalScore, 9.5);

    // Question results
    assert.equal(res.questionResults.length, 3);
    assert.equal(res.questionResults[0]?.status, 'full');
    assert.equal(res.questionResults[1]?.status, 'partial');
    assert.equal(res.questionResults[2]?.status, 'full');
  });

  it('createLegacyCompatibilityHarness exposes domain-backed functions on a target context', () => {
    const target: Record<string, unknown> = {};
    createLegacyCompatibilityHarness(target);

    assert.equal(typeof target.rational, 'function');
    assert.equal(typeof target.ratAdd, 'function');
    assert.equal(typeof target.scoreAttempt, 'function');
    assert.equal(typeof target.scoreLegacyAttempt, 'function');
    assert.equal(typeof target.checkCutoverGates, 'function');
  });
});
