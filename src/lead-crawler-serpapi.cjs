'use strict';
// Dedicated read-only, admin-authorized NJ business discovery.
// Uses actual SerpAPI Google Maps business results, not hallucinated LLM lists.
// Never touches Network, Contact Intelligence, CRM, or any database table.
const crypto=require('node:crypto');
const cache=new Map();
function clean(v,max=160){return String(v??'').replace(/[<>&\x22\x27\x60]/g,'').trim().slice(0,max);}
function safeWebsite(raw){
  try{
    const u=new URL(String(raw||''));
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
    const host=u.hostname.toLowerCase();
    if(!host.includes('.')||/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host))return null;
    if(/(^|\.)(google\.com|facebook\.com|yelp\.com|mapquest\.com|instagram\.com|yellowpages\.com|angi\.com)$/.test(host))return null;
    return u.origin+'/';
  }catch{return null;}
}
function njScope(city,country){
  const location=clean(city,120),nation=clean(country,60);
  if(!/^(usa|us|united states|united states of america)$/i.test(nation))return null;
  if(!/(^|[\s,])(?:new jersey|nj)(?=$|[\s,])/i.test(location))return null;
  const town=location.replace(/(?:,?\s*)(?:new jersey|nj)\s*$/i,'').trim();
  return {location:town?town+', New Jersey':'New Jersey',town};
}
function mapBusiness(row,{town}){
  const website=safeWebsite(row?.website||row?.links?.website);
  const address=clean(row?.address,250);
  if(!website||!address||!/(\bNJ\b|New Jersey)/i.test(address))return null;
  if(town&&!address.toLowerCase().includes(town.toLowerCase()))return null;
  const name=clean(row.title,150),phone=clean(row.phone,55);
  if(!name||phone.replace(/\D/g,'').length<7)return null;
  const type=clean(row.type||row.types?.[0]||'',90);
  return {name,website,phone,address,type,industry_id:'',
    email:'',contact_form_url:'',estimated_pages:null,content_score:null,
    sitemap:'',sitemap_source:'unknown',
    page_count_status:'needs_website_audit',
    source:'google_maps_serpapi',
    place_id:clean(row.place_id||row.data_id||'',150),
    opportunity:'Website content and page count need verification before a sales pitch.',
    pitch_angle:'Review this company website before proposing content improvements.'};
}
function authorized(req){
 const configured=process.env.LC_ADMIN_CODE||'';
 const submitted=String(req.get?.('x-admin-code')||'');
 if(!configured||!submitted||configured.length!==submitted.length)return false;
 return crypto.timingSafeEqual(Buffer.from(configured),Buffer.from(submitted));
}

class ProviderFailure extends Error {
 constructor(provider,reason){super(provider+': '+reason);this.provider=provider;this.reason=reason;}
}
async function querySerper({fetchImpl,key,query}){
 const response=await fetchImpl('https://google.serper.dev/maps',{
  method:'POST',
  headers:{'X-API-KEY':key,'Content-Type':'application/json'},
  body:JSON.stringify({q:query,gl:'us',hl:'en'}),
  signal:AbortSignal.timeout(23000)
 });
 if(!response.ok)throw new ProviderFailure('Serper','HTTP '+response.status);
 const data=await response.json();
 if(data?.error||!Array.isArray(data?.places))throw new ProviderFailure('Serper','invalid Maps response');
 return data.places.map(row=>({
  ...row,
  phone:row.phone||row.phoneNumber||'',
  type:row.type||row.category||'',
  place_id:row.place_id||row.placeId||row.cid||''
 }));
}
async function querySerpApi({fetchImpl,key,query}){
 const url=new URL('https://serpapi.com/search.json');
 url.searchParams.set('engine','google_maps');
 url.searchParams.set('type','search');
 url.searchParams.set('q',query);
 url.searchParams.set('gl','us');
 url.searchParams.set('hl','en');
 url.searchParams.set('api_key',key);
 const response=await fetchImpl(url.toString(),{signal:AbortSignal.timeout(23000)});
 if(!response.ok)throw new ProviderFailure('SerpAPI','HTTP '+response.status);
 const data=await response.json();
 if(data?.error||!Array.isArray(data?.local_results))throw new ProviderFailure('SerpAPI','invalid Maps response');
 return data.local_results;
}
function registerLeadCrawlerSerpApi(app,{
 fetchImpl=global.fetch,
 apiKey=()=>process.env.SERPAPI_KEY,
 serperKey=()=>process.env.SERPER_API_KEY,
 auth=authorized
}={}){
 app.post('/api/lead-crawler/verified-nj-search',async(req,res)=>{
  if(!auth(req))return res.status(403).json({error:'Admin login required for NJ research'});
  const raw=req.body||{};
  const scope=njScope(raw.city,raw.country);
  const niche=clean(raw.niche,70);
  if(!scope||niche.length<2||niche.length>70)return res.status(400).json({error:'Select USA, New Jersey and a niche'});
  const cacheKey=[scope.location.toLowerCase(),niche.toLowerCase()].join('|');
  const cached=cache.get(cacheKey);
  if(cached&&cached.until>Date.now())return res.json({...cached.body,cached:true,provider_calls:0});
  const primaryKey=String(serperKey()||'').trim();
  const fallbackKey=String(apiKey()||'').trim();
  if(!primaryKey&&!fallbackKey)return res.status(503).json({
    error:'NJ business search is not configured. Set SERPER_API_KEY or SERPAPI_KEY in Railway.'
  });
  const query=niche+' businesses in '+scope.location+', USA';
  let rows=null,provider=null,attempts=0;
  const failures=[];
  if(primaryKey){
   attempts++;
   try{
    rows=await querySerper({fetchImpl,key:primaryKey,query});
    provider='google_maps_serper';
   }catch(err){
    const message=err instanceof ProviderFailure?err.reason:(err?.name==='TimeoutError'?'timeout':'request failed');
    failures.push('Serper '+message);
    console.warn('[lead-crawler] Serper provider failed:',message);
   }
  }
  if(rows===null&&fallbackKey){
   attempts++;
   try{
    rows=await querySerpApi({fetchImpl,key:fallbackKey,query});
    provider='google_maps_serpapi';
   }catch(err){
    const message=err instanceof ProviderFailure?err.reason:(err?.name==='TimeoutError'?'timeout':'request failed');
    failures.push('SerpAPI '+message);
    console.warn('[lead-crawler] SerpAPI provider failed:',message);
   }
  }
  if(rows===null)return res.status(503).json({
   error:'Google Maps providers unavailable: '+failures.join('; ')+'. Check the provider API keys, access and quotas in Railway.',
   providers_attempted:attempts
  });
  const seen=new Set(),leads=[];
  for(const row of rows){
   const lead=mapBusiness(row,scope);
   if(!lead||seen.has(lead.website))continue;
   lead.industry_id=clean(raw.industry_id||'',80);
   lead.source=provider;
   seen.add(lead.website);
   leads.push(lead);
   if(leads.length>=20)break;
  }
  const body={
   leads,source:provider,location:scope.location,verified_page_counts:0,
   provider_calls:attempts,
   notice:'Business website, phone and NJ address are from Google Maps results. Website page counts and content gaps are not yet audited.'
  };
  cache.set(cacheKey,{until:Date.now()+20*60*1000,body});
  if(cache.size>100)cache.delete(cache.keys().next().value);
  return res.json(body);
 });
}
module.exports={registerLeadCrawlerSerpApi,njScope,mapBusiness,safeWebsite,querySerper,querySerpApi};
