'use strict';
const assert=require('node:assert/strict');
const {proposeHandoffFromResearch}=require('./growth-research-handoff-suggestions.cjs');
const origin='https://contentscale.site/';
const report={
 success:true,url:origin,
 page_content:{headings:{title:'Content At Scale',h1:['Content At Scale'],h2:[]}},
 search:{focus_query:'content at scale',verified_queries:[{query:'content at scale',clicks:1159},{query:'content scaling',clicks:2}]},
 growth_decision:{primary_next_action:{query:'content scaling',related_pages_to_check:['https://contentscale.site/content-at-scale/']}},
 site_architecture:{candidates:[
 {url:'https://contentscale.site/content-at-scale-is-now-brandwell/',tracked_keyword:'content at scale is now brandwell',status:'CONTEXTUAL_INTERNAL_LINK_CANDIDATE'},
 {url:'https://contentscale.site/content-at-scale/',tracked_keyword:'content at scale',status:'CONTEXTUAL_INTERNAL_LINK_CANDIDATE'}
 ]},
 editorial:{candidate_sections:[]},findings:[]
};
const a=proposeHandoffFromResearch(report,origin);
assert.equal(a.query,'content scaling');
assert.equal(a.internal_url,'https://contentscale.site/content-at-scale/');
assert.equal(a.publication_allowed,false);
const b=proposeHandoffFromResearch({...report,growth_decision:{primary_next_action:{query:'content scaling',related_pages_to_check:[]}}},origin);
assert.equal(b.internal_url,null,'Never insert a random, unreviewed candidate');
assert.equal(proposeHandoffFromResearch(report,'https://other.example/').safe,false);
console.log('PASS Growth handoff selects clicked opportunity, not first GSC query or unrelated link');
