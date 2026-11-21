import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queryBank,
  saveBankEntry,
  addToDraft,
  createNewVersion,
  validateBankEntry,
} from '../../../src/bank/index.ts';
import {
  exportBankTransferJson,
  parseBankTransfer,
  importBankTransfer,
  deleteBankEntryConfirmed,
  clearAllConfirmed,
  validateTaxonomy,
} from '../../../src/bank/transfer.ts';
import type {
  BankEntry,
  ExamDraft,
  StoragePort,
  Result,
  AttemptKey,
  AttemptRecord,
  OutboxRecord,
} from '../../../src/bank/types.ts';
import { InMemoryStoragePort } from './testStorage.ts';

function createSampleBankEntry(id = 'q-l34-01', version = 'q-l34-01-v1'): BankEntry {
  return {
    questionId: id,
    questionVersionId: version,
    revision: 1,
    taxonomy: {
      subject: 'Vật lí',
      grade: 12,
      topic: 'Sóng cơ và Sóng âm',
      lesson: 'Giao thoa sóng cơ',
      difficulty: 'Thông hiểu',
    },
    question: {
      kind: 'I',
      questionId: id,
      questionVersionId: version,
      title: 'Điều kiện giao thoa sóng',
      content: 'Hai nguồn sóng kết hợp là hai nguồn dao động cùng phương, cùng tần số và có:',
      explanation: 'Hai nguồn kết hợp phải cùng tần số và có hiệu số pha không đổi theo thời gian.',
      options: [
        { optionId: 'opt-a', label: 'A', text: 'Hiệu số pha không đổi theo thời gian' },
        { optionId: 'opt-b', label: 'B', text: 'Cùng biên độ và pha ban đầu' },
        { optionId: 'opt-c', label: 'C', text: 'Cùng năng lượng dao động' },
        { optionId: 'opt-d', label: 'D', text: 'Pha ban đầu luôn bằng 0' },
      ],
      correctOptionId: 'opt-a',
    },
  };
}

function createSampleDraft(draftId = 'draft-l34'): ExamDraft {
  return {
    draftId,
    revision: 1,
    exam: {
      schemaVersion: 'web-exam-v1',
      examId: 'exam-l34',
      examVersionId: 'exam-l34-v1',
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      title: 'Đề kiểm tra Vật lí 12',
      subject: 'Vật lí',
      grade: 12,
      settings: {
        durationMinutes: 50,
        maxAttempts: 1,
        releasePolicy: 'immediate',
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      assets: [],
      questions: [],
    },
  };
}

class FaultyStoragePort extends InMemoryStoragePort {
  private failPuts = false;
  private failGets = false;

  setFailPuts(fail: boolean) {
    this.failPuts = fail;
  }

  setFailGets(fail: boolean) {
    this.failGets = fail;
  }

  override async putObject(
    store: 'bank' | 'exams' | 'imports',
    id: string,
    value: unknown,
    expectedRevision: number | null,
  ): Promise<Result<number>> {
    if (this.failPuts) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_QUOTA',
          path: `store.${store}.${id}`,
          message: 'Dung lượng lưu trữ IndexedDB/StoragePort đã bị đầy (QuotaExceededError)',
          recoverable: false,
        },
      };
    }
    return super.putObject(store, id, value, expectedRevision);
  }

  override async getObject(store: 'bank' | 'exams' | 'imports', id: string): Promise<Result<unknown | null>> {
    if (this.failGets) {
      return {
        ok: false,
        error: {
          code: 'STORAGE_UNAVAILABLE',
          path: `store.${store}.${id}`,
          message: 'Không thể kết nối kho dữ liệu',
          recoverable: false,
        },
      };
    }
    return super.getObject(store, id);
  }
}

