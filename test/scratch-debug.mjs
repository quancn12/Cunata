import { launchBrowser, startServer } from './claude-check/harness.mjs';
import { startGasServer } from './claude-check/gas-server.mjs';
import { waitBoot, onRoleChooser } from './claude-check/app.mjs';

const T1 = { name: 'Cô Lan', username: 'colan', password: 'MatKhau-Lan-01' };

(async () => {
  const browser = await launchBrowser();
  const gas = await startGasServer();
  const a = gas.gas.post({ action: 'adminLogin', password: gas.adminPassword });
  gas.gas.post({ action: 'adminCreateTeacher', token: a.token, ...T1 });

  const server = await startServer('dist', { overrides: { 'public/config.json': JSON.stringify({ appsScriptUrl: gas.url }) } });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(server.url + '/?teacher');
  await waitBoot(page);
  if (await onRoleChooser(page)) await page.click('#btnRoleTeacher');
  await page.waitFor(() => !!document.querySelector('#teacherLogin'));
  await page.eval((t) => {
    document.querySelector('#teacherUsername').value = t.username;
    document.querySelector('#teacherPassword').value = t.password;
  }, T1);
  await page.click('#btnTeacherLogin');
  await page.waitFor(() => !!document.querySelector('#teacherNav a[data-nav="de"]'));
  await page.click('#teacherNav a[data-nav="de"]');
  await page.waitFor(() => !!document.querySelector('[data-exam-id="exam-thpt-hoa-repeating-demo"] .btn-teacher-edit'));
  console.log('Found edit button. Clicking...');
  await page.click('[data-exam-id="exam-thpt-hoa-repeating-demo"] .btn-teacher-edit');
  await new Promise(r => setTimeout(r, 1500));
  const modalInfo = await page.eval(() => {
    const m = document.getElementById('builderModal');
    return {
      modalExists: !!m,
      display: m ? getComputedStyle(m).display : null,
      titleVal: document.getElementById('builderExamTitle')?.value,
    };
  });
  console.log('Modal info:', modalInfo);
  await ctx.close();
  await server.close();
  await gas.close();
  await browser.close();
})();
