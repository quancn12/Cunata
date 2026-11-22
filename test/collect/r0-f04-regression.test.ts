import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptCollectorPort } from '../../src/collect/index.ts';
import type { AttemptRecord } from '../../src/schema/types.ts';

test('R0-F04 regression: collector must not borrow another exam active assignment from storage', async () => {
  const values = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, val: string) => { values.set(key, String(val)); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => { values.clear(); },
  };

  const origSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const origLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: mockStorage });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mockStorage });

  // Simulate unrelated assignment in session storage
  values.set('cunata:active_assignment', JSON.stringify({
    examId: 'unrelated-exam-b',
    classCode: 'ABCDEF',
    assignmentId: 'other-assignment-123',
    openAt: '2026-11-20T00:00:00.000Z',
    dueAt: '2026-11-25T00:00:00.000Z',
  }));

  let capturedBody: any = null;
  const mockFetch = async (_url: string | URL | Request, init?: RequestInit) => {
    if (init && typeof init.body === 'string') {
      try {
        capturedBody = JSON.parse(init.body);
      } catch {
        capturedBody = init.body;
      }
    }
    return new Response(JSON.stringify({ ok: true, submissionId: 'sub-test-1', status: 'recorded' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const port = createAppsScriptCollectorPort(
    'https://script.google.com/macros/s/test/exec',
    mockFetch as any
  );

  // Attempt for standalone exam without class/assignment metadata
  const standaloneFinal: AttemptRecord = {
    schemaVersion: 'web-attempt-v1',
    examId: 'r0-offline-original',
    examVersionId: 'v1.0.0',
    attemptId: 'att-stand-1',
    revision: 1,
    candidateName: 'Thí sinh tự do',
    startedAt: 1700000000000,
    deadline: 1700003000000,
    phase: 'final',
    submittedAt: 1700001500000,
    presentationOrder: { seed: 'seed-123', questionOrder: ['q1'], optionOrder: [] },
    responses: { q1: 'opt-a' } as any,
    scoreDTO: null,
    examSnapshot: {
      schemaVersion: 'web-exam-v1',
      examId: 'r0-offline-original',
      examVersionId: 'v1.0.0',
      title: 'Đề luyện tập tự do',
      subject: 'Toán',
      grade: 12,
      ruleSetId: 'custom-v1',
      inputPolicyId: 'sa-charset-v1',
      settings: {
        durationMinutes: 50,
        maxAttempts: null,
        releasePolicy: 'immediate',
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      assets: [],
      questions: [
        {
          kind: 'I',
          questionVersionId: 'q1',
          title: 'Câu 1',
          content: 'Nội dung',
          correctOptionId: 'opt-a',
          options: [{ optionId: 'opt-a', text: 'Đúng' }],
        },
      ],
    },
  };

  try {
    await port.send(standaloneFinal, new AbortController().signal);
    assert.ok(capturedBody, 'Fetch should have captured request payload');
    assert.equal(capturedBody.exam_id, 'r0-offline-original');
    assert.equal(capturedBody.class_code, undefined, 'Must NOT borrow class_code from unrelated assignment');
    assert.equal(capturedBody.assignment_id, undefined, 'Must NOT borrow assignment_id from unrelated assignment');
  } finally {
    if (origSession) Object.defineProperty(globalThis, 'sessionStorage', origSession);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
    if (origLocal) Object.defineProperty(globalThis, 'localStorage', origLocal);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
