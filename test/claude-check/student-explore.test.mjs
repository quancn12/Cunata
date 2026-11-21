// 6 lỗi tìm được khi worker thi thử như học sinh thật (docs/reviews/EXPLORE-hs.md, 21/11/2026), Trưởng phòng duyệt "Sửa cả 6".
// Mỗi ca tái hiện đúng một lỗi trên bản build, học sinh vào đề qua lớp (WEB-contract 21), bấm bằng chuột thật.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser } from './harness.mjs';
import { TARGETS, enterStudentArea, joinClass, mouseClick, startFromCard, typeShort, waitBoot, waitSaved } from './app.mjs';
import { classroomServer, seedClass, seedTeacher } from './classroom.mjs';

const dist = TARGETS.find((t) => t.name === 'dist');
const TOAN = 'exam-thpt-toan-full-demo';   // 8 câu: I×4, II×2, III×2, 50 phút
const HOA = 'exam-thpt-hoa-repeating-demo'; // 3 câu trả lời ngắn, 15 phút
let browser, env, token;
before(async () => { browser = await launchBrowser(); env = await classroomServer(dist.dir); token = seedTeacher(env.gas); });
after(async () => { await env?.close(); await browser?.close(); });

async function student(w, h, examId, { start = true } = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.setViewport(w, h, w < 600);
  const { code } = seedClass(env.gas, [examId], { token });
  await page.goto(env.server.url + '#/hoc-sinh');
  await waitBoot(page);
  await enterStudentArea(page, { name: 'Học sinh thi thử' });
  const card = await joinClass(page, code);
  if (start) await startFromCard(page, card);
  return { ctx, page, card };
}
const cards = (page) => page.eval(() => [...document.querySelectorAll('#examPane .question-card')].map((c) => ({ id: c.id,
  kind: c.querySelector('.statement-row') ? 'II' : c.querySelector('.short-answer-input') ? 'III' : 'I' })));

test('dist: [ui] EX-HS-01 điện thoại 390px: màn làm bài không rộng hơn màn hình (không thanh cuộn ngang) (WEB-contract §9, §19.1)', async () => {
  const { ctx, page } = await student(390, 844, TOAN);
  try {
    const m = await page.eval(() => ({ iw: innerWidth, sw: document.documentElement.scrollWidth }));
    assert.equal(m.iw, 390, `màn làm bài không được làm điện thoại tự thu nhỏ trang (bề rộng bố cục ${m.iw}px)`);
    assert.ok(m.sw <= 390, `màn làm bài rộng ${m.sw}px > 390px: có thanh cuộn ngang, tiêu đề bị cắt`);
  } finally { await ctx.close(); }
});

test('dist: [student] EX-HS-02 mỗi câu có nút đánh dấu (.btn-flag); bấm thì ô số câu trong #paletteGrid có lớp "flagged", bấm lại thì bỏ (WEB-contract §19.1)', async () => {
  const { ctx, page } = await student(1366, 768, TOAN);
  try {
    const n = await page.eval(() => [...document.querySelectorAll('#examPane .question-card')].filter((c) => c.querySelector('.btn-flag')).length);
    assert.equal(n, 8, 'chú thích bảng số câu có "Đánh dấu" thì mỗi thẻ câu phải có nút đánh dấu .btn-flag');
    const sel = '#examPane .question-card:nth-of-type(2) .btn-flag';
    const hit = await mouseClick(page, sel);
    assert.ok(hit.hitsTarget, `nút đánh dấu câu 2 phải bấm được bằng chuột (đang bị đè: ${hit.top})`);
    await page.waitFor(() => document.querySelectorAll('#paletteGrid button')[1]?.classList.contains('flagged'), 'đánh dấu câu 2: ô số 2 trong #paletteGrid có lớp "flagged"', 3000);
    assert.equal(await page.eval((s) => document.querySelector(s).getAttribute('aria-pressed'), sel), 'true', 'nút đánh dấu đang bật: aria-pressed="true"');
    await mouseClick(page, sel);
    await page.waitFor(() => !document.querySelectorAll('#paletteGrid button')[1]?.classList.contains('flagged'), 'bấm lại: bỏ đánh dấu câu 2', 3000);
  } finally { await ctx.close(); }
});

test('dist: [ui] EX-HS-03 điện thoại: bấm số câu trong danh sách thì thấy ĐẦU câu đó (tiêu đề + đề dẫn) ngay dưới thanh trên, không rơi vào giữa các ý (WEB-contract §19.1)', async () => {
  const { ctx, page } = await student(390, 844, TOAN);
  try {
    const list = await cards(page);
    const idx = list.findIndex((c) => c.kind === 'II');
    assert.ok(idx >= 0, 'đề Toán có câu đúng/sai');
    await mouseClick(page, '#btnPalette');
    await page.waitFor((i) => { const b = document.querySelectorAll('#paletteGrid button')[i]; return !!b && b.getClientRects().length > 0; }, 'mở danh sách số câu trên điện thoại', 3000, idx);
    await page.eval((i) => document.querySelectorAll('#paletteGrid button')[i].setAttribute('data-cc-jump', '1'), idx);
    await mouseClick(page, '#paletteGrid [data-cc-jump="1"]');
    await new Promise((r) => setTimeout(r, 1200));
    const r = await page.eval((id) => {
      const card = document.getElementById(id); const top = card.getBoundingClientRect().top;
      const bars = [...document.querySelectorAll('body *')].filter((e) => ['fixed', 'sticky'].includes(getComputedStyle(e).position) && e.getClientRects().length && e.getBoundingClientRect().top <= 1 && e.getBoundingClientRect().height < innerHeight / 2);
      const barBottom = Math.max(0, ...bars.map((e) => e.getBoundingClientRect().bottom));
      return { top: Math.round(top), barBottom: Math.round(barBottom), ih: innerHeight };
    }, list[idx].id);
    assert.ok(r.top >= r.barBottom - 2 && r.top <= r.barBottom + r.ih * 0.25,
      `sau khi bấm số câu, đầu thẻ câu phải nằm ngay dưới thanh trên (thanh kết thúc ở ${r.barBottom}px, đầu thẻ câu ở ${r.top}px)`);
  } finally { await ctx.close(); }
});

