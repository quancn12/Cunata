// Trợ giúp thao tác ứng dụng Cunata qua giao diện thật + bộ sinh đề kiểm định.
// HỢP ĐỒNG DOM mà cả index.html (gốc) lẫn dist/ phải giữ — xem README.md cùng thư mục.
import { join } from 'node:path';
import { PROJECT_ROOT, writeTempJson } from './harness.mjs';

export const TARGETS = [
  { name: 'root', dir: PROJECT_ROOT, path: 'index.html', label: 'index.html gốc (bản đang chạy trên GitHub Pages)' },
  { name: 'dist', dir: join(PROJECT_ROOT, 'dist'), path: '', label: 'bản build module dist/' },
];

export const SECRET = 'GIAITHICH-BIMAT-7Q2'; // có trong mọi lời giải của đề kiểm định; không được lộ khi chính sách chưa cho phép

/**
 * Sinh đề hợp lệ theo lược đồ web-exam-v1 (cùng dạng public/exams/toan-full.json).
 * part1: mảng chữ cái đáp án đúng ('a'..'d'); part2: mảng [4 boolean]; part3: mảng chuỗi đáp án.
 */
export function makeExam({ id = 'claude-check-422', title = 'Đề kiểm định Claude 4-2-2', part1 = ['a', 'c', 'b', 'd'],
  part2 = [[true, false, true, false], [false, false, true, true]], part3 = ['0,5', '-12'], settings = {} } = {}) {
  const questions = [];
  part1.forEach((ans, i) => {
    const qid = `ck-i-${String(i + 1).padStart(2, '0')}`;
    questions.push({
      kind: 'I', questionVersionId: qid, title: `Câu ${i + 1} (Phần I)`, content: `Câu hỏi kiểm định Phần I số ${i + 1}: chọn phương án ${ans.toUpperCase()}.`,
      options: ['a', 'b', 'c', 'd'].map((l) => ({ optionId: `${qid}-${l}`, label: l.toUpperCase(), text: `Phương án ${l.toUpperCase()} của câu ${i + 1}` })),
      correctOptionId: `${qid}-${ans}`, explanation: `${SECRET} đáp án ${ans.toUpperCase()}.`,
    });
  });
  part2.forEach((keys, i) => {
    const qid = `ck-ii-${String(i + 1).padStart(2, '0')}`;
    questions.push({
      kind: 'II', questionVersionId: qid, title: `Câu ${part1.length + i + 1} (Phần II - Đúng / Sai)`, content: `Câu hỏi kiểm định Phần II số ${i + 1}.`,
      statements: keys.map((k, j) => ({ statementId: `${qid}-${'abcd'[j]}`, label: 'abcd'[j], text: `Mệnh đề ${'abcd'[j]} của câu II.${i + 1}`, answer: k, explanation: `${SECRET} mệnh đề ${k ? 'đúng' : 'sai'}.` })),
    });
  });
  part3.forEach((key, i) => {
    const qid = `ck-iii-${String(i + 1).padStart(2, '0')}`;
    questions.push({
      kind: 'III', questionVersionId: qid, title: `Câu ${part1.length + part2.length + i + 1} (Phần III - Trả lời ngắn)`,
      content: `Câu hỏi kiểm định Phần III số ${i + 1}.`, answerKey: key, explanation: `${SECRET} đáp án ngắn.`,
    });
  });
  return {
    schemaVersion: 'web-exam-v1', examId: id, examVersionId: 'v1.0.0', title, subject: 'Toán học', grade: 12,
    ruleSetId: 'custom-v1', inputPolicyId: 'sa-charset-v1',
    settings: { durationMinutes: 50, maxAttempts: null, releasePolicy: 'immediate', shuffleQuestions: false, shuffleOptions: false, ...settings },
    assets: [], questions,
  };
}

