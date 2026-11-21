import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, createMemoryStore, MemoryStore, NeonStore } from '../../src/api/index.ts';
import type { RequestContext, CatalogExam, ResultRecord } from '../../src/api/types.ts';

const ADMIN_PASS = 'TestAdminPass123';
const EPOCH = Date.parse('2026-11-20T08:00:00Z');

function createTestCtx(overrides: Partial<RequestContext> = {}) {
  const store = (overrides.store as MemoryStore) ?? createMemoryStore();
  let time = EPOCH;
  const catalog: CatalogExam[] = [
    {
      id: 'static-de10',
      title: 'Đề thi Vật lí 12 — Đề 10',
      subject: 'Vật lí',
      grade: 12,
      durationMinutes: 50,
      questionCount: 40,
      group: 'Đề luyện tập',
    },
  ];
  const ctx: RequestContext = {
    store,
    now: () => time,
    adminPassword: ADMIN_PASS,
    env: { ADMIN_PASSWORD: ADMIN_PASS },
    catalog,
    ...overrides,
  };
  return {
    ctx,
    store,
    setTime: (t: number) => {
      time = t;
    },
  };
}

function makeSampleExam(id: string, title = 'Đề thi mẫu') {
  return {
    schemaVersion: 'web-exam-v1',
    examId: id,
    title,
    subject: 'Vật lí',
    grade: 12,
    durationMinutes: 15,
    questions: [
      {
        questionVersionId: 'q1-v1',
        kind: 'I',
        options: [
          { optionId: 'opt-a', text: 'A' },
          { optionId: 'opt-b', text: 'B' },
          { optionId: 'opt-c', text: 'C' },
          { optionId: 'opt-d', text: 'D' },
        ],
        correctOptionId: 'opt-a',
      },
      {
        questionVersionId: 'q2-v1',
        kind: 'II',
        statements: [
          { statementId: 's1', answer: true },
          { statementId: 's2', answer: false },
          { statementId: 's3', answer: true },
          { statementId: 's4', answer: false },
        ],
      },
      {
        questionVersionId: 'q3-v1',
        kind: 'III',
        answerKey: '1,5',
      },
    ],
  };
}

function makeValidSubmission(attemptId: string, overrides: Record<string, unknown> = {}) {
  return {
    action: 'submitResult',
    attempt_id: attemptId,
    exam_id: 'exam-sample',
    exam_version_id: 'v1',
    candidate_display: 'Thí sinh A',
    policy_version: 'custom-v1',
    score_p1: '1/4',
    max_p1: '1/4',
    score_p2: '1',
    max_p2: '1',
    score_p3: '1/2',
    max_p3: '1/2',
    total: '7/4',
    maxTotal: '7/4',
    raw_answers_json: JSON.stringify({ q1: 'opt-a', q2: [true, false, true, false], q3: '1,5' }),
    ...overrides,
  };
}

async function createTeacher(ctx: RequestContext, username: string, name: string) {
  const adminLogin = await handle(
    { method: 'POST', body: { action: 'adminLogin', password: ADMIN_PASS } },
    ctx
  );
  const adminToken = adminLogin.body.token as string;

  await handle(
    {
      method: 'POST',
      body: {
        action: 'adminCreateTeacher',
        token: adminToken,
        username,
        name,
        password: 'TeacherPassword123',
      },
    },
    ctx
  );

  const loginRes = await handle(
    {
      method: 'POST',
      body: {
        action: 'teacherLogin',
        username,
        password: 'TeacherPassword123',
      },
    },
    ctx
  );
  return {
    token: loginRes.body.token as string,
    adminToken,
  };
}

