import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAppConfig, resolveBackend, createAppsScriptClient, createAppsScriptCollectorPort } from '../../src/collect/appsScript.ts';
import type { AttemptRecord } from '../../src/schema/types.ts';

test('apiBase-only config enables JSON transport and takes priority over legacy config', async () => {
  for (const appsScriptUrl of [undefined, '/legacy']) {
    const config = await loadAppConfig((async (url, init) => {
      assert.equal(url, 'public/config.json');
      assert.equal(init?.cache, 'no-store');
      return Response.json({ apiBase: ' /api/rpc ', appsScriptUrl });
    }) as typeof fetch);
    assert.deepEqual(resolveBackend(config), { url: '/api/rpc', contentType: 'application/json' });
  }
  assert.deepEqual(resolveBackend({ apiBase: ' ', appsScriptUrl: '/legacy' }), {
    url: '/legacy', contentType: 'text/plain;charset=utf-8',
  });
});

test('JSON backend keeps public reads and sends teacher, admin and publish actions as JSON', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json({ success: true, exams: [], token: 'session', name: 'Teacher', examId: 'exam', revision: 2 });
  }) as typeof fetch;
  const client = createAppsScriptClient('/api/rpc', fetchImpl, 'application/json');
  assert.equal((await client.listExams()).ok, true);
  assert.equal((await client.teacherLogin('teacher', 'password')).ok, true);
  assert.equal((await client.adminLogin('password')).ok, true);
  assert.equal((await client.publishExam('session', { examId: 'exam' })).ok, true);
  assert.match(requests[0]!.url, /action=listExams/);
  assert.equal(requests[0]!.init?.method, 'GET');
  assert.deepEqual(requests.slice(1).map(({ init }) => {
    assert.ok(init);
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init.headers).get('Content-Type'), 'application/json');
    return JSON.parse(String(init.body)).action;
  }), ['teacherLogin', 'adminLogin', 'publishExam']);
});

test('result collector uses JSON transport without changing final answers or assignment metadata', async () => {
  const final: AttemptRecord = {
    schemaVersion: 'web-attempt-v1', examId: 'exam', examVersionId: 'v1', attemptId: 'attempt',
    revision: 1, phase: 'final', candidateName: "'Nguyễn An", startedAt: 1000, deadline: 61000, submittedAt: 2000,
    examSnapshot: {
      schemaVersion: 'web-exam-v1', examId: 'exam', examVersionId: 'v1', ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1',
      title: 'Exam', subject: 'Vật lí', grade: 12, assets: [],
      settings: { durationMinutes: 1, maxAttempts: null, releasePolicy: 'immediate', shuffleQuestions: false, shuffleOptions: false },
      questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1,50' }],
    },
    presentationOrder: { seed: 'seed', questionOrder: ['q'], optionOrder: [] },
    responses: { attemptId: 'attempt', examVersionId: 'v1', responses: [{ kind: 'III', questionVersionId: 'q', raw: '1,50' }] },
    scoreDTO: null, class_code: 'ABCDEF', assignment_id: 'assigned',
  };
  const collector = createAppsScriptCollectorPort('/api/rpc', (async (url, init) => {
    assert.equal(url, '/api/rpc');
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.action, 'submitResult');
    assert.equal(payload.class_code, 'ABCDEF');
    assert.equal(payload.assignment_id, 'assigned');
    assert.equal(payload.candidate_display, final.candidateName);
    assert.deepEqual(payload.responses, final.responses);
    return Response.json({ success: true, status: 'NEWLY_RECORDED' });
  }) as typeof fetch, 'application/json');
  await collector.send(final, new AbortController().signal);
});
