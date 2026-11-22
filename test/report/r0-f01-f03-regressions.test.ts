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

test('R0-F01 regression: question blocks text and image are preserved in report output', async () => {
  const exam: WebExam = {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-blocks-1',
    examVersionId: 'v1.0.0',
    title: 'Đề có blocks câu hỏi',
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
        assetId: 'public/q01-bbt.svg',
        mime: 'image/svg+xml',
        data: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
        alt: 'Bảng biến thiên',
      },
    ],
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q-block-1',
        title: 'Câu 1',
        content: 'Nội dung fallback',
        image: 'public/q01-bbt.svg',
        blocks: [
          { type: 'text', text: 'BLOCK-CONTENT-REQUIRED: Dữ kiện câu hỏi quan trọng' },
          { type: 'image', assetId: 'public/q01-bbt.svg', alt: 'Hình mô phỏng' },
        ],
        correctOptionId: 'opt-1a',
        options: [
          { optionId: 'opt-1a', text: 'Đúng', label: 'A' },
          { optionId: 'opt-1b', text: 'Sai', label: 'B' },
          { optionId: 'opt-1c', text: 'Khác', label: 'C' },
          { optionId: 'opt-1d', text: 'Chưa rõ', label: 'D' },
        ],
      },
    ],
  };

  const finalRecord: AttemptRecord = {
    schemaVersion: 'web-attempt-v1',
    examId: 'exam-blocks-1',
    examVersionId: 'v1.0.0',
    attemptId: 'att-block-1',
    revision: 1,
    candidateName: 'Học sinh',
    startedAt: 1700000000000,
    deadline: 1700002700000,
    phase: 'final',
    submittedAt: 1700001000000,
    presentationOrder: { seed: 'seed-123', questionOrder: ['q-block-1'], optionOrder: [] },
    responses: {
      attemptId: 'att-block-1',
      examVersionId: 'v1.0.0',
      responses: [
        { kind: 'I', questionVersionId: 'q-block-1', selectedOptionId: 'opt-1a' },
      ],
    },
    scoreDTO: null,
    examSnapshot: exam,
  };

  const reportRes = buildReport(finalRecord, 1700001000000);
  assert.equal(reportRes.ok, true);
  if (!reportRes.ok) return;

  const model = reportRes.value;
  assert.equal(model.questions[0]?.blocks.length, 2);
  const html = renderReportHtml(model);
  assert.match(html, /BLOCK-CONTENT-REQUIRED/);
  assert.match(html, /data:image\/svg\+xml;base64,/);
});

test('R0-F03 regression: cards have section label derived from kind (Phần I, Phần II, Phần III)', async () => {
  const exam: WebExam = {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-sections-1',
    examVersionId: 'v1.0.0',
    title: 'Đề đủ 3 phần không có nhãn phần trong title',
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
    assets: [],
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q-sec-1',
        title: 'Câu 1',
        content: 'Nội dung câu 1',
        correctOptionId: 'opt-1a',
        options: [
          { optionId: 'opt-1a', text: 'Đúng', label: 'A' },
          { optionId: 'opt-1b', text: 'Sai', label: 'B' },
          { optionId: 'opt-1c', text: 'Khác', label: 'C' },
          { optionId: 'opt-1d', text: 'Chưa rõ', label: 'D' },
        ],
      },
      {
        kind: 'II',
        questionVersionId: 'q-sec-2',
        title: 'Câu 2',
        content: 'Nội dung câu 2',
        statements: [
          { statementId: 'st-2a', text: 'Mệnh đề a', answer: true, label: 'a' },
          { statementId: 'st-2b', text: 'Mệnh đề b', answer: false, label: 'b' },
          { statementId: 'st-2c', text: 'Mệnh đề c', answer: true, label: 'c' },
          { statementId: 'st-2d', text: 'Mệnh đề d', answer: false, label: 'd' },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'q-sec-3',
        title: 'Câu 3',
        content: 'Nội dung câu 3',
        answerKey: '3,14',
      },
    ],
  };

  const finalRecord: AttemptRecord = {
    schemaVersion: 'web-attempt-v1',
    examId: 'exam-sections-1',
    examVersionId: 'v1.0.0',
    attemptId: 'att-sec-1',
    revision: 1,
    candidateName: 'Học sinh',
    startedAt: 1700000000000,
    deadline: 1700002700000,
    phase: 'final',
    submittedAt: 1700001000000,
    presentationOrder: { seed: 'seed-123', questionOrder: ['q-sec-1', 'q-sec-2', 'q-sec-3'], optionOrder: [] },
    responses: {
      attemptId: 'att-sec-1',
      examVersionId: 'v1.0.0',
      responses: [
        { kind: 'I', questionVersionId: 'q-sec-1', selectedOptionId: 'opt-1a' },
        {
          kind: 'II',
          questionVersionId: 'q-sec-2',
          answers: [
            { statementId: 'st-2a', value: true },
            { statementId: 'st-2b', value: false },
            { statementId: 'st-2c', value: true },
            { statementId: 'st-2d', value: false },
          ],
        },
        { kind: 'III', questionVersionId: 'q-sec-3', raw: '3,14' },
      ],
    },
    scoreDTO: null,
    examSnapshot: exam,
  };

  const reportRes = buildReport(finalRecord, 1700001000000);
  assert.equal(reportRes.ok, true);
  if (!reportRes.ok) return;

  const html = renderReportHtml(reportRes.value);
  assert.match(html, /Phần I/);
  assert.match(html, /Phần II/);
  assert.match(html, /Phần III/);
});

