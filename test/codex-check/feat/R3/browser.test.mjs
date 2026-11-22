import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { H, A, fixture, roster, names, teacherPage, studentPage, join, pinLogin, ok, loginStudent, submission,
  click, type, visible, localSite, launchManagedBrowser, requirement as R } from './support.mjs';

let browser;
before(async () => { browser = await launchManagedBrowser(); });
after(async () => { await browser?.close(); });
function ui(region, title, fn, width = 1280) {
  test(`dist: [${region}] R3: ${title} (WEB-contract §23)`, { timeout: 90000 }, async t => {
    const f = await fixture(); const site = await localSite(f); const ctx = await browser.newContext();
    const pages = [];
    try {
      // All tested app requests must use loopback fixtures. There is no live URL
      // in the overridden config and no environment-dependent test behavior.
      const pageContext = { newPage: async () => {
        const p = await ctx.newPage(); await p.setViewport(width, 900, width < 600);
        pages.push(p);
        await p.send('Network.setBlockedURLs', { urls: ['https://*'] });
        return p;
      } };
      await fn({ f, site, ctx, pageContext, t });
      assert.ok(site.log.length > 0, R('trình duyệt thực sự gọi máy chủ Node cục bộ'));
      assert.equal(site.log.some(x => x.response?.adapterError), false, R('không có lỗi HTTP adapter'));
    } catch (error) {
      const key = createHash('sha256').update(t.name).digest('hex').slice(0, 12);
      const evidence = {test:t.name, error:String(error), rpc:site.log.map(x=>({action:x.action,success:x.response?.success,error:x.response?.error}))};
      if (pages.length) {
        const p = pages.at(-1);
        evidence.page = await p.eval(() => ({text:document.body.innerText, url:location.href})).catch(e=>({error:String(e)}));
        evidence.errors = p.errors;
        const shot = await p.send('Page.captureScreenshot', {format:'png'}).catch(()=>null);
        if (shot) writeFileSync(new URL(`./failure-${key}.png`, import.meta.url), Buffer.from(shot.data,'base64'));
      }
      writeFileSync(new URL(`./failure-${key}.json`, import.meta.url), JSON.stringify(evidence,null,2));
      throw error;
    } finally { await ctx.close(); await site.close(); }
  });
}

ui('glue', 'tiền điều kiện: dist dùng apiBase cục bộ, đăng nhập và mở chi tiết lớp bằng chuột thật', async ({f, site, pageContext}) => {
  const p = await teacherPage(pageContext, site, f.cls);
  await visible(p, '#btnAssignExam');
  assert.ok(site.log.some(x => x.action === 'teacherLogin' && x.response.success), R('đăng nhập qua handle thật (§22)'));
  assert.ok(site.log.some(x => x.action === 'listAssignments' && x.response.success), R('mở chi tiết lớp có sẵn trước R3'));
});

for (const width of [375, 768, 1440]) {
  ui('teacher', `chi tiết lớp hiện rosterPanel, textarea và các nút trong khung nhìn ${width}px`, async ({ f, site, pageContext }) => {
    const p = await teacherPage(pageContext, site, f.cls);
    await visible(p, '#rosterPanel');
    for (const s of ['textarea#rosterInput', '#btnRosterSave', '#btnRosterPrint']) {
      await visible(p, s);
      assert.equal(await p.eval(sel => {
        const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' });
        const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      }, s), true, R(`${s} không tràn khung nhìn`));
    }
  }, width);
}

