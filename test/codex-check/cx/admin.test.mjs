// CX-PROMOTE: run from repository root.
const { pathToFileURL } = await import('node:url');
await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/runtime.mjs').href);
const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const test=(name,...args)=>{const fn=args.pop();const opts=args.pop()??{};return nodeTest(name,{...opts,timeout:Math.max(120000,opts.timeout??0)},async(...a)=>{try{return await fn(...a);}catch(e){e.message=name+'\n'+e.message;throw e;}});};
const promotedNames={"F01": "dist: [admin] CX-admin-F01: hết hạn: Làm mới phải báo cần đăng nhập lại, không âm thầm giữ số liệu cũ (WEB-contract §9, §19.1–19.2)", "F01-reload": "dist: [admin] CX-admin-F01: hết hạn rồi reload phải trở lại cổng đăng nhập (WEB-contract §9, §19.1–19.2)", "F02": "dist: [admin] CX-admin-F02: Admin giữ nguyên mật khẩu có dấu cách biên hợp lệ (WEB-contract §19.2)", "F03": "dist: [admin] CX-admin-F03: tạo giáo viên phải giữ nguyên mật khẩu 8 ký tự gồm dấu cách biên (WEB-contract §19.2)", "F03-reset": "dist: [admin] CX-admin-F03: đặt lại phải lưu đúng toàn bộ mật khẩu nhập vào (WEB-contract §19.2)", "F04": "dist: [admin] CX-admin-F04: mạng lỗi khi Làm mới phải có thông báo tại chỗ và cách thử lại (WEB-contract §9, §19.1–19.2)", "F04-initial": "dist: [admin] CX-admin-F04: lỗi tải đầu tiên không được hiển thị như danh sách rỗng (WEB-contract §9, §19.1–19.2)", "F05": "dist: [admin] CX-admin-F05: lỗi input phải có aria-invalid và liên kết aria-describedby (WEB-contract §9, §19.1–19.2)"};
import assert from 'node:assert/strict';
import { before, after, test as nodeTest } from 'node:test';
const { launchBrowser } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const { enterStudentArea, waitBoot } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const { snapshot, save, fixture, openAdmin, login, loggedIn, fillCreate, create, visible, text, posts, actionPosts, expire, seedStats, TEACHER }=await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/admin/support.mjs').href);

let browser, initial;
before(async () => {initial = snapshot(); save('snapshot-start.json',initial); browser = await launchBrowser();});
after(async () => {await browser?.close(); const end = snapshot(); save('snapshot-end.json',end); assert.deepEqual(end.hashes,initial.hashes,'dist/Code.js thay đổi trong khi kiểm định: kết quả cần chạy lại');});
function run(id, name, fn, opts = {}) {
  test(promotedNames[id], {timeout:45000}, async () => fixture(browser,fn,{...opts,id}));
}



















