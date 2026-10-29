'use strict';
// Deterministic evidence-based result, with no inferred content gaps from lexical overlap.
// Publication and Case Study modifications are never authorized by this decision.
const {deriveEvidenceStatus}=require('./growth-evidence-status.cjs');
const normQ=x=>String(x||'').trim().toLowerCase().replace(/\s+/g,' ');
// Evidence-based path (coverage supplied): intent + complete body evidence + site architecture.
function decideFromCoveragePlan({base,report,destination,coverage,serpIntent,destinationIntent,attempts,query,target,protection,protectedQueries,fail}){
 const facts=base.facts,uncertainties=base.uncertainties;
 const strong=(protection.case_study_locked&&protectedQueries.find(x=>normQ(x.query)===normQ(query)&&x.position<=3&&x.clicks>=10))||null;
 if(strong){
  facts.push({code:'FOCUS_QUERY_ALREADY_WINNING',source:'PAGE_VERIFIED_GSC_ON_TRACKED_URL',query:strong.query});
  return {...base,decision:'NO_CHANGE',decision_scope:'PROTECTED_WINNING_QUERY',verified_gap:false,gap_basis:null,
   reason:'The focus query already ranks first-page on the protected, locked URL; changing it would risk the working baseline.',
   closure_report:{covered_by:report.url,query:strong.query,note:'Closure is about this query only; other queries and pages remain open.'},
   next_action:'Continue research on other queries or pages without changing the Case Study baseline.'};
 }
 const sources=serpIntent?.status==='SERP_INTENT_OBSERVED';
 const readable=(coverage.competitors_considered||[]).length;
 const missing=[];
 // A truncated destination still PROVES what it teaches in the captured part; it only cannot prove absence. So truncation
 // blocks a gap claim (checked below, once the tasks are known), not the whole decision.
 const destinationTruncated=!!(coverage.destination_truncated||destination.own_html_truncated);
 if(!target||destination.status==='EXISTING_DESTINATION_EVIDENCE_UNAVAILABLE'||destination.status==='OWN_SOURCE_INCOMPLETE')
  missing.push({code:'TARGET_HTML_UNAVAILABLE',detail:'The target page body could not be read after static fetch and the restricted browser render.'});
 if(!sources)missing.push({code:'SERP_INTENT_EVIDENCE',detail:serpIntent?.reason||'Fewer than three non-discussion organic results agree on one search intent.',
  observed:serpIntent?{considered:serpIntent.organic_leads_considered,agreeing:serpIntent.agreeing_leads,class_counts:serpIntent.class_counts||null,method:serpIntent.method}:null});
 const cd=coverage.competitor_diagnostics||{};
 if(readable<2||(cd.distinct_hosts!==undefined&&cd.distinct_hosts<2))missing.push({code:'READABLE_COMPETITOR_ARTICLES',
  detail:'Fewer than two competitor articles on different sites yielded readable sections. Diagnostics: received '+(cd.received??'?')+', without HTML '+(cd.without_html??'?')+
   ', no readable sections '+(cd.with_no_readable_sections??'?')+', used '+(cd.used??readable)+' ('+(cd.used_partial_capture??'?')+' cut at the fetch limit, which still counts as evidence of what they teach), distinct sites '+(cd.distinct_hosts??'?')+'.'});
 // When the destination is the locked Case Study (directly or through a proven 301), that protection is the primary outcome:
 // no website change is possible or needed now. Missing research evidence is reported after it as a separate limitation.
 const protectedId=(destination.destination_identity?.source_protected===true||destination.destination_identity?.destination_protected===true)?destination.destination_identity:null;
 if(missing.length&&protectedId){
  const first={code:'DESTINATION_IS_PROTECTED_CASE_STUDY',detail:protectedMessage(protectedId)};
  return {...base,decision:'DATA_BLOCKED',blocker_code:first.code,missing_evidence:[first,...missing],research_limitations:missing,
   attempted_sources:attempts,reason:'The page for this query is the protected Case Study'+(protectedId.kind==='PERMANENT_REDIRECT'?' (reached through a permanent redirect)':'')+'; no website change is required now. Separately, research evidence was incomplete: '+missing.map(x=>x.code).join(', ')+'.',
   next_action:'Keep the page and any working redirect unchanged until the Case Study measurement cycle ends. Research limitations are listed separately.'};
 }
 if(missing.length)return {...base,decision:'DATA_BLOCKED',blocker_code:missing[0].code,missing_evidence:missing,
  attempted_sources:attempts,reason:'Required evidence was not accessible: '+missing.map(x=>x.code).join(', ')+'.',
  next_action:'Resolve the named blocker; every automatic alternative listed under attempted_sources was already tried.'};
 if((coverage.unverifiable_site_pages||[]).length)uncertainties.push('Same-site pages not fully readable ('+coverage.unverifiable_site_pages.length+'): a task could already be taught there beyond the captured part, so verify before publishing.');
 const supported=(coverage.tasks||[]).filter(t=>t.supported_by_competitors);
 facts.push({code:'SERP_INTENT',value:serpIntent.intent,agreeing_leads:serpIntent.agreeing_leads,of:serpIntent.organic_leads_considered});
 facts.push({code:'DESTINATION_INTENT',value:destinationIntent?.class||null,verdict:destinationIntent?.verdict||'UNVERIFIED'});
 const evidenceFor=t=>[...t.competitor_support.slice(0,2).map(x=>({type:'COMPETITOR',source_url:x.url,heading:x.heading,excerpt:x.excerpt.slice(0,300)})),
  ...t.destination.passages.slice(0,1).map(x=>({type:'OWN_PAGE',source_url:target,heading:x.heading,excerpt:x.text}))];
 // A protected destination stays the primary outcome for every later block too; the research gap is then a limitation.
 const blocked=(code,detail,reason,next)=>protectedId&&code!=='DESTINATION_IS_PROTECTED_CASE_STUDY'?
  {...base,decision:'DATA_BLOCKED',blocker_code:'DESTINATION_IS_PROTECTED_CASE_STUDY',
   missing_evidence:[{code:'DESTINATION_IS_PROTECTED_CASE_STUDY',detail:protectedMessage(protectedId)},{code,detail}],research_limitations:[{code,detail}],attempted_sources:attempts,
   reason:'The page for this query is a protected Case Study; no website change is required now. Separately: '+reason,
   next_action:'Keep the page and any working redirect unchanged until the Case Study measurement cycle ends. Research limitations are listed separately.'}:
  {...base,decision:'DATA_BLOCKED',blocker_code:code,missing_evidence:[{code,detail}],attempted_sources:attempts,reason,next_action:next};
 // Every outcome below (a new page, an edit, or "nothing missing") is defined by shared reader tasks; without one there is no plan.
 if(!supported.length)
  return blocked('SHARED_COMPETITOR_REQUIREMENTS','No reader task was taught by two independent competitor articles, so there is no shared requirement to compare. '+explainNoShared(coverage.task_derivation),
   'Competitor pages were read but share no common reader task.','Add more readable competitor articles for the same query, or accept the page as is.');
 const identity=destination.destination_identity||null;
 if(identity?.resolves_to_source)facts.push({code:'DESTINATION_RESOLVES_TO_SOURCE_PAGE',basis:identity.basis,url:identity.url,source_url:identity.source_url});
 // Different search intent: a separate page, but only when no same-site page already serves it.
 if(destinationIntent?.verdict==='DIFFERENT'){
  const alt=(report.site_architecture?.compatible_existing_pages||[]);
  const overlap=(report.site_architecture?.intent_overlap_risks||[]).filter(x=>x.verified_cannibalization===true);
  if(!alt.length&&!overlap.length)
   return {...base,decision:'NEW_DISTINCT_PAGE',verified_gap:false,gap_observed:true,gap_basis:'DIFFERENT_SEARCH_INTENT_AND_NO_COMPATIBLE_SAME_SITE_PAGE',
    reason:'Live results agree on a '+serpIntent.intent+' intent, but the selected page is '+(destinationIntent.class||'a different type')+'; no compatible same-site page was found.',
    distinct_intent_evidence:{serp:serpIntent.leads.slice(0,5),destination:destinationIntent},
    new_page_plan:{working_query:query,facts_source_url:target,tasks:supported.slice(0,4).map(t=>({code:t.code,label:t.label,match:t.match,competitor_evidence:t.competitor_support.slice(0,2)})),
     internal_links:{from:[target,report.url].filter(Boolean),anchor_policy:'Natural anchor inside a relevant existing paragraph; verify no duplicate link first.'}},
    evidence:supported.flatMap(evidenceFor).slice(0,6),
    next_action:'Owner reviews the new-page draft and the intent evidence; publication stays disabled.'};
  uncertainties.push('A compatible same-site page exists or overlap is verified; a new URL would risk cannibalization.');
 }
 const gaps=supported.filter(t=>t.destination.status!=='COVERED'&&!(t.covered_elsewhere_on_site||[]).length);
 const linked=supported.filter(t=>t.destination.status!=='COVERED'&&(t.covered_elsewhere_on_site||[]).length);
 // Absence on a truncated destination is unknown, never a gap.
 if(gaps.length&&destinationTruncated)
  return blocked('COMPLETE_DESTINATION_HTML','The captured destination HTML was cut'+captureNote(coverage.destination_capture)+' and '+gaps.length+' shared task(s) were not observed in the captured part ('+gaps.map(t=>t.code).join(', ')+'); absence after the cut cannot be claimed.',
   'Required evidence was not accessible: COMPLETE_DESTINATION_HTML.','Re-run when the destination can be read completely, or check the named task(s) on the live page by hand.');
 // "Nothing is missing" is only as strong as the competitor task set: a competitor cut at the fetch limit may teach more after the cut.
 const completeHosts=new Set((coverage.competitors_considered||[]).filter(c=>c.partial!==true).map(c=>c.host)).size;
 if(!gaps.length&&completeHosts<2)
  return blocked('COMPLETE_COMPETITOR_HTML','All shared tasks are taught on the destination, but fewer than two competitor articles were captured completely ('+completeHosts+'), so tasks taught after a cut are unknown. A NO_CHANGE closure needs a complete task set.',
   'Required evidence was not accessible: COMPLETE_COMPETITOR_HTML.','Re-run with complete competitor captures before closing this query as NO_CHANGE.');
 if(!gaps.length)
  return {...base,decision:'NO_CHANGE',decision_scope:'DESTINATION_TEACHES_SHARED_TASKS',verified_gap:false,gap_basis:null,
   reason:'Every reader task taught by two or more independent competitors is already taught on the destination or on another same-site page.'+
    (destinationTruncated?' The destination capture was cut at the readable-HTML limit; every task was found before the cut.':''),
   closure_report:{destination:target,tasks_checked:supported.map(t=>({code:t.code,label:t.label,destination_status:t.destination.status,
     destination_passages:t.destination.passages,covered_elsewhere:t.covered_elsewhere_on_site||[]})),
    competitors:coverage.competitors_considered,limit:'Lexical concept groups on captured HTML; no ranking or quality claim.'},
   internal_link_candidates:linked.map(t=>({task:t.code,link_to:t.covered_elsewhere_on_site[0].url,reason:'Task is taught there; link instead of duplicating.'})),
   evidence:supported.flatMap(evidenceFor).slice(0,6),next_action:'Keep the page unchanged; revisit only if live results or the page change.'};
 // An edit on a URL that is the locked Case Study under another address is an edit of the Case Study.
 if(identity?.source_protected||identity?.destination_protected)
  return blocked('DESTINATION_IS_PROTECTED_CASE_STUDY',protectedMessage(identity)+' The missing task(s) '+gaps.map(t=>t.code).join(', ')+' cannot be added there now.',
   'The only page for this query is the protected Case Study.','Revisit after the Case Study measurement cycle, or create a distinct page only if the search intent differs.');
 const chosen=gaps.sort((a,b)=>(b.independent_sources-a.independent_sources)||(a.destination.status==='PARTIAL'?-1:1)).slice(0,2);
 // verified_gap stays false until a draft for the task passes every check (the producer sets it); gap_observed is the research finding.
 return {...base,decision:'IMPROVE_EXISTING',verified_gap:false,gap_observed:true,
  gap_basis:'TASK_TAUGHT_BY_2_PLUS_INDEPENDENT_COMPETITORS_AND_NOT_FULLY_COVERED_IN_COMPLETE_DESTINATION_HTML',
  reason:'The existing page is a compatible destination, and '+chosen.length+' reader task(s) taught by 2+ independent competitors are missing ('+
   chosen.filter(t=>t.destination.status!=='PARTIAL').length+') or only partly covered ('+chosen.filter(t=>t.destination.status==='PARTIAL').length+') on it. A task counts as verified only after a draft for it passes the checks.',
  improvement_plan:{target_url:target,preserve:['existing title','existing H1','existing useful paragraphs','existing internal links'],
   tasks:chosen.map(t=>({code:t.code,label:t.label,match:t.match,destination_status:t.destination.status,placement:t.placement,
    competitor_evidence:t.competitor_support.slice(0,2),destination_evidence:t.destination.passages})),
   internal_links_to_review:linked.map(t=>({task:t.code,link_to:t.covered_elsewhere_on_site[0].url,reason:'Already taught there.'})),
   quality_conditions:['No numeric or factual claim that the destination page does not already state or the owner cannot verify.','Do not reproduce competitor wording.',
    'Do not repeat anything the destination already teaches.','Keep title and H1.','Owner approval before any publication.']},
  evidence:chosen.flatMap(evidenceFor).slice(0,6),
  copy_ready:false,copy_status:'AWAITING_OWNER_DRAFT_COMPLETION',
  next_action:'Owner completion drafts only the missing task(s) for the stated placement; publication stays disabled.'};
}

