'use strict';
const assert=require('node:assert/strict');
const {createGrowthWordPressDraftTransport}=require('./growth-wordpress-draft-transport.cjs');
(async()=>{
 let calls=0;
 const write=createGrowthWordPressDraftTransport({siteUrl:'https://contentscale.site/',username:'editor',applicationPassword:'secret',
  fetchImpl:async(url,options)=>{
   calls++;assert.equal(url,'https://contentscale.site/wp-json/wp/v2/posts');
   assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
   assert.equal(JSON.parse(options.body).status,'draft');
   assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(),['content','status','title']);
   return {ok:true,json:async()=>({id:88,status:'draft',link:'https://contentscale.site/?p=88'})};
  }});
 const created=await write({title:'Approved draft',content:'<p>Review me</p>',status:'draft'});
 assert.equal(created.id,88);assert.equal(calls,1);
 for(const payload of [
  {title:'Bad',content:'<p>text</p>',status:'publish'},
  {title:'Bad',content:'<p>text</p>',status:'draft',id:839},
  {title:'',content:'<p>text</p>',status:'draft'}
 ])await assert.rejects(write(payload),/DRAFT_ONLY_PAYLOAD_REQUIRED/);
 assert.equal(calls,1);
 const badResponse=createGrowthWordPressDraftTransport({siteUrl:'https://contentscale.site/',username:'u',applicationPassword:'p',
  fetchImpl:async()=>({ok:true,json:async()=>({id:77,status:'publish'})})});
 await assert.rejects(badResponse({title:'Title',content:'<p>Content</p>',status:'draft'}),/WORDPRESS_DRAFT_RESPONSE_NOT_VERIFIED/);
 const writePage=createGrowthWordPressDraftTransport({siteUrl:'https://contentscale.site/',postType:'pages',username:'editor',applicationPassword:'safe-test',
  fetchImpl:async(url,options)=>{
   assert.equal(url,'https://contentscale.site/wp-json/wp/v2/pages');
   assert.equal(JSON.parse(options.body).status,'draft');
   return {ok:true,json:async()=>({id:3269,status:'draft',link:'https://contentscale.site/?page_id=3269'})};
  }});
 const pageResult=await writePage({status:'draft',title:'Existing service page improvement',content:'<h1>Roofing</h1>'});
 assert.equal(pageResult.status,'draft');
 assert.throws(()=>createGrowthWordPressDraftTransport({siteUrl:'https://contentscale.site/',postType:'some_custom_type',username:'u',applicationPassword:'p'}),/WORDPRESS_POST_TYPE_REVIEW_REQUIRED/);
 console.log('PASS: WordPress draft REST transport, published status and overwrite IDs rejected');
})().catch(err=>{console.error(err);process.exitCode=1});
