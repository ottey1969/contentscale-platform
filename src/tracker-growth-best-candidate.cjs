'use strict';
// Decides, transparently, which single tracked page/query the owner should work
// on first, and why every other row is not the first choice. Plain-language
// output for non-experts; no forecasts, no invented clicks or rankings.
const {sameUrl}=require('./growth-url-identity.cjs');
const {compareDatedWindows}=require('./tracker-growth-measurement.cjs');
const {norm:memoryKey}=require('./tracker-growth-recommendation-memory.cjs');

const DAY=86400000;
const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
// pg returns timestamptz as Date objects; tests and JSON use strings or numbers.
const ts=x=>x instanceof Date?x.getTime():typeof x==='number'?x:Date.parse(x);
const fmtDate=x=>{const t=ts(x);return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):''};
const plain=x=>String(x||'').toLowerCase().replace(/_/g,' ');
const DECISION_TEXT={IMPROVE_EXISTING:'improve the existing page',NEW_DISTINCT_PAGE:'write a separate new page',NO_CHANGE:'no change needed',DATA_BLOCKED:'not enough reliable data'};
const NO_CHANGE_RECHECK_DAYS=90,BLOCKED_RETRY_DAYS=7,IMPROVEMENT_OPEN_DAYS=60;

// Exact page+query memory first, then what was remembered for the page itself.
function memoryFor(pageId,query,memory){
 const own=memory.filter(m=>String(m.tracker_page_id)===String(pageId));
 if(query!=null){const k=memoryKey(query);return own.find(m=>m.query_key===k)||own.find(m=>m.query_key==='')||null}
 return own[0]||null;
}

// tracker_pages.redirects_to holds either a destination URL, "(dead 404 …)",
// "(corrected duplicate → URL)" or "(redirect 302)" without a destination.
function redirectInfo(flag){
 const f=String(flag||'').trim();
 if(!f)return null;
 if(/^\(dead\b/i.test(f))return {kind:'PAGE_GONE',note:f.replace(/^\(|\)$/g,'')};
 const m=f.match(/https?:\/\/[^\s)]+/i);
 return {kind:'OLD_ADDRESS',final_url:m?m[0]:''};
}

function measurementFor(pageId,query,publications,windows,now){
 const own=publications.filter(p=>String(p.tracker_page_id)===String(pageId)&&(query==null||norm(p.query)===norm(query)))
  .sort((a,b)=>(ts(b.published_at)||0)-(ts(a.published_at)||0));
 if(!own.length)return null;
 const m=compareDatedWindows(own[0],windows.filter(w=>String(w.publication_id)===String(own[0].id)),now);
 const day=fmtDate(m.published_at),wait=Math.max(0,28-m.days_since_publication);
 const label=m.measurement_status==='WAITING_FOR_28_DAYS'
  ?`Changed on ${day}. Wait ${wait} more day${wait===1?'':'s'} before judging the result.`
  :m.measurement_status==='COMPARABLE_USER_PROVIDED_GSC'
  ?`Changed on ${day}. Measured over two equal 28-day periods: clicks ${m.before.clicks} → ${m.after.clicks} (${m.measured_click_change>=0?'+':''}${m.measured_click_change}), impressions ${m.before.impressions} → ${m.after.impressions}. Other factors can also explain a change.`
  :`Changed on ${day}. 28 days have passed: enter the before/after Search Console numbers on the measurement page to see the result.`;
 return {status:m.measurement_status,published_at:m.published_at,days_since_publication:m.days_since_publication,
  days_left:wait,click_change:m.measured_click_change,impression_change:m.measured_impression_change,label};
}

