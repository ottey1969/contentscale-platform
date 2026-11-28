'use strict';
// Owner 2026-11-28: Free Growth and Free Pre-Write are limited per week per person, so the same computer cannot ask again
// (fraud prevention). A person = the same e-mail (Free Pre-Write now asks for one), the same browser or the same IP.
// The message says when a new one is possible, or "let Ottmar do it for you". Failed runs and cached results do not count;
// correcting your own brief does not count; the owner is not limited. Only hashes are stored.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const express=require('express');
const request=require('supertest');
const limit=require('../src/free-weekly-limit.cjs');
const {sign}=require('../src/owner-session.cjs');

test('e-mail addresses are normalised so a variant is the same person',()=>{
 assert.equal(limit.normalizeEmail(' John.Doe+promo@GMail.com '),'johndoe@gmail.com');
 assert.equal(limit.normalizeEmail('j.o.h.n.doe@googlemail.com'),'johndoe@gmail.com');
 assert.equal(limit.normalizeEmail('Info+x@Acme-Roofing.example'),'info@acme-roofing.example');
 assert.equal(limit.normalizeEmail('not-an-email'),'');
});

test('the browser id is a signed HttpOnly cookie shared by app., nl. and es.; a forged one is replaced',()=>{
 const env={FREE_LIMIT_SECRET:'test-secret'};
 const headers=[];const res={append:(k,v)=>headers.push([k,v])};
 const req=h=>({headers:{cookie:h||''},hostname:'nl.app.contentscale.site',secure:true});
 const id=limit.deviceId(req(),res,env);
 assert.match(id,/^[a-f0-9]{32}$/);
 const cookie=headers[0][1];
 assert.match(cookie,/^cs_free_device=[a-f0-9]{32}\.[a-f0-9]{40}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Domain=\.contentscale\.site; Secure$/);
 const value=cookie.split(';')[0];
 assert.equal(limit.deviceId(req(value),res,env),id,'the same browser keeps its id');
 assert.equal(headers.length,1,'no new cookie for a valid one');
 assert.notEqual(limit.deviceId(req('cs_free_device='+'a'.repeat(32)+'.'+'0'.repeat(40)),res,env),'a'.repeat(32),'forged id refused');
});

test('the limit message says until when, or let Ottmar do it, in EN, NL and ES',()=>{
 const at='2026-12-05T10:00:00Z';
 assert.equal(limit.limitMessage('FREE_GROWTH',1,at,'en'),'You have used your free Growth check for this week. Wait until 5 December 2026 for a new one, or let Ottmar do it for you.');
 assert.match(limit.limitMessage('FREE_PREWRITE',1,at,'nl',{contactUrl:'https://contentscale.site/contact/'}),/^Je hebt je gratis Pre-Write Brief voor deze week gebruikt\. Wacht tot 5 december 2026 voor een nieuwe, of laat Ottmar het voor je doen: https:\/\/contentscale\.site\/contact\/$/);
 assert.match(limit.limitMessage('FREE_PREWRITE',2,at,'es'),/^Ya usaste tus 2 briefs de Pre-Write gratuitos de esta semana\. Espera hasta el 5 de diciembre de 2026/);
 assert.equal(limit.perWeek('FREE_GROWTH',{}),1);assert.equal(limit.perWeek('FREE_PREWRITE',{FREE_PREWRITE_PER_WEEK:'2'}),2);
 assert.equal(limit.perWeek('FREE_GROWTH',{GROWTH_FREE_PER_WEEK:'0'}),0,'0 switches it off');
});

test('Free Pre-Write asks for an e-mail address in EN, NL and ES and says it limits free briefs',async()=>{
 const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
 const app=express();app.use(express.json());
 registerFreePrewrite(app,{query:()=>{throw Error('no database for the form')}});
 for(const [lang,word] of [['en','week'],['nl','week'],['es','semana']]){
  const page=await request(app).get('/free-pre-write?lang='+lang).expect(200);
  assert.match(page.text,/<input name="email" type="email"[^>]*required/);
  assert.match(page.text,new RegExp(word));
 }
 await request(app).post('/api/free-pre-write').set('Authorization','Bearer '+'a'.repeat(64))
  .send({website:'https://example.com/',keyword:'roof repair',region:'us',language:'en',manualAiEvidence:{}}).expect(400);
});

