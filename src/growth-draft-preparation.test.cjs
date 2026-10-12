'use strict';
const assert=require('node:assert/strict');
const {prepareCanonicalGrowthDraft}=require('./growth-draft-preparation.cjs');
const url='https://contentscale.site/page/';
const original='<article class="approved"><h1>Title</h1><p>'+('Original explanation. '.repeat(20))+'</p><img src="/original.jpg" alt="Original"></article>';
const spy={target_url:url,source_url:'https://example.org/guide',observed:'Competitor has a FAQ',improvement:'Add an accurate FAQ',where_in_draft:'FAQ'};
function db(locked=false){return {query:async sql=>{
 if(sql.includes('FROM tracker_pages'))return {rows:[{id:3,tracker_client_id:4,url,html_content:original}]};
 if(sql.includes('FROM tracker_gsc_queries'))return {rows:[{tracker_client_id:4,page_id:3,source_page_url:url,evidence_scope:'page_verified',query:'example guide',impressions:80}]};
 if(sql.includes('FROM tracker_case_studies'))return {rows:locked?[{id:2}]:[]};
 if(sql.includes('FROM tracker_ai_evidence'))return {rows:[]};
 if(sql.includes('FROM tracker_snapshots'))return {rows:[]};
 throw new Error('Unexpected query');
}};}
(async()=>{
 const input={db:db(),pageId:3,clientId:4,searchSpy:[spy],aiSpy:[{...spy,source_url:'https://elsewhere.org/'}],templateMarkers:['class="approved"'],claims:[],renderProof:{mobile_checked:true,desktop_checked:true},additions:[{approved:true,evidence_ref:'review:1',html:'<section><h2>FAQ</h2><p>Verified information.</p></section>'}]};
 let result=await prepareCanonicalGrowthDraft(input);
 assert.equal(result.status,'READY_FOR_HUMAN_REVIEW',JSON.stringify(result.review?.issues));
 assert(result.assembly.html.includes('<img src="/original.jpg"'));
 assert.equal(result.publication_allowed,false);
 result=await prepareCanonicalGrowthDraft({...input,db:db(true)});
 assert.equal(result.status,'BLOCKED');assert.equal(result.review,null);
 result=await prepareCanonicalGrowthDraft({...input,additions:[]});
 assert.equal(result.status,'BLOCKED');
 result=await prepareCanonicalGrowthDraft({...input,expectedSourceHtml:'<article>outdated</article>'});
 assert.equal(result.status,'BLOCKED');
 assert(result.issues.includes('SOURCE_CHANGED_REVIEW_AGAIN'));
 console.log('PASS: assembled Growth draft is reviewed and never auto-published');
})().catch(e=>{console.error(e);process.exitCode=1});
