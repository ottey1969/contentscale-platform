'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareFullSections}=require('../src/growth-full-section-comparison.cjs');
test('actual audit paragraphs are recognized as related despite audits/audit heading grammar',()=>{
 const ownHtml='<html><h2>Step 1 — Audit before you add</h2><p>Begin your content audit using existing pages from your site. Check Google Search Console for pages with impressions but few clicks. Review the original content before changing any working URL. Record what readers are looking for and which pages already answer those questions. This page explains the audit first.</p></html>';
 const competitorHtml='<html><h2>Audits Are Critical to Content Scaling</h2><p>The first step in a content scaling strategy is completing a thorough content audit. Inventory the existing content and identify where editorial changes may help. Compare topics and question coverage across useful pages. Before drafting a new article, review what already exists and evaluate the relevance to the target audience.</p></html>';
 const result=compareFullSections({query:'content scaling',ownUrl:'https://contentscale.site/content-at-scale/',ownHtml,competitors:[{url:'https://textbroker.com/create-scalable-content',live:{html:competitorHtml},search_source:'SERPER_GOOGLE_ORGANIC'}]});
 assert.equal(result.own_sections_observed,1);
 assert.equal(result.comparisons[0].match_status,'POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED');
 assert.equal(result.comparisons[0].nearest_existing_section.heading,'Step 1 — Audit before you add');
 assert.equal(result.verified_gap,false);
 assert.equal(result.copy_ready,false);
});
test('a relevant topic match never manufactures verified content gaps',()=>{
 const ownHtml='<h2>Roof leak inspection</h2><p>A local roof leak inspection evaluates damaged roof shingles, identifies where water enters, and reviews potential repair options. Check the source of the leak and the observed condition before making any promises of repair costs or scheduling. The homeowner needs a clear assessment rather than an unrelated upsell.</p>';
 const competitorHtml='<h2>Roof leak repair methods</h2><p>Roof leak repair depends on inspecting the affected roof and checking the damaged material. A qualified roofer identifies the leak and proposes a practical repair scope after examining the shingles. The contractor can then discuss safe next steps while avoiding unsupported prices and guaranteed outcomes.</p>';
 const result=compareFullSections({query:'roof leak repair',ownUrl:'https://roof.example/leaks/',ownHtml,competitors:[{url:'https://other-roofer.example/leaks/',live:{html:competitorHtml}}]});
 assert.equal(result.comparisons.length,1);
 assert.equal(result.comparisons[0].match_status,'POSSIBLE_TOPICAL_MATCH_REVIEW_REQUIRED');
 assert.equal(result.verified_gap,false);
});