test('Free Pre-Write waiting page: an animation that follows the real research step, and respects reduced motion',async()=>{
 const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
 const app=express();app.use(express.json());
 registerFreePrewrite(app,{query:()=>{throw Error('no database for the form')}});
 for(const lang of ['en','nl','es']){
  const page=await request(app).get('/free-pre-write/r?lang='+lang).expect(200);
  assert.match(page.text,/id="progress"/);
  assert.match(page.text,/@keyframes/);
  assert.match(page.text,/prefers-reduced-motion/);
  assert.match(page.text,/window\.prewriteSteps=/);
 }
 const js=require('node:fs').readFileSync(require.resolve('../public/free-prewrite.js'),'utf8');
 assert.match(js,/result\.progress/,'the page shows the stage the server reports');
});

const DB=process.env.PREWRITE_E2E_DATABASE_URL||process.env.GROWTH_E2E_DATABASE_URL||'';
const disposable=/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
const ADMIN='weekly-owner-secret-0123456789';
const ownerCookie=()=>{const exp=String(Date.now()+3600000);return 'gf_admin='+exp+'.'+sign(ADMIN,exp)};
async function schemaPool(){
 const {Pool}=require('pg');
 const schema='free_weekly_'+crypto.randomBytes(6).toString('hex');
 const admin=new Pool({connectionString:DB});
 await admin.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:DB,options:'-c search_path='+schema});
 return {pool,done:async()=>{await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end()}};
}
function deviceOf(res){const c=[].concat(res.headers['set-cookie']||[]).find(x=>x.startsWith('cs_free_device='));return c?c.split(';')[0]:null}

