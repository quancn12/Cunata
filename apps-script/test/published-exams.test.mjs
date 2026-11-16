import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { makeGas as baseGas } from '../../test/claude-check/gas-fake.mjs';
import { createHash, randomUUID } from 'node:crypto';

// Migrate the old shared-password harness to real per-teacher sessions (19.2).
function makeGas(options) {
  const g = baseGas(options);
  const admin = g.post({ action: 'adminLogin', password: 'Admin-Cunata-2026' });
  g.post({ action: 'adminCreateTeacher', token: admin.token, name: 'Teacher', username: 'teacher', password });
  g.token = g.post({ action: 'teacherLogin', username: 'teacher', password }).token;
  return g;
}

const password = 'MatKhau-GV-123';
const exam = (extra = {}) => ({ schemaVersion: 'web-exam-v1', examId: 'exam-01', title: 'Đề thử',
  subject: 'Lý', grade: 12, settings: { durationMinutes: 50 },
  questions: [{ kind: 'III', questionVersionId: 'q1', answerKey: '-0,5' }], ...extra });
const publish = (g, value) => g.post({ action: 'publishExam', token: g.token, exam: value });

test('reject malformed exams with INVALID_EXAM and a nonempty error list before writes', () => {
  const invalid = [null, [], {}, exam({ schemaVersion: 'future' }), exam({ examId: 42 }),
    exam({ examId: '' }), exam({ title: {} }), exam({ questions: [] }),
    exam({ questions: [{ kind: 'IV' }] }),
    exam({ questions: [{ kind: 'III', answerKey: 123 }] }),
    exam({ questions: [{ kind: 'III', answerKey: '1.5' }] }),
    exam({ questions: [{ kind: 'III', answerKey: '1\n' }] }),
    exam({ questions: [{ kind: 'III', answerKey: '1\r' }] }),
    exam({ questions: [{ kind: 'I', options: [{}, {}, {}, {}] }] }),
    exam({ questions: [{ kind: 'I', options: Array(4).fill({ optionId: 'a' }), correctOptionId: 'a' }] }),
    exam({ questions: [{ kind: 'II', statements: Array(4).fill({ statementId: 'a', answer: true }) }] })];
  for (const value of invalid) {
    const g = makeGas();
    const response = publish(g, value);
    assert.equal(response.error, 'INVALID_EXAM', JSON.stringify(value));
    assert.ok(Array.isArray(response.errors) && response.errors.length > 0);
    assert.equal(g.sheets.has('DeThi'), false);
  }
});

test('legacy shared passwords never authorize teacher operations', () => {
  const g = baseGas();
  for (const action of ['teacherLogin', 'publishExam', 'unpublishExam']) {
    assert.equal(g.post({ action, password, exam: exam(), examId: 'exam-01' }).error, 'UNAUTHORIZED');
  }
});

test('metadata preserves apostrophes, numeric-looking text, whitespace and formula prefixes', () => {
  for (const text of ["'quoted", '00123', '=SUM(1,2)', '+abc', '-abc', '@abc', '  Đề Việt  ']) {
    const g = makeGas();
    const value = exam({ examId: text, title: text, subject: text, group: text });
    assert.equal(publish(g, value).success, true);
    const meta = g.get({ action: 'listExams' }).exams[0];
    for (const key of ['id', 'title', 'subject', 'group']) assert.equal(meta[key], text, key);
    assert.deepEqual(g.get({ action: 'getExam', id: text }).exam, value);
    assert.equal(publish(g, { ...value, title: 'Bản mới' }).revision, 2);
    assert.equal(g.get({ action: 'listExams' }).exams.length, 1);
    assert.equal(g.post({ action: 'unpublishExam', token: g.token, examId: text }).success, true);
    assert.deepEqual(g.get({ action: 'listExams' }).exams, []);
  }
});

test('chunk boundaries preserve apostrophes, formulas, digits and Unicode; shorter revision removes old chunks', () => {
  for (const prefix of ["'", '=', '+', '-', '@', '0', '😀']) {
    const g = makeGas();
    const value = exam({ padding: '' });
    const offset = JSON.stringify(value).indexOf('"padding":"') + '"padding":"'.length;
    value.padding = 'x'.repeat(39999 - offset) + prefix + 'A'.repeat(95000);
    assert.equal(JSON.stringify(value).slice(39999, 39999 + prefix.length), prefix);
    assert.equal(publish(g, value).success, true);
    assert.deepEqual(g.get({ action: 'getExam', id: value.examId }).exam, value);
    assert.ok(g.sheets.get('DeThi').rows[1].slice(9).every((s) => String(s).length <= 40000));
    const short = exam();
    assert.equal(publish(g, short).revision, 2);
    assert.deepEqual(g.get({ action: 'getExam', id: short.examId }).exam, short);
  }
});