const protectedMessage=id=>id.destination_protected&&!id.source_protected?'The destination '+id.locked_url+' is itself a locked Case Study page. Edits are blocked to protect its baseline; no website change is required.':(id.kind==='PERMANENT_REDIRECT'?'The selected URL '+id.url+' permanently redirects ('+(id.http_statuses||[]).join(' → ')+') to ':'The selected URL '+id.url+' resolves ('+String(id.basis||'').toLowerCase().replace(/_/g,' ')+') to ')+
 'the locked Case Study page '+id.source_url+'. Edits are blocked to protect the Case Study baseline; no website change is required.';
const captureNote=c=>!c?'':c.cause==='RAW_RESPONSE_EXCEEDED_BYTE_CAP'?' (the response exceeded the '+c.raw_cap_bytes+'-byte download cap)':
 c.cause==='READABLE_HTML_EXCEEDED_LIMIT'?' (readable HTML '+c.readable_chars+' characters after removing scripts and styles, limit '+c.readable_limit+')':'';
function explainNoShared(td){
 if(!td)return 'Task derivation did not run (fewer than two readable sites).';
 const per=(td.hosts||[]).map(h=>h.host+': '+h.sections_used+' of '+h.sections_read+' sections used'+(h.sections_excluded_as_promotional?' ('+h.sections_excluded_as_promotional+' promotional excluded)':'')).join('; ');
 const one=(td.concepts_on_one_site_only||[]).slice(0,5).map(x=>x.concept+' ('+x.site+')').join(', ');
 return 'Sites read — '+per+'.'+(one?' Concepts taught on only one site: '+one+'.':'')+((td.topic_wide_words_ignored||[]).length?' Topic-wide words ignored: '+td.topic_wide_words_ignored.join(', ')+'.':'');
}
// A planned IMPROVE_EXISTING / NEW_DISTINCT_PAGE becomes copy_ready ONLY when the producer
// (growth-verified-opportunity.cjs) attached a verified opportunity for the exact query, target and type.
function decideFromCoverage(args){
 const planned=decideFromCoveragePlan(args);
 const opp=args.report?.verified_editorial_opportunity;
 if(!opp||opp.verified!==true||!['IMPROVE_EXISTING','NEW_DISTINCT_PAGE'].includes(planned.decision)||opp.type!==planned.decision)return planned;
 const sameScope=opp.focus_query===planned.focus_query&&opp.target_url===planned.target_url;
 const hasEvidence=Array.isArray(opp.evidence)&&opp.evidence.some(x=>x?.source_url&&x?.excerpt);
 const hasText=typeof opp.proposed_text==='string'&&opp.proposed_text.trim().length>=80;
 if(!sameScope||!hasEvidence||!hasText)return {...planned,uncertainties:[...planned.uncertainties,'A verified opportunity was supplied but did not match the planned scope, evidence or text length; it was ignored.']};
 if(planned.decision==='NEW_DISTINCT_PAGE'&&!(opp.site_overlap_checked===true&&opp.distinct_intent_verified===true))return planned;
 return {...planned,copy_ready:true,verified_gap:true,copy_status:'REVIEW_READY',verified_by:opp.producer||'VERIFIED_EDITORIAL_OPPORTUNITY',
  proposed_text:opp.proposed_text,target_section:opp.target_section,placement:opp.placement||planned.placement||null,
  draft_heading:opp.draft_heading||null,additional_sections:opp.additional_sections||[],draft_validation:opp.draft_validation||[],claim_review:opp.claim_review||null,evidence_confidence:opp.claim_review?.confidence||null,
  new_page_draft:opp.new_page_draft||undefined,
  improvement_plan:planned.improvement_plan&&Array.isArray(opp.task_codes)?{...planned.improvement_plan,
   tasks:planned.improvement_plan.tasks.filter(t=>opp.task_codes.includes(t.code)),
   unverified_task_codes:planned.improvement_plan.tasks.filter(t=>!opp.task_codes.includes(t.code)).map(t=>t.code)}:planned.improvement_plan,
  reason:planned.decision==='IMPROVE_EXISTING'&&Array.isArray(opp.task_codes)?
   'The existing page is a compatible destination and '+opp.task_codes.length+' reader task(s) taught by 2+ independent competitors are missing or only partly covered on it; the draft for '+(opp.task_codes.length===1?'it':'them')+' passed the task, duplication, wording and claim checks.':planned.reason,
  evidence:(()=>{const seen=new Set();return [...opp.evidence].filter(e=>{const k=[e.type,e.source_url,e.heading].join('|');if(seen.has(k))return false;seen.add(k);return true})})(),
  next_action:planned.decision==='NEW_DISTINCT_PAGE'?'Owner reviews the new-page draft; publication remains disabled.':'Owner reviews the source-backed edit at the stated placement; publication remains disabled.'};
}
// Every decision carries the same evidence ladder, so downstream outputs never re-derive verified_gap / copy_ready on their own.
function decideGrowthEditorialAction(args={}){
 const decision=decideGrowthEditorialActionCore(args);
 return {...decision,evidence_status:deriveEvidenceStatus({decision,serpIntent:args.serpIntent||null,coverage:args.coverage||null})};
}
function decideGrowthEditorialActionCore({report={},destination={},coverage=null,serpIntent=null,destinationIntent=null,attempts=[]}={}){
 const action=report.growth_decision?.primary_next_action||{};
 const query=String(action.query||report.search_discovery?.target_query||report.search?.focus_query||'').trim();
 const protectedUrl=String(report.url||''),target=destination.target_url||destination.own_url||null;
 const comparisons=Array.isArray(destination.comparisons)?destination.comparisons:[];
 const protection=report.growth_decision?.protection||{};
 const protectedQueries=report.growth_decision?.protected_queries||[];
 const facts=[],uncertainties=[],evidence=[];
 const attemptsList=Array.isArray(attempts)?attempts:[];
 const base={focus_query:query,protected_url:protectedUrl,target_url:target,
  case_study_locked:protection.case_study_locked===true,preserve_title_h1:true,
  publish_allowed:false,copy_ready:false,verified_gap:false,
  gsc_optional:true,exact_page_query_metrics_verified:!!action.metrics,
  evidence_count:comparisons.length,facts,uncertainties,evidence,attempted_sources:attemptsList};
 if(query)facts.push({code:'TOPIC_SELECTED',value:query,source:action.query?'PAGE_VERIFIED_GSC_OR_TRACKED_TOPIC':'TRACKED_PAGE_TOPIC'});
 const fail=(reason,code)=>({...base,decision:'DATA_BLOCKED',reason,blocker_code:code,missing_evidence:[{code,detail:reason}],attempted_sources:attemptsList,
  next_action:'Resolve the named source or intent blocker; do not create text without matching evidence.'});
 if(!query)return fail('No meaningful page topic was selected.','TOPIC_NOT_RESOLVED');
 if(coverage)return decideFromCoverage({base,report,destination,coverage,serpIntent,destinationIntent,attempts:attemptsList,query,target,protection,protectedQueries,fail});
 if(!target||destination.status==='EXISTING_DESTINATION_EVIDENCE_UNAVAILABLE'||destination.status==='OWN_SOURCE_INCOMPLETE')
  return fail('Readable target-page sections were unavailable.','TARGET_HTML_UNAVAILABLE');
 if(destination.own_html_truncated===true)
  return fail('The fetched page or competitor source was truncated.','HTML_TRUNCATED');
 const reliable=comparisons.filter(x=>x.match_status==='POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED'&&x.nearest_existing_section&&x.competitor_url);
 for(const c of reliable.slice(0,3)){
  evidence.push({source_url:target,type:'OWN_PAGE',heading:c.nearest_existing_section.heading,excerpt:c.nearest_existing_section.excerpt||''});
  evidence.push({source_url:c.competitor_url,type:'COMPETITOR',heading:c.competitor_heading,excerpt:c.competitor_excerpt||''});
 }
 if(protection.case_study_locked&&target===protectedUrl&&protectedQueries.some(x=>normQ(x.query)===normQ(query)&&x.position<=3&&x.clicks>=10)){
  facts.push({code:'STRONG_PROTECTED_QUERY',source:'PAGE_VERIFIED_GSC',queries:protectedQueries.slice(0,4)});
  uncertainties.push('Other separate growth opportunities may exist; protecting this page is not proof of a perfect article.');
  return {...base,decision:'NO_CHANGE',reason:'Preserve the strong, locked existing page and its verified search baseline.',next_action:'Continue research on other pages without changing this Case Study baseline.'};
 }
 if(!reliable.length){
  uncertainties.push('No two complete, intent-aligned passages can be compared to justify a specific content change.');
  return fail('No reliable paired target-page and competitor passage establishes an editorial change.','PAIRED_EVIDENCE_MISSING');
 }
 // A positive change decision needs separately verified, source-linked evidence
 // and concrete reviewer text, never only a regex or an AI confidence score.
 const opportunity=report.verified_editorial_opportunity;
 if(opportunity?.verified===true&&opportunity.focus_query===query&&
    opportunity.target_url===target&&Array.isArray(opportunity.evidence)&&
    opportunity.evidence.some(x=>x?.source_url&&x?.excerpt)&&
    typeof opportunity.proposed_text==='string'&&opportunity.proposed_text.trim().length>=80&&
    typeof opportunity.target_section==='string'&&opportunity.target_section.trim()){
  if(opportunity.type==='IMPROVE_EXISTING')
   return {...base,decision:'IMPROVE_EXISTING',reason:'A sourced, distinct answer gap and exact review text were independently verified.',
    proposed_text:opportunity.proposed_text,target_section:opportunity.target_section,
    evidence:[...evidence,...opportunity.evidence],copy_ready:true,
    verified_gap:true,next_action:'Owner reviews source-backed edit; publication remains disabled.'};
  if(opportunity.type==='NEW_DISTINCT_PAGE'&&opportunity.site_overlap_checked===true&&opportunity.distinct_intent_verified===true)
   return {...base,decision:'NEW_DISTINCT_PAGE',reason:'Distinct search intent and site overlap were verified with source-linked editorial copy.',
    proposed_text:opportunity.proposed_text,target_section:opportunity.target_section,
    evidence:[...evidence,...opportunity.evidence],copy_ready:true,
    verified_gap:true,next_action:'Owner reviews proposed new page; publication remains disabled.'};
 }
 // Lexical overlap proves neither completeness nor an absent answer.
 // Keep a factual recommendation without pretending to have verified an edit.
 uncertainties.push('Paired passages have lexical overlap but substantive user-task sufficiency has not been verified.');
 return {...base,decision:'DATA_BLOCKED',blocker_code:'SUBSTANTIVE_GAP_NOT_VERIFIED',missing_evidence:[{code:'SUBSTANTIVE_GAP_NOT_VERIFIED',detail:'Paired passages overlap lexically but no reader task was verified.'}],attempted_sources:attemptsList,
  reason:'Relevant sections were compared, but no supported new fact or reader task has been established.',
  next_action:'Verify one distinct unanswered reader task with sourced supporting material or explicitly decide NO_CHANGE.',
  strongest_comparison:{own_heading:reliable[0].nearest_existing_section.heading,
   competitor_heading:reliable[0].competitor_heading,competitor_url:reliable[0].competitor_url}};
}
module.exports={decideGrowthEditorialAction};
