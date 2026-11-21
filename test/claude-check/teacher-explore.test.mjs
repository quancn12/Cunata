// 7 lỗi khi thi thử như giáo viên thật (docs/reviews/EXPLORE-gv.md, 21/11/2026) + lỗi Trưởng phòng chụp (hai chỗ chọn đề).
// Trưởng phòng duyệt "Sửa cả 6" và "chỉ giữ ô xổ xuống". Mỗi ca tái hiện đúng một lỗi trên bản build, Apps Script giả lập, bấm bằng chuột thật.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { launchBrowser, sleep } from './harness.mjs';
import { TARGETS, makeExam, mouseClick, onRoleChooser, waitBoot } from './app.mjs';
import { classroomServer, seedClass, seedTeacher, TEACHER } from './classroom.mjs';

const dist = TARGETS.find((t) => t.name === 'dist');
const DOCX = join(process.cwd(), 'test', 'claude-check', 'fixtures', 'teacher-import.docx');
let browser, env, token;
before(async () => { browser = await launchBrowser(); env = await classroomServer(dist.dir); token = seedTeacher(env.gas); });
after(async () => { await env?.close(); await browser?.close(); });

const type = async (page, sel, text) => {
  await page.eval((s) => { const e = document.querySelector(s); e.focus(); e.value = ''; }, sel);
  await page.send('Input.insertText', { text });
  await page.eval((s) => document.querySelector(s).dispatchEvent(new Event('input', { bubbles: true })), sel);
};
async function teacher(w = 1366, h = 768) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.setViewport(w, h, w < 600);
  await page.goto(env.server.url + '?teacher'); await waitBoot(page);
  if (await onRoleChooser(page)) await page.click('#btnRoleTeacher');
  await page.waitFor(() => !!document.querySelector('#teacherLogin input#teacherUsername'), 'màn đăng nhập giáo viên', 10000);
  await type(page, '#teacherUsername', TEACHER.username); await type(page, '#teacherPassword', TEACHER.password);
  await page.click('#btnTeacherLogin');
  await page.waitFor(() => !!document.querySelector('#teacherNav a[data-nav="lop"]'), 'đăng nhập xong', 12000);
  return { ctx, page };
}
const nav = async (page, where) => {
  await page.click(`#teacherNav a[data-nav="${where}"]`);
  await page.waitFor((w) => document.querySelector(`#teacherNav a[data-nav="${w}"]`)?.getAttribute('aria-current') === 'page', 'mục ' + where, 5000, where);
};
const selectValue = (page, sel, value) => page.eval((s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); }, sel, value);
async function openBuilder(page) {
  await nav(page, 'de');
  await page.waitFor(() => !!document.getElementById('btnTeacherNewExam'), 'thư viện đề có nút soạn đề mới', 8000);
  await mouseClick(page, '#btnTeacherNewExam');
  await page.waitFor(() => document.getElementById('builderModal')?.getClientRects().length > 0, 'mở trình soạn đề #builderModal', 8000);
}
async function importDocx(page) {
  await mouseClick(page, '#btnImportDocx');
  await page.setFiles('#docxFileInput', [DOCX]);
  await page.waitFor(() => document.getElementById('previewModal')?.getClientRects().length > 0, 'xem trước DOCX #previewModal', 15000);
}
function seedTwoAssignments() {
  const stamp = Date.now();
  const exam = makeExam({ id: 'gv-lap-lai-' + stamp, title: 'Bài tập Toán giao hai lần', part1: ['a'], part2: [], part3: [] });
  assert.equal(env.gas.gas.post({ action: 'publishExam', token, exam }).success, true);
  const cls = seedClass(env.gas, [exam.examId], { token, name: 'Lớp giao lặp ' + stamp });
  const second = env.gas.gas.post({ action: 'assignExam', token, classId: cls.classId, examId: exam.examId, openAt: new Date(Date.now() - 60000).toISOString(), dueAt: '' });
  assert.equal(second.success, true, 'giao lần hai, không hạn nộp (WEB-contract 19.2a): ' + JSON.stringify(second));
  for (const [i, name] of ['Nguyễn Minh An', 'Trần Hà Vy'].entries()) {
    const r = env.gas.gas.post({ action: 'submitResult', attempt_id: `gv-lap-${stamp}-${i}`, exam_id: exam.examId, exam_version_id: exam.examVersionId, candidate_display: name,
      started_at: new Date(Date.now() - 30000).toISOString(), submitted_at: new Date().toISOString(), class_code: cls.code,
      assignment_id: i ? second.assignmentId : cls.assignments[0].assignmentId,
      sections: { I: { score: i ? '0' : '1/4', max: '1/4' }, II: { score: '0', max: '0' }, III: { score: '0', max: '0' } }, total: i ? '0' : '1/4', maxTotal: '1/4' });
    assert.equal(r.success, true, 'nộp bài giả lập: ' + JSON.stringify(r));
  }
  return { exam, cls };
}
async function openResults(page, classId) {
  await nav(page, 'ket-qua');
  await page.waitFor((c) => [...(document.getElementById('resultsClassSelect')?.options ?? [])].some((o) => o.value === c), 'chọn được lớp ở mục Kết quả', 10000, classId);
  await selectValue(page, '#resultsClassSelect', classId);
  await page.waitFor(() => { const t = document.getElementById('resultsTable')?.innerText ?? ''; return /Trần Hà Vy/.test(t) && /Nguyễn Minh An/.test(t); }, 'Tất cả đề: thấy 2 bài nộp', 10000);
}

