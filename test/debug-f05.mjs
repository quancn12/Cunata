import { setup, joinClass, sleep, B } from '../ops/blitz/promoted/_support/student/support.mjs';
import * as H from './claude-check/harness.mjs';
import * as A from './claude-check/app.mjs';
import assert from 'node:assert/strict';

async function debugF05() {
  const browser = await H.launchBrowser();
  const f = await setup(browser);
  try {
    const p = f.page;
    await A.enterStudentArea(p);
    await joinClass(f);
    console.log('Joined class:', f.cls.code);
    const added = f.assign(B);
    console.log('Assigned added:', added);
    await p.reload();
    await A.waitBoot(p);
    console.log('Waiting for assignmentId:', added.assignmentId);
    await p.waitFor(id => !!document.querySelector(`[data-assignment-id="${id}"]`), 'new assignment', 20000, added.assignmentId);
    console.log('Found it!');
  } finally {
    await f.close();
    await browser.close();
  }
}
debugF05().catch(console.error);
