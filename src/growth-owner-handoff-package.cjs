'use strict';
// CMS-neutral owner package (Markdown + structured JSON). WordPress/Wix/other CMS stay optional.
// Describes what changes on which existing URL and where. Never publishes, never touches a Case Study.
const {blocks,queryRoots,STEMS}=require('./growth-reader-task-coverage.cjs');
const {LADDER_LABELS}=require('./growth-evidence-status.cjs');
const clip=(x,n)=>String(x==null?'':x).replace(/\s+/g,' ').trim().slice(0,n);
const pathOf=u=>{try{return new URL(u).pathname}catch{return null}};
const esc=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

// Semantic internal-link candidates: an existing paragraph that already talks about the topic,
// an anchor that already appears in that paragraph, and proof the link does not exist yet.
function planInternalLinks({targetUrl='',focusQuery='',pages=[]}={}){
 const roots=queryRoots(focusQuery).distinct,tpath=pathOf(targetUrl),plan=[];
 if(!tpath||!roots.length)return plan;
 for(const p of Array.isArray(pages)?pages:[]){
  if(!p?.url||!p.html||p.url===targetUrl||p.truncated===true)continue;
  if(new RegExp('href=["\'][^"\']*'+esc(tpath.replace(/\/$/,''))+'/?["\'#?]','i').test(p.html)){
   plan.push({from_url:p.url,to_url:targetUrl,status:'ALREADY_LINKED',action:'No change needed.'});continue}
  const scored=blocks(p.html).filter(b=>b.tag==='p').map(b=>{
   const words=(b.text.toLowerCase().match(/[a-z]{4,}/g)||[]);
   const hit=roots.filter(r=>words.some(w=>STEMS(w)===r));
   return {b,score:hit.length,hit}}).filter(x=>x.score>=1).sort((a,b)=>b.score-a.score);
  if(!scored.length){plan.push({from_url:p.url,to_url:targetUrl,status:'NO_SEMANTICALLY_FITTING_PARAGRAPH',action:'Do not force a link.'});continue}
  const top=scored[0],text=top.b.text;
  const exact=text.toLowerCase().indexOf(String(focusQuery).toLowerCase());
  let anchor=exact>=0?text.slice(exact,exact+focusQuery.length):null;
  if(!anchor){const m=text.match(new RegExp('\\b\\w*'+esc(top.hit[0])+'\\w*(?:\\s+\\w+)?','i'));anchor=m?m[0]:null}
  plan.push({from_url:p.url,to_url:targetUrl,status:'LINK_CANDIDATE_FOR_REVIEW',
   under_heading:top.b.heading||null,paragraph_excerpt:clip(text,260),anchor_text:anchor,
   anchor_source:exact>=0?'EXACT_QUERY_ALREADY_IN_PARAGRAPH':'WORDS_ALREADY_IN_PARAGRAPH',
   action:'Wrap the anchor words that already exist in this paragraph; do not rewrite the paragraph. Verify both pages are live first.'});
 }
 return plan;
}

