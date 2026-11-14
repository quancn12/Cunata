import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBankTransfer,
  importBankTransfer,
  deleteBankEntryConfirmed,
  clearAllConfirmed,
  validateTaxonomy,
} from '../../../src/bank/transfer.ts';
import type { BankEntry } from '../../../src/bank/types.ts';
import { InMemoryStoragePort } from '../core/testStorage.ts';

const validBaseEntry: BankEntry = {
  questionId: 'q-val-01',
  questionVersionId: 'q-val-01-v1',
  revision: 1,
  taxonomy: {
    subject: 'Toán học',
    grade: 12,
    topic: 'Khảo sát hàm số',
    lesson: 'Cực trị',
    difficulty: 'Nhận biết',
  },
  question: {
    kind: 'I',
    questionVersionId: 'q-val-01-v1',
    title: 'Câu hỏi kiểm tra hợp lệ',
    options: [
      { optionId: 'opt-1', label: 'A', text: '1' },
      { optionId: 'opt-2', label: 'B', text: '2' },
      { optionId: 'opt-3', label: 'C', text: '3' },
      { optionId: 'opt-4', label: 'D', text: '4' },
    ],
    correctOptionId: 'opt-1',
  },
};

test('parseBankTransfer: rejects non-JSON and malformed inputs', () => {
  // Malformed JSON string
  const r1 = parseBankTransfer('{ invalid json syntax ');
  assert.equal(r1.ok, false);
  if (!r1.ok) {
    assert.equal(r1.error.code, 'BANK_TRANSFER_INVALID');
  }

  // Null input
  const r2 = parseBankTransfer(null);
  assert.equal(r2.ok, false);
  if (!r2.ok) {
    assert.equal(r2.error.code, 'BANK_TRANSFER_INVALID');
  }

  // Non-object primitive
  const r3 = parseBankTransfer(12345);
  assert.equal(r3.ok, false);
});

test('parseBankTransfer: rejects unsupported schemaVersion', () => {
  const badSchema = {
    schemaVersion: 'cunata-unknown-v99',
    entries: [validBaseEntry],
  };
  const res = parseBankTransfer(badSchema);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'BANK_TRANSFER_INVALID');
    assert.equal(res.error.path, 'schemaVersion');
  }
});

test('parseBankTransfer: rejects non-array entries', () => {
  const badEntries = {
    schemaVersion: 'cunata-bank-transfer-v1',
    entries: 'not an array',
  };
  const res = parseBankTransfer(badEntries);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'BANK_TRANSFER_INVALID');
    assert.equal(res.error.path, 'entries');
  }
});

test('parseBankTransfer: rejects duplicate questionVersionIds in same payload', () => {
  const dupPayload = {
    schemaVersion: 'cunata-bank-transfer-v1',
    entries: [
      validBaseEntry,
      { ...validBaseEntry, questionId: 'q-different' }, // Same questionVersionId!
    ],
  };
  const res = parseBankTransfer(dupPayload);
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'BANK_TRANSFER_INVALID');
    assert.ok(res.error.message.includes('trùng lặp'));
  }
});

