import test from 'node:test';
import assert from 'node:assert/strict';
import { queryBank } from '../../../src/bank/index.ts';
import type { BankEntry } from '../../../src/bank/types.ts';

const sampleEntries: readonly BankEntry[] = [
  {
    questionId: 'q-toan-01',
    questionVersionId: 'q-toan-01-v1',
    revision: 1,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Khảo sát hàm số',
      lesson: 'Sự đồng biến, nghịch biến của hàm số',
      difficulty: 'Nhận biết',
    },
    question: {
      kind: 'I',
      questionVersionId: 'q-toan-01-v1',
      title: 'Hàm số đồng biến trên khoảng nào?',
      content: 'Cho hàm số $y = x^3 - 3x$. Mệnh đề nào sau đây đúng?',
      explanation: 'Đạo hàm $y\' = 3x^2 - 3 > 0$ khi $|x| > 1$.',
      options: [
        { optionId: 'opt-a', label: 'A', text: 'Đồng biến trên $(1; +\\infty)$' },
        { optionId: 'opt-b', label: 'B', text: 'Nghịch biến trên $(1; +\\infty)$' },
        { optionId: 'opt-c', label: 'C', text: 'Đồng biến trên $(-1; 1)$' },
        { optionId: 'opt-d', label: 'D', text: 'Nghịch biến trên $(-\\infty; -1)$' },
      ],
      correctOptionId: 'opt-a',
    },
  },
  {
    questionId: 'q-toan-02',
    questionVersionId: 'q-toan-02-v1',
    revision: 1,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Nguyên hàm & Tích phân',
      lesson: 'Định nghĩa và tính chất của tích phân',
      difficulty: 'Thông hiểu',
    },
    question: {
      kind: 'II',
      questionVersionId: 'q-toan-02-v1',
      title: 'Tính chất tích phân',
      content: 'Cho hàm số $f(x)$ liên tục trên $\\mathbb{R}$ và có nguyên hàm là $F(x)$.',
      statements: [
        { statementId: 'st-a', label: 'a', text: '$\\int f(x)dx = F(x) + C$', answer: true, explanation: 'Định nghĩa nguyên hàm' },
        { statementId: 'st-b', label: 'b', text: '$\\int_a^a f(x)dx = 1$', answer: false, explanation: 'Tích phân cận trùng bằng 0' },
        { statementId: 'st-c', label: 'c', text: '$\\int_a^b f(x)dx = -\\int_b^a f(x)dx$', answer: true, explanation: 'Đổi cận' },
        { statementId: 'st-d', label: 'd', text: '$\\int [f(x) + g(x)]dx = \\int f(x)dx + \\int g(x)dx$', answer: true, explanation: 'Tính chất tuyến tính' },
      ],
    },
  },
  {
    questionId: 'q-toan-03',
    questionVersionId: 'q-toan-03-v1',
    revision: 1,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Khảo sát hàm số',
      lesson: 'Cực trị của hàm số',
      difficulty: 'Vận dụng',
    },
    question: {
      kind: 'III',
      questionVersionId: 'q-toan-03-v1',
      title: 'Tìm giá trị cực tiểu',
      content: 'Cho hàm số $f(x) = x^4 - 2x^2 + 3$. Giá trị cực tiểu bằng bao nhiêu?',
      explanation: 'Điểm cực tiểu $x = \\pm 1$, $f(\\pm 1) = 2$.',
      answerKey: '2',
    },
  },
  {
    questionId: 'q-ly-01',
    questionVersionId: 'q-ly-01-v1',
    revision: 1,
    taxonomy: {
      subject: 'Vật lí',
      grade: 11,
      topic: 'Dao động cơ',
      lesson: 'Dao động điều hòa',
      difficulty: 'Nhận biết',
    },
    question: {
      kind: 'I',
      questionVersionId: 'q-ly-01-v1',
      title: 'Chu kì con lắc lò xo',
      content: 'Công thức tính chu kì con lắc lò xo là gì?',
      options: [
        { optionId: 'opt-l1', label: 'A', text: '$T = 2\\pi \\sqrt{\\frac{m}{k}}$' },
        { optionId: 'opt-l2', label: 'B', text: '$T = 2\\pi \\sqrt{\\frac{k}{m}}$' },
        { optionId: 'opt-l3', label: 'C', text: '$T = \\frac{1}{2\\pi} \\sqrt{\\frac{m}{k}}$' },
        { optionId: 'opt-l4', label: 'D', text: '$T = 2\\pi \\sqrt{\\frac{l}{g}}$' },
      ],
      correctOptionId: 'opt-l1',
    },
  },
  {
    questionId: 'q-hoa-01',
    questionVersionId: 'q-hoa-01-v1',
    revision: 1,
    taxonomy: {
      subject: 'Hóa học',
      grade: 10,
      topic: 'Cấu tạo nguyên tử',
      lesson: 'Hạt nhân nguyên tử',
      difficulty: 'Thông hiểu',
    },
    question: {
      kind: 'III',
      questionVersionId: 'q-hoa-01-v1',
      title: 'Số hạt proton',
      content: 'Nguyên tử sắt Fe có số hiệu nguyên tử $Z = 26$. Số proton trong hạt nhân là:',
      answerKey: '26',
    },
  },
  {
    questionId: 'q-rich-01',
    questionVersionId: 'q-rich-01-v1',
    revision: 1,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Hình học Oxyz',
      lesson: 'Phương trình mặt cầu',
      difficulty: 'Vận dụng',
    },
    question: {
      kind: 'I',
      questionVersionId: 'q-rich-01-v1',
      title: 'Mặt cầu Oxyz với bảng và ảnh',
      content: 'Xét bảng tọa độ các điểm:',
      blocks: [
        { type: 'text', text: 'Bảng số liệu tọa độ trong không gian Oxyz' },
        { type: 'math', source: '(x-1)^2 + (y-2)^2 + (z-3)^2 = 16', format: 'latex', verified: true },
        { type: 'image', assetId: 'img-sphere', alt: 'Hình vẽ minh họa mặt cầu Oxyz' },
        {
          type: 'table',
          rows: [
            [{ blocks: [{ type: 'text', text: 'Tâm I' }], rowSpan: 1, colSpan: 1 }],
          ],
        },
      ],
      options: [
        { optionId: 'opt-r1', label: 'A', text: 'Bán kính R = 4' },
        { optionId: 'opt-r2', label: 'B', text: 'Bán kính R = 16' },
        { optionId: 'opt-r3', label: 'C', text: 'Tâm I(1, 2, 3)' },
        { optionId: 'opt-r4', label: 'D', text: 'Tâm I(-1, -2, -3)' },
      ],
      correctOptionId: 'opt-r1',
    },
  },
];

