'use strict';
// The search market a page competes in, from what the page itself states — never from an industry list or a guess:
//  1. a country-code domain (example.nl, example.co.uk);
//  2. countries named in the page's own title and headings (an international page names its markets: "SEO for the
//     Netherlands, the UK, Belgium and Luxembourg"); the most-named one first, the others listed as further markets;
//  3. the region of its own hreflang alternate;
//  4. the region of <html lang="en-GB">.
// These signals are EVIDENCE, not a business decision: which market matters most is the owner's call. A market set in the
// Tracker for the page (configured) always wins and is the only "confirmed" market; a derived market is labelled
// unconfirmed, and when a page names several countries their order is marked as not confirmed either.
// Country names come from the platform's region data (Intl.DisplayNames, English and the page language), so every
// country is treated alike. Without any signal the lookup stays the documented default (US, English) and says so.
const SKIP=new Set(['EU','EZ','UN','QO','XA','XB','ZZ','AQ']);
// Country-code domains Google treats as generic (Search Central, "generic country code top-level domains"); every other
// two-letter domain, such as .it or .in, is a country signal.
const GENERIC_TLD=new Set(['ad','as','bz','cc','cd','co','dj','fm','io','la','me','ms','nu','sc','sr','su','tv','tk','ws']);
const CODES=(()=>{const out=[];for(let a=65;a<=90;a++)for(let b=65;b<=90;b++)out.push(String.fromCharCode(a,b));return out})();
const namesFor=lang=>{let d;try{d=new Intl.DisplayNames([lang],{type:'region',fallback:'none'})}catch{return []}
 return CODES.filter(c=>!SKIP.has(c)).map(c=>{let n;try{n=d.of(c)}catch{n=null}return n&&n!==c?[n,c]:null}).filter(Boolean)};
