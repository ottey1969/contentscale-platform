'use strict';
// Read-only working plan. Retains every legitimate evidence observation while
// separating useful improvements from unrelated / historical search intents.
const {terms,queryFit}=require('./growth-one-action-decision.cjs');
const decode=s=>String(s||'').replace(/&(?:amp|nbsp|quot|#39|lt|gt);/gi,m=>({'&amp;':'&','&nbsp;':' ','&quot;':'"','&#39;':"'",'&lt;':'<','&gt;':'>'}[m.toLowerCase()]||m));
const plain=x=>decode(String(x||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ')).trim();
const normalize=x=>plain(x).toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
function sectionEvidence(html,query){
 const raw=String(html||'').slice(0,120000)
  .replace(/<(?:style|script|noscript|template)\b[^>]*>[\s\S]*?<\/(?:style|script|noscript|template)>/gi,' ');
 const headings=[...raw.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/gi)].slice(0,35);
 const tokens=terms(query);
 const evidence=headings.map((m,i)=>{
  const h=plain(m[1]).slice(0,220),hTokens=terms(h);
  const intersection=tokens.filter(w=>hTokens.includes(w)).length;
  const following=raw.slice(m.index+m[0].length,headings[i+1]?.index||raw.length);
  const words=plain(following).slice(0,2400);
  const how=/\b(how|steps?|strategy|strategies|improve|optimiz|scale|plan|process|approach|method|tips|checklist)\b/i.test(h)?1:0;
  return {heading:h,matched_terms:intersection,snippet:words.slice(0,500),approx_words:words?words.split(/\s+/).length:0,
   score:intersection*3+how+(/^(?:how|steps|strategy|strategies|process|checklist)\b/i.test(h)?2:0)};
 }).filter(x=>x.matched_terms>0).sort((a,b)=>b.score-a.score);
 return evidence[0]||null;
}
function classifyAllQueries({report,decision}){
 const rows=report?.search?.verified_queries||[],protect=new Set((decision?.protected_queries||[]).map(x=>x.query.toLowerCase()));
 const chosen=String(decision?.primary_next_action?.query||'').toLowerCase();
 const exclude=new Map((decision?.excluded_queries||[]).map(x=>[x.query.toLowerCase(),x.reason]));
 let domain='';try{domain=new URL(report.url).hostname.replace(/^www\./,'').split('.')[0].toLowerCase()}catch{}
 return rows.map(q=>{
  const label=String(q.query||'');const key=label.toLowerCase().trim();
  let category,meaning;
  if(protect.has(key)){category='PROTECT';meaning='Strong existing rankings/clicks. Preserve the current page rather than rewriting the title or H1.';}
  else if(key===chosen){category='IMPROVE_EXISTING';meaning='High impressions but few clicks at a lower average ranking. Investigate the existing page and search intent first.';}
  else if(domain&&key.replace(/[^a-z0-9]/g,'')===domain){category='BRAND_NAVIGATION';meaning='Branded navigation. Review the snippet and conversion journey separately from generic SEO searches.';}
  else if(exclude.has(key)){category='SEPARATE_OR_UNCONFIRMED_INTENT';meaning='Do not use this query to change the tracked page: '+exclude.get(key)+'. It can still justify a different existing page after independent intent verification.';}
  else{category='MONITOR_OR_QUALIFY';meaning='Keep in the evidence inventory; evaluate intent, ranking and clicks before proposing a change.';}
  return {query:label,category,meaning,impressions:Number(q.impressions)||0,
   clicks:Number(q.clicks)||0,position:q.position==null?null:Number(q.position)};
 });
}
function meaningfulCompetitorEvidence(report,focus){
 const list=report?.competitors?.live_reviewed||[],query=String(focus||'').toLowerCase();
 const offIntent=/\bdetector\b|\bdetect\b|\bplagiarism\b|\baccuracy\b|\breviews?\b|\bbrandwell\b/i;
 return list.map(item=>{
  const title=String(item.title||''),sample=[title,...(item.h1||[]),...(item.h2||[]).slice(0,10)].join(' ');
  const conflict=offIntent.test(sample)&&!offIntent.test(query);
  const tokens=terms(query),observed=new Set(terms(sample)),matched=tokens.filter(x=>observed.has(x));
  return {url:item.url,title,read_at:item.retrieved_at||null,
   category:conflict?'DIFFERENT_SEARCH_INTENT':matched.length>=Math.min(2,tokens.length)?'TOPIC_ALIGNED_NEEDS_SERP_CHECK':'TOPIC_MATCH_NOT_ESTABLISHED',
   reason:conflict?'Mainly describes a different product/review intent; not a direct optimization benchmark.':
    'Contains matching terms only. Competitor relevance, current ranking and factual advantage are not established.',
   observed_headings:(item.h2||[]).slice(0,8),
   observed_paragraph_samples:(item.paragraph_samples||[]).slice(0,2),
   discovery_source:item.discovery_source||'HISTORICAL_SERP'};
 });
}
function buildGrowthPracticalBrief({report,html=''}={}){
 const decision=report?.growth_decision||{},next=decision.primary_next_action||{};
 const query=next.query||report?.search?.focus_query||'';
 const section=sectionEvidence(html,query);
 const competitors=meaningfulCompetitorEvidence(report,query);
 const classified_queries=classifyAllQueries({report,decision});
 const alreadyHere=Boolean(section?.heading),locked=decision?.protection?.case_study_locked===true;
 const queries=classified_queries.reduce((a,r)=>(a[r.category]=(a[r.category]||0)+1,a),{});
 const matchedRivals=competitors.filter(x=>x.category==='TOPIC_ALIGNED_NEEDS_SERP_CHECK');
 const ownHeadings=new Set((report.page_content?.headings?.h2||[]).map(x=>normalize(x)));
 const comparisonQuestions=matchedRivals.flatMap(r=>r.observed_headings.filter(h=>{
  const norm=normalize(h);
  return norm&&norm.length>12&&!/^(?:conclusion|summary|more from|related articles|frequently asked questions|faq|references)$/i.test(norm);
 }).map(h=>({competitor_url:r.url,observed_heading:h,already_same_heading:ownHeadings.has(normalize(h)),
  editorial_check:'Inspect the existing section and page body. Heading differences do not prove missing information or superiority.',
  evidence:'LIVE_PUBLIC_COMPETITOR_HTML_NOT_VERIFIED_RANKING'}))).slice(0,6);
 const m={status:'REVIEWABLE_PLAN_NO_PUBLISH',page_url:report.url,
  focus_query:query,query_categories:queries,classifications:classified_queries,
  competitors:{inspected:competitors.length,relevant_to_action:matchedRivals.length,
   requiring_separate_intent_review:competitors.length-matchedRivals.length,classification:competitors,
   comparison_questions:comparisonQuestions,
   warning:matchedRivals.length?'Matching terms are not proof of current SERP competition.':
    'The saved competitor sample does not establish search competitors for this Growth action. Do not copy or benchmark against unrelated detector/review pages.'},
  content_section:section?{heading:section.heading,observed_excerpt:section.snippet,approx_observed_words:section.approx_words,source:'LIVE_OR_SAVED_HTML_EXCERPT'}:null,
  change:{type:alreadyHere?'REVIEW_AND_IMPROVE_EXISTING_SECTION':'PROPOSE_RELEVANT_SECTION_FOR_REVIEW',
   target_section:section?.heading||null,evidence_basis:next.query?'Exact-page GSC query + observed website section; this is not a proven SERP gap.':'Observed page topic without exact-page GSC metrics; no ranking or click assertions are made.',
   retain_title_h1:true,new_page_required:false,copy_ready:false,editor_review_required:true,
   summary:alreadyHere?'Check the existing answer for completeness and add missing practical steps only after reviewing the source.':
    'No matching H2 in the inspected excerpt. Prepare a focused, factual answer on the original URL for review.',
   steps:[
    'Keep the existing title, H1, useful paragraphs and images; do not replace a performing page wholesale.',
    'Check whether the current section directly answers "'+query+'" with actionable steps, constraints and relevant evidence.',
    'Verify the current search results and whether a tracked existing page serves the intent better before proposing a new URL.',
    'Add only factual, distinct, editor-reviewed text where the original answer is actually incomplete.',
    'Measure URL-level clicks and impressions over comparable, date-bounded periods after approved publication.'
   ],
   ready_to_review_text:[]},
  guard:{case_study_locked:locked,can_prepare_review_copy:true,can_publish:false,can_change_live:false,
   disclaimer:'Research and editorial preparation are permitted; an active Case Study baseline and existing content remain unchanged.'}};
 // Real, useful edit example only where the user's observed GSC topic matches
 // content-scaling strategy. It is process advice, not an invented client result.
 if(/\bcontent scaling\b|\bscale content\b|\bcontent at scale\b/i.test(query)&&
     /\bcontent\b/i.test([report.page_content?.headings?.title,section?.heading].join(' '))){
  m.change.type=alreadyHere?'PREPARE_EXPANSION_OF_EXISTING_SECTION':'PROPOSE_SECTION_FOR_REVIEW';
  m.change.summary='Prepare a practical explanation of scaling content while protecting search intent, quality and clicks. Add to the matching existing section only if its current answer lacks these steps.';
  m.change.ready_to_review_text=[
   'Scaling content should start with the pages and search intentions you already serve, not with a target article count. Inventory the existing URLs, identify overlapping topics, and check which pages already attract impressions and clicks. That establishes what should be updated, consolidated, supported with internal links, or left unchanged.',
   'For each proposed improvement, compare the page with the current search results for its intended query. Give the reader a direct answer and practical next steps. Review factual accuracy, useful examples, author credibility, and relevant links before approving the update. Preserve strong existing rankings instead of rewriting titles or headings simply to add keywords.',
   'After publication, measure clicks and impressions for the same URL over comparable date ranges. Treat AI-system mentions or citations as separate observations, not a substitute for verified Google Search Console metrics. If the current answer already explains these steps clearly, do not add duplicate text.'
  ];
  m.change.copy_ready=true;
 }
 return m;
}
module.exports={buildGrowthPracticalBrief,sectionEvidence,classifyAllQueries,meaningfulCompetitorEvidence};
