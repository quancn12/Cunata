// Tạo sẵn giáo viên, lớp, bài giao trong Apps Script giả lập (gas-server.mjs chạy chính apps-script/Code.js).
// WEB-contract 21 (Trưởng phòng 19/11/2026): học sinh chỉ thấy đề khi vào lớp bằng mã và giáo viên đã giao.
import assert from 'node:assert/strict';
import { startServer } from './harness.mjs';
import { startGasServer } from './gas-server.mjs';

export const TEACHER = { name: 'Cô Lan', username: 'colan', password: 'MatKhau-Lan-01' };
const iso = (m) => new Date(Date.now() + m * 60000).toISOString();

/** Như Admin đã tạo giáo viên; trả token giáo viên. */
export function seedTeacher(gas, t = TEACHER) {
  const a = gas.gas.post({ action: 'adminLogin', password: gas.adminPassword });
  assert.equal(a.success, true, 'Apps Script giả lập: adminLogin ' + JSON.stringify(a));
  const c = gas.gas.post({ action: 'adminCreateTeacher', token: a.token, ...t });
  assert.equal(c.success, true, 'Apps Script giả lập: adminCreateTeacher ' + JSON.stringify(c));
  return gas.gas.post({ action: 'teacherLogin', username: t.username, password: t.password }).token;
}

/** Tạo lớp và giao các đề (examIds) mở từ `openMin` phút trước, hạn `dueMin` phút sau. Trả { code, classId, assignments }. */
export function seedClass(gas, examIds, { token, name = 'Lớp kiểm định', openMin = -60, dueMin = 180 } = {}) {
  const tk = token ?? seedTeacher(gas);
  const c = gas.gas.post({ action: 'createClass', token: tk, name });
  assert.equal(c.success, true, 'Apps Script giả lập: createClass ' + JSON.stringify(c));
  const assignments = examIds.map((examId) => {
    const r = gas.gas.post({ action: 'assignExam', token: tk, classId: c.classId, examId, openAt: iso(openMin), dueAt: iso(dueMin) });
    assert.equal(r.success, true, 'Apps Script giả lập: assignExam ' + JSON.stringify(r));
    return r;
  });
  return { code: c.code, classId: c.classId, assignments, token: tk };
}

/** Máy chủ web dist trỏ tới một Apps Script giả lập mới. Trả { gas, server, close }. */
export async function classroomServer(dir, gasOpts) {
  const gas = await startGasServer(gasOpts);
  const server = await startServer(dir, { overrides: { 'public/config.json': JSON.stringify({ appsScriptUrl: gas.url }) } });
  return { gas, server, close: async () => { await server.close(); await gas.close(); } };
}
