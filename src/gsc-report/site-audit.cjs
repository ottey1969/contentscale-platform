'use strict';
// A report without Search Console (owner 2026-11-20): only what anyone can see in public. robots.txt is read and obeyed,
// the sitemap (or, without one, the links on the home page) gives the pages, and each page is read once with the bounded
// public reader (public HTTPS only, every redirect hop re-validated). A site that refuses the request is reported as not
// checked, never worked around. Clicks and impressions are not known here and are never estimated.
const {fetchPublicGrowthHtml,validateUrl}=require('../growth-public-html-reader.cjs');
const {fromResult}=require('./url-status.cjs');

const UA_TOKEN='contentscalegrowthresearch';
const TITLE_MAX=60,DESCRIPTION_MAX=160,THIN_WORDS=250;

// ── robots.txt ─────────────────────────────────────────────────────────────────────────────────────────────────────
function parseRobots(txt){
 const groups=[],sitemaps=[];let cur=null,lastWasAgent=false;
 for(const raw of String(txt||'').split(/\r?\n/)){
  const line=raw.replace(/#.*/,'').trim();if(!line)continue;
  const i=line.indexOf(':');if(i<0)continue;
  const k=line.slice(0,i).trim().toLowerCase(),v=line.slice(i+1).trim();
  if(k==='sitemap'){if(v)sitemaps.push(v);continue}
  if(k==='user-agent'){if(!lastWasAgent){cur={agents:[],rules:[]};groups.push(cur)}cur.agents.push(v.toLowerCase());lastWasAgent=true;continue}
  lastWasAgent=false;
  if(cur&&(k==='allow'||k==='disallow'))cur.rules.push({allow:k==='allow',path:v});
 }
 const mine=groups.filter(g=>g.agents.some(a=>a!=='*'&&UA_TOKEN.includes(a)));
 const rules=(mine.length?mine:groups.filter(g=>g.agents.includes('*'))).flatMap(g=>g.rules).filter(r=>r.path);
 return {rules,sitemaps};
}
const ruleRe=p=>new RegExp('^'+p.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$'));
// Longest matching rule wins; on a tie, allow.
function robotsAllows(robots,path){
 let best=null;
 for(const r of (robots&&robots.rules)||[]){if(!ruleRe(r.path).test(path))continue;
  if(!best||r.path.length>best.path.length||(r.path.length===best.path.length&&r.allow))best=r}
 return !best||best.allow;
}

// ── sitemap ────────────────────────────────────────────────────────────────────────────────────────────────────────
const decode=s=>String(s||'').replace(/&#x([0-9a-f]+);/gi,(_m,h)=>String.fromCodePoint(Math.min(parseInt(h,16),0x10ffff))).replace(/&#(\d+);/g,(_m,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff)))
 .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
function sitemapLocs(xml){
 const s=String(xml||'');
 if(/<!DOCTYPE|<!ENTITY/i.test(s))return {sitemaps:[],urls:[]};
 const tag=(rec,n)=>{const m=rec.match(new RegExp('<(?:[\\w.-]+:)?'+n+'\\s*>([\\s\\S]*?)</(?:[\\w.-]+:)?'+n+'\\s*>','i'));return m?decode(m[1].trim()):''};
 const sitemaps=(s.match(/<(?:[\w.-]+:)?sitemap\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?sitemap\s*>/gi)||[]).map(r=>tag(r,'loc')).filter(Boolean);
 const urls=(s.match(/<(?:[\w.-]+:)?url\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?url\s*>/gi)||[]).map(r=>({url:tag(r,'loc'),lastmod:tag(r,'lastmod').slice(0,10)||null})).filter(x=>x.url);
 return {sitemaps,urls};
}

// ── one page ───────────────────────────────────────────────────────────────────────────────────────────────────────
const text=h=>decode(String(h||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
const attrOf=(tag,name)=>{const m=tag.match(new RegExp('\\b'+name+'\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));return m?decode(m[2]!=null?m[2]:m[3]!=null?m[3]:m[4]):null};
const tags=(html,name)=>String(html||'').match(new RegExp('<'+name+'\\b[^>]*>','gi'))||[];
const metaContent=(html,re)=>{for(const t of tags(html,'meta')){const n=attrOf(t,'name')||attrOf(t,'property');if(n&&re.test(n))return attrOf(t,'content')}return null};
const samePage=(a,b)=>{try{const x=new URL(a),y=new URL(b);const p=u=>u.pathname.replace(/\/+$/,'')||'/';return x.host.toLowerCase()===y.host.toLowerCase()&&p(x)===p(y)&&x.search===y.search}catch{return false}};
function pageAudit(html,url,{xRobotsTag=null}={}){
 const h=String(html||'');
 const tm=h.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
 const title=tm?text(tm[1]):'';
 const description=(metaContent(h,/^description$/i)||'').replace(/\s+/g,' ').trim();
 const robots=[metaContent(h,/^(robots|googlebot)$/i),xRobotsTag].filter(Boolean).join(', ').toLowerCase();
 const noindex=/\b(noindex|none)\b/.test(robots);
 let canonical=null;
 for(const t of tags(h,'link')){const rel=(attrOf(t,'rel')||'').toLowerCase();if(rel.split(/\s+/).includes('canonical')){const href=attrOf(t,'href');if(href){try{canonical=new URL(href,url).href}catch{}}break}}
 const hreflang=[];
 for(const t of tags(h,'link')){const l=attrOf(t,'hreflang');if(l&&/alternate/i.test(attrOf(t,'rel')||'')){let href=attrOf(t,'href');try{href=new URL(href,url).href}catch{}hreflang.push({lang:l.toLowerCase(),url:href})}}
 const lang=(attrOf((h.match(/<html\b[^>]*>/i)||[''])[0],'lang')||'').toLowerCase()||null;
 const h1=(h.match(/<h1\b[^>]*>[\s\S]*?<\/h1\s*>/gi)||[]).map(text).filter(Boolean);
 const body=(h.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)||[null,h])[1]
  .replace(/<(script|style|noscript|svg|template|nav|header|footer|form|select)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
 const words=(text(body).match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu)||[]).length;
 const issues=[];
 if(noindex)issues.push('NOINDEX');
 if(canonical&&!samePage(canonical,url))issues.push('CANONICAL_ELSEWHERE');
 if(!title)issues.push('TITLE_MISSING');else if(title.length>TITLE_MAX)issues.push('TITLE_LONG');
 if(!description)issues.push('DESCRIPTION_MISSING');else if(description.length>DESCRIPTION_MAX)issues.push('DESCRIPTION_LONG');
 if(!h1.length)issues.push('H1_MISSING');else if(h1.length>1)issues.push('H1_MULTIPLE');
 if(words<THIN_WORDS)issues.push('THIN');
 return {title:title.slice(0,300),description:description.slice(0,400),h1:h1.slice(0,5).map(x=>x.slice(0,200)),words,canonical,noindex,lang,hreflang:hreflang.slice(0,20),issues};
}

// ── the site ───────────────────────────────────────────────────────────────────────────────────────────────────────
function siteOrigin(domain){
 const raw=String(domain||'').trim();if(!raw||raw.length>300)throw Object.assign(Error('INVALID_URL'),{code:'INVALID_URL'});
 const u=validateUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:'https://'+raw);
 // A path ("/en/") limits the read to that part of the site.
 return {origin:u.origin,host:u.hostname.toLowerCase(),path:u.pathname.replace(/[^/]*$/,'')||'/'};
}
async function crawlSite({domain,fetchImpl=fetchPublicGrowthHtml,max=150,concurrency=6,maxSitemaps=10,timeout=8000}={}){
 const {origin,host,path}=siteOrigin(domain);
 const inPath=u=>{try{return new URL(u).pathname.startsWith(path)}catch{return false}};
 const sameHost=u=>{try{const x=new URL(u);return x.hostname.toLowerCase()===host&&(x.protocol==='https:'||x.protocol==='http:')}catch{return false}};
 const clean=u=>{try{const x=new URL(u,origin);x.hash='';if(x.protocol==='http:')x.protocol='https:';return x.href}catch{return null}};
 // robots.txt
 let robots={rules:[],sitemaps:[]},robotsFound=false,robotsError=null;
 try{const r=await fetchImpl(origin+'/robots.txt',{allowText:true,limit:262144,timeout,redirects:2});robots=parseRobots(r.html);robotsFound=true}
 catch(e){robotsError=e&&e.code||'REQUEST_FAILED'}
 // sitemap(s): from robots.txt, else the usual places
 const fromRobots=robots.sitemaps.filter(sameHost).map(clean).filter(Boolean);
 const queue=fromRobots.length?[...fromRobots]:[origin+'/sitemap.xml',origin+'/sitemap_index.xml'];
 const seenMaps=new Set(),found=[],seenUrls=new Set();let read=0,source='NONE';
 while(queue.length&&read<maxSitemaps&&found.length<5000){
  const sm=queue.shift();if(seenMaps.has(sm))continue;seenMaps.add(sm);read++;
  let xml;try{xml=(await fetchImpl(sm,{allowSitemapXml:true,limit:5*1024*1024,timeout:timeout+4000,redirects:2})).html}catch{continue}
  const {sitemaps,urls}=sitemapLocs(xml);
  for(const s of sitemaps)if(sameHost(s)){const c=clean(s);if(c&&!seenMaps.has(c))queue.push(c)}
  for(const x of urls){if(!sameHost(x.url))continue;const c=clean(x.url);if(!c||seenUrls.has(c))continue;seenUrls.add(c);found.push({url:c,lastmod:x.lastmod})}
  if(urls.length&&source==='NONE')source=fromRobots.length?'ROBOTS_TXT':'SITEMAP_XML';
 }
 // No sitemap: the home page and the links on it.
 if(!found.length){
  try{const r=await fetchImpl(origin+path,{limit:600000,timeout,redirects:3});
   found.push({url:clean(r.final_url||origin+path),lastmod:null});seenUrls.add(found[0].url);
   for(const t of tags(r.html,'a')){const href=attrOf(t,'href');if(!href||/^(mailto|tel|javascript):/i.test(href))continue;
    const c=clean(new URL(href,r.final_url||origin+'/').href);if(c&&sameHost(c)&&!seenUrls.has(c)){seenUrls.add(c);found.push({url:c,lastmod:null})}}
   source='HOME_PAGE_LINKS';
  }catch{}
 }
 const pages=[],notCrawled=[],lastmod=new Map();let limited=0,outside=0;
 for(const x of found){
  if(!inPath(x.url)){outside++;continue}
  const u=new URL(x.url);
  if(!robotsAllows(robots,u.pathname+u.search)){notCrawled.push({url:x.url,reason:'ROBOTS_TXT'});continue}
  if(pages.length>=max){limited++;continue}
  pages.push(x.url);if(x.lastmod)lastmod.set(x.url,x.lastmod);
 }
 const statuses=new Map(),audits=new Map();let i=0;
 const worker=async()=>{while(i<pages.length){const u=pages[i++];
  try{const r=await fetchImpl(u,{compact:true,limit:400000,timeout,redirects:4});
   statuses.set(u,fromResult(u,r,null));
   if(!(r.redirect_chain&&r.redirect_chain.length))audits.set(u,pageAudit(r.html,u,{xRobotsTag:r.x_robots_tag||null}));
  }catch(e){statuses.set(u,fromResult(u,null,e))}}};
 await Promise.all(Array.from({length:Math.min(concurrency,pages.length)},worker));
 // The same title or description on more than one page.
 for(const [field,code] of [['title','TITLE_DUPLICATE'],['description','DESCRIPTION_DUPLICATE']]){
  const by=new Map();for(const [u,a] of audits){const k=a[field].toLowerCase();if(!k)continue;if(!by.has(k))by.set(k,[]);by.get(k).push(u)}
  for(const us of by.values())if(us.length>1)for(const u of us){const a=audits.get(u);a.issues.push(code);a[field+'_shared_with']=us.length-1}
 }
 return {origin,host,path,outside_path:outside,robots:{found:robotsFound,error:robotsError,rules:robots.rules.length},sitemap:{source,sitemaps_read:read,urls_found:found.length},
  pages,statuses,audits,lastmod,not_crawled:notCrawled,not_crawled_limit:limited,crawled_at:new Date().toISOString()};
}

// ── Google: positions (Serper, only when the owner asks) and field data (PageSpeed Insights / Chrome UX Report) ────
const {checkRank,readKeyword}=require('../rank-free/engine.cjs');
async function checkPositions({keywords,host,gl,hl,key,fetchImpl=global.fetch,maxKeywords=10,maxPages=3}){
 const list=[];for(const k of keywords||[]){const r=readKeyword(String(k||''));if(r&&r.keyword&&!list.includes(r.keyword))list.push(r.keyword);if(list.length>=maxKeywords)break}
 const base={market:{gl,hl},checked_at:new Date().toISOString()};
 if(!key)return {...base,status:'PROVIDER_NOT_CONFIGURED',rows:list.map(keyword=>({keyword,status:'NOT_CHECKED'})),calls:0};
 const target=host.replace(/^www\./,''),rows=[],ideas=[];let calls=0;
 for(const keyword of list){
  const r=await checkRank({keyword,host:target,gl,hl,key,fetchImpl,maxPages});calls+=r.calls||0;
  // Only this site's own result is kept; the sites around it are research, never part of the report.
  // Google's own related searches and "People also ask" from this same search: ideas, at no extra cost.
  for(const s of r.suggestions||[])if(!list.includes(s)&&!ideas.some(i=>i.term===s)&&ideas.length<20)ideas.push({term:s,from:keyword});
  rows.push({keyword,status:r.status,...(r.position?{position:r.position,url:r.url}:{}),...(r.depth?{depth:r.depth}:{}),...(r.reason?{reason:r.reason}:{})});
 }
 return {...base,status:'DONE',rows,ideas,calls};
}
const PSI='https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
async function fieldData({origin,key='',fetchImpl=global.fetch,timeout=60000}){
 try{
  const r=await fetchImpl(PSI+'?url='+encodeURIComponent(origin+'/')+'&strategy=mobile&category=performance'+(key?'&key='+encodeURIComponent(key):''),{signal:AbortSignal.timeout(timeout)});
  if(!r.ok)return {status:'UNAVAILABLE',reason:'HTTP_'+r.status};
  const j=await r.json(),x=j.originLoadingExperience&&j.originLoadingExperience.metrics?j.originLoadingExperience:j.loadingExperience;
  const m=x&&x.metrics;if(!m||!Object.keys(m).length)return {status:'NO_FIELD_DATA'};
  const v=(k,f=n=>n)=>m[k]?{value:f(m[k].percentile),category:m[k].category||null}:null;
  const lcp=v('LARGEST_CONTENTFUL_PAINT_MS'),inp=v('INTERACTION_TO_NEXT_PAINT'),cls=v('CUMULATIVE_LAYOUT_SHIFT_SCORE',n=>n/100);
  return {status:'FOUND',scope:x===j.originLoadingExperience?'ORIGIN':'URL',device:'MOBILE',overall:x.overall_category||null,
   metrics:{...(lcp?{LCP:{ms:lcp.value,category:lcp.category}}:{}),...(inp?{INP:{ms:inp.value,category:inp.category}}:{}),...(cls?{CLS:{score:cls.value,category:cls.category}}:{})}};
 }catch(e){return {status:'UNAVAILABLE',reason:e&&e.name==='TimeoutError'?'TIMEOUT':'REQUEST_FAILED'}}
}
module.exports={parseRobots,robotsAllows,sitemapLocs,pageAudit,crawlSite,siteOrigin,checkPositions,fieldData,TITLE_MAX,DESCRIPTION_MAX,THIN_WORDS};
