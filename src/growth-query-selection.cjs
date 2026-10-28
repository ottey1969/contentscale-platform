'use strict';
// Evidence-aware query and destination selection. One source of truth for "which search opportunity, on which URL".
//
// Why this exists: matching a query only against the CURRENT page's title/H1/H2 (no stemming) discards every specific
// query a broad page (a homepage or hub) surfaces for, and then falls back to a branded tracker keyword. The right
// question is "which existing URL is the proper home for this query?", not "is this query printed in this page's headline?".
//
// Everything here is industry-neutral: no trade, brand or client vocabulary. Inputs are the page's own observed text,
// verified exact-page GSC rows (optional) and the tracked same-site URL inventory.
const {STEM}=require('./growth-derived-reader-tasks.cjs');

const STOP=new Set('the and for from this that with your about when what where some more will have into which been also does how can are you was were of to on at in is it a an as by or near me vs versus een het van voor met naar'.split(/\s+/));
// Marketing filler that never names a topic. Language-level only.
const FLUFF=new Set('licensed insured best top leading premier trusted professional expert experts quality affordable reliable responsive certified official welcome home homepage free fast local #1 number one'.split(/\s+/));
const tok=text=>[...new Set(String(text||'').toLowerCase().normalize('NFKD').replace(/&(?:amp|nbsp|quot|rsquo|#\d+);?/g,' ').replace(/[^a-z0-9\s]+/g,' ').split(/\s+/)
 .filter(w=>w.length>=2&&!STOP.has(w)).map(w=>STEM(w)||w).filter(w=>w.length>=2))];
const compact=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const hostLabel=url=>{try{return new URL(url).hostname.replace(/^www\./,'').split('.')[0].toLowerCase()}catch{return ''}};

// A brand/navigational query names the site itself. It protects a baseline but is never a research query:
// the SERP for it is the brand's own profiles and directories, not competitors.
function brandInfo({url='',title=''}={}){
 const label=compact(hostLabel(url)),segs=String(title||'').split(/\s*[|–—:]\s*|\s+-\s+/).map(s=>s.trim()).filter(Boolean);
 const named=segs.find(s=>label&&compact(s)===label)||'';
 return {label,tokens:new Set(named?tok(named):[])};
}
function isBrandQuery(query,info){
 const q=compact(query);
 if(!q||!info?.label)return false;
 if(info.label.length>=6&&q.includes(info.label))return true;
 return false;
}

// Share of the query's tokens present in a text profile (stemmed).
function coverage(queryTokens,profileTokens){
 if(!queryTokens.length)return {ratio:0,matched:[],missing:[]};
 const set=new Set(profileTokens),matched=queryTokens.filter(t=>set.has(t));
 return {ratio:matched.length/queryTokens.length,matched,missing:queryTokens.filter(t=>!set.has(t))};
}
function pageProfile(h={}){
 return tok([h.title,...(h.h1||[]),...(h.h2||[]),h.description,...(h.paragraph_samples||[])].join(' '));
}
const slugTokens=url=>{try{return tok(new URL(url).pathname.replace(/[-_/]+/g,' '))}catch{return []}};

// Does a tracked same-site URL own the query? Exact keyword token-set equality beats superset coverage.
function matchSiteDestination(query,inventory,currentUrl){
 const q=tok(query);if(!q.length)return null;
 const rows=(Array.isArray(inventory)?inventory:[]).filter(p=>p?.url&&p.url!==currentUrl).map(p=>{
  const kw=tok(p.keyword),slug=slugTokens(p.url),both=[...new Set([...kw,...slug])];
  const cov=coverage(q,kw.length?kw:slug),covAll=coverage(q,both);
  const exact=kw.length>0&&kw.length===q.length&&q.every(t=>kw.includes(t));
  return {url:p.url,page_id:p.id??null,keyword:p.keyword||null,exact,ratio:Math.max(cov.ratio,covAll.ratio),extra:Math.max(0,kw.length-q.length)};
 }).filter(x=>x.ratio>=0.99||x.exact);
 rows.sort((a,b)=>Number(b.exact)-Number(a.exact)||a.extra-b.extra||a.url.length-b.url.length);
 return rows.length?{best:rows[0],others:rows.slice(1,4)}:null;
}

function safeMetric(row){
 const impressions=Number(row.impressions),clicks=Number(row.clicks),position=Number(row.position);
 if(!Number.isFinite(impressions)||impressions<0||!Number.isFinite(clicks)||clicks<0||clicks>impressions||!Number.isFinite(position)||position<=0)return null;
 return {impressions,clicks,position,ctr_pct:impressions?Math.round(clicks/impressions*10000)/100:0};
}
const NEAR_ME=/\bnear me\b|\bnearby\b/;

// A topic phrase taken from the page itself when there is neither GSC nor a usable tracked keyword.
function deriveTopicQuery(headings,brand){
 const segs=String(headings?.title||'').split(/\s*[|–—:]\s*|\s+-\s+/).map(s=>s.trim()).filter(Boolean);
 for(const seg of segs){
  const words=seg.toLowerCase().replace(/&[a-z#0-9]+;/g,' ').split(/[^a-z0-9]+/).filter(Boolean);
  const kept=words.filter(w=>!FLUFF.has(w)&&!STOP.has(w)&&!/^\d+$/.test(w));
  const brandish=brand?.tokens?.size&&tok(seg).filter(t=>brand.tokens.has(t)).length>=Math.max(1,Math.ceil(brand.tokens.size/2));
  if(brandish||compact(seg)===brand?.label)continue;
  if(kept.length>=2&&kept.length<=6)return kept.join(' ');
 }
 return null;
}

// page: {url,id,keyword,case_study_active}; queries: verified exact-page GSC rows; headings: observed text of the page;
// inventory: tracked same-site pages [{id,url,keyword}].
function selectGrowthQuery({page={},queries=[],headings={},inventory=[],now=new Date()}={}){
 const nowMs=new Date(now).getTime(),brand=brandInfo({url:page.url,title:headings.title});
 const profile=pageProfile(headings),seen=new Set(),candidates=[],excluded=[],brandQueries=[],protect=[];
 // A topical source page (not the homepage or a brand keyword) has its own topic. Its GSC rows are evidence about THIS page:
 // a query its own keyword already covers stays here (unless the page is a locked Case Study), and when several rows qualify
 // the one closest to the page's own topic wins over a merely larger, broader neighbour query.
 const srcPath=(()=>{try{return new URL(page.url).pathname}catch{return '/'}})();
 const srcKw=String(page.keyword||'').trim()&&!isBrandQuery(page.keyword,brand)?tok(page.keyword):[];
 const topical=srcPath!=='/'&&srcKw.length>0;
 for(const q of Array.isArray(queries)?queries:[]){
  if(!q||typeof q.query!=='string')continue;
  const name=q.query.trim(),key=name.toLowerCase();
  if(!name||seen.has(key))continue;seen.add(key);
  const metric=safeMetric(q),imported=Date.parse(q.imported_at||'');
  if(!metric||!Number.isFinite(imported)||imported>nowMs||nowMs-imported>75*86400000){excluded.push({query:name,reason:'MISSING_OR_STALE_QUERY_EVIDENCE'});continue}
  const entry={query:name,...metric,imported_at:q.imported_at};
  if(isBrandQuery(name,brand)){brandQueries.push(name);
   if(metric.position<=3&&metric.clicks>=10&&metric.impressions>=100)protect.push({...entry,fit:'BRAND_BASELINE'});
   excluded.push({query:name,reason:'BRAND_OR_NAVIGATIONAL_QUERY_NOT_A_RESEARCH_QUERY'});continue}
  if(/\b(review|reviews|coupon|pricing|price|login|download|alternatives?|jobs|careers)\b/i.test(name)&&
     !tok(name).some(t=>profile.includes(t)&&['review','coupon','pricing','price','login','download','alternativ','job','career'].includes(t))){
   excluded.push({query:name,reason:'DIFFERENT_SEARCH_INTENT'});continue}
  const qt=tok(name),own=coverage(qt,profile),site=matchSiteDestination(name,inventory,page.url);
  const ownFit=own.ratio>=0.67&&own.matched.length>=Math.min(2,qt.length);
  // The query's proper home: a dedicated tracked URL for exactly this topic wins over a broader page that merely mentions it.
  let destination=null;
  const align=topical?coverage(qt,srcKw).ratio:null;
  const sourceOwns=topical&&align>=0.99&&ownFit;
  if(sourceOwns&&page.case_study_active!==true)destination={url:page.url,page_id:page.id??null,basis:'SOURCE_PAGE_TOPIC_COVERS_QUERY',coverage:1,
   competing_same_site_pages:site?[site.best.url,...site.others.map(x=>x.url)].filter(u=>u!==page.url).slice(0,4):[]};
  else if(site&&site.best.exact)destination={url:site.best.url,page_id:site.best.page_id,basis:'DEDICATED_TRACKED_PAGE_FOR_THIS_QUERY',coverage:1,keyword:site.best.keyword,competing_same_site_pages:site.others.map(x=>x.url)};
  else if(ownFit)destination={url:page.url,page_id:page.id??null,basis:'CURRENT_PAGE_TEXT_COVERS_QUERY_TERMS',coverage:Math.round(own.ratio*100)/100};
  else if(site)destination={url:site.best.url,page_id:site.best.page_id,basis:'TRACKED_PAGE_COVERS_QUERY_TERMS',coverage:Math.round(site.best.ratio*100)/100,keyword:site.best.keyword,competing_same_site_pages:site.others.map(x=>x.url)};
  // A protected Case Study page is never the page we propose changes for when another tracked page covers the query.
  if(destination&&page.case_study_active===true&&destination.url===page.url&&site&&site.best.ratio>=0.99)
   destination={url:site.best.url,page_id:site.best.page_id,basis:'TRACKED_PAGE_COVERS_QUERY_TERMS_SOURCE_IS_PROTECTED_CASE_STUDY',coverage:1,keyword:site.best.keyword,competing_same_site_pages:site.others.map(x=>x.url)};
  if(!destination){excluded.push({query:name,reason:'NO_KNOWN_SAME_SITE_PAGE_COVERS_THIS_QUERY',unmatched:own.missing});continue}
  const surfacing=destination.url!==page.url?{type:'SOURCE_PAGE_SURFACES_FOR_QUERY_OWNED_BY_ANOTHER_PAGE',
   note:'These are the SOURCE page’s rows. They are not performance data for the destination page.',source_page_url:page.url}:null;
  const action=metric.position<=3&&metric.clicks>=10&&metric.impressions>=100?'PROTECT_BASELINE':
   metric.position<=35?'CLICK_AND_CONTENT_REVIEW':'VISIBILITY_GAP_COMPARE_WITH_LIVE_COMPETITORS';
  const row={...entry,destination,action_class:action,surfacing_signal:surfacing,source_topic_alignment:align===null?null:Math.round(align*100)/100,
   local_intent:NEAR_ME.test(name.toLowerCase())||/\b[a-z]{2}\b$/.test(name)};
  if(action==='PROTECT_BASELINE')protect.push(row);else candidates.push(row);
 }
 // Opportunity = visible but not converting: enough impressions and a low click-through, at any average position.
 const open=candidates.filter(x=>x.impressions>=100&&x.ctr_pct<=3).sort((a,b)=>
  (topical?(b.source_topic_alignment-a.source_topic_alignment):0)||b.impressions-a.impressions||a.position-b.position);
 const chosen=open[0]||null;
 if(chosen)return {status:'QUERY_SELECTED_FROM_VERIFIED_GSC',query:chosen.query,source:'VERIFIED_EXACT_PAGE_GSC',chosen,destination:chosen.destination,
  surfacing_signal:chosen.surfacing_signal,other_candidates:open.slice(1,4),
  ranking_basis:topical?'SOURCE_PAGE_TOPIC_ALIGNMENT_THEN_IMPRESSIONS':'IMPRESSIONS',protected:protect.slice(0,5),excluded:excluded.slice(0,12),brand_queries:brandQueries.slice(0,6),brand:{label:brand.label}};
 // No usable GSC opportunity: tracked keyword, then the page's own topic. Never a brand query.
 const kw=String(page.keyword||'').trim(),generic=new Set(['services','service','products','solutions','about','contact','home','index','pricing','offers']);
 if(kw&&!generic.has(kw.toLowerCase())&&!isBrandQuery(kw,brand)){
  const site=matchSiteDestination(kw,inventory,page.url);
  return {status:'QUERY_FROM_TRACKED_KEYWORD',query:kw,source:'TRACKER_KEYWORD',destination:site&&site.best.exact?{url:site.best.url,page_id:site.best.page_id,basis:'DEDICATED_TRACKED_PAGE_FOR_THIS_QUERY',coverage:1}:{url:page.url,page_id:page.id??null,basis:'TRACKED_KEYWORD_OF_THIS_PAGE',coverage:null},
   protected:protect.slice(0,5),excluded:excluded.slice(0,12),brand_queries:brandQueries.slice(0,6),brand:{label:brand.label}};
 }
 const derived=deriveTopicQuery(headings,brand);
 if(derived)return {status:'QUERY_DERIVED_FROM_PAGE_TOPIC',query:derived,source:'PAGE_TITLE_NON_BRAND_SEGMENT',destination:{url:page.url,page_id:page.id??null,basis:'CURRENT_PAGE_IS_THE_SOURCE_OF_THE_TOPIC',coverage:null},
  warning:'Working phrase taken from the page title without its brand name; not verified search demand.',protected:protect.slice(0,5),excluded:excluded.slice(0,12),brand_queries:brandQueries.slice(0,6),brand:{label:brand.label}};
 return {status:'NO_NON_BRAND_QUERY_ESTABLISHED',query:null,source:'NONE',destination:null,
  reason:'No verified non-brand GSC query, no usable tracked keyword and no non-brand topic in the page title. A brand search is not competitor research.',
  protected:protect.slice(0,5),excluded:excluded.slice(0,12),brand_queries:brandQueries.slice(0,6),brand:{label:brand.label}};
}
module.exports={selectGrowthQuery,matchSiteDestination,isBrandQuery,brandInfo,deriveTopicQuery,tok,coverage,pageProfile};
