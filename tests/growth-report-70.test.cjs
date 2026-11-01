'use strict';
// Regression on real owner report 70 (contentscale.site/content-scaling/, "content scaling", US, research without text).
const test=require('node:test'),assert=require('node:assert/strict');
const r=require('./fixtures/growth-report-70/report.json'),g=r.editorial_decision_gate;
const {selectGrowthQuery}=require('../src/growth-query-selection.cjs');
const {buildOwnerHandoffPackage,planInternalLinks}=require('../src/growth-owner-handoff-package.cjs');
const {compareElements}=require('../src/growth-competitor-overview.cjs');
const {checkReport}=require('../src/growth-acceptance.cjs');
const PAGE={id:2295,url:'https://contentscale.site/content-scaling/',keyword:'content scaling'};
// The homepage (2320) carries the same tracked keyword: report 70 named it "dedicated tracked page for this query".
const HOME={id:2320,url:'https://contentscale.site/',keyword:'content scaling'};

test('a topical page keeps its own tracked keyword; the homepage with the same keyword is named as overlap',()=>{
 assert.equal(r.query_selection.destination.url,HOME.url,'fixture: the report as it was');
 const s=selectGrowthQuery({page:PAGE,inventory:[PAGE,HOME]});
 assert.equal(s.destination.url,PAGE.url);assert.equal(s.destination.basis,'TRACKED_KEYWORD_OF_THIS_PAGE');
 assert.deepEqual(s.destination.competing_same_site_pages,[HOME.url]);
 // From the homepage, the dedicated page still wins; a locked Case Study page still hands the term to another page.
 assert.equal(selectGrowthQuery({page:HOME,inventory:[PAGE,HOME]}).destination.url,PAGE.url);
 assert.equal(selectGrowthQuery({page:{...PAGE,case_study_active:true},inventory:[PAGE,HOME]}).destination.url,HOME.url);
});

test('no "draft verified" without a checked draft; a destination other than the target is named next to it',()=>{
 assert.equal(r.editorial_review_draft.status,'WRITING_ON_SELECTION');assert.equal(g.verified_gap,false);
 const text=buildOwnerHandoffPackage({report:r,decision:g,completion:r.editorial_review_draft,linkPlan:[]}).markdown;
 assert.doesNotMatch(text,/draft verified/);
 assert.match(text,/Content Repurposing” — planned, no text yet/);
 assert.match(text,/Page the search term points to: https:\/\/contentscale\.site\/ .*This package is for the target page https:\/\/contentscale\.site\/content-scaling\//);
});

test('link text holds every word of the term, never a fragment like “scale means”',()=>{
 const l=r.internal_link_plan[0];assert.equal(l.anchor_text,'scale means','fixture: the report as it was');
 // The homepage paragraph and its heading exactly as the report quotes them (the rest of the homepage is not in the report).
 const html='<h2>'+l.under_heading+'</h2><p>'+l.paragraph_excerpt+'</p>';
 const [p]=planInternalLinks({targetUrl:PAGE.url,focusQuery:'content scaling',pages:[{url:HOME.url,html}]});
 assert.equal(p.status,'LINK_CANDIDATE_FOR_REVIEW');assert.equal(p.anchor_text,'content at scale');
 assert.equal(p.anchor_source,'TERM_WORDS_ALREADY_IN_PARAGRAPH');
 const [q]=planInternalLinks({targetUrl:PAGE.url,focusQuery:'content scaling',pages:[{url:HOME.url,html:'<h2>Scale</h2><p>Learn how output can scale means safely over time for teams.</p>'}]});
 assert.equal(q.anchor_text,null);assert.equal(q.anchor_source,'WRITE_OWN_LINK_TEXT');
});

test('ListItem is part of BreadcrumbList, not a second element to add',()=>{
 assert.deepEqual(r.competitor_overview.structured_data_they_have_and_this_page_lacks.map(x=>x.type),['BreadcrumbList','ListItem'],'fixture: the report as it was');
 const el=t=>({elements:{structured_data:t,words:0}});
 const out=compareElements({structured_data:[],words:0},[el(['BreadcrumbList','ListItem']),el(['BreadcrumbList','ListItem']),el(['Article'])]);
 assert.deepEqual(out.structured_data_they_have_and_this_page_lacks.map(x=>x.type),['BreadcrumbList']);
});

test('acceptance: a run that waits for the owner’s choice is not proven, and says what to do',()=>{
 const c=checkReport(r,{expectMarkets:['US']}).checks.find(x=>x.id==='3_CONCRETE_PROPOSAL');
 assert.equal(c.status,'NOT_SHOWN');assert.match(c.detail,/2 of 2 planned task\(s\) have a placement; no text yet/);
});
