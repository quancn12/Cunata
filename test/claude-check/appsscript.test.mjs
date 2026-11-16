// Kiểm định apps-script/Code.js THẬT trên Google Apps Script giả lập. Nhãn vùng: [glue] (apps-script/**).
// WEB-contract 17 (kho đề, kết quả) + 19.2 (Admin tạo tài khoản giáo viên, lớp học bằng mã, giao đề có giờ mở/hạn nộp).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeGas } from './gas-fake.mjs';
import { makeExam } from './app.mjs';
import { PROJECT_ROOT } from './harness.mjs';

const ADMIN = 'Admin-Cunata-2026';
const T1 = { name: 'Cô Lan', username: 'colan', password: 'MatKhau-Lan-01' };
const T2 = { name: 'Thầy Minh', username: 'thayminh', password: 'MatKhau-Minh-02' };
const secrets = [ADMIN, T1.password, T2.password];
const noSecret = (obj, where) => { const s = JSON.stringify(obj); for (const p of secrets) assert.ok(!s.includes(p), `${where}: phản hồi không được chứa mật khẩu`); };
const iso = (minutesFromNow) => new Date(Date.now() + minutesFromNow * 60000).toISOString();
const result = (id, extra = {}) => ({
  attempt_id: id, exam_id: 'claude-check-422', exam_version_id: 'v1.0.0', candidate_display: 'Nguyễn An', started_at: iso(-30), submitted_at: iso(-1),
  duration_seconds: 1800, policy_version: 'custom-v1',
  sections: { I: { score: '1/2', max: '1' }, II: { score: '3/4', max: '2' }, III: { score: '7/2', max: '7' } }, total: '19/4', maxTotal: '10', raw_answers: {}, ...extra,
});

/** Admin đăng nhập + tạo giáo viên; trả token của giáo viên. */
function setup(g, ...teachers) {
  const a = g.post({ action: 'adminLogin', password: ADMIN });
  assert.equal(a.success, true, 'adminLogin đúng mật khẩu phải thành công: ' + JSON.stringify(a)); noSecret(a, 'adminLogin');
  assert.ok(typeof a.token === 'string' && a.token.length >= 32, 'adminLogin phải trả token ngẫu nhiên đủ dài');
  const tokens = {};
  for (const t of teachers) {
    const c = g.post({ action: 'adminCreateTeacher', token: a.token, ...t });
    assert.equal(c.success, true, `adminCreateTeacher ${t.username}: ` + JSON.stringify(c)); noSecret(c, 'adminCreateTeacher');
    const l = g.post({ action: 'teacherLogin', username: t.username, password: t.password });
    assert.equal(l.success, true, `teacherLogin ${t.username}: ` + JSON.stringify(l)); noSecret(l, 'teacherLogin');
    assert.ok(typeof l.token === 'string' && l.token.length >= 32); assert.equal(l.name, t.name);
    tokens[t.username] = l.token;
  }
  return { admin: a.token, ...tokens };
}

test('[glue] Apps Script: đề công khai — listExams rỗng lúc đầu, getExam đề lạ → NOT_FOUND', () => {
  const g = makeGas();
  const r = g.get({ action: 'listExams' });
  assert.equal(r.success, true, JSON.stringify(r)); assert.deepEqual(r.exams, []);
  assert.equal(g.get({ action: 'getExam', id: 'khong-co' }).error, 'NOT_FOUND');
});

test('[glue] Apps Script: Admin — sai mật khẩu bị từ chối, chưa đặt ADMIN_PASSWORD thì báo rõ, token sai không dùng được', () => {
  const g = makeGas();
  assert.equal(g.post({ action: 'adminLogin', password: 'sai' }).error, 'UNAUTHORIZED');
  assert.equal(makeGas({ adminPassword: null }).post({ action: 'adminLogin', password: '' }).error, 'ADMIN_PASSWORD_NOT_SET');
  assert.equal(g.post({ action: 'adminCreateTeacher', token: 'gia-mao', ...T1 }).error, 'UNAUTHORIZED');
  assert.equal(g.post({ action: 'adminListTeachers', token: 'x'.repeat(40) }).error, 'UNAUTHORIZED');
});

