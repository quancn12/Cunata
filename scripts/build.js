#!/usr/bin/env node
/**
 * Cunata Web Demo Build & Verification Wrapper
 * Conforms to WEB-contract.md §2, §3, §10 and tasks.json (WEB-W3-GLUE).
 *
 * Responsibilities:
 * - Validates legacy assets, styles, Apps Script syntax, and sample-exam schema.
 * - Prepares module build in dist/ via scripts/web-build.ts with staged output.
 * - Preserves root index.html as the functional legacy entrypoint throughout W3
 *   while D03 remains unapproved (NEED_DECISION).
 * - Exits 0 when all asset validations and module builds pass; exits 1 on failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { validateExamVersion } from '../src/domain/validate.ts';
import { buildWeb } from './web-build.ts';

console.log('--- Cunata Web Demo Build & Verification (Wave 3) ---');

const rootDir = path.resolve('.');
const filesToCheck = [
  'index.html',
  'styles/style.css',
  'public/sample-exam.json',
  'public/q01-bbt.svg',
  'apps-script/Code.js',
  'apps-script/appsscript.json',
  'apps-script/README.md',
];

// 1. Verify existence of required assets
for (const rel of filesToCheck) {
  const full = path.join(rootDir, rel);
  if (!fs.existsSync(full)) {
    console.error(`[ERROR] Missing required file: ${rel}`);
    process.exit(1);
  }
  const stat = fs.statSync(full);
  console.log(`[OK] Asset verified: ${rel} (${stat.size} bytes)`);
}

// 2. Validate sample exam schema
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

// 3. Validate index.html has link to style.css and script logic (retains legacy demo intact)
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
if (!indexHtml.includes('styles/style.css')) {
  console.error('[ERROR] index.html missing stylesheet link to styles/style.css');
  process.exit(1);
}
console.log('[OK] index.html markup & styling linked properly (legacy demo retained)');

// 4. Validate apps-script/Code.js syntax
try {
  const appsScriptCode = fs.readFileSync(path.join(rootDir, 'apps-script/Code.js'), 'utf8');
  new vm.Script(appsScriptCode);
  console.log('[OK] apps-script/Code.js syntax valid');
} catch (err) {
  console.error('[ERROR] apps-script/Code.js syntax check failed:', err);
  process.exit(1);
}

// 5. Run modular ES2022 build via scripts/web-build.ts
console.log('--- Executing Modular Web Build (ES2022 Staged Emit) ---');
try {
  const buildResult = await buildWeb({
    rootDir,
    promote: true,
    silent: false,
  });

  if (!buildResult.success) {
    console.error('[ERROR] Modular web build failed:', buildResult.error);
    process.exit(1);
  }

  console.log(`[OK] Modular web build emitted and verified (${buildResult.emittedFiles.length} files in dist/)`);
} catch (err) {
  console.error('[ERROR] Unexpected error during web build:', err);
  process.exit(1);
}

console.log('--- Build & Asset Verification Complete: READY (W3) ---');
