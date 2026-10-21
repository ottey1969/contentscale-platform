'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {needsGrowthRender,renderPublicGrowthPage}=require('../src/growth-safe-browser-renderer.cjs');
test('real-like incomplete page requires render; substantive SSR page does not',()=>{
 assert.equal(needsGrowthRender('<html><body><h2>Page</h2><p>Short body</p></body></html>'),true);
 assert.equal(needsGrowthRender('<html><body><h1>International SEO</h1><p>'+('How international SEO works with hreflang for country and language targeting. ').repeat(25)+'</p></body></html>'),false);
});
test('renderer cannot navigate to an internal IP and never launches Chromium for it',async()=>{
 let launches=0;
 const r=await renderPublicGrowthPage('https://roof.example/',{
  lookup:async()=>[{address:'127.0.0.1'}],
  puppeteer:{launch:async()=>{launches++;throw Error('must not launch')}}
 });
 assert.equal(r.status,'PUBLIC_IPV4_UNAVAILABLE');
 assert.equal(launches,0);
});
test('fallback pins verified DNS, blocks cross-origin browser subrequests and closes browser',async()=>{
 let onRequest,closed=false,blocked=false,allowed=false,pinned=false;
 const url='https://roof.example/leak/';
 const puppeteer={launch:async args=>{
  pinned=args.args.some(x=>x.includes('--host-resolver-rules=MAP roof.example 8.8.8.8'));
  return {newPage:async()=>({
   setRequestInterception:async()=>{},
   on:(name,fn)=>{if(name==='request')onRequest=fn},
   goto:async()=>{
    onRequest({url:()=>url,continue:()=>{allowed=true},abort:()=>{throw Error('should allow own URL')}});
    onRequest({url:()=> 'https://127.0.0.1/admin',continue:()=>{throw Error('private allowed')},abort:()=>{blocked=true}});
   },
   content:async()=>'<html><body><h1>Roof Leak Repair</h1><p>'+('Document the observed roof damage. ').repeat(30)+'</p></body></html>',
   url:()=>url
  }),close:async()=>{closed=true}};
 }};
 const r=await renderPublicGrowthPage(url,{lookup:async()=>[{address:'8.8.8.8'}],puppeteer,timeoutMs:1500});
 assert.equal(r.status,'BROWSER_RENDERED_SAME_ORIGIN');
 assert.equal(r.live.final_url,url);
 assert.equal(pinned,true);assert.equal(allowed,true);assert.equal(blocked,true);assert.equal(closed,true);
});
