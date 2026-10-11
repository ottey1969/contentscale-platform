'use strict';
const assert=require('node:assert/strict');
const {pullQueryWindow,registerGrowthGscDirect}=require('../src/tracker-growth-gsc-direct.cjs');
(async()=>{
 const fetchImpl=async(url,opts)=>{const body=JSON.parse(opts.body);assert.equal(body.startDate,'2026-07-04');assert.equal(body.endDate,'2026-07-31');return {ok:true,json:async()=>({rows:body.dimensions.length?[
  {keys:['ai citation tracker'],clicks:8,impressions:400,position:17},
  {keys:['unrelated term'],clicks:9,impressions:450,position:9}
 ]:[{clicks:20,impressions:850,position:13,ctr:.02}]})}};
 const g=await pullQueryWindow({siteUrl:'sc-domain:contentscale.site',pageUrl:'https://contentscale.site/ai/',query:'ai citation tracker',startDate:'2026-07-04',endDate:'2026-07-31',token:'synthetic',fetchImpl});
 assert.equal(g.clicks,8);assert.equal(g.impressions,400);
 await assert.rejects(()=>pullQueryWindow({siteUrl:'sc-domain:contentscale.site',pageUrl:'https://contentscale.site/ai/',query:'fabricated query',startDate:'2026-07-04',endDate:'2026-07-31',token:'synthetic',fetchImpl}),/not returned/);
 let handler,writes=0,lock=true;
 const publication={id:12,tracker_page_id:2296,query:'ai citation tracker',published_at:'2026-08-01T00:00:00Z',url:'https://contentscale.site/ai/'};
 const pool={query:async(sql)=>{
  const s=String(sql);
  if(s.includes('FROM tracker_clients'))return {rows:[{id:10,domain:'contentscale.site'}]};
  if(s.includes('FROM tracker_growth_publications'))return {rows:[publication]};
  if(s.includes('FROM tracker_case_studies'))return {rows:lock?[{id:1}]:[]};
  if(/^\s*(INSERT|CREATE)/i.test(s)){writes++;return {rows:[]}};
  throw Error('Unexpected SQL: '+s.slice(0,150));
 }};
 registerGrowthGscDirect({post(_path,fn){handler=fn}},pool,{env:{},tokenProvider:async()=>null});
 const invoke=async()=>{const res={statusCode:200,status(n){this.statusCode=n;return this},json(v){this.body=v;return v}};await handler({params:{token:'synthetic'},body:{publication_id:12}},res);return res};
 let r=await invoke();assert.equal(r.statusCode,409);assert.equal(writes,0);
 lock=false;r=await invoke();assert.equal(r.statusCode,503);assert.equal(r.body.configured,false);assert.equal(writes,0);
 console.log('PASS exact page/query GSC observations, missing row fail closed, locked case safety, missing credentials no writes');
})().catch(e=>{console.error(e);process.exitCode=1});
