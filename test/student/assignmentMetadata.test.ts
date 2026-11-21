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
