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
  var s=section('Your next Growth action');
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
   node('p','One-click owner-only drafting from your observed page and selected Growth query. No CMS connection, new URL or automatic publication. Your active Case Study stays protected.',s);
   var prepare=node('button','Prepare detailed draft for review',s);prepare.type='button';
   var output=node('div',null,s),draftStatus=node('small','Optional AI assistance; the prepared editorial brief above remains available if the provider is unavailable.',s);
   prepare.addEventListener('click',async function(){
    prepare.disabled=true;draftStatus.textContent='Preparing a source-grounded draft without publishing…';
    output.textContent='';
    try{
     var response=await fetch('/api/tracker-client/'+encodeURIComponent(token)+'/growth/cms-export/editor-draft',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({page_id:Number(id),focus_query:String(recommendation?.query||plan.focus_query||'').slice(0,160)})
     });
     var result=await response.json();
     if(!response.ok||result.success!==true)throw Error(result.code||'Draft generation unavailable');
     if(result.status!=='AI_DRAFT_REVIEW_REQUIRED'||!result.draft?.sections?.length){
      draftStatus.textContent='Optional detailed draft unavailable: '+String(result.status||'NO_DRAFT')+'. The reviewed copy above remains available.';
      return;
     }
     var draft=result.draft;
     draftStatus.textContent='Draft prepared · SOURCE ONLY · editor approval required · NOT published'+(result.case_study_locked?' · active Case Study protected':'');
     node('h3','Draft proposal — editorial review required',output);
     if(draft.seo_title)node('p','Suggested title (do not replace a strong ranking title automatically): '+draft.seo_title,output);
     if(draft.meta_description)node('p','Suggested description: '+draft.meta_description,output);
     draft.sections.forEach(function(section){
      node('h3',section.h2,output);
      (section.paragraphs||[]).forEach(p=>node('p',p,output));
     });
     node('small','Only source-supported facts may be published after verification. Preserve original H1, existing useful content, images and URL. No auto publishing.',output);
     var content=['# Growth editorial proposal — not published','',
      'Original URL: '+String(d.url||''),'Chosen Growth query: '+String(recommendation?.query||plan.focus_query||''),
      'Case Study locked: '+(result.case_study_locked?'YES':'NO'),'', 'Suggested SEO title: '+String(draft.seo_title||''),
      'Suggested description: '+String(draft.meta_description||''),'',
      ...draft.sections.flatMap(section=>['## '+section.h2,...(section.paragraphs||[]),'']),
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
    }catch(error){
     draftStatus.textContent='Detailed draft not available: '+String(error.message||error)+'. The prepared editorial copy above is still available.';
    }finally{prepare.disabled=false}
   });
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
  node('p',rival.inspected||0+' competitor pages inspected · '+(rival.relevant_to_action||0)+' relevant to the selected query by topic · '+
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
  document.getElementById('researchStatus').textContent='Automatic research completed · source checks shown above.';
 }
 async function run(){
  var status=document.getElementById('researchStatus');
  status.className='';status.textContent='Analyzing page HTML, verified queries, historical search competitors and AI evidence…';
  document.getElementById('retryResearch').disabled=true;
  try{
   var response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store'});
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
  a.href=href;a.download='contentscale-growth-automatic-report.json';document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),2000);
 });
 run();
})();