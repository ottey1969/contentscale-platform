'use strict';
const assert=require('node:assert/strict');
const {autonomouslyFindGrowthOpportunity}=require('./growth-autonomous-opportunity.cjs');
const base={
 url:'https://contentscale.site/',
 growth_decision:{
  primary_next_action:{query:'content scaling',metrics:{impressions:3943,clicks:2,average_position:12.72,ctr_pct:0.05,imported_at:'2026-10-11T11:34:03Z'}},
  protection:{case_study_locked:true,preserve_existing_top_rankings:true},
  protected_queries:[{query:'content at scale',clicks:1159,impressions:4667,position:1.42}]
 },
 site_architecture:{candidates:[{url:'https://contentscale.site/content-at-scale/',tracked_keyword:'content at scale'}],intent_overlap_risks:[]}
};
const result=autonomouslyFindGrowthOpportunity({report:base,discovery:{source:'SERPER_GOOGLE_ORGANIC',leads:[{source:'SERPER_GOOGLE_ORGANIC',url:'https://www.jasper.ai/blog/content-scaling',title:'Content scaling'},{source:'SERPER_GOOGLE_ORGANIC',url:'https://www.aprimo.com/resource-library/article/content-scaling',title:'Content scaling strategies'}]}});
assert.equal(result.primary_opportunity.query,'content scaling');
assert.equal(result.primary_opportunity.observed_impressions,3943);
assert.equal(result.protected_baseline[0].query,'content at scale');
assert.equal(result.safeguards.case_study_locked,true);
assert.equal(result.safeguards.publication_allowed,false);
assert.equal(result.live_search.at_least_two_leads,true);
assert.equal(result.existing_destinations[0].suitability,'UNVERIFIED');
assert.equal(result.recommendation.no_new_url_default,true);
assert.equal(result.primary_opportunity.actual_gsc_period,null);
const missing=autonomouslyFindGrowthOpportunity({report:{url:'https://example.com/',growth_decision:{primary_next_action:{}}},discovery:{}});
assert.equal(missing.status,'GROWTH_EVIDENCE_INCOMPLETE');
assert.equal(missing.safeguards.publication_allowed,false);
const checked=autonomouslyFindGrowthOpportunity({report:{...base,site_architecture:{candidates:[
 {url:'https://contentscale.site/content-at-scale-is-now-brandwell/',tracked_keyword:'content at scale is now brandwell'},
 {url:'https://contentscale.site/content-at-scale/',tracked_keyword:'content at scale'}
 ]}},discovery:{},existingPageReviews:[
 {url:'https://contentscale.site/content-at-scale-is-now-brandwell/',verified_live:true,title:'Content At Scale Is Now BrandWell'},
 {url:'https://contentscale.site/content-at-scale/',verified_live:true,title:'Content at Scale Explained',h2:['How to scale content without losing quality']}
]});
assert.equal(checked.existing_destinations[0].suitability,'SEPARATE_PRODUCT_INTENT');
assert.equal(checked.existing_destinations[1].suitability,'TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW');
assert.equal(checked.safeguards.publication_allowed,false);
assert.equal(checked.editorial_package.decision,'EXISTING_PAGE_CONTENT_REVIEW');
assert.equal(checked.editorial_package.proposed_target_url,'https://contentscale.site/content-at-scale/');
assert(checked.editorial_package.excluded_product_intent_urls.some(x=>x.includes('brandwell')));
assert.equal(checked.editorial_package.reader_steps.length,5);
assert.equal(checked.editorial_package.can_publish,false);
assert.equal(missing.editorial_package,null);
// Live 18 October regression: the informational content-at-scale guide has
// a secondary BrandWell H2, but its main topic is still informational.
const liveGuide=autonomouslyFindGrowthOpportunity({report:{...base,site_architecture:{candidates:[
 {url:'https://contentscale.site/content-at-scale-is-now-brandwell/',tracked_keyword:'content at scale is now brandwell'},
 {url:'https://contentscale.site/content-at-scale/',tracked_keyword:'content at scale'}
]}},existingPageReviews:[
 {url:'https://contentscale.site/content-at-scale-is-now-brandwell/',verified_live:true,title:'Content At Scale Is Now BrandWell: Free Alternative Inside',h1:['Content at Scale Is Now BrandWell: What Changed in 2026']},
 {url:'https://contentscale.site/content-at-scale/',verified_live:true,title:'What Is Content At Scale In 2026? The New Definition',h1:['What Is Content at Scale in 2026? (And Why the Name Changed)'],h2:['Why Did Content at Scale Rebrand to BrandWell?','How to Do Content at Scale the Right Way in 2026']}
]});
assert.equal(liveGuide.existing_destinations[0].suitability,'SEPARATE_PRODUCT_INTENT');
assert.equal(liveGuide.existing_destinations[1].suitability,'TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW');
assert.equal(liveGuide.editorial_package.proposed_target_url,'https://contentscale.site/content-at-scale/');
assert.equal(liveGuide.editorial_package.can_publish,false);
console.log('PASS: evidence-backed next opportunity protects rankings and denies unverified publication');
