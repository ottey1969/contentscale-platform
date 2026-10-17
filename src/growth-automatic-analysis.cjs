'use strict';
const {inspectSavedGrowthHtml}=require('./tracker-growth-snapshot-signals.cjs');
const {snapshotCompetitorLeads}=require('./growth-snapshot-competitors.cjs');
const {summarizeGrowthAiVisibility}=require('./growth-ai-visibility-summary.cjs');
const {buildTrackerGrowthPlan}=require('./tracker-growth-plan.cjs');
function plain(s){return String(s||'').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&(?:amp|quot|nbsp|lt|gt|#39);/g,' ').replace(/\s+/g,' ').trim()}
function excerpt(html,limit=8){
 if(typeof html!=='string')return {title:null,description:null,h1:[],h2:[],paragraph_samples:[]};
 const clean=html.slice(0,120000).replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<!--[\s\S]*?-->/g,'');
 const title=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(clean);
 const desc=(clean.match(/<meta\b[^>]*>/gi)||[]).find(x=>/\bname\s*=\s*["']description["']/i.test(x));
 const d=desc&&/\bcontent\s*=\s*["']([^"']+)["']/i.exec(desc);
 const get=(tag,n=limit)=>[...clean.matchAll(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'\\s*>','gi'))].slice(0,n).map(x=>plain(x[1]).slice(0,200)).filter(Boolean);
 return {title:title?plain(title[1]).slice(0,200):null,description:d?plain(d[1]).slice(0,280):null,
  h1:get('h1',4),h2:get('h2'),paragraph_samples:get('p',3).map(x=>x.slice(0,240))};
}
const words=x=>String(x||'').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>3&&!new Set(['with','from','your','this','that','about','when','what','where','some','more','will','best','have','into','voor','over','deze','geen','voor','zijn','also','page','home','services']).has(x));
const sHtml=x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function analyzeGrowthEvidence({page={},savedHtml=null,live=null,snapshot=null,aiRows=[],gscRows=[],competitorPages=[],now=new Date()}={}){
 const url=String(page.url||'');
 const saved=inspectSavedGrowthHtml(savedHtml,url);
 const actual=live?.html?inspectSavedGrowthHtml(live.html,url):saved;
 const actualHtml=live?.html||savedHtml||'';
 const source=live?.html?'LIVE_PUBLIC_HTML_OBSERVED':saved.available?'SAVED_HTML_HISTORICAL':'NO_PAGE_HTML';
 const actualText=excerpt(actualHtml);
 const leads=snapshotCompetitorLeads({page,snapshot});
 const ai=summarizeGrowthAiVisibility({page,rows:aiRows});
 const validQ=(Array.isArray(gscRows)?gscRows:[]).filter(x=>x&&String(x.source_page_url)===url&&x.evidence_scope==='page_verified'&&Number(x.page_id)===Number(page.id)&&Number(x.tracker_client_id)===Number(page.tracker_client_id));
 const newest=new Map();
 for(const q of validQ){const k=String(q.query||'').toLowerCase().trim(),old=newest.get(k);if(k&&(!old||Date.parse(q.imported_at||'')>Date.parse(old.imported_at||'')))newest.set(k,q)}
 const queries=[...newest.values()].sort((a,b)=>(Number(b.impressions)||0)-(Number(a.impressions)||0)).slice(0,12);
 const focus=queries[0]?.query||String(page.keyword||'').trim()||actualText.h1[0]||'';
 const comparison=competitorPages.filter(x=>x&&x.live?.html&&x.url&&leads.leads.some(c=>c.url===x.url)).slice(0,4).map(x=>{
  const summary=excerpt(x.live.html);
  return {url:x.url,source:'LIVE_COMPETITOR_HTML_OBSERVED',retrieved_at:x.live.retrieved_at,
   title:summary.title,h1:summary.h1,h2:summary.h2,description:summary.description,
   signals:inspectSavedGrowthHtml(x.live.html,x.url)};
 });
 const observedTopics=new Set(words([actualText.title,...actualText.h1,...actualText.h2,...actualText.paragraph_samples].join(' ')));
 const comparative=[];
 for(const competitor of comparison){
  for(const heading of competitor.h2.slice(0,7)){
   const relevant=words(heading);
   if(relevant.length>=2&&relevant.filter(w=>observedTopics.has(w)).length/Math.max(1,relevant.length)<0.4 &&
      !comparative.some(x=>x.heading.toLowerCase()===heading.toLowerCase())){
    comparative.push({heading,source_url:competitor.url,status:'TOPIC_TO_VERIFY_NOT_PROVEN_GAP',
      reason:'Observed competitor heading is not reflected in the sampled headings and paragraphs of the tracked page. Confirm the full-page intent and originality before adding.'});
   }
  }
 }
 const findings=[];
 function add(code,priority,evidence,action){findings.push({code,priority,evidence,action})}
 if(!actual.available)add('SOURCE_UNAVAILABLE','HIGH','No accessible live or saved HTML','Restore page access or supply an original source; other research can continue');
 else {
  if(actual.h1_count_observed===0)add('H1_NOT_OBSERVED','HIGH',source,'Check the actual rendered H1 and add a descriptive one only if genuinely absent');
  if(actual.h1_count_observed>1)add('MULTIPLE_H1_OBSERVED','REVIEW',source,'Review heading hierarchy in the rendered layout before changing');
  if(!actual.title_observed)add('TITLE_NOT_OBSERVED','HIGH',source,'Review an accurate search-intent title for this exact URL');
  if(!actual.meta_description_observed)add('META_DESCRIPTION_NOT_OBSERVED','MEDIUM',source,'Prepare accurate meta description and verify existing CMS metadata');
  if(actual.internal_links_observed===0)add('INTERNAL_LINK_NOT_OBSERVED','MEDIUM',source,'Check actual contextual links; connect relevant existing pages without manufacturing destinations');
  if(actual.images_missing_alt_observed>0)add('IMAGE_ALT_REVIEW','MEDIUM',source,actual.images_missing_alt_observed+' observed images without nonempty alt; decide descriptive versus decorative');
  if(actual.noindex_directive_observed)add('NOINDEX_OBSERVED','HIGH',source,'Confirm the intended indexing policy on the live page before any publication');
 }
 if(comparative.length)add('COMPETITOR_TOPIC_CANDIDATES','REVIEW',comparison.map(x=>x.url).slice(0,4),'Evaluate observed competitor topic headings against full actual page and intended query');
 if(!queries.length)add('EXACT_PAGE_GSC_OPTIONAL','INFO','No exact-page verified GSC query available','Keep research active without GSC; do not claim rankings, zero clicks or uplift');
 if(!ai.engines.length)add('AI_EVIDENCE_NOT_AVAILABLE','INFO','No stored AI observation','Do not claim AI recommendations or citations until verified observations are recorded');
 const intendedTitle=(actualText.title||focus||'').slice(0,70);
 const titleCandidate=(!actualText.title&&focus)?(focus.length<=57?focus:'').trim():null;
 const plan=buildTrackerGrowthPlan({page,queries:validQ,sitePages:[],now});
 const priorities=findings.sort((a,b)=>({HIGH:0,MEDIUM:1,REVIEW:2,INFO:3}[a.priority]??4)-({HIGH:0,MEDIUM:1,REVIEW:2,INFO:3}[b.priority]??4));
 const editorial={
  status:'REVIEWABLE_RESEARCH_DRAFT_NOT_PUBLISHABLE',
  preserve_existing_page:true,
  focus_query:{text:focus||null,status:queries.length?'VERIFIED_EXACT_PAGE_QUERY':'WORKING_TOPIC_NOT_RANKING_PROOF'},
  current_title:intendedTitle||null,
  suggested_title_if_missing:titleCandidate,
  existing_description:actualText.description,
  existing_h1:actualText.h1,
  observed_h2:actualText.h2,
  candidate_sections:comparative.slice(0,5).map(x=>({proposed_topic:x.heading,
   derived_from:x.source_url,approval_needed:'Verify actual page need, facts, originality and distinct search intent. Never copy competitor text.'})),
  prioritized_edits:priorities.filter(x=>x.priority!=='INFO').slice(0,8),
  fact_check_required:true,
  cms_handoff_available:!page.case_study_active,
  cms_targets:['Wix','WordPress','Webflow','Squarespace','custom']
 };
 const verifiedCount=queries.length;
 return {
  success:true,generated_at:now.toISOString(),page_id:page.id,url,case_study_locked:!!page.case_study_active,
  summary:{primary_source:source,live_retrieved_at:live?.retrieved_at||null,history_checked_at:snapshot?.checked_at||null,
   exact_gsc_queries:verifiedCount,ai_engines:ai.engines.length,competitor_leads:leads.leads.length,competitors_live_reviewed:comparison.length,
   result:'AUTOMATED_RESEARCH_REPORT',published:false,forecasted_click_gain:null},
  page_content:{status:source,live_url:live?.final_url||null,signals:actual,headings:actualText},
  search:{focus_query:focus||null,verified_queries:queries.map(q=>({query:q.query,impressions:Number(q.impressions),clicks:Number(q.clicks),position:q.position==null?null:Number(q.position),imported_at:q.imported_at})),
   warnings:plan.warnings,observed_opportunities:plan.opportunities},
  competitors:{snapshot_status:leads.status,snapshot_checked_at:leads.checked_at,
   leads:leads.leads.slice(0,12),live_reviewed:comparison,topic_candidates:comparative.slice(0,10),
   caution:'Historical SERP leads are not current rankings. Live page headings only show topics, not proven factual differences.'},
  ai_visibility:ai,findings:priorities,editorial,
  protection:'No GSC requirement, no scan scheduler change, no content/Case Study writes, no automatic publication.'
 };
}
module.exports={analyzeGrowthEvidence,excerpt,plain,sHtml};
