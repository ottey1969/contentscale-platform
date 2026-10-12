'use strict';
const assert=require('node:assert/strict');
const {reviewCanonicalGrowthDraft}=require('./growth-canonical-review.cjs');
const url='https://contentscale.site/example/';
const markup='<article class="approved"><h1>Example</h1><p>'+('Useful and checked explanation. '.repeat(12))+'</p></article>';
const observation={target_url:url,source_url:'https://example.org/competitor/',observed:'Missing examples',improvement:'Add useful verified examples',where_in_draft:'Body'};
function database({locked=false}={}){
 return {query:async sql=>{
  if(sql.includes('FROM tracker_pages'))return {rows:[{id:7,tracker_client_id:2,url,html_content:'<article class="approved">Original</article>'}]};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:[{page_id:7,tracker_client_id:2,source_page_url:url,evidence_scope:'page_verified',query:'example',impressions:80,clicks:2}]};
  if(sql.includes('FROM tracker_case_studies'))return {rows:locked?[{id:1}]:[]};
  if(sql.includes('FROM tracker_ai_evidence'))return {rows:[{page_id:7,tracker_client_id:2,engine:'chatgpt',evidence_method:'manual',brand_recommended:false,domain_cited:true,exact_page_cited:false,citation_urls:['https://example.org/'],verified_at:'2026-10-10T00:00:00Z',revision_cycle:1}]};
  throw new Error('unexpected');
 }};
}
const base=()=>({db:database(),pageId:7,clientId:2,searchSpy:[observation],aiSpy:[{...observation,source_url:'https://other.example.net/citation'}],draftHtml:markup,templateMarkers:['class="approved"'],claims:[],renderProof:{desktop_checked:true,mobile_checked:true}});
(async()=>{
 let result=await reviewCanonicalGrowthDraft(base());
 assert.equal(result.ready,true,JSON.stringify(result.issues));
 assert.equal(result.query_count,1);
 assert.equal(result.opportunity_plan.actions.length,1);
 assert.equal(result.ai_visibility.engines.length,1);
 assert.equal(result.ai_visibility.engines[0].domain_cited,true);
 assert.equal(result.ai_visibility.competitor_gaps_verified,false);
 assert.equal(result.opportunity_plan.automatic_draft_allowed,false);
 result=await reviewCanonicalGrowthDraft({...base(),db:database({locked:true})});
 assert.equal(result.status,'BLOCKED_CASE_STUDY');
 result=await reviewCanonicalGrowthDraft({...base(),searchSpy:undefined});
 assert.equal(result.ready,false);
 assert(result.issues.some(x=>x.code==='SEARCH_SPY_NOT_PROVIDED'));
 result=await reviewCanonicalGrowthDraft({...base(),draftHtml:'<article>Missing approved structure</article>'});
 assert(result.issues.some(x=>x.code==='TEMPLATE_NOT_PRESERVED'));
 console.log('PASS: read-only Growth canonical loader -> evidence adapter -> render review; 5 assertions');
})().catch(e=>{console.error(e);process.exitCode=1});