test('dist: [teacher] EX-GV-01 nhập đề từ DOCX, xác nhận, rồi xuất bản: thành công, không lỗi kỹ thuật "read only property" (WEB-contract §8, §19.2)', async () => {
  const { ctx, page } = await teacher();
  try {
    await openBuilder(page); await importDocx(page);
    await mouseClick(page, '#previewModal .preview-btn');
    await mouseClick(page, '#previewModal .btn-success');
    await page.waitFor(() => !document.getElementById('previewModal')?.getClientRects().length, 'đóng xem trước sau khi nhập vào đề', 8000);
    await mouseClick(page, '#btnPublishExam');
    const st = await page.waitFor(() => { const t = document.getElementById('teacherPublishStatus')?.textContent ?? ''; return /Đã xuất bản|Lỗi/.test(t) ? t : null; }, 'trạng thái xuất bản', 15000);
    assert.doesNotMatch(st, /read only|Cannot assign|Lỗi/i, `xuất bản đề nhập từ DOCX phải thành công; thực tế: "${st}"`);
  } finally { await ctx.close(); }
});

test('dist: [teacher] EX-GV-02 Kết quả: lọc theo một đề được giao HAI lần thì vẫn thấy bài nộp của cả hai lần giao (WEB-contract §19.1)', async () => {
  const { exam, cls } = seedTwoAssignments();
  const { ctx, page } = await teacher();
  try {
    await openResults(page, cls.classId);
    const opts = await page.eval((id, title) => [...document.getElementById('resultsExamSelect').options].filter((o) => o.value.includes(id) || o.textContent.includes(title)).map((o) => o.value), exam.examId, exam.title);
    assert.ok(opts.length >= 1, 'menu lọc đề phải có đề này');
    const seen = [];
    for (const v of opts) { await selectValue(page, '#resultsExamSelect', v); await sleep(500); seen.push(await page.eval(() => document.getElementById('resultsTable').innerText)); }
    assert.ok(seen.some((t) => /Nguyễn Minh An/.test(t)) && seen.some((t) => /Trần Hà Vy/.test(t)),
      `lọc theo đề giao hai lần phải xem được bài của cả hai lần giao; thực tế: ${JSON.stringify(seen.map((t) => t.replace(/\s+/g, ' ').slice(0, 120)))}`);
  } finally { await ctx.close(); }
});

test('dist: [teacher][ui] EX-GV-03 điện thoại 390px: bảng Kết quả thấy đủ tên, phần I/II/III và tổng điểm, không phải kéo ngang (WEB-contract §9, §19.1)', async () => {
  const { cls } = seedTwoAssignments();
  const { ctx, page } = await teacher(390, 844);
  try {
    await openResults(page, cls.classId);
    const m = await page.eval(() => {
      const t = document.getElementById('resultsTable');
      const leaves = [...t.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent || '').trim() && e.getClientRects().length);
      return { iw: innerWidth, sw: document.documentElement.scrollWidth,
        clipped: leaves.filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map((e) => e.textContent.trim()).slice(0, 6) };
    });
    assert.equal(m.iw, 390, 'mục Kết quả không được làm điện thoại tự thu nhỏ trang');
    assert.ok(m.sw <= 390, `trang Kết quả rộng ${m.sw}px > 390px`);
    assert.deepEqual(m.clipped, [], 'mọi chữ trong bảng kết quả phải nằm trong màn hình (không phải kéo ngang mới thấy phần II/III/tổng)');
  } finally { await ctx.close(); }
});