test('queryBank: returns all entries when filter is empty', () => {
  const result = queryBank(sampleEntries, {});
  assert.equal(result.length, 6);
});

test('queryBank: filters by subject (case-insensitive and trimmed)', () => {
  const math = queryBank(sampleEntries, { subject: 'toán học' });
  assert.equal(math.length, 4);
  assert.ok(math.every(e => e.taxonomy.subject === 'Toán học'));

  const physics = queryBank(sampleEntries, { subject: ' Vật lí ' });
  assert.equal(physics.length, 1);
  assert.equal(physics[0]?.questionId, 'q-ly-01');

  const none = queryBank(sampleEntries, { subject: 'Sinh học' });
  assert.equal(none.length, 0);
});

test('queryBank: filters by grade (10, 11, 12)', () => {
  const grade10 = queryBank(sampleEntries, { grade: 10 });
  assert.equal(grade10.length, 1);
  assert.equal(grade10[0]?.questionId, 'q-hoa-01');

  const grade11 = queryBank(sampleEntries, { grade: 11 });
  assert.equal(grade11.length, 1);
  assert.equal(grade11[0]?.questionId, 'q-ly-01');

  const grade12 = queryBank(sampleEntries, { grade: 12 });
  assert.equal(grade12.length, 4);
});

test('queryBank: filters by topic and lesson', () => {
  const calculus = queryBank(sampleEntries, { topic: 'Khảo sát hàm số' });
  assert.equal(calculus.length, 2);

  const extremes = queryBank(sampleEntries, { lesson: 'Cực trị của hàm số' });
  assert.equal(extremes.length, 1);
  assert.equal(extremes[0]?.questionId, 'q-toan-03');
});

