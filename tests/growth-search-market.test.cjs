'use strict';
// Report 56 review, point 4: an international page (page 2324 covers the Netherlands, the UK, Belgium and Luxembourg) was
// compared with a US English Google lookup only. The search market now comes from what the page itself states.
// LABELLED SYNTHETIC: report 56's page HTML was not available, so the pages below are minimal HTML written for this test
// to carry each signal (country domain, headings, hreflang, lang). The Serper responses are empty-shaped stubs; no
// result, ranking or position is invented, and the assertions are only about what is asked and reported.
const test=require('node:test'),assert=require('node:assert/strict');
const {deriveSearchLocale}=require('../src/growth-search-locale.cjs');
const {optionalGoogleOrganicDiscovery,discoverGrowthCompetitors}=require('../src/growth-public-search-discovery.cjs');

const international='<html lang="en-US"><title>International SEO for the Netherlands, the UK, Belgium and Luxembourg</title>'+
 '<h1>International SEO</h1><h2>SEO in the Netherlands</h2><h2>SEO in the UK</h2><h2>Belgium and Luxembourg</h2></html>';

test('the countries a page names in its headings are its markets; the most named first, a CMS default lang does not win',()=>{
 const l=deriveSearchLocale({html:international,url:'https://contentscale.site/international-seo'});
 assert.equal(l.source,'COUNTRIES_NAMED_IN_PAGE_HEADINGS');
 assert.deepEqual([l.country,...l.other_countries],['NL','GB','BE','LU']);
 assert.equal(l.gl,'nl');assert.equal(l.hl,'en','the page is in English, so the lookup language stays English');
});

test('other page signals, in order: country domain, own hreflang, lang region; no signal keeps the stated default',()=>{
 assert.deepEqual([deriveSearchLocale({html:'<html lang="nl"><h1>Dakreparatie</h1>',url:'https://example.nl/dak'})].map(l=>[l.country,l.gl,l.hl,l.source])[0],['NL','nl','nl','COUNTRY_CODE_DOMAIN']);
 assert.equal(deriveSearchLocale({html:'<h1>Roofing</h1>',url:'https://example.co.uk/roofing'}).gl,'uk');
 const h=deriveSearchLocale({html:'<link rel="alternate" hreflang="en-gb" href="https://example.com/x/"><link rel="alternate" hreflang="de-de" href="https://example.com/de/x">',url:'https://example.com/x'});
 assert.deepEqual([h.country,h.source,h.other_countries],['GB','HREFLANG_OF_THIS_PAGE',['DE']]);
 assert.equal(deriveSearchLocale({html:'<html lang="en-AU"><h1>x</h1>',url:'https://example.com/'}).gl,'au');
 const none=deriveSearchLocale({html:'<html lang="en"><h1>AI citation tracker</h1>',url:'https://example.io/x'});
 assert.deepEqual([none.country,none.gl,none.source],[null,'us','NO_MARKET_SIGNAL_ON_PAGE'],'a generic .io domain is not a country');
 assert.deepEqual(deriveSearchLocale({html:'<h1>Roof repair in New Jersey</h1>',url:'https://example.com/'}).signals.countries_named_in_headings,[],'"New Jersey" is not the country Jersey');
});

function serper(){const bodies=[];return {bodies,fetchImpl:async(_u,o)=>{bodies.push(JSON.parse(o.body));return {ok:true,json:async()=>({organic:[]})}}}}

test('Serper is asked in the page\'s market, the second paid call goes to its second market, the rest is listed as not searched',async()=>{
 const s=serper(),locale=deriveSearchLocale({html:international,url:'https://contentscale.site/international-seo'});
 const r=await optionalGoogleOrganicDiscovery({query:'international seo',ownUrl:'https://contentscale.site/international-seo',locale,key:'k',fetchImpl:s.fetchImpl});
 assert.deepEqual(s.bodies.map(b=>[b.gl,b.hl]),[['nl','en'],['uk','en']],'two paid calls, never more');
 assert.deepEqual(r.scope.searched_markets,['nl','uk']);
 assert.deepEqual(r.scope.target_markets_not_searched.map(x=>x.country),['BE','LU']);
 assert.equal(r.scope.market_source,'COUNTRIES_NAMED_IN_PAGE_HEADINGS');
 assert.match(r.warning,/Netherlands lookup/);assert.match(r.warning,/Not searched \(at most two paid calls per run\): Belgium, Luxembourg/);
 assert.equal(r.next_page_retry,null,'the second call was the second market, not page 2');
});

test('unchanged where the page states no market, and a US-state market keeps its US location lookup',async()=>{
 const a=serper();
 const r=await optionalGoogleOrganicDiscovery({query:'ai citation tracker',ownUrl:'https://example.io/x',locale:deriveSearchLocale({html:'<h1>x</h1>',url:'https://example.io/x'}),key:'k',fetchImpl:a.fetchImpl});
 assert.deepEqual(a.bodies[0],{q:'ai citation tracker',gl:'us',hl:'en',num:10});
 assert.equal(a.bodies.length,2,'thin first page: the existing page-2 retry');assert.equal(a.bodies[1].page,2);
 assert.match(r.warning,/US English lookup \(default: the page states no market\)/);
 const b=serper();
 await optionalGoogleOrganicDiscovery({query:'roof repair',ownUrl:'https://example.com/x',market:{states:['NJ'],country:'us',location:'New Jersey, United States'},
  locale:{country:'NL',gl:'nl',hl:'nl',other_countries:['BE']},key:'k',fetchImpl:b.fetchImpl});
 assert.deepEqual([b.bodies[0].gl,b.bodies[0].location],['us','New Jersey, United States']);
 assert(b.bodies.every(x=>x.gl==='us'));
});

test('the free Bing lookup carries the same market; without one its request is unchanged',async()=>{
 const urls=[];const fetchFeed=async u=>{urls.push(new URL(u));return {html:'<rss><channel></channel></rss>'}};
 await discoverGrowthCompetitors({query:'international seo',ownUrl:'https://contentscale.site/x',locale:{country:'NL',hl:'en'},fetchFeed});
 await discoverGrowthCompetitors({query:'international seo',ownUrl:'https://contentscale.site/x',fetchFeed});
 assert.deepEqual([urls[0].searchParams.get('cc'),urls[0].searchParams.get('setlang')],['NL','en']);
 assert.deepEqual([...urls[1].searchParams.keys()],['q','format']);
});
