'use strict';
// Owner package 2026-11-01 (contentscale.site, a software and content site): the instructions spoke of click-to-call,
// Google Business Profile, won jobs and project photos, sections that extend a section had an H2, and the internal link
// sat under the first section. The four sections are the real ones from that package.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('crypto');
const {prepareGrowthCmsHandoff,isLocalBusiness}=require('../src/growth-cms-handoff.cjs');
const f=require('./fixtures/growth-cms-package-71/sections.json');
const plain=f.sections.map(s=>s.replace(/<p><a [^>]*>[\s\S]*?<\/a><\/p>/,''));
const SAAS='<html><head><title>Content Scaling</title></head><body><h1>Content Scaling</h1><h2>How to Audit Your Content Before You Scale</h2><p>'+'Audit first. '.repeat(20)+'</p><h2>🔑 The 5-Step GRAAF Workflow</h2><p>Steps.</p><h2>How the GRAAF Workflow Works (Brief → Publish)</h2><p>Work.</p><a href="/contact/">Contact</a></body></html>';
// LABELLED SYNTHETIC local business page (phone link and street address).
const LOCAL=SAAS.replace('<a href="/contact/">Contact</a>','<a href="tel:+12015550100">Call</a><script type="application/ld+json">{"@type":"RoofingContractor","address":{"streetAddress":"1 Main St"}}</script>');
const pack=html=>prepareGrowthCmsHandoff({canonicalUrl:'https://contentscale.site/content-scaling/',originalHtml:html,sourceExpectedSha256:crypto.createHash('sha256').update(html).digest('hex'),
 editorApproved:true,cms:'generic',pageTitle:'Content Scaling In 2026: Scale Content Without Losing Quality',metaDescription:'Content scaling without sacrificing quality.',focusQuery:'content scaling',evidenceScope:'observed',
 changes:plain.map((h,i)=>({approved:true,evidence_ref:'growth_proposal:26',html:h,placement:f.placements[i]}))});
const file=(r,n)=>r.files.find(x=>x.name===n).content;

test('a site without address or phone gets no calls, GBP, jobs or project photos; enquiries instead',()=>{
 assert.equal(isLocalBusiness(SAAS),false);
 const r=pack(SAAS);assert.equal(r.status,'HANDOFF_READY_FOR_EDITOR',JSON.stringify(r.issues));
 const text=file(r,'01-implementation.md')+file(r,'05-measurement-plan.md');
 assert.doesNotMatch(text,/click-to-call|GBP|won jobs|project photos/);
 assert.match(text,/visitor contact paths/);assert.match(text,/Track relevant contact enquiries and qualified leads/);assert.match(text,/form records, emails or a CRM/);
});
test('a local business keeps the call and Google Business Profile lines',()=>{
 assert.equal(isLocalBusiness(LOCAL),true);
 const text=file(pack(LOCAL),'01-implementation.md')+file(pack(LOCAL),'05-measurement-plan.md');
 assert.match(text,/track GBP call-button actions/);assert.match(text,/GBP phone-button taps/);
});
test('a section that extends an existing section gets an H3; a new section keeps its H2',()=>{
 const frag=file(pack(SAAS),'03-content-fragments.html');
 assert.match(frag,/<h2>How Repurposing Existing Content Helps Scale Content Production<\/h2>/);
 assert.match(frag,/<h3>Leveraging AI and Automation Tools for Content Scaling<\/h3>/);
 assert.match(frag,/<h3>Team Collaboration, Agile Planning, and Workflow Batching for Content Scaling<\/h3>/);
 assert.match(file(pack(SAAS),'02-approved-copy.md'),/### Leveraging AI and Automation Tools/);
});
