'use strict';
// The Free Growth search location (owner 2026-11-21: "moet ook andere landen ondersteunen"): a city or region in the first
// (main) target market, in any country. Google is then searched in that country and language, localised to the place. A US
// state or "City, ST" keeps the US rules. The country may be named in English, Dutch, Spanish, German, French or as its code.
const {statesIn,US:US_STATES}=require('../growth-serp-quality.cjs');
const {PREWRITE_REGIONS}=require('../growth-search-locale.cjs');

const CODES=[...new Set(PREWRITE_REGIONS.map(r=>String(r).split(/\s/)[0].toUpperCase()).filter(c=>/^[A-Z]{2}$/.test(c)).map(c=>c==='UK'?'GB':c))];
const english=code=>{try{return new Intl.DisplayNames(['en'],{type:'region'}).of(code)||code}catch{return code}};
const NAMES=new Map();
for(const code of CODES){
 NAMES.set(code.toLowerCase(),code);
 for(const lang of ['en','nl','es','de','fr','pt','it']){try{const n=new Intl.DisplayNames([lang],{type:'region'}).of(code);if(n&&n!==code)NAMES.set(n.toLowerCase(),code)}catch{}}
}
for(const [n,c] of [['holland','NL'],['usa','US'],['united states of america','US'],['uk','GB'],['great britain','GB'],['england','GB']])NAMES.set(n,c);
const countryOf=part=>NAMES.get(part.toLowerCase().replace(/^the\s+/,'').replace(/\.$/,''))||null;
const SAFE=/^[\p{L}\p{N}][\p{L}\p{N}\p{M}\s'’.&()-]*$/u;

// → null (empty), {error, country?}, or {location, country, states}.
function readSearchLocation(raw,countries=[]){
 const v=String(raw==null?'':raw).replace(/\s+/g,' ').trim();if(!v)return null;
 if(v.length>120||/[<>\r\n]/.test(v))return {error:'INVALID'};
 const parts=v.split(',').map(x=>x.trim()).filter(Boolean);
 if(!parts.length||!parts.every(p=>SAFE.test(p)))return {error:'INVALID'};
 let named=null;const rest=[];
 for(const p of parts){const c=parts.length>1&&!named?countryOf(p):null;if(c){named=c;continue}rest.push(p)}
 const first=countries[0]||null;
 const states=statesIn(v);
 // The United States: one state, as before.
 if(named==='US'||(!named&&states.length&&(!first||first==='US'))){
  if(states.length!==1||!US_STATES[states[0]])return {error:'INVALID'};
  if(first&&first!=='US')return {error:'LOCATION_NOT_IN_FIRST_MARKET',country:'US'};
  return {location:v,country:'US',states};
 }
 if(!first)return {error:'MARKET_NEEDED'};
 if(named&&named!==first)return {error:'LOCATION_NOT_IN_FIRST_MARKET',country:named};
 if(!rest.length)return {error:'INVALID'};
 return {location:[...rest,english(first)].join(', '),country:first,states:[]};
}
// The visitor-facing message for a refusal (English; error-texts.cjs gives Dutch and Spanish).
function locationError(r){
 if(r.error==='MARKET_NEEDED')return 'Choose the target market for this search location, for example nl — Netherlands.';
 if(r.error==='LOCATION_NOT_IN_FIRST_MARKET'){const n=english(r.country);return `This search location is in ${n}: put ${r.country.toLowerCase()} — ${n} first in the target market.`}
 return 'Enter a city or region, for example Amsterdam (with nl — Netherlands as target market) or New Jersey, United States.';
}
module.exports={readSearchLocation,locationError,englishCountry:english};
