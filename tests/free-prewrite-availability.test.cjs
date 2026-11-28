'use strict';
// Owner 2026-11-28: "melden: de 5 gratis briefs van vandaag waren op, voor alle bezoekers samen; niemand hoeft te gokken."
// The form says before anyone fills it in how many free briefs are left today, whether this computer already used its
// brief this week, and when it is possible again. When nothing is left, Generate brief is disabled with the reason.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const path=require('node:path');
const express=require('express');
const request=require('supertest');
const {sign}=require('../src/owner-session.cjs');
const DB=process.env.PREWRITE_E2E_DATABASE_URL||process.env.GROWTH_E2E_DATABASE_URL||'';
const disposable=/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
const ADMIN='availability-owner-secret-0123';

test('availability: today\'s left for everyone, this computer\'s week, the owner; with the reason in the page language',{skip:!disposable&&'Requires disposable PostgreSQL',timeout:30000},async()=>{
 const {Pool}=require('pg');
 const schema='pw_avail_'+crypto.randomBytes(6).toString('hex');
 const admin=new Pool({connectionString:DB});await admin.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:DB,options:'-c search_path='+schema});
 const prev={...process.env};Object.assign(process.env,{GROWTH_FREE_ADMIN_KEY:ADMIN,FREE_PREWRITE_PER_WEEK:'1',FREE_LIMIT_SECRET:'avail'});
 try{
  await pool.query(`CREATE TABLE prewrite_briefs (id SERIAL PRIMARY KEY, client_id INT, status TEXT, keyword TEXT, language TEXT, region TEXT,
   brief_json JSONB, created_at TIMESTAMP DEFAULT NOW(), public_site TEXT, public_access_hash TEXT UNIQUE)`);
  const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
  const app=express();app.set('trust proxy',true);app.use(express.json());
  registerFreePrewrite(app,pool,{dailyLimit:5,generate:async()=>{},discover:async site=>({site,urls:[]})});
  const get=(lang,ip,cookie)=>{const r=request(app).get('/api/free-pre-write/availability?lang='+lang).set('X-Forwarded-For',ip);if(cookie)r.set('Cookie',cookie);return r};
  let a=(await get('nl','198.51.100.1').expect(200)).body;
  assert.equal(a.daily_limit,5);assert.equal(a.daily_left,5);assert.equal(a.can_start,true);assert.equal(a.owner,false);
  assert.match(a.message,/^Vandaag nog 5 van de 5 gratis briefs beschikbaar/);
  assert.ok(Date.parse(a.daily_resets_at)>Date.now());
  assert.equal(new Date(a.daily_resets_at).getUTCHours(),0,'resets at midnight UTC');
  for(let i=0;i<5;i++)await pool.query("INSERT INTO prewrite_briefs (status,keyword,public_access_hash,public_site) VALUES ('open','x',$1,'https://x.example/')",['h'+i]);
  a=(await get('nl','198.51.100.1').expect(200)).body;
  assert.equal(a.daily_left,0);assert.equal(a.can_start,false);assert.equal(a.reason,'DAILY_TOTAL');
  assert.match(a.message,/^De 5 gratis briefs van vandaag zijn op, voor alle bezoekers samen\. Morgen kan het weer/);
  assert.match((await get('es','198.51.100.1')).body.message,/^Los 5 briefs gratuitos de hoy se han agotado, para todos los visitantes/);
  assert.match((await get('en','198.51.100.1')).body.message,/^Today's 5 free briefs are used up, for all visitors together/);
  // The owner is not limited.
  const exp=String(Date.now()+3600000);
  a=(await get('nl','198.51.100.1','gf_admin='+exp+'.'+sign(ADMIN,exp))).body;
  assert.equal(a.owner,true);assert.equal(a.can_start,true);assert.match(a.message,/eigenaar/i);
  // This computer's week: shown before the form is filled in.
  await pool.query("DELETE FROM prewrite_briefs");
  const limit=require('../src/free-weekly-limit.cjs');
  const id=limit.identity({ip:'198.51.100.7',headers:{}},null,{},process.env);
  await limit.reserve(pool,{tool:'FREE_PREWRITE',id,limit:1});
  a=(await get('nl','198.51.100.7').expect(200)).body;
  assert.equal(a.can_start,false);assert.equal(a.reason,'WEEKLY_LIMIT');assert.ok(a.weekly_retry_at);
  assert.match(a.message,/^Je hebt je gratis Pre-Write Brief voor deze week gebruikt\./);
  assert.equal((await get('nl','198.51.100.8')).body.can_start,true,'another computer can');
  // Two briefs running: say so, and when to try again.
  for(let i=0;i<2;i++)await pool.query("INSERT INTO prewrite_briefs (status,keyword,public_access_hash,public_site) VALUES ('generating','x',$1,'https://x.example/')",['g'+i]);
  a=(await get('en','198.51.100.9')).body;
  assert.equal(a.can_start,false);assert.equal(a.reason,'BUSY');assert.match(a.message,/^Two briefs are being researched right now/);
 }finally{process.env=prev;await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end()}
});

let chromium=null;try{({chromium}=require('playwright'))}catch{}
test('the form shows the availability; with nothing left, Generate brief is disabled and says why',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
 const a=express();a.use(express.json());a.use(express.static(path.join(__dirname,'..','public')));registerFreePrewrite(a,{query:()=>{throw Error('no database')}});
 const srv=a.listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  for(const [left,msg] of [[3,'Vandaag nog 3 van de 5 gratis briefs beschikbaar.'],[0,'De 5 gratis briefs van vandaag zijn op, voor alle bezoekers samen. Morgen kan het weer.']]){
   const page=await browser.newPage();
   await page.route('**/api/free-pre-write/availability*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,daily_limit:5,daily_left:left,can_start:left>0,owner:false,reason:left?null:'DAILY_TOTAL',message:msg,daily_resets_at:'2026-11-29T00:00:00.000Z'})}));
   await page.goto(base+'/free-pre-write?lang=nl');
   await page.waitForFunction(m=>document.getElementById('availability').textContent.includes(m),msg);
   assert.equal(await page.locator('#intake button[type=submit]').isDisabled(),left===0);
   await page.close();
  }
 }finally{await browser.close();srv.close()}
});
