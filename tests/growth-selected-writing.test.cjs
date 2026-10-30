'use strict';
// Hybrid flow: research -> gap list (all differences, AI only labels) -> owner selection -> writing for the selection only.
// Real data: the gap list is built from the research of production report 55; the "writer output" in the flagging test
// is the REAL text production report 54 accepted (with its invented "Search Engine Journal ... 68%" sentence).
const test=require('node:test'),assert=require('node:assert/strict');
const {buildGapList}=require('../src/growth-gap-list.cjs');
const {writingRequest,reviewWritten,writeForSelection}=require('../src/growth-selected-writing.cjs');
const {applyTaskMeaning}=require('../src/growth-task-meaning.cjs');
const {normalizeDraft}=require('../src/growth-source-grounded-editor.cjs');
const {normalizeGrowthResearchContext}=require('../src/growth-editorial-research-context.cjs');
const r55=require('./fixtures/growth-report-55/research.json');
const r54=require('./fixtures/growth-report-54/decision.json').editorial_decision_gate;
const fresh=()=>JSON.parse(JSON.stringify(r55));

test('without any AI the research still gives the full list, labelled "shared words only"',()=>{
 const report=fresh();
 applyTaskMeaning(report.reader_task_coverage,{status:'JUDGE_NOT_CONFIGURED',verdicts:{}});
 const list=buildGapList(report);
 const questions=list.items.filter(x=>x.group==='QUESTION');
 assert.deepEqual(questions.map(x=>x.id).sort(),['q-task_dashbo','q-task_manual','q-task_priori'],'every candidate the page does not cover, nothing dropped');
 assert(questions.every(x=>x.ai==='AI: not judged (shared words only)'&&x.reader_question===null&&x.writable));
 assert.equal(list.items.some(x=>x.id==='q-task_traffi'),false,'what the check finds already on the page is not listed again (owner decision)');
});

test('an AI judgement only labels: "different questions" stays visible and choosable, with the reason',()=>{
 const report=fresh();
 // MODEL_ANSWER (validated earlier in growth-task-meaning.test.cjs): manual confirmed, prioritize two different questions.
 applyTaskMeaning(report.reader_task_coverage,{status:'JUDGED',verdicts:{
  task_manual:{same_question:true,reader_question:'How do I check AI citations for my keywords manually?',supporting_hosts:['blog.hubspot.com','otterly.ai'],page_answers:'NO',page_heading:null,reason:'r'},
  task_priori:{same_question:false,reason:'different questions'}}});
 const q=buildGapList(report).items.filter(x=>x.group==='QUESTION');
 assert.deepEqual(q.find(x=>x.id==='q-task_manual').title,'How do I check AI citations for my keywords manually?');
 assert.match(q.find(x=>x.id==='q-task_manual').ai,/same reader question/);
 const priori=q.find(x=>x.id==='q-task_priori');
 assert(priori&&priori.writable,'the owner can still choose it');assert.match(priori.ai,/different questions here \(different questions\)/);
 assert.equal(q.find(x=>x.id==='q-task_dashbo').ai,'AI: not judged (shared words only)','no verdict is not a rejection');
});

test('the writer gets only the selected items, with their competitor sections, and the reader question survives',()=>{
 const report=fresh();applyTaskMeaning(report.reader_task_coverage,{status:'JUDGED',verdicts:{
  task_manual:{same_question:true,reader_question:'How do I check AI citations for my keywords manually?',supporting_hosts:['blog.hubspot.com','otterly.ai'],page_answers:'NO',page_heading:null,reason:'r'}}});
 const list=buildGapList(report);
 const req=writingRequest([list.items.find(x=>x.id==='q-task_manual'),{id:'e-tables',writable:false,title:'A table'}],{targetUrl:r55.url,focusQuery:'ai citation tracker'});
 assert.equal(req.items.length,1,'page elements are not written');
 const rt=req.research_context.reader_task;
 assert.deepEqual(rt.tasks.map(t=>t.code),['task_sel0']);
 assert(req.research_context.observations.length>=2&&req.research_context.observations.every(o=>/hubspot|otterly/.test(o.competitor_url)));
 // The context passes the same normalisation the owner draft handler applies (it used to drop the reader question).
 const norm=normalizeGrowthResearchContext(req.research_context,{targetUrl:r55.url,focusQuery:'ai citation tracker'});
 assert.equal(norm.reader_task.tasks[0].reader_question,'How do I check AI citations for my keywords manually?');
 assert(norm.observations.length>=2);
});

