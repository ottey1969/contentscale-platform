'use strict';
// Turns a Growth research report into plain language for a visitor without
// SEO knowledge. Only states what the report itself observed; no forecasts.
const BLOCKER_TEXT={
 READABLE_COMPETITOR_ARTICLES:'Fewer than two pages that rank for this search could be read in full, so there is nothing reliable to compare with.',
 COMPLETE_COMPETITOR_HTML:'The ranking pages could not be read completely, so a comparison would not be fair.',
 COMPLETE_DESTINATION_HTML:'Your page could not be read completely.',
 TARGET_HTML_UNAVAILABLE:'Your page could not be opened publicly (it may block automated visitors, require a login or be offline).',
 OWN_SOURCE_INCOMPLETE:'Your page could not be read completely.',
 SERP_INTENT_EVIDENCE:'It is not clear what people searching for this want, so no safe advice can be given.',
 SERP_INTENT:'It is not clear what people searching for this want, so no safe advice can be given.',
 SHARED_COMPETITOR_REQUIREMENTS:'The ranking pages do not agree on what a good answer needs, so no single gap could be confirmed.',
 TOPIC_NOT_RESOLVED:'The search topic of this page could not be determined. Try again with a search term.',
 EXISTING_DESTINATION_EVIDENCE_UNAVAILABLE:'The page that should answer this search could not be read.',
 DIFFERENT_SEARCH_INTENT_AND_NO_COMPATIBLE_SAME_SITE_PAGE:'People searching for this want a different kind of page than the one you entered.',
 QUERY_MEANS_SOMETHING_ELSE:'Google uses this search term for a different subject than your page, so the results are not comparable with your page.',
 TASK_MEANING_NOT_VERIFIED:'Ranking pages share topics with each other, but it could not be checked whether they answer the same question, so no gap is claimed.',
 SUBSTANTIVE_GAP_NOT_VERIFIED:'No missing answer was confirmed by at least two independent ranking pages.'
};
const DIY_BLOCKED=[
 'Check that the page opens in a private browser window without logging in.',
 'Try again with the exact search term your customers type into Google.',
 'If the problem stays, the research needs a manual comparison — that is part of the paid service.'
];
const INTENT_TEXT={LOCAL_SERVICE:'local service pages',INFORMATIONAL:'guides and explanations',COMMERCIAL:'comparison and buying pages',
 TRANSACTIONAL:'pages where people buy or book',NAVIGATIONAL:'specific brand or login pages'};

function placementText(p){
 if(!p)return 'Add it where it fits best on the page.';
 if(p.mode==='ADD_AFTER_SECTION'&&p.section_heading)return `Add it as a new section after “${p.section_heading}”.`;
 if(p.mode==='EXTEND_SECTION'&&p.section_heading)return `Expand the existing section “${p.section_heading}”.`;
 return 'Add it where it fits best on the page.';
}
const taskTitle=label=>String(label||'').replace(/^Competitors teach\s*/i,'').replace(/^[“"]|[”"]$/g,'');
function evidenceOf(list){
 return (list||[]).slice(0,3).map(e=>({url:e.url,site:e.host||(()=>{try{return new URL(e.url).hostname}catch{return ''}})(),
  heading:e.heading||null,excerpt:String(e.excerpt||'').slice(0,400)}));
}

// Every difference with the ranking pages, one list for the owner to choose from (shared with the Tracker).
const {buildGapList}=require('../growth-gap-list.cjs');
const gapList=ov=>buildGapList({competitor_overview:ov});