test('R1-F01: publish đồng thời không ghi đè đề của giáo viên khác; tăng revision nguyên tử', async () => {
  const { ctx, store } = createTestCtx();
  const alice = await createTeacher(ctx, 'alice', 'Cô Alice');
  const bob = await createTeacher(ctx, 'bob', 'Thầy Bob');

  const examAlice = makeSampleExam('shared-exam-1', 'Đề của Alice');
  const examBob = makeSampleExam('shared-exam-1', 'Đề của Bob');

  // Alice publishes first
  const res1 = await handle(
    { method: 'POST', body: { action: 'publishExam', token: alice.token, exam: examAlice } },
    ctx
  );
  assert.equal(res1.body.success, true);
  assert.equal(res1.body.revision, 1);

  // Bob tries to publish with same examId -> FORBIDDEN
  const res2 = await handle(
    { method: 'POST', body: { action: 'publishExam', token: bob.token, exam: examBob } },
    ctx
  );
  assert.equal(res2.body.success, false);
  assert.equal(res2.body.error, 'FORBIDDEN');

  // Verify stored exam is still Alice's
  const stored = await store.getExam('shared-exam-1');
  assert.equal(stored?.owner, 'alice');
  assert.equal(stored?.title, 'Đề của Alice');

  // Alice republishes -> revision increments
  const res3 = await handle(
    { method: 'POST', body: { action: 'publishExam', token: alice.token, exam: { ...examAlice, title: 'Đề của Alice v2' } } },
    ctx
  );
  assert.equal(res3.body.success, true);
  assert.equal(res3.body.revision, 2);
  const stored2 = await store.getExam('shared-exam-1');
  assert.equal(stored2?.revision, 2);
  assert.equal(stored2?.title, 'Đề của Alice v2');
});

test('R1-F02: không gộp request chung receipt; mỗi request được validate độc lập', async () => {
  const { ctx } = createTestCtx();
  const valid = makeValidSubmission('attempt-f02');
  const invalid = { ...valid, total: 'invalid_score' };

  const [resValid, resInvalid] = await Promise.all([
    handle({ method: 'POST', body: valid }, ctx),
    handle({ method: 'POST', body: invalid }, ctx),
  ]);

  assert.equal(resValid.body.success, true);
  assert.equal(resValid.body.status, 'NEWLY_RECORDED');

  assert.equal(resInvalid.body.success, false);
  assert.equal(resInvalid.body.error, 'INVALID_SCORE');
});

test('R1-F03: hai worker nộp đồng thời; chỉ một NEWLY_RECORDED, worker sau nhận ALREADY_RECORDED hoặc PAYLOAD_CONFLICT', async () => {
  const store = createMemoryStore();
  const { ctx: ctx1 } = createTestCtx({ store });
  const { ctx: ctx2 } = createTestCtx({ store });

  const p1 = makeValidSubmission('attempt-f03-same');
  const [r1, r2] = await Promise.all([
    handle({ method: 'POST', body: p1 }, ctx1),
    handle({ method: 'POST', body: p1 }, ctx2),
  ]);

  assert.equal(r1.body.success, true);
  assert.equal(r2.body.success, true);
  const statuses = [r1.body.status, r2.body.status].sort();
  assert.deepEqual(statuses, ['ALREADY_RECORDED', 'NEWLY_RECORDED']);

  // Different payload racing on same attemptId
  const pA = makeValidSubmission('attempt-f03-diff', { candidate_display: 'Alice' });
  const pB = makeValidSubmission('attempt-f03-diff', { candidate_display: 'Bob' });
  const [rA, rB] = await Promise.all([
    handle({ method: 'POST', body: pA }, ctx1),
    handle({ method: 'POST', body: pB }, ctx2),
  ]);

  const outcomes = [
    { ok: rA.body.success, status: rA.body.status, error: rA.body.error },
    { ok: rB.body.success, status: rB.body.status, error: rB.body.error },
  ];
  const winner = outcomes.find(o => o.status === 'NEWLY_RECORDED');
  const loser = outcomes.find(o => o.error === 'PAYLOAD_CONFLICT');
  assert.ok(winner, 'Phải có 1 request ghi nhận thành công');
  assert.ok(loser, 'Request tranh chấp nội dung khác phải nhận PAYLOAD_CONFLICT');
});