ui('teacher', 'nhập mỗi dòng một tên, hiện PIN mới và tải lại vẫn đủ tên', async ({ f, site, pageContext }) => {
  const p = await teacherPage(pageContext, site, f.cls);
  await type(p, '#rosterInput', names.join('\n')); await click(p, '#btnRosterSave');
  await p.waitFor(n => document.querySelectorAll('#rosterPanel .roster-row[data-student-id]').length === n, R('lưu hiện đủ hàng học sinh'), 5000, names.length);
  const data = await p.eval(() => [...document.querySelectorAll('#rosterPanel .roster-row')].map(e => ({ id: e.dataset.studentId, text: e.innerText })));
  assert.equal(new Set(data.map(r => r.id)).size, names.length, R('mỗi hàng mang student ID riêng'));
  for (const name of names) assert.ok(data.some(r => r.text.includes(name) && /\b\d{4}\b/.test(r.text)), R(`hàng hiện tên ${name} và PIN`));
  assert.ok(site.log.some(x => x.action === 'addStudents' && x.body.names.join('\n') === names.join('\n') && x.response.success), R('lưu gọi addStudents thật'));
  await p.goto(site.url); await visible(p, '#teacherShell');
  await click(p, '#teacherNav a[data-nav="lop"]'); await click(p, `.class-card[data-class-id="${f.cls.classId}"] h3`);
  await p.waitFor(n => document.querySelectorAll('#rosterPanel .roster-row').length === n, R('tải lại giữ danh sách trên máy chủ'), 5000, names.length);
});
ui('teacher', 'nút reset PIN và xóa tác động đúng hàng trên máy chủ', async ({ f, site, pageContext }) => {
  const [s, other] = await roster(f); const p = await teacherPage(pageContext, site, f.cls);
  const row = `.roster-row[data-student-id="${s.studentId}"]`;
  await click(p, `${row} .btn-reset-pin`);
  await p.waitFor(() => !!document.querySelector('#rosterPanel'), R('reset giữ màn danh sách'), 5000);
  for (let i = 0; i < 100 && !site.log.some(x => x.action === 'resetPin'); i++) await H.sleep(50);
  const reset = site.log.find(x => x.action === 'resetPin' && x.body.studentId === s.studentId);
  assert.ok(reset?.response.success, R('nút reset gọi API đúng học sinh'));
  assert.notEqual(reset.response.pin, s.pin, R('reset thay PIN'));
  assert.ok((await p.eval(q => document.querySelector(q)?.innerText ?? '', row)).includes(reset.response.pin), R('hiện PIN mới cho giáo viên'));
  await click(p, `${row} .btn-remove-student`);
  await p.waitFor(id => !document.querySelector(`.roster-row[data-student-id="${id}"]`), R('xóa loại hàng khỏi UI'), 5000, s.studentId);
  assert.ok(site.log.some(x => x.action === 'removeStudent' && x.body.studentId === s.studentId && x.response.success), R('xóa gọi API thật'));
  assert.ok(f.store.students.has(other.studentId), R('xóa không ảnh hưởng học sinh khác'));
});
ui('teacher', 'in danh sách tên và PIN bằng nút rosterPrint', async ({ f, site, pageContext }) => {
  const ss = await roster(f); const p = await teacherPage(pageContext, site, f.cls);
  // Observe native beforeprint; do not replace window.print with a success stub.
  await p.eval(() => {
    const observe = target => target.addEventListener('beforeprint', () => { window.__r3Printed = target.document.body.innerText; });
    observe(window);
    const nativeOpen = window.open.bind(window);
    window.open = (...args) => { const child = nativeOpen(...args); if (child) observe(child); return child; };
  });
  await click(p, '#btnRosterPrint');
  await p.waitFor(() => typeof window.__r3Printed === 'string', R('nút in gọi luồng in trình duyệt thật'), 5000);
  const text = await p.eval(() => window.__r3Printed);
  for (const s of ss) { assert.ok(text.includes(s.name), R('bản in có tên')); assert.ok(text.includes(s.pin), R('bản in có PIN')); }
});

