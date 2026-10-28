'use strict';
// Build-time, scope-limited hardening of Tracker's initial page fetch.
// The source uses a legacy native fetch({redirect:'follow'}) before redirect verification.
// Replace only that one request, never global fetch and never other modules.
function patch(source){
 const input=String(source);
 const start=input.indexOf('async function runTrackerCheck(');
 if(start<0)throw Error('TRACKER_SAFE_FETCH_FUNCTION_NOT_FOUND');
 const end=input.indexOf('\nasync function ',start+10);
 const scopeEnd=end<0?input.length:end;
 const head=input.slice(0,start),body=input.slice(start,scopeEnd),tail=input.slice(scopeEnd);
 const pattern=/fetch\(page\.url,\s*\{\s*redirect:\s*['"]follow['"]\s*\}\s*\)/g;
 const occurrences=[...body.matchAll(pattern)].length;
 const hardened='require(\'./tracker-safe-initial-fetch.cjs\').fetchInitialTrackerPage(page.url)';
 if(occurrences===0){
  if(body.includes(hardened))return input;
  throw Error('TRACKER_UNSAFE_INITIAL_FETCH_MISSING_OR_CHANGED');
 }
 if(occurrences!==1)throw Error('TRACKER_UNSAFE_INITIAL_FETCH_AMBIGUOUS_'+occurrences);
 return head+body.replace(pattern,hardened)+tail;
}
module.exports={patch};
