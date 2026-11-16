import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGas } from '../../test/claude-check/gas-fake.mjs';
const password = 'teacher-password-01';
const exam = { schemaVersion: 'web-exam-v1', examId: 'exam', title: 'Exam', settings: { durationMinutes: 15 }, questions: [{ kind: 'III', questionVersionId: 'q', answerKey: '1,5' }] };
function setup() {
  const g = makeGas();
  const admin = g.post({ action: 'adminLogin', password: 'Admin-Cunata-2026' }).token;
  const login = () => g.post({ action: 'teacherLogin', username: 'teacher', password }).token;
  g.post({ action: 'adminCreateTeacher', token: admin, name: '=Teacher', username: 'teacher', password });
  return { g, admin, token: login(), login };
}
const iso = offset => new Date(Date.now() + offset).toISOString();
function result(id, extra = {}) {
  return { attempt_id: id, exam_id: 'exam', exam_version_id: 'v1', candidate_display: 'Student', started_at: '2026-01-01T00:00:00Z', submitted_at: '2026-01-01T00:10:00Z',
    sections: { I: { score: '0', max: '0' }, II: { score: '0', max: '0' }, III: { score: '10', max: '10' } }, total: '10', maxTotal: '10', ...extra };
}
test('tokens are 64 hex characters; cached credentials expire and cannot cross roles', () => {
  const { g, admin, token } = setup();
  assert.match(token, /^[a-f0-9]{64}$/i);
  assert.equal(g.post({ action: 'adminStats', token }).error, 'UNAUTHORIZED');
  assert.equal(g.post({ action: 'createClass', token: admin, name: 'Class' }).error, 'UNAUTHORIZED');
  const entry = g.cache.get('session:' + token);
  const data = JSON.parse(entry.val); data.expiresAt = iso(-1000); entry.val = JSON.stringify(data);
  assert.equal(g.post({ action: 'createClass', token, name: 'Class' }).error, 'UNAUTHORIZED');
});
test('password reset and account lock invalidate existing teacher tokens', () => {
  const { g, admin, token } = setup();
  g.post({ action: 'adminSetTeacherActive', token: admin, username: 'teacher', active: false });
  assert.equal(g.post({ action: 'publishExam', token, exam }).error, 'UNAUTHORIZED');
  g.post({ action: 'adminSetTeacherActive', token: admin, username: 'teacher', active: true });
  g.post({ action: 'adminResetPassword', token: admin, username: 'teacher', password: 'different-password' });
  assert.equal(g.post({ action: 'createClass', token, name: 'Class' }).error, 'UNAUTHORIZED');
});
test('salts differ for equal passwords and stored hashes match neither plaintext nor each other', () => {
  const { g, admin } = setup();
  assert.equal(g.post({ action: 'adminCreateTeacher', token: admin, name: 'Invalid', username: 'invalid\n', password }).error, 'INVALID_USERNAME');
  g.post({ action: 'adminCreateTeacher', token: admin, name: 'Other', username: 'other', password });
  const rows = g.sheets.get('GiaoVien').rows.slice(1);
  assert.notEqual(rows[0][2], rows[1][2]); assert.notEqual(rows[0][3], rows[1][3]);
  assert.match(rows[0][3], /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(rows).includes(password));
});
test('deadline checks use server time; retries after expiry remain idempotent; class context cannot change', () => {
  const { g, token } = setup();
  g.post({ action: 'publishExam', token, exam });
  const cls = g.post({ action: 'createClass', token, name: '=Class' });
  const assignment = g.post({ action: 'assignExam', token, classId: cls.classId, examId: 'exam', openAt: iso(-600000), dueAt: iso(-60000) });
  const payload = result('attempt', { class_code: cls.code, assignment_id: assignment.assignmentId });
  assert.equal(g.post(payload).success, true, 'one minute late is within grace');
  const sheet = g.sheets.get('GiaoDe'); sheet.set(2, 5, iso(-600000));
  assert.equal(g.post(payload).status, 'ALREADY_RECORDED');
  assert.equal(g.post({ ...payload, attempt_id: 'new' }).error, 'PAST_DUE');
  assert.equal(g.post(result('attempt')).error, 'PAYLOAD_CONFLICT');
  assert.equal(g.post(result('invalid-context', { class_code: false })).error, 'INVALID_ASSIGNMENT');
  assert.equal(g.post({ ...payload, attempt_id: 'wrong-exam', exam_id: 'other' }).error, 'INVALID_ASSIGNMENT');
  const results = g.post({ action: 'listResults', token, classId: cls.classId });
  assert.equal(results.results.length, 1);
  assert.equal(g.post({ action: 'listMyClasses', token }).classes[0].studentCount, 1);
  assert.ok(!JSON.stringify(g.get({ action: 'getClass', code: cls.code })).includes('Student'));
});
test('legacy chunk rows remain readable and cannot be silently claimed by a teacher', () => {
  const { g, token } = setup();
  const sheet = g.book.insertSheet('DeThi');
  sheet.appendRow(['id', 'title', 'subject', 'grade', 'durationMinutes', 'questionCount', 'group', 'revision', 'updatedAt', 'chunks']);
  sheet.appendRow(['legacy', 'Legacy', '', 12, 15, 1, '', 1, iso(0), JSON.stringify({ ...exam, examId: 'legacy' })]);
  assert.equal(g.get({ action: 'getExam', id: 'legacy' }).exam.examId, 'legacy');
  assert.equal(g.post({ action: 'publishExam', token, exam }).success, true);
  assert.equal(g.get({ action: 'getExam', id: 'legacy' }).exam.examId, 'legacy');
  assert.equal(sheet.rows[0][9], 'owner');
  assert.equal(g.post({ action: 'publishExam', token, exam: { ...exam, examId: 'legacy' } }).error, 'FORBIDDEN');
});
