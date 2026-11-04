'use strict';
// Pre-Write Brief "AI Answer Research — Write for Citation Potential": one authoritative prompt for the server generator
// and the Research Prompt tab. Answers below are labelled test inputs (no real AI answers are claimed).
const test=require('node:test'),assert=require('node:assert/strict');
const server=require('../src/prewrite-ai-answer-research.cjs');
const browser=require('../public/prewrite-ai-answer-research.js');
const A=(engine,answer,extra)=>({engine,answer,...extra});
const five=[A('google_aio','TEST ANSWER google: content scaling means producing more pages without losing quality. See https://example.org/guide'),
 A('chatgpt','TEST ANSWER chatgpt: for content scaling, plan topics, templates and review.'),A('perplexity','TEST ANSWER perplexity: content scaling sources https://example.com/a and https://example.com/a'),
 A('claude','TEST ANSWER claude: quality gates matter when scaling content.'),A('copilot','TEST ANSWER copilot: use editors to scale content.')];
test('server and browser use the same module (one prompt contract)',()=>{
 assert.equal(server,browser,'src/prewrite-ai-answer-research.cjs re-exports public/prewrite-ai-answer-research.js');
});
test('all five answers: complete, with the objective, query, language and market; no citation tracking or promise',()=>{
 const r=server.makePrewriteAiAnswerResearch({query:'content scaling',language:'English',market:'nl',answers:five});
 assert.equal(r.contract,'prewrite_ai_answer_research_v3');assert.equal(r.systems_researched,5);assert.equal(r.readiness,'RESEARCH_COMPLETE_VERIFY_SOURCES');
 const p=server.buildPrewriteResearchPrompt(r);
 assert.match(p,/^AI ANSWER RESEARCH — WRITE FOR CITATION POTENTIAL\. This is NOT citation tracking\./);
 assert.match(p,/Research the five answers to the target query\. Identify factual gaps, useful explanations, unanswered questions, original source leads and opportunities for a clearer, better-supported answer\. Use this research to produce original, accurate and useful content with stronger potential for AI citation\./);
 assert.match(p,/Target query: content scaling/);assert.match(p,/Language: English · Market: nl/);assert.match(p,/AI answers researched: 5\/5 valid · captured 5 · invalid 0 · not checked 0 · origin verified 0 \(via API\), manual pastes unverified\n/);
 assert.match(p,/Write in English for readers in nl/);assert.match(p,/Publishing does not guarantee that any AI system cites the page/);
 assert.match(p,/Produce: direct_answer, missing_questions, factual_gaps, important_entities, source_verification_tasks/);
 assert.deepEqual(r.source_candidates,['https://example.org/guide','https://example.com/a']);assert.deepEqual(r.verified_sources,[]);
 assert.equal(r.citation_tracking.performed,false);
});
test('three answers: partial, the two missing systems are named and stay NOT CHECKED',()=>{
 const r=server.makePrewriteAiAnswerResearch({query:'content scaling',answers:five.slice(0,3)});
 assert.equal(r.readiness,'RESEARCH_PARTIAL_VERIFY_SOURCES');assert.deepEqual(r.missing_systems,['Claude','Microsoft Copilot']);
 const p=server.buildPrewriteResearchPrompt(r);
 assert.match(p,/AI answers researched: 3\/5 valid · captured 3 · invalid 0 · not checked 2 · .*\nNot checked: Claude, Microsoft Copilot\./);
 assert.match(p,/SYSTEM: Claude — NOT CHECKED\. Do not invent results\./);assert.match(p,/Language: not set · Market: not set/);
});
test('no answers, and no keyword: nothing invented; the missing keyword is said, not replaced by a placeholder',()=>{
 const none=server.makePrewriteAiAnswerResearch({query:'content scaling',answers:[]});
 assert.equal(none.readiness,'RESEARCH_NOT_CAPTURED');assert.equal(server.buildPrewriteResearchPrompt(none).match(/— NOT CHECKED\. Do not invent results/g).length,5);
 const noKw=server.makePrewriteAiAnswerResearch({answers:five});
 assert.equal(noKw.readiness,'TARGET_QUERY_MISSING');assert.match(server.buildPrewriteResearchPrompt(noKw),/Target query: MISSING — enter the target keyword before writing/);
});
test('long answers are cut to an excerpt and marked; unsafe URLs never become source leads',()=>{
 const long='x'.repeat(5000);
 const r=server.makePrewriteAiAnswerResearch({query:'q',answers:[A('claude',long+' https://ok.example/p javascript:alert(1) data:text/html,<script>alert(1)</script>',{sources:['javascript:alert(2)','ftp://x.example/','https://ok.example/p']})]});
 const o=r.observations.find(x=>x.engine==='claude');
 assert.equal(o.answer_excerpt.length,2800);assert.equal(o.answer_truncated,true);
 assert.deepEqual(r.source_candidates,['https://ok.example/p']);
 assert.match(server.buildPrewriteResearchPrompt(r),/x \[…\]\nCandidate source URLs \(NOT verified\): https:\/\/ok\.example\/p/);
});
test('the automatic Perplexity answer is labelled; a research object saved before v2 still renders',()=>{
 const r=server.makePrewriteAiAnswerResearch({query:'q',answers:[A('perplexity','TEST automatic perplexity answer',{source:'automatic fallback'})]});
 assert.match(server.buildPrewriteResearchPrompt(r),/SYSTEM: Perplexity \[automatic fallback · fetched via API, origin known\]/);
 const v1={...r,contract:'prewrite_ai_answer_research_v1'};
 assert.doesNotThrow(()=>server.buildPrewriteResearchPrompt(v1));assert.doesNotMatch(server.buildPrewriteResearchPrompt(v1),/Language:/);
 assert.throws(()=>server.buildPrewriteResearchPrompt({contract:'other'}),/invalid_prewrite_ai_answer_research/);
});

test('missing-only completion preserves checked observations and source leads absent from merge evidence',()=>{
 const original=server.makePrewriteAiAnswerResearch({query:'TEST example',language:'English',market:'nl',answers:[
  {engine:'perplexity',answer:'TEST example answer '+('a'.repeat(6000)),source:'automatic fallback',sources:['https://example.org/original']}
 ]});
 const old=original.observations.find(o=>o.engine==='perplexity');
 assert.equal(old.answer_truncated,true);
 const next=server.makePrewriteAiAnswerResearch({query:'TEST example',language:'English',market:'nl',answers:[
  {engine:'perplexity',answer:old.answer_excerpt,source:'automatic fallback'},
  {engine:'chatgpt',answer:'TEST new answer'}
 ]});
 const merged=server.preserveResearchEvidence(next,original,{chatgpt:{text:'TEST new answer'}});
 const saved=merged.observations.find(o=>o.engine==='perplexity');
 assert.equal(saved.answer_truncated,true,'do not erase the previous truncation flag');
 assert.deepEqual(saved.source_urls,['https://example.org/original'],'do not lose prior source leads');
 assert.equal(saved.answer_source,'automatic fallback');
 assert.equal(merged.systems_researched,2);
 assert.deepEqual(merged.source_candidates,['https://example.org/original']);
 assert.match(server.buildPrewriteResearchPrompt(merged),/https:\/\/example.org\/original/);
});