run('F01','hết hạn: Làm mới phải báo cần đăng nhập lại, không âm thầm giữ số liệu cũ',async f => {
  const p = await openAdmin(f); await loggedIn(p,f); await create(p); expire(f);
  const token = actionPosts(f,'adminStats')[0].token;
  assert.equal(f.gas.gas.post({action:'adminStats',token}).error,'UNAUTHORIZED');
  await p.click('#btnRefreshAdmin');
  await p.waitFor(() => !document.getElementById('btnRefreshAdmin').disabled,'làm mới xong');
  f.note = {loginVisible:await visible(p,'adminLogin'), panelVisible:await visible(p,'adminPanel'),body:await p.eval(() => document.body.innerText)};
  assert.ok(f.note.loginVisible || /phiên.*hết hạn|đăng nhập lại/i.test(f.note.body),'UNAUTHORIZED phải đưa về cổng đăng nhập hoặc hiển thị yêu cầu đăng nhập lại');
});
run('F01-reload','hết hạn rồi reload phải trở lại cổng đăng nhập',async f => {
  const p = await openAdmin(f); await loggedIn(p,f); expire(f); await p.reload();
  await p.waitFor(() => !!document.querySelector('#btnRefreshAdmin') && !document.getElementById('btnRefreshAdmin').disabled,'reload kiểm tra phiên xong');
  assert.equal(await visible(p,'adminLogin'),true,'token hết hạn không được làm UI kẹt trong adminPanel');
});
run('F02','Admin giữ nguyên mật khẩu có dấu cách biên hợp lệ',async f => {
  assert.equal(f.gas.gas.post({action:'adminLogin',password:f.gas.adminPassword}).success,true,'Code.js chấp nhận mật khẩu nguyên văn');
  const p = await openAdmin(f); await login(p,f.gas.adminPassword);
  const body = actionPosts(f,'adminLogin')[0];
  f.note = {sentMatchesInput:body.password === f.gas.adminPassword, sentLength:body.password.length, inputLength:f.gas.adminPassword.length,error:await text(p,'adminLoginError')};
  assert.equal(await visible(p,'adminPanel'),true,'mật khẩu chính xác trong ADMIN_PASSWORD phải đăng nhập được');
},{gasOpts:{adminPassword:' Admin-123456 '}});
run('F03','tạo giáo viên phải giữ nguyên mật khẩu 8 ký tự gồm dấu cách biên',async f => {
  const p = await openAdmin(f); await loggedIn(p,f); await fillCreate(p,{...TEACHER,password:' 123456 '});
  await p.click('#btnCreateTeacherConfirm');
  await p.waitFor(() => !document.getElementById('btnCreateTeacherConfirm').disabled,'xử lý tạo xong');
  f.note = {error:await text(p,'createTeacherError'),posts:actionPosts(f,'adminCreateTeacher').length};
  assert.equal(await p.eval(() => document.querySelectorAll('.teacher-row').length),1,'8 ký tự hợp lệ không được bị trim thành 6 rồi từ chối');
  assert.equal(f.gas.gas.post({action:'teacherLogin',username:TEACHER.username,password:' 123456 '}).success,true);
});
run('F03-reset','đặt lại phải lưu đúng toàn bộ mật khẩu nhập vào',async f => {
  const p = await openAdmin(f); await loggedIn(p,f); await create(p); await p.click('.btn-reset-password');
  const password = ' Moi-123456 ';
  await p.type('#resetPasswordInput',password); await p.click('#btnResetPasswordConfirm');
  await p.waitFor(() => !document.getElementById('resetPasswordDialog').open,'đặt lại thành công');
  f.note = {sentMatchesInput:actionPosts(f,'adminResetPassword')[0].password === password};
  assert.equal(f.gas.gas.post({action:'teacherLogin',username:TEACHER.username,password}).success,true,'mật khẩu admin vừa đặt phải dùng nguyên văn được');
});
run('F04','mạng lỗi khi Làm mới phải có thông báo tại chỗ và cách thử lại',async f => {
  const p = await openAdmin(f); await loggedIn(p,f); await create(p); f.gas.setFailPosts(2);
  await p.click('#btnRefreshAdmin'); await p.waitFor(() => !document.getElementById('btnRefreshAdmin').disabled,'làm mới lỗi xong');
  f.note = {body:await p.eval(() => document.body.innerText)};
  assert.match(f.note.body,/lỗi|không.*tải|chưa.*tải|kết nối|thử lại/i,'HTTP 500 của danh sách/thống kê không được im lặng');
});
run('F04-initial','lỗi tải đầu tiên không được hiển thị như danh sách rỗng',async f => {
  const p = await openAdmin(f);
  const originalPost = f.gas.gas.post;
  f.gas.gas.post = body => ['adminStats','adminListTeachers'].includes(body.action) ? {success:false,error:'INTERNAL_ERROR',message:'Không tải được dữ liệu kiểm định'} : originalPost(body);
  await login(p,f.gas.adminPassword);
  await p.waitFor(() => !document.getElementById('btnRefreshAdmin').disabled,'tải dữ liệu đầu tiên xong');
  f.note.body = await p.eval(() => document.body.innerText);
  assert.match(f.note.body,/lỗi|không.*tải|chưa.*tải|kết nối|thử lại/i,'không được gọi lỗi server là chưa có tài khoản giáo viên');
});
run('F05','lỗi input phải có aria-invalid và liên kết aria-describedby',async f => {
  const p = await openAdmin(f); await loggedIn(p,f); await fillCreate(p,{...TEACHER,username:'ab'}); await p.click('#btnCreateTeacherConfirm');
  assert.match(await text(p,'createTeacherError'),/3.32/);
  f.note = await p.eval(() => { const e = document.getElementById('newTeacherUsername');return {invalid:e.getAttribute('aria-invalid'),describedby:e.getAttribute('aria-describedby')};});
  assert.equal(f.note.invalid,'true','DESIGN §4 Input: đánh dấu trường sai cho trình đọc màn hình');
  assert.ok(await p.eval(() => {
    const e = document.getElementById('newTeacherUsername');
    return (e.getAttribute('aria-describedby') ?? '').split(/\s+/).some(id => /3.32/.test(document.getElementById(id)?.textContent ?? ''));
  }),'aria-describedby phải trỏ đến thông báo lỗi liên quan');
});

// All contexts and local servers are already closed; release residual CDP TCP handles.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='Socket'&&h.remoteAddress==='127.0.0.1'&&![process.stdin,process.stdout,process.stderr].includes(h))h.destroy();});

// Chrome has already received Browser.close and kill from the harness.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='ChildProcess'&&/(?:chrome|msedge)(?:\.exe)?$/i.test(h.spawnfile??''))h.unref();});
