'use strict';
// Best match on your own site for a price question (owner 2026-11-21: "Wat kost het om een specialist in te huren voor
// AI-zichtbaarheid en GEO?" was checked on /ai-zichtbaarheid/, which has no price, while the site's GEO service page
// already states "vanaf €297". The brief advised adding prices to the checked page; the tool must find the own page that
// already answers the price itself). Existing page before a new page: the price is answered on the page that has it, and
// the checked page gets one short line with a link.
// Only links on the checked page to the same host (so the same market) are read, at most MAX_READ pages.
const {factsOf}=require('./ai-gap.cjs');
const {marketOf}=require('../prewrite-existing-page.cjs');

const MAX_READ=3;
const fold=s=>String(s||'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase();
const words=s=>fold(s).split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>=2);
const PRICE_Q=/\b(?:inhuren|uitbesteden|hire|hiring|outsourc\w*|contratar|wat kost|kost(?:en|te)?|prijs|prijzen|tarief|tarieven|hoeveel|cost|costs|price|prices|pricing|rates?|fees?|cu[aá]nto|cuesta|cuestan|precio|precios|tarifas?|coste|costo)\b/i;
const isPriceQuestion=q=>PRICE_Q.test(String(q||''));
// Words that say nothing about the subject: question, price and provider words in nl/es/en.
const NOISE=new Set(('wat kost kosten kostte prijs prijzen tarief tarieven hoeveel hoe waarom welke beste goedkoop een de het van voor bij in op met per je mijn ik is zijn om te en of inhuren huren laten ' +
 'cuanto cuanta cuesta cuestan coste costo precio precios tarifa tarifas como que cual mejor un una el la los las de del en para por mi es son contratar y o ' +
 'how much does do cost costs price prices pricing rate rates fee fees what which best cheap a an the of for in to my is are hire and or ' +
 'specialist specialists especialista expert experto consultant consultor bureau agency agencia service services dienst diensten servicio servicios').split(/\s+/));
const SPELLED={geo:'generative engine optimization',aeo:'answer engine optimization',seo:'search engine optimization'};
// The page of the service someone wants to hire ("specialist inhuren", "consultant").
const PROVIDER=/\b(?:specialist|specialists|consultant|consultants|consultancy|consultor|especialista|expert|experto|adviseur|bureau|agency|agencia|inhuren|hire|contratar)\b/;
const PRICE_PATH=/\b(?:prijs|prijzen|tarief|tarieven|kosten|pricing|prices|price|precios|tarifas|precio)\b/;

