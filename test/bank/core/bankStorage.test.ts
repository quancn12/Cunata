import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveBankEntry,
  loadBankEntry,
  deleteBankEntry,
  createNewVersion,
  validateBankEntry,
} from '../../../src/bank/index.ts';
import type { BankEntry } from '../../../src/bank/types.ts';
import { InMemoryStoragePort } from './testStorage.ts';

const validEntryI: BankEntry = {
  questionId: 'q-storage-01',
  questionVersionId: 'q-storage-01-v1',
  revision: 0,
  taxonomy: {
    subject: 'Toán học',
    grade: 12,
    topic: 'Khảo sát hàm số',
    lesson: 'Cực trị của hàm số',
    difficulty: 'Thông hiểu',
  },
  question: {
    kind: 'I',
    questionVersionId: 'q-storage-01-v1',
    title: 'Điểm cực đại của hàm số',
    content: 'Cho hàm số $y = f(x)$ có bảng biến thiên...',
    options: [
      { optionId: 'opt-1', label: 'A', text: '$x = 1$' },
      { optionId: 'opt-2', label: 'B', text: '$x = 2$' },
      { optionId: 'opt-3', label: 'C', text: '$x = 3$' },
      { optionId: 'opt-4', label: 'D', text: '$x = 4$' },
    ],
    correctOptionId: 'opt-2',
  },
};

test('saveBankEntry: inserts new entry when expectedRevision is null', async () => {
  const storage = new InMemoryStoragePort();
  const res = await saveBankEntry(validEntryI, null, storage);

  assert.ok(res.ok);
  assert.equal(res.value.revision, 1);
  assert.equal(res.value.questionVersionId, 'q-storage-01-v1');

  // Verify stored in storage
  const loaded = await loadBankEntry('q-storage-01-v1', storage);
  assert.ok(loaded.ok);
  assert.ok(loaded.value);
  assert.equal(loaded.value.revision, 1);
  assert.equal(loaded.value.question.title, 'Điểm cực đại của hàm số');
});

test('saveBankEntry: updates existing entry when expectedRevision matches current revision', async () => {
  const storage = new InMemoryStoragePort();
  const res1 = await saveBankEntry(validEntryI, null, storage);
  assert.ok(res1.ok);
  assert.equal(res1.value.revision, 1);

  const updatedEntry: BankEntry = {
    ...res1.value,
    question: {
      ...res1.value.question,
      title: 'Điểm cực đại cập nhật',
    },
  };

  const res2 = await saveBankEntry(updatedEntry, 1, storage);
  assert.ok(res2.ok);
  assert.equal(res2.value.revision, 2);

  const loaded = await loadBankEntry('q-storage-01-v1', storage);
  assert.ok(loaded.ok);
  assert.equal(loaded.value?.revision, 2);
  assert.equal(loaded.value?.question.title, 'Điểm cực đại cập nhật');
});

test('saveBankEntry: revision conflict when inserting with null if already exists', async () => {
  const storage = new InMemoryStoragePort();
  await saveBankEntry(validEntryI, null, storage);

  // Attempting to insert again with null revision
  const conflictRes = await saveBankEntry(validEntryI, null, storage);
  assert.equal(conflictRes.ok, false);
  if (!conflictRes.ok) {
    assert.equal(conflictRes.error.code, 'STORAGE_CONFLICT');
  }
});

test('saveBankEntry: revision conflict on stale expectedRevision', async () => {
  const storage = new InMemoryStoragePort();
  const res1 = await saveBankEntry(validEntryI, null, storage);
  assert.ok(res1.ok);

  // Update once -> rev becomes 2
  await saveBankEntry({ ...res1.value }, 1, storage);

  // Stale update using old rev 1 -> conflict
  const staleRes = await saveBankEntry({ ...res1.value }, 1, storage);
  assert.equal(staleRes.ok, false);
  if (!staleRes.ok) {
    assert.equal(staleRes.error.code, 'STORAGE_CONFLICT');
  }
});

