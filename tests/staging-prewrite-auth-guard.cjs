'use strict';
// Candidate only: fail-closed authorization of Network metadata in reused saved-Brief helper.
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=process.argv[2]||'src/index.js',out=process.argv[3]||'/tmp/contentscale-prewrite-authorized.js';
let s=fs.readFileSync(input,'utf8');
const marker='async function _pwbLoadAuthorizedSavedBriefV500(';
const start=s.indexOf(marker),end=s.indexOf("\napp.post('/api/tracker-client/:token/prewrite-briefs/:id/finalize'",start);
assert(start>=0&&end>start&&end-start<9000,'Unexpected saved Brief auth scope');
let func=s.slice(start,end);
const tag="const _placementLinkedToBrief=Number(n.prewrite_brief_id||0)===Number(briefId||0);";
if(!func.includes(tag)){
 const wants="const wantsNetwork=String(req.query&&req.query.networkEmbed||'')==='1'&&Number.isSafeInteger(placementId)&&placementId>0;";
 assert(func.split(wants).length===2,'Network embed preflight changed');
 func=func.replace(wants,wants+"\n  if(!wantsNetwork)placementId=0;");
 const exact="    const n=nr.rows[0]||null;\n    if(n){";
 assert(func.split(exact).length===2,'Network owner resolution changed');
 const guard=[
"    const n=nr.rows[0]||null;",
"    if(!n)placementId=0;",
"    if(n){",
"      const _placementLinkedToBrief=Number(n.prewrite_brief_id||0)===Number(briefId||0);",
"      const _syntheticIdentity=('network-placement-'+placementId+'.internal.contentscale.site').toLowerCase();",
"      const _legacySyntheticOwner=String(tracker.domain||'').trim().toLowerCase()===_syntheticIdentity;",
"      if(!_placementLinkedToBrief&&!_legacySyntheticOwner)placementId=0;",
"    }",
"    if(n&&placementId>0){"
 ].join('\n');
 func=func.replace(exact,guard);
}else{
 assert(func.includes('if(!_placementLinkedToBrief&&!_legacySyntheticOwner)placementId=0;'),'Partial auth change');
}
assert(func.includes("if(n&&placementId>0){"),'Placement metadata still accepted without ownership');
assert(func.includes("if(!wantsNetwork)placementId=0;"),'NetworkEmbed enforcement missing');
s=s.slice(0,start)+func+s.slice(end);
fs.writeFileSync(out,s);
console.log(JSON.stringify({result:func.includes(tag)?'network_authorization_candidate':'already_patched',changed_authorization_helpers:1,full_app_started:false,bytes:Buffer.byteLength(s)}));
