'use strict';
// Competitor overview for the editor ("what do the ranking pages have that we do not").
// - Topic grouping is tested on the REAL headings of production report 55 (HubSpot and Otterly vs page 2294). The model
//   answers are hand-written test inputs (MODEL_ANSWER): they test validation, not the model's judgement.
// - The HTML element reader is tested on small hand-written HTML snippets (PARSER_INPUT): parser tests, not research data.
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCompetitorOverview,pageElements,compareElements,validateTopics}=require('../src/growth-competitor-overview.cjs');
const r55=require('./fixtures/growth-report-55/research.json');
const td=r55.reader_task_coverage.task_derivation;
const competitors=td.hosts.map((h,i)=>({host:h.host,serp_position:[7,10][i],sections:h.headings.map(x=>({heading:x,excerpt:''}))}));
const page=r55.reader_task_coverage.destination_sections.map(s=>({heading:s.heading}));

test('topics: only real ranking-page headings and real page headings are accepted; nothing is dropped',()=>{
 // MODEL_ANSWER
 const answer={topics:[
  {topic:'What an AI citation is and how it differs from a mention',sections:[{host:'blog.hubspot.com',heading:'What are AI citations?'},{host:'blog.hubspot.com',heading:'What counts as an AI mention vs an AI citation?'}],page_covers:'PARTLY',page_heading:'🔍 What Is an AI Citation Tracker? (Beyond Basic Monitoring)'},
  {topic:'Why tracking AI citations matters now',sections:[{host:'otterly.ai',heading:'Why AI Citation Tracking Matters Now'}],page_covers:'NO',page_heading:null},
  {topic:'Invented topic',sections:[{host:'invented.example',heading:'Not a real heading'}],page_covers:'NO',page_heading:null},
  {topic:'Real section, invented page heading',sections:[{host:'otterly.ai',heading:'The Two Layers of AI Citation Tracking'}],page_covers:'YES',page_heading:'A heading this page does not have'}]};
 const v=validateTopics(JSON.stringify(answer),competitors,page);
 assert.deepEqual(v.topics.map(t=>t.topic),['Why tracking AI citations matters now','What an AI citation is and how it differs from a mention','Real section, invented page heading'],'invented topic dropped; gaps first');
 assert.equal(v.topics.find(t=>t.topic==='Real section, invented page heading').this_page,'UNKNOWN','an invented page heading never counts as covered');
 assert.equal(v.topics[0].sections[0].position,10,'the SERP position travels with the section');
 const all=competitors.reduce((n,c)=>n+c.sections.length,0),grouped=v.topics.reduce((n,t)=>n+t.sections.length,0);
 assert.equal(grouped+v.ungrouped_sections.length,all,'every ranking-page heading is either grouped or listed');
 assert.equal(validateTopics('not json',competitors,page),null);
});

test('page elements: what most ranking pages have and this page lacks (PARSER_INPUT)',()=>{
 const rich='<main><h1>T</h1><h2>What is it?</h2><p>'+'word '.repeat(300)+'</p><h2>How does it work?</h2><table><tr><td>a</td></tr></table>'+
  '<ul><li>a</li><li>b</li><li>c</li></ul><h2>FAQ</h2><p>x</p><iframe src="https://www.youtube.com/embed/x"></iframe><time datetime="2026-01-01">1 Jan</time>'+
  '<script type="application/ld+json">{"@type":"FAQPage"}</script></main>';
 const plain='<main><h1>T</h1><h2>About</h2><p>'+'word '.repeat(120)+'</p></main>';
 const e=pageElements(rich);
 assert.equal(e.faq,true);assert.equal(e.tables,1);assert.equal(e.lists,1);assert.equal(e.video,true);assert.equal(e.date,true);
 assert.deepEqual(e.structured_data,['FAQPage']);assert.equal(e.question_headings,2);
 const cmp=compareElements(pageElements(plain),[{elements:e},{elements:pageElements(rich)},{elements:pageElements(plain)}]);
 assert.deepEqual(cmp.elements_they_have_and_this_page_lacks.map(f=>f.key).sort(),['date','faq','lists','question_headings','tables','video']);
 assert.deepEqual(cmp.structured_data_they_have_and_this_page_lacks,[{type:'FAQPage',ranking_pages_with_it:2,of:3}]);
 // An element on only one of three ranking pages is not reported as something "they" have.
 assert.deepEqual(compareElements(pageElements(plain),[{elements:e},{elements:pageElements(plain)},{elements:pageElements(plain)}]).elements_they_have_and_this_page_lacks,[]);
});

