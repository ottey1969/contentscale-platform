'use strict';
// The first Growth action is always a deliberate page choice. Search Console
// prioritization is optional and belongs in Advanced, not the starting flow.
function renderSimpleGrowthStart({pages=[],token='',siteMarkets=null,pageMarketOverrides={},regions=[],languages=[],countryName,languageName,escapeHtml}={}){
 const esc=typeof escapeHtml==='function'?escapeHtml:x=>String(x||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const path='/track/'+encodeURIComponent(token);
 const country=c=>String(c).toLowerCase()+' — '+(typeof countryName==='function'?countryName(c):String(c));
 const markets=(siteMarkets?.countries||[]).map(country).join(', ');
 const language=siteMarkets?.language&&typeof languageName==='function'?languageName(siteMarkets.language):'';
 return '<section class="growth-guide growth-simple-start" id="growthStart" aria-labelledby="growthSimpleHeading">'+
  '<p class="growth-step-guide">GROWTH · START HERE</p>'+
  '<h2 id="growthSimpleHeading">Choose the page to improve</h2>'+
  '<form id="growthSimpleForm" autocomplete="off">'+
  '<label for="growthSimpleFilter"><strong>1. Existing page</strong></label>'+
  '<input id="growthSimpleFilter" type="search" placeholder="Find a page by name or URL">'+
  '<select id="growthSimplePage" name="page_id" required>'+
  '<option value="">Choose a page…</option>'+
  pages.map(p=>{const own=pageMarketOverrides?.[String(p.id)]||null;return '<option value="'+esc(p.id)+'" data-keyword="'+esc(p.keyword||'')+'" data-countries="'+esc(own?.countries?.length?own.countries.map(country).join(', '):markets)+'" data-language="'+esc(own?.language&&typeof languageName==='function'?languageName(own.language):language)+'">'+esc(p.url)+(p.keyword?' · '+esc(p.keyword):'')+(p.eligibility?.status==='PROTECTED'?' · Research only':'')+'</option>'}).join('')+
  '</select>'+
  '<small id="growthSimplePageStatus" role="status">Select a page first. Nothing is selected automatically.</small>'+
  '<label for="growthSimpleQuery"><strong>2. Customer question or seed keyword</strong> (optional)</label>'+
  '<input id="growthSimpleQuery" name="query" maxlength="300" placeholder="e.g. Who offers 24-hour emergency roof repair in New Jersey?">'+
  '<label for="growthSimpleLocation"><strong>Location</strong> (optional)</label>'+
  '<input id="growthSimpleLocation" name="location" maxlength="100" placeholder="e.g. New Jersey or Amsterdam">'+
  '<div class="growth-simple-locales">'+
  '<label for="growthSimpleMarket"><strong>3. Target country</strong><input id="growthSimpleMarket" name="countries" list="growthSimpleRegions" value="'+esc(markets)+'" placeholder="us — United States"></label>'+
  '<label for="growthSimpleLanguage"><strong>Language</strong><input id="growthSimpleLanguage" name="language" list="growthSimpleLanguages" value="'+esc(language)+'" placeholder="English"></label>'+
  '</div>'+
  '<datalist id="growthSimpleRegions">'+regions.map(v=>'<option value="'+esc(v)+'">').join('')+'</datalist>'+
  '<datalist id="growthSimpleLanguages">'+languages.map(v=>'<option value="'+esc(v)+'">').join('')+'</datalist>'+
  '<button type="submit" id="growthSimpleContinue" disabled>Choose a page first</button>'+
  '<small id="growthSimpleStatus" role="status">No Search Console connection required. Growth research produces the complete external AI Brief.</small>'+
  '</form>'+
  '<p class="growth-simple-new"><strong>Need a new page?</strong> <a href="'+path+'/growth/new-page">Use an existing Pre-Write brief</a> · <a href="'+path+'?prewrite=1">Create a Pre-Write brief</a></p>'+
  '<input type="hidden" id="growthSimpleOriginalCountries" value="'+esc(markets)+'">'+
  '<input type="hidden" id="growthSimpleOriginalLanguage" value="'+esc(language)+'">'+
  '</section>';
}
module.exports={renderSimpleGrowthStart};