test('R0-R2-F03 regression: nested table cell images and markdown images in table cells are embedded as data URIs', async () => {
  const exam: WebExam = {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-table-img',
    examVersionId: 'v1.0.0',
    title: 'Đề có bảng chứa ảnh nhúng',
    subject: 'Vật lí',
    grade: 12,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    settings: {
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    assets: [
      {
        assetId: 'public/q01-bbt.svg',
        mime: 'image/svg+xml',
        data: 'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==',
        alt: 'Bảng biến thiên',
      },
    ],
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q-tbl-1',
        title: 'Câu 1',
        content: 'Bảng số liệu bên dưới',
        blocks: [
          {
            type: 'table',
            rows: [
              [
                {
                  rowSpan: 1,
                  colSpan: 1,
                  blocks: [
                    { type: 'text', text: 'Hình trong ô: ![Sơ đồ](public/q01-bbt.svg)' },
                    { type: 'image', assetId: 'public/q01-bbt.svg', alt: 'nested diagram' },
                  ],
                },
              ],
            ],
          },
        ],
        correctOptionId: 'opt-a',
        options: [
          { optionId: 'opt-a', text: 'A', label: 'A' },
          { optionId: 'opt-b', text: 'B', label: 'B' },
          { optionId: 'opt-c', text: 'C', label: 'C' },
          { optionId: 'opt-d', text: 'D', label: 'D' },
        ],
      },
    ],
  };

  const finalRecord: AttemptRecord = {
    schemaVersion: 'web-attempt-v1',
    examId: 'exam-table-img',
    examVersionId: 'v1.0.0',
    attemptId: 'att-tbl-1',
    revision: 1,
    candidateName: 'Học sinh',
    startedAt: 1700000000000,
    deadline: 1700002700000,
    phase: 'final',
    submittedAt: 1700001000000,
    presentationOrder: { seed: 'seed-1', questionOrder: ['q-tbl-1'], optionOrder: [] },
    responses: {
      attemptId: 'att-tbl-1',
      examVersionId: 'v1.0.0',
      responses: [{ kind: 'I', questionVersionId: 'q-tbl-1', selectedOptionId: 'opt-a' }],
    },
    scoreDTO: null,
    examSnapshot: exam,
  };

  const reportRes = buildReport(finalRecord, 1700001000000);
  assert.equal(reportRes.ok, true);
  if (!reportRes.ok) return;

  const html = renderReportHtml(reportRes.value);
  assert.equal(html.includes('src="public/q01-bbt.svg"'), false, 'Should not contain raw relative image path');
  assert.match(html, /data:image\/svg\+xml;base64,PHN2Zy/);
});
