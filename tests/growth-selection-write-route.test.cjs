'use strict';
// The owner's writing route (POST /auto-research/write) after the PR #221 review: the four guarantees.
//  1. More than four writable items is refused (never silently cut).  2. A page changed since the research is refused
//  before any AI call.  3. A written section is linked to an item only by its exact task code; anything else is reported
//  as not linked and never stored.  4. (CMS) flagged content must be gone from the final text: see growth-cms-handoff.
// The selectable items are the REAL competitor headings of production report 55 (HubSpot and Otterly vs page 2294).
const test=require('node:test'),assert=require('node:assert/strict');
const {registerGrowthAutomaticResearch}=require('../src/tracker-growth-automatic-routes.cjs');
const {pageFingerprint}=require('../src/growth-selected-writing.cjs');
const r55=require('./fixtures/growth-report-55/research.json');
const URL_=r55.url;
// The page as researched (its real section headings) and the same page after an edit.
const researched='<main><h1>What Is an AI Citation Tracker?</h1>'+r55.reader_task_coverage.destination_sections.map(s=>'<h2>'+s.heading+'</h2><p>'+s.heading+' is a section of this page with enough words to be read.</p>').join('')+'</main>';
const changed=researched.replace('</main>','<h2>New section</h2><p>A paragraph the owner added after the research ran, long enough to count.</p></main>');
const items=r55.reader_task_coverage.task_derivation.hosts.flatMap(h=>h.headings.map(x=>({host:h.host,heading:x})))
 .map((x,i)=>({id:'s-'+i,group:'COMPETITOR_SECTION',writable:true,title:x.heading,status:'Not compared with your page',
  examples:[{site:x.host,url:'https://'+x.host+'/',heading:x.heading,excerpt:''}],placement:null}));

function harness({live=researched,draft=null}={}){
 const route={},calls={generate:0,proposals:[]};
 const list={id:7,target_page_id:2294,target_url:URL_,focus_query:'ai citation tracker',items,source_fingerprint:pageFingerprint(researched)};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},{query:async()=>({rows:[]})},(req,res,next)=>{
  req.growthTrackerClientId=4;req.growth={can_edit:true,pages:[{id:2294,url:URL_,case_study_active:false}]};next()},{
  fetchLive:async()=>({html:live,final_url:URL_}),
  completeOwnerDraft:async({body})=>{calls.generate++;const tasks=body.research_context.reader_task.tasks;
   return {statusCode:200,body:{success:true,page_id:2294,canonical_url:URL_,status:'AI_DRAFT_REVIEW_REQUIRED',source_text:'',
    draft:draft?draft(tasks):{sections:tasks.map(t=>({task_code:t.code,h2:'About '+t.label,paragraphs:['A concept paragraph about '+t.label+' for the editor to review and rewrite where needed.']}))}}}},
  loadGapList:async()=>list,recordSelection:async()=>{},recordSelectionProposal:async a=>{calls.proposals.push(a);return {id:99}}});
 const post=async ids=>{const req={params:{token:'owner'},query:{page_id:'2294'},body:{gap_list_id:7,item_ids:ids}},
  res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.body=x;return this}};
  const stack=route['/api/tracker-client/:token/growth/auto-research/write'];
  await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res};
 return {post,calls};
}

test('1. more than four selected topics is refused, not silently cut; four is written in full',async()=>{
 const h=harness();
 const five=await h.post(items.slice(0,5).map(x=>x.id));
 assert.equal(five.statusCode,400);assert.equal(five.body.code,'SELECT_AT_MOST_4_TO_WRITE');assert.equal(h.calls.generate,0);
 const four=await h.post(items.slice(0,4).map(x=>x.id));
 assert.equal(four.statusCode,200);assert.equal(four.body.sections.length,4);assert.deepEqual(four.body.not_written,[]);
});

test('2. a page that changed since the research is refused before any AI call',async()=>{
 const h=harness({live:changed});
 const r=await h.post([items[0].id]);
 assert.equal(r.statusCode,409);assert.equal(r.body.code,'PAGE_CHANGED_SINCE_RESEARCH_RERUN_RESEARCH');assert.equal(h.calls.generate,0);
 // Markup that is not page text (scripts) is not a content change.
 const same=harness({live:researched.replace('</main>','</main><script>window.x=1</script>')});
 assert.equal((await same.post([items[0].id])).statusCode,200);
});

test('3. a section is linked only by its exact task code; unknown or repeated codes are reported, never placed or stored',async()=>{
 const h=harness({draft:tasks=>({sections:[
  {task_code:tasks[0].code,h2:'Linked section',paragraphs:['A concept paragraph for the first selected item that the editor reviews before use.']},
  {task_code:'task_unknown',h2:'Unknown code',paragraphs:['A paragraph the writer returned with a code it was never given, so it is not linked.']},
  {task_code:tasks[0].code,h2:'Second for the same item',paragraphs:['A second paragraph for the same item, which is not linked to anything else.']},
  {h2:'No code',paragraphs:['A paragraph without any code that must not be guessed onto the remaining item.']}]})});
 const r=await h.post([items[0].id,items[1].id]);
 assert.equal(r.statusCode,200);
 assert.deepEqual(r.body.sections.map(s=>[s.item_id,s.h2]),[[items[0].id,'Linked section']]);
 assert.deepEqual(r.body.unlinked_sections.map(s=>s.h2),['Unknown code','Second for the same item','No code']);
 assert.deepEqual(r.body.not_written,[{item_id:items[1].id,title:items[1].title}],'the second item is reported as not written, not filled with a guess');
 assert.deepEqual(h.calls.proposals[0].written.sections.map(s=>s.h2),['Linked section'],'only linked text reaches the CMS proposal');
});

test('only page elements selected: nothing to write',async()=>{
 const h=harness();
 items.push({id:'e-tables',group:'PAGE_ELEMENT',writable:false,title:'A table',status:'Not on your page',examples:[]});
 const r=await h.post(['e-tables']);
 assert.equal(r.statusCode,400);assert.equal(r.body.code,'ONLY_PAGE_ELEMENTS_SELECTED');assert.equal(h.calls.generate,0);
 items.pop();
});
