import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateExamVersion, validateAttemptResponses } from '../../src/domain/validate.ts';
import { judgeI, judgeII, judgeIII } from '../../src/domain/judge.ts';
import { checkShortAnswer } from '../../src/domain/shortAnswer.ts';
import type { QuestionI, QuestionII, QuestionIII, ResponseI, ResponseII, ResponseIII } from '../../src/domain/model.ts';

describe('Acceptance & Regression LC04-F05 — Sample Exam (public/sample-exam.json)', () => {
  const samplePath = path.resolve('public/sample-exam.json');
  const rawText = fs.readFileSync(samplePath, 'utf8');
  const exam = JSON.parse(rawText);

  it('validates strictly against validateExamVersion domain schema', () => {
    const res = validateExamVersion(exam);
    assert.equal(res.ok, true, `Validation failed: ${res.ok ? '' : JSON.stringify(res.issues)}`);
  });

  it('LC04-F05 regression: q01 has valid SVG figure file on disk and content reference', () => {
    const q01 = exam.questions.find((q: { questionVersionId: string }) => q.questionVersionId === 'q01-i-ham-so');
    assert.ok(q01, 'q01 must exist');
    assert.ok(q01.image, 'q01 must have image property');
    assert.ok(fs.existsSync(q01.image), `Image file ${q01.image} must exist on disk`);
    const svgContent = fs.readFileSync(q01.image, 'utf8');
    assert.ok(svgContent.includes('<svg') && svgContent.includes('</svg>'), 'Image must be valid SVG');
    assert.ok(q01.content.includes('!['), 'q01 content must include markdown image tag');
    // SVG contains expected markers for domain [-inf; -1] derivative positive '+'
    assert.ok(svgContent.includes('+'), 'BBT SVG must show positive derivative marker');
    assert.ok(svgContent.includes('-1'), 'BBT SVG must show critical point -1');
  });

  it('LC04-F05 regression: q02 options are mathematically distinct without duplicate text', () => {
    const q02 = exam.questions.find((q: { questionVersionId: string }) => q.questionVersionId === 'q02-i-tich-phan');
    assert.ok(q02, 'q02 must exist');
    const texts = q02.options.map((o: { text: string }) => o.text);
    const uniqueTexts = new Set(texts);
    assert.equal(uniqueTexts.size, 4, `All 4 options must be distinct in text, found: ${JSON.stringify(texts)}`);
    // Independent mathematical check: int(f - 2g) = 3 - 2*(2) = -1
    const intF = 3;
    const intG = 2;
    const computedVal = intF - 2 * intG;
    assert.equal(computedVal, -1);
    const correctOpt = q02.options.find((o: { optionId: string }) => o.optionId === q02.correctOptionId);
    assert.equal(correctOpt.text, '$-1$', 'Correct option text for q02 must be $-1$');
  });

  it('verifies mathematical consistency for all other questions independently', () => {
    // q03: 2x - y + 3z - 5 = 0 -> normal vector (2, -1, 3)
    const q03 = exam.questions.find((q: { questionVersionId: string }) => q.questionVersionId === 'q03-i-oxyz');
    assert.ok(q03);
    const q03Correct = q03.options.find((o: { optionId: string }) => o.optionId === q03.correctOptionId);
    assert.ok(q03Correct.text.includes('(2; -1; 3)'));

    // q04: 2 dice rolled, outcomes summing to 7: (1,6),(2,5),(3,4),(4,3),(5,2),(6,1) = 6/36 = 1/6
    const q04 = exam.questions.find((q: { questionVersionId: string }) => q.questionVersionId === 'q04-i-xac-suat');
    assert.ok(q04);
    const q04Correct = q04.options.find((o: { optionId: string }) => o.optionId === q04.correctOptionId);
    assert.ok(q04Correct.text.includes('\\frac{1}{6}'));

    // q05: f(x) = x^3 - 3x + 2
    // f'(x) = 3x^2 - 3, roots +-1. f''(1) = 6 > 0 -> min at x = 1 (st-5a true)
    // f(-1) = (-1)^3 - 3(-1) + 2 = 4 != 2 (st-5b false)
    // f(x) = 0 -> (x-1)^2(x+2) = 0 -> 2 roots (st-5c true)
    // f'(0) = -3 (st-5d true)
    const q05 = exam.questions.find((q: { questionVersionId: string }) => q.questionVersionId === 'q05-ii-khao-sat-ham');
    assert.ok(q05);
    const q05Answers = q05.statements.map((s: { statementId: string; answer: boolean }) => s.answer);
    assert.deepEqual(q05Answers, [true, false, true, true]);

    // q06: A(1, 2, -1), B(3, 0, 1), (P): x + 2y - 2z + 1 = 0
    // Midpoint: (2, 1, 0) != (4, 2, 0) -> st-6a false
    // Length: sqrt(2^2 + (-2)^2 + 2^2) = sqrt(12) = 2*sqrt(3) -> st-6b true
    // Distance A to P: |1 + 4 + 2 + 1|/sqrt(1+4+4) = 8/3 != 3 -> st-6c false
    // Sphere on AB diameter: center (2, 1, 0), R^2 = 3 -> st-6d true
    const q06 = exam.questions.find((q: { questionVersionId: string }) => q.questionVersionId === 'q06-ii-oxyz-mat-cau');
    assert.ok(q06);
    const q06Answers = q06.statements.map((s: { statementId: string; answer: boolean }) => s.answer);
    assert.deepEqual(q06Answers, [false, true, false, true]);

    // q08: a(t) = 3t, v(0) = 0 -> v(t) = 1.5 * t^2. v(1) = 1.5 -> answerKey "1,5"
    const q08 = exam.questions.find((q: { questionVersionId: string }) => q.questionVersionId === 'q08-iii-ung-dung-thuc-te');
    assert.ok(q08);
    const v1 = 1.5 * 1 * 1;
    assert.equal(q08.answerKey, String(v1).replace('.', ','));
  });

  it('LC04-F05 regression: q07 math problem and answerKey strictly match within 4 characters', () => {
    const q07 = exam.questions.find((q: { questionVersionId: string }) => q.questionVersionId === 'q07-iii-gia-tri-nho-nhat');
    assert.ok(q07, 'q07 must exist');

    // Independent content assertion: must specify the exact function and interval in text
    assert.ok(q07.content.includes('f(x) = 2x^2 + 2x'), 'q07 content must state function f(x) = 2x^2 + 2x');
    assert.ok(q07.content.includes('[-1; 1]'), 'q07 content must state interval [-1; 1]');

    // Independent mathematical evaluation:
    // f(x) = 2x^2 + 2x on [-1; 1]
    const f = (x: number) => 2 * x * x + 2 * x;
    const vertex = -2 / (2 * 2); // -0.5
    assert.ok(vertex >= -1 && vertex <= 1, 'Vertex must lie within interval [-1; 1]');
    const values = [f(-1), f(1), f(vertex)]; // [0, 4, -0.5]
    const minVal = Math.min(...values);
    assert.equal(minVal, -0.5, 'Independent math calculation must yield minimum value -0.5');

    // Formatted according to sa-charset-v1 (Vietnamese decimal comma)
    const expectedKey = String(minVal).replace('.', ','); // "-0,5"
    assert.equal(q07.answerKey, expectedKey, 'answerKey must strictly match independent mathematical result "-0,5"');
    assert.ok(q07.answerKey.length <= 4, 'answerKey length must be <= 4 characters');
    const issues = checkShortAnswer(q07.answerKey);
    assert.deepEqual(issues, [], 'answerKey must be completely valid according to sa-charset-v1');
    assert.ok(q07.explanation.includes('-0,5'), 'explanation must explain the -0,5 answer');
  });

  it('simulates full correct student attempt on sample exam', () => {
    const responses: (ResponseI | ResponseII | ResponseIII)[] = [];

    // Part I
    for (const q of exam.questions) {
      if (q.kind === 'I') {
        const qI = q as QuestionI;
        responses.push({
          kind: 'I',
          questionVersionId: qI.questionVersionId,
          selectedOptionId: qI.correctOptionId,
        });
        const judgment = judgeI(qI, {
          kind: 'I',
          questionVersionId: qI.questionVersionId,
          selectedOptionId: qI.correctOptionId,
        });
        assert.equal(judgment, 'correct');
      } else if (q.kind === 'II') {
        const qII = q as QuestionII;
        const answers = qII.statements.map((s) => ({
          statementId: s.statementId,
          value: s.answer,
        }));
        responses.push({
          kind: 'II',
          questionVersionId: qII.questionVersionId,
          answers,
        });
        const judgment = judgeII(qII, {
          kind: 'II',
          questionVersionId: qII.questionVersionId,
          answers,
        });
        assert.equal(judgment.correctCount, 4);
      } else if (q.kind === 'III') {
        const qIII = q as QuestionIII;
        responses.push({
          kind: 'III',
          questionVersionId: qIII.questionVersionId,
          raw: qIII.answerKey,
        });
        const judgment = judgeIII(qIII, {
          kind: 'III',
          questionVersionId: qIII.questionVersionId,
          raw: qIII.answerKey,
        });
        assert.equal(judgment, 'correct');
      }
    }

    const attempt = {
      attemptId: 'attempt-sample-perfect-01',
      examVersionId: exam.examVersionId,
      responses,
    };

    const valAttempt = validateAttemptResponses(exam, attempt);
    assert.equal(valAttempt.ok, true);
  });

  it('simulates all-unanswered student attempt on sample exam', () => {
    const attempt = {
      attemptId: 'attempt-sample-unanswered-01',
      examVersionId: exam.examVersionId,
      responses: [],
    };

    const valAttempt = validateAttemptResponses(exam, attempt);
    assert.equal(valAttempt.ok, true);

    for (const q of exam.questions) {
      if (q.kind === 'I') {
        assert.equal(judgeI(q, undefined), 'unanswered');
      } else if (q.kind === 'II') {
        const j = judgeII(q, undefined);
        assert.equal(j.correctCount, 0);
        assert.ok(j.perStatement.every((s) => s.state === 'unanswered'));
      } else if (q.kind === 'III') {
        assert.equal(judgeIII(q, undefined), 'unanswered');
      }
    }
  });

  it('simulates mixed student attempt on sample exam', () => {
    // 2 correct Part I, 1 wrong, 1 unanswered
    const q01 = exam.questions[0] as QuestionI;
    const q02 = exam.questions[1] as QuestionI;
    const q03 = exam.questions[2] as QuestionI;
    const q04 = exam.questions[3] as QuestionI;

    const wrongOptionQ03 = q03.options.find((o) => o.optionId !== q03.correctOptionId)!.optionId;

    assert.equal(judgeI(q01, { kind: 'I', questionVersionId: q01.questionVersionId, selectedOptionId: q01.correctOptionId }), 'correct');
    assert.equal(judgeI(q02, { kind: 'I', questionVersionId: q02.questionVersionId, selectedOptionId: q02.correctOptionId }), 'correct');
    assert.equal(judgeI(q03, { kind: 'I', questionVersionId: q03.questionVersionId, selectedOptionId: wrongOptionQ03 }), 'wrong');
    assert.equal(judgeI(q04, undefined), 'unanswered');

    // Part II: q05 with 2 correct, 1 wrong, 1 unanswered -> correctCount = 2
    const q05 = exam.questions[4] as QuestionII;
    const stAnswers = [
      { statementId: q05.statements[0]!.statementId, value: q05.statements[0]!.answer }, // correct
      { statementId: q05.statements[1]!.statementId, value: q05.statements[1]!.answer }, // correct
      { statementId: q05.statements[2]!.statementId, value: !q05.statements[2]!.answer }, // wrong
      { statementId: q05.statements[3]!.statementId, value: null }, // unanswered
    ];
    const jII = judgeII(q05, { kind: 'II', questionVersionId: q05.questionVersionId, answers: stAnswers });
    assert.equal(jII.correctCount, 2);
    assert.equal(jII.perStatement[0]!.state, 'correct');
    assert.equal(jII.perStatement[1]!.state, 'correct');
    assert.equal(jII.perStatement[2]!.state, 'wrong');
    assert.equal(jII.perStatement[3]!.state, 'unanswered');

    // Part III: q07 wrong string, q08 correct
    const q07 = exam.questions[6] as QuestionIII;
    const q08 = exam.questions[7] as QuestionIII;
    assert.equal(judgeIII(q07, { kind: 'III', questionVersionId: q07.questionVersionId, raw: '0' }), 'wrong');
    assert.equal(judgeIII(q08, { kind: 'III', questionVersionId: q08.questionVersionId, raw: '1,5' }), 'correct');
  });
});
