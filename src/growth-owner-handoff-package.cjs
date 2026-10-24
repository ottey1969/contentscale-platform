'use strict';
// CMS-neutral owner package (Markdown + structured JSON). WordPress/Wix/other CMS stay optional.
// Describes what changes on which existing URL and where. Never publishes, never touches a Case Study.
const {blocks,queryRoots,STEMS}=require('./growth-reader-task-coverage.cjs');
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
 const cov=report.reader_task_coverage;
 if(report.serp_intent?.leads?.length){
  L.push('## Search intent observed','','Fresh organic results for “'+(decision.focus_query||'')+'” ('+(report.search_discovery?.source||'search provider')+', '+(report.search_discovery?.checked_at||'')+'). Discussion sites excluded. Placement here is not a ranking of your page.','');
  for(const l of report.serp_intent.leads.slice(0,6))L.push('- '+l.class+' — '+l.title+' — '+l.url);
  L.push('','Agreement: '+report.serp_intent.agreeing_leads+' of '+report.serp_intent.organic_leads_considered+' → '+report.serp_intent.intent+'.','');
 }
 if(cov?.tasks?.length){
  L.push('## Reader-task comparison','','Competitors read in full: '+(cov.competitors_considered||[]).map(c=>c.url).join(', ')+'.','',
   '| Reader task | Independent competitor sources | Your target page |','|---|---:|---|');
  for(const t of cov.tasks.filter(x=>x.independent_sources>0))
   L.push('| '+t.label+' | '+t.independent_sources+' | '+t.destination.status.replace(/_/g,' ').toLowerCase()+(t.covered_elsewhere_on_site?.length?' (taught on '+t.covered_elsewhere_on_site[0].url+')':'')+' |');
  L.push('','Method: '+cov.method+'. A concept match is an observation, not proof of quality or ranking.','');
 }
 if(d==='IMPROVE_EXISTING'){
  const plan=decision.improvement_plan||{};
  L.push('## What changes where','','**Existing URL:** '+(decision.target_url||plan.target_url),'',
   '**Keep unchanged:** '+(plan.preserve||[]).join('; ')+'.','');
  const items=[{task:(plan.tasks||[])[0],heading:decision.draft_heading,text:decision.proposed_text,placement:decision.placement},
   ...(decision.additional_sections||[]).map(a=>({task:(plan.tasks||[]).find(t=>t.code===a.task),heading:a.heading,text:a.text,placement:a.placement}))];
  let n=1;
  for(const it of items){
   if(!it.text)continue;
   L.push('### Change '+n+++': '+(it.task?.label||it.heading),'',
    '- **Placement:** '+((it.placement?.mode||'').replace(/_/g,' ').toLowerCase())+' — section “'+(it.placement?.section_heading||'(page start)')+'”',
    '- **Why there:** '+(it.placement?.reason||''),
    '- **Add this H2:** '+it.heading,'','**Proposed text (fact-check before approval):**','',it.text,'');
   for(const ev of (it.task?.competitor_evidence||[]).slice(0,2))L.push('> Compared with '+ev.url+' (“'+ev.heading+'”): '+clip(ev.excerpt,160)+'…');
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
   L.push('**Wording softened automatically (review each change):**','');
   for(const w of decision.safe_rewrites)L.push('- “'+clip(w.before,140)+'” → “'+clip(w.after,140)+'”');
   L.push('');
  }
 }
 if(d==='NEW_DISTINCT_PAGE'){
  const pg=decision.new_page_draft;
  L.push('## New page proposal','','Working query: '+(decision.new_page_plan?.working_query||''),'',
   'Why a separate page: '+decision.reason,'','Facts source on your site: '+(decision.new_page_plan?.facts_source_url||''),'');
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