test('R1-F04: retry đổi đáp án hoặc policy bị PAYLOAD_CONFLICT; đổi thứ tự key JSON thì vẫn ALREADY_RECORDED', async () => {
  const { ctx } = createTestCtx();
  const base = makeValidSubmission('attempt-f04', {
    raw_answers_json: JSON.stringify({ a: '1', b: '2' }),
    policy_version: 'custom-v1',
  });

  const first = await handle({ method: 'POST', body: base }, ctx);
  assert.equal(first.body.success, true);
  assert.equal(first.body.status, 'NEWLY_RECORDED');

  // Retry with different answers -> PAYLOAD_CONFLICT
  const diffAnswers = { ...base, raw_answers_json: JSON.stringify({ a: '2', b: '2' }) };
  const resDiff = await handle({ method: 'POST', body: diffAnswers }, ctx);
  assert.equal(resDiff.body.success, false);
  assert.equal(resDiff.body.error, 'PAYLOAD_CONFLICT');

  // Retry with different policy -> PAYLOAD_CONFLICT
  const diffPolicy = { ...base, policy_version: 'custom-v2' };
  const resPolicy = await handle({ method: 'POST', body: diffPolicy }, ctx);
  assert.equal(resPolicy.body.success, false);
  assert.equal(resPolicy.body.error, 'PAYLOAD_CONFLICT');

  // Retry with same answers but reordered keys -> ALREADY_RECORDED (no conflict)
  const reorderedAnswers = { ...base, raw_answers_json: JSON.stringify({ b: '2', a: '1' }) };
  const resReorder = await handle({ method: 'POST', body: reorderedAnswers }, ctx);
  assert.equal(resReorder.body.success, true);
  assert.equal(resReorder.body.status, 'ALREADY_RECORDED');
});

test('R1-F05: retry bài đã nhận sau hạn nộp trả ALREADY_RECORDED; bài mới sau hạn bị PAST_DUE', async () => {
  const { ctx, setTime } = createTestCtx();
  const teacher = await createTeacher(ctx, 'gv_f05', 'Giáo viên F05');

  const clsRes = await handle(
    { method: 'POST', body: { action: 'createClass', token: teacher.token, name: 'Lớp F05' } },
    ctx
  );
  const classCode = clsRes.body.code as string;
  const classId = clsRes.body.classId as string;

  const openAt = new Date(EPOCH - 60000).toISOString();
  const dueAt = new Date(EPOCH + 60000).toISOString();
  const assignRes = await handle(
    {
      method: 'POST',
      body: {
        action: 'assignExam',
        token: teacher.token,
        classId,
        examId: 'exam-sample',
        openAt,
        dueAt,
      },
    },
    ctx
  );
  const assignmentId = assignRes.body.assignmentId as string;

  // Submit on time at EPOCH
  const p = makeValidSubmission('attempt-f05', {
    class_code: classCode,
    assignment_id: assignmentId,
  });
  const sub1 = await handle({ method: 'POST', body: p }, ctx);
  assert.equal(sub1.body.success, true);
  assert.equal(sub1.body.status, 'NEWLY_RECORDED');
  const recordedAt = sub1.body.recorded_at;

  // Advance clock way past dueAt + 2 minutes
  setTime(EPOCH + 300000); // 5 minutes after due date

  // Retry of the recorded submission must receive ALREADY_RECORDED with original recorded_at
  const subRetry = await handle({ method: 'POST', body: p }, ctx);
  assert.equal(subRetry.body.success, true);
  assert.equal(subRetry.body.status, 'ALREADY_RECORDED');
  assert.equal(subRetry.body.recorded_at, recordedAt);

  // But a genuinely new attempt submitted past deadline gets PAST_DUE
  const pNew = makeValidSubmission('attempt-f05-late', {
    class_code: classCode,
    assignment_id: assignmentId,
  });
  const subLate = await handle({ method: 'POST', body: pNew }, ctx);
  assert.equal(subLate.body.success, false);
  assert.equal(subLate.body.error, 'PAST_DUE');
});

