'use strict';
// Deterministic, CMS-independent informational-intent → relevant offer contract.
// No paid providers, no manufactured evidence, no auto-publishing.
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const txt=x=>String(x==null?'':x).trim();
const families=[
 {id:'ai_visibility',patterns:[/\b(aeo|geo|ai overviews?|ai search|llm|answer engine|generative engine)\b/i],keywords:['ai','visibility'],offer:'Check your website’s AI search visibility',prompt:'Want to understand how AI search affects your own website?',action:'Check AI visibility'},
 {id:'rankings',patterns:[/\b(not ranking|rankings?|ranking drop|ranking loss|google traffic)\b/i],keywords:['ranking'],offer:'Identify what may be holding your website back',prompt:'Want to find the ranking issues affecting your own website?',action:'Check my rankings'},
 {id:'technical',patterns:[/\b(technical seo|seo checklist|crawlability|indexing|core web vitals|sitemap)\b/i],keywords:['technical'],offer:'Check your website for technical SEO issues',prompt:'Want to apply this checklist to your own website?',action:'Check my website'},
 {id:'roof_leak',patterns:[/\b(roof leaks?|leaking roof|water stains|roof damage|missing shingles)\b/i],keywords:['roof'],offer:'Ask about a roof inspection',prompt:'Noticing a roof leak at your property?',action:'Request inspection'},
];
function validUrl(value,canonical){
 try{const u=new URL(value),p=new URL(canonical);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&!u.search&&!u.port&&
 (u.hostname===p.hostname||u.hostname.endsWith('.'+p.hostname))&&u.pathname!=='/'}
 catch{return false}
}
function planIntentToRevenue({canonicalUrl,title,query,contentSummary='',offers={},evidenceScope='needs_access',primaryGoal='qualified_lead'}={}){
 const errors=[],warnings=[];
 if(!txt(title)||!txt(query))errors.push('PAGE_TITLE_AND_QUERY_REQUIRED');
 if(!['verified','observed','needs_access'].includes(evidenceScope))errors.push('INVALID_EVIDENCE_SCOPE');
 let url;try{url=new URL(canonicalUrl)}catch{}
 if(!url||url.protocol!=='https:'||url.username||url.password||url.search||url.hash)errors.push('CANONICAL_HTTPS_REQUIRED');
 const source=[query,title,contentSummary].map(txt).join(' ');
 const family=families.find(f=>f.patterns.some(p=>p.test(source)));
 if(!family)warnings.push('MANUAL_OFFER_MATCH_REQUIRED');
 const offer=family&&offers[family.id];
 if(family&&!offer)warnings.push('REAL_OFFER_DESTINATION_REQUIRED');
 if(offer&&(!validUrl(offer.url,canonicalUrl)||offer.available!==true))errors.push('OFFER_DESTINATION_UNVERIFIED');
 if(offer&&offer.claimsVerified!==true)warnings.push('CLAIM_EVIDENCE_REVIEW_REQUIRED');
 if(evidenceScope!=='verified')warnings.push('SEARCH_INTENT_EVIDENCE_NOT_VERIFIED');
 if(primaryGoal!=='qualified_lead'&&primaryGoal!=='booked_consultation')errors.push('INVALID_PRIMARY_GOAL');
 const ready=errors.length===0&&!!family&&!!offer&&offer.available===true&&offer.claimsVerified===true;
 const decision=ready?'READY_FOR_EDITOR':errors.length?'BLOCKED':'NEEDS_EVIDENCE';
 const cta=ready?{id:'growth-'+family.id,heading:family.prompt,copy:family.offer,
  button:family.action,url:offer.url,position:'after_first_complete_answer',family:family.id}:null;
 const html=cta?'<aside class="cs-growth-offer" aria-label="Relevant next step"><h2>'+esc(cta.heading)+'</h2><p>'+esc(cta.copy)+'</p><a href="'+esc(cta.url)+'" data-growth-cta="'+esc(cta.id)+'">'+esc(cta.button)+'</a></aside>':'';
 return {status:decision,errors,warnings,original_content_must_remain:true,auto_publish:false,
  cms_independent:true,needs_editor_review:true,match:family?.id||null,cta,html,
  measurement:{primary_goal:primaryGoal,events:['organic_entry','cta_click','offer_started','offer_completed','qualified_lead','customer_won'],
   conversion_counting:'deduplicate by qualified lead identifier; unknown is not zero',
   attribution:'segment organic vs paid and branded vs nonbranded; do not infer sale from click',
   required_baseline:'page-specific GSC clicks for 28 settled days before change',
   note:'No revenue or ranking claims without linked source evidence'}};
}
module.exports={planIntentToRevenue};
