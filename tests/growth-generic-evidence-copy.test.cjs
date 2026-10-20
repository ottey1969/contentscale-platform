'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateExistingBody}=require('../src/growth-existing-body-evidence.cjs');
const {prepareEvidenceGuidedCopy}=require('../src/growth-evidence-guided-copy.cjs');
function run(query,title,paragraph){
 const url='https://example.org/service-guide/';
 const evidence=evaluateExistingBody({query,html:'<h1>'+title+'</h1><p>'+paragraph+'</p>'});
 return prepareEvidenceGuidedCopy({query,protectedSource:'https://example.org/',target:{
  url,suitability:'TOPIC_RELATED_REQUIRES_FULL_INTENT_REVIEW',body_evidence:evidence
 }});
}
test('roofing evidence passes through to the report, without SEO-specific canned paragraphs',()=>{
 const source='A roof leak repair starts by checking where water is entering and inspecting damaged shingles before selecting the repair.';
 const r=run('roof leak repair','Roof Leak Repair',source);
 assert.equal(r.status,'EXISTING_QUERY_ANSWER_OBSERVED');
 assert.equal(r.one_next_action.code,'COMPARE_OBSERVED_ANSWER_WITH_SEARCH_INTENT');
 assert(r.source_passages.query_answer[0].includes('roof leak repair'));
 assert.deepEqual(r.proposed_additions,[]);
 assert.equal(r.copy_ready,false);
});
test('finance queries do not receive invented content audit, GSC, or scaling steps',()=>{
 const r=run('tax planning','Business Tax Planning','Our tax planning service reviews business income and expenses before making recommendations to clients.');
 assert.equal(r.status,'EXISTING_QUERY_ANSWER_OBSERVED');
 assert.deepEqual(r.proposed_additions,[]);
 assert(!JSON.stringify(r).includes('Start with a content inventory'));
 assert.equal(r.publish_allowed,false);
});
test('missing query passage is a research requirement, not a verified gap',()=>{
 const r=run('roof leak repair','Landscaping','Beautiful gardens can make a home more inviting to visitors and create outdoor space for relaxation.');
 assert.equal(r.status,'EXACT_QUERY_PASSAGE_NOT_ESTABLISHED');
 assert.deepEqual(r.proposed_additions,[]);
 assert.equal(r.no_proven_content_gaps,true);
});
