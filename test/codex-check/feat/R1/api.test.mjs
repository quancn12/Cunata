import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scryptSync } from 'node:crypto';
import { A, rig, seed, classroom, payload, ok, noSecrets, ADMIN, T1, T2, EPOCH, HOURS8, iso, catalog,
  objects, storedStrings, files, required, ROOT, localServer, H, click, type } from './support.mjs';

const check = (id, description, clause, fn) => test(`dist: [api] R1: ${id} ${description} (WEB-contract §${clause})`, { timeout: 45000 }, fn);
check('API00', 'Apps Script cũ vẫn chạy: trình duyệt thật, chuột thật, đăng nhập qua máy chủ cục bộ', '22', async () => {
  const { pathToFileURL } = await import('node:url');
  const G = await import(pathToFileURL(process.cwd() + '/test/claude-check/gas-server.mjs').href);
  const C = await import(pathToFileURL(process.cwd() + '/test/claude-check/classroom.mjs').href);
  const gas = await G.startGasServer({ adminPassword: ADMIN });
  const token = C.seedTeacher(gas, T1);
  // Control: the exact exam/result fixtures accepted below are valid for the old API.
  ok(gas.gas.post({ action: 'publishExam', token, exam: A.makeExam({ id: 'r1-exam' }) }));
  ok(gas.gas.post(payload('r1-legacy-control')));
  assert.equal(gas.gas.post(payload('r1-legacy-control')).status, 'ALREADY_RECORDED', 'WEB-contract §17.2/§22: fixture nộp bài hợp lệ với Apps Script cũ');
  const staticServer = await H.startServer(required('dist'), { overrides: { 'public/config.json': JSON.stringify({ appsScriptUrl: gas.url }) } });
  let browser, context;
  try {
    browser = await H.launchBrowser(); context = await browser.newContext(); const page = await context.newPage();
    await page.goto(staticServer.url + 'index.html#/giao-vien');
    await click(page, '#btnRoleTeacher');
    await page.waitFor(() => !!document.querySelector('#teacherUsername'), 'WEB-contract §19.1/§22: cổng giáo viên hiện');
    await type(page, '#teacherUsername', T1.username); await type(page, '#teacherPassword', T1.password); await click(page, '#btnTeacherLogin');
    await page.waitFor(() => !!document.querySelector('#teacherShell')?.getClientRects().length, 'WEB-contract §22: Apps Script cũ vẫn đăng nhập được bằng trình duyệt thật');
    assert.ok(gas.log.some(x => x.body.includes('teacherLogin')), 'WEB-contract §22: có request đăng nhập thật đến emulator cục bộ');
  } finally { await context?.close(); await browser?.close(); await staticServer.close(); await gas.close(); }
});
check('API01', 'lõi handle dùng store bộ nhớ, không gọi mạng', '22', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => assert.fail('WEB-contract §22: lõi với MemoryStore không được gọi mạng');
  try {
    const r = await rig(); const tokens = await seed(r);
    const c = ok(await r.post({ action: 'createClass', token: tokens[T1.username], name: '12A1' }));
    assert.equal(ok(await r.get({ action: 'getClass', code: c.code })).class.name, '12A1', 'WEB-contract §22: dữ liệu tồn tại trong ctx.store');
    assert.equal((await rig()).store === r.store, false, 'WEB-contract §22: Store bộ nhớ độc lập');
  } finally { globalThis.fetch = original; }
});
check('API02', 'Admin: chưa cấu hình, sai mật khẩu, token giả', '19.2/§22', async () => {
  const missing = await rig({ adminPassword: undefined });
  delete missing.ctx.adminPassword; delete missing.ctx.env.ADMIN_PASSWORD;
  assert.equal((await missing.post({ action: 'adminLogin', password: '' })).error, 'ADMIN_PASSWORD_NOT_SET', 'WEB-contract §22: chưa đặt ADMIN_PASSWORD báo mã chính xác');
  const r = await rig();
  assert.equal((await r.post({ action: 'adminLogin', password: 'wrong' })).error, 'UNAUTHORIZED', 'WEB-contract §19.2/§22: sai mật khẩu');
  for (const action of ['adminListTeachers', 'adminStats', 'listMyClasses'])
    assert.equal((await r.post({ action, token: 'forged' })).error, 'UNAUTHORIZED', 'WEB-contract §19.2/§22: token giả bị từ chối');
});
check('API03', 'tạo tài khoản: username, trùng, mật khẩu tối thiểu, stats', '19.2/§22', async () => {
  const r = await rig(); const t = await seed(r);
  assert.equal((await r.post({ action: 'adminCreateTeacher', token: t.admin, ...T1 })).error, 'USERNAME_TAKEN', 'WEB-contract §19.2: username trùng');
  for (const username of ['ab', 'a'.repeat(33), 'name space', 'tên'])
    assert.equal((await r.post({ action: 'adminCreateTeacher', token: t.admin, ...T1, username })).success, false, 'WEB-contract §19.2: username 3–32 a-z0-9._-');
  assert.equal((await r.post({ action: 'adminCreateTeacher', token: t.admin, ...T2, password: '1234567' })).success, false, 'WEB-contract §19.2: mật khẩu ít nhất 8 ký tự');
  const list = ok(await r.post({ action: 'adminListTeachers', token: t.admin }));
  assert.deepEqual(list.teachers.map(x => x.username), [T1.username], 'WEB-contract §19.2: danh sách đúng');
  assert.equal(ok(await r.post({ action: 'adminStats', token: t.admin })).stats.teachers, 1, 'WEB-contract §19.2: thống kê thực');
});
check('API04', 'mật khẩu scrypt có muối riêng và phiên lưu dạng băm', '22', async () => {
  const r = await rig(); const t = await seed(r, [T1, T2]);
  const rows = objects(r.store).filter(x => x.username === T1.username || x.username === T2.username);
  const credentials = rows.filter(x => Object.keys(x).some(k => /salt/i.test(k)) && Object.keys(x).some(k => /hash/i.test(k)));
  assert.ok(credentials.length >= 2, 'WEB-contract §22: MemoryStore phải lưu được hai bản ghi mật khẩu có muối/băm (adapter quan sát)');
  const field = (x, re) => Object.entries(x).find(([k]) => re.test(k))?.[1];
  const c1 = credentials.find(x => x.username === T1.username), c2 = credentials.find(x => x.username === T2.username);
  assert.notDeepEqual(field(c1, /salt/i), field(c2, /salt/i), 'WEB-contract §22: hai tài khoản cùng mật khẩu có muối riêng');
  for (const row of [c1, c2]) {
    const salt = field(row, /salt/i), hash = field(row, /hash/i);
    const digest = Buffer.isBuffer(hash) ? hash : Buffer.from(hash, /^[a-f0-9]+$/i.test(hash) ? 'hex' : 'base64');
    const salts = [salt];
    if (typeof salt === 'string') salts.push(Buffer.from(salt, /^[a-f0-9]+$/i.test(salt) ? 'hex' : 'base64'));
    assert.ok(digest.length >= 32 && salts.some(s => scryptSync(T1.password, s, digest.length).equals(digest)),
      'WEB-contract §22: băm đã lưu thực sự kiểm chứng được bằng scrypt và muối, không chỉ có tên trường hash');
  }
  const strings = storedStrings(r.store);
  for (const raw of [T1.password, t.admin, t[T1.username], t[T2.username]])
    assert.ok(!strings.includes(raw), 'WEB-contract §22: Store không lưu mật khẩu/token thô');
  const source = files(required('src/api')).filter(p => p.endsWith('.ts')).map(p => readFileSync(p, 'utf8')).join('\n');
  assert.match(source, /\bscrypt(?:Sync)?\b/, 'WEB-contract §22: dùng scrypt node:crypto, không thay bằng SHA mật khẩu');
  assert.match(source, /randomBytes\s*\(\s*32\s*\)/, 'WEB-contract §22: token sinh từ 32 byte ngẫu nhiên');
});
check('API05', 'token không lặp; hết hạn đúng 8 giờ cả Admin và giáo viên', '19.2/§22', async () => {
  const r = await rig(); const t = await seed(r);
  const login = ok(await r.post({ action: 'teacherLogin', username: T1.username, password: T1.password }));
  assert.notEqual(login.token, t[T1.username], 'WEB-contract §22: mỗi đăng nhập token mới');
  assert.equal(typeof login.token, 'string', 'WEB-contract §19.2: token là chuỗi');
  assert.equal(new Date(login.expiresAt).getTime(), EPOCH + HOURS8, 'WEB-contract §19.2/§22: expiresAt đúng 8 giờ');
  r.setTime(EPOCH + HOURS8 - 1);
  ok(await r.post({ action: 'listMyClasses', token: t[T1.username] }));
  ok(await r.post({ action: 'adminStats', token: t.admin }));
  r.setTime(EPOCH + HOURS8);
  for (const [action, token] of [['listMyClasses', t[T1.username]], ['adminStats', t.admin]])
    assert.equal((await r.post({ action, token })).error, 'UNAUTHORIZED', 'WEB-contract §22: hết hạn tại mốc 8 giờ');
});
for (const mode of ['lock', 'reset']) check(`API06-${mode}`, 'vô hiệu mọi phiên cũ khi khóa/đặt lại mật khẩu', '22', async () => {
  const r = await rig(); const t = await seed(r);
  const second = ok(await r.post({ action: 'teacherLogin', username: T1.username, password: T1.password })).token;
  const change = mode === 'lock' ? { action: 'adminSetTeacherActive', active: false } : { action: 'adminResetPassword', password: 'R1-New-Password-2026' };
  ok(await r.post({ ...change, token: t.admin, username: T1.username }));
  for (const token of [t[T1.username], second]) assert.equal((await r.post({ action: 'listMyClasses', token })).error, 'UNAUTHORIZED', 'WEB-contract §22: mọi phiên cũ bị thu hồi');
  assert.equal((await r.post({ action: 'teacherLogin', username: T1.username, password: T1.password })).success, false, 'WEB-contract §19.2/§22: khóa/mật khẩu cũ không đăng nhập');
  if (mode === 'reset') ok(await r.post({ action: 'teacherLogin', username: T1.username, password: change.password }));
  else {
    ok(await r.post({ action: 'adminSetTeacherActive', token: t.admin, username: T1.username, active: true }));
    assert.equal((await r.post({ action: 'listMyClasses', token: second })).error, 'UNAUTHORIZED', 'WEB-contract §22: mở khóa không hồi sinh token cũ');
    ok(await r.post({ action: 'teacherLogin', username: T1.username, password: T1.password }));
  }
});
check('API07', 'phân quyền Admin, lớp, đề và kết quả giữa hai giáo viên', '19.2/§22', async () => {
  const r = await rig(); const t = await seed(r, [T1, T2]); const own = t[T1.username], other = t[T2.username];
  const ex = A.makeExam({ id: 'r1-exam' }); ok(await r.post({ action: 'publishExam', token: own, exam: ex }));
  const c = await classroom(r, own, ex.examId);
  for (const data of [{ action: 'publishExam', exam: ex }, { action: 'unpublishExam', examId: ex.examId },
    { action: 'assignExam', classId: c.classId, examId: ex.examId, openAt: iso(EPOCH), dueAt: iso(EPOCH + 60000) },
    { action: 'listAssignments', classId: c.classId }, { action: 'listResults', classId: c.classId }])
    assert.equal((await r.post({ ...data, token: other })).error, 'FORBIDDEN', 'WEB-contract §19.2/§22: giáo viên khác không truy cập dữ liệu của chủ');
  for (const action of ['adminListTeachers', 'adminStats', 'adminCreateTeacher'])
    assert.equal((await r.post({ action, token: own, ...T2 })).success, false, 'WEB-contract §19.2/§22: token giáo viên không có quyền Admin');
  assert.deepEqual(ok(await r.post({ action: 'listMyClasses', token: other })).classes, [], 'WEB-contract §19.2: chỉ thấy lớp mình');
});
check('API08', 'mã lớp, getClass, NOT_FOUND và danh sách giao đề', '19.2/§22', async () => {
  const r = await rig(); const t = await seed(r); const ex = A.makeExam({ id: 'r1-exam' });
  ok(await r.post({ action: 'publishExam', token: t[T1.username], exam: ex }));
  const c = await classroom(r, t[T1.username], ex.examId);
  assert.match(c.code, /^[A-HJ-NP-Z2-9]{6}$/, 'WEB-contract §19.1/§22: mã 6 ký tự không 0/O/1/I');
  const another = ok(await r.post({ action: 'createClass', token: t[T1.username], name: '12A2' }));
  assert.notEqual(another.code, c.code, 'WEB-contract §19.2: mã lớp duy nhất');
  const looked = ok(await r.get({ action: 'getClass', code: c.code.toLowerCase() }));
  assert.equal(looked.class.teacherName, T1.name, 'WEB-contract §19.2: tên giáo viên thật');
  assert.equal(looked.assignments[0].title, ex.title, 'WEB-contract §19.2: tiêu đề đề giáo viên');
  assert.equal((await r.get({ action: 'getClass', code: 'NOCLASS' })).error, 'NOT_FOUND', 'WEB-contract §19.2: mã lớp sai');
  const assignments = ok(await r.post({ action: 'listAssignments', token: t[T1.username], classId: c.classId })).assignments;
  assert.equal(assignments.length, 1, 'WEB-contract §19.2: danh sách giao đề đúng');
});
check('API09', 'publish/list/get/update/unpublish giữ JSON lớn nguyên văn', '17.2–17.3/§22', async () => {
  const r = await rig(); const t = await seed(r); const token = t[T1.username];
  const ex = A.makeExam({ id: 'r1-exam', title: '=SUM(1,2) — Đề tiếng Việt' });
  ex.questions[0].content += 'ă漢字𝟙'.repeat(20000); ex.questions[0].options[0].text = '+5 V';
  const p = ok(await r.post({ action: 'publishExam', token, exam: ex }));
  assert.equal(p.revision, 1, 'WEB-contract §17.2: xuất bản lần đầu revision 1');
  assert.deepEqual(ok(await r.get({ action: 'getExam', id: ex.examId })).exam, ex, 'WEB-contract §17.3/§22: JSON >50k và ký tự đầu công thức không mất dữ liệu');
  ex.title = 'Bản sửa';
  assert.equal(ok(await r.post({ action: 'publishExam', token, exam: ex })).revision, 2, 'WEB-contract §17.2: revision tăng');
  const meta = ok(await r.get({ action: 'listExams' })).exams.find(e => e.id === ex.examId);
  assert.equal(meta.title, ex.title, 'WEB-contract §17.2: listExams tiêu đề mới');
  for (const key of ['subject', 'grade', 'durationMinutes', 'questionCount', 'group', 'revision', 'updatedAt'])
    assert.ok(Object.hasOwn(meta, key), `WEB-contract §17.2: metadata có ${key}`);
  ok(await r.post({ action: 'unpublishExam', token, examId: ex.examId }));
  assert.ok(!ok(await r.get({ action: 'listExams' })).exams.some(e => e.id === ex.examId), 'WEB-contract §17.2: gỡ đề khỏi danh sách');
  assert.equal((await r.get({ action: 'getExam', id: 'missing-r1' })).error, 'NOT_FOUND', 'WEB-contract §17.2: đề không tồn tại');
});
check('API10', 'từ chối đề sai từng loại câu, không lưu bản lỗi', '17.2/§22', async () => {
  const r = await rig(); const t = await seed(r);
  const changes = [e => { delete e.title; }, e => { e.questions[0].options.pop(); }, e => { e.questions[0].correctOptionId = 'unknown'; },
    e => { e.questions.find(q => q.kind === 'II').statements[0].answer = 'false'; },
    e => { e.questions.find(q => q.kind === 'II').statements.pop(); },
    e => { e.questions.find(q => q.kind === 'III').answerKey = '1.5'; }, e => { e.questions.find(q => q.kind === 'III').answerKey = '12345'; }];
  for (const mutate of changes) {
    const exam = A.makeExam({ id: 'invalid-r1' }); mutate(exam);
    const res = await r.post({ action: 'publishExam', token: t[T1.username], exam });
    assert.equal(res.error, 'INVALID_EXAM', 'WEB-contract §17.2: đề sai trả INVALID_EXAM');
    assert.ok(JSON.stringify(res).length > 70, 'WEB-contract §17.2: đề sai có chi tiết lỗi');
  }
  assert.equal((await r.get({ action: 'getExam', id: 'invalid-r1' })).error, 'NOT_FOUND', 'WEB-contract §17.2: không lưu đề lỗi');
});
check('API11', 'catalog phía server trả tên và metadata thật của mọi đề tĩnh', '22', async () => {
  const r = await rig(); const t = await seed(r);
  assert.ok(catalog.length > 0, 'WEB-contract §22: fixture catalog có đề thật');
  const c = ok(await r.post({ action: 'createClass', token: t[T1.username], name: 'Catalog R1' }));
  for (const e of catalog) ok(await r.post({ action: 'assignExam', token: t[T1.username], classId: c.classId, examId: e.id, openAt: iso(EPOCH - 1), dueAt: iso(EPOCH + 60000) }));
  const pub = ok(await r.get({ action: 'getClass', code: c.code }));
  const priv = ok(await r.post({ action: 'listAssignments', token: t[T1.username], classId: c.classId }));
  for (const list of [pub.assignments, priv.assignments]) for (const e of catalog) {
    const a = list.find(x => x.examId === e.id);
    assert.ok(a, 'WEB-contract §22: mỗi đề tĩnh giao được');
    for (const key of ['title', 'questionCount', 'durationMinutes']) assert.equal(a[key], e[key], `WEB-contract §22: ${key} lấy từ catalog, không dùng examId làm tên`);
  }
});
check('API12', 'giờ mở và hạn nộp kiểm theo ctx.now, bù mạng đúng 2 phút', '19.2/§22', async () => {
  const r = await rig(); const t = await seed(r); const token = t[T1.username];
  ok(await r.post({ action: 'publishExam', token, exam: A.makeExam({ id: 'r1-exam' }) }));
  const c = await classroom(r, token, 'r1-exam', { openAt: EPOCH, dueAt: EPOCH + 60000 });
  assert.equal((await r.post({ action: 'assignExam', token, classId: c.classId, examId: 'r1-exam', openAt: iso(EPOCH), dueAt: iso(EPOCH) })).success, false, 'WEB-contract §19.2: dueAt phải lớn hơn openAt');
  const p = (id) => payload(id, { class_code: c.code, assignment_id: c.assignmentId });
  r.setTime(EPOCH - 1);
  assert.equal((await r.post(p('early'))).error, 'NOT_OPEN', 'WEB-contract §19.2/§22: trước giờ mở');
  r.setTime(EPOCH); ok(await r.post(p('at-open')));
  r.setTime(EPOCH + 180000); ok(await r.post(p('at-grace')));
  r.setTime(EPOCH + 180001);
  assert.equal((await r.post(p('late'))).error, 'PAST_DUE', 'WEB-contract §19.2/§22: sau dueAt + 2 phút dù client khai giờ cũ');
  assert.equal(ok(await r.post({ action: 'listResults', token, classId: c.classId })).results.length, 2, 'WEB-contract §19.2: không lưu bài bị từ chối');
});
check('API13', 'nộp mặc định/submitResult, idempotency đồng thời và conflict', '17.2/§19.2/§22', async () => {
  const r = await rig(); const t = await seed(r); const token = t[T1.username];
  ok(await r.post({ action: 'publishExam', token, exam: A.makeExam({ id: 'r1-exam' }) }));
  const c = await classroom(r, token, 'r1-exam');
  const p = payload('same-attempt', { class_code: c.code, assignment_id: c.assignmentId });
  const first = ok(await r.post(p));
  assert.equal(ok(await r.post({ action: 'submitResult', ...p })).status, 'ALREADY_RECORDED', 'WEB-contract §17.2/§22: retry nhận ALREADY_RECORDED');
  const repeats = await Promise.all(Array.from({ length: 8 }, () => r.post({ ...p, attempt_id: 'concurrent-attempt' })));
  repeats.forEach(x => ok(x));
  assert.equal((await r.post({ ...p, candidate_display: 'Tên đã đổi' })).error, 'PAYLOAD_CONFLICT', 'WEB-contract §17.2: cùng attempt khác nội dung hợp lệ không ghi đè');
  const rows = ok(await r.post({ action: 'listResults', token, classId: c.classId })).results;
  assert.equal(rows.length, 2, 'WEB-contract §22: chỉ hai attempt duy nhất kể cả nộp đồng thời');
  assert.ok(JSON.stringify(rows).includes('19/4'), 'WEB-contract §17.2: phân số điểm không mất độ chính xác');
  assert.ok(JSON.stringify(rows).includes('Nguyễn An'), 'WEB-contract §17.2: tên Unicode không mất');
  assert.ok(first, 'WEB-contract §17.2: receipt đọc được');
});
check('API14', 'mọi phản hồi không lộ credential, hash, salt, PIN hash', '22', async () => {
  const r = await rig(); const t = await seed(r);
  for (const action of ['adminListTeachers', 'adminStats']) ok(await r.post({ action, token: t.admin }));
  ok(await r.get({ action: 'listExams' }));
  await r.get({ action: 'getExam', id: 'not-found' });
  await r.post({ action: 'teacherLogin', username: T1.username, password: 'wrong' });
  r.responses.forEach(x => noSecrets(x, storedStrings(r.store).filter(s => /^[a-f0-9]{64,}$/i.test(s))));
});
check('API15', 'HTTP Node cục bộ dùng cùng handle: GET công khai, POST JSON', '22', async () => {
  const r = await rig(); const server = await localServer(r);
  try {
    const list = await fetch(server.url + '/api/rpc?action=listExams');
    assert.match(list.headers.get('content-type'), /application\/json/, 'WEB-contract §22: HTTP JSON đọc được'); ok(await list.json());
    const login = await fetch(server.url + '/api/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'adminLogin', password: ADMIN }) });
    ok(await login.json());
    assert.equal(server.log[1].contentType, 'application/json', 'WEB-contract §22: POST JSON bình thường');
  } finally { await server.close(); }
});
check('API16', 'trình duyệt thật qua HTTP: giáo viên đăng nhập và xem lớp', '19.1/§22', async () => {
  const r = await rig(); const t = await seed(r);
  ok(await r.post({ action: 'createClass', token: t[T1.username], name: 'Lớp R1 qua HTTP' }));
  // R1 checks transport with the existing client adapter; apiBase cutover belongs to R2.
  const staticServer = await H.startServer(required('dist'), { overrides: { 'public/config.json': JSON.stringify({ appsScriptUrl: '/api/rpc' }) } });
  const server = await localServer(r, staticServer); let browser, context;
  try {
    browser = await H.launchBrowser(); context = await browser.newContext(); const page = await context.newPage();
    await page.goto(server.url + '/index.html#/giao-vien');
    await click(page, '#btnRoleTeacher');
    await page.waitFor(() => !!document.querySelector('#teacherUsername'), 'WEB-contract §19.1: hiện cổng đăng nhập giáo viên');
    await type(page, '#teacherUsername', T1.username); await type(page, '#teacherPassword', T1.password); await click(page, '#btnTeacherLogin');
    await page.waitFor(() => document.querySelector('#teacherShell')?.getClientRects().length && document.body.innerText.includes('Lớp R1 qua HTTP'), 'WEB-contract §19.1/§22: client nhận token rồi đọc lớp qua cùng handle');
    assert.ok(server.log.some(x => x.input.action === 'teacherLogin'), 'WEB-contract §22: trình duyệt thật đã gửi đăng nhập');
    assert.ok(server.log.some(x => x.input.action === 'listMyClasses' && x.input.token), 'WEB-contract §19.2/§22: dùng token cho lần đọc sau');
  } finally { await context?.close(); await browser?.close(); await server.close(); await staticServer.close(); }
});

check('API17', 'GET không được tạo phiên hoặc thực hiện hành động cần quyền', '17.2/§19.2/§22', async () => {
  const r = await rig(); const t = await seed(r);
  for (const data of [
    { action: 'adminLogin', password: ADMIN },
    { action: 'teacherLogin', username: T1.username, password: T1.password },
    { action: 'createClass', token: t[T1.username], name: 'GET không được tạo lớp' },
    { action: 'adminCreateTeacher', token: t.admin, ...T2 },
    { action: 'listResults', token: t[T1.username], classId: 'missing' },
  ]) assert.equal((await r.get(data)).success, false, 'WEB-contract §22: GET chỉ dùng cho hành động đọc công khai');
  assert.equal(ok(await r.post({ action: 'listMyClasses', token: t[T1.username] })).classes.length, 0,
    'WEB-contract §22: GET không tạo dữ liệu');
});

check('API18', 'mã lỗi dữ liệu nộp bài giữ tương thích Apps Script', '17.2/§22', async () => {
  const r = await rig();
  const cases = [
    [{ attempt_id: undefined }, 'MISSING_ATTEMPT_ID'],
    [{ attempt_id: '' }, 'INVALID_ATTEMPT_ID'],
    [{ total: undefined }, 'MISSING_SCORE'],
    [{ total: 'abc' }, 'INVALID_SCORE'],
    [{ total: '-1' }, 'INVALID_SCORE_RANGE'],
    [{ total: '11' }, 'SCORE_EXCEEDS_MAX'],
    [{ exam_id: undefined }, 'MISSING_EXAM_ID'],
    [{ exam_version_id: undefined }, 'MISSING_EXAM_VERSION_ID'],
  ];
  for (const [patch, code] of cases) assert.equal((await r.post(payload('invalid-result', patch))).error, code,
    `WEB-contract §17.2/§22: giữ mã lỗi ${code} của API cũ`);
});

check('API19', 'học sinh nhập tên ở cổng rồi vào lớp qua cùng handle HTTP', '19.1/§22', async () => {
  const r = await rig({ now: Date.now() }); const t = await seed(r);
  const e = catalog[0]; const time = Date.now();
  const c = await classroom(r, t[T1.username], e.id, { openAt: time - 60000, dueAt: time + 3600000 });
  const staticServer = await H.startServer(required('dist'), { overrides: { 'public/config.json': JSON.stringify({ appsScriptUrl: '/api/rpc' }) } });
  const server = await localServer(r, staticServer); let browser, context;
  try {
    browser = await H.launchBrowser(); context = await browser.newContext(); const page = await context.newPage();
    await page.goto(server.url + '/index.html#/hoc-sinh');
    await click(page, '#btnRoleStudent');
    await page.waitFor(() => !!document.querySelector('#startName')?.getClientRects().length, 'WEB-contract §19.1: cổng tên hiện');
    await type(page, '#startName', 'Nguyễn An R1'); await click(page, '#btnNameContinue');
    await page.waitFor(() => !!document.querySelector('#classCodeInput')?.getClientRects().length, 'WEB-contract §19.1: qua cổng tên tới mã lớp');
    await type(page, '#classCodeInput', c.code); await click(page, '#btnJoinClass');
    const selector = `#myClasses .exam-card[data-assignment-id="${c.assignmentId}"]`;
    await page.waitFor(s => !!document.querySelector(s)?.getClientRects().length, 'WEB-contract §22: thẻ đề được giao hiện', 10000, selector);
    await click(page, selector);
    assert.ok(await page.eval(title => document.querySelector('#examPreview')?.textContent.includes(title), e.title),
      'WEB-contract §22: trình duyệt hiện tiêu đề thật từ catalog máy chủ');
    assert.ok(server.log.some(x => x.input.action === 'getClass' && x.input.code === c.code), 'WEB-contract §22: GET getClass thực sự qua handle');
  } finally { await context?.close(); await browser?.close(); await server.close(); await staticServer.close(); }
});

check('API20', 'apiBase ưu tiên hơn appsScriptUrl và POST JSON cùng nguồn (gate tích hợp R2)', '22', async () => {
  const r = await rig(); await seed(r);
  const staticServer = await H.startServer(required('dist'), { overrides: { 'public/config.json': JSON.stringify({ apiBase: '/api/rpc', appsScriptUrl: '/forbidden-legacy' }) } });
  const server = await localServer(r, staticServer); let browser, context;
  try {
    browser = await H.launchBrowser(); context = await browser.newContext(); const page = await context.newPage();
    await page.goto(server.url + '/index.html#/giao-vien');
    await click(page, '#btnRoleTeacher');
    await page.waitFor(() => !!document.querySelector('#teacherUsername')?.getClientRects().length, 'WEB-contract §19.1: cổng đăng nhập');
    await type(page, '#teacherUsername', T1.username); await type(page, '#teacherPassword', T1.password); await click(page, '#btnTeacherLogin');
    await page.waitFor(() => !!document.querySelector('#teacherShell')?.getClientRects().length, 'WEB-contract §22: đăng nhập qua apiBase');
    assert.ok(server.log.some(x => x.input.action === 'teacherLogin' && x.method === 'POST' && x.contentType?.startsWith('application/json')),
      'WEB-contract §22: apiBase gửi POST application/json bình thường');
    assert.ok(!page.requests.some(x => x.includes('/forbidden-legacy')), 'WEB-contract §22: có apiBase thì ưu tiên hơn Apps Script');
  } finally { await context?.close(); await browser?.close(); await server.close(); await staticServer.close(); }
});
