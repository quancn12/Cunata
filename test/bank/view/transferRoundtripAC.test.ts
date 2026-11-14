import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exportBankTransfer,
  exportBankTransferJson,
  parseBankTransfer,
  importBankTransfer,
  exportBankViaStorage,
  loadAllBankEntriesFromStorage,
} from '../../../src/bank/transfer.ts';
import type { BankEntry, WebExam, AttemptRecord } from '../../../src/bank/types.ts';
import { InMemoryStoragePort } from '../core/testStorage.ts';

const goldenEntries: readonly BankEntry[] = [
  {
    questionId: 'q-math-01',
    questionVersionId: 'q-math-01-v1',
    revision: 1,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Khảo sát hàm số',
      lesson: 'Cực trị',
      difficulty: 'Thông hiểu',
    },
    question: {
      kind: 'I',
      questionVersionId: 'q-math-01-v1',
      title: 'Điểm cực đại của hàm số',
      content: 'Cho hàm số $y = f(x)$ liên tục trên $\\mathbb{R}$.',
      explanation: 'Dựa vào bảng biến thiên, hàm số đạt cực đại tại $x = 1$.',
      provenance: {
        sourceId: 'de-tham-khao-2025',
        location: 'Trang 2, Câu 12',
        confidence: 0.98,
        flags: ['verified-latex', 'official-ref'],
      },
      blocks: [
        { type: 'text', text: 'Xét bảng biến thiên bên dưới:' },
        { type: 'math', source: 'f\'(x) = 0 \\iff x = 1', format: 'latex', verified: true },
        { type: 'image', assetId: 'bbt-cuc-tri-01', alt: 'Bảng biến thiên cực trị' },
        {
          type: 'table',
          rows: [
            [
              { blocks: [{ type: 'text', text: 'x' }], rowSpan: 1, colSpan: 1 },
              { blocks: [{ type: 'text', text: '-\\infty' }, { type: 'text', text: '1' }, { type: 'text', text: '+\\infty' }], rowSpan: 1, colSpan: 1 },
            ],
          ],
        },
      ],
      options: [
        { optionId: 'opt-a', label: 'A', text: '$x = 1$' },
        { optionId: 'opt-b', label: 'B', text: '$x = -1$' },
        { optionId: 'opt-c', label: 'C', text: '$x = 2$' },
        { optionId: 'opt-d', label: 'D', text: '$x = 0$' },
      ],
      correctOptionId: 'opt-a',
    },
  },
  {
    questionId: 'q-math-02',
    questionVersionId: 'q-math-02-v1',
    revision: 1,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Tích phân',
      lesson: 'Định nghĩa tích phân',
      difficulty: 'Vận dụng',
    },
    question: {
      kind: 'II',
      questionVersionId: 'q-math-02-v1',
      title: 'Các mệnh đề Đúng/Sai về tích phân',
      content: 'Cho các hàm số $f(x)$ và $g(x)$ liên tục trên đoạn $[a; b]$.',
      provenance: {
        sourceId: 'sgk-toan-12-tap-2',
        location: 'Chương 4, Bài 2, tr. 102',
        confidence: 1.0,
        flags: ['sgk-chuan'],
      },
      statements: [
        { statementId: 'st-1', label: 'a', text: '$\\int_a^b f(x)dx = -\\int_b^a f(x)dx$', answer: true, explanation: 'Tính chất đảo cận tích phân' },
        { statementId: 'st-2', label: 'b', text: '$\\int_a^a f(x)dx = 1$', answer: false, explanation: 'Tích phân có hai cận bằng nhau luôn bằng 0' },
        { statementId: 'st-3', label: 'c', text: '$\\int_a^b k f(x)dx = k \\int_a^b f(x)dx$', answer: true, explanation: 'Tính chất nhân với hằng số' },
        { statementId: 'st-4', label: 'd', text: '$\\int_a^b [f(x)g(x)]dx = \\int_a^b f(x)dx \\cdot \\int_a^b g(x)dx$', answer: false, explanation: 'Tích phân của tích không bằng tích các tích phân' },
      ],
    },
  },
  {
    questionId: 'q-phys-01',
    questionVersionId: 'q-phys-01-v1',
    revision: 1,
    taxonomy: {
      subject: 'Vật lí',
      grade: 11,
      topic: 'Dao động',
      lesson: 'Con lắc lò xo',
      difficulty: 'Thông hiểu',
    },
    question: {
      kind: 'III',
      questionVersionId: 'q-phys-01-v1',
      title: 'Tính chu kì con lắc',
      content: 'Một con lắc lò xo có khối lượng $m = 0,1$ kg, độ cứng $k = 100$ N/m. Chu kì $T$ xấp xỉ bằng bao nhiêu (s)?',
      explanation: 'Ta có $T = 2\\pi \\sqrt{m/k} \\approx 0,2$ s.',
      answerKey: '0,2',
      provenance: {
        sourceId: 'de-thi-thu-chuyen-2025',
        location: 'Câu 38',
        confidence: null,
        flags: ['de-chuyen'],
      },
    },
  },
];

