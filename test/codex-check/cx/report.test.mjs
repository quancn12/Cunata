await import((await import('node:url')).pathToFileURL(process.cwd()+'/ops/blitz/promoted/_support/runtime.mjs').href);
import {test as nodeTest,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const H=await import(pathToFileURL(process.cwd()+'/test/claude-check/harness.mjs').href);
const A=await import(pathToFileURL(process.cwd()+'/test/claude-check/app.mjs').href);
const test=(name,opts,fn)=>nodeTest(name,opts,async()=>{try{return await fn();}catch(e){e.message=name+'\n'+e.message;throw e;}});
let browser;
before(async()=>{browser=await H.launchBrowser();});
after(async()=>{await browser?.close();});
const read=n=>JSON.parse(readFileSync(`dist/public/exams/ly12/de${n}.json`,'utf8'));
async function withExam(n, fn){
 const exam=read(n), url=`public/exams/ly12/de${n}.json`;
 const server=await H.startServer(process.cwd()+'/dist',{overrides:{'public/config.json':'{"appsScriptUrl":""}','public/exams/index.json':JSON.stringify({version:1,exams:[{id:exam.examId,title:exam.title,url,subject:exam.subject,grade:12,durationMinutes:50,questionCount:exam.questions.length,group:'CX'}]})}});
 const ctx=await browser.newContext();
 try{const p=await ctx.newPage();await p.send('Network.setBlockedURLs',{urls:['*://*.google.com/*','*://*.googleusercontent.com/*']});await p.goto(server.url);await A.waitBoot(p);await A.enterFromStart(p,{name:'Học sinh kiểm định CX',id:exam.examId});await fn(p,exam,ctx);}
 finally{await ctx.close();await server.close();}
}
test('dist: [app] CX-C01: lời giải thực tế có diễn giải (WEB-contract §14 D08)',{timeout:180000},async()=>{
 const bad=[];
 for(const n of [10])await withExam(n,async(p,e)=>{await A.submit(p);const terse=await p.eval(()=>[...document.querySelectorAll('#reportWrapper .explanation-box')].map(x=>x.innerText.replace(/^\s*Lời giải:\s*/, '')).filter(t=>/^\s*(?:Đáp án\s+[A-D][.]?|Đúng[.]?|Sai[.]?)\s*$/.test(t)));if(terse.length)bad.push({exam:e.examId,count:terse.length});});
 assert.deepEqual(bad,[],'WEB-contract §14 D08: lời giải chi tiết cho mọi câu, không chỉ lặp đáp án');
});
test('dist: [app] CX-C02: phân số giữ nhóm tử số (WEB-contract §4.1)',{timeout:90000},async()=>withExam(12,async p=>{await A.submit(p);const t=await p.eval(()=>document.querySelectorAll('.review-question-card')[9]?.querySelector('.explanation-box')?.innerText);assert.ok(t,'WEB-contract §20: có lời giải câu I.10');assert.doesNotMatch(t,/\(21 \+ 23 \+ 30 \+ 26\/4\)/,'WEB-contract §4.1, §20: giữ nguyên nhóm tử số (21+23+30+26)/4');}));
test('dist: [app] CX-C03: ký pháp chưa hỗ trợ có nhãn nguồn (WEB-contract §4.1)',{timeout:90000},async()=>withExam(14,async p=>{const t=await p.eval(()=>document.getElementById('qcard-ly12-de14-i-17')?.innerText);assert.ok(t,'câu thật đã được render');assert.ok(!/\\%/.test(t)||/nguồn|chưa hỗ trợ|LaTeX/i.test(t),'WEB-contract §4.1: công thức chưa hỗ trợ phải có nhãn nguồn');}));
test('dist: [app] CX-C09: lời giải II không lộ markup thành chữ (WEB-contract §14 D08)',{timeout:90000},async()=>withExam(10,async p=>{await A.submit(p);const text=await p.eval(()=>[...document.querySelectorAll('#reportWrapper .explanation-box')].map(x=>x.innerText).join('\n'));assert.doesNotMatch(text,/<\/?(?:strong|br)\b/i,'WEB-contract §14 D08, §20: lời giải phải đọc được, không lộ thẻ HTML thành chữ');}));

test('dist: [app] CX-scoring-F01: báo cáo có thời điểm bắt đầu và phiên bản đề (WEB-contract §9)',{timeout:90000},async()=>withExam(10,async(p,e)=>{await A.submit(p);const t=await p.eval(()=>document.getElementById('reportWrapper').innerText);assert.match(t,/Bắt đầu|bắt đầu/,'WEB-contract §9: thời điểm bắt đầu trên báo cáo');assert.ok(t.includes(e.examVersionId),'WEB-contract §9: báo cáo có phiên bản đề');}));
test('dist: [app] CX-scoring-F05: HTML có phiên bản và thời điểm làm bài (WEB-contract §9)',{timeout:90000},async()=>withExam(10,async(p,e,ctx)=>{await A.submit(p);await p.click('#btnDownloadReportHtml');const dl=await ctx.waitDownload();assert.ok(dl.text.includes(e.examVersionId),'WEB-contract §9: phiên bản đề trong HTML offline');assert.match(dl.text,/Bắt đầu|bắt đầu/,'WEB-contract §9: thời điểm bắt đầu trong HTML offline');}));

test('dist: [app] CX-scoring-F03: dán quá 4 ký tự không âm thầm biến thành đáp án đúng (WEB-contract §4, §14 D01)',{timeout:120000},async()=>withExam(10,async(p,e)=>{
 const q=e.questions.find(q=>q.kind==='III'&&q.answerKey.length===4);assert.ok(q,'fixture có key 4 ký tự');
 await A.typeShort(p,q.questionVersionId,q.answerKey+'9');
 const state=await p.eval(id=>{const c=document.getElementById('qcard-'+id),input=c.querySelector('.short-answer-input');return{value:input.value,warning:[...c.querySelectorAll('[role=alert],.input-error,.short-answer-error,[aria-live]')].some(x=>x.getClientRects().length&&x.textContent.trim())};},q.questionVersionId);
 assert.ok(state.value!==q.answerKey||state.warning,'WEB-contract §4 / D01: không cắt chuỗi 5 ký tự thành key đúng 4 ký tự mà không cảnh báo');
}));

// All contexts and local servers are already closed; release residual CDP TCP handles.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='Socket'&&h.remoteAddress==='127.0.0.1'&&![process.stdin,process.stdout,process.stderr].includes(h))h.destroy();});

// Chrome has already received Browser.close and kill from the harness.
after(()=>{for(const h of process._getActiveHandles())if(h.constructor?.name==='ChildProcess'&&/(?:chrome|msedge)(?:\.exe)?$/i.test(h.spawnfile??''))h.unref();});
