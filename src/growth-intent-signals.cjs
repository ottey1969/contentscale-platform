'use strict';
// Industry-neutral signals that a result or page serves a DIFFERENT search intent than an informational or
// service query: reviews, comparisons, pricing, login, coupons, downloads, jobs. No brand or product names.
const OFF_INTENT_RE=/\b(review|reviews|alternative|alternatives|vs\.?|versus|pricing|price|coupon|discount|promo|login|sign in|download|jobs|careers)\b/i;
const OFF_INTENT_GLOBAL=new RegExp(OFF_INTENT_RE.source,'gi');
const offIntentWords=text=>[...new Set((String(text||'').match(OFF_INTENT_GLOBAL)||[]).map(x=>x.toLowerCase().replace(/\.$/,'')))];
// Off-intent words present in `text` that the query itself did not ask for.
const differsFromQuery=(text,query)=>{const asked=new Set(offIntentWords(query));return offIntentWords(text).filter(w=>!asked.has(w))};
// Narrow set for SERP LEADS: account/transactional navigation only. 'Pricing', 'cost' and 'reviews' stay allowed
// because they are normal in legitimate service-page titles (e.g. local services).
const NAV_RE=/\b(login|log in|sign in|coupon|discount|promo|jobs|careers|download)\b/gi;
const navWords=text=>[...new Set((String(text||'').match(NAV_RE)||[]).map(x=>x.toLowerCase()))];
const navDiffersFromQuery=(text,query)=>{const asked=new Set(navWords(query));return navWords(text).filter(w=>!asked.has(w))};
module.exports={OFF_INTENT_RE,offIntentWords,differsFromQuery,navDiffersFromQuery};
