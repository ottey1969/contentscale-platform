'use strict';
const assert=require('node:assert/strict');
const {prepareVerifiedGrowthWordPressRequest}=require('./growth-wordpress-verified-request.cjs');
const url='https://contentscale.site/page/';
const html='<article class="approved"><h1>Title</h1><p>'+('Original explanation. '.repeat(20))+'</p></article>';
const spy={target_url:url,source_url:'https://competitor.example/article',observed:'Provides an example',improvement:'Add factual example',where_in_draft:'Section 2'};
function db({lockOnRead=Infinity,changeOnRead=Infinity}={}){
 let pageReads=0,caseReads=0;
 return {query:async(sql)=>{
  if(sql.includes('FROM tracker_pages')){pageReads++;return {rows:[{id:3,tracker_client_id:4,url,html_content:pageReads>=changeOnRead?html+' changed':html}]};}
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:[{tracker_client_id:4,page_id:3,source_page_url:url,evidence_scope:'page_verified',query:'example guide',impressions:80}]};
  if(sql.includes('FROM tracker_case_studies')){caseReads++;return {rows:caseReads>=lockOnRead?[{id:1}]:[]};}
  if(sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return {rows:[]};
  throw Error('Unexpected SQL');
 }};
}
function input(database){return {db:database,pageId:3,clientId:4,searchSpy:[spy],aiSpy:[{...spy,source_url:'https://other.example.org/'}],templateMarkers:['class="approved"'],claims:[],renderProof:{desktop_checked:true,mobile_checked:true},additions:[{approved:true,evidence_ref:'evidence:1',html:'<section><h2>Example</h2><p>Checked example.</p></section>'}],title:'A useful guide',editor_approved:true,authorized:true,currentWordPressHtml:html,expectedPageUrl:url};}
(async()=>{
 let result=await prepareVerifiedGrowthWordPressRequest(input(db()));
 assert.equal(result.status,'OFFLINE_REQUEST_ONLY',JSON.stringify(result.issues));
 assert.equal(result.request.status,'draft');
 assert.equal(result.dispatch_allowed,false);
 result=await prepareVerifiedGrowthWordPressRequest(input(db({lockOnRead:4})));
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('CASE_STUDY_LOCK'));
 result=await prepareVerifiedGrowthWordPressRequest(input(db({changeOnRead:4})));
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('SOURCE_CHANGED_REVIEW_AGAIN'));
 result=await prepareVerifiedGrowthWordPressRequest({...input(db()),authorized:false});
 assert.equal(result.status,'BLOCKED');
 console.log('PASS: guarded canonical WordPress offline bridge, last-check case study and source changes');
})().catch(err=>{console.error(err);process.exitCode=1});
