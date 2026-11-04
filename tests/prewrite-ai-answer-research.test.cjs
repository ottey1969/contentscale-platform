'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {makePrewriteAiAnswerResearch,buildPrewriteResearchPrompt,normalizeAnswer}=require('../src/prewrite-ai-answer-research.cjs');

test('all five systems are research inputs, not website citation checks',()=>{
 const r=makePrewriteAiAnswerResearch({query:'seo content optimization services',answers:[
 {engine:'google_aio',answer:'An illustrative SEO answer about intent and page updates.',sources:['https://example.org/source']},
 {engine:'chatgpt_search',answer:'An alternate answer about useful SEO content.'},
 {engine:'perplexity',answer:'A response explaining content optimization sources and intent.'},
 {engine:'claude',answer:'A response describing SEO content accuracy.'},
 {engine:'microsoft_copilot',answer:'A response about content optimization structure.'}
 ]});
 assert.equal(r.systems_researched,5);
 assert.equal(r.research_complete,true);
 assert.equal(r.mode,'pre_publication_answer_research');
 assert.equal(r.citation_tracking.performed,false);
 assert.equal(r.verified_sources.length,0);
 assert.deepEqual(r.source_candidates,['https://example.org/source']);
 assert.ok(r.required_brief_outputs.includes('direct_answer'));
 assert.ok(!buildPrewriteResearchPrompt(r).includes('is cited by'));
});
test('missing AI answers do not become fake citations or synthesized evidence',()=>{
 const r=makePrewriteAiAnswerResearch({query:'prewrite brief',answers:[{engine:'perplexity',answer:'A prewrite brief text without citations.'}]});
 assert.equal(r.systems_researched,1);
 assert.equal(r.research_complete,false);
 assert.equal(r.observations.filter(x=>!x.checked).length,4);
 assert.equal(r.verified_sources.length,0);
 assert.equal(r.source_candidates.length,0);
 assert.match(buildPrewriteResearchPrompt(r),/NOT CHECKED/);
});
test('unsafe or invalid URLs are excluded; aliases normalized and duplicate results deduplicated',()=>{
 const r=makePrewriteAiAnswerResearch({answers:[{engine:'gemini',answer:'First answer text'},
 {engine:'google',answer:'Second answer text',sources:['javascript:alert(1)','https://example.com/','https://example.com/']}]});
 assert.equal(r.systems_researched,1);
 assert.equal(r.observations[0].answer_excerpt,'Second answer text');
 assert.deepEqual(r.source_candidates,['https://example.com/']);
 assert.equal(normalizeAnswer({engine:'unknown',answer:'x'}),null);
});
