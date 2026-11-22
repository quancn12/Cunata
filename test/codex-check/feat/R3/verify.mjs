// Run from the project root. Captures UTF-8 bytes without shell transcoding.
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = process.cwd() + '/ops/roadmap/tests/R3/';
const paths = ['src/api/handle.ts', 'src/api/types.ts', 'src/api/store/memory.ts',
  'src/teacher/portal.ts', 'src/student/area.ts', 'src/app/main.ts', 'src/collect/appsScript.ts',
  'dist/index.html', 'dist/app/main.js', 'dist/teacher/portal.js', 'dist/student/area.js', 'dist/collect/appsScript.js',
  'docs/contracts/WEB-contract.md', 'docs/LO-TRINH-V2.md', 'docs/design/DESIGN.md', 'docs/decisions/BANG-QUYET-DINH.md',
  'ops/roadmap/tests/R3/support.mjs', 'ops/roadmap/tests/R3/api.test.mjs', 'ops/roadmap/tests/R3/browser.test.mjs', 'ops/roadmap/tests/R3/index.js'];
const hashes = () => Object.fromEntries(paths.map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
const evidence = { node: process.version, cwd: process.cwd(), before: hashes(), runs: [] };
for (let i = 1; i <= 2; i++) {
  const started = new Date().toISOString();
  const child = spawn(process.execPath, ['--test', 'ops/roadmap/tests/R3/'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [];
  child.stdout.on('data', b => chunks.push(b)); child.stderr.on('data', b => chunks.push(b));
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  const output = Buffer.concat(chunks); writeFileSync(dir + `run-${i}.log`, output);
  const summary = output.toString('utf8').split(/\r?\n/).filter(s => /^(# (tests|pass|fail|cancelled|skipped)|ℹ (tests|pass|fail|cancelled|skipped))/.test(s));
  evidence.runs.push({ command: 'node --test ops/roadmap/tests/R3/', started, ended: new Date().toISOString(), exit, summary });
  writeFileSync(dir + 'evidence.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence.runs.at(-1)));
}
evidence.after = hashes(); evidence.stable = JSON.stringify(evidence.before) === JSON.stringify(evidence.after);
writeFileSync(dir + 'evidence.json', JSON.stringify(evidence, null, 2));
console.log('snapshotStable=' + evidence.stable);
