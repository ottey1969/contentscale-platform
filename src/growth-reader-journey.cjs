'use strict';
// Every informational Growth opportunity must provide an independently usable
// reader outcome as well as an optional path through ContentScale. Read-only.
const {queryFit}=require('./growth-one-action-decision.cjs');
function readerJourney({report={},plan={}}={}){
 const query=String(plan.focus_query||report?.growth_decision?.primary_next_action?.query||report?.search?.focus_query||'').trim();
 const url=String(report.url||plan.page_url||'');
 const protectedPage=report?.growth_decision?.protection?.preserve_existing_top_rankings===true;
 const locked=report?.growth_decision?.protection?.case_study_locked===true||report?.case_study_locked===true;
 const sameSite=(report.site_architecture?.candidates||[]).filter(p=>p&&typeof p.url==='string'&&p.url!==url)
  .map(p=>({url:p.url,source:p.evidence||'SITE_INVENTORY',verified_live:false})).slice(0,8);
 const staged=[
  {stage:'SEARCH_ANSWER',visitor_goal:'Understand the exact question and receive a directly usable explanation',deliverable:'Clear answer, definitions, scope, examples and constraints before any product CTA',optional_next:'CEO'},
  {stage:'CEO',visitor_goal:'Identify an initial opportunity on a real website',deliverable:'A first observed website assessment and evidence-labelled priorities',optional_next:'QUICKSCAN'},
  {stage:'QUICKSCAN',visitor_goal:'Investigate a distinct meaningful page rather than repeat the CEO scan',deliverable:'New page-specific findings and an immediate practical action',optional_next:'AUDIT_20'},
  {stage:'AUDIT_20',visitor_goal:'Understand cross-page problems and prioritise work',deliverable:'Up to 20-page evidence-based diagnosis, overlap checks and a ranked action plan',optional_next:'TRACKER'},
  {stage:'TRACKER',visitor_goal:'Implement an improvement and verify a baseline',deliverable:'Exact actions, evidence and comparable measurement periods',optional_next:'GROWTH'},
  {stage:'GROWTH',visitor_goal:'Identify additional qualified impressions and clicks after known issues are addressed',deliverable:'Distinct-intent opportunity, existing-page/spoke choice, factual copy and internal-link proposal',optional_next:'CASE_STUDY'},
  {stage:'CASE_STUDY',visitor_goal:'See whether real performance changed',deliverable:'Verified before/after evidence with dates, never invented click uplift',optional_next:null}
 ];
 const content_scaling=/\b(content scaling|scale content|content at scale)\b/i.test(query);
 const practical_steps=content_scaling?[
  {title:'Inventory the existing content',instruction:'List indexable, useful URLs and their intended search questions. Identify duplicate topics before planning new articles.',reader_deliverable:'URL + intended query + page type inventory'},
  {title:'Read real search demand',instruction:'Use dated Google Search Console page/query rows. Separate impressions, clicks, CTR and average position; a high impression count is not proof of lost clicks.',reader_deliverable:'Evidence table of URLs and queries with measurement dates'},
  {title:'Protect successful pages',instruction:'Mark pages with strong, relevant clicks as protected. Do not rewrite their title or H1 merely to insert a new keyword.',reader_deliverable:'Protected-URL list with reasons'},
  {title:'Compare distinct intent',instruction:'Review live search results and competing answers for the selected query, then read your existing page in full. Do not equate different H2s with a verified gap.',reader_deliverable:'Unanswered reader question and cited evidence, or no-change finding'},
  {title:'Select one editorial action',instruction:'Improve a suitable existing page first. Prepare a separate spoke only if it serves a different, verified reader goal and will not cannibalize the current page.',reader_deliverable:'Specific existing URL or proposed distinct-intent spoke, with link candidates'},
  {title:'Implement and verify',instruction:'Keep an editorial change record, then compare matching date ranges and the same URL/query in Search Console. Report changes in clicks and impressions without forecasting guaranteed uplift.',reader_deliverable:'Dated before/after measurement sheet'}
 ]:[
  {title:'Answer the user question',instruction:'State the answer directly, define the scope and limitations, and give a truthful example.',reader_deliverable:'A self-contained answer'},
  {title:'Demonstrate an actionable method',instruction:'Give ordered steps with inputs, decisions, examples and usable outputs rather than another list of SEO slogans.',reader_deliverable:'An independently usable walkthrough'},
  {title:'Identify supporting evidence',instruction:'Distinguish observed HTML, verified dated GSC queries, historical competitor leads and manually checked AI visibility.',reader_deliverable:'Evidence-and-limitations table'},
  {title:'Choose what to improve',instruction:'Check the existing site inventory and live search intent before creating a new page.',reader_deliverable:'A defensible improvement or distinct-intent spoke proposal'},
  {title:'Measure the result',instruction:'Use comparable page/query date ranges; do not confuse import dates with a GSC measurement window.',reader_deliverable:'Verification checklist'}
 ];
 const existingHasCandidate=sameSite.length>0;
 const next=report.growth_decision?.primary_next_action||{};
 // A protected page still requires a research action. A new URL is a
 // conditional candidate only, never an automatic directive to publish.
 const action=protectedPage?'PROTECT_PAGE_EXPAND_SITE':'ASSESS_EXISTING_THEN_EXPAND';
 return {
  status:'RESEARCH_AND_EDITORIAL_PREPARATION_ONLY',
  query,tracked_page:url,
  outcome_contract:'Answer the reader query directly and leave the reader with a practical result they can use without creating an account.',
  stages:staged,
  practical_reader_deliverable:{type:content_scaling?'CONTENT_SCALING_WALKTHROUGH':'SEARCH_INTENT_WALKTHROUGH',steps:practical_steps,independent_use:true,commercial_cta_optional:true},
  growth_route:{
   code:action,
   first:'Check whether an existing same-site page already satisfies the distinct search intent.',
   existing_pages_to_check:sameSite,
   alternative:existingHasCandidate?'IMPROVE_EXISTING_OR_JUSTIFIED_SPOKE':'RESEARCH_JUSTIFIED_SPOKE',
   mandatory_follow_through:'If the tracked page is protected, continue growth research on an existing page or a genuinely distinct spoke; do not conclude that no page changes means no Growth action.',
   spoke_policy:'A new spoke needs verified distinct live search intent, full-site duplication review, a helpful step-by-step answer, measured target queries and a contextual internal-link proposal; no new page by default.',
   internal_link_policy:'Suggest relevant source paragraphs and target URLs; verify both pages are live and relevant before writing links.',
   needs_evidence:!next.query,
   no_fabricated_forecast:true
  },
  safeguards:{case_study_locked:locked,homepage_title_h1_rewrite_allowed:false,
   automatic_publication_allowed:false,existing_rankings_protected:protectedPage,
   note:'Case Study locks prevent publication and baseline changes, never research or preparation.'},
  quality_gates:{
   reader_gets_practical_answer:true,
   search_intent_verified:false,
   same_site_cannibalization_verified:false,
   competitor_advantage_proven:false,
   gsc_comparable_periods_verified:false,
   editorial_approval_required:true
  }
 };
}
module.exports={readerJourney};
