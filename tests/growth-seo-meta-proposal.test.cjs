'use strict';
// SEO title, description and link text proposed by AI for the CMS package. The current title and description are the
// real ones of contentscale.site/content-scaling/ (report 70); the model answers are stand-ins (labelled), no live call.
const test=require('node:test'),assert=require('node:assert/strict');
const {proposeSeoMeta,validate,headingsOf}=require('../src/growth-seo-meta-proposal.cjs');
const HTML='<html><head><title>Content Scaling In 2026: Scale Content Without Losing Quality</title><meta name="description" content="Content scaling without sacrificing quality: my step-by-step GRAAF Framework to scale content production sustainably in the AI-search era. Free scan, no login."></head><body><h1>Content Scaling in 2026: A Quality-First Guide to Sustainable Growth</h1><h2>How to Audit Your Content Before You Scale</h2><h2>How the GRAAF Workflow Works (Brief → Publish)</h2></body></html>';
const stand=answer=>({call:async()=>JSON.stringify(answer)});
const good={title:'Content Scaling: Grow Output Without Losing Quality',meta_description:'How to scale content without losing quality: audit first, repurpose what works, keep one brand voice across writers and use AI with the GRAAF workflow.',link_text:'AI content quality checker',why:'Names the new sections.'};

test('reads the current title, description and headings from the page',()=>{
 const h=headingsOf(HTML);assert.match(h.title,/^Content Scaling In 2026/);assert.match(h.description,/GRAAF Framework/);assert.equal(h.h2.length,2);
});
test('a checked proposal is filled in for review, with link text only when there is a link',async()=>{
 const p=await proposeSeoMeta({model:stand(good),query:'content scaling',html:HTML,concepts:['How Content Repurposing Scales Your Strategy'],linkUrl:'https://contentscale.site/ai-content-quality-checker/'});
 assert.equal(p.status,'AI_PROPOSAL_FOR_REVIEW');assert.equal(p.title,good.title);assert.equal(p.link_text,'AI content quality checker');
 assert.equal((await proposeSeoMeta({model:stand(good),query:'content scaling',html:HTML})).link_text,null);
});
test('numbers, superlatives and promises not on the page are refused; years and offers already on it are allowed',()=>{
 const current=headingsOf(HTML),chk=a=>validate(JSON.stringify({...good,...a}),{query:'content scaling',current,linkUrl:'https://x/'});
 assert.match(chk({title:'Content Scaling: 10x Output Without Losing Quality'}).reason,/TITLE_NUMBER_NOT_IN_PAGE/);
 assert.match(chk({title:'The Best Content Scaling Guide Without Losing Quality'}).reason,/TITLE_PROMISE_NOT_IN_PAGE/);
 assert.equal(chk({title:'Content Scaling in 2026: Grow Without Losing Quality'}).ok,true,'2026 is in the current title');
 assert.equal(chk({meta_description:'Scale content without losing quality: audit, repurpose, keep one voice across writers and use AI with GRAAF. Free scan, no login.'}).ok,true,'“Free scan, no login” is already in the description');
 assert.match(chk({title:'Grow Your Output Without Losing Any Quality Today'}).reason,/TITLE_WITHOUT_SEARCH_TERM/);
 assert.match(chk({meta_description:'Too short.'}).reason,/META_LENGTH/);
 assert.equal(chk({link_text:'click here'}).link_text,null);
});
test('without a model, or with a model failure, nothing is proposed and the current values stay',async()=>{
 assert.equal((await proposeSeoMeta({model:null,query:'content scaling',html:HTML})).status,'NO_MODEL');
 assert.equal((await proposeSeoMeta({model:{call:async()=>{throw Error('down')}},query:'content scaling',html:HTML})).status,'MODEL_UNAVAILABLE');
 assert.equal((await proposeSeoMeta({model:stand({title:'x'}),query:'content scaling',html:HTML})).status,'NOT_PROPOSED');
});
