'use strict';
const assert=require('node:assert/strict');
const {chooseGrowthNextAction,queryFit,topicAligned}=require('./growth-one-action-decision.cjs');
const {analyzeGrowthEvidence}=require('./growth-automatic-analysis.cjs');
const now=new Date('2026-10-17T12:00:00.000Z');
const url='https://contentscale.site/';
const page={id:2320,tracker_client_id:22,url,keyword:'content at scale',case_study_active:true};
const html='<html><head><title>Content At Scale, Done Right — Free Quality Score Tracker</title><meta name="description" content="Track SEO quality and AI citations"><link rel="canonical" href="https://contentscale.site/"></head><body><h1>Beyond Content at Scale: Track Your AI Citations</h1><h2>What is content at scale?</h2><h2>How do you scale content without losing quality?</h2><h2>What can you do with a content scaling strategy?</h2><p>Created by an independent SEO consultant in Amsterdam.</p></body></html>';
const competitorUrl='https://originality.ai/blog/contentatscale-ai-content-detection-review';
const compHtml='<html><head><title>ContentAtScale AI Detector Review</title></head><body><h1>ContentAtScale Detector</h1><h2>Testing ContentAtScale Accuracy</h2><h2>Comparing ContentAtScale to Other Platforms</h2></body></html>';
const gsc=(query,impressions,clicks,position,extra={})=>({
 page_id:page.id,tracker_client_id:page.tracker_client_id,source_page_url:url,
 evidence_scope:'page_verified',query,impressions,clicks,position,
 imported_at:'2026-10-11T11:34:03.167Z',...extra
});
const rows=[
 gsc('content at scale',4667,1159,1.42),
 gsc('content scaling',3943,2,12.72),
 gsc('content at scale ai detector',1432,234,5.99),
 gsc('content scale',866,198,1.48),
 gsc('content at scale review',620,0,13.62),
 gsc('content at scale review in los angeles california near me',120,0,32.07),
 gsc('not our page',1200,0,15,{page_id:99})
];
const opts={page,savedHtml:html,live:{html,retrieved_at:now.toISOString(),final_url:url},
 snapshot:{checked_at:'2026-09-28T06:04:10.555Z',
  google_competitors:[{url:competitorUrl,title:'BrandWell ContentAtScale AI Detector Review',position:2}]},
 competitorPages:[{url:competitorUrl,live:{html:compHtml,retrieved_at:now.toISOString()}}],
 gscRows:rows,aiRows:[],sitePages:[
  {url:'https://contentscale.site/content-at-scale/',keyword:'content at scale'},
  {url:'https://contentscale.site/content-scale-vs-content-at-scale/',keyword:'content scale vs content at scale'}
 ],now};
const report=analyzeGrowthEvidence(opts);
assert.equal(report.success,true);
assert.equal(report.growth_decision.primary_next_action.query,'content scaling');
assert.equal(report.growth_decision.primary_next_action.metrics.impressions,3943);
assert.equal(report.growth_decision.primary_next_action.metrics.clicks,2);
assert.equal(report.growth_decision.primary_next_action.metrics.ctr_pct,0.05);
assert.equal(report.growth_decision.protection.case_study_locked,true);
assert.equal(report.growth_decision.protection.publication_allowed,false);
assert.equal(report.growth_decision.protection.preserve_existing_top_rankings,true);
assert(report.growth_decision.protected_queries.some(x=>x.query==='content at scale'));
// No brand- or product-specific word list: the detector query is simply not an opportunity (16% CTR at position 6).
assert(!report.growth_decision.primary_next_action.query.includes('detector'));
assert(!(report.growth_decision.other_reviewable_queries||[]).some(x=>/detector/.test(x.query)));
assert(report.growth_decision.excluded_queries.some(x=>x.query==='content at scale review'));
assert(!report.search.observed_opportunities.some(x=>/detector|near me|los angeles/i.test(x.seed_query||'')));
assert.equal(report.editorial.candidate_sections.length,0,'off-intent detector headings must not become suggested sections');
// Regression from the user-supplied 17 October JSON: useful research must not
// vanish when misleading opportunities are filtered.
assert.equal(report.practical_growth_plan.focus_query,'content scaling');
assert.equal(report.practical_growth_plan.classifications.length,6,'all page-verified rows are classified and retained');
assert.equal(report.practical_growth_plan.competitors.inspected,1);
assert.equal(report.practical_growth_plan.competitors.relevant_to_action,0);
assert.equal(report.practical_growth_plan.competitors.classification[0].category,'DIFFERENT_SEARCH_INTENT');
assert.equal(report.competitors.nonmatching_topic_observations.length,2,'unrelated headings retained for audit, not promoted as content gaps');
assert.equal(report.practical_growth_plan.change.target_section,'How do you scale content without losing quality?');
assert.equal(report.practical_growth_plan.change.copy_ready,false,'unverified content gaps must never produce copy-ready boilerplate');
assert.deepEqual(report.practical_growth_plan.change.ready_to_review_text,[]);
assert.equal(report.practical_growth_plan.change.type,'VERIFY_INTENT_BEFORE_CONTENT_CHANGE');
assert.equal(report.practical_growth_plan.guard.can_change_live,false);
assert.equal(report.practical_growth_plan.guard.case_study_locked,true);
assert(!report.growth_decision.primary_next_action.related_pages_to_check.some(x=>/brandwell/.test(x)),
 'brandwell product intent should not be a primary internal link for content scaling');
