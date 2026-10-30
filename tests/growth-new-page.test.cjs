'use strict';
// New page from a Pre-Write brief: the same overview and gap list in new-page mode, and the overlap check with the site's
// tracked pages. Real data: the competitor headings of production report 55 (HubSpot and Otterly) and its real page
// URL. LABELLED SYNTHETIC: the second tracked page, the brief keywords and the minimal competitor HTML.
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCompetitorOverview}=require('../src/growth-competitor-overview.cjs');
const {buildGapList}=require('../src/growth-gap-list.cjs');
const {checkNewPageOverlap}=require('../src/growth-new-page-overlap.cjs');
const {writingRequest}=require('../src/growth-selected-writing.cjs');
const r55=require('./fixtures/growth-report-55/research.json');
const td=r55.reader_task_coverage.task_derivation;
const para='This section explains the subject in enough words to count as readable content for the comparison of ranking pages.';
const competitors=td.hosts.map(h=>({url:'https://'+h.host+'/guide/',html:'<html><body><article><h1>Guide</h1>'+h.headings.map(x=>'<h2>'+x+'</h2><p>'+para+' '+para+'</p>').join('')+'</article></body></html>'}));

test('overview and gap list in new-page mode: no page needed, every topic is to cover on the new page',async()=>{
 const ov=await buildCompetitorOverview({query:'ai citation tracker',ownHtml:'',newPage:true,competitors,model:null});
 assert.equal(ov.status,'OBSERVED');assert.equal(ov.new_page,true);assert.equal(ov.this_page_fingerprint,null);
 assert.equal((await buildCompetitorOverview({query:'q',ownHtml:'',competitors,model:null})).status,'NOT_ENOUGH_PAGES','without newPage an existing page is still required');
 const g=buildGapList({competitor_overview:ov,search_discovery:{target_query:'ai citation tracker'}});
 assert.equal(g.page_kind,'NEW_PAGE');
 const w=g.items.filter(x=>x.writable);
 assert(w.length>=10,'the real headings of both ranking pages');
 assert(w.every(x=>x.status==='To cover on the new page'));
 // A single ranking-page heading sharing no word with the search term is weak evidence: no section proposed.
 assert(w.every(x=>x.relevance?.status==='WEAK_EVIDENCE'?/^No section proposed: only one ranking page/.test(x.priority.suggested_action):x.priority.suggested_action==='Write a section for the new page.'));
 assert(w.some(x=>x.relevance?.status==='WEAK_EVIDENCE')&&w.some(x=>!x.relevance));
 assert.deepEqual(g.unique_content,[],'no page, no unique content');
 assert.equal(g.groups.find(x=>x.id==='MISSING_TOPIC').label,'Topics the ranking pages cover');
});

test('the writer gets the new-page mode',()=>{
 const req=writingRequest([{id:'s-1',writable:true,title:'How to Track AI Engine Citations',examples:[]}],{targetUrl:'https://contentscale.site/new/',focusQuery:'q',mode:'NEW_DISTINCT_PAGE'});
 assert.equal(req.research_context.reader_task.mode,'NEW_DISTINCT_PAGE');
 assert.equal(writingRequest([{id:'s-1',writable:true,title:'x',examples:[]}],{}).research_context.reader_task.mode,'SECTION_IMPROVEMENT');
});

test('overlap with tracked pages: same keyword, most of the keyword, and per topic',()=>{
 const site=[{id:2294,url:r55.url,keyword:'ai citation tracker'},{id:9,url:'https://contentscale.site/ai-referral-dashboards/',keyword:'ai referral dashboards'}];
 assert.equal(checkNewPageOverlap({keyword:'AI Citation Tracker',sitePages:site}).status,'EXISTING_PAGE_TARGETS_THIS_KEYWORD');
 assert.equal(checkNewPageOverlap({keyword:'free ai citation tracker',sitePages:site}).status,'POSSIBLE_OVERLAP');
 const items=[{id:'s-a',writable:true,title:'Set up custom dashboards that isolate AI referral domains',priority:{why:[]},recommended:true},
  {id:'s-b',writable:true,title:'Understand the Attribution Gaps',priority:{why:[]}}];
 const out=checkNewPageOverlap({keyword:'chatgpt visibility',sitePages:site,items});
 assert.equal(out.status,'NO_OVERLAP_FOUND');
 assert.deepEqual(items[0].existing_page_overlap.map(p=>p.page_id),[9]);assert.equal(items[0].recommended,undefined,'not recommended when a tracked page may cover it');
 assert.match(items[0].priority.why.at(-1),/an existing page may already cover it/);
 assert.equal(items[1].existing_page_overlap,undefined);
});
