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

  it('FX26-storage regression: storage preserves candidateName exactly through draft, finalize and reload roundtrip with Unicode', async () => {
    const adapter = new MemoryTransactionAdapter();
    const port = createStoragePort(adapter);
    const exam = createSampleExam('codex-no-endpoint', 'v1.0.0');
    const customName = 'Codex trạng thái cục bộ';

    // 1. Initial draft created with default or starting name
    const initialDraft = createSampleAttempt(exam, 'attempt-fx26-01', 'Thí sinh tự do');
    const createRes = await port.create(initialDraft);
    assert.equal(createRes.ok, true);

    // 2. Draft updated with new candidate name
    const renamedDraft: AttemptRecord = {
      ...initialDraft,
      candidateName: customName,
    };
    const saveRes = await port.saveDraft(renamedDraft, 1);
    assert.equal(saveRes.ok, true);
    assert.equal(unwrap(saveRes).candidateName, customName);
    assert.equal(unwrap(saveRes).revision, 2);

    // 3. Verify load reflects updated name
    const loadedDraft = unwrap(await port.load(initialDraft));
    assert.ok(loadedDraft);
    assert.equal(loadedDraft.candidateName, customName);

    // 4. Finalize draft
    const finalRecord: AttemptRecord = {
      ...loadedDraft,
      revision: 3,
      phase: 'final',
      submittedAt: 5000,
      scoreDTO: { total: '0', maxTotal: '1/4', sections: { I: '0' } },
    };
    const finRes = await port.finalize(finalRecord, 2);
    assert.equal(finRes.ok, true);
    assert.equal(unwrap(finRes).candidateName, customName);
    assert.equal(unwrap(finRes).phase, 'final');

    // 5. Outbox record created in local_saved state
    const outbox = unwrap(await port.getOutbox(initialDraft));
    assert.ok(outbox);
    assert.equal(outbox.state, 'local_saved');

    // 6. Simulate reload by creating a new StoragePort on the same backing data
    const reopenedPort = createStoragePort(new MemoryTransactionAdapter(adapter.getBackingData()));

    // 7. Verify loaded record and listAttempts after reload preserve exact candidate name
    const reloaded = unwrap(await reopenedPort.load(initialDraft));
    assert.ok(reloaded);
    assert.equal(reloaded.candidateName, customName, 'reload must preserve final candidate name in StoragePort.load');
    assert.equal(reloaded.phase, 'final');

    const listed = unwrap(await reopenedPort.listAttempts(exam.examId, exam.examVersionId));
    assert.equal(listed.length, 1);
    const firstListed = listed[0];
    assert.ok(firstListed);
    assert.equal(firstListed.candidateName, customName, 'reload must preserve final candidate name in StoragePort.listAttempts');
  });

  it('FX27-storage regression: draft reload preserves candidateName through rename and multiple answer revisions', async () => {
    const adapter = new MemoryTransactionAdapter();
    const port = createStoragePort(adapter);
    const exam = createSampleExam('ck-exam-01', 'v1.0.0');
    const initialName = 'Học sinh kiểm định';
    const updatedName = 'Trần Bình 0456';

    // 1. Initial attempt created with gate name
    const initialDraft = createSampleAttempt(exam, 'attempt-fx27-01', initialName);
    const createRes = await port.create(initialDraft);
    assert.equal(createRes.ok, true);
    assert.equal(unwrap(createRes).candidateName, initialName);

    // 2. Candidate changes name in UI (#candidateName input event calls controller.rename / saveDraft)
    const renamedDraft: AttemptRecord = {
      ...initialDraft,
      candidateName: updatedName,
    };
    const saveRenameRes = await port.saveDraft(renamedDraft, 1);
    assert.equal(saveRenameRes.ok, true);
    assert.equal(unwrap(saveRenameRes).candidateName, updatedName);
    assert.equal(unwrap(saveRenameRes).revision, 2);

    // 3. Candidate answers questions (multiple saveDraft calls with responses)
    let currentRecord = unwrap(saveRenameRes);
    for (let i = 0; i < 3; i++) {
      const answeringDraft: AttemptRecord = {
        ...currentRecord,
        candidateName: currentRecord.candidateName, // preserves updated name
      };
      const ansRes = await port.saveDraft(answeringDraft, currentRecord.revision);
      assert.equal(ansRes.ok, true);
      currentRecord = unwrap(ansRes);
      assert.equal(currentRecord.candidateName, updatedName);
    }
    assert.equal(currentRecord.revision, 5);

    // 4. Simulate page reload by creating a new StoragePort on the same backing data
    const reopenedPort = createStoragePort(new MemoryTransactionAdapter(adapter.getBackingData()));

    // 5. Verify draft loaded after reload preserves exact updated candidateName
    const reloadedDraft = unwrap(await reopenedPort.load(initialDraft));
    assert.ok(reloadedDraft);
    assert.equal(reloadedDraft.candidateName, updatedName, 'reloaded draft must preserve renamed candidateName');
    assert.equal(reloadedDraft.revision, 5);
    assert.equal(reloadedDraft.phase, 'draft');

    // 6. Verify listAttempts also preserves updated candidateName
    const listed = unwrap(await reopenedPort.listAttempts(exam.examId, exam.examVersionId));
    assert.equal(listed.length, 1);
    const first = listed[0];
    assert.ok(first);
    assert.equal(first.candidateName, updatedName, 'listAttempts must preserve renamed candidateName');

    // 7. Verify deadline auto-submission on reloaded draft preserves candidateName
    const deadlineFinal: AttemptRecord = {
      ...reloadedDraft,
      revision: reloadedDraft.revision + 1,
      phase: 'final',
      submittedAt: reloadedDraft.deadline + 1000,
      scoreDTO: { total: '1/4', maxTotal: '1/4', sections: { I: '1/4' } },
    };
    const finRes = await reopenedPort.finalize(deadlineFinal, reloadedDraft.revision);
    assert.equal(finRes.ok, true);
    const finalized = unwrap(finRes);
    assert.equal(finalized.candidateName, updatedName, 'deadline auto-submit must preserve renamed candidateName');
  });

  it('FX30-storage regression: listOutbox lists all outbox records, isolates mutations, and preserves attempt metadata', async () => {
    const adapter = new MemoryTransactionAdapter();
    const port = createStoragePort(adapter);
    const exam = createSampleExam('ck-exam-30', 'v1.0.0');

    // 1. Initial listOutbox is empty
    if (port.listOutbox) {
      const emptyRes = await port.listOutbox();
      assert.equal(emptyRes.ok, true);
      assert.deepEqual(unwrap(emptyRes), []);
    }

    // 2. Finalize two attempts with distinct candidate names
    const attempt1 = createSampleAttempt(exam, 'attempt-fx30-01', 'Nguyễn An 0123');
    unwrap(await port.create(attempt1));
    const final1: AttemptRecord = {
      ...attempt1,
      revision: 2,
      phase: 'final',
      submittedAt: 1000,
      scoreDTO: { total: '0.25' },
    };
    unwrap(await port.finalize(final1, 1));

    const attempt2 = createSampleAttempt(exam, 'attempt-fx30-02', 'Codex trạng thái cục bộ');
    unwrap(await port.create(attempt2));
    const final2: AttemptRecord = {
      ...attempt2,
      revision: 2,
      phase: 'final',
      submittedAt: 2000,
      scoreDTO: { total: '0' },
    };
    unwrap(await port.finalize(final2, 1));

    // 3. listOutbox returns both outbox records in local_saved state
    assert.ok(port.listOutbox, 'listOutbox must be defined on StoragePort');
    const outboxRes = await port.listOutbox();
    assert.equal(outboxRes.ok, true);
    const outboxList = unwrap(outboxRes);
    assert.equal(outboxList.length, 2);
    assert.ok(outboxList.some((o) => o.attemptId === 'attempt-fx30-01' && o.state === 'local_saved'));
    assert.ok(outboxList.some((o) => o.attemptId === 'attempt-fx30-02' && o.state === 'local_saved'));

    // 4. Verify mutation isolation: mutating returned list does not mutate storage
    (outboxList as any)[0].state = 'server_confirmed';
    const freshOutboxRes = await port.listOutbox();
    const freshList = unwrap(freshOutboxRes);
    assert.ok(freshList.every((o) => o.state === 'local_saved'), 'mutating listOutbox result must not leak into storage');

    // 5. Verify reload preserves outbox and attempts records
    const reloadedPort = createStoragePort(new MemoryTransactionAdapter(adapter.getBackingData()));
    assert.ok(reloadedPort.listOutbox);
    const reloadedOutbox = unwrap(await reloadedPort.listOutbox());
    assert.equal(reloadedOutbox.length, 2);

    const reloadedA1 = unwrap(await reloadedPort.load(attempt1));
    assert.ok(reloadedA1);
    assert.equal(reloadedA1.candidateName, 'Nguyễn An 0123');

    const reloadedA2 = unwrap(await reloadedPort.load(attempt2));
    assert.ok(reloadedA2);
    assert.equal(reloadedA2.candidateName, 'Codex trạng thái cục bộ');
  });

  it('FX33-storage regression: storage preserves candidateName through draft reload, post-deadline auto-finalize, and zero-endpoint local_saved status', async () => {
    const adapter = new MemoryTransactionAdapter();
    const port = createStoragePort(adapter);
    const exam = createSampleExam('exam-fx33-storage', 'v1.0.0');

    // Case 1: "tải lại trang: giữ nguyên bài làm, tên thí sinh và đồng hồ chạy tiếp"
    // Candidate starts draft with name 'Trần Bình 0456'
    const draftName1 = 'Trần Bình 0456';
    const draft1 = createSampleAttempt(exam, 'att-fx33-01', draftName1);
    unwrap(await port.create(draft1));

    // Save answers in draft (revision 1 -> 2)
    const updatedDraft1: AttemptRecord = {
      ...draft1,
      candidateName: draftName1,
      revision: 1,
      responses: {
        attemptId: draft1.attemptId,
        examVersionId: exam.examVersionId,
        responses: [
          { kind: 'I', questionVersionId: 'q1-v1', selectedOptionId: 'opt-1c' },
        ],
      },
    };
    const savedDraftRes = await port.saveDraft(updatedDraft1, 1);
    assert.equal(savedDraftRes.ok, true);
    assert.equal(unwrap(savedDraftRes).candidateName, draftName1);
    assert.equal(unwrap(savedDraftRes).revision, 2);

    // Simulate browser reload: new StoragePort over existing backing data
    const reloadedPort1 = createStoragePort(new MemoryTransactionAdapter(adapter.getBackingData()));
    const loadedDraft1 = unwrap(await reloadedPort1.load(draft1));
    assert.ok(loadedDraft1);
    assert.equal(loadedDraft1.candidateName, draftName1, 'draft candidateName must be preserved on reload');
    assert.equal(loadedDraft1.phase, 'draft');
    assert.equal(loadedDraft1.revision, 2);
    assert.deepEqual(loadedDraft1.responses, updatedDraft1.responses, 'draft responses must be preserved on reload');

    // Case 2: "quay lại sau khi hết giờ: tự nộp bài đã lưu, giữ đúng tên thí sinh"
    // Candidate starts draft with name 'Nguyễn An 0123'
    const draftName2 = 'Nguyễn An 0123';
    const draft2 = createSampleAttempt(exam, 'att-fx33-02', draftName2);
    unwrap(await port.create(draft2));

    // Page reloads after deadline expired; controller auto-finalizes the saved attempt
    const reloadedPort2 = createStoragePort(new MemoryTransactionAdapter(adapter.getBackingData()));
    const loadedDraft2 = unwrap(await reloadedPort2.load(draft2));
    assert.ok(loadedDraft2);
    assert.equal(loadedDraft2.candidateName, draftName2);

    const autoFinal2: AttemptRecord = {
      ...loadedDraft2,
      revision: loadedDraft2.revision + 1,
      phase: 'final',
      submittedAt: loadedDraft2.deadline + 3 * 3600 * 1000,
      scoreDTO: { total: '0,25/10', sections: { I: '0,25/1' } },
    };
    const autoFinalRes = await reloadedPort2.finalize(autoFinal2, loadedDraft2.revision);
    assert.equal(autoFinalRes.ok, true);
    const finalRecord2 = unwrap(autoFinalRes);
    assert.equal(finalRecord2.candidateName, draftName2, 'auto-finalized attempt must preserve candidateName');
    assert.equal(finalRecord2.phase, 'final');

    // Outbox record must be created with local_saved and matching payloadHash containing candidateName
    const outbox2 = unwrap(await reloadedPort2.getOutbox(draft2));
    assert.ok(outbox2);
    assert.equal(outbox2.state, 'local_saved');
    assert.equal(outbox2.payloadHash, computePayloadHash(finalRecord2));

    // Case 3: "no endpoint: honest local status and zero collector requests, including reload"
    const draftName3 = 'Codex trạng thái cục bộ';
    const draft3 = createSampleAttempt(exam, 'att-fx33-03', draftName3);
    unwrap(await port.create(draft3));

    const final3: AttemptRecord = {
      ...draft3,
      revision: 2,
      phase: 'final',
      submittedAt: 5000,
      scoreDTO: { total: '10/10' },
    };
    const finalRes3 = await port.finalize(final3, 1);
    assert.equal(finalRes3.ok, true);
    const finalRecord3 = unwrap(finalRes3);
    assert.equal(finalRecord3.candidateName, draftName3);

    // Simulate reload after submission
    const reloadedPort3 = createStoragePort(new MemoryTransactionAdapter(adapter.getBackingData()));
    const reloadedFinal3 = unwrap(await reloadedPort3.load(draft3));
    assert.ok(reloadedFinal3);
    assert.equal(reloadedFinal3.candidateName, draftName3, 'reload after submit must preserve final candidate name');
    assert.equal(reloadedFinal3.phase, 'final');

    const reloadedOutbox3 = unwrap(await reloadedPort3.getOutbox(draft3));
    assert.ok(reloadedOutbox3);
    assert.equal(reloadedOutbox3.state, 'local_saved', 'outbox state must remain local_saved');
    assert.equal(reloadedOutbox3.retryCount, 0);
  });
});