ui('student', 'lớp chưa có danh sách hiện thông báo nhờ giáo viên thêm tên', async ({ f, site, pageContext }) => {
  const p = await studentPage(pageContext, site); await join(p, f.cls.code);
  await p.waitFor(() => /Lớp chưa có danh sách học sinh\s*[—–-]\s*nhờ giáo viên thêm tên em/i.test(document.body.innerText), R('lớp rỗng hiện thông báo quy định, không cho dùng tên tự do'), 5000);
  assert.equal(await p.eval(() => document.querySelectorAll('#myClasses .exam-card[data-assignment-id]').length), 0, R('chưa có danh sách không được bỏ qua PIN để làm bài'));
});
ui('student', 'mã lớp hiện tên để chọn, PIN sai có pinError và không mở bài', async ({ f, site, pageContext }) => {
  const ss = await roster(f); const p = await studentPage(pageContext, site); await join(p, f.cls.code);
  for (const s of ss) {
    const sel = `#rosterPick .roster-name[data-student-id="${s.studentId}"]`;
    await visible(p, sel);
    assert.ok((await p.eval(q => document.querySelector(q).innerText, sel)).includes(s.name), R('cổng lớp hiện tên danh sách'));
  }
  const s = ss[0]; await click(p, `#rosterPick .roster-name[data-student-id="${s.studentId}"]`);
  await type(p, '#studentPinInput', s.pin === '0000' ? '0001' : '0000'); await click(p, '#btnPinConfirm');
  await visible(p, '#pinError');
  assert.ok((await p.eval(() => document.querySelector('#pinError').innerText)).trim(), R('sai PIN hiện lỗi có nội dung'));
  assert.equal(await A.isVisible(p, 'examWrapper'), false, R('PIN sai không vào bài'));
  assert.ok(site.log.some(x => x.action === 'studentLogin' && x.response.success === false), R('PIN sai do máy chủ kiểm'));
});

