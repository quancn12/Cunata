import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, createMemoryStore, createNeonStore, MemoryStore } from '../../src/api/index.ts';
import { parseRational, ratCmp, ratAdd, toCanonicalStr } from '../../src/api/rational.ts';
import { hashPassword, verifyPassword, generateClassCode } from '../../src/api/auth.ts';
import { validatePublishedExam } from '../../src/api/examValidation.ts';
import type { RequestContext, ApiRequest, CatalogExam } from '../../src/api/types.ts';

const ADMIN_PASS = 'TestAdminPass123';
const EPOCH = Date.parse('2026-11-19T08:00:00Z');
const HOURS8 = 8 * 60 * 60 * 1000;

function createTestCtx(overrides: Partial<RequestContext> = {}): {
  ctx: RequestContext;
  store: MemoryStore;
  setTime: (t: number) => void;
} {
  const store = overrides.store as MemoryStore ?? createMemoryStore();
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

function makeSampleExam(id = 'exam-1') {
  return {
    schemaVersion: 'web-exam-v1',
    examId: id,
    title: 'Đề kiểm tra 15 phút',
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
          { statementId: 'st-a', text: 'Ý a', answer: true },
          { statementId: 'st-b', text: 'Ý b', answer: false },
          { statementId: 'st-c', text: 'Ý c', answer: true },
          { statementId: 'st-d', text: 'Ý d', answer: false },
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

test('Rational arithmetic: parsing, comparison, addition, canonical representation', () => {
  const r1 = parseRational('19/4');
  assert.ok(r1);
  assert.equal(r1.num, 19n);
  assert.equal(r1.den, 4n);

  const r2 = parseRational('10');
  assert.ok(r2);
  assert.equal(toCanonicalStr(r2), '10');

  const r3 = parseRational('1/2');
  const r4 = parseRational('3/4');
  assert.ok(r3 && r4);
  const sum = ratAdd(r3, r4);
  assert.equal(toCanonicalStr(sum), '5/4');
  assert.equal(ratCmp(r3, r4), -1);
  assert.equal(ratCmp(r4, r3), 1);
  assert.equal(ratCmp(r3, parseRational('2/4')!), 0);

  assert.equal(parseRational(''), null);
  assert.equal(parseRational('abc'), null);
  assert.equal(parseRational('5/0'), null);
  assert.equal(parseRational('1/2/3'), null);
});

test('Auth: scryptSync hashing and timing-safe verification', () => {
  const pass = 'TeacherSecret2026';
  const salt = 'randomSaltHex123';
  const hash = hashPassword(pass, salt);
  assert.equal(verifyPassword(pass, salt, hash), true);
  assert.equal(verifyPassword('WrongSecret', salt, hash), false);
  assert.equal(verifyPassword(pass, 'wrongSalt', hash), false);
});

test('Auth: class code generation', () => {
  const taken = new Set<string>();
  const code = generateClassCode(c => taken.has(c));
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
});

test('Exam Validation: reject invalid exam kinds and fields', () => {
  const valid = makeSampleExam();
  assert.deepEqual(validatePublishedExam(valid), []);

  const invalidTitle = { ...valid, title: '' };
  assert.ok(validatePublishedExam(invalidTitle).length > 0);

  const invalidI = JSON.parse(JSON.stringify(valid));
  invalidI.questions[0].options.pop();
  assert.ok(validatePublishedExam(invalidI).some(e => e.includes('đúng 4 phương án')));

  const invalidII = JSON.parse(JSON.stringify(valid));
  invalidII.questions[1].statements[0].answer = 'false';
  assert.ok(validatePublishedExam(invalidII).some(e => e.includes('boolean')));

  const invalidIII = JSON.parse(JSON.stringify(valid));
  invalidIII.questions[2].answerKey = '1.5';
  assert.ok(validatePublishedExam(invalidIII).some(e => e.includes('answerKey')));
});

test('Handle: admin login and teacher management lifecycle', async () => {
  const { ctx, setTime } = createTestCtx();

  // Admin Login
  const loginRes = await handle({ method: 'POST', body: { action: 'adminLogin', password: ADMIN_PASS } }, ctx);
  assert.equal(loginRes.body.success, true);
  const adminToken = loginRes.body.token as string;
  assert.ok(adminToken);

  // Admin stats initially
  const statsRes1 = await handle({ method: 'POST', body: { action: 'adminStats', token: adminToken } }, ctx);
  assert.equal(statsRes1.body.success, true);
  assert.equal((statsRes1.body.stats as any).teachers, 0);

  // Admin create teacher
  const createTRes = await handle(
    {
      method: 'POST',
      body: {
        action: 'adminCreateTeacher',
        token: adminToken,
        username: 'gv_lan',
        name: 'Cô Lan',
        password: 'Password123',
      },
    },
    ctx
  );
  assert.equal(createTRes.body.success, true);

  // Teacher list
  const listTRes = await handle({ method: 'POST', body: { action: 'adminListTeachers', token: adminToken } }, ctx);
  assert.equal(listTRes.body.success, true);
  const teachers = listTRes.body.teachers as any[];
  assert.equal(teachers.length, 1);
  assert.equal(teachers[0].username, 'gv_lan');
  assert.equal(teachers[0].name, 'Cô Lan');
  assert.equal(teachers[0].active, true);
  assert.equal(teachers[0].hash, undefined);
  assert.equal(teachers[0].salt, undefined);

  // Teacher login
  const tLoginRes = await handle(
    { method: 'POST', body: { action: 'teacherLogin', username: 'gv_lan', password: 'Password123' } },
    ctx
  );
  assert.equal(tLoginRes.body.success, true);
  const teacherToken = tLoginRes.body.token as string;
  assert.ok(teacherToken);

  // Create class
  const classRes = await handle(
    { method: 'POST', body: { action: 'createClass', token: teacherToken, name: '12A1' } },
    ctx
  );
  assert.equal(classRes.body.success, true);
  const classId = classRes.body.classId as string;
  const classCode = classRes.body.code as string;
  assert.ok(classId && classCode);

  // Publish exam
  const exam = makeSampleExam('exam-gv-1');
  const pubRes = await handle(
    { method: 'POST', body: { action: 'publishExam', token: teacherToken, exam } },
    ctx
  );
  assert.equal(pubRes.body.success, true);
  assert.equal(pubRes.body.revision, 1);

  // Assign exam
  const assignRes = await handle(
    {
      method: 'POST',
      body: {
        action: 'assignExam',
        token: teacherToken,
        classId,
        examId: 'exam-gv-1',
        openAt: new Date(EPOCH).toISOString(),
        dueAt: new Date(EPOCH + 3600000).toISOString(),
      },
    },
    ctx
  );
  assert.equal(assignRes.body.success, true);
  const assignmentId = assignRes.body.assignmentId as string;

  // Submit result for assignment
  const subRes = await handle(
    {
      method: 'POST',
      body: {
        attempt_id: 'att-1',
        exam_id: 'exam-gv-1',
        exam_version_id: 'v1.0.0',
        candidate_display: 'Nguyễn Văn A',
        class_code: classCode,
        assignment_id: assignmentId,
        total: '10',
        maxTotal: '10',
        sections: {
          I: { score: '2', max: '2' },
          II: { score: '4', max: '4' },
          III: { score: '4', max: '4' },
        },
      },
    },
    ctx
  );
  assert.equal(subRes.body.success, true);
  assert.equal(subRes.body.status, 'NEWLY_RECORDED');

  // Submit identical result -> ALREADY_RECORDED
  const retryRes = await handle(
    {
      method: 'POST',
      body: {
        attempt_id: 'att-1',
        exam_id: 'exam-gv-1',
        exam_version_id: 'v1.0.0',
        candidate_display: 'Nguyễn Văn A',
        class_code: classCode,
        assignment_id: assignmentId,
        total: '10',
        maxTotal: '10',
        sections: {
          I: { score: '2', max: '2' },
          II: { score: '4', max: '4' },
          III: { score: '4', max: '4' },
        },
      },
    },
    ctx
  );
  assert.equal(retryRes.body.success, true);
  assert.equal(retryRes.body.status, 'ALREADY_RECORDED');

  // Submit conflicting result -> PAYLOAD_CONFLICT
  const conflictRes = await handle(
    {
      method: 'POST',
      body: {
        attempt_id: 'att-1',
        exam_id: 'exam-gv-1',
        exam_version_id: 'v1.0.0',
        candidate_display: 'Người Khác',
        class_code: classCode,
        assignment_id: assignmentId,
        total: '10',
        maxTotal: '10',
        sections: {
          I: { score: '2', max: '2' },
          II: { score: '4', max: '4' },
          III: { score: '4', max: '4' },
        },
      },
    },
    ctx
  );
  assert.equal(conflictRes.body.success, false);
  assert.equal(conflictRes.body.error, 'PAYLOAD_CONFLICT');

  // Check 8-hour expiration
  setTime(EPOCH + HOURS8);
  const expiredRes = await handle(
    { method: 'POST', body: { action: 'listMyClasses', token: teacherToken } },
    ctx
  );
  assert.equal(expiredRes.body.success, false);
  assert.equal(expiredRes.body.error, 'UNAUTHORIZED');
});

test('Handle: Public GET actions and method restrictions', async () => {
  const { ctx } = createTestCtx();

  // GET listExams
  const listGet = await handle({ method: 'GET', query: { action: 'listExams' } }, ctx);
  assert.equal(listGet.body.success, true);

  // GET adminLogin must be rejected with METHOD_NOT_ALLOWED
  const adminGet = await handle({ method: 'GET', query: { action: 'adminLogin', password: ADMIN_PASS } }, ctx);
  assert.equal(adminGet.body.success, false);
  assert.equal(adminGet.body.error, 'METHOD_NOT_ALLOWED');
});