test('queryBank: filters by difficulty', () => {
  const nb = queryBank(sampleEntries, { difficulty: 'Nhận biết' });
  assert.equal(nb.length, 2);

  const th = queryBank(sampleEntries, { difficulty: 'Thông hiểu' });
  assert.equal(th.length, 2);

  const vd = queryBank(sampleEntries, { difficulty: 'Vận dụng' });
  assert.equal(vd.length, 2);
});

test('queryBank: filters by kind (Section I, II, III)', () => {
  const kindI = queryBank(sampleEntries, { kind: 'I' });
  assert.equal(kindI.length, 3);

  const kindII = queryBank(sampleEntries, { kind: 'II' });
  assert.equal(kindII.length, 1);
  assert.equal(kindII[0]?.questionId, 'q-toan-02');

  const kindIII = queryBank(sampleEntries, { kind: 'III' });
  assert.equal(kindIII.length, 2);
});

test('queryBank: full text search matches title, content, explanation, options, and blocks', () => {
  // Title match
  const r1 = queryBank(sampleEntries, { text: 'Chu kì' });
  assert.equal(r1.length, 1);
  assert.equal(r1[0]?.questionId, 'q-ly-01');

  // Option text match
  const r2 = queryBank(sampleEntries, { text: 'Nghịch biến trên' });
  assert.equal(r2.length, 1);
  assert.equal(r2[0]?.questionId, 'q-toan-01');

  // Statement explanation match
  const r3 = queryBank(sampleEntries, { text: 'Đổi cận' });
  assert.equal(r3.length, 1);
  assert.equal(r3[0]?.questionId, 'q-toan-02');

  // Short answer key match
  const r4 = queryBank(sampleEntries, { text: '26' });
  assert.equal(r4.length, 1);
  assert.equal(r4[0]?.questionId, 'q-hoa-01');

  // Block math source match
  const r5 = queryBank(sampleEntries, { text: '(x-1)^2' });
  assert.equal(r5.length, 1);
  assert.equal(r5[0]?.questionId, 'q-rich-01');

  // Block image alt match
  const r6 = queryBank(sampleEntries, { text: 'mặt cầu Oxyz' });
  assert.equal(r6.length, 1);
  assert.equal(r6[0]?.questionId, 'q-rich-01');
});

test('queryBank: multi-criteria AND filtering', () => {
  const matched = queryBank(sampleEntries, {
    subject: 'Toán học',
    grade: 12,
    topic: 'Khảo sát hàm số',
    difficulty: 'Nhận biết',
    kind: 'I',
    text: 'đồng biến',
  });
  assert.equal(matched.length, 1);
  assert.equal(matched[0]?.questionId, 'q-toan-01');

  // If one condition mismatches, result is empty
  const mismatched = queryBank(sampleEntries, {
    subject: 'Toán học',
    grade: 11, // sample is grade 12
    topic: 'Khảo sát hàm số',
  });
  assert.equal(mismatched.length, 0);
});

test('queryBank: handles "all", empty strings, and whitespace in filters', () => {
  const res = queryBank(sampleEntries, {
    subject: 'all',
    topic: '   ',
    difficulty: 'all' as any,
    kind: 'all' as any,
  });
  assert.equal(res.length, 6);
});

test('queryBank: preserves immutability of input entries and return array', () => {
  const originalCount = sampleEntries.length;
  const result = queryBank(sampleEntries, { subject: 'Toán học' });

  assert.equal(sampleEntries.length, originalCount);
  assert.ok(Object.isFrozen(result));

  // Modifying returned array in strict mode throws
  assert.throws(() => {
    (result as any).push({} as any);
  });
});