ui('student', 'đúng PIN dùng tên danh sách, nộp student_id rồi máy sạch khác dựng lại đầy đủ báo cáo', async ({ f, site, pageContext }) => {
  const [s] = await roster(f); const p = await studentPage(pageContext, site);
  await pinLogin(p, f, s);
  const card = `#myClasses .class-section[data-class-code="${f.cls.code}"] .exam-card[data-assignment-id="${f.assignment.assignmentId}"]`;
  await click(p, card); await click(p, '#btnStartExam'); await visible(p, '#examWrapper');
  assert.equal(await p.eval(() => { const e = document.querySelector('#candidateName'); return e.value ?? e.textContent; }), s.name, R('tên trong lớp từ danh sách, thay tên tự gõ ở cổng'));
  assert.equal(await p.eval(() => { const e = document.querySelector('#candidateName'); return e.tagName !== 'INPUT' || e.readOnly || e.disabled; }), true, R('không gõ tên tự do trong lớp'));
  await click(p, '[data-qid="ck-i-01"][data-option-id="ck-i-01-a"]');
  for (const [i, answer] of [true, false, true, false].entries()) {
    await click(p, `#qcard-ck-ii-01 .statement-row:nth-child(${i + 1}) .tf-btn[data-val="${answer}"]`);
  }
  await type(p, '#qcard-ck-iii-01 .short-answer-input', '1,5');
  await click(p, '#btnSubmit'); await click(p, '#btnConfirmSubmit'); await A.waitReport(p);
  await p.waitFor(() => /Đã gửi/.test(document.querySelector('#syncText')?.textContent ?? ''), R('chỉ báo đã gửi sau nhận máy chủ'), 10000);
  const sent = site.log.find(x => x.action === 'submitResult' && x.response.success);
  assert.equal(sent?.body.student_id, s.studentId, R('nộp bài thật mang student_id'));
  const first = await A.readReport(p);
  assert.deepEqual(first.total, [10, 10], R('lượt nộp ba phần đạt 10/10 trước khi thử máy khác'));
  assert.deepEqual([first.I, first.II, first.III], [[0.25,0.25],[1,1],[8.75,8.75]], R('báo cáo gốc đủ điểm từng phần, không so sánh null với null'));
  const fresh = await browser.newContext();
  try {
    const protectedFresh = {newPage:async () => {
      const p = await fresh.newPage(); await p.setViewport(1280, 900);
      await p.send('Network.setBlockedURLs', {urls:['https://*']}); return p;
    }};
    const second = await studentPage(protectedFresh, site);
    assert.equal(await second.eval(() => localStorage.getItem('cunata:active_exam_snapshot')), null, R('máy mới chưa mang snapshot từ máy cũ'));
    await pinLogin(second, f, s);
    await visible(second, card);
    const text = await second.eval(q => document.querySelector(q).innerText, card);
    assert.match(text, /Đã nộp/, R('máy khác có trạng thái đã nộp từ máy chủ'));
    assert.match(text, /10/, R('thẻ đề hiện điểm đã nộp'));
    await click(second, card); await visible(second, '#btnStartExam');
    assert.match(await second.eval(() => document.querySelector('#btnStartExam').innerText), /Xem kết quả/, R('bài nộp mở bằng Xem kết quả'));
    await click(second, '#btnStartExam'); await A.waitReport(second);
    const report = await A.readReport(second);
    assert.deepEqual(report.total, first.total, R('báo cáo máy mới giữ tổng điểm'));
    for (const section of ['I', 'II', 'III']) assert.deepEqual(report[section], first[section], R(`máy mới giữ điểm phần ${section}`));
    assert.ok(report.reportText.includes(f.exam.title), R('báo cáo đúng tên đề (§20)'));
    const reviewed = await second.eval(() => [...document.querySelectorAll('#reportWrapper .review-question-card')].map(e => ({
      id: e.dataset.qid, text: e.innerText,
      options: [...e.querySelectorAll('.review-option')].map(o => ({id:o.dataset.optionId, text:o.innerText, correct:o.dataset.correct, chosen:o.dataset.chosen})),
      statements: [...e.querySelectorAll('.review-statement')].map(o => ({id:o.dataset.statementId, text:o.innerText, key:o.dataset.key, chosen:o.dataset.chosen})),
      short: e.querySelector('.review-short-answer')?.textContent ?? '',
      explanation: e.querySelector('.explanation-box')?.textContent ?? '',
    })));
    assert.deepEqual(reviewed.map(r => r.id), f.exam.questions.map(q => q.questionVersionId), R('dựng đủ câu đúng thứ tự (§20)'));
    assert.equal(reviewed[0].options.length, 4, R('máy khác hiện đủ phương án (§20)'));
    for (const [i,o] of reviewed[0].options.entries()) {
      assert.equal(o.id, f.exam.questions[0].options[i].optionId, R('giữ thứ tự phương án (§20)'));
      assert.ok(o.text.includes(f.exam.questions[0].options[i].text), R('toàn văn phương án (§20)'));
    }
    assert.equal(reviewed[0].options[0].correct, 'true', R('đánh dấu đáp án đúng (§20)'));
    assert.equal(reviewed[0].options[0].chosen, 'true', R('đánh dấu lựa chọn học sinh (§20)'));
    assert.equal(reviewed[1].statements.length, 4, R('máy khác hiện đủ mệnh đề (§20)'));
    for (const [i,o] of reviewed[1].statements.entries()) {
      const original = f.exam.questions[1].statements[i];
      assert.equal(o.id, original.statementId, R('đúng ID mệnh đề (§20)'));
      assert.ok(o.text.includes(original.text), R('toàn văn mệnh đề (§20)'));
      assert.equal(o.key, String(original.answer), R('đúng đáp án mệnh đề (§20)'));
      assert.equal(o.chosen, String(original.answer), R('giữ câu trả lời Đúng/Sai (§20)'));
    }
    assert.match(reviewed[2].text, /1,5/, R('máy khác giữ câu trả lời ngắn nguyên văn (§20)'));
    assert.match(reviewed[2].short, /Bạn điền:\s*1,5/, R('báo cáo máy khác có câu trả lời ngắn (§20)'));
    assert.match(reviewed[2].short, /Đáp án:\s*1,5/, R('báo cáo máy khác có đáp án ngắn (§20)'));
    for (const [i, q] of reviewed.entries()) {
      assert.ok(q.text.includes(f.exam.questions[i].content), R('báo cáo có toàn văn đề bài (§20)'));
      assert.ok(q.explanation.trim(), R('báo cáo có lời giải (§20)'));
    }
    assert.ok(site.log.some(x => x.action === 'myResults' && x.response.success), R('máy mới dùng myResults thật'));
  } finally { await fresh.close(); }
});

