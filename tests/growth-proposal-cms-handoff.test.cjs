'use strict';
// Growth proposal -> CMS handoff, without a database. The decision is a subset of production report 50 (page 2294,
// IMPROVE_EXISTING, draft REVIEW_READY). The original page HTML below is SYNTHETIC: it only contains the section
// heading Growth proposed to extend, so placement can be tested; it is not the live page.
const test=require('node:test'),assert=require('node:assert/strict');
const {proposalFromDecision}=require('../src/growth-proposal-store.cjs');
const {prepareGrowthCmsHandoff}=require('../src/growth-cms-handoff.cjs');
const sha=x=>require('node:crypto').createHash('sha256').update(x).digest('hex');
const r50=require('./fixtures/growth-report-50/decision.json');
const gate=r50.editorial_decision_gate;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const sectionHtml=s=>'<section><h2>'+esc(s.h2)+'</h2>'+s.text.split(/\n\s*\n/).map(t=>'<p>'+esc(t.trim())+'</p>').join('\n')+'</section>';
const original='<main><h1>What Is an AI Citation Tracker?</h1><p>An AI citation tracker shows whether AI answers cite your pages, and which pages they cite instead of yours.</p>'+
 '<h2>1. It Eliminates the “Manual Entry” Friction</h2><p>Checking every AI engine by hand for every prompt takes hours and is easy to get wrong.</p></main>';

test('report 50: the checked proposal keeps text, H2, placement, fact-check list and evidence',()=>{
 const p=proposalFromDecision(gate);
 assert.equal(p.target_url,'https://contentscale.site/what-is-ai-citation-tracker/');
 assert.equal(p.focus_query,'ai citation tracker');
 assert.equal(p.sections.length,1);
 assert.equal(p.sections[0].h2,gate.draft_heading);
 assert.equal(p.sections[0].text,gate.proposed_text);
 assert.deepEqual(p.sections[0].placement,{mode:'EXTEND_SECTION',section_heading:'1. It Eliminates the “Manual Entry” Friction'});
 assert.equal(p.review.needs_fact_check.length,5);
 assert.equal(p.review.needs_safety_review.length,1);
 assert.equal(p.review.competitor_sources.length,2);
 assert.equal(p.evidence_label,'TASK_GAP_AND_DRAFT_VERIFIED_FOR_REVIEW');
 assert.match(p.intent_note,/tool/i,'the protected tool page note travels with the proposal');
});

test('only a checked IMPROVE_EXISTING draft becomes a proposal',()=>{
 assert.equal(proposalFromDecision({...gate,copy_ready:false}),null);
 for(const decision of ['NO_CHANGE','NEW_DISTINCT_PAGE','DATA_BLOCKED'])assert.equal(proposalFromDecision({...gate,decision}),null,decision);
 assert.equal(proposalFromDecision({...gate,proposed_text:''}),null);
 assert.equal(proposalFromDecision(null),null);
});

function handoff(p,{changes,locked=false}={}){
 return prepareGrowthCmsHandoff({canonicalUrl:p.target_url,originalHtml:original,sourceExpectedSha256:sha(original),editorApproved:true,cms:'wordpress',
  pageTitle:'What Is an AI Citation Tracker?',metaDescription:'What an AI citation tracker checks and how to read its results.',
  focusQuery:p.focus_query,evidenceScope:'observed',caseStudyLocked:locked,
  growthProposal:{id:41,sections:p.sections},reviewNotes:p.review,
  changes:changes||p.sections.map(s=>({approved:true,evidence_ref:'growth_proposal:41',html:sectionHtml(s),placement:s.placement}))});
}

test('handoff carries the proposal unchanged, with placement and a fact-check file; nothing is published',()=>{
 const p=proposalFromDecision(gate),out=handoff(p);
 assert.equal(out.status,'HANDOFF_READY_FOR_EDITOR',JSON.stringify(out.issues));
 assert.equal(out.publication_allowed,false);
 assert.deepEqual(out.manifest.growth_proposal,{id:41,editor_changed_text:false});
 assert.deepEqual(out.manifest.change_placements,[p.sections[0].placement]);
 assert.deepEqual(out.manifest.review_items,{fact_check:5,owner_confirmation:0,safety_review:1,flagged:0});
 const file=n=>out.files.find(f=>f.name===n)?.content||'';
 assert.match(file('01-implementation.md'),/Change 1: Extend the existing section “1\. It Eliminates the “Manual Entry” Friction”/);
 assert.match(file('02-approved-copy.md'),/Placement: Extend the existing section/);
 const facts=file('06-fact-check-before-publishing.md');
 assert.equal((facts.match(/- \[ \] /g)||[]).length,6,'5 fact-checks + 1 safety review, each a checkbox');
 assert.match(facts,/do not prove that a sentence is true/);
});

