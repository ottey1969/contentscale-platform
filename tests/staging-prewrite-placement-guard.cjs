'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
let s=fs.readFileSync(process.argv[2]||'src/index.js','utf8');
const output=process.argv[3]||'/tmp/contentscale-prewrite-placement.js';
const oldSQL="WHERE p.id=$1 LIMIT 1"+"\x60"+",[_viewPlacementId]);";
const newSQL="WHERE p.id=$1 AND c.prewrite_brief_id=$2 LIMIT 1"+"\x60"+",[_viewPlacementId,row.id]);if(!_ctx.rows.length)throw new Error('Network placement is not linked to this saved Brief');";
const oldUI="api('/prewrite-briefs/'+encodeURIComponent(_pwbCurrentBriefId)+'/finalize','POST',{})";
const newUI="api('/prewrite-briefs/'+encodeURIComponent(_pwbCurrentBriefId)+'/finalize'+(function(){var p=new URLSearchParams(window.location.search).get('networkPlacement');return p&&/^[0-9]+$/.test(p)&&Number.isSafeInteger(Number(p))&&Number(p)>0?'?networkEmbed=1&networkPlacement='+encodeURIComponent(p):'';})(),'POST',{})";
assert(s.includes('async function _pwbPrepareSavedBriefV506('),'Missing shared canonical saved Brief recovery');
function once(oldText,newText,label){
 const n=s.split(oldText).length-1;
 if(n===1)s=s.replace(oldText,newText);
 else if(n===0){assert(s.includes(newText),'Unexpected '+label+' source');}
 else throw Error('Ambiguous '+label+' code');
}
once(oldSQL,newSQL,'placement binding');
once(oldUI,newUI,'finalize URL');
const at=s.indexOf('async function _pwbPrepareSavedBriefV506('),end=s.indexOf("\napp.get('/api/tracker-client/:token/prewrite-briefs/:id'",at);
assert(at>=0&&end>at&&end-at<9000,'Unexpected preview scope');
const helper=s.slice(at,end);
assert(helper.includes('c.prewrite_brief_id=$2'),'Saved Brief placement ownership guard missing');
assert(helper.includes("if(!_ctx.rows.length)throw"),'Fail closed on missing link');
const uiAt=s.indexOf(newUI);
assert(uiAt>0&&s.indexOf(newUI,uiAt+1)<0,'Finalize must forward placement once');
fs.writeFileSync(output,s);
console.log(JSON.stringify({result:'prewrite_placement_guard_candidate',ui_binding:true,brief_owner_bound:true,no_database_writes:true,bytes:Buffer.byteLength(s)}));
