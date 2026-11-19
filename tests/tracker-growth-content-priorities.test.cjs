'use strict';
// Owner 2026-11-19: Tracker Growth has the same set-up as Free Growth: the same list of what to put in the content,
// most to least important, and the same "what could be shorter or moved", from the same module.
const test=require('node:test'),assert=require('node:assert/strict');
const {buildContentPriorities,prioritiesForTrackerReport}=require('../src/growth-free/content-priorities.cjs');

test('a Tracker report gets the same list as Free Growth from the same research',()=>{
 const j=require('./fixtures/growth-report-70/report.json'),r=j.report||j;
 const cp=prioritiesForTrackerReport(r);
 const same=buildContentPriorities({summary:{decision:r.editorial_decision_gate.decision,query:r.gap_list.focus_query,gaps:r.gap_list},aiGap:null,report:r});
 assert.deepEqual(cp,same);
 assert.equal(cp.publish_allowed,false);
 assert.ok(cp.items.length>0);
 for(let i=1;i<cp.items.length;i++)assert.ok(cp.items[i-1].score>=cp.items[i].score);
});

test('the AI check of the Tracker (ai_check.gap) counts like Free Growth’s AI gap',()=>{
 const j=require('./fixtures/growth-report-70/report.json'),r=j.report||j;
 const gap={status:'READ',missing_topics:[{topic:'A topic only AI-cited pages cover',coverage:'MISSING',sites:['x.example','y.example'],examples:[]}],
  pages:[{url:'https://x.example/a',site:'x.example',cited_by:['Perplexity'],read:true}]};
 const cp=prioritiesForTrackerReport({...r,ai_check:{gap}});
 const it=cp.items.find(x=>x.title==='A topic only AI-cited pages cover');
 assert.ok(it);assert.equal(it.signals.ai_cited_sites,2);assert.deepEqual(it.signals.ai_systems,['Perplexity']);
});

test('without a topic list there is nothing to rank',()=>{
 assert.equal(prioritiesForTrackerReport({url:'https://example.com/'}),null);
 assert.equal(prioritiesForTrackerReport(null),null);
});
