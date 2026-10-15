'use strict';
const assert=require('node:assert/strict');
const {prepareGrowthWordPressHandoff}=require('./growth-wordpress-preparation.cjs');
const url='https://contentscale.site/page/';
const html='<article class="approved"><h1>Title</h1><p>'+('Original explanation. '.repeat(20))+'</p></article>';
const spy={target_url:url,source_url:'https://competitor.example/article',observed:'Provides an example',improvement:'Add factual example',where_in_draft:'Section 2'};
function db(){return {query:async sql=>{
 if(sql.includes('FROM tracker_pages'))return {rows:[{id:3,tracker_client_id:4,url,html_content:html}]};
 if(sql.includes('FROM tracker_gsc_queries'))return {rows:[{tracker_client_id:4,page_id:3,source_page_url:url,evidence_scope:'page_verified',query:'example guide',impressions:80}]};
 if(sql.includes('FROM tracker_case_studies'))return {rows:[]};
 if(sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return {rows:[]};
 throw Error('Unexpected SQL');
}};}
const base=()=>({db:db(),pageId:3,clientId:4,searchSpy:[spy],aiSpy:[{...spy,source_url:'https://other.example.org/'}],templateMarkers:['class="approved"'],claims:[],renderProof:{desktop_checked:true,mobile_checked:true},additions:[{approved:true,evidence_ref:'evidence:1',html:'<section><h2>Example</h2><p>This documented example explains a specific roof assessment and why the corresponding repair is appropriate.</p></section>'}],title:'A useful guide',editor_approved:true,authorized:true,currentWordPressHtml:html,expectedPageUrl:url});
(async()=>{
 let r=await prepareGrowthWordPressHandoff(base());
 assert.equal(r.status,'SAFE_TO_PASS_TO_EXISTING_DRAFT_HANDLER',JSON.stringify(r.issues));
 assert.equal(r.payload.status,'draft');
 assert.equal(r.publication_allowed,false);
 r=await prepareGrowthWordPressHandoff({...base(),currentWordPressHtml:html+' changed'});
 assert(r.issues.includes('SOURCE_CHANGED_REVIEW_AGAIN'));
 r=await prepareGrowthWordPressHandoff({...base(),editor_approved:false});
 assert.equal(r.stage,'EDITOR_APPROVAL');
 r=await prepareGrowthWordPressHandoff({...base(),authorized:false});
 assert(r.issues.includes('WRITE_AUTHORIZATION_REQUIRED'));
 let pageFetches=0;
 const changingDb={query:async(sql)=>{
  if(sql.includes('FROM tracker_pages')){pageFetches++;return {rows:[{id:3,tracker_client_id:4,url,html_content:pageFetches>=3?html+' changed':html}]};}
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:[{tracker_client_id:4,page_id:3,source_page_url:url,evidence_scope:'page_verified',query:'example guide',impressions:80}]};
  if(sql.includes('FROM tracker_case_studies')||sql.includes('FROM tracker_ai_evidence')||sql.includes('FROM tracker_snapshots'))return {rows:[]};
  throw Error('Unexpected SQL');
 }};
 r=await prepareGrowthWordPressHandoff({...base(),db:changingDb});
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.stage,'SOURCE_FRESHNESS');
 assert(r.issues.includes('SOURCE_CHANGED_REVIEW_AGAIN'));
 console.log('PASS: canonical Growth preparation -> editor approval -> stale-source handoff');
})().catch(e=>{console.error(e);process.exitCode=1});
