'use strict';
// Tracker Growth CMS package page in a browser (TEST proposal): a sentence flagged for several reasons gets one removal
// button, and "Remove all flagged sentences from draft" removes exactly the flagged sentences (owner 2026-11-09).
const test=require('node:test'),assert=require('node:assert/strict');
let chromium=null;try{({chromium}=require('playwright'))}catch(e){}
test('Tracker CMS package: one button per flagged sentence, and Remove all',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const express=require('express');const fs=require('fs'),path=require('path');
const app=express();app.use(express.json());const P=path.join(__dirname,'../public');
for(const f of ['growth-cms-neutral-handoff.js','growth-competitor-overview.js','tracker-growth-ui.js'])app.get('/'+f,(q,r)=>r.type('js').send(fs.existsSync(path.join(P,f))?fs.readFileSync(path.join(P,f),'utf8'):''));
app.get('/track/TOK/growth/cms-export',(q,r)=>r.type('html').send(fs.readFileSync(P+'/growth-cms-neutral-handoff.html','utf8')));
const S='Our platform tracks every roof repair citation in ChatGPT every day.';
const base='/api/tracker-client/TOK/growth/cms-export';
app.get(base+'/source',(q,r)=>r.json({success:true,source_sha256:'x',page_url:'https://acme-roofing.example/',title:'TEST',meta_description:'TEST',headings:[]}));
app.get(base+'/proposal',(q,r)=>r.json({success:true,proposal:{id:5,sections:[{h2:'How to read a repair estimate',text:'Ask for a written estimate before any work. '+S}],review:{flagged:[{sentence:S,reason:'Reason one'},{sentence:S,reason:'Reason two'},{sentence:S,reason:'Reason three'}]}}}));
app.get(base+'/removals',(q,r)=>r.json({success:true,removals:[]}));app.post(base+'/removals',(q,r)=>r.json({success:true}));
app.use('/api',(q,r)=>r.json({success:false}));
const srv=app.listen(0),u='http://127.0.0.1:'+srv.address().port;const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(u+'/track/TOK/growth/cms-export?page_id=1');await p.waitForTimeout(3000);
assert.equal(await p.locator('.growth-flagged-remove').count(),1,'one button for one sentence with three reasons');assert.equal(await p.locator('#growthFlaggedRemoveAll').count(),1);
await p.click('#growthFlaggedRemoveAll');await p.waitForTimeout(500);assert.match(await p.textContent('#growthFlaggedRemoveAll'),/Removed 1 flagged sentence/);assert.equal(await p.inputValue('#copy'),'Ask for a written estimate before any work.','only the flagged sentence is removed');
assert.deepEqual(errs,[]);await b.close();srv.close()
});
