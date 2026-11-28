'use strict';
// Owner 2026-11-29, on the Spanish "seo checker" brief made on the English form:
// - "de es in de url is leidend, iemand die het niet op Spaans zet moet geen last hebben": es.contentscale.site (or /es/)
//   decides the brief's language and search country, whatever the form language and country say.
// - "er moet eerst voor copy brief of download iets staan zodat ik het kan lezen en begrijpen, want de copy is JSON":
//   Step 1 shows the brief in plain words before the copy and download buttons.
// - Seobility, Semrush and DebugBear stayed in the reader text: competitors named only in the AI answers were not
//   recognised. "Top Herramientas 2024" and a cut-off meta description ("¡Mejora tu.") were flagged but not repaired.
const test=require('node:test'),assert=require('node:assert/strict');
const crypto=require('node:crypto');
const path=require('node:path');
const express=require('express');
const request=require('supertest');
const {marketOf}=require('../src/free-prewrite.cjs');
const q=require('../src/prewrite-quality.cjs');

test('the market in the address leads: es./nl. subdomain or /es/ /nl/ path; otherwise none',()=>{
 assert.deepEqual(marketOf('https://es.contentscale.site/'),{language:'es',region:'es'});
 assert.deepEqual(marketOf('https://nl.contentscale.site/diensten/'),{language:'nl',region:'nl'});
 assert.deepEqual(marketOf('https://contentscale.site/es/precios/'),{language:'es',region:'es'});
 assert.deepEqual(marketOf('https://example.com/nl'),{language:'nl',region:'nl'});
 for(const u of ['https://contentscale.site/','https://espana.example/','https://example.com/esports/','https://en.example.com/','not a url'])assert.equal(marketOf(u),null,u);
});

