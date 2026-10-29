'use strict';
const assert=require('node:assert/strict');
const {computeGrowth,registerGrowthCockpit}=require('../src/tracker-growth-cockpit.cjs');
const {assessGrowthCandidates,redirectInfo}=require('../src/tracker-growth-best-candidate.cjs');
const {windowDates}=require('../src/tracker-growth-measurement.cjs');
// Relative to the real clock: the route handler measures against "now".
const now=new Date(),DAY=86400000,ago=d=>new Date(now.getTime()-d*DAY).toISOString();
const at=ago(1);
const pages=[
 {id:1,url:'https://site.example/protected/',keyword:'protected',case_study_active:true},
 {id:2,url:'https://site.example/old-address/',keyword:'old',redirects_to:'https://site.example/final-page/'},
 {id:3,url:'https://site.example/final-page/',keyword:'final'},
 {id:4,url:'https://site.example/just-changed/',keyword:'changed'},
 {id:5,url:'https://site.example/winner/',keyword:'winner'},
 {id:6,url:'https://site.example/open-best/',keyword:'open'},
 {id:7,url:'https://site.example/open-second/',keyword:'second'},
 {id:8,url:'https://site.example/gone/',keyword:'gone',redirects_to:'(dead 404 — page not found)'}
];
const q=(page_id,query,impressions,clicks,position)=>({page_id,query,impressions,clicks,position,evidence_scope:'page_verified',imported_at:at});
const queries=[
 q(1,'protected topic guide',9000,3,14),
 q(2,'old address topic',8000,2,15),
 q(4,'recently changed topic',7000,1,16),
 q(8,'missing page topic',6500,0,18),
 q(5,'winning topic',6000,900,1.8),
 q(6,'open best topic',3000,2,12),
 q(7,'open second topic',1000,1,25)
];
const publications=[
 {id:41,tracker_page_id:4,query:'recently changed topic',notes:'x',published_at:ago(10)},
 {id:42,tracker_page_id:7,query:'open second topic',notes:'y',published_at:ago(90)}
];
const w=windowDates(publications[1].published_at);
const windows=[
 {publication_id:42,period:'before',start_date:w.before.start,end_date:w.before.end,clicks:3,impressions:800},
 {publication_id:42,period:'after',start_date:w.after.start,end_date:w.after.end,clicks:9,impressions:950}
];

assert.deepEqual(redirectInfo('https://a.example/x/'),{kind:'OLD_ADDRESS',final_url:'https://a.example/x/'});
assert.equal(redirectInfo('(corrected duplicate → https://a.example/y/)').final_url,'https://a.example/y/');
assert.equal(redirectInfo('(dead 410 — gone)').kind,'PAGE_GONE');
assert.equal(redirectInfo(null),null);

const growth=computeGrowth(pages,queries,'site.example',now);
const out=assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages});
const by=t=>out.query_opportunities.find(x=>x.query===t);
// The highest raw scores are all rows a non-expert must NOT start with.
assert.equal(by('protected topic guide').eligibility.status,'PROTECTED');
assert.equal(by('old address topic').eligibility.status,'OLD_ADDRESS');
assert.equal(by('old address topic').eligibility.final_page_id,3,'Point to the tracked final page of the 301');
assert.match(by('old address topic').eligibility.label,/one page, not duplicate content/);
assert.equal(by('recently changed topic').eligibility.status,'JUST_CHANGED');
assert.match(by('recently changed topic').measurement.label,/Wait 18 more days/);
assert.equal(by('missing page topic').eligibility.status,'PAGE_GONE');
assert.equal(by('winning topic').eligibility.status,'WORKING');
assert.ok(by('protected topic guide').priority_score>by('open best topic').priority_score);

const best=out.best_candidate;
assert.equal(best.page_id,6);
assert.equal(best.query,'open best topic');
assert.equal(best.runner_up.query,'open second topic');
assert.match(best.reasons[0],/3,000 times .*only 2 clicks/);
assert.match(best.reasons[1],/Google page 2/);
assert.match(best.reasons[2],/not a protected Case Study/);
assert.deepEqual(out.skipped,{PROTECTED:1,OLD_ADDRESS:1,JUST_CHANGED:1,PAGE_GONE:1,WORKING:1});

// Measured result is shown, from explicit equal windows only.
const second=by('open second topic');
assert.equal(second.measurement.status,'COMPARABLE_USER_PROVIDED_GSC');
assert.match(second.measurement.label,/clicks 3 → 9 \(\+6\)/);
assert.deepEqual(out.measurement_summary,{recorded:2,waiting:1,needs_numbers:0,measured:1,measured_click_change:6});