test('[glue] Apps Script: Admin tạo giáo viên — trùng tên đăng nhập, mật khẩu yếu bị chặn; danh sách không lộ mật khẩu/băm; khóa và đặt lại mật khẩu', () => {
  const g = makeGas();
  const tok = setup(g, T1);
  assert.equal(g.post({ action: 'adminCreateTeacher', token: tok.admin, ...T1 }).error, 'USERNAME_TAKEN');
  assert.equal(g.post({ action: 'adminCreateTeacher', token: tok.admin, name: 'X', username: 'x y', password: 'MatKhau-123' }).success, false, 'tên đăng nhập có dấu cách phải bị từ chối');
  assert.equal(g.post({ action: 'adminCreateTeacher', token: tok.admin, name: 'Y', username: 'yyy', password: '123' }).success, false, 'mật khẩu dưới 8 ký tự phải bị từ chối');
  const list = g.post({ action: 'adminListTeachers', token: tok.admin });
  assert.equal(list.success, true); noSecret(list, 'adminListTeachers');
  assert.ok(!/hash|salt|password/i.test(JSON.stringify(list.teachers)), 'danh sách giáo viên không được có trường mật khẩu/băm/muối');
  assert.deepEqual(list.teachers.map((t) => t.username), ['colan']);
  const sheet = JSON.stringify(g.sheets.get('GiaoVien')?.rows ?? []);
  assert.ok(sheet.length > 2, 'tài khoản phải lưu ở trang tính GiaoVien'); assert.ok(!sheet.includes(T1.password), 'trang tính không được lưu mật khẩu dạng chữ thường (phải băm + muối)');
  assert.equal(g.post({ action: 'adminSetTeacherActive', token: tok.admin, username: 'colan', active: false }).success, true);
  assert.equal(g.post({ action: 'teacherLogin', username: 'colan', password: T1.password }).success, false, 'giáo viên bị khóa không đăng nhập được');
  g.post({ action: 'adminSetTeacherActive', token: tok.admin, username: 'colan', active: true });
  assert.equal(g.post({ action: 'adminResetPassword', token: tok.admin, username: 'colan', password: 'MatKhau-Moi-99' }).success, true);
  assert.equal(g.post({ action: 'teacherLogin', username: 'colan', password: T1.password }).error, 'UNAUTHORIZED', 'mật khẩu cũ không còn dùng được');
  assert.equal(g.post({ action: 'teacherLogin', username: 'colan', password: 'MatKhau-Moi-99' }).success, true);
  const st = g.post({ action: 'adminStats', token: tok.admin });
  assert.equal(st.success, true); assert.equal(st.stats.teachers, 1);
});

test('[glue] Apps Script: lớp học — mã 6 ký tự dễ đọc, học sinh tra lớp bằng mã, mã sai → NOT_FOUND', () => {
  const g = makeGas();
  const tok = setup(g, T1);
  const c = g.post({ action: 'createClass', token: tok.colan, name: '12A1' });
  assert.equal(c.success, true, JSON.stringify(c));
  assert.match(c.code, /^[A-HJ-NP-Z2-9]{6}$/, `mã lớp 6 ký tự in hoa, không có 0/O/1/I: "${c.code}"`);
  const c2 = g.post({ action: 'createClass', token: tok.colan, name: '12A2' });
  assert.notEqual(c2.code, c.code, 'mỗi lớp một mã khác nhau');
  const mine = g.post({ action: 'listMyClasses', token: tok.colan });
  assert.deepEqual(mine.classes.map((x) => x.name).sort(), ['12A1', '12A2']);
  const look = g.get({ action: 'getClass', code: c.code });
  assert.equal(look.success, true); assert.equal(look.class.name, '12A1'); assert.equal(look.class.teacherName, 'Cô Lan'); noSecret(look, 'getClass');
  assert.equal(g.get({ action: 'getClass', code: c.code.toLowerCase() }).success, true, 'mã lớp không phân biệt hoa thường');
  assert.equal(g.get({ action: 'getClass', code: 'ZZZZZZ' }).error, 'NOT_FOUND');
});

test('[glue] Apps Script: giáo viên chỉ đụng được lớp và đề của mình', () => {
  const g = makeGas();
  const tok = setup(g, T1, T2);
  const cls = g.post({ action: 'createClass', token: tok.colan, name: '12A1' });
  const ex = makeExam({ id: 'de-cua-co-lan', title: 'Đề của cô Lan' });
  assert.equal(g.post({ action: 'publishExam', token: tok.colan, exam: ex }).success, true);
  assert.equal(g.post({ action: 'publishExam', token: tok.thayminh, exam: { ...ex, title: 'Thầy Minh ghi đè' } }).error, 'FORBIDDEN', 'không được ghi đè đề của giáo viên khác');
  assert.equal(g.post({ action: 'unpublishExam', token: tok.thayminh, examId: ex.examId }).error, 'FORBIDDEN');
  assert.equal(g.post({ action: 'assignExam', token: tok.thayminh, classId: cls.classId, examId: ex.examId, openAt: iso(-60), dueAt: iso(60) }).error, 'FORBIDDEN', 'không được giao đề vào lớp của người khác');
  assert.equal(g.post({ action: 'listResults', token: tok.thayminh, classId: cls.classId }).error, 'FORBIDDEN', 'không được xem kết quả lớp của người khác');
  assert.deepEqual(g.post({ action: 'listMyClasses', token: tok.thayminh }).classes, []);
  assert.equal(g.get({ action: 'getExam', id: ex.examId }).exam.title, 'Đề của cô Lan');
});

