'use strict';
const assert=require('node:assert/strict');
const {buildUnifiedGrowthHandoff}=require('./growth-unified-workflow.cjs');
const input={canonicalUrl:'https://example.test/aeo-vs-geo-vs-seo/',originalHtml:'<h1>AEO vs GEO vs SEO</h1><p>Original useful explanation.</p>',
 changes:[{approved:true,evidence_ref:'observed:owner-review',html:'<section><h2>When GEO matters</h2><p>Use GEO analysis when evaluating how discovery systems present information from your site. Check the specific limitations of evidence.</p><a href="https://example.test/services/">Our services</a></section>'}],
 editorApproved:true,cms:'wix',pageTitle:'AEO vs GEO vs SEO Explained',metaDescription:'Understand AEO vs GEO vs SEO, the main differences and how search visibility is evaluated.',focusQuery:'AEO vs GEO vs SEO',evidenceScope:'observed',
 offers:{ai_visibility:{url:'https://example.test/ai-visibility-check/',available:true,claimsVerified:true}}};
const done=buildUnifiedGrowthHandoff(input);
assert.equal(done.status,'UNIFIED_HANDOFF_READY_FOR_EDITOR',JSON.stringify(done.editorial.issues));
assert.equal(done.files.length,9);
assert(done.files.some(f=>f.name==='06-revenue-cta.html'&&f.content.includes('Check AI visibility')));
assert(done.files.some(f=>f.name==='07-revenue-instructions.md'&&f.content.includes('Wix')));
assert.equal(done.manifest.publication_allowed,false);
assert.equal(done.manifest.no_paid_provider_required,true);
assert(done.zip.readUInt32LE(0)===0x04034b50);
assert.equal(done.zip.readUInt16LE(done.zip.length-22+10),9);
const lacks=buildUnifiedGrowthHandoff({...input,offers:{}});
assert.equal(lacks.status,'EDITORIAL_HANDOFF_READY_REVENUE_NEEDS_EVIDENCE');
assert(!lacks.files.find(f=>f.name==='06-revenue-cta.html').content.includes('<aside'));
const blocked=buildUnifiedGrowthHandoff({...input,editorApproved:false});
assert.equal(blocked.status,'BLOCKED');assert.equal(blocked.files.length,0);
console.log('growth unified workflow: tests passed');
