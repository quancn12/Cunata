// Kiểm định apps-script/Code.js THẬT trên Google Apps Script giả lập (WEB-contract mục 17). Nhãn vùng: [glue] (apps-script/**).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGas } from './gas-fake.mjs';
import { makeExam } from './app.mjs';

const PW = 'MatKhau-GV-123';
const result = (id = 'att-001', extra = {}) => ({
  attempt_id: id, exam_id: 'claude-check-422', exam_version_id: 'v1.0.0', candidate_display: 'Nguyễn An', started_at: '2026-11-16T01:00:00.000Z',
  submitted_at: '2026-11-16T01:30:00.000Z', duration_seconds: 1800, policy_version: 'custom-v1',
  sections: { I: { score: '1/2', max: '1' }, II: { score: '3/4', max: '2' }, III: { score: '7/2', max: '7' } }, total: '19/4', maxTotal: '10', raw_answers: {}, ...extra,
});
const noSecret = (obj) => assert.ok(!JSON.stringify(obj).includes(PW), 'phản hồi không được chứa mật khẩu giáo viên');

test('[glue] Apps Script: chưa có đề nào → listExams trả danh sách rỗng; getExam đề lạ → NOT_FOUND', () => {
  const g = makeGas();
  const r = g.get({ action: 'listExams' });
  assert.equal(r.success, true, 'listExams phải success:true: ' + JSON.stringify(r));
  assert.deepEqual(r.exams, []);
  const n = g.get({ action: 'getExam', id: 'khong-co' });
  assert.equal(n.success, false); assert.equal(n.error, 'NOT_FOUND');
});

test('[glue] Apps Script: đăng nhập giáo viên đúng/sai mật khẩu; chưa đặt mật khẩu thì báo rõ; không lộ mật khẩu', () => {
  const g = makeGas();
  const ok = g.post({ action: 'teacherLogin', password: PW });
  assert.equal(ok.success, true, JSON.stringify(ok)); noSecret(ok);
  const bad = g.post({ action: 'teacherLogin', password: 'sai' });
  assert.equal(bad.success, false); assert.equal(bad.error, 'UNAUTHORIZED'); noSecret(bad);
  const none = makeGas({ password: null }).post({ action: 'teacherLogin', password: '' });
  assert.equal(none.success, false); assert.equal(none.error, 'TEACHER_PASSWORD_NOT_SET');
  const empty = makeGas({ password: null }).post({ action: 'publishExam', password: '', exam: makeExam() });
  assert.equal(empty.success, false, 'chưa đặt TEACHER_PASSWORD thì không ai xuất bản được, kể cả gửi mật khẩu rỗng');
});

test('[glue] Apps Script: xuất bản đề → có trong listExams (đúng thông tin) và getExam trả nguyên văn; ghi vào trang tính DeThi', () => {
  const g = makeGas();
  const exam = makeExam({ id: 'gv-de-01', title: 'Đề giáo viên số 1' });
  exam.group = 'Vật lí 12 — Đề giáo viên';
  const p = g.post({ action: 'publishExam', password: PW, exam });
  assert.equal(p.success, true, JSON.stringify(p)); noSecret(p);
  assert.equal(p.examId, 'gv-de-01');
  const list = g.get({ action: 'listExams' });
  assert.equal(list.exams.length, 1);
  const e = list.exams[0];
  assert.equal(e.id, 'gv-de-01'); assert.equal(e.title, 'Đề giáo viên số 1'); assert.equal(e.questionCount, exam.questions.length);
  assert.equal(e.durationMinutes, 50); assert.equal(e.group, 'Vật lí 12 — Đề giáo viên');
  assert.deepEqual(g.get({ action: 'getExam', id: 'gv-de-01' }).exam, exam, 'getExam phải trả đúng nguyên văn đề đã xuất bản');
  assert.ok(g.sheets.get('DeThi'), 'đề phải được ghi vào trang tính tên "DeThi"');
});

