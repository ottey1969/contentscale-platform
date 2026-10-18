'use strict';
// Evidence-led, read-only next opportunity. No writes, no click projections.
// Inputs come from the canonical Growth report and the same live SERP discovery.
const {terms}=require('./growth-intent-site-graph.cjs');
function autonomouslyFindGrowthOpportunity({report={},discovery={},existingPageReviews=[]}={}){
 const action=report.growth_decision?.primary_next_action||{};
 const query=String(action.query||'').trim();
 const metrics=action.metrics||null;
 const origin=String(report.url||'');
 const liveLeads=(discovery.leads||[]).filter(x=>x&&typeof x.url==='string'&&
   (x.source==='SERPER_GOOGLE_ORGANIC'||discovery.source==='SERPER_GOOGLE_ORGANIC'||x.source==='BING_PUBLIC_RSS'||discovery.source==='BING_PUBLIC_RSS'));
 const source=discovery.source||null;
 const currentSerp=!!query&&liveLeads.length>=2&&['SERPER_GOOGLE_ORGANIC','BING_PUBLIC_RSS'].includes(source);
 const existing=(report.site_architecture?.candidates||[]).filter(x=>x?.url&&x.url!==origin).slice(0,4);
 const overlap=(report.site_architecture?.intent_overlap_risks||[]).filter(x=>x?.url&&x.url!==origin).slice(0,5);
 const primaryTopic=terms(query);
 const reviewed=new Map((Array.isArray(existingPageReviews)?existingPageReviews:[]).map(x=>[x.url,x]));
 const relevant=existing.map(p=>{
  const live=reviewed.get(p.url);
  const headings=[live?.title,...(live?.h1||[]),...(live?.h2||[])].filter(Boolean).join(' ').toLowerCase();
  const brandwell=/\bbrandwell\b|\bis now\b|\bdetector\b|\breview\b/i.test(headings+' '+p.url);
  const topic=/\bcontent\b/i.test(headings)&&/\bscal(?:e|ing|able)\b/i.test(headings);
  const suitability=!live?.verified_live?'NOT_VERIFIED':brandwell?'SEPARATE_PRODUCT_INTENT':topic?'TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW':'TOPIC_NOT_ESTABLISHED';
  return {url:p.url,tracked_keyword:p.tracked_keyword||null,
   reason:'Inspected same-domain public HTML when available; title and headings are evidence of topic, not proof of full intent fit.',
   suitability,verified_live:!!live?.verified_live,observed_title:live?.title||null,
   observed_h1:live?.h1||[],observed_h2:live?.h2||[],existing_link_in_source:false};
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
  existing_destinations:relevant,possible_topic_overlap:overlap,
  recommendation,verification_needed:missing,
  safeguards:{case_study_locked:!!protect.case_study_locked,protect_existing_top_rankings:!!protect.preserve_existing_top_rankings,
    no_title_h1_changes:true,automatic_content_edits:false,publication_allowed:false,click_gain_forecast:null}
 };
}
module.exports={autonomouslyFindGrowthOpportunity};
