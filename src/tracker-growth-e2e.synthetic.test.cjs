'use strict';
// Synthetic, offline cross-module contract: NO production data, writes or emails.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {buildGrowthOpportunityPlan}=require('./growth-opportunity-plan.cjs');
const {buildGrowthEditInstructions}=require('./growth-edit-instructions.cjs');
const {prepareGrowthElementorDraft}=require('./growth-elementor-draft.cjs');
const {executeGrowthElementorDraft}=require('./growth-elementor-draft-executor.cjs');
const {compareGrowthGscWindows}=require('./growth-gsc-window-comparison.cjs');
const {computeGrowth,buildGrowthClientBrief}=require('./tracker-growth-cockpit.cjs');
const h=x=>crypto.createHash('sha256').update(x).digest('hex');
const url='https://synthetic.example/roof-repair/',page={id:5,tracker_client_id:2,url,case_study_active:false};
const query={page_id:5,tracker_client_id:2,source_page_url:url,evidence_scope:'page_verified',query:'emergency roof repair county',impressions:900,clicks:0,position:43,imported_at:'2026-10-12T00:00:00Z'};
const searchEvidence=[{target_url:url,source_url:'https://external.example/emergency/',observed:'Shows which emergencies warrant professional assessment',improvement:'Add practical urgent roof-leak assessment guidance',where_in_draft:'Repair guidance',source_ref:'synthetic-search-1'}];
const plan=buildGrowthOpportunityPlan({page,gscRows:[query],searchSpy:searchEvidence,aiSpy:undefined});
assert.equal(plan.status,'EVIDENCE_READY_FOR_PLANNING');
assert(plan.warnings.includes('AI_SPY_NOT_MAPPED'));
assert.equal(plan.actions[0].expected_clicks,null);
const edits=buildGrowthEditInstructions({page,searchSpy:searchEvidence});
assert.equal(edits.status,'PROPOSED_FOR_EDITOR_REVIEW');
assert.equal(edits.auto_publish,false);
const originalHtml='<article><h1>Roof Repair Service</h1><p>Existing original page and images.</p><img src="/roof.jpg" alt="Existing roof"></article>';
const raw=JSON.stringify([{id:'outer',elType:'container',settings:{background_color:'#ffffff'},elements:[
 {id:'widget',elType:'widget',widgetType:'html',settings:{html:originalHtml}},
 {id:'image',elType:'widget',widgetType:'image',settings:{image:{id:19,url:'/hero.jpg'}}}
]}]);
const candidate=prepareGrowthElementorDraft({
 sourceJson:raw,sourceSha256:h(raw),approved:true,
 edits:[{approved:true,evidence_ref:'synthetic-search-1',widget_id:'widget',
  before:'Existing original page and images.',
  after:'Existing original page and images. If you notice active water entry after a storm, avoid climbing onto a wet roof and call a roofer to discuss emergency protection and inspection.'}]
});
assert.equal(candidate.status,'DRAFT_FOR_REVIEW');
const transformed=JSON.parse(candidate.elementor_json);
assert.equal(transformed[0].settings.background_color,'#ffffff');
assert.equal(transformed[0].elements[1].settings.image.url,'/hero.jpg');
const post={id:111,type:'pages',status:'publish',elementor_data:raw};
let draft,meta,writes=0;
(async()=>{
 const executed=await executeGrowthElementorDraft({
  approvedCandidate:candidate,sourcePostId:111,sourcePostType:'pages',
  readOriginalPost:async()=>post,
  checkCanonicalState:async()=>({wordpress_post_id:111,case_study_active:false,allow_draft:true}),
  createDraft:async()=>{writes++;return {id:333,status:'draft'};},
  writeDraftElementorMeta:async x=>{meta=x.elementor_data;},
  readDraft:async()=>({id:333,type:'pages',status:'draft',elementor_edit_mode:'builder',elementor_data:meta})
 });
 assert.equal(executed.status,'ELEMENTOR_DRAFT_VERIFIED',JSON.stringify(executed.issues));
 assert.equal(executed.published,false);assert.equal(writes,1);
 assert.deepEqual(post,{id:111,type:'pages',status:'publish',elementor_data:raw},'source untouched');
 const run=(start_date,end_date,clicks,impressions,position)=>({
  page_url:url,gsc_property:'sc-domain:synthetic.example',start_date,end_date,
  clicks,impressions,position,query_count:5,imported_at:'2026-10-15T00:00:00Z'
 });
 const baseline=compareGrowthGscWindows({pageUrl:url,runs:[
  run('2026-09-15','2026-10-12',2,800,33),
  run('2026-08-18','2026-09-14',0,900,43)
 ]});
 assert.equal(baseline.status,'READY_FOR_RESULT_REVIEW');
 assert.equal(baseline.changes.clicks,2);
 assert.equal(baseline.attribution_established,false);
 const display=computeGrowth([{
  id:5,url,keyword:'emergency roof repair county',gsc_impressions:900,gsc_clicks:0,gsc_position:43,case_study_active:false
 }],[query],'synthetic.example',new Date('2026-10-16T00:00:00Z'));
 assert(buildGrowthClientBrief(display).includes('900 impressions; 0 clicks; average position 43'));
 assert(buildGrowthClientBrief(display).includes('NOT MEASURED'));
 console.log('PASS: synthetic Tracker GSC -> Search Spy -> Elementor draft preserved -> readback -> dated click comparison -> client brief');
})().catch(e=>{console.error(e);process.exitCode=1});
