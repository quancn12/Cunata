// CX-PROMOTE: run from repository root.
const { pathToFileURL } = await import('node:url');
await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/runtime.mjs').href);
const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const test=(name,...args)=>{const fn=args.pop();const opts=args.pop()??{};return nodeTest(name,{...opts,timeout:Math.max(120000,opts.timeout??0)},async(...a)=>{try{return await fn(...a);}catch(e){e.message=name+'\n'+e.message;throw e;}});};
// Hồi quy trên dist thật; chỉ fixture HTTP/Apps Script giả lập, không sửa production.
import { before, after, test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
const { session, active, keyClick, keyType, tabTo, studentStart, teacherLogin, axFor }=await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/a11y/support.mjs').href);
const { sleep } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const { waitReport } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);

let s;
before(async () => { s = await session(); });
after(async () => { await s?.close(); });
const check = (name, fn) => test(name, { timeout: 120000, concurrency: false }, async () => {
  const p = await s.page();
  try { await fn(p); } finally { await p._ctx.close(); }
});
async function exam(p) {
  await studentStart(s,p); await keyClick(p,'.class-section .exam-card'); await keyClick(p,'#btnStartExam');
  await p.waitFor(() => document.querySelectorAll('#examPane .question-card').length === 3, 'đề 3 câu');
}
async function teacher(p) { await keyClick(p,'#btnRoleTeacher'); await teacherLogin(s,p); }
const visible = (p,sel) => p.eval(s => !!document.querySelector(s)?.getClientRects().length,sel);
const associatedLabel = (p,sel) => p.eval(s => { const e=document.querySelector(s); return [...(e?.labels??[])].some(l=>l.textContent.trim() && l.getClientRects().length>0); },sel);

