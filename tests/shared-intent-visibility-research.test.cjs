'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const pre=require('../public/prewrite-ai-answer-research.js');
const ai=require('../src/growth-free/ai-answers.cjs');
const q='How urgent is roof repair?';
test('all three modules preserve identical exact question and require actual source evidence',()=>{
 const a=pre.buildCustomerResearchPrompt(q);
 const b=ai.growthVerificationPrompt(q);
 for(const p of [a,b]){
  assert.match(p,/QUERY:\s+How urgent is roof repair\?/);
  assert.match(p,/Let its wording determine the intent/);
  assert.match(p,/NO VERIFIED RESOURCES/);
  assert.match(p,/RESOURCES:/);
  assert.doesNotMatch(p,/Perfect Roofing Team|perfectroofingteam\.com/);
 }
 const prewrite=fs.readFileSync('public/prewrite-research-tab.js','utf8');
 const free=fs.readFileSync('src/growth-free/routes.cjs','utf8');
 const tracker=fs.readFileSync('src/tracker-growth-automatic-routes.cjs','utf8');
 assert.match(prewrite,/buildCustomerResearchPrompt\(q\)/);
 assert.match(free,/prompt:ai\.growthVerificationPrompt\(term,aq&&aq\.text\)/);
 assert.match(tracker,/prompt:aiAnswers\.growthVerificationPrompt\(term,question\)/);
});
test('Pre-Write rejects pasted research instructions as if they were a genuine AI answer',()=>{
 const answer=pre.buildCustomerResearchPrompt(q);
 const res=pre.validateAnswer(answer,'24 hour emergency roof repair nj',q);
 assert.equal(res.valid,false);
 assert.equal(res.reason,'prompt_echo');
});
test('Pre-Write distinguishes search visibility, AI candidate URLs and target page citations',()=>{
 const r=pre.makePrewriteAiAnswerResearch({query:'roof leak repair',ai_question:{text:q},language:'English',market:'us',
 answers:[{engine:'chatgpt',answer:'Roof leaks require inspection; check the safety of the affected rooms. The reader should document any visible leak and obtain professional guidance. https://example.org/roof-water-damage/'}]});
 const p=pre.buildPrewriteResearchPrompt(r);
 assert.match(p,/Analyze intent AND visibility for BOTH Google Search and AI systems/);
 assert.match(p,/discovered link is not proof it was read or cited/);
 assert.equal(r.citation_tracking.performed,false);
});
test('Free Growth retains its shareable report flow without modifying Tracker access',()=>{
 const s=fs.readFileSync('src/growth-free/routes.cjs','utf8');
 const t=fs.readFileSync('src/tracker-growth-automatic-routes.cjs','utf8');
 assert.match(s,/registerFreeGrowth/);
 assert.match(s,/api\/growth-free|free-growth/);
 assert.match(t,/canEdit/);
});
