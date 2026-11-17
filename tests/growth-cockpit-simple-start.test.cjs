'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {renderSimpleGrowthStart}=require('../src/growth-cockpit-simple-start.cjs');
const escapeHtml=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const pages=[{id:2290,url:'https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/',keyword:'emergency roof repair NJ'},
 {id:2291,url:'https://perfectroofingteam.com/roofing-services/',keyword:'roofing services',eligibility:{status:'PROTECTED'}}];
const opts={pages,token:'sample-token',siteMarkets:{countries:['US'],language:'en'},regions:['us — United States','nl — Netherlands'],
 languages:['English','Dutch'],countryName:x=>x==='US'?'United States':'Netherlands',languageName:x=>x==='en'?'English':'Dutch',escapeHtml};
const cockpit=fs.readFileSync(path.join(__dirname,'../src/tracker-growth-cockpit.cjs'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../public/growth-simple-start.js'),'utf8');
test('Growth starts with no selected page and no actionable Continue button',()=>{
 const html=renderSimpleGrowthStart(opts);
 assert.match(html,/<option value="">Choose a page…<\/option>/);
 assert.match(html,/id="growthSimpleContinue" disabled>Choose a page first/);
 assert.match(html,/Select a page first\. Nothing is selected automatically/);
 assert.match(js,/page\.value='';/);
 assert.match(js,/continueBtn\.disabled=!valid/);
 assert.match(js,/if\(!page\.value\|\|!selected/);
 assert.doesNotMatch(html,/No Search Console rows per country/);
 assert.doesNotMatch(html,/Not enough data to choose an opportunity/);
});
test('existing page, location, market and language are explicitly chosen with no silent provider request',()=>{
 const html=renderSimpleGrowthStart(opts);
 assert.match(html,/name="page_id"/);
 assert.match(html,/name="query"/);
 assert.match(html,/name="location"/);
 assert.match(html,/name="countries"/);
 assert.match(html,/name="language"/);
 assert.match(html,/us — United States/);
 assert.match(html,/value="English"/);
 assert.match(js,/growth\/markets\?page_id=/);
 assert.match(js,/if\(countries!==originalCountries\|\|language!==originalLanguage\)/);
 assert.match(js,/if\(question\)uri\+='&query='/);
 assert.match(js,/if\(location&&!question\)/);
 assert.doesNotMatch(js,/gsc-country-import|gsc-autofetch/);
});
test('new page uses Pre-Write while the old opportunity finder remains secondary',()=>{
 const html=renderSimpleGrowthStart(opts);
 assert.match(html,/\/growth\/new-page/);
 assert.match(html,/\?prewrite=1/);
 assert.match(cockpit,/g\.can_edit\?simpleLauncher/);
 assert.match(cockpit,/Advanced · Opportunity Finder, Search Console and history/);
 assert.match(cockpit,/growth-simple-start\.js\?v=/);
 const head=cockpit.indexOf('g.can_edit?simpleLauncher');
 const advanced=cockpit.indexOf('<details class="growth-details"',head);
 const old=cockpit.indexOf('g.can_edit?oppBox+siteMarketBox',head);
 assert.ok(head>0&&advanced>head&&old>advanced,'Old GSC-first content should be inside collapsed Advanced');
});
test('HTML-unsafe tracked keywords and urls are escaped',()=>{
 const html=renderSimpleGrowthStart({...opts,pages:[{id:3,url:'https://example.com/?a=1&b=2',keyword:'" onmouseover="alert(1)'}]});
 assert.doesNotMatch(html,/data-keyword="" onmouseover/);
 assert.match(html,/data-keyword="&quot; onmouseover=&quot;alert\(1\)"/);
 assert.match(html,/\?a=1&amp;b=2/);
});

test('switching pages uses that page’s saved market and language without silently replacing other page settings',()=>{
 const html=renderSimpleGrowthStart({...opts,pageMarketOverrides:{'2290':{countries:['NL'],language:'nl'}}});
 assert.match(html,/value="2290"[^>]*data-countries="nl — Netherlands"/);
 assert.match(html,/value="2290"[^>]*data-language="Dutch"/);
 assert.match(html,/value="2291"[^>]*data-countries="us — United States"/);
 assert.match(js,/function applySelectedSettings\(\)/);
 assert.match(js,/page\.addEventListener\('change',function\(\)\{applySelectedSettings\(\);sync\(\)\}\)/);
 assert.match(js,/originalCountries=opt\?String\(opt\.dataset\.countries/);
 assert.match(js,/if\(countries!==originalCountries\|\|language!==originalLanguage\)/);
});
