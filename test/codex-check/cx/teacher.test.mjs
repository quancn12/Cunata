// CX-PROMOTE: run from repository root.
const { pathToFileURL } = await import('node:url');
await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/runtime.mjs').href);
const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const test=(name,...args)=>{const fn=args.pop();const opts=args.pop()??{};return nodeTest(name,{...opts,timeout:Math.max(120000,opts.timeout??0)},async(...a)=>{try{return await fn(...a);}catch(e){e.message=name+'\n'+e.message;throw e;}});};
import { after, before, test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
const { launchBrowser } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const { makeExam, waitBoot, enterStudentArea, startFromCard, pickOption, submit } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const { setup, teacher, visible, evidence, screenshot, openTeacher, login, loggedIn, nav, createClass, assignDialog, dateKeys, sleep }=await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/teacher/helpers.mjs').href);
let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
const run = (name, fn, options) => test(name, { timeout: 120000 }, () => setup(browser, fn, options));







run("dist: [teacher] CX-teacher-F01: hết phiên phải báo phiên hết hạn, không báo sai mật khẩu (WEB-contract §19.2)", async ({ ctx, server, gas }) => {
  const p = await openTeacher(ctx, server); await login(p); await loggedIn(p);
  for (const key of gas.gas.props.keys()) if (key.startsWith('session:')) {
    const value = JSON.parse(gas.gas.props.get(key)); value.expiresAt = '2000-01-01T00:00:00.000Z';
    gas.gas.props.set(key, JSON.stringify(value)); gas.gas.cache.delete(key);
  }
  await nav(p, 'lop');
  await p.waitFor(() => /mật khẩu|phiên|đăng nhập/i.test((document.querySelector('#teacherClassGrid')?.innerText || '')+(document.querySelector('#teacherLoginError')?.innerText || '')), 'expired session response', 20000);
  const state = await p.eval(() => ({ login: document.querySelector('#teacherLogin').innerText, shell: document.querySelector('#teacherShell').innerText }));
  evidence('expired', state); await screenshot(p, 'expired');
  assert.match(state.shell + state.login, /hết hạn|hết phiên|phiên đăng nhập không hợp lệ|đăng nhập lại/i, 'phải giải thích phiên đã hết hiệu lực');
});

run("dist: [teacher] CX-teacher-F02: giáo viên chỉ thấy đề của mình cùng kho đề chung (WEB-contract §19.1)", async ({ ctx, server, gas, admin }) => {
  const other = { username: 'cxother', name: 'Giáo viên khác', password: 'Other-test-2026' };
  gas.gas.post({ action: 'adminCreateTeacher', token: admin, ...other });
  const token2 = gas.gas.post({ action: 'teacherLogin', ...other }).token;
  const exam = makeExam({ id: 'cx-other-private', title: 'Đề của giáo viên khác' });
  assert.equal(gas.gas.post({ action: 'publishExam', token: token2, exam }).success, true);
  const p = await openTeacher(ctx, server); await login(p); await loggedIn(p); await nav(p, 'de');
  await p.waitFor(() => document.querySelectorAll('#teacherExamGrid [data-exam-id]').length > 0, 'teacher exam list');
  const rows = await p.eval(() => [...document.querySelectorAll('#teacherExamGrid [data-exam-id]')].map(e => ({ id: e.dataset.examId, text: e.innerText })));
  evidence('ownership', rows); await screenshot(p, 'ownership');
  assert.equal(rows.some(r => r.id === exam.examId), false, 'WEB §19: mỗi giáo viên chỉ thấy đề của mình');
});





async function resultFixture({ ctx, server, gas, token }, name = 'Nguyễn Học Sinh CX') {
  const exam = makeExam({ id: 'cx-result', title: 'Đề kết quả CX', part1: ['a', 'b'], part2: [], part3: [] });
  assert.equal(gas.gas.post({ action: 'publishExam', token, exam }).success, true);
  const cls = gas.gas.post({ action: 'createClass', token, name: 'Lớp kết quả CX' });
  const assignment = gas.gas.post({ action: 'assignExam', token, classId: cls.classId, examId: exam.examId, openAt: new Date(Date.now() - 3600000).toISOString(), dueAt: new Date(Date.now() + 3600000).toISOString() });
  assert.equal(assignment.success, true);
  const p = await openTeacher(ctx, server); await login(p); await loggedIn(p);
  const sctx = await browser.newContext();
  try {
    const s = await sctx.newPage(); await s.goto(`${server.url}#/hoc-sinh`); await waitBoot(s);
    await enterStudentArea(s, { name });
    await s.type('#classCodeInput', cls.code); await s.click('#btnJoinClass');
    const selector = `.class-section[data-class-code="${cls.code}"] [data-assignment-id="${assignment.assignmentId}"]`;
    await s.waitFor(q => !!document.querySelector(q), 'joined class exam', 10000, selector);
    await startFromCard(s, selector); await pickOption(s, 'ck-i-01', 'a'); await submit(s);
    await s.waitFor(() => /Đã gửi/.test(document.querySelector('#syncText')?.textContent || ''), 'server acknowledged result', 20000);
    assert.equal(gas.gas.sheets.get('KetQua').getLastRow(), 2);
    await nav(p, 'ket-qua');
    await p.waitFor(n => document.querySelector('#resultsTable')?.innerText.includes(n), 'teacher sees submitted student', 10000, name);
    await screenshot(p, 'results');
    const table = await p.eval(() => document.querySelector('#resultsTable').innerText);
    evidence('results-flow', { name, classCode: cls.code, table, requests: gas.log.filter(l => l.body).map(l => JSON.parse(l.body).action || 'submitResult') });
    return { p, cls, assignment, exam, table };
  } finally { await sctx.close(); }
}

run("dist: [teacher] CX-teacher-F03: bài nộp hiện ở bảng và CSV với điểm theo D02 (WEB-contract §14 D02, §19.1)", async env => {
  const { p, table } = await resultFixture(env);
  await p.click('#btnExportResults'); const csv = await env.ctx.waitDownload();
  evidence('results-csv', csv);
  assert.match(table, /0,25\s*\/\s*0,50/, 'Phần I và tổng phải hiện 0,25 / 0,50, không để nguyên phân số');
  assert.match(csv.text, /0,25\s*\/\s*0,50/);
});

run("dist: [teacher] CX-teacher-F04: kết quả có thể chọn lớp và đề được giao (WEB-contract §19.1)", async env => {
  const { p, cls, exam } = await resultFixture(env);
  const second = makeExam({ id: 'cx-second', title: 'Đề thứ hai CX', part1: ['a'], part2: [], part3: [] });
  env.gas.gas.post({ action: 'publishExam', token: env.token, exam: second });
  env.gas.gas.post({ action: 'assignExam', token: env.token, classId: cls.classId, examId: second.examId, openAt: new Date(Date.now() - 3600000).toISOString(), dueAt: new Date(Date.now() + 3600000).toISOString() });
  await nav(p, 'lop'); await nav(p, 'ket-qua');
  await p.waitFor(() => document.querySelector('#resultsTable')?.innerText.includes('Nguyễn Học Sinh CX'), 'results loaded');
  const filters = await p.eval(() => [...document.querySelectorAll('#teacherMainContent select')].map(s => ({ id: s.id, options: [...s.options].map(o => ({ value: o.value, text: o.textContent })) })));
  evidence('results-filters', filters);
  assert.ok(filters.some(s => s.options.some(o => [exam.examId, second.examId].includes(o.value) || /Đề kết quả CX|Đề thứ hai CX/.test(o.text))), 'WEB §19.1: cần bộ chọn đề, không chỉ chọn lớp');
});

run("dist: [teacher] CX-teacher-F05: CSV chặn tiền tố công thức fullwidth theo WEB §7 (WEB-contract §7, §19.1)", async env => {
  const { p } = await resultFixture(env, '＝1+1');
  await p.click('#btnExportResults'); const csv = await env.ctx.waitDownload(); evidence('csv-formula', csv);
  assert.match(csv.text, /"'＝1\+1"/, 'tên bắt đầu fullwidth equals phải được mã hóa an toàn khi xuất CSV');
});



run("dist: [teacher] CX-teacher-F07: sửa nội dung câu I không được tự đổi đáp án có ID opt-1…4 (WEB-contract §19.1)", async ({ ctx, server, gas, token }) => {
  const exam = makeExam({ id: 'cx-edit-key', title: 'Đề kiểm tra giữ đáp án', part1: ['a'], part2: [], part3: [] });
  exam.questions[0].options.forEach((o, i) => { o.optionId = `opt-${i + 1}`; }); exam.questions[0].correctOptionId = 'opt-1';
  assert.equal(gas.gas.post({ action: 'publishExam', token, exam }).success, true);
  const p = await openTeacher(ctx, server); await login(p); await loggedIn(p); await nav(p, 'de');
  await p.waitFor(() => !!document.querySelector('[data-exam-id="cx-edit-key"] .btn-teacher-edit'), 'edit key exam');
  await p.click('[data-exam-id="cx-edit-key"] .btn-teacher-edit');
  await p.waitFor(() => !!document.querySelector('#builderQuestionsContainer .btn-q-edit'), 'question edit button');
  await p.click('#builderQuestionsContainer .btn-q-edit');
  const checkedOnOpen = await p.eval(() => document.querySelector('input[name="editCorrectOpt_0"]:checked')?.value);
  await p.type('#editQContent_0', 'Nội dung câu hỏi đã sửa, giữ đáp án A');
  await p.click('.btn-q-save-edit'); await p.click('#btnPublishExam');
  await p.waitFor(() => /Đã xuất bản/.test(document.querySelector('#teacherPublishStatus')?.textContent || ''), 'updated exam published');
  const actual = gas.gas.get({ action: 'getExam', id: exam.examId }).exam;
  evidence('edited-key', { checkedOnOpen, expected: exam.questions[0].correctOptionId, actual: actual.questions[0], original: exam.questions[0] });
  assert.equal(actual.questions[0].correctOptionId, 'opt-1', 'chỉ sửa nội dung phải giữ nguyên correctOptionId');
});



run("dist: [teacher] CX-teacher-F08: tải lại đường dẫn Đề thi giữ đúng mục đang chọn (WEB-contract §19.1)", async ({ ctx, server }) => {
  const p = await openTeacher(ctx, server); await login(p); await loggedIn(p); await nav(p, 'de');
  assert.equal(await p.eval(() => location.hash), '#/giao-vien/de');
  await p.reload(); await loggedIn(p);
  const state = await p.eval(() => ({ hash: location.hash, nav: document.querySelector('#teacherNav [aria-current="page"]')?.dataset.nav, text: document.querySelector('#teacherMainContent').innerText }));
  evidence('route-reload', state);
  assert.equal(state.nav, 'de', 'WEB §19.1: #/giao-vien/de phải hiển thị Đề thi sau reload');
});

// All contexts and local servers are already closed; release residual CDP TCP handles.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='Socket'&&h.remoteAddress==='127.0.0.1'&&![process.stdin,process.stdout,process.stderr].includes(h))h.destroy();});

// Chrome has already received Browser.close and kill from the harness.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='ChildProcess'&&/(?:chrome|msedge)(?:\.exe)?$/i.test(h.spawnfile??''))h.unref();});
