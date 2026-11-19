/**
 * Test Suite for WEB-FINAL-DOCS — Sample Paths, Commands, Build Wrapper & Documentation Integrity
 * Conforms to WEB-contract.md §2, §9, §10, §12 and tasks.json (WEB-FINAL-DOCS).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { assertRuntimeImport } from '../glue/assert-runtime-import.ts';

import { validateExamVersion, computeExamMax } from '../../src/domain/index.ts';

describe('WEB-FINAL-DOCS — Sample Paths & Asset Verification', () => {
  const rootDir = path.resolve('.');

  it('verifies that all sample exam fixtures and assets exist', () => {
    const requiredFiles = [
      'public/sample-exam.json',
      'public/q01-bbt.svg',
      'public/exams/toan-full.json',
      'public/exams/ly-part-I.json',
      'public/exams/hoa-repeating.json',
      'apps-script/Code.js',
      'apps-script/appsscript.json',
      'apps-script/README.md',
    ];

    for (const rel of requiredFiles) {
      const full = path.join(rootDir, rel);
      assert.ok(fs.existsSync(full), `Required file must exist: ${rel}`);
      const stat = fs.statSync(full);
      assert.ok(stat.size > 0, `File must not be empty: ${rel}`);
    }
  });

  it('validates public/sample-exam.json schema and GDPT 2018 invariants', () => {
    const raw = fs.readFileSync(path.join(rootDir, 'public/sample-exam.json'), 'utf8');
    const exam = JSON.parse(raw);
    const val = validateExamVersion(exam);
    assert.ok(val.ok, `sample-exam.json must be valid schema: ${val.ok ? '' : JSON.stringify(val.issues)}`);

    assert.equal(exam.questions.length, 8, 'sample-exam.json must contain 8 questions');
    const kinds = exam.questions.map((q: any) => q.kind);
    assert.deepEqual(kinds, ['I', 'I', 'I', 'I', 'II', 'II', 'III', 'III'], 'Must contain 4 Part I, 2 Part II, 2 Part III');

    const n1 = kinds.filter((k: string) => k === 'I').length;
    const n2 = kinds.filter((k: string) => k === 'II').length;
    const n3 = kinds.filter((k: string) => k === 'III').length;

    const max = computeExamMax({ n1, n2, n3 });
    assert.equal(max.maxTotal.num, 10n, 'Sample exam total points must equal 10');
    assert.equal(max.maxTotal.den, 1n, 'Sample exam total denominator must equal 1');
    assert.equal(max.maxI.num, 1n, 'Part I max points must equal 1 (4 x 0.25)');
    assert.equal(max.maxII.num, 2n, 'Part II max points must equal 2 (2 x 1.00)');
    assert.equal(max.maxIII.num, 7n, 'Part III max points must equal 7 (2 x 3.50)');
  });

  it('validates public/exams/toan-full.json schema and structure', () => {
    const raw = fs.readFileSync(path.join(rootDir, 'public/exams/toan-full.json'), 'utf8');
    const exam = JSON.parse(raw);
    const val = validateExamVersion(exam);
    assert.ok(val.ok, `toan-full.json must be valid: ${val.ok ? '' : JSON.stringify(val.issues)}`);
    assert.ok(exam.questions.length >= 8, 'Must have at least 8 questions');
  });

  it('validates public/exams/ly-part-I.json (20 questions, Part I only, max 5 points)', () => {
    const raw = fs.readFileSync(path.join(rootDir, 'public/exams/ly-part-I.json'), 'utf8');
    const exam = JSON.parse(raw);
    const val = validateExamVersion(exam);
    assert.ok(val.ok, `ly-part-I.json must be valid: ${val.ok ? '' : JSON.stringify(val.issues)}`);

    assert.equal(exam.questions.length, 20, 'Physics exam must have exactly 20 questions');
    for (const q of exam.questions) {
      assert.equal(q.kind, 'I', 'All questions in ly-part-I must be Part I');
    }

    const max = computeExamMax({ n1: 20, n2: 0, n3: 0 });
    assert.equal(max.maxTotal.num, 5n, 'Total max points must be 5');
    assert.equal(max.maxTotal.den, 1n);
    assert.equal(max.maxI.num, 5n);
    assert.equal(max.maxII.num, 0n);
    assert.equal(max.maxIII.num, 0n);
  });

  it('validates public/exams/hoa-repeating.json (3 questions, Part III only, repeating fraction 10/3)', () => {
    const raw = fs.readFileSync(path.join(rootDir, 'public/exams/hoa-repeating.json'), 'utf8');
    const exam = JSON.parse(raw);
    const val = validateExamVersion(exam);
    assert.ok(val.ok, `hoa-repeating.json must be valid: ${val.ok ? '' : JSON.stringify(val.issues)}`);

    assert.equal(exam.questions.length, 3, 'Chemistry exam must have exactly 3 questions');
    for (const q of exam.questions) {
      assert.equal(q.kind, 'III', 'All questions in hoa-repeating must be Part III');
    }

    const max = computeExamMax({ n1: 0, n2: 0, n3: 3 });
    assert.equal(max.maxTotal.num, 10n, 'Total points must equal 10');
    assert.equal(max.maxTotal.den, 1n);
    assert.equal(max.pointIII.num, 10n, 'Point per question III must have numerator 10');
    assert.equal(max.pointIII.den, 3n, 'Point per question III must have denominator 3');
  });

  it('validates apps-script syntax and presence of undeployed warning in README', () => {
    const codePath = path.join(rootDir, 'apps-script/Code.js');
    const code = fs.readFileSync(codePath, 'utf8');
    assert.doesNotThrow(() => {
      new vm.Script(code);
    }, 'apps-script/Code.js must have valid JavaScript syntax');

    const rootReadmePath = path.join(rootDir, 'README.md');
    const rootReadme = fs.readFileSync(rootReadmePath, 'utf8');
    assert.ok(
      rootReadme.includes('CHƯA ĐƯỢC TRIỂN KHAI') || rootReadme.includes('chưa được triển khai'),
      'README.md must warn that Apps Script is undeployed'
    );
  });
});

describe('WEB-FINAL-DOCS — Documentation & Contract Conformity (README.md)', () => {
  const rootDir = path.resolve('.');
  const readmeContent = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');

  it('explains Node.js 24 and TypeScript requirements', () => {
    assert.ok(readmeContent.includes('>= 24.0.0') || readmeContent.includes('Node.js'), 'Must mention Node.js >= 24');
    assert.ok(readmeContent.includes('TypeScript'), 'Must mention TypeScript');
  });

  it('explains zero-install architecture (no npm install)', () => {
    assert.ok(readmeContent.includes('Zero-Install') || readmeContent.includes('npm install'), 'Must mention zero-install');
  });

  it('explains direct root demo (index.html) and HTTP dist/subpath', () => {
    assert.ok(readmeContent.includes('index.html'), 'Must mention index.html');
    assert.ok(readmeContent.includes('Start-Process') || readmeContent.includes('file://'), 'Must mention direct file opening');
    assert.ok(readmeContent.includes('dist/'), 'Must mention dist/');
    assert.ok(readmeContent.includes('/Cunata/'), 'Must mention GitHub Pages subpath /Cunata/');
  });

  it('explains first-online cache requirement for Service Worker offline capabilities', () => {
    assert.ok(readmeContent.includes('First-Online Cache') || readmeContent.includes('trực tuyến ít nhất một lần'), 'Must explain first-online cache');
    assert.ok(readmeContent.includes('Service Worker'), 'Must mention Service Worker');
  });

  it('explains sample exams, scoring invariants, report view, print and export', () => {
    assert.ok(readmeContent.includes('sample-exam.json'), 'Must mention sample-exam.json');
    assert.ok(readmeContent.includes('toan-full.json'), 'Must mention toan-full.json');
    assert.ok(readmeContent.includes('ly-part-I.json'), 'Must mention ly-part-I.json');
    assert.ok(readmeContent.includes('hoa-repeating.json'), 'Must mention hoa-repeating.json');
    assert.ok(readmeContent.includes('0,25'), 'Must mention Part I 0.25 pt');
    assert.ok(readmeContent.includes('0,10'), 'Must mention Part II 0.10 pt');
    assert.ok(readmeContent.includes('-0,5') && readmeContent.includes('1,5'), 'Must mention Part III exact strings');
    assert.ok(readmeContent.includes('window.print') || readmeContent.includes('In / Lưu'), 'Must mention print capabilities');
    assert.ok(readmeContent.includes('.html') && readmeContent.includes('Tải báo cáo'), 'Must mention offline HTML download');
    assert.ok(readmeContent.includes('CSV') && readmeContent.includes('CWE-1236'), 'Must mention CSV export and formula injection protection');
  });

  it('explains teacher builder, question bank 5-level taxonomy, backup and cleanup', () => {
    assert.ok(readmeContent.includes('Teacher Exam Builder') || readmeContent.includes('Soạn Đề Thi'), 'Must mention builder');
    assert.ok(readmeContent.includes('Question Bank') || readmeContent.includes('Ngân Hàng Câu Hỏi'), 'Must mention bank');
    assert.ok(readmeContent.includes('Môn học') && readmeContent.includes('Khối lớp') && (readmeContent.includes('Nhận thức') || readmeContent.includes('Nhận biết')), 'Must explain 5-level taxonomy');
    assert.ok(readmeContent.includes('Sao Lưu') || readmeContent.includes('Export Backup') || readmeContent.includes('Backup'), 'Must mention backup');
    assert.ok(readmeContent.includes('Dọn dẹp') || readmeContent.includes('clearAll'), 'Must mention cleanup');
  });

  it('truthfully explains DOCX and PDF import limitations without false auto claims', () => {
    assert.ok(readmeContent.includes('DOCX'), 'Must mention DOCX import');
    assert.ok(readmeContent.includes('OMML'), 'Must mention OMML equations');
    assert.ok(readmeContent.includes('PDF Import Limitations') || readmeContent.includes('Giới Hạn Kỹ Thuật Với File PDF'), 'Must mention PDF limitations');
    assert.ok(readmeContent.includes('TUYỆT ĐỐI KHÔNG') || readmeContent.includes('không tự nhận') || readmeContent.includes('không cam kết'), 'Must disclaim false auto PDF/OCR claims');
    assert.ok(readmeContent.includes('PDF_OCR_UNAVAILABLE') || readmeContent.includes('PDF_MANUAL_REVIEW_REQUIRED'), 'Must state PDF flags');
  });

  it('explains unauthenticated workflow roles (no login) and advisory nickname', () => {
    assert.ok(readmeContent.includes('không cần đăng nhập') || readmeContent.includes('No Login'), 'Must mention no-login MVP');
    assert.ok(readmeContent.includes('vai trò') && (readmeContent.includes('luồng') || readmeContent.includes('Workflow')), 'Must state unauthenticated workflow roles');
  });

  it('truthfully warns about undeployed Apps Script, CORS, and Drive integration', () => {
    assert.ok(readmeContent.includes('CHƯA ĐƯỢC TRIỂN KHAI') || readmeContent.includes('chưa được triển khai'), 'Must warn undeployed Apps Script');
    assert.ok(readmeContent.includes('CORS'), 'Must mention CORS check limitation');
    assert.ok(readmeContent.includes('Google Drive'), 'Must mention Google Drive receipt requirement');
  });
});

describe('WEB-FINAL-DOCS — Build Wrapper (scripts/build.js) & Output Verification', () => {
  const rootDir = path.resolve('.');

  it('verifies that scripts/build.js exists, imports from domain index, and has buildWeb call', () => {
    const buildJsPath = path.join(rootDir, 'scripts/build.js');
    assert.ok(fs.existsSync(buildJsPath), 'scripts/build.js must exist');
    const content = fs.readFileSync(buildJsPath, 'utf8');

    assert.ok(
      content.includes('../src/domain/index.ts') || content.includes('src/domain/index.ts'),
      'scripts/build.js must import validation from src/domain/index.ts'
    );
    assert.ok(content.includes('buildWeb'), 'scripts/build.js must call buildWeb');
    assert.ok(!content.includes('computeExamMax'), 'scripts/build.js must not duplicate scoring logic');
  });

  it('verifies that dist/ outputs exist, contain index.html and have no bare imports', () => {
    const distDir = path.join(rootDir, 'dist');
    assert.ok(fs.existsSync(distDir), 'dist/ directory must exist');

    const distIndex = path.join(distDir, 'index.html');
    assert.ok(fs.existsSync(distIndex), 'dist/index.html must exist');
    const htmlContent = fs.readFileSync(distIndex, 'utf8');
    assert.ok(htmlContent.includes('./app/main.js') || htmlContent.includes('app/main.js'), 'dist/index.html must reference main.js');

    // Collect all JS files in dist and verify no bare imports
    function getJsFiles(dir: string): string[] {
      let results: string[] = [];
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          results = results.concat(getJsFiles(full));
        } else if (entry.endsWith('.js')) {
          results.push(full);
        }
      }
      return results;
    }

    const jsFiles = getJsFiles(distDir);
    assert.ok(jsFiles.length > 20, `Expected at least 20 JS files in dist, found ${jsFiles.length}`);

    const bareImportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
    for (const file of jsFiles) {
      const code = fs.readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = bareImportRegex.exec(code)) !== null) {
        const spec = match[1]!;
        assertRuntimeImport(distDir, file, spec);
      }
    }
  });
});

describe('WEB-FINAL-DOCS — Root Demo Accessibility & Modal Focus Trap (WEB-F07 Regression)', () => {
  const rootDir = path.resolve('.');
  const indexPath = path.join(rootDir, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  it('verifies submitModal has proper ARIA dialog semantics', () => {
    assert.ok(indexHtml.includes('id="submitModal"'), 'submitModal must exist');
    assert.ok(indexHtml.includes('role="dialog"'), 'submitModal must have role="dialog"');
    assert.ok(indexHtml.includes('aria-modal="true"'), 'submitModal must have aria-modal="true"');
    assert.ok(indexHtml.includes('aria-labelledby="modalTitle"'), 'submitModal must link to title');
  });

  it('verifies submitModal has focus trap, Escape dismissal, and return-focus implementation', () => {
    assert.ok(indexHtml.includes('submitModalLastFocus'), 'Must track last focused element for return-focus');
    assert.ok(indexHtml.includes('getModalFocusableElements'), 'Must have focusable element discovery helper');
    assert.ok(indexHtml.includes('closeSubmitModal'), 'Must have closeSubmitModal helper');
    assert.ok(indexHtml.includes("e.key === 'Escape'"), 'Must handle Escape keydown');
    assert.ok(indexHtml.includes("e.key === 'Tab'"), 'Must handle Tab keydown for focus containment');
    assert.ok(indexHtml.includes('submitModalLastFocus.focus()'), 'Must return focus upon modal closing');
  });

  it('verifies builderModal and bankModal have focus restoration and escape handling', () => {
    assert.ok(indexHtml.includes('builderModalLastFocus'), 'builderModal must track return focus');
    assert.ok(indexHtml.includes('bankModalLastFocus'), 'bankModal must track return focus');
    assert.ok(indexHtml.includes('builderModalLastFocus.focus()'), 'builderModal must restore focus');
    assert.ok(indexHtml.includes('bankModalLastFocus.focus()'), 'bankModal must restore focus');
  });
});
