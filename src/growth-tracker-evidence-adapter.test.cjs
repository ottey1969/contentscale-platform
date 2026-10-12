'use strict';
const assert=require('node:assert/strict');
const {trackerGrowthReview}=require('./growth-tracker-evidence-adapter.cjs');
const url='https://contentscale.site/content-freshness-tactics/';
const fact={target_url:url,source_url:'https://developers.google.com/search/docs/fundamentals/creating-helpful-content',observed:'Google encourages helpful content',improvement:'Improve reader-first explanation',where_in_draft:'Introduction'};
const base=()=>({page:{id:2352,url,tracker_client_id:12,case_study_active:false},
 gscRows:[{page_id:2352,tracker_client_id:12,source_page_url:url,query:'content freshness',evidence_scope:'page_verified',impressions:120,clicks:2,position:12},
 {page_id:999,tracker_client_id:12,source_page_url:url,query:'unrelated',evidence_scope:'page_verified'}],
 searchSpy:[fact],aiSpy:[{...fact,source_url:'https://example.com/citation'}],
 originalHtml:'<article class="cs-template">original</article>',templateMarkers:['class="cs-template"'],
 draftHtml:'<article class="cs-template"><h1>Content Freshness</h1><p>'+('Useful source-backed content. '.repeat(12))+'</p></article>',
 claims:[],renderProof:{desktop_checked:true,mobile_checked:true}});
let a=trackerGrowthReview(base());
assert.equal(a.ready,true,JSON.stringify(a.issues));
assert.equal(a.query_count,1);
a=trackerGrowthReview({...base(),gscRows:[{page_id:999,query:'wrong',evidence_scope:'page_verified'}]});
assert.equal(a.ready,false);assert(a.issues.some(x=>x.code==='NO_EXACT_PAGE_GSC'));
a=trackerGrowthReview({...base(),page:{id:2352,url,tracker_client_id:12,case_study_active:true}});
assert.equal(a.ready,false);assert(a.issues.some(x=>x.code==='CASE_STUDY_LOCK'));
a=trackerGrowthReview({...base(),aiSpy:undefined});
assert.equal(a.ready,false);assert(a.issues.some(x=>x.code==='AI_SPY_NOT_PROVIDED'));
a=trackerGrowthReview({...base(),draftHtml:'<h1>Missing original template</h1><p>'+('words '.repeat(50))+'</p>'});
assert.equal(a.ready,false);assert(a.issues.some(x=>x.code==='TEMPLATE_NOT_PRESERVED'));
a=trackerGrowthReview({...base(),gscRows:[{page_id:2352,source_page_url:'https://contentscale.site/another-page/',query:'wrong landing page',evidence_scope:'page_verified'}]});
assert.equal(a.ready,false);assert(a.issues.some(x=>x.code==='NO_EXACT_PAGE_GSC'));
a=trackerGrowthReview({...base(),page:{id:0,url,tracker_client_id:12,case_study_active:false}});
assert.equal(a.ready,false);assert(a.issues.some(x=>x.code==='TRACKER_PAGE_INVALID'));
a=trackerGrowthReview({...base(),page:{id:2352,url,tracker_client_id:12,gsc_query_evidence_status:'exact_page_fetch_zero_queries',gsc_autofetch_checked_at:'2026-10-12T01:00:00Z'},gscRows:[]});
assert.equal(a.ready,false);assert.equal(a.status,'BLOCKED_VERIFIED_ZERO_QUERIES');
assert.equal(a.gsc_query_evidence_status,'exact_page_fetch_zero_queries');
a=trackerGrowthReview({...base(),page:{id:2352,url,tracker_client_id:12,case_study_active:true,gsc_query_evidence_status:'exact_page_fetch_zero_queries',gsc_autofetch_checked_at:'2026-10-12T01:00:00Z'},gscRows:[]});
assert.equal(a.status,'BLOCKED_CASE_STUDY');
assert(a.issues.some(x=>x.code==='CASE_STUDY_LOCK'));
assert.equal(a.gsc_query_evidence_status,'exact_page_fetch_zero_queries');
a=trackerGrowthReview({...base(),gscRows:[]});
assert.equal(a.gsc_query_evidence_status,'not_verified');
a=trackerGrowthReview({...base(),gscRows:[{page_id:2352,tracker_client_id:99,source_page_url:url,query:'another client',evidence_scope:'page_verified'}]});
assert.equal(a.query_count,0);
a=trackerGrowthReview({...base(),gscRows:[{page_id:2352,tracker_client_id:12,source_page_url:'https://contentscale.site/different/',query:'different page',evidence_scope:'page_verified'}]});
assert.equal(a.query_count,0);
console.log('PASS: canonical client/page/source URL evidence adapter; 12 cases');