test('dist: [teacher] EX-GV-04 trình soạn đề không hiện thuật ngữ kỹ thuật (JSON chuẩn domain, không cần server, Exam ID, Version ID, revision) (WEB-contract §19.1)', async () => {
  const { ctx, page } = await teacher();
  try {
    await openBuilder(page);
    const text = (await page.eval(() => document.getElementById('builderModal').innerText)).toLowerCase();
    const bad = ['JSON chuẩn domain', 'không cần server', 'Exam ID', 'Version ID', 'revision'].filter((w) => text.includes(w.toLowerCase()));
    assert.deepEqual(bad, [], `trình soạn đề hiện chữ kỹ thuật với giáo viên: ${bad.join(', ')}`);
  } finally { await ctx.close(); }
});

test('dist: [teacher] EX-GV-05 cài đặt đề không còn tùy chọn "công bố đáp án sau khi hết giờ" (D08: luôn công bố lời giải sau khi nộp) (WEB-contract §14 D08)', async () => {
  const { ctx, page } = await teacher();
  try {
    await openBuilder(page);
    const opts = await page.eval(() => [...(document.getElementById('builderReleasePolicy')?.options ?? [])].map((o) => o.value));
    assert.ok(!opts.includes('after_deadline'), `#builderReleasePolicy vẫn cho chọn after_deadline: ${opts.join(', ')}`);
  } finally { await ctx.close(); }
});

test('dist: [teacher][import] EX-GV-06 xem trước DOCX: câu hỏi chỉ hiện một lần (WEB-contract §8)', async () => {
  const { ctx, page } = await teacher();
  try {
    await openBuilder(page); await importDocx(page);
    const n = await page.eval(() => (document.getElementById('previewModal').innerText.match(/Giá trị của 1 \+ 1 bằng bao nhiêu\?/g) || []).length);
    assert.equal(n, 1, `câu "Giá trị của 1 + 1 bằng bao nhiêu?" hiện ${n} lần trong xem trước (nguồn chỉ có một lần)`);
  } finally { await ctx.close(); }
});

test('dist: [teacher] EX-GV-07 hộp giao đề chỉ có MỘT chỗ chọn đề: ô xổ xuống, không kèm danh sách thẻ đề (Trưởng phòng 22/11/2026) (WEB-contract §19.1)', async () => {
  const cls = seedClass(env.gas, [], { token, name: 'Lớp chọn đề ' + Date.now() });
  const { ctx, page } = await teacher();
  try {
    await nav(page, 'lop');
    await page.waitFor((id) => !!document.querySelector(`.class-card[data-class-id="${id}"]`), 'thẻ lớp', 10000, cls.classId);
    await page.click(`.class-card[data-class-id="${cls.classId}"]`);
    await page.waitFor(() => !!document.getElementById('btnAssignExam'), 'nút giao đề', 8000);
    await mouseClick(page, '#btnAssignExam');
    await page.waitFor(() => { const d = document.getElementById('assignDialog'); return !!d && getComputedStyle(d).display !== 'none'; }, 'mở #assignDialog', 8000);
    const m = await page.eval(() => {
      const d = document.getElementById('assignDialog'); const vis = (e) => e.getClientRects().length > 0;
      return { selects: [...d.querySelectorAll('select')].filter(vis).length, cards: [...d.querySelectorAll('[data-exam-id]')].filter((e) => vis(e) && e.tagName !== 'OPTION').length };
    });
    assert.equal(m.selects, 1, 'hộp giao đề có đúng một ô xổ xuống chọn đề');
    assert.equal(m.cards, 0, `hộp giao đề không được kèm thêm danh sách thẻ đề (đang có ${m.cards} thẻ) — hai chỗ chọn cùng một việc`);
  } finally { await ctx.close(); }
});

async function openAssign(page) {
  const cls = seedClass(env.gas, [], { token, name: 'Lớp giao đề ' + Date.now() });
  await nav(page, 'lop');
  await page.waitFor((id) => !!document.querySelector(`.class-card[data-class-id="${id}"]`), 'thẻ lớp', 10000, cls.classId);
  await page.click(`.class-card[data-class-id="${cls.classId}"]`);
  await page.waitFor(() => !!document.getElementById('btnAssignExam'), 'nút giao đề', 8000);
  await mouseClick(page, '#btnAssignExam');
  await page.waitFor(() => { const d = document.getElementById('assignDialog'); return !!d && getComputedStyle(d).display !== 'none'; }, 'mở #assignDialog', 8000);
}

