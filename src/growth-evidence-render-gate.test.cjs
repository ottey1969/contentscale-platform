'use strict';
const assert=require('node:assert/strict');
const {inspectGrowthDraft}=require('./growth-evidence-render-gate.cjs');
const base=()=>({
 url:'https://contentscale.site/example/',
 html:'<article class="approved"><h1>Example</h1><p>'+('Useful and independently checked information. '.repeat(12))+'</p><img src="/a.jpg" alt="Example"></article>',
 originalHtml:'<article class="approved"><h1>Old version</h1></article>',
 templateMarkers:['<article class="approved">'],
 evidence:{pageQueries:[{page_url:'https://contentscale.site/example/',query:'example',evidence_scope:'page_verified'}],searchSpy:[],aiSpy:[]},
 claims:[],competitiveGaps:[{competitor_url:'https://example.org/competitor',observed:'Competitor omits process',improvement:'Add verified process',where_in_draft:'H2 process'}],
 renderProof:{desktop_checked:true,mobile_checked:true}
});
function expectBlocked(mutator,code){const x=base();mutator(x);const result=inspectGrowthDraft(x);assert.equal(result.ready,false);assert.ok(result.issues.some(y=>y.code===code),JSON.stringify(result.issues));}
assert.equal(inspectGrowthDraft(base()).ready,true);
expectBlocked(x=>{x.templateMarkers=['missing'];},'TEMPLATE_NOT_PRESERVED');
expectBlocked(x=>{x.templateMarkers=[];},'TEMPLATE_UNDEFINED');
expectBlocked(x=>{x.evidence.pageQueries=[];},'GSC_EXACT_PAGE_MISSING');
expectBlocked(x=>{delete x.evidence.aiSpy;},'AISPY_MISSING');
expectBlocked(x=>{x.competitiveGaps=[];},'COMPETITIVE_DIFFERENTIATION_MISSING');
expectBlocked(x=>{x.claims=[{text:'Guaranteed traffic growth',status:'verified'}];},'CLAIM_SOURCE_MISSING');
expectBlocked(x=>{x.caseStudyLocked=true;},'CASE_STUDY_LOCK');
expectBlocked(x=>{x.renderProof.mobile_checked=false;},'RENDER_NOT_REVIEWED');
expectBlocked(x=>{x.html='<article class="approved"><p>'+('Useful text '.repeat(20))+'</p>'+['a','b','c','d'].map(n=>'<img src="/'+n+'.jpg" alt="'+n+'">').join('')+'</article>';},'IMAGE_STACK');
expectBlocked(x=>{x.html=x.html.replace('</article>','<img src="/a.jpg" alt="dup"></article>');},'IMAGE_DUPLICATE');
expectBlocked(x=>{x.originalHtml='<article class="approved"><img src="/original.jpg" alt="Original"></article>';},'ORIGINAL_IMAGE_REMOVED');
expectBlocked(x=>{x.templateMarkers=['<span class="invented">']; x.html=x.html.replace('</article>','<span class="invented"></span></article>');},'TEMPLATE_MARKER_NOT_IN_ORIGINAL');
expectBlocked(x=>{x.competitiveGaps=[{...x.competitiveGaps[0],competitor_url:'https://www.contentscale.site/another/'}];},'COMPETITIVE_GAP_UNSUPPORTED');
expectBlocked(x=>{x.competitiveGaps=[{...x.competitiveGaps[0],competitor_url:'https://'}];},'COMPETITIVE_GAP_UNSUPPORTED');
console.log('Growth evidence/render gate: 15 checks passed');
