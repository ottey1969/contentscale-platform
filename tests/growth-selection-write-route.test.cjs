'use strict';
// The owner's writing route (POST /auto-research/write) after the PR #221 review: the four guarantees.
//  1. A selection of more than four is kept whole: each run writes the next four, the rest stays pending (never cut).
//     (Design review after report 56: recommendation and the writer's per-run limit are different things.)  2. A page changed since the research is refused
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

function harness({live=researched,draft=null,fail=false}={}){
 const route={},calls={generate:0,proposals:[]};
 const list={id:7,target_page_id:2294,target_url:URL_,focus_query:'ai citation tracker',items,source_fingerprint:pageFingerprint(researched)};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},{query:async()=>({rows:[]})},(req,res,next)=>{
  req.growthTrackerClientId=4;req.growth={can_edit:true,pages:[{id:2294,url:URL_,case_study_active:false}]};next()},{
  fetchLive:async()=>({html:live,final_url:URL_}),
  completeOwnerDraft:async({body})=>{calls.generate++;const tasks=body.research_context.reader_task.tasks;if(fail)return {statusCode:503,body:{success:false,code:'WRITER_DOWN'}};
   return {statusCode:200,body:{success:true,page_id:2294,canonical_url:URL_,status:'AI_DRAFT_REVIEW_REQUIRED',source_text:'',
    draft:draft?draft(tasks):{sections:tasks.map(t=>({task_code:t.code,h2:'About '+t.label,paragraphs:['A concept paragraph about '+t.label+' for the editor to review and rewrite where needed.']}))}}}},
  loadGapList:async()=>list,recordSelection:async()=>{},recordWritten:async({itemIds})=>{list.written_ids=[...new Set([...(list.written_ids||[]),...itemIds])]},recordSelectionProposal:async a=>{calls.proposals.push(a);return {id:99}}});
 const post=async(ids,extra={})=>{const req={params:{token:'owner'},query:{page_id:'2294'},body:{gap_list_id:7,item_ids:ids,...extra}},
  res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.body=x;return this}};
  const stack=route['/api/tracker-client/:token/growth/auto-research/write'];
  await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});return res};
 return {post,calls};
}

test('1. six selected: four written now, two kept and written in the next run; nothing is cut or written twice',async()=>{
 const h=harness(),six=items.slice(0,6).map(x=>x.id);
 const first=await h.post(six);
 assert.equal(first.statusCode,200);assert.equal(first.body.sections.length,4);assert.deepEqual(first.body.batch,six.slice(0,4));
 assert.deepEqual(first.body.pending.map(x=>x.item_id),six.slice(4));assert.match(first.body.batch_note,/2 selected item\(s\) are kept for the next run/);
 const second=await h.post(six);
 assert.deepEqual(second.body.batch,six.slice(4));assert.deepEqual(second.body.already_written,six.slice(0,4));assert.deepEqual(second.body.pending,[]);
 const third=await h.post(six);
 assert.equal(third.statusCode,409);assert.equal(third.body.code,'SELECTION_ALREADY_WRITTEN');assert.equal(h.calls.generate,2);
});

