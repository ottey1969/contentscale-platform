'use strict';
// What Google shows for a search, read from the titles of ALL organic results, including results whose page could not
// be opened (Google redirect links). Titles only: never evidence for a section or a gap, and it never unlocks writing.
// It explains a blocked research in plain words, e.g. that most results are about a product with the same name.
const {classifyTitle}=require('./growth-reader-task-coverage.cjs');

// Words that make a title about a product (its review, pricing, login, alternatives or rebrand), in any industry.
const PRODUCT_MARKERS=/\b(reviews?|pricing|prices?|plans?|login|log in|sign in|sign up|alternatives?|competitors?|previously|formerly|rebrand(?:ed)?|detector|app|software|tool|platform|extension|plugin|coupon|discount|free trial)\b/i;
const CLASS_TEXT={SERVICE_PROVIDER:'pages of providers offering this service',PROVIDER_LIST:'lists of providers to choose from',INFORMATIONAL_GUIDE:'guides and explanations',COMMERCIAL_COMPARISON:'reviews, comparisons or pricing',
 PRODUCT_TOOL:'tool or product pages',LOCAL_SERVICE:'local service pages',UNCLASSIFIED:'not classified'};

function observeSerpTitles({query='',titles=[]}={}){
 const q=String(query||'').trim(),words=q.toLowerCase().split(/\s+/).filter(Boolean);
 const compact=words.join('').replace(/[^a-z0-9]/g,'');
 const phrase=words.length?new RegExp('\\b'+words.map(w=>w.replace(/[^a-z0-9]/g,'')).filter(Boolean).join('\\W+')+'\\b','i'):null;
 // The search term written as one word ("contentatscale") is a name; with product words around it, so is the phrase.
 const asName=t=>words.length>1&&compact.length>=6&&new RegExp('\\b'+compact+'\\b','i').test(String(t).replace(/[^a-z0-9 ]/gi,''));
 const seen=new Set(),rows=[];
 for(const x of Array.isArray(titles)?titles:[]){
  const title=String(x&&x.title||'').trim();if(!title||seen.has(title.toLowerCase()))continue;seen.add(title.toLowerCase());
  const product=asName(title)||(!!phrase&&phrase.test(title)&&PRODUCT_MARKERS.test(title)&&!PRODUCT_MARKERS.test(q));
  rows.push({title:title.slice(0,140),host:x.host||null,page_read:x.page_read===true,class:classifyTitle(title,''),product_named_like_search_term:product});
 }
 const counts={};for(const r of rows)counts[r.class]=(counts[r.class]||0)+1;
 const product=rows.filter(r=>r.product_named_like_search_term);
 const notRead=rows.filter(r=>!r.page_read).length;
 const top=Object.entries(counts).filter(([k])=>k!=='UNCLASSIFIED').sort((a,b)=>b[1]-a[1])[0];
 const notes=[];
 if(rows.length&&product.length/rows.length>=0.3)notes.push(product.length+' of '+rows.length+' Google results are about a product or brand named "'+q+'" (reviews, pricing, the tool itself). People searching this term often look for that product.');
 // "Mostly" only when it is so (report 65 said "mostly … (1 of 19)"); otherwise the largest groups are named as a mix.
 const ranked=Object.entries(counts).filter(([k])=>k!=='UNCLASSIFIED').sort((a,b)=>b[1]-a[1]);
 if(top&&top[1]/rows.length>=0.4)notes.push('By title, Google shows mostly '+CLASS_TEXT[top[0]]+' ('+top[1]+' of '+rows.length+').');
 else if(ranked.length)notes.push('By title, Google shows a mix: '+ranked.slice(0,3).map(([k,n])=>CLASS_TEXT[k]+' ('+n+')').join(', ')+' of '+rows.length+' results'+(counts.UNCLASSIFIED?'; '+counts.UNCLASSIFIED+' not classified':'')+'.');
 return {status:rows.length?'OBSERVED_FROM_TITLES':'NO_TITLES',basis:'TITLES_ONLY',query:q,titles_seen:rows.length,pages_not_read:notRead,
  class_counts:counts,product_named_like_search_term:product.length,examples:product.slice(0,5).map(r=>r.title),
  note:notes.join(' ')||null,
  limits:'Read from result titles only; a title is not the page. Never used as evidence for a section, a gap or writing.',
  titles:rows.slice(0,30)};
}
module.exports={observeSerpTitles};
