'use strict';
// Owner 2026-11-21 (Free Growth form, "Amsterdam, nederland" refused with "Choose one US state…"): "moet ook ANDERE LANDEN
// ONDERSTEUNEN / NL EN BE KAN DAT ZO?". A search location is a city or region in the first (main) target market, in any
// country: Google then searches in that country and language, localised to that place. A US state keeps its own rules.
const test=require('node:test'),assert=require('node:assert/strict');
const {readSearchLocation}=require('../src/growth-free/search-location.cjs');
const {optionalGoogleOrganicDiscovery}=require('../src/growth-public-search-discovery.cjs');

test('a city or region in any target market; the country named in any language; normalised as Google names places',()=>{
 assert.deepEqual(readSearchLocation('Amsterdam, nederland',['NL']),{location:'Amsterdam, Netherlands',country:'NL',states:[]});
 assert.deepEqual(readSearchLocation('Amsterdam',['NL','BE']),{location:'Amsterdam, Netherlands',country:'NL',states:[]});
 assert.equal(readSearchLocation('Antwerpen, België',['BE','NL']).location,'Antwerpen, Belgium');
 assert.equal(readSearchLocation('Noord-Holland',['NL']).location,'Noord-Holland, Netherlands');
 assert.equal(readSearchLocation('Madrid, España',['ES']).location,'Madrid, Spain');
 assert.equal(readSearchLocation("Den Haag, The Netherlands",['NL']).location,'Den Haag, Netherlands');
 assert.equal(readSearchLocation('Utrecht, NL',['NL']).location,'Utrecht, Netherlands');
});
test('the place must be in the first target market; a market is needed outside the US; US states as before',()=>{
 const notFirst=readSearchLocation('Amsterdam, Nederland',['BE','NL']);
 assert.equal(notFirst.error,'LOCATION_NOT_IN_FIRST_MARKET');assert.equal(notFirst.country,'NL');
 assert.equal(readSearchLocation('Amsterdam',[]).error,'MARKET_NEEDED');
 assert.deepEqual(readSearchLocation('New Jersey, United States',[]),{location:'New Jersey, United States',country:'US',states:['NJ']});
 assert.deepEqual(readSearchLocation('Lodi, NJ',['US']).states,['NJ']);
 assert.equal(readSearchLocation('New Jersey, United States',['NL']).error,'LOCATION_NOT_IN_FIRST_MARKET');
 assert.equal(readSearchLocation('<script>',['NL']).error,'INVALID');
 assert.equal(readSearchLocation('x'.repeat(130),['NL']).error,'INVALID');
 assert.equal(readSearchLocation('',['NL']),null);
});
test('Google is searched in the market of the place, localised to it',async()=>{
 let body=null;
 const fetchImpl=async(url,o)=>{if(String(url).includes('serper')){body=JSON.parse(o.body);return {ok:true,json:async()=>({organic:[]})}}throw Error('no')};
 await optionalGoogleOrganicDiscovery({query:'dakdekker amsterdam',ownUrl:'https://dak.example/',key:'k',fetchImpl,
  market:{gl:'nl',hl:'nl',location:'Amsterdam, Netherlands',states:[]}});
 assert.deepEqual({gl:body.gl,hl:body.hl,location:body.location},{gl:'nl',hl:'nl',location:'Amsterdam, Netherlands'});
 await optionalGoogleOrganicDiscovery({query:'roof repair',ownUrl:'https://dak.example/',key:'k',fetchImpl,
  market:{location:'New Jersey, United States',states:['NJ'],country:'us'}});
 assert.deepEqual({gl:body.gl,hl:body.hl},{gl:'us',hl:'en'},'a US state keeps the US lookup');
});
