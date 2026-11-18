import { launchBrowser } from '../claude-check/harness.mjs';
import * as s from '../../ops/blitz/promoted/_support/student/support.mjs';

const browser = await launchBrowser();
try {
  const f = await s.setup(browser);
  const p = f.page;
  


  console.log('1. Enter student area');
  await s.enterStudentArea(p);
  console.log('2. Join class', f.cls.code);
  await s.joinClass(f);
  
  console.log('Class cards before reload:', await p.eval(() => 
    [...document.querySelectorAll('.exam-card')].map(c => ({
      examId: c.dataset.examId,
      assignmentId: c.dataset.assignmentId
    }))
  ));

  console.log('3. Assign new exam s.B');
  const added = f.assign(s.B);
  console.log('Added assignment:', added);

  console.log('4. Reload page');
  await p.reload();
  await s.waitBoot(p);

  console.log('5. Check localStorage cunata:classes right after reload:');
  console.log(await p.eval(() => localStorage.getItem('cunata:classes')));

  console.log('6. Sleep 3 seconds...');
  await s.sleep(3000);

  console.log('7. Check localStorage cunata:classes after 3s:');
  console.log(await p.eval(() => localStorage.getItem('cunata:classes')));

  console.log('8. Check DOM cards:');
  console.log(await p.eval(() => 
    [...document.querySelectorAll('.exam-card')].map(c => ({
      examId: c.dataset.examId,
      assignmentId: c.dataset.assignmentId
    }))
  ));

  console.log('Errors:', p.errors);

  console.log('9. GAS log:');
  console.log(f.gas.log);

  await f.close();
} finally {
  await browser.close();
}
