import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, renderReportHtml } from '../../src/report/index.ts';
import type { AttemptRecord, WebExam } from '../../src/schema/types.ts';

test('R0-F01 & R0-F03 regression: report retains presentationOrder question order, option order, and displayed option letters', async () => {
  const exam: WebExam = {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-shuffle-1',
    examVersionId: 'v1.0.0',
    title: 'Đề kiểm tra xáo trộn',
    subject: 'Toán',
    grade: 12,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    settings: {
      durationMinutes: 45,
      maxAttempts: 1,
      releasePolicy: 'immediate',
      shuffleQuestions: true,
      shuffleOptions: true,
    },
    assets: [],
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q-orig-1',
        title: 'Câu 1 gốc',
        content: 'Nội dung 1',
        correctOptionId: 'opt-b',
        options: [
          { optionId: 'opt-a', text: 'Phương án A gốc', label: 'A' },
          { optionId: 'opt-b', text: 'Phương án B gốc', label: 'B' },
          { optionId: 'opt-c', text: 'Phương án C gốc', label: 'C' },
          { optionId: 'opt-d', text: 'Phương án D gốc', label: 'D' },
        ],
      },
      {
        kind: 'I',
        questionVersionId: 'q-orig-2',
        title: 'Câu 2 gốc',
        content: 'Nội dung 2',
        correctOptionId: 'opt-2a',
        options: [
          { optionId: 'opt-2a', text: 'Câu 2 PA A', label: 'A' },
          { optionId: 'opt-2b', text: 'Câu 2 PA B', label: 'B' },
          { optionId: 'opt-2c', text: 'Câu 2 PA C', label: 'C' },
          { optionId: 'opt-2d', text: 'Câu 2 PA D', label: 'D' },
        ],
      },
    ],
  };

  // Presentation order where questions are swapped [q-orig-2, q-orig-1]
  // and options of q-orig-1 are shuffled: opt-b is placed at index 0 (so it was displayed as 'A' during exam)
  const presentationOrder = {
    seed: 'seed-123',
    questionOrder: ['q-orig-2', 'q-orig-1'],
    optionOrder: [
      {
        questionVersionId: 'q-orig-1',
        optionIds: ['opt-b', 'opt-d', 'opt-a', 'opt-c'],
      },
    ],
  };

  const finalRecord: AttemptRecord = {
    schemaVersion: 'web-attempt-v1',
    examId: 'exam-shuffle-1',
    examVersionId: 'v1.0.0',
    attemptId: 'att-shuf-1',
    revision: 1,
    candidateName: 'Nguyễn Văn A',
    startedAt: 1700000000000,
    deadline: 1700002700000,
    phase: 'final',
    submittedAt: 1700001000000,
    presentationOrder,
    responses: {
      attemptId: 'att-shuf-1',
      examVersionId: 'v1.0.0',
      responses: [
        { kind: 'I', questionVersionId: 'q-orig-1', selectedOptionId: 'opt-b' },
        { kind: 'I', questionVersionId: 'q-orig-2', selectedOptionId: 'opt-2a' },
      ],
    },
    scoreDTO: null,
    examSnapshot: exam,
  };

  const reportRes = buildReport(finalRecord, 1700001000000);
  assert.equal(reportRes.ok, true, `buildReport failed: ${JSON.stringify((reportRes as any).error)}`);
  if (!reportRes.ok) return;

  const model = reportRes.value;

  // Question order must match presentationOrder: q-orig-2 first, then q-orig-1
  assert.equal(model.questions[0]?.questionVersionId, 'q-orig-2');
  assert.equal(model.questions[1]?.questionVersionId, 'q-orig-1');

  // Both questions must have points and maxPoints
  assert.ok(model.questions[0]?.points);
  assert.ok(model.questions[0]?.maxPoints);
  assert.ok(model.questions[1]?.points);
  assert.ok(model.questions[1]?.maxPoints);

  // Render HTML report
  const html = renderReportHtml(model);

  // F01: opt-b is at position 0, so in report its displayed label must be 'A.', not 'B.'
  assert.match(html, /<div class="review-option"[^>]*data-option-id="opt-b"[^>]*><strong>A\.<\/strong>/);
  // opt-d is at position 1, so in report its displayed label must be 'B.'
  assert.match(html, /<div class="review-option"[^>]*data-option-id="opt-d"[^>]*><strong>B\.<\/strong>/);
});

test('R0-F02 regression: renderReportHtml embeds internal assets as data URIs', async () => {
  const exam: WebExam = {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-img-1',
    examVersionId: 'v1.0.0',
    title: 'Đề có ảnh',
    subject: 'Toán',
    grade: 12,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    settings: {
      durationMinutes: 45,
      maxAttempts: 1,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    assets: [
      {
        assetId: 'q01-bbt.svg',
        mime: 'image/svg+xml',
        data: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
        alt: 'Bảng biến thiên',
      },
    ],
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q-img-1',
        title: 'Câu 1',
        content: 'Cho bảng biến thiên:\n\n![Bảng](q01-bbt.svg)',
        image: 'q01-bbt.svg',
        correctOptionId: 'opt-1a',
        options: [
          { optionId: 'opt-1a', text: 'Đúng' },
          { optionId: 'opt-1b', text: 'Sai' },
          { optionId: 'opt-1c', text: 'Không rõ' },
          { optionId: 'opt-1d', text: 'Khác' },
        ],
      },
    ],
  };

  const finalRecord: AttemptRecord = {
    schemaVersion: 'web-attempt-v1',
    examId: 'exam-img-1',
    examVersionId: 'v1.0.0',
    attemptId: 'att-img-1',
    revision: 1,
    candidateName: 'Học sinh',
    startedAt: 1700000000000,
    deadline: 1700002700000,
    phase: 'final',
    submittedAt: 1700001000000,
    presentationOrder: { seed: 'seed-123', questionOrder: ['q-img-1'], optionOrder: [] },
    responses: {
      attemptId: 'att-img-1',
      examVersionId: 'v1.0.0',
      responses: [
        { kind: 'I', questionVersionId: 'q-img-1', selectedOptionId: 'opt-1a' },
      ],
    },
    scoreDTO: null,
    examSnapshot: exam,
  };

  const reportRes = buildReport(finalRecord, 1700001000000);
  assert.equal(reportRes.ok, true, `buildReport failed: ${JSON.stringify((reportRes as any).error)}`);
  if (!reportRes.ok) return;

  const html = renderReportHtml(reportRes.value);
  assert.match(html, /data:image\/svg\+xml;base64,/);
  assert.equal(html.includes('src="q01-bbt.svg"'), false, 'Should not have raw relative src="q01-bbt.svg"');
});
