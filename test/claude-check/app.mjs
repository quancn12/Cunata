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

/** Chờ ứng dụng khởi động xong: màn chọn vai, khu học sinh (cổng tên / lưới đề), đang làm bài, hoặc báo cáo (WEB-contract 19.1; bản gốc: mục 16). */
export async function waitBoot(page, timeout = 15000) {
  await page.waitFor(`(() => { const shown = ${shown}; const t = document.getElementById('examTitle')?.textContent ?? '';
    const exam = shown('examWrapper') && document.querySelectorAll('#examPane .question-card').length > 0 && t.trim() !== '' && !/Đang tải/.test(t);
    const start = shown('startScreen') && (document.querySelectorAll('#startScreen .exam-list-item').length > 0 || !!document.querySelector('#studentNameGate input#startName') || shown('classCodeInput'));
    const role = shown('roleChooser');
    return exam || start || role || (shown('reportWrapper') && /\\d/.test(document.getElementById('scoreTotal')?.textContent ?? '')); })()`,
  'ứng dụng khởi động xong: màn chọn vai #roleChooser, khu học sinh #startScreen, đang làm bài, hoặc màn báo cáo (WEB-contract 19.1)', timeout);
}

export const onStartScreen = (page) => page.eval(`(() => { const shown = ${shown}; return shown('startScreen'); })()`);
export const onRoleChooser = (page) => page.eval(`(() => { const shown = ${shown}; return shown('roleChooser'); })()`);

const inStudentArea = `(() => { const shown = ${shown}; return !!document.querySelector('#studentNameGate input#startName') && shown('studentNameGate') || shown('classCodeInput'); })()`;

/** Vào khu học sinh từ màn chọn vai (nếu đang ở đó) và qua cổng tên (nếu có). Dừng ở khu học sinh (ô mã lớp #classCodeInput). */
export async function enterStudentArea(page, { name = START_NAME } = {}) {
  if (await onRoleChooser(page)) {
    await page.click('#btnRoleStudent');
    await page.waitFor(inStudentArea, 'bấm #btnRoleStudent: vào khu học sinh (cổng tên #studentNameGate hoặc ô mã lớp #classCodeInput)', 10000);
  }
  const gate = await page.eval(`(() => { const shown = ${shown}; return shown('studentNameGate'); })()`);
  if (gate) {
    await page.eval(() => { const e = document.getElementById('startName'); e.focus(); e.select(); });
    await page.send('Input.insertText', { text: name });
    await page.eval(() => document.getElementById('startName').dispatchEvent(new Event('input', { bubbles: true })));
    await page.waitFor(() => { const b = document.getElementById('btnNameContinue'); return !!b && !b.disabled; }, 'nhập tên thì #btnNameContinue bấm được', 5000);
    await page.click('#btnNameContinue');
    await page.waitFor(`(() => { const shown = ${shown}; return shown('classCodeInput'); })()`, 'qua cổng tên: khu học sinh có ô nhập mã lớp #classCodeInput (WEB-contract 19.1, 21)', 10000);
  }
}

/** Vào lớp bằng mã (WEB-contract 19.1/21) và chờ thẻ đề được giao hiện trong #myClasses. Trả về selector thẻ đề đầu tiên của lớp. */
export async function joinClass(page, code) {
  await page.eval(() => { const e = document.getElementById('classCodeInput'); e.scrollIntoView({ block: 'center' }); e.focus(); e.select?.(); });
  await page.send('Input.insertText', { text: code });
  await page.eval(() => document.getElementById('classCodeInput').dispatchEvent(new Event('input', { bubbles: true })));
  await page.click('#btnJoinClass');
  const sel = `#myClasses .class-section[data-class-code="${code}"] .exam-card[data-assignment-id]`;
  await page.waitFor((q) => !!document.querySelector(q), `vào lớp ${code}: #myClasses có thẻ đề được giao`, 15000, sel);
  return sel;
}

/** Mở #examPreview của một thẻ đề rồi bấm #btnStartExam. */
export async function startFromCard(page, sel) {
  // WEB-contract 21: bản build không còn thẻ đề luyện tập công khai. Với selector [data-exam-id="X"] mà không có thẻ
  // (học sinh chưa vào lớp), học sinh vẫn mở được đề bằng tệp (#examFileInput) — lấy đúng tệp đề X từ index.json của máy chủ test.
  const m = /^\[data-exam-id="([^"]+)"\]$/.exec(sel);
  if (m) {
    let hasCard = false;
    try { hasCard = !!(await page.waitFor((q) => !!document.querySelector(q), 'thẻ ' + sel, 3000, sel)); } catch { hasCard = false; }
    if (!hasCard) {
      const exam = await page.eval(async (id) => {
        const idx = await (await fetch('public/exams/index.json', { cache: 'no-store' })).json();
        const e = (idx.exams || []).find((x) => x.id === id);
        return e ? await (await fetch(e.url, { cache: 'no-store' })).json() : null;
      }, m[1]);
      if (!exam) throw new Error(`startFromCard: không có thẻ ${sel} và index.json của máy chủ test không có đề "${m[1]}" (WEB-contract 21)`);
      await loadExam(page, exam);
      return;
    }
  }
  await page.waitFor((q) => !!document.querySelector(q), 'thẻ đề cần chọn có trên trang học sinh: ' + sel, 10000, sel);
  await page.click(sel);
  await page.waitFor(`(() => { const shown = ${shown}; const b = document.getElementById('btnStartExam'); return shown('examPreview') && !!b && !b.disabled; })()`,
    'bấm thẻ đề: mở #examPreview có nút #btnStartExam bấm được', 8000);
  await page.click('#btnStartExam');
  await page.waitFor(`(() => { const shown = ${shown}; return shown('examWrapper') && document.querySelectorAll('#examPane .question-card').length > 0; })()`,
    'bấm #btnStartExam: vào màn làm bài có câu hỏi', 10000);
}