function createMockExamSnapshot(): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId: 'exam-immut-01',
    examVersionId: 'exam-immut-01-v1',
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề thi đã phát hành bất biến',
    subject: 'Toán học',
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: 1,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    assets: [],
    questions: [goldenEntries[0]!.question],
  };
}

function createMockAttemptRecord(examSnapshot: WebExam, phase: 'draft' | 'final'): AttemptRecord {
  return {
    schemaVersion: 'web-attempt-v1',
    examId: examSnapshot.examId,
    examVersionId: examSnapshot.examVersionId,
    attemptId: `att-${phase}-test-01`,
    revision: 1,
    candidateName: 'Nguyễn Văn A',
    examSnapshot,
    presentationOrder: {
      seed: 'seed-test-123',
      questionOrder: [examSnapshot.questions[0]!.questionVersionId],
      optionOrder: [],
    },
    responses: {
      attemptId: `att-${phase}-test-01`,
      examVersionId: examSnapshot.examVersionId,
      responses: [
        { kind: 'I', questionVersionId: examSnapshot.questions[0]!.questionVersionId, selectedOptionId: 'opt-a' },
      ],
    },
    startedAt: 1700000000000,
    deadline: 1700003000000,
    phase,
    submittedAt: phase === 'final' ? 1700001500000 : null,
    scoreDTO: phase === 'final' ? { totalScore: '1/4', maxScore: '1/4' } : null,
  };
}