function buildOwnerHandoffPackage({report={},decision={},completion={},linkPlan=[]}={}){
 const L=[],d=decision.decision||'DATA_BLOCKED';
 const g=report.destination_gsc_evidence||{};
 L.push('# ContentScale Growth — owner review package','',
  '| | |','|---|---|',
  '| Decision | **'+d+'** |',
  '| Focus query | '+(decision.focus_query||'not resolved')+' |',
  '| Tracked (protected) page | '+(report.url||'')+' |',
  '| Target page | '+(decision.target_url||'none')+' |',
  '| Generated | '+(report.generated_at||'')+' |',
  '| Publication | Disabled. Nothing was published or changed. |',
  '| Case Study | '+(report.case_study_locked?'Locked — content and baseline untouched.':'Not locked — still untouched.')+' |','',
  '## Why this decision','',decision.reason||decision.next_action||'',
  decision.gap_basis?'\nEvidence basis: `'+decision.gap_basis+'`.':'','');
 if(decision.evidence_status){
  L.push('## Evidence status','','| Check | Status |','|---|---|');
  for(const [k,label] of LADDER_LABELS)L.push('| '+label+' | '+(decision.evidence_status[k]===true?'yes':'no')+' |');
  L.push('');
 }
 // URL identity (redirects, canonicals): shown before anything else about the destination, in the same words as the UI.
 const idNotes=[...new Set([report.destination_identity?.advice,...(report.url_identities||[]).map(x=>x.advice)].filter(Boolean))];
 if(idNotes.length||report.destination_identity?.resolves_to_source){
  L.push('## URL identity','');
  for(const n of idNotes)L.push('- '+n);
  const di=report.destination_identity;
  if(di?.resolves_to_source&&!di.advice)L.push('- The selected destination '+di.url+' resolves to the source page '+di.source_url+' ('+String(di.basis||'').toLowerCase().replace(/_/g,' ')+'). This is not a proven 301.'+(di.source_protected?' The source page is a locked Case Study, so edits are blocked.':''));
  L.push('');
 }
 const qs=report.query_selection;
 if(qs?.query){
  L.push('## Query and destination','','- Working query: **'+qs.query+'** ('+String(qs.source||'').toLowerCase().replace(/_/g,' ')+')');
  if(qs.destination?.url)L.push('- Destination page: '+qs.destination.url+' — '+String(qs.destination.basis||'').toLowerCase().replace(/_/g,' '));
  for(const u of qs.destination?.competing_same_site_pages||[])L.push('- Also close to this query (possible overlap, review): '+u);
  if(qs.source_page_signal)L.push('- '+qs.source_page_signal.note+' Source page: '+qs.source_page_signal.source_page_url);
  if((qs.brand_queries_excluded||[]).length)L.push('- Brand or navigational queries kept out of competitor research: '+qs.brand_queries_excluded.join(', '));
  L.push('');
 }
 if((report.search_discovery?.rejected_leads||[]).length){
  L.push('## Search results filtered out','');
  for(const x of report.search_discovery.rejected_leads.slice(0,8))L.push('- '+clip(x.title,80)+' — '+x.reason);
  L.push('');
 }
 if((report.search_discovery?.competitor_fetch_log||[]).length){
  L.push('## Competitor pages tried','',report.search_discovery.competitor_fetch_summary||'','');
  for(const x of report.search_discovery.competitor_fetch_log)L.push('- '+x.host+' — '+x.outcome.toLowerCase().replace(/_/g,' ')+(x.explanation?' ('+String(x.explanation).toLowerCase().replace(/_/g,' ')+')':'')+(x.partial_capture?', captured partially':'')+(x.rendered_fallback?', read after browser rendering':'')+(x.render_status&&!x.rendered_fallback?', render attempt: '+String(x.render_status).toLowerCase().replace(/_/g,' '):''));
  L.push('');
 }
 const cov=report.reader_task_coverage;
 if(report.serp_intent?.leads?.length){
  L.push('## Search intent observed','','Fresh organic results for “'+(decision.focus_query||'')+'” ('+(report.search_discovery?.source||'search provider')+', '+(report.search_discovery?.checked_at||'')+'). Discussion sites excluded. Placement here is not a ranking of your page.','');
  for(const l of report.serp_intent.leads.slice(0,6))L.push('- '+l.class+' — '+l.title+' — '+l.url);
  L.push('','Agreement: '+report.serp_intent.agreeing_leads+' of '+report.serp_intent.organic_leads_considered+' → '+report.serp_intent.intent+'.','');
 }
 if(cov?.tasks?.length){
  L.push('## Reader-task comparison','','Competitor pages read: '+(cov.competitors_considered||[]).map(c=>c.url+(c.partial?' (captured partially, cut at the fetch limit; text before the cut is evidence, nothing after it is assumed)':' (captured completely)')).join('; ')+'.','',
   '| Reader task | Independent competitor sources | Your target page |','|---|---:|---|');
  const verified=new Set((decision.improvement_plan?.tasks||[]).map(t=>t.code));
  for(const t of cov.tasks.filter(x=>x.independent_sources>0))
   L.push('| '+t.label+(verified.has(t.code)?' — **draft verified**':'')+' | '+t.independent_sources+' | '+t.destination.status.replace(/_/g,' ').toLowerCase()+(t.covered_elsewhere_on_site?.length?' (taught on '+t.covered_elsewhere_on_site[0].url+')':'')+' |');
  L.push('','Method: '+cov.method+'. A concept match is an observation, not proof of quality or ranking.','');
 }
 const ov=report.competitor_overview;
 if(ov&&ov.status==='OBSERVED'){
  // For the editor: what the ranking pages contain that this page does not (observation, no fact check).
  L.push('## What the ranking pages have that this page does not','','Compared with '+ov.ranking_pages_read+' readable ranking page(s). Observation only: no fact check, no ranking promise. The editor decides what to add.','',
   '- Length: this page '+ov.length.this_page_words+' words / '+ov.length.this_page_h2+' H2; ranking pages (median) '+ov.length.ranking_pages_median_words+' words / '+ov.length.ranking_pages_median_h2+' H2.');
  for(const f of ov.elements_they_have_and_this_page_lacks||[])L.push('- '+f.label+': on '+f.ranking_pages_with_it+' of '+f.of+' ranking pages, not on this page.');
  for(const f of ov.structured_data_they_have_and_this_page_lacks||[])L.push('- Structured data "'+f.type+'": on '+f.ranking_pages_with_it+' of '+f.of+' ranking pages, not on this page.');
  if(ov.topics_status==='GROUPED'){
   const gaps=(ov.topics||[]).filter(t=>t.this_page!=='YES');
   L.push('','### Topics not (fully) on this page','');
   for(const t of gaps)L.push('- **'+t.topic+'** ('+(t.this_page==='PARTLY'?'partly here: “'+t.this_page_heading+'”':t.this_page==='NO'?'not here':'not matched')+'; '+t.ranking_pages+' ranking page(s)): '+t.sections.slice(0,3).map(x=>x.host+' “'+x.heading+'”').join(', '));
  }else{
   L.push('','### All ranking-page sections (not grouped: '+String(ov.topics_status||'').toLowerCase().replace(/_/g,' ')+')','');
   for(const x of (ov.ungrouped_sections||[]).slice(0,80))L.push('- '+(x.position?'#'+x.position+' ':'')+x.host+': '+x.heading);
  }
  L.push('');
 }
 if(decision.intent_scope)L.push('## What Google shows','','Compared with: '+decision.intent_scope.compared_with+' ('+decision.intent_scope.results_of_this_type+' of '+decision.intent_scope.of+' results).','',decision.intent_scope.note,'');
 if(d==='IMPROVE_EXISTING'){
  const plan=decision.improvement_plan||{};
  L.push('## What changes where','','**Existing URL:** '+(decision.target_url||plan.target_url),'',
   '**Keep unchanged:** '+(plan.preserve||[]).join('; ')+'.','');
  const firstCode=(decision.draft_validation||[])[0]?.task;
  const items=[{task:(plan.tasks||[]).find(t=>t.code===firstCode)||(plan.tasks||[])[0],heading:decision.draft_heading,text:decision.proposed_text,placement:decision.placement},
   ...(decision.additional_sections||[]).map(a=>({task:(plan.tasks||[]).find(t=>t.code===a.task),heading:a.heading,text:a.text,placement:a.placement}))];
  let n=1;
  for(const it of items){
   if(!it.text)continue;
   L.push('### Change '+n+++': '+(it.task?.label||it.heading),'',
    '- **Placement:** '+(it.placement?.mode==='EXTEND_SECTION'?'extend the existing section':'add as a new section directly after')+' “'+(it.placement?.section_heading||'(page start)')+'”',
    '- **Why there:** '+(it.placement?.reason||''),
    '- **Add this H2:** '+it.heading,'','**Proposed text (fact-check before approval):**','',it.text,'');
   for(const ev of (it.task?.competitor_evidence||[]).slice(0,2))L.push('> Compared with '+ev.url+' (“'+ev.heading+'”): '+clip(ev.excerpt,160)+'…');
   L.push('');
  }
  if(decision.claim_review){
   const cr=decision.claim_review;
   L.push('**Claim review — copy_ready means “reviewable”, not “verified”:**','',
    '- Statements sourced from the destination page: '+cr.counts.sourced_from_page,
    '- General advice (procedural, not a factual claim): '+cr.counts.general_advice,
    '- General statements NOT verified by any source: '+cr.counts.general_statement_unverified);
   for(const x of cr.needs_fact_check||[])L.push('  - Fact-check: “'+clip(x,160)+'”');
   for(const x of cr.needs_safety_review||[])L.push('  - Safety review by a qualified professional: “'+clip(x,160)+'”');
   for(const x of cr.needs_owner_confirmation||[])L.push('  - Confirm with the business (repeats a claim the page makes): “'+clip(x,160)+'”');
   for(const x of cr.requirements||[])L.push('- '+x);
   L.push('');
  }
  const rejectedRaw=(completion?.draft?.sections||[]).filter(s=>s.review_status==='REJECTED_NOT_PART_OF_PROPOSAL');
  if(decision.copy_ready&&rejectedRaw.length){
   L.push('**Generated but rejected (not part of the proposal, text omitted on purpose):**','');
   for(const s of rejectedRaw)L.push('- “'+clip(s.h2,90)+'” — '+((s.rejection_reasons||[]).map(x=>x.code+(x.claim_violations?.length?' ('+x.claim_violations.join(', ')+')':'')).join('; ')||'did not pass the checks'));
   L.push('');
  }
  if(!decision.copy_ready&&(completion?.generator_rejections||[]).length){
   L.push('**The generator’s own topic check rejected the whole draft before validation** ('+String(completion.status||'')+'):','');
   for(const x of completion.generator_rejections)L.push('- “'+clip(x.h2,90)+'” — '+x.reason);
   L.push('');
  }
  if(!decision.copy_ready){
   L.push('**No reviewable copy yet:** '+(decision.copy_status||'')+'. '+(decision.next_action||''),'');
   for(const rj of decision.draft_rejections||[]){
    L.push('- Draft section “'+clip(rj.heading||'',80)+'” rejected: '+(rj.code||'')+(rj.reason?' — '+rj.reason:''));
    for(const v of rj.claim_violations||[])L.push('  - '+v.code+': '+v.reason+' (“'+clip(v.sentence,120)+'”)');
   }
   L.push('');
  }
  if((decision.safe_rewrites||[]).length){
   L.push('**Wording changed automatically (review each change):**','');
   for(const w of decision.safe_rewrites){
    if(w.after==='')L.push('- Removed an internal note that had leaked into the draft: “'+clip(w.before,110)+'…”');
    else for(const c of w.changes){
     const i=w.before.toLowerCase().indexOf(String(c.from).toLowerCase());
     const ctx=i>=0?w.before.slice(Math.max(0,i-45),i+String(c.from).length+45):w.before;
     L.push('- “…'+ctx.trim()+'…”: “'+c.from+'” → “'+c.to+'”');
    }
   }
   L.push('');
  }
 }
 if(d==='NEW_DISTINCT_PAGE'){
  const pg=decision.new_page_draft;
  const tool=decision.new_page_plan?.page_type==='PRODUCT_OR_TOOL_PAGE';
  L.push('## New page proposal','','Working query: '+(decision.new_page_plan?.working_query||''),'',
   'Why a separate page: '+decision.reason,'',
   ...(tool?['Page type: **tool / product page**. Write it yourself from your real product: features, pricing, screenshots. Growth does not generate product claims.',
    '','Keep the existing page '+(decision.new_page_plan?.keep_existing_page||'')+' as it is and link from it to the new tool page.','']
    :['Facts source on your site: '+(decision.new_page_plan?.facts_source_url||''),'']));
  if(pg){if(pg.seo_title)L.push('**Proposed title:** '+pg.seo_title,'');if(pg.meta_description)L.push('**Proposed description:** '+pg.meta_description,'');
   for(const s of pg.sections){L.push('## '+s.h2,'',...s.paragraphs.flatMap(p=>[p,'']))}}
  else L.push('**No reviewable copy yet:** '+(decision.copy_status||''),'');
 }
 if(d==='NO_CHANGE'){
  L.push('## Closure report','',decision.reason,'');
  for(const t of decision.closure_report?.tasks_checked||[])L.push('- '+t.label+': '+t.destination_status.replace(/_/g,' ').toLowerCase());
  if(decision.closure_report?.note)L.push('',decision.closure_report.note);
  L.push('');
 }
 if(d==='DATA_BLOCKED'){
  L.push('## Missing evidence','');
  for(const m of decision.missing_evidence||[])L.push('- **'+m.code+':** '+m.detail);
  L.push('','### Automatic sources already tried','');
  for(const a of decision.attempted_sources||[])L.push('- '+a.source+': '+a.status+(a.detail?' — '+a.detail:''));
  L.push('');
 }
 if(linkPlan.length){
  L.push('## Internal links (review each)','');
  for(const k of linkPlan){
   L.push('- From '+k.from_url+' → '+k.to_url+' — '+k.status.replace(/_/g,' ').toLowerCase()+
    (k.anchor_text?' — anchor “'+k.anchor_text+'” in the paragraph “'+clip(k.paragraph_excerpt,140)+'…”':''));
  }
  L.push('');
 }
 L.push('## Search Console evidence used','',
  g.exact_query_verified?'Destination page-verified GSC row for the exact query exists (measurement window: unknown).':
  'No verified Search Console rows for the target page and this query ('+(g.status||'NO_VERIFIED_DESTINATION_ROWS')+'). No click, impression or position claim is made for the target page. Rows for the tracked page are never transferred to it.','',
  '## Limits','','No ranking, click gain or competitor advantage is claimed. Lexical and pattern checks are observations on captured HTML. Owner approval is required before anything goes live.');
 const markdown=L.join('\n').replace(/\n{3,}/g,'\n\n')+'\n';
 return {status:'OWNER_HANDOFF_PACKAGE_READY',cms_independent:true,publication_allowed:false,
  files:[{name:'contentscale-growth-owner-package.md',content_type:'text/markdown',content:markdown}],
  internal_link_plan:linkPlan,markdown};
}
module.exports={buildOwnerHandoffPackage,planInternalLinks};
