'use strict';
// Owner review of Growth report 51 (page 2294, "ai citation tracker"). Only real data is used:
// - tests/fixtures/growth-report-50/placement.json: the page's real section headings and word counts plus the real
//   derived task and its two competitor sources (production report 50; the section body text is not in the report and
//   is not invented here, so only the headings drive placement);
// - tests/fixtures/growth-report-50/decision.json: the real proposed text and claim review;
// - tests/fixtures/growth-report-51/owner-revision.json: the owner's revised section and placement, verbatim.
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {pickPlacement}=require('../src/growth-reader-task-coverage.cjs');
const {assessDraftClaims}=require('../src/growth-draft-claim-guard.cjs');
const {prepareGrowthCmsHandoff}=require('../src/growth-cms-handoff.cjs');
const page=require('./fixtures/growth-report-50/placement.json');
const gate=require('./fixtures/growth-report-50/decision.json').editorial_decision_gate;
const owner=require('./fixtures/growth-report-51/owner-revision.json');
const sections=page.destination_sections.map(s=>({heading:s.heading,text:'',words:s.words}));

test('placement: a how-to never goes into a numbered list item that argues against it',()=>{
 assert.equal(page.placement_in_report.section_heading,'1. It Eliminates the “Manual Entry” Friction','the report 50/51 choice being corrected');
 const p=pickPlacement(sections,page.task,new Set());
 assert.notEqual(p.section_heading,'1. It Eliminates the “Manual Entry” Friction');
 assert.equal(p.mode,'ADD_AFTER_SECTION');
 assert.equal(p.section_heading,'⚙️ How AI Citation Trackers Actually Work','the owner\'s choice in the review of report 51');
});

test('placement: rules are structural, not tied to this page',()=>{
 const task={key:'manual',co_terms:[],support:[]};
 const sec=(heading,words=80)=>({heading,text:'',words});
 // A heading that names the concept in a neutral way is still extended.
 assert.equal(pickPlacement([sec('Intro'),sec('Manual checks step by step')],task,new Set()).mode,'EXTEND_SECTION');
 // The same heading framed as "avoid" is not.
 assert.notEqual(pickPlacement([sec('How it works'),sec('Avoid manual checks')],task,new Set()).section_heading,'Avoid manual checks');
 // One numbered heading on its own is an ordinary section, not a list.
 assert.equal(pickPlacement([sec('Intro'),sec('1. Manual checks')],task,new Set()).section_heading,'1. Manual checks');
});

test('safety review: "structural gaps" in SEO text is not a physical hazard; real hazards still are',()=>{
 const sentence='Finally, compare cited competitor pages against your own published text to spot structural gaps.';
 assert(gate.claim_review.needs_safety_review.includes(sentence),'report 50/51 flagged this sentence');
 const safety=t=>assessDraftClaims({text:t}).claim_review.filter(x=>x.safety_review).map(x=>x.sentence);
 assert.deepEqual(safety(gate.proposed_text),[]);
 assert.equal(safety('Water stains can point to structural damage in the ceiling.').length,1);
 assert.equal(safety('Check the roof for structural integrity after a storm.').length,1);
 assert.equal(safety('Stay away from falling debris and call emergency services.').length,1);
 assert.equal(safety('Falling rankings and unstable results are common after an update.').length,0);
});

test('claims: the owner\'s disclaimer "do not … guarantee" is not an absolute claim; a real guarantee still is',()=>{
 const text=owner.html.replace(/<[^>]+>/g,' ');
 const r=assessDraftClaims({text,query:'ai citation tracker'});
 assert.equal(r.ok,true,JSON.stringify(r.violations));
 assert.equal(r.claim_review.filter(x=>x.safety_review).length,0);
 assert.equal(assessDraftClaims({text:'Our tracker guarantees that AI engines will cite you.'}).ok,false);
 assert.equal(assessDraftClaims({text:'It is not perfect, but it guarantees results.'}).ok,false,'a later, un-negated guarantee still counts');
});

test('CMS package keeps the owner\'s revised text and placement exactly, records the edit, invents nothing',()=>{
 // Headings only (real); no body sentences are invented for the page.
 const original='<main><h1>What Is an AI Citation Tracker?</h1>'+page.destination_sections.map(s=>'<h2>'+s.heading+'</h2><p>'+s.heading+'</p>').join('')+'</main>';
 const sha=createHash('sha256').update(original).digest('hex');
 // The review notes as Growth produced them for report 50/51, including the five fact-check sentences of the original text.
 const review=gate.claim_review;
 const out=prepareGrowthCmsHandoff({canonicalUrl:page.url,originalHtml:original,sourceExpectedSha256:sha,editorApproved:true,cms:'wordpress',
  pageTitle:'What Is An AI Citation Tracker? Free Multi-Engine SEO Tool',metaDescription:'An AI citation tracker shows when Google AI Overviews, Perplexity & Copilot cite you.',
  focusQuery:gate.focus_query,evidenceScope:'observed',reviewNotes:review,
  growthProposal:{id:51,sections:[{h2:gate.draft_heading,text:gate.proposed_text}]},
  changes:[{approved:true,evidence_ref:'growth_proposal:51',html:owner.html,placement:owner.placement}]});
 assert.equal(out.status,'HANDOFF_READY_FOR_EDITOR',JSON.stringify(out.issues));
 assert.equal(out.publication_allowed,false);
 assert.deepEqual(out.manifest.growth_proposal,{id:51,editor_changed_text:true});
 assert.deepEqual(out.manifest.change_placements,[owner.placement]);
 const file=n=>out.files.find(f=>f.name===n)?.content||'';
 assert.equal(file('03-content-fragments.html').includes(owner.html),true,'the editor\'s HTML is passed through unchanged');
 assert.match(file('01-implementation.md'),/Add as a new section directly after “How AI Citation Trackers Actually Work”/);
 const facts=file('06-fact-check-before-publishing.md');
 assert.doesNotMatch(facts,/Safety review|qualified professional/);
 assert.doesNotMatch(facts,/- \[ \]/,'none of the old sentences is in the revised text, so none is listed');
 assert.match(facts,/Growth did not check the sentences the editor wrote or changed/);
 assert.equal(out.manifest.editor_text_unchecked_by_growth,true);
 assert.doesNotMatch(JSON.stringify(out.files),new RegExp(gate.draft_heading),'the original Growth heading is not slipped back in');
});

test('an unchanged sentence keeps its check even with quotes and & in the HTML',()=>{
 const sentence='Compare “Perplexity” & Google AI Overviews results for the same query, and note which URLs each one cites.';
 const original='<main><h1>What Is an AI Citation Tracker?</h1><p>'+page.destination_sections[2].heading+'</p></main>';
 const out=prepareGrowthCmsHandoff({canonicalUrl:page.url,originalHtml:original,sourceExpectedSha256:createHash('sha256').update(original).digest('hex'),
  editorApproved:true,cms:'generic',pageTitle:'t',metaDescription:'m',evidenceScope:'observed',
  growthProposal:{id:1,sections:[{h2:'Check',text:sentence}]},reviewNotes:{needs_fact_check:[sentence]},
  changes:[{approved:true,evidence_ref:'growth_proposal:1',html:'<section><h2>Check</h2><p>'+sentence.replace(/&/g,'&amp;')+'</p></section>'}]});
 assert.equal(out.manifest.review_items.fact_check,1);
 assert.equal(out.manifest.editor_text_unchecked_by_growth,false);
});
