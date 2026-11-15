import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBrowser, startServer, sleep } from '../claude-check/harness.mjs';
import { TARGETS, loadExam, makeExam, setName, waitSaved, typeShort, qIII } from '../claude-check/app.mjs';
import { open, field, jsonFile, answer, fullResponses, download, oracleCases, webFixture, assertScores, docxFile, csvRows } from './support.mjs';

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
const perfect = { sections: { I: { score: '1/4', max: '1/4' }, II: { score: '1', max: '1' }, III: { score: '35/4', max: '35/4' } }, total: '10', maxTotal: '10' };
const reportVisible = page => page.waitFor(() => {
  const e = document.getElementById('reportWrapper'); return !!e && e.getClientRects().length > 0;
}, 'report shown after submit/reload', 5000);
async function submit(page) {
  await page.click('#btnSubmit');
  await page.waitFor(() => document.getElementById('submitModal')?.getClientRects().length > 0, 'submit confirmation dialog', 3000);
  await page.click('#btnConfirmSubmit');
  await reportVisible(page);
}
async function openBuilder(page) {
  await page.click('#btnOpenBuilder');
  assert.equal(await page.eval(() => !!document.getElementById('builderModal')?.getClientRects().length), true,
    'clicking #btnOpenBuilder must open builder; otherwise subsequent authoring steps are unreachable');
}
async function openBank(page) {
  await page.click('#btnOpenBank');
  assert.equal(await page.eval(() => !!document.getElementById('bankModal')?.getClientRects().length), true,
    'clicking #btnOpenBank must open question bank');
}

