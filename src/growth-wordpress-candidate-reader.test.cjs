'use strict';
const assert=require('node:assert/strict');
const {createGrowthWordPressCandidateReader}=require('./growth-wordpress-candidate-reader.cjs');
const siteUrl='https://contentscale.site/',url=siteUrl+'example/';
const post={id:81,link:url,status:'publish',modified_gmt:'2026-10-12T10:00:00',content:{raw:'<p>Verified raw WP content</p>'}};
(async()=>{
 const calls=[];
 const read=createGrowthWordPressCandidateReader({siteUrl,username:'editor',applicationPassword:'test',
 fetchImpl:async(endpoint,options)=>{
  calls.push([endpoint,options]);
  assert.equal(options.redirect,'error');assert.equal(options.method,'GET');
  return{ok:true,json:async()=>endpoint.includes('/posts?')?[post]:[]};
 }});
 const match=await read({url});
 assert.equal(match.post_id,81);assert.equal(match.raw_sha256.length,64);
 assert.equal(calls.length,2);
 assert(calls[0][0].includes('context=edit'));
 const ambiguous=createGrowthWordPressCandidateReader({siteUrl,username:'u',applicationPassword:'p',fetchImpl:async()=>({ok:true,json:async()=>[post]})});
 await assert.rejects(ambiguous({url}),/AMBIGUOUS_WORDPRESS_POST/);
 const missing=createGrowthWordPressCandidateReader({siteUrl,username:'u',applicationPassword:'p',fetchImpl:async()=>({ok:true,json:async()=>[]})});
 await assert.rejects(missing({url}),/NO_EXACT_WORDPRESS_POST/);
 await assert.rejects(read({url:'https://other.test/example/'}),/WORDPRESS_TARGET_DOMAIN_MISMATCH/);
 const changed=createGrowthWordPressCandidateReader({siteUrl,username:'u',applicationPassword:'p',fetchImpl:async()=>({ok:true,json:async()=>[{...post,content:{rendered:'<p>No edit raw</p>'}}]})});
 await assert.rejects(changed({url}),/WORDPRESS_CANDIDATE_RAW_NOT_VERIFIABLE/);
 console.log('PASS: authenticated unique post/page discovery with strict raw revision');
})().catch(e=>{console.error(e);process.exitCode=1});
