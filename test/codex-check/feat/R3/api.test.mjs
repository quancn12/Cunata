import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, roster, rows, ok, loginStudent, names, submission, requirement as R } from './support.mjs';
const api = (title, fn) => test(`dist: [api] R3: ${title} (WEB-contract §23)`, fn);

api('tiền điều kiện R2: giáo viên, lớp, đề và bài giao tồn tại qua handle thật', async () => {
  const f = await fixture();
  const c = ok(await f.call('getClass', { code: f.cls.code }, 'GET'), 'đọc lớp fixture (§22)');
  assert.equal(c.class.code, f.cls.code, R('fixture lớp đúng mã'));
  assert.ok(c.assignments.some(a => a.assignmentId === f.assignment.assignmentId), R('fixture có bài giao đang mở'));
});

api('thêm và đọc tên Unicode, ID ổn định, PIN 4 chữ số duy nhất trong lớp', async () => {
  const f = await fixture(); const ss = await roster(f);
  assert.deepEqual(ss.map(s => s.name).sort(), [...names].sort(), R('giữ đủ tên đã thêm'));
  assert.equal(new Set(ss.map(s => s.studentId)).size, names.length, R('mỗi học sinh có ID riêng'));
  for (const s of ss) assert.match(s.pin, /^\d{4}$/, R('PIN là chuỗi đúng 4 chữ số, giữ số 0 đầu'));
  assert.equal(new Set(ss.map(s => s.pin)).size, names.length, R('PIN khác nhau trong lớp'));
  const again = rows(ok(await f.call('listStudents', { token: f.token, classId: f.cls.classId }), 'đọc lại danh sách'));
  assert.deepEqual(again.map(s => s.studentId), ss.map(s => s.studentId), R('đọc không tái tạo ID'));
});
api('PIN lưu băm và không rò băm hoặc PIN qua GET công khai', async () => {
  const f = await fixture(); const ss = await roster(f);
  assert.equal(f.store.students.size, ss.length, R('lưu học sinh vào Store thật'));
  for (const s of ss) {
    const stored = f.store.students.get(s.studentId);
    assert.ok(stored?.pinHash && stored.pinHash !== s.pin, R('pinHash tồn tại và khác PIN rõ'));
    assert.equal(Object.values(stored).includes(s.pin), false, R('không lưu PIN rõ'));
  }
  const pub = ok(await f.call('getClass', { code: f.cls.code }, 'GET'), 'đọc lớp công khai');
  const publicRows = rows(pub) ?? rows(pub.class);
  assert.ok(Array.isArray(publicRows), R('getClass cung cấp danh sách tên để học sinh chọn mà không cần phiên giáo viên'));
  assert.deepEqual(publicRows.map(s => ({studentId:s.studentId,name:s.name})), ss.map(s => ({studentId:s.studentId,name:s.name})), R('danh sách công khai đủ tên và ID đúng lớp'));
  const scan = value => { if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) {
    assert.doesNotMatch(k, /^(pin|pinHash|hash|salt|password)$/i, R('phản hồi công khai không chứa PIN, băm, muối hoặc mật khẩu (§22)')); scan(v);
  } };
  scan(pub);
});
for (const action of ['addStudents', 'listStudents', 'resetPin', 'removeStudent']) {
  api(`${action} từ chối token thiếu hoặc sai`, async () => {
    const f = await fixture();
    for (const token of [undefined, 'invalid-token']) {
      const b = await f.call(action, { token, classId: f.cls.classId, studentId: 'missing', names });
      assert.equal(b.error, 'UNAUTHORIZED', R(`${action} cần phiên giáo viên (§19.2)`));
    }
  });
  api(`${action} từ chối giáo viên khác với FORBIDDEN và không đổi dữ liệu`, async () => {
    const f = await fixture(); const [s] = await roster(f);
    const before = structuredClone([...f.store.students]);
    const b = await f.call(action, { token: f.otherToken, classId: f.cls.classId, studentId: s.studentId, names: ['Xâm nhập mô phỏng'] });
    assert.equal(b.error, 'FORBIDDEN', R(`${action} chỉ thao tác lớp của mình`));
    assert.deepEqual([...f.store.students], before, R('yêu cầu trái quyền không đổi danh sách'));
  });
}
api('đặt lại PIN, PIN mới đăng nhập được và PIN cũ bị từ chối', async () => {
  const f = await fixture(); const [s, other] = await roster(f);
  const reset = ok(await f.call('resetPin', { token: f.token, studentId: s.studentId }), 'resetPin');
  assert.match(reset.pin, /^\d{4}$/, R('PIN mới có 4 chữ số'));
  assert.notEqual(reset.pin, s.pin, R('đặt lại làm mất hiệu lực PIN cũ'));
  assert.notEqual(reset.pin, other.pin, R('PIN sau reset vẫn khác trong lớp'));
  assert.equal((await f.call('studentLogin', { code: f.cls.code, studentId: s.studentId, pin: s.pin })).success, false, R('PIN cũ bị từ chối'));
  await loginStudent(f, s, reset.pin);
});
api('xóa học sinh, đọc lại không còn và không đăng nhập được', async () => {
  const f = await fixture(); const [s] = await roster(f);
  ok(await f.call('removeStudent', { token: f.token, studentId: s.studentId }), 'removeStudent');
  const list = rows(ok(await f.call('listStudents', { token: f.token, classId: f.cls.classId }), 'đọc sau xóa'));
  assert.equal(list.some(x => x.studentId === s.studentId), false, R('không còn học sinh đã xóa'));
  assert.equal((await f.call('studentLogin', { code: f.cls.code, studentId: s.studentId, pin: s.pin })).success, false, R('không thể đăng nhập học sinh đã xóa'));
});
api('đúng PIN trả studentToken và tên trong danh sách, sai mã/lớp/PIN bị từ chối', async () => {
  const f = await fixture(); const [s] = await roster(f); const b = await loginStudent(f, s);
  assert.ok(typeof b.studentToken === 'string' && b.studentToken.length > 0, R('trả studentToken'));
  assert.equal(b.name, s.name, R('trả đúng tên trong danh sách'));
  for (const change of [{ code: 'ZZZZZZZ' }, { studentId: 'other-student' }, { pin: s.pin === '0000' ? '0001' : '0000' }]) {
    const r = await f.call('studentLogin', { code: f.cls.code, studentId: s.studentId, pin: s.pin, ...change });
    assert.equal(r.success, false, R('sai mã lớp, ID hoặc PIN không được cấp phiên'));
    assert.equal(r.studentToken, undefined, R('không lộ token khi thất bại'));
  }
});
api('sai 5 lần khóa đủ 10 phút, đổi client không bỏ khóa, không khóa học sinh khác', async () => {
  const f = await fixture(); const [s, other] = await roster(f);
  const bad = s.pin === '0000' ? '0001' : '0000';
  for (let i = 0; i < 5; i++) assert.equal((await f.call('studentLogin', { code: f.cls.code, studentId: s.studentId, pin: bad })).success, false, R('sai PIN phải thất bại'));
  // New handle invocation / HTTP client still uses the server-side store and clock.
  assert.equal((await f.call('studentLogin', { code: f.cls.code, studentId: s.studentId, pin: s.pin })).error, 'PIN_LOCKED', R('5 lần sai liên tiếp khóa trên máy chủ'));
  await loginStudent(f, other);
  f.advance(599999);
  assert.equal((await f.call('studentLogin', { code: f.cls.code, studentId: s.studentId, pin: s.pin })).error, 'PIN_LOCKED', R('chưa đủ 10 phút vẫn khóa'));
  f.advance(1); await loginStudent(f, s);
});
api('đăng nhập đúng ngắt chuỗi sai liên tiếp', async () => {
  const f = await fixture(); const [s] = await roster(f); const bad = s.pin === '0000' ? '0001' : '0000';
  for (let cycle = 0; cycle < 2; cycle++) {
    for (let i = 0; i < 4; i++) await f.call('studentLogin', { code: f.cls.code, studentId: s.studentId, pin: bad });
    await loginStudent(f, s);
  }
});
api('bài nộp lưu student_id và tên danh sách thay tên tự do, retry không nhân bản', async () => {
  const f = await fixture(); const [s] = await roster(f); const l = await loginStudent(f, s);
  const payload = { ...submission(f, s, l.studentToken), candidate_display: 'Tên giả mạo mô phỏng' };
  ok(await f.call('submitResult', payload), 'nộp bài trong lớp');
  const saved = await f.store.getResult(payload.attempt_id);
  assert.equal(saved.student_id, s.studentId, R('bài nộp mang student_id'));
  assert.equal(saved.candidate_display, s.name, R('tên bài trong lớp lấy từ danh sách'));
  ok(await f.call('submitResult', payload), 'retry cùng attempt');
  assert.equal(await f.store.countResults(), 1, R('idempotent theo attempt_id (§22)'));
});
api('myResults chỉ trả bài của đúng học sinh, đủ dữ liệu để xem lại ở máy khác', async () => {
  const f = await fixture(); const [s, other] = await roster(f);
  const l = await loginStudent(f, s); const l2 = await loginStudent(f, other);
  const p = submission(f, s, l.studentToken);
  ok(await f.call('submitResult', p), 'nộp bài');
  const fresh = await loginStudent(f, s);
  const mine = ok(await f.call('myResults', { studentToken: fresh.studentToken }), 'myResults ở phiên mới');
  assert.ok(Array.isArray(mine.results), R('myResults trả danh sách bài'));
  assert.equal(mine.results.length, 1, R('đọc lại được bài từ máy chủ'));
  const r = mine.results[0];
  for (const key of ['exam_id', 'class_code', 'assignment_id', 'submitted_at']) assert.equal(r[key], p[key], R(`myResults giữ ${key}`));
  const sections = r.sections ?? Object.fromEntries(['I', 'II', 'III'].map((part, i) => [part, {score:r[`score_p${i+1}`], max:r[`max_p${i+1}`]}]));
  assert.deepEqual(sections, p.sections, R('đủ điểm từng phần'));
  const raw = r.raw_answers_json ? JSON.parse(r.raw_answers_json) : r.responses;
  assert.deepEqual(raw, p.responses, R('giữ nguyên câu trả lời để dựng báo cáo §20'));
  assert.equal(ok(await f.call('myResults', { studentToken: l2.studentToken }), 'myResults học sinh khác').results.length, 0, R('không lộ bài học sinh khác'));
});