test('owner may move the section (separate section after the heading); edited text is recorded, not hidden',()=>{
 const p=proposalFromDecision(gate);
 const moved=handoff(p,{changes:[{approved:true,evidence_ref:'growth_proposal:41',html:sectionHtml(p.sections[0]),
  placement:{mode:'ADD_AFTER_SECTION',section_heading:p.sections[0].placement.section_heading}}]});
 assert.equal(moved.status,'HANDOFF_READY_FOR_EDITOR');
 assert.equal(moved.manifest.growth_proposal.editor_changed_text,false,'moving a section is not a text change');
 assert.match(moved.files.find(f=>f.name==='01-implementation.md').content,/Add as a new section directly after/);
 const edited=handoff(p,{changes:[{approved:true,evidence_ref:'growth_proposal:41',html:sectionHtml({...p.sections[0],text:p.sections[0].text+' Repeat this every month.'}),placement:null}]});
 assert.equal(edited.manifest.growth_proposal.editor_changed_text,true);
 assert.match(edited.files.find(f=>f.name==='01-implementation.md').content,/Choose a suitable position/);
});

test('an invalid placement or a locked Case Study page never produces a package',()=>{
 const p=proposalFromDecision(gate);
 for(const placement of [{mode:'REPLACE_PAGE',section_heading:'x'},{mode:'EXTEND_SECTION',section_heading:''},'after intro']){
  const out=handoff(p,{changes:[{approved:true,evidence_ref:'growth_proposal:41',html:sectionHtml(p.sections[0]),placement}]});
  assert.equal(out.status,'BLOCKED');assert(out.issues.includes('PLACEMENT_INVALID'),JSON.stringify(placement));assert.equal(out.files.length,0);
 }
 const locked=handoff(p,{locked:true});
 assert.equal(locked.status,'BLOCKED');assert.equal(locked.files.length,0);
});

test('without review notes there is no fact-check file; earlier handoffs keep working',()=>{
 const p=proposalFromDecision(gate);
 const out=prepareGrowthCmsHandoff({canonicalUrl:p.target_url,originalHtml:original,sourceExpectedSha256:sha(original),editorApproved:true,cms:'wix',
  pageTitle:'What Is an AI Citation Tracker?',metaDescription:'What an AI citation tracker checks.',evidenceScope:'needs_access',
  changes:[{approved:true,evidence_ref:'editor_reviewed:original_page',html:sectionHtml(p.sections[0])}]});
 assert.equal(out.status,'HANDOFF_READY_FOR_EDITOR');
 assert.equal(out.manifest.growth_proposal,null);
 assert.equal(out.files.some(f=>f.name.startsWith('06-')),false);
});

test('the basis of each Growth section travels to the fact-check file, only while that section is in the approved text',()=>{
 const p=proposalFromDecision(gate);
 const basis=[{h2:p.sections[0].h2,answers:'How do I check AI citations manually?',evidence_level:'COMPETITOR_HEADINGS_ONLY',sources:['blog.hubspot.com: “Manually search your most important keywords.”'],warning:'Only competitor headings are behind this section.'},
  {h2:'A section the editor removed',answers:'x',evidence_level:'COMPETITOR_TEXT',sources:[],warning:null}];
 const out=handoff({...p,review:{...p.review,basis}});
 const facts=out.files.find(f=>f.name==='06-fact-check-before-publishing.md').content;
 assert.match(facts,/## What each section rests on/);
 assert.match(facts,/answers “How do I check AI citations manually\?”\. Sources: blog\.hubspot\.com.*⚠ Only competitor headings/);
 assert(!facts.includes('A section the editor removed'));
});

test('the evidence record of the writing run is part of the CMS package (07-evidence-dossier.json)',()=>{
 const p=proposalFromDecision(gate);
 const dossier={version:1,research:{focus_query:p.focus_query,researched_at:'2026-10-29T10:00:00.000Z',page_fingerprint:'abc'},items:[{item_id:'q-task_manual',sources:[{site:'blog.hubspot.com',url:'https://blog.hubspot.com/',passage:'p'}]}]};
 const out=handoff({...p,review:{...p.review,dossier}});
 const f=out.files.find(x=>x.name==='07-evidence-dossier.json');
 assert(f,'dossier file present');assert.deepEqual(JSON.parse(f.content),dossier);
 assert(!handoff(p).files.some(x=>x.name==='07-evidence-dossier.json'),'no dossier, no file');
});
