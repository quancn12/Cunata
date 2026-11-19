// Local HTTP integration only: executes production Code.js on the shared Sheets simulator.
// These regressions stay red until the backend owner repairs storage fidelity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createAppsScriptCollectorPort } from '../../src/collect/appsScript.ts';
import { scoreAttempt, scoreResultToDTO } from '../../src/domain/index.ts';
import { startGasServer } from '../claude-check/gas-server.mjs';
import { makeExam } from '../claude-check/app.mjs';

function finalRecord(exam, extra = {}) {
  const attemptId = 'local-storage-regression';
  const responses = { attemptId, examVersionId: exam.examVersionId,
    responses: exam.questions.map(q => ({ kind: 'I', questionVersionId: q.questionVersionId,
      selectedOptionId: q.correctOptionId })) };
  const score = scoreAttempt(exam, responses);
  return { schemaVersion: 'web-attempt-v1', examId: exam.examId, examVersionId: exam.examVersionId,
    attemptId, revision: 1, candidateName: 'Học sinh thử nghiệm', examSnapshot: exam,
    presentationOrder: { seed: 'local-regression', questionOrder: exam.questions.map(q => q.questionVersionId),
      optionOrder: exam.questions.map(q => ({ questionVersionId: q.questionVersionId,
        optionIds: q.options.map(option => option.optionId) })) },
    responses, startedAt: Date.now() - 60000, deadline: Date.now() + 600000,
    phase: 'final', submittedAt: Date.now(), scoreDTO: scoreResultToDTO(score), ...extra };
}

async function withServer(run, numericCode = false) {
  let context;
  const original = vm.runInContext;
  vm.runInContext = function(source, sandbox, options) {
    if (options?.filename === 'apps-script/Code.js') context = sandbox;
    return original.call(this, source, sandbox, options);
  };
  let server;
  try { server = await startGasServer(); } finally { vm.runInContext = original; }
  try {
    const admin = server.gas.post({ action: 'adminLogin', password: server.adminPassword });
    assert.equal(admin.success, true);
    assert.equal(server.gas.post({ action: 'adminCreateTeacher', token: admin.token,
      username: 'local.teacher', name: 'Giáo viên thử nghiệm', password: 'Local-Teacher-123' }).success, true);
    const teacher = server.gas.post({ action: 'teacherLogin', username: 'local.teacher', password: 'Local-Teacher-123' });
    assert.equal(teacher.success, true);
    if (numericCode) context.Utilities.getUuid = () => '18181818-1818-4818-9818-181818181818';
    await run(server, teacher.token);
  } finally { await server.close(); }
}

async function send(server, final) {
  let receipt, failure;
  try { receipt = await createAppsScriptCollectorPort(server.url).send(final, AbortSignal.timeout(10000)); }
  catch (error) { failure = error; }
  const post = server.log.find(entry => entry.method === 'POST');
  assert.ok(post);
  const payload = JSON.parse(post.body);
  assert.equal(payload.candidate_display, final.candidateName, 'transport preserves literal name');
  assert.deepEqual(payload.responses, final.responses, 'transport preserves every answer');
  if (failure) throw failure;
  assert.equal(receipt.status, 'recorded');
  return payload;
}

test('round53: confirmed backend result preserves a leading apostrophe', { timeout: 20000 }, async () => {
  await withServer(async server => {
    const exam = makeExam({ part1: ['a'], part2: [], part3: [] });
    const final = finalRecord(exam, { candidateName: "'Nguyễn An" });
    await send(server, final);
    assert.equal(server.gas.sheets.get('KetQua').rows[1][3], final.candidateName,
      'Code.js must store the literal name after acknowledging the unchanged transport payload');
  });
});

test('round53: backend accepts supported responses exceeding one Sheet cell', { timeout: 20000 }, async () => {
  await withServer(async server => {
    const exam = makeExam({ part1: Array(60).fill('a'), part2: [], part3: [] });
    exam.questions.forEach((q, i) => {
      q.questionVersionId = 'q-' + 'x'.repeat(850) + '-' + i;
      q.options[0].optionId = q.questionVersionId + '-a';
      q.correctOptionId = q.options[0].optionId;
    });
    const final = finalRecord(exam);
    assert.ok(JSON.stringify(final.responses).length > 50000);
    await send(server, final);
  });
});

test('round53: numeric class result is returned to its teacher', { timeout: 20000 }, async () => {
  await withServer(async (server, token) => {
    const cls = server.gas.post({ action: 'createClass', token, name: 'Lớp thử nghiệm' });
    assert.equal(cls.success, true);
    assert.equal(cls.code, '222222');
    const exam = makeExam({ part1: ['a'], part2: [], part3: [] });
    assert.equal(server.gas.post({ action: 'publishExam', token, exam }).success, true);
    const assignment = server.gas.post({ action: 'assignExam', token, classId: cls.classId,
      examId: exam.examId, openAt: new Date(Date.now() - 60000).toISOString(),
      dueAt: new Date(Date.now() + 600000).toISOString() });
    assert.equal(assignment.success, true);
    const payload = await send(server, finalRecord(exam, { class_code: cls.code, assignment_id: assignment.assignmentId }));
    assert.equal(payload.class_code, '222222');
    const results = server.gas.post({ action: 'listResults', token, classId: cls.classId });
    assert.equal(results.success, true);
    assert.equal(results.results.length, 1, 'Code.js must find the confirmed numeric-class result');
  }, true);
});
