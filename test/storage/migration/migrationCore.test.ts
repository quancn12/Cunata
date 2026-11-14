import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateLegacyStorage,
  buildDraftKey,
  buildFinalKey,
  buildSnapshotKey,
  mapLegacyResponsesToDomain,
  type StorageLike,
} from '../../../src/storage/migrate.ts';
import {
  MemoryTransactionAdapter,
  createStoragePort,
} from '../../../src/storage/index.ts';
import type { WebExam } from '../../../src/schema/index.ts';
import { toFractionString, parseFractionString } from '../../../src/domain/index.ts';

class MockLocalStorage implements StorageLike {
  private items = new Map<string, string>();

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.items.keys());
    return keys[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
  }
}

function createTestExam(examId = 'exam-toan-01', examVersionId = 'v1.0.0'): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId,
    examVersionId,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề kiểm tra Toán 12',
    subject: 'Toán học',
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: null,
      releasePolicy: 'immediate',
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    questions: [
      {
        kind: 'I',
        questionVersionId: 'q1-v1',
        title: 'Câu 1',
        options: [
          { optionId: 'opt-1a', text: 'Phương án A' },
          { optionId: 'opt-1b', text: 'Phương án B' },
          { optionId: 'opt-1c', text: 'Phương án C' },
          { optionId: 'opt-1d', text: 'Phương án D' },
        ],
        correctOptionId: 'opt-1a',
      },
      {
        kind: 'I',
        questionVersionId: 'q2-v1',
        title: 'Câu 2',
        options: [
          { optionId: 'opt-2a', text: 'Phương án A' },
          { optionId: 'opt-2b', text: 'Phương án B' },
          { optionId: 'opt-2c', text: 'Phương án C' },
          { optionId: 'opt-2d', text: 'Phương án D' },
        ],
        correctOptionId: 'opt-2b',
      },
      {
        kind: 'II',
        questionVersionId: 'q3-v1',
        title: 'Câu 3',
        statements: [
          { statementId: 'st-3a', text: 'Mệnh đề a', answer: true },
          { statementId: 'st-3b', text: 'Mệnh đề b', answer: false },
          { statementId: 'st-3c', text: 'Mệnh đề c', answer: true },
          { statementId: 'st-3d', text: 'Mệnh đề d', answer: true },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'q4-v1',
        title: 'Câu 4',
        answerKey: '-0,5',
      },
    ],
    assets: [],
  };
}

