'use strict';
// End-to-end chain on a REAL PostgreSQL database and real HTTP routes:
// owner research -> checked proposal stored -> CMS page loads that proposal -> reviewed package (JSON + ZIP)
// -> actual publication recorded without GSC -> Cockpit "recently changed" -> 28-day before/after measurement.
// Only the outside world is stubbed: the public pages, the search provider and the AI writer. All pages, leads
// and numbers are SYNTHETIC test input. The live page is never written: the stubs only serve GET-style reads.
// Runs only against a dedicated test database (GROWTH_E2E_DATABASE_URL, name must contain "test" or "e2e").
const test=require('node:test'),assert=require('node:assert/strict');
const DB=process.env.GROWTH_E2E_DATABASE_URL||'';
const dbName=(()=>{try{return new URL(DB).pathname.slice(1)}catch{return ''}})();
const enabled=!!DB&&/test|e2e/i.test(dbName);
if(!enabled)test('growth CMS chain (PostgreSQL)',{skip:'set GROWTH_E2E_DATABASE_URL to a dedicated test database'},()=>{});
else{
const {Pool}=require('pg'),express=require('express');
const {createHash}=require('node:crypto');
const {registerGrowthCockpit}=require('../src/tracker-growth-cockpit.cjs');
const {registerGrowthExecution}=require('../src/tracker-growth-execution.cjs');
const {registerGrowthMeasurement}=require('../src/tracker-growth-measurement.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const HOME='https://acme-roofing.example',URL_=HOME+'/roof-repair-lodi-nj/',LOCKED_URL=HOME+'/roof-repair-case-study/';
const ownHtml=(h1)=>'<html><head><title>'+h1+' | Acme Roofing</title></head><body><h1>'+h1+'</h1>'+
 '<h2>Our roof repair services</h2><p>Our crew repairs leaking roofs, replaces damaged tiles and seals flashing for homes in Lodi and nearby towns, and we explain every repair we recommend before we start working on your property.</p>'+
 '<h2>Why homeowners call us</h2><p>We are licensed and insured in New Jersey, and we send a technician to look at the damage after you call us about a leak, so you know what is wrong with the roof before you decide anything.</p></body></html>';
const OWN=ownHtml('Roof Repair in Lodi, NJ'),LOCKED=ownHtml('Roof Repair in Lodi, NJ: case study');
const comp=(h,rows)=>'<html><body><article><h1>'+h+'</h1>'+rows.map(([a,b])=>'<h2>'+a+'</h2><p>'+b+'</p>').join('')+'</article></body></html>';
const estimateA='A repair estimate lists materials, labour and access. The estimate should explain how hidden decking damage changes the estimate, and a written estimate lets you compare quotes from different crews before you approve any work on the property, which is why each estimate should be itemised clearly.';
const estimateB='Ask the contractor for a written estimate that separates materials from labour. A clear estimate also states what happens if hidden damage appears, so the final invoice never surprises you after the old layer is removed from the roof, and an itemised estimate makes that comparison easy.';
const pages={[URL_]:OWN,[LOCKED_URL]:LOCKED,
 'https://roofer-a.example/roof-repair-nj/':comp('Roof repair in Paterson, NJ',[['How a repair estimate is built',estimateA]]),
 'https://roofer-b.example/services/roof-repair/':comp('Roof repairs in Bergen County, NJ',[['What goes into an estimate',estimateB]])};
const leads=[['https://roofer-a.example/roof-repair-nj/','Roof Repair in Paterson, NJ | Roofer A'],['https://roofer-b.example/services/roof-repair/','Roof Repairs in Bergen County NJ - Roofer B'],
 ['https://roofer-c.example/near-me/','Emergency Roof Repair Near Me | Roofer C'],['https://roofer-d.example/hackensack/','Roof Repair Contractors in Hackensack, NJ']]
 .map(([url,title],i)=>({url,title,snippet:'Local roof repair',source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}));
const DRAFT={h2:'How to read a roof repair estimate',paragraphs:['A written estimate should list the materials, the labour and any special access the crew needs, so ask for every line before you approve the work and ask how the estimate changes if hidden damage is found.',
 'We are licensed and insured in New Jersey, and we send a technician to look at the damage first, so the estimate you receive is based on what we actually saw on your roof.']};
const outbound=[],searches=[],aiCalls=[];
const fetchLive=async(url,opts)=>{outbound.push({url,method:(opts&&opts.method)||'GET'});const html=pages[url];
 if(!html)throw Object.assign(Error('unavailable'),{code:'PUBLIC_HTML_UNAVAILABLE'});
 return {html,final_url:url,retrieved_at:new Date().toISOString(),truncated:false,source:'LIVE_PUBLIC_HTTPS'}};
const searchLive=async(args)=>{searches.push(args);return {status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query:'roof repair lodi nj',leads,provider_attempts:['SERPER_GOOGLE_ORGANIC'],checked_at:new Date().toISOString()}};
const generateDraft=async(args)=>{aiCalls.push(args.pageUrl);return {status:'AI_DRAFT_REVIEW_REQUIRED',draft:{seo_title:null,meta_description:null,sections:[DRAFT]}}};

let pool,server,base,ids={};
const SCHEMA=`
CREATE TABLE tracker_clients(id BIGSERIAL PRIMARY KEY,name TEXT,domain TEXT NOT NULL,token TEXT UNIQUE,readonly_token TEXT UNIQUE,status TEXT);
CREATE TABLE tracker_pages(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT NOT NULL,url TEXT NOT NULL,keyword TEXT,redirects_to TEXT,
 gsc_impressions INTEGER,gsc_clicks INTEGER,gsc_position NUMERIC,brief_content JSONB,html_content TEXT);
CREATE TABLE tracker_case_studies(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT NOT NULL,tracker_page_id BIGINT NOT NULL,status TEXT);
CREATE TABLE tracker_gsc_queries(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT,page_id BIGINT,source_page_url TEXT,evidence_scope TEXT,query TEXT,
 clicks INTEGER,impressions INTEGER,position NUMERIC,imported_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE tracker_snapshots(id BIGSERIAL PRIMARY KEY,page_id BIGINT,checked_at TIMESTAMPTZ,google_competitors JSONB,ai_perplexity_competitors JSONB);
CREATE TABLE tracker_ai_evidence(id BIGSERIAL PRIMARY KEY,page_id BIGINT,tracker_client_id BIGINT,engine TEXT,evidence_method TEXT,brand_recommended BOOLEAN,
 domain_cited BOOLEAN,exact_page_cited BOOLEAN,citation_urls JSONB,verified_at TIMESTAMPTZ,revision_cycle INTEGER,is_cleared BOOLEAN);`;
const TABLES=['tracker_clients','tracker_pages','tracker_case_studies','tracker_gsc_queries','tracker_snapshots','tracker_ai_evidence',
 'tracker_growth_proposals','tracker_growth_publications','tracker_growth_gsc_windows','tracker_growth_recommendations'];

test.before(async()=>{
 pool=new Pool({connectionString:DB});
 await pool.query('DROP TABLE IF EXISTS '+TABLES.join(',')+' CASCADE');
 await pool.query(SCHEMA);
 const c=(await pool.query("INSERT INTO tracker_clients(name,domain,token,readonly_token) VALUES ('Acme','acme-roofing.example','owner-tok','share-tok') RETURNING id")).rows[0];
 ids.client=Number(c.id);
 ids.page=Number((await pool.query('INSERT INTO tracker_pages(tracker_client_id,url,keyword,html_content) VALUES ($1,$2,$3,$4) RETURNING id',[c.id,URL_,'roof repair lodi nj',OWN])).rows[0].id);
 const app=express();app.use(express.json({limit:'2mb'}));
 registerGrowthCockpit(app,pool,{research:{fetchLive,searchLive,retryDelayMs:0,...require('./helpers/meaning-check-stand-in.cjs').meaningStandIn,},cms:{fetchLive,generateDraft}});
 registerGrowthExecution(app,pool);registerGrowthMeasurement(app,pool);
 await new Promise(ok=>{server=app.listen(0,'127.0.0.1',ok)});
 base='http://127.0.0.1:'+server.address().port;
});
test.after(async()=>{await new Promise(ok=>server?server.close(ok):ok());await pool?.end()});

const api=async(method,path,body)=>{
 const r=await fetch(base+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const type=r.headers.get('content-type')||'';
 return {status:r.status,type,body:type.includes('json')?await r.json():type.includes('zip')?Buffer.from(await r.arrayBuffer()):await r.text()};
};
const pageHtml=async id=>(await pool.query('SELECT html_content FROM tracker_pages WHERE id=$1',[id])).rows[0].html_content;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const sectionHtml=s=>'<section><h2>'+esc(s.h2)+'</h2>'+String(s.text).split(/\n\s*\n/).map(t=>'<p>'+esc(t.trim())+'</p>').join('\n')+'</section>';
let research,proposal,publication;

test('1. owner research produces a checked edit and stores it as the proposal for that page',async()=>{
 const r=await api('POST','/api/tracker-client/owner-tok/growth/auto-research/complete?page_id='+ids.page,{page_id:ids.page});
 assert.equal(r.status,200,JSON.stringify(r.body).slice(0,400));research=r.body;
 const d=r.body.editorial_decision_gate;
 assert.equal(d.decision,'IMPROVE_EXISTING',JSON.stringify({b:d.blocker_code,m:d.missing_evidence,s:r.body.search_discovery&&r.body.search_discovery.status,f:r.body.search_discovery&&r.body.search_discovery.competitor_fetch_log}).slice(0,1500));assert.equal(d.copy_ready,true,JSON.stringify(d.draft_rejections||d.copy_status));
 assert.equal(d.publish_allowed,false);
 assert.equal(searches.length<=2,true,'at most two paid search calls per run');
 assert.equal(r.body.cms_handoff.target_page_id,ids.page);
 assert.equal(r.body.cms_handoff.url,'/track/owner-tok/growth/cms-export?page_id='+ids.page);
 const rows=(await pool.query('SELECT * FROM tracker_growth_proposals')).rows;
 assert.equal(rows.length,1);assert.equal(Number(rows[0].id),r.body.cms_handoff.proposal_id);
 assert.equal(rows[0].target_url,URL_);assert.equal(rows[0].decision,'IMPROVE_EXISTING');
 assert.equal(rows[0].sections[0].h2,d.draft_heading);assert.equal(rows[0].sections[0].text,d.proposed_text);
 assert.deepEqual(rows[0].sections[0].placement,{mode:d.placement.mode,section_heading:d.placement.section_heading});
 assert.equal(await pageHtml(ids.page),OWN,'research never changes the stored page');
});

test('2. a protected Case Study page gets research but never a stored proposal',async()=>{
 ids.locked=Number((await pool.query('INSERT INTO tracker_pages(tracker_client_id,url,keyword,html_content) VALUES ($1,$2,$3,$4) RETURNING id',[ids.client,LOCKED_URL,'roof repair lodi nj',LOCKED])).rows[0].id);
 await pool.query("INSERT INTO tracker_case_studies(tracker_client_id,tracker_page_id,status) VALUES ($1,$2,'active')",[ids.client,ids.locked]);
 const r=await api('POST','/api/tracker-client/owner-tok/growth/auto-research/complete?page_id='+ids.locked,{page_id:ids.locked});
 assert.equal(r.status,200);
 assert.notEqual(r.body.cms_handoff&&r.body.cms_handoff.target_page_id,ids.locked);
 assert.equal((await pool.query('SELECT 1 FROM tracker_growth_proposals WHERE target_page_id=$1',[ids.locked])).rows.length,0);
 assert.equal((await api('GET','/api/tracker-client/owner-tok/growth/cms-export/proposal?page_id='+ids.locked)).status,409);
 assert.equal(await pageHtml(ids.locked),LOCKED);
});

test('3. the CMS page loads exactly that proposal (owner link only)',async()=>{
 assert.equal((await api('GET','/api/tracker-client/share-tok/growth/cms-export/proposal?page_id='+ids.page)).status,403);
 const page=await api('GET','/track/owner-tok/growth/cms-export?page_id='+ids.page);
 assert.equal(page.status,200);assert.match(page.body,/id="growthProposal"/);assert.match(page.body,/id="publicationForm"/);
 const r=await api('GET','/api/tracker-client/owner-tok/growth/cms-export/proposal?page_id='+ids.page);
 assert.equal(r.status,200);proposal=r.body.proposal;
 const newest=(await pool.query('SELECT max(id)::int id FROM tracker_growth_proposals WHERE target_page_id=$1',[ids.page])).rows[0].id;
 assert.equal(proposal.id,newest,'the newest checked proposal for this page and URL');
 assert.equal(proposal.sections[0].text,research.editorial_decision_gate.proposed_text);
 assert.equal(proposal.focus_query,research.editorial_decision_gate.focus_query);
});

function exportBody(extra={}){
 return {page_id:ids.page,source_sha256:sha(OWN),editor_approved:true,cms:'wordpress',evidence_scope:'needs_access',
  focus_query:proposal.focus_query,seo_title:'Roof Repair in Lodi, NJ | Acme Roofing',meta_description:'Roof repair in Lodi, NJ: what we check and how to read the estimate.',
  growth_proposal_id:proposal.id,review_notes:proposal.review,
  approved_changes:proposal.sections.map(s=>({approved:true,evidence_ref:'growth_proposal:'+proposal.id,html:sectionHtml(s),placement:s.placement})),...extra};
}

test('4. the reviewed package carries the proposal text and placement; nothing is published',async()=>{
 const before=outbound.length;
 const j=await api('POST','/api/tracker-client/owner-tok/growth/cms-export',{...exportBody(),format:'json'});
 assert.equal(j.status,200,JSON.stringify(j.body));
 assert.equal(j.body.publication_allowed,false);
 assert.deepEqual(j.body.manifest.growth_proposal,{id:proposal.id,editor_changed_text:false});
 assert.deepEqual(j.body.manifest.change_placements,[proposal.sections[0].placement]);
 const impl=j.body.files.find(f=>f.name==='01-implementation.md').content;
 assert.match(impl,new RegExp('Change 1: (Extend the existing section|Add as a new section directly after) “'+proposal.sections[0].placement.section_heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'”'));
 const z=await api('POST','/api/tracker-client/owner-tok/growth/cms-export',{...exportBody(),format:'zip'});
 assert.equal(z.status,200);assert.match(z.type,/zip/);assert.equal(z.body.subarray(0,2).toString(),'PK');
 assert(z.body.includes(Buffer.from('02-approved-copy.md')));
 assert.equal(outbound.slice(before).length,0,'creating the package contacts no website');
 assert.equal(await pageHtml(ids.page),OWN);
});

test('5. the package refuses an unapproved text, another page\'s proposal or a changed source',async()=>{
 assert.equal((await api('POST','/api/tracker-client/owner-tok/growth/cms-export',{...exportBody({editor_approved:false}),format:'json'})).status,409);
 const other=await api('POST','/api/tracker-client/owner-tok/growth/cms-export',{...exportBody({page_id:ids.locked}),format:'json'});
 assert.equal(other.status,409);
 const wrongId=await api('POST','/api/tracker-client/owner-tok/growth/cms-export',{...exportBody({growth_proposal_id:proposal.id+999}),format:'json'});
 assert.equal(wrongId.status,409);assert.equal(wrongId.body.code,'GROWTH_PROPOSAL_NOT_FOR_THIS_PAGE');
 const stale=await api('POST','/api/tracker-client/owner-tok/growth/cms-export',{...exportBody({source_sha256:sha('older page')}),format:'json'});
 assert.equal(stale.status,409);assert.equal(stale.body.code,'TRACKER_SOURCE_REVISION_CHANGED');
 assert.equal((await api('POST','/api/tracker-client/share-tok/growth/cms-export',{...exportBody(),format:'json'})).status,403);
});

const DAY=86400000,publishedAt=new Date(Date.now()-3600000);
test('6. the actual publication is recorded without Search Console (GSC optional)',async()=>{
 const locked=await api('POST','/api/tracker-client/owner-tok/growth/publication',{page_id:ids.locked,query:'roof repair lodi nj',notes:'x',published_at:publishedAt.toISOString()});
 assert.equal(locked.status,409);
 const wrong=await api('POST','/api/tracker-client/owner-tok/growth/publication',{page_id:ids.page,query:proposal.focus_query,notes:'Added the estimate section',published_at:publishedAt.toISOString(),growth_proposal_id:proposal.id+999});
 assert.equal(wrong.status,409);
 const r=await api('POST','/api/tracker-client/owner-tok/growth/publication',{page_id:ids.page,query:proposal.focus_query,
  notes:'Added “'+proposal.sections[0].h2+'” (Growth proposal #'+proposal.id+')',published_at:publishedAt.toISOString(),growth_proposal_id:proposal.id});
 assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal(r.body.gsc_evidence,'NEEDS_ACCESS');assert.equal(r.body.measured_improvement,false);
 assert.equal(r.body.state,'PUBLISHED_NEEDS_SEARCH_CONSOLE_FOR_MEASUREMENT');
 publication=r.body.publication;
 const row=(await pool.query('SELECT gsc_evidence,growth_proposal_id FROM tracker_growth_publications WHERE id=$1',[publication.id])).rows[0];
 assert.deepEqual({...row,growth_proposal_id:Number(row.growth_proposal_id)},{gsc_evidence:'NEEDS_ACCESS',growth_proposal_id:proposal.id});
 assert.equal(await pageHtml(ids.page),OWN,'recording a publication never edits the stored page or baseline');
});

test('7. the Cockpit marks the page as just changed and stops recommending it',async()=>{
 const g=await api('GET','/api/tracker-client/owner-tok/growth');
 assert.equal(g.status,200);
 const page=g.body.pages.find(p=>Number(p.id)===ids.page);
 assert.equal(page.eligibility.status,'JUST_CHANGED',JSON.stringify(page.eligibility));
 assert.notEqual(g.body.best_candidate&&Number(g.body.best_candidate.page_id),ids.page);
 assert.equal(g.body.measurement_summary.waiting,1);
 const html=await api('GET','/track/owner-tok/growth');
 assert.equal(html.status,200);assert.match(html.body,/1 waiting for 28 days/);
});

// Time passes: shift the stored dates 40 days back instead of waiting (the only test-side change to Growth rows).
async function fortyDaysLater(){
 await pool.query("UPDATE tracker_growth_publications SET published_at=published_at-interval '40 days'");
 await pool.query("UPDATE tracker_growth_recommendations SET researched_at=researched_at-interval '40 days',started_at=started_at-interval '40 days'");
 publishedAt.setTime(publishedAt.getTime()-40*DAY);
}

test('8. measurement: no number until both 28-day Search Console windows exist, then the difference only',async()=>{
 await fortyDaysLater();
 let m=await api('GET','/api/tracker-client/owner-tok/growth/measurement');
 let rec=m.body.records.find(x=>Number(x.publication_id)===Number(publication.id));
 assert.equal(rec.measured_click_change,null);
 const w=rec.required_windows||(()=>{const d=new Date(publishedAt.toISOString().slice(0,10)+'T00:00:00Z').getTime(),y=x=>new Date(x).toISOString().slice(0,10);
  return {before:{start:y(d-28*DAY),end:y(d-DAY)},after:{start:y(d+DAY),end:y(d+28*DAY)}}})();
 const put=(period,clicks,impressions)=>api('POST','/api/tracker-client/owner-tok/growth/measurement/window',{publication_id:publication.id,period,
  start_date:w[period].start,end_date:w[period].end,query:proposal.focus_query,clicks,impressions,source:'gsc_page_query_export'});
 assert.equal((await put('before',12,900)).status,200);
 m=await api('GET','/api/tracker-client/owner-tok/growth/measurement');
 assert.equal(m.body.records.find(x=>Number(x.publication_id)===Number(publication.id)).measured_click_change,null,'one window is not a comparison');
 assert.equal((await put('after',19,1010)).status,200);
 m=await api('GET','/api/tracker-client/owner-tok/growth/measurement');
 rec=m.body.records.find(x=>Number(x.publication_id)===Number(publication.id));
 assert.equal(rec.measurement_status,'COMPARABLE_USER_PROVIDED_GSC');
 assert.equal(rec.measured_click_change,7);assert.equal(rec.measured_impression_change,110);
 assert.match(rec.reason,/not proven/);
 const g=await api('GET','/api/tracker-client/owner-tok/growth');
 assert.equal(g.body.measurement_summary.measured,1);assert.equal(g.body.measurement_summary.measured_click_change,7);
});

test('9. nothing outside the Growth tables was written',async()=>{
 assert.equal(await pageHtml(ids.page),OWN);assert.equal(await pageHtml(ids.locked),LOCKED);
 assert.equal((await pool.query("SELECT count(*)::int n FROM tracker_case_studies WHERE status='active'")).rows[0].n,1);
 assert.equal(outbound.every(x=>x.method==='GET'),true,'only reads of public pages');
 assert(aiCalls.length>=1,'the AI writer was used for the draft');
});
}