function summarizeFreeGrowth(report,{url,query}={}){
 const gate=report&&report.editorial_decision_gate||{};
 const decision=gate.decision||'DATA_BLOCKED';
 const serp=report&&report.serp_intent||{};
 const coverage=report&&report.reader_task_coverage||{};
 const discovery=report&&report.search_discovery||{};
 const searched=gate.focus_query||discovery.target_query||report?.query_selection?.query||query||null;
 const read=(discovery.competitor_fetch_log||[]).filter(x=>x.outcome==='READ'||x.outcome==='USED'||x.outcome==='READABLE').length;
 const checked={
  search_term:searched,
  search_term_source:query?'YOU_ENTERED_IT':'DERIVED_FROM_THE_PAGE',
  what_google_shows:serp.intent?(INTENT_TEXT[serp.intent]||String(serp.intent).toLowerCase().replace(/_/g,' ')):null,
  ranking_results_considered:Number(serp.organic_leads_considered)||((discovery.leads||[]).length)||0,
  ranking_pages_read:read||Number(coverage.competitors_considered)||0,
  search_market:discovery.scope?.searched_markets?.length?discovery.scope.searched_markets.map(x=>x.toUpperCase()):discovery.search_locale?.country?[discovery.search_locale.country]:null,
  markets_not_searched:(discovery.scope?.target_markets_not_searched||[]).map(x=>x.name||x.country),
  checked_at:report?.generated_at||null
 };
 let headline,explanation,steps=[],tasks=[];
 if(decision==='IMPROVE_EXISTING'){
  const plan=gate.improvement_plan||{tasks:[]};
  tasks=plan.tasks.map(t=>({title:t.reader_question||taskTitle(t.label),where:placementText(t.placement),
   status:t.destination_status==='PARTIAL'?'Only partly answered on your page':'Not found on your page',evidence:evidenceOf(t.competitor_evidence)}));
  headline=tasks.length===1?'Add one missing answer to this page':`Add ${tasks.length} missing answers to this page`;
  explanation='Your page is the right kind of page for this search, but at least two independent pages that rank for it explain something your page does not.';
  steps=[...tasks.map(t=>`Write a section about “${t.title}”. ${t.where}`),
   'Write it in your own words with facts you can stand behind. Do not copy the example pages.',
   'Keep your current title, main heading and useful text.',
   'After publishing, wait 28 days and compare clicks in Google Search Console with the 28 days before.'];
 }else if(decision==='NEW_DISTINCT_PAGE'&&(gate.new_page_plan||{}).page_type==='PRODUCT_OR_TOOL_PAGE'){
  headline='Google shows tool pages for this search';
  explanation='People searching for this mostly get software tools and tool comparisons, and your page is not a tool page.';
  steps=['Only if you offer such a tool: create a separate page for the tool itself, with its real features, pricing and screenshots.',
   'Keep your current page as it is and link from it to the tool page.',
   'Do not turn your current page into a sales page for a tool you do not offer.'];
 }else if(decision==='NEW_DISTINCT_PAGE'){
  const plan=gate.new_page_plan||{tasks:[]};
  tasks=(plan.tasks||[]).map(t=>({title:taskTitle(t.label),where:'On the new page.',status:'Not on your page',evidence:evidenceOf(t.competitor_evidence)}));
  headline='This search needs its own page';
  explanation='People searching for this want something different from what your page offers. Adding it to this page would mix two topics.';
  steps=[`Create a separate page about “${searched||'this topic'}”.`,...tasks.map(t=>`Cover “${t.title}” on that page.`),
   'Link to it from the page you entered.','Leave the page you entered as it is.'];
 }else if(decision==='NO_CHANGE'){
  headline='No change needed right now';
  explanation=gate.blocker_code==='DESTINATION_IS_PROTECTED_CASE_STUDY'?'This page is protected.':
   'Your page already covers what the ranking pages teach for this search. Changing it without a reason can do more harm than good.';
  steps=['Leave the page as it is.','Check again in about three months, or when your Search Console clicks for this search drop.'];
 }else{
  const code=gate.blocker_code||(gate.missing_evidence&&gate.missing_evidence[0]&&gate.missing_evidence[0].code)||null;
  headline='Not enough reliable evidence for advice';
  explanation=BLOCKER_TEXT[code]||'The research could not collect enough reliable evidence. We do not guess.';
  steps=code==='QUERY_MEANS_SOMETHING_ELSE'?['Keep your page as it is: do not rewrite it toward the other meaning.',
   'Check again with a more specific search term that includes words from your own page.']:DIY_BLOCKED;
  if(code==='QUERY_MEANS_SOMETHING_ELSE'){
   const other=((gate.missing_evidence||[]).find(m=>m.code===code)||{}).observed;
   const w=other&&other.absent_on_page?other.absent_on_page.map(x=>'“'+x.word+'”').join(', '):'';
   headline='Google means something else by this search term';
   if(w)explanation='Most Google results for this term are about '+w+', which is not what your page is about. Comparing your page with them would give wrong advice.';
  }
 }
 const scopeNote=gate.intent_scope&&gate.intent_scope.note;
 const limitations=[
  'Google Search Console was not used: clicks, impressions and positions of your site are unknown in this free check.',
  'Only this one page was checked, not the rest of your website.',
  'Only Google\'s normal search results were compared. AI answers (ChatGPT, Perplexity, Google AI Overviews) were not checked in this free check.',
  ...(gate.research_limitations||[]).slice(0,3).map(x=>typeof x==='string'?x:(x.detail||x.message||x.code||'')).filter(Boolean)
 ];
 if(scopeNote)limitations.push('Google shows more than one kind of page for this search. Your page was compared only with the '+gate.intent_scope.compared_with+' ('+gate.intent_scope.results_of_this_type+' of '+gate.intent_scope.of+'). '+scopeNote);
 return {decision,headline,explanation,steps,tasks,checked,limitations,gaps:buildGapList(report||{}),
  url:url||report?.url||null,
  promises:'No ranking or traffic increase is promised. Nothing was changed on your website.'};
}

module.exports={summarizeFreeGrowth,BLOCKER_TEXT,gapList};
