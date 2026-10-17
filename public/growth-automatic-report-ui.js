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
  researchDetails=node('details',null,container);
  node('summary','Show the underlying research and evidence',researchDetails);
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