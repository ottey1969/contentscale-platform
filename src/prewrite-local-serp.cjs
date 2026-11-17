'use strict';
// Share the exact country, language and optional Google location across Pre-Write
// customer question discovery and the full ranking-competitor SERP.
const {validLanguage}=require('./growth-search-locale.cjs');
function locationFromInput(raw,country='us'){
 let value=String(raw||'').replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim();
 if(!value)return '';
 if(value.length>100||!/^[\p{L}\p{N} ,.'’()\-]{2,100}$/u.test(value))throw new Error('INVALID_PREWRITE_SEARCH_LOCATION');
 if(/^nj$/i.test(value))value='New Jersey, United States';
 if(/^new jersey$/i.test(value))value='New Jersey, United States';
 if(value.toLowerCase()==='new jersey, united states'&&String(country).toLowerCase()!=='us')
  throw new Error('PREWRITE_LOCATION_COUNTRY_MISMATCH');
 return value;
}
function googleMarket({region='us',language='English',location=''}={}){
 const gl=(String(region||'us').match(/^\s*([a-z]{2})/i)||[])[1]?.toLowerCase()||'us';
 const hl=validLanguage(language)||'en';
 return {gl:gl==='gb'?'uk':gl,hl,location:locationFromInput(location,gl)};
}
function serperParams(query,market,num=10){
 const body={q:String(query||''),num,hl:market.hl,gl:market.gl};
 if(market.location)body.location=market.location;
 return body;
}
module.exports={locationFromInput,googleMarket,serperParams};