function classify(row,page,ctx){
 const redirect=redirectInfo(page&&page.redirects_to);
 if(row.locked)return {status:'PROTECTED',label:'Protected Case Study — leave this page unchanged. Research is allowed, edits are not.'};
 if(redirect&&redirect.kind==='PAGE_GONE')return {status:'PAGE_GONE',label:'This address no longer works ('+redirect.note+'). Work on a live page instead.'};
 if(redirect){
  const final=redirect.final_url&&ctx.pages.find(p=>sameUrl(p.url,redirect.final_url));
  return {status:'OLD_ADDRESS',final_url:redirect.final_url||null,final_page_id:final?final.id:null,
   label:'Old address: visitors and Google are sent on to '+(redirect.final_url||'another page')+'. This is one page, not duplicate content. Work on the final page; keep the redirect.'};
 }
 if(row.measurement&&row.measurement.status==='WAITING_FOR_28_DAYS')
  return {status:'JUST_CHANGED',label:'Recently changed — let it settle. Changing it again now makes the result impossible to measure.'};
 const m=row.memory;
 if(m&&m.status==='SKIPPED')
  return {status:'SKIPPED_BY_OWNER',label:`You marked this as not relevant on ${fmtDate(m.skipped_at)}${m.skip_reason?': “'+m.skip_reason+'”':''}. The system will not suggest it again unless you restore it.`};
 if(m&&m.researched_at&&m.research_decision){
  const at=ts(m.researched_at),age=(ctx.now.getTime()-at)/DAY;
  const publishedAfter=row.measurement&&ts(row.measurement.published_at)>=at;
  const before=Number(m.snapshot&&m.snapshot.impressions)||0;
  if(m.research_decision==='NO_CHANGE'&&age<NO_CHANGE_RECHECK_DAYS&&!(before>0&&row.impressions>=2*before))
   return {status:'NO_CHANGE_FOUND',label:`Research on ${fmtDate(at)} found that no change is needed. The system looks again after ${fmtDate(at+NO_CHANGE_RECHECK_DAYS*DAY)}, or sooner if Google impressions double.`};
  if(m.research_decision==='DATA_BLOCKED'&&age<BLOCKED_RETRY_DAYS)
   return {status:'RESEARCH_BLOCKED',label:`Research on ${fmtDate(at)} could not finish (${plain(m.research_blocker)||'not enough reliable data'}). Other pages come first; this one is offered again after ${fmtDate(at+BLOCKED_RETRY_DAYS*DAY)}.`};
  if(['IMPROVE_EXISTING','NEW_DISTINCT_PAGE'].includes(m.research_decision)&&!publishedAfter&&age<IMPROVEMENT_OPEN_DAYS)
   return {status:'IMPROVEMENT_FOUND',decision:m.research_decision,researched_at:m.researched_at,
    label:`Research on ${fmtDate(at)} found an improvement (${DECISION_TEXT[m.research_decision]}). Next: review the proposal, publish it yourself, then record the publication.`};
 }
 if(row.position>0&&row.position<=3&&row.clicks>0&&row.ctr>=2)
  return {status:'WORKING',label:'Already working: top 3 in Google and getting clicks. Leave it.'};
 return {status:'CANDIDATE',label:'Not protected, not redirected and not recently changed — safe to research and improve.'};
}

function positionSentence(pos){
 if(pos<=10)return `It is already on Google page 1 (average position ${pos}), so a clearer title and first answer can win clicks quickest.`;
 if(pos<=20)return `It is on Google page 2 (average position ${pos}), close to page 1 where most clicks happen.`;
 if(pos<=50)return `It ranks around position ${pos}: people search for this, but the page needs stronger content to move up.`;
 return `It ranks far back (average position ${pos}); this is longer-term work.`;
}

const SCORE_RULE='Score = impressions × position weight (1.5 for positions 1–20, 1 for 21–50, 0.35 further back) × 1.15 when the page has 2 clicks or fewer.';