ui('student', 'PIN sai năm lần hiện khóa do máy chủ, tải lại không bỏ được khóa', async ({f, site, pageContext}) => {
  const [s] = await roster(f); const p = await studentPage(pageContext, site);
  await join(p, f.cls.code); await click(p, `#rosterPick .roster-name[data-student-id="${s.studentId}"]`);
  const bad = s.pin === '0000' ? '0001' : '0000';
  for (let i=0; i<5; i++) {
    await type(p, '#studentPinInput', bad); await click(p, '#btnPinConfirm');
    await p.waitFor(() => !!document.querySelector('#pinError')?.innerText.trim(), R('sai PIN có thông báo'), 5000);
    for (let n=0;n<100 && site.log.filter(x=>x.action==='studentLogin').length<i+1;n++) await H.sleep(50);
    assert.equal(site.log.filter(x=>x.action==='studentLogin').length, i+1, R('mỗi lần PIN do máy chủ kiểm'));
  }
  await p.waitFor(() => /khóa|10 phút/i.test(document.querySelector('#pinError')?.innerText ?? ''), R('báo khóa PIN bằng tiếng Việt'), 5000);
  const freshContext = await browser.newContext();
  try {
    const freshPages = {newPage:async () => {
      const p = await freshContext.newPage(); await p.send('Network.setBlockedURLs', {urls:['https://*']}); return p;
    }};
    const fresh = await studentPage(freshPages, site);
    await pinLogin(fresh, f, s); await visible(fresh, '#pinError');
    assert.ok(site.log.some(x=>x.action==='studentLogin' && x.body.pin===s.pin && x.response.error==='PIN_LOCKED'), R('đúng PIN ở client mới vẫn PIN_LOCKED'));
  } finally { await freshContext.close(); }
});

ui('teacher', 'bảng kết quả liệt kê cả học sinh chưa nộp, không chỉ các lượt đã gửi', async ({ f, site, pageContext }) => {
  const [s] = await roster(f); const logged = await loginStudent(f, s);
  ok(await f.call('submitResult', submission(f, s, logged.studentToken)), 'fixture một học sinh đã nộp');
  const p = await teacherPage(pageContext, site);
  await click(p, '#teacherNav a[data-nav="ket-qua"]'); await visible(p, '#resultsTable');
  // One fixture class: choose it using the native select keyboard, no JS value assignment.
  await p.waitFor(() => document.querySelector('#resultsClassSelect')?.options.length > 1, R('chờ danh sách lớp tải xong trước khi chọn'), 10000);
  await click(p, '#resultsClassSelect'); await p.press('ArrowDown'); await p.press('Enter');
  await p.waitFor(() => document.querySelector('#resultsExamSelect')?.options.length > 1, R('chờ danh sách bài giao trước khi chọn'), 10000);
  await click(p, '#resultsExamSelect'); await p.press('ArrowDown'); await p.press('Enter');
  for (const name of names.slice(1)) await p.waitFor(n => [...document.querySelectorAll('#resultsTable tbody tr')].some(r => r.innerText.includes(n) && r.innerText.includes('Chưa nộp')), R(`bảng có ${name} với Chưa nộp`), 5000, name);
  await p.waitFor(n => [...document.querySelectorAll('#resultsTable tbody tr')].some(r => r.innerText.includes(n) && !r.innerText.includes('Chưa nộp') && /10/.test(r.innerText)), R('học sinh đã nộp hiện điểm trong cùng bảng'), 5000, s.name);
});
