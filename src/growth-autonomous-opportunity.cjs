'use strict';
// Evidence-led, read-only next opportunity. No writes, no click projections.
// Inputs come from the canonical Growth report and the same live SERP discovery.
const {terms}=require('./growth-intent-site-graph.cjs');
const {prepareEvidenceGuidedCopy}=require('./growth-evidence-guided-copy.cjs');
function autonomouslyFindGrowthOpportunity({report={},discovery={},existingPageReviews=[]}={}){
 const action=report.growth_decision?.primary_next_action||{};
 const query=String(action.query||'').trim();
 const metrics=action.metrics||null;
 const origin=String(report.url||'');
 const liveLeads=(discovery.leads||[]).filter(x=>x&&typeof x.url==='string'&&
   (x.source==='SERPAPI_GOOGLE_ORGANIC'||x.source==='SERPER_GOOGLE_ORGANIC'||discovery.source==='SERPAPI_GOOGLE_ORGANIC'||discovery.source==='SERPER_GOOGLE_ORGANIC'||x.source==='BING_PUBLIC_RSS'||discovery.source==='BING_PUBLIC_RSS'));
 const source=discovery.source||null;
 const currentSerp=!!query&&liveLeads.length>=2&&['SERPAPI_GOOGLE_ORGANIC','SERPER_GOOGLE_ORGANIC','BING_PUBLIC_RSS'].includes(source);
 const existing=(report.site_architecture?.candidates||[]).filter(x=>x?.url&&x.url!==origin).slice(0,4);
 const overlap=(report.site_architecture?.intent_overlap_risks||[]).filter(x=>x?.url&&x.url!==origin).slice(0,5);
 const primaryTopic=terms(query);
 const reviewed=new Map((Array.isArray(existingPageReviews)?existingPageReviews:[]).map(x=>[x.url,x]));
 const relevant=existing.map(p=>{
  const live=reviewed.get(p.url);
  // Primary intent comes from the URL, title and H1. A reference to a
  // product in an H2 is not enough to reclassify an informational guide.
  const main=[live?.title,...(live?.h1||[])].filter(Boolean).join(' ').toLowerCase();
  const headings=[main,...(live?.h2||[])].join(' ').toLowerCase();
  const path=(()=>{try{return new URL(p.url).pathname.toLowerCase()}catch{return ''}})();
  const productPrimary=/\b(?:brandwell|ai detector|product review)\b/i.test(main)||
   /(?:brandwell|ai-detector|product-review)/i.test(path);
  const topic=/\bcontent\b/i.test(headings)&&/\bscal(?:e|ing|able)\b/i.test(headings);
  const suitability=!live?.verified_live?'NOT_VERIFIED':productPrimary?'SEPARATE_PRODUCT_INTENT':topic?'TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW':'TOPIC_NOT_ESTABLISHED';
  return {url:p.url,tracked_keyword:p.tracked_keyword||null,
   reason:'Primary page intent assessed from URL, title and H1; subsidiary H2 mentions do not reclassify the entire guide. Full body intent still needs checking.',
   suitability,verified_live:!!live?.verified_live,observed_title:live?.title||null,
   observed_h1:live?.h1||[],observed_h2:live?.h2||[],
   body_evidence:live?.body_evidence||null,existing_link_in_source:false};
 });
 const protect=report.growth_decision?.protection||{};
 const topQueries=(report.growth_decision?.protected_queries||[]).slice(0,5).map(x=>({query:x.query,clicks:x.clicks,impressions:x.impressions,average_position:x.position}));
 const likelyInfo=/\b(how|what|why|guide|strategy|steps|scaling|scale|content)\b/i.test(query);
 const missing=[];
 if(!metrics)missing.push('EXACT_PAGE_QUERY_METRICS');
 if(!currentSerp)missing.push('TWO_CURRENT_SEARCH_RESULTS_FOR_INTENT');
 if(!relevant.some(x=>x.suitability==='TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW'))missing.push('EXISTING_RELEVANT_SITE_DESTINATION_NOT_ESTABLISHED');
 missing.push('FULL_PAGE_INTENT_DIFFERENTIATION_NOT_VERIFIED','DATED_GSC_MEASUREMENT_WINDOW_NOT_ESTABLISHED');
 const selected=metrics?{
  query,observed_impressions:metrics.impressions,observed_clicks:metrics.clicks,
  observed_average_position:metrics.average_position,observed_ctr_pct:metrics.ctr_pct,
  imported_at:metrics.imported_at||null,actual_gsc_period:null,
  analysis:metrics.average_position>10?'Average ranking beyond the first page is a possible stronger limitation than snippet CTR; verify results by country and device.':'Investigate intent and result appearance as well as page ranking.'
 }:null;
 const fitting=relevant.filter(x=>x.suitability==='TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW');
 const alternate=relevant.filter(x=>x.suitability==='SEPARATE_PRODUCT_INTENT');
 const nextEditorialTarget=fitting[0]||null;
 const evidence_guided_copy=prepareEvidenceGuidedCopy({target:nextEditorialTarget,query,protectedSource:origin});
 const editorialPackage=selected?{
  decision:nextEditorialTarget?'EXISTING_PAGE_CONTENT_REVIEW':'DISTINCT_SPOKE_RESEARCH_REQUIRED',
  proposed_target_url:nextEditorialTarget?.url||null,
  focus_query:query,
  visitor_outcome:'Explain the query directly and give a practical sequence that ends in a useful deliverable, not merely another tool recommendation.',
  // Produce a source-grounded work queue, not the same invented five-step
  // 'content scaling' template for roofing, legal, finance and every query.
  // A missing topic stays unverified; do not claim it is a content gap.
  reader_steps:nextEditorialTarget?.body_evidence?.evidence_passages?
   Object.entries(nextEditorialTarget.body_evidence.evidence_passages)
    .filter(([,passages])=>Array.isArray(passages)&&passages.length)
    .slice(0,5).map(([topic,passages])=>({
     heading:topic.replace(/_/g,' '),
     action:'Review the existing page answer before proposing an update',
     observed_passage:passages[0],
     source_url:nextEditorialTarget.url,
     evidence_status:'EXISTING_PASSAGE_OBSERVED_NO_GAP_PROVEN',
     output:'Retain existing answer or identify a distinct unanswered reader task'
    })) : [],
  reader_steps_status:nextEditorialTarget?.body_evidence?.evidence_passages?
   'SOURCE_DERIVED_REVIEW_QUEUE':'NO_OBSERVED_SOURCE_PASSAGES',
  internal_link_recommendation:nextEditorialTarget?{
   source_page:origin,destination:nextEditorialTarget.url,
   suggested_anchor:query,
   insertion_policy:'Only in a naturally relevant explanatory paragraph after verifying there is no existing duplicate link; never alter the protected H1/title.'
  }:null,
  excluded_product_intent_urls:alternate.map(x=>x.url),
  verification_gate:'Body evidence is screened, but reader needs, overlap, missing information and live SERP advantage still require substantive review. Prepared outline is not a publish-ready article.',
  can_publish:false
 }:null;
 const recommendation=selected?{
  action:'RESEARCH_EXISTING_DESTINATION_THEN_PREPARE_SPOKE_IF_NEEDED',
  target_query:query,
  protected_page:origin,
  editorial_next:'Read the leading live search results and each related ContentScale URL in full. Choose the existing page that directly answers the distinct visitor question; if none does, prepare a separate practical spoke for editorial review.',
  practical_reader_deliverable:likelyInfo?'A complete, independent step-by-step guide with clear inputs, worked example, decision checkpoints and measurable outcome':'An answer that directly satisfies the verified live search intent with evidence, examples and actionable next steps',
  internal_link_handoff:'Prepare the exact source paragraph, natural anchor text and approved destination. Do not insert a duplicate link or change a protected title/H1.',
  measurement:'Record the target query, target URL and source date range; compare equivalent GSC periods after any separately approved publication.',
  no_new_url_default:true,publication_allowed:false,
  distinct_spoke_approval_required:true
 }:null;
 return {
  status:selected?'GROWTH_OPPORTUNITY_FOUND_NEEDS_EDITORIAL_VALIDATION':'GROWTH_EVIDENCE_INCOMPLETE',
  evidence_level:selected?'EXACT_PAGE_GSC_METRICS_WITH_SERP_VERIFICATION_PENDING':'INSUFFICIENT_EXACT_PAGE_GSC',
  primary_opportunity:selected,protected_baseline:topQueries,
  live_search:{source,query,observed_leads:liveLeads.slice(0,5).map(x=>({url:x.url,title:x.title||x.serp_title||null})),at_least_two_leads:currentSerp,
   caution:'Search listings do not prove full-page relevance or a current stable rank.'},
  existing_destinations:relevant,possible_topic_overlap:overlap,editorial_package:editorialPackage,evidence_guided_copy,
  recommendation,verification_needed:missing,
  safeguards:{case_study_locked:!!protect.case_study_locked,protect_existing_top_rankings:!!protect.preserve_existing_top_rankings,
    no_title_h1_changes:true,automatic_content_edits:false,publication_allowed:false,click_gain_forecast:null}
 };
}
module.exports={autonomouslyFindGrowthOpportunity};