/**
 * Bản build: chọn vai → học sinh → cổng tên, dừng ở khu học sinh (WEB-contract 21: không còn đề luyện tập công khai; đề chỉ đến qua lớp).
 * Bản gốc (index.html, giữ nguyên theo mục 18): màn vào thi cũ (mục 16) nếu có.
 */
export async function enterFromStart(page, { name = START_NAME, url, id } = {}) {
  const role = await onRoleChooser(page);
  if (!role && !(await onStartScreen(page))) return;
  if (role || await page.eval(() => !!document.getElementById('studentNameGate') || !!document.getElementById('classCodeInput'))) {
    await enterStudentArea(page, { name });
    if (id) await startFromCard(page, `[data-exam-id="${id}"]`);
    return;
  }
  // bản cũ (mục 16): ô tên + danh sách + nút bắt đầu trên cùng một màn
  await page.eval(() => { const e = document.getElementById('startName'); e.focus(); e.select(); });
  await page.send('Input.insertText', { text: name });
  await page.eval(() => document.getElementById('startName').dispatchEvent(new Event('change', { bubbles: true })));
  await page.click(url ? `#startScreen .exam-list-item[data-exam-url="${url}"]` : '#startScreen .exam-list-item[data-exam-url]');
  await page.waitFor(() => { const b = document.getElementById('btnStartExam'); return !!b && !b.disabled; }, 'nhập tên + chọn đề thì nút #btnStartExam phải bấm được', 5000);
  await page.click('#btnStartExam');
  await page.waitFor(`(() => { const shown = ${shown}; return !shown('startScreen') && shown('examWrapper') && document.querySelectorAll('#examPane .question-card').length > 0; })()`,
    'bấm #btnStartExam: vào màn làm bài có câu hỏi', 10000);
}

/**
 * Mở ứng dụng và vào làm bài. `name`: tên thí sinh nhập ở cổng tên (bản build, WEB-contract 19.1).
 * Bản build không còn đề công khai (§21): sau cổng tên nạp một đề kiểm định qua #examFileInput ẩn; tên thí sinh phải là tên ở cổng tên.
 */
export const BOOT_EXAM = { id: 'claude-check-khoi-dong', title: 'Đề kiểm định khởi động' };
export async function openApp(ctx, server, target, { name = START_NAME } = {}) {
  const page = await ctx.newPage();
  await page.goto(server.url + target.path);
  await waitBoot(page);
  await enterFromStart(page, { name });
  const inExam = await page.eval(`(() => { const shown = ${shown}; return shown('examWrapper') && document.querySelectorAll('#examPane .question-card').length > 0; })()`);
  if (!inExam) await loadExam(page, makeExam(BOOT_EXAM));
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

/**
 * Bấm bằng CHUỘT THẬT (CDP Input.dispatchMouseEvent) vào giữa phần tử, sau khi cuộn tới. Khác page.click (gọi e.click()):
 * bị chặn nếu có lớp phủ đè lên, giống người dùng thật. Trả về phần tử thật sự nằm dưới con trỏ.
 */
export async function mouseClick(page, sel) {
  const p = await page.eval((s) => {
    const e = document.querySelector(s); if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return { x, y, hitsTarget: !!top && e.contains(top), top: top ? top.tagName.toLowerCase() + (top.id ? '#' + top.id : '') + '.' + String(top.className).trim().split(/\s+/).join('.') : null };
  }, sel);
  if (!p) throw new Error('Không tìm thấy phần tử để bấm chuột: ' + sel);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  }
  return p;
}

export const pickOption =(page, qid, letter) => page.click(`[data-qid="${qid}"][data-option-id="${qid}-${letter}"]`);

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

/**
 * Đặt tên thí sinh trên màn làm bài.
 * Bản build (WEB-contract 19.1): #candidateName CHỈ ĐỌC trong lúc thi; tên phải nhập ở cổng tên trước khi vào bài
 * (openApp(..., { name }) hoặc enterFromStart(page, { name })). Khi đó hàm này chỉ xác nhận tên đã đúng, không gõ vào ô.
 * Bản gốc index.html (giữ nguyên theo mục 18): ô tên còn sửa được nên gõ trực tiếp.
 */
export async function setName(page, name) {
  const f = await page.eval(() => { const e = document.getElementById('candidateName'); return { ro: !!e && (e.readOnly || e.hasAttribute('readonly') || e.tagName !== 'INPUT'), value: e?.value ?? e?.textContent ?? '' }; });
  if (f.ro) {
    if (f.value.trim() !== name.trim()) throw new Error(`#candidateName chỉ đọc trong lúc thi (WEB-contract 19.1) nhưng đang là "${f.value}", cần "${name}": tên phải nhập ở cổng tên — mở bài bằng openApp(..., { name }) / enterFromStart(page, { name }), không mở khóa ô tên`);
    return;
  }
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
