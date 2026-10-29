'use strict';
// Production report 53 (page 2294, "ai citation tracker"): the chain worked (copy_ready, proposal stored, CMS link),
// but the accepted draft gave unproven reasons for how AI systems cite content, and one section was placed inside the
// page's opening section instead of the existing section on citations vs. backlinks. Real data only (fixture note).
const test=require('node:test'),assert=require('node:assert/strict');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const {normalizeDraft}=require('../src/growth-source-grounded-editor.cjs');
const {pickPlacement}=require('../src/growth-reader-task-coverage.cjs');
const r53=require('./fixtures/growth-report-53/review.json');
const r50=require('./fixtures/growth-report-50/placement.json');
const owner=require('./fixtures/growth-report-51/owner-revision.json');
const MECH=[
 'Next, audit your priority landing pages for missing entity definitions, unstructured comparison tables, or outdated citations that prevent retrieval algorithms from verifying your claims.',
 'By addressing these entity gaps early, teams can update page structure and schema markup to align with real-time retrieval requirements.',
 'Finally, verify that core assertions are supported by structured entity markup so generative engines can easily reference your content alongside existing backlink signals.'];

test('report 53 reached the CMS handoff (the chain itself works in production)',()=>{
 assert.equal(r53.copy_ready,true);
 assert.deepEqual(r53.cms_handoff,{proposal_id:2,target_page_id:2294});
});

test('claim check: the three unproven AI-mechanism reasons are rejected, the rest of the draft is not',()=>{
 const text=r53.draft.map(d=>d.text).join('\n\n');
 const v=assessDraftClaims({text,query:r53.focus_query}).violations;
 assert.deepEqual(v.map(x=>x.code),MECH.map(()=>'UNPROVEN_AI_MECHANISM_CLAIM'));
 assert.deepEqual(v.map(x=>x.sentence),MECH.map(s=>s.slice(0,220)));
 assert.equal(assessDraftClaims({text:owner.html.replace(/<[^>]+>/g,' ')}).ok,true,'the owner\'s own revision still passes');
 assert.equal(assessDraftClaims({text:'Check which sources the AI answer uses for each query and record the cited URLs.'}).ok,true,'observing citations is fine');
});

test('generator: the same draft is sent back for one rewrite, naming the failing sentences',()=>{
 const draft={sections:r53.draft.map(d=>({task_code:d.task,h2:d.h2,paragraphs:d.text.split('\n\n')}))};
 const out=normalizeDraft(JSON.stringify(draft),'',r53.focus_query,{requireTitle:false,taskTerms:['matter','backlink']});
 assert.equal(out.status,'AI_DRAFT_UNPROVEN_AI_MECHANISM');
 assert.equal(out.rejected_sections.length,3);
 assert(out.rejected_sections.every(x=>/^UNPROVEN_AI_MECHANISM: "/.test(x.reason)));
 const clean={sections:[{task_code:'task_matter',h2:'How to Check AI Citations Manually',paragraphs:[owner.html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()]}]};
 assert.equal(normalizeDraft(JSON.stringify(clean),'',r53.focus_query,{requireTitle:false,taskTerms:['citation']}).status,'AI_DRAFT_REVIEW_REQUIRED');
});

test('placement: the backlink comparison goes into the existing citations-vs-backlinks section, never the opening section',()=>{
 // The level comes from the page's real H1 in the report; every other heading is treated as a body heading.
 const sections=r53.destination_sections.map(s=>({heading:s.heading,text:'',words:s.words,level:r53.h1.includes(s.heading)?1:2}));
 assert.equal(sections[0].level,1);
 assert.equal(r53.draft[1].placement.section_heading,sections[0].heading,'report 53 extended the opening section under the H1');
 const p=pickPlacement(sections,r53.backlink_task,new Set());
 assert.deepEqual([p.mode,p.section_heading],['EXTEND_SECTION','Why Citations Replace Backlinks in AI Search']);
});

test('placement: the report 51 fix still holds for the manual-search task',()=>{
 const sections=r50.destination_sections.map(s=>({heading:s.heading,text:'',words:s.words}));
 assert.equal(pickPlacement(sections,r50.task,new Set()).section_heading,'⚙️ How AI Citation Trackers Actually Work');
});
