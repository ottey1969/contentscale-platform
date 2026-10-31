'use strict';
// What stands between a reviewable Growth proposal and publication. copy_ready only means "ready for human review".
// Nothing here publishes; the owner approves, and every blocker says what to do.
// countryRows: the Search Console import per country (page × query × country, one dated period). Rows of the target page
// itself for the search term are a starting point too: the page's own numbers, never another page's.
function publicationReadiness({decision={},destinationGsc=null,countryRows=[]}={}){
 const blockers=[];
 if(!decision.proposed_text)return {status:'NO_PROPOSAL',ready_for_publication:false,blockers};
 const unverified=Number(decision.claim_review?.counts?.general_statement_unverified)||0;
 if(unverified)blockers.push({code:'UNVERIFIED_STATEMENTS',count:unverified,required:true,
  detail:unverified+' statement(s) in the proposed text are not verified by any source.',
  action:'Check each statement against your own knowledge and sources; remove or rewrite what you cannot stand behind.'});
 const baseline=destinationGsc&&(destinationGsc.status==='EXACT_QUERY_VERIFIED'||destinationGsc.metrics);
 const target=norm(destinationGsc?.target_url||decision.target_url),term=String(destinationGsc?.focus_query||decision.focus_query||'').trim().toLowerCase();
 const own=(countryRows||[]).filter(r=>norm(r.page_url)===target&&String(r.query||'').trim().toLowerCase()===term).sort((a,b)=>b.impressions-a.impressions);
 const country_baseline=own.length?{source:'SEARCH_CONSOLE_PER_COUNTRY_IMPORT',period:{start:own[0].start_date||null,end:own[0].end_date||null},
  impressions:own.reduce((n,r)=>n+Number(r.impressions||0),0),clicks:own.reduce((n,r)=>n+Number(r.clicks||0),0),
  countries:own.slice(0,6).map(r=>({country:r.country,impressions:Number(r.impressions)||0,clicks:Number(r.clicks)||0,position:Math.round(Number(r.position)*10)/10}))}:null;
 if(!baseline&&!country_baseline)blockers.push({code:'NO_TARGET_PAGE_BASELINE',required:false,
  detail:'There are no verified Search Console rows for '+(destinationGsc?.target_url||'the target page')+' and "'+(destinationGsc?.focus_query||decision.focus_query||'this search term')+'". Rows of another page are never used for it, so the effect of the change cannot be measured against the page\'s own starting point.',
  action:'Import Search Console for the target page in the Tracker before publishing (28 days), then register the publication in Growth measurement. Search Console is optional: without it, confirm that you publish without a baseline.'});
 if(decision.case_study_locked===true&&decision.target_url&&decision.protected_url===decision.target_url)
  blockers.push({code:'CASE_STUDY_LOCKED',required:true,detail:'The target page is a locked Case Study.',action:'Do not change it while the Case Study runs.'});
 const required=blockers.filter(b=>b.required);
 return {...(country_baseline?{baseline:{...country_baseline,
   note:'Starting point of '+(destinationGsc?.target_url||decision.target_url)+' for “'+term+'” from the Search Console import per country ('+(country_baseline.period.start||'?')+' – '+(country_baseline.period.end||'?')+'): '+
    country_baseline.impressions+' impressions, '+country_baseline.clicks+' clicks. After publishing, register the publication in Growth measurement for the 28-day comparison.'}}:{}),
  status:required.length?'NOT_READY_FOR_PUBLICATION':blockers.length?'READY_FOR_OWNER_APPROVAL_WITH_NOTES':'READY_FOR_OWNER_APPROVAL',
  ready_for_publication:false,blockers,
  note:'copy_ready means ready for human review, not ready for publication. Publication always needs the owner\'s approval; nothing is published automatically.'};
}
function norm(u){try{const x=new URL(u);x.hash='';x.search='';return x.href.replace(/\/$/,'')}catch{return String(u||'').replace(/\/$/,'')}}
module.exports={publicationReadiness};