test('Free Growth: one free check per week per e-mail, browser or IP; failures, cache and the owner do not count',{skip:!disposable&&'Requires disposable PostgreSQL',timeout:60000},async()=>{
 const {pool,done}=await schemaPool();
 const prev={...process.env};
 Object.assign(process.env,{GROWTH_FREE_PER_WEEK:'1',FREE_LIMIT_SECRET:'weekly-test'});
 try{
  const {registerFreeGrowth,freeGrowthConfig}=require('../src/growth-free/routes.cjs');
  const app=express();app.set('trust proxy',true);app.use(express.json());
  const cfg=freeGrowthConfig({GROWTH_FREE_ACCESS_KEYS:JSON.stringify([{key:'weekly-test-key',label:'weekly',hosts:['127.0.0.1']}]),
   GROWTH_FREE_PER_WEEK:'1',GROWTH_FREE_ADMIN_KEY:ADMIN,GROWTH_FREE_CONTACT_URL:'https://contentscale.site/contact/'});
  let fail=false;
  const growth=registerFreeGrowth(app,pool,{config:{...cfg,perIp:50},
   engine:async()=>fail?{statusCode:500,report:{success:false,code:'TEST_FAIL'}}:{statusCode:200,report:{success:true,editorial_decision_gate:{decision:'NO_CHANGE'}}},
   engineDeps:{questionFetch:async()=>new Response('{}',{status:200}),aiGapModel:null}});
  let n=0;
  const start=(email,ip,cookie,extra={})=>{n++;const r=request(app).post('/api/free-growth/checks').set('X-Forwarded-For',ip);if(cookie)r.set('Cookie',cookie);
   return r.send({url:'https://weekly.example/page-'+n+'/',query:'roof repair '+n,consent:true,no_gsc:true,email,key:'weekly-test-key',...extra})};
  const first=await start('Jan.Jansen@gmail.com','198.51.100.1');
  assert.equal(first.status,202,JSON.stringify(first.body));
  const device=deviceOf(first);assert.ok(device,'the browser gets its id');
  await growth.idle();
  for(const [why,res] of [
   ['same e-mail (variant)',await start('janjansen+2@gmail.com','198.51.100.2')],
   ['same browser',await start('other@example.com','198.51.100.3',device)],
   ['same IP',await start('third@example.com','198.51.100.1')]]){
   assert.equal(res.status,429,why);assert.equal(res.body.code,'WEEKLY_LIMIT',why);
   assert.match(res.body.error,/You have used your free Growth check for this week\. Wait until .+ for a new one, or let Ottmar do it for you: https:\/\/contentscale\.site\/contact\//,why);
   assert.ok(Date.parse(res.body.retry_at)>Date.now()+6*86400000,why);
  }
  const nl=await start('jan.jansen@gmail.com','198.51.100.9',null,{lang:'nl'});
  assert.match(nl.body.error,/^Je hebt je gratis Growth-check voor deze week gebruikt\. Wacht tot/);
  // A failed check is given back.
  fail=true;assert.equal((await start('fails@example.com','198.51.100.20')).status,202);await growth.idle();fail=false;
  assert.equal((await start('fails@example.com','198.51.100.21')).status,202,'the failed check did not count');await growth.idle();
  // The owner is not limited.
  for(let i=0;i<2;i++){
   const own=await request(app).post('/api/free-growth/checks').set('X-Forwarded-For','198.51.100.1').set('Cookie',ownerCookie()).set('X-Requested-With','growth-free-admin')
    .send({url:'https://weekly.example/owner-'+i+'/',query:'owner '+i,consent:true,no_gsc:true,email:'owner@contentscale.example'});
   assert.equal(own.status,202,'owner '+i);
  }
  await growth.idle();
  // A week later the person can start again.
  await pool.query("UPDATE free_tool_usage SET created_at=NOW()-INTERVAL '8 days'");
  assert.equal((await start('jan.jansen@gmail.com','198.51.100.1',device)).status,202);
  await growth.idle();
  const stored=JSON.stringify((await pool.query('SELECT * FROM free_tool_usage')).rows);
  assert.ok(!/jansen|198\.51\.100/.test(stored),'only hashes are stored');
 }finally{process.env=prev;await done()}
});

test('Free Pre-Write: one brief per week per e-mail, browser or IP; corrections of your own brief and the owner do not count',{skip:!disposable&&'Requires disposable PostgreSQL',timeout:60000},async()=>{
 const {pool,done}=await schemaPool();
 const prev={...process.env};
 Object.assign(process.env,{FREE_PREWRITE_PER_WEEK:'1',FREE_LIMIT_SECRET:'weekly-test',GROWTH_FREE_ADMIN_KEY:ADMIN});
 try{
  await pool.query(`CREATE TABLE prewrite_briefs (id SERIAL PRIMARY KEY, client_id INT, status TEXT, keyword TEXT, language TEXT, region TEXT,
   brief_json JSONB, created_at TIMESTAMP DEFAULT NOW(), public_site TEXT, public_access_hash TEXT UNIQUE)`);
  const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
  const app=express();app.set('trust proxy',true);app.use(express.json());
  let fail=false;const stages=[];
  registerFreePrewrite(app,pool,{dailyLimit:50,discover:async site=>({site,urls:[]}),
   generate:async ({id,keyword,stage})=>{
    if(fail)throw Error('provider down');
    await stage('serp');stages.push((await pool.query('SELECT progress FROM free_prewrite_progress WHERE brief_id=$1',[id])).rows[0]?.progress?.stage);
    await pool.query("UPDATE prewrite_briefs SET status='open',brief_json=$2 WHERE id=$1",[id,{keyword}]);
   }});
  const key=()=>crypto.randomBytes(32).toString('hex');
  const body=(email,extra={})=>({website:'https://weekly.example/',keyword:'roof repair',region:'us',language:'en',manualAiEvidence:{},email,...extra});
  const post=(k,ip,b,cookie)=>{const r=request(app).post('/api/free-pre-write').set('Authorization','Bearer '+k).set('X-Forwarded-For',ip);if(cookie)r.set('Cookie',cookie);return r.send(b)};
  const settle=()=>new Promise(r=>setTimeout(r,150));
  await post(key(),'203.0.113.1',body('')).expect(400);
  const k1=key();const first=await post(k1,'203.0.113.1',body('Piet@Example.com'));
  assert.equal(first.status,202);const device=deviceOf(first);await settle();
  assert.deepEqual(stages,['serp'],'the research step is saved while it runs');
  for(const [why,res] of [['same e-mail',await post(key(),'203.0.113.2',body('piet+x@example.com'))],
   ['same browser',await post(key(),'203.0.113.3',body('new@example.com'),device)],['same IP',await post(key(),'203.0.113.1',body('newer@example.com'))]]){
   assert.equal(res.status,429,why);assert.equal(res.body.code,'WEEKLY_LIMIT',why);assert.match(res.body.error,/let Ottmar do it for you/,why);
  }
  const es=await post(key(),'203.0.113.1',body('piet@example.com',{language:'es'}));
  assert.match(es.body.error,/^Ya usaste tu brief de Pre-Write gratuito de esta semana/);
  // Correcting the intent of your own brief is not a new brief: three corrections, then the limit applies.
  let prevKey=k1;
  for(let i=0;i<3;i++){const k=key();await post(k,'203.0.113.1',body('piet@example.com',{intentOverride:'informational',revisionOf:prevKey}),device).expect(202);prevKey=k;await settle()}
  assert.equal((await post(key(),'203.0.113.1',body('piet@example.com',{intentOverride:'commercial',revisionOf:prevKey}),device)).status,429);
  // Someone else's brief key is not a free correction for you.
  assert.equal((await post(key(),'203.0.113.1',body('piet@example.com',{revisionOf:key()}),device)).status,429);
  // Two requests at the same moment from one new browser: one brief.
  const fresh=[key(),key()];
  const both=await Promise.all(fresh.map(k=>post(k,'203.0.113.50',body('same-moment@example.com'))));
  assert.deepEqual(both.map(r=>r.status).sort(),[202,429]);await settle();
  // A failed generation is given back.
  fail=true;await post(key(),'203.0.113.60',body('fails@example.com')).expect(202);await settle();fail=false;
  await post(key(),'203.0.113.61',body('fails@example.com')).expect(202);await settle();
  // The owner is not limited.
  for(let i=0;i<2;i++)await post(key(),'203.0.113.1',body('piet@example.com'),ownerCookie()).expect(202);
  await settle();
  const stored=JSON.stringify((await pool.query('SELECT * FROM free_tool_usage')).rows);
  assert.ok(!/piet|203\.0\.113/.test(stored),'only hashes are stored');
 }finally{process.env=prev;await done()}
});

test('Free Pre-Write result reports the running step while generating',{skip:!disposable&&'Requires disposable PostgreSQL',timeout:30000},async()=>{
 const {pool,done}=await schemaPool();
 const prev={...process.env};Object.assign(process.env,{FREE_PREWRITE_PER_WEEK:'0'});
 try{
  await pool.query(`CREATE TABLE prewrite_briefs (id SERIAL PRIMARY KEY, client_id INT, status TEXT, keyword TEXT, language TEXT, region TEXT,
   brief_json JSONB, created_at TIMESTAMP DEFAULT NOW(), public_site TEXT, public_access_hash TEXT UNIQUE)`);
  const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
  const app=express();app.use(express.json());
  let release;const hold=new Promise(r=>{release=r});
  registerFreePrewrite(app,pool,{dailyLimit:5,discover:async site=>({site,urls:[]}),
   generate:async ({id,stage})=>{await stage('competitor_scrape');await hold;await pool.query("UPDATE prewrite_briefs SET status='open',brief_json='{\"keyword\":\"x\"}' WHERE id=$1",[id])}});
  const k=crypto.randomBytes(32).toString('hex');
  await request(app).post('/api/free-pre-write').set('Authorization','Bearer '+k).send({website:'https://progress.example/',keyword:'x',region:'us',language:'nl',manualAiEvidence:{},email:'p@example.com'}).expect(202);
  await new Promise(r=>setTimeout(r,100));
  const r=await request(app).get('/api/free-pre-write/result').set('Authorization','Bearer '+k).expect(200);
  assert.equal(r.body.status,'generating');
  assert.equal(r.body.progress.stage,'competitor_scrape');
  assert.ok(r.body.progress.step>=2&&r.body.progress.step<r.body.progress.steps,JSON.stringify(r.body.progress));
  assert.ok(Number.isFinite(r.body.progress.elapsed_seconds));
  release();
 }finally{process.env=prev;await done()}
});
