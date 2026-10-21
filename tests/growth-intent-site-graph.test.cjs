'use strict';
const assert=require('node:assert/strict');
const {classifyGrowthIntent,suggestInternalGrowthLinks}=require('../src/growth-intent-site-graph.cjs');
const {analyzeGrowthEvidence}=require('../src/growth-automatic-analysis.cjs');
const canonical='https://roof.example/roof-repair/';
const sitePages=[
{id:2,url:'https://roof.example/roof-repair-steps/',keyword:'roof repair steps'},
{id:3,url:'https://roof.example/roof-repair-advice/',keyword:'roof repair advice'},
{id:4,url:'https://roof.example/privacy/',keyword:'roof repair privacy'},
{id:5,url:'https://other.example/roof-repair/',keyword:'roof repair claims'},
{id:6,url:'https://roof.example/gutters/',keyword:'gutter installation'}
];
assert.equal(classifyGrowthIntent('how to repair roof').intent,'INFORMATIONAL');
assert.equal(classifyGrowthIntent('roof repair estimate').intent,'TRANSACTIONAL_OR_COST');
const graph=suggestInternalGrowthLinks({pageUrl:canonical,focusQuery:'roof repair',sitePages});
assert.equal(graph.candidates.length,2);
assert(!graph.candidates.some(x=>x.url.includes('other.example')||x.url.includes('privacy')));
assert(graph.intent_overlap_risks.length>=1);
assert(graph.intent_overlap_risks.every(x=>!x.verified_cannibalization));
const existing=suggestInternalGrowthLinks({pageUrl:canonical,focusQuery:'roof repair',
 currentHtml:'<a href="/roof-repair-steps/">Related</a>',sitePages});
assert(!existing.candidates.some(x=>x.url.includes('roof-repair-steps')));
const report=analyzeGrowthEvidence({page:{id:1,tracker_client_id:7,url:canonical,keyword:'roof repair'},
 savedHtml:'<h1>Roof repair</h1>',sitePages});
assert.equal(report.site_architecture.candidates.length,2);
assert.equal(report.editorial.site_link_candidates.length,2);
assert(report.findings.some(x=>x.code==='POSSIBLE_INTENT_OVERLAP'));
assert.equal(report.summary.forecasted_click_gain,null);
console.log('PASS automatic Growth intent and internal site graph');

const noMedia=suggestInternalGrowthLinks({pageUrl:'https://contentscale.site/ai-overview-optimization/',
 focusQuery:'ai overview optimization',sitePages:[
 {url:'https://contentscale.site/wp-content/uploads/2025/10/AI-Overview-optimization-framework-showing-GRAAF-CRAFT.jpg',keyword:'AI Overview optimization framework'},
 {url:'https://contentscale.site/ai-overview-optimization-checklist/',keyword:'ai overview optimization checklist'},
 {url:'https://contentscale.site/downloads/ai-overview-optimization.pdf',keyword:'ai overview optimization'}
 ]});
assert.deepEqual(noMedia.candidates.map(x=>x.url),['https://contentscale.site/ai-overview-optimization-checklist/']);
assert(noMedia.intent_overlap_risks.every(x=>!x.url.endsWith('.jpg')&&!x.url.endsWith('.pdf')));