function assessGrowthCandidates(growth,{publications=[],windows=[],now=new Date(),pageRows=[],memory=[]}={}){
 const raw=new Map(pageRows.map(p=>[String(p.id),p]));
 const ctx={pages:growth.pages,now};
 const queries=growth.query_opportunities.map(q=>{
  const measurement=measurementFor(q.page_id,q.query,publications,windows,now)||measurementFor(q.page_id,null,publications,windows,now);
  const mem=memoryFor(q.page_id,q.query,memory);
  const base={...q,locked:q.case_study_locked,measurement,memory:mem};
  return {...q,measurement,eligibility:classify(base,raw.get(String(q.page_id)),ctx)};
 });
 const pages=growth.pages.map(p=>{
  const measurement=measurementFor(p.id,null,publications,windows,now);
  return {...p,measurement,eligibility:classify({...p,locked:p.case_study_active,measurement,memory:memoryFor(p.id,null,memory)},raw.get(String(p.id)),ctx)};
 });
 const skipped={};
 for(const q of queries)if(q.eligibility.status!=='CANDIDATE')skipped[q.eligibility.status]=(skipped[q.eligibility.status]||0)+1;
 const open=queries.filter(q=>q.eligibility.status==='CANDIDATE');
 let best=null;
 const started=[...queries,...pages].filter(x=>x.eligibility.status==='IMPROVEMENT_FOUND')
  .sort((a,b)=>ts(b.eligibility.researched_at)-ts(a.eligibility.researched_at))[0];
 if(started){
  const id=started.page_id??started.id;
  best={basis:'FINISH_STARTED_WORK',page_id:id,url:started.url,query:started.query||null,priority_score:started.priority_score??started.priority,
   runner_up:open[0]?{page_id:open[0].page_id,query:open[0].query,priority_score:open[0].priority_score}:null,
   reasons:[
    `On ${fmtDate(started.eligibility.researched_at)} the Growth research found an improvement for this page: ${DECISION_TEXT[started.eligibility.decision]}.`,
    'It has not been published yet. Finishing work that is already researched is quicker than starting something new.',
    open[0]?`After this, the next best is “${open[0].query}”.`:'There is no other open candidate right now.'
   ],score_rule:'Unfinished, already researched improvements come first; then the highest score. '+SCORE_RULE,measurement:started.measurement};
 }else if(open.length){
  const q=open[0],next=open[1];
  const reasons=[
   `Google showed this page ${q.impressions.toLocaleString('en-US')} times for “${q.query}”, but it received only ${q.clicks} click${q.clicks===1?'':'s'} (${q.ctr}% of searchers).`,
   positionSentence(q.position),
   'It is not a protected Case Study, not an old redirected address, and it was not changed in the last 28 days.',
   next?`Next best is “${next.query}” with score ${next.priority_score}; this one scores ${q.priority_score}.`:'There is no other open candidate right now.'
  ];
  best={basis:'VERIFIED_PAGE_QUERY_GSC',page_id:q.page_id,url:q.url,query:q.query,priority_score:q.priority_score,
   runner_up:next?{page_id:next.page_id,query:next.query,priority_score:next.priority_score}:null,
   reasons,score_rule:SCORE_RULE,measurement:q.measurement};
 }else{
  const p=pages.find(x=>x.eligibility.status==='CANDIDATE'&&x.priority>0);
  if(p)best={basis:'SAVED_PAGE_LEVEL_GSC',page_id:p.id,url:p.url,query:null,priority_score:p.priority,runner_up:null,
   reasons:[
    p.opportunity==='RANKING_GAP'
     ?`This page was shown ${p.impressions.toLocaleString('en-US')} times in Google at average position ${p.position.toFixed(1)}, but received only ${p.clicks} click${p.clicks===1?'':'s'}.`
     :`This page is on Google page 1–2 (average position ${p.position.toFixed(1)}) with ${p.impressions.toLocaleString('en-US')} impressions, but only ${p.ctr.toFixed(2)}% of searchers click.`,
    'It is not a protected Case Study, not an old redirected address, and it was not changed in the last 28 days.',
    'No verified search-query rows are available yet, so this choice uses saved page-level Search Console totals.'
   ],score_rule:'Pages with many impressions and few clicks rank first.',measurement:p.measurement};
 }
 const history=memory.map(m=>{
  const page=growth.pages.find(p=>String(p.id)===String(m.tracker_page_id));
  const since=ts(m.started_at||m.researched_at||m.skipped_at)||0;
  const pub=publications.filter(p=>String(p.tracker_page_id)===String(m.tracker_page_id)&&(ts(p.published_at)||0)>=since)
   .sort((a,b)=>ts(a.published_at)-ts(b.published_at))[0];
  const measurement=pub?measurementFor(pub.tracker_page_id,pub.query,[pub],windows,now):null;
  const outcome=m.status==='SKIPPED'?'Skipped by you'+(m.skip_reason?': '+m.skip_reason:'')
   :measurement?measurement.label
   :m.research_decision==='NO_CHANGE'?'Research: no change needed'
   :m.research_decision==='DATA_BLOCKED'?'Research could not finish ('+(plain(m.research_blocker)||'not enough reliable data')+')'
   :m.research_decision?'Research: '+DECISION_TEXT[m.research_decision]+' — not published yet'
   :m.started_at?'Research started — no result saved yet':'Open';
  return {page_id:m.tracker_page_id,url:page?page.url:null,date:fmtDate(m.started_at||m.skipped_at||m.researched_at),query:m.query||null,system_choice:!!m.system_choice,
   started_at:m.started_at||null,skipped_at:m.skipped_at||null,research_decision:m.research_decision||null,researched_at:m.researched_at||null,
   snapshot:m.snapshot||{},published_at:pub?pub.published_at:null,measurement,outcome};
 }).filter(h=>h.url);
 const chosen=history.filter(h=>h.system_choice&&h.started_at);
 const track_record={
  started:history.filter(h=>h.started_at).length,
  system_choices_started:chosen.length,
  skipped:history.filter(h=>h.skipped_at).length,
  improvement_found:history.filter(h=>['IMPROVE_EXISTING','NEW_DISTINCT_PAGE'].includes(h.research_decision)).length,
  no_change:history.filter(h=>h.research_decision==='NO_CHANGE').length,
  published:history.filter(h=>h.published_at).length,
  system_choices_measured:chosen.filter(h=>h.measurement&&h.measurement.status==='COMPARABLE_USER_PROVIDED_GSC').length,
  system_choices_click_change:chosen.filter(h=>h.measurement&&h.measurement.status==='COMPARABLE_USER_PROVIDED_GSC').reduce((a,h)=>a+h.measurement.click_change,0)
 };
 const records=publications.map(pub=>measurementFor(pub.tracker_page_id,pub.query,[pub],windows,now)).filter(Boolean);
 const measurement_summary={
  recorded:records.length,
  waiting:records.filter(r=>r.status==='WAITING_FOR_28_DAYS').length,
  needs_numbers:records.filter(r=>r.status==='NEEDS_DATED_GSC_WINDOWS').length,
  measured:records.filter(r=>r.status==='COMPARABLE_USER_PROVIDED_GSC').length,
  measured_click_change:records.filter(r=>r.status==='COMPARABLE_USER_PROVIDED_GSC').reduce((a,r)=>a+r.click_change,0)
 };
 return {best_candidate:best,history,track_record,
  no_candidate_reason:best?null:(growth.evidence_queries||growth.pages.some(p=>p.gsc_present)
   ?'Every page with Search Console demand is protected, redirected, recently changed, already researched, skipped by you or already working. Nothing needs to be changed right now.'
   :'There is no Search Console data yet, so the system cannot tell which page has the most demand. Run Growth research on the page that matters most to your business; it will say whether a change is needed.'),
  skipped,query_opportunities:queries,pages,measurement_summary};
}

module.exports={assessGrowthCandidates,redirectInfo,SCORE_RULE};