test('validateTaxonomy: strict validation of 5-level taxonomy', () => {
  // Empty subject
  const r1 = validateTaxonomy({ subject: '  ', grade: 12, topic: 'T', lesson: 'L', difficulty: 'Nhận biết' });
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.error.code, 'BANK_TAXONOMY_INVALID');

  // Invalid grade (not 10, 11, 12)
  const r2 = validateTaxonomy({ subject: 'Toán', grade: 9, topic: 'T', lesson: 'L', difficulty: 'Nhận biết' });
  assert.equal(r2.ok, false);

  const r3 = validateTaxonomy({ subject: 'Toán', grade: '12', topic: 'T', lesson: 'L', difficulty: 'Nhận biết' });
  assert.equal(r3.ok, false);

  // Empty topic
  const r4 = validateTaxonomy({ subject: 'Toán', grade: 10, topic: '', lesson: 'L', difficulty: 'Thông hiểu' });
  assert.equal(r4.ok, false);

  // Empty lesson
  const r5 = validateTaxonomy({ subject: 'Toán', grade: 11, topic: 'T', lesson: '   ', difficulty: 'Vận dụng' });
  assert.equal(r5.ok, false);

  // Invalid difficulty
  const r6 = validateTaxonomy({ subject: 'Toán', grade: 12, topic: 'T', lesson: 'L', difficulty: 'Rất khó' });
  assert.equal(r6.ok, false);

  // Valid taxonomy
  const r7 = validateTaxonomy({ subject: 'Vật lí', grade: 11, topic: 'Quang học', lesson: 'Lăng kính', difficulty: 'Thông hiểu' });
  assert.ok(r7.ok);
  assert.equal(r7.value.subject, 'Vật lí');
  assert.equal(r7.value.grade, 11);
  assert.equal(r7.value.difficulty, 'Thông hiểu');
});

test('deleteBankEntryConfirmed: requires explicit confirmation and enforces revision matching', async () => {
  const storage = new InMemoryStoragePort();
  const saveRes = await importBankTransfer(
    { schemaVersion: 'cunata-bank-transfer-v1', entries: [validBaseEntry] },
    storage,
  );
  assert.ok(saveRes.ok);

  // Delete without confirmed: false -> rejected
  const unconfirmed = await deleteBankEntryConfirmed(
    validBaseEntry.questionVersionId,
    1,
    storage,
    { confirmed: false },
  );
  assert.equal(unconfirmed.ok, false);
  if (!unconfirmed.ok) {
    assert.equal(unconfirmed.error.code, 'CONFIRMATION_REQUIRED');
  }

  // Delete with stale revision -> conflict
  const staleRes = await deleteBankEntryConfirmed(
    validBaseEntry.questionVersionId,
    99,
    storage,
    { confirmed: true },
  );
  assert.equal(staleRes.ok, false);
  if (!staleRes.ok) {
    assert.equal(staleRes.error.code, 'STORAGE_CONFLICT');
  }

  // Delete with matching revision and confirmed: true -> ok
  const okRes = await deleteBankEntryConfirmed(
    validBaseEntry.questionVersionId,
    1,
    storage,
    { confirmed: true },
  );
  assert.ok(okRes.ok);

  // Verify deleted from storage
  const check = await storage.getObject('bank', validBaseEntry.questionVersionId);
  assert.ok(check.ok);
  assert.equal(check.value, null);
});

test('clearAllConfirmed: requires explicit confirmation before purging all storage records', async () => {
  const storage = new InMemoryStoragePort();
  await importBankTransfer(
    { schemaVersion: 'cunata-bank-transfer-v1', entries: [validBaseEntry] },
    storage,
  );

  // Clear without confirmed -> rejected
  const rejectRes = await clearAllConfirmed(storage, { confirmed: false });
  assert.equal(rejectRes.ok, false);
  if (!rejectRes.ok) {
    assert.equal(rejectRes.error.code, 'CONFIRMATION_REQUIRED');
  }

  // Clear with confirmed: true -> ok
  const okRes = await clearAllConfirmed(storage, { confirmed: true });
  assert.ok(okRes.ok);

  // Storage is completely cleared
  const check = await storage.getObject('bank', validBaseEntry.questionVersionId);
  assert.ok(check.ok);
  assert.equal(check.value, null);
});

test('importBankTransfer: handles unavailable storage gracefully', async () => {
  const badStorage = null as any;
  const res = await importBankTransfer(
    { schemaVersion: 'cunata-bank-transfer-v1', entries: [validBaseEntry] },
    badStorage,
  );
  assert.equal(res.ok, false);
  if (!res.ok) {
    assert.equal(res.error.code, 'STORAGE_UNAVAILABLE');
  }
});