test('without the model the editor still gets every ranking-page section, marked as not grouped (PARSER_INPUT)',async()=>{
 const comp='<main><h1>Guide</h1><h2>How to check AI citations by hand</h2><p>'+'Open each AI engine and enter the same prompt, then record the cited links. '.repeat(4)+'</p>'+
  '<h2>Contact us</h2><p>'+'Call our team today for a free quote and we will help you. '.repeat(4)+'</p></main>';
 const own='<main><h1>Own</h1><h2>What it is</h2><p>'+'An explanation of the subject for readers of this page. '.repeat(5)+'</p></main>';
 const o=await buildCompetitorOverview({query:'ai citation tracker',ownUrl:'https://own.example/x',ownHtml:own,
  competitors:[{url:'https://a.example/g',html:comp,serp_position:3},{url:'https://b.example/g',html:comp,serp_position:5}],model:null});
 assert.equal(o.status,'OBSERVED');assert.equal(o.topics_status,'NOT_GROUPED_NO_MODEL');assert.equal(o.topics,null);
 assert.deepEqual(o.ungrouped_sections.map(s=>s.host+'|'+s.heading),['a.example|How to check AI citations by hand','b.example|How to check AI citations by hand'],'contact/sales sections are left out');
 const failing=await buildCompetitorOverview({query:'q',ownUrl:'https://own.example/x',ownHtml:own,competitors:[{url:'https://a.example/g',html:comp}],
  model:{model:'t',call:async()=>{throw Error('down')}}});
 assert.equal(failing.topics_status,'NOT_GROUPED_MODEL_UNAVAILABLE');assert.equal(failing.ungrouped_sections.length,1);
});

test('standalone check: every difference becomes one choosable item, grouped by status (real report 55 headings)',()=>{
 const {gapList}=require('../src/growth-free/summary.cjs');
 // MODEL_ANSWER (grouping only)
 const v=validateTopics(JSON.stringify({topics:[
  {topic:'Why tracking AI citations matters now',sections:[{host:'otterly.ai',heading:'Why AI Citation Tracking Matters Now'}],page_covers:'NO',page_heading:null},
  {topic:'What an AI citation is',sections:[{host:'blog.hubspot.com',heading:'What are AI citations?'}],page_covers:'PARTLY',page_heading:'🔍 What Is an AI Citation Tracker? (Beyond Basic Monitoring)'},
  {topic:'Covered topic',sections:[{host:'otterly.ai',heading:'The Two Layers of AI Citation Tracking'}],page_covers:'YES',page_heading:'⚙️ How AI Citation Trackers Actually Work'}]}),competitors,page);
 const ov={status:'OBSERVED',ranking_pages_read:2,topics_status:'GROUPED',topics:v.topics,ungrouped_sections:v.ungrouped_sections,
  elements_they_have_and_this_page_lacks:[{key:'tables',label:'A table (comparison or overview)',ranking_pages_with_it:2,of:2}],structured_data_they_have_and_this_page_lacks:[],
  length:{this_page_words:4301,ranking_pages_median_words:2900},ranking_pages:[]};
 const g=gapList(ov);
 const groups=g.items.map(x=>x.group);
 assert.deepEqual([...new Set(groups)],['MISSING_TOPIC','PARTIAL_TOPIC','COMPETITOR_SECTION','PAGE_ELEMENT'],'a covered topic is not a gap; no length gap when this page is longer');
 assert.equal(groups.filter(x=>x==='COMPETITOR_SECTION').length,v.ungrouped_sections.length,'sections the AI did not place in a topic stay choosable');
 assert(g.items.filter(x=>x.group==='PAGE_ELEMENT').every(x=>x.writable===false),'page elements are added by the editor, not written');
 assert.equal(g.items[1].your_section,'🔍 What Is an AI Citation Tracker? (Beyond Basic Monitoring)');
 assert(new Set(g.items.map(x=>x.id)).size===g.items.length,'ids are unique');
 assert.equal(gapList(null).items.length,0);
});
