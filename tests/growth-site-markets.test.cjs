'use strict';
// The site's default target market and language: every page without its own Growth setting or Pre-Write brief uses it;
// a market set on the page always wins (owner: "for English, USA, but by hand I keep entering NL English").
// LABELLED SYNTHETIC: pages and search results.
const test=require('node:test'),assert=require('node:assert/strict');
const {resolveMarketSetting}=require('../src/growth-market-store.cjs');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');

test('order, field by field: page setting, then Pre-Write brief, then site default',()=>{
 const site={countries:['US'],language:'en'};
 assert.deepEqual(resolveMarketSetting(null,null,site),{countries:['US'],language:'en',source:'SITE_DEFAULT',language_source:'SITE_DEFAULT',brief:null,alternatives:[]});
 const page=resolveMarketSetting({countries:['NL'],language:'en'},null,site);assert.deepEqual([page.countries,page.source,page.language_source],[['NL'],'SET_IN_TRACKER','SET_IN_TRACKER']);
 const brief=resolveMarketSetting(null,{countries:['GB'],language:null},site);assert.deepEqual([brief.countries,brief.source,brief.language,brief.language_source],[['GB'],'FROM_PREWRITE_BRIEF','en','SITE_DEFAULT']);
 const lang=resolveMarketSetting({countries:[],language:'nl'},null,site);assert.deepEqual([lang.countries,lang.source,lang.language,lang.language_source],[['US'],'SITE_DEFAULT','nl','SET_IN_TRACKER']);
 assert.equal(resolveMarketSetting(null,null,null),null);
});

const URL_='https://contentscale.site/generative-engine-optimization-consultant/',QUERY='generative engine optimization consultant';
function setup({pageMarkets=null}={}){
 const route={},post={},asked=[];let site=null;
 const own='<html><head><title>Generative Engine Optimization Consultant</title></head><body><h1>Generative Engine Optimization Consultant</h1><p>'+'I help brands get cited in AI answers. '.repeat(20)+'</p></body></html>';
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){post[p]=h}},{query:async q=>{if(q.includes('LEFT(html_content')&&/FROM tracker_pages\b/.test(q))return {rows:[{id:9,tracker_client_id:3,url:URL_,keyword:QUERY,brief_content:null,saved_html:null}]};return {rows:[]}}},
  (req,res,next)=>{req.growthTrackerClientId=3;req.growth={can_edit:true,pages:[{id:9,url:URL_,keyword:QUERY,case_study_active:false}]};next()},{retryDelayMs:0,
  fetchLive:async url=>{if(url!==URL_)throw Object.assign(Error('x'),{code:'PUBLIC_HTML_UNAVAILABLE'});return {html:own,final_url:url,retrieved_at:'2026-10-31T12:00:00Z',truncated:false,source:'LIVE_PUBLIC_HTTPS'}},
  searchLive:async a=>{asked.push(a);return {status:'NO_RELEVANT_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query:a.query,leads:[]}},
  loadPageMarkets:async()=>pageMarkets,savePageMarkets:async a=>a,
  loadSiteMarkets:async()=>site,saveSiteMarkets:async a=>{site=a.countries.length||a.language?{countries:a.countries,language:require('../src/growth-search-locale.cjs').validLanguage(a.language)}:null;return site}});
 const call=async(stack,req)=>{const res={statusCode:200,status(c){this.statusCode=c;return this},set(){return this},json(b){this.body=b;return this}};
  await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res};
 return {asked,
  setSite:body=>call(post['/api/tracker-client/:token/growth/site-markets'],{params:{token:'t'},body}),
  research:(extra={})=>call(route['/api/tracker-client/:token/growth/auto-research'],{params:{token:'t'},query:{page_id:'9',...extra}})};
}

test('a page without its own market is researched in the site default (United States, English); a page setting wins',async()=>{
 const s=setup();
 assert.equal((await s.setSite({countries:'Narnia'})).body.code,'UNKNOWN_COUNTRY');
 const saved=await s.setSite({countries:'us — United States, gb — United Kingdom',language:'English'});
 assert.deepEqual(saved.body.site_markets,{countries:['US','GB'],language:'en'});
 await s.research();
 assert.equal(s.asked.at(-1).locale.country,'US');assert.deepEqual(s.asked.at(-1).locale.other_countries,['GB']);assert.equal(s.asked.at(-1).locale.source,'SITE_DEFAULT');
 const nl=setup({pageMarkets:{countries:['NL'],language:'en'}});await nl.setSite({countries:'us — United States',language:'English'});await nl.research();
 assert.equal(nl.asked.at(-1).locale.country,'NL','the market set on the page wins');
});

test('the Opportunity Finder runs one research in its country and term; the page setting stays as it is',async()=>{
 const s=setup({pageMarkets:{countries:['NL'],language:'en'}});
 await s.research({market:'gb',query:'geo consultant services'});
 assert.equal(s.asked.at(-1).locale.country,'GB');assert.equal(s.asked.at(-1).locale.source,'OPPORTUNITY_FINDER');
 assert.equal(s.asked.at(-1).query,'geo consultant services');
 await s.research();assert.equal(s.asked.at(-1).locale.country,'NL','without the override the page setting applies again');
 await s.research({market:'Narnia'});assert.equal(s.asked.at(-1).locale.country,'NL','an unknown market is ignored');
});