assert(report.practical_growth_plan.classifications.some(x=>x.query==='content at scale'&&x.category==='PROTECT'));
// Healthy 16% CTR at position 6: not an opportunity and not a reason to touch the page; it stays in the evidence inventory.
assert(report.practical_growth_plan.classifications.some(x=>x.query==='content at scale ai detector'&&x.category==='MONITOR_OR_QUALIFY'));
assert(report.practical_growth_plan.classifications.some(x=>x.query==='content scaling'&&x.category==='IMPROVE_EXISTING'));

assert.equal(report.competitors.topic_candidates.length,0);
assert.equal(report.competitors.excluded_unaligned_topics,2);
assert.equal(report.page_content.signals.evidence_scope,'LIVE_PUBLIC_HTML_OBSERVED');
assert.equal(report.competitors.total_leads,report.summary.competitor_leads);
assert.equal(report.editorial.cms_handoff_available,false);
assert.equal(report.previous_brief.status,'NO_PREVIOUS_BRIEF');
assert(!report.search.verified_queries.some(x=>x.query==='not our page'),'cross-page GSC is ignored');
assert.equal(queryFit('content at scale ai detector',report.page_content.headings).fit,false);
assert.equal(topicAligned('Testing ContentAtScale Accuracy',report.page_content.headings),false);
const noGsc=analyzeGrowthEvidence({...opts,gscRows:[],page:{...page,case_study_active:false}});
assert.equal(noGsc.growth_decision.primary_next_action.code,'REVIEW_PAGE_INTENT');
assert.equal(noGsc.growth_decision.protection.case_study_locked,false);
assert.equal(noGsc.growth_decision.protection.publication_allowed,false);
assert.equal(noGsc.growth_decision.protected_queries.length,0);
assert.equal(noGsc.practical_growth_plan.change.copy_ready,false,'no observed gap means no copy-ready claim');
assert.match(noGsc.practical_growth_plan.change.evidence_basis,/without exact-page GSC metrics/);
assert.equal(noGsc.practical_growth_plan.guard.can_publish,false);
const stale=chooseGrowthNextAction({page,queries:[{query:'content scaling',impressions:1000,clicks:0,position:15,imported_at:'2026-01-01'}],headings:report.page_content.headings,now});
assert.equal(stale.primary_next_action.code,'REVIEW_PAGE_INTENT');
assert.equal(stale.excluded_queries[0].reason,'MISSING_OR_STALE_QUERY_EVIDENCE');
const current=chooseGrowthNextAction({page:{...page,case_study_active:false},queries:rows,headings:report.page_content.headings,now});
assert.equal(current.primary_next_action.query,'content scaling');
assert.equal(current.protection.case_study_locked,false);
console.log('PASS: exact page + one action + top ranking preservation + off-intent exclusions + locked Case Study + no-GSC + stale-data guards');
