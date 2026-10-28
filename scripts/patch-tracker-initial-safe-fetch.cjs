'use strict';
// Scoped, idempotent canonical build-time replacement of the legacy Tracker scan's first native fetch.
// Handles nested headers and options; replaces exactly one request, never global fetch.
function patch(source){
 const input=String(source);
 const start=input.indexOf('async function runTrackerCheck(');
 if(start<0)throw Error('TRACKER_SAFE_FETCH_FUNCTION_NOT_FOUND');
 const end=input.indexOf('\nasync function ',start+10),scopeEnd=end<0?input.length:end;
 const head=input.slice(0,start),body=input.slice(start,scopeEnd),tail=input.slice(scopeEnd);
 const hardened="require('./tracker-safe-initial-fetch.cjs').fetchInitialTrackerPage(page.url)";
 if(body.includes(hardened))return input;
 const hits=[];
 const token='fetch(page.url,';
 let idx=-1;
 while((idx=body.indexOf(token,idx+1))!==-1){
  let depth=1,quote=null,escaped=false,close=-1;
  for(let j=idx+5;j<body.length;j++){
   const ch=body[j];
   if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote=null;continue}
   if(ch==='"'||ch==="'"||ch==='\x60'){quote=ch;continue}
   if(ch==='(')depth++;else if(ch===')'){depth--;if(depth===0){close=j;break}}
  }
  if(close<0)throw Error('TRACKER_FETCH_UNBALANCED_CALL');
  const call=body.slice(idx,close+1);
  if(/redirect\s*:\s*['"]follow['"]/.test(call))hits.push({idx,close});
 }
 if(hits.length!==1)throw Error('TRACKER_INITIAL_FETCH_EXPECTED_ONE_FOUND_'+hits.length);
 return head+body.slice(0,hits[0].idx)+hardened+body.slice(hits[0].close+1)+tail;
}
module.exports={patch};
