'use strict';
// Owner ZIP 2026-11-01 (third package): H3 and link placement were right; left over were the meta description in the
// first person (the page's current "my step-by-step GRAAF Framework"), the lowercase link text, and no order for two
// changes at the same section. The title, description and sections are the owner's real ones.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto');
const {prepareGrowthCmsHandoff}=require('../src/growth-cms-handoff.cjs');
const {proposeHandoffFromResearch}=require('../src/growth-research-handoff-suggestions.cjs');
const f=require('./fixtures/growth-cms-package-71/sections.json');
const OWN='<html><body><h1>Content Scaling</h1><h2>How to Audit Your Content Before You Scale</h2><p>'+'Audit first. '.repeat(20)+'</p><h2>🔑 The 5-Step GRAAF Workflow</h2><p>Steps.</p><h2>How the GRAAF Workflow Works (Brief → Publish)</h2><p>Work.</p></body></html>';
const MY='Content scaling without sacrificing quality: my step-by-step GRAAF Framework to scale content production sustainably in the AI-search era. Free scan, no login.';
const pack=meta=>prepareGrowthCmsHandoff({canonicalUrl:'https://contentscale.site/content-scaling/',originalHtml:OWN,sourceExpectedSha256:crypto.createHash('sha256').update(OWN).digest('hex'),
 editorApproved:true,cms:'generic',pageTitle:'Content Scaling In 2026: Scale Content Without Losing Quality',metaDescription:meta,focusQuery:'content scaling',evidenceScope:'observed',
 changes:f.sections.map((h,i)=>({approved:true,evidence_ref:'growth_proposal:26',html:h.replace(/<p><a [^>]*>[\s\S]*?<\/a><\/p>/,''),placement:f.placements[i]}))});
test('a first-person meta description is refused with the reason',()=>{
 const r=pack(MY);assert.equal(r.status,'BLOCKED');assert(r.issues.includes('META_PERSONAL_OR_FOUNDER_VOICE'));
 assert.match(r.blocked_details[0].reason,/Meta description is written as a person \(“my”\)/);
 assert.equal(pack('How to scale content without losing quality: audit first, repurpose what works, keep one brand voice across writers and use AI with the GRAAF workflow.').status,'HANDOFF_READY_FOR_EDITOR');
});
test('a new section after a section that another change extends says: do the extension first',()=>{
 const md=pack('How to scale content without losing quality: audit first, repurpose what works, keep one brand voice across writers and use AI with the GRAAF workflow.').files.find(x=>x.name==='01-implementation.md').content;
 assert.match(md,/Change 2: Add as a new section directly after “How the GRAAF Workflow Works \(Brief → Publish\)”, after the end of that section including Change 4 \(do Change 4 first\)/);
 assert.match(md,/Change 1: Add as a new section directly after “How to Audit Your Content Before You Scale”\./);
});
test('the suggested link text from a tracked keyword is written properly',()=>{
 const URL_='https://contentscale.site/content-scaling/';
 const x=proposeHandoffFromResearch({success:true,url:URL_,page_content:{headings:{}},site_architecture:{candidates:[]},
  reader_funnel:{for_url:URL_,stages:[{stage:'ACTION',url:'https://contentscale.site/ai-content-quality-checker/',keyword:'ai content quality checker',link:{status:'WRITE_OWN_LINK_TEXT'}}]}},URL_);
 assert.equal(x.internal_label,'AI content quality checker');
});
