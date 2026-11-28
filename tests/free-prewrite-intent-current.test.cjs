'use strict';
// Owner 2026-11-28: "correct search intent, dan moet ik weten wat het nu was" and "Optional gaat naar beneden: step 1,
// dan 2 etc., laatste optional zaken". The result page shows Steps 1-4 in order, then the optional correction, and the
// correction says which intent the brief uses now, whether it follows Google or the owner, and why.
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const express=require('express');
const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
let chromium=null;try{({chromium}=require('playwright'))}catch{}

const KEY='a'.repeat(64);
const RESULT={success:true,status:'open',language:'en',region:'es',website:'https://es.contentscale.site/',keyword:'¿Qué seo checker gratis analiza el SEO de mi web?',
 target:{mode:'CREATE',url:'https://es.contentscale.site/seo-checker/'},instructions:'CREATE https://es.contentscale.site/seo-checker/',
 brief:{content_decision:{reason:'New page.'},search_intent:{primary:'transactional',secondary_intents:['commercial'],user_override:null,overridden:false,
  evidence:['2 commercial-decision signal(s) in SERP','5 of the top results are free online tools']}}};
function app(){const a=express();a.use(express.json());a.use(express.static(path.join(__dirname,'..','public')));registerFreePrewrite(a,{query:()=>{throw Error('no database')}});return a}

async function open(browser,base,lang,result){
 const page=await browser.newPage();
 await page.route('**/api/free-pre-write/result',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(result)}));
 await page.route('**/api/free-pre-write/implementation-report',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,history:[],editor_brief:{}})}));
 await page.goto(base+'/free-pre-write/r?lang='+lang+'#'+KEY);
 await page.locator('#intent-adjust').waitFor({state:'visible'});
 return page;
}
test('result page: Step 1, Steps 2-4, then the optional correction, which says the current intent and why',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const srv=app().listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const page=await open(browser,base,'en',RESULT);
  const top=async sel=>(await page.locator(sel).boundingBox()).y;
  const [handoff,implementation,correct]=[await top('#handoff'),await top('#implementation'),await top('#intent-adjust')];
  assert.ok(handoff<implementation&&implementation<correct,'Step 1 < Steps 2-4 < Optional');
  const now=await page.locator('#intent-current').textContent();
  assert.match(now,/Current search intent: Transactional: buy, hire or use a tool/);
  assert.match(now,/automatic, follows Google/);
  assert.match(now,/Also: Commercial: compare options before buying/);
  assert.match(now,/5 of the top results are free online tools/);
  await page.close();
  const owner=await open(browser,base,'nl',{...RESULT,brief:{...RESULT.brief,search_intent:{primary:'informational',secondary_intents:[],user_override:'informational',overridden:true,evidence:[]}}});
  const nl=await owner.locator('#intent-current').textContent();
  assert.match(nl,/Huidige zoekintentie: Informatief: leren of begrijpen/);assert.match(nl,/door jou gecorrigeerd/);
  assert.equal(await owner.locator('[name=intent]').inputValue(),'informational');
 }finally{await browser.close();srv.close()}
});