test('createNewVersion: edits create new immutable versions preserving questionId', async () => {
  const storage = new InMemoryStoragePort();
  const v1Res = await saveBankEntry(validEntryI, null, storage);
  assert.ok(v1Res.ok);

  // Teacher edits to create v2
  const v2Draft = createNewVersion(v1Res.value, 'q-storage-01-v2', {
    title: 'Điểm cực đại (Phiên bản 2 đã chỉnh sửa)',
  });
  assert.ok(v2Draft.ok);
  assert.equal(v2Draft.value.questionId, 'q-storage-01'); // Preserves question identity
  assert.equal(v2Draft.value.questionVersionId, 'q-storage-01-v2'); // New version identity
  assert.equal(v2Draft.value.revision, 0);

  // Save v2
  const v2Res = await saveBankEntry(v2Draft.value, null, storage);
  assert.ok(v2Res.ok);
  assert.equal(v2Res.value.revision, 1);

  // Both versions coexist independently in storage
  const loadedV1 = await loadBankEntry('q-storage-01-v1', storage);
  const loadedV2 = await loadBankEntry('q-storage-01-v2', storage);

  assert.ok(loadedV1.ok);
  assert.ok(loadedV2.ok);
  assert.equal(loadedV1.value?.questionVersionId, 'q-storage-01-v1');
  assert.equal(loadedV1.value?.question.title, 'Điểm cực đại của hàm số');
  assert.equal(loadedV2.value?.questionVersionId, 'q-storage-01-v2');
  assert.equal(loadedV2.value?.question.title, 'Điểm cực đại (Phiên bản 2 đã chỉnh sửa)');
});

test('validation: rejects invalid BankEntry structures', () => {
  // Empty questionId
  const badId = validateBankEntry({ ...validEntryI, questionId: '  ' });
  assert.equal(badId.ok, false);
  if (!badId.ok) {
    assert.equal(badId.error.code, 'BANK_ENTRY_INVALID');
  }

  // Mismatched versionId
  const mismatchVer = validateBankEntry({
    ...validEntryI,
    questionVersionId: 'v1',
    question: { ...validEntryI.question, questionVersionId: 'v2' },
  });
  assert.equal(mismatchVer.ok, false);
  if (!mismatchVer.ok) {
    assert.equal(mismatchVer.error.code, 'BANK_ENTRY_INVALID');
  }

  // Invalid grade
  const badGrade = validateBankEntry({
    ...validEntryI,
    taxonomy: { ...validEntryI.taxonomy, grade: 9 as any },
  });
  assert.equal(badGrade.ok, false);
  if (!badGrade.ok) {
    assert.equal(badGrade.error.code, 'BANK_ENTRY_INVALID');
  }

  // Invalid difficulty
  const badDiff = validateBankEntry({
    ...validEntryI,
    taxonomy: { ...validEntryI.taxonomy, difficulty: 'Rất khó' as any },
  });
  assert.equal(badDiff.ok, false);

  // Part I: 3 options
  const threeOpts = validateBankEntry({
    ...validEntryI,
    question: {
      ...validEntryI.question,
      options: (validEntryI.question as any).options.slice(0, 3),
    },
  });
  assert.equal(threeOpts.ok, false);

  // Part I: duplicate optionId
  const dupOpt = validateBankEntry({
    ...validEntryI,
    question: {
      ...validEntryI.question,
      options: [
        { optionId: 'opt-dup', text: 'A' },
        { optionId: 'opt-dup', text: 'B' },
        { optionId: 'opt-3', text: 'C' },
        { optionId: 'opt-4', text: 'D' },
      ],
      correctOptionId: 'opt-dup',
    },
  });
  assert.equal(dupOpt.ok, false);

  // Part I: correctOptionId not in options
  const badCorrect = validateBankEntry({
    ...validEntryI,
    question: {
      ...validEntryI.question,
      correctOptionId: 'opt-unknown',
    },
  });
  assert.equal(badCorrect.ok, false);

  // Part II: invalid statement answer (not boolean)
  const badStmt = validateBankEntry({
    ...validEntryI,
    question: {
      kind: 'II',
      questionVersionId: validEntryI.questionVersionId,
      statements: [
        { statementId: 'st-1', answer: true, text: '1' },
        { statementId: 'st-2', answer: 'true' as any, text: '2' },
        { statementId: 'st-3', answer: false, text: '3' },
        { statementId: 'st-4', answer: true, text: '4' },
      ],
    },
  });
  assert.equal(badStmt.ok, false);

  // Part III: invalid answerKey (>4 chars)
  const longKey = validateBankEntry({
    ...validEntryI,
    question: {
      kind: 'III',
      questionVersionId: validEntryI.questionVersionId,
      answerKey: '12345',
    },
  });
  assert.equal(longKey.ok, false);

  // Part III: invalid character in answerKey
  const badCharKey = validateBankEntry({
    ...validEntryI,
    question: {
      kind: 'III',
      questionVersionId: validEntryI.questionVersionId,
      answerKey: '1.5a',
    },
  });
  assert.equal(badCharKey.ok, false);
});

