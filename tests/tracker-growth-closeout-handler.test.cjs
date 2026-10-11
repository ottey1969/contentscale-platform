'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync(require('node:path').resolve(__dirname,'../src/index.js'),'utf8');
const a=src.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/brief-action/resolve'");
const b=src.indexOf("app.post('/api/tracker-client/:token/pages/:pageId/brief-action/restore'",a);
assert(a>0&&b>a&&b-a<18000,'Canonical Brief resolver moved');
let handler,stored=null,writes=0;
const action={title:'Improve emergency CTA',action:'Publish verified dispatch facts above the fold',system:'Google AIO',priority:'high'};
const page={id:2290,tracker_client_id:8,url:'https://perfectroofingteam.com/24-hour-emergency-roof-repair-nj/',
 keyword:'24 hour emergency roof repair nj',gsc_impressions:6302,gsc_clicks:2,gsc_position:41.6,
 brief_content:{cycle_id:'cycle-2',items:[action],gsc_brief:[]}};
const pool={query:async(sql,args=[])=>{
 const s=String(sql);
 if(s.includes('FROM tracker_clients'))return {rows:[{id:8,token:'synthetic'}]};
 if(s.includes('SELECT * FROM tracker_pages'))return {rows:[page]};
 if(s.includes('FROM tracker_gsc_queries'))return {rows:[{query:'emergency roof repair nj',impressions:839,clicks:0,position:41.7,
   evidence_scope:'page_verified',imported_at:'2026-09-24'}]};
 if(s.includes('SELECT url,keyword,gsc_keyword FROM tracker_pages'))return {rows:[{url:page.url,keyword:page.keyword}]};
 if(s.includes('UPDATE tracker_pages')){
  writes++;stored=JSON.parse(args[0]);page.brief_content=stored;
  assert.equal(args[1],'manual_resolution_complete');
  return {rows:[]};
 }
 throw Error('Unexpected SQL: '+s.slice(0,130));
}};
const context={app:{post(_path,fn){handler=fn}},pool,JSON,Date,String,Number,Math,Array,process:{env:{}},
 console:{warn(){},error(){}},_trackerBriefFrameOnly:()=>false,_trackerVerificationOnlyAction:()=>false,
 _caseStudyEventForPage:async()=>{},_trackerActionText:x=>[x.title,x.action].join(' '),
 require:p=>p==='./tracker-growth-plan.cjs'?require('../src/tracker-growth-plan.cjs'):require(p)
};
vm.runInNewContext(src.slice(a,b),context,{timeout:4000});
async function invoke(){
 const res={statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=JSON.parse(JSON.stringify(body));return body}};
 await handler({params:{token:'synthetic',pageId:'2290'},
  body:{bucket:'items',index:0,decision:'override',reason:'Confirmed by owner after independent live review',
  expected_action:JSON.stringify(action),expected_cycle:'cycle-2'}},res);
 return res;
}
(async()=>{
 const first=await invoke();
 assert.equal(first.statusCode,200,JSON.stringify(first.body));
 assert.equal(writes,1);
 assert.equal(stored.outstanding_actions,0);
 assert.equal(stored.implementation_complete,true);
 assert.equal(stored.manual_resolutions.length,1);
 assert.equal(stored.growth_loop.current_cycle_complete,true);
 assert.equal(stored.growth_loop.plan.mode,'GROWTH_NOT_DEFECTS');
 assert.equal(stored.growth_loop.plan.opportunities[0].type,'OPTIMIZE_EXISTING_PAGE');
 const second=await invoke();
 assert.equal(second.statusCode,404);
 assert.equal(writes,1,'Repeated resolution may not reopen completed work');
 console.log('PASS real canonical Brief resolver: persistent zero actions, no replay, verified ranking growth plan');
})().catch(e=>{console.error(e);process.exitCode=1});