check("dist: [student] CX-a11y-F01: xem trước đề chuyển focus vào dialog có tên (DESIGN §4) (WEB-contract §9, §19.1)", async p => {
  await studentStart(s,p);await keyClick(p,'.class-section .exam-card');
  assert.equal(await p.eval(()=>!!document.activeElement.closest('#examPreview')),true,'focus phải vào hộp xem trước, hiện đang ở thẻ phía sau');
  assert.ok((await axFor(p,'#examPreview')).node?.name?.value,'dialog phải có accessible name');
});
check("dist: [student] CX-a11y-F01: Esc đóng xem trước và trả focus (DESIGN §4) (WEB-contract §9, §19.1)",async p=>{
  await studentStart(s,p);await keyClick(p,'.class-section .exam-card');await p.press('Escape');
  assert.equal(await visible(p,'#examPreview'),false,'Esc phải đóng xem trước');
  assert.equal(await p.eval(()=>document.activeElement.matches('.class-section .exam-card')),true);
});
check("dist: [teacher] CX-a11y-F02: mở chi tiết lớp được bằng bàn phím (WEB §9, §19.1) (WEB-contract §9, §19.1)",async p=>{
  await teacher(p);await p.waitFor(()=>!!document.querySelector('.class-card'),'thẻ lớp');
  await tabTo(p,'.class-card, .class-card a[href]:not(.class-btn-action), .class-card button:not(.class-btn-action)',24);
  await p.press('Enter');await p.waitFor(()=>!!document.querySelector('#btnAssignExam'),'chi tiết lớp có Giao đề',3000);
});
check("dist: [teacher] CX-a11y-F03: hộp tạo lớp giữ focus trong modal (DESIGN §4) (WEB-contract §9, §19.1)",async p=>{
  await teacher(p);await keyClick(p,'#btnCreateClass');
  const violations=[];
  for(let i=0;i<7;i++){await p.press('Tab');if(await p.eval(()=>document.activeElement!==document.body&&!document.activeElement.closest('.teacher-dialog-backdrop')))violations.push(await active(p));}
  assert.deepEqual(violations,[],'Tab không được tới nội dung phía sau hộp Tạo lớp');
});
check("dist: [teacher] CX-a11y-F03: Esc đóng hộp tạo lớp và trả focus (DESIGN §4) (WEB-contract §9, §19.1)",async p=>{
  await teacher(p);await keyClick(p,'#btnCreateClass');await p.press('Escape');
  assert.equal(await visible(p,'.teacher-dialog-backdrop'),false,'Esc phải đóng Tạo lớp');
  assert.equal((await active(p)).id,'btnCreateClass');
});
check("dist: [teacher] CX-a11y-F03: giao đề chuyển focus vào và Esc trả focus (DESIGN §4) (WEB-contract §9, §19.1)",async p=>{
  await teacher(p);await p.waitFor(()=>!!document.querySelector('.class-card'),'thẻ lớp');
  await p.click('.class-card');await p.waitFor(()=>!!document.querySelector('#btnAssignExam'),'chi tiết');await keyClick(p,'#btnAssignExam');
  await p.waitFor(()=>!!document.querySelector('#assignDialog'),'hộp giao đề');
  assert.equal(await p.eval(()=>!!document.activeElement.closest('#assignDialog')),true,'focus phải vào Giao đề');
  await p.press('Escape');assert.equal(await visible(p,'#assignDialog'),false);assert.equal((await active(p)).id,'btnAssignExam');
});
check("dist: [student] CX-a11y-F04: mã lớp có nhãn hiện và liên kết (DESIGN §4 Input) (WEB-contract §9, §19.1)",async p=>{
  await studentStart(s,p);assert.equal(await associatedLabel(p,'#classCodeInput'),true,'placeholder không thay nhãn Mã lớp');
});
check("dist: [student] CX-a11y-F04: trả lời ngắn có nhãn gắn câu hỏi (WEB §9, DESIGN §4) (WEB-contract §9, §19.1)",async p=>{
  await exam(p);assert.equal(await associatedLabel(p,'.short-answer-input'),true,'ô đáp án ngắn cần nhãn hiện và được liên kết');
});
check("dist: [teacher] CX-a11y-F04: tên lớp có nhãn liên kết (DESIGN §4 Input) (WEB-contract §9, §19.1)",async p=>{
  await teacher(p);await keyClick(p,'#btnCreateClass');assert.equal(await associatedLabel(p,'.teacher-dialog-backdrop input'),true);
});
check("dist: [teacher] CX-a11y-F04: chọn đề được đọc tên control (DESIGN §4 Select) (WEB-contract §9, §19.1)",async p=>{
  await teacher(p);await p.waitFor(()=>!!document.querySelector('.class-card'),'thẻ lớp');await p.click('.class-card');await p.waitFor(()=>!!document.querySelector('#btnAssignExam'),'chi tiết');await keyClick(p,'#btnAssignExam');await p.waitFor(()=>!!document.querySelector('#assignExamSelect'),'ô đề');
  assert.ok((await axFor(p,'#assignExamSelect')).node?.name?.value,'combobox chọn đề phải có tên, hiện tên rỗng');
});
check("dist: [student] CX-a11y-F05: radio thuộc nhóm câu có tên trong AX (WEB §9) (WEB-contract §9, §19.1)",async p=>{
  await exam(p);const {node,nodes}=await axFor(p,'[role=radio]');const byId=new Map(nodes.map(n=>[n.nodeId,n]));let a=node;let found=false;
  while(a?.parentId){a=byId.get(a.parentId);if(['radiogroup','group'].includes(a?.role?.value)&&a?.name?.value){found=true;break;}}
  assert.equal(found,true,'radio phải thuộc nhóm có tên câu hỏi trong cây accessibility');
});
check("dist: [student] CX-a11y-F05: Đúng/Sai thuộc nhóm ý có tên trong AX (WEB §9) (WEB-contract §9, §19.1)",async p=>{
  await exam(p);const {node,nodes}=await axFor(p,'.tf-btn');const byId=new Map(nodes.map(n=>[n.nodeId,n]));let a=node;let found=false;
  while(a?.parentId){a=byId.get(a.parentId);if(['group','radiogroup'].includes(a?.role?.value)&&a?.name?.value){found=true;break;}}
  assert.equal(found,true,'từng cặp Đúng/Sai cần ngữ cảnh ý/câu được liên kết');
});
check("dist: [student] CX-a11y-F06: trạng thái đã làm xuất hiện trong AX bảng câu (DESIGN §2 Tương tác) (WEB-contract §9, §19.1)",async p=>{
  await exam(p);const before=(await axFor(p,'.palette-btn')).node;await keyClick(p,'[role=radio]');await p.waitFor(()=>document.querySelector('.palette-btn')?.classList.contains('answered'),'answer saved in palette',20000);const after=(await axFor(p,'.palette-btn')).node;
  const semantic=n=>JSON.stringify({name:n?.name?.value,description:n?.description?.value,properties:n?.properties?.filter(v=>['pressed','selected','checked','description','describedby'].includes(v.name))});
  assert.notEqual(semantic(after),semantic(before),'đổi màu .answered phải kèm thông tin trạng thái truy cập được');
});
check("dist: [app] CX-a11y-F07: trạng thái lưu được đưa vào live region (WEB §9) (WEB-contract §9, §19.1)",async p=>{
  await exam(p);const before=await p.eval(()=>[...document.querySelectorAll('[aria-live],[role=status]')].map(e=>e.textContent).join('|'));
  await keyType(p,'.short-answer-input','0,5');await p.waitFor(()=>/Đã lưu/.test(document.querySelector('#syncText').textContent),'lưu xong');
  const announced=await p.eval(()=>{const e=document.querySelector('#syncText');return !!e.closest('[aria-live="polite"],[aria-live="assertive"],[role="status"]')||[...document.querySelectorAll('[aria-live],[role=status]')].some(n=>/Đã lưu|lưu cục bộ/i.test(n.textContent));});
  assert.equal(announced,true,'Đã lưu đang chỉ đổi span; live region vẫn trống: '+before);
});
check("dist: [student] CX-a11y-F08: lỗi mã lớp gắn invalid và mô tả (DESIGN §4 Input) (WEB-contract §9, §19.1)",async p=>{
  await studentStart(s,p);await keyClick(p,'#btnJoinClass');await p.waitFor(()=>!!document.querySelector('#classCodeError').textContent,'lỗi mã rỗng');
  assert.equal(await p.eval(()=>document.querySelector('#classCodeInput').getAttribute('aria-invalid')),'true');
  assert.equal(await p.eval(()=>document.querySelector('#classCodeInput').getAttribute('aria-describedby')?.split(/\s+/).includes('classCodeError')),true);
});
check("dist: [student] CX-a11y-F09: bảng câu di động là sheet có focus/Esc (WEB §19.1, DESIGN §4) (WEB-contract §9, §19.1)",async p=>{
  await exam(p);await p.setViewport(375,812,false);await keyClick(p,'#btnPalette');
  assert.equal(await p.eval(()=>!!document.activeElement.closest('.palette-card')),true,'mở tấm trượt phải vào bên trong');
  await p.press('Escape');assert.equal(await p.eval(()=>document.querySelector('.palette-card').classList.contains('is-open')),false);
  assert.equal((await active(p)).id,'btnPalette');
});



// All contexts and local servers are already closed; release residual CDP TCP handles.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='Socket'&&h.remoteAddress==='127.0.0.1'&&![process.stdin,process.stdout,process.stderr].includes(h))h.destroy();});

// Chrome has already received Browser.close and kill from the harness.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='ChildProcess'&&/(?:chrome|msedge)(?:\.exe)?$/i.test(h.spawnfile??''))h.unref();});
