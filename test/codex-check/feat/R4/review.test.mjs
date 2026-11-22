import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
import { localServer } from './local-server.mjs';
import { readFileSync } from 'node:fs';

const exam = JSON.parse(readFileSync(new URL('./exam.json', import.meta.url), 'utf8'));
const ids = exam.questions.map(q => q.questionVersionId);
const full = [A.qI(1), A.qII(1), A.qIII(1)];
const wrong = [A.qI(2), A.qII(2), A.qIII(2)];
const blank = [A.qI(3), A.qII(3), A.qIII(3)];
let browser, server;
before(async () => { server = await localServer(exam); browser = await H.launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

async function click(page, selector) {
  await page.eval(s => document.querySelector(s)?.scrollIntoView({ block: 'center', behavior: 'instant' }), selector);
  assert.equal(await page.eval((s) => {
    const e = document.querySelector(s); if (!e) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
  }, selector), true, `Phần tử ${selector} phải nằm trong khung nhìn (WEB-contract §24.1, §9)`);
  const hit = await A.mouseClick(page, selector);
  assert.equal(hit.hitsTarget, true, `Phần tử ${selector} phải nhận chuột thật, không bị che (WEB-contract §24.1, §9)`);
}

async function report(t, width = 1280) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.setViewport(width, 900);
  await page.goto(server.url);
  await A.waitBoot(page);
  await click(page, '#btnRoleStudent');
  await page.waitFor(() => !!document.querySelector('#startName'), 'cổng tên (§19.1)');
  await page.type('#startName', 'Học sinh R4');
  await click(page, '#btnNameContinue');
  await page.waitFor(() => !!document.querySelector('#classCodeInput'), 'khu học sinh (§21)');
  // Hidden file input is explicitly retained by §21; avoid coupling R4 to roster/PIN work in R3.
  await page.setFiles('#examFileInput', [fileURLToPath(new URL('./exam.json', import.meta.url))]);
  await page.waitFor(n => document.querySelectorAll('#examPane .question-card').length === n,
    'đề R4 có đủ chín câu (§20)', 10000, ids.length);
  for (const [qid, letter] of [[A.qI(1), 'a'], [A.qI(2), 'b']]) {
    await click(page, `[data-qid="${qid}"][data-option-id="${qid}-${letter}"]`);
  }
  for (const [qid, value] of [[A.qII(1), 'true'], [A.qII(2), 'false']]) {
    for (let i = 0; i < 4; i++) await click(page, `#qcard-${qid} .statement-row:nth-of-type(${i + 1}) .tf-btn[data-val="${value}"]`);
  }
  await page.type(A.shortSel(A.qIII(1)), '1,5');
  await page.type(A.shortSel(A.qIII(2)), '1,50');
  await page.press('Tab');
  await click(page, '#btnSubmit');
  await page.waitFor(() => document.querySelector('#submitModal')?.getClientRects().length, 'xác nhận nộp (§19.1)');
  await click(page, '#btnConfirmSubmit');
  await A.waitReport(page);
  const answers = await page.eval(() => [...document.querySelectorAll('#reportWrapper .review-question-card')]
    .map(e => ({ id: e.dataset.qid, text: e.innerText,
      chosen: [...e.querySelectorAll('.review-option[data-chosen="true"]')].map(o => o.dataset.optionId),
      statements: [...e.querySelectorAll('.review-statement')].map(s => s.dataset.chosen) })));
  assert.deepEqual(answers.map(a => a.id), ids, 'Fixture phải hiện đủ câu theo thứ tự (§20, §24.1)');
  for (const [i, chosen] of [[0, [A.qI(1) + '-a']], [1, [A.qI(2) + '-b']], [2, []]]) {
    assert.deepEqual(answers[i].chosen, chosen, 'Phần I lưu đúng lựa chọn đúng/sai/bỏ trống (§20)');
  }
  for (const [i, chosen] of [[3, 'true'], [4, 'false'], [5, 'none']]) {
    assert.deepEqual(answers[i].statements, Array(4).fill(chosen), 'Phần II giữ đủ bốn ý đúng/sai/bỏ trống (§20)');
  }
  for (const [i, text] of [[6, /Bạn điền:\s*1,5\s*\|/], [7, /Bạn điền:\s*1,50\s*\|/], [8, /Chưa làm/]]) {
    assert.match(answers[i].text, text, 'Phần III giữ nguyên câu trả lời và bỏ trống (§20)');
  }
  // max I=3/4, max II=3, each III=(10-3/4-3)/3=25/12.
  // Earned=1/4+1+25/12=10/3, displayed as 3,33 by D02.
  assert.deepEqual((await A.readReport(page)).total, [3.33, 10],
    'Fixture đạt đúng 10/3 trên 10, hiển thị 3,33; 1,50 không bằng 1,5 (§4, §14, §20)');
  return page;
}

const visibleIds = page => page.eval(() => [...document.querySelectorAll('#reportWrapper .review-question-card')]
  .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
  .map(e => e.dataset.qid));

async function filter(page, key) {
  const selector = `#reviewFilter button[data-filter="${key}"]`;
  assert.equal(await page.eval(s => !!document.querySelector(s), selector), true,
    `Báo cáo phải có nút lọc ${key} trong #reviewFilter (WEB-contract §24.1)`);
  await click(page, selector);
  const pressed = await page.eval(() => [...document.querySelectorAll('#reviewFilter button[data-filter]')]
    .map(e => [e.dataset.filter, e.getAttribute('aria-pressed')]));
  assert.deepEqual(pressed.sort(), ['all', 'blank', 'wrong'].map(k => [k, String(k === key)]),
    'Chỉ bộ lọc đang chọn có aria-pressed=true (WEB-contract §24.1)');
}

test('dist: [report] R4: lõi máy chủ bộ nhớ giữ nguyên đề và HTTP dùng cùng handle (WEB-contract §22)', async () => {
  const result = await server.handle({ method: 'GET', query: { action: 'getExam', id: exam.examId } }, server.ctx);
  assert.equal(result.body.success, true, 'handle + MemoryStore phải đọc được đề kiểm định (§22)');
  assert.deepEqual(result.body.exam, exam, 'Lõi máy chủ giữ nguyên toàn văn và đáp án (§20, §22)');
  const response = await fetch(server.apiBase + '?action=getExam&id=' + exam.examId);
  assert.equal(response.status, result.status, 'HTTP phải giữ status của cùng handle (§22)');
  assert.deepEqual(await response.json(), result.body, 'HTTP và lời gọi lõi dùng cùng dữ liệu/hàm handle (§22)');
});

test('dist: [report] R4: báo cáo nền có chín câu đúng sai bỏ trống và tên cổng tên (WEB-contract §20)', async t => {
  const page = await report(t);
  assert.deepEqual(await visibleIds(page), ids, 'Báo cáo nền hiện đủ câu theo thứ tự làm (§20, §24.1)');
  assert.match(await page.eval(() => document.querySelector('#reportWrapper').innerText), /Học sinh R4/,
    'Báo cáo dùng tên thật đã nhập ở cổng tên (§19.1, §21)');
  assert.ok(page.requests.some(url => url.startsWith(server.apiBase)),
    'Trình duyệt thật phải gọi máy chủ Node cục bộ chạy handle (§22)');
});

test('dist: [report] R4: ba nút tiếng Việt và trạng thái aria-pressed ban đầu (WEB-contract §24.1)', async t => {
  const page = await report(t);
  const buttons = await page.eval(() => [...document.querySelectorAll('#reviewFilter button')]
    .map(e => [e.dataset.filter, e.textContent.trim(), e.getAttribute('aria-pressed')]));
  assert.deepEqual(buttons.map(b => b[0]).sort(), ['all', 'blank', 'wrong'], 'Đủ ba nút all/wrong/blank (§24.1)');
  for (const [key, label, pressed] of buttons) {
    assert.match(label, { all: /Tất cả/, wrong: /Sai/, blank: /Bỏ trống/ }[key], `Nút ${key} có nhãn tiếng Việt (§24.1)`);
    assert.equal(pressed, String(key === 'all'), 'Mặc định chọn Tất cả, aria-pressed chính xác (§24.1)');
    await click(page, `#reviewFilter button[data-filter="${key}"]`);
  }
});

for (const [key, expected] of [['wrong', wrong], ['blank', blank]]) {
  test(`dist: [report] R4: lọc ${key} giữ đúng tập câu I II III (WEB-contract §24.1)`, async t => {
    const page = await report(t);
    await filter(page, key);
    assert.deepEqual(await visibleIds(page), expected, `Lọc ${key} chỉ hiện đúng tập câu tương ứng ở cả ba phần (§24.1)`);
  });
}

test('dist: [report] R4: chuyển Sai Bỏ trống Tất cả không mất nội dung hay điểm (WEB-contract §24.1)', async t => {
  const page = await report(t);
  const snapshot = () => page.eval(() => ({ score: document.querySelector('#scoreTotal').textContent,
    cards: [...document.querySelectorAll('.review-question-card')].map(e => e.innerText) }));
  const original = await snapshot();
  for (const key of ['wrong', 'blank', 'all', 'wrong', 'all']) await filter(page, key);
  assert.deepEqual(await visibleIds(page), ids, 'Tất cả khôi phục toàn bộ thẻ theo đúng thứ tự (§24.1, §20)');
  assert.deepEqual(await snapshot(), original, 'Lọc không đổi điểm, câu trả lời, đáp án hay lời giải (§24.1, §20)');
});

test('dist: [report] R4: thanh số câu ánh xạ đủ và duy nhất tới thẻ thật (WEB-contract §24.1)', async t => {
  const page = await report(t);
  const links = await page.eval(() => [...document.querySelectorAll('#reviewNav a')].map(a => ({
    href: a.getAttribute('href'), target: document.querySelector(a.getAttribute('href'))?.dataset.qid,
    label: a.textContent.trim() })));
  assert.deepEqual(links.map(a => a.target), ids, 'Thanh số câu đủ và đúng thứ tự câu đã làm (§24.1, §20)');
  assert.deepEqual(links.map(a => a.href), ids.map(id => '#q-' + id), 'Liên kết dùng #q-… đến đúng thẻ (§24.1)');
  assert.equal(new Set(links.map(a => a.href)).size, ids.length, 'Không trùng đích câu (§24.1)');
  for (let i = 0; i < links.length; i++) assert.match(links[i].label, new RegExp(`\\b${i + 1}\\b`), 'Liên kết hiện số câu (§24.1)');
});

test('dist: [report] R4: câu sai bỏ trống có nhãn chữ trên thanh số và thẻ (WEB-contract §24.1)', async t => {
  const page = await report(t);
  for (const [list, pattern] of [[wrong, /Sai/i], [blank, /Bỏ trống|Chưa làm|Chưa trả lời/i]]) {
    for (const id of list) {
      const labels = await page.eval(id => {
        const a = document.querySelector(`#reviewNav a[href="#q-${id}"]`);
        const card = document.getElementById('q-' + id);
        return [a ? a.innerText + ' ' + (a.getAttribute('aria-label') ?? '') : '', card?.innerText ?? ''];
      }, id);
      for (const label of labels) assert.match(label, pattern, `Câu ${id} có nhãn chữ trạng thái, không chỉ màu (§24.1)`);
    }
  }
});

for (const width of [1280, 390]) {
  test(`dist: [report] R4: chuột thật nhảy tới câu trong khung nhìn ${width}px (WEB-contract §24.1)`, async t => {
    const page = await report(t, width);
    for (const id of [ids.at(-1), ids[0], wrong[1], blank[0]]) {
      const selector = `#reviewNav a[href="#q-${id}"]`;
      assert.equal(await page.eval(s => !!document.querySelector(s), selector), true, 'Có liên kết nhảy tới câu (§24.1)');
      await click(page, selector);
      await page.waitFor(id => {
        const e = document.getElementById('q-' + id), r = e?.getBoundingClientRect();
        return !!r && r.top >= 0 && r.top < innerHeight && r.left >= 0 && r.right <= innerWidth;
      }, `Đích câu ${id} phải thật sự vào khung nhìn sau bấm thanh số (§24.1)`, 3000, id);
    }
    assert.equal(await page.eval(() => document.documentElement.scrollWidth <= innerWidth), true,
      'Báo cáo và thanh số câu không tràn ngang (§24.1, §9)');
  });
}
