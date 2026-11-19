'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const routes=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
const store=require('../src/growth-free/store.cjs');

test('Stored AI answers remain on the same check and can be explicitly recovered with both access capabilities',()=>{
 assert.match(routes,/id="aiImport"/);
 assert.match(routes,/id="aiImportUrl"/);
 assert.match(routes,/source_id:match\[1\],source_key:u.searchParams.get\('k'\)/);
 assert.match(routes,/source.url!==target.url\|\|source.query!==target.query\|\|!marketMatches/);
 assert.match(routes,/source=await storage.getCheck\(pool,sourceId,sourceKey\)/);
 assert.match(routes,/AI research prompts used different customer questions/);
});
test('Import query does not overwrite existing responses or move their capture times',async()=>{
 let sql='',params;
 const pool={query:async(q,a)=>{sql=q;params=a;return {rows:[{engine:'perplexity'},{engine:'chatgpt'}]}}};
 const result=await store.importAiAnswersFromCheck(pool,{sourceCheckId:42,targetCheckId:84});
 assert.deepEqual(result,{count:2,imported:['perplexity','chatgpt']});
 assert.deepEqual(params,[84,42]);
 assert.match(sql,/INSERT INTO growth_free_ai_answers/);
 assert.match(sql,/SELECT \$1,engine,raw_text,parsed,created_at/);
 assert.match(sql,/ON CONFLICT\(check_id,engine\) DO NOTHING/);
});
const DB=process.env.PREWRITE_E2E_DATABASE_URL||'';
const local=/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
test('End-to-end: only a matching page, question, market and valid previous result key permit import',
 {skip:!local?'isolated PostgreSQL database not configured':false,timeout:30000},async()=>{
 const express=require('express'),pg=require('pg');
 const {registerFreeGrowth,freeGrowthConfig}=require('../src/growth-free/routes.cjs');
 const pool=new pg.Pool({connectionString:DB});
 const app=express();app.use(express.json());
 const service=registerFreeGrowth(app,pool,{config:{...freeGrowthConfig({GROWTH_FREE_ACCESS_KEYS:'test-ai-answer-import'}),perIp:40,daily:100,perEmail:20},sendEmail:async()=>{}});
 const server=app.listen(0),base='http://127.0.0.1:'+server.address().port;
 let ids=[];
 try{
  await store.ensureTables(pool);
  const url='https://same-test-roofer.example/emergency-roof-repair-nj/',query='Who offers 24-hour emergency roof repair in New Jersey?',market={countries:['us'],language:'en'};
  const add=async(q=query,u=url,m=market)=>{const row=await store.createCheck(pool,{email:'proof@example.test',ipHash:'test',url:u,host:'same-test-roofer.example',query:q,market:m,accessLabel:'test',marketingConsent:false});
   ids.push(row.id);await store.setStatus(pool,row.id,{status:'DONE',decision:'NO_CHANGE',summary:{decision:'NO_CHANGE'},report:{}});return row};
  const source=await add(),target=await add(),different=await add('How urgent is roof repair?');
  await store.saveAiAnswer(pool,{checkId:source.id,engine:'perplexity',rawText:'ANSWER: Test. RESOURCES: https://example.com/',parsed:{answer:'Test',sources:['https://example.com/']}});
  await store.saveAiAnswer(pool,{checkId:target.id,engine:'chatgpt',rawText:'Previously saved current result',parsed:{answer:'This stays'}});
  async function send(t,s,key){const r=await fetch(base+'/api/free-growth/checks/'+t.public_id+'/import-ai?k='+encodeURIComponent(t.access_key),{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_id:s.public_id,source_key:key})});return {status:r.status,body:await r.json()}}
  assert.equal((await send(target,source,'wrong')).status,404);
  assert.equal((await send(different,source,source.access_key)).status,409);
  const yes=await send(target,source,source.access_key);
  assert.equal(yes.status,200,JSON.stringify(yes.body));assert.equal(yes.body.count,1);
  const rows=await store.listAiAnswers(pool,target.id);assert.equal(rows.length,2);
  assert.equal(rows.find(x=>x.engine==='chatgpt').raw_text,'Previously saved current result');
  assert.equal(rows.find(x=>x.engine==='perplexity').raw_text,'ANSWER: Test. RESOURCES: https://example.com/');
  assert.equal((await send(target,source,source.access_key)).body.count,0);
 }finally{if(ids.length)await pool.query('DELETE FROM growth_free_checks WHERE id=ANY($1::bigint[])',[ids]);server.close();await pool.end()}
});