test('dist: [student] EX-HS-04 làm 3 câu, tải lại trang: hộp xác nhận nộp đếm đúng "3/8" câu đã làm (WEB-contract §19.1)', async () => {
  const { ctx, page, card } = await student(1366, 768, TOAN);
  try {
    const list = await cards(page);
    const I = list.find((c) => c.kind === 'I'), II = list.find((c) => c.kind === 'II'), III = list.find((c) => c.kind === 'III');
    await page.eval((id) => document.querySelector(`[id="${id}"] .option-card`).setAttribute('data-cc-opt', '1'), I.id);
    await mouseClick(page, '[data-cc-opt="1"]');
    for (let i = 0; i < 4; i++) {
      await page.eval((id, k) => document.querySelectorAll(`[id="${id}"] .statement-row`)[k].querySelector('.tf-btn[data-val="true"]').setAttribute('data-cc-tf', String(k)), II.id, i);
      await mouseClick(page, `[data-cc-tf="${i}"]`);
    }
    await typeShort(page, III.id.replace(/^qcard-/, ''), '1,5');
    await waitSaved(page);
    await page.eval(() => location.reload());
    await waitBoot(page);
    const inExam = await page.eval(() => { const e = document.getElementById('examWrapper'); return !!e && e.getClientRects().length > 0 && document.querySelectorAll('#examPane .question-card').length > 0; });
    if (!inExam) { await enterStudentArea(page, { name: 'Học sinh thi thử' }); await page.waitFor((q) => !!document.querySelector(q), 'thẻ đề của lớp sau khi tải lại', 10000, card); await startFromCard(page, card); }
    await page.waitFor(() => document.querySelectorAll('#paletteGrid button.answered').length === 3, 'sau khi tải lại: bảng số câu tô đúng 3 ô đã làm', 8000);
    await mouseClick(page, '#btnSubmit');
    await page.waitFor(() => { const m = document.getElementById('submitModal'); return !!m && getComputedStyle(m).display !== 'none'; }, 'mở hộp xác nhận nộp', 5000);
    const text = await page.eval(() => document.getElementById('submitModal').innerText);
    assert.match(text, /\b3\s*\/\s*8\b/, `hộp xác nhận nộp phải đếm 3/8 câu đã làm (giống bảng số câu); thực tế: "${text.replace(/\s+/g, ' ').slice(0, 160)}"`);
  } finally { await ctx.close(); }
});

test('dist: [student] EX-HS-05 thẻ đề và hộp xem trước hiện đúng thời gian của đề (15 phút), không mặc định 50 phút (WEB-contract §19.1, §21)', async () => {
  const { ctx, page, card } = await student(1366, 768, HOA, { start: false });
  try {
    const cardText = await page.eval((q) => document.querySelector(q).innerText, card);
    assert.match(cardText, /15 phút/, `thẻ đề Hóa (đề 15 phút) phải ghi "15 phút"; thực tế: "${cardText.replace(/\s+/g, ' ')}"`);
    assert.doesNotMatch(cardText, /50 phút/, 'thẻ đề không được ghi thời gian mặc định 50 phút');
    await mouseClick(page, card);
    await page.waitFor(() => { const p = document.getElementById('examPreview'); return !!p && getComputedStyle(p).display !== 'none'; }, 'mở #examPreview', 5000);
    const prev = await page.eval(() => document.getElementById('examPreview').innerText);
    assert.match(prev, /15 phút/, `hộp xem trước phải ghi "15 phút"; thực tế: "${prev.replace(/\s+/g, ' ').slice(0, 200)}"`);
  } finally { await ctx.close(); }
});

test('dist: [student] EX-HS-06 đề ngắn (3 câu) không được tự mô tả là "theo cấu trúc tốt nghiệp THPT" (WEB-contract §19.1)', async () => {
  const { ctx, page, card } = await student(1366, 768, HOA, { start: false });
  try {
    await mouseClick(page, card);
    await page.waitFor(() => { const p = document.getElementById('examPreview'); return !!p && getComputedStyle(p).display !== 'none'; }, 'mở #examPreview', 5000);
    const all = await page.eval((q) => document.querySelector(q).innerText + '\n' + document.getElementById('examPreview').innerText, card);
    assert.doesNotMatch(all, /cấu trúc tốt nghiệp THPT/i, 'mô tả mặc định không được khẳng định đề theo cấu trúc tốt nghiệp THPT khi đề không phải vậy');
  } finally { await ctx.close(); }
});
