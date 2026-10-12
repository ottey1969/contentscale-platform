'use strict';
const assert=require('node:assert/strict');
const {growthEvidenceContract}=require('./growth-evidence-contract.cjs');
const url='https://contentscale.site/content-freshness-tactics/';
const base={url,originalHtml:'<article class="template">original</article>',templateMarkers:['class="template"'],
pageQueries:[{page_url:url,evidence_scope:'page_verified',query:'content freshness seo',impressions:200}],
searchSpy:[{target_url:url,source_url:'https://example.com/result',observed:'Explains how to verify update dates',improvement:'Add a sourced step-by-step process',where_in_draft:'Section 2'}],
aiSpy:[{target_url:url,source_url:'https://example.org/citation',observed:'AI answer cites official guidance',improvement:'Reference the relevant official guidance where applicable',where_in_draft:'Sources'}]};
assert.equal(growthEvidenceContract(base).evidence_status,'EVIDENCE_READY');
assert.equal(growthEvidenceContract({...base,pageQueries:[{page_url:'https://other.site/',query:'false',evidence_scope:'page_verified'}]}).evidence_status,'RESEARCH_INCOMPLETE');
assert.equal(growthEvidenceContract({...base,searchSpy:[]}).evidence_status,'RESEARCH_INCOMPLETE');
assert.equal(growthEvidenceContract({...base,aiSpy:[]}).evidence_status,'RESEARCH_INCOMPLETE');
assert.equal(growthEvidenceContract({...base,templateMarkers:[]}).evidence_status,'RESEARCH_INCOMPLETE');
assert.equal(growthEvidenceContract({...base,searchSpy:[{...base.searchSpy[0],source_url:'unverified'}]}).competitiveGaps.length,1);
const selfReference=growthEvidenceContract({...base,searchSpy:[{...base.searchSpy[0],source_url:url}]});
assert.equal(selfReference.evidence_status,'RESEARCH_INCOMPLETE');
assert.equal(selfReference.competitiveGaps.some(g=>g.kind==='SEARCH_SPY'),false);
const sameDomain=growthEvidenceContract({...base,searchSpy:[{...base.searchSpy[0],source_url:'https://www.contentscale.site/another-article/'}]});
assert.equal(sameDomain.evidence_status,'RESEARCH_INCOMPLETE');
assert.equal(sameDomain.competitiveGaps.some(g=>g.kind==='SEARCH_SPY'),false);
const malformed=growthEvidenceContract({...base,searchSpy:[{...base.searchSpy[0],source_url:'https://'}]});
assert.equal(malformed.evidence_status,'RESEARCH_INCOMPLETE');
console.log('Growth evidence contract: 9 checks passed');
