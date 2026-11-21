// CX-PROMOTE: run from repository root.
const { pathToFileURL } = await import('node:url');
await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/runtime.mjs').href);
const H = await import(pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
const A = await import(pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const test=(name,...args)=>{const fn=args.pop();const opts=args.pop()??{};return nodeTest(name,{...opts,timeout:Math.max(120000,opts.timeout??0)},async(...a)=>{try{return await fn(...a);}catch(e){e.message=name+'\n'+e.message;throw e;}});};
// Regression expectations from WEB §19 / DESIGN.md. These tests are intentionally red until the UI is fixed.
import { before,after,test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
const { setup,newPage,waitBoot,enterStudentArea,measure }=await import(pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/design/support.mjs').href);
const { startFromCard,submit,joinClass } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/app.mjs').href);
const { sleep } = await import((await import('node:url')).pathToFileURL(process.cwd() + '/test/claude-check/harness.mjs').href);
let env;
before(async()=>{env=await setup();});
after(async()=>{await env?.close();});
async function withExam(fn,{w=375,theme='light'}={}){
  const {ctx,page:p}=await newPage(env,w,theme);
  try{await p.goto(env.server.url);await waitBoot(p);await enterStudentArea(p);/* WEB-contract §21: đề chỉ đến qua lớp — vào lớp đã giao cx-design-exam */const card=await joinClass(p,env.cls.code);await startFromCard(p,card);await fn(p);}finally{await ctx.close();}
}
test("dist: [ui] CX-design-F01: chế độ tối: tiêu đề câu và lời giải phải tương phản ít nhất 4.5:1 (WEB-contract §9, §19.1)",async()=>{
  await withExam(async p=>{
    const a=await measure(p);
    const bad=a.texts.filter(t=>t.el==='span.question-title'&&t.contrast<4.5);
    assert.deepEqual(bad,[],'DESIGN §2: tiêu đề câu không đọc được ở chế độ tối');
  },{theme:'dark'});
});
test("dist: [ui] CX-design-F02: câu hỏi và đáp án dùng đúng thang cỡ chữ 12/14/16/20/24/32 (WEB-contract §9, §19.1)",async()=>{
  await withExam(async p=>{
    const a=await measure(p),allowed=new Set(['12px','14px','16px','20px','24px','32px']);
    assert.deepEqual(a.texts.filter(t=>!t.math&&!allowed.has(t.size)),[],'DESIGN §2 Chữ: cỡ chữ ngoài thang token');
  });
});
test("dist: [ui] CX-design-F03: nút nộp và các hành động báo cáo có vùng bấm ít nhất 44×44 (WEB-contract §9, §19.1)",async()=>{
  await withExam(async p=>{
    await p.click('#btnSubmit');
    const small=await p.eval(()=>['btnCancelSubmit','btnConfirmSubmit'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return{id,w:r.width,h:r.height};}).filter(r=>r.w<44||r.h<44));
    assert.deepEqual(small,[],'DESIGN §2 / §4 Button: nút xác nhận quá thấp');
  });
});
test("dist: [ui] CX-design-F04: hộp nộp bài 320px giữ trọn cả hai nút trong màn hình (WEB-contract §9, §19.1)",async()=>{
  await withExam(async p=>{
    await p.click('#btnSubmit');
    const bad=await p.eval(()=>['btnCancelSubmit','btnConfirmSubmit'].map(id=>({id,...document.getElementById(id).getBoundingClientRect().toJSON()})).filter(r=>r.left<0||r.right>innerWidth));
    assert.deepEqual(bad,[],'DESIGN §1.4 / §4 Dialog: không đẩy nút ra khỏi viewport');
  },{w:320});
});



// All contexts and local servers are already closed; release residual CDP TCP handles.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='Socket'&&h.remoteAddress==='127.0.0.1'&&![process.stdin,process.stdout,process.stderr].includes(h))h.destroy();});

// Chrome has already received Browser.close and kill from the harness.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='ChildProcess'&&/(?:chrome|msedge)(?:\.exe)?$/i.test(h.spawnfile??''))h.unref();});
