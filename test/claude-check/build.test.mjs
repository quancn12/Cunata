// Kiểm định tĩnh bản build (không cần trình duyệt): mọi thứ trang tham chiếu phải tồn tại và chạy được dưới đường dẫn con.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { PROJECT_ROOT } from './harness.mjs';

const DIST = join(PROJECT_ROOT, 'dist');
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rel = (p) => relative(PROJECT_ROOT, p).split(sep).join('/');

/** Trả về danh sách vấn đề về tài nguyên mà một file HTML tham chiếu. */
function htmlProblems(file) {
  const html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const out = [];
  for (const m of html.matchAll(/<(?:script|link|img|source)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const u = m[1];
    if (/^(data:|blob:|#|mailto:)/i.test(u)) continue;
    if (/^https?:\/\//i.test(u) || u.startsWith('//')) { out.push(`${rel(file)}: nạp tài nguyên từ mạng ngoài "${u}" (web phải tự chứa, chạy offline)`); continue; }
    if (u.startsWith('/')) { out.push(`${rel(file)}: đường dẫn tuyệt đối từ gốc "${u}" sẽ hỏng dưới /Cunata/`); continue; }
    const target = resolve(dirname(file), decodeURIComponent(u.split(/[?#]/)[0]));
    if (!existsSync(target)) out.push(`${rel(file)}: tham chiếu "${u}" nhưng không có file ${rel(target)}`);
  }
  return out;
}

test('[glue] index.html gốc: mọi tài nguyên tham chiếu đều tồn tại, không dùng đường dẫn tuyệt đối hay mạng ngoài', () => {
  assert.deepEqual(htmlProblems(join(PROJECT_ROOT, 'index.html')), []);
});

test('[glue] dist/: có index.html và mọi tài nguyên tham chiếu đều tồn tại', () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'thiếu dist/index.html — chạy `node scripts/web-build.ts`');
  assert.deepEqual(htmlProblems(join(DIST, 'index.html')), []);
});

test('[glue] dist/: mọi import trong file .js trỏ tới file .js có thật; không import .ts, không import gói Node/npm', () => {
  assert.ok(existsSync(DIST), 'thiếu thư mục dist/');
  const problems = [];
  for (const file of walk(DIST).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const specs = [...src.matchAll(/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g), ...src.matchAll(/\bimport\s*['"]([^'"]+)['"]/g), ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
    for (const s of specs) {
      if (!s.startsWith('.')) { problems.push(`${rel(file)}: import "${s}" không phải đường dẫn tương đối — trình duyệt không nạp được`); continue; }
      if (/\.ts$/.test(s)) { problems.push(`${rel(file)}: import "${s}" còn đuôi .ts`); continue; }
      if (!existsSync(resolve(dirname(file), s))) problems.push(`${rel(file)}: import "${s}" nhưng file không tồn tại`);
    }
  }
  assert.deepEqual(problems.slice(0, 40), []);
});

test('[glue] dist/: có đủ đề mẫu Toán, Lý, Hóa và là JSON hợp lệ có câu hỏi', () => {
  const dir = join(DIST, 'public', 'exams');
  assert.ok(existsSync(dir), 'thiếu dist/public/exams');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json');   // index.json la danh sach de, khong phai de
  assert.ok(files.length >= 3, `cần ít nhất 3 đề mẫu, hiện có ${files.length}`);
  for (const f of files) {
    const exam = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    assert.ok(Array.isArray(exam.questions) && exam.questions.length > 0, `${f}: không có câu hỏi`);
    assert.ok(typeof exam.title === 'string' && exam.title.length > 0, `${f}: thiếu tiêu đề`);
  }
});

// Codex CK08-F01: ban build tung chen cau hoi gia vao index.json. Ban build phai chep NGUYEN thu muc public/.
test('[glue] dist/public giống hệt public/: bản build chép nguyên, không thêm bớt hay sửa dữ liệu', () => {
  const src = join(PROJECT_ROOT, 'public');
  const problems = [];
  for (const f of walk(src)) {
    const d = join(DIST, 'public', relative(src, f));
    if (!existsSync(d)) problems.push(`thiếu trong dist: public/${relative(src, f).split(sep).join('/')}`);
    else if (!readFileSync(f).equals(readFileSync(d))) problems.push(`nội dung khác bản gốc: public/${relative(src, f).split(sep).join('/')}`);
  }
  assert.deepEqual(problems.slice(0, 20), []);
});

test('[glue] public/exams/index.json là danh sách đề đúng lược đồ; mỗi mục trỏ tới đề thật, questionCount khớp', () => {
  const m = JSON.parse(readFileSync(join(PROJECT_ROOT, 'public', 'exams', 'index.json'), 'utf8'));
  assert.deepEqual(Object.keys(m).sort(), ['exams', 'version'], 'index.json chỉ gồm {version, exams} — không phải một đề thi, không có trường questions/title');
  assert.ok(Array.isArray(m.exams) && m.exams.length >= 3);
  for (const e of m.exams) {
    const file = join(PROJECT_ROOT, e.url);
    assert.ok(existsSync(file), `mục "${e.id}" trỏ tới file không tồn tại: ${e.url}`);
    const exam = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(exam.examId, e.id, `${e.url}: examId phải khớp id trong danh sách`);
    assert.equal(exam.questions.length, e.questionCount, `${e.url}: questionCount trong danh sách phải bằng số câu thật`);
    for (const q of exam.questions.filter((x) => x.kind === 'I')) assert.equal(q.options.length, 4, `${e.url} ${q.questionVersionId}: câu Phần I phải có 4 phương án`);
  }
});
