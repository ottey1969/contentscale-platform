'use strict';
// Tracker Growth CMS package: a flagged sentence that is true for the business can be kept (owner 2026-11-12: "where do
// I approve?"). The decision is stored for the page; only the stored decision releases it, never the browser; a safety
// assurance is never released. All text is TEST input.
const test=require('node:test'),assert=require('node:assert/strict');
const {applyKept}=require('../src/growth-sentence-removal-store.cjs');
const KEEP='Indicative pricing ranges from $250 to $5,800+ depending on the final on-site assessment.';
const SAFE='A sagging ceiling is safe to wait until next week.';
const notes={flagged:[{sentence:KEEP,h2:'Cost',reason:'TEST figure in another context'},{sentence:SAFE,h2:'Safety',reason:'TEST',code:'UNSUPPORTED_SAFETY_ASSURANCE'},{sentence:'We are the best roofer in New Jersey.',h2:'Why us',reason:'TEST'}],
 confirmed_by_editor:[{sentence:'We are the best roofer in New Jersey.'}]};
test('only stored KEPT_BY_OWNER decisions release a flagged sentence; a safety assurance never',()=>{
 const rows=[{sentence:KEEP,how:'KEPT_BY_OWNER'},{sentence:SAFE,how:'KEPT_BY_OWNER'},{sentence:'Other sentence that was removed earlier.',how:'REMOVED_BY_BUTTON'}];
 const out=applyKept(notes,rows);
 assert.deepEqual(out.flagged.map(f=>f.sentence),[SAFE,'We are the best roofer in New Jersey.'],'the kept sentence no longer blocks; safety and unconfirmed ones do');
 assert.deepEqual(out.confirmed_by_editor.map(f=>f.sentence),[KEEP],'a confirmation sent by the browser is ignored');
 assert.deepEqual(applyKept(notes,[]).flagged.length,3);assert.equal(applyKept(notes,[]).confirmed_by_editor,undefined);
 assert.equal(applyKept(null,rows),null);
});
let chromium=null;try{({chromium}=require('playwright'))}catch(e){}
test('Tracker CMS page: show in the text, keep (stored), undo, and "Remove all" leaves a kept sentence',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const express=require('express');const fs=require('fs'),path=require('path');
 const app=express();app.use(express.json());const P=path.join(__dirname,'../public');
 for(const f of ['growth-cms-neutral-handoff.js','growth-competitor-overview.js','tracker-growth-ui.js'])app.get('/'+f,(q,r)=>r.type('js').send(fs.existsSync(path.join(P,f))?fs.readFileSync(path.join(P,f),'utf8'):''));
 app.get('/track/TOK/growth/cms-export',(q,r)=>r.type('html').send(fs.readFileSync(P+'/growth-cms-neutral-handoff.html','utf8')));
 const OTHER='Our platform tracks every roof repair citation in ChatGPT every day.';
 const base='/api/tracker-client/TOK/growth/cms-export',posts=[];
 app.get(base+'/source',(q,r)=>r.json({success:true,source_sha256:'x',page_url:'https://acme-roofing.example/',title:'TEST',meta_description:'TEST',headings:[]}));
 app.get(base+'/proposal',(q,r)=>r.json({success:true,proposal:{id:5,sections:[{h2:'What emergency roof repair costs',text:'Ask for a written estimate before any work. '+KEEP+' '+OTHER}],review:{flagged:[{sentence:KEEP,reason:'TEST figure in another context'},{sentence:OTHER,reason:'TEST unproven'}]}}}));
 app.get(base+'/removals',(q,r)=>r.json({success:true,removed:[]}));app.post(base+'/removals',(q,r)=>{posts.push(q.body);r.json({success:true})});
 app.use('/api',(q,r)=>r.json({success:false}));
 const srv=app.listen(0),u='http://127.0.0.1:'+srv.address().port;const b=await chromium.launch();
 try{const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(u+'/track/TOK/growth/cms-export?page_id=1');await p.waitForFunction(()=>document.querySelectorAll('.growth-flag-keep').length===2,null,{timeout:20000});
  const row=p.locator('.growth-flagged-remove[data-sentence="'+KEEP+'"]').first();
  await row.locator('.growth-flag-show').click();
  assert.equal(await p.evaluate(()=>document.activeElement&&document.activeElement.id),'copy','the text field with the sentence gets the focus');
  await row.locator('.growth-flag-keep').click();await p.waitForTimeout(200);
  assert.match(await row.textContent(),/Kept — you confirmed it is true/);assert.deepEqual(posts.pop(),{page_id:1,sentence:KEEP,how:'KEPT_BY_OWNER'});
  await p.click('#growthFlaggedRemoveAll');
  const copy=await p.inputValue('#copy');assert.match(copy,/\$5,800\+/,'a kept sentence stays in the text');assert.doesNotMatch(copy,/Our platform tracks/,'the other flagged sentence is removed');
  await row.locator('.growth-flag-unkeep').click();await p.waitForTimeout(200);
  assert.deepEqual(posts.pop(),{page_id:1,sentence:KEEP,how:'UNDONE'});assert.equal(await row.locator('.growth-flag-keep').isVisible(),true,'after undo it can be kept or removed again');
  assert.deepEqual(errs,[]);
 }finally{await b.close();srv.close()}
});
