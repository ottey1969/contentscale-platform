'use strict';
// A destination chosen on ANOTHER page than the source must be checked for its own Case Study lock, and a 301 alias resolved
// to its final URL must carry the final page's id (the alias row keeps its own id as tracked_page_id). SYNTHETIC site.
const test=require('node:test'),assert=require('node:assert/strict');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const HOME='https://roofer.example/',DEST='https://roofer.example/storm-damage-guide/',ALIAS='https://roofer.example/old-storm-guide/';
const para='Walk around the house after the storm passes and note lifted shingles, bent flashing and granules in the gutters before calling anyone.';
const ins='Keep every insurance claim photo, insurance adjuster note and insurance claim number together; the insurance claim moves faster when the insurance documentation is complete and dated.';
const pg=(t,h,secs)=>'<html><head><title>'+t+'</title></head><body><h1>'+h+'</h1>'+secs.map(([a,b])=>'<h2>'+a+'</h2><p>'+b+'</p>').join('')+'</body></html>';
async function run({destLocked=false,viaAlias=false,fragmentSource=false}={}){
 const route={},fresh=new Date(Date.now()-3*86400000).toISOString(),tracked=viaAlias?ALIAS:DEST,sourceUrl=fragmentSource?DEST+'#statistics':HOME;
 const inventory=[{id:31,url:tracked,keyword:'storm damage roof guide'},...(viaAlias?[{id:32,url:DEST,keyword:'storm damage guide nj'}]:[])];
 const db={async query(sql,args){
  if(/^\s*(UPDATE|INSERT|DELETE)/i.test(sql))throw Error('no writes');
  if(sql.includes('LEFT(html_content'))return {rows:[{id:7,tracker_client_id:4,url:sourceUrl,keyword:fragmentSource?'storm damage roof guide':'roofer',saved_html:''}]};
  if(sql.includes('FROM tracker_gsc_queries'))return {rows:args[1]===7?[{page_id:7,tracker_client_id:4,source_page_url:sourceUrl,evidence_scope:'page_verified',query:'storm damage roof guide',impressions:400,clicks:0,position:30,imported_at:fresh}]:[]};
  if(sql.includes('FROM tracker_pages WHERE tracker_client_id'))return {rows:inventory};
  return {rows:[]};
 }};
 const destHtml=pg('Storm Damage Roof Guide: 6 Steps','How to handle storm damage on a roof',[['Signs of storm damage',para+' '+para]]);
 const fetchLive=async url=>{
  if(url===sourceUrl&&fragmentSource)return {html:destHtml,final_url:DEST,redirect_chain:[]};
  if(url===HOME)return {html:pg('Roofer | Home','Roofer',[['Welcome',para]]),final_url:HOME,redirect_chain:[]};
  if(url===ALIAS)return {html:destHtml,final_url:DEST,requested_url:ALIAS,redirect_chain:[{url:ALIAS,status:301,location:DEST}]};
  if(url===DEST)return {html:destHtml,final_url:DEST,redirect_chain:[]};
  const more='Roofers usually inspect the ridge, valleys and penetrations first because wind and hail open those areas before the field of the roof. '+
   'A written estimate should separate emergency tarping from permanent repair so the homeowner can compare quotes line by line. ';
  return {html:pg('Storm damage roof guide','Storm damage roof repair guide',[[url.includes('g0')?'Insurance claim documentation':'Documenting the insurance claim',ins+' '+ins],
   ['Signs of storm damage',para+' '+more],['Choosing a roofer',more+more],['Temporary protection',more+para]]),final_url:url,redirect_chain:[]};
 };
 const searchLive=async a=>({status:'FRESH_GOOGLE_ORGANIC_LEADS',source:'SERPER_GOOGLE_ORGANIC',query:a.query,provider_attempts:['SERPER_GOOGLE_ORGANIC'],
  leads:['How to Fix Storm Damage on a Roof','Storm Damage Roof Guide','Signs of Storm Damage: A Checklist'].map((title,i)=>({url:'https://g'+i+'.example/s',title,source:'SERPER_GOOGLE_ORGANIC',serp_position:i+1}))});
 const mw=(req,res,next)=>{req.growthTrackerClientId=4;req.growth={can_edit:false,pages:[{id:7,url:sourceUrl,keyword:fragmentSource?'storm damage roof guide':'roofer',case_study_active:!fragmentSource},
  {id:viaAlias?32:31,url:DEST,keyword:'storm damage roof guide',case_study_active:destLocked}]};next()};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(){}},db,mw,{...require('./helpers/meaning-check-stand-in.cjs').meaningStandIn,fetchLive,searchLive,renderOwn:async()=>({status:'RENDER_UNAVAILABLE',live:null})});
 const res={statusCode:200,set(){return this},status(x){this.statusCode=x;return this},json(x){this.body=x;return this}};
 const stack=route['/api/tracker-client/:token/growth/auto-research'],req={params:{token:'t'},query:{page_id:'7'}};
 await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});
 assert.equal(res.statusCode,200,JSON.stringify(res.body));
 return res.body;
}
test('an unlocked destination on another page can receive an improvement (control)',async()=>{
 const b=await run();
 assert.equal(b.editorial_decision_gate.target_url,DEST);
 assert.equal(b.editorial_decision_gate.decision,'IMPROVE_EXISTING',JSON.stringify(b.editorial_decision_gate.missing_evidence||null));
});
test('a destination that is itself a locked Case Study is never edited, even when the source is a different page',async()=>{
 const b=await run({destLocked:true});
 const g=b.editorial_decision_gate;
 assert.equal(g.target_url,DEST);assert.equal(g.decision,'DATA_BLOCKED');assert.equal(g.blocker_code,'DESTINATION_IS_PROTECTED_CASE_STUDY');
 assert.match(g.missing_evidence[0].detail,/is itself a locked Case Study page\. Edits are blocked to protect its baseline; no website change is required\./);
 assert.equal(b.destination_identity.destination_locked,true);assert.equal(g.copy_ready,false);
 assert.equal(g.evidence_status.label,'CASE_STUDY_PROTECTED_NO_CHANGE_REQUIRED');
});
test('a 301 alias resolved to its final page carries the final page id; the alias row id is kept as tracked_page_id',async()=>{
 const b=await run({viaAlias:true});
 const d=b.query_selection.destination;
 assert.equal(d.url,DEST);assert.equal(d.page_id,32);assert.equal(d.tracked_url,ALIAS);assert.equal(d.tracked_page_id,31);
 assert.equal(b.growth_decision.primary_next_action.destination.page_id,32);
 const locked=await run({viaAlias:true,destLocked:true});
 assert.equal(locked.editorial_decision_gate.blocker_code,'DESTINATION_IS_PROTECTED_CASE_STUDY','the lock follows the final URL, not the alias');
});

test('R41: an unlocked Tracker #fragment row cannot bypass the Case Study lock of the same final document',async()=>{
 const b=await run({fragmentSource:true,destLocked:true});
 assert.equal(b.editorial_decision_gate.target_url,DEST);
 assert.equal(b.destination_identity.destination_locked,true,'final page lock must not be bypassed by a source URL fragment');
 assert.equal(b.editorial_decision_gate.blocker_code,'DESTINATION_IS_PROTECTED_CASE_STUDY');
 assert.equal(b.editorial_decision_gate.copy_ready,false);
});
