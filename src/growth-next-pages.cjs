'use strict';
// Next steps beyond the tracked page itself, from the owner's own data (Search Console rows and the tracked-page list).
// 1. Possible new pages (spokes): search terms Google already shows this page for, but deep in the results. A candidate
//    is a research question, never a decision: the New Page route reads the live results and checks overlap first.
// 2. Information to action: for an informational page, the page on the same site where a reader can act on what they
//    learned, with a link only where a paragraph already uses those words. Nothing is written or published.
const {queryRoots,classifyTitle}=require('./growth-reader-task-coverage.cjs');
const {planInternalLinks}=require('./growth-owner-handoff-package.cjs');
const {statesIn}=require('./growth-serp-quality.cjs');

const MIN_IMPRESSIONS=10,DEEP_POSITION=10,MAX_CANDIDATES=8;
const rootsOf=t=>queryRoots(String(t||'')).all;
const compact=t=>String(t||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const hostLabel=u=>{try{return new URL(u).hostname.replace(/^www\./,'').split('.')[0].toLowerCase()}catch{return ''}};
const pathWords=u=>{try{return decodeURIComponent(new URL(u).pathname).replace(/[^a-z0-9]+/gi,' ').trim()}catch{return ''}};
const covers=(have,need)=>need.length>0&&need.every(r=>have.includes(r));

// Latest import per query (rows arrive newest first).
function latestByQuery(rows){
 const out=new Map();
 for(const r of Array.isArray(rows)?rows:[]){const q=String(r&&r.query||'').trim().toLowerCase();if(q&&!out.has(q))out.set(q,r)}
 return out;
}

// Words that say WHAT KIND of result someone wants about a topic (a review, a price, a tool, a place), not the topic itself.
// A term is compared with the site's pages on its topic words; any industry, English.
const MODIFIERS=new Set(rootsOf('review reviews pricing price prices cost costs login alternative alternatives versus coupon discount trial nearby near detector detection checker tool tools software app free best top'));
const placeIn=q=>statesIn(q,{queryMode:true}).length>0||/\b(near me|nearby|in my area)\b/i.test(q);
const PLACE_ROOTS=q=>{const states=statesIn(q,{queryMode:true});if(!states.length)return [];
 // The words of the place itself (the state, and the city written before it): "los angeles, california".
 const m=String(q).toLowerCase().match(/(?:\bin\s+)?([a-z .'-]+),\s*([a-z ]+)$/);return rootsOf(m?m[1].replace(/^.*\bin\s+/,'')+' '+m[2]:'')};
const topicOf=q=>{const place=new Set(PLACE_ROOTS(q));return rootsOf(q).filter(r=>!MODIFIERS.has(r)&&!place.has(r))};
const pageTopic=p=>[...new Set([...rootsOf(p.keyword),...rootsOf(pathWords(p.url))])];

// localMarket: the page serves a place (a US-state market derived from its query, keyword or URL). Without it, a term that
// names a place or "near me" is not a growth term for this site.
function spokeCandidates({pageUrl='',focusQuery='',gscRows=[],sitePages=[],siteGsc=[],localMarket=false}={}){
 const own=latestByQuery(gscRows);
 if(!own.size)return {status:'NO_SEARCH_CONSOLE_ROWS',candidates:[],belongs_elsewhere:[],excluded:[],
  note:'No Search Console rows for this page: possible new pages are suggested only from search terms the page already appears for.'};
 const brand=compact(hostLabel(pageUrl)),focus=rootsOf(focusQuery);
 const others=latestByQueryPerPage(siteGsc);
 const groups=new Map(),elsewhere=[],excluded=[];
 const skip=(q,r,reason)=>excluded.push({query:q,impressions:Number(r.impressions)||0,position:Math.round((Number(r.position)||0)*10)/10,reason});
 for(const [q,r] of own){
  const impressions=Number(r.impressions)||0,position=Number(r.position)||0,clicks=Number(r.clicks)||0;
  if(impressions<MIN_IMPRESSIONS||!(position>DEEP_POSITION))continue;
  if(brand.length>=4&&compact(q).includes(brand)){skip(q,r,'OWN_BRAND_TERM');continue}
  if(placeIn(q)&&!localMarket){skip(q,r,'NAMES_A_PLACE_THIS_SITE_DOES_NOT_SERVE');continue}
  const roots=rootsOf(q),topic=topicOf(q);if(!topic.length){skip(q,r,'NO_TOPIC_WORDS');continue}
  // Another tracked page already answers it: better position there, or its keyword or URL covers the topic of the term
  // (so a review or price question about a topic goes to the page about that topic). The closest page wins.
  const better=(others.get(q)||[]).filter(o=>Number(o.position)>0&&Number(o.position)<position).sort((a,b)=>a.position-b.position)[0];
  const covering=sitePages.filter(p=>p&&p.url&&p.url!==pageUrl&&covers(pageTopic(p),topic))
   .sort((a,b)=>pageTopic(a).length-pageTopic(b).length)[0];
  const page=better?sitePages.find(p=>String(p.id)===String(better.page_id)):covering;
  if(page&&page.url&&page.url!==pageUrl){elsewhere.push({query:q,impressions,position:Math.round(position*10)/10,url:page.url,
   basis:better?'BETTER_POSITION_ON_THAT_PAGE':'THAT_PAGE_COVERS_THE_TOPIC',action:'Improve that page for this term; no new page.'});continue}
  if(covers(focus,topic)){skip(q,r,'VARIANT_OF_THIS_PAGE_FOCUS_TERM');continue}
  const key=[...new Set(roots)].sort().join(' ');
  const g=groups.get(key)||{query:q,variants:[],impressions:0,clicks:0,best_position:position};
  g.variants.push(q);g.impressions+=impressions;g.clicks+=clicks;
  if(position<g.best_position)g.best_position=position;
  if(impressions>(Number(own.get(g.query)?.impressions)||0))g.query=q;
  groups.set(key,g);
 }
 const candidates=[...groups.values()].sort((a,b)=>b.impressions-a.impressions).slice(0,MAX_CANDIDATES).map(g=>({
  query:g.query,variants:g.variants.slice(0,5),impressions:g.impressions,clicks:g.clicks,best_position:Math.round(g.best_position*10)/10,
  status:'POSSIBLE_NEW_PAGE_RESEARCH_FIRST',
  why:'Google shows '+pageUrl+' for this term ('+g.impressions+' impressions, best position '+Math.round(g.best_position*10)/10+'), but deep in the results, and no other tracked page covers it.',
  next:'Start a Pre-Write brief with this term; the New Page route reads the live results and checks overlap with your tracked pages before anything is written.',
  link_back_to:pageUrl}));
 return {status:candidates.length?'CANDIDATES_FROM_SEARCH_CONSOLE':'NO_CANDIDATES',candidates,belongs_elsewhere:elsewhere.slice(0,8),excluded:excluded.slice(0,12),
  rule:'Terms this page appears for with at least '+MIN_IMPRESSIONS+' impressions beyond position '+DEEP_POSITION+'. Left out: brand terms, places this site does not serve, variants of the page\'s own focus term, and terms whose topic another tracked page covers (a review, price or tool question goes to the page about that topic). A candidate is a research question, not a decision; no impressions or clicks are forecast.',
  note:candidates.length?null:'No term qualifies: every term with impressions is a brand term, a place this site does not serve, a variant of the page\'s focus, already on page one, or covered by another tracked page.'};
}
function latestByQueryPerPage(rows){
 const out=new Map(),seen=new Set();
 for(const r of Array.isArray(rows)?rows:[]){
  const q=String(r&&r.query||'').trim().toLowerCase(),k=q+'|'+r.page_id;if(!q||seen.has(k))continue;seen.add(k);
  if(!out.has(q))out.set(q,[]);out.get(q).push({page_id:r.page_id,position:Number(r.position)||0});
 }
 return out;
}

// Pages where a reader acts: the path or the tracked keyword says so, in any industry and in English or Dutch.
const ACTION_PATH=/(^|\/)(pricing|prices?|plans?|contact|book(ing)?|demo|quote|services?|products?|shop|buy|order|sign-?up|register|trial|get-started|start|tarieven|prijzen|diensten|offerte|afspraak|aanmelden|bestellen)(\/|$|-)/i;
function actionKind(p){
 let path='';try{path=new URL(p.url).pathname.toLowerCase()}catch{return null}
 if(ACTION_PATH.test(path))return 'ACTION_PATH';
 const c=classifyTitle(String(p.keyword||''),'');
 return c==='PRODUCT_TOOL'||c==='LOCAL_SERVICE'?'ACTION_KEYWORD':null;
}

function readerFunnel({pageUrl='',focusQuery='',pageIntent=null,pageHtml='',sitePages=[]}={}){
 if(pageIntent!=='INFORMATIONAL_GUIDE')return {status:'NOT_AN_INFORMATIONAL_PAGE',stages:[],
  note:'A route from information to action is proposed for informational pages only.'};
 const topic=[...new Set([...rootsOf(focusQuery),...rootsOf(pathWords(pageUrl))])];
 const scored=(Array.isArray(sitePages)?sitePages:[]).filter(p=>p&&p.url&&p.url!==pageUrl).map(p=>{
  const kind=actionKind(p);if(!kind)return null;
  const words=[...new Set([...rootsOf(p.keyword),...rootsOf(pathWords(p.url))])];
  return {p,kind,shared:topic.filter(r=>words.includes(r))};
 }).filter(Boolean).sort((a,b)=>b.shared.length-a.shared.length);
 if(!scored.length)return {status:'NO_ACTION_PAGE_FOUND',stages:[{stage:'INFORMATION',url:pageUrl,role:'Answer the question completely before any offer.'}],
  note:'No tracked page looks like a page where a reader acts (service, product, pricing, contact, booking). Add that page to the Tracker first.'};
 const steps=scored.slice(0,3).map(x=>{
  const plan=pageHtml?planInternalLinks({targetUrl:x.p.url,focusQuery:x.p.keyword||pathWords(x.p.url),pages:[{url:pageUrl,html:pageHtml}]})[0]||null:null;
  return {stage:'ACTION',url:x.p.url,keyword:x.p.keyword||null,basis:x.kind,
   topic_match:x.shared.length?'shares '+x.shared.join(', ')+' with this page':'no shared topic words: a general next step only',
   link:plan?{status:plan.status,under_heading:plan.under_heading||null,anchor_text:plan.anchor_text||null,paragraph_excerpt:plan.paragraph_excerpt||null,action:plan.action}:
    {status:'PAGE_NOT_READ',action:'Read this page before placing a link.'}};
 });
 return {status:'FUNNEL_PROPOSAL',stages:[{stage:'INFORMATION',url:pageUrl,role:'Answer the question completely and usefully on its own, before any offer.'},...steps],
  rules:['The information stays complete without the offer; the reader is never pushed before the question is answered.',
   'Link from a paragraph that already uses the words (no rewritten paragraph); one clear next step at the end of the answer is enough.',
   'No promises, prices or claims are added; the owner chooses the step and the wording.'],
  note:'Proposal for the owner; nothing is written or published.'};
}

module.exports={spokeCandidates,readerFunnel,MIN_IMPRESSIONS,DEEP_POSITION};
