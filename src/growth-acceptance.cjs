'use strict';
// Production acceptance of a Growth report (the downloaded "complete review" JSON), against the owner's five criteria:
// 1 no comparison across fields, 2 the same decision for the same evidence, 3 a concrete proposal for a verified gap,
// 4 nothing unproven published, 5 a clear next step when information is missing. Read only; it judges what the report
// itself states and never fetches anything. A criterion that the report cannot show is NOT_SHOWN, never a pass.
const TASK_CHECK_BLOCKERS=new Set(['SHARED_COMPETITOR_REQUIREMENTS','TASK_MEANING_NOT_VERIFIED','SUBSTANTIVE_GAP_NOT_VERIFIED']);
const reportOf=d=>d&&d.report&&d.report.editorial_decision_gate?d.report:d||{};
const readPages=r=>(r.search_discovery?.competitor_fetch_log||[]).filter(x=>x.outcome==='READABLE').map(x=>x.url).sort();

function checkReport(raw,{expectMarkets=null}={}){
 const r=reportOf(raw),g=r.editorial_decision_gate||{},gl=r.gap_list||null,checks=[];
 const add=(id,status,detail)=>checks.push({id,status,detail});
 const meaning=r.serp_meaning||{},subject=r.competitor_overview?.subject_check||null;
 // 0. The research ran where it should (the owner's target markets).
 const searched=(r.search_discovery?.scope?.searched_markets||[]).map(x=>String(x).toUpperCase());
 if(expectMarkets&&expectMarkets.length){
  const want=expectMarkets.map(x=>String(x).toUpperCase());
  add('MARKET',want.every((c,i)=>i>1||searched.includes(c))?'PASS':'FAIL','Searched '+(searched.join(', ')||'nothing')+'; expected '+want.join(', ')+' (the first two are searched).');
 }
 const lost=r.search_discovery?.google_redirect_links?.unresolved||0,usable=(r.search_discovery?.leads||[]).length;
 if(lost)add('SEARCH_RESULTS_LOST',lost>=usable?'WARN':'INFO',lost+' result(s) were Google redirect links that could not be opened; '+usable+' usable result(s) remained.');
 // 1. No comparison across fields.
 if(meaning.status==='DIFFERENT_MEANING')
  add('1_NO_CROSS_FIELD',['IMPROVE_EXISTING','NEW_DISTINCT_PAGE'].includes(g.decision)||(gl&&gl.writing_allowed!==false&&(gl.recommended||[]).length)?'FAIL':'PASS',
   'Google uses the term for another subject ('+(meaning.basis||'TITLES')+'); decision '+g.decision+'.');
 else if(subject&&subject.status==='DIFFERENT_SUBJECT')add('1_NO_CROSS_FIELD','FAIL','The read pages are about another subject, but the meaning was not set to different.');
 else if(subject&&subject.status!=='NOT_ANSWERED')add('1_NO_CROSS_FIELD','PASS','The AI subject check answered for '+subject.pages.length+' read page(s): '+subject.different+' about another subject.');
 else if((r.competitor_overview?.ranking_pages_read||0)>0)add('1_NO_CROSS_FIELD','NOT_SHOWN','The AI subject check gave no answer for the read pages (topics '+(r.competitor_overview?.topics_status||'unknown')+'): the field check rests on titles only.');
 else add('1_NO_CROSS_FIELD','NOT_SHOWN','No ranking page was read, so nothing was compared.');
 // 3. A concrete proposal for a verified gap.
 if(g.decision==='IMPROVE_EXISTING'){
  const parts=[g.proposed_text&&'text',g.draft_heading&&'heading',(g.placement?.section_heading||g.target_section)&&'placement',g.target_url&&'target'].filter(Boolean);
  add('3_CONCRETE_PROPOSAL',parts.length===4?'PASS':'FAIL',parts.length===4?'Proposal for '+g.target_url+': “'+g.draft_heading+'” at “'+(g.placement?.section_heading||g.target_section)+'”'+((g.additional_sections||[]).length?' + '+g.additional_sections.length+' more':'')+'.':'Proposal incomplete: has '+(parts.join(', ')||'nothing')+'.');
 }else add('3_CONCRETE_PROPOSAL','NOT_APPLICABLE','Decision '+g.decision+': no verified gap claimed.');
 // 4. Nothing unproven published.
 const pr=g.publication_readiness,unverified=Number(g.claim_review?.counts?.general_statement_unverified)||0;
 const auto=g.publish_allowed===true||r.editorial_work_packet?.publication_allowed===true;
 add('4_NO_UNPROVEN_PUBLICATION',auto||(unverified&&pr&&pr.status!=='NOT_READY_FOR_PUBLICATION')?'FAIL':unverified&&!pr?'NOT_SHOWN':'PASS',
  auto?'Publication is allowed automatically.':unverified?unverified+' unverified statement(s); publication readiness '+(pr?pr.status:'not stated')+'.':'No unverified statements in a proposal; nothing is published automatically.');
 // 5. A clear next step when information is missing, without an unnecessary DATA_BLOCKED.
 if(g.decision==='DATA_BLOCKED'){
  const step=r.outcome_context?.headline||g.next_action||(g.missing_evidence||[])[0]?.detail;
  const taskOnly=TASK_CHECK_BLOCKERS.has(g.blocker_code)&&(r.competitor_overview?.ranking_pages_read||0)>=2;
  // "Resolve the named blocker" names no step the owner can take.
  const vague=/^Resolve the named blocker/i.test(String(r.outcome_context?.headline||g.next_action||''));
  add('5_NEXT_STEP',!step||vague?'FAIL':taskOnly&&!r.outcome_context&&gl&&(gl.recommended||[]).length?'FAIL':'PASS',
   (g.blocker_code||'')+': '+(step?String(step).slice(0,220):'no next step stated')+(taskOnly?' (task-check block: the topic list stays usable)':''));
 }else if(g.decision==='NO_CHANGE')add('5_NEXT_STEP',r.outcome_context||g.next_action?'PASS':'FAIL',String(r.outcome_context?.headline||g.next_action||'no next step').slice(0,220));
 else add('5_NEXT_STEP','NOT_APPLICABLE','Decision '+g.decision+'.');
 const fail=checks.some(c=>c.status==='FAIL'),unshown=checks.some(c=>c.status==='NOT_SHOWN');
 return {url:r.url,target_url:g.target_url||null,query:g.focus_query||r.search_discovery?.query||null,decision:g.decision,
  read_pages:readPages(r),verdict:fail?'NOT_ACCEPTED':unshown?'NOT_PROVEN_BY_THIS_REPORT':'ACCEPTED',checks};
}
// 2. The same decision for the same evidence: reports of the same page and term that read the same ranking pages must agree.
function compareRuns(raws){
 const runs=raws.map(x=>checkReport(x));const groups=new Map();
 for(const r of runs){const k=r.url+'|'+String(r.query||'').toLowerCase();if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
 const out=[];
 for(const [k,list] of groups){if(list.length<2)continue;
  for(let i=1;i<list.length;i++){const a=list[i-1],b=list[i],same=a.read_pages.join(' ')===b.read_pages.join(' ');
   out.push({id:'2_CONSISTENT',key:k,status:!same?'DIFFERENT_EVIDENCE':a.decision===b.decision?'PASS':'FAIL',
    detail:same?'Same ranking pages read; decisions '+a.decision+' and '+b.decision+'.':'Different ranking pages read ('+a.read_pages.length+' vs '+b.read_pages.length+'), so a different decision is possible: '+a.decision+' / '+b.decision+'.'})}}
 return out;
}
module.exports={checkReport,compareRuns};

if(require.main===module){
 const args=process.argv.slice(2),markets=[];const files=[];
 for(let i=0;i<args.length;i++){if(args[i]==='--market')markets.push(...String(args[++i]).split(','));else files.push(args[i])}
 const raws=files.map(f=>JSON.parse(require('fs').readFileSync(f,'utf8')));
 for(const [i,raw] of raws.entries()){const r=checkReport(raw,{expectMarkets:markets});
  console.log('\n'+files[i]+'\n'+r.url+' · “'+r.query+'” · '+r.decision+' → '+r.verdict);
  for(const c of r.checks)console.log('  '+c.status.padEnd(15)+c.id.padEnd(28)+c.detail)}
 for(const c of compareRuns(raws))console.log('\n  '+c.status.padEnd(15)+c.id.padEnd(28)+c.key+' — '+c.detail);
}
