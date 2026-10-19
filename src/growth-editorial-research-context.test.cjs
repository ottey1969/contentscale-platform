'use strict';
const assert=require('node:assert/strict');
const {normalizeGrowthResearchContext}=require('./growth-editorial-research-context.cjs');
const options={targetUrl:'https://roof.example/service/',focusQuery:'roof inspections'};
const excerpt='A detailed reader-first audit begins with an inventory of actual pages and existing customer questions. '.repeat(2);
const good={target_url:options.targetUrl,focus_query:'roof inspections',
 observations:[
  {competitor_url:'https://competitor.example/article/',competitor_heading:'A full content audit',competitor_excerpt:excerpt},
  {competitor_url:'https://competitor.example/article/',competitor_heading:'A full content audit',competitor_excerpt:excerpt},
  {competitor_url:'http://competitor.example/insecure',competitor_heading:'Insecure source',competitor_excerpt:excerpt},
  {competitor_url:'https://roof.example/same-site/',competitor_heading:'First-party source',competitor_excerpt:excerpt},
  {competitor_url:'https://second.example/article/',competitor_heading:'<script>Inject</script> Workflow',competitor_excerpt:excerpt}
 ]};
const result=normalizeGrowthResearchContext(good,options);
assert.equal(result.observations.length,2);
assert.equal(result.status,'ALIGNED_UNTRUSTED_RESEARCH_CONTEXT');
assert.equal(result.observations[0].evidence_scope,'UNTRUSTED_PUBLIC_HTML_OBSERVATION_NOT_A_PROVEN_GAP');
assert.doesNotMatch(result.observations[1].competitor_heading,/<script>/);
assert.equal(normalizeGrowthResearchContext({...good,target_url:'https://roof.example/other/'},options).observations.length,0);
assert.equal(normalizeGrowthResearchContext({...good,focus_query:'different'},options).observations.length,0);
assert.equal(normalizeGrowthResearchContext(null,options).observations.length,0);
assert.equal(normalizeGrowthResearchContext({...good,observations:[{...good.observations[0],competitor_excerpt:'short'}]},options).observations.length,0);
console.log('PASS bounded live research context: same target/query, untrusted facts, URL restrictions, duplicates and markup');
