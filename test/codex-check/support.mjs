import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { waitBoot, pageProblems, typeShort, setStatement } from '../claude-check/app.mjs';

export const fixtureDir = fileURLToPath(new URL('./fixtures/', import.meta.url));
mkdirSync(fixtureDir, { recursive: true });
export function jsonFile(value, name) {
  const path = `${fixtureDir}${name}.json`;
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}
export async function open(ctx, server, target) {
  const page = await ctx.newPage();
  await page.goto(server.url + target.path);
  try { await waitBoot(page, 7000); }
  catch (error) { throw new Error(`${error.message}; browser evidence: ${JSON.stringify(pageProblems(page))}`); }
  return page;
}
export async function field(page, selector, value) {
  await page.eval((s, v) => {
    const e = document.querySelector(s);
    if (!e) throw new Error('Missing UI field: ' + s);
    e.value = v;
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}
export async function download(ctx, page, selector) {
  ctx.clearDownloads();
  await page.click(selector);
  return ctx.waitDownload(5000);
}
export async function answer(page, exam, responses) {
  for (const r of responses) {
    const q = exam.questions.find(q => q.questionVersionId === r.questionVersionId);
    assert.ok(q, 'Fixture response must refer to a real question');
    if (r.kind === 'I' && r.selectedOptionId != null) {
      assert.ok(q.options.some(o => o.optionId === r.selectedOptionId), 'Fixture must be expressible through UI');
      await page.click(`[data-qid=${JSON.stringify(q.questionVersionId)}][data-option-id=${JSON.stringify(r.selectedOptionId)}]`);
    } else if (r.kind === 'II') {
      for (const a of r.answers) if (a.value != null) {
        const i = q.statements.findIndex(s => s.statementId === a.statementId);
        assert.ok(i >= 0, 'Fixture statement must be expressible through UI');
        await setStatement(page, q.questionVersionId, i, a.value);
      }
    } else if (r.kind === 'III' && r.raw != null && r.raw !== '') {
      await typeShort(page, q.questionVersionId, r.raw);
    }
  }
}
export function fullResponses(exam) {
  return exam.questions.map(q => q.kind === 'I'
    ? { kind: 'I', questionVersionId: q.questionVersionId, selectedOptionId: q.correctOptionId }
    : q.kind === 'II'
      ? { kind: 'II', questionVersionId: q.questionVersionId, answers: q.statements.map(s => ({ statementId: s.statementId, value: s.answer })) }
      : { kind: 'III', questionVersionId: q.questionVersionId, raw: q.answerKey });
}
const fixtures = name => JSON.parse(readFileSync(new URL(`../oracle/fixtures/${name}.json`, import.meta.url), 'utf8')).cases;
export const oracleCases = [
  ...fixtures('golden'),
  ...fixtures('sections-I-II').filter(c => /^II-k-[0-4]$|^II-false-key-(all-null|all-missing|one-false)$/.test(c.id)),
  ...fixtures('short-answers').filter(c => ['III-exact', 'III-trailing-zero', 'III-reverse-trailing-zero', 'III-negative-four', 'III-negative-wrong', 'III-integer'].includes(c.id)),
];
assert.equal(oracleCases.length, 43);
export function webFixture(c) {
  // Only add display metadata. Domain IDs, keys, responses and oracle expected stay unchanged.
  return { ...structuredClone(c.exam), schemaVersion: 'web-exam-v1', title: `Oracle ${c.id}`,
    subject: 'Toán học', grade: 12, assets: [],
    settings: { durationMinutes: 50, maxAttempts: null, releasePolicy: 'immediate', shuffleQuestions: false, shuffleOptions: false },
    questions: c.exam.questions.map((q, i) => ({ ...structuredClone(q), title: `Câu ${i + 1}`, content: `Oracle ${c.id} câu ${i + 1}`,
      ...(q.options ? { options: q.options.map((o, j) => ({ ...o, label: 'ABCD'[j], text: `Lựa chọn ${j + 1}` })) } : {}),
      ...(q.statements ? { statements: q.statements.map((s, j) => ({ ...s, label: 'abcd'[j], text: `Mệnh đề ${j + 1}` })) } : {}) })) };
}
function scalar(s) {
  const m = s.trim().replaceAll(',', '.').match(/^(-?\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?$/);
  assert.ok(m, `Unrecognized score component ${JSON.stringify(s)}`);
  const digits = m[1].split('.');
  return [BigInt(digits.join('')), 10n ** BigInt(digits[1]?.length ?? 0) * BigInt(m[2] ?? '1')];
}
export async function assertScores(page, expected) {
  const raw = await page.eval(() => Object.fromEntries(['I', 'II', 'III', 'Total'].map(k => [k,
    document.getElementById(k === 'Total' ? 'scoreTotal' : `scorePart${k}`)?.textContent ?? ''])));
  for (const k of ['I', 'II', 'III', 'Total']) {
    const e = k === 'Total' ? { score: expected.total, max: expected.maxTotal } : expected.sections[k];
    // Split only the UI's space-delimited score/max separator, preserving 10/3 fractions.
    const parts = raw[k].trim().split(/\s+\/\s+/);
    assert.equal(parts.length, 2, `${k} must display score / max: ${raw[k]}`);
    for (const [i, key] of ['score', 'max'].entries()) {
      const component = parts[i].replace(/\s*\([^)]*\)\s*/g, '').trim();
      const actual = scalar(component), wanted = scalar(e[key]);
      // Compare exact rational values, including finite decimals; ignore labelled approximations only.
      assert.equal(actual[0] * wanted[1], wanted[0] * actual[1],
        `${k}.${key}: oracle=${e[key]}, UI=${JSON.stringify(raw[k])}`);
    }
  }
}

// ZIP stored entries with real CRC32, central directory and deterministic DOS dates.
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zip(entries) {
  const locals = [], central = []; let offset = 0;
  for (const [name, content] of entries) {
    const filename = Buffer.from(name), data = Buffer.isBuffer(content) ? content : Buffer.from(content);
    const crc = crc32(data), local = Buffer.alloc(30), cd = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    cd.writeUInt32LE(0x02014b50); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x800, 8);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(filename.length, 28); cd.writeUInt32LE(offset, 42);
    locals.push(local, filename, data); central.push(cd, filename); offset += local.length + filename.length + data.length;
  }
  const c = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(c.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, c, end]);
}
export function docxFile() {
  const chunk = (type, data) => {
    const tag = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([tag, data])));
    return Buffer.concat([length, tag, data, checksum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0, 255]))), chunk('IEND', Buffer.alloc(0))]);
  const p = t => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${p('PHẦN I. Trắc nghiệm')}${p('Câu 1. DOCX Unicode kiểm định')}${p('A. Một')}${p('B. Hai')}${p('C. Ba')}${p('D. Bốn')}${p('Đáp án: A')}<w:tbl><w:tblPr/><w:tblGrid><w:gridCol w:w="2400"/></w:tblGrid><w:tr><w:tc>${p('TABLE-KEEP-42')}</w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="IMAGE-KEEP-42" descr="IMAGE-KEEP-42"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="IMAGE-KEEP-42"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p><w:sectPr/></w:body></w:document>`;
  const bytes = zip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', xml],
    ['word/_rels/document.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>'],
    ['word/media/image1.png', png],
  ]);
  const path = `${fixtureDir}minimal.docx`; writeFileSync(path, bytes); return path;
}

// RFC4180 parser independent of the product exporter.
export function csvRows(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && c === ',') { row.push(cell); cell = ''; }
    else if (!quoted && (c === '\r' || c === '\n')) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  assert.equal(quoted, false, 'CSV quotes must balance');
  if (row.length || cell) { row.push(cell); rows.push(row); }
  return rows;
}
