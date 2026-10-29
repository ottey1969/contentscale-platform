// Renders report.competitor_overview for the editor: what the ranking pages have that this page does not.
// Shared by the Growth research page and the CMS handoff page. textContent only (report data is never HTML).
(function(){
 'use strict';
 function el(tag,text,parent,cls){var n=document.createElement(tag);if(text!=null)n.textContent=String(text);if(cls)n.className=cls;if(parent)parent.appendChild(n);return n}
 function host(u){try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return String(u||'')}}
 window.renderGrowthCompetitorOverview=function(o,parent){
  if(!o||!parent)return false;
  var box=el('div',null,parent,'growth-competitor-overview');
  el('h2','What the ranking pages have that this page does not',box);
  if(o.status!=='OBSERVED'){el('p','No comparison available ('+(o.status||'unknown')+'; '+(o.ranking_pages_read||0)+' ranking page(s) readable).',box);return true}
  el('p','Compared with '+o.ranking_pages_read+' readable ranking page(s) for “'+o.query+'”. This is what those pages contain, not a fact check and not a promise of rankings. You decide what to add.',box,'small');
  var L=o.length||{};
  el('p','Length: this page '+L.this_page_words+' words and '+L.this_page_h2+' H2 headings; ranking pages (median) '+L.ranking_pages_median_words+' words and '+L.ranking_pages_median_h2+' H2 headings.',box);
  var els=(o.elements_they_have_and_this_page_lacks||[]),sd=(o.structured_data_they_have_and_this_page_lacks||[]);
  el('h3','Page elements',box);
  if(!els.length&&!sd.length)el('p','No element that most ranking pages have is missing here.',box);
  else{var ul=el('ul',null,box);
   els.forEach(function(f){el('li',f.label+' — on '+f.ranking_pages_with_it+' of '+f.of+' ranking pages, not on this page',ul)});
   sd.forEach(function(f){el('li','Structured data “'+f.type+'” — on '+f.ranking_pages_with_it+' of '+f.of+' ranking pages, not on this page',ul)})}
  el('h3','Topics',box);
  if(o.topics_status==='GROUPED'&&Array.isArray(o.topics)){
   var missing=o.topics.filter(function(t){return t.this_page==='NO'}),partly=o.topics.filter(function(t){return t.this_page==='PARTLY'}),unknown=o.topics.filter(function(t){return t.this_page==='UNKNOWN'});
   [['Not on this page',missing],['Only partly on this page',partly],['Could not be matched to this page',unknown]].forEach(function(g){
    if(!g[1].length)return;el('h4',g[0]+' ('+g[1].length+')',box);var list=el('ul',null,box);
    g[1].forEach(function(t){var li=el('li',null,list);el('strong',t.topic,li);
     el('span',' — '+t.ranking_pages+' ranking page(s)'+(t.this_page_heading?'; closest here: “'+t.this_page_heading+'”':''),li);
     var ex=el('ul',null,li);t.sections.slice(0,4).forEach(function(s){el('li',(s.position?'#'+s.position+' ':'')+s.host+': '+s.heading,ex)})})});
   var covered=o.topics.filter(function(t){return t.this_page==='YES'}).length;
   if(covered)el('p',covered+' topic(s) of the ranking pages are already covered on this page.',box,'small');
  }else el('p','Topics are listed per ranking page but not grouped ('+String(o.topics_status||'').replace(/_/g,' ').toLowerCase()+').',box,'small');
  var rest=o.ungrouped_sections||[];
  if(rest.length){var d=el('details',null,box);el('summary',(o.topics_status==='GROUPED'?'Other ranking-page sections':'All ranking-page sections')+' ('+rest.length+')',d);
   var ul2=el('ul',null,d);rest.forEach(function(s){el('li',(s.position?'#'+s.position+' ':'')+s.host+': '+s.heading,ul2)})}
  var pages=el('details',null,box);el('summary','Ranking pages read ('+(o.ranking_pages||[]).length+')',pages);
  var ul3=el('ul',null,pages);(o.ranking_pages||[]).forEach(function(p){var e=p.elements||{};
   el('li',(p.serp_position?'#'+p.serp_position+' ':'')+host(p.url)+' — '+e.words+' words, '+e.h2+' H2, '+(e.faq?'FAQ, ':'')+(e.tables?e.tables+' table(s), ':'')+(e.video?'video, ':'')+(e.structured_data||[]).join('/')+(p.partial_capture?' (cut at the read limit)':''),ul3)});
  return true;
 };
})();