test('AC Roundtrip: all content, options, statements, keys, math, tables, images, taxonomy, and provenance survive transfer', async () => {
  // 1. Export entries to JSON and Blob
  const jsonStr = exportBankTransferJson(goldenEntries, {
    title: 'Ngân hàng mẫu chuẩn',
    description: 'Chứa đủ 3 phần I, II, III',
  });
  const blob = exportBankTransfer(goldenEntries);

  assert.ok(jsonStr.includes('cunata-bank-transfer-v1'));
  assert.equal(blob.type, 'application/json');

  // 2. Parse transfer payload from both string and Blob text
  const parseRes1 = parseBankTransfer(jsonStr);
  assert.ok(parseRes1.ok);
  assert.equal(parseRes1.value.count, 3);
  assert.equal(parseRes1.value.entries.length, 3);

  const blobText = await blob.text();
  const parseRes2 = parseBankTransfer(blobText);
  assert.ok(parseRes2.ok);

  // 3. Import into fresh StoragePort
  const storage = new InMemoryStoragePort();
  const importSummaryRes = await importBankTransfer(parseRes2.value, storage, { dedupe: 'skip' });

  assert.ok(importSummaryRes.ok);
  assert.equal(importSummaryRes.value.totalInPayload, 3);
  assert.equal(importSummaryRes.value.imported, 3);
  assert.equal(importSummaryRes.value.skipped, 0);
  assert.equal(importSummaryRes.value.errors.length, 0);

  // 4. Verify each imported entry matches original golden entry exactly
  const loadedAllRes = await loadAllBankEntriesFromStorage(storage);
  assert.ok(loadedAllRes.ok);
  assert.equal(loadedAllRes.value.length, 3);

  for (const golden of goldenEntries) {
    const loaded = loadedAllRes.value.find((e) => e.questionVersionId === golden.questionVersionId);
    assert.ok(loaded, `Entry ${golden.questionVersionId} must be present in storage`);

    // Verify Taxonomy
    assert.deepEqual(loaded.taxonomy, golden.taxonomy);

    // Verify Question kind & identity
    assert.equal(loaded.question.kind, golden.question.kind);
    assert.equal(loaded.question.questionVersionId, golden.question.questionVersionId);
    assert.equal(loaded.question.title, golden.question.title);
    assert.equal(loaded.question.content, golden.question.content);

    // Verify Provenance
    assert.deepEqual(loaded.question.provenance, golden.question.provenance);

    // Verify Kind-specific data
    if (golden.question.kind === 'I' && loaded.question.kind === 'I') {
      assert.equal(loaded.question.correctOptionId, golden.question.correctOptionId);
      assert.equal(loaded.question.options.length, 4);
      for (let i = 0; i < 4; i++) {
        assert.deepEqual(loaded.question.options[i], golden.question.options[i]);
      }
      // Verify blocks
      assert.deepEqual(loaded.question.blocks, golden.question.blocks);
    } else if (golden.question.kind === 'II' && loaded.question.kind === 'II') {
      assert.equal(loaded.question.statements.length, 4);
      for (let i = 0; i < 4; i++) {
        assert.deepEqual(loaded.question.statements[i], golden.question.statements[i]);
      }
    } else if (golden.question.kind === 'III' && loaded.question.kind === 'III') {
      assert.equal(loaded.question.answerKey, golden.question.answerKey);
      assert.equal(loaded.question.explanation, golden.question.explanation);
    }
  }

  // 5. Test exportBankViaStorage roundtrip
  const exportedBlobRes = await exportBankViaStorage(storage);
  assert.ok(exportedBlobRes.ok);
  const reParsed = parseBankTransfer(await exportedBlobRes.value.text());
  assert.ok(reParsed.ok);
  assert.equal(reParsed.value.count, 3);
});

test('AC Dedupe: strategy "skip" preserves existing and does not overwrite', async () => {
  const storage = new InMemoryStoragePort();

  // Initial import
  const res1 = await importBankTransfer(exportBankTransferJson(goldenEntries), storage);
  assert.ok(res1.ok);
  assert.equal(res1.value.imported, 3);
  assert.equal(res1.value.skipped, 0);

  // Second import with strategy "skip"
  const res2 = await importBankTransfer(exportBankTransferJson(goldenEntries), storage, { dedupe: 'skip' });
  assert.ok(res2.ok);
  assert.equal(res2.value.imported, 0);
  assert.equal(res2.value.skipped, 3);
  assert.equal(res2.value.updated, 0);
  assert.equal(res2.value.forked, 0);
});

test('AC Dedupe: strategy "overwrite" updates existing entries with advanced revision', async () => {
  const storage = new InMemoryStoragePort();
  await importBankTransfer(exportBankTransferJson(goldenEntries), storage);

  // Modify an entry title in the payload
  const modifiedEntries: BankEntry[] = goldenEntries.map((e) => {
    if (e.questionId === 'q-math-01') {
      return {
        ...e,
        question: {
          ...e.question,
          title: 'Tiêu đề đã được cập nhật qua overwrite',
        },
      };
    }
    return e;
  });

  const res = await importBankTransfer(exportBankTransferJson(modifiedEntries), storage, { dedupe: 'overwrite' });
  assert.ok(res.ok);
  assert.equal(res.value.imported, 0);
  assert.equal(res.value.updated, 3);

  // Verify updated in storage
  const loadedAll = await loadAllBankEntriesFromStorage(storage);
  assert.ok(loadedAll.ok);
  const updatedEntry = loadedAll.value.find((e) => e.questionId === 'q-math-01');
  assert.ok(updatedEntry);
  assert.equal(updatedEntry.question.title, 'Tiêu đề đã được cập nhật qua overwrite');
  assert.equal(updatedEntry.revision, 2); // advanced revision
});