describe('Migration — Core migration, preservation, recompute & quarantine', () => {
  it('AC: never auto-activates without explicit D03 approval', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();

    // Calling without approvedD03 or approvedD03 = false
    const res = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: false,
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.error.code, 'D03_NOT_APPROVED');
      assert.equal(res.error.path, 'approvedD03');
    }

    // Verify 0 mutations occurred in storage
    const attempts = await storage.listAttempts('exam-toan-01', 'v1.0.0');
    assert.ok(attempts.ok);
    assert.equal(attempts.value.length, 0);
  });

  it('AC: retains source in localStorage and never destroys it during rollback', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();
    const exam = createTestExam();

    const snapshotKey = buildSnapshotKey(exam.examId, exam.examVersionId);
    ls.setItem(snapshotKey, JSON.stringify(exam));

    const draftKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-draft-01');
    const legacyDraftData = {
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: 'att-draft-01',
      candidateName: 'Nguyễn Văn A',
      startedAt: 1700000000000,
      deadline: 1700003000000,
      responses: {
        'q1-v1': 'opt-1a',
      },
      submitted: false,
    };
    ls.setItem(draftKey, JSON.stringify(legacyDraftData));

    const finalKey = buildFinalKey(exam.examId, exam.examVersionId, 'att-final-01');
    const legacyFinalData = {
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: 'att-final-01',
      candidateName: 'Trần Thị B',
      startedAt: 1700000000000,
      deadline: 1700003000000,
      submittedAt: 1700002500000,
      responses: {
        'q1-v1': 'opt-1a',
      },
      submitted: true,
      scoreResult: { total: 9.99 }, // fake number to test recomputation
    };
    ls.setItem(finalKey, JSON.stringify(legacyFinalData));

    // Execute migration with D03 approved
    const migRes = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });

    assert.ok(migRes.ok);
    assert.equal(migRes.value.migratedAttempts, 2);

    // CRITICAL AC: verify all source keys in localStorage remain 100% intact!
    assert.equal(ls.getItem(snapshotKey), JSON.stringify(exam));
    assert.equal(ls.getItem(draftKey), JSON.stringify(legacyDraftData));
    assert.equal(ls.getItem(finalKey), JSON.stringify(legacyFinalData));

    // A legacy consumer reading localStorage gets the exact original content (safe rollback)
    const rollbackDraft = JSON.parse(ls.getItem(draftKey)!);
    assert.equal(rollbackDraft.candidateName, 'Nguyễn Văn A');
    assert.equal(rollbackDraft.responses['q1-v1'], 'opt-1a');
  });

  it('preserves candidateName, deadline, startedAt, and presentationOrder', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();
    const exam = createTestExam();

    ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

    const customOrder = {
      seed: 'seed-custom-999',
      questionOrder: ['q2-v1', 'q1-v1', 'q3-v1', 'q4-v1'], // valid I -> II -> III
      optionOrder: [
        {
          questionVersionId: 'q1-v1',
          optionIds: ['opt-1d', 'opt-1b', 'opt-1c', 'opt-1a'],
        },
        {
          questionVersionId: 'q2-v1',
          optionIds: ['opt-2c', 'opt-2a', 'opt-2d', 'opt-2b'],
        },
      ],
    };

    const draftKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-order-01');
    ls.setItem(
      draftKey,
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-order-01',
        candidateName: '  Hoàng Đức Trọng  ', // whitespace should be trimmed
        startedAt: 1711111111000,
        deadline: 1711114111000,
        presentationOrder: customOrder,
        responses: {},
        submitted: false,
      })
    );

    const res = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });

    assert.ok(res.ok);
    const loaded = await storage.load({
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: 'att-order-01',
    });

    assert.ok(loaded.ok && loaded.value);
    const rec = loaded.value;
    assert.equal(rec.candidateName, 'Hoàng Đức Trọng');
    assert.equal(rec.startedAt, 1711111111000);
    assert.equal(rec.deadline, 1711114111000);
    assert.deepEqual(rec.presentationOrder, customOrder);
  });

  it('maps responses and preserves Part II missing/null as null, never false', async () => {
    const exam = createTestExam();

    // q3-v1 has statements st-3a, st-3b, st-3c, st-3d
    // Legacy responses only has st-3a = true, st-3b = false, and st-3c = null. st-3d is missing completely!
    const legacyResponses = {
      'q1-v1': 'opt-1a',
      'q3-v1': {
        'st-3a': true,
        'st-3b': false,
        'st-3c': null,
        // st-3d omitted
      },
      'q4-v1': '-0,5',
    };

    const mapRes = mapLegacyResponsesToDomain(exam, legacyResponses, 'att-part2-test');
    assert.ok(mapRes.ok && mapRes.responses);

    const r2 = mapRes.responses.responses.find((r) => r.questionVersionId === 'q3-v1');
    assert.ok(r2 && r2.kind === 'II');

    const ansA = r2.answers.find((a) => a.statementId === 'st-3a');
    const ansB = r2.answers.find((a) => a.statementId === 'st-3b');
    const ansC = r2.answers.find((a) => a.statementId === 'st-3c');
    const ansD = r2.answers.find((a) => a.statementId === 'st-3d');

    assert.equal(ansA?.value, true);
    assert.equal(ansB?.value, false);
    // Explicit null preserved as null:
    assert.equal(ansC?.value, null);
    // Missing statement preserved as null, NOT FALSE!
    assert.equal(ansD?.value, null);
  });

  it('recomputes legacy float score independently rather than trusting it', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();
    const exam = createTestExam();

    ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

    // Independent derivation of score:
    // Exam config: N1 = 2, N2 = 1, N3 = 1
    // MAX_I = 2 * 0.25 = 0.50 (1/2)
    // MAX_II = 1 * 1.00 = 1.00 (1/1)
    // BASE = 0.50 + 1.00 = 1.50
    // POINT_III = (10 - 1.50) / 1 = 8.50 (17/2)
    // MAX_III = 8.50
    // MAX_TOTAL = 10.00 (10/1)
    //
    // Candidate answers:
    // q1-v1: 'opt-1a' (correct) -> 0.25
    // q2-v1: 'opt-2c' (wrong, correct is opt-2b) -> 0
    // Score I = 0.25 (1/4)
    //
    // q3-v1: 3 of 4 statements correct:
    // st-3a (true) -> correct
    // st-3b (false) -> correct
    // st-3c (true) -> correct
    // st-3d (null) -> not answered
    // Total correct statements k = 3 -> for whole question, points = 0.50 (1/2)
    // Score II = 0.50 (1/2)
    //
    // q4-v1: '-0,5' (correct) -> 8.50 (17/2)
    // Score III = 8.50 (17/2)
    //
    // Expected Total = 0.25 + 0.50 + 8.50 = 9.25 (37/4)

    const finalKey = buildFinalKey(exam.examId, exam.examVersionId, 'att-score-01');
    ls.setItem(
      finalKey,
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-score-01',
        candidateName: 'Lê Văn C',
        startedAt: 1700000000000,
        deadline: 1700003000000,
        submittedAt: 1700002000000,
        responses: {
          'q1-v1': 'opt-1a',
          'q2-v1': 'opt-2c',
          'q3-v1': {
            'st-3a': true,
            'st-3b': false,
            'st-3c': true,
            // st-3d null
          },
          'q4-v1': '-0,5',
        },
        submitted: true,
        scoreResult: {
          total: 100.0, // Blatantly wrong legacy float score!
        },
      })
    );

    const res = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });

    assert.ok(res.ok);
    const loaded = await storage.load({
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: 'att-score-01',
    });

    assert.ok(loaded.ok && loaded.value);
    const rec = loaded.value;
    assert.equal(rec.phase, 'final');
    assert.ok(rec.scoreDTO);

    const dto = rec.scoreDTO as Record<string, any>;
    // Recomputed total must be exactly 37/4, NOT 100!
    assert.equal(dto.total, '37/4');
    assert.equal(dto.maxTotal, '10');
    assert.equal(dto.sections.I.score, '1/4');
    assert.equal(dto.sections.II.score, '1/2');
    assert.equal(dto.sections.III.score, '17/2');
  });

  it('conflicting main/final: existing final always wins over draft', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();
    const exam = createTestExam();

    ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

    const draftKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-conflict-01');
    const finalKey = buildFinalKey(exam.examId, exam.examVersionId, 'att-conflict-01');

    // Draft has later modified answer and different name
    ls.setItem(
      draftKey,
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-conflict-01',
        candidateName: 'Tên sửa sau trong draft',
        responses: {
          'q1-v1': 'opt-1d',
        },
        submitted: false,
      })
    );

    // Final was submitted earlier
    ls.setItem(
      finalKey,
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-conflict-01',
        candidateName: 'Tên chính thức lúc nộp',
        responses: {
          'q1-v1': 'opt-1a',
        },
        submitted: true,
      })
    );

    const res = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });

    assert.ok(res.ok);
    const loaded = await storage.load({
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: 'att-conflict-01',
    });

    assert.ok(loaded.ok && loaded.value);
    const rec = loaded.value;
    // Final record must win: candidate name is the final submission name, phase is final
    assert.equal(rec.phase, 'final');
    assert.equal(rec.candidateName, 'Tên chính thức lúc nộp');
    const r1 = rec.responses.responses.find((r) => r.questionVersionId === 'q1-v1');
    assert.equal((r1 as any)?.selectedOptionId, 'opt-1a');
  });

  it('quarantines invalid data with foreign references and keeps raw export', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();
    const exam = createTestExam();

    ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

    // Attempt with foreign option ID
    const badKey1 = buildFinalKey(exam.examId, exam.examVersionId, 'att-foreign-opt');
    ls.setItem(
      badKey1,
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-foreign-opt',
        responses: {
          'q1-v1': 'opt-foreign-unknown',
        },
        submitted: true,
      })
    );

    // Attempt with foreign question ID
    const badKey2 = buildFinalKey(exam.examId, exam.examVersionId, 'att-foreign-q');
    ls.setItem(
      badKey2,
      JSON.stringify({
        examId: exam.examId,
        examVersionId: exam.examVersionId,
        attemptId: 'att-foreign-q',
        responses: {
          'question-from-another-planet': 'val',
        },
        submitted: true,
      })
    );

    // Corrupted non-JSON data
    const badKey3 = buildDraftKey(exam.examId, exam.examVersionId, 'att-corrupt-json');
    ls.setItem(badKey3, '{ corrupted unclosed json ...');

    const res = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });

    assert.ok(res.ok);
    const report = res.value;
    assert.equal(report.quarantinedCount, 3);
    assert.equal(report.quarantined.length, 3);

    // Check that quarantined records contain raw data and explanatory reasons
    const qOpt = report.quarantined.find((q) => q.sourceKey === badKey1);
    assert.ok(qOpt);
    assert.ok(qOpt.reason.includes('foreign option ref') || qOpt.reason.includes('Lựa chọn lạ'));

    const qQue = report.quarantined.find((q) => q.sourceKey === badKey2);
    assert.ok(qQue);
    assert.ok(qQue.reason.includes('foreign question ref') || qQue.reason.includes('Câu hỏi lạ'));

    const qJson = report.quarantined.find((q) => q.sourceKey === badKey3);
    assert.ok(qJson);
    assert.ok(qJson.reason.includes('JSON'));

    // Check that storage attempt store does NOT contain the quarantined attempts
    const loadBad1 = await storage.load({
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: 'att-foreign-opt',
    });
    assert.equal(loadBad1.ok && loadBad1.value, null);
  });

  it('skips future schema versions and preserves source untouched', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();
    const exam = createTestExam();

    ls.setItem(buildSnapshotKey(exam.examId, exam.examVersionId), JSON.stringify(exam));

    const futureKey = buildDraftKey(exam.examId, exam.examVersionId, 'att-future-v99');
    const futureData = {
      schemaVersion: 'web-attempt-v99',
      examId: exam.examId,
      examVersionId: exam.examVersionId,
      attemptId: 'att-future-v99',
      advancedField: 'do not touch',
    };
    ls.setItem(futureKey, JSON.stringify(futureData));

    const res = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });

    assert.ok(res.ok);
    assert.equal(res.value.skippedFutureVersions, 1);
    assert.ok(res.value.skippedKeys.includes(futureKey));

    // Source in localStorage remains untouched
    assert.equal(ls.getItem(futureKey), JSON.stringify(futureData));
  });

  it('migrates question bank and normalizes taxonomy difficulty', async () => {
    const mem = new MemoryTransactionAdapter();
    const storage = createStoragePort(mem);
    const ls = new MockLocalStorage();

    const bankQuestions = [
      {
        questionVersionId: 'bank-q1',
        kind: 'I',
        options: [
          { optionId: 'o1', text: 'Opt 1' },
          { optionId: 'o2', text: 'Opt 2' },
          { optionId: 'o3', text: 'Opt 3' },
          { optionId: 'o4', text: 'Opt 4' },
        ],
        correctOptionId: 'o1',
        subject: 'Toán học',
        grade: 12,
        topic: 'Khảo sát hàm số',
        lesson: 'Cực trị',
        difficulty: 'nhan_biet', // legacy format
      },
      {
        questionVersionId: 'bank-q2',
        kind: 'III',
        answerKey: '1,5',
        difficulty: 'van_dung', // legacy format
      },
    ];

    ls.setItem('cunata:question_bank', JSON.stringify(bankQuestions));

    const res = await migrateLegacyStorage({
      storage,
      localStorage: ls,
      approvedD03: true,
    });

    assert.ok(res.ok);
    assert.equal(res.value.migratedBankQuestions, 2);

    const b1 = await storage.getObject('bank', 'bank-q1');
    assert.ok(b1.ok && b1.value);
    const entry1 = b1.value as any;
    assert.equal(entry1.taxonomy.difficulty, 'Nhận biết');

    const b2 = await storage.getObject('bank', 'bank-q2');
    assert.ok(b2.ok && b2.value);
    const entry2 = b2.value as any;
    assert.equal(entry2.taxonomy.difficulty, 'Vận dụng');
  });
});
