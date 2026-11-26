'use strict';
// Owner 2026-11-20 (contentscale.site brief, search term "content scaling"): four saved AI answers were about "how to get
// cited by AI" and Copilot's was the Spanish answer about "optimización de contenido SEO" from the check before. One shared
// word ("content" / "contenido") was enough to accept them. Owner: "antwoorden weigeren die niets met de zoekterm te maken
// hebben, met een duidelijke melding" and "ingevulde antwoorden in de browser alleen bewaren per check en zoekterm".
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const ai=require('../src/growth-free/ai-answers.cjs');

const CITED='Getting your content cited by AI means making your website a reliable, accessible and useful source that AI-powered search systems can discover, understand, trust and reference in their answers. Answer specific questions directly, publish original information and allow the relevant AI crawlers.';
const SEO_ES_UNUSED='La optimización de contenido SEO es el proceso de mejorar y adaptar el contenido de una página web para que los motores de búsqueda puedan comprenderlo mejor y los usuarios lo encuentren con mayor facilidad.';
const SCALING='Content scaling means producing more content without losing quality: a clear brand voice and style guide, an editorial calendar, a repeatable workflow and metrics that show whether the scaled content brings traffic and leads.';
const GEO_ES='Un consultor GEO trabaja para que tu marca aparezca en las respuestas de IA. La visibilidad se mide con un conjunto fijo de preguntas en cada motor, y el precio de la consultoría depende del alcance: cuánto cuesta varía según el trabajo.';

