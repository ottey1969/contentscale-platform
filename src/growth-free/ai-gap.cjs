'use strict';
// AI gap: what the pages AI cites have that your page does not (owner 2026-11-11: "in Search we have the gap in Growth;
// for the AI answers we need the gap too, for everything where you are not cited"). For every AI system with a
// verifiable source list that does not cite the site, the pages it does cite are read and compared with your page:
// content headings, the facts they state (price, response time, licence, insurance, warranty, process steps) and page
// elements (FAQ, table, structured data). Observations only: never a claim about your business.
const {pageElements,compareElements,contentSections,buildCompetitorOverview}=require('../growth-competitor-overview.cjs');
const {rootOf,parseAiAnswer}=require('./ai-answers.cjs');

const MAX_PAGES=6;
const hostOf=u=>{try{return new URL(u).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}};
const strip=h=>String(h||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ');
const plain=h=>strip(h).replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const STOP=/^(the|and|for|with|your|you|how|what|why|are|our|van|het|een|voor|met|wat|hoe|die|dat|los|las|del|para|con|que)$/;
const words=t=>new Set((String(t).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]).filter(w=>!STOP.test(w)).map(w=>w.slice(0,5)));

// Facts a reader looks for, detected in the visible text. A fact counts as stated when the text matches; the excerpt
// shows where, so the owner can check it.
const FACTS=[
 {key:'price',label:'A price or price range',re:/(?:[$€£]\s?\d[\d.,]*|\b\d[\d.,]*\s?(?:usd|eur|euro|dollars?)\b)/i},
 {key:'response_time',label:'A response or arrival time',re:/\b(?:within|in under|under|binnen|en menos de|en)\s+\d+\s*(?:-\s*\d+\s*)?(?:minutes?|mins?|hours?|hrs?|minuten|uur|minutos|horas)\b|\b\d+\s*(?:-\s*\d+\s*)?(?:minute|hour)s?\s+(?:response|arrival)\b/i},
 {key:'licence',label:'A licence or registration number',re:/\b(?:licen[cs]e[ds]?|registration|registered|HIC|vergunning|licencia)\b[^.]{0,40}?(?:#|no\.?|number|nr\.?|n[ºo°])?\s*[A-Z0-9]{5,}/i},
 {key:'insurance',label:'Insurance or insurance-claim help',re:/\b(?:insured|insurance|verzekerd|verzekering|asegurad[oa]s?|seguro)\b/i},
 {key:'warranty',label:'A warranty or guarantee',re:/\b(?:warrant(?:y|ies|ied)|guarantee[ds]?|garantie|garantía)\b/i},
 {key:'process',label:'Numbered process steps',re:/\b(?:step|stap|paso)\s*(?:1|one|één|uno)\b/i,
  html:h=>/<ol\b[^>]*>(?:[\s\S]*?<li\b){3}/i.test(h)}
];
function factsOf(html){
 const t=plain(html),out={};
 for(const f of FACTS){const m=t.match(f.re);
  if(m){const i=Math.max(0,m.index-60);out[f.key]=t.slice(i,m.index+m[0].length+60).trim()}
  else if(f.html&&f.html(strip(html)))out[f.key]='(numbered list on the page)';}
 return out;
}

// The pages cited by the AI systems that do not cite your site, most-cited first.
function citedPages(answers,pageUrl,query){
 const own=rootOf(hostOf(pageUrl));
 const byUrl=new Map();
 // Stored answers are re-read with the current rules, as in the AI summary.
 for(const r of answers||[]){const p=r&&typeof r.raw_text==='string'?parseAiAnswer(r.raw_text,{pageUrl,query:query||r.query}):r&&r.parsed;
  if(!p||p.validation_status==='invalid'||p.sources_verifiable===false||p.own_site_cited)continue;
  for(const u of p.sources||[]){const h=hostOf(u);if(!h||rootOf(h)===own||!/^https:/i.test(u))continue;
   const x=byUrl.get(u)||{url:u,site:h,engines:new Set()};x.engines.add(r.engine);byUrl.set(u,x)}}
 return [...byUrl.values()].sort((a,b)=>b.engines.size-a.engines.size||a.url.localeCompare(b.url));
}
const answersFingerprint=(answers,pageUrl,query)=>citedPages(answers,pageUrl,query).map(p=>p.url+'|'+[...p.engines].sort().join(',')).join('\n');

async function buildAiGap({answers,pageUrl,query='',engines=[],fetchHtml,ownHtml=null,model=null,limit=MAX_PAGES}){
 const cited=citedPages(answers,pageUrl,query);
 if(!cited.length)return {status:'NO_CITED_PAGES',pages:[],missing_topics:[],missing_facts:[],elements:null};
 const label=new Map(engines.map(e=>[e.id,e.label]));
 if(ownHtml==null){try{ownHtml=String((await fetchHtml(pageUrl))?.html||'')}catch{ownHtml=''}}
 if(!ownHtml.trim())return {status:'OWN_PAGE_UNREADABLE',pages:[],missing_topics:[],missing_facts:[],elements:null};
 const ownHeadings=contentSections(pageUrl,ownHtml).map(s=>s.heading);
 const ownSets=ownHeadings.map(words),ownFacts=factsOf(ownHtml),ownElements=pageElements(ownHtml);
 const onYourPage=h=>{const w=words(h);if(!w.size)return true;return Math.max(0,...ownSets.map(o=>[...w].filter(x=>o.has(x)).length/w.size))>=0.6};
 // One page per site: the most-cited URL of that site.
 const seen=new Set(),pick=[];for(const c of cited){if(seen.has(c.site))continue;seen.add(c.site);pick.push(c);if(pick.length>=limit)break}
 const pages=await Promise.all(pick.map(async c=>{
  const base={url:c.url,site:c.site,cited_by:[...c.engines].map(e=>label.get(e)||e)};
  let html='';try{html=String((await fetchHtml(c.url))?.html||'')}catch(e){return {...base,read:false,status:'Could not be opened'}}
  const sections=contentSections(c.url,html);
  if(!sections.length&&plain(html).split(' ').length<150)return {...base,read:false,status:'Opened, but too little readable text'};
  const facts=factsOf(html);
  return {...base,read:true,status:'Read',html,elements:pageElements(html),
   headings:sections.slice(0,15).map(s=>({text:s.heading,excerpt:s.excerpt,status:onYourPage(s.heading)?'ON_YOUR_PAGE':'MISSING'})),
   facts:FACTS.filter(f=>facts[f.key]).map(f=>({key:f.key,label:f.label,excerpt:facts[f.key].slice(0,220),on_your_page:!!ownFacts[f.key]}))};
 }));
 const read=pages.filter(p=>p.read);
 // Topics, as in the Google gap: the model groups the cited pages' sections into topics and decides per topic whether
 // your page covers it (synonyms count). Without a model, or when it gives no valid answer, headings are compared by words.
 let grouped=null;
 if(model&&read.length&&ownHtml){
  try{const ov=await buildCompetitorOverview({query,ownUrl:pageUrl,ownHtml,competitors:read.map(p=>({url:p.url,html:p.html})),model});
   if(ov.topics_status==='GROUPED'&&Array.isArray(ov.topics))grouped=ov.topics}catch{}
 }
 if(grouped){
  const status=new Map();for(const t of grouped)for(const sec of t.sections||[])status.set(sec.host+'\u0000'+sec.heading,t.this_page);
  for(const p of read)p.headings=p.headings.map(h=>{const st=status.get(p.site+'\u0000'+h.text)||status.get('www.'+p.site+'\u0000'+h.text);
   return st&&st!=='UNKNOWN'?{...h,status:st==='NO'?'MISSING':st==='PARTLY'?'PARTLY':'ON_YOUR_PAGE'}:h});
 }
 for(const p of read)delete p.html;
 const topics=[];
 if(grouped)for(const t of grouped.filter(t=>t.this_page!=='YES'&&t.fits_search!=='NO')){const secs=t.sections||[];
  topics.push({topic:t.topic,coverage:t.this_page==='PARTLY'?'PARTLY':t.this_page==='NO'?'MISSING':'UNSURE',words:new Set(),sites:[...new Set(secs.map(x=>String(x.host).replace(/^www\./,'')))],
   examples:secs.map(x=>({site:String(x.host).replace(/^www\./,''),heading:x.heading,excerpt:x.excerpt||null}))})}
 else
 for(const p of read)for(const h of p.headings.filter(x=>x.status==='MISSING')){const w=words(h.text);
  const t=topics.find(x=>{const o=x.words;const n=[...w].filter(y=>o.has(y)).length;return n/Math.max(1,Math.min(w.size,o.size))>=0.6});
  if(t){if(!t.sites.includes(p.site))t.sites.push(p.site);t.examples.push({site:p.site,heading:h.text,excerpt:h.excerpt})}
  else topics.push({topic:h.text,coverage:'MISSING',words:w,sites:[p.site],examples:[{site:p.site,heading:h.text,excerpt:h.excerpt}]});}
 const missing_topics=topics.sort((a,b)=>b.sites.length-a.sites.length).slice(0,15).map(({words,...t})=>({...t,examples:t.examples.slice(0,3)}));
 const missing_facts=FACTS.filter(f=>!ownFacts[f.key]).map(f=>{const on=read.filter(p=>p.facts.some(x=>x.key===f.key));
  return {key:f.key,label:f.label,sites:on.map(p=>p.site),example:on.length?{site:on[0].site,excerpt:on[0].facts.find(x=>x.key===f.key).excerpt}:null}}).filter(f=>f.sites.length);
 const elements=read.length?compareElements(ownElements,read.map(p=>({elements:p.elements}))):null;
 return {status:read.length?'READ':'NOTHING_READABLE',pages:pages.map(({elements,...p})=>p),missing_topics,missing_facts,
  elements:elements&&{elements_they_have_and_this_page_lacks:elements.elements_they_have_and_this_page_lacks,structured_data_they_have_and_this_page_lacks:elements.structured_data_they_have_and_this_page_lacks},
  topics_basis:grouped?'TOPICS_COMPARED':'HEADING_WORDS',your_headings:ownHeadings.slice(0,20),checked_at:new Date().toISOString()};
}

// One gap per page and set of cited URLs, kept in memory (recomputed after a restart). A request either waits for the
// reading (after pasting an answer) or gets RUNNING and the result on the next load.
function createAiGapCache({fetchHtml,model=null,engines=[],max=300,waitMs=25000}={}){
 const done=new Map(),running=new Map();
 return function gapFor({key,answers,pageUrl,query='',wait=false}){
  const fp=answersFingerprint(answers,pageUrl,query);if(!fp)return Promise.resolve(null);
  const k=key+'\u0000'+pageUrl+'\u0000'+fp,hit=done.get(k);if(hit)return Promise.resolve(hit);
  let run=running.get(k);
  if(!run){run=buildAiGap({answers,pageUrl,query,engines,fetchHtml,model:typeof model==='function'?model():model})
    .then(g=>{if(done.size>=max)done.delete(done.keys().next().value);done.set(k,g);return g})
    .catch(e=>{console.warn('[growth] AI gap failed',String(e&&e.message||e));return {status:'FAILED',pages:[],missing_topics:[],missing_facts:[],elements:null}})
    .finally(()=>running.delete(k));running.set(k,run)}
  if(!wait)return Promise.resolve({status:'RUNNING'});
  return Promise.race([run,new Promise(r=>setTimeout(()=>r({status:'RUNNING'}),waitMs).unref())]);
 };
}

module.exports={buildAiGap,createAiGapCache,citedPages,answersFingerprint,factsOf,FACTS,MAX_PAGES};
