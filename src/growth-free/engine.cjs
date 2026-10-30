'use strict';
// Runs the existing Growth research for ONE public URL without a Tracker account.
// The engine is reused unchanged; it receives a read-only data source that only
// knows this page. No GSC, no Case Study, no AI draft, no database writes.
const {registerGrowthAutomaticResearch}=require('../tracker-growth-automatic-routes.cjs');

const FREE_PAGE_ID=1,FREE_CLIENT_ID=0;

function validatePublicUrl(raw){
 let u;
 try{u=new URL(String(raw||'').trim())}catch{return {error:'Enter a full web address, e.g. https://example.com/page/'}}
 if(!['https:','http:'].includes(u.protocol))return {error:'Only http(s) web pages can be checked'};
 if(u.username||u.password)return {error:'Web addresses with a login are not supported'};
 const host=u.hostname.toLowerCase();
 if(!host.includes('.')||/^[0-9.]+$/.test(host)||host.includes(':')||/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host))
  return {error:'Enter a public website address'};
 if(u.port&&!['80','443'].includes(u.port))return {error:'Enter a public website address'};
 u.hash='';
 const url=u.toString();
 if(url.length>500)return {error:'This web address is too long'};
 return {url,host};
}

// The engine asks for a handful of Tracker tables. Only the page itself exists;
// every optional source (GSC, snapshots, AI evidence, site inventory) is empty.
function readOnlySource(page){
 return {async query(sql){
  if(/^\s*(UPDATE|INSERT|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql))throw Error('FREE_GROWTH_ENGINE_IS_READ_ONLY');
  if(sql.includes('LEFT(html_content')&&/FROM tracker_pages\b/.test(sql))
   return {rows:[{id:FREE_PAGE_ID,tracker_client_id:FREE_CLIENT_ID,url:page.url,keyword:page.keyword,brief_content:null,saved_html:null}]};
  return {rows:[]};
 }};
}

// market: {countries,language} chosen by the visitor, used exactly like a market set in the Tracker (else derived).
async function runFreeGrowthResearch({url,query,market=null},deps={}){
 const page={id:FREE_PAGE_ID,url,keyword:String(query||'').trim().slice(0,120),case_study_active:false};
 const route={};
 const options={retryDelayMs:deps.retryDelayMs??1500};
 for(const k of ['fetchLive','searchLive','renderOwn','judgeTasks','buildOverview'])if(typeof deps[k]==='function')options[k]=deps[k];
 if(market&&(market.countries?.length||market.language))options.loadPageMarkets=async()=>market;
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h}},readOnlySource(page),(req,res,next)=>{
  req.growthTrackerClientId=FREE_CLIENT_ID;req.growth={can_edit:false,pages:[page]};next();
 },options);
 const stack=route['/api/tracker-client/:token/growth/auto-research'];
 const req={params:{token:'free-growth-check'},query:{page_id:String(FREE_PAGE_ID)}};
 const res={statusCode:200,status(c){this.statusCode=c;return this},set(){return this},json(b){this.body=b;return this}};
 await new Promise((ok,bad)=>{
  const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};
  at(0);
 });
 return {statusCode:res.statusCode,report:res.body};
}

module.exports={runFreeGrowthResearch,validatePublicUrl,readOnlySource};
