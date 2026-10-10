'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.env.PLACEMENT_CANDIDATE||'/tmp/contentscale-prewrite-placement.js','utf8');
const begin=source.indexOf('async function _pwbPrepareSavedBriefV506(');
const end=source.indexOf("\napp.get('/api/tracker-client/:token/prewrite-briefs/:id'",begin);
assert(begin>0&&end>begin&&end-begin<9000);
const func=source.slice(begin,end);
function mock(linked){
 const calls=[],row={id:41,language:'en',brief_json:{research:{stable:true}}};
 const db={async query(sql,args){
  calls.push({sql,args});
  assert.match(sql,/^\s*SELECT\b/i,'Read-only helper attempted mutation');
  if(sql.includes('FROM network_placements')){
   assert.match(sql,/c\.prewrite_brief_id=\$2/,'Brief link is not checked');
   assert.equal(Number(args[0]),25);assert.equal(Number(args[1]),row.id);
   return {rows:linked?[{publisher_domain:'publisher.test',owner_domain:'example.test',publisher_scan:{checked_url:'https://publisher.test/'}}]:[]};
  }
  if(sql.includes('FROM prewrite_async_jobs'))return {rows:[{request_json:{manualAiEvidence:{perplexity:'Previously submitted evidence'}}}]};
  throw Error('Unexpected SQL');
 }};
 const ctx={pool:db,console:{warn(){}},JSON,Number,String,Date,Array,Object,Set,Math,
  _PWB_AI_ENGINES_V506:['perplexity'],
  _pwbEnsureResearchContractV506(b){b.recovered_context=true;},
  _pwbMergeManualAiEvidenceV506(b,e){b.manual_ai_evidence=e;return {added:Object.keys(e)};},
  _pwbEnsureNetworkInternalDestinationV506(b){b.internal_destination='https://publisher.test/';return {source:'publisher_homepage_fallback'};},
  _pwbEvidenceBackedGapV506(){},_pwbCanonicalizeAiAnalysisV506(){},
  _pwbFinalPublicationPass(b){b.publication_quality_check={score:90};b.final_qa_version='v504-meta-policy';},
  _pwbReadiness(){return {score:90,missing:[]}}
 };
 vm.runInNewContext(func+';globalThis.prepare=_pwbPrepareSavedBriefV506;',ctx,{timeout:1600});
 return {row,calls,fn:ctx.prepare};
}
test('only a placement linked to this exact saved Brief may provide manual AI evidence',async()=>{
 const m=mock(true),result=await m.fn(m.row,{networkPlacement:25,networkEmbed:'1'});
 assert.equal(result.brief.manual_ai_evidence.perplexity,'Previously submitted evidence');
 assert.equal(result.brief.research.stable,true);
 assert.equal(m.calls.length,2);
 assert.equal(result.pendingSave,true);
 assert(m.calls.every(x=>/^\s*SELECT\b/i.test(x.sql)));
});
test('an unlinked placement cannot cause cross-placement evidence recovery',async()=>{
 const m=mock(false),result=await m.fn(m.row,{networkPlacement:25,networkEmbed:'1'});
 assert.equal(m.calls.length,1,'Unlinked placement may not read saved AI requests');
 assert.equal(result.brief.manual_ai_evidence,undefined);
 assert.equal(result.brief.research.stable,true);
 assert.equal(result.integrityMigrated,false);
});
test('Finalize UI forwards a checked placement query only through the same canonical POST',()=>{
 const i=source.indexOf("'/finalize'+(function()",4000000);
 assert(i>0,'Existing Finalize API call not using Network placement query');
 const body=source.slice(i,i+450);
 assert.match(body,/new URLSearchParams\(window\.location\.search\)/);
 assert.match(body,/networkPlacement/);
 assert.match(body,/networkEmbed=1/);
 assert.match(body,/Number\.isSafeInteger/);
 assert.match(body,/'POST'/);
});
test('staging canonical prewrite GET still cannot persist implicitly',()=>{
 const i=source.indexOf("app.get('/api/tracker-client/:token/prewrite-briefs/:id'");
 const j=source.indexOf('\n});',i);
 assert(i>0&&j>i);
 assert.doesNotMatch(source.slice(i,j),/\bUPDATE\s+prewrite_briefs\b/i);
});
