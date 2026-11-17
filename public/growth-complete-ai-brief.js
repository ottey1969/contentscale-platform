(function(root,factory){
 'use strict';
 var api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.GrowthCompleteAiBrief=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 var list=v=>Array.isArray(v)?v:[];
 var str=(v,max=600)=>String(v==null?'':v).replace(/\s+/g,' ').trim().slice(0,max);
 var bullet=(values,missing='NOT AVAILABLE IN SAVED RESEARCH')=>{
  var a=list(values).map(x=>str(x,600)).filter(Boolean);
  return a.length?a.map(x=>'- '+x).join('\n'):'- '+missing;
 };
 var sourceUrls=items=>{
  var out=[],seen=new Set();
  list(items).forEach(item=>{
   var v=typeof item==='string'?item:(item&&item.url)||'';
   if(typeof v!=='string'||!/^https:\/\//i.test(v))return;
   try{var u=new URL(v);if(u.username||u.password)return;var key=u.href;if(seen.has(key))return;seen.add(key);out.push(key)}catch(_){}
  });
  return out;
 };
 var section=(name,body)=>'\n## '+name+'\n\n'+(body||'NOT AVAILABLE IN SAVED RESEARCH')+'\n';
 var safeJson=(x,max=25000)=>{
  try{return JSON.stringify(x,null,2).slice(0,max)}catch(_){return 'NOT SERIALIZABLE'}
 };
 function build(d,opts){
  d=d&&typeof d==='object'?d:{};opts=opts||{};
  var search=d.search_discovery||{},gap=d.gap_list||{},ai=d.ai_check||{},aig=ai.gap||{},aiSummary=ai.summary||{},
   locale=search.search_locale||{},page=d.page_content||{},heads=page.headings||{},
   competitor=d.competitor_overview||{},editor=d.editorial_decision_gate||{},
   plan=d.practical_growth_plan||{},pre=d.prewrite_match||d.prewrite_brief||{},
   topics=list(opts.topics).length?opts.topics:list(aig.missing_topics),
   own=String(d.url||gap.target_url||''),query=str(opts.query||ai.search_term||editor.focus_query||gap.focus_query||search.target_query,300),
   market=str(opts.market||locale.country||gap.research?.market?.country||'',80),
   language=str(opts.language||locale.hl||gap.research?.market?.language||'',80);
  var lines=['# CONTENTSCALE GROWTH — COMPLETE EXTERNAL AI RESEARCH & WRITING BRIEF',
   'Status: EDITORIAL RESEARCH INPUT ONLY · NOT PUBLICATION-READY',
   'Generated from the current saved Growth report. Missing fields are explicitly marked; they are NOT AI research or verified evidence.',
   ''],
   add=(name,body)=>lines.push(section(name,body)),
   value=(v)=>str(v,1200)||'NOT AVAILABLE IN SAVED RESEARCH',
   questions=list(plan.competitors?.comparison_questions),
   rankItems=list(gap.items),
   sourceHeads=gap.research?.source_headings||heads,
   sourceSites=list(aig.pages).filter(x=>x&&x.read),
   searchRank=list(search.leads),
   reviewSources=sourceUrls([...list(gap.ranking_pages),...list(competitor.ranking_pages),...searchRank,...sourceSites]);
  add('1. TASK IDENTITY AND EXACT SEARCH INTENT',[
   'Existing page URL: '+value(own),
   'Exact customer question — KEEP UNCHANGED: '+value(query),
   'Tracked seed keyword: '+value(d.tracked_seed_keyword||d.tracked_keyword||gap.seed_keyword),
   'Target market: '+value(market),
   'Language: '+value(language),
   'Research completed / saved: '+value(d.saved_at||d.generated_at||gap.research?.researched_at),
   'Research stage: existing-page improvement, NOT a new page unless explicitly approved.',
   'Target slug: '+(own?(()=>{try{return new URL(own).pathname}catch(_){return 'NOT VERIFIED'}})():'NOT AVAILABLE IN SAVED RESEARCH'),
   'Source status: '+value(search.status||search.source),
   'This exact user question controls intent, entities, examples, calls to action and page sections.',
   'DO NOT broaden an informational question into a provider recommendation or vice versa.'
  ].join('\n'));
  add('2. WHAT IS ALREADY ON THE PAGE — PRESERVE / IMPROVE',[
   'Current H1 headings:',bullet(sourceHeads.h1||[]),
   'Current H2 headings:',bullet(sourceHeads.h2||[]),
   'AI-read headings (may be partial):',bullet(aig.your_headings),
   'Unique content worth preserving (not automatically true or good):',
   bullet(list(gap.unique_content).map(x=>x.heading||x.title||x)),
   'Source page read status: '+value(page.signals?.available===true?'HTML available':page.signals?.available===false?'HTML not confirmed readable':'NOT CONFIRMED'),
   'Page fingerprint: '+value(gap.source_fingerprint||gap.research?.page_fingerprint),
   'Existing page sections must be re-opened and checked before writing; do not remove useful material.'
  ].join('\n'));
  add('3. RESEARCH COMPLETENESS AND EVIDENCE QUALITY',[
   'Google discovery: '+value(search.source)+' · status '+value(search.status),
   'Readable ranking pages: '+value(gap.evidence?.readable_ranking_pages??gap.ranking_pages_read),
   'Growth writing permission based on evidence: '+(gap.writing_allowed===true?'YES · still requires editor approval':gap.writing_allowed===false?'NO · EVIDENCE INSUFFICIENT':'UNKNOWN'),
   'Reason / limitation: '+value(gap.evidence?.reason||search.reason),
   'AI cited-page reading: '+value(aig.status)+' · '+sourceSites.length+' readable of '+list(aig.pages).length+' checked',
   'AI topic comparison method: '+value(aig.topics_basis),
   'Citation verification is separate from writing answer availability. A user-pasted answer is not independently provider verified.',
   'Unverified GSC rank, impressions, click data, traffic attribution, AI mentions or citations MUST NOT be claimed as measured.',
   'Known evidence warnings:',bullet(list(d.evidence_warnings).map(x=>typeof x==='string'?x:x.message||x.code||safeJson(x,300))),
  ].join('\n'));
  add('4. LIVE SEARCH / RANKING COMPETITOR SOURCE LEADS',[
   'These are observed URLs or leads, NOT proof that every source was successfully read.',
   'Exact source URLs:',bullet(reviewSources),
   'Competitor fetch log (keep failures and unreadable states visible):',
   bullet(list(search.competitor_fetch_log).map(x=>[x.url,x.outcome||x.status,x.serp_position?'position '+x.serp_position:''].filter(Boolean).join(' | '))),
   'Ranked-page evidence for this specific question:',
   bullet(list(gap.ranking_pages).map(x=>[x.url,'observed position '+(x.position??'UNKNOWN')].join(' | '))),
   'Side-by-side excerpts with exact observed sources:',
   bullet(list(plan.competitors?.side_by_side).map(x=>[x.competitor_url,x.competitor_section,x.competitor_excerpt,'Current section: '+(x.tracked_page_section||'NOT LOCATED'),'Suggested action: '+(x.editorial_action||'REVIEW')].filter(Boolean).join(' | ')))
  ].join('\n'));
  add('5. GOOGLE RANKING-PAGE CONTENT GAPS — WRITING CANDIDATES',[
   'Candidates are not automatically missing content or a business fact.',
   bullet(rankItems.map(x=>[
    'ID '+x.id,'TOPIC '+x.title,'COVERAGE '+(x.coverage||'UNKNOWN'),
    'WRITABLE '+String(x.writable===true),
    'RECOMMENDED '+String(x.recommended===true),
    'RANKING SOURCE COUNT '+value(x.priority?.sources??x.ranking_pages),
    'ACTION '+value(x.priority?.suggested_action),
    'PLACEMENT '+value(x.placement?.section_heading||x.your_section),
    'QUESTION '+value(x.reader_question),
    'SOURCE EXAMPLES '+sourceUrls(x.examples).join(' ; ')||'NOT AVAILABLE',
    'EVIDENCE EXCERPTS '+list(x.examples).map(e=>[e.site,e.heading,e.excerpt].filter(Boolean).join(': ')).join(' | ')||'NOT AVAILABLE'
   ].join('\n  ')))
  ].join('\n'));
  add('6. AI-ANSWER COVERAGE: FIVE SYSTEMS AND CITATION EVIDENCE',[
   'Research question: '+value(ai.search_term||query),
   'Answers available status: '+value(aiSummary.checked??aiSummary.answers_available),
   'AI citation source verification results are NOT equivalent to original-provider answer verification.',
   bullet(list(aiSummary.engines).map(x=>[x.label||x.id,
    'checked='+String(x.checked===true),
    'verifiable='+String(x.verifiable===true),
    'own site cited='+String(x.own_site_cited===true),
    'exact page cited='+String(x.exact_page_cited===true),
    'evidence unknown if not verifiable'].join(' | '))),
   'Raw answer text, if available in the report: '+(list(ai.answers).length?'Included below in research observations.':'NOT INCLUDED IN SAVED REPORT · DO NOT CLAIM QUOTES'),
   bullet(list(ai.answers).map(x=>[x.engine,x.raw_text].filter(Boolean).join(' | ')).slice(0,5)),
   'Observed AI-cited pages:',
   bullet(list(aig.pages).map(x=>[x.url,x.site,'read='+String(x.read===true),'status='+value(x.status),'cited_by='+list(x.cited_by).join(', ')].filter(Boolean).join(' | ')))
  ].join('\n'));
  add('7. AI-CITED CONTENT TOPICS — RESEARCH AND WRITE ONLY IF RELEVANT',[
   'External AI must investigate these; no manual owner writing required. An AI-cited heading is a lead, not proof of an on-page gap.',
   bullet(topics.map((x,i)=>[
    (i+1)+'. '+x.topic,
    'coverage: '+(x.coverage||'UNKNOWN'),
    'cited sites: '+list(x.sites).join(', '),
    'observed excerpt(s): '+list(x.examples).slice(0,5).map(e=>[e.site,e.heading,e.excerpt].filter(Boolean).join(' | ')).join(' ; ')
   ].join('\n  ')))
  ].join('\n'));
  add('8. CUSTOMER QUESTIONS / PEOPLE ALSO ASK / ANSWER FAN-OUT',[
   'Exact customer question: '+value(query),
   'Observed competitor comparison questions:',
   bullet(questions.map(x=>[x.observed_heading,x.editorial_check,x.competitor_url].filter(Boolean).join(' | '))),
   'PAA (only if actual PAA observations were saved):',
   bullet(list(search.people_also_ask||search.paa||d.people_also_ask).map(x=>typeof x==='string'?x:x.question||x.text)),
   'Suggested questions are NOT validated search-volume evidence.',
   'External AI: derive tightly related reader questions, label each OBSERVED or SUGGESTED, and answer the original query first.'
  ].join('\n'));
  add('9. ENTITY STRATEGY, LOCAL CONTEXT AND FACTS',[
   'Primary service / subject: '+value(query),
   'Market boundaries: '+value(market)+' · language '+value(language),
   'Do not infer cities, counties, licensing, service capability or business credentials from competitor pages.',
   'Business claims appearing on cited pages but not verified on ours:',
   bullet(list(aig.missing_facts).map(x=>[x.label,'cited domains '+list(x.sites).join(', '),x.example?.excerpt||''].filter(Boolean).join(' | '))),
   'External AI: identify relevant entities and relationships, avoid entity stuffing, and mark every business-specific fact for owner confirmation.'
  ].join('\n'));
  add('10. SOURCES, ORIGINAL EVIDENCE, STATISTICS AND EXPERT QUOTES',[
   'Source leads (exact collected URLs):',bullet(reviewSources.concat(sourceUrls(list(aig.pages)))),
   'Observed statistics with primary-source verification: NOT VERIFIED FROM THIS SAVED BRIEF unless separately included in inspected source evidence.',
   'Verified expert quotes: NOT AVAILABLE IN SAVED RESEARCH unless directly documented with speaker and URL.',
   'External AI must seek primary sources for numbers, legal/licensing facts and safety claims, keep publication date and jurisdiction, and never fabricate quotes.',
   'Distinguish source leads from actual opened/cited supporting pages.'
  ].join('\n'));
  add('11. INTERNAL LINKING AND REDIRECT SAFETY',[
   'Existing page only. Do not create an internal URL from a keyword, slug guess or sitemap alone.',
   'Internal link candidates in current gap list (if any):',
   bullet(rankItems.flatMap(x=>list(x.internal_links||x.links).map(y=>y.url||y))),
   'HTTP check required for each link: HTTPS, same host, follow redirects, direct final HTTP 200, avoid the source page itself, verify contextual relevance.',
   'If no verified destination is available: NO LINK; do not print fake placeholders.',
   'Anchor text must describe the destination rather than force an exact-match SEO phrase.'
  ].join('\n'));
  add('12. REQUIRED ARTICLE STRUCTURE AND EDITORIAL DELIVERABLE',[
   'A. One concise direct answer to the exact customer question, suitable for a reader needing a clear decision.',
   'B. Current-page coverage table: existing heading, observed text, KEEP / IMPROVE / ADD / NO CHANGE, reasons, risk of duplication.',
   'C. A differentiated H2/H3 outline. For each H2: reader question, purpose, placement, evidence and whether to extend or add a section.',
   'D. Key takeaways and a quick-facts block using only verified facts; mark unknowns rather than guessing.',
   'E. Ready-to-review complete sections in natural language; preserve original services and local intent.',
   'F. FAQ answers to observed or clearly labelled suggested questions (no FAQ schema unless appropriate).',
   'G. Entities, terminology, semantic variants and relevant search intent, without keyword stuffing.',
   'H. Real use cases, clear process explanations and limitations relevant to the actual business.',
   'I. Verified statistics, primary citations and genuine expert quotes only when accessible; otherwise disclose not verified.',
   'J. Suggested SEO title, meta description, H1, URL/slug decision and canonical safeguards; no automatic slug change.',
   'K. Internal link suggestions only after final HTTP 200 validation; external factual citations with exact URLs.',
   'L. Every sentence containing a business claim flagged for factual approval, and a source-to-claim verification table.',
   'M. CMS-ready HTML fragments for approved changes, preserving existing page content; no entire page rewrite unless explicitly justified.',
   'N. A checklist of unanswered questions / needed access and editorial QA PASS / REVIEW / BLOCKED status.',
   'O. A measurement plan: baseline before publishing, publication date, and later page-level GSC/search observations (if available); no promised uplift.',
   'There is no required word count for existing-page improvements: write only what the observed intent and evidenced gap justify.'
  ].join('\n'));
  add('13. NON-NEGOTIABLE SAFETY AND QUALITY GATE',[
   'NO_CHANGE is a legitimate result. Do not manufacture a topic solely to fill a brief.',
   'If original-page HTML, competitor reading, AI answer source or business fact is missing, mark MISSING / UNVERIFIED, not PASS.',
   'Check safety: emergency roofing advice must not tell an untrained reader to climb a damaged roof or approach electrical hazards.',
   'Check search intent and local market, cannibalization with existing related pages, correct final URLs and redirect chains.',
   'Preserve documented original facts and unique useful content. Do not copy competitors.',
   'Do not claim to have searched ChatGPT, Gemini, Claude, Perplexity, Copilot, Google or Bing unless that engine was actually queried.',
   'A copied external AI response is not independently source-verified. Do not publish, update the site or mark items as done automatically.',
   'The editor must explicitly approve proposed changes and publication.'
  ].join('\n'));
  add('14. RESEARCH SNAPSHOT AND UNSUPPORTED FIELDS',[
   'Stored research decision:',safeJson(editor,6500),
   'Market coverage:',safeJson(search.market_coverage||{},3500),
   'Page signals:',safeJson(page.signals||{},3500),
   'Existing-page improvement plan:',safeJson({change:plan.change,comparison_questions:questions},8000),
   'Pre-Write link (if present in report):',safeJson(pre,2500),
   'Missing items in the saved report must be re-researched externally; never pretend the brief already verified them.'
  ].join('\n'));
  lines.push('\n## FINAL OUTPUT FORMAT REQUIRED FROM EXTERNAL AI\n',
   '1. Research coverage and limitations | 2. Facts/evidence matrix with exact URLs | 3. Current-page KEEP/IMPROVE/ADD/NO CHANGE decisions | 4. H2/H3 structure | 5. Complete reviewable copy and quick facts | 6. PAA/FAQ | 7. Entities, original expert insight and verified statistics | 8. Internal/external links | 9. SEO metadata | 10. Claim review checklist | 11. CMS placement/HTML package | 12. Publication and 28-day measurement plan.',
   'Every source must be traceable and every unverified business claim must remain flagged. Return an explicit BLOCKED result if the minimum evidence is not available.\n');
  return lines.join('\n');
 }
 return {build,sourceUrls};
});