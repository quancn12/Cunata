#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { validateExamVersion } from '../src/domain/validate.ts';

console.log('--- Cunata Web Demo Build & Verification ---');

const rootDir = path.resolve('.');
const filesToCheck = [
  'index.html',
  'styles/style.css',
  'public/sample-exam.json',
  'public/q01-bbt.svg',
  'apps-script/Code.js',
  'apps-script/appsscript.json',
  'apps-script/README.md'
];

for (const rel of filesToCheck) {
  const full = path.join(rootDir, rel);
  if (!fs.existsSync(full)) {
    console.error(`[ERROR] Missing required file: ${rel}`);
    process.exit(1);
  }
  const stat = fs.statSync(full);
  console.log(`[OK] Asset verified: ${rel} (${stat.size} bytes)`);
}

// Validate sample exam
const sampleExamPath = path.join(rootDir, 'public/sample-exam.json');
try {
  const exam = JSON.parse(fs.readFileSync(sampleExamPath, 'utf8'));
  const res = validateExamVersion(exam);
  if (!res.ok) {
    console.error('[ERROR] sample-exam.json failed validation:', res.issues);
    process.exit(1);
  }
  console.log(`[OK] sample-exam.json schema valid (${exam.questions.length} questions)`);
} catch (err) {
  console.error('[ERROR] Could not parse or validate sample-exam.json:', err);
  process.exit(1);
}

// Validate index.html has link to style.css and script logic
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
if (!indexHtml.includes('styles/style.css')) {
  console.error('[ERROR] index.html missing stylesheet link to styles/style.css');
  process.exit(1);
}
console.log('[OK] index.html markup & styling linked properly');

// Validate apps-script/Code.js syntax
try {
  const appsScriptCode = fs.readFileSync(path.join(rootDir, 'apps-script/Code.js'), 'utf8');
  new vm.Script(appsScriptCode);
  console.log('[OK] apps-script/Code.js syntax valid');
} catch (err) {
  console.error('[ERROR] apps-script/Code.js syntax check failed:', err);
  process.exit(1);
}

console.log('--- Build & Asset Verification Complete: READY ---');