api('PIN vẫn khác nhau khi thêm nhiều đợt và reset nhiều học sinh', async () => {
  const f = await fixture(); await roster(f, names.slice(0, 1));
  const ss = await roster(f, names.slice(1));
  assert.equal(ss.length, names.length, R('thêm đợt sau không xóa đợt trước'));
  const pins = new Map(ss.map(s => [s.studentId, s.pin]));
  // Only the newly added PINs need to be returned; older hashes cannot be reversed.
  for (const s of ss) {
    const b = ok(await f.call('resetPin', {token:f.token, studentId:s.studentId}), 'reset từng PIN');
    assert.match(b.pin, /^\d{4}$/, R('PIN reset đủ bốn chữ số'));
    pins.set(s.studentId, b.pin);
  }
  assert.equal(new Set(pins.values()).size, ss.length, R('PIN không trùng cả qua các đợt'));
  for (const s of ss) await loginStudent(f, s, pins.get(s.studentId));
});

api('ID học sinh hợp lệ không đăng nhập được bằng mã của lớp khác', async () => {
  const f = await fixture(); const [s] = await roster(f);
  const other = ok(await f.call('createClass', {token:f.otherToken, name:'Lớp khác mô phỏng'}), 'tạo lớp thứ hai');
  const b = await f.call('studentLogin', {code:other.code, studentId:s.studentId, pin:s.pin});
  assert.equal(b.success, false, R('PIN và ID phải thuộc đúng lớp'));
  assert.equal(b.studentToken, undefined, R('không cấp phiên chéo lớp'));
});

