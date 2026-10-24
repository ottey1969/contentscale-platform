'use strict';
// Regression on REAL production output (review 16). Before the claim guard, this draft was released as copy_ready.
const test=require('node:test'),assert=require('node:assert/strict');
const fx=require('./fixtures/growth-review-16/production-output.json');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const {assessSectionClaims}=require('../src/growth-owner-edit-decision.cjs');
const {inferSerpIntent}=require('../src/growth-reader-task-coverage.cjs');
const opts={destinationText:fx.destination_text,query:fx.query,brandLabel:'contentscale'};
test('real SERP leads: a snippet mentioning plans or best does not turn a guide into a comparison',()=>{
 const serp=inferSerpIntent({query:fx.query,leads:fx.serp_leads});
 assert.equal(serp.status,'SERP_INTENT_OBSERVED');assert.equal(serp.intent,'INFORMATIONAL_GUIDE');assert.equal(serp.agreeing_leads,serp.organic_leads_considered);
});
test('real tools section: internal editor note is removed, soft wording is softened, nothing else is invented',()=>{
 const r=assessSectionClaims(fx.draft_sections[0],opts);
 assert.equal(r.ok,true,JSON.stringify(r.violations));
 const joined=r.paragraphs.join(' ');
 assert(!/editor verification/i.test(joined),'process note must not reach reader-facing copy');
 assert(r.safe_rewrites.some(w=>w.after===''&&/software costs/i.test(w.before)),'the removal is logged for the reviewer');
 assert(r.safe_rewrites.some(w=>/helps ensure/.test(w.after)),'third-person "ensures" is weakened and logged');
 assert.match(joined,/Ensure your stack allows human editors/,'an imperative instruction is left as written');
});
test('real KPI/ROI section is rejected: comparative performance, exact-return and maximise-ROI claims',()=>{
 const r=assessSectionClaims(fx.draft_sections[1],opts);
 assert.equal(r.ok,false);
 const by=c=>r.violations.filter(v=>v.code===c);
 assert(by('UNPROVEN_OUTCOME_CLAIM').some(v=>/higher search engagement/.test(v.sentence)),'comparative engagement claim');
 assert(by('UNPROVEN_OUTCOME_CLAIM').some(v=>/maximize content ROI/.test(v.sentence)),'maximise ROI promise');
 assert(by('ABSOLUTE_CLAIM').some(v=>/exact performance return/.test(v.sentence)),'exact-return promise');
 assert(r.violations.every(v=>v.reason.length>30),'every rejection carries a concrete reason');
});
test('legitimate site vocabulary is not mistaken for an editor note',()=>{
 const r=assessDraftClaims({text:'Connect each published asset back to the metrics you track through your editorial verification framework.',...opts});
 assert.equal(r.ok,true);assert.deepEqual(r.safe_rewrites,[]);
});
test('advice about measuring or comparing is not a performance claim',()=>{
 assert.equal(assessDraftClaims({text:'Compare engagement and conversion rates for refreshed pages against pages you left unchanged.',...opts}).ok,true);
 assert.equal(assessDraftClaims({text:'Pages with better engagement typically earn more links.',...opts}).ok,false);
});