test('l34BankHardening: full-text search with complex Vietnamese diacritics and symbols across all question parts', () => {
  const e1 = createSampleBankEntry('q-01', 'v-01');
  const e2: BankEntry = {
    questionId: 'q-02',
    questionVersionId: 'v-02',
    revision: 1,
    taxonomy: {
      subject: 'Hóa học',
      grade: 12,
      topic: 'Este - Lipit',
      lesson: 'Chất béo và xà phòng',
      difficulty: 'Vận dụng',
    },
    question: {
      kind: 'II',
      questionId: 'q-02',
      questionVersionId: 'v-02',
      title: 'Phản ứng xà phòng hóa',
      content: 'Đun nóng tristearin $(C_{17}H_{35}COO)_3C_3H_5$ với dung dịch $NaOH$ vừa đủ.',
      statements: [
        { statementId: 'st-1', label: 'a', text: 'Thu được glixerol và muối natri stearat', answer: true },
        { statementId: 'st-2', label: 'b', text: 'Đây là phản ứng thuận nghịch hai chiều', answer: false, explanation: 'Xà phòng hóa là phản ứng một chiều hoàn toàn' },
        { statementId: 'st-3', label: 'c', text: 'Sản phẩm có thể dùng làm xà phòng', answer: true },
        { statementId: 'st-4', label: 'd', text: 'Tristearin là chất béo lỏng ở điều kiện thường', answer: false, explanation: 'Tristearin no nên là chất béo rắn' },
      ],
    },
  };
  const e3: BankEntry = {
    questionId: 'q-03',
    questionVersionId: 'v-03',
    revision: 1,
    taxonomy: {
      subject: 'Toán học',
      grade: 12,
      topic: 'Số phức',
      lesson: 'Các phép toán số phức',
      difficulty: 'Nhận biết',
    },
    question: {
      kind: 'III',
      questionId: 'q-03',
      questionVersionId: 'v-03',
      title: 'Môđun số phức',
      content: 'Cho số phức $z = 3 - 4i$. Tính $|z|$.',
      explanation: '$|z| = \\sqrt{3^2 + (-4)^2} = 5$.',
      answerKey: '5',
    },
  };

  const pool = [e1, e2, e3];

  // Vietnamese case-insensitive search
  const foundPhysics = queryBank(pool, { text: 'GIAO THOA SÓNG' });
  assert.equal(foundPhysics.length, 1);
  assert.equal(foundPhysics[0]?.questionId, 'q-01');

  // Search inside Part II statement explanation
  const foundChemistry = queryBank(pool, { text: 'một chiều hoàn toàn' });
  assert.equal(foundChemistry.length, 1);
  assert.equal(foundChemistry[0]?.questionId, 'q-02');

  // Search Part III formula / content
  const foundMath = queryBank(pool, { text: 'Môđun' });
  assert.equal(foundMath.length, 1);
  assert.equal(foundMath[0]?.questionId, 'q-03');

  // Search by kind + difficulty simultaneously
  const matched = queryBank(pool, { kind: 'II', difficulty: 'Vận dụng' });
  assert.equal(matched.length, 1);
  assert.equal(matched[0]?.questionId, 'q-02');
});

test('l34BankHardening: successive additions of the same question into ExamDraft remaps IDs uniquely every time without collision', () => {
  let draft = createSampleDraft();
  const entry = createSampleBankEntry();
  let idCounter = 100;
  const idGen = () => `id-${idCounter++}`;

  // First addition: preserves original IDs
  const res1 = addToDraft(draft, entry, idGen);
  assert.ok(res1.ok);
  draft = res1.value;
  assert.equal(draft.exam.questions.length, 1);
  assert.equal(draft.exam.questions[0]?.questionVersionId, entry.questionVersionId);

  // Second addition of identical question: must remap questionVersionId and optionIds
  const res2 = addToDraft(draft, entry, idGen);
  assert.ok(res2.ok);
  draft = res2.value;
  assert.equal(draft.exam.questions.length, 2);
  const q2 = draft.exam.questions[1];
  assert.ok(q2);
  assert.notEqual(q2.questionVersionId, entry.questionVersionId);

  // Third addition of identical question: must also remap uniquely from both q1 and q2
  const res3 = addToDraft(draft, entry, idGen);
  assert.ok(res3.ok);
  draft = res3.value;
  assert.equal(draft.exam.questions.length, 3);
  const q3 = draft.exam.questions[2];
  assert.ok(q3);
  assert.notEqual(q3.questionVersionId, draft.exam.questions[0]?.questionVersionId);
  assert.notEqual(q3.questionVersionId, draft.exam.questions[1]?.questionVersionId);

  // All option IDs across all 3 questions must be completely distinct
  const allOptionIds: string[] = [];
  for (const q of draft.exam.questions) {
    if (q.kind === 'I') {
      for (const opt of q.options) {
        allOptionIds.push(opt.optionId);
      }
    }
  }
  const uniqueOptionIds = new Set(allOptionIds);
  assert.equal(uniqueOptionIds.size, allOptionIds.length);
  assert.equal(allOptionIds.length, 12);
});