test('own special IDs: handles colons, Unicode, and Object prototype names safely', async () => {
  const storage = new InMemoryStoragePort();
  const specialEntry: BankEntry = {
    questionId: 'cunata:special:id/1',
    questionVersionId: 'cunata:special:id/1:v1',
    revision: 0,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Đặc thù',
      lesson: 'Bài 1',
      difficulty: 'Nhận biết',
    },
    question: {
      kind: 'I',
      questionVersionId: 'cunata:special:id/1:v1',
      title: 'Câu hỏi với ID đặc biệt',
      options: [
        { optionId: '__proto__', label: 'A', text: 'Prototype option' },
        { optionId: 'toString', label: 'B', text: 'toString option' },
        { optionId: 'valueOf', label: 'C', text: 'valueOf option' },
        { optionId: 'constructor', label: 'D', text: 'constructor option' },
      ],
      correctOptionId: 'toString',
    },
  };

  const saveRes = await saveBankEntry(specialEntry, null, storage);
  assert.ok(saveRes.ok);

  const loadRes = await loadBankEntry('cunata:special:id/1:v1', storage);
  assert.ok(loadRes.ok);
  assert.equal(loadRes.value?.question.kind, 'I');
  if (loadRes.value?.question.kind === 'I') {
    assert.equal(loadRes.value.question.correctOptionId, 'toString');
    assert.equal(loadRes.value.question.options[0]?.optionId, '__proto__');
  }
});

test('copy isolation: mutating original object does not mutate saved or loaded bank entries', async () => {
  const storage = new InMemoryStoragePort();
  const mutableEntry = JSON.parse(JSON.stringify(validEntryI));

  const savedRes = await saveBankEntry(mutableEntry, null, storage);
  assert.ok(savedRes.ok);

  // Mutate local object
  mutableEntry.question.title = 'Tên bị thay đổi cục bộ';
  mutableEntry.taxonomy.subject = 'Vật lí';

  // Loaded from storage remains untouched
  const loaded = await loadBankEntry(validEntryI.questionVersionId, storage);
  assert.ok(loaded.ok);
  assert.equal(loaded.value?.question.title, 'Điểm cực đại của hàm số');
  assert.equal(loaded.value?.taxonomy.subject, 'Toán học');
});

test('deleteBankEntry: deletes existing entry with matching revision and rejects stale', async () => {
  const storage = new InMemoryStoragePort();
  const saved = await saveBankEntry(validEntryI, null, storage);
  assert.ok(saved.ok);

  // Delete with stale revision 0 -> conflict
  const staleDel = await deleteBankEntry(validEntryI.questionVersionId, 0, storage);
  assert.equal(staleDel.ok, false);
  if (!staleDel.ok) {
    assert.equal(staleDel.error.code, 'STORAGE_CONFLICT');
  }

  // Delete with actual revision 1 -> ok
  const okDel = await deleteBankEntry(validEntryI.questionVersionId, 1, storage);
  assert.ok(okDel.ok);

  // Now entry is gone
  const loaded = await loadBankEntry(validEntryI.questionVersionId, storage);
  assert.ok(loaded.ok);
  assert.equal(loaded.value, null);
});