// The precise signal: the exact answer text was already saved for a check with another customer question. Word overlap is
// not used: real answers use synonyms ("roofers… tarp a leaking roof" for "emergency roof repair nj"), and these wrong
// answers shared the word "content" with the search term anyway.
function app(store){
 const express=require('express');const {registerFreeGrowth,freeGrowthConfig}=require('../src/growth-free/routes.cjs');
 const a=express();a.use(express.json());
 registerFreeGrowth(a,null,{config:{...freeGrowthConfig({GROWTH_FREE_ACCESS_KEYS:'open-key-12345'}),perIp:50,daily:50,perEmail:2,adminKey:'synthetic-owner-admin-key'},storage:store,engine:async()=>({statusCode:200,report:{editorial_decision_gate:{decision:'NO_CHANGE'}}})});
 const srv=a.listen(0),base='http://127.0.0.1:'+srv.address().port;
 return {srv,post:async(p,b,h={})=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...h},body:JSON.stringify(b)});return {status:r.status,body:await r.json()}}};
}
test('an answer already saved for another search term is refused with a clear message',async t=>{
 const asked=[];
 const store={ensureTables:async()=>{},usage:async()=>({by_email:0,by_ip:0,total:0,by_key:0}),recentResult:async()=>null,
  answerUsedForOtherQuery:async(_p,{rawText,query})=>{asked.push(query);return rawText.includes('content cited by AI')?'how to get cited by AI':null},
  createCheck:async()=>{throw new Error('a refused start must not create a check')}};
 const s=app(store);t.after(()=>s.srv.close());
 const r=await s.post('/api/free-growth/admin/run',{url:'https://contentscale.site/',query:'content scaling',
  ai_answers:[{engine:'chatgpt',text:'ANSWER:\n'+CITED+'\n\nRESOURCES:\nhttps://developers.google.com/search/docs'}]},{'x-admin-key':'synthetic-owner-admin-key'});
 assert.equal(r.status,400);
 assert.match(r.body.error,/^ChatGPT Search: This answer is about another question\. It was saved for “how to get cited by AI”, not for “content scaling”\./);
 assert.deepEqual(asked,['content scaling']);
});
test('the public start does not look up historical questions without an authenticated research scope',async t=>{
 let reads=0;
 const store={ensureTables:async()=>{},usage:async()=>({by_email:1000,by_ip:0,total:0,by_key:0}),recentResult:async()=>null,
  answerUsedForOtherQuery:async()=>{reads++;return null;}};
 const s=app(store);t.after(()=>s.srv.close());
 const r=await s.post('/api/free-growth/checks',{key:'open-key-12345',url:'https://contentscale.site/',query:'content scaling',
  email:'owner@contentscale.site',consent:true,ai_answers:[{engine:'chatgpt',text:'ANSWER:'+CITED}]});
 assert.equal(r.status,429,'the request reaches the normal daily cap without consulting another customer');
 assert.equal(reads,0);
});
test('an answer with synonyms is still accepted: vocabulary alone never refuses',()=>{
 const v=ai.validateGrowthAnswer('Several roofers in New Jersey answer calls at night and tarp a leaking roof the same evening.','emergency roof repair nj','Who does emergency roof repair in NJ at night?');
 assert.equal(v.status,'valid');
 assert.equal(ai.validateGrowthAnswer(SCALING,'content scaling').status,'valid');
});
const DB=process.env.PREWRITE_E2E_DATABASE_URL||process.env.GROWTH_E2E_DATABASE_URL||'';
const local=/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
test('PostgreSQL: the same text saved for another question is found; the same question, or another text, is not',
 {skip:!local?'isolated PostgreSQL database not configured':false,timeout:30000},async()=>{
 const pg=require('pg'),store=require('../src/growth-free/store.cjs');
 const pool=new pg.Pool({connectionString:DB});const ids=[];
 try{
  await store.ensureTables(pool);
  const mk=async q=>{const c=await store.createCheck(pool,{email:'test@example.org',ipHash:'x',url:'https://example.org/p/',host:'example.org',query:q,marketingConsent:false,accessLabel:'test'});ids.push(c.id);return c};
  const a=await mk('how to get cited by AI'),b=await mk('content scaling');
  await pool.query('UPDATE growth_free_checks SET access_label=$2 WHERE id=$1',[a.id,'admin']);
  await store.saveAiAnswer(pool,{checkId:a.id,engine:'chatgpt',rawText:'  '+CITED+'\n',parsed:{}});
  assert.equal(await store.answerUsedForOtherQuery(pool,{checkId:b.id,rawText:CITED,query:'content scaling'}),null);
  assert.equal(await store.answerUsedForOtherQuery(pool,{checkId:b.id,rawText:CITED,query:'content scaling',owner:true}),'how to get cited by AI');
  assert.equal(await store.answerUsedForOtherQuery(pool,{checkId:b.id,rawText:CITED,query:'content scaling',inviteId:999999}),null);
  assert.equal(await store.answerUsedForOtherQuery(pool,{checkId:b.id,rawText:CITED,query:'How to get cited by AI ',owner:true}),null,'same question');
  assert.equal(await store.answerUsedForOtherQuery(pool,{checkId:b.id,rawText:SCALING,query:'content scaling',owner:true}),null,'another text');
  assert.equal(await store.answerUsedForOtherQuery(pool,{checkId:a.id,rawText:CITED,query:'content scaling',owner:true}),null,'its own check');
  await pool.query("UPDATE growth_free_checks SET access_label='invite: test', invite_id=$2 WHERE id=$1",[a.id,123]);
  assert.equal(await store.answerUsedForOtherQuery(pool,{checkId:b.id,rawText:CITED,query:'content scaling',inviteId:123}),'how to get cited by AI');
  assert.equal(await store.answerUsedForOtherQuery(pool,{checkId:b.id,rawText:CITED,query:'content scaling',inviteId:124}),null);
 }finally{if(ids.length)await pool.query('DELETE FROM growth_free_checks WHERE id=ANY($1)',[ids]);await pool.end()}
});

test('the browser keeps pasted answers per page and search term, and drops them when either changes',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../src/growth-free/routes.cjs'),'utf8');
 const mem=src.slice(src.indexOf("var MEM_AI='growthFreeFormAi';"),src.indexOf("var freeForm=document.getElementById('f');"));
 assert.match(mem,/url:u/,'stored with the page');
 assert.match(mem,/query:q\.trim\(\)/,'stored with the search term');
 assert.match(mem,/String\(m\.url\|\|''\)!==u/,'restored only for the same page');
 assert.match(mem,/function aiKeyChanged\(/);
 assert.match(src,/function rememberForm\(\)\{[^]*aiKeyChanged\(\)/,'a changed page or search term clears the answers instead of keeping them under the new one');
 const ft=require('../src/growth-free/form-texts.cjs');
 const all=JSON.stringify(ft);
 for(const s of ['AI answers removed: they belonged to another page or search term.','AI-antwoorden verwijderd: ze hoorden bij een andere pagina of zoekterm.','Respuestas de IA eliminadas: eran de otra página o de otro término de búsqueda.'])
  assert.ok(all.includes(s),'text: '+s);
});
