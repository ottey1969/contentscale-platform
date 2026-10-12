'use strict';
const assert=require('node:assert/strict');
const {prepareVerifiedGrowthWordPressRequest}=require('./growth-wordpress-verified-request.cjs');
const url='https://contentscale.site/page/';
const html='<article class="approved"><h1>Title</h1><p>'+('Original explanation. '.repeat(20))+'</p></article>';
const spy={target_url:url,source_url:'https://competitor.example/article',observed:'Provides an example',improvement:'Add factual example',where_in_draft:'Section 2'};
function db({lockOnRead=Infinity,changeOnRead=Infinity,mappedIds=[42]}={}){
 let pageReads=0,caseReads=0;
 return {query:async(sql)=>{
  if(sql.includes('FROM growth_wordpress_page_mapping')){const e=Error('not migrated');e.code='42P01';throw e;}
  if(sql.includes('FROM content_articles'))return {rows:mappedIds.map(wp_post_id=>({wp_post_id}))};
  if(sql.includes('FROM tracker_pages')){pageReads++;return {rows:[{id:3,tracker_client_id:4,url,html_content:pageReads>=changeOnRead?html+' changed':html}]};}
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:[{tracker_client_id:4,page_id:3,source_page_url:url,evidence_scope:'page_verified',query:'example guide',impressions:80}]};
  if(sql.includes('FROM tracker_case_studies')){caseReads++;return {rows:caseReads>=lockOnRead?[{id:1}]:[]};}
  if(sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return {rows:[]};
  throw Error('Unexpected SQL');
 }};
}
function input(database){return {db:database,pageId:3,clientId:4,searchSpy:[spy],aiSpy:[{...spy,source_url:'https://other.example.org/'}],templateMarkers:['class="approved"'],claims:[],renderProof:{desktop_checked:true,mobile_checked:true},additions:[{approved:true,evidence_ref:'evidence:1',html:'<section><h2>Example</h2><p>Checked example.</p></section>'}],title:'A useful guide',editor_approved:true,authorized:true,currentWordPressHtml:html,fetchFreshWordPressHtml:async()=>({id:42,link:url,status:'publish',modified_gmt:'2026-10-12T08:00:00',content:{raw:'<!-- wp:html -->\n'+html+'\n<!-- /wp:html -->'}}),expectedPageUrl:url};}
(async()=>{
 let result=await prepareVerifiedGrowthWordPressRequest(input(db()));
 assert.equal(result.status,'OFFLINE_REQUEST_ONLY',JSON.stringify(result.issues));
 assert.equal(result.request.status,'draft');
 assert.equal(result.dispatch_allowed,false);
 let readIdentity;
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),fetchFreshWordPressHtml:async args=>{
  readIdentity=args;
  return {id:42,link:url,status:'publish',modified_gmt:'2026-10-12T08:00:00',content:{raw:html}};
 }});
 assert.equal(result.status,'OFFLINE_REQUEST_ONLY');
 assert.equal(readIdentity.postId,42);
 assert.equal(readIdentity.url,url);
 result=await prepareVerifiedGrowthWordPressRequest(input(db({lockOnRead:4})));
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('CASE_STUDY_LOCK'));
 result=await prepareVerifiedGrowthWordPressRequest(input(db({changeOnRead:4})));
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('SOURCE_CHANGED_REVIEW_AGAIN'));
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),freshWordPressHtml:html+' attacker-provided'});
 assert.equal(result.status,'OFFLINE_REQUEST_ONLY');
 assert.equal(result.dispatch_allowed,false);
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),fetchFreshWordPressHtml:undefined});
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('FRESH_WORDPRESS_READER_REQUIRED'));
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),fetchFreshWordPressHtml:async()=>({id:42,link:url,status:'publish',modified_gmt:'2026-10-12T08:00:00',content:{raw:html+' modified'}})});
 assert.equal(result.status,'OFFLINE_REQUEST_ONLY');
 assert.equal(result.wordpress_revision.valid,true);
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),fetchFreshWordPressHtml:async()=>{throw Error('WP unavailable')}});
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('FRESH_WORDPRESS_READ_FAILED'));
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),fetchFreshWordPressHtml:async()=>({id:42,link:'https://other.example/',status:'publish',modified_gmt:'2026-10-12T08:00:00',content:{raw:html}})});
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('FRESH_WORDPRESS_RESPONSE_INVALID'));
 result=await prepareVerifiedGrowthWordPressRequest(input(db({lockOnRead:5})));
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('CASE_STUDY_LOCK'));
 result=await prepareVerifiedGrowthWordPressRequest(input(db({changeOnRead:5})));
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('SOURCE_CHANGED_REVIEW_AGAIN'));
 result=await prepareVerifiedGrowthWordPressRequest(input(db({mappedIds:[]})));
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('CANONICAL_WORDPRESS_POST_ID_LOOKUP_FAILED'));
 result=await prepareVerifiedGrowthWordPressRequest(input(db({mappedIds:[43]})));
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('WORDPRESS_POST_ID_MISMATCH'));
 result=await prepareVerifiedGrowthWordPressRequest(input(db({mappedIds:[42,43]})));
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('CANONICAL_WORDPRESS_POST_ID_LOOKUP_FAILED'));
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),expectedWordPressPostId:999});
 assert.equal(result.status,'OFFLINE_REQUEST_ONLY');
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),fetchFreshWordPressHtml:async()=>({id:42,link:url,status:'publish',modified_gmt:'2026-10-12T08:00:00',content:{raw:'<!doctype html><html><body>'+html+'</body></html>'}})});
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('DIFFERENT_SOURCE_REPRESENTATIONS'));
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),authorized:false});
 assert.equal(result.status,'BLOCKED');
 console.log('PASS: guarded canonical WordPress offline bridge, last-check case study and source changes');
})().catch(err=>{console.error(err);process.exitCode=1});
