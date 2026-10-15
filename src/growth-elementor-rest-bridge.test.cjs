'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createGrowthElementorRestBridge}=require('./growth-elementor-rest-bridge.cjs');
const {prepareGrowthElementorDraft}=require('./growth-elementor-draft.cjs');
const {executeGrowthElementorDraft}=require('./growth-elementor-draft-executor.cjs');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const originalHtml='<article><h1>Service in NJ</h1><p>Existing builder copy and images.</p><img src="/roof.png" alt="Real roof"></article>';
const original=JSON.stringify([{id:'outer',elType:'container',settings:{color:'#fff'},elements:[
 {id:'copy',elType:'widget',widgetType:'html',settings:{html:originalHtml}},
 {id:'original-image',elType:'widget',widgetType:'image',settings:{image:{url:'/old.jpg'}}}
]}]);
const candidate=prepareGrowthElementorDraft({sourceJson:original,sourceSha256:sha(original),approved:true,
 edits:[{widget_id:'copy',before:'Existing builder copy and images.',
 after:'Existing builder copy and images. Roof leak repair and flashing assessment requests are welcome.',
 approved:true,evidence_ref:'verified-gsc-intent'}]});
assert.equal(candidate.status,'DRAFT_FOR_REVIEW');
const canonicalPost={id:2204,type:'pages',status:'publish',elementor_edit_mode:'builder',elementor_data:original};
const writes=[];
let draft=null,simulateAbsent=false;
const bridge=createGrowthElementorRestBridge({siteUrl:'https://synthetic.example/',username:'editor',
 applicationPassword:'app-password-test',fetchImpl:async(url,options)=>{
  const path=url.split('/wp-json/contentscale-growth/v1/elementor')[1];
  assert(options.headers.Authorization.startsWith('Basic '));
  assert.equal(options.redirect,'error');
  if(simulateAbsent)return {ok:false,status:404,json:async()=>({})};
  let body=options.body?JSON.parse(options.body):null,result;
  if(options.method==='GET'&&path==='/source/2204')result=canonicalPost;
  else if(options.method==='POST'&&path==='/draft'){
   assert.equal(body.source_id,2204);assert.equal(body.source_sha256,sha(original));
   draft={id:9001,type:'pages',status:'draft',source_post_id:2204,elementor_edit_mode:'builder',elementor_data:original};
   writes.push('create-draft');
   result={id:9001,type:'pages',status:'draft'};
  }else if(options.method==='POST'&&path==='/draft/9001/meta'){
   assert.equal(body.candidate_sha256,sha(body.elementor_data));
   writes.push('write-draft-meta');
   draft.elementor_data=body.elementor_data;
   result={id:9001,type:'pages',status:'draft',candidate_sha256:sha(draft.elementor_data)};
  }else if(options.method==='GET'&&path==='/draft/9001')result=draft;
  else throw Error('Unknown bridge route '+path);
  return {ok:true,status:200,json:async()=>result};
 }});
(async()=>{
 const originalPost=await bridge.readOriginalPost({id:2204,type:'pages'});
 assert.equal(originalPost.elementor_data,original);
 const result=await executeGrowthElementorDraft({approvedCandidate:candidate,
  sourcePostId:2204,sourcePostType:'pages',
  readOriginalPost:bridge.readOriginalPost,
  checkCanonicalState:async()=>({case_study_active:false,allow_draft:true,wordpress_post_id:2204}),
  createDraft:bridge.createDraft,writeDraftElementorMeta:bridge.writeDraftElementorMeta,
  readDraft:bridge.readDraft});
 assert.equal(result.status,'ELEMENTOR_DRAFT_VERIFIED',JSON.stringify(result));
 assert.equal(result.published,false);
 assert.equal(result.draft.id,9001);
 assert.deepEqual(writes,['create-draft','write-draft-meta']);
 assert.equal(canonicalPost.elementor_data,original,'published source must remain unchanged');
 assert.equal(JSON.parse(draft.elementor_data)[0].elements[1].settings.image.url,'/old.jpg');
 assert.equal(bridge.publishedOverwriteAllowed,false);
 simulateAbsent=true;
 await assert.rejects(()=>bridge.readOriginalPost({id:2204,type:'pages'}),/ELEMENTOR_BRIDGE_NOT_INSTALLED/);
 assert.throws(()=>createGrowthElementorRestBridge({siteUrl:'http://synthetic.example/',username:'u',applicationPassword:'p'}),/WORDPRESS_SITE_CONFIGURATION_REQUIRED/);
 console.log('PASS: authenticated WordPress REST bridge to Elementor draft verified; plugin-missing fails closed; live page unchanged');
})().catch(e=>{console.error(e);process.exitCode=1});
