'use strict';
// One outcome. Real data: report 64 (contentscale.site → /content-scaling/): the task check closed with NO_CHANGE while
// the choice list recommended four topics found on two ranking pages.
const test=require('node:test'),assert=require('node:assert/strict');
const {reconcileOutcome}=require('../src/growth-outcome.cjs');
const {linkOf}=require('../src/growth-next-pages.cjs');
const {summarizeFreeGrowth}=require('../src/growth-free/summary.cjs');
const f=require('./fixtures/growth-report-64/outcome.json');

test('report 64 (real): "no change" and four recommended topics become one outcome that names both',()=>{
 const o=reconcileOutcome({decision:f.editorial_decision_gate,gapList:f.gap_list});
 assert.equal(o.status,'NO_REQUIRED_CHANGE_TOPICS_TO_CONSIDER');assert.equal(o.count,4);
 assert.equal(o.headline,'No change required — 4 topics from the ranking pages to consider');
 assert.deepEqual(o.topics.map(t=>t.title),['Definition of content scaling','Outsourcing and collaborative content creation','Importance and benefits of scaling content','Using AI and automation tools for content scaling']);
 assert.match(o.note,/it checked 1 task\)/);assert.match(o.note,/Growth writes no proposal by itself/);
 assert(!o.topics.some(t=>t.sources<2),'single-page topics are not named here');
 // Without recommended topics, or with an insufficient-evidence list, NO_CHANGE stays as it is.
 assert.equal(reconcileOutcome({decision:f.editorial_decision_gate,gapList:{...f.gap_list,items:f.gap_list.items.map(x=>({...x,recommended:false}))}}),null);
 assert.equal(reconcileOutcome({decision:f.editorial_decision_gate,gapList:{...f.gap_list,writing_allowed:false}}),null);
 assert.equal(reconcileOutcome({decision:{decision:'IMPROVE_EXISTING'},gapList:f.gap_list}),null);
});

test('Free check (real overview of report 64): the same one outcome instead of "your page already covers it"',()=>{
 const s=summarizeFreeGrowth({editorial_decision_gate:f.editorial_decision_gate,competitor_overview:f.competitor_overview},{query:'content scaling'});
 assert.equal(s.decision,'NO_CHANGE');
 assert.equal(s.headline,'No change required — 4 topics from the ranking pages to consider');
 assert.doesNotMatch(s.explanation,/already covers/);assert.match(s.steps[0],/choose only what belongs on your page/);
 assert.equal(s.outcome_context.count,4);
});

test('report 64 (real): a link on the single word "quality" under the table of contents becomes "write your own link text"',()=>{
 const l=linkOf(f.funnel_action.link,{keyword:f.funnel_action.keyword});
 assert.equal(f.funnel_action.link.anchor_text,'quality');assert.match(f.funnel_action.link.under_heading,/Table of Contents/);
 assert.equal(l.status,'WRITE_OWN_LINK_TEXT');assert.equal(l.weak_reason,'ONE_WORD_ANCHOR');
 assert.match(l.action,/for example “ai content quality checker”/);
 const ok=linkOf({status:'LINK_CANDIDATE_FOR_REVIEW',anchor_text:'content quality checker',under_heading:'How to Audit Your Content Before You Scale'},{keyword:'x'});
 assert.equal(ok.status,'LINK_CANDIDATE_FOR_REVIEW');
});

test('report 64 (real): "no content gap" keeps the performance checks open instead of closing Growth',()=>{
 const o=reconcileOutcome({decision:f.editorial_decision_gate,gapList:f.gap_list,report:f.report,aiCheck:f.ai_check,now:'2026-10-31T09:53:18Z'});
 assert.equal(o.status,'NO_CONTENT_GAP_PERFORMANCE_OPEN');
 assert.equal(o.headline,'No content gap found — 3 performance checks still open · 4 topics to consider');
 assert.match(o.distinction,/is not the same as no improvement needed/);
 const codes=o.open_checks.map(c=>c.code);
 assert.deepEqual(codes.slice(0,2),['GOOGLE_SHOWS_ANOTHER_PAGE','MOSTLY_BEYOND_PAGE_ONE']);
 assert(codes.includes('AI_NOT_CHECKED'));
 assert(!codes.includes('SEARCH_CONSOLE_DATA_OLD'),'imported on 2026-10-11: 20 days before the report, within 28 days');
 assert.match(o.open_checks[0].detail,/shows https:\/\/contentscale\.site\/ for “content scaling”: 3943 impressions, 2 clicks, average position 12\.7\. The page meant for this search is https:\/\/contentscale\.site\/content-scaling\/, which has no Search Console rows of its own\./);
 assert.match(o.open_checks[1].action,/a new title alone will not bring these clicks/);
});

test('report 64 (real): the route to action offers only the action page on the topic, not the AI citation tracker pages',()=>{
 const {readerFunnel}=require('../src/growth-next-pages.cjs');
 const r=readerFunnel({pageUrl:'https://contentscale.site/content-scaling/',focusQuery:'content scaling',pageIntent:'INFORMATIONAL_GUIDE',pageHtml:'',sitePages:f.funnel_site_pages});
 assert.deepEqual(r.stages.slice(1).map(s=>s.url),['https://contentscale.site/ai-content-quality-checker/']);
});

test('Search Console rows older than 28 days at research time are an open check too',()=>{
 const o=reconcileOutcome({decision:f.editorial_decision_gate,gapList:f.gap_list,report:f.report,aiCheck:f.ai_check,now:'2026-11-20T00:00:00Z'});
 assert(o.open_checks.some(c=>c.code==='SEARCH_CONSOLE_DATA_OLD'&&/imported on 2026-10-11/.test(c.detail)));
});

test('report 64 (real): the owner package lists the open checks under a NO_CHANGE decision',()=>{
 const {buildOwnerHandoffPackage}=require('../src/growth-owner-handoff-package.cjs');
 const m=buildOwnerHandoffPackage({report:f.report,decision:{...f.editorial_decision_gate,evidence_status:{}}}).markdown;
 assert.match(m,/## Still open — not a content question\n\nNo content gap was found, but that is not the same as no improvement needed:\n\n1\. Search Console \(imported 2026-10-11\) shows https:\/\/contentscale\.site\/ for “content scaling”/);
 assert.match(m,/2\. The average position is 12\.7: most impressions are beyond page one/);
});