test('[glue] Apps Script: giao đề có giờ mở/hạn nộp; nộp trước giờ mở → NOT_OPEN, sau hạn → PAST_DUE; kết quả theo lớp', () => {
  const g = makeGas();
  const tok = setup(g, T1);
  const cls = g.post({ action: 'createClass', token: tok.colan, name: '12A1' });
  const ex = makeExam({ id: 'de-giao-01', title: 'Đề giao 01' });
  g.post({ action: 'publishExam', token: tok.colan, exam: ex });
  assert.equal(g.post({ action: 'assignExam', token: tok.colan, classId: cls.classId, examId: ex.examId, openAt: iso(60), dueAt: iso(30) }).success, false, 'hạn nộp phải sau giờ mở');
  const open = g.post({ action: 'assignExam', token: tok.colan, classId: cls.classId, examId: ex.examId, openAt: iso(-60), dueAt: iso(60) });
  assert.equal(open.success, true, JSON.stringify(open));
  const later = g.post({ action: 'assignExam', token: tok.colan, classId: cls.classId, examId: ex.examId, openAt: iso(120), dueAt: iso(180) });
  const past = g.post({ action: 'assignExam', token: tok.colan, classId: cls.classId, examId: ex.examId, openAt: iso(-180), dueAt: iso(-60) });
  const look = g.get({ action: 'getClass', code: cls.code });
  assert.equal(look.assignments.length, 3);
  const a0 = look.assignments.find((a) => a.assignmentId === open.assignmentId);
  assert.equal(a0.title, 'Đề giao 01'); assert.equal(a0.questionCount, 8); assert.ok(a0.openAt && a0.dueAt);
  const base = { exam_id: ex.examId, class_code: cls.code };
  assert.equal(g.post(result('att-ok', { ...base, assignment_id: open.assignmentId })).success, true);
  assert.equal(g.post(result('att-early', { ...base, assignment_id: later.assignmentId })).error, 'NOT_OPEN');
  assert.equal(g.post(result('att-late', { ...base, assignment_id: past.assignmentId })).error, 'PAST_DUE');
  assert.equal(g.post(result('att-ok', { ...base, assignment_id: open.assignmentId })).status, 'ALREADY_RECORDED', 'nộp lại cùng attempt_id không tạo dòng mới');
  const rs = g.post({ action: 'listResults', token: tok.colan, classId: cls.classId });
  assert.equal(rs.success, true, JSON.stringify(rs));
  assert.equal(rs.results.length, 1, 'chỉ một bài hợp lệ được ghi nhận'); assert.equal(rs.results[0].candidate_display ?? rs.results[0].candidateName, 'Nguyễn An');
});

test('[glue] Apps Script: đề nặng (> 50 000 ký tự) và tiêu đề bắt đầu bằng "=" lưu và đọc lại đúng nguyên văn', () => {
  const g = makeGas();
  const tok = setup(g, T1);
  const exam = makeExam({ id: 'gv-de-nang', title: '=HYPERLINK("http://x") — đề nặng' });
  exam.questions[0].content += '\n\n![hình](data:image/png;base64,' + 'A'.repeat(130000) + ')';
  exam.questions[1].options[0].text = '+5 V';
  const p = g.post({ action: 'publishExam', token: tok.colan, exam });
  assert.equal(p.success, true, JSON.stringify(p).slice(0, 300));
  assert.deepEqual(g.get({ action: 'getExam', id: 'gv-de-nang' }).exam, exam);
  assert.equal(g.get({ action: 'listExams' }).exams[0].title, exam.title);
});

test('[glue] Apps Script: nộp kết quả đề luyện tập (không lớp) vẫn chạy, ghi trang tính KetQua, không ghi vào Sheet1', () => {
  const g = makeGas();
  assert.equal(g.post(result('att-777')).success, true);
  assert.equal(g.post({ action: 'submitResult', ...result('att-777') }).status, 'ALREADY_RECORDED');
  const kq = g.sheets.get('KetQua');
  assert.ok(kq && kq.getLastRow() === 2, 'KetQua: 1 dòng tiêu đề + 1 dòng kết quả');
  const s1 = g.sheets.get('Sheet1'); assert.ok(!s1 || s1.getLastRow() === 0);
});

// Trình soạn Apps Script không nhận 0n, ??, ?. (Trưởng phòng gặp ParseError 16/11/2026 — WEB-contract 17.5).
test('[glue] Apps Script: mã dán được vào trình soạn Apps Script — không BigInt literal (0n), không ?? và không ?.', () => {
  const src = readFileSync(join(PROJECT_ROOT, 'apps-script', 'Code.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, '""');
  const bad = [];
  src.split('\n').forEach((l, i) => {
    if (/(?<![\w.$])\d+n\b/.test(l)) bad.push(`dòng ~${i + 1}: BigInt literal: ${l.trim().slice(0, 80)}`);
    if (/\?\?/.test(l)) bad.push(`dòng ~${i + 1}: toán tử ?? : ${l.trim().slice(0, 80)}`);
    if (/\?\.(?=[\w$[(])/.test(l)) bad.push(`dòng ~${i + 1}: toán tử ?. : ${l.trim().slice(0, 80)}`);
  });
  assert.deepEqual(bad.slice(0, 15), []);
});