for (const target of TARGETS) describe(`${target.name} — supplemental real-browser checks`, { concurrency: 3 }, () => {
  let server;
  before(async () => { server = await startServer(target.dir); });
  after(async () => { await server?.close(); });
  function run(name, body) {
    test(`${target.name}: ${name}`, { timeout: 59000 }, async () => {
      const ctx = await browser.newContext();
      try { await body(ctx, await open(ctx, server, target)); }
      finally { await ctx.close(); }
    });
  }

  for (const c of oracleCases) run(`[student][report] oracle ${c.id}`, async (_ctx, page) => {
    const exam = webFixture(c);
    await page.setFiles('#examFileInput', [jsonFile(exam, `oracle-${c.id}`)]);
    await page.waitFor((title, count) => document.getElementById('examTitle')?.textContent.trim() === title
      && document.querySelectorAll('#examPane .question-card').length === count,
    `load unchanged oracle exam ${c.id}`, 7000, exam.title, exam.questions.length);
    await answer(page, exam, c.attempt.responses);
    await submit(page);
    await assertScores(page, c.expected);
  });

  run('[teacher] create I/II/III, edit keys, publish, solve and JSON roundtrip', async (ctx, page) => {
    await openBuilder(page);
    // Remove any pre-existing draft through its public delete controls.
    await page.eval(() => { let b; while ((b = document.querySelector('#builderQuestionsContainer .btn-q-delete'))) b.click(); });
    await field(page, '#builderExamTitle', 'Đề giáo viên Codex ba phần');
    await field(page, '#builderExamId', 'codex-builder-three');
    await field(page, '#builderDuration', '50');
    for (const kind of ['I', 'II', 'III']) await page.click(`#btnAddPart${kind}`);
    assert.equal(await page.eval(() => document.querySelectorAll('#builderQuestionsContainer .builder-q-card').length), 3);
    for (let i = 0; i < 3; i++) {
      await page.click(`.btn-q-edit[data-idx="${i}"]`);
      await field(page, `#editQContent_${i}`, `Nội dung tự soạn ${i + 1} — tiếng Việt`);
      if (i === 0) {
        for (let j = 0; j < 4; j++) await field(page, `#editOptText_${i}_${j}`, `Phương án ${j + 1}`);
        await page.click('#editCorrectOpt_0_2');
      } else if (i === 1) {
        for (let j = 0; j < 4; j++) {
          await field(page, `#editStText_${i}_${j}`, `Mệnh đề ${j + 1}`);
          await field(page, `#editStAns_${i}_${j}`, String(j % 2 === 0));
        }
      } else await field(page, '#editQAnswerKey_2', '-0,5');
      await page.click(`.btn-q-save-edit[data-idx="${i}"]`);
    }
    const exported = JSON.parse((await download(ctx, page, '#btnExportExamJson')).text);
    assert.deepEqual(exported.questions.map(q => q.kind), ['I', 'II', 'III']);
    assert.equal(exported.questions[0].correctOptionId, exported.questions[0].options[2].optionId);
    assert.deepEqual(exported.questions[1].statements.map(s => s.answer), [true, false, true, false]);
    assert.equal(exported.questions[2].answerKey, '-0,5');
    await page.click('#btnPublishToRunner');
    await page.waitFor(t => document.getElementById('examTitle')?.textContent.trim() === t, 'published teacher title', 5000, exported.title);
    await answer(page, exported, fullResponses(exported));
    await submit(page); await assertScores(page, perfect);
    // Reload the exact exported bytes in a second clean browser context; no previous final to mask scoring.
    const other = await browser.newContext();
    try {
      const p = await open(other, server, target);
      await loadExam(p, exported);
      await answer(p, exported, fullResponses(exported));
      await submit(p); await assertScores(p, perfect);
    } finally { await other.close(); }
  });

  for (const kind of ['I', 'II', 'III']) run(`[teacher] missing ${kind} answer key rejects import and cannot publish malformed replacement`, async (ctx, page) => {
    const good = makeExam({ id: `codex-valid-before-${kind}`, title: `Valid before ${kind}`, part1: ['b'], part2: [[true, false, true, false]], part3: ['1,5'] });
    await openBuilder(page);
    await page.setFiles('#builderFileInput', [jsonFile(good, `builder-good-${kind}`)]);
    await page.waitFor(() => document.getElementById('builderQuestionCount')?.textContent.trim() === '3', 'valid builder import', 5000);
    const bad = structuredClone(good); bad.title = `MALFORMED-${kind}`; bad.examId += '-bad';
    const q = bad.questions.find(q => q.kind === kind);
    if (kind === 'I') delete q.correctOptionId;
    else if (kind === 'II') q.statements.forEach(s => { delete s.answer; });
    else delete q.answerKey;
    const before = page.dialogs.length;
    await page.setFiles('#builderFileInput', [jsonFile(bad, `builder-missing-${kind}`)]);
    for (let i = 0; i < 50 && page.dialogs.length === before; i++) await sleep(100);
    assert.match(page.dialogs.slice(before).join('\n'), /I_KEY_NOT_IN_OPTIONS|II_ANSWER_NOT_BOOLEAN|III_KEY_INVALID|không hợp lệ|Lỗi/i, 'must explicitly report missing key');
    const retained = JSON.parse((await download(ctx, page, '#btnExportExamJson')).text);
    assert.equal(retained.examId, good.examId, 'rejected import must retain valid draft');
    assert.deepEqual(retained.questions, good.questions, 'missing II must never turn into four false keys');
    await page.click('#btnPublishToRunner');
    await page.waitFor(t => document.getElementById('examTitle')?.textContent.trim() === t, 'only prior valid draft published', 5000, good.title);
  });

  run('[teacher] blank III editor key blocks save, correction then publishes', async (_ctx, page) => {
    await openBuilder(page);
    await page.click('#btnAddPartIII');
    const index = await page.eval(() => document.querySelectorAll('#builderQuestionsContainer .builder-q-card').length - 1);
    await page.click(`.btn-q-edit[data-idx="${index}"]`);
    await field(page, `#editQAnswerKey_${index}`, '');
    await page.click(`.btn-q-save-edit[data-idx="${index}"]`);
    assert.ok(await page.eval(i => !!document.getElementById(`editQAnswerKey_${i}`), index), 'invalid blank key must remain in editor for correction');
    await field(page, `#editQAnswerKey_${index}`, '-0,5');
    await page.click(`.btn-q-save-edit[data-idx="${index}"]`);
    assert.equal(await page.eval(i => !!document.getElementById(`editQAnswerKey_${i}`), index), false, 'corrected key saves');
    await page.click('#btnPublishToRunner');
    await page.waitFor(() => document.querySelectorAll('#examPane .short-answer-input').length > 0, 'corrected draft published', 5000);
  });

  run('[bank] restore samples, combine search/kind filters and clear query', async (_ctx, page) => {
    await openBank(page); await page.click('#btnSeedBankSample');
    const all = await page.eval(() => document.querySelectorAll('#bankQuestionsContainer .builder-q-card').length);
    assert.ok(all > 0, 'sample restore must produce questions');
    await page.click('.bank-filter-btn[data-filter="II"]');
    const filtered = await page.eval(() => [...document.querySelectorAll('#bankQuestionsContainer .builder-q-card')].map(e => e.innerText));
    assert.ok(filtered.length > 0 && filtered.every(t => t.includes('Phần II')));
    await field(page, '#bankSearchInput', 'CODEX-NO-MATCH-7321');
    assert.equal(await page.eval(() => document.querySelectorAll('#bankQuestionsContainer .builder-q-card').length), 0);
    await field(page, '#bankSearchInput', '');
    assert.equal(await page.eval(() => document.querySelectorAll('#bankQuestionsContainer .builder-q-card').length), filtered.length);
  });

  run('[bank][teacher] export, clear, import, reuse and edit without mutating bank', async (ctx, page) => {
    await openBank(page); await page.click('#btnSeedBankSample');
    const original = JSON.parse((await download(ctx, page, '#btnExportBankJson')).text);
    assert.ok(Array.isArray(original) && original.length > 0);
    await page.click('#btnClearBank');
    assert.equal(await page.eval(() => document.querySelectorAll('#bankQuestionsContainer .builder-q-card').length), 0);
    await page.setFiles('#bankFileInput', [jsonFile(original, 'bank-backup')]);
    await page.waitFor(n => document.querySelectorAll('#bankQuestionsContainer .builder-q-card').length === n, 'bank JSON restored', 5000, original.length);
    const restored = JSON.parse((await download(ctx, page, '#btnExportBankJson')).text);
    assert.deepEqual(restored, original, 'bank roundtrip preserves nested text, keys and IDs');
    await page.click('.btn-bank-add-to-exam');
    await page.click('#btnCloseBank'); await openBuilder(page);
    const index = await page.eval(() => document.querySelectorAll('#builderQuestionsContainer .builder-q-card').length - 1);
    await page.click(`.btn-q-edit[data-idx="${index}"]`);
    await field(page, `#editQContent_${index}`, 'CODEX edited reuse only');
    await page.click(`.btn-q-save-edit[data-idx="${index}"]`);
    const draft = JSON.parse((await download(ctx, page, '#btnExportExamJson')).text);
    assert.equal(draft.questions.at(-1).content, 'CODEX edited reuse only');
    await page.click('#btnCancelBuilder'); await openBank(page);
    assert.deepEqual(JSON.parse((await download(ctx, page, '#btnExportBankJson')).text), original, 'reuse is a detached copy');
  });

  async function importPreview(page) {
    const path = docxFile();
    await openBuilder(page);
    const available = await page.eval(() => [...document.querySelectorAll('input[type=file]')].map(e => ({ id: e.id, accept: e.accept })));
    const input = available.find(e => /docx|wordprocessingml/i.test(e.accept));
    assert.ok(input?.id, `DOCX file chooser is missing from actual UI; available=${JSON.stringify(available)}`);
    await page.setFiles(`[id=${JSON.stringify(input.id)}]`, [path]);
    await page.waitFor(() => /DOCX Unicode kiểm định/.test(document.body.innerText), 'DOCX preview text before confirmation', 5000);
    return page.eval(() => document.body.innerText);
  }
  run('[import] generated DOCX preview preserves table/image or explicitly warns', async (_ctx, page) => {
    const text = await importPreview(page);
    const retained = await page.eval(() => ({ table: [...document.querySelectorAll('table')].map(e => e.textContent).join('\n'), images: [...document.images].filter(e => e.complete && e.naturalWidth > 0).map(e => ({ alt: e.alt, src: e.src })) }));
    assert.ok(retained.table.includes('TABLE-KEEP-42') || /bảng.*(cảnh báo|không hỗ trợ)|TABLE.*(UNSUPPORTED|WARNING)/i.test(text), 'table cannot disappear silently');
    assert.ok(retained.images.some(e => /IMAGE-KEEP-42/.test(e.alt) || /^data:image\/png/.test(e.src)) || /ảnh.*(cảnh báo|không hỗ trợ)|IMAGE.*(UNSUPPORTED|WARNING)/i.test(text), 'image cannot disappear silently');
  });
  run('[import][teacher] generated DOCX preview, correction and explicit confirmation', async (_ctx, page) => {
    await importPreview(page);
    assert.ok(await page.eval(() => { const e = [...document.querySelectorAll('.preview-btn')].find(e => e.textContent.trim() === 'Hiệu đính'); e?.click(); return !!e; }), 'preview correction action');
    await field(page, '.draft-edit-form textarea', 'DOCX corrected by teacher');
    assert.ok(await page.eval(() => { const e = [...document.querySelectorAll('.draft-edit-form button')].find(e => /Lưu thay đổi/.test(e.textContent)); e?.click(); return !!e; }));
    const checkbox = '.draft-checkbox-input';
    await page.click(checkbox);
    assert.ok(await page.eval(() => { const e = [...document.querySelectorAll('.preview-btn')].find(e => /Xác nhận nhập vào đề/.test(e.textContent) && !e.disabled); e?.click(); return !!e; }), 'explicit confirm action required');
    await page.waitFor(() => document.getElementById('builderQuestionsContainer')?.textContent.includes('DOCX corrected by teacher'), 'confirmed correction reaches draft', 5000);
  });
  run('[import] cancelled DOCX preview cannot confirm or partially add to draft', async (_ctx, page) => {
    await openBuilder(page);
    const before = await page.eval(() => document.getElementById('builderQuestionCount')?.textContent);
    await page.click('#btnCancelBuilder'); await importPreview(page);
    assert.ok(await page.eval(() => { const e = [...document.querySelectorAll('.preview-btn')].find(e => /Hủy nhập/.test(e.textContent) && !e.disabled); e?.click(); return !!e; }), 'preview cancel action required');
    const state = await page.eval(() => ({ count: document.getElementById('builderQuestionCount')?.textContent,
      confirms: [...document.querySelectorAll('button')].filter(e => /xác nhận/i.test(e.textContent) && !e.disabled && e.getClientRects().length).length }));
    assert.equal(state.count, before); assert.equal(state.confirms, 0, 'cancelled job cannot be confirmed');
  });

  for (const prefix of ['=', '+', '-', '@']) run(`[collect] JSON raw + CSV formula protection for nickname ${prefix}`, async (ctx, page) => {
    const name = `${prefix}SUM(1,1)`;
    await loadExam(page, makeExam({ id: `codex-collect-${prefix.charCodeAt(0)}`, part1: [], part2: [], part3: ['-0,5'] }));
    await setName(page, name); await typeShort(page, qIII(1), '-0,5'); await submit(page);
    const buttons = await page.eval(() => [...document.querySelectorAll('button,a[download]')].filter(e => e.getClientRects().length).map(e => ({ id: e.id, text: e.textContent })));
    const json = buttons.find(b => /json/i.test(b.text) && /kết quả|result/i.test(b.text));
    const csv = buttons.find(b => /csv/i.test(b.text));
    assert.ok(json?.id && csv?.id, `result JSON/CSV export controls missing; visible=${JSON.stringify(buttons)}`);
    const raw = JSON.parse((await download(ctx, page, `[id=${JSON.stringify(json.id)}]`)).text);
    assert.ok(JSON.stringify(raw).includes(name), 'JSON preserves original nickname');
    assert.ok(JSON.stringify(raw).includes('"-0,5"'), 'JSON preserves raw negative short answer');
    const text = (await download(ctx, page, `[id=${JSON.stringify(csv.id)}]`)).text;
    const cells = csvRows(text).flat();
    assert.ok(cells.includes(`'${name}`), 'CSV uses apostrophe prefix for dangerous nickname');
    assert.ok(!cells.some(c => /^[\s\u0000-\u001f]*[=+@-]/u.test(c)), 'no executable spreadsheet cell prefix');
  });
  run('[collect][storage] no endpoint: honest local status and zero collector requests, including reload', async (_ctx, page) => {
    await loadExam(page, makeExam({ id: 'codex-no-endpoint', part1: ['a'], part2: [], part3: [] }));
    await setName(page, 'Codex trạng thái cục bộ'); await waitSaved(page); await submit(page);
    const check = async () => {
      const status = await page.eval(() => ({ sync: document.getElementById('syncText')?.textContent ?? '', report: document.getElementById('reportWrapper')?.innerText ?? '' }));
      assert.doesNotMatch(status.sync, /đã gửi|đã đồng bộ|server_confirmed|đã lưu.*(?:Drive|Google|máy chủ)/i);
      assert.match(status.sync, /đã.*lưu|local_saved/i, 'UI must report successful local persistence without claiming server receipt');
    };
    await check(); await page.reload(); await reportVisible(page); await check();
    assert.ok(await page.eval(() => document.getElementById('reportWrapper')?.innerText.includes('Codex trạng thái cục bộ')), 'reload must preserve final candidate name');
    const urls = page.requests.filter(u => /^https?:/.test(u) && !u.startsWith(server.url));
    assert.deepEqual(urls, [], 'no external collector may be contacted without configured endpoint');
  });
});