test('l34BankHardening: prototype pollution defense across queryBank, addToDraft, and importBankTransfer', async () => {
  const evilEntry: any = {
    ...createSampleBankEntry('__proto__', 'v-proto'),
    constructor: { name: 'exploit' },
  };

  // queryBank does not break or alter Object prototype
  const res = queryBank([evilEntry], { text: '__proto__' });
  assert.equal(res.length, 1);
  assert.equal(({} as any).polluted, undefined);

  // addToDraft does not pollute prototype
  let idSeq = 1;
  const draft = createSampleDraft();
  const draftRes = addToDraft(draft, evilEntry, () => `id-${idSeq++}`);
  assert.ok(draftRes.ok);
  assert.equal(({} as any).polluted, undefined);

  // export / import does not pollute prototype
  const jsonStr = exportBankTransferJson([evilEntry]);
  const storage = new InMemoryStoragePort();
  const importRes = await importBankTransfer(jsonStr, storage);
  assert.ok(importRes.ok);
  assert.equal(({} as any).polluted, undefined);
});

test('l34BankHardening: storage error propagation returns typed WebError on storage failure without throwing', async () => {
  const faulty = new FaultyStoragePort();
  faulty.setFailPuts(true);

  const entry = createSampleBankEntry();
  const saveRes = await saveBankEntry(entry, null, faulty);
  assert.equal(saveRes.ok, false);
  if (!saveRes.ok) {
    assert.equal(saveRes.error.code, 'STORAGE_QUOTA');
  }

  // importBankTransfer records storage errors in summary.errors without failing the whole operation
  const json = exportBankTransferJson([entry]);
  const importRes = await importBankTransfer(json, faulty);
  assert.ok(importRes.ok);
  assert.equal(importRes.value.imported, 0);
  assert.equal(importRes.value.errors.length, 1);
  assert.equal(importRes.value.errors[0]?.error.code, 'STORAGE_QUOTA');

  // deleteBankEntryConfirmed requires confirmed flag
  const unconfirmedDel = await deleteBankEntryConfirmed('v-01', 1, faulty, { confirmed: false });
  assert.equal(unconfirmedDel.ok, false);
  if (!unconfirmedDel.ok) {
    assert.equal(unconfirmedDel.error.code, 'CONFIRMATION_REQUIRED');
  }

  // clearAllConfirmed requires confirmed flag
  const unconfirmedClear = await clearAllConfirmed(faulty, { confirmed: false });
  assert.equal(unconfirmedClear.ok, false);
  if (!unconfirmedClear.ok) {
    assert.equal(unconfirmedClear.error.code, 'CONFIRMATION_REQUIRED');
  }
});

test('l34BankHardening: deep immutability guarantees on queryBank and addToDraft return values', () => {
  const entry = createSampleBankEntry();
  const draft = createSampleDraft();

  let idCount = 1;
  const addRes = addToDraft(draft, entry, () => `gen-${idCount++}`);
  assert.ok(addRes.ok);

  const updatedDraft = addRes.value;
  assert.ok(Object.isFrozen(updatedDraft));
  assert.ok(Object.isFrozen(updatedDraft.exam.questions));
  assert.ok(Object.isFrozen(updatedDraft.exam.questions[0]));

  const queried = queryBank([entry], {});
  assert.ok(Object.isFrozen(queried));
});

test('l34BankHardening: importBankTransfer dedupe strategy "fork_new_version" isolates versions and updates count correctly', async () => {
  const storage = new InMemoryStoragePort();
  const entry = createSampleBankEntry('q-orig', 'v-orig');

  // Initial import
  const p1 = exportBankTransferJson([entry]);
  const r1 = await importBankTransfer(p1, storage, { dedupe: 'skip' });
  assert.ok(r1.ok);
  assert.equal(r1.value.imported, 1);

  // Second import with fork_new_version
  let forkCount = 1;
  const idGen = () => `forked-v-${forkCount++}`;
  const r2 = await importBankTransfer(p1, storage, { dedupe: 'fork_new_version', idGenerator: idGen });
  assert.ok(r2.ok);
  assert.equal(r2.value.forked, 1);
  assert.equal(r2.value.entryIds[0], 'forked-v-1');

  // Verify both versions exist in storage with independent revisions
  const orig = await storage.getObject('bank', 'v-orig');
  assert.ok(orig.ok);
  assert.notEqual(orig.value, null);

  const forked = await storage.getObject('bank', 'forked-v-1');
  assert.ok(forked.ok);
  assert.notEqual(forked.value, null);
  const forkedEntry = forked.value as BankEntry;
  assert.equal(forkedEntry.questionVersionId, 'forked-v-1');
  assert.equal(forkedEntry.questionId, 'q-orig');
});