api('phiên học sinh không thể gán bài nộp cho ID học sinh khác', async () => {
  const f = await fixture(); const [s, other] = await roster(f); const l = await loginStudent(f, s);
  const b = await f.call('submitResult', {...submission(f, s, l.studentToken), student_id:other.studentId});
  const saved = [...f.store.results.values()];
  assert.equal(saved.some(r => r.student_id === other.studentId), false, R('không giả mạo ID học sinh khác qua payload'));
  if (b.success) assert.equal(saved[0]?.student_id, s.studentId, R('máy chủ lấy danh tính từ phiên PIN nếu nhận bài'));
  else assert.equal(saved.length, 0, R('từ chối giả mạo không được ghi bài nào'));
});

api('myResults giữ nhiều lượt đã nộp của học sinh đang đăng nhập', async () => {
  const f = await fixture(); const [s] = await roster(f); const l = await loginStudent(f, s);
  for (const suffix of ['a', 'b']) ok(await f.call('submitResult', submission(f, s, l.studentToken, suffix)), 'lưu hai lượt độc lập');
  const result = ok(await f.call('myResults', {studentToken:l.studentToken}), 'đọc nhiều bài');
  assert.equal(result.results.length, 2, R('không chỉ giữ bài mới nhất'));
  assert.deepEqual(new Set(result.results.map(r => r.attempt_id)), new Set(['a', 'b'].map(suffix => `r3-${f.cls.classId}-${suffix}`)), R('đúng các lượt của học sinh'));
});
api('myResults không cho token thiếu/sai hoặc phiên giáo viên đọc bài học sinh', async () => {
  const f = await fixture();
  for (const studentToken of [undefined, 'invalid', f.token]) assert.equal((await f.call('myResults', { studentToken })).error, 'UNAUTHORIZED', R('myResults cần studentToken hợp lệ'));
});