test('R1-F06: Neon SQL cập nhật đầy đủ metadata (subject, grade, duration, questionCount, group)', async () => {
  const executedSqls: Array<{ query: string; params: unknown[] }> = [];
  const fakeRows: any[] = [];

  const fakeFetch: typeof fetch = async (url, init) => {
    const body = JSON.parse(init?.body as string);
    executedSqls.push(body);
    const q = body.query as string;
    if (q.includes('CREATE TABLE') || q.includes('ALTER TABLE')) {
      return new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (q.includes('INSERT INTO exams')) {
      const row = {
        id: body.params[0],
        title: body.params[1],
        subject: body.params[2],
        grade: body.params[3],
        duration_minutes: body.params[4],
        question_count: body.params[5],
        group: body.params[6],
        revision: 2,
        updated_at: body.params[8],
        owner: body.params[9],
        exam_json: body.params[10],
      };
      fakeRows.length = 0;
      fakeRows.push(row);
      return new Response(JSON.stringify({ rows: [{ revision: 2, owner: body.params[9] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (q.includes('SELECT') && q.includes('FROM exams')) {
      return new Response(JSON.stringify({ rows: fakeRows }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const store = new NeonStore({
    connectionString: 'postgresql://u:p@fixture.neon.tech/db',
    fetch: fakeFetch,
  });

  await store.saveExam({
    id: 'exam-neon-meta',
    title: 'Đề Toán 11 Mới',
    subject: 'Toán',
    grade: 11,
    durationMinutes: 30,
    questionCount: 4,
    group: 'Nhóm Mới',
    revision: 2,
    updatedAt: new Date(EPOCH).toISOString(),
    owner: 'alice',
    examJson: '{}',
  });

  const insertSql = executedSqls.find(s => s.query.includes('INSERT INTO exams'));
  assert.ok(insertSql, 'Phải phát câu lệnh INSERT INTO exams');
  assert.match(insertSql.query, /subject\s*=\s*EXCLUDED\.subject/i, 'Phải cập nhật subject');
  assert.match(insertSql.query, /grade\s*=\s*EXCLUDED\.grade/i, 'Phải cập nhật grade');
  assert.match(insertSql.query, /duration_minutes\s*=\s*EXCLUDED\.duration_minutes/i, 'Phải cập nhật duration_minutes');
  assert.match(insertSql.query, /question_count\s*=\s*EXCLUDED\.question_count/i, 'Phải cập nhật question_count');
  assert.match(insertSql.query, /"group"\s*=\s*EXCLUDED\."group"/i, 'Phải cập nhật group');
  assert.match(insertSql.query, /WHERE\s+exams\.owner\s*=\s*EXCLUDED\.owner/i, 'Phải kiểm tra owner trong UPSERT');
});

test('R1-F07: reset mật khẩu hoặc khóa tài khoản vô hiệu hóa phiên tạo từ mật khẩu cũ (authGen)', async () => {
  const { ctx } = createTestCtx();
  const teacher = await createTeacher(ctx, 'gv_f07', 'Giáo viên F07');

  // Verify active session works
  const clsBefore = await handle(
    { method: 'POST', body: { action: 'listMyClasses', token: teacher.token } },
    ctx
  );
  assert.equal(clsBefore.body.success, true);

  // Admin resets teacher's password
  const resetRes = await handle(
    {
      method: 'POST',
      body: {
        action: 'adminResetPassword',
        token: teacher.adminToken,
        username: 'gv_f07',
        password: 'NewPassword456',
      },
    },
    ctx
  );
  assert.equal(resetRes.body.success, true);

  // Old session token is now UNAUTHORIZED
  const clsAfter = await handle(
    { method: 'POST', body: { action: 'listMyClasses', token: teacher.token } },
    ctx
  );
  assert.equal(clsAfter.body.success, false);
  assert.equal(clsAfter.body.error, 'UNAUTHORIZED');

  // Teacher logs in with new password -> works
  const newLogin = await handle(
    {
      method: 'POST',
      body: {
        action: 'teacherLogin',
        username: 'gv_f07',
        password: 'NewPassword456',
      },
    },
    ctx
  );
  assert.equal(newLogin.body.success, true);
  const newToken = newLogin.body.token as string;

  const clsNew = await handle(
    { method: 'POST', body: { action: 'listMyClasses', token: newToken } },
    ctx
  );
  assert.equal(clsNew.body.success, true);

  // Admin locks teacher -> new session also invalidated
  await handle(
    {
      method: 'POST',
      body: {
        action: 'adminSetTeacherActive',
        token: teacher.adminToken,
        username: 'gv_f07',
        active: false,
      },
    },
    ctx
  );
  const clsLocked = await handle(
    { method: 'POST', body: { action: 'listMyClasses', token: newToken } },
    ctx
  );
  assert.equal(clsLocked.body.success, false);
  assert.equal(clsLocked.body.error, 'UNAUTHORIZED');
});

test('R1-F08: listAssignments trả submissionCount phản ánh số bài đã nộp đúng assignmentId; getClass không lộ', async () => {
  const { ctx } = createTestCtx();
  const teacher = await createTeacher(ctx, 'gv_f08', 'Giáo viên F08');

  const clsRes = await handle(
    { method: 'POST', body: { action: 'createClass', token: teacher.token, name: 'Lớp F08' } },
    ctx
  );
  const classCode = clsRes.body.code as string;
  const classId = clsRes.body.classId as string;

  // Create 2 assignments
  const a1 = await handle(
    {
      method: 'POST',
      body: {
        action: 'assignExam',
        token: teacher.token,
        classId,
        examId: 'exam-1',
        openAt: new Date(EPOCH - 60000).toISOString(),
        dueAt: new Date(EPOCH + 3600000).toISOString(),
      },
    },
    ctx
  );
  const assignmentId1 = a1.body.assignmentId as string;

  const a2 = await handle(
    {
      method: 'POST',
      body: {
        action: 'assignExam',
        token: teacher.token,
        classId,
        examId: 'exam-2',
        openAt: new Date(EPOCH - 60000).toISOString(),
        dueAt: new Date(EPOCH + 3600000).toISOString(),
      },
    },
    ctx
  );
  const assignmentId2 = a2.body.assignmentId as string;

  // Initial list: 0 submissions for both
  const list0 = await handle(
    { method: 'POST', body: { action: 'listAssignments', token: teacher.token, classId } },
    ctx
  );
  assert.equal(list0.body.success, true);
  const assignments0 = list0.body.assignments as any[];
  assert.equal(assignments0.find(a => a.assignmentId === assignmentId1)?.submissionCount, 0);
  assert.equal(assignments0.find(a => a.assignmentId === assignmentId2)?.submissionCount, 0);

  // Submit 1 result for assignment 1
  const sub1 = makeValidSubmission('attempt-f08-sub1', {
    exam_id: 'exam-1',
    class_code: classCode,
    assignment_id: assignmentId1,
  });
  await handle({ method: 'POST', body: sub1 }, ctx);

  // List again: assignment 1 has 1, assignment 2 has 0
  const list1 = await handle(
    { method: 'POST', body: { action: 'listAssignments', token: teacher.token, classId } },
    ctx
  );
  const assignments1 = list1.body.assignments as any[];
  assert.equal(assignments1.find(a => a.assignmentId === assignmentId1)?.submissionCount, 1);
  assert.equal(assignments1.find(a => a.assignmentId === assignmentId2)?.submissionCount, 0);

  // Retry same attempt: submissionCount remains 1 (idempotent, does not increment)
  await handle({ method: 'POST', body: sub1 }, ctx);
  const listRetry = await handle(
    { method: 'POST', body: { action: 'listAssignments', token: teacher.token, classId } },
    ctx
  );
  const assignmentsRetry = listRetry.body.assignments as any[];
  assert.equal(assignmentsRetry.find(a => a.assignmentId === assignmentId1)?.submissionCount, 1);

  // Public getClass must NOT expose submissionCount
  const publicCls = await handle(
    { method: 'GET', query: { action: 'getClass', code: classCode } },
    ctx
  );
  assert.equal(publicCls.body.success, true);
  const publicAssignments = publicCls.body.assignments as any[];
  assert.equal(publicAssignments[0].submissionCount, undefined, 'getClass công khai không được chứa submissionCount');
});
