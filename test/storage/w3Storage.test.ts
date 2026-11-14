import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createStoragePort,
  openStorage,
  MemoryTransactionAdapter,
  computePayloadHash,
  DEFAULT_STORAGE_BROADCAST_CHANNEL,
  MemoryBroadcastChannel,
  createStorageBroadcastNotifier,
  createStorageBroadcastListener,
  recheckTransactionState,
  type StoragePort,
  type StorageLike,
  type StorageBroadcastNotification,
  type AttemptRecord,
  type WebExam,
  type OutboxRecord,
  type BroadcastChannelPort,
  type Result,
} from '../../src/storage/index.ts';

import {
  deleteConfirmed,
  exportBackup,
} from '../../src/storage/backup.ts';

function unwrap<T>(res: Result<T>): T {
  if (!res.ok) {
    throw new Error(`Expected ok: true but got error: ${res.error.code} - ${res.error.message}`);
  }
  return res.value;
}

function unwrapError<T>(res: Result<T>) {
  if (res.ok) {
    throw new Error('Expected ok: false but got ok: true');
  }
  return res.error;
}

function createMockExam(examId = 'exam-w3-01', examVersionId = 'v1'): WebExam {
  return {
    schemaVersion: 'web-exam-v1',
    examId,
    examVersionId,
    ruleSetId: 'custom-v1',
    inputPolicyId: 'sa-charset-v1',
    title: 'Đề kiểm tra Wave 3',
    subject: 'Toán',
    grade: 12,
    settings: {
      durationMinutes: 45,
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
        content: 'Cho hàm số y = f(x)',
        options: [
          { optionId: 'opt-1', text: '1' },
          { optionId: 'opt-2', text: '2' },
          { optionId: 'opt-3', text: '3' },
          { optionId: 'opt-4', text: '4' },
        ],
        correctOptionId: 'opt-2',
      },
      {
        kind: 'II',
        questionVersionId: 'q2-v1',
        title: 'Câu 2',
        content: 'Các mệnh đề sau',
        statements: [
          { statementId: 'st-1', text: 'Ý 1', answer: true },
          { statementId: 'st-2', text: 'Ý 2', answer: false },
          { statementId: 'st-3', text: 'Ý 3', answer: true },
          { statementId: 'st-4', text: 'Ý 4', answer: false },
        ],
      },
      {
        kind: 'III',
        questionVersionId: 'q3-v1',
        title: 'Câu 3',
        content: 'Đáp án ngắn',
        answerKey: '-0,5',
      },
    ],
    assets: [],
  };
}

function createMockAttempt(
  attemptId = 'att-w3-001',
  candidateName = 'Tran Thi B',
  revision = 1
): AttemptRecord {
  const exam = createMockExam();
  return {
    schemaVersion: 'web-attempt-v1',
    examId: exam.examId,
    examVersionId: exam.examVersionId,
    attemptId,
    revision,
    candidateName,
    examSnapshot: exam,
    presentationOrder: {
      seed: 'seed-w3',
      questionOrder: ['q1-v1', 'q2-v1', 'q3-v1'],
      optionOrder: [{ questionVersionId: 'q1-v1', optionIds: ['opt-1', 'opt-2', 'opt-3', 'opt-4'] }],
    },
    responses: {
      attemptId,
      examVersionId: exam.examVersionId,
      responses: [
        { kind: 'I', questionVersionId: 'q1-v1', selectedOptionId: 'opt-2' },
        {
          kind: 'II',
          questionVersionId: 'q2-v1',
          answers: [
            { statementId: 'st-1', value: true },
            { statementId: 'st-2', value: false },
            { statementId: 'st-3', value: null },
            { statementId: 'st-4', value: null },
          ],
        },
        { kind: 'III', questionVersionId: 'q3-v1', raw: '-0,5' },
      ],
    },
    startedAt: 1700000000000,
    deadline: 1700002700000,
    phase: 'draft',
    submittedAt: null,
    scoreDTO: null,
  };
}

class MockLocalStorage implements StorageLike {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    const keys = Array.from(this.map.keys());
    return keys[index] ?? null;
  }
}