test('[glue] Apps Script: xuất bản lại cùng examId thì thay bản cũ (1 đề, revision tăng); gỡ xuất bản thì biến mất', () => {
  const g = makeGas();
  const a = makeExam({ id: 'gv-de-02', title: 'Bản 1' });
  const r1 = g.post({ action: 'publishExam', password: PW, exam: a });
  const r2 = g.post({ action: 'publishExam', password: PW, exam: { ...a, title: 'Bản 2' } });
  assert.equal(r1.success && r2.success, true);
  assert.ok(r2.revision > r1.revision, `revision phải tăng: ${r1.revision} → ${r2.revision}`);
  const list = g.get({ action: 'listExams' }).exams;
  assert.equal(list.length, 1, 'cùng examId chỉ được có 1 đề trong danh sách');
  assert.equal(list[0].title, 'Bản 2');
  assert.equal(g.get({ action: 'getExam', id: 'gv-de-02' }).exam.title, 'Bản 2');
  const u = g.post({ action: 'unpublishExam', password: PW, examId: 'gv-de-02' });
  assert.equal(u.success, true, JSON.stringify(u));
  assert.deepEqual(g.get({ action: 'listExams' }).exams, []);
  assert.equal(g.post({ action: 'unpublishExam', password: 'sai', examId: 'x' }).error, 'UNAUTHORIZED');
});

test('[glue] Apps Script: sai mật khẩu hoặc đề không hợp lệ thì không xuất bản được', () => {
  const g = makeGas();
  assert.equal(g.post({ action: 'publishExam', password: 'sai', exam: makeExam() }).error, 'UNAUTHORIZED');
  const bad1 = makeExam({ id: 'gv-bad-1' }); bad1.questions[0].correctOptionId = 'khong-co';
  const bad2 = makeExam({ id: 'gv-bad-2' }); delete bad2.questions[4].statements[1].answer;
  const bad3 = makeExam({ id: 'gv-bad-3' }); bad3.questions[6].answerKey = '12345';
  const bad4 = makeExam({ id: 'gv-bad-4' }); bad4.questions[0].options.pop();
  for (const [name, ex] of [['đáp án Phần I không thuộc phương án', bad1], ['ý Phần II thiếu đáp án', bad2], ['đáp án Phần III quá 4 ký tự', bad3], ['câu Phần I chỉ có 3 phương án', bad4]]) {
    const r = g.post({ action: 'publishExam', password: PW, exam: ex });
    assert.equal(r.success, false, `${name}: không được xuất bản`); assert.equal(r.error, 'INVALID_EXAM', `${name}: mã lỗi phải là INVALID_EXAM, thực tế ${r.error}`);
  }
  assert.deepEqual(g.get({ action: 'listExams' }).exams, [], 'không đề lỗi nào được vào danh sách');
});

test('[glue] Apps Script: đề nặng (hơn 50 000 ký tự, có hình nhúng) và tiêu đề bắt đầu bằng "=" vẫn lưu và đọc lại đúng nguyên văn', () => {
  const g = makeGas();
  const exam = makeExam({ id: 'gv-de-nang', title: '=HYPERLINK("http://x") — đề nặng' });
  exam.questions[0].content += '\n\n![hình](data:image/png;base64,' + 'A'.repeat(130000) + ')';
  exam.questions[1].options[0].text = '+5 V';
  const p = g.post({ action: 'publishExam', password: PW, exam });
  assert.equal(p.success, true, 'đề nặng phải xuất bản được (chia khúc ≤ 40 000 ký tự/ô): ' + JSON.stringify(p).slice(0, 300));
  assert.deepEqual(g.get({ action: 'getExam', id: 'gv-de-nang' }).exam, exam, 'đọc lại phải đúng từng ký tự');
  assert.equal(g.get({ action: 'listExams' }).exams[0].title, exam.title, 'tiêu đề bắt đầu bằng "=" không được biến thành công thức');
});

test('[glue] Apps Script: nộp kết quả vẫn chạy như cũ, ghi vào trang tính KetQua, nộp lại cùng attempt_id không tạo dòng mới; không đụng DeThi', () => {
  const g = makeGas();
  g.post({ action: 'publishExam', password: PW, exam: makeExam({ id: 'gv-de-03' }) });
  const r1 = g.post(result('att-777'));
  assert.equal(r1.success, true, JSON.stringify(r1));
  const r2 = g.post({ action: 'submitResult', ...result('att-777') });
  assert.equal(r2.success, true, JSON.stringify(r2)); assert.equal(r2.status, 'ALREADY_RECORDED');
  const kq = g.sheets.get('KetQua');
  assert.ok(kq, 'kết quả phải ghi vào trang tính tên "KetQua"');
  assert.equal(kq.getLastRow(), 2, 'KetQua: 1 dòng tiêu đề + 1 dòng kết quả');
  assert.equal(g.get({ action: 'listExams' }).exams.length, 1, 'nộp kết quả không được làm hỏng kho đề');
  const sheet1 = g.sheets.get('Sheet1');
  assert.ok(!sheet1 || sheet1.getLastRow() === 0, 'không ghi gì vào trang tính mặc định Sheet1');
});
