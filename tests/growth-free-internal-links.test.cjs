'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveFreeCmsLink,verifyFreeCmsSuggestions}=require('../src/growth-free/internal-links.cjs');
const home='https://example.com/emergency-roof/';
const stub=async url=>url.endsWith('/old/')?
 {status:'RESOLVED_REDIRECT',url:'https://example.com/new/',redirected:true,redirect_chain:[{status:301}]}:
 url.endsWith('/direct/')?
 {status:'DIRECT_200',url:'https://example.com/direct/',redirected:false}:
 url.endsWith('/missing/')?{status:'NOT_200',url:null}:
 {status:'REDIRECTED_OFF_SITE',url:null};
test('Free Growth only offers final live 200 destinations after redirect verification',async()=>{
 const got=await verifyFreeCmsSuggestions({
  internal_links:[{url:'https://example.com/old/',label:'Old'},{url:'https://example.com/direct/',label:'Direct'},
   {url:'https://example.com/missing/',label:'Missing'},{url:'https://example.com/offsite/',label:'Wrong site'}],
  suggested_link:{url:'https://example.com/old/',label:'Emergency services',reason:'OFFER_PAGE'}
 },{pageUrl:home,resolve:stub});
 assert.deepEqual(got.internal_links.map(x=>x.url),['https://example.com/new/','https://example.com/direct/']);
 assert.equal(got.internal_links[0].redirect_resolved,true);
 assert.equal(got.suggested_link.url,'https://example.com/new/');
});
test('Free Growth has no suggested link when a redirect target cannot be verified',async()=>{
 const got=await verifyFreeCmsSuggestions({internal_links:[{url:'https://example.com/missing/',label:'Bad'}],
  suggested_link:{url:'https://example.com/missing/',label:'Bad'}},{pageUrl:home,resolve:stub});
 assert.deepEqual(got.internal_links,[]);assert.equal(got.suggested_link,null);
});
test('CMS link verification rejects unverified pages and preserves a resolved destination',async()=>{
 assert.equal((await resolveFreeCmsLink('https://example.com/missing/',home,{resolve:stub})).url,null);
 assert.equal((await resolveFreeCmsLink('https://example.com/old/',home,{resolve:stub})).url,'https://example.com/new/');
});
