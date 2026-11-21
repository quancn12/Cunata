import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountStudentArea } from '../../src/student/area.ts';
import { createEnhancedMockDocument } from './view/testDom.ts';

test('assignment with missing duration uses catalog duration in card and preview', async () => {
  const doc = createEnhancedMockDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    exams: [{ id: 'short-exam', title: 'Đề tùy chỉnh', subject: 'Hóa học',
      durationMinutes: 15, questionCount: 3, url: 'public/exams/short.json' }],
  }));
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  const ctrl = mountStudentArea(root as unknown as HTMLElement, {
    now: () => 1700000000000,
    client: {
      configured: true,
      listExams: async () => ({ ok: true, value: [] }),
      getClass: async () => ({ ok: true, value: {
        class: { code: 'ABCDEF', name: 'Lớp thử', teacherName: 'Giáo viên' },
        assignments: [{ assignmentId: 'assignment', examId: 'short-exam',
          title: 'Đề tùy chỉnh', questionCount: 3, durationMinutes: null,
          openAt: '2023-01-01T00:00:00Z', dueAt: '' }],
      } }),
    } as any,
  });
  try {
    ctrl.setCandidateName('Học sinh thử');
    await ctrl.refreshList();
    assert.equal(await ctrl.joinClass('ABCDEF'), true);
    const card = root.querySelector('#myClasses .exam-card');
    assert.ok(card);
    assert.match(card.textContent, /15 phút/);
    card.click();
    const preview = root.querySelector('#examPreview');
    assert.ok(preview);
    assert.match(preview.textContent, /15 phút/);
    assert.equal(/cấu trúc tốt nghiệp THPT/i.test(preview.textContent), false);
    assert.equal(JSON.parse(values.get('cunata:classes')!)[0].assignments[0].durationMinutes, null);
  } finally {
    ctrl.dispose();
    globalThis.fetch = previousFetch;
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('assignment with empty dueAt (Không hạn nộp) allows startAttempt far in future without PAST_DUE', async () => {
  const { startAttempt } = await import('../../src/student/index.ts');
  const { InMemoryStoragePort } = await import('./core/inMemoryStorage.ts');
  const storage = new InMemoryStoragePort();
  let clockTime = 1700000000000;
  const deps = { storage, now: () => clockTime, id: () => 'att-nodue-1' };

  const exam = {
    schemaVersion: 'web-exam-v1' as const,
    examId: 'exam-no-due',
    examVersionId: 'v1.0.0',
    title: 'Đề không hạn nộp',
    subject: 'Toán',
    grade: 12 as const,
    ruleSetId: 'custom-v1' as const,
    inputPolicyId: 'sa-charset-v1' as const,
    settings: {
      durationMinutes: 45,
      maxAttempts: null,
      releasePolicy: 'immediate' as const,
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    assets: [],
    questions: [
      {
        kind: 'I' as const,
        questionVersionId: 'q-no-due-1',
        title: 'Câu 1',
        correctOptionId: 'opt-a',
        options: [
          { optionId: 'opt-a', text: 'Đúng' },
          { optionId: 'opt-b', text: 'Sai' },
          { optionId: 'opt-c', text: 'Không rõ' },
          { optionId: 'opt-d', text: 'Khác' },
        ],
      },
    ],
  };

  // Advance clock by 30 days BEFORE starting: assignment without due date can be started anytime in future
  clockTime += 30 * 24 * 3600 * 1000;

  // Start attempt with empty string dueAt (Không hạn nộp) 30 days into the future
  const res = await startAttempt(exam, 'Học sinh An', deps, {
    assignmentId: 'asg-nodue-1',
    classCode: 'LOP12',
    openAt: '2023-01-01T00:00:00.000Z',
    dueAt: '', // Empty string = Không hạn nộp
  });

  assert.equal(res.ok, true, 'Assignment with dueAt="" must start successfully in future');
  if (!res.ok) return;

  const controller = res.value;
  const snap = controller.getSnapshot();
  assert.equal(snap.dueAt, '', 'Snapshot must preserve dueAt as empty string');
  assert.equal(snap.assignmentId, 'asg-nodue-1');
  assert.equal(snap.classCode, 'LOP12');

  // Answer 1 minute after starting (within 45-minute duration)
  clockTime += 60 * 1000;
  const ansRes = await controller.answer({
    kind: 'I',
    questionVersionId: 'q-no-due-1',
    selectedOptionId: 'opt-a',
  });
  assert.equal(ansRes.ok, true, 'Answering must succeed within exam duration');

  const subRes = await controller.submit('manual');
  assert.equal(subRes.ok, true, 'Submitting must succeed for assignment without due date');
  if (subRes.ok) {
    assert.equal(subRes.value.phase, 'final');
    assert.equal(subRes.value.dueAt, '');
  }
});

test('StudentArea candidateName trims edge whitespace and preserves internal spacing', () => {
  const doc = createEnhancedMockDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);

  const ctrl = mountStudentArea(root as unknown as HTMLElement, {
    now: () => 1700000000000,
  });

  ctrl.setCandidateName('   Trần   Văn   Bình   ');
  assert.equal(ctrl.getCandidateName(), 'Trần   Văn   Bình', 'Leading and trailing whitespace should be trimmed');

  ctrl.dispose();
});
