'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=process.argv[2]||'src/index.js',output=process.argv[3]||'/tmp/contentscale-prewrite-pure-get.js';
let s=fs.readFileSync(input,'utf8');
const GET="app.get('/api/tracker-client/:token/prewrite-briefs/:id', async (req, res) => {";
const POST="app.post('/api/tracker-client/:token/prewrite-briefs/:id/finalize', async (req,res)=>{";
const functionName='async function _pwbPrepareSavedBriefV506(';
const getAt=s.indexOf(GET),postAt=s.indexOf(POST);
assert(getAt>=0&&postAt>getAt&&s.indexOf(GET,getAt+1)===-1&&s.indexOf(POST,postAt+1)===-1,'Unexpected saved-brief routes');
if(s.includes(functionName)){
 const getBody=s.slice(getAt,postAt);
 assert(!getBody.includes("UPDATE prewrite_briefs SET brief_json"),'Read-only saved Brief GET regressed');
 assert(getBody.includes('pending_explicit_save:_preview.pendingSave'),'Pending-save flag missing');
 const postBody=s.slice(postAt,postAt+2600);
 assert(postBody.includes('_pwbPrepareSavedBriefV506(auth.row'),'Finalize no longer reuses saved research recovery');
 fs.writeFileSync(output,s);
 console.log(JSON.stringify({result:'already_patched',changed_files:0,full_app_booted:false}));
 process.exit(0);
}
const get=s.slice(getAt,postAt);
const oldQa=[
"    const _hadAnyPersistedFinalQa=!!(row.brief_json&&row.brief_json.publication_quality_check);",
"    const _hadPersistedFinalQa=!!(_hadAnyPersistedFinalQa&&row.brief_json.final_qa_version==='v504-meta-policy');"
].join('\n');
assert(get.includes(oldQa)&&get.split(oldQa).length===2,'Original persisted QA detection changed');
const workStart=get.indexOf('    let _viewBrief={};'),workEnd=get.indexOf("    res.json({ success: true, brief: _viewBrief",workStart);
assert(workStart>=0&&workEnd>workStart&&workEnd-workStart<8000,'Unexpected recovery helper bounds');
const block=get.slice(workStart,workEnd);
const beforeUpdate="    if(_integrityMigrated||_autoMigrated)await pool.query('UPDATE prewrite_briefs SET brief_json=$1 WHERE id=$2',[JSON.stringify(_viewBrief),row.id]);";
assert(block.split(beforeUpdate).length===2,'Unexpected implicit GET write');
assert(block.includes("req.query&&req.query.networkPlacement")&&block.includes("req.query&&req.query.networkEmbed"),'Network placement options changed');
let common=block
 .replace('req.query&&req.query.networkPlacement','options.networkPlacement')
 .replace('req.query&&req.query.networkEmbed','options.networkEmbed')
 .replace('let _finalQaPersisted=_hadPersistedFinalQa,_autoMigrated=false;','let _autoMigrated=false;')
 .replace('_finalQaPersisted=true;_autoMigrated=true;','_autoMigrated=true;')
 .replace(beforeUpdate,[
"    const _pendingSave=Boolean(_integrityMigrated||_autoMigrated);",
"    return {brief:_viewBrief,integrityMigrated:_integrityMigrated,integrityRecovery:_integrityRecovery,autoMigrated:_autoMigrated,finalQaPersisted:_hadPersistedFinalQa,pendingSave:_pendingSave};"
].join('\n'));
assert(!common.includes('await pool.query(\'UPDATE'),'Shared preview must not write to DB');
assert(!common.includes('_finalQaPersisted'),'Shared preview must distinguish persisted from computed status');
const helper=[
"// Shared deterministic saved-Brief recovery. GET previews; existing Finalize POST persists.",
"async function _pwbPrepareSavedBriefV506(row,options={}){",
oldQa,common,
"}",
""
].join('\n');
const responseStart=get.indexOf("    res.json({ success: true, brief: _viewBrief",workEnd);
const responseEnd=get.indexOf('\n',responseStart);
assert(responseStart>=0&&responseEnd>responseStart,'Unexpected GET response');
let response=get.slice(responseStart,responseEnd);
for(const [oldVal,newVal] of [
 ['brief: _viewBrief','brief: _preview.brief'],
 ['deterministic_qa_migrated:_autoMigrated','deterministic_qa_migrated:_preview.autoMigrated'],
 ['integrity_migrated:_integrityMigrated','integrity_migrated:_preview.integrityMigrated'],
 ['integrity_recovery:_integrityRecovery','integrity_recovery:_preview.integrityRecovery'],
 ['final_qa_persisted:_finalQaPersisted','final_qa_persisted:_preview.finalQaPersisted']
]){
 assert(response.includes(oldVal),'GET response contract changed: '+oldVal);
 response=response.replace(oldVal,newVal);
}
assert(response.includes('share:_shareInfo'),'GET sharing contract lost');
response=response.replace('share:_shareInfo','pending_explicit_save:_preview.pendingSave,research_rerun:false,gemini_calls:0,share:_shareInfo');
const replacement=[
"    const _preview=await _pwbPrepareSavedBriefV506(row,{networkPlacement:req.query&&req.query.networkPlacement,networkEmbed:req.query&&req.query.networkEmbed});",
response
].join('\n');
let changedGet=get.replace(oldQa+'\n'+block+get.slice(responseStart,responseEnd),
 replacement);
assert(changedGet!==get,'GET patch was not applied');
const finalize=s.slice(postAt,postAt+3500);
const oldClone="    let brief={};try{brief=JSON.parse(JSON.stringify(auth.row.brief_json||{}));}catch(_e){brief=auth.row.brief_json||{};}";
assert(finalize.includes(oldClone),'Finalize clone changed');
const newClone=[
"    const _preview=await _pwbPrepareSavedBriefV506(auth.row,{networkPlacement:auth.placementId,networkEmbed:req.query&&req.query.networkEmbed});",
"    let brief=_preview.brief;"
].join('\n');
s=s.slice(0,postAt)+s.slice(postAt).replace(oldClone,newClone);
s=s.slice(0,getAt)+helper+changedGet+s.slice(postAt);
const newGetStart=s.indexOf(GET),newGetEnd=s.indexOf('\n});',newGetStart);
const getBody=s.slice(newGetStart,newGetEnd+4);
assert(!/\b(?:INSERT|UPDATE|ALTER|DELETE|CREATE)\s+(?:INTO\s+|FROM\s+|TABLE\s+)?prewrite_briefs\b/i.test(getBody),'Prewrite GET still writes');
assert(!getBody.includes("await pool.query('UPDATE prewrite_briefs"),'Prewrite GET still implicitly persists');
assert(getBody.includes('pending_explicit_save:_preview.pendingSave'),'No user-visible save state');
assert(s.includes('const _preview=await _pwbPrepareSavedBriefV506(auth.row'),'Finalize not connected to shared preview');
fs.writeFileSync(output,s);
console.log(JSON.stringify({result:'read_only_prewrite_candidate',modified_gets:1,reused_finalize_posts:1,original_research_preserved:true,provider_calls_added:0,bytes:Buffer.byteLength(s)}));