function lockedGas(acquire = true) {
  const g = makeGas();
  let held = false;
  let releases = 0;
  const book = g.book;
  const insert = book.insertSheet;
  book.insertSheet = (name) => {
    assert.equal(held, true, 'sheet creation requires ScriptLock');
    const sheet = insert(name);
    const range = sheet.getRange.bind(sheet);
    sheet.getRange = (...args) => {
      const target = range(...args);
      const write = target.setValues.bind(target);
      target.setValues = (...values) => { assert.equal(held, true, 'range write requires ScriptLock'); return write(...values); };
      return target;
    };
    for (const name of ['appendRow', 'deleteRow']) {
      const original = sheet[name].bind(sheet);
      sheet[name] = (...args) => { assert.equal(held, true, 'write requires ScriptLock'); return original(...args); };
    }
    return sheet;
  };
  const ctx = { CacheService: { getScriptCache: () => ({ get: key => g.cache.get(key)?.val ?? null }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, getUuid: randomUUID, computeDigest: (_, text) => [...createHash('sha256').update(text).digest()] },
    SpreadsheetApp: { getActiveSpreadsheet: () => book, flush: () => assert.equal(held, true) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => password }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { held = acquire; return acquire; },
      releaseLock: () => { assert.equal(held, true); held = false; releases++; } }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (text) => ({ setMimeType: () => ({ text }) }) } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../Code.js', import.meta.url), 'utf8'), ctx);
  return { ...g, ctx, releases: () => releases,
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text) };
}

test('publish/unpublish writes hold ScriptLock; busy lock never writes or releases', () => {
  const g = lockedGas();
  assert.equal(publish(g, exam()).success, true);
  assert.equal(g.post({ action: 'unpublishExam', token: g.token, examId: 'exam-01' }).success, true);
  assert.equal(g.releases(), 2);
  const busy = lockedGas(false);
  assert.equal(publish(busy, exam()).error, 'SERVER_BUSY');
  assert.equal(busy.post({ action: 'unpublishExam', token: busy.token, examId: 'exam-01' }).error, 'SERVER_BUSY');
  assert.equal(busy.releases(), 0);
  assert.equal(busy.sheets.has('DeThi'), false);
});

test('storage failures return JSON without reflecting secret exception text and release lock', () => {
  const g = lockedGas();
  g.book.insertSheet = () => { throw new Error(password); };
  const response = publish(g, exam());
  assert.equal(response.success, false);
  assert.ok(!JSON.stringify(response).includes(password));
  assert.equal(g.releases(), 1);
  g.book.getSheetByName = () => { throw new Error(password); };
  for (const action of ['listExams', 'getExam']) {
    const output = g.ctx.doGet({ parameter: { action, id: 'exam-01' } });
    const parsed = JSON.parse(output.text);
    assert.equal(parsed.success, false);
    assert.ok(!output.text.includes(password));
  }
});

test('very large exams expand the sheet grid and never split Unicode pairs', () => {
  const g = lockedGas();
  const originalInsert = g.book.insertSheet;
  let expanded = false;
  g.book.insertSheet = (name) => {
    const sheet = originalInsert(name);
    let columns = 26;
    sheet.getMaxColumns = () => columns;
    sheet.insertColumnsAfter = (after, count) => { assert.equal(after, columns); columns += count; expanded = true; };
    const getRange = sheet.getRange.bind(sheet);
    sheet.getRange = (r, c, nr, nc) => { assert.ok(c + nc - 1 <= columns); return getRange(r, c, nr, nc); };
    return sheet;
  };
  const value = exam({ padding: '' });
  const offset = JSON.stringify(value).indexOf('"padding":"') + '"padding":"'.length;
  value.padding = 'x'.repeat(39998 - offset) + '😀'.repeat(400000);
  assert.equal(publish(g, value).success, true);
  assert.equal(expanded, true);
  assert.deepEqual(g.get({ action: 'getExam', id: value.examId }).exam, value);
  for (const cell of g.sheets.get('DeThi').rows[1].slice(9)) {
    assert.ok(cell.length <= 40000);
    assert.ok(!/[\uD800-\uDBFF]$/.test(cell), 'no trailing half of a Unicode pair');
    assert.ok(!/^[\uDC00-\uDFFF]/.test(cell), 'no leading half of a Unicode pair');
  }
});

test('a failed replacement write keeps the previous exam and revision', () => {
  const g = makeGas();
  const value = exam();
  assert.equal(publish(g, value).success, true);
  const sheet = g.sheets.get('DeThi');
  const getRange = sheet.getRange.bind(sheet);
  sheet.getRange = (...args) => {
    const range = getRange(...args);
    range.setValues = () => { throw new Error('write unavailable'); };
    return range;
  };
  assert.equal(publish(g, { ...value, title: 'replacement' }).success, false);
  assert.deepEqual(g.get({ action: 'getExam', id: value.examId }).exam, value);
  assert.equal(g.get({ action: 'listExams' }).exams[0].revision, 1);
});
