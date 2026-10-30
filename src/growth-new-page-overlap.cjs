'use strict';
// A new page must not compete with a page the site already has. Checked against the client's tracked pages (their
// keyword and URL), word-based and stated as such:
//  - a tracked page with the SAME keyword: the existing page should be improved instead (Existing page research);
//    writing a new page then needs the owner's explicit confirmation;
//  - a tracked page whose keyword or URL holds most of the keyword's words, or whose keyword lies fully inside the new
//    keyword (or the other way round): a possible overlap, shown as a warning;
//  - per topic: a tracked page whose keyword or URL holds the topic's own words (beyond the keyword) may already cover
//    it; the topic is marked and not recommended.
const {terms}=require('./growth-one-action-decision.cjs');
const {matchedTerms}=require('./growth-word-match.cjs');
const norm=t=>String(t||'').toLowerCase().replace(/\s+/g,' ').trim();
const slugWords=u=>{try{return decodeURIComponent(new URL(u).pathname).replace(/[-_/.]+/g,' ')}catch{return ''}};

function checkNewPageOverlap({keyword='',sitePages=[],items=[]}={}){
 const kw=norm(keyword),kWords=terms(kw);
 const pages=(sitePages||[]).filter(p=>p&&p.url).map(p=>({page_id:p.id!=null?Number(p.id):null,url:p.url,keyword:p.keyword||null,words:terms(String(p.keyword||'')+' '+slugWords(p.url))}));
 const exact=pages.filter(p=>p.keyword&&norm(p.keyword)===kw);
 const need=Math.max(2,Math.ceil(kWords.length*0.75));
 // Possible overlap: most of the keyword's words in the page's keyword or URL, or one keyword fully inside the other
 // ("free ai citation tracker" vs a page for "ai citation tracker").
 const inside=(a,b)=>a.length>=2&&matchedTerms(a,b).length===a.length;
 const possible=pages.filter(p=>{if(exact.includes(p)||kWords.length<2)return false;const pk=terms(p.keyword||'');
  return matchedTerms(kWords,p.words).length>=need||inside(pk,kWords)||inside(kWords,pk)});
 for(const it of items){
  if(!it||!it.writable)continue;
  const own=terms(it.title||'').filter(w=>!matchedTerms([w],kWords).length);
  if(own.length<2)continue;
  const hits=pages.filter(p=>matchedTerms(own,p.words).length>=2);
  if(!hits.length)continue;
  it.existing_page_overlap=hits.slice(0,3).map(p=>({page_id:p.page_id,url:p.url}));
  if(it.priority){it.priority.why=[...(it.priority.why||[]),'an existing page may already cover it ('+hits[0].url+')'];}
  if(it.recommended)delete it.recommended;
 }
 const strip=p=>({page_id:p.page_id,url:p.url,keyword:p.keyword});
 return {status:exact.length?'EXISTING_PAGE_TARGETS_THIS_KEYWORD':possible.length?'POSSIBLE_OVERLAP':'NO_OVERLAP_FOUND',
  exact:exact.map(strip),possible:possible.map(strip),checked_pages:pages.length,
  note:exact.length?'A tracked page already targets this keyword. Improve that page (Existing page research) instead of writing a new one; writing a new page needs your explicit confirmation.':
   possible.length?'A tracked page holds most of this keyword. Check that the new page answers a different search before writing it.':
   'No tracked page targets this keyword (compared by keyword and URL words with '+pages.length+' tracked page(s)).'};
}
module.exports={checkNewPageOverlap};