describe('WEB-W3-STORAGE: M2 Approved Migration and Cross-Tab Notifications', () => {
  describe('1. Wiring Migration & Backup into openStorage only after D03 approval', () => {
    it('leaves migration disabled when approveD03 is false or omitted (D03 gate enforced)', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const mockLs = new MockLocalStorage();
      const exam = createMockExam();

      // Seed legacy storage data
      mockLs.setItem(
        'cunata:attempt:' + encodeURIComponent(exam.examId) + ':' + encodeURIComponent(exam.examVersionId) + ':att-leg-1',
        JSON.stringify({
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: 'att-leg-1',
          candidateName: 'Hoc Sinh Cu',
          submitted: false,
          examSnapshot: exam,
          responses: { 'q1-v1': 'opt-2' },
        })
      );

      // Open storage WITHOUT D03 approval
      const openRes = await openStorage({
        adapter,
        approveD03: false,
        localStorage: mockLs,
      });

      const port = unwrap(openRes);

      // Verify port has NOT migrated the legacy attempt
      const loaded = unwrap(
        await port.load({
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: 'att-leg-1',
        })
      );
      assert.equal(loaded, null, 'Legacy data must NOT be auto-migrated without D03 approval');

      // Verify localStorage was not marked completed
      assert.equal(mockLs.getItem('cunata:migration:v1:status'), null);
    });

    it('wires migration and imports legacy data into StoragePort when approveD03: true', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const mockLs = new MockLocalStorage();
      const exam = createMockExam();

      // Seed legacy draft attempt
      mockLs.setItem(
        'cunata:attempt:' + encodeURIComponent(exam.examId) + ':' + encodeURIComponent(exam.examVersionId) + ':att-leg-2',
        JSON.stringify({
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: 'att-leg-2',
          candidateName: 'Le Thi C',
          submitted: false,
          examSnapshot: exam,
          responses: { 'q1-v1': 'opt-2' },
        })
      );

      // Open storage WITH explicit D03 approval
      const openRes = await openStorage({
        adapter,
        approveD03: true,
        localStorage: mockLs,
      });

      const port = unwrap(openRes);

      // Verify legacy draft is now successfully migrated into StoragePort
      const loaded = unwrap(
        await port.load({
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: 'att-leg-2',
        })
      );
      assert.notEqual(loaded, null);
      assert.equal(loaded?.candidateName, 'Le Thi C');
      assert.equal(loaded?.phase, 'draft');

      // AC: Migration status recorded in localStorage without deleting source
      const statusRaw = mockLs.getItem('cunata:migration:v1:status');
      assert.notEqual(statusRaw, null);
      const statusObj = JSON.parse(statusRaw!);
      assert.equal(statusObj.status, 'completed');
      assert.equal(statusObj.migratedAttempts, 1);

      // AC: Source data retained in localStorage
      assert.notEqual(
        mockLs.getItem(
          'cunata:attempt:' + encodeURIComponent(exam.examId) + ':' + encodeURIComponent(exam.examVersionId) + ':att-leg-2'
        ),
        null,
        'Source data in localStorage must be retained during migration'
      );
    });

    it('creates auto-backup during approved migration when autoBackupOnMigration is true', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const mockLs = new MockLocalStorage();
      const exam = createMockExam();

      mockLs.setItem(
        'cunata:final:' + encodeURIComponent(exam.examId) + ':' + encodeURIComponent(exam.examVersionId) + ':att-leg-final',
        JSON.stringify({
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: 'att-leg-final',
          candidateName: 'Pham Van D',
          submitted: true,
          examSnapshot: exam,
          responses: { 'q1-v1': 'opt-2', 'q3-v1': '-0,5' },
        })
      );

      const openRes = await openStorage({
        adapter,
        approvedD03: true,
        localStorage: mockLs,
        autoBackupOnMigration: true,
      });

      const port = unwrap(openRes);

      // Verified final migrated with score recomputed
      const loaded = unwrap(
        await port.load({
          examId: exam.examId,
          examVersionId: exam.examVersionId,
          attemptId: 'att-leg-final',
        })
      );
      assert.notEqual(loaded, null);
      assert.equal(loaded?.phase, 'final');
      assert.notEqual(loaded?.scoreDTO, null);
    });
  });

  describe('2. BroadcastChannel cross-tab notifications and reader recheck', () => {
    it('emits strictly key/revision/phase and NEVER emits candidateName, responses, or answer keys', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const channelA = new MemoryBroadcastChannel('cunata-tab-test');
      const channelB = new MemoryBroadcastChannel('cunata-tab-test');
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter, channelA);

      const receivedMessages: unknown[] = [];
      channelB.onmessage = (event: any) => {
        receivedMessages.push(event.data);
      };

      const attempt = createMockAttempt('att-sec-01', 'Nguyen Van Bi Mat');
      unwrap(await port.create(attempt));

      // Wait a microtask tick for async dispatch
      await new Promise((resolve) => setTimeout(resolve, 10));

      assert.equal(receivedMessages.length, 1);
      const msg = receivedMessages[0] as StorageBroadcastNotification;
      assert.equal(msg.type, 'attempt_saved');
      assert.equal(msg.key.attemptId, 'att-sec-01');
      assert.equal(msg.key.examId, attempt.examId);
      assert.equal(msg.key.examVersionId, attempt.examVersionId);
      assert.equal(msg.revision, 1);
      assert.equal(msg.phase, 'draft');

      // CRITICAL AC: verify no sensitive data in broadcast payload
      const msgRecord = msg as unknown as Record<string, unknown>;
      assert.equal(msgRecord.candidateName, undefined, 'Broadcast must never leak candidateName');
      assert.equal(msgRecord.responses, undefined, 'Broadcast must never leak responses');
      assert.equal(msgRecord.examSnapshot, undefined, 'Broadcast must never leak examSnapshot');
      assert.equal(msgRecord.scoreDTO, undefined, 'Broadcast must never leak scoreDTO');

      channelA.close();
      channelB.close();
    });

    it('emits attempt_finalized on finalize and outbox_updated on updateOutbox', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const channelA = new MemoryBroadcastChannel('cunata-sync-flow');
      const channelB = new MemoryBroadcastChannel('cunata-sync-flow');
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter, channelA);

      const events: StorageBroadcastNotification[] = [];
      channelB.addEventListener?.('message', (evt: any) => {
        events.push(evt.data as StorageBroadcastNotification);
      });

      const attempt = createMockAttempt('att-flow-01');
      unwrap(await port.create(attempt));
      unwrap(await port.saveDraft(attempt, 1));
      unwrap(await port.finalize(attempt, 2));

      // Outbox update
      const outboxRecord: OutboxRecord = {
        examId: attempt.examId,
        examVersionId: attempt.examVersionId,
        attemptId: attempt.attemptId,
        state: 'sending',
        finalRevision: 3,
        payloadHash: computePayloadHash(attempt),
        endpointId: 'ep-01',
        retryCount: 1,
        nextRetryAt: Date.now() + 2000,
        generation: 1,
        receipt: null,
        lastError: null,
      };
      unwrap(await port.updateOutbox(outboxRecord, 1));

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.equal(events.length, 4);
      assert.equal(events[0]?.type, 'attempt_saved');
      assert.equal(events[0]?.revision, 1);
      assert.equal(events[1]?.type, 'attempt_saved');
      assert.equal(events[1]?.revision, 2);
      assert.equal(events[2]?.type, 'attempt_finalized');
      assert.equal(events[2]?.revision, 3);
      assert.equal(events[2]?.phase, 'final');
      assert.equal(events[3]?.type, 'outbox_updated');
      assert.equal(events[3]?.revision, 2); // next generation

      channelA.close();
      channelB.close();
    });

    it('broadcast is purely an advisory notification and NEVER a lock (channel errors do not fail storage)', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const brokenChannel: BroadcastChannelPort = {
        name: 'broken-chan',
        onmessage: null,
        postMessage: () => {
          throw new Error('Simulated channel pipe broken');
        },
        close: () => {},
      };

      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter, brokenChannel);

      const attempt = createMockAttempt('att-non-lock-01');
      // Must not throw despite broken broadcast channel
      const createRes = unwrap(await port.create(attempt));
      assert.equal(createRes.attemptId, 'att-non-lock-01');

      const saveRes = unwrap(await port.saveDraft(attempt, 1));
      assert.equal(saveRes.revision, 2);

      const finRes = unwrap(await port.finalize(attempt, 2));
      assert.equal(finRes.phase, 'final');
    });

    it('readers recheck transaction state via createStorageBroadcastListener', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const channelWriter = new MemoryBroadcastChannel('cunata-recheck-bus');
      const channelReader = new MemoryBroadcastChannel('cunata-recheck-bus');
      const adapter = new MemoryTransactionAdapter();

      // Shared storage adapter between writer and reader (simulating two tabs on same origin)
      const portWriter = createStoragePort(adapter, channelWriter);
      const portReader = createStoragePort(adapter, channelReader);

      const receivedBox: { notif: StorageBroadcastNotification | null; record: AttemptRecord | null } = {
        notif: null,
        record: null,
      };

      const unsubscribe = createStorageBroadcastListener(
        portReader,
        channelReader,
        (notif, record) => {
          receivedBox.notif = notif;
          receivedBox.record = record;
        }
      );

      const attempt = createMockAttempt('att-recheck-01', 'Nguoi Doc Kiem Tra');
      unwrap(await portWriter.create(attempt));

      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.notEqual(receivedBox.notif, null);
      assert.equal(receivedBox.notif?.key.attemptId, 'att-recheck-01');
      assert.notEqual(receivedBox.record, null);
      assert.equal(receivedBox.record?.candidateName, 'Nguoi Doc Kiem Tra');
      assert.equal(receivedBox.record?.revision, 1);

      // Explicit recheck helper test
      const recheckVal = unwrap(await recheckTransactionState(portReader, attempt));
      assert.equal(recheckVal?.attemptId, 'att-recheck-01');

      unsubscribe();
      channelWriter.close();
      channelReader.close();
    });
  });

  describe('3. Multiple controllers for one tuple & Terminal Final Immutability', () => {
    it('rejects stale draft writes from second controller with STORAGE_CONFLICT', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const port1 = createStoragePort(adapter);
      const port2 = createStoragePort(adapter);

      const initial = createMockAttempt('att-multi-tuple-1', 'Thí Sinh 1');
      unwrap(await port1.create(initial));

      // Controller 1 loads and updates
      const rec1 = unwrap(await port1.load(initial))!;

      // Controller 2 loads concurrently (same revision 1)
      const rec2 = unwrap(await port2.load(initial))!;
      assert.equal(rec1.revision, 1);
      assert.equal(rec2.revision, 1);

      // Controller 1 commits draft (revision advances 1 -> 2)
      const save1 = unwrap(await port1.saveDraft(rec1, 1));
      assert.equal(save1.revision, 2);

      // Controller 2 attempts to commit with stale expectedRevision 1 -> REJECTED
      const err = unwrapError(await port2.saveDraft(rec2, 1));
      assert.equal(err.code, 'STORAGE_CONFLICT');
      assert.equal(err.path, 'revision');
    });

    it('rejects saveDraft from second controller with ATTEMPT_FINALIZED after first controller finalizes', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const port1 = createStoragePort(adapter);
      const port2 = createStoragePort(adapter);

      const attempt = createMockAttempt('att-fin-race-1', 'Nguyen Van A');
      unwrap(await port1.create(attempt));

      // Controller 1 finalizes
      const fin1 = unwrap(await port1.finalize(attempt, 1));
      assert.equal(fin1.phase, 'final');
      assert.equal(fin1.revision, 2);

      // Controller 2 attempts saveDraft on the finalized tuple -> REJECTED with ATTEMPT_FINALIZED
      const staleDraftAttempt = { ...attempt, revision: 1 };
      const err = unwrapError(await port2.saveDraft(staleDraftAttempt, 1));
      assert.equal(err.code, 'ATTEMPT_FINALIZED');
    });

    it('Terminal existing final wins in finalize/finalize race and preserves score, responses, metadata immutably', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const port1 = createStoragePort(adapter);
      const port2 = createStoragePort(adapter);

      const attempt1 = createMockAttempt('att-fin-race-2', 'Chinh Chu (Tab 1)');
      unwrap(await port1.create(attempt1));

      // Controller 1 finalizes with legitimate answers and score
      const finalAttempt1: AttemptRecord = {
        ...attempt1,
        submittedAt: 1700001000000,
        scoreDTO: { totalAchieved: '8/10', sectionI: '2/2.5' },
      };
      const fin1 = unwrap(await port1.finalize(finalAttempt1, 1));
      assert.equal(fin1.candidateName, 'Chinh Chu (Tab 1)');

      // Controller 2 (stale tab) tries to finalize with different candidateName and empty responses
      const attempt2Malicious: AttemptRecord = {
        ...attempt1,
        candidateName: 'Ke Mao Danh (Tab 2)',
        submittedAt: 1700002000000,
        scoreDTO: { totalAchieved: '0/10' },
        responses: {
          attemptId: attempt1.attemptId,
          examVersionId: attempt1.examVersionId,
          responses: [],
        },
      };

      const fin2 = unwrap(await port2.finalize(attempt2Malicious, 1));
      // AC: Terminal existing final always wins! Returns Controller 1's authentic record.
      assert.equal(fin2.candidateName, 'Chinh Chu (Tab 1)');
      assert.deepEqual(fin2.scoreDTO, { totalAchieved: '8/10', sectionI: '2/2.5' });
      assert.equal(fin2.submittedAt, 1700001000000);

      // Durable read confirms immutable state in store
      const durable = unwrap(await port1.load(attempt1));
      assert.equal(durable?.candidateName, 'Chinh Chu (Tab 1)');
      assert.equal(durable?.phase, 'final');
    });
  });

  describe('4. Final + Outbox atomicity in a single transaction', () => {
    it('atomically creates both attempts (final) and outbox (local_saved) records', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);

      const attempt = createMockAttempt('att-atom-01');
      unwrap(await port.create(attempt));

      const finRec = unwrap(await port.finalize(attempt, 1));
      assert.equal(finRec.phase, 'final');
      assert.equal(finRec.revision, 2);

      // Check attempts store
      const loadedAttempt = unwrap(await port.load(attempt));
      assert.equal(loadedAttempt?.phase, 'final');
      assert.equal(loadedAttempt?.revision, 2);

      // Check outbox store
      const loadedOutbox = unwrap(await port.getOutbox(attempt));
      assert.notEqual(loadedOutbox, null);
      assert.equal(loadedOutbox?.state, 'local_saved');
      assert.equal(loadedOutbox?.finalRevision, 2);
      assert.equal(loadedOutbox?.payloadHash, computePayloadHash(finRec));
      assert.equal(loadedOutbox?.generation, 1);
    });

    it('ensures rollback atomicity: failed/aborted finalize leaves neither final attempt nor outbox record', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);

      const attempt = createMockAttempt('att-atom-rollback-01');
      unwrap(await port.create(attempt));

      // Attempt finalize with stale expectedRevision (expected 99, actual is 1)
      const err = unwrapError(await port.finalize(attempt, 99));
      assert.equal(err.code, 'STORAGE_CONFLICT');

      // Verify attempts remains in draft state at revision 1
      const attemptAfter = unwrap(await port.load(attempt));
      assert.equal(attemptAfter?.phase, 'draft');
      assert.equal(attemptAfter?.revision, 1);

      // Verify outbox was NEVER created (no partial state)
      const outboxAfter = unwrap(await port.getOutbox(attempt));
      assert.equal(outboxAfter, null);
    });
  });

  describe('5. DB Abort and Reopen resilience', () => {
    it('aborts transaction cleanly with tx.abort() and subsequent operations succeed', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();

      // Transaction 1: puts an item then calls tx.abort()
      await assert.rejects(
        async () => {
          await adapter.runTransaction(['bank'], 'readwrite', async (tx) => {
            await tx.put('bank', 'key-abort-1', { text: 'Uncommitted' });
            await tx.abort();
          });
        },
        (err: Error) => err.name === 'AbortError'
      );

      // Transaction 2: verify key-abort-1 was NOT committed
      const val = await adapter.runTransaction(['bank'], 'readonly', async (tx) => {
        return tx.get('bank', 'key-abort-1');
      });
      assert.equal(val, null, 'Uncommitted aborted writes must be completely discarded');

      // Transaction 3: subsequent clean transaction succeeds
      await adapter.runTransaction(['bank'], 'readwrite', async (tx) => {
        await tx.put('bank', 'key-clean-1', { text: 'Committed' });
      });

      const cleanVal = await adapter.runTransaction(['bank'], 'readonly', async (tx) => {
        return tx.get('bank', 'key-clean-1');
      });
      assert.deepEqual(cleanVal, { text: 'Committed' });
    });

    it('reopens database adapter preserving all committed data and allowing new operations', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter1 = new MemoryTransactionAdapter();
      const port1 = createStoragePort(adapter1);

      const attempt = createMockAttempt('att-reopen-01');
      unwrap(await port1.create(attempt));
      unwrap(await port1.saveDraft(attempt, 1));

      // Close adapter 1
      adapter1.close();

      // Reopen adapter 2 sharing the same persistent backing data
      const adapter2 = new MemoryTransactionAdapter(adapter1.getBackingData());
      const port2 = createStoragePort(adapter2);

      // Verify data is present in reopened adapter
      const loaded = unwrap(await port2.load(attempt));
      assert.notEqual(loaded, null);
      assert.equal(loaded?.attemptId, 'att-reopen-01');
      assert.equal(loaded?.revision, 2);

      // Further operations on reopened adapter operate normally
      const finRes = unwrap(await port2.finalize(loaded!, 2));
      assert.equal(finRes.phase, 'final');
      assert.equal(finRes.revision, 3);
    });
  });

  describe('6. Quota and Private-mode adapter errors', () => {
    it('maps QuotaExceededError to STORAGE_QUOTA and recovers once quota pressure is released', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);

      const attempt = createMockAttempt('att-quota-01');
      unwrap(await port.create(attempt));

      // Simulate quota exceeded
      adapter.setQuotaExceeded(true);

      const saveErr = unwrapError(await port.saveDraft(attempt, 1));
      assert.equal(saveErr.code, 'STORAGE_QUOTA');
      assert.equal(saveErr.recoverable, true);

      const finErr = unwrapError(await port.finalize(attempt, 1));
      assert.equal(finErr.code, 'STORAGE_QUOTA');

      // Release quota pressure
      adapter.setQuotaExceeded(false);

      const saveRecovered = unwrap(await port.saveDraft(attempt, 1));
      assert.equal(saveRecovered.revision, 2);
    });

    it('maps SecurityError in private-mode to STORAGE_UNAVAILABLE safely', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      adapter.setUnavailable(true);

      const port = createStoragePort(adapter);
      const attempt = createMockAttempt('att-priv-01');

      const createErr = unwrapError(await port.create(attempt));
      assert.equal(createErr.code, 'STORAGE_UNAVAILABLE');
      assert.equal(createErr.recoverable, false);

      const loadErr = unwrapError(await port.load(attempt));
      assert.equal(loadErr.code, 'STORAGE_UNAVAILABLE');

      // openStorage with unavailable adapter returns STORAGE_UNAVAILABLE
      const openErr = unwrapError(await openStorage(adapter));
      assert.equal(openErr.code, 'STORAGE_UNAVAILABLE');
    });
  });

  describe('7. Retained source backups and confirmed deletion', () => {
    it('deleteConfirmed rejects without confirmed: true and clears data only when confirmed', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);
      const mockLs = new MockLocalStorage();

      const attempt = createMockAttempt('att-del-01');
      unwrap(await port.create(attempt));
      mockLs.setItem('cunata:active_attempt:exam:v1', 'att-del-01');

      // Unconfirmed deletion rejected
      const rejectErr = unwrapError(
        await deleteConfirmed({
          storage: port,
          localStorage: mockLs,
          confirmed: false,
        })
      );
      assert.equal(rejectErr.code, 'CONFIRMATION_REQUIRED');

      // Storage and localStorage data must still exist
      const stillThere = unwrap(await port.load(attempt));
      assert.notEqual(stillThere, null);
      assert.equal(mockLs.getItem('cunata:active_attempt:exam:v1'), 'att-del-01');

      // Confirmed deletion with exportBackupFirst: true
      const confirmedRes = unwrap(
        await deleteConfirmed({
          storage: port,
          localStorage: mockLs,
          confirmed: true,
          exportBackupFirst: true,
        })
      );
      assert.notEqual(confirmedRes.backupBlob, undefined);
      assert.equal(confirmedRes.deletedLocalKeys, 1);
      assert.equal(confirmedRes.clearedStorage, true);

      // Storage and localStorage are now empty
      const afterDel = unwrap(await port.load(attempt));
      assert.equal(afterDel, null);
      assert.equal(mockLs.getItem('cunata:active_attempt:exam:v1'), null);
    });

    it('exportBackup exports a valid StorageBackupPayload Blob and retains data', async () => {
      MemoryBroadcastChannel.clearAllBuses();
      const adapter = new MemoryTransactionAdapter();
      const port = createStoragePort(adapter);

      const attempt = createMockAttempt('att-bk-01');
      unwrap(await port.create(attempt));
      unwrap(await port.finalize(attempt, 1));

      const blob = unwrap(await exportBackup(port));
      assert.equal(blob.type, 'application/json');

      const text = await blob.text();
      const parsed = JSON.parse(text);
      assert.equal(parsed.schemaVersion, 'cunata-backup-v1');
      assert.equal(parsed.attempts.length, 1);
      assert.equal(parsed.attempts[0].attemptId, 'att-bk-01');
      assert.equal(parsed.outbox.length, 1);
    });
  });
});
