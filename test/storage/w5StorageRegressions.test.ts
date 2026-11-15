import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createStoragePort,
  MemoryTransactionAdapter,
  computePayloadHash,
  type StoragePort,
  type AttemptRecord,
  type WebExam,
  type OutboxRecord,
  type Result,
} from '../../src/storage/index.ts';

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) {
    throw new Error(`Expected ok: true but got error: ${res.error.code} - ${res.error.message}`);
  }
  return res.value;
}

function createSampleExam(examId = 'exam-w5-01', examVersionId = 'v1.0'): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId,
    examVersionId,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề kiểm tra Wave 5 Storage Regressions',
    subject: 'Toán học',
    grade: 12,
    settings: {
      durationMinutes: 50,
      maxAttempts: 2,
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
    ],
    assets: [],
  };
}

function createSampleAttempt(
  exam: WebExam,
  attemptId = 'att-w5-01',
  candidateName = 'Trần Văn Bình'
): AttemptRecord {
  return {
    schemaVersion: 'web-attempt-v1',
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    attemptId,
    revision: 1,
    candidateName,
    examSnapshot: exam,
    presentationOrder: {
      seed: 'seed-w5-01',
      questionOrder: ['q1-v1'],
      optionOrder: [
        {
          questionVersionId: 'q1-v1',
          optionIds: ['opt-1a', 'opt-1b'],
        },
      ],
    },
    responses: {
      attemptId,
      examVersionId: exam.examVersionId,
      responses: [
        {
          kind: 'I',
          questionVersionId: 'q1-v1',
          selectedOptionId: 'opt-1a',
        },
      ],
    },
    startedAt: 1000,
    deadline: 1000 + 50 * 60 * 1000,
    phase: 'draft',
    submittedAt: null,
    scoreDTO: null,
  };
}

describe('WEB-FINAL-STUDENT-STORAGE: Storage Regressions', () => {
  it('LC43-F02 regression: finalize does not overwrite or reset existing outbox retryCount or failed state', async () => {
    const adapter = new MemoryTransactionAdapter();
    const port = createStoragePort(adapter);
    const exam = createSampleExam();
    const draft = createSampleAttempt(exam, 'att-lc43-f02');

    // 1. Create draft
    const createRes = await port.create(draft);
    assert.equal(createRes.ok, true);

    // 2. Finalize draft (revision 1 -> 2)
    const finalDraft: AttemptRecord = {
      ...draft,
      revision: 2,
      phase: 'final',
      submittedAt: 2000,
      scoreDTO: { total: '1/4', maxTotal: '1/4', sections: { I: '1/4' } },
    };
    const finRes1 = await port.finalize(finalDraft, 1);
    assert.equal(finRes1.ok, true);

    // Initial outbox record created in state 'local_saved' with retryCount = 0
    const outboxRecord1 = unwrap(await port.getOutbox(draft));
    assert.ok(outboxRecord1);
    assert.equal(outboxRecord1.state, 'local_saved');
    assert.equal(outboxRecord1.retryCount, 0);
    assert.equal(outboxRecord1.generation, 1);

    // 3. Simulate 5 transport failures updating outbox to failed state with retryCount = 5
    let currentOutbox = outboxRecord1;
    for (let i = 1; i <= 5; i++) {
      const updateRes = await port.updateOutbox(
        {
          ...currentOutbox,
          state: i === 5 ? 'failed' : 'queued',
          retryCount: i,
          lastError: `Simulated network error attempt ${i}`,
        },
        currentOutbox.generation
      );
      currentOutbox = unwrap(updateRes);
    }

    assert.equal(currentOutbox.state, 'failed');
    assert.equal(currentOutbox.retryCount, 5);
    assert.equal(currentOutbox.generation, 6);

    // 4. Verify outbox is persisted with retryCount 5
    const outboxBefore = unwrap(await port.getOutbox(draft));
    assert.ok(outboxBefore);
    assert.equal(outboxBefore.retryCount, 5);
    assert.equal(outboxBefore.state, 'failed');

    // 5. Simulate reload / re-finalize call on the finalized attempt
    // Invariant: existing outbox record must NOT be reset or overwritten with retryCount: 0!
    const finRes2 = await port.finalize(finalDraft, 1);
    assert.equal(finRes2.ok, true); // Terminal final adoption returns existing final

    const outboxAfter = unwrap(await port.getOutbox(draft));
    assert.ok(outboxAfter);
    assert.equal(
      outboxAfter.retryCount,
      5,
      'LC43-F02: retryCount must remain 5 and NOT be reset to 0'
    );
    assert.equal(
      outboxAfter.state,
      'failed',
      'LC43-F02: state must remain failed and NOT be reset to local_saved'
    );
    assert.equal(
      outboxAfter.generation,
      6,
      'generation must remain 6'
    );
  });
});

