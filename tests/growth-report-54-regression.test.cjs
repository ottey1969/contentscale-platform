'use strict';
// Production report 54 (page 2294, "ai citation tracker"), owner review: proposal #4 reached the CMS handoff, but
// (1) it contains a generated statistic with an invented source ("According to Search Engine Journal (March 2025), 68% …"),
// (2) its "Why …" heading is answered with instructions. Real data only (fixture note); the page text is not in the
// report, so the destination below is only the page's own citation text that the report quotes.
const test=require('node:test'),assert=require('node:assert/strict');
const {assessDraftClaims,headingMismatch}=require('../src/growth-draft-claim-guard.cjs');
const {normalizeDraft}=require('../src/growth-source-grounded-editor.cjs');
const {proposalFromDecision}=require('../src/growth-proposal-store.cjs');
const r54=require('./fixtures/growth-report-54/decision.json');
const gate=r54.editorial_decision_gate;
const STAT='According to Search Engine Journal (March 2025), 68% of AI Overviews include at least one citation link, making direct verification essential for preserving audience reach.';
// Quoted from the destination page in report 54 (competitor-matching passages of page 2294).
const PAGE_CITATIONS='Multi-Engine Reality: Tracking only Google is insufficient; Perplexity and Copilot each weight content signals differently. ( Ahrefs, 2025 ) 82% of marketers say they are increasing budget for AI-specific content optimization in 2026. ( Semrush State of SEO, 2025 )';

test('report 54 is the case: proposal #4 was stored with the statistic and a rejected second section',()=>{
 assert.deepEqual(r54.cms_handoff,{proposal_id:4,target_page_id:2294});
 assert(gate.proposed_text.includes(STAT));
 assert.deepEqual(r54.draft_sections.map(s=>s.review_status),['ACCEPTED_FOR_OWNER_REVIEW','REJECTED_NOT_PART_OF_PROPOSAL']);
});

test('a named source that the page does not name, and a figure without the same context on the page, reject the sentence',()=>{
 const codes=assessDraftClaims({text:STAT,destinationText:PAGE_CITATIONS}).violations.map(v=>v.code);
 assert(codes.includes('UNSOURCED_NUMBER'));
 // Even when the same digits appear on the page in another context, the statistic stays unsourced.
 const coincidence=assessDraftClaims({text:STAT,destinationText:PAGE_CITATIONS+' Our case study went from 0 to 68% coverage in March 2025.'}).violations.map(v=>v.code);
 assert(coincidence.includes('UNSOURCED_NUMBER')&&coincidence.includes('UNSOURCED_ATTRIBUTION'),JSON.stringify(coincidence));
 // The page's own citations, restated in the same context, remain allowed.
 assert.deepEqual(assessDraftClaims({text:'Tracking only Google is insufficient, because Perplexity and Copilot each weight content signals differently (Ahrefs, 2025).',destinationText:PAGE_CITATIONS}).violations.map(v=>v.code).filter(c=>/UNSOURCED/.test(c)),[]);
 assert.deepEqual(assessDraftClaims({text:'Keep the queries according to the plan you made.'}).violations,[]);
});

test('a "Why" heading answered with instructions is rejected; the owner\'s "How to" section is not',()=>{
 const m=headingMismatch(gate.draft_heading,gate.proposed_text);
 assert.equal(m&&m.code,'HEADING_PROMISES_REASONS_BUT_GIVES_STEPS');
 const owner=require('./fixtures/growth-report-51/owner-revision.json');
 assert.equal(headingMismatch(owner.h2,owner.html.replace(/<[^>]+>/g,' ')),null);
 assert.equal(headingMismatch('Why citations matter','Generated answers increasingly link to sources. Pages that are cited get a visible link. That makes citations a separate visibility signal.'),null);
});

test('generator: the report 54 draft is sent back for a rewrite with the reason named',()=>{
 const draft=s=>JSON.stringify({sections:[{task_code:'task_matter',h2:gate.draft_heading,paragraphs:s.split('\n\n')}]});
 // A coincidental "68" on the page does not source "68%".
 assert.equal(normalizeDraft(draft(gate.proposed_text),PAGE_CITATIONS+' 68 pages',gate.focus_query,{requireTitle:false,taskTerms:['matter']}).status,'AI_DRAFT_NUMERIC_CLAIM_NOT_OBSERVED');
 const noStat=normalizeDraft(draft(gate.proposed_text.replace(STAT+' ','')),PAGE_CITATIONS,gate.focus_query,{requireTitle:false,taskTerms:['matter']});
 assert.equal(noStat.status,'AI_DRAFT_HEADING_MISMATCH');
 assert.match(noStat.rejected_sections[0].reason,/^HEADING_PROMISES_REASONS_BUT_GIVES_STEPS/);
 const named=normalizeDraft(draft('Generated answers link to sources more often, according to Search Engine Journal. A cited page gets a visible source link next to the answer.'),PAGE_CITATIONS,gate.focus_query,{requireTitle:false,taskTerms:['matter']});
 assert.equal(named.status,'AI_DRAFT_UNSOURCED_ATTRIBUTION');
});

test('the rejected second section never enters the stored proposal',()=>{
 const p=proposalFromDecision(gate);
 assert.equal(p.sections.length,1);
 assert.equal(p.sections[0].h2,gate.draft_heading);
 assert(!JSON.stringify(p).includes('Comparing AI Citation Tracking vs. Traditional Backlink Monitoring'));
});
