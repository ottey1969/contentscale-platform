'use strict';
// Production report 52 (page 2294, "ai citation tracker"), after the report 51 fixes. Real data only:
// the placement is now the owner's choice, but the AI draft was rejected because an instruction to the reader
// ("Finally, compare these findings against your existing search analytics …") was read as a claim about a tool.
const test=require('node:test'),assert=require('node:assert/strict');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const r52=require('./fixtures/growth-report-52/rejection.json');
const codes=t=>assessDraftClaims({text:t}).violations.map(v=>v.code);

test('report 52: placement is a new section after "How AI Citation Trackers Actually Work"',()=>{
 assert.equal(r52.placement.mode,'ADD_AFTER_SECTION');
 assert.equal(r52.placement.section_heading,'⚙️ How AI Citation Trackers Actually Work');
});

test('report 52: an instruction after "Finally," is advice to the reader, not a tool capability claim',()=>{
 const rejected=r52.draft_rejections[0].claim_violations.map(v=>v.sentence);
 assert.deepEqual(rejected,['Finally, compare these findings against your existing search analytics to highlight visibility gaps.']);
 for(const s of rejected)assert.deepEqual(codes(s),[],s);
});

test('a real capability claim is still caught, with or without a leading sequence word',()=>{
 assert(codes('Finally, the tracker identifies every citation.').includes('UNSUPPORTED_CAPABILITY_CLAIM'));
 assert(codes('Our analytics platform highlights visibility gaps.').includes('UNSUPPORTED_CAPABILITY_CLAIM'));
 assert(codes('Then our dashboard reveals which pages AI engines cite.').includes('UNSUPPORTED_CAPABILITY_CLAIM'),'first person after "Then" stays a claim');
});

test('a claim inside a leading clause is never skipped as an instruction',()=>{
 assert(codes('When automated tracking confirms that specific passage structures win citations, apply those patterns.').includes('UNSUPPORTED_CAPABILITY_CLAIM'));
});