const cache=new Map();
function countryNames(lang){
 const key=String(lang||'en').toLowerCase();if(cache.has(key))return cache.get(key);
 const pairs=[...namesFor('en'),...(key==='en'?[]:namesFor(key))];
 // Common short forms of the same countries.
 pairs.push(['UK','GB'],['U.K.','GB'],['Great Britain','GB'],['USA','US'],['U.S.','US'],['US','US'],['United States of America','US'],['Holland','NL']);
 const list=pairs.map(([name,code])=>({name,code,re:new RegExp('(?<![\\p{L}.])(?<!New\\s)'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}])','gu')}));
 cache.set(key,list);return list;
}
const attr=(tag,name)=>{const m=String(tag).match(new RegExp('\\b'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i'));return m?(m[1]??m[2]??m[3]):null};
const tidy=t=>String(t||'').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/gi,' ').replace(/\s+/g,' ').trim();
const regionOf=tag=>{const m=String(tag||'').match(/^[a-z]{2,3}[-_]([a-z]{2})$/i);return m?m[1].toUpperCase():null};
// Google's gl value for the United Kingdom is "uk"; every other country uses its ISO code.
const glOf=code=>code==='GB'?'uk':code.toLowerCase();

function deriveSearchLocale({html='',url='',headings=[],configured=null}={}){
 const raw=String(html||'');
 const lang=(attr((raw.match(/<html\b[^>]*>/i)||[''])[0],'lang')||'').trim();
 const language=(lang.match(/^([a-z]{2,3})\b/i)||[])[1]?.toLowerCase()||null;
 let host='',tld='';try{host=new URL(url).hostname.toLowerCase();tld=host.split('.').pop()}catch{}
 const tldCountry=/^[a-z]{2}$/.test(tld)&&!GENERIC_TLD.has(tld)?(tld==='uk'?'GB':tld.toUpperCase()):null;
 // Headings as the page states them: title, h1, h2 (passed in, or read from the HTML).
 const hs=(headings.length?headings:[...raw.matchAll(/<(title|h1|h2)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map(m=>m[2])).map(tidy).filter(Boolean).slice(0,60);
 const counts=new Map(),first=new Map();
 hs.forEach((h,i)=>{for(const c of countryNames(language||'en'))for(const m of h.matchAll(c.re)){
  counts.set(c.code,(counts.get(c.code)||0)+1);const at=i*100000+m.index;if(!(first.get(c.code)<=at))first.set(c.code,at)}});
 const named=[...counts.keys()].sort((a,b)=>counts.get(b)-counts.get(a)||first.get(a)-first.get(b));
 const alternates=[...raw.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]).filter(t=>/\brel\s*=\s*["']?alternate/i.test(t)&&attr(t,'hreflang'))
  .map(t=>({region:regionOf(attr(t,'hreflang')),href:attr(t,'href')})).filter(a=>a.region);
 const same=h=>{try{const u=new URL(h,url),p=new URL(url);return u.hostname===p.hostname&&u.pathname.replace(/\/$/,'')===p.pathname.replace(/\/$/,'')}catch{return false}};
 const self=alternates.find(a=>same(a.href))?.region||null;
 const [country,source]=tldCountry?[tldCountry,'COUNTRY_CODE_DOMAIN']:named.length?[named[0],'COUNTRIES_NAMED_IN_PAGE_HEADINGS']:
  self?[self,'HREFLANG_OF_THIS_PAGE']:regionOf(lang)?[regionOf(lang),'HTML_LANG_REGION']:[null,'NO_MARKET_SIGNAL_ON_PAGE'];
 const others=[...new Set([...named,...alternates.map(a=>a.region)])].filter(c=>c!==country);
 const signals={html_lang:lang||null,domain_country:tldCountry,countries_named_in_headings:named,hreflang_regions:[...new Set(alternates.map(a=>a.region))]};
 const set=validCountries(configured?.countries);
 if(set.length)return {country:set[0],gl:glOf(set[0]),hl:validLanguage(configured.language)||language||'en',other_countries:set.slice(1),
  source:configured.source||'SET_IN_TRACKER',confirmed:true,priority_confirmed:true,suggested:[country,...others].filter(Boolean),signals};
 return {country,gl:country?glOf(country):'us',hl:language||'en',other_countries:others,source,confirmed:false,
  // Several countries named: the most-named first is a guess at priority, never a decision.
  priority_confirmed:!others.length,signals:{html_lang:lang||null,domain_country:tldCountry,countries_named_in_headings:named,hreflang_regions:[...new Set(alternates.map(a=>a.region))]}};
}
// Owner input: ISO 3166 two-letter codes the platform knows (UK accepted for GB), order kept, at most six.
const REGION=new Intl.DisplayNames(['en'],{type:'region',fallback:'none'});
// Accepts what the Pre-Write brief's region picker produces ("nl — Netherlands"), a plain code ("nl", "UK") or an English
// country name ("Netherlands").
const REGION_BY_NAME=new Map(namesFor('en').map(([n,c])=>[n.toLowerCase(),c]));
function validCountries(list){
 const out=[];for(const raw of Array.isArray(list)?list:[]){const t=String(raw||'').trim(),lead=(t.match(/^([a-z]{2})\s*[—–-]\s*\S/i)||[])[1];
  let c=(lead||t).toUpperCase();if(c==='UK')c='GB';if(!/^[A-Z]{2}$/.test(c))c=REGION_BY_NAME.get(t.toLowerCase())||c;
  let ok=false;try{ok=/^[A-Z]{2}$/.test(c)&&!SKIP.has(c)&&!!REGION.of(c)}catch{}
  if(ok&&!out.includes(c))out.push(c)}
 return out.slice(0,6);
}
// A language as the Pre-Write brief names it ("Dutch", "Chinese (Simplified)", "Arabic — Gulf") or as a code ("nl").
const LANG=new Intl.DisplayNames(['en'],{type:'language',fallback:'none'});
const LANGUAGE_BY_NAME=(()=>{const m=new Map();for(let a=97;a<=122;a++)for(let b=97;b<=122;b++){const c=String.fromCharCode(a,b);let n=null;try{n=LANG.of(c)}catch{}if(n&&n!==c&&!m.has(n.toLowerCase()))m.set(n.toLowerCase(),c)}return m})();
const validLanguage=l=>{const x=String(l||'').trim().toLowerCase();if(!x)return null;
 try{if(/^[a-z]{2,3}$/.test(x)&&LANG.of(x)&&LANG.of(x)!==x)return x}catch{}
 return LANGUAGE_BY_NAME.get(x.replace(/\s*[—–-].*$/,'').replace(/\s*\(.*\)\s*$/,'').trim())||null};
const languageName=code=>{try{return code?LANG.of(code):null}catch{return null}};
const countryName=code=>{try{return new Intl.DisplayNames(['en'],{type:'region'}).of(code)}catch{return code}};
module.exports={deriveSearchLocale,glOf,countryName,validCountries,validLanguage,languageName};
