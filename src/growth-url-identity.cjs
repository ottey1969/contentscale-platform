'use strict';
// URL identity for Tracker and Growth: what a tracked URL really is, from the HTTP evidence of one bounded, SSRF-safe read.
// Kinds are kept apart on purpose: only a 301/308 chain proves "one page under two addresses". A temporary redirect, a
// canonical tag or an identical title/H1 is reported as what it is, never as a proven 301.
const norm=u=>{try{const x=new URL(u);return (x.origin+x.pathname.replace(/\/+$/,'')).toLowerCase()}catch{return ''}};
const sameUrl=(a,b)=>!!a&&!!b&&norm(a)===norm(b);
const PERMANENT=new Set([301,308]);
const canonicalOf=(html,base)=>{
 const tag=(String(html||'').match(/<link\b[^>]*\brel=["']?canonical\b[^>]*>/i)||[''])[0];
 const href=(tag.match(/\bhref=["']([^"']+)["']/i)||[])[1];
 try{return href?new URL(href,base).href:null}catch{return null}
};
// fetched: the reader result ({requested_url, final_url, redirect_chain, html}) or its error ({code, redirect_chain}).
function identityFromFetch(url,fetched){
 const chain=Array.isArray(fetched?.redirect_chain)?fetched.redirect_chain.map(h=>({url:h.url,status:h.status,location:h.location})):[];
 const error=fetched?.error||null;
 const finalUrl=error?null:(fetched?.final_url||url);
 const statuses=chain.map(h=>h.status);
 let kind;
 if(error==='REDIRECT_LOOP')kind='REDIRECT_LOOP';
 else if(error==='REDIRECT_LIMIT')kind='REDIRECT_CHAIN_TOO_LONG';
 else if(error&&chain.length)kind='REDIRECT_DESTINATION_UNAVAILABLE';
 else if(error)kind='URL_UNAVAILABLE';
 else if(sameUrl(url,finalUrl))kind='NO_REDIRECT';
 // A reader that followed redirects without reporting hops: moved, but the status (permanent or not) is unproven.
 else if(!chain.length)kind='REDIRECT_STATUS_UNKNOWN';
 else kind=statuses.every(s=>PERMANENT.has(s))?'PERMANENT_REDIRECT':'TEMPORARY_REDIRECT';
 const canonical=error?null:canonicalOf(fetched?.html,finalUrl);
 return {original_url:url,final_url:finalUrl,kind,http_statuses:statuses,redirect_chain:chain,error,
  canonical_url:canonical,canonical_points_elsewhere:!!canonical&&!sameUrl(canonical,finalUrl),
  // Only a permanent chain makes the old address an alias of the final page.
  alias_of:kind==='PERMANENT_REDIRECT'?finalUrl:null};
}
// One owner-facing sentence set per kind (English UI, JSON and Markdown use the same text).
function identityAdvice(id,{lockedUrls=[]}={}){
 if(!id)return null;
 const locked=id.final_url&&lockedUrls.some(u=>sameUrl(u,id.final_url));
 const lockNote=locked?' The final page is a locked Case Study: edits to it are blocked until the Case Study measurement cycle ends; research continues.':'';
 const code=(id.http_statuses||[]).join(' → ');
 switch(id.kind){
  case 'PERMANENT_REDIRECT':return id.original_url===id.final_url?null:
   code.split(' → ')[0]+' redirect detected: '+id.original_url+' → '+id.final_url+'. This is one page, not duplicate content. Keep the working redirect; no website change is required. Tracker should use '+id.final_url+' as the page identity and retain '+id.original_url+' as an alias.'+lockNote;
  case 'TEMPORARY_REDIRECT':return 'Temporary redirect detected ('+code+'): '+id.original_url+' → '+id.final_url+'. A temporary redirect does not merge the two URLs; search engines may keep the old URL. If the move is permanent, a 301 is the usual choice; if it is intentional and temporary, no change is needed. The two URLs are not treated as one page.'+lockNote;
  case 'REDIRECT_LOOP':return 'Redirect loop detected starting at '+id.original_url+' ('+code+'). The page cannot be reached; fix the redirect rules. No page identity was assumed.';
  case 'REDIRECT_CHAIN_TOO_LONG':return 'Redirect chain too long from '+id.original_url+' ('+code+'); research stopped following it for safety. Point the old URL straight at its final page with one 301.';
  case 'REDIRECT_DESTINATION_UNAVAILABLE':return 'Redirect from '+id.original_url+' ('+code+') leads to a page that could not be read ('+id.error+'). No page identity was assumed.';
  case 'REDIRECT_STATUS_UNKNOWN':return 'Redirect detected: '+id.original_url+' → '+id.final_url+', but the HTTP status was not recorded, so it is not treated as a proven 301 and the URLs are not merged.'+lockNote;
  case 'NO_REDIRECT':return id.canonical_points_elsewhere?'No redirect: '+id.original_url+' answers directly but its canonical tag points to '+id.canonical_url+'. That is a canonical signal, not a proven 301; the two URLs remain separate pages for editing.':null;
  default:return null;
 }
}
module.exports={identityFromFetch,identityAdvice,canonicalOf,sameUrl,normUrl:norm};