test('AC Dedupe: strategy "fork_new_version" creates distinct version IDs', async () => {
  const storage = new InMemoryStoragePort();
  await importBankTransfer(exportBankTransferJson([goldenEntries[0]!]), storage);

  let idCount = 500;
  const idGen = () => `forked-ver-${++idCount}`;

  const res = await importBankTransfer(exportBankTransferJson([goldenEntries[0]!]), storage, {
    dedupe: 'fork_new_version',
    idGenerator: idGen,
  });

  assert.ok(res.ok);
  assert.equal(res.value.imported, 0);
  assert.equal(res.value.forked, 1);
  assert.equal(res.value.entryIds[0], 'forked-ver-501');

  // Both original and forked versions coexist in storage
  const loadedAll = await loadAllBankEntriesFromStorage(storage);
  assert.ok(loadedAll.ok);
  assert.equal(loadedAll.value.length, 2);

  const orig = loadedAll.value.find((e) => e.questionVersionId === 'q-math-01-v1');
  const forked = loadedAll.value.find((e) => e.questionVersionId === 'forked-ver-501');
  assert.ok(orig);
  assert.ok(forked);
  assert.equal(forked.questionId, orig.questionId); // Preserved question identity
});

test('AC Isolation: bank transfer imports/updates NEVER mutate published exams or attempt snapshots', async () => {
  const storage = new InMemoryStoragePort();

  // 1. Publish an exam in storage
  const publishedExam = createMockExamSnapshot();
  await storage.putObject('exams', 'exam-immut-01:v1', publishedExam, null);

  // 2. Create active draft attempt and finalized historical attempt
  const draftAttempt = createMockAttemptRecord(publishedExam, 'draft');
  const finalAttempt = createMockAttemptRecord(publishedExam, 'final');
  await storage.create(draftAttempt);
  await storage.create(finalAttempt);

  // 3. Import bank entries modifying the same question
  const alteredEntries: BankEntry[] = [
    {
      ...goldenEntries[0]!,
      question: {
        ...goldenEntries[0]!.question,
        title: 'Tiêu đề câu hỏi trong ngân hàng đã bị sửa đổi!',
        content: 'Nội dung bị sửa hoàn toàn.',
      },
    },
  ];

  await importBankTransfer(exportBankTransferJson(alteredEntries), storage, { dedupe: 'overwrite' });

  // 4. Verify published exam in storage has NOT been modified
  const examCheck = await storage.getObject('exams', 'exam-immut-01:v1');
  assert.ok(examCheck.ok);
  const examInStore = examCheck.value as WebExam;
  assert.equal(examInStore.questions[0]!.title, 'Điểm cực đại của hàm số');
  assert.equal(examInStore.questions[0]!.content, 'Cho hàm số $y = f(x)$ liên tục trên $\\mathbb{R}$.');

  // 5. Verify draft attempt snapshot has NOT been modified
  const draftCheck = await storage.load({
    examId: draftAttempt.examId,
    examVersionId: draftAttempt.examVersionId,
    attemptId: draftAttempt.attemptId,
  });
  assert.ok(draftCheck.ok);
  assert.equal(draftCheck.value?.examSnapshot.questions[0]!.title, 'Điểm cực đại của hàm số');

  // 6. Verify final attempt snapshot has NOT been modified
  const finalCheck = await storage.load({
    examId: finalAttempt.examId,
    examVersionId: finalAttempt.examVersionId,
    attemptId: finalAttempt.attemptId,
  });
  assert.ok(finalCheck.ok);
  assert.equal(finalCheck.value?.examSnapshot.questions[0]!.title, 'Điểm cực đại của hàm số');
  assert.deepEqual(finalCheck.value?.scoreDTO, { totalScore: '1/4', maxScore: '1/4' });
});