// Nothing open: say so plainly instead of pushing a protected page.
const allLocked=computeGrowth(pages.map(p=>({...p,case_study_active:true})),queries,'site.example',now);
const none=assessGrowthCandidates(allLocked,{now,pageRows:pages});
assert.equal(none.best_candidate,null);
assert.match(none.no_candidate_reason,/Nothing needs to be changed right now/);
// No GSC at all: honest that demand is unknown.
const noGsc=assessGrowthCandidates(computeGrowth(pages,[],'site.example',now),{now,pageRows:pages});
assert.equal(noGsc.best_candidate,null);
assert.match(noGsc.no_candidate_reason,/no Search Console data yet/);
// Page-level saved GSC totals only: still chooses the unlocked page with the clearest gap.
const pageLevel=[{id:10,url:'https://site.example/a/',gsc_impressions:5000,gsc_clicks:1,gsc_position:30,case_study_active:true},
 {id:11,url:'https://site.example/b/',gsc_impressions:900,gsc_clicks:0,gsc_position:28}];
const pl=assessGrowthCandidates(computeGrowth(pageLevel,[],'site.example',now),{now,pageRows:pageLevel});
assert.equal(pl.best_candidate.page_id,11);
assert.equal(pl.best_candidate.basis,'SAVED_PAGE_LEVEL_GSC');

// ---- Server-side memory: the system learns from what happened before ----
const mem=(o)=>({query_key:'',query:'',status:'STARTED',system_choice:false,snapshot:{},...o});
const memory=[
 mem({tracker_page_id:6,query_key:'open best topic',query:'open best topic',status:'SKIPPED',skipped_at:ago(3),skip_reason:'we do not offer this'}),
];
let m1=assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages,memory});
assert.equal(m1.query_opportunities.find(x=>x.query==='open best topic').eligibility.status,'SKIPPED_BY_OWNER');
assert.match(m1.query_opportunities.find(x=>x.query==='open best topic').eligibility.label,/we do not offer this/);
assert.equal(m1.best_candidate.query,'open second topic','a skipped suggestion is replaced by the next safe one');
// Research said NO_CHANGE: not suggested again for 90 days ...
const noChange=[mem({tracker_page_id:6,query_key:'open best topic',query:'open best topic',status:'RESEARCHED',system_choice:true,
 started_at:ago(5),researched_at:ago(5),research_decision:'NO_CHANGE',snapshot:{impressions:2900,clicks:2,position:12}})];
m1=assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages,memory:noChange});
assert.equal(m1.query_opportunities.find(x=>x.query==='open best topic').eligibility.status,'NO_CHANGE_FOUND');
// pg returns timestamptz columns as Date objects: dates must still be shown.
const pgRow=[{...noChange[0],started_at:new Date(ago(5)),researched_at:new Date(ago(5))}];
const pgView=assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages,memory:pgRow});
assert.match(pgView.query_opportunities.find(x=>x.query==='open best topic').eligibility.label,/^Research on \d{4}-\d{2}-\d{2} found .* after \d{4}-\d{2}-\d{2},/);
assert.match(pgView.history[0].date,/^\d{4}-\d{2}-\d{2}$/);
assert.equal(m1.best_candidate.query,'open second topic');
assert.equal(m1.track_record.no_change,1);
assert.equal(m1.history[0].outcome,'Research: no change needed');
// ... unless Google demand doubled since that research.
noChange[0].snapshot.impressions=1400;
m1=assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages,memory:noChange});
assert.equal(m1.best_candidate.query,'open best topic');
// ... or 90 days passed.
noChange[0].snapshot.impressions=2900;noChange[0].researched_at=ago(91);
m1=assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages,memory:noChange});
assert.equal(m1.best_candidate.query,'open best topic');
// DATA_BLOCKED: retried after 7 days, not before.
const blocked=[mem({tracker_page_id:6,query_key:'open best topic',status:'RESEARCHED',researched_at:ago(2),research_decision:'DATA_BLOCKED',research_blocker:'INSUFFICIENT_COMPETITOR_EVIDENCE'})];
m1=assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages,memory:blocked});
assert.equal(m1.query_opportunities.find(x=>x.query==='open best topic').eligibility.status,'RESEARCH_BLOCKED');
assert.match(m1.query_opportunities.find(x=>x.query==='open best topic').eligibility.label,/insufficient competitor evidence/);
blocked[0].researched_at=ago(8);
assert.equal(assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages,memory:blocked}).best_candidate.query,'open best topic');
// Research found an improvement but nothing was published: finish that first, even above higher scores.
const found=[mem({tracker_page_id:7,query_key:'open second topic',query:'open second topic',status:'RESEARCHED',system_choice:true,
 started_at:ago(4),researched_at:ago(4),research_decision:'IMPROVE_EXISTING',snapshot:{impressions:1000,clicks:1,position:25}})];
m1=assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages,memory:found});
assert.equal(m1.best_candidate.basis,'FINISH_STARTED_WORK');
assert.equal(m1.best_candidate.page_id,7);
assert.match(m1.best_candidate.reasons[1],/not been published yet/);
assert.equal(m1.best_candidate.runner_up.query,'open best topic');
// Once a publication is recorded after the research, it waits for measurement instead.
const pubs=[...publications,{id:43,tracker_page_id:7,query:'open second topic',notes:'z',published_at:ago(2)}];
m1=assessGrowthCandidates(growth,{publications:pubs,windows,now,pageRows:pages,memory:found});
assert.equal(m1.query_opportunities.find(x=>x.query==='open second topic').eligibility.status,'JUST_CHANGED');
assert.equal(m1.best_candidate.query,'open best topic');
assert.equal(m1.track_record.published,1);
assert.match(m1.history[0].outcome,/Wait 26 more days/);
// The system's own choices are measured separately.
const measuredChoice=[mem({tracker_page_id:7,query_key:'open second topic',query:'open second topic',system_choice:true,started_at:ago(100)})];
m1=assessGrowthCandidates(growth,{publications,windows,now,pageRows:pages,memory:measuredChoice});
assert.equal(m1.track_record.system_choices_measured,1);
assert.equal(m1.track_record.system_choices_click_change,6);

