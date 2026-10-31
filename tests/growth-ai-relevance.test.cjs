'use strict';
// Saved AI observations count for a Growth research only for the same search term and when recent.
const test=require('node:test'),assert=require('node:assert/strict');
const {annotateAiVisibility,judgeAiObservation}=require('../src/growth-ai-relevance.cjs');
const real=require('./fixtures/growth-report-62/ai.json');

test('report 62 (real): observations from 11 October without a recorded search term are not used for "content scaling"',()=>{
 const a=annotateAiVisibility({status:'OBSERVATIONS_AVAILABLE',engines:real.engines},{rows:[],query:'content scaling',now:new Date(real.generated_at)});
 assert.equal(a.usable_for_this_search,0);
 assert(a.engines.every(e=>e.relevance.status==='SEARCH_TERM_NOT_RECORDED'&&!e.relevance.usable));
 assert.match(a.relevance_note,/None of the \d+ saved AI observation\(s\) can show AI visibility for "content scaling" now/);
 assert.equal(a.engines.length,real.engines.length,'nothing is hidden');
});

test('same term and recent: usable; other term or older than 14 days: labelled, not used (LABELLED SYNTHETIC rows)',()=>{
 const now=new Date('2026-10-31T12:00:00Z'),prompt=t=>'Answer this exact user query…\n\nQUERY:\n\n'+t+'\n\nANSWER: …';
 assert.equal(judgeAiObservation({row:{raw_text:prompt('Content Scaling'),verified_at:'2026-10-25T10:00:00Z'},query:'content scaling',now}).status,'USABLE_FOR_THIS_SEARCH');
 const other=judgeAiObservation({row:{raw_text:prompt('ai seo tools'),verified_at:'2026-10-30T10:00:00Z'},query:'content scaling',now});
 assert.equal(other.status,'OTHER_SEARCH_TERM');assert.match(other.text,/Collected for "ai seo tools", not for "content scaling"/);
 assert.equal(judgeAiObservation({row:{raw_text:prompt('content scaling'),verified_at:'2026-10-11T11:40:33Z'},query:'content scaling',now}).status,'OUTDATED');
 const a=annotateAiVisibility({engines:[{engine:'claude',revision_cycle:2,verified_at:'2026-10-25T10:00:00Z'}]},{rows:[{engine:'claude',revision_cycle:2,raw_text:prompt('content scaling'),verified_at:'2026-10-25T10:00:00Z'}],query:'content scaling',now});
 assert.equal(a.usable_for_this_search,1);
});
