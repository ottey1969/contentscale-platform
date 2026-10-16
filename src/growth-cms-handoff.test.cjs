'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {prepareGrowthCmsHandoff,packageGrowthZip,renderChangeMarkdown}=require('./growth-cms-handoff.cjs');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const url='https://synthetic-roofer.example/roof-repair/',src='<article><h1>Roof Repairs</h1><p>Useful original copy and images.</p></article>';
const approved=[{approved:true,evidence_ref:'observed:SERP-review',
 html:'<section><h2>Roof leak repairs in Bergen County</h2><p>Ask for an inspection of flashing and penetrations before choosing a repair or replacement. Our crew can confirm its availability.</p><a href="https://synthetic-roofer.example/contact/">Contact us</a></section>'}];
const params={canonicalUrl:url,originalHtml:src,sourceExpectedSha256:sha(src),changes:approved,editorApproved:true,
 cms:'wix',pageTitle:'Roof Repairs in Bergen County | Local Roofing',
 metaDescription:'Learn about roof leak repair, flashing assessments and roofing inspection options in Bergen County.',
 focusQuery:'roof repair bergen county',evidenceScope:'needs_access'};
let x=prepareGrowthCmsHandoff(params);
assert.equal(x.status,'HANDOFF_READY_FOR_EDITOR',JSON.stringify(x.issues));
assert.equal(x.manifest.cms,'wix');
assert.equal(x.manifest.no_paid_provider_required,true);
assert.equal(x.manifest.automatic_publishing,false);
assert.equal(x.manifest.evidence_scope,'needs_access');
assert.equal(x.manifest.source_sha256,sha(src));
assert.equal(x.manifest.meta.title,params.pageTitle);
assert.equal(x.manifest.change_count,1);
assert(x.manifest.warnings.includes('NO_VERIFIED_PAGE_GSC_BASELINE'));
assert.equal(x.files.length,6);
assert(x.files.find(y=>y.name==='01-implementation.md').content.includes('native Wix text elements'));
assert(x.files.find(y=>y.name==='03-content-fragments.html').content.includes('Roof leak repairs in Bergen County'));
assert(x.files.find(y=>y.name==='05-measurement-plan.md').content.includes('NEEDS ACCESS'));
assert(!x.files.some(y=>y.content.includes('full payment confirmed')));
assert(renderChangeMarkdown(approved[0].html).includes('## Roof leak repairs'));
const zip=packageGrowthZip(x.files);
assert.equal(zip.readUInt32LE(0),0x04034b50);
assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
assert.equal(zip.readUInt16LE(zip.length-22+10),6);
const names=x.files.map(f=>f.name);
const parsed=[];let off=0;while(off<zip.length&&zip.readUInt32LE(off)===0x04034b50){
 const len=zip.readUInt16LE(off+26),size=zip.readUInt32LE(off+18),extra=zip.readUInt16LE(off+28);
 const name=zip.subarray(off+30,off+30+len).toString('utf8');
 const value=zip.subarray(off+30+len+extra,off+30+len+extra+size).toString('utf8');
 parsed.push({name,value});off+=30+len+extra+size;
}
assert.deepEqual(parsed.map(x=>x.name),names);
assert.equal(parsed[3].value,x.files[3].content);
for(const tweak of [
 {editorApproved:false}, {sourceExpectedSha256:'0'.repeat(64)}, {caseStudyLocked:true},
 {cms:'invented'}, {changes:[{...approved[0],html:'<h2></h2><p>Short</p>'}]},
 {changes:[{...approved[0],html:'<script>bad()</script><p>Content</p>'}]},
 {changes:[{...approved[0],html:'<iframe src="https://site.example"></iframe><p>Some content</p>'}]},
 {changes:[{...approved[0],html:'<h1>Duplicate H1</h1><p>More SEO text here.</p>'}]}
]){
 const b=prepareGrowthCmsHandoff({...params,...tweak});
 assert.equal(b.status,'BLOCKED',JSON.stringify(tweak));
}
for(const unsafeHref of ['java&#x73;cript:alert(1)','java&#115;cript:alert(1)','java&Tab;script:alert(1)']){
 const fail=prepareGrowthCmsHandoff({...params,changes:[{...approved[0],html:'<section><h2>Roofing checks</h2><p>Documented roofing work should be inspected before choosing the next repair.</p><a href="'+unsafeHref+'">Details</a></section>'}]});
 assert.equal(fail.status,'BLOCKED',unsafeHref);
 assert(fail.issues.includes('ENCODED_LINK_TARGET_NOT_ALLOWED'));
}
const unquoted=prepareGrowthCmsHandoff({...params,changes:[{...approved[0],html:'<section><h2>Roofing checks</h2><p>Documented roofing work should be inspected before choosing the next repair.</p><a href=https://synthetic-roofer.example/contact/>Contact</a></section>'}]});
assert.equal(unquoted.status,'BLOCKED');
assert(unquoted.issues.includes('UNQUOTED_LINK_TARGET_NOT_ALLOWED'));
const noGsc=prepareGrowthCmsHandoff({...params,cms:'custom',evidenceScope:'observed',focusQuery:''});
assert.equal(noGsc.status,'HANDOFF_READY_FOR_EDITOR');
assert.equal(noGsc.manifest.publication_allowed,false);
console.log('PASS: CMS-independent Wix/other ZIP with intact original source, editor approval, indexed copy and no paid APIs');
