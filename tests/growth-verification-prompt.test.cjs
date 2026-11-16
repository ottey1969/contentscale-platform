'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const ai=require('../src/growth-free/ai-answers.cjs');
const query='How urgent is roof repair?';
const page='https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/';
test('Growth verifies the exact customer question without contaminating organic recommendations',()=>{
 const p=ai.growthVerificationPrompt('24 hour emergency roof repair nj',query);
 assert.match(p,/QUERY:\s+How urgent is roof repair\?/);
 assert.doesNotMatch(p,/Perfect Roofing Team|perfectroofingteam\.com/);
 assert.match(p,/Let its wording determine the intent/);
 assert.match(p,/verify that each URL listed in RESOURCES/);
 assert.match(p,/do not assume a purchase or local service request/);
 assert.match(p,/NO VERIFIED RESOURCES/);
 assert.match(p,/do not.*recommend any company merely because/i);
 assert.match(p,/MENTIONED or RECOMMENDED/);
 assert.match(p,/ANSWER:/);assert.match(p,/RESOURCES:/);
});
test('legacy Quick Scan direct prompt stays stable for parity',()=>{
 const p=ai.directPrompt('24 hour emergency roof repair nj',query);
 assert.match(p,/QUERY:\s+How urgent is roof repair\?/);
 assert.doesNotMatch(p,/Let its wording determine the intent/);
});
test('updated Growth prompt pasted back is rejected as a prompt echo',()=>{
 const p=ai.growthVerificationPrompt(query);
 const parsed=ai.parseAiAnswer(p,{pageUrl:page,query});
 assert.equal(parsed.validation_status,'invalid');
 assert.equal(parsed.error_reason,'prompt_echo');
});
test('a normal AI answer with real cited page preserves citation separation',()=>{
 const a='ANSWER:\nRoof leaks with active water entry need prompt assessment; keep people away from unsafe areas and consult a qualified roofer.\nRESOURCES:\nhttps://www.ready.gov/floods';
 const r=ai.parseAiAnswer(a,{pageUrl:page,query});
 assert.equal(r.sources_verifiable,true);
 assert.deepEqual(r.sources,['https://www.ready.gov/floods']);
 assert.equal(r.own_site_cited,false);
});
test('Tracker Growth exposes verification prompt without changing existing Quick Scan prompts',()=>{
 const s=fs.readFileSync('src/tracker-growth-automatic-routes.cjs','utf8');
 assert.match(s,/prompt:aiAnswers\.growthVerificationPrompt\(term,question\)/);
});
