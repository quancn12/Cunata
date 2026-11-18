// CX-PROMOTE: run from repository root.
const { pathToFileURL } = await import('node:url');
await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/runtime.mjs').href);
const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const test=(name,...args)=>{const fn=args.pop();const opts=args.pop()??{};return nodeTest(name,{...opts,timeout:Math.max(120000,opts.timeout??0)},async(...a)=>{try{return await fn(...a);}catch(e){e.message=name+'\n'+e.message;throw e;}});};
// Kiểm định CX-student: Chrome thật qua harness, chỉ phục vụ dist/ dưới /Cunata/.
// Mọi dữ liệu lớp/đề/kết quả là giả lập; không đọc cấu hình production.
import { after, before, test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const { launchBrowser } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const { pickOption, qI, qII, qIII, setStatement, typeShort, shortValue, waitSaved, timerSeconds, SECRET } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const s=await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/student/support.mjs').href);

let browser;
before(async () => { browser = await launchBrowser(); });
after(async () => { await browser?.close(); });
const evidence = {};
after(() => writeFileSync(join(s.OUT, 'proposed-evidence.json'), JSON.stringify(evidence, null, 2)));
const run = (name, fn, opts) => test(name, { timeout: 120000 }, async () => {
  const f = await s.setup(browser, opts);
  try { await fn(f); } finally { await f.close(); }
});
const remember = async (id, p, extra = {}) => { evidence[id] = { ...await s.snapshot(p), ...extra }; };
const readTitle = p => p.eval(() => document.querySelector('#reportTitle')?.textContent || document.querySelector('#reportWrapper h2')?.textContent || document.querySelector('#reportWrapper h1')?.textContent);







run("dist: [student] CX-student-F01: Xem kết quả đề A sau đề B phải tải đúng điểm/tiêu đề A (§19.1, D08) (WEB-contract §19.1)", async f => {
  const p=f.page; await s.enterStudentArea(p);
  await s.startFromCard(p,s.card(s.A)); await pickOption(p,qI(1),'a'); await waitSaved(p); await s.submit(p);
  const expected = await s.readReport(p); await s.home(p);
  await s.startFromCard(p,s.card(s.B)); await s.submit(p); await s.home(p);
  await s.preview(p,s.card(s.A)); await p.click('#btnStartExam'); await A.waitReport(p,20000);
  await remember('CX-S01a',p,{expected:expected.raw,actualReport:await s.readReport(p),title:await readTitle(p)});
  await s.screenshot(p,'CX-S01a-wrong-result');
  assert.deepEqual((await s.readReport(p)).total,expected.total,'A được 0,25/10: bấm Xem kết quả A không được hiện B=0/10');
});

run("dist: [student] CX-student-F01: Xem kết quả từ lần mở mới phải khôi phục báo cáo đã lưu (§19.1, D03/D08) (WEB-contract §19.1)", async f => {
  const p=f.page; await s.enterStudentArea(p); await s.startFromCard(p,s.card(s.A));
  await pickOption(p,qI(1),'a'); await waitSaved(p); await s.submit(p);
  const expected=(await s.readReport(p)).total;
  const p2=await f.ctx.newPage(); await p2.goto(f.server.url); await s.waitBoot(p2);
  await s.preview(p2,s.card(s.A)); await p2.click('#btnStartExam'); await A.waitReport(p2,20000);
  await remember('CX-S01b',p2,{expected}); await s.screenshot(p2,'CX-S01b-empty-result');
  assert.deepEqual((await s.readReport(p2)).total,expected,'báo cáo đã lưu phải có điểm khi mở lại');
});




run("dist: [student] CX-student-F03: ?exam phải giữ đề đã chọn qua cổng tên khi bấm Bắt đầu sớm (§19.1) (WEB-contract §19.1)", async f => {
  const p=f.page; await s.sleep(250);
  assert.equal(await s.shown(p,'studentNameGate'),true);
  if (await s.shown(p,'examPreview') && !await p.eval(()=>document.getElementById('btnStartExam').disabled)) await p.click('#btnStartExam');
  await s.enterStudentArea(p); await s.sleep(250); await remember('CX-S03',p); await s.screenshot(p,'CX-S03-lost-selection');
  assert.equal(await s.shown(p,'examPreview'),true,'qua cổng tên: phải giữ/mở lại preview đề trong ?exam');
  assert.match(await p.eval(()=>document.querySelector('#examPreview .exam-preview-title').textContent),/cx-student-a/);
}, { query:'?exam='+s.A });

run("dist: [student] CX-student-F04: luyện tập đã nộp không biến bài giao chưa mở thành Đã nộp (§19.1/19.2) (WEB-contract §19.1)", async f => {
  const p=f.page; await s.enterStudentArea(p); await s.joinClass(f);
  await s.startFromCard(p,'#practiceExams '+s.card('cx-future')); await s.submit(p); await s.home(p);
  await s.preview(p,s.assigned(f.future.assignmentId)); await remember('CX-S04',p); await s.screenshot(p,'CX-S04-assignment-state');
  assert.equal(await p.eval(() => document.querySelector('#btnStartExam').disabled),true,'bài giao tương lai chưa được nộp: phải khóa');
  assert.match(await p.eval(id => document.querySelector(`.exam-card[data-assignment-id="${id}"] .exam-status`).textContent,f.future.assignmentId),/Chưa mở/);
});

run("dist: [student] CX-student-F05: mở lại lớp đã vào phải tải bài giáo viên mới giao (§19.1 Lớp của tôi) (WEB-contract §19.1)", async f => {
  const p=f.page; await s.enterStudentArea(p); await s.joinClass(f);
  const added=f.assign(s.B); await p.reload(); await s.waitBoot(p); await p.waitFor(id=>!!document.querySelector(`[data-assignment-id="${id}"]`),'new assignment after reload',20000,added.assignmentId);
  await remember('CX-S05',p,{added,requests:f.gas.log});
  assert.equal(await p.eval(id => !!document.querySelector(`.exam-card[data-assignment-id="${id}"]`),added.assignmentId),true,'bài giao mới phải hiện sau tải lại trang');
});

run("dist: [student] CX-student-F06: link mời #/hoc-sinh?lop=<MÃ> phải đưa vào lớp (§19.1 link mời) (WEB-contract §19.1)", async f => {
  const p=await f.ctx.newPage(); await p.goto(f.server.url+'#/hoc-sinh?lop='+f.cls.code); await s.waitBoot(p); await s.enterStudentArea(p); await s.sleep(500);
  await remember('CX-S06',p,{code:f.cls.code,requests:f.gas.log});
  assert.equal(await p.eval(code => !!document.querySelector(`.class-section[data-class-code="${code}"]`),f.cls.code),true,'link mời dùng query trong hash phải vào lớp');
});



run("dist: [student] CX-student-F08: danh sách lỗi phải báo lỗi và có Thử lại (§16 lỗi danh sách) (WEB-contract §19.1)", async f => {
  const p=f.page; await p.click('#btnRoleStudent'); await p.type('#startName','Học sinh lỗi mạng'); await p.click('#btnNameContinue'); await s.sleep(300);
  await remember('CX-S08',p,{screen:await p.eval(()=>document.getElementById('startScreen').innerText)}); await s.screenshot(p,'CX-S08-list-failure');
  const actual=await p.eval(()=>({text:document.getElementById('startScreen').innerText,retry:[...document.querySelectorAll('#startScreen button')].some(e=>/thử lại/i.test(e.textContent)&&e.getClientRects().length)}));
  assert.match(actual.text,/không.*tải|lỗi.*tải|chưa.*tải/i,'không được biến dữ liệu hỏng thành danh sách trống');
  assert.equal(actual.retry,true,'phải có nút Thử lại');
}, { noConfig:true,overrides:{'public/exams/index.json':'{broken-json'} });

run("dist: [student] CX-student-F09: ?exam khác không được đẩy bài đang làm dở ra màn chọn (§19.1, D03) (WEB-contract §19.1)", async f => {
  const p=f.page; await s.enterStudentArea(p); await s.startFromCard(p,s.card(s.A));
  await typeShort(p,qIII(1),'1,5'); await waitSaved(p);
  const p2=await f.ctx.newPage(); await p2.goto(f.server.url+'?exam='+s.B); await s.waitBoot(p2); await s.sleep(300);
  await remember('CX-S09',p2);
  assert.equal(await s.shown(p2,'examWrapper'),true,'có bài A dở: phải vào đúng bài A theo D03');
  assert.equal(await shortValue(p2,qIII(1)),'1,5');
});

run("dist: [student] CX-student-F10: Đổi tên trên TopBar sau quay về phải mở cổng đổi tên (§19.1) (WEB-contract §19.1)", async f => {
  const p=f.page; await s.enterStudentArea(p); await s.startFromCard(p,s.card(s.A)); await s.home(p);
  // Đóng preview nếu một luồng nạp nền đã mở nó khi quay về.
  if (await s.shown(p,'examPreview')) await p.click('#examPreview button[aria-label="Đóng"]');
  await p.click('#appTopBar #btnChangeName');
  await remember('CX-S10',p,{buttons:await p.eval(()=>[...document.querySelectorAll('#btnChangeName')].map(e=>({inTopBar:!!e.closest('#appTopBar'),visible:!!e.getClientRects().length})))});
  assert.equal(await s.shown(p,'studentNameGate'),true,'nút Đổi tên trên TopBar phải đưa tới cổng tên có thể sửa');
});

// All contexts and local servers are already closed; release residual CDP TCP handles.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='Socket'&&h.remoteAddress==='127.0.0.1'&&![process.stdin,process.stdout,process.stderr].includes(h))h.destroy();});

// Chrome has already received Browser.close and kill from the harness.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='ChildProcess'&&/(?:chrome|msedge)(?:\.exe)?$/i.test(h.spawnfile??''))h.unref();});
