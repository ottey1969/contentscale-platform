'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {registerLeadCrawlerSerpApi,njScope,mapBusiness}=require('./lead-crawler-serpapi.cjs');
assert.deepEqual(njScope('New Jersey','USA'),{location:'New Jersey',town:''});
assert.deepEqual(njScope('Newark, New Jersey','USA'),{location:'Newark, New Jersey',town:'Newark'});
assert.equal(njScope('New York','USA'),null);
assert.equal(njScope('New Jersey','Netherlands'),null);
const roofing={title:'Actual Roofing LLC',website:'https://roofing-example.test/about',phone:'(555) 123-4567',address:'25 Main St, Newark, NJ 07102',type:'Roofing contractor'};
const result=mapBusiness(roofing,{town:'Newark'});
assert.equal(result.website,'https://roofing-example.test/');
assert.equal(result.estimated_pages,null);
assert.equal(result.page_count_status,'needs_website_audit');
assert.equal(result.email,'');
assert.equal(mapBusiness({...roofing,address:'Brooklyn, NY'},{town:''}),null);
assert.equal(mapBusiness({...roofing,website:'https://yelp.com/biz/example'},{town:''}),null);
assert.equal(mapBusiness({...roofing,phone:''},{town:''}),null);
const routes={};const app={post:(path,handler)=>{routes[path]=handler;}};
let calls=0;
registerLeadCrawlerSerpApi(app,{apiKey:()=> 'mock-key',auth:req=>req.get('x-admin-code')==='admin',
  fetchImpl:async(url)=>{calls++;const parsed=new URL(url);assert.equal(parsed.searchParams.get('engine'),'google_maps');
    assert.equal(parsed.searchParams.get('q'),'roofing businesses in Newark, New Jersey, USA');
    return {ok:true,json:async()=>({local_results:[roofing,{...roofing,address:'Brooklyn, NY'},{...roofing,title:'Duplicate Listing'}]})};}});
async function invoke(req){let status=200,json;const res={status(n){status=n;return this;},json(v){json=v;return this;}};await routes['/api/lead-crawler/verified-nj-search'](req,res);return{status,json};}
async function main(){
 const input={city:'Newark, New Jersey',country:'USA',niche:'roofing',industry_id:'roofing'};
 const req=(code='admin',body=input)=>({body,get:()=>code});
 let x=await invoke(req('wrong'));assert.equal(x.status,403);assert.equal(calls,0);
 x=await invoke(req());assert.equal(x.status,200);assert.equal(x.json.leads.length,1);
 assert.equal(x.json.leads[0].estimated_pages,null);
 assert.equal(x.json.leads[0].industry_id,'roofing');
 assert.equal(calls,1);
 x=await invoke(req());assert.equal(x.status,200);assert.equal(x.json.cached,true);assert.equal(calls,1);
 x=await invoke(req('admin',{...input,city:'New York'}));assert.equal(x.status,400);
 const html=fs.readFileSync('public/lead-crawler.html','utf8');
 assert(html.includes('/api/lead-crawler/verified-nj-search'));
 assert(html.includes('page count was verified'));
 assert(html.includes("return 'pending'"));
 const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
 assert(scripts.length>=3);
 scripts.forEach((match,i)=>assert.doesNotThrow(()=>new Function(match[1]),'inline script '+i));
 console.log('PASS: real NJ Maps source; secured, deduplicated, geo filtered, unknown page counts, existing buckets, browser syntax');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
