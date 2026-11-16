// Google Apps Script giả lập để chạy apps-script/Code.js thật trong Node (WEB-contract mục 17).
// Mô phỏng các điểm hay làm hỏng việc thật: ô tối đa 50 000 ký tự, chuỗi bắt đầu bằng = + - @ bị Sheets hiểu là công thức.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { PROJECT_ROOT } from './harness.mjs';

const CELL_LIMIT = 50000;

function storeCell(v) {
  if (typeof v === 'string') {
    if (v.length > CELL_LIMIT) throw new Error(`Your input contains more than the maximum of 50000 characters in a single cell.`);
    if (v.startsWith("'")) return v.slice(1);                    // Sheets: dấu nháy đầu = ép kiểu chữ, không hiển thị
    if (/^[=+\-@]/.test(v) && !/^-?\d+(?:[.,]\d+)?$/.test(v)) return '#ERROR!';   // bị hiểu là công thức
    if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);           // Sheets tự đổi chuỗi số thành số
  }
  return v ?? '';
}

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr: nr ?? 1, nc: nc ?? 1 }); }
  getValues() { return Array.from({ length: this.nr }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.sheet.cell(this.r + i, this.c + j))); }
  getValue() { return this.sheet.cell(this.r, this.c); }
  setValues(vals) { vals.forEach((row, i) => row.forEach((v, j) => this.sheet.set(this.r + i, this.c + j, v))); return this; }
  setValue(v) { this.sheet.set(this.r, this.c, v); return this; }
  clearContent() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.set(this.r + i, this.c + j, ''); return this; }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; }
  getName() { return this.name; }
  cell(r, c) { return this.rows[r - 1]?.[c - 1] ?? ''; }
  set(r, c, v) { while (this.rows.length < r) this.rows.push([]); this.rows[r - 1][c - 1] = storeCell(v); }
  getLastRow() { let n = this.rows.length; while (n > 0 && this.rows[n - 1].every((x) => x === '' || x === undefined)) n--; return n; }
  getLastColumn() { return Math.max(0, ...this.rows.map((r) => r.length)); }
  getMaxRows() { return Math.max(1000, this.rows.length); }
  getRange(a, b, c, d) { return new Range(this, a, b, c, d); }
  appendRow(row) { const r = this.getLastRow() + 1; row.forEach((v, j) => this.set(r, j + 1, v)); return this; }
  deleteRow(r) { this.rows.splice(r - 1, 1); return this; }
  deleteRows(r, n) { this.rows.splice(r - 1, n); return this; }
  insertRowAfter() { return this; }
  setFrozenRows() { return this; }
  clear() { this.rows = []; return this; }
  clearContents() { this.rows = []; return this; }
}

export function makeGas({ password = 'MatKhau-GV-123', adminPassword = 'Admin-Cunata-2026' } = {}) {
  const sheets = new Map();
  const book = {
    getSheetByName: (n) => sheets.get(n) ?? null,
    insertSheet: (n) => { const s = new Sheet(n); sheets.set(n, s); return s; },
    getSheets: () => [...sheets.values()],
    getActiveSheet: () => { if (!sheets.size) book.insertSheet('Sheet1'); return [...sheets.values()][0]; },
  };
  book.insertSheet('Sheet1');                                    // trang tính mặc định của một Google Sheet mới
  const props = new Map([...(password === null ? [] : [['TEACHER_PASSWORD', password]]), ...(adminPassword === null ? [] : [['ADMIN_PASSWORD', adminPassword]])]);
  const cache = new Map();
  const cacheSvc = { get: (k) => { const v = cache.get(k); if (!v || v.exp < Date.now()) return null; return v.val; }, put: (k, val, sec = 600) => { cache.set(k, { val: String(val), exp: Date.now() + Math.min(sec, 21600) * 1000 }); }, remove: (k) => cache.delete(k) };
  const toSigned = (buf) => [...buf].map((b) => (b > 127 ? b - 256 : b));
  const out = (text) => ({ text, mime: null, setMimeType(m) { this.mime = m; return this; }, getContent() { return this.text; } });
  const context = {
    console, JSON, Math, Date, Object, Array, String, Number, Boolean, BigInt, RegExp, Error, TypeError, Map, Set, parseInt, parseFloat, isFinite, encodeURIComponent, decodeURIComponent,
    SpreadsheetApp: { getActiveSpreadsheet: () => book, getActive: () => book, flush: () => {} },
    ContentService: { createTextOutput: out, MimeType: { JSON: 'application/json', TEXT: 'text/plain' } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {}, hasLock: () => true }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props.get(k) ?? null, getProperties: () => Object.fromEntries(props), setProperty: (k, v) => props.set(k, v) }) },
    Utilities: { getUuid: () => crypto.randomUUID(), sleep: () => {}, DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, value) => toSigned(createHash(alg === 'sha256' ? 'sha256' : 'sha256').update(typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value.map((b) => b & 255))).digest()),
      base64Encode: (v) => Buffer.from(typeof v === 'string' ? v : v.map((b) => b & 255)).toString('base64'),
      base64EncodeWebSafe: (v) => Buffer.from(typeof v === 'string' ? v : v.map((b) => b & 255)).toString('base64url') },
    CacheService: { getScriptCache: () => cacheSvc },
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    module: { exports: {} },
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(join(PROJECT_ROOT, 'apps-script', 'Code.js'), 'utf8'), context, { filename: 'apps-script/Code.js' });
  const parse = (r) => { assert(r && typeof r.text === 'string', 'doGet/doPost phải trả về ContentService.createTextOutput(...)'); return JSON.parse(r.text); };
  return {
    sheets, book, props, cache,
    get: (params) => parse(vm.runInContext('doGet', context)({ parameter: params, parameters: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, [v]])) })),
    post: (body) => parse(vm.runInContext('doPost', context)({ postData: { contents: JSON.stringify(body), type: 'text/plain' }, parameter: {} })),
    rawResponses: [],
  };
}

function assert(c, m) { if (!c) throw new Error(m); }