export const qI = (n) => `ck-i-${String(n).padStart(2, '0')}`;
export const qII = (n) => `ck-ii-${String(n).padStart(2, '0')}`;
export const qIII = (n) => `ck-iii-${String(n).padStart(2, '0')}`;

const shown = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; };
export const START_NAME = 'Học sinh kiểm định';

/** Chờ ứng dụng khởi động xong: hoặc màn vào thi (#startScreen), hoặc đang làm bài (có câu hỏi), hoặc báo cáo. */
export async function waitBoot(page, timeout = 15000) {
  await page.waitFor(`(() => { const shown = ${shown}; const t = document.getElementById('examTitle')?.textContent ?? '';
    const exam = shown('examWrapper') && document.querySelectorAll('#examPane .question-card').length > 0 && t.trim() !== '' && !/Đang tải/.test(t);
    const start = shown('startScreen') && document.querySelectorAll('#startScreen .exam-list-item[data-exam-url]').length > 0;
    return exam || start || (shown('reportWrapper') && /\\d/.test(document.getElementById('scoreTotal')?.textContent ?? '')); })()`,
  'ứng dụng khởi động xong: màn vào thi #startScreen có danh sách đề, hoặc đang làm bài, hoặc màn báo cáo (WEB-contract mục 16)', timeout);
}

export const onStartScreen = (page) => page.eval(`(() => { const shown = ${shown}; return shown('startScreen'); })()`);

/** Đi qua màn vào thi: nhập tên, chọn đề (mặc định đề đầu danh sách), bấm bắt đầu. */
export async function enterFromStart(page, { name = START_NAME, url } = {}) {
  if (!(await onStartScreen(page))) return;
  await page.eval(() => { const e = document.getElementById('startName'); e.focus(); e.select(); });
  await page.send('Input.insertText', { text: name });
  await page.eval(() => document.getElementById('startName').dispatchEvent(new Event('change', { bubbles: true })));
  const sel = url ? `#startScreen .exam-list-item[data-exam-url="${url}"]` : '#startScreen .exam-list-item[data-exam-url]';
  await page.click(sel);
  await page.waitFor(() => { const b = document.getElementById('btnStartExam'); return !!b && !b.disabled; }, 'nhập tên + chọn đề thì nút #btnStartExam phải bấm được', 5000);
  await page.click('#btnStartExam');
  await page.waitFor(`(() => { const shown = ${shown}; return !shown('startScreen') && shown('examWrapper') && document.querySelectorAll('#examPane .question-card').length > 0; })()`,
    'bấm #btnStartExam: màn vào thi đóng, vào màn làm bài có câu hỏi', 10000);
}

export async function openApp(ctx, server, target) {
  const page = await ctx.newPage();
  await page.goto(server.url + target.path);
  await waitBoot(page);
  await enterFromStart(page);
  return page;
}

/** Nạp đề qua nút "Nạp đề thi (JSON)" (#examFileInput) như giáo viên/học sinh làm thật. */
export async function loadExam(page, exam) {
  const file = writeTempJson(exam, `${exam.examId}.json`);
  await page.setFiles('#examFileInput', [file]);
  await page.waitFor((title, n) => (document.getElementById('examTitle')?.textContent ?? '').trim() === title
    && document.querySelectorAll('#examPane .question-card').length === n,
  `nạp đề "${exam.title}" qua #examFileInput: tiêu đề đúng và có ${exam.questions.length} thẻ câu hỏi`, 10000, exam.title, exam.questions.length);
}

export const pickOption = (page, qid, letter) => page.click(`[data-qid="${qid}"][data-option-id="${qid}-${letter}"]`);

export async function setStatement(page, qid, index, value) {
  const ok = await page.eval((q, i, v) => {
    const b = document.querySelectorAll(`[id="qcard-${q}"] .statement-row`)[i]?.querySelector(`.tf-btn[data-val="${v}"]`);
    if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true;
  }, qid, index, value);
  if (!ok) throw new Error(`Không tìm thấy nút Đúng/Sai: câu ${qid}, ý thứ ${index + 1} (.statement-row .tf-btn[data-val])`);
}

