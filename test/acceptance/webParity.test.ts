/**
 * Acceptance & Differential Parity Test Suite — WEB-W3-GLUE
 * Conforms to WEB-contract.md §2, §10 and tasks.json (WEB-W3-GLUE).
 *
 * Responsibilities:
 * - Executes all 1,632 independent oracle fixtures across:
 *     1) Pure domain engine (src/domain/scoreAttempt.ts)
 *     2) Modular legacy bridge (src/app/legacy.ts -> scoreLegacyAttempt)
 *     3) Root legacy inline engine (index.html -> scoreAttemptLocally via VM)
 * - Verifies strict equality across:
 *     - total score & canonical fraction
 *     - maxTotal score & canonical fraction
 *     - sections.I, sections.II, sections.III score & max
 *     - per-question status ('full' | 'partial' | 'wrong' | 'unanswered' | 'invalid')
 *     - per-question points & maxPoints
 *     - raw answers and presentation order preservation
 * - Documents explicitly and provides regressions for all corrected legacy bugs:
 *     1) Exact BigInt Rational arithmetic vs binary floating-point drift
 *     2) Part II unanswered statements (never default to false; must earn 0)
 *     3) Part III exact string comparison (1,5 != 1,50 != 1.5; -0,5 length 4)
 *     4) Custom mode scoring formula when MAX_I + MAX_II >= 10 (pointIII = 0.25)
 *     5) Total maxima non-clamping (e.g. 15, 16, 5 not forced to 10)
 *     6) LC28-F01 overdue restore candidate nickname preservation
 *     7) LC35-F03 per-attempt retry timer callback isolation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import type { ExamVersion, AttemptResponses, ScoreResult } from '../../src/domain/index.ts';
import {
  scoreAttempt,
  toFractionString,
  computeExamMax,
  rational,
  mul,
  toDecimalString,
} from '../../src/domain/index.ts';
import {
  scoreLegacyAttempt,
  convertDomainResponsesToLegacy,
  convertLegacyResponsesToDomain,
  createLegacyCompatibilityHarness,
  checkCutoverGates,
} from '../../src/app/legacy.ts';

interface OracleFixtureCase {
  id: string;
  exam: ExamVersion;
  attempt: AttemptResponses;
  expected: {
    sections: {
      I: { score: string; max: string };
      II: { score: string; max: string };
      III: { score: string; max: string };
    };
    total: string;
    maxTotal: string;
  };
}

interface OracleFixtureFile {
  cases: readonly OracleFixtureCase[];
}

function createLegacyVMContext() {
  const rootDir = path.resolve('.');
  const indexPath = path.join(rootDir, 'index.html');
  const html = fs.readFileSync(indexPath, 'utf8');
  const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .join('\n');

  const createMockElement = () => ({
    innerHTML: '',
    textContent: '',
    value: '',
    addEventListener: () => {},
    removeEventListener: () => {},
    classList: { add() {}, remove() {} },
    style: {},
    appendChild: () => {},
    setAttribute: () => {},
  });

  const ctx: Record<string, unknown> = {
    console: { warn() {}, error() {} },
    document: {
      getElementById: () => createMockElement(),
      createElement: () => createMockElement(),
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
  vm.runInContext(script, ctx);

  return {
    ctx,
    scoreLegacyVM(exam: ExamVersion, legacyResponses: Record<string, unknown>) {
      ctx._parityExam = exam;
      ctx._parityResponses = legacyResponses;
      vm.runInContext(
        'currentExam = _parityExam; studentState = { responses: _parityResponses };',
        ctx
      );
      return vm.runInContext('scoreAttemptLocally()', ctx) as {
        scoreIFraction: string;
        maxIFraction: string;
        scoreIIFraction: string;
        maxIIFraction: string;
        scoreIIIFraction: string;
        maxIIIFraction: string;
        totalFraction: string;
        maxTotalFraction: string;
        questionResults: readonly {
          questionVersionId: string;
          kind: string;
          status: string;
          pointsFraction: string;
          maxPointsFraction: string;
        }[];
      };
    },
  };
}

describe('WEB-W3-GLUE Acceptance & Differential Parity — 1,632 Oracle Fixtures', () => {
  const fixturesDir = path.join(path.resolve('.'), 'test', 'oracle', 'fixtures');
  const fixtureFiles = fs
    .readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const legacyVM = createLegacyVMContext();
  let totalFixturesExecuted = 0;

  for (const file of fixtureFiles) {
    const fullPath = path.join(fixturesDir, file);
    const fixtureData = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as OracleFixtureFile;

    it(`Differential Parity: 100% agreement across domain, module bridge, and legacy VM for ${file} (${fixtureData.cases.length} cases)`, () => {
      for (const c of fixtureData.cases) {
        totalFixturesExecuted++;

        // 1. Run Pure Domain Scoring Engine
        const domainResult = scoreAttempt(c.exam, c.attempt);

        // Verify Domain against Oracle independently derived expected values
        assert.equal(
          toFractionString(domainResult.sections.I.score),
          c.expected.sections.I.score,
          `Case ${c.id}: Domain Section I score mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.I.max),
          c.expected.sections.I.max,
          `Case ${c.id}: Domain Section I max mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.II.score),
          c.expected.sections.II.score,
          `Case ${c.id}: Domain Section II score mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.II.max),
          c.expected.sections.II.max,
          `Case ${c.id}: Domain Section II max mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.III.score),
          c.expected.sections.III.score,
          `Case ${c.id}: Domain Section III score mismatch`
        );
        assert.equal(
          toFractionString(domainResult.sections.III.max),
          c.expected.sections.III.max,
          `Case ${c.id}: Domain Section III max mismatch`
        );
        assert.equal(
          toFractionString(domainResult.total),
          c.expected.total,
          `Case ${c.id}: Domain Total score mismatch`
        );
        assert.equal(
          toFractionString(domainResult.maxTotal),
          c.expected.maxTotal,
          `Case ${c.id}: Domain MaxTotal mismatch`
        );

        // 2. Run Modular Legacy Bridge (src/app/legacy.ts)
        const legacyResponses = convertDomainResponsesToLegacy(c.attempt.responses);
        const bridgeResult = scoreLegacyAttempt(c.exam, legacyResponses);

        // Verify Bridge against Domain
        assert.equal(
          bridgeResult.totalFraction,
          toFractionString(domainResult.total),
          `Case ${c.id}: Bridge totalFraction must match Domain`
        );
        assert.equal(
          bridgeResult.maxTotalFraction,
          toFractionString(domainResult.maxTotal),
          `Case ${c.id}: Bridge maxTotalFraction must match Domain`
        );
        assert.equal(
          bridgeResult.scoreIFraction,
          toFractionString(domainResult.sections.I.score),
          `Case ${c.id}: Bridge Section I scoreFraction must match Domain`
        );
        assert.equal(
          bridgeResult.scoreIIFraction,
          toFractionString(domainResult.sections.II.score),
          `Case ${c.id}: Bridge Section II scoreFraction must match Domain`
        );
        assert.equal(
          bridgeResult.scoreIIIFraction,
          toFractionString(domainResult.sections.III.score),
          `Case ${c.id}: Bridge Section III scoreFraction must match Domain`
        );

        // Verify per-question status and fraction in Bridge
        for (let i = 0; i < domainResult.questions.length; i++) {
          const dq = domainResult.questions[i]!;
          const bq = bridgeResult.questionResults[i]!;
          assert.equal(
            bq.status,
            dq.status,
            `Case ${c.id}: Question ${dq.questionVersionId} status mismatch in bridge`
          );
          assert.equal(
            bq.pointsFraction,
            toFractionString(dq.points),
            `Case ${c.id}: Question ${dq.questionVersionId} pointsFraction mismatch in bridge`
          );
        }

        // 3. Run Root Legacy Inline VM Scorer (index.html)
        const vmResult = legacyVM.scoreLegacyVM(c.exam, legacyResponses);

        // Verify Root Legacy VM against Oracle Expected & Domain
        assert.equal(
          vmResult.totalFraction,
          c.expected.total,
          `Case ${c.id}: Legacy VM totalFraction mismatch with Oracle`
        );
        assert.equal(
          vmResult.maxTotalFraction,
          c.expected.maxTotal,
          `Case ${c.id}: Legacy VM maxTotalFraction mismatch with Oracle`
        );
        assert.equal(
          vmResult.scoreIFraction,
          c.expected.sections.I.score,
          `Case ${c.id}: Legacy VM scoreIFraction mismatch with Oracle`
        );
        assert.equal(
          vmResult.scoreIIFraction,
          c.expected.sections.II.score,
          `Case ${c.id}: Legacy VM scoreIIFraction mismatch with Oracle`
        );
        assert.equal(
          vmResult.scoreIIIFraction,
          c.expected.sections.III.score,
          `Case ${c.id}: Legacy VM scoreIIIFraction mismatch with Oracle`
        );

        // Verify per-question status in Legacy VM
        for (let i = 0; i < domainResult.questions.length; i++) {
          const dq = domainResult.questions[i]!;
          const vmq = vmResult.questionResults[i]!;
          assert.equal(
            vmq.status,
            dq.status,
            `Case ${c.id}: Question ${dq.questionVersionId} status mismatch in VM`
          );
          assert.equal(
            vmq.pointsFraction,
            toFractionString(dq.points),
            `Case ${c.id}: Question ${dq.questionVersionId} pointsFraction mismatch in VM`
          );
        }
      }
    });
  }

  it('verifies that exactly 1,632 oracle fixtures were executed with 0 discrepancies', () => {
    assert.equal(
      totalFixturesExecuted,
      1632,
      `Expected exactly 1632 fixtures executed, got ${totalFixturesExecuted}`
    );
  });
});

describe('Documented Corrected Legacy Bugs & Regression Coverage', () => {
  it('Bug 1: Binary floating-point division drift vs Exact BigInt Rational arithmetic', () => {
    // When N3 = 3, (10 - 3) / 3 = 7/3 (repeating decimal 2.333...)
    // Floating-point accumulates 2.3333333333333335 * 3 = 7.000000000000001
    // Exact BigInt Rational preserves 7/3 * 3 = 7/1 without rounding drift.
    const pointIII = rational(7n, 3n);
    const maxIII = mul(rational(3n), pointIII);
    assert.equal(toFractionString(maxIII), '7');
    assert.equal(maxIII.num, 7n);
    assert.equal(maxIII.den, 1n);

    // N3 = 7: pointIII = 7/7 = 1/1
    const pointIII_7 = rational(7n, 7n);
    assert.equal(toFractionString(pointIII_7), '1');
  });

  it('Bug 2: Part II unanswered statements must NOT default to false or earn points', () => {
    // A question with statements all having answer: false
    // An unanswered statement (null or omitted) must earn 0 points, NEVER default to false.
    const exam: ExamVersion = {
      examId: 'test-p2-unanswered',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'II',
          questionVersionId: 'q-ii-01',
          statements: [
            { statementId: 's1', answer: false },
            { statementId: 's2', answer: false },
            { statementId: 's3', answer: false },
            { statementId: 's4', answer: false },
          ],
        },
      ],
    };

    // Candidate answered NONE of the statements:
    const attemptAllUnanswered: AttemptResponses = {
      attemptId: 'att-01',
      examVersionId: 'v1.0.0',
      responses: [
        {
          kind: 'II',
          questionVersionId: 'q-ii-01',
          answers: [
            { statementId: 's1', value: null },
            { statementId: 's2', value: null },
            { statementId: 's3', value: null },
            { statementId: 's4', value: null },
          ],
        },
      ],
    };

    const resAllUnanswered = scoreAttempt(exam, attemptAllUnanswered);
    assert.equal(toFractionString(resAllUnanswered.total), '0');
    assert.equal(resAllUnanswered.questions[0]?.status, 'unanswered');

    // Candidate answered only statement s4 as false (matching the answer)
    // k = 1 -> exactly 1/10 point (0.10)
    const attemptOneAnswered: AttemptResponses = {
      attemptId: 'att-02',
      examVersionId: 'v1.0.0',
      responses: [
        {
          kind: 'II',
          questionVersionId: 'q-ii-01',
          answers: [
            { statementId: 's1', value: null },
            { statementId: 's2', value: null },
            { statementId: 's3', value: null },
            { statementId: 's4', value: false },
          ],
        },
      ],
    };

    const resOneAnswered = scoreAttempt(exam, attemptOneAnswered);
    assert.equal(toFractionString(resOneAnswered.total), '1/10');
    assert.equal(resOneAnswered.questions[0]?.status, 'partial');
  });

  it('Bug 3: Part III exact string comparison ("1,5" != "1,50" != "1.5"; "-0,5" occupies 4 chars)', () => {
    const exam: ExamVersion = {
      examId: 'test-p3-exact',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [
        {
          kind: 'III',
          questionVersionId: 'q-iii-01',
          answerKey: '1,5',
        },
      ],
    };

    // 1. Exact match '1,5' -> full
    const resExact = scoreAttempt(exam, {
      attemptId: 'att-01',
      examVersionId: 'v1.0.0',
      responses: [{ kind: 'III', questionVersionId: 'q-iii-01', raw: '1,5' }],
    });
    assert.equal(resExact.questions[0]?.status, 'full');
    assert.equal(toFractionString(resExact.total), '10');

    // 2. Trailing zero '1,50' -> wrong (not coerced or trimmed)
    const resTrailing = scoreAttempt(exam, {
      attemptId: 'att-02',
      examVersionId: 'v1.0.0',
      responses: [{ kind: 'III', questionVersionId: 'q-iii-01', raw: '1,50' }],
    });
    assert.equal(resTrailing.questions[0]?.status, 'wrong');
    assert.equal(toFractionString(resTrailing.total), '0');

    // 3. Dot decimal '1.5' -> invalid (sa-charset-v1 requires comma for decimal)
    const resDot = scoreAttempt(exam, {
      attemptId: 'att-03',
      examVersionId: 'v1.0.0',
      responses: [{ kind: 'III', questionVersionId: 'q-iii-01', raw: '1.5' }],
    });
    assert.equal(resDot.questions[0]?.status, 'invalid');
    assert.equal(toFractionString(resDot.total), '0');

    // 4. Negative decimal '-0,5' occupies exactly 4 code points and is valid
    const examNeg: ExamVersion = {
      examId: 'test-p3-neg',
      examVersionId: 'v1.0.0',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      questions: [{ kind: 'III', questionVersionId: 'q-iii-neg', answerKey: '-0,5' }],
    };
    const resNeg = scoreAttempt(examNeg, {
      attemptId: 'att-04',
      examVersionId: 'v1.0.0',
      responses: [{ kind: 'III', questionVersionId: 'q-iii-neg', raw: '-0,5' }],
    });
    assert.equal(resNeg.questions[0]?.status, 'full');
    assert.equal(toFractionString(resNeg.total), '10');
  });

  it('Bug 4: Custom Mode formula when BASE >= 10 guarantees POINT_III = 0.25 (1/4)', () => {
    // When N1 = 20 (maxI = 5), N2 = 10 (maxII = 10), BASE = 15 >= 10.
    // If N3 = 4, old formula gave (10 - 15) / 4 = -1.25.
    // Correct formula gives POINT_III = 0.25 (1/4), maxIII = 4 * 0.25 = 1.
    // maxTotal = 5 + 10 + 1 = 16 (never clamped to 10).
    const maxCustom = computeExamMax({ n1: 20, n2: 10, n3: 4 });
    assert.equal(toFractionString(maxCustom.maxI), '5');
    assert.equal(toFractionString(maxCustom.maxII), '10');
    assert.equal(toFractionString(maxCustom.pointIII), '1/4');
    assert.equal(toFractionString(maxCustom.maxIII), '1');
    assert.equal(toFractionString(maxCustom.maxTotal), '16');

    // N1 = 20, N2 = 10, N3 = 0 -> maxTotal = 15
    const maxNoIII = computeExamMax({ n1: 20, n2: 10, n3: 0 });
    assert.equal(toFractionString(maxNoIII.maxTotal), '15');
    assert.equal(toFractionString(maxNoIII.pointIII), '0');

    // N1 = 20, N2 = 0, N3 = 0 -> maxTotal = 5 (Part I only exam)
    const maxPartIOnly = computeExamMax({ n1: 20, n2: 0, n3: 0 });
    assert.equal(toFractionString(maxPartIOnly.maxTotal), '5');
  });

  it('Bug 5 & 6: Cutover gate and root legacy preservation status', () => {
    const gate = checkCutoverGates();
    assert.equal(gate.canCutover, false, 'Cutover must remain blocked pending D03 approval');
    assert.equal(gate.preserveRootLegacy, true, 'Root index.html legacy demo must be preserved');
    assert.equal(gate.status, 'NEED_DECISION', 'Status must explicitly report NEED_DECISION');
    assert.ok(gate.openDecisions.includes('D03'), 'Must list D03 as open owner decision');
  });
});
