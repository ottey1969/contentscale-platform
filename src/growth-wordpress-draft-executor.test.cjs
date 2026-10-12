'use strict';
const assert=require('node:assert/strict');
const {fingerprintWordPressRevision}=require('./growth-wordpress-revision.cjs');
const {executeGrowthWordPressDraft}=require('./growth-wordpress-draft-executor.cjs');
const url='https://contentscale.site/article/';
const post={id:71,link:url,status:'publish',modified_gmt:'2026-10-12T09:00:00',content:{raw:'<p>Original</p>'}};
const sourceRevision=fingerprintWordPressRevision(post,url);
const offlineRequest={status:'OFFLINE_REQUEST_ONLY',dispatch_allowed:false,publication_allowed:false,
 request:{status:'draft',title:'Growth article',content:'<p>Fact checked draft</p>'},
 source_precondition:{sha256:'abc',url},wordpress_revision:sourceRevision};
const input=(more={})=>({authorized:true,editor_approved:true,offlineRequest,sourceRevision,
 readWordPressPost:async()=>post,
 checkCanonicalState:async()=>({case_study_active:false,url,source_sha256:'abc',allowed_to_draft:true}),
 createWordPressDraft:async payload=>({id:81,status:payload.status,link:'https://contentscale.site/?p=81'}),
 ...more});
(async()=>{
 let writes=0;
 let result=await executeGrowthWordPressDraft(input({createWordPressDraft:async()=>{writes++;return{id:81,status:'draft'};}}));
 assert.equal(result.status,'DRY_RUN_VALIDATED');assert.equal(writes,0);
 result=await executeGrowthWordPressDraft(input({dryRun:false,createWordPressDraft:async payload=>{writes++;assert.equal(payload.status,'draft');return{id:81,status:'draft'};}}));
 assert.equal(result.status,'DRAFT_CREATED');assert.equal(writes,1);assert.equal(result.published,false);
 result=await executeGrowthWordPressDraft(input({dryRun:false,readWordPressPost:async()=>({...post,content:{raw:'changed'}})}));
 assert(result.issues.includes('WORDPRESS_CONTENT_CHANGED'));
 result=await executeGrowthWordPressDraft(input({dryRun:false,checkCanonicalState:async()=>({case_study_active:true,url,source_sha256:'abc',allowed_to_draft:true})}));
 assert(result.issues.includes('CANONICAL_STATE_CHANGED_OR_NOT_AUTHORIZED'));
 result=await executeGrowthWordPressDraft(input({dryRun:false,authorized:false}));
 assert(result.issues.includes('EDITOR_AUTHORIZATION_REQUIRED'));
 result=await executeGrowthWordPressDraft(input({dryRun:false,createWordPressDraft:async()=>({id:71,status:'publish'})}));
 assert(result.issues.includes('WORDPRESS_DRAFT_RESPONSE_NOT_VERIFIED'));
 assert.equal(writes,1);
 console.log('PASS: dry-run default, separate draft creation, publish denial and source-revision gates');
})().catch(err=>{console.error(err);process.exitCode=1});
