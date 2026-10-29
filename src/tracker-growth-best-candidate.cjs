'use strict';
// Decides, transparently, which single tracked page/query the owner should work
// on first, and why every other row is not the first choice. Plain-language
// output for non-experts; no forecasts, no invented clicks or rankings.
const {sameUrl}=require('./growth-url-identity.cjs');
const {compareDatedWindows}=require('./tracker-growth-measurement.cjs');

const DAY=86400000;
const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const fmtDate=x=>{const t=Date.parse(x);return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):''};

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
  .sort((a,b)=>(Date.parse(b.published_at)||0)-(Date.parse(a.published_at)||0));
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

function assessGrowthCandidates(growth,{publications=[],windows=[],now=new Date(),pageRows=[]}={}){
 const raw=new Map(pageRows.map(p=>[String(p.id),p]));
 const ctx={pages:growth.pages};
 const queries=growth.query_opportunities.map(q=>{
  const measurement=measurementFor(q.page_id,q.query,publications,windows,now)||measurementFor(q.page_id,null,publications,windows,now);
  const base={...q,locked:q.case_study_locked,measurement};
  return {...q,measurement,eligibility:classify(base,raw.get(String(q.page_id)),ctx)};
 });
 const pages=growth.pages.map(p=>{
  const measurement=measurementFor(p.id,null,publications,windows,now);
  return {...p,measurement,eligibility:classify({...p,locked:p.case_study_active,measurement},raw.get(String(p.id)),ctx)};
 });
 const skipped={};
 for(const q of queries)if(q.eligibility.status!=='CANDIDATE')skipped[q.eligibility.status]=(skipped[q.eligibility.status]||0)+1;
 const open=queries.filter(q=>q.eligibility.status==='CANDIDATE');
 let best=null;
 if(open.length){
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
 const records=publications.map(pub=>measurementFor(pub.tracker_page_id,pub.query,[pub],windows,now)).filter(Boolean);
 const measurement_summary={
  recorded:records.length,
  waiting:records.filter(r=>r.status==='WAITING_FOR_28_DAYS').length,
  needs_numbers:records.filter(r=>r.status==='NEEDS_DATED_GSC_WINDOWS').length,
  measured:records.filter(r=>r.status==='COMPARABLE_USER_PROVIDED_GSC').length,
  measured_click_change:records.filter(r=>r.status==='COMPARABLE_USER_PROVIDED_GSC').reduce((a,r)=>a+r.click_change,0)
 };
 return {best_candidate:best,
  no_candidate_reason:best?null:(growth.evidence_queries||growth.pages.some(p=>p.gsc_present)
   ?'Every page with Search Console demand is protected, redirected, recently changed or already working. Nothing needs to be changed right now.'
   :'There is no Search Console data yet, so the system cannot tell which page has the most demand. Run Growth research on the page that matters most to your business; it will say whether a change is needed.'),
  skipped,query_opportunities:queries,pages,measurement_summary};
}

module.exports={assessGrowthCandidates,redirectInfo,SCORE_RULE};