const headOf=h=>{const t=String(h||'');return [(t.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1],(t.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]].filter(Boolean).join(' ').replace(/<[^>]+>/g,' ')};
function subjectWords(query){
 return [...new Set(words(query).filter(w=>!NOISE.has(w)))];
}
const decode=t=>String(t).replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/&nbsp;/g,' ');
// Links on the page to the same host, with their anchor text.
function ownLinks(html,pageUrl){
 let base;try{base=new URL(pageUrl)}catch{return []}
 const host=base.hostname.toLowerCase(),self=base.pathname.replace(/\/+$/,''),out=new Map();
 const re=/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
 while((m=re.exec(String(html||'')))){
  let u;try{u=new URL(decode(m[1]),base)}catch{continue}
  if(!/^https?:$/.test(u.protocol)||u.hostname.toLowerCase()!==host)continue;
  u.hash='';u.search='';const path=u.pathname.replace(/\/+$/,'');
  if(path===self||/\.(?:pdf|jpe?g|png|gif|webp|svg|zip|xml)$/i.test(path)||/\/(?:wp-|feed|tag|category|author)\b/i.test(path))continue;
  const key=u.toString(),text=decode(m[2].replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
  const x=out.get(key)||{url:key,texts:[]};if(text&&!x.texts.includes(text))x.texts.push(text.slice(0,120));out.set(key,x);
 }
 return [...out.values()];
}
// How well a link matches the subject: subject words (or their written-out form) in its address or anchor text.
function scoreLink(link,subject){
 let path='';try{path=fold(decodeURIComponent(new URL(link.url).pathname)).replace(/[^\p{L}\p{N}]+/gu,' ')}catch{}
 const text=fold(link.texts.join(' ')),hay=' '+path+' '+text+' ';
 const matched=subject.filter(w=>hay.includes(' '+w)||(SPELLED[w]&&hay.includes(SPELLED[w])));
 // A two-letter word ("ai") says less about the subject than a longer one ("geo", "zichtbaarheid").
 return {matched,score:matched.reduce((a,w)=>a+(w.length<=2?0.5:1),0)+(PRICE_PATH.test(path+' '+text)?0.5:0)+(PROVIDER.test(path+' '+text)?0.5:0)};
}

// status: NOT_A_PRICE_QUESTION | THIS_PAGE_HAS_PRICE | FOUND | NOT_FOUND | OWN_PAGE_UNREADABLE
async function findBestOwnPage({pageUrl,query,ownHtml=null,fetchHtml,max=MAX_READ}){
 if(!isPriceQuestion(query))return {status:'NOT_A_PRICE_QUESTION'};
 if(ownHtml==null){try{ownHtml=String((await fetchHtml(pageUrl))?.html||'')}catch{ownHtml=''}}
 if(!String(ownHtml).trim())return {status:'OWN_PAGE_UNREADABLE'};
 const own=factsOf(ownHtml);
 // A guide that mentions the price is not the service page (owner 2026-11-21: after a price line was added to
 // /ai-zichtbaarheid/, the hire question still belongs on the GEO service page). Only a page that is itself about the
 // service keeps the question; from a guide, a linked service page with a price wins.
 const servicePage=PROVIDER.test(fold(pageUrl+' '+headOf(ownHtml)));
 if(own.price&&servicePage)return {status:'THIS_PAGE_HAS_PRICE',excerpt:own.price.slice(0,220)};
 const subject=subjectWords(query),market=marketOf(pageUrl);
 const links=ownLinks(ownHtml,pageUrl).filter(l=>marketOf(l.url)===market).map(l=>({...l,...scoreLink(l,subject)})).filter(l=>l.matched.length);
 // A subject word that few links have says more than one that many links have ("geo" against "ai").
 const freq=new Map();for(const l of links)for(const w of l.matched)freq.set(w,(freq.get(w)||0)+1);
 for(const l of links)l.score+=l.matched.reduce((a,w)=>a+1/freq.get(w),0);
 // From a guide that names a price: only links to the service or its price ("GEO-specialist inhuren", "mijn tarief").
 const pool=own.price?links.filter(l=>{const t=fold(decodeURIComponent(l.url)+' '+l.texts.join(' ')).replace(/[^\p{L}\p{N}]+/gu,' ');return PROVIDER.test(t)||PRICE_PATH.test(t)}):links;
 const candidates=pool.sort((a,b)=>b.score-a.score||a.url.length-b.url.length).slice(0,max);
 const checked=[];
 for(const c of candidates){
  let html='';try{html=String((await fetchHtml(c.url))?.html||'')}catch{}
  checked.push(c.url);
  const f=html?factsOf(html):{};
  if(f.price)return {status:'FOUND',url:c.url,excerpt:f.price.slice(0,220),matched_words:c.matched,checked,also_on_this_page:!!own.price};
 }
 if(own.price)return {status:'THIS_PAGE_HAS_PRICE',excerpt:own.price.slice(0,220)};
 return {status:'NOT_FOUND',checked};
}

// One result per check, page and search term, kept in memory. A request waits at most waitMs.
function createBestOwnPageCache({fetchHtml,max=500,waitMs=15000}={}){
 const done=new Map(),running=new Map();
 return function bestFor({key,pageUrl,query}){
  if(!isPriceQuestion(query))return Promise.resolve({status:'NOT_A_PRICE_QUESTION'});
  const k=key+'\u0000'+pageUrl+'\u0000'+query,hit=done.get(k);if(hit)return Promise.resolve(hit);
  let run=running.get(k);
  if(!run){run=findBestOwnPage({pageUrl,query,fetchHtml})
   .then(r=>{if(r.status!=='OWN_PAGE_UNREADABLE'){if(done.size>=max)done.delete(done.keys().next().value);done.set(k,r)}return r})
   .catch(()=>({status:'OWN_PAGE_UNREADABLE'})).finally(()=>running.delete(k));running.set(k,run)}
  return Promise.race([run,new Promise(r=>setTimeout(()=>r({status:'RUNNING'}),waitMs).unref())]);
 };
}

module.exports={findBestOwnPage,createBestOwnPageCache,isPriceQuestion,subjectWords,ownLinks};