export const shortSel = (qid) => `[id="qcard-${qid}"] .short-answer-input`;
export async function typeShort(page, qid, text) {
  const sel = shortSel(qid);
  const ok = await page.eval((s) => { const e = document.querySelector(s); if (!e) return false; e.scrollIntoView({ block: 'center' }); e.focus(); e.select(); return true; }, sel);
  if (!ok) throw new Error('Không tìm thấy ô trả lời ngắn: ' + sel);
  await page.send('Input.insertText', { text });
  await page.eval((s) => { const e = document.querySelector(s); e.dispatchEvent(new Event('change', { bubbles: true })); e.blur(); }, sel);
}
export const shortValue = (page, qid) => page.eval((s) => document.querySelector(s)?.value ?? null, shortSel(qid));

export async function setName(page, name) {
  await page.eval(() => { const e = document.getElementById('candidateName'); e.focus(); e.select(); });
  await page.send('Input.insertText', { text: name });
  await page.eval(() => { const e = document.getElementById('candidateName'); e.dispatchEvent(new Event('change', { bubbles: true })); e.blur(); });
}

export const waitSaved = (page) => page.waitFor(() => /Đã lưu/.test(document.getElementById('syncText')?.textContent ?? ''),
  'trạng thái lưu (#syncText) báo "Đã lưu..." sau khi trả lời', 8000);

const visible = (id) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); return !!e && getComputedStyle(e).display !== 'none' && e.getClientRects().length > 0; })()`;
export const isVisible = (page, id) => page.eval(visible(id));
export const waitReport = (page, timeout = 10000) => page.waitFor(() => {
  const e = document.getElementById('reportWrapper');
  return !!e && getComputedStyle(e).display !== 'none' && /\d/.test(document.getElementById('scoreTotal')?.textContent ?? '');
}, 'màn hình báo cáo (#reportWrapper) hiện và #scoreTotal có điểm', timeout);

export async function submit(page) {
  await page.click('#btnSubmit');
  await page.waitFor(visible('submitModal'), 'hộp thoại xác nhận nộp bài (#submitModal) hiện ra', 5000);
  await page.click('#btnConfirmSubmit');
  await waitReport(page);
}

/** Đọc điểm trên báo cáo. Mỗi phần là [điểm, tối đa] dạng số; null nếu không đọc được "x / y". */
export function readReport(page) {
  return page.eval(() => {
    const g = (id) => (document.getElementById(id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const num = (s) => { const m = s.match(/(-?\d+(?:[.,]\d+)?)\s*\/\s*(-?\d+(?:[.,]\d+)?)/); return m ? [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))] : null; };
    return {
      I: num(g('scorePartI')), II: num(g('scorePartII')), III: num(g('scorePartIII')), total: num(g('scoreTotal')),
      raw: { I: g('scorePartI'), II: g('scorePartII'), III: g('scorePartIII'), total: g('scoreTotal') },
      subtitle: g('reportSubtitle'), reportText: document.getElementById('reportWrapper')?.innerText ?? '',
    };
  });
}

export const timerSeconds = (page) => page.eval(() => {
  const m = (document.getElementById('timerBox')?.textContent ?? '').match(/(?:(\d+):)?(\d+):(\d+)/);
  return m ? (parseInt(m[1] ?? '0', 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10)) : null;
});

export const near = (a, b, eps = 0.0051) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) <= eps);

/** Lỗi đáng kể của trang (bỏ favicon). */
export function pageProblems(page) {
  const bad = page.badRequests.filter((u) => !/favicon\.ico/.test(u));
  const errs = page.errors.filter((e) => !/favicon\.ico/.test(e));
  return [...errs.map((e) => 'JS: ' + e), ...bad.map((b) => 'REQUEST: ' + b)];
}
