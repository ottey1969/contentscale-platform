'use strict';
const assert=require('node:assert/strict');
const {createGuardedGrowthDraft}=require('./growth-wordpress-draft-writer.cjs');
const {fingerprintWordPressRevision}=require('./growth-wordpress-revision.cjs');
const {createHash}=require('node:crypto');
const url='https://contentscale.site/example/',html='<article>Verified source text</article>';
const post={id:42,link:url,status:'publish',modified_gmt:'2026-10-12T08:00:00',content:{raw:html}};
const pre={url,sha256:createHash('sha256').update(html).digest('hex')};
const approvedHandoff={status:'OFFLINE_REQUEST_ONLY',dispatch_allowed:false,
 request:{status:'draft',title:'Updated editorial draft',content:'<article>Reviewed new draft</article>'},
 source_precondition:pre,wordpress_source:{post_id:42},wordpress_revision:fingerprintWordPressRevision(post,url)};
function setup({locked=false,changed=false,live=post,authorized=true,writeStatus='draft'}={}){
 let writes=0; const db={query:async(sql)=>{
 if(sql.includes('FROM tracker_pages'))return {rows:[{id:7,tracker_client_id:2,url,html_content:changed?'changed':html}]};
 if(sql.includes('FROM tracker_case_studies'))return {rows:locked?[{id:1}]:[]};
 return {rows:[]};
 }};
 const input={db,pageId:7,clientId:2,authorization:authorized,approvedHandoff,
 readOriginalPost:async()=>live,createDraft:async payload=>{writes++;assert.equal(payload.status,'draft');return {id:103,status:writeStatus};}};
 return {input,writes:()=>writes};
}
(async()=>{
 let s=setup();let r=await createGuardedGrowthDraft(s.input);
 assert.equal(r.status,'DRAFT_CREATED');assert.equal(s.writes(),1);assert.equal(r.draft.id,103);
 for(const variation of [
 {locked:true},{changed:true},{authorized:false},
 {live:{...post,modified_gmt:'2026-10-12T09:00:00'}},
 {live:{...post,content:{raw:'Changed text'}}},
 {writeStatus:'publish'}
 ]){s=setup(variation);r=await createGuardedGrowthDraft(s.input);
 if(variation.writeStatus==='publish')assert.equal(r.status,'BLOCKED');
 else {assert.equal(r.status,'BLOCKED');assert.equal(s.writes(),0);}
 }
 console.log('PASS: creates draft only with approval, unchanged revision and unlocked Tracker state');
})().catch(e=>{console.error(e);process.exitCode=1});