test('doubt gives a marked concept, not nothing: report 54\'s invented statistic is flagged, not withheld',()=>{
 const raw=JSON.stringify({sections:[{task_code:'task_sel0',h2:r54.draft_heading,paragraphs:r54.proposed_text.split('\n\n')}]});
 const strict=normalizeDraft(raw,'',r54.focus_query,{requireTitle:false,taskTerms:['matter']});
 assert.equal(strict.draft,null,'the automatic path still rejects');
 const marked=normalizeDraft(raw,'',r54.focus_query,{requireTitle:false,taskTerms:['matter'],flagOnly:true});
 assert.equal(marked.status,'AI_DRAFT_FLAGGED_FOR_EDITOR');
 const req={items:[{id:'q-task_matter',title:'Why AI citation tracking matters now',writable:true,placement:null}],codeOf:new Map([['task_sel0',{id:'q-task_matter',title:'Why AI citation tracking matters now',placement:null}]])};
 const out=reviewWritten(marked,req,{sourceText:'',focusQuery:r54.focus_query});
 const s=out.sections[0];
 assert.equal(s.status,'FLAGGED_FOR_EDITOR');
 assert(s.flags.some(f=>f.code==='UNSOURCED_ATTRIBUTION'&&/Search Engine Journal/.test(f.sentence)));
 assert(s.flags.some(f=>f.code==='UNSOURCED_NUMBER'));
 assert(s.flags.some(f=>f.code==='HEADING_PROMISES_REASONS_BUT_GIVES_STEPS'));
 assert.equal(s.paragraphs.join('\n\n'),r54.proposed_text,'the text is shown in full, with the flags beside it; nothing is silently edited');
});

test('a writer failure keeps the selection and says what to do; nothing to write when only elements are chosen',async()=>{
 const item={id:'q-task_manual',title:'How do I check AI citations manually?',writable:true,examples:[]};
 const down=await writeForSelection({items:[item],targetUrl:r55.url,focusQuery:'q',generate:async()=>{throw Error('down')}});
 assert.equal(down.status,'NOT_WRITTEN');assert.match(down.reason,/Write these items yourself/);
 assert.deepEqual(down.not_written,[{item_id:'q-task_manual',title:'How do I check AI citations manually?'}]);
 assert.equal((await writeForSelection({items:[{id:'e-tables',writable:false,title:'A table'}],generate:async()=>({})})).status,'NOTHING_TO_WRITE');
});

test('each competitor section appears once: a section already under a question is not listed again on its own',()=>{
 const report=fresh();
 applyTaskMeaning(report.reader_task_coverage,{status:'JUDGE_NOT_CONFIGURED',verdicts:{}});
 const manual=report.reader_task_coverage.tasks.find(t=>t.code==='task_manual');
 // The overview (no AI grouping) lists every ranking-page section; two of them are the manual question's own sections.
 report.competitor_overview={status:'OBSERVED',ranking_pages_read:2,topics_status:'NOT_GROUPED_NO_MODEL',topics:null,
  ungrouped_sections:[...manual.competitor_support.map(s=>({host:s.host,heading:s.heading,excerpt:s.excerpt})),{host:'otterly.ai',heading:'The Reporting Dashboard',excerpt:''}],
  elements_they_have_and_this_page_lacks:[],structured_data_they_have_and_this_page_lacks:[],length:{},ranking_pages:[]};
 const list=buildGapList(report);
 const sections=list.items.filter(x=>x.group==='COMPETITOR_SECTION').map(x=>x.title);
 assert(!sections.includes(manual.competitor_support[0].heading),'already listed under the question');
 const keys=list.items.flatMap(x=>(x.examples||[]).map(e=>e.site+'|'+e.heading));
 assert.equal(new Set(keys).size,keys.length,'no competitor section twice');
});
