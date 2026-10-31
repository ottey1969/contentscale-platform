'use strict';
// Contract: Free Growth = the automatic Growth research, available on its own, without Tracker registration.
// One engine, two workflows: given the same public page, search term and search results, the Free check and the
// Tracker research produce the same research (results used, pages read, decision, gap list, evidence outcome).
// Only access, storage and follow-up differ; the Free check never writes anything to the Tracker.
// LABELLED SYNTHETIC: the pages, search results and search term (an engine-equivalence test, not production evidence).
const test=require('node:test'),assert=require('node:assert/strict');
const {runFreeGrowthResearch}=require('../src/growth-free/engine.cjs');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const {buildGapList}=require('../src/growth-gap-list.cjs');
const {summarizeFreeGrowth}=require('../src/growth-free/summary.cjs');

const URL_='https://acme-roofing.example/roof-repair-lodi-nj/',QUERY='roof repair lodi nj';
const own='<html><head><title>Roof Repair in Lodi, NJ</title></head><body><h1>Roof Repair in Lodi, NJ</h1><h2>Our roof repair services</h2><p>Our crew repairs leaking roofs, replaces damaged tiles and seals flashing for homes in Lodi and nearby towns, and we explain every repair we recommend before we start working on your property.</p><h2>Why homeowners call us</h2><p>We are licensed and insured in New Jersey, and we send a technician to look at the damage after you call us about a leak, so you know what is wrong with the roof before you decide anything.</p></body></html>';
const para='A repair estimate lists materials, labour and access. The estimate should explain how hidden decking damage changes the estimate, and a written estimate lets you compare quotes from different crews before you approve any work on the property.';
// Long enough to pass the readable-article check (a short page is not a comparable article).
const comp=(h,rows)=>'<html><body><article><h1>'+h+'</h1>'+rows.map(x=>'<h2>'+x+'</h2>'+[1,2,3,4].map(()=>'<p>'+para+'</p>').join('')).join('')+'</article></body></html>';
const allPages={[URL_]:own,'https://roofer-a.example/roof-repair-nj/':comp('Roof repair in Paterson, NJ',['How a repair estimate is built','When a roof needs flashing work']),
 'https://roofer-b.example/services/roof-repair/':comp('Roof repairs in Bergen County, NJ',['What goes into an estimate'])};
const leads=[['https://roofer-a.example/roof-repair-nj/','Roof Repair in Paterson, NJ | Roofer A'],['https://roofer-b.example/services/roof-repair/','Roof Repairs in Bergen County NJ - Roofer B'],
 ['https://roofer-c.example/near-me/','Emergency Roof Repair Near Me | Roofer C']].map(([url,title],i)=>({url,title,snippet:'Local roof repair',source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}));
const deps=pages=>({retryDelayMs:0,judgeTasks:require('./helpers/meaning-check-stand-in.cjs').judgeTasks,
 fetchLive:async url=>{const html=pages[url];if(!html)throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});return {html,final_url:url,retrieved_at:'2026-10-30T10:00:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
 searchLive:async({query})=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query,leads,organic_titles:leads.map(l=>({title:l.title,host:new URL(l.url).hostname,url:l.url})),provider_attempts:['SERPER_GOOGLE_ORGANIC'],checked_at:'2026-10-30T10:00:00Z'})});

// The Tracker research for the same page: a Tracker client that has only this page (no GSC, history or AI evidence).
async function trackerResearch(d){
 const route={},sql=[];
 const pool={query:async q=>{sql.push(q);
  if(q.includes('LEFT(html_content')&&/FROM tracker_pages\b/.test(q))return {rows:[{id:7,tracker_client_id:3,url:URL_,keyword:QUERY,brief_content:null,saved_html:null}]};
  return {rows:[]}}};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h}},pool,(req,res,next)=>{req.growthTrackerClientId=3;req.growth={can_edit:false,pages:[{id:7,url:URL_,keyword:QUERY,case_study_active:false}]};next()},d);
 const req={params:{token:'t'},query:{page_id:'7'}},res={statusCode:200,status(c){this.statusCode=c;return this},set(){return this},json(b){this.body=b;return this}};
 const stack=route['/api/tracker-client/:token/growth/auto-research'];
 await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});
 return {report:res.body,sql};
}
const core=r=>{const g=buildGapList(r);return {
 leads:(r.search_discovery?.leads||[]).map(l=>l.url),read:(r.search_discovery?.competitor_fetch_log||[]).map(x=>x.url+'|'+x.outcome),
 decision:r.editorial_decision_gate?.decision,blocker:r.editorial_decision_gate?.blocker_code||null,intent:r.serp_intent?.intent,
 tasks:(r.reader_task_coverage?.tasks||[]).map(t=>t.code+'|'+(t.destination?.status||'')),
 gaps:g.items.map(x=>x.group+'|'+x.title+'|'+(x.priority?.suggested_action||'')),evidence:g.evidence.status,writing_allowed:g.writing_allowed}};

test('same page, search term and results: the Free check and the Tracker research reach the same research and decision',async()=>{
 const free=await runFreeGrowthResearch({url:URL_,query:QUERY},deps(allPages));
 assert.equal(free.statusCode,200);
 const tracker=await trackerResearch(deps(allPages));
 assert.deepEqual(core(free.report),core(tracker.report));
 assert.deepEqual(free.report.serp_titles,tracker.report.serp_titles,'what Google shows by title is the same in both');assert.equal(free.report.serp_titles.titles_seen,3);
 assert.equal(core(free.report).evidence,'ENOUGH_EVIDENCE');assert(core(free.report).gaps.length>0,'a real comparison, not two empty results');assert.equal(core(free.report).read.filter(x=>/READABLE$/.test(x)&&!/NOT_READABLE/.test(x)).length,2);
 assert(!tracker.sql.some(q=>/^\s*(INSERT|UPDATE|DELETE)/i.test(q)),'the research itself writes nothing');
});

test('too little evidence: both workflows block proposals and writing the same way, and the Free result says so once',async()=>{
 const one={[URL_]:own,'https://roofer-a.example/roof-repair-nj/':allPages['https://roofer-a.example/roof-repair-nj/']};
 const free=await runFreeGrowthResearch({url:URL_,query:QUERY},deps(one));
 const tracker=await trackerResearch(deps(one));
 assert.deepEqual(core(free.report),core(tracker.report));
 const c=core(free.report);assert.equal(c.evidence,'INSUFFICIENT_EVIDENCE');assert.equal(c.writing_allowed,false);
 assert(c.gaps.filter(x=>!/^PAGE_ELEMENT/.test(x)).every(x=>/No section proposed/.test(x)),'no "Add a new section" under "not enough evidence"');
 const s=summarizeFreeGrowth({report:free.report,query:QUERY});
 assert.equal(s.gaps.writing_allowed,false);assert.equal(s.gaps.recommended.length,0);
});

test('the Free check never writes to the Tracker: its data source refuses every write',async()=>{
 const {readOnlySource}=require('../src/growth-free/engine.cjs');
 const src=readOnlySource({url:URL_,keyword:QUERY});
 for(const q of ['INSERT INTO tracker_clients VALUES (1)','INSERT INTO tracker_pages VALUES (1)','UPDATE tracker_pages SET url=1','DELETE FROM tracker_case_studies','CREATE TABLE x(a int)'])
  await assert.rejects(src.query(q),/READ_ONLY/);
});