test('AC Empty Lists: handles empty transfer payload gracefully', async () => {
  const jsonStr = exportBankTransferJson([]);
  const parsed = parseBankTransfer(jsonStr);

  assert.ok(parsed.ok);
  assert.equal(parsed.value.count, 0);
  assert.equal(parsed.value.entries.length, 0);

  const storage = new InMemoryStoragePort();
  const summary = await importBankTransfer(parsed.value, storage);
  assert.ok(summary.ok);
  assert.equal(summary.value.totalInPayload, 0);
  assert.equal(summary.value.imported, 0);
  assert.equal(summary.value.errors.length, 0);
});

test('AC Special IDs: safely transfers entries with prototype names, colons, slashes, and Unicode', async () => {
  const specialEntries: readonly BankEntry[] = [
    {
      questionId: 'cunata:special:id/1',
      questionVersionId: 'cunata:special:ver/1',
      revision: 1,
      taxonomy: {
        subject: 'Toán học',
        grade: 12,
        topic: 'Đặc thù',
        lesson: 'Bài đặc biệt',
        difficulty: 'Nhận biết',
      },
      question: {
        kind: 'I',
        questionVersionId: 'cunata:special:ver/1',
        title: 'Câu hỏi có ID đặc biệt: cunata:special/1',
        options: [
          { optionId: '__proto__', label: 'A', text: 'Option __proto__' },
          { optionId: 'constructor', label: 'B', text: 'Option constructor' },
          { optionId: 'valueOf', label: 'C', text: 'Option valueOf' },
          { optionId: 'toString', label: 'D', text: 'Option toString' },
        ],
        correctOptionId: 'toString',
      },
    },
    {
      questionId: 'q-unicode-tiếng-việt-có-dấu',
      questionVersionId: 'q-unicode-v1-phiên-bản-1',
      revision: 1,
      taxonomy: {
        subject: 'Hóa học',
        grade: 10,
        topic: 'Nguyên tử & Phân tử',
        lesson: 'Liên kết hóa học',
        difficulty: 'Thông hiểu',
      },
      question: {
        kind: 'III',
        questionVersionId: 'q-unicode-v1-phiên-bản-1',
        title: 'Ký tự Unicode: đ, ê, ơ, ư, ă, â, á, à, ả, ã, ạ',
        answerKey: '-0,5',
      },
    },
  ];

  const storage = new InMemoryStoragePort();
  const jsonStr = exportBankTransferJson(specialEntries);
  const importRes = await importBankTransfer(jsonStr, storage);

  assert.ok(importRes.ok);
  assert.equal(importRes.value.imported, 2);

  const loadedRes = await loadAllBankEntriesFromStorage(storage);
  assert.ok(loadedRes.ok);
  assert.equal(loadedRes.value.length, 2);

  const e1 = loadedRes.value.find((e) => e.questionVersionId === 'cunata:special:ver/1');
  assert.ok(e1);
  assert.equal(e1.question.kind, 'I');
  if (e1.question.kind === 'I') {
    assert.equal(e1.question.correctOptionId, 'toString');
    assert.equal(e1.question.options[0]?.optionId, '__proto__');
  }

  const e2 = loadedRes.value.find((e) => e.questionVersionId === 'q-unicode-v1-phiên-bản-1');
  assert.ok(e2);
  assert.equal(e2.question.kind, 'III');
  if (e2.question.kind === 'III') {
    assert.equal(e2.question.answerKey, '-0,5');
  }
});

test('AC Copy Isolation: mutating local objects does not mutate export payload or storage', async () => {
  const mutableList = JSON.parse(JSON.stringify(goldenEntries)) as BankEntry[];
  const storage = new InMemoryStoragePort();

  await importBankTransfer(exportBankTransferJson(mutableList), storage);

  // Mutate local mutableList
  (mutableList[0]!.question as any).title = 'Tên bị thay đổi ngoài';
  (mutableList[0]!.taxonomy as any).subject = 'Địa lí';

  // Stored entry remains untouched
  const loadedRes = await loadAllBankEntriesFromStorage(storage);
  assert.ok(loadedRes.ok);
  const loaded0 = loadedRes.value.find((e) => e.questionId === 'q-math-01');
  assert.ok(loaded0);
  assert.equal(loaded0.question.title, 'Điểm cực đại của hàm số');
  assert.equal(loaded0.taxonomy.subject, 'Toán học');
});
