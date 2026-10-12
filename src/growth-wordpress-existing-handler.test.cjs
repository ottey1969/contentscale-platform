'use strict';
const assert=require('node:assert/strict');
const {growthWordPressHandoff}=require('./growth-wordpress-handoff.cjs');
const {toExistingWordPressDraftRequest}=require('./growth-wordpress-existing-handler.cjs');
const html='<article><p>Original</p></article>',url='https://contentscale.site/test/';
const handoff=growthWordPressHandoff({draftPayload:{status:'OFFLINE_WORDPRESS_DRAFT_PAYLOAD',dispatch_allowed:false,payload:{title:'Article',content:html,status:'draft'}},originalHtml:html,currentHtml:html,sourcePageUrl:url,expectedPageUrl:url,authorized:true});
const writeContext={authorized:true,currentHtml:html,currentUrl:url,caseStudyLocked:false};
let r=toExistingWordPressDraftRequest(handoff,writeContext);
assert.equal(r.status,'OFFLINE_REQUEST_ONLY');
assert.equal(r.request.status,'draft');
assert(r.request.content.startsWith('<!-- wp:html -->'));
assert(r.request.content.includes(html));
assert.equal(r.expected_internal_status,'draft');
assert.equal(r.dispatch_allowed,false);
assert(r.handler_caveat.includes('not this payload'));
r=toExistingWordPressDraftRequest({...handoff,write_boundary_revalidation_required:false},writeContext);
assert.equal(r.status,'BLOCKED');
r=toExistingWordPressDraftRequest({...handoff,payload:{...handoff.payload,status:'publish'}},writeContext);
assert(r.issues.includes('WORDPRESS_DRAFT_CONTENT_REQUIRED'));
for(const [label,context,expected] of [
 ['unauthorized',{...writeContext,authorized:false},'WRITE_AUTHORIZATION_REQUIRED'],
 ['changed source',{...writeContext,currentHtml:'<article>changed</article>'},'SOURCE_CHANGED_REVIEW_AGAIN'],
 ['wrong URL',{...writeContext,currentUrl:'https://contentscale.site/other/'},'PAGE_IDENTITY_MISMATCH'],
 ['locked case study',{...writeContext,caseStudyLocked:true},'CASE_STUDY_STATE_NOT_VERIFIED_UNLOCKED'],
 ['unknown case study',{...writeContext,caseStudyLocked:undefined},'CASE_STUDY_STATE_NOT_VERIFIED_UNLOCKED'],
 ['missing write context',{},'WRITE_AUTHORIZATION_REQUIRED']]){
 const blocked=toExistingWordPressDraftRequest(handoff,context);
 assert.equal(blocked.status,'BLOCKED',label);
 assert.equal(blocked.dispatch_allowed,false,label);
 assert(blocked.issues.includes(expected),label);
}
console.log('PASS: exact existing WP draft HTML block convention; no published state or write');
