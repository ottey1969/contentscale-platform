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
// SYNTHETIC second section (step 11 needs two writable items).
const flashingA='Flashing seals the joints around chimneys, vents and skylights. When flashing cracks or lifts, water runs behind it and the decking rots slowly, so a crew should check every joint and reseal or replace the flashing before the leak spreads inside the house.';
// SYNTHETIC homepage: the facts about the business a new page is written from.
const HOME_HTML='<html><body><h1>Acme Roofing</h1><p>Acme Roofing is a licensed and insured roofing contractor in Lodi, New Jersey. Our crew repairs and replaces residential roofs, inspects roofs after storms and explains every finding before any work starts.</p></body></html>';
const pages={[URL_]:OWN,[LOCKED_URL]:LOCKED,[HOME+'/']:HOME_HTML,
 'https://roofer-a.example/roof-repair-nj/':comp('Roof repair in Paterson, NJ',[['How a repair estimate is built',estimateA],['When a roof needs flashing work',flashingA]]),
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
// Writer behaviour for step 11 (interrupted and slow runs): normal unless a test sets it.
const writer={mode:'normal',gate:null};
const generateDraft=async(args)=>{aiCalls.push(args.pageUrl);
 if(args.fallbackFlagged&&writer.mode==='fail')throw Object.assign(Error('writer down'),{code:'WRITER_DOWN'});
 if(args.fallbackFlagged&&writer.mode==='slow')await writer.gate;

 // Writing for an owner selection (fallbackFlagged): one section per selected task, one sentence with an unsourced figure.
 if(args.fallbackFlagged)return {status:'AI_DRAFT_REVIEW_REQUIRED',draft:{seo_title:null,meta_description:null,sections:(args.readerTask?.tasks||[]).map(t=>({task_code:t.code,
  h2:'How to read a repair estimate before you sign',paragraphs:['Ask for a written estimate that lists materials, labour and access separately, and ask what changes if hidden damage is found once work starts.',
  'About 68% of homeowners never compare two estimates, so ask a second crew for a written quote before you approve the work.']}))}};
 return {status:'AI_DRAFT_REVIEW_REQUIRED',draft:{seo_title:null,meta_description:null,sections:[DRAFT]}}};

let pool,server,base,ids={};
const SCHEMA=`
CREATE TABLE tracker_clients(id BIGSERIAL PRIMARY KEY,name TEXT,domain TEXT NOT NULL,token TEXT UNIQUE,readonly_token TEXT UNIQUE,status TEXT);
CREATE TABLE tracker_pages(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT NOT NULL,url TEXT NOT NULL,keyword TEXT,redirects_to TEXT,
 gsc_impressions INTEGER,gsc_clicks INTEGER,gsc_position NUMERIC,brief_content JSONB,html_content TEXT);
CREATE TABLE tracker_case_studies(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT NOT NULL,tracker_page_id BIGINT NOT NULL,status TEXT);
CREATE TABLE tracker_gsc_queries(id BIGSERIAL PRIMARY KEY,tracker_client_id BIGINT,page_id BIGINT,source_page_url TEXT,evidence_scope TEXT,query TEXT,
 clicks INTEGER,impressions INTEGER,position NUMERIC,imported_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE tracker_snapshots(id BIGSERIAL PRIMARY KEY,page_id BIGINT,checked_at TIMESTAMPTZ,google_competitors JSONB,ai_perplexity_competitors JSONB);
CREATE TABLE prewrite_briefs(id SERIAL PRIMARY KEY,client_id INTEGER,keyword TEXT,working_title TEXT,language TEXT,region TEXT,brief_json JSONB,competitors_scraped INTEGER,created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE tracker_ai_evidence(id BIGSERIAL PRIMARY KEY,page_id BIGINT,tracker_client_id BIGINT,engine TEXT,evidence_method TEXT,brand_recommended BOOLEAN,
 domain_cited BOOLEAN,exact_page_cited BOOLEAN,citation_urls JSONB,verified_at TIMESTAMPTZ,revision_cycle INTEGER,is_cleared BOOLEAN);`;
const TABLES=['tracker_growth_new_page_concepts','prewrite_briefs','tracker_clients','tracker_pages','tracker_case_studies','tracker_gsc_queries','tracker_snapshots','tracker_ai_evidence',
 'tracker_growth_proposals','tracker_growth_publications','tracker_growth_gsc_windows','tracker_growth_recommendations','tracker_growth_gap_lists','tracker_growth_page_markets','tracker_growth_writing_runs','tracker_growth_site_markets','tracker_growth_ai_answers','tracker_growth_gsc_country','tracker_growth_customer_countries','tracker_growth_gsc_country_imports','tracker_growth_claim_reviews','tracker_growth_lead_windows'];

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

test('10. hybrid: research without writing gives the full gap list; text only for the owner selection, flagged, to the CMS',async()=>{
 const before=aiCalls.length;
 const r=await api('POST','/api/tracker-client/owner-tok/growth/auto-research/complete?page_id='+ids.page,{page_id:ids.page,write:false});
 assert.equal(r.status,200);
 assert.equal(aiCalls.length,before,'opening the research writes nothing');
 assert.equal(r.body.editorial_review_draft.status,'WRITING_ON_SELECTION');
 const gl=r.body.gap_list;
 assert(gl.id>0&&gl.items.length>0,JSON.stringify(gl).slice(0,300));
 const stored=(await pool.query('SELECT items,selected FROM tracker_growth_gap_lists WHERE id=$1',[gl.id])).rows[0];
 assert.equal(stored.items.length,gl.items.length);assert.equal(stored.selected,null);
 const pick=gl.items.filter(x=>x.writable).slice(0,1).map(x=>x.id);
 // Only the owner, only ids from the stored list, never a locked page.
 assert.equal((await api('POST',gl.write_url.replace('owner-tok','share-tok'),{gap_list_id:gl.id,item_ids:pick})).status,403);
 assert.equal((await api('POST',gl.write_url,{gap_list_id:gl.id,item_ids:['invented-id']})).status,400);
 const w=await api('POST',gl.write_url,{gap_list_id:gl.id,item_ids:pick});
 assert.equal(w.status,200,JSON.stringify(w.body).slice(0,300));
 assert.equal(w.body.copy_ready,false);assert.equal(w.body.published,false);
 assert.equal(w.body.sections.length,1);assert.equal(w.body.sections[0].item_id,pick[0]);
 const flags=w.body.sections[0].flags;
 assert(flags.some(f=>f.code==='UNSOURCED_NUMBER'&&/68%/.test(f.sentence)),JSON.stringify(flags));
 assert.equal(w.body.sections[0].status,'FLAGGED_FOR_EDITOR');
 assert.deepEqual((await pool.query('SELECT selected FROM tracker_growth_gap_lists WHERE id=$1',[gl.id])).rows[0].selected,pick);
 // The concept is the newest proposal for the CMS page, with the flagged sentence as a must-rewrite item.
 const prop=(await api('GET','/api/tracker-client/owner-tok/growth/cms-export/proposal?page_id='+ids.page)).body.proposal;
 assert.equal(prop.id,w.body.cms_handoff.proposal_id);assert.equal(prop.evidence_label,'SELECTION_CONCEPT_WITH_FLAGGED_SENTENCES');
 assert(prop.review.flagged.some(f=>/68%/.test(f.sentence)));
 const exportWith=sections=>api('POST','/api/tracker-client/owner-tok/growth/cms-export',{page_id:ids.page,source_sha256:sha(OWN),editor_approved:true,cms:'wordpress',evidence_scope:'needs_access',
  focus_query:prop.focus_query||'roof repair lodi nj',seo_title:'Roof Repair in Lodi, NJ',meta_description:'Roof repair in Lodi, NJ: how to read the estimate.',growth_proposal_id:prop.id,review_notes:prop.review,
  approved_changes:sections.map(x=>({approved:true,evidence_ref:'growth_proposal:'+prop.id,html:sectionHtml(x),placement:x.placement})),format:'json'});
 // A tick is not proof: the flagged sentence still in the text refuses the package and names it.
 const unchanged=await exportWith(prop.sections);
 assert.equal(unchanged.status,409);assert.deepEqual(unchanged.body.issues,['FLAGGED_CONTENT_NOT_RESOLVED']);
 assert(unchanged.body.blocked_details.some(b=>b.code==='FLAGGED_SENTENCE_STILL_IN_TEXT'&&/68%/.test(b.sentence)));
 // Rewriting it into another unsourced figure is caught by the same checks again.
 const reworded=prop.sections.map(x=>({...x,text:x.text.replace(/About 68% of homeowners[^.]*\./,'Around 70% of homeowners skip a second quote, so ask for one before you approve the work.')}));
 const again=await exportWith(reworded);
 assert.equal(again.status,409);assert(again.body.blocked_details.some(b=>b.code==='UNRESOLVED_UNSOURCED_NUMBER'&&/70%/.test(b.sentence)),JSON.stringify(again.body));
 // Resolved: the flagged sentence removed. Only now the package is made, recording what was resolved.
 const resolved=prop.sections.map(x=>({...x,text:x.text.replace(/\s*About 68% of homeowners[^.]*\./,'').trim()+' Ask a second crew for a written quote before you approve the work.'}));
 const pack=await exportWith(resolved);
 assert.equal(pack.status,200,JSON.stringify(pack.body).slice(0,300));
 const facts=pack.body.files.find(f=>f.name==='06-fact-check-before-publishing.md').content;
 assert.match(facts,/Flagged by Growth — resolved in this text \(checked\)[\s\S]*68%/);
 assert.equal(pack.body.manifest.review_items.flagged,1);
 // The concept for the selected task replaces the research proposal for that same task: the older wording is not offered
 // as another concept (owner 2026-11-01: nine "other concepts" were earlier versions of the same tasks).
 const listed=(await api('GET','/api/tracker-client/owner-tok/growth/cms-export/proposal?page_id='+ids.page)).body;
 assert.equal(listed.proposal.id,prop.id);
 assert(!listed.earlier.some(x=>x.id===proposal.id&&x.kind!=='EARLIER_RESEARCH_VERSION'),'the same task in older wording is not a separate concept');
 // A concept written later on ANOTHER topic becomes the newest; the estimate concept stays offered and can be added to the
 // same package (recorded per section and in the manifest).
 const {saveSelectionProposal}=require('../src/growth-proposal-store.cjs');
 const other=await saveSelectionProposal(pool,{clientId:ids.client,targetPageId:ids.page,targetUrl:URL_,focusQuery:prop.focus_query,
  written:{sections:[{h2:'What to ask the crew before work starts',paragraphs:['Ask which parts of the roof they will inspect, what they will replace and how they will protect the gutters and the garden during the work.'],item_id:'q-task_crew_questions',item_title:'Questions for the crew'}]}});
 const listed2=(await api('GET','/api/tracker-client/owner-tok/growth/cms-export/proposal?page_id='+ids.page)).body;
 assert.equal(listed2.proposal.id,Number(other.id));
 const main=listed2.earlier.find(x=>x.id===prop.id);
 assert(main&&main.kind==='SELECTION_CONCEPT','the estimate concept is offered as another concept: '+JSON.stringify(listed2.earlier.map(x=>[x.id,x.kind])));
 const newest=listed2.proposal;
 const combinedBody=extra=>({page_id:ids.page,source_sha256:sha(OWN),editor_approved:true,cms:'wordpress',evidence_scope:'needs_access',
  focus_query:prop.focus_query||'roof repair lodi nj',seo_title:'Roof Repair in Lodi, NJ',meta_description:'Roof repair in Lodi, NJ: how to read the estimate.',growth_proposal_id:newest.id,
  review_notes:{...prop.review,needs_fact_check:[...(prop.review.needs_fact_check||[]),...(newest.review.needs_fact_check||[])]},
  approved_changes:[...newest.sections.map(x=>({approved:true,evidence_ref:'growth_proposal:'+newest.id,html:sectionHtml(x),placement:x.placement})),
   ...resolved.map(x=>({approved:true,evidence_ref:'growth_proposal:'+main.id,html:sectionHtml(x),placement:x.placement}))],format:'json',...extra});
 assert.equal((await api('POST','/api/tracker-client/owner-tok/growth/cms-export',combinedBody({added_growth_proposal_ids:[main.id+999]}))).status,409,'another page’s or an invented concept is refused');
 const both=await api('POST','/api/tracker-client/owner-tok/growth/cms-export',combinedBody({added_growth_proposal_ids:[main.id]}));
 assert.equal(both.status,200,JSON.stringify(both.body).slice(0,300));
 assert.deepEqual(both.body.manifest.growth_proposals_added,[main.id]);
 assert(both.body.manifest.change_evidence.includes('growth_proposal:'+main.id));
 assert.equal(both.body.manifest.change_evidence.length,newest.sections.length+resolved.length);
 // The protected Case Study page never gets a gap list to write from.
 const locked=await api('POST','/api/tracker-client/owner-tok/growth/auto-research/complete?page_id='+ids.locked,{page_id:ids.locked,write:false});
 assert(locked.body.gap_list.id===null||locked.body.gap_list.target_page_id!==ids.locked);
 assert.equal(await pageHtml(ids.page),OWN,'writing never changes the stored page');
});

test('11. writing rounds are reliable: interrupted, failed storage, parallel clicks, partial runs, retry, new research',async()=>{
 const r=await api('POST','/api/tracker-client/owner-tok/growth/auto-research/complete?page_id='+ids.page,{page_id:ids.page,write:false});
 const gl=r.body.gap_list,sel=gl.write_url.replace('/auto-research/write','/auto-research/selection');
 const picks=gl.items.filter(x=>x.writable).slice(0,2).map(x=>x.id);
 assert.equal(picks.length,2,'the synthetic research has two writable items');
 const state=async()=>(await pool.query('SELECT selected,written_ids FROM tracker_growth_gap_lists WHERE id=$1',[gl.id])).rows[0];
 const runs=async()=>(await pool.query('SELECT status,error,proposal_id FROM tracker_growth_writing_runs WHERE gap_list_id=$1 ORDER BY id',[gl.id])).rows;
 const proposals=async()=>(await pool.query('SELECT count(*)::int n FROM tracker_growth_proposals')).rows[0].n;
 const write=body=>api('POST',gl.write_url,{gap_list_id:gl.id,...body});
 // The deliberate selection: both items.
 assert.equal((await api('POST',sel,{gap_list_id:gl.id,item_ids:picks})).status,200);
 // a. The writer fails: nothing is written or marked done; the run is FAILED; the whole batch stays pending.
 writer.mode='fail';
 const failed=await write({item_ids:picks});
 assert.equal(failed.status,200);assert.equal(failed.body.status,'NOT_WRITTEN');assert.deepEqual(failed.body.pending.map(x=>x.item_id),picks);
 assert.equal((await state()).written_ids,null);assert.equal((await runs()).at(-1).status,'FAILED');
 // b. Storage fails after the AI wrote: the transaction rolls back; nothing is marked written; the items stay pending.
 writer.mode='normal';const before=await proposals();
 await pool.query('ALTER TABLE tracker_growth_proposals RENAME TO tracker_growth_proposals_off');
 await pool.query('CREATE TABLE tracker_growth_proposals (id BIGSERIAL PRIMARY KEY)');
 const lost=await write({item_ids:picks});
 await pool.query('DROP TABLE tracker_growth_proposals');await pool.query('ALTER TABLE tracker_growth_proposals_off RENAME TO tracker_growth_proposals');
 assert.equal(lost.body.stored,false);assert.equal(lost.body.storage_error,'CONCEPT_NOT_STORED_NOTHING_MARKED_WRITTEN');assert.equal(lost.body.cms_handoff,null);
 assert.deepEqual(lost.body.pending.map(x=>x.item_id),picks);assert.equal((await state()).written_ids,null);assert.equal(await proposals(),before);
 assert.equal((await runs()).at(-1).status,'FAILED');
 // c. Retry after the storage failure: stored now, with no new AI call (the identical draft is reused).
 const callsBefore=aiCalls.length;
 const retry=await write({item_ids:picks});
 assert.equal(retry.status,200);assert.equal(retry.body.stored,true);assert.equal(aiCalls.length,callsBefore,'no second AI call for the same draft');
 assert.deepEqual([...(await state()).written_ids].sort(),[...picks].sort());assert.equal(await proposals(),before+1);
 assert.equal((await runs()).at(-1).status,'STORED');assert.equal(Number((await runs()).at(-1).proposal_id),retry.body.cms_handoff.proposal_id);
 // d. Again: nothing is written twice; the stored run and its CMS package are returned.
 const again=await write({item_ids:picks});
 assert.equal(again.status,409);assert.equal(again.body.code,'SELECTION_ALREADY_WRITTEN');assert.equal(again.body.last_run.proposal_id,retry.body.cms_handoff.proposal_id);
 // e. A writing request naming fewer items never removes any from the selection.
 await write({item_ids:[picks[0]]});
 assert.deepEqual((await state()).selected,picks);
 // f. New research of the page: nothing open is carried over (everything was written).
 const r2=await api('POST','/api/tracker-client/owner-tok/growth/auto-research/complete?page_id='+ids.page,{page_id:ids.page,write:false});
 const g2=r2.body.gap_list,write2=body=>api('POST',g2.write_url,{gap_list_id:g2.id,...body});
 assert.equal(g2.carried_over,null);
 // g. Two clicks at once on the new list: one run writes, the other gets that run back; one AI call. (The first item
 //    alone was drafted in step 10 and would come from the draft cache, so the second item is used.)
 await api('POST',sel,{gap_list_id:g2.id,item_ids:[picks[1]]});
 writer.mode='slow';let open;writer.gate=new Promise(ok=>{open=ok});const calls=aiCalls.length;
 const first=write2({item_ids:[picks[1]]});
 for(let i=0;i<100&&aiCalls.length===calls;i++)await new Promise(ok=>setTimeout(ok,20));
 assert.equal(aiCalls.length,calls+1,'the first run is writing');
 const second=await write2({item_ids:[picks[1]]});
 assert.equal(second.status,409);assert.equal(second.body.code,'WRITING_IN_PROGRESS');assert.deepEqual(second.body.run.item_ids,[picks[1]]);
 open();const done=await first;writer.mode='normal';
 assert.equal(done.status,200);assert.equal(done.body.stored,true);assert.equal(aiCalls.length,calls+1,'one AI call');
 // h. The owner adds the other item; that run is interrupted (storage fails): the second stays written, the first pending.
 await api('POST',sel,{gap_list_id:g2.id,item_ids:picks});
 await pool.query('ALTER TABLE tracker_growth_proposals RENAME TO tracker_growth_proposals_off');
 await pool.query('CREATE TABLE tracker_growth_proposals (id BIGSERIAL PRIMARY KEY)');
 const cut=await write2({item_ids:picks});
 await pool.query('DROP TABLE tracker_growth_proposals');await pool.query('ALTER TABLE tracker_growth_proposals_off RENAME TO tracker_growth_proposals');
 assert.deepEqual(cut.body.batch,[picks[0]]);assert.equal(cut.body.stored,false);assert.deepEqual(cut.body.pending.map(x=>x.item_id),[picks[0]]);
 // i. The next research run carries the open item over (same need: ticked again), without selecting it by itself.
 const r3=await api('POST','/api/tracker-client/owner-tok/growth/auto-research/complete?page_id='+ids.page,{page_id:ids.page,write:false});
 assert.deepEqual(r3.body.gap_list.carried_over.pending_ids,[picks[0]]);assert.deepEqual(r3.body.gap_list.carried_over.needs_remapping,[]);
 assert.equal((await pool.query('SELECT selected FROM tracker_growth_gap_lists WHERE id=$1',[r3.body.gap_list.id])).rows[0].selected,null,'carried over, not selected by itself');
});

test('12. target market and language: the Pre-Write brief of the keyword, or the Growth setting at the top of the page; both win over a derived US state',async()=>{
 const url='/api/tracker-client/owner-tok/growth/markets?page_id='+ids.page;
 // Research results are cached for five minutes; saving the market setting clears that cache (an empty setting = none).
 const fresh=()=>api('POST',url,{countries:''});
 const research=async()=>{const b=searches.length;await api('POST','/api/tracker-client/owner-tok/growth/auto-research/complete?page_id='+ids.page,{page_id:ids.page,write:false});return searches.slice(b).pop()};
 const page=async(tok='owner-tok')=>(await api('GET','/track/'+tok+'/growth/auto-research?page_id='+ids.page)).body;
 // Nothing set, no Pre-Write brief: the synthetic keyword names a US state (Lodi, NJ), so the derived US market is used.
 assert.match(await page(),/id="marketSetting"/);assert.match(await page(),/Market: derived from the page — not confirmed/);
 assert.doesNotMatch(await page('share-tok'),/id="marketSetting"/,'owner only');
 await fresh();assert.deepEqual((await research()).market.states,['NJ']);
 // A Pre-Write brief for the same keyword (SYNTHETIC row, as the Pre-Write screen stores it: region code, language name).
 await pool.query("INSERT INTO prewrite_briefs(client_id,keyword,language,region,brief_json) VALUES ($1,'Roof Repair Lodi NJ','Dutch','nl','{}')",[ids.client]);
 const briefId=(await pool.query("SELECT id FROM prewrite_briefs WHERE keyword='Roof Repair Lodi NJ'")).rows[0].id;
 assert.match(await page(),new RegExp('Market: nl — Netherlands — from Pre-Write brief #'+briefId+' \\(“Roof Repair Lodi NJ”, \\d{4}-\\d\\d-\\d\\d\\)'));
 assert.match(await page(),/Language: Dutch — from Pre-Write brief/);
 await fresh();const fromBrief=await research();
 assert.equal(fromBrief.market,null);assert.deepEqual([fromBrief.locale.country,fromBrief.locale.hl,fromBrief.locale.source],['NL','nl','FROM_PREWRITE_BRIEF']);
 // Set in Growth (as the Pre-Write picker writes it): wins over the brief.
 assert.equal((await api('POST',url.replace('owner-tok','share-tok'),{countries:'NL'})).status,403);
 const saved=await api('POST',url,{countries:'nl — Netherlands, gb — United Kingdom, be, Luxembourg',language:'English'});
 assert.deepEqual([saved.body.markets.countries,saved.body.markets.language],[['NL','GB','BE','LU'],'en']);
 assert.match(await page(),/value="nl — Netherlands, gb — United Kingdom, be — Belgium, lu — Luxembourg"/);assert.match(await page(),/value="English"/);
 const set=await research();
 assert.deepEqual([set.locale.country,set.locale.other_countries,set.locale.hl,set.locale.source],['NL',['GB','BE','LU'],'en','SET_IN_TRACKER']);
 // Each field is inherited separately: markets set in Growth, language left empty -> the language of the brief.
 await api('POST',url,{countries:'nl — Netherlands, gb — United Kingdom',language:''});
 const marketsOnly=await research();
 assert.deepEqual([marketsOnly.locale.country,marketsOnly.locale.other_countries,marketsOnly.locale.source,marketsOnly.locale.hl,marketsOnly.locale.language_source],['NL',['GB'],'SET_IN_TRACKER','nl','FROM_PREWRITE_BRIEF']);
 assert.match(await page(),/Market: nl — Netherlands, gb — United Kingdom — set in Growth/);assert.match(await page(),/Language: Dutch — from Pre-Write brief/);
 // Language only set in Growth: the market still comes from the brief.
 await api('POST',url,{countries:'',language:'English'});
 const languageOnly=await research();
 assert.deepEqual([languageOnly.locale.country,languageOnly.locale.source,languageOnly.locale.hl,languageOnly.locale.language_source],['NL','FROM_PREWRITE_BRIEF','en','SET_IN_TRACKER']);
 // Another brief for the same keyword with another market: the newest is used and the other is named.
 await pool.query("INSERT INTO prewrite_briefs(client_id,keyword,language,region,brief_json,created_at) VALUES ($1,'roof repair lodi nj','English','gb','{}',NOW()-INTERVAL '2 days')",[ids.client]);
 assert.match(await page(),/other Pre-Write briefs for this keyword with another market or language: #\d+ gb — United Kingdom · English/);
 // Both fields empty removes the setting: the brief decides both again.
 await api('POST',url,{countries:'',language:''});
 const report=(await api('POST','/api/tracker-client/owner-tok/growth/auto-research/complete?page_id='+ids.page,{page_id:ids.page,write:false})).body;
 const used=report.search_discovery.search_locale;
 assert.deepEqual([used.source,used.language_source,used.brief.id,used.prewrite_alternatives.map(x=>x.country)],['FROM_PREWRITE_BRIEF','FROM_PREWRITE_BRIEF',briefId,['GB']]);
});

test('13. new page from a Pre-Write brief: same research, overlap check, selection, writing rounds, stored concept and package',async()=>{
 // SYNTHETIC brief for a page the site does not have yet.
 const nb=(await pool.query("INSERT INTO prewrite_briefs(client_id,keyword,working_title,language,region,brief_json) VALUES ($1,'roof inspection lodi nj','Roof inspection in Lodi','English','us','{}') RETURNING id",[ids.client])).rows[0].id;
 const listPage=(await api('GET','/track/owner-tok/growth/new-page')).body;
 assert.match(listPage,/roof inspection lodi nj/);assert.match(listPage,new RegExp('new-page\\?brief_id='+nb));
 assert.doesNotMatch((await api('GET','/track/share-tok/growth/new-page')).body,/Research as a new page/,'owner only');
 assert.match((await api('GET','/track/owner-tok/growth')).body,/New page from a Pre-Write brief/,'reachable from the Growth Cockpit');
 assert.match((await api('GET','/track/owner-tok/growth/new-page?brief_id='+nb)).body,/id="newPageStatus"/);
 const before=searches.length,aiBefore=aiCalls.length,proposalsBefore=(await pool.query('SELECT count(*)::int n FROM tracker_growth_proposals')).rows[0].n;
 assert.equal((await api('POST','/api/tracker-client/share-tok/growth/new-page/research',{brief_id:nb})).status,403);
 const r=await api('POST','/api/tracker-client/owner-tok/growth/new-page/research',{brief_id:nb});
 assert.equal(r.status,200,JSON.stringify(r.body).slice(0,300));
 assert.equal(aiCalls.length,aiBefore,'research writes nothing');
 const used=searches.slice(before).pop();
 assert.equal(used.query,'roof inspection lodi nj');assert.deepEqual([used.locale.country,used.locale.hl,used.locale.source],['US','en','FROM_PREWRITE_BRIEF'],'market and language from the brief');
 const gl=r.body.gap_list;
 assert.equal(gl.page_kind,'NEW_PAGE');assert(gl.items.some(x=>x.writable),JSON.stringify(gl.items).slice(0,300));
 assert(gl.items.filter(x=>x.writable).every(x=>x.status==='To cover on the new page'));
 assert.equal(r.body.new_page_research.planned_url,HOME+'/roof-inspection-lodi-nj/');
 assert.notEqual(r.body.new_page_research.overlap.status,'EXISTING_PAGE_TARGETS_THIS_KEYWORD');
 const row=(await pool.query('SELECT target_page_id,prewrite_brief_id,page_kind FROM tracker_growth_gap_lists WHERE id=$1',[gl.id])).rows[0];
 assert.deepEqual([row.target_page_id,Number(row.prewrite_brief_id),row.page_kind],[null,Number(nb),'NEW_PAGE'],'no tracked page needed');
 // Selection and writing: the same rounds, flags and storage; the concept is stored, not a CMS proposal.
 const pick=gl.items.filter(x=>x.writable).slice(0,2).map(x=>x.id);
 assert.equal((await api('POST',gl.selection_url,{gap_list_id:gl.id,item_ids:pick})).status,200);
 const w=await api('POST',gl.write_url,{gap_list_id:gl.id,item_ids:pick});
 assert.equal(w.status,200,JSON.stringify(w.body).slice(0,300));assert.equal(w.body.stored,true);assert.equal(w.body.page_kind,'NEW_PAGE');
 assert.deepEqual(w.body.sections.map(x=>x.item_id).sort(),[...pick].sort());
 assert(w.body.sections.some(x=>x.flags.some(f=>f.code==='UNSOURCED_NUMBER'&&/68%/.test(f.sentence))),'checked against the business facts (homepage)');
 assert.deepEqual([...(await pool.query('SELECT written_ids FROM tracker_growth_gap_lists WHERE id=$1',[gl.id])).rows[0].written_ids].sort(),[...pick].sort());
 assert.equal((await pool.query('SELECT count(*)::int n FROM tracker_growth_proposals')).rows[0].n,proposalsBefore,'no change proposal for an existing page');
 assert.equal((await api('POST',gl.write_url,{gap_list_id:gl.id,item_ids:pick})).body.code,'SELECTION_ALREADY_WRITTEN');
 // The package: the concept, its basis, the flagged sentence to rewrite, the next steps and the evidence dossier.
 const pkg=await api('GET',w.body.new_page_package.url);
 assert.equal(pkg.status,200);assert.match(pkg.body,/# New page concept: Roof inspection in Lodi/);assert.match(pkg.body,/Planned URL: https:\/\/acme-roofing\.example\/roof-inspection-lodi-nj\/ \(not published\)/);
 assert.match(pkg.body,/## Flagged by Growth: rewrite or remove[\s\S]*68%/);assert.match(pkg.body,/Add the published URL to the Tracker/);assert.match(pkg.body,/## Evidence dossier/);
 const json=(await api('GET',w.body.new_page_package.url+'&format=json')).body.package;
 assert.equal(json.kind,'NEW_PAGE_CONCEPT');assert.equal(json.sections.length,2);assert.equal(json.dossiers[0].research.focus_query,'roof inspection lodi nj');
 // Cannibalisation: a brief for the keyword a tracked page already targets is flagged and needs confirmation to write.
 const same=(await pool.query("SELECT id FROM prewrite_briefs WHERE client_id=$1 AND LOWER(keyword)='roof repair lodi nj' ORDER BY id LIMIT 1",[ids.client])).rows[0].id;
 const r2=await api('POST','/api/tracker-client/owner-tok/growth/new-page/research',{brief_id:same});
 assert.equal(r2.body.new_page_research.overlap.status,'EXISTING_PAGE_TARGETS_THIS_KEYWORD');assert.equal(r2.body.new_page_research.overlap.exact[0].url,URL_);
 const g2=r2.body.gap_list,p2=g2.items.filter(x=>x.writable).slice(0,1).map(x=>x.id);
 const refused=await api('POST',g2.write_url,{gap_list_id:g2.id,item_ids:p2});
 assert.equal(refused.status,409);assert.equal(refused.body.code,'EXISTING_PAGE_TARGETS_THIS_KEYWORD');assert.equal(refused.body.existing_pages[0].url,URL_);
 assert.equal((await api('POST',g2.write_url,{gap_list_id:g2.id,item_ids:p2,confirm_new_page:true})).status,200,'the owner may still decide for a separate page');
 // A new-page list is not usable from the existing-page routes and the other way round.
 assert.equal((await api('POST','/api/tracker-client/owner-tok/growth/new-page/selection',{gap_list_id:1,item_ids:['x']})).body.code,'NEW_PAGE_GAP_LIST_NOT_FOUND');
 assert.equal(await pageHtml(ids.page),OWN,'existing pages are never changed');
});

test('9. nothing outside the Growth tables was written',async()=>{
 assert.equal(await pageHtml(ids.page),OWN);assert.equal(await pageHtml(ids.locked),LOCKED);
 assert.equal((await pool.query("SELECT count(*)::int n FROM tracker_case_studies WHERE status='active'")).rows[0].n,1);
 assert.equal(outbound.every(x=>x.method==='GET'),true,'only reads of public pages');
 assert(aiCalls.length>=1,'the AI writer was used for the draft');
});
}