const DB=process.env.PREWRITE_E2E_DATABASE_URL||process.env.GROWTH_E2E_DATABASE_URL||'';
const disposable=/^postgres(?:ql)?:\/\/[^@]+@(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(DB);
test('a brief for es.contentscale.site made on the English form with country US is researched in Spanish for Spain',{skip:!disposable&&'Requires disposable PostgreSQL',timeout:30000},async()=>{
 const {Pool}=require('pg');
 const schema='pw_market_'+crypto.randomBytes(6).toString('hex');
 const admin=new Pool({connectionString:DB});await admin.query('CREATE SCHEMA '+schema);
 const pool=new Pool({connectionString:DB,options:'-c search_path='+schema});
 const prev={...process.env};Object.assign(process.env,{FREE_PREWRITE_PER_WEEK:'0'});
 try{
  await pool.query(`CREATE TABLE prewrite_briefs (id SERIAL PRIMARY KEY, client_id INT, status TEXT, keyword TEXT, language TEXT, region TEXT,
   brief_json JSONB, created_at TIMESTAMP DEFAULT NOW(), public_site TEXT, public_access_hash TEXT UNIQUE)`);
  const {registerFreePrewrite}=require('../src/free-prewrite.cjs');
  let got;const done=new Promise(r=>{got=r});
  const app=express();app.use(express.json());
  registerFreePrewrite(app,pool,{dailyLimit:5,perWeek:0,generate:async x=>got(x),discover:async site=>({site,urls:[]})});
  for(const [website,lang,region,expect] of [['https://es.contentscale.site/','en','US',['es','es']]]){
   await request(app).post('/api/free-pre-write').set('Authorization','Bearer '+'b'.repeat(64))
    .send({website,keyword:'¿Qué seo checker gratis analiza el SEO de mi web?',email:'a@b.es',region,language:lang}).expect(202);
   const g=await done;
   assert.deepEqual([g.language,g.region],expect);
   const row=(await pool.query('SELECT language,region FROM prewrite_briefs')).rows[0];
   assert.deepEqual([row.language,row.region],expect);
  }
 }finally{process.env=prev;await pool.end();await admin.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await admin.end()}
});

test('competitors named only in the AI answers count as competitors; official tools and the own brand do not',()=>{
 const brands=q.competitorBrands({serpUrls:['https://ahrefs.com/x'],ownUrl:'https://es.contentscale.site/',
  aiCompanies:['Seobility','Semrush SEO Checker','DebugBear Free Website SEO Checker','Screaming Frog SEO Spider','Google Search Console','Google PageSpeed Insights','Bing Webmaster Tools','ContentScale','SEO']});
 const names=brands.map(b=>b.name);
 for(const n of ['seobility','semrush','debugbear','screamingfrog'])assert.ok(names.includes(n),n+' in '+names);
 for(const n of ['google','googlesearchconsole','bing','bingwebmastertools','contentscale','seo'])assert.ok(!names.includes(n),n);
 const brief={opening_passage:{direct_answer:'Herramientas como Seobility, Semrush SEO Checker, y DebugBear Free Website SEO Checker ofrecen análisis. Google Search Console es gratis.'},
  quick_facts:[{label:'Ejemplos de Herramientas',value:'Seobility, Semrush, DebugBear'}]};
 assert.deepEqual(q.competitorFields(brief,brands).sort(),['opening_passage','quick_facts']);
 q.scrubCompetitorSentences(brief,brands);
 assert.doesNotMatch(JSON.stringify(brief),/Seobility|Semrush|DebugBear/);
 assert.match(brief.opening_passage.direct_answer,/Google Search Console es gratis\./);
});

test('metadata: a stale year becomes this year; a cut-off meta description ends at its last full sentence',()=>{
 const meta={seo_title:'SEO Checker Gratis: Analiza tu Web | Top Herramientas 2024',
  meta_description:'Descubre los mejores SEO checkers gratuitos para analizar el SEO de tu web. Obtén informes detallados sobre on-page, técnico, velocidad y más. ¡Mejora tu.'};
 assert.deepEqual(q.metadataIssues(meta,'seo checker gratis',2026).sort(),['meta_description_incomplete','stale_year']);
 q.repairMetadata(meta,'seo checker gratis',2026);
 assert.equal(meta.seo_title,'SEO Checker Gratis: Analiza tu Web | Top Herramientas 2026');
 assert.equal(meta.meta_description,'Descubre los mejores SEO checkers gratuitos para analizar el SEO de tu web. Obtén informes detallados sobre on-page, técnico, velocidad y más.');
 assert.deepEqual(q.metadataIssues(meta,'seo checker gratis',2026),[]);
 const asked={seo_title:'Best tools 2024 compared',meta_description:'A short one about 2024 tools and what changed since then for owners.'};
 q.repairMetadata(asked,'best tools 2024',2026);
 assert.match(asked.seo_title,/2024/,'a year the topic asks for stays');
 const short={seo_title:'x',meta_description:'Too short. Cut off at the'};
 q.repairMetadata(short,'x',2026);assert.equal(short.meta_description,'Too short. Cut off at the','never shortened below 55 characters');
});

let chromium=null;try{({chromium}=require('playwright'))}catch{}
const KEY='c'.repeat(64);
const EDITOR={keyword:'¿Qué seo checker gratis analiza el SEO de mi web?',language:'es',
 content_decision:{recommended_treatment:'CREATE_NEW_PAGE',reason:'No page answers this yet.'},
 meta_package:{h1:'Analiza el SEO de tu web gratis',seo_title:'SEO Checker Gratis | ContentScale',meta_description:'Analiza gratis el SEO de tu web con el GRAAF ContentScore.',url_slug:'/seo-checker/'},
 search_intent:{primary:'transactional',secondary_intents:['commercial']},
 opening_passage:{direct_answer:'Con el SEO checker gratuito de ContentScale analizas tu web en un minuto.'},
 definitive_outline:[{h2:'¿Qué analiza un SEO checker?',purpose:'Explain what is checked.',target_words:300},{h2:'Cómo leer tu resultado',purpose:'Read the score.',target_words:200}],
 paa_questions:[{q:'¿Cómo puedo ver el SEO de mi página web?',a:'Con un checker.'}],
 internal_link_targets:[{anchor_text:'Servicios GEO',link_to:'https://es.contentscale.site/servicios/'}],
 fact_safety:{verify_first:['The tool’s limits per day.']},
 action_plan:[{step:1,action:'Create the page with the H1.'}]};
function app(){const a=express();a.use(express.json());a.use(express.static(path.join(__dirname,'..','public')));
 const {registerFreePrewrite}=require('../src/free-prewrite.cjs');registerFreePrewrite(a,{query:()=>{throw Error('no database')}});return a}
test('Step 1 shows the brief in plain words before Copy brief and Download',{skip:!chromium&&'Playwright not installed',timeout:60000},async()=>{
 const srv=app().listen(0),base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/free-pre-write/result',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,status:'open',language:'es',region:'es',
   website:'https://es.contentscale.site/',keyword:EDITOR.keyword,target:{mode:'CREATE',url:'https://es.contentscale.site/seo-checker/'},instructions:'CREATE https://es.contentscale.site/seo-checker/',brief:{search_intent:EDITOR.search_intent}})}));
  await page.route('**/api/free-pre-write/implementation-report',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({success:true,history:[],editor_brief:EDITOR})}));
  await page.goto(base+'/free-pre-write/r?lang=nl#'+KEY);
  const box=page.locator('#brief-readable');await box.waitFor({state:'visible'});
  const y=async s=>(await page.locator(s).boundingBox()).y;
  assert.ok(await y('#brief-readable')<await y('#copy-brief'),'readable brief above the buttons');
  const text=await box.innerText();
  for(const s of ['Nieuwe pagina','https://es.contentscale.site/seo-checker/','Analiza el SEO de tu web gratis','SEO Checker Gratis | ContentScale',
   'Analiza gratis el SEO de tu web con el GRAAF ContentScore.','Con el SEO checker gratuito de ContentScale','¿Qué analiza un SEO checker?','ca. 300 woorden',
   '¿Cómo puedo ver el SEO de mi página web?','Servicios GEO','https://es.contentscale.site/servicios/','The tool’s limits per day.','Create the page with the H1.'])
   assert.ok(text.includes(s),s);
  assert.doesNotMatch(text,/[{}"]/,'no JSON in the readable brief');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();srv.close()}
});