test('dist: [teacher][ui] EX-GV-08 ô tích "Không hạn nộp" cỡ bình thường (≤ 24px) và thẳng hàng với chữ (Trưởng phòng 22/11/2026, ảnh chụp web thật) (WEB-contract §19.2a)', async () => {
  const { ctx, page } = await teacher();
  try {
    await openAssign(page);
    const m = await page.eval(() => {
      const c = document.getElementById('assignNoDue'); const r = c.getBoundingClientRect();
      const lab = c.closest('label') || document.querySelector('label[for="assignNoDue"]');
      const lr = lab ? [...lab.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => { const rg = document.createRange(); rg.selectNodeContents(n); return rg.getBoundingClientRect(); })[0] || lab.getBoundingClientRect() : null;
      return { w: Math.round(r.width), h: Math.round(r.height), cy: r.top + r.height / 2, ly: lr ? lr.top + lr.height / 2 : null };
    });
    assert.ok(m.w <= 24 && m.h <= 24, `ô tích #assignNoDue phải cỡ ô tích thường (≤ 24×24px); thực tế ${m.w}×${m.h}px`);
    assert.ok(m.ly !== null && Math.abs(m.cy - m.ly) <= 6, `ô tích và chữ "Không hạn nộp" phải thẳng hàng (lệch ${m.ly === null ? '?' : Math.round(Math.abs(m.cy - m.ly))}px)`);
  } finally { await ctx.close(); }
});

test('dist: [teacher] EX-GV-09 tích "Không hạn nộp" mà xóa trống giờ mở: báo chỉ thiếu giờ mở, không đòi hạn nộp (Trưởng phòng 22/11/2026) (WEB-contract §19.2a)', async () => {
  const { ctx, page } = await teacher();
  try {
    await openAssign(page);
    // giáo viên tự xóa giờ mở (mặc định là giờ hiện tại — EX-GV-10)
    await page.eval(() => { const e = document.getElementById('assignOpenAt'); e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    await mouseClick(page, '#assignNoDue');
    assert.equal(await page.eval(() => document.getElementById('assignNoDue').checked), true, 'đã tích Không hạn nộp');
    await mouseClick(page, '#btnAssignConfirm');
    const msg = await page.waitFor(() => { const d = document.getElementById('assignDialog'); const e = [...d.querySelectorAll('[role=alert], .error, .form-error, .field-error, p, div')].find((x) => x.children.length === 0 && /Vui lòng|nhập|chọn/i.test(x.textContent || '') && getComputedStyle(x).color !== 'rgb(0, 0, 0)' && x.getClientRects().length); return e ? e.textContent.trim() : null; }, 'báo lỗi khi chưa nhập giờ mở', 5000);
    assert.doesNotMatch(msg, /hạn nộp/i, `đã tích "Không hạn nộp" thì lỗi không được đòi hạn nộp; thực tế: "${msg}"`);
    assert.match(msg, /mở/i, `lỗi phải nói rõ thiếu thời gian mở đề; thực tế: "${msg}"`);
  } finally { await ctx.close(); }
});

test('dist: [teacher] EX-GV-10 mở hộp giao đề: giờ mở đã điền sẵn GIỜ HIỆN TẠI (đổi được); chỉ chọn đề + tích "Không hạn nộp" rồi bấm giao là xong (Trưởng phòng 22/11/2026) (WEB-contract §19.2a)', async () => {
  const { ctx, page } = await teacher();
  try {
    await openAssign(page);
    const v = await page.eval(() => { const e = document.getElementById('assignOpenAt'); return { value: e.value, disabled: e.disabled, readOnly: e.readOnly }; });
    assert.ok(v.value, '#assignOpenAt phải điền sẵn giờ hiện tại khi mở hộp giao đề');
    const diff = Math.abs(new Date(v.value).getTime() - Date.now());
    assert.ok(diff <= 3 * 60000, `giờ mở mặc định phải là giờ hiện tại (lệch ${Math.round(diff / 60000)} phút; giá trị "${v.value}")`);
    assert.equal(v.disabled || v.readOnly, false, 'giáo viên vẫn đổi được giờ mở');
    await page.eval(() => { const sel = document.querySelector('#assignDialog select'); sel.selectedIndex = Math.min(1, sel.options.length - 1); sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await mouseClick(page, '#assignNoDue');
    await mouseClick(page, '#btnAssignConfirm');
    await page.waitFor(() => document.querySelectorAll('.assignment-row[data-assignment-id]').length === 1, 'không chọn giờ gì thêm, bấm giao là có 1 dòng bài giao', 10000);
    assert.match(await page.eval(() => document.querySelector('.assignment-row[data-assignment-id]').innerText), /Không hạn nộp/, 'dòng bài giao hiện "Không hạn nộp"');
  } finally { await ctx.close(); }
});
