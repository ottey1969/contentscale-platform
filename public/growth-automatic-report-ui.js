(function(){
 'use strict';
 var main=document.querySelector('main[data-page-id]'),container=document.getElementById('growthAutomaticReport');
 if(!main||!container)return;
 var id=main.getAttribute('data-page-id'),token=location.pathname.split('/')[2];
 var endpoint='/api/tracker-client/'+encodeURIComponent(token)+'/growth/auto-research?page_id='+encodeURIComponent(id);
 var last=null;
 function node(tag,text,parent){
  var n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);
  if(parent)parent.appendChild(n);return n;
 }
 function link(url,label,parent){
  try{var u=new URL(url);if(u.protocol!=='https:')return node('span',label,parent);
   var a=node('a',label,parent);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a
  }catch{return node('span',label,parent)}
 }
 var researchDetails=null;
 function section(title){var s=node('section',null,researchDetails||container);node('h2',title,s);return s}
 function table(headers,rows,parent){
  var t=node('table',null,parent),head=node('thead',null,t),tr=node('tr',null,head);
  headers.forEach(h=>node('th',h,tr));
  var body=node('tbody',null,t);
  rows.forEach(row=>{var r=node('tr',null,body);row.forEach(value=>node('td',value===null?'Unknown':value,r))});
  return t;
 }
 function list(data,parent,display){
  if(!Array.isArray(data)||!data.length){node('p','No supported observations in this source.',parent);return}
  var ul=node('ul',null,parent);
  data.forEach(item=>node('li',display(item),ul));
 }
 function render(d){
  container.textContent='';researchDetails=null;
  var decision=d.growth_decision||{},recommendation=decision.primary_next_action;
  var ownerReport=main.getAttribute('data-owner-draft')==='true'&&d.access?.owner_report===true;
  var outcome=ownerReport&&d.editorial_work_packet?.editorial_decision?
   d.editorial_work_packet.editorial_decision:(d.editorial_decision_gate||{});
  var primary=section('Growth result · decision and evidence');
  node('h3',String(outcome.decision||'DATA_BLOCKED').replace(/_/g,' '),primary);
  node('p',String(outcome.reason||outcome.next_action||'A verified editorial decision was not available.'),primary);
  if(outcome.target_url){var chosen=node('p','Target page: ',primary);link(outcome.target_url,outcome.target_url,chosen)}
  node('p','Focus query: '+String(outcome.focus_query||d.intent_resolution?.query||d.search?.focus_query||'not verified'),primary);
  node('small','Decision scope: '+String(outcome.decision_scope||'OBSERVED_RESEARCH_ONLY')+
   ' · Verified content gap: '+(outcome.verified_gap===true?'YES':'NO')+
   ' · Automatic publishing: DISABLED',primary);
  if(outcome.decision==='DATA_BLOCKED'){
   node('p','Missing evidence — what is needed and why:',primary);
   var miss=node('ul',null,primary);
   (outcome.missing_evidence||[{code:outcome.blocker_code||'SPECIFIC_EVIDENCE_NOT_ESTABLISHED',detail:outcome.next_action||''}])
    .forEach(function(m){node('li',String(m.code)+' — '+String(m.detail||''),miss)});
   if((outcome.attempted_sources||[]).length){
    node('p','Automatic sources already tried:',primary);
    var tried=node('ul',null,primary);
    outcome.attempted_sources.forEach(function(a){node('li',String(a.source)+': '+String(a.status)+(a.detail?' ('+String(a.detail)+')':''),tried)});
   }
  }
  if(outcome.decision==='NO_CHANGE'&&outcome.closure_report){
   node('p','Closure report — nothing needs to change for the checked reader tasks:',primary);
   var closed=node('ul',null,primary);
   (outcome.closure_report.tasks_checked||[]).forEach(function(t){node('li',String(t.label)+' → '+String(t.destination_status).replace(/_/g,' ').toLowerCase(),closed)});
   if(outcome.closure_report.note)node('small',String(outcome.closure_report.note),primary);
  }
  if(outcome.decision==='NEW_DISTINCT_PAGE'){
   node('p','Distinct search intent verified: '+String(d.serp_intent?.intent||'')+' ('+String(d.serp_intent?.agreeing_leads||0)+' of '+String(d.serp_intent?.organic_leads_considered||0)+' organic results). No compatible same-site page was found.',primary);
   if(outcome.new_page_draft){
    node('h3','Proposed new page for review',primary);
    outcome.new_page_draft.sections.forEach(function(sec){node('strong',sec.h2,primary);node('pre',sec.paragraphs.join('\n\n'),primary)});
   }else node('p','Draft status: '+String(outcome.copy_status||'not available'),primary);
  }
  var pack=ownerReport&&d.handoff_package?.markdown;
  if(pack){
   var dlPack=node('button','Download owner package (.md)',primary);dlPack.type='button';
   dlPack.addEventListener('click',function(){
    var blob=new Blob([pack],{type:'text/markdown;charset=utf-8'});
    var href=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=href;a.download='contentscale-growth-owner-package.md';document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(href)},2000);
   });
  }
  if(d.page_content?.render_status)
   node('p','Page capture: '+String(d.page_content.render_status),primary);
  if(d.intent_resolution?.status)
   node('p','Search intent: '+String(d.intent_resolution.status)+
    (d.intent_resolution.original_keyword?' · Original tracked term: '+d.intent_resolution.original_keyword:''),primary);
  if(ownerReport&&outcome.decision==='IMPROVE_EXISTING'&&outcome.proposed_text){
   node('h3','Concrete improvement for editorial review',primary);
   node('p','Existing section: '+String(outcome.target_section||'unspecified'),primary);
   if(outcome.placement)node('p','Placement: '+String(outcome.placement.mode||'').replace(/_/g,' ').toLowerCase()+' — '+String(outcome.placement.reason||''),primary);
   if(outcome.existing_passage){node('strong','Existing observed passage',primary);node('pre',outcome.existing_passage,primary)}
   node('strong','Proposed replacement/addition — fact-check before approval',primary);
   node('pre',outcome.proposed_text,primary);
   if(outcome.source_comparison?.competitor_url){
    var competitor=node('p','Compared with: ',primary);
    link(outcome.source_comparison.competitor_url,outcome.source_comparison.competitor_heading||outcome.source_comparison.competitor_url,competitor);
    if(outcome.source_comparison.competitor_passage)node('pre',outcome.source_comparison.competitor_passage,primary);
   }
   node('p','This is a reviewable proposal, NOT a proven ranking gain or automatically verified missing answer.',primary);
   var copyEdit=node('button','Copy proposed Growth edit',primary);copyEdit.type='button';
   copyEdit.addEventListener('click',async function(){
    var material=['Target: '+String(outcome.target_url||''),'Section: '+String(outcome.target_section||''),
     'Existing passage: '+String(outcome.existing_passage||''),'Proposed text:',outcome.proposed_text,
     'Source: '+String(outcome.source_comparison?.competitor_url||''),'Editor approval required. No automatic publication.'].join('\\n\\n');
    try{await navigator.clipboard.writeText(material);copyEdit.textContent='Copied'}
    catch(_){copyEdit.textContent='Copy unavailable'}
   });
  }else if(ownerReport&&d.editorial_review_draft?.draft?.sections?.length){
   node('p','A draft was generated but a distinct, paired content improvement is not verified. Review the draft and evidence below before approving any edit.',primary);
  }
  var s=section('Research context and next check');
  if(recommendation){
   node('h3',recommendation.title,s);
   node('p',recommendation.reason,s);
   node('p','Do this: '+recommendation.instruction,s);
   if(recommendation.related_pages_to_check?.length){
    node('strong','Check an existing page before creating a new one:',s);
    recommendation.related_pages_to_check.forEach(u=>{var item=node('p',null,s);link(u,u,item)});
   }
   node('small','Safety: '+recommendation.stop_before,s);
   node('p',decision.protection?.case_study_locked?'Case Study is active: research and review only. No live edits or publishing.':'No automatic publishing. Owner reviews any CMS changes.',s);
   if(decision.protection?.preserve_existing_top_rankings){
    node('strong','Protect already performing queries',s);
    node('p',(decision.protected_queries||[]).map(q=>q.query+' (position '+q.position.toFixed(1)+', '+q.clicks+' clicks)').join(' · '),s);
   }
   node('small',(decision.excluded_queries||[]).length+' off-intent, stale or unverified queries excluded from recommendations. GSC import date is not its measurement period.',s);
   var copy=node('button','Copy this editorial action',s);copy.type='button';
   copy.addEventListener('click',async function(){
    var content=[d.url,recommendation.title,recommendation.reason,recommendation.instruction,
      'Review related pages: '+(recommendation.related_pages_to_check||[]).join(', '),
      recommendation.stop_before,decision.protection?.case_study_locked?'CASE STUDY LOCKED — no edits':'Editorial approval required'].join('\n');
    try{await navigator.clipboard.writeText(content);copy.textContent='Copied — ready for editorial review'}
    catch(_){copy.textContent='Copy unavailable — use Download research report'}
   });
  }else node('p','A single actionable recommendation is not yet available. See supporting evidence.',s);
  var opportunity=d.autonomous_growth_opportunity||{};
  if(opportunity.primary_opportunity){
   s=section('Additional search growth opportunity — evidence led');
   var op=opportunity.primary_opportunity;
   node('h3',op.query,s);
   node('p','Observed exact-page GSC: '+op.observed_impressions+' impressions, '+op.observed_clicks+' clicks, '+op.observed_ctr_pct+'% CTR, average position '+op.observed_average_position+'.',s);
   node('small','GSC import: '+(op.imported_at||'unknown')+'; underlying measurement range not confirmed by this export.',s);
   node('p',op.analysis,s);
   var proposal=opportunity.recommendation||{};
   node('strong','Next researched action',s);
   node('p',proposal.editorial_next||'Verify distinct search intent and existing-site coverage first.',s);
   node('p','Reader outcome: '+(proposal.practical_reader_deliverable||'Useful, verifiable next steps'),s);
   node('p','Internal linking: '+(proposal.internal_link_handoff||'Verify before suggesting a link.'),s);
   if(opportunity.editorial_package){
    var pkg=opportunity.editorial_package;
    node('h3','Prepared editorial next step',s);
    node('p','Decision: '+pkg.decision+(pkg.proposed_target_url?' · Target: '+pkg.proposed_target_url:''),s);
    node('p','Useful outcome for the reader: '+pkg.visitor_outcome,s);
    var steps=node('ol',null,s);
    (pkg.reader_steps||[]).forEach(function(step){
     var li=node('li',null,steps);node('strong',step.heading+': ',li);
     node('span',step.action+' Deliverable: '+step.output,li);
    });
    if(pkg.internal_link_recommendation){
     node('p','Possible contextual link: '+pkg.internal_link_recommendation.suggested_anchor,s);
     link(pkg.internal_link_recommendation.destination,'Review destination page',s);
    }
    node('small',pkg.verification_gate,s);
   }
   var copy=opportunity.evidence_guided_copy||{};
   if(copy.status){
    node('h3','Evidence-guided editorial copy',s);
    node('p','Status: '+copy.status,s);
    if(copy.target_url)link(copy.target_url,'Inspected target URL',s);
    if(copy.one_next_action){
     node('strong','One next action: '+copy.one_next_action.code,s);
     node('p',copy.one_next_action.instruction,s);
    }
    if((copy.held_possible_duplicates||[]).length)
     node('p',(copy.held_possible_duplicates||[]).length+' possible duplicate additions held back pending comparison.',s);

    (copy.proposed_additions||[]).forEach(function(proposal){
     var item=node('div',null,s);
     node('strong',proposal.proposed_heading,item);
     node('p',proposal.reviewable_paragraph,item);
     node('small','Review before use: '+proposal.action,item);
    });
    if(copy.verification)node('small',copy.verification,s);
   }
   node('strong','Related existing pages to investigate',s);
   if(opportunity.existing_destinations?.length)opportunity.existing_destinations.forEach(function(x){
    var item=node('p',null,s);link(x.url,x.url,item);node('small','Not yet verified as matching the intent.',item);
   });else node('p','No relevant same-site page was established from the available Tracker inventory. Do not invent a destination.',s);
   node('small','Remaining verification: '+(opportunity.verification_needed||[]).join(' · '),s);
   node('small','Protection: no homepage title/H1 rewrite, no automatic new page, no Case Study changes or publication.',s);
  }
  if(main.getAttribute('data-owner-draft')!=='true'){
   s=section('Research-only access');
   node('p','This is an evidence report, NOT a complete Growth draft. Use the Tracker owner link to create a full editorial review draft and download the combined JSON. GSC is optional.',s);
  }
  var destinationGsc=d.destination_gsc_evidence||{};
  if(destinationGsc.target_url){
   s=section('Selected page · search evidence');
   node('p','Destination: '+destinationGsc.target_url,s);
   if(destinationGsc.exact_query_verified&&destinationGsc.metrics){
    var dm=destinationGsc.metrics;
    node('p','Verified for this page and query: '+dm.impressions+' impressions, '+dm.clicks+
     ' clicks, average position '+dm.average_position+'.',s);
    node('small','GSC imported: '+(dm.imported_at||'unknown')+
     ' · actual measurement period: unknown. Homepage metrics were not reused.',s);
   }else{
    node('p','No exact-page verified GSC for this destination/query ('+
     String(destinationGsc.status||'not checked')+'). Homepage data will not be assigned to this page.',s);
    node('small','Public-page and competitor research may continue without GSC. No verified Google click gain can be claimed.',s);
   }
  }
  var sample=d.evidence_bound_example||{};
  if(sample.status==='DESTINATION_GSC_EVIDENCE_REQUIRED'){
   s=section('Growth evidence · target page verification needed');
   node('p','GSC clicks and impressions belong to the tracked page, not the proposed destination. No destination-specific GSC example has been prepared; this does NOT block source-grounded editorial drafting.',s);
   if(sample.source_metrics_url)node('p','Measured source: '+sample.source_metrics_url,s);
   if(sample.target_metrics_url)node('p','Destination requiring its own GSC data: '+sample.target_metrics_url,s);
   node('small',sample.one_next_action||'Exact destination GSC is required for click/position claims, not editorial drafting.',s);
  }
  if(sample.status==='EVIDENCE_BOUND_EXAMPLE_FOR_REVIEW'&&sample.proposed_text){
   s=section('Evidence-based example · editorial review');
   node('h3',sample.heading,s);
   node('p',sample.proposed_text,s);
   if(sample.target_url){node('strong','Existing page to review: ',s);link(sample.target_url,sample.target_url,s);}
   node('small','Observed source: '+String(sample.evidence?.source_url||'Unknown')+
    ' · GSC imported: '+String(sample.evidence?.imported_at||'Unknown')+
    ' · actual measurement period: '+String(sample.evidence?.measurement_window||'Unknown'),s);
   node('small',sample.editorial_check||'Check for duplicates before proposing any insertion.',s);
   node('p','This is a grounded candidate example, not a verified content gap and not published.',s);
   var copyExample=node('button','Copy evidence-based example',s);copyExample.type='button';
   copyExample.addEventListener('click',async function(){
    try{await navigator.clipboard.writeText(sample.heading+'\n\n'+sample.proposed_text);
     copyExample.textContent='Copied — ready for editorial review'}
    catch(_){copyExample.textContent='Clipboard unavailable — use report JSON'}
   });
  }
  var discovery=d.search_discovery||{};
  s=section('Search competitors for this Growth query');
  var liveRivals=(d.competitors?.live_reviewed||[]).filter(x=>
   x.discovery_source==='BING_PUBLIC_RSS'||x.discovery_source==='SERPER_GOOGLE_ORGANIC');
  var googleSource=discovery.source==='SERPER_GOOGLE_ORGANIC';
  node('p','Search topic: '+(discovery.target_query||discovery.query||'Not established')+
   ' · Source: '+(googleSource?'Google organic (optional provider)':'Public Bing RSS')+
   ' · Status: '+(discovery.status||'NOT_CHECKED')+
   ' · '+liveRivals.length+' competitor HTML pages retrieved.',s);
  node('small',googleSource?'Google organic listings observed through the configured optional Serper.dev (US / English). These are search-result observations, not verified target-page GSC rankings or traffic.':
    'Free public Bing RSS discovery is optional and may be blocked. This source does not verify Google rankings; an optional configured Google lookup is tried only when free discovery returns no relevant leads.',s);
  if(discovery.free_discovery_status)node('small','Free search: '+discovery.free_discovery_status,s);
  if(discovery.optional_google_status)node('small','Optional Google search: '+discovery.optional_google_status,s);
  if(discovery.reason)node('small','Source status: '+discovery.reason,s);
  if(liveRivals.length){
   liveRivals.forEach(function(c){
    var item=node('div',null,s);link(c.url,c.title||c.url,item);
    node('small','Observed H2 topics: '+(c.h2||[]).slice(0,6).join(' · '),item);
   });
  }else{
   node('p','No newly discovered competitors could be verified for this exact search topic. Historical leads remain in the detailed research, not as substitutes for a verified live comparison.',s);
  }
  var plan=d.practical_growth_plan||{},change=plan.change||{};
  var pairs=plan.competitors?.side_by_side||[];
  if(pairs.length){
   s=section('Side-by-side: what the competitor actually says');
   pairs.forEach(function(pair){
    var block=node('div',null,s);
    node('h3','Competitor: '+pair.competitor_section,block);
    node('p','Observed excerpt: '+(pair.competitor_excerpt||'Not available'),block);
    node('p','Your section: '+(pair.tracked_page_section||'No matching section in inspected HTML'),block);
    if(pair.tracked_page_excerpt)node('p','Your observed excerpt: '+pair.tracked_page_excerpt,block);
    node('small',pair.interpretation,block);
    node('small','What to do: '+pair.editorial_action,block);
    link(pair.competitor_url,'Competitor source',block);
   });
  }
  var questions=plan.competitors?.comparison_questions||[];
  if(questions.length){
   s=section('What the relevant competitors cover');
   node('p','Observed competitor topics to compare with the current page; differences are NOT automatically missing content.',s);
   questions.forEach(function(q){
    var block=node('div',null,s);
    node('strong',q.observed_heading,block);
    node('small',q.editorial_check,block);
    link(q.competitor_url,'Observed source',block);
   });
  }
  s=section('Prepared improvement · review before publishing');
  if(change.target_section)node('p','Keep this existing section: "'+change.target_section+'"',s);
  node('p',change.summary||'A supported content change is not available from the inspected source.',s);
  if(change.ready_to_review_text?.length){
   var formatted=change.ready_to_review_text.join('\n\n');
   node('h3','Proposed copy — not yet published',s);
   change.ready_to_review_text.forEach(p=>node('p',p,s));
   var copyDraft=node('button','Copy proposed text',s);copyDraft.type='button';
   copyDraft.addEventListener('click',async function(){
    try{await navigator.clipboard.writeText(formatted);copyDraft.textContent='Text copied'}
    catch(_){copyDraft.textContent='Copy unavailable on this browser'}
   });
   node('small','Only insert if the original section does not already answer this well. Review claims, accuracy, placement and duplicate content.',s);
   var save=node('button','Download editorial brief (.md)',s);save.type='button';
   save.addEventListener('click',function(){
    var lines=['# ContentScale Growth · Editorial improvement (not published)','',
      'Original URL: '+String(d.url||''),'Working query: '+String(plan.focus_query||'Unknown'),
      'Case Study protected: '+(plan.guard?.case_study_locked?'YES':'NO'),'',
      '## Existing section to review',change.target_section||'Choose the appropriate existing section',
      '','## Proposed improvement',...change.ready_to_review_text,'',
      '## Why this is being reviewed',String(recommendation?.reason||''),'',
      '## Review guard',String(change.summary||''),'',
      'Do not change the original page, live Case Study or publish without editor approval.',
      'GSC imported_at is not a reporting-period boundary; no promised ranking or click uplift.'];
    var blob=new Blob([lines.join('\n\n')],{type:'text/markdown;charset=utf-8'});
    var href=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=href;a.download='contentscale-growth-editorial-brief.md';document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(href),2000);
   });
  }else{
   node('h3','Specific editorial steps',s);
   list(change.steps||[],s,x=>x);
  }
  if(plan.guard?.case_study_locked)node('p','The Case Study remains locked. This is an editorial proposal only; no published content or baseline has changed.',s);
  if(main.getAttribute('data-owner-draft')==='true'){
   s=section('Prepare a full reviewed editorial draft');
   node('p','Owner-only drafting from the selected, observed Growth destination and working query. No CMS connection, new URL or automatic publication. Case Studies stay protected.',s);
   var distinctDestination=!!destinationGsc.target_url&&destinationGsc.target_url!==d.url;
   var draftSourceUrl=distinctDestination?destinationGsc.target_url:d.url;
   var draftPageId=distinctDestination?Number(destinationGsc.target_page_id):Number(id);
   var validDraftPage=Number.isSafeInteger(draftPageId)&&draftPageId>0;
   node('p','Draft source URL: '+String(draftSourceUrl||'Unavailable'),s);
   var prepare=node('button','Prepare detailed draft for review',s);prepare.type='button';
   var output=node('div',null,s),draftStatus=node('small',
    validDraftPage?'Optional AI assistance; a review-only draft does not change any live page.':
     'Selected destination is not a verified Tracker page belonging to this account; drafting the homepage instead is blocked.',s);
   if(!validDraftPage){
    prepare.disabled=true;
    if(!d.report_completion)d.editorial_review_draft={status:'DESTINATION_TRACKER_PAGE_REQUIRED',target_url:draftSourceUrl||null,
     auto_started:false,published:false,case_study_unchanged:true};
   }else if(!d.report_completion){
    d.editorial_review_draft={status:'PREPARING',target_url:draftSourceUrl,
     auto_started:true,published:false,case_study_unchanged:true};
    document.getElementById('downloadResearch').disabled=true;
   }
   var showDraftResult=function(result){
    output.textContent='';
    if(String(result.target_url||'')!==String(draftSourceUrl||'')){
     draftStatus.textContent='Draft URL mismatch · no text displayed.';
     return;
    }
    if(result.status!=='AI_DRAFT_REVIEW_REQUIRED'||!result.draft?.sections?.length){
     draftStatus.textContent='Detailed draft status: '+String(result.status||'NO_DRAFT')+
      (result.error_code?' ('+String(result.error_code).slice(0,110)+')':'')+
      '. The researched evidence is available; no page was published.';
     return;
    }
    var draft=result.draft;
    var liveDraftSource=result.source_type==='LIVE_PUBLIC_HTML';
    draftStatus.textContent='Draft prepared · '+(liveDraftSource?'CURRENT PUBLIC HTML':'SAVED TRACKER HTML — CHECK FRESHNESS')+
     ' · editor approval required · NOT published'+(d.case_study_locked?' · active Case Study protected':'');
    node('p','Research questions from current competitor reading: '+
     String(result.competitor_research_passages_used||0)+
     ' · editorial comparison only, not proven gaps or copied competitor text.',output);
    var gsc=result.gsc_context||{},gscStatus=gsc.status||'NO_VERIFIED_GSC';
    node('p','GSC (optional): '+gscStatus+
     '. Source and destination URL measurements are kept separate. Existing successful queries are protected; missing GSC never blocks this draft.',output);
    if(gsc.source_query_metrics&&gsc.source_url)
     node('small','Source-page opportunity for “'+gsc.source_query_metrics.query+
      '”: '+gsc.source_query_metrics.impressions+' impressions, '+
      gsc.source_query_metrics.clicks+' clicks, average position '+
      gsc.source_query_metrics.average_position.toFixed(1)+
      ' — belongs to '+gsc.source_url+', NOT the draft destination.',output);
    node('h3','Draft proposal — editorial review required',output);
    if(draft.seo_title)node('p','Suggested title (do not replace a strong ranking title automatically): '+draft.seo_title,output);
    if(draft.meta_description)node('p','Suggested description: '+draft.meta_description,output);
    // Only sections that passed the checks are presented as a proposal. Rejected provider text is never rendered or copied.
    var acceptedSections=draft.sections.filter(function(sec){return sec.review_status!=='REJECTED_NOT_PART_OF_PROPOSAL'});
    var rejectedSections=draft.sections.filter(function(sec){return sec.review_status==='REJECTED_NOT_PART_OF_PROPOSAL'});
    acceptedSections.forEach(function(section){
     node('h3',section.h2,output);
     (section.paragraphs||[]).forEach(p=>node('p',p,output));
    });
    if(rejectedSections.length){
     node('strong','Generated but rejected — NOT part of the proposal (text withheld):',output);
     rejectedSections.forEach(function(sec){node('p','• '+String(sec.h2)+' — '+(sec.rejection_reasons||[]).map(function(x){return String(x.code)}).join(', '),output)});
    }
    node('small','Only source-supported facts may be published after verification. Preserve original H1, existing useful content, images and URL. No auto publishing.',output);
    var content=['# Growth editorial proposal — not published','',
     'Original URL: '+String(result.target_url||''),'Source: '+String(result.source_type||'UNKNOWN'),
     'Source checked: '+String(result.source_retrieved_at||'Unknown — historical snapshot possible'),
     'Chosen Growth query: '+String(recommendation?.query||plan.focus_query||''),
     'Case Study locked: '+(d.case_study_locked?'YES':'NO'),'', 'Suggested SEO title: '+String(draft.seo_title||''),
     'Suggested description: '+String(draft.meta_description||''),'',
     ...acceptedSections.flatMap(section=>['## '+section.h2,...(section.paragraphs||[]),'']),
     'All claims require owner review. No live content has been modified.'].join('\n\n');
    var copyFull=node('button','Copy complete draft',output);copyFull.type='button';
    copyFull.addEventListener('click',async function(){
     try{await navigator.clipboard.writeText(content);copyFull.textContent='Draft copied'}
     catch(_){copyFull.textContent='Clipboard unavailable'}
    });
    var download=node('button','Download full draft (.md)',output);download.type='button';
    download.addEventListener('click',function(){
     var blob=new Blob([content],{type:'text/markdown;charset=utf-8'});
     var href=URL.createObjectURL(blob),a=document.createElement('a');
     a.href=href;a.download='contentscale-growth-full-editor-draft.md';document.body.appendChild(a);a.click();a.remove();
     setTimeout(()=>URL.revokeObjectURL(href),2000);
    });

   };
   var prepareDraft=async function(){
    prepare.disabled=true;draftStatus.textContent='Preparing a source-grounded draft without publishing…';
    output.textContent='';
    try{
     // Owner completion is composed server-side using the same authenticated
     // editorial-draft handler. The downloaded JSON is the complete server result,
     // never a browser-only mutation of a research-only response.
     var response=await fetch('/api/tracker-client/'+encodeURIComponent(token)+
      '/growth/auto-research/complete?page_id='+encodeURIComponent(id),{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({page_id:Number(id)})
     });
     var composite=await response.json();
     if(!response.ok||composite.success!==true)
      throw Error(composite.code||'Complete Growth report unavailable');
     var result=composite.editorial_review_draft||{};
     if(String(result.target_url||'')!==String(draftSourceUrl||''))
      throw Error('DRAFT_SOURCE_URL_MISMATCH');
     if(last===d){
      last=composite;
      d.editorial_review_draft=result;
     }
     showDraftResult(result);
    }catch(error){
     var errorCode=String(error.message||error||'DRAFT_UNAVAILABLE').slice(0,110);
     if(last===d)d.editorial_review_draft={status:'DRAFT_UNAVAILABLE',error_code:errorCode,
      auto_started:true,target_url:draftSourceUrl,published:false,case_study_unchanged:true};
     draftStatus.textContent='Detailed draft not available: '+errorCode+'. The research remains available.';
    }finally{
     prepare.disabled=false;
     if(last===d||last?.generated_at===d.generated_at){
      document.getElementById('downloadResearch').disabled=false;
      document.getElementById('researchStatus').textContent=
       'Research complete · editorial draft: '+String(d.editorial_review_draft?.status||'UNKNOWN')+' · NOT published.';
     }
    }
   };
   prepare.addEventListener('click',prepareDraft);
   // This page was explicitly opened to perform owner Growth research. Complete
   // the optional second step automatically; do not require another button press.
   // Non-owner sessions and untracked destinations never invoke the AI endpoint.
   if(validDraftPage&&d.report_completion)showDraftResult(d.editorial_review_draft||{status:'NO_DRAFT_RESULT',target_url:draftSourceUrl});
   else if(validDraftPage)void prepareDraft();
  }
  s=section('What happened to the other research?');
  var rows=plan.classifications||[],categories=plan.query_categories||{};
  node('p',rows.length+' GSC queries classified · '+(categories.PROTECT||0)+' protected · '+
   (categories.IMPROVE_EXISTING||0)+' investigated · '+(categories.SEPARATE_OR_UNCONFIRMED_INTENT||0)+' other or unconfirmed intent · '+
   (categories.BRAND_NAVIGATION||0)+' branded',s);
  var other=node('details',null,s);node('summary','See every query and why it was kept or separated',other);
  if(rows.length)table(['Search query','Evidence','Decision'],
    rows.map(q=>[q.query,q.impressions+' impressions · '+q.clicks+' clicks · position '+(q.position===null?'unknown':q.position.toFixed(1)),q.category+': '+q.meaning]),other);
  else node('p','GSC is optional; this plan can still be reviewed without ranking data.',other);
  var rival=plan.competitors||{};
  node('p',(rival.inspected||0)+' competitor pages inspected · '+(rival.relevant_to_action||0)+' relevant to the selected query by topic · '+
   (rival.requiring_separate_intent_review||0)+' kept as other-intent research.',s);
  node('small',rival.warning||'No current SERP ranking claim is established.',s);
  var rivals=node('details',null,s);node('summary','See inspected competitor pages and relevance',rivals);
  (rival.classification||[]).forEach(c=>{var item=node('div',null,rivals);link(c.url,c.title||c.url,item);
   node('small',c.category+' — '+c.reason,item)});
  researchDetails=node('details',null,container);
  node('summary','Show full technical evidence, Search and AI observations',researchDetails);
  s=section('Automatic research evidence');
  var summary=d.summary||{};
  node('p','Primary page: '+String(summary.primary_source||'UNKNOWN')+
   ' · Checked: '+(summary.live_retrieved_at||'saved snapshot only')+
   ' · Observed competitors: '+(summary.competitors_live_reviewed??0),s);
  node('p','Case Study: '+(d.case_study_locked?'Protected — research only; no publishing':'Research / editor review permitted'),s);
  if(d.evidence_warnings&&d.evidence_warnings.length)node('small','Evidence warnings: '+d.evidence_warnings.join('; '),s);
  s=section('Page analysis — observed facts');
  var sig=d.page_content?.signals||{},headings=d.page_content?.headings||{};
  if(sig.available){
   table(['Signal','Observation'],[
    ['Title',headings.title||'Not found in inspected HTML'],
    ['Meta description',headings.description||'Not found in inspected HTML'],
    ['H1 / H2 counts',(sig.h1_count_observed??'Unknown')+' / '+(sig.h2_count_observed??'Unknown')],
    ['Canonical / noindex',(sig.canonical_tag_observed?'canonical observed':'canonical not observed')+'; '+(sig.noindex_directive_observed?'noindex observed':'noindex not observed')],
    ['Internal / external links',(sig.internal_links_observed??'Unknown')+' / '+(sig.external_links_observed??'Unknown')],
    ['Images missing alt',(sig.images_missing_alt_observed??'Unknown')+' of '+(sig.images_observed??'Unknown')],
    ['Approx. excerpt words',sig.approx_excerpt_words]
   ],s);
   node('h3','Existing section headings',s);list(headings.h2||[],s,x=>x);
  }else node('p','Live page and saved HTML are unavailable. No page structure conclusions are being invented.',s);
  node('small',sig.caution||'Page evidence is source-specific, not guaranteed current.',s);
  s=section('Google Search Intelligence');
  var search=d.search||{},qs=search.verified_queries||[];
  node('p','Working topic: '+(search.focus_query||'Unknown')+' · '+(qs.length?'Exact-page GSC records available':'GSC is optional; query clicks and rankings are UNKNOWN'),s);
  if(qs.length)table(['Verified query','Clicks','Impressions','Average position'],qs.map(q=>[q.query,q.clicks,q.impressions,q.position]),s);
  if(search.observed_opportunities?.length){
   node('h3','Evidence-based opportunities',s);
   list(search.observed_opportunities,s,x=>x.type+': '+x.evidence+' — '+x.next_action);
  }
  s=section('Search intent and internal site architecture');
  var intent=search.intent||{};
  node('p','Detected intent: '+(intent.intent||'UNKNOWN')+' — heuristic; verify the actual SERP before editing.',s);
  node('p','Recommended page response: '+(intent.suggested_page_action||'Verify search intent'),s);
  var graph=d.site_architecture||{};
  node('h3','Relevant existing pages — contextual internal link candidates',s);
  var links=graph.candidates||[];
  if(!links.length)node('p','No grounded related-page recommendation found in the available Tracker inventory.',s);
  links.forEach(x=>{var block=node('div',null,s);link(x.url,x.url,block);
   node('small','Shared topic terms: '+(x.overlapping_terms||[]).join(', ')+'. '+x.action,block)});
  node('h3','Possible overlapping intent — not confirmed cannibalization',s);
  var overlaps=graph.intent_overlap_risks||[];
  if(!overlaps.length)node('p','No strong keyword overlap identified in the available inventory.',s);
  overlaps.forEach(x=>{var block=node('div',null,s);link(x.url,x.url,block);
   node('small','Shared keyword: '+(x.keyword||'Unknown')+' · Manual SERP/page-intent confirmation required',block)});
  s=section('Search and AI competitor research');
  var competitors=d.competitors||{};
  node('p','Historical search results: '+(competitors.snapshot_checked_at||'No snapshot timestamp')+
   ' · showing '+(competitors.leads||[]).length+' of '+(competitors.total_leads??(competitors.leads||[]).length)+' competitor leads · '+(competitors.live_reviewed||[]).length+' inspected HTML documents',s);
  if(competitors.excluded_unaligned_topics)node('small',competitors.excluded_unaligned_topics+' competitor headings excluded: they do not match this page subject.',s);
  var leads=competitors.leads||[];
  var ul=node('ul',null,s);
  leads.forEach(x=>{var li=node('li',x.source+' · '+(x.serp_title||'Observed URL')+' · ',ul);link(x.url,x.url,li)});
  var live=competitors.live_reviewed||[];
  if(live.length){
   node('h3','Automatically inspected public competitor pages',s);
   live.forEach(x=>{var block=node('div',null,s);link(x.url,x.title||x.url,block);
    node('small','Read at '+(x.retrieved_at||'unknown')+' · observed H1: '+(x.h1||[]).join(' / '),block);
    node('small','Observed H2: '+(x.h2||[]).slice(0,6).join(' · '),block)});
  }
  node('h3','Candidate differences — confirm before editing',s);
  list(competitors.topic_candidates||[],s,x=>x.heading+' — source: '+x.source_url+' (not a proven content gap)');
  var ai=d.ai_visibility||{};
  node('h3','Saved AI visibility observations (not a new automated AI test)',s);
  list(ai.engines||[],s,e=>e.engine+' ('+(e.method||'historical')+'): recommended '+(e.recommended?'Yes':'Not observed')+
   '; domain cited '+(e.domain_cited?'Yes':'Not observed')+
   '; exact page cited '+(e.exact_page_cited?'Yes':'Not observed')+
   '; checked '+(e.verified_at||'date unknown'));
  var past=d.previous_brief||{};
  if(past.status==='HISTORICAL_BRIEF_NOT_CURRENT_LIVE_EVIDENCE'){
   s=section('Previously saved Tracker Brief — historical context');
   node('p','Generated: '+(past.generated_at||'date unknown')+' · '+
    (past.implementation_complete?'Previously completed cycle':'Completion is not assumed')+
    ' · historical recommendations are NOT new publication tasks.',s);
   node('small',past.warning,s);
   node('h3','Previous AI/content recommendations',s);
   list(past.items||[],s,x=>x.priority+' · '+x.title+' — '+x.action);
   node('h3','Previous GSC/SEO recommendations',s);
   list(past.gsc_items||[],s,x=>x.priority+' · '+x.title+' — '+x.action);
  }
  s=section('Prioritized, source-grounded improvement decisions');
  var findings=d.findings||[];
  list(findings,s,f=>f.priority+' · '+f.code+': '+f.action+' (basis: '+f.evidence+')');
  s=section('Editor-ready Growth plan — preserve the original URL');
  var draft=d.editorial||{};
  node('p','Search intent candidate: '+(draft.focus_query?.text||'Unknown')+
   ' · Evidence: '+(draft.focus_query?.status||'UNVERIFIED'),s);
  if(draft.suggested_title_if_missing)node('p','Title to review: '+draft.suggested_title_if_missing,s);
  node('h3','Proposed sections from observed sources',s);
  list(draft.candidate_sections||[],s,x=>x.proposed_topic+' — inspect: '+x.derived_from+'; facts and originality require review');
  node('p','Next action: review the ranked findings, compare source evidence, and prepare the verified content on the existing page. No unsupported competitor claims, auto-publishing or artificial click forecasts.',s);
  if(d.case_study_locked)node('p','Active Case Study protection: DO NOT implement changes during the locked measurement cycle.',s);
  document.getElementById('downloadResearch').hidden=false;
  document.getElementById('researchStatus').textContent=
   d.report_completion?.owner_only?
    'Owner Growth report · editorial draft: '+String(d.editorial_review_draft?.status||'UNKNOWN')+
     ' · no automatic publication.':
   d.editorial_review_draft?.status==='PREPARING'?
    'Automatic research complete · preparing owner-only editorial review draft (NOT publishing)…':
    'Research-only report · a full editorial draft requires the Tracker owner link.';
 }
 async function run(){
  var status=document.getElementById('researchStatus');
  status.className='';status.textContent='Analyzing page HTML, verified queries, historical search competitors and AI evidence…';
  document.getElementById('retryResearch').disabled=true;
  try{
   var owner=main.getAttribute('data-owner-draft')==='true';
   var completeEndpoint='/api/tracker-client/'+encodeURIComponent(token)+
    '/growth/auto-research/complete?page_id='+encodeURIComponent(id);
   var response=await fetch(owner?completeEndpoint:endpoint,{
    method:owner?'POST':'GET',credentials:'same-origin',cache:'no-store',
    ...(owner?{headers:{'Content-Type':'application/json'},body:JSON.stringify({page_id:Number(id)})}:{})
   });
   var result=await response.json();
   if(!response.ok||result.success!==true)throw Error(result.code||'Research unavailable');
   last=result;render(result);
  }catch(e){status.textContent='Research could not complete: '+String(e.message||e);status.className='error';
   document.getElementById('retryResearch').hidden=false
  }finally{document.getElementById('retryResearch').disabled=false}
 }
 document.getElementById('retryResearch').addEventListener('click',run);
 document.getElementById('downloadResearch').addEventListener('click',function(){
  if(!last)return;
  var blob=new Blob([JSON.stringify(last,null,2)],{type:'application/json'});
  var href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=main.getAttribute('data-owner-draft')==='true'?
   'contentscale-growth-complete-review.json':'contentscale-growth-research-only.json';
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),2000);
 });
 run();
})();