test('1b. a failed run writes nothing as done: the whole batch stays pending for the next run',async()=>{
 const h=harness({fail:true}),ids=items.slice(0,3).map(x=>x.id);
 const r=await h.post(ids);
 assert.equal(r.statusCode,200);assert.equal(r.body.status,'NOT_WRITTEN');assert.deepEqual(r.body.pending.map(x=>x.item_id),ids);
 assert.equal(r.body.dossier.writer_status,'WRITER_DOWN','the evidence record says what happened');
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

// Code audit of 95e576c: an item is written only when its concept is stored; writing never shrinks the selection.
test('storage fails after the AI wrote: nothing is marked written, the items stay pending, the text is not lost',async()=>{
 const route={},written=[];
 const list={id:7,target_page_id:2294,target_url:URL_,focus_query:'ai citation tracker',items,source_fingerprint:pageFingerprint(researched)};
 registerGrowthAutomaticResearch({get(p,...h){route[p]=h},post(p,...h){route[p]=h}},{query:async()=>({rows:[]})},(req,res,next)=>{
  req.growthTrackerClientId=4;req.growth={can_edit:true,pages:[{id:2294,url:URL_,case_study_active:false}]};next()},{
  fetchLive:async()=>({html:researched,final_url:URL_}),
  completeOwnerDraft:async({body})=>({statusCode:200,body:{success:true,page_id:2294,canonical_url:URL_,status:'AI_DRAFT_REVIEW_REQUIRED',source_text:'',
   draft:{sections:body.research_context.reader_task.tasks.map(t=>({task_code:t.code,h2:'About '+t.label,paragraphs:['A concept paragraph about '+t.label+' for the editor to review and rewrite where needed.']}))}}}),
  loadGapList:async()=>list,recordSelection:async()=>{},recordWritten:async a=>{written.push(a)},
  recordSelectionProposal:async()=>{throw Object.assign(Error('db down'),{code:'ECONNRESET'})}});
 const req={params:{token:'owner'},query:{page_id:'2294'},body:{gap_list_id:7,item_ids:[items[0].id,items[1].id]}},
  res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.body=x;return this}};
 const stack=route['/api/tracker-client/:token/growth/auto-research/write'];
 await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});
 assert.equal(res.body.stored,false);assert.equal(res.body.storage_error,'CONCEPT_NOT_STORED_NOTHING_MARKED_WRITTEN');
 assert.deepEqual(written,[],'never marked written without a stored concept');
 assert.deepEqual(res.body.pending.map(x=>x.item_id),[items[0].id,items[1].id]);
 assert.equal(res.body.sections.length,2,'the text is returned so it is not lost');assert.equal(res.body.cms_handoff,null);
});

test('a writing request adds to the selection and never removes from it',async()=>{
 const route2={};let selection=[items[0].id,items[1].id,items[2].id];
 const list={id:8,target_page_id:2294,target_url:URL_,focus_query:'q',items,selected:selection,source_fingerprint:pageFingerprint(researched)};
 registerGrowthAutomaticResearch({get(p,...x){route2[p]=x},post(p,...x){route2[p]=x}},{query:async()=>({rows:[]})},(req,res,next)=>{
  req.growthTrackerClientId=4;req.growth={can_edit:true,pages:[{id:2294,url:URL_,case_study_active:false}]};next()},{
  fetchLive:async()=>({html:researched,final_url:URL_}),
  completeOwnerDraft:async({body})=>({statusCode:200,body:{success:true,page_id:2294,canonical_url:URL_,status:'AI_DRAFT_REVIEW_REQUIRED',source_text:'',
   draft:{sections:body.research_context.reader_task.tasks.map(t=>({task_code:t.code,h2:'About '+t.label,paragraphs:['A concept paragraph about '+t.label+' for the editor to review and rewrite where needed.']}))}}}),
  loadGapList:async()=>list,recordSelection:async({itemIds})=>{selection=itemIds},
  addToSelection:async({itemIds})=>{selection=[...selection,...itemIds.filter(x=>!selection.includes(x))]},
  recordSelectionProposal:async()=>({id:1}),recordWritten:async()=>{}});
 const req={params:{token:'owner'},query:{page_id:'2294'},body:{gap_list_id:8,item_ids:[items[0].id,items[5].id]}},
  res={statusCode:200,status(x){this.statusCode=x;return this},set(){return this},json(x){this.body=x;return this}};
 const stack=route2['/api/tracker-client/:token/growth/auto-research/write'];
 await new Promise((ok,bad)=>{const at=i=>{if(i>=stack.length)return ok();Promise.resolve(stack[i](req,res,()=>at(i+1))).then(()=>{if(i===stack.length-1)ok()},bad)};at(0)});
 assert.deepEqual(selection,[items[0].id,items[1].id,items[2].id,items[5].id],'items 1 and 2 stay selected');
 assert.deepEqual(res.body.batch.sort(),[items[0].id,items[1].id,items[2].id,items[5].id].sort(),'the stored selection is written');
});

test('the editor\'s choice in the AI pop-up is kept with the concepts (continue without AI check)',async()=>{
 const h=harness();
 const r=await h.post([items[0].id],{ai_check_choice:'WITHOUT_AI'});
 assert.equal(r.statusCode,200);assert.deepEqual(r.body.ai_check,{choice:'WITHOUT_AI',answers_counted:0});
 assert.deepEqual(h.calls.proposals[0].written.ai_check,{choice:'WITHOUT_AI',answers_counted:0},'stored with the proposal');
 const odd=await harness().post([items[0].id],{ai_check_choice:'<script>'});assert.equal(odd.body.ai_check.choice,'NOT_ASKED');
});