const routes={},seen=[];
const writes=[];
registerGrowthCockpit({get(path,...h){routes[path]=h},post(path,...h){routes['POST '+path]=h}},{query:async(sql,args)=>{
 seen.push(sql);
 if(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE)\b/i.test(sql)){writes.push({sql,args});
  if(/^\s*INSERT INTO tracker_growth_recommendations/.test(sql))return {rows:[{id:1,status:/'SKIPPED'/.test(sql)?'SKIPPED':'STARTED'}]};
  return {rows:[]};
 }
 if(sql.includes('FROM tracker_growth_recommendations'))return {rows:[]};
 if(sql.includes('FROM tracker_clients'))return {rows:[{id:9,domain:'site.example',token:'owner',status:'active'}]};
 if(sql.includes('FROM tracker_pages p'))return {rows:pages};
 if(sql.includes('FROM tracker_gsc_queries q'))return {rows:queries};
 if(sql.includes('FROM tracker_growth_publications'))return {rows:publications};
 if(sql.includes('FROM tracker_growth_gsc_windows'))return {rows:windows};
 throw Error('Unexpected SQL '+sql.slice(0,60));
}});
(async()=>{
 const h=routes['/track/:token/growth'];
 const req={params:{token:'owner'}},res={set(){return this},type(){return this},send(x){this.html=x}};
 await h[0](req,res,()=>h[1](req,res));
 const html=res.html;
 assert.match(html,/Start here — the system's choice/);
 assert.match(html,/<h2>“open best topic”<\/h2>/);
 assert.match(html,/class="go start-rec" href="\/track\/owner\/growth\/auto-research\?page_id=6" data-page="6" data-query="open best topic"/);
 assert.match(html,/Not relevant for my business\? Skip it/);
 assert.match(html,/What the system remembers/);
 // Every inline script must compile (a syntax error would silently disable the buttons).
 for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new (require('node:vm').Script)(m[1]);
 assert.match(html,/★ Start here<\/span><strong>open best topic/);
 assert.match(html,/Protected — do not change/);
 assert.match(html,/Old address \(redirect\)/);
 assert.match(html,/Research the final page instead/);
 assert.match(html,/Working — leave it/);
 assert.match(html,/Wait 18 more days/);
 assert.match(html,/Changes measured<strong>1 of 2<\/strong>/);
 assert.match(html,/Not chosen first: [^<]*1 protected Case Study row/);
 assert.ok(seen.some(s=>s.includes('p.redirects_to')));
 assert.equal(writes.length,0,'viewing the Cockpit never writes');
 const post=(token,body)=>new Promise((ok,bad)=>{const h=routes['POST /api/tracker-client/:token/growth/recommendation'];
  const rq={params:{token},body},rs={statusCode:200,status(c){this.statusCode=c;return this},set(){return this},json(x){this.body=x;ok(this);return this}};
  Promise.resolve(h[0](rq,rs,()=>h[1](rq,rs))).catch(bad)});
 // The ownership check comes from the tracker token, not from the browser.
 const readOnly=await post('shared-readonly',{action:'skip',page_id:6,query:'open best topic'});
 assert.equal(readOnly.statusCode,403);
 assert.equal(writes.length,0);
 const ownerOnly=await post('owner',{action:'start',page_id:6,query:'open best topic'});
 assert.equal(ownerOnly.statusCode,200);
 assert.equal(ownerOnly.body.system_choice,true);
 assert.equal(ownerOnly.body.research_url,'/track/owner/growth/auto-research?page_id=6');
 const ins=writes.find(w=>/INSERT INTO tracker_growth_recommendations/.test(w.sql));
 assert.deepEqual(ins.args.slice(0,5),[9,6,'open best topic','open best topic',true]);
 const snap=JSON.parse(ins.args[5]);
 assert.equal(snap.impressions,3000);assert.equal(snap.clicks,2);assert.equal(snap.basis,'VERIFIED_PAGE_QUERY_GSC');
 const invented=await post('owner',{action:'start',page_id:6,query:'a query nobody searched'});
 assert.equal(invented.statusCode,404);
 const badAction=await post('owner',{action:'publish',page_id:6});
 assert.equal(badAction.statusCode,400);
 const api=routes['/api/tracker-client/:token/growth'];
 const r2={json(x){this.body=x}};
 await api[0](req,r2,()=>api[1](req,r2));
 assert.equal(r2.body.best_candidate.page_id,6);
 console.log('PASS Growth Cockpit picks one safe best candidate, explains skips and shows measurement');
})().catch(e=>{console.error(e);process.exitCode=1});